/** 占位图生成：SVG 源码构造 + Lorem 文本，全部纯函数。 */

export type PlaceholderFormat = 'svg' | 'png' | 'jpeg' | 'webp';

export type PlaceholderPattern = 'none' | 'grid' | 'diagonal' | 'dots' | 'noise' | 'checker';

export interface PlaceholderOptions {
  width: number;
  height: number;
  background: string;
  foreground: string;
  /** 圆角（0 表示直角） */
  radius: number;
  /** 边框宽度 */
  borderWidth: number;
  borderColor: string;
  title: string;
  subtitle: string;
  pattern: PlaceholderPattern;
  patternColor: string;
  patternOpacity: number;
  /** 整体不透明度 0~1 */
  opacity: number;
  /** 标题字号（px） */
  fontSize: number;
  subtitleSize: number;
  /** 渐变背景（从 background 到 secondary） */
  gradient: boolean;
  secondary: string;
}

export const SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '1200×630 Open Graph', width: 1200, height: 630 },
  { label: '1920×1080 桌面壁纸', width: 1920, height: 1080 },
  { label: '1080×1080 方形封面', width: 1080, height: 1080 },
  { label: '800×600 缩略图', width: 800, height: 600 },
  { label: '600×315 博客头图', width: 600, height: 315 },
  { label: '300×200 列表占位', width: 300, height: 200 },
  { label: '128×128 图标', width: 128, height: 128 },
  { label: '64×64 favicon', width: 64, height: 64 },
];

export const FORMAT_OPTIONS: { value: PlaceholderFormat; label: string; mime: string; ext: string }[] = [
  { value: 'svg', label: 'SVG（矢量）', mime: 'image/svg+xml', ext: 'svg' },
  { value: 'png', label: 'PNG（无损）', mime: 'image/png', ext: 'png' },
  { value: 'jpeg', label: 'JPEG（有损）', mime: 'image/jpeg', ext: 'jpg' },
  { value: 'webp', label: 'WebP（有损）', mime: 'image/webp', ext: 'webp' },
];

export const PATTERN_OPTIONS: { value: PlaceholderPattern; label: string }[] = [
  { value: 'none', label: '纯色' },
  { value: 'grid', label: '网格' },
  { value: 'diagonal', label: '斜纹' },
  { value: 'dots', label: '圆点' },
  { value: 'noise', label: '噪点' },
  { value: 'checker', label: '棋盘格' },
];

export const DEFAULT_OPTIONS: PlaceholderOptions = {
  width: 1200,
  height: 630,
  background: '#1e293b',
  foreground: '#e2e8f0',
  radius: 12,
  borderWidth: 0,
  borderColor: '#0f172a',
  title: '占位图',
  subtitle: '1200 × 630',
  pattern: 'grid',
  patternColor: '#64748b',
  patternOpacity: 0.35,
  opacity: 1,
  fontSize: 0,
  subtitleSize: 0,
  gradient: true,
  secondary: '#334155',
};

