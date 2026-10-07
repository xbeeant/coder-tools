import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** JSON 值的六种类型标签。 */
export type JsonType = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

/** 推断任意 JSON 值的类型标签。 */
export function inferJsonType(value: unknown): JsonType {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'boolean') return 'boolean';
  if (type === 'number' || type === 'bigint') return 'number';
  if (type === 'string') return 'string';
  return 'object';
}

/** 推断数组元素的统一类型；类型不一致时返回 'mixed'。 */
export function inferArrayItemType(items: readonly unknown[]): JsonType | 'mixed' {
  if (items.length === 0) return 'null';
  const types = new Set<JsonType>(items.map((item) => inferJsonType(item)));
  if (types.size === 1) return [...types][0] as JsonType;
  // 数组里同时出现 null 与其它类型仍算“基本统一”，便于 UI 给出简要提示。
  const nonNull = [...types].filter((item) => item !== 'null');
  return nonNull.length === 1 && types.size === 2 ? (nonNull[0] as JsonType) : 'mixed';
}

/** 值的规模摘要，多个工具共用。 */
export interface JsonSummary {
  type: JsonType;
  /** object 时的键数量。 */
  keys: number;
  /** array 时的元素数量。 */
  items: number;
  /** 嵌套深度，标量记为 1。 */
  depth: number;
}

/** 统计值的基本规模：根类型、键数量、数组长度与最大嵌套深度。 */
export function summarizeJson(value: unknown): JsonSummary {
  const walk = (node: unknown, depth: number): number => {
    if (Array.isArray(node)) {
      let max = depth + 1;
      for (const item of node) max = Math.max(max, walk(item, depth + 1));
      return max;
    }
    if (node !== null && typeof node === 'object') {
      let max = depth + 1;
      for (const item of Object.values(node as Record<string, unknown>)) {
        max = Math.max(max, walk(item, depth + 1));
      }
      return max;
    }
    return depth;
  };
  return {
    type: inferJsonType(value),
    keys: value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0,
    items: Array.isArray(value) ? value.length : 0,
    depth: walk(value, 0),
  };
}

// ────────────────────────────── CSV ──────────────────────────────

const CSV_DELIMITERS = [',', ';', '\t'] as const;

export type CsvDelimiter = 'auto' | (typeof CSV_DELIMITERS)[number];

export interface JsonToCsvOptions {
  /** 是否输出表头，默认 true。 */
  header?: boolean;
  /** 是否输出 UTF-8 BOM（Excel 打开中文更稳），默认 false。 */
  bom?: boolean;
  /** 行尾符，默认 CRLF 以兼容 RFC 4180。 */
  lineEnding?: '\n' | '\r\n';
}

/** 单元格转文本：数字/布尔原样，null 与 undefined 为空串，嵌套结构序列化为紧凑 JSON。 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** RFC 4180：含分隔符、引号、CR 或 LF 时加引号，引号翻倍转义。 */
function quoteCsvCell(text: string, delimiter: string): string {
  if (text === '') return '';
  if (text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function renderCsv(rows: string[][], options: JsonToCsvOptions): string {
  const { bom = false, lineEnding = '\r\n' } = options;
  const body = rows.map((row) => row.map((cell) => quoteCsvCell(cell, ',')).join(',')).join(lineEnding);
  return `${bom ? '\uFEFF' : ''}${body}${body === '' ? '' : lineEnding}`;
}

/** 对象数组 → CSV：表头取所有对象键的并集（保持出现顺序），缺失值留空。 */
export function jsonToCsv(value: unknown, options: JsonToCsvOptions = {}): string {
  const { header = true } = options;

  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error('数组为空，没有可写出的记录，请先补上数据');
    const allObjects = value.every(isPlainObject);
    if (allObjects) {
      const columns: string[] = [];
      const seen = new Set<string>();
      for (const item of value) {
        for (const key of Object.keys(item)) {
          if (seen.has(key)) continue;
          seen.add(key);
          columns.push(key);
        }
      }
      const rows: string[][] = [];
      if (header) rows.push(columns);
      for (const item of value) {
        rows.push(columns.map((key) => csvCell(item[key])));
      }
      return renderCsv(rows, options);
    }
    // 元素不是对象（标量或数组）时退化为单列，嵌套结构序列化为 JSON 字符串。
    const rows: string[][] = [];
    if (header) rows.push(['value']);
    for (const item of value) rows.push([csvCell(item)]);
    return renderCsv(rows, options);
  }

  if (isPlainObject(value)) {
    const rows: string[][] = [];
    if (header) rows.push(['key', 'value']);
    for (const [key, item] of Object.entries(value)) rows.push([key, csvCell(item)]);
    return renderCsv(rows, options);
  }

  const rows: string[][] = [];
  if (header) rows.push(['value']);
  rows.push([csvCell(value)]);
  return renderCsv(rows, options);
}

/** 统计引号之外的候选分隔符出现次数，用于自动猜测。 */
function countOutsideQuotes(text: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) count++;
  }
  return count;
}

