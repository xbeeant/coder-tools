/** JWT 解码：解析 Header、Payload 与有效期，并提供结构校验、扁平化、敏感字段遮蔽与 HMAC 验签。 */

import { base64ToBytes, bytesToBase64Url, bytesToHex, randomBytes, utf8ToBytes } from './bytes';

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface JwtInfo {
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
  signatureBytes: number;
  algorithmNote: string;
  expires: {
    exp?: number;
    status: 'valid' | 'expired' | 'not-yet-valid' | 'none';
    remainingMs?: number;
    text: string;
  };
  issuedAt?: { iat?: number; ageMs?: number; text: string };
  notBefore?: { nbf?: number; text: string };
  audiences: string[];
  claims: { key: string; value: string }[];
}

/** base64url 解码；复用共享实现，容忍缺少 padding 并对非法字符报错。 */
function base64UrlDecode(segment: string): Uint8Array {
  return base64ToBytes(segment);
}

const ALG_NOTES: Record<string, string> = {
  HS256: 'HMAC-SHA256 对称签名，需要共享密钥',
  HS384: 'HMAC-SHA384 对称签名',
  HS512: 'HMAC-SHA512 对称签名',
  RS256: 'RSA-SHA256 非对称签名，验证只需公钥',
  RS384: 'RSA-SHA384 非对称签名',
  RS512: 'RSA-SHA512 非对称签名',
  ES256: 'ECDSA P-256 签名',
  ES384: 'ECDSA P-384 签名',
  ES512: 'ECDSA P-521 签名',
  PS256: 'RSA-PSS SHA-256 签名',
  EdDSA: 'Ed25519 / Ed448 签名',
  none: 'alg=none 未签名，任何人都能伪造，切勿用于鉴权',
};

function decodeJson<T>(segment: string, label: string): T {
  const bytes = base64UrlDecode(segment);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function describeDuration(ms: number): string {
  const abs = Math.abs(ms);
  const parts: [number, string][] = [
    [86400_000, '天'],
    [3600_000, '小时'],
    [60_000, '分钟'],
    [1000, '秒'],
  ];
  const out: string[] = [];
  let rest = abs;
  for (const [size, label] of parts) {
    const value = Math.floor(rest / size);
    if (value > 0) {
      out.push(`${value}${label}`);
      rest -= value * size;
    }
  }
  if (out.length === 0) return '不足 1 秒';
  return out.join(' ');
}

function formatTimestamp(seconds: number): string {
  return `${new Date(seconds * 1000).toLocaleString()} (${seconds})`;
}

function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function decodeJwt(token: string): JwtInfo {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    throw new Error(`JWT 应为三段式（header.payload.signature），实际为 ${parts.length} 段`);
  }
  if (parts.length === 3 && parts.some((part, i) => i < 2 && part.length === 0)) {
    throw new Error('header 或 payload 为空，格式不完整');
  }

  const header = decodeJson<JwtHeader>(parts[0], 'Header');
  const payload = decodeJson<JwtPayload>(parts[1], 'Payload');
  const signature = parts[2];
  const alg = header.alg ?? '未知';
  // 签名段可能本身就是坏的（例如 alg=none 或被截断），不能因此丢失 Header/Payload
  let signatureBytes = 0;
  try {
    signatureBytes = base64UrlDecode(signature).length;
  } catch {
    signatureBytes = 0;
  }

  const now = Date.now();
  let status: JwtInfo['expires']['status'] = 'none';
  let remainingMs: number | undefined;
  let expText = '未设置 exp，不携带过期信息';

  if (typeof payload.exp === 'number') {
    const expMs = payload.exp * 1000;
    remainingMs = expMs - now;
    if (remainingMs <= 0) {
      status = 'expired';
      expText = `已于 ${formatTimestamp(payload.exp)} 过期（${describeDuration(remainingMs)}）`;
    } else {
      status = 'valid';
      expText = `将于 ${formatTimestamp(payload.exp)} 过期（剩余 ${describeDuration(remainingMs)}）`;
    }
  }

  const issuedAt =
    typeof payload.iat === 'number'
      ? {
          iat: payload.iat,
          ageMs: now - payload.iat * 1000,
          text: `${formatTimestamp(payload.iat)}（签发于 ${describeDuration(now - payload.iat * 1000)}前）`,
        }
      : undefined;

  const notBefore =
    typeof payload.nbf === 'number'
      ? {
          nbf: payload.nbf,
          text: `${formatTimestamp(payload.nbf)}（${payload.nbf * 1000 <= now ? '已生效' : `${describeDuration(payload.nbf * 1000 - now)}后生效`}）`,
        }
      : undefined;

  const audiences = payload.aud === undefined ? [] : Array.isArray(payload.aud) ? payload.aud : [payload.aud];

  const claims = Object.entries(payload).map(([key, value]) => ({ key, value: stringifyClaim(value) }));

  return {
    header,
    payload,
    signature,
    signatureBytes,
    algorithmNote: ALG_NOTES[alg] ?? '未登记的签名算法，需查阅 JWT 规范确认安全性',
    expires: { status, ...(remainingMs !== undefined ? { remainingMs } : {}), text: expText },
    ...(issuedAt ? { issuedAt } : {}),
    ...(notBefore ? { notBefore } : {}),
    audiences,
    claims,
  };
}

