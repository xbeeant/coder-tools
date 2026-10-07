/** 与 DOM lib 的 BufferSource 兼容的字节数组类型。 */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * TS 5.7 起 Uint8Array 的 buffer 类型参数化，来自 WebCrypto 返回值或
 * Uint8Array<ArrayBufferLike> 的视图无法直接当作 BufferSource 传入，
 * 统一用本函数转换为可传入 WebCrypto 的类型。
 */
export function toBytes(view: Uint8Array): Bytes {
  return view.buffer instanceof ArrayBuffer ? (view as Bytes) : new Uint8Array(view);
}

export function utf8ToBytes(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function bytesToUtf8(bytes: Uint8Array, fatal = false): string {
  return new TextDecoder('utf-8', { fatal }).decode(bytes);
}

const HEX_ALPHABET = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array, separator = ''): string {
  let out = '';
  for (const byte of bytes) {
    if (separator && out) out += separator;
    out += HEX_ALPHABET[byte >> 4]! + HEX_ALPHABET[byte & 0x0f]!;
  }
  return out;
}

/**
 * 去掉分隔符，并只剥离每段开头的 0x 前缀。
 * 必须按 token 起始剥离：全局替换会误伤 de0xb、a0xb1 这类含 "0x" 的正常十六进制数据。
 */
function normalizeHex(text: string): string {
  return text
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)
    .map((token) => (/^0x/i.test(token) ? token.slice(2) : token))
    .join('');
}

/**
 * 校验并返回十六进制串，确保 isHex 与 hexToBytes 的判定来自同一处逻辑：
 * 返回 null 表示非法；返回空串表示输入不含任何数据（纯空白）；否则为纯十六进制串。
 */
function hexPayload(text: string): string | null {
  const cleaned = normalizeHex(text);
  if (!/^[0-9a-f]*$/i.test(cleaned)) return null;
  if (cleaned.length > 0) return cleaned;
  // 只写了分隔符或 0x 前缀（如 "0x"）时不是合法十六进制文本
  return /[^\s,]/.test(text) ? null : '';
}

/** 宽松解析十六进制：忽略空白与每段 0x 前缀，奇数位补前导 0。 */
export function hexToBytes(text: string): Bytes {
  const cleaned = hexPayload(text);
  if (cleaned === null) throw new Error('包含非十六进制字符');
  if (cleaned.length === 0) return new Uint8Array(0);
  const normalized = cleaned.length % 2 === 1 ? `0${cleaned}` : cleaned;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function isHex(text: string): boolean {
  const cleaned = hexPayload(text);
  return cleaned !== null && cleaned.length > 0;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ToBytes(text: string): Bytes {
  const cleaned = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  if (cleaned === '') return new Uint8Array(0);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('不是合法的 Base64 文本');
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(Math.max(0, Math.floor(length))));
}

/** 避免取模偏差的拒绝采样索引。 */
export function randomIndex(size: number): number {
  if (size <= 0) throw new Error('size 必须大于 0');
  const limit = Math.floor(0x100000000 / size) * size;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % size;
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function digest(algorithm: string, data: Uint8Array): Promise<Bytes> {
  const hash = await crypto.subtle.digest(algorithm, toBytes(data));
  return new Uint8Array(hash);
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes)) return '-';
  const sign = bytes < 0 ? '-' : '';
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(value) : value.toFixed(decimals);
  return `${sign}${text} ${SIZE_UNITS[unit]}`;
}

/** 不可见字符可视化，用于检查隐藏空格与控制字符。 */
const INVISIBLE: Record<string, string> = {
  ' ': '␣',
  '\t': '⇥',
  '\n': '↵',
  '\r': '␍',
  '\0': '␀',
};

export function visualizeInvisible(text: string): string {
  let out = '';
  for (const char of text) {
    if (INVISIBLE[char]) {
      out += INVISIBLE[char];
    } else if (char.codePointAt(0)! < 0x20 || char.codePointAt(0)! === 0x7f) {
      out += `\\x${char.codePointAt(0)!.toString(16).padStart(2, '0')}`;
    } else {
      out += char;
    }
  }
  return out;
}
