/**
 * 接口调试工具的纯逻辑层：curl 命令的解析与生成、fetch/axios 代码生成、请求体积估算、本地 Mock 响应。
 *
 * 重要边界：本模块不做任何网络请求，也不会执行 shell 命令。
 * 真实联调请把生成的命令复制到终端，或在 DevTools / Apifox / Postman 中执行。
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type BodyKind = 'none' | 'json' | 'form' | 'raw';

export type AuthKind = 'none' | 'basic' | 'bearer' | 'token' | 'oauth2';

export interface HeaderEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface PairEntry {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface CookieJarEntry extends PairEntry {}

export interface AuthState {
  kind: AuthKind;
  username: string;
  password: string;
  token: string;
  /** 自定义 token 头名，例如 X-Api-Key。 */
  headerName: string;
}

export interface BodyState {
  kind: BodyKind;
  /** json 或 raw 的原文。 */
  raw: string;
  /** form 类型时的字段。 */
  form: PairEntry[];
  /** raw 模式下用户填写的 Content-Type。 */
  contentType: string;
  /** form 是否按 multipart 发送（对应 curl -F）。 */
  multipart: boolean;
}

export interface RequestState {
  method: HttpMethod;
  /** 不含 query 的地址。 */
  url: string;
  query: PairEntry[];
  headers: HeaderEntry[];
  body: BodyState;
  auth: AuthState;
  cookies: CookieJarEntry[];
  insecure: boolean;
  followRedirects: boolean;
  compressed: boolean;
  /** --max-time，单位秒；空字符串表示不设置。 */
  timeout: string;
  userAgent: string;
}

export interface CurlParseResult {
  state: RequestState;
  warnings: string[];
  /** 未被本工具建模的 curl 参数，保留原文方便用户查看。 */
  passthrough: string[];
}

export interface CurlBuildOptions {
  /** 多行 + 反斜杠续行的可读格式。 */
  pretty: boolean;
  /** 把 Authorization / Cookie / -u 的值替换为占位符。 */
  maskSecrets: boolean;
  /** 显式写出 -X，即使方法可以由 --data 推断。 */
  alwaysMethod: boolean;
}

export interface RequestSize {
  headerBytes: number;
  bodyBytes: number;
  totalBytes: number;
  headerCount: number;
  bodyLabel: string;
}

export interface MockOptions {
  status: number;
  /** 模拟的网络耗时（毫秒），仅用于本地预览。 */
  delayMs: number;
  body: string;
  contentType: string;
}

export interface MockResponse {
  statusLine: string;
  headers: [string, string][];
  body: string;
  /** 原始 HTTP 报文，便于对照 DevTools 的 Response。 */
  raw: string;
  totalBytes: number;
}

let seq = 0;

/** 生成稳定的行 id，避免在受控列表里用数组下标当 key。 */
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

export function makeHeader(key = '', value = '', enabled = true): HeaderEntry {
  return { id: nextId('h'), key, value, enabled };
}

export function makePair(key = '', value = '', enabled = true): PairEntry {
  return { id: nextId('p'), key, value, enabled };
}

export function emptyState(): RequestState {
  return {
    method: 'GET',
    url: '',
    query: [],
    headers: [],
    body: { kind: 'none', raw: '', form: [], contentType: '', multipart: false },
    auth: { kind: 'none', username: '', password: '', token: '', headerName: '' },
    cookies: [],
    insecure: false,
    followRedirects: false,
    compressed: false,
    timeout: '',
    userAgent: '',
  };
}

/** 常见请求头提示：按方法与 body 类型给出建议，用户点了才会加入列表。 */
export function suggestHeaders(state: RequestState): { key: string; value: string; reason: string }[] {
  const out: { key: string; value: string; reason: string }[] = [];
  const has = (key: string) => state.headers.some((item) => item.key.trim().toLowerCase() === key.toLowerCase());
  const hasAuth = state.auth.kind !== 'none' || has('authorization');
  if (state.body.kind === 'json' && !has('content-type')) {
    out.push({ key: 'Content-Type', value: 'application/json; charset=utf-8', reason: 'JSON 请求体需要声明媒体类型' });
  }
  if (state.body.kind === 'form' && !has('content-type')) {
    out.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', reason: '表单请求体的默认媒体类型' });
  }
  if (state.body.kind === 'raw' && !has('content-type') && state.body.contentType !== '') {
    out.push({ key: 'Content-Type', value: state.body.contentType, reason: '使用你在 raw 模式填写的媒体类型' });
  }
  if (!has('accept')) {
    out.push({ key: 'Accept', value: 'application/json', reason: '明确期望的响应格式' });
  }
  if (!hasAuth && !has('authorization')) {
    out.push({ key: 'Authorization', value: 'Bearer $TOKEN', reason: '占位符形式，运行时再替换真实 token' });
  }
  if (state.query.some((item) => item.enabled && item.key !== '') && !has('accept')) {
    out.push({ key: 'Accept-Encoding', value: 'gzip', reason: '带查询参数的长列表请求建议开启压缩' });
  }
  return out;
}

const ENV_REF_RE = /(?<!\\)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g;