/* ------------------------------------------------------------------ *
 * 以下为在原有解码能力之上的扩展：结构校验、扁平化、敏感字段处理、
 * HMAC 签名/校验、算法与声明说明。全部在本地完成，不发起任何请求。
 * ------------------------------------------------------------------ */

/** 结构校验的单段信息。 */
export interface JwtSegmentInfo {
  index: number;
  name: 'header' | 'payload' | 'signature';
  raw: string;
  rawLength: number;
  decoded: string;
  byteLength: number;
  valid: boolean;
  error?: string;
}

export interface JwtStructureIssue {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
}

export interface JwtStructureResult {
  ok: boolean;
  token: string;
  segmentCount: number;
  segments: JwtSegmentInfo[];
  issues: JwtStructureIssue[];
}

export interface JwtFlatClaim {
  path: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  depth: number;
  sensitive: boolean;
}

export interface JwtSignatureSpec {
  alg: string;
  family: '对称' | '非对称' | '未签名';
  hash: string;
  signatureBytes: number;
  keyType: string;
  keyFormat: string;
  supported: boolean;
  note: string;
}

export interface JwtHmacResult {
  ok: boolean;
  alg: string;
  message: string;
  signingInput: string;
  expectedHex: string;
  actualHex: string;
  secretBits: number;
  expectedSignature: string;
}

const HMAC_ALGS: Record<string, { hash: string; bytes: number }> = {
  HS256: { hash: 'SHA-256', bytes: 32 },
  HS384: { hash: 'SHA-384', bytes: 48 },
  HS512: { hash: 'SHA-512', bytes: 64 },
};

/** 常见敏感声明名（大小写不敏感，按片段匹配）。 */
const SENSITIVE_TOKENS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'cookie',
  'private_key',
  'api_key',
  'apikey',
  'client_secret',
  'session',
  'signature',
  'otp',
  'pin',
  'cvv',
  'cardno',
  'ssn',
];

export interface JwtClaimDoc {
  key: string;
  group: '注册声明' | '时间声明' | '常用私有声明';
  type: string;
  description: string;
  example: string;
}

