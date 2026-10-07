/** 常见 HTTP 状态码速查表。 */

export interface StatusEntry {
  code: number;
  name: string;
  category: StatusCategory;
  summary: string;
  advice: string;
}

export type StatusCategory = '信息' | '成功' | '重定向' | '客户端错误' | '服务端错误' | '未分配';

export const STATUS_CATEGORIES: StatusCategory[] = ['信息', '成功', '重定向', '客户端错误', '服务端错误', '未分配'];

export const STATUS_ENTRIES: StatusEntry[] = [
  // 1xx
  {
    code: 100,
    name: 'Continue',
    category: '信息',
    summary: '请求已收到，客户端可以继续发送正文',
    advice: '由 Expect: 100-continue 触发，通常无需处理',
  },
  {
    code: 101,
    name: 'Switching Protocols',
    category: '信息',
    summary: '协议切换完成',
    advice: 'WebSocket 升级握手成功时返回',
  },
  {
    code: 102,
    name: 'Processing',
    category: '信息',
    summary: '服务器已接受请求但尚未完成处理',
    advice: 'WebDAV LOCK 长时间占用时返回，需等待 Retry-After',
  },
  {
    code: 103,
    name: 'Early Hints',
    category: '信息',
    summary: '在正式响应前提前发送 Link 头预加载资源',
    advice: '用于资源预取，无需业务处理',
  },
  // 2xx
  { code: 200, name: 'OK', category: '成功', summary: '请求成功', advice: 'GET 返回资源，POST 返回操作结果' },
  { code: 201, name: 'Created', category: '成功', summary: '资源创建成功', advice: '响应头应包含新资源的 Location' },
  {
    code: 202,
    name: 'Accepted',
    category: '成功',
    summary: '请求已接受但尚未处理完成',
    advice: '异步任务场景，需配合状态查询接口',
  },
  {
    code: 203,
    name: 'Non-Authoritative Information',
    category: '成功',
    summary: '返回经过代理修改的内容',
    advice: '注意中间层是否改写了响应',
  },
  { code: 204, name: 'No Content', category: '成功', summary: '成功但无响应正文', advice: '响应体必须为空' },
  {
    code: 205,
    name: 'Reset Content',
    category: '成功',
    summary: '要求客户端重置视图',
    advice: '表单提交后清空当前页面',
  },
  {
    code: 206,
    name: 'Partial Content',
    category: '成功',
    summary: '返回部分内容',
    advice: '配合 Range 头做断点续传与分段下载',
  },
  { code: 207, name: 'Multi-Status', category: '成功', summary: '多个子操作各自的状态', advice: 'WebDAV 批量操作场景' },
  { code: 208, name: 'Already Reported', category: '成功', summary: '重复成员已在枚举中', advice: 'WebDAV 枚举场景' },
  { code: 226, name: 'IM Used', category: '成功', summary: '实例操纵被应用', advice: '对原表示例进行增量修改' },
  // 3xx
  {
    code: 300,
    name: 'Multiple Choices',
    category: '重定向',
    summary: '存在多个可选表示',
    advice: '客户端需自行选择或由服务端补充 Location',
  },
  {
    code: 301,
    name: 'Moved Permanently',
    category: '重定向',
    summary: '资源已永久迁移',
    advice: '搜索引擎会转移权重，注意保留跳转链',
  },
  {
    code: 302,
    name: 'Found',
    category: '重定向',
    summary: '临时跳转，方法理论上会被改为 GET',
    advice: 'POST 场景需确认是否要用 307',
  },
  {
    code: 303,
    name: 'See Other',
    category: '重定向',
    summary: '用 GET 请求另一个 URI',
    advice: '适合提交后重定向到结果页，PRG 模式',
  },
  {
    code: 304,
    name: 'Not Modified',
    category: '重定向',
    summary: '缓存仍然有效，无需返回正文',
    advice: '配合 ETag 或 Last-Modified 减少流量',
  },
  { code: 305, name: 'Use Proxy', category: '重定向', summary: '要求使用代理', advice: '已被弃用' },
  {
    code: 307,
    name: 'Temporary Redirect',
    category: '重定向',
    summary: '临时跳转且保持原方法与正文',
    advice: 'HTTPS 强制跳转常用，避免 POST 变 GET',
  },
  {
    code: 308,
    name: 'Permanent Redirect',
    category: '重定向',
    summary: '永久跳转且保持原方法与正文',
    advice: '301 的语义安全版本',
  },
  // 4xx
  {
    code: 400,
    name: 'Bad Request',
    category: '客户端错误',
    summary: '请求语法或参数错误',
    advice: '返回具体字段错误信息，不要只给通用提示',
  },
  {
    code: 401,
    name: 'Unauthorized',
    category: '客户端错误',
    summary: '缺少或无效的身份凭证',
    advice: '响应需带 WWW-Authenticate 头；语义上应为 Unauthenticated',
  },
  {
    code: 402,
    name: 'Payment Required',
    category: '客户端错误',
    summary: '保留用于将来的付费场景',
    advice: '非标准状态码，支付场景常用自定义码',
  },
  {
    code: 403,
    name: 'Forbidden',
    category: '客户端错误',
    summary: '已认证但无权限',
    advice: '与 401 区分：这是权限问题，重试无用',
  },
  {
    code: 404,
    name: 'Not Found',
    category: '客户端错误',
    summary: '资源不存在',
    advice: '避免泄漏资源是否存在，敏感场景用 404 代替 403',
  },
  {
    code: 405,
    name: 'Method Not Allowed',
    category: '客户端错误',
    summary: '方法不被支持',
    advice: '响应需带 Allow 头列出可用方法',
  },
  {
    code: 406,
    name: 'Not Acceptable',
    category: '客户端错误',
    summary: '无法满足 Accept 头要求',
    advice: '检查服务端支持的表示类型',
  },
  {
    code: 407,
    name: 'Proxy Authentication Required',
    category: '客户端错误',
    summary: '需要代理认证',
    advice: '返回 Proxy-Authenticate 头',
  },
  {
    code: 408,
    name: 'Request Timeout',
    category: '客户端错误',
    summary: '服务端等待请求超时',
    advice: '客户端应支持重试与幂等',
  },
  {
    code: 409,
    name: 'Conflict',
    category: '客户端错误',
    summary: '与当前资源状态冲突',
    advice: '并发编辑场景返回冲突详情供客户端合并',
  },
  {
    code: 410,
    name: 'Gone',
    category: '客户端错误',
    summary: '资源已永久删除',
    advice: '比 404 更明确地表达「不会恢复」',
  },
  {
    code: 411,
    name: 'Length Required',
    category: '客户端错误',
    summary: '缺少 Content-Length',
    advice: '服务端要求明确正文长度',
  },
  {
    code: 412,
    name: 'Precondition Failed',
    category: '客户端错误',
    summary: 'If-Match 等前置条件不满足',
    advice: '乐观锁与条件请求的标准机制',
  },
  {
    code: 413,
    name: 'Content Too Large',
    category: '客户端错误',
    summary: '请求体过大',
    advice: '过去称 Payload Too Large；上传需分片',
  },
  {
    code: 414,
    name: 'URI Too Long',
    category: '客户端错误',
    summary: '请求 URI 过长',
    advice: '长参数应改用 POST 正文',
  },
  {
    code: 415,
    name: 'Unsupported Media Type',
    category: '客户端错误',
    summary: '媒体类型不受支持',
    advice: '返回 415 并说明支持的类型',
  },
  {
    code: 416,
    name: 'Range Not Satisfiable',
    category: '客户端错误',
    summary: 'Range 超出资源范围',
    advice: '返回 Content-Range: */length',
  },
  {
    code: 417,
    name: 'Expectation Failed',
    category: '客户端错误',
    summary: 'Expect 头无法满足',
    advice: '校验 Expect: 100-continue 是否允许',
  },
  {
    code: 418,
    name: "I'm a teapot",
    category: '客户端错误',
    summary: '彩蛋状态码',
    advice: '来自 RFC 2324，不要用于生产',
  },
  {
    code: 421,
    name: 'Misdirected Request',
    category: '客户端错误',
    summary: '请求被发往无法处理它的服务器',
    advice: '多域名与 HTTP/2 连接复用场景',
  },
  {
    code: 422,
    name: 'Unprocessable Content',
    category: '客户端错误',
    summary: '语法正确但语义无法处理',
    advice: '表单校验失败的标准选择',
  },
  { code: 423, name: 'Locked', category: '客户端错误', summary: '资源被锁定', advice: 'WebDAV 场景' },
  {
    code: 424,
    name: 'Failed Dependency',
    category: '客户端错误',
    summary: '前置请求失败导致本请求失败',
    advice: '批量操作时定位失败项',
  },
  { code: 425, name: 'Too Early', category: '客户端错误', summary: '请求重放过早', advice: 'TLS 1.3 0-RTT 防重放' },
  {
    code: 426,
    name: 'Upgrade Required',
    category: '客户端错误',
    summary: '需要升级协议',
    advice: '返回 Upgrade 头提示客户端',
  },
  {
    code: 428,
    name: 'Precondition Required',
    category: '客户端错误',
    summary: '要求先发送条件头',
    advice: '防止丢失更新',
  },
  {
    code: 429,
    name: 'Too Many Requests',
    category: '客户端错误',
    summary: '触发限流',
    advice: '响应需带 Retry-After，客户端应退避重试',
  },
  {
    code: 431,
    name: 'Request Header Fields Too Large',
    category: '客户端错误',
    summary: '请求头过大',
    advice: '限制 Cookie 体积是常见诱因',
  },
  {
    code: 451,
    name: 'Unavailable For Legal Reasons',
    category: '客户端错误',
    summary: '因法律原因不可用',
    advice: '可附上引用链接说明原因',
  },
  {
    code: 499,
    name: 'Client Closed Request',
    category: '客户端错误',
    summary: 'nginx 私有扩展：客户端在服务端响应前主动断开',
    advice: '不是真实响应码，只出现在服务端日志；多为用户取消或超时',
  },
  // 5xx
  {
    code: 500,
    name: 'Internal Server Error',
    category: '服务端错误',
    summary: '服务器内部错误',
    advice: '不要向客户端暴露堆栈，告警并记录详细日志',
  },
  {
    code: 501,
    name: 'Not Implemented',
    category: '服务端错误',
    summary: '功能尚未实现',
    advice: '方法不支持时也可用此码',
  },
  {
    code: 502,
    name: 'Bad Gateway',
    category: '服务端错误',
    summary: '上游服务返回无效响应',
    advice: '检查网关与上游连通性、超时配置',
  },
  {
    code: 503,
    name: 'Service Unavailable',
    category: '服务端错误',
    summary: '服务暂时不可用',
    advice: '维护或过载；响应需带 Retry-After',
  },
  {
    code: 504,
    name: 'Gateway Timeout',
    category: '服务端错误',
    summary: '等待上游响应超时',
    advice: '排查慢查询与超时配置',
  },
  {
    code: 505,
    name: 'HTTP Version Not Supported',
    category: '服务端错误',
    summary: '不支持请求的 HTTP 版本',
    advice: '确认协议协商配置',
  },
  {
    code: 506,
    name: 'Variant Also Negotiates',
    category: '服务端错误',
    summary: '内容协商产生循环',
    advice: '配置错误，需修复服务端',
  },
  {
    code: 507,
    name: 'Insufficient Storage',
    category: '服务端错误',
    summary: '存储空间不足',
    advice: 'WebDAV 场景，需清理或扩容',
  },
  { code: 508, name: 'Loop Detected', category: '服务端错误', summary: '服务器陷入循环', advice: 'WebDAV 同步场景' },
  { code: 510, name: 'Not Extended', category: '服务端错误', summary: '需进一步扩展才能满足', advice: '保留状态码' },
  {
    code: 511,
    name: 'Network Authentication Required',
    category: '服务端错误',
    summary: '需要网络认证（如拦截式门户）',
    advice: '企业网络与 CDN 场景',
  },
  // CDN / 网关私有扩展（Cloudflare 等）
  {
    code: 520,
    name: 'Web Server Returned an Unknown Error',
    category: '服务端错误',
    summary: 'CDN 扩展：源站返回了无法识别的响应',
    advice: '常见于源站返回空响应或被 WAF 拦截，需查源站日志',
  },
  {
    code: 521,
    name: 'Web Server Is Down',
    category: '服务端错误',
    summary: 'CDN 扩展：CDN 无法连接源站',
    advice: '检查源站是否宕机、防火墙是否放行 CDN 回源 IP',
  },
  {
    code: 522,
    name: 'Connection Timed Out',
    category: '服务端错误',
    summary: 'CDN 扩展：连接源站超时',
    advice: '排查源站负载、跨境链路与回源超时配置',
  },
  {
    code: 523,
    name: 'Origin Is Unreachable',
    category: '服务端错误',
    summary: 'CDN 扩展：源站不可达（DNS 失败或拒绝连接）',
    advice: '确认 DNS 解析、回源 Host 与端口配置',
  },
  {
    code: 524,
    name: 'A Timeout Occurred',
    category: '服务端错误',
    summary: 'CDN 扩展：源站未在限定时间内返回首字节',
    advice: '常见于慢查询；与 504 类似但由 CDN 层判定',
  },
  {
    code: 525,
    name: 'SSL Handshake Failed',
    category: '服务端错误',
    summary: 'CDN 扩展：与源站的 TLS 握手失败',
    advice: '检查证书链、SNI、TLS 版本与加密套件',
  },
  {
    code: 526,
    name: 'Invalid SSL Certificate',
    category: '服务端错误',
    summary: 'CDN 扩展：源站证书无效',
    advice: '证书过期或域名不匹配，纯服务端问题',
  },
  {
    code: 527,
    name: 'Railgun Error',
    category: '服务端错误',
    summary: 'CDN 扩展：Railgun 隧道错误',
    advice: 'Cloudflare 专属，重试无效，需检查隧道配置',
  },
];

