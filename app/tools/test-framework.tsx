import {
  Beaker,
  Copy,
  Download,
  FileJson,
  FlaskConical,
  ListChecks,
  Play,
  ScrollText,
  ShieldAlert,
  Shuffle,
  Sigma,
  Table2,
  Tags,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, TextField } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';
import {
  ASSERTION_TEMPLATES,
  CATEGORY_META,
  type CaseCategory,
  DEFAULT_INPUT,
  type GenerateInput,
  generateCases,
  parseDomain,
  parseSignature,
  randomSamples,
  renderCsv,
  renderJson,
  renderMarkdown,
  runExpression,
  type TestKind,
} from '../lib/testcase';

type ViewTab = 'cases' | 'markdown' | 'data' | 'sandbox' | 'explain';

const KIND_OPTIONS = [
  { value: 'function', label: '单元测试（函数 / 工具）' },
  { value: 'api', label: '接口测试（HTTP API）' },
];

const CATEGORY_OPTIONS: { value: CaseCategory; label: string }[] = [
  { value: 'happy', label: CATEGORY_META.happy.label },
  { value: 'equivalence', label: CATEGORY_META.equivalence.label },
  { value: 'boundary', label: CATEGORY_META.boundary.label },
  { value: 'exception', label: CATEGORY_META.exception.label },
  { value: 'security', label: CATEGORY_META.security.label },
  { value: 'performance', label: CATEGORY_META.performance.label },
];

const PRIORITY_TONE: Record<string, string> = {
  P0: 'bg-red-500/15 text-red-600 dark:text-red-400',
  P1: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  P2: 'bg-muted text-muted-foreground',
};

