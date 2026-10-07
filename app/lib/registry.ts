import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeftRight,
  Binary,
  Boxes,
  Braces,
  Bug,
  CalendarClock,
  Camera,
  Clipboard,
  Clock,
  Code2,
  Compass,
  Container,
  Database,
  FileCode,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  Image,
  KeyRound,
  Languages,
  Layers,
  ListTodo,
  Monitor,
  Network,
  NotebookPen,
  Package,
  Palette,
  Pencil,
  QrCode,
  Radar,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Signature,
  Smile,
  Sparkles,
  SquareTerminal,
  Table,
  Terminal,
  Timer,
  Wifi,
  Zap,
} from 'lucide-react';
import { lazy } from 'react';

export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
}

export interface Tool {
  meta: ToolMeta;
  component: React.ComponentType;
}

export type NavLeaf = { type: 'tool'; toolId: string };

export interface NavGroup {
  type: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  children: NavNode[];
}

export type NavNode = NavGroup | NavLeaf;

export const TOOLS: [Tool, ...Tool[]] = [
  // ── 加密与安全 ────────────────────────────────────────────────
  {
    meta: {
      id: 'token',
      name: 'Token 生成器',
      description: '生成随机安全令牌，可自定义长度与字符集',
      icon: ShieldCheck,
      keywords: ['token', 'random', 'secret', 'password', 'nonce', '随机', '令牌'],
    },
    component: lazy(() => import('../tools/token')),
  },
  {
    meta: {
      id: 'uuid',
      name: 'UUID / ULID 生成器',
      description: '生成 UUID v4/v7 与时间有序的 ULID',
      icon: Signature,
      keywords: ['uuid', 'ulid', 'guid', 'id', 'unique', '生成', '标识'],
    },
    component: lazy(() => import('../tools/uuid')),
  },
  {
    meta: {
      id: 'password-strength',
      name: '密码强度分析',
      description: '评估密码复杂度、熵值与暴力破解耗时',
      icon: ShieldCheck,
      keywords: ['password', 'strength', 'entropy', 'crack', '密码', '强度', '熵'],
    },
    component: lazy(() => import('../tools/password-strength')),
  },
  {
    meta: {
      id: 'hash',
      name: 'Hash 计算',
      description: 'MD5、SHA-1、SHA-256、SHA-384、SHA-512',
      icon: Binary,
      keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'digest', '摘要', '校验'],
    },
    component: lazy(() => import('../tools/hash')),
  },
  {
    meta: {
      id: 'hmac',
      name: 'HMAC 生成器',
      description: '使用密钥生成消息认证码，用于接口签名',
      icon: Signature,
      keywords: ['hmac', 'signature', 'sign', 'webhook', '签名', '认证码'],
    },
    component: lazy(() => import('../tools/hmac')),
  },
  {
    meta: {
      id: 'rsa',
      name: 'RSA 密钥对生成',
      description: '生成非对称公私钥对，可指定密钥长度',
      icon: ShieldCheck,
      keywords: ['rsa', 'key', 'public', 'private', 'pub', '密钥', '公钥', '私钥'],
    },
    component: lazy(() => import('../tools/rsa')),
  },
  {
    meta: {
      id: 'aes',
      name: '对称加解密',
      description: 'AES-GCM / AES-CBC 加解密与模式选择',
      icon: ShieldCheck,
      keywords: ['aes', 'gcm', 'cbc', 'encrypt', 'decrypt', 'crypto', '加密', '解密'],
    },
    component: lazy(() => import('../tools/aes')),
  },

  // ── 编码转换 ──────────────────────────────────────────────────
  {
    meta: {
      id: 'base64',
      name: 'Base64 编解码',
      description: 'Base64 编码/解码，支持 UTF-8 与 URL-safe 变体',
      icon: Binary,
      keywords: ['base64', 'encode', 'decode', '编码', '解码'],
    },
    component: lazy(() => import('../tools/base64')),
  },
  {
    meta: {
      id: 'url-encode',
      name: 'URL 编解码',
      description: '查询参数、路径的转义与还原',
      icon: ArrowLeftRight,
      keywords: ['url', 'uri', 'encode', 'decode', 'percent', '地址', '链接'],
    },
    component: lazy(() => import('../tools/url-encode')),
  },
  {
    meta: {
      id: 'html-entity',
      name: 'HTML 实体转换',
      description: '特殊字符与实体编码互转',
      icon: Code2,
      keywords: ['html', 'entity', 'escape', '转义', '实体'],
    },
    component: lazy(() => import('../tools/html-entity')),
  },
  {
    meta: {
      id: 'number-base',
      name: '进制转换',
      description: '二进制、八进制、十进制、十六进制互转',
      icon: Binary,
      keywords: ['base', 'binary', 'hex', 'octal', 'radix', '进制', '转换'],
    },
    component: lazy(() => import('../tools/number-base')),
  },
  {
    meta: {
      id: 'unicode',
      name: '文本转 Unicode / 二进制',
      description: '字符与码点、二进制表示互转',
      icon: Code2,
      keywords: ['unicode', 'codepoint', 'binary', 'char', '码点', '字符'],
    },
    component: lazy(() => import('../tools/unicode')),
  },
  {
    meta: {
      id: 'punycode',
      name: 'Punycode 编解码',
      description: '国际化域名与 ASCII 编码互转',
      icon: Network,
      keywords: ['punycode', 'idn', 'domain', '国际化', '域名'],
    },
    component: lazy(() => import('../tools/punycode')),
  },

  // ── 数据格式 ──────────────────────────────────────────────────
  {
    meta: {
      id: 'json-formatter',
      name: 'JSON 格式化',
      description: '美化缩进、压缩体积、语法校验',
      icon: Braces,
      keywords: ['json', 'json5', 'format', 'pretty', 'minify', '格式化', '美化'],
    },
    component: lazy(() => import('../tools/json-formatter')),
  },
  {
    meta: {
      id: 'jwt',
      name: 'JWT 解析',
      description: '解码 Header、Payload，查看签名与过期时间',
      icon: Signature,
      keywords: ['jwt', 'token', 'bearer', 'claim', '令牌'],
    },
    component: lazy(() => import('../tools/jwt')),
  },
  {
    meta: {
      id: 'sql',
      name: 'SQL 格式化',
      description: '语句缩进、关键字高亮与可读性优化',
      icon: Braces,
      keywords: ['sql', 'format', 'query', '美化', '格式化'],
    },
    component: lazy(() => import('../tools/sql')),
  },

  // ── 网络工具 ──────────────────────────────────────────────────
  {
    meta: {
      id: 'ipv4-subnet',
      name: 'IPv4 子网计算',
      description: '按 CIDR 计算网段、掩码与可用主机数',
      icon: Network,
      keywords: ['ipv4', 'cidr', 'subnet', 'mask', '子网', '掩码'],
    },
    component: lazy(() => import('../tools/ipv4-subnet')),
  },
  {
    meta: {
      id: 'ip-convert',
      name: 'IPv4 地址转换',
      description: '点分十进制与整数、二进制互转',
      icon: Network,
      keywords: ['ipv4', 'int', 'binary', 'decimal', '地址', '转换'],
    },
    component: lazy(() => import('../tools/ip-convert')),
  },
  {
    meta: {
      id: 'geohash',
      name: 'Geohash 编解码',
      description: '地理坐标与短字符串编码互转',
      icon: Network,
      keywords: ['geohash', 'geo', 'coordinate', '坐标', '地理'],
    },
    component: lazy(() => import('../tools/geohash')),
  },
  {
    meta: {
      id: 'http-status',
      name: 'HTTP 状态码速查',
      description: '按类别查询状态码含义与处理建议',
      icon: Network,
      keywords: ['http', 'status', 'code', '状态码'],
    },
    component: lazy(() => import('../tools/http-status')),
  },
  {
    meta: {
      id: 'url-parser',
      name: 'URL 解析',
      description: '拆分协议、域名、端口、路径与查询参数',
      icon: Network,
      keywords: ['url', 'uri', 'parse', 'query', '解析'],
    },
    component: lazy(() => import('../tools/url-parser')),
  },
  {
    meta: {
      id: 'user-agent',
      name: 'User-Agent 解析',
      description: '解析浏览器、操作系统与设备类型',
      icon: Network,
      keywords: ['user-agent', 'ua', 'browser', 'os', 'device', '浏览器'],
    },
    component: lazy(() => import('../tools/user-agent')),
  },

  // ── 开发辅助 ──────────────────────────────────────────────────
  {
    meta: {
      id: 'regex',
      name: '正则表达式测试',
      description: '实时匹配高亮与分组捕获',
      icon: Code2,
      keywords: ['regex', 'regexp', 'test', 'match', 'pattern', '正则'],
    },
    component: lazy(() => import('../tools/regex-tester')),
  },
  {
    meta: {
      id: 'cron',
      name: 'Crontab 生成器',
      description: '解析表达式、描述含义并预览执行时间',
      icon: Clock,
      keywords: ['cron', 'schedule', 'crontab', 'parse', 'next', '定时', '调度'],
    },
    component: lazy(() => import('../tools/cron-parser')),
  },
  {
    meta: {
      id: 'chmod',
      name: 'Chmod 计算器',
      description: '权限位与八进制、符号表示互转',
      icon: ShieldCheck,
      keywords: ['chmod', 'permission', 'mode', '权限'],
    },
    component: lazy(() => import('../tools/chmod')),
  },
  {
    meta: {
      id: 'git',
      name: 'Git 命令速查',
      description: '常用命令与场景化操作提示',
      icon: Code2,
      keywords: ['git', 'command', 'cheatsheet', '分支', '提交'],
    },
    component: lazy(() => import('../tools/git')),
  },

  // ── 文本处理 ──────────────────────────────────────────────────
  {
    meta: {
      id: 'case',
      name: '大小写转换',
      description: '驼峰、下划线、全大写等命名风格互转',
      icon: Code2,
      keywords: ['case', 'camel', 'snake', 'kebab', 'convert', '命名', '大小写'],
    },
    component: lazy(() => import('../tools/case')),
  },
  {
    meta: {
      id: 'text-diff',
      name: '文本差异对比',
      description: '逐行对比并高亮新增、删除与修改',
      icon: Binary,
      keywords: ['diff', 'compare', 'difference', '对比', '差异'],
    },
    component: lazy(() => import('../tools/text-diff')),
  },
  {
    meta: {
      id: 'json-diff',
      name: 'JSON 比对',
      description: '比较两个 JSON 数据的差异，支持多种比对模式',
      icon: Braces,
      keywords: ['json', 'diff', 'compare', 'difference', '对比', '差异', '比对'],
    },
    component: lazy(() => import('../tools/json-diff')),
  },
  {
    meta: {
      id: 'text-stats',
      name: '文本统计',
      description: '字数、行数、字符数与词频统计',
      icon: Braces,
      keywords: ['count', 'words', 'stats', 'frequency', '字数', '词频'],
    },
    component: lazy(() => import('../tools/text-stats')),
  },
  {
    meta: {
      id: 'text-clean',
      name: '文本清洗',
      description: '行去重、排序、去空行与空白规范化',
      icon: Braces,
      keywords: ['clean', 'dedupe', 'sort', 'trim', '清洗', '去重', '排序'],
    },
    component: lazy(() => import('../tools/text-clean')),
  },
  {
    meta: {
      id: 'slug',
      name: 'Slugify 转换',
      description: '生成 URL 友好的短标识',
      icon: Network,
      keywords: ['slug', 'slugify', 'url', 'friendly', '标识'],
    },
    component: lazy(() => import('../tools/slug')),
  },
  {
    meta: {
      id: 'lorem',
      name: '占位文本生成',
      description: '生成指定段落的 Lorem Ipsum',
      icon: Braces,
      keywords: ['lorem', 'ipsum', 'placeholder', '占位', '填充'],
    },
    component: lazy(() => import('../tools/lorem')),
  },

  // ── 图像与媒体 ────────────────────────────────────────────────
  {
    meta: {
      id: 'qr',
      name: '二维码生成器',
      description: '文本、链接生成二维码，可自定义尺寸与纠错级别',
      icon: QrCode,
      keywords: ['qr', 'qrcode', 'barcode', '二维码'],
    },
    component: lazy(() => import('../tools/qr-generator')),
  },
  {
    meta: {
      id: 'wifi-qr',
      name: 'WiFi 二维码生成',
      description: '生成含 SSID 与密码的扫码连网码',
      icon: QrCode,
      keywords: ['wifi', 'qr', 'ssid', 'password', '连网', '配网'],
    },
    component: lazy(() => import('../tools/wifi-qr')),
  },
  {
    meta: {
      id: 'placeholder-image',
      name: '占位图生成',
      description: '按尺寸与文案生成 SVG / PNG 占位图',
      icon: Palette,
      keywords: ['placeholder', 'image', 'svg', 'png', '占位图', '缩略图'],
    },
    component: lazy(() => import('../tools/placeholder-image')),
  },
  {
    meta: {
      id: 'color',
      name: '颜色转换器',
      description: 'HEX、RGB、HSL、CMYK 互转与对比度',
      icon: Palette,
      keywords: ['color', 'hex', 'rgb', 'hsl', 'cmyk', '颜色'],
    },
    component: lazy(() => import('../tools/color')),
  },

  // ── 时间与单位 ────────────────────────────────────────────────
  {
    meta: {
      id: 'timestamp',
      name: '时间戳互转',
      description: '秒/毫秒时间戳与可读日期双向转换',
      icon: CalendarClock,
      keywords: ['timestamp', 'unix', 'date', 'epoch', '时间戳', '日期'],
    },
    component: lazy(() => import('../tools/timestamp')),
  },
  {
    meta: {
      id: 'timezone',
      name: '时区转换',
      description: '多地区时间对照，含夏令时处理',
      icon: CalendarClock,
      keywords: ['timezone', 'utc', 'gmt', 'tz', '时区', '时间'],
    },
    component: lazy(() => import('../tools/timezone')),
  },
  {
    meta: {
      id: 'date-calc',
      name: '日期计算',
      description: '日期间隔、加减天数与工作日历计算',
      icon: CalendarClock,
      keywords: ['date', 'diff', 'add', 'days', '日期', '间隔'],
    },
    component: lazy(() => import('../tools/date-calc')),
  },
  {
    meta: {
      id: 'unit',
      name: '单位换算',
      description: '长度、质量、温度、数据存储等换算',
      icon: Binary,
      keywords: ['unit', 'convert', 'length', 'weight', '单位', '换算'],
    },
    component: lazy(() => import('../tools/unit')),
  },
  {
    meta: {
      id: 'timer',
      name: '计时器 / 秒表',
      description: '倒计时与时间记录',
      icon: Timer,
      keywords: ['timer', 'stopwatch', 'countdown', '计时', '秒表'],
    },
    component: lazy(() => import('../tools/timer')),
  },
  {
    meta: {
      id: 'bcrypt',
      name: 'Bcrypt 口令哈希',
      description: '生成加盐密码哈希并支持校验比对',
      icon: ShieldCheck,
      keywords: ['bcrypt', 'hash', 'password', 'salt', 'cost', 'verify', '口令', '哈希'],
    },
    component: lazy(() => import('../tools/bcrypt')),
  },
  {
    meta: {
      id: 'security-scan',
      name: '安全扫描工具',
      description: '依赖漏洞、危险用法与密钥泄漏的本地静态检查',
      icon: ShieldAlert,
      keywords: ['security', 'audit', 'sca', 'dependency', 'cve', 'secrets', '安全', '扫描', '漏洞'],
    },
    component: lazy(() => import('../tools/security-scan')),
  },
  {
    meta: {
      id: 'charset-convert',
      name: '字符集转换',
      description: 'UTF-8、GBK、Big5 等编码互转与乱码修复',
      icon: Languages,
      keywords: ['charset', 'encoding', 'gbk', 'big5', 'utf8', 'mojibake', '编码', '乱码', '字符集'],
    },
    component: lazy(() => import('../tools/charset-convert')),
  },
  {
    meta: {
      id: 'json-convert',
      name: 'JSON 多格式互转',
      description: 'JSON 与 CSV / XML / YAML / TOML 双向转换',
      icon: ArrowLeftRight,
      keywords: ['json', 'csv', 'xml', 'yaml', 'toml', 'convert', '转换', '互转'],
    },
    component: lazy(() => import('../tools/json-convert')),
  },
  {
    meta: {
      id: 'json-to-code',
      name: 'JSON 转代码实体',
      description: '生成 Java、Python、Go、TypeScript 等实体类',
      icon: Code2,
      keywords: ['json', 'java', 'python', 'go', 'typescript', 'entity', 'class', '实体', '类'],
    },
    component: lazy(() => import('../tools/json-to-code')),
  },
  {
    meta: {
      id: 'yaml-xml',
      name: 'YAML / XML 格式化',
      description: 'YAML 与 XML 的校验、美化与互转',
      icon: FileCode,
      keywords: ['yaml', 'xml', 'format', 'validate', '格式化', '校验'],
    },
    component: lazy(() => import('../tools/yaml-xml')),
  },
  {
    meta: {
      id: 'markdown',
      name: 'Markdown 转 HTML',
      description: 'Markdown 渲染为 HTML，含目录生成与安全清洗',
      icon: FileText,
      keywords: ['markdown', 'html', 'render', '渲染', '文档'],
    },
    component: lazy(() => import('../tools/markdown')),
  },
  {
    meta: {
      id: 'table-convert',
      name: '表格互转',
      description: 'Excel、CSV、Markdown、HTML 表格之间转换',
      icon: Table,
      keywords: ['table', 'excel', 'csv', 'markdown', 'html', '表格', '转换'],
    },
    component: lazy(() => import('../tools/table-convert')),
  },
  {
    meta: {
      id: 'db-client',
      name: '数据库客户端',
      description: '连接配置、数据建模、SQL 生成与数据搬运',
      icon: Database,
      keywords: ['database', 'sql', 'ddl', 'er', 'model', '数据库', '建模'],
    },
    component: lazy(() => import('../tools/db-client')),
  },
  {
    meta: {
      id: 'ipv6-ula',
      name: 'IPv6 ULA 生成',
      description: '生成 RFC 4193 唯一本地地址与地址展开',
      icon: Network,
      keywords: ['ipv6', 'ula', 'fd00', 'eui-64', '地址', '生成'],
    },
    component: lazy(() => import('../tools/ipv6-ula')),
  },
  {
    meta: {
      id: 'mac-address',
      name: 'MAC 地址生成 / 查询',
      description: '生成合法物理地址并查询厂商归属',
      icon: Wifi,
      keywords: ['mac', 'oui', 'vendor', '网卡', '厂商', '地址'],
    },
    component: lazy(() => import('../tools/mac-address')),
  },
  {
    meta: {
      id: 'packet-debug',
      name: '抓包调试工具',
      description: 'HAR 解析、cURL 互转、请求构造与 Mock 服务',
      icon: Bug,
      keywords: ['har', 'curl', 'packet', 'mock', '抓包', '调试'],
    },
    component: lazy(() => import('../tools/packet-debug')),
  },
  {
    meta: {
      id: 'docker-compose',
      name: 'Docker Run 转 Compose',
      description: 'docker run 命令转换为 docker-compose.yml',
      icon: Container,
      keywords: ['docker', 'compose', 'run', '容器', '编排'],
    },
    component: lazy(() => import('../tools/docker-compose')),
  },
  {
    meta: {
      id: 'api-debug',
      name: '接口调试工具',
      description: '请求构造、cURL 互转、断言校验与 Mock 服务',
      icon: Zap,
      keywords: ['api', 'curl', 'http', 'request', 'mock', '接口', '调试'],
    },
    component: lazy(() => import('../tools/api-debug')),
  },
  {
    meta: {
      id: 'test-framework',
      name: '测试框架',
      description: '浏览器内用例运行器与外部测试框架导航',
      icon: FlaskConical,
      keywords: ['test', 'jest', 'vitest', 'pytest', '测试', '用例'],
    },
    component: lazy(() => import('../tools/test-framework')),
  },
  {
    meta: {
      id: 'static-analysis',
      name: '静态代码分析',
      description: '代码规范检查、坏味道检测与质量门禁',
      icon: Radar,
      keywords: ['static', 'lint', 'analysis', 'quality', '静态分析', '代码检查'],
    },
    component: lazy(() => import('../tools/static-analysis')),
  },
  {
    meta: {
      id: 'project-mgmt',
      name: '项目管理工具',
      description: '需求看板、迭代规划、任务跟踪与工时统计',
      icon: ListTodo,
      keywords: ['project', 'kanban', 'sprint', 'task', '项目', '看板', '迭代'],
    },
    component: lazy(() => import('../tools/project-mgmt')),
  },
  {
    meta: {
      id: 'ide',
      name: '代码编辑器 / IDE',
      description: 'IDE 选型、配置生成与插件推荐',
      icon: Code2,
      keywords: ['ide', 'vscode', 'jetbrains', 'vim', '编辑器', '配置'],
    },
    component: lazy(() => import('../tools/ide')),
  },
  {
    meta: {
      id: 'ai-assist',
      name: 'AI 编程助手',
      description: '提示词工程、工具选型与本地模型部署指南',
      icon: Sparkles,
      keywords: ['ai', 'prompt', 'llm', 'copilot', '提示词', '编程助手'],
    },
    component: lazy(() => import('../tools/ai-assist')),
  },
  {
    meta: {
      id: 'code-hosting',
      name: '代码托管平台',
      description: '平台对比、CLI 速查与协作工作流',
      icon: GitBranch,
      keywords: ['github', 'gitlab', 'git', 'cli', '代码托管', '协作'],
    },
    component: lazy(() => import('../tools/code-hosting')),
  },
  {
    meta: {
      id: 'text-obfuscate',
      name: '字符串混淆 / 反转',
      description: '字符顺序与编码层面的简单变换',
      icon: Shuffle,
      keywords: ['obfuscate', 'reverse', 'rot13', 'base58', '混淆', '反转'],
    },
    component: lazy(() => import('../tools/text-obfuscate')),
  },
  {
    meta: {
      id: 'icon-emoji',
      name: '图标与表情选择器',
      description: '检索并复制图标、Emoji 字符',
      icon: Smile,
      keywords: ['icon', 'emoji', '图标', '表情'],
    },
    component: lazy(() => import('../tools/icon-emoji')),
  },
  {
    meta: {
      id: 'image-convert',
      name: '图片压缩 / 格式转换',
      description: '无损与有损压缩、WebP/PNG/JPG 互转',
      icon: Image,
      keywords: ['image', 'compress', 'convert', 'webp', 'png', '图片', '压缩'],
    },
    component: lazy(() => import('../tools/image-convert')),
  },
  {
    meta: {
      id: 'pdf',
      name: 'PDF 处理',
      description: '合并、拆分、旋转、加密与文本提取',
      icon: FileText,
      keywords: ['pdf', 'merge', 'split', '合并', '拆分'],
    },
    component: lazy(() => import('../tools/pdf')),
  },
  {
    meta: {
      id: 'screenshot',
      name: '截图标注工具',
      description: '屏幕截取、贴图固定、箭头与文字标注',
      icon: Camera,
      keywords: ['screenshot', 'annotate', 'capture', '截图', '标注'],
    },
    component: lazy(() => import('../tools/screenshot')),
  },
  {
    meta: {
      id: 'terminal',
      name: '现代终端模拟器',
      description: '终端选型、配置生成与 tmux 速查',
      icon: SquareTerminal,
      keywords: ['terminal', 'alacritty', 'iterm2', 'tmux', '终端'],
    },
    component: lazy(() => import('../tools/terminal')),
  },
  {
    meta: {
      id: 'shell-framework',
      name: 'Shell 增强框架',
      description: 'Zsh / Bash 配置生成与效率技巧',
      icon: Terminal,
      keywords: ['shell', 'zsh', 'bash', 'starfish', '框架', '配置'],
    },
    component: lazy(() => import('../tools/shell-framework')),
  },
  {
    meta: {
      id: 'cli-efficiency',
      name: '命令行效率工具',
      description: '本地模糊搜索、高速文本检索与监控速查',
      icon: Search,
      keywords: ['fuzzy', 'grep', 'search', '模糊搜索', '检索'],
    },
    component: lazy(() => import('../tools/cli-efficiency')),
  },
  {
    meta: {
      id: 'package-manager',
      name: '包管理器',
      description: 'npm / pip / cargo 等命令速查与镜像配置',
      icon: Package,
      keywords: ['npm', 'pip', 'cargo', 'brew', '包管理', '镜像'],
    },
    component: lazy(() => import('../tools/package-manager')),
  },
  {
    meta: {
      id: 'container-runtime',
      name: '容器运行时',
      description: 'Docker 命令速查、Dockerfile 规范与镜像优化',
      icon: Container,
      keywords: ['docker', 'container', 'image', '容器', '镜像'],
    },
    component: lazy(() => import('../tools/container-runtime')),
  },
  {
    meta: {
      id: 'container-orchestration',
      name: '容器编排',
      description: 'Kubernetes 命令、YAML 清单生成与排障',
      icon: Boxes,
      keywords: ['kubernetes', 'k8s', 'kubectl', 'helm', '编排', '集群'],
    },
    component: lazy(() => import('../tools/container-orchestration')),
  },
  {
    meta: {
      id: 'vm',
      name: '虚拟机工具',
      description: '虚拟化方案对比、QEMU 命令与 Vagrant 配置',
      icon: Monitor,
      keywords: ['vm', 'qemu', 'vagrant', 'virtualbox', '虚拟机'],
    },
    component: lazy(() => import('../tools/vm')),
  },
  {
    meta: {
      id: 'wsl',
      name: 'Linux 子系统',
      description: 'WSL 配置生成、命令速查与排坑指南',
      icon: Layers,
      keywords: ['wsl', 'linux', 'windows', '子系统'],
    },
    component: lazy(() => import('../tools/wsl')),
  },
  {
    meta: {
      id: 'metrics',
      name: '指标监控',
      description: 'PromQL 速查、告警规则生成与指标口径',
      icon: Gauge,
      keywords: ['prometheus', 'promql', 'metrics', '监控', '指标'],
    },
    component: lazy(() => import('../tools/metrics')),
  },
  {
    meta: {
      id: 'logging',
      name: '日志系统',
      description: 'LogQL / ES DSL 速查与查询构造器',
      icon: ScrollText,
      keywords: ['loki', 'logql', 'elasticsearch', '日志', '查询'],
    },
    component: lazy(() => import('../tools/logging')),
  },
  {
    meta: {
      id: 'apm',
      name: '链路追踪 / APM',
      description: 'OpenTelemetry 埋点、查询速查与 SLO 计算器',
      icon: Activity,
      keywords: ['apm', 'tracing', 'opentelemetry', '链路', '追踪'],
    },
    component: lazy(() => import('../tools/apm')),
  },
  {
    meta: {
      id: 'notes',
      name: '笔记与知识库',
      description: '双向链接 Markdown 笔记、关系图谱与导入导出',
      icon: NotebookPen,
      keywords: ['notes', 'markdown', 'wiki', '笔记', '知识库'],
    },
    component: lazy(() => import('../tools/notes')),
  },
  {
    meta: {
      id: 'hosts-switch',
      name: 'Hosts 切换工具',
      description: '多套 hosts 配置管理与部署脚本生成',
      icon: Network,
      keywords: ['hosts', '域名', '屏蔽', '切换', '部署'],
    },
    component: lazy(() => import('../tools/hosts-switch')),
  },
  {
    meta: {
      id: 'clipboard',
      name: '剪贴板管理',
      description: '剪贴板历史、格式化粘贴与动作模板',
      icon: Clipboard,
      keywords: ['clipboard', 'paste', '剪贴板', '粘贴'],
    },
    component: lazy(() => import('../tools/clipboard')),
  },
  {
    meta: {
      id: 'password-manager',
      name: '密码管理器',
      description: 'PBKDF2 + AES-GCM 加密保险库与密码生成器',
      icon: KeyRound,
      keywords: ['password', 'vault', '密码', '保险库', '加密'],
    },
    component: lazy(() => import('../tools/password-manager')),
  },
  {
    meta: {
      id: 'dev-nav',
      name: '开发者导航站',
      description: '按场景聚合常用开发站点入口',
      icon: Compass,
      keywords: ['nav', 'links', '导航', '站点'],
    },
    component: lazy(() => import('../tools/dev-nav')),
  },
  {
    meta: {
      id: 'userscript',
      name: '浏览器脚本扩展',
      description: '生成 Tampermonkey / Violentmonkey 用户脚本',
      icon: Pencil,
      keywords: ['userscript, tampermonkey, violentmonkey, 脚本, 浏览器'],
    },
    component: lazy(() => import('../tools/userscript')),
  },
];

