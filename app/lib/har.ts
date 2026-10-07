/**
 * HAR 1.2 解析与生成、cURL 互转、代码生成、断言与 Mock。
 * 浏览器内无法真正抓包，此模块负责把 HAR / cURL / 请求描述转换成可读的调试信息。
 */

import { bytesToUtf8, utf8ToBytes } from './bytes';

export interface HarNameValue {
  name: string;
  value: string;
  comment?: string;
}

export interface HarPostData {
  mimeType: string;
  text?: string;
  params?: HarNameValue[];
}

export interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
}

export interface HarContent {
  size: number;
  mimeType: string;
  text?: string;
  encoding?: string;
}

export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HarNameValue[];
  queryString: HarNameValue[];
  cookies: HarNameValue[];
  postData?: HarPostData;
  headersSize: number;
  bodySize: number;
}

export interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HarNameValue[];
  cookies: HarNameValue[];
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
  timings: HarTimings;
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: unknown;
  pageref?: string;
}

export interface HarLog {
  version: string;
  creator: { name: string; version: string };
  pages?: unknown[];
  entries: HarEntry[];
}

const EMPTY_TIMINGS: HarTimings = { blocked: -1, dns: -1, connect: -1, send: 0, wait: 0, receive: 0, ssl: -1 };

function toNameValue(input: unknown): HarNameValue[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({ name: String(item.name ?? ''), value: String(item.value ?? '') }));
}

function toNumber(input: unknown, fallback = 0): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : fallback;
}

function toPostData(input: unknown): HarPostData | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = input as Record<string, unknown>;
  const text = typeof raw.text === 'string' ? raw.text : undefined;
  const params = toNameValue(raw.params);
  if (text === undefined && params.length === 0) return undefined;
  return { mimeType: String(raw.mimeType ?? 'application/octet-stream'), text, params };
}

function toTimings(input: unknown): HarTimings {
  if (typeof input !== 'object' || input === null) return { ...EMPTY_TIMINGS };
  const raw = input as Record<string, unknown>;
  return {
    blocked: toNumber(raw.blocked, -1),
    dns: toNumber(raw.dns, -1),
    connect: toNumber(raw.connect, -1),
    send: toNumber(raw.send, 0),
    wait: toNumber(raw.wait, 0),
    receive: toNumber(raw.receive, 0),
    ssl: toNumber(raw.ssl, -1),
  };
}

function toEntry(input: unknown): HarEntry | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const request = (typeof raw.request === 'object' && raw.request !== null ? raw.request : {}) as Record<
    string,
    unknown
  >;
  const response = (typeof raw.response === 'object' && raw.response !== null ? raw.response : {}) as Record<
    string,
    unknown
  >;
  const content = (typeof response.content === 'object' && response.content !== null ? response.content : {}) as Record<
    string,
    unknown
  >;
  const requestHeaders = toNameValue(request.headers);
  const postData = toPostData(request.postData);
  return {
    startedDateTime: String(raw.startedDateTime ?? ''),
    time: toNumber(raw.time, 0),
    cache: raw.cache ?? null,
    request: {
      method: String(request.method ?? 'GET').toUpperCase(),
      url: String(request.url ?? ''),
      httpVersion: String(request.httpVersion ?? 'HTTP/1.1'),
      headers: requestHeaders,
      queryString: toNameValue(request.queryString),
      cookies: toNameValue(request.cookies),
      postData,
      headersSize: toNumber(request.headersSize, -1),
      bodySize: toNumber(request.bodySize, 0),
    },
    response: {
      status: toNumber(response.status, 0),
      statusText: String(response.statusText ?? ''),
      httpVersion: String(response.httpVersion ?? 'HTTP/1.1'),
      headers: toNameValue(response.headers),
      cookies: toNameValue(response.cookies),
      content: {
        size: toNumber(content.size, 0),
        mimeType: String(content.mimeType ?? ''),
        text: typeof content.text === 'string' ? content.text : undefined,
        encoding: typeof content.encoding === 'string' ? content.encoding : undefined,
      },
      redirectURL: String(response.redirectURL ?? ''),
      headersSize: toNumber(response.headersSize, -1),
      bodySize: toNumber(response.bodySize, 0),
      timings: toTimings(response.timings),
    },
  };
}

