import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FolderOpen,
  KanbanSquare,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  addDays,
  allAssignees,
  allLabels,
  type Bucket,
  type BurndownPoint,
  buildDailyReport,
  buildWeeklyReport,
  burndownSeries,
  columnTasks,
  createEpic,
  createSampleWorkspace,
  createSprint,
  createTask,
  deferUnfinished,
  emptyFilter,
  emptyProjectData,
  emptyWorkspace,
  epicProgress,
  filterTasks,
  forecastCompletion,
  hoursByAssignee,
  hoursByLabel,
  hoursByTask,
  hoursByWeek,
  isOverdue,
  moveTask,
  PRIORITY_ORDER,
  type Project,
  type ProjectData,
  patchTask,
  removeTasks,
  ringDasharray,
  type SortDir,
  type SortKey,
  type Sprint,
  STATUS_LABEL,
  STATUS_ORDER,
  STORAGE_KEY_PREFIX,
  shiftTask,
  sortTasks,
  sprintCapacity,
  sprintTasks,
  type Task,
  type TaskFilter,
  type TaskPriority,
  type TaskStatus,
  type TimeEntry,
  tasksToCsv,
  teamVelocity,
  today,
  WORKSPACE_KEY,
  type Workspace,
} from '../lib/pm-store';

type MainTab = 'board' | 'list' | 'sprint' | 'hours' | 'epic' | 'io';

const STORAGE_VERSION = 1;

/** 单个项目的业务数据独立存一个键：coder-tools:pm:<projectId>。 */
function projectKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function parseProjectData(raw: string): ProjectData | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return null;
  const value = parsed as Partial<ProjectData>;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.sprints)) return null;
  return {
    tasks: value.tasks,
    sprints: value.sprints,
    epics: Array.isArray(value.epics) ? value.epics : [],
    entries: Array.isArray(value.entries) ? value.entries : [],
  };
}

/** 工作区索引（项目列表 + 当前项目）与项目数据分开存储。 */
function readWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const ws = parsed as Partial<Workspace>;
    if (!Array.isArray(ws.projects)) return null;
    const projects = ws.projects.filter((project): project is Project => typeof project?.id === 'string');
    // 逐个项目回填数据；缺键或损坏时退化为空数据，避免整个工作区不可用。
    const data: Record<string, ProjectData> = {};
    for (const project of projects) {
      const projectRaw = localStorage.getItem(projectKey(project.id));
      let projectData: ProjectData | null = null;
      if (projectRaw) {
        try {
          projectData = parseProjectData(projectRaw);
        } catch {
          projectData = null;
        }
      }
      data[project.id] = projectData ?? emptyProjectData();
    }
    const currentProjectId =
      typeof ws.currentProjectId === 'string' && projects.some((item) => item.id === ws.currentProjectId)
        ? ws.currentProjectId
        : (projects[0]?.id ?? '');
    return { version: STORAGE_VERSION, projects, currentProjectId, data };
  } catch {
    return null;
  }
}

function writeWorkspace(ws: Workspace): void {
  try {
    for (const project of ws.projects) {
      const data = ws.data[project.id];
      if (!data) continue;
      localStorage.setItem(projectKey(project.id), JSON.stringify(data));
    }
    // 清理已删除项目残留的键，避免 localStorage 越攒越多。
    const alive = new Set(ws.projects.map((project) => project.id));
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_KEY_PREFIX) || key === WORKSPACE_KEY) continue;
      if (!alive.has(key.slice(STORAGE_KEY_PREFIX.length))) localStorage.removeItem(key);
    }
    localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        projects: ws.projects,
        currentProjectId: ws.currentProjectId,
      }),
    );
  } catch {
    // 存储不可用（隐私模式/超额）时静默降级为仅本次会话有效
  }
}

