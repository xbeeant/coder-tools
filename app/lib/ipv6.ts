/** IPv6 地址解析、格式化、ULA 生成与特殊地址判定（RFC 4193 / RFC 4291）。 */

import { formatIpv4, parseIpv4 } from './ipv4';

/** IPv6 地址的 8 个 16 位分组，下标 0 为最高位。 */
export type Ipv6Groups = number[];

/** 地址展示形式。 */
export type Ipv6Style =
  /** 压缩形式，零分组用 :: 替换，例如 fe80::1。 */
  | 'compressed'
  /** 完整形式，8 组各 4 位十六进制，例如 fe80:0000:0000:0000:0211:22ff:fe33:4455。 */
  | 'full'
  /** 逐组展开，分组之间用点分隔，例如 fe80.0000.0000.0000.0211.22ff.fe33.4455。 */
  | 'expanded'
  /** 字节点分形式，例如 254.128.0.0.0.0.0.0.33.34.255.254.51.68.85。 */
  | 'bytes';

function hex4(value: number): string {
  return (value & 0xffff).toString(16).padStart(4, '0');
}

/** 压缩形式下的分组写法：省略前导 0（RFC 5952）。 */
function hexCompact(value: number): string {
  return (value & 0xffff).toString(16);
}

function parseGroup(part: string): number | null {
  if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
  return Number.parseInt(part, 16);
}

/** 去掉 zone id（fe80::1%eth0）与 IPv6 字面量的方括号。 */
function stripDecorations(input: string): string {
  let text = input.trim();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  return text;
}

/** 补齐或截断为 8 个分组，便于后续计算。 */
export function normalizeIpv6(groups: Ipv6Groups): Ipv6Groups {
  const out: Ipv6Groups = [];
  for (let i = 0; i < 8; i++) out.push(i < groups.length ? (groups[i] ?? 0) & 0xffff : 0);
  return out;
}

/**
 * 解析 IPv6 文本，支持 :: 压缩与尾部内嵌 IPv4（::ffff:1.2.3.4）。
 * 非法输入返回 null。
 */
export function parseIpv6(input: string): Ipv6Groups | null {
  let text = stripDecorations(input);
  if (!text) return null;

  // 尾部内嵌 IPv4：先替换为两个十六进制分组，再按普通地址解析。
  const lastColon = text.lastIndexOf(':');
  if (lastColon >= 0 && text.slice(lastColon + 1).includes('.')) {
    const embedded = parseIpv4(text.slice(lastColon + 1));
    if (embedded === null) return null;
    const high = ((embedded >>> 16) & 0xffff).toString(16);
    const low = (embedded & 0xffff).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const firstDouble = text.indexOf('::');
  const compressed = firstDouble >= 0;
  if (compressed && firstDouble !== text.lastIndexOf('::')) return null;

  const headText = compressed ? text.slice(0, firstDouble) : text;
  const tailText = compressed ? text.slice(firstDouble + 2) : '';
  const head = headText ? headText.split(':') : [];
  const tail = tailText ? tailText.split(':') : [];
  if (!compressed && head.length !== 8) return null;
  // :: 至少要代表一个零分组
  if (compressed && head.length + tail.length > 7) return null;

  const groups: Ipv6Groups = [];
  for (const part of head) {
    const value = parseGroup(part);
    if (value === null) return null;
    groups.push(value);
  }
  for (let i = head.length + tail.length; i < 8; i++) groups.push(0);
  for (const part of tail) {
    const value = parseGroup(part);
    if (value === null) return null;
    groups.push(value);
  }
  return groups;
}

export interface ZeroRun {
  /** 起始分组下标。 */
  start: number;
  /** 连续零分组的个数。 */
  length: number;
}

/** 找出最长的连续零分组区间（不足两组时返回 null），用于 :: 压缩。 */
export function ipv6ZeroRun(groups: Ipv6Groups): ZeroRun | null {
  const g = normalizeIpv6(groups);
  let best: ZeroRun | null = null;
  let runStart = -1;
  for (let i = 0; i <= g.length; i++) {
    if (i < g.length && g[i] === 0) {
      if (runStart < 0) runStart = i;
      continue;
    }
    if (runStart >= 0) {
      const length = i - runStart;
      if (length >= 2 && (best === null || length > best.length)) best = { start: runStart, length };
      runStart = -1;
    }
  }
  return best;
}

/** 展开为 16 个字节。 */
export function ipv6ToBytes(groups: Ipv6Groups): number[] {
  const out: number[] = [];
  for (const group of normalizeIpv6(groups)) {
    out.push((group >>> 8) & 0xff, group & 0xff);
  }
  return out;
}

/** 由 16 个字节还原分组。 */
export function bytesToIpv6(bytes: number[]): Ipv6Groups {
  const groups: Ipv6Groups = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    groups.push(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
  }
  return normalizeIpv6(groups);
}

/** 按指定形式格式化 IPv6 地址。 */
export function formatIpv6(groups: Ipv6Groups, style: Ipv6Style = 'compressed'): string {
  const g = normalizeIpv6(groups);
  if (style === 'bytes') return ipv6ToBytes(g).join('.');
  if (style === 'expanded') return g.map(hex4).join('.');
  if (style === 'full') return g.map(hex4).join(':');
  const run = ipv6ZeroRun(g);
  if (!run) return g.map(hexCompact).join(':');
  const head = g.slice(0, run.start).map(hexCompact).join(':');
  const tail = g
    .slice(run.start + run.length)
    .map(hexCompact)
    .join(':');
  return `${head}::${tail}`;
}

/** 每个分组的十进制与十六进制对照。 */
export function ipv6GroupTable(groups: Ipv6Groups): { index: number; hex: string; decimal: number }[] {
  return normalizeIpv6(groups).map((group, index) => ({
    index,
    hex: hex4(group),
    decimal: group,
  }));
}

/** 随机十六进制串，长度按字符数截断。 */
export function randomHex(length: number): string {
  const size = Math.max(1, Math.ceil(length / 2));
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, Math.max(0, length))
    .toUpperCase();
}