export type ParseHarResult = { ok: true; har: HarLog; entries: HarEntry[] } | { ok: false; error: string };

/** 解析 HAR 1.2 JSON 文本；失败时给出中文原因。 */
export function parseHar(text: string): ParseHarResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: '请粘贴 HAR JSON 或导入 .har 文件' };
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: '顶层不是 JSON 对象' };

  // 兼容直接传入单条 entry 或 { entry } 的导出格式
  const container = data as Record<string, unknown>;
  const candidate = Array.isArray(container.log)
    ? (container.log[0] as Record<string, unknown> | undefined)
    : container;
  const log = (typeof candidate?.log === 'object' && candidate.log !== null ? candidate.log : undefined) as
    | Record<string, unknown>
    | undefined;
  const source = log ?? container;
  const rawEntries = Array.isArray(source.entries)
    ? source.entries
    : Array.isArray(container.entries)
      ? container.entries
      : null;
  if (!rawEntries) return { ok: false, error: '未找到 log.entries，请确认是 HAR 1.2 格式' };

  const entries = rawEntries.map(toEntry).filter((entry): entry is HarEntry => entry !== null);
  if (entries.length === 0) return { ok: false, error: 'log.entries 为空或结构无法识别' };
  return {
    ok: true,
    har: {
      version: String(source.version ?? '1.2'),
      creator: {
        name: String((source.creator as Record<string, unknown> | undefined)?.name ?? '未知工具'),
        version: String((source.creator as Record<string, unknown> | undefined)?.version ?? ''),
      },
      entries,
    },
    entries,
  };
}

