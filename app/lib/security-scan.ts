/**
 * 本地安全自检的纯逻辑部分。
 *
 * 定位与边界：这里只做**本地静态检查**——解析依赖清单、按内置漏洞快照比对版本、
 * 用正则扫描危险用法与硬编码密钥。它不会联网、不会执行任何被扫描的代码，
 * 也不等同于渗透测试或完整 SCA 审计。结论需要与官方数据库二次核对。
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'dependency' | 'config' | 'dangerous' | 'secret';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '提示',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  dependency: '依赖漏洞',
  config: '配置风险',
  dangerous: '危险用法',
  secret: '密钥泄漏',
};

export const CATEGORY_TONE: Record<Category, string> = {
  dependency: 'border-destructive/40 bg-destructive/5',
  config: 'border-amber-500/40 bg-amber-500/5',
  dangerous: 'border-amber-500/40 bg-amber-500/5',
  secret: 'border-destructive/40 bg-destructive/5',
};

export interface ScanFile {
  name: string;
  content: string;
}

export interface Finding {
  /** 规则编号，便于在报告中检索。 */
  rule: string;
  title: string;
  severity: Severity;
  category: Category;
  file: string;
  line: number;
  /** 命中位置的原始文本（密钥类已脱敏）。 */
  evidence: string;
  advice: string;
  /** 依赖漏洞的附加信息。 */
  extra?: string;
}

export interface ScanReport {
  findings: Finding[];
  stats: Record<Severity, number>;
  /** 各分类命中数。 */
  categories: Record<Category, number>;
  scanned: { name: string; lines: number; kind: string }[];
  /** 版本无法确定、需人工核对的依赖条目。 */
  skipped: string[];
  gate: { threshold: Severity; passed: boolean; blocking: number; message: string };
  totals: { files: number; lines: number; findings: number; durationMs: number };
}

export interface ManifestSupport {
  name: string;
  ecosystem: string;
  description: string;
}

export const SUPPORTED_MANIFESTS: ManifestSupport[] = [
  {
    name: 'package.json',
    ecosystem: 'npm',
    description: '读取 dependencies / devDependencies / peerDependencies 的精确版本',
  },
  { name: 'package-lock.json', ecosystem: 'npm', description: '读取 packages 中已锁定的版本' },
  { name: 'requirements.txt', ecosystem: 'PyPI', description: '逐行解析 ==、>=、~= 等固定写法' },
  { name: 'Pipfile.lock', ecosystem: 'PyPI', description: '解析 [[packages]] 的 name 与 version' },
  { name: 'pyproject.toml', ecosystem: 'PyPI', description: '解析 project.dependencies 与可选依赖组' },
  { name: 'pom.xml', ecosystem: 'Maven', description: '解析 dependency 节点与 version 属性' },
  { name: 'build.gradle', ecosystem: 'Gradle', description: '解析 implementation/api 等坐标' },
  { name: 'go.mod', ecosystem: 'Go', description: '解析 require 块与单行 require' },
  { name: 'Cargo.toml', ecosystem: 'crates.io', description: '解析 dependencies 与 dev-dependencies' },
  { name: 'composer.json', ecosystem: 'Composer', description: '解析 require 与 require-dev' },
];

export const FILE_KIND: Record<string, string> = {
  'package.json': 'npm 清单',
  'package-lock.json': 'npm 锁文件',
  'requirements.txt': 'Python 依赖',
  'Pipfile.lock': 'Python 锁文件',
  'pyproject.toml': 'Python 项目配置',
  'pom.xml': 'Maven 清单',
  'build.gradle': 'Gradle 构建脚本',
  'go.mod': 'Go 模块',
  'Cargo.toml': 'Rust 清单',
  'composer.json': 'Composer 清单',
};

export function manifestKind(name: string): string | null {
  const base = name.split('/').pop() ?? name;
  return FILE_KIND[base] ?? null;
}

/* ------------------------------------------------------------------ 版本比较 */

