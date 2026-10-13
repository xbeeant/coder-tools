import { ChevronDown, ChevronRight, CornerDownRight, Crosshair, FoldVertical, UnfoldVertical } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Button } from './button';
import { cn } from './utils';

interface ContainerPath {
  path: string;
  depth: number;
  kind: ValueKind;
}

type ValueKind = 'array' | 'object';

/** 分隔子节点路径，避免键名里含 `/` 造成路径冲突。 */
const sep = (key: string | number): string => encodeURIComponent(String(key));
const join = (path: string, key: string | number): string => `${path}/${sep(key)}`;

/** 每层缩进像素宽度：等于箭头(16px) + 间距(4px)，保证同一深度下 key 严格竖直对齐。 */
const INDENT = 20;

/** 深度遍历收集所有容器（对象/数组）的路径，返回节点总数。 */
function collectContainers(value: unknown, path: string, depth: number, out: ContainerPath[]): number {
  if (Array.isArray(value)) {
    out.push({ path, depth, kind: 'array' });
    let count = 1;
    for (let i = 0; i < value.length; i += 1) count += collectContainers(value[i], join(path, i), depth + 1, out);
    return count;
  }
  if (value !== null && typeof value === 'object') {
    out.push({ path, depth, kind: 'object' });
    let count = 1;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      count += collectContainers((value as Record<string, unknown>)[key], join(path, key), depth + 1, out);
    }
    return count;
  }
  return 1;
}

/** 账号缩进箭头与键名的固定宽度插槽，非折叠节点用空白占用以保持同级对齐。 */
function ArrowSlot({ collapsible, open }: { collapsible: boolean; open: boolean }) {
  if (!collapsible) return <span aria-hidden className="h-4 w-4 shrink-0" />;
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors',
        'group-hover/row:text-foreground',
      )}
    >
      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </span>
  );
}

/** 过长字符串截断展示，悬停可看全文。 */
function shortText(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}