/** 找出 $VAR / ${VAR} 占位符：提醒用户这些值只在终端里才会被 shell 展开。 */
export function extractEnvRefs(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(ENV_REF_RE)) {
    found.add(match[1] ?? match[2] ?? '');
  }
  return [...found].filter((name) => name !== '');
}

/** curl 单行/多行分词：处理引号、反斜杠转义、行尾续行与 Windows 的 ^ 转义。 */
function tokenize(input: string): { tokens: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const tokens: string[] = [];
  let current = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  const text = input.replace(/\\\r?\n/g, ' ').replace(/\r\n?/g, '\n');

  const push = () => {
    if (has) {
      tokens.push(current);
      current = '';
      has = false;
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (char === '\\' && quote !== "'") {
      const next = text[i + 1];
      if (next === undefined) continue;
      // `\"` 与 `\\` 保留为字面字符，其余转义去掉反斜杠。
      if (next !== '"' && next !== '\\') current += next;
      else current += next;
      has = true;
      i += 1;
      continue;
    }
    if (char === '^' && text[i + 1] === '"') {
      // cmd.exe 里的 ^"：DevTools 的「Copy as cURL (cmd)」会这么写。
      // curl.exe 收到的参数里并不含引号，所以这里按「引号边界」处理而不是字面字符。
      quote = quote === '"' ? null : '"';
      has = true;
      i += 1;
      continue;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
        has = true;
        continue;
      }
      current += char;
      has = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      has = true;
      continue;
    }
    if (char === '$' && text[i + 1] === "'") {
      // $'...' 是 bash 的 ANSI-C 字符串，解出常见的 \n \t。
      const end = text.indexOf("'", i + 2);
      const body = end === -1 ? text.slice(i + 2) : text.slice(i + 2, end);
      current += body
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\e/g, '\x1b')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      has = true;
      i = end === -1 ? text.length : end;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\n') {
      push();
      continue;
    }
    current += char;
    has = true;
  }
  push();

  if (quote !== null) warnings.push('命令里有未闭合的引号，已按「到结尾都算字符串」处理。');
  return { tokens, warnings };
}

/** 去掉 cmd.exe 的 ^" 转义后残留在首尾的引号。 */
function stripWrappingQuotes(value: string): string {
  let out = value.trim();
  if (out.startsWith('"') || out.startsWith("'")) out = out.slice(1);
  if (out.endsWith('"') || out.endsWith("'")) out = out.slice(0, -1);
  return out.trim();
}

function headerKeyKind(key: string): 'content-type' | 'content-length' | 'cookie' | 'authorization' | 'other' {
  const lower = key.trim().toLowerCase();
  if (lower === 'content-type') return 'content-type';
  if (lower === 'content-length') return 'content-length';
  if (lower === 'cookie') return 'cookie';
  if (lower === 'authorization') return 'authorization';
  return 'other';
}

function splitUrl(url: string): { base: string; query: PairEntry[] } {
  const hashAt = url.indexOf('#');
  const clean = hashAt === -1 ? url : url.slice(0, hashAt);
  const qAt = clean.indexOf('?');
  if (qAt === -1) return { base: clean, query: [] };
  const search = clean.slice(qAt + 1);
  const base = clean.slice(0, qAt);
  const query = search
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : part.slice(eq + 1);
      return { ...makePair(decodeSafe(key), decodeSafe(value)), enabled: true };
    });
  return { base, query };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function encodeQuery(key: string, value: string): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

const PASSTHROUGH_WITH_VALUE = new Set([
  '--proxy',
  '-x',
  '--cert',
  '--key',
  '--cacert',
  '--resolve',
  '--interface',
  '--limit-rate',
  '--max-filesize',
]);

