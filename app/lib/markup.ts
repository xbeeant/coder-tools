import { parseAllDocuments, parseDocument, stringify as stringifyYaml } from 'yaml';
import { type JsonType, jsonToXml, xmlToJson } from './json-convert';

export interface FormatIssue {
  message: string;
  line?: number;
  column?: number;
  /** 错误附近的原文行，便于定位。 */
  excerpt?: string;
}

export interface FormatOk<T> {
  ok: true;
  value: T;
  /** 解析成功但值得提醒的内容，例如重复键。 */
  warnings: FormatIssue[];
}

export interface FormatFail {
  ok: false;
  issues: FormatIssue[];
}

export type FormatResult<T> = FormatOk<T> | FormatFail;

/** 取第 line 行（1 起）的原文，用作错误定位提示。 */
export function sourceLine(text: string, line: number | undefined, radius = 0): string | undefined {
  if (!line || line < 1) return undefined;
  const lines = text.split(/\r?\n/);
  const picked: string[] = [];
  for (let index = Math.max(1, line - radius); index <= Math.min(lines.length, line + radius); index++) {
    const prefix = index === line ? '>' : ' ';
    picked.push(`${prefix} ${String(index).padStart(4, ' ')} | ${lines[index - 1] ?? ''}`);
  }
  return picked.join('\n');
}

// ────────────────────────────── YAML ──────────────────────────────