/**
 * 工具树：顶层为分类，第二层为子分组，叶子为工具。
 * 递归渲染器（<ToolTree />）不依赖层级深度，新增子分组无需改动 UI。
 */
export const TOOL_TREE: NavGroup[] = [
  {
    type: 'group',
    id: 'security',
    label: '加密与安全',
    icon: ShieldCheck,
    description: '密钥、摘要、签名与加密',
    children: [
      { type: 'tool', toolId: 'token' },
      { type: 'tool', toolId: 'uuid' },
      { type: 'tool', toolId: 'password-strength' },
      { type: 'tool', toolId: 'hash' },
      { type: 'tool', toolId: 'hmac' },
      { type: 'tool', toolId: 'rsa' },
      { type: 'tool', toolId: 'aes' },
      { type: 'tool', toolId: 'bcrypt' },
      { type: 'tool', toolId: 'security-scan' },
    ],
  },
  {
    type: 'group',
    id: 'encoding',
    label: '编码转换',
    icon: ArrowLeftRight,
    description: '各种编码之间的相互转换',
    children: [
      { type: 'tool', toolId: 'base64' },
      { type: 'tool', toolId: 'url-encode' },
      { type: 'tool', toolId: 'html-entity' },
      { type: 'tool', toolId: 'number-base' },
      { type: 'tool', toolId: 'unicode' },
      { type: 'tool', toolId: 'punycode' },
      { type: 'tool', toolId: 'charset-convert' },
    ],
  },
  {
    type: 'group',
    id: 'data',
    label: '数据格式',
    icon: Braces,
    description: '结构化数据的解析与格式化',
    children: [
      {
        type: 'group',
        id: 'data-format',
        label: '格式化',
        icon: Braces,
        children: [
          { type: 'tool', toolId: 'json-formatter' },
          { type: 'tool', toolId: 'sql' },
          { type: 'tool', toolId: 'yaml-xml' },
          { type: 'tool', toolId: 'markdown' },
        ],
      },
      {
        type: 'group',
        id: 'data-convert',
        label: '转换',
        icon: ArrowLeftRight,
        children: [
          { type: 'tool', toolId: 'json-convert' },
          { type: 'tool', toolId: 'json-to-code' },
          { type: 'tool', toolId: 'table-convert' },
        ],
      },
      { type: 'tool', toolId: 'jwt' },
      { type: 'tool', toolId: 'db-client' },
    ],
  },
  {
    type: 'group',
    id: 'network',
    label: '网络工具',
    icon: Network,
    description: '地址、协议与网络信息',
    children: [
      { type: 'tool', toolId: 'ipv4-subnet' },
      { type: 'tool', toolId: 'ip-convert' },
      { type: 'tool', toolId: 'ipv6-ula' },
      { type: 'tool', toolId: 'mac-address' },
      { type: 'tool', toolId: 'geohash' },
      {
        type: 'group',
        id: 'network-web',
        label: 'Web 调试',
        icon: Network,
        children: [
          { type: 'tool', toolId: 'http-status' },
          { type: 'tool', toolId: 'url-parser' },
          { type: 'tool', toolId: 'user-agent' },
          { type: 'tool', toolId: 'packet-debug' },
        ],
      },
    ],
  },
  {
    type: 'group',
    id: 'dev',
    label: '开发辅助',
    icon: Code2,
    description: '日常开发中的辅助工具',
    children: [
      { type: 'tool', toolId: 'regex' },
      { type: 'tool', toolId: 'cron' },
      { type: 'tool', toolId: 'chmod' },
      { type: 'tool', toolId: 'git' },
      { type: 'tool', toolId: 'docker-compose' },
      { type: 'tool', toolId: 'api-debug' },
      { type: 'tool', toolId: 'test-framework' },
      { type: 'tool', toolId: 'static-analysis' },
      { type: 'tool', toolId: 'project-mgmt' },
      {
        type: 'group',
        id: 'dev-platform',
        label: '平台与 AI',
        icon: Sparkles,
        children: [
          { type: 'tool', toolId: 'ide' },
          { type: 'tool', toolId: 'ai-assist' },
          { type: 'tool', toolId: 'code-hosting' },
        ],
      },
    ],
  },
  {
    type: 'group',
    id: 'text',
    label: '文本处理',
    icon: Braces,
    description: '文本的清洗、统计与格式转换',
    children: [
      { type: 'tool', toolId: 'case' },
      { type: 'tool', toolId: 'text-diff' },
      { type: 'tool', toolId: 'json-diff' },
      { type: 'tool', toolId: 'text-stats' },
      { type: 'tool', toolId: 'text-clean' },
      { type: 'tool', toolId: 'slug' },
      { type: 'tool', toolId: 'lorem' },
      { type: 'tool', toolId: 'text-obfuscate' },
    ],
  },
  {
    type: 'group',
    id: 'media',
    label: '图像与媒体',
    icon: Palette,
    description: '图像、颜色与二维码',
    children: [
      { type: 'tool', toolId: 'qr' },
      { type: 'tool', toolId: 'wifi-qr' },
      { type: 'tool', toolId: 'placeholder-image' },
      { type: 'tool', toolId: 'color' },
      { type: 'tool', toolId: 'icon-emoji' },
      { type: 'tool', toolId: 'image-convert' },
      { type: 'tool', toolId: 'pdf' },
      { type: 'tool', toolId: 'screenshot' },
    ],
  },
  {
    type: 'group',
    id: 'time',
    label: '时间与单位',
    icon: CalendarClock,
    description: '时间戳、时区与单位换算',
    children: [
      { type: 'tool', toolId: 'timestamp' },
      { type: 'tool', toolId: 'timezone' },
      { type: 'tool', toolId: 'date-calc' },
      {
        type: 'group',
        id: 'time-unit',
        label: '单位与计时',
        icon: Timer,
        children: [
          { type: 'tool', toolId: 'unit' },
          { type: 'tool', toolId: 'timer' },
        ],
      },
    ],
  },
  {
    type: 'group',
    id: 'terminal',
    label: '终端与环境',
    icon: Terminal,
    description: '终端、Shell 与命令行效率',
    children: [
      { type: 'tool', toolId: 'terminal' },
      { type: 'tool', toolId: 'shell-framework' },
      { type: 'tool', toolId: 'cli-efficiency' },
      { type: 'tool', toolId: 'package-manager' },
    ],
  },
  {
    type: 'group',
    id: 'container',
    label: '容器与虚拟化',
    icon: Container,
    description: '容器、编排与虚拟机',
    children: [
      { type: 'tool', toolId: 'container-runtime' },
      { type: 'tool', toolId: 'container-orchestration' },
      { type: 'tool', toolId: 'vm' },
      { type: 'tool', toolId: 'wsl' },
    ],
  },
  {
    type: 'group',
    id: 'ops',
    label: '监控与运维',
    icon: Activity,
    description: '指标、日志与链路追踪',
    children: [
      { type: 'tool', toolId: 'metrics' },
      { type: 'tool', toolId: 'logging' },
      { type: 'tool', toolId: 'apm' },
    ],
  },
  {
    type: 'group',
    id: 'docs',
    label: '文档与知识',
    icon: NotebookPen,
    description: '笔记与知识库',
    children: [{ type: 'tool', toolId: 'notes' }],
  },
  {
    type: 'group',
    id: 'efficiency',
    label: '效率辅助',
    icon: Clipboard,
    description: 'Hosts、剪贴板与密码管理',
    children: [
      { type: 'tool', toolId: 'hosts-switch' },
      { type: 'tool', toolId: 'clipboard' },
      { type: 'tool', toolId: 'password-manager' },
      { type: 'tool', toolId: 'userscript' },
    ],
  },
  {
    type: 'group',
    id: 'nav',
    label: '导航聚合',
    icon: Compass,
    description: '开发者导航站',
    children: [{ type: 'tool', toolId: 'dev-nav' }],
  },
];

