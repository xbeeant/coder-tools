import JSZip from 'jszip';
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Download,
  FileDown,
  FileUp,
  LayoutTemplate,
  Link2,
  Pin,
  PinOff,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, Field, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../components/ui/utils';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  applyWikiCompletion,
  BUILTIN_TEMPLATES,
  buildGraph,
  computeLinks,
  countWords,
  createId,
  createNote,
  DEFAULT_LAYOUT,
  dailyNoteContent,
  extractTodos,
  filterNotes,
  GRAPH_NODE_LIMIT,
  type GraphEdge,
  type GraphNode,
  graphLabel,
  localDate,
  mergeNotes,
  type Note as NoteItem,
  type NoteTemplate,
  noteStats,
  notesToMarkdown,
  noteToMarkdown,
  orphanNotes,
  parseDateKey,
  parseMarkdownNote,
  parseSearch,
  parseSnapshotJson,
  pendingWikiTarget,
  removeTag,
  renameTag,
  renderNoteHtml,
  type SortKey,
  setTodoState,
  shiftDateKey,
  snapshotToJson,
  stepLayout,
  stripWikiLinks,
  TAG_COLOR_PALETTE,
  tagColor,
  tagCounts,
  tagTextColor,
  todoProgress,
} from '../lib/notes-store';

type ViewTab = 'edit' | 'preview' | 'graph' | 'links' | 'todos';

const SORT_OPTIONS = [
  { value: 'updated', label: '按更新时间' },
  { value: 'created', label: '按创建时间' },
  { value: 'title', label: '按标题' },
];

const STORAGE_KEY = 'coder-tools:notes';
const TAG_COLOR_KEY = 'coder-tools:notes:tag-colors';

interface Persisted {
  version: number;
  notes: NoteItem[];
  templates: NoteTemplate[];
  safeRender: boolean;
}

/** 读取用户自定义的标签颜色。 */
function loadTagColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TAG_COLOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [tag, color] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) out[tag] = color;
    }
    return out;
  } catch {
    return {};
  }
}

function loadPersisted(): Persisted {
  const fallback: Persisted = { version: 1, notes: [], templates: BUILTIN_TEMPLATES, safeRender: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      version: 1,
      notes: Array.isArray(parsed.notes) ? (parsed.notes as NoteItem[]) : [],
      templates:
        Array.isArray(parsed.templates) && parsed.templates.length > 0
          ? (parsed.templates as NoteTemplate[])
          : BUILTIN_TEMPLATES,
      safeRender: parsed.safeRender !== false,
    };
  } catch {
    return fallback;
  }
}