const BY_CODE = new Map(STATUS_ENTRIES.map((entry) => [entry.code, entry]));

export function findStatus(code: number): StatusEntry | undefined {
  return BY_CODE.get(code);
}

const CLASS_CATEGORY: Record<number, StatusCategory> = {
  1: '信息',
  2: '成功',
  3: '重定向',
  4: '客户端错误',
  5: '服务端错误',
};

/** 未收录的码按首位归类，并提示用户查询 RFC 6585 与 IANA 注册表。 */
export function lookupStatus(input: number): { entry: StatusEntry; fallback: boolean } | null {
  const known = BY_CODE.get(input);
  if (known) return { entry: known, fallback: false };
  if (!Number.isInteger(input) || input < 100 || input > 599) return null;
  const category = CLASS_CATEGORY[Math.floor(input / 100)] ?? '未分配';
  return {
    entry: {
      code: input,
      name: '未收录',
      category,
      summary: category === '未分配' ? '不在 100-599 范围内' : `${category}类别中的未收录状态码`,
      advice: '查阅 IANA Status Code Registry 或 RFC 6585 / RFC 4918 补充定义',
    },
    fallback: true,
  };
}

export function searchStatuses(query: string): StatusEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return STATUS_ENTRIES;
  return STATUS_ENTRIES.filter(
    (entry) =>
      String(entry.code).includes(q) ||
      entry.name.toLowerCase().includes(q) ||
      entry.category.includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      entry.advice.toLowerCase().includes(q),
  );
}

