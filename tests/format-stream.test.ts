import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FORMAT_WORKER_ASSET, resolveFormatWorkerUrl } from '../app/lib/format-stream';

const read = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const workerSource = read('public/format-worker.js');

interface WorkerReply {
  id: number;
  ok: boolean;
  output?: string;
  error?: string;
  elapsedMs?: number;
}

interface WorkerPayload {
  id: number;
  text: string;
  indent: number;
  minify: boolean;
  task?: string;
  options?: Record<string, unknown>;
}

/**
 * 在 Bun 里直接执行 classic worker 源码：给它一个假的 self 即可，
 * 不需要启动真实 Worker，也不触碰任何网络资源。
 */
function runWorker(payload: WorkerPayload): WorkerReply {
  const replies: WorkerReply[] = [];
  const scope: {
    postMessage: (message: WorkerReply) => void;
    onmessage?: (event: { data: unknown }) => void;
  } = {
    postMessage: (message) => replies.push(message),
  };
  const factory = new Function('self', workerSource);
  factory(scope);
  if (!scope.onmessage) throw new Error('worker 未注册 onmessage');
  scope.onmessage({ data: payload });
  const first = replies[0];
  if (!first) throw new Error('worker 未回传结果');
  return first;
}

const run = (text: string, indent = 2, minify = false): string => {
  const reply = runWorker({ id: 1, text, indent, minify });
  if (!reply.ok) throw new Error(reply.error ?? 'worker 返回失败');
  return reply.output ?? '';
};

describe('Worker 路径解析（子路径部署回归）', () => {
  test('根目录部署', () => {
    expect(resolveFormatWorkerUrl('https://host.example/index.html')).toBe('https://host.example/format-worker.js');
  });

  test('部署在 /mirror/coder-tools/ 子路径', () => {
    expect(resolveFormatWorkerUrl('https://host.example/mirror/coder-tools/index.html')).toBe(
      'https://host.example/mirror/coder-tools/format-worker.js',
    );
    expect(resolveFormatWorkerUrl('https://host.example/mirror/coder-tools/')).toBe(
      'https://host.example/mirror/coder-tools/format-worker.js',
    );
  });

  test('子路径 + hash 路由不会把 worker 解析到 /tool/ 下', () => {
    expect(resolveFormatWorkerUrl('https://host.example/mirror/coder-tools/index.html#/tool/json-formatter')).toBe(
      'https://host.example/mirror/coder-tools/format-worker.js',
    );
  });

  test('扩展页面同源解析', () => {
    expect(resolveFormatWorkerUrl('chrome-extension://abcdefgh/index.html')).toBe(
      'chrome-extension://abcdefgh/format-worker.js',
    );
  });

  test('扩展端优先使用 runtime.getURL，永远指向包根目录', () => {
    const url = resolveFormatWorkerUrl(
      'https://host.example/whatever/index.html',
      (path) => `chrome-extension://abcdefgh/${path}`,
    );
    expect(url).toBe(`chrome-extension://abcdefgh/${FORMAT_WORKER_ASSET}`);
  });

  test('任何场景都不会产生 /assets/ 绝对路径或 import.meta.url 引用', () => {
    const cases = [
      'https://host.example/index.html',
      'https://host.example/mirror/coder-tools/index.html',
      'https://host.example/mirror/coder-tools/index.html#/tool/x',
      'chrome-extension://abcdefgh/index.html',
    ];
    for (const base of cases) {
      const url = resolveFormatWorkerUrl(base);
      expect(url.endsWith(`/${FORMAT_WORKER_ASSET}`)).toBe(true);
      expect(url.includes('/assets/')).toBe(false);
      expect(url.includes('import.meta.url')).toBe(false);
    }
  });

  test('两个入口 HTML 都没有 base 标签（否则 document.baseURI 会失效）', () => {
    expect(read('index.html').includes('<base')).toBe(false);
    expect(read('entrypoints/index.html').includes('<base')).toBe(false);
  });

  test('Web 构建保持相对 base，扩展 manifest 未放宽 CSP', () => {
    expect(read('vite.web.config.ts')).toContain("base: './'");
    const wxt = read('wxt.config.ts');
    expect(wxt.includes('worker-src')).toBe(false);
    expect(wxt.includes('blob:')).toBe(false);
  });
});

