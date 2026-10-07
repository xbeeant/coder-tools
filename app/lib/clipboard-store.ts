/**
 * 剪贴板历史与格式化粘贴的纯逻辑层：类型识别、文本清洗与转换、正则黑名单、
 * 动作（片段模板）求值。所有数据仅存 localStorage，不做任何网络同步。
 */
import { base64ToBytes, bytesToBase64, bytesToUtf8, randomIndex, toBytes, utf8ToBytes } from './bytes';

// ────────────────────────────── 数据模型 ──────────────────────────────

export type ClipType = 'text' | 'json' | 'url' | 'code' | 'number' | 'uuid' | 'color' | 'timestamp';

export const CLIP_TYPE_LABELS: Record<ClipType, string> = {
  text: '文本',
  json: 'JSON',
  url: 'URL',
  code: '代码',
  number: '数字',
  uuid: 'UUID',
  color: '颜色',
  timestamp: '时间戳',
};

export interface ClipEntry {
  id: string;
  content: string;
  type: ClipType;
  createdAt: string;
  /** 来源标签，例如「粘贴」「手动」「读取剪贴板」。 */
  source: string;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
}

export const CLIPBOARD_KEY = 'coder-tools:clipboard';

export interface ClipSettings {
  /** 关闭后完全不记录历史。 */
  record: boolean;
  /** 命中黑名单正则时直接跳过，不入库。 */
  blacklistEnabled: boolean;
  blacklist: string;
  /** 切换工具时清空历史。 */
  clearOnLeave: boolean;
  maxEntries: number;
  keepDays: number;
}