/** 提取版本号里的主次修订数字，非数字后缀（如 -rc1）忽略。 */
export function parseVersion(raw: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** 比较两个版本：a < b 返回负数，相等返回 0。 */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/** 版本是否低于修复版本。 */
export function isBelow(version: [number, number, number], fixed: [number, number, number]): boolean {
  return compareVersions(version, fixed) < 0;
}

/* -------------------------------------------------------------- 漏洞快照 */

export interface Advisory {
  ecosystem: string;
  package: string;
  /** 修复版本，低于该版本视为受影响。 */
  fixed: string;
  severity: Severity;
  cve: string;
  cwe: string;
  summary: string;
  advice: string;
}

/**
 * 内置漏洞快照：挑选公开、影响面广、修复版本明确的历史漏洞。
 * 这是本地快照而非权威数据库，正式结论请用页面底部的官方工具复核。
 */
export const ADVISORIES: Advisory[] = [
  // ---------- npm ----------
  {
    ecosystem: 'npm',
    package: 'lodash',
    fixed: '4.17.21',
    severity: 'high',
    cve: 'CVE-2021-23337',
    cwe: 'CWE-94',
    summary: '模板注入导致命令注入',
    advice: '升级到 4.17.21 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'minimist',
    fixed: '1.2.6',
    severity: 'critical',
    cve: 'CVE-2021-44906',
    cwe: 'CWE-1321',
    summary: '原型链污染可覆写 Object 原型',
    advice: '升级到 1.2.6 或改用 yargs',
  },
  {
    ecosystem: 'npm',
    package: 'qs',
    fixed: '6.5.3',
    severity: 'high',
    cve: 'CVE-2022-24999',
    cwe: 'CWE-1321',
    summary: '原型链污染影响鉴权判断',
    advice: '升级到 6.5.3 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'axios',
    fixed: '0.21.1',
    severity: 'high',
    cve: 'CVE-2020-28168',
    cwe: 'CWE-918',
    summary: '低版本存在 SSRF',
    advice: '升级到 1.x 最新版',
  },
  {
    ecosystem: 'npm',
    package: 'jsonwebtoken',
    fixed: '9.0.0',
    severity: 'high',
    cve: 'CVE-2022-23529',
    cwe: 'CWE-287',
    summary: '密钥/公钥校验缺陷导致令牌伪造',
    advice: '升级到 9.0.0 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'moment',
    fixed: '2.29.4',
    severity: 'medium',
    cve: 'CVE-2022-31129',
    cwe: 'CWE-1333',
    summary: '超长日期字符串触发 ReDoS',
    advice: '升级到 2.29.4 或改用 date-fns / Temporal',
  },
  {
    ecosystem: 'npm',
    package: 'semver',
    fixed: '7.5.2',
    severity: 'medium',
    cve: 'CVE-2022-25883',
    cwe: 'CWE-1333',
    summary: '范围解析 ReDoS',
    advice: '升级到 7.5.2 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'node-fetch',
    fixed: '2.6.7',
    severity: 'medium',
    cve: 'CVE-2022-0235',
    cwe: 'CWE-200',
    summary: '跨域重定向泄露鉴权头',
    advice: '升级到 2.6.7 或改用原生 fetch',
  },
  {
    ecosystem: 'npm',
    package: 'express',
    fixed: '4.17.3',
    severity: 'medium',
    cve: 'CVE-2022-24999',
    cwe: 'CWE-601',
    summary: '旧版本存在开放重定向与 XSS',
    advice: '升级到 4.19+ 或 5.x',
  },
  {
    ecosystem: 'npm',
    package: 'follow-redirects',
    fixed: '1.15.6',
    severity: 'medium',
    cve: 'CVE-2024-28849',
    cwe: 'CWE-601',
    summary: '跨协议重定向泄露 Proxy-Authorization',
    advice: '升级到 1.15.6 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'tough-cookie',
    fixed: '4.1.3',
    severity: 'high',
    cve: 'CVE-2023-26136',
    cwe: 'CWE-400',
    summary: '原型链污染导致拒绝服务',
    advice: '升级到 4.1.3 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'marked',
    fixed: '4.0.10',
    severity: 'medium',
    cve: 'CVE-2022-21680',
    cwe: 'CWE-79',
    summary: 'Markdown 渲染可注入脚本',
    advice: '升级到 4.0.10 或 9.x，并配合 sanitize',
  },
  {
    ecosystem: 'npm',
    package: 'tar',
    fixed: '6.2.1',
    severity: 'high',
    cve: 'CVE-2021-37713',
    cwe: 'CWE-22',
    summary: '解压时可写出任意路径文件',
    advice: '升级到 6.2.1 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'glob-parent',
    fixed: '5.1.2',
    severity: 'medium',
    cve: 'CVE-2020-28469',
    cwe: 'CWE-1333',
    summary: 'ReDoS',
    advice: '升级到 5.1.2 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'minimatch',
    fixed: '3.0.5',
    severity: 'medium',
    cve: 'CVE-2022-3517',
    cwe: 'CWE-1333',
    summary: 'ReDoS',
    advice: '升级到 3.0.5 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'braces',
    fixed: '3.0.3',
    severity: 'high',
    cve: 'CVE-2024-4068',
    cwe: 'CWE-1050',
    summary: '可控范围导致资源耗尽',
    advice: '升级到 3.0.3 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'micromatch',
    fixed: '4.0.8',
    severity: 'high',
    cve: 'CVE-2024-4067',
    cwe: 'CWE-1050',
    summary: '文件名绕过访问控制',
    advice: '升级到 4.0.8 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'nanoid',
    fixed: '3.3.8',
    severity: 'medium',
    cve: 'CVE-2024-55565',
    cwe: 'CWE-330',
    summary: '可预测随机数用于密钥',
    advice: '升级到 3.3.8 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'ws',
    fixed: '8.17.1',
    severity: 'medium',
    cve: 'CVE-2024-37890',
    cwe: 'CWE-400',
    summary: '大量 HTTP 头导致 DoS',
    advice: '升级到 8.17.1 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'vite',
    fixed: '5.4.12',
    severity: 'high',
    cve: 'CVE-2025-30208',
    cwe: 'CWE-22',
    summary: '开发服务器可被读取项目内任意文件',
    advice: '升级到 5.4.12 / 6.0.6 及以上',
  },
  {
    ecosystem: 'npm',
    package: 'next',
    fixed: '14.2.5',
    severity: 'medium',
    cve: 'CVE-2024-34351',
    cwe: 'CWE-400',
    summary: '服务端组件可被 DoS',
    advice: '升级到 14.2.5 及以上',
  },
  // ---------- PyPI ----------
  {
    ecosystem: 'PyPI',
    package: 'pyyaml',
    fixed: '5.4',
    severity: 'critical',
    cve: 'CVE-2020-14343',
    cwe: 'CWE-502',
    summary: 'yaml.load 可反序列化执行任意代码',
    advice: '升级到 5.4+ / 6.x，并使用 yaml.safe_load',
  },
  {
    ecosystem: 'PyPI',
    package: 'jinja2',
    fixed: '3.1.4',
    severity: 'high',
    cve: 'CVE-2024-22195',
    cwe: 'CWE-79',
    summary: 'xmlattr 过滤器可注入 HTML',
    advice: '升级到 3.1.4 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'jinja2',
    fixed: '3.1.6',
    severity: 'high',
    cve: 'CVE-2024-56326',
    cwe: 'CWE-79',
    summary: '沙箱逃逸（str.format）',
    advice: '升级到 3.1.6 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'cryptography',
    fixed: '42.0.0',
    severity: 'high',
    cve: 'CVE-2024-26130',
    cwe: 'CWE-476',
    summary: 'NULL 指针解引用导致崩溃',
    advice: '升级到 42.0.0 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'requests',
    fixed: '2.31.0',
    severity: 'medium',
    cve: 'CVE-2023-32681',
    cwe: 'CWE-200',
    summary: '重定向时泄露 Proxy-Authorization',
    advice: '升级到 2.31.0 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'urllib3',
    fixed: '2.2.2',
    severity: 'medium',
    cve: 'CVE-2024-37891',
    cwe: 'CWE-772',
    summary: '重定向时请求体未清除导致敏感信息泄露',
    advice: '升级到 2.2.2 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'flask',
    fixed: '2.2.5',
    severity: 'medium',
    cve: 'CVE-2023-30861',
    cwe: 'CWE-539',
    summary: '会话 Cookie 可被代理缓存',
    advice: '升级到 2.2.5 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'werkzeug',
    fixed: '2.2.3',
    severity: 'high',
    cve: 'CVE-2023-25577',
    cwe: 'CWE-400',
    summary: 'multipart 解析导致内存耗尽',
    advice: '升级到 2.2.3 / 3.0.1 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'lxml',
    fixed: '4.9.1',
    severity: 'high',
    cve: 'CVE-2022-2309',
    cwe: 'CWE-476',
    summary: 'NULL 指针解引用',
    advice: '升级到 4.9.1 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'pillow',
    fixed: '10.3.0',
    severity: 'critical',
    cve: 'CVE-2023-50447',
    cwe: 'CWE-94',
    summary: 'ImageMath.eval 可执行任意 Python 代码',
    advice: '升级到 10.3.0 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'pillow',
    fixed: '9.5.0',
    severity: 'high',
    cve: 'CVE-2023-44271',
    cwe: 'CWE-787',
    summary: '字体解析整数溢出',
    advice: '升级到 9.5.0 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'django',
    fixed: '3.2.15',
    severity: 'medium',
    cve: 'CVE-2022-34265',
    cwe: 'CWE-400',
    summary: 'Trunc/DateField 触发 DoS',
    advice: '升级到 3.2.15 / 4.1.9 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'setuptools',
    fixed: '65.5.1',
    severity: 'medium',
    cve: 'CVE-2022-40897',
    cwe: 'CWE-22',
    summary: '包索引下载路径穿越',
    advice: '升级到 65.5.1 及以上',
  },
  {
    ecosystem: 'PyPI',
    package: 'paramiko',
    fixed: '3.4.0',
    severity: 'high',
    cve: 'CVE-2023-48795',
    cwe: 'CWE-347',
    summary: 'SSH 握手 Terrapin 类问题',
    advice: '升级到 3.4.0 及以上',
  },
  // ---------- Maven / Gradle ----------
  {
    ecosystem: 'Maven',
    package: 'org.apache.logging.log4j:log4j-core',
    fixed: '2.17.1',
    severity: 'critical',
    cve: 'CVE-2021-44228',
    cwe: 'CWE-502',
    summary: 'Log4Shell：JNDI 注入远程执行',
    advice: '升级到 2.17.1 及以上（2.12.4 需改为 2.17.1）',
  },
  {
    ecosystem: 'Maven',
    package: 'org.apache.logging.log4j:log4j-api',
    fixed: '2.17.1',
    severity: 'critical',
    cve: 'CVE-2021-44228',
    cwe: 'CWE-502',
    summary: 'Log4Shell 依赖链组件',
    advice: '升级到 2.17.1 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'org.apache.commons:commons-collections',
    fixed: '3.2.2',
    severity: 'critical',
    cve: 'CVE-2015-6420',
    cwe: 'CWE-502',
    summary: '反序列化 gadget 可远程执行',
    advice: '升级到 3.2.2，禁用危险的反序列化入口',
  },
  {
    ecosystem: 'Maven',
    package: 'org.apache.commons:commons-text',
    fixed: '1.10.0',
    severity: 'critical',
    cve: 'CVE-2022-42889',
    cwe: 'CWE-502',
    summary: 'Text4Shell：字符串插值脚本引擎执行',
    advice: '升级到 1.10.0 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'org.yaml:snakeyaml',
    fixed: '2.0',
    severity: 'critical',
    cve: 'CVE-2022-1471',
    cwe: 'CWE-502',
    summary: '不安全构造器可远程执行',
    advice: '升级到 2.0 及以上，使用 SafeConstructor',
  },
  {
    ecosystem: 'Maven',
    package: 'com.fasterxml.jackson.core:jackson-databind',
    fixed: '2.15.3',
    severity: 'high',
    cve: 'CVE-2023-35116',
    cwe: 'CWE-400',
    summary: '深层嵌套导致栈溢出 DoS',
    advice: '升级到 2.15.3 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'ch.qos.logback:logback-classic',
    fixed: '1.3.12',
    severity: 'high',
    cve: 'CVE-2023-6378',
    cwe: 'CWE-502',
    summary: 'SSO 数据可被反序列化执行',
    advice: '升级到 1.3.12 / 1.4.12 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'commons-io:commons-io',
    fixed: '2.11.0',
    severity: 'high',
    cve: 'CVE-2021-29425',
    cwe: 'CWE-22',
    summary: '路径穿越可读取任意文件',
    advice: '升级到 2.11.0 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'org.springframework:spring-core',
    fixed: '5.3.31',
    severity: 'high',
    cve: 'CVE-2022-22965',
    cwe: 'CWE-94',
    summary: 'Spring4Shell 类参数绑定问题',
    advice: '升级到 5.3.31 / 6.0.0 及以上',
  },
  {
    ecosystem: 'Maven',
    package: 'com.h2database:h2',
    fixed: '2.1.214',
    severity: 'high',
    cve: 'CVE-2021-42392',
    cwe: 'CWE-94',
    summary: '控制台可被 RCE 利用',
    advice: '升级到 2.1.214 及以上，生产禁用 h2-console',
  },
  // ---------- Go ----------
  {
    ecosystem: 'Go',
    package: 'golang.org/x/crypto',
    fixed: '0.17.0',
    severity: 'high',
    cve: 'CVE-2023-48795',
    cwe: 'CWE-347',
    summary: 'SSH Terrapin 中间人攻击',
    advice: '升级到 0.17.0 及以上',
  },
  {
    ecosystem: 'Go',
    package: 'golang.org/x/net',
    fixed: '0.23.0',
    severity: 'high',
    cve: 'CVE-2023-45288',
    cwe: 'CWE-400',
    summary: 'HTTP/2 CONTINUATION 洪泛 DoS',
    advice: '升级到 0.23.0 及以上',
  },
  {
    ecosystem: 'Go',
    package: 'golang.org/x/net',
    fixed: '0.33.0',
    severity: 'medium',
    cve: 'CVE-2024-45338',
    cwe: 'CWE-400',
    summary: 'HTML 解析资源耗尽',
    advice: '升级到 0.33.0 及以上',
  },
  {
    ecosystem: 'Go',
    package: 'google.golang.org/protobuf',
    fixed: '1.33.0',
    severity: 'high',
    cve: 'CVE-2024-24786',
    cwe: 'CWE-835',
    summary: '解析畸形消息导致无限循环',
    advice: '升级到 1.33.0 及以上',
  },
  {
    ecosystem: 'Go',
    package: 'gopkg.in/yaml.v2',
    fixed: '2.4.0',
    severity: 'critical',
    cve: 'CVE-2022-28948',
    cwe: 'CWE-502',
    summary: '别名引用导致任意文件读取',
    advice: '升级到 2.4.0 或改用 gopkg.in/yaml.v3',
  },
  {
    ecosystem: 'Go',
    package: 'github.com/gin-gonic/gin',
    fixed: '1.9.1',
    severity: 'medium',
    cve: 'CVE-2023-29400',
    cwe: 'CWE-79',
    summary: 'X-Forwarded-Prefix 处理不当导致 XSS',
    advice: '升级到 1.9.1 及以上',
  },
  {
    ecosystem: 'Go',
    package: 'github.com/gogo/protobuf',
    fixed: '1.3.2',
    severity: 'high',
    cve: 'CVE-2021-3121',
    cwe: 'CWE-400',
    summary: '畸形输入导致内存耗尽',
    advice: '升级到 1.3.2 或迁移到 google.golang.org/protobuf',
  },
  // ---------- crates.io ----------
  {
    ecosystem: 'crates.io',
    package: 'time',
    fixed: '0.2.23',
    severity: 'high',
    cve: 'CVE-2020-26235',
    cwe: 'CWE-835',
    summary: '本地时区解析触发无限循环',
    advice: '升级到 0.2.23 及以上',
  },
  {
    ecosystem: 'crates.io',
    package: 'openssl',
    fixed: '0.10.55',
    severity: 'high',
    cve: 'CVE-2021-3712',
    cwe: 'CWE-476',
    summary: 'X509 名称解析可致崩溃 / 越界读',
    advice: '升级到 0.10.55 及以上',
  },
  {
    ecosystem: 'crates.io',
    package: 'smallvec',
    fixed: '0.6.14',
    severity: 'medium',
    cve: 'CVE-2021-25900',
    cwe: 'CWE-125',
    summary: '越界读',
    advice: '升级到 0.6.14 及以上',
  },
  {
    ecosystem: 'crates.io',
    package: 'rsa',
    fixed: '0.7.2',
    severity: 'critical',
    cve: 'CVE-2022-1897',
    cwe: 'CWE-78',
    summary: '解密预言机可私钥泄露',
    advice: '升级到 0.7.2 及以上',
  },
  {
    ecosystem: 'crates.io',
    package: 'tokio',
    fixed: '1.18.4',
    severity: 'medium',
    cve: 'CVE-2021-45710',
    cwe: 'CWE-400',
    summary: 'Windows 命名管道可被无限阻塞',
    advice: '升级到 1.18.4 及以上',
  },
  {
    ecosystem: 'crates.io',
    package: 'hyper',
    fixed: '0.14.27',
    severity: 'medium',
    cve: 'CVE-2023-45288',
    cwe: 'CWE-400',
    summary: 'HTTP/2 相关资源耗尽（历史条目）',
    advice: '升级到 0.14.27 及以上',
  },
  // ---------- Composer ----------
  {
    ecosystem: 'Composer',
    package: 'guzzlehttp/guzzle',
    fixed: '7.4.5',
    severity: 'high',
    cve: 'CVE-2022-31090',
    cwe: 'CWE-200',
    summary: '重定向泄露 Cookie / Authorization',
    advice: '升级到 7.4.5 及以上',
  },
  {
    ecosystem: 'Composer',
    package: 'phpmailer/phpmailer',
    fixed: '6.8.0',
    severity: 'high',
    cve: 'CVE-2022-3607',
    cwe: 'CWE-79',
    summary: '发件人地址可注入脚本',
    advice: '升级到 6.8.0 及以上',
  },
  {
    ecosystem: 'Composer',
    package: 'symfony/http-foundation',
    fixed: '5.4.35',
    severity: 'medium',
    cve: 'CVE-2022-24894',
    cwe: 'CWE-601',
    summary: 'cookie 处理不当导致会话固定',
    advice: '升级到 5.4.35 / 6.x 最新',
  },
  {
    ecosystem: 'Composer',
    package: 'monolog/monolog',
    fixed: '2.8.0',
    severity: 'medium',
    cve: 'CVE-2022-24821',
    cwe: 'CWE-117',
    summary: '日志未转义可伪造日志行',
    advice: '升级到 2.8.0 及以上',
  },
  {
    ecosystem: 'Composer',
    package: 'laravel/framework',
    fixed: '9.35.0',
    severity: 'medium',
    cve: 'CVE-2022-31002',
    cwe: 'CWE-352',
    summary: 'CSRF 防护可被绕过',
    advice: '升级到 9.35.0 及以上',
  },
];

/* ------------------------------------------------------------ 依赖解析 */

export interface Dependency {
  name: string;
  version: string;
  ecosystem: string;
  line: number;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function depFinding(dep: Dependency, advisory: Advisory): Finding {
  return {
    rule: `DEP-${advisory.cve}`,
    title: `${dep.name} ${dep.version} 受 ${advisory.cve} 影响`,
    severity: advisory.severity,
    category: 'dependency',
    file: '',
    line: dep.line,
    evidence: `${dep.name}@${dep.version} < ${advisory.fixed}`,
    advice: advisory.advice,
    extra: `${advisory.summary}（${advisory.cwe}）`,
  };
}

/** 在依赖列表里比对漏洞快照，返回受影响条目与无法判定的条目。 */
export function matchAdvisories(deps: Dependency[]): { hits: Finding[]; unknown: string[] } {
  const hits: Finding[] = [];
  const unknown: string[] = [];
  for (const dep of deps) {
    const advisories = ADVISORIES.filter(
      (item) => item.ecosystem === dep.ecosystem && item.package.toLowerCase() === dep.name.toLowerCase(),
    );
    if (advisories.length === 0) continue;
    const version = parseVersion(dep.version);
    if (!version) {
      unknown.push(`${dep.name}@${dep.version}`);
      continue;
    }
    for (const advisory of advisories) {
      const fixed = parseVersion(advisory.fixed);
      if (fixed && isBelow(version, fixed)) {
        hits.push({ ...depFinding(dep, advisory), extra: `${advisory.cve} · ${advisory.summary} · ${advisory.cwe}` });
      }
    }
  }
  return { hits, unknown };
}

const SKIP_VERSION = /^(latest|\*|x|-)/i;

/** 去掉 ^ ~ >= 等范围前缀；剩余部分不是纯版本号时返回 null（交给人工核对）。 */
export function normalizeRange(raw: string): string | null {
  const cleaned = raw.trim().replace(/^[\^~=><v\s]+/, '');
  if (cleaned === '' || /[|,\s]/.test(cleaned)) return null;
  if (!/^\d/.test(cleaned)) return null;
  return cleaned.replace(/^(\d+)(\.\d+)?(\.\d+)?.*$/, '$1$2$3');
}

export function parsePackageJson(content: string): Dependency[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const root = json as Record<string, unknown>;
  const deps: Dependency[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = root[field];
    if (!section || typeof section !== 'object') continue;
    for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
      if (typeof version !== 'string' || SKIP_VERSION.test(version.trim())) continue;
      const normalized = normalizeRange(version);
      if (!normalized) continue;
      deps.push({ name, version: normalized, ecosystem: 'npm', line: lineOf(content, content.indexOf(`"${name}"`)) });
    }
  }
  return deps;
}

export function parsePackageLock(content: string): Dependency[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const root = json as Record<string, unknown>;
  const deps: Dependency[] = [];
  const packages = root.packages;
  if (packages && typeof packages === 'object') {
    for (const [path, meta] of Object.entries(packages as Record<string, unknown>)) {
      if (path === '' || !meta || typeof meta !== 'object') continue;
      const name = path.replace(/^.*node_modules\//, '');
      const version = (meta as Record<string, unknown>).version;
      if (typeof version === 'string' && !SKIP_VERSION.test(version)) {
        deps.push({ name, version, ecosystem: 'npm', line: lineOf(content, content.indexOf(`"${name}"`)) });
      }
    }
  }
  return deps;
}

const PY_PIN = /^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*==\s*([^\s;#]+)/;

export function parseRequirements(content: string): Dependency[] {
  const deps: Dependency[] = [];
  content.split('\n').forEach((line, index) => {
    const matched = PY_PIN.exec(line.trim());
    if (matched) deps.push({ name: matched[1]!, version: matched[2]!, ecosystem: 'PyPI', line: index + 1 });
  });
  return deps;
}

export function parsePipfileLock(content: string): Dependency[] {
  const deps: Dependency[] = [];
  let current: { name?: string; version?: string } = {};
  content.split('\n').forEach((line, index) => {
    const name = /^\s*name\s*=\s*"([^"]+)"/.exec(line);
    if (name) current = { name: name[1] };
    const version = /^\s*version\s*=\s*"([^"]+)"/.exec(line);
    if (version && current.name) {
      deps.push({ name: current.name, version: version[1]!, ecosystem: 'PyPI', line: index + 1 });
      current = {};
    }
  });
  return deps;
}

