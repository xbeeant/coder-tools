import { ArrowLeftRight, ClipboardPaste, Code2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';

type Mode = 'encode' | 'decode';

const SAMPLE_TEXT = '你好, World! 👋';
const SAMPLE_ESCAPED = '\\u4f60\\u597d, World! \\u{1f44b}';

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

/** 短转义（\n、\t、\\ 等）与编码端 JS_ESCAPES 保持互逆。 */
const SHORT_ESCAPES: Record<string, string> = {
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  '"': '"',
  "'": "'",
  '\\': '\\',
};

/**
 * 还原转义序列：\uXXXX / \u{十六进制} / \c{十进制} / \xXX / 短转义 / 八进制 / HTML 实体。
 * 覆盖本工具四种编码风格的全部产物，保证「字符 → 转义 → 字符」可往返。
 */
function decodeEscapes(input: string): string {
  return input.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|c\{([0-9]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([btnvfr"'\\])|([0-7]{1,3}))|&#(?:x([0-9a-fA-F]+)|([0-9]+));/g,
    (match, brace, decimal, uni, hex, short, octal, htmlHex, htmlDec) => {
      if (short !== undefined) return SHORT_ESCAPES[short] ?? match;
      const raw = brace ?? decimal ?? uni ?? hex ?? octal ?? htmlHex ?? htmlDec;
      const radix = decimal !== undefined || htmlDec !== undefined ? 10 : octal !== undefined ? 8 : 16;
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
              ? // \x 解码器只认 2 位十六进制，> 0xFF 的码点改用可被识别的 \u{十六进制}。
                code <= 0xff
                ? `\\x${code.toString(16).padStart(2, '0')}`
                : `\\u{${code.toString(16)}}`
              : style === 'dec'
                ? // \u{...} 按十六进制解析，十进制码点改用解码器新增的 \c{十进制} 分支。
                  `\\c{${code}}`
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
          <Button size="sm" variant="ghost" onClick={() => setInput(mode === 'encode' ? SAMPLE_TEXT : SAMPLE_ESCAPED)}>
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
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
        解码支持 JS 转义序列（\u、\u&#123;十六进制&#125;、\x、\c&#123;十进制&#125;、短转义、八进制）与 HTML
        实体（&amp;#x…; / &amp;#…;），未知序列原样保留；四种编码风格的产物都能被本工具还原。十六进制风格仅对 0xFF
        以内的码点使用 \x，更大码点自动改用 \u&#123;…&#125;。
      </Note>
      <div className="flex flex-1 flex-col gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={mode === 'encode' ? '输入文本，查看每个字符的码点' : '输入 \\u4f60\\u597d 或 \\x4f\\x60'}
          spellCheck={false}
          aria-label="Unicode 输入"
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
