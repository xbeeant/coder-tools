/**
 * 纯 TypeScript 的 DES / TripleDES-CBC 实现。
 * WebCrypto 的 `crypto.subtle` 只提供 AES，不支持 DES/3DES，因此这里按 FIPS 46-3
 * 的表格自行实现，供 AES 工具页的「DES-CBC / 3DES-CBC」选项使用。
 * 注意：DES 早已被破译（暴力破解成本极低），仅用于与遗留系统对接，不要用于新系统。
 */

import type { Bytes } from './bytes';

const BLOCK_BYTES = 8;
const _BLOCK_BITS = 64;

/** 8 个 S 盒，每个 4 行 × 16 列；行由首尾两位决定，列由中间四位决定。 */
// biome-ignore format: 表格按规范排版，不做换行压缩
const S_BOXES: number[][][] = [
  [ // S1
    [14,  4, 13,  1,  2, 15, 11,  8,  3, 10,  6, 12,  5,  9,  0,  7],
    [ 0, 15,  7,  4, 14,  2, 13,  1, 10,  6, 12, 11,  9,  5,  3,  8],
    [ 4,  1, 14,  8, 13,  6,  2, 11, 15, 12,  9,  7,  3, 10,  5,  0],
    [15, 12,  8,  2,  4,  9,  1,  7,  5, 11,  3, 14, 10,  0,  6, 13],
  ],
  [ // S2
    [15,  1,  8, 14,  6, 11,  3,  4,  9,  7,  2, 13, 12,  0,  5, 10],
    [ 3, 13,  4,  7, 15,  2,  8, 14, 12,  0,  1, 10,  6,  9, 11,  5],
    [ 0, 14,  7, 11, 10,  4, 13,  1,  5,  8, 12,  6,  9,  3,  2, 15],
    [13,  8, 10,  1,  3, 15,  4,  2, 11,  6,  7, 12,  0,  5, 14,  9],
  ],
  [ // S3
    [10,  0,  9, 14,  6,  3, 15,  5,  1, 13, 12,  7, 11,  4,  2,  8],
    [13,  7,  0,  9,  3,  4,  6, 10,  2,  8,  5, 14, 12, 11, 15,  1],
    [13,  6,  4,  9,  8, 15,  3,  0, 11,  1,  2, 12,  5, 10, 14,  7],
    [ 1, 10, 13,  0,  6,  9,  8,  7,  4, 15, 14,  3, 11,  5,  2, 12],
  ],
  [ // S4
    [ 7, 13, 14,  3,  0,  6,  9, 10,  1,  2,  8,  5, 11, 12,  4, 15],
    [13,  8, 11,  5,  6, 15,  0,  3,  4,  7,  2, 12,  1, 10, 14,  9],
    [10,  6,  9,  0, 12, 11,  7, 13, 15,  1,  3, 14,  5,  2,  8,  4],
    [ 3, 15,  0,  6, 10,  1, 13,  8,  9,  4,  5, 11, 12,  7,  2, 14],
  ],
  [ // S5
    [ 2, 12,  4,  1,  7, 10, 11,  6,  8,  5,  3, 15, 13,  0, 14,  9],
    [14, 11,  2, 12,  4,  7, 13,  1,  5,  0, 15, 10,  3,  9,  8,  6],
    [ 4,  2,  1, 11, 10, 13,  7,  8, 15,  9, 12,  5,  6,  3,  0, 14],
    [11,  8, 12,  7,  1, 14,  2, 13,  6, 15,  0,  9, 10,  4,  5,  3],
  ],
  [ // S6
    [12,  1, 10, 15,  9,  2,  6,  8,  0, 13,  3,  4, 14,  7,  5, 11],
    [10, 15,  4,  2,  7, 12,  9,  5,  6,  1, 13, 14,  0, 11,  3,  8],
    [ 9, 14, 15,  5,  2,  8, 12,  3,  7,  0,  4, 10,  1, 13, 11,  6],
    [ 4,  3,  2, 12,  9,  5, 15, 10, 11, 14,  1,  7,  6,  0,  8, 13],
  ],
  [ // S7
    [ 4, 11,  2, 14, 15,  0,  8, 13,  3, 12,  9,  7,  5, 10,  6,  1],
    [13,  0, 11,  7,  4,  9,  1, 10, 14,  3,  5, 12,  2, 15,  8,  6],
    [ 1,  4, 11, 13, 12,  3,  7, 14, 10, 15,  6,  8,  0,  5,  9,  2],
    [ 6, 11, 13,  8,  1,  4, 10,  7,  9,  5,  0, 15, 14,  2,  3, 12],
  ],
  [ // S8
    [13,  2,  8,  4,  6, 15, 11,  1, 10,  9,  3, 14,  5,  0, 12,  7],
    [ 1, 15, 13,  8, 10,  3,  7,  4, 12,  5,  6, 11,  0, 14,  9,  2],
    [ 7, 11,  4,  1,  9, 12, 14,  2,  0,  6, 10, 13, 15,  3,  5,  8],
    [ 2,  1, 14,  7,  4, 10,  8, 13, 15, 12,  9,  0,  3,  5,  6, 11],
  ],
];