/** 燃尽图：理想线 + 实际剩余量折线 + 今日竖线。 */
function BurndownChart({ points }: { points: BurndownPoint[] }) {
  const width = 520;
  const height = 160;
  const padL = 32;
  const padB = 22;
  const padT = 10;
  const padR = 8;
  // actual 为 null 表示未来日期，不参与折线与散点。
  const actuals = points
    .map((point, index) => ({ date: point.date, value: point.actual, index }))
    .filter((item): item is { date: string; value: number; index: number } => item.value !== null && item.value >= 0);
  const max = Math.max(1, ...points.map((point) => Math.max(point.ideal, point.actual ?? 0)));
  const x = (index: number) => padL + (index * (width - padL - padR)) / Math.max(1, points.length - 1);
  const y = (value: number) => padT + (1 - value / max) * (height - padT - padB);
  const idealPath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.ideal)}`).join(' ');
  const actualPath = actuals.map((item, i) => `${i === 0 ? 'M' : 'L'}${x(item.index)},${y(item.value)}`).join(' ');
  const todayIndex = actuals.length > 0 ? actuals[actuals.length - 1].index : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="迭代燃尽图">
      {[0, 0.5, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(max * ratio)}
            y2={y(max * ratio)}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <text x={4} y={y(max * ratio) + 3} fontSize="8" fill="var(--muted-foreground)">
            {Math.round(max * ratio)}
          </text>
        </g>
      ))}
      <text x={padL} y={height - 6} fontSize="8" fill="var(--muted-foreground)">
        {points[0]?.date.slice(5) ?? ''}
      </text>
      <text x={width - padR} y={height - 6} fontSize="8" textAnchor="end" fill="var(--muted-foreground)">
        {points[points.length - 1]?.date.slice(5) ?? ''}
      </text>
      <path d={idealPath} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="5 4" />
      {actualPath !== '' && <path d={actualPath} fill="none" stroke="var(--primary)" strokeWidth="2" />}
      {actuals.length > 0 && (
        <line
          x1={x(todayIndex)}
          x2={x(todayIndex)}
          y1={padT}
          y2={height - padB}
          stroke="var(--destructive)"
          strokeWidth="1"
          opacity="0.5"
        />
      )}
      {actuals.map((item) => (
        <circle key={item.date} cx={x(item.index)} cy={y(item.value)} r="2.5" fill="var(--primary)" />
      ))}
    </svg>
  );
}

/** 需求进度环。 */
function ProgressRing({ ratio }: { ratio: number }) {
  const { circumference, dash } = ringDasharray(ratio);
  return (
    <svg viewBox="0 0 40 40" className="size-9 shrink-0" role="img" aria-label={`完成度 ${Math.round(ratio * 100)}%`}>
      <circle cx="20" cy="20" r="15" fill="none" stroke="var(--border)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r="15"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" fontSize="10" textAnchor="middle" fill="var(--foreground)">
        {Math.round(ratio * 100)}
      </text>
    </svg>
  );
}

/** 横向条形图，用于工时占比。 */
function BarRows({ buckets, metric }: { buckets: Bucket[]; metric: 'estimated' | 'spent' }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket[metric]));
  if (buckets.length === 0) return <EmptyHint>暂无数据</EmptyHint>;
  return (
    <ul className="flex flex-col gap-1">
      {buckets.map((bucket) => (
        <li key={bucket.key} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={bucket.label}>
            {bucket.label}
          </span>
          <span className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <span
              className="block h-full rounded-sm bg-primary/70"
              style={{ width: `${Math.max(2, (bucket[metric] / max) * 100)}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right font-mono">{bucket[metric]}</span>
        </li>
      ))}
    </ul>
  );
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  P0: 'bg-destructive/15 text-destructive',
  P1: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  P2: 'bg-primary/15 text-primary',
  P3: 'bg-muted text-muted-foreground',
};

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`rounded px-1 py-0.5 font-mono text-[10px] ${PRIORITY_TONE[priority]}`}>{priority}</span>;
}

