/**
 * JWT 统一签发 / 验签的纯函数回归测试。
 *
 * 只用 Bun 内置的 crypto.subtle 与 bun:test，零新依赖、纯本地、不联网。
 * 当前时间通过 nowSeconds 注入，让时间语义断言与真实时钟解耦。
 */

import { describe, expect, test } from 'bun:test';
import { encodeJwtSegment, JWT_SIGN_ALGORITHMS, type JwtPayload, signJwt, verifyJwt } from '../app/lib/jwt';

const SECRET = 'a-32-byte-minimum-secret-for-tests-0123456789';
/** 固定当前时间（Unix 秒），让时间语义断言与真实时钟解耦。 */
const NOW = 1_800_000_000;

function toPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function generateRsaPem(): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
  const pair = await globalThis.crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const [priv, pub] = await Promise.all([
    globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey),
    globalThis.crypto.subtle.exportKey('spki', pair.publicKey),
  ]);
  return { privateKeyPem: toPem(priv, 'PRIVATE KEY'), publicKeyPem: toPem(pub, 'PUBLIC KEY') };
}

describe('jwt.ts：HS 系列统一签发与验签', () => {
  test('HS256 签发→验签往返：签名有效且总结果通过', async () => {
    const payload: JwtPayload = { sub: 'user_1024', iat: NOW - 10, nbf: NOW - 10, exp: NOW + 3600 };
    const token = await signJwt({ alg: 'HS256', secret: SECRET, payload });
    expect(token.split('.')).toHaveLength(3);
    const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
    expect(result.ok).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.algorithm).toBe('HS256');
    expect(result.checks).toHaveLength(3);
    expect(result.message).toContain('签名有效');
  });

  test('HS384 / HS512 也能签发→验签往返', async () => {
    for (const alg of ['HS384', 'HS512'] as const) {
      const token = await signJwt({ alg, secret: SECRET, payload: { sub: 'u', exp: NOW + 60 } });
      const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
      expect(result.ok).toBe(true);
      expect(result.algorithm).toBe(alg);
    }
  });

  test('JWT_SIGN_ALGORITHMS 覆盖 HS 与 RS 各三种', () => {
    expect(JWT_SIGN_ALGORITHMS).toEqual(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']);
  });

  test('篡改 payload 被拒绝，且给出中文原因', async () => {
    const token = await signJwt({
      alg: 'HS256',
      secret: SECRET,
      payload: { sub: 'user', role: 'user', exp: NOW + 3600 },
    });
    const parts = token.split('.');
    const forged = `${parts[0]}.${encodeJwtSegment({ sub: 'user', role: 'admin', exp: NOW + 3600 })}.${parts[2]}`;
    const result = await verifyJwt({ token: forged, secret: SECRET, nowSeconds: NOW });
    expect(result.ok).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.message).toContain('签名无效');
    expect(result.message).toMatch(/[一-龥]/);
  });

  test('过期 token 被拒绝，checks 里 exp 明确标为失败', async () => {
    const token = await signJwt({
      alg: 'HS256',
      secret: SECRET,
      payload: { sub: 'u', iat: NOW - 7200, exp: NOW - 60 },
    });
    const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
    expect(result.ok).toBe(false);
    expect(result.signatureValid).toBe(true);
    expect(result.message).toContain('已过期');
    const expCheck = result.checks.find((check) => check.claim === 'exp');
    expect(expCheck?.ok).toBe(false);
    expect(expCheck?.message).toContain('已过期');
  });
});

