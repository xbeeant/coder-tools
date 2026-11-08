/**
 * 任务 B 回归：真实响应解析 + 断言执行 + http-client 历史还原。
 * 全部是纯函数，复用 har.ts / curl.ts 的纯逻辑，不联网、零新依赖。
 */

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_ASSERTION_RULES,
  HTTP_HISTORY_KEY,
  lastHistoryResponseText,
  parseResponseText,
  runAssertions,
} from '../app/lib/har';

const RESPONSE_TEXT = `HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-response-time: 642
x-trace-id: trace-demo-0001

{"code":"OK","data":{"id":9001,"state":"created"},"items":[{"sku":"A-1","qty":2}]}`;

describe('runAssertions：解析响应并逐条执行断言', () => {
  test('默认规则集固定为 4 条且全部启用', () => {
    expect(DEFAULT_ASSERTION_RULES).toHaveLength(4);
    expect(DEFAULT_ASSERTION_RULES.every((rule) => rule.enabled)).toBe(true);
  });

  test('示例响应得到 3 通过 / 1 失败，并给出实际值', () => {
    const run = runAssertions(RESPONSE_TEXT, DEFAULT_ASSERTION_RULES);
    expect(run.total).toBe(4);
    expect(run.passed).toBe(3);
    expect(run.failed).toBe(1);
    expect(run.results[0]!.passed).toBe(true);
    expect(run.results[0]!.actual).toBe('200');
    expect(run.results[3]!.passed).toBe(false);
    expect(run.results[3]!.actual).toBe('642');
    expect(run.results[3]!.message).toContain('失败');
  });

  test('response 还原状态码、响应头、body 与耗时', () => {
    const { response } = runAssertions(RESPONSE_TEXT, DEFAULT_ASSERTION_RULES);
    expect(response.status).toBe(200);
    expect(response.time).toBe(642);
    expect(response.headers.some((item) => item.name === 'content-type')).toBe(true);
    expect(response.body).toContain('"code":"OK"');
  });

  test('停用规则不参与统计', () => {
    const rules = DEFAULT_ASSERTION_RULES.map((rule, index) => (index === 3 ? { ...rule, enabled: false } : rule));
    const run = runAssertions(RESPONSE_TEXT, rules);
    expect(run.total).toBe(3);
    expect(run.passed).toBe(3);
    expect(run.failed).toBe(0);
  });

  test('jsonPath 断言能取到嵌套字段的实际值', () => {
    const run = runAssertions(RESPONSE_TEXT, [
      {
        id: 'as-json',
        type: 'jsonPath',
        field: '$.data.state',
        operator: 'equals',
        expected: 'created',
        enabled: true,
      },
    ]);
    expect(run.total).toBe(1);
    expect(run.passed).toBe(1);
    expect(run.results[0]!.actual).toBe('created');
  });
});

describe('lastHistoryResponseText：复用 http-client 本地历史', () => {
  test('共享键名与 http-client 保持一致', () => {
    expect(HTTP_HISTORY_KEY).toBe('coder-tools:http-history');
  });

  test('空 / 非法 / 非数组 / 空数组 / 首项非对象都返回 null', () => {
    expect(lastHistoryResponseText(null)).toBeNull();
    expect(lastHistoryResponseText('')).toBeNull();
    expect(lastHistoryResponseText('{oops')).toBeNull();
    expect(lastHistoryResponseText('{"a":1}')).toBeNull();
    expect(lastHistoryResponseText('[]')).toBeNull();
    expect(lastHistoryResponseText('[1, 2]')).toBeNull();
  });

  test('最近一条历史还原成可解析的 HTTP 响应文本', () => {
    const raw = JSON.stringify([
      {
        id: 'x1',
        at: 1,
        method: 'POST',
        status: 201,
        url: 'https://api.example.com/v1/orders',
        durationMs: 128,
        transport: 'direct',
        curl: 'curl https://api.example.com/v1/orders',
      },
    ]);
    const text = lastHistoryResponseText(raw);
    expect(text).not.toBeNull();
    if (text === null) return;
    expect(text).toContain('HTTP/1.1 201');
    expect(text).toContain('x-source: coder-tools:http-history');
    expect(text).toContain('x-response-time: 128');
    expect(text).toContain('不含响应体');

    const parsed = parseResponseText(text);
    expect(parsed.status).toBe(201);
    expect(parsed.time).toBe(128);
    expect(parsed.body).toContain('不含响应体');
    expect(parsed.headers.some((item) => item.name === 'x-transport')).toBe(true);
  });

  test('历史字段里的换行被清理，不会注入伪造响应头', () => {
    const raw = JSON.stringify([
      {
        status: 200,
        url: 'https://api.example.com/a\r\nX-Evil: 1',
        durationMs: 10,
        transport: 'direct\nX-Evil-2: 2',
      },
    ]);
    const text = lastHistoryResponseText(raw);
    expect(text).not.toBeNull();
    if (text === null) return;
    const parsed = parseResponseText(text);
    expect(parsed.headers).toHaveLength(4);
    expect(parsed.headers.some((item) => item.name === 'x-evil')).toBe(false);
    expect(parsed.headers.some((item) => item.name === 'x-evil-2')).toBe(false);
  });
});
