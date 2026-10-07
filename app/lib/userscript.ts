/**
 * 用户脚本（Tampermonkey / Violentmonkey / Greasemonkey）文本生成：纯函数，无 DOM、无网络请求。
 * 生成的目标是「可以直接复制到油猴里跑」的完整 .user.js。
 */

export type RunAt = 'document-start' | 'document-body' | 'document-end' | 'document-idle' | 'context-menu';

/** 元数据块里可用的 @grant 取值。 */
export const GRANT_OPTIONS: { value: string; label: string; note: string }[] = [
  {
    value: 'none',
    label: 'none（无授权）',
    note: '脚本直接跑在页面上下文，能访问页面 JS 变量；一旦声明其它 grant 就进沙盒',
  },
  { value: 'unsafeWindow', label: 'unsafeWindow', note: '拿到页面的 window 引用，跨沙盒访问变量' },
  { value: 'GM_setValue', label: 'GM_setValue', note: '写入脚本存储（跨页面持久化），需配合 GM_getValue' },
  { value: 'GM_getValue', label: 'GM_getValue', note: '读取脚本存储' },
  { value: 'GM_deleteValue', label: 'GM_deleteValue', note: '删除脚本存储里的某个键' },
  { value: 'GM_listValues', label: 'GM_listValues', note: '列出脚本存储的全部键' },
  { value: 'GM_addStyle', label: 'GM_addStyle', note: '向页面注入一段 CSS，页面 CSP 一般拦不住' },
  { value: 'GM_xmlhttpRequest', label: 'GM_xmlhttpRequest', note: '跨域请求，不受页面 CSP 的 connect-src 限制' },
  { value: 'GM_openInTab', label: 'GM_openInTab', note: '新标签页打开链接，可指定 active:false 后台打开' },
  { value: 'GM_notification', label: 'GM_notification', note: '系统级通知，需要权限' },
  { value: 'GM_setClipboard', label: 'GM_setClipboard', note: '写入剪贴板，比 document.execCommand 可靠' },
  { value: 'GM_registerMenuCommand', label: 'GM_registerMenuCommand', note: '在油猴面板菜单里注册命令' },
  { value: 'GM_download', label: 'GM_download', note: '触发浏览器下载，可指定文件名与保存类型' },
  { value: 'GM_cookie', label: 'GM_cookie', note: '读写 Cookie（需额外授权与用户同意）' },
  { value: 'webRequest', label: 'webRequest', note: '改写请求头等危险权限，尽量别用' },
];

export const RUN_AT_OPTIONS: { value: RunAt; label: string; note: string }[] = [
  {
    value: 'document-start',
    label: 'document-start',
    note: '文档刚开始解析，只有 <html>，最早注入，最适合 hook XHR/fetch',
  },
  { value: 'document-body', label: 'document-body', note: '<body> 出现后，meta 之后的任何位置都能用' },
  { value: 'document-end', label: 'document-end', note: 'DOM 基本完成但资源可能还在加载，默认值' },
  { value: 'document-idle', label: 'document-idle', note: '页面空闲后执行，等于 window load 之后' },
  {
    value: 'context-menu',
    label: 'context-menu',
    note: '只在浏览器右键菜单点击脚本时运行（配合 @exclude 排除所有页面）',
  },
];

export interface UserscriptMeta {
  name: string;
  namespace: string;
  version: string;
  author?: string;
  description?: string;
  /** @match 精确模式列表，形如 https://example.com/* */
  match: string[];
  /** @include 模糊匹配，优先级低于 @match */
  include?: string[];
  /** @exclude 排除规则 */
  exclude?: string[];
  /** @grant 列表；['none'] 表示无授权沙盒模式 */
  grants: string[];
  runAt: RunAt;
  /** @noframes：不注入 iframe */
  noFrames?: boolean;
  homepage?: string;
  supportUrl?: string;
  /** @updateURL 与 @downloadURL，用于自建更新通道 */
  updateUrl?: string;
  downloadUrl?: string;
  license?: string;
  icon?: string;
}

function metaLines(meta: UserscriptMeta): string[] {
  const lines: string[] = ['// ==UserScript=='];
  lines.push(`// @name         ${meta.name || '未命名脚本'}`);
  lines.push(`// @namespace    ${meta.namespace || 'https://example.com/userscript'}`);
  lines.push(`// @version      ${meta.version || '1.0.0'}`);
  if (meta.author) lines.push(`// @author       ${meta.author}`);
  if (meta.description) lines.push(`// @description  ${meta.description}`);
  for (const pattern of meta.match) lines.push(`// @match        ${pattern}`);
  for (const pattern of meta.include ?? []) lines.push(`// @include      ${pattern}`);
  for (const pattern of meta.exclude ?? []) lines.push(`// @exclude      ${pattern}`);
  if (meta.grants.length > 0) lines.push(`// @grant        ${meta.grants.join('\n// @grant        ')}`);
  lines.push(`// @run-at       ${meta.runAt}`);
  if (meta.noFrames) lines.push('// @noframes');
  if (meta.icon) lines.push(`// @icon         ${meta.icon}`);
  if (meta.homepage) lines.push(`// @homepageURL  ${meta.homepage}`);
  if (meta.supportUrl) lines.push(`// @supportURL   ${meta.supportUrl}`);
  if (meta.license) lines.push(`// @license      ${meta.license}`);
  if (meta.downloadUrl) lines.push(`// @downloadURL  ${meta.downloadUrl}`);
  if (meta.updateUrl) lines.push(`// @updateURL    ${meta.updateUrl}`);
  lines.push('// ==/UserScript==');
  return lines;
}

/** 生成完整 userscript：元数据块 + 空行 + 脚本主体。 */
export function buildUserscript(meta: UserscriptMeta, body: string): string {
  const header = metaLines(meta).join('\n');
  const code = body.replace(/\s+$/, '');
  return code === '' ? `${header}\n` : `${header}\n\n${code}\n`;
}

