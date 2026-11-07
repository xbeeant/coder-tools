/**
 * 设计系统 QA：直接从 app/globals.css 解析令牌并验证。
 *
 * 不用一次性脚本，是为了让「换配色」这件事有回归保护：
 * 任何改动只要把正文对比度压到 4.5:1 以下、或把交互边界压到 3:1 以下，
 * 这套测试就会失败。OKLCH → OKLab → 线性 sRGB → 相对亮度 → WCAG 对比度。
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');

type Oklch = [lightness: number, chroma: number, hue: number];
type Palette = Record<string, Oklch>;

function parseOklch(block: string): Palette {
  const result: Palette = {};
  const pattern = /--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  for (const match of block.matchAll(pattern)) {
    const [, name, l, c, h] = match;
    if (name && l && c && h) result[name] = [Number(l), Number(c), Number(h)];
  }
  return result;
}

const base = css.slice(css.indexOf('@layer base'), css.indexOf('@theme inline'));
const darkStart = base.indexOf('\n  .dark {');
const LIGHT = parseOklch(base.slice(0, darkStart));
const DARK = parseOklch(base.slice(darkStart));

/** OKLab → 线性 sRGB（已经是线性光，不能再做 gamma 解码）。 */
function linearRgb([l, c, h]: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const ll = l_ ** 3;
  const mm = m_ ** 3;
  const ss = s_ ** 3;
  return [
    4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
  ];
}

