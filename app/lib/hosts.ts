/**
 * hosts 配置方案的纯逻辑层：解析、行级校验、方案对比、域名索引与部署脚本生成。
 *
 * 重要限制：浏览器扩展无法改写系统 /etc/hosts（需要 native messaging 或额外安装的
 * 辅助程序），因此本模块只负责「配置管理 + 生成可粘贴的内容 / 一键脚本」。
 */

export interface HostsProfile {
  id: string;
  name: string;
  note: string;
  /** 完整 hosts 文件文本（按行保存）。 */
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type HostsIssueKind =
  | 'bad-ip'
  | 'bad-domain'
  | 'dup-ip'
  | 'dup-domain'
  | 'trailing-space'
  | 'too-many-alias'
  | 'empty-line';

export interface HostsIssue {
  kind: HostsIssueKind;
  /** 0 起的行号。 */
  line: number;
  message: string;
  /** 冲突时指向另一行，用于「第 12 行与第 30 行冲突」这类提示。 */
  relatedLine?: number;
}

export interface HostsEntry {
  line: number;
  raw: string;
  ip: string;
  domains: string[];
  isComment: boolean;
  isBlank: boolean;
}

export const ISSUE_LABELS: Record<HostsIssueKind, string> = {
  'bad-ip': 'IP 非法',
  'bad-domain': '域名非法',
  'dup-ip': 'IP 重复',
  'dup-domain': '域名重复',
  'trailing-space': '行尾多余空白',
  'too-many-alias': '别名过多',
  'empty-line': '空行',
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const COMMENT_LINE = /^\s*#/;
const TRAILING_WS = /[ \t]+$/;

/** 允许的域名：字母数字、连字符、点、下划线，以及通配前缀 *. */
const DOMAIN = /^\*?\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/i;

/** 超过 9 个别名通常是把整台机器列表塞进来的写法，容易误伤。 */
const MAX_ALIASES = 9;

export function isIpv4(text: string): boolean {
  const match = IPV4.exec(text);
  if (!match) return false;
  for (let index = 1; index <= 4; index += 1) {
    const part = match[index];
    if (part === undefined) return false;
    // 拒绝 01 / 1 这类前导零写法，hosts 解析器对它的处理并不一致。
    if (part.length > 1 && part.startsWith('0')) return false;
    const value = Number(part);
    if (value > 255) return false;
  }
  return true;
}

export function isIpv6(text: string): boolean {
  const raw = text.trim();
  if (raw === '') return false;
  if (!raw.includes(':')) return false;
  // 去掉 IPv4 映射尾部（::ffff:1.2.3.4）后再校验。
  const normalized = raw.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/, (ip) => {
    if (!isIpv4(ip)) return ip;
    const parts = ip.split('.').map(Number);
    const high = ((parts[0] ?? 0) << 8) | (parts[1] ?? 0);
    const low = ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
    return `${high.toString(16)}:${low.toString(16)}`;
  });
  if (!/^[0-9a-f:.]+$/i.test(normalized)) return false;
  const doubleColon = normalized.split('::').length - 1;
  if (doubleColon > 1) return false;
  const [head = '', tail = ''] = normalized.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === '' ? [] : tail.split(':');
  const groups = [...headGroups, ...tailGroups];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
  // 没有 :: 时必须是完整 8 组；否则 1..7 组都合法。
  if (doubleColon === 0 && groups.length !== 8) return false;
  if (doubleColon === 1 && groups.length > 7) return false;
  return true;
}

export function isIpAddress(text: string): boolean {
  return isIpv4(text) || isIpv6(text);
}

export function isDomain(text: string): boolean {
  if (text === '') return false;
  if (text.length > 253) return false;
  if (!DOMAIN.test(text)) return false;
  return text.replace(/^\*\./, '').includes('.') || text.length > 0;
}

/** 解析整份 hosts 文本为条目数组，注释与空行也保留以便原样回显。 */
export function parseEntries(content: string): HostsEntry[] {
  const lines = content.split('\n');
  return lines.map((raw, line) => {
    const trimmed = raw.trim();
    if (trimmed === '') return { line, raw, ip: '', domains: [], isComment: false, isBlank: true };
    if (COMMENT_LINE.test(raw)) return { line, raw, ip: '', domains: [], isComment: true, isBlank: false };
    // 行内注释：# 之后的内容在 hosts 里不生效，但保留在 raw 里。
    const body = stripInlineComment(raw);
    const parts = body.split(/\s+/).filter((item) => item !== '');
    const ip = parts[0] ?? '';
    return {
      line,
      raw,
      ip,
      domains: parts.slice(1),
      isComment: false,
      isBlank: false,
    };
  });
}

function stripInlineComment(line: string): string {
  const at = line.indexOf('#');
  return at === -1 ? line : line.slice(0, at);
}

/** 校验一份 hosts 文本，返回所有行级问题。 */
export function validateHosts(content: string): HostsIssue[] {
  const issues: HostsIssue[] = [];
  const entries = parseEntries(content);
  const ipLines = new Map<string, number>();
  const domainLines = new Map<string, number>();

  for (const entry of entries) {
    if (entry.isComment) {
      if (TRAILING_WS.test(entry.raw)) {
        issues.push({ kind: 'trailing-space', line: entry.line, message: '注释行结尾有多余空白' });
      }
      continue;
    }
    if (entry.isBlank) {
      issues.push({ kind: 'empty-line', line: entry.line, message: '空行，粘贴后不影响解析但会让 diff 变长' });
      continue;
    }
    if (TRAILING_WS.test(entry.raw)) {
      issues.push({ kind: 'trailing-space', line: entry.line, message: '行尾有多余空白' });
    }
    if (entry.ip === '') {
      issues.push({ kind: 'bad-ip', line: entry.line, message: '缺少 IP，只有域名' });
    } else if (!isIpAddress(entry.ip)) {
      issues.push({ kind: 'bad-ip', line: entry.line, message: `无法解析为 IPv4 / IPv6：${entry.ip}` });
    } else {
      const seen = ipLines.get(entry.ip);
      if (seen === undefined) ipLines.set(entry.ip, entry.line);
      else
        issues.push({
          kind: 'dup-ip',
          line: entry.line,
          relatedLine: seen,
          message: `IP ${entry.ip} 与第 ${seen + 1} 行重复`,
        });
    }
    if (entry.domains.length === 0) {
      issues.push({ kind: 'bad-domain', line: entry.line, message: '没有域名，hosts 不会生效' });
    }
    if (entry.domains.length > MAX_ALIASES) {
      issues.push({ kind: 'too-many-alias', line: entry.line, message: `别名 ${entry.domains.length} 个，可能写错了` });
    }
    for (const domain of entry.domains) {
      if (!isDomain(domain)) {
        issues.push({ kind: 'bad-domain', line: entry.line, message: `域名格式不合法：${domain}` });
        continue;
      }
      const key = domain.toLowerCase();
      const seen = domainLines.get(key);
      if (seen === undefined) domainLines.set(key, entry.line);
      else {
        issues.push({
          kind: 'dup-domain',
          line: entry.line,
          relatedLine: seen,
          message: `域名 ${domain} 与第 ${seen + 1} 行冲突，后一条可能不生效`,
        });
      }
    }
  }
  return issues;
}

/** 有效记录行（既不是注释也不是空行），用于统计。 */
export function activeRecords(content: string): HostsEntry[] {
  return parseEntries(content).filter((entry) => !entry.isComment && !entry.isBlank);
}

/** 所有域名（含通配），去重且保持出现顺序。 */
export function collectDomains(
  profiles: HostsProfile[],
): { domain: string; profiles: { id: string; name: string; line: number }[] }[] {
  const map = new Map<string, { id: string; name: string; line: number }[]>();
  for (const profile of profiles) {
    for (const entry of activeRecords(profile.content)) {
      for (const raw of entry.domains) {
        const domain = raw.toLowerCase();
        const list = map.get(domain);
        const item = { id: profile.id, name: profile.name, line: entry.line };
        if (list === undefined) map.set(domain, [item]);
        else if (!list.some((entryItem) => entryItem.id === profile.id)) list.push(item);
      }
    }
  }
  return [...map.entries()]
    .map(([domain, list]) => ({ domain, profiles: list }))
    .sort((a, b) => b.profiles.length - a.profiles.length || a.domain.localeCompare(b.domain));
}

// ────────────────────────────── 方案对比 ──────────────────────────────

export type DiffKind = 'same' | 'add' | 'del' | 'change';

export interface HostsDiffRow {
  kind: DiffKind;
  leftLine: number | null;
  rightLine: number | null;
  left: string;
  right: string;
}

/**
 * 逐行对比两个方案：行数不同时按行号对齐，同位置的文本不同算「修改」。
 * 这不是语义级 diff（同一份 hosts 里调整条目顺序会产生大量 change），
 * 但足够定位「我改了哪几行」。
 */
export function diffHosts(left: string, right: string): HostsDiffRow[] {
  const a = left.split('\n');
  const b = right.split('\n');
  const rows: HostsDiffRow[] = [];
  const total = Math.max(a.length, b.length);
  for (let index = 0; index < total; index += 1) {
    const leftLine = a[index];
    const rightLine = b[index];
    if (leftLine === undefined) {
      rows.push({ kind: 'add', leftLine: null, rightLine: index, left: '', right: rightLine });
      continue;
    }
    if (rightLine === undefined) {
      rows.push({ kind: 'del', leftLine: index, rightLine: null, left: leftLine, right: '' });
      continue;
    }
    const same = leftLine === rightLine;
    rows.push({ kind: same ? 'same' : 'change', leftLine: index, rightLine: index, left: leftLine, right: rightLine });
  }
  return rows;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  same: number;
}

export function summarizeDiff(rows: HostsDiffRow[]): DiffSummary {
  const out: DiffSummary = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const row of rows) {
    if (row.kind === 'add') out.added += 1;
    else if (row.kind === 'del') out.removed += 1;
    else if (row.kind === 'change') out.changed += 1;
    else out.same += 1;
  }
  return out;
}