/** 标量值的着色与文案。 */
function ScalarValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-sky-600 dark:text-sky-400">null</span>;
  if (typeof value === 'boolean') return <span className="text-sky-600 dark:text-sky-400">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  if (typeof value === 'string')
    return (
      <span className="text-emerald-600 dark:text-emerald-400" title={value}>
        &quot;{shortText(value)}&quot;
      </span>
    );
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function Punc({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

interface TreeNodeProps {
  path: string;
  depth: number;
  value: unknown;
  /** 顶部键名；根节点为 null。 */
  keyName: string | number | null;
  kind: ValueKind;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

function TreeNode({ path, depth, value, keyName, kind, collapsed, onToggle, onSelect }: TreeNodeProps) {
  const isArray = Array.isArray(value);
  const isObject = !isArray && value !== null && typeof value === 'object';
  const isContainer = isArray || isObject;
  const size = isArray ? value.length : isObject ? Object.keys(value as Record<string, unknown>).length : 0;
  const collapsible = isContainer && size > 0;
  const open = !collapsed.has(path);

  const keyColon = keyName !== null && (
    <>
      {kind === 'array' ? (
        <span className="text-muted-foreground">{String(keyName)}</span>
      ) : (
        <span className="text-fuchsia-600 dark:text-fuchsia-400">{JSON.stringify(String(keyName))}</span>
      )}
    </>
  );

  const rowContent = (
    <>
      <ArrowSlot collapsible={collapsible} open={open} />
      {keyColon}
      {keyName !== null && <Punc>:</Punc>}
      {!isContainer || !collapsible ? (
        isContainer ? (
          <Punc>{isArray ? '[]' : '{}'}</Punc>
        ) : (
          <ScalarValue value={value} />
        )
      ) : open ? (
        <Punc>{isArray ? '[' : '{'}</Punc>
      ) : (
        <>
          <Punc>{isArray ? '[' : '{'}</Punc>
          <span className="text-muted-foreground/70">
            · {size} {isArray ? '个元素' : '个字段'}
          </span>
          <Punc>{isArray ? ']' : '}'}</Punc>
        </>
      )}
    </>
  );

  const pad = depth * INDENT;
  const rowClass = cn(
    'group/row flex w-full cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm py-px pr-1 text-left',
    'hover:bg-accent/50',
  );

  const row = collapsible ? (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? '折叠此节点' : '展开此节点'}
      onClick={() => {
        onToggle(path);
        onSelect(path);
      }}
      data-path={path}
      style={{ paddingLeft: pad }}
      className={cn(rowClass, 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
    >
      {rowContent}
    </button>
  ) : (
    <div className={rowClass} data-path={path} style={{ paddingLeft: pad }} onClick={() => onSelect(path)}>
      {rowContent}
    </div>
  );

  // 标量（含字符串）必须在此处短路，否则对字符串执行 Object.entries 会按字符
  // 索引展开成几乎无穷的子树；null 等值直接走 Object.entries 也会抛错。
  if (!open || !isContainer) return row;

  const entries: { key: string | number; value: unknown }[] = isArray
    ? value.map((item, index) => ({ key: index, value: item }))
    : Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));

  return (
    <>
      {row}
      {entries.map((entry) => (
        <TreeNode
          key={join(path, entry.key)}
          path={join(path, entry.key)}
          depth={depth + 1}
          value={entry.value}
          keyName={entry.key}
          kind={isArray ? 'array' : 'object'}
          collapsed={collapsed}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
      <div className="flex items-center gap-1 py-px pr-1" style={{ paddingLeft: pad }}>
        <span aria-hidden className="h-4 w-4 shrink-0" />
        <Punc>{isArray ? ']' : '}'}</Punc>
      </div>
    </>
  );
}

export interface JsonTreeProps {
  value: unknown;
  /** 该深度（含）以内的容器默认展开，超出部分折叠。 */
  defaultExpandedDepth?: number;
  /** 非 fill 模式下树体高度类，如 max-h-96。 */
  maxHeight?: string;
  /** 占满剩余高度，用于输入/输出对照布局。 */
  fill?: boolean;
  className?: string;
}

/** 悬停节点面包屑中的单个片段。 */
interface Crumb {
  /** 展示文本：对象键为原文，数组下标显示为 [n]。 */
  display: string;
  /** 从根到该节点的完整路径。 */
  path: string;
}

/** 可折叠 / 展开的 JSON 树浏览器，支持全部展开与折叠，标量与容器分别着色。 */
export function JsonTree({
  value,
  defaultExpandedDepth = 2,
  maxHeight = 'max-h-[26rem]',
  fill = false,
  className,
}: JsonTreeProps) {
  const { containers, nodeCount } = useMemo(() => {
    const out: ContainerPath[] = [];
    const count = collectContainers(value, '', 0, out);
    return { containers: out, nodeCount: count };
  }, [value]);

  const kinds = useMemo<Map<string, ValueKind>>(
    () => new Map(containers.map((item) => [item.path, item.kind])),
    [containers],
  );

  const initialCollapsed = useMemo(
    () => new Set(containers.filter((item) => item.depth > defaultExpandedDepth).map((item) => item.path)),
    [containers, defaultExpandedDepth],
  );

  // 输入变化时按默认展开深度重建折叠集合。用渲染期同步重置，避免首帧全展开导致
  // 大 JSON 卡顿（useEffect 重置会晚一步，让第一帧把所有节点渲染出来）。
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(initialCollapsed);
  const [seenContainers, setSeenContainers] = useState(containers);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  if (seenContainers !== containers) {
    setSeenContainers(containers);
    setCollapsed(initialCollapsed);
    setSelectedPath(null);
  }

  const toggle = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    setCollapsed(new Set(containers.map((item) => item.path)));
  }, [containers]);

  const isArrayRoot = Array.isArray(value);

  // 由选中路径 + 容器类型推导面包屑片段：数组下标显示为 [n]，对象键显示原文。
  const crumbs = useMemo<Crumb[] | null>(() => {
    if (selectedPath === null) return null;
    const out: Crumb[] = [{ display: '$', path: '' }];
    if (selectedPath === '') return out;
    const raw = selectedPath.split('/').filter(Boolean);
    let acc = '';
    for (const segment of raw) {
      acc = acc ? `${acc}/${segment}` : `/${segment}`;
      const parentPath = acc.slice(0, acc.lastIndexOf('/')) || '';
      const isIndex = kinds.get(parentPath) === 'array';
      out.push({ display: isIndex ? `[${decodeURIComponent(segment)}]` : decodeURIComponent(segment), path: acc });
    }
    return out;
  }, [selectedPath, kinds]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 展开目标节点的所有祖先，使该节点在 DOM 中存在，再滚动定位到它。
  const findAndScroll = useCallback((target: string) => {
    const parts = target === '' ? [] : target.split('/').filter(Boolean);
    let acc = '';
    const ancestors: string[] = [];
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : `/${part}`;
      ancestors.push(acc);
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const ancestor of ancestors) next.delete(ancestor);
      return next;
    });
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-path="${target}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-1.5', fill && 'flex-1', className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {nodeCount} 个节点
          {collapsed.size > 0 && <span className="ml-1.5">· {collapsed.size} 处折叠</span>}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            aria-label="全部展开"
            onClick={expandAll}
          >
            <UnfoldVertical className="size-3" />
            全部展开
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            aria-label="全部折叠"
            onClick={collapseAll}
          >
            <FoldVertical className="size-3" />
            全部折叠
          </Button>
        </div>
      </div>

      {/* 面包屑：选中节点的完整路径，逐段可点击定位（类似 IDE 顶部路径）。 */}
      <div className="flex h-6 shrink-0 items-center gap-1.5 overflow-x-auto rounded-md border bg-muted/30 px-1.5 font-mono text-[10px]">
        {crumbs === null ? (
          <span className="flex min-w-0 items-center gap-1 truncate text-muted-foreground/70">
            <Crosshair className="size-3 shrink-0" />
            点击节点以显示完整路径，点击片段可定位
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-0.5">
            {crumbs.map((crumb, index) => (
              <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
                {index > 0 && <span className="text-muted-foreground/50">›</span>}
                <button
                  type="button"
                  title="点击定位到该节点"
                  className="rounded px-0.5 text-sky-600 transition-colors hover:bg-accent hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                  onClick={() => findAndScroll(crumb.path)}
                >
                  {crumb.display}
                </button>
              </span>
            ))}
            <CornerDownRight className="ml-0.5 size-3 shrink-0 text-muted-foreground/60" />
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'overflow-auto rounded-md border bg-background font-mono text-xs leading-5',
          fill ? 'min-h-0 flex-1' : maxHeight,
        )}
      >
        <div className="min-w-max py-1">
          {value === null || (typeof value !== 'object' && !Array.isArray(value)) ? (
            <div className="flex items-center gap-1 px-1 py-px">
              <span aria-hidden className="h-4 w-4 shrink-0" />
              <ScalarValue value={value} />
            </div>
          ) : (
            <TreeNode
              path=""
              depth={0}
              value={value}
              keyName={null}
              kind={isArrayRoot ? 'array' : 'object'}
              collapsed={collapsed}
              onToggle={toggle}
              onSelect={setSelectedPath}
            />
          )}
        </div>
      </div>
    </div>
  );
}