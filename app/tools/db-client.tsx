import { ArrowLeftRight, BookOpen, DatabaseZap, Download, FileText, LinkIcon, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select, TextField } from '../components/ui/field';
import { LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  buildCliCommand,
  buildCreateTableSql,
  buildDropTableSql,
  buildDsn,
  CLIENT_LINKS,
  clientHints,
  createColumn,
  createModelTable,
  DB_PROFILES,
  type DbKind,
  defaultConnection,
  diffJson,
  diffToSql,
  jsonToInsertSql,
  layoutErDiagram,
  parseDsn,
  parseJsonRecords,
  parseModelFromDdl,
  SQL_SNIPPET_COUNT,
  SQL_SNIPPETS,
  type SqlDialect,
  sqlResultToTable,
  TYPE_PRESETS,
} from '../lib/db-studio';
import { downloadText, exportName, pickFile, readAsText } from '../lib/file';
import { parseDelimited, type Table } from '../lib/table';

const DB_OPTIONS = DB_PROFILES.map((item) => ({ value: item.value, label: item.label }));
const DIALECT_OPTIONS: { value: SqlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
];

export default function DbClient() {
  const [tab, setTab] = useState<'connect' | 'model' | 'etl' | 'snippets'>('connect');
  return (
    <ToolPanel
      title="数据库开发工作台"
      description="生成连接串 / CLI 命令、数据建模（DDL/ER）、JSON/CSV 数据搬运、差异对比与 SQL 速查模板（纯离线工具，不发起真实数据库连接）"
    >
      <Tabs className="mb-3 flex w-full flex-wrap items-center gap-1">
        <TabsList className="flex flex-wrap gap-0.5">
          <TabsTrigger value="connect" active={tab === 'connect'} onClick={() => setTab('connect')}>
            <LinkIcon className="size-3.5" />
            连接配置
          </TabsTrigger>
          <TabsTrigger value="model" active={tab === 'model'} onClick={() => setTab('model')}>
            <DatabaseZap className="size-3.5" />
            数据建模
          </TabsTrigger>
          <TabsTrigger value="etl" active={tab === 'etl'} onClick={() => setTab('etl')}>
            <ArrowLeftRight className="size-3.5" />
            数据搬运
          </TabsTrigger>
          <TabsTrigger value="snippets" active={tab === 'snippets'} onClick={() => setTab('snippets')}>
            <BookOpen className="size-3.5" />
            SQL 速查（{SQL_SNIPPET_COUNT} 条）
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Note tone="warn" title="浏览器限制">
        本工具不具备网络直连数据库的能力，所有操作均在本地完成。建议通过官方客户端（如 DBeaver / Navicat / DataGrip /
        pgAdmin）或 CLI 建立连接。
      </Note>
      {tab === 'connect' && <ConnectTab />}
      {tab === 'model' && <ModelTab />}
      {tab === 'etl' && <EtlTab />}
      {tab === 'snippets' && <SnippetsTab />}
    </ToolPanel>
  );
}

/* ── Tab 1：连接配置 ─────────────────────────────────────────────────── */

