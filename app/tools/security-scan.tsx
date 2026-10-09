import { FileSearch, FolderOpen, Plus, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Field, TextField } from '../components/ui/field';
import { EmptyHint, Hint, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { downloadText, pickFiles, readAsText } from '../lib/file';
import {
  ADVISORIES,
  CATEGORY_LABEL,
  type Category,
  CODE_RULES,
  type Finding,
  OFFICIAL_TOOLS,
  reportToText,
  type ScanFile,
  type ScanReport,
  SECRET_RULES,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type Severity,
  SUPPORTED_MANIFESTS,
  scanProject,
} from '../lib/security-scan';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPT = '.json,.txt,.lock,.xml,.gradle,.mod,.toml,.yaml,.yml,.env,.js,.ts,.jsx,.tsx,.py,.java,.go,.php,.rb,.sh';

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
  high: 'border-destructive/40 bg-destructive/5 text-destructive',
  medium: 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low: 'border-sky-500/40 bg-sky-500/5 text-sky-600 dark:text-sky-400',
  info: 'border-muted bg-muted text-muted-foreground',
};

/** 批量读取待检文件：跳过超限文件，同名文件以最后一份为准。 */
async function pickAndRead(): Promise<ScanFile[]> {
  const picked = await pickFiles({ accept: ACCEPT, multiple: true });
  const usable = picked.filter((file) => file.size <= MAX_FILE_BYTES).slice(0, 40);
  const items = await Promise.all(usable.map(async (file) => ({ name: file.name, content: await readAsText(file) })));
  return items;
}