describe('jwt.ts：时间声明语义与时钟偏移', () => {
  test('可配置时钟偏移能容忍刚过期的 token', async () => {
    const token = await signJwt({ alg: 'HS256', secret: SECRET, payload: { sub: 'u', exp: NOW - 5 } });
    const strict = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
    expect(strict.ok).toBe(false);
    const tolerant = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW, clockToleranceSeconds: 10 });
    expect(tolerant.ok).toBe(true);
  });

  test('nbf 未生效、iat 在未来分别被拒绝', async () => {
    const token = await signJwt({
      alg: 'HS256',
      secret: SECRET,
      payload: { sub: 'u', iat: NOW + 3600, nbf: NOW + 3600, exp: NOW + 7200 },
    });
    const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('尚未生效');
    expect(result.message).toContain('iat 在未来');
    expect(result.checks.filter((check) => !check.ok)).toHaveLength(2);
  });

  test('未携带时间声明时签名有效，但提示未做有效期校验', async () => {
    const token = await signJwt({ alg: 'HS256', secret: SECRET, payload: { sub: 'u' } });
    const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(0);
    expect(result.message).toContain('未携带');
  });
});

describe('jwt.ts：非法 token 安全降级', () => {
  test('各类畸形 token 都不抛异常，返回中文失败原因', async () => {
    const invalid = ['', '   ', 'not-a-jwt', 'a.b', 'a.b.c.d', 'e30.e30.@@@', 'eyJhbGciOiJIUzI1NiJ9.@@@.AAAA'];
    for (const token of invalid) {
      const result = await verifyJwt({ token, secret: SECRET, nowSeconds: NOW });
      expect(result.ok).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.message).toMatch(/[一-龥]/);
    }
  });

  test('alg=none 与未知算法明确拒绝', async () => {
    const noneToken = `${encodeJwtSegment({ alg: 'none', typ: 'JWT' })}.${encodeJwtSegment({ sub: 'u' })}.`;
    const none = await verifyJwt({ token: noneToken, secret: SECRET, nowSeconds: NOW });
    expect(none.ok).toBe(false);
    expect(none.message).toContain('alg=none');

    const esToken = `${encodeJwtSegment({ alg: 'ES256', typ: 'JWT' })}.${encodeJwtSegment({ sub: 'u' })}.AAAA`;
    const es = await verifyJwt({ token: esToken, secret: SECRET, nowSeconds: NOW });
    expect(es.ok).toBe(false);
    expect(es.message).toContain('不支持的验签算法');
  });

  test('HS* 缺密钥、算法不在白名单都给出中文原因', async () => {
    const token = await signJwt({ alg: 'HS256', secret: SECRET, payload: { sub: 'u' } });
    const noSecret = await verifyJwt({ token, nowSeconds: NOW });
    expect(noSecret.ok).toBe(false);
    expect(noSecret.message).toContain('共享密钥');

    const blocked = await verifyJwt({ token, secret: SECRET, allowedAlgorithms: ['RS256'], nowSeconds: NOW });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain('白名单');
  });
});

describe('jwt.ts：RS256 非对称签发与验签', () => {
  test('RS256 用 PKCS#8 私钥签发、SPKI 公钥验签通过', async () => {
    const { privateKeyPem, publicKeyPem } = await generateRsaPem();
    const token = await signJwt({
      alg: 'RS256',
      privateKeyPem,
      payload: { sub: 'service', iat: NOW - 10, exp: NOW + 3600 },
    });
    expect(token.split('.')).toHaveLength(3);
    const result = await verifyJwt({ token, publicKeyPem, nowSeconds: NOW });
    expect(result.ok).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.algorithm).toBe('RS256');
  });

  test('RS256 用错误公钥验签被拒绝', async () => {
    const a = await generateRsaPem();
    const b = await generateRsaPem();
    const token = await signJwt({
      alg: 'RS256',
      privateKeyPem: a.privateKeyPem,
      payload: { sub: 'u', exp: NOW + 3600 },
    });
    const result = await verifyJwt({ token, publicKeyPem: b.publicKeyPem, nowSeconds: NOW });
    expect(result.ok).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.message).toContain('签名无效');
  });

  test('PEM 公钥格式错误给出中文导入失败原因', async () => {
    const token = `${encodeJwtSegment({ alg: 'RS256', typ: 'JWT' })}.${encodeJwtSegment({ sub: 'u' })}.AAAA`;
    const result = await verifyJwt({ token, publicKeyPem: 'not a pem', nowSeconds: NOW });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('公钥导入失败');
  });
});
