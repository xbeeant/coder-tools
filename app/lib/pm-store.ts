/**
 * 项目管理工具的纯逻辑层：数据模型、看板排序、迭代燃尽、工时统计与报告生成。
 * 本文件不含 React，也不做任何 IO，持久化由 app/tools/project-mgmt.tsx 负责。
 */

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type SprintStatus = 'planned' | 'active' | 'done';

export interface Task {
  id: string;
  title: string;
  desc?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  labels?: string[];
  estimateHours?: number;
  spentHours?: number;
  due?: string;
  createdAt: string;
  updatedAt: string;
  sprintId?: string;
  order: number;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  start: string;
  end: string;
  status: SprintStatus;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

/** 工时流水：一次录入对应一条记录，与任务的 spentHours 汇总互补。 */
export interface TimeEntry {
  id: string;
  taskId: string;
  date: string;
  hours: number;
  note?: string;
}

/** 需求层级：Epic 可挂子任务，看板外单独展示进度环。 */
export interface Epic {
  id: string;
  title: string;
  desc?: string;
}

/** 单个项目的全部业务数据。 */
export interface ProjectData {
  tasks: Task[];
  sprints: Sprint[];
  epics: Epic[];
  entries: TimeEntry[];
}

/** 整个工作区的数据：多项目 + 当前选中项目。 */
export interface Workspace {
  version: number;
  projects: Project[];
  currentProjectId: string;
  data: Record<string, ProjectData>;
}

export const STORAGE_KEY_PREFIX = 'coder-tools:pm:';
export const WORKSPACE_KEY = 'coder-tools:pm:__workspace__';

// ── 常量与字典 ────────────────────────────────────────────────

export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'done'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  review: '评审',
  done: '完成',
};

export const PRIORITY_ORDER: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
};

export const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planned: '未开始',
  active: '进行中',
  done: '已结束',
};

export const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 简单的本地 id 生成器：时间戳 + 随机串，够用且不依赖网络。 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── 空数据与构造 ──────────────────────────────────────────────

export function emptyProjectData(): ProjectData {
  return { tasks: [], sprints: [], epics: [], entries: [] };
}

export function emptyWorkspace(): Workspace {
  return { version: 1, projects: [], currentProjectId: '', data: {} };
}

export function today(): string {
  return toDateKey(new Date());
}

export function toDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** 两个日期键之间相差的天数（b - a）。 */
export function diffDays(a: string, b: string): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

export function createTask(input: Partial<Task> & { title: string }): Task {
  const now = new Date().toISOString();
  return {
    id: input.id ?? newId('t'),
    title: input.title,
    desc: input.desc,
    status: input.status ?? 'todo',
    priority: input.priority ?? 'P2',
    assignee: input.assignee,
    labels: input.labels ?? [],
    estimateHours: input.estimateHours,
    spentHours: input.spentHours,
    due: input.due,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    sprintId: input.sprintId,
    order: input.order ?? 0,
  };
}

export function createSprint(input: Partial<Sprint> & { name: string }): Sprint {
  const start = input.start ?? today();
  return {
    id: input.id ?? newId('s'),
    name: input.name,
    goal: input.goal,
    start,
    end: input.end ?? addDays(start, 13),
    status: input.status ?? 'planned',
  };
}

export function createEpic(title: string, desc?: string): Epic {
  return { id: newId('e'), title, desc };
}

/** 更新任务字段并刷新 updatedAt / order，组件层只调用这一个入口。 */
export function patchTask(tasks: Task[], id: string, patch: Partial<Task>): Task[] {
  const now = new Date().toISOString();
  return tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: now } : task));
}

/** 移除任务，同时清掉指向它的工时记录。 */
export function removeTasks(data: ProjectData, ids: string[]): ProjectData {
  const removed = new Set(ids);
  return {
    ...data,
    tasks: data.tasks.filter((task) => !removed.has(task.id)),
    entries: data.entries.filter((entry) => !removed.has(entry.taskId)),
  };
}

// ── 看板 ──────────────────────────────────────────────────────

