/**
 * 文本统计的纯逻辑层：基础计数、词频、字符分布、行特征与 Markdown 报告。
 * 全部在本地计算，不做任何网络请求。
 */

export type WordMode = 'space' | 'cjk' | 'stem';

export interface StatsOptions {
  wordMode: WordMode;
  ignoreCase: boolean;
  ignoreStopWords: boolean;
  /** 最小词长过滤，短于该长度的词不计入词频。 */
  minWordLength: number;
  /** 用户自定义停用词，按空白与逗号切分。 */
  extraStopWords: string;
}

export const DEFAULT_STATS_OPTIONS: StatsOptions = {
  wordMode: 'space',
  ignoreCase: true,
  ignoreStopWords: false,
  minWordLength: 1,
  extraStopWords: '',
};

// ── 停用词 ────────────────────────────────────────────────

const EN_STOP_WORDS = [
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'she',
  'so',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'too',
  'up',
  'us',
  'was',
  'we',
  'were',
  'what',
  'when',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
  'your',
];

const ZH_STOP_WORDS = [
  '的',
  '了',
  '和',
  '是',
  '就',
  '都',
  '而',
  '及',
  '与',
  '着',
  '或',
  '一个',
  '没有',
  '我们',
  '你们',
  '他们',
  '她们',
  '它们',
  '这个',
  '那个',
  '这些',
  '那些',
  '自己',
  '之',
  '也',
  '在',
  '上',
  '下',
  '对',
  '把',
  '被',
  '给',
  '让',
  '从',
  '到',
  '为',
  '以',
  '于',
  '并',
  '但',
  '因为',
  '所以',
  '如果',
  '可以',
  '因为',
  '所以',
  '不过',
  '一些',
  '什么',
  '怎么',
  '为什么',
  '如何',
  '这',
  '那',
  '有',
  '无',
  '会',
  '要',
  '说',
  '着',
  '过',
  '地',
  '得',
];

export const STOP_WORD_PRESETS: { id: string; label: string; words: string[] }[] = [
  { id: 'en', label: '英文停用词', words: EN_STOP_WORDS },
  { id: 'zh', label: '中文停用词', words: ZH_STOP_WORDS },
];

export function buildStopWords(options: StatsOptions): Set<string> {
  const set = new Set<string>();
  if (!options.ignoreStopWords) return set;
  for (const word of EN_STOP_WORDS) set.add(word);
  for (const word of ZH_STOP_WORDS) set.add(word);
  for (const word of options.extraStopWords.split(/[\s,，、;；]+/u)) {
    if (word.trim() !== '') set.add(word.trim().toLowerCase());
  }
  return set;
}

// ── 分词 ─────────────────────────────────────────────────

const CJK_RANGE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** 简易英文词干截断：仅剥离常见后缀，用于把 run/runs、made/making 归并。 */
export function stemEnglish(word: string): string {
  let out = word;
  if (out.length > 4 && out.endsWith('ies')) out = `${out.slice(0, -3)}y`;
  else if (out.length > 4 && (out.endsWith('ing') || out.endsWith('ed'))) out = out.slice(0, -3);
  else if (out.length > 3 && out.endsWith('es')) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith('s') && !out.endsWith('ss')) out = out.slice(0, -1);
  return out;
}

/**
 * 按口径切词：
 * - `space`：只按空白切，中文整段算一个词；
 * - `cjk`：CJK 字符逐字计数，其余按空白与标点切；
 * - `stem`：按空白与标点切，并对英文做简易词干截断。
 */
export function tokenize(text: string, mode: WordMode): string[] {
  const tokens: string[] = [];
  if (mode === 'space') {
    for (const token of text.split(/\s+/u)) {
      if (token !== '') tokens.push(token);
    }
    return tokens;
  }

  const pieces = text.split(/([\s\p{P}\p{S}]+)/u);
  for (const piece of pieces) {
    if (piece === '') continue;
    if (mode === 'cjk') {
      let buffer = '';
      for (const char of piece) {
        if (CJK_RANGE.test(char)) {
          if (buffer !== '') {
            tokens.push(buffer);
            buffer = '';
          }
          tokens.push(char);
        } else {
          buffer += char;
        }
      }
      if (buffer !== '') tokens.push(buffer);
      continue;
    }
    if (!/^[\s\p{P}\p{S}]+$/u.test(piece)) tokens.push(piece);
  }
  return tokens.map((token) => stemEnglish(token.toLowerCase()));
}