/** 读取 HAR content.text，自动处理 base64 编码。 */
export function harContentText(entry: HarEntry): string {
  const content = entry.response.content;
  if (!content.text) return '';
  if (content.encoding === 'base64') {
    try {
      const binary = atob(content.text.replace(/\s+/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytesToUtf8(bytes);
    } catch {
      return '（base64 解码失败）';
    }
  }
  return content.text;
}

function shellQuote(value: string): string {
  return /[^\w@%+=:,./-]/.test(value) ? `'${value.replace(/'/g, "'\\''")}'` : value;
}

function headerValue(entry: HarEntry, name: string): string | undefined {
  return entry.request.headers.find((item) => item.name.toLowerCase() === name)?.value;
}

/** 把 HAR 条目转换成可执行的 curl 命令。 */
export function harToCurl(entry: HarEntry): string {
  const parts = ['curl'];
  parts.push('-X', entry.request.method);
  for (const header of entry.request.headers) {
    if (['content-length', 'host', ':method'].includes(header.name.toLowerCase())) continue;
    parts.push('-H', shellQuote(`${header.name}: ${header.value}`));
  }
  const auth = entry.request.headers.find((item) => item.name.toLowerCase() === 'authorization')?.value;
  if (auth?.startsWith('Basic ')) {
    // curl 用 -u user:pass 表达 Basic 认证
    parts.push('-u', shellQuote(atob(auth.slice(6))));
  }
  const cookies = entry.request.cookies.length
    ? entry.request.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
    : headerValue(entry, 'cookie');
  if (cookies) parts.push('-b', shellQuote(cookies));
  if (headerValue(entry, 'accept-encoding')?.includes('gzip')) parts.push('--compressed');

  const postData = entry.request.postData;
  const bodyText = postData?.text ?? postData?.params?.map((item) => `${item.name}=${item.value}`).join('&') ?? '';
  if (bodyText) {
    const flag = postData?.mimeType.includes('json') ? '--data-raw' : '-d';
    parts.push(flag, shellQuote(bodyText));
  }
  const httpVersion = entry.request.httpVersion;
  if (httpVersion.includes('2')) parts.push('--http2');
  else if (httpVersion.includes('1.0')) parts.push('--http1.0');

  parts.push(shellQuote(entry.request.url));
  return parts.join(' \\\n  ');
}

const CURL_VALUE_FLAGS: Record<string, string> = {
  '-X': 'method',
  '--request': 'method',
  '-H': 'header',
  '--header': 'header',
  '-d': 'data',
  '--data': 'data',
  '--data-raw': 'data',
  '--data-binary': 'data',
  '--data-ascii': 'data',
  '-F': 'form',
  '--form': 'form',
  '-T': 'upload',
  '--upload-file': 'upload',
  '-u': 'user',
  '--user': 'user',
  '-b': 'cookie',
  '--cookie': 'cookie',
  '-A': 'user-agent',
  '--user-agent': 'user-agent',
  '-e': 'referer',
  '--referer': 'referer',
  '-o': 'output',
  '--output': 'output',
  '-x': 'proxy',
  '--proxy': 'proxy',
  '--url': 'url',
  '-m': 'max-time',
  '--max-time': 'max-time',
  '--connect-timeout': 'connect-timeout',
};

/** curl 命令 → 结构化请求（够用即可，不追求完整兼容）。 */
export function curlToRequest(command: string): {
  method: string;
  url: string;
  headers: HarNameValue[];
  body: string;
  cookies: string;
  auth: string;
  flags: string[];
  error: string | null;
} {
  // 先折叠「\」续行与换行，兼容 Chrome「复制为 cURL」的多行输出
  const source = command
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();

  // 再做引号切分，保留 -d 中的内容原样
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    if (quote) {
      if (char === '\\' && quote === '"') {
        current += source[i + 1] ?? '';
        i += 1;
      } else if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '\\') {
      current += source[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);

  const headers: HarNameValue[] = [];
  const flags: string[] = [];
  let method = '';
  let url = '';
  let body = '';
  let cookies = '';
  let auth = '';
  let form = '';
  let upload = '';
  let userAgent = '';
  let referer = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as string;
    // 跳过命令名本身（curl / http / https）
    if (i === 0 && !token.startsWith('-')) continue;
    if (token.startsWith('-')) {
      // 兼容 --header=value 写法
      const eq = token.indexOf('=');
      let flag = token;
      let inlineValue = '';
      if (token.startsWith('--') && eq > 0) {
        flag = token.slice(0, eq);
        inlineValue = token.slice(eq + 1);
      }
      const target = CURL_VALUE_FLAGS[flag];
      if (target) {
        const value = inlineValue || (tokens[i + 1] ?? '');
        if (!inlineValue) i += 1;
        switch (target) {
          case 'method':
            method = value.toUpperCase();
            break;
          case 'header': {
            const colon = value.indexOf(':');
            if (colon > 0) headers.push({ name: value.slice(0, colon).trim(), value: value.slice(colon + 1).trim() });
            break;
          }
          case 'data':
            body = value;
            flags.push(flag);
            break;
          case 'form':
            form = value;
            break;
          case 'upload':
            upload = value;
            break;
          case 'user':
            auth = value;
            break;
          case 'cookie':
            cookies = value;
            break;
          case 'user-agent':
            userAgent = value;
            break;
          case 'referer':
            referer = value;
            break;
          case 'url':
            url = value;
            break;
          default:
            flags.push(flag);
        }
      } else {
        flags.push(flag);
        // -G / -I 等
        if (flag === '-I') method = 'HEAD';
        if (flag === '-G') flags.push('--get');
      }
      continue;
    }
    if (!url) url = token;
  }

  if (form)
    body = form
      .split('&')
      .map((item) => item.replace(/^@/, ''))
      .join('\n');
  if (upload) body = `<文件内容：${upload}>`;
  if (body && !method) method = 'POST';
  if (!method) method = 'GET';

  if (userAgent) headers.push({ name: 'User-Agent', value: userAgent });
  if (referer) headers.push({ name: 'Referer', value: referer });
  if (cookies && !headers.some((item) => item.name.toLowerCase() === 'cookie'))
    headers.push({ name: 'Cookie', value: cookies });

  return { method, url, headers, body, cookies, auth, flags, error: url ? null : '未找到 URL 参数' };
}

/** curl 命令 → 单条 HAR entry。 */
export function curlToHar(command: string): HarEntry {
  const parsed = curlToRequest(command);
  const headers = [...parsed.headers];
  if (parsed.auth) {
    const [user = '', password = ''] = parsed.auth.split(':');
    const base = btoa(`${user}:${password}`);
    headers.push({ name: 'Authorization', value: `Basic ${base}` });
  }
  const queryString: HarNameValue[] = [];
  const searchStart = parsed.url.indexOf('?');
  if (searchStart >= 0) {
    const search = parsed.url.slice(searchStart + 1).split('#')[0] ?? '';
    for (const pair of search.split('&').filter(Boolean)) {
      const [key = '', value = ''] = pair.split('=');
      queryString.push({
        name: decodeURIComponent(key.replace(/\+/g, ' ')),
        value: decodeURIComponent(value.replace(/\+/g, ' ')),
      });
    }
  }
  const cookies = parsed.cookies
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name = '', value = ''] = item.split('=');
      return { name, value };
    });
  const mimeType =
    headers.find((item) => item.name.toLowerCase() === 'content-type')?.value ?? 'application/x-www-form-urlencoded';

  return {
    startedDateTime: new Date(0).toISOString(),
    time: 0,
    cache: null,
    request: {
      method: parsed.method,
      url: parsed.url,
      httpVersion: parsed.flags.includes('--http1.1') ? 'HTTP/1.1' : 'HTTP/2',
      headers,
      queryString,
      cookies,
      headersSize: -1,
      bodySize: parsed.body ? utf8ToBytes(parsed.body).length : 0,
      postData: parsed.body ? { mimeType, text: parsed.body } : undefined,
    },
    response: {
      status: 0,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: { size: 0, mimeType: 'application/json', text: '' },
      redirectURL: '',
      headersSize: -1,
      bodySize: 0,
      timings: { ...EMPTY_TIMINGS },
    },
  };
}

