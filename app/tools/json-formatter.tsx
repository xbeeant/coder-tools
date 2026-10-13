import JSON5 from 'json5';
import {
  Braces,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Info,
  Play,
  Rows3,
  Upload,
  XCircle,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { JsonTree } from '../components/ui/json-tree';
import { EmptyHint, Note, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../components/ui/utils';
import { formatBytes } from '../lib/bytes';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import { inferArrayItemType, type JsonType, summarizeJson } from '../lib/json-convert';

/** 去转义功能：将被转义的 JSON 字符串还原为原始文本。 */
function unescapeJsonString(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    return text;
  } catch {
    return text;
  }
}

/** 转义功能：将原始文本编码为 JSON 字符串字面量。 */
function escapeJsonString(text: string): string {
  return JSON.stringify(text);
}

/** 尝试将当前输入作为 JSON 字符串解析并还原；成功则返回新文本。 */
function tryUnescape(text: string): string {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // not a JSON string literal
  }
  return text;
}

type MainTab = 'format' | 'tree';
type TreeTab = 'text' | 'stats';
type OutputMode = 'pretty' | 'minify';
type OutputView = 'text' | 'tree';

/** 超过该字符数后暂停自动解析，改由用户手动触发，避免大文件卡死浏览器。 */
const AUTO_PARSE_LIMIT = 1_000_000;

interface Parsed {
  value: unknown;
  /** 源码是否为严格 JSON（false 表示按 JSON5 的宽松语法解析）。 */
  strict: boolean;
}

interface Analysis {
  parsed: Parsed | null;
  error: string | null;
  /** 原始文本是否存在严格 JSON 可以接受的问题（重复键等）。 */
  warnings: string[];
}

const SAMPLE = `{
  "id": 1001,
  "name": "示例用户",
  "email": "user@example.com",
  "active": true,
  "score": 9.5,
  "tags": ["admin", "vip"],
  "profile": { "city": "上海", "remark": null },
  "history": [{ "date": "2024-01-01", "action": "login" }]
}`;

const TYPE_LABEL: Record<JsonType | 'mixed' | 'unknown', string> = {
  null: 'null',
  boolean: '布尔',
  number: '数字',
  string: '字符串',
  array: '数组',
  object: '对象',
  mixed: '混合类型',
  unknown: '未知',
};

const indentOptions = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: '\t', label: '制表符' },
  { value: '0', label: '不缩进' },
];