// ── 字符分布 ──────────────────────────────────────────────

export type CharBucketId =
  | 'ascii'
  | 'latin1'
  | 'cjk'
  | 'kana'
  | 'hangul'
  | 'cyrillic'
  | 'arabic'
  | 'emoji'
  | 'space'
  | 'control'
  | 'other';

export const CHAR_BUCKETS: { id: CharBucketId; label: string }[] = [
  { id: 'ascii', label: 'ASCII' },
  { id: 'latin1', label: 'Latin-1 / 拉丁扩展' },
  { id: 'cjk', label: 'CJK 汉字' },
  { id: 'kana', label: '假名' },
  { id: 'hangul', label: '韩文' },
  { id: 'cyrillic', label: '俄文' },
  { id: 'arabic', label: '阿拉伯文' },
  { id: 'emoji', label: 'Emoji / 符号' },
  { id: 'space', label: '空白字符' },
  { id: 'control', label: '控制字符' },
  { id: 'other', label: '其他' },
];

// 变体选择符与 ZWJ 会与基础字符组合成新字形，因此用「基础范围 + 组合符」交替匹配
const EMOJI_BASE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/u;
const EMOJI_COMBINER = /[\u{FE0F}\u{20D}]/u;

export function isEmoji(char: string): boolean {
  return EMOJI_BASE.test(char) || EMOJI_COMBINER.test(char);
}

export function classifyChar(char: string): CharBucketId {
  const code = char.codePointAt(0) ?? 0;
  if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || code === 0xa0 || code === 0x3000) {
    return 'space';
  }
  if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return 'control';
  if (isEmoji(char)) return 'emoji';
  if (code <= 0x7e) return 'ascii';
  if (code <= 0x24f) return 'latin1';
  if ((code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) {
    return 'cjk';
  }
  if (code >= 0x3040 && code <= 0x30ff) return 'kana';
  if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f) || (code >= 0xac00 && code <= 0xd7af)) {
    return 'hangul';
  }
  if (code >= 0x0400 && code <= 0x04ff) return 'cyrillic';
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) return 'arabic';
  return 'other';
}

export interface CharBucketStat {
  id: CharBucketId;
  label: string;
  count: number;
  percent: number;
}

export function charDistribution(text: string): CharBucketStat[] {
  const counts = new Map<CharBucketId, number>();
  let total = 0;
  for (const char of text) {
    const id = classifyChar(char);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    total += 1;
  }
  return CHAR_BUCKETS.map(({ id, label }) => {
    const count = counts.get(id) ?? 0;
    return { id, label, count, percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10 };
  }).filter((bucket) => bucket.count > 0);
}

// ── 基础统计 ──────────────────────────────────────────────

export interface BasicStats {
  /** 码点数（含空格与换行）。 */
  chars: number;
  /** 不含空白字符的码点数。 */
  charsNoSpace: number;
  /** UTF-8 字节数。 */
  bytes: number;
  lines: number;
  nonEmptyLines: number;
  words: number;
  sentences: number;
  paragraphs: number;
  avgLineLength: number;
  maxLineLength: number;
  /** 行首缩进中的空格数量。 */
  indentSpaces: number;
  tabCount: number;
  /** 中日韩统一表意文字数量，便于与西文词数对照。 */
  cjkChars: number;
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r\n|\r|\n/u);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function countSentences(text: string): number {
  const parts = text.split(/[.!?。！？…；;]+/u);
  return parts.filter((part) => part.trim() !== '').length;
}

export function countParagraphs(text: string): number {
  const parts = text.split(/\n\s*\n/u);
  return parts.filter((part) => part.trim() !== '').length;
}

