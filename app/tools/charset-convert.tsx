import { AlertTriangle, ArrowLeftRight, Copy, Download, Languages, Wrench } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, type SelectOption } from '../components/ui/select';
import { Checkbox } from '../components/ui/field';
import { EmptyHint, type LinkItem, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { bytesToHex, concatBytes, formatBytes, hexToBytes, toBytes, utf8ToBytes } from '../lib/bytes';
import {
  bomBytes,
  confidenceLabel,
  decodableEncodings,
  decodeBytes,
  decodeLabel,
  ENCODINGS,
  encodableEncodings,
  encodeLabel,
  encodeText,
  findEncoding,
  type MojibakeCandidate,
  repairMojibake,
  requiresBom,
  UNICODE_IDS,
} from '../lib/charset';
import { downloadBlob, exportName } from '../lib/file';

type Tab = 'convert' | 'repair' | 'reference';
type Direction = 'decode' | 'encode';

const EXAMPLE_GBK_HEX = 'D6 D0 CE C4';

/** 把字节排成经典的十六进制 + 可打印字符视图。 */
function hexDump(bytes: Uint8Array, perLine = 16): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += perLine) {
    const slice = bytes.subarray(i, i + perLine);
    const hex = bytesToHex(slice, ' ')
      .toUpperCase()
      .padEnd(perLine * 3 - 1, ' ');
    const ascii = Array.from(slice, (byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** 源编码下拉：所有浏览器能解码的编码，标注支持程度。 */
function sourceOptions(): SelectOption[] {
  return decodableEncodings().map((info) => ({
    value: info.id,
    label: `${info.name} · ${info.decode === 'native' ? '浏览器原生（仅解码）' : '内置双向'}`,
  }));
}

/** 目标编码下拉：解码模式只能输出 Unicode 系编码。 */
function unicodeOptions(): SelectOption[] {
  return UNICODE_IDS.map((id) => {
    const info = findEncoding(id);
    return { value: id, label: `${info?.name ?? id} · 内置双向` };
  });
}

/** 目标编码下拉：编码模式列出全部编码，不可编码的项保留但禁用。 */
function encodeOptions(): SelectOption[] {
  return [
    ...encodableEncodings().map((info) => ({ value: info.id, label: `${info.name} · 内置双向` })),
    ...ENCODINGS.filter((info) => info.encode === 'none').map((info) => ({
      value: info.id,
      label: `${info.name} · 不支持编码（请用桌面工具）`,
      disabled: true,
    })),
  ];
}

const EXTERNAL_TOOLS: LinkItem[] = [
  {
    name: 'iconv 文档',
    url: 'https://www.gnu.org/software/libc/manual/html_node/Conversion.html',
    description: 'GNU libiconv 的编码转换接口，Linux/macOS 自带',
    tags: ['CLI', 'libc'],
  },
  {
    name: 'Python codecs',
    url: 'https://docs.python.org/3/library/codecs.html',
    description: '一行 str.encode / bytes.decode 就能转任意编码',
    tags: ['Python', 'codecs'],
  },
  {
    name: 'MDN TextDecoder',
    url: 'https://developer.mozilla.org/docs/Web/API/TextDecoder',
    description: '浏览器原生支持的编码列表（WHATWG Encoding Standard）',
    tags: ['MDN', '浏览器'],
  },
  {
    name: 'Encoding Standard',
    url: 'https://encoding.spec.whatwg.org/',
    description: '浏览器编码实现的权威规范，含各编码的映射表',
    tags: ['WHATWG', '规范'],
  },
  {
    name: 'iconv 命令行速查',
    url: 'https://www.gnu.org/software/libiconv/manual/guide.html',
    description: 'iconv 命令行用法与 `-f` / `-t` 参数说明',
    tags: ['CLI', '速查'],
  },
  {
    name: 'Node.js Buffer',
    url: 'https://nodejs.org/api/buffer.html',
    description: '想在本机批量处理文件时最省事的脚本环境',
    tags: ['Node.js', '脚本'],
  },
];

export default function CharsetConvert() {
  const [tab, setTab] = useState<Tab>('convert');
  const [direction, setDirection] = useState<Direction>('decode');
  const [source, setSource] = useState('gbk');
  const [target, setTarget] = useState('utf-8');
  const [withBom, setWithBom] = useState(true);
  const [input, setInput] = useState('');
  const [adopted, setAdopted] = useState('');

  const targetOptions = direction === 'decode' ? unicodeOptions() : encodeOptions();
  const targetId = targetOptions.some((option) => option.value === target) ? target : 'utf-8';

  const conversion = useMemo<{
    ok: boolean;
    text: string;
    bytes: Uint8Array | null;
    inputBytes: number;
    outputBytes: number;
    error: string | null;
  }>(() => {
    if (!input) return { ok: true, text: '', bytes: null, inputBytes: 0, outputBytes: 0, error: null };
    try {
      if (direction === 'decode') {
        const bytes = hexToBytes(input);
        const text = decodeBytes(bytes, source);
        const output = encodeText(text, targetId);
        return {
          ok: true,
          text,
          bytes: output,
          inputBytes: bytes.length,
          outputBytes: output.length,
          error: null,
        };
      }
      const inputBytes = utf8ToBytes(input).length;
      const output = encodeText(input, targetId);
      return { ok: true, text: hexDump(output), bytes: output, inputBytes, outputBytes: output.length, error: null };
    } catch (error) {
      const inputBytes = direction === 'decode' ? safeByteLength(input) : utf8ToBytes(input).length;
      return {
        ok: false,
        text: '',
        bytes: null,
        inputBytes,
        outputBytes: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [input, direction, source, targetId]);

  const repaired = useMemo(() => repairMojibake(input), [input]);

  /** 把解码结果回填成输入，并反向按原来的源编码重新写字节。 */
  const swap = useCallback(() => {
    if (direction !== 'decode' || !conversion.text) return;
    setInput(conversion.text);
    setTarget(source);
    setDirection('encode');
  }, [direction, conversion.text, source]);

  const download = useCallback(() => {
    if (!conversion.bytes) return;
    const bom = withBom || requiresBom(targetId) ? bomBytes(targetId) : new Uint8Array(0);
    const payload = bom.length > 0 ? concatBytes(bom, conversion.bytes) : toBytes(conversion.bytes);
    const name = direction === 'decode' ? `charset-${source}-to-${targetId}` : `charset-utf8-to-${targetId}`;
    downloadBlob(exportName(name, 'txt'), new Blob([payload]));
  }, [conversion.bytes, withBom, targetId, direction, source]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Languages className="size-4" />
          字符集转换与乱码修复
        </span>
      }
      description="本地字符集编码转换、mojibake 修复与编码速查，不发任何网络请求"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="convert">编码转换</TabsTrigger>
            <TabsTrigger value="repair">乱码修复</TabsTrigger>
            <TabsTrigger value="reference">编码速查</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'convert' && (
        <>
          <Section
            title="转码设置"
            description={
              direction === 'decode'
                ? '解码：把十六进制字节按源编码读成文本，再按目标编码输出'
                : '编码：把文本按目标编码写成字节，并给出十六进制结果'
            }
            actions={
              <Tabs value={direction} onValueChange={(value) => setDirection(value as Direction)}>
                <TabsList>
                  <TabsTrigger value="decode">字节 → 文本</TabsTrigger>
                  <TabsTrigger value="encode">文本 → 字节</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="源编码"
                value={direction === 'decode' ? source : 'utf-8'}
                onChange={(value) => direction === 'decode' && setSource(value)}
                options={direction === 'decode' ? sourceOptions() : unicodeOptions()}
                disabled={direction === 'encode'}
                hint={
                  direction === 'decode' ? '输入字节按这个编码解释' : '编码方向下输入是 Unicode 文本，此处不参与计算'
                }
                selectClassName="font-mono"
              />
              <Select
                label="目标编码"
                value={targetId}
                onChange={setTarget}
                options={targetOptions}
                hint={
                  direction === 'decode' ? '解码方向的输出只能是 Unicode 系编码' : '只有内置映射表的编码可以写入字节'
                }
                selectClassName="font-mono"
              />
              <div className="flex min-w-0 flex-col justify-end gap-2">
                <Checkbox
                  label="导出时写入 BOM"
                  checked={withBom}
                  onChange={setWithBom}
                  hint="UTF-16 / UTF-32 强制写入；UTF-8 的 BOM 可按需关闭"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={download} disabled={!conversion.bytes}>
                    <Download className="size-3.5" />
                    下载 .txt
                  </Button>
                  {direction === 'decode' && (
                    <Button size="sm" variant="ghost" onClick={swap} disabled={!conversion.text}>
                      <ArrowLeftRight className="size-3.5" />
                      反向再编码
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {direction === 'decode' ? '输入字节（十六进制）' : '输入文本'}
                </span>
                <ClearButton onClick={() => setInput('')} disabled={!input} />
              </div>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  direction === 'decode'
                    ? 'D6 D0 CE C4，也支持 0xD6D0CEC4、换行与空格分隔'
                    : '输入要编码的文本，支持中文与 Emoji'
                }
                spellCheck={false}
                className="min-h-32 resize-none font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">示例</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => {
                    setDirection('decode');
                    setSource('gbk');
                    setTarget('utf-8');
                    setInput(EXAMPLE_GBK_HEX);
                  }}
                >
                  GBK 的「中文」= D6D0CEC4
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => {
                    setDirection('encode');
                    setTarget('utf-8');
                    setInput('中文');
                  }}
                >
                  文本 → UTF-8
                </Button>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <ResultBox
                label={direction === 'decode' ? '解码结果' : '字节（十六进制 + ASCII）'}
                value={conversion.text}
                error={conversion.error}
                onCopy={() => copyText(conversion.text)}
                rows="min-h-32"
              />
              <StatGrid>
                <Stat
                  label="输入字节"
                  value={String(conversion.inputBytes)}
                  hint={formatBytes(conversion.inputBytes)}
                />
                <Stat
                  label="输出字节"
                  value={String(conversion.outputBytes)}
                  hint={formatBytes(conversion.outputBytes)}
                />
                <Stat
                  label="字节变化"
                  value={conversion.ok ? signed(conversion.outputBytes - conversion.inputBytes) : '-'}
                  tone={conversion.ok && conversion.outputBytes < conversion.inputBytes ? 'success' : 'info'}
                />
                <Stat
                  label={direction === 'decode' ? '字符数' : '码点数'}
                  value={
                    conversion.ok
                      ? direction === 'decode'
                        ? String(Array.from(conversion.text).length)
                        : String(Array.from(input).length)
                      : '-'
                  }
                />
              </StatGrid>
            </div>
          </div>

          {conversion.ok && conversion.text.includes('\ufffd') && (
            <Note tone="danger" title="输出里出现了替换字符 U+FFFD">
              说明部分字节在「{findEncoding(source)?.name ?? source}」里没有定义，它们已经被丢弃，无法还原成原始字符。
            </Note>
          )}

          <Note tone="warn" title="浏览器能做的只有解码">
            扩展不做任何在线转码，所有转换都在本机内存中完成。浏览器只提供 <code>TextDecoder</code>：它能解码
            UTF-8/16/32、Latin 系列以及 GBK / GB18030 / BIG5 / Shift_JIS / EUC-JP / EUC-KR 等旧编码，但
            <strong className="font-medium text-foreground">没有任何编码器</strong>，因此「文本 → GBK 字节」这类方向
            无法在这里完成；扩展也刻意不内置 GBK / BIG5 这类庞大的映射表，避免给出错误结果。这类转换请用桌面工具处理。
          </Note>
          <LinkList items={EXTERNAL_TOOLS} />
        </>
      )}

      {tab === 'repair' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">输入乱码文本</span>
                <ClearButton
                  onClick={() => {
                    setInput('');
                    setAdopted('');
                  }}
                  disabled={!input}
                />
              </div>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="粘贴乱码，例如 ä½ å¥½，ä¸ç"
                spellCheck={false}
                className="min-h-32 resize-none font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">示例</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => setInput(latin1Mojibake('你好，世界！'))}
                >
                  UTF-8 被按 Latin-1 误读
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => setInput(latin1Mojibake('“引号”'))}
                >
                  弯引号被按 Windows-1252 误读
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => setInput(latin1Mojibake(latin1Mojibake('双重乱码示例')))}
                >
                  双重乱码
                </Button>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <ResultBox
                label="修复结果（点候选里的「采用」写入）"
                value={adopted}
                onCopy={() => copyText(adopted)}
                rows="min-h-32"
              />
              <Note tone="info" title="怎么判断可信度">
                候选会把乱码按该编码重新打包成字节，再按 UTF-8 严格解析；只有字节能无损往返时才给出结果。
                可信度只是根据「中文字符占比、是否含控制符/私用区字符」给的提示，最终请以人眼可读性为准。
              </Note>
            </div>
          </div>

          <Section title="候选方案" description="从最可能的还原结果排到无法在本地处理的候选">
            {input === '' ? (
              <EmptyHint>输入乱码文本后，这里会列出所有可能的还原方向</EmptyHint>
            ) : (
              <ul className="flex min-w-0 flex-col gap-2">
                {repaired.map((candidate) => (
                  <li key={candidate.id}>
                    <CandidateRow
                      candidate={candidate}
                      onAdopt={() => setAdopted(candidate.text)}
                      adopted={adopted === candidate.text && candidate.text !== ''}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {input !== '' && adopted !== '' && (
            <Section title="修复前后对照">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">修复前</span>
                  <div className="min-h-24 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2.5 font-mono text-xs scrollbar-thin">
                    {input}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">修复后</span>
                    <Button size="sm" variant="ghost" onClick={() => copyText(adopted)}>
                      <Copy className="size-3.5" />
                      复制
                    </Button>
                  </div>
                  <div className="min-h-24 overflow-auto whitespace-pre-wrap rounded-md border bg-emerald-500/20 p-2.5 font-mono text-xs scrollbar-thin">
                    {adopted}
                  </div>
                </div>
              </div>
            </Section>
          )}

          <Note tone="warn" title="为什么有些乱码本地修不了">
            「UTF-8 被按 GBK 误读」这类乱码的修复需要{' '}
            <strong className="font-medium text-foreground">GBK 编码器</strong>
            ，而浏览器只有解码器； 如果原始字节已经被替换字符覆盖，信息就彻底丢失，任何工具都救不回来。
            下面这些情况请把乱码文件交给桌面工具（扩展不会猜）。
          </Note>
          <LinkList items={EXTERNAL_TOOLS.slice(0, 2)} />
        </>
      )}

      {tab === 'reference' && (
        <>
          <Section title="编码速查表" description="「解码」指字节 → 文本，「编码」指文本 → 字节">
            <div className="overflow-auto rounded-md border scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="text-left">
                    <th className="px-2 py-1 font-medium">编码</th>
                    <th className="px-2 py-1 font-medium">别名</th>
                    <th className="px-2 py-1 font-medium">说明</th>
                    <th className="px-2 py-1 font-medium">解码</th>
                    <th className="px-2 py-1 font-medium">编码</th>
                  </tr>
                </thead>
                <tbody>
                  {ENCODINGS.map((info) => (
                    <tr key={info.id} className="border-t align-top">
                      <td className="px-2 py-1">
                        <span className="font-mono">{info.name}</span>
                        {info.note && <p className="font-sans text-[10px] text-muted-foreground">{info.note}</p>}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {info.aliases.join('、')}
                      </td>
                      <td className="px-2 py-1 font-sans">{info.description}</td>
                      <td
                        className={`px-2 py-1 font-sans ${info.decode === 'none' ? 'text-muted-foreground' : info.decode === 'native' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                      >
                        {decodeLabel(info)}
                      </td>
                      <td
                        className={`px-2 py-1 font-sans ${info.encode === 'none' ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}
                      >
                        {encodeLabel(info)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Note tone="info" title="包含关系与常见叫法">
            <ul className="mt-1 space-y-0.5">
              <li>
                · 简体中文：GB2312 ⊂ GBK ⊂ GB18030，GB18030 覆盖全部 Unicode 码点；浏览器把 gb2312 直接当 GBK 解码。
              </li>
              <li>· 日文：Shift_JIS 的 Windows 扩展变体叫 CP932 / MS932；EUC-JP 是另一套 EUC 系编码。</li>
              <li>· 韩文：EUC-KR 的 Windows 扩展变体叫 CP949 / UHC。</li>
              <li>· 繁体：BIG5 的 Windows 扩充变体叫 CP950，扩展更多字符的叫 Big5-HKSCS。</li>
              <li>· 西文：Latin-1 是字节直译；Windows-1252 在 0x80-0x9F 放了欧元与弯引号；ISO-8859-15 只改了 9 处。</li>
            </ul>
          </Note>

          <Note tone="warn" title="浏览器受限清单">
            <ul className="mt-1 space-y-0.5">
              <li>
                · 「仅解码」的项目依赖浏览器的 TextDecoder，不同浏览器/Firefox
                版本可能有差异，下拉框里的可用项以实际探测结果为准。
              </li>
              <li>
                · <strong className="font-medium text-foreground">本扩展不实现旧编码的编码器</strong>，所以「文本 →
                GBK/BIG5/Shift_JIS」在这里一定失败，这是刻意的。
              </li>
              <li>· UTF-7 已被 RFC 3502 废弃且有安全隐患，浏览器不提供，这里也不实现。</li>
            </ul>
          </Note>
          <LinkList items={EXTERNAL_TOOLS} />
        </>
      )}
    </ToolPanel>
  );
}

function safeByteLength(text: string): number {
  try {
    return hexToBytes(text).length;
  } catch {
    return 0;
  }
}

/** 用与工具完全相同的路径生成乱码示例，避免写死可能出错的字面量。 */
function latin1Mojibake(text: string): string {
  try {
    return decodeBytes(utf8ToBytes(text), 'latin1');
  } catch {
    return text;
  }
}

function CandidateRow({
  candidate,
  onAdopt,
  adopted,
}: {
  candidate: MojibakeCandidate;
  onAdopt: () => void;
  adopted: boolean;
}) {
  const badgeTone =
    candidate.confidence === 'high'
      ? 'text-emerald-600 dark:text-emerald-400'
      : candidate.confidence === 'medium'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {candidate.ok ? (
            <Wrench className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{candidate.label}</span>
          <span className={`text-[11px] ${badgeTone}`}>
            {confidenceLabel(candidate.confidence)}
            {candidate.ok ? ` · ${candidate.score} 分` : ''}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {candidate.ok && (
            <>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`复制 ${candidate.label} 的修复结果`}
                onClick={() => copyText(candidate.text)}
              >
                <Copy className="size-3.5" />
                复制
              </Button>
              <Button size="sm" variant={adopted ? 'default' : 'outline'} onClick={onAdopt}>
                {adopted ? '已采用' : '采用'}
              </Button>
            </>
          )}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{candidate.direction}</p>
      {candidate.ok ? (
        <p className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs">{candidate.text}</p>
      ) : (
        <p className="rounded bg-muted/40 px-2 py-1 text-[11px] text-destructive">{candidate.error}</p>
      )}
      {candidate.notes.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {candidate.notes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      )}
      {candidate.external && (
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 px-2 py-1 font-mono text-[10px] scrollbar-thin">
            {candidate.external}
          </pre>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`复制 ${candidate.label} 的外部命令`}
            onClick={() => copyText(candidate.external ?? '')}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