/** 解析一条 curl 命令，反向填充表单。无法解析时返回 error。 */
export function parseCurl(input: string): CurlParseResult | { error: string } {
  const warnings: string[] = [];
  const passthrough: string[] = [];
  const trimmed = input.trim();
  if (trimmed === '') return { error: '请粘贴一条 curl 命令' };

  // 只取第一个命令；`;` 连接的后续命令无法建模，只提示。
  const firstCommand = trimmed.split(/\s;\s|;\s*curl\s|&&/)[0] ?? trimmed;
  if (firstCommand !== trimmed) warnings.push('检测到多个命令串联，只解析了第一条，后面的请单独处理。');

  const { tokens, warnings: tokenWarnings } = tokenize(firstCommand);
  warnings.push(...tokenWarnings);
  if (tokens.length === 0) return { error: '命令为空' };

  const state = emptyState();
  let explicitMethod: HttpMethod | null = null;
  let usedGet = false;
  const dataParts: { text: string; raw: boolean }[] = [];
  const formParts: string[] = [];
  let authBasic: { username: string; password: string } | null = null;
  let authHeader: string | null = null;
  let cookieRaw = '';
  let sawCommand = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string;
    if (token === '$' || token === '#' || token === 'curl.exe' || token === 'curl' || token === '\\') continue;
    if (
      token === '-s' ||
      token === '-S' ||
      token === '-sS' ||
      token === '-v' ||
      token === '--verbose' ||
      token === '-#'
    ) {
      continue;
    }
    if (token === '-k' || token === '--insecure') {
      state.insecure = true;
      continue;
    }
    if (token === '-L' || token === '--location') {
      state.followRedirects = true;
      continue;
    }
    if (token === '--compressed') {
      state.compressed = true;
      continue;
    }
    if (token === '-I' || token === '--head') {
      state.method = 'HEAD';
      continue;
    }
    if (token === '-G' || token === '--get') {
      usedGet = true;
      continue;
    }
    if (token === '-i' || token === '--include' || token === '-v' || token === '--http1.1' || token === '--http2')
      continue;
    if (token === '-X' || token === '--request') {
      const value = tokens[i + 1];
      if (value !== undefined) {
        const upper = value.toUpperCase() as HttpMethod;
        if (HTTP_METHODS.includes(upper)) explicitMethod = upper;
        else warnings.push(`无法识别的请求方法 ${value}，已忽略 -X。`);
        i += 1;
      }
      continue;
    }
    if (token === '-H' || token === '--header') {
      const value = tokens[i + 1];
      i += 1;
      if (value === undefined) {
        warnings.push('-H 后面缺少取值，已忽略。');
        continue;
      }
      const colon = value.indexOf(':');
      const key = stripWrappingQuotes(colon === -1 ? value : value.slice(0, colon));
      const val = stripWrappingQuotes(colon === -1 ? '' : value.slice(colon + 1));
      if (key.toLowerCase() === 'cookie') {
        cookieRaw = cookieRaw === '' ? val : `${cookieRaw}; ${val}`;
        continue;
      }
      if (headerKeyKind(key) === 'content-length') {
        warnings.push('Content-Length 由 curl 自动计算，已忽略手动指定的值。');
        continue;
      }
      if (headerKeyKind(key) === 'authorization') authHeader = val;
      state.headers.push({ ...makeHeader(key, val), enabled: true });
      continue;
    }
    if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii'
    ) {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined)
        dataParts.push({ text: value, raw: token === '--data-raw' || token === '--data-binary' });
      continue;
    }
    if (token === '--data-urlencode') {
      const value = tokens[i + 1];
      i += 1;
      if (value === undefined) continue;
      if (value.startsWith('@')) {
        dataParts.push({ text: value.slice(1), raw: false });
        warnings.push('--data-urlencode @file 会把文件内容作为请求体，当前工具只保存了文件名。');
        continue;
      }
      if (value.includes('=')) {
        // key=value 形式：整体就是一对表单字段，值会被 curl 做 URL 编码。
        dataParts.push({ text: value, raw: false });
        warnings.push('--data-urlencode 的值会先做 URL 编码，本工具展示的是原始值，导出时会重新编码。');
      } else {
        dataParts.push({ text: value, raw: false });
      }
      continue;
    }
    if (token === '-F' || token === '--form') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) formParts.push(value);
      continue;
    }
    if (token === '-u' || token === '--user') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) {
        const colon = value.indexOf(':');
        authBasic = {
          username: colon === -1 ? value : value.slice(0, colon),
          password: colon === -1 ? '' : value.slice(colon + 1),
        };
      }
      continue;
    }
    if (token === '-b' || token === '--cookie') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) cookieRaw = cookieRaw === '' ? value : `${cookieRaw}; ${value}`;
      continue;
    }
    if (token === '-A' || token === '--user-agent') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) state.userAgent = value;
      continue;
    }
    if (token === '-m' || token === '--max-time') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) state.timeout = value;
      continue;
    }
    if (token === '--connect-timeout') {
      warnings.push('--connect-timeout 只影响握手阶段，本工具统一用 --max-time 表达超时。');
      i += 1;
      continue;
    }
    if (token === '--json') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) {
        dataParts.push({ text: value, raw: true });
        if (!state.headers.some((item) => item.key.toLowerCase() === 'content-type')) {
          state.headers.push({ ...makeHeader('Content-Type', 'application/json'), enabled: true });
        }
      }
      continue;
    }
    if (token === '--url') {
      const value = tokens[i + 1];
      i += 1;
      if (value !== undefined) {
        const parts = splitUrl(value);
        state.url = parts.base;
        state.query.push(...parts.query);
      }
      continue;
    }
    if (PASSTHROUGH_WITH_VALUE.has(token)) {
      const value = tokens[i + 1];
      i += 1;
      passthrough.push(value === undefined ? token : `${token} ${value}`);
      continue;
    }
    if (token.startsWith('-')) {
      // 不带取值的开关保持原样，便于用户看到被忽略的选项。
      passthrough.push(token);
      continue;
    }
    if (!sawCommand) {
      sawCommand = true;
      const parts = splitUrl(token);
      state.url = parts.base;
      state.query.push(...parts.query);
    }
  }

  if (state.url === '') return { error: '命令里没有找到 URL' };

  if (explicitMethod !== null) state.method = explicitMethod;
  else if (dataParts.length > 0 || formParts.length > 0 || authHeader !== null) state.method = 'POST';

  if (formParts.length > 0) {
    state.body.kind = 'form';
    state.body.multipart = true;
    state.body.form = formParts.map((part) => {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const rawValue = eq === -1 ? '' : part.slice(eq + 1);
      return { ...makePair(key, rawValue.startsWith('@') ? rawValue : decodeSafe(rawValue)), enabled: true };
    });
    if (formParts.some((part) => /=\s*@/.test(part))) {
      warnings.push('multipart 文件上传无法在浏览器里还原，已保留 @文件名，需要你在客户端补 -F 的 file=@路径。');
    }
  } else if (dataParts.length > 0) {
    const joined = dataParts.map((item) => item.text).join('&');
    if (usedGet) {
      // -G 会把 -d 的内容搬到 query 上。
      for (const part of joined.split('&')) {
        const eq = part.indexOf('=');
        state.query.push({
          ...makePair(eq === -1 ? part : part.slice(0, eq), eq === -1 ? '' : part.slice(eq + 1)),
          enabled: true,
        });
      }
      if (explicitMethod === null) state.method = 'GET';
    } else {
      const type =
        state.headers
          .find((item) => item.key.toLowerCase() === 'content-type')
          ?.value.trim()
          .toLowerCase() ?? '';
      const looksJson =
        type.includes('json') || joined.trimStart().startsWith('{') || joined.trimStart().startsWith('[');
      state.body.kind = looksJson ? 'json' : 'form';
      if (looksJson) {
        state.body.raw = joined;
        try {
          JSON.parse(joined);
        } catch {
          warnings.push('Content-Type 是 JSON，但请求体不是合法 JSON，格式化时会保持原文。');
        }
      } else {
        state.body.form = joined
          .split('&')
          .filter((part) => part !== '')
          .map((part) => {
            const eq = part.indexOf('=');
            const key = eq === -1 ? part : part.slice(0, eq);
            const value = eq === -1 ? '' : part.slice(eq + 1);
            return { ...makePair(decodeSafe(key), decodeSafe(value)), enabled: true };
          });
      }
    }
  }

  if (authHeader !== null) {
    const bearer = /^bearer\s+(.*)$/i.exec(authHeader);
    if (bearer !== null) {
      state.auth = { ...state.auth, kind: 'bearer', token: (bearer[1] ?? '').trim() };
      state.headers = state.headers.filter((item) => item.key.toLowerCase() !== 'authorization');
    } else {
      const basic = /^basic\s+(.*)$/i.exec(authHeader);
      if (basic !== null) {
        state.auth = { ...state.auth, kind: 'basic', token: (basic[1] ?? '').trim() };
        state.headers = state.headers.filter((item) => item.key.toLowerCase() !== 'authorization');
      }
    }
  }
  if (authBasic !== null) {
    state.auth = { ...state.auth, kind: 'basic', username: authBasic.username, password: authBasic.password };
  }

  if (cookieRaw !== '') {
    state.cookies = cookieRaw
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => {
        const eq = part.indexOf('=');
        return {
          ...makePair(eq === -1 ? part : part.slice(0, eq).trim(), eq === -1 ? '' : part.slice(eq + 1).trim()),
          enabled: true,
        };
      });
  }

  if (passthrough.length > 0) {
    warnings.push(`以下参数没有在表单里建模，导出时会原样带上：${passthrough.join(' ')}`);
  }

  return { state, warnings: [...new Set(warnings)], passthrough };
}

