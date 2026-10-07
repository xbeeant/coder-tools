/** MAC 地址生成、解析、厂商查询与 EUI-64 互转。 */

import { bytesToHex } from './bytes';
import { bytesFromEui64, eui64FromBytes, formatIpv6, linkLocalAddress } from './ipv6';

/** 内置常用 OUI 片段，非完整 IEEE 注册库。 */
export const OUI_TABLE: ReadonlyArray<{ oui: string; vendor: string }> = [
  { oui: '000C29', vendor: 'VMware（虚拟网卡）' },
  { oui: '005056', vendor: 'VMware（ESXi / Workstation）' },
  { oui: '080027', vendor: 'VirtualBox（Oracle）' },
  { oui: '0A0027', vendor: 'VirtualBox / Oracle VM' },
  { oui: '525400', vendor: 'QEMU / KVM 虚拟网卡' },
  { oui: '001C14', vendor: 'VMware（ESXi 虚拟设备）' },
  { oui: '00155D', vendor: 'Microsoft（Hyper-V）' },
  { oui: '001DD8', vendor: 'Microsoft（Hyper-V）' },
  { oui: '0017FA', vendor: 'Microsoft（Hyper-V / Windows）' },
  { oui: '281878', vendor: 'Microsoft（Azure 虚拟网卡）' },
  { oui: '001B21', vendor: 'Intel（企业网卡）' },
  { oui: '00904C', vendor: 'Intel（无线网卡）' },
  { oui: 'A0CEC8', vendor: 'Intel（无线网卡）' },
  { oui: '3C9743', vendor: 'Intel（无线网卡）' },
  { oui: 'F4B4E9', vendor: 'Intel（无线网卡）' },
  { oui: '001A2B', vendor: 'Lenovo' },
  { oui: '00248C', vendor: 'Lenovo / ThinkPad' },
  { oui: 'B8CEF6', vendor: 'Lenovo（ThinkPad）' },
  { oui: '5CD5B5', vendor: 'Dell / EMC' },
  { oui: 'D89EF3', vendor: 'Dell（Dell Cloud）' },
  { oui: 'F8BC12', vendor: 'Dell（Dell EMC）' },
  { oui: '0014C2', vendor: 'HP / Hewlett-Packard' },
  { oui: '3C4A92', vendor: 'HP（HPE 服务器）' },
  { oui: 'B499BA', vendor: 'HP（HPE iLO）' },
  { oui: '001CC0', vendor: 'Intel（Dell 品牌标识）' },
  { oui: 'F4F5D8', vendor: 'Google（Google Cloud）' },
  { oui: '001A2E', vendor: 'Google（Chromecast / Nest）' },
  { oui: '3C5AB4', vendor: 'Google（GCP 内部）' },
  { oui: '00E04C', vendor: 'Realtek（有线网卡）' },
  { oui: '52544C', vendor: 'Realtek（克隆网卡常见 OUI）' },
  { oui: '1C872C', vendor: 'ASUSTek（华硕）' },
  { oui: '2C56DC', vendor: 'ASUSTek（华硕）' },
  { oui: 'AC220B', vendor: 'ASUSTek（华硕路由器）' },
  { oui: '7085C2', vendor: 'ASUSTek（asus.com）' },
  { oui: 'F832E4', vendor: 'ASUSTek（华硕）' },
  { oui: '001E8C', vendor: 'Cisco-Linksys（ Linksys 路由器）' },
  { oui: '002454', vendor: 'Cisco-Linksys' },
  { oui: 'C0C1C0', vendor: 'Cisco Systems' },
  { oui: '00000C', vendor: 'Cisco Systems（网络设备）' },
  { oui: '0050F0', vendor: 'Cisco Systems' },
  { oui: '001A2F', vendor: 'Cisco-Linksys / TP-Link' },
  { oui: '50C7BF', vendor: 'TP-Link（普联技术）' },
  { oui: 'A42BB0', vendor: 'TP-Link（普联技术）' },
  { oui: 'EC086B', vendor: 'TP-Link（普联技术）' },
  { oui: '9C5322', vendor: '小米（Xiaomi）' },
  { oui: '6434C5', vendor: '小米（Xiaomi）' },
  { oui: 'F8A45F', vendor: '小米（Xiaomi）' },
  { oui: '78BDBC', vendor: '小米 / 生态链' },
  { oui: 'ACF1DF', vendor: '华为（Huawei）' },
  { oui: 'E0247F', vendor: '华为（Huawei）' },
  { oui: '48DB50', vendor: '华为（Huawei）' },
  { oui: '00E091', vendor: '华为 / H3C（新华三）' },
  { oui: '002261', vendor: 'H3C / 杭州华三' },
  { oui: '7085C8', vendor: 'ASUSTek（asus.com）' },
  { oui: '00219B', vendor: 'Dell EMC（Clariant）' },
  { oui: '000E8E', vendor: 'VIA Technologies' },
  { oui: '0011D8', vendor: 'ASIX Electronics' },
  { oui: '001BFC', vendor: 'Sony（PlayStation / 电视）' },
  { oui: 'FCF152', vendor: 'Sony（PlayStation 5）' },
  { oui: '0013A9', vendor: 'Sony' },
  { oui: '0016CB', vendor: 'Apple（Mac / iPhone / iPad）' },
  { oui: '003065', vendor: 'Apple（AirPort / 旧设备）' },
  { oui: '0050E4', vendor: 'Apple（无线设备）' },
  { oui: '28CFE9', vendor: 'Apple（AirDrop / 随机地址）' },
  { oui: 'A45E60', vendor: 'Apple（iPhone / iPad）' },
  { oui: 'F0189E', vendor: 'Apple（Mac / iOS）' },
  { oui: 'D0817A', vendor: 'Apple（Mac 随机地址）' },
  { oui: '3C0754', vendor: 'Apple（MacBook）' },
  { oui: '7CD1C8', vendor: 'Apple（iPhone）' },
  { oui: 'BC1534', vendor: 'Apple（iPhone）' },
  { oui: 'F0B479', vendor: 'Amazon Technologies（Echo / Fire TV）' },
  { oui: 'FC65DE', vendor: 'Amazon Technologies（AWS 内部）' },
  { oui: '124751', vendor: 'Amazon AWS' },
  { oui: '02F1B8', vendor: 'Amazon AWS' },
  { oui: 'D47A35', vendor: 'Amazon Technologies' },
  { oui: '001B63', vendor: 'Apple（Apple TV）' },
  { oui: '00E04F', vendor: 'Xerox / 打印设备' },
  { oui: '0000AA', vendor: 'Xerox' },
  { oui: '0011B2', vendor: 'LG Electronics' },
  { oui: '0022A9', vendor: 'Huawei / 运营商定制' },
  { oui: '00188E', vendor: 'Google Glass' },
  { oui: '00265E', vendor: 'Tenda（腾达）' },
  { oui: '1C1B0D', vendor: 'Tenda（腾达）' },
  { oui: 'C046E6', vendor: 'Netgear（网件）' },
  { oui: '204E7F', vendor: 'Netgear（网件）' },
  { oui: 'A00460', vendor: 'Netgear（网件）' },
  { oui: '001143', vendor: 'D-Link（友讯）' },
  { oui: '1CBDB9', vendor: 'D-Link（友讯）' },
  { oui: '001F33', vendor: 'Netgear / 长城宽带' },
  { oui: '000FB5', vendor: 'Netgear（网件）' },
  { oui: '0024E4', vendor: 'Withings / 物联网' },
  { oui: 'B8E876', vendor: 'Sonos（音箱）' },
  { oui: '5CCF7F', vendor: 'Espressif（ESP32）' },
  { oui: '240AC4', vendor: 'Espressif（ESP32）' },
  { oui: 'DC4F22', vendor: 'Espressif / Tuya（涂鸦）' },
  { oui: 'B4E62D', vendor: 'Espressif / 智能家居' },
  { oui: '8CAAB5', vendor: 'Espressif（ESP32 模组）' },
  { oui: 'D89099', vendor: '涂鸦智能 Tuya' },
  { oui: '18B430', vendor: 'Nest Labs（Google）' },
  { oui: '6C2995', vendor: 'Intel（无线）' },
  { oui: '9C8E99', vendor: 'HP（打印设备）' },
  { oui: 'F8A2D6', vendor: 'Liteon（光存储）' },
  { oui: '002210', vendor: 'IBM / Lenovo（服务器）' },
  { oui: '000255', vendor: 'IBM（PC）' },
  { oui: '0004AC', vendor: 'IBM（ThinkPad）' },
  { oui: '0018F8', vendor: 'Intel / Server' },
  { oui: '00226E', vendor: 'Microsoft（Surface）' },
  { oui: '0050F2', vendor: 'Microsoft（Hyper-V / 虚拟网卡）' },
  { oui: '001DD9', vendor: 'Microsoft（Surface）' },
  { oui: '000D3A', vendor: 'Microsoft（Hyper-V）' },
  { oui: '7C1E52', vendor: 'Microsoft / VMWare 虚拟网卡' },
  { oui: '001C42', vendor: 'Parallels（虚拟机）' },
  { oui: '00016E', vendor: 'Xerox / 打印机' },
];