function ConnectTab() {
  const [kind, setKind] = useState<DbKind>('mysql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [database, setDatabase] = useState('mydb');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [params, setParams] = useState('charset=utf8mb4');
  const [dsnInput, setDsnInput] = useState('');

  const config = useMemo(
    () => ({ kind, host, port, database, user, password, params }),
    [kind, host, port, database, user, password, params],
  );
  const dsn = useMemo(() => buildDsn(config), [config]);
  const cli = useMemo(() => buildCliCommand(config), [config]);
  const parsed = useMemo(() => parseDsn(dsnInput), [dsnInput]);
  const hints = useMemo(() => clientHints(config), [config]);
  const profile = DB_PROFILES.find((item) => item.value === kind);

  const applyKind = (value: string) => {
    const next = value as DbKind;
    const preset = defaultConnection(next);
    setKind(next);
    setHost(preset.host);
    setPort(preset.port);
    setDatabase(preset.database);
    setUser(preset.user);
    setParams(preset.params);
  };

  return (
    <div className="flex flex-col gap-3">
      <Section title="连接参数" description="生成 DSN 连接串与 CLI 命令；密码仅在本地使用，不会写入文件">
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="数据库类型" value={kind} onChange={applyKind} options={DB_OPTIONS} />
          <TextField
            label="主机"
            value={host}
            onChange={setHost}
            placeholder="localhost / db.example.com"
            disabled={kind === 'sqlite'}
          />
          <TextField label="端口" value={port} onChange={setPort} placeholder="3306" disabled={kind === 'sqlite'} />
          <TextField
            label={kind === 'sqlite' ? '数据库文件路径' : '数据库名'}
            value={database}
            onChange={setDatabase}
            placeholder={kind === 'sqlite' ? './data.db' : 'mydb'}
          />
          <TextField label="用户名" value={user} onChange={setUser} placeholder="root" />
          <TextField label="密码（可选）" type="password" value={password} onChange={setPassword} placeholder="••••" />
          <TextField
            label="附加参数"
            className="md:col-span-2"
            value={params}
            onChange={setParams}
            placeholder="charset=utf8mb4&sslmode=require"
            hint="k=v 形式，用 & 分隔"
          />
        </div>
      </Section>

      <StatGrid>
        <Stat label="驱动 / 协议" value={profile?.driver ?? '—'} />
        <Stat
          label="默认端口"
          value={profile?.defaultPort || '—'}
          hint={kind === 'sqlite' ? 'SQLite 无网络端口' : undefined}
        />
        <Stat label="Scheme" value={(profile?.schemes ?? []).join(' / ')} />
        <Stat label="CLI 客户端" value={profile?.cli ?? '—'} tone="info" />
      </StatGrid>

      <div className="grid gap-3 md:grid-cols-2">
        <ResultBox label="DSN 连接串" value={dsn} onCopy={() => copyText(dsn)} rows="min-h-20" />
        <ResultBox label="CLI 连接命令" value={cli} onCopy={() => copyText(cli)} rows="min-h-20" />
      </div>

      <Section
        title="连接串解析"
        description="粘贴已有连接串，反解出连接参数"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const file = await pickFile();
              if (file === null) return;
              setDsnInput(await readAsText(file));
            }}
          >
            <FileText className="size-3.5" />
            读取文件
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={dsnInput}
            onChange={(event) => setDsnInput(event.target.value)}
            placeholder="postgresql://user:pass@host:5432/db?sslmode=require 或 ./local.db"
            className="min-h-20 font-mono text-xs"
            spellCheck={false}
            aria-label="待解析的连接串"
          />
          <div className="flex flex-col gap-2 text-xs">
            {dsnInput.trim() === '' ? (
              <p className="text-muted-foreground">输入连接串后显示解析结果</p>
            ) : parsed.ok ? (
              <>
                <StatGrid>
                  <Stat label="类型" value={parsed.kind} />
                  <Stat label="主机" value={parsed.host || '（本地文件）'} />
                  <Stat label="端口" value={parsed.port || '—'} />
                  <Stat label="数据库" value={parsed.database || '—'} />
                </StatGrid>
                <p className="text-muted-foreground">
                  用户：{parsed.user || '—'} · 密码：{parsed.password ? '已填写' : '—'} · 参数：{parsed.params || '—'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    applyKind(parsed.kind);
                    setHost(parsed.host);
                    setPort(parsed.port);
                    setDatabase(parsed.database);
                    setUser(parsed.user);
                    setPassword(parsed.password);
                    setParams(parsed.params);
                  }}
                >
                  <RefreshCw className="size-3.5" />
                  应用到连接参数
                </Button>
              </>
            ) : (
              <p className="text-destructive">{parsed.error}</p>
            )}
          </div>
        </div>
      </Section>

      <Section title="主流客户端填写指引" description="把左侧参数填入对应客户端即可连接">
        <div className="grid gap-2 md:grid-cols-2">
          {hints.map((hint) => (
            <div key={hint.name} className="rounded-md border px-3 py-2">
              <p className="text-xs font-medium">{hint.name}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {hint.values.map(([name, value]) => (
                  <li key={name} className="flex gap-2 text-[11px] text-muted-foreground">
                    <span className="w-24 shrink-0">{name}</span>
                    <span className="min-w-0 break-all font-mono text-foreground/80">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="官方客户端与文档" description="全部为外链，点击在新标签页打开">
        <LinkList items={CLIENT_LINKS} columns={3} />
      </Section>
    </div>
  );
}

/* ── Tab 2：数据建模 ─────────────────────────────────────────────────── */

function ModelTab() {
  const [dialect, setDialect] = useState<SqlDialect>('mysql');
  const [tables, setTables] = useState(() => [createModelTable('users')]);
  const [ddlInput, setDdlInput] = useState('');
  const [activeTableId, setActiveTableId] = useState(tables[0]?.id ?? '');

  const activeTable = tables.find((item) => item.id === activeTableId) ?? tables[0];
  const createStatements = useMemo(() => tables.map((table) => buildCreateTableSql(table, dialect)), [tables, dialect]);
  const dropStatements = useMemo(() => tables.map((table) => buildDropTableSql(table, dialect)), [tables, dialect]);
  const script = useMemo(
    () => [...createStatements, ...dropStatements].join('\n\n'),
    [createStatements, dropStatements],
  );
  const diagram = useMemo(() => layoutErDiagram(tables), [tables]);
  const presets = TYPE_PRESETS[dialect];

  const patchTable = (id: string, patch: Partial<(typeof tables)[number]>) => {
    setTables((prev) => prev.map((table) => (table.id === id ? { ...table, ...patch } : table)));
  };

  const patchColumn = (
    tableId: string,
    columnId: string,
    patch: Partial<(typeof tables)[number]['columns'][number]>,
  ) => {
    setTables((prev) =>
      prev.map((table) =>
        table.id === tableId
          ? {
              ...table,
              columns: table.columns.map((column) => (column.id === columnId ? { ...column, ...patch } : column)),
            }
          : table,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="表结构编辑"
        description="填写字段与约束，实时生成各方言 DDL"
        actions={
          <>
            <Select
              label="方言"
              value={dialect}
              onChange={(value) => setDialect(value as SqlDialect)}
              options={DIALECT_OPTIONS}
            />
            <Button
              size="sm"
              onClick={() => {
                const table = createModelTable(`table_${tables.length + 1}`);
                setTables((prev) => [...prev, table]);
                setActiveTableId(table.id);
              }}
            >
              新建表
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {tables.map((table) => (
            <Button
              key={table.id}
              size="sm"
              variant={table.id === activeTable?.id ? 'default' : 'outline'}
              onClick={() => setActiveTableId(table.id)}
            >
              {table.name || '未命名'}
            </Button>
          ))}
        </div>

        {activeTable === undefined ? (
          <p className="mt-3 text-xs text-muted-foreground">先新建一张表</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="表名"
                value={activeTable.name}
                onChange={(name) => patchTable(activeTable.id, { name })}
                placeholder="users"
              />
              <TextField
                label="表注释"
                value={activeTable.comment}
                onChange={(comment) => patchTable(activeTable.id, { comment })}
                placeholder="用户表"
              />
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[920px] text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">字段</th>
                    <th className="px-2 py-1.5 text-left font-medium">类型</th>
                    <th className="px-2 py-1.5 text-left font-medium">长度</th>
                    <th className="px-2 py-1.5 text-center font-medium">PK</th>
                    <th className="px-2 py-1.5 text-center font-medium">NN</th>
                    <th className="px-2 py-1.5 text-center font-medium">自增</th>
                    <th className="px-2 py-1.5 text-left font-medium">默认值</th>
                    <th className="px-2 py-1.5 text-left font-medium">外键</th>
                    <th className="px-2 py-1.5 text-left font-medium">注释</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {activeTable.columns.map((column) => (
                    <tr key={column.id} className="border-t">
                      <td className="px-2 py-1">
                        <input
                          value={column.name}
                          onChange={(event) => patchColumn(activeTable.id, column.id, { name: event.target.value })}
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`字段名 ${column.name}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.type}
                          list={`types-${dialect}`}
                          onChange={(event) => patchColumn(activeTable.id, column.id, { type: event.target.value })}
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`字段类型 ${column.name}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.length}
                          onChange={(event) => patchColumn(activeTable.id, column.id, { length: event.target.value })}
                          placeholder="—"
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`字段长度 ${column.name}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={column.primaryKey}
                          onChange={(event) =>
                            patchColumn(activeTable.id, column.id, { primaryKey: event.target.checked })
                          }
                          aria-label={`${column.name} 主键`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={column.notNull}
                          onChange={(event) =>
                            patchColumn(activeTable.id, column.id, { notNull: event.target.checked })
                          }
                          aria-label={`${column.name} 非空`}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={column.autoIncrement}
                          onChange={(event) =>
                            patchColumn(activeTable.id, column.id, { autoIncrement: event.target.checked })
                          }
                          aria-label={`${column.name} 自增`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.defaultValue}
                          onChange={(event) =>
                            patchColumn(activeTable.id, column.id, { defaultValue: event.target.value })
                          }
                          placeholder="—"
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`字段默认值 ${column.name}`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.reference}
                          onChange={(event) =>
                            patchColumn(activeTable.id, column.id, { reference: event.target.value })
                          }
                          placeholder="table.column"
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`${column.name} 外键引用`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.comment}
                          onChange={(event) => patchColumn(activeTable.id, column.id, { comment: event.target.value })}
                          placeholder="—"
                          className="h-7 w-full rounded border bg-background px-1.5 font-mono text-xs"
                          aria-label={`字段注释 ${column.name}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patchTable(activeTable.id, {
                              columns: activeTable.columns.filter((item) => item.id !== column.id),
                            })
                          }
                          aria-label={`删除字段 ${column.name}`}
                        >
                          删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <datalist id={`types-${dialect}`}>
              {presets.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchTable(activeTable.id, { columns: [...activeTable.columns, createColumn()] })}
              >
                添加字段
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setTables((prev) => prev.filter((table) => table.id !== activeTable.id));
                  setActiveTableId('');
                }}
              >
                删除当前表
              </Button>
            </div>
          </div>
        )}
      </Section>

      <StatGrid>
        <Stat label="表数量" value={tables.length} />
        <Stat label="字段总数" value={tables.reduce((sum, table) => sum + table.columns.length, 0)} />
        <Stat label="外键数量" value={diagram.edges.length} tone="info" />
        <Stat label="目标方言" value={DIALECT_OPTIONS.find((item) => item.value === dialect)?.label ?? dialect} />
      </StatGrid>

      <Section
        title="DDL 脚本"
        description="CREATE TABLE 与 DROP TABLE，可直接复制到客户端执行"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setDdlInput(script)}>
              <FileText className="size-3.5" />
              填入下方解析框
            </Button>
            <Button size="sm" onClick={() => downloadText(exportName('schema', 'sql'), script)}>
              <Download className="size-3.5" />
              下载 SQL
            </Button>
          </>
        }
      >
        <ResultBox label="DDL" value={script} onCopy={() => copyText(script)} rows="min-h-40" />
      </Section>

      <Section
        title="ER 图（示意）"
        description="根据表与外键自动布局，支持拖拽平移与滚轮缩放（仅本地渲染，不导出图片）"
      >
        <ErDiagram tables={tables} />
      </Section>

      <Section title="DDL 反向解析" description="粘贴建表语句，反向填充到上方编辑器">
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={ddlInput}
            onChange={(event) => setDdlInput(event.target.value)}
            placeholder="CREATE TABLE users (id bigint PRIMARY KEY, email varchar(128) NOT NULL);"
            className="min-h-32 font-mono text-xs"
            spellCheck={false}
            aria-label="待解析的建表语句"
          />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  const parsed = parseModelFromDdl(ddlInput);
                  if (parsed.length === 0) return;
                  setTables(parsed);
                  setActiveTableId(parsed[0]?.id ?? '');
                }}
                disabled={ddlInput.trim() === ''}
              >
                解析并载入
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              支持 CREATE TABLE（含 IF NOT EXISTS）、字段类型与长度、PRIMARY KEY / UNIQUE / FOREIGN KEY
              自增、注释与默认值；复杂生成列表达式与部分方言专有语法可能被忽略。
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ── Tab 3：数据搬运 ─────────────────────────────────────────────────── */

type MoveMode = 'json2sql' | 'sql2json' | 'csv2sql' | 'diff';

const MOVE_TABS: { value: MoveMode; label: string }[] = [
  { value: 'json2sql', label: 'JSON → SQL' },
  { value: 'sql2json', label: 'SQL 结果 → CSV/JSON' },
  { value: 'csv2sql', label: 'CSV → SQL' },
  { value: 'diff', label: '主键差异对比' },
];

function EtlTab() {
  const [mode, setMode] = useState<MoveMode>('json2sql');
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={mode} onValueChange={(value) => setMode(value as MoveMode)}>
        <TabsList className="flex flex-wrap gap-0.5">
          {MOVE_TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={mode === item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === 'json2sql' && <JsonToSql />}
      {mode === 'sql2json' && <SqlToTable />}
      {mode === 'csv2sql' && <CsvToSql />}
      {mode === 'diff' && <DiffPanel />}
    </div>
  );
}

function ImportButton({ onText, accept }: { onText: (text: string) => void; accept?: string }) {
  const load = async () => {
    const file = await pickFile();
    if (file === null) return;
    onText(await readAsText(file));
  };
  return (
    <Button size="sm" variant="outline" onClick={load}>
      <Download className="size-3.5" />
      读取文件
      {accept === undefined ? null : <span className="sr-only">{accept}</span>}
    </Button>
  );
}

function JsonToSql() {
  const [json, setJson] = useState('');
  const [tableName, setTableName] = useState('users');
  const [batchSize, setBatchSize] = useState(50);
  const [multiRow, setMultiRow] = useState(true);
  const [conflict, setConflict] = useState<'none' | 'ignore' | 'do-nothing'>('none');
  const [selected, setSelected] = useState<string[]>([]);

  const parsed = useMemo(() => parseJsonRecords(json), [json]);
  const columns = useMemo(() => {
    if (!parsed.ok) return [];
    return [...new Set(parsed.records.flatMap((record) => Object.keys(record)))];
  }, [parsed]);

  const options = useMemo(
    () => ({ tableName, columns: selected, batchSize, conflict, multiRow }),
    [tableName, selected, batchSize, conflict, multiRow],
  );
  const result = useMemo(() => jsonToInsertSql(json, options), [json, options]);

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="JSON → INSERT"
        description="粘贴对象数组，自动生成批量 INSERT 语句"
        actions={<ImportButton onText={setJson} />}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder='[{"id":1,"email":"a@example.com"},{"id":2,"email":"b@example.com"}]'
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            aria-label="源 JSON"
          />
          <div className="flex flex-col gap-2">
            <TextField label="目标表名" value={tableName} onChange={setTableName} placeholder="users" />
            <NumberField label="每批行数" value={batchSize} min={1} max={5000} onChange={setBatchSize} />
            <Select
              label="冲突策略"
              value={conflict}
              onChange={(value) => setConflict(value as 'none' | 'ignore' | 'do-nothing')}
              options={[
                { value: 'none', label: '不处理冲突' },
                { value: 'ignore', label: 'MySQL ON DUPLICATE KEY IGNORE' },
                { value: 'do-nothing', label: 'PostgreSQL ON CONFLICT DO NOTHING' },
              ]}
            />
            <Checkbox label="多值 VALUES（更紧凑）" checked={multiRow} onChange={setMultiRow} />
          </div>
        </div>

        {columns.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground">列筛选：</span>
            {columns.map((column) => {
              const active = selected.includes(column);
              return (
                <Button
                  key={column}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() =>
                    setSelected((prev) => (active ? prev.filter((item) => item !== column) : [...prev, column]))
                  }
                >
                  {column}
                </Button>
              );
            })}
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                清除筛选
              </Button>
            )}
          </div>
        )}
      </Section>

      <StatGrid>
        <Stat label="记录数" value={parsed.ok ? parsed.records.length : '—'} />
        <Stat label="列数" value={columns.length} />
        <Stat label="语句数" value={result.ok ? result.statements : '—'} tone="info" />
        <Stat label="冲突策略" value={conflict === 'none' ? '无' : conflict === 'ignore' ? 'IGNORE' : 'DO NOTHING'} />
      </StatGrid>

      <ResultBox
        label="生成的 SQL"
        value={result.ok ? result.sql : ''}
        error={result.ok ? null : (result.error ?? '解析失败')}
        onCopy={() => copyText(result.sql)}
        rows="min-h-40"
      />
      <p className="text-[11px] text-muted-foreground">
        字符串按字面量转义为单引号；未加引号的标识符会保持原样，正式迁移前请人工核对类型与转义。
      </p>
    </div>
  );
}

