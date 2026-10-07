import { Binary } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '../components/ui/input';
import { ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';

const BASES = [
  { radix: 2, label: '二进制', digits: '01' },
  { radix: 8, label: '八进制', digits: '01234567' },
  { radix: 10, label: '十进制', digits: '0123456789' },
  { radix: 16, label: '十六进制', digits: '0123456789abcdef' },
] as const;

/** 允许用户用任一进制输入；支持 0x / 0b / 0o 前缀与下划线分隔。 */
function parseFlexible(input: string): { value: bigint; radix: number } | { error: string } {
  const cleaned = input.trim().replace(/[_\s]/g, '');
  if (cleaned.length === 0) return { value: 0n, radix: 10 };

  let body = cleaned;
  let radix = 10;
  if (/^[+-]?0x/i.test(cleaned)) {
    radix = 16;
    body = cleaned.replace(/^([+-]?)0x/i, '$1');
  } else if (/^[+-]?0b/i.test(cleaned)) {
    radix = 2;
    body = cleaned.replace(/^([+-]?)0b/i, '$1');
  } else if (/^[+-]?0o/i.test(cleaned)) {
    radix = 8;
    body = cleaned.replace(/^([+-]?)0o/i, '$1');
  }

  if (body.length === 0) return { error: '缺少数字' };
  const negative = body.startsWith('-');
  const digits = negative || body.startsWith('+') ? body.slice(1) : body;
  if (digits.length === 0) return { error: '缺少数字' };

  try {
    // BigInt 只认 0x/0b/0o 前缀；十进制必须传裸字符串，否则 "42" 会被当成八进制 34。
    const literal = radix === 16 ? `0x${digits}` : radix === 2 ? `0b${digits}` : radix === 8 ? `0o${digits}` : digits;
    const parsed = BigInt(literal);
    return { value: negative ? -parsed : parsed, radix };
  } catch {
    const allowed = BASES.find((b) => b.radix === radix)?.digits ?? '0-9';
    return { error: `无法按 ${radix} 进制解析，只允许使用 ${allowed}` };
  }
}

export default function NumberBase() {
  const [input, setInput] = useState('42');

  const parsed = useMemo(() => parseFlexible(input), [input]);
  const outputs = useMemo(() => {
    if ('error' in parsed) return [];
    const value = parsed.value;
    const negative = value < 0n;
    const magnitude = negative ? -value : value;
    return BASES.map((base) => ({
      label: base.label,
      radix: base.radix,
      value: `${negative ? '-' : ''}${magnitude.toString(base.radix)}`,
    }));
  }, [parsed]);

  const extras = useMemo(() => {
    if ('error' in parsed) return [];
    const value = parsed.value;
    return [
      { label: '罗马数字（上限 3999）', value: toRoman(value) },
      { label: '十六进制字节序列', value: toBytes(value) },
      { label: '科学计数', value: value.toString() },
    ];
  }, [parsed]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Binary className="size-4" />
          进制转换
        </span>
      }
      description="在二进制、八进制、十进制、十六进制之间转换，支持 0x/0b/0o 前缀"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto scrollbar-thin">
        <label className="text-xs text-muted-foreground">
          输入（支持 0x / 0b / 0o 前缀与下划线分隔）
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如 0xFF、1010、42"
            spellCheck={false}
            className="mt-1 h-8 font-mono text-xs"
          />
        </label>

        {'error' in parsed && <ResultBox label="错误" error={parsed.error} rows="min-h-8" />}

        <div className="space-y-1.5">
          {outputs.map((out) => (
            <div key={out.radix} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-medium">{out.label}</span>
              <Input value={out.value} readOnly spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
              <span className="w-8 shrink-0 text-[10px] text-muted-foreground">{out.radix}</span>
            </div>
          ))}
        </div>

        {extras.length > 0 && (
          <div className="space-y-1">
            {extras.map((extra) => (
              <ResultBox
                key={extra.label}
                label={extra.label}
                value={extra.value}
                onCopy={() => copyText(extra.value)}
                rows="min-h-12"
              />
            ))}
          </div>
        )}
      </div>
    </ToolPanel>
  );
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function toRoman(value: bigint): string {
  if (value < 1n || value > 3999n) return '超出范围（1 - 3999）';
  let rest = Number(value);
  let out = '';
  for (const [size, symbol] of ROMAN) {
    while (rest >= size) {
      out += symbol;
      rest -= size;
    }
  }
  return out;
}

function toBytes(value: bigint): string {
  if (value < 0n || value > 0xffffffffn) return '超出 32 位无符号范围';
  const hex = value.toString(16).padStart(8, '0');
  return hex.match(/.{2}/g)?.join(' ') ?? hex;
}
