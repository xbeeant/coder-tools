/**
 * 表格数据模型与各格式互转的纯函数集合。
 *
 * 覆盖：CSV / TSV（RFC 4180）、GFM Markdown、HTML `<table>`、JSON 数组，
 * 以及基于 jszip 手工实现的最小 XLSX 读写（只保留值，不含样式与公式计算）。
 */

import JSZip from 'jszip';

export type CellValue = string | number | boolean | null;

export interface Table {
  /** 多工作表场景下的名称，单表时可不填。 */
  name?: string;
  columns: string[];
  rows: CellValue[][];
}

export type ColumnAlign = 'none' | 'left' | 'center' | 'right';

export type TableFormat = 'csv' | 'markdown' | 'html' | 'json' | 'xlsx';

export const EMPTY_TABLE: Table = { columns: [], rows: [] };

// ── 通用工具 ────────────────────────────────────────────────────────────

/** 单元格转显示文本。 */
export function cellText(value: CellValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function createTable(columns: string[], rows: CellValue[][], name?: string): Table {
  const width = columns.length;
  const normalized = rows.map((row) => {
    const copy = row.slice(0, width);
    while (copy.length < width) copy.push(null);
    return copy;
  });
  return name === undefined ? { columns, rows: normalized } : { name, columns, rows: normalized };
}

/** 判断整行是否全为空值。 */
export function isEmptyRow(row: CellValue[]): boolean {
  return row.every((cell) => cell === null || cell === '' || (typeof cell === 'string' && cell.trim() === ''));
}

/** 判断整列是否全为空值。 */
export function isEmptyColumn(rows: CellValue[][], index: number): boolean {
  return rows.every((row) => {
    const cell = row[index];
    return cell === null || cell === undefined || cell === '' || (typeof cell === 'string' && cell.trim() === '');
  });
}

// ── CSV / TSV ───────────────────────────────────────────────────────────

const DELIMITER_CANDIDATES = [',', '\t', ';', '|'];

/** 去掉 UTF-8 BOM 并统一换行符。 */
function normalizeText(text: string): string {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return stripped.replace(/\r\n?/g, '\n');
}

/**
 * 猜测分隔符：取前若干行中「引号外出现次数最多且各行次数一致」的候选。
 * 引号内的分隔符不计入。
 */
export function detectDelimiter(text: string): string {
  const lines = normalizeText(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(0, 10);
  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    if (!counts.every((count) => count === first)) continue;
    if (first > bestScore) {
      bestScore = first;
      best = candidate;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) count += 1;
  }
  return count;
}

/**
 * 解析分隔符文本（RFC 4180）。
 * 支持引号转义（`""`）、字段内换行、BOM、CRLF；分隔符省略时自动识别。
 */
export function parseDelimited(text: string, delimiter?: string): Table {
  const source = normalizeText(text);
  if (source.trim() === '') return createTable([], []);
  const sep = delimiter && delimiter !== 'auto' ? delimiter : detectDelimiter(source);

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === '') {
      quoted = true;
      started = true;
      field = '';
      continue;
    }
    if (char === sep) {
      started = true;
      endField();
      continue;
    }
    if (char === '\n') {
      if (started || field !== '' || row.length > 0) endRow();
      continue;
    }
    started = true;
    field += char;
  }

  if (field !== '' || row.length > 0 || started) endRow();
  if (records.length === 0) return createTable([], []);

  const header = records[0].map((name, index) => (name.trim() === '' ? `列${index + 1}` : name.trim()));
  const unique = makeUniqueHeaders(header);
  return createTable(
    unique,
    records.slice(1).map((record) => record.map((cell) => (cell.trim() === '' ? null : cell))),
  );
}

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

export interface DelimitedOptions {
  /** 换行符，默认 \n（Excel 兼容可设 \r\n）。 */
  eol?: string;
  /** 是否给所有字段加引号。 */
  quoteAll?: boolean;
  /** 空值的输出文本。 */
  nullText?: string;
  /** 是否按内容宽度补空格对齐（仅影响可读性，解析时会被忽略）。 */
  alignColumns?: boolean;
}

