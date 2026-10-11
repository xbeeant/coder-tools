import { Dices, ShieldCheck, Type } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';

const CHARSETS = {
  digits: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  similar: 'iIlLoO0O1',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?',
  hex: '0123456789abcdef',
} as const;

type CharsetKey = keyof typeof CHARSETS;

const PRESETS: { label: string; keys: CharsetKey[] }[] = [
  { label: '纯数字', keys: ['digits'] },
  { label: '小写字母+数字', keys: ['lowercase', 'digits'] },
  { label: '大小写+数字', keys: ['lowercase', 'uppercase', 'digits'] },
  { label: '全部（去除易混字符）', keys: ['lowercase', 'uppercase', 'digits', 'symbols'] },
  { label: '十六进制', keys: ['hex'] },
  { label: 'Base64 字符集', keys: ['lowercase', 'uppercase', 'digits', 'symbols'] },
];

/** 拒绝采样避免取模偏差：先在 2^32 上取随机数，再拒绝落在非整除尾部。 */
function randomIndex(size: number): number {
  const limit = Math.floor(0x100000000 / size) * size;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % size;
}

function generate(length: number, pool: string): string {
  let out = '';
  for (let i = 0; i < length; i++) out += pool[randomIndex(pool.length)];
  return out;
}

export default function TokenGenerator() {
  const [length, setLength] = useState(32);
  const [count, setCount] = useState(5);
  const [enabled, setEnabled] = useState<Record<CharsetKey, boolean>>({
    digits: true,
    lowercase: true,
    uppercase: true,
    similar: false,
    symbols: false,
    hex: false,
  });
  const [seed, setSeed] = useState(0);
  const [requireEach, setRequireEach] = useState(true);

  const pool = useMemo(
    () =>
      Object.keys(enabled)
        .filter((key) => enabled[key as CharsetKey])
        .map((key) => CHARSETS[key as CharsetKey])
        .join(''),
    [enabled],
  );

  const list = useMemo(() => {
    void seed;
    if (pool.length === 0) return [];
    const generateOne = (): string => {
      if (!requireEach) return generate(length, pool);
      // 覆盖每个已启用字符集至少出现一次，剩余位置随机填充
      const groups = Object.keys(enabled)
        .filter((key) => enabled[key as CharsetKey])
        .map((key) => CHARSETS[key as CharsetKey]);
      const chars = groups.map((group) => group[randomIndex(group.length)]);
      while (chars.length < length) chars.push(pool[randomIndex(pool.length)]);
      // Fisher-Yates 洗牌
      for (let i = chars.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      return chars.join('');
    };
    return Array.from({ length: count }, generateOne);
  }, [pool, enabled, length, count, requireEach, seed]);

  const output = list.join('\n');
  const entropyPerChar = pool.length > 0 ? Math.log2(pool.length) : 0;
  const totalEntropy = entropyPerChar * length;
  const bitsText = totalEntropy >= 100 ? (totalEntropy / 1000).toFixed(2) : totalEntropy.toFixed(1);

  const toggle = (key: CharsetKey) => setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Token 生成器
        </span>
      }
      description="安全地生成随机 Token，支持自定义字符集与熵计算"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="outline" onClick={() => setSeed((n) => n + 1)} disabled={pool.length === 0}>
            <Dices className="size-3.5" />
            重新生成
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copyText(output)} disabled={!output}>
            复制
          </Button>
          <ClearButton onClick={() => setSeed((n) => n + 1)} disabled={pool.length === 0 && !output} />
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            长度
            <Input
              type="number"
              min={1}
              max={4096}
              value={length}
              onChange={(event) => setLength(Math.min(4096, Math.max(1, Number(event.target.value) || 1)))}
              className="h-7 w-20 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5">
            数量
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              className="h-7 w-16 text-xs"
            />
          </label>
          <Checkbox
            label="覆盖所有字符集"
            checked={requireEach}
            onChange={setRequireEach}
            hint="保证每个已勾选字符集至少出现一次"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() =>
                setEnabled(
                  Object.fromEntries(
                    Object.keys(CHARSETS).map((k) => [k, preset.keys.includes(k as CharsetKey)]),
                  ) as Record<CharsetKey, boolean>,
                )
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CHARSETS) as CharsetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                enabled[key] ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Type className="size-3.5" />
          字符集大小 {pool.length} · 每个 Token 约 {bitsText} bits 熵
        </div>

        <div className="flex-1 overflow-auto rounded-md border bg-muted/30 whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed break-all scrollbar-thin">
          {pool.length === 0 ? <span className="text-muted-foreground">请至少启用一个字符集</span> : output}
        </div>
      </div>
      <Note tone="info" title="说明">
        使用浏览器原生 Crypto API 生成随机数，采用拒绝采样避免取模偏差。
      </Note>
    </ToolPanel>
  );
}
