/**
 * 模糊搜索与子串索引：纯函数，无 React、无 DOM、无网络请求。
 * 打分思路参考 fzf（连续匹配、词首、camelCase 边界、精确匹配加权）。
 */

/** 单次匹配的结果：总分与命中字符下标。 */
export interface FuzzyMatchResult {
  score: number;
  matches: number[];
}

export interface FuzzyMatchOptions {
  /** 区分大小写，默认 false。 */
  caseSensitive?: boolean;
  /** 反向排序：首个命中位置越靠后，得分越高。 */
  reverse?: boolean;
}

const _SCORE_FIRST = 16;
const SCORE_CONSECUTIVE = 18;
const SCORE_CONSECUTIVE_EXTEND = 6;
const SCORE_WORD_START = 20;
const SCORE_CAMEL = 16;
const SCORE_DELIMITER = 14;
const SCORE_EXACT = 64;
const SCORE_PREFIX = 30;
const PENALTY_GAP_START = -3;
const PENALTY_GAP_EXTEND = -1;
const PENALTY_LEADING_PER_CHAR = -1.2;
const PENALTY_LEADING_CAP = -24;
const PENALTY_LENGTH_PER_CHAR = -0.45;
const PENALTY_LENGTH_CAP = -26;
const REVERSE_BONUS_PER_CHAR = 0.6;
const REVERSE_BONUS_CAP = 60;

/** 视为词首的前置字符（分隔符）。 */
const DELIMITERS = new Set([
  ' ',
  '\t',
  '\n',
  '-',
  '_',
  '.',
  '/',
  '\\',
  ':',
  ';',
  ',',
  '@',
  '#',
  '$',
  '+',
  '=',
  '(',
  '[',
  '{',
  '>',
  '<',
  '|',
  '?',
  '!',
  '"',
  "'",
  '`',
  '&',
  '%',
  '*',
  '^',
  '~',
]);

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  return DELIMITERS.has(text[index - 1]);
}

function isCamelBoundary(text: string, index: number): boolean {
  if (index === 0) return false;
  const prev = text[index - 1];
  const cur = text[index];
  if (LOWER.test(prev) && UPPER.test(cur)) return true;
  return DIGIT.test(prev) && UPPER.test(cur);
}

/**
 * fzf 风格的模糊匹配：模式字符必须按顺序出现在目标中，顺序可跳跃。
 * 未命中时返回 score = 0、matches = []。
 */
export function fuzzyMatch(pattern: string, target: string, options: FuzzyMatchOptions = {}): FuzzyMatchResult {
  if (pattern === '') return { score: 0, matches: [] };
  if (target === '') return { score: 0, matches: [] };

  const pat = options.caseSensitive ? pattern : pattern.toLowerCase();
  const hay = options.caseSensitive ? target : target.toLowerCase();

  const matches: number[] = [];
  let score = 0;
  let cursor = 0;
  let consecutive = 0;
  let previous = -1;
  let first = -1;

  for (const char of pat) {
    const found = hay.indexOf(char, cursor);
    if (found === -1) return { score: 0, matches: [] };
    matches.push(found);

    if (previous >= 0) {
      const gap = found - previous - 1;
      if (gap === 0) {
        consecutive += 1;
        score += SCORE_CONSECUTIVE + SCORE_CONSECUTIVE_EXTEND * Math.min(consecutive, 4);
      } else {
        consecutive = 0;
        score += PENALTY_GAP_START + PENALTY_GAP_EXTEND * Math.min(gap, 8);
      }
    } else {
      first = found;
      if (isWordStart(hay, found)) score += SCORE_WORD_START;
      if (isCamelBoundary(hay, found)) score += SCORE_CAMEL;
      const prev = hay[found - 1];
      if (prev !== undefined && DELIMITERS.has(prev)) score += SCORE_DELIMITER;
    }

    cursor = found + 1;
    previous = found;
  }

  const firstIndex = first < 0 ? matches[0] : first;
  const trailing = hay.length - (previous + 1);

  if (pat === hay) score += SCORE_EXACT;
  else if (hay.startsWith(pat)) score += SCORE_PREFIX;

  // 命中位置越靠后，惩罚越多
  score += Math.max(PENALTY_LEADING_CAP, PENALTY_LEADING_PER_CHAR * Math.min(firstIndex, 20));
  // 结尾剩余字符同样轻微惩罚，避免长字符串无脑霸榜
  score += Math.max(
    PENALTY_LENGTH_CAP,
    PENALTY_LENGTH_PER_CHAR * Math.min(trailing + (pat.length < hay.length ? 8 : 0), 40),
  );
  if (options.reverse) {
    score += Math.min(REVERSE_BONUS_CAP, REVERSE_BONUS_PER_CHAR * firstIndex);
  }

  return { score: Math.round(score), matches };
}