export const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.meta.id, tool]));

export const DEFAULT_TOOL = TOOLS[0];
export const DEFAULT_TOOL_ID = DEFAULT_TOOL.meta.id;

function collectPaths(nodes: NavNode[], trail: string[], out: Map<string, string[]>) {
  for (const node of nodes) {
    if (node.type === 'tool') {
      if (!out.has(node.toolId)) out.set(node.toolId, trail);
      continue;
    }
    collectPaths(node.children, [...trail, node.label], out);
  }
}

const TOOL_PATHS = new Map<string, string[]>();
for (const group of TOOL_TREE) collectPaths(group.children, [group.label], TOOL_PATHS);

/** 工具所属的分类路径，例如 ['数据格式', '格式化']。 */
export function toolCategoryPath(toolId: string): string[] {
  return TOOL_PATHS.get(toolId) ?? ['其他'];
}

/** 面包屑字符串，例如「数据格式 / 格式化」。 */
export function toolCategoryLabel(toolId: string): string {
  return toolCategoryPath(toolId).join(' / ');
}

export interface GroupStat {
  /** 该分组及其所有子分组中的工具数量。 */
  count: number;
  /** 该分组及其所有子分组中的工具 id，按树顺序。 */
  toolIds: string[];
  /** 每个工具 id 对应的祖先分组 id（由外到内，不含自身）。 */
  ancestors: Map<string, string[]>;
}

