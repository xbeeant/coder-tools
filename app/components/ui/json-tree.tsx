import { ChevronDown, ChevronRight, FoldVertical, UnfoldVertical } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Button } from './button';
import { cn } from './utils';

interface ContainerPath {
  path: string;
  depth: number;
}

/** 分隔子节点路径，避免键名里含 `/` 造成路径冲突。 */
const sep = (key: string | number): string => encodeURIComponent(String(key));
const join = (path: string, key: string | number): string => `${path}/${sep(key)}`;

/** 深度遍历收集所有容器（对象/数组）的路径，返回节点总数。 */
function collectContainers(value: unknown, path: string, depth: number, out: ContainerPath[]): number {
  if (Array.isArray(value)) {
    out.push({ path, depth });
    let count = 1;
    for (let i = 0; i < value.length; i += 1) count += collectContainers(value[i], join(path, i), depth + 1, out);
    return count;
  }
  if (value !== null && typeof value === 'object') {
    out.push({ path, depth: Math.max(depth, 0) });
    let count = 1;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      count += collectContainers((value as Record<string, unknown>)[key], join(path, key), depth + 1, out);
    }
    return count;
  }
  return 1;
}

/** 过长字符串截断展示，悬停可看全文。 */
function shortText(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}

type ValueKind = 'array' | 'object';

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
}

function TreeNode({ path, depth, value, keyName, kind, collapsed, onToggle }: TreeNodeProps) {
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
      <Punc>:</Punc>
    </>
  );

  const rowContent = (
    <>
      {collapsible ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      {keyColon}
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

  const rowClass =
    'flex w-full items-center gap-1 whitespace-nowrap rounded-sm px-1 py-px text-left hover:bg-accent/50';

  const row = collapsible ? (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? '折叠此节点' : '展开此节点'}
      onClick={() => onToggle(path)}
      className={cn(rowClass, 'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
    >
      {rowContent}
    </button>
  ) : (
    <div className={rowClass}>{rowContent}</div>
  );

  // 标量（含字符串）必须在此处短路，否则对字符串执行 Object.entries 会按字符
  // 索引展开成几乎无穷的子树；null 等值直接走 Object.entries 也会抛错。
  if (!open || !isContainer) return row;

  const entries: { key: string | number; value: unknown }[] = isArray
    ? value.map((item, index) => ({ key: index, value: item }))
    : Object.entries(value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));

  return (
    <div className={cn(depth > 0 && 'ml-4 border-l border-foreground/10 pl-1')}>
      {row}
      {entries.length === 0 ? null : (
        <>
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
            />
          ))}
          {isContainer && (
            <div className="flex items-center px-1 py-px">
              <span className="h-4 w-4 shrink-0" />
              <Punc>{isArray ? ']' : '}'}</Punc>
            </div>
          )}
        </>
      )}
    </div>
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

  const initialCollapsed = useMemo(
    () => new Set(containers.filter((item) => item.depth > defaultExpandedDepth).map((item) => item.path)),
    [containers, defaultExpandedDepth],
  );

  // 输入变化时按默认展开深度重建折叠集合。用渲染期同步重置，避免首帧全展开导致
  // 大 JSON 卡顿（useEffect 重置会晚一步，让第一帧把所有节点渲染出来）。
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(initialCollapsed);
  const [seenContainers, setSeenContainers] = useState(containers);
  if (seenContainers !== containers) {
    setSeenContainers(containers);
    setCollapsed(initialCollapsed);
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

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', fill && 'flex-1', className)}>
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
      <div
        className={cn(
          'overflow-auto rounded-md border bg-background font-mono text-xs leading-5',
          fill ? 'min-h-0 flex-1' : maxHeight,
        )}
      >
        <div className="min-w-max py-1">
          {value === null || (typeof value !== 'object' && !Array.isArray(value)) ? (
            <div className="flex items-center gap-1 px-1 py-px">
              <span className="h-4 w-4 shrink-0" />
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
