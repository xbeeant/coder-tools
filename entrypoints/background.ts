/**
 * 扩展后台脚本。
 *
 * 职责：
 * 1. 点击工具栏图标时打开 / 聚焦工具页（原有行为）；
 * 2. 选中文本右键菜单：把文本送进对应工具；
 * 3. 采集「用户刚刚交互过的网页」的上下文，供工具页按需拉取；
 * 4. 记录最近一次外部标签页，作为采集目标；
 * 5. 把 HTTP 请求注入用户交互过的网页执行，让同源接口能带上站点 Cookie。
 *
 * 权限策略：只用 activeTab + scripting + contextMenus，不申请 <all_urls>。
 * activeTab 权限由用户的右键菜单 / 图标点击手势授予，并绑定到当时的标签页，
 * 因此捕获目标必须来自这些交互记录的 tabId，而不是「当前活动标签」——
 * 用户点捕获按钮时活动标签已经是工具页本身了。
 */

const PAGE_PATH = '/index.html';
const MENU_ROOT = 'coder-tools-root';
const MENU_PREFIX = 'coder-tools:tool:';

const PUSH_MESSAGE = 'coder-tools:push';
const PENDING_MESSAGE = 'coder-tools:pending';
const CAPTURE_MESSAGE = 'coder-tools:capture';
const HTTP_MESSAGE = 'coder-tools:http';

const MENU_TOOLS: { toolId: string; title: string }[] = [
  { toolId: 'json-formatter', title: 'JSON 格式化 / 压缩' },
  { toolId: 'base64', title: 'Base64 解码' },
  { toolId: 'url-encode', title: 'URL 编解码' },
  { toolId: 'url-parser', title: 'URL 解析' },
  { toolId: 'jwt', title: 'JWT 解析' },
  { toolId: 'hash', title: 'Hash 计算' },
  { toolId: 'regex', title: '正则测试' },
  { toolId: 'timestamp', title: '时间戳互转' },
  { toolId: 'text-stats', title: '文本统计' },
  { toolId: 'text-diff', title: '文本差异对比' },
  { toolId: 'unicode', title: 'Unicode 转换' },
  { toolId: 'html-entity', title: 'HTML 实体转换' },
];

let pageTabId: number | undefined;
let lastExternalTabId: number | undefined;
let pendingSelection: { text: string; toolId: string; at: number } | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function focusOrOpenPage(hash = '') {
  const url = browser.runtime.getURL(PAGE_PATH) + hash;

  if (pageTabId !== undefined) {
    try {
      const tab = await browser.tabs.get(pageTabId);
      if (tab.id !== undefined) {
        await browser.tabs.update(tab.id, { active: true });
        if (tab.windowId !== undefined) {
          await browser.windows.update(tab.windowId, { focused: true });
        }
        return pageTabId;
      }
    } catch {
      // 标签页已被关闭，继续走新建流程
    }
  }

  const created = await browser.tabs.create({ url });
  pageTabId = created.id;
  return created.id;
}

/** 工具页已打开时直接推送，避免重载打断正在填写的内容；否则带上 pending 新建标签。 */
async function deliverSelection(toolId: string, text: string) {
  const payload = { text, toolId, at: Date.now() };
  pendingSelection = payload;

  if (pageTabId !== undefined) {
    try {
      await browser.tabs.get(pageTabId);
      await browser.tabs.sendMessage(pageTabId, { type: PUSH_MESSAGE, payload });
      const focused = await focusOrOpenPage();
      if (focused === pageTabId) return;
    } catch {
      // 工具页还在加载或已关闭，回退到新建标签 + pending 拉取
    }
  }

  await focusOrOpenPage(`#/tool/${toolId}`);
}

/**
 * 注入到目标网页执行的采集函数。
 * 必须完全自包含：executeScript 会把它序列化成字符串，不能引用模块作用域的任何变量。
 */