/** 与现有方案的整体对比统计，用于「导入解析」后的概览。 */
export function compareProfile(oldContent: string, newContent: string): DiffSummary {
  return summarizeDiff(diffHosts(oldContent, newContent));
}

// ────────────────────────────── 部署脚本 ──────────────────────────────

export type Platform = 'macos' | 'linux' | 'windows';

export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};

export const HOSTS_PATH: Record<Platform, string> = {
  macos: '/etc/hosts',
  linux: '/etc/hosts',
  windows: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
};

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
}

/** 生成可直接复制到终端粘贴的 hosts 文件内容（保留用户注释）。 */
export function toHostsFile(content: string, name: string): string {
  const header = [
    '# 由「程序员工具箱 · Hosts 切换」生成',
    `# 方案：${name}`,
    `# 生成时间：${timestamp()}`,
    '# 粘贴后记得刷新 DNS 缓存（见部署指引）',
    '',
  ].join('\n');
  const body = content.endsWith('\n') ? content : `${content}\n`;
  return `${header}${body}`;
}

/**
 * 一键脚本：先把现有 hosts 备份成带时间戳的文件，再覆盖，最后刷新缓存。
 * 脚本内的路径按平台区分；写入使用 heredoc / here-string，避开转义地狱。
 */
export function buildDeployScript(platform: Platform, content: string, name: string): string {
  const file = toHostsFile(content, name);
  const stamp = timestamp();
  if (platform === 'macos') {
    return [
      '#!/bin/bash',
      '# macOS：备份 → 写入 → 刷新 DNS 缓存',
      'set -euo pipefail',
      '',
      `STAMP="${stamp}"`,
      'HOSTS=/etc/hosts',
      'BACKUP="/etc/hosts.bak.${STAMP}"',
      '',
      '# 1) 备份当前文件',
      'sudo cp "$HOSTS" "$BACKUP" && echo "已备份到 $BACKUP"',
      '',
      '# 2) macOS 15+ 若存在 /etc/hosts.sd，需要先解除锁定与只读属性',
      'if [ -e /etc/hosts.sd ]; then',
      '  echo "检测到 /etc/hosts.sd（macOS 15+ 的 DNS 状态快照）"',
      '  sudo chflags nouchg /etc/hosts.sd 2>/dev/null || true',
      'fi',
      'sudo chflags nouchg "$HOSTS" 2>/dev/null || true',
      '',
      '# 3) 写入新内容',
      'cat <<\'CT_EOF\' | sudo tee "$HOSTS" >/dev/null',
      file.trimEnd(),
      'CT_EOF',
      'sudo chmod 644 "$HOSTS"',
      '',
      '# 4) 刷新缓存',
      'sudo dscacheutil -flushcache',
      'sudo killall -HUP mDNSResponder 2>/dev/null || true',
      '',
      'echo "完成。回滚：sudo cp \\"$BACKUP\\" \\"$HOSTS\\""',
      '',
    ].join('\n');
  }
  if (platform === 'linux') {
    return [
      '#!/bin/bash',
      '# Linux：备份 → 写入 → 刷新 DNS 缓存',
      'set -euo pipefail',
      '',
      `STAMP="${stamp}"`,
      'HOSTS=/etc/hosts',
      'BACKUP="/etc/hosts.bak.${STAMP}"',
      '',
      '# 1) 备份当前文件',
      'sudo cp "$HOSTS" "$BACKUP" && echo "已备份到 $BACKUP"',
      '',
      '# 2) 写入新内容',
      'cat <<\'CT_EOF\' | sudo tee "$HOSTS" >/dev/null',
      file.trimEnd(),
      'CT_EOF',
      'sudo chmod 644 "$HOSTS"',
      '',
      '# 3) 刷新缓存（按你使用的解析器选其一）',
      'if command -v resolvectl >/dev/null 2>&1; then',
      '  sudo resolvectl flush-caches || true',
      'fi',
      'if command -v systemd-resolve >/dev/null 2>&1; then',
      '  sudo systemd-resolve --flush-caches || true',
      'fi',
      'if command -v nscd >/dev/null 2>&1; then',
      '  sudo nscd -i hosts || true',
      'fi',
      '# NetworkManager 场景：',
      '# sudo systemctl restart NetworkManager',
      '',
      'echo "完成。回滚：sudo cp \\"$BACKUP\\" \\"$HOSTS\\""',
      '',
    ].join('\n');
  }
  return [
    '# 在「管理员 PowerShell」里运行',
    '$ErrorActionPreference = "Stop"',
    '',
    `$Stamp = "${stamp}"`,
    '$Hosts = "$env:SystemRoot\\System32\\drivers\\etc\\hosts"',
    '$Backup = "$Hosts.bak.$Stamp"',
    '',
    '# 1) 备份',
    'Copy-Item -Path $Hosts -Destination $Backup -Force',
    'Write-Host "已备份到 $Backup"',
    '',
    '# 2) 写入新内容',
    `$Content = @'`,
    file.trimEnd(),
    "'@",
    'Set-Content -Path $Hosts -Value $Content -Encoding ascii -NoNewline:$false',
    '',
    '# 3) 刷新 DNS 缓存',
    'ipconfig /flushdns',
    '',
    'Write-Host "完成。回滚：Copy-Item -Path $Backup -Destination $Hosts -Force"',
    '',
  ].join('\n');
}