export interface MatchPatternBreakdown {
  scheme: string;
  host: string;
  path: string;
}

export interface MatchExplain {
  pattern: string;
  valid: boolean;
  error?: string;
  regex?: RegExp;
  matched: boolean;
  reason: string;
  breakdown?: MatchPatternBreakdown;
  /** 哪个通配符命中的说明，便于理解为什么匹配。 */
  wildcardNotes: string[];
}

const SCHEMES = new Set(['*', 'http', 'https', 'file', 'ftp', 'urn']);

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把 @match 的主机通配（`*.` / `foo.*`）转换为正则片段。 */
function hostToRe(host: string): { source: string; notes: string[] } {
  const notes: string[] = [];
  if (host === '*') return { source: '[^/]+', notes: ['主机通配 *：匹配任意主机名'] };
  if (host.startsWith('*.')) {
    notes.push('*. 前缀：同时匹配裸域名 example.com 与任意层级子域');
    return { source: `(?:[^/]+\\.)?${escapeRe(host.slice(2))}`, notes };
  }
  if (host.includes('*.')) {
    const [head = '', ...rest] = host.split('*.');
    const tail = rest.join('*.');
    notes.push('中间通配 *.: 匹配中间任意层级子域');
    return { source: `${escapeRe(head)}(?:[^/]+\\.)*${escapeRe(tail)}`, notes };
  }
  if (host.includes('*')) {
    notes.push('主机内 *：按通配符处理');
    return { source: escapeRe(host).replace(/\\\*/g, '[^/]*'), notes };
  }
  return { source: escapeRe(host), notes: [] };
}

function pathToRe(path: string): string {
  if (path === '' || !path.startsWith('/')) throw new Error('路径必须以 / 开头');
  return escapeRe(path).replace(/\\\*/g, '.*');
}

