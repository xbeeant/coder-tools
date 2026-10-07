import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Clock3,
  Command,
  Moon,
  Search,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { cn } from './components/ui/utils';
import { useFavorites, useRecent, useTheme } from './hooks/storage';
import {
  ancestorGroupIds,
  DEFAULT_TOOL_ID,
  findTool,
  groupStat,
  type NavGroup,
  type NavNode,
  resolveTool,
  searchTools,
  TOOL_TREE,
  type Tool,
  TREE_TOOL_IDS,
  toolCategoryLabel,
} from './lib/registry';

const ALL_GROUP_IDS = collectGroupIds(TOOL_TREE);

function collectGroupIds(nodes: NavNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'group') {
      ids.push(node.id);
      ids.push(...collectGroupIds(node.children));
    }
  }
  return ids;
}

type SidebarTab = 'recent' | 'tree';

const SIDEBAR_TAB_KEY = 'coder-tools:sidebar-tab';

function readSidebarTab(): SidebarTab {
  try {
    return localStorage.getItem(SIDEBAR_TAB_KEY) === 'recent' ? 'recent' : 'tree';
  } catch {
    return 'tree';
  }
}

function readToolFromLocation(): string | null {
  const fromHash = /^#\/tool\/(.+)$/.exec(window.location.hash)?.[1];
  const fromQuery = new URLSearchParams(window.location.search).get('tool');
  const id = fromHash ?? fromQuery;
  return id && findTool(id) ? id : null;
}