export const JWT_CLAIM_DOCS: JwtClaimDoc[] = [
  {
    key: 'iss',
    group: '注册声明',
    type: 'string',
    description: '签发方（Issuer），通常是服务标识或域名',
    example: 'https://auth.example.com',
  },
  {
    key: 'sub',
    group: '注册声明',
    type: 'string',
    description: '主体（Subject），代表 token 对应的用户或客户端 ID',
    example: 'user_1024',
  },
  {
    key: 'aud',
    group: '注册声明',
    type: 'string | string[]',
    description: '受众（Audience），只能被指定接收方接受；数组表示多受众',
    example: '["my-api","my-web"]',
  },
  {
    key: 'jti',
    group: '注册声明',
    type: 'string',
    description: 'JWT ID，用于重放防护与注销名单去重',
    example: 'b2f1c0de-8a17-4c22-9f3e-6f1b0d2a5c77',
  },
  {
    key: 'exp',
    group: '时间声明',
    type: 'number',
    description: '过期时间（Unix 秒），到期后必须拒绝',
    example: '1767225600',
  },
  {
    key: 'nbf',
    group: '时间声明',
    type: 'number',
    description: '生效时间（Unix 秒），之前无效，可用于时钟偏移容忍',
    example: '1767225540',
  },
  {
    key: 'iat',
    group: '时间声明',
    type: 'number',
    description: '签发时间（Unix 秒），用于判断 token 年龄',
    example: '1767225600',
  },
  {
    key: 'azp',
    group: '注册声明',
    type: 'string',
    description: '授权方（Authorized Party），aud 为数组时标识实际签发方',
    example: 'my-web',
  },
  {
    key: 'scope',
    group: '常用私有声明',
    type: 'string | string[]',
    description: '授权范围，OAuth2 常见，空格分隔字符串或数组',
    example: '"openid profile"',
  },
  { key: 'name', group: '常用私有声明', type: 'string', description: '用户显示名', example: '"张三"' },
  {
    key: 'email',
    group: '常用私有声明',
    type: 'string',
    description: '用户邮箱，注意不要把 PII 放进可被他人读取的 token',
    example: '"a@example.com"',
  },
  {
    key: 'role',
    group: '常用私有声明',
    type: 'string | string[]',
    description: '角色，常用于粗粒度授权判断',
    example: '"admin"',
  },
  {
    key: 'tenant',
    group: '常用私有声明',
    type: 'string',
    description: '租户 ID，多租户系统常用',
    example: '"tenant_77"',
  },
  {
    key: 'nonce',
    group: '常用私有声明',
    type: 'string',
    description: '一次性随机串，用于防重放（OIDC 授权码流程）',
    example: '"n-0S6_WzA2Mj"',
  },
  {
    key: 'at_hash',
    group: '常用私有声明',
    type: 'string',
    description: '访问令牌哈希，用于绑定 id_token 与 access_token',
    example: '"77QmUPtjPfzWtF2AnpK9RQ"',
  },
];

export interface JwtAlgDoc {
  alg: string;
  family: '对称' | '非对称' | '未签名';
  hash: string;
  signatureBytes: number;
  keyFormat: string;
  risk: '低' | '中' | '高';
  description: string;
}

export const JWT_ALG_DOCS: JwtAlgDoc[] = [
  {
    alg: 'none',
    family: '未签名',
    hash: '无',
    signatureBytes: 0,
    keyFormat: '无',
    risk: '高',
    description: '不签名，任何人都能伪造 payload，只应在测试环境使用',
  },
  {
    alg: 'HS256',
    family: '对称',
    hash: 'SHA-256',
    signatureBytes: 32,
    keyFormat: '共享密钥（>= 256 bit）',
    risk: '中',
    description: '最常用；密钥必须保密，且不要用公钥当密钥（HS/RS 混淆攻击）',
  },
  {
    alg: 'HS384',
    family: '对称',
    hash: 'SHA-384',
    signatureBytes: 48,
    keyFormat: '共享密钥（>= 384 bit）',
    risk: '中',
    description: 'HS256 的加强版，签名更长',
  },
  {
    alg: 'HS512',
    family: '对称',
    hash: 'SHA-512',
    signatureBytes: 64,
    keyFormat: '共享密钥（>= 512 bit）',
    risk: '中',
    description: '签名最长，安全性与 HS256 相当',
  },
  {
    alg: 'RS256',
    family: '非对称',
    hash: 'SHA-256',
    signatureBytes: 256,
    keyFormat: 'RSA 公钥/PKCS#8 私钥',
    risk: '低',
    description: 'JWT 官方推荐；验证方只需公钥，适合多服务分发',
  },
  {
    alg: 'RS384',
    family: '非对称',
    hash: 'SHA-384',
    signatureBytes: 256,
    keyFormat: 'RSA 公钥/PKCS#8 私钥',
    risk: '低',
    description: 'RS256 的加强版',
  },
  {
    alg: 'RS512',
    family: '非对称',
    hash: 'SHA-512',
    signatureBytes: 256,
    keyFormat: 'RSA 公钥/PKCS#8 私钥',
    risk: '低',
    description: 'RS256 的加强版',
  },
  {
    alg: 'PS256',
    family: '非对称',
    hash: 'SHA-256',
    signatureBytes: 256,
    keyFormat: 'RSA 公钥/PKCS#8 私钥',
    risk: '低',
    description: 'RSA-PSS 填充，比 PKCS#1 v1.5 更抗伪造',
  },
  {
    alg: 'ES256',
    family: '非对称',
    hash: 'SHA-256',
    signatureBytes: 64,
    keyFormat: 'P-256 公钥/私钥，签名需 r||s 拼接',
    risk: '低',
    description: 'ECDSA，token 更短（签名 64 字节），需注意 P1363 与 DER 格式差异',
  },
  {
    alg: 'ES384',
    family: '非对称',
    hash: 'SHA-384',
    signatureBytes: 96,
    keyFormat: 'P-384 公钥/私钥',
    risk: '低',
    description: 'ECDSA P-384',
  },
  {
    alg: 'ES512',
    family: '非对称',
    hash: 'SHA-512',
    signatureBytes: 132,
    keyFormat: 'P-521 公钥/私钥',
    risk: '低',
    description: 'ECDSA P-521，签名 132 字节',
  },
  {
    alg: 'EdDSA',
    family: '非对称',
    hash: 'Ed25519 / Ed448',
    signatureBytes: 64,
    keyFormat: 'Ed25519 / Ed448 (OKP)',
    risk: '低',
    description: 'Edwards 曲线签名，跨平台实现时需确认 JWK crv 为 Ed25519',
  },
];

