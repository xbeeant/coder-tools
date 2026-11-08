/**
 * 全量工具完善度基线：给「85 个工具每个都做到位」一条可执行的底线。
 *
 * 静态扫描 app/tools/*.tsx，检查每个工具是否具备统一的功能基线。
 * 覆盖率采用「不退化」断言：删掉复制 / 示例 / 空态等能力会让测试失败，
 * 继续补齐则随时可以通过。完整报告与批次清单见 TODO.md。
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../app/tools/', import.meta.url));
const files = readdirSync(dir)
  .filter((file) => file.endsWith('.tsx'))
  .sort();
const sources = files.map((file) => ({ file, code: readFileSync(`${dir}${file}`, 'utf8') }));

/** 每项都是「使用者能感知到的能力」，不是代码风格指标。 */
const CHECKS: Record<string, RegExp> = {
  copy: /copyText|CopyButton|复制/,
  clear: /ClearButton|清空|重置/,
  hint: /EmptyHint|<Note|<Hint|暂无|提示/,
  error: /catch\s*\(|ResultBox|setError|error=/,
  sample: /示例|[Ee]xample|[Ss]ample/,
  a11y: /aria-|htmlFor|<label/,
  lib: /from '\.\.\/lib\//,
};

function coverage(key: string): number {
  const pattern = CHECKS[key];
  if (!pattern) return 0;
  return sources.filter(({ code }) => pattern.test(code)).length;
}

function hits(code: string): number {
  const panel = code.includes('ToolPanel') ? 1 : 0;
  return panel + Object.values(CHECKS).filter((pattern) => pattern.test(code)).length;
}

describe('全量工具完善度基线', () => {
  test('工具数量稳定，且全部使用统一的 ToolPanel 容器', () => {
    expect(files.length).toBeGreaterThanOrEqual(85);
    const missing = sources.filter(({ code }) => !code.includes('ToolPanel')).map(({ file }) => file);
    expect(missing).toEqual([]);
  });

  test('各项覆盖率不低于基线，防止删功能导致退化', () => {
    const floor: Record<string, number> = {
      copy: 80,
      clear: 64,
      hint: 82,
      error: 65,
      sample: 55,
      a11y: 80,
      lib: 68,
    };
    const regressions: string[] = [];
    for (const [key, minimum] of Object.entries(floor)) {
      if (coverage(key) < minimum) regressions.push(`${key}: ${coverage(key)} < ${minimum}`);
    }
    expect(regressions).toEqual([]);
  });

  test('没有工具低于最低基线（统一容器 + 至少 2 项可感知能力）', () => {
    const weak = sources.filter(({ code }) => hits(code) < 3).map(({ file }) => file);
    expect(weak).toEqual([]);
  });

  test('工具页不残留默认调色板类名与降透明度的正文', () => {
    const legacy =
      /\b(?:text|bg|border|fill|stroke|decoration|ring|outline|divide|from|to|via)-(?:amber|emerald|sky|fuchsia|red|rose|orange|violet|green|blue|yellow|teal|purple|lime|indigo|cyan|pink|slate|zinc|gray|stone|neutral)-\d{3}\b|\btext-(?:muted-)?foreground\/\d{1,3}\b/;
    const offenders = sources.filter(({ code }) => legacy.test(code)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