export interface HarSummary {
  total: number;
  totalTime: number;
  averageTime: number;
  maxTime: number;
  totalTransfer: number;
  cacheHits: number;
  methods: { key: string; count: number }[];
  statuses: { key: string; count: number }[];
  hosts: { key: string; count: number }[];
  slowest: { entry: HarEntry; index: number }[];
}

function countBy(values: string[]): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

/** 统计概览：数量、状态码/方法/域名分布、耗时、传输体积与缓存命中。 */
export function harSummary(entries: HarEntry[]): HarSummary {
  const totalTime = entries.reduce((sum, entry) => sum + Math.max(0, entry.time), 0);
  const slowest = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Math.max(0, b.entry.time) - Math.max(0, a.entry.time))
    .slice(0, 5);
  return {
    total: entries.length,
    totalTime,
    averageTime: entries.length ? Math.round(totalTime / entries.length) : 0,
    maxTime: slowest[0] ? Math.round(Math.max(0, slowest[0].entry.time)) : 0,
    totalTransfer: entries.reduce((sum, entry) => sum + Math.max(0, entry.response.bodySize), 0),
    cacheHits: entries.filter((entry) => {
      const cache = entry.cache as Record<string, unknown> | null;
      return Boolean(cache && Object.keys(cache).length > 0);
    }).length,
    methods: countBy(entries.map((entry) => entry.request.method)),
    statuses: countBy(entries.map((entry) => (entry.response.status ? String(entry.response.status) : '无响应'))),
    hosts: countBy(entries.map((entry) => hostOf(entry.request.url))),
    slowest,
  };
}

/** 单条请求的耗时瀑布分段，供绘制条形图。 */
export function timingSegments(entry: HarEntry): { key: string; label: string; value: number }[] {
  const t = entry.response.timings;
  return [
    { key: 'blocked', label: '阻塞', value: Math.max(0, t.blocked) },
    { key: 'dns', label: 'DNS', value: Math.max(0, t.dns) },
    { key: 'connect', label: '连接', value: Math.max(0, t.connect) },
    { key: 'ssl', label: 'TLS', value: Math.max(0, t.ssl) },
    { key: 'send', label: '发送', value: Math.max(0, t.send) },
    { key: 'wait', label: '等待', value: Math.max(0, t.wait) },
    { key: 'receive', label: '接收', value: Math.max(0, t.receive) },
  ];
}