/** 自动猜测分隔符：在逗号、分号、制表符中取引号外出现次数最多者。 */
export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  let best: ',' | ';' | '\t' = ',';
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const count = countOutsideQuotes(sample, delimiter);
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

/** CSV 词法解析：支持引号内换行、双引号转义（""）、CRLF 与 LF 混用。 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quotedField = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
    quotedField = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      quotedField = true;
      i++;
      continue;
    }
    if (char === delimiter) {
      endField();
      i++;
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && src[i + 1] === '\n') i++;
      endRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field !== '' || quotedField || row.length > 0) endRow();
  return rows;
}

export interface CsvToJsonOptions {
  /** 分隔符，'auto' 表示自动猜测。 */
  delimiter?: CsvDelimiter;
  /** 是否把数字、布尔、null 自动识别为对应类型，默认 true。 */
  inferTypes?: boolean;
  /** 第一行是否作为表头，默认 true；否则使用「列1、列2…」作为键。 */
  header?: boolean;
  /** 是否去掉单元格首尾空白，默认 true。 */
  trim?: boolean;
  /** 空单元格是否还原成 null（与 jsonToCsv 的 null→空串对应），默认 true。 */
  emptyAsNull?: boolean;
}

function coerceCell(text: string, options: CsvToJsonOptions): unknown {
  if (text === '') return options.emptyAsNull ? null : '';
  if (options.inferTypes === false) return text;
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  if (/^null$/i.test(text)) return null;
  // 前导零（如 007、00123）保持字符串，避免编号被破坏。
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
  return text;
}

/** CSV → JSON（对象数组）。 */
export function csvToJson(text: string, options: CsvToJsonOptions = {}): unknown {
  const { delimiter = 'auto', header = true, trim = true, emptyAsNull = true } = options;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (src.trim() === '') return [];

  const separator = delimiter === 'auto' ? detectCsvDelimiter(src) : delimiter;
  const allRows = parseCsvRows(src, separator).filter((row) => !(row.length === 1 && (row[0] ?? '').trim() === ''));
  if (allRows.length === 0) return [];

  const normalize = (cell: string): string => (trim ? cell.trim() : cell);

  let columns: string[];
  let bodyRows: string[][];
  if (header) {
    const rawColumns = allRows[0].map(normalize);
    const used = new Map<string, number>();
    columns = rawColumns.map((name, index) => {
      const base = name === '' ? `列${index + 1}` : name;
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      return seen === 0 ? base : `${base}_${seen + 1}`;
    });
    bodyRows = allRows.slice(1);
  } else {
    const width = allRows.reduce((max, row) => Math.max(max, row.length), 0);
    columns = Array.from({ length: width }, (_, index) => `列${index + 1}`);
    bodyRows = allRows;
  }

  const cellOptions: CsvToJsonOptions = { inferTypes: options.inferTypes, emptyAsNull };
  return bodyRows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column] = coerceCell(normalize(row[index] ?? ''), cellOptions);
    });
    return record;
  });
}

// ────────────────────────────── XML ──────────────────────────────

const VALID_XML_TAG = /^[\p{L}_][\p{L}\p{N}_.-]*$/u;

/** 判断字符串能否直接作为 XML 标签名（保留 xml 前缀不算合法）。 */
export function isValidXmlTagName(name: string): boolean {
  return VALID_XML_TAG.test(name) && !/^xml/i.test(name);
}

/** 把任意键名转成可用的 XML 标签名：非法字符换下划线，数字开头补下划线。 */
export function sanitizeXmlTagName(name: string): string {
  let out = name.trim().replace(/[^\p{L}\p{N}_.-]/gu, '_');
  if (out === '') out = '_';
  if (!/^[\p{L}_]/u.test(out)) out = `_${out}`;
  if (/^xml/i.test(out)) out = `_${out}`;
  return out;
}

export interface XmlTagFix {
  path: string;
  key: string;
  tag: string;
}

