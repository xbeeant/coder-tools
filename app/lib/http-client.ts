/**
 * HTTP 客户端的纯逻辑层：把 curl.ts 的 RequestState 编译成可执行的 fetch 参数，
 * 并提供两种发送通道。
 *
 * 通道说明：
 * - direct：在当前页面直接 fetch。Web 版只能用这个，受浏览器 CORS 限制。
 * - page  ：扩展版通过 background 把 fetch 注入到用户刚交互过的网页里执行。
 *           同源请求不受 CORS 限制，且能带上该站点的 Cookie —— 这正是联调当前站点
 *           接口最需要的能力。复用了已有的 activeTab 权限，不申请 <all_urls>。
 *
 * 注意：请求真的会从用户浏览器发出，可能携带凭据。UI 必须明确告知，且默认不持久化密钥。
 */

import { bytesToBase64, utf8ToBytes } from './bytes';
import { buildUrl, cookieHeader, formatJson, type RequestState } from './curl';
import { EXTENSION_UNAVAILABLE_HINT, sendToBackground } from './page-context';

export const MAX_RESPONSE_CHARS = 500_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 120_000;

export type FetchBody =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'form'; pairs: [string, string][]; multipart: boolean };

export interface FetchSpec {
  url: string;
  method: string;
  headers: [string, string][];
  body: FetchBody;
  timeoutMs: number;
  credentials: 'include' | 'same-origin' | 'omit';
}

export interface HttpResult {
  /** 请求是否完成并读到响应；HTTP 4xx/5xx 也算 ok */
  ok: boolean;
  transport: 'direct' | 'page';
  status?: number;
  statusText?: string;
  headers?: [string, string][];
  body?: string;
  contentType?: string;
  finalUrl?: string;
  redirected?: boolean;
  durationMs: number;
  sizeBytes?: number;
  truncated?: boolean;
  error?: string;
  hint?: string;
}

export interface CompileResult {
  spec: FetchSpec | null;
  error?: string;
  warnings: string[];
}

function hasHeader(headers: [string, string][], name: string): boolean {
  const lower = name.toLowerCase();
  return headers.some(([key]) => key.toLowerCase() === lower);
}

function encodeBasic(username: string, password: string): string {
  return bytesToBase64(utf8ToBytes(`${username}:${password}`));
}