/** 内置表索引：前 3 字节的大写十六进制。 */
const VENDOR_INDEX = new Map<string, string>();
for (const item of OUI_TABLE) {
  if (item.oui.length === 6 && !VENDOR_INDEX.has(item.oui)) VENDOR_INDEX.set(item.oui, item.vendor);
}

/** 在线 OUI 查询链接，供未命中时手动使用。 */
export const ONLINE_LOOKUP = 'https://standards-oui.ieee.org/';

export type MacFormat = 'colon' | 'hyphen' | 'cisco' | 'plain-lower' | 'plain-upper';

/** 按指定格式输出 MAC：冒号、连字符、Cisco 点分四段或无分隔。 */
export function formatMac(bytes: Uint8Array | number[], format: MacFormat = 'colon'): string {
  const source = Array.from(bytes)
    .slice(0, 6)
    .map((value) => value & 0xff);
  while (source.length < 6) source.push(0);
  const upper = source.map((value) => value.toString(16).padStart(2, '0').toUpperCase());
  switch (format) {
    case 'hyphen':
      return upper.join('-');
    case 'cisco':
      return `${upper.slice(0, 2).join('')}.${upper.slice(2, 4).join('')}.${upper.slice(4, 6).join('')}`;
    case 'plain-lower':
      return upper.join('').toLowerCase();
    case 'plain-upper':
      return upper.join('');
    default:
      return upper.join(':');
  }
}