function SqlToTable() {
  const [input, setInput] = useState('');
  const table = useMemo(() => sqlResultToTable(input), [input]);

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="SQL 结果 → 表格"
        description="解析 psql / mysql / sqlcmd 的结果集输出（管道、制表符或逗号分隔）"
        actions={<ImportButton onText={setInput} />}
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={'id | email\n1 | a@example.com\n2 | b@example.com'}
          className="min-h-40 font-mono text-xs"
          spellCheck={false}
          aria-label="SQL 结果集"
        />
      </Section>
      <ResultTable table={table} />
    </div>
  );
}

function CsvToSql() {
  const [csv, setCsv] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [tableName, setTableName] = useState('users');
  const [jsonOut, setJsonOut] = useState(false);

  const table = useMemo(() => {
    if (csv.trim() === '') return EMPTY_TABLE satisfies Table;
    return parseDelimited(csv, delimiter);
  }, [csv, delimiter]);

  const jsonText = useMemo(() => JSON.stringify(table.rows, null, 2), [table.rows]);
  const sql = useMemo(() => {
    if (table.columns.length === 0) return '';
    const header = table.columns.map((name) => `  ${name}`);
    const rows = table.rows.map(
      (row) =>
        `  (${row.map((cell) => (cell === null ? 'NULL' : `'${String(cell).replace(/'/g, "''")}'`)).join(', ')})`,
    );
    return `INSERT INTO ${tableName || 'your_table'} (\n${header.join(',\n')}\n)\nVALUES\n${rows.join(',\n')};`;
  }, [table, tableName]);

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="CSV → SQL"
        description="解析 CSV/TSV 并生成 INSERT；先按需转换类型"
        actions={<ImportButton onText={setCsv} />}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={'id,email\n1,a@example.com'}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            aria-label="CSV 文本"
          />
          <div className="flex flex-col gap-2">
            <Select
              label="分隔符"
              value={delimiter}
              onChange={setDelimiter}
              options={[
                { value: ',', label: '逗号 ,' },
                { value: '\t', label: '制表符 Tab' },
                { value: ';', label: '分号 ;' },
                { value: '|', label: '竖线 |' },
              ]}
            />
            <TextField label="目标表名" value={tableName} onChange={setTableName} placeholder="users" />
            <Checkbox label="输出 JSON 而非 SQL" checked={jsonOut} onChange={setJsonOut} />
          </div>
        </div>
      </Section>
      <ResultBox
        label={jsonOut ? 'JSON' : 'SQL'}
        value={jsonOut ? jsonText : sql}
        onCopy={() => copyText(jsonOut ? jsonText : sql)}
        rows="min-h-32"
      />
    </div>
  );
}

