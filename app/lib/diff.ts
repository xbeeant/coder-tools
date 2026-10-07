/**
 * 文本差异对比的纯逻辑层。
 *
 * 底层统一使用 jsdiff（`diff` 包）计算 LCS：
 * - 行级：diffLines + oneChangePerToken，按行号配对得到 add/del/modify 行；
 * - 词级：diffWordsWithSpace；字符级：diffChars，二者按换行切成并排的两列。
 * 所有比较类开关（忽略空白/大小写/行尾空白/空行）只作用于「比较用的副本」，
 * 展示的仍然是原文，避免用户看到被悄悄改写过的文本。
 */
import {
  type Change,
  createPatch,
  createTwoFilesPatch,
  diffChars,
  diffLines,
  diffWords,
  diffWordsWithSpace,
} from 'diff';

export type DiffMode = 'lines' | 'words' | 'chars';
export type DiffView = 'split' | 'inline';

export interface DiffOptions {
  mode: DiffMode;
  /** 忽略行首与行尾空白。 */
  ignoreWhitespace: boolean;
  /** 忽略空行（两侧都过滤掉后再比较）。 */
  ignoreBlankLines: boolean;
  /** 忽略行尾空白（只去尾部，保留行首缩进）。 */
  ignoreTrailingWhitespace: boolean;
  ignoreCase: boolean;
  /** 词级模式下把空格也算作差异（diffWordsWithSpace）；关闭时用 diffWords 只比词。 */
  keepSpaces: boolean;
  /** unified diff 的上下文行数，同时用于折叠未变更区块。 */
  context: number;
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  mode: 'lines',
  ignoreWhitespace: false,
  ignoreBlankLines: false,
  ignoreTrailingWhitespace: false,
  ignoreCase: false,
  keepSpaces: true,
  context: 3,
};

/** 未变更区块超过该行数时默认折叠，避免大文件刷屏。 */
export const AUTO_COLLAPSE_LINES = 5000;

// ── 忽略规则 ──────────────────────────────────────────────

export interface IgnoreRule {
  kind: 'exclude' | 'only';
  /** 去掉前缀后的原始正则文本。 */
  source: string;
  regex: RegExp;
}

export interface IgnoreRuleParse {
  rules: IgnoreRule[];
  /** 非法正则的提示文案。 */
  errors: string[];
}

/**
 * 解析忽略规则，每行一条：
 * - `-正则` 或直接写 `正则`：匹配到的行在两侧都跳过；
 * - `!正则`：白名单，只要存在白名单规则，未匹配的一律跳过；
 * - `#` 开头为注释。
 */
export function parseIgnoreRules(text: string): IgnoreRuleParse {
  const rules: IgnoreRule[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const kind: IgnoreRule['kind'] = line.startsWith('!') ? 'only' : 'exclude';
    const source = (line.startsWith('!') ? line.slice(1) : line.startsWith('-') ? line.slice(1) : line).trim();
    if (source === '') continue;
    try {
      rules.push({ kind, source, regex: new RegExp(source) });
    } catch {
      errors.push(source);
    }
  }
  return { rules, errors };
}

function keepByRules(line: string, rules: IgnoreRule[]): boolean {
  if (rules.length === 0) return true;
  for (const rule of rules) {
    if (rule.kind === 'exclude' && rule.regex.test(line)) return false;
  }
  const only = rules.filter((rule) => rule.kind === 'only');
  if (only.length === 0) return true;
  return only.some((rule) => rule.regex.test(line));
}

// ── 行与行号 ──────────────────────────────────────────────

/** 拆分为行数组，结尾换行不算多出一行。 */
export function toLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function lineCount(text: string): number {
  return text === '' ? 0 : 1;
}

// ── 差异模型 ──────────────────────────────────────────────

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export type DiffRowKind = 'equal' | 'add' | 'del' | 'modify';

export interface DiffRow {
  kind: DiffRowKind;
  leftNo: number | null;
  rightNo: number | null;
  left: string;
  right: string;
  /** 词级/字符级模式下的高亮片段。 */
  leftParts?: DiffSegment[];
  rightParts?: DiffSegment[];
  /** 稳定标识，用于列表 key，避免使用数组下标。 */
  rowId?: number;
}

