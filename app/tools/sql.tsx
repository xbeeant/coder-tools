import { AlertTriangle, ArrowLeftRight, ArrowUpFromLine, Copy, Download, Sigma, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';
import {
  analyzeSql,
  type ColumnDictionary,
  convertSqlDialect,
  DIALECT_PLACEHOLDERS,
  expandStarSelect,
  formatSql,
  highlightSql,
  minifySql,
  type PlaceholderStyle,
  parameterizeSql,
  parseCreateTableDefinitions,
  SQL_DIALECTS,
  type SqlDialect,
  type SqlToken,
  type SqlTokenKind,
} from '../lib/sql';

const DIALECT_OPTIONS = SQL_DIALECTS.map((item) => ({ value: item.value, label: item.label }));

const PLACEHOLDER_OPTIONS: { value: PlaceholderStyle; label: string }[] = [
  { value: 'question', label: '? （MySQL / JDBC / SQLite）' },
  { value: 'dollar', label: '$1 （PostgreSQL）' },
  { value: 'named', label: ':name （PG 具名 / Python）' },
  { value: 'at', label: '@p1 （SQL Server）' },
];

/** 高亮配色：深浅色各一套，保证在两种主题下都清晰。 */
const TOKEN_CLASS: Record<SqlTokenKind, string> = {
  keyword: 'text-sky-700 dark:text-sky-300',
  function: 'text-violet-700 dark:text-violet-300',
  string: 'text-emerald-700 dark:text-emerald-300',
  number: 'text-amber-700 dark:text-amber-300',
  comment: 'text-muted-foreground italic',
  operator: 'text-rose-700 dark:text-rose-300',
  identifier: 'text-foreground',
  plain: 'text-muted-foreground/70',
};

const EXAMPLES: { label: string; sql: string }[] = [
  {
    label: '多表 JOIN',
    sql: `select u.id,u.name,count(o.id) as orders from users u left join orders o on o.user_id=u.id where u.age>=18 and o.status='paid' group by u.id,u.name having count(o.id)>2 order by orders desc limit 20;`,
  },
  {
    label: '子查询 + IN',
    sql: `select * from (select user_id,sum(amount) amt from orders where created_at>'2024-01-01' group by user_id) t where t.amt in (select max(amt) from (select user_id,sum(amount) amt from orders group by user_id) x);`,
  },
  {
    label: '建表 DDL',
    sql: `create table if not exists users(id bigint not null auto_increment comment '主键',email varchar(128) not null,age int unsigned,created_at timestamp default current_timestamp,primary key(id),unique key uk_email(email)) engine=innodb default charset=utf8mb4;`,
  },
  {
    label: '批量 upsert',
    sql: `insert into users(id,email,name) values (1,'a@x.com','a'),(2,'b@x.com','b') on duplicate key update name=values(name);`,
  },
  {
    label: '危险操作',
    sql: `update users set name = 'x' || name; delete from logs;`,
  },
];

/** 高亮渲染：token 数组直接映射为元素，不使用 dangerouslySetInnerHTML。 */
function HighlightedSql({ tokens }: { tokens: SqlToken[] }) {
  if (tokens.length === 0) return <EmptyHint>输入 SQL 后这里显示语法高亮</EmptyHint>;
  return (
    <pre className="min-h-48 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed scrollbar-thin">
      {tokens.map((token, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: token 无稳定标识，用下标即可
        <span key={index} className={TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}

/** 把标识列表渲染成一串可点击的标签式摘要。 */
function Chips({ items, empty = '无' }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-[11px] text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.slice(0, 40).map((item) => (
        <span key={item} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
          {item}
        </span>
      ))}
      {items.length > 40 && <span className="text-[10px] text-muted-foreground">等 {items.length} 项</span>}
    </span>
  );
}

export default function SqlFormatter() {
  const [input, setInput] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('mysql');
  const [resultTab, setResultTab] = useState<'formatted' | 'highlight'>('formatted');
  const [indent, setIndent] = useState('  ');
  const [keywordCase, setKeywordCase] = useState<'upper' | 'lower' | 'keep'>('upper');
  const [expandStar, setExpandStar] = useState(false);
  const [useParameters, setUseParameters] = useState(false);
  const [placeholderStyle, setPlaceholderStyle] = useState<PlaceholderStyle>('question');
  const [alsoNumbers, setAlsoNumbers] = useState(false);

  const formatOptions = useMemo(
    () => ({
      indent,
      uppercaseKeywords: keywordCase === 'upper',
      lowercaseKeywords: keywordCase === 'lower',
      newlineBeforeAndOr: false,
    }),
    [indent, keywordCase],
  );

  const formatted = useMemo(() => (input.trim() === '' ? '' : formatSql(input, formatOptions)), [input, formatOptions]);

  const converted = useMemo(() => convertSqlDialect(input, dialect), [input, dialect]);

  const analysis = useMemo(() => analyzeSql(input), [input]);

  const dictionary = useMemo<ColumnDictionary>(() => {
    const result: ColumnDictionary = {};
    for (const table of parseCreateTableDefinitions(input)) {
      result[table.name] = table.columns.map((column) => column.name);
    }
    return result;
  }, [input]);

  const starExpansion = useMemo(
    () => (expandStar ? expandStarSelect(formatted, dictionary) : null),
    [expandStar, formatted, dictionary],
  );

  const parameterized = useMemo(
    () =>
      useParameters
        ? parameterizeSql(starExpansion?.sql ?? formatted, { style: placeholderStyle, numbers: alsoNumbers })
        : null,
    [useParameters, starExpansion, formatted, placeholderStyle, alsoNumbers],
  );

  const output = parameterized?.sql ?? starExpansion?.sql ?? formatted;
  const tokens = useMemo(() => highlightSql(output), [output]);

  const safeActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => setInput(formatted)} disabled={formatted === ''}>
        <Sparkles className="size-3.5" />
        写回格式化结果
      </Button>
      <Button
        size="sm"
        onClick={() => setInput(parameterizeSql(input, { style: placeholderStyle, numbers: alsoNumbers }).sql)}
        disabled={input.trim() === ''}
      >
        <Sigma className="size-3.5" />
        写回参数化结果
      </Button>
      <Button size="sm" onClick={() => setInput(converted.sql)} disabled={input.trim() === ''}>
        <ArrowLeftRight className="size-3.5" />
        写回方言改写
      </Button>
    </div>
  );

  return (
    <ToolPanel
      title="SQL 格式化"
      description="格式化、压缩、关键字大小写、方言改写、语法高亮、结构分析与安全改写"
      actions={
        <div className="flex flex-row gap-1">
          <Select
            label="目标方言"
            layout={'horizontal'}
            value={dialect}
            onChange={(value) => setDialect(value as SqlDialect)}
            options={DIALECT_OPTIONS}
          />
          <div className="flex flex-wrap items-center gap-1">
            {EXAMPLES.map((example) => (
              <Button key={example.label} size="sm" variant="outline" onClick={() => setInput(example.sql)}>
                {example.label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <Note tone="info" title="自研轻量解析器">
        词法与格式化基于自研扫描器实现，覆盖常见 DDL/DML。存储过程、动态 SQL、特定方言扩展语法可能无法完全识别，
        结果仅供参考，重要脚本请在真实数据库中验证。
      </Note>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="输入 SQL" description={`${input.length} 字符`} actions={safeActions}>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => setInput(formatted)} disabled={input.trim() === ''}>
              <Sparkles className="size-3.5" />
              格式化
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInput(minifySql(input))}
              disabled={input.trim() === ''}
            >
              <ArrowUpFromLine className="size-3.5" />
              压缩为单行
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setInput(formatSql(input, { ...formatOptions, uppercaseKeywords: true, lowercaseKeywords: false }))
              }
              disabled={input.trim() === ''}
            >
              关键字大写
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setInput(formatSql(input, { ...formatOptions, uppercaseKeywords: false, lowercaseKeywords: true }))
              }
              disabled={input.trim() === ''}
            >
              关键字小写
            </Button>
            <Button size="sm" variant="outline" onClick={() => setInput(converted.sql)} disabled={input.trim() === ''}>
              <ArrowLeftRight className="size-3.5" />
              转换为 {SQL_DIALECTS.find((item) => item.value === dialect)?.label}
            </Button>
            <ClearButton onClick={() => setInput('')} disabled={input === ''} />
          </div>
          <Textarea
            aria-label="SQL 输入"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴 SQL，支持多条语句"
            spellCheck={false}
            className="min-h-64 resize-none font-mono text-xs"
          />
          <Hint>支持行注释（-- 与 #）与块注释；字符串内的关键字不会被格式化。</Hint>
        </Section>

        <Section
          title="结果"
          actions={
            <div className="flex items-center gap-1.5">
              <Tabs
                value={resultTab}
                onValueChange={(value) => setResultTab(value === 'highlight' ? 'highlight' : 'formatted')}
              >
                <TabsList>
                  <TabsTrigger value="formatted" active={resultTab === 'formatted'}>
                    格式化结果
                  </TabsTrigger>
                  <TabsTrigger value="highlight" active={resultTab === 'highlight'}>
                    语法高亮
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="sm"
                variant="ghost"
                aria-label="复制结果"
                disabled={output === ''}
                onClick={() => copyText(output)}
              >
                <Copy className="size-3.5" />
                复制
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="下载 SQL 文件"
                disabled={output === ''}
                onClick={() => downloadText(exportName('query', 'sql'), output, 'application/sql;charset=utf-8')}
              >
                <Download className="size-3.5" />
                下载 .sql
              </Button>
            </div>
          }
        >
          {resultTab === 'formatted' ? (
            <ResultBox label="格式化结果" value={output} rows="min-h-64" />
          ) : (
            <div className="flex flex-1 flex-col">
              <HighlightedSql tokens={tokens} />
              <Hint>关键字、函数、字符串、数字、注释、运算符分别着色；token 拼接与原文一致。</Hint>
            </div>
          )}
        </Section>
      </div>

      <Section title="结构分析" description="识别语句类型、涉及表、字段、条件列、JOIN、函数与子查询层数">
        {input.trim() === '' ? (
          <EmptyHint>输入 SQL 后显示分析结果</EmptyHint>
        ) : (
          <>
            <StatGrid>
              <Stat label="语句类型" value={analysis.types.join(' / ') || '未知'} />
              <Stat label="语句条数" value={String(analysis.statements.length)} />
              <Stat label="涉及表" value={String(analysis.tables.length)} />
              <Stat
                label="子查询层数"
                value={String(analysis.maxSubqueryDepth)}
                tone={analysis.maxSubqueryDepth > 2 ? 'warn' : 'info'}
              />
            </StatGrid>

            <div className="overflow-x-auto rounded-md border scrollbar-thin">
              <table className="w-full min-w-72 text-xs">
                <tbody>
                  <tr className="border-b">
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">语句类型</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.types} />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">表名</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.tables} />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">JOIN 表</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.joins} empty="无 JOIN" />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">字段列表</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.columns} />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">WHERE 条件列</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.whereColumns} empty="无 WHERE 条件" />
                    </td>
                  </tr>
                  <tr>
                    <th className="w-24 px-2 py-1.5 text-left font-medium text-muted-foreground">函数调用</th>
                    <td className="px-2 py-1.5">
                      <Chips items={analysis.functions} empty="无函数调用" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {analysis.hazards.length > 0 ? (
              <Note
                tone={analysis.hazards.some((item) => item.level === 'danger') ? 'danger' : 'warn'}
                title="风险提示"
              >
                <ul className="flex flex-col gap-1">
                  {analysis.hazards.map((hazard) => (
                    <li key={`${hazard.level}-${hazard.label}`} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground">{hazard.label}</span>：{hazard.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </Note>
            ) : (
              <Note tone="success" title="未发现明显风险">
                没有检测到无 WHERE 的写操作、字符串拼接或未闭合引号。
              </Note>
            )}
          </>
        )}
      </Section>

      <Section
        title="安全改写"
        description="展开 SELECT *、参数化占位符，并生成可直接落库的改写结果"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              label="展开 SELECT *"
              checked={expandStar}
              onChange={setExpandStar}
              hint={
                Object.keys(dictionary).length > 0
                  ? `已识别 ${Object.keys(dictionary).length} 张表`
                  : '需要同页包含 CREATE TABLE'
              }
            />
            <Checkbox label="参数化查询" checked={useParameters} onChange={setUseParameters} />
            {useParameters && (
              <>
                <Select
                  ariaLabel="占位符风格"
                  value={placeholderStyle}
                  onChange={(value) => setPlaceholderStyle(value as PlaceholderStyle)}
                  options={PLACEHOLDER_OPTIONS}
                />
                <Checkbox label="数字也替换" checked={alsoNumbers} onChange={setAlsoNumbers} />
              </>
            )}
          </div>
        }
      >
        {input.trim() === '' ? (
          <EmptyHint>输入 SQL 后显示改写结果</EmptyHint>
        ) : (
          <>
            <ResultBox label="改写结果" value={output} rows="min-h-40" onCopy={() => copyText(output)} />
            {starExpansion !== null && starExpansion.expanded.length > 0 && (
              <Note tone="success" title="SELECT * 已展开">
                {starExpansion.expanded.map((item) => `${item.table} → ${item.columns.join(', ')}`).join('；')}
              </Note>
            )}
            {starExpansion !== null && starExpansion.missing.length > 0 && (
              <Note tone="warn" title="部分表未找到定义">
                缺少字段定义的表：{starExpansion.missing.join('、')}。可以把这些表的 CREATE TABLE 一起粘贴到输入框。
              </Note>
            )}
            {parameterized !== null && (
              <Note tone="info" title="参数化参数">
                {parameterized.params.length === 0 ? (
                  '没有需要替换的字面量。'
                ) : (
                  <span className="font-mono break-all">
                    {parameterized.params.map((param, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 参数无稳定标识
                      <span key={index} className="mr-2 inline-block">
                        #{index + 1} = {param === '' ? '（原为 ?）' : param}
                      </span>
                    ))}
                  </span>
                )}
              </Note>
            )}
          </>
        )}
      </Section>

      <Section
        title="方言改写"
        description={`目标：${SQL_DIALECTS.find((item) => item.value === dialect)?.label ?? ''}（${SQL_DIALECTS.find((item) => item.value === dialect)?.quote ?? ''}，占位符 ${SQL_DIALECTS.find((item) => item.value === dialect)?.placeholder ?? ''}）`}
      >
        {input.trim() === '' ? (
          <EmptyHint>输入 SQL 后显示改写结果</EmptyHint>
        ) : (
          <>
            <ResultBox
              label={`改写为 ${SQL_DIALECTS.find((item) => item.value === dialect)?.label ?? ''}`}
              value={converted.sql}
              rows="min-h-40"
              onCopy={() => copyText(converted.sql)}
            />
            {converted.notes.length > 0 && (
              <Note tone="info" title="已做的改写">
                <ul className="flex list-disc flex-col gap-0.5 pl-4">
                  {converted.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </Note>
            )}
            {converted.warnings.length > 0 && (
              <Note tone="warn" title="需要人工复核">
                <ul className="flex list-disc flex-col gap-0.5 pl-4">
                  {converted.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Note>
            )}
            <Hint>
              改写为文本级启发式替换，不保证语义等价；函数参数顺序、索引与表选项等方言差异需自行处理。MySQL 的默认占位符{' '}
              {DIALECT_PLACEHOLDERS.mysql}，切换到其他方言会自动转换问号占位符。
            </Hint>
          </>
        )}
      </Section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="格式化选项">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label="缩进"
              value={indent}
              onChange={setIndent}
              options={[
                { value: '  ', label: '2 空格' },
                { value: '    ', label: '4 空格' },
                { value: '\t', label: 'Tab' },
              ]}
            />
            <Select
              label="关键字"
              value={keywordCase}
              onChange={(value) => setKeywordCase(value === 'lower' || value === 'keep' ? value : 'upper')}
              options={[
                { value: 'upper', label: '大写（默认）' },
                { value: 'lower', label: '小写' },
                { value: 'keep', label: '保持原样' },
              ]}
            />
          </div>
          <Hint>「压缩为单行」会忽略缩进设置，直接按原有分词拼成一行。</Hint>
        </Section>
        <Section title="快捷操作说明">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
            <li>「写回」按钮会把当前结果写回输入框，便于连续处理。</li>
            <li>多条语句以分号分隔，分析结果按语句分别统计。</li>
            <li>压缩为单行会保留注释并强制换行，避免注释吃掉后续语句。</li>
          </ul>
        </Section>
      </div>
    </ToolPanel>
  );
}
