/** Punycode (RFC 3492) 纯 JS 实现，用于国际化域名编解码。 */

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';

const MAX_INT = 0x7fffffff;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function digitToBasic(digit: number): string {
  // 0-25 => a-z, 26-35 => 0-9
  return String.fromCharCode(digit + 22 + (digit < 26 ? 75 : 0));
}

function basicToDigit(codePoint: number): number {
  if (codePoint >= 0x30 && codePoint <= 0x39) return codePoint - 0x16;
  if (codePoint >= 0x41 && codePoint <= 0x5a) return codePoint - 0x41;
  if (codePoint >= 0x61 && codePoint <= 0x7a) return codePoint - 0x61;
  return BASE;
}

export function punycodeEncode(input: string): string {
  const codePoints = Array.from(input, (c) => c.codePointAt(0) as number);
  const basic = codePoints.filter((c) => c < INITIAL_N);
  let output = basic.map((c) => String.fromCodePoint(c)).join('');

  let handled = basic.length;
  const basicLength = handled;
  if (basic.length > 0) output += DELIMITER;

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (handled < codePoints.length) {
    let m = MAX_INT;
    for (const codePoint of codePoints) if (codePoint >= n && codePoint < m) m = codePoint;

    delta += (m - n) * (handled + 1);
    n = m;

    for (const codePoint of codePoints) {
      if (codePoint < n) {
        delta += 1;
        if (delta > MAX_INT) throw new RangeError('Punycode 编码溢出');
      } else if (codePoint === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          output += digitToBasic(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        output += digitToBasic(q);
        bias = adapt(delta, handled + 1, handled === basicLength);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }

  return output;
}

export function punycodeDecode(input: string): string {
  const output: number[] = [];
  const index = input.lastIndexOf(DELIMITER);
  if (index > 0) {
    for (let i = 0; i < index; i++) {
      const codePoint = input.codePointAt(i) as number;
      if (codePoint >= INITIAL_N) throw new Error('Punycode 解码失败：基本码部分包含非 ASCII 字符');
      output.push(codePoint);
    }
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let pos = index > 0 ? index + 1 : 0;

  while (pos < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (pos >= input.length) throw new Error('Punycode 解码失败：输入意外结束');
      const digit = basicToDigit(input.codePointAt(pos) as number);
      pos += 1;
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    n += Math.floor(i / out);
    i %= out;
    if (n > MAX_INT) throw new RangeError('Punycode 解码溢出');
    output.splice(i, 0, n);
    i += 1;
  }

  return output.map((c) => String.fromCodePoint(c)).join('');
}

/** 逐标签转换域名：非 ASCII 标签加 xn-- 前缀，ASCII 标签原样保留。 */
export function domainToAscii(domain: string): string {
  return domain
    .split('.')
    .map((label) => (label.length === 0 ? label : /[^\0-\x7f]/.test(label) ? `xn--${punycodeEncode(label)}` : label))
    .join('.');
}

export function domainToUnicode(domain: string): string {
  return domain
    .split('.')
    .map((label) => {
      const lower = label.toLowerCase();
      if (!lower.startsWith('xn--')) return label;
      try {
        return punycodeDecode(lower.slice(4));
      } catch {
        return label;
      }
    })
    .join('.');
}