function collectPageContext() {
  function clip(value: string, max: number) {
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
  function safe(fn: () => unknown, fallback: unknown) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  const meta: { name: string; content: string }[] = [];
  const metaNodes = document.querySelectorAll('meta[name], meta[property]');
  for (let i = 0; i < metaNodes.length && meta.length < 20; i += 1) {
    const node = metaNodes[i];
    const name = node?.getAttribute('name') ?? node?.getAttribute('property') ?? '';
    const content = node?.getAttribute('content') ?? '';
    if (name && content) meta.push({ name, content: clip(content, 200) });
  }

  const cookies: { name: string; value: string }[] = [];
  const cookieText = safe(() => document.cookie, '') as string;
  for (const part of cookieText.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (name) cookies.push({ name, value: clip(part.slice(index + 1).trim(), 200) });
  }

  const storage: { area: string; key: string; value: string }[] = [];
  for (const [area, store] of [
    ['local', 'localStorage'],
    ['session', 'sessionStorage'],
  ] as const) {
    const target = safe(() => (globalThis as unknown as Record<string, Storage>)[store], null) as Storage | null;
    if (!target) continue;
    const count = safe(() => target.length, 0) as number;
    for (let i = 0; i < count && storage.length < 30; i += 1) {
      const key = safe(() => target.key(i), null) as string | null;
      if (!key) continue;
      const value = safe(() => target.getItem(key) ?? '', '') as string;
      storage.push({ area, key: clip(key, 80), value: clip(value, 200) });
    }
  }

  const resources: { name: string; type: string; duration: number }[] = [];
  const entries = safe(
    () => performance.getEntriesByType('resource') as PerformanceResourceTiming[],
    [],
  ) as PerformanceResourceTiming[];
  for (const entry of entries.slice(-20)) {
    resources.push({
      name: clip(entry.name, 200),
      type: entry.initiatorType,
      duration: Math.round(entry.duration),
    });
  }

  const jsonLd: string[] = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length && jsonLd.length < 3; i += 1) {
    const text = scripts[i]?.textContent?.trim() ?? '';
    if (text) jsonLd.push(clip(text, 2000));
  }

  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    origin: location.origin,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    selection: clip(safe(() => window.getSelection()?.toString() ?? '', '') as string, 4000),
    meta,
    cookies,
    storage,
    resources,
    jsonLd,
    textSample: clip(safe(() => document.body?.innerText ?? '', '') as string, 2000),
  };
}

async function capturePageContext() {
  if (lastExternalTabId === undefined) {
    return {
      ok: false,
      error: '还没有可采集的网页。请先在目标网页上选中文字右键使用 Coder Tools 菜单，或点击一次扩展图标。',
    };
  }
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: lastExternalTabId },
      func: collectPageContext,
    });
    const data = results?.[0]?.result;
    if (!data) return { ok: false, error: '页面上下文为空，可能是浏览器内置页面或权限不足。' };
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: `采集失败（${String(error)}）。activeTab 权限来自用户手势，请重新在目标网页上右键使用 Coder Tools 菜单后重试。`,
    };
  }
}

// ── 真·HTTP 客户端 ──────────────────────────────────────────────

/** 与 app/lib/http-client.ts 的 FetchSpec 保持一致；后台只做结构校验后透传。 */
interface HttpSpec {
  url: string;
  method: string;
  headers: [string, string][];
  body:
    | { kind: 'none' }
    | { kind: 'text'; text: string }
    | { kind: 'form'; pairs: [string, string][]; multipart: boolean };
  timeoutMs: number;
  credentials: 'include' | 'same-origin' | 'omit';
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * 注入目标网页执行的请求函数。
 *
 * 必须与 collectPageContext 一样完全自包含：executeScript 会序列化函数体，
 * 不能引用模块作用域的任何常量、类型别名以外的变量或 import。
 * 这里的常量都在函数内部重新声明，是刻意的重复。
 *
 * 用 MAIN world 执行，fetch 的发起方就是页面本身：同源接口不受 CORS 限制，
 * 且浏览器会自动附带该站点的 Cookie（HttpOnly 也包含）。
 */
async function runFetchInPage(spec: HttpSpec) {
  const maxChars = 500_000;
  const started = performance.now();
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(spec.timeoutMs) || 15_000, 1_000), 120_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method: spec.method,
      headers: spec.headers,
      credentials: spec.credentials,
      signal: controller.signal,
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

    const response = await fetch(spec.url, init);
    const headers: [string, string][] = Array.from(response.headers.entries());
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    const binary = /^(image|audio|video)\/|application\/(pdf|zip|octet-stream|wasm|protobuf)|font\//i.test(contentType);
    const body = binary ? `[二进制响应：${contentType || '未知类型'}，已跳过内容展示]` : raw;
    const truncated = !binary && raw.length > maxChars;

    return {
      ok: true,
      result: {
        ok: true,
        transport: 'page',
        status: response.status,
        statusText: response.statusText,
        headers,
        body: body.slice(0, maxChars),
        contentType,
        finalUrl: response.url,
        redirected: response.redirected,
        durationMs: Math.round(performance.now() - started),
        sizeBytes: new TextEncoder().encode(raw).length,
        truncated,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: /abort/i.test(message)
        ? `请求超时或被取消（${message}）`
        : `请求未能完成：${message}。若目标与当前页面不同源，仍会受 CORS 限制。`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function validateHttpSpec(value: unknown): { ok: true; spec: HttpSpec } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: '请求参数格式不正确' };
  const spec = value as unknown as HttpSpec;
  if (typeof spec.url !== 'string' || !/^https?:\/\//i.test(spec.url)) {
    return { ok: false, error: '只支持 http:// 或 https:// 开头的绝对地址' };
  }
  try {
    new URL(spec.url);
  } catch {
    return { ok: false, error: 'URL 格式不正确' };
  }
  if (typeof spec.method !== 'string' || !HTTP_METHODS.has(spec.method.toUpperCase())) {
    return { ok: false, error: '不支持的请求方法' };
  }
  if (!Array.isArray(spec.headers) || spec.headers.length > 100) {
    return { ok: false, error: '请求头格式不正确或数量过多' };
  }
  for (const header of spec.headers) {
    if (!Array.isArray(header) || typeof header[0] !== 'string' || typeof header[1] !== 'string') {
      return { ok: false, error: '请求头格式不正确' };
    }
  }
  const body: unknown = spec.body;
  if (!isRecord(body)) return { ok: false, error: '请求体格式不正确' };
  if (!['none', 'text', 'form'].includes(String(body.kind))) {
    return { ok: false, error: '请求体类型不正确' };
  }
  if (typeof body.text === 'string' && body.text.length > 2_000_000) {
    return { ok: false, error: '请求体超过 2 MB 上限' };
  }
  if (Array.isArray(body.pairs)) {
    for (const pair of body.pairs) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
        return { ok: false, error: '表单字段格式不正确' };
      }
    }
  }
  if (!['include', 'same-origin', 'omit'].includes(spec.credentials)) {
    return { ok: false, error: '凭据模式不正确' };
  }
  return { ok: true, spec };
}

