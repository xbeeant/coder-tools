/**
 * bcrypt 口令哈希的纯逻辑封装：生成、校验、哈希字符串结构拆解与测试向量。
 * bcrypt 是单向哈希，无法解密；校验时把明文按同样的盐与 cost 重新计算再比对。
 */

import bcrypt from 'bcryptjs';

export const COST_MIN = 4;
export const COST_MAX = 15;
export const COST_DEFAULT = 10;

/** bcrypt 固定 60 字符：$2b$10$[22 字符盐][31 字符哈希]。 */
const BCRYPT_PATTERN = /^\$(2[abxy])\$(\d{2})\$([./A-Za-z0-9]{53})$/;

export interface BcryptParts {
  /** 版本标识，如 $2b$。 */
  algorithm: string;
  /** cost 的十进制值。 */
  cost: number;
  /** 22 字符盐（bcrypt 自带的随机串）。 */
  salt: string;
  /** 31 字符哈希值（bcrypt 字母表，末尾自带补位字符）。 */
  digest: string;
}

/** 拆解 bcrypt 哈希；格式不合法时返回 null。 */
export function parseBcryptHash(hash: string): BcryptParts | null {
  const matched = BCRYPT_PATTERN.exec(hash.trim());
  if (!matched) return null;
  const body = matched[3]!;
  return {
    algorithm: `$${matched[1]}$`,
    cost: Number.parseInt(matched[2]!, 10),
    salt: body.slice(0, 22),
    digest: body.slice(22),
  };
}

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_PATTERN.test(hash.trim());
}

/** cost 每加 1，计算量翻倍（2^cost 次迭代）。 */
export function costIterations(cost: number): number {
  return 2 ** Math.max(0, Math.min(COST_MAX, cost));
}

export function costLabel(cost: number): string {
  if (cost <= 5) return '仅测试用';
  if (cost <= 8) return '偏快';
  if (cost <= 10) return '常用';
  if (cost <= 12) return '偏慢';
  return '很慢';
}

/** 生成长度以字节计的口令：超过 72 字节的部分会被 bcrypt 静默截断。 */
export function truncationNote(password: string): string | null {
  if (!bcrypt.truncates(password)) return null;
  const bytes = new TextEncoder().encode(password).length;
  return `口令 UTF-8 长度为 ${bytes} 字节，超过 bcrypt 的 72 字节上限，超出部分会被忽略`;
}

/** 生成哈希；cost 越界时先收敛到合法区间。 */
export function hashPassword(password: string, cost: number): Promise<string> {
  const safeCost = Math.min(COST_MAX, Math.max(COST_MIN, Math.round(cost)));
  return bcrypt.hash(password, safeCost);
}

export interface VerifyResult {
  /** 口令与哈希是否匹配。 */
  matched: boolean;
  /** 匹配成功时返回哈希结构；非法哈希返回 null。 */
  parts: BcryptParts | null;
  /** 中文错误说明，例如「不是合法 bcrypt 哈希」。 */
  error: string | null;
}

/** 校验口令与哈希是否匹配；哈希格式非法时给出明确错误。 */
export async function verifyPassword(password: string, hash: string): Promise<VerifyResult> {
  const trimmed = hash.trim();
  if (trimmed === '') return { matched: false, parts: null, error: '请先填写 bcrypt 哈希' };
  const parts = parseBcryptHash(trimmed);
  if (!parts) {
    return {
      matched: false,
      parts: null,
      error: '不是合法 bcrypt 哈希：应为 $2b$10$[22 字符盐][31 字符哈希] 共 60 字符',
    };
  }
  const matched = await bcrypt.compare(password, trimmed);
  return { matched, parts, error: null };
}

/** 已知测试向量：口令 + 盐 → 哈希，可用来自检实现是否正确。 */
export const TEST_VECTORS: { label: string; password: string; hash: string }[] = [
  {
    label: '空口令',
    password: '',
    hash: '$2a$06$DCq7YPn5Rq63x1Lad4cll.TV4S6ytwfsfvkgY8jIucDrjc8deX1s.',
  },
  {
    label: '单字符',
    password: 'a',
    hash: '$2a$06$m0CrhHm10qJ3lXRY.5zDGO3rS2KdeeWLuGmsfGlMfOxih58VYVfxe',
  },
  {
    label: 'abc',
    password: 'abc',
    hash: '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i',
  },
  {
    label: '26 个小写字母',
    password: 'abcdefghijklmnopqrstuvwxyz',
    hash: '$2a$06$.rCVZVOThsIa97pEDOxvGuRRgzG64bvtJ0938xuqzv18d3ZpQhstC',
  },
  {
    label: '含特殊字符（OpenBSD 官方向量）',
    password: '~!@#$%^&*()      ~!@#$%^&*()PNBFRD',
    hash: '$2a$06$fPIsBO8qRqkjj273rfaOI.HtSV9jLDpTbZn782DC6/t7qT67P6FfO',
  },
  {
    label: '$2b$ 版本（cost 10）',
    password: 'coder-tools-2026',
    hash: '$2b$10$XuA7P9OGM6/rN0KVHDiTXute7hkfBe0YQKwW.W34B8mmszh6sRkR.',
  },
];

/** 结构拆解的分段说明，供界面逐段展示。 */
export const SEGMENT_NOTES: { title: string; body: string }[] = [
  {
    title: '$2b$ 版本标识',
    body: '第 1 段：算法版本。$2a$ 是历史实现，$2b$ 修复了 $2a$ 的密钥长度溢出问题，新项目请用 $2b$。',
  },
  {
    title: '10 cost 代价因子',
    body: '第 2 段：计算量指数，实际迭代 2^cost 轮。每加 1 就翻倍，用来在安全性与登录延迟之间取舍。',
  },
  {
    title: '22 字符盐',
    body: '第 3 段前 22 位：128 位随机盐经 bcrypt 字母表编码。相同口令每次哈希结果都不同，彩虹表无法复用。',
  },
  {
    title: '31 字符哈希',
    body: '第 3 段后 31 位：184 位输出，其中 23 字节是密文，末尾 1 字节为 bcrypt 字母表的补位。',
  },
];