/** 客户端语义标签，用于「按语义筛选」与处理建议的高亮。 */
export type StatusSemantic = 'retry' | 'retry-careful' | 'no-retry' | 'auth' | 'fix-request' | 'client-closed';

export interface StatusSemanticMeta {
  id: StatusSemantic;
  label: string;
  description: string;
  /** 对应 UI 的语义色调。 */
  tone: 'success' | 'warn' | 'danger' | 'info';
}

export const STATUS_SEMANTICS: StatusSemanticMeta[] = [
  {
    id: 'retry',
    label: '可重试',
    description: '同请求再来一次大概率成功，但仍应配合指数退避与幂等键',
    tone: 'success',
  },
  {
    id: 'retry-careful',
    label: '需谨慎重试',
    description: '可能已部分生效，重试前先确认上一次是否已经写入',
    tone: 'warn',
  },
  {
    id: 'no-retry',
    label: '不可重试',
    description: '重试无意义，必须改代码、换配置或等待服务端发布',
    tone: 'danger',
  },
  { id: 'auth', label: '需要认证', description: '凭证缺失、过期或权限不足，需要重新登录或申请授权', tone: 'warn' },
  { id: 'fix-request', label: '需修改请求', description: '请求本身有问题：参数、方法、头或正文需要调整', tone: 'info' },
  {
    id: 'client-closed',
    label: '客户端提前断开',
    description: '请求尚未拿到响应就中断，通常出现在服务端日志而非客户端',
    tone: 'info',
  },
];

const SEMANTIC_TABLE: Record<number, StatusSemantic[]> = {
  100: ['no-retry'],
  101: ['no-retry'],
  102: ['retry-careful'],
  103: ['no-retry'],
  201: ['fix-request'],
  202: ['retry-careful'],
  204: ['no-retry'],
  205: ['no-retry'],
  206: ['retry-careful'],
  300: ['fix-request'],
  301: ['fix-request'],
  305: ['no-retry'],
  308: ['fix-request'],
  400: ['fix-request'],
  401: ['auth', 'fix-request'],
  402: ['no-retry'],
  403: ['auth', 'no-retry'],
  404: ['no-retry', 'fix-request'],
  405: ['fix-request'],
  406: ['fix-request'],
  407: ['auth'],
  408: ['retry', 'retry-careful'],
  409: ['fix-request'],
  410: ['no-retry'],
  411: ['fix-request'],
  412: ['fix-request'],
  413: ['fix-request'],
  414: ['fix-request'],
  415: ['fix-request'],
  416: ['fix-request'],
  417: ['fix-request'],
  418: ['no-retry'],
  421: ['retry', 'retry-careful'],
  422: ['fix-request'],
  423: ['retry'],
  424: ['retry'],
  425: ['retry-careful'],
  426: ['fix-request'],
  428: ['fix-request'],
  429: ['retry', 'retry-careful'],
  431: ['fix-request'],
  451: ['no-retry'],
  499: ['retry', 'client-closed'],
  500: ['retry', 'retry-careful'],
  501: ['no-retry'],
  502: ['retry', 'retry-careful'],
  503: ['retry', 'retry-careful'],
  504: ['retry', 'retry-careful'],
  505: ['no-retry'],
  506: ['no-retry'],
  507: ['retry'],
  508: ['no-retry'],
  510: ['no-retry'],
  511: ['auth'],
  520: ['retry', 'retry-careful'],
  521: ['no-retry'],
  522: ['retry', 'retry-careful'],
  523: ['retry'],
  524: ['retry', 'retry-careful'],
  525: ['no-retry'],
  526: ['no-retry'],
  527: ['no-retry'],
};

/** 状态码的语义标签；未登记的状态码按类别推导默认标签。 */
export function statusSemantics(code: number): StatusSemantic[] {
  const known = SEMANTIC_TABLE[code];
  if (known) return known;
  if (code >= 500) return ['retry', 'retry-careful'];
  if (code >= 400) return ['fix-request'];
  return [];
}

export function filterStatuses(options: {
  category?: StatusCategory | '全部';
  semantics?: StatusSemantic | null;
  query?: string;
}): StatusEntry[] {
  const { category = '全部', semantics = null, query = '' } = options;
  const q = query.trim().toLowerCase();
  return STATUS_ENTRIES.filter((entry) => {
    if (category !== '全部' && entry.category !== category) return false;
    if (semantics && !statusSemantics(entry.code).includes(semantics)) return false;
    if (!q) return true;
    return (
      String(entry.code).includes(q) ||
      entry.name.toLowerCase().includes(q) ||
      entry.category.includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      entry.advice.toLowerCase().includes(q)
    );
  });
}

/** 状态码详情：含义、典型场景、触发原因、客户端处理与关联码。 */
export interface StatusDetail {
  meaning: string;
  scenario: string;
  causes: string[];
  handling: string[];
  idempotentNote: string;
  methodImpact: string;
  related: { code: number; note: string }[];
  example: string;
}