async function handleHttpRequest(message: Record<string, unknown>): Promise<unknown> {
  const parsed = validateHttpSpec(message.spec);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (lastExternalTabId === undefined) {
    return {
      ok: false,
      error: '还没有可发送请求的网页。请先在目标网页上右键使用 Coder Tools 菜单，或点击一次扩展图标，再切回工具页。',
    };
  }

  let tabUrl = '';
  try {
    const tab = await browser.tabs.get(lastExternalTabId);
    tabUrl = tab.url ?? '';
  } catch {
    return { ok: false, error: '目标标签页已关闭，请重新在网页上右键使用 Coder Tools 菜单。' };
  }

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: lastExternalTabId },
      world: 'MAIN',
      func: runFetchInPage,
      args: [parsed.spec],
    });
    const reply = results?.[0]?.result;
    if (!isRecord(reply)) return { ok: false, error: '注入脚本没有返回结果，页面可能受 CSP 限制' };
    if (reply.ok !== true) {
      return { ok: false, error: typeof reply.error === 'string' ? reply.error : '页面内请求失败' };
    }
    const result = reply.result;
    if (!isRecord(result)) return { ok: false, error: '注入脚本没有返回响应数据' };

    // 跨源时说明能力边界，避免让用户误以为扩展能绕过所有 CORS。
    let hint: string | undefined;
    try {
      const targetOrigin = new URL(parsed.spec.url).origin;
      const pageOrigin = tabUrl ? new URL(tabUrl).origin : '';
      if (pageOrigin && targetOrigin !== pageOrigin) {
        hint = '目标地址与捕获页面不同源，跨源请求仍受 CORS 限制；只有同源接口才能免 CORS 并自动带 Cookie。';
      }
    } catch {
      // 内置页面没有可比较的 origin，忽略
    }
    return { ok: true, result: hint ? { ...result, hint } : result };
  } catch (error) {
    return {
      ok: false,
      error: `无法在网页中执行请求（${String(error)}）。activeTab 权限来自用户手势，请重新在目标网页上右键使用 Coder Tools 菜单后重试；严格 CSP 的页面也可能阻止注入。`,
    };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    // 开发模式下重复加载扩展时，同 id 菜单会创建失败，先清空再重建。
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU_ROOT, title: '用 Coder Tools 打开', contexts: ['selection'] });
      for (const item of MENU_TOOLS) {
        browser.contextMenus.create({
          id: MENU_PREFIX + item.toolId,
          parentId: MENU_ROOT,
          title: item.title,
          contexts: ['selection'],
        });
      }
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const menuId = String(info.menuItemId);
    if (!menuId.startsWith(MENU_PREFIX)) return;
    const toolId = menuId.slice(MENU_PREFIX.length);
    if (tab?.id !== undefined && tab.id !== pageTabId) lastExternalTabId = tab.id;
    void deliverSelection(toolId, info.selectionText ?? '');
  });

  // WXT 的 browser 在 Chrome 下就是原生 chrome 对象（不是 webextension-polyfill），
  // onMessage 监听器直接 return Promise 不会触发回复。异步分支必须用 sendResponse +
  // return true 保持消息通道，同步分支直接 sendResponse 即可。
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isRecord(message)) return undefined;
    if (message.type === PENDING_MESSAGE) {
      const payload = pendingSelection ?? null;
      pendingSelection = undefined;
      sendResponse({ ok: true, payload });
      return undefined;
    }
    if (message.type === CAPTURE_MESSAGE) {
      void capturePageContext().then(sendResponse);
      return true;
    }
    if (message.type === HTTP_MESSAGE) {
      void handleHttpRequest(message).then(sendResponse);
      return true;
    }
    return undefined;
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab?.id !== undefined && tab.id !== pageTabId) lastExternalTabId = tab.id;
    void focusOrOpenPage();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabId === pageTabId) pageTabId = undefined;
    if (tabId === lastExternalTabId) lastExternalTabId = undefined;
  });
});