/** 序列化为分隔符文本（RFC 4180）。 */
export function toDelimited(table: Table, delimiter = ',', options: DelimitedOptions = {}): string {
  const eol = options.eol ?? '\n';
  const quoteAll = options.quoteAll ?? false;
  const nullText = options.nullText ?? '';

  const quote = (raw: string): string => {
    const value = raw === '' ? nullText : raw;
    const needsQuote =
      quoteAll ||
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r') ||
      value !== value.trim();
    if (!needsQuote) return value;
    return `"${value.replace(/"/g, '""')}"`;
  };

  const lines: string[] = [];
  const widths = options.alignColumns === true ? columnWidths(table) : table.columns.map(() => 0);
  const pad = (raw: string, index: number) =>
    widths[index] && widths[index] > raw.length ? raw.padEnd(widths[index]) : raw;

  lines.push(table.columns.map((name, index) => quote(pad(name, index))).join(delimiter));
  for (const row of table.rows) {
    lines.push(table.columns.map((_, index) => quote(pad(cellText(row[index] ?? null), index))).join(delimiter));
  }
  return lines.join(eol);
}

// ── Markdown ────────────────────────────────────────────────────────────

export interface MarkdownOptions {
  /** 每列的对齐方式，缺省全部 none。 */
  align?: ColumnAlign[];
  /** 是否转义单元格内的竖线。 */
  escapePipes?: boolean;
  /** 空值输出文本。 */
  nullText?: string;
  /** 按列内容推断对齐（数字右对齐、布尔居中）。 */
  autoAlign?: boolean;
}

const ALIGN_MARK: Record<ColumnAlign, string> = {
  none: '---',
  left: ':---',
  center: ':---:',
  right: '---:',
};

function inferAligns(table: Table, autoAlign: boolean): ColumnAlign[] {
  if (!autoAlign) return table.columns.map(() => 'none' as ColumnAlign);
  return table.columns.map((_, index) => {
    let numeric = 0;
    let filled = 0;
    for (const row of table.rows) {
      const cell = row[index];
      if (cell === null || cell === '') continue;
      filled += 1;
      if (typeof cell === 'number' || /^-?\d+(\.\d+)?$/.test(String(cell))) numeric += 1;
    }
    if (filled === 0) return 'none';
    return numeric === filled ? 'right' : 'none';
  });
}

