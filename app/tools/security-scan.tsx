import { Database, FileSearch, FolderOpen, Plus, ShieldAlert, Upload, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Field, TextField } from '../components/ui/field';
import {
  EmptyHint,
  Hint,
  LinkList,
  Note,
  type NoteTone,
  Section,
  Stat,
  StatGrid,
  ToolPanel,
} from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { downloadText, pickFile, pickFiles, readAsText } from '../lib/file';
import {
  ADVISORIES,
  type Advisory,
  CATEGORY_LABEL,
  type Category,
  CODE_RULES,
  FINDING_SOURCE_LABEL,
  type Finding,
  type FindingSource,
  MAX_IMPORT_BYTES,
  mergeAdvisories,
  OFFICIAL_TOOLS,
  parseImportedAdvisories,
  reportToText,
  type ScanFile,
  type ScanReport,
  SECRET_RULES,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type Severity,
  SNAPSHOT_DATE,
  SUPPORTED_MANIFESTS,
  scanProject,
  snapshotFreshness,
} from '../lib/security-scan';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPT = '.json,.txt,.lock,.xml,.gradle,.mod,.toml,.yaml,.yml,.env,.js,.ts,.jsx,.tsx,.py,.java,.go,.php,.rb,.sh';

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
  high: 'border-destructive/40 bg-destructive/5 text-destructive',
  medium: 'border-warning/50 bg-warning/10 text-warning',
  low: 'border-info/40 bg-info/5 text-info',
  info: 'border-muted bg-muted text-muted-foreground',
};

/** 折叠行里用短标签，详情里展示完整来源名称。 */
const SOURCE_SHORT: Record<FindingSource, string> = {
  'static-rule': '静态规则',
  'cve-snapshot': 'CVE 快照',
  'imported-advisory': '导入',
};

