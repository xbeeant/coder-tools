/** IPv4 地址与子网计算。 */

export function parseIpv4(input: string): number | null {
  const trimmed = input.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    // 拒绝前导零：01 既可能表示 1 也可能被旧实现当作八进制
    if (part.length > 1 && part[0] === '0') return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

export function formatIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

export function parseCidr(input: string): { address: number; prefix: number } | null {
  const [addr, len, ...rest] = input.trim().split('/');
  if (rest.length > 0) return null;
  const address = parseIpv4(addr);
  if (address === null) return null;
  const prefix = len === undefined ? 32 : Number(len);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { address, prefix };
}

export function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixFromMask(mask: number): number | null {
  let prefix = 0;
  let seenZero = false;
  for (let bit = 31; bit >= 0; bit--) {
    if ((mask >>> bit) & 1) {
      if (seenZero) return null;
      prefix += 1;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

export interface SubnetInfo {
  address: number;
  prefix: number;
  netmask: number;
  wildcard: number;
  network: number;
  broadcast: number;
  firstHost: number;
  lastHost: number;
  totalAddresses: number;
  usableHosts: number;
}

export function describeSubnet(address: number, prefix: number): SubnetInfo {
  const netmask = maskFromPrefix(prefix);
  const wildcard = ~netmask >>> 0;
  const network = (address & netmask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  // /31 是 RFC 3021 点对点链路，两地址均可用；/32 为主机路由
  const usableHosts = prefix >= 31 ? Math.max(1, 2 ** (32 - prefix)) : Math.max(0, 2 ** (32 - prefix) - 2);
  return {
    address,
    prefix,
    netmask,
    wildcard,
    network,
    broadcast,
    firstHost: prefix >= 31 ? network : network + 1,
    lastHost: prefix >= 31 ? broadcast : broadcast - 1,
    totalAddresses: 2 ** (32 - prefix),
    usableHosts,
  };
}

export interface IpClass {
  name: string;
  range: string;
  note: string;
}

/**
 * 地址归属判断。必须先判定特殊用途段，再回退到历史 A/B/C 类，
 * 否则 10.0.0.0/8 这类私有段会被误判为 A 类。
 */
export function classifyIpv4(address: number): IpClass {
  const [a, b] = formatIpv4(address).split('.').map(Number) as [number, number, number, number];

  if (a === 127) return { name: '环回地址', range: '127.0.0.0/8', note: '本地回环' };
  if (a === 255 && b === 255) return { name: '受限广播', range: '255.255.255.255', note: '不转发' };
  if (a >= 224 && a < 240) return { name: '组播地址', range: '224.0.0.0/4', note: 'RFC 3171' };
  if (a >= 240) return { name: '保留地址', range: '240.0.0.0/4', note: 'IANA 保留' };
  if (a === 10) return { name: '私有地址', range: '10.0.0.0/8', note: 'RFC 1918 内网' };
  if (a === 172 && b >= 16 && b <= 31) return { name: '私有地址', range: '172.16.0.0/12', note: 'RFC 1918 内网' };
  if (a === 192 && b === 168) return { name: '私有地址', range: '192.168.0.0/16', note: 'RFC 1918 内网' };
  if (a === 100 && b >= 64 && b <= 127)
    return { name: '共享地址段', range: '100.64.0.0/10', note: 'RFC 6598 运营商级 NAT' };
  if (a === 169 && b === 254)
    return { name: '链路本地地址', range: '169.254.0.0/16', note: 'APIPA，未获取到 DHCP 时自配' };
  if (a === 192 && b === 0 && ((address >>> 8) & 0xff) === 2) {
    return { name: '文档示例地址', range: '192.0.2.0/24', note: 'RFC 5737，仅用于文档' };
  }
  if (a === 198 && (b === 18 || b === 19)) return { name: '基准测试地址', range: '198.18.0.0/15', note: 'RFC 2544' };
  if (a === 192 && b === 0) return { name: 'IETF 协议保留', range: '192.0.0.0/24', note: 'RFC 6890' };
  if (a === 0) return { name: '本网络', range: '0.0.0.0/8', note: 'RFC 1122' };

  // 公共可路由地址：回退到已废弃的历史分类。
  // 类边界为 128 / 192 / 224（首位为 1 时次位决定 B 或 C 类）。
  const prefix = a < 128 ? 8 : a < 192 ? 9 : a < 224 ? 10 : 11;
  return {
    name: `${String.fromCharCode(65 + prefix - 8)} 类`,
    range: `${formatIpv4(maskFromPrefix(prefix))}/${prefix}`,
    note: '公共可路由地址；A/B/C 类划分早已废弃，此处仅作参考',
  };
}

export interface IpSpecialFlags {
  loopback: boolean;
  multicast: boolean;
  linkLocal: boolean;
  private: boolean;
  broadcast: boolean;
  documentation: boolean;
  reserved: boolean;
}

export function ipFlags(address: number): IpSpecialFlags {
  const octets = formatIpv4(address).split('.').map(Number);
  const a = octets[0];
  const b = octets[1];
  return {
    loopback: a === 127,
    multicast: a >= 224 && a < 240,
    linkLocal: a === 169 && b === 254,
    private: a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168),
    broadcast: a === 255 && b === 255,
    documentation: a === 192 && b === 0 && ((address >>> 8) & 0xff) === 2,
    reserved: a >= 240 && !(a === 255 && b === 255),
  };
}