/** 随机 64 位接口标识（RFC 4941 风格的临时地址低位随机）。 */
export function randomInterfaceId(): Ipv6Groups {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return bytesToIpv6(Array.from(bytes));
}

/**
 * 由 6 字节 MAC 生成 EUI-64 接口标识：
 * 翻转首个八位组的 U/L 位，并在其后插入 ff:ff。
 */
export function eui64FromBytes(mac: Uint8Array | number[]): Ipv6Groups {
  const source = Array.from(mac).slice(0, 6);
  while (source.length < 6) source.push(0);
  const first = ((source[0] ?? 0) ^ 0x02) & 0xff;
  return [
    ((first << 8) | (source[1] ?? 0)) & 0xffff,
    0xffff,
    (((source[2] ?? 0) << 8) | (source[3] ?? 0)) & 0xffff,
    (((source[4] ?? 0) << 8) | (source[5] ?? 0)) & 0xffff,
  ];
}

/** 校验 EUI-64 结构（第二个分组必须为 ffff）并还原 MAC 字节。 */
export function bytesFromEui64(interfaceId: Ipv6Groups): number[] | null {
  const iid = interfaceId.slice(-4);
  if (iid.length < 4 || iid[1] !== 0xffff) return null;
  const first = (((iid[0] ?? 0) >>> 8) & 0xff) ^ 0x02;
  return [
    first & 0xff,
    (iid[0] ?? 0) & 0xff,
    ((iid[2] ?? 0) >>> 8) & 0xff,
    (iid[2] ?? 0) & 0xff,
    ((iid[3] ?? 0) >>> 8) & 0xff,
    (iid[3] ?? 0) & 0xff,
  ];
}

export interface UlaOptions {
  /** 40 位全局 ID（不含 fd 前缀），缺省随机生成。 */
  globalId?: string;
  /** 自定义接口标识（低 64 位的 4 个分组）。 */
  interfaceId?: Ipv6Groups | null;
  /** 用 MAC 字节生成 EUI-64 接口标识。 */
  fromMac?: Uint8Array | number[] | null;
}

export interface UlaResult {
  /** ULA 前缀，固定为 fd。 */
  prefix: string;
  globalId: string;
  subnetId: number;
  interfaceId: Ipv6Groups;
  groups: Ipv6Groups;
  compressed: string;
  full: string;
  expanded: string;
  bytes: string;
  /** 接口标识是否由 MAC 派生。 */
  fromEui64: boolean;
}

/**
 * 按 RFC 4193 生成 fd00::/8 唯一本地地址：
 * fd + 40 位全局 ID + 16 位子网 ID + 64 位接口标识。
 */
