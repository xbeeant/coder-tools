/** 文本统计：字数、行数、词频、字符分布与行特征，报告可导出 Markdown。 */
import { Copy, Download, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName, pickFile, readAsText } from '../lib/file';
import {
  analyzeText,
  DEFAULT_STATS_OPTIONS,
  markdownReport,
  type StatsOptions,
  type WordMode,
} from '../lib/text-stats';

const WORD_MODES = [
  { value: 'space', label: '空白切分' },
  { value: 'cjk', label: '中文按字' },
  { value: 'stem', label: '英文词干截断' },
];

const SAMPLE = `The quick brown fox jumps over the lazy dog.
React 19 让并发渲染变得简单，而 Vite 把构建时间压到毫秒级。

这是一段中文示例，用来演示按字统计与停用词过滤的效果。
The lazy dog sleeps; the quick fox runs.`;

function Bar({ percent }: { percent: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary/70"
        style={{ width: `${Math.min(100, Math.max(percent * 4, percent > 0 ? 2 : 0))}%` }}
      />
    </span>
  );
}

function lineList(items: number[], limit = 12): string {
  if (items.length === 0) return '无';
  const head = items.slice(0, limit).join('、');
  return items.length > limit ? `${head} 等 ${items.length} 行` : head;
}

export default function TextStats() {
  const [input, setInput] = useState(SAMPLE);
  const [options, setOptions] = useState<StatsOptions>(DEFAULT_STATS_OPTIONS);
  const [limit, setLimit] = useState(100);
  const [tooLongThreshold, setTooLongThreshold] = useState(120);

  const report = useMemo(
    () => analyzeText(input, options, limit, tooLongThreshold),
    [input, options, limit, tooLongThreshold],
  );

  const markdown = useMemo(() => markdownReport(report), [report]);
  const { stats, lines } = report;

  const setOption = <K extends keyof StatsOptions>(key: K, value: StatsOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const importFile = async () => {
    const file = await pickFile({ accept: '.txt,.md,.json,.log,.csv,text/*' });
    if (!file) return;
    setInput(await readAsText(file));
  };

  return (
    <ToolPanel
      title="文本统计"
      description="字数、行数、词频、字符分布与行特征，全部在本地计算"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void importFile()}>
            <FileUp className="size-3.5" />
            导入文件
          </Button>
          <Button size="sm" variant="ghost" disabled={!markdown} onClick={() => copyText(markdown)}>
            <Copy className="size-3.5" />
            复制报告
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!markdown}
            onClick={() => downloadText(exportName('text-stats', 'md'), markdown, 'text/markdown;charset=utf-8')}
          >
            <Download className="size-3.5" />
            下载 .md
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
            placeholder="粘贴要统计的文本"
            spellCheck={false}
            className="min-h-48 resize-none font-mono text-xs"
            aria-label="输入文本"
          />
          <Hint>支持拖入文件内容后统计；统计口径可在右侧调整。</Hint>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Section title="统计口径" description="不同口径下的词数差异很大，报告里会注明使用哪一种">
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="分词口径"
                value={options.wordMode}
                onChange={(value) => setOption('wordMode', value as WordMode)}
                options={WORD_MODES}
                hint={
                  options.wordMode === 'space'
                    ? '只按空白切分，中文整段算一个词'
                    : options.wordMode === 'cjk'
                      ? '汉字逐字计数，其余按空白与标点切分'
                      : '按空白与标点切分，并剥离 ing/ed/es/s 等后缀'
                }
              />
              <NumberField
                label="Top N"
                value={limit}
                onChange={(value) => setLimit(Math.max(1, Math.min(500, value || 1)))}
                min={1}
                max={500}
              />
              <NumberField
                label="超长行阈值"
                value={tooLongThreshold}
                onChange={(value) => setTooLongThreshold(Math.max(20, value || 120))}
                min={20}
                max={1000}
                suffix="字符"
              />
              <div className="flex flex-col justify-end gap-1.5 pb-0.5">
                <Checkbox
                  label="忽略大小写"
                  checked={options.ignoreCase}
                  onChange={(checked) => setOption('ignoreCase', checked)}
                />
                <Checkbox
                  label="忽略停用词"
                  checked={options.ignoreStopWords}
                  onChange={(checked) => setOption('ignoreStopWords', checked)}
                  hint="内置英文 + 中文停用词表"
                />
              </div>
            </div>
            {options.minWordLength > 1 && (
              <NumberField
                label="最小词长"
                value={options.minWordLength}
                onChange={(value) => setOption('minWordLength', Math.max(1, Math.min(20, value || 1)))}
                min={1}
                max={20}
              />
            )}
            <Checkbox
              label="启用最小词长过滤"
              checked={options.minWordLength > 1}
              onChange={(checked) => setOption('minWordLength', checked ? 2 : 1)}
            />
            <Textarea
              value={options.extraStopWords}
              onChange={(event) => setOption('extraStopWords', event.target.value)}
              placeholder="自定义停用词，空白或逗号分隔，例如：the, foo, 临时"
              spellCheck={false}
              className="min-h-16 resize-none font-mono text-[11px]"
              aria-label="自定义停用词"
            />
            <Hint>停用词只有在「忽略停用词」开启后才会生效。</Hint>
          </Section>
        </div>
      </div>

      <Section title="基础指标">
        <StatGrid>
          <Stat label="字符数（含空白）" value={stats.chars} />
          <Stat label="字符数（不含空白）" value={stats.charsNoSpace} />
          <Stat label="UTF-8 字节数" value={stats.bytes} hint="浏览器端按 UTF-8 编码计算" />
          <Stat label="行数" value={stats.lines} />
          <Stat label="非空行数" value={stats.nonEmptyLines} />
          <Stat label="单词数" value={stats.words} hint={WORD_MODES.find((m) => m.value === options.wordMode)?.label} />
          <Stat label="汉字数" value={stats.cjkChars} hint="CJK 统一表意文字" />
          <Stat label="句子数" value={stats.sentences} hint="按 .!?。！？； 切分" />
          <Stat label="段落数" value={stats.paragraphs} hint="空行分隔" />
          <Stat label="平均行长" value={stats.avgLineLength} />
          <Stat label="最长行" value={`${stats.maxLineLength} 字符`} />
          <Stat label="行首缩进空格" value={stats.indentSpaces} />
          <Stat label="Tab 总数" value={stats.tabCount} />
        </StatGrid>
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title={`词频 Top ${report.frequency.length}`} description={`去重后共 ${report.uniqueWords} 个词`}>
          {report.frequency.length === 0 ? (
            <EmptyHint>没有可统计的词，试试调整口径或停用词设置</EmptyHint>
          ) : (
            <div className="max-h-72 overflow-auto rounded-md border scrollbar-thin">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">#</th>
                    <th className="px-2 py-1.5 font-medium">词</th>
                    <th className="px-2 py-1.5 text-right font-medium">次数</th>
                    <th className="px-2 py-1.5 text-right font-medium">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {report.frequency.map((item, index) => (
                    <tr key={item.word} className="border-t">
                      <td className="px-2 py-1 text-[10px] text-muted-foreground tabular-nums">{index + 1}</td>
                      <td className="px-2 py-1 font-mono break-all">
                        {item.word}
                        <Bar percent={item.percent} />
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">{item.count}</td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {item.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="字符分布" description="按 Unicode 区间判断，非 ASCII 字符的归属以此为准">
          {report.distribution.length === 0 ? (
            <EmptyHint>暂无字符</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {report.distribution.map((bucket) => (
                <li key={bucket.id} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-muted-foreground">{bucket.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-emerald-500/70"
                      style={{ width: `${Math.min(100, bucket.percent)}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                    {bucket.count} · {bucket.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="行特征" description="帮助定位格式不一致的问题">
        <StatGrid>
          <Stat
            label="最长行"
            value={lines.longest ? `第 ${lines.longest.lineNo} 行 · ${lines.longest.length}` : '—'}
            hint={lines.longest ? lines.longest.text.slice(0, 40) : undefined}
            tone="warn"
          />
          <Stat
            label="最短行"
            value={lines.shortest ? `第 ${lines.shortest.lineNo} 行 · ${lines.shortest.length}` : '—'}
            hint={lines.shortest ? lines.shortest.text.slice(0, 40) : undefined}
          />
          <Stat
            label={`超长行 > ${lines.tooLongThreshold}`}
            value={lines.tooLong.length}
            tone={lines.tooLong.length > 0 ? 'warn' : 'info'}
          />
          <Stat label="行尾空白行" value={lines.trailingSpace.length} hint={lineList(lines.trailingSpace)} />
          <Stat
            label="CRLF 行"
            value={lines.crlfLines.length}
            hint={lineList(lines.crlfLines)}
            tone={lines.mixedNewline ? 'danger' : 'info'}
          />
          <Stat
            label="Tab 缩进行"
            value={lines.tabIndentedLines.length}
            hint={lineList(lines.tabIndentedLines)}
            tone={lines.mixedIndent ? 'danger' : 'info'}
          />
          <Stat
            label="LF/CRLF 混用"
            value={lines.mixedNewline ? '是' : '否'}
            tone={lines.mixedNewline ? 'danger' : 'success'}
          />
          <Stat
            label="Tab/空格混用"
            value={lines.mixedIndent ? '是' : '否'}
            tone={lines.mixedIndent ? 'danger' : 'success'}
          />
        </StatGrid>

        {lines.tooLong.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-md border scrollbar-thin">
            <ul className="flex flex-col">
              {lines.tooLong.slice(0, 60).map((issue) => (
                <li key={issue.lineNo} className="flex gap-2 border-b px-2 py-1 font-mono text-[11px] last:border-b-0">
                  <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{issue.lineNo}</span>
                  <span className="min-w-0 flex-1 truncate">{issue.text}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{Array.from(issue.text).length}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(lines.mixedNewline || lines.mixedIndent) && (
          <Note tone="warn" title="检测到格式混用">
            {lines.mixedNewline && '同一文件内同时存在 LF 与 CRLF 换行。'}
            {lines.mixedIndent && '同一文件内同时存在 Tab 与空格缩进。'}
            这类不一致会让版本控制产生大量无意义差异，建议在提交前统一。
          </Note>
        )}
      </Section>

      <Section
        title="Markdown 报告"
        description="可直接粘贴到 issue、PR 或工单中"
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label="复制 Markdown 报告"
              disabled={!markdown}
              onClick={() => copyText(markdown)}
            >
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="下载 Markdown 报告"
              disabled={!markdown}
              onClick={() => downloadText(exportName('text-stats', 'md'), markdown, 'text/markdown;charset=utf-8')}
            >
              <Download className="size-3.5" />
              下载
            </Button>
          </>
        }
      >
        <ResultBox label="报告预览" value={markdown} rows="min-h-40" />
      </Section>

      <Note tone="info" title="口径说明">
        「单词数」在空白口径下把连续中文视为一个词，因此中英混排时词数会偏低；需要按字统计请切换到「中文按字」。
        「句子数」按中英文句末标点与分号切分，不处理缩写与引号内的标点，属于粗略估计。
      </Note>
    </ToolPanel>
  );
}