export default function ProjectMgmt() {
  const [workspace, setWorkspace] = useState<Workspace>(() => readWorkspace() ?? emptyWorkspace());
  const [tab, setTab] = useState<MainTab>('board');
  const [dirty, setDirty] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 变更后自动落盘，localStorage 不可用时静默失败。
  useEffect(() => {
    if (workspace.projects.length > 0) writeWorkspace(workspace);
  }, [workspace]);

  const project: Project | undefined = workspace.projects.find((item) => item.id === workspace.currentProjectId);
  const data: ProjectData = (project ? workspace.data[project.id] : undefined) ?? emptyProjectData();
  const now = today();

  const updateData = useCallback((next: ProjectData) => {
    setWorkspace((prev) => {
      const id = prev.currentProjectId;
      if (!id) return prev;
      return { ...prev, data: { ...prev.data, [id]: next } };
    });
  }, []);

  const note = useCallback((message: string | null) => setDirty(message), []);

  // ── 项目管理 ────────────────────────────────────────────────

  const addProject = useCallback(() => {
    const name = `项目 ${workspace.projects.length + 1}`;
    const id = `p_${Date.now().toString(36)}`;
    setWorkspace((prev) => ({
      ...prev,
      projects: [...prev.projects, { id, name, createdAt: new Date().toISOString() }],
      currentProjectId: id,
      data: { ...prev.data, [id]: emptyProjectData() },
    }));
    setTab('board');
  }, [workspace.projects.length]);

  const loadSample = useCallback(() => {
    setWorkspace(createSampleWorkspace());
    setTab('board');
    note('已填充示例数据，可在「导入导出」页删除或覆盖');
  }, [note]);

  // ── 任务编辑 ────────────────────────────────────────────────

  const addTask = useCallback(
    (status: TaskStatus = 'todo') => {
      const task = createTask({ title: '新任务', status, order: columnTasks(data.tasks, status).length });
      updateData({ ...data, tasks: [...data.tasks, task] });
    },
    [data, updateData],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => updateData({ ...data, tasks: patchTask(data.tasks, id, patch) }),
    [data, updateData],
  );

  const deleteTasks = useCallback(
    (ids: string[]) => {
      updateData(removeTasks(data, ids));
      note(`已删除 ${ids.length} 个任务`);
    },
    [data, note, updateData],
  );

  // 看板拖拽：记录来源列的下标，落位时插到目标位置。
  const [dragId, setDragId] = useState<string | null>(null);
  const onDrop = useCallback(
    (status: TaskStatus, index: number) => {
      if (!dragId) return;
      setDragId(null);
      setWorkspace((prev) => {
        const id = prev.currentProjectId;
        const prevData = id ? prev.data[id] : undefined;
        if (!id || !prevData) return prev;
        const tasks = moveTask(prevData.tasks, dragId, status, index);
        return { ...prev, data: { ...prev.data, [id]: { ...prevData, tasks } } };
      });
    },
    [dragId],
  );

  // ── 列表视图 ────────────────────────────────────────────────

  const [filter, setFilter] = useState<TaskFilter>(emptyFilter);
  const [batchAssignee, setBatchAssignee] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filterActive = Object.values(filter).some((value) => value !== '');
  const filtered = useMemo(() => filterTasks(data.tasks, filter), [data.tasks, filter]);
  const sorted = useMemo(() => sortTasks(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const allSelected = sorted.length > 0 && sorted.every((task) => selected.has(task.id));

  const batch = (patch: Partial<Task>) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    let tasks = data.tasks;
    for (const id of ids) tasks = patchTask(tasks, id, patch);
    updateData({ ...data, tasks });
    note(`已批量更新 ${ids.length} 个任务`);
  };

  // ── 迭代视图 ────────────────────────────────────────────────

  const [activeSprintId, setActiveSprintId] = useState<string>('');
  const currentSprint =
    data.sprints.find((sprint) => sprint.id === activeSprintId) ??
    data.sprints.find((sprint) => sprint.status === 'active') ??
    data.sprints[0];

  useEffect(() => {
    if (currentSprint && currentSprint.id !== activeSprintId) setActiveSprintId(currentSprint.id);
  }, [activeSprintId, currentSprint]);

  const addSprint = useCallback(() => {
    const start = addDays(now, 7);
    const sprint = createSprint({ name: `Sprint ${data.sprints.length + 1}`, start, end: addDays(start, 13) });
    updateData({ ...data, sprints: [...data.sprints, sprint] });
    setActiveSprintId(sprint.id);
  }, [data, now, updateData]);

  const patchSprint = useCallback(
    (id: string, patch: Partial<Sprint>) => {
      updateData({
        ...data,
        sprints: data.sprints.map((sprint) => (sprint.id === id ? { ...sprint, ...patch } : sprint)),
      });
      // 同一时间只允许一个进行中的迭代。
      if (patch.status === 'active') {
        updateData({
          ...data,
          sprints: data.sprints.map((sprint) =>
            sprint.id === id
              ? { ...sprint, ...patch }
              : sprint.status === 'active'
                ? { ...sprint, status: 'done' }
                : sprint,
          ),
        });
      }
    },
    [data, updateData],
  );

  const defer = useCallback(() => {
    if (!currentSprint) return;
    const next = data.sprints
      .filter((sprint) => sprint.status === 'planned' && sprint.start > currentSprint.end)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    updateData(deferUnfinished(data, currentSprint.id, next?.id));
    note(next ? `未完成任务已顺延到 ${next.name}` : '未完成任务已移出迭代（没有找到后续迭代）');
  }, [currentSprint, data, note, updateData]);

  // ── 工时视图 ────────────────────────────────────────────────

  const [entry, setEntry] = useState<TimeEntry>({ id: '', taskId: '', date: today(), hours: 1, note: '' });

  const addEntry = useCallback(() => {
    if (entry.taskId === '') {
      note('请先选择任务');
      return;
    }
    if (!(entry.hours > 0)) {
      note('工时必须大于 0');
      return;
    }
    const record: TimeEntry = { ...entry, id: `e_${Date.now().toString(36)}` };
    updateData({ ...data, entries: [...data.entries, record] });
    const task = data.tasks.find((item) => item.id === entry.taskId);
    if (task) {
      updateData({
        ...data,
        entries: [...data.entries, record],
        tasks: patchTask(data.tasks, task.id, { spentHours: (task.spentHours ?? 0) + entry.hours }),
      });
    }
    setEntry({ ...entry, id: '', hours: 1, note: '' });
    note('已记录工时');
  }, [data, entry, note, updateData]);

  const weekPoints = useMemo(() => hoursByWeek(data.entries, 8, now), [data.entries, now]);
  const forecast = useMemo(() => forecastCompletion(data, now), [data, now]);
  const maxWeek = Math.max(1, ...weekPoints.map((point) => point.spent));

  // ── 需求视图 ────────────────────────────────────────────────

  const [epicTitle, setEpicTitle] = useState('');
  const addEpic = useCallback(() => {
    if (epicTitle.trim() === '') return;
    updateData({ ...data, epics: [...data.epics, createEpic(epicTitle.trim())] });
    setEpicTitle('');
  }, [data, epicTitle, updateData]);

  const progress = useMemo(() => epicProgress(data), [data]);

  // ── 导入导出 ────────────────────────────────────────────────

  const sprintName = useCallback(
    (id: string) => data.sprints.find((sprint) => sprint.id === id)?.name ?? '',
    [data.sprints],
  );

  const [report, setReport] = useState('');

  const handleImport = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.json,application/json', multiple: false });
      const file = files[0];
      if (!file) return;
      const text = await readAsText(file);
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('不是有效的项目导出文件');
      const ws = parsed as Workspace;
      if (!Array.isArray(ws.projects) || typeof ws.data !== 'object') throw new Error('缺少 projects / data 字段');
      setWorkspace({
        version: STORAGE_VERSION,
        projects: ws.projects,
        currentProjectId: ws.currentProjectId,
        data: ws.data,
      });
      note(`已导入 ${ws.projects.length} 个项目（将覆盖当前工作区）`);
    } catch (error) {
      note(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [note]);

  const isEmpty = workspace.projects.length === 0;
  const sprintStats = currentSprint ? sprintCapacity(currentSprint, data) : null;
  const capacityNote =
    sprintStats === null || sprintStats.velocity <= 0
      ? '；完成一个迭代后即可看到速度基准'
      : sprintStats.planned > sprintStats.velocity
        ? `，历史速度 ${sprintStats.velocity}h/迭代，超出约 ${Math.round(((sprintStats.planned - sprintStats.velocity) / sprintStats.velocity) * 100)}%`
        : `，历史速度 ${sprintStats.velocity}h/迭代，在容量内`;
  const totalEstimate = data.tasks.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0);
  const totalSpent = data.tasks.reduce((sum, task) => sum + (task.spentHours ?? 0), 0);
  const doneCount = data.tasks.filter((task) => task.status === 'done').length;
  const overdueCount = data.tasks.filter((task) => isOverdue(task, now)).length;

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <KanbanSquare className="size-4" />
          项目管理
        </span>
      }
      description="本地看板、迭代燃尽与工时统计，数据存在浏览器里"
      actions={
        <>
          <Select
            ariaLabel="切换项目"
            value={workspace.currentProjectId}
            onChange={(value) => setWorkspace((prev) => ({ ...prev, currentProjectId: value }))}
            options={[
              ...(workspace.projects.length === 0 ? [{ value: '', label: '暂无项目' }] : []),
              ...workspace.projects.map((item) => ({ value: item.id, label: item.name })),
            ]}
            selectClassName="w-44"
          />
          <Button size="sm" variant="outline" onClick={addProject}>
            <Plus className="size-3.5" />
            新建项目
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="board" active={tab === 'board'}>
            看板
          </TabsTrigger>
          <TabsTrigger value="list" active={tab === 'list'}>
            列表
          </TabsTrigger>
          <TabsTrigger value="sprint" active={tab === 'sprint'}>
            迭代
          </TabsTrigger>
          <TabsTrigger value="hours" active={tab === 'hours'}>
            工时
          </TabsTrigger>
          <TabsTrigger value="epic" active={tab === 'epic'}>
            需求
          </TabsTrigger>
          <TabsTrigger value="io" active={tab === 'io'}>
            导入导出
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isEmpty ? (
        <EmptyHint>还没有项目。点「新建项目」从空白开始，或用下面的示例数据先看看效果。</EmptyHint>
      ) : (
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          {/* ── 左栏：看板 / 列表 / 需求 ── */}
          <div className="flex flex-col gap-2">
            {tab === 'board' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => addTask('todo')}>
                    <Plus className="size-3.5" />
                    新建任务
                  </Button>
                  <Hint>拖拽卡片换列；也可以用卡片上的 ◀ ▶ 按钮移动。</Hint>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2 overflow-auto pb-1 scrollbar-thin">
                  {STATUS_ORDER.map((status) => {
                    const column = columnTasks(data.tasks, status);
                    return (
                      <ul
                        key={status}
                        aria-label={`${STATUS_LABEL[status]} 列，${column.length} 个任务`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => onDrop(status, column.length)}
                        className="m-0 flex min-h-32 list-none flex-col gap-1.5 rounded-lg border border-dashed p-2"
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium">
                          <span>{STATUS_LABEL[status]}</span>
                          <span className="text-muted-foreground">{column.length}</span>
                        </div>
                        {column.map((task, index) => (
                          <li
                            key={task.id}
                            draggable
                            onDragStart={() => setDragId(task.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => onDrop(status, index)}
                            className="flex cursor-grab flex-col gap-1 rounded-md border bg-card p-2 text-[11px] active:cursor-grabbing"
                          >
                            <div className="flex items-start gap-1">
                              <PriorityBadge priority={task.priority} />
                              <span className="min-w-0 flex-1 break-words">{task.title}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                              {task.assignee && <span>@{task.assignee}</span>}
                              {task.estimateHours !== undefined && <span>预估 {task.estimateHours}h</span>}
                              {task.spentHours !== undefined && task.spentHours > 0 && (
                                <span>已投 {task.spentHours}h</span>
                              )}
                              {task.due && (
                                <span className={isOverdue(task, now) ? 'font-medium text-destructive' : ''}>
                                  {task.due.slice(5)}
                                  {isOverdue(task, now) ? ' 逾期' : ''}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-5"
                                aria-label="移动到上一状态"
                                disabled={status === STATUS_ORDER[0]}
                                onClick={() => updateData({ ...data, tasks: shiftTask(data.tasks, task.id, -1) })}
                              >
                                <ChevronLeft className="size-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-5"
                                aria-label="移动到下一状态"
                                disabled={status === STATUS_ORDER[STATUS_ORDER.length - 1]}
                                onClick={() => updateData({ ...data, tasks: shiftTask(data.tasks, task.id, 1) })}
                              >
                                <ChevronRight className="size-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="ml-auto size-5"
                                aria-label="删除任务"
                                onClick={() => deleteTasks([task.id])}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'list' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="状态"
                    value={filter.status}
                    onChange={(value) => setFilter({ ...filter, status: value as TaskStatus | 'all' })}
                    options={[
                      { value: 'all', label: '全部状态' },
                      ...STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
                    ]}
                  />
                  <Select
                    label="优先级"
                    value={filter.priority}
                    onChange={(value) => setFilter({ ...filter, priority: value as TaskPriority | 'all' })}
                    options={[
                      { value: 'all', label: '全部优先级' },
                      ...PRIORITY_ORDER.map((priority) => ({ value: priority, label: priority })),
                    ]}
                  />
                  <Select
                    label="负责人"
                    value={filter.assignee}
                    onChange={(value) => setFilter({ ...filter, assignee: value })}
                    options={[
                      { value: '', label: '全部负责人' },
                      ...allAssignees(data.tasks).map((name) => ({ value: name, label: name })),
                    ]}
                  />
                  <Select
                    label="迭代"
                    value={filter.sprintId}
                    onChange={(value) => setFilter({ ...filter, sprintId: value })}
                    options={[
                      { value: '', label: '全部迭代' },
                      { value: '__none__', label: '未指派迭代' },
                      ...data.sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
                    ]}
                  />
                  <Select
                    label="标签"
                    value={filter.label}
                    onChange={(value) => setFilter({ ...filter, label: value })}
                    options={[
                      { value: '', label: '全部标签' },
                      ...allLabels(data.tasks).map((label) => ({ value: label, label })),
                    ]}
                  />
                  <TextField
                    label="关键字"
                    value={filter.keyword}
                    onChange={(value) => setFilter({ ...filter, keyword: value })}
                    placeholder="标题、描述、负责人"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setFilter(emptyFilter())} disabled={!filterActive}>
                    <Eraser className="size-3.5" />
                    重置筛选
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    命中 {sorted.length} / {data.tasks.length} 条，已选 {selected.size}
                  </span>
                </div>
                <div className="flex-1 overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr>
                        <th className="p-1.5">
                          <Checkbox
                            label=""
                            checked={allSelected}
                            onChange={(checked) =>
                              setSelected(checked ? new Set(sorted.map((task) => task.id)) : new Set())
                            }
                            className="shrink-0"
                          />
                        </th>
                        {(
                          [
                            ['title', '标题'],
                            ['priority', '优先级'],
                            ['status', '状态'],
                            ['assignee', '负责人'],
                            ['due', '截止'],
                            ['estimateHours', '预估'],
                          ] as [SortKey, string][]
                        ).map(([key, label]) => (
                          <th
                            key={key}
                            className="cursor-pointer p-1.5 text-left font-medium select-none"
                            onClick={() => toggleSort(key)}
                          >
                            {label}
                            {sortKey === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((task) => (
                        <tr key={task.id} className="border-t hover:bg-accent/40">
                          <td className="p-1.5">
                            <Checkbox
                              label=""
                              checked={selected.has(task.id)}
                              onChange={(checked) => {
                                if (checked) {
                                  setSelected((prev) => new Set(prev).add(task.id));
                                } else {
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    next.delete(task.id);
                                    return next;
                                  });
                                }
                              }}
                              className="shrink-0"
                            />
                          </td>
                          <td className="max-w-40 truncate p-1.5" title={task.title}>
                            {task.title}
                          </td>
                          <td className="p-1.5">
                            <PriorityBadge priority={task.priority} />
                          </td>
                          <td className="p-1.5">
                            <Select
                              ariaLabel={`${task.title} 状态`}
                              value={task.status}
                              onChange={(value) => updateTask(task.id, { status: value as TaskStatus })}
                              options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
                              selectClassName="h-6 w-20 text-[10px]"
                            />
                          </td>
                          <td className="p-1.5">
                            <Input
                              aria-label={`${task.title} 负责人`}
                              value={task.assignee ?? ''}
                              onChange={(event) => updateTask(task.id, { assignee: event.target.value })}
                              className="h-6 w-16 px-1 text-[10px]"
                            />
                          </td>
                          <td className={`p-1.5 font-mono ${isOverdue(task, now) ? 'text-destructive' : ''}`}>
                            {task.due?.slice(5) ?? '—'}
                          </td>
                          <td className="p-1.5 font-mono">{task.estimateHours ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sorted.length === 0 && <EmptyHint>没有符合条件的任务</EmptyHint>}
                </div>
              </>
            )}

            {tab === 'epic' && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <TextField
                    label="新建需求（Epic）"
                    value={epicTitle}
                    onChange={setEpicTitle}
                    placeholder="如：账号与权限体系"
                    className="min-w-48 flex-1"
                  />
                  <Button size="sm" onClick={addEpic} disabled={epicTitle.trim() === ''}>
                    <Plus className="size-3.5" />
                    添加
                  </Button>
                </div>
                <Hint>
                  给任务加标签 <code>epic:&lt;需求名&gt;</code> 即可挂到需求下（示例数据已内置）。
                </Hint>
                <div className="flex flex-1 flex-col gap-2 overflow-auto scrollbar-thin">
                  {progress.length === 0 ? (
                    <EmptyHint>还没有需求层级</EmptyHint>
                  ) : (
                    progress.map((item) => (
                      <div key={item.epic.id} className="rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <ProgressRing ratio={item.ratio} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{item.epic.title}</p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {item.done}/{item.total} 子任务完成
                              {item.epic.desc ? ` · ${item.epic.desc}` : ''}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={`删除需求 ${item.epic.title}`}
                            onClick={() =>
                              updateData({ ...data, epics: data.epics.filter((epic) => epic.id !== item.epic.id) })
                            }
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        {item.children.length > 0 && (
                          <ul className="mt-1.5 flex flex-col gap-0.5 border-t pt-1.5 text-[11px]">
                            {item.children.map((task) => (
                              <li key={task.id} className="flex items-center gap-1.5">
                                <Checkbox
                                  label=""
                                  checked={task.status === 'done'}
                                  onChange={(checked) => updateTask(task.id, { status: checked ? 'done' : 'todo' })}
                                  className="shrink-0"
                                />
                                <span className={task.status === 'done' ? 'text-muted-foreground line-through' : ''}>
                                  {task.title}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {tab === 'sprint' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    ariaLabel="选择迭代"
                    value={currentSprint?.id ?? ''}
                    onChange={setActiveSprintId}
                    options={[
                      ...(data.sprints.length === 0 ? [{ value: '', label: '暂无迭代' }] : []),
                      ...data.sprints.map((sprint) => ({
                        value: sprint.id,
                        label: `${sprint.name}（${sprint.status}）`,
                      })),
                    ]}
                    selectClassName="w-48"
                  />
                  <Button size="sm" variant="outline" onClick={addSprint}>
                    <Plus className="size-3.5" />
                    新建迭代
                  </Button>
                  {currentSprint && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentSprint.status === 'active'}
                        onClick={() => patchSprint(currentSprint.id, { status: 'active' })}
                      >
                        开始
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={currentSprint.status === 'done'}
                        onClick={() => patchSprint(currentSprint.id, { status: 'done' })}
                      >
                        结束
                      </Button>
                      <Button size="sm" variant="outline" onClick={defer}>
                        顺延未完成
                      </Button>
                    </>
                  )}
                </div>
                {currentSprint ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="迭代名称"
                        value={currentSprint.name}
                        onChange={(value) => patchSprint(currentSprint.id, { name: value })}
                      />
                      <TextField
                        label="目标"
                        value={currentSprint.goal ?? ''}
                        onChange={(value) => patchSprint(currentSprint.id, { goal: value })}
                      />
                      <TextField
                        label="开始"
                        type="date"
                        value={currentSprint.start}
                        onChange={(value) => patchSprint(currentSprint.id, { start: value })}
                      />
                      <TextField
                        label="结束"
                        type="date"
                        value={currentSprint.end}
                        onChange={(value) => patchSprint(currentSprint.id, { end: value })}
                      />
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="mb-1 text-[11px] font-medium">燃尽图（剩余工时点）</p>
                      <BurndownChart points={burndownSeries(currentSprint, data, now)} />
                      <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                        <span>虚线 = 理想线</span>
                        <span>实线 = 实际剩余</span>
                        <span>红线 = 今天</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto rounded-md border scrollbar-thin">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-muted/80">
                          <tr>
                            <th className="p-1.5 text-left">任务</th>
                            <th className="p-1.5 text-left">状态</th>
                            <th className="p-1.5 text-left">预估</th>
                            <th className="p-1.5 text-left">已投</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sprintTasks(data, currentSprint.id).map((task) => (
                            <tr key={task.id} className="border-t">
                              <td className="max-w-40 truncate p-1.5">{task.title}</td>
                              <td className="p-1.5">
                                <Select
                                  ariaLabel={`${task.title} 所属迭代`}
                                  value={task.sprintId ?? ''}
                                  onChange={(value) => updateTask(task.id, { sprintId: value || undefined })}
                                  options={[
                                    { value: '', label: '未指派' },
                                    ...data.sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
                                  ]}
                                  selectClassName="h-6 w-28 text-[10px]"
                                />
                              </td>
                              <td className="p-1.5 font-mono">{task.estimateHours ?? '—'}</td>
                              <td className="p-1.5 font-mono">{task.spentHours ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <EmptyHint>还没有迭代，点「新建迭代」开始</EmptyHint>
                )}
              </>
            )}

            {tab === 'hours' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="任务"
                    value={entry.taskId}
                    onChange={(value) => setEntry({ ...entry, taskId: value })}
                    options={[
                      { value: '', label: '选择任务' },
                      ...data.tasks.map((task) => ({ value: task.id, label: task.title })),
                    ]}
                  />
                  <TextField
                    label="日期"
                    type="date"
                    value={entry.date}
                    onChange={(value) => setEntry({ ...entry, date: value })}
                  />
                  <NumberField
                    label="工时"
                    value={entry.hours}
                    onChange={(value) => setEntry({ ...entry, hours: value })}
                    min={0}
                    max={24}
                    step={0.5}
                    suffix="h"
                  />
                  <TextField
                    label="说明"
                    value={entry.note ?? ''}
                    onChange={(value) => setEntry({ ...entry, note: value })}
                    placeholder="做了什么"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={addEntry} disabled={entry.taskId === ''}>
                    <Plus className="size-3.5" />
                    记录工时
                  </Button>
                  <Hint>记录会同时累加到任务的「已投入」。</Hint>
                </div>
                <div className="rounded-md border p-2">
                  <p className="mb-1 text-[11px] font-medium">近 8 周工时</p>
                  <div className="flex h-20 items-end gap-1.5">
                    {weekPoints.map((point) => (
                      <div key={point.week} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-primary/70"
                          style={{ height: `${Math.max(2, (point.spent / maxWeek) * 100)}%` }}
                          title={`${point.week}：${point.spent} h`}
                        />
                        <span className="text-[9px] text-muted-foreground">{point.start.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Section title="按人" className="min-w-0">
                    <BarRows buckets={hoursByAssignee(data.tasks)} metric="spent" />
                  </Section>
                  <Section title="按标签" className="min-w-0">
                    <BarRows buckets={hoursByLabel(data.tasks)} metric="spent" />
                  </Section>
                </div>
                <div className="flex-1 overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr>
                        <th className="p-1.5 text-left">任务</th>
                        <th className="p-1.5 text-left">负责人</th>
                        <th className="p-1.5 text-left">预估</th>
                        <th className="p-1.5 text-left">已投</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hoursByTask(data.tasks).map((bucket) => (
                        <tr key={bucket.key} className="border-t">
                          <td className="max-w-40 truncate p-1.5">{bucket.label}</td>
                          <td className="p-1.5">{data.tasks.find((t) => t.id === bucket.key)?.assignee ?? '—'}</td>
                          <td className="p-1.5 font-mono">{bucket.estimated}</td>
                          <td className="p-1.5 font-mono">{bucket.spent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'io' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadText(
                        exportName('pm-workspace', 'json'),
                        JSON.stringify(workspace, null, 2),
                        'application/json;charset=utf-8',
                      )
                    }
                  >
                    <Download className="size-3.5" />
                    导出全部 JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadText(
                        exportName('pm-tasks', 'csv'),
                        tasksToCsv(data.tasks, sprintName),
                        'text/csv;charset=utf-8',
                      )
                    }
                  >
                    <Download className="size-3.5" />
                    导出当前项目 CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleImport()} disabled={busy}>
                    <FolderOpen className="size-3.5" />
                    导入 JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={loadSample}>
                    <Sparkles className="size-3.5" />
                    填充示例数据
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReport(buildDailyReport(data, project?.name ?? '未命名项目', now))}
                  >
                    生成日报
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReport(buildWeeklyReport(data, project?.name ?? '未命名项目', now))}
                  >
                    生成周报
                  </Button>
                  <ClearButton onClick={() => setReport('')} disabled={report === ''} />
                </div>
                <ResultBox
                  label="报告预览（Markdown，可直接粘贴到 IM 或 Issue）"
                  value={report}
                  onCopy={() => void copyText(report)}
                  rows="min-h-48"
                  fill
                />
              </>
            )}
          </div>

          {/* ── 右栏：概览 + 批量操作 ── */}
          <div className="flex flex-col gap-3 overflow-auto scrollbar-thin">
            <StatGrid>
              <Stat label="任务总数" value={data.tasks.length} />
              <Stat
                label="已完成"
                value={doneCount}
                tone="success"
                hint={`${Math.round((doneCount / Math.max(1, data.tasks.length)) * 100)}%`}
              />
              <Stat label="逾期" value={overdueCount} tone={overdueCount > 0 ? 'danger' : 'info'} />
              <Stat label="预估工时" value={`${totalEstimate}h`} />
              <Stat label="已投入" value={`${totalSpent}h`} />
              <Stat
                label="迭代"
                value={data.sprints.length}
                hint={`进行中 ${data.sprints.filter((s) => s.status === 'active').length}`}
              />
              <Stat label="需求" value={data.epics.length} />
              <Stat label="工时流水" value={data.entries.length} />
            </StatGrid>

            {selected.size > 0 && (
              <Section title={`已选 ${selected.size} 个任务`} description="批量操作立即生效">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    ariaLabel="批量改状态"
                    value=""
                    onChange={(value) => value !== '' && batch({ status: value as TaskStatus })}
                    options={[
                      { value: '', label: '改状态…' },
                      ...STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
                    ]}
                    selectClassName="w-28"
                  />
                  <Select
                    ariaLabel="批量改优先级"
                    value=""
                    onChange={(value) => value !== '' && batch({ priority: value as TaskPriority })}
                    options={[
                      { value: '', label: '改优先级…' },
                      ...PRIORITY_ORDER.map((priority) => ({ value: priority, label: priority })),
                    ]}
                    selectClassName="w-28"
                  />
                  <TextField
                    label="批量设负责人"
                    value={batchAssignee}
                    onChange={setBatchAssignee}
                    placeholder="负责人"
                    inputClassName="w-24"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={batchAssignee.trim() === ''}
                    onClick={() => {
                      batch({ assignee: batchAssignee.trim() });
                      setBatchAssignee('');
                    }}
                  >
                    应用
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      deleteTasks([...selected]);
                      setSelected(new Set());
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    删除
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    取消选择
                  </Button>
                </div>
              </Section>
            )}

            {sprintStats && currentSprint && (
              <Section
                title={`迭代容量：${currentSprint.name}`}
                description={`${currentSprint.start} ~ ${currentSprint.end}`}
              >
                <StatGrid>
                  <Stat label="需求" value={`${sprintStats.done}/${sprintStats.scopeTotal}`} />
                  <Stat label="计划工时" value={`${sprintStats.planned}h`} />
                  <Stat
                    label="已投入"
                    value={`${sprintStats.spent}h`}
                    tone={sprintStats.spent > sprintStats.planned ? 'warn' : 'info'}
                  />
                  <Stat
                    label="历史速度"
                    value={sprintStats.velocity > 0 ? `${sprintStats.velocity}h` : '暂无'}
                    hint="已结束迭代均值"
                  />
                </StatGrid>
                {sprintStats.planned > 0 && (
                  <Hint>
                    计划 {sprintStats.planned}h{capacityNote}。速度按已结束迭代里「已完成任务」的预估工时均值计算。
                  </Hint>
                )}
                <Hint>全局速度参考：{teamVelocity(data)} h/迭代。</Hint>
              </Section>
            )}

            <Section title="完成预测" description="按近 4 周实际投入速度估算">
              <StatGrid>
                <Stat label="未完成任务" value={forecast.remainingTasks} />
                <Stat label="剩余工时" value={`${forecast.remainingHours}h`} />
                <Stat label="当前周速度" value={forecast.perWeek > 0 ? `${forecast.perWeek}h` : '无数据'} />
                <Stat label="预计完成" value={forecast.eta} tone={forecast.healthy ? 'success' : 'warn'} />
              </StatGrid>
              <Hint>预测只做线性外推，不考虑优先级变化、插入任务与假期，请当参考而非承诺。</Hint>
            </Section>

            <Section title="工作区" description="项目与存储信息">
              <div className="flex flex-col gap-1.5">
                {workspace.projects.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[11px]">
                    <input
                      type="radio"
                      name="pm-project"
                      aria-label={`切换到 ${item.name}`}
                      className="size-3 accent-primary"
                      checked={item.id === workspace.currentProjectId}
                      onChange={() => setWorkspace((prev) => ({ ...prev, currentProjectId: item.id }))}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-muted-foreground">{workspace.data[item.id]?.tasks.length ?? 0} 任务</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label={`删除项目 ${item.name}`}
                      disabled={workspace.projects.length <= 1}
                      onClick={() =>
                        setWorkspace((prev) => {
                          const projects = prev.projects.filter((p) => p.id !== item.id);
                          const dataMap = { ...prev.data };
                          delete dataMap[item.id];
                          return {
                            ...prev,
                            projects,
                            data: dataMap,
                            currentProjectId:
                              prev.currentProjectId === item.id ? (projects[0]?.id ?? '') : prev.currentProjectId,
                          };
                        })
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Hint>
                存储键 {WORKSPACE_KEY}，单个项目另存 {`coder-tools:pm:${workspace.currentProjectId || '<projectId>'}`}。
              </Hint>
            </Section>

            {dirty && (
              <Note tone="info" title="最近操作">
                {dirty}
              </Note>
            )}
          </div>
        </div>
      )}

      {isEmpty && (
        <Section title="快速开始" description="两种进入方式">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={addProject}>
              <Plus className="size-3.5" />
              新建空项目
            </Button>
            <Button size="sm" variant="outline" onClick={loadSample}>
              <Sparkles className="size-3.5" />
              填充示例数据
            </Button>
          </div>
        </Section>
      )}

      <Note tone="warn" title="数据只在本机">
        全部数据存在浏览器
        localStorage，不上传任何服务器；清除浏览器数据、无痕窗口或换设备都会丢失，请定期用「导入导出」页导出 JSON 备份。
      </Note>

      <Section title="相关工具" description="同一工作流里常用的其他工具">
        <LinkList
          items={[
            {
              name: 'Git 命令速查',
              url: 'https://git-scm.com/docs',
              description: '分支、提交与回滚命令',
              tags: ['Git'],
            },
            {
              name: 'Conventional Commits',
              url: 'https://www.conventionalcommits.org/zh-hans/',
              description: '提交信息与语义化版本规范',
              tags: ['规范'],
            },
            {
              name: 'GitHub Flow',
              url: 'https://docs.github.com/zh/get-started/using-github/github-flow',
              description: '主干开发 + 特性开关的流程说明',
              tags: ['流程'],
            },
          ]}
        />
      </Section>
    </ToolPanel>
  );
}