/** 校验并编译请求；浏览器无法设置的头会被跳过并给出提示。 */
export function compileRequest(state: RequestState, options: { credentials: boolean }): CompileResult {
  const warnings: string[] = [];
  const url = buildUrl(state).trim();
  if (!url) return { spec: null, error: '请先填写请求 URL', warnings };
  if (!/^https?:\/\//i.test(url)) {
    return { spec: null, error: '只支持 http:// 或 https:// 开头的绝对地址', warnings };
  }
  try {
    new URL(url);
  } catch {
    return { spec: null, error: 'URL 格式不正确', warnings };
  }

  const headers: [string, string][] = [];
  const push = (key: string, value: string) => {
    if (!key.trim()) return;
    headers.push([key.trim(), value]);
  };

  for (const header of state.headers) {
    if (!header.enabled) continue;
    const key = header.key.trim();
    if (!key) continue;
    if (/^content-length$/i.test(key)) continue;
    if (/^cookie$/i.test(key)) {
      warnings.push('Cookie 头请改用 Cookie 编辑区填写，已忽略手写的同名头');
      continue;
    }
    if (/^(user-agent|host|origin|referer|connection|accept-encoding)$/i.test(key)) {
      warnings.push(`浏览器不允许脚本设置 ${key}，已忽略（可用 cURL 导出在终端发送）`);
      continue;
    }
    push(key, header.value);
  }

  let body: FetchBody = { kind: 'none' };
  if (state.body.kind === 'json') {
    const raw = state.body.raw.trim();
    if (raw) {
      body = { kind: 'text', text: formatJson(raw) };
      if (!hasHeader(headers, 'content-type')) push('Content-Type', 'application/json');
    }
  } else if (state.body.kind === 'raw') {
    const raw = state.body.raw.trim();
    if (raw) {
      body = { kind: 'text', text: state.body.raw };
      const contentType = state.body.contentType.trim();
      if (contentType && !hasHeader(headers, 'content-type')) push('Content-Type', contentType);
    }
  } else if (state.body.kind === 'form') {
    const pairs: [string, string][] = state.body.form
      .filter((item) => item.enabled && item.key.trim() !== '')
      .map((item) => [item.key.trim(), item.value] as [string, string]);
    if (pairs.length > 0) {
      body = { kind: 'form', pairs, multipart: state.body.multipart };
      if (!state.body.multipart && !hasHeader(headers, 'content-type')) {
        push('Content-Type', 'application/x-www-form-urlencoded');
      }
    }
  }

  if ((state.method === 'GET' || state.method === 'HEAD') && body.kind !== 'none') {
    warnings.push(`${state.method} 带请求体会被浏览器拒绝，已忽略 body；需要的话请改用 POST`);
    body = { kind: 'none' };
  }

  const cookie = cookieHeader(state);
  if (cookie) push('Cookie', cookie);

  const auth = state.auth;
  if (auth.kind === 'basic' && (auth.username || auth.password)) {
    if (!hasHeader(headers, 'authorization'))
      push('Authorization', `Basic ${encodeBasic(auth.username, auth.password)}`);
  }
  if ((auth.kind === 'bearer' || auth.kind === 'oauth2') && auth.token) {
    if (!hasHeader(headers, 'authorization')) push('Authorization', `Bearer ${auth.token}`);
  }
  if (auth.kind === 'token' && auth.token) {
    const name = auth.headerName.trim() || 'Authorization';
    if (!hasHeader(headers, name)) push(name, auth.token);
  }
  if (state.userAgent) {
    warnings.push('浏览器不允许脚本设置 User-Agent，已忽略（cURL 导出仍会保留）');
  }
  if (!state.followRedirects) {
    warnings.push('浏览器 fetch 会自动跟随重定向，无法像 curl 那样关闭；最终地址会显示在结果里');
  }

  const parsedTimeout = Number.parseFloat(state.timeout);
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(Math.round(parsedTimeout * 1000), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

  return {
    spec: {
      url,
      method: state.method,
      headers,
      body,
      timeoutMs,
      credentials: options.credentials ? 'include' : 'same-origin',
    },
    warnings,
  };
}

/** 把编译结果组装成 RequestInit（app 侧与页面注入侧逻辑保持一致）。 */
export function buildRequestInit(spec: FetchSpec, signal: AbortSignal): RequestInit {
  const init: RequestInit = {
    method: spec.method,
    headers: spec.headers,
    credentials: spec.credentials,
    signal,
  };
  if (spec.body.kind === 'text') {
    init.body = spec.body.text;
  } else if (spec.body.kind === 'form') {
    if (spec.body.multipart) {
      const form = new FormData();
      for (const [key, value] of spec.body.pairs) form.append(key, value);
      init.body = form;
    } else {
      init.body = new URLSearchParams(spec.body.pairs).toString();
    }
  }
  return init;
}

function explainFetchError(error: unknown): { error: string; hint?: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) return { error: `请求超时或被取消（${message}）` };
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return {
      error: `请求未能完成：${message}`,
      hint: '常见原因是跨域 CORS、目标不可达或混合内容（HTTPS 页面请求 HTTP）。扩展版可切换「在页面上下文发送」绕过同源限制。',
    };
  }
  return { error: message };
}

/**
 * 让外部 AbortSignal 也能结束等待。
 * 页面通道无法真正中止已经注入的 fetch，这里只停止 UI 等待，调用方需如实提示。
 */
