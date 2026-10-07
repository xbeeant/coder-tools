/** 颜色转换核心：HEX / RGB / HSL / HSV / CMYK / LAB / LCH / OKLab / OKLCH 双向互转。 */

export interface RGB {
  /** 0-255 */
  r: number;
  /** 0-255 */
  g: number;
  /** 0-255 */
  b: number;
  /** 0-1 */
  a: number;
}

export interface HSL {
  /** 0-360 */
  h: number;
  /** 0-100 */
  s: number;
  /** 0-100 */
  l: number;
  /** 0-1 */
  a: number;
}

export interface HSV {
  h: number;
  /** 0-100 */
  s: number;
  /** 0-100 */
  v: number;
  a: number;
}

export interface CMYK {
  /** 0-100 */
  c: number;
  m: number;
  y: number;
  k: number;
  a: number;
}

export interface LAB {
  /** 0-100 */
  l: number;
  /** 约 -128 ~ 127 */
  a: number;
  /** 约 -128 ~ 127 */
  b: number;
  alpha: number;
}

export interface LCH {
  /** 0-100 */
  l: number;
  /** 0 ~ 150+ */
  c: number;
  /** 0-360 */
  h: number;
  alpha: number;
}

export interface OKLab {
  /** 0-1 */
  l: number;
  a: number;
  b: number;
  alpha: number;
}

export interface OKLCH {
  /** 0-1 */
  l: number;
  c: number;
  /** 0-360 */
  h: number;
  alpha: number;
}

/** CSS Level 4 命名色（148 条）。 */
export const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

/** HEX 值 → 命名色（含 grey/gray、aqua/cyan 等别名）。 */
const NAMED_LOOKUP = (() => {
  const map = new Map<string, string>();
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    const key = hex.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return map;
})();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function clampChannel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

/** 解析任意格式的颜色字符串，失败返回 null。 */
export function parseColor(input: string): RGB | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const named = NAMED_COLORS[text];
  if (named) return parseColor(named);

  if (text.startsWith('#')) return parseHex(text);
  if (text.startsWith('rgb')) return parseRgbFunction(text);
  if (text.startsWith('hsl')) return parseHslFunction(text);
  if (text.startsWith('hsb') || text.startsWith('hsv')) return parseHsvFunction(text);
  if (text.startsWith('cmyk')) return parseCmykFunction(text);
  if (text.startsWith('oklch')) return parseOklchFunction(text);
  if (text.startsWith('oklab')) return parseOklabFunction(text);
  if (text.startsWith('lab')) return parseLabFunction(text);
  if (text.startsWith('lch')) return parseLchFunction(text);
  return null;
}

export function parseHex(text: string): RGB | null {
  const body = text.replace(/^#/, '');
  if (!/^[0-9a-f]+$/.test(body)) return null;
  const expand = (value: string) => Number.parseInt(value.length === 1 ? value + value : value, 16);
  if (body.length === 3 || body.length === 4) {
    return {
      r: expand(body[0]),
      g: expand(body[1]),
      b: expand(body[2]),
      a: body.length === 4 ? expand(body[3]) / 255 : 1,
    };
  }
  if (body.length === 6 || body.length === 8) {
    return {
      r: Number.parseInt(body.slice(0, 2), 16),
      g: Number.parseInt(body.slice(2, 4), 16),
      b: Number.parseInt(body.slice(4, 6), 16),
      a: body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

function splitArgs(body: string): string[] {
  return body
    .replace(/^\w+\(/, '')
    .replace(/\)$/, '')
    .split(/[,/\s]+/)
    .filter((part) => part.length > 0);
}

function parseAlpha(token: string | undefined): number {
  if (!token) return 1;
  const value = token.endsWith('%') ? Number.parseFloat(token) / 100 : Number.parseFloat(token);
  if (!Number.isFinite(value)) return 1;
  return clamp(value, 0, 1);
}

function parseChannel(token: string | undefined): number {
  if (token === undefined) return 0;
  if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * 255;
  const value = Number.parseFloat(token);
  return Number.isFinite(value) ? value : 0;
}

function parseRgbFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return {
    r: clampChannel(parseChannel(args[0])),
    g: clampChannel(parseChannel(args[1])),
    b: clampChannel(parseChannel(args[2])),
    a: parseAlpha(args[3]),
  };
}

function parseHslFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return hslToRgb({
    h: Number.parseFloat(args[0]) || 0,
    s: Number.parseFloat(args[1]) || 0,
    l: Number.parseFloat(args[2]) || 0,
    a: parseAlpha(args[3]),
  });
}

function parseHsvFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return hsvToRgb({
    h: Number.parseFloat(args[0]) || 0,
    s: Number.parseFloat(args[1]) || 0,
    v: Number.parseFloat(args[2]) || 0,
    a: parseAlpha(args[3]),
  });
}

function parseCmykFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 4) return null;
  return cmykToRgb({
    c: Number.parseFloat(args[0]) || 0,
    m: Number.parseFloat(args[1]) || 0,
    y: Number.parseFloat(args[2]) || 0,
    k: Number.parseFloat(args[3]) || 0,
    a: parseAlpha(args[4]),
  });
}

function parseLabFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return labToRgb({
    l: Number.parseFloat(args[0]) || 0,
    a: Number.parseFloat(args[1]) || 0,
    b: Number.parseFloat(args[2]) || 0,
    alpha: parseAlpha(args[3]),
  });
}

function parseLchFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return lchToRgb({
    l: Number.parseFloat(args[0]) || 0,
    c: Number.parseFloat(args[1]) || 0,
    h: Number.parseFloat(args[2]) || 0,
    alpha: parseAlpha(args[3]),
  });
}

function parseOklabFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return oklabToRgb({
    l: Number.parseFloat(args[0]) || 0,
    a: Number.parseFloat(args[1]) || 0,
    b: Number.parseFloat(args[2]) || 0,
    alpha: parseAlpha(args[3]),
  });
}

function parseOklchFunction(text: string): RGB | null {
  const args = splitArgs(text);
  if (args.length < 3) return null;
  return oklchToRgb({
    l: Number.parseFloat(args[0]) || 0,
    c: Number.parseFloat(args[1]) || 0,
    h: Number.parseFloat(args[2]) || 0,
    alpha: parseAlpha(args[3]),
  });
}

// ── 格式化输出 ──────────────────────────────────────────────

export function rgbToHex({ r, g, b }: RGB): string {
  const part = (value: number) => clampChannel(value).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHex8(rgb: RGB): string {
  const part = (value: number) => clampChannel(value).toString(16).padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}${part(rgb.a * 255)}`;
}

/** 保留原始缩写形式（#abc / #abcd），仅当各通道重复时才缩写。 */
export function rgbToShortHex(rgb: RGB): string {
  const full = rgbToHex(rgb);
  const short = `#${full[1]}${full[3]}${full[5]}`;
  const canShorten = short[1] === full[1] + full[2] && short[2] === full[3] + full[4] && short[3] === full[5] + full[6];
  if (!canShorten) return full;
  if (rgb.a < 1) {
    const alpha = clampChannel(rgb.a * 255)
      .toString(16)
      .padStart(2, '0');
    if (alpha[0] !== alpha[1]) return full;
    return `${short}${alpha[0]}`;
  }
  return short;
}

export function rgbToCssRgb(rgb: RGB): string {
  const { r, g, b } = rgb;
  return rgb.a >= 1
    ? `rgb(${clampChannel(r)} ${clampChannel(g)} ${clampChannel(b)})`
    : `rgb(${clampChannel(r)} ${clampChannel(g)} ${clampChannel(b)} / ${round(rgb.a * 100, 1)}%)`;
}

export function rgbToCssRgba(rgb: RGB): string {
  return `rgba(${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(rgb.b)}, ${round(rgb.a, 3)})`;
}

export function rgbToRgbArray(rgb: RGB): string {
  return `[${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(rgb.b)}]`;
}

export function rgbToRgbObject(rgb: RGB): string {
  return `{ r: ${clampChannel(rgb.r)}, g: ${clampChannel(rgb.g)}, b: ${clampChannel(rgb.b)} }`;
}

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100, a: rgb.a };
}

export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: (max === 0 ? 0 : delta / max) * 100, v: max * 100, a: rgb.a };
}

export function rgbToCmyk(rgb: RGB): CMYK {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100, a: rgb.a };
  return {
    c: ((1 - r - k) / (1 - k)) * 100,
    m: ((1 - g - k) / (1 - k)) * 100,
    y: ((1 - b - k) / (1 - k)) * 100,
    k: k * 100,
    a: rgb.a,
  };
}

export function hslToRgb(hsl: HSL): RGB {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clampChannel((rgb[0] + m) * 255),
    g: clampChannel((rgb[1] + m) * 255),
    b: clampChannel((rgb[2] + m) * 255),
    a: clamp(hsl.a, 0, 1),
  };
}

export function hsvToRgb(hsv: HSV): RGB {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = clamp(hsv.s, 0, 100) / 100;
  const v = clamp(hsv.v, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clampChannel((rgb[0] + m) * 255),
    g: clampChannel((rgb[1] + m) * 255),
    b: clampChannel((rgb[2] + m) * 255),
    a: clamp(hsv.a, 0, 1),
  };
}