export default function SecurityScanTool() {
  const [files, setFiles] = useState<ScanFile[]>([]);
  const [threshold, setThreshold] = useState<Severity>('high');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [expanded, setExpanded] = useState<string>('');
  const [pasteName, setPasteName] = useState('');
  const [pasteBody, setPasteBody] = useState('');

  const visible = useMemo(() => {
    if (!report) return [];
    return report.findings.filter(
      (item) =>
        (categoryFilter === 'all' || item.category === categoryFilter) &&
        (severityFilter === 'all' || item.severity === severityFilter),
    );
  }, [report, categoryFilter, severityFilter]);

  const addPasted = () => {
    const name = pasteName.trim() || 'pasted.txt';
    if (pasteBody.trim() === '') return;
    setFiles((prev) => [...prev.filter((item) => item.name !== name), { name, content: pasteBody }]);
    setPasteBody('');
  };

  const run = () => {
    if (files.length === 0) return;
    setReport(scanProject(files, { threshold }));
    setExpanded('');
  };

  const reset = () => {
    setFiles([]);
    setReport(null);
    setPasteBody('');
    setPasteName('');
    setCategoryFilter('all');
    setSeverityFilter('all');
    setExpanded('');
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="size-4" />
          本地安全自检
        </span>
      }
      description="静态检查依赖漏洞、危险写法与硬编码密钥，全部在浏览器内完成"
      actions={
        <>
          <Button size="sm" disabled={files.length === 0} onClick={run}>
            <FileSearch className="size-3.5" />
            开始扫描
          </Button>
          <ClearButton onClick={reset} disabled={files.length === 0 && !report} />
        </>
      }
    >
      <Note tone="warn" title="这不是渗透测试">
        本工具只做本地静态自检：解析你提供的清单文件、按内置漏洞快照比对版本、用正则匹配危险写法与硬编码密钥。
        全程不联网、不执行被扫描的代码，也无法发现业务逻辑漏洞、越权或运行时问题。结论请配合底部官方工具二次核对，
        真正的渗透测试必须在获得授权的目标上进行。
      </Note>

      <Section title="待检文件" description={`支持 ${SUPPORTED_MANIFESTS.length} 种清单与任意源码文本，单文件上限 2MB`}>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void pickAndRead().then((items) => setFiles((prev) => dedupe([...prev, ...items])))}
          >
            <FolderOpen className="size-3.5" />
            选择文件
          </Button>
          {files.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setFiles([])}>
              清空列表
            </Button>
          )}
        </div>
        {files.length === 0 ? (
          <EmptyHint>选择依赖清单或源码文件，或在下方直接粘贴内容</EmptyHint>
        ) : (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {files.map((file) => (
              <li key={file.name} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{file.content.split('\n').length} 行</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0"
                  aria-label={`移除 ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((item) => item.name !== file.name))}
                >
                  <X className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Field label="或直接粘贴内容" hint="按文件名自动识别清单类型，例如 package.json、requirements.txt、main.py">
          <div className="flex flex-col gap-1.5">
            <TextField
              label="文件名"
              value={pasteName}
              placeholder="package.json"
              onChange={setPasteName}
              inputClassName="h-7"
            />
            <Textarea
              value={pasteBody}
              onChange={(event) => setPasteBody(event.target.value)}
              placeholder='{"dependencies":{"lodash":"4.17.15"}}'
              spellCheck={false}
              className="min-h-24 resize-none font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={pasteBody.trim() === ''}
              onClick={addPasted}
            >
              <Plus className="size-3.5" />
              加入列表
            </Button>
          </div>
        </Field>
      </Section>

      <Section title="扫描结果" description="按严重度排序，展开可查看证据与修复建议">
        {report ? (
          <>
            <StatGrid>
              {SEVERITY_ORDER.map((severity) => (
                <button
                  key={severity}
                  type="button"
                  aria-pressed={severityFilter === severity}
                  className="text-left"
                  onClick={() => setSeverityFilter(severityFilter === severity ? 'all' : severity)}
                >
                  <Stat
                    label={SEVERITY_LABEL[severity]}
                    value={report.stats[severity]}
                    tone={
                      severity === 'critical' || severity === 'high'
                        ? 'danger'
                        : severity === 'medium'
                          ? 'warn'
                          : 'info'
                    }
                    hint={severityFilter === severity ? '已筛选' : '点击筛选'}
                    className={severityFilter === severity ? 'border-primary' : undefined}
                  />
                </button>
              ))}
            </StatGrid>
            <div
              className={`rounded-md border px-2.5 py-2 text-[11px] ${
                report.gate.passed
                  ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                  : 'border-destructive/40 bg-destructive/5 text-destructive'
              }`}
            >
              质量门禁（{SEVERITY_LABEL[threshold]}及以上）：{report.gate.message}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Select
                ariaLabel="按分类筛选"
                value={categoryFilter}
                options={[
                  { value: 'all', label: `全部分类（${report.totals.findings}）` },
                  ...(Object.keys(CATEGORY_LABEL) as Category[]).map((key) => ({
                    value: key,
                    label: `${CATEGORY_LABEL[key]}（${report.categories[key]}）`,
                  })),
                ]}
                onChange={(value) => setCategoryFilter(value as Category | 'all')}
              />
              <Select
                ariaLabel="按严重度筛选"
                value={severityFilter}
                options={[
                  { value: 'all', label: '全部严重度' },
                  ...SEVERITY_ORDER.map((severity) => ({ value: severity, label: SEVERITY_LABEL[severity] })),
                ]}
                onChange={(value) => setSeverityFilter(value as Severity | 'all')}
              />
            </div>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5">
              {visible.length === 0 ? (
                <EmptyHint className="py-4">当前筛选条件下没有问题</EmptyHint>
              ) : (
                visible.map((item) => (
                  <FindingRow
                    key={`${item.rule}-${item.file}-${item.line}`}
                    finding={item}
                    open={expanded === `${item.rule}-${item.file}-${item.line}`}
                    onToggle={() =>
                      setExpanded((prev) =>
                        prev === `${item.rule}-${item.file}-${item.line}`
                          ? ''
                          : `${item.rule}-${item.file}-${item.line}`,
                      )
                    }
                  />
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadText('security-scan-report.txt', reportToText(report))}
                aria-label="下载 txt 报告"
              >
                下载报告 txt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText('security-scan-report.json', `${JSON.stringify(report, null, 2)}\n`, 'application/json')
                }
                aria-label="下载 json 报告"
              >
                下载 json
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copyText(reportToText(report))} aria-label="复制报告">
                复制报告
              </Button>
            </div>
          </>
        ) : (
          <EmptyHint>选择文件后点击「开始扫描」，结果会显示在这里</EmptyHint>
        )}
      </Section>

      <Section title="门禁阈值" description="发布前的自检标准：达到该严重度即视为不通过">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Select
            label="阻断级别"
            value={threshold}
            options={SEVERITY_ORDER.map((severity) => ({
              value: severity,
              label: `${SEVERITY_LABEL[severity]}及以上`,
            }))}
            onChange={(value) => setThreshold(value as Severity)}
            hint="改后需要重新扫描才会生效"
          />
          <StatGrid className="lg:grid-cols-2">
            <Stat
              label="规则总量"
              value={ADVISORIES.length + CODE_RULES.length + SECRET_RULES.length}
              hint="依赖 + 代码 + 密钥"
            />
            <Stat
              label="扫描规模"
              value={report ? `${report.totals.files} 文件 / ${report.totals.lines} 行` : `${files.length} 文件`}
              hint={report ? `${report.totals.durationMs} ms` : '尚未扫描'}
            />
          </StatGrid>
        </div>
      </Section>

      <Section title="支持的清单类型" description="只解析依赖声明，源码文件走正则规则">
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {SUPPORTED_MANIFESTS.map((item) => (
            <li key={item.name} className="flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px]">{item.name}</span>
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{item.ecosystem}</span>
              </div>
              <span className="text-[11px] leading-relaxed text-muted-foreground">{item.description}</span>
            </li>
          ))}
        </ul>
        {report && report.skipped.length > 0 && (
          <Note tone="info" title="版本无法判定，需人工核对">
            {report.skipped.join('、')}
          </Note>
        )}
      </Section>

      <Section title="规则覆盖" description="本地快照不是权威数据库，正式结论请用官方工具复核">
        <StatGrid>
          <Stat
            label="依赖漏洞规则"
            value={ADVISORIES.length}
            hint="覆盖 npm / PyPI / Maven / Go / crates / Composer"
          />
          <Stat label="危险用法规则" value={CODE_RULES.length} hint="JS / Python / Java / Go / PHP" />
          <Stat label="密钥特征" value={SECRET_RULES.length} hint="命中即脱敏展示" />
          <Stat label="依赖生态" value={6} hint="每个生态挑选公开高危漏洞" />
        </StatGrid>
        <Hint>
          依赖比对只看「版本是否低于修复版本」，不做可达性分析；带 <code>*</code>、<code>latest</code>{' '}
          或范围约束的版本会被跳过并在上方列出。
        </Hint>
      </Section>

      <Section title="官方工具与数据库" description="点击跳转，在你自己的环境中执行；本工具不会代你发起请求">
        <LinkList items={OFFICIAL_TOOLS} columns={3} />
      </Section>
    </ToolPanel>
  );
}

function dedupe(items: ScanFile[]): ScanFile[] {
  const map = new Map<string, ScanFile>();
  for (const item of items) map.set(item.name, item);
  return [...map.values()];
}

function FindingRow({ finding, open, onToggle }: { finding: Finding; open: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-md border ${SEVERITY_STYLE[finding.severity]}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        aria-expanded={open}
      >
        <span className="shrink-0 rounded bg-background/70 px-1 py-0.5 text-[10px]">
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{finding.title}</span>
        <span className="shrink-0 text-[10px] opacity-80">
          {finding.file ? `${finding.file.split('/').pop()}:${finding.line}` : '依赖'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 border-t border-current/15 px-2 py-1.5 text-[11px]">
          <div className="flex flex-wrap gap-1.5 text-muted-foreground">
            <span className="rounded bg-background/70 px-1 py-0.5 text-[10px]">{finding.rule}</span>
            <span className="rounded bg-background/70 px-1 py-0.5 text-[10px]">{CATEGORY_LABEL[finding.category]}</span>
            <span className="rounded bg-background/70 px-1 py-0.5 text-[10px]">
              {finding.file || '依赖清单'}
              {finding.line > 0 ? `:${finding.line}` : ''}
            </span>
          </div>
          {finding.extra && <span className="text-muted-foreground">{finding.extra}</span>}
          <pre className="overflow-x-auto rounded bg-background/70 p-1.5 font-mono text-[10px] leading-relaxed">
            {finding.evidence}
          </pre>
          <span className="text-foreground">建议：{finding.advice}</span>
        </div>
      )}
    </div>
  );
}