/** 右栏输入 / 输出两栏的中缝在窄屏会自动堆叠，这里固定 md 分栏。 */
export default function Notes() {
  const initial = useMemo(loadPersisted, []);
  const [notes, setNotes] = useState<NoteItem[]>(initial.notes);
  const [templates, setTemplates] = useState<NoteTemplate[]>(initial.templates);
  const [safeRender, setSafeRender] = useState(initial.safeRender);
  const [activeId, setActiveId] = useState<string | null>(initial.notes[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>(() => loadTagColors());
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [tab, setTab] = useState<ViewTab>('edit');
  const [draft, setDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [dailyKey, setDailyKey] = useState(localDate());
  const [showTemplates, setShowTemplates] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [pendingImport, setPendingImport] = useState<{
    notes: NoteItem[];
    templates: NoteTemplate[];
    warnings: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, notes, templates, safeRender } satisfies Persisted),
      );
    } catch {
      // 超出配额或 storage 被禁用时静默失败，界面上有导出入口兜底
    }
  }, [notes, safeRender, templates]);

  const active = useMemo(() => notes.find((note) => note.id === activeId) ?? null, [activeId, notes]);
  const searchQuery = useMemo(() => parseSearch(query), [query]);
  const visible = useMemo(
    () => filterNotes(notes, { sort, activeTags, query: searchQuery, pinnedOnly }),
    [activeTags, notes, pinnedOnly, searchQuery, sort],
  );
  const tags = useMemo(() => tagCounts(notes), [notes]);
  useEffect(() => {
    try {
      localStorage.setItem(TAG_COLOR_KEY, JSON.stringify(tagColors));
    } catch {
      // 忽略写入失败
    }
  }, [tagColors]);
  const stats = useMemo(() => noteStats(notes), [notes]);
  const orphans = useMemo(() => orphanNotes(notes), [notes]);
  const links = useMemo(() => computeLinks(notes, active), [active, notes]);
  const todos = useMemo(() => extractTodos(active?.content ?? ''), [active?.content]);
  const progress = todoProgress(todos);

  // 切换笔记时把已保存内容灌入草稿
  useEffect(() => {
    setDraft(active?.content ?? '');
    setTitleDraft(active?.title ?? '');
    setTagDraft((active?.tags ?? []).join(', '));
  }, [active]);

  const dirty = useMemo(() => {
    if (!active) return false;
    return draft !== active.content || titleDraft !== active.title || tagDraft !== active.tags.join(', ');
  }, [active, draft, tagDraft, titleDraft]);

  const commit = useCallback(() => {
    if (!active || !dirty) return;
    const parsedTags = tagDraft
      .split(/[,，\s]+/)
      .map((item) => item.trim().replace(/^#/, ''))
      .filter(Boolean);
    setNotes((prev) =>
      prev.map((note) =>
        note.id === active.id
          ? {
              ...note,
              title: titleDraft.trim() === '' ? '未命名笔记' : titleDraft.trim(),
              content: draft,
              tags: [...new Set(parsedTags)],
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    );
  }, [active, dirty, draft, tagDraft, titleDraft]);

  const create = useCallback((partial: Partial<NoteItem> = {}) => {
    const note = createNote(partial);
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
    setQuery('');
    setActiveTags([]);
    setTab('edit');
    return note;
  }, []);

  const openDaily = useCallback(
    (key: string) => {
      const trimmed = key.trim();
      const existing = notes.find((note) => note.title === trimmed);
      if (existing) {
        commit();
        setActiveId(existing.id);
        return;
      }
      create({ title: trimmed, content: dailyNoteContent(trimmed) });
    },
    [commit, create, notes],
  );

  // ── [[ 补全下拉 ────────────────────────────────────────────────
  const [pending, setPending] = useState<{ target: string; start: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncPending = useCallback((value: string, cursor: number) => {
    setPending(pendingWikiTarget(value, cursor));
  }, []);

  const completions = useMemo(() => {
    if (pending === null) return [];
    const key = pending.target.trim().toLowerCase();
    return notes.filter((note) => (key === '' ? true : note.title.toLowerCase().includes(key))).slice(0, 8);
  }, [notes, pending]);

  const insertLink = useCallback(
    (title: string) => {
      const cursor = textareaRef.current?.selectionStart ?? draft.length;
      const next = applyWikiCompletion(draft, cursor, title);
      setDraft(next.text);
      setPending(null);
      window.requestAnimationFrame(() => {
        const node = textareaRef.current;
        node?.focus();
        node?.setSelectionRange(next.cursor, next.cursor);
      });
    },
    [draft],
  );

  // ── 关系图 ────────────────────────────────────────────────────
  const graphRef = useRef<HTMLDivElement>(null);
  const graphWrapRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(640);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [truncated, setTruncated] = useState(0);
  const [alpha, setAlpha] = useState(0);
  const dragIdRef = useRef<string | null>(null);
  // 布局迭代在 rAF 里每帧读 ref 再写 state，避免把闭包里的旧节点算进下一帧。
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const graphData = useMemo(() => buildGraph(notes, activeId), [activeId, notes]);
  const graphHeight = 300;

  /** 唯一的节点写入口：同步更新 ref 与 state。 */
  const updateNodes = useCallback((updater: (prev: GraphNode[]) => GraphNode[]) => {
    const next = updater(nodesRef.current);
    nodesRef.current = next;
    setNodes(next);
  }, []);

  useEffect(() => {
    nodesRef.current = graphData.nodes;
    edgesRef.current = graphData.edges;
    setNodes(graphData.nodes);
    setEdges(graphData.edges);
    setTruncated(graphData.truncated);
  }, [graphData]);

  // 容器宽度变化时同步坐标范围，避免节点被夹到画布外
  useEffect(() => {
    const host = graphWrapRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 640;
      setGraphWidth(Math.max(280, Math.round(width)));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // 简化力导向：每帧一次迭代，alpha 从 1 线性衰减到 0 后停止，组件卸载时取消 rAF。
  useEffect(() => {
    if (tab !== 'graph' || graphData.nodes.length === 0) return;
    let current = 1;
    let raf = 0;
    const options = { ...DEFAULT_LAYOUT, width: graphWidth, height: graphHeight };
    const tick = () => {
      current = Math.max(0, current - 0.012);
      setAlpha(current);
      const next = nodesRef.current.map((node) => ({ ...node }));
      stepLayout(next, edgesRef.current, options, current);
      updateNodes(() => next);
      if (current > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [graphData, graphWidth, tab, updateNodes]);

  const onNodeDown = useCallback(
    (event: React.PointerEvent, id: string) => {
      event.stopPropagation();
      dragIdRef.current = id;
      updateNodes((prev) => prev.map((node) => (node.id === id ? { ...node, fixed: true, pinned: true } : node)));
    },
    [updateNodes],
  );

  const onNodeMove = useCallback(
    (event: React.PointerEvent) => {
      const id = dragIdRef.current;
      const host = graphRef.current;
      if (id === null || host === null) return;
      const rect = host.getBoundingClientRect();
      const x = Math.max(16, Math.min(graphWidth - 16, event.clientX - rect.left));
      const y = Math.max(16, Math.min(graphHeight - 16, event.clientY - rect.top));
      updateNodes((prev) => prev.map((node) => (node.id === id ? { ...node, x, y } : node)));
    },
    [graphWidth, updateNodes],
  );

  const endDrag = useCallback(() => {
    dragIdRef.current = null;
  }, []);

  // ── 导入导出 ──────────────────────────────────────────────────
  const handleExportJson = useCallback(() => {
    downloadText(exportName('notes', 'json'), snapshotToJson(notes, templates), 'application/json;charset=utf-8');
    setMessage(`已导出 ${notes.length} 篇笔记的完整备份（含模板）。`);
  }, [notes, templates]);

  const handleExportZip = useCallback(async () => {
    if (notes.length === 0) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('notes');
      for (const note of notes) {
        const safe = note.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || note.id;
        folder?.file(`${safe}.md`, noteToMarkdown(note));
      }
      zip.file('index.md', notesToMarkdown(notes));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlobFile(exportName('notes', 'zip'), blob);
      setMessage(`已把 ${notes.length} 篇笔记打包为 zip。`);
    } catch (error) {
      setMessage(`打包失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [notes]);

  const handleExportMd = useCallback(() => {
    if (!active) return;
    const safe = active.title.replace(/[\\/:*?"<>|]/g, '_') || active.id;
    downloadText(`${safe}.md`, noteToMarkdown(active), 'text/markdown;charset=utf-8');
  }, [active]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({
        accept: '.json,.md,.markdown,.txt,application/json,text/plain',
        multiple: false,
      });
      const file = files[0];
      if (!file) return;
      const text = await readAsText(file);
      if (/\.json$/i.test(file.name)) setPendingImport(parseSnapshotJson(text));
      else setPendingImport({ notes: [parseMarkdownNote(text, file.name)], templates: [], warnings: [] });
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const applyImport = useCallback(() => {
    if (pendingImport === null) return;
    if (importMode === 'replace') {
      setNotes(pendingImport.notes);
      setActiveId(pendingImport.notes[0]?.id ?? null);
      setMessage(`覆盖导入 ${pendingImport.notes.length} 篇，原有笔记已被替换。`);
    } else {
      const result = mergeNotes(notes, pendingImport.notes);
      setNotes(result.notes);
      setMessage(`合并导入：新增 ${result.added} 篇，同 id 覆盖 ${result.replaced} 篇。`);
    }
    if (pendingImport.templates.length > 0) {
      setTemplates((prev) => [
        ...prev,
        ...pendingImport.templates.filter((tpl) => !prev.some((item) => item.name === tpl.name)),
      ]);
    }
    setPendingImport(null);
  }, [importMode, notes, pendingImport]);

  const saveTemplate = useCallback(() => {
    const name = newTemplateName.trim();
    if (name === '' || active === null) return;
    commit();
    setTemplates((prev) => [
      ...prev,
      {
        id: createId('tpl'),
        name,
        description: `取自「${active.title}」`,
        content: draft === '' ? active.content : draft,
      },
    ]);
    setNewTemplateName('');
    setMessage(`模板「${name}」已保存。`);
  }, [active, commit, draft, newTemplateName]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Link2 className="size-4" />
          笔记与知识库
        </span>
      }
      description="Markdown 笔记、双向链接、任务提取与力导向关系图，全部数据只存本地浏览器"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" onClick={() => create()}>
            <Plus className="size-3.5" />
            新建笔记
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowTemplates((prev) => !prev)}>
            <LayoutTemplate className="size-3.5" />
            模板 {templates.length}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleImport()} disabled={busy}>
            <Upload className="size-3.5" />
            导入
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportJson}>
            <Download className="size-3.5" />
            导出 JSON
          </Button>
        </div>
      }
    >
      <StatGrid>
        <Stat label="笔记数" value={stats.total} />
        <Stat label="总字数" value={stats.words} hint={`当前 ${active === null ? 0 : countWords(active.content)} 字`} />
        <Stat label="标签数" value={stats.tags} />
        <Stat label="双向链接" value={stats.links} />
        <Stat label="孤立笔记" value={stats.orphans} tone={stats.orphans > 0 ? 'warn' : 'success'} />
        <Stat label="本周新增" value={stats.thisWeek} />
      </StatGrid>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        {/* 左栏：检索与列表 */}
        <div className="flex flex-col gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题 / 正文 / 标签；支持 #标签 与 [[笔记名]]"
            aria-label="搜索笔记"
            className="h-8 text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              ariaLabel="排序方式"
              value={sort}
              onChange={(value) => setSort(value as SortKey)}
              options={SORT_OPTIONS}
              selectClassName="w-28"
            />
            <Checkbox label="只看置顶" checked={pinnedOnly} onChange={setPinnedOnly} />
            {activeTags.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setActiveTags([])}>
                清除标签筛选
              </Button>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  aria-pressed={activeTags.includes(item.tag)}
                  onClick={() =>
                    setActiveTags((prev) =>
                      prev.includes(item.tag) ? prev.filter((tag) => tag !== item.tag) : [...prev, item.tag],
                    )
                  }
                  style={
                    activeTags.includes(item.tag)
                      ? {
                          backgroundColor: tagColor(item.tag, tagColors),
                          color: tagTextColor(tagColor(item.tag, tagColors)),
                        }
                      : { borderColor: tagColor(item.tag, tagColors), color: tagColor(item.tag, tagColors) }
                  }
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] transition-colors hover:opacity-80',
                    activeTags.includes(item.tag) ? '' : 'bg-transparent',
                  )}
                >
                  #{item.tag} <span className="opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          <ul className="flex min-h-32 flex-1 flex-col gap-1 overflow-auto rounded-md border p-1.5">
            {visible.length === 0 && <EmptyHint>没有匹配的笔记</EmptyHint>}
            {visible.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(note.id)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/60',
                    note.id === activeId && 'bg-accent',
                  )}
                >
                  <span className="flex items-center gap-1 truncate text-xs font-medium">
                    {note.pinned && <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" />}
                    {stripWikiLinks(note.title)}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {note.content.replace(/\s+/g, ' ').slice(0, 70) || '（空笔记）'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 右栏：编辑 / 预览 / 图谱 / 链接 / 任务 */}
        <div className="flex flex-col gap-2">
          {active === null ? (
            <EmptyHint>左侧选择一篇笔记，或点「新建笔记」开始。</EmptyHint>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={commit}
                  placeholder="笔记标题"
                  aria-label="笔记标题"
                  className="h-8 min-w-0 flex-1 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={active.pinned ? '取消置顶' : '置顶当前笔记'}
                  onClick={() => {
                    commit();
                    setNotes((prev) =>
                      prev.map((note) =>
                        note.id === active.id
                          ? { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() }
                          : note,
                      ),
                    );
                  }}
                >
                  {active.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="删除当前笔记"
                  onClick={() => {
                    if (!window.confirm(`确定删除「${active.title}」吗？此操作不可撤销。`)) return;
                    const next = notes.filter((note) => note.id !== active.id);
                    setNotes(next);
                    setActiveId(next[0]?.id ?? null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <Field label="标签" hint="标签参与筛选与统计，失焦自动保存">
                <Input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onBlur={commit}
                  placeholder="逗号分隔，例如：设计, 性能"
                  aria-label="笔记标签"
                  className="h-8 text-xs"
                />
              </Field>

              <Tabs value={tab} onValueChange={(value) => setTab(value as ViewTab)}>
                <TabsList>
                  <TabsTrigger value="edit" active={tab === 'edit'}>
                    编辑
                  </TabsTrigger>
                  <TabsTrigger value="preview" active={tab === 'preview'}>
                    预览
                  </TabsTrigger>
                  <TabsTrigger value="graph" active={tab === 'graph'}>
                    关系图
                  </TabsTrigger>
                  <TabsTrigger value="links" active={tab === 'links'}>
                    反向链接 {links.incoming.length > 0 ? `(${links.incoming.length})` : ''}
                  </TabsTrigger>
                  <TabsTrigger value="todos" active={tab === 'todos'}>
                    任务 {todos.length > 0 ? `(${progress.done}/${todos.length})` : ''}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {tab === 'edit' && (
                <div className="relative flex flex-1 flex-col gap-1.5">
                  <Textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyUp={(event) => {
                      const node = event.currentTarget;
                      syncPending(node.value, node.selectionStart ?? node.value.length);
                    }}
                    onClick={(event) => syncPending(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                    placeholder="支持 Markdown。输入 [[ 触发双向链接补全；- [ ] 会被提取为任务；#标签 可被搜索命中"
                    spellCheck={false}
                    aria-label="笔记正文"
                    className="min-h-48 flex-1 resize-none font-mono text-xs"
                  />
                  {pending !== null && completions.length > 0 && (
                    <ul className="absolute bottom-8 left-2 z-10 max-h-40 w-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
                      {completions.map((note) => (
                        <li key={note.id}>
                          <button
                            type="button"
                            className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertLink(note.title);
                            }}
                          >
                            {note.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Hint>
                    {countWords(draft)} 字 · {draft.split('\n').length} 行 ·{' '}
                    {dirty ? '有未保存改动（点击其它笔记或离开输入框时保存）' : '已保存'}
                  </Hint>
                </div>
              )}

              {tab === 'preview' && (
                <PreviewPane
                  note={active}
                  safe={safeRender}
                  onToggleSafe={setSafeRender}
                  onOpen={setActiveId}
                  notes={notes}
                />
              )}

              {tab === 'graph' && (
                <div className="flex flex-1 flex-col gap-2">
                  <Hint>
                    斥力 + 弹簧 + 向心力的简化力导向布局，最多渲染 {GRAPH_NODE_LIMIT}{' '}
                    个节点；拖拽固定节点，双击解除固定，点击跳转笔记。
                  </Hint>
                  <div ref={graphWrapRef} className="flex min-h-64 flex-1 flex-col">
                    <div
                      ref={graphRef}
                      className="relative overflow-hidden rounded-md border bg-muted/20"
                      style={{ height: graphHeight }}
                      onPointerMove={onNodeMove}
                      onPointerUp={endDrag}
                      onPointerLeave={endDrag}
                    >
                      <svg
                        width={graphWidth}
                        height={graphHeight}
                        role="img"
                        aria-label="笔记关系图"
                        className="block select-none"
                      >
                        {edges.map((edge) => {
                          const from = nodes.find((node) => node.id === edge.source);
                          const to = nodes.find((node) => node.id === edge.target);
                          if (from === undefined || to === undefined) return null;
                          return (
                            <line
                              key={`${edge.source}-${edge.target}`}
                              x1={from.x}
                              y1={from.y}
                              x2={to.x}
                              y2={to.y}
                              strokeWidth={1}
                              className="text-muted-foreground/50"
                              stroke="currentColor"
                            />
                          );
                        })}
                        {nodes.map((node) => (
                          // biome-ignore lint/a11y/useSemanticElements: SVG <g> 无法用 <button> 承载，手写 role + 键盘事件保持可访问
                          <g
                            key={node.id}
                            transform={`translate(${node.x} ${node.y})`}
                            role="button"
                            tabIndex={0}
                            aria-label={`打开笔记 ${node.label}`}
                            className="cursor-pointer"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') setActiveId(node.id);
                            }}
                            onPointerDown={(event) => onNodeDown(event, node.id)}
                            onDoubleClick={() =>
                              updateNodes((prev) =>
                                prev.map((item) =>
                                  item.id === node.id ? { ...item, fixed: false, pinned: false } : item,
                                ),
                              )
                            }
                            onClick={() => setActiveId(node.id)}
                          >
                            <circle
                              r={node.active ? 8 : 4 + Math.min(4, node.degree * 0.8)}
                              stroke="currentColor"
                              strokeWidth={0.5}
                              className={cn(
                                node.active
                                  ? 'fill-primary text-primary'
                                  : node.pinned
                                    ? 'fill-amber-500 text-amber-500'
                                    : 'fill-muted-foreground/50 text-muted-foreground',
                              )}
                            />
                            <text y={-11} textAnchor="middle" className="fill-foreground text-[9px]">
                              {graphLabel(node.label)}
                            </text>
                          </g>
                        ))}
                      </svg>
                      {nodes.length === 0 && <EmptyHint>还没有笔记，先新建一篇。</EmptyHint>}
                      <span className="absolute right-2 bottom-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        <ArrowDownUp className="mr-1 inline size-3" />
                        收敛 {Math.round(alpha * 100)}%
                      </span>
                    </div>
                  </div>
                  {truncated > 0 && (
                    <Hint>
                      另有 {truncated} 篇笔记未纳入图中（超过 {GRAPH_NODE_LIMIT} 节点上限）。
                    </Hint>
                  )}
                </div>
              )}

              {tab === 'links' && (
                <div className="flex flex-1 flex-col gap-2 overflow-auto">
                  <span className="text-xs text-muted-foreground">出链（本篇指向的笔记）</span>
                  {links.outgoing.length === 0 ? (
                    <EmptyHint>正文里用 [[标题]] 建立链接，输入时会弹出补全</EmptyHint>
                  ) : (
                    <ul className="flex flex-wrap gap-1">
                      {links.outgoing.map((note) => (
                        <li key={note.id}>
                          <Button size="sm" variant="outline" onClick={() => setActiveId(note.id)}>
                            {note.title}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <span className="text-xs text-muted-foreground">反向链接（哪些笔记链接到本篇）</span>
                  {links.incoming.length === 0 ? (
                    <EmptyHint>暂时没有其它笔记链接到这里</EmptyHint>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {links.incoming.map((ref) => {
                        const note = notes.find((item) => item.id === ref.noteId);
                        if (note === undefined) return null;
                        return (
                          <li key={ref.noteId} className="rounded border px-2 py-1">
                            <button
                              type="button"
                              className="text-xs font-medium underline-offset-2 hover:underline"
                              onClick={() => setActiveId(note.id)}
                            >
                              {note.title}
                            </button>
                            <p className="truncate text-[10px] text-muted-foreground">{ref.context}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {links.missing.length > 0 && (
                    <Note tone="warn" title="链接目标尚不存在">
                      {links.missing.join('、')} —— 创建同名笔记后链接会自动生效。
                    </Note>
                  )}
                  {orphans.length > 0 && (
                    <Note tone="info" title={`孤立笔记 ${orphans.length} 篇`}>
                      {orphans
                        .slice(0, 8)
                        .map((note) => note.title)
                        .join('、')}
                      {orphans.length > 8 ? ' 等' : ''}
                    </Note>
                  )}
                </div>
              )}

              {tab === 'todos' && (
                <div className="flex flex-1 flex-col gap-2 overflow-auto">
                  <StatGrid>
                    <Stat label="任务总数" value={progress.total} />
                    <Stat label="已完成" value={progress.done} tone="success" />
                    <Stat
                      label="完成率"
                      value={`${progress.rate}%`}
                      tone={progress.total > 0 && progress.rate === 100 ? 'success' : 'info'}
                    />
                  </StatGrid>
                  {todos.length === 0 ? (
                    <EmptyHint>正文里写 - [ ] 未完成、- [x] 已完成，这里会自动汇总。</EmptyHint>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {todos.map((item) => (
                        <li key={`${item.line}-${item.text}`}>
                          <label className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                            <Checkbox
                              label=""
                              checked={item.done}
                              onChange={(checked) => {
                                setDraft(setTodoState(draft, item.line, checked));
                              }}
                              className="shrink-0"
                            />
                            <span className={cn(item.done && 'text-muted-foreground line-through')}>
                              {item.text === '' ? '（空任务）' : item.text}
                            </span>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              第 {item.line + 1} 行
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showTemplates && (
        <Section title="笔记模板" description="内置模板一键套用，也可以把当前正文存为自定义模板">
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <Button
                key={tpl.id}
                size="sm"
                variant="outline"
                title={tpl.description}
                onClick={() => create({ title: `${tpl.name} ${localDate()}`, content: tpl.content })}
              >
                {tpl.name}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <TextField
              label="新模板名称"
              value={newTemplateName}
              onChange={setNewTemplateName}
              placeholder="例如：故障复盘"
              className="w-48"
            />
            <Button size="sm" onClick={saveTemplate} disabled={active === null || newTemplateName.trim() === ''}>
              保存当前正文为模板
            </Button>
          </div>
        </Section>
      )}

      <Section title="每日笔记" description="按 YYYY-MM-DD 命名，便于时序回顾">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openDaily(shiftDateKey(dailyKey, -1))}>
            <ArrowLeft className="size-3.5" />
            前一天
          </Button>
          <Input
            type="date"
            value={dailyKey}
            onChange={(event) => setDailyKey(event.target.value)}
            aria-label="每日笔记日期"
            className="h-8 w-40 text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => openDaily(shiftDateKey(dailyKey, 1))}>
            后一天
            <ArrowRight className="size-3.5" />
          </Button>
          <Button size="sm" onClick={() => openDaily(dailyKey)}>
            <CalendarDays className="size-3.5" />
            打开 / 创建
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {parseDateKey(dailyKey) === null ? '日期无效，将回退到今天' : `标题：${dailyKey}`}
          </span>
        </div>
      </Section>

      <Section title="标签管理" description="重命名或删除会同步改写所有笔记">
        {tags.length === 0 ? (
          <EmptyHint>还没有任何标签</EmptyHint>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tags.map((item) => (
              <TagRow
                key={item.tag}
                tag={item.tag}
                count={item.count}
                color={tagColor(item.tag, tagColors)}
                palette={TAG_COLOR_PALETTE}
                onColor={(color) =>
                  setTagColors((prev) => {
                    const next = { ...prev, [item.tag]: color };
                    return next;
                  })
                }
                onRename={(next) => {
                  const target = next.trim();
                  if (target === '') return;
                  setNotes((prev) => renameTag(prev, item.tag, target));
                  setTagColors((prev) => {
                    const next = { ...prev };
                    const color = next[item.tag];
                    delete next[item.tag];
                    if (color !== undefined) next[target] = color;
                    return next;
                  });
                  setActiveTags((prev) => prev.map((tag) => (tag === item.tag ? target : tag)));
                }}
                onDelete={() => {
                  if (!window.confirm(`确定从所有笔记中删除标签 #${item.tag} 吗？`)) return;
                  setNotes((prev) => removeTag(prev, item.tag));
                  setActiveTags((prev) => prev.filter((tag) => tag !== item.tag));
                  setTagColors((prev) => {
                    const next = { ...prev };
                    delete next[item.tag];
                    return next;
                  });
                }}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="导入 / 导出"
        description="导出是唯一可靠的备份途径"
        actions={
          <div className="flex flex-row gap-1">
            <Button size="sm" variant="outline" onClick={handleExportMd} disabled={active === null}>
              <FileDown className="size-3.5" />
              导出当前 Markdown
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleExportZip()}
              disabled={busy || notes.length === 0}
            >
              <FileDown className="size-3.5" />
              全部导出 zip
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            label="合并导入（同 id 覆盖）"
            checked={importMode === 'merge'}
            onChange={(checked) => setImportMode(checked ? 'merge' : 'replace')}
            hint="取消勾选即整体覆盖，现有笔记会被丢弃"
          />
          <Button size="sm" onClick={() => setPreview(snapshotToJson(notes, templates))} disabled={notes.length === 0}>
            <FileUp className="size-3.5" />
            预览备份 JSON
          </Button>
        </div>
        {preview !== '' && (
          <ResultBox label="备份内容预览" value={preview} rows="min-h-24" onCopy={() => copyText(preview)} />
        )}
        {pendingImport !== null && (
          <Note tone="warn" title={`确认导入 ${pendingImport.notes.length} 篇笔记`}>
            <div className="flex flex-col gap-1">
              <span>
                模式：{importMode === 'merge' ? '合并（同 id 覆盖已有笔记）' : '覆盖（清空现有笔记）'}
                {pendingImport.warnings.length > 0 ? `；${pendingImport.warnings.join('；')}` : ''}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={applyImport}>
                  确认导入
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
                  取消
                </Button>
              </div>
            </div>
          </Note>
        )}
        {message !== null && <Hint>{message}</Hint>}
      </Section>

      <Note tone="warn" title="数据只在本机浏览器">
        笔记保存在 localStorage（键名 <code>coder-tools:notes</code>
        ），清除站点数据、换设备或换浏览器都会丢失，请定期用「导出 JSON」备份。导入的 Markdown
        只做安全渲染，不会执行其中的 HTML。
      </Note>
    </ToolPanel>
  );
}

function PreviewPane({
  note,
  safe,
  onToggleSafe,
  onOpen,
  notes,
}: {
  note: NoteItem;
  safe: boolean;
  onToggleSafe: (value: boolean) => void;
  onOpen: (id: string) => void;
  notes: NoteItem[];
}) {
  const html = useMemo(() => renderNoteHtml(note.content, notes), [note.content, notes]);
  return (
    <div className="flex flex-1 flex-col gap-2">
      <Checkbox
        label="安全渲染（marked + DOMPurify）"
        checked={safe}
        onChange={onToggleSafe}
        hint="关闭后按纯文本展示，绝不解析 HTML，用于核对原始内容"
      />
      <div className="min-h-48 flex-1 overflow-auto rounded-md border p-3 text-xs leading-relaxed">
        {safe ? (
          <div
            role="none"
            className="[&_a.wiki-link]:text-primary [&_a.wiki-link]:underline [&_a.wiki-missing]:text-destructive [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_md-tag]:rounded [&_md-tag]:bg-muted [&_md-tag]:px-1 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_table]:w-full [&_td]:border [&_td]:p-1 [&_th]:border [&_th]:bg-muted [&_th]:p-1"
            onClick={(event) => {
              const anchor = (event.target as Element).closest('[data-note-target]') as HTMLElement | null;
              const target = anchor?.getAttribute('data-note-target');
              if (target) onOpen(target);
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容先经 marked 渲染、再过 DOMPurify 白名单净化，检测到危险残留会整体降级为纯文本
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs">{note.content}</pre>
        )}
      </div>
    </div>
  );
}

function TagRow({
  tag,
  count,
  color,
  palette,
  onRename,
  onColor,
  onDelete,
}: {
  tag: string;
  count: number;
  color: string;
  palette: readonly string[];
  onRename: (next: string) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag);
  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={`重命名标签 ${tag}`}
          className="h-7 w-40 text-xs"
        />
        <Button
          size="sm"
          onClick={() => {
            if (value.trim() !== '') onRename(value.trim());
            setEditing(false);
          }}
        >
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          取消
        </Button>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded px-2 py-0.5 font-mono" style={{ backgroundColor: color, color: tagTextColor(color) }}>
        #{tag}
      </span>
      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">{`设置 ${tag} 的标签颜色`}</legend>
        {palette.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`把 #${tag} 设为 ${swatch}`}
            onClick={() => onColor(swatch)}
            className={cn(
              'size-4 rounded-full border transition-transform hover:scale-110',
              swatch === color ? 'border-foreground' : 'border-transparent',
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </fieldset>
      <span className="text-muted-foreground">{count} 篇</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        重命名
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>
        删除
      </Button>
    </li>
  );
}

/** jszip 产出的 blob 直接下载；与 downloadText 分开是因为 MIME 不同。 */
function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