export function cmykToRgb(cmyk: CMYK): RGB {
  const c = clamp(cmyk.c, 0, 100) / 100;
  const m = clamp(cmyk.m, 0, 100) / 100;
  const y = clamp(cmyk.y, 0, 100) / 100;
  const k = clamp(cmyk.k, 0, 100) / 100;
  return {
    r: clampChannel(255 * (1 - c) * (1 - k)),
    g: clampChannel(255 * (1 - m) * (1 - k)),
    b: clampChannel(255 * (1 - y) * (1 - k)),
    a: clamp(cmyk.a, 0, 1),
  };
}

// ── XYZ / Lab / LCH ─────────────────────────────────────────

/** sRGB D65 线性化。 */
function srgbToLinear(channel: number): number {
  const c = clamp(channel, 0, 1);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = clamp(channel, 0, 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

// sRGB → XYZ (D65)
const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
// XYZ → sRGB (D65)
const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
// D65 白点
const D65_WHITE: [number, number, number] = [0.95047, 1, 1.08883];

function multiply(matrix: number[][], vector: number[]): number[] {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

export function rgbToXyz(rgb: RGB): [number, number, number] {
  const linear = [srgbToLinear(rgb.r / 255), srgbToLinear(rgb.g / 255), srgbToLinear(rgb.b / 255)];
  const [x, y, z] = multiply(RGB_TO_XYZ, linear);
  return [x, y, z];
}

export function xyzToRgb(xyz: [number, number, number], alpha = 1): RGB {
  const linear = multiply(XYZ_TO_RGB, xyz);
  return {
    r: clampChannel(linearToSrgb(linear[0]) * 255),
    g: clampChannel(linearToSrgb(linear[1]) * 255),
    b: clampChannel(linearToSrgb(linear[2]) * 255),
    a: clamp(alpha, 0, 1),
  };
}

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

function labForward(value: number): number {
  return value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116;
}

function labInverse(value: number): number {
  const cubed = value ** 3;
  return cubed > LAB_EPSILON ? cubed : (116 * value - 16) / LAB_KAPPA;
}

export function rgbToLab(rgb: RGB): LAB {
  const xyz = rgbToXyz(rgb);
  const fx = labForward(xyz[0] / D65_WHITE[0]);
  const fy = labForward(xyz[1] / D65_WHITE[1]);
  const fz = labForward(xyz[2] / D65_WHITE[2]);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz), alpha: rgb.a };
}

export function labToRgb(lab: LAB): RGB {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const xyz: [number, number, number] = [
    labInverse(fx) * D65_WHITE[0],
    labInverse(fy) * D65_WHITE[1],
    labInverse(fz) * D65_WHITE[2],
  ];
  return xyzToRgb(xyz, lab.alpha);
}

export function labToLch(lab: LAB): LCH {
  const c = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.l, c, h, alpha: lab.alpha };
}

export function lchToLab(lch: LCH): LAB {
  const rad = (lch.h * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad), alpha: lch.alpha };
}

export function rgbToLch(rgb: RGB): LCH {
  return labToLch(rgbToLab(rgb));
}

export function lchToRgb(lch: LCH): RGB {
  return labToRgb(lchToLab(lch));
}

// ── OKLab / OKLCH（Björn Ottosson 矩阵）───────────────────────

function linearToOklab(l: number, m: number, s: number): OKLab {
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    alpha: 1,
  };
}

export function rgbToOklab(rgb: RGB): OKLab {
  const r = srgbToLinear(rgb.r / 255);
  const g = srgbToLinear(rgb.g / 255);
  const b = srgbToLinear(rgb.b / 255);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const result = linearToOklab(l, m, s);
  result.alpha = rgb.a;
  return result;
}

export function oklabToRgb(oklab: OKLab): RGB {
  const l_ = oklab.l + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
  const m_ = oklab.l - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
  const s_ = oklab.l - 0.0894841775 * oklab.a - 1.291485548 * oklab.b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return { r: clampChannel(r * 255), g: clampChannel(g * 255), b: clampChannel(b * 255), a: clamp(oklab.alpha, 0, 1) };
}

