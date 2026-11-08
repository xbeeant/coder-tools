/**
 * 任务 A 回归：离线快照日期、advisory 导入解析、来源区分与结果标注。
 * 全部是纯函数，不联网、不读 DOM，零新依赖。
 */

import { describe, expect, test } from 'bun:test';
import {
  ADVISORIES,
  type Advisory,
  type Dependency,
  FINDING_SOURCE_LABEL,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ENTRIES,
  matchAdvisories,
  matchSourcedAdvisories,
  mergeAdvisories,
  parseImportedAdvisories,
  reportToText,
  SNAPSHOT_DATE,
  type SourcedAdvisory,
  scanProject,
  snapshotFreshness,
} from '../app/lib/security-scan';

const LODASH_DEP: Dependency = { name: 'lodash', version: '4.17.15', ecosystem: 'npm', line: 1 };

function imported(overrides: Partial<Advisory> = {}): Advisory {
  return {
    ecosystem: 'npm',
    package: 'lodash',
    fixed: '99.0.0',
    severity: 'critical',
    cve: 'CVE-2099-0001',
    cwe: 'CWE-94',
    summary: '用户导入示例',
    advice: '升级到 99.0.0 及以上',
    ...overrides,
  };
}

describe('离线快照日期与时效性', () => {
  test('SNAPSHOT_DATE 是符合 YYYY-MM-DD 的确定常量', () => {
    expect(SNAPSHOT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SNAPSHOT_DATE).toBe('2025-03-31');
  });

  test('snapshotFreshness 按 90 / 365 天分档，并夹紧未来参照日期', () => {
    expect(snapshotFreshness(new Date('2025-01-01T00:00:00Z')).days).toBe(0);
    const fresh = snapshotFreshness(new Date('2025-04-30T00:00:00Z'));
    expect(fresh.days).toBe(30);
    expect(fresh.level).toBe('fresh');
    expect(fresh.label).toBe('30 天前');

    const aging = snapshotFreshness(new Date('2025-09-30T00:00:00Z'));
    expect(aging.days).toBe(183);
    expect(aging.level).toBe('aging');

    const stale = snapshotFreshness(new Date('2026-06-01T00:00:00Z'));
    expect(stale.days).toBeGreaterThan(365);
    expect(stale.level).toBe('stale');
  });

  test('来源标签覆盖三类', () => {
    expect(FINDING_SOURCE_LABEL['static-rule']).toBe('内置静态规则');
    expect(FINDING_SOURCE_LABEL['cve-snapshot']).toBe('离线 CVE 快照');
    expect(FINDING_SOURCE_LABEL['imported-advisory']).toBe('用户导入的 advisory');
  });
});