export interface MacParseOk {
  ok: true;
  bytes: Uint8Array;
  /** 规范化后的冒号大写形式。 */
  canonical: string;
  /** 原始输入中包含的分隔符类型，用于提示用户。 */
  separator: string;
}

export interface MacParseError {
  ok: false;
  error: string;
}

/** 宽松解析 MAC：允许冒号、连字符、点分、无分隔等写法。 */
export function parseMac(input: string): MacParseOk | MacParseError {
  const raw = input.trim();
  if (!raw) return { ok: false, error: '请输入 MAC 地址' };

  // 冒号、连字符、点分与全角写法统一剥离，只保留十六进制数字
  const hex = raw
    .replace(/[\s()[\]]/g, '')
    .replace(/：/g, ':')
    .replace(/[:.-]/g, '')
    .replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(hex)) {
    const bad = [...raw].find((char) => !/[0-9a-f:\-.\s()[\]（）x]/i.test(char));
    return { ok: false, error: `包含非法字符${bad ? `「${bad}」` : ''}，只允许 0-9 与 a-f` };
  }
  if (hex.length !== 12) {
    return { ok: false, error: `长度为 ${hex.length} 位十六进制，MAC 需要恰好 12 位（6 字节）` };
  }
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const separator = raw.includes(':') ? ':' : raw.includes('-') ? '-' : raw.includes('.') ? '.' : '无分隔';
  return { ok: true, bytes, canonical: formatMac(bytes, 'colon'), separator };
}

export interface MacAnalysis {
  bytes: Uint8Array;
  canonical: string;
  /** 前 3 字节（大写十六进制，无分隔）。 */
  oui: string;
  /** 后 3 字节（设备标识）。 */
  deviceId: string;
  /** 厂商名称，未命中内置表时为 null。 */
  vendor: string | null;
  /** 最低位为 1 表示多播/组播地址。 */
  multicast: boolean;
  /** 次低位为 1 表示本地管理（随机化）地址。 */
  localAdmin: boolean;
  /** 是否为全 0 地址。 */
  isZero: boolean;
  /** 是否为广播地址 ff:ff:ff:ff:ff:ff。 */
  isBroadcast: boolean;
  /** 是否由组播位或广播位限制，不适合做 EUI-64 来源。 */
  usableForEui64: boolean;
  /** 是否为常见虚拟网卡 OUI。 */
  virtual: boolean;
}