export interface DiffStats {
  added: number;
  deleted: number;
  modified: number;
  unchanged: number;
  leftLines: number;
  rightLines: number;
  /** Sørensen–Dice 行级相似度（0~100）。 */
  similarity: number;
  /** 改动行占较大一侧的比例（%）。 */
  changeRatio: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
  /** 过滤后的左侧文本，用于生成 patch 与 sed 脚本。 */
  leftText: string;
  rightText: string;
  /** 因忽略规则/空行过滤掉的行数。 */
  filteredLines: number;
}

function prepare(text: string, options: DiffOptions, rules: IgnoreRule[]): { display: string[]; total: number } {
  const all = toLines(text);
  const kept = all.filter((line) => keepByRules(line, rules));
  const display = options.ignoreBlankLines ? kept.filter((line) => line.trim() !== '') : kept;
  return { display, total: all.length };
}

/** 比较用副本：按开关折叠大小写与行尾空白，展示仍用原文。 */
function compareLines(lines: string[], options: DiffOptions): string[] {
  return lines.map((line) => {
    const trimmed = options.ignoreTrailingWhitespace ? line.replace(/[ \t]+$/u, '') : line;
    return options.ignoreCase ? trimmed.toLowerCase() : trimmed;
  });
}

/** 字符多重集 Dice 相似度，用来判断两行是否「相近到算修改」。 */
export function lineSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a === '' || b === '') return 0;
  const pool = new Map<string, number>();
  for (const char of a) pool.set(char, (pool.get(char) ?? 0) + 1);
  let matched = 0;
  for (const char of b) {
    const left = pool.get(char) ?? 0;
    if (left > 0) {
      matched += 1;
      pool.set(char, left - 1);
    }
  }
  return (2 * matched) / (a.length + b.length);
}

const MODIFY_THRESHOLD = 0.5;

/** 词级高亮片段：把一对文本切成「变化/未变化」的片段序列。 */
export function inlineParts(a: string, b: string, ignoreCase: boolean): { left: DiffSegment[]; right: DiffSegment[] } {
  if (a === b) {
    return { left: [{ text: a, changed: false }], right: [{ text: b, changed: false }] };
  }
  const changes = diffWordsWithSpace(a, b, { ignoreCase });
  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  for (const change of changes) {
    if (!change.added) left.push({ text: change.value, changed: change.removed });
    if (!change.removed) right.push({ text: change.value, changed: change.added });
  }
  return { left, right };
}

function rowsFromLines(left: string[], right: string[], options: DiffOptions): DiffRow[] {
  const foldLeft = compareLines(left, options);
  const foldRight = compareLines(right, options);
  const changes: Change[] = diffLines(foldLeft.join('\n'), foldRight.join('\n'), {
    stripTrailingCr: true,
    newlineIsToken: false,
    ignoreWhitespace: options.ignoreWhitespace,
    oneChangePerToken: true,
  });

  const rows: DiffRow[] = [];
  let li = 0;
  let ri = 0;
  for (const change of changes) {
    const size = change.count;
    if (change.added) {
      for (let k = 0; k < size; k++) {
        rows.push({ kind: 'add', leftNo: null, rightNo: ri + k + 1, left: '', right: right[ri + k] ?? '' });
      }
      ri += size;
    } else if (change.removed) {
      for (let k = 0; k < size; k++) {
        rows.push({ kind: 'del', leftNo: li + k + 1, rightNo: null, left: left[li + k] ?? '', right: '' });
      }
      li += size;
    } else {
      for (let k = 0; k < size; k++) {
        rows.push({
          kind: 'equal',
          leftNo: li + k + 1,
          rightNo: ri + k + 1,
          left: left[li + k] ?? '',
          right: right[ri + k] ?? '',
        });
      }
      li += size;
      ri += size;
    }
  }
  return pairRows(rows, options.ignoreCase);
}