/** 收集所有会被改写的标签名，供 UI 提前提示，避免静默丢信息。 */
export function findInvalidXmlTagKeys(value: unknown, rootName = 'root'): XmlTagFix[] {
  const fixes: XmlTagFix[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}[${index}]`);
      });
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, item] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      const tag = sanitizeXmlTagName(key);
      if (tag !== key) fixes.push({ path: path === '' ? key : `${path}.${key}`, key, tag });
      walk(item, `${path === '' ? '' : `${path}.`}${key}`);
    }
  };
  walk(value, '');
  if (!isValidXmlTagName(rootName)) {
    fixes.push({ path: '', key: rootName, tag: sanitizeXmlTagName(rootName) });
  }
  return fixes;
}

export type XmlArrayMode = 'repeat' | 'item';

export interface JsonToXmlOptions {
  /** 缩进空格数，默认 2。 */
  indent?: number;
  /** 是否输出 XML 声明，默认 true。 */
  declaration?: boolean;
  /** 数组的写法：repeat 用同名标签重复，item 用 <item> 包裹，默认 repeat。 */
  arrayMode?: XmlArrayMode;
  /** item 模式下的子元素名，默认 item。 */
  arrayItemName?: string;
  /** 根节点是数组时的容器名，默认 items。 */
  arrayRootName?: string;
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
}

function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function pushXmlElement(
  name: string,
  value: unknown,
  depth: number,
  out: string[],
  options: Required<JsonToXmlOptions>,
): void {
  const pad = ' '.repeat(depth * options.indent);

  if (value === null || value === undefined) {
    out.push(`${pad}<${name}/>`);
    return;
  }
  if (typeof value === 'string') {
    out.push(value === '' ? `${pad}<${name}></${name}>` : `${pad}<${name}>${escapeXmlText(value)}</${name}>`);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    out.push(`${pad}<${name}>${escapeXmlText(String(value))}</${name}>`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${pad}<${name}/>`);
      return;
    }
    if (options.arrayMode === 'item') {
      out.push(`${pad}<${name}>`);
      for (const item of value) pushXmlElement(options.arrayItemName, item, depth + 1, out, options);
      out.push(`${pad}</${name}>`);
      return;
    }
    for (const item of value) pushXmlElement(name, item, depth, out, options);
    return;
  }

  const attributes: string[] = [];
  const children: [string, unknown][] = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    // 以 @ 开头的键转成属性，与 xmlToJson 的 @attr 约定互逆。
    if (key.startsWith('@')) {
      const attr = sanitizeXmlTagName(key.slice(1));
      if (item !== null && item !== undefined) attributes.push(` ${attr}="${escapeXmlAttr(String(item))}"`);
      continue;
    }
    children.push([sanitizeXmlTagName(key), item]);
  }

  if (children.length === 0) {
    out.push(`${pad}<${name}${attributes.join('')}/>`);
    return;
  }
  out.push(`${pad}<${name}${attributes.join('')}>`);
  for (const [key, item] of children) pushXmlElement(key, item, depth + 1, out, options);
  out.push(`${pad}</${name}>`);
}

/** JSON → XML：键名即标签名，null 生成空元素，@ 前缀键生成属性。 */
export function jsonToXml(value: unknown, rootName = 'root', options: JsonToXmlOptions = {}): string {
  const resolved: Required<JsonToXmlOptions> = {
    indent: 2,
    declaration: true,
    arrayMode: 'repeat',
    arrayItemName: 'item',
    arrayRootName: 'items',
    ...options,
  };
  const lines: string[] = [];
  if (resolved.declaration) lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  if (Array.isArray(value)) {
    const root = sanitizeXmlTagName(resolved.arrayRootName);
    if (value.length === 0) {
      lines.push(`<${root}/>`);
    } else {
      lines.push(`<${root}>`);
      for (const item of value) pushXmlElement(resolved.arrayItemName, item, 1, lines, resolved);
      lines.push(`</${root}>`);
    }
  } else {
    pushXmlElement(sanitizeXmlTagName(rootName), value, 0, lines, resolved);
  }
  return `${lines.join('\n')}\n`;
}

export interface XmlToJsonOptions {
  /** 是否去掉命名空间前缀（默认 true，保留 localName）。 */
  stripNamespace?: boolean;
  /** 是否把纯数字/true/false 文本转成 number/boolean，默认 true。 */
  parseScalars?: boolean;
}