function DiffPanel() {
  const [current, setCurrent] = useState('');
  const [desired, setDesired] = useState('');
  const [key, setKey] = useState('id');
  const [tableName, setTableName] = useState('users');
  const [ignoreConflict, setIgnoreConflict] = useState(false);

  const diff = useMemo(
    () => diffJson(current, desired, { key, tableName, ignoreConflict }),
    [current, desired, key, tableName, ignoreConflict],
  );
  const sql = useMemo(
    () => diffToSql(diff, { key, tableName, ignoreConflict }),
    [diff, key, tableName, ignoreConflict],
  );

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="主键差异对比"
        description="对比当前库与期望数据，按主键生成 INSERT/UPDATE/DELETE 迁移脚本"
        actions={<ImportButton onText={setCurrent} />}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            placeholder='[{"id":1,"email":"old@example.com"}]'
            className="min-h-32 font-mono text-xs"
            spellCheck={false}
            aria-label="当前库数据"
          />
          <Textarea
            value={desired}
            onChange={(event) => setDesired(event.target.value)}
            placeholder='[{"id":1,"email":"new@example.com"}]'
            className="min-h-32 font-mono text-xs"
            spellCheck={false}
            aria-label="期望数据"
          />
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <TextField label="主键列" value={key} onChange={setKey} placeholder="id" />
          <TextField label="目标表名" value={tableName} onChange={setTableName} placeholder="users" />
          <Checkbox label="INSERT 附加 ON CONFLICT DO NOTHING" checked={ignoreConflict} onChange={setIgnoreConflict} />
        </div>
      </Section>

      <StatGrid>
        <Stat label="新增" value={diff.inserted.length} tone="success" />
        <Stat label="更新" value={diff.updated.length} tone="warn" />
        <Stat label="删除" value={diff.deleted.length} tone="danger" />
        <Stat label="对比列数" value={diff.columns.length} />
      </StatGrid>

      <ResultBox
        label="迁移脚本"
        value={sql.script}
        error={diff.ok ? null : (diff.error ?? '对比失败')}
        onCopy={() => copyText(sql.script)}
        rows="min-h-40"
      />
    </div>
  );
}