/** POSIX shell 单引号转义：内部单引号用 '\'' 收尾再续。 */
function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function activePairs(entries: PairEntry[]): PairEntry[] {
  return entries.filter((item) => item.enabled && item.key.trim() !== '');
}

/** 敏感请求头：勾选「隐藏密钥」时只遮住这些，避免把 Content-Type 也变成占位符。 */
const SENSITIVE_HEADER_RE = /(authorization|cookie|token|secret|password|passwd|api[-_]?key|session)/i;

function maskMaybe(value: string, options: CurlBuildOptions, key?: string): string {
  if (!options.maskSecrets || value === '') return value;
  if (key !== undefined && !SENSITIVE_HEADER_RE.test(key)) return value;
  return '<已隐藏>';
}

export function cookieHeader(state: RequestState): string {
  return activePairs(state.cookies)
    .map((item) => `${item.key.trim()}=${item.value}`)
    .join('; ');
}

function buildHeaderArgs(state: RequestState, options: CurlBuildOptions): string[] {
  const out: string[] = [];
  const has = (key: string) => state.headers.some((item) => item.enabled && item.key.trim().toLowerCase() === key);
  for (const header of state.headers) {
    if (!header.enabled || header.key.trim() === '') continue;
    const name = header.key.trim();
    if (name.toLowerCase() === 'content-length') continue;
    // Cookie 统一从 Cookie 编辑区输出，避免出现两处。
    if (name.toLowerCase() === 'cookie') continue;
    if (name.toLowerCase() === 'user-agent') {
      out.push(`-H ${shellQuote(`${name}: ${maskMaybe(header.value, options, name)}`)}`);
      continue;
    }
    out.push(`-H ${shellQuote(`${name}: ${maskMaybe(header.value, options, name)}`)}`);
  }
  if (state.body.kind === 'json' && !has('content-type')) {
    out.push(`-H ${shellQuote('Content-Type: application/json')}`);
  }
  if (state.body.kind === 'form' && state.body.multipart && !has('content-type')) {
    // multipart 的 boundary 由库自动生成，手写 Content-Type 反而会出错。
    out.push(`-H ${shellQuote('Accept: application/json')}`);
  }
  if (state.userAgent !== '') out.push(`-H ${shellQuote(`User-Agent: ${state.userAgent}`)}`);
  const cookie = cookieHeader(state);
  if (cookie !== '') out.push(`-H ${shellQuote(`Cookie: ${options.maskSecrets ? '<已隐藏>' : cookie}`)}`);
  if (state.auth.kind === 'basic' && (state.auth.username !== '' || state.auth.password !== '')) {
    out.push(`-u ${shellQuote(maskMaybe(`${state.auth.username}:${state.auth.password}`, options))}`);
  }
  if (state.auth.kind === 'bearer' || state.auth.kind === 'oauth2') {
    out.push(`-H ${shellQuote(`Authorization: Bearer ${maskMaybe(state.auth.token, options)}`)}`);
  }
  if (state.auth.kind === 'token' && state.auth.token !== '') {
    const name = state.auth.headerName.trim() === '' ? 'Authorization' : state.auth.headerName.trim();
    out.push(`-H ${shellQuote(`${name}: ${maskMaybe(state.auth.token, options, name)}`)}`);
  }
  return out;
}