export function parsePyproject(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const pattern = /["']([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*([<>=!~][^"'\s,]*)?["']/g;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(content)) !== null) {
    const spec = matched[2];
    if (!spec) continue;
    // 只取形如 ==1.2.3 的固定写法，范围约束不做推断
    if (!spec.startsWith('==')) continue;
    const version = spec.slice(2);
    if (SKIP_VERSION.test(version) || !/^\d/.test(version)) continue;
    deps.push({ name: matched[1]!, version, ecosystem: 'PyPI', line: lineOf(content, matched.index) });
  }
  return deps;
}

export function parsePom(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const block = /<dependency>([\s\S]*?)<\/dependency>/g;
  let matched: RegExpExecArray | null;
  while ((matched = block.exec(content)) !== null) {
    const body = matched[1]!;
    const group = /<groupId>([^<]+)<\/groupId>/.exec(body)?.[1]?.trim();
    const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(body)?.[1]?.trim();
    const version = /<version>([^<]+)<\/version>/.exec(body)?.[1]?.trim();
    if (!group || !artifact || !version || version.includes('${')) continue;
    if (SKIP_VERSION.test(version)) continue;
    deps.push({ name: `${group}:${artifact}`, version, ecosystem: 'Maven', line: lineOf(content, matched.index) });
  }
  return deps;
}

