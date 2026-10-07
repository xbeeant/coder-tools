/**
 * 字符集编码表与乱码修复（纯函数，全部在本机完成）。
 *
 * 浏览器只实现了 WHATWG Encoding Standard 里的少量编码，而且**只有解码器**（TextDecoder），
 * 没有旧编码的编码器。这里只内置能保证正确的映射：Unicode 系（UTF-8/16/32）与单字节西文编码
 * （ASCII、Latin-1、Windows-1252、ISO-8859-15）；GBK / BIG5 / Shift_JIS 等多字节旧编码
 * 只借用浏览器原生 TextDecoder 做解码，编码方向一律标记为「不支持」，绝不猜测映射表。
 */

export type SupportLevel = 'builtin' | 'native' | 'none';
export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type EncodingGroup = 'unicode' | 'single' | 'legacy' | 'deprecated';

export interface EncodingInfo {
  /** 下拉框与函数参数使用的稳定标识 */
  id: string;
  name: string;
  aliases: string[];
  description: string;
  group: EncodingGroup;
  /** 字节 → 文本 */
  decode: SupportLevel;
  /** 文本 → 字节 */
  encode: SupportLevel;
  /** 备注：浏览器限制、包含关系等 */
  note?: string;
  /** 多字节旧编码使用的 TextDecoder 标签，内置编码为 undefined */
  nativeLabel?: string;
}

function hex4(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/* ── 内置解码器 ─────────────────────────────────────────────── */

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  if (bytes.length % 2 !== 0) throw new Error('UTF-16 的字节数必须是偶数');
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const unit = littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const nextLo = bytes[i + 2];
      const nextHi = bytes[i + 3];
      if (nextLo === undefined || nextHi === undefined)
        throw new Error(`位置 ${i} 的高位代理项 ${hex4(unit)} 缺少低位代理项`);
      const low = littleEndian ? nextLo | (nextHi << 8) : (nextLo << 8) | nextHi;
      if (low < 0xdc00 || low > 0xdfff) {
        throw new Error(`位置 ${i} 的高位代理项 ${hex4(unit)} 没有配对的低位代理项`);
      }
      out += String.fromCharCode(unit, low);
      i += 4;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new Error(`位置 ${i} 出现孤立的低位代理项 ${hex4(unit)}`);
    out += String.fromCharCode(unit);
    i += 2;
  }
  return out;
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean): string {
  if (bytes.length % 4 !== 0) throw new Error('UTF-32 的字节数必须是 4 的倍数');
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const code = littleEndian
      ? (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0
      : ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new Error(`偏移 ${i} 的码点 ${hex4(code)} 不是合法的 Unicode 标量值`);
    }
    out += String.fromCodePoint(code);
  }
  return out;
}

function decodeAscii(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte > 0x7f) throw new Error(`偏移 ${i} 的字节 0x${byte.toString(16).toUpperCase()} 超出 ASCII 范围`);
    out += String.fromCharCode(byte);
  }
  return out;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** Windows-1252 的 0x80-0x9F 上半区映射（WHATWG Encoding Standard），未定义位置按同码点保留。 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d,
  0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x009d, 0x017e, 0x0178,
];

/** ISO-8859-15（Latin-9）相对 Latin-1 的全部 9 处差异。 */
const LATIN9_DIFF: [number, number][] = [
  [0xa3, 0x20ac],
  [0xa4, 0x20ac],
  [0xa6, 0x0160],
  [0xa8, 0x0161],
  [0xb4, 0x017d],
  [0xb8, 0x017e],
  [0xbc, 0x0152],
  [0xbd, 0x0153],
  [0xbe, 0x0178],
];

function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte);
  }
  return out;
}

function decodeLatin9(bytes: Uint8Array): string {
  const table = new Map(LATIN9_DIFF);
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(table.get(byte) ?? byte);
  return out;
}

/* ── 内置编码器 ─────────────────────────────────────────────── */

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const units: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    if (unit >= 0xd800 && unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      units.push(unit, next);
      i++;
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdfff) throw new Error(`文本含有未配对的代理项 ${hex4(unit)}`);
    units.push(unit);
  }
  const out = new Uint8Array(units.length * 2);
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    out[i * 2] = littleEndian ? unit & 0xff : unit >> 8;
    out[i * 2 + 1] = littleEndian ? unit >> 8 : unit & 0xff;
  }
  return out;
}