/** 拖拽落位：把任务放到目标状态列的指定位置。 */
export function moveTask(tasks: Task[], id: string, status: TaskStatus, index: number): Task[] {
  const now = new Date().toISOString();
  const moving = tasks.find((task) => task.id === id);
  if (!moving) return tasks;
  const rest = tasks.filter((task) => task.id !== id);
  const column = rest.filter((task) => task.status === status).sort((a, b) => a.order - b.order);
  column.splice(Math.max(0, Math.min(index, column.length)), 0, moving);
  const orders = new Map(column.map((task, i) => [task.id, i]));
  // moving 本身不在 rest 里，map 无法产出它，必须单独补回，否则任务会凭空消失
  const updated = rest.map((task) => {
    const order = orders.get(task.id);
    return order === undefined ? task : { ...task, status, order, updatedAt: now };
  });
  return updated.concat({ ...moving, status, order: orders.get(id) as number, updatedAt: now });
}

/** 键盘/按钮降级：沿看板列顺序前后移动一格。 */
export function shiftTask(tasks: Task[], id: string, delta: number): Task[] {
  const moving = tasks.find((task) => task.id === id);
  if (!moving) return tasks;
  const next = STATUS_ORDER[STATUS_ORDER.indexOf(moving.status) + delta];
  if (!next) return tasks;
  return moveTask(tasks, id, next, Number.MAX_SAFE_INTEGER);
}

export function columnTasks(tasks: Task[], status: TaskStatus): Task[] {
  return tasks.filter((task) => task.status === status).sort((a, b) => a.order - b.order);
}

// ── 列表筛选与排序 ────────────────────────────────────────────

export interface TaskFilter {
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  assignee: string;
  label: string;
  sprintId: string;
  keyword: string;
}

export function emptyFilter(): TaskFilter {
  return { status: 'all', priority: 'all', assignee: '', label: '', sprintId: '', keyword: '' };
}

export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filter.status !== 'all' && task.status !== filter.status) return false;
    if (filter.priority !== 'all' && task.priority !== filter.priority) return false;
    if (filter.assignee !== '' && task.assignee !== filter.assignee) return false;
    if (filter.sprintId !== '' && filter.sprintId !== '__none__' && task.sprintId !== filter.sprintId) return false;
    if (filter.sprintId === '__none__' && task.sprintId) return false;
    if (filter.label !== '' && !(task.labels ?? []).includes(filter.label)) return false;
    if (keyword === '') return true;
    return [task.title, task.desc ?? '', task.assignee ?? '', (task.labels ?? []).join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
}

export type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'due' | 'estimateHours' | 'updatedAt';
export type SortDir = 'asc' | 'desc';

export function sortTasks(tasks: Task[], key: SortKey, dir: SortDir): Task[] {
  const weight = (task: Task): number | string => {
    if (key === 'status') return STATUS_ORDER.indexOf(task.status);
    if (key === 'priority') return PRIORITY_ORDER.indexOf(task.priority);
    if (key === 'assignee') return task.assignee ?? '￿';
    if (key === 'due') return task.due ?? '9999-99-99';
    if (key === 'estimateHours') return task.estimateHours ?? 0;
    if (key === 'updatedAt') return task.updatedAt;
    return task.title;
  };
  return [...tasks].sort((a, b) => {
    const left = weight(a);
    const right = weight(b);
    const cmp =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'zh-CN');
    return dir === 'asc' ? cmp : -cmp;
  });
}

/** 逾期判定：未完成且截止日期早于今天。 */
export function isOverdue(task: Task, now = today()): boolean {
  return task.status !== 'done' && !!task.due && task.due < now;
}

