/** URL 结构解析、查询参数处理、编码联动与规范化，全部为纯函数。 */

import { parseIpv4 } from './ipv4';

/** 常见协议的默认端口。 */
export const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
  'ws:': '80',
  'wss:': '443',
  'ftp:': '21',
  'ftps:': '990',
  'ssh:': '22',
  'telnet:': '23',
  'smtp:': '25',
  'gopher:': '70',
  'nntp:': '119',
  'ldap:': '389',
};

/** WHATWG 规范中的特殊 scheme：解析时会自动补全端口、规范化路径。 */
export const SPECIAL_SCHEMES = ['http:', 'https:', 'ws:', 'wss:', 'ftp:', 'file:'];

/** 内置常见短链域名片段，用于可疑跳转提示。 */
export const SHORTENER_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'bit.do',
  'url.cn',
  't.cn',
  'dwz.cn',
  'suo.im',
  'sina.lt',
  'rb.gy',
  'tiny.cc',
  'cutt.ly',
  'shorturl.at',
  'v.gd',
  'qr.ae',
  'soo.gd',
  'mzl.la',
  'shorte.st',
  'rebrand.ly',
  'linktr.ee',
  'w.cn',
  'xhslink.com',
  'mrw.so',
];

export interface QueryParam {
  /** 解码后的键。 */
  key: string;
  /** 解码后的值。 */
  value: string;
  /** 原始（未解码）键值对文本。 */
  raw: string;
  /** 该键在本次解析中出现的次数，从 1 开始。 */
  index: number;
}

export type UrlSegmentKind = 'scheme' | 'userinfo' | 'host' | 'port' | 'path' | 'query' | 'hash' | 'text';

export interface UrlSegment {
  /** 段在拆分结果中的稳定序号，供 React key 使用。 */
  id: number;
  kind: UrlSegmentKind;
  text: string;
  label: string;
}

export interface ParsedUrl {
  ok: true;
  url: URL;
  scheme: string;
  schemeWithColon: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  defaultPort: string | null;
  isDefaultPort: boolean;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  href: string;
  isAbsolute: boolean;
  isSpecialScheme: boolean;
  hasUserInfo: boolean;
  params: QueryParam[];
  /** 出现多次的键名列表。 */
  duplicateKeys: string[];
  pathSegments: string[];
  /** 原始输入是否为相对 URL（需要 base 才能解析）。 */
  needsBase: boolean;
}

export interface ParseUrlError {
  ok: false;
  error: string;
}

