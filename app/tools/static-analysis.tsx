import {
  Bug,
  ClipboardPaste,
  Copy,
  Download,
  FileSearch,
  FileUp,
  ListFilter,
  Radar,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, TextField } from '../components/ui/field';
import { Hint, Note, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName, pickFile, readAsText } from '../lib/file';
import {
  analyze,
  DEFAULT_OPTIONS,
  filterIssues,
  GROUP_META,
  type Issue,
  type Lang,
  type RuleGroup,
  type RuleSeverity,
  renderJsonReport,
  renderMarkdownReport,
  ruleDocs,
  SEVERITY_META,
  scoreOf,
} from '../lib/static-rules';

type ViewTab = 'issues' | 'report' | 'rules';

const SAMPLE_JS = `import { exec } from 'child_process';

const API_SECRET = "sk_live_9f3a2b7c4d";

export function saveUser(form) {
  var payload = { name: form.name, role: form.role };
  document.querySelector('#bio').innerHTML = form.bio;
  if (form.role == 'admin') {
    payload.isAdmin = true;
  }
  try {
    persist(payload);
  } catch (e) {}
  console.log('saving', payload);
  // analyze-disable-next-line
  const legacy = eval('persist(payload)');
  for (const tag of form.tags) {
    await syncTag(tag);
  }
  const page = parseInt(form.page);
  debugger;
  return exec('echo done');
}
`;

const SAMPLE_PY = `import os
import pickle

TOKEN = "ghp_abcdefgh123456"

def load_profile(blob, cache={}):
    profile = pickle.loads(blob)
    try:
        os.system("cat " + blob)
    except:
        pass
    if profile == None:
        return None
    assert profile is not None
    for part in profile["parts"]:
        cache["name"] = cache["name"] + part
    return cache
`;

const LANG_OPTIONS = [
  { value: 'auto', label: '自动识别' },
  { value: 'js', label: 'JavaScript / TypeScript' },
  { value: 'python', label: 'Python' },
];

const SEVERITY_OPTIONS: { value: RuleSeverity; label: string }[] = [
  { value: 'error', label: SEVERITY_META.error.label },
  { value: 'warn', label: SEVERITY_META.warn.label },
  { value: 'info', label: SEVERITY_META.info.label },
];

const GROUP_OPTIONS: { value: RuleGroup; label: string }[] = [
  { value: 'security', label: GROUP_META.security.label },
  { value: 'quality', label: GROUP_META.quality.label },
  { value: 'performance', label: GROUP_META.performance.label },
];

const TONE_CLASS: Record<RuleSeverity, string> = {
  error: 'bg-destructive/10 text-destructive border-destructive/40',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40',
  info: 'bg-muted text-muted-foreground border-border',
};