function luminance(color: Oklch): number {
  const [r, g, b] = linearRgb(color).map((value) => Math.max(0, Math.min(1, value)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(foreground: Oklch, background: Oklch): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 正文 / 语义色 ≥4.5:1；交互组件边界与图标 ≥3:1。 */
const TEXT_PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5],
  ['foreground', 'surface', 4.5],
  ['foreground', 'sidebar', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'surface', 4.5],
  ['muted-foreground', 'surface-2', 4.5],
  ['muted-foreground', 'sidebar', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['signal-foreground', 'signal', 4.5],
  ['destructive-foreground', 'danger', 4.5],
  ['success', 'surface', 4.5],
  ['warning', 'surface', 4.5],
  ['danger', 'surface', 4.5],
  ['info', 'surface', 4.5],
  ['ring', 'background', 3],
  ['border-strong', 'background', 3],
  ['syntax-key', 'surface', 4.5],
  ['syntax-string', 'surface', 4.5],
  ['syntax-number', 'surface', 4.5],
  ['syntax-literal', 'surface', 4.5],
  ['syntax-comment', 'surface', 4.5],
];

function validate(palette: Palette): string[] {
  const failures: string[] = [];
  for (const [fg, bg, minimum] of TEXT_PAIRS) {
    const foreground = palette[fg];
    const background = palette[bg];
    if (!foreground || !background) {
      failures.push(`缺少令牌 ${fg} 或 ${bg}`);
      continue;
    }
    const ratio = contrast(foreground, background);
    if (ratio < minimum) failures.push(`${fg} / ${bg} = ${ratio.toFixed(2)}:1 < ${minimum}:1`);
  }
  return failures;
}

describe('设计令牌：结构与约束', () => {
  test('浅色与深色都定义了完整语义令牌', () => {
    const required = [
      'background',
      'surface',
      'surface-2',
      'sidebar',
      'foreground',
      'muted',
      'muted-foreground',
      'border',
      'border-strong',
      'input',
      'primary',
      'primary-foreground',
      'signal',
      'signal-foreground',
      'ring',
      'success',
      'warning',
      'danger',
      'info',
    ];
    for (const key of required) {
      expect(LIGHT[key]).toBeTruthy();
      expect(DARK[key]).toBeTruthy();
    }
  });

  test('深色不是浅色的简单取反：主色更亮且前景字换成深墨色', () => {
    expect(DARK.primary?.[0]).toBeGreaterThan(LIGHT.primary?.[0] ?? 0);
    expect(DARK['primary-foreground']?.[0]).toBeLessThan(0.3);
    expect(luminance(DARK.primary ?? [0, 0, 0])).toBeGreaterThan(luminance(DARK['primary-foreground'] ?? [0, 0, 0]));
  });

  test('仪器面板：微圆角、暖纸感中性、墨蓝主色、黄铜信号色', () => {
    expect(css).toContain('--radius-md: 3px');
    expect(css).not.toMatch(/--radius-(md|lg|xl):\s*(1[0-9]|[2-9]\d)px/);
    expect(LIGHT.background?.[1]).toBeGreaterThan(0); // 中性色带色相，不是纯灰
    expect(LIGHT.primary?.[2]).toBeGreaterThan(240);
    expect(LIGHT.primary?.[2]).toBeLessThan(270);
    expect(LIGHT.signal?.[2]).toBeGreaterThan(50);
    expect(LIGHT.signal?.[2]).toBeLessThan(90);
  });

  test('离线约束：没有远程字体或 CDN 外链', () => {
    expect(css).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
    expect(css).not.toMatch(/https?:\/\/fonts\./);
  });

  test('可访问性基础设施齐全', () => {
    expect(css).toContain('@custom-variant dark');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).toContain('color-scheme: light');
    expect(css).toContain('color-scheme: dark');
  });

  test('语义令牌都映射到了 Tailwind @theme，工具类才生效', () => {
    for (const token of [
      '--color-signal',
      '--color-surface',
      '--color-sidebar',
      '--color-border-strong',
      '--color-syntax-key',
      '--color-success',
    ]) {
      expect(css).toContain(`${token}:`);
    }
  });
});

describe('设计令牌：WCAG AA 对比度', () => {
  test('浅色主题全部达标', () => {
    expect(validate(LIGHT)).toEqual([]);
  });

  test('深色主题全部达标', () => {
    expect(validate(DARK)).toEqual([]);
  });
});

describe('设计系统：语义类覆盖与回归保护', () => {
  test('兼容别名层已移除，配色只由语义令牌提供', () => {
    expect(css).not.toContain('兼容别名');
    for (const token of ['amber', 'emerald', 'red', 'sky', 'violet']) {
      expect(css).not.toContain(`--color-${token}-600`);
    }
    for (const token of [
      '--color-warning',
      '--color-success',
      '--color-danger',
      '--color-info',
      '--color-syntax-key',
    ]) {
      expect(css).toContain(`${token}: var(--`);
    }
  });

  test('模态遮罩有独立令牌，全局焦点环由 base 层统一提供', () => {
    expect(css).toContain('--color-scrim: var(--scrim)');
    expect(LIGHT.scrim).toBeTruthy();
    expect(DARK.scrim).toBeTruthy();
    expect(css).toContain('outline: 2px solid var(--ring)');
  });

  test('全项目源码零残留默认调色板类名与降透明度的正文', () => {
    const dirs = ['../app/tools/', '../app/lib/', '../app/components/ui/', '../app/components/'];
    const files = dirs.flatMap((dir) => {
      const absolute = fileURLToPath(new URL(dir, import.meta.url));
      return readdirSync(absolute)
        .filter((file) => /\.(ts|tsx)$/.test(file))
        .map((file) => `${absolute}${file}`);
    });
    files.push(fileURLToPath(new URL('../app/AppShell.tsx', import.meta.url)));

    const legacy =
      /\b(?:text|bg|border|fill|stroke|decoration|ring|outline|divide|from|to|via)-(?:amber|emerald|sky|fuchsia|red|rose|orange|violet|green|blue|yellow|teal|purple|lime|indigo|cyan|pink|slate|zinc|gray|stone|neutral)-\d{3}\b|\btext-(?:muted-)?foreground\/\d{1,3}\b/;

    expect(files.length).toBeGreaterThan(80);
    for (const file of files) {
      const hit = legacy.exec(readFileSync(file, 'utf8'))?.[0] ?? null;
      expect(hit).toBeNull();
    }
  });

  test('共享组件与全局外壳不残留默认皮肤类名', () => {
    const uiDir = fileURLToPath(new URL('../app/components/ui/', import.meta.url));
    const componentDir = fileURLToPath(new URL('../app/components/', import.meta.url));
    const files = [
      ...readdirSync(uiDir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => `${uiDir}${file}`),
      ...readdirSync(componentDir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => `${componentDir}${file}`),
      fileURLToPath(new URL('../app/AppShell.tsx', import.meta.url)),
    ];
    const legacy =
      /\bbg-(?:white|black|card)\b|\brounded-(?:md|lg|xl|full)\b|\bshadow-2xl\b|focus-visible:outline-none/;

    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const hit = legacy.exec(readFileSync(file, 'utf8'))?.[0] ?? null;
      expect(hit).toBeNull();
    }
  });
});
