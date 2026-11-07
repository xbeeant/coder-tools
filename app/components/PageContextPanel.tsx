import { ArrowDownToLine, Copy, RefreshCw, ScanSearch, ShieldAlert, X } from 'lucide-react';
import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { fillInputField, type InputFieldInfo, listInputFields } from '../lib/input-snapshot';
import {
  type ContextItem,
  canUseExtensionFeatures,
  capturePageContext,
  displayValue,
  EXTENSION_UNAVAILABLE_HINT,
  flattenContext,
  type PageContext,
  type SelectionPayload,
  selectionAsItems,
} from '../lib/page-context';
import { Button } from './ui/button';
import { Select } from './ui/field';
import { Input } from './ui/input';
import { Note, Section } from './ui/panel';
import { copyText } from './ui/result';

export interface PageContextPanelProps {
  open: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  /** 包裹工具组件的稳定容器 */
  containerRef: RefObject<HTMLElement | null>;
  /** 右键菜单送达的最新选中文本 */
  selection: SelectionPayload | null;
}

const MAX_VISIBLE = 60;

export function PageContextPanel({ open, onClose, onNotify, containerRef, selection }: PageContextPanelProps) {
  const [data, setData] = useState<PageContext | null>(null);
  const [extraItems, setExtraItems] = useState<ContextItem[]>([]);
  const [fields, setFields] = useState<InputFieldInfo[]>([]);
  const [targetKey, setTargetKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const canCapture = canUseExtensionFeatures();

  const refreshFields = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = listInputFields(container);
    setFields(next);
    setTargetKey((prev) => (next.some((field) => field.key === prev) ? prev : (next[0]?.key ?? '')));
  }, [containerRef]);

  useEffect(() => {
    if (!open) return;
    refreshFields();
    // 懒加载的工具组件可能稍晚才挂载，补一次重读。
    const timer = window.setTimeout(refreshFields, 300);
    return () => window.clearTimeout(timer);
  }, [open, refreshFields]);

  useEffect(() => {
    if (open && selection) setExtraItems(selectionAsItems(selection));
  }, [open, selection]);

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

  const items = useMemo(() => [...extraItems, ...(data ? flattenContext(data) : [])], [extraItems, data]);

  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    const matched = keyword
      ? items.filter((item) => `${item.group} ${item.label} ${item.value}`.toLowerCase().includes(keyword))
      : items;
    return matched.slice(0, MAX_VISIBLE);
  }, [items, filter]);

  if (!open) return null;

  const handleCapture = async () => {
    setBusy(true);
    setError('');
    const result = await capturePageContext();
    setBusy(false);
    if (result.ok) {
      setData(result.data);
      refreshFields();
      onNotify('已采集页面上下文，仅保存在内存中');
    } else {
      setError(result.error);
      onNotify(result.error, 'error');
    }
  };

  const handleFill = (item: ContextItem) => {
    const container = containerRef.current;
    if (!container || !targetKey) {
      onNotify('当前工具没有可填入的输入框，试试点「重新读取输入框」', 'error');
      return;
    }
    const ok = fillInputField(container, targetKey, item.value);
    onNotify(ok ? `已把「${item.label}」填入所选输入框` : '填入失败，请重新读取输入框后重试', ok ? 'success' : 'error');
  };

  const handleCopy = (item: ContextItem) => {
    copyText(item.value);
    onNotify(item.sensitive ? '已复制原始值，请注意不要在公开场合粘贴' : `已复制「${item.label}」`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto p-4 sm:p-8">
      <button type="button" aria-label="关闭页面上下文" className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="页面上下文"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <ScanSearch className="size-4 text-muted-foreground" />
          <h2 className="flex-1 text-sm font-semibold">页面上下文</h2>
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {data ? `${items.length} 项` : '尚未采集'}
          </span>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="关闭页面上下文">
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 scrollbar-thin">
          {!canCapture && (
            <Note tone="info" title="Web 版不可用">
              {EXTENSION_UNAVAILABLE_HINT}
            </Note>
          )}

          <Section title="采集">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void handleCapture()} disabled={!canCapture || busy}>
                <ScanSearch className="size-3.5" />
                {busy ? '采集中…' : '采集当前网页'}
              </Button>
              <Button size="sm" variant="outline" onClick={refreshFields}>
                <RefreshCw className="size-3.5" />
                重新读取输入框
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              采集目标是你在目标网页上右键使用 Coder Tools 菜单、或点击扩展图标时所在的标签页。
              数据只在当前页面内存中，刷新即消失，不会写入本地存储或备份文件。
            </p>
            {error && (
              <Note tone="danger" title="采集失败">
                {error}
              </Note>
            )}
          </Section>

          <Section title="填入目标" description="选定一个当前工具的输入框，下面每一条都可以直接送进去。">
            <Select
              ariaLabel="填入目标输入框"
              value={targetKey}
              onChange={setTargetKey}
              options={
                fields.length > 0
                  ? fields.map((field) => ({
                      value: field.key,
                      label: field.preview ? `${field.label}（${field.preview}）` : field.label,
                    }))
                  : [{ value: '', label: '没有检测到可填入的输入框' }]
              }
              hint={`检测到 ${fields.length} 个可填字段；切换工具后请点「重新读取输入框」。`}
            />
          </Section>

          <Section title="可用条目" description="敏感字段默认打码，复制按钮取得的是原始值。">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="筛选条目…"
              className="h-8 text-xs"
              aria-label="筛选上下文条目"
            />
            {visible.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted-foreground">
                {items.length === 0 ? '还没有数据，先点「采集当前网页」或用右键菜单送达选中文本' : '没有匹配的条目'}
              </p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-auto scrollbar-thin">
                {visible.map((item) => (
                  <li key={item.id} className="rounded-md border px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.group}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{item.label}</span>
                      {item.sensitive && <ShieldAlert className="size-3 shrink-0 text-amber-600" />}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{displayValue(item)}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => handleCopy(item)}
                      >
                        <Copy className="size-3" />
                        {item.sensitive ? '复制原始值' : '复制'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => handleFill(item)}
                      >
                        <ArrowDownToLine className="size-3" />
                        填入
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {items.length > MAX_VISIBLE && (
              <p className="text-[11px] text-muted-foreground">
                仅显示前 {MAX_VISIBLE} 条，共 {items.length} 条；可用上方筛选框缩小范围。
              </p>
            )}
          </Section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
          <span className="text-[11px] text-muted-foreground">快捷键：Esc 关闭</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