/* ── 请求构造与代码生成 ─────────────────────────────────────────── */

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestSpec {
  method: string;
  url: string;
  headers: HeaderRow[];
  /** 原始 body 文本。 */
  body: string;
  /** body 类型，决定 content-type 与生成代码的差异。 */
  bodyType: 'none' | 'json' | 'form' | 'raw';
  /** form 类型时的键值对。 */
  form: { id: string; key: string; value: string; enabled: boolean }[];
}

export interface EnvVariable {
  key: string;
  value: string;
}

export interface Environment {
  id: string;
  name: string;
  active: boolean;
  variables: EnvVariable[];
}

/** 替换 {{var}} 占位符。 */
export function applyVariables(text: string, variables: EnvVariable[]): string {
  if (!text) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const hit = variables.find((item) => item.key === key);
    return hit ? hit.value : match;
  });
}

/** 收集文本中出现的所有 {{var}} 占位符。 */
export function collectVariables(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let match = re.exec(text);
  while (match) {
    found.add(match[1] as string);
    match = re.exec(text);
  }
  return [...found];
}

function activeHeaders(spec: RequestSpec): HarNameValue[] {
  return spec.headers
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => ({ name: row.key, value: row.value }));
}

function bodyOf(spec: RequestSpec): string {
  if (spec.bodyType === 'form') {
    return spec.form
      .filter((row) => row.enabled && row.key)
      .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
      .join('&');
  }
  return spec.body;
}

/** 把 HarNameValue 数组转成普通对象，供代码片段使用。 */
function headerRecordOf(headers: HarNameValue[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const item of headers) record[item.name] = item.value;
  return record;
}

function contentTypeOf(spec: RequestSpec, headers: HarNameValue[]): string | null {
  const exists = headers.some((item) => item.name.toLowerCase() === 'content-type');
  if (exists) return null;
  if (spec.bodyType === 'json') return 'application/json';
  if (spec.bodyType === 'form') return 'application/x-www-form-urlencoded';
  if (spec.bodyType === 'raw') return 'text/plain';
  return null;
}

/** 生成 curl 命令。 */
export function generateCurl(spec: RequestSpec): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const parts = ['curl', '-X', spec.method.toUpperCase()];
  for (const header of headers) parts.push('-H', shellQuote(`${header.name}: ${header.value}`));
  const body = bodyOf(spec);
  if (body) parts.push(spec.bodyType === 'json' ? '--data-raw' : '-d', shellQuote(body));
  parts.push(shellQuote(spec.url));
  return parts.join(' \\\n  ');
}

/** 生成 fetch 代码。 */
export function generateFetch(spec: RequestSpec): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const body = bodyOf(spec);
  const headerRecord = headerRecordOf(headers);
  const options = [
    `  method: '${spec.method.toUpperCase()}',`,
    `  headers: ${JSON.stringify(headerRecord, null, 2).replace(/\n/g, '\n  ')},`,
  ];
  if (body) options.push(`  body: ${JSON.stringify(body)},`);
  return [
    `const response = await fetch('${spec.url}', {`,
    ...options,
    `});`,
    `const data = await response.json();`,
  ].join('\n');
}

/** 生成 axios 代码。 */
export function generateAxios(spec: RequestSpec): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const body = bodyOf(spec);
  const config = [`  url: '${spec.url}',`, `  method: '${spec.method.toLowerCase()}',`];
  if (headers.length)
    config.push(`  headers: ${JSON.stringify(headerRecordOf(headers), null, 2).replace(/\n/g, '\n  ')},`);
  if (body) {
    const payload =
      spec.bodyType === 'json'
        ? body
        : spec.bodyType === 'form'
          ? `new URLSearchParams(${JSON.stringify(body)})`
          : body;
    config.push(`  data: ${payload},`);
  }
  return [`const response = await axios.request({`, ...config, `});`].join('\n');
}