export default function AppShell() {
  const [activeId, setActiveId] = useState<string>(() => readToolFromLocation() ?? DEFAULT_TOOL_ID);
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(readSidebarTab);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [altKey, setAltKey] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<(delta: number) => void>(() => {});
  const { theme, toggle: toggleTheme } = useTheme();
  const { favorites, toggleFav } = useFavorites();
  const { recent, addRecent, clearRecent } = useRecent();

  const searching = query.trim().length > 0;
  const matches = useMemo(() => new Set(searchTools(query).map((tool) => tool.meta.id)), [query]);
  const activeTool = useMemo(() => resolveTool(activeId), [activeId]);
  const pickerResults = useMemo(() => searchTools(query), [query]);

  // 搜索时自动展开全部分组，搜索结束后恢复用户的手动折叠状态。
  const expanded = useMemo(
    () => (searching ? new Set(ALL_GROUP_IDS) : new Set(ALL_GROUP_IDS.filter((id) => !collapsed.has(id)))),
    [searching, collapsed],
  );

  const expandTool = useCallback((toolId: string) => {
    const ancestors = ancestorGroupIds(toolId);
    if (ancestors.length === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ancestors) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    addRecent(activeTool.meta.id);
    expandTool(activeTool.meta.id);
  }, [activeTool, addRecent, expandTool]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_TAB_KEY, sidebarTab);
    } catch {
      // 存储不可用时仅影响 Tab 记忆，不影响功能
    }
  }, [sidebarTab]);

  // 地址栏同步，刷新或收藏页面后仍停留在同一个工具。
  useEffect(() => {
    const next = `#/tool/${activeId}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [activeId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 查询变化时需重置选中项
  useEffect(() => {
    setPickerIndex(0);
  }, [query]);

  useEffect(() => {
    const sync = (event: KeyboardEvent) => setAltKey(event.altKey);
    const clear = () => setAltKey(false);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPickerOpen(true);
        return;
      }
      if (mod && event.key === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (event.key === '/' && !pickerOpen && !isTypingTarget(event.target)) {
        event.preventDefault();
        setPickerOpen(true);
        return;
      }
      if (altKey && (event.key === 'ArrowDown' || event.key === 'ArrowRight')) {
        event.preventDefault();
        stepRef.current(1);
        return;
      }
      if (altKey && (event.key === 'ArrowUp' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        stepRef.current(-1);
        return;
      }
      if (event.key === 'Escape') {
        setPickerOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [altKey, pickerOpen]);

  const openTool = useCallback((id: string) => {
    setActiveId(id);
    setPickerOpen(false);
    setQuery('');
  }, []);

  // Alt+方向键按树的视觉顺序切换工具，而非按搜索结果顺序。
  const step = (delta: number) => {
    if (TREE_TOOL_IDS.length === 0) return;
    const current = TREE_TOOL_IDS.indexOf(activeId);
    const next = (Math.max(current, 0) + delta + TREE_TOOL_IDS.length) % TREE_TOOL_IDS.length;
    const toolId = TREE_TOOL_IDS[next];
    if (toolId) setActiveId(toolId);
  };
  stepRef.current = step;

  const toggleGroup = (groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const setAllCollapsed = (value: boolean) => {
    setCollapsed(value ? new Set(ALL_GROUP_IDS) : new Set());
  };

  const isFavorite = favorites.includes(activeTool.meta.id);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          onClick={() => setSidebarOpen((open) => !open)}
          title="切换侧边栏 (⌘B)"
          aria-label="切换侧边栏"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="hidden lg:inline-flex"
          onClick={() => setSidebarOpen((open) => !open)}
          title="切换侧边栏 (⌘B)"
          aria-label="切换侧边栏"
        >
          {sidebarOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <Command className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold">Coder Tools</span>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="ml-auto flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">搜索工具…</span>
          <kbd className="shrink-0 rounded border px-1 font-sans text-[10px]">⌘K</kbd>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => toggleFav(activeTool.meta.id)}
            title={isFavorite ? '取消收藏' : '收藏'}
            aria-label="收藏当前工具"
          >
            <Star className={cn('size-4', isFavorite && 'fill-current text-amber-500')} />
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleTheme} title="切换明暗主题" aria-label="切换明暗主题">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <nav
            className="fixed top-12 bottom-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r bg-background lg:static lg:z-auto"
            aria-label="工具导航"
          >
            <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
              {sidebarTab === 'tree' ? (
                <>
                  <span className="flex-1 text-[11px] font-medium text-muted-foreground">工具树</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    title="全部折叠"
                    aria-label="全部折叠"
                    onClick={() => setAllCollapsed(true)}
                  >
                    <ChevronsUpDown className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    title="全部展开"
                    aria-label="全部展开"
                    onClick={() => setAllCollapsed(false)}
                  >
                    <ChevronsRight className="size-3.5" />
                  </Button>
                </>
              ) : (
                <span className="flex-1" />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                title="关闭侧边栏 (⌘B)"
                aria-label="关闭侧边栏"
                onClick={() => setSidebarOpen(false)}
              >
                <ChevronsLeft className="size-3.5" />
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
              <Tabs
                value={sidebarTab}
                onValueChange={(value) => setSidebarTab(value === 'recent' ? 'recent' : 'tree')}
                className="w-full"
              >
                <TabsList className="h-7 w-full">
                  <TabsTrigger value="recent" active={sidebarTab === 'recent'} className="flex-1">
                    最近使用
                    {recent.length > 0 && (
                      <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{recent.length}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="tree" active={sidebarTab === 'tree'} className="flex-1">
                    全部分类
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-auto p-2 scrollbar-thin">
              {favorites.length > 0 && (
                <FlatSection
                  title="收藏"
                  tools={favorites.map((id) => findTool(id)).filter((tool): tool is Tool => tool !== undefined)}
                  activeId={activeId}
                  onSelect={openTool}
                  className="mb-4"
                />
              )}

              {sidebarTab === 'recent' ? (
                <FlatSection
                  title="最近使用"
                  tools={recent.map((id) => findTool(id)).filter((tool): tool is Tool => tool !== undefined)}
                  activeId={activeId}
                  onSelect={openTool}
                  emptyHint="还没有使用记录，打开任意工具后会自动出现在这里。"
                  action={
                    recent.length > 0 ? (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={clearRecent}>
                        <Trash2 className="size-3" />
                        清空
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <section>
                  <h2 className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                    {searching ? `搜索结果 ${matches.size}` : '全部分类'}
                  </h2>
                  <TreeBranch
                    nodes={TOOL_TREE}
                    depth={0}
                    activeId={activeId}
                    expanded={expanded}
                    matches={searching ? matches : null}
                    onToggleGroup={toggleGroup}
                    onSelect={openTool}
                  />
                  {searching && matches.size === 0 && (
                    <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">无匹配工具</p>
                  )}
                </section>
              )}
            </div>
          </nav>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              {(() => {
                const Icon = activeTool.meta.icon;
                return <Icon className="size-4 shrink-0 text-muted-foreground" />;
              })()}
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">{activeTool.meta.name}</h1>
                <p className="truncate text-xs text-muted-foreground">{activeTool.meta.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {altKey && (
                <span className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground">
                  Alt + ↑/↓ 切换工具
                </span>
              )}
              <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                {toolCategoryLabel(activeTool.meta.id)}
              </span>
            </div>
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden p-4">
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  <Clock3 className="mr-1.5 size-3.5 animate-spin" />
                  加载中
                </div>
              }
            >
              <activeTool.component />
            </Suspense>
          </div>
        </main>
      </div>

      {/* 窄屏下侧边栏以抽屉形式覆盖内容，需要一层遮罩。 */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭侧边栏"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-8">
          <button
            type="button"
            aria-label="关闭命令面板"
            className="absolute inset-0 bg-black/40"
            onClick={() => setPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative mt-10 w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setPickerIndex((i) => Math.min(i + 1, pickerResults.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setPickerIndex((i) => Math.max(i - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const tool = pickerResults[pickerIndex];
                    if (tool) openTool(tool.meta.id);
                  }
                }}
                placeholder="搜索工具名称、分类或关键词…"
                className="h-11 flex-1 border-0 shadow-none focus-visible:ring-0"
              />
              <Button size="icon" variant="ghost" onClick={() => setPickerOpen(false)} aria-label="关闭">
                <X className="size-4" />
              </Button>
            </div>
            <ul className="max-h-80 overflow-auto p-1.5 scrollbar-thin">
              {pickerResults.map((tool, index) => {
                const Icon = tool.meta.icon;
                return (
                  <li key={tool.meta.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setPickerIndex(index)}
                      onClick={() => openTool(tool.meta.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        index === pickerIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{tool.meta.name}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {toolCategoryLabel(tool.meta.id)}
                      </span>
                    </button>
                  </li>
                );
              })}
              {pickerResults.length === 0 && (
                <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">没有匹配的工具</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

interface TreeBranchProps {
  nodes: NavNode[];
  depth: number;
  activeId: string;
  expanded: Set<string>;
  /** 非 null 时进入搜索过滤模式，只保留命中工具所在的分支。 */
  matches: Set<string> | null;
  onToggleGroup: (groupId: string) => void;
  onSelect: (toolId: string) => void;
}

function TreeBranch({ nodes, depth, activeId, expanded, matches, onToggleGroup, onSelect }: TreeBranchProps) {
  const visible = matches
    ? nodes.filter((node) => (node.type === 'tool' ? matches.has(node.toolId) : containsTool(node, matches)))
    : nodes;
  if (visible.length === 0) return null;

  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'ml-1.5 mt-0.5 space-y-0.5 border-l pl-1.5'}>
      {visible.map((node) =>
        node.type === 'group' ? (
          <li key={node.id}>
            <TreeGroup
              node={node}
              depth={depth}
              activeId={activeId}
              expanded={expanded}
              matches={matches}
              onToggleGroup={onToggleGroup}
              onSelect={onSelect}
            />
          </li>
        ) : (
          <li key={node.toolId}>
            <ToolLeaf toolId={node.toolId} activeId={activeId} onSelect={onSelect} />
          </li>
        ),
      )}
    </ul>
  );
}

function containsTool(group: NavGroup, matches: Set<string>): boolean {
  return group.children.some((child) =>
    child.type === 'tool' ? matches.has(child.toolId) : containsTool(child, matches),
  );
}

interface TreeGroupProps extends Omit<TreeBranchProps, 'nodes'> {
  node: NavGroup;
}

function TreeGroup({ node, depth, activeId, expanded, matches, onToggleGroup, onSelect }: TreeGroupProps) {
  const Icon = node.icon;
  const isOpen = expanded.has(node.id);
  const stat = groupStat(node.id);
  const isTopLevel = depth === 0;
  // 当前工具位于本分组（含子分组）内时高亮分组标题，提示「选中项在这里」。
  const activeInGroup = matches === null && stat.toolIds.includes(activeId);

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleGroup(node.id)}
        aria-expanded={isOpen}
        title={node.description}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors',
          isTopLevel ? 'text-[13px] font-medium' : 'text-xs',
          activeInGroup && isTopLevel ? 'text-foreground' : 'text-foreground/75 hover:bg-accent/50',
        )}
      >
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')}
        />
        <Icon className={cn('size-3.5 shrink-0', activeInGroup ? 'text-primary' : 'text-muted-foreground')} />
        <span className="truncate">{node.label}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{stat.count}</span>
      </button>
      {isOpen && (
        <TreeBranch
          nodes={node.children}
          depth={depth + 1}
          activeId={activeId}
          expanded={expanded}
          matches={matches}
          onToggleGroup={onToggleGroup}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function ToolLeaf({
  toolId,
  activeId,
  onSelect,
}: {
  toolId: string;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const tool = resolveTool(toolId);
  const Icon = tool.meta.icon;
  const active = toolId === activeId;
  return (
    <button
      type="button"
      onClick={() => onSelect(toolId)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-left text-[13px] transition-colors',
        active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-accent/50',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', active ? '' : 'text-muted-foreground')} />
      <span className="truncate">{tool.meta.name}</span>
    </button>
  );
}

/**
 * 最近使用允许同一个工具重复出现，因此需要按「第 n 次出现」生成稳定的唯一 key，
 * 不能用工具 id（会重复）也不能用数组下标（插入头部时所有 key 都会位移）。
 */
function withOccurrenceKeys(tools: Tool[]): { tool: Tool; key: string }[] {
  const seen = new Map<string, number>();
  return tools.map((tool) => {
    const n = (seen.get(tool.meta.id) ?? 0) + 1;
    seen.set(tool.meta.id, n);
    return { tool, key: `${tool.meta.id}#${n}` };
  });
}

function FlatSection({
  title,
  tools,
  activeId,
  onSelect,
  emptyHint,
  action,
  className,
}: {
  title: string;
  tools: Tool[];
  activeId: string;
  onSelect: (id: string) => void;
  emptyHint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-3', className)}>
      <div className="flex items-center gap-1 px-2 pb-1">
        <h2 className="flex-1 text-[11px] font-medium text-muted-foreground">
          {title}
          {tools.length > 0 && <span className="ml-1 tabular-nums">{tools.length}</span>}
        </h2>
        {action}
      </div>
      {tools.length === 0 ? (
        <p className="px-2 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          {emptyHint ?? '暂无内容'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {withOccurrenceKeys(tools).map(({ tool, key }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(tool.meta.id)}
                aria-current={tool.meta.id === activeId ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  tool.meta.id === activeId
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-foreground/80 hover:bg-accent/50',
                )}
              >
                <IconBox tool={tool} />
                <span className="truncate">{tool.meta.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IconBox({ tool }: { tool: Tool }) {
  const Icon = tool.meta.icon;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}