export const DEFAULT_SETTINGS: ClipSettings = {
  record: true,
  blacklistEnabled: true,
  // 默认拦下明显的凭据类内容，避免 localStorage 里留下敏感文本
  blacklist: 'password|passwd|pwd|token|secret|private[ _-]?key|私钥|密钥|BEGIN [A-Z ]*PRIVATE KEY',
  clearOnLeave: false,
  maxEntries: 500,
  keepDays: 30,
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function createClipId(): string {
  return `clip-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
}

// ────────────────────────────── 类型识别 ──────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i;
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const TIMESTAMP_SEC = /^\d{10}$/;
const TIMESTAMP_MS = /^\d{13}$/;

const CODE_HINT =
  /^\s*(?:[a-zA-Z_$][\w$]*\s*[=:({[]|\/\/|#!|<\/?[a-zA-Z!]|\b(?:function|const|let|var|class|def|import|from|SELECT|FROM|WHERE|public|return)\b)/m;

/** 自动识别片段类型；只看形态，不做解析副作用。 */
export function detectType(raw: string): ClipType {
  const text = raw.trim();
  if (text === '') return 'text';
  if (UUID.test(text)) return 'uuid';
  if (HEX_COLOR.test(text) || RGB_COLOR.test(text)) return 'color';
  if (TIMESTAMP_SEC.test(text) || TIMESTAMP_MS.test(text)) return 'timestamp';
  if (URL_TEST.test(text)) return 'url';
  const first = text[0] ?? '';
  const last = text[text.length - 1] ?? '';
  if ((first === '{' && last === '}') || (first === '[' && last === ']')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // 不是合法 JSON，继续往下判断
    }
  }
  if (NUMBER.test(text.replace(/\s/g, ''))) return 'number';
  if (text.includes('\n') && CODE_HINT.test(text)) return 'code';
  if (text.includes('\n') || text.includes(';') || CODE_HINT.test(text)) return 'code';
  return 'text';
}

const URL_TEST = (() => {
  try {
    // 构造一个 URL 解析器实例比每次 new URL 更省，这里只做构造校验。
    // eslint 无关：URL_TEST 只用于形状判定，真正的解析在 format 里。
    return /^(?:https?|ftp|file):\/\/\S+$|^(?:[\w-]+\.)+[a-z]{2,}(?:\/\S*)?$/i;
  } catch {
    return /$^/;
  }
})();

export function parseUrl(text: string): URL | null {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

// ────────────────────────────── 历史维护 ──────────────────────────────

export interface DedupResult {
  entries: ClipEntry[];
  /** 与既有内容重复而被丢弃的条数。 */
  duplicates: number;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** 追加一条记录：窗口期内相同内容只保留最新的那条。 */
export function appendClip(entries: ClipEntry[], input: ClipEntry, limit = DEFAULT_SETTINGS.maxEntries): DedupResult {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  let duplicates = 0;
  const kept = entries.filter((entry) => {
    if (entry.content !== input.content) return true;
    duplicates += 1;
    // 置顶/收藏的条目不因重复被丢弃。
    if (entry.pinned || entry.favorite) return true;
    return new Date(entry.createdAt).getTime() < cutoff;
  });
  const next = [input, ...kept];
  return { entries: next.slice(0, Math.max(1, limit)), duplicates };
}

export type ClipSort = 'time' | 'type';

export interface ClipFilter {
  query: string;
  types: ClipType[];
  tags: string[];
  sort: ClipSort;
  favoritesOnly?: boolean;
}

export function filterClips(entries: ClipEntry[], filter: ClipFilter): ClipEntry[] {
  const key = filter.query.trim().toLowerCase();
  const list = entries.filter((entry) => {
    if (filter.favoritesOnly === true && !entry.favorite) return false;
    if (filter.types.length > 0 && !filter.types.includes(entry.type)) return false;
    if (filter.tags.length > 0 && !filter.tags.every((tag) => entry.tags.includes(tag))) return false;
    if (key !== '' && !`${entry.content}\n${entry.tags.join(' ')}\n${entry.source}`.toLowerCase().includes(key))
      return false;
    return true;
  });
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (filter.sort === 'type') return a.type.localeCompare(b.type) || b.createdAt.localeCompare(a.createdAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
  return list;
}

/** 按时间清理：保留最近 N 条与最近 N 天内的条目。 */
export function pruneClips(entries: ClipEntry[], keepDays: number, maxEntries: number): ClipEntry[] {
  const cutoff = Date.now() - Math.max(1, keepDays) * 24 * 3600 * 1000;
  return entries
    .filter((entry) => entry.pinned || entry.favorite || new Date(entry.createdAt).getTime() >= cutoff)
    .slice(0, Math.max(1, maxEntries));
}

export function collectTags(entries: ClipEntry[]): string[] {
  const map = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

/** 编译黑名单；非法正则按原样退回（跳过而不是让整个功能挂掉）。 */
export function compileBlacklist(pattern: string): { regex: RegExp | null; invalid: boolean } {
  const text = pattern.trim();
  if (text === '') return { regex: null, invalid: false };
  try {
    return { regex: new RegExp(text, 'i'), invalid: false };
  } catch {
    return { regex: null, invalid: true };
  }
}

export function matchesBlacklist(content: string, pattern: string): { blocked: boolean; invalid: boolean } {
  const { regex, invalid } = compileBlacklist(pattern);
  if (invalid) return { blocked: false, invalid: true };
  if (regex === null) return { blocked: false, invalid: false };
  return { blocked: regex.test(content), invalid: false };
}

export function toMarkdown(entries: ClipEntry[]): string {
  const head = [`# 剪贴板历史导出`, '', `导出时间：${nowIso()}`, `共 ${entries.length} 条`, ''].join('\n');
  const body = entries
    .map((entry) =>
      [
        `## ${entry.createdAt} · ${CLIP_TYPE_LABELS[entry.type]}${entry.pinned ? ' · 置顶' : ''}${entry.favorite ? ' · 收藏' : ''}`,
        ...(entry.tags.length > 0 ? [`标签：${entry.tags.map((tag) => `#${tag}`).join(' ')}`] : []),
        `来源：${entry.source}`,
        '',
        '```',
        entry.content,
        '```',
        '',
      ].join('\n'),
    )
    .join('\n');
  return `${head}\n${body}`;
}

export function parseImportJson(text: string): ClipEntry[] {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed) ? parsed : null;
  if (list === null) throw new Error('不是本工具导出的 JSON 数组');
  const out: ClipEntry[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.content !== 'string' || raw.content === '') continue;
    out.push({
      id: typeof raw.id === 'string' ? raw.id : createClipId(),
      content: raw.content,
      type:
        typeof raw.type === 'string' && raw.type in CLIP_TYPE_LABELS ? (raw.type as ClipType) : detectType(raw.content),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
      source: typeof raw.source === 'string' ? raw.source : '导入',
      pinned: raw.pinned === true,
      favorite: raw.favorite === true,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    });
  }
  return out;
}

// ────────────────────────────── 文本清洗与转换 ──────────────────────────────

export type CaseStyle =
  | 'lower'
  | 'upper'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'title'
  | 'dot'
  | 'path';

export const CASE_LABELS: Record<CaseStyle, string> = {
  lower: '全小写',
  upper: '全大写',
  camel: '驼峰 camelCase',
  pascal: '帕斯卡 PascalCase',
  snake: '下划线 snake_case',
  kebab: '短横线 kebab-case',
  constant: '常量 CONSTANT_CASE',
  title: '标题 Title Case',
  dot: '点分 a.b.c',
  path: '路径 a/b/c',
};

/** 按分隔符切词：支持驼峰、下划线、短横线、空格、点、斜杠。 */
export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-./\\]+/)
    .map((word) => word.trim())
    .filter((word) => word !== '');
}

