import { Check, Copy, Download, Keyboard, RefreshCw, RotateCcw, Settings2, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ThemeMode } from '../hooks/storage';
import { clearAllSnapshots, countSnapshots, SENSITIVE_TOOL_IDS, skipReason } from '../lib/input-snapshot';
import { type QuotaInfo, quotaHint, readQuota } from '../lib/quota';
import { RUNTIME_LABEL, shareableUrl } from '../lib/runtime';
import {
  clearWorkspaceStorage,
  downloadWorkspace,
  exportWorkspace,
  formatBytes,
  importWorkspace,
  listWorkspaceEntries,
  parseWorkspace,
  snapshotToJson,
  type WorkspaceEntry,
  workspaceTotalBytes,
} from '../lib/workspace';
import { Button } from './ui/button';
import { Checkbox, Select } from './ui/field';
import { Note, Section } from './ui/panel';
import { copyText } from './ui/result';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

export interface ShortcutDef {
  keys: string;
  label: string;
}

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  shortcuts: ShortcutDef[];
  activeToolId: string;
  toolCount: number;
}

type SettingsTab = 'general' | 'data' | 'about';

const THEME_OPTIONS = [
  { value: 'system', label: '跟随系统', group: '外观' },
  { value: 'light', label: '浅色', group: '外观' },
  { value: 'dark', label: '深色', group: '外观' },
];

const IMPORT_OPTIONS = [
  { value: 'merge', label: '合并导入（保留现有数据）' },
  { value: 'replace', label: '覆盖导入（先清空本地数据）' },
];