/** 查询语法：`-词` 或 `!词` 为排除项，`'带引号'` 为整体精确片段。 */
export interface ParsedQuery {
  include: string[];
  exclude: string[];
  /** 排除项按普通片段匹配还是整体子串匹配。 */
  exact: string[];
}

export function parseQuery(query: string): ParsedQuery {
  const include: string[] = [];
  const exclude: string[] = [];
  const exact: string[] = [];
  const re = /'([^']+)'|"([^"]+)"|(!?)([^\s]+)/g;
  let match: RegExpExecArray | null = re.exec(query);
  while (match !== null) {
    const [, singleQuoted, doubleQuoted, _negate, bare] = match;
    if (singleQuoted !== undefined) {
      exact.push(singleQuoted);
    } else if (doubleQuoted !== undefined) {
      exact.push(doubleQuoted);
    } else if (bare !== undefined) {
      const body = bare.startsWith('-') || bare.startsWith('!') ? bare.slice(1) : bare;
      if (body === '') {
        // 单个 - / ! 不算模式
      } else if (bare.startsWith('-') || bare.startsWith('!')) {
        exclude.push(body);
      } else {
        include.push(body);
      }
    }
    match = re.exec(query);
  }
  return { include, exclude, exact };
}

export interface FuzzyFilterOptions extends FuzzyMatchOptions {
  /** 多个模式之间的关系：默认 all（空格分词等价于 AND）。 */
  mode?: 'all' | 'any';
  /** 最多返回多少条，0 表示不限制。 */
  limit?: number;
  /** 排除模式命中的条目直接剔除。 */
  exclude?: string[];
  /** 是否只保留按子串命中的条目（不参与模糊打分）。 */
  substringOnly?: boolean;
}

export interface FuzzyHit<T> {
  item: T;
  score: number;
  /** 合并所有模式的命中下标（已去重升序）。 */
  matches: number[];
  /** 原始输入下标，用于同分时的稳定排序。 */
  index: number;
  /** 命中的模式，用于界面提示。 */
  patterns: string[];
}

function normalize(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLowerCase();
}

/**
 * 多模式组合过滤。空格分词后的多个模式按 `mode` 合并（默认 AND），
 * 命中项按分数降序排序；同分时保持输入顺序（稳定排序）。
 */
