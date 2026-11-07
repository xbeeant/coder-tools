import { beforeEach, describe, expect, test } from 'bun:test';
import {
  entryBytes,
  quotaHint,
  quotaLevel,
  readQuota,
  SAFE_WRITE_RATIO,
  STORAGE_BUDGET_BYTES,
  safeSetItem,
  wouldExceed,
} from '../app/lib/quota';
import { installStorage, type MemoryStorage } from './helpers/memory-storage';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installStorage();
});

describe('纯函数：配额估算', () => {
  test('entryBytes 按键值字符数 × 2 计算 UTF-16 体积', () => {
    expect(entryBytes('abc', 'de')).toBe(10);
    expect(entryBytes('', '')).toBe(0);
    expect(entryBytes('中文', '值')).toBe(6);
  });

  test('quotaLevel 按 75% / 90% 分级', () => {
    expect(quotaLevel(0)).toBe('ok');
    expect(quotaLevel(0.74)).toBe('ok');
    expect(quotaLevel(0.75)).toBe('warn');
    expect(quotaLevel(0.89)).toBe('warn');
    expect(quotaLevel(0.9)).toBe('danger');
    expect(quotaLevel(1)).toBe('danger');
  });

  test('wouldExceed 覆盖已有键时先减去旧值，不会误报', () => {
    // 100 - 50 + 60 = 110 > 100，应拒绝
    expect(wouldExceed(100, 50, 60, 100, 1)).toBe(true);
    // 100 - 90 + 5 = 15 <= 100，应放行
    expect(wouldExceed(100, 90, 5, 100, 1)).toBe(false);
    // 刚好等于软上限不算超限
    expect(wouldExceed(0, 0, 90, 100, 0.9)).toBe(false);
    expect(wouldExceed(0, 0, 91, 100, 0.9)).toBe(true);
  });
});

describe('readQuota：同源占用统计', () => {
  test('区分工具箱键与同源下其他应用的键', () => {
    storage.setItem('coder-tools:favorites', '["a"]');
    storage.setItem('other-app:cache', '12345');
    const info = readQuota();
    expect(info.available).toBe(true);
    expect(info.entryCount).toBe(2);
    expect(info.toolboxBytes).toBe(entryBytes('coder-tools:favorites', '["a"]'));
    expect(info.usedBytes).toBe(entryBytes('coder-tools:favorites', '["a"]') + entryBytes('other-app:cache', '12345'));
    expect(info.level).toBe('ok');
    expect(quotaHint(info)).toBeNull();
  });

  test('接近上限时给出可操作的提示', () => {
    const huge = 'x'.repeat(Math.ceil((STORAGE_BUDGET_BYTES * 0.95) / 2));
    storage.setItem('other-app:blob', huge);
    const info = readQuota();
    expect(info.level).toBe('danger');
    expect(quotaHint(info)).toContain('5 MB');
  });

  test('localStorage 不可用时返回 unavailable 而不是抛错', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    const info = readQuota();
    expect(info.available).toBe(false);
    expect(info.level).toBe('unavailable');
    expect(quotaHint(info)).toContain('隐私模式');
  });
});

describe('safeSetItem：写入预检与错误说明', () => {
  test('正常写入返回 ok', () => {
    const result = safeSetItem('coder-tools:demo', 'hello');
    expect(result.ok).toBe(true);
    expect(storage.getItem('coder-tools:demo')).toBe('hello');
  });

  test('改写已有键时不会把自己算两遍', () => {
    storage.setItem('coder-tools:draft', 'x'.repeat(1000));
    expect(safeSetItem('coder-tools:draft', 'short').ok).toBe(true);
    expect(storage.getItem('coder-tools:draft')).toBe('short');
  });

  test('空间不足时拒绝写入并给出原因，且不覆盖原值', () => {
    storage.setItem('other-app:blob', 'x'.repeat(Math.ceil((STORAGE_BUDGET_BYTES * 0.92) / 2)));
    const result = safeSetItem('coder-tools:input:notes', 'new content');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('没有保存');
    expect(storage.getItem('coder-tools:input:notes')).toBeNull();
  });

  test('浏览器抛出 QuotaExceededError 时翻译成中文提示', () => {
    storage.throwOnSet = true;
    const result = safeSetItem('coder-tools:demo', 'value');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('空间不足');
  });

  test('软上限常量与预算保持合理关系', () => {
    expect(SAFE_WRITE_RATIO).toBeGreaterThan(0.5);
    expect(SAFE_WRITE_RATIO).toBeLessThan(1);
    expect(STORAGE_BUDGET_BYTES).toBe(5 * 1024 * 1024);
  });
});