export function oklabToOklch(oklab: OKLab): OKLCH {
  const c = Math.hypot(oklab.a, oklab.b);
  let h = (Math.atan2(oklab.b, oklab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: oklab.l, c, h, alpha: oklab.alpha };
}

export function oklchToOklab(oklch: OKLCH): OKLab {
  const rad = (oklch.h * Math.PI) / 180;
  return { l: oklch.l, a: oklch.c * Math.cos(rad), b: oklch.c * Math.sin(rad), alpha: oklch.alpha };
}

export function rgbToOklch(rgb: RGB): OKLCH {
  return oklabToOklch(rgbToOklab(rgb));
}

export function oklchToRgb(oklch: OKLCH): RGB {
  return oklabToRgb(oklchToOklab(oklch));
}

// ── 对比度 ──────────────────────────────────────────────────

/** WCAG 2.x 相对亮度。 */
export function relativeLuminance(rgb: RGB): number {
  return 0.2126 * srgbToLinear(rgb.r / 255) + 0.7152 * srgbToLinear(rgb.g / 255) + 0.0722 * srgbToLinear(rgb.b / 255);
}

/** WCAG 对比度，范围 1 ~ 21。 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export const BLACK: RGB = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: RGB = { r: 255, g: 255, b: 255, a: 1 };

/**
 * APCA 0.1.9 (W3) 近似 Lc 值。返回范围约 -108 ~ 106，
 * 正值表示深字浅底（BoW），负值表示浅字深底（WoB）。
 * 这是社区常用的近似实现，与官方数值可能有极小差异。
 */
export function apcaLc(text: RGB, bg: RGB): number {
  const yText = apcaY(text);
  const yBg = apcaY(bg);
  if (Math.abs(yBg - yText) < 0.0005) return 0;
  let output = 0;
  if (yBg > yText) {
    // 深字浅底
    const sapc = (yBg ** 0.56 - yText ** 0.57) * 1.14;
    output = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    // 浅字深底
    const sapc = (yBg ** 0.65 - yText ** 0.62) * 1.14;
    output = sapc > -0.1 ? 0 : sapc + 0.027;
  }
  return output * 100;
}

function apcaY(rgb: RGB): number {
  const r = srgbToLinear(rgb.r / 255);
  const g = srgbToLinear(rgb.g / 255);
  const b = srgbToLinear(rgb.b / 255);
  return 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
}

export interface ContrastReport {
  ratio: number;
  lc: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  uiComponents: boolean;
  bestForeground: 'black' | 'white';
  bestRatio: number;
}

export function contrastReport(color: RGB): ContrastReport {
  const opaque: RGB = { ...color, a: 1 };
  const onBlack = contrastRatio(opaque, BLACK);
  const onWhite = contrastRatio(opaque, WHITE);
  const best = onBlack >= onWhite ? 'black' : 'white';
  const ratio = onBlack >= onWhite ? onBlack : onWhite;
  return {
    ratio,
    lc: apcaLc(best === 'black' ? BLACK : WHITE, opaque),
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    uiComponents: ratio >= 3,
    bestForeground: best,
    bestRatio: ratio,
  };
}

/** 在给定背景上取更易读的前景色（黑或白）。 */
export function readableForeground(bg: RGB): RGB {
  return relativeLuminance(bg) > 0.4 ? BLACK : WHITE;
}

// ── 色阶（类似 Tailwind 50~950）──────────────────────────────

export type RampStep = 50 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export const DEFAULT_RAMP: RampStep[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const RAMP_8: RampStep[] = [50, 100, 200, 300, 500, 700, 900, 950];
const RAMP_10: RampStep[] = [50, 100, 200, 300, 400, 500, 600, 800, 900, 950];
const RAMP_12: RampStep[] = [50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export function rampStepsFor(count: number): RampStep[] {
  switch (count) {
    case 8:
      return RAMP_8;
    case 10:
      return RAMP_10;
    case 12:
      return RAMP_12;
    default:
      return DEFAULT_RAMP;
  }
}

/** 各色阶的目标明度（OKLab L），线性插值自 0.97 到 0.25。 */
function rampLightness(index: number, total: number): number {
  const t = total <= 1 ? 0 : index / (total - 1);
  // 两端压得更狠，中间保留品牌色的明度
  const eased = t ** 0.85;
  return 0.975 - eased * 0.72;
}

/** 极端明度处降低彩度，避免刺眼或发灰。 */
function rampChromaScale(lightness: number): number {
  if (lightness > 0.9) return 0.32 + (1 - lightness) * 3.4;
  if (lightness < 0.35) return 0.72 + lightness * 0.5;
  return 1;
}

/** 生成色阶：保持色相，按明度与彩度曲线展开。 */
export function buildRamp(color: RGB, steps: RampStep[]): { step: RampStep; color: RGB }[] {
  const oklch = rgbToOklch({ ...color, a: 1 });
  const total = steps.length;
  return steps.map((step, index) => {
    const l = rampLightness(index, total);
    const c = oklch.c * rampChromaScale(l);
    const rgb = oklchToRgb({ l, c, h: oklch.h, alpha: 1 });
    // 基准色落在中间档，避免色相偏移
    const isBase = step === 500;
    return { step, color: isBase ? { ...color, a: 1 } : rgb };
  });
}

export function rampToCssVariables(name: string, color: RGB, steps: RampStep[]): string {
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const lines = buildRamp(color, steps).map(({ step, color: c }) => `  --${kebab}-${step}: ${rgbToHex(c)};`);
  return [`:root {`, ...lines, `}`].join('\n');
}

export function rampToJson(color: RGB, steps: RampStep[]): string {
  const data = buildRamp(color, steps).reduce<Record<string, string>>((acc, { step, color: c }) => {
    acc[String(step)] = rgbToHex(c);
    return acc;
  }, {});
  return JSON.stringify(data, null, 2);
}

export function rampToScss(color: RGB, steps: RampStep[]): string {
  return buildRamp(color, steps)
    .map(({ step, color: c }) => `$$color-${step}: ${rgbToHex(c)};`)
    .join('\n');
}

export function rampToTailwind(color: RGB, steps: RampStep[]): string {
  const entries = buildRamp(color, steps)
    .map(({ step, color: c }) => `        '${step}': '${rgbToHex(c)}',`)
    .join('\n');
  return [
    '// tailwind.config.js（v3 写法；v4 请在 CSS 里用 @theme 定义变量）',
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    '      colors: {',
    '        brand: {',
    entries,
    '        },',
    '      },',
    '    },',
    '  },',
    '};',
  ].join('\n');
}

// ── 配色方案 ────────────────────────────────────────────────

export type HarmonyName = 'complementary' | 'analogous' | 'split' | 'triadic' | 'tetradic' | 'square' | 'monochrome';

const HARMONY_LABELS: Record<HarmonyName, string> = {
  complementary: '互补色',
  analogous: '类似色',
  split: '分裂互补',
  triadic: '三配色',
  tetradic: '四配色（矩形）',
  square: '正方形配色',
  monochrome: '单色',
};

export function harmonyLabel(name: HarmonyName): string {
  return HARMONY_LABELS[name];
}

function rotateHue(color: RGB, degrees: number, lightness?: number, chroma?: number): RGB {
  const oklch = rgbToOklch({ ...color, a: 1 });
  return oklchToRgb({
    l: lightness ?? oklch.l,
    c: chroma ?? oklch.c,
    h: (oklch.h + degrees + 360) % 360,
    alpha: 1,
  });
}

/** 生成配色方案；色相旋转都在 OKLCH 空间做，视觉更均匀。 */
export function harmony(base: RGB, name: HarmonyName): RGB[] {
  const opaque = { ...base, a: 1 };
  switch (name) {
    case 'complementary':
      return [opaque, rotateHue(opaque, 180)];
    case 'analogous':
      return [opaque, rotateHue(opaque, -30), rotateHue(opaque, 30)];
    case 'split':
      return [opaque, rotateHue(opaque, 150), rotateHue(opaque, 210)];
    case 'triadic':
      return [opaque, rotateHue(opaque, 120), rotateHue(opaque, 240)];
    case 'tetradic':
      return [opaque, rotateHue(opaque, 60), rotateHue(opaque, 180), rotateHue(opaque, 240)];
    case 'square':
      return [opaque, rotateHue(opaque, 90), rotateHue(opaque, 180), rotateHue(opaque, 270)];
    default:
      return [
        oklchToRgb({ ...rgbToOklch(opaque), l: 0.9, alpha: 1 }),
        oklchToRgb({ ...rgbToOklch(opaque), l: 0.72, alpha: 1 }),
        opaque,
        oklchToRgb({ ...rgbToOklch(opaque), l: 0.45, alpha: 1 }),
        oklchToRgb({ ...rgbToOklch(opaque), l: 0.3, alpha: 1 }),
      ];
  }
}

export const HARMONY_OPTIONS: { name: HarmonyName; label: string }[] = (
  Object.keys(HARMONY_LABELS) as HarmonyName[]
).map((name) => ({ name, label: HARMONY_LABELS[name] }));

/** 在给定色相区间内随机一个基准色，保证随机配色不会退化成一堆灰色。 */
export function randomBaseColor(): RGB {
  const hue = Math.random() * 360;
  // 亮度落在 45~70，彩度落在 45~140，避开过暗与过淡的不可用色
  const lightness = 45 + Math.random() * 25;
  const chroma = 45 + Math.random() * 95;
  return oklchToRgb({ l: lightness, c: chroma, h: hue, alpha: 1 });
}

/** 随机配色；locks 中的颜色保持不变，其余槽位按规则生成。 */
export function randomScheme(rule: HarmonyName, locks: (RGB | null)[]): RGB[] {
  const generated = harmony(randomBaseColor(), rule);
  return generated.map((color, index) => locks[index] ?? color);
}

// ── 渐变 ────────────────────────────────────────────────────

export interface GradientOptions {
  type: 'linear' | 'radial';
  /** 线性角度或径向形状关键字 */
  angle: number;
  stops: RGB[];
  /** 两色之间的中间色数量 */
  midpoints: number;
}

export function gradientCss(options: GradientOptions): string {
  const { type, angle, stops } = options;
  if (stops.length < 2) return '';
  const parts: string[] = [];
  if (type === 'radial') {
    parts.push('radial-gradient(circle at 50% 50%');
  } else {
    parts.push(`linear-gradient(${round(angle, 0)}deg`);
  }
  const segments = interpolateStops(stops, options.midpoints);
  for (const segment of segments) {
    parts.push(`  ${rgbToHex(segment.color)} ${round(segment.position * 100, 1)}%`);
  }
  return `${parts.join(',\n')})`;
}

/** 在相邻色之间按 OKLCH 线性插值，生成均匀的多停靠点。 */
export function interpolateStops(stops: RGB[], midpoints: number): { color: RGB; position: number }[] {
  if (stops.length === 0) return [];
  if (stops.length === 1) return [{ color: stops[0], position: 0 }];
  const extra = Math.max(0, Math.floor(midpoints));
  const result: { color: RGB; position: number }[] = [];
  const totalSegments = stops.length - 1;
  for (let i = 0; i < totalSegments; i++) {
    const from = rgbToOklch({ ...stops[i], a: 1 });
    const to = rgbToOklch({ ...stops[i + 1], a: 1 });
    for (let j = 0; j <= extra; j++) {
      const t = j / (extra + 1);
      const position = (i + t) / totalSegments;
      const oklch: OKLCH = {
        l: from.l + (to.l - from.l) * t,
        c: from.c + (to.c - from.c) * t,
        // 色相走最短弧，避免经过灰色区
        h: shortestHue(from.h, to.h, t),
        alpha: 1,
      };
      result.push({ color: oklchToRgb(oklch), position });
    }
  }
  result.push({ color: { ...stops[stops.length - 1], a: 1 }, position: 1 });
  // 修正浮点漂移，确保首尾精确为 0 / 1
  if (result.length > 0) {
    result[0].position = 0;
    result[result.length - 1].position = 1;
  }
  return result;
}

function shortestHue(from: number, to: number, t: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (from + delta * t + 360) % 360;
}

// ── 从图片取色 ──────────────────────────────────────────────

/** 简易 k-means：把像素聚成 k 类，返回每类的平均色。 */
export function kMeansPalette(pixels: Uint8ClampedArray, k: number, iterations = 12): RGB[] {
  const samples: number[] = [];
  // 抽样以控制运算量
  const stride = Math.max(1, Math.floor(pixels.length / 4 / 4000));
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    if (pixels[i + 3] < 125) continue;
    samples.push(pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  const count = samples.length / 3;
  if (count === 0) return [];

  const clusters = Math.max(1, Math.min(k, count));
  const centroids: number[] = [];
  // 确定性初始化：按亮度排序后等距取样，并跳过与已有质心完全重复的像素，
  // 否则小图 / 大面积纯色图会初始化出重复质心，导致聚类数少于 k
  const luminance = (index: number) => samples[index * 3] + samples[index * 3 + 1] + samples[index * 3 + 2];
  const sorted = Array.from({ length: count }, (_, i) => i).sort((a, b) => luminance(a) - luminance(b));
  const same = (index: number) =>
    centroids.length > 0 &&
    centroids.every(
      (_, c) =>
        centroids[c * 3] === samples[index] &&
        centroids[c * 3 + 1] === samples[index + 1] &&
        centroids[c * 3 + 2] === samples[index + 2],
    );
  for (let i = 0; i < clusters; i++) {
    let picked = -1;
    // 先按理想位置取，再向外扩展，避开重复
    const start = Math.floor((i / clusters) * count);
    for (let offset = 0; offset < count && picked < 0; offset++) {
      for (const candidate of offset === 0 ? [start] : [start + offset, start - offset]) {
        const index = sorted[candidate];
        if (index === undefined) continue;
        if (same(index)) continue;
        picked = index;
        break;
      }
    }
    if (picked < 0) break;
    centroids.push(samples[picked] ?? 0, samples[picked + 1] ?? 0, samples[picked + 2] ?? 0);
  }
  // 全部像素同色时保证至少有一个质心
  if (centroids.length === 0) centroids.push(samples[0] ?? 0, samples[1] ?? 0, samples[2] ?? 0);
  const clusterCount = centroids.length / 3;

  const assign = new Int32Array(count);
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const r = samples[i * 3];
      const g = samples[i * 3 + 1];
      const b = samples[i * 3 + 2];
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let c = 0; c < clusterCount; c++) {
        const dr = r - centroids[c * 3];
        const dg = g - centroids[c * 3 + 1];
        const db = b - centroids[c * 3 + 2];
        // 加权距离，绿色差异更敏感
        const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = c;
        }
      }
      if (assign[i] !== bestIndex) {
        assign[i] = bestIndex;
        moved = true;
      }
    }
    const sums = new Float64Array(clusterCount * 3);
    const hits = new Int32Array(clusterCount);
    for (let i = 0; i < count; i++) {
      const c = assign[i];
      sums[c * 3] += samples[i * 3];
      sums[c * 3 + 1] += samples[i * 3 + 1];
      sums[c * 3 + 2] += samples[i * 3 + 2];
      hits[c] += 1;
    }
    for (let c = 0; c < clusterCount; c++) {
      if (hits[c] === 0) continue;
      centroids[c * 3] = sums[c * 3] / hits[c];
      centroids[c * 3 + 1] = sums[c * 3 + 1] / hits[c];
      centroids[c * 3 + 2] = sums[c * 3 + 2] / hits[c];
    }
    if (!moved && iter > 0) break;
  }

  const counts = new Int32Array(clusterCount);
  for (let i = 0; i < count; i++) counts[assign[i]!]! += 1;

  return centroids
    .map((_, c) => ({
      color: {
        r: clampChannel(centroids[c * 3]),
        g: clampChannel(centroids[c * 3 + 1]),
        b: clampChannel(centroids[c * 3 + 2]),
        a: 1,
      } satisfies RGB,
      count: counts[c]!,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.color);
}

export function averageColor(pixels: Uint8ClampedArray): RGB | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const stride = Math.max(1, Math.floor(pixels.length / 4 / 20000));
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    if (pixels[i + 3] < 125) continue;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    n += 1;
  }
  if (n === 0) return null;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: 1 };
}