function encodeUtf32(text: string, littleEndian: boolean): Uint8Array {
  const points = Array.from(text, (char) => char.codePointAt(0) ?? 0);
  const out = new Uint8Array(points.length * 4);
  for (let i = 0; i < points.length; i++) {
    const code = points[i];
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new Error(`文本含有非法码点 ${hex4(code)}，无法编码为 UTF-32`);
    }
    const offset = i * 4;
    out[offset] = littleEndian ? code & 0xff : (code >>> 24) & 0xff;
    out[offset + 1] = littleEndian ? (code >>> 8) & 0xff : (code >>> 16) & 0xff;
    out[offset + 2] = littleEndian ? (code >>> 16) & 0xff : (code >>> 8) & 0xff;
    out[offset + 3] = littleEndian ? (code >>> 24) & 0xff : code & 0xff;
  }
  return out;
}

function encodeAscii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit > 0x7f) throw new Error(`ASCII 无法表示 ${hex4(unit)}（第 ${i + 1} 个字符）`);
    out[i] = unit;
  }
  return out;
}

function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit > 0xff) throw new Error(`Latin-1 无法表示 ${hex4(unit)}（第 ${i + 1} 个字符）`);
    out[i] = unit;
  }
  return out;
}

function encodeCp1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // 0x00-0x7F 与 0xA0-0xFF 都和 Latin-1 一样按码点直译，其余查上半区映射表。
    if (unit < 0x80 || (unit >= 0xa0 && unit <= 0xff)) {
      out[i] = unit;
      continue;
    }
    const index = CP1252_HIGH.indexOf(unit);
    if (index < 0) throw new Error(`Windows-1252 无法表示 ${hex4(unit)}（第 ${i + 1} 个字符）`);
    out[i] = index + 0x80;
  }
  return out;
}

function encodeLatin9(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // € 在 0xA3 / 0xA4 都成立，这里统一取靠前的 0xA3
    const hit = LATIN9_DIFF.find(([, code]) => code === unit);
    if (hit) {
      out[i] = hit[0];
      continue;
    }
    // 0x80-0x9F 在 ISO-8859-x 里没有任何定义，不能编码
    if (unit < 0x80 || (unit >= 0xa0 && unit <= 0xff)) {
      out[i] = unit;
      continue;
    }
    throw new Error(`ISO-8859-15 无法表示 ${hex4(unit)}（第 ${i + 1} 个字符）`);
  }
  return out;
}

const BUILTIN_DECODERS: Record<string, (bytes: Uint8Array) => string> = {
  'utf-8': decodeUtf8,
  'utf-16le': (bytes) => decodeUtf16(bytes, true),
  'utf-16be': (bytes) => decodeUtf16(bytes, false),
  'utf-32le': (bytes) => decodeUtf32(bytes, true),
  'utf-32be': (bytes) => decodeUtf32(bytes, false),
  ascii: decodeAscii,
  latin1: decodeLatin1,
  'windows-1252': decodeCp1252,
  'iso-8859-15': decodeLatin9,
};

const BUILTIN_ENCODERS: Record<string, (text: string) => Uint8Array> = {
  'utf-8': encodeUtf8,
  'utf-16le': (text) => encodeUtf16(text, true),
  'utf-16be': (text) => encodeUtf16(text, false),
  'utf-32le': (text) => encodeUtf32(text, true),
  'utf-32be': (text) => encodeUtf32(text, false),
  ascii: encodeAscii,
  latin1: encodeLatin1,
  'windows-1252': encodeCp1252,
  'iso-8859-15': encodeLatin9,
};

