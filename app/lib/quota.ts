/**
 * 本地存储配额治理。
 *
 * localStorage 是「同源共享」的：笔记、剪贴板、保险库、输入快照、请求历史、
 * 收藏与偏好挤在同一个约 5 MB 的空间里。之前各处写入失败都静默 catch，
 * 用户只会看到「刷新后内容不见了」却不知道原因。
 *
 * 这里统一做三件事：
 * 1. 估算整个同源 origin（不只工具箱前缀）的占用，给出配额水位；
 * 2. 写入前预检，接近上限时给出可操作的错误，而不是静默丢数据；
 * 3. 把浏览器抛出的 QuotaExceededError 翻译成中文提示。
 *
 * 估算口径：浏览器按 UTF-16 码元计配额，保守地按每字符 2 字节计算键 + 值。
 * 这是个估算值，用于提前预警，不追求和浏览器内部计数完全一致。
 */

/** 与 workspace.ts 保持一致；这里不 import workspace，便于在 Node/Bun 环境里单测。 */
const STORAGE_PREFIX = 'coder-tools:';

export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;
/** 写入预检的软上限，留出余量避免刚好卡在浏览器硬配额上。 */
export const SAFE_WRITE_RATIO = 0.9;
/** 设置面板开始提示的水位。 */
export const WARN_RATIO = 0.75;

export type QuotaLevel = 'ok' | 'warn' | 'danger' | 'unavailable';

export interface QuotaInfo {
  available: boolean;
  usedBytes: number;
  budgetBytes: number;
  freeBytes: number;
  ratio: number;
  level: QuotaLevel;
  entryCount: number;
  /** 其中属于工具箱的占用，方便判断该清理哪部分。 */
  toolboxBytes: number;
}

export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** 单个键值对的估算字节数（UTF-16，键与值都计入）。 */
export function entryBytes(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

export function quotaLevel(ratio: number): QuotaLevel {
  if (ratio >= SAFE_WRITE_RATIO) return 'danger';
  if (ratio >= WARN_RATIO) return 'warn';
  return 'ok';
}

/** 纯函数：覆盖某个键之后是否会越过软上限，便于单测。 */
export function wouldExceed(
  usedBytes: number,
  existingBytes: number,
  newBytes: number,
  budgetBytes = STORAGE_BUDGET_BYTES,
  safeRatio = SAFE_WRITE_RATIO,
): boolean {
  return usedBytes - Math.max(0, existingBytes) + Math.max(0, newBytes) > budgetBytes * safeRatio;
}

const UNAVAILABLE: QuotaInfo = {
  available: false,
  usedBytes: 0,
  budgetBytes: STORAGE_BUDGET_BYTES,
  freeBytes: 0,
  ratio: 0,
  level: 'unavailable',
  entryCount: 0,
  toolboxBytes: 0,
};

/** 枚举整个 origin 的 localStorage，估算占用与水位。 */
export function readQuota(): QuotaInfo {
  try {
    if (typeof localStorage === 'undefined') return { ...UNAVAILABLE };
    let usedBytes = 0;
    let toolboxBytes = 0;
    let entryCount = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? '';
      const bytes = entryBytes(key, value);
      usedBytes += bytes;
      if (key.startsWith(STORAGE_PREFIX)) toolboxBytes += bytes;
      entryCount += 1;
    }
    const ratio = Math.min(usedBytes / STORAGE_BUDGET_BYTES, 1);
    return {
      available: true,
      usedBytes,
      budgetBytes: STORAGE_BUDGET_BYTES,
      freeBytes: Math.max(0, STORAGE_BUDGET_BYTES - usedBytes),
      ratio,
      level: quotaLevel(ratio),
      entryCount,
      toolboxBytes,
    };
  } catch {
    return { ...UNAVAILABLE };
  }
}

/** 面向用户的配额说明；返回 null 表示无需提示。 */
export function quotaHint(info: QuotaInfo): string | null {
  if (!info.available) return '浏览器禁用了本地存储（可能处于隐私模式），所有工具数据只保留在当前页面。';
  if (info.level === 'danger') {
    return '本地存储已接近 5 MB 上限，自动保存和请求历史可能写入失败。建议在下方清理输入快照或旧数据，并导出一份备份。';
  }
  if (info.level === 'warn') {
    return '本地存储使用超过 75%，建议清理不再需要的输入快照或工具数据。';
  }
  return null;
}

function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|exceed/i.test(`${name} ${message}`)) {
    return '本地存储空间不足，本次内容没有保存。请在「设置 → 数据管理」清理旧数据或导出备份后重试。';
  }
  return `本地存储写入失败（${message}），本次内容没有保存。`;
}

/**
 * 带预检的 localStorage.setItem。
 * 覆盖已有键时会先减去旧值体积，避免「每次改写都被误判为超限」。
 */
export function safeSetItem(key: string, value: string): WriteResult {
  const info = readQuota();
  if (!info.available) {
    return { ok: false, error: '浏览器禁用了本地存储，本次内容没有保存。' };
  }

  let existingBytes = 0;
  try {
    const existing = localStorage.getItem(key);
    if (existing !== null) existingBytes = entryBytes(key, existing);
  } catch {
    return { ok: false, error: '无法读取本地存储，本次内容没有保存。' };
  }

  const newBytes = entryBytes(key, value);
  if (wouldExceed(info.usedBytes, existingBytes, newBytes)) {
    return {
      ok: false,
      error: `本地存储接近 5 MB 上限（已用 ${(info.usedBytes / 1024 / 1024).toFixed(2)} MB），本次内容没有保存。请清理旧数据后重试。`,
    };
  }

  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeStorageError(error) };
  }
}