function parseMatchPattern(pattern: string): { breakdown: MatchPatternBreakdown; regex: RegExp; notes: string[] } {
  const trimmed = pattern.trim();
  const match = /^([a-z*]+):\/\/([^/]*)(\/.*)$/i.exec(trimmed);
  if (!match) {
    if (/^\*\//.test(trimmed)) throw new Error('缺少协议头，应写成 *://example.com/* 这类完整模式');
    throw new Error('格式应为 <协议>://<主机><路径>，例如 https://example.com/path/*');
  }
  const [, scheme = '', host = '', path = ''] = match;
  if (!SCHEMES.has(scheme.toLowerCase()))
    throw new Error(`不支持的协议：${scheme}（可用 *、http、https、file、ftp、urn）`);
  if (host === '' && scheme.toLowerCase() !== 'file') throw new Error('主机不能为空');

  const notes: string[] = [];
  let schemeSource: string;
  if (scheme === '*') {
    schemeSource = 'https?';
    notes.push('协议通配 *：等价于 http 与 https');
  } else {
    schemeSource = escapeRe(scheme);
  }

  const hostPart = hostToRe(host);
  notes.push(...hostPart.notes);
  const source = `^${schemeSource}://${hostPart.source}${pathToRe(path)}$`;
  return { breakdown: { scheme, host, path }, regex: new RegExp(source, 'i'), notes };
}

/** @match 模式转正则；格式非法时抛出带中文说明的异常。 */
export function matchPatternToRegExp(pattern: string): RegExp {
  return parseMatchPattern(pattern).regex;
}

/** @include 语义：整串按通配符匹配（* 可以跨路径），用于和 @match 做对比说明。 */
export function includeToRegExp(pattern: string): RegExp {
  return new RegExp(`^${escapeRe(pattern).replace(/\\\*/g, '.*')}$`, 'i');
}

/** 逐条解释某个模式对某个 URL 的匹配结果，供本地匹配测试面板使用。 */
export function explainMatch(
  pattern: string,
  url: string,
  kind: 'match' | 'include' | 'exclude' = 'match',
): MatchExplain {
  const notes: string[] = [];
  let parsed: { breakdown: MatchPatternBreakdown; regex: RegExp; notes: string[] };
  try {
    parsed = kind === 'include' ? includeLike(pattern) : parseMatchPattern(pattern);
  } catch (error) {
    return {
      pattern,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      matched: false,
      reason: '模式格式非法，不会生效',
      wildcardNotes: [],
    };
  }
  notes.push(...parsed.notes);
  let testable = url.trim();
  let matched = false;
  if (testable !== '' && !/^[a-z*]+:\/\//i.test(testable)) testable = `https://${testable}`;
  if (testable !== '') {
    matched = parsed.regex.test(testable);
    const urlParts = /^(?:([a-z*]+):\/\/([^/]*)(\/.*)?)$/i.exec(testable);
    if (urlParts && parsed.breakdown) {
      if (urlParts[1] && parsed.breakdown.scheme === '*') notes.push(`URL 协议 ${urlParts[1]} 被 * 覆盖`);
      if (urlParts[2] && parsed.breakdown.host !== '*') {
        notes.push(`URL 主机 ${urlParts[2]} 与模式主机 ${parsed.breakdown.host} 比对`);
      }
      if (urlParts[3] && parsed.breakdown.path.includes('*')) {
        notes.push(`URL 路径 ${urlParts[3]} 按通配规则匹配模式路径 ${parsed.breakdown.path}`);
      }
    }
  }
  return {
    pattern,
    valid: true,
    regex: parsed.regex,
    matched,
    reason: testable === '' ? '未填写 URL，暂无匹配结论' : matched ? '命中' : '不命中',
    breakdown: parsed.breakdown,
    wildcardNotes: notes,
  };
}

function includeLike(pattern: string): { breakdown: MatchPatternBreakdown; regex: RegExp; notes: string[] } {
  const trimmed = pattern.trim();
  const match = /^([a-z*]+):\/\/([^/]*)(\/.*)$/i.exec(trimmed);
  if (!match) {
    // 允许纯字符串形式，例如 *://*example.com*
    return {
      breakdown: { scheme: '*', host: '*', path: '*' },
      regex: includeToRegExp(trimmed),
      notes: ['@include 允许任意字符串按 * 通配匹配，不限定协议/主机/路径结构'],
    };
  }
  const [, scheme = '*', host = '*', path = '*'] = match;
  const hostPart = hostToRe(host);
  const notes = ['@include 按通配符整串匹配，优先级低于 @match'];
  notes.push(...hostPart.notes);
  const schemeSource = scheme === '*' ? 'https?' : escapeRe(scheme);
  return {
    breakdown: { scheme, host, path },
    regex: new RegExp(`^${schemeSource}://${hostPart.source}${pathToRe(path === '*' ? '/*' : path)}$`, 'i'),
    notes,
  };
}

/** 元数据指令速查表。 */
export interface MetaDirective {
  directive: string;
  required: boolean;
  summary: string;
  example: string;
}

export const META_DIRECTIVES: MetaDirective[] = [
  { directive: '@name', required: true, summary: '脚本名，显示在管理器列表里', example: '@name 网页标题提取' },
  {
    directive: '@namespace',
    required: true,
    summary: '命名空间，脚本管理器用它去重，别和别人的撞',
    example: '@namespace https://github.com/you/userscripts',
  },
  { directive: '@version', required: true, summary: '版本号，用于 @updateURL 比较与升级', example: '@version 1.2.0' },
  { directive: '@description', required: false, summary: '一句话说明', example: '@description 把页面标题复制到剪贴板' },
  { directive: '@author', required: false, summary: '作者', example: '@author you' },
  {
    directive: '@match',
    required: false,
    summary: '精确匹配规则，Chrome 扩展规范写法，支持 * 通配',
    example: '@match https://example.com/*',
  },
  {
    directive: '@include',
    required: false,
    summary: '宽松匹配，* 可跨路径，优先级低于 @match',
    example: '@include *://*.example.com/*',
  },
  {
    directive: '@exclude',
    required: false,
    summary: '排除规则，优先级高于 @match',
    example: '@exclude https://example.com/admin/*',
  },
  {
    directive: '@grant',
    required: false,
    summary: '申请 API 权限；写 none 表示无授权模式',
    example: '@grant GM_setValue',
  },
  { directive: '@run-at', required: false, summary: '注入时机，默认 document-idle', example: '@run-at document-start' },
  { directive: '@noframes', required: false, summary: '不注入 iframe 里的页面', example: '@noframes' },
  { directive: '@icon', required: false, summary: '脚本图标 URL', example: '@icon https://example.com/icon.png' },
  {
    directive: '@homepageURL',
    required: false,
    summary: '主页',
    example: '@homepageURL https://github.com/you/userscripts',
  },
  {
    directive: '@supportURL',
    required: false,
    summary: '问题反馈地址',
    example: '@supportURL https://github.com/you/userscripts/issues',
  },
  { directive: '@license', required: false, summary: '许可证标识，例如 MIT', example: '@license MIT' },
  {
    directive: '@downloadURL',
    required: false,
    summary: '指定更新时的下载地址',
    example: '@downloadURL https://gist.githubusercontent.com/you/raw/userscript.user.js',
  },
  {
    directive: '@updateURL',
    required: false,
    summary: '指定检查更新的地址，返回脚本原文',
    example: '@updateURL https://your.site/userscript.meta.js',
  },
  {
    directive: '@connect',
    required: false,
    summary: 'GM_xmlhttpRequest 可访问的域名白名单',
    example: '@connect api.example.com',
  },
  {
    directive: '@require',
    required: false,
    summary: '注入前先加载的外部脚本（远程代码，注意信任风险）',
    example: '@require https://cdn.example.com/lib.js',
  },
];

/** GM_* API 速查。 */
export interface GmApiRow {
  api: string;
  async: boolean;
  needsGrant: string;
  summary: string;
  caveat: string;
}

export const GM_API_TABLE: GmApiRow[] = [
  {
    api: 'GM_setValue(key, value)',
    async: false,
    needsGrant: 'GM_setValue',
    summary: '写入脚本存储',
    caveat: '值会 JSON 化，不能存 DOM 节点与函数',
  },
  {
    api: 'GM_getValue(key, def)',
    async: false,
    needsGrant: 'GM_getValue',
    summary: '读取脚本存储',
    caveat: '没有默认值时返回 undefined，注意判空',
  },
  {
    api: 'GM_deleteValue(key)',
    async: false,
    needsGrant: 'GM_deleteValue',
    summary: '删除某个键',
    caveat: '键不存在也不报错',
  },
  {
    api: 'GM_listValues()',
    async: false,
    needsGrant: 'GM_listValues',
    summary: '列出全部键',
    caveat: '键多时别频繁调用',
  },
  {
    api: 'GM_addStyle(css)',
    async: false,
    needsGrant: 'GM_addStyle',
    summary: '注入 CSS',
    caveat: '受页面 CSP 影响较小；返回的 <style> 可自行移除',
  },
  {
    api: 'GM_openInTab(url, opts)',
    async: false,
    needsGrant: 'GM_openInTab',
    summary: '新标签打开',
    caveat: 'active:false 可后台打开，避免打断当前操作',
  },
  {
    api: 'GM_setClipboard(text, type)',
    async: false,
    needsGrant: 'GM_setClipboard',
    summary: '写剪贴板',
    caveat: 'type 默认 text，Safari 上历史版本需要用户手势',
  },
  {
    api: 'GM_notification(text, opts)',
    async: false,
    needsGrant: 'GM_notification',
    summary: '系统通知',
    caveat: '部分平台在未授权时会降级为控制台输出',
  },
  {
    api: 'GM_registerMenuCommand(label, fn)',
    async: false,
    needsGrant: 'GM_registerMenuCommand',
    summary: '注册管理器菜单项',
    caveat: '返回函数可注销菜单；同名会互相覆盖',
  },
  {
    api: 'GM_download(details)',
    async: true,
    needsGrant: 'GM_download',
    summary: '触发下载',
    caveat: '用 details.url 指定地址，saveAs 可弹保存框',
  },
  {
    api: 'GM_xmlhttpRequest(details)',
    async: true,
    needsGrant: 'GM_xmlhttpRequest',
    summary: '跨域请求',
    caveat: '不受页面 CSP 的 connect-src 限制；用 @connect 声明域名更稳',
  },
  {
    api: 'GM.cookie.get/set/delete',
    async: true,
    needsGrant: 'GM_cookie',
    summary: 'Cookie 读写（Promise 版）',
    caveat: '需要用户在管理器里额外授权 HttpOnly 之外的 Cookie',
  },
  {
    api: 'GM.xmlHttpRequest(details)',
    async: true,
    needsGrant: 'GM_xmlhttpRequest',
    summary: '旧版回调式请求',
    caveat: ' Violentmonkey / Tampermonkey 都还兼容',
  },
  {
    api: 'GM_info',
    async: false,
    needsGrant: '始终可读',
    summary: '脚本信息对象',
    caveat: '含 script.updateURL、script.downloadURL、scriptMeta、version 等',
  },
  {
    api: 'unsafeWindow',
    async: false,
    needsGrant: 'unsafeWindow',
    summary: '页面的 window 对象',
    caveat: 'MV3 + 严格 CSP 下某些场景会退化，先做 typeof 判断',
  },
];

export interface RunAtPhase {
  phase: RunAt;
  when: string;
  available: string;
  missing: string;
}

export const RUN_AT_PHASES: RunAtPhase[] = [
  {
    phase: 'document-start',
    when: '文档刚开始解析，只有 <html> 标签',
    available: 'documentElement、head 即将出现',
    missing: 'body、绝大多数页面脚本与变量',
  },
  {
    phase: 'document-body',
    when: '<body> 标签刚出现',
    available: 'head 里的 meta、已解析的早期 DOM',
    missing: '页面底部元素、图片加载完成事件',
  },
  {
    phase: 'document-end',
    when: 'DOM 解析完成（DOMContentLoaded 附近）',
    available: '完整 DOM 结构',
    missing: '异步渲染出来的内容（React/Vue 挂载后插入的节点）',
  },
  {
    phase: 'document-idle',
    when: 'load 之后且浏览器空闲，默认值',
    available: 'DOM、图片、绝大多数脚本',
    missing: '懒加载 / 虚拟滚动后续才出现的内容',
  },
  {
    phase: 'context-menu',
    when: '只在浏览器右键菜单点击时执行',
    available: '配合 @exclude * 排除所有页面，脚本体作为菜单项回调',
    missing: '页面加载期的一切时机',
  },
];

/** 可直接使用的功能模块代码。 */

export function buildSandboxWrapper(
  options: { grantNone: boolean; useUnsafeWindow: boolean } = { grantNone: true, useUnsafeWindow: false },
): string {
  const access = options.grantNone
    ? `// 当前是 @grant none：脚本与页面共享同一个 window，可以直接读页面变量。
const pageWindow = window;`
    : `// 当前声明了 @grant：脚本跑在沙盒里，页面变量要通过 unsafeWindow 取。
// 拿不到时（部分浏览器 + MV3 严格 CSP）自动退回到 window，功能降级但不报错。
const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;`;

  const usages = options.grantNone
    ? `// 在页面上下文里挂一个对象，页面自己也能读到：
pageWindow.__myScript = { hello: function () { return 'hi'; } };`
    : `// 沙盒与页面之间传对象要走 postMessage 之类的桥，不能直接共享引用：
pageWindow.dispatchEvent(new CustomEvent('my-script:ping'));
window.addEventListener('my-script:pong', function (event) {
  console.log('收到页面回复', event.detail);
});`;

  const fallback = options.useUnsafeWindow
    ? `// unsafeWindow 是主入口，但要容错：
function getPageWindow() {
  try {
    return unsafeWindow || window;
  } catch (error) {
    console.warn('[my-script] 取不到 unsafeWindow，退回 window', error);
    return window;
  }
}`
    : `// 如果后面改成有 grant 的模式，把上面的 pageWindow 换成：
//   const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;`;

  return `// ===== 沙盒与页面上下文 =====
${access}

${fallback}

${usages}

console.log('[my-script] 脚本已启动');`;
}

/** 拦截 XHR / fetch，把请求记录留在 window.__netLog 里。 */
export function buildInterceptor(): string {
  return `// ===== 网络请求探针：hook XMLHttpRequest 与 fetch =====
(function () {
  'use strict';

  var MAX_RECORDS = 200;
  var records = [];
  var originalFetch = window.fetch;

  function push(entry) {
    records.push(entry);
    if (records.length > MAX_RECORDS) records.shift();
  }

  function now() {
    return Math.round(performance.now());
  }

  // 1) XMLHttpRequest：先保存原方法，再包一层，参数原样透传
  var XHR = window.XMLHttpRequest;
  if (XHR && !XHR.prototype.__netProbed) {
    var originalOpen = XHR.prototype.open;
    var originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__netMeta = { method: String(method), url: String(url), start: 0 };
      } catch (error) {
        this.__netMeta = null;
      }
      return originalOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      var self = this;
      var meta = self.__netMeta;
      if (meta) {
        meta.start = now();
        self.addEventListener(
          'loadend',
          function () {
            push({
              type: 'xhr',
              method: meta.method,
              url: meta.url,
              status: self.status,
              durationMs: now() - meta.start,
              size: (self.responseText || '').length,
            });
          },
          { once: true },
        );
      }
      return originalSend.apply(self, arguments);
    };

    XHR.prototype.__netProbed = true;
  }

  // 2) fetch：返回原 Promise，不消费 response，失败时把错误继续抛出去
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';
      var start = now();
      return originalFetch.apply(this, arguments).then(
        function (response) {
          push({ type: 'fetch', method: method, url: url, status: response.status, ok: response.ok, durationMs: now() - start });
          return response;
        },
        function (error) {
          push({ type: 'fetch', method: method, url: url, status: 0, durationMs: now() - start, error: String(error) });
          throw error;
        },
      );
    };
  }

  // 3) 控制台查询入口
  window.__netLog = {
    all: function () {
      return records.slice();
    },
    clear: function () {
      records.length = 0;
    },
    slow: function (ms) {
      return records.filter(function (item) {
        return item.durationMs >= ms;
      });
    },
    failed: function () {
      return records.filter(function (item) {
        return item.status === 0 || item.status >= 400;
      });
    },
    byStatus: function (code) {
      return records.filter(function (item) {
        return item.status === code;
      });
    },
    summary: function () {
      return records.reduce(
        function (acc, item) {
          acc.total += 1;
          if (item.status >= 400 || item.status === 0) acc.failed += 1;
          acc.totalMs += item.durationMs;
          return acc;
        },
        { total: 0, failed: 0, totalMs: 0 },
      );
    },
  };

  console.log('[net-probe] 已注入，__netLog.all() 查看记录，__netLog.slow(500) 找慢请求');
})();`;
}

/** MutationObserver 变化记录器。 */
export function buildMutationLogger(selector = 'body'): string {
  return `// ===== DOM 变化记录 =====
(function () {
  'use strict';

  var TARGET = ${JSON.stringify(selector)};
  var MAX_RECORDS = 300;
  var records = [];
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i += 1) {
      var mutation = mutations[i];
      records.push({
        time: new Date().toISOString(),
        type: mutation.type,
        attributeName: mutation.attributeName || null,
        added: mutation.addedNodes.length,
        removed: mutation.removedNodes.length,
        target: describe(mutation.target),
      });
    }
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    console.debug('[dom-log] 新增变更记录', records.length, '条');
  });

  function describe(node) {
    if (!node) return '(null)';
    if (node.nodeType === 1) {
      var id = node.id ? '#' + node.id : '';
      var cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\\s+/).join('.') : '';
      return node.tagName.toLowerCase() + id + cls;
    }
    return node.nodeName;
  }

  var root = document.querySelector(TARGET) || document.documentElement;
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: false });

  window.__domLog = {
    all: function () {
      return records.slice();
    },
    clear: function () {
      records.length = 0;
    },
    stop: function () {
      observer.disconnect();
    },
  };

  console.log('[dom-log] 已监听 ' + TARGET + '，__domLog.all() 查看记录');
})();`;
}

/** 样式注入器。 */
export function buildStyleInjector(css: string, styleId = 'my-script-style'): string {
  return `// ===== 样式注入 =====
(function () {
  'use strict';

  var STYLE_ID = ${JSON.stringify(styleId)};
  var CSS = ${JSON.stringify(css)};

  function inject() {
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }

  inject();

  // 页面可能重建 head，监听并补一次
  var observer = new MutationObserver(function () {
    if (!document.getElementById(STYLE_ID)) inject();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.__myStyle = { inject: inject, remove: function () { var el = document.getElementById(STYLE_ID); if (el) el.remove(); } };
})();`;
}

export interface TableExportOptions {
  /** 用于选表格的选择器，null 表示页面上第一个表格。 */
  selector?: string | null;
  fileName?: string;
  /** 是否写入 UTF-8 BOM（Excel 打开中文 CSV 需要）。 */
  bom?: boolean;
}

export function buildTableExporter(options: TableExportOptions = {}): string {
  const selector = options.selector ? JSON.stringify(options.selector) : 'null';
  const fileName = options.fileName ?? 'table.csv';
  return `// ===== 表格导出 CSV =====
(function () {
  'use strict';

  var SELECTOR = ${selector};
  var FILE_NAME = ${JSON.stringify(fileName)};
  var WITH_BOM = ${options.bom === false ? 'false' : 'true'};

  function escapeCell(text) {
    var value = String(text == null ? '' : text).replace(/\\r?\\n/g, ' ');
    return /[",]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function pickTable() {
    return SELECTOR ? document.querySelector(SELECTOR) : document.querySelector('table');
  }

  function toCsv(table) {
    var rows = [];
    var trs = table.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i += 1) {
      var cells = trs[i].querySelectorAll('th,td');
      if (cells.length === 0) continue;
      var row = [];
      for (var j = 0; j < cells.length; j += 1) row.push(escapeCell(cells[j].innerText.trim()));
      rows.push(row.join(','));
    }
    return rows.join('\\r\\n');
  }

  function download() {
    var table = pickTable();
    if (!table) {
      console.warn('[csv] 页面上没找到表格');
      return;
    }
    var csv = (WITH_BOM ? '\\ufeff' : '') + toCsv(table);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  window.__exportTable = download;
  console.log('[csv] __exportTable() 导出表格');
})();`;
}

export interface FormFillOptions {
  /** 字段选择器 → 值来源：'url' 表示从 URL 查询参数取，'storage' 表示从 GM 存储取。 */
  fields: { selector: string; source: 'url' | 'storage'; key: string; literal?: string }[];
  triggerEvent?: boolean;
}

/** 从 URL 参数或 GM 存储填充表单。 */
export function buildFormFiller(options: FormFillOptions): string {
  const fields =
    options.fields.length > 0 ? options.fields : [{ selector: 'input[name="q"]', source: 'url' as const, key: 'q' }];
  const payload = JSON.stringify(fields, null, 2)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  return `// ===== 表单自动填充 =====
(function () {
  'use strict';

  var FIELDS = [
${payload}
  ];

  function setValue(element, value) {
    if (!element) return;
    var proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fromUrl(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  function fromStorage(key) {
    try {
      return typeof GM_getValue === 'function' ? GM_getValue(key) : null;
    } catch (error) {
      return null;
    }
  }

  function fill() {
    FIELDS.forEach(function (field) {
      var value = field.literal;
      if (value === undefined) {
        value = field.source === 'url' ? fromUrl(field.key) : fromStorage(field.key);
      }
      if (value === null || value === undefined) return;
      setValue(document.querySelector(field.selector), value);
    });
    console.log('[form-fill] 填充完成');
  }

  // React / Vue 受控组件需要等一帧再赋值
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(fill, 0);
    });
  } else {
    setTimeout(fill, 0);
  }

  window.__fillForm = fill;
})();`;
}

/** 等待元素出现后自动点击（轮询 + 超时）。 */
export function buildAutoClick(
  selector: string,
  options: { timeout?: number; interval?: number; once?: boolean } = {},
): string {
  return `// ===== 等待元素后自动点击 =====
(function () {
  'use strict';

  var SELECTOR = ${JSON.stringify(selector)};
  var TIMEOUT = ${options.timeout ?? 10000};
  var INTERVAL = ${options.interval ?? 200};
  var ONCE = ${options.once === false ? 'false' : 'true'};
  var start = Date.now();
  var done = false;

  function tryClick() {
    if (done) return;
    var element = document.querySelector(SELECTOR);
    if (element) {
      element.click();
      console.log('[auto-click] 已点击 ' + SELECTOR);
      if (ONCE) done = true;
      return;
    }
    if (Date.now() - start > TIMEOUT) {
      console.warn('[auto-click] 等待超时，没找到 ' + SELECTOR);
      done = true;
      return;
    }
    setTimeout(tryClick, INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryClick);
  } else {
    tryClick();
  }
})();`;
}

export type ModuleKey =
  | 'sandbox'
  | 'interceptor'
  | 'style'
  | 'table'
  | 'mutation'
  | 'form'
  | 'autoclick'
  | 'notify'
  | 'clipboard'
  | 'menu';

export interface ModuleOption {
  key: ModuleKey;
  label: string;
  needsGrant: string[];
  build: () => string;
  hint: string;
}

function notifyModule(): string {
  return `// ===== 通知与剪贴板 =====
(function () {
  'use strict';

  function notify(title, text) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title: title, text: text, timeout: 4000 });
      return;
    }
    if (typeof Notification === 'function') {
      new Notification(title, { body: text });
      return;
    }
    console.log('[通知]', title, text);
  }

  function copy(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return Promise.resolve();
    }
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    var area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  window.__myNotify = notify;
  window.__myCopy = copy;
  console.log('[notify] __myNotify(title, text) / __myCopy(text)');
})();`;
}

function menuModule(): string {
  return `// ===== 菜单与快捷键 =====
(function () {
  'use strict';

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('导出当前页面正文', function () {
      var text = document.body ? document.body.innerText : '';
      window.__myCopy ? window.__myCopy(text) : console.log(text.slice(0, 200));
    });
    GM_registerMenuCommand('打印页面信息', function () {
      window.__myNotify('页面信息', location.href + ' | ' + document.title);
    });
  }

  // 快捷键：j/k 滚动，/ 聚焦搜索框
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
    if (event.key === 'j') window.scrollBy(0, 120);
    else if (event.key === 'k') window.scrollBy(0, -120);
    else if (event.key === '/') {
      var search = document.querySelector('input[type="search"], input[name="q"], input[type="text"]');
      if (search) {
        event.preventDefault();
        search.focus();
      }
    }
  });
})();`;
}

/** 功能模块清单，脚本生成器按勾选组合。 */
export const MODULES: ModuleOption[] = [
  {
    key: 'sandbox',
    label: '沙盒上下文桥接',
    needsGrant: [],
    build: () => buildSandboxWrapper({ grantNone: true, useUnsafeWindow: false }),
    hint: '说明 @grant none 与 unsafeWindow 的差别',
  },
  {
    key: 'interceptor',
    label: 'XHR / fetch 拦截器',
    needsGrant: [],
    build: buildInterceptor,
    hint: '把请求记录到 window.__netLog',
  },
  {
    key: 'style',
    label: '样式注入器',
    needsGrant: ['GM_addStyle'],
    build: () =>
      buildStyleInjector('/* 在这里写 CSS，例如：body { filter: invert(1) hue-rotate(180deg); } */', 'my-script-style'),
    hint: 'head 被重建时自动补一次',
  },
  {
    key: 'table',
    label: '表格导出 CSV',
    needsGrant: ['GM_setClipboard'],
    build: () => buildTableExporter({ selector: null, fileName: 'table.csv' }),
    hint: '带 UTF-8 BOM，Excel 直接打开',
  },
  {
    key: 'mutation',
    label: 'MutationObserver 变化记录',
    needsGrant: [],
    build: () => buildMutationLogger('body'),
    hint: '记录到 window.__domLog',
  },
  {
    key: 'form',
    label: '表单自动填充',
    needsGrant: ['GM_getValue'],
    build: () => buildFormFiller({ fields: [{ selector: 'input[type="text"]', source: 'url', key: 'q' }] }),
    hint: '兼容 React 受控组件',
  },
  {
    key: 'autoclick',
    label: '等待元素后自动点击',
    needsGrant: [],
    build: () => buildAutoClick('#confirm-button', { timeout: 10000, interval: 200 }),
    hint: '轮询 + 超时，避免死循环',
  },
  {
    key: 'notify',
    label: '通知 + 剪贴板封装',
    needsGrant: ['GM_notification', 'GM_setClipboard'],
    build: notifyModule,
    hint: '带降级实现',
  },
  {
    key: 'menu',
    label: '菜单命令 + 快捷键',
    needsGrant: ['GM_registerMenuCommand'],
    build: menuModule,
    hint: '注册油猴菜单，绑定 j/k/斜杠',
  },
];

/** 按勾选的模块拼出脚本主体。 */
export function buildBody(keys: ModuleKey[]): string {
  return keys
    .map((key) => MODULES.find((module) => module.key === key)?.build())
    .filter((code): code is string => typeof code === 'string' && code !== '')
    .join('\n\n');
}

/** 语法自检：用 Function 构造器捕获 SyntaxError，返回中文说明。 */
export function checkSyntax(code: string): { ok: boolean; message: string } {
  try {
    // 只做解析检查，不执行；Function 构造器足以捕获词法与语法错误。
    new Function(code);
    return { ok: true, message: '语法检查通过' };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `语法错误：${raw}` };
  }
}

/** 脚本片段库。 */
export interface SnippetItem {
  title: string;
  summary: string;
  code: string;
}

export const SNIPPETS: SnippetItem[] = [
  {
    title: '滚动到底自动翻页',
    summary: '滚到列表底部就点「下一页」，可设最大页数防止无限翻',
    code: `(function () {
  var page = 1;
  var MAX = 20;
  var next = null;
  function step() {
    if (page >= MAX) return;
    next = document.querySelector('a.next, button[aria-label="Next"]');
    if (!next) return;
    next.click();
    page += 1;
    setTimeout(step, 3000);
  }
  window.addEventListener('scroll', function () {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) step();
  });
})();`,
  },
  {
    title: '屏蔽广告位选择器',
    summary: '把常见广告容器隐藏，并盯住后续插入的广告节点',
    code: `(function () {
  var SELECTORS = ['.ad-banner', '.advertisement', '#ad-slot', '[id^="google_ads"]'];
  function hide() {
    SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) { node.remove(); });
    });
  }
  hide();
  new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
})();`,
  },
  {
    title: '把页面里的图片链接批量输出',
    summary: '收集 img/背景图并在控制台打印，便于另存',
    code: `(function () {
  var urls = new Set();
  document.querySelectorAll('img').forEach(function (img) {
    if (img.currentSrc || img.src) urls.add(img.currentSrc || img.src);
  });
  var all = Array.from(urls);
  console.log('[images] 共 ' + all.length + ' 张');
  console.log(all.join('\\n'));
  window.__imageUrls = all;
})();`,
  },
  {
    title: '导出任意表格为 CSV（含 BOM）',
    summary: '找第一个 table，导出并带 UTF-8 BOM，Excel 不乱码',
    code: `(function () {
  var table = document.querySelector('table');
  if (!table) return console.warn('没有找到表格');
  var rows = Array.from(table.querySelectorAll('tr')).map(function (tr) {
    return Array.from(tr.querySelectorAll('th,td'))
      .map(function (td) {
        var text = td.innerText.replace(/\\r?\\n/g, ' ').replace(/"/g, '""');
        return /[",]/.test(text) ? '"' + text + '"' : text;
      })
      .join(',');
  });
  var blob = new Blob(['\\ufeff' + rows.join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'table.csv';
  a.click();
})();`,
  },
  {
    title: '复制代码块并带上来源',
    summary: '点击 pre 复制内容，同时写回剪贴板来源链接',
    code: `(function () {
  document.addEventListener('click', function (event) {
    var pre = event.target.closest('pre');
    if (!pre) return;
    var text = pre.innerText;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text + '\\n\\n来源：' + location.href);
    }
    console.log('[copy] 已复制 ' + text.length + ' 字符');
  });
})();`,
  },
  {
    title: 'j / k 滚动，斜杠聚焦搜索框',
    summary: '忽略输入框内的按键，最常用的阅读类脚本',
    code: `(function () {
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
    if (event.key === 'j') window.scrollBy(0, 150);
    else if (event.key === 'k') window.scrollBy(0, -150);
    else if (event.key === '/') {
      var box = document.querySelector('input[type="search"], input[type="text"]');
      if (box) { event.preventDefault(); box.focus(); }
    }
  });
})();`,
  },
  {
    title: '页面深色模式（CSS 反色）',
    summary: '用 filter 反色 + 色相旋转，改动最小',
    code: `(function () {
  var STYLE = 'html{filter:invert(1) hue-rotate(180deg);}img,video,canvas,svg{filter:invert(1) hue-rotate(180deg);}';
  var style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  window.__toggleDark = function () { style.remove(); };
})();`,
  },
  {
    title: '隐藏侧边栏，留出正文宽度',
    summary: '给页面加一个折叠按钮，状态写进 localStorage',
    code: `(function () {
  var KEY = 'hide-sidebar';
  var sidebar = document.querySelector('aside, .sidebar, #sidebar');
  if (!sidebar) return console.warn('没找到侧边栏');
  if (localStorage.getItem(KEY) === '1') sidebar.style.display = 'none';
  var button = document.createElement('button');
  button.textContent = '侧边栏';
  button.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;padding:4px 8px;';
  button.onclick = function () {
    var hidden = sidebar.style.display === 'none';
    sidebar.style.display = hidden ? '' : 'none';
    localStorage.setItem(KEY, hidden ? '0' : '1');
  };
  document.body.appendChild(button);
})();`,
  },
  {
    title: 'GitHub 文件页加「复制 raw 链接」',
    summary: '在 blob 页面上方插入按钮，一键拿原始文件地址',
    code: `(function () {
  if (!/^https:\\/\\/github\\.com\\/[^/]+\\/[^/]+\\/blob\\//.test(location.href)) return;
  var raw = location.href.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  var button = document.createElement('button');
  button.textContent = '复制 raw 链接';
  button.style.cssText = 'position:fixed;right:16px;top:60px;z-index:99999;padding:4px 8px;';
  button.onclick = function () { navigator.clipboard.writeText(raw); };
  document.body.appendChild(button);
})();`,
  },
  {
    title: 'Markdown 文本转 HTML 预览',
    summary: '极简渲染：标题、列表、行内代码与代码块，够用即可',
    code: `(function () {
  function escapeHtml(text) {
    return text.replace(/[&<>]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch];
    });
  }
  function render(md) {
    return escapeHtml(md)
      .split('\\n')
      .map(function (line) {
        var heading = /^(#{1,6})\\s+(.*)$/.exec(line);
        if (heading) return '<h' + heading[1].length + '>' + heading[2] + '</h' + heading[1].length + '>';
        if (/^[-*]\\s+/.test(line)) return '<li>' + line.replace(/^[-*]\\s+/, '') + '</li>';
        return line.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      })
      .join('\\n');
  }
  window.__renderMarkdown = render;
  console.log('[md] __renderMarkdown(text) 可用');
})();`,
  },
  {
    title: '显示当前 UTC 与本地时间',
    summary: '页面角落常驻一个时间标签，排查时区问题用',
    code: `(function () {
  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;padding:4px 8px;background:#111;color:#0f0;border-radius:4px;font:12px monospace;';
  function tick() {
    var now = new Date();
    badge.textContent = 'UTC ' + now.toISOString().slice(11, 19) + ' | 本地 ' + now.toLocaleTimeString('zh-CN', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
  document.body.appendChild(badge);
})();`,
  },
  {
    title: '给链接批量加 target="_blank"',
    summary: '站内链接保留当前页，外链新标签打开并加 rel',
    code: `(function () {
  function patch() {
    document.querySelectorAll('a[href^="http"]').forEach(function (a) {
      if (a.host === location.host) return;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }
  patch();
  new MutationObserver(patch).observe(document.body, { childList: true, subtree: true });
})();`,
  },
  {
    title: '接口探针：记录所有 XHR 与 fetch',
    summary: '带 @grant none 即可用，控制台 __netLog.slow(300) 找慢请求',
    code: `(function () {
  'use strict';
  var records = [];
  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__m = { method: method, url: url, t: 0 };
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var self = this;
    if (self.__m) {
      self.__m.t = performance.now();
      self.addEventListener('loadend', function () {
        records.push({ method: self.__m.method, url: self.__m.url, status: self.status, ms: Math.round(performance.now() - self.__m.t) });
      });
    }
    return send.apply(self, arguments);
  };
  window.__netLog = records;
  console.log('[net-probe] __netLog 已有 ' + records.length + ' 条');
})();`,
  },
];

/** 常见坑速查。 */
export interface Pitfall {
  title: string;
  detail: string;
  fix: string;
}

export const PITFALLS: Pitfall[] = [
  {
    title: '读不到页面变量',
    detail: '声明了任意 @grant 后脚本进入沙盒，页面的 window 变量不可见。',
    fix: '用 unsafeWindow 取，或把 @grant 设为 none（代价是没有 GM_* API）。',
  },
  {
    title: 'MV3 下 Tampermonkey 的 unsafeWindow 退化',
    detail: 'Manifest V3 + 严格 CSP 的组合下，unsafeWindow 可能不可用。',
    fix: 'const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;',
  },
  {
    title: '页面 CSP 挡住注入',
    detail: '页面设置了 script-src 时，直接 innerHTML 里的 <script> 不会执行。',
    fix: '改用 GM_addStyle 注入样式；需要执行代码时用 new Function 之外的 eval 也常被拦，优先用事件绑定而不是字符串脚本。',
  },
  {
    title: 'iframe 里重复执行',
    detail: '同源 iframe 也会注入脚本，逻辑跑两遍。',
    fix: '加 @noframes，或在脚本里判断 window.top !== window.self。',
  },
  {
    title: 'React / Vue 还没渲染完',
    detail: 'document-end 时框架节点可能还不存在，querySelector 返回 null。',
    fix: '轮询 + 超时，或用 MutationObserver 等目标元素出现。',
  },
  {
    title: '只 hook 到 XHR 没 hook 到 fetch',
    detail: '现在的库大多用 fetch，patch XMLHttpRequest 完全抓不到。',
    fix: '同时 patch window.fetch，并把响应体读取放到 clone() 上，避免消费掉原始响应。',
  },
  {
    title: 'GM_xmlhttpRequest 跨域被拒',
    detail: '部分管理器要求用 @connect 显式声明目标域名。',
    fix: '加上 @connect api.example.com；不写 @connect 时会拦截所有域名，部分版本默认拒绝。',
  },
  {
    title: '导出 CSV 在 Excel 里乱码',
    detail: '没有 BOM 时 Excel 会按本地编码猜测。',
    fix: '内容前面拼 \\ufeff，并且用 Blob 的 type 指定 charset=utf-8。',
  },
  {
    title: '快捷键劫持了正常输入',
    detail: 'j/k 在输入框里被脚本抢走。',
    fix: '判断 event.target 的 tagName 与 isContentEditable，带上 Ctrl/Cmd 时直接 return。',
  },
  {
    title: '版本号不递增导致不更新',
    detail: '@updateURL 拉到的 @version 与本地相同就跳过更新。',
    fix: '每次发布都要改 @version；比较是逐段数字比较，不是字符串字典序。',
  },
  {
    title: 'GM_setValue 存了对象取回来是字符串',
    detail: '部分管理器对复杂对象序列化不一致。',
    fix: '自己 JSON.stringify / JSON.parse 一层，最稳。',
  },
  {
    title: 'X（推特）等站点结构频繁改',
    detail: '选择器随版本变动失效，脚本静默什么都不做。',
    fix: '每个模块都做「元素不存在就 console.warn」，方便第一时间发现问题。',
  },
];