/* ── 公共小组件 ──────────────────────────────────────────────────────── */

const EMPTY_TABLE: Table = { columns: [], rows: [] };

/** 为预览生成不重复的 key：同名内容追加序号。 */
function makeKeys(values: string[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const count = seen.get(value) ?? 0;
    seen.set(value, count + 1);
    return count === 0 ? value : `${value}~${count}`;
  });
}

function ResultTable({ table }: { table: Table }) {
  const [limit, setLimit] = useState(50);
  const data = table.columns.length === 0 ? EMPTY_TABLE : table;
  const rows = useMemo(() => data.rows.slice(0, limit), [data.rows, limit]);
  const columnKeys = useMemo(
    () => makeKeys(data.columns.map((name, index) => `${index}\u0001${name}`)),
    [data.columns],
  );
  const rowKeys = useMemo(
    () => makeKeys(rows.map((row, index) => `${index}\u0001${row.map((cell) => String(cell ?? '')).join('\u0002')}`)),
    [rows],
  );
  if (data.columns.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">解析后在此显示表格</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-96 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">#</th>
              {data.columns.map((column, index) => (
                <th key={columnKeys[index] ?? column} className="border-l px-2 py-1.5 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowKeys[rowIndex] ?? `row-${rowIndex}`} className="odd:bg-muted/20">
                <td className="px-2 py-1 text-[10px] text-muted-foreground">{rowIndex + 1}</td>
                {data.columns.map((column, columnIndex) => (
                  <td
                    key={columnKeys[columnIndex] ?? column}
                    className="max-w-56 truncate border-l px-2 py-1 font-mono"
                    title={String(row[columnIndex] ?? '')}
                  >
                    {row[columnIndex] === null ? (
                      <span className="italic text-muted-foreground/60">NULL</span>
                    ) : (
                      String(row[columnIndex] ?? '')
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          共 {data.rows.length} 行 × {data.columns.length} 列
        </span>
        {data.rows.length > rows.length && (
          <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 100)}>
            显示更多
          </Button>
        )}
      </div>
    </div>
  );
}

/** ER 图：滚轮缩放 + 拖拽平移，纯 SVG 本地渲染。 */
function ErDiagram({ tables }: { tables: ReturnType<typeof createModelTable>[] }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const diagram = useMemo(() => layoutErDiagram(tables), [tables]);

  if (tables.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">先在上方新建表</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setScale((value) => Math.max(0.4, value - 0.1))}>
          缩小
        </Button>
        <span className="text-[11px] text-muted-foreground">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => setScale((value) => Math.min(2, value + 0.1))}>
          放大
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          重置
        </Button>
        <span className="text-[11px] text-muted-foreground">滚轮缩放 · 拖拽平移</span>
      </div>
      <div
        className="max-h-96 cursor-grab overflow-hidden rounded-md border bg-muted/10 active:cursor-grabbing"
        onWheel={(event) => {
          event.preventDefault();
          setScale((value) => Math.min(2, Math.max(0.4, value - event.deltaY * 0.001)));
        }}
        onPointerDown={(event) => {
          (event.target as Element).setPointerCapture?.(event.pointerId);
          setDrag({ x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y });
        }}
        onPointerMove={(event) => {
          if (drag === null) return;
          setOffset({ x: drag.ox + (event.clientX - drag.x), y: drag.oy + (event.clientY - drag.y) });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <svg
          width="100%"
          height={Math.min(384, Math.max(240, diagram.height * scale))}
          role="img"
          aria-label="ER 关系图"
        >
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {diagram.edges.map((edge) => (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground/60"
                  strokeWidth={1.5}
                />
                <text x={0} y={0} className="fill-muted-foreground text-[9px]">
                  {edge.label}
                </text>
              </g>
            ))}
            {diagram.nodes.map((node) => (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={4}
                  className="fill-background stroke-border"
                  strokeWidth={1}
                />
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={26}
                  rx={4}
                  className="fill-muted stroke-border"
                  strokeWidth={1}
                />
                <text x={node.x + 8} y={node.y + 17} className="fill-foreground text-[11px] font-medium">
                  {node.name}
                </text>
                {node.rows.map((row, index) => (
                  <text
                    key={`${node.id}-row-${row.label}`}
                    x={node.x + 8}
                    y={node.y + 26 + index * 18 + 12}
                    className={
                      row.primaryKey ? 'fill-foreground text-[10px] font-medium' : 'fill-muted-foreground text-[10px]'
                    }
                  >
                    {row.primaryKey ? '🔑 ' : ''}
                    {row.label}
                    {row.type === '' ? '' : ` : ${row.type}`}
                  </text>
                ))}
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ── Tab 4：SQL 速查 ─────────────────────────────────────────────────── */

function SnippetsTab() {
  const [groupId, setGroupId] = useState(SQL_SNIPPETS[0]?.id ?? 'query');
  const [keyword, setKeyword] = useState('');
  const group = SQL_SNIPPETS.find((item) => item.id === groupId) ?? SQL_SNIPPETS[0];

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    const source = text === '' ? (group?.items ?? []) : SQL_SNIPPETS.flatMap((item) => item.items);
    if (text === '') return source;
    return source.filter((item) => item.title.toLowerCase().includes(text) || item.sql.toLowerCase().includes(text));
  }, [group, keyword]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TextField
          label="搜索"
          value={keyword}
          onChange={setKeyword}
          placeholder="按标题或 SQL 内容过滤"
          className="min-w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {SQL_SNIPPETS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === group?.id ? 'default' : 'outline'}
              onClick={() => setGroupId(item.id)}
            >
              {item.label}
              <span className="text-[10px] opacity-70">{item.items.length}</span>
            </Button>
          ))}
        </div>
      </div>

      <Note tone="info" title="模板说明">
        共 {SQL_SNIPPET_COUNT} 条模板，覆盖查询、写入、索引、表结构、事务与高级特性。占位符
        <code className="mx-1 font-mono">?</code> / <code className="mx-1 font-mono">:name</code> 请在客户端或 ORM
        中绑定为参数，切勿直接拼接用户输入。部分语法（window
        functions、CTAS、PIVOT）在特定方言下写法不同，跨库迁移时需核对。
      </Note>

      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((item) => (
          <div key={item.title} className="flex flex-col gap-1.5 rounded-md border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{item.title}</span>
              <Button size="sm" variant="ghost" onClick={() => copyText(item.sql)}>
                复制
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
              {item.sql}
            </pre>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">没有匹配的模板</p>}
    </div>
  );
}
