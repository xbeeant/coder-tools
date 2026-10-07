/** 文本差异对比：逐行/逐词/逐字符对比，输出 unified diff 与 sed 替换脚本。 */
import { ArrowDown, ArrowUp, Download, FileDiff } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select } from '../components/ui/field';
import { EmptyHint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  AUTO_COLLAPSE_LINES,
  buildSedScript,
  collapseRows,
  computeDiff,
  DEFAULT_DIFF_OPTIONS,
  type DiffBlock,
  type DiffMode,
  type DiffOptions,
  type DiffRow,
  type DiffSegment,
  type DiffView,
  parseIgnoreRules,
  unifiedPatch,
} from '../lib/diff';
import { downloadText, exportName } from '../lib/file';

const MODE_OPTIONS = [
  { value: 'lines', label: '行级（LCS）' },
  { value: 'words', label: '词级' },
  { value: 'chars', label: '字符级' },
];

const VIEW_OPTIONS = [
  { value: 'split', label: '双栏并排' },
  { value: 'inline', label: '行内' },
];

const SAMPLE_LEFT = `# 用户服务
export function getUser(id) {
  return db.query('select * from users where id = ?', [id]);
}

const DEFAULT_TIMEOUT = 3000;`;

const SAMPLE_RIGHT = `# 用户服务（缓存版）
export async function getUser(id, opts = {}) {
  const hit = cache.get(id);
  if (hit) return hit;
  return db.query('SELECT id, name, email FROM users WHERE id = ? LIMIT 1', [id], opts);
}

const DEFAULT_TIMEOUT = 5000;
const CACHE_TTL = 60;`;

function segments(parts: DiffSegment[] | undefined, fallback: string): DiffSegment[] {
  return parts && parts.length > 0 ? parts : [{ text: fallback, changed: false }];
}

/** 行内视图：新增绿色、删除红色、修改黄色，深浅色主题都可读。 */
const INLINE_TONE: Record<DiffRow['kind'], string> = {
  equal: '',
  add: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  del: 'bg-red-500/10 text-red-700 line-through decoration-red-500/60 dark:text-red-300',
  modify: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const SPLIT_GUTTER: Record<DiffRow['kind'], string> = {
  equal: 'text-muted-foreground/60',
  add: 'text-emerald-600 dark:text-emerald-400',
  del: 'text-red-600 dark:text-red-400',
  modify: 'text-amber-600 dark:text-amber-400',
};

const SPLIT_ROW: Record<DiffRow['kind'], string> = {
  equal: '',
  add: 'bg-emerald-500/5',
  del: 'bg-red-500/5',
  modify: 'bg-amber-500/5',
};

const KIND_SIGN: Record<DiffRow['kind'], string> = { equal: ' ', add: '+', del: '-', modify: '~' };

function Sign({ kind }: { kind: DiffRow['kind'] }) {
  return (
    <span className={cnSign(kind)} aria-hidden="true">
      {KIND_SIGN[kind]}
    </span>
  );
}

function cnSign(kind: DiffRow['kind']): string {
  return `w-3 shrink-0 select-none text-center ${SPLIT_GUTTER[kind]}`;
}

/** 用累计偏移量生成稳定 key，避免依赖数组下标。 */
function keyedSegments(parts: DiffSegment[]): { part: DiffSegment; key: string }[] {
  let offset = 0;
  return parts.map((part) => {
    const key = `${part.changed ? 'd' : 'e'}-${String(offset)}`;
    offset += part.text.length;
    return { part, key };
  });
}

function Parts({
  parts,
  fallback,
  changedClass,
}: {
  parts: DiffSegment[] | undefined;
  fallback: string;
  changedClass: string;
}) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {keyedSegments(segments(parts, fallback)).map(({ part, key }) => (
        <span key={key} className={part.changed ? changedClass : undefined}>
          {part.text}
        </span>
      ))}
    </span>
  );
}

function Gutter({ no }: { no: number | null }) {
  return (
    <span className="w-10 shrink-0 select-none pr-1.5 text-right text-[10px] text-muted-foreground/70 tabular-nums">
      {no ?? ''}
    </span>
  );
}

function InlineRow({ row }: { row: DiffRow }) {
  const primary = row.kind === 'del' ? row.leftParts : row.rightParts;
  const primaryText = row.kind === 'del' ? row.left : row.right;
  const tone = INLINE_TONE[row.kind];
  return (
    <div className={`flex items-start gap-1 rounded px-1.5 py-0.5 font-mono text-xs leading-relaxed ${tone}`}>
      <span className="w-3 shrink-0 select-none text-center opacity-70">{KIND_SIGN[row.kind]}</span>
      <Gutter no={row.leftNo ?? row.rightNo} />
      <Parts parts={primary} fallback={primaryText} changedClass="rounded bg-amber-500/25 font-semibold" />
    </div>
  );
}

