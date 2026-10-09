/** 文本清洗：按可排序的规则链执行去重、排序、清洗与合并，规则链可存为预设。 */
import { ArrowDown, ArrowUp, Copy, Download, Eraser, FolderOpen, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { visualizeInvisible } from '../lib/bytes';
import { downloadText, exportName } from '../lib/file';

type RuleGroup = 'dedupe' | 'sort' | 'clean' | 'merge';
type DedupeMode = 'first' | 'last' | 'count';
type SortMode = 'asc' | 'desc' | 'natural' | 'numeric' | 'length' | 'shuffle' | 'collator';
type NewlineMode = 'lf' | 'crlf';

interface RuleDef {
  id: string;
  label: string;
  group: RuleGroup;
  description: string;
}

const RULE_DEFS: RuleDef[] = [
  { id: 'dropBom', label: '删除 BOM', group: 'clean', description: '去掉文件开头的 U+FEFF' },
  { id: 'unifyNewline', label: '统一换行', group: 'clean', description: '按 LF 或 CRLF 重新切分与拼接' },
  { id: 'trimDoc', label: '去首尾空行', group: 'clean', description: '删除文档首尾的空行' },
  { id: 'trimLines', label: '删除行首/行尾空白', group: 'clean', description: '逐行 trim' },
  { id: 'collapseSpaces', label: '压缩连续空格/Tab', group: 'clean', description: '连续空白折叠为一个空格' },
  { id: 'collapseEmptyLines', label: '去除重复空行', group: 'clean', description: '连续空行最多保留一行' },
  { id: 'dropEmptyLines', label: '删除空行', group: 'clean', description: '删除所有空白行' },
  { id: 'removeInvisible', label: '去除不可见字符', group: 'clean', description: '零宽字符、双向控制符等' },
  { id: 'visualizeInvisible', label: '可视化不可见字符', group: 'clean', description: '用 ␣ ⇥ ↵ 展示，排查隐藏字符' },
  { id: 'stripTrailingPunct', label: '去除行尾标点', group: 'clean', description: '删除中英文句末标点' },
  { id: 'stripHtml', label: '去除 HTML 标签', group: 'clean', description: '按 <[^>]+> 粗略剥离' },
  { id: 'unescapeLiterals', label: '反转义字面量', group: 'clean', description: '把 \\n、\\t 字面量变成真实字符' },
  { id: 'maskUrl', label: 'URL 脱敏', group: 'clean', description: '保留头尾，中间打码' },
  { id: 'maskEmail', label: '邮箱脱敏', group: 'clean', description: '保留首尾字符，中间打码' },
  { id: 'dedupe', label: '行去重', group: 'dedupe', description: '按模式保留首次 / 末次 / 全部' },
  { id: 'sort', label: '排序', group: 'sort', description: '字典序、自然序、长度、随机等' },
  { id: 'mergeLines', label: '按分隔符合并行', group: 'merge', description: '多行合并成一行' },
  { id: 'splitLines', label: '按分隔符拆行', group: 'merge', description: '一行按分隔符拆成多行' },
  { id: 'transpose', label: '列 → 行（转置）', group: 'merge', description: '按分隔符切列后转置输出' },
];

const GROUP_LABELS: Record<RuleGroup, string> = {
  dedupe: '去重',
  sort: '排序',
  clean: '清洗',
  merge: '合并',
};

const DEFAULT_ENABLED: Record<string, boolean> = {
  dropBom: true,
  trimDoc: true,
  trimLines: true,
  dropEmptyLines: true,
  dedupe: true,
  sort: false,
  collapseSpaces: false,
  removeInvisible: false,
  mergeLines: false,
  splitLines: false,
  transpose: false,
};

interface RuleParams {
  dedupeMode: DedupeMode;
  sortMode: SortMode;
  numbersFirst: boolean;
  newline: NewlineMode;
  mergeSep: string;
  splitSep: string;
  transposeSep: string;
  seed: number;
  dedupeIgnoreCase: boolean;
  dedupeIgnoreTrim: boolean;
}

const DEFAULT_PARAMS: RuleParams = {
  dedupeMode: 'first',
  sortMode: 'asc',
  numbersFirst: false,
  newline: 'lf',
  mergeSep: ',',
  splitSep: ',',
  transposeSep: ',',
  seed: 42,
  dedupeIgnoreCase: true,
  dedupeIgnoreTrim: true,
};

interface Preset {
  name: string;
  enabled: string[];
  params: RuleParams;
}

const PRESET_KEY = 'coder-tools:text-clean-presets';

function readPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Preset =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Preset).name === 'string' &&
        Array.isArray((item as Preset).enabled),
    );
  } catch {
    return [];
  }
}

