/**
 * 工作区数据快照。
 *
 * 工具箱所有本地数据都使用 `coder-tools:` 前缀存 localStorage：收藏、最近使用、
 * 偏好设置、输入快照，以及各工具自己持久化的笔记 / 剪贴板 / 保险库等。
 * 这里提供统一的枚举、导出、导入与清理，供设置页使用。
 *
 * 安全约定：
 * - 只读写 `coder-tools:` 前缀的键，绝不触碰同源下其他应用的数据；
 * - 导入时做格式、版本、键前缀、类型与体积校验，拒绝任意 JSON 注入；
 * - 导入后 React 内存中的 state 不会自动更新，调用方需提示用户刷新页面。
 */

import { safeSetItem } from './quota';
import { RUNTIME_LABEL } from './runtime';

export const STORAGE_PREFIX = 'coder-tools:';
export const SNAPSHOT_FORMAT = 'coder-tools-workspace';
/** 单个快照的上限，防止一次导入塞满 localStorage。 */
const MAX_SNAPSHOT_CHARS = 8_000_000;

export interface WorkspaceSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  exportedAt: string;
  runtime: string;
  entries: Record<string, string>;
}

export interface WorkspaceEntry {
  key: string;
  label: string;
  bytes: number;
}

const KNOWN_LABELS: Record<string, string> = {
  'coder-tools:favorites': '收藏的工具',
  'coder-tools:recent': '最近使用',
  'coder-tools:settings': '偏好设置',
  'coder-tools:theme': '主题（旧版键）',
  'coder-tools:sidebar-tab': '侧边栏标签',
  'coder-tools:sidebar-open': '侧边栏开关',
  'coder-tools:last-tool': '上次打开的工具',
};

const INPUT_PREFIX = `${STORAGE_PREFIX}input:`;

function labelOf(key: string): string {
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key];
  if (key.startsWith(INPUT_PREFIX)) return `输入快照 · ${key.slice(INPUT_PREFIX.length)}`;
  return key.startsWith(STORAGE_PREFIX) ? key.slice(STORAGE_PREFIX.length) : key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 列出所有属于工具箱的本地数据（按 key 排序）。localStorage 不可用时返回空数组。 */
export function listWorkspaceEntries(): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const value = localStorage.getItem(key) ?? '';
      entries.push({ key, label: labelOf(key), bytes: new TextEncoder().encode(value).length });
    }
  } catch {
    return [];
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export function workspaceTotalBytes(): number {
  return listWorkspaceEntries().reduce((sum, entry) => sum + entry.bytes, 0);
}

export function exportWorkspace(): WorkspaceSnapshot {
  const entries: Record<string, string> = {};
  try {
    for (const { key } of listWorkspaceEntries()) {
      const value = localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
  } catch {
    // 存储不可用时导出空快照，由调用方提示
  }
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    runtime: RUNTIME_LABEL,
    entries,
  };
}

export function snapshotToJson(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/** 触发一次浏览器下载，不需要任何扩展权限。 */
export function downloadWorkspace(): void {
  const blob = new Blob([snapshotToJson(exportWorkspace())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `coder-tools-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ParseResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string };

/** 解析并校验用户提供的备份文本。只接受本工具箱的键与字符串值。 */
export function parseWorkspace(raw: string): ParseResult {
  if (raw.length > MAX_SNAPSHOT_CHARS) return { ok: false, error: '文件过大，上限 8 MB' };

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!isRecord(data)) return { ok: false, error: '快照格式不正确' };
  if (data.format !== SNAPSHOT_FORMAT) return { ok: false, error: '不是 Coder Tools 的备份文件' };
  if (data.version !== 1) return { ok: false, error: `不支持的快照版本：${String(data.version)}` };
  if (!isRecord(data.entries)) return { ok: false, error: '快照缺少 entries 数据' };

  const entries: Record<string, string> = {};
  let total = 0;
  for (const [key, value] of Object.entries(data.entries)) {
    if (!key.startsWith(STORAGE_PREFIX) || typeof value !== 'string') continue;
    total += value.length;
    if (total > MAX_SNAPSHOT_CHARS) return { ok: false, error: '快照数据总量超过 8 MB' };
    entries[key] = value;
  }
  if (Object.keys(entries).length === 0) return { ok: false, error: '快照里没有可用的工具箱数据' };

  return {
    ok: true,
    snapshot: {
      format: SNAPSHOT_FORMAT,
      version: 1,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      runtime: typeof data.runtime === 'string' ? data.runtime : '未知',
      entries,
    },
  };
}

/** 清空所有工具箱本地数据。调用前必须由 UI 做二次确认。 */
export function clearWorkspaceStorage(): number {
  const keys = listWorkspaceEntries().map((entry) => entry.key);
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 单键失败不影响其余清理
    }
  }
  return keys.length;
}

/**
 * 导入快照。
 * - merge：只覆盖快照里出现的键，其余本地数据保留；
 * - replace：先清空全部工具箱数据再写入（需用户二次确认）。
 */
export interface ImportResult {
  count: number;
  total: number;
  /** 第一个写入失败的原因，供 UI 说明数据可能不完整。 */
  error: string | null;
}

export function importWorkspace(snapshot: WorkspaceSnapshot, mode: 'merge' | 'replace'): ImportResult {
  if (mode === 'replace') clearWorkspaceStorage();
  let count = 0;
  let error: string | null = null;
  const pairs = Object.entries(snapshot.entries);
  for (const [key, value] of pairs) {
    const result = safeSetItem(key, value);
    if (result.ok) count += 1;
    else if (error === null && result.error) error = result.error;
  }
  return { count, total: pairs.length, error };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
