import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileUp,
  Grid3x3,
  Layers,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { baseName, downloadBlob, downloadText, exportName, pickFile, readAsText } from '../lib/file';
import {
  type ColumnTypeInfo,
  cellText,
  columnWidths,
  detectColumnTypes,
  detectTableFormat,
  inferTypes,
  type MarkdownOptions,
  moveColumn,
  parseAnyTable,
  parseMarkdownAligns,
  readXlsx,
  removeColumn,
  removeDuplicateRows,
  removeEmptyColumns,
  removeEmptyRows,
  renameColumn,
  type SortDirection,
  sortRows,
  type Table,
  tableStats,
  tableToJson,
  toDelimited,
  toHtmlTable,
  toMarkdown,
  transpose,
  writeXlsx,
} from '../lib/table';

type Format = 'csv' | 'tsv' | 'markdown' | 'html' | 'json' | 'xlsx';
type Sheet = { name: string; table: Table };

const FORMAT_TABS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'tsv', label: 'TSV' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON 数组' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
];

const PREVIEW_LIMIT = 100;

const TYPE_TONE: Record<string, string> = {
  number: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  boolean: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  empty: 'bg-muted text-muted-foreground',
  string: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  mixed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

export default function TableConvert() {
  const [sourceText, setSourceText] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [status, setStatus] = useState('等待输入');

  const [format, setFormat] = useState<Format>('csv');
  const [delimiter, setDelimiter] = useState<string>('auto');
  const [quoteAll, setQuoteAll] = useState(false);
  const [crlf, setCrlf] = useState(false);
  const [alignColumns, setAlignColumns] = useState(false);
  const [escapePipes, setEscapePipes] = useState(true);
  const [autoAlign, setAutoAlign] = useState(true);
  const [htmlSections, setHtmlSections] = useState(true);
  const [htmlInline, setHtmlInline] = useState(false);
  const [htmlClass, setHtmlClass] = useState('');
  const [htmlCaption, setHtmlCaption] = useState('');
  const [jsonIndent, setJsonIndent] = useState(2);
  const [inferNumbers, setInferNumbers] = useState(true);
  const [inferBooleans, setInferBooleans] = useState(true);
  const [sortColumn, setSortColumn] = useState('0');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sheetName, setSheetName] = useState('Sheet1');

  const detected = useMemo(() => (sourceText.trim() === '' ? '空' : detectTableFormat(sourceText)), [sourceText]);

  const columnTypes: ColumnTypeInfo[] = useMemo(() => (table === null ? [] : detectColumnTypes(table)), [table]);
  const widths = useMemo(() => (table === null ? [] : columnWidths(table)), [table]);
  const stats = useMemo(() => (table === null ? null : tableStats(table)), [table]);

  const markdownOptions: MarkdownOptions = useMemo(
    () => ({
      align: table === null ? undefined : sourceText.includes('|') ? parseMarkdownAligns(sourceText) : undefined,
      escapePipes,
      autoAlign,
    }),
    [table, sourceText, escapePipes, autoAlign],
  );

  const output = useMemo(() => {
    if (table === null) return '';
    switch (format) {
      case 'csv':
      case 'tsv': {
        // TSV 固定制表符；CSV 用所选分隔符。auto 只表示「解析时自动识别」，
        // 导出时必须落到具体分隔符，否则会把 auto 误当成 tab 而产出 TSV 内容。
        const sep = format === 'tsv' ? '\t' : delimiter === 'auto' ? ',' : delimiter;
        return toDelimited(table, sep, {
          quoteAll,
          eol: crlf ? '\r\n' : '\n',
          alignColumns,
        });
      }
      case 'markdown':
        return toMarkdown(table, markdownOptions);
      case 'html':
        return toHtmlTable(table, {
          sections: htmlSections,
          border: 1,
          inlineStyles: htmlInline,
          className: htmlClass.trim() === '' ? undefined : htmlClass.trim(),
          caption: htmlCaption.trim() === '' ? undefined : htmlCaption.trim(),
        });
      case 'json':
        return tableToJson(table, { indent: jsonIndent });
      default:
        return '';
    }
  }, [
    table,
    format,
    delimiter,
    quoteAll,
    crlf,
    alignColumns,
    markdownOptions,
    htmlSections,
    htmlInline,
    htmlClass,
    htmlCaption,
    jsonIndent,
  ]);

  const outputName = useMemo(() => {
    if (format === 'markdown') return exportName('table', 'md');
    if (format === 'html') return exportName('table', 'html');
    if (format === 'json') return exportName('table', 'json');
    if (format === 'xlsx') return exportName(sheetName || 'table', 'xlsx');
    return exportName('table', format === 'tsv' ? 'tsv' : 'csv');
  }, [format, sheetName]);

  const applyText = (text: string, label: string) => {
    setSourceText(text);
    const parsed = parseAnyTable(text, delimiter);
    setSheets([]);
    setActiveSheet(0);
    setTable(inferTypes(parsed, { numbers: inferNumbers, booleans: inferBooleans }));
    setStatus(`${label} → ${parsed.columns.length} 列 / ${parsed.rows.length} 行`);
  };

  const importFile = async () => {
    const file = await pickFile({ accept: '.csv,.tsv,.txt,.md,.markdown,.html,.htm,.xlsx' });
    if (file === null) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx')) {
      try {
        const list = await readXlsx(file);
        setSheets(list.map((item) => ({ name: item.name ?? 'Sheet1', table: item })));
        setActiveSheet(0);
        setSheetName(list[0]?.name ?? 'Sheet1');
        setTable(inferTypes(list[0] ?? { columns: [], rows: [] }, { numbers: inferNumbers, booleans: inferBooleans }));
        setSourceText('');
        setStatus(`${file.name} → ${list.length} 个工作表，已载入「${list[0]?.name ?? ''}」`);
      } catch (error) {
        setStatus(`读取 xlsx 失败：${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    const text = await readAsText(file);
    setSourceText(text);
    const parsed = parseAnyTable(text, delimiter);
    setSheets([]);
    setTable(inferTypes(parsed, { numbers: inferNumbers, booleans: inferBooleans }));
    setStatus(`${baseName(file.name)} → ${parsed.columns.length} 列 / ${parsed.rows.length} 行`);
  };

  const update = (next: Table | null, label: string) => {
    setTable(next);
    setStatus(label);
  };

  const selectSheet = (index: number) => {
    const sheet = sheets[index];
    if (sheet === undefined) return;
    setActiveSheet(index);
    setSheetName(sheet.name);
    setTable(inferTypes(sheet.table, { numbers: inferNumbers, booleans: inferBooleans }));
    setStatus(`已切换到工作表「${sheet.name}」`);
  };

  const downloadXlsx = async () => {
    if (table === null) return;
    const blob = await writeXlsx(table, sheetName);
    downloadBlob(outputName, blob);
    setStatus(`已导出 ${outputName}`);
  };

  const visibleRows = table?.rows.slice(0, PREVIEW_LIMIT) ?? [];

  // 预览用的稳定 key：按内容去重，重复内容再追加序号
  const columnKeys = useMemo(() => makeKeys(table?.columns ?? []), [table]);
  const rowKeys = useMemo(
    () => makeKeys(visibleRows.map((row) => row.map((cell) => cellText(cell)).join('\u0001'))),
    [visibleRows],
  );

  return (
    <ToolPanel
      title="表格互转"
      description="Excel / CSV / TSV / Markdown / HTML / JSON 数组互转，含行列整理与类型推断"
      actions={
        <>
          <Button size="sm" onClick={() => void importFile()}>
            <FileUp className="size-3.5" />
            导入文件
          </Button>
          <ClearButton
            onClick={() => {
              setSourceText('');
              setTable(null);
              setSheets([]);
              setStatus('等待输入');
            }}
            disabled={sourceText === '' && table === null}
          />
        </>
      }
    >
      <Note tone="info" title="格式能力说明">
        CSV 不支持合并单元格与富文本；XLSX 实现为最小子集（不含样式、共享字符串与公式计算），仅保证 Excel / Numbers /
        WPS 能正常打开。
      </Note>

      <div className="grid gap-3 md:grid-cols-2">
        <Section
          title="输入"
          description={status}
          actions={<span className="text-[11px] text-muted-foreground">识别为 {detected}</span>}
        >
          <Textarea
            aria-label="表格文本输入"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="粘贴 CSV / TSV / Markdown / HTML / JSON 数组，或点击「导入文件」"
            spellCheck={false}
            className="min-h-56 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => applyText(sourceText, '解析文本')}>
              <Grid3x3 className="size-3.5" />
              解析
            </Button>
            <Select
              label="分隔符"
              value={delimiter}
              onChange={(value) => {
                setDelimiter(value);
                if (sourceText.trim() !== '') applyText(sourceText, `按 ${value} 重新解析`);
              }}
              options={[
                { value: 'auto', label: '自动识别' },
                { value: ',', label: '逗号 ,' },
                { value: '\t', label: '制表符 Tab' },
                { value: ';', label: '分号 ;' },
                { value: '|', label: '竖线 |' },
              ]}
            />
          </div>
          {sheets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">工作表：</span>
              {sheets.map((sheet, index) => (
                <Button
                  key={sheet.name}
                  size="sm"
                  variant={index === activeSheet ? 'default' : 'outline'}
                  onClick={() => selectSheet(index)}
                >
                  <Layers className="size-3.5" />
                  {sheet.name}
                </Button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="输出"
          description={table === null ? '暂无数据' : `${table.columns.length} 列 / ${table.rows.length} 行`}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                aria-label="复制输出"
                disabled={output === ''}
                onClick={() => copyText(output)}
              >
                <Copy className="size-3.5" />
                复制
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="下载输出文件"
                disabled={format === 'xlsx' ? table === null : output === ''}
                onClick={() => {
                  if (format === 'xlsx') {
                    void downloadXlsx();
                    return;
                  }
                  if (output !== '') downloadText(outputName, output);
                }}
              >
                <Download className="size-3.5" />
                下载
              </Button>
            </>
          }
        >
          <Tabs value={format} onValueChange={(value) => setFormat(value as Format)}>
            <TabsList className="flex-wrap">
              {FORMAT_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} active={format === tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {format === 'xlsx' ? (
            <div className="flex flex-col gap-2">
              <TextField label="工作表名称" value={sheetName} onChange={setSheetName} hint="最多 31 个字符" />
              <div className="flex min-h-24 flex-1 flex-col justify-center gap-1 rounded-md border border-dashed p-3 text-center">
                <FileSpreadsheet className="mx-auto size-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">xlsx 为二进制文件，点击「下载」导出当前表格。</p>
                <p className="text-[11px] text-muted-foreground">
                  将包含 {table?.columns.length ?? 0} 个表头与 {table?.rows.length ?? 0} 行数据。
                </p>
              </div>
            </div>
          ) : (
            <ResultBox label="预览" value={output} rows="min-h-56" />
          )}
        </Section>
      </div>

      <Section title="转换选项">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox label="CSV/TSV：所有字段加引号" checked={quoteAll} onChange={setQuoteAll} />
          <Checkbox label="CSV/TSV：CRLF 换行（Excel 友好）" checked={crlf} onChange={setCrlf} />
          <Checkbox label="CSV/TSV：自动调整列宽对齐" checked={alignColumns} onChange={setAlignColumns} />
          <Checkbox label="Markdown：转义竖线" checked={escapePipes} onChange={setEscapePipes} />
          <Checkbox label="Markdown：按内容自动对齐" checked={autoAlign} onChange={setAutoAlign} />
          <Checkbox label="HTML：输出 thead/tbody" checked={htmlSections} onChange={setHtmlSections} />
          <Checkbox label="HTML：输出内联样式" checked={htmlInline} onChange={setHtmlInline} />
          <TextField label="HTML：class" value={htmlClass} onChange={setHtmlClass} placeholder="可选" />
          <TextField label="HTML：caption" value={htmlCaption} onChange={setHtmlCaption} placeholder="可选" />
          <NumberField label="JSON 缩进" value={jsonIndent} onChange={setJsonIndent} min={0} max={8} />
          <Checkbox label="类型推断：数字" checked={inferNumbers} onChange={setInferNumbers} />
          <Checkbox label="类型推断：布尔（true/false/yes/no）" checked={inferBooleans} onChange={setInferBooleans} />
        </div>
        <Hint>类型推断开关只影响解析与文件导入；重新解析文本或切换工作表时生效。</Hint>
      </Section>

      <Section title="行列操作">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="排序字段"
            ariaLabel="排序字段"
            value={sortColumn}
            onChange={setSortColumn}
            options={(table?.columns ?? []).map((name, index) => ({
              value: String(index),
              label: name || `列${index + 1}`,
            }))}
          />
          <Select
            label="方向"
            value={sortDirection}
            onChange={(value) => setSortDirection(value === 'desc' ? 'desc' : 'asc')}
            options={[
              { value: 'asc', label: '升序' },
              { value: 'desc', label: '降序' },
            ]}
          />
          <Button
            size="sm"
            onClick={() => {
              if (table === null) return;
              update(
                sortRows(table, Number(sortColumn), sortDirection),
                `已按第 ${Number(sortColumn) + 1} 列${sortDirection === 'asc' ? '升序' : '降序'}`,
              );
            }}
            disabled={table === null || table.columns.length === 0}
          >
            <ArrowDownUp className="size-3.5" />
            排序
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => update(table === null ? null : transpose(table), '已转置（行列互换）')}
            disabled={table === null || table.rows.length === 0}
          >
            <ArrowLeft className="size-3.5" />
            交换行列
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (table === null) return;
              const next = removeEmptyRows(table);
              update(next, `已删除 ${table.rows.length - next.rows.length} 个空行`);
            }}
            disabled={table === null}
          >
            <Rows3 className="size-3.5" />
            去空行
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (table === null) return;
              const next = removeEmptyColumns(table);
              update(next, `列数 ${table.columns.length} → ${next.columns.length}`);
            }}
            disabled={table === null}
          >
            去空列
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (table === null) return;
              const result = removeDuplicateRows(table);
              update(result.table, `已删除 ${result.removed} 个重复行`);
            }}
            disabled={table === null}
          >
            去重复行
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (table === null) return;
              setTable(inferTypes(table, { numbers: inferNumbers, booleans: inferBooleans }));
              setStatus('已按当前开关重新推断类型');
            }}
            disabled={table === null}
          >
            重新推断类型
          </Button>
        </div>
      </Section>

      {table === null || stats === null ? (
        <EmptyHint>解析或导入数据后显示统计、预览与列编辑</EmptyHint>
      ) : (
        <>
          <Section title="统计">
            <StatGrid>
              <Stat label="行数" value={String(stats.rowCount)} />
              <Stat label="列数" value={String(stats.columnCount)} />
              <Stat label="平均单元格长度" value={String(stats.averageCellLength)} hint="字符" />
              <Stat label="空值数量" value={String(stats.emptyCount)} tone={stats.emptyCount > 0 ? 'warn' : 'info'} />
              <Stat
                label="重复行"
                value={String(stats.duplicateCount)}
                tone={stats.duplicateCount > 0 ? 'warn' : 'info'}
              />
              <Stat label="CSV 预估体积" value={`${stats.estimatedCsvBytes} B`} />
            </StatGrid>
          </Section>

          <Section
            title="表格预览"
            description={`最多显示前 ${PREVIEW_LIMIT} 行，共 ${table.rows.length} 行；点击表头可重命名`}
            actions={
              <span className="text-[11px] text-muted-foreground">
                第 {PREVIEW_LIMIT >= table.rows.length ? 1 : 1}–{Math.min(PREVIEW_LIMIT, table.rows.length)} 行
              </span>
            }
          >
            <div className="max-h-96 overflow-auto rounded-md border scrollbar-thin">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="w-10 px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                    {table.columns.map((name, index) => (
                      <th key={columnKeys[index] ?? name} className="border-l px-1 py-1 text-left align-top">
                        <InputHeader
                          value={name}
                          index={index}
                          onChange={(value) =>
                            update(renameColumn(table, index, value), `第 ${index + 1} 列改名为 ${value}`)
                          }
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <span
                            className={`rounded px-1 py-0.5 text-[10px] ${TYPE_TONE[columnTypes[index]?.type ?? 'string']}`}
                          >
                            {columnTypes[index]?.type ?? 'string'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">宽 {widths[index]}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5">
                          <IconButton
                            label={`第 ${index + 1} 列左移`}
                            disabled={index === 0}
                            onClick={() => update(moveColumn(table, index, -1), `第 ${index + 1} 列左移`)}
                          >
                            <ArrowLeft className="size-3" />
                          </IconButton>
                          <IconButton
                            label={`第 ${index + 1} 列右移`}
                            disabled={index === table.columns.length - 1}
                            onClick={() => update(moveColumn(table, index, 1), `第 ${index + 1} 列右移`)}
                          >
                            <ArrowRight className="size-3" />
                          </IconButton>
                          <IconButton
                            label={`删除第 ${index + 1} 列`}
                            onClick={() => update(removeColumn(table, index), `已删除第 ${index + 1} 列`)}
                          >
                            <X className="size-3" />
                          </IconButton>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIndex) => (
                    <tr key={rowKeys[rowIndex] ?? `row-${rowIndex}`} className="odd:bg-muted/20">
                      <td className="px-2 py-1 text-[10px] text-muted-foreground">{rowIndex + 1}</td>
                      {table.columns.map((name, columnIndex) => (
                        <td
                          key={columnKeys[columnIndex] ?? name}
                          className={`max-w-56 truncate border-l px-2 py-1 font-mono ${row[columnIndex] === null ? 'text-muted-foreground/60 italic' : ''}`}
                        >
                          {cellText(row[columnIndex] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.rows.length === 0 && (
                    <tr>
                      <td colSpan={table.columns.length + 1} className="px-2 py-6 text-center text-muted-foreground">
                        没有数据行
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {table.rows.length > PREVIEW_LIMIT && (
              <Hint>
                仅预览前 {PREVIEW_LIMIT} 行，导出的 {outputName} 包含全部 {table.rows.length} 行。
              </Hint>
            )}
            <div className="flex items-center gap-2">
              <Trash2 className="size-3.5 text-muted-foreground" />
              <Hint>删除列不会影响其他列顺序；列名修改会同步到所有输出格式。</Hint>
            </div>
          </Section>
        </>
      )}

      <Note tone="warn" title="已知限制">
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          <li>CSV 无类型系统，导出时数字与布尔会还原为文本；空值输出为空字段。</li>
          <li>Markdown 单元格内的换行会转成 &lt;br&gt;，反解析不会还原。</li>
          <li>XLSX 读写只处理值与表名，公式、样式、合并单元格、日期格式会被丢弃。</li>
          <li>HTML 解析取第一个 &lt;table&gt;，rowspan / colspan 不做合并。</li>
        </ul>
      </Note>
    </ToolPanel>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-5 px-1"
    >
      {children}
    </Button>
  );
}

function InputHeader({ value, index, onChange }: { value: string; index: number; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      aria-label={`第 ${index + 1} 列列名`}
      value={draft}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onChange(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="h-6 w-full min-w-20 rounded border bg-background px-1.5 font-mono text-[11px]"
    />
  );
}

/** 为预览生成不重复的 key：同名内容追加序号。 */
function makeKeys(values: string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const count = seen.get(value) ?? 0;
    seen.set(value, count + 1);
    return count === 0 ? value : `${value}~${count}`;
  });
}
