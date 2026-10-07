/**
 * 字符串混淆 / 反转工具集。
 *
 * 用途仅限：调试、生成测试数据、演示「前端隐藏文本」的常见手法以便防御性思考。
 * 明确不要用它来隐藏密码、绕过自己的输入校验或规避审计。
 */
import { Copy, Download, Minus, Plus, RefreshCw, TriangleAlert, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';

type GroupId = 'reverse' | 'char' | 'encode' | 'order' | 'hide';

const GROUP_LABELS: Record<GroupId, string> = {
  reverse: '反转',
  char: '字符层',
  encode: '编码层',
  order: '顺序层',
  hide: '隐藏演示',
};

const ZERO_WIDTH = ['\u200B', '\u200C', '\u200D', '\uFEFF'];

const HOMOGLYPHS: Record<string, string> = {
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  x: 'х',
  y: 'у',
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  i: 'і',
  j: 'ј',
  s: 'ѕ',
  ı: 'ı',
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const MORSE: Record<string, string> = {
  a: '.-',
  b: '-...',
  c: '-.-.',
  d: '-..',
  e: '.',
  f: '..-.',
  g: '--.',
  h: '....',
  i: '..',
  j: '.---',
  k: '-.-',
  l: '.-..',
  m: '--',
  n: '-.',
  o: '---',
  p: '.--.',
  q: '--.-',
  r: '.-.',
  s: '...',
  t: '-',
  u: '..-',
  v: '...-',
  w: '.--',
  x: '-..-',
  y: '-.--',
  z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  "'": '.----.',
  '!': '-.-.--',
  '/': '-..-.',
  '(': '-.--.',
  ')': '-.--.-',
  '&': '.-...',
  ':': '---...',
  ';': '-.-.-.',
  '=': '-...-',
  '+': '.-.-.',
  '-': '-....-',
  _: '..--.-',
  '"': '.-..-.',
  $: '...-..-',
  '@': '.--.-.',
};

// ── 编码 ─────────────────────────────────────────────────

function toBase32(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

function fromBase32(text: string): string {
  const clean = text.replace(/=+$/u, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`非法 Base32 字符：${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Base58：BigInt 手工除法，避免引入依赖。 */
function toBase58(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0) return '';
  const RADIX = 58n;
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  const digits: number[] = [];
  while (value > 0n) {
    digits.push(Number(value % RADIX));
    value /= RADIX;
  }
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

function fromBase58(text: string): string {
  if (text === '') return '';
  const RADIX = 58n;
  let value = 0n;
  for (const char of text) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`非法 Base58 字符：${char}`);
    value = value * RADIX + BigInt(index);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.push(Number(value % 256n));
    value /= 256n;
  }
  for (let i = 0; i < text.length && text[i] === BASE58_ALPHABET[0]; i++) bytes.push(0);
  return new TextDecoder().decode(Uint8Array.from(bytes.reverse()));
}

/** Morse 没有大小写概念，非 ASCII 字符也没有对应码，因此这里只做演示用的转写。 */
function toMorse(text: string): string {
  return Array.from(text.toLowerCase())
    .map((char) => {
      if (char === ' ') return '/';
      return MORSE[char] ?? `[${char}]`;
    })
    .join(' ');
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

// ── 变换定义 ──────────────────────────────────────────────

interface Params {
  shift: number;
  every: number;
  seed: number;
  width: number;
}

const DEFAULT_PARAMS: Params = { shift: 3, every: 5, seed: 42, width: 20 };

/** mulberry32：固定种子可复现的伪随机。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/gu, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function caesar(text: string, shift: number): string {
  const delta = ((shift % 26) + 26) % 26;
  return text.replace(/[a-zA-Z]/gu, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + delta) % 26) + base);
  });
}

function atbash(text: string): string {
  return text.replace(/[a-zA-Z]/gu, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + 25 - (char.charCodeAt(0) - base));
  });
}

function swapCase(text: string): string {
  return Array.from(text)
    .map((char) => (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()))
    .join('');
}

function asciiShift(text: string, delta: number): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < 32 || code > 126) return char;
      const next = ((((code - 32 + delta) % 95) + 95) % 95) + 32;
      return String.fromCharCode(next);
    })
    .join('');
}

function insertZeroWidth(text: string, every: number): string {
  const step = Math.max(1, every);
  const chars = Array.from(text);
  const out: string[] = [];
  chars.forEach((char, index) => {
    out.push(char);
    if (index < chars.length - 1 && (index + 1) % step === 0) out.push(ZERO_WIDTH[index % ZERO_WIDTH.length]);
  });
  return out.join('');
}

// ZWJ 会把相邻 Emoji 组合成新字形，因此用交替而不是字符类
const ZERO_WIDTH_STRIP = /\u200B|\u200C|\u200D|\uFEFF/gu;

function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH_STRIP, '');
}

function homoglyph(text: string): string {
  return Array.from(text)
    .map((char) => HOMOGLYPHS[char] ?? char)
    .join('');
}

function transpose(text: string, width: number): string {
  const size = Math.max(1, width);
  const chars = Array.from(text.replace(/\n/gu, ''));
  const rows: string[] = [];
  for (let i = 0; i < chars.length; i += size) rows.push(chars.slice(i, i + size).join(''));
  // 最后一行用空格补齐，保证每列长度一致才能还原
  if (rows.length > 0) {
    const padLast = size - (Array.from(rows[rows.length - 1]).length % size);
    if (padLast !== size) rows[rows.length - 1] += ' '.repeat(padLast);
  }
  const out: string[] = [];
  for (let col = 0; col < size; col++) {
    let piece = '';
    for (let row = 0; row < rows.length; row++) piece += Array.from(rows[row])[col] ?? ' ';
    out.push(piece);
  }
  return out.join('\n');
}

function untranspose(text: string): string {
  const rows = text.split('\n').filter((row) => row !== '');
  const size = rows.length;
  let out = '';
  const maxLen = rows.reduce((max, row) => Math.max(max, Array.from(row).length), 0);
  for (let col = 0; col < maxLen; col++) {
    for (let row = 0; row < size; row++) out += Array.from(rows[row] ?? '')[col] ?? '';
  }
  // 转置时用空格补齐最后一行，这里去掉尾部填充才能还原原文
  return out.replace(/ +$/u, '');
}

interface Transform {
  id: string;
  label: string;
  group: GroupId;
  /** 是否可还原。 */
  reversible: boolean;
  /** 随机类变换：结果不可还原但同种子可复现。 */
  seeded?: boolean;
  note?: string;
  run: (input: string, params: Params) => string;
  invert?: (input: string, params: Params) => string;
}

const TRANSFORMS: Transform[] = [
  {
    id: 'reverseAll',
    label: '整串反转',
    group: 'reverse',
    reversible: true,
    note: '反转两次即还原',
    run: (text) => Array.from(text).reverse().join(''),
    invert: (text) => Array.from(text).reverse().join(''),
  },
  {
    id: 'reverseWords',
    label: '单词顺序反转',
    group: 'reverse',
    reversible: true,
    note: '只反转以空格分隔的词序，不动标点',
    run: (text) =>
      text
        .split('\n')
        .map((line) => line.split(' ').reverse().join(' '))
        .join('\n'),
    invert: (text) =>
      text
        .split('\n')
        .map((line) => line.split(' ').reverse().join(' '))
        .join('\n'),
  },
  {
    id: 'reverseLines',
    label: '每行反转',
    group: 'reverse',
    reversible: true,
    note: '反转行序，行内内容不变',
    run: (text) => text.split('\n').reverse().join('\n'),
    invert: (text) => text.split('\n').reverse().join('\n'),
  },
  {
    id: 'reverseChars',
    label: '按字符反转',
    group: 'reverse',
    reversible: true,
    note: '按 Unicode 码点逆序，不会拆散代理对（Emoji 保持完整）',
    run: (text) => Array.from(text).reverse().join(''),
    invert: (text) => Array.from(text).reverse().join(''),
  },
  {
    id: 'rot13',
    label: 'ROT13',
    group: 'char',
    reversible: true,
    note: '自身即为逆运算',
    run: (text) => rot13(text),
    invert: (text) => rot13(text),
  },
  {
    id: 'caesar',
    label: 'Caesar 位移',
    group: 'char',
    reversible: true,
    note: '参数 shift',
    run: (text, params) => caesar(text, params.shift),
    invert: (text, params) => caesar(text, -params.shift),
  },
  {
    id: 'atbash',
    label: 'Atbash（A↔Z）',
    group: 'char',
    reversible: true,
    note: '自身即为逆运算',
    run: (text) => atbash(text),
    invert: (text) => atbash(text),
  },
  {
    id: 'swapCase',
    label: '反转大小写',
    group: 'char',
    reversible: true,
    note: '自身即为逆运算',
    run: (text) => swapCase(text),
    invert: (text) => swapCase(text),
  },
  {
    id: 'asciiShift',
    label: 'ASCII 字符移位',
    group: 'char',
    reversible: true,
    note: '参数 shift',
    run: (text, params) => asciiShift(text, params.shift),
    invert: (text, params) => asciiShift(text, -params.shift),
  },
  {
    id: 'zeroWidth',
    label: '插入零宽字符',
    group: 'hide',
    reversible: true,
    note: '每 every 个字符插入一个零宽字符，用于检测隐藏字符与水印',
    run: (text, params) => insertZeroWidth(text, params.every),
    invert: (text) => stripZeroWidth(text),
  },
  {
    id: 'homoglyph',
    label: '同形字替换（西里尔字母）',
    group: 'hide',
    reversible: false,
    note: '视觉相似但码点不同，是钓鱼与「隐形文本」的常见手法',
    run: (text) => homoglyph(text),
  },
  {
    id: 'base32',
    label: 'Base32',
    group: 'encode',
    reversible: true,
    run: (text) => toBase32(text),
    invert: (text) => fromBase32(text),
  },
  {
    id: 'base58',
    label: 'Base58（自实现）',
    group: 'encode',
    reversible: true,
    run: (text) => toBase58(text),
    invert: (text) => fromBase58(text),
  },
  {
    id: 'hex',
    label: 'Hex 编码',
    group: 'encode',
    reversible: true,
    run: (text) =>
      Array.from(new TextEncoder().encode(text))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    invert: (text) => {
      const clean = text.replace(/0x/giu, '').replace(/\s+/gu, '');
      if (clean.length % 2 === 1) throw new Error('十六进制长度必须为偶数');
      const bytes = Uint8Array.from(clean.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
      return new TextDecoder().decode(bytes);
    },
  },
  {
    id: 'urlEncode',
    label: 'URL 编码',
    group: 'encode',
    reversible: true,
    run: (text) => encodeURIComponent(text),
    invert: (text) => decodeURIComponent(text),
  },
  {
    id: 'htmlEntities',
    label: 'HTML 实体',
    group: 'encode',
    reversible: true,
    run: (text) => escapeHtml(text),
    invert: (text) =>
      text.replace(/&(amp|lt|gt|quot|#39);/gu, (_match, name: string) =>
        name === 'amp' ? '&' : name === 'lt' ? '<' : name === 'gt' ? '>' : name === 'quot' ? '"' : "'",
      ),
  },
  {
    id: 'unicodeEscape',
    label: 'Unicode 转义',
    group: 'encode',
    reversible: true,
    run: (text) =>
      Array.from(text)
        .map((char) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`)
        .join(''),
    invert: (text) =>
      text.replace(/\\u\{?([0-9a-fA-F]{1,6})\}?/gu, (_match, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      ),
  },
  {
    id: 'morse',
    label: 'Morse 摩斯（自实现）',
    group: 'encode',
    reversible: false,
    note: 'Morse 无大小写概念，中文等字符只能写成 [x] 占位，因此不可逆',
    run: (text) => toMorse(text),
  },
  {
    id: 'shuffleLines',
    label: '行打乱',
    group: 'order',
    reversible: false,
    seeded: true,
    note: '不可还原，但同一种子结果可复现',
    run: (text, params) => {
      const rand = mulberry32(params.seed);
      const lines = text.split('\n');
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }
      return lines.join('\n');
    },
  },
  {
    id: 'transpose',
    label: '列转置（等宽填充）',
    group: 'order',
    reversible: true,
    note: '参数 width；换行会被移除，逆向只能还原单段文本',
    run: (text, params) => transpose(text, params.width),
    invert: (text) => untranspose(text),
  },
  {
    id: 'shuffleWords',
    label: '单词洗牌',
    group: 'order',
    reversible: false,
    seeded: true,
    note: '不可还原，但同一种子结果可复现',
    run: (text, params) => {
      const rand = mulberry32(params.seed);
      const lines = text.split('\n');
      return lines
        .map((line) => {
          const words = line.split(' ');
          for (let i = words.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [words[i], words[j]] = [words[j], words[i]];
          }
          return words.join(' ');
        })
        .join('\n');
    },
  },
  {
    id: 'cssSpans',
    label: '拆成 span（CSS 隐藏演示）',
    group: 'hide',
    reversible: true,
    note: '把文本拆进多个 span，是「前端隐藏文本」的常见手法',
    run: (text) =>
      Array.from(text)
        .map((char) => `<span>${char === ' ' ? '&nbsp;' : escapeHtml(char)}</span>`)
        .join(''),
    invert: (text) =>
      text
        .replace(/<\/?span>/gu, '')
        .replaceAll('&nbsp;', ' ')
        .replace(/&amp;/gu, '&')
        .replace(/&lt;/gu, '<')
        .replace(/&gt;/gu, '>'),
  },
  {
    id: 'dataUri',
    label: 'Base64 data URI 内嵌',
    group: 'hide',
    reversible: true,
    note: '把文本塞进 data URI，视觉上不渲染但仍可被读出',
    run: (text) => {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:text/plain;base64,${btoa(binary)}`;
    },
    invert: (text) => {
      const match = /base64,([A-Za-z0-9+/=]+)/u.exec(text);
      if (!match) throw new Error('未找到 base64 data URI');
      const binary = atob(match[1]);
      return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    },
  },
];

const SAMPLE = `Hello, World! 你好，世界。
The quick brown fox jumps over the lazy dog.`;

export default function TextObfuscate() {
  const [input, setInput] = useState(SAMPLE);
  const [enabled, setEnabled] = useState<string[]>(['reverseAll']);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [invert, setInvert] = useState(false);
  const reseed = () =>
    setParams((prev) => ({ ...prev, seed: (prev.seed + 7919 + Math.floor(Math.random() * 65536)) >>> 0 }));

  const chained = useMemo(() => {
    let text = input;
    const errors: string[] = [];
    const skipped: string[] = [];
    for (const id of enabled) {
      const transform = TRANSFORMS.find((item) => item.id === id);
      if (!transform) continue;
      // 逆向模式下不可逆变换必须跳过，否则会「反向又做一次混淆」，结果无法解读
      if (invert && !transform.invert) {
        skipped.push(transform.label);
        continue;
      }
      try {
        text = invert && transform.invert ? transform.invert(text, params) : transform.run(text, params);
      } catch (error) {
        errors.push(`${transform.label}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { text, errors, skipped };
  }, [input, enabled, params, invert]);

  const perItem = useMemo(
    () =>
      enabled.map((id) => {
        const transform = TRANSFORMS.find((item) => item.id === id);
        if (!transform) return null;
        if (invert && !transform.invert) {
          return {
            id,
            label: transform.label,
            group: transform.group,
            value: '',
            error: '不可逆变换，逆向模式下已跳过',
          };
        }
        try {
          const value = invert && transform.invert ? transform.invert(input, params) : transform.run(input, params);
          return { id, label: transform.label, group: transform.group, value, error: null as string | null };
        } catch (error) {
          return {
            id,
            label: transform.label,
            group: transform.group,
            value: '',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    [enabled, invert, input, params],
  );

  const move = (id: string, delta: number) =>
    setEnabled((prev) => {
      const index = prev.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const toggle = (id: string) =>
    setEnabled((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  const setParam = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  const usedParams = useMemo(() => {
    const set = new Set<string>();
    for (const id of enabled) {
      const transform = TRANSFORMS.find((item) => item.id === id);
      if (transform?.note?.startsWith('参数')) set.add(transform.note.slice(2).trim());
    }
    if (enabled.some((id) => TRANSFORMS.find((item) => item.id === id)?.seeded)) set.add('seed');
    return set;
  }, [enabled]);

  const usesSeed = usedParams.has('seed');

  return (
    <ToolPanel
      title="字符串混淆 / 反转"
      description="调试与测试数据生成、隐藏文本手法演示"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={reseed}>
            <RefreshCw className="size-3.5" />
            换一批随机种子
          </Button>
          <Button size="sm" variant="outline" disabled={!chained.text} onClick={() => copyText(chained.text)}>
            <Copy className="size-3.5" />
            复制串联结果
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!chained.text}
            onClick={() => downloadText(exportName('obfuscate', 'txt'), chained.text)}
          >
            <Download className="size-3.5" />
            下载 .txt
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <Note tone="danger" title="使用边界">
        本工具仅用于调试、生成测试数据，以及演示「前端隐藏文本」的常见手法以便防御性思考。
        <strong className="font-medium">不要用于隐藏密码、规避审计或绕过你自己的输入校验。</strong>
      </Note>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">输入文本</span>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴待处理的文本"
            spellCheck={false}
            className="min-h-48 resize-none font-mono text-xs"
            aria-label="输入文本"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {invert ? (
                <Undo2 className="size-3.5" />
              ) : chained.errors.length > 0 ? (
                <TriangleAlert className="size-3.5 text-destructive" />
              ) : null}
              {invert ? '串联结果（逆向）' : '串联结果'}
            </span>
            <span className="flex items-center gap-2">
              <Checkbox label="逆向" checked={invert} onChange={setInvert} />
              <Button size="sm" variant="ghost" disabled={!chained.text} onClick={() => copyText(chained.text)}>
                <Copy className="size-3.5" />
                复制
              </Button>
            </span>
          </div>
          <Textarea
            value={chained.errors.length > 0 ? '' : chained.text}
            readOnly
            spellCheck={false}
            className="min-h-48 resize-none font-mono text-xs"
            aria-label={invert ? '串联结果（逆向）' : '串联结果'}
          />
          {chained.errors.length > 0 && (
            <div className="min-h-16 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 font-mono text-[11px] text-destructive scrollbar-thin">
              {chained.errors.join('\n')}
            </div>
          )}
          {chained.skipped.length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              逆向模式已跳过不可逆变换：{chained.skipped.join('、')}
            </p>
          )}
        </div>
      </div>

      <Section title="变换列表" description="勾选启用，用箭头调整串联顺序">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {TRANSFORMS.map((transform) => {
            const index = enabled.indexOf(transform.id);
            const active = index >= 0;
            return (
              <div
                key={transform.id}
                className={`flex min-w-0 items-start gap-2 rounded-md border px-2 py-1.5 ${
                  active ? 'border-primary/60 bg-primary/5' : 'bg-muted/20'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 shrink-0 accent-primary"
                  checked={active}
                  aria-label={`启用变换：${transform.label}`}
                  onChange={() => toggle(transform.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1 text-xs font-medium">
                    {active && (
                      <span className="rounded bg-primary/15 px-1 font-mono text-[10px] text-primary">{index + 1}</span>
                    )}
                    {transform.label}
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      {GROUP_LABELS[transform.group]}
                    </span>
                    {!transform.reversible && (
                      <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-400">
                        不可逆
                      </span>
                    )}
                  </p>
                  {transform.note && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{transform.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    aria-label={`上移变换 ${transform.label}`}
                    disabled={!active || index === 0}
                    onClick={() => move(transform.id, -1)}
                  >
                    <Plus className="size-3 rotate-45" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    aria-label={`下移变换 ${transform.label}`}
                    disabled={!active || index === enabled.length - 1}
                    onClick={() => move(transform.id, 1)}
                  >
                    <Minus className="size-3 -rotate-45" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="变换参数" description="只影响标注了参数的变换">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Caesar / ASCII 位移"
              value={params.shift}
              onChange={(value) => setParam('shift', value)}
              disabled={!usedParams.has('shift')}
              suffix="可正可负"
            />
            <NumberField
              label="零宽字符间隔"
              value={params.every}
              onChange={(value) => setParam('every', Math.max(1, value || 1))}
              disabled={!usedParams.has('every')}
              suffix="字符"
            />
            <NumberField
              label="转置宽度"
              value={params.width}
              onChange={(value) => setParam('width', Math.max(1, value || 1))}
              disabled={!usedParams.has('width')}
              suffix="列"
            />
            <NumberField
              label="随机种子"
              value={params.seed}
              onChange={(value) => setParam('seed', value >>> 0)}
              disabled={!usesSeed}
              hint={usesSeed ? '同一种子输出完全一致' : '仅打乱类变换需要'}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!usesSeed} onClick={reseed}>
              <RefreshCw className="size-3.5" />
              换一批随机种子
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {usesSeed ? `当前种子 ${params.seed}` : '勾选「行打乱」或「单词洗牌」后可调整种子'}
            </span>
          </div>
          <Hint>
            勾选「逆向」后，每个可逆变换都会调用自己的还原函数；不可逆变换（Morse、同形字替换、行打乱、 单词洗牌）会被
            <strong className="font-medium text-foreground">跳过</strong>并在结果区列出，
            避免「反向又混淆一次」导致结果无法解读。
          </Hint>
        </Section>

        <Section title="逐项对照" description="每个变换单独作用于原始输入，便于横向比较">
          {perItem.length === 0 || perItem.every((item) => item === null) ? (
            <EmptyHint>勾选任意变换查看对照结果</EmptyHint>
          ) : (
            <div className="flex max-h-72 flex-col gap-2 overflow-auto scrollbar-thin">
              {perItem.map((item) =>
                item === null ? null : (
                  <div key={item.id} className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-medium">{item.label}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5"
                        aria-label={`复制 ${item.label} 的结果`}
                        disabled={!item.value}
                        onClick={() => copyText(item.value)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                    <code className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed scrollbar-thin">
                      {item.error ? <span className="text-destructive">{item.error}</span> : item.value}
                    </code>
                  </div>
                ),
              )}
            </div>
          )}
        </Section>
      </div>

      <Section title="补充说明">
        <div className="grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
          <p>
            <span className="font-medium text-foreground">Base32 / Base58 / Morse 均为本地自实现</span>
            ，不依赖任何第三方库；Base58 使用 BigInt 手写除法，适合演示「比特币地址为什么不用 0/O」。
          </p>
          <p>
            <span className="font-medium text-foreground">零宽字符与 CSS 拆分</span>
            属于「前端隐藏文本」常见手法：内容肉眼不可见，但可被复制、检索或提交到后端。防御思路是对可见文本做长度与哈希校验。
          </p>
          <p>
            <span className="font-medium text-foreground">同形字替换</span>
            不可逆且视觉高度相似（拉丁字母与西里尔字母混用），是钓鱼链接的常见伪装手法。
          </p>
          <p>
            <span className="font-medium text-foreground">随机类变换</span>
            使用 mulberry32 伪随机，同一种子输出完全一致，方便把结果写进快照测试。
          </p>
        </div>
      </Section>
    </ToolPanel>
  );
}