export function convertCase(text: string, style: CaseStyle): string {
  const parts = words(text);
  if (style === 'lower') return text.toLowerCase();
  if (style === 'upper') return text.toUpperCase();
  if (parts.length === 0) return text;
  const lower = parts.map((part) => part.toLowerCase());
  const cap = lower.map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  if (style === 'camel') return lower[0] + cap.slice(1).join('');
  if (style === 'pascal') return cap.join('');
  if (style === 'snake') return lower.join('_');
  if (style === 'kebab') return lower.join('-');
  if (style === 'constant') return lower.join('_').toUpperCase();
  if (style === 'dot') return lower.join('.');
  if (style === 'path') return lower.join('/');
  return lower.map((part, index) => (index === 0 ? (cap[0] ?? part) : (cap[index] ?? part))).join(' ');
}

export type CleanOp =
  | 'trim'
  | 'drop-empty'
  | 'drop-dupe'
  | 'keep-dupe'
  | 'sort'
  | 'reverse'
  | 'strip-space'
  | 'lf'
  | 'crlf'
  | 'strip-invisible'
  | 'unescape'
  | 'add-prefix'
  | 'add-suffix';

export const CLEAN_LABELS: Record<CleanOp, string> = {
  trim: '去除首尾空白',
  'drop-empty': '删除空行',
  'drop-dupe': '行去重（保留首次出现）',
  'keep-dupe': '保留重复行',
  sort: '按字典序排序',
  reverse: '反转行序',
  'strip-space': '删除所有空白',
  lf: '换行统一为 LF',
  crlf: '换行统一为 CRLF',
  'strip-invisible': '去除不可见字符',
  unescape: '还原转义序列（\\n → 换行）',
  'add-prefix': '每行加前缀',
  'add-suffix': '每行加后缀',
};

/** 需要剔除的不可见字符码点：BOM、零宽字符、控制字符（保留 \n \t \r）。 */
const INVISIBLE_CODEPOINTS = new Set([0xfeff, 0x200b, 0x200c, 0x200d, 0x2060, 0x00ad]);
const KEPT_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

function stripInvisible(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (INVISIBLE_CODEPOINTS.has(code)) continue;
    if (code < 0x20 && !KEPT_CONTROLS.has(code)) continue;
    if (code === 0x7f) continue;
    out += char;
  }
  return out;
}