/** SVG 中必须转义的字符。 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** base64 编码 UTF-8 文本（分块避免 apply 参数过大）。 */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 生成 data URI，可选 URI 编码（对老浏览器更兼容）与 base64。 */
export function svgToDataUri(svg: string, useBase64 = true): string {
  if (useBase64) return `data:image/svg+xml;base64,${encodeBase64(svg)}`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}`;
}

/** 按画布尺寸自动挑选一个不会溢出的标题字号。 */
function resolveFontSize(options: PlaceholderOptions): number {
  if (options.fontSize > 0) return options.fontSize;
  const shortest = Math.min(options.width, options.height);
  return Math.max(12, Math.round(shortest * 0.11));
}

function resolveSubtitleSize(options: PlaceholderOptions, titleSize: number): number {
  if (options.subtitleSize > 0) return options.subtitleSize;
  return Math.max(10, Math.round(titleSize * 0.42));
}

/** 噪点用确定性伪随机，保证同一参数生成结果一致。 */
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** 生成图案层的 SVG 内容。defs 已提前收集，因此这里只返回覆盖矩形。 */
function buildPattern(options: PlaceholderOptions, defs: string[]): string {
  const { pattern, width, height } = options;
  const color = options.patternColor;
  const opacity = Math.min(1, Math.max(0, options.patternOpacity));
  if (pattern === 'none') return '';

  // 图案单元尺寸随画布缩放，小图标不至于被线条淹没
  const unit = Math.max(8, Math.round(Math.min(width, height) / 24));

  if (pattern === 'grid') {
    const id = 'ph-grid';
    defs.push(
      `<pattern id="${id}" width="${unit}" height="${unit}" patternUnits="userSpaceOnUse">` +
        `<path d="M ${unit} 0 L 0 0 0 ${unit}" fill="none" stroke="${color}" stroke-width="1"/></pattern>`,
    );
    return `<rect width="${width}" height="${height}" fill="url(#${id})" opacity="${opacity}"/>`;
  }

  if (pattern === 'diagonal') {
    const id = 'ph-diagonal';
    const gap = Math.max(6, Math.round(unit * 0.7));
    defs.push(
      `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="${gap}" stroke="${color}" stroke-width="${Math.max(2, Math.round(unit * 0.22))}"/></pattern>`,
    );
    return `<rect width="${width}" height="${height}" fill="url(#${id})" opacity="${opacity}"/>`;
  }

  if (pattern === 'dots') {
    const id = 'ph-dots';
    const r = Math.max(1, Math.round(unit * 0.13));
    defs.push(
      `<pattern id="${id}" width="${unit}" height="${unit}" patternUnits="userSpaceOnUse">` +
        `<circle cx="${r}" cy="${r}" r="${r}" fill="${color}"/></pattern>`,
    );
    return `<rect width="${width}" height="${height}" fill="url(#${id})" opacity="${opacity}"/>`;
  }

  if (pattern === 'checker') {
    const id = 'ph-checker';
    const size = Math.max(8, Math.round(unit * 0.9));
    defs.push(
      `<pattern id="${id}" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse">` +
        `<rect width="${size}" height="${size}" fill="${color}"/>` +
        `<rect x="${size}" y="${size}" width="${size}" height="${size}" fill="${color}"/></pattern>`,
    );
    return `<rect width="${width}" height="${height}" fill="url(#${id})" opacity="${round(opacity * 0.6)}"/>`;
  }

  // noise：用 feTurbulence 滤镜生成随机噪点，seed 固定保证结果可复现
  const id = 'ph-noise';
  const seed = Math.round(pseudoRandom(width + height) * 100);
  defs.push(
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}"/>` +
      '<feColorMatrix type="saturate" values="0"/></filter>',
  );
  return `<rect width="${width}" height="${height}" filter="url(#${id})" opacity="${round(opacity * 0.5)}"/>`;
}

/** 通用无衬线字体栈，同时兼顾中英文。 */
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** 生成完整的 SVG 源码：结构化、可读、带描边保证文字在任意底色上清晰。 */
export function buildPlaceholderSvg(options: PlaceholderOptions): string {
  const { width, height, background, foreground } = options;
  const defs: string[] = [];

  if (options.gradient) {
    defs.push(
      '<linearGradient id="ph-bg" x1="0%" y1="0%" x2="100%" y2="100%">' +
        `<stop offset="0%" stop-color="${background}"/>` +
        `<stop offset="100%" stop-color="${options.secondary}"/>` +
        '</linearGradient>',
    );
  }
  if (options.radius > 0) {
    defs.push(
      `<clipPath id="ph-clip"><rect x="0" y="0" width="${width}" height="${height}" ` +
        `rx="${options.radius}" ry="${options.radius}"/></clipPath>`,
    );
  }
  // 图案需要把 <pattern>/<filter> 注入 defs，必须先生成再输出 defs
  const patternMarkup = buildPattern(options, defs);

  const titleSize = resolveFontSize(options);
  const subtitleSize = resolveSubtitleSize(options, titleSize);
  const strokeWidth = Math.max(1, Math.round(titleSize * 0.09));
  const hasTitle = options.title.trim().length > 0;
  const hasSubtitle = options.subtitle.trim().length > 0;
  const centerY = height / 2;
  const titleY = hasSubtitle ? centerY - titleSize * 0.28 : centerY + titleSize * 0.34;

  const body: string[] = [];
  body.push(`<rect width="${width}" height="${height}" fill="${options.gradient ? 'url(#ph-bg)' : background}"/>`);
  if (patternMarkup) body.push(patternMarkup);
  if (options.borderWidth > 0) {
    body.push(
      `<rect x="${round(options.borderWidth / 2)}" y="${round(options.borderWidth / 2)}" ` +
        `width="${Math.max(0, width - options.borderWidth)}" height="${Math.max(0, height - options.borderWidth)}" ` +
        `fill="none" stroke="${options.borderColor}" stroke-width="${options.borderWidth}"` +
        (options.radius > 0 ? ` rx="${Math.max(0, options.radius - options.borderWidth / 2)}"` : '') +
        '/>',
    );
  }

  const text: string[] = [];
  if (hasTitle) {
    text.push(
      `<text x="${round(width / 2)}" y="${round(titleY)}" font-family="${FONT_STACK}" font-size="${titleSize}" ` +
        `font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${foreground}" ` +
        `stroke="${background}" stroke-width="${strokeWidth}" paint-order="stroke" stroke-linejoin="round">` +
        `${escapeXml(options.title)}</text>`,
    );
  }
  if (hasSubtitle) {
    text.push(
      `<text x="${round(width / 2)}" y="${round(titleY + titleSize * 0.95)}" font-family="${FONT_STACK}" ` +
        `font-size="${subtitleSize}" font-weight="400" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="${foreground}" fill-opacity="0.78" stroke="${background}" stroke-width="${round(strokeWidth * 0.7)}" ` +
        `paint-order="stroke" stroke-linejoin="round">${escapeXml(options.subtitle)}</text>`,
    );
  }
  if (text.length > 0) body.push(text.join(''));

  const clipped = options.radius > 0 ? `<g clip-path="url(#ph-clip)">${body.join('')}</g>` : body.join('');
  const opacity = Math.min(1, Math.max(0, options.opacity));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
      `role="img" aria-label="${escapeXml(options.title || '占位图')}">`,
    `<title>${escapeXml(options.title || '占位图')}</title>`,
    defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '',
    opacity < 1 ? `<g opacity="${round(opacity)}">${clipped}</g>` : clipped,
    '</svg>',
  ].join('');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const LOREM_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
];

