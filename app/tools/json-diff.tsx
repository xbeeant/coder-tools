/** JSON 结构比对：按 JSONPath 递归比较两侧数据，输出新增/删除/类型变更/值变更。 */
import JSON5 from 'json5';
import {
  ArrowLeftRight,
  Braces,
  CheckCircle2,
  Download,
  FileJson,
  FolderOpen,
  Info,
  ListTree,
  Rows3,
  XCircle,
} from 'lucide-react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatBytes } from '../lib/bytes';
import {
  collapseRows,
  computeDiff,
  DEFAULT_DIFF_OPTIONS,
  type DiffBlock,
  type DiffMode,
  type DiffOptions,
  type DiffResult,
  type DiffRow,
  type DiffView,
  unifiedPatch,
} from '../lib/diff';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  type ChangeKind,
  type CompareOptions,
  type CompareResult,
  compareJson,
  isPlainObject,
} from '../lib/json-compare';

// ── 界面 ──────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: 'lines', label: '行级（LCS）' },
  { value: 'words', label: '词级' },
  { value: 'chars', label: '字符级' },
];

const VIEW_OPTIONS = [
  { value: 'split', label: '双栏并排' },
  { value: 'inline', label: '行内' },
];

const KIND_LABEL: Record<ChangeKind, string> = {
  added: '新增',
  removed: '删除',
  type: '类型变更',
  changed: '值变更',
};

const KIND_TONE: Record<ChangeKind, string> = {
  added: 'text-emerald-700 dark:text-emerald-300',
  removed: 'text-red-700 line-through decoration-red-500/60 dark:text-red-300',
  type: 'text-amber-700 dark:text-amber-300',
  changed: 'text-amber-700 dark:text-amber-300',
};

const KIND_SIGN: Record<ChangeKind, string> = { added: '+', removed: '-', type: '~', changed: '~' };

type ResultTab = 'changes' | 'text';

const SAMPLE_LEFT = `{
  "id": 1001,
  "name": "示例用户",
  "email": "user@example.com",
  "active": true,
  "score": 9.5,
  "tags": ["admin", "vip"],
  "profile": { "city": "上海", "remark": null }
}`;

const SAMPLE_RIGHT = `{
  "id": 1001,
  "name": "示例用户",
  "email": "user@example.com",
  "active": true,
  "score": 9.75,
  "tags": ["admin", "vip", "beta"],
  "profile": { "city": "北京", "remark": null, "level": 3 }
}`;

function parseSide(text: string): { value: unknown; error: string | null } {
  if (text.trim() === '') return { value: null, error: null };
  try {
    return { value: JSON5.parse(text), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, error: message };
  }
}

/** 忽略字段输入支持逗号、空格与换行分隔。 */
function parseIgnoreKeys(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    ),
  ];
}