/** 文本清洗管线：按给定动作顺序执行，可组合使用。 */
export function cleanText(text: string, ops: CleanOp[], prefix = '', suffix = ''): string {
  let out = text;
  for (const op of ops) {
    switch (op) {
      case 'trim':
        out = out.trim();
        break;
      case 'drop-empty':
        out = out
          .split('\n')
          .filter((line) => line.trim() !== '')
          .join('\n');
        break;
      case 'drop-dupe': {
        const seen = new Set<string>();
        out = out
          .split('\n')
          .filter((line) => {
            if (seen.has(line)) return false;
            seen.add(line);
            return true;
          })
          .join('\n');
        break;
      }
      case 'keep-dupe':
        break;
      case 'sort':
        out = out
          .split('\n')
          .sort((a, b) => a.localeCompare(b))
          .join('\n');
        break;
      case 'reverse':
        out = out.split('\n').reverse().join('\n');
        break;
      case 'strip-space':
        out = out.replace(/\s+/g, '');
        break;
      case 'lf':
        out = out.replace(/\r\n?/g, '\n');
        break;
      case 'crlf':
        out = out.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n');
        break;
      case 'strip-invisible':
        out = stripInvisible(out);
        break;
      case 'unescape':
        out = unescapeSequences(out);
        break;
      case 'add-prefix':
        out = out
          .split('\n')
          .map((line) => `${prefix}${line}`)
          .join('\n');
        break;
      case 'add-suffix':
        out = out
          .split('\n')
          .map((line) => `${line}${suffix}`)
          .join('\n');
        break;
    }
  }
  return out;
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  '\\': '\\',
  '"': '"',
  "'": "'",
  '/': '/',
};

/** 还原 \\n / \\uXXXX / \\xNN 这类字面量转义；未知转义保持原样。 */
export function unescapeSequences(text: string): string {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (match, body: string) => {
    if (body[0] === 'u' || body[0] === 'x') {
      const code = Number.parseInt(body.slice(1), 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    return ESCAPES[body] ?? match;
  });
}

export function escapeJsonString(text: string): string {
  return JSON.stringify(text);
}

/** 常见 HTML 实体（不做全量表，收录日常最容易敲错的一批）。 */
export const HTML_ENTITIES: [string, string][] = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
  [' ', '&nbsp;'],
  ['©', '&copy;'],
  ['®', '&reg;'],
  ['°', '&deg;'],
  ['±', '&plusmn;'],
  ['×', '&times;'],
  ['÷', '&divide;'],
  ['…', '&hellip;'],
  ['—', '&mdash;'],
  ['–', '&ndash;'],
  ['→', '&rarr;'],
  ['←', '&larr;'],
  ['↑', '&uarr;'],
  ['↓', '&darr;'],
  ['“', '&ldquo;'],
  ['”', '&rdquo;'],
  ['‘', '&lsquo;'],
  ['’', '&rsquo;'],
  ['•', '&bull;'],
  ['€', '&euro;'],
  ['£', '&pound;'],
  ['¥', '&yen;'],
  ['¢', '&cent;'],
  ['§', '&sect;'],
  ['¶', '&para;'],
  ['©️', '&#169;'],
  ['™', '&trade;'],
];

export function escapeHtml(text: string): string {
  let out = text;
  for (const [char, entity] of HTML_ENTITIES) {
    out = out.split(char).join(entity);
  }
  return out;
}

export function unescapeHtml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : match;
    }
    const found = HTML_ENTITIES.find(([, entity]) => entity === `&${body};`);
    return found === undefined ? match : (found[0] ?? match);
  });
}

/** 用 DOMParser 剥离标签；解析失败时退回正则去标签。 */
export function stripHtml(text: string): string {
  if (!/<[a-z!/]/i.test(text)) return text;
  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return (doc.body.textContent ?? '').trim();
  } catch {
    return text.replace(/<[^>]*>/g, '');
  }
}