export function generateUla(subnetId: number, options: UlaOptions = {}): UlaResult {
  const subnet = Math.max(0, Math.min(0xff, Math.floor(subnetId) || 0));
  const globalId = (options.globalId ?? randomHex(40))
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase()
    .padStart(10, '0');

  let interfaceId: Ipv6Groups;
  let fromEui64 = false;
  if (options.interfaceId && options.interfaceId.length >= 4) {
    interfaceId = options.interfaceId.slice(-4).map((value) => value & 0xffff);
  } else if (options.fromMac && options.fromMac.length >= 6) {
    interfaceId = eui64FromBytes(options.fromMac);
    fromEui64 = true;
  } else {
    interfaceId = randomInterfaceId();
  }

  const groups = normalizeIpv6([
    0xfd00 | Number.parseInt(globalId.slice(0, 2), 16),
    Number.parseInt(globalId.slice(2, 6), 16),
    Number.parseInt(globalId.slice(6, 10), 16),
    subnet,
    ...interfaceId,
  ]);

  return {
    prefix: 'fd',
    globalId,
    subnetId: subnet,
    interfaceId,
    groups,
    compressed: formatIpv6(groups),
    full: formatIpv6(groups, 'full'),
    expanded: formatIpv6(groups, 'expanded'),
    bytes: formatIpv6(groups, 'bytes'),
    fromEui64,
  };
}

/** fe80::/10 链路本地地址，接口标识占低 64 位。 */
export function linkLocalAddress(interfaceId: Ipv6Groups): Ipv6Groups {
  return normalizeIpv6([0xfe80, 0, 0, 0, ...interfaceId.slice(0, 4)]);
}

/** 取地址低 64 位作为接口标识。 */
export function interfaceIdOf(groups: Ipv6Groups): Ipv6Groups {
  return normalizeIpv6(groups).slice(4);
}

/** 反向域名（ip6.arpa），即分组按半字节倒序拼接。 */
export function ip6ArpaDomain(groups: Ipv6Groups): string {
  const nibbles: string[] = [];
  for (const nibble of ipv6ToBytes(groups).flatMap((byte) => [(byte >>> 4).toString(16), (byte & 0x0f).toString(16)])) {
    nibbles.unshift(nibble);
  }
  return `${nibbles.join('.')}.ip6.arpa`;
}

export interface Ipv6TypeInfo {
  /** 类型名称。 */
  name: string;
  /** 对应前缀。 */
  prefix: string;
  /** 说明文字。 */
  note: string;
  /** 内嵌或映射的 IPv4 地址（仅部分类型有值）。 */
  embeddedIpv4: string | null;
}