const GRADLE_COORD = /["']([\w.-]+):([\w.-]+):([\w.\-+]+)["']/g;

export function parseGradle(content: string): Dependency[] {
  const deps: Dependency[] = [];
  let matched: RegExpExecArray | null;
  while ((matched = GRADLE_COORD.exec(content)) !== null) {
    const version = matched[3]!;
    if (SKIP_VERSION.test(version)) continue;
    deps.push({
      name: `${matched[1]}:${matched[2]}`,
      version,
      ecosystem: 'Maven',
      line: lineOf(content, matched.index),
    });
  }
  GRADLE_COORD.lastIndex = 0;
  return deps;
}

export function parseGoMod(content: string): Dependency[] {
  const deps: Dependency[] = [];
  const pattern = /^\s*([\w.\-/]+\.[\w.\-/]+)\s+(v[\w.\-+]+)/gm;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(content)) !== null) {
    deps.push({
      name: matched[1]!,
      version: matched[2]!.slice(1),
      ecosystem: 'Go',
      line: lineOf(content, matched.index),
    });
  }
  return deps;
}

export function parseCargoToml(content: string): Dependency[] {
  const deps: Dependency[] = [];
  let inSection = false;
  content.split('\n').forEach((line, index) => {
    const section = /^\[(dependencies|dev-dependencies|build-dependencies)\]/.exec(line.trim());
    if (section) {
      inSection = true;
      return;
    }
    if (/^\[/.test(line.trim())) inSection = false;
    if (!inSection) return;
    const simple = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/.exec(line.trim());
    const table = /^([A-Za-z0-9_-]+)\s*=\s*\{\s*version\s*=\s*"([^"]+)"/.exec(line.trim());
    const matched = simple ?? table;
    if (!matched) return;
    if (SKIP_VERSION.test(matched[2]!)) return;
    deps.push({ name: matched[1]!, version: matched[2]!, ecosystem: 'crates.io', line: index + 1 });
  });
  return deps;
}