/** 初始置换前的密钥编排：64 位密钥 → 56 位有效位（每字节最低位为奇偶校验位）。 */
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 63, 55,
  47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];

/** 每轮子密钥：56 位 → 48 位。 */
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30,
  40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24,
  16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31,
  23, 15, 7,
];

const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21,
  61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49,
  17, 57, 25,
];

/** 扩展置换：32 位 → 48 位。 */
const EXPAND = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22,
  23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

/** S 盒输出后的置换：32 位 → 32 位。 */
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

/** 每轮 C/D 半部左移位数。 */
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

function toBits(bytes: Bytes): Bytes {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (byte >> (7 - b)) & 1;
  }
  return bits;
}

function fromBits(bits: Bytes): Bytes {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b]!;
    bytes[i] = byte;
  }
  return bytes;
}

/** 按位选表重排，表中位号从 1 开始（对应 FIPS 的编号方式）。 */
function permute(bits: Bytes, table: number[]): Bytes {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = bits[table[i]! - 1]!;
  return out;
}

function rotateLeft(bits: Bytes, shift: number): Bytes {
  const out = new Uint8Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = bits[(i + shift) % bits.length]!;
  return out;
}

function xorBits(a: Bytes, b: Bytes): Bytes {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! ^ b[i]!;
  return out;
}

/** 由 8 字节密钥生成 16 个 48 位轮子密钥。 */
function scheduleOf(key: Bytes): Bytes[] {
  if (key.length !== BLOCK_BYTES) throw new Error('DES 密钥必须是 8 字节');
  const permuted = permute(toBits(key), PC1);
  let c = permuted.slice(0, 28);
  let d = permuted.slice(28, 56);
  const roundKeys: Bytes[] = [];
  for (let round = 0; round < 16; round++) {
    c = rotateLeft(c, SHIFTS[round]!);
    d = rotateLeft(d, SHIFTS[round]!);
    const joined = new Uint8Array(56);
    joined.set(c, 0);
    joined.set(d, 28);
    roundKeys.push(permute(joined, PC2));
  }
  return roundKeys;
}

/** Feistel 轮函数 F：32 位右半部 + 48 位子密钥 → 32 位。 */
function feistel(right: Bytes, roundKey: Bytes): Bytes {
  const expanded = xorBits(permute(right, EXPAND), roundKey);
  const substituted = new Uint8Array(32);
  for (let box = 0; box < 8; box++) {
    const offset = box * 6;
    const row = (expanded[offset]! << 1) | expanded[offset + 5]!;
    let column = 0;
    for (let i = 1; i <= 4; i++) column = (column << 1) | expanded[offset + i]!;
    const value = S_BOXES[box]![row]![column]!;
    substituted[box * 4] = (value >> 3) & 1;
    substituted[box * 4 + 1] = (value >> 2) & 1;
    substituted[box * 4 + 2] = (value >> 1) & 1;
    substituted[box * 4 + 3] = value & 1;
  }
  return permute(substituted, P);
}

function cryptBlock(block: Bytes, roundKeys: Bytes[], reverse: boolean): Bytes {
  const permuted = permute(toBits(block), IP);
  let left = permuted.slice(0, 32);
  let right = permuted.slice(32, 64);
  for (let step = 0; step < 16; step++) {
    const roundKey = roundKeys[reverse ? 15 - step : step]!;
    const next = xorBits(left, feistel(right, roundKey));
    left = right;
    right = next;
  }
  const preOutput = new Uint8Array(64);
  preOutput.set(right, 0);
  preOutput.set(left, 32);
  return fromBits(permute(preOutput, FP));
}

function xorBlock(block: Bytes, mask: Bytes): Bytes {
  const out = new Uint8Array(BLOCK_BYTES);
  for (let i = 0; i < BLOCK_BYTES; i++) out[i] = block[i]! ^ mask[i]!;
  return out;
}

export type TripleDesKind = 'des' | '3des-2key' | '3des-3key';

/** 判断密钥长度对应单 DES、两密钥 3DES 还是三密钥 3DES。 */
export function tripleDesKind(key: Bytes): TripleDesKind {
  if (key.length === 8) return 'des';
  if (key.length === 16) return '3des-2key';
  if (key.length === 24) return '3des-3key';
  throw new Error('DES 密钥长度必须是 8、16（两密钥 3DES）或 24 字节');
}

/**
 * 弱密钥探针：用于检验 E(E(P)) === P 这一弱密钥定义性质。
 * 取两组差异极大的固定明文，两组都成立才判定为弱密钥。
 */
const WEAK_KEY_PROBES = ['0000000000000000', 'fedcba9876543210'];