export function scriptFilename(platform: Platform): string {
  if (platform === 'macos') return 'apply-hosts.command';
  if (platform === 'linux') return 'apply-hosts.sh';
  return 'apply-hosts.ps1';
}

export interface PlatformStep {
  title: string;
  body: string;
}

/** 按平台的图文步骤（纯文本步骤，不做任何网络请求）。 */
export function deploySteps(platform: Platform): PlatformStep[] {
  if (platform === 'macos') {
    return [
      {
        title: '1. 生成并粘贴 hosts 内容',
        body: '把左侧「hosts 文件内容」整段复制，粘贴到 /etc/hosts 末尾（保留原有内容）。',
      },
      { title: '2. 刷新缓存', body: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder' },
      {
        title: '3. macOS 15+ 的 hosts.sd',
        body: 'macOS 15 引入了 /etc/hosts.sd 状态快照；若 sudo 写入报 Resource busy / Operation not permitted，先执行 sudo chflags nouchg /etc/hosts 与 sudo chflags nouchg /etc/hosts.sd，写完再 sudo chflags uchg 恢复锁定。',
      },
      { title: '4. 验证', body: 'ping api.local 或 dscacheutil -q host -a name api.local 确认解析到 127.0.0.1。' },
    ];
  }
  if (platform === 'linux') {
    return [
      {
        title: '1. 生成并粘贴 hosts 内容',
        body: '复制内容后用 sudo tee -a /etc/hosts 追加，避免 sudo vi 的编辑器坑。',
      },
      { title: '2. 刷新缓存', body: 'systemd-resolved：sudo resolvectl flush-caches；nscd：sudo nscd -i hosts。' },
      {
        title: '3. NetworkManager / resolv.conf',
        body: '若 DNS 由 NetworkManager 管理，改完 hosts 后 sudo systemctl restart NetworkManager；只读 /etc/resolv.conf 的场景无需处理。',
      },
      { title: '4. 验证', body: 'getent hosts api.local 或 dig +short api.local。' },
    ];
  }
  return [
    {
      title: '1. 生成并粘贴 hosts 内容',
      body: '把内容粘贴到 C:\\Windows\\System32\\drivers\\etc\\hosts（需要管理员权限）。',
    },
    { title: '2. 刷新缓存', body: 'ipconfig /flushdns' },
    { title: '3. 验证', body: 'ping api.local；若仍解析到旧值，重启浏览器进程。' },
    {
      title: '4. 注意事项',
      body: 'Windows 11 建议开启「DNS over HTTPS」后再用 hosts 覆盖，否则 DoH 可能绕过 hosts；可在设置 → 网络和 Internet → 以太网/Wi-Fi → DNS 服务器分配 手动指定。',
    },
  ];
}

// ────────────────────────────── 速查与模板 ──────────────────────────────

export interface HostsShortcut {
  label: string;
  ip: string;
  domains: string[];
  description: string;
  /** 需要特别提醒的风险点。 */
  warning?: string;
}

/** 稳定且公开的常用地址，不含任何探测性内容。 */
export const COMMON_ADDRESSES: HostsShortcut[] = [
  {
    label: '本机回环',
    ip: '127.0.0.1',
    domains: ['localhost'],
    description: 'IPv4 回环地址，任何系统都应保留这一行。',
  },
  {
    label: 'IPv6 回环',
    ip: '::1',
    domains: ['ip6-localhost', 'ip6-loopback'],
    description: 'IPv6 回环，现代系统的 localhost 可能优先解析到它。',
  },
  {
    label: '广播地址',
    ip: '255.255.255.255',
    domains: ['broadcasthost'],
    description: '子网广播地址，部分系统需要它来做 DHCP 探测。',
  },
  {
    label: '未指定地址',
    ip: '0.0.0.0',
    domains: [],
    description: '表示「不解析/全部拦截」，用于测试环境把域名指向黑洞。',
  },
  {
    label: '常见内网网关',
    ip: '10.0.0.1',
    domains: [],
    description: '10.0.0.0/8 是最常见的私有网段首地址，多数家用/办公路由器用它做网关。',
  },
  {
    label: '常见内网网关',
    ip: '192.168.1.1',
    domains: [],
    description: '192.168.1.0/24 是家用路由器出厂默认网段。',
  },
  {
    label: '常见内网网关',
    ip: '172.16.0.1',
    domains: [],
    description: '172.16.0.0/12 私有网段的首地址，企业内网常见。',
  },
  {
    label: '云元数据服务',
    ip: '169.254.169.254',
    domains: ['metadata.google.internal'],
    description: 'AWS/GCP/Azure 等云主机的实例元数据端点。',
    warning:
      '绝对不要在 hosts 里把它指向 127.0.0.1 或 0.0.0.0：一旦屏蔽，依赖元数据取凭证的 SDK、容器编排与 CI 会拿不到临时密钥而直接失败；而把它指向外部地址更危险，属于凭据外泄风险。',
  },
  {
    label: '本机回环别名',
    ip: '127.0.0.1',
    domains: ['127.0.0.1'],
    description: '把 127.0.0.1 当作域名匹配，浏览器会直接访问本机服务。',
  },
];

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  note: string;
  content: string;
}

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: 'tpl-local-dev',
    name: '本地开发',
    description: 'api.local / admin.local 指向 127.0.0.1',
    note: '配合 .test / .local 域名使用；.local 在 mDNS 上有特殊含义，某些系统需关闭 Avahi。',
    content: [
      '# 本地开发环境',
      '127.0.0.1\tlocalhost',
      '127.0.0.1\tapi.local',
      '127.0.0.1\tadmin.local',
      '127.0.0.1\tweb.local',
      '::1\t\tlocalhost',
      '',
    ].join('\n'),
  },
  {
    id: 'tpl-test-block',
    name: '测试环境拦截',
    description: '把常见测试域名指向 0.0.0.0',
    note: '⚠️ 只拦截你自己的测试域名；不要屏蔽安全更新域名，会导致系统无法打补丁。',
    content: [
      '# 测试环境拦截',
      '# 把域名指向 0.0.0.0 通常表现为连不上（黑洞），比指向 127.0.0.1 更明确',
      '0.0.0.0\tanalytics.example.com',
      '0.0.0.0\ttracking.example.com',
      '0.0.0.0\ttelemetry.example.com',
      '',
    ].join('\n'),
  },
];