function isSensitiveClaim(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_TOKENS.some((token) => lower.includes(token));
}

/** 判断字符串是否命中敏感声明名。 */
export function isSensitiveJwtClaim(path: string): boolean {
  return isSensitiveClaim(path);
}

/** 保留首尾各 2 位，中间用 * 代替；短字符串整体隐藏。 */
export function maskSecret(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
}

function claimTypeOf(value: unknown): JwtFlatClaim['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  return 'object';
}

function stringifyForClaim(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 把嵌套 payload 扁平化为点号路径，便于阅读与敏感字段扫描。 */
export function flattenJwtPayload(payload: unknown, maxDepth = 5): JwtFlatClaim[] {
  const out: JwtFlatClaim[] = [];
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > maxDepth) {
      out.push({
        path,
        value: '…（已达最大展开深度）',
        type: claimTypeOf(value),
        depth,
        sensitive: isSensitiveClaim(path),
      });
      return;
    }
    if (Array.isArray(value)) {
      if (path !== '') {
        out.push({
          path: `${path}[]`,
          value: value.length === 0 ? '（空数组）' : `（数组，共 ${value.length} 项）`,
          type: 'array',
          depth,
          sensitive: isSensitiveClaim(path),
        });
      }
      for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`, depth + 1);
      return;
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0 && path !== '') {
        out.push({ path, value: '（空对象）', type: 'object', depth, sensitive: isSensitiveClaim(path) });
        return;
      }
      for (const [key, child] of entries) walk(child, path ? `${path}.${key}` : key, depth + 1);
      return;
    }
    if (path === '') {
      out.push({ path: '(根)', value: stringifyForClaim(value), type: claimTypeOf(value), depth: 0, sensitive: false });
      return;
    }
    const raw = stringifyForClaim(value);
    const sensitive = isSensitiveClaim(path) && typeof value === 'string';
    out.push({ path, value: sensitive ? maskSecret(raw) : raw, type: claimTypeOf(value), depth, sensitive });
  };
  walk(payload, '', 0);
  return out;
}

/** 深拷贝并遮蔽敏感字段，返回可直接展示/截图的 JSON 文本。 */
export function redactJwtPayload(payload: unknown, indent = 2): string {
  const mask = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) return value.map((item, i) => mask(item, `${path}[${i}]`));
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = mask(child, path ? `${path}.${key}` : key);
      }
      return out;
    }
    if (typeof value === 'string' && isSensitiveClaim(path)) return maskSecret(value);
    return value;
  };
  return JSON.stringify(mask(payload, ''), null, indent) ?? 'null';
}

/** 取出单段解码结果（不做签名验证）。 */
export function decodeJwtSegment(
  token: string,
  index: 0 | 1,
): { raw: string; json: string; value: JwtHeader | JwtPayload } {
  const parts = token
    .trim()
    .replace(/^Bearer\s+/i, '')
    .split('.');
  const raw = parts[index] ?? '';
  const bytes = base64ToBytes(raw);
  const json = new TextDecoder('utf-8').decode(bytes);
  return { raw, json, value: JSON.parse(json) as JwtHeader | JwtPayload };
}

function segmentInfo(index: number, raw: string, name: JwtSegmentInfo['name']): JwtSegmentInfo {
  const info: JwtSegmentInfo = { index, name, raw, rawLength: raw.length, decoded: '', byteLength: 0, valid: false };
  if (raw.length === 0) {
    info.error = name === 'signature' ? '签名为空（alg=none 时合法）' : '该段为空';
    return info;
  }
  if (raw === '..' || !/^[A-Za-z0-9_=-]+$/.test(raw.replace(/=+$/, ''))) {
    info.error = '不是合法的 Base64URL 文本';
    return info;
  }
  try {
    const bytes = base64ToBytes(raw);
    info.byteLength = bytes.length;
    info.decoded = new TextDecoder('utf-8').decode(bytes);
    info.valid = true;
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }
  return info;
}

/**
 * 不抛异常的 JWT 结构体检：段数、Base64URL、JSON 可解析性、
 * alg/typ/kid、jku 与 x5u 指向外部地址、alg=none 等风险。
 */
export function validateJwtStructure(token: string): JwtStructureResult {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  const issues: JwtStructureIssue[] = [];
  const segments = trimmed.split('.');
  const result: JwtStructureResult = {
    ok: false,
    token: trimmed,
    segmentCount: segments.length,
    segments: [],
    issues,
  };

  if (trimmed === '') {
    issues.push({ level: 'error', code: 'empty', message: '输入为空' });
    return result;
  }
  if (/\s/.test(trimmed))
    issues.push({ level: 'warn', code: 'whitespace', message: 'token 中包含空白字符，实际使用前需去除' });
  if (/^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(trimmed) === false && segments.length === 3) {
    issues.push({ level: 'info', code: 'compact', message: '不是紧凑序列化（compact serialization）形式' });
  }
  if (segments.length !== 3) {
    issues.push({
      level: 'error',
      code: 'segments',
      message: `应为三段式（header.payload.signature），实际 ${segments.length} 段`,
    });
  }

  const names: JwtSegmentInfo['name'][] = ['header', 'payload', 'signature'];
  result.segments = segments.slice(0, 3).map((raw, index) => segmentInfo(index, raw, names[index] ?? 'signature'));

  const headerInfo = result.segments[0];
  const payloadInfo = result.segments[1];
  const signatureInfo = result.segments[2];

  let header: JwtHeader = {};
  if (headerInfo) {
    if (!headerInfo.valid) {
      issues.push({ level: 'error', code: 'header', message: `Header 解码失败：${headerInfo.error ?? '未知原因'}` });
    } else {
      try {
        header = JSON.parse(headerInfo.decoded) as JwtHeader;
      } catch (error) {
        issues.push({
          level: 'error',
          code: 'header-json',
          message: `Header 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  if (payloadInfo && !payloadInfo.valid) {
    issues.push({ level: 'error', code: 'payload', message: `Payload 解码失败：${payloadInfo.error ?? '未知原因'}` });
  } else if (payloadInfo) {
    try {
      const payload = JSON.parse(payloadInfo.decoded) as JwtPayload;
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        issues.push({ level: 'error', code: 'payload-shape', message: 'Payload 必须是 JSON 对象' });
      }
    } catch (error) {
      issues.push({
        level: 'error',
        code: 'payload-json',
        message: `Payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (headerInfo?.valid && !alg) {
    issues.push({ level: 'error', code: 'alg-missing', message: 'Header 缺少 alg，按 JWT 规范必须声明签名算法' });
  }
  if (alg && !JWT_ALG_DOCS.some((doc) => doc.alg === alg)) {
    issues.push({ level: 'warn', code: 'alg-unknown', message: `alg=${alg} 不是常见算法，需自行确认实现与安全性` });
  }
  if (alg.toLowerCase() === 'none') {
    issues.push({
      level: 'error',
      code: 'alg-none',
      message: 'alg=none：未签名 token，任何人都能篡改 payload，仅可用于本地调试',
    });
  }
  if (typeof header.typ === 'string' && header.typ.toLowerCase() !== 'jwt') {
    issues.push({ level: 'info', code: 'typ', message: `typ=${header.typ}，常见值为 JWT` });
  }
  if (typeof header.kid === 'string') {
    issues.push({ level: 'info', code: 'kid', message: `kid=${header.kid}：验证方需按此标识选择密钥` });
  }
  if (typeof header.jku === 'string') {
    issues.push({
      level: 'warn',
      code: 'jku',
      message: `Header 声明了 jku=${header.jku}：客户端若自动下载该地址的密钥，会引入 SSRF / 恶意密钥风险，应固定可信来源`,
    });
  }
  if (typeof header.x5u === 'string') {
    issues.push({
      level: 'warn',
      code: 'x5u',
      message: `Header 声明了 x5u=${header.x5u}：证书链地址必须经过白名单校验`,
    });
  }
  if (signatureInfo && !signatureInfo.valid && segments.length === 3 && alg.toLowerCase() !== 'none') {
    issues.push({
      level: 'error',
      code: 'signature',
      message: `签名段不是合法 Base64URL：${signatureInfo.error ?? '未知原因'}`,
    });
  }
  if (alg.startsWith('HS') && signatureInfo?.valid) {
    const expected = HMAC_ALGS[alg]?.bytes ?? 0;
    if (signatureInfo.byteLength !== expected) {
      issues.push({
        level: 'warn',
        code: 'signature-length',
        message: `${alg} 签名应为 ${expected} 字节，实际 ${signatureInfo.byteLength} 字节，可能被截断或算法被篡改`,
      });
    }
  }

  result.ok = !issues.some((issue) => issue.level === 'error');
  return result;
}

/** 查询签名算法规格。 */
export function getJwtSignatureSpec(alg: string): JwtSignatureSpec {
  const doc = JWT_ALG_DOCS.find((item) => item.alg === alg);
  if (!doc) {
    return {
      alg,
      family: '非对称',
      hash: '未知',
      signatureBytes: 0,
      keyType: '未知',
      keyFormat: '未知',
      supported: false,
      note: '未登记的算法，请查阅对应规范；本工具仅支持 HMAC 系列本地验签',
    };
  }
  const hmac = HMAC_ALGS[alg];
  return {
    alg,
    family: doc.family,
    hash: hmac ? hmac.hash : doc.hash,
    signatureBytes: doc.signatureBytes,
    keyType: doc.family === '对称' ? '对称密钥（机密）' : doc.family === '未签名' ? '无' : '公钥/私钥对',
    keyFormat: doc.keyFormat,
    supported: Boolean(hmac) || doc.alg === 'none',
    note: doc.description,
  };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function importHmacKey(secret: string, hash: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8ToBytes(secret), { name: 'HMAC', hash }, false, ['sign', 'verify']);
}

/** 生成随机 jti（十六进制）。 */
export function generateJti(byteLength = 16): string {
  return bytesToHex(randomBytes(byteLength));
}

/** 把对象序列化为 base64url 段。 */
export function encodeJwtSegment(value: unknown): string {
  return bytesToBase64Url(utf8ToBytes(JSON.stringify(value)));
}

/**
 * 生成时间声明：iat / nbf / exp / jti。
 * ttlSeconds 为空时只输出 iat、jti；notBeforeOffsetSeconds 用于容忍时钟偏移。
 */
export function buildJwtTimeClaims(options: {
  now?: number;
  ttlSeconds?: number;
  notBeforeOffsetSeconds?: number;
  issuer?: string;
  subject?: string;
  audience?: string | string[];
  jwtId?: string;
}): JwtPayload {
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const claims: JwtPayload = { iat: nowSeconds, jti: options.jwtId ?? generateJti() };
  if (options.issuer) claims.iss = options.issuer;
  if (options.subject) claims.sub = options.subject;
  if (options.audience) claims.aud = options.audience;
  if (options.notBeforeOffsetSeconds !== undefined) claims.nbf = nowSeconds - options.notBeforeOffsetSeconds;
  if (options.ttlSeconds !== undefined) claims.exp = nowSeconds + options.ttlSeconds;
  return claims;
}

/** 使用 HS256/384/512 生成 JWT（密钥仅在本地使用）。 */
export async function signJwtHmac(options: {
  alg?: string;
  secret: string;
  header?: JwtHeader;
  payload: JwtPayload;
}): Promise<string> {
  const alg = options.alg ?? 'HS256';
  const spec = HMAC_ALGS[alg];
  if (!spec) throw new Error(`本工具仅支持 ${Object.keys(HMAC_ALGS).join(' / ')}，收到的是 ${alg}`);
  if (options.secret === '') throw new Error('密钥不能为空');
  const header: JwtHeader = { alg, typ: 'JWT', ...options.header };
  const signingInput = `${encodeJwtSegment(header)}.${encodeJwtSegment(options.payload)}`;
  const key = await importHmacKey(options.secret, spec.hash);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8ToBytes(signingInput)));
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/** 生成 alg=none 的未签名 token（仅用于本地调试）。 */
export function createUnsignedJwt(payload: JwtPayload, header: JwtHeader = {}): string {
  return `${encodeJwtSegment({ alg: 'none', typ: 'JWT', ...header })}.${encodeJwtSegment(payload)}.`;
}

/** 用共享密钥校验 HMAC 签名，输出期望值与实际值的十六进制对比。 */
export async function verifyJwtHmac(token: string, secret: string): Promise<JwtHmacResult> {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  const parts = trimmed.split('.');
  const signingInput = `${parts[0] ?? ''}.${parts[1] ?? ''}`;
  let header: JwtHeader = {};
  try {
    header = JSON.parse(new TextDecoder('utf-8').decode(base64ToBytes(parts[0] ?? ''))) as JwtHeader;
  } catch {
    /* 交由 decodeJwt 报错，此处仅给出空 header */
  }
  const alg = typeof header.alg === 'string' ? header.alg : 'HS256';
  const spec = HMAC_ALGS[alg];
  const base: JwtHmacResult = {
    ok: false,
    alg,
    message: '',
    signingInput,
    expectedHex: '',
    actualHex: '',
    secretBits: utf8ToBytes(secret).length * 8,
    expectedSignature: '',
  };
  if (parts.length !== 3) {
    return { ...base, message: `JWT 应为三段式，实际 ${parts.length} 段` };
  }
  if (!spec) {
    return { ...base, message: `alg=${alg} 不是 HMAC 系列，无法用共享密钥校验` };
  }
  if (secret === '') {
    return { ...base, message: '请填写共享密钥' };
  }
  const key = await importHmacKey(secret, spec.hash);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8ToBytes(signingInput)));
  let actual: Uint8Array;
  try {
    actual = base64ToBytes(parts[2] ?? '');
  } catch {
    return { ...base, message: '签名段不是合法 Base64URL' };
  }
  const ok = timingSafeEqual(expected, actual);
  return {
    ok,
    alg,
    message: ok
      ? `签名校验通过：${alg} 期望与实际签名一致（${spec.hash}）`
      : `签名不匹配：可能被篡改，或密钥/算法（${alg}）与签发方不一致`,
    signingInput,
    expectedHex: bytesToHex(expected),
    actualHex: bytesToHex(actual),
    secretBits: base.secretBits,
    expectedSignature: bytesToBase64Url(expected),
  };
}

/** 判断密钥长度是否达到算法要求的安全下限。 */
export function assessSecretStrength(
  secret: string,
  alg: string,
): { bits: number; required: number; ok: boolean; text: string } {
  const bits = utf8ToBytes(secret).length * 8;
  const required = alg.startsWith('HS') ? (HMAC_ALGS[alg]?.bytes ?? 32) * 8 : 0;
  if (alg.toLowerCase() === 'none')
    return { bits, required, ok: false, text: 'alg=none 不需要密钥，但也无法保证完整性' };
  if (required === 0)
    return { bits, required, ok: false, text: `${alg} 使用非对称密钥，此处请填写的是密钥内容而非共享密钥` };
  return {
    bits,
    required,
    ok: bits >= required,
    text:
      bits >= required
        ? `密钥 ${bits} bit，满足 ${alg} 建议的 ${required} bit`
        : `密钥仅 ${bits} bit，短于 ${alg} 建议的 ${required} bit，建议改用更长的随机密钥`,
  };
}

/** 依据 token 长度与声明给出体积与性能提示。 */
export function inspectJwtSize(
  token: string,
  claimCount: number,
): { text: string; level: 'info' | 'warn'; tips: string[] } {
  const trimmed = token.trim();
  const tips: string[] = [];
  const long = trimmed.length > 4096;
  if (long) tips.push('token 超过 4 KB：许多网关与浏览器对 Authorization 头有大小限制，且会显著增加每个请求的开销');
  const segments = trimmed.split('.');
  const payloadBytes = segments[1] ? base64ToBytes(segments[1]).length : 0;
  if (payloadBytes > 1024) tips.push('payload 超过 1 KB：建议把大型数据放服务端，只在 token 里保留引用 ID');
  if (claimCount > 20) tips.push(`声明数量 ${claimCount} 偏多：token 每次请求都要传输，建议只放鉴权必需字段`);
  if (/\[\d{10}\]|\[\d{13}\]/.test(trimmed))
    tips.push('payload 里出现了长度 10/13 的数组下标，可能误把时间戳或哈希值当成数组');
  return {
    text: `整体 ${utf8ToBytes(trimmed).length} 字节（header ${segments[0] ? base64ToBytes(segments[0]).length : 0} / payload ${payloadBytes} / 签名 ${segments[2] ? base64ToBytes(segments[2]).length : 0}），声明 ${claimCount} 个`,
    level: long || payloadBytes > 1024 ? 'warn' : 'info',
    tips,
  };
}

/** 按组归类声明，便于阅读。 */
export function groupJwtClaims(payload: JwtPayload): { group: string; claims: { key: string; value: string }[] }[] {
  const groups: string[] = ['注册声明', '时间声明', '常用私有声明'];
  const docs = new Map(JWT_CLAIM_DOCS.map((doc) => [doc.key, doc]));
  const rest: { key: string; value: string }[] = [];
  const buckets: Record<string, { key: string; value: string }[]> = {
    注册声明: [],
    时间声明: [],
    常用私有声明: [],
  };
  for (const [key, value] of Object.entries(payload)) {
    const doc = docs.get(key);
    const row = { key, value: stringifyForClaim(value) };
    if (!doc) {
      rest.push(row);
      continue;
    }
    buckets[doc.group].push(row);
  }
  const out = groups.map((group) => ({ group, claims: buckets[group] })).filter((item) => item.claims.length > 0);
  if (rest.length > 0) out.push({ group: '未登记声明', claims: rest });
  return out;
}

/** 生成一个本地演示用的样例 token（HS256，密钥为示例值）。 */
export function jwtSampleTokens(): { label: string; token: string; description: string }[] {
  const now = Math.floor(Date.now() / 1000);
  const enc = encodeJwtSegment;
  const withSig = (header: JwtHeader, payload: JwtPayload, sig: string) => `${enc(header)}.${enc(payload)}.${sig}`;
  const valid = withSig(
    { alg: 'HS256', typ: 'JWT', kid: 'key-2026-01' },
    {
      iss: 'https://auth.example.com',
      sub: 'user_1024',
      aud: ['my-api', 'my-web'],
      iat: now,
      nbf: now - 5,
      exp: now + 3600,
      jti: 'demo-jti-0001',
      scope: 'openid profile',
      role: 'admin',
    },
    'DEMO'.padEnd(43, 'A'),
  );
  const expired = withSig(
    { alg: 'HS256', typ: 'JWT' },
    { sub: 'user_2048', iat: now - 7200, exp: now - 60 },
    'EXPIRED'.padEnd(43, 'B'),
  );
  const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: 'user_0', admin: true })}.`;
  const nested = withSig(
    { alg: 'RS256', typ: 'JWT', kid: 'rsa-key-1' },
    {
      iss: 'https://auth.example.com',
      sub: 'service_account',
      iat: now,
      exp: now + 86400,
      permissions: ['read:orders', 'write:orders'],
      profile: { name: '张三', email: 'a@example.com', locale: 'zh-CN' },
      session: { refresh_token: 'demo-refresh-token-value', device: 'macOS-15' },
    },
    'RS256PLACEHOLDER'.padEnd(342, 'C'),
  );
  return [
    { label: '正常（HS256，含 kid 与多受众）', token: valid, description: '未过期、携带 iss/sub/aud/iat/nbf/exp/jti' },
    { label: '已过期', token: expired, description: 'exp 早于当前时间，用于验证过期提示' },
    { label: 'alg=none 未签名', token: unsigned, description: '典型伪造演示：payload 可任意修改' },
    {
      label: '嵌套与敏感声明（RS256）',
      token: nested,
      description: '含 permissions 数组、profile 对象与 refresh_token',
    },
  ];
}