export default function TestFrameworkTool() {
  const [input, setInput] = useState<GenerateInput>(DEFAULT_INPUT);
  const [tab, setTab] = useState<ViewTab>('cases');
  const [filter, setFilter] = useState<'all' | CaseCategory>('all');
  const [expr, setExpr] = useState('value === expected');
  const [scopeText, setScopeText] = useState('{\n  "value": 3,\n  "expected": 3\n}');
  const [sandboxRun, setSandboxRun] = useState<{ ok: boolean; value: string; error: string | null } | null>(null);
  const [randomSeed, setRandomSeed] = useState(2026);
  const [randomCount, setRandomCount] = useState(5);

  const suite = useMemo(() => generateCases(input), [input]);
  const markdown = useMemo(() => renderMarkdown(suite, input), [input, suite]);
  const json = useMemo(() => renderJson(suite, input), [input, suite]);
  const csv = useMemo(() => renderCsv(suite), [suite]);
  const params = useMemo(() => parseSignature(input.signature), [input.signature]);
  const range = useMemo(() => parseDomain(input.domain), [input.domain]);

  const patch = (delta: Partial<GenerateInput>) => setInput((prev) => ({ ...prev, ...delta }));
  const toggleCategory = (category: CaseCategory, checked: boolean) => {
    setInput((prev) => ({
      ...prev,
      categories: checked ? [...prev.categories, category] : prev.categories.filter((item) => item !== category),
    }));
  };

  const visible = suite.cases.filter((item) => filter === 'all' || item.category === filter);
  const randomList = useMemo(() => randomSamples(params, randomCount, randomSeed), [params, randomCount, randomSeed]);

  const run = () => {
    let scope: Record<string, unknown> = {};
    try {
      const parsed: unknown = scopeText.trim() === '' ? {} : JSON.parse(scopeText);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        scope = parsed as Record<string, unknown>;
      } else {
        setSandboxRun({ ok: false, value: '', error: '作用域必须是一个 JSON 对象，例如 {"a": 1}' });
        return;
      }
    } catch (error) {
      setSandboxRun({
        ok: false,
        value: '',
        error: `作用域 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    const result = runExpression(expr, scope);
    setSandboxRun({ ok: result.ok, value: result.value, error: result.error });
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Beaker className="size-4" />
          测试用例生成
        </span>
      }
      description="按等价类、边界值与错误推测生成用例，可导出 Markdown / JSON / CSV"
      actions={
        <>
          <Button size="sm" variant="outline" disabled={suite.cases.length === 0} onClick={() => copyText(markdown)}>
            <Copy className="size-3.5" />
            复制 Markdown
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={suite.cases.length === 0}
            onClick={() => downloadText(exportName('test-cases', 'md'), markdown, 'text/markdown;charset=utf-8')}
          >
            <Download className="size-3.5" />
            导出
          </Button>
        </>
      }
    >
      <Note tone="info" title="使用提示">
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            <ListChecks className="size-3" /> 建议顺序：正常流程 → 等价类 → 边界值 → 异常 → 安全 → 性能，P0 优先补齐。
          </li>
          <li>
            <FlaskConical className="size-3" /> 断言写法先用沙盒验证，再抄进 vitest / jest / pytest 里。
          </li>
          <li>
            <ShieldAlert className="size-3" /> 导出文件里只有用例描述，不含任何被测代码或真实数据。
          </li>
        </ul>
      </Note>
      <Tabs value={tab} onValueChange={(value) => setTab(value as ViewTab)}>
        <TabsList>
          <TabsTrigger value="cases" active={tab === 'cases'}>
            <span className="inline-flex items-center gap-1">
              <Table2 className="size-3.5" />
              用例
            </span>
          </TabsTrigger>
          <TabsTrigger value="markdown" active={tab === 'markdown'}>
            <span className="inline-flex items-center gap-1">
              <ScrollText className="size-3.5" />
              Markdown
            </span>
          </TabsTrigger>
          <TabsTrigger value="data" active={tab === 'data'}>
            <span className="inline-flex items-center gap-1">
              <FileJson className="size-3.5" />
              JSON / CSV
            </span>
          </TabsTrigger>
          <TabsTrigger value="sandbox" active={tab === 'sandbox'}>
            <span className="inline-flex items-center gap-1">
              <Play className="size-3.5" />
              断言沙盒
            </span>
          </TabsTrigger>
          <TabsTrigger value="explain" active={tab === 'explain'}>
            <span className="inline-flex items-center gap-1">
              <Sigma className="size-3.5" />
              方法说明
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3 overflow-auto pr-0.5">
          <Section title="被测对象">
            <div className="flex flex-col gap-2">
              <Select
                label="测试类型"
                value={input.kind}
                onChange={(value) => patch({ kind: value as TestKind })}
                options={KIND_OPTIONS}
                hint={input.kind === 'api' ? '会额外生成越权、限流、重放等接口专属用例' : '按函数入参推导用例'}
              />
              <TextField
                label={input.kind === 'api' ? '接口 / 方法名' : '函数名'}
                value={input.name}
                onChange={(value) => patch({ name: value })}
                placeholder="calcDiscount"
                inputClassName="font-mono"
              />
              <TextField
                label="签名（形参: 类型）"
                value={input.signature}
                onChange={(value) => patch({ signature: value })}
                placeholder="price: number, level?: number"
                inputClassName="font-mono"
                hint={
                  params.length === 0
                    ? '没有解析到参数，等价类与边界值会退化'
                    : `解析到 ${params.length} 个参数：${params.map((item) => `${item.name}${item.optional ? '?' : ''}:${item.type}`).join('、')}`
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label="返回类型"
                  value={input.returnType}
                  onChange={(value) => patch({ returnType: value })}
                  placeholder="number"
                  inputClassName="font-mono"
                />
                <TextField
                  label="取值域"
                  value={input.domain}
                  onChange={(value) => patch({ domain: value })}
                  placeholder="0-100"
                  inputClassName="font-mono"
                  hint={
                    range === null ? '识别不了 min-max，数值边界会用默认值' : `已识别为 ${range.min} ~ ${range.max}`
                  }
                />
              </div>
              <Textarea
                value={input.rule}
                onChange={(event) => patch({ rule: event.target.value })}
                placeholder="业务规则，例如：满 200 减 30；level 为 1~3 的会员等级"
                spellCheck={false}
                aria-label="业务规则"
                className="min-h-16 resize-none text-xs"
              />
            </div>
          </Section>

          <Section title="覆盖范围">
            <div className="flex flex-col gap-1.5">
              {CATEGORY_OPTIONS.map((option) => (
                <Checkbox
                  key={option.value}
                  label={option.label}
                  hint={CATEGORY_META[option.value as CaseCategory].desc}
                  checked={input.categories.includes(option.value as CaseCategory)}
                  onChange={(checked) => toggleCategory(option.value as CaseCategory, checked)}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="每个边界的取值数量"
                value={String(input.level)}
                onChange={(value) => patch({ level: Number(value) })}
                options={[
                  { value: '1', label: '1 条（最精简）' },
                  { value: '2', label: '2 条（推荐）' },
                  { value: '3', label: '3 条（更全）' },
                ]}
              />
              <TextField
                label="标签"
                value={input.tags.join('、')}
                onChange={(value) =>
                  patch({ tags: value === '' ? [] : value.split(/[、,，\s]+/).filter((item) => item !== '') })
                }
                placeholder="单元测试"
              />
            </div>
            <Checkbox
              label="包含「省略可选参数」用例"
              checked={input.hasOptional}
              onChange={(checked) => patch({ hasOptional: checked })}
              hint="只有签名里存在 a? 形式的参数时才会生成"
            />
          </Section>

          <Section title="随机入参" description="同一种子结果可复现，不联网">
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label="数量"
                type="number"
                value={String(randomCount)}
                onChange={(value) => setRandomCount(Number(value) || 1)}
                inputClassName="w-20 font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRandomSeed((prev) => prev + 1)}
                aria-label="换一批随机数据"
              >
                <Shuffle className="size-3.5" />
                换一批
              </Button>
            </div>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
              {randomList.map((item, index) => `${index + 1}. ${item}`).join('\n')}
            </pre>
            <Hint>随机值只是入参样例，真正的断言还要靠你自己的实现；种子 {randomSeed} 可复现同一批数据。</Hint>
          </Section>
        </div>

        <div className="flex flex-col gap-2">
          {tab === 'cases' && (
            <>
              <StatGrid>
                <Stat label="用例总数" value={suite.cases.length} />
                <Stat
                  label="P0"
                  value={suite.cases.filter((item) => item.priority === 'P0').length}
                  tone="danger"
                  hint="必测"
                />
                <Stat
                  label="参数个数"
                  value={params.length}
                  hint={range === null ? '无取值域' : `${range.min}~${range.max}`}
                />
                <Stat label="分类数" value={suite.summary.length} />
              </StatGrid>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'ghost'}
                  className="h-6 text-[11px]"
                  onClick={() => setFilter('all')}
                >
                  全部
                </Button>
                {suite.summary.map((item) => (
                  <Button
                    key={item.category}
                    size="sm"
                    variant={filter === item.category ? 'default' : 'ghost'}
                    className="h-6 text-[11px]"
                    onClick={() => setFilter(item.category)}
                  >
                    {CATEGORY_META[item.category].label} {item.count}
                  </Button>
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-auto pr-0.5">
                {visible.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">该分类下没有用例</p>
                )}
                {visible.map((item) => (
                  <article key={item.id} className="rounded-md border px-2.5 py-2">
                    <header className="flex flex-wrap items-center gap-1.5">
                      <code className="font-mono text-[11px] text-muted-foreground">{item.id}</code>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_TONE[item.priority]}`}>
                        {item.priority}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {CATEGORY_META[item.category].label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.title}</span>
                    </header>
                    <dl className="mt-1.5 flex flex-col gap-1 text-[11px]">
                      <div className="flex gap-1.5">
                        <dt className="w-14 shrink-0 text-muted-foreground">输入</dt>
                        <dd className="min-w-0 flex-1 break-all font-mono text-muted-foreground">{item.input}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="w-14 shrink-0 text-muted-foreground">步骤</dt>
                        <dd className="min-w-0 flex-1">
                          <ol className="flex list-decimal flex-col gap-0.5 pl-4 text-muted-foreground">
                            {item.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="w-14 shrink-0 text-muted-foreground">预期</dt>
                        <dd className="min-w-0 flex-1 text-muted-foreground">{item.expected}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="w-14 shrink-0 text-muted-foreground">标签</dt>
                        <dd className="flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 text-muted-foreground">
                              <Tags className="size-2.5" />
                              {tag}
                            </span>
                          ))}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}

          {tab === 'markdown' && (
            <ResultBox label="测试用例.md" value={markdown} onCopy={() => copyText(markdown)} rows="min-h-96" fill />
          )}

          {tab === 'data' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => downloadText(exportName('test-cases', 'json'), json, 'application/json;charset=utf-8')}
                >
                  <Download className="size-3" />
                  下载 JSON
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => downloadText(exportName('test-cases', 'csv'), csv, 'text/csv;charset=utf-8')}
                >
                  <Download className="size-3" />
                  下载 CSV
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => copyText(json)}>
                  <Copy className="size-3" />
                  复制 JSON
                </Button>
              </div>
              <ResultBox
                label="JSON（可直接喂给测试平台）"
                value={json}
                onCopy={() => copyText(json)}
                rows="min-h-48"
              />
              <ResultBox label="CSV（Excel / 禅道）" value={csv} onCopy={() => copyText(csv)} rows="min-h-48" fill />
            </>
          )}

          {tab === 'sandbox' && (
            <>
              <Note tone="warn" title="沙盒能做什么">
                只用 <code className="font-mono">new Function</code> 在当前页面里算一个表达式，
                用来快速验证断言写法。执行前会静态拦截 <code className="font-mono">fetch</code>、
                <code className="font-mono">window</code>、<code className="font-mono">eval</code>{' '}
                等标识，因此无法访问网络、文件或 DOM； 但它<strong>不是</strong>
                真正的安全隔离环境，不要在这里粘贴机密数据。
              </Note>
              <Textarea
                value={expr}
                onChange={(event) => setExpr(event.target.value)}
                placeholder="value === expected"
                spellCheck={false}
                aria-label="断言表达式"
                className="min-h-16 resize-none font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {ASSERTION_TEMPLATES.map((item) => (
                  <Button
                    key={item.name}
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    title={item.desc}
                    onClick={() => setExpr(item.expr)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <Textarea
                  value={scopeText}
                  onChange={(event) => setScopeText(event.target.value)}
                  placeholder='{"value": 3, "expected": 3}'
                  spellCheck={false}
                  aria-label="作用域变量（JSON）"
                  className="min-h-20 resize-none font-mono text-[11px]"
                />
                <Button onClick={run}>
                  <Play className="size-3.5" />
                  执行
                </Button>
              </div>
              <ResultBox
                label="执行结果"
                value={sandboxRun === null ? '' : sandboxRun.ok ? sandboxRun.value : ''}
                error={sandboxRun?.error ?? null}
                onCopy={() => copyText(sandboxRun?.value ?? '')}
                rows="min-h-24"
              />
            </>
          )}

          {tab === 'explain' && (
            <div className="flex flex-1 flex-col gap-3 overflow-auto pr-0.5">
              <Section title="这些用例是怎么来的">
                <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  {CATEGORY_OPTIONS.map((option) => (
                    <li key={option.value}>
                      <strong className="font-medium text-foreground">{option.label}</strong>：
                      {CATEGORY_META[option.value as CaseCategory].desc}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="局限">
                <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  <li>全部按规则模板推导，没有做 AST 或覆盖率分析；业务特有的分支需要你自己补充。</li>
                  <li>
                    签名只支持 <code className="font-mono">name: type</code> 与{' '}
                    <code className="font-mono">name?: type</code>，复杂对象类型只按名字猜测。
                  </li>
                  <li>取值域只识别 min-max 区间；枚举、格式约束（如手机号、URL）不会自动展开。</li>
                  <li>错误推测与安全用例来自通用经验清单，可能与你的系统无关，用前先筛一遍。</li>
                  <li>随机入参由本地伪随机数生成，同种子可复现；不保证覆盖到有效数据格式。</li>
                </ul>
              </Section>
              <Section title="接给自己的测试框架">
                <ResultBox
                  label="导出结构"
                  value={`${suite.cases.length} 条用例 → JSON 结构：
{
  "id": "TC-01",
  "title": "……",
  "category": "boundary",
  "priority": "P1",
  "precondition": "……",
  "steps": ["……"],
  "input": "……",
  "expected": "……",
  "tags": ["边界值"]
}`}
                />
                <Hint>把 JSON 里的 id 当数据驱动测试的用例名，steps 映射到具体断言即可。</Hint>
              </Section>
            </div>
          )}
        </div>
      </div>

      {suite.notes.length > 0 && (
        <Note tone="warn" title="生成时的提醒">
          <ul className="flex flex-col gap-1">
            {suite.notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Note>
      )}
    </ToolPanel>
  );
}