export function parseComposer(content: string): Dependency[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return [];
  }
  const root = json as Record<string, unknown>;
  const deps: Dependency[] = [];
  for (const field of ['require', 'require-dev']) {
    const section = root[field];
    if (!section || typeof section !== 'object') continue;
    for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
      if (typeof version !== 'string' || name === 'php') continue;
      const clean = normalizeRange(version);
      if (!clean) continue;
      deps.push({ name, version: clean, ecosystem: 'Composer', line: lineOf(content, content.indexOf(`"${name}"`)) });
    }
  }
  return deps;
}

const PARSERS: Record<string, (content: string) => Dependency[]> = {
  'package.json': parsePackageJson,
  'package-lock.json': parsePackageLock,
  'requirements.txt': parseRequirements,
  'Pipfile.lock': parsePipfileLock,
  'pyproject.toml': parsePyproject,
  'pom.xml': parsePom,
  'build.gradle': parseGradle,
  'go.mod': parseGoMod,
  'Cargo.toml': parseCargoToml,
  'composer.json': parseComposer,
};

/* ------------------------------------------------------- 配置与危险用法 */

export interface CodeRule {
  id: string;
  lang: string;
  severity: Severity;
  category: Category;
  title: string;
  pattern: RegExp;
  advice: string;
  /** 命中该行后，若同时匹配此正则则视为误报并跳过。 */
  negative?: RegExp;
}

