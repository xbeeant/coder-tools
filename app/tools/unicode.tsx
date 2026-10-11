import { ArrowLeftRight, Code2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';

type Mode = 'encode' | 'decode';

const ESCAPE_STYLES = [
  { value: 'js', label: 'JS \\u' },
  { value: 'hex', label: '十六进制' },
  { value: 'dec', label: '十进制码点' },
  { value: 'html', label: 'HTML 实体' },
] as const;

type EscapeStyle = (typeof ESCAPE_STYLES)[number]['value'];

const JS_ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\v': '\\v',
  '\f': '\\f',
  '\r': '\\r',
  '"': '\\"',
  "'": "\\'",
  '\\': '\\\\',
};

/** 输入 \uXXXX / \xXX / \0 转义序列时，按码点还原为字符。 */
function decodeEscapes(input: string): string {
  return input.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|[0-7]{1,3})/g,
    (match, brace, uni, hex, octal) => {
      const raw = brace ?? uni ?? hex ?? octal;
      const radix = brace !== undefined || uni !== undefined ? 16 : hex !== undefined ? 16 : 8;
      const code = Number.parseInt(raw, radix);
      if (!Number.isFinite(code) || code > 0x10ffff) return match;
      if (code === 0) return '\0';
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    },
  );
}

export default function UnicodeTool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [style, setStyle] = useState<EscapeStyle>('js');
  const [input, setInput] = useState('');

  const perChar = useMemo(() => {
    if (mode === 'decode' || input.length === 0) return [];
    return Array.from(input).map((char) => {
      const code = char.codePointAt(0) as number;
      return {
        char,
        code,
        binary: code.toString(2).padStart(code > 0xffff ? 21 : 16, '0'),
        escaped:
          style === 'js'
            ? (JS_ESCAPES[char] ??
              (code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, '0')}`))
            : style === 'hex'
              ? `\\x${code.toString(16).padStart(4, '0')}`
              : style === 'dec'
                ? `\\u{${code}}`
                : code > 0xffff
                  ? `&#x${code.toString(16)};`
                  : `&#${code};`,
        category: describeCategory(code),
      };
    });
  }, [input, mode, style]);

  // 同一码点可能出现多次，用出现次数保证 key 唯一且稳定。
  const rows = useMemo(() => {
    const seen = new Map<number, number>();
    return perChar.map((item) => {
      const occurrence = (seen.get(item.code) ?? 0) + 1;
      seen.set(item.code, occurrence);
      return { item, key: `${item.code}-${occurrence}` };
    });
  }, [perChar]);

  const joined = useMemo(() => {
    if (mode === 'decode') return decodeEscapes(input);
    return perChar.map((item) => item.escaped).join('');
  }, [input, mode, perChar]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Code2 className="size-4" />
          Unicode 转换
        </span>
      }
      description="字符与 Unicode 转义序列互相转换，支持 JS/十六进制/十进制/HTML 实体格式"
      actions={
        <div className="flex flex-row gap-1">
          {mode === 'encode' && (
            <Tabs value={style} onValueChange={(value) => setStyle(value as EscapeStyle)}>
              <TabsList>
                {ESCAPE_STYLES.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Tabs value={mode} onValueChange={(value) => setMode(value === 'decode' ? 'decode' : 'encode')}>
            <TabsList>
              <TabsTrigger value="encode">字符 → 转义</TabsTrigger>
              <TabsTrigger value="decode">转义 → 字符</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!joined) return;
              setInput(joined);
              setMode(mode === 'encode' ? 'decode' : 'encode');
            }}
            disabled={!joined}
          >
            <ArrowLeftRight className="size-3.5" />
            互换
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <Note tone="info" title="说明">
        解码支持 JS 转义序列（\u、\u&#123;&#123;&#125;&#125;、\x、八进制），未知序列将原样保留。
      </Note>
      <div className="flex flex-1 flex-col gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={mode === 'encode' ? '输入文本，查看每个字符的码点' : '输入 \\u4f60\\u597d 或 \\x4f\\x60'}
          spellCheck={false}
          className="min-h-24 resize-none font-mono text-xs"
        />
        <ResultBox
          label={mode === 'encode' ? '转义结果' : '还原结果'}
          value={joined}
          onCopy={() => copyText(joined)}
          rows="min-h-16"
          fill
        />

        {mode === 'encode' && perChar.length > 0 && (
          <div className="flex-1 overflow-auto rounded-md border scrollbar-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">字符</th>
                  <th className="px-2 py-1 font-medium">U+</th>
                  <th className="px-2 py-1 font-medium">十进制</th>
                  <th className="px-2 py-1 font-medium">二进制</th>
                  <th className="px-2 py-1 font-medium">转义</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map(({ item, key }) => (
                  <tr key={key} className="border-t">
                    <td className="px-2 py-1 text-base">{item.char === ' ' ? '␣' : item.char}</td>
                    <td className="px-2 py-1">{item.code.toString(16).toUpperCase().padStart(4, '0')}</td>
                    <td className="px-2 py-1 tabular-nums">{item.code}</td>
                    <td className="px-2 py-1 text-[10px] tabular-nums">{item.binary}</td>
                    <td className="px-2 py-1">{item.escaped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ToolPanel>
  );
}

function describeCategory(code: number): string {
  if (code === 9) return '制表符';
  if (code === 10) return '换行';
  if (code === 13) return '回车';
  if (code === 32) return '空格';
  if (code < 32) return '控制字符';
  if (code >= 0x4e00 && code <= 0x9fff) return 'CJK 统一表意文字';
  if (code >= 0x3040 && code <= 0x30ff) return '日文假名';
  if (code >= 0xac00 && code <= 0xd7af) return '韩文音节';
  if (code >= 0x0400 && code <= 0x04ff) return '西里尔字母';
  if (code >= 0x0370 && code <= 0x03ff) return '希腊字母';
  if (code >= 0x1f300 && code <= 0x1faff) return 'Emoji';
  if (code >= 0x2000 && code <= 0x206f) return '通用标点';
  return '其他';
}
