import { Copy, Download, GitBranch, GitMerge, Search, ShieldCheck, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  BRANCH_PATTERNS,
  BRANCH_PROTECTION_CONCEPTS,
  BUG_REPORT_TEMPLATE,
  CHANGELOG_FORMAT,
  CLI_COMMANDS,
  CODEOWNERS_FILE,
  CODEOWNERS_SYNTAX,
  COMMIT_SCOPES,
  COMMIT_TO_SEMVER,
  CONFLICT_RESOLVE,
  CONVENTIONAL_COMMITS,
  DEPENDABOT_YAML,
  GH_CI_GO_YAML,
  GH_CI_PY_YAML,
  GH_CI_YAML,
  GITATTRIBUTES,
  GITCONFIG_SNIPPET,
  GITLAB_CI_YAML,
  GITMESSAGE_TEMPLATE,
  HOSTING_COMPARISON_HEADERS,
  HOSTING_LINKS,
  HOSTING_PLATFORMS,
  MERGE_STRATEGIES,
  PLATFORM_TRAPS,
  PR_TEMPLATE,
  RELEASE_NOTE_TEMPLATE,
  REVIEW_CHECKLIST,
  SEMVER_RULES,
  WORKFLOW_FLOW_STEPS,
  WORKFLOWS,
  type WorkflowStep,
} from '../lib/cheatsheet';
import { downloadText, exportName } from '../lib/file';

type MainTab = 'compare' | 'cli' | 'review' | 'flow' | 'config';

interface ConfigSnippet {
  id: string;
  name: string;
  path: string;
  content: string;
  note: string;
}

const SNIPPETS: ConfigSnippet[] = [
  {
    id: 'ci-node',
    name: 'CI（Node）',
    path: '.github/workflows/ci.yml',
    content: GH_CI_YAML,
    note: 'lint + Node 矩阵测试 + 构建 + 缓存',
  },
  {
    id: 'ci-py',
    name: 'CI（Python）',
    path: '.github/workflows/ci.yml',
    content: GH_CI_PY_YAML,
    note: 'Python 版本矩阵 + ruff + pytest',
  },
  {
    id: 'ci-go',
    name: 'CI（Go）',
    path: '.github/workflows/ci.yml',
    content: GH_CI_GO_YAML,
    note: 'go vet + race 测试 + 构建',
  },
  {
    id: 'dependabot',
    name: 'Dependabot',
    path: '.github/dependabot.yml',
    content: DEPENDABOT_YAML,
    note: '依赖与 Actions 更新，含分组规则',
  },
  {
    id: 'bug',
    name: '缺陷模板',
    path: '.github/ISSUE_TEMPLATE/bug_report.md',
    content: BUG_REPORT_TEMPLATE,
    note: '要求贴完整报错原文与复现步骤',
  },
  {
    id: 'pr',
    name: 'PR 模板',
    path: '.github/pull_request_template.md',
    content: PR_TEMPLATE,
    note: '含验证方式与回滚方案两节',
  },
  {
    id: 'codeowners',
    name: 'CODEOWNERS',
    path: '.github/CODEOWNERS',
    content: CODEOWNERS_FILE,
    note: '顺序即优先级，最后一行兜底',
  },
  {
    id: 'gitlab-ci',
    name: 'GitLab CI',
    path: '.gitlab-ci.yml',
    content: GITLAB_CI_YAML,
    note: '带缓存与 coverage 报告产物',
  },
  {
    id: 'gitmessage',
    name: '提交模板',
    path: '~/.gitmessage',
    content: GITMESSAGE_TEMPLATE,
    note: 'git commit -t 使用',
  },
  {
    id: 'gitconfig',
    name: 'gitconfig',
    path: '~/.gitconfig',
    content: GITCONFIG_SNIPPET,
    note: '别名、rebase 策略与大仓库性能',
  },
  {
    id: 'gitattributes',
    name: 'gitattributes',
    path: '.gitattributes',
    content: GITATTRIBUTES,
    note: '统一行尾 + 语言统计准确性',
  },
  {
    id: 'changelog',
    name: 'CHANGELOG',
    path: 'CHANGELOG.md',
    content: CHANGELOG_FORMAT,
    note: 'Keep a Changelog 风格',
  },
  {
    id: 'release-note',
    name: 'Release Note',
    path: 'RELEASE_NOTES.md',
    content: RELEASE_NOTE_TEMPLATE,
    note: '含升级步骤与校验方式',
  },
];