describe('Worker 静态约束', () => {
  test('产物里不存在任何路径依赖或动态执行', () => {
    for (const forbidden of ['import.meta.url', 'importScripts', 'new URL(', 'eval(', 'new Function', 'import ']) {
      expect(workerSource.includes(forbidden)).toBe(false);
    }
  });

  test('实现 classic worker 消息协议', () => {
    expect(workerSource).toContain('self.onmessage');
    expect(workerSource).toContain('self.postMessage');
    expect(workerSource).toContain('formatStream');
    expect(workerSource).toContain('ok: true');
  });

  test('Biome 已排除该独立静态资源', () => {
    expect(read('biome.json')).toContain('!**/public/format-worker.js');
  });
});

describe('Worker 流式格式化', () => {
  test('美化嵌套对象', () => {
    expect(run('{"a":1,"b":[2,3]}')).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  test('压缩去掉字符串外的空白', () => {
    expect(run('{ "a" : 1, "b" : [ 2, 3 ] }', 2, true)).toBe('{"a":1,"b":[2,3]}');
  });

  test('中文与转义字符串原样保留', () => {
    const source = '{"name":"中文","path":"a\\"b"}';
    const result = run(source);
    expect(result).toContain('中文');
    expect(result).toContain('a\\"b');
    expect(JSON.parse(result) as Record<string, string>).toEqual({ name: '中文', path: 'a"b' });
  });

  test('制表符缩进用 -1 表示', () => {
    expect(run('{"a":1}', -1)).toBe('{\n\t"a": 1\n}');
  });

  test('缩进为 0 时只换行不缩进', () => {
    expect(run('{"a":1}', 0)).toBe('{\n"a": 1\n}');
  });

  test('JSON5 单行注释与单引号不会被破坏', () => {
    const result = run("{// 注释\n'a':1}");
    expect(result).toContain('// 注释');
    expect(result).toContain("'a'");
  });

  test('输出仍是合法 JSON（严格输入）', () => {
    const source = '{"n":1,"ok":true,"nil":null,"list":[1,2,{"k":"v"}]}';
    expect(JSON.parse(run(source)) as unknown).toEqual(JSON.parse(source) as unknown);
  });

  test('非字符串输入安全降级，不抛异常', () => {
    const reply = runWorker({ id: 7, text: 123 as unknown as string, indent: 2, minify: false });
    expect(reply.id).toBe(7);
    expect(reply.ok).toBe(true);
  });

  test('大文本单遍扫描不会爆栈', () => {
    const text = `{"items":[${Array.from({ length: 20_000 }, (_, i) => i).join(',')}]}`;
    const result = run(text, 2, true);
    expect(result.startsWith('{"items":[')).toBe(true);
    expect(result.endsWith(']}')).toBe(true);
  });
});

const runTask = (
  text: string,
  task: string,
  options: Record<string, unknown> = {},
  indent = 2,
  minify = false,
): string => {
  const reply = runWorker({ id: 2, text, indent, minify, task, options });
  if (!reply.ok) throw new Error(reply.error ?? 'worker 返回失败');
  return reply.output ?? '';
};

describe('多任务后台内核 · 代码与标记语言', () => {
  test('code 美化在括号 / 分号 / 逗号处换行', () => {
    const result = runTask('a{color:red;font-size:12px}', 'code');
    expect(result).toContain('a{');
    expect(result).toContain('\n');
    expect(result).toContain('color:red');
  });

  test('code 压缩保留标识符之间的必要空格', () => {
    const result = runTask('SELECT   a\n  FROM   users  WHERE  id = 1;', 'code', { dialect: 'sql' }, 2, true);
    expect(result).toBe('SELECT a FROM users WHERE id=1;');
  });

  test('code 的 SQL 行注释不被当成运算符', () => {
    const result = runTask('SELECT 1 -- 说明\nFROM t', 'code', { dialect: 'sql' });
    expect(result).toContain('-- 说明');
    expect(result).toContain('FROM t');
  });

  test('code 的字符串内空白与注释不会被误删', () => {
    const result = runTask('SELECT "a  b" /* 说明 */ FROM t;', 'code', { dialect: 'sql' }, 2, true);
    expect(result).toContain('"a  b"');
    expect(result).not.toContain('说明');
  });

  test('markup 按标签缩进，注释与声明保持独立', () => {
    const result = runTask('<?xml version="1.0"?><root><a>1</a><!--c--></root>', 'markup');
    expect(result).toContain('<root>');
    expect(result).toContain('<a>');
    expect(result).toContain('<!--c-->');
    expect(result.split('\n').length).toBeGreaterThan(3);
    expect(result).toContain('\n  <a>');
  });

  test('markup 压缩折叠标签之间的空白', () => {
    const result = runTask('<root>\n  <a>1</a>\n</root>', 'markup', {}, 2, true);
    expect(result).toBe('<root><a>1</a></root>');
  });

  test('超深嵌套不会生成超大缩进字符串', () => {
    const source = '{'.repeat(5000) + '1' + '}'.repeat(5000);
    const result = runTask(source, 'code', {}, 2, true);
    expect(result.length).toBeLessThan(source.length * 2);
  });
});

describe('多任务后台内核 · 行处理与统计', () => {
  test('lines 去行尾空白、去空行、去重并排序', () => {
    const result = runTask('b  \r\n\na \r\nb  \n', 'lines', {
      trim: true,
      removeEmpty: true,
      dedupe: true,
      sort: true,
    });
    expect(result).toBe('a\nb');
  });

  test('lines 支持反转与整行 trim', () => {
    expect(runTask(' a \n b ', 'lines', { trimAll: true, reverse: true })).toBe('b\na');
  });

  test('stats 返回可解析的统计 JSON', () => {
    const parsed = JSON.parse(runTask('a b\nb 中文\n', 'stats')) as {
      chars: number;
      lines: number;
      words: number;
      bytes: number;
      topWords: { word: string; count: number }[];
    };
    expect(parsed.chars).toBe('a b\nb 中文\n'.length);
    expect(parsed.lines).toBe(3);
    expect(parsed.words).toBe(4);
    expect(parsed.bytes).toBeGreaterThan(parsed.chars);
    expect(parsed.topWords[0]?.word).toBe('b');
  });

  test('stats 对空文本也返回完整结构', () => {
    const parsed = JSON.parse(runTask('', 'stats')) as { chars: number; lines: number };
    expect(parsed.chars).toBe(0);
    expect(parsed.lines).toBe(1);
  });
});

describe('多任务后台内核 · 编解码', () => {
  test('base64 中文往返', () => {
    const encoded = runTask('中文 👋', 'codec', { mode: 'base64-encode' });
    expect(runTask(encoded, 'codec', { mode: 'base64-decode' })).toBe('中文 👋');
  });

  test('html 实体编解码往返', () => {
    const encoded = runTask('<a href="x">&中文</a>', 'codec', { mode: 'html-encode' });
    expect(encoded).toBe('&lt;a href=&quot;x&quot;&gt;&amp;中文&lt;/a&gt;');
    expect(runTask(encoded, 'codec', { mode: 'html-decode' })).toBe('<a href="x">&中文</a>');
  });

  test('html 数字实体解码', () => {
    expect(runTask('&#x4E2D;&#25991;', 'codec', { mode: 'html-decode' })).toBe('中文');
  });

  test('url 编解码往返', () => {
    const encoded = runTask('a b&中文', 'codec', { mode: 'url-encode' });
    expect(runTask(encoded, 'codec', { mode: 'url-decode' })).toBe('a b&中文');
  });

  test('未知任务与未知编解码模式返回明确失败', () => {
    expect(runWorker({ id: 9, text: 'x', indent: 2, minify: false, task: 'nope' }).ok).toBe(false);
    expect(
      runWorker({ id: 10, text: 'x', indent: 2, minify: false, task: 'codec', options: { mode: 'nope' } }).ok,
    ).toBe(false);
  });
});
