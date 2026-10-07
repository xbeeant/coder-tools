/** Slugify 转换：生成 URL 友好的短标识，支持模板拼接、反向还原与批量复制。 */
import { ArrowLeftRight, Copy, Download, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';

type SeparatorKey = '-' | '_' | '.' | ' ' | 'custom';
type ChinesePolicy = 'keep' | 'drop';

interface SlugOptions {
  separator: string;
  lowercase: boolean;
  removeAccents: boolean;
  chinese: ChinesePolicy;
  removePunctuation: boolean;
  collapseSeparators: boolean;
  trimSeparators: boolean;
  maxLength: number;
  keepVersion: boolean;
}

const DEFAULT_OPTIONS: SlugOptions = {
  separator: '-',
  lowercase: true,
  removeAccents: true,
  chinese: 'keep',
  removePunctuation: true,
  collapseSeparators: true,
  trimSeparators: true,
  maxLength: 0,
  keepVersion: true,
};

const SEPARATOR_OPTIONS: { value: SeparatorKey; label: string }[] = [
  { value: '-', label: '连字符 -' },
  { value: '_', label: '下划线 _' },
  { value: '.', label: '点号 .' },
  { value: ' ', label: '空格' },
  { value: 'custom', label: '自定义' },
];

const TEMPLATES: { value: string; label: string }[] = [
  { value: '', label: '不使用模板（仅 slug）' },
  { value: 'blog/{slug}', label: 'blog/{slug}' },
  { value: 'post-{slug}-{yyyyMMdd}', label: 'post-{slug}-{yyyyMMdd}' },
  { value: '{yyyy}/{MM}/{slug}', label: '{yyyy}/{MM}/{slug}' },
  { value: 'p/{id}-{slug}', label: 'p/{id}-{slug}' },
];

/** 版本号与日期：v1.2.3、1.2.3、20240131、2024-01-31。 */
const VERSION_SOURCE = String.raw`v?\d+(?:[._]\d+)+|\d{4}[-_.]?\d{2}[-_.]?\d{2}`;
const PROTECTED_GLOBAL = new RegExp(VERSION_SOURCE, 'gu');
const PROTECTED_TEST = new RegExp(VERSION_SOURCE, 'u');

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

/** 去掉组合记号，得到去重音后的基本拉丁字母。 */
function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isCjk(char: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
}

/** 处理普通片段：逐字符判断，产出以分隔符连接的词元串（首尾无分隔符）。 */
function slugChunk(chunk: string, options: SlugOptions): string {
  const sep = options.separator;
  const source = options.removeAccents ? stripAccents(chunk) : chunk.normalize('NFC');
  let out = '';
  for (const char of source) {
    if (isCjk(char)) {
      if (options.chinese === 'keep') out += char;
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(char)) {
      out += char;
      continue;
    }
    if (!options.removePunctuation && /[\p{P}\p{S}]/u.test(char) && char !== sep) {
      out += char;
      continue;
    }
    if (sep !== '') out += sep;
  }
  if (sep === '') return out;
  return out
    .replace(new RegExp(`${escapeRegExp(sep)}{2,}`, 'gu'), sep)
    .replace(new RegExp(`^${escapeRegExp(sep)}+|${escapeRegExp(sep)}+$`, 'gu'), '');
}

/**
 * 把一行文本转成 slug。
 * 「保留版本号 / 日期」打开时，v1.2.3 这类片段整段保留，不参与拆词。
 */
export function slugify(text: string, options: SlugOptions): string {
  const sep = options.separator;
  const pieces: string[] = [];
  let cursor = 0;

  if (options.keepVersion) {
    for (const match of text.matchAll(PROTECTED_GLOBAL)) {
      const start = match.index ?? 0;
      if (start > cursor) pieces.push(slugChunk(text.slice(cursor, start), options));
      pieces.push(match[0]);
      cursor = start + match[0].length;
    }
  }
  if (cursor < text.length) pieces.push(slugChunk(text.slice(cursor), options));

  let result = pieces.filter((piece) => piece !== '').join(sep);
  if (options.collapseSeparators && sep !== '') {
    result = result.replace(new RegExp(`${escapeRegExp(sep)}{2,}`, 'gu'), sep);
  }
  if (options.trimSeparators && sep !== '') {
    result = result.replace(new RegExp(`^${escapeRegExp(sep)}+|${escapeRegExp(sep)}+$`, 'gu'), '');
  }
  if (options.lowercase) result = result.toLowerCase();

  if (options.maxLength > 0 && result.length > options.maxLength) {
    const truncated = result.slice(0, options.maxLength);
    let cut = -1;
    if (options.trimSeparators && sep !== '') {
      const index = truncated.lastIndexOf(sep);
      // 只有在分隔符位于后半段时才切，避免截掉过多内容
      if (index > options.maxLength * 0.5) cut = index;
    }
    result = cut >= 0 ? truncated.slice(0, cut) : truncated;
  }
  return result;
}

/** 应用批量模板，占位符用当前日期填充。 */
export function applyTemplate(slug: string, template: string, date = new Date()): string {
  if (template === '') return slug;
  return template
    .replaceAll('{slug}', slug)
    .replaceAll('{id}', String(Math.abs(date.getTime()) % 100000))
    .replaceAll('{yyyyMMdd}', `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`)
    .replaceAll('{yyyy}', String(date.getFullYear()))
    .replaceAll('{MM}', pad(date.getMonth() + 1))
    .replaceAll('{dd}', pad(date.getDate()));
}

/** slug → 标题：分隔符还原为空格并首字母大写。 */
export function unslugify(text: string, separator: string): string {
  const splitter = separator === '' ? /\s+/u : new RegExp(`[${escapeRegExp(separator)}\\s]+`, 'gu');
  return text
    .split(splitter)
    .filter(Boolean)
    .map((word) => (/[a-z]/u.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

const SAMPLE = `Héllo Wörld! 这是我的第一篇 Blog 文章
React 19 正式发布：并发特性与 Server Components 详解
v1.2.3 版本说明
2024-01-31 发布说明`;

export default function SlugTool() {
  const [input, setInput] = useState(SAMPLE);
  const [options, setOptions] = useState<SlugOptions>(DEFAULT_OPTIONS);
  const [customSeparator, setCustomSeparator] = useState('--');
  const [separatorKey, setSeparatorKey] = useState<SeparatorKey>('-');
  const [template, setTemplate] = useState('');
  const [urlPrefix, setUrlPrefix] = useState('https://example.com/blog/');
  const [reverse, setReverse] = useState(false);

  const separator = separatorKey === 'custom' ? customSeparator : separatorKey;

  const rows = useMemo(() => {
    const active: SlugOptions = { ...options, separator };
    return input
      .split('\n')
      .map((line, index) => {
        const value = reverse ? unslugify(line.trim(), separator) : slugify(line, active);
        return { lineNo: index + 1, source: line, value, url: `${urlPrefix}${value}` };
      })
      .filter((row) => row.source.trim() !== '');
  }, [input, options, separator, reverse, urlPrefix]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      changed: rows.filter((row) => row.value !== row.source.trim()).length,
      longest: rows.reduce((max, row) => Math.max(max, row.value.length), 0),
      empty: rows.filter((row) => row.value === '').length,
      versioned: rows.filter((row) => PROTECTED_TEST.test(row.source)).length,
    }),
    [rows],
  );

  const setOption = <K extends keyof SlugOptions>(key: K, value: SlugOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const finalValues = rows.map((row) => applyTemplate(row.value, template));
  const sqlText = finalValues.map((value) => `'${value.replaceAll("'", "''")}'`).join(',\n');
  const jsonText = JSON.stringify(finalValues, null, 2);
  const lineText = finalValues.join('\n');

  return (
    <ToolPanel
      title="Slugify 转换"
      description="把标题批量转成 URL 友好的短标识"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={!finalValues.length} onClick={() => copyText(lineText)}>
            <Copy className="size-3.5" />
            复制全部
          </Button>
          <Button size="sm" variant="outline" disabled={!finalValues.length} onClick={() => copyText(jsonText)}>
            复制 JSON
          </Button>
          <Button size="sm" variant="outline" disabled={!finalValues.length} onClick={() => copyText(sqlText)}>
            复制 SQL
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!lineText}
            onClick={() => downloadText(exportName('slug', 'txt'), lineText)}
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
          <span className="text-xs text-muted-foreground">输入文本（每行一条）</span>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴标题列表"
            spellCheck={false}
            className="min-h-48 resize-none font-mono text-xs"
            aria-label="输入文本（每行一条）"
          />
          <Hint>空行会被忽略；输出与「非空输入行」一一对应。</Hint>
        </div>

        <Section title="转换选项" description="中文不做拼音转写，可选择保留原字符或直接去除">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="分隔符"
              value={separatorKey}
              onChange={(value) => setSeparatorKey(value as SeparatorKey)}
              options={SEPARATOR_OPTIONS}
            />
            <TextField
              label="自定义分隔符"
              value={customSeparator}
              onChange={setCustomSeparator}
              disabled={separatorKey !== 'custom'}
              placeholder="例：__"
            />
            <Select
              label="中文策略"
              value={options.chinese}
              onChange={(value) => setOption('chinese', value as ChinesePolicy)}
              options={[
                { value: 'keep', label: '保留原字符' },
                { value: 'drop', label: '去除中文' },
              ]}
              hint="不做汉字转拼音"
            />
            <NumberField
              label="最大长度"
              value={options.maxLength}
              onChange={(value) => setOption('maxLength', Math.max(0, Math.min(300, value || 0)))}
              min={0}
              max={300}
              suffix="0 表示不限"
            />
            <Select label="批量模板" value={template} onChange={setTemplate} options={TEMPLATES} />
            <TextField
              label="URL 前缀"
              value={urlPrefix}
              onChange={setUrlPrefix}
              placeholder="https://example.com/blog/"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Checkbox label="转小写" checked={options.lowercase} onChange={(value) => setOption('lowercase', value)} />
            <Checkbox
              label="去重音"
              checked={options.removeAccents}
              onChange={(value) => setOption('removeAccents', value)}
              hint="NFD 拆分后删除组合记号"
            />
            <Checkbox
              label="去除标点"
              checked={options.removePunctuation}
              onChange={(value) => setOption('removePunctuation', value)}
            />
            <Checkbox
              label="合并连续分隔符"
              checked={options.collapseSeparators}
              onChange={(value) => setOption('collapseSeparators', value)}
            />
            <Checkbox
              label="去首尾分隔符"
              checked={options.trimSeparators}
              onChange={(value) => setOption('trimSeparators', value)}
            />
            <Checkbox
              label="保留版本号 / 日期"
              checked={options.keepVersion}
              onChange={(value) => setOption('keepVersion', value)}
              hint="v1.2.3、20240131 整段保留，不被拆开"
            />
          </div>
          <Note tone="info" title="为什么不做拼音转写">
            拼音转写需要引入词典库，而词典的映射规则（多音字、声调）对 URL 稳定性并不友好。
            这里提供「保留原字符」与「去除中文」两种策略，行为可预期、可复现。
          </Note>
        </Section>
      </div>

      <Section
        title={reverse ? '反向结果（slug → 标题）' : 'Slug 结果'}
        description={`共 ${rows.length} 行；检测到 ${stats.versioned} 行含版本号或日期`}
        actions={
          <Button size="sm" variant="outline" onClick={() => setReverse((value) => !value)}>
            <ArrowLeftRight className="size-3.5" />
            {reverse ? '切回正向' : '反向转换'}
          </Button>
        }
      >
        <StatGrid className="mb-2">
          <Stat label="有效行数" value={stats.total} />
          <Stat label="被修改的行" value={stats.changed} tone={stats.changed > 0 ? 'warn' : 'info'} />
          <Stat label="最长 slug" value={`${stats.longest} 字符`} />
          <Stat label="转换后为空" value={stats.empty} tone={stats.empty > 0 ? 'danger' : 'info'} />
        </StatGrid>

        {rows.length === 0 ? (
          <EmptyHint>输入几行文本试试</EmptyHint>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border scrollbar-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">原文</th>
                  <th className="px-2 py-1.5 font-medium">结果</th>
                  {!reverse && <th className="px-2 py-1.5 font-medium">URL 预览</th>}
                  <th className="w-10 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.lineNo} className="border-t align-top">
                    <td className="px-2 py-1 text-[10px] text-muted-foreground tabular-nums">{row.lineNo}</td>
                    <td className="max-w-56 truncate px-2 py-1 text-muted-foreground">{row.source}</td>
                    <td className="max-w-64 break-all px-2 py-1 font-mono">{row.value || '—'}</td>
                    {!reverse && (
                      <td className="max-w-72 truncate px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="size-3 shrink-0" />
                          {row.url}
                        </span>
                      </td>
                    )}
                    <td className="px-2 py-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5"
                        aria-label={`复制第 ${row.lineNo} 行结果`}
                        disabled={!row.value}
                        onClick={() => copyText(row.value)}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </ToolPanel>
  );
}
