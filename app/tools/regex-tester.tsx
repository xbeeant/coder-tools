import { ArrowRight, Code2, Copy, Eraser, Flag, Gauge, Replace } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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

export default function RegexTester() {
  const [tab, setTab] = useState<Tab>('test');
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<string>>(() => new Set(['g']));
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');

  const flagString = useMemo(() => FLAG_CHARS.filter((f) => flags.has(f)).join(''), [flags]);

  const compiled = useMemo(() => compileRegex(pattern, flagString), [pattern, flagString]);

  const matches = useMemo(() => {
    if (!compiled.ok || pattern === '') return [];
    return findMatches(compiled.re, text);
  }, [compiled, pattern, text]);

  const highlightHtml = useMemo(() => buildHighlightHtml(matches, text), [matches, text]);

  const replaceResult = useMemo(
    () => (pattern === '' ? '' : applyReplacement(text, pattern, flagString, replacement)),
    [flagString, pattern, replacement, text],
  );

  const groupNames = useMemo(() => (compiled.ok ? namedGroupNames(compiled.re) : []), [compiled]);

  const timing = useMemo(() => {
    if (!compiled.ok || pattern === '' || text === '') return null;
    const started = performance.now();
    const total = countMatches(compiled.re, text);
    return { ms: performance.now() - started, total };
  }, [compiled, pattern, text]);

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
    setReplacement('');
  }, []);

  const loadPreset = useCallback((presetPattern: string, presetFlags: string, sample: string) => {
    setPattern(presetPattern);
    setFlags(new Set(presetFlags.split('')));
    setText(sample);
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className={compiled.ok ? 'text-muted-foreground' : 'text-destructive'}>
              {compiled.ok ? `匹配 ${matches.length} 处` : compiled.error}
            </span>
            {timing && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Gauge className="size-3" />
                {timing.ms.toFixed(2)} ms
              </span>
            )}
            {compiled.ok && groupNames.length > 0 && (
              <span className="text-muted-foreground">命名分组：{groupNames.join(', ')}</span>
            )}
          </div>

          <div className="grid flex-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">测试文本</span>
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="在此粘贴待匹配文本…"
                spellCheck={false}
                aria-label="测试文本"
                className="min-h-40 flex-1 resize-none font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">匹配预览</span>
              <div className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed scrollbar-thin">
                {text ? (
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容已由 escapeRegexHtml 转义，仅额外包裹 <mark>
                  <span dangerouslySetInnerHTML={{ __html: compiled.ok ? highlightHtml : '' }} />
                ) : (
                  <span className="text-muted-foreground">匹配结果会高亮显示在这里</span>
                )}
              </div>
            </div>
          </div>

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
            {replacement !== '' && (
              <ResultBox
                label="替换结果"
                value={replaceResult}
                onCopy={() => void copyText(replaceResult)}
                rows="min-h-20"
              />
            )}
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