// ── 纯逻辑 ────────────────────────────────────────────────

const NEWLINE_SPLIT = /\r\n|\r|\n/u;

function splitLines(text: string): string[] {
  return text.split(NEWLINE_SPLIT);
}

/** 零宽字符、软连字符、双向控制符等「看起来不存在」的字符。 */
const INVISIBLE_CHARS = /[\u00ad\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff]/gu;

/** 除换行与 Tab 外的 C0/DEL 控制字符。用码点判断而不是正则，避免在正则里写控制字符。 */
function stripControlChars(text: string): string {
  return Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    })
    .join('');
}

function maskMiddle(text: string): string {
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
}

/** 自然排序：file2 < file10。 */
export function naturalCompare(a: string, b: string): number {
  const chunks = /(\d+|\D+)/gu;
  const left = a.match(chunks) ?? [];
  const right = b.match(chunks) ?? [];
  const collator = new Intl.Collator('en');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d/u.test(x);
    const ny = /^\d/u.test(y);
    if (nx && ny) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      continue;
    }
    return collator.compare(x, y);
  }
  return 0;
}

/** mulberry32：随机排序可复现。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUMERIC_RE = /^[+-]?\d+(?:\.\d+)?$/u;

function sortLines(lines: string[], params: RuleParams): string[] {
  const collator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' });
  const copy = [...lines];
  const isNumber = (line: string) => NUMERIC_RE.test(line.trim());
  const numericValue = (line: string) =>
    NUMERIC_RE.test(line.trim()) ? Number(line.trim()) : Number.POSITIVE_INFINITY;
  const primary = (a: string, b: string): number => {
    switch (params.sortMode) {
      case 'natural':
        return naturalCompare(a, b);
      case 'numeric':
        return numericValue(a) - numericValue(b);
      case 'length':
        return a.length - b.length;
      case 'desc':
        return -collator.compare(a, b);
      default:
        return collator.compare(a, b);
    }
  };
  const numbersFirst = params.numbersFirst
    ? (a: string, b: string) => Number(isNumber(b)) - Number(isNumber(a))
    : () => 0;

  if (params.sortMode === 'shuffle') {
    const rand = mulberry32(params.seed);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  // Array.prototype.sort 自 ES2019 起保证稳定，配合 numbersFirst 分组即可得到「稳定排序」
  return copy.sort((a, b) => numbersFirst(a, b) || primary(a, b));
}

function dedupeLines(lines: string[], params: RuleParams): { lines: string[]; removed: number } {
  if (params.dedupeMode === 'count') return { lines, removed: 0 };
  const key = (line: string) => {
    let value = line;
    if (params.dedupeIgnoreTrim) value = value.trim();
    return params.dedupeIgnoreCase ? value.toLowerCase() : value;
  };
  if (params.dedupeMode === 'last') {
    const lastIndex = new Map<string, number>();
    lines.forEach((line, index) => {
      lastIndex.set(key(line), index);
    });
    const out: string[] = [];
    lines.forEach((line, index) => {
      if (lastIndex.get(key(line)) === index) out.push(line);
    });
    return { lines: out, removed: lines.length - out.length };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const k = key(line);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return { lines: out, removed: lines.length - out.length };
}

/** 按规则链依次执行，返回结果与过程统计。 */
export function runPipeline(
  input: string,
  order: string[],
  params: RuleParams,
): { text: string; removedEmpty: number; removedDup: number; elapsedMs: number; removed: number } {
  const started = performance.now();
  let lines = splitLines(input);
  const originalCount = lines.length;
  const unify = order.includes('unifyNewline');
  // 未启用统一换行时沿用输入的主换行风格
  const joiner = unify ? (params.newline === 'crlf' ? '\r\n' : '\n') : input.includes('\r\n') ? '\r\n' : '\n';
  let removedEmpty = 0;
  let removedDup = 0;

  for (const id of order) {
    switch (id) {
      case 'dropBom':
        lines = lines.map((line, index) => (index === 0 ? line.replace(/^\uFEFF/u, '') : line));
        break;
      case 'unifyNewline':
        lines = splitLines(lines.join(params.newline === 'crlf' ? '\r\n' : '\n'));
        break;
      case 'trimDoc':
        while (lines.length > 0 && lines[0].trim() === '') lines = lines.slice(1);
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines = lines.slice(0, -1);
        break;
      case 'trimLines':
        lines = lines.map((line) => line.trim());
        break;
      case 'collapseSpaces':
        lines = lines.map((line) => line.replace(/[ \t]+/gu, ' '));
        break;
      case 'collapseEmptyLines': {
        const out: string[] = [];
        let lastEmpty = false;
        for (const line of lines) {
          const empty = line.trim() === '';
          if (empty && lastEmpty) continue;
          out.push(line);
          lastEmpty = empty;
        }
        removedEmpty += lines.length - out.length;
        lines = out;
        break;
      }
      case 'dropEmptyLines': {
        const out = lines.filter((line) => line.trim() !== '');
        removedEmpty += lines.length - out.length;
        lines = out;
        break;
      }
      case 'removeInvisible':
        lines = lines.map((line) => stripControlChars(line.replace(INVISIBLE_CHARS, '')));
        break;
      case 'visualizeInvisible':
        lines = lines.map((line) => visualizeInvisible(line));
        break;
      case 'stripTrailingPunct':
        lines = lines.map((line) => line.replace(/[.,;:!?、，。；：！？…]+$/u, ''));
        break;
      case 'stripHtml':
        lines = lines.map((line) => line.replace(/<[^>]+>/gu, ''));
        break;
      case 'unescapeLiterals':
        lines = lines.map((line) =>
          line.replace(/\\([nrt])/gu, (_match, code: string) => (code === 'n' ? '\n' : code === 't' ? '\t' : '\r')),
        );
        break;
      case 'maskUrl':
        lines = lines.map((line) => line.replace(/https?:\/\/\S+/gu, (url) => maskMiddle(url)));
        break;
      case 'maskEmail':
        lines = lines.map((line) => line.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu, (mail) => maskMiddle(mail)));
        break;
      case 'dedupe': {
        const result = dedupeLines(lines, params);
        removedDup += result.removed;
        lines = result.lines;
        break;
      }
      case 'sort':
        lines = sortLines(lines, params);
        break;
      case 'mergeLines':
        lines = [lines.join(params.mergeSep)];
        break;
      case 'splitLines':
        lines = lines.flatMap((line) => (line === '' ? [''] : line.split(params.splitSep)));
        break;
      case 'transpose': {
        const rows = lines.map((line) => (line === '' ? [] : line.split(params.transposeSep)));
        const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
        const out: string[] = [];
        for (let col = 0; col < width; col++) {
          const cells = rows.map((row) => row[col] ?? '');
          out.push(cells.join(params.transposeSep));
        }
        lines = out;
        break;
      }
      default:
        break;
    }
  }

  const text = lines.join(joiner);
  return {
    text,
    removedEmpty,
    removedDup,
    removed: originalCount - lines.length,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
  };
}