export function fuzzyFilter<T>(
  patterns: string[],
  targets: readonly T[],
  options: FuzzyFilterOptions & { key?: (item: T, index: number) => string } = {},
): FuzzyHit<T>[] {
  const caseSensitive = options.caseSensitive ?? false;
  const key = options.key ?? ((item: T) => String(item));
  const mode = options.mode ?? 'all';
  const exclude = options.exclude ?? [];
  const limit = options.limit ?? 0;
  const active = patterns.filter((pattern) => pattern !== '');

  const hits: FuzzyHit<T>[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    const raw = key(item, index);
    const text = normalize(raw, caseSensitive);

    if (exclude.length > 0) {
      const excluded = exclude.some((pattern) => text.includes(normalize(pattern, caseSensitive)));
      if (excluded) continue;
    }

    const collected: number[] = [];
    const matched: string[] = [];
    let total = 0;
    let ok = true;

    for (const pattern of active) {
      const needle = normalize(pattern, caseSensitive);
      if (options.substringOnly) {
        const at = text.indexOf(needle);
        if (at === -1) {
          if (mode === 'all') {
            ok = false;
            break;
          }
          continue;
        }
        for (let i = 0; i < needle.length; i += 1) collected.push(at + i);
        total += 40;
        matched.push(pattern);
        continue;
      }
      const result = fuzzyMatch(needle, text, { caseSensitive, reverse: options.reverse });
      if (result.matches.length === 0) {
        if (mode === 'all') {
          ok = false;
          break;
        }
        continue;
      }
      total += result.score;
      collected.push(...result.matches);
      matched.push(pattern);
    }

    if (!ok) continue;
    if (active.length > 0 && matched.length === 0) continue;

    const merged = Array.from(new Set(collected)).sort((a, b) => a - b);
    hits.push({ item, score: Math.round(total), matches: merged, index, patterns: matched });
  }

  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  return limit > 0 ? hits.slice(0, limit) : hits;
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/** 把命中位置转成可渲染的片段数组，命中字符 hit = true。 */
export function greedyHighlight(text: string, pattern: string, options: FuzzyMatchOptions = {}): HighlightSegment[] {
  const result = fuzzyMatch(pattern, text, options);
  if (result.matches.length === 0) return [{ text, hit: false }];

  const set = new Set(result.matches);
  const segments: HighlightSegment[] = [];
  let buffer = '';
  let bufferHit = set.has(0);

  for (let i = 0; i < text.length; i += 1) {
    const hit = set.has(i);
    if (hit !== bufferHit) {
      if (buffer !== '') segments.push({ text: buffer, hit: bufferHit });
      buffer = '';
      bufferHit = hit;
    }
    buffer += text[i];
  }
  if (buffer !== '') segments.push({ text: buffer, hit: bufferHit });
  return segments;
}

const NGRAM_SIZE = 3;

/** 字符位掩码：0~25 存 a~z，26~35 存 0~9，其余符号占用高位。 */
interface CharMask {
  low: number;
  high: number;
}

function maskOf(text: string): CharMask {
  let low = 0;
  let high = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 97 && code <= 122) low |= 1 << (code - 97);
    else if (code >= 48 && code <= 57) high |= 1 << (code - 48);
    else if (code >= 65 && code <= 90) low |= 1 << (code - 65);
    else if (code === 47)
      high |= 1 << 10; // /
    else if (code === 46)
      high |= 1 << 11; // .
    else if (code === 45 || code === 95)
      high |= 1 << 12; // - _
    else high |= 1 << 13; // 其余字符统一归入「其它」
  }
  return { low, high };
}

function maskOfPattern(pattern: string): CharMask {
  return maskOf(pattern);
}

function maskSubset(need: CharMask, have: CharMask): boolean {
  return (need.low & ~have.low) === 0 && (need.high & ~have.high) === 0;
}

export interface NgramIndex<_T> {
  /** 条目总数。 */
  size: number;
  /** 3-gram → 条目下标列表。 */
  grams: Map<string, number[]>;
  /** 取某个 gram 的候选下标。 */
  lookup(gram: string): number[] | undefined;
  /**
   * 子串预筛：仅当所有片段长度都 ≥ 3 时结果可信，否则返回 null（表示无法预筛）。
   * 与 blake3 的子串搜索同思路：按共享 gram 取候选，判定是连续的子串命中。
   */
  prefilterSubstring(terms: string[]): number[] | null;
  /**
   * 字符存在性预筛：模糊匹配要求目标包含模式的每个字符，
   * 因此缺少任一字符的条目可以直接排除，这是对模糊搜索安全的剪枝。
   */
  prefilterChars(chars: string[]): number[] | null;
}