function abortRace<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('请求已取消'));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(new Error('请求已取消'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/** 通道一：当前页面直接 fetch。 */
export async function runDirect(spec: FetchSpec, externalSignal?: AbortSignal): Promise<HttpResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), spec.timeoutMs);
  const relay = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', relay, { once: true });
  }
  try {
    const response = await fetch(spec.url, buildRequestInit(spec, controller.signal));
    return await readResponse(response, started, 'direct');
  } catch (error) {
    return {
      ok: false,
      transport: 'direct',
      durationMs: Math.round(performance.now() - started),
      ...explainFetchError(error),
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', relay);
  }
}

/** 通道二：扩展版把 fetch 注入用户交互过的网页执行（同源请求可绕过 CORS 并携带 Cookie）。 */
export async function runInPage(spec: FetchSpec, externalSignal?: AbortSignal): Promise<HttpResult> {
  const started = performance.now();
  try {
    const pending = sendToBackground({ type: 'coder-tools:http', spec });
    const reply = await abortRace(pending, externalSignal);
    if (!isRecord(reply)) return { ok: false, transport: 'page', durationMs: 0, error: '后台脚本返回了无法识别的结果' };
    if (reply.ok === false) {
      return {
        ok: false,
        transport: 'page',
        durationMs: Math.round(performance.now() - started),
        error: typeof reply.error === 'string' ? reply.error : '页面上下文发送失败',
      };
    }
    const result = reply.result;
    if (!isRecord(result)) return { ok: false, transport: 'page', durationMs: 0, error: '后台脚本没有返回响应数据' };
    return { ...(result as unknown as HttpResult), transport: 'page' };
  } catch (error) {
    const cancelled = externalSignal?.aborted === true;
    return {
      ok: false,
      transport: 'page',
      durationMs: Math.round(performance.now() - started),
      error: String(error),
      hint: cancelled ? '已停止等待，但页面里已经发出的请求不会被中止，仍可能到达服务端。' : EXTENSION_UNAVAILABLE_HINT,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 二进制响应用 response.text() 会变成乱码，直接跳过内容展示。 */
export function isBinaryContentType(contentType: string): boolean {
  return /^(image|audio|video)\/|application\/(pdf|zip|octet-stream|wasm|protobuf)|font\//i.test(contentType);
}

/** 读取响应为可序列化的纯对象；响应体会按上限截断。 */
export async function readResponse(
  response: Response,
  started: number,
  transport: 'direct' | 'page',
): Promise<HttpResult> {
  const headers: [string, string][] = Array.from(response.headers.entries());
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  const binary = isBinaryContentType(contentType);
  const body = binary ? `[二进制响应：${contentType || '未知类型'}，已跳过内容展示]` : raw;
  const truncated = !binary && raw.length > MAX_RESPONSE_CHARS;
  return {
    ok: true,
    transport,
    status: response.status,
    statusText: response.statusText,
    headers,
    body: body.slice(0, MAX_RESPONSE_CHARS),
    contentType,
    finalUrl: response.url,
    redirected: response.redirected,
    durationMs: Math.round(performance.now() - started),
    sizeBytes: new TextEncoder().encode(raw).length,
    truncated,
  };
}

const SENSITIVE_HEADERS = /^(set-cookie|authorization|cookie|proxy-authorization|x-api-key)$/i;

/** 展示用的响应头：敏感值打码，避免截图时泄露凭据。 */
export function displayHeaderValue(name: string, value: string): string {
  if (!SENSITIVE_HEADERS.test(name)) return value;
  return value.length > 8 ? `${value.slice(0, 4)}••••${value.slice(-4)}` : '••••••';
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.test(name);
}

/** 美化响应体：JSON 尝试缩进，其余原样返回。 */
export function prettyBody(body: string, contentType: string): string {
  if (!body) return '';
  if (/json/i.test(contentType) || /^\s*[{[]/.test(body)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

export function statusTone(status: number | undefined): 'success' | 'info' | 'warn' | 'danger' {
  if (status === undefined) return 'danger';
  if (status < 300) return 'success';
  if (status < 400) return 'info';
  if (status < 500) return 'warn';
  return 'danger';
}
