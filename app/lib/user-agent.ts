/** User-Agent 轻量解析：按 UA 字符串中的关键标记判断浏览器、系统与设备类型。 */

export interface ParsedUserAgent {
  browser: string;
  browserVersion: string;
  engine: string;
  os: string;
  osVersion: string;
  deviceType: string;
  deviceVendor: string | null;
  isMobile: boolean;
  isBot: boolean;
  isTablet: boolean;
  /** 命中爬虫规则时的爬虫名称。 */
  botName: string | null;
}

interface Rule {
  test: RegExp;
  browser: string;
  engine?: string;
}

const BROWSER_RULES: Rule[] = [
  { test: /Edg(?:e|A|iOS)?\/([\d.]+)/, browser: 'Edge', engine: 'Blink' },
  { test: /OPR\/([\d.]+)/, browser: 'Opera', engine: 'Blink' },
  { test: /SamsungBrowser\/([\d.]+)/, browser: 'Samsung Internet', engine: 'Blink' },
  { test: /YaBrowser\/([\d.]+)/, browser: 'Yandex Browser', engine: 'Blink' },
  { test: /UCBrowser\/([\d.]+)/, browser: 'UC Browser', engine: 'Blink' },
  { test: /Firefox\/([\d.]+)/, browser: 'Firefox', engine: 'Gecko' },
  { test: /FxiOS\/([\d.]+)/, browser: 'Firefox iOS', engine: 'WebKit' },
  { test: /CriOS\/([\d.]+)/, browser: 'Chrome iOS', engine: 'WebKit' },
  { test: /Chrome\/([\d.]+)/, browser: 'Chrome', engine: 'Blink' },
  { test: /Version\/([\d.]+).*Safari/, browser: 'Safari', engine: 'WebKit' },
  { test: /MSIE ([\d.]+)/, browser: 'Internet Explorer', engine: 'Trident' },
  { test: /Trident\/.*rv:([\d.]+)/, browser: 'Internet Explorer', engine: 'Trident' },
];

