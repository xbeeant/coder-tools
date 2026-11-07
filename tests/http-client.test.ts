import { describe, expect, test } from 'bun:test';
import { buildUrl, emptyState, makeHeader, makePair, type RequestState } from '../app/lib/curl';
import {
  buildRequestInit,
  compileRequest,
  DEFAULT_TIMEOUT_MS,
  displayHeaderValue,
  isBinaryContentType,
  isSensitiveHeader,
  MAX_TIMEOUT_MS,
  prettyBody,
  statusTone,
} from '../app/lib/http-client';

function request(patch: Partial<RequestState> = {}): RequestState {
  const state = emptyState();
  state.url = 'https://api.example.com/v1/users';
  state.method = 'GET';
  return { ...state, ...patch };
}

const OPTIONS = { credentials: false };

describe('compileRequest：URL 校验', () => {
  test('空 URL、非 http(s)、非法 URL 都被拒绝', () => {
    expect(compileRequest(request({ url: '' }), OPTIONS).error).toContain('URL');
    expect(compileRequest(request({ url: 'ftp://api.example.com' }), OPTIONS).error).toContain('http');
    expect(compileRequest(request({ url: 'https://not a url' }), OPTIONS).error).toContain('格式');
  });

  test('合法请求返回 spec 且拼好查询串', () => {
    const result = compileRequest(request({ query: [makePair('page', '2'), makePair('q', 'a b')] }), OPTIONS);
    expect(result.error).toBeUndefined();
    expect(result.spec?.url).toBe(buildUrl(request({ query: [makePair('page', '2'), makePair('q', 'a b')] })));
    expect(result.spec?.method).toBe('GET');
    expect(result.spec?.credentials).toBe('same-origin');
  });

  test('credentials 开关映射到 include / same-origin', () => {
    expect(compileRequest(request(), { credentials: true }).spec?.credentials).toBe('include');
  });
});

describe('compileRequest：请求头与认证', () => {
  test('禁用的头不发送，浏览器保留头被忽略并给出警告', () => {
    const result = compileRequest(
      request({
        headers: [
          makeHeader('Accept', 'application/json'),
          makeHeader('X-Off', 'nope', false),
          makeHeader('User-Agent', 'MyAgent'),
          makeHeader('Content-Length', '12'),
          makeHeader('Cookie', 'manual=1'),
        ],
      }),
      OPTIONS,
    );
    const names = (result.spec?.headers ?? []).map(([key]) => key.toLowerCase());
    expect(names).toContain('accept');
    expect(names).not.toContain('x-off');
    expect(names).not.toContain('user-agent');
    expect(names).not.toContain('content-length');
    expect(names).not.toContain('cookie');
    expect(result.warnings.some((line) => line.includes('User-Agent'))).toBe(true);
    expect(result.warnings.some((line) => line.includes('Cookie 头请改用'))).toBe(true);
  });

  test('Cookie 编辑区的值会进入 Cookie 头', () => {
    const result = compileRequest(request({ cookies: [makePair('sid', 'abc'), makePair('theme', 'dark')] }), OPTIONS);
    const cookie = result.spec?.headers.find(([key]) => key === 'Cookie');
    expect(cookie?.[1]).toBe('sid=abc; theme=dark');
  });

  test('Basic / Bearer / 自定义 Token 三种认证', () => {
    const basic = compileRequest(
      request({ auth: { ...emptyState().auth, kind: 'basic', username: 'user', password: 'pass' } }),
      OPTIONS,
    );
    expect(basic.spec?.headers.find(([key]) => key === 'Authorization')?.[1]).toBe('Basic dXNlcjpwYXNz');

    const bearer = compileRequest(request({ auth: { ...emptyState().auth, kind: 'bearer', token: 'T0K3N' } }), OPTIONS);
    expect(bearer.spec?.headers.find(([key]) => key === 'Authorization')?.[1]).toBe('Bearer T0K3N');

    const custom = compileRequest(
      request({ auth: { ...emptyState().auth, kind: 'token', headerName: 'X-Api-Key', token: 'K3Y' } }),
      OPTIONS,
    );
    expect(custom.spec?.headers.find(([key]) => key === 'X-Api-Key')?.[1]).toBe('K3Y');
  });

  test('用户已手写 Authorization 时不会被认证覆盖', () => {
    const result = compileRequest(
      request({
        headers: [makeHeader('Authorization', 'Bearer manual')],
        auth: { ...emptyState().auth, kind: 'bearer', token: 'auto' },
      }),
      OPTIONS,
    );
    const authHeaders = (result.spec?.headers ?? []).filter(([key]) => key.toLowerCase() === 'authorization');
    expect(authHeaders).toHaveLength(1);
    expect(authHeaders[0]?.[1]).toBe('Bearer manual');
  });
});