export default function StaticAnalysisTool() {
  const [code, setCode] = useState(SAMPLE_JS);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [filter, setFilter] = useState<{ severities: RuleSeverity[]; groups: RuleGroup[]; onlyActive: boolean }>({
    severities: ['error', 'warn', 'info'],
    groups: ['security', 'quality', 'performance'],
    onlyActive: true,
  });
  const [tab, setTab] = useState<ViewTab>('issues');
  const [fileError, setFileError] = useState<string | null>(null);

  const result = useMemo(() => analyze(code, options), [code, options]);
  const issues = useMemo(() => filterIssues(result.issues, filter), [filter, result.issues]);
  const activeIssues = useMemo(() => issues.filter((item) => !item.ignored), [issues]);
  const score = useMemo(() => scoreOf(result.stats), [result.stats]);
  const markdown = useMemo(
    () => renderMarkdownReport(result, issues, { title: '静态代码分析报告', maxItems: 60 }),
    [issues, result],
  );
  const json = useMemo(() => renderJsonReport(result, issues), [issues, result]);
  const docs = useMemo(() => ruleDocs(), []);

  const patch = (delta: Partial<typeof options>) => setOptions((prev) => ({ ...prev, ...delta }));
  const toggleIn = <T extends string>(list: T[], value: T, checked: boolean): T[] =>
    checked ? [...list, value] : list.filter((item) => item !== value);

  const toggleGroupOption = (group: RuleGroup, checked: boolean) => {
    patch({ groups: toggleIn(options.groups, group, checked) });
  };

  const loadFile = async () => {
    setFileError(null);
    const file = await pickFile({ accept: '.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.txt' });
    if (file === null) return;
    const text = await readAsText(file);
    setCode(text);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Radar className="size-4" />
          静态代码分析
        </span>
      }
      description="正则 + 行级检查，覆盖安全隐患、代码质量与性能三类规则；不上传任何代码"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={loadFile}>
            <FileUp className="size-3.5" />
            读取文件
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={activeIssues.length === 0}
            onClick={() => downloadText(exportName('static-analysis', 'md'), markdown, 'text/markdown;charset=utf-8')}
          >
            <Download className="size-3.5" />
            导出报告
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as ViewTab)}>
        <TabsList>
          <TabsTrigger value="issues" active={tab === 'issues'}>
            <span className="inline-flex items-center gap-1">
              <Bug className="size-3.5" />
              问题清单
            </span>
          </TabsTrigger>
          <TabsTrigger value="report" active={tab === 'report'}>
            <span className="inline-flex items-center gap-1">
              <ScrollText className="size-3.5" />
              报告
            </span>
          </TabsTrigger>
          <TabsTrigger value="rules" active={tab === 'rules'}>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5" />
              规则清单
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              onClick={() => {
                setCode(SAMPLE_JS);
                setFileError(null);
              }}
            >
              <Sparkles className="size-3" />
              JS 示例
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              onClick={() => {
                setCode(SAMPLE_PY);
                setFileError(null);
              }}
            >
              <Sparkles className="size-3" />
              Python 示例
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              onClick={() => navigator.clipboard.readText().then(setCode)}
            >
              <ClipboardPaste className="size-3" />
              从剪贴板粘贴
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setCode('')}>
              <Trash2 className="size-3" />
              清空
            </Button>
            <span className="text-[11px] text-muted-foreground">
              识别为 <code className="font-mono">{result.lang === 'js' ? 'JS/TS' : 'Python'}</code>（可在右侧修改）
            </span>
          </div>
          <Textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="粘贴要检查的代码"
            spellCheck={false}
            aria-label="待分析代码"
            className="min-h-64 flex-1 resize-none font-mono text-xs"
          />
          {fileError !== null && (
            <Note tone="danger" title="读取文件失败">
              {fileError}
            </Note>
          )}
          <Hint>
            <FileSearch className="size-3" />
            代码只在本页面内存里分析，不会发送到任何服务器；分析结果与报告都由你在本地生成。
          </Hint>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="语言"
              value={options.lang}
              onChange={(value) => patch({ lang: value as Lang })}
              options={LANG_OPTIONS}
            />
            <TextField
              label="单行长度上限"
              type="number"
              value={String(options.maxLineLength)}
              onChange={(value) => patch({ maxLineLength: Number(value) || 0 })}
              inputClassName="font-mono"
              hint="0 表示不检查行宽"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">规则分类</span>
              <div className="flex flex-wrap gap-3">
                {GROUP_OPTIONS.map((item) => (
                  <Checkbox
                    key={item.value}
                    label={item.label}
                    checked={options.groups.includes(item.value)}
                    onChange={(checked) => toggleGroupOption(item.value, checked)}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">严重级别</span>
              <div className="flex flex-wrap gap-3">
                {SEVERITY_OPTIONS.map((item) => (
                  <Checkbox
                    key={item.value}
                    label={item.label}
                    checked={options.severities.includes(item.value)}
                    onChange={(checked) => patch({ severities: toggleIn(options.severities, item.value, checked) })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Checkbox
              label="尊重 analyze-disable-next-line 注释"
              checked={options.respectDisableComment}
              onChange={(checked) => patch({ respectDisableComment: checked })}
              hint="也兼容 eslint-disable-next-line / biome-ignore"
            />
            <Checkbox
              label="同时扫描注释与字符串"
              checked={options.includeComments}
              onChange={(checked) => patch({ includeComments: checked })}
              hint="默认跳过，否则文档里的示例代码会大量误报"
            />
          </div>

          <StatGrid>
            <Stat
              label="得分"
              value={`${score} / 100`}
              tone={score >= 80 ? 'success' : score >= 50 ? 'warn' : 'danger'}
              hint="高危 -12 / 建议 -5 / 提示 -1"
            />
            <Stat
              label="高危"
              value={result.stats.bySeverity.error}
              tone={result.stats.bySeverity.error > 0 ? 'danger' : 'success'}
            />
            <Stat label="建议" value={result.stats.bySeverity.warn} tone="warn" />
            <Stat label="提示" value={result.stats.bySeverity.info} />
            <Stat label="代码行" value={result.stats.codeLines} hint={`共 ${result.stats.totalLines} 行`} />
            <Stat label="启用规则" value={result.stats.scannedRules} />
            <Stat label="安全类" value={result.stats.byGroup.security} />
            <Stat label="质量类" value={result.stats.byGroup.quality} />
          </StatGrid>

          {tab === 'issues' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ListFilter className="size-3" />
                  显示：
                </span>
                {SEVERITY_OPTIONS.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={filter.severities.includes(item.value) ? 'default' : 'ghost'}
                    className="h-6 text-[11px]"
                    onClick={() =>
                      setFilter((prev) => ({
                        ...prev,
                        severities: toggleIn(prev.severities, item.value, !prev.severities.includes(item.value)),
                      }))
                    }
                  >
                    {item.label}
                  </Button>
                ))}
                {GROUP_OPTIONS.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={filter.groups.includes(item.value) ? 'secondary' : 'ghost'}
                    className="h-6 text-[11px]"
                    onClick={() =>
                      setFilter((prev) => ({
                        ...prev,
                        groups: toggleIn(prev.groups, item.value, !prev.groups.includes(item.value)),
                      }))
                    }
                  >
                    {item.label}
                  </Button>
                ))}
                <Checkbox
                  label="隐藏已忽略行"
                  checked={filter.onlyActive}
                  onChange={(checked) => setFilter((prev) => ({ ...prev, onlyActive: checked }))}
                />
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => copyText(markdown)}>
                  <Copy className="size-3" />
                  复制报告
                </Button>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-auto pr-0.5">
                {issues.length === 0 && (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    没有命中规则。可以放宽严重级别，或确认代码是否真的干净。
                  </p>
                )}
                {issues.map((item) => (
                  <IssueRow key={`${item.ruleId}-${item.line}-${item.column}`} issue={item} />
                ))}
              </div>
            </>
          )}

          {tab === 'report' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() =>
                    downloadText(exportName('static-analysis', 'json'), json, 'application/json;charset=utf-8')
                  }
                >
                  <Download className="size-3" />
                  JSON
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() =>
                    downloadText(exportName('static-analysis', 'md'), markdown, 'text/markdown;charset=utf-8')
                  }
                >
                  <Download className="size-3" />
                  Markdown
                </Button>
                <span className="text-[11px] text-muted-foreground">报告里最多列 60 条，完整数据请用 JSON。</span>
              </div>
              <ResultBox
                label="Markdown 报告"
                value={markdown}
                onCopy={() => copyText(markdown)}
                rows="min-h-72"
                fill
              />
            </>
          )}

          {tab === 'rules' && (
            <div className="flex flex-1 flex-col gap-1.5 overflow-auto pr-0.5">
              {docs.map(({ rule, example }) => (
                <div key={rule.id} className="rounded-md border px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="font-mono text-[11px]">{rule.id}</code>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[rule.severity]}`}>
                      {SEVERITY_META[rule.severity].label}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {GROUP_META[rule.group].label}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {rule.lang === 'any' ? '通用' : rule.lang === 'js' ? 'JS/TS' : 'Python'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px]">{rule.message}</p>
                  <p className="text-[11px] text-muted-foreground">修复：{rule.fix}</p>
                  <code className="mt-1 block break-all font-mono text-[10px] text-muted-foreground/80">
                    /{example}/
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Note tone="warn" title="这不是完整的静态分析">
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>基于正则与行级判断，没有 AST，也不做类型推断与数据流分析；只能抓机械化的模式。</li>
          <li>可能漏报（跨行拼接、间接调用）也可能误报（示例代码、特定框架的正常写法），结论需要人工确认。</li>
          <li>
            生产环境请用 ESLint / Biome + Semgrep / CodeQL / Ruff 这些真正的工具，本工具只适合快速自查与评审前扫一遍。
          </li>
          <li>得分只是按等级加权扣分的粗略指标，不是代码质量评分体系。</li>
        </ul>
        <p className="mt-1">
          当前命中 <strong className="font-mono">{activeIssues.length}</strong> 条待处理问题
          {issues.length !== activeIssues.length && (
            <span>（另有 {issues.length - activeIssues.length} 条在已忽略的行上）</span>
          )}
          。
        </p>
      </Note>
    </ToolPanel>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className={`rounded-md border px-2.5 py-2 ${issue.ignored ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => copyText(issue.text)}
          aria-label={`复制第 ${issue.line} 行代码`}
          title="点击复制这一行代码"
        >
          L{issue.line}:{issue.column}
        </button>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[issue.severity]}`}>
          {SEVERITY_META[issue.severity].label}
        </span>
        <code className="font-mono text-[11px]">{issue.ruleId}</code>
        {issue.ignored && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">已忽略</span>
        )}
      </div>
      <p className="mt-1 text-[11px]">{issue.message}</p>
      <p className="text-[11px] text-muted-foreground">修复：{issue.fix}</p>
      <code className="mt-1 block truncate font-mono text-[10px] text-muted-foreground/80">{issue.text}</code>
    </div>
  );
}