/** 把相邻的删除块与新增块按顺序配对；相似度过低时保持「删除 + 新增」两条独立行。 */
function pairRows(rows: DiffRow[], ignoreCase: boolean): DiffRow[] {
  const out: DiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind !== 'del') {
      out.push(row);
      i += 1;
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end].kind === 'del') end += 1;
    const dels = rows.slice(i, end);
    let addEnd = end;
    while (addEnd < rows.length && rows[addEnd].kind === 'add') addEnd += 1;
    const adds = rows.slice(end, addEnd);
    const total = Math.max(dels.length, adds.length);
    for (let k = 0; k < total; k++) {
      const del = dels[k];
      const add = adds[k];
      if (del && add && lineSimilarity(del.left, add.left) >= MODIFY_THRESHOLD) {
        const parts = inlineParts(del.left, add.left, ignoreCase);
        out.push({
          kind: 'modify',
          leftNo: del.leftNo,
          rightNo: add.rightNo,
          left: del.left,
          right: add.left,
          leftParts: parts.left,
          rightParts: parts.right,
        });
      } else {
        if (del) out.push(del);
        if (add) out.push(add);
      }
    }
    i = addEnd;
  }
  return out;
}

function rowsFromTokens(leftText: string, rightText: string, options: DiffOptions): DiffRow[] {
  const changes =
    options.mode === 'words'
      ? options.keepSpaces
        ? diffWordsWithSpace(leftText, rightText, { ignoreCase: options.ignoreCase })
        : diffWords(leftText, rightText, { ignoreCase: options.ignoreCase })
      : diffChars(leftText, rightText, { ignoreCase: options.ignoreCase });

  const rows: DiffRow[] = [];
  let leftParts: DiffSegment[] = [];
  let rightParts: DiffSegment[] = [];
  let leftDirty = false;
  let rightDirty = false;
  let leftHas = false;
  let rightHas = false;
  let leftNo = 0;
  let rightNo = 0;

  const flush = () => {
    if (!leftHas && !rightHas) {
      leftParts = [];
      rightParts = [];
      leftDirty = false;
      rightDirty = false;
      return;
    }
    const left = leftParts.map((part) => part.text).join('');
    const right = rightParts.map((part) => part.text).join('');
    if (leftHas) leftNo += 1;
    if (rightHas) rightNo += 1;
    const kind: DiffRowKind = leftDirty && rightDirty ? 'modify' : leftDirty ? 'del' : rightDirty ? 'add' : 'equal';
    rows.push({
      kind,
      leftNo: leftHas ? leftNo : null,
      rightNo: rightHas ? rightNo : null,
      left,
      right,
      leftParts: [...leftParts],
      rightParts: [...rightParts],
    });
    leftParts = [];
    rightParts = [];
    leftDirty = false;
    rightDirty = false;
    leftHas = false;
    rightHas = false;
  };

  for (const change of changes) {
    const chunks = change.value.split('\n');
    for (let index = 0; index < chunks.length; index++) {
      if (index > 0) flush();
      const chunk = chunks[index];
      if (chunk === '') continue;
      if (change.added) {
        rightParts.push({ text: chunk, changed: true });
        rightHas = true;
        rightDirty = true;
      } else if (change.removed) {
        leftParts.push({ text: chunk, changed: true });
        leftHas = true;
        leftDirty = true;
      } else {
        leftParts.push({ text: chunk, changed: false });
        rightParts.push({ text: chunk, changed: false });
        leftHas = true;
        rightHas = true;
      }
    }
  }
  flush();
  return rows;
}

export function computeStats(rows: DiffRow[]): DiffStats {
  let added = 0;
  let deleted = 0;
  let modified = 0;
  let unchanged = 0;
  let leftLines = 0;
  let rightLines = 0;

  for (const row of rows) {
    const left = lineCount(row.left);
    const right = lineCount(row.right);
    leftLines += left;
    rightLines += right;
    if (row.kind === 'add') {
      added += right;
      deleted += left;
      unchanged += left;
    } else if (row.kind === 'del') {
      deleted += left;
      unchanged += left;
    } else if (row.kind === 'modify') {
      modified += Math.max(left, right);
      unchanged += Math.min(left, right);
    } else {
      unchanged += left;
    }
  }

  const total = leftLines + rightLines;
  const similarity = total === 0 ? 100 : Math.round(((2 * unchanged) / total) * 1000) / 10;
  const base = Math.max(leftLines, rightLines, 1);
  const changeRatio = Math.round(((added + deleted + modified) / base) * 1000) / 10;
  return { added, deleted, modified, unchanged, leftLines, rightLines, similarity, changeRatio };
}