export function basicStats(text: string, options: StatsOptions): BasicStats {
  const points = Array.from(text);
  const lines = splitLines(text);
  const tokens = tokenize(text, options.wordMode);
  let charsNoSpace = 0;
  let cjkChars = 0;
  let indentSpaces = 0;
  let totalLineLength = 0;
  let maxLineLength = 0;

  for (const char of points) {
    if (!/\s/u.test(char)) charsNoSpace += 1;
    if (/\p{Script=Han}/u.test(char)) cjkChars += 1;
  }
  for (const line of lines) {
    totalLineLength += Array.from(line).length;
    maxLineLength = Math.max(maxLineLength, Array.from(line).length);
    const indent = /^[ \t]*/u.exec(line);
    if (indent) indentSpaces += (indent[0].match(/ /gu) ?? []).length;
  }
  const tabCount = (text.match(/\t/gu) ?? []).length;

  return {
    chars: points.length,
    charsNoSpace,
    bytes: new TextEncoder().encode(text).length,
    lines: lines.length,
    nonEmptyLines: lines.filter((line) => line.trim() !== '').length,
    words: tokens.length,
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    avgLineLength: lines.length === 0 ? 0 : Math.round((totalLineLength / lines.length) * 10) / 10,
    maxLineLength,
    indentSpaces,
    tabCount,
    cjkChars,
  };
}

// ── 词频 ─────────────────────────────────────────────────

export interface WordFrequency {
  word: string;
  count: number;
  percent: number;
}