// ────────────────────────────── 颜色与时间 ──────────────────────────────

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(text: string): Rgb | null {
  const raw = text.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(raw);
  if (hex) {
    const body = hex[1] ?? '';
    const expand = (part: string) => Number.parseInt(part.length === 1 ? `${part}${part}` : part, 16);
    if (body.length === 3 || body.length === 4) {
      return {
        r: expand(body[0] ?? '0'),
        g: expand(body[1] ?? '0'),
        b: expand(body[2] ?? '0'),
        a: body.length === 4 ? expand(body[3] ?? '0') / 255 : 1,
      };
    }
    if (body.length === 6 || body.length === 8) {
      return {
        r: Number.parseInt(body.slice(0, 2), 16),
        g: Number.parseInt(body.slice(2, 4), 16),
        b: Number.parseInt(body.slice(4, 6), 16),
        a: body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (rgb) {
    const parts = (rgb[1] ?? '').split(',').map((part) => part.trim());
    if (parts.length < 3) return null;
    const channel = (part: string) => Math.max(0, Math.min(255, Number.parseFloat(part)));
    const alpha = parts.length > 3 ? Number.parseFloat(parts[3] ?? '1') : 1;
    return {
      r: channel(parts[0] ?? '0'),
      g: channel(parts[1] ?? '0'),
      b: channel(parts[2] ?? '0'),
      a: Number.isFinite(alpha) ? alpha : 1,
    };
  }
  return null;
}

export function rgbToHex(color: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  const base = `#${part(color.r)}${part(color.g)}${part(color.b)}`;
  return color.a >= 1 ? base.toUpperCase() : `${base}${part(color.a * 255)}`.toUpperCase();
}

export function rgbToHsl(color: Rgb): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / delta + 2) / 6;
  else h = ((r - g) / delta + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function formatTimestamp(ms: number, unit: 'local' | 'utc' | 'iso' | 'relative'): string {
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  if (unit === 'iso') return date.toISOString();
  if (unit === 'utc') return date.toUTCString();
  if (unit === 'relative') return relativeTime(date);
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 0) return '刚刚';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN');
}

/** 秒/毫秒自动判定（按位数），返回毫秒。 */
export function toMillis(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  if (abs < 1e11) return value * 1000;
  return value;
}

// ────────────────────────────── 格式化动作 ──────────────────────────────

export type TransformKind =
  | 'json-pretty'
  | 'json-minify'
  | 'json-to-yaml'
  | 'json-to-csv'
  | 'json-to-sql'
  | 'json-to-ts'
  | 'case'
  | 'url-parse'
  | 'url-encode'
  | 'url-decode'
  | 'base64-encode'
  | 'base64-decode'
  | 'timestamp'
  | 'color'
  | 'escape-json'
  | 'escape-html'
  | 'unescape-html'
  | 'strip-html'
  | 'clean';

export const TRANSFORM_LABELS: Record<TransformKind, string> = {
  'json-pretty': 'JSON 美化',
  'json-minify': 'JSON 压缩',
  'json-to-yaml': 'JSON → YAML',
  'json-to-csv': 'JSON → CSV',
  'json-to-sql': 'JSON → SQL INSERT',
  'json-to-ts': 'JSON → TypeScript 类型',
  case: '命名风格转换',
  'url-parse': 'URL 解析',
  'url-encode': 'URL 编码',
  'url-decode': 'URL 解码',
  'base64-encode': 'Base64 编码',
  'base64-decode': 'Base64 解码',
  timestamp: '时间戳 → 可读时间',
  color: '颜色 HEX ↔ RGB',
  'escape-json': 'JSON 字符串转义',
  'escape-html': 'HTML 实体转义',
  'unescape-html': 'HTML 实体还原',
  'strip-html': 'HTML 标签剥离',
  clean: '文本清洗',
};

export interface TransformOptions {
  indent?: number;
  caseStyle?: CaseStyle;
  ops?: CleanOp[];
  prefix?: string;
  suffix?: string;
}

export interface TransformResult {
  value: string;
  error: string | null;
  /** 附带的结构化说明，展示在统计区。 */
  detail: string;
}

function fail(error: unknown): TransformResult {
  return { value: '', error: error instanceof Error ? error.message : String(error), detail: '' };
}

/** JSON → YAML（自己实现，覆盖对象/数组/标量/转义）。 */
export function jsonToYaml(value: unknown, indent = 2): string {
  const pad = ' '.repeat(Math.max(0, indent));
  const scalar = (input: unknown): string => {
    if (input === null) return 'null';
    if (typeof input === 'boolean' || typeof input === 'number') return String(input);
    const text = String(input);
    if (text === '') return "''";
    // 需要引号的情况：含 YAML 关键字、冒号、#、首尾空格或看起来像数字/布尔
    const needsQuote =
      /^[\s>|@*&!%`'"[\]{},-]|[:#]\s|\s$|^$|^(?:true|false|null|yes|no|on|off|~)$/i.test(text) ||
      /^-?\d+(\.\d+)?$/.test(text);
    if (!needsQuote) return text;
    return `'${text.replace(/'/g, "''")}'`;
  };
  const walk = (node: unknown, depth: number): string[] => {
    const prefix = pad.repeat(depth);
    if (Array.isArray(node)) {
      if (node.length === 0) return [`${prefix}[]`];
      const out: string[] = [];
      for (const item of node) {
        if (item !== null && typeof item === 'object') {
          const inner = walk(item, depth + 1);
          const first = inner[0] ?? '';
          out.push(`${prefix}- ${first.trimStart()}`);
          out.push(...inner.slice(1));
        } else {
          out.push(`${prefix}- ${scalar(item)}`);
        }
      }
      return out;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) return [`${prefix}{}`];
      const out: string[] = [];
      for (const [key, item] of entries) {
        if (item !== null && typeof item === 'object') {
          if (Array.isArray(item) && item.length === 0) out.push(`${prefix}${scalar(key)}: []`);
          else if (!Array.isArray(item) && Object.keys(item as object).length === 0)
            out.push(`${prefix}${scalar(key)}: {}`);
          else {
            out.push(`${prefix}${scalar(key)}:`);
            out.push(...walk(item, depth + 1));
          }
        } else {
          out.push(`${prefix}${scalar(key)}: ${scalar(item)}`);
        }
      }
      return out;
    }
    return [`${prefix}${scalar(node)}`];
  };
  const lines = walk(value, 0);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 二维数组或对象数组 → CSV。 */
export function jsonToCsv(value: unknown): string {
  const rows: unknown[][] = [];
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    const allObjects = value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
    if (allObjects) {
      const keys = [...new Set(value.flatMap((item) => Object.keys(item as Record<string, unknown>)))];
      rows.push(keys);
      for (const item of value) rows.push(keys.map((key) => (item as Record<string, unknown>)[key]));
      return rows.map((row) => row.map(csvCell).join(',')).join('\n');
    }
    const width = Math.max(...value.map((item) => (Array.isArray(item) ? item.length : 1)));
    for (const item of value) rows.push(Array.isArray(item) ? item : [item]);
    for (let index = 0; index < width; index += 1) rows.push([]);
    const rowsOut: string[] = [];
    for (let rowIndex = 0; rowIndex < Math.max(...rows.map((row) => row.length)); rowIndex += 1) {
      rowsOut.push(rows.map((row) => csvCell(row[rowIndex])).join(','));
    }
    return rowsOut.join('\n');
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${csvCell(key)},${csvCell(item)}`)
      .join('\n');
  }
  return csvCell(value);
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function tableName(path: string): string {
  return path.replace(/[^A-Za-z0-9_]/g, '_') || 't';
}

/** 数组 → 多条 INSERT；对象 → 单条 INSERT。 */
export function jsonToSql(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    const keys = [
      ...new Set(
        value.flatMap((item) => (item !== null && typeof item === 'object' ? Object.keys(item as object) : [])),
      ),
    ];
    if (keys.length === 0) return '';
    const columns = `(${keys.join(', ')})`;
    const rows = value.map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return `(${keys.map((key) => sqlValue(record[key])).join(', ')})`;
    });
    return `INSERT INTO ${tableName('exported_rows')} ${columns} VALUES\n${rows.join(',\n')};\n`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const name = tableName(String(record.name ?? record.id ?? 'exported_row'));
    return `INSERT INTO ${name} (${keys.join(', ')})\nVALUES (${keys.map((key) => sqlValue(record[key])).join(', ')});\n`;
  }
  return `-- 输入不是对象或数组，无法生成 INSERT\n`;
}

function tsType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const types = [...new Set(value.map(tsType))];
    return types.length === 1 ? `${types[0]}[]` : `Array<${types.join(' | ')}>`;
  }
  switch (typeof value) {
    case 'number':
      return Number.isInteger(value) ? 'number' : 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'object':
      return tsInterface(value as Record<string, unknown>);
    default:
      return 'unknown';
  }
}

function tsInterface(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return 'Record<string, never>';
  const body = entries.map(([key, item]) => `  ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`}: ${tsType(item)};`);
  return `{\n${body.join('\n')}\n}`;
}

