import { ArrowRight, Code2, Copy, Eraser, Flag, Gauge, Replace } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../components/ui/utils';
import {
  applyReplacement,
  buildHighlightHtml,
  compileRegex,
  countMatches,
  findMatches,
  namedGroupNames,
  REGEX_FLAGS,
  REGEX_PRESETS,
  REGEX_TOKENS,
} from '../lib/cheatsheet';

type Tab = 'test' | 'cheat' | 'preset';

const FLAG_CHARS = ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'] as const;

/** 单次参与匹配的文本上限；超长文本截断，避免同步匹配卡住主线程。 */
const MAX_TEXT_LENGTH = 20_000;
/** 结果列表最多展示的条数。 */
const MAX_MATCHES = 500;
/** 输入防抖时长，避免每敲一个键都跑一遍正则。 */
const DEBOUNCE_MS = 200;

/** 把转义序列与字符类换成占位符，避免把 \+ / [+] 之类误判成量词。 */
function simplifyRegexSource(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length) {
      out += '\u0001';
      i += 1;
    } else if (ch === '[') {
      const end = source.indexOf(']', i + 1);
      if (end === -1) {
        out += ch;
      } else {
        out += '\u0001';
        i = end;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/** 命中则返回拦截原因；null 表示未发现灾难性回溯结构。 */
function detectReDoS(pattern: string): string | null {
  const source = simplifyRegexSource(pattern);
  // 关注「( ... ) + 无界量词」结构；组内不含嵌套括号已覆盖绝大多数实际写法。
  const quantifiedGroup = /\(([^()]*)\)([+*]|\{\d+,\d*\})/g;
  let found: RegExpExecArray | null;
  while ((found = quantifiedGroup.exec(source)) !== null) {
    const body = found[1] ?? '';
    if (!body) continue;
    // 组内自带量词：如 (a+)+、(\w+)+、(a*)*、(.*)*
    if (/[+*]|\{\d+,\d*\}/.test(body)) {
      return '检测到嵌套量词（如 (a+)+、(\\w+)+、(a*)*）：组内可重复的子表达式又被外层量词反复匹配，可能触发灾难性回溯并冻结页面，已拒绝执行。请改写为不含嵌套量词的写法后再测试。';
    }
    // 组内交替且分支重叠：如 (a|a)*、(a|aa)+
    if (body.includes('|')) {
      const branches = body
        .split('|')
        .map((branch) => branch.trim())
        .filter(Boolean);
      const seen = new Set<string>();
      for (const branch of branches) {
        if (seen.has(branch)) {
          return '检测到重叠的交替分支（如 (a|a)*）：外层量词会让同一输入产生大量回溯路径，已拒绝执行。请合并重复分支或改写正则。';
        }
        seen.add(branch);
        if (branches.some((other) => other !== branch && other.startsWith(branch))) {
          return '检测到前缀重叠的交替分支（如 (a|aa)*）：外层量词会放大回溯，已拒绝执行。请改写为互斥分支。';
        }
      }
    }
  }
  return null;
}

export default function RegexTester() {
  const [tab, setTab] = useState<Tab>('test');
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<string>>(() => new Set(['g']));
  const [text, setText] = useState('');
  const [textTruncated, setTextTruncated] = useState(false);
  const [replacement, setReplacement] = useState('');

  const flagString = useMemo(() => FLAG_CHARS.filter((f) => flags.has(f)).join(''), [flags]);

  // 匹配、替换、计时都基于防抖后的输入，避免每敲一个键就同步跑一遍正则。
  const [debounced, setDebounced] = useState({ pattern: '', text: '', flags: 'g', replacement: '' });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ pattern, text, flags: flagString, replacement }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pattern, text, flagString, replacement]);

  const risk = useMemo(() => (debounced.pattern === '' ? null : detectReDoS(debounced.pattern)), [debounced.pattern]);
  const blocked = risk !== null;
  const effectiveText = useMemo(() => debounced.text.slice(0, MAX_TEXT_LENGTH), [debounced.text]);

  const compiled = useMemo(
    () => compileRegex(debounced.pattern, debounced.flags),
    [debounced.pattern, debounced.flags],
  );

  // 多取一条用于判断结果是否被「仅显示前 N 条」截断。
  const allMatches = useMemo(() => {
    if (blocked || !compiled.ok || debounced.pattern === '') return [];
    return findMatches(compiled.re, effectiveText, MAX_MATCHES + 1);
  }, [blocked, compiled, debounced.pattern, effectiveText]);
  const matchesTruncated = allMatches.length > MAX_MATCHES;
  const matches = useMemo(() => allMatches.slice(0, MAX_MATCHES), [allMatches]);

  const highlightHtml = useMemo(() => buildHighlightHtml(matches, effectiveText), [matches, effectiveText]);

  const replaceResult = useMemo(
    () =>
      blocked || debounced.pattern === '' || debounced.replacement === ''
        ? ''
        : applyReplacement(effectiveText, debounced.pattern, debounced.flags, debounced.replacement),
    [blocked, debounced.pattern, debounced.flags, debounced.replacement, effectiveText],
  );

  const groupNames = useMemo(() => (blocked || !compiled.ok ? [] : namedGroupNames(compiled.re)), [blocked, compiled]);

  const timing = useMemo(() => {
    if (blocked || !compiled.ok || debounced.pattern === '' || effectiveText === '') return null;
    const started = performance.now();
    const total = countMatches(compiled.re, effectiveText);
    return { ms: performance.now() - started, total };
  }, [blocked, compiled, debounced.pattern, effectiveText]);

  const toggleFlag = useCallback((flag: string) => {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    setPattern('');
    setText('');
    setTextTruncated(false);
    setReplacement('');
  }, []);

  const loadPreset = useCallback((presetPattern: string, presetFlags: string, sample: string) => {
    setPattern(presetPattern);
    setFlags(new Set(presetFlags.split('')));
    setText(sample);
    setTextTruncated(false);
    setTab('test');
  }, []);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Code2 className="size-4" />
          正则表达式测试
        </span>
      }
      description={`支持分组高亮、替换预览与常用模式速查`}
      actions={
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Eraser className="size-3.5" />
          清空
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="test" active={tab === 'test'}>
            测试与替换
          </TabsTrigger>
          <TabsTrigger value="cheat" active={tab === 'cheat'}>
            语法速查
          </TabsTrigger>
          <TabsTrigger value="preset" active={tab === 'preset'}>
            常用模板
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'test' && (
        <>
          <div className="flex items-center gap-1 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring">
            <span className="font-mono text-xs text-muted-foreground">/</span>
            <Input
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="正则表达式"
              spellCheck={false}
              aria-label="正则表达式"
              className="h-8 flex-1 border-0 font-mono text-xs shadow-none focus-visible:ring-0"
            />
            <span className="font-mono text-xs text-muted-foreground">/</span>
            <div className="flex items-center gap-0.5 pr-1">
              {FLAG_CHARS.map((flag) => (
                <button
                  key={flag}
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  aria-label={`标志 ${flag}：${REGEX_FLAGS.find((f) => f.flag === flag)?.name ?? ''}`}
                  className={cn(
                    'h-5 w-5 rounded font-mono text-[11px] transition-colors',
                    flags.has(flag) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  {flag}
                </button>
              ))}
            </div>
          </div>

          {blocked && (
            <Note tone="danger" title="已拒绝执行该正则">
              {risk}
            </Note>
          )}
          {textTruncated && (
            <Note tone="warn" title="测试文本已截断">
              仅保留前 {MAX_TEXT_LENGTH.toLocaleString('zh-CN')} 个字符参与匹配，避免超长文本在实时匹配时卡住页面。
            </Note>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className={blocked || !compiled.ok ? 'text-destructive' : 'text-muted-foreground'}>
              {blocked
                ? '已阻止执行危险正则'
                : compiled.ok
                  ? `匹配 ${matches.length} 处${matchesTruncated ? `（仅显示前 ${MAX_MATCHES} 条）` : ''}`
                  : compiled.error}
            </span>
            {!blocked && timing && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Gauge className="size-3" />
                {timing.ms.toFixed(2)} ms
              </span>
            )}
            {!blocked && compiled.ok && groupNames.length > 0 && (
              <span className="text-muted-foreground">命名分组：{groupNames.join(', ')}</span>
            )}
          </div>

          <div className="grid flex-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">测试文本</span>
              <Textarea
                value={text}
                onChange={(event) => {
                  const next = event.target.value;
                  setText(next.slice(0, MAX_TEXT_LENGTH));
                  setTextTruncated(next.length > MAX_TEXT_LENGTH);
                }}
                placeholder="在此粘贴待匹配文本…"
                spellCheck={false}
                aria-label="测试文本"
                className="min-h-40 flex-1 resize-none font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">匹配预览</span>
              <div className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed scrollbar-thin">
                {effectiveText ? (
                  blocked || !compiled.ok ? (
                    <span>{effectiveText}</span>
                  ) : (
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容已由 escapeRegexHtml 转义，仅额外包裹 <mark>
                    <span dangerouslySetInnerHTML={{ __html: highlightHtml }} />
                  )
                ) : (
                  <span className="text-muted-foreground">匹配结果会高亮显示在这里</span>
                )}
              </div>
            </div>
          </div>

          {matchesTruncated && (
            <Hint>
              匹配结果超过 {MAX_MATCHES} 条，仅显示前 {MAX_MATCHES} 条，请缩小测试文本或收紧正则。
            </Hint>
          )}
          {matches.length > 0 && (
            <div className="max-h-32 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed scrollbar-thin">
              {matches.map((match, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 只读列表，行内无状态，index 作 key 稳定
                <div key={index} className="flex gap-2 border-b py-0.5 last:border-0">
                  <span className="w-10 shrink-0 text-muted-foreground">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{match.text === '' ? '(空匹配)' : match.text}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    @{match.index}-{match.end}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center gap-1 text-xs font-medium">
              <Replace className="size-3.5" />
              替换预览
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <TextField
                label="替换为"
                value={replacement}
                onChange={setReplacement}
                placeholder="支持 $1 $2 $<name> 引用分组"
              />
              <div className="flex items-end text-[11px] text-muted-foreground">
                <Hint>用 $1、$2 引用捕获组，$& 代表整个匹配，$$ 为字面量 $。</Hint>
              </div>
            </div>
            {replacement !== '' && !blocked && (
              <ResultBox
                label="替换结果"
                value={replaceResult}
                onCopy={() => void copyText(replaceResult)}
                rows="min-h-20"
              />
            )}
            {blocked && replacement !== '' && <Hint>该正则已被拦截，替换预览已停用；改写正则后会自动恢复。</Hint>}
          </div>

          {matches.length > 0 && matches[0] && matches[0].groups.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">首条匹配的分组</span>
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="p-1.5 text-left font-medium">组</th>
                      <th className="p-1.5 text-left font-medium">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches[0].groups.map((group) => (
                      <tr key={group.index} className="border-t">
                        <td className="p-1.5 font-mono">{group.name === '0' ? '整个匹配' : `$${group.name}`}</td>
                        <td className="p-1.5 font-mono">{group.value === '' ? '(未参与)' : group.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'cheat' && (
        <>
          <Note tone="warn" title="性能与陷阱">
            嵌套量词（如 (a+)+）容易在特定输入下触发灾难性回溯；能用具体字符类就别写 .*；邮箱、HTML
            这类复杂结构优先用成熟库而不是正则硬刚。
          </Note>
          <Section
            title={
              <span className="inline-flex items-center gap-1">
                <Flag className="size-3.5" />
                标志 flags
              </span>
            }
          >
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="p-1.5 text-left font-medium">标志</th>
                    <th className="p-1.5 text-left font-medium">名称</th>
                    <th className="p-1.5 text-left font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {REGEX_FLAGS.map((flag) => (
                    <tr key={flag.flag} className="border-t align-top">
                      <td className="p-1.5 font-mono font-medium">{flag.flag}</td>
                      <td className="p-1.5">{flag.name}</td>
                      <td className="p-1.5 text-muted-foreground">{flag.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="元字符与分组速查" description="JavaScript / PCRE 通用部分">
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="p-1.5 text-left font-medium">写法</th>
                    <th className="p-1.5 text-left font-medium">名称</th>
                    <th className="p-1.5 text-left font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {REGEX_TOKENS.map((token) => (
                    <tr key={token.token} className="border-t align-top">
                      <td className="whitespace-nowrap p-1.5 font-mono font-medium">{token.token}</td>
                      <td className="whitespace-nowrap p-1.5">{token.name}</td>
                      <td className="p-1.5 text-muted-foreground">{token.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {tab === 'preset' && (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {REGEX_PRESETS.map((preset) => (
              <Section key={preset.title} title={preset.title} description={preset.desc}>
                <code className="block overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-[11px]">
                  /{preset.pattern}/{preset.flags}
                </code>
                <div className="mt-1 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyText(preset.pattern)}
                    aria-label={`复制 ${preset.title} 正则`}
                  >
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => loadPreset(preset.pattern, preset.flags, preset.sample)}
                  >
                    载入测试
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </Section>
            ))}
          </div>
          {REGEX_PRESETS.length === 0 && <EmptyHint>暂无模板</EmptyHint>}
        </>
      )}
    </ToolPanel>
  );
}