/** 生成 HTTPie 命令。 */
export function generateHttpie(spec: RequestSpec): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const body = bodyOf(spec);
  const parts = ['httpie', spec.method.toUpperCase(), spec.url];
  for (const header of headers) parts.push(`${header.name}:=${shellQuote(header.value)}`);
  if (body) {
    parts.push(spec.bodyType === 'form' ? '--form' : '--raw');
    parts.push(shellQuote(body));
  }
  return parts.join(' ');
}

/** 生成 Postman Collection v2.1 JSON。 */
export function generatePostmanCollection(spec: RequestSpec, name = '调试请求'): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const body = bodyOf(spec);
  const collection = {
    info: {
      _postman_id: '00000000-0000-0000-0000-000000000000',
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name,
        request: {
          method: spec.method.toUpperCase(),
          header: headers.map((item) => ({ key: item.name, value: item.value, type: 'text' })),
          url: {
            raw: spec.url,
            host: [spec.url.split('/')[2] ?? ''],
            path: (spec.url.split('/')[3] ?? '').split('?')[0]?.split('/').filter(Boolean) ?? [],
          },
          ...(body
            ? {
                body: {
                  mode: spec.bodyType === 'form' ? 'urlencoded' : 'raw',
                  urlencoded: spec.form
                    .filter((row) => row.enabled && row.key)
                    .map((row) => ({ key: row.key, value: row.value, type: 'text' })),
                  raw: body,
                  options: { raw: { language: spec.bodyType === 'json' ? 'json' : 'text' } },
                },
              }
            : {}),
        },
        response: [],
      },
    ],
  };
  return JSON.stringify(collection, null, 2);
}

/** 生成 OpenAPI 3.1 片段。 */
export function generateOpenApi(spec: RequestSpec, path = '/'): string {
  const headers = activeHeaders(spec);
  const type = contentTypeOf(spec, headers);
  if (type) headers.push({ name: 'Content-Type', value: type });
  const body = bodyOf(spec);
  const document = {
    openapi: '3.1.0',
    info: { title: '调试接口', version: '1.0.0' },
    servers: [{ url: spec.url.split('/').slice(0, 3).join('/') }],
    paths: {
      [path]: {
        [spec.method.toLowerCase()]: {
          summary: `${spec.method.toUpperCase()} ${path}`,
          parameters: headers.map((item) => ({
            name: item.name,
            in: 'header',
            required: false,
            schema: { type: 'string' },
            example: item.value,
          })),
          ...(body
            ? {
                requestBody: {
                  content: {
                    [type ?? 'application/json']: { example: spec.bodyType === 'json' ? safeJson(body) : body },
                  },
                },
              }
            : {}),
          responses: { '200': { description: '成功' } },
        },
      },
    },
  };
  return JSON.stringify(document, null, 2);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* ── 断言 ──────────────────────────────────────────────────────── */

export type AssertionType = 'status' | 'header' | 'jsonPath' | 'regex' | 'time' | 'bodyContains';

export interface AssertionRule {
  id: string;
  type: AssertionType;
  /** header 名 / JSON 路径 / 正则。 */
  field: string;
  operator: 'equals' | 'contains' | 'notContains' | 'matches' | 'lt' | 'gt' | 'exists';
  expected: string;
  enabled: boolean;
}

export interface MockResponse {
  status: number;
  headers: HarNameValue[];
  body: string;
  /** 响应耗时（毫秒），用于耗时断言。 */
  time: number;
}

export interface AssertionResult {
  rule: AssertionRule;
  passed: boolean;
  actual: string;
  message: string;
}

function jsonPathValue(body: string, path: string): string | undefined {
  const parsed = safeJson(body);
  const parts = path
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean);
  let current: unknown = parsed;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current === undefined) return undefined;
  return typeof current === 'string' ? current : JSON.stringify(current);
}