/** 请求体参数：JSON 用 --data-raw，表单用 --data-urlencode，raw 用 --data-raw。 */
function buildDataArgs(state: RequestState): string[] {
  if (state.body.kind === 'json') {
    const raw = state.body.raw.trim();
    if (raw === '') return [];
    return ['--data-raw', shellQuote(formatJson(raw))];
  }
  if (state.body.kind === 'form') {
    const out: string[] = [];
    // multipart 用 -F，值里 @开头的文件不会被本工具真正读取，只原样保留路径。
    const flag = state.body.multipart ? '-F' : '--data-urlencode';
    for (const item of activePairs(state.body.form)) {
      out.push(flag, shellQuote(`${item.key.trim()}=${item.value}`));
    }
    return out;
  }
  if (state.body.kind === 'raw') {
    const raw = state.body.raw.trim();
    if (raw === '') return [];
    return ['--data-raw', shellQuote(raw)];
  }
  return [];
}

/**
 * 校验并压缩 JSON：curl 只关心字节内容，压成单行可以让命令保持一行、便于复制。
 * 解析失败时原样返回，不做任何猜测性修补。
 */
export function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

/** 美化 JSON，供 UI 的「格式化」按钮使用；失败返回 null。 */
export function prettyJson(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

export function buildUrl(state: RequestState): string {
  const query = activePairs(state.query).map((item) => encodeQuery(item.key.trim(), item.value));
  if (query.length === 0) return state.url;
  return `${state.url}${state.url.includes('?') ? '&' : '?'}${query.join('&')}`;
}

/** curl 有 --data 时会隐式变成 POST；想保持 GET 又带 body 需要显式 -X。 */
function methodNeedsExplicit(state: RequestState): boolean {
  const hasBody =
    state.body.kind !== 'none' && (state.body.raw.trim() !== '' || activePairs(state.body.form).length > 0);
  return state.method === 'GET' && hasBody;
}

/** 单个命令参数：短选项可以自带取值，长选项单独成词。 */
interface CurlArg {
  flag: string;
  value?: string;
}

function curlArgs(state: RequestState, options: CurlBuildOptions): CurlArg[] {
  const args: CurlArg[] = [];
  if (options.alwaysMethod || methodNeedsExplicit(state)) args.push({ flag: '-X', value: state.method });
  if (state.insecure) args.push({ flag: '-k' });
  if (state.followRedirects) args.push({ flag: '-L' });
  if (state.compressed) args.push({ flag: '--compressed' });
  if (state.timeout.trim() !== '') args.push({ flag: '--max-time', value: state.timeout.trim() });
  args.push({ flag: shellQuote(buildUrl(state)) });
  for (const header of buildHeaderArgs(state, options)) {
    const space = header.indexOf(' ');
    args.push({ flag: header.slice(0, space), value: header.slice(space + 1) });
  }
  const data = buildDataArgs(state);
  for (let i = 0; i < data.length; i += 2) {
    args.push({ flag: data[i] as string, value: data[i + 1] });
  }
  return args;
}

/** 生成单行 curl：只做字符串拼接，不执行任何命令。 */
export function buildCurl(state: RequestState, options: CurlBuildOptions): string {
  if (state.url.trim() === '') return '';
  return [
    'curl',
    ...curlArgs(state, options).map((arg) => (arg.value === undefined ? arg.flag : `${arg.flag} ${arg.value}`)),
  ].join(' ');
}

/** 多行版本：一个参数一行 + 反斜杠续行，粘贴到终端可直接执行。 */
export function buildCurlPretty(state: RequestState, options: CurlBuildOptions): string {
  if (state.url.trim() === '') return '';
  const args = curlArgs(state, options);
  const lines: string[] = ['curl'];
  let buffer = '';
  for (const arg of args) {
    const piece = arg.value === undefined ? arg.flag : `${arg.flag} ${arg.value}`;
    const candidate = buffer === '' ? `  ${piece}` : `${buffer} ${piece}`;
    // 续行符本身占 3 个字符，留出余量避免超出 100 列。
    if (buffer !== '' && candidate.length > 96) {
      lines.push(buffer);
      buffer = `  ${piece}`;
      continue;
    }
    buffer = candidate;
  }
  if (buffer !== '') lines.push(buffer);
  if (lines.length === 1) return 'curl';
  return lines.join(' \\\n');
}

export function buildFetch(state: RequestState): string {
  if (state.url.trim() === '') return '';
  const headers: string[] = [];
  const pushHeader = (key: string, value: string) => headers.push(`    ${quoteJsKey(key)}: ${JSON.stringify(value)},`);
  for (const header of state.headers) {
    if (header.enabled && header.key.trim() !== '') pushHeader(header.key.trim(), header.value);
  }
  if (state.body.kind === 'json' && !hasHeader(state, 'content-type')) pushHeader('Content-Type', 'application/json');
  const cookie = cookieHeader(state);
  if (cookie !== '') pushHeader('Cookie', cookie);
  if (state.auth.kind === 'basic') {
    pushHeader('Authorization', `Basic ${btoa(`${state.auth.username}:${state.auth.password}`)}`);
  }
  if (state.auth.kind === 'bearer' || state.auth.kind === 'oauth2') {
    pushHeader('Authorization', `Bearer ${state.auth.token}`);
  }
  if (state.auth.kind === 'token' && state.auth.token !== '') {
    pushHeader(state.auth.headerName.trim() === '' ? 'Authorization' : state.auth.headerName.trim(), state.auth.token);
  }

  let bodyLine = '';
  if (state.body.kind === 'json' && state.body.raw.trim() !== '') {
    bodyLine = `  body: ${JSON.stringify(state.body.raw)},`;
  } else if (state.body.kind === 'form' && state.body.multipart) {
    // 浏览器无法读取本地文件路径，multipart 只能给出手写 FormData 的骨架。
    const lines = activePairs(state.body.form).map(
      (item) => `  form.append(${JSON.stringify(item.key.trim())}, /* ${item.value || '文件'} */ '');`,
    );
    bodyLine = ['  // 文件需要自行从 <input type="file"> 读取', '  const form = new FormData();', ...lines].join('\n');
  } else if (state.body.kind === 'form') {
    const pairs = activePairs(state.body.form);
    const map = pairs
      .map((item) => `    ${JSON.stringify(item.key.trim())}: ${JSON.stringify(item.value)},`)
      .join('\n');
    bodyLine = `  body: new URLSearchParams({\n${map}\n  }),`;
  } else if (state.body.kind === 'raw' && state.body.raw.trim() !== '') {
    bodyLine = `  body: ${JSON.stringify(state.body.raw)},`;
  }

  const extras: string[] = [];
  if (state.compressed || state.followRedirects) extras.push('  redirect: "follow",');
  if (cookie !== '' || state.auth.kind !== 'none') extras.push('  credentials: "include",');
  if (state.insecure) extras.push('  // 跳过证书校验需要用 Node 的 undici，浏览器 fetch 无法设置');
  if (state.timeout.trim() !== '')
    extras.push(`  signal: AbortSignal.timeout(${Number(state.timeout.trim()) * 1000}),`);

  const lines = [`const res = await fetch(${JSON.stringify(buildUrl(state))}, {`];
  lines.push(`  method: ${JSON.stringify(state.method)},`);
  if (headers.length > 0) lines.push(`  headers: {\n${headers.join('\n')}\n  },`);
  lines.push(...extras);
  if (bodyLine !== '') lines.push(bodyLine);
  lines.push('});');
  lines.push('console.log(res.status, await res.text());');
  return lines.join('\n');
}

/** JS 对象键：合法标识符直接用，否则加引号。 */
function quoteJsKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function hasHeader(state: RequestState, key: string): boolean {
  return state.headers.some((item) => item.enabled && item.key.trim().toLowerCase() === key);
}

export function buildAxios(state: RequestState): string {
  if (state.url.trim() === '') return '';
  const lines: string[] = ['const res = await axios({'];
  lines.push(`  method: '${state.method.toLowerCase()}',`);
  lines.push(`  url: ${JSON.stringify(buildUrl(state))},`);
  const query = activePairs(state.query);
  if (query.length > 0) {
    lines.push('  params: {');
    for (const item of query) lines.push(`    ${JSON.stringify(item.key.trim())}: ${JSON.stringify(item.value)},`);
    lines.push('  },');
  }
  const headers: string[] = [];
  for (const header of state.headers) {
    if (header.enabled && header.key.trim() !== '')
      headers.push(`    ${JSON.stringify(header.key.trim())}: ${JSON.stringify(header.value)},`);
  }
  if (state.body.kind === 'json' && !hasHeader(state, 'content-type'))
    headers.push('    "Content-Type": "application/json",');
  if (headers.length > 0) lines.push(`  headers: {\n${headers.join('\n')}\n  },`);
  if (state.auth.kind === 'basic')
    lines.push(
      `  auth: { username: ${JSON.stringify(state.auth.username)}, password: ${JSON.stringify(state.auth.password)} },`,
    );
  else if (state.auth.kind === 'bearer' || state.auth.kind === 'oauth2') {
    if (!headers.some((line) => line.includes('Authorization'))) {
      lines.push(`  headers: {\n    Authorization: Bearer ${JSON.stringify(state.auth.token)},\n  },`);
    }
  }
  if (state.body.kind === 'json' && state.body.raw.trim() !== '') {
    lines.push(`  data: ${JSON.stringify(state.body.raw)},`);
  } else if (state.body.kind === 'form') {
    const pairs = activePairs(state.body.form);
    lines.push('  data: {');
    for (const item of pairs) lines.push(`    ${JSON.stringify(item.key.trim())}: ${JSON.stringify(item.value)},`);
    lines.push('  },');
  } else if (state.body.kind === 'raw' && state.body.raw.trim() !== '') {
    lines.push(`  data: ${JSON.stringify(state.body.raw)},`);
  }
  if (state.timeout.trim() !== '') lines.push(`  timeout: ${Number(state.timeout.trim()) * 1000},`);
  if (state.insecure) lines.push('  httpsAgent: new https.Agent({ rejectUnauthorized: false }),');
  lines.push('});');
  lines.push('console.log(res.status, res.data);');
  return lines.join('\n');
}

/** 估算请求体积：只算文本字节，不含 TLS 开销。 */
export function estimateRequest(state: RequestState): RequestSize {
  const encoder = new TextEncoder();
  const headers = state.headers.filter((item) => item.enabled && item.key.trim() !== '');
  const headerText = [
    ...headers.map((item) => `${item.key.trim()}: ${item.value}`),
    state.userAgent !== '' ? `User-Agent: ${state.userAgent}` : '',
    cookieHeader(state) !== '' ? `Cookie: ${cookieHeader(state)}` : '',
  ]
    .filter((line) => line !== '')
    .join('\r\n');

  let bodyText = '';
  let bodyLabel = '无请求体';
  if (state.body.kind === 'json' && state.body.raw.trim() !== '') {
    bodyText = formatJson(state.body.raw);
    bodyLabel = 'JSON 请求体';
  } else if (state.body.kind === 'form') {
    const pairs = activePairs(state.body.form);
    bodyText = pairs.map((item) => encodeQuery(item.key.trim(), item.value)).join('&');
    bodyLabel = '表单请求体';
  } else if (state.body.kind === 'raw' && state.body.raw.trim() !== '') {
    bodyText = state.body.raw;
    bodyLabel = '原始请求体';
  }

  const method = state.method;
  const headText = `${method} ${pathOf(state.url)} HTTP/1.1\r\nHost: ${hostOf(state.url)}\r\n${headerText}\r\n`;
  return {
    headerBytes: encoder.encode(headText).length,
    bodyBytes: encoder.encode(bodyText).length,
    totalBytes: encoder.encode(headText).length + encoder.encode(bodyText).length,
    headerCount: headers.length,
    bodyLabel,
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'example.com';
  }
}

export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/';
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** 构造一个本地 Mock 响应报文；完全离线，不发起请求。 */
export function buildMockResponse(state: RequestState, options: MockOptions): MockResponse {
  const statusLine = `HTTP/1.1 ${options.status} ${STATUS_TEXT[options.status] ?? 'Unknown'}`;
  const body = options.body;
  const encoder = new TextEncoder();
  const headers: [string, string][] = [
    ['content-type', options.contentType],
    ['content-length', String(encoder.encode(body).length)],
    ['date', new Date(0).toUTCString()],
    ['x-request-id', 'mock-0000-0000-0000'],
  ];
  if (options.delayMs > 0) headers.push(['x-mock-delay-ms', String(options.delayMs)]);
  if (state.method !== 'GET' && state.method !== 'HEAD') headers.push(['allow', 'GET, POST, PUT, PATCH, DELETE']);
  const headText = `${statusLine}\r\n${headers.map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`;
  const raw = `${headText}${body}`;
  return { statusLine, headers, body, raw, totalBytes: encoder.encode(raw).length };
}

/** 常见错误响应的示例 body，方便对照后端实际返回结构。 */
export function mockBodyFor(status: number, method: HttpMethod, path: string): string {
  const payload = {
    400: { code: 'INVALID_ARGUMENT', message: '参数校验失败', details: [{ field: 'name', issue: '必填' }] },
    401: { code: 'UNAUTHORIZED', message: '缺少或无效的访问令牌' },
    403: { code: 'FORBIDDEN', message: '当前账号没有该资源的权限' },
    404: { code: 'NOT_FOUND', message: `找不到资源 ${path}` },
    409: { code: 'CONFLICT', message: '资源已存在' },
    422: { code: 'VALIDATION_FAILED', message: '语义校验未通过' },
    429: { code: 'RATE_LIMITED', message: '请求过于频繁', retryAfter: 30 },
    500: { code: 'INTERNAL_ERROR', message: '服务内部错误', requestId: 'mock-0000-0000-0000' },
    503: { code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' },
  }[status] ?? { code: 'OK', message: `${method} ${path} 的模拟响应` };
  return JSON.stringify(payload, null, 2);
}

export const MOCK_STATUS_OPTIONS = [
  { value: '200', label: '200 OK' },
  { value: '201', label: '201 Created' },
  { value: '204', label: '204 No Content' },
  { value: '400', label: '400 Bad Request' },
  { value: '401', label: '401 Unauthorized' },
  { value: '403', label: '403 Forbidden' },
  { value: '404', label: '404 Not Found' },
  { value: '409', label: '409 Conflict' },
  { value: '422', label: '422 Unprocessable Entity' },
  { value: '429', label: '429 Too Many Requests' },
  { value: '500', label: '500 Internal Server Error' },
  { value: '502', label: '502 Bad Gateway' },
  { value: '503', label: '503 Service Unavailable' },
  { value: '504', label: '504 Gateway Timeout' },
];

export const MOCK_DELAY_OPTIONS = [
  { value: '0', label: '无延迟' },
  { value: '80', label: '80ms（本地）' },
  { value: '300', label: '300ms（同机房）' },
  { value: '1200', label: '1200ms（跨区）' },
];

export const MOCK_CONTENT_TYPES = [
  { value: 'application/json; charset=utf-8', label: 'JSON' },
  { value: 'text/plain; charset=utf-8', label: '纯文本' },
  { value: 'text/html; charset=utf-8', label: 'HTML' },
  { value: 'application/xml', label: 'XML' },
];

/** 粘贴 curl 的常见来源与差异提示。 */
export const CURL_TIPS = [
  '浏览器 DevTools → Network → 右键请求 → Copy as cURL（bash），粘进来即可反向还原表单；Firefox 与 Chrome 的引号风格不同，本工具都兼容。',
  '本工具不发起任何网络请求，也不执行 shell；想看真实响应请在终端粘贴生成的命令，或用 Apifox / Postman / Insomnia。',
  'curl 带 -d 时会隐式使用 POST 并加上 application/x-www-form-urlencoded；想发 GET 又带 body 必须显式 -X GET（很多服务端会忽略这种 body）。',
  '$TOKEN、$VAR 以及花括号包裹的变量只在 shell 里展开；粘到浏览器控制台或 JS 代码里要自己替换，否则会原样发出去。',
  '命令行里含空格或中文值时要用引号包裹；本工具统一用单引号并转义内部单引号，粘贴到 Windows CMD 需要自行调整。',
  '带 Cookie 的请求不要写进文档或聊天记录；勾选「隐藏密钥」会输出 <已隐藏> 占位符。',
  '导出 curl 时不会带上 -o、--cookie-jar、-w 等输出选项，因为它们属于客户端行为，与服务端请求无关。',
];

export interface CurlPreset {
  name: string;
  note: string;
  command: string;
}

/** 一键填充的示例命令，覆盖 GET/POST/表单/文件/鉴权/GraphQL。 */
export const CURL_PRESETS: CurlPreset[] = [
  {
    name: 'GET + 查询参数',
    note: '分页、筛选这类只读请求',
    command: "curl 'https://api.example.com/v1/users?page=1&size=20&keyword=alice' -H 'Accept: application/json'",
  },
  {
    name: 'POST JSON',
    note: '最常见的写操作',
    command: [
      "curl 'https://api.example.com/v1/users' -X POST",
      "  -H 'Content-Type: application/json'",
      "  -H 'Authorization: Bearer $TOKEN'",
      "  --data-raw '{",
      '    "name": "张三",',
      '    "email": "zhangsan@example.com"',
      "  }'",
    ].join(' \\\n'),
  },
  {
    name: '表单登录',
    note: '账号密码登录，返回 token',
    command: [
      "curl 'https://api.example.com/v1/login' -X POST",
      "  -H 'Content-Type: application/x-www-form-urlencoded'",
      "  --data-urlencode 'username=demo'",
      "  --data-urlencode 'password=secret'",
    ].join(' \\\n'),
  },
  {
    name: 'Bearer 鉴权',
    note: 'token 建议用环境变量占位',
    command: "curl 'https://api.example.com/v1/me' -H 'Authorization: Bearer $TOKEN' -H 'Accept: application/json'",
  },
  {
    name: '文件上传',
    note: 'multipart，浏览器里无法真正上传',
    command: [
      "curl 'https://api.example.com/v1/files' -X POST",
      "  -H 'Authorization: Bearer $TOKEN'",
      "  -F 'file=@./report.pdf'",
      "  -F 'type=report'",
    ].join(' \\\n'),
  },
  {
    name: 'GraphQL',
    note: '注意 variables 里是 JSON',
    command: [
      "curl 'https://api.example.com/graphql' -X POST",
      "  -H 'Content-Type: application/json'",
      "  --data-raw '{",
      '    "query": "query GetUser($id: ID!) { user(id: $id) { id name } }",',
      '    "variables": { "id": "u_1001" }',
      "  }'",
    ].join(' \\\n'),
  },
  {
    name: 'PUT 全量更新',
    note: '与 PATCH 的区别是全量覆盖',
    command:
      "curl 'https://api.example.com/v1/users/u_1001' -X PUT -H 'Content-Type: application/json' --data-raw '{\"name\":\"李四\"}'",
  },
  {
    name: '超时与重定向',
    note: '长任务接口建议加 --max-time',
    command: "curl 'https://api.example.com/v1/export' -L --compressed --max-time 30 -H 'Accept: application/json'",
  },
];