/** 解析 XML 文本，失败时抛出带行列信息的中文错误。 */
export function parseXmlDocument(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) {
    const raw = (failure.textContent ?? 'XML 结构不合法').trim().split('\n')[0] ?? 'XML 结构不合法';
    const line = /line\s+(\d+)/i.exec(raw)?.[1];
    const column = /column\s+(\d+)/i.exec(raw)?.[1];
    const position = line ? `（第 ${line} 行${column ? ` 第 ${column} 列` : ''}）` : '';
    throw new Error(`XML 解析失败${position}：${raw}`);
  }
  if (!doc.documentElement) throw new Error('XML 解析失败：没有找到根元素');
  return doc;
}

function nodeName(node: Element, strip: boolean): string {
  return strip ? node.localName : node.nodeName;
}

function coerceXmlScalar(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  return text;
}

function convertXmlElement(node: Element, options: Required<XmlToJsonOptions>): unknown {
  const { stripNamespace, parseScalars } = options;
  const attributes: Record<string, unknown> = {};
  for (const attr of Array.from(node.attributes)) {
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
    attributes[`@${stripNamespace ? attr.localName : attr.name}`] = attr.value;
  }

  const childElements: Element[] = [];
  const texts: string[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) childElements.push(child as Element);
    else if (child.nodeType === 3 || child.nodeType === 4) texts.push(child.nodeValue ?? '');
  }
  const meaningful = texts.filter((text) => text.trim() !== '');

  if (childElements.length > 0 && meaningful.length > 0) {
    throw new Error(
      `元素 <${node.nodeName}> 同时包含文本与子元素（混合内容），无法推断结构；请用 CDATA 包裹文本或拆成兄弟节点`,
    );
  }

  if (childElements.length === 0) {
    const text = meaningful.join('');
    if (Object.keys(attributes).length === 0) return parseScalars ? coerceXmlScalar(text) : text;
    if (meaningful.length > 0) return { ...attributes, '#text': text };
    return attributes;
  }

  const groups = new Map<string, Element[]>();
  for (const child of childElements) {
    const name = nodeName(child, stripNamespace);
    const bucket = groups.get(name);
    if (bucket) bucket.push(child);
    else groups.set(name, [child]);
  }

  const result: Record<string, unknown> = { ...attributes };
  for (const [name, nodes] of groups) {
    const values = nodes.map((child) => convertXmlElement(child, options));
    result[name] = values.length === 1 ? values[0] : values;
  }
  return result;
}

/** XML → JSON：同名兄弟合并成数组，属性放 @attr，混合文本放 #text。 */
export function xmlToJson(text: string, options: XmlToJsonOptions = {}): unknown {
  const resolved: Required<XmlToJsonOptions> = { stripNamespace: true, parseScalars: true, ...options };
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (src.trim() === '') throw new Error('XML 内容为空');
  const doc = parseXmlDocument(src);
  const root = doc.documentElement as Element;
  const converted = convertXmlElement(root, resolved);
  if (converted !== null && typeof converted === 'object' && !Array.isArray(converted)) return converted;
  return { [nodeName(root, resolved.stripNamespace)]: converted };
}

// ─────────────────────────── YAML / TOML ───────────────────────────

export interface YamlToStringOptions {
  /** 缩进空格数，默认 2。 */
  indent?: number;
  /** 行宽上限，默认 80；填 0 表示不换行。 */
  lineWidth?: number;
  /** 输出成紧凑的行内流式写法（用于“压缩 YAML”）。 */
  flow?: boolean;
}

/**
 * null / undefined 的处理方式：
 * - keep：原样保留 null（YAML、JSON 需要）
 * - empty：换成空字符串（TOML 没有 null 的常见折中）
 * - skip：对象里的键直接丢弃（TOML 的保守模式）
 */
type NullMode = 'keep' | 'empty' | 'skip';

const OMIT = Symbol('omit');

/** 把任意来源的值规整成可被 yaml/smol-toml 序列化的纯 JSON 结构。 */
function toPlainValue(value: unknown, nullMode: NullMode): unknown {
  if (value === null || value === undefined) {
    if (nullMode === 'keep') return null;
    if (nullMode === 'empty') return '';
    return OMIT;
  }
  if (Array.isArray(value)) {
    // 数组不能缺项：skip 模式在这里退化为空字符串。
    const arrayEmpty = nullMode === 'empty' || nullMode === 'skip';
    return value.map((item) => {
      const converted = toPlainValue(item, arrayEmpty ? 'empty' : nullMode);
      return converted === OMIT ? '' : converted;
    });
  }
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const converted = toPlainValue(item, nullMode);
      if (converted === OMIT) continue;
      out[key] = converted;
    }
    return out;
  }
  return String(value);
}