/** 输出 GFM Markdown 表格。 */
export function toMarkdown(table: Table, options: MarkdownOptions = {}): string {
  if (table.columns.length === 0) return '';
  const aligns = options.align ?? inferAligns(table, options.autoAlign ?? false);
  const escapePipes = options.escapePipes ?? true;
  const nullText = options.nullText ?? '';

  const cell = (value: CellValue): string => {
    const raw = value === null ? nullText : cellText(value);
    const escaped = escapePipes ? raw.replace(/\|/g, '\\|') : raw;
    return escaped.replace(/\n/g, '<br>');
  };

  const header = `| ${table.columns.map((name) => cell(name)).join(' | ')} |`;
  const divider = `| ${table.columns.map((_, index) => ALIGN_MARK[aligns[index] ?? 'none']).join(' | ')} |`;
  const body = table.rows.map((row) => `| ${table.columns.map((_, index) => cell(row[index] ?? null)).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

/** 解析 GFM Markdown 表格（含对齐行）。 */
export function parseMarkdownTable(md: string): Table {
  const lines = normalizeText(md)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const tableLines = lines.filter(
    (line) => line.includes('|') && !/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line),
  );
  if (tableLines.length === 0) return createTable([], []);

  const splitRow = (line: string): string[] => {
    let text = line.trim();
    if (text.startsWith('|')) text = text.slice(1);
    if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
    const cells: string[] = [];
    let cell = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\\' && text[i + 1] === '|') {
        cell += '|';
        i += 1;
        continue;
      }
      if (char === '|') {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
      cell += char;
    }
    cells.push(cell.trim());
    return cells;
  };

  const header = splitRow(tableLines[0] ?? '');
  const columns = makeUniqueHeaders(header.map((name, index) => (name === '' ? `列${index + 1}` : name)));
  const rows = tableLines.slice(1).map((line) => {
    const cells = splitRow(line);
    return columns.map((_, index) => (cells[index] === undefined || cells[index] === '' ? null : cells[index]));
  });
  return createTable(columns, rows);
}

/** 从 Markdown 文本中读取对齐设置。 */
export function parseMarkdownAligns(md: string): ColumnAlign[] {
  for (const line of normalizeText(md).split('\n')) {
    const trimmed = line.trim();
    if (!/^:?-{2,}:?(\s*\|\s*:?-{2,}:?)*$/.test(trimmed)) continue;
    return trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => {
        const text = cell.trim();
        const left = text.startsWith(':');
        const right = text.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return 'none';
      });
  }
  return [];
}

// ── HTML ────────────────────────────────────────────────────────────────

export interface HtmlTableOptions {
  /** 是否输出 thead / tbody。 */
  sections?: boolean;
  /** border 属性值，省略则不输出。 */
  border?: number | false;
  /** class 属性。 */
  className?: string;
  /** caption 内容。 */
  caption?: string;
  /** 输出内联样式（border-collapse、边框等）。 */
  inlineStyles?: boolean;
  /** 空值输出文本。 */
  nullText?: string;
  /** 是否转义 HTML 特殊字符，默认 true。 */
  escape?: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 生成完整 `<table>` HTML。 */
export function toHtmlTable(table: Table, options: HtmlTableOptions = {}): string {
  if (table.columns.length === 0) return '';
  const shouldEscape = options.escape ?? true;
  const encode = (value: string) => (shouldEscape ? escapeHtml(value) : value);
  const nullText = options.nullText ?? '';

  const attributes: string[] = [];
  if (options.border === false) attributes.push('border="0"');
  else if (typeof options.border === 'number') attributes.push(`border="${options.border}"`);
  if (options.className !== undefined) attributes.push(`class="${encode(options.className)}"`);
  if (options.inlineStyles === true) {
    attributes.push('style="border-collapse: collapse"');
  }

  const open = `<table${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>`;
  const cellStyle = options.inlineStyles === true ? ' style="border: 1px solid #ccc; padding: 4px 8px"' : '';
  const headStyle =
    options.inlineStyles === true ? ' style="border: 1px solid #ccc; padding: 4px 8px; background: #f5f5f5"' : '';

  const head = table.columns.map((name) => `<th${headStyle}>${encode(name)}</th>`).join('');
  const body = table.rows
    .map((row) => {
      const cells = table.columns
        .map((_, index) => {
          const raw = row[index] ?? null;
          return `<td${cellStyle}>${encode(raw === null ? nullText : cellText(raw))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  const caption =
    options.caption === undefined || options.caption === '' ? '' : `<caption>${encode(options.caption)}</caption>`;
  const thead = options.sections === false ? '' : `<thead>\n<tr>${head}</tr>\n</thead>`;
  const tbody = options.sections === false ? '' : `<tbody>\n${body}\n</tbody>`;
  return `${open}\n${caption}${thead}${tbody}\n</table>`;
}

/** 用 DOMParser 解析第 `index` 个 `<table>`，自动推断单元格类型。 */
export function parseHtmlTable(html: string, index = 0): Table {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const element = doc.querySelectorAll('table')[index];
  if (element === undefined) return createTable([], []);

  const headerCells = Array.from(element.querySelectorAll('thead th, thead td'));
  const sourceRows = Array.from(element.querySelectorAll('tbody tr'));
  const allRows = Array.from(element.querySelectorAll('tr'));
  const bodyRows =
    sourceRows.length > 0
      ? sourceRows
      : allRows.filter((row) => !headerCells.includes(row.querySelector('th') as never));

  const hasHead = headerCells.length > 0;
  let columns: string[];
  let dataRows: HTMLTableRowElement[];

  if (hasHead) {
    columns = headerCells.map((cell, i) => {
      const text = (cell.textContent ?? '').trim();
      return text === '' ? `列${i + 1}` : text;
    });
    dataRows = bodyRows as HTMLTableRowElement[];
  } else {
    const widths = allRows.map((row) => row.querySelectorAll('td, th').length);
    const width = widths.length > 0 ? Math.max(...widths) : 0;
    columns = Array.from({ length: width }, (_, i) => `列${i + 1}`);
    dataRows = allRows as HTMLTableRowElement[];
  }

  const rows = dataRows.map((row) => {
    const cells = Array.from(row.querySelectorAll('td, th'));
    return columns.map((_, i) => inferCell(cells[i]?.textContent ?? ''));
  });

  return createTable(makeUniqueHeaders(columns), rows);
}

// 只认明确的布尔词，避免把 1/0 之类的编号列误判成布尔值
const TRUTHY = new Set(['true', 'yes', 'y']);
const FALSY = new Set(['false', 'no', 'n']);

/** 单元格文本自动推断为 number / boolean / null / string。 */
export function inferCell(text: string): CellValue {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const lower = trimmed.toLowerCase();
  if (FALSY.has(lower)) return false;
  if (TRUTHY.has(lower)) return true;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  return text;
}

// ── JSON ────────────────────────────────────────────────────────────────

export interface JsonTableOptions {
  /** 缩进，默认 2；传 0 表示压缩。 */
  indent?: number;
  /** 日期等非字符串值统一转字符串。 */
  stringify?: boolean;
}

/** 输出 JSON 数组（对象数组）。 */
export function tableToJson(table: Table, options: JsonTableOptions = {}): string {
  const records = table.rows.map((row) => {
    const record: Record<string, CellValue> = {};
    table.columns.forEach((column, index) => {
      record[column] = row[index] ?? null;
    });
    return record;
  });
  const indent = options.indent ?? 2;
  return JSON.stringify(records, null, indent);
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** 解析 JSON 数组为表格；对象数组取键并集作为列。 */
export function parseJsonTable(text: string): Table {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return createTable([], []);
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const keys: string[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const key of Object.keys(item)) if (!keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) return createTable([], []);

  const rows = list.map((item): CellValue[] => {
    const record = (item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {}) as Record<
      string,
      JsonValue
    >;
    return keys.map((key) => {
      const value = record[key];
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    });
  });
  return createTable(keys, rows);
}

// ── 类型推断 ────────────────────────────────────────────────────────────

export type ColumnTypeName = 'number' | 'boolean' | 'empty' | 'string' | 'mixed';

export interface ColumnTypeInfo {
  column: string;
  type: ColumnTypeName;
  /** 该列的空值数量。 */
  nulls: number;
  /** 最长的单元格文本长度。 */
  maxLength: number;
}

const NUMBER_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/;

function toNumber(text: string): number | null {
  if (!NUMBER_PATTERN.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** 逐列统计类型，用于预览区展示。 */
export function detectColumnTypes(table: Table): ColumnTypeInfo[] {
  return table.columns.map((column, index) => {
    let numbers = 0;
    let booleans = 0;
    let nulls = 0;
    let filled = 0;
    let maxLength = column.length;
    for (const row of table.rows) {
      const cell = row[index];
      if (cell === null || cell === undefined || cell === '') {
        nulls += 1;
        continue;
      }
      filled += 1;
      maxLength = Math.max(maxLength, cellText(cell).length);
      if (typeof cell === 'number') {
        numbers += 1;
        continue;
      }
      if (typeof cell === 'boolean') {
        booleans += 1;
        continue;
      }
      const text = cellText(cell);
      const lower = text.trim().toLowerCase();
      if (NUMBER_PATTERN.test(text.trim())) numbers += 1;
      else if (FALSY.has(lower) || TRUTHY.has(lower)) booleans += 1;
    }
    let type: ColumnTypeName = 'string';
    if (filled === 0) type = 'empty';
    else if (numbers === filled) type = 'number';
    else if (booleans === filled) type = 'boolean';
    else if (numbers + booleans === filled) type = 'mixed';
    return { column, type, nulls, maxLength };
  });
}

export interface InferTypesOptions {
  /** 把纯数字列转成 number，默认开启。 */
  numbers?: boolean;
  /** 把 true/false/yes/no 列转成 boolean，默认开启。 */
  booleans?: boolean;
}

/** 按列内容推断类型并转换数值，空串转 null。 */
export function inferTypes(table: Table, options: InferTypesOptions = {}): Table {
  const numbers = options.numbers ?? true;
  const booleans = options.booleans ?? true;
  const infos = detectColumnTypes(table);

  const rows = table.rows.map((row) =>
    row.map((cell, index) => {
      if (cell === null || cell === undefined) return null;
      if (typeof cell !== 'string') return cell;
      const text = cell.trim();
      if (text === '') return null;
      const info = infos[index];
      if (numbers && info?.type === 'number') {
        const value = toNumber(text);
        if (value !== null) return value;
      }
      if (booleans && info?.type === 'boolean') {
        const lower = text.toLowerCase();
        if (FALSY.has(lower)) return false;
        if (TRUTHY.has(lower)) return true;
      }
      return cell;
    }),
  );
  return createTable(table.columns, rows, table.name);
}

// ── 行列表操作 ──────────────────────────────────────────────────────────

/** 转置：行变列。 */
export function transpose(table: Table): Table {
  const columns = [table.columns[0] ?? '列1', ...table.rows.map((row, index) => cellText(row[0] ?? `行${index + 1}`))];
  const rows = table.columns
    .slice(1)
    .map((_, columnIndex) =>
      columns.map((_, rowIndex) =>
        rowIndex === 0 ? (table.columns[columnIndex + 1] ?? '') : (table.rows[rowIndex - 1]?.[columnIndex + 1] ?? null),
      ),
    );
  return createTable(columns, rows, table.name);
}

export function removeEmptyRows(table: Table): Table {
  return { ...table, rows: table.rows.filter((row) => !isEmptyRow(row)) };
}

export function removeEmptyColumns(table: Table): Table {
  const keep = table.columns.map((_, index) => !isEmptyColumn(table.rows, index));
  return createTable(
    table.columns.filter((_, index) => keep[index]),
    table.rows.map((row) => row.filter((_, index) => keep[index])),
    table.name,
  );
}

/** 去除完全重复的行，返回新表并给出被移除的数量。 */
export function removeDuplicateRows(table: Table): { table: Table; removed: number } {
  const seen = new Set<string>();
  const rows: CellValue[][] = [];
  let removed = 0;
  for (const row of table.rows) {
    const key = JSON.stringify(row.map((cell) => cellText(cell)));
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }
  return { table: { ...table, rows }, removed };
}

export type SortDirection = 'asc' | 'desc';

/** 按列排序，数字优先按数值比较，其余按 locale 比较。 */
export function sortRows(table: Table, columnIndex: number, direction: SortDirection = 'asc'): Table {
  const factor = direction === 'desc' ? -1 : 1;
  const rows = table.rows.slice().sort((a, b) => {
    const left = a[columnIndex];
    const right = b[columnIndex];
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    if (typeof left === 'boolean' || typeof right === 'boolean') {
      return (Number(Boolean(left)) - Number(Boolean(right))) * factor;
    }
    const leftNumber = toNumber(String(left).trim());
    const rightNumber = toNumber(String(right).trim());
    if (leftNumber !== null && rightNumber !== null) return (leftNumber - rightNumber) * factor;
    return String(left).localeCompare(String(right), 'zh-Hans-CN') * factor;
  });
  return { ...table, rows };
}

/** 调整列顺序，delta 为 -1 左移 / +1 右移。 */
export function moveColumn(table: Table, columnIndex: number, delta: number): Table {
  const target = columnIndex + delta;
  if (columnIndex < 0 || columnIndex >= table.columns.length || target < 0 || target >= table.columns.length) {
    return table;
  }
  const columns = table.columns.slice();
  const [column] = columns.splice(columnIndex, 1);
  columns.splice(target, 0, column ?? '');
  const rows = table.rows.map((row) => {
    const copy = row.slice();
    const [cell] = copy.splice(columnIndex, 1);
    copy.splice(target, 0, cell ?? null);
    return copy;
  });
  return { ...table, columns, rows };
}

/** 重命名列。 */
export function renameColumn(table: Table, columnIndex: number, name: string): Table {
  if (columnIndex < 0 || columnIndex >= table.columns.length) return table;
  const columns = table.columns.slice();
  columns[columnIndex] = name;
  return { ...table, columns };
}

/** 删除列。 */
export function removeColumn(table: Table, columnIndex: number): Table {
  if (columnIndex < 0 || columnIndex >= table.columns.length) return table;
  return createTable(
    table.columns.filter((_, index) => index !== columnIndex),
    table.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    table.name,
  );
}

export interface TableStats {
  rowCount: number;
  columnCount: number;
  averageCellLength: number;
  emptyCount: number;
  duplicateCount: number;
  estimatedCsvBytes: number;
}

/** 汇总统计，用于 StatGrid。 */
export function tableStats(table: Table): TableStats {
  let total = 0;
  let empty = 0;
  let maxLength = 0;
  for (const row of table.rows) {
    for (let index = 0; index < table.columns.length; index++) {
      const cell = row[index];
      if (cell === null || cell === undefined || cell === '') {
        empty += 1;
        continue;
      }
      const length = cellText(cell).length;
      total += length;
      maxLength = Math.max(maxLength, length);
    }
  }
  const cells = table.rows.length * table.columns.length;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of table.rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return {
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    averageCellLength: cells === 0 ? 0 : Math.round((total / cells) * 10) / 10,
    emptyCount: empty,
    duplicateCount: duplicates,
    estimatedCsvBytes: new TextEncoder().encode(toDelimited(table)).length,
  };
}

/** 依据内容估算列宽（用于 Markdown 风格对齐与预览）。 */
export function columnWidths(table: Table): number[] {
  return table.columns.map((column, index) => {
    let width = column.length + 2;
    for (const row of table.rows) width = Math.max(width, cellText(row[index] ?? null).length + 2);
    return Math.min(width, 60);
  });
}

/** 猜测输入文本的格式。 */
export function detectTableFormat(text: string): TableFormat | 'unknown' {
  const trimmed = text.trim();
  if (trimmed === '') return 'unknown';
  if (/^[[{]/.test(trimmed)) return 'json';
  if (/^<(!doctype|html|table|div|body)\b/i.test(trimmed) || /<table[\s>]/i.test(trimmed)) return 'html';
  if (/^\|.*\|\s*$/m.test(trimmed) && /^\|?\s*:?-{2,}/m.test(trimmed)) return 'markdown';
  return 'csv';
}

/** 按猜测的格式解析文本。 */
export function parseAnyTable(text: string, delimiter?: string): Table {
  switch (detectTableFormat(text)) {
    case 'json':
      return parseJsonTable(text);
    case 'markdown':
      return parseMarkdownTable(text);
    case 'html':
      return parseHtmlTable(text);
    default:
      return parseDelimited(text, delimiter);
  }
}

// ── XLSX ────────────────────────────────────────────────────────────────

/** 列字母转 0 基列索引：AA → 26。 */
export function columnLetterToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    const code = char.charCodeAt(0) - 64;
    if (code < 1 || code > 26) break;
    index = index * 26 + code;
  }
  return Math.max(0, index - 1);
}

/** 0 基列索引转列字母：0 → A，26 → AA。 */
export function columnIndexToLetter(index: number): string {
  let value = index + 1;
  let letters = '';
  while (value > 0) {
    const rest = (value - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    value = Math.floor((value - rest) / 26);
  }
  return letters;
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function readTextContent(element: Element | null | undefined): string {
  if (element === null || element === undefined) return '';
  let out = '';
  for (const node of Array.from(element.getElementsByTagName('t'))) out += node.textContent ?? '';
  return out;
}

async function readZipEntry(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (entry === null) return null;
  return entry.async('string');
}

/**
 * 读取 xlsx：解 zip → workbook.xml 取工作表名与 r:id → rels 取路径 →
 * sharedStrings.xml → 逐个工作表解析单元格。
 * 返回的每个元素是一个 Table，`name` 为工作表名。
 */
export async function readXlsx(file: File): Promise<Table[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const sharedStrings: string[] = [];
  const sharedXml = await readZipEntry(zip, 'xl/sharedStrings.xml');
  if (sharedXml !== null) {
    const doc = parseXml(sharedXml);
    for (const si of Array.from(doc.getElementsByTagName('si'))) sharedStrings.push(readTextContent(si));
  }

  const relTargets = new Map<string, string>();
  const relsXml = await readZipEntry(zip, 'xl/_rels/workbook.xml.rels');
  if (relsXml !== null) {
    const doc = parseXml(relsXml);
    for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id !== null && target !== null) relTargets.set(id, target);
    }
  }

  const workbookXml = await readZipEntry(zip, 'xl/workbook.xml');
  if (workbookXml === null) throw new Error('不是有效的 xlsx：缺少 xl/workbook.xml');
  const workbook = parseXml(workbookXml);

  const sheets: Table[] = [];
  for (const sheet of Array.from(workbook.getElementsByTagName('sheet'))) {
    const name = sheet.getAttribute('name') ?? `Sheet${sheets.length + 1}`;
    const relId =
      sheet.getAttribute('r:id') ??
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
      relTargets.keys().next().value ??
      '';
    const target = relTargets.get(relId);
    if (target === undefined) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetXml = await readZipEntry(zip, path);
    if (sheetXml === null) continue;
    sheets.push(parseSheetXml(sheetXml, sharedStrings, name));
  }

  if (sheets.length === 0) throw new Error('xlsx 中没有找到工作表');
  return sheets;
}

/** 解析单个 sheet XML 为表格。 */
export function parseSheetXml(xml: string, sharedStrings: string[], name = 'Sheet1'): Table {
  const doc = parseXml(xml);
  const grid = new Map<number, Map<number, CellValue>>();
  let maxColumn = 0;

  for (const rowElement of Array.from(doc.getElementsByTagName('row'))) {
    const rowIndex = Number(rowElement.getAttribute('r') ?? '0') - 1;
    if (rowIndex < 0) continue;
    const cells = grid.get(rowIndex) ?? new Map<number, CellValue>();
    for (const cellElement of Array.from(rowElement.getElementsByTagName('c'))) {
      const ref = cellElement.getAttribute('r');
      const columnIndex = ref === null ? cells.size : columnLetterToIndex(ref.replace(/\d+/g, ''));
      const type = cellElement.getAttribute('t') ?? 'n';
      let value: CellValue = null;

      if (type === 's') {
        const raw = cellElement.getElementsByTagName('v')[0]?.textContent ?? '';
        value = sharedStrings[Number(raw)] ?? '';
      } else if (type === 'inlineStr') {
        value = readTextContent(cellElement.getElementsByTagName('is')[0]);
      } else if (type === 'b') {
        value = (cellElement.getElementsByTagName('v')[0]?.textContent ?? '0').trim() === '1';
      } else if (type === 'e' || type === 'str') {
        value = cellElement.getElementsByTagName('v')[0]?.textContent ?? '';
      } else {
        const raw = (cellElement.getElementsByTagName('v')[0]?.textContent ?? '').trim();
        if (raw !== '') {
          const parsed = Number(raw);
          value = Number.isFinite(parsed) ? parsed : raw;
        }
      }

      cells.set(columnIndex, value);
      maxColumn = Math.max(maxColumn, columnIndex + 1);
    }
    grid.set(rowIndex, cells);
  }

  const rowIndexes = [...grid.keys()].sort((a, b) => a - b);
  const matrix: CellValue[][] = rowIndexes.map((rowIndex) => {
    const cells = grid.get(rowIndex) ?? new Map<number, CellValue>();
    const values: CellValue[] = [];
    for (let i = 0; i < maxColumn; i++) values.push(cells.get(i) ?? null);
    return values;
  });

  if (matrix.length === 0) return createTable([], [], name);
  const header = matrix[0].map((cell, index) => {
    const text = cellText(cell).trim();
    return text === '' ? `列${index + 1}` : text;
  });
  return createTable(makeUniqueHeaders(header), matrix.slice(1), name);
}

/** XML 1.0 不允许的控制字符，写入 xlsx 前需要剔除。 */
const XML_ILLEGAL = new Set([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
]);

function xmlEscape(text: string): string {
  const cleaned = Array.from(text)
    .filter((char) => !XML_ILLEGAL.has(char.codePointAt(0) ?? 0))
    .join('');
  return cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellXml(ref: string, value: CellValue): string {
  if (value === null || value === '') return '';
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

/**
 * 生成最小合法 xlsx（inlineStr 单元格 + 数字类型）。
 * 可被 Excel / Numbers / WPS 打开，不含样式、共享字符串与公式。
 */
export async function writeXlsx(table: Table, sheetName = 'Sheet1'): Promise<Blob> {
  const safeName = sheetName.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || 'Sheet1';

  const headerRow = table.columns.map((name, index) => cellXml(`${columnIndexToLetter(index)}1`, name)).join('');
  const bodyRows = table.rows
    .map((row, rowIndex) => {
      const cells = table.columns
        .map((_, columnIndex) =>
          cellXml(`${columnIndexToLetter(columnIndex)}${rowIndex + 2}`, row[columnIndex] ?? null),
        )
        .join('');
      return `<row r="${rowIndex + 2}">${cells}</row>`;
    })
    .join('');

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData><row r="1">${headerRow}</row>${bodyRows}</sheetData></worksheet>`;

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRels);
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