function compare(operator: AssertionRule['operator'], actual: string, expected: string): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'contains':
      return actual.includes(expected);
    case 'notContains':
      return !actual.includes(expected);
    case 'matches':
      try {
        return new RegExp(expected, 'i').test(actual);
      } catch {
        return false;
      }
    case 'lt':
      return Number(actual) < Number(expected);
    case 'gt':
      return Number(actual) > Number(expected);
    case 'exists':
      return actual !== '' && actual !== 'undefined';
    default:
      return false;
  }
}

/** 对粘贴的响应执行断言规则。 */
export function evaluateAssertions(rules: AssertionRule[], response: MockResponse): AssertionResult[] {
  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      let actual = '';
      let message = '';
      switch (rule.type) {
        case 'status':
          actual = String(response.status);
          message = `状态码 ${actual} ${compare(rule.operator, actual, rule.expected) ? '符合' : '不符合'}「${rule.expected}」`;
          break;
        case 'header': {
          actual = response.headers.find((item) => item.name.toLowerCase() === rule.field.toLowerCase())?.value ?? '';
          message = `响应头 ${rule.field} = ${actual || '（缺失）'}`;
          break;
        }
        case 'jsonPath': {
          actual = jsonPathValue(response.body, rule.field) ?? '';
          message = `JSON 路径 ${rule.field} = ${actual || '（未找到）'}`;
          break;
        }
        case 'regex': {
          let matched = '';
          try {
            const hit = new RegExp(rule.field).exec(response.body);
            if (hit) matched = hit[0];
          } catch {
            message = `正则表达式非法：${rule.field}`;
          }
          actual = matched;
          message = message || `正则 ${rule.field} 命中：${matched || '无'}`;
          break;
        }
        case 'time':
          actual = String(response.time);
          message = `响应耗时 ${actual} ms`;
          break;
        case 'bodyContains':
          actual = response.body.includes(rule.expected) ? rule.expected : '';
          message = `响应体包含「${rule.expected}」：${actual ? '是' : '否'}`;
          break;
        default:
          message = '未知断言类型';
      }
      const passed = compare(rule.operator, actual, rule.expected);
      return { rule, passed, actual, message: `${message} → ${passed ? '通过' : '失败'}` };
    });
}

/** 解析响应文本（状态码 + 头 + 体），自动识别 curl -i 输出或纯 HTTP 报文。 */
export function parseResponseText(text: string): MockResponse {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let index = 0;
  let status = 200;
  const headers: HarNameValue[] = [];
  while (index < lines.length && lines[index]?.trim()) {
    const line = lines[index] as string;
    const statusMatch = /^HTTP\/[\d.]+\s+(\d{3})\s*(.*)$/i.exec(line);
    if (statusMatch) {
      status = Number(statusMatch[1]);
      headers.length = 0;
    } else {
      const colon = line.indexOf(':');
      if (colon > 0) headers.push({ name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() });
    }
    index += 1;
  }
  const body = lines.slice(index + 1).join('\n');
  const timeHeader = headers.find((item) => item.name.toLowerCase() === 'x-response-time')?.value;
  return { status, headers, body, time: timeHeader ? Number(timeHeader) || 0 : 0 };
}

/* ── Mock ──────────────────────────────────────────────────────── */

const FIRST_NAMES = ['张伟', '李娜', '王芳', '刘洋', '陈静', '赵磊', '周敏', '吴昊'];
const DOMAINS = ['example.com', 'test.cn', 'demo.io', 'sample.org'];

/** 填充 {{uuid}} / {{timestamp}} / {{name}} 等占位符。 */
export function fillTemplate(text: string): string {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_match, key: string) => {
    switch (key) {
      case 'uuid':
        return crypto.randomUUID();
      case 'timestamp':
        return String(Date.now());
      case 'iso':
        return new Date().toISOString();
      case 'date':
        return new Date().toISOString().slice(0, 10);
      case 'name':
        return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)] as string;
      case 'email':
        return `user${Math.floor(Math.random() * 900 + 100)}@${DOMAINS[Math.floor(Math.random() * DOMAINS.length)]}`;
      case 'ip':
        return `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${
          Math.floor(Math.random() * 254) + 1
        }`;
      case 'int':
        return String(Math.floor(Math.random() * 1000));
      case 'float':
        return (Math.random() * 100).toFixed(2);
      case 'bool':
        return String(Math.random() > 0.5);
      case 'port':
        return String(Math.floor(Math.random() * 2000) + 30000);
      default:
        return `{{${key}}}`;
    }
  });
}