/** 对象数组 → TS 接口列表；单对象 → 一个接口。 */
export function jsonToTypes(value: unknown, name = 'Root'): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `export interface ${name} {\n  [key: string]: never;\n}`;
    const first = value[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      const body = Object.entries(first as Record<string, unknown>)
        .map(([key, item]) => `  ${/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`}: ${tsType(item)};`)
        .join('\n');
      return `export interface ${name} {\n${body}\n}\n`;
    }
    return `export type ${name} = ${tsType(value)};\n`;
  }
  if (value !== null && typeof value === 'object')
    return `export interface ${name} ${tsInterface(value as Record<string, unknown>)}\n`;
  return `export type ${name} = ${tsType(value)};\n`;
}

function urlDetails(url: URL): string {
  const params: string[] = [];
  for (const [key, value] of url.searchParams) params.push(`${key} = ${value}`);
  return [
    `协议 ${url.protocol}`,
    `主机 ${url.hostname}`,
    `端口 ${url.port === '' ? '（默认）' : url.port}`,
    `路径 ${url.pathname}`,
    `查询 ${params.length === 0 ? '（无）' : params.join('，')}`,
    `哈希 ${url.hash === '' ? '（无）' : url.hash}`,
    `凭据 ${url.username === '' ? '（无）' : '⚠️ 含用户名/密码，粘贴前请确认来源可信'}`,
    `origin ${url.origin}`,
  ].join('\n');
}

/** 统一入口：所有格式化动作都从这里走，出错时返回中文提示而不是抛异常。 */
export function transform(input: string, kind: TransformKind, options: TransformOptions = {}): TransformResult {
  const indent = options.indent ?? 2;
  try {
    switch (kind) {
      case 'json-pretty':
      case 'json-minify': {
        const parsed = JSON.parse(input) as unknown;
        return {
          value: kind === 'json-pretty' ? JSON.stringify(parsed, null, indent) : JSON.stringify(parsed),
          error: null,
          detail: `JSON 根节点类型：${rootLabel(parsed)}`,
        };
      }
      case 'json-to-yaml':
      case 'json-to-csv':
      case 'json-to-sql':
      case 'json-to-ts': {
        const parsed = JSON.parse(input) as unknown;
        if (kind === 'json-to-yaml')
          return { value: jsonToYaml(parsed, indent), error: null, detail: 'YAML（2 空格缩进）' };
        if (kind === 'json-to-csv')
          return { value: jsonToCsv(parsed), error: null, detail: 'CSV（已按 RFC 4180 转义）' };
        if (kind === 'json-to-sql')
          return { value: jsonToSql(parsed), error: null, detail: 'SQL INSERT（单引号已转义成两个）' };
        return { value: jsonToTypes(parsed), error: null, detail: 'TypeScript 类型（推断自样本值）' };
      }
      case 'case':
        return {
          value: convertCase(input, options.caseStyle ?? 'camel'),
          error: null,
          detail: `按 ${CASE_LABELS[options.caseStyle ?? 'camel']} 转换，共 ${words(input).length} 个词`,
        };
      case 'url-parse': {
        const url = parseUrl(input);
        if (url === null)
          return { value: '', error: '不是合法的 URL（需要协议或形如 example.com 的域名）', detail: '' };
        return { value: urlDetails(url), error: null, detail: url.href };
      }
      case 'url-encode':
        return { value: encodeURIComponent(input), error: null, detail: 'encodeURIComponent' };
      case 'url-decode':
        return {
          value: decodeURIComponent(input.replace(/\+/g, ' ')),
          error: null,
          detail: 'decodeURIComponent（+ 视作空格）',
        };
      case 'base64-encode':
        return {
          value: bytesToBase64(toBytes(utf8ToBytes(input))),
          error: null,
          detail: `${utf8ToBytes(input).length} 字节 UTF-8 → Base64`,
        };
      case 'base64-decode':
        return {
          value: bytesToUtf8(base64ToBytes(input)),
          error: null,
          detail: 'Base64 → UTF-8 文本',
        };
      case 'timestamp': {
        const value = Number(input.trim());
        if (!Number.isFinite(value)) return { value: '', error: '不是数字时间戳', detail: '' };
        const ms = toMillis(value);
        return {
          value: [
            formatTimestamp(ms, 'local'),
            formatTimestamp(ms, 'utc'),
            formatTimestamp(ms, 'iso'),
            `相对：${relativeTime(new Date(ms))}`,
            `秒 ${Math.floor(ms / 1000)}`,
          ].join('\n'),
          error: null,
          detail: `按 ${Math.abs(value) < 1e11 ? '秒' : '毫秒'} 解析`,
        };
      }
      case 'color': {
        const rgb = parseColor(input);
        if (rgb === null) return { value: '', error: '不是 HEX 或 rgb()/rgba() 颜色', detail: '' };
        const hsl = rgbToHsl(rgb);
        return {
          value: [
            rgbToHex(rgb),
            `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
            `alpha ${rgb.a.toFixed(2)}`,
          ].join('\n'),
          error: null,
          detail: 'HEX / RGB / HSL 互转',
        };
      }
      case 'escape-json':
        return { value: escapeJsonString(input), error: null, detail: 'JSON 字符串字面量（含引号）' };
      case 'escape-html':
        return { value: escapeHtml(input), error: null, detail: `收录 ${HTML_ENTITIES.length} 个常见实体` };
      case 'unescape-html':
        return { value: unescapeHtml(input), error: null, detail: '同时支持十进制与十六进制实体' };
      case 'strip-html':
        return { value: stripHtml(input), error: null, detail: '用 DOMParser 解析后取文本内容' };
      case 'clean':
        return {
          value: cleanText(input, options.ops ?? ['trim'], options.prefix ?? '', options.suffix ?? ''),
          error: null,
          detail: `执行 ${(options.ops ?? ['trim']).length} 个清洗动作`,
        };
    }
  } catch (error) {
    return fail(error);
  }
}

function rootLabel(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `数组（${value.length} 项）`;
  if (typeof value === 'object') return `对象（${Object.keys(value as object).length} 个键）`;
  return typeof value;
}

// ────────────────────────────── 动作（片段模板） ──────────────────────────────

export interface ClipAction {
  id: string;
  name: string;
  /** 按顺序执行的变换。 */
  steps: TransformKind[];
  options: TransformOptions;
  createdAt: string;
}

/** 执行一串动作，任一步出错即返回错误。 */
export function runAction(input: string, action: ClipAction): TransformResult {
  let value = input;
  const details: string[] = [];
  for (const step of action.steps) {
    const result = transform(value, step, action.options);
    if (result.error !== null)
      return {
        value: '',
        error: `第 ${details.length + 1} 步「${TRANSFORM_LABELS[step]}」失败：${result.error}`,
        detail: details.join(' → '),
      };
    value = result.value;
    details.push(TRANSFORM_LABELS[step]);
  }
  return { value, error: null, detail: details.join(' → ') };
}

/** 随机挑选字符（拒绝采样，避免取模偏差）。 */
export function pickRandom(pool: string): string {
  return pool[randomIndex(pool.length)] ?? '';
}