/** 可以承载任意 Unicode 文本的编码，用作「字节 → 文本」模式的目标编码。 */
export const UNICODE_IDS = ['utf-8', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be'];

/* ── 编码清单 ───────────────────────────────────────────────── */

const BUILTIN_ROWS: Omit<EncodingInfo, 'decode' | 'encode'>[] = [
  {
    id: 'utf-8',
    name: 'UTF-8',
    aliases: ['utf8', 'u8', 'unicode-1-1-utf-8'],
    description: '网页与 JSON 的默认编码，支持全部 Unicode 码点',
    group: 'unicode',
    note: '可选写入 EF BB BF BOM；多数场景建议不带 BOM',
  },
  {
    id: 'utf-16le',
    name: 'UTF-16LE',
    aliases: ['utf16le', 'ucs-2le', 'unicodefffe'],
    description: 'Windows 记事本、TXT 常用的小端 UTF-16',
    group: 'unicode',
    note: '内置解码不剥离 BOM，遇到 FF FE 开头请自行去掉前 2 字节',
  },
  {
    id: 'utf-16be',
    name: 'UTF-16BE',
    aliases: ['utf16be', 'ucs-2be', 'unicodefeff'],
    description: '大端 UTF-16，Java 与网络协议常见',
    group: 'unicode',
    note: '内置解码不剥离 BOM，遇到 FE FF 开头请自行去掉前 2 字节',
  },
  {
    id: 'utf-32le',
    name: 'UTF-32LE',
    aliases: ['utf32le', 'ucs-4le', 'utf-32'],
    description: '小端 UTF-32，每个码点固定 4 字节',
    group: 'unicode',
    note: '4 字节对齐，任何非法序列都会报错而不是静默替换',
  },
  {
    id: 'utf-32be',
    name: 'UTF-32BE',
    aliases: ['utf32be', 'ucs-4be'],
    description: '大端 UTF-32',
    group: 'unicode',
  },
  {
    id: 'ascii',
    name: 'US-ASCII',
    aliases: ['us-ascii', 'iso646-us', 'ansi_x3.4-1968', '646'],
    description: '7 位纯英文编码，超出 0x00-0x7F 一律报错',
    group: 'single',
  },
  {
    id: 'latin1',
    name: 'ISO-8859-1（Latin-1）',
    aliases: ['iso-8859-1', 'iso8859-1', 'l1', 'cp819', 'ibm819', 'windows-28591'],
    description: '西欧单字节编码，与字节值一一对应，是 UTF-8 乱码最常见的来源',
    group: 'single',
  },
  {
    id: 'windows-1252',
    name: 'Windows-1252',
    aliases: ['cp1252', 'x-cp1252', '1252', 'ansi'],
    description: 'Latin-1 的 Windows 变体，上半区放了欧元、弯引号等排版符号',
    group: 'single',
    note: '浏览器按 WHATWG 规则解码：未定义位置保留同码点的 C1 控制字符',
  },
  {
    id: 'iso-8859-15',
    name: 'ISO-8859-15（Latin-9）',
    aliases: ['latin9', 'latin-9', 'l9', 'csisolatin9'],
    description: 'Latin-1 的修订版，与之相比只有 9 处差异（欧元、Š/š、Ž/ž、Œ/œ、Ÿ）',
    group: 'single',
  },
];

const NATIVE_ROWS: (Omit<EncodingInfo, 'decode' | 'encode'> & { nativeLabel: string })[] = [
  {
    id: 'gbk',
    name: 'GBK / GB2312',
    aliases: ['gb2312', 'cp936', 'ms936', 'windows-936', 'x-gbk', 'chinese'],
    description: '简体中文双字节编码，国产系统与老程序的事实标准',
    group: 'legacy',
    nativeLabel: 'gbk',
    note: '包含关系 GB2312 ⊂ GBK ⊂ GB18030；浏览器把 gb2312 当作 GBK 解码',
  },
  {
    id: 'gb18030',
    name: 'GB18030',
    aliases: ['gb-18030', 'gb18030-2000'],
    description: 'GBK 的超集，覆盖全部 Unicode 码点',
    group: 'legacy',
    nativeLabel: 'gb18030',
  },
  {
    id: 'big5',
    name: 'BIG5',
    aliases: ['big-5', 'cp950', 'big5-hkscs', 'csbig5'],
    description: '繁体中文双字节编码',
    group: 'legacy',
    nativeLabel: 'big5',
    note: '繁体资料常见；微软的扩充变体通常叫 CP950 / Big5-HKSCS',
  },
  {
    id: 'shift_jis',
    name: 'Shift_JIS',
    aliases: ['sjis', 'cp932', 'ms932', 'x-sjis', 'csshiftjis'],
    description: '日文 Windows 常用编码',
    group: 'legacy',
    nativeLabel: 'shift_jis',
    note: 'CP932 是微软扩展版，含少量厂商字符，与标准 Shift_JIS 不完全相同',
  },
  {
    id: 'euc-jp',
    name: 'EUC-JP',
    aliases: ['eucjp', 'x-euc-jp', 'cseucpkdfmtjapanese'],
    description: '日文 EUC 系编码，Unix 环境常见',
    group: 'legacy',
    nativeLabel: 'euc-jp',
  },
  {
    id: 'euc-kr',
    name: 'EUC-KR',
    aliases: ['cp949', 'uhc', 'ks_c_5601-1987', 'korean'],
    description: '韩文双字节编码',
    group: 'legacy',
    nativeLabel: 'euc-kr',
    note: 'Windows 的扩充变体叫 CP949，会多出扩展韩文字母',
  },
  {
    id: 'koi8-r',
    name: 'KOI8-R',
    aliases: ['koi8r', 'cskoi8r'],
    description: '俄文单字节编码',
    group: 'legacy',
    nativeLabel: 'koi8-r',
  },
  {
    id: 'iso-8859-2',
    name: 'ISO-8859-2',
    aliases: ['latin2', 'l2', 'iso8859-2'],
    description: '中欧语言单字节编码',
    group: 'legacy',
    nativeLabel: 'iso-8859-2',
  },
  {
    id: 'iso-8859-5',
    name: 'ISO-8859-5',
    aliases: ['cyrillic', 'iso8859-5'],
    description: '西里尔字母单字节编码',
    group: 'legacy',
    nativeLabel: 'iso-8859-5',
  },
  {
    id: 'iso-8859-7',
    name: 'ISO-8859-7',
    aliases: ['greek', 'greek8', 'ecma-118', 'iso8859-7'],
    description: '希腊字母单字节编码',
    group: 'legacy',
    nativeLabel: 'iso-8859-7',
  },
  {
    id: 'macintosh',
    name: 'MacRoman',
    aliases: ['mac', 'macroman', 'x-mac-roman'],
    description: '经典 macOS 的西文单字节编码',
    group: 'legacy',
    nativeLabel: 'macintosh',
  },
  {
    id: 'utf-7',
    name: 'UTF-7',
    aliases: ['unicode-1-1-utf-7', 'csunicode11utf7'],
    description: '早期 MIME 用的 7 位编码，已被 RFC 3502 废弃',
    group: 'deprecated',
    nativeLabel: '',
    note: '历史上有安全隐患，浏览器不提供，本工具也不会实现',
  },
];

const nativeDecoderCache = new Map<string, TextDecoder | null>();

/** 运行时探测浏览器是否真的实现了某个多字节编码的解码器。 */
function nativeDecoder(id: string): TextDecoder | null {
  if (nativeDecoderCache.has(id)) return nativeDecoderCache.get(id) ?? null;
  const row = NATIVE_ROWS.find((item) => item.id === id);
  let decoder: TextDecoder | null = null;
  if (row?.nativeLabel && typeof TextDecoder !== 'undefined') {
    try {
      const candidate = new TextDecoder(row.nativeLabel, { fatal: true });
      // 空数组不会报错，用一个 ASCII 字节做真实探测
      if (candidate.decode(new Uint8Array([0x41])) === 'A') decoder = candidate;
    } catch {
      decoder = null;
    }
  }
  nativeDecoderCache.set(id, decoder);
  return decoder;
}

export const ENCODINGS: EncodingInfo[] = [
  ...BUILTIN_ROWS.map((row) => ({ ...row, decode: 'builtin' as SupportLevel, encode: 'builtin' as SupportLevel })),
  ...NATIVE_ROWS.map(({ nativeLabel, ...row }) => ({
    ...row,
    decode: nativeDecoder(row.id) ? ('native' as SupportLevel) : ('none' as SupportLevel),
    encode: 'none' as SupportLevel,
    nativeLabel,
  })),
];

export function findEncoding(id: string): EncodingInfo | undefined {
  return ENCODINGS.find((item) => item.id === id);
}

/** 可以解码（字节 → 文本）的编码：内置表 + 浏览器原生 TextDecoder。 */
export function decodableEncodings(): EncodingInfo[] {
  return ENCODINGS.filter((item) => item.decode !== 'none');
}

/** 可以编码（文本 → 字节）的编码：只有内置表覆盖的那些。 */
export function encodableEncodings(): EncodingInfo[] {
  return ENCODINGS.filter((item) => item.encode !== 'none');
}

export function decodeLabel(info: EncodingInfo): string {
  if (info.decode === 'builtin') return '内置 · 双向';
  if (info.decode === 'native') return '浏览器原生 · 仅解码';
  return '不支持';
}

export function encodeLabel(info: EncodingInfo): string {
  if (info.encode === 'builtin') return '内置 · 双向';
  return '不支持';
}

/* ── 转换入口 ───────────────────────────────────────────────── */

export function canDecode(id: string): boolean {
  return findEncoding(id)?.decode !== 'none';
}

export function canEncode(id: string): boolean {
  return findEncoding(id)?.encode !== 'none';
}

export function decodeBytes(bytes: Uint8Array, id: string): string {
  const builtin = BUILTIN_DECODERS[id];
  if (builtin) return builtin(bytes);
  const decoder = nativeDecoder(id);
  if (decoder) return decoder.decode(bytes);
  const info = findEncoding(id);
  throw new Error(`「${info?.name ?? id}」没有可用的解码器`);
}

export function encodeText(text: string, id: string): Uint8Array {
  const builtin = BUILTIN_ENCODERS[id];
  if (builtin) return builtin(text);
  const info = findEncoding(id);
  throw new Error(unsupportedEncodeMessage(info));
}

function unsupportedEncodeMessage(info?: EncodingInfo): string {
  if (!info) return '未知编码';
  if (info.encode === 'none') {
    return `「${info.name}」只支持解码：浏览器不提供编码器，扩展也没有内置它的映射表，转换请使用 iconv 等桌面工具`;
  }
  return `「${info.name}」不支持编码`;
}

/** 导出文件用的字节序标记；UTF-8 的 BOM 可选，其他 UTF 编码必须带。 */
export function bomBytes(id: string): Uint8Array {
  switch (id) {
    case 'utf-8':
      return new Uint8Array([0xef, 0xbb, 0xbf]);
    case 'utf-16le':
      return new Uint8Array([0xff, 0xfe]);
    case 'utf-16be':
      return new Uint8Array([0xfe, 0xff]);
    case 'utf-32le':
      return new Uint8Array([0xff, 0xfe, 0x00, 0x00]);
    case 'utf-32be':
      return new Uint8Array([0x00, 0x00, 0xfe, 0xff]);
    default:
      return new Uint8Array(0);
  }
}

/** UTF-16/32 不带 BOM 无法被多数工具识别，导出时强制补上。 */
export function requiresBom(id: string): boolean {
  return id === 'utf-16le' || id === 'utf-16be' || id === 'utf-32le' || id === 'utf-32be';
}

/* ── 乱码修复 ───────────────────────────────────────────────── */

export interface MojibakeCandidate {
  id: string;
  /** 误读时使用的编码 */
  label: string;
  /** 参与计算的编码标识，外部工具候选为 undefined */
  charsetId?: string;
  /** 还原思路说明 */
  direction: string;
  ok: boolean;
  text: string;
  error?: string;
  /** 可信度评分 0-100，仅 ok 时有意义 */
  score: number;
  confidence: Confidence;
  notes: string[];
  /** 需要外部工具时给出的命令 */
  external?: string;
}

interface FixPlan {
  id: string;
  label: string;
  charsetId?: string;
  direction: string;
  external?: string;
}

const FIX_PLANS: FixPlan[] = [
  {
    id: 'utf8-latin1',
    label: 'UTF-8 → ISO-8859-1（Latin-1）',
    charsetId: 'latin1',
    direction: '最常见的乱码：UTF-8 字节被当成 Latin-1 逐字节读成字符',
  },
  {
    id: 'utf8-cp1252',
    label: 'UTF-8 → Windows-1252',
    charsetId: 'windows-1252',
    direction: 'UTF-8 字节被浏览器/编辑器按西欧 Windows 编码解读',
  },
  {
    id: 'utf8-latin9',
    label: 'UTF-8 → ISO-8859-15（Latin-9）',
    charsetId: 'iso-8859-15',
    direction: 'UTF-8 字节被按 Latin-9 解读，与 Latin-1 仅差 9 个字符',
  },
  {
    id: 'utf8-gbk',
    label: 'UTF-8 → GBK',
    direction: 'UTF-8 字节被当成简体中文编码解读',
    external:
      "iconv -f gbk -t utf-8 乱码.txt > 修复.txt\npython3 -c \"open('修复.txt','wb').write(open('乱码.txt',encoding='gbk').read().encode('gbk'))\"",
  },
  {
    id: 'utf8-big5',
    label: 'UTF-8 → BIG5',
    direction: 'UTF-8 字节被当成繁体中文编码解读',
    external:
      "iconv -f big5 -t utf-8 乱码.txt > 修复.txt\npython3 -c \"open('修复.txt','wb').write(open('乱码.txt',encoding='big5').read().encode('big5'))\"",
  },
  {
    id: 'utf8-shift_jis',
    label: 'UTF-8 → Shift_JIS',
    direction: 'UTF-8 字节被当成日文编码解读',
    external:
      "iconv -f shift_jis -t utf-8 乱码.txt > 修复.txt\npython3 -c \"open('修复.txt','wb').write(open('乱码.txt',encoding='shift_jis').read().encode('shift_jis'))\"",
  },
];

export interface TextQuality {
  total: number;
  cjk: number;
  ascii: number;
  latin: number;
  suspicious: number;
}

function inRanges(code: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => code >= start && code <= end);
}

