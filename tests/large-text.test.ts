import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  isLargeText,
  LARGE_LIST_ROWS,
  LARGE_OUTPUT_PREVIEW_CHARS,
  LARGE_TEXT_LIMIT,
  limitRows,
  previewText,
} from '../app/lib/large-text';

const read = (relative: string): string => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

/** 本批接入共享守卫的工具；删掉接入会让对应测试变红。 */
const GUARDED_TOOLS = [
  'base64',
  'html-entity',
  'url-encode',
  'text-stats',
  'text-clean',
  'unicode',
  'case',
  'sql',
  'yaml-xml',
  'markdown',
  'json-convert',
  'json-to-code',
  'json-diff',
  'text-diff',
];

describe('大文本保护的共享阈值与纯函数', () => {
  test('阈值、预览与列表上限都是明确常量', () => {
    expect(LARGE_TEXT_LIMIT).toBe(1_000_000);
    expect(LARGE_OUTPUT_PREVIEW_CHARS).toBe(200_000);
    expect(LARGE_LIST_ROWS).toBe(500);
  });

  test('阈值判定是严格大于', () => {
    expect(isLargeText('x'.repeat(LARGE_TEXT_LIMIT))).toBe(false);
    expect(isLargeText('x'.repeat(LARGE_TEXT_LIMIT + 1))).toBe(true);
  });

  test('previewText 不改动短文本，只截断显示', () => {
    expect(previewText('abc', 5)).toBe('abc');
    const result = previewText('abcdefghij', 4);
    expect(result.startsWith('abcd')).toBe(true);
    expect(result).toContain('10 字符');
    expect(result).toContain('复制或下载');
  });

  test('limitRows 只影响渲染列表，不改原数组', () => {
    const rows = [1, 2, 3, 4];
    expect(limitRows(rows, 2)).toEqual([1, 2]);
    expect(rows).toEqual([1, 2, 3, 4]);
    expect(limitRows(rows, 10)).toEqual([1, 2, 3, 4]);
  });
});

describe('大文件保护覆盖回归', () => {
  for (const id of GUARDED_TOOLS) {
    test(`${id} 接入共享守卫并在大文件时短路`, () => {
      const source = read(`app/tools/${id}.tsx`);
      expect(source).toContain('useLargeText');
      expect(source).toContain('LargeTextNotice');
      expect(source).toContain('isLarge');
    });
  }

  test('JSON 格式化仍保留第七批的专用后台入口', () => {
    expect(read('app/tools/json-formatter.tsx')).toContain('formatLargeJson');
  });

  test('ResultBox 对所有工具默认限量显示', () => {
    const source = read('app/components/ui/result.tsx');
    expect(source).toContain('maxDisplayChars = LARGE_OUTPUT_PREVIEW_CHARS');
    expect(source).toContain('previewText');
  });

  test('后台内核覆盖全部任务类型，且缺省仍按 JSON 处理', () => {
    const worker = read('public/format-worker.js');
    for (const task of ['json', 'code', 'markup', 'lines', 'stats', 'codec']) {
      expect(worker).toContain(`task === '${task}'`);
    }
    expect(worker).toContain("typeof data.task === 'string' ? data.task : 'json'");
  });

  test('客户端保留旧签名并新增通用任务入口', () => {
    const source = read('app/lib/format-stream.ts');
    expect(source).toContain('export function formatLargeJson');
    expect(source).toContain('export function runFormatTask');
    expect(source).toContain("runFormatTask('json'");
  });

  test('Worker 仍是零路径依赖的自包含静态资源', () => {
    const worker = read('public/format-worker.js');
    for (const forbidden of ['import.meta.url', 'importScripts', 'new URL(', 'eval(', 'new Function', 'import ']) {
      expect(worker.includes(forbidden)).toBe(false);
    }
    expect(read('vite.web.config.ts')).toContain("base: './'");
    expect(read('index.html').includes('<base')).toBe(false);
  });
});