export function SettingsDialog({
  open,
  onClose,
  settings,
  onUpdate,
  onReset,
  onNotify,
  shortcuts,
  activeToolId,
  toolCount,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [quota, setQuota] = useState<QuotaInfo>(() => readQuota());
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmed, setConfirmed] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setEntries(listWorkspaceEntries());
    setTotalBytes(workspaceTotalBytes());
    setQuota(readQuota());
    setSnapshotCount(countSnapshots());
  }, []);

  useEffect(() => {
    if (open) {
      refresh();
      setConfirmed(false);
      setImportText('');
    }
  }, [open, refresh]);

  // 设置面板打开时，Esc 优先关闭面板而不是清空搜索。
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ''));
    reader.onerror = () => onNotify('读取文件失败', 'error');
    void reader.readAsText(file);
  };

  const doImport = () => {
    const parsed = parseWorkspace(importText);
    if (!parsed.ok) {
      onNotify(parsed.error, 'error');
      return;
    }
    if (importMode === 'replace' && !confirmed) {
      onNotify('覆盖导入需要先勾选下方确认项', 'error');
      return;
    }
    const result = importWorkspace(parsed.snapshot, importMode);
    setImportText('');
    setConfirmed(false);
    setNeedsReload(true);
    refresh();
    if (result.error) {
      onNotify(`仅导入 ${result.count}/${result.total} 项：${result.error}`, 'error');
    } else {
      onNotify(`已导入 ${result.count} 项数据，刷新页面后生效`, 'success');
    }
  };

  const doClear = () => {
    if (!confirmed) {
      onNotify('请先勾选确认项', 'error');
      return;
    }
    const count = clearWorkspaceStorage();
    setConfirmed(false);
    setNeedsReload(true);
    refresh();
    onNotify(`已清除 ${count} 项本地数据，刷新页面后生效`, 'success');
  };

  const doClearSnapshots = () => {
    const count = clearAllSnapshots();
    refresh();
    onNotify(`已清除 ${count} 个工具的输入快照`, 'success');
  };

  const currentSkipReason = skipReason(activeToolId);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto p-4 sm:p-8">
      <button type="button" aria-label="关闭设置" className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Settings2 className="size-4 text-muted-foreground" />
          <h2 className="flex-1 text-sm font-semibold">设置</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{RUNTIME_LABEL}</span>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="关闭设置">
            <X className="size-4" />
          </Button>
        </header>

        <div className="shrink-0 border-b px-4 py-2">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value === 'data' ? 'data' : value === 'about' ? 'about' : 'general')}
          >
            <TabsList className="h-8 w-full">
              <TabsTrigger value="general" active={tab === 'general'} className="flex-1">
                常规
              </TabsTrigger>
              <TabsTrigger value="data" active={tab === 'data'} className="flex-1">
                数据管理
              </TabsTrigger>
              <TabsTrigger value="about" active={tab === 'about'} className="flex-1">
                快捷键与关于
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 scrollbar-thin">
          {needsReload && (
            <Note tone="warn" title="数据已变更">
              导入或清空后需要刷新页面，内存中的状态才会与新数据一致。
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                  <RefreshCw className="size-3.5" />
                  立即刷新
                </Button>
              </div>
            </Note>
          )}

          {tab === 'general' && (
            <>
              <Section title="外观">
                <Select
                  label="主题"
                  value={settings.theme}
                  onChange={(value) => onUpdate({ theme: value as ThemeMode })}
                  options={THEME_OPTIONS}
                  hint="「跟随系统」会随操作系统的深浅色设置自动切换。"
                />
              </Section>

              <Section title="行为" description="所有设置只保存在本机浏览器中，不会上传。">
                <div className="grid gap-2.5">
                  <Checkbox
                    label="自动保存 / 恢复工具输入"
                    checked={settings.autoSaveInputs}
                    onChange={(checked) => onUpdate({ autoSaveInputs: checked })}
                    hint="切换工具或重开页面时，自动带回上次填写的文本。仅保存文本框与下拉框，不保存开关状态。"
                  />
                  <Checkbox
                    label="启动时回到上次使用的工具"
                    checked={settings.restoreLastTool}
                    onChange={(checked) => onUpdate({ restoreLastTool: checked })}
                    hint="地址栏带 #/tool/... 时以地址栏为准。关闭后每次打开都会进入默认工具。"
                  />
                  <Checkbox
                    label="记住侧边栏展开状态"
                    checked={settings.rememberSidebar}
                    onChange={(checked) => onUpdate({ rememberSidebar: checked })}
                    hint="关闭后每次打开都默认展开侧边栏。"
                  />
                </div>
                <Note tone="info" title="输入保存的安全边界">
                  涉及密码、密钥、token、私钥的工具（共 {SENSITIVE_TOOL_IDS.size} 个）完全不参与自动保存； 字段名称含
                  password / secret / token 等关键词的输入框也会被跳过。已有独立本地存储的笔记、
                  剪贴板、保险库等不会重复保存。当前工具：
                  {currentSkipReason ? ` ${currentSkipReason}。` : ' 会参与自动保存。'}
                </Note>
              </Section>

              <Section title="维护" description="重置偏好或清理已保存的输入快照。">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={doClearSnapshots} disabled={snapshotCount === 0}>
                    <Trash2 className="size-3.5" />
                    清除输入快照（{snapshotCount}）
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onReset();
                      onNotify('偏好设置已恢复默认', 'success');
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    恢复默认设置
                  </Button>
                </div>
              </Section>
            </>
          )}

          {tab === 'data' && (
            <>
              <Section
                title="本地存储配额"
                description="浏览器同源约 5 MB，由收藏、偏好、输入快照、笔记与请求历史共用；估算值按 UTF-16 计算。"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">
                      {quota.available
                        ? `共 ${quota.entryCount} 项 · 工具箱占 ${formatBytes(quota.toolboxBytes)}`
                        : '存储不可用'}
                    </span>
                    <span className="font-mono">
                      {formatBytes(quota.usedBytes)} / {formatBytes(quota.budgetBytes)}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="本地存储占用"
                    aria-valuenow={Math.round(quota.ratio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        quota.level === 'danger'
                          ? 'bg-destructive'
                          : quota.level === 'warn'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(quota.available ? 1 : 0, quota.ratio * 100)}%` }}
                    />
                  </div>
                  {quotaHint(quota) !== null && (
                    <Note tone={quota.level === 'danger' ? 'danger' : 'warn'}>{quotaHint(quota)}</Note>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    写入前会预检剩余空间；接近上限时工具会明确提示「本次内容没有保存」，不再静默丢失。
                  </p>
                </div>
              </Section>

              <Section
                title="本地数据"
                description={`共 ${entries.length} 项，占用 ${formatBytes(totalBytes)}。导出文件包含收藏、偏好、输入快照以及各工具自行保存的数据。`}
              >
                <div className="max-h-40 overflow-auto rounded-md border scrollbar-thin">
                  {entries.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">暂无本地数据</p>
                  ) : (
                    <ul className="divide-y">
                      {entries.slice(0, 40).map((entry) => (
                        <li key={entry.key} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                          <span className="shrink-0 font-mono text-muted-foreground">{formatBytes(entry.bytes)}</span>
                        </li>
                      ))}
                      {entries.length > 40 && (
                        <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                          还有 {entries.length - 40} 项未列出
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      downloadWorkspace();
                      onNotify('备份文件已开始下载', 'success');
                    }}
                  >
                    <Download className="size-3.5" />
                    导出为 JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      copyText(snapshotToJson(exportWorkspace()));
                      onNotify('备份 JSON 已复制到剪贴板', 'success');
                    }}
                  >
                    <Copy className="size-3.5" />
                    复制备份 JSON
                  </Button>
                </div>
              </Section>

              <Section title="导入备份" description="选择备份文件，或直接把 JSON 内容粘贴到下框。">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    handleFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload className="size-3.5" />
                    选择文件
                  </Button>
                  <Select
                    ariaLabel="导入方式"
                    value={importMode}
                    onChange={(value) => setImportMode(value === 'replace' ? 'replace' : 'merge')}
                    options={IMPORT_OPTIONS}
                    layout="horizontal"
                    className="min-w-52"
                  />
                </div>
                <Textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="在此粘贴 coder-tools-workspace 备份 JSON…"
                  className="min-h-24 font-mono text-[11px]"
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={doImport} disabled={!importText.trim()}>
                    <Check className="size-3.5" />
                    导入
                  </Button>
                  {importText && (
                    <Button size="sm" variant="ghost" onClick={() => setImportText('')}>
                      清空输入
                    </Button>
                  )}
                </div>
                <Note tone="info">
                  导入只接受 <code>coder-tools:</code> 前缀的键，会校验格式、版本与体积，不会覆盖其它站点的数据。
                </Note>
              </Section>

              <Section title="清空本地数据">
                <Note tone="danger" title="此操作不可撤销">
                  会删除收藏、最近使用、偏好设置、输入快照，以及笔记 / 剪贴板 / 保险库等工具自行保存的全部本地数据。
                  建议先导出备份。共 {entries.length} 项将被删除。
                </Note>
                <Checkbox
                  label="我已了解风险，确认清空"
                  checked={confirmed}
                  onChange={setConfirmed}
                  hint="覆盖导入同样需要勾选此项。"
                />
                <Button size="sm" variant="destructive" onClick={doClear} disabled={!confirmed}>
                  <Trash2 className="size-3.5" />
                  清空全部本地数据
                </Button>
              </Section>
            </>
          )}

          {tab === 'about' && (
            <>
              <Section title="键盘快捷键">
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {shortcuts.map((item) => (
                    <li key={item.keys} className="flex items-center gap-2 text-[11px]">
                      <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {item.keys}
                      </kbd>
                      <span className="text-muted-foreground">{item.label}</span>
                    </li>
                  ))}
                </ul>
                <Note tone="info">macOS 用 ⌘，Windows / Linux 用 Ctrl。</Note>
              </Section>

              <Section title="关于">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px]">
                  <dt className="text-muted-foreground">运行环境</dt>
                  <dd>{RUNTIME_LABEL}</dd>
                  <dt className="text-muted-foreground">工具数量</dt>
                  <dd>{toolCount} 项</dd>
                  <dt className="text-muted-foreground">数据处理</dt>
                  <dd>全部在本地浏览器内完成，不上传任何输入内容</dd>
                  <dt className="text-muted-foreground">当前工具</dt>
                  <dd className="font-mono">{activeToolId}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      copyText(shareableUrl(activeToolId));
                      onNotify('已复制当前工具的分享链接', 'success');
                    }}
                  >
                    <Copy className="size-3.5" />
                    复制当前工具链接
                  </Button>
                </div>
              </Section>

              <Note tone="warn" title="能力边界">
                接口调试 / 抓包调试等工具是纯离线的命令与 HAR 转换器，不会真正发起网络请求； 安全扫描使用的是本地 CVE
                快照，不等同于实时漏洞库；PDF 工具不支持写入打开密码。
              </Note>
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Keyboard className="size-3.5" />⌘ / Ctrl + , 可随时打开设置
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