const CJK_RANGES: [number, number][] = [
  [0x3000, 0x303f],
  [0x3040, 0x30ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0x20000, 0x2a6df],
];

const LATIN_RANGES: [number, number][] = [
  [0xc0, 0x24f],
  [0x370, 0x52f],
];

const SUSPICIOUS_RANGES: [number, number][] = [
  [0x80, 0x9f],
  [0xfffd, 0xfffd],
  [0xe000, 0xf8ff],
  [0x2500, 0x259f],
  [0x2100, 0x2bff],
];

/** 统计文本的字符构成，用于给修复结果打分（不判断对错，只描述「像不像正常文本」）。 */
export function analyzeText(text: string): TextQuality {
  let cjk = 0;
  let ascii = 0;
  let latin = 0;
  let suspicious = 0;
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    total += 1;
    if (code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0x7e)) ascii += 1;
    else if (inRanges(code, CJK_RANGES)) cjk += 1;
    else if (inRanges(code, LATIN_RANGES)) latin += 1;
    else if (inRanges(code, SUSPICIOUS_RANGES)) suspicious += 1;
  }
  return { total, cjk, ascii, latin, suspicious };
}

function scoreText(text: string): { score: number; confidence: Confidence; notes: string[] } {
  const quality = analyzeText(text);
  const notes: string[] = [];
  if (quality.total === 0) return { score: 0, confidence: 'none', notes: ['结果是空文本'] };
  const ratioCjk = quality.cjk / quality.total;
  const ratioAscii = quality.ascii / quality.total;
  const ratioLatin = quality.latin / quality.total;
  const ratioSuspicious = quality.suspicious / quality.total;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Math.min(60, ratioCjk * 120) +
          Math.min(25, ratioAscii * 60) +
          Math.min(15, ratioLatin * 50) -
          ratioSuspicious * 80,
      ),
    ),
  );
  const confidence: Confidence = score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';
  if (ratioCjk > 0.3) notes.push(`中文字符占 ${Math.round(ratioCjk * 100)}%，是最典型的正确还原结果`);
  if (ratioAscii > 0.9) notes.push('几乎全是 ASCII，可能是英文文本而不是中文乱码');
  if (ratioSuspicious > 0.05) notes.push(`含 ${Math.round(ratioSuspicious * 100)}% 的控制符或私用区字符，方向可能不对`);
  if (text.includes('\ufffd')) notes.push('出现了替换字符 U+FFFD，原始字节已经丢失，无法完全还原');
  return { score, confidence, notes };
}