/** 解析 YAML 文本，错误信息带行号、列号与原文片段。 */
export function parseYamlSafe(text: string): FormatResult<unknown> {
  const document = parseDocument(text);
  const issues: FormatIssue[] = [];
  const warnings: FormatIssue[] = [];

  for (const error of document.errors) {
    const pos = error.linePos?.[0];
    issues.push({
      message: error.message,
      line: pos?.line,
      column: pos?.col,
      excerpt: sourceLine(text, pos?.line),
    });
  }
  for (const warning of document.warnings) {
    const pos = warning.linePos?.[0];
    warnings.push({
      message: warning.message,
      line: pos?.line,
      column: pos?.col,
      excerpt: sourceLine(text, pos?.line),
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  try {
    return { ok: true, value: document.toJS(), warnings };
  } catch (error) {
    return { ok: false, issues: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
}

/** 美化 YAML：解析成功后按指定缩进重新输出，注释与顺序尽量保留。 */
export function formatYaml(text: string, indent = 2, lineWidth = 100): FormatResult<string> {
  const document = parseDocument(text);
  const issues: FormatIssue[] = [];
  const warnings: FormatIssue[] = [];

  for (const error of document.errors) {
    const pos = error.linePos?.[0];
    issues.push({
      message: error.message,
      line: pos?.line,
      column: pos?.col,
      excerpt: sourceLine(text, pos?.line),
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  for (const warning of document.warnings) {
    const pos = warning.linePos?.[0];
    warnings.push({
      message: warning.message,
      line: pos?.line,
      column: pos?.col,
      excerpt: sourceLine(text, pos?.line),
    });
  }

  try {
    return { ok: true, value: document.toString({ indent, lineWidth }), warnings };
  } catch (error) {
    return { ok: false, issues: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
}

/** 压缩 YAML：输出流式单行写法，尽量短。 */
export function minifyYaml(text: string): FormatResult<string> {
  const parsed = parseYamlSafe(text);
  if (!parsed.ok) return parsed;
  try {
    return {
      ok: true,
      value: stringifyYaml(parsed.value, { collectionStyle: 'flow', lineWidth: 0 }),
      warnings: parsed.warnings,
    };
  } catch (error) {
    return { ok: false, issues: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
}

export interface YamlSummaryNode {
  /** 节点类型标签。 */
  type: JsonType | 'scalar';
  /** 对象键数量或数组长度。 */
  size: number;
  /** 子节点键名 / 下标，最多 8 个。 */
  children: string[];
  depth: number;
}

export interface YamlStructureSummary {
  rootType: string;
  keyCount: number;
  arrayLengths: { path: string; length: number }[];
  maxDepth: number;
  nodes: YamlSummaryNode[];
}

/** 解析 YAML 并输出结构摘要（根类型、键数、数组长度、嵌套深度）。 */
export function summarizeYaml(text: string): FormatResult<YamlStructureSummary> {
  const parsed = parseYamlSafe(text);
  if (!parsed.ok) return parsed;

  const nodes: YamlSummaryNode[] = [];
  const arrayLengths: { path: string; length: number }[] = [];
  let maxDepth = 0;
  let keyCount = 0;

  const describe = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    switch (typeof value) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'object';
    }
  };

  const walk = (value: unknown, path: string, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    if (Array.isArray(value)) {
      arrayLengths.push({ path: path || '$', length: value.length });
      nodes.push({
        type: 'array',
        size: value.length,
        children: value.slice(0, 8).map((_, index) => `[${index}]`),
        depth,
      });
      if (depth < 6) {
        value.forEach((item, index) => {
          walk(item, `${path}[${index}]`, depth + 1);
        });
      }
      return;
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (path === '') keyCount = entries.length;
      nodes.push({
        type: 'object',
        size: entries.length,
        children: entries.slice(0, 8).map(([key]) => key),
        depth,
      });
      if (depth < 6) {
        for (const [key, item] of entries) walk(item, path === '' ? key : `${path}.${key}`, depth + 1);
      }
      return;
    }
    nodes.push({ type: 'scalar', size: String(value ?? '').length, children: [], depth });
  };

  walk(parsed.value, '', 0);
  return {
    ok: true,
    value: { rootType: describe(parsed.value), keyCount, arrayLengths, maxDepth, nodes },
    warnings: parsed.warnings,
  };
}

export interface YamlSplitResult {
  ok: boolean;
  /** parseAllDocuments 报告的文档数量（手写切分负责保留原文）。 */
  documentCount: number;
  documents: { index: number; text: string; error: string | null }[];
}

/** 按 `---` 拆分多文档 YAML，并逐段校验（保留原始文本，便于直接查看）。 */
export function splitYamlDocuments(text: string): YamlSplitResult {
  const src = text.replace(/^\uFEFF/, '');
  if (src.trim() === '') return { ok: true, documentCount: 0, documents: [] };

  // 整体结构（分隔符位置等）交给 parseAllDocuments 判断。
  let documentCount = 0;
  let structuralError: string | null = null;
  try {
    documentCount = parseAllDocuments(src).length;
  } catch (error) {
    structuralError = error instanceof Error ? error.message : String(error);
  }

  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of src.split(/\r?\n/)) {
    if (/^---\s*$/.test(line)) {
      chunks.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  chunks.push(current.join('\n'));

  const documents = chunks
    .map((chunk, index) => ({ index, text: chunk.trim() }))
    .filter((item) => item.text !== '')
    .map((item) => {
      const parsed = parseYamlSafe(item.text);
      const error = parsed.ok ? structuralError : (parsed.issues[0]?.message ?? '解析失败');
      return { ...item, error };
    });

  return { ok: documents.every((item) => item.error === null), documentCount, documents };
}

// ────────────────────────────── XML ──────────────────────────────

const XML_DECLARATION = /^<\?xml[^>]*\?>/;

/**
 * 独立于 DOMParser 的标签配平检查。
 * 浏览器能报 parsererror，但部分精简 DOM 实现会静默恢复错误结构，
 * 这里按源码 token 自行配平，保证「缺结束标签」这类问题一定会被提示。
 */
const XML_LETTER =
  'A-Z_a-z\\u00C0-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const XML_NAME_RE = new RegExp(`^[${XML_LETTER}][\\w.:\\u00B7${XML_LETTER}-]*$`, 'u');

/** 找到标签的真正结束 `>`：跳过引号包裹的属性值，避免 t="a>b" 截断标签。 */
function findTagEnd(src: string, open: number): number {
  let index = open + 1;
  let quote: '"' | "'" | null = null;
  while (index < src.length) {
    const char = src[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
    index += 1;
  }
  return -1;
}

function checkTagBalance(src: string): FormatIssue | null {
  const stack: { name: string; line: number }[] = [];
  let index = 0;
  let line = 1;
  const len = src.length;
  const lineOf = (position: number): number => {
    let count = 1;
    for (let i = 0; i < position && i < len; i++) if (src[i] === '\n') count += 1;
    return count;
  };

  while (index < len) {
    const open = src.indexOf('<', index);
    if (open === -1) break;
    if (open > index && src[open - 1] === '\\') {
      index = open + 1;
      continue;
    }
    const close = findTagEnd(src, open);
    if (close === -1) return { message: 'XML 解析失败：存在未闭合的标签', line: lineOf(open) };

    const raw = src.slice(open + 1, close).trim();
    line = lineOf(open);

    if (raw.startsWith('!--')) {
      const end = src.indexOf('-->', close);
      if (end === -1) return { message: 'XML 解析失败：注释没有闭合', line };
      index = end + 3;
      continue;
    }
    if (raw.startsWith('!') || raw.startsWith('?')) {
      index = close + 1;
      continue;
    }
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      const top = stack.pop();
      if (top === undefined) return { message: `XML 解析失败：多余的结束标签 </${name}>`, line };
      if (top.name !== name) {
        return { message: `XML 解析失败：<${top.name}> 在第 ${top.line} 行开始，却由 </${name}> 结束`, line };
      }
      index = close + 1;
      continue;
    }

    const name = /^([^\s/>]+)/.exec(raw)?.[1] ?? '';
    const selfClosing = raw.endsWith('/');
    if (name !== '' && !XML_NAME_RE.test(name)) {
      return { message: `XML 解析失败：非法标签名 <${name}>，名称不能以数字或非法字符开头`, line };
    }
    if (name !== '' && !selfClosing) stack.push({ name, line });
    index = close + 1;
  }

  const top = stack[stack.length - 1];
  if (top) return { message: `XML 解析失败：<${top.name}> 在第 ${top.line} 行开始但没有结束标签`, line: top.line };
  return null;
}

/** 手写缩进美化：保持 CDATA、注释与属性顺序不变。 */
export function formatXml(text: string, indent = 2): FormatResult<string> {
  const src = text.replace(/^\uFEFF/, '');
  if (src.trim() === '') return { ok: false, issues: [{ message: 'XML 内容为空' }] };

  const unbalanced = checkTagBalance(src);
  if (unbalanced) return { ok: false, issues: [unbalanced] };

  const doc = new DOMParser().parseFromString(src, 'text/xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) {
    const raw = (failure.textContent ?? 'XML 结构不合法').trim().split('\n')[0] ?? 'XML 结构不合法';
    const line = Number(/line\s+(\d+)/i.exec(raw)?.[1] ?? '0');
    const column = Number(/column\s+(\d+)/i.exec(raw)?.[1] ?? '0');
    return {
      ok: false,
      issues: [
        {
          message: `XML 解析失败：${raw}`,
          line: line > 0 ? line : undefined,
          column: column > 0 ? column : undefined,
          excerpt: sourceLine(src, line > 0 ? line : undefined),
        },
      ],
    };
  }

  const root = doc.documentElement;
  if (!root) return { ok: false, issues: [{ message: 'XML 解析失败：没有找到根元素' }] };

  const lines: string[] = [];
  const declaration = src.match(XML_DECLARATION)?.[0];
  if (declaration) lines.push(declaration);

  const attrsToString = (element: Element): string =>
    Array.from(element.attributes)
      .map((attr) => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      .join('');

  const walk = (node: Node, depth: number): void => {
    const current = ' '.repeat(depth * indent);
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? '';
      if (text.trim() !== '') lines.push(`${current}${text.trim()}`);
      return;
    }
    if (node.nodeType === 4) {
      lines.push(`${current}<![CDATA[${node.nodeValue ?? ''}]]>`);
      return;
    }
    if (node.nodeType === 8) {
      lines.push(`${current}<!--${node.nodeValue ?? ''}-->`);
      return;
    }
    if (node.nodeType === 9) {
      for (const child of Array.from(node.childNodes)) walk(child, depth);
      return;
    }
    if (node.nodeType !== 1) return;

    const element = node as Element;
    const tag = element.tagName;
    const children = Array.from(element.childNodes);
    const hasElementChild = children.some((child) => child.nodeType === 1);

    if (children.length === 0) {
      lines.push(`${current}<${tag}${attrsToString(element)}/>`);
      return;
    }
    if (!hasElementChild) {
      // 纯文本或 CDATA 混排时保持单行，避免破坏混合内容。
      const inner = children
        .map((child) =>
          child.nodeType === 4
            ? `<![CDATA[${child.nodeValue ?? ''}]]>`
            : (child.nodeValue ?? '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        )
        .join('');
      lines.push(`${current}<${tag}${attrsToString(element)}>${inner}</${tag}>`);
      return;
    }

    lines.push(`${current}<${tag}${attrsToString(element)}>`);
    for (const child of children) {
      if (child.nodeType === 3 && (child.nodeValue ?? '').trim() === '') continue;
      walk(child, depth + 1);
    }
    lines.push(`${current}</${tag}>`);
  };

  walk(root, 0);
  return { ok: true, value: `${lines.join('\n')}\n`, warnings: [] };
}

/** 压缩 XML：保留声明与 CDATA，折叠标签之间的空白与自闭合写法。 */
export function minifyXml(text: string): FormatResult<string> {
  const src = text.replace(/^\uFEFF/, '');
  if (src.trim() === '') return { ok: false, issues: [{ message: 'XML 内容为空' }] };
  const unbalanced = checkTagBalance(src);
  if (unbalanced) return { ok: false, issues: [unbalanced] };
  const doc = new DOMParser().parseFromString(src, 'text/xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) {
    const raw = (failure.textContent ?? 'XML 结构不合法').trim().split('\n')[0] ?? 'XML 结构不合法';
    return { ok: false, issues: [{ message: `XML 解析失败：${raw}` }] };
  }
  // 压缩走源码级替换：linkedom 等精简 DOM 实现没有 XMLSerializer，避免运行时依赖缺失。
  const declaration = src.match(XML_DECLARATION)?.[0];
  const body = src
    .replace(XML_DECLARATION, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  let value = body
    .replace(/>\s+</g, '><')
    .replace(/\s*\/>\s*/g, '/>')
    .replace(/^\s+|\s+$/g, '');
  // 折叠属性之间的多余空白，但不动属性值内部；同时统一自闭合写法。
  value = value.replace(/<([^\s/>]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) =>
    attrs === '' ? `<${name}${slash}>` : `<${name}${attrs.replace(/\s+/g, ' ')}${slash}>`,
  );
  return { ok: true, value: declaration ? `${declaration}\n${value}` : value, warnings: [] };
}

export interface XmlStructureSummary {
  wellFormed: boolean;
  elementCount: number;
  attributeCount: number;
  maxDepth: number;
  rootName: string;
  namespaces: string[];
  tagFrequency: { name: string; count: number }[];
}

/** 校验 XML 并输出结构摘要：元素数、属性数、最大深度、命名空间、是否良构。 */
export function summarizeXml(text: string): FormatResult<XmlStructureSummary> {
  const src = text.replace(/^\uFEFF/, '');
  if (src.trim() === '') return { ok: false, issues: [{ message: 'XML 内容为空' }] };
  const unbalanced = checkTagBalance(src);
  if (unbalanced) return { ok: false, issues: [unbalanced] };
  const doc = new DOMParser().parseFromString(src, 'text/xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) {
    const raw = (failure.textContent ?? 'XML 结构不合法').trim().split('\n')[0] ?? 'XML 结构不合法';
    return { ok: false, issues: [{ message: `XML 校验未通过（不满足良构）：${raw}` }] };
  }

  const root = doc.documentElement;
  if (!root) return { ok: false, issues: [{ message: 'XML 校验未通过：没有找到根元素' }] };

  const namespaces = new Set<string>();
  const frequency = new Map<string, number>();
  let elementCount = 0;
  let attributeCount = 0;
  let maxDepth = 1;

  const walk = (element: Element, depth: number): void => {
    elementCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    frequency.set(element.localName, (frequency.get(element.localName) ?? 0) + 1);
    if (element.namespaceURI) namespaces.add(element.namespaceURI);
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
        namespaces.add(attr.value);
        continue;
      }
      attributeCount += 1;
    }
    for (const child of Array.from(element.children)) walk(child, depth + 1);
  };
  walk(root, 1);

  return {
    ok: true,
    value: {
      wellFormed: true,
      elementCount,
      attributeCount,
      maxDepth,
      rootName: root.tagName,
      namespaces: [...namespaces],
      tagFrequency: [...frequency.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 12),
    },
    warnings: [],
  };
}

// ─────────────────────── XML / YAML 互转 ───────────────────────

export interface CrossConvertOptions {
  indent?: number;
  lineWidth?: number;
  /** 是否去掉 XML 命名空间前缀，默认 true。 */
  stripNamespace?: boolean;
  /** 是否把纯数字 / true / false 文本推断成对应类型，默认 true。 */
  parseScalars?: boolean;
}

/** XML → YAML（复用 JSON 中间层，属性变成以 @ 开头的键）。 */
export function xmlToYaml(text: string, options: CrossConvertOptions = {}): FormatResult<string> {
  const { indent = 2, lineWidth = 100, stripNamespace = true, parseScalars = true } = options;
  try {
    const data = xmlToJson(text, { stripNamespace, parseScalars });
    return { ok: true, value: stringifyYaml(data, { indent, lineWidth }), warnings: [] };
  } catch (error) {
    return { ok: false, issues: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
}

/** YAML → XML。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把任意键名转成合法的 XML 元素名。 */
function sanitizeXmlTagName(name: string): string {
  const cleaned = name.trim().replace(/[^\w.\-:]/gu, '_');
  const safe = cleaned === '' || /^\d/u.test(cleaned) ? `_${cleaned}` : cleaned;
  return XML_NAME_RE.test(safe) ? safe : '_';
}

export function yamlToXml(
  text: string,
  options: CrossConvertOptions & { rootName?: string; declaration?: boolean; unwrapRootKey?: boolean } = {},
): FormatResult<string> {
  const { indent = 2, rootName = 'root', declaration = true, unwrapRootKey = true } = options;
  const parsed = parseYamlSafe(text);
  if (!parsed.ok) return parsed;
  try {
    let value = parsed.value;
    let name = sanitizeXmlTagName(rootName);
    // XML → YAML 的产物形如 `root:` + 子键，直接再包一层会出现 <root><root>…</root></root>。
    // 顶层只有一个键时用该键当根元素名，保证来回转换结构对称。
    if (unwrapRootKey && isPlainRecord(value)) {
      const entries = Object.entries(value);
      if (entries.length === 1) {
        const [key, inner] = entries[0] as [string, unknown];
        name = sanitizeXmlTagName(key);
        value = inner;
      }
    }
    return {
      ok: true,
      value: jsonToXml(value, name, { indent, declaration }),
      warnings: parsed.warnings,
    };
  } catch (error) {
    return { ok: false, issues: [{ message: error instanceof Error ? error.message : String(error) }] };
  }
}