describe('compileRequest：请求体与超时', () => {
  function body(kind: RequestState['body']['kind'], raw: string): RequestState['body'] {
    const base = emptyState().body;
    return { ...base, kind, raw };
  }

  test('JSON 自动补 Content-Type 并压缩为单行', () => {
    const result = compileRequest(request({ method: 'POST', body: body('json', '{\n "a": 1\n}') }), OPTIONS);
    expect(result.spec?.body).toEqual({ kind: 'text', text: '{"a":1}' });
    expect(result.spec?.headers.find(([key]) => key === 'Content-Type')?.[1]).toBe('application/json');
  });

  test('raw 使用自定义 Content-Type', () => {
    const stateBody: RequestState['body'] = { ...body('raw', 'hello'), contentType: 'text/plain' };
    const result = compileRequest(request({ method: 'POST', body: stateBody }), OPTIONS);
    expect(result.spec?.body).toEqual({ kind: 'text', text: 'hello' });
    expect(result.spec?.headers.find(([key]) => key === 'Content-Type')?.[1]).toBe('text/plain');
  });

  test('表单区分 urlencoded 与 multipart', () => {
    const form: RequestState['body'] = {
      ...body('none', ''),
      kind: 'form',
      form: [makePair('name', '张三'), makePair('off', 'x', false)],
      multipart: false,
    };
    const encoded = compileRequest(request({ method: 'POST', body: form }), OPTIONS);
    expect(encoded.spec?.body.kind).toBe('form');
    if (encoded.spec?.body.kind === 'form') {
      expect(encoded.spec.body.pairs).toHaveLength(1);
      expect(encoded.spec.body.multipart).toBe(false);
    }
    expect(encoded.spec?.headers.find(([key]) => key === 'Content-Type')?.[1]).toBe(
      'application/x-www-form-urlencoded',
    );

    const multipart = compileRequest(request({ method: 'POST', body: { ...form, multipart: true } }), OPTIONS);
    expect(multipart.spec?.headers.some(([key]) => key.toLowerCase() === 'content-type')).toBe(false);
  });

  test('GET / HEAD 带 body 会被丢弃并提示', () => {
    const result = compileRequest(request({ method: 'GET', body: body('raw', 'ignored') }), OPTIONS);
    expect(result.spec?.body).toEqual({ kind: 'none' });
    expect(result.warnings.some((line) => line.includes('GET 带请求体'))).toBe(true);
  });

  test('超时：空值用默认值，超大值被夹到 120 秒', () => {
    expect(compileRequest(request({ timeout: '' }), OPTIONS).spec?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(compileRequest(request({ timeout: '2.5' }), OPTIONS).spec?.timeoutMs).toBe(2500);
    expect(compileRequest(request({ timeout: '999' }), OPTIONS).spec?.timeoutMs).toBe(MAX_TIMEOUT_MS);
    expect(compileRequest(request({ timeout: 'NaN' }), OPTIONS).spec?.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe('buildRequestInit', () => {
  test('form 生成 URLSearchParams 字符串，multipart 生成 FormData', () => {
    const spec = compileRequest(
      request({
        method: 'POST',
        body: { ...emptyState().body, kind: 'form', form: [makePair('a', '1')] },
      }),
      OPTIONS,
    ).spec;
    if (!spec) throw new Error('spec 不应为空');
    const init = buildRequestInit(spec, new AbortController().signal);
    expect(typeof init.body).toBe('string');
    expect(String(init.body)).toBe('a=1');

    const multi: typeof spec = { ...spec, body: { kind: 'form', pairs: [['a', '1']], multipart: true } };
    const multiInit = buildRequestInit(multi, new AbortController().signal);
    expect(multiInit.body instanceof FormData).toBe(true);
    expect(init.signal).toBeTruthy();
  });
});

describe('响应展示辅助函数', () => {
  test('敏感响应头打码，普通头原样显示', () => {
    expect(isSensitiveHeader('Set-Cookie')).toBe(true);
    expect(isSensitiveHeader('Authorization')).toBe(true);
    expect(isSensitiveHeader('Content-Type')).toBe(false);
    expect(displayHeaderValue('Content-Type', 'application/json')).toBe('application/json');
    expect(displayHeaderValue('Set-Cookie', 'sid=supersecretvalue')).toContain('••••');
    expect(displayHeaderValue('Set-Cookie', 'sid=supersecretvalue')).not.toContain('supersecret');
  });

  test('prettyBody 只美化 JSON，其他内容原样返回', () => {
    expect(prettyBody('{"a":1}', 'application/json')).toBe('{\n  "a": 1\n}');
    expect(prettyBody('<html></html>', 'text/html')).toBe('<html></html>');
    expect(prettyBody('{oops', 'application/json')).toBe('{oops');
    expect(prettyBody('', 'text/plain')).toBe('');
  });

  test('二进制 Content-Type 识别', () => {
    expect(isBinaryContentType('image/png')).toBe(true);
    expect(isBinaryContentType('application/pdf')).toBe(true);
    expect(isBinaryContentType('application/json; charset=utf-8')).toBe(false);
  });

  test('statusTone 按 2xx/3xx/4xx/5xx 分级', () => {
    expect(statusTone(200)).toBe('success');
    expect(statusTone(301)).toBe('info');
    expect(statusTone(404)).toBe('warn');
    expect(statusTone(500)).toBe('danger');
    expect(statusTone(undefined)).toBe('danger');
  });
});
