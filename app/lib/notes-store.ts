/**
 * 笔记与知识库的纯逻辑层：数据模型、检索、双向链接解析、Markdown 安全渲染、
 * 任务提取、模板与力导向布局。本文件不含 React，所有计算都在本地内存中完成。
 */
import DOMPurify, { type Config } from 'dompurify';
import { marked } from 'marked';

// ────────────────────────────── 数据模型 ──────────────────────────────

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

export interface LinkRef {
  noteId: string;
  context: string;
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  builtin?: boolean;
}

export interface TodoItem {
  /** 0 起的行号，用于写回正文。 */
  line: number;
  text: string;
  done: boolean;
}

export interface NoteStats {
  total: number;
  words: number;
  tags: number;
  orphans: number;
  links: number;
  thisWeek: number;
}

export const NOTES_VERSION = 1;

export interface NotesSnapshot {
  version: number;
  notes: Note[];
  templates: NoteTemplate[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 本地日期的 YYYY-MM-DD，用于每日笔记标题与时间比较。 */
export function localDate(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

let idCounter = 0;

/** 时间戳 + 计数器 + 随机数，避免同一毫秒内创建多条笔记时主键冲突。 */
export function createId(prefix = 'note'): string {
  idCounter = (idCounter + 1) % 100000;
  const rand = Math.floor(Math.random() * 0x100000)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${rand}`;
}

export function createNote(partial: Partial<Note> = {}): Note {
  const at = partial.createdAt ?? nowIso();
  return {
    id: partial.id ?? createId(),
    title: partial.title ?? '未命名笔记',
    content: partial.content ?? '',
    tags: partial.tags ?? [],
    createdAt: at,
    updatedAt: partial.updatedAt ?? at,
    pinned: partial.pinned ?? false,
  };
}

const DAILY_TITLE = /^\d{4}-\d{2}-\d{2}$/;

export function isDailyNote(note: Note): boolean {
  return DAILY_TITLE.test(note.title.trim());
}

/** 只接受 YYYY-MM-DD，避免 Date 解析把非法日期滚到下个月。 */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function shiftDateKey(key: string, days: number): string {
  const date = parseDateKey(key);
  if (!date) return localDate();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

// ────────────────────────────── 双向链接 ──────────────────────────────

const WIKI_LINK = /\[\[([^[\]\n|]{1,120})(?:\|([^[\]\n]{1,120}))?\]\]/g;

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** 标题按小写去重：同名时保留最早创建的那条作为链接目标。 */
export function indexByTitle(notes: Note[]): Map<string, Note> {
  const map = new Map<string, Note>();
  for (const note of notes) {
    const key = normalizeTitle(note.title);
    if (key === '' || map.has(key)) continue;
    map.set(key, note);
  }
  return map;
}

/** 取出正文里全部 [[标题]] 的目标名（已去重、保持出现顺序）。 */
export function extractLinkTargets(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(WIKI_LINK)) {
    const target = (match[1] ?? '').trim();
    if (target !== '') out.push(target);
  }
  return [...new Set(out)];
}

/** 取出包含 [[…]] 的整行，用作反向链接的上下文。 */
export function extractLinkContexts(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split('\n')) {
    if (line.includes('[[')) out.push(line.trim().slice(0, 160));
  }
  return out;
}

export interface NoteLinks {
  /** 当前笔记指向的笔记。 */
  outgoing: Note[];
  /** 指向当前笔记的笔记（含上下文）。 */
  incoming: LinkRef[];
  /** 未匹配到标题的链接目标。 */
  missing: string[];
}

export function computeLinks(notes: Note[], current: Note | null): NoteLinks {
  const outgoing: Note[] = [];
  const missing: string[] = [];
  if (current) {
    const index = indexByTitle(notes);
    const seen = new Set<string>();
    for (const target of extractLinkTargets(current.content)) {
      const found = index.get(normalizeTitle(target));
      if (!found) {
        if (!missing.includes(target)) missing.push(target);
        continue;
      }
      if (found.id === current.id || seen.has(found.id)) continue;
      seen.add(found.id);
      outgoing.push(found);
    }
  }

  const incoming: LinkRef[] = [];
  if (current) {
    const key = normalizeTitle(current.title);
    for (const note of notes) {
      if (note.id === current.id) continue;
      const contexts = extractLinkContexts(note.content).filter((line) =>
        extractLinkTargets(line).some((target) => normalizeTitle(target) === key),
      );
      if (contexts.length > 0) incoming.push({ noteId: note.id, context: contexts[0] ?? '' });
    }
  }
  return { outgoing, incoming, missing };
}

/** 没有任何入链与出链的笔记，即孤立笔记。 */
export function orphanNotes(notes: Note[]): Note[] {
  const index = indexByTitle(notes);
  const linked = new Set<string>();
  for (const note of notes) {
    for (const target of extractLinkTargets(note.content)) {
      const found = index.get(normalizeTitle(target));
      if (found && found.id !== note.id) linked.add(found.id);
    }
  }
  return notes.filter((note) => !linked.has(note.id));
}

// ────────────────────────────── 检索与排序 ──────────────────────────────

export type SortKey = 'updated' | 'created' | 'title';

export interface SearchQuery {
  /** 去掉 #tag 与 [[跳转]] 后的普通关键字。 */
  text: string;
  /** #tag 语法解析出的标签，全部命中才算匹配。 */
  tags: string[];
  /** [[名称]] 语法解析出的跳转目标标题。 */
  jump: string | null;
}

export function parseSearch(raw: string): SearchQuery {
  const tags: string[] = [];
  let jump: string | null = null;
  const rest = raw.replace(/#([\p{L}\p{N}_-]{1,32})/gu, (_m, tag: string) => {
    tags.push(tag.toLowerCase());
    return ' ';
  });
  const stripped = rest.replace(/\[\[([^[\]\n|]{1,120})\]\]/g, (_m, target: string) => {
    if (jump === null) jump = target.trim();
    return ' ';
  });
  return { text: stripped.trim().toLowerCase(), tags: [...new Set(tags)], jump };
}

export interface FilterOptions {
  sort: SortKey;
  activeTags: string[];
  query: SearchQuery;
  /** 只看置顶时置为 true。 */
  pinnedOnly?: boolean;
}

export function filterNotes(notes: Note[], options: FilterOptions): Note[] {
  const { sort, activeTags, query } = options;
  let list = notes.slice();

  if (options.pinnedOnly) list = list.filter((note) => note.pinned);

  if (activeTags.length > 0) {
    list = list.filter((note) => activeTags.every((tag) => note.tags.some((item) => item.toLowerCase() === tag)));
  }

  if (query.text !== '') {
    list = list.filter((note) => haystack(note).includes(query.text));
  }
  if (query.tags.length > 0) {
    list = list.filter((note) => query.tags.every((tag) => note.tags.some((item) => item.toLowerCase() === tag)));
  }
  if (query.jump !== null) {
    const key = normalizeTitle(query.jump);
    list = list.filter((note) => normalizeTitle(note.title).includes(key));
  }

  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN');
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return list;
}

function haystack(note: Note): string {
  return `${note.title}\n${note.content}\n${note.tags.join(' ')}`.toLowerCase();
}

/** 按标签汇总笔记数，多的在前。 */
export function tagCounts(notes: Note[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const note of notes) {
    for (const raw of note.tags) {
      const tag = raw.trim();
      if (tag === '') continue;
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 标签调色板：暗色主题下都能看清的十六进制色。 */
export const TAG_COLOR_PALETTE = [
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#94a3b8',
] as const;

/** 按标签名稳定地映射到调色板颜色；用户自定义颜色可以覆盖它。 */
export function tagColor(tag: string, overrides: Record<string, string> = {}): string {
  const custom = overrides[tag];
  if (custom !== undefined && /^#[0-9a-fA-F]{6}$/.test(custom)) return custom;
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) >>> 0;
  }
  const color = TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
  return color ?? '#94a3b8';
}

/** 深色背景上的可读文字颜色：亮色用深字，暗色用白字。 */
export function tagTextColor(background: string): string {
  const hex = background.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  // 感知亮度（sRGB → 线性化）
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? '#0f172a' : '#f8fafc';
}

export function collectTags(notes: Note[]): string[] {
  return tagCounts(notes).map((item) => item.tag);
}

export function renameTag(notes: Note[], from: string, to: string): Note[] {
  const target = to.trim();
  if (target === '') return notes;
  return notes.map((note) =>
    note.tags.some((tag) => tag === from)
      ? { ...note, tags: [...new Set(note.tags.map((tag) => (tag === from ? target : tag)))], updatedAt: nowIso() }
      : note,
  );
}

export function removeTag(notes: Note[], tag: string): Note[] {
  return notes.map((note) =>
    note.tags.includes(tag) ? { ...note, tags: note.tags.filter((item) => item !== tag), updatedAt: nowIso() } : note,
  );
}

/** 中文按字计、西文按词计，与常见「字数」口径一致。 */
export function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g)?.length ?? 0;
  const words = text.replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  return cjk + words;
}

export function noteStats(notes: Note[]): NoteStats {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  let words = 0;
  let links = 0;
  for (const note of notes) {
    words += countWords(note.content);
    links += extractLinkTargets(note.content).length;
  }
  return {
    total: notes.length,
    words,
    tags: collectTags(notes).length,
    orphans: orphanNotes(notes).length,
    links,
    thisWeek: notes.filter((note) => new Date(note.createdAt).getTime() >= weekAgo).length,
  };
}

// ────────────────────────────── 任务提取 ──────────────────────────────

const TODO_LINE = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/;

export function extractTodos(content: string): TodoItem[] {
  const out: TodoItem[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = TODO_LINE.exec(lines[index] ?? '');
    if (!match) continue;
    out.push({ line: index, text: (match[3] ?? '').trim(), done: (match[2] ?? ' ').toLowerCase() === 'x' });
  }
  return out;
}

/** 勾选状态写回正文，保持原有的缩进与列表符号。 */
export function setTodoState(content: string, line: number, done: boolean): string {
  const lines = content.split('\n');
  const raw = lines[line];
  if (raw === undefined) return content;
  const match = TODO_LINE.exec(raw);
  if (!match) return content;
  lines[line] = `${match[1] ?? ''}- [${done ? 'x' : ' '}] ${match[3] ?? ''}`;
  return lines.join('\n');
}

export function todoProgress(todos: TodoItem[]): { done: number; total: number; rate: number } {
  const done = todos.filter((item) => item.done).length;
  const total = todos.length;
  return { done, total, rate: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** 渲染状态：输入 "[[" 后、闭合 "]]" 之前的这段文字。 */
export function pendingWikiTarget(value: string, cursor: number): { target: string; start: number } | null {
  const before = value.slice(0, Math.max(0, cursor));
  const match = /\[\[([^[\]\n]{0,120})$/.exec(before);
  if (!match) return null;
  const start = before.length - (match[1] ?? '').length - 2;
  return { target: match[1] ?? '', start };
}

/** 用选中的标题替换 [[… 未闭合部分。 */
export function applyWikiCompletion(value: string, cursor: number, title: string): { text: string; cursor: number } {
  const pending = pendingWikiTarget(value, cursor);
  if (!pending) return { text: value, cursor };
  const inserted = `[[${title}]]`;
  const text = `${value.slice(0, pending.start)}${inserted}${value.slice(cursor)}`;
  return { text, cursor: pending.start + inserted.length };
}

/** 正则替换 [[…]] 为一个不带括号的占位串，供搜索使用。 */
export function stripWikiLinks(text: string): string {
  return text.replace(WIKI_LINK, (_m, target: string, alias?: string) => alias ?? target);
}

// ────────────────────────────── Markdown 安全渲染 ──────────────────────────────

const PURIFY_CONFIG: Config = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta', 'svg'],
  FORBID_ATTR: ['style', 'formaction', 'srcdoc', 'ping', 'http-equiv'],
  // 正文需要携带 data-note-id / data-tag 供点击与筛选使用；data-* 本身不可执行。
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
  RETURN_TRUSTED_TYPE: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|tel|callto|sms):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text.replace(/[^\w-]/g, ''));
}

/** 代码块与行内代码先转成已转义的 HTML，避免正文里的 <div> 被当成标签渲染。 */
function protectCode(markdown: string): string {
  const withFences = markdown.replace(/```([\w+#.-]*)\n?([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    const cls = lang.trim() === '' ? '' : ` class="language-${escapeAttr(lang.trim())}"`;
    return `<pre><code${cls}>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`;
  });
  return withFences.replace(/`([^`\n]+)`/g, (_m, body: string) => `<code>${escapeHtml(body)}</code>`);
}

/** [[标题|别名]] → 锚点；#标签 → 标签胶囊。 */
function linkify(markdown: string, index: Map<string, Note>): string {
  return markdown
    .replace(WIKI_LINK, (_m, target: string, alias?: string) => {
      const name = (target ?? '').trim();
      const label = (alias ?? '').trim() || name;
      const found = index.get(normalizeTitle(name));
      const href = found ? `#note-${found.id}` : '#note-missing';
      return `<a href="${href}" data-note-id="${escapeAttr(found?.id ?? '')}" class="wiki-link${found ? '' : ' wiki-missing'}" data-wiki-name="${escapeAttr(name)}">${escapeHtml(label)}</a>`;
    })
    .replace(/(^|[\s(（])#([\p{L}\p{N}_/-]{1,32})/gu, (_m, lead: string, tag: string) => {
      return `${lead}<span class="md-tag" data-tag="${escapeAttr(tag.toLowerCase())}">#${escapeHtml(tag)}</span>`;
    });
}