/** 建立 3-gram 子串索引与字符位掩码，供大列表（≥ 数千条）快速预筛。 */
export function buildNgrams<T>(
  items: readonly T[],
  keyFn: (item: T, index: number) => string = (item) => String(item),
): NgramIndex<T> {
  const grams = new Map<string, number[]>();
  const masks: CharMask[] = new Array(items.length);

  for (let i = 0; i < items.length; i += 1) {
    const text = keyFn(items[i], i).toLowerCase();
    masks[i] = maskOf(text);
    if (text.length < NGRAM_SIZE) continue;
    for (let j = 0; j <= text.length - NGRAM_SIZE; j += 1) {
      const gram = text.slice(j, j + NGRAM_SIZE);
      const bucket = grams.get(gram);
      if (bucket) bucket.push(i);
      else grams.set(gram, [i]);
    }
  }

  return {
    size: items.length,
    grams,
    lookup(gram) {
      return grams.get(gram.toLowerCase());
    },
    prefilterSubstring(terms) {
      if (terms.length === 0) return null;
      const normalized = terms.map((term) => term.toLowerCase());
      if (normalized.some((term) => term.length < NGRAM_SIZE)) return null;
      let candidate: Set<number> | null = null;
      for (const term of normalized) {
        const bucket = new Set<number>();
        for (let j = 0; j <= term.length - NGRAM_SIZE; j += 1) {
          const list = grams.get(term.slice(j, j + NGRAM_SIZE));
          if (list) for (const index of list) bucket.add(index);
        }
        if (bucket.size === 0) return [];
        if (candidate === null) {
          candidate = bucket;
        } else {
          const merged = new Set<number>();
          for (const index of candidate) if (bucket.has(index)) merged.add(index);
          candidate = merged;
        }
        if (candidate.size === 0) return [];
      }
      return candidate === null ? null : Array.from(candidate);
    },
    prefilterChars(chars) {
      if (chars.length === 0) return null;
      const unique = Array.from(new Set(chars.map((char) => char.toLowerCase())));
      if (unique.length > 26) return null;
      const need = maskOfPattern(unique.join(''));
      const result: number[] = [];
      for (let i = 0; i < masks.length; i += 1) {
        if (maskSubset(need, masks[i])) result.push(i);
      }
      return result;
    },
  };
}

export interface IndexedFilterOptions<T> extends FuzzyFilterOptions {
  /** 列表长度达到该阈值才启用索引预剪枝，默认 5000。 */
  indexThreshold?: number;
  /** 手动传入索引；不传时按阈值自动构建。 */
  index?: NgramIndex<T>;
  key?: (item: T, index: number) => string;
}

/**
 * 大列表版本：先用字符位掩码做 O(n) 剪枝，再对幸存条目跑完整模糊打分。
 * 剪枝是安全的前提是「模糊匹配必然包含模式的每个字符」。
 */
export function fuzzyFilterIndexed<T>(
  patterns: string[],
  targets: readonly T[],
  options: IndexedFilterOptions<T> = {},
): FuzzyHit<T>[] {
  const threshold = options.indexThreshold ?? 5000;
  const active = patterns.filter((pattern) => pattern !== '');
  if (targets.length < threshold || active.length === 0) {
    return fuzzyFilter(patterns, targets, options);
  }

  const index: NgramIndex<T> = options.index ?? buildNgrams(targets, options.key);
  const chars = active.flatMap((pattern) => Array.from(pattern.toLowerCase()));
  const keep = index.prefilterChars(chars);
  if (keep === null) return fuzzyFilter(patterns, targets, options);

  const subset = keep.map((position) => targets[position]);
  const hits = fuzzyFilter(patterns, subset, options);
  // 还原成原始下标，保证稳定排序语义与全量搜索一致
  return hits.map((hit) => ({ ...hit, index: keep[hit.index] }));
}

/** 大小写、去重、排序等文本清洗，模糊搜索与文本检索共用。 */
export function cleanLines(
  text: string,
  options: {
    trim?: boolean;
    dropEmpty?: boolean;
    lower?: boolean;
    unique?: boolean;
    sort?: 'asc' | 'desc' | 'length';
  } = {},
): string[] {
  const { trim = true, dropEmpty = true, lower = false, unique = true, sort } = options;
  let lines = text.split(/\r?\n/);
  if (trim) lines = lines.map((line) => line.trim());
  if (lower) lines = lines.map((line) => line.toLowerCase());
  if (dropEmpty) lines = lines.filter((line) => line !== '');
  if (unique) lines = Array.from(new Set(lines));
  if (sort === 'asc') lines.sort((a, b) => a.localeCompare(b));
  if (sort === 'desc') lines.sort((a, b) => b.localeCompare(a));
  if (sort === 'length') lines.sort((a, b) => b.length - a.length);
  return lines;
}

/** 关键词拆分：高亮用；返回模式里出现过的字符集合（已转小写）。 */
export function patternChars(patterns: string[]): string[] {
  return Array.from(new Set(patterns.join('').toLowerCase().split('')));
}