export default function JsonDiff() {
  const [leftInput, setLeftInput] = useState('');
  const [rightInput, setRightInput] = useState('');
  const [resultTab, setResultTab] = useState<ResultTab>('changes');
  const [view, setView] = useState<DiffView>('split');
  const [mode, setMode] = useState<DiffMode>('lines');
  const [ignoreText, setIgnoreText] = useState('');
  const [unorderedArrays, setUnorderedArrays] = useState(false);
  const [tolerance, setTolerance] = useState('0');
  const [diffOptions, setDiffOptions] = useState<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const left = useMemo(() => parseSide(leftInput), [leftInput]);
  const right = useMemo(() => parseSide(rightInput), [rightInput]);

  const compareOptions = useMemo<CompareOptions>(
    () => ({
      ignoreKeys: parseIgnoreKeys(ignoreText),
      unorderedArrays,
      tolerance: Number(tolerance) || 0,
    }),
    [ignoreText, unorderedArrays, tolerance],
  );

  // 任一侧解析失败时不给出差异结论，避免把错误当成「有差异」。
  const comparable = left.error === null && right.error === null;
  const result = useMemo<CompareResult | null>(
    () => (comparable ? compareJson(left.value, right.value, compareOptions) : null),
    [comparable, left.value, right.value, compareOptions],
  );

  const leftText = useMemo(() => (comparable ? stringifyStable(left.value) : ''), [comparable, left.value]);
  const rightText = useMemo(() => (comparable ? stringifyStable(right.value) : ''), [comparable, right.value]);

  const diff = useMemo<DiffResult | null>(() => {
    if (!comparable) return null;
    return computeDiff(leftText, rightText, { ...diffOptions, mode });
  }, [comparable, leftText, rightText, diffOptions, mode]);

  const blocks = useMemo<DiffBlock[]>(
    () => (diff === null ? [] : collapseRows(diff.rows, diffOptions.context)),
    [diff, diffOptions.context],
  );

  const pick = useCallback(async (side: 'left' | 'right') => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.json,.json5,.txt,application/json,text/plain', multiple: false });
      const file = files[0];
      if (!file) return;
      const text = await readAsText(file);
      if (side === 'left') setLeftInput(text);
      else setRightInput(text);
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）到${side === 'left' ? '左' : '右'}侧`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const swap = useCallback(() => {
    setLeftInput(rightInput);
    setRightInput(leftInput);
  }, [leftInput, rightInput]);

  const changesText = useMemo(
    () =>
      result === null || result.changes.length === 0
        ? ''
        : result.changes
            .map(
              (item) =>
                `${KIND_SIGN[item.kind]} ${item.path}\n  ${KIND_LABEL[item.kind]}\n  - ${item.left}\n  + ${item.right}`,
            )
            .join('\n'),
    [result],
  );

  const handleDownload = useCallback(() => {
    if (diff === null) return;
    downloadText(
      exportName('json-diff', 'diff'),
      unifiedPatch(leftText, rightText, 'json', diffOptions.context),
      'text/plain;charset=utf-8',
    );
  }, [diff, leftText, rightText, diffOptions.context]);

  const leftBytes = useMemo(() => new TextEncoder().encode(leftInput).length, [leftInput]);
  const rightBytes = useMemo(() => new TextEncoder().encode(rightInput).length, [rightInput]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Braces className="size-4" />
          JSON 比对
        </span>
      }
      description="按路径递归比较两份 JSON，输出新增、删除、类型与值的差异"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="outline" onClick={() => void pick('left')} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开左侧
          </Button>
          <Button size="sm" variant="outline" onClick={() => void pick('right')} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开右侧
          </Button>
          <Button size="sm" variant="ghost" onClick={swap}>
            <ArrowLeftRight className="size-3.5" />
            交换
          </Button>
          <ClearButton
            onClick={() => {
              setLeftInput('');
              setRightInput('');
              setFileNote(null);
            }}
            disabled={leftInput === '' && rightInput === ''}
          />
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLeftInput(SAMPLE_LEFT);
              setRightInput(SAMPLE_RIGHT);
            }}
          >
            <FileJson className="size-3.5" />
            示例
          </Button>
          <Checkbox
            label="数组无序比较"
            checked={unorderedArrays}
            onChange={setUnorderedArrays}
            hint="按值集合匹配，忽略顺序与重复"
          />
          <NumberField
            label="数值容差"
            value={Number(tolerance) || 0}
            onChange={(value) => setTolerance(String(value))}
            min={0}
            step={0.01}
            suffix=""
          />
          <Checkbox
            label="忽略大小写（文本）"
            checked={diffOptions.ignoreCase}
            onChange={(v) => setDiffOptions({ ...diffOptions, ignoreCase: v })}
          />
          <Checkbox
            label="忽略空白（文本）"
            checked={diffOptions.ignoreWhitespace}
            onChange={(v) => setDiffOptions({ ...diffOptions, ignoreWhitespace: v })}
          />
          <NumberField
            label="上下文行数"
            value={diffOptions.context}
            onChange={(value) => setDiffOptions({ ...diffOptions, context: Number(value) || 0 })}
            min={0}
            max={20}
          />
        </div>

        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <SideBox
            label="左侧 JSON"
            value={leftInput}
            onChange={setLeftInput}
            error={left.error}
            bytes={leftBytes}
            note={fileNote}
          />
          <SideBox
            label="右侧 JSON"
            value={rightInput}
            onChange={setRightInput}
            error={right.error}
            bytes={rightBytes}
          />
        </div>

        <TextField
          label="忽略字段"
          value={ignoreText}
          onChange={setIgnoreText}
          placeholder="updatedAt, traceId（逗号分隔，任意层级生效）"
        />

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {result?.identical === true && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              两侧完全一致
            </span>
          )}
          {result !== null && result.changes.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" />共 {result.changes.length} 处差异
              {result.ignored > 0 && ` · 已忽略 ${result.ignored} 个字段`}
            </span>
          )}
          {result?.truncated === true && (
            <span className="text-amber-600 dark:text-amber-400">嵌套过深，结果已截断</span>
          )}
        </div>
      </div>

      <Tabs value={resultTab} onValueChange={(value) => setResultTab(value as ResultTab)}>
        <TabsList>
          <TabsTrigger value="changes" active={resultTab === 'changes'}>
            <span className="inline-flex items-center gap-1">
              <ListTree className="size-3.5" />
              变更列表
            </span>
          </TabsTrigger>
          <TabsTrigger value="text" active={resultTab === 'text'}>
            <span className="inline-flex items-center gap-1">
              <Rows3 className="size-3.5" />
              文本对比
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {resultTab === 'changes' &&
        (result === null ? (
          <EmptyHint>两侧都是合法 JSON 后显示逐路径差异。</EmptyHint>
        ) : result.changes.length === 0 ? (
          <EmptyHint>
            {result.truncated ? '嵌套超出深度上限，未发现可见差异。' : '两份 JSON 在当前比较选项下完全一致。'}
          </EmptyHint>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex-1 overflow-auto rounded-md border bg-muted/20 p-1.5 scrollbar-thin">
              {result.changes.map((item) => (
                <div key={item.id} className="rounded px-1.5 py-1 font-mono text-xs leading-relaxed hover:bg-muted/40">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`w-3 shrink-0 select-none text-center ${KIND_TONE[item.kind]}`}>
                      {KIND_SIGN[item.kind]}
                    </span>
                    <span className="min-w-0 flex-1 break-words font-semibold">{item.path}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{KIND_LABEL[item.kind]}</span>
                  </div>
                  {item.kind !== 'added' && (
                    <div className="ml-4.5 break-words text-red-700 dark:text-red-300">
                      <span className="mr-1 opacity-60">-</span>
                      {item.left}
                    </div>
                  )}
                  {item.kind !== 'removed' && (
                    <div className={`ml-4.5 break-words ${KIND_TONE[item.kind]}`}>
                      <span className="mr-1 opacity-60">+</span>
                      {item.right}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <ResultBox label="变更摘要" value={changesText} onCopy={() => copyText(changesText)} rows="min-h-24" />
          </div>
        ))}

      {resultTab === 'text' && (
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              ariaLabel="比对粒度"
              value={mode}
              onChange={(value) => setMode(value as DiffMode)}
              options={MODE_OPTIONS}
              selectClassName="w-28"
            />
            <Select
              ariaLabel="视图"
              value={view}
              onChange={(value) => setView(value as DiffView)}
              options={VIEW_OPTIONS}
              selectClassName="w-28"
            />
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={diff === null}>
              <Download className="size-3.5" />
              下载 diff
            </Button>
          </div>
          {diff === null ? (
            <EmptyHint>两侧都是合法 JSON 后显示文本差异。</EmptyHint>
          ) : (
            <>
              <RowList blocks={blocks} view={view} />
              <div className="flex flex-wrap items-center gap-2">
                <StatGrid>
                  <Stat label="相似度" value={`${diff.stats.similarity}%`} tone="success" />
                  <Stat label="改动行" value={diff.stats.added + diff.stats.deleted + diff.stats.modified} />
                  <Stat label="改动占比" value={`${diff.stats.changeRatio}%`} />
                </StatGrid>
              </div>
            </>
          )}
        </div>
      )}

      <Section title="导出" description="下载标准 unified diff，可直接用于 git diff">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={diff === null}>
            <Download className="size-3.5" />
            下载 {exportName('json-diff', 'diff')}
          </Button>
          <Hint>文本对比基于两侧格式化后的内容；结构差异以「变更列表」为准。</Hint>
        </div>
      </Section>

      <Note tone="info" title="比较规则">
        对象按键逐个比较，缺少的键记为新增或删除；数组默认按下标逐一比较，勾选
        「数组无序比较」后改为按值集合匹配。两侧类型不同时记为类型变更，不做隐式转换。
        忽略字段对任意层级生效，仅作用于结构比对。
      </Note>
    </ToolPanel>
  );
}

function SideBox({
  label,
  value,
  onChange,
  error,
  bytes,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  bytes: number;
  note?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`粘贴${label.replace(' JSON', '')}侧 JSON 或 JSON5 内容`}
        spellCheck={false}
        aria-label={label}
        className="min-h-48 flex-1 resize-none font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {error !== null ? (
            <XCircle className="size-3.5 text-destructive" />
          ) : value.trim() === '' ? (
            <Info className="size-3.5" />
          ) : (
            <CheckCircle2 className="size-3.5 text-emerald-600" />
          )}
          {error !== null ? '解析失败' : value.trim() === '' ? '等待输入' : formatBytes(bytes)}
        </span>
        {note && <span className="truncate">{note}</span>}
      </div>
      {error !== null && (
        <Note tone="danger" title={`${label} 解析失败`}>
          {error}
        </Note>
      )}
    </div>
  );
}

/** 键序不固定时先规范化，避免把纯顺序差异当成内容差异。 */
function stringifyStable(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) ?? '';
}

function sortKeys(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sortKeys);
  if (isPlainObject(node)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node).sort()) out[key] = sortKeys(node[key]);
    return out;
  }
  return node;
}

const INLINE_ROW: Record<DiffRow['kind'], string> = {
  equal: '',
  add: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  del: 'bg-red-500/10 text-red-700 line-through decoration-red-500/60 dark:text-red-300',
  modify: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const SIGN_TONE: Record<DiffRow['kind'], string> = {
  equal: 'text-muted-foreground/60',
  add: 'text-emerald-600 dark:text-emerald-400',
  del: 'text-red-600 dark:text-red-400',
  modify: 'text-amber-600 dark:text-amber-400',
};

const ROW_SIGN: Record<DiffRow['kind'], string> = { equal: ' ', add: '+', del: '-', modify: '~' };

function Gutter({ no }: { no: number | null }) {
  return (
    <span className="w-10 shrink-0 select-none pr-1.5 text-right text-[10px] text-muted-foreground/70 tabular-nums">
      {no ?? ''}
    </span>
  );
}

function InlineRow({ row }: { row: DiffRow }) {
  const text = row.kind === 'del' ? row.left : row.right;
  return (
    <div
      className={`flex items-start gap-1 rounded px-1.5 py-0.5 font-mono text-xs leading-relaxed ${INLINE_ROW[row.kind]}`}
    >
      <span className="w-3 shrink-0 select-none text-center opacity-70">{ROW_SIGN[row.kind]}</span>
      <Gutter no={row.leftNo ?? row.rightNo} />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{text}</span>
    </div>
  );
}

function SplitRow({ row }: { row: DiffRow }) {
  return (
    <div
      className={`grid grid-cols-2 ${
        row.kind === 'add'
          ? 'bg-emerald-500/5'
          : row.kind === 'del'
            ? 'bg-red-500/5'
            : row.kind === 'modify'
              ? 'bg-amber-500/5'
              : ''
      }`}
    >
      <div className="flex items-start gap-1 border-r border-dashed px-1.5 py-0.5 font-mono text-xs leading-relaxed">
        <span
          className={`w-3 shrink-0 select-none text-center ${SIGN_TONE[row.kind === 'add' ? 'equal' : row.kind === 'modify' ? 'del' : row.kind]}`}
        >
          {ROW_SIGN[row.kind === 'add' ? 'equal' : row.kind === 'modify' ? 'del' : row.kind]}
        </span>
        <Gutter no={row.leftNo} />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{row.left}</span>
      </div>
      <div className="flex items-start gap-1 px-1.5 py-0.5 font-mono text-xs leading-relaxed">
        <span
          className={`w-3 shrink-0 select-none text-center ${SIGN_TONE[row.kind === 'del' ? 'equal' : row.kind === 'modify' ? 'add' : row.kind]}`}
        >
          {ROW_SIGN[row.kind === 'del' ? 'equal' : row.kind === 'modify' ? 'add' : row.kind]}
        </span>
        <Gutter no={row.rightNo} />
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{row.right}</span>
      </div>
    </div>
  );
}

function RowList({ blocks, view }: { blocks: DiffBlock[]; view: DiffView }) {
  if (blocks.length === 0) return <EmptyHint>两侧内容完全一致</EmptyHint>;
  return (
    <div className="flex-1 overflow-auto rounded-md border bg-muted/20 p-1.5 scrollbar-thin">
      {blocks.map((block) =>
        block.type === 'rows' ? (
          <Fragment key={block.key}>
            {block.rows.map((row) => (
              <div key={row.rowId}>{view === 'split' ? <SplitRow row={row} /> : <InlineRow row={row} />}</div>
            ))}
          </Fragment>
        ) : (
          <div
            key={block.key}
            className="my-1 rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-center font-mono text-[11px] text-primary"
          >
            折叠 {block.count} 行未变更内容
          </div>
        ),
      )}
    </div>
  );
}