/** 净化后把锚点改写成 data 属性，避免路由 hash 触发跳转。 */
function finalizeLinks(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#note-')) {
      const noteId = anchor.getAttribute('data-note-id') ?? '';
      anchor.removeAttribute('href');
      anchor.setAttribute('role', 'link');
      anchor.setAttribute('tabindex', '0');
      if (noteId !== '') anchor.setAttribute('data-note-target', noteId);
      anchor.classList.add('wiki-link');
    }
  }
  return doc.getElementById('root')?.innerHTML ?? '';
}

/**
 * Markdown → 可安全插入 DOM 的 HTML。
 * 先把代码、链接、标签转成受控标记，再交给 marked，最后过一遍 DOMPurify；
 * 净化不可用时整体降级为纯文本，绝不放行原始 HTML。
 */
export function renderNoteHtml(content: string, notes: Note[]): string {
  if (content.trim() === '') return '';
  const prepared = linkify(protectCode(content), indexByTitle(notes));
  let raw = '';
  try {
    raw = marked(prepared, { gfm: true, breaks: false, async: false }) as string;
  } catch {
    return `<pre class="whitespace-pre-wrap">${escapeHtml(content)}</pre>`;
  }
  let clean = '';
  try {
    clean = DOMPurify.sanitize(raw, PURIFY_CONFIG);
  } catch {
    clean = '';
  }
  if (clean === '' || /<\s*script\b|javascript:/i.test(clean)) {
    return `<pre class="whitespace-pre-wrap">${escapeHtml(content)}</pre>`;
  }
  return finalizeLinks(clean);
}

