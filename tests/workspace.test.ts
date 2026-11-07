import { beforeEach, describe, expect, test } from 'bun:test';
import {
  clearWorkspaceStorage,
  exportWorkspace,
  formatBytes,
  importWorkspace,
  listWorkspaceEntries,
  parseWorkspace,
  SNAPSHOT_FORMAT,
  STORAGE_PREFIX,
  snapshotToJson,
  workspaceTotalBytes,
} from '../app/lib/workspace';
import { installStorage, type MemoryStorage } from './helpers/memory-storage';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installStorage();
});

function validSnapshot(entries: Record<string, string> = { 'coder-tools:favorites': '["a"]' }): string {
  return JSON.stringify({
    format: SNAPSHOT_FORMAT,
    version: 1,
    exportedAt: '2026-11-07T00:00:00.000Z',
    runtime: 'Web 版',
    entries,
  });
}

describe('parseWorkspace：备份文件校验', () => {
  test('接受合法快照', () => {
    const parsed = parseWorkspace(validSnapshot());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.snapshot.entries['coder-tools:favorites']).toBe('["a"]');
  });

  test('拒绝非 JSON、错误格式、错误版本', () => {
    expect(parseWorkspace('not json').ok).toBe(false);
    expect(parseWorkspace('[]').ok).toBe(false);
    expect(parseWorkspace(JSON.stringify({ format: 'other', version: 1, entries: {} })).ok).toBe(false);
    expect(parseWorkspace(validSnapshot().replace('"version":1', '"version":2')).ok).toBe(false);
  });

  test('过滤非工具箱前缀的键与非字符串值，防止越权写入', () => {
    const parsed = parseWorkspace(
      validSnapshot({
        'coder-tools:keep': 'ok',
        'other-app:secret': 'should-not-import',
        'coder-tools:number': 42 as unknown as string,
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Object.keys(parsed.snapshot.entries)).toEqual(['coder-tools:keep']);
    }
  });

  test('没有有效条目时拒绝', () => {
    expect(parseWorkspace(validSnapshot({ 'other-app:x': '1' })).ok).toBe(false);
    expect(parseWorkspace(validSnapshot({})).ok).toBe(false);
  });

  test('超过 8 MB 上限时拒绝', () => {
    const big = validSnapshot({ 'coder-tools:blob': 'x'.repeat(8_000_001) });
    expect(parseWorkspace(big).ok).toBe(false);
  });
});

describe('工作区枚举 / 导出 / 导入', () => {
  test('只列出 coder-tools: 前缀，且按 key 排序', () => {
    storage.setItem('other-app:cache', 'ignore');
    storage.setItem('coder-tools:settings', '{}');
    storage.setItem('coder-tools:favorites', '[]');
    const entries = listWorkspaceEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.key).toBe('coder-tools:favorites');
    expect(entries[1]?.key).toBe('coder-tools:settings');
    expect(workspaceTotalBytes()).toBeGreaterThan(0);
  });

  test('导出后 JSON 可被重新解析', () => {
    storage.setItem('coder-tools:notes-demo', 'hello');
    const snapshot = exportWorkspace();
    expect(snapshot.format).toBe(SNAPSHOT_FORMAT);
    expect(snapshot.entries['coder-tools:notes-demo']).toBe('hello');
    expect(parseWorkspace(snapshotToJson(snapshot)).ok).toBe(true);
  });

  test('merge 导入保留未出现在快照里的本地数据', () => {
    storage.setItem('coder-tools:local-only', 'keep');
    const parsed = parseWorkspace(validSnapshot({ 'coder-tools:favorites': '["b"]' }));
    if (!parsed.ok) throw new Error(parsed.error);
    const result = importWorkspace(parsed.snapshot, 'merge');
    expect(result.count).toBe(1);
    expect(result.total).toBe(1);
    expect(result.error).toBeNull();
    expect(storage.getItem('coder-tools:local-only')).toBe('keep');
    expect(storage.getItem('coder-tools:favorites')).toBe('["b"]');
  });

  test('replace 导入会先清空旧数据', () => {
    storage.setItem('coder-tools:local-only', 'drop');
    const parsed = parseWorkspace(validSnapshot({ 'coder-tools:favorites': '["b"]' }));
    if (!parsed.ok) throw new Error(parsed.error);
    importWorkspace(parsed.snapshot, 'replace');
    expect(storage.getItem('coder-tools:local-only')).toBeNull();
    expect(storage.getItem('coder-tools:favorites')).toBe('["b"]');
  });

  test('写入失败时返回失败数量与原因，不假装成功', () => {
    const huge = 'x'.repeat(Math.ceil((5 * 1024 * 1024 * 0.92) / 2));
    storage.setItem('other-app:blob', huge);
    const parsed = parseWorkspace(validSnapshot({ 'coder-tools:a': '1', 'coder-tools:b': '2' }));
    if (!parsed.ok) throw new Error(parsed.error);
    const result = importWorkspace(parsed.snapshot, 'merge');
    expect(result.count).toBe(0);
    expect(result.total).toBe(2);
    expect(result.error).toContain('没有保存');
  });

  test('clearWorkspaceStorage 不触碰同源下其他应用的数据', () => {
    storage.setItem('coder-tools:a', '1');
    storage.setItem('coder-tools:b', '2');
    storage.setItem('other-app:c', '3');
    expect(clearWorkspaceStorage()).toBe(2);
    expect(storage.getItem('other-app:c')).toBe('3');
  });
});

describe('formatBytes', () => {
  test('按 B / KB / MB 分级', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });

  test('前缀常量稳定', () => {
    expect(STORAGE_PREFIX).toBe('coder-tools:');
  });
});
