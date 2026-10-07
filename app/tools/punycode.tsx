import { ArrowLeftRight, Network, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { EmptyHint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { utf8ToBytes } from '../lib/bytes';
import { domainToAscii, domainToUnicode, punycodeDecode, punycodeEncode } from '../lib/punycode';

type Mode = 'domain' | 'string' | 'batch';
type Direction = 'encode' | 'decode';

const DOMAIN_EXAMPLES = ['例子.测试', 'münchen.de', '日本語.jp', '🏳️‍🌈.ws', 'xn--fsqu00a.xn--0zwm56d'];
const STRING_EXAMPLES = ['例子', 'münchen', '日本語', '🏳️‍🌈', 'bücher'];

/** 从混合输入里拆出域名：忽略 URL 的协议与路径，按空白/逗号/分号切分。 */
function splitDomains(text: string): string[] {
  return text
    .split(/[\s,;、，]+/)
    .map((item) =>
      item
        .trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .replace(/\/.*$/, ''),
    )
    .filter((item) => item.length > 0);
}

interface DomainRow {
  input: string;
  output: string;
  /** 输入本身是否已经是纯 ASCII */
  isAscii: boolean;
  /** UTF-8 字节数变化 */
  byteDelta: number;
  issues: string[];
}

/** 校验 ASCII 侧的域名：标签长度、连字符位置、xn-- 标签的 punycode 合法性。 */
function inspectAsciiDomain(domain: string): string[] {
  const issues: string[] = [];
  const labels = domain.split('.');
  if (labels.length < 2) issues.push('域名至少需要两段（主机名 + 顶级域）');
  if (domain.replace(/\./g, '').length > 253) issues.push('域名总长度超过 253 个字符');
  for (const label of labels) {
    if (label.length === 0) {
      issues.push('存在空标签（连续的点）');
      continue;
    }
    if (label.length > 63) issues.push(`标签 ${truncate(label)} 超过 63 个字符`);
    if (label.startsWith('-') || label.endsWith('-')) issues.push(`标签 ${label} 以连字符开头或结尾`);
    if (!isAsciiText(label)) {
      issues.push(`标签 ${truncate(label)} 仍含非 ASCII 字符`);
      continue;
    }
    if (/^xn--/i.test(label)) {
      const body = label.slice(4).toLowerCase();
      try {
        const decoded = punycodeDecode(body);
        if (decoded.length === 0) issues.push(`标签 ${label} 的 punycode 解码结果为空`);
        else if (punycodeEncode(decoded).toLowerCase() !== body) issues.push(`标签 ${label} 不是规范的 punycode 写法`);
        else if (!/^[\p{L}\p{M}\p{N}-]+$/u.test(decoded)) {
          issues.push(`标签 ${label} 解码后含非字母/数字/组合符字符（IDNA 字符集不含空格、下划线、标点与 Emoji）`);
        } else if (decoded.startsWith('-') || decoded.endsWith('-')) {
          issues.push(`标签 ${label} 解码后以连字符开头或结尾`);
        }
      } catch (error) {
        issues.push(`标签 ${label} 不是合法 punycode：${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }
    if (!/^[a-z0-9-]+$/i.test(label)) issues.push(`标签 ${label} 含不允许的字符（只允许字母、数字与连字符）`);
  }
  return issues;
}

function truncate(text: string): string {
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
}

/** 是否只含 ASCII 字符（DNS 与 punycode 的基本前提）。 */
function isAsciiText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

function byteLength(text: string): number {
  return utf8ToBytes(text).length;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function Punycode() {
  const [mode, setMode] = useState<Mode>('domain');
  const [direction, setDirection] = useState<Direction>('encode');
  const [input, setInput] = useState('');
  const [withPrefix, setWithPrefix] = useState(true);

  const domains = useMemo(() => (mode === 'domain' ? splitDomains(input) : []), [input, mode]);

  const domainRows = useMemo<DomainRow[]>(
    () =>
      domains.map((domain) => {
        const output = direction === 'encode' ? domainToAscii(domain) : domainToUnicode(domain);
        const asciiSide = direction === 'encode' ? output : domain;
        return {
          input: domain,
          output,
          isAscii: isAsciiText(domain),
          byteDelta: byteLength(output) - byteLength(domain),
          issues: inspectAsciiDomain(asciiSide),
        };
      }),
    [domains, direction],
  );

  const domainOutput = useMemo(() => domainRows.map((row) => row.output).join('\n'), [domainRows]);

  const stringResult = useMemo<{ ok: true; output: string } | { ok: false; error: string }>(() => {
    if (!input) return { ok: true, output: '' };
    try {
      if (direction === 'encode') {
        const encoded = punycodeEncode(input);
        return { ok: true, output: withPrefix ? `xn--${encoded}` : encoded };
      }
      const body = withPrefix ? input.replace(/^xn--/i, '') : input;
      return { ok: true, output: punycodeDecode(body) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [input, direction, withPrefix]);

  const batchRows = useMemo(() => {
    if (mode !== 'batch') return [];
    return input.split('\n').map((line, index) => {
      const source = line.trim();
      if (!source) return { key: `blank-${index}`, input: line, output: '', ok: true, blank: true, error: '' };
      try {
        const output =
          direction === 'encode'
            ? withPrefix
              ? `xn--${punycodeEncode(source)}`
              : punycodeEncode(source)
            : punycodeDecode(withPrefix ? source.replace(/^xn--/i, '') : source);
        return { key: `row-${index}`, input: line, output, ok: true, blank: false, error: '' };
      } catch (error) {
        return {
          key: `row-${index}`,
          input: line,
          output: '',
          ok: false,
          blank: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }, [input, mode, direction, withPrefix]);

  const batchOutput = useMemo(
    () =>
      batchRows
        .filter((row) => !row.blank)
        .map((row) => row.output)
        .join('\n'),
    [batchRows],
  );

  const swap = () => {
    if (mode === 'domain') {
      if (!domainOutput) return;
      setInput(domainOutput);
      setDirection(direction === 'encode' ? 'decode' : 'encode');
      return;
    }
    if (mode === 'string') {
      if (!stringResult.ok || !stringResult.output) return;
      setInput(stringResult.output);
      setDirection(direction === 'encode' ? 'decode' : 'encode');
      return;
    }
    if (!batchOutput) return;
    setInput(batchOutput);
    setDirection(direction === 'encode' ? 'decode' : 'encode');
  };

  const output =
    mode === 'domain' ? domainOutput : mode === 'string' ? (stringResult.ok ? stringResult.output : '') : batchOutput;
  const error = mode === 'string' && !stringResult.ok ? stringResult.error : null;
  const examples = mode === 'domain' ? DOMAIN_EXAMPLES : STRING_EXAMPLES;

  const batchStats = useMemo(
    () => ({
      total: batchRows.filter((row) => !row.blank).length,
      ok: batchRows.filter((row) => !row.blank && row.ok).length,
      failed: batchRows.filter((row) => !row.ok).length,
    }),
    [batchRows],
  );

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Network className="size-4" />
          Punycode 编解码
        </span>
      }
      description="RFC 3492：国际化域名与 xn-- ASCII 形式互转，支持中文、日文与 Emoji 域名"
      actions={
        <>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="domain">域名</TabsTrigger>
              <TabsTrigger value="string">字符串</TabsTrigger>
              <TabsTrigger value="batch">批量</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={swap} disabled={!output}>
            <ArrowLeftRight className="size-3.5" />
            互换
          </Button>
        </>
      }
    >
      <Section
        title={
          mode === 'domain'
            ? direction === 'encode'
              ? '国际化域名 → punycode'
              : 'punycode → 国际化域名'
            : mode === 'string'
              ? '字符串编解码'
              : '批量转换（每行一条）'
        }
        description={
          mode === 'domain'
            ? '可一次粘贴多个域名，用逗号、空格或换行分隔；URL 会自动去掉协议与路径'
            : mode === 'string'
              ? '对任意 Unicode 字符串做 RFC 3492 编解码，与域名标签使用的是同一套算法'
              : '按行独立处理，失败的行会保留错误信息，不会中断整批转换'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              label={direction === 'encode' ? '加 xn-- 前缀' : '去掉 xn-- 前缀'}
              checked={withPrefix}
              onChange={setWithPrefix}
              disabled={mode === 'domain'}
            />
            <Tabs value={direction} onValueChange={(value) => setDirection(value as Direction)}>
              <TabsList>
                <TabsTrigger value="encode">编码</TabsTrigger>
                <TabsTrigger value="decode">解码</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {mode === 'domain' ? `输入域名（${domains.length} 个）` : '输入'}
              </span>
              <ClearButton onClick={() => setInput('')} disabled={!input} />
            </div>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                mode === 'domain'
                  ? '例子.测试\nmünchen.de\n日本語.jp'
                  : mode === 'string'
                    ? direction === 'encode'
                      ? '输入任意 Unicode 字符串，例如 例子 或 🏳️‍🌈'
                      : '输入 punycode 字符串，例如 xn--fsqu00a'
                    : '每行一条字符串，逐行转换'
              }
              spellCheck={false}
              className="min-h-32 resize-none font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">示例</span>
              {examples.map((example) => (
                <Button
                  key={example}
                  size="sm"
                  variant="ghost"
                  onClick={() => setInput(example)}
                  className="h-6 px-1.5"
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <ResultBox
              label={mode === 'domain' ? '转换结果' : mode === 'string' ? '编解码结果' : '批量结果'}
              value={output}
              error={error}
              onCopy={() => copyText(output)}
              rows="min-h-32"
            />
            {mode === 'string' ? (
              <StatGrid>
                <Stat label="码点数" value={String(Array.from(input).length)} />
                <Stat label="UTF-8 字节" value={String(byteLength(input))} />
                <Stat
                  label="输出长度"
                  value={stringResult.ok ? String(stringResult.output.length) : '-'}
                  hint={stringResult.ok ? `增幅 ${signed(stringResult.output.length - input.length)}` : undefined}
                />
                <Stat
                  label="结果字节"
                  value={stringResult.ok ? String(byteLength(stringResult.output)) : '-'}
                  tone={stringResult.ok && stringResult.output.length < input.length ? 'success' : 'info'}
                />
              </StatGrid>
            ) : mode === 'batch' ? (
              <StatGrid>
                <Stat label="有效行数" value={String(batchStats.total)} />
                <Stat label="成功" value={String(batchStats.ok)} tone="success" />
                <Stat label="失败" value={String(batchStats.failed)} tone={batchStats.failed > 0 ? 'danger' : 'info'} />
                <Stat
                  label="字节增幅"
                  value={signed(byteLength(batchOutput) - byteLength(input))}
                  hint="输出相对输入的 UTF-8 字节变化"
                />
              </StatGrid>
            ) : (
              <StatGrid>
                <Stat label="域名总数" value={String(domainRows.length)} />
                <Stat label="需要转换" value={String(domainRows.filter((row) => !row.isAscii).length)} tone="success" />
                <Stat label="已是 ASCII" value={String(domainRows.filter((row) => row.isAscii).length)} />
                <Stat
                  label="校验异常"
                  value={String(domainRows.filter((row) => row.issues.length > 0).length)}
                  tone={domainRows.some((row) => row.issues.length > 0) ? 'warn' : 'info'}
                />
              </StatGrid>
            )}
          </div>
        </div>
      </Section>

      {mode === 'domain' && (
        <Section title="逐个域名对照" description="校验 ASCII 一侧：标签长度、连字符位置与 xn-- 标签的 punycode 合法性">
          {domainRows.length === 0 ? (
            <EmptyHint>输入域名后，这里会逐行展示转换结果与校验状态</EmptyHint>
          ) : (
            <div className="min-h-0 overflow-auto rounded-md border scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="text-left">
                    <th className="px-2 py-1 font-medium">原域名</th>
                    <th className="px-2 py-1 font-medium">punycode</th>
                    <th className="px-2 py-1 font-medium">已是 ASCII</th>
                    <th className="px-2 py-1 font-medium">长度变化</th>
                    <th className="px-2 py-1 font-medium">校验</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {domainRows.map((row) => (
                    <tr key={row.input} className="border-t align-top">
                      <td className="px-2 py-1">{row.input}</td>
                      <td className="px-2 py-1 break-all">
                        {row.output}
                        <button
                          type="button"
                          className="ml-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                          aria-label={`复制 ${row.output}`}
                          onClick={() => copyText(row.output)}
                        >
                          复制
                        </button>
                      </td>
                      <td className="px-2 py-1">{row.isAscii ? '是' : '否'}</td>
                      <td className="px-2 py-1 tabular-nums">{signed(row.byteDelta)} B</td>
                      <td className="px-2 py-1 font-sans">
                        {row.issues.length === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">正常</span>
                        ) : (
                          <ul className="space-y-0.5 text-amber-600 dark:text-amber-400">
                            {row.issues.map((issue) => (
                              <li key={issue}>· {issue}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {mode === 'batch' && (
        <Section
          title="逐行对照"
          description="左右两栏分别是原始行与转换结果，失败的行会说明原因"
          actions={
            <Button size="sm" variant="ghost" disabled={!batchOutput} onClick={() => copyText(batchOutput)}>
              复制全部
            </Button>
          }
        >
          {batchRows.filter((row) => !row.blank).length === 0 ? (
            <EmptyHint>每行输入一条字符串后，这里会逐行展示结果</EmptyHint>
          ) : (
            <div className="min-h-0 overflow-auto rounded-md border scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60">
                  <tr className="text-left">
                    <th className="w-1/2 px-2 py-1 font-medium">输入</th>
                    <th className="w-1/2 px-2 py-1 font-medium">输出</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {batchRows.map((row) =>
                    row.blank ? null : (
                      <tr key={row.key} className="border-t align-top">
                        <td className="px-2 py-1 break-all">{row.input}</td>
                        <td className="px-2 py-1 break-all">
                          {row.ok ? row.output : <span className="font-sans text-destructive">失败：{row.error}</span>}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section
        title="关于 Punycode"
        description="RFC 3492 是 IDNA 的底层算法，两者不是一回事"
        actions={
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wand2 className="size-3.5" />
            全部在本机计算
          </span>
        }
      >
        <Note tone="info" title="Punycode 与 IDNA 的关系">
          Punycode（RFC 3492）只负责把一个 Unicode 标签压成 ASCII 串，输出形如 <code>xn--fsqu00a</code>； IDNA（RFC 5890
          / 5891）是在它之上的一整套域名规则：大小写折叠、名字规范化、禁用字符、标签长度与
          方向性检查，以及区分「全角/半角」「软连字符」等。真正注册国际域名时由注册局按 IDNA 校验， 本工具只做 Punycode
          这一层，所以校验结果仅作参考。
        </Note>
        <Note tone="success" title="为什么中文域名要转 punycode">
          DNS 只保存 0x00-0x7F 的字节，没有地方存中文。中文域名的实际存储形式就是把每个非 ASCII 标签转成
          <code> xn-- </code> 前缀的 punycode，例如 <code>例子.测试</code> 存成
          <code> xn--fsqu00a.xn--0zwm56d</code>；浏览器再按 Punycode 解码显示成中文。
        </Note>
        <Note tone="warn" title="常见坑">
          <ul className="mt-1 space-y-0.5">
            <li>
              · 大小写：域名不区分大小写，<code>xn--</code> 标签转小写后再解码才符合规范。
            </li>
            <li>
              · 连字符：<code>xn--</code> 前缀本身含两个连字符，域名的 <code>--</code> 在第 3、4 位是保留的 ACE 前缀。
            </li>
            <li>· 长度：单个标签 ≤ 63 字符、整域名 ≤ 253 字符；punycode 会让长度明显变长，Emoji 域名尤其明显。</li>
            <li>· Emoji 与组合符：旗帜、肤色等是多个码点的组合，punycode 按码点逐个编码，不能拆开看。</li>
            <li>· 软连字符 U+00AD、零宽字符会被 IDNA 丢弃或拒绝，但本工具会原样编码，属于预期行为差异。</li>
          </ul>
        </Note>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="size-3.5" />
          点上方「示例」按钮可以直接把示例填进输入框；「互换」按钮把结果回填为输入并切换编码/解码方向。
        </p>
      </Section>
    </ToolPanel>
  );
}