export function escapePlain(text: string): string {
  return escapeHtml(text);
}

/** 从渲染结果里解析出被点击的双向链接目标（找不到时返回 null）。 */
export function readLinkTarget(node: Element | null): string | null {
  const target = node?.getAttribute('data-note-target');
  return target && target !== '' ? target : null;
}

// ────────────────────────────── 模板 ──────────────────────────────

export const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    id: 'tpl-meeting',
    name: '会议纪要',
    description: '议题、结论与待办分工',
    builtin: true,
    content: [
      '# 会议纪要',
      '',
      '- 时间：',
      '- 参与人：',
      '- 主题：',
      '',
      '## 议题',
      '',
      '1. ',
      '',
      '## 结论',
      '',
      '- ',
      '',
      '## 待办',
      '',
      '- [ ] ',
    ].join('\n'),
  },
  {
    id: 'tpl-adr',
    name: '决策记录 ADR',
    description: '背景、方案对比与结论',
    builtin: true,
    content: [
      '# ADR：',
      '',
      '- 状态：提议 / 已接受 / 已废弃',
      '- 日期：',
      '- 决策人：',
      '',
      '## 背景',
      '',
      '为什么要做这个决策。',
      '',
      '## 方案',
      '',
      '### 方案 A',
      '',
      '- ',
      '',
      '### 方案 B',
      '',
      '- ',
      '',
      '## 结论',
      '',
      '选择 ',
      '',
      '## 后果',
      '',
      '- 正面：',
      '- 负面：',
    ].join('\n'),
  },
  {
    id: 'tpl-research',
    name: '技术调研',
    description: '候选方案与对比维度',
    builtin: true,
    content: [
      '# 调研：',
      '',
      '- 目标：',
      '- 约束：',
      '',
      '## 候选方案',
      '',
      '| 方案 | 优点 | 缺点 | 评分 |',
      '| --- | --- | --- | --- |',
      '|  |  |  |  |',
      '',
      '## 结论',
      '',
      '推荐 ',
      '',
      '## 参考',
      '',
      '- [[相关笔记]]',
    ].join('\n'),
  },
  {
    id: 'tpl-todo',
    name: '待办清单',
    description: '按天分组的任务列表',
    builtin: true,
    content: [
      '# 待办',
      '',
      '## 今天',
      '',
      '- [ ] ',
      '- [ ] ',
      '',
      '## 明天',
      '',
      '- [ ] ',
      '',
      '## 稍后',
      '',
      '- [ ] ',
    ].join('\n'),
  },
  {
    id: 'tpl-reading',
    name: '读书笔记',
    description: '摘要、要点与行动',
    builtin: true,
    content: [
      '# 《书名》读书笔记',
      '',
      '- 作者：',
      '- 读完时间：',
      '- 评分：',
      '',
      '## 一句话总结',
      '',
      '',
      '## 核心观点',
      '',
      '- ',
      '',
      '## 金句',
      '',
      '> ',
      '',
      '## 可以用在哪里',
      '',
      '- ',
    ].join('\n'),
  },
  {
    id: 'tpl-troubleshoot',
    name: '问题排查记录',
    description: '现象、日志、根因与修复',
    builtin: true,
    content: [
      '# 排查：',
      '',
      '- 时间：',
      '- 环境：',
      '- 影响面：',
      '',
      '## 现象',
      '',
      '',
      '## 排查过程',
      '',
      '1. ',
      '',
      '## 根因',
      '',
      '',
      '## 修复',
      '',
      '- 改动：',
      '- 验证：',
      '',
      '## 后续',
      '',
      '- [ ] 补充监控',
      '- [ ] 补充测试',
    ].join('\n'),
  },
];