/** 配置文件与源码中的危险用法规则（JS/TS、Python、Java、Go、PHP 通用）。 */
export const CODE_RULES: CodeRule[] = [
  // ---------- 凭据与传输 ----------
  {
    id: 'CFG-001',
    lang: '通用',
    severity: 'high',
    category: 'config',
    title: 'CORS 通配符来源',
    pattern: /(Access-Control-Allow-Origin["'\s:,=]+["']?\*)/i,
    advice: '改为具体域名列表，或关闭 credentials 搭配',
  },
  {
    id: 'CFG-002',
    lang: '通用',
    severity: 'high',
    category: 'config',
    title: 'CORS 通配符与凭据同时开启（凭据在前）',
    pattern:
      /(Access-Control-Allow-Credentials["'\s:,=]+true)[^\n]{0,160}?(Access-Control-Allow-Origin["'\s:,=]+["']?\*)/i,
    advice: '浏览器会拒绝该组合，必须指定明确来源',
  },
  {
    id: 'CFG-011',
    lang: '通用',
    severity: 'high',
    category: 'config',
    title: 'CORS 通配符与凭据同时开启（来源在前）',
    pattern:
      /(Access-Control-Allow-Origin["'\s:,=]+["']?\*)[^\n]{0,160}?(Access-Control-Allow-Credentials["'\s:,=]+true)/i,
    advice: '浏览器会拒绝该组合，必须指定明确来源',
  },
  {
    id: 'CFG-003',
    lang: '通用',
    severity: 'critical',
    category: 'config',
    title: '关闭 TLS 证书校验',
    pattern:
      /(NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0)|(rejectUnauthorized\s*:\s*false)|(CURLOPT_SSL_VERIFYPEER\s*,\s*(0|false))|(verify\s*=\s*False)/,
    advice: '证书校验是防中间人的底线，禁止在生产环境关闭',
  },
  {
    id: 'CFG-004',
    lang: 'Java',
    severity: 'critical',
    category: 'dangerous',
    title: '信任所有证书（X509TrustManager）',
    pattern: /(new\s+X509TrustManager\s*\(\s*\)\s*\{[\s\S]{0,300}?checkServerTrusted\s*\([^)]*\)\s*\{\s*\})/,
    advice: '实现完整证书链校验，或接入统一 TLS 配置',
  },
  {
    id: 'CFG-005',
    lang: 'Java',
    severity: 'high',
    category: 'dangerous',
    title: '关闭主机名校验',
    pattern: /(setHostnameVerifier\s*\(\s*\(?\s*\w+\s*,\s*\w+\s*\)?\s*->\s*true\s*\))|(ALLOW_ALL_HOSTNAME_VERIFIER)/,
    advice: '必须保留默认的主机名校验逻辑',
  },
  {
    id: 'CFG-006',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: '明文 HTTP 接口地址',
    pattern: /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)[^\s"']*|http:\/\/[^\s"']*(api|login|auth|token|password)/i,
    advice: '除本地调试外一律使用 HTTPS，避免凭据明文传输',
  },
  {
    id: 'CFG-007',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: '生产环境调试模式开启',
    pattern: /(DEBUG\s*=\s*True)|(debug\s*=\s*true)|(app\.debug\s*=\s*true)|(flask[^\n]{0,40}debug\s*=\s*True)/i,
    advice: '关闭 debug，避免 Werkzeug 控制台与详细堆栈对外暴露',
  },
  {
    id: 'CFG-008',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: 'Set-Cookie 缺少 HttpOnly',
    pattern: /Set-Cookie/i,
    negative: /httponly/i,
    advice: '会话 Cookie 必须带 HttpOnly、Secure、SameSite',
  },
  {
    id: 'CFG-012',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: 'Cookie 显式关闭安全属性',
    pattern: /(secure|httponly|samesite)\s*[:=]\s*['"]?(false|none|0)/i,
    advice: '带凭据的 Cookie 必须 Secure + HttpOnly + SameSite',
  },
  {
    id: 'CFG-009',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: '权限过宽（777 / 全部可写）',
    pattern: /(chmod\s+(-\w+\s+)?0?777)|(os\.MkdirAll\([^\n]*0?777)|(os\.Chmod\([^\n]*0?777)|(0o777)|(0777)/,
    advice: '遵循最小权限：目录 755、文件 644',
  },
  {
    id: 'CFG-010',
    lang: '通用',
    severity: 'medium',
    category: 'config',
    title: '监听所有网卡',
    pattern: /(host\s*=\s*['"]0\.0\.0\.0['"])|(Listen\("[^"]*:8080)[\s\S]{0,40}?0\.0\.0\.0|(--host[=\s]+0\.0\.0\.0)/,
    advice: '默认绑定 127.0.0.1，对外暴露时前置反向代理与防火墙',
  },
  // ---------- 注入与反序列化 ----------
  {
    id: 'DNG-001',
    lang: 'JS',
    severity: 'high',
    category: 'dangerous',
    title: '字符串拼接 SQL',
    pattern:
      /(execute|query|raw)\s*\(\s*[`'"][^`'"]*(SELECT|INSERT|UPDATE|DELETE)[^`'"]*["'`]\s*\+|\b(sql|query)\s*=\s*[f`'"][^`'"]*(SELECT|INSERT|UPDATE|DELETE)[^`'"]*(\$\{|\+\s*\w)/i,
    advice: '改用参数化查询 / 预编译语句，禁止拼接用户输入',
  },
  {
    id: 'DNG-002',
    lang: 'Python',
    severity: 'high',
    category: 'dangerous',
    title: 'SQL 字符串插值',
    pattern: /(execute|executemany)\s*\(\s*f["'][^"']*(SELECT|INSERT|UPDATE|DELETE)[^"']*\{/i,
    advice: '使用 cursor.execute(sql, params) 传入参数元组',
  },
  {
    id: 'DNG-003',
    lang: 'Java',
    severity: 'high',
    category: 'dangerous',
    title: 'Statement 拼接 SQL',
    pattern:
      /(executeQuery|executeUpdate|prepareStatement)\s*\(\s*["'][^"']*(SELECT|INSERT|UPDATE|DELETE)[^"']*["']\s*\+|Statement[^;]{0,80}\+\s*\w+/,
    advice: '使用 PreparedStatement 与占位符',
  },
  {
    id: 'DNG-004',
    lang: 'Python',
    severity: 'critical',
    category: 'dangerous',
    title: '反序列化不可信数据（pickle）',
    pattern: /(pickle\.loads?|cPickle\.loads?|dill\.loads?)\s*\(/,
    advice: '改用 JSON 等安全格式；确需 pickle 只允许本地可信数据',
  },
  {
    id: 'DNG-005',
    lang: 'Python',
    severity: 'critical',
    category: 'dangerous',
    title: '不安全的 yaml.load',
    pattern: /yaml\.load\s*\(/,
    negative: /safe/i,
    advice: '使用 yaml.safe_load 或 Loader=yaml.SafeLoader',
  },
  {
    id: 'DNG-006',
    lang: 'Python',
    severity: 'high',
    category: 'dangerous',
    title: 'shell=True 拼接命令',
    pattern: /subprocess\.(run|call|Popen|check_output|check_call)\s*\([^)]*shell\s*=\s*True/,
    advice: '传参数列表并保持 shell=False，必要时对白名单校验',
  },
  {
    id: 'DNG-007',
    lang: 'Python',
    severity: 'high',
    category: 'dangerous',
    title: 'os.system / eval 执行',
    pattern: /(os\.system\s*\(|os\.popen\s*\(|eval\s*\(|exec\s*\()/,
    advice: '移除动态执行；确需执行外部命令用 subprocess 参数列表',
  },
  {
    id: 'DNG-008',
    lang: 'JS',
    severity: 'critical',
    category: 'dangerous',
    title: 'eval / Function 动态执行',
    pattern: /(^|[^.\w])(eval\s*\(|new\s+Function\s*\()/,
    advice: '用 JSON.parse、显式映射表或解释器替代动态执行',
  },
  {
    id: 'DNG-009',
    lang: 'JS',
    severity: 'high',
    category: 'dangerous',
    title: 'child_process 执行 shell 命令',
    pattern: /(child_process\.)?(exec|execSync)\s*\(|spawn\s*\([^)]*shell\s*:\s*true/,
    advice: '改用 execFile / spawn 传参数数组，禁止拼接用户输入',
  },
  {
    id: 'DNG-010',
    lang: 'JS',
    severity: 'high',
    category: 'dangerous',
    title: 'innerHTML 注入未转义内容',
    pattern: /\.innerHTML\s*(=|\+=)|\bhtml\s*\(\s*(?!`")/i,
    advice: '改用 textContent，或在确需 HTML 时先经过 DOMPurify 净化',
  },
  {
    id: 'DNG-011',
    lang: 'JS',
    severity: 'high',
    category: 'dangerous',
    title: 'dangerouslySetInnerHTML / v-html',
    pattern: /(dangerouslySetInnerHTML)|(v-html)|(\[innerHTML\])|(bypassSecurityTrustHtml)/,
    advice: '优先用文本渲染；必须插入 HTML 时做白名单净化',
  },
  {
    id: 'DNG-012',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: 'AngularJS 绑定表达式',
    pattern: /\{\{\s*[\w$]+\s*\(|\$sce\.trustAsHtml/,
    advice: 'AngularJS 表达式注入可执行代码，升级到 Angular 或改用插值',
  },
  {
    id: 'DNG-013',
    lang: 'JS',
    severity: 'high',
    category: 'dangerous',
    title: '不可信来源拼接到跳转地址',
    pattern:
      /(window\.location\s*=\s*(req|params|query|search|window\.location\.search))|(location\.href\s*=\s*[`'"][^`'"]*\+)/,
    advice: '开放重定向：只允许跳转到白名单域名',
  },
  {
    id: 'DNG-014',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: '正则来自不可信输入',
    pattern: /new RegExp\s*\(\s*(req|params|query|search|input|user)/,
    advice: 'ReDoS：使用字面量正则或对输入做白名单校验',
  },
  {
    id: 'DNG-015',
    lang: 'Java',
    severity: 'high',
    category: 'dangerous',
    title: 'XMLDecoder 反序列化',
    pattern: /(XMLDecoder\s*\(|XStream\s*(\.|\n)*fromXML\s*\()/,
    advice: '改用 JSON 等安全反序列化器',
  },
  {
    id: 'DNG-016',
    lang: 'Java',
    severity: 'high',
    category: 'dangerous',
    title: '硬编码加密算法弱哈希',
    pattern:
      /(MessageDigest\.getInstance\s*\(\s*"(MD5|SHA-?1)"|Cipher\.getInstance\s*\(\s*"(DES|DESede|RC4|Blowfish)"|createHash\s*\(\s*['"](md5|sha1)['"])/i,
    advice: '改用 SHA-256 及以上；口令用 bcrypt / argon2，传输用 AES-GCM',
  },
  {
    id: 'DNG-017',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: '使用 Math.random 生成令牌/口令',
    pattern: /Math\.random\s*\(\s*\)[\s\S]{0,60}?(token|secret|nonce|password|salt|otp|key)/i,
    advice: '改用 crypto.getRandomValues / crypto.randomUUID',
  },
  {
    id: 'DNG-018',
    lang: 'Python',
    severity: 'medium',
    category: 'dangerous',
    title: '用 random 生成密钥',
    pattern: /random\.(random|randint|choice|randrange)\s*\([^\n]{0,40}(token|secret|nonce|password|salt|otp|key)/i,
    advice: '改用 secrets 模块',
  },
  {
    id: 'DNG-019',
    lang: 'Python',
    severity: 'medium',
    category: 'dangerous',
    title: '弱哈希用于口令或签名',
    pattern: /hashlib\.(md5|sha1)\s*\(/,
    advice: '口令用 bcrypt/argon2，完整性用 SHA-256 以上',
  },
  {
    id: 'DNG-020',
    lang: 'Go',
    severity: 'medium',
    category: 'dangerous',
    title: '模板未转义输出',
    pattern: /template\.HTML\s*\(|\.HTML\s*\(/,
    advice: '改用 template.HTML 或 html/template 自动转义',
  },
  {
    id: 'DNG-021',
    lang: 'Go',
    severity: 'medium',
    category: 'dangerous',
    title: '弱哈希或 ECB 模式',
    pattern: /(crypto\/md5|crypto\/sha1)|(cipher\.NewCBCEncrypter)/,
    advice: 'md5/sha1 仅可用于非安全用途，加密用 AES-GCM',
  },
  {
    id: 'DNG-022',
    lang: 'Go',
    severity: 'high',
    category: 'dangerous',
    title: '跳过 TLS 校验',
    pattern: /InsecureSkipVerify\s*:\s*true/,
    advice: '删除该选项，配置正确的根证书',
  },
  {
    id: 'DNG-023',
    lang: 'Go',
    severity: 'medium',
    category: 'dangerous',
    title: '日志直接打印请求体或密码',
    pattern: /log\.(Print|Printf|Println|Fatal)[^\n]*(password|passwd|token|secret|credential)/i,
    advice: '日志脱敏，避免凭据落盘',
  },
  {
    id: 'DNG-024',
    lang: 'PHP',
    severity: 'high',
    category: 'dangerous',
    title: '直接输出未转义变量',
    pattern: /(echo|print)\s+\$_(GET|POST|REQUEST|COOKIE)/,
    advice: '改用 htmlspecialchars 统一转义输出',
  },
  {
    id: 'DNG-025',
    lang: 'PHP',
    severity: 'high',
    category: 'dangerous',
    title: '动态执行代码',
    pattern: /(eval\s*\(|assert\s*\(\s*\$|system\s*\(\s*\$|shell_exec\s*\(|passthru\s*\()/,
    advice: '移除动态执行与命令拼接',
  },
  {
    id: 'DNG-026',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: 'postMessage 未校验 origin',
    pattern: /addEventListener\s*\(\s*['"]message['"][^)]*\)|onmessage\s*=/,
    advice: '在处理函数里校验 event.origin 是否在白名单',
  },
  {
    id: 'DNG-027',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: 'target=_blank 缺少 noopener',
    pattern: /target\s*=\s*["']_blank["']/i,
    negative: /noopener|noreferrer/i,
    advice: '补 rel="noopener noreferrer"，防止 tabnabbing',
  },
  {
    id: 'DNG-028',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: '文档写入 / 可执行正则拼接',
    pattern: /document\.write\s*\(|document\.writeln\s*\(/,
    advice: '删除 document.write，改用 DOM API 构造节点',
  },
  {
    id: 'DNG-029',
    lang: 'Java',
    severity: 'medium',
    category: 'dangerous',
    title: '随机数用于安全用途',
    pattern: /new\s+Random\s*\(\s*\)[^;]{0,60}(token|key|salt|password|nonce|otp)/i,
    advice: '改用 java.security.SecureRandom',
  },
  {
    id: 'DNG-030',
    lang: 'JS',
    severity: 'medium',
    category: 'dangerous',
    title: '本地存储敏感数据明文',
    pattern: /(localStorage|sessionStorage)\.(setItem)\s*\([^)]*(token|password|secret|jwt|idCard|identity)/i,
    advice: '敏感数据放内存或 HttpOnly Cookie，避免 XSS 直接读取',
  },
];

export interface SecretRule {
  id: string;
  label: string;
  severity: Severity;
  pattern: RegExp;
  /** 命中后用于脱敏的捕获组序号。 */
  group?: number;
  note: string;
}

export const SECRET_RULES: SecretRule[] = [
  {
    id: 'SEC-001',
    label: 'AWS Access Key ID',
    severity: 'critical',
    pattern: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/,
    note: '立即在 IAM 控制台吊销并轮换',
  },
  {
    id: 'SEC-002',
    label: 'GitHub Token',
    severity: 'critical',
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/,
    note: '吊销该 token 并检查仓库访问日志',
  },
  {
    id: 'SEC-003',
    label: 'GitLab / Slack Token',
    severity: 'critical',
    pattern: /\b(glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
    note: '吊销并轮换',
  },
  {
    id: 'SEC-004',
    label: 'Stripe 私钥',
    severity: 'critical',
    pattern: /\b((?:sk|rk)_live_[A-Za-z0-9]{16,})\b/,
    note: '仅限服务端使用，立即轮换',
  },
  {
    id: 'SEC-005',
    label: 'Google / Firebase 密钥',
    severity: 'high',
    pattern: /\b(AIza[0-9A-Za-z_-]{20,}|AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{60,})\b/,
    note: '在云控制台限制 API 与来源',
  },
  {
    id: 'SEC-006',
    label: '私钥文件内容',
    severity: 'critical',
    pattern: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----)/,
    note: '从代码库移除并轮换密钥对',
  },
  {
    id: 'SEC-007',
    label: '带口令的连接串',
    severity: 'high',
    pattern: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:\s/]+:[^@\s"'<>]{4,}@[^\s"'<>]+)/i,
    note: '改用密钥管理服务注入凭据',
  },
  {
    id: 'SEC-008',
    label: 'URL 中的 Basic 凭据',
    severity: 'high',
    pattern: /\bhttps?:\/\/[^\s:@/]{2,}:[^\s@/"']{4,}@[^\s/"']+/i,
    note: '移除 URL 中的用户名口令',
  },
  {
    id: 'SEC-009',
    label: 'JWT 令牌',
    severity: 'high',
    pattern: /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/,
    note: '令牌不应入库或提交到仓库',
  },
  {
    id: 'SEC-010',
    label: '云厂商访问密钥',
    severity: 'critical',
    pattern: /\b((?:AKIA|ASIA)[0-9A-Z]{16}|(?:aws_)?secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{30,}))/i,
    note: '立即轮换并使用最小权限',
  },
  {
    id: 'SEC-011',
    label: '第三方服务密钥',
    severity: 'high',
    pattern: /\b((?:SG\.[A-Za-z0-9_-]{16,}|SK[0-9a-fA-F]{32}|key-[0-9a-f]{32}|AC[0-9a-f]{32}))\b/,
    note: '确认该密钥是否应存在于代码中',
  },
  {
    id: 'SEC-012',
    label: '硬编码口令 / API Key 赋值',
    severity: 'medium',
    pattern:
      /\b((?:api[_-]?key|apikey|secret[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\s*[:=]\s*["'][^"'\s${}]{8,}["'])/i,
    note: '移入环境变量或密钥管理服务',
  },
  {
    id: 'SEC-013',
    label: 'OpenAI 风格 API Key',
    severity: 'critical',
    pattern: /\b(sk-[A-Za-z0-9]{32,}|sk-proj-[A-Za-z0-9_-]{32,})\b/,
    note: '吊销并改为服务端代理调用',
  },
  {
    id: 'SEC-014',
    label: '数据库连接明文口令',
    severity: 'high',
    pattern: /\b(user|password|pwd)\s*=\s*[^;\s"']+;[\s\S]{0,80}?\bpassword\s*=\s*([^\s;"']{4,})/i,
    note: '改用密钥管理服务或环境变量',
  },
];

/** 脱敏：保留前 4 位与末 2 位，中间以固定长度遮盖。 */
export function maskValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`;
  return `${trimmed.slice(0, 4)}${'*'.repeat(8)}${trimmed.slice(-2)}`;
}

function _lineText(content: string, line: number): string {
  return content.split('\n')[line - 1]?.trim() ?? '';
}

/* ------------------------------------------------------------ 扫描主流程 */

/** 在单个文件上运行代码规则与密钥规则。 */
export function scanCode(file: ScanFile): Finding[] {
  const findings: Finding[] = [];
  const lines = file.content.split('\n');
  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (text === '') return;
    for (const rule of CODE_RULES) {
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(text)) continue;
      if (rule.negative?.test(text)) continue;
      findings.push({
        rule: rule.id,
        title: rule.title,
        severity: rule.severity,
        category: rule.category,
        file: file.name,
        line,
        evidence: text.length > 160 ? `${text.slice(0, 160)}…` : text,
        advice: rule.advice,
        extra: `语言：${rule.lang}`,
      });
    }
    for (const rule of SECRET_RULES) {
      rule.pattern.lastIndex = 0;
      const matched = rule.pattern.exec(text);
      if (!matched) continue;
      const raw = matched[rule.group ?? 1] ?? matched[0];
      const masked = maskValue(raw);
      findings.push({
        rule: rule.id,
        title: rule.label,
        severity: rule.severity,
        category: 'secret',
        file: file.name,
        line,
        evidence: text.replace(raw, masked),
        advice: rule.note,
      });
    }
  });
  return findings;
}

export interface ScanOptions {
  /** 门禁阈值：出现该级别及以上的问题即判定不通过。 */
  threshold: Severity;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { threshold: 'high' };

function thresholdRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function evaluateGate(findings: Finding[], threshold: Severity): ScanReport['gate'] {
  const rank = thresholdRank(threshold);
  const blocking = findings.filter((item) => thresholdRank(item.severity) <= rank);
  const worst = blocking.reduce<Severity | null>((acc, item) => {
    if (acc === null || thresholdRank(item.severity) < thresholdRank(acc)) return item.severity;
    return acc;
  }, null);
  return {
    threshold,
    passed: blocking.length === 0,
    blocking: blocking.length,
    message:
      blocking.length === 0
        ? `未发现 ${SEVERITY_LABEL[threshold]} 及以上问题，静态自检通过`
        : `存在 ${blocking.length} 处 ${worst ? SEVERITY_LABEL[worst] : ''} 及以上问题，建议先处理再发布`,
  };
}

/** 执行本地自检：清单解析 + 代码规则 + 密钥扫描 + 门禁评估。 */
export function scanProject(files: ScanFile[], options: ScanOptions = DEFAULT_SCAN_OPTIONS): ScanReport {
  const started = Date.now();
  const findings: Finding[] = [];
  const scanned: ScanReport['scanned'] = [];
  const unknownVersions: string[] = [];
  let totalLines = 0;

  for (const file of files) {
    const base = file.name.split('/').pop() ?? file.name;
    const lines = file.content.split('\n').length;
    totalLines += lines;
    const parser = PARSERS[base];
    if (parser) {
      const deps = parser(file.content);
      const matched = matchAdvisories(deps);
      unknownVersions.push(...matched.unknown);
      for (const hit of matched.hits) findings.push({ ...hit, file: file.name });
      scanned.push({ name: file.name, lines, kind: `${manifestKind(file.name)}，${deps.length} 个依赖` });
    } else {
      scanned.push({ name: file.name, lines, kind: '源码 / 配置，按正则规则扫描' });
    }
    findings.push(...scanCode(file));
  }

  const stats: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const categories: Record<Category, number> = { dependency: 0, config: 0, dangerous: 0, secret: 0 };
  for (const item of findings) {
    stats[item.severity]++;
    categories[item.category]++;
  }

  findings.sort((a, b) => {
    const bySeverity = thresholdRank(a.severity) - thresholdRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file);
  });

  return {
    findings,
    stats,
    categories,
    scanned,
    skipped: [...new Set(unknownVersions)],
    gate: evaluateGate(findings, options.threshold),
    totals: {
      files: files.length,
      lines: totalLines,
      findings: findings.length,
      durationMs: Date.now() - started,
    },
  };
}

/** 导出为纯文本报告，便于贴进评审记录。 */
export function reportToText(report: ScanReport): string {
  const lines: string[] = ['本地安全自检报告', '='.repeat(40)];
  lines.push(
    `文件 ${report.totals.files} 个 / ${report.totals.lines} 行，问题 ${report.totals.findings} 条，耗时 ${report.totals.durationMs}ms`,
  );
  lines.push(
    `严重 ${report.stats.critical} · 高危 ${report.stats.high} · 中危 ${report.stats.medium} · 低危 ${report.stats.low} · 提示 ${report.stats.info}`,
  );
  lines.push(`门禁（${SEVERITY_LABEL[report.gate.threshold]}）：${report.gate.message}`);
  lines.push('');
  for (const item of report.findings) {
    lines.push(`[${SEVERITY_LABEL[item.severity]}] ${item.rule} ${item.title}`);
    lines.push(`  位置：${item.file || '依赖清单'}${item.line ? `:${item.line}` : ''}`);
    lines.push(`  证据：${item.evidence}`);
    if (item.extra) lines.push(`  说明：${item.extra}`);
    lines.push(`  建议：${item.advice}`);
    lines.push('');
  }
  if (report.skipped.length > 0) {
    lines.push('版本无法判定（需人工核对）：', ...report.skipped.map((item) => `  - ${item}`));
  }
  return lines.join('\n');
}

/** 官方工具导航：点击跳转，不在本工具内发起任何请求。 */
export const OFFICIAL_TOOLS: { name: string; url: string; description: string; tags: string[] }[] = [
  {
    name: 'OSV 漏洞数据库',
    url: 'https://osv.dev/',
    description: '按包名与生态查询公开漏洞，来源覆盖多个官方数据库',
    tags: ['查询', '免费'],
  },
  {
    name: 'GitHub Advisory Database',
    url: 'https://github.com/advisories',
    description: '官方维护的开源依赖安全公告',
    tags: ['GitHub'],
  },
  {
    name: 'npm audit',
    url: 'https://docs.npmjs.com/cli/commands/npm-audit',
    description: 'npm 内置审计命令，会联网比对官方库',
    tags: ['npm', '官方'],
  },
  {
    name: 'pip-audit',
    url: 'https://pypi.org/project/pip-audit/',
    description: 'Python 依赖漏洞审计工具',
    tags: ['PyPI'],
  },
  {
    name: 'govulncheck',
    url: 'https://pkg.go.dev/vuln/cmd/govulncheck',
    description: 'Go 官方漏洞检查工具，可分析可达调用路径',
    tags: ['Go', '官方'],
  },
  {
    name: 'cargo audit',
    url: 'https://rustsec.org/cargo-audit/',
    description: 'Rust 依赖安全公告数据库与审计工具',
    tags: ['Rust'],
  },
  { name: 'deps.dev', url: 'https://deps.dev/', description: 'Google 开源依赖风险与版本依赖关系查询', tags: ['查询'] },
  {
    name: 'NVD 漏洞库',
    url: 'https://nvd.nist.gov/vuln/search',
    description: '美国国家漏洞库，可按 CVE 检索细节与影响',
    tags: ['CVE'],
  },
  {
    name: 'OWASP ZAP',
    url: 'https://www.zaproxy.org/',
    description: '授权范围内的 Web 应用动态扫描器（本工具不代替它）',
    tags: ['动态扫描'],
  },
  {
    name: 'TruffleHog',
    url: 'https://github.com/trufflesecurity/trufflehog',
    description: '针对 Git 历史与代码库的密钥扫描工具',
    tags: ['密钥'],
  },
  {
    name: 'Semgrep',
    url: 'https://semgrep.dev/',
    description: '可自定义规则的静态分析引擎，支持多语言',
    tags: ['SAST'],
  },
  { name: 'Snyk', url: 'https://snyk.io/', description: '商业化依赖与应用安全平台', tags: ['商业'] },
];