describe('parseImportedAdvisories：宽松但安全', () => {
  test('拒绝空内容 / 非法 JSON / 非数组非对象顶层', () => {
    const empty = parseImportedAdvisories('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('空');

    const badJson = parseImportedAdvisories('{oops');
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.error).toContain('JSON');

    for (const raw of ['123', 'true', 'null', '"a string"']) {
      const result = parseImportedAdvisories(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('数组');
    }
  });

  test('拒绝超大文本与超量条目，给出中文原因', () => {
    const huge = parseImportedAdvisories(`x${'a'.repeat(MAX_IMPORT_BYTES)}`);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toContain('KB');

    const many = JSON.stringify(
      Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, () => ({ package: 'x', fixed: '1.0.0' })),
    );
    const tooMany = parseImportedAdvisories(many);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toContain('条目数');
  });

  test('拒绝空数组、无数组字段的对象、全无效条目', () => {
    const emptyArray = parseImportedAdvisories('[]');
    expect(emptyArray.ok).toBe(false);
    if (!emptyArray.ok) expect(emptyArray.error).toContain('空');

    const noArray = parseImportedAdvisories('{"hello":"world"}');
    expect(noArray.ok).toBe(false);
    if (!noArray.ok) expect(noArray.error).toContain('数组');

    const allInvalid = parseImportedAdvisories('[1, "x", null, [], {"package":"only-name"}]');
    expect(allInvalid.ok).toBe(false);
    if (!allInvalid.ok) expect(allInvalid.error).toContain('有效条目');
  });

  test('接受顶层数组，并对缺失字段补安全默认值', () => {
    const result = parseImportedAdvisories(
      JSON.stringify([{ package: 'demo-lib', fixed: '2.0.0', severity: 'critical' }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.advisories).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);
    const item = result.advisories[0]!;
    expect(item.ecosystem).toBe('npm');
    expect(item.severity).toBe('critical');
    expect(item.cve).toBe('USER-IMPORT');
    expect(item.advice).toContain('2.0.0');
  });

  test('接受字段别名与对象包装，跳过无法识别的条目', () => {
    const result = parseImportedAdvisories(
      JSON.stringify({
        vulnerabilities: [
          { name: 'aliased', fixedVersion: '3.1.4', level: 'high' },
          { nothing: 'useful' },
          42,
          { package: 'bad', fixed: 'not-a-version' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.advisories).toHaveLength(1);
    expect(result.skipped).toBe(3);
    expect(result.advisories[0]!.package).toBe('aliased');
    expect(result.advisories[0]!.fixed).toBe('3.1.4');
    expect(result.advisories[0]!.severity).toBe('high');
  });

  test('非法 severity 回落为 medium', () => {
    const result = parseImportedAdvisories(
      JSON.stringify([{ package: 'p', fixed: '1.0.0', severity: 'catastrophic' }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.advisories[0]!.severity).toBe('medium');
  });
});

describe('mergeAdvisories 与来源区分', () => {
  test('无导入时全部为内置快照来源', () => {
    const merged = mergeAdvisories();
    expect(merged).toHaveLength(ADVISORIES.length);
    expect(merged.every((item) => item.source === 'cve-snapshot')).toBe(true);
  });

  test('唯一导入项追加且标为 imported-advisory，与内置重复项被去重', () => {
    const duplicate = imported({ ...ADVISORIES[0]! });
    const unique = imported({ cve: 'CVE-UNIQUE' });
    const merged = mergeAdvisories([duplicate, unique, unique]);
    expect(merged).toHaveLength(ADVISORIES.length + 1);
    expect(merged[merged.length - 1]!.source).toBe('imported-advisory');
  });

  test('matchSourcedAdvisories 把来源写进命中的 Finding', () => {
    const base = ADVISORIES[0]!;
    const sourced: SourcedAdvisory[] = [
      { advisory: base, source: 'cve-snapshot' },
      { advisory: imported({ fixed: '99.0.0' }), source: 'imported-advisory' },
    ];
    const { hits } = matchSourcedAdvisories([LODASH_DEP], sourced);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.source).toBe('cve-snapshot');
    expect(hits[1]!.source).toBe('imported-advisory');
  });

  test('旧入口 matchAdvisories 仍只产出内置快照来源', () => {
    const { hits } = matchAdvisories([LODASH_DEP]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((item) => item.source === 'cve-snapshot')).toBe(true);
  });
});

describe('scanProject 端到端：三类来源都出现在结果与文本报告里', () => {
  const files = [
    { name: 'package.json', content: '{"dependencies":{"lodash":"4.17.15"}}' },
    { name: 'app.js', content: 'eval(userInput);' },
  ];
  const report = scanProject(files, { threshold: 'low', importedAdvisories: [imported({ fixed: '99.0.0' })] });

  test('每条 Finding 都带 source，且三类齐全', () => {
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((item) => item.source !== undefined)).toBe(true);
    expect(report.findings.some((item) => item.source === 'cve-snapshot')).toBe(true);
    expect(report.findings.some((item) => item.source === 'imported-advisory')).toBe(true);
    expect(report.findings.some((item) => item.source === 'static-rule')).toBe(true);
  });

  test('reportToText 标注来源', () => {
    const text = reportToText(report);
    expect(text).toContain('来源：');
    expect(text).toContain(FINDING_SOURCE_LABEL['cve-snapshot']);
  });
});