export function dailyNoteContent(key: string): string {
  return [`# ${key}`, '', '## 今日计划', '', '- [ ] ', '', '## 记录', '', '', '## 待办回顾', '', '- [ ] '].join('\n');
}

export function parseTagsInput(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,，\s]+/)
        .map((item) => item.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ];
}

export function formatTagsInput(tags: string[]): string {
  return tags.join(', ');
}

// ────────────────────────────── 导入导出 ──────────────────────────────

export function toSnapshot(notes: Note[], templates: NoteTemplate[]): NotesSnapshot {
  return { version: NOTES_VERSION, notes, templates };
}

export function snapshotToJson(notes: Note[], templates: NoteTemplate[]): string {
  return JSON.stringify(toSnapshot(notes, templates), null, 2);
}

export function noteToMarkdown(note: Note): string {
  const meta = [
    `# ${note.title}`,
    '',
    ...(note.tags.length > 0 ? [`标签：${note.tags.map((tag) => `#${tag}`).join(' ')}`] : []),
    `- 创建：${note.createdAt}`,
    `- 更新：${note.updatedAt}`,
    '',
    '---',
    '',
  ].filter((line) => line !== '');
  return `${meta.join('\n')}\n${note.content}\n`;
}

export function notesToMarkdown(notes: Note[]): string {
  return `# 笔记导出\n\n导出时间：${nowIso()}\n共 ${notes.length} 篇\n\n${notes
    .map((note) => `<!-- note:${note.id} -->\n\n${noteToMarkdown(note)}`)
    .join('\n')}`;
}

export interface ImportResult {
  notes: Note[];
  templates: NoteTemplate[];
  /** 合并时被同 id 或同标题的已有笔记覆盖的条数。 */
  replaced: number;
  added: number;
  warnings: string[];
}

function sanitizeNote(raw: unknown): Note | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (title === '') return null;
  const created = typeof obj.createdAt === 'string' ? obj.createdAt : nowIso();
  return {
    id: typeof obj.id === 'string' && obj.id !== '' ? obj.id : createId(),
    title,
    content: typeof obj.content === 'string' ? obj.content : '',
    tags: Array.isArray(obj.tags) ? obj.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    createdAt: created,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : created,
    pinned: obj.pinned === true,
  };
}

/** 容错解析导出的 JSON 备份；字段缺失时尽量补齐而不是整体失败。 */
export function parseSnapshotJson(text: string): { notes: Note[]; templates: NoteTemplate[]; warnings: string[] } {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  const root = parsed as Record<string, unknown>;
  const rawNotes = Array.isArray(root?.notes) ? root.notes : Array.isArray(parsed) ? parsed : null;
  if (rawNotes === null) throw new Error('未找到 notes 数组，请确认是本工具导出的备份文件');
  const notes: Note[] = [];
  rawNotes.forEach((item, index) => {
    const note = sanitizeNote(item);
    if (note === null) warnings.push(`第 ${index + 1} 条缺少标题，已跳过`);
    else notes.push(note);
  });
  const templates: NoteTemplate[] = [];
  if (Array.isArray(root?.templates)) {
    for (const item of root.templates) {
      const tpl = item as Record<string, unknown>;
      if (typeof tpl?.name === 'string' && typeof tpl?.content === 'string') {
        templates.push({
          id: typeof tpl.id === 'string' ? tpl.id : createId('tpl'),
          name: tpl.name,
          description: typeof tpl.description === 'string' ? tpl.description : '',
          content: tpl.content,
          builtin: false,
        });
      }
    }
  }
  return { notes, templates, warnings };
}

/** 把导入的笔记合并进现有列表：同 id 视为覆盖，同标题同 id 不同则新分配 id。 */
export function mergeNotes(existing: Note[], incoming: Note[]): ImportResult {
  const byId = new Map(existing.map((note) => [note.id, note]));
  const titles = new Set(existing.map((note) => normalizeTitle(note.title)));
  let replaced = 0;
  let added = 0;
  const result = existing.slice();
  for (const note of incoming) {
    const key = normalizeTitle(note.title);
    const conflict = byId.has(note.id) || titles.has(key);
    let id = note.id;
    if (conflict && !byId.has(id)) {
      id = createId();
    }
    const merged: Note = { ...note, id };
    const index = result.findIndex((item) => item.id === id);
    if (index >= 0) {
      result[index] = merged;
      replaced += 1;
    } else {
      result.push(merged);
      added += 1;
    }
    byId.set(id, merged);
    titles.add(key);
  }
  return { notes: result, templates: [], replaced, added, warnings: [] };
}

/** 单篇 Markdown 反解析：首个一级标题作为标题，元信息行作为标签。 */
export function parseMarkdownNote(text: string, fallbackTitle: string): Note {
  const lines = text.split('\n');
  let title = '';
  let body = text;
  const tags: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('<!-- note:')) continue;
    if (line === '---') {
      body = lines.slice(index + 1).join('\n');
      break;
    }
    const tagLine = /^标签：(.+)$/.exec(line);
    if (tagLine) {
      for (const tag of tagLine[1]?.split(/\s+/) ?? []) {
        const clean = tag.replace(/^#/, '').trim();
        if (clean !== '') tags.push(clean);
      }
      continue;
    }
    if (/^#\s+/.test(line) && title === '') {
      title = line.replace(/^#\s+/, '').trim();
      body = lines.slice(index + 1).join('\n');
    }
  }
  return createNote({
    title: title !== '' ? title : fallbackTitle.replace(/\.md$/i, ''),
    content: body.replace(/^\s+/, ''),
    tags,
  });
}

// ────────────────────────────── 力导向关系图 ──────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 拖拽或用户固定后不再参与位移。 */
  fixed: boolean;
  /** 用户主动固定的节点用不同样式标记。 */
  pinned: boolean;
  degree: number;
  active: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphLayoutOptions {
  width: number;
  height: number;
  /** 斥力强度。 */
  repulsion: number;
  /** 弹簧静止长度。 */
  springLength: number;
  springStrength: number;
  /** 向心力，节点越多越小，避免图铺开。 */
  centerStrength: number;
  damping: number;
}

export const DEFAULT_LAYOUT: Omit<GraphLayoutOptions, 'width' | 'height'> = {
  repulsion: 5200,
  springLength: 110,
  springStrength: 0.035,
  centerStrength: 0.012,
  damping: 0.82,
};

/** 超过此数量时关系图会截断，交互才不会卡顿。 */
export const GRAPH_NODE_LIMIT = 80;

/** 按 id 做一次简单散列，得到稳定的初始角度，保证同一条笔记每次布局起点一致。 */
function hashAngle(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 因超过节点上限而未纳入的笔记数。 */
  truncated: number;
}

export function buildGraph(notes: Note[], activeId: string | null): GraphData {
  const index = indexByTitle(notes);
  const sorted = notes
    .map((note) => ({ note, degree: extractLinkTargets(note.content).length }))
    .sort((a, b) => {
      if (a.note.id === activeId) return -1;
      if (b.note.id === activeId) return 1;
      if (b.degree !== a.degree) return b.degree - a.degree;
      return b.note.updatedAt.localeCompare(a.note.updatedAt);
    });
  const kept = sorted.slice(0, GRAPH_NODE_LIMIT);
  const keptIds = new Set(kept.map((item) => item.note.id));

  const nodes: GraphNode[] = kept.map((item, index) => {
    const angle = (index / Math.max(1, kept.length)) * Math.PI * 2 + hashAngle(item.note.id) * 0.4;
    const radius = 120 + hashAngle(item.note.id) * 160;
    return {
      id: item.note.id,
      label: item.note.title,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      fixed: false,
      pinned: false,
      degree: item.degree,
      active: item.note.id === activeId,
    };
  });

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const { note } of kept) {
    if (!keptIds.has(note.id)) continue;
    for (const target of extractLinkTargets(note.content)) {
      const found = index.get(normalizeTitle(target));
      if (!found || found.id === note.id || !keptIds.has(found.id)) continue;
      const key = `${note.id}->${found.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target: found.id });
    }
  }
  for (const node of nodes) {
    node.degree = edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
  }
  return { nodes, edges, truncated: sorted.length - kept.length };
}

const MAX_STEP_DISTANCE = 60;

/**
 * 一步力导向迭代：斥力（节点两两互斥）+ 弹簧（链接连线）+ 向心力。
 * alpha 由调用方随时间衰减，收敛后即可停止 rAF 循环。
 */
export function stepLayout(nodes: GraphNode[], edges: GraphEdge[], options: GraphLayoutOptions, alpha: number): void {
  const { width, height, repulsion, springLength, springStrength, centerStrength, damping } = options;
  const cx = width / 2;
  const cy = height / 2;

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (a.fixed) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 1) {
        // 完全重合时按 id 派生一个固定方向的微小偏移，避免除零后抖动。
        dx = (hashAngle(a.id) - 0.5) * 2;
        dy = (hashAngle(b.id) - 0.5) * 2;
        distSq = dx * dx + dy * dy + 0.01;
      }
      const dist = Math.sqrt(distSq);
      const force = (repulsion / distSq) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      if (!b.fixed) {
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  for (const edge of edges) {
    const a = nodes.find((node) => node.id === edge.source);
    const b = nodes.find((node) => node.id === edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const force = (dist - springLength) * springStrength * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.fixed) {
      a.vx += fx;
      a.vy += fy;
    }
    if (!b.fixed) {
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  for (const node of nodes) {
    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx -= (node.x - cx) * centerStrength * alpha;
    node.vy -= (node.y - cy) * centerStrength * alpha;
    node.vx *= damping;
    node.vy *= damping;
    node.vx = Math.max(-MAX_STEP_DISTANCE, Math.min(MAX_STEP_DISTANCE, node.vx));
    node.vy = Math.max(-MAX_STEP_DISTANCE, Math.min(MAX_STEP_DISTANCE, node.vy));
    node.x += node.vx;
    node.y += node.vy;
    // 限制在画布内留出边距，节点不会被拖到看不见的地方。
    node.x = Math.max(24, Math.min(width - 24, node.x));
    node.y = Math.max(20, Math.min(height - 20, node.y));
  }
}

/** 节点标签太长时截断，SVG 里文字宽度不可测，直接按字符数裁剪更稳。 */
export function graphLabel(label: string, max = 12): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}