/** 安全解码：非法百分号序列不抛异常。 */
export function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 是否为相对 URL（没有 scheme 或没有 // 前缀）。 */
export function looksRelative(input: string): boolean {
  const text = input.trim();
  if (!text) return true;
  if (text.startsWith('//')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(text);
}

/** 解析 URL，base 可选（用于相对 URL）。 */
export function parseUrl(input: string, base?: string): ParsedUrl | ParseUrlError {
  const text = input.trim();
  if (!text) return { ok: false, error: '请输入 URL' };
  let url: URL;
  try {
    url = base ? new URL(text, base) : new URL(text);
  } catch (error) {
    if (base) return { ok: false, error: '相对 URL 解析失败，请检查 base 是否为绝对地址' };
    const message = error instanceof Error ? error.message : String(error);
    if (/Invalid scheme/i.test(message)) return { ok: false, error: '缺少协议，需形如 https://example.com/a?b=1' };
    if (/Invalid URL/i.test(message)) return { ok: false, error: '不是合法的 URL（可能是非法字符或缺少主机名）' };
    return { ok: false, error: message };
  }

  const schemeWithColon = `${url.protocol}`;
  const defaultPort = DEFAULT_PORTS[schemeWithColon] ?? null;
  const hasUserInfo = url.username.length > 0 || url.password.length > 0;
  const params = queryParams(url.search);
  const duplicateKeys = [...new Set(params.filter((item) => item.index > 1).map((item) => item.key))];
  const pathSegments = url.pathname.split('/').filter(Boolean);

  return {
    ok: true,
    url,
    scheme: url.protocol.replace(/:$/, ''),
    schemeWithColon,
    username: url.username,
    password: url.password,
    hostname: url.hostname,
    port: url.port,
    defaultPort,
    isDefaultPort: defaultPort !== null && url.port === defaultPort,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    href: url.href,
    isAbsolute: !looksRelative(text),
    isSpecialScheme: SPECIAL_SCHEMES.includes(schemeWithColon),
    hasUserInfo,
    params,
    duplicateKeys,
    pathSegments,
    needsBase: looksRelative(text),
  };
}

/** 解析查询串为参数数组（保留重复键，index 记录出现次数）。 */
export function queryParams(search: string): QueryParam[] {
  const text = search.replace(/^\?/, '');
  if (!text) return [];
  const seen = new Map<string, number>();
  return text.split('&').map((pair) => {
    if (pair === '') return { key: '', value: '', raw: '', index: 1 };
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : '';
    const key = decodeSafe(rawKey.replace(/\+/g, ' '));
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return { key, value: decodeSafe(rawValue.replace(/\+/g, ' ')), raw: pair, index: count };
  });
}

/** 由参数数组重建查询串；重复键保留为多条。 */
export function buildSearch(params: { key: string; value: string }[]): string {
  if (params.length === 0) return '';
  const text = params
    .map((item) => {
      const key = encodeURIComponent(item.key);
      return item.value === '' ? key : `${key}=${encodeURIComponent(item.value)}`;
    })
    .join('&');
  return `?${text}`;
}

/** 把 URL 拆成着色片段，用于逐段高亮展示。 */
export function splitUrl(url: ParsedUrl): UrlSegment[] {
  const segments: UrlSegment[] = [];
  const push = (kind: UrlSegmentKind, text: string, label: string) => {
    segments.push({ id: segments.length, kind, text, label });
  };
  const hasAuthority = url.isSpecialScheme || url.url.host !== '';
  push('scheme', url.schemeWithColon, '协议');
  if (hasAuthority) {
    push('text', '//', '分隔符');
    if (url.hasUserInfo) {
      const userinfo = url.password ? `${url.username}:${url.password}` : url.username;
      push('userinfo', `${userinfo}@`, '用户信息');
    }
    push('host', url.hostname, '主机名');
    if (url.port) {
      push('port', `:${url.port}`, url.isDefaultPort ? '默认端口' : '端口');
    }
  }
  if (url.pathname === '/') push('path', '/', '根路径');
  else if (url.pathname) push('path', url.pathname, '路径');
  if (url.search) push('query', url.search, '查询参数');
  if (url.hash) push('hash', url.hash, '片段');
  return segments;
}

export interface UnencodedChar {
  char: string;
  /** 在输入中的字符下标。 */
  index: number;
  reason: string;
}

/** 检查文本中未做百分号编码的可疑字符。 */
export function detectUnencodedChars(text: string): UnencodedChar[] {
  const result: UnencodedChar[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    const code = char.codePointAt(0) ?? 0;
    if (char === ' ') result.push({ char, index: i, reason: '空格应编码为 %20' });
    else if (char === '"') result.push({ char, index: i, reason: '双引号应编码为 %22' });
    else if (char === '<' || char === '>') result.push({ char, index: i, reason: '尖括号应编码为 %3C / %3E' });
    else if (char === '\\' || char === '^' || char === '`' || char === '{' || char === '}' || char === '|')
      result.push({ char, index: i, reason: '不应出现在 URL 中' });
    else if (code > 0x7e) result.push({ char, index: i, reason: '非 ASCII 字符，应逐字节编码为 UTF-8' });
    if (result.length > 40) break;
  }
  return result;
}

/** 百分号编码：URI / 组件 / 严格全转义 / 表单式（空格转 +）。 */
export function percentEncode(text: string, style: 'uri' | 'component' | 'strict' | 'form'): string {
  if (style === 'uri') return encodeURI(text);
  if (style === 'component') return encodeURIComponent(text);
  const strict = encodeURIComponent(text).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return style === 'form' ? strict.replace(/%20/g, '+') : strict;
}

export interface NormalizeOptions {
  lowercaseScheme: boolean;
  lowercaseHost: boolean;
  removeDefaultPort: boolean;
  sortParams: boolean;
  dedupeParams: boolean;
  removeHash: boolean;
  removeTrailingSlash: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  lowercaseScheme: true,
  lowercaseHost: true,
  removeDefaultPort: true,
  sortParams: true,
  dedupeParams: false,
  removeHash: true,
  removeTrailingSlash: true,
};

export interface NormalizeResult {
  url: string;
  changes: string[];
}

/** 规范化 URL，并给出逐项改动说明。 */
export function normalizeUrl(input: string, options: Partial<NormalizeOptions> = {}): NormalizeResult | ParseUrlError {
  const parsed = parseUrl(input);
  if (!parsed.ok) return parsed;
  const opts = { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
  const url = new URL(parsed.url.href);
  const changes: string[] = [];

  if (opts.lowercaseScheme && url.protocol !== url.protocol.toLowerCase()) {
    changes.push(`协议改为小写：${url.protocol}`);
    url.protocol = url.protocol.toLowerCase();
  }
  if (opts.lowercaseHost && url.hostname !== url.hostname.toLowerCase()) {
    changes.push(`主机名改为小写：${url.hostname}`);
    url.hostname = url.hostname.toLowerCase();
  }
  const defaultPort = DEFAULT_PORTS[url.protocol] ?? null;
  if (opts.removeDefaultPort && url.port && url.port === defaultPort) {
    changes.push(`移除默认端口 :${url.port}`);
    url.port = '';
  }

  if (url.search) {
    const params = queryParams(url.search).map((item) => ({ key: item.key, value: item.value }));
    let next = params;
    if (opts.dedupeParams) {
      const seen = new Set<string>();
      const before = next.length;
      next = next.filter((item) => {
        const token = `${item.key}\u0000${item.value}`;
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
      });
      if (next.length !== before) changes.push(`删除 ${before - next.length} 个完全重复的参数`);
    }
    if (opts.sortParams) {
      const before = buildSearch(next);
      next = [...next].sort((a, b) => (a.key === b.key ? a.value.localeCompare(b.value) : a.key.localeCompare(b.key)));
      if (buildSearch(next) !== before) changes.push('查询参数按键名字典序排序');
    }
    const search = buildSearch(next);
    if (search !== url.search) {
      if (!search) changes.push('移除空的查询串');
      url.search = search;
    }
  }

  if (opts.removeHash && url.hash) {
    changes.push(`移除 fragment ${url.hash}`);
    url.hash = '';
  }

  let text = url.toString();
  if (opts.removeTrailingSlash && /\/$/.test(text) && text.replace(/\/$/, '').includes('/')) {
    text = text.replace(/\/$/, '');
    changes.push('移除路径末尾的 /');
  }
  return { url: text, changes: changes.length ? changes : ['无改动'] };
}

export interface HostIssue {
  level: 'error' | 'warn';
  message: string;
}

/** 主机名规范校验。 */
export function validateHostname(hostname: string): HostIssue[] {
  const issues: HostIssue[] = [];
  const host = hostname.trim();
  if (!host) {
    issues.push({ level: 'error', message: '主机名为空' });
    return issues;
  }
  if (host.length > 253) issues.push({ level: 'error', message: `主机名长度 ${host.length} 超过 253 字符上限` });
  if (host.endsWith('.'))
    issues.push({ level: 'warn', message: '以 . 结尾的是完全限定域名形式（FQDN），部分客户端不接受' });
  if (parseIpv4(host) !== null) {
    issues.push({ level: 'warn', message: '主机名是 IPv4 字面量，会绕过 DNS 与证书域名匹配' });
  } else if (host.startsWith('[') || /^[0-9a-f:]+$/i.test(host)) {
    issues.push({ level: 'warn', message: '主机名是 IPv6 字面量' });
  }
  const labels = host.replace(/\.$/, '').split('.');
  labels.forEach((label, index) => {
    if (label.length === 0) issues.push({ level: 'error', message: `第 ${index + 1} 个标签为空` });
    if (label.length > 63)
      issues.push({ level: 'error', message: `第 ${index + 1} 个标签长度 ${label.length} 超过 63 字符` });
    if (/^-/.test(label) || /-$/.test(label))
      issues.push({ level: 'error', message: `第 ${index + 1} 个标签「${label}」不能以连字符开头或结尾` });
    if (!/^[\p{L}\p{N}-]+$/u.test(label))
      issues.push({ level: 'error', message: `第 ${index + 1} 个标签「${label}」含不允许的字符` });
  });
  const tld = labels[labels.length - 1] ?? '';
  if (labels.length === 1 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
    issues.push({ level: 'warn', message: '只有单个标签，可能是内网主机名（依赖搜索域）' });
  else if (/^\d+$/.test(tld)) issues.push({ level: 'warn', message: `顶级标签「${tld}」是纯数字，合法域名不应如此` });
  return issues;
}

/** 是否命中内置短链域名表。 */
export function isShortener(hostname: string): string | null {
  const host = hostname.toLowerCase();
  const hit = SHORTENER_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`));
  return hit ?? null;
}

export interface PathSegmentInfo {
  index: number;
  /** 原始（可能已编码）文本。 */
  raw: string;
  /** decodeURIComponent 之后的结果，无法解码时为空。 */
  decoded: string;
  decodable: boolean;
  /** 是否包含未编码的可疑字符。 */
  unencoded: UnencodedChar[];
}

/** 逐段解析路径，并对比解码前后。 */
export function analyzePathSegments(pathname: string): PathSegmentInfo[] {
  return pathname
    .split('/')
    .filter((part) => part.length > 0)
    .map((raw, index) => {
      let decoded = '';
      let decodable = false;
      try {
        decoded = decodeURIComponent(raw);
        decodable = true;
      } catch {
        decoded = raw;
      }
      return { index, raw, decoded, decodable, unencoded: detectUnencodedChars(raw) };
    });
}

/** 查询串转 JSON 对象（重复键收敛为数组）。 */
export function paramsToJson(params: QueryParam[]): string {
  const target: Record<string, string | string[]> = {};
  for (const item of params) {
    const existing = target[item.key];
    if (existing === undefined) target[item.key] = item.value;
    else if (Array.isArray(existing)) existing.push(item.value);
    else target[item.key] = [existing, item.value];
  }
  return JSON.stringify(target, null, 2);
}

/** 查询串转键值对文本。 */
export function paramsToKeyValue(params: QueryParam[]): string {
  return params.map((item) => `${item.key}=${item.value}`).join('\n');
}

/** 查询串转 curl -d 片段。 */
export function paramsToCurlData(params: QueryParam[]): string {
  return percentEncode(params.map((item) => `${item.key}=${item.value}`).join('&'), 'form');
}

/** curl -d 片段转回参数数组。 */
export function curlDataToParams(data: string): QueryParam[] {
  return queryParams(data.replace(/^-d\s+/, ''));
}