/** 按候选编码把乱码还原成 UTF-8：把字符按误读编码打包成字节，再按 UTF-8 严格解析。 */
function repairWith(text: string, charsetId: string, passes: number): { ok: boolean; text: string; error?: string } {
  let bytes: Uint8Array;
  try {
    bytes = encodeText(text, charsetId);
  } catch (error) {
    return { ok: false, text, error: error instanceof Error ? error.message : String(error) };
  }
  let current = text;
  for (let i = 0; i < passes; i++) {
    try {
      bytes = encodeText(current, charsetId);
      current = decodeUtf8(bytes);
    } catch (error) {
      return {
        ok: false,
        text,
        error: error instanceof Error ? `第 ${i + 1} 轮还原失败：${error.message}` : String(error),
      };
    }
  }
  return { ok: true, text: current };
}

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case 'high':
      return '可信度高';
    case 'medium':
      return '可信度中';
    case 'low':
      return '可信度低';
    default:
      return '无结果';
  }
}

/**
 * 生成乱码修复候选：UTF-8 字节被误读成各种单字节编码后，按候选编码重新打包再按 UTF-8 解析。
 * 只输出字节严格往返成功的结果，解析不通过时给出错误而不是猜测内容。
 */
export function repairMojibake(text: string): MojibakeCandidate[] {
  if (text === '') return [];
  const results: MojibakeCandidate[] = [];
  for (const plan of FIX_PLANS) {
    if (!plan.charsetId || !canEncode(plan.charsetId)) {
      results.push({
        id: plan.id,
        label: plan.label,
        direction: plan.direction,
        ok: false,
        text,
        error: '浏览器只提供解码器、没有该编码的编码器；扩展也不会内置 GBK / BIG5 这类映射表，本地无法可靠还原',
        score: 0,
        confidence: 'none',
        notes: ['把乱码文本连同扩展名一起交给下面的命令处理，得到的文件就是修复后的 UTF-8 文本'],
        external: plan.external,
      });
      continue;
    }
    const fixed = repairWith(text, plan.charsetId, 1);
    if (!fixed.ok) {
      results.push({
        id: plan.id,
        label: plan.label,
        charsetId: plan.charsetId,
        direction: plan.direction,
        ok: false,
        text,
        error: fixed.error,
        score: 0,
        confidence: 'none',
        notes: ['按该编码打包后不是合法的 UTF-8 字节序列，说明原始文本不是被这种编码误读的'],
      });
      continue;
    }
    const unchanged = fixed.text === text;
    const quality = unchanged
      ? { score: 0, confidence: 'none' as Confidence, notes: ['结果与输入完全相同，说明输入本来就是合法文本'] }
      : scoreText(fixed.text);
    results.push({
      id: plan.id,
      label: plan.label,
      charsetId: plan.charsetId,
      direction: plan.direction,
      ok: !unchanged,
      text: fixed.text,
      score: quality.score,
      confidence: quality.confidence,
      notes: unchanged ? [...quality.notes, '输入只含 ASCII 时任何候选编码都会得到相同结果'] : quality.notes,
    });
  }

  // 双重编码（乱码被再次转码保存过一次）在实践中很常见，追加一个二次修复候选。
  const latin1 = results.find((item) => item.id === 'utf8-latin1');
  if (latin1?.ok) {
    const twice = repairWith(latin1.text, 'latin1', 1);
    if (twice.ok && twice.text !== latin1.text) {
      const quality = scoreText(twice.text);
      results.push({
        id: 'utf8-latin1-x2',
        label: 'UTF-8 → Latin-1 修复两轮',
        charsetId: 'latin1',
        direction: '文本被重复错误转码两次时使用',
        ok: true,
        text: twice.text,
        score: quality.score,
        confidence: quality.confidence,
        notes: ['双重乱码：先用一次修复的结果再修复一次', ...quality.notes],
      });
    }
  }

  // 结果与前面的候选完全一致的（例如输入只含 ASCII 时多个候选等价）就不再重复展示。
  const unique: MojibakeCandidate[] = [];
  for (const item of results) {
    if (item.ok && unique.some((kept) => kept.ok && kept.text === item.text)) continue;
    unique.push(item);
  }

  const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2, none: 3 };
  return unique.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    return rank[a.confidence] - rank[b.confidence];
  });
}
