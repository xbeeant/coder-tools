import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Link2,
  Moon,
  ScanSearch,
  Search,
  Settings2,
  Star,
  Sun,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageContextPanel } from './components/PageContextPanel';
import { PipelinePanel } from './components/PipelinePanel';
import { SettingsDialog, type ShortcutDef } from './components/SettingsDialog';
import { ToolErrorBoundary } from './components/ToolErrorBoundary';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { copyText } from './components/ui/result';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { cn } from './components/ui/utils';
import {
  readLastTool,
  readSidebarOpen,
  useFavorites,
  useRecent,
  useResolvedTheme,
  useSettings,
  writeLastTool,
  writeSidebarOpen,
} from './hooks/storage';
import { useInputSnapshot } from './hooks/use-input-snapshot';
import {
  canUseExtensionFeatures,
  onContextPush,
  type SelectionPayload,
  takePendingSelection,
} from './lib/page-context';
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
  TOOLS,
  type Tool,
  TREE_TOOL_IDS,
  toolCategoryLabel,
} from './lib/registry';
import { RUNTIME_LABEL, shareableUrl } from './lib/runtime';

const SHORTCUTS: ShortcutDef[] = [
  { keys: '⌘/Ctrl + K', label: '打开工具搜索' },
  { keys: '/', label: '在非输入状态下打开搜索' },
  { keys: '⌘/Ctrl + B', label: '显示 / 隐藏侧边栏' },
  { keys: 'Alt + ↑/↓', label: '按分类顺序切换工具' },
  { keys: '⌘/Ctrl + [ / ]', label: '后退 / 前进到历史工具' },
  { keys: '⌘/Ctrl + ,', label: '打开设置' },
  { keys: '⌘/Ctrl + ⇧ + F', label: '收藏 / 取消收藏当前工具' },
  { keys: '⌘/Ctrl + ⇧ + T', label: '切换明暗主题' },
  { keys: '⌘/Ctrl + ⇧ + C', label: '复制当前工具链接' },
  { keys: '⌘/Ctrl + ⇧ + P', label: '打开页面上下文（仅扩展版）' },
  { keys: '⌘/Ctrl + ⇧ + E', label: '打开工具编排流水线' },
  { keys: 'Esc', label: '关闭搜索 / 设置 / 上下文 / 流水线' },
];

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

/** 优先地址栏，其次（若开启）上次使用的工具，最后默认工具。 */
function initialToolId(restoreLast: boolean): string {
  const fromUrl = readToolFromLocation();
  if (fromUrl) return fromUrl;
  if (restoreLast) {
    const last = readLastTool();
    if (last && findTool(last)) return last;
  }
  return DEFAULT_TOOL_ID;
}