/** 导入框的示例：只演示字段形状，不代表真实漏洞。 */
const ADVISORY_EXAMPLE = `[
  {
    "ecosystem": "npm",
    "package": "example-lib",
    "fixed": "2.0.0",
    "severity": "high",
    "cve": "CVE-2099-0001",
    "cwe": "CWE-94",
    "summary": "示例：存在命令注入",
    "advice": "升级到 2.0.0 及以上"
  }
]`;

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
  const [importedAdvisories, setImportedAdvisories] = useState<Advisory[]>([]);
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState<{ tone: NoteTone; text: string } | null>(null);

  const freshness = snapshotFreshness(new Date());

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

  /** 纯本地解析粘贴 / 选择的 JSON，校验通过后与内置规则合并去重。 */
  const applyImport = useCallback((text: string) => {
    const result = parseImportedAdvisories(text);
    if (!result.ok) {
      setImportMessage({ tone: 'danger', text: result.error });
      return;
    }
    setImportedAdvisories((prev) =>
      mergeAdvisories([...prev, ...result.advisories])
        .filter((item) => item.source === 'imported-advisory')
        .map((item) => item.advisory),
    );
    const suffix = result.skipped > 0 ? `，跳过 ${result.skipped} 条无法识别的条目` : '';
    setImportMessage({
      tone: 'success',
      text: `已导入 ${result.advisories.length} 条 advisory${suffix}；下次扫描起生效，命中来源标为「${FINDING_SOURCE_LABEL['imported-advisory']}」`,
    });
    setImportText('');
  }, []);

  const pickImportFile = useCallback(async () => {
    const file = await pickFile({ accept: '.json,.txt,application/json,text/plain' });
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setImportMessage({
        tone: 'danger',
        text: `文件超过 ${Math.floor(MAX_IMPORT_BYTES / 1024)} KB 上限，已拒绝导入`,
      });
      return;
    }
    applyImport(await readAsText(file));
  }, [applyImport]);

  const clearImport = useCallback(() => {
    setImportedAdvisories([]);
    setImportText('');
    setImportMessage({ tone: 'info', text: '已清空用户导入的 advisory' });
  }, []);

  const run = () => {
    if (files.length === 0) return;
    setReport(scanProject(files, { threshold, importedAdvisories }));
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
    setImportedAdvisories([]);
    setImportText('');
    setImportMessage(null);
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
        <div className="flex flex-row gap-1">
          <Button size="sm" disabled={files.length === 0} onClick={run}>
            <FileSearch className="size-3.5" />
            开始扫描
          </Button>
          <ClearButton onClick={reset} disabled={files.length === 0 && !report} />
        </div>
      }
    >
      <Note tone="warn" title="这不是渗透测试">
        本工具只做本地静态自检：解析你提供的清单文件、按内置漏洞快照比对版本、用正则匹配危险写法与硬编码密钥。
        全程不联网、不执行被扫描的代码，也无法发现业务逻辑漏洞、越权或运行时问题。结论请配合底部官方工具二次核对，
        真正的渗透测试必须在获得授权的目标上进行。
      </Note>

      <Note tone={freshness.level === 'stale' ? 'warn' : 'info'} title={`离线快照截至 ${SNAPSHOT_DATE}`}>
        内置 CVE 快照的截止日期为 <span className="font-mono tabular-nums">{SNAPSHOT_DATE}</span>，距现在约{' '}
        {freshness.label}（{freshness.days} 天）。
        {freshness.level === 'stale'
          ? ' 这份离线数据已超过一年，此后公开的新漏洞不会包含在内；请在下方导入最新 advisory，或用底部官方工具复核。'
          : freshness.level === 'aging'
            ? ' 快照已有一段时间未更新，建议导入最新 advisory 补充。'
            : ' 快照较新，但仍非实时同步，正式结论请以官方数据库为准。'}
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

      <Section
        title="导入外部 advisory"
        description="粘贴 JSON 或选择本地文件，纯本地解析、不联网；校验通过后与内置快照合并"
        actions={
          <Button size="sm" variant="ghost" disabled={importedAdvisories.length === 0} onClick={clearImport}>
            <X className="size-3.5" />
            移除导入
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={importText.trim() === ''}
            onClick={() => applyImport(importText)}
          >
            <Database className="size-3.5" />
            解析并合并
          </Button>
          <Button size="sm" variant="outline" onClick={() => void pickImportFile()}>
            <Upload className="size-3.5" />
            选择本地文件
          </Button>
          <span className="inline-flex items-center text-[11px] text-muted-foreground">
            已导入 <span className="font-mono tabular-nums">{importedAdvisories.length}</span> 条 · 上限{' '}
            {Math.floor(MAX_IMPORT_BYTES / 1024)} KB
          </span>
        </div>
        <Textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={ADVISORY_EXAMPLE}
          spellCheck={false}
          aria-label="待导入的 advisory JSON"
          className="min-h-28 resize-none font-mono text-[11px]"
        />
        {importMessage && (
          <Note tone={importMessage.tone} title={importMessage.tone === 'danger' ? '导入失败' : '导入结果'}>
            {importMessage.text}
          </Note>
        )}
        <Hint>
          顶层可为数组，或含 <code className="font-mono">advisories</code> /{' '}
          <code className="font-mono">vulnerabilities</code> 等数组字段的对象；每条至少需要{' '}
          <code className="font-mono">package</code>（或 <code className="font-mono">name</code>） 与{' '}
          <code className="font-mono">fixed</code>（或 <code className="font-mono">fixedVersion</code>
          ），其余字段缺失会用安全默认值补齐。
        </Hint>
        <Hint>
          结果里的来源分三类：{FINDING_SOURCE_LABEL['static-rule']}（CODE / SECRET 正则规则）、
          {FINDING_SOURCE_LABEL['cve-snapshot']}（内置 {ADVISORIES.length} 条）、
          {FINDING_SOURCE_LABEL['imported-advisory']}（本次导入，命中会在结果里单独标明）。
        </Hint>
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
                  ? 'border-success/40 bg-success/5 text-success'
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
              value={ADVISORIES.length + CODE_RULES.length + SECRET_RULES.length + importedAdvisories.length}
              hint={`依赖 + 代码 + 密钥 + 导入 ${importedAdvisories.length} 条`}
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
          <Stat
            label="快照截至"
            value={SNAPSHOT_DATE}
            tone={freshness.level === 'stale' ? 'warn' : 'info'}
            hint={`距今 ${freshness.days} 天`}
          />
          <Stat label="导入条目" value={importedAdvisories.length} hint="用户补充的 advisory" />
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
        <span className="shrink-0 rounded-sm bg-background/70 px-1 py-0.5 text-[10px] text-muted-foreground">
          {SOURCE_SHORT[finding.source]}
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
            <span className="rounded-sm bg-background/70 px-1 py-0.5 text-[10px]">
              来源：{FINDING_SOURCE_LABEL[finding.source]}
            </span>
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