const DETAILS: Record<number, StatusDetail> = {
  200: {
    meaning: '请求已成功完成，响应中包含结果。',
    scenario: 'GET 返回资源、PUT 全量更新成功、DELETE 返回删除结果。',
    causes: ['正常业务返回', '缓存命中后由代理直接响应'],
    handling: [
      '按 Content-Type 解析响应体，注意 204 与 HEAD 请求没有正文',
      '即使 200 也可能出现业务级错误码，需按接口约定判断业务字段',
      '若正文不是预期内容，先检查是否被网关改写或返回了登录页 HTML',
    ],
    idempotentNote: 'GET/HEAD/PUT/DELETE 幂等；POST 不幂等，重试前必须确认上一次是否已成功写入。',
    methodImpact: 'GET 返回完整表示；POST 由应用决定返回新建实体还是操作结果；PUT 返回更新后的表示。',
    related: [
      { code: 201, note: '新建资源应返回 201 + Location，而不是 200' },
      { code: 204, note: '成功但无正文时用 204，不要返回空的 200' },
      { code: 206, note: 'Range 请求返回 206' },
    ],
    example:
      'HTTP/1.1 200 OK\nContent-Type: application/json; charset=utf-8\nContent-Length: 27\n\n{"ok":true,"id":1024}',
  },
  201: {
    meaning: '请求成功，且服务端创建了新资源。',
    scenario: 'POST /users 注册成功、POST /orders 下单成功。',
    causes: ['资源创建成功', '异步创建已受理'],
    handling: [
      '应携带 Location 头指向新资源 URI，部分框架还返回新资源 JSON',
      '后续更新/查询使用 Location 而不是自己拼 URL',
      '若同时返回 Set-Cookie 或令牌，注意一并保存',
    ],
    idempotentNote: 'POST 非幂等：网络超时后重试可能创建重复资源，需服务端支持幂等键（Idempotency-Key）。',
    methodImpact: '主要由 POST 返回；PUT 语义上是覆盖已有资源，不应返回 201。',
    related: [
      { code: 202, note: '只是受理、稍后完成用 202' },
      { code: 200, note: '很多实现偷懒返回 200，缺少 Location' },
      { code: 409, note: '唯一约束冲突时返回 409' },
    ],
    example: 'HTTP/1.1 201 Created\nLocation: /users/1024\nContent-Type: application/json\n\n{"id":1024,"name":"amy"}',
  },
  202: {
    meaning: '请求已被接受，但处理尚未完成。',
    scenario: '批量导入、异步生成报表、发送邮件等耗时任务。',
    causes: ['任务进入队列', '异步 worker 尚未产出结果'],
    handling: [
      '配合状态查询接口轮询，或用 WebSocket/推送订阅完成通知',
      '读取 Retry-After 或服务端给出的建议轮询间隔',
      '不要把 202 当作「已完成」，否则会读到半成品数据',
    ],
    idempotentNote: '受理动作应保证幂等（同一任务 ID 重复提交不重复排队），否则轮询式重试会产生重复任务。',
    methodImpact: 'POST 为主；202 的响应体通常只包含任务 ID。',
    related: [
      { code: 200, note: '同步返回最终结果时用 200' },
      { code: 503, note: '队列不可用时用 503 + Retry-After' },
    ],
    example: 'HTTP/1.1 202 Accepted\nLocation: /jobs/9f2c\nRetry-After: 5\n\n{"jobId":"9f2c","status":"queued"}',
  },
  204: {
    meaning: '处理成功，但没有响应正文。',
    scenario: 'DELETE 成功、偏好更新成功、埋点上报。',
    causes: ['资源删除完成', '操作无返回内容'],
    handling: [
      '不要尝试解析正文，fetch 中 resp.text() 会得到空串',
      '若接口本应返回 JSON 却返回 204，说明服务端实现与文档不一致',
    ],
    idempotentNote: 'DELETE 幂等：重复删除一般仍返回 204。',
    methodImpact: 'PUT/DELETE 最常用；POST 也可返回 204 表示无返回体。',
    related: [
      { code: 200, note: '带内容的结果不要用 204' },
      { code: 304, note: '304 是缓存协商结果，同样没有正文' },
    ],
    example: 'HTTP/1.1 204 No Content\nCache-Control: no-store\n\n',
  },
  206: {
    meaning: '只返回了请求范围内的部分内容。',
    scenario: '断点续传、视频拖动进度条、Range 下载。',
    causes: ['客户端带 Range 头', '服务端支持分段响应'],
    handling: [
      '检查 Content-Range 与 Content-Length 拼接分片',
      '断点续传要用 If-Range 配合 ETag，避免拼接到不一致的版本',
      '返回 416 时说明请求范围越界，改用完整请求',
    ],
    idempotentNote: 'GET 幂等，分段下载应可安全重试。',
    methodImpact: '仅 GET/HEAD 有意义。',
    related: [
      { code: 416, note: '范围非法时返回 416 并带 Content-Range: */length' },
      { code: 304, note: '配合 If-None-Match 协商缓存' },
    ],
    example:
      'HTTP/1.1 206 Partial Content\nContent-Range: bytes 0-1023/8192\nAccept-Ranges: bytes\nContent-Length: 1024\n\n<1024 字节数据>',
  },
  301: {
    meaning: '资源已永久迁移到新 URL。',
    scenario: '域名更换、HTTP 跳 HTTPS 前的规范化、路径重构。',
    causes: ['站点改版迁移', '强制 HTTPS 迁移前的过渡方案'],
    handling: [
      '浏览器与 SDK 通常会自动跟随并缓存跳转结果',
      '更新代码与文档中的硬编码 URL，避免每次都吃一次 301',
      '确认是否保留原方法：老实现会把 POST 降级为 GET',
    ],
    idempotentNote: '跳转本身幂等；但若被降级成 GET 的 POST 被重试，副作用可能只执行一次也可能丢失，务必改用 308。',
    methodImpact: 'RFC 允许服务端保留原方法，但历史上大量客户端/框架按 302 处理，会把 POST 变 GET。',
    related: [
      { code: 302, note: '临时跳转，不会被缓存' },
      { code: 307, note: '临时跳转且严格保留方法与正文' },
      { code: 308, note: '永久跳转且严格保留方法与正文，301 的安全版' },
    ],
    example: 'HTTP/1.1 301 Moved Permanently\nLocation: https://example.com/new\nCache-Control: max-age=31536000\n\n',
  },
  302: {
    meaning: '临时跳转到另一个 URL。',
    scenario: '登录后跳回原页面、OAuth 授权入口、未登录拦截。',
    causes: ['鉴权拦截', 'A/B 分流', '短链跳转'],
    handling: [
      '注意 302 没有对方法做规范，浏览器实际会把 POST 改写为 GET',
      '表单提交后跳结果页建议用 303 或 PRG 模式，避免重复提交',
      '拦截跳转时注意原始请求是否被丢弃（body 无法重用）',
    ],
    idempotentNote: '不可用于需要保留 POST 正文的场景；重试前要确认重定向后的请求是否已执行。',
    methodImpact: '实践中 POST 常被降级为 GET，导致后端收不到正文。',
    related: [
      { code: 301, note: '永久版' },
      { code: 303, note: '强制 GET' },
      { code: 307, note: '保持方法与正文' },
    ],
    example: 'HTTP/1.1 302 Found\nLocation: /login?next=%2Fdashboard\nSet-Cookie: redirect=/dashboard; Path=/\n\n',
  },
  303: {
    meaning: '请用 GET 请求访问 Location 指向的地址。',
    scenario: 'POST 提交成功后跳转到结果页（Post/Redirect/Get）。',
    causes: ['PRG 模式避免刷新重复提交', '跨站提交后跳转'],
    handling: ['跟随跳转后发起的是 GET，不要期待原 POST 的响应体', '若需要提交结果，通过 session/flash 或查询参数传递'],
    idempotentNote: '适用于「POST 已经执行完」的跳转，重定向后的 GET 幂等。',
    methodImpact: '明确要求客户端改用 GET，POST 正文会被丢弃。',
    related: [
      { code: 302, note: '语义更弱，实现上常常一样' },
      { code: 307, note: '保留方法的临时跳转' },
    ],
    example: 'HTTP/1.1 303 See Other\nLocation: /orders/8891\n\n',
  },
  304: {
    meaning: '缓存仍然新鲜，不返回正文。',
    scenario: '带 If-None-Match / If-Modified-Since 的条件请求。',
    causes: ['ETag 命中', 'Last-Modified 未变化'],
    handling: [
      '直接复用本地缓存副本，不要把 304 当作错误',
      '304 响应里不能带正文，只允许更新缓存元数据（ETag/Last-Modified）',
      '浏览器 DevTools 中 304 不计入传输体积，属正常现象',
    ],
    idempotentNote: 'GET 幂等，可放心重放。',
    methodImpact: 'GET/HEAD 才有意义。',
    related: [
      { code: 200, note: '缓存失效时的正常响应' },
      { code: 206, note: 'Range 请求不会返回 304' },
    ],
    example: 'HTTP/1.1 304 Not Modified\nETag: "a1b2c3"\nCache-Control: max-age=0, must-revalidate\n\n',
  },
  307: {
    meaning: '临时跳转，并严格保留原请求方法与正文。',
    scenario: 'HTTP 强制升级 HTTPS、表单跳转到另一域名的临时迁移。',
    causes: ['传输安全策略', '灰度迁移临时跳转'],
    handling: ['确认代理与客户端都保留方法与正文', '重定向目标必须同样支持原方法'],
    idempotentNote: '保留方法意味着 POST 的副作用语义不变，重试前仍需幂等保护。',
    methodImpact: 'POST/PUT 等方法与正文原样重放到新地址。',
    related: [
      { code: 302, note: '方法可能被降级' },
      { code: 308, note: '永久版' },
    ],
    example: 'HTTP/1.1 307 Temporary Redirect\nLocation: https://example.com/submit\n\n（正文原样转发）',
  },
  308: {
    meaning: '永久跳转，并严格保留原请求方法与正文。',
    scenario: 'API 域名永久更名、旧接口永久下线到新接口。',
    causes: ['接口重构', '永久 HTTPS 迁移'],
    handling: ['客户端缓存跳转结果，避免每次多一跳', 'SDK/网关需显式支持 308 才能保留方法'],
    idempotentNote: 'POST 重试风险同 307，需幂等键兜底。',
    methodImpact: '与 307 相同，方法与正文保留。',
    related: [
      { code: 301, note: '301 的语义安全版本' },
      { code: 307, note: '临时版' },
    ],
    example: 'HTTP/1.1 308 Permanent Redirect\nLocation: https://api.example.com/v2/orders\n\n',
  },
  400: {
    meaning: '请求语法错误或参数非法，服务端无法理解。',
    scenario: 'JSON 解析失败、缺少必填字段、类型不匹配、URL 查询串拼错。',
    causes: ['前端未做校验就提交', '后端字段改名未同步', '编码或时间格式不匹配'],
    handling: [
      '按返回的字段级错误信息修正请求，不要原样重试',
      '在开发环境记录完整请求体/查询串用于比对',
      '补齐 schema 校验（前后端共享校验规则）',
    ],
    idempotentNote: 'GET 幂等但请求本身错误，重试无意义。',
    methodImpact: '任何方法都可能返回 400。',
    related: [
      { code: 422, note: '语法正确但语义不合法，更适合表单校验' },
      { code: 415, note: 'Content-Type 不支持' },
      { code: 405, note: '方法不允许' },
    ],
    example:
      'HTTP/1.1 400 Bad Request\nContent-Type: application/json\n\n{"error":"invalid_request","field":"email","message":"邮箱格式不正确"}',
  },
  401: {
    meaning: '请求缺少有效身份凭证（未认证）。',
    scenario: '未带 Authorization、Access Token 过期或被吊销。',
    causes: ['未登录', '令牌过期', '刷新令牌失效', '密钥轮换'],
    handling: [
      '读取 WWW-Authenticate 头判断是 Bearer 还是 Basic/Digest',
      '尝试用 refresh_token 换取新令牌；失败则引导重新登录',
      '并发 401 时要做刷新去重，避免多个请求同时刷新互相顶掉',
      '重试要区分读写：只对安全请求自动重放，POST 需业务确认',
    ],
    idempotentNote:
      'GET/HEAD 可直接重放；POST/写入类请求应先确认上一次是否已被服务端处理（部分服务在鉴权前就已解析并落库）。',
    methodImpact: '所有方法都适用；部分网关对 POST 会返回 403 以避免 CSRF。',
    related: [
      { code: 403, note: '已认证但无权限' },
      { code: 407, note: '需要的是代理认证' },
      { code: 403, note: '有些云厂商用 403 表达凭证无效' },
    ],
    example:
      'HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer realm="api", error="invalid_token"\n\n{"error":"token expired"}',
  },
  403: {
    meaning: '身份已知，但没有访问该资源的权限。',
    scenario: '越权访问他人数据、缺少所需 scope、CORS 被拒、IP 白名单未放行。',
    causes: ['角色/权限不足', '资源归属校验失败', '防火墙或 WAF 拦截', 'IP 不在白名单'],
    handling: [
      '不要盲目重试，先确认当前身份与所需权限',
      'CORS 被拒时错误在浏览器控制台而非业务代码，需后端补 Access-Control-Allow-Origin',
      '向用户展示「无权限」而不是「登录失效」，避免误导',
    ],
    idempotentNote: '重试无意义，属于永久失败。',
    methodImpact: '与 401 一样对所有方法适用。',
    related: [
      { code: 401, note: '身份未验证' },
      { code: 404, note: '敏感资源常用 404 隐藏存在性' },
      { code: 429, note: '有权限但被限流' },
    ],
    example:
      'HTTP/1.1 403 Forbidden\nContent-Type: application/json\n\n{"error":"insufficient_scope","required":"reports:read"}',
  },
  404: {
    meaning: '服务端找不到对应资源。',
    scenario: 'URL 拼错、资源已删除、ID 不存在、静态资源路径变更。',
    causes: ['前端路由未命中后端路由', '资源被删除或迁移', '带尾斜杠差异', '反代路径前缀错误'],
    handling: [
      '先确认 URL 拼写、大小写与尾斜杠；再确认资源是否真的存在',
      '对可恢复资源展示 404 页面并提供返回入口',
      '敏感资源用 404 而非 403 隐藏存在性',
    ],
    idempotentNote: 'GET 幂等但不会成功，重试无意义。',
    methodImpact: '任何方法都可能返回；PUT/POST 打到不存在的资源路径在 REST 语义下应由服务端返回 404。',
    related: [
      { code: 410, note: '明确表示永久删除' },
      { code: 403, note: '存在但无权访问' },
      { code: 405, note: '路径存在但方法不支持，常见于框架路由顺序问题' },
    ],
    example: 'HTTP/1.1 404 Not Found\nContent-Type: application/json\n\n{"error":"not_found","resource":"user:1024"}',
  },
  405: {
    meaning: '服务器理解请求方法，但目标资源不支持该方法。',
    scenario: '对只读接口发 POST、静态资源收到 PUT、框架路由只注册了 GET。',
    causes: ['客户端调错方法', '前后端约定不一致', '反向代理只转发特定方法'],
    handling: [
      '读取 Allow 头，改为允许的方法',
      '检查前端是否误把 DELETE 当 POST 用',
      '若 Allow 头缺失，说明服务端实现不标准，可向服务端反馈',
    ],
    idempotentNote: '请求根本没进入业务逻辑，重试无意义。',
    methodImpact: '该码本身就是关于方法的说明。',
    related: [
      { code: 501, note: '方法在服务器全局未实现' },
      { code: 404, note: '路径错误导致的假象' },
    ],
    example: 'HTTP/1.1 405 Method Not Allowed\nAllow: GET, HEAD, OPTIONS\n\n{"error":"method_not_allowed"}',
  },
  408: {
    meaning: '服务端等待客户端发送完整请求超时。',
    scenario: '慢速网络下上传大文件、客户端长时间未发完请求头或正文。',
    causes: ['网络拥塞', '客户端上传过慢', '反向代理读超时配置过短'],
    handling: ['退避后重试；上传类请求应支持断点续传（配合 206/416）', '超大文件改用分片上传或直传对象存储'],
    idempotentNote: '请求可能只被服务端收到一部分，重试通常安全；带副作用的请求仍建议幂等键。',
    methodImpact: 'POST/PUT 上传最容易触发。',
    related: [
      { code: 504, note: '服务端等上游超时，方向相反' },
      { code: 499, note: '客户端先断开，服务端日志里常见' },
      { code: 413, note: '正文过大是另一个方向的问题' },
    ],
    example: 'HTTP/1.1 408 Request Timeout\nConnection: close\n\n（服务端等待请求体超时）',
  },
  409: {
    meaning: '请求与资源当前状态冲突。',
    scenario: '乐观锁版本冲突、唯一键重复、并发编辑同一记录。',
    causes: ['两个请求同时修改', '重复提交', '状态机不允许当前转移'],
    handling: [
      '重新拉取最新数据，让用户合并后再提交',
      '唯一键冲突时提示「已存在」，必要时跳转去查看',
      '有限次重试（例如带退避重试 2~3 次）后仍失败要人工介入',
    ],
    idempotentNote: '冲突说明上一次没有生效，重试是安全的，但必须先读取最新状态。',
    methodImpact: 'POST（创建）、PUT/PATCH（更新）、DELETE（状态机）常见。',
    related: [
      { code: 412, note: 'If-* 条件不满足，与乐观锁强相关' },
      { code: 428, note: '服务端要求先带条件头' },
      { code: 428, note: '与 412 成对使用' },
    ],
    example:
      'HTTP/1.1 409 Conflict\nContent-Type: application/json\n\n{"error":"version_conflict","current":7,"yourBase":5}',
  },
  410: {
    meaning: '资源已被永久删除且不会恢复。',
    scenario: 'GDPR 删除请求、用户注销、内容下架。',
    causes: ['按合规要求彻底删除', '业务主动永久移除'],
    handling: ['不要再重试，也不要缓存该地址', '引导用户到替代页面或说明内容已下架'],
    idempotentNote: '永久失败，重试无意义。',
    methodImpact: '任意方法。',
    related: [{ code: 404, note: '404 表示「当前不存在」，410 表示「曾经存在且不会回来」' }],
    example: 'HTTP/1.1 410 Gone\nContent-Type: text/plain; charset=utf-8\n\n该资源已被删除',
  },
  412: {
    meaning: '请求的前置条件不成立。',
    scenario: 'If-Match / If-Unmodified-Since 校验失败，典型是乐观锁。',
    causes: ['资源已被他人修改', 'ETag 不匹配', '时间戳条件不满足'],
    handling: ['重新获取资源的 ETag 与最新内容，让用户合并后带新 ETag 重提', '把 412 当成「需要重新同步」而不是错误'],
    idempotentNote: '重试必须先刷新条件，否则会一直 412。',
    methodImpact: 'PUT/PATCH/DELETE 最常见。',
    related: [
      { code: 409, note: '冲突语义相近，412 更条件化' },
      { code: 428, note: '服务端要求必须带条件头' },
    ],
    example: 'HTTP/1.1 412 Precondition Failed\nETag: "v9"\n\n（客户端携带的 If-Match 为 "v7"）',
  },
  413: {
    meaning: '请求正文过大，服务端拒绝接收。',
    scenario: '上传图片/视频超限、批量提交数据过多。',
    causes: ['客户端未分片', '上传大小限制配置较小', 'Base64 编码让体积膨胀约 33%'],
    handling: ['改为分片上传或直传对象存储后回调服务端', '前端先做体积校验，避免白白上传', '不要重试同样的大包'],
    idempotentNote: '请求未被处理，重试无意义。',
    methodImpact: 'POST/PUT 携带正文时常见。',
    related: [
      { code: 431, note: '请求头过大' },
      { code: 414, note: 'URL 过长，应改用正文传参' },
    ],
    example: 'HTTP/1.1 413 Content Too Large\nConnection: close\n\n（上传 2.5 GB，限制 1 GB）',
  },
  415: {
    meaning: '请求的媒体类型服务端不支持。',
    scenario: '上传 multipart 却只注册了 JSON、发送了 application/x-www-form-urlencoded。',
    causes: ['Content-Type 写错或缺失', '缺少 charset', '文件类型不在白名单'],
    handling: [
      '按服务端支持列表修正 Content-Type 与 Accept',
      '缺 charset 常导致解析失败，补上 charset=utf-8',
      '表单提交要带 enctype 对应的类型',
    ],
    idempotentNote: '未进入业务处理，重试无意义。',
    methodImpact: 'POST/PUT/PATCH 最常见。',
    related: [
      { code: 400, note: '媒体类型正确但正文格式错误' },
      { code: 406, note: '响应类型不被客户端接受' },
    ],
    example: 'HTTP/1.1 415 Unsupported Media Type\nAccept-Post: application/json\n\n{"error":"use application/json"}',
  },
  422: {
    meaning: '语法正确，但语义上无法处理。',
    scenario: '表单校验失败、邮箱格式不对、余额不足这类业务规则不满足。',
    causes: ['字段级校验未通过', '跨字段约束冲突', '业务规则不满足'],
    handling: [
      '按字段级错误高亮表单，不要整体报错',
      '422 是最推荐的表单校验状态码，比 400 更明确',
      '不要自动重试，必须修改输入',
    ],
    idempotentNote: '未写入数据，修正后重试是安全的。',
    methodImpact: 'POST/PUT/PATCH。',
    related: [
      { code: 400, note: '400 更偏语法/解析失败' },
      { code: 409, note: '与当前状态冲突时用 409' },
    ],
    example:
      'HTTP/1.1 422 Unprocessable Content\nContent-Type: application/json\n\n{"errors":[{"field":"password","code":"too_short"}]}',
  },
  429: {
    meaning: '请求过于频繁，被限流。',
    scenario: '接口 QPS 超限、令牌桶耗尽、突发流量被削峰。',
    causes: ['客户端轮询过密', '批量任务没做限速', '多用户共用同一出口 IP'],
    handling: [
      '读取 Retry-After 或 X-RateLimit-Reset 计算等待时间',
      '指数退避 + 抖动（jitter）重试，避免同步重试风暴',
      '批量任务主动串行化或改用服务端异步接口',
      '对非幂等请求务必使用幂等键后再重试',
    ],
    idempotentNote: '部分网关在限流前已经执行了写操作，重试非幂等请求可能造成重复数据。',
    methodImpact: '所有方法；写操作更需要注意限流窗口。',
    related: [
      { code: 503, note: '服务端过载，需带 Retry-After' },
      { code: 402, note: '按额度付费的 API 常把配额耗尽表达为 429' },
    ],
    example:
      'HTTP/1.1 429 Too Many Requests\nRetry-After: 30\nRateLimit-Limit: 100\nRateLimit-Remaining: 0\nRateLimit-Reset: 30\n\n{"error":"rate_limit_exceeded"}',
  },
  499: {
    meaning: 'nginx 私有扩展：客户端在服务端返回响应之前就断开了连接。',
    scenario: '用户关闭页面、浏览器取消请求、客户端超时主动 abort。',
    causes: ['用户操作取消', 'fetch 的 AbortController', '客户端超时比服务端短'],
    handling: [
      '它只会出现在服务端日志，客户端不会收到该状态码',
      '日志里 499 比例高说明客户端超时/取消太多，需要对齐两端超时',
      '不要把它当成服务端错误统计',
    ],
    idempotentNote: '请求可能已在服务端执行；客户端取消后重试写操作需幂等保护。',
    methodImpact: '任意方法。',
    related: [
      { code: 502, note: '502 是服务端侧记录的错误' },
      { code: 408, note: '服务端主动等待超时' },
    ],
    example: '（仅服务端访问日志中可见）\n499 0.001 - - client_closed_request',
  },
  500: {
    meaning: '服务端内部未处理异常。',
    scenario: '未捕获异常、数据库连接失败、代码空指针。',
    causes: ['代码缺陷', '依赖不可用', '配置缺失', '数据异常'],
    handling: [
      '记录 request-id / trace-id，联系后端查服务端日志',
      'GET 类请求可退避重试；写请求先确认是否已落库',
      '前端展示通用错误页，不要泄露服务端堆栈',
    ],
    idempotentNote: '写请求可能已部分执行，重试需幂等键；GET 可安全重试。',
    methodImpact: '所有方法都可能。',
    related: [
      { code: 502, note: '上游服务异常' },
      { code: 503, note: '服务暂不可用（可明确重试）' },
      { code: 502, note: '与 504 的区别是 502 表示无效响应' },
    ],
    example:
      'HTTP/1.1 500 Internal Server Error\nContent-Type: application/json\nX-Request-Id: 8f1c\n\n{"error":"internal_error","requestId":"8f1c"}',
  },
  502: {
    meaning: '网关/代理从上游收到了无效响应。',
    scenario: 'Nginx 前面的 Java 服务崩了、上游返回了非法 HTTP 报文。',
    causes: ['上游进程重启或崩溃', '上游端口未监听', '协议不匹配', '连接被重置'],
    handling: [
      '检查上游服务健康状态与反代 error_log',
      'GET 可退避重试；写请求先确认是否已被上游处理',
      '结合熔断降级返回兜底数据',
    ],
    idempotentNote: '同 500：上游可能已经执行了写操作。',
    methodImpact: '所有方法。',
    related: [
      { code: 504, note: '504 是上游太慢，502 是上游响应异常' },
      { code: 503, note: '上游主动不可用' },
      { code: 521, note: 'CDN 版本的「连不上源站」' },
    ],
    example: 'HTTP/1.1 502 Bad Gateway\nServer: nginx\n\n<html><head><title>502 Bad Gateway</title></head></html>',
  },
  503: {
    meaning: '服务暂时不可用，通常正在维护或过载。',
    scenario: '滚动发布、维护窗口、连接池耗尽、熔断打开。',
    causes: ['计划内维护', '流量过载', '依赖数据库不可用', '健康检查全部失败'],
    handling: [
      '读取 Retry-After 后退避重试，这是最「该重试」的 5xx',
      '配合客户端熔断，避免持续压垮服务端',
      '给用户展示「稍后重试」并保留表单内容',
    ],
    idempotentNote: '通常请求未进入业务逻辑，重试安全；仍建议带幂等键。',
    methodImpact: '所有方法。',
    related: [
      { code: 429, note: '429 是主动限流，503 是被动不可用' },
      { code: 500, note: '500 是未预期异常' },
    ],
    example:
      'HTTP/1.1 503 Service Unavailable\nRetry-After: 120\nContent-Type: application/json\n\n{"error":"maintenance","until":"2026-01-01T02:00:00Z"}',
  },
  504: {
    meaning: '网关等待上游服务器响应超时。',
    scenario: '慢 SQL、复杂报表、上游服务处理超过网关读超时。',
    causes: ['上游处理慢', '数据库锁等待', '跨机房链路抖动', '超时配置过短'],
    handling: [
      '退避重试；同时让用户知道请求可能仍在服务端执行中',
      '长耗时接口应改为异步任务 + 轮询（202）',
      '上报耗时指标，区分是上游慢还是链路慢',
    ],
    idempotentNote: '超时不代表上游没执行，写请求必须用幂等键。',
    methodImpact: '所有方法。',
    related: [
      { code: 502, note: '502 无效响应，504 是没等到' },
      { code: 524, note: 'CDN 版的 504' },
      { code: 408, note: '服务端等客户端超时，方向相反' },
    ],
    example: 'HTTP/1.1 504 Gateway Timeout\nServer: nginx\n\n（等待上游 60s 无响应）',
  },
  511: {
    meaning: '需要网络层认证才能访问。',
    scenario: '企业 WiFi 门户、运营商劫持页、校园网认证。',
    causes: ['网络出口设备要求登录', 'CDN/防护误判为爬虫'],
    handling: [
      '这是网络环境问题，不应重试；提示用户切换网络',
      '自动化客户端可携带鉴权请求头或使用服务提供方的出口 IP 白名单',
    ],
    idempotentNote: '不适用（请求未到达应用）。',
    methodImpact: '所有方法。',
    related: [
      { code: 407, note: '407 是代理层认证' },
      { code: 401, note: '401 是应用层认证' },
    ],
    example: 'HTTP/1.1 511 Network Authentication Required\nContent-Type: text/html\n\n（请先完成网络认证）',
  },
  520: {
    meaning: 'CDN 私有扩展：源站返回了 CDN 无法识别的响应。',
    scenario: 'Cloudflare 回源时收到空响应、非 HTTP 响应或被 WAF 拦截的页面。',
    causes: ['源站进程异常但仍占用 80 端口', 'WAF 返回了自定义页面', '源站主动断连'],
    handling: ['只能联系源站运维检查日志', '客户端侧不可修复'],
    idempotentNote: '按 5xx 处理，退避重试。',
    methodImpact: '所有方法。',
    related: [{ code: 502, note: '语义相近，520 由 CDN 层产生' }],
    example: 'HTTP/1.1 520 Web Server Returned an Unknown Error\ncf-ray: 8a3f...\n\n',
  },
  521: {
    meaning: 'CDN 私有扩展：CDN 无法连接到源站。',
    scenario: '源站宕机、防火墙拦截回源 IP、端口关闭。',
    causes: ['源站服务未启动', '安全组未放行', '回源端口配置错误'],
    handling: ['纯服务端/网络问题，重试无意义', '联系源站运维或换源站'],
    idempotentNote: '请求未到源站，重试安全但无意义。',
    methodImpact: '所有方法。',
    related: [{ code: 523, note: '523 覆盖了 DNS 解析失败的情况' }],
    example: 'HTTP/1.1 521 Web Server Is Down\ncf-ray: 8a3f...\n\n',
  },
  522: {
    meaning: 'CDN 私有扩展：连接源站超时。',
    scenario: '跨境回源链路慢、源站防火墙丢包。',
    causes: ['网络抖动', '源站负载高', '跨境链路拥塞'],
    handling: ['退避重试；同时反馈给平台方', '长期方案是就近源站或优化链路'],
    idempotentNote: '写请求需幂等键。',
    methodImpact: '所有方法。',
    related: [{ code: 504, note: '504 是自建网关，522 是 CDN 层' }],
    example: 'HTTP/1.1 522 Connection Timed Out\ncf-ray: 8a3f...\n\n',
  },
  523: {
    meaning: 'CDN 私有扩展：源站不可达（DNS 解析失败或拒绝连接）。',
    scenario: '域名解析到错误 IP、源站端口未监听。',
    causes: ['DNS 记录变更未生效', '源站未启动', '回源 Host 配错'],
    handling: ['检查 DNS 与源站状态', '重试可缓解 DNS 抖动'],
    idempotentNote: '请求未到源站。',
    methodImpact: '所有方法。',
    related: [{ code: 521, note: '521 更偏向连接被拒绝' }],
    example: 'HTTP/1.1 523 Origin Is Unreachable\ncf-ray: 8a3f...\n\n',
  },
  524: {
    meaning: 'CDN 私有扩展：源站未在限定时间内返回首字节。',
    scenario: '源站慢查询或长耗时接口被 CDN 回源超时掐断。',
    causes: ['慢 SQL', '源站资源不足', '回源超时阈值过小'],
    handling: ['退避重试', '长耗时接口改为异步 + 轮询'],
    idempotentNote: '超时不代表未执行，写请求需幂等键。',
    methodImpact: '所有方法。',
    related: [{ code: 504, note: '语义几乎一致' }],
    example: 'HTTP/1.1 524 A Timeout Occurred\ncf-ray: 8a3f...\n\n',
  },
  525: {
    meaning: 'CDN 私有扩展：与源站的 TLS 握手失败。',
    scenario: '源站证书过期、TLS 版本或加密套件不兼容、SNI 配置错误。',
    causes: ['证书过期', '强制要求高版本 TLS', 'SNI 未匹配证书'],
    handling: ['纯服务端 TLS 配置问题，重试无意义', '用 SSL Labs 等工具验证源站配置'],
    idempotentNote: '请求未送达业务。',
    methodImpact: '所有方法。',
    related: [{ code: 526, note: '526 是证书本身无效' }],
    example: 'HTTP/1.1 525 SSL Handshake Failed\ncf-ray: 8a3f...\n\n',
  },
  526: {
    meaning: 'CDN 私有扩展：源站 SSL 证书无效。',
    scenario: '证书过期、域名不匹配、自签名证书。',
    causes: ['证书未续期', '证书 CN/SAN 不含该域名', '证书链不完整'],
    handling: ['更新证书并重启服务', '客户端侧无解'],
    idempotentNote: '请求未送达业务。',
    methodImpact: '所有方法。',
    related: [{ code: 525, note: '握手失败但证书本身可能有效' }],
    example: 'HTTP/1.1 526 Invalid SSL Certificate\ncf-ray: 8a3f...\n\n',
  },
  527: {
    meaning: 'CDN 私有扩展：Railgun 隧道错误。',
    scenario: '使用 Cloudflare Railgun 回源时隧道断开。',
    causes: ['Railgun 进程异常', '隧道配置冲突', '源站 IP 变更'],
    handling: ['Cloudflare 专属问题，需平台侧排查', '可临时切回 DNS 回源'],
    idempotentNote: '请求未送达业务。',
    methodImpact: '所有方法。',
    related: [{ code: 521, note: '521 是普通回源连不上' }],
    example: 'HTTP/1.1 527 Railgun Error\ncf-ray: 8a3f...\n\n',
  },
};

/** 状态码详情；未收录时返回 undefined，由 UI 用基础字段兜底展示。 */
export function getStatusDetail(code: number): StatusDetail | undefined {
  return DETAILS[code];
}

/** 是否收录了详情，用于 UI 判断是否需要展示兜底说明。 */
export function hasStatusDetail(code: number): boolean {
  return DETAILS[code] !== undefined;
}
