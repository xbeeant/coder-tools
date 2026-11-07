import { describe, expect, test } from 'bun:test';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  bytesToUtf8,
  hexToBytes,
  isHex,
  utf8ToBytes,
} from '../app/lib/bytes';
import {
  buildCurl,
  buildUrl,
  emptyState,
  extractEnvRefs,
  formatJson,
  hostOf,
  makePair,
  parseCurl,
  pathOf,
  prettyJson,
} from '../app/lib/curl';
import { computeDiff, DEFAULT_DIFF_OPTIONS, lineSimilarity, toLines } from '../app/lib/diff';
import { applyVariables, collectVariables, parseHar } from '../app/lib/har';

describe('bytes.ts：编码互逆', () => {
  test('UTF-8 往返支持中文与 emoji', () => {
    const text = '你好，coder 👩‍💻';
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
  });

  test('Hex 往返与分隔符', () => {
    const bytes = utf8ToBytes('ABC');
    expect(bytesToHex(bytes)).toBe('414243');
    expect(bytesToHex(bytes, ' ')).toBe('41 42 43');
    expect(bytesToHex(hexToBytes('41 42 43'))).toBe('414243');
    expect(isHex('4142G')).toBe(false);
    expect(isHex('414243')).toBe(true);
    // 奇数位会被宽松解析并补前导 0，属于刻意行为
    expect(hexToBytes('A')).toEqual(new Uint8Array([10]));
  });

  test('Base64 往返与 URL-safe 变体', () => {
    const bytes = utf8ToBytes('hello 世界');
    const encoded = bytesToBase64(bytes);
    expect(bytesToUtf8(base64ToBytes(encoded))).toBe('hello 世界');
    expect(bytesToBase64Url(bytes)).not.toContain('+');
    expect(bytesToBase64Url(bytes)).not.toContain('=');
  });
});

describe('curl.ts：请求模型与命令解析', () => {
  test('formatJson / prettyJson 对非法输入安全降级', () => {
    expect(formatJson('{\n "a": 1\n}')).toBe('{"a":1}');
    expect(formatJson('not json')).toBe('not json');
    expect(prettyJson('not json')).toBeNull();
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  test('buildUrl 拼接查询参数并处理已有问号', () => {
    const base = emptyState();
    base.url = 'https://api.example.com/users';
    expect(buildUrl({ ...base, query: [makePair('page', '2'), makePair('q', 'a b')] })).toContain('page=2');
    const withQuery = { ...base, url: 'https://api.example.com/users?x=1', query: [makePair('page', '2')] };
    expect(buildUrl(withQuery)).toContain('?x=1&page=2');
    expect(buildUrl({ ...base, query: [makePair('off', 'x', false)] })).toBe(base.url);
  });

  test('hostOf / pathOf 对非法 URL 有兜底', () => {
    expect(hostOf('https://api.example.com:8443/v1/users?a=1')).toBe('api.example.com:8443');
    expect(pathOf('https://api.example.com/v1/users?a=1')).toBe('/v1/users?a=1');
    expect(hostOf('not a url')).toBe('example.com');
    expect(pathOf('not a url')).toBe('/');
  });

  test('extractEnvRefs 识别 $VAR 与 ${VAR}，忽略转义', () => {
    expect(extractEnvRefs('Bearer $TOKEN and ${API_KEY}')).toEqual(['TOKEN', 'API_KEY']);
    expect(extractEnvRefs('literal \\$TOKEN')).toEqual([]);
  });

  test('parseCurl 还原方法、URL、请求头与查询参数', () => {
    const parsed = parseCurl(
      "curl -X POST 'https://api.example.com/v1/users?page=2' -H 'Accept: application/json' -d '{\"name\":\"张三\"}'",
    );
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.state.method).toBe('POST');
    expect(parsed.state.url).toContain('api.example.com');
    expect(parsed.state.headers.some((header) => header.key === 'Accept')).toBe(true);
    expect(parsed.state.body.raw).toContain('张三');
  });

  test('buildCurl 的 maskSecrets 会把凭据替换成占位符', () => {
    const state = emptyState();
    state.url = 'https://api.example.com/v1/users';
    state.auth = { ...state.auth, kind: 'bearer', token: 'SUPER_SECRET_TOKEN' };
    state.cookies = [makePair('sid', 'SESSION_VALUE')];
    const masked = buildCurl(state, { pretty: false, maskSecrets: true, alwaysMethod: false });
    expect(masked).not.toContain('SUPER_SECRET_TOKEN');
    expect(masked).not.toContain('SESSION_VALUE');
    expect(masked).toContain('<已隐藏>');
    const plain = buildCurl(state, { pretty: false, maskSecrets: false, alwaysMethod: false });
    expect(plain).toContain('SUPER_SECRET_TOKEN');
  });
});

describe('har.ts：变量替换与 HAR 校验', () => {
  test('applyVariables 只替换有值的占位符', () => {
    const text = 'https://{{host}}/v1?token={{token}}&missing={{nope}}';
    const result = applyVariables(text, [
      { key: 'host', value: 'api.example.com' },
      { key: 'token', value: 'T1' },
    ]);
    expect(result).toBe('https://api.example.com/v1?token=T1&missing={{nope}}');
  });

  test('collectVariables 去重并保留顺序', () => {
    expect(collectVariables('{{a}} {{ b }} {{a}} {{c.d}}')).toEqual(['a', 'b', 'c.d']);
  });

  test('parseHar 对空文本 / 非法 JSON / 缺 entries 给出原因', () => {
    expect(parseHar('').ok).toBe(false);
    expect(parseHar('{oops').ok).toBe(false);
    expect(parseHar('{"hello":"world"}').ok).toBe(false);
    const empty = parseHar('');
    if (!empty.ok) expect(empty.error).toContain('HAR');
  });
});

describe('diff.ts：行拆分与差异统计', () => {
  test('toLines 统一换行且不产生多余的尾行', () => {
    expect(toLines('')).toEqual([]);
    expect(toLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c']);
    expect(toLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  test('lineSimilarity 相同为 1，完全不同为 0', () => {
    expect(lineSimilarity('abc', 'abc')).toBe(1);
    expect(lineSimilarity('', 'abc')).toBe(0);
    expect(lineSimilarity('abc', 'xyz')).toBe(0);
  });

  test('computeDiff 相同文本无差异，替换一行产生变更', () => {
    const same = computeDiff('a\nb\nc', 'a\nb\nc', DEFAULT_DIFF_OPTIONS);
    expect(same.stats.added).toBe(0);
    expect(same.stats.deleted).toBe(0);
    expect(same.stats.unchanged).toBe(3);

    const changed = computeDiff('a\nb\nc', 'a\nB\nc', DEFAULT_DIFF_OPTIONS);
    expect(
      changed.stats.unchanged + changed.stats.added + changed.stats.deleted + changed.stats.modified,
    ).toBeGreaterThan(0);
    expect(changed.stats.similarity).toBeLessThan(100);
  });
});