function hexBlock(hex: string): Bytes {
  const out = new Uint8Array(BLOCK_BYTES);
  for (let i = 0; i < BLOCK_BYTES; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 判断是否为 DES 弱密钥（对任意明文加密两次都还原成明文）。
 *
 * 直接检验定义性质而非比对硬编码列表：DES 忽略每个字节的奇偶校验位，
 * 因此同一个有效密钥有多种十六进制写法（如 0x1f1f… 与 0x1e1e… 等价），
 * 穷举列表既容易漏写也无法覆盖全部写法。全零密钥同样满足该性质，也会被识别。
 */
export function isWeakDesKey(key: Bytes): boolean {
  if (key.length !== 8) return false;
  const schedule = scheduleOf(key);
  return WEAK_KEY_PROBES.every((probe) => {
    const once = cryptBlock(hexBlock(probe), schedule, false);
    const twice = cryptBlock(once, schedule, false);
    return equalBytes(twice, hexBlock(probe));
  });
}

/** 3DES 的 EDE 变换：K1 加密 → K2 解密 → K3 加密；解密时顺序相反。 */
function edeBlock(block: Bytes, schedules: Bytes[][], decrypt = false): Bytes {
  const order = decrypt ? [2, 1, 0] : [0, 1, 2];
  const forward = decrypt ? [false, true, false] : [true, false, true];
  let out = block;
  for (let i = 0; i < 3; i++) {
    out = cryptBlock(out, schedules[order[i]!]!, !forward[i]!);
  }
  return out;
}

/** 8 字节密钥即单 DES；16 字节是 K3=K1 的两密钥 3DES；24 字节为三密钥 3DES。 */
function subKeys(key: Bytes): { kind: TripleDesKind; schedules: Bytes[][] } {
  const kind = tripleDesKind(key);
  if (kind === 'des') return { kind, schedules: [scheduleOf(key)] };
  const k1 = key.slice(0, 8);
  const k2 = key.slice(8, 16);
  const k3 = key.length >= 24 ? key.slice(16, 24) : k1;
  return { kind, schedules: [scheduleOf(k1), scheduleOf(k2), scheduleOf(k3)] };
}

function cryptBlocks(data: Bytes, iv: Bytes, key: Bytes, decrypt: boolean): Bytes {
  if (data.length % BLOCK_BYTES !== 0) throw new Error('数据长度必须是 8 字节的整数倍');
  const { kind, schedules } = subKeys(key);
  const out = new Uint8Array(data.length);
  let chain = iv.slice(0, BLOCK_BYTES);
  for (let offset = 0; offset < data.length; offset += BLOCK_BYTES) {
    const block = data.subarray(offset, offset + BLOCK_BYTES);
    if (decrypt) {
      // 单 DES 走同一套轮函数，reverse=true 时内部按倒序取轮子密钥
      const plain = kind === 'des' ? cryptBlock(block, schedules[0]!, true) : edeBlock(block, schedules, true);
      out.set(xorBlock(plain, chain), offset);
      chain = block.slice();
    } else {
      const cipher =
        kind === 'des'
          ? cryptBlock(xorBlock(block, chain), schedules[0]!, false)
          : edeBlock(xorBlock(block, chain), schedules, false);
      out.set(cipher, offset);
      chain = cipher;
    }
  }
  return out;
}

/** PKCS#7 填充：末字节记录补了多少个字节。 */
function pad(data: Bytes): Bytes {
  const padding = BLOCK_BYTES - (data.length % BLOCK_BYTES);
  const out = new Uint8Array(data.length + padding);
  out.set(data);
  out.fill(padding, data.length);
  return out;
}

function unpad(data: Bytes): Bytes {
  if (data.length === 0) throw new Error('密文为空，无法去除填充');
  const padding = data[data.length - 1]!;
  if (padding === 0 || padding > BLOCK_BYTES || padding > data.length) {
    throw new Error('填充无效：口令错误或密文被篡改');
  }
  for (let i = data.length - padding; i < data.length; i++) {
    if (data[i] !== padding) throw new Error('填充无效：口令错误或密文被篡改');
  }
  return data.subarray(0, data.length - padding);
}

/** DES-CBC / 3DES-CBC 加密，PKCS#7 填充。 */
export function desCbcEncrypt(key: Bytes, iv: Bytes, data: Bytes): Bytes {
  if (iv.length !== BLOCK_BYTES) throw new Error('IV 必须是 8 字节');
  return cryptBlocks(pad(data), iv, key, false);
}

/** DES-CBC / 3DES-CBC 解密，去除 PKCS#7 填充。 */
export function desCbcDecrypt(key: Bytes, iv: Bytes, data: Bytes): Bytes {
  if (iv.length !== BLOCK_BYTES) throw new Error('IV 必须是 8 字节');
  return unpad(cryptBlocks(data, iv, key, true));
}

/** NIST 已知向量：key=0x0123456789ABCDEF，明文 "Now is t" → 3FA40E8A984D4815。 */
export const DES_TEST_VECTOR = {
  key: '0123456789ABCDEF',
  plain: '4e6f772069732074',
  cipher: '3fa40e8a984d4815',
} as const;