export function allAssignees(tasks: Task[]): string[] {
  return [...new Set(tasks.map((task) => task.assignee ?? '').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
}

export function allLabels(tasks: Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.labels ?? []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

// ── 迭代 ──────────────────────────────────────────────────────

export function sprintTasks(data: ProjectData, sprintId: string): Task[] {
  return data.tasks.filter((task) => task.sprintId === sprintId);
}

export function sprintTotalHours(tasks: Task[]): number {
  return round1(tasks.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0));
}

export function sprintSpentHours(tasks: Task[]): number {
  return round1(tasks.reduce((sum, task) => sum + (task.spentHours ?? 0), 0));
}

export interface BurndownPoint {
  date: string;
  ideal: number;
  remaining: number;
  actual: number | null;
}

/**
 * 燃尽图数据：ideal 为理想直线，actual 只在迭代开始日之后才有值。
 * 任务「体积」优先用已投入工时，其次预估工时，都没有则按 1 点计。
 */
export function burndownSeries(sprint: Sprint, data: ProjectData, now = today()): BurndownPoint[] {
  const tasks = sprintTasks(data, sprint.id);
  const size = (task: Task): number => task.spentHours ?? task.estimateHours ?? 1;
  const total = tasks.reduce((sum, task) => sum + size(task), 0);
  const span = Math.max(1, diffDays(sprint.start, sprint.end));
  const points: BurndownPoint[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(sprint.start, offset);
    const ideal = round1((total * (span - offset)) / span);
    if (date > now) {
      points.push({ date, ideal, remaining: -1, actual: null });
      continue;
    }
    const remaining = tasks
      .filter((task) => task.status !== 'done' || (task.updatedAt.slice(0, 10) > date && date < now))
      .reduce((sum, task) => sum + size(task), 0);
    points.push({ date, ideal, remaining: -1, actual: remaining });
  }
  return points;
}

export interface SprintCapacity {
  planned: number;
  spent: number;
  done: number;
  total: number;
  /** 历史速度：已结束迭代里已完成任务的预估工时均值。 */
  velocity: number;
  /** 需求数 / 已完成数。 */
  scopeDone: number;
  scopeTotal: number;
}

/** 团队速度取「已结束迭代」的已完成任务预估工时均值；没有历史时退回 0。 */
export function teamVelocity(data: ProjectData): number {
  const finished = data.sprints.filter((sprint) => sprint.status === 'done');
  const values = finished
    .map((sprint) =>
      sprintTasks(data, sprint.id)
        .filter((task) => task.status === 'done')
        .reduce((sum, task) => sum + (task.estimateHours ?? 0), 0),
    )
    .filter((value) => value > 0);
  if (values.length === 0) return 0;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export function sprintCapacity(sprint: Sprint, data: ProjectData): SprintCapacity {
  const tasks = sprintTasks(data, sprint.id);
  return {
    planned: sprintTotalHours(tasks),
    spent: sprintSpentHours(tasks),
    done: tasks.filter((task) => task.status === 'done').length,
    total: tasks.length,
    velocity: teamVelocity(data),
    scopeDone: tasks.filter((task) => task.status === 'done').length,
    scopeTotal: tasks.length,
  };
}

/** 顺延：把本迭代里未完成的任务移动到下一个迭代。 */
export function deferUnfinished(data: ProjectData, fromId: string, toId: string | undefined): ProjectData {
  const now = new Date().toISOString();
  return {
    ...data,
    tasks: data.tasks.map((task) =>
      task.sprintId === fromId && task.status !== 'done' ? { ...task, sprintId: toId, updatedAt: now } : task,
    ),
  };
}

// ── 工时统计 ──────────────────────────────────────────────────

export interface Bucket {
  key: string;
  label: string;
  estimated: number;
  spent: number;
  count: number;
}

/** 按任务 / 按人 / 按标签聚合工时。 */
export function hoursByTask(tasks: Task[]): Bucket[] {
  return sortBuckets(
    tasks.map((task) => ({
      key: task.id,
      label: task.title,
      estimated: task.estimateHours ?? 0,
      spent: task.spentHours ?? 0,
      count: 1,
    })),
  );
}

export function hoursByAssignee(tasks: Task[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const task of tasks) {
    const key = task.assignee || '未指派';
    const bucket = map.get(key) ?? { key, label: key, estimated: 0, spent: 0, count: 0 };
    bucket.estimated += task.estimateHours ?? 0;
    bucket.spent += task.spentHours ?? 0;
    bucket.count += 1;
    map.set(key, bucket);
  }
  return sortBuckets([...map.values()]);
}

export function hoursByLabel(tasks: Task[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const task of tasks) {
    const labels = task.labels && task.labels.length > 0 ? task.labels : ['无标签'];
    for (const label of labels) {
      const bucket = map.get(label) ?? { key: label, label, estimated: 0, spent: 0, count: 0 };
      bucket.estimated += task.estimateHours ?? 0;
      bucket.spent += task.spentHours ?? 0;
      bucket.count += 1;
      map.set(label, bucket);
    }
  }
  return sortBuckets([...map.values()]);
}

export interface WeekPoint {
  week: string;
  start: string;
  end: string;
  spent: number;
  estimated: number;
}

/** 以「周一」为起点聚合工时流水。 */
export function hoursByWeek(entries: TimeEntry[], weeks = 8, now = today()): WeekPoint[] {
  const monday = startOfWeek(now);
  const points: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 6);
    const inWeek = entries.filter((entry) => entry.date >= start && entry.date <= end);
    points.push({
      week: `${start.slice(5)} ~ ${end.slice(5)}`,
      start,
      end,
      spent: round1(inWeek.reduce((sum, entry) => sum + entry.hours, 0)),
      estimated: 0,
    });
  }
  return points;
}

export function startOfWeek(key: string): string {
  const date = fromDateKey(key);
  const offset = (date.getDay() + 6) % 7;
  return addDays(key, -offset);
}

export interface Forecast {
  remainingTasks: number;
  remainingHours: number;
  perWeek: number;
  weeks: number;
  eta: string;
  healthy: boolean;
}

/** 按近 4 周的实际速度估算完成时间；速度为 0 时给出保守提示。 */
export function forecastCompletion(data: ProjectData, now = today()): Forecast {
  const open = data.tasks.filter((task) => task.status !== 'done');
  const remainingHours = round1(
    open.reduce((sum, task) => sum + Math.max(0, (task.estimateHours ?? 0) - (task.spentHours ?? 0)), 0),
  );
  const recent = hoursByWeek(data.entries, 4, now);
  const total = recent.reduce((sum, point) => sum + point.spent, 0);
  const perWeek = total > 0 ? round1(total / recent.length) : teamVelocity(data);
  const weeks = perWeek > 0 ? Math.ceil(remainingHours / perWeek) : 0;
  return {
    remainingTasks: open.length,
    remainingHours,
    perWeek,
    weeks,
    eta: weeks === 0 ? '无法估算（无历史速度）' : addDays(now, weeks * 7),
    healthy: perWeek > 0 && remainingHours / Math.max(1, weeks) <= perWeek,
  };
}

// ── 需求层级 ──────────────────────────────────────────────────

export interface EpicProgress {
  epic: Epic;
  total: number;
  done: number;
  ratio: number;
  children: Task[];
}

export function epicProgress(data: ProjectData): EpicProgress[] {
  return data.epics.map((epic) => {
    const children = data.tasks.filter((task) => task.labels?.includes(`epic:${epic.id}`));
    const done = children.filter((task) => task.status === 'done').length;
    return { epic, total: children.length, done, ratio: children.length === 0 ? 0 : done / children.length, children };
  });
}

/** 圆环进度（0~1）对应的 SVG 圆环路径描述，供组件直接渲染。 */
export function ringDasharray(ratio: number): { circumference: number; dash: number } {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  return { circumference, dash: round1(circumference * clamped) };
}

// ── 导出与报告 ────────────────────────────────────────────────

function csvCell(value: string | number | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = ['标题', '状态', '优先级', '负责人', '标签', '预估工时', '已投入', '截止日期', '迭代', '更新时间'];

export function tasksToCsv(tasks: Task[], sprintName: (id: string) => string): string {
  const lines = [CSV_HEADER.join(',')];
  for (const task of tasks) {
    lines.push(
      [
        task.title,
        STATUS_LABEL[task.status],
        task.priority,
        task.assignee ?? '',
        (task.labels ?? []).join('|'),
        task.estimateHours ?? '',
        task.spentHours ?? '',
        task.due ?? '',
        task.sprintId ? sprintName(task.sprintId) : '',
        task.updatedAt.slice(0, 10),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sortBuckets(list: Bucket[]): Bucket[] {
  return list
    .map((bucket) => ({ ...bucket, estimated: round1(bucket.estimated), spent: round1(bucket.spent) }))
    .sort((a, b) => b.spent - a.spent || b.estimated - a.estimated);
}

function bullet(status: TaskStatus, task: Task): string {
  const mark = status === 'done' ? 'x' : ' ';
  const owner = task.assignee ? ` @${task.assignee}` : '';
  const pri = task.priority === 'P0' || task.priority === 'P1' ? ` **[${task.priority}]**` : '';
  const tags = (task.labels ?? []).filter((label) => !label.startsWith('epic:'));
  const label = tags.length > 0 ? ` (${tags.join(', ')})` : '';
  return `- [${mark}] ${task.title}${pri}${owner}${label}`;
}

/** 日报：按状态分组列出今天有变更或未完成的任务。 */
export function buildDailyReport(data: ProjectData, projectName: string, now = today()): string {
  const touched = data.tasks.filter(
    (task) => task.updatedAt.slice(0, 10) === now || (task.due !== undefined && task.due === now),
  );
  const open = data.tasks.filter((task) => task.status !== 'done');
  const doneToday = touched.filter((task) => task.status === 'done');
  const lines = [`# ${projectName} 日报 · ${now}`, ''];
  lines.push(`## 今日完成（${doneToday.length}）`);
  lines.push(...(doneToday.length > 0 ? doneToday.map((task) => bullet('done', task)) : ['- 无']));
  lines.push('', `## 进行中（${open.filter((t) => t.status !== 'todo').length}）`);
  const doing = open.filter((task) => task.status === 'doing' || task.status === 'review');
  lines.push(...(doing.length > 0 ? doing.map((task) => bullet(task.status, task)) : ['- 无']));
  lines.push('', `## 明日计划（${open.filter((t) => t.status === 'todo').length}）`);
  const todo = open.filter((task) => task.status === 'todo').slice(0, 8);
  lines.push(...(todo.length > 0 ? todo.map((task) => bullet('todo', task)) : ['- 无']));
  const overdue = open.filter((task) => isOverdue(task, now));
  lines.push('', `## 风险与阻塞（${overdue.length}）`);
  lines.push(
    ...(overdue.length > 0
      ? overdue.map((task) => `- ⚠ ${task.title}（截止 ${task.due}，已逾期 ${diffDays(task.due as string, now)} 天）`)
      : ['- 无']),
  );
  const spent = data.entries.filter((entry) => entry.date === now).reduce((sum, entry) => sum + entry.hours, 0);
  lines.push('', `## 今日投入工时：${round1(spent)} h`);
  return lines.join('\n');
}

/** 周报：按完成情况、优先级分布与工时汇总生成可直接粘贴的文本。 */
export function buildWeeklyReport(data: ProjectData, projectName: string, now = today()): string {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  const sprint = data.sprints.find((item) => item.status === 'active');
  const scope = sprint ? sprintTasks(data, sprint.id) : data.tasks;
  const doneThisWeek = data.tasks.filter(
    (task) =>
      task.status === 'done' && task.updatedAt.slice(0, 10) >= weekStart && task.updatedAt.slice(0, 10) <= weekEnd,
  );
  const open = data.tasks.filter((task) => task.status !== 'done');
  const weekEntries = data.entries.filter((entry) => entry.date >= weekStart && entry.date <= weekEnd);
  const lines = [
    `# ${projectName} 周报`,
    '',
    `> 周期：${weekStart} ~ ${weekEnd}　迭代：${sprint ? sprint.name : '未设置'}`,
    '',
  ];
  lines.push('## 一、本周完成');
  lines.push(...(doneThisWeek.length > 0 ? doneThisWeek.map((task) => bullet('done', task)) : ['- 无']));
  lines.push('', '## 二、下周计划');
  lines.push(...(open.length > 0 ? open.slice(0, 10).map((task) => bullet(task.status, task)) : ['- 无']));
  lines.push('', '## 三、进度概览');
  const capacity = sprint ? sprintCapacity(sprint, data) : null;
  lines.push(
    `- 迭代完成率：${scope.length === 0 ? '-' : `${Math.round((scope.filter((t) => t.status === 'done').length / scope.length) * 100)}%`}`,
  );
  if (capacity) {
    lines.push(`- 需求 ${capacity.done}/${capacity.total}，预估 ${capacity.planned} h，已投入 ${capacity.spent} h`);
    lines.push(`- 历史速度参考：${capacity.velocity} h/迭代`);
  }
  const byPriority = PRIORITY_ORDER.map((priority) => {
    const count = open.filter((task) => task.priority === priority).length;
    return `${priority} ${count}`;
  }).join('　');
  lines.push(`- 未完成任务优先级分布：${byPriority}`);
  lines.push('', '## 四、工时');
  const byPerson = hoursByAssignee(scope);
  for (const bucket of byPerson.slice(0, 8)) {
    lines.push(`- ${bucket.label}：预估 ${bucket.estimated} h / 已投入 ${bucket.spent} h（${bucket.count} 项）`);
  }
  lines.push(`- 本周流水合计：${round1(weekEntries.reduce((sum, entry) => sum + entry.hours, 0))} h`);
  const overdue = open.filter((task) => isOverdue(task, now));
  lines.push('', '## 五、风险与待决事项');
  lines.push(
    ...(overdue.length > 0
      ? overdue.map((task) => `- ⚠ ${task.title}（${task.assignee ?? '未指派'}，截止 ${task.due}）`)
      : ['- 无逾期任务']),
  );
  return lines.join('\n');
}

// ── 示例数据 ──────────────────────────────────────────────────

function offsetKey(base: string, days: number): string {
  return addDays(base, days);
}

function sampleTask(
  id: string,
  title: string,
  status: TaskStatus,
  priority: TaskPriority,
  assignee: string,
  estimate: number,
  spent: number,
  start: string,
  order: number,
  extra: Partial<Task> = {},
): Task {
  const created = offsetKey(start, -3);
  return {
    id,
    title,
    status,
    priority,
    assignee,
    labels: [],
    estimateHours: estimate,
    spentHours: spent,
    createdAt: `${created}T09:00:00.000Z`,
    updatedAt: `${offsetKey(start, order + 1)}T10:00:00.000Z`,
    order,
    ...extra,
  };
}

/** 首次打开时的一键示例：两个项目、两个迭代、若干任务与工时。 */
export function createSampleWorkspace(): Workspace {
  const now = today();
  const sprintStart = startOfWeek(addDays(now, -7));
  const previousStart = addDays(sprintStart, -14);

  const epics = [createEpic('账号与权限体系', '登录、会话与角色'), createEpic('计费与用量', '额度统计与账单')];

  const tasks: Task[] = [
    sampleTask('t_seed_1', '登录接口增加刷新令牌轮换', 'done', 'P0', '林一', 8, 9, sprintStart, 0, {
      labels: ['epic:PLACEHOLDER', 'backend', '安全'],
      due: offsetKey(sprintStart, 2),
      sprintId: 's_cur',
    }),
    sampleTask('t_seed_2', 'RBAC 中间件抽取到 packages/auth', 'done', 'P1', '周舟', 5, 6, sprintStart, 1, {
      labels: ['epic:PLACEHOLDER', 'refactor'],
      due: offsetKey(sprintStart, 3),
      sprintId: 's_cur',
    }),
    sampleTask('t_seed_3', '用量统计写入时序库', 'doing', 'P1', '林一', 13, 5, sprintStart, 2, {
      labels: ['epic:PLACEHOLDER2', 'backend'],
      due: offsetKey(sprintStart, 6),
      sprintId: 's_cur',
    }),
    sampleTask('t_seed_4', '账单导出 CSV', 'doing', 'P2', '陈迟', 8, 2, sprintStart, 3, {
      labels: ['epic:PLACEHOLDER2', 'frontend'],
      due: offsetKey(sprintStart, 8),
      sprintId: 's_cur',
    }),
    sampleTask('t_seed_5', '评审：额度校验的边界条件', 'review', 'P0', '周舟', 3, 3, sprintStart, 4, {
      labels: ['epic:PLACEHOLDER2'],
      due: offsetKey(sprintStart, 4),
      sprintId: 's_cur',
    }),
    sampleTask('t_seed_6', '登录页补充密码强度提示', 'todo', 'P2', '陈迟', 2, 0, sprintStart, 5, {
      labels: ['epic:PLACEHOLDER', 'frontend', 'ui'],
      due: offsetKey(sprintStart, 5),
    }),
    sampleTask('t_seed_7', '补齐登录链路的集成测试', 'todo', 'P1', '林一', 5, 0, sprintStart, 6, {
      labels: ['epic:PLACEHOLDER', 'test'],
    }),
    sampleTask('t_seed_8', '监控：刷新令牌失败率告警', 'todo', 'P3', '周舟', 3, 0, sprintStart, 7, {
      labels: ['ops'],
    }),
    sampleTask('t_seed_9', '统一错误码枚举', 'done', 'P2', '陈迟', 6, 5, previousStart, 0, {
      labels: ['refactor'],
      sprintId: 's_prev',
    }),
    sampleTask('t_seed_10', '依赖升级：Vite 6', 'done', 'P3', '林一', 2, 2, previousStart, 1, { labels: ['chore'] }),
  ];
  const epicA = epics[0].id;
  const epicB = epics[1].id;
  const resolved = tasks.map((task) => ({
    ...task,
    labels: (task.labels ?? []).map((label) => {
      if (label === 'epic:PLACEHOLDER') return `epic:${epicA}`;
      if (label === 'epic:PLACEHOLDER2') return `epic:${epicB}`;
      return label;
    }),
  }));

  const entries: TimeEntry[] = [
    { id: 'e1', taskId: 't_seed_1', date: offsetKey(sprintStart, 0), hours: 4, note: '令牌轮换实现' },
    { id: 'e2', taskId: 't_seed_1', date: offsetKey(sprintStart, 1), hours: 5, note: '兼容性测试' },
    { id: 'e3', taskId: 't_seed_2', date: offsetKey(sprintStart, 1), hours: 3, note: '中间件抽取' },
    { id: 'e4', taskId: 't_seed_2', date: offsetKey(sprintStart, 2), hours: 3, note: '单测补齐' },
    { id: 'e5', taskId: 't_seed_3', date: offsetKey(sprintStart, 2), hours: 5, note: '时序写入压测' },
    { id: 'e6', taskId: 't_seed_3', date: offsetKey(sprintStart, 4), hours: 0.0001, note: '' },
    { id: 'e7', taskId: 't_seed_4', date: offsetKey(sprintStart, 3), hours: 2, note: '导出接口联调' },
    { id: 'e8', taskId: 't_seed_5', date: offsetKey(sprintStart, 4), hours: 3, note: '评审前自测' },
    { id: 'e9', taskId: 't_seed_6', date: offsetKey(sprintStart, 5), hours: 1, note: 'UI 走查' },
  ];
  entries[5] = { id: 'e6', taskId: 't_seed_3', date: offsetKey(sprintStart, 3), hours: 2, note: '索引优化' };

  const sprints: Sprint[] = [
    {
      id: 's_cur',
      name: `Sprint ${addDays(sprintStart, -7).slice(0, 7)}`,
      goal: '完成令牌轮换与用量统计主线',
      start: sprintStart,
      end: offsetKey(sprintStart, 13),
      status: 'active',
    },
    {
      id: 's_prev',
      name: `Sprint ${previousStart.slice(0, 7)}`,
      goal: '技术债清理',
      start: previousStart,
      end: addDays(previousStart, 13),
      status: 'done',
    },
    {
      id: 's_next',
      name: 'Sprint 下一迭代',
      goal: '计费收尾与可观测性',
      start: offsetKey(sprintStart, 14),
      end: offsetKey(sprintStart, 27),
      status: 'planned',
    },
  ];

  return {
    version: 1,
    currentProjectId: 'p_demo',
    projects: [
      {
        id: 'p_demo',
        name: '示例项目 · 订阅计费',
        description: '内置示例数据，可直接体验看板、燃尽与工时统计',
        createdAt: `${addDays(sprintStart, -21)}T08:00:00.000Z`,
      },
      {
        id: 'p_ops',
        name: '示例项目 · 内部工具',
        description: '第二个项目，用于演示多项目切换',
        createdAt: `${addDays(sprintStart, -20)}T08:00:00.000Z`,
      },
    ],
    data: {
      p_demo: { tasks: resolved, sprints, epics, entries },
      p_ops: {
        tasks: [
          sampleTask('t_ops_1', '内部工单导出工具', 'doing', 'P2', '周舟', 5, 1, sprintStart, 0, {
            labels: ['tooling'],
            sprintId: 's_ops_1',
          }),
          sampleTask('t_ops_2', '清理僵尸告警规则', 'todo', 'P3', '陈迟', 2, 0, sprintStart, 1, { labels: ['ops'] }),
        ],
        sprints: [
          {
            id: 's_ops_1',
            name: 'Sprint 内部工具',
            start: sprintStart,
            end: offsetKey(sprintStart, 13),
            status: 'active',
          },
        ],
        epics: [],
        entries: [{ id: 'e_ops_1', taskId: 't_ops_1', date: offsetKey(sprintStart, 1), hours: 1, note: '接口联调' }],
      },
    },
  };
}