function collectInto(nodes: NavNode[], trail: string[], stat: GroupStat, stats: Map<string, GroupStat>): void {
  for (const node of nodes) {
    if (node.type === 'tool') {
      stat.count += 1;
      stat.toolIds.push(node.toolId);
      if (!stat.ancestors.has(node.toolId)) stat.ancestors.set(node.toolId, trail);
      continue;
    }
    const nested: GroupStat = { count: 0, toolIds: [], ancestors: new Map() };
    stats.set(node.id, nested);
    collectInto(node.children, [...trail, node.id], nested, stats);
    stat.count += nested.count;
    stat.toolIds.push(...nested.toolIds);
    for (const [toolId, path] of nested.ancestors) stat.ancestors.set(toolId, path);
  }
}

const EMPTY_GROUP_STAT: GroupStat = { count: 0, toolIds: [], ancestors: new Map() };

const GROUP_STATS = new Map<string, GroupStat>();
for (const group of TOOL_TREE) {
  const stat: GroupStat = { count: 0, toolIds: [], ancestors: new Map() };
  GROUP_STATS.set(group.id, stat);
  collectInto(group.children, [group.id], stat, GROUP_STATS);
}

/** 树中出现过的所有工具 id，按树的视觉顺序，用于 Alt+方向键逐个切换。 */
export const TREE_TOOL_IDS: string[] = TOOL_TREE.flatMap((group) => groupStat(group.id).toolIds);

export function groupStat(groupId: string): GroupStat {
  return GROUP_STATS.get(groupId) ?? EMPTY_GROUP_STAT;
}

export function groupToolCount(groupId: string): number {
  return groupStat(groupId).count;
}

/** 展开某个工具时需要同时展开的祖先分组 id。 */
export function ancestorGroupIds(toolId: string): string[] {
  for (const group of TOOL_TREE) {
    const ancestors = groupStat(group.id).ancestors.get(toolId);
    if (ancestors) return ancestors;
  }
  return [];
}

export function findTool(id: string): Tool | undefined {
  return TOOL_MAP.get(id);
}

export function resolveTool(id: string): Tool {
  return TOOL_MAP.get(id) ?? DEFAULT_TOOL;
}

export function searchTools(query: string): Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  return TOOLS.filter((tool) => {
    const { name, description, keywords, id } = tool.meta;
    const path = toolCategoryLabel(id);
    return (
      name.toLowerCase().includes(q) ||
      description.toLowerCase().includes(q) ||
      id.includes(q) ||
      path.toLowerCase().includes(q) ||
      keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
}