/** 统计重复键：JSON.parse 会静默丢弃重复键，这里单独扫一遍提示用户。 */
function findDuplicateKeys(text: string): string[] {
  const found: string[] = [];
  const src = text.replace(/^\uFEFF/, '');
  const len = src.length;
  let index = 0;

  const skipWs = () => {
    while (index < len && /\s/.test(src[index] as string)) index += 1;
  };

  const readString = (): string | null => {
    if (src[index] !== '"') return null;
    let out = '';
    index += 1;
    while (index < len) {
      const char = src[index] as string;
      if (char === '\\') {
        out += src[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (char === '"') {
        index += 1;
        return out;
      }
      out += char;
      index += 1;
    }
    return out;
  };

  // 深度上限：超出后停止下降，避免超深嵌套导致栈溢出。
  const MAX_DEPTH = 400;
  const readValue = (depth: number): void => {
    if (depth > MAX_DEPTH) return;
    skipWs();
    const char = src[index];
    if (char === '{') {
      const seen = new Set<string>();
      index += 1;
      skipWs();
      while (index < len && src[index] !== '}') {
        skipWs();
        const name = readString();
        skipWs();
        if (src[index] === ':') index += 1;
        if (name !== null) {
          if (seen.has(name)) found.push(name);
          else seen.add(name);
        }
        readValue(depth + 1);
        skipWs();
        if (src[index] === ',') index += 1;
        skipWs();
      }
      index += 1;
      return;
    }
    if (char === '[') {
      index += 1;
      skipWs();
      while (index < len && src[index] !== ']') {
        readValue(depth + 1);
        skipWs();
        if (src[index] === ',') index += 1;
        skipWs();
      }
      index += 1;
      return;
    }
    if (char === '"') {
      readString();
      return;
    }
    while (index < len && !/[,}\]\s]/.test(src[index] as string)) index += 1;
  };

  readValue(0);
  return [...new Set(found)];
}

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [committed, setCommitted] = useState('');
  const [indent, setIndent] = useState('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [strict, setStrict] = useState(false);
  const [unescapeJson, setUnescapeJson] = useState(false);
  const [mode, setMode] = useState<OutputMode>('pretty');
  const [outputView, setOutputView] = useState<OutputView>('tree');
  const [mainTab, setMainTab] = useState<MainTab>('format');
  const [treeTab, setTreeTab] = useState<TreeTab>('text');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // 超过阈值后不再自动解析；committed 落后于 input 时说明还有未处理的大文件内容。
  const isLarge = input.length > AUTO_PARSE_LIMIT;
  const pending = isLarge && committed !== input;

  // 小文本随输入实时解析；大文本保持不动，等用户点击「开始处理」。
  useEffect(() => {
    if (!isLarge) setCommitted(input);
  }, [input, isLarge]);

  const analysis = useMemo<Analysis>(() => {
    if (committed.trim() === '') return { parsed: null, error: null, warnings: [] };
    // 去转义处理：在解析前去除转义字符。
    const processed = unescapeJson ? unescapeJsonString(committed) : committed;
    const small = processed.length <= AUTO_PARSE_LIMIT;
    try {
      const value = strict ? (JSON.parse(processed) as unknown) : (JSON5.parse(processed) as unknown);
      // 大文本跳过重复键扫描与严格性复检，避免二次全量遍历。
      const duplicates = strict || !small ? [] : findDuplicateKeys(processed);
      return {
        parsed: { value, strict: strict || (small && isStrictJson(processed)) },
        error: null,
        warnings: duplicates.map((name) => `键 "${name}" 重复出现，JSON.parse 会保留最后一个`),
      };
    } catch (error) {
      if (strict) {
        return { parsed: null, error: formatJsonError(error, processed), warnings: [] };
      }
      // JSON5 也失败：把原始错误直接抛出，便于定位。
      const message = error instanceof Error ? error.message : String(error);
      return { parsed: null, error: `JSON 解析失败：${message}`, warnings: [] };
    }
  }, [committed, strict, unescapeJson]);

  const indentValue = indent === '0' ? 0 : indent === '\t' ? '\t' : Number(indent);

  const sorted = useMemo<unknown>(() => {
    if (!sortKeys || analysis.parsed === null) return analysis.parsed?.value ?? null;
    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk);
      if (node !== null && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(node as Record<string, unknown>).sort()) {
          out[key] = walk((node as Record<string, unknown>)[key]);
        }
        return out;
      }
      return node;
    };
    return walk(analysis.parsed?.value ?? null);
  }, [analysis.parsed, sortKeys]);

  const formatted = useMemo(() => {
    if (analysis.parsed === null) return '';
    return JSON.stringify(sorted, null, indentValue) ?? '';
  }, [analysis.parsed, sorted, indentValue]);

  const minified = useMemo(() => {
    if (analysis.parsed === null) return '';
    return JSON.stringify(sorted) ?? '';
  }, [analysis.parsed, sorted]);

  const summary = useMemo(
    () => (analysis.parsed === null ? null : summarizeJson(analysis.parsed.value)),
    [analysis.parsed],
  );

  const itemType = useMemo(() => {
    const value = analysis.parsed?.value;
    if (!Array.isArray(value)) return null;
    return inferArrayItemType(value);
  }, [analysis.parsed]);

  const hasResult = analysis.parsed !== null && analysis.error === null;
  const output = pending ? '' : mode === 'pretty' ? formatted : minified;
  const outputLabel = mode === 'pretty' ? '美化输出' : '压缩输出';

  /** 读取用户选择的本地文件，大文件不立即解析。 */
  const openFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const text = await readAsText(file);
      setInput(text);
      // 大文件先清空已解析结果，等待用户手动触发处理。
      if (text.length > AUTO_PARSE_LIMIT) setCommitted('');
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePick = useCallback(async () => {
    const files = await pickFiles({ accept: '.json,.json5,.txt,application/json,text/plain', multiple: false });
    const file = files[0];
    if (file) await openFile(file);
  }, [openFile]);

  const handleDownload = useCallback(() => {
    if (output === '') return;
    downloadText(exportName('json', 'json'), output, 'application/json;charset=utf-8');
  }, [output]);

  const handleCopy = useCallback(() => {
    if (mainTab === 'format') {
      copyText(output);
    } else if (treeTab === 'text') {
      copyText(formatted);
    } else {
      copyText(JSON.stringify(summary, null, 2));
    }
  }, [formatted, mainTab, output, summary, treeTab]);

  /** 转义：将输入内容编码为 JSON 字符串字面量。 */
  const handleEscape = useCallback(() => {
    if (input === '') return;
    setInput(escapeJsonString(input));
  }, [input]);

  /** 去转义：尝试将输入内容从 JSON 字符串字面量解码。 */
  const handleUnescape = useCallback(() => {
    if (input === '') return;
    const unescaped = tryUnescape(input);
    if (unescaped !== input) setInput(unescaped);
  }, [input]);

  const inputBytes = useMemo(() => new TextEncoder().encode(input).length, [input]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = Array.from(event.dataTransfer.files)[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Braces className="size-4" />
          JSON 格式化
        </span>
      }
      description="支持 JSON5 宽松语法，可拖入文件，一键美化或压缩"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="outline" onClick={() => void handlePick()} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as MainTab)} className="w-fit">
          <TabsList>
            <TabsTrigger value="format" active={mainTab === 'format'}>
              格式化
            </TabsTrigger>
            <TabsTrigger value="tree" active={mainTab === 'tree'}>
              结构分析
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mainTab === 'format' && (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span aria-hidden className="h-4 w-px bg-border" />
            <Tabs value={mode} onValueChange={(value) => setMode(value as OutputMode)} className="w-fit">
              <TabsList>
                <TabsTrigger value="pretty" active={mode === 'pretty'}>
                  美化
                </TabsTrigger>
                <TabsTrigger value="minify" active={mode === 'minify'}>
                  压缩
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select
              ariaLabel="缩进"
              value={indent}
              onChange={setIndent}
              options={indentOptions}
              selectClassName="w-24"
              disabled={mode === 'minify'}
            />
            <Checkbox label="键排序" checked={sortKeys} onChange={setSortKeys} title="按字母顺序排列对象键" />
            <Checkbox label="严格 JSON" checked={strict} onChange={setStrict} title="关闭时接受注释、单引号与尾逗号" />
            <Checkbox
              label="去转义"
              checked={unescapeJson}
              onChange={setUnescapeJson}
              title="适用于粘贴被转义的字符串"
            />
          </span>
        )}
        {mainTab === 'tree' && (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span aria-hidden className="h-4 w-px bg-border" />
            <Tabs value={treeTab} onValueChange={(value) => setTreeTab(value as TreeTab)} className="w-fit">
              <TabsList>
                <TabsTrigger value="text" active={treeTab === 'text'}>
                  <span className="inline-flex items-center gap-1">
                    <FileJson className="size-3.5" />
                    JSON 树
                  </span>
                </TabsTrigger>
                <TabsTrigger value="stats" active={treeTab === 'stats'}>
                  <span className="inline-flex items-center gap-1">
                    <Rows3 className="size-3.5" />
                    类型统计
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </span>
        )}
      </div>

      {isLarge && (
        <Note tone="warn" title="大文件模式">
          内容超过 100 万字符，已暂停自动解析以免卡顿。
          <div className="mt-1.5">
            <Button size="sm" variant="outline" onClick={() => setCommitted(input)} disabled={!pending}>
              <Play className="size-3.5" />
              {pending ? '开始处理' : '已是最新'}
            </Button>
          </div>
        </Note>
      )}

      {mainTab === 'format' && (
        <div className="grid min-h-0 flex-1 gap-2 md:auto-rows-fr md:grid-cols-2">
          <section
            aria-label="JSON 输入区，可拖入文件"
            className={cn(
              'relative flex min-h-0 min-w-0 flex-col gap-1.5',
              dragging && 'rounded-md ring-2 ring-primary ring-offset-2',
            )}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) {
                event.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={handleDrop}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                输入
                {pending ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Info className="size-3.5" />
                    已暂停解析
                  </span>
                ) : analysis.error !== null ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="size-3.5" />
                    解析失败
                  </span>
                ) : hasResult ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    {summary ? `${TYPE_LABEL[summary.type]} · ${formatBytes(inputBytes)}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Info className="size-3.5" />
                    等待输入
                  </span>
                )}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEscape}
                  disabled={input === ''}
                  title="将输入编码为 JSON 字符串字面量"
                >
                  转义
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleUnescape}
                  disabled={input === ''}
                  title="解码被转义粘贴的 JSON 字符串"
                >
                  去转义
                </Button>
                <ClearButton onClick={() => setInput('')} disabled={input === ''} />
              </div>
            </div>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="粘贴 JSON 或 JSON5 内容，或拖入 .json 文件"
              spellCheck={false}
              aria-label="JSON 输入"
              className="min-h-40 flex-1 resize-none font-mono text-xs"
            />
            {fileNote && <p className="truncate text-[11px] text-muted-foreground">{fileNote}</p>}
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Upload className="size-4" />
                  松手读取 JSON 文件
                </span>
              </div>
            )}
          </section>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {outputLabel}
                {mode === 'pretty' && (
                  <span className="inline-flex items-center">
                    <Tabs
                      value={outputView}
                      onValueChange={(value) => setOutputView(value as OutputView)}
                      className="w-fit"
                    >
                      <TabsList className="h-6">
                        <TabsTrigger value="text" active={outputView === 'text'} className="px-2 py-0 text-[10px]">
                          文本
                        </TabsTrigger>
                        <TabsTrigger value="tree" active={outputView === 'tree'} className="px-2 py-0 text-[10px]">
                          树形
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </span>
                )}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="sm" variant="ghost" disabled={output === ''} onClick={handleDownload}>
                  <Download className="size-3.5" />
                  下载
                </Button>
                <Button size="sm" variant="ghost" disabled={!hasResult || pending} onClick={() => void handleCopy()}>
                  <Copy className="size-3.5" />
                  复制
                </Button>
              </div>
            </div>
            {mode === 'pretty' && outputView === 'tree' && hasResult && !pending ? (
              <JsonTree value={sorted} defaultExpandedDepth={2} fill />
            ) : (
              <ResultBox value={output} error={pending ? null : analysis.error} rows="min-h-40" fill />
            )}
          </div>
        </div>
      )}

      {mainTab === 'tree' &&
        (pending ? (
          <EmptyHint>内容较大，请切回「格式化」标签点击「开始处理」。</EmptyHint>
        ) : (
          <>
            {treeTab === 'text' &&
              (analysis.parsed === null ? (
                <EmptyHint>输入 JSON 后以可折叠的树形结构展示。</EmptyHint>
              ) : analysis.error !== null ? (
                <ResultBox value="" error={analysis.error} rows="min-h-48" />
              ) : (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex shrink-0 items-center justify-between gap-2">
                    <span className="min-w-0 text-xs text-muted-foreground">结构化 JSON</span>
                    <Button size="sm" variant="ghost" disabled={formatted === ''} onClick={() => void handleCopy()}>
                      <Copy className="size-3.5" />
                      复制
                    </Button>
                  </div>
                  <JsonTree value={analysis.parsed.value} defaultExpandedDepth={3} />
                </div>
              ))}

            {treeTab === 'stats' &&
              (summary === null ? (
                <EmptyHint>输入 JSON 后显示类型、字段与深度统计。</EmptyHint>
              ) : (
                <div className="flex flex-col gap-3">
                  <StatGrid>
                    <Stat label="根类型" value={TYPE_LABEL[summary.type]} />
                    <Stat label="字段数" value={summary.keys} />
                    <Stat label="元素个数" value={summary.items} />
                    <Stat label="最大深度" value={summary.depth} />
                    <Stat
                      label="数组元素类型"
                      value={itemType === null ? '不适用' : TYPE_LABEL[itemType]}
                      hint={itemType === 'mixed' ? '数组内混有多种类型' : undefined}
                    />
                    <Stat label="输入体积" value={formatBytes(inputBytes)} />
                    <Stat
                      label="语法"
                      value={analysis.parsed?.strict ? '标准 JSON' : 'JSON5'}
                      tone={analysis.parsed?.strict ? 'success' : 'warn'}
                    />
                  </StatGrid>
                  <ResultBox
                    label="统计 JSON"
                    value={JSON.stringify(summary, null, 2)}
                    onCopy={() => void handleCopy()}
                  />
                  {analysis.warnings.map((warning) => (
                    <Note key={warning} tone="warn" title="重复键提示">
                      {warning}
                    </Note>
                  ))}
                </div>
              ))}
          </>
        ))}
    </ToolPanel>
  );
}

/** 粗略判断文本本身是否符合严格 JSON（用于「标准 JSON / JSON5」标记）。 */
function isStrictJson(text: string): boolean {
  const src = text.replace(/^\uFEFF/, '').trim();
  if (src === '') return false;
  try {
    JSON.parse(src);
    return true;
  } catch {
    return false;
  }
}

/** 提取 JSON.parse 报错信息里的行列位置，方便和输入对照。 */
function formatJsonError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = text.split('\n');
  if (lines.length === 1) return message;
  const match = /line (\d+)/i.exec(message);
  if (!match) return message;
  const line = Number(match[1]);
  const excerpt = lines[line - 1];
  return excerpt === undefined ? message : `${message}\n第 ${line} 行：${excerpt.trim()}`;
}