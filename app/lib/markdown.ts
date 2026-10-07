import DOMPurify, { type Config } from 'dompurify';
import { marked } from 'marked';

// ────────────────────────────── Markdown → HTML ──────────────────────────────

export interface MarkdownOptions {
  /** 开启 GFM（表格、删除线、任务列表、自动链接），默认 true。 */
  gfm?: boolean;
  /** 单个换行是否渲染成 <br>，默认 false。 */
  breaks?: boolean;
  /** 是否给标题补锚点 id（目录链接依赖它），默认 true。 */
  headingAnchors?: boolean;
}

const PURIFY_CONFIG: Config = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta'],
  // style 也会被剔除，这样内联样式不会与风险扫描的结果相互矛盾。
  FORBID_ATTR: ['formaction', 'srcdoc', 'ping', 'http-equiv', 'style'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: true,
  // 只要普通字符串，方便后续 React 直接渲染。
  RETURN_TRUSTED_TYPE: false,
  // 只放行明确的协议，其余（javascript:、vbscript:、data:text/html 等）一律丢弃。
  ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

export interface SecurityFinding {
  /** 风险类别，例如 script 标签、事件属性。 */
  kind: string;
  label: string;
  count: number;
  samples: string[];
}

export interface MarkdownRenderReport {
  html: string;
  /** DOMPurify 判定并移除的节点 / 属性数量。 */
  removedNodes: number;
  removedAttributes: number;
  findings: SecurityFinding[];
  /** 净化不可用或自检未通过时，整段 HTML 已被转义为纯文本。 */
  escaped: boolean;
}

const RISK_PATTERNS: { kind: string; label: string; regex: RegExp }[] = [
  { kind: 'script', label: 'script 标签', regex: /<\s*script\b/gi },
  { kind: 'iframe', label: 'iframe / object / embed', regex: /<\s*(iframe|object|embed|applet)\b/gi },
  { kind: 'style', label: 'style 标签或内联样式', regex: /(<\s*style\b)|(\bstyle\s*=\s*["'])/gi },
  { kind: 'event', label: 'on* 事件属性', regex: /\son[a-z]+\s*=\s*["'][^"']*["']/gi },
  { kind: 'javascript-url', label: 'javascript: / vbscript: 链接', regex: /(javascript|vbscript)\s*:/gi },
  { kind: 'data-html', label: 'data:text/html 内联页面', regex: /data\s*:\s*text\/html/gi },
  { kind: 'srcdoc', label: 'srcdoc 内联文档', regex: /\bsrcdoc\s*=/gi },
  { kind: 'form', label: '表单与提交控件', regex: /<\s*(form|input|button|textarea|select)\b/gi },
];

/** 扫描原始 HTML 中可能被清理掉的危险写法，给出可读报告。 */
export function scanRiskyMarkup(html: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const item of RISK_PATTERNS) {
    const matches = html.match(item.regex);
    if (!matches || matches.length === 0) continue;
    const samples = [...new Set(matches.map((text) => text.trim().slice(0, 40)))].slice(0, 3);
    findings.push({ kind: item.kind, label: item.label, count: matches.length, samples });
  }
  return findings;
}

/**
 * 净化结果的自检：DOMPurify 在缺少完整 DOM 实现时会退化为不净化，
 * 这里再扫一遍危险痕迹，一旦命中就整体转义，宁可显示源码也不渲染危险内容。
 */
const SURVIVING_RISKS: { kind: string; label: string; regex: RegExp }[] = [
  { kind: 'script', label: 'script 标签', regex: /<\s*script\b/i },
  { kind: 'iframe', label: 'iframe 等嵌入标签', regex: /<\s*(iframe|object|embed|applet|frame)\b/i },
  { kind: 'style', label: 'style 标签或内联样式', regex: /(<\s*style\b)|(\bstyle\s*=\s*["'])/i },
  { kind: 'event', label: 'on* 事件属性', regex: /\son[a-z]+\s*=/i },
  { kind: 'javascript-url', label: 'javascript: / vbscript: 链接', regex: /(javascript|vbscript)\s*:/i },
  { kind: 'data-html', label: 'data:text/html 内联页面', regex: /data\s*:\s*text\/html/i },
  { kind: 'form', label: '表单控件', regex: /<\s*(form|input|button|textarea|select)\b/i },
];

/** 返回净化后仍然存在的风险项；为空数组表示可以安全渲染。 */
export function survivingRisks(html: string): SecurityFinding[] {
  return SURVIVING_RISKS.filter((item) => item.regex.test(html)).map((item) => ({
    kind: item.kind,
    label: item.label,
    count: 1,
    samples: [item.label],
  }));
}

/** DOMPurify 不可用时的兜底：把整段 HTML 当作文本转义。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 净化 + 自检；命中残留风险时整体转义，保证不会渲染出可执行内容。 */
function purifyOrEscape(raw: string): { html: string; escaped: boolean } {
  let clean = '';
  try {
    clean = DOMPurify.sanitize(raw, PURIFY_CONFIG);
  } catch {
    clean = '';
  }
  if (clean === '' || survivingRisks(clean).length > 0) {
    return { html: escapeHtml(raw), escaped: true };
  }
  return { html: clean, escaped: false };
}

function addHeadingAnchors(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const used = new Map<string, number>();
  for (const heading of Array.from(doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    const text = heading.textContent ?? '';
    const base = slugifyHeading(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;
    heading.setAttribute('id', id);
    if (heading.querySelector('a[aria-hidden]')) continue;
    const anchor = doc.createElement('a');
    anchor.setAttribute('href', `#${id}`);
    anchor.setAttribute('aria-hidden', 'true');
    anchor.textContent = '#';
    anchor.className = 'ml-1 opacity-50 no-underline';
    heading.appendChild(anchor);
  }
  return doc.body.innerHTML;
}

/** Markdown → 已净化的 HTML 字符串。 */
export function renderMarkdown(md: string, options: MarkdownOptions = {}): string {
  const { gfm = true, breaks = false, headingAnchors = true } = options;
  const raw = marked(md, { gfm, breaks, async: false });
  const { html } = purifyOrEscape(raw);
  return headingAnchors ? addHeadingAnchors(html) : html;
}

/** Markdown → HTML，同时返回安全检查报告。 */
export function renderMarkdownReport(md: string, options: MarkdownOptions = {}): MarkdownRenderReport {
  const { gfm = true, breaks = false, headingAnchors = true } = options;
  const raw = marked(md, { gfm, breaks, async: false });
  const { html, escaped } = purifyOrEscape(raw);
  const findings = scanRiskyMarkup(raw);
  let removedNodes = escaped ? findings.length : 0;
  let removedAttributes = 0;
  try {
    for (const item of DOMPurify.removed ?? []) {
      if ('attribute' in item) removedAttributes += 1;
      else removedNodes += 1;
    }
  } catch {
    // ignore
  }
  return {
    html: headingAnchors ? addHeadingAnchors(html) : html,
    removedNodes,
    removedAttributes,
    findings,
    escaped,
  };
}

// ────────────────────────────── 目录 ──────────────────────────────

export interface TocHeading {
  level: number;
  text: string;
  slug: string;
}

/** GitHub 风格 slug：小写、去标点、空格转连字符、保留中文。 */
export function slugifyHeading(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
  return base === '' ? 'section' : base;
}

/** 去掉标题里的行内 Markdown 记号，只留纯文本。 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/** 解析 Markdown 标题，跳过代码块与围栏代码里的 `#`。 */
export function extractHeadings(md: string): TocHeading[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const headings: TocHeading[] = [];
  const used = new Map<string, number>();
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1] as string;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker.charAt(0);
      } else if (marker.charAt(0) === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) continue;
    const level = (match[1] as string).length;
    const text = stripInlineMarkdown(match[2] as string);
    if (text === '') continue;
    const base = slugifyHeading(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    headings.push({ level, text, slug: seen === 0 ? base : `${base}-${seen}` });
  }
  return headings;
}

/** 生成带锚点的目录（Markdown 源码形式，可直接贴回文档）。 */
export function renderTocMarkdown(md: string): string {
  const headings = extractHeadings(md);
  if (headings.length === 0) return '';
  const minLevel = Math.min(...headings.map((item) => item.level));
  return headings
    .map((item) => {
      const indent = '  '.repeat(Math.max(0, item.level - minLevel));
      return `${indent}- [${item.text}](#${item.slug})`;
    })
    .join('\n');
}

// ────────────────────────────── 清洗 ──────────────────────────────

export interface CleanOptions {
  /** 剔除所有图片。 */
  stripImages?: boolean;
  /** 剔除外链（只保留站内相对地址与锚点）。 */
  stripExternalLinks?: boolean;
  /** 把相对地址转成绝对地址。 */
  absoluteUrls?: boolean;
  /** 相对地址转换时的基准，默认当前页面。 */
  baseUrl?: string;
  /** 给图片加 loading="lazy"。 */
  lazyImages?: boolean;
  /** 给外链补 rel="noopener noreferrer"。 */
  hardenExternalLinks?: boolean;
}

export interface CleanReport {
  html: string;
  removedImages: number;
  removedLinks: number;
  absolutizedUrls: number;
}

function isExternal(href: string): boolean {
  return /^(https?:)?\/\//i.test(href);
}

/** 当前页面地址，作为相对 URL 绝对化的兜底基准；非浏览器环境返回 undefined。 */
function defaultBaseUrl(): string | undefined {
  try {
    return typeof window === 'undefined' ? undefined : (window.location?.href as string | undefined);
  } catch {
    return undefined;
  }
}

/** 对已净化的 HTML 做结构清洗：剔图、剔外链、绝对化地址、懒加载。 */
export function cleanHtml(html: string, options: CleanOptions = {}): CleanReport {
  const {
    stripImages = false,
    stripExternalLinks = false,
    absoluteUrls = false,
    baseUrl,
    lazyImages = false,
    hardenExternalLinks = false,
  } = options;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 未显式给基准地址时退回当前页面地址，保证相对 URL 绝对化真的生效。
  const base = baseUrl ?? defaultBaseUrl();
  let removedImages = 0;
  let removedLinks = 0;
  let absolutizedUrls = 0;

  if (stripImages) {
    for (const image of Array.from(doc.body.querySelectorAll('img'))) {
      image.remove();
      removedImages += 1;
    }
  } else {
    for (const image of Array.from(doc.body.querySelectorAll('img'))) {
      if (lazyImages && !image.hasAttribute('loading')) image.setAttribute('loading', 'lazy');
      if (absoluteUrls) {
        const src = image.getAttribute('src');
        if (src && !/^(data:|https?:|\/\/)/i.test(src)) {
          try {
            image.setAttribute('src', new URL(src, base).toString());
            absolutizedUrls += 1;
          } catch {
            // 非法地址保持原样。
          }
        }
      }
    }
  }

  for (const anchor of Array.from(doc.body.querySelectorAll('a'))) {
    const href = anchor.getAttribute('href') ?? '';
    if (stripExternalLinks && isExternal(href)) {
      anchor.removeAttribute('href');
      removedLinks += 1;
      continue;
    }
    if (hardenExternalLinks && isExternal(href)) anchor.setAttribute('rel', 'noopener noreferrer');
    if (absoluteUrls && href !== '' && !/^(data:|mailto:|tel:|#|https?:|\/\/)/i.test(href)) {
      try {
        anchor.setAttribute('href', new URL(href, base).toString());
        absolutizedUrls += 1;
      } catch {
        // 非法地址保持原样。
      }
    }
  }

  return { html: doc.body.innerHTML, removedImages, removedLinks, absolutizedUrls };
}

// ────────────────────────────── HTML → Markdown ──────────────────────────────

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'NAV',
  'FIGURE',
  'FORM',
  'FIELDSET',
]);

function htmlEscapeText(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

function collapse(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/** HTML → Markdown（覆盖标题、段落、粗斜体、代码、列表、链接、图片、表格、引用）。 */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('script, style, noscript').forEach((node) => {
    node.remove();
  });
  // 丢掉渲染时自动补的标题锚点，避免变成「# 标题#」这种脏文本。
  for (const anchor of Array.from(doc.body.querySelectorAll('a[aria-hidden="true"]'))) {
    if (anchor.textContent === '#') anchor.remove();
  }

  const render = (node: Node, listDepth: number): string => {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? '';
      if (!text.trim()) return listDepth > 0 ? '' : '\n';
      return htmlEscapeText(text);
    }
    if (node.nodeType !== 1) return '';
    const element = node as Element;
    const tag = element.tagName;

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return '';
    if (tag === 'BR') return '  \n';
    if (tag === 'HR') return '\n\n---\n\n';
    if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
      const level = Number(tag.slice(1));
      const text = collapse(element.textContent ?? '');
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    }
    if (tag === 'STRONG' || tag === 'B') return `**${collapse(element.textContent ?? '')}**`;
    if (tag === 'EM' || tag === 'I') return `*${collapse(element.textContent ?? '')}*`;
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return `~~${collapse(element.textContent ?? '')}~~`;
    if (tag === 'CODE' && element.parentElement?.tagName !== 'PRE') {
      return `\`${(element.textContent ?? '').replace(/`/g, '\\`')}\``;
    }
    if (tag === 'PRE') {
      const code = element.querySelector('code');
      const language = /language-([\w+-]+)/.exec(code?.className ?? '')?.[1] ?? '';
      const body = (code?.textContent ?? element.textContent ?? '').replace(/\n$/, '');
      return `\n\n\`\`\`${language}\n${body}\n\`\`\`\n\n`;
    }
    if (tag === 'A') {
      const href = element.getAttribute('href') ?? '';
      const text = collapse(element.textContent ?? '');
      if (href === '') return text;
      if (href.startsWith('#')) return `[${text}](${href})`;
      const title = element.getAttribute('title');
      return `[${text}](${href}${title ? ` "${title}"` : ''})`;
    }
    if (tag === 'IMG') {
      const src = element.getAttribute('src') ?? '';
      const alt = element.getAttribute('alt') ?? '';
      const title = element.getAttribute('title');
      return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
    }
    if (tag === 'BLOCKQUOTE') {
      const inner = Array.from(element.childNodes)
        .map((child) => render(child, 0))
        .join('')
        .trim();
      return `\n\n${inner
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n')}\n\n`;
    }
    if (tag === 'UL' || tag === 'OL') {
      const ordered = tag === 'OL';
      let counter = Number(element.getAttribute('start') ?? '1');
      const items = Array.from(element.children)
        .filter((child) => child.tagName === 'LI')
        .map((child) => {
          const marker = ordered ? `${counter++}.` : '-';
          const nested = Array.from(child.childNodes)
            .filter((node) => {
              if (node.nodeType !== 1) return true;
              const tag = (node as Element).tagName;
              return tag !== 'UL' && tag !== 'OL';
            })
            .map((node) => render(node, listDepth + 1))
            .join('')
            .trim();
          const indent = '  '.repeat(listDepth);
          const lines = nested.split('\n');
          const head = `${indent}${marker} ${lines[0] ?? ''}`;
          const rest = lines.slice(1).map((line) => (line === '' ? '' : `${indent}  ${line}`));
          const childLists = Array.from(child.children)
            .filter((node) => node.tagName === 'UL' || node.tagName === 'OL')
            .map((node) => render(node, listDepth + 1));
          return [head, ...rest, ...childLists.map((line) => line.replace(/\n/g, '\n'))].join('\n');
        });
      return `\n${items.join('\n')}\n`;
    }
    if (tag === 'TABLE') {
      const rows = Array.from(element.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const cellsOf = (row: Element): string[] =>
        Array.from(row.children)
          .filter((child) => child.tagName === 'TH' || child.tagName === 'TD')
          .map((child) => collapse(child.textContent ?? '').replace(/\|/g, '\\|'));
      const header = cellsOf(rows[0] as Element);
      const body = rows.slice(1).map(cellsOf);
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...body.map((row) => `| ${row.join(' | ')} |`),
      ];
      return `\n\n${lines.join('\n')}\n\n`;
    }
    if (tag === 'INPUT') {
      const input = element as HTMLInputElement;
      if (input.type === 'checkbox') {
        const parent = collapse(element.closest('li')?.textContent ?? '');
        return input.checked ? `[x] ${parent}` : `[ ] ${parent}`;
      }
      return '';
    }

    const inner = Array.from(element.childNodes)
      .map((child) => render(child, listDepth))
      .join('');
    if (BLOCK_TAGS.has(tag)) return `\n\n${inner.trim()}\n\n`;
    return inner;
  };

  return render(doc.body, 0)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ────────────────────────────── 统计 ──────────────────────────────

export interface MarkdownStats {
  chars: number;
  words: number;
  lines: number;
  headings: number;
  links: number;
  images: number;
  codeBlocks: number;
  /** 最常见的单词（含中文按字计）。 */
  topWords: { word: string; count: number }[];
}

/** 统计 Markdown 的字数、行数、标题、链接、图片与代码块数量。 */
export function analyzeMarkdown(md: string): MarkdownStats {
  const lines = md === '' ? 0 : md.split(/\r?\n/).length;
  const chars = [...md].length;
  const cjk = md.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const latinWords = (md.toLowerCase().match(/[a-z][a-z0-9_+-]*/g) ?? []).filter(
    (word) => !/^(https?|ftp|mailto|tel)$/.test(word),
  );
  const frequency = new Map<string, number>();
  for (const word of latinWords) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  for (const char of md) {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) {
      frequency.set(char, (frequency.get(char) ?? 0) + 1);
    }
  }

  return {
    chars,
    words: cjk + latinWords.length,
    lines,
    headings: extractHeadings(md).length,
    links: (md.match(/(?<!!)\[[^\]]*\]\([^)]*\)/g) ?? []).length,
    images: (md.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
    codeBlocks: (md.match(/^\s*(`{3,}|~{3,})/gm) ?? []).length / 2,
    topWords: [...frequency.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
      .slice(0, 8),
  };
}