export interface MockRoute {
  id: string;
  method: string;
  /** 路径，支持 * 单层通配与 ** 多层通配。 */
  path: string;
  status: number;
  headers: string;
  body: string;
  enabled: boolean;
}

/** 生成 Mock 响应：状态码、头、JSON 体均支持占位符。 */
export function buildMockResponse(route: MockRoute): { status: number; headers: HarNameValue[]; body: string } {
  const headers: HarNameValue[] = [];
  const text = route.headers.trim();
  if (text.startsWith('{')) {
    // 优先按 JSON 对象解析，避免把 {"k":"v"} 里的冒号当成 header 分隔符
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const [name, value] of Object.entries(parsed)) headers.push({ name, value: fillTemplate(String(value)) });
    } catch {
      headers.push({ name: 'Content-Type', value: 'application/json; charset=utf-8' });
    }
  } else {
    for (const line of text.split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0)
        headers.push({ name: line.slice(0, colon).trim(), value: fillTemplate(line.slice(colon + 1).trim()) });
    }
  }
  if (!headers.some((item) => item.name.toLowerCase() === 'content-type'))
    headers.push({ name: 'Content-Type', value: 'application/json; charset=utf-8' });
  return { status: route.status, headers, body: fillTemplate(route.body) };
}

/** 把含 * 与 ** 的路径通配转成正则；* 匹配单层，** 匹配任意层。 */
function globToRegExp(pattern: string): RegExp | null {
  let source = '';
  for (const part of pattern.split(/(\*\*|\*)/)) {
    if (part === '**') source += '.*';
    else if (part === '*') source += '[^/]*';
    else source += part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  try {
    return new RegExp(`^${source}$`);
  } catch {
    return null;
  }
}

function pathMatch(pattern: string, path: string): number {
  if (pattern === path) return 100;
  const re = globToRegExp(pattern);
  return re?.test(path) ? 50 : 0;
}

export interface MockMatch {
  route: MockRoute;
  score: number;
  reason: string;
}

/** 按「精确 > 通配」优先级匹配 Mock 路由。 */
export function matchMockRoute(routes: MockRoute[], method: string, url: string): MockMatch | null {
  let pathname = url;
  let pathnameOnly = '/';
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname;
    pathnameOnly = `${parsed.pathname}${parsed.search}`;
  } catch {
    pathname = url.split('?')[0] ?? url;
  }
  const candidates: MockMatch[] = [];
  for (const route of routes) {
    if (!route.enabled) continue;
    if (route.method !== '*' && route.method.toUpperCase() !== method.toUpperCase()) continue;
    const exact = pathMatch(route.path, pathnameOnly);
    if (exact > 0) {
      candidates.push({ route, score: exact + 10, reason: '路径完全匹配' });
      continue;
    }
    const wildcard = pathMatch(route.path, pathname);
    if (wildcard > 0) candidates.push({ route, score: wildcard, reason: '通配路径匹配' });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] as MockMatch;
}

/** 把「路由 → 响应」规则导出为静态目录结构 JSON。 */
export function mockDirectory(routes: MockRoute[]): string {
  const directory: Record<string, Record<string, unknown>> = {};
  for (const route of routes.filter((item) => item.enabled)) {
    const mock = buildMockResponse(route);
    directory[route.path] = {
      method: route.method,
      file: `${route.path.replace(/[^\w]+/g, '_') || 'root'}.json`,
      status: mock.status,
      headers: mock.headers,
      body: mock.body,
    };
  }
  return JSON.stringify({ comment: '静态目录式 Mock：按路径映射到响应文件', routes: directory }, null, 2);
}