/** 判断地址类型，覆盖常见特殊用途段。 */
export function classifyIpv6(groups: Ipv6Groups): Ipv6TypeInfo {
  const g = normalizeIpv6(groups);
  const first = g[0] ?? 0;
  // 回环 ::1 的前 6 个尾部分组全为 0
  const tailZero = g.slice(1, 7).every((group) => group === 0);

  if (g.every((group) => group === 0)) {
    return { name: '未指定地址', prefix: '::', note: '相当于 IPv4 的 0.0.0.0，不能作为源地址', embeddedIpv4: null };
  }
  if (tailZero && (g[7] ?? 0) === 1 && (first === 0 || first === 1)) {
    return { name: '回环地址', prefix: '::1/128', note: '本机回环，与 IPv4 的 127.0.0.1 对应', embeddedIpv4: null };
  }
  // IPv4 兼容地址 ::a.b.c.d
  if (g.slice(0, 6).every((group) => group === 0) && ((g[6] ?? 0) !== 0 || (g[7] ?? 0) !== 0)) {
    const value = (((g[6] ?? 0) << 8) | (g[7] ?? 0)) >>> 0;
    return {
      name: 'IPv4 兼容地址',
      prefix: '::/96',
      note: '已废弃，建议改用 ::ffff:a.b.c.d 映射形式',
      embeddedIpv4: formatIpv4(value),
    };
  }
  // IPv4 映射地址 ::ffff:a.b.c.d
  if (g.slice(0, 5).every((group) => group === 0) && (g[5] ?? 0) === 0xffff) {
    const value = (((g[6] ?? 0) << 8) | (g[7] ?? 0)) >>> 0;
    return {
      name: 'IPv4 映射地址',
      prefix: '::ffff:0:0/96',
      note: 'Socket 编程中表示 IPv4 连接，地址族为 AF_INET6',
      embeddedIpv4: formatIpv4(value),
    };
  }
  if ((first & 0xff00) === 0xff00) {
    return { name: '组播地址', prefix: 'ff00::/8', note: 'ff02:: 为链路本地组播作用域', embeddedIpv4: null };
  }
  if ((first & 0xffc0) === 0xfe80) {
    return { name: '链路本地地址', prefix: 'fe80::/10', note: '仅本链路有效，路由器不会转发', embeddedIpv4: null };
  }
  if ((first & 0xffc0) === 0xfec0) {
    return { name: '站点本地地址', prefix: 'fec0::/10', note: 'RFC 3879 已废弃，请改用 ULA', embeddedIpv4: null };
  }
  if ((first & 0xfe00) === 0xfc00) {
    const isUla = (first & 0xff00) === 0xfd00;
    return {
      name: isUla ? '唯一本地地址 ULA' : 'ULA 前缀 fc00::/8',
      prefix: isUla ? 'fd00::/8' : 'fc00::/8',
      note: isUla ? 'RFC 4193，内网自用，不可路由到公网' : 'RFC 4193 保留的 fc00 段，实际设备几乎不用',
      embeddedIpv4: null,
    };
  }
  if (g[0] === 0x0064 && (g[1] ?? 0) === 0xff9b && g.slice(2, 6).every((group) => group === 0)) {
    return {
      name: 'NAT64 前缀',
      prefix: '64:ff9b::/96',
      note: 'RFC 6052，用于 IPv6 到 IPv4 转换',
      embeddedIpv4: formatIpv4((((g[12] ?? 0) << 8) | (g[13] ?? 0)) >>> 0),
    };
  }
  if (g[0] === 0x2002) {
    return {
      name: '6to4 地址',
      prefix: '2002::/16',
      note: '站点前缀 2002:后接公网 IPv4，现已不推荐',
      embeddedIpv4: formatIpv4((((g[1] ?? 0) << 8) | (g[2] ?? 0)) >>> 0),
    };
  }
  if (g[0] === 0x2001 && (g[1] ?? 0) === 0) {
    return { name: 'Teredo 地址', prefix: '2001::/32', note: 'RFC 4380，穿透 NAT 的隧道地址', embeddedIpv4: null };
  }
  if (g[0] === 0x2001 && (g[1] ?? 0) === 0x0db8) {
    return { name: '文档示例地址', prefix: '2001:db8::/32', note: 'RFC 3849，仅用于文档示例', embeddedIpv4: null };
  }
  if ((first & 0xe000) === 0x2000) {
    return {
      name: '全球单播地址',
      prefix: '2000::/3',
      note: '公网可路由地址，由运营商或云厂商分配',
      embeddedIpv4: null,
    };
  }
  return { name: '保留地址', prefix: '未分配', note: '不在全球单播 2000::/3 范围内', embeddedIpv4: null };
}

export interface Ipv6SpecialEntry {
  name: string;
  address: string;
  scope: string;
}

/** 常用的 IPv6 特殊地址与组播地址。 */
export const IPV6_SPECIAL: Ipv6SpecialEntry[] = [
  { name: '未指定地址', address: '::', scope: '相当于 0.0.0.0，不作为源地址' },
  { name: '回环地址', address: '::1', scope: '本机回环，对应 127.0.0.1' },
  { name: 'ULA 起点', address: 'fd00::', scope: 'RFC 4193，全局 ID 随机生成' },
  { name: 'ULA 常用段', address: 'fd12:3456:789a::/64', scope: 'Docker、WSL 默认常用 fd 段' },
  { name: '链路本地', address: 'fe80::', scope: '每个接口自动生成，不可跨路由器' },
  { name: '站点本地', address: 'fec0::', scope: '已废弃，请改用 fd00::/8' },
  { name: '全节点组播', address: 'ff02::1', scope: '本链路所有节点' },
  { name: '全路由器组播', address: 'ff02::2', scope: '本链路所有路由器' },
  { name: 'DNS 服务器组播', address: 'ff02::fb', scope: '本链路 mDNS' },
  { name: '所有 DHCP 中继', address: 'ff02::1:2', scope: 'DHCPv6 中继代理发现' },
  { name: '所有 DHCP 服务器', address: 'ff02::1:3', scope: 'DHCPv6 服务器发现' },
  { name: 'IPv4 映射回环', address: '::ffff:127.0.0.1', scope: 'Java 等运行时常用写法' },
  { name: 'NAT64 合成地址', address: '64:ff9b::1.2.3.4', scope: 'RFC 6052 DNS64 自动合成' },
];