const SORT_LABELS: Record<SortMode, string> = {
  asc: '升序（中文本地化）',
  desc: '降序（中文本地化）',
  natural: '自然排序（file2 < file10）',
  numeric: '按数值大小',
  length: '按长度',
  shuffle: '随机（可复现）',
  collator: 'Intl.Collator 本地化',
};

const SAMPLE = `  banana  
Apple
apple
cherry
file10
file2


banana
苹果
Apple  `;

export default function TextClean() {
  const [input, setInput] = useState(SAMPLE);
  const [enabled, setEnabled] = useState<string[]>(() =>
    RULE_DEFS.filter((rule) => DEFAULT_ENABLED[rule.id]).map((rule) => rule.id),
  );
  const [params, setParams] = useState<RuleParams>(DEFAULT_PARAMS);
  const [seedTick, setSeedTick] = useState(0);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setPresets(readPresets());
  }, []);

  const effectiveParams = useMemo(() => ({ ...params, seed: params.seed + seedTick }), [params, seedTick]);
  const result = useMemo(() => runPipeline(input, enabled, effectiveParams), [input, enabled, effectiveParams]);

  const duplicates = useMemo(() => {
    const counts = new Map<string, { count: number; sample: string }>();
    const key = (line: string) => {
      let value = line;
      if (params.dedupeIgnoreTrim) value = value.trim();
      return params.dedupeIgnoreCase ? value.toLowerCase() : value;
    };
    for (const line of splitLines(input)) {
      const k = key(line);
      const entry = counts.get(k);
      if (entry) entry.count += 1;
      else counts.set(k, { count: 1, sample: line });
    }
    return Array.from(counts.entries())
      .filter(([, value]) => value.count > 1)
      .map(([key_, value]) => ({ key: key_, ...value }))
      .sort((a, b) => b.count - a.count);
  }, [input, params.dedupeIgnoreCase, params.dedupeIgnoreTrim]);

  const whitespaceCount = useMemo(() => (input.match(/[ \t]/gu) ?? []).length, [input]);

  const move = useCallback(
    (id: string, delta: number) =>
      setEnabled((prev) => {
        const index = prev.indexOf(id);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    [],
  );

  const toggle = useCallback(
    (id: string) => setEnabled((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])),
    [],
  );

  const setParam = useCallback(
    <K extends keyof RuleParams>(key: K, value: RuleParams[K]) => setParams((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const persist = useCallback((next: Preset[]) => {
    setPresets(next);
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可用时静默降级为仅本次会话有效
    }
  }, []);

  const savePreset = useCallback(() => {
    const name = presetName.trim() || `预设 ${presets.length + 1}`;
    persist([...presets.filter((preset) => preset.name !== name), { name, enabled: [...enabled], params }]);
    setPresetName('');
  }, [persist, presets, enabled, params, presetName]);

  const loadPreset = useCallback((preset: Preset) => {
    setEnabled([...preset.enabled]);
    setParams({ ...DEFAULT_PARAMS, ...preset.params });
  }, []);

  const needsDedupe = enabled.includes('dedupe');
  const needsSort = enabled.includes('sort');
  const needsMerge = enabled.includes('mergeLines') || enabled.includes('splitLines') || enabled.includes('transpose');

  return (
    <ToolPanel
      title="文本清洗"
      description="按可调整顺序的规则链执行去重、排序、清洗与合并"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={!result.text} onClick={() => copyText(result.text)}>
            <Copy className="size-3.5" />
            复制结果
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!result.text}
            onClick={() => downloadText(exportName('text-clean', 'txt'), result.text)}
          >
            <Download className="size-3.5" />
            下载 .txt
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">输入文本</span>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="每行一条记录"
            spellCheck={false}
            className="min-h-48 resize-none font-mono text-xs"
            aria-label="输入文本"
          />
          <Hint>规则按下方链的顺序依次执行，上移/下移即可改变顺序。</Hint>
        </div>

        <ResultBox label="实时预览" value={result.text} rows="min-h-48" onCopy={() => copyText(result.text)} />
      </div>

      <Section title="处理规则链" description="顺序即执行顺序，用箭头按钮调整">
        <div className="grid gap-2 sm:grid-cols-2">
          {RULE_DEFS.map((rule) => {
            const index = enabled.indexOf(rule.id);
            const active = index >= 0;
            return (
              <div
                key={rule.id}
                className={`flex min-w-0 items-start gap-2 rounded-md border px-2 py-1.5 ${
                  active ? 'border-primary/60 bg-primary/5' : 'bg-muted/20'
                }`}
              >
                <Checkbox label="" checked={active} onChange={() => toggle(rule.id)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    {active && (
                      <span className="rounded bg-primary/15 px-1 font-mono text-[10px] text-primary">{index + 1}</span>
                    )}
                    {rule.label}
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      {GROUP_LABELS[rule.group]}
                    </span>
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{rule.description}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    aria-label={`上移规则 ${rule.label}`}
                    disabled={!active || index === 0}
                    onClick={() => move(rule.id, -1)}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    aria-label={`下移规则 ${rule.label}`}
                    disabled={!active || index === enabled.length - 1}
                    onClick={() => move(rule.id, 1)}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="规则参数" description="只影响上方已启用的规则">
          {needsDedupe && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="去重模式"
                value={params.dedupeMode}
                onChange={(value) => setParam('dedupeMode', value as DedupeMode)}
                options={[
                  { value: 'first', label: '保留首次出现' },
                  { value: 'last', label: '保留末次出现' },
                  { value: 'count', label: '保留全部（仅统计）' },
                ]}
              />
              <div className="flex flex-col justify-end gap-1.5 pb-0.5">
                <Checkbox
                  label="去重忽略大小写"
                  checked={params.dedupeIgnoreCase}
                  onChange={(value) => setParam('dedupeIgnoreCase', value)}
                />
                <Checkbox
                  label="去重忽略首尾空白"
                  checked={params.dedupeIgnoreTrim}
                  onChange={(value) => setParam('dedupeIgnoreTrim', value)}
                />
              </div>
            </div>
          )}

          {needsSort && (
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="排序方式"
                value={params.sortMode}
                onChange={(value) => setParam('sortMode', value as SortMode)}
                options={(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => ({
                  value: mode,
                  label: SORT_LABELS[mode],
                }))}
              />
              <div className="flex flex-col justify-end gap-1.5 pb-0.5">
                <Checkbox
                  label="数值项排在前面"
                  checked={params.numbersFirst}
                  onChange={(value) => setParam('numbersFirst', value)}
                  hint="区分数值与字符串"
                />
                {params.sortMode === 'shuffle' && (
                  <Button size="sm" variant="outline" onClick={() => setSeedTick((value) => value + 1)}>
                    <Eraser className="size-3.5" />
                    换一批随机顺序
                  </Button>
                )}
              </div>
            </div>
          )}

          {needsMerge && (
            <div className="grid grid-cols-3 gap-2">
              {enabled.includes('mergeLines') && (
                <TextField
                  label="合并分隔符"
                  value={params.mergeSep}
                  onChange={(value) => setParam('mergeSep', value)}
                />
              )}
              {enabled.includes('splitLines') && (
                <TextField
                  label="拆分分隔符"
                  value={params.splitSep}
                  onChange={(value) => setParam('splitSep', value)}
                />
              )}
              {enabled.includes('transpose') && (
                <TextField
                  label="转置分隔符"
                  value={params.transposeSep}
                  onChange={(value) => setParam('transposeSep', value)}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Select
              label="输出换行符"
              value={params.newline}
              onChange={(value) => setParam('newline', value as NewlineMode)}
              options={[
                { value: 'lf', label: 'LF（\\n）' },
                { value: 'crlf', label: 'CRLF（\\r\\n）' },
              ]}
            />
            <NumberField
              label="随机种子"
              value={params.seed}
              onChange={(value) => setParam('seed', value >>> 0)}
              min={0}
              hint="仅随机排序使用"
            />
          </div>
        </Section>

        <Section title="统计与重复项" description="重复内容按当前去重的忽略规则归并">
          <StatGrid>
            <Stat label="原始行数" value={splitLines(input).length} />
            <Stat label="结果行数" value={splitLines(result.text).length} />
            <Stat label="删除空行" value={result.removedEmpty} tone={result.removedEmpty > 0 ? 'warn' : 'info'} />
            <Stat label="空白字符数" value={whitespaceCount} hint="输入中的空格与 Tab" />
            <Stat label="去重删除" value={result.removedDup} tone={result.removedDup > 0 ? 'warn' : 'info'} />
            <Stat
              label="排序方式"
              value={needsSort ? SORT_LABELS[params.sortMode] : '未启用'}
              hint="Array.sort 自 ES2019 起稳定"
            />
            <Stat label="总行数变化" value={result.removed} />
            <Stat label="处理耗时" value={`${result.elapsedMs} ms`} hint="仅统计规则执行时间" />
          </StatGrid>

          <Button size="sm" variant="outline" onClick={() => setShowDuplicates((value) => !value)}>
            {showDuplicates ? '隐藏' : '查看'}重复内容列表（{duplicates.length} 条）
          </Button>
          {showDuplicates &&
            (duplicates.length === 0 ? (
              <EmptyHint>没有重复项</EmptyHint>
            ) : (
              <div className="max-h-48 overflow-auto rounded-md border scrollbar-thin">
                <ul>
                  {duplicates.slice(0, 200).map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center gap-2 border-b px-2 py-1 font-mono text-[11px] last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.sample || '（空行）'}</span>
                      <span className="shrink-0 text-muted-foreground">×{item.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </Section>
      </div>

      <Section title="预设" description="保存在 localStorage，仅本机可见">
        <div className="grid gap-2 md:grid-cols-3">
          <TextField
            label="预设名称"
            value={presetName}
            onChange={setPresetName}
            placeholder="例：日志去重"
            className="md:col-span-1"
          />
          <div className="flex items-end gap-1.5">
            <Button size="sm" variant="outline" onClick={savePreset} disabled={enabled.length === 0}>
              <Save className="size-3.5" />
              保存为预设
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEnabled([])} disabled={enabled.length === 0}>
              <X className="size-3.5" />
              清空规则
            </Button>
          </div>
        </div>
        {presets.length === 0 ? (
          <Hint>还没有保存的预设。</Hint>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <span key={preset.name} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]">
                <button type="button" className="hover:text-primary" onClick={() => loadPreset(preset)}>
                  <span className="inline-flex items-center gap-1">
                    <FolderOpen className="size-3" />
                    {preset.name}
                    <span className="text-muted-foreground">（{preset.enabled.length} 条规则）</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`删除预设 ${preset.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => persist(presets.filter((item) => item.name !== preset.name))}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Note tone="info" title="清洗规则的口径">
        「去除 HTML 标签」使用 <code className="font-mono">&lt;[^&gt;]+&gt;</code> 粗略匹配，遇到属性值里的
        <code className="font-mono">&gt;</code> 可能误删；「去除不可见字符」会删掉零宽空格与双向控制符，
        若你怀疑自己的文本里混入了不可见字符，建议先用「可视化不可见字符」排查再清理。
      </Note>
    </ToolPanel>
  );
}