export function computeDiff(
  leftText: string,
  rightText: string,
  options: DiffOptions,
  rules: IgnoreRule[] = [],
): DiffResult {
  const left = prepare(leftText, options, rules);
  const right = prepare(rightText, options, rules);
  const a = left.display.join('\n');
  const b = right.display.join('\n');
  const raw =
    options.mode === 'lines' ? rowsFromLines(left.display, right.display, options) : rowsFromTokens(a, b, options);
  const rows = raw.map((row, index) => ({ ...row, rowId: index }));
  return {
    rows,
    stats: computeStats(rows),
    leftText: a,
    rightText: b,
    filteredLines: left.total + right.total - left.display.length - right.display.length,
  };
}

// ── 区块折叠 ──────────────────────────────────────────────

export type DiffBlock =
  | { type: 'rows'; key: string; rows: DiffRow[] }
  | { type: 'fold'; key: string; count: number; head: DiffRow[]; tail: DiffRow[] };

/** 连续未变更行超过 2×context+2 时折叠成「展开 N 行」。 */
export function collapseRows(rows: DiffRow[], context: number): DiffBlock[] {
  const keep = Math.max(0, context);
  const blocks: DiffBlock[] = [];
  let buffer: DiffRow[] = [];
  let blockIndex = 0;

  const flushEqual = () => {
    if (buffer.length === 0) return;
    if (buffer.length <= keep * 2 + 2) {
      blocks.push({ type: 'rows', key: `eq-${blockIndex++}`, rows: buffer });
    } else {
      blocks.push({
        type: 'fold',
        key: `fold-${blockIndex++}`,
        count: buffer.length,
        head: buffer.slice(0, keep),
        tail: keep > 0 ? buffer.slice(buffer.length - keep) : [],
      });
    }
    buffer = [];
  };

  for (const row of rows) {
    if (row.kind === 'equal') {
      buffer.push(row);
      continue;
    }
    flushEqual();
    blocks.push({ type: 'rows', key: `row-${blockIndex++}`, rows: [row] });
  }
  flushEqual();
  return blocks;
}

// ── 导出：unified diff 与 sed 脚本 ─────────────────────────

/** 生成 unified diff；`gitStyle` 为真时输出 a/ 与 b/ 前缀（Git 风格）。 */
export function unifiedPatch(
  oldText: string,
  newText: string,
  filename: string,
  context: number,
  gitStyle = true,
): string {
  const options = { context: Math.max(0, context) };
  if (gitStyle) {
    return createTwoFilesPatch(`a/${filename}`, `b/${filename}`, oldText, newText, undefined, undefined, options);
  }
  return createPatch(filename, oldText, newText, undefined, undefined, options);
}

function sedEscape(text: string): string {
  return text.replace(/[\\|&]/gu, '\\$&');
}

/**
 * 由差异行生成「把 A 改成 B」的 sed 脚本。
 * 只处理单行且成对的修改/删除+新增，词级模式下的多行行不参与。
 */
export function buildSedScript(rows: DiffRow[], filename: string, limit = 60): string {
  const commands: string[] = [];
  const pending: DiffRow[] = [];
  const flushPending = () => {
    pending.length = 0;
  };

  for (const row of rows) {
    if (
      row.kind === 'modify' &&
      row.left !== '' &&
      row.right !== '' &&
      !row.left.includes('\n') &&
      !row.right.includes('\n')
    ) {
      flushPending();
      commands.push(`sed -i -e 's|^${sedEscape(row.left)}$|${sedEscape(row.right)}|' ${filename}`);
    } else if (row.kind === 'del') {
      pending.push(row);
    } else if (row.kind === 'add') {
      const del = pending.shift();
      if (del && del.left !== '' && row.right !== '' && !del.left.includes('\n') && !row.right.includes('\n')) {
        commands.push(`sed -i -e 's|^${sedEscape(del.left)}$|${sedEscape(row.right)}|' ${filename}`);
      } else {
        commands.push(`# 新增行（sed 无法安全插入，请手工确认）：${row.right}`);
      }
    } else {
      flushPending();
    }
  }
  flushPending();

  const head = ['# 由「文本差异对比」生成：把 A 改为 B 的 sed 替换脚本', `# 目标文件：${filename}`];
  const body = commands.length === 0 ? ['# 未发现可安全替换的单行差异'] : commands.slice(0, limit);
  const tail = commands.length > limit ? [`# 另有 ${commands.length - limit} 条未列出`] : [];
  return [...head, ...body, ...tail].join('\n');
}