/** 生成一段 Lorem 占位文案，random 为 false 时返回固定开头。 */
export function loremText(random = true, sentences = 2): string {
  const build = () => {
    const count = 4 + Math.floor(Math.random() * 5);
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      words.push(LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]);
    }
    const text = words.join(' ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  };
  if (!random) return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
  return Array.from({ length: Math.max(1, sentences) }, build).join(' ');
}

/** 中英文混排的随机标题，占位图更贴近真实内容。 */
export function randomPlaceholderTitle(random = true): string {
  if (!random) return '占位图';
  const zh = ['占位图', '示意图', '预览图', '暂无图片', '示例封面', '加载中'];
  const en = ['Placeholder', 'Preview', 'Sample', 'No Image', 'Cover Art', 'Loading'];
  const pair = Math.floor(Math.random() * zh.length);
  return Math.random() > 0.4 ? `${zh[pair]} ${en[pair]}` : zh[pair];
}

export function randomPlaceholderSubtitle(width: number, height: number, random = true): string {
  if (!random) return `${width} × ${height}`;
  const formats = ['PNG', 'JPG', 'WEBP', 'AVIF'];
  const format = formats[Math.floor(Math.random() * formats.length)];
  return `${width} × ${height} · ${format}`;
}

/** 输出文件名，例如 placeholder-1200x630.png */
export function placeholderFileName(options: PlaceholderOptions, ext: string): string {
  return `placeholder-${options.width}x${options.height}.${ext}`;
}

/** CSS 用法片段。 */
export function cssSnippet(dataUri: string, className = 'placeholder'): string {
  return [
    `.${className} {`,
    `  background-image: url("${dataUri}");`,
    '  background-size: cover;',
    '  background-position: center;',
    '  background-repeat: no-repeat;',
    '}',
  ].join('\n');
}

/** <picture> / srcset 用法片段。 */
export function pictureSnippet(dataUri: string, svgName = 'placeholder.svg', pngName = 'placeholder.png'): string {
  return [
    '<picture>',
    `  <source srcset="/img/${svgName}" type="image/svg+xml" />`,
    `  <img src="/img/${pngName}" alt="占位图" loading="lazy" decoding="async" />`,
    '</picture>',
    '',
    '/* 若必须内联，可用 data URI： */',
    `<img src="${dataUri}" alt="占位图" />`,
  ].join('\n');
}

export function markdownSnippet(dataUri: string, alt = '占位图'): string {
  return `![${alt}](${dataUri})`;
}

export function xhtmlSnippet(dataUri: string): string {
  return `<img src="${dataUri}" width="1200" height="630" alt="占位图" style="max-width:100%;height:auto" />`;
}