function SplitRow({ row }: { row: DiffRow }) {
  const leftHighlight =
    row.kind === 'modify' || row.kind === 'del' ? 'rounded bg-amber-500/25 dark:bg-amber-400/20' : '';
  const rightHighlight =
    row.kind === 'modify' || row.kind === 'add' ? 'rounded bg-amber-500/25 dark:bg-amber-400/20' : '';
  return (
    <div className={`grid grid-cols-2 ${SPLIT_ROW[row.kind]}`}>
      <div className="flex items-start gap-1 border-r border-dashed px-1.5 py-0.5 font-mono text-xs leading-relaxed">
        <Sign kind={row.kind === 'add' ? 'equal' : row.kind === 'modify' ? 'del' : row.kind} />
        <Gutter no={row.leftNo} />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {row.kind === 'modify' ? (
            <Parts parts={row.leftParts} fallback={row.left} changedClass={leftHighlight} />
          ) : (
            <span
              className={row.kind === 'del' ? 'text-red-700 line-through decoration-red-500/60 dark:text-red-300' : ''}
            >
              {row.left}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-start gap-1 px-1.5 py-0.5 font-mono text-xs leading-relaxed">
        <Sign kind={row.kind === 'del' ? 'equal' : row.kind === 'modify' ? 'add' : row.kind} />
        <Gutter no={row.rightNo} />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {row.kind === 'modify' ? (
            <Parts parts={row.rightParts} fallback={row.right} changedClass={rightHighlight} />
          ) : (
            <span className={row.kind === 'add' ? 'text-emerald-700 dark:text-emerald-300' : ''}>{row.right}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function FoldToggle({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="my-1 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-primary/40 bg-primary/5 py-1 font-mono text-[11px] text-primary transition-colors hover:bg-primary/10"
    >
      {expanded ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {expanded ? `折叠 ${count} 行` : `展开 ${count} 行未变更内容`}
    </button>
  );
}

function RowList({
  blocks,
  view,
  expanded,
  onToggle,
}: {
  blocks: DiffBlock[];
  view: DiffView;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (blocks.length === 0) return <EmptyHint>两侧内容完全一致</EmptyHint>;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 p-1.5 scrollbar-thin">
      {blocks.map((block) => {
        if (block.type === 'rows') {
          return (
            <Fragment key={block.key}>
              {block.rows.map((row) => (
                <div key={row.rowId}>{view === 'split' ? <SplitRow row={row} /> : <InlineRow row={row} />}</div>
              ))}
            </Fragment>
          );
        }
        const open = expanded.has(block.key);
        const visible = open ? [...block.head, ...block.tail] : block.head;
        return (
          <div key={block.key}>
            {visible.map((row) => (
              <div key={row.rowId}>{view === 'split' ? <SplitRow row={row} /> : <InlineRow row={row} />}</div>
            ))}
            <FoldToggle count={block.count} expanded={open} onToggle={() => onToggle(block.key)} />
          </div>
        );
      })}
    </div>
  );
}

export default function TextDiff() {
  const [left, setLeft] = useState(SAMPLE_LEFT);
  const [right, setRight] = useState(SAMPLE_RIGHT);
  const [options, setOptions] = useState<DiffOptions>(DEFAULT_DIFF_OPTIONS);
  const [view, setView] = useState<'split' | 'inline'>('split');
  const [ignoreText, setIgnoreText] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const parsed = useMemo(() => parseIgnoreRules(ignoreText), [ignoreText]);
  const result = useMemo(() => computeDiff(left, right, options, parsed.rules), [left, right, options, parsed.rules]);
  const blocks = useMemo(() => collapseRows(result.rows, options.context), [result.rows, options.context]);

  const toggleFold = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const patch = useMemo(
    () => unifiedPatch(result.leftText, result.rightText, 'file.txt', options.context),
    [result.leftText, result.rightText, options.context],
  );
  const sedScript = useMemo(() => buildSedScript(result.rows, 'file.txt'), [result.rows]);

  const isLarge = result.stats.leftLines > AUTO_COLLAPSE_LINES || result.stats.rightLines > AUTO_COLLAPSE_LINES;
  const toggleOption = (key: keyof DiffOptions) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  const setContext = (context: number) =>
    setOptions((prev) => ({ ...prev, context: Number.isFinite(context) ? Math.max(0, Math.min(50, context)) : 3 }));

  const { added, deleted, modified, unchanged, similarity, changeRatio, leftLines, rightLines } = result.stats;

  return (
    <ToolPanel
      title="文本差异对比"
      description="基于 jsdiff 计算 LCS，支持行级 / 词级 / 字符级对比与 unified diff 导出"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Tabs value={view} onValueChange={(value) => setView(value as 'split' | 'inline')}>
            <TabsList>
              {VIEW_OPTIONS.map((option) => (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  onClick={() => setView(option.value as 'split' | 'inline')}
                >
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">文本 A（原始）</span>
            <ClearButton onClick={() => setLeft('')} disabled={!left} />
          </div>
          <Textarea
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            placeholder="粘贴旧版本内容"
            spellCheck={false}
            className="min-h-40 resize-none font-mono text-xs"
            aria-label="文本 A（原始）"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">文本 B（新版本）</span>
            <ClearButton onClick={() => setRight('')} disabled={!right} />
          </div>
          <Textarea
            value={right}
            onChange={(event) => setRight(event.target.value)}
            placeholder="粘贴新版本内容"
            spellCheck={false}
            className="min-h-40 resize-none font-mono text-xs"
            aria-label="文本 B（新版本）"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="对比设置" description="所有开关只影响比较，展示仍为原文">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="对比粒度"
              value={options.mode}
              onChange={(value) => setOptions((prev) => ({ ...prev, mode: value as DiffMode }))}
              options={MODE_OPTIONS}
            />
            <NumberField label="上下文行数" value={options.context} onChange={setContext} min={0} max={50} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Checkbox
              label="忽略空白"
              checked={options.ignoreWhitespace}
              onChange={() => toggleOption('ignoreWhitespace')}
            />
            <Checkbox
              label="忽略空行"
              checked={options.ignoreBlankLines}
              onChange={() => toggleOption('ignoreBlankLines')}
            />
            <Checkbox
              label="忽略行尾空白"
              checked={options.ignoreTrailingWhitespace}
              onChange={() => toggleOption('ignoreTrailingWhitespace')}
            />
            <Checkbox label="大小写不敏感" checked={options.ignoreCase} onChange={() => toggleOption('ignoreCase')} />
            <Checkbox
              label="词级保留空格差异"
              hint="关闭时改用 diffWords，只比较词"
              checked={options.keepSpaces}
              onChange={() => toggleOption('keepSpaces')}
            />
          </div>
          <Textarea
            value={ignoreText}
            onChange={(event) => setIgnoreText(event.target.value)}
            placeholder={'忽略规则，每行一条正则：\n-^\\s*$\n^import .*\n!keep-me'}
            spellCheck={false}
            className="min-h-20 resize-none font-mono text-[11px]"
            aria-label="忽略规则"
          />
          {parsed.errors.length > 0 && (
            <p className="text-[11px] text-destructive">忽略规则正则无效：{parsed.errors.join('、')}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            规则说明：以 <code className="font-mono">-</code> 开头或直接写正则表示跳过匹配行； 以{' '}
            <code className="font-mono">!</code> 开头表示白名单；<code className="font-mono">#</code> 开头为注释。
          </p>
        </Section>

        <Section title="统计" description="修改行按字符相似度 ≥ 50% 自动配对">
          <StatGrid>
            <Stat label="新增行" value={added} tone="success" />
            <Stat label="删除行" value={deleted} tone="danger" />
            <Stat label="修改行" value={modified} tone="warn" />
            <Stat label="未变更行" value={unchanged} />
            <Stat label="相似度" value={`${similarity}%`} tone={similarity >= 90 ? 'success' : 'warn'} />
            <Stat label="改动比例" value={`${changeRatio}%`} hint="改动行 / 较大一侧行数" />
            <Stat label="A 行数" value={leftLines} />
            <Stat label="B 行数" value={rightLines} />
          </StatGrid>
          {isLarge && (
            <Note tone="warn" title="大文件已自动折叠">
              超过 {AUTO_COLLAPSE_LINES} 行时未变更区块默认折叠为「展开 N 行」，点击即可展开。
            </Note>
          )}
        </Section>
      </div>

      <Section
        title="差异结果"
        description={`共 ${result.rows.length} 行比对项${result.filteredLines > 0 ? `，忽略规则跳过 ${result.filteredLines} 行` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" disabled={left !== right} onClick={() => setRight(left)}>
              <FileDiff className="size-3.5" />B 同步为 A
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={left === right}
              onClick={() => {
                setRight(left);
                setLeft(right);
              }}
            >
              <ArrowDown className="size-3.5" />
              互换 A/B
            </Button>
          </div>
        }
      >
        <RowList blocks={blocks} view={view} expanded={expanded} onToggle={toggleFold} />
      </Section>

      <Section title="导出" description="unified diff 可直接 git apply；sed 脚本用于快速替换">
        <div className="grid gap-3 md:grid-cols-2">
          <ResultBox label="unified diff" value={patch} rows="min-h-32" onCopy={() => copyText(patch)} />
          <ResultBox label="sed 替换脚本" value={sedScript} rows="min-h-32" onCopy={() => copyText(sedScript)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={!patch}
            onClick={() => downloadText(exportName('diff', 'patch'), patch, 'text/x-patch;charset=utf-8')}
          >
            <Download className="size-3.5" />
            下载 .patch
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!patch}
            onClick={() => downloadText(exportName('diff', 'diff'), patch, 'text/plain;charset=utf-8')}
          >
            <Download className="size-3.5" />
            下载 .diff
          </Button>
        </div>
        <Note tone="warn" title="sed 脚本的局限">
          脚本只处理「单行且成对」的替换，sed 无法安全完成插入与删除操作，这些位置会以注释形式提示，需手工确认。
          复杂改动请使用 unified diff。
        </Note>
      </Section>
    </ToolPanel>
  );
}
