import JSON5 from 'json5';
import {
  Braces,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileJson,
  FolderOpen,
  Info,
  Rows3,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { EmptyHint, Hint, Note, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
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
  const [indent, setIndent] = useState('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [strict, setStrict] = useState(false);
  const [unescapeJson, setUnescapeJson] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('format');
  const [treeTab, setTreeTab] = useState<TreeTab>('text');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const analysis = useMemo<Analysis>(() => {
    if (input.trim() === '') return { parsed: null, error: null, warnings: [] };
    // 去转义处理：在解析前去除转义字符
    const processedInput = unescapeJson ? unescapeJsonString(input) : input;
    // 严格模式只用 JSON.parse，避免 JSON5 的宽松语法让用户误以为输出仍是合法 JSON。
    const strictParse = (): unknown => JSON.parse(processedInput) as unknown;
    const looseParse = (): unknown => JSON5.parse(processedInput) as unknown;
    try {
      const value = strict ? strictParse() : looseParse();
      const duplicates = strict ? [] : findDuplicateKeys(processedInput);
      return {
        parsed: { value, strict: strict || isStrictJson(processedInput) },
        error: null,
        warnings: duplicates.map((name) => `键 "${name}" 重复出现，JSON.parse 会保留最后一个`),
      };
    } catch (error) {
      if (strict) {
        return { parsed: null, error: formatJsonError(error, processedInput), warnings: [] };
      }
      // JSON5 也失败：把第一个错误按 JSON 的位置提示出来，便于定位。
      const message = error instanceof Error ? error.message : String(error);
      return { parsed: null, error: `JSON 解析失败：${message}`, warnings: [] };
    }
  }, [input, strict, unescapeJson]);

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

  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.json,.json5,.txt,application/json,text/plain', multiple: false });
      const file = files[0];
      if (!file) return;
      const text = await readAsText(file);
      setInput(text);
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (formatted === '') return;
    downloadText(exportName('json', 'json'), formatted, 'application/json;charset=utf-8');
  }, [formatted]);

  const handleCopy = useCallback(() => {
    copyText(mainTab === 'format' || treeTab === 'text' ? formatted : JSON.stringify(summary, null, 2));
  }, [formatted, mainTab, summary, treeTab]);

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

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Braces className="size-4" />
          JSON 格式化
        </span>
      }
      description="支持 JSON5 宽松语法，附带结构树与类型统计"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => void handlePick()} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
          <Button size="sm" variant="outline" onClick={handleEscape} disabled={input === ''}>
            转义
          </Button>
          <Button size="sm" variant="outline" onClick={handleUnescape} disabled={input === ''}>
            去转义
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={input === ''} />
          <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
        </>
      }
    >
      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="format" active={mainTab === 'format'}>
            格式化
          </TabsTrigger>
          <TabsTrigger value="tree" active={mainTab === 'tree'}>
            结构分析
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Note tone="info" title="解析规则">
        默认按 JSON5 解析以兼容注释、单引号和尾逗号，但输出始终是标准 JSON。
      </Note>
      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              ariaLabel="缩进"
              value={indent}
              onChange={setIndent}
              options={indentOptions}
              selectClassName="w-24"
            />
            <Checkbox label="键排序" checked={sortKeys} onChange={setSortKeys} hint="勾选启动" />
            <Checkbox
              label="去转义"
              checked={unescapeJson}
              onChange={setUnescapeJson}
              hint="适用于粘贴被转义的字符串"
            />
            <Checkbox label="严格 JSON" checked={strict} onChange={setStrict} hint="关闭时接受注释、单引号与尾逗号" />
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴 JSON 或 JSON5 内容"
            spellCheck={false}
            aria-label="JSON 输入"
            className="min-h-48 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {analysis.error === null && analysis.parsed !== null ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : analysis.error !== null ? (
                <XCircle className="size-3.5 text-destructive" />
              ) : (
                <Info className="size-3.5" />
              )}
              {analysis.error === null
                ? analysis.parsed === null
                  ? '等待输入'
                  : summary === null
                    ? ''
                    : `${TYPE_LABEL[summary.type]} · ${formatBytes(inputBytes)}`
                : '解析失败'}
            </span>
            {fileNote && <span className="truncate">{fileNote}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {mainTab === 'format' && (
            <>
              <ResultBox
                label="美化输出"
                value={formatted}
                error={analysis.error}
                onCopy={() => void handleCopy()}
                rows="min-h-32"
                fill
              />
              <ResultBox
                label="压缩输出"
                value={minified}
                error={analysis.error}
                onCopy={() => copyText(minified)}
                rows="min-h-24"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleDownload} disabled={formatted === ''}>
                  <Download className="size-3.5" />
                  下载 JSON
                </Button>
                <Hint>
                  压缩输出比美化输出省{' '}
                  {formatted === '' || minified === '' ? 0 : formatBytes(inputBytes - minified.length * 3)}
                  （按 UTF-8 估算）。
                </Hint>
              </div>
            </>
          )}

          {mainTab === 'tree' && (
            <>
              <Tabs value={treeTab} onValueChange={(value) => setTreeTab(value as TreeTab)}>
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

              {treeTab === 'text' && (
                <ResultBox
                  label="结构化 JSON"
                  value={formatted}
                  error={analysis.error}
                  onCopy={() => void handleCopy()}
                  rows="min-h-48"
                  fill
                />
              )}

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
          )}
        </div>
      </div>
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