/**
 * Vibrant 色：兼顾饱和度与明度偏离平均色的程度。
 * 这是简化版「vibrant」策略，不等同 Android Palettable 的完整实现。
 */
export function vibrantColor(pixels: Uint8ClampedArray): RGB | null {
  const avg = averageColor(pixels);
  if (!avg) return null;
  let best: RGB | null = null;
  let bestScore = -Infinity;
  const stride = Math.max(1, Math.floor(pixels.length / 4 / 20000));
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    if (pixels[i + 3] < 125) continue;
    const candidate: RGB = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: 1 };
    const hsv = rgbToHsv(candidate);
    if (hsv.s < 18 || hsv.v < 12 || hsv.v > 96) continue;
    const dist = Math.hypot(candidate.r - avg.r, candidate.g - avg.g, candidate.b - avg.b);
    const score = hsv.s * 1.4 + dist * 0.32 - Math.abs(hsv.v - 55) * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? avg;
}

// ── 代码生成 ────────────────────────────────────────────────

function cssName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'color'
  );
}

export function toCssVariable(color: RGB, name = 'brand'): string {
  const hsl = rgbToHsl(color);
  return [
    `/* ${rgbToHex(color)} */`,
    `--${cssName(name)}: ${rgbToHex(color)};`,
    `--${cssName(name)}-rgb: ${rgbToRgbArray(color)};`,
    `--${cssName(name)}-hsl: ${round(hsl.h, 1)} ${round(hsl.s, 1)}% ${round(hsl.l, 1)}%;`,
    color.a < 1 ? `--${cssName(name)}-alpha: ${round(color.a, 3)};` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function toCssVariablesBlock(colors: RGB[], name = 'brand'): string {
  const lines = [':root {'];
  colors.forEach((color, index) => {
    const key = colors.length === 1 ? cssName(name) : `${cssName(name)}-${index + 1}`;
    lines.push(`  --${key}: ${rgbToHex(color)};`);
    if (color.a < 1) lines.push(`  --${key}-alpha: ${round(color.a, 3)};`);
  });
  lines.push('}');
  return lines.join('\n');
}

export function toJson(colors: RGB[]): string {
  return JSON.stringify(
    colors.map((color) => ({
      hex: rgbToHex(color),
      hex8: rgbToHex8(color),
      rgb: { r: clampChannel(color.r), g: clampChannel(color.g), b: clampChannel(color.b), a: round(color.a, 3) },
      hsl: {
        h: round(rgbToHsl(color).h, 1),
        s: round(rgbToHsl(color).s, 1),
        l: round(rgbToHsl(color).l, 1),
      },
      oklch: {
        l: round(rgbToOklch(color).l * 100, 2),
        c: round(rgbToOklch(color).c, 4),
        h: round(rgbToOklch(color).h, 1),
      },
      css: rgbToCssRgb(color),
    })),
    null,
    2,
  );
}

export function toScssVariables(colors: RGB[], name = 'palette'): string {
  const prefix = cssName(name).replace(/-/g, '_');
  return colors.map((color, index) => `$${prefix}-${index + 1}: ${rgbToHex(color)};`).join('\n');
}

export function toTailwindConfig(colors: RGB[], name = 'palette'): string {
  const entries = colors.map((color, index) => `        '${index + 1}': '${rgbToHex(color)}',`).join('\n');
  return [
    'module.exports = {',
    '  theme: {',
    '    extend: {',
    '      colors: {',
    `        ${cssName(name)}: {`,
    entries,
    '        },',
    '      },',
    '    },',
    '  },',
    '};',
  ].join('\n');
}

export function toSwift(color: RGB): string {
  return `UIColor(red: ${round(color.r / 255, 3)}, green: ${round(color.g / 255, 3)}, blue: ${round(
    color.b / 255,
    3,
  )}, alpha: ${round(color.a, 3)})`;
}

export function toKotlin(color: RGB): string {
  return `Color(0xFF${rgbToHex8(color).slice(1).toUpperCase()})`;
}

export function toJava(color: RGB): string {
  return `new Color(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}, ${round(color.a, 3)})`;
}

export function toObjC(color: RGB): string {
  return `[UIColor colorWithRed:${round(color.r / 255, 3)} green:${round(color.g / 255, 3)} blue:${round(
    color.b / 255,
    3,
  )} alpha:${round(color.a, 3)}]`;
}

export function toSwiftUIColor(color: RGB): string {
  return `Color(red: ${round(color.r / 255, 3)}, green: ${round(color.g / 255, 3)}, blue: ${round(color.b / 255, 3)})`;
}

/** 若颜色命中命名色表则返回小写名称，否则 null。 */
export function toNamedColor(color: RGB): string | null {
  if (color.a < 1) return null;
  return NAMED_LOOKUP.get(rgbToHex(color)) ?? null;
}

export function cssValue(color: RGB): string {
  if (color.a <= 0) return 'transparent';
  return rgbToHex(color);
}

// ── 输出汇总 ────────────────────────────────────────────────

export interface ColorFormats {
  hex: string;
  hexShort: string;
  hex8: string;
  rgb: string;
  rgba: string;
  rgbArray: string;
  rgbObject: string;
  hsl: string;
  hsla: string;
  hsv: string;
  cmyk: string;
  lab: string;
  lch: string;
  oklch: string;
  oklab: string;
  named: string;
  css: string;
  swift: string;
  swiftUI: string;
  kotlin: string;
  java: string;
  objc: string;
  cssVariable: string;
}

export function formatAll(color: RGB, name = 'brand'): ColorFormats {
  const hsl = rgbToHsl(color);
  const hsv = rgbToHsv(color);
  const cmyk = rgbToCmyk(color);
  const lab = rgbToLab(color);
  const lch = labToLch(lab);
  const oklch = rgbToOklch(color);
  const oklab = rgbToOklab(color);
  return {
    hex: rgbToHex(color),
    hexShort: rgbToShortHex(color),
    hex8: rgbToHex8(color),
    rgb: rgbToCssRgb(color),
    rgba: rgbToCssRgba(color),
    rgbArray: rgbToRgbArray(color),
    rgbObject: rgbToRgbObject(color),
    hsl: `hsl(${round(hsl.h, 1)} ${round(hsl.s, 1)}% ${round(hsl.l, 1)}%)`,
    hsla: `hsla(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%, ${round(hsl.a, 3)})`,
    hsv: `hsv(${round(hsv.h, 1)} ${round(hsv.s, 1)}% ${round(hsv.v, 1)}%)`,
    cmyk: `cmyk(${round(cmyk.c, 1)}% ${round(cmyk.m, 1)}% ${round(cmyk.y, 1)}% ${round(cmyk.k, 1)}%)`,
    lab: `lab(${round(lab.l, 2)} ${round(lab.a, 2)} ${round(lab.b, 2)})`,
    lch: `lch(${round(lch.l, 2)} ${round(lch.c, 2)} ${round(lch.h, 1)})`,
    oklch: `oklch(${round(oklch.l * 100, 2)}% ${round(oklch.c, 4)} ${round(oklch.h, 1)})`,
    oklab: `oklab(${round(oklab.l, 4)} ${round(oklab.a, 4)} ${round(oklab.b, 4)})`,
    named: toNamedColor(color) ?? '—（不在命名色表内）',
    css: cssValue(color),
    swift: toSwift(color),
    swiftUI: toSwiftUIColor(color),
    kotlin: toKotlin(color),
    java: toJava(color),
    objc: toObjC(color),
    cssVariable: toCssVariable(color, name),
  };
}

export function mixColors(a: RGB, b: RGB, ratio: number): RGB {
  const t = clamp(ratio, 0, 1);
  return {
    r: clampChannel(a.r + (b.r - a.r) * t),
    g: clampChannel(a.g + (b.g - a.g) * t),
    b: clampChannel(a.b + (b.b - a.b) * t),
    a: clamp(a.a + (b.a - a.a) * t, 0, 1),
  };
}

/** 统一小写展示，避免混用。 */
export function normalizeInput(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
