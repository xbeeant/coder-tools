import {
  AlertTriangle,
  BookOpen,
  Boxes,
  ClipboardPaste,
  Copy,
  GitBranch,
  GitCommitVertical,
  ListFilter,
  Network,
  Search,
  Workflow,
} from 'lucide-react';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { type LinkItem, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  colorIndexFor,
  countByCategory,
  type DslGraph,
  findGitCommand,
  GIT_CATEGORIES,
  GIT_COMMANDS,
  GIT_SCENARIOS,
  type GitCategory,
  type GitCommand,
  type GitScenario,
  type GraphRow,
  gitCategoryLabel,
  matchScenarios,
  parseGitGraph,
  parseGraphDsl,
  searchGitCommands,
} from '../lib/git-cheatsheet';

type MainTab = 'commands' | 'scenarios' | 'graph';

/** 分支配色（十六进制），索引由引用名哈希得到，保证同一分支颜色稳定。 */
const LANE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

const DOC_LINKS: LinkItem[] = [
  {
    name: 'Git 官方文档',
    url: 'https://git-scm.com/doc',
    description: 'git-scm.com/doc，命令手册与概念说明的权威来源',
    tags: ['官方', '参考'],
  },
  {
    name: 'Pro Git（中文）',
    url: 'https://git-scm.com/book/zh/v2',
    description: '免费开源书籍，系统讲解 Git 的使用与原理',
    tags: ['书籍', '入门'],
  },
  {
    name: 'git reset 官方说明',
    url: 'https://git-scm.com/docs/git-reset',
    description: '区分 --soft / --mixed / --hard 的权威定义',
    tags: ['官方'],
  },
  {
    name: 'git rebase 官方说明',
    url: 'https://git-scm.com/docs/git-rebase',
    description: '变基的语义、风险与 --onto / --rebase-merges 用法',
    tags: ['官方'],
  },
  {
    name: 'gitfilter-repo',
    url: 'https://github.com/newren/git-filter-repo',
    description: '清理历史中泄露文件的标准工具',
    tags: ['历史', '安全'],
  },
  {
    name: 'Oh Shit, Git 周刊？！',
    url: 'https://ohshitgit.com/',
    description: '把常见事故翻译成人话的操作手册',
    tags: ['排错', '速查'],
  },
];

/** 把命令中的 <占位符> 与选项高亮成分段，便于渲染。 */
interface CommandSegment {
  /** 稳定 id：同一条命令内按下标生成，避免渲染时用数组下标当 key。 */
  id: string;
  text: string;
  kind: 'plain' | 'placeholder' | 'flag' | 'subcommand';
}

const SEGMENT_RE = /(<[^<>]+>)|((?:^|\s)-{1,2}[a-zA-Z][\w-]*)/g;

function segmentCommand(command: string): CommandSegment[] {
  const segments: CommandSegment[] = [];
  let lastIndex = 0;
  SEGMENT_RE.lastIndex = 0;
  let match = SEGMENT_RE.exec(command);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        id: `p-${lastIndex}-${match.index}`,
        text: command.slice(lastIndex, match.index),
        kind: 'plain',
      });
    }
    segments.push({
      id: `s-${match.index}-${match[0].length}`,
      text: match[0],
      kind: match[1] !== undefined ? 'placeholder' : 'flag',
    });
    lastIndex = match.index + match[0].length;
    match = SEGMENT_RE.exec(command);
  }
  if (lastIndex < command.length)
    segments.push({ id: `t-${lastIndex}`, text: command.slice(lastIndex), kind: 'plain' });
  return segments;
}

function CommandText({ command, className = '' }: { command: string; className?: string }) {
  const segments = useMemo(() => segmentCommand(command), [command]);
  return (
    <code className={`font-mono text-xs ${className}`}>
      {segments.map((segment) => {
        if (segment.kind === 'placeholder') {
          return (
            <span key={segment.id} className="rounded bg-amber-500/20 px-0.5 text-amber-700 dark:text-amber-300">
              {segment.text}
            </span>
          );
        }
        if (segment.kind === 'flag') {
          return (
            <span key={segment.id} className="text-primary">
              {segment.text}
            </span>
          );
        }
        return <span key={segment.id}>{segment.text}</span>;
      })}
    </code>
  );
}

function CopyIconButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-6"
      aria-label={label}
      title={label}
      onClick={() => copyText(text)}
    >
      <Copy className="size-3" />
    </Button>
  );
}

function CommandCard({ item }: { item: GitCommand }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
        >
          <span className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
            <CommandText command={item.command} className="shrink-0" />
          </span>
          <span className="text-[11px] text-muted-foreground">{item.description}</span>
        </button>
        <CopyIconButton text={item.command} label={`复制命令：${item.command}`} />
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t px-2.5 py-2">
          <dl className="grid gap-1 text-[11px]">
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-muted-foreground">分类</dt>
              <dd>{gitCategoryLabel(item.category)}</dd>
            </div>
            {item.scenario && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-muted-foreground">什么时候用</dt>
                <dd className="text-muted-foreground">{item.scenario}</dd>
              </div>
            )}
          </dl>
          {item.risk && (
            <p className="flex items-start gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              <span>{item.risk}</span>
            </p>
          )}
          {item.related && item.related.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">相关命令</span>
              <ul className="flex flex-col gap-1">
                {item.related.map((related) => (
                  <li key={related} className="flex items-center gap-1.5">
                    <CommandText command={related} />
                    <CopyIconButton text={related} label={`复制命令：${related}`} />
                    {findGitCommand(related)?.description && (
                      <span className="text-[11px] text-muted-foreground">{findGitCommand(related)?.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ScenarioCard({ scenario }: { scenario: GitScenario }) {
  const script = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    ...scenario.steps.flatMap((step) => [`# ${step.note}`, step.command, '']),
  ].join('\n');
  return (
    <Section
      title={scenario.title}
      description={scenario.summary}
      actions={
        <CopyIconButton
          text={scenario.steps.map((s) => s.command).join('\n')}
          label={`复制场景命令：${scenario.title}`}
        />
      }
    >
      <ol className="flex flex-col gap-2">
        {scenario.steps.map((step, index) => (
          <li key={step.command} className="rounded-md border bg-muted/30 px-2.5 py-2">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GitCommitVertical className="size-3" />第 {index + 1} 步
            </p>
            <div className="flex items-start gap-2">
              <CommandText command={step.command} className="min-w-0 flex-1 break-all" />
              <CopyIconButton text={step.command} label={`复制命令：${step.command}`} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{step.note}</p>
          </li>
        ))}
      </ol>
      {scenario.warning && (
        <Note tone="warn" title="风险">
          {scenario.warning}
        </Note>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => copyText(script)}>
          <ClipboardPaste className="size-3.5" />
          复制为 shell 脚本
        </Button>
        <span className="text-[11px] text-muted-foreground">含 set -euo pipefail 与每步中文注释</span>
      </div>
    </Section>
  );
}

/* ── 图示渲染 ─────────────────────────────────────────────────── */

const GRAPH_COL = 46;
const GRAPH_ROW = 40;
const GRAPH_PAD = 18;
const NODE_R = 7;

interface GraphEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

function buildEdges(rows: GraphRow[], laneColors: Map<number, string>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const x = (lane: number) => GRAPH_PAD + lane * GRAPH_COL;
  const y = (row: number) => GRAPH_PAD + row * GRAPH_ROW;

  for (let i = 0; i < rows.length - 1; i += 1) {
    const current = rows[i] as GraphRow;
    const next = rows[i + 1] as GraphRow;
    const color = laneColors.get(current.lanes[0] ?? 0) ?? LANE_COLORS[0] ?? '#3b82f6';
    for (const lane of current.lanes) {
      if (next.lanes.includes(lane)) {
        edges.push({ key: `v-${i}-${lane}`, x1: x(lane), y1: y(i), x2: x(lane), y2: y(i + 1), color });
      }
    }
    for (const lane of current.forks) {
      edges.push({ key: `f-${i}-${lane}`, x1: x(lane), y1: y(i), x2: x(lane + 1), y2: y(i + 1), color });
    }
    for (const lane of current.merges) {
      edges.push({ key: `m-${i}-${lane}`, x1: x(lane + 1), y1: y(i), x2: x(lane), y2: y(i + 1), color });
    }
  }
  return edges;
}

function GraphSvg({ rows, laneColors }: { rows: GraphRow[]; laneColors: Map<number, string> }) {
  const edges = useMemo(() => buildEdges(rows, laneColors), [laneColors, rows]);
  const maxLane = useMemo(
    () => rows.reduce((max, row) => Math.max(max, ...row.lanes, ...row.forks.map((lane) => lane + 1)), 0),
    [rows],
  );
  const width = GRAPH_PAD * 2 + (maxLane + 1) * GRAPH_COL;
  const height = GRAPH_PAD * 2 + rows.length * GRAPH_ROW;
  return (
    <div className="overflow-auto rounded-md border bg-muted/20 p-2">
      <svg width={Math.max(width, 320)} height={height} role="img" aria-label="Git 分支拓扑图" className="min-w-full">
        {edges.map((edge) => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.color}
            strokeWidth={1.8}
          />
        ))}
        {rows.map((row) => {
          if (row.commit === null) return null;
          const cx = GRAPH_PAD + row.commit.lane * GRAPH_COL;
          const cy = GRAPH_PAD + row.id * GRAPH_ROW;
          const color = laneColors.get(row.commit.lane) ?? LANE_COLORS[0] ?? '#3b82f6';
          return (
            <g key={`node-${row.id}`}>
              <circle cx={cx} cy={cy} r={NODE_R} fill={color} />
              {row.commit.hash && (
                <text x={cx + 12} y={cy + 4} className="fill-foreground font-mono text-[11px]">
                  {row.commit.hash.slice(0, 7)} {row.commit.label.slice(0, 42)}
                </text>
              )}
              {row.refs.length > 0 && (
                <text x={cx + 12} y={cy + 17} className="fill-muted-foreground text-[10px]">
                  {row.refs.join(', ')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DslSvg({ graph }: { graph: DslGraph }) {
  const present = useMemo(() => {
    const set = new Set<string>();
    for (const cell of graph.cells) set.add(`${cell.lane}:${cell.column}`);
    return set;
  }, [graph.cells]);

  const has = (lane: number, column: number) => present.has(`${lane}:${column}`);
  const colWidth = Math.max(56, GRAPH_COL * 2);
  const x = (column: number) => GRAPH_PAD + column * colWidth;
  const y = (lane: number) => GRAPH_PAD + lane * GRAPH_ROW;
  const width = GRAPH_PAD * 2 + Math.max(1, graph.width) * colWidth;
  const height = GRAPH_PAD * 2 + Math.max(1, graph.height) * GRAPH_ROW;

  return (
    <div className="overflow-auto rounded-md border bg-muted/20 p-2">
      <svg width={Math.max(width, 360)} height={height} role="img" aria-label="DSL 描述的分支图" className="min-w-full">
        <desc>
          共 {graph.lanes.length} 条 lane、{graph.cells.filter((cell) => cell.commit).length} 个提交点
        </desc>
        {graph.lanes.map((lane) => (
          <text key={lane.lane} x={6} y={y(lane.lane) + 4} className="fill-muted-foreground text-[11px]">
            {lane.name}
          </text>
        ))}
        {graph.cells.map((cell) => {
          const cx = x(cell.column);
          const cy = y(cell.lane);
          const color = LANE_COLORS[colorIndexFor(cell.name, LANE_COLORS.length)] ?? LANE_COLORS[0] ?? '#3b82f6';
          const parts: React.ReactNode[] = [];
          if (has(cell.lane, cell.column + 1)) {
            parts.push(
              <line
                key="r"
                x1={cx + NODE_R}
                y1={cy}
                x2={x(cell.column + 1) - NODE_R}
                y2={cy}
                stroke={color}
                strokeWidth={1.6}
              />,
            );
          }
          if (cell.lane > 0 && has(cell.lane - 1, cell.column)) {
            parts.push(
              <line
                key="u"
                x1={cx}
                y1={cy - NODE_R}
                x2={cx}
                y2={y(cell.lane - 1) + NODE_R}
                stroke={color}
                strokeWidth={1.6}
              />,
            );
          }
          return (
            <g key={`${cell.lane}-${cell.column}`}>
              {parts}
              <path
                d={`M ${cx - NODE_R} ${cy} L ${cx} ${cy - NODE_R} L ${cx + NODE_R} ${cy} L ${cx} ${cy + NODE_R} Z`}
                fill={cell.commit ? color : '#ffffff'}
                stroke={color}
                strokeWidth={1.8}
              />
              <text x={cx} y={cy - 12} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {cell.column}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const DSL_SAMPLE = `main       ●───●───●
feature         ┌───●───●
hotfix              └───●`;

const GRAPH_SAMPLE = `* commit 6f1a2b3 (HEAD -> main, origin/main)
|\\
| * commit 9c8d7e6 (feature/login)
| * commit 4b5f2a1 修复登录跳转
| |\\
| * | commit 7d3e9c0 补充单测
* | | commit 1a2b3c4 合并主干
* | |/
* |/  Merge branch 'main' into feature/login
|/  
* commit 0c1d2e3 初始提交`;

export default function GitCheatsheet() {
  const [tab, setTab] = useState<MainTab>('commands');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GitCategory | 'all'>('all');
  const [scenarioQuery, setScenarioQuery] = useState('');
  const [graphText, setGraphText] = useState(GRAPH_SAMPLE);
  const [dslText, setDslText] = useState(DSL_SAMPLE);

  const filtered = useMemo(() => searchGitCommands(query, category), [category, query]);
  const counts = useMemo(() => countByCategory(filtered), [filtered]);
  const matches = useMemo(() => matchScenarios(scenarioQuery), [scenarioQuery]);
  const graph = useMemo(() => parseGitGraph(graphText), [graphText]);
  const dsl = useMemo(() => parseGraphDsl(dslText), [dslText]);

  const laneColors = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of graph.rows) {
      for (const lane of row.lanes) {
        if (map.has(lane)) continue;
        const ref = row.refs[0];
        const key = ref ?? `lane-${lane}`;
        map.set(lane, LANE_COLORS[colorIndexFor(key, LANE_COLORS.length)] ?? LANE_COLORS[0] ?? '#3b82f6');
      }
    }
    return map;
  }, [graph.rows]);

  const laneNames = useMemo(() => {
    const names = new Map<number, Set<string>>();
    for (const row of graph.rows) {
      for (const lane of row.lanes) {
        if (row.refs.length === 0) continue;
        const set = names.get(lane) ?? new Set<string>();
        for (const ref of row.refs) set.add(ref);
        names.set(lane, set);
      }
    }
    return [...names.entries()].map(([lane, refs]) => ({
      lane,
      refs: [...refs],
      color: laneColors.get(lane) ?? LANE_COLORS[0] ?? '#3b82f6',
    }));
  }, [graph.rows, laneColors]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <GitBranch className="size-4" />
          Git 命令速查
        </span>
      }
      description={`${GIT_COMMANDS.length} 条命令 · ${GIT_SCENARIOS.length} 个场景 · 场景库「怎么办」查询与分支拓扑图`}
      actions={
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索命令 / 说明 / 场景"
            className="h-8 pl-7 text-xs"
            aria-label="搜索 Git 命令"
          />
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="commands" active={tab === 'commands'}>
            <span className="inline-flex items-center gap-1">
              <ListFilter className="size-3.5" />
              命令速查
            </span>
          </TabsTrigger>
          <TabsTrigger value="scenarios" active={tab === 'scenarios'}>
            <span className="inline-flex items-center gap-1">
              <Workflow className="size-3.5" />
              怎么办
            </span>
          </TabsTrigger>
          <TabsTrigger value="graph" active={tab === 'graph'}>
            <span className="inline-flex items-center gap-1">
              <Network className="size-3.5" />
              分支图示
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'commands' && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={category === 'all' ? 'secondary' : 'outline'}
              onClick={() => setCategory('all')}
              className="text-[11px]"
            >
              全部 {GIT_COMMANDS.length}
            </Button>
            {GIT_CATEGORIES.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={category === item.id ? 'secondary' : 'outline'}
                onClick={() => setCategory(category === item.id ? 'all' : item.id)}
                title={item.description}
                className="text-[11px]"
              >
                {item.label} {counts[item.id] ?? 0}
              </Button>
            ))}
          </div>

          <StatGrid>
            <Stat label="命中条目" value={filtered.length} hint={`共 ${GIT_COMMANDS.length} 条`} />
            <Stat label="分类数" value={GIT_CATEGORIES.length} />
            <Stat label="含风险提示" value={GIT_COMMANDS.filter((item) => item.risk).length} tone="warn" />
            <Stat label="含使用场景" value={GIT_COMMANDS.filter((item) => item.scenario).length} />
          </StatGrid>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">没有匹配的命令，换个关键词试试</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <CommandCard key={item.command} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'scenarios' && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={scenarioQuery}
                onChange={(event) => setScenarioQuery(event.target.value)}
                placeholder="用自然语言描述问题，例如：误提交了密钥 / 想撤销上一次提交"
                className="h-8 pl-7 text-xs"
                aria-label="场景查询"
              />
            </div>
            {scenarioQuery === '' && (
              <Button size="sm" variant="outline" onClick={() => setScenarioQuery('撤销')}>
                示例：撤销
              </Button>
            )}
          </div>

          {scenarioQuery.trim() === '' ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">
                共 {GIT_SCENARIOS.length} 个常见场景，输入你的问题会自动匹配并给出分步骤命令：
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GIT_SCENARIOS.map((scenario) => (
                  <Button
                    key={scenario.id}
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => setScenarioQuery(scenario.title)}
                  >
                    {scenario.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : matches.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              没有匹配的场景，试试更短的关键词，例如「撤销」「密钥」「子模块」
            </p>
          ) : (
            matches.map((match) => <ScenarioCard key={match.scenario.id} scenario={match.scenario} />)
          )}
        </div>
      )}

      {tab === 'graph' && (
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Textarea
              value={graphText}
              onChange={(event) => setGraphText(event.target.value)}
              placeholder="粘贴 git log --graph --oneline --decorate --all 的输出"
              spellCheck={false}
              aria-label="git log --graph 输出"
              className="min-h-48 flex-1 resize-none font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setGraphText(GRAPH_SAMPLE)}>
                <ClipboardPaste className="size-3.5" />
                填入示例
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGraphText('')} disabled={graphText === ''}>
                清空
              </Button>
              <span className="text-[11px] text-muted-foreground">
                解析到 {graph.rows.length} 行、{graph.refs.length} 个引用
              </span>
            </div>
            {graph.warnings.map((warning) => (
              <Note key={warning} tone="warn" title="解析提示">
                {warning}
              </Note>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {graph.rows.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">粘贴左侧内容后在这里渲染分支图</p>
            ) : (
              <>
                <GraphSvg rows={graph.rows} laneColors={laneColors} />
                <div className="flex flex-wrap items-center gap-2">
                  {laneNames.map((item) => (
                    <span key={item.lane} className="inline-flex items-center gap-1 text-[11px]">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.refs.join(' / ') || `lane ${item.lane}`}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <Section
            title="图示 DSL"
            description="按「一行一条 lane」手写提交分布，列号即时间顺序"
            className="md:col-span-2"
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setDslText(DSL_SAMPLE)}>
                  填入示例
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyText(dslText)} disabled={dslText === ''}>
                  <Copy className="size-3.5" />
                  复制
                </Button>
              </>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Textarea
                value={dslText}
                onChange={(event) => setDslText(event.target.value)}
                placeholder={'main       ●───●───●\nfeature         ┌───●───●'}
                spellCheck={false}
                aria-label="图示 DSL"
                className="min-h-24 resize-none font-mono text-xs"
              />
              <div className="flex flex-col gap-2">
                {dsl.width === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">左侧填入 DSL 后显示图形</p>
                ) : (
                  <DslSvg graph={dsl} />
                )}
                {dsl.warnings.map((warning) => (
                  <p key={warning} className="text-[11px] text-amber-600 dark:text-amber-400">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          </Section>
        </div>
      )}

      <Note tone="info" title="关于本工具">
        浏览器扩展没有 shell，<strong>不会执行任何 git 命令</strong>，也不会联网。所有内容都是内置的命令参考与场景模板；
        想让图示准确，请在你自己的终端里运行 <code>git log --graph --oneline --decorate --all</code>{' '}
        后粘贴过来。占位符（如 <code>&lt;branch&gt;</code>）需要替换成真实名字后再执行。
      </Note>

      <Section title="官方文档与延伸阅读">
        <LinkList items={DOC_LINKS} />
      </Section>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <BookOpen className="size-3.5" />共 {GIT_COMMANDS.length} 条命令 / {GIT_CATEGORIES.length} 个分类 /{' '}
        {GIT_SCENARIOS.length} 个场景，所有数据内置于扩展包内。
        <Boxes className="ml-1 size-3.5" />
      </div>
    </ToolPanel>
  );
}