export function wordFrequency(text: string, options: StatsOptions, limit = 100): WordFrequency[] {
  const stopWords = buildStopWords(options);
  const tokens = tokenize(text, options.wordMode);
  const counts = new Map<string, number>();
  let total = 0;
  for (const raw of tokens) {
    const word = options.ignoreCase ? raw.toLowerCase() : raw;
    if (Array.from(word).length < options.minWordLength) continue;
    if (stopWords.has(word.toLowerCase())) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    total += 1;
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({
      word,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

// ── 行特征 ────────────────────────────────────────────────

export interface LineIssue {
  lineNo: number;
  text: string;
}

export interface LineFeatures {
  longest: { lineNo: number; length: number; text: string } | null;
  shortest: { lineNo: number; length: number; text: string } | null;
  /** 超过该长度的行。 */
  tooLong: LineIssue[];
  tooLongThreshold: number;
  /** 行尾有空格的行。 */
  trailingSpace: number[];
  /** 使用 CRLF 的行。 */
  crlfLines: number[];
  /** 使用 Tab 缩进的行。 */
  tabIndentedLines: number[];
  /** 同一文件内 LF 与 CRLF 混用。 */
  mixedNewline: boolean;
  /** Tab 缩进与空格缩进混用。 */
  mixedIndent: boolean;
}

export function lineFeatures(text: string, tooLongThreshold = 120): LineFeatures {
  const raw = text.split('\n');
  const lines = raw.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  let longest: LineFeatures['longest'] = null;
  let shortest: LineFeatures['shortest'] = null;
  const tooLong: LineIssue[] = [];
  const trailingSpace: number[] = [];
  const crlfLines: number[] = [];
  const tabIndentedLines: number[] = [];
  let spaceIndented = false;
  let tabIndented = false;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const length = Array.from(line).length;
    if (longest === null || length > longest.length) longest = { lineNo, length, text: line };
    if (shortest === null || length < shortest.length) shortest = { lineNo, length, text: line };
    if (length > tooLongThreshold) tooLong.push({ lineNo, text: line });
    if (/[ \t]+$/u.test(line)) trailingSpace.push(lineNo);
    if (raw[index].endsWith('\r')) crlfLines.push(lineNo);
    const indent = /^[ \t]*/u.exec(line);
    const hasTab = Boolean(indent?.[0].includes('\t'));
    const hasSpace = Boolean(indent?.[0].includes(' '));
    if (hasTab) {
      tabIndentedLines.push(lineNo);
      tabIndented = true;
    }
    if (hasSpace) spaceIndented = true;
  });

  return {
    longest,
    shortest,
    tooLong,
    tooLongThreshold,
    trailingSpace,
    crlfLines,
    tabIndentedLines,
    mixedNewline:
      crlfLines.length > 0 && crlfLines.length < raw.length - (raw.length > 0 && raw[raw.length - 1] === '' ? 1 : 0),
    mixedIndent: tabIndented && spaceIndented,
  };
}

// ── 汇总 ─────────────────────────────────────────────────

export interface TextReport {
  stats: BasicStats;
  frequency: WordFrequency[];
  uniqueWords: number;
  distribution: CharBucketStat[];
  lines: LineFeatures;
  options: StatsOptions;
}

export function analyzeText(text: string, options: StatsOptions, limit = 100, tooLongThreshold = 120): TextReport {
  const stats = basicStats(text, options);
  const stopWords = buildStopWords(options);
  const tokens = tokenize(text, options.wordMode).filter((raw) => {
    const word = options.ignoreCase ? raw.toLowerCase() : raw;
    if (Array.from(word).length < options.minWordLength) return false;
    return !stopWords.has(word.toLowerCase());
  });
  const unique = new Set(tokens.map((token) => (options.ignoreCase ? token.toLowerCase() : token))).size;
  return {
    stats,
    frequency: wordFrequency(text, options, limit),
    uniqueWords: unique,
    distribution: charDistribution(text),
    lines: lineFeatures(text, tooLongThreshold),
    options,
  };
}

/** 导出为可粘贴到 issue / PR 的 Markdown 报告。 */
export function markdownReport(report: TextReport, title = '文本统计报告'): string {
  const { stats, frequency, distribution, lines } = report;
  const out: string[] = [`# ${title}`, ''];
  out.push('## 基础指标', '');
  out.push('| 指标 | 数值 |', '| --- | ---: |');
  const rows: [string, string | number][] = [
    ['字符数（含空白）', stats.chars],
    ['字符数（不含空白）', stats.charsNoSpace],
    ['UTF-8 字节数', stats.bytes],
    ['行数', stats.lines],
    ['非空行数', stats.nonEmptyLines],
    ['单词数', stats.words],
    ['汉字数', stats.cjkChars],
    ['句子数', stats.sentences],
    ['段落数', stats.paragraphs],
    ['平均行长', stats.avgLineLength],
    ['最长行', `${stats.maxLineLength} 字符`],
    ['行首缩进空格数', stats.indentSpaces],
    ['Tab 总数', stats.tabCount],
    ['去重后词数', report.uniqueWords],
  ];
  for (const [key, value] of rows) out.push(`| ${key} | ${value} |`);

  if (frequency.length > 0) {
    out.push('', `## 高频词 Top ${String(frequency.length)}`, '');
    out.push('| 词 | 次数 | 占比 |', '| --- | ---: | ---: |');
    for (const item of frequency) out.push(`| ${item.word} | ${item.count} | ${item.percent}% |`);
  }

  if (distribution.length > 0) {
    out.push('', '## 字符分布', '', '| 类别 | 数量 | 占比 |', '| --- | ---: | ---: |');
    for (const bucket of distribution) out.push(`| ${bucket.label} | ${bucket.count} | ${bucket.percent}% |`);
  }

  out.push('', '## 行特征', '');
  if (lines.longest) out.push(`- 最长行：第 ${lines.longest.lineNo} 行，${lines.longest.length} 字符`);
  if (lines.shortest) out.push(`- 最短行：第 ${lines.shortest.lineNo} 行，${lines.shortest.length} 字符`);
  out.push(`- 超长行（> ${lines.tooLongThreshold} 字符）：${lines.tooLong.length} 行`);
  out.push(`- 行尾带空白：${lines.trailingSpace.length} 行`);
  out.push(`- CRLF 行：${lines.crlfLines.length} 行`);
  out.push(`- Tab 缩进行：${lines.tabIndentedLines.length} 行`);
  out.push(`- LF/CRLF 混用：${lines.mixedNewline ? '是' : '否'}`);
  out.push(`- Tab/空格缩进混用：${lines.mixedIndent ? '是' : '否'}`);
  return out.join('\n');
}