/** 解析 MAC 的结构信息与厂商。 */
export function analyzeMac(bytes: Uint8Array | number[]): MacAnalysis {
  const data = new Uint8Array(
    Array.from(bytes)
      .slice(0, 6)
      .map((value) => value & 0xff),
  );
  while (data.length < 6) data[data.length] = 0;
  const hex = bytesToHex(data).toUpperCase();
  const first = data[0] ?? 0;
  const oui = hex.slice(0, 6);
  const vendor = VENDOR_INDEX.get(oui) ?? null;
  const isBroadcast = hex === 'FFFFFFFFFFFF';
  const multicast = (first & 0x01) === 0x01;
  return {
    bytes: data,
    canonical: formatMac(data, 'colon'),
    oui,
    deviceId: hex.slice(6),
    vendor,
    multicast,
    localAdmin: (first & 0x02) === 0x02,
    isZero: hex === '000000000000',
    isBroadcast,
    usableForEui64: !multicast && !isBroadcast && hex !== '000000000000',
    virtual: ['000C29', '005056', '080027', '525400', '001C14', '00155D', '001DD8', '0017FA', '001C42'].includes(oui),
  };
}

export interface MacGenerateOptions {
  /** 生成数量。 */
  count?: number;
  /** 指定厂商 OUI（3 字节十六进制，可含分隔）；为空表示全随机。 */
  oui?: string | null;
  /** 强制单播（清除最低位）。 */
  unicast?: boolean;
  /** 强制多播（置位最低位）。 */
  multicast?: boolean;
  /** 强制本地管理（置位次低位）。 */
  localAdmin?: boolean;
  /** 强制全局管理（清除次低位）。 */
  globalAdmin?: boolean;
  /** 设备标识字节数，3 字节时保持标准 MAC 长度。 */
  deviceBytes?: number;
}

/** 生成随机 MAC，全部随机源来自 crypto.getRandomValues。 */
export function generateMacs(options: MacGenerateOptions = {}): Uint8Array[] {
  const count = Math.max(1, Math.min(100, Math.floor(options.count ?? 1)));
  let fixedOui: number[] | null = null;
  if (options.oui) {
    const parsed = parseMac(options.oui);
    if (!parsed.ok) return [];
    fixedOui = Array.from(parsed.bytes).slice(0, 3);
  }

  const result: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(6);
    if (fixedOui) bytes.set(fixedOui, 0);
    else crypto.getRandomValues(bytes);
    // 首字节最低位：0 单播 / 1 组播；次低位：0 全局 / 1 本地管理
    if (options.unicast) bytes[0] = (bytes[0] ?? 0) & 0xfe;
    if (options.multicast) bytes[0] = (bytes[0] ?? 0) | 0x01;
    if (options.localAdmin) bytes[0] = (bytes[0] ?? 0) | 0x02;
    if (options.globalAdmin) bytes[0] = (bytes[0] ?? 0) & 0xfd;
    result.push(bytes);
  }
  return result;
}

/** MAC → EUI-64 接口标识（低 64 位的 4 个分组）。 */
export function eui64InterfaceId(bytes: Uint8Array | number[]): { groups: number[]; text: string } {
  const groups = eui64FromBytes(bytes);
  const text = groups.map((group) => group.toString(16).padStart(4, '0')).join(':');
  return { groups, text };
}

/** MAC → fe80::/10 链路本地地址。 */
export function linkLocalFromMac(bytes: Uint8Array | number[]): string {
  return formatIpv6(linkLocalAddress(eui64FromBytes(bytes)));
}

/** IPv6 链路本地地址 → MAC；非 EUI-64 结构返回 null。 */
export function macFromLinkLocal(groups: number[]): Uint8Array | null {
  if (groups.length < 8) return null;
  const bytes = bytesFromEui64(groups.slice(4));
  return bytes ? new Uint8Array(bytes) : null;
}

/** 逐行批量解析多行 MAC。 */
export function parseMacLines(text: string): { line: string; result: MacParseOk | MacParseError }[] {
  return text
    .split(/[\n,;\t]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ line, result: parseMac(line) }));
}