export default function AppShell() {
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const [activeId, setActiveId] = useState<string>(() => initialToolId(settings.restoreLastTool));
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => (settings.rememberSidebar ? readSidebarOpen() : true));
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(readSidebarTab);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [altKey, setAltKey] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSelection, setContextSelection] = useState<SelectionPayload | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<{ stack: string[]; index: number }>({ stack: [activeId], index: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<(delta: number) => void>(() => {});
  const toastTimer = useRef<number | undefined>(undefined);
  const { favorites, toggleFav } = useFavorites();
  const { recent, addRecent, clearRecent } = useRecent();
  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const { flush: flushInputs } = useInputSnapshot({
    toolId: activeId,
    containerRef: contentRef,
    enabled: settings.autoSaveInputs,
    onError: (message) => notify(message, 'error'),
  });

  const toggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  const goTo = useCallback(
    (id: string) => {
      if (!findTool(id)) return;
      flushInputs();
      setHistory((prev) => {
        if (prev.stack[prev.index] === id) return prev;
        const stack = [...prev.stack.slice(0, prev.index + 1), id].slice(-50);
        return { stack, index: stack.length - 1 };
      });
      setActiveId(id);
      setPickerOpen(false);
      setQuery('');
    },
    [flushInputs],
  );

  const travel = useCallback(
    (delta: number) => {
      const target = history.index + delta;
      const id = history.stack[target];
      if (!id) return;
      flushInputs();
      setHistory((prev) => ({ ...prev, index: target }));
      setActiveId(id);
    },
    [history, flushInputs],
  );

  const extensionFeatures = useMemo(() => canUseExtensionFeatures(), []);

  /** 右键菜单送达的选中文本：切到目标工具并打开上下文面板。 */
  const acceptSelection = useCallback(
    (payload: SelectionPayload) => {
      if (!payload.text) return;
      if (findTool(payload.toolId)) goTo(payload.toolId);
      setContextSelection(payload);
      setContextOpen(true);
    },
    [goTo],
  );

  // 工具页刚打开时取走 background 暂存的选中文本；之后由 background 主动推送。
  useEffect(() => {
    let active = true;
    void takePendingSelection().then((payload) => {
      if (active && payload) acceptSelection(payload);
    });
    return () => {
      active = false;
    };
  }, [acceptSelection]);

  useEffect(() => onContextPush(acceptSelection), [acceptSelection]);

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
    writeLastTool(activeTool.meta.id);
    expandTool(activeTool.meta.id);
  }, [activeTool, addRecent, expandTool]);

  useEffect(() => {
    if (settings.rememberSidebar) writeSidebarOpen(sidebarOpen);
  }, [sidebarOpen, settings.rememberSidebar]);

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
      const key = event.key.toLowerCase();

      if (mod && key === ',') {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }
      if (mod && key === 'k') {
        event.preventDefault();
        setPickerOpen(true);
        return;
      }
      if (mod && key === 'b') {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (mod && !event.shiftKey && event.key === '[') {
        event.preventDefault();
        travel(-1);
        return;
      }
      if (mod && !event.shiftKey && event.key === ']') {
        event.preventDefault();
        travel(1);
        return;
      }
      if (mod && event.shiftKey && key === 'f') {
        event.preventDefault();
        toggleFav(activeTool.meta.id);
        notify(favorites.includes(activeTool.meta.id) ? '已取消收藏' : '已收藏当前工具');
        return;
      }
      if (mod && event.shiftKey && key === 't') {
        event.preventDefault();
        toggleTheme();
        return;
      }
      if (mod && event.shiftKey && key === 'c') {
        event.preventDefault();
        copyText(shareableUrl(activeTool.meta.id));
        notify('已复制当前工具链接');
        return;
      }
      if (mod && event.shiftKey && key === 'p' && extensionFeatures) {
        event.preventDefault();
        setContextOpen(true);
        return;
      }
      if (mod && event.shiftKey && key === 'e') {
        event.preventDefault();
        setPipelineOpen(true);
        return;
      }
      if (
        event.key === '/' &&
        !pickerOpen &&
        !settingsOpen &&
        !contextOpen &&
        !pipelineOpen &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        setPickerOpen(true);
        return;
      }
      if (
        altKey &&
        !settingsOpen &&
        !contextOpen &&
        !pipelineOpen &&
        (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        stepRef.current(1);
        return;
      }
      if (
        altKey &&
        !settingsOpen &&
        !contextOpen &&
        !pipelineOpen &&
        (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      ) {
        event.preventDefault();
        stepRef.current(-1);
        return;
      }
      if (event.key === 'Escape') {
        setPickerOpen(false);
        setSettingsOpen(false);
        setContextOpen(false);
        setPipelineOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    altKey,
    pickerOpen,
    settingsOpen,
    contextOpen,
    pipelineOpen,
    extensionFeatures,
    travel,
    toggleTheme,
    toggleFav,
    favorites,
    activeTool.meta.id,
    notify,
  ]);

  const openTool = useCallback((id: string) => goTo(id), [goTo]);

  // Alt+方向键按树的视觉顺序切换工具，而非按搜索结果顺序。
  const step = (delta: number) => {
    if (TREE_TOOL_IDS.length === 0) return;
    const current = TREE_TOOL_IDS.indexOf(activeId);
    const next = (Math.max(current, 0) + delta + TREE_TOOL_IDS.length) % TREE_TOOL_IDS.length;
    const toolId = TREE_TOOL_IDS[next];
    if (toolId) goTo(toolId);
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
      <a href="#tool-content" className="skip-link">
        跳至工具内容
      </a>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={() => setSidebarOpen((open) => !open)}
          title="切换侧边栏 (⌘B)"
          aria-label="切换侧边栏"
        >
          {sidebarOpen ? <ChevronsLeft className="size-3.5" /> : <ChevronsRight className="size-3.5" />}
        </Button>

        <span
          aria-hidden
          className="size-4 shrink-0 rounded-sm border border-primary/50 bg-primary/10 blueprint-grid"
        />
        <span className="hidden shrink-0 font-display text-[13px] font-semibold tracking-[0.01em] sm:inline">
          Coder Tools
        </span>
        <span aria-hidden className="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" />

        {/* 历史导航从二级标题栏上移，少一层横条。 */}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={history.index <= 0}
            onClick={() => travel(-1)}
            title="后退 (⌘[)"
            aria-label="后退到上一个工具"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={history.index >= history.stack.length - 1}
            onClick={() => travel(1)}
            title="前进 (⌘])"
            aria-label="前进到下一个工具"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* 当前通道读数：工具名与描述不再在二级栏重复出现。 */}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <div className="hidden w-full min-w-0 items-center gap-2 lg:flex">
            <span className="instrument-label shrink-0">ACTIVE</span>
            <span className="truncate font-display text-xs font-medium" title={activeTool.meta.description}>
              {activeTool.meta.name}
            </span>
            <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />
            <span className="shrink-0 text-[10px] text-muted-foreground">{toolCategoryLabel(activeTool.meta.id)}</span>
          </div>
        </div>

        {altKey && (
          <span className="hidden shrink-0 rounded-sm border border-signal/60 bg-signal/10 px-1.5 py-0.5 text-[10px] lg:inline">
            Alt + ↑/↓ 切换工具
          </span>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-7 w-7 shrink-0 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-1 text-left text-[11px] text-muted-foreground transition-colors duration-150 ease-out-quart hover:bg-surface-2 sm:w-56 sm:justify-start sm:px-2"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden flex-1 truncate sm:inline">搜索工具</span>
          <kbd className="hidden shrink-0 rounded-sm border border-border px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {extensionFeatures && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setContextOpen(true)}
              title="页面上下文 (⌘⇧P)"
              aria-label="打开页面上下文"
            >
              <ScanSearch className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              copyText(shareableUrl(activeTool.meta.id));
              notify('已复制当前工具链接');
            }}
            title="复制当前工具链接 (⌘⇧C)"
            aria-label="复制当前工具链接"
          >
            <Link2 className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => toggleFav(activeTool.meta.id)}
            title={isFavorite ? '取消收藏 (⌘⇧F)' : '收藏 (⌘⇧F)'}
            aria-label="收藏当前工具"
          >
            <Star className={cn('size-3.5', isFavorite && 'fill-current text-signal')} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={toggleTheme}
            title="切换明暗主题 (⌘⇧T)"
            aria-label="切换明暗主题"
          >
            {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setPipelineOpen(true)}
            title="工具编排流水线 (⌘⇧E)"
            aria-label="打开工具编排流水线"
          >
            <Workflow className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setSettingsOpen(true)}
            title="设置 (⌘,)"
            aria-label="打开设置"
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <nav
            className="fixed top-11 bottom-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:static lg:z-auto"
            aria-label="工具导航"
          >
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
              <span className="instrument-label flex-1">{sidebarTab === 'tree' ? 'INDEX' : 'RECENT'}</span>
              {sidebarTab === 'tree' && (
                <>
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

            <div className="shrink-0 px-2">
              <Tabs
                value={sidebarTab}
                onValueChange={(value) => setSidebarTab(value === 'recent' ? 'recent' : 'tree')}
                className="w-full"
              >
                <TabsList className="h-8 w-full">
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
                  <h2 className="instrument-label block px-2 pb-1.5">
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

            <div className="flex h-7 shrink-0 items-center justify-between border-t border-border px-2">
              <span className="instrument-label">{RUNTIME_LABEL}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{TOOLS.length} 项</span>
            </div>
          </nav>
        )}

        <main id="tool-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
          <div
            ref={contentRef}
            data-tool-id={activeId}
            className="flex min-h-0 w-full flex-1 flex-col overflow-hidden p-3"
          >
            <ToolErrorBoundary key={activeId} toolId={activeId}>
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-muted-foreground">
                    <span aria-hidden className="size-1.5 animate-pulse rounded-sm bg-signal" />
                    正在载入工具…
                  </div>
                }
              >
                <activeTool.component />
              </Suspense>
            </ToolErrorBoundary>
          </div>
        </main>
      </div>

      {/* 窄屏下侧边栏以抽屉形式覆盖内容，需要一层遮罩。 */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="关闭侧边栏"
          className="fixed inset-0 z-30 bg-scrim lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8">
          <button
            type="button"
            aria-label="关闭命令面板"
            className="absolute inset-0 bg-scrim"
            onClick={() => setPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="工具搜索"
            className="relative mt-10 w-full max-w-lg overflow-hidden rounded-sm border border-border-strong bg-surface shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
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
                className="h-11 flex-1 border-0 bg-transparent"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setPickerOpen(false)}
                aria-label="关闭"
              >
                <X className="size-3.5" />
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
                        'flex w-full items-center gap-2.5 rounded-sm border-l-2 px-2.5 py-2 text-left text-xs transition-colors duration-150 ease-out-quart',
                        index === pickerIndex
                          ? 'border-l-signal bg-accent/70 text-foreground'
                          : 'border-l-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
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
            <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
              <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
              <span className="font-mono tabular-nums">{pickerResults.length} 项</span>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
        onReset={resetSettings}
        onNotify={notify}
        shortcuts={SHORTCUTS}
        activeToolId={activeTool.meta.id}
        toolCount={TOOLS.length}
      />

      <PageContextPanel
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        onNotify={notify}
        containerRef={contentRef}
        selection={contextSelection}
      />

      <PipelinePanel
        open={pipelineOpen}
        onClose={() => setPipelineOpen(false)}
        onNotify={notify}
        containerRef={contentRef}
        activeToolId={activeTool.meta.id}
        activeToolName={activeTool.meta.name}
        goTo={goTo}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 py-2 text-xs shadow-lg',
            toast.tone === 'error' ? 'text-danger' : 'text-foreground',
          )}
        >
          <span
            aria-hidden
            className={cn('size-1.5 shrink-0 rounded-sm', toast.tone === 'error' ? 'bg-danger' : 'bg-success')}
          />
          {toast.message}
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
    <ul className={depth === 0 ? 'space-y-0.5' : 'ml-2 mt-0.5 space-y-0.5 border-l border-border pl-1.5'}>
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
          'flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 ease-out-quart hover:bg-accent/50',
          isTopLevel ? 'text-[12px] font-semibold' : 'text-[11px] font-medium',
          activeInGroup && isTopLevel ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')}
        />
        <Icon className={cn('size-3.5 shrink-0', activeInGroup ? 'text-primary' : 'text-muted-foreground')} />
        <span className="truncate">{node.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{stat.count}</span>
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
        'flex w-full items-center gap-2 rounded-sm border-l-2 py-1.5 pl-7 pr-2 text-left text-[12px] transition-colors duration-150 ease-out-quart',
        active
          ? 'border-l-signal bg-accent/70 font-medium text-foreground'
          : 'border-l-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
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
        <h2 className="instrument-label flex-1">
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
                  'flex w-full items-center gap-2 rounded-sm border-l-2 px-2 py-1.5 text-left text-[12px] transition-colors duration-150 ease-out-quart',
                  tool.meta.id === activeId
                    ? 'border-l-signal bg-accent/70 font-medium text-foreground'
                    : 'border-l-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
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