/** 具体爬虫规则必须排在通用规则之前，否则 Googlebot 会被「bot」先命中。 */
const BOT_RULES: { test: RegExp; name: string }[] = [
  { test: /Googlebot/i, name: 'Googlebot' },
  { test: /Google-InspectionTool/i, name: 'Google 站点检查' },
  { test: /bingbot/i, name: 'Bingbot' },
  { test: /Baiduspider/i, name: 'Baiduspider' },
  { test: /YandexBot/i, name: 'YandexBot' },
  { test: /DuckDuckBot/i, name: 'DuckDuckBot' },
  { test: /Applebot/i, name: 'Applebot' },
  { test: /facebookexternalhit/i, name: 'Facebook 分享爬虫' },
  { test: /GPTBot/i, name: 'OpenAI GPTBot' },
  { test: /OAI-SearchBot/i, name: 'OpenAI 搜索爬虫' },
  { test: /CCBot/i, name: 'Common Crawl' },
  { test: /ClaudeBot|Claude-Web|anthropic-ai/i, name: 'Anthropic Claude' },
  { test: /PerplexityBot/i, name: 'PerplexityBot' },
  { test: /SemrushBot|AhrefsBot|MJ12bot|DotBot/i, name: 'SEO 爬虫' },
  { test: /HeadlessChrome/i, name: 'HeadlessChrome（无头浏览器）' },
  { test: /curl\//i, name: 'curl' },
  { test: /wget\//i, name: 'Wget' },
  { test: /PostmanRuntime/i, name: 'Postman' },
  { test: /python-requests|httpx|okhttp|Go-http-client/i, name: 'HTTP 客户端脚本' },
  { test: /bot|crawler|spider|crawling|scrapy|slurp/i, name: '通用爬虫' },
];

const OS_RULES: { test: RegExp; os: string; capture?: number }[] = [
  { test: /Windows NT 10\.0/, os: 'Windows 10/11' },
  { test: /Windows NT 6\.3/, os: 'Windows 8.1' },
  { test: /Windows NT 6\.2/, os: 'Windows 8' },
  { test: /Windows NT 6\.1/, os: 'Windows 7' },
  { test: /Windows/, os: 'Windows' },
  { test: /(?:iPhone|iPad|iPod).*OS ([\d_]+)/, os: 'iOS', capture: 1 },
  { test: /Mac OS X ([\d_.]+)/, os: 'macOS', capture: 1 },
  { test: /Android ([\d.]+)/, os: 'Android', capture: 1 },
  { test: /CrOS \S+ ([\d.]+)/, os: 'ChromeOS', capture: 1 },
  { test: /OpenBSD/, os: 'OpenBSD' },
  { test: /Linux/, os: 'Linux' },
];

const VERSION_REPLACEMENTS: [RegExp, string][] = [
  [/_/g, '.'],
  [/like mac os/i, ''],
  [/like linux/i, ''],
  [/applewebkit.*safari.*version\/([\d.]+)/i, '$1'],
];

function tidyVersion(version: string): string {
  let out = version;
  for (const [pattern, replacement] of VERSION_REPLACEMENTS) out = out.replace(pattern, replacement);
  const first = out.split(/[\s;)]/)[0];
  return first.replace(/[.,]+$/, '');
}

function detectBot(ua: string): string | null {
  for (const rule of BOT_RULES) if (rule.test.test(ua)) return rule.name;
  return null;
}

export function parseUserAgent(ua: string): ParsedUserAgent {
  const input = ua.trim();
  const bot = detectBot(input);

  let browser = '未知';
  let browserVersion = '';
  let engine = '未知';
  for (const rule of BROWSER_RULES) {
    const match = rule.test.exec(input);
    if (match) {
      browser = rule.browser;
      browserVersion = tidyVersion(match[1] ?? '');
      engine = rule.engine ?? '未知';
      break;
    }
  }

  let os = '未知';
  let osVersion = '';
  for (const rule of OS_RULES) {
    const match = rule.test.exec(input);
    if (match) {
      os = rule.os;
      osVersion = rule.capture ? tidyVersion(match[rule.capture] ?? '') : '';
      break;
    }
  }

  const isTablet = /iPad/.test(input) || (/Android/.test(input) && !/Mobile/.test(input));
  const isMobile = /Mobi|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(input);
  const deviceType = isTablet ? '平板' : isMobile ? '手机' : (detectSpecialDevice(input) ?? '桌面/其他');

  return {
    browser,
    browserVersion,
    engine,
    os,
    osVersion,
    deviceType,
    deviceVendor: detectVendor(input),
    isMobile,
    isBot: bot !== null,
    isTablet,
    botName: bot,
  };
}

/** 电视、车机、机器人等非传统终端的关键词。 */
const TV_TOKENS =
  /SMART-?TV|SmartTV|BRAVIA|AFT[A-Z0-9]*|Tizen|Web0S|NetCast|HbbTV|GoogleTV|AppleTV|Apple TV|ROKU|Roku|Viera|BRAVIA|VIDAA|Hisense|InettvBrowser|Opera TV Store|CE-HTML|SmartTVLB/i;
const CAR_TOKENS = /Android.*(?:Car|Auto|TMC|CarLauncher)|Tesla|S Automotive|CarBrowser|Automotive/i;
const WATCH_TOKENS = /Watch|watchOS/i;
const CONSOLE_TOKENS = /PlayStation|Xbox|Nintendo|PS4|PS5|Switch Browser|Steam Deck/i;

/** 电视 / 车机 / 机器人 / 掌机等特殊设备类型，普通桌面与移动设备返回 null。 */
function detectSpecialDevice(ua: string): string | null {
  if (TV_TOKENS.test(ua)) return '电视';
  if (CAR_TOKENS.test(ua)) return '车机';
  if (CONSOLE_TOKENS.test(ua)) return '游戏主机';
  if (WATCH_TOKENS.test(ua)) return '手表';
  return null;
}

function detectVendor(ua: string): string | null {
  const vendors: [RegExp, string][] = [
    [/iPhone|iPad|iPod|Macintosh|Mac OS X/i, 'Apple'],
    [/SAMSUNG|SM-[A-Z0-9]+/i, 'Samsung'],
    [/Xiaomi|Redmi|MI \d|POCO/i, 'Xiaomi'],
    [/HUAWEI|Honor|HONOR/i, 'Huawei'],
    [/OPPO/i, 'OPPO'],
    [/vivo/i, 'vivo'],
    [/OnePlus/i, 'OnePlus'],
    [/Pixel|Nexus/i, 'Google'],
    [/Kindle|Silk/i, 'Amazon'],
  ];
  for (const [test, name] of vendors) if (test.test(ua)) return name;
  return null;
}

export const SAMPLE_USER_AGENTS: { label: string; ua: string }[] = [
  {
    label: 'Chrome / macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  {
    label: 'Safari / iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Edge / Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
  },
  {
    label: 'Firefox / Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  },
  {
    label: 'Googlebot',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];

/** 常见爬虫 / 自动化 UA 关键词，用于「是否爬虫」判定与关键词展示。 */
export const BOT_KEYWORDS = [
  'bot',
  'spider',
  'crawler',
  'crawling',
  'slurp',
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'httpx',
  'okhttp',
  'go-http-client',
  'headlesschrome',
  'phantomjs',
  'puppeteer',
  'playwright',
  'monitoring',
  'uptime',
  'lighthouse',
  'pagespeed',
  'postmanruntime',
  'insomnia',
  'scrapy',
  'axios',
  'node-fetch',
] as const;

const BOT_HINTS = BOT_KEYWORDS.map((item) => new RegExp(item.replace(/\//g, '\\/'), 'i'));

/** 在 UA 关键词之外再扫描一遍，捕获 lib 规则没登记的爬虫标识。 */
export function matchBotKeyword(ua: string): string | null {
  for (const test of BOT_HINTS) {
    const match = test.exec(ua);
    if (match) return match[0];
  }
  return null;
}

function majorOf(version: string): number | null {
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : null;
}

export interface DeviceInsight {
  /** 归一化后的设备类型：桌面 / 手机 / 平板 / 电视 / 车机 / 游戏主机 / 手表 / 爬虫。 */
  type: string;
  isTv: boolean;
  isCar: boolean;
  isConsole: boolean;
  isWatch: boolean;
  /** 平板伪装成桌面、平板浏览器请求桌面版等异常信号。 */
  suspicious: { detected: boolean; note: string };
  notes: string[];
}

/** 设备类型细分：识别电视 / 车机 / 主机 / 手表，以及 iPad 桌面版伪装。 */
export function describeDevice(ua: string, parsed?: ParsedUserAgent): DeviceInsight {
  const input = ua.trim();
  const info = parsed ?? parseUserAgent(input);
  const isTv = TV_TOKENS.test(input);
  const isCar = CAR_TOKENS.test(input);
  const isConsole = CONSOLE_TOKENS.test(input);
  const isWatch = WATCH_TOKENS.test(input);
  const notes: string[] = [];

  let type = info.deviceType;
  if (info.isBot) type = '爬虫';
  else if (isTv) type = '电视';
  else if (isCar) type = '车机';
  else if (isConsole) type = '游戏主机';
  else if (isWatch) type = '手表';

  const ipadDesktop = detectIpadDesktopMode(input);
  if (ipadDesktop.detected) notes.push('UA 缺少 iPad 标识，可能是 iPadOS 13+ 桌面版模式或被改写的 UA');

  if (/Android/.test(input) && !/Mobile/.test(input)) {
    notes.push('Android UA 缺少 Mobile 标记，按平板处理');
  }
  if (/Macintosh/.test(input) && /Safari/.test(input) && !/Chrome|Chromium|Edg|OPR/.test(input)) {
    notes.push('Safari + Macintosh 组合既可能是 Mac，也可能是 iPadOS 桌面模式');
  }
  if (info.isBot) notes.push(`爬虫标识：${info.botName ?? '未识别名称'}`);

  return {
    type,
    isTv,
    isCar,
    isConsole,
    isWatch,
    suspicious: { detected: ipadDesktop.detected, note: ipadDesktop.note },
    notes,
  };
}

/**
 * iPadOS 13+ 在「桌面版网站」下会伪装成 macOS：
 * UA 中只有 Macintosh + Safari，没有任何 iPad 特征，只能靠启发式判断。
 */
export function detectIpadDesktopMode(ua: string): { detected: boolean; note: string } {
  const input = ua.trim();
  const looksMac =
    /Macintosh; Intel Mac OS X/.test(input) && /AppleWebKit/.test(input) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(input);
  if (looksMac && /Version\/\d/.test(input)) {
    return {
      detected: true,
      note: '疑似 iPadOS 桌面版模式（Safari UA 与 macOS 完全一致），真实设备需靠 navigator.maxTouchPoints 或 Client Hints 区分',
    };
  }
  return { detected: false, note: '未命中 iPad 桌面版伪装特征' };
}

const IOS_DEVICE_TABLE: { min: number; label: string }[] = [
  { min: 17, label: 'iPhone 15 / 14 系列及更新机型' },
  { min: 16, label: 'iPhone 14 / 13 / 12 / SE 3' },
  { min: 15, label: 'iPhone 13 / 12 / 11 / SE 2' },
  { min: 14, label: 'iPhone 12 / 11 / XS / SE 2' },
  { min: 13, label: 'iPhone 11 / XS / 8 / SE 2' },
  { min: 12, label: 'iPhone XR / XS / 11' },
  { min: 11, label: 'iPhone X / 8 / 6s' },
  { min: 10, label: 'iPhone 7 / 6s' },
];

/** 由 iOS 主版本推测大致机型代次（UA 本身不含机型，只能给区间）。 */
export function iosDeviceFromOsVersion(osVersion: string): string | null {
  const major = majorOf(osVersion);
  if (major === null) return null;
  const row = IOS_DEVICE_TABLE.find((item) => major >= item.min);
  return row ? `${row.label}（iOS ${major} 起的代表机型）` : null;
}

export interface CapabilityRow {
  name: string;
  supported: boolean | 'partial';
  note: string;
}

/** 静态特性支持表：能力名 → 各浏览器最低版本。全部内置，不联网。 */
export const FEATURE_RULES: { name: string; since: Record<string, number>; note: string }[] = [
  {
    name: 'ES2020（可选链 / ?? / BigInt）',
    since: { Chrome: 80, Edge: 80, Opera: 67, 'Samsung Internet': 13, Firefox: 74, Safari: 13 },
    note: 'iOS Safari 需 13.4 及以上',
  },
  {
    name: 'ES2022（.at() / Error.cause / 顶层 await）',
    since: { Chrome: 94, Edge: 94, Firefox: 93, Safari: 15, 'Samsung Internet': 17 },
    note: '顶层 await 在 Safari 15 才有',
  },
  {
    name: ':has() 选择器',
    since: { Chrome: 105, Edge: 105, Firefox: 121, Safari: 15 },
    note: 'Firefox 121 起才支持，缺失时可改用 JS 兜底',
  },
  {
    name: 'CSS 容器查询 @container',
    since: { Chrome: 105, Edge: 105, Firefox: 110, Safari: 16 },
    note: '组件级响应式布局的关键能力',
  },
  {
    name: 'WebP',
    since: { Chrome: 32, Edge: 32, Firefox: 65, Opera: 20, 'Samsung Internet': 4, Safari: 14 },
    note: 'Safari 14 之前需要兜底格式',
  },
  {
    name: 'AVIF',
    since: { Chrome: 85, Edge: 85, Firefox: 93, Safari: 16 },
    note: 'Safari 需 16.1，iOS 同步',
  },
  {
    name: 'WebGL2',
    since: { Chrome: 56, Edge: 56, Firefox: 51, Safari: 15 },
    note: '老设备可用 WebGL1 兜底',
  },
  {
    name: 'WebGPU',
    since: { Chrome: 113, Edge: 113, Firefox: 141, Safari: 26 },
    note: 'Firefox 141 起步于 Windows，Safari 26 才默认开启',
  },
  {
    name: 'HTTP/2',
    since: { Chrome: 15, Edge: 15, Firefox: 43, Safari: 14, 'Samsung Internet': 4 },
    note: 'h2 通常经 TLS ALPN 协商',
  },
  {
    name: 'HTTP/3（QUIC）',
    since: { Chrome: 87, Edge: 87, Firefox: 113, Safari: 17 },
    note: '服务端需支持 Alt-Svc',
  },
  {
    name: 'Service Worker',
    since: { Chrome: 45, Edge: 45, Firefox: 44, Safari: 11 },
    note: 'iOS Safari 11.3 起可用',
  },
  {
    name: 'WebAssembly',
    since: { Chrome: 57, Edge: 57, Firefox: 52, Safari: 11 },
    note: '几乎所有在用设备都支持',
  },
  {
    name: 'Import Maps',
    since: { Chrome: 89, Edge: 89, Firefox: 108, Safari: 16 },
    note: 'Safari 需 16.4',
  },
  {
    name: 'OffscreenCanvas',
    since: { Chrome: 69, Edge: 69, Firefox: 105, Safari: 16 },
    note: 'Safari 需 16.4',
  },
  {
    name: 'View Transitions API',
    since: { Chrome: 111, Edge: 111, Safari: 18, Firefox: 144 },
    note: 'Firefox 支持较晚，需谨慎降级',
  },
];

const BROWSER_ALIAS: Record<string, string> = {
  chrome: 'Chrome',
  'google chrome': 'Chrome',
  chromium: 'Chrome',
  edge: 'Edge',
  'microsoft edge': 'Edge',
  firefox: 'Firefox',
  ff: 'Firefox',
  safari: 'Safari',
  'mobile safari': 'Safari',
  opera: 'Opera',
  'opera gx': 'Opera',
  'samsung internet': 'Samsung Internet',
  ie: 'Internet Explorer',
  'internet explorer': 'Internet Explorer',
};

export const FEATURE_BROWSERS = ['Chrome', 'Edge', 'Firefox', 'Safari', 'Opera', 'Samsung Internet'];

export function normalizeBrowserName(browser: string): string {
  const key = browser.trim().toLowerCase();
  if (BROWSER_ALIAS[key]) return BROWSER_ALIAS[key];
  for (const [alias, name] of Object.entries(BROWSER_ALIAS)) {
    if (key.includes(alias)) return name;
  }
  return browser.trim();
}

/** 针对指定浏览器与版本，列出内置特性支持情况。 */
export function featureSupport(browser: string, version: number | null): CapabilityRow[] {
  const name = normalizeBrowserName(browser);
  return FEATURE_RULES.map((rule) => {
    const since = rule.since[name];
    if (since === undefined) return { name: rule.name, supported: false, note: `${rule.note}（该浏览器无内置数据）` };
    if (version === null) return { name: rule.name, supported: false, note: `需 ${name} ${since}+　${rule.note}` };
    return {
      name: rule.name,
      supported: version >= since,
      note: `${name} ${since}+ 起支持　${rule.note}`,
    };
  });
}

/** 从解析结果推断该 UA 实际能用的能力。 */
export function detectCapabilities(ua: string, parsed?: ParsedUserAgent): CapabilityRow[] {
  const info = parsed ?? parseUserAgent(ua);
  const rows = featureSupport(info.browser, majorOf(info.browserVersion));

  // 未知浏览器或解析不出版本时，只能给到引擎级别的粗粒度判断
  if (info.browser === '未知' || majorOf(info.browserVersion) === null) {
    return rows.map((row) => ({ ...row, supported: false, note: `${row.note}（版本未知，无法确认）` }));
  }
  if (info.isBot) {
    return rows.map((row) => ({ ...row, note: `${row.note}　爬虫环境渲染能力通常受限` }));
  }
  return rows;
}

export interface ClientHints {
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  secChUaPlatformVersion: string;
  /** 低优先级提示头模板。 */
  extraHeaders: { name: string; value: string }[];
  notes: string[];
}

const CHROMIUM_BRAND_NAMES: Record<string, string> = {
  Chrome: 'Google Chrome',
  Edge: 'Microsoft Edge',
  Opera: 'Opera',
  'Samsung Internet': 'Samsung Internet',
  'Yandex Browser': 'Yandex Browser',
  'UC Browser': 'UC Browser',
};

/** 生成 Client Hints（Sec-CH-UA 系列）请求头取值。 */
export function buildClientHints(ua: string, parsed?: ParsedUserAgent): ClientHints {
  const info = parsed ?? parseUserAgent(ua);
  const major = majorOf(info.browserVersion);
  const notes: string[] = [];
  const isChromium = info.engine === 'Blink';

  if (!isChromium) {
    notes.push('Firefox 与 Safari 不发送 Sec-CH-UA 系列头；Firefox 依靠 rv 版本与 UA 缩减策略，Safari 完全不发送');
  }

  const majorText = major === null ? '{major}' : String(major);
  // Chrome 116+ 的品牌列表顺序与 Not(A:Brand 取值会随版本变化，这里给出常见形态
  const notABrand = major !== null && major >= 116 ? '"Not:A-Brand";v="24"' : '"Not:A-Brand";v="99"';
  const brandName = CHROMIUM_BRAND_NAMES[info.browser] ?? (isChromium ? `"Chromium";v="${majorText}"` : '"{brand}"');

  const secChUa = isChromium
    ? `"Chromium";v="${majorText}", ${notABrand}, ${brandName};v="${majorText}"`
    : `${brandName};v="${majorText}"`;

  const secChUaMobile = info.isMobile ? '?1' : '?0';
  const secChUaPlatform = info.os.startsWith('Windows')
    ? '"Windows"'
    : info.os.startsWith('macOS') || info.os === 'iOS' || info.os === '未知'
      ? '"macOS"'
      : info.os === 'Android'
        ? '"Android"'
        : info.os === 'Linux' || info.os === 'ChromeOS'
          ? '"Linux"'
          : '"Unknown"';

  let platformVersion = '{platform-version}';
  if (info.os.startsWith('Windows')) platformVersion = '10.0.0';
  else if (info.os.startsWith('macOS') && info.osVersion) {
    // Chrome 上报的是 Darwin 内核版本而非营销版本号
    platformVersion = '15.0.0';
    notes.push(`macOS 平台版本上报的是内核版本（示例 UA 的 ${info.osVersion} 对应 15.x 内核）`);
  } else if (info.os === 'Android' && info.osVersion) platformVersion = info.osVersion;
  else if (info.os === 'iOS' && info.osVersion) platformVersion = info.osVersion;

  const extraHeaders = isChromium
    ? [
        {
          name: 'Sec-CH-UA-Full-Version-List',
          value: `"Chromium";v="${majorText}.0.0.0", ${brandName};v="${majorText}.0.0.0"`,
        },
        { name: 'Sec-CH-UA-Mobile', value: secChUaMobile },
        { name: 'Sec-CH-UA-Platform', value: secChUaPlatform },
        { name: 'Sec-CH-UA-Platform-Version', value: platformVersion },
        { name: 'Sec-CH-UA-Arch', value: info.os === 'macOS' || info.os.startsWith('Windows') ? '"x86"' : '""' },
        { name: 'Sec-CH-UA-Bitness', value: '"64"' },
        { name: 'Sec-CH-UA-Model', value: '""' },
        { name: 'Sec-CH-UA-WoW64', value: '?0' },
      ]
    : [{ name: 'User-Agent', value: buildUserAgentTemplate(info.browser, majorText).ua }];

  notes.push('UA 缩减：Chrome 101+ 起 major 版本会冻结为 0.0.0，真实版本只能从 Sec-CH-UA-Full-Version-List 读');
  notes.push('若要拿高精度 UA，可在浏览器扩展里申请 high-entropy hints 或直接读 navigator.userAgentData');

  return { secChUa, secChUaMobile, secChUaPlatform, secChUaPlatformVersion: platformVersion, extraHeaders, notes };
}

export interface UaTemplate {
  ua: string;
  label: string;
  notes: string[];
}

/** 按目标浏览器与版本生成一份完整的 UA 模板（用于「UA 对照」）。 */
export function buildUserAgentTemplate(browser: string, version = '{major}'): UaTemplate {
  const name = normalizeBrowserName(browser);
  switch (name) {
    case 'Chrome':
      return {
        label: 'Chrome / Windows',
        ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`,
        notes: ['Chrome 110+ 起平台版本会冻结为 10.0.0，Windows 10 与 11 在 UA 上无法区分'],
      };
    case 'Edge':
      return {
        label: 'Edge / Windows',
        ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36 Edg/${version}.0.0.0`,
        notes: ['Edge UA 同时带 Chrome 与 Edg 两段版本号'],
      };
    case 'Opera':
      return {
        label: 'Opera / Windows',
        ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36 OPR/${version}.0.0.0`,
        notes: ['Opera 以 OPR 段表示自身版本'],
      };
    case 'Samsung Internet':
      return {
        label: 'Samsung Internet / Android',
        ua: `Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${version}.0 Chrome/110.0.0.0 Mobile Safari/537.36`,
        notes: ['内嵌 Chrome 版本与自身版本分开写'],
      };
    case 'Firefox':
      return {
        label: 'Firefox / Windows',
        ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`,
        notes: ['rv 表示 Gecko 平台版本，通常与 Firefox 版本号同步'],
      };
    default:
      return {
        label: 'Safari / macOS',
        ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`,
        notes: ['Safari 用 Version 段表示版本，AppleWebKit 号长期固定为 605.1.15'],
      };
  }
}

export interface RewriteResult {
  ua: string;
  changes: string[];
  warnings: string[];
}

/** 把一条 UA 的版本改写为目标浏览器的目标版本（跨浏览器时直接换模板）。 */
export function rewriteUserAgent(ua: string, target: { browser: string; version: string }): RewriteResult {
  const source = parseUserAgent(ua);
  const targetName = normalizeBrowserName(target.browser);
  const changes: string[] = [];
  const warnings: string[] = [];
  const version = target.version.trim() || '{major}';
  const from = `${source.browser} ${source.browserVersion}`.trim();
  changes.push(`原始 UA 识别为 ${from}`);

  let out = ua.trim();
  if (targetName === source.browser) {
    // 同一浏览器：只替换版本号，保留平台与机型片段
    out = out.replace(/rv:[\d.]+/g, `rv:${version}.0`);
    out = out.replace(/(Firefox|FxiOS|CriOS|EdgiOS)\/[\d.]+/g, (_match, key: string) => `${key}/${version}.0`);
    out = out.replace(
      /(Chrome|Chromium|OPR|Edg|SamsungBrowser|YaBrowser|UCBrowser|Version)\/[\d.]+/g,
      (_match, key: string) => `${key}/${version}${key === 'Version' ? '.0' : '.0.0.0'}`,
    );
    changes.push(`同浏览器改写：仅把版本号替换为 ${version}，其余片段保持不变`);
  } else {
    const template = buildUserAgentTemplate(targetName, version);
    out = template.ua;
    changes.push(`跨浏览器改写：按 ${template.label} 模板重建 UA`);
    warnings.push('跨浏览器改写只是文本替换，不保证目标浏览器真能发出这样的 UA，仅用于测试环境分流');
  }

  if (version.includes('{')) warnings.push('版本号仍是占位符，发送前需要替换为真实版本');
  if (source.isBot) warnings.push('原 UA 是爬虫标识，改写后不再是爬虫，可能被风控识别');

  return { ua: out, changes, warnings };
}

export interface CrawlerRow {
  name: string;
  ua: string;
  purpose: string;
  verify: string;
}

/** 常见爬虫 UA 对照表，用于 SEO 与风控排查。 */
export const CRAWLER_UA_TABLE: CrawlerRow[] = [
  {
    name: 'Googlebot（桌面）',
    ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    purpose: 'Google 索引与移动优先排名',
    verify: '在 Google Search Console 用 URL 检查工具验证',
  },
  {
    name: 'Googlebot 移动版',
    ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.69 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    purpose: '移动端抓取与渲染',
    verify: '反向 DNS 确认 IP 属于 googlebot.com',
  },
  {
    name: 'Bingbot',
    ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    purpose: 'Bing / 微软搜索索引',
    verify: '抓取 bing.com/bingbot.htm 比对 IP 段',
  },
  {
    name: 'Baiduspider',
    ua: 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    purpose: '百度搜索收录',
    verify: 'IP 归属判断 + 百度站长平台验证',
  },
  {
    name: 'GPTBot',
    ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
    purpose: 'OpenAI 模型训练抓取',
    verify: '按 OpenAI 公布的 IP 段核对',
  },
  {
    name: 'ClaudeBot',
    ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    purpose: 'Anthropic 抓取',
    verify: 'robots.txt 声明控制',
  },
  {
    name: 'Applebot',
    ua: 'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)',
    purpose: 'Apple 智能（Siri / Spotlight）',
    verify: 'Apple 公布的 IP 段',
  },
  {
    name: 'curl',
    ua: 'curl/8.5.0',
    purpose: '命令行下载与接口自测',
    verify: 'UA 无版本伪装特征，属于明显的脚本流量',
  },
  {
    name: 'python-requests',
    ua: 'python-requests/2.32.3',
    purpose: 'Python 抓取脚本',
    verify: '默认 UA 与 requests 默认值完全一致',
  },
  {
    name: 'HeadlessChrome',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
    purpose: '自动化测试 / 爬虫（未隐藏特征）',
    verify: 'HeadlessChrome 字样可直接识别',
  },
  {
    name: 'Uptime / 监控',
    ua: 'UptimeRobot/2.0; https://uptimerobot.com/',
    purpose: '可用性监控探针',
    verify: '把监控出口 IP 加白名单，避免被误封',
  },
  {
    name: 'Lighthouse',
    ua: 'Mozilla/5.0 (compatible; Lighthouse/12.0.0; +https://github.com/GoogleChrome/lighthouse)',
    purpose: '性能与 SEO 检测',
    verify: '来自 PageSpeed 报告的请求',
  },
];

/** 关于 UA 机制本身的经验提示，展示在工具页中作为参考。 */
export const UA_KNOWLEDGE_NOTES: { title: string; text: string }[] = [
  {
    title: 'UA 缩减（Chrome）',
    text: 'Chrome 101 起冻结平台版本，110 起冻结 major/minor/patch 为 0.0.0；Firefox 在 privacy.resistFingerprinting 下会抹掉平台细节并保留 rv 版本。',
  },
  {
    title: '客户端提示（Client Hints）',
    text: 'Sec-CH-UA 系列以请求头形式暴露品牌与平台，服务端可据其下发不同资源；开启 Sec-CH-UA-Full-Version-List 之类的 high-entropy hint 需要显式 Accept 协商。',
  },
  {
    title: 'iPadOS 桌面版伪装',
    text: 'iPadOS 13+ 在桌面版网站下 UA 与 macOS 完全一致，无法从 UA 判定真实设备，需要 navigator.maxTouchPoints、Sec-CH-UA-Model 或客户端提示。',
  },
  {
    title: 'UA 不等于身份',
    text: 'UA 字符串可随意伪造，反爬应结合 IP 行为、TLS 指纹与请求节奏；不要用 UA 做鉴权依据。',
  },
];