/** JSON → YAML：YAML 原生支持 null，保留原始语义。 */
export function jsonToYaml(value: unknown, options: YamlToStringOptions = {}): string {
  const { indent = 2, lineWidth = 80, flow = false } = options;
  try {
    return stringifyYaml(toPlainValue(value, 'keep'), { indent, lineWidth, collectionStyle: flow ? 'flow' : 'any' });
  } catch (error) {
    throw new Error(`YAML 生成失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** YAML → JSON。 */
export function yamlToJson(text: string): unknown {
  try {
    return toPlainValue(parseYaml(text), 'keep') ?? null;
  } catch (error) {
    throw new Error(`YAML 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export type TomlNullMode = 'empty' | 'skip';

export interface TomlOptions {
  /**
   * TOML 没有 null：
   * - empty（默认）：所有 null 变成空字符串；
   * - skip：对象里的 null 键被丢弃，数组里的 null 变成空字符串。
   */
  nullAs?: TomlNullMode;
}

/** 统计 JSON → TOML 过程中会丢失信息的 null 数量，供 UI 提示。 */
export function countTomlNulls(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countTomlNulls(item), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce<number>((sum, item) => sum + countTomlNulls(item), 0);
  }
  return value === null ? 1 : 0;
}

/** JSON → TOML：根节点必须是对象（表）。 */
export function jsonToToml(value: unknown, options: TomlOptions = {}): string {
  const { nullAs = 'empty' } = options;
  if (Array.isArray(value)) {
    throw new Error('TOML 的根节点必须是表（对象），请把数组包进一个键，例如 { rows: [...] }');
  }
  if (!isPlainObject(value)) throw new Error('TOML 的根节点必须是表（对象）');
  try {
    return stringifyToml(toPlainValue(value, nullAs === 'empty' ? 'empty' : 'skip'));
  } catch (error) {
    throw new Error(`TOML 生成失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** TOML → JSON。 */
export function tomlToJson(text: string): unknown {
  try {
    return toPlainValue(parseToml(text), 'keep') ?? {};
  } catch (error) {
    throw new Error(`TOML 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─────────────────────────── 批量与格式嗅探 ───────────────────────────

export type DataFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'toml';

export const DATA_FORMATS: { value: DataFormat; label: string; ext: string; mime: string }[] = [
  { value: 'json', label: 'JSON', ext: 'json', mime: 'application/json;charset=utf-8' },
  { value: 'csv', label: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  { value: 'xml', label: 'XML', ext: 'xml', mime: 'application/xml;charset=utf-8' },
  { value: 'yaml', label: 'YAML', ext: 'yaml', mime: 'application/yaml;charset=utf-8' },
  { value: 'toml', label: 'TOML', ext: 'toml', mime: 'application/toml;charset=utf-8' },
];

/** 猜测文本的格式，用于「自动嗅探」。 */
export function sniffFormat(text: string): DataFormat | 'unknown' {
  const src = text.replace(/^\uFEFF/, '').trim();
  if (src === '') return 'unknown';
  if (src.startsWith('<?xml') || /^<[A-Za-z_][^>]*>/.test(src)) return 'xml';
  if (/^\s*[{[]/.test(src)) return 'json';
  if (/^[[\w.\-"' ]+\s*=\s*(?:"[^"]*"|'[^']*'|\[[^\]]*\]|\{[^}]*\}|[^\n#]+)/m.test(src) && !src.includes(': ')) {
    return 'toml';
  }
  if (src.includes('\t') || src.includes(': ') || /^\s*-\s/m.test(src)) return 'yaml';
  return 'csv';
}

/** 按 `---` 或空行切分多段文档，用于批量转换。 */
export function splitDocuments(text: string): string[] {
  const src = text.replace(/^\uFEFF/, '');
  const lines = src.split(/\r?\n/);
  const hasSeparator = lines.some((line) => line.trim() === '---');
  const docs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined !== '') docs.push(joined);
    current = [];
  };
  for (const line of lines) {
    if (hasSeparator && line.trim() === '---') {
      flush();
      continue;
    }
    current.push(line);
  }
  if (!hasSeparator) {
    // 没有 --- 时按空行分段，单段文档不受影响。
    return src
      .split(/\r?\n\s*\r?\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk !== '');
  }
  flush();
  return docs;
}