export function createProfile(partial: Partial<HostsProfile> = {}): HostsProfile {
  const at = partial.createdAt ?? new Date().toISOString();
  return {
    id: partial.id ?? `profile-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x10000).toString(36)}`,
    name: partial.name?.trim() || '新方案',
    note: partial.note ?? '',
    content: partial.content ?? '',
    createdAt: at,
    updatedAt: partial.updatedAt ?? at,
  };
}

/** 追加若干记录，返回新的内容文本。 */
export function appendRecords(content: string, records: { ip: string; domains: string[] }[]): string {
  if (records.length === 0) return content;
  const base = content === '' ? '' : content.endsWith('\n') ? content : `${content}\n`;
  const lines = records.map((record) => `${record.ip}\t${record.domains.join(' ')}`);
  return `${base}${lines.join('\n')}\n`;
}

/** 从整份 hosts 文件导入：解析出统计，交给调用方决定如何落库。 */
export interface ImportSummary {
  lines: number;
  records: number;
  comments: number;
  domains: number;
  issues: HostsIssue[];
}

export function summarizeContent(content: string): ImportSummary {
  const entries = parseEntries(content);
  const records = entries.filter((entry) => !entry.isComment && !entry.isBlank);
  return {
    lines: entries.length,
    records: records.length,
    comments: entries.filter((entry) => entry.isComment).length,
    domains: new Set(records.flatMap((entry) => entry.domains.map((item) => item.toLowerCase()))).size,
    issues: validateHosts(content),
  };
}