/** 分支拓扑示意图：节点按数据里的 x/y 摆放，边用折线连接。 */
function BranchGraph({ flow }: { flow: WorkflowStep }) {
  const width = 400;
  const height = 170;
  const kinds: Record<WorkflowStep['nodes'][number]['kind'], { fill: string; text: string }> = {
    main: { fill: 'var(--primary)', text: 'var(--primary-foreground)' },
    branch: { fill: 'var(--muted)', text: 'var(--foreground)' },
    commit: { fill: 'var(--accent)', text: 'var(--foreground)' },
    tag: { fill: 'var(--destructive)', text: 'var(--primary-foreground)' },
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${flow.title} 分支拓扑`}>
      {flow.edges.map(([from, to]) => {
        const a = flow.nodes[from];
        const b = flow.nodes[to];
        if (!a || !b) return null;
        const midX = (a.x + b.x) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${a.x + 10},${a.y + 10} C${midX},${a.y + 10} ${midX},${b.y + 10} ${b.x + 10},${b.y + 10}`}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1"
            opacity="0.6"
          />
        );
      })}
      {flow.nodes.map((node) => (
        <g key={`${node.label}-${node.x}-${node.y}`}>
          <circle cx={node.x + 10} cy={node.y + 10} r="9" fill={kinds[node.kind].fill} />
          <text x={node.x + 10} y={node.y + 30} fontSize="9" textAnchor="middle" fill="var(--muted-foreground)">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        aria-label={`复制 ${label}`}
        onClick={() => void copyText(value)}
      >
        <Copy className="size-3" />
      </Button>
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <code className={`min-w-0 flex-1 truncate text-[11px] ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </code>
    </li>
  );
}

export default function CodeHosting() {
  const [tab, setTab] = useState<MainTab>('compare');
  const [cliQuery, setCliQuery] = useState('');
  const [snippetId, setSnippetId] = useState(SNIPPETS[0].id);

  const cliGroups = useMemo(() => {
    const q = cliQuery.trim().toLowerCase();
    const map = new Map<string, typeof CLI_COMMANDS>();
    for (const item of CLI_COMMANDS) {
      if (q !== '' && !`${item.command} ${item.desc} ${item.example}`.toLowerCase().includes(q)) continue;
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [cliQuery]);

  const snippet = SNIPPETS.find((item) => item.id === snippetId) ?? SNIPPETS[0];

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <GitBranch className="size-4" />
          代码托管平台导航
        </span>
      }
      description={`${HOSTING_PLATFORMS.length} 个平台对比、${CLI_COMMANDS.length} 条 CLI 命令与可复制的配置文件`}
      actions={
        tab === 'cli' ? (
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={cliQuery}
              onChange={(event) => setCliQuery(event.target.value)}
              placeholder="搜索命令或说明"
              aria-label="搜索 CLI 命令"
              className="h-8 pl-7 text-xs"
            />
          </div>
        ) : undefined
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="compare" active={tab === 'compare'}>
            平台对比
          </TabsTrigger>
          <TabsTrigger value="cli" active={tab === 'cli'}>
            CLI 速查
          </TabsTrigger>
          <TabsTrigger value="review" active={tab === 'review'}>
            评审协作
          </TabsTrigger>
          <TabsTrigger value="flow" active={tab === 'flow'}>
            工作流
          </TabsTrigger>
          <TabsTrigger value="config" active={tab === 'config'}>
            配置片段
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        {tab === 'compare' && (
          <>
            <div className="flex flex-col gap-2">
              <Note tone="warn" title="数据为编写时的快照">
                免费额度、私有仓库限制与 CI 额度都会随商业策略变化，采购或迁移前请以各平台官方定价页为准。
              </Note>
              <div className="flex-1 overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                    <tr>
                      {HOSTING_COMPARISON_HEADERS.map((header) => (
                        <th key={header} className="whitespace-nowrap p-1.5 text-left font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HOSTING_PLATFORMS.map((platform) => (
                      <tr key={platform.name} className="border-t align-top">
                        <td className="whitespace-nowrap p-1.5 font-medium">
                          <a
                            href={platform.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {platform.name}
                          </a>
                        </td>
                        <td className="p-1.5">{platform.hosting}</td>
                        <td className="p-1.5">{platform.privateLimit}</td>
                        <td className="p-1.5">{platform.freeTier}</td>
                        <td className="p-1.5">{platform.ci}</td>
                        <td className="p-1.5">{platform.issue}</td>
                        <td className="p-1.5">{platform.registry}</td>
                        <td className="p-1.5">{platform.review}</td>
                        <td className="p-1.5">{platform.api}</td>
                        <td className="p-1.5">{platform.fit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="平台与关键工具官网">
                <LinkList items={HOSTING_LINKS} />
              </Section>
              <Section title="平台差异的实务影响" description="选型前先想清楚这四件事">
                <ul className="flex list-none flex-col gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    <strong className="text-foreground">迁移成本看 Actions 兼容性</strong>：Gitea / Forgejo / Codeberg
                    的 Actions 语法兼容 GitHub，但 action 版本不一定齐全；GitLab 的 CI 是另一套
                    YAML，跨平台迁移基本要重写。
                  </li>
                  <li>
                    <strong className="text-foreground">内网自建看资源占用</strong>：Gitea 几百 MB 内存即可，GitLab
                    完整版动辄 4GB 起步；差距会直接影响能否塞进现有的 CI 机器。
                  </li>
                  <li>
                    <strong className="text-foreground">需求管理看层级能力</strong>：GitLab Epics + Boards
                    是原生需求层级，GitHub 要靠 Projects 与第三方工具拼；这是产品团队选型的主要分水岭。
                  </li>
                  <li>
                    <strong className="text-foreground">开源项目先想清楚生态</strong>：几乎所有 CI 模板、action
                    与教程都围绕 GitHub，直接影响后续的上手成本。
                  </li>
                </ul>
              </Section>
              <Note tone="info" title="自建常见坑">
                <ul className="flex list-none flex-col gap-0.5">
                  {PLATFORM_TRAPS.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </Note>
            </div>
          </>
        )}

        {tab === 'cli' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              {cliGroups.length === 0 ? (
                <EmptyHint>没有匹配的命令</EmptyHint>
              ) : (
                cliGroups.map(([group, items]) => (
                  <Section key={group} title={group} description={`${items.length} 条`}>
                    <ul className="flex flex-col gap-1">
                      {items.map((item) => (
                        <li key={item.command} className="flex items-start gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="mt-0.5 size-6 shrink-0"
                            aria-label={`复制 ${item.command}`}
                            onClick={() => void copyText(item.example)}
                          >
                            <Copy className="size-3" />
                          </Button>
                          <div className="min-w-0 flex-1">
                            <code className="block truncate font-mono text-[11px]" title={item.command}>
                              {item.command}
                            </code>
                            <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                            <code
                              className="mt-0.5 block truncate rounded bg-muted/50 px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                              title={item.example}
                            >
                              {item.example}
                            </code>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ))
              )}
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <Terminal className="size-3.5" />
                    CLI 使用要点
                  </span>
                }
              >
                <ul className="flex list-none flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    <code className="font-mono">gh pr checkout</code> 会自动建分支并设置上游，配合{' '}
                    <code className="font-mono">gh pr merge --squash --delete-branch</code> 是一条完整的 PR 闭环。
                  </li>
                  <li>
                    <code className="font-mono">--json</code> 加 <code className="font-mono">--jq</code> 可以把输出 喂给
                    jq 做脚本：
                    <code className="font-mono">
                      gh pr list --json number,title --jq '.[] | "\(.number) \(.title)"'
                    </code>
                  </li>
                  <li>
                    <code className="font-mono">gh auth token</code> 的输出不要直接 echo 到日志里；脚本里用{' '}
                    <code className="font-mono">TOKEN=$(gh auth token)</code> 即可。
                  </li>
                  <li>
                    Actions 相关的操作需要 workflow 权限：<code className="font-mono">gh auth refresh -s workflow</code>
                    。
                  </li>
                  <li>
                    给 CI 用的机器账号建议设 <code className="font-mono">GH_TOKEN</code> 环境变量，而不是在脚本里登录。
                  </li>
                </ul>
              </Section>
              <Section title="常用组合速记">
                <ul className="flex flex-col gap-1">
                  <CopyRow label="建 PR 并跟踪" value="gh pr create --fill && gh pr checks --watch" />
                  <CopyRow label="本地跑 CI 同款" value="gh workflow run ci.yml -f branch=$GITHUB_REF_NAME" />
                  <CopyRow label="看失败日志" value="gh run view <id> --log-failed" />
                  <CopyRow label="取 PR 产物" value="gh run download <id> -n dist" />
                  <CopyRow label="GitLab 看流水线" value="glab ci status && glab ci trace <id>" />
                  <CopyRow label="GitLab 批量建 MR" value="glab mr create --fill --target-branch main" />
                </ul>
              </Section>
            </div>
          </>
        )}

        {tab === 'review' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="size-3.5" />
                    Code Review 检查清单
                  </span>
                }
                description="按顺序过一遍，能挡掉大部分线上问题"
              >
                <ul className="flex list-none flex-col gap-1">
                  {REVIEW_CHECKLIST.map((item, index) => (
                    <li key={item} className="flex gap-1.5 text-[11px] leading-relaxed">
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="冲突处理" description="按场景对号入座">
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left font-medium">情况</th>
                        <th className="p-1.5 text-left font-medium">处理方式</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONFLICT_RESOLVE.map((row) => (
                        <tr key={row.situation} className="border-t align-top">
                          <td className="p-1.5">{row.situation}</td>
                          <td className="p-1.5 text-muted-foreground">{row.fix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section title="分支保护概念" description="配在仓库设置里的准入规则">
                <ul className="flex list-none flex-col gap-1 text-[11px]">
                  {BRANCH_PROTECTION_CONCEPTS.map((item) => (
                    <li key={item.term} className="leading-relaxed">
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{item.term}</code>
                      <span className="ml-1 text-muted-foreground">{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="Conventional Commits" description="type 与示例">
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left font-medium">type</th>
                        <th className="p-1.5 text-left font-medium">用途</th>
                        <th className="p-1.5 text-left font-medium">示例</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONVENTIONAL_COMMITS.map((row) => (
                        <tr key={row.type} className="border-t align-top">
                          <td className="p-1.5 font-mono">{row.type}</td>
                          <td className="p-1.5">{row.desc}</td>
                          <td className="p-1.5 font-mono text-muted-foreground">{row.example}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section title="常用 scope">
                <div className="flex flex-wrap gap-1">
                  {COMMIT_SCOPES.map((item) => (
                    <span key={item.scope} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      <code className="font-mono">{item.scope}</code>
                      <span className="ml-1 text-muted-foreground">{item.desc}</span>
                    </span>
                  ))}
                </div>
              </Section>
              <Section title="分支命名规范">
                <ul className="flex list-none flex-col gap-1">
                  {BRANCH_PATTERNS.map((item) => (
                    <li key={item.pattern} className="text-[11px]">
                      <code className="font-mono">{item.pattern}</code>
                      <span className="text-muted-foreground"> → </span>
                      <code className="font-mono text-muted-foreground">{item.example}</code>
                      <span className="block text-[10px] text-muted-foreground">{item.note}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <GitMerge className="size-3.5" />
                    合并策略
                  </span>
                }
                description="默认推荐 squash"
              >
                <ul className="flex list-none flex-col gap-1.5">
                  {MERGE_STRATEGIES.map((item) => (
                    <li key={item.name} className="rounded-md border p-2 text-[11px] leading-relaxed">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-muted-foreground">{item.detail}</p>
                      <p className="mt-0.5 text-muted-foreground">适用：{item.when}</p>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="CODEOWNERS 语法">
                <ul className="flex list-none flex-col gap-0.5">
                  {CODEOWNERS_SYNTAX.map((item) => (
                    <li key={item.pattern} className="text-[11px]">
                      <code className="font-mono">{item.pattern}</code>
                      <span className="text-muted-foreground"> = {item.desc}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSnippetId('codeowners');
                  setTab('config');
                }}
              >
                查看完整 CODEOWNERS 示例
              </Button>
            </div>
          </>
        )}

        {tab === 'flow' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              {WORKFLOWS.map((flow) => (
                <Section key={flow.title} title={flow.title} description={flow.desc}>
                  <BranchGraph flow={flow} />
                  <p className="text-[11px] text-muted-foreground">适用：{flow.when}</p>
                </Section>
              ))}
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              {WORKFLOWS.map((flow) => (
                <Section key={flow.title} title={`${flow.title} · 步骤`}>
                  <ol className="flex list-none flex-col gap-1">
                    {(WORKFLOW_FLOW_STEPS[flow.title] ?? []).map((step, index) => (
                      <li key={step} className="flex gap-1.5 text-[11px] leading-relaxed">
                        <span className="shrink-0 font-mono text-muted-foreground">{index + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              ))}
              <Section title="语义化版本 SemVer" description="MAJOR.MINOR.PATCH">
                <ul className="flex list-none flex-col gap-1">
                  {SEMVER_RULES.map((item) => (
                    <li key={item.bump} className="rounded-md border p-2 text-[11px] leading-relaxed">
                      <p className="font-mono font-medium">{item.bump}</p>
                      <p className="text-muted-foreground">{item.trigger}</p>
                      <p className="text-[10px] text-muted-foreground">例：{item.example}</p>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="提交类型 → 版本号" description="自动化发布的核心映射">
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left font-medium">提交</th>
                        <th className="p-1.5 text-left font-medium">版本变化</th>
                        <th className="p-1.5 text-left font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMMIT_TO_SEMVER.map((row) => (
                        <tr key={row.commit} className="border-t align-top">
                          <td className="p-1.5 font-mono">{row.commit}</td>
                          <td className="p-1.5 font-medium">{row.effect}</td>
                          <td className="p-1.5 text-muted-foreground">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSnippetId('release-note');
                  setTab('config');
                }}
              >
                查看 CHANGELOG 与 Release Note 模板
              </Button>
            </div>
          </>
        )}

        {tab === 'config' && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {SNIPPETS.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={item.id === snippetId ? 'secondary' : 'ghost'}
                    onClick={() => setSnippetId(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
              <Hint>{snippet.note}</Hint>
            </div>
            <div className="flex flex-col gap-2">
              <ResultBox
                label={snippet.path}
                value={snippet.content}
                onCopy={() => void copyText(snippet.content)}
                rows="min-h-96"
                fill
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText(
                      exportName(
                        snippet.path.split('/').pop() ?? 'snippet',
                        snippet.path.endsWith('.json') ? 'json' : 'txt',
                      ),
                      snippet.content,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  下载文件
                </Button>
                <Hint>CI 的 cron 表达式在 UTC 执行，需要本地时间请配合 timezone 或改用自建 runner。</Hint>
              </div>
            </div>
          </>
        )}
      </div>

      <Note tone="info" title="只做导航与配置生成">
        本工具不调用任何平台
        API，也不会读取你的仓库。表格数据为编写时的静态快照；配置片段需要你自行复制到项目里再按实际情况调整。
      </Note>

      <Section title="相关工具">
        <LinkList
          items={[
            {
              name: 'Pro Git 书籍',
              url: 'https://git-scm.com/book/zh/v2',
              description: '官方中文 Git 教材',
              tags: ['Git'],
            },
            {
              name: 'GitHub Docs',
              url: 'https://docs.github.com/zh',
              description: 'Actions、权限与工作流权威文档',
              tags: ['GitHub'],
            },
            {
              name: 'GitLab Docs',
              url: 'https://docs.gitlab.com/',
              description: 'CI/CD、权限与 Runner 配置',
              tags: ['GitLab'],
            },
            {
              name: 'OpenSSF Scorecard',
              url: 'https://scorecard.dev/',
              description: '评估依赖仓库的安全实践',
              tags: ['安全'],
            },
          ]}
        />
      </Section>
    </ToolPanel>
  );
}
