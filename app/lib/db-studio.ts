/**
 * 数据库开发工作台的纯逻辑层：连接串拼装与解析、CLI 命令、数据建模（DDL 生成 /
 * 反向解析 / ER 布局）、数据搬运（JSON ↔ SQL ↔ CSV、差异对比）与 SQL 速查模板。
 *
 * 说明：浏览器无法直连数据库，本模块只负责「生成与转换」，不发起任何网络请求。
 */

import JSON5 from 'json5';
import { parseCreateTableDefinitions, quoteIdent, quoteLiteral, type SqlDialect } from './sql';
import { type CellValue, columnLetterToIndex, detectDelimiter, parseDelimited, type Table, toDelimited } from './table';

// ── 数据库类型与连接配置 ────────────────────────────────────────────────

export type DbKind = 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'mongodb';

export interface DbProfile {
  value: DbKind;
  label: string;
  /** 默认端口，SQLite 为空。 */
  defaultPort: string;
  /** 驱动 / 协议描述。 */
  driver: string;
  /** 连接串 scheme 列表。 */
  schemes: string[];
  /** 默认参数示例。 */
  sampleParams: string;
  /** 命令行客户端名。 */
  cli: string;
}

export const DB_PROFILES: DbProfile[] = [
  {
    value: 'mysql',
    label: 'MySQL / MariaDB',
    defaultPort: '3306',
    driver: 'mysql（TCP）',
    schemes: ['mysql'],
    sampleParams: 'charset=utf8mb4&connectTimeout=10000',
    cli: 'mysql',
  },
  {
    value: 'postgres',
    label: 'PostgreSQL',
    defaultPort: '5432',
    driver: 'postgresql（TCP）',
    schemes: ['postgresql', 'postgres'],
    sampleParams: 'sslmode=require&connect_timeout=10&application_name=coder-tools',
    cli: 'psql',
  },
  {
    value: 'sqlite',
    label: 'SQLite',
    defaultPort: '',
    driver: 'file（本地文件）',
    schemes: ['sqlite', 'file'],
    sampleParams: 'mode=ro',
    cli: 'sqlite3',
  },
  {
    value: 'sqlserver',
    label: 'SQL Server',
    defaultPort: '1433',
    driver: 'mssql（TCP）',
    schemes: ['sqlserver', 'mssql'],
    sampleParams: 'encrypt=true&trustServerCertificate=true',
    cli: 'sqlcmd',
  },
  {
    value: 'mongodb',
    label: 'MongoDB',
    defaultPort: '27017',
    driver: 'mongodb（TCP）',
    schemes: ['mongodb', 'mongodb+srv'],
    sampleParams: 'authSource=admin&retryWrites=true&w=majority',
    cli: 'mongosh',
  },
];

export interface ConnectionConfig {
  kind: DbKind;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  /** 附加参数，k=v&k=v 形式。 */
  params: string;
}

export function defaultConnection(kind: DbKind = 'mysql'): ConnectionConfig {
  const profile = DB_PROFILES.find((item) => item.value === kind) ?? DB_PROFILES[0];
  return {
    kind,
    host: kind === 'sqlite' ? '' : 'localhost',
    port: profile?.defaultPort ?? '',
    database: kind === 'postgres' ? 'postgres' : 'mydb',
    user: kind === 'mongodb' ? 'root' : 'root',
    password: '',
    params: profile?.sampleParams ?? '',
  };
}

/** 去掉参数里的空项，返回 `k=v` 数组。 */
export function paramPairs(params: string): string[] {
  return params
    .split(/[&;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => (item.includes('=') ? item : `${item}=`));
}

function encodeParam(params: string): string {
  const pairs = paramPairs(params);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** 生成连接串（DSN）。SQLite 生成文件路径，其余生成 URL 形式。 */
export function buildDsn(config: ConnectionConfig): string {
  const profile = DB_PROFILES.find((item) => item.value === config.kind) ?? DB_PROFILES[0];
  const scheme = profile?.schemes[0] ?? 'mysql';

  if (config.kind === 'sqlite') {
    const file = config.database.trim() === '' ? './data.db' : config.database.trim();
    if (config.params.trim() !== '') return `${file}?${paramPairs(config.params).join('&')}`;
    return file;
  }

  const host = config.host.trim() === '' ? 'localhost' : config.host.trim();
  const authority = config.port.trim() === '' ? host : `${host}:${config.port.trim()}`;
  const userInfo =
    config.user.trim() === ''
      ? ''
      : `${encodeURIComponent(config.user)}${config.password === '' ? '' : `:${encodeURIComponent(config.password)}`}@`;
  const database = config.database.trim() === '' ? '' : `/${encodeURIComponent(config.database.trim())}`;
  return `${scheme}://${userInfo}${authority}${database}${encodeParam(config.params)}`;
}

export interface ParsedDsn {
  kind: DbKind;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  params: string;
  /** 是否成功识别。 */
  ok: boolean;
  error?: string;
}

/** 解析连接串：支持 mysql://、postgres://、mongodb+srv://、sqlserver:// 与 SQLite 路径。 */
export function parseDsn(dsn: string): ParsedDsn {
  const text = dsn.trim();
  const base: ParsedDsn = {
    kind: 'mysql',
    host: '',
    port: '',
    database: '',
    user: '',
    password: '',
    params: '',
    ok: false,
  };

  if (text === '') return { ...base, error: '连接串为空' };

  if (!text.includes('://')) {
    // SQLite：./app.db、C:/data/app.db、file:app.db?mode=ro
    const file = text.replace(/^file:(\/\/)?/, '');
    const [path, query] = file.split('?');
    if (!/\.(sqlite3?|db)$/i.test(path ?? '') && !text.startsWith('.')) {
      return { ...base, error: '无法识别的连接串，SQLite 路径通常形如 ./app.db' };
    }
    return { ...base, kind: 'sqlite', database: path ?? '', params: query ?? '', ok: true };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ...base, error: '连接串格式非法' };
  }

  const scheme = url.protocol.replace(/:$/, '');
  const profile = DB_PROFILES.find((item) => item.schemes.includes(scheme));
  if (profile === undefined) {
    return {
      ...base,
      error: `不支持的 scheme：${scheme}（可选 ${DB_PROFILES.flatMap((item) => item.schemes).join(' / ')}）`,
    };
  }

  return {
    kind: profile.value,
    host: decodeURIComponent(url.hostname),
    port: url.port === '' ? (profile.defaultPort ?? '') : url.port,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    params: url.search.replace(/^\?/, ''),
    ok: true,
  };
}

/** 生成命令行连接命令。 */
export function buildCliCommand(config: ConnectionConfig): string {
  const profile = DB_PROFILES.find((item) => item.value === config.kind) ?? DB_PROFILES[0];
  const dsn = buildDsn(config);
  const host = config.host.trim() === '' ? 'localhost' : config.host.trim();
  const port = config.port.trim() === '' ? (profile?.defaultPort ?? '') : config.port.trim();

  switch (config.kind) {
    case 'postgres':
      return `psql "${dsn}"`;
    case 'mysql':
      return `mysql -h ${host} -P ${port || '3306'} -u ${config.user || 'root'} -p ${config.database || ''}`.trim();
    case 'mongodb':
      return `mongosh "${dsn}"`;
    case 'sqlserver':
      return `sqlcmd -S tcp:${host},${port || '1433'} -U ${config.user || 'sa'} -P -d ${config.database || 'master'}`;
    case 'sqlite':
      return `sqlite3 ${config.database.trim() === '' ? './data.db' : config.database.trim()}`;
    default:
      return dsn;
  }
}

export interface ClientHint {
  name: string;
  /** 客户端连接参数填写要点。 */
  values: [string, string][];
}

/** 各主流客户端的连接参数填写指引。 */
export function clientHints(config: ConnectionConfig): ClientHint[] {
  const host = config.host.trim() === '' ? 'localhost' : config.host.trim();
  const port = config.port.trim() === '' ? '—' : config.port.trim();
  const database = config.database.trim() === '' ? '—' : config.database.trim();
  const user = config.user.trim() === '' ? '—' : config.user.trim();
  const params = paramPairs(config.params).join('&') || '—';

  if (config.kind === 'sqlite') {
    return [
      {
        name: 'DBeaver',
        values: [
          ['驱动', 'SQLite'],
          ['Database', database],
        ],
      },
      { name: 'DB Browser for SQLite', values: [['Open Database', database]] },
      { name: 'SQLiteStudio', values: [['Database', database]] },
      { name: 'sqlite3 CLI', values: [['命令', `sqlite3 ${database}`]] },
    ];
  }

  const base: [string, string][] = [
    ['Host', host],
    ['Port', port],
    ['Database', database],
    ['User', user],
    ['Password', config.password === '' ? '—' : '••••••（已填写）'],
  ];

  return [
    {
      name: 'Navicat',
      values: [...base, ['连接方式', DB_PROFILES.find((i) => i.value === config.kind)?.driver ?? '']],
    },
    { name: 'DBeaver', values: [...base, ['驱动', DB_PROFILES.find((i) => i.value === config.kind)?.driver ?? '']] },
    { name: 'DataGrip', values: [...base, ['Database URL', buildDsn({ ...config, password: '' })]] },
    {
      name: DB_PROFILES.find((i) => i.value === config.kind)?.cli ?? 'CLI',
      values: [['命令', buildCliCommand(config)]],
    },
    { name: '其他客户端', values: [['附加参数', params]] },
  ];
}

export interface ClientLink {
  name: string;
  url: string;
  description: string;
  tags: string[];
}

/** 官方与主流客户端入口（内置清单，不做任何请求）。 */
export const CLIENT_LINKS: ClientLink[] = [
  {
    name: 'DBeaver',
    url: 'https://dbeaver.io/',
    description: '开源跨平台客户端，支持几乎所有主流数据库',
    tags: ['开源', '跨平台'],
  },
  {
    name: 'Navicat',
    url: 'https://www.navicat.com/',
    description: '商业化 GUI 客户端，MySQL 系列体验最好',
    tags: ['商业'],
  },
  {
    name: 'DataGrip',
    url: 'https://www.jetbrains.com/datagrip/',
    description: 'JetBrains 出品，数据库工具全家桶',
    tags: ['商业', 'JetBrains'],
  },
  {
    name: 'Beekeeper Studio',
    url: 'https://www.beekeeperstudio.io/',
    description: '开源轻量客户端，界面简洁',
    tags: ['开源'],
  },
  { name: 'TablePlus', url: 'https://tableplus.com/', description: 'macOS 上体验出色的原生客户端', tags: ['macOS'] },
  { name: 'pgAdmin', url: 'https://www.pgadmin.org/', description: 'PostgreSQL 官方管理工具', tags: ['官方', 'PG'] },
  {
    name: 'MySQL Workbench',
    url: 'https://dev.mysql.com/doc/workbench/en/',
    description: 'MySQL 官方建模与运维工具',
    tags: ['官方', 'MySQL'],
  },
  {
    name: 'Adminer',
    url: 'https://www.adminer.org/',
    description: '单文件 PHP 数据库管理面板，可自建',
    tags: ['PHP', '自建'],
  },
  {
    name: 'mongosh',
    url: 'https://www.mongodb.com/docs/mongodb-shell/',
    description: 'MongoDB 官方命令行 Shell',
    tags: ['官方', 'Mongo'],
  },
  {
    name: 'SQLiteStudio',
    url: 'https://sqlitestudio.org/',
    description: 'SQLite 图形化客户端',
    tags: ['开源', 'SQLite'],
  },
  {
    name: 'MySQL 文档',
    url: 'https://dev.mysql.com/doc/',
    description: 'MySQL / MariaDB 官方参考手册',
    tags: ['官方'],
  },
  {
    name: 'PostgreSQL 文档',
    url: 'https://www.postgresql.org/docs/',
    description: 'PostgreSQL 官方文档',
    tags: ['官方'],
  },
  {
    name: 'SQL Server 文档',
    url: 'https://learn.microsoft.com/sql/sql-server/',
    description: '微软 SQL Server 官方文档',
    tags: ['官方'],
  },
  {
    name: 'SQLite 文档',
    url: 'https://www.sqlite.org/docs.html',
    description: 'SQLite 官方文档与 SQL 参考',
    tags: ['官方'],
  },
  { name: 'MongoDB 文档', url: 'https://www.mongodb.com/docs/', description: 'MongoDB 官方文档', tags: ['官方'] },
];

// ── 数据建模 ────────────────────────────────────────────────────────────

export interface ColumnDef {
  /** 前端列表用的稳定 id。 */
  id: string;
  name: string;
  type: string;
  /** 长度或精度，如 255、10,2。 */
  length: string;
  primaryKey: boolean;
  notNull: boolean;
  autoIncrement: boolean;
  defaultValue: string;
  comment: string;
  /** 外键目标，形如 `orgs.id`。 */
  reference: string;
}

export interface ModelTable {
  id: string;
  name: string;
  comment: string;
  columns: ColumnDef[];
}

let idSeed = 0;

export function nextId(prefix: string): string {
  idSeed += 1;
  return `${prefix}-${idSeed}`;
}

export function createColumn(partial: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: nextId('col'),
    name: 'new_column',
    type: 'varchar',
    length: '',
    primaryKey: false,
    notNull: false,
    autoIncrement: false,
    defaultValue: '',
    comment: '',
    reference: '',
    ...partial,
  };
}

export function createModelTable(name = 'new_table'): ModelTable {
  return {
    id: nextId('table'),
    name,
    comment: '',
    columns: [
      createColumn({
        name: 'id',
        type: 'bigint',
        primaryKey: true,
        notNull: true,
        autoIncrement: true,
        comment: '主键',
      }),
      createColumn({ name: 'created_at', type: 'timestamp', notNull: true, defaultValue: 'CURRENT_TIMESTAMP' }),
    ],
  };
}

/** 各方言常用类型建议。 */
export const TYPE_PRESETS: Record<SqlDialect, string[]> = {
  mysql: ['bigint', 'int', 'varchar', 'char', 'text', 'json', 'datetime', 'timestamp', 'decimal', 'boolean', 'blob'],
  postgres: [
    'bigint',
    'integer',
    'text',
    'varchar',
    'jsonb',
    'json',
    'timestamptz',
    'timestamp',
    'numeric',
    'boolean',
    'uuid',
    'bytea',
  ],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
  sqlserver: [
    'bigint',
    'int',
    'nvarchar',
    'nchar',
    'varchar',
    'text',
    'datetime2',
    'datetimeoffset',
    'decimal',
    'bit',
    'uniqueidentifier',
  ],
  oracle: ['NUMBER', 'VARCHAR2', 'NVARCHAR2', 'CLOB', 'DATE', 'TIMESTAMP', 'BLOB', 'CHAR'],
};

function typeWithLength(column: ColumnDef, dialect: SqlDialect): string {
  const base = column.type.trim() === '' ? (dialect === 'postgres' ? 'text' : 'varchar(255)') : column.type.trim();
  if (column.length.trim() === '' || base.includes('(')) return base;
  return `${base}(${column.length.trim()})`;
}

function commentLiteral(comment: string): string {
  return comment.trim() === '' ? '' : quoteLiteral(comment.trim());
}

/** 生成 CREATE TABLE DDL。 */
export function buildCreateTableSql(table: ModelTable, dialect: SqlDialect): string {
  const q = (name: string) => quoteIdent(name, dialect);
  const lines: string[] = [];

  for (const column of table.columns) {
    if (column.name.trim() === '') continue;
    let line = `${q(column.name.trim())} ${typeWithLength(column, dialect)}`;

    if (column.autoIncrement) {
      if (dialect === 'mysql') line += ' AUTO_INCREMENT';
      else if (dialect === 'postgres') line += ' GENERATED BY DEFAULT AS IDENTITY';
      else if (dialect === 'oracle') line += ' GENERATED BY DEFAULT AS IDENTITY';
      else if (dialect === 'sqlserver') line += ' IDENTITY(1,1)';
      else if (dialect === 'sqlite') line += column.primaryKey ? ' AUTOINCREMENT' : '';
    }
    if (column.notNull) line += ' NOT NULL';
    if (column.defaultValue.trim() !== '') line += ` DEFAULT ${column.defaultValue.trim()}`;

    if (dialect === 'mysql') {
      const comment = commentLiteral(column.comment);
      if (comment !== '') line += ` COMMENT ${comment}`;
    }
    if (dialect === 'sqlserver' && column.primaryKey) line += ' PRIMARY KEY';
    if (dialect === 'sqlite' && column.primaryKey && column.autoIncrement) line += ' PRIMARY KEY';
    lines.push(line);
  }

  const primaryKeys = table.columns.filter((column) => column.primaryKey).map((column) => column.name.trim());
  const foreignKeys = table.columns.filter((column) => column.reference.trim() !== '');
  const autoNamedPrimary = primaryKeys.length > 0 && dialect !== 'sqlserver' && dialect !== 'sqlite';

  if (primaryKeys.length > 1 || (primaryKeys.length === 1 && (autoNamedPrimary || dialect === 'sqlite'))) {
    if (dialect !== 'sqlite') {
      lines.push(`CONSTRAINT ${q(`${table.name}_pkey`)} PRIMARY KEY (${primaryKeys.map(q).join(', ')})`);
    } else if (primaryKeys.length > 1) {
      lines.push(`PRIMARY KEY (${primaryKeys.map(q).join(', ')})`);
    }
  }

  for (const column of foreignKeys) {
    const target = column.reference.trim();
    const dot = target.indexOf('.');
    const refTable = dot === -1 ? target : target.slice(0, dot);
    const refColumn = dot === -1 ? 'id' : target.slice(dot + 1);
    lines.push(
      `CONSTRAINT ${q(`fk_${table.name}_${column.name}`)} FOREIGN KEY (${q(column.name.trim())}) REFERENCES ${q(refTable)} (${q(refColumn)})`,
    );
  }

  const body = lines.map((line) => `  ${line}`).join(',\n');
  const name = q(table.name.trim() || 'new_table');
  const head = `CREATE TABLE ${name} (\n${body}\n)`;

  if (dialect === 'mysql') {
    const options = ['ENGINE=InnoDB', 'DEFAULT CHARSET=utf8mb4'];
    if (table.comment.trim() !== '') options.push(`COMMENT=${quoteLiteral(table.comment.trim())}`);
    return `${head} ${options.join(' ')};`;
  }
  if (dialect === 'postgres' && table.comment.trim() !== '') {
    return `${head};\nCOMMENT ON TABLE ${name} IS ${quoteLiteral(table.comment.trim())};`;
  }
  return `${head};`;
}

/** 生成 DROP TABLE DDL。 */
export function buildDropTableSql(table: ModelTable, dialect: SqlDialect): string {
  const q = (name: string) => quoteIdent(name, dialect);
  const name = q(table.name.trim() || 'new_table');
  const exists = dialect === 'postgres' || dialect === 'sqlite' ? 'IF EXISTS ' : '';
  return `DROP TABLE ${exists}${name};`;
}

/** 反向解析 DDL 为建模表单数据。 */
export function parseModelFromDdl(sql: string): ModelTable[] {
  return parseCreateTableDefinitions(sql).map((definition) => ({
    id: nextId('table'),
    name: definition.name,
    comment: '',
    columns: definition.columns.map((column) =>
      createColumn({
        name: column.name,
        type: column.type.replace(/\s+(UNSIGNED|ZEROFILL)$/i, ''),
        length: column.length ?? '',
        primaryKey: column.primaryKey || definition.primaryKey.includes(column.name),
        notNull: column.notNull,
        autoIncrement: column.autoIncrement,
        defaultValue: column.defaultValue ?? '',
        comment: column.comment ?? '',
        reference:
          column.references === undefined ? '' : `${column.references.table}.${column.references.column || 'id'}`,
      }),
    ),
  }));
}

export interface Relation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/** 从表定义中提取外键关系。 */
export function relationsOf(tables: ModelTable[]): Relation[] {
  const relations: Relation[] = [];
  for (const table of tables) {
    for (const column of table.columns) {
      const reference = column.reference.trim();
      if (reference === '') continue;
      const dot = reference.indexOf('.');
      relations.push({
        fromTable: table.name,
        fromColumn: column.name,
        toTable: dot === -1 ? reference : reference.slice(0, dot),
        toColumn: dot === -1 ? 'id' : reference.slice(dot + 1),
      });
    }
  }
  return relations;
}

export interface ErNode {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: { label: string; type: string; primaryKey: boolean }[];
}

export interface ErEdge {
  id: string;
  fromId: string;
  toId: string;
  path: string;
  label: string;
}

export interface ErDiagram {
  nodes: ErNode[];
  edges: ErEdge[];
  width: number;
  height: number;
}

const ER_ROW_HEIGHT = 18;
const ER_HEADER_HEIGHT = 26;
const ER_PADDING = 12;
const ER_GAP_X = 72;
const ER_GAP_Y = 48;
const ER_MIN_WIDTH = 168;

/** 网格布局 ER 图：表按列排布，外键用贝塞尔曲线连接。 */
export function layoutErDiagram(tables: ModelTable[], columnsPerRow = 3): ErDiagram {
  const perRow = Math.max(1, columnsPerRow);
  const nodes: ErNode[] = [];
  const rowsCount = Math.ceil(tables.length / perRow);

  tables.forEach((table, index) => {
    const column = index % perRow;
    const row = Math.floor(index / perRow);
    const label = table.comment.trim() === '' ? '' : table.comment.trim();
    const width = Math.max(
      ER_MIN_WIDTH,
      table.name.length * 8 + 48,
      ...table.columns.map((item) => `${item.name}${item.type}`.length * 7 + 36),
      label.length * 12 + 24,
    );
    const height = ER_HEADER_HEIGHT + table.columns.length * ER_ROW_HEIGHT + ER_PADDING;
    nodes.push({
      id: table.id,
      name: table.name,
      x: column * (ER_MIN_WIDTH + ER_GAP_X) + ER_PADDING,
      y: row * 420 + ER_PADDING,
      width,
      height,
      rows: table.columns.map((item) => ({
        label: item.comment.trim() === '' ? item.name : `${item.name} ${item.comment.trim()}`,
        type: item.type.trim(),
        primaryKey: item.primaryKey,
      })),
    });
  });

  const byTable = new Map<string, ModelTable>();
  for (const table of tables) byTable.set(table.name.toLowerCase(), table);
  const nodesByTable = new Map<string, ErNode>();
  for (const node of nodes) nodesByTable.set(node.name.toLowerCase(), node);

  const edges: ErEdge[] = relationsOf(tables)
    .map((relation, index) => {
      const from = nodesByTable.get(relation.fromTable.toLowerCase());
      const to = nodesByTable.get(relation.toTable.toLowerCase());
      const fromTable = byTable.get(relation.fromTable.toLowerCase());
      if (from === undefined || to === undefined || fromTable === undefined) return null;
      const columnIndex = Math.max(
        0,
        fromTable.columns.findIndex((item) => item.name === relation.fromColumn),
      );
      const startX = from.x + from.width;
      const startY = from.y + ER_HEADER_HEIGHT + columnIndex * ER_ROW_HEIGHT + ER_ROW_HEIGHT / 2;
      const endX = to.x;
      const endY = to.y + ER_HEADER_HEIGHT / 2;
      const curve = Math.max(36, Math.abs(endX - startX) / 2);
      return {
        id: `edge-${index}`,
        fromId: from.id,
        toId: to.id,
        path: `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`,
        label: `${relation.fromColumn} → ${relation.toColumn}`,
      };
    })
    .filter((edge): edge is ErEdge => edge !== null);

  const maxX = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0);
  const maxY = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
  return {
    nodes,
    edges,
    width: Math.max(maxX + ER_GAP_X + ER_PADDING, 320),
    height: Math.max(maxY + rowsCount * ER_GAP_Y, 240),
  };
}

// ── 数据搬运 ────────────────────────────────────────────────────────────

function sqlValue(value: CellValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return quoteLiteral(value);
}

export type JsonRecord = Record<string, CellValue>;

function toCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** 解析 JSON 文本为对象数组（容错 JSON5）。 */
export function parseJsonRecords(text: string): { ok: true; records: JsonRecord[] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, records: [] };
  let parsed: unknown;
  try {
    parsed = JSON5.parse(trimmed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const records: JsonRecord[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: '每条记录必须是对象（不能是数组或标量）' };
    }
    const record: JsonRecord = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) record[key] = toCell(value);
    records.push(record);
  }
  return { ok: true, records };
}

export interface InsertOptions {
  tableName: string;
  /** 限定列，留空取所有键的并集。 */
  columns?: string[];
  /** 每条 INSERT 的行数。 */
  batchSize: number;
  /** 冲突处理策略。 */
  conflict: 'none' | 'do-nothing' | 'ignore';
  /** 多值 VALUES（false 时逐行 INSERT）。 */
  multiRow: boolean;
}

export interface InsertResult {
  ok: boolean;
  error?: string;
  sql: string;
  statements: number;
  columns: string[];
  rows: number;
}

/** JSON 对象数组 → INSERT 语句。 */
export function jsonToInsertSql(json: string, options: InsertOptions): InsertResult {
  const parsed = parseJsonRecords(json);
  if (!parsed.ok) return { ok: false, error: parsed.error, sql: '', statements: 0, columns: [], rows: 0 };

  const records = parsed.records;
  const columns =
    options.columns !== undefined && options.columns.length > 0
      ? options.columns
      : [...new Set(records.flatMap((record) => Object.keys(record)))];

  const table = options.tableName.trim() === '' ? 'your_table' : options.tableName.trim();
  if (columns.length === 0) {
    return { ok: false, error: '没有可用的列，请检查 JSON 是否为空数组', sql: '', statements: 0, columns: [], rows: 0 };
  }

  const batchSize = Math.max(1, Math.floor(options.batchSize) || 1);
  const conflictClause =
    options.conflict === 'ignore'
      ? ' ON DUPLICATE KEY IGNORE'
      : options.conflict === 'do-nothing'
        ? ' ON CONFLICT DO NOTHING'
        : '';

  const lines: string[] = [];
  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const columnList = columns.map((name) => quoteIdent(name, 'postgres')).join(', ');
    if (options.multiRow) {
      const values = batch
        .map((record) => `  (${columns.map((name) => sqlValue(record[name] ?? null)).join(', ')})`)
        .join(',\n');
      lines.push(`INSERT INTO ${quoteIdent(table, 'postgres')} (${columnList})\nVALUES\n${values}${conflictClause};`);
    } else {
      for (const record of batch) {
        const values = columns.map((name) => sqlValue(record[name] ?? null)).join(', ');
        lines.push(`INSERT INTO ${quoteIdent(table, 'postgres')} (${columnList}) VALUES (${values})${conflictClause};`);
      }
    }
  }

  return {
    ok: true,
    sql: lines.join('\n'),
    statements: Math.ceil(records.length / batchSize),
    columns,
    rows: records.length,
  };
}

/** SQL 查询结果文本（管道 / 制表符 / 逗号分隔）→ 表格。 */
export function sqlResultToTable(text: string): Table {
  const trimmed = text.trim();
  if (trimmed === '') return { columns: [], rows: [] };
  if (looksLikeSql(trimmed)) return { columns: [], rows: [] };

  const delimiter = trimmed.includes('|') ? '|' : detectDelimiter(trimmed);
  const table = parseDelimited(trimmed, delimiter);
  // 控制台输出通常带对齐空格，去掉首尾空白（引号内的内容已被解析器保留）。
  return {
    columns: table.columns.map((name) => name.trim()),
    rows: table.rows.map((row) => row.map((cell) => (typeof cell === 'string' ? cell.trim() : cell))),
  };
}

/** CSV 文本 → 表格（复用 table.ts）。 */
export function csvToTable(text: string, delimiter?: string): Table {
  return parseDelimited(text, delimiter);
}

/** 表格 → CSV 文本。 */
export function tableToCsv(table: Table, delimiter = ',', eol = '\n'): string {
  return toDelimited(table, delimiter, { eol });
}

export interface DiffOptions {
  /** 主键列名。 */
  key: string;
  /** 目标表名，留空用主键名。 */
  tableName: string;
  /** 是否为 INSERT 语句附加冲突忽略。 */
  ignoreConflict: boolean;
}

export interface DiffEntry {
  keyValue: CellValue;
  before: JsonRecord | null;
  after: JsonRecord | null;
  /** 发生变化的字段。 */
  changed: string[];
}

export interface DiffResult {
  ok: boolean;
  error?: string;
  inserted: DiffEntry[];
  updated: DiffEntry[];
  deleted: DiffEntry[];
  columns: string[];
  keyColumn: string;
}

function sameValue(left: CellValue, right: CellValue): boolean {
  if (left === null || right === null) return left === right;
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  if (typeof left === 'boolean' || typeof right === 'boolean') return Boolean(left) === Boolean(right);
  return String(left) === String(right);
}

/**
 * 按主键对比两份同结构 JSON：`current` 为当前库数据，`desired` 为期望数据。
 * 输出的差异可直接翻译成「让当前库追上期望值」的迁移 SQL。
 */
export function diffJson(current: string, desired: string, options: DiffOptions): DiffResult {
  const parsedCurrent = parseJsonRecords(current);
  if (!parsedCurrent.ok) return { ...emptyDiff(), error: `当前库数据：${parsedCurrent.error}` };
  const parsedDesired = parseJsonRecords(desired);
  if (!parsedDesired.ok) return { ...emptyDiff(), error: `期望数据：${parsedDesired.error}` };

  const keyColumn = options.key.trim();
  if (keyColumn === '') return { ...emptyDiff(), error: '请填写主键列名' };

  const columns = [
    ...new Set([
      ...parsedDesired.records.flatMap((record) => Object.keys(record)),
      ...parsedCurrent.records.flatMap((record) => Object.keys(record)),
    ]),
  ];

  const index = (records: JsonRecord[]) => {
    const map = new Map<string, JsonRecord>();
    for (const record of records) map.set(String(record[keyColumn] ?? ''), record);
    return map;
  };

  const currentMap = index(parsedCurrent.records);
  const desiredMap = index(parsedDesired.records);

  const inserted: DiffEntry[] = [];
  const updated: DiffEntry[] = [];
  const deleted: DiffEntry[] = [];

  for (const [key, after] of desiredMap) {
    const before = currentMap.get(key);
    if (before === undefined) {
      inserted.push({ keyValue: after[keyColumn] ?? null, before: null, after, changed: [] });
      continue;
    }
    const changed = columns.filter(
      (column) => column !== keyColumn && !sameValue(before[column] ?? null, after[column] ?? null),
    );
    if (changed.length > 0) updated.push({ keyValue: after[keyColumn] ?? null, before, after, changed });
  }

  for (const [key, before] of currentMap) {
    if (desiredMap.has(key)) continue;
    deleted.push({ keyValue: before[keyColumn] ?? null, before, after: null, changed: [] });
  }

  return { ok: true, inserted, updated, deleted, columns, keyColumn };
}

function emptyDiff(): DiffResult {
  return { ok: false, inserted: [], updated: [], deleted: [], columns: [], keyColumn: '' };
}

export interface DiffSql {
  insert: string;
  update: string;
  delete: string;
  /** 合并后的迁移脚本。 */
  script: string;
}

/** 把差异结果转成 INSERT / UPDATE / DELETE SQL。 */
export function diffToSql(diff: DiffResult, options: DiffOptions): DiffSql {
  if (!diff.ok) return { insert: '', update: '', delete: '', script: '' };
  const table = options.tableName.trim() === '' ? diff.keyColumn : options.tableName.trim();
  const q = (name: string) => quoteIdent(name, 'postgres');
  const key = diff.keyColumn;
  const conflict = options.ignoreConflict ? ' ON CONFLICT DO NOTHING' : '';

  const insertColumns = diff.columns;
  const insertLines = diff.inserted.map((entry) => {
    const after = entry.after ?? {};
    const values = insertColumns.map((column) => sqlValue(after[column] ?? null)).join(', ');
    return `INSERT INTO ${q(table)} (${insertColumns.map(q).join(', ')}) VALUES (${values})${conflict};`;
  });

  const updateLines = diff.updated.map((entry) => {
    const after = entry.after ?? {};
    const sets = entry.changed.map((column) => `${q(column)} = ${sqlValue(after[column] ?? null)}`).join(', ');
    return `UPDATE ${q(table)} SET ${sets} WHERE ${q(key)} = ${sqlValue(entry.keyValue)};`;
  });

  const deleteLines = diff.deleted.map(
    (entry) => `DELETE FROM ${q(table)} WHERE ${q(key)} = ${sqlValue(entry.keyValue)};`,
  );

  const script = [
    insertLines.length > 0 ? `-- 新增\n${insertLines.join('\n')}` : '',
    updateLines.length > 0 ? `-- 更新\n${updateLines.join('\n')}` : '',
    deleteLines.length > 0 ? `-- 删除\n${deleteLines.join('\n')}` : '',
  ]
    .filter((item) => item !== '')
    .join('\n\n');

  return { insert: insertLines.join('\n'), update: updateLines.join('\n'), delete: deleteLines.join('\n'), script };
}

// ── SQL 速查模板 ────────────────────────────────────────────────────────

export interface SqlSnippet {
  title: string;
  sql: string;
  note?: string;
}

export interface SqlSnippetGroup {
  id: string;
  label: string;
  items: SqlSnippet[];
}

export const SQL_SNIPPETS: SqlSnippetGroup[] = [
  {
    id: 'query',
    label: '查询基础',
    items: [
      { title: '查询全部列', sql: 'SELECT * FROM users WHERE id = ?;' },
      { title: '只查需要的列', sql: 'SELECT id, email, status FROM users WHERE status = :status;' },
      { title: '去重取值', sql: 'SELECT DISTINCT city FROM users;' },
      { title: '取前 10 条', sql: 'SELECT id, email FROM users ORDER BY id LIMIT 10;' },
      { title: '分页（第 N 页）', sql: 'SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 40;' },
      { title: 'SQL Server 分页', sql: 'SELECT * FROM users ORDER BY id OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY;' },
      {
        title: '聚合统计',
        sql: 'SELECT COUNT(*) AS total, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM users;',
      },
      { title: '分组统计', sql: 'SELECT status, COUNT(*) AS cnt FROM users GROUP BY status ORDER BY cnt DESC;' },
      {
        title: 'HAVING 过滤分组',
        sql: 'SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id HAVING COUNT(*) > 10;',
      },
      {
        title: 'IN 子查询',
        sql: "SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE status = 'paid');",
      },
      {
        title: 'EXISTS 相关子查询',
        sql: 'SELECT * FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);',
      },
      { title: 'INNER JOIN', sql: 'SELECT u.email, o.amount FROM users u INNER JOIN orders o ON o.user_id = u.id;' },
      {
        title: 'LEFT JOIN + 条件',
        sql: "SELECT u.email, o.amount FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid';",
      },
      {
        title: '自连接',
        sql: 'SELECT e.name AS emp, m.name AS mgr FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;',
      },
      {
        title: 'CASE 派生字段',
        sql: "SELECT id, CASE WHEN score >= 90 THEN 'A' WHEN score >= 60 THEN 'B' ELSE 'C' END AS grade FROM scores;",
      },
      { title: 'COALESCE 兜底', sql: 'SELECT COALESCE(nickname, email) AS name FROM users;' },
      { title: 'NULL 安全比较', sql: 'SELECT * FROM users WHERE deleted_at IS NULL;' },
    ],
  },
  {
    id: 'write',
    label: '写入与更新',
    items: [
      { title: '插入单行', sql: "INSERT INTO users (email, name) VALUES ('a@x.com', '张三');" },
      {
        title: '批量插入（多值）',
        sql: "INSERT INTO users (email, name) VALUES ('a@x.com','张三'),('b@x.com','李四');",
      },
      { title: '插入并返回主键', sql: 'INSERT INTO users (email) VALUES (:email) RETURNING id, created_at;' },
      {
        title: 'MySQL upsert',
        sql: 'INSERT INTO users (id, email) VALUES (?, ?) ON DUPLICATE KEY UPDATE email = VALUES(email);',
      },
      {
        title: 'PostgreSQL upsert',
        sql: 'INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;',
      },
      {
        title: '批量 upsert',
        sql: 'INSERT INTO users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;',
      },
      { title: '条件更新', sql: "UPDATE users SET status = 'disabled' WHERE id = ? AND status = 'active';" },
      { title: '带表达式更新', sql: 'UPDATE counters SET hits = hits + 1, updated_at = now() WHERE key = ?;' },
      { title: '限制更新行数（PG）', sql: 'UPDATE jobs SET status = :s WHERE id = :id;' },
      { title: '按条件删除', sql: "DELETE FROM logs WHERE created_at < now() - interval '30 days';" },
      { title: '清空表', sql: 'TRUNCATE TABLE staging_users;' },
      { title: '软删除（推荐）', sql: 'UPDATE users SET deleted_at = now() WHERE id = ? AND deleted_at IS NULL;' },
      {
        title: 'INSERT ... SELECT',
        sql: 'INSERT INTO archive_users (id, email) SELECT id, email FROM users WHERE created_at < :cutoff;',
      },
    ],
  },
  {
    id: 'index',
    label: '索引与性能',
    items: [
      { title: '普通索引', sql: 'CREATE INDEX idx_users_created_at ON users (created_at);' },
      { title: '复合索引', sql: 'CREATE INDEX idx_orders_user_status ON orders (user_id, status);' },
      { title: '唯一索引', sql: 'CREATE UNIQUE INDEX uk_users_email ON users (email);' },
      { title: '部分索引（PG）', sql: 'CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL;' },
      { title: '函数索引', sql: 'CREATE INDEX idx_users_lower_email ON users (LOWER(email));' },
      { title: '查看执行计划', sql: 'EXPLAIN ANALYZE SELECT * FROM users WHERE email = ?;' },
      { title: 'MySQL 前缀索引', sql: 'CREATE INDEX idx_users_email ON users (email(32));' },
      { title: '统计信息（PG）', sql: 'ANALYZE users;' },
      { title: '优化表（MySQL）', sql: 'OPTIMIZE TABLE users;' },
      { title: '查询慢日志', sql: "SHOW VARIABLES LIKE 'slow_query_log';" },
    ],
  },
  {
    id: 'ddl',
    label: '表结构与约束',
    items: [
      {
        title: '建表',
        sql: 'CREATE TABLE users (\n  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,\n  email VARCHAR(128) NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);',
      },
      { title: '新增字段', sql: 'ALTER TABLE users ADD COLUMN nickname VARCHAR(64);' },
      { title: '删除字段', sql: 'ALTER TABLE users DROP COLUMN nickname;' },
      { title: '修改字段类型', sql: 'ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);' },
      { title: '加非空约束', sql: 'ALTER TABLE users ALTER COLUMN email SET NOT NULL;' },
      { title: '删除约束', sql: 'ALTER TABLE users DROP CONSTRAINT users_email_check;' },
      {
        title: '加外键',
        sql: 'ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id);',
      },
      { title: '加唯一约束', sql: 'ALTER TABLE users ADD CONSTRAINT uk_users_email UNIQUE (email);' },
      { title: '重命名表', sql: 'ALTER TABLE users RENAME TO app_users;' },
      { title: 'MySQL 修改字段', sql: 'ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NOT NULL;' },
      { title: '表注释（PG）', sql: "COMMENT ON TABLE users IS '用户表';" },
      { title: 'CTAS 建表复制', sql: 'CREATE TABLE users_2024 AS SELECT * FROM users WHERE created_at < :cutoff;' },
      { title: '临时表', sql: "CREATE TEMPORARY TABLE tmp_active AS SELECT id FROM users WHERE status = 'active';" },
      { title: '列类型速查（PG）', sql: '-- bigint / integer / text / varchar / jsonb / timestamptz / numeric / uuid' },
    ],
  },
  {
    id: 'tx',
    label: '事务与并发',
    items: [
      {
        title: '基础事务',
        sql: 'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nCOMMIT;',
      },
      { title: '保存点', sql: 'BEGIN;\nSAVEPOINT sp1;\nDELETE FROM logs;\nROLLBACK TO SAVEPOINT sp1;\nCOMMIT;' },
      { title: 'MySQL 事务', sql: 'START TRANSACTION;\nUPDATE t SET v = 1 WHERE id = ?;\nCOMMIT;' },
      { title: '行锁（PG）', sql: 'SELECT * FROM jobs WHERE id = ? FOR UPDATE;' },
      { title: 'MySQL 行锁', sql: 'SELECT * FROM jobs WHERE id = ? FOR UPDATE;' },
      { title: '跳过锁（PG）', sql: 'SELECT * FROM jobs WHERE id = ? FOR UPDATE SKIP LOCKED;' },
      {
        title: '乐观锁版本号',
        sql: 'UPDATE users SET name = :name, version = version + 1 WHERE id = :id AND version = :version;',
      },
      { title: '可重复读设置', sql: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;' },
      { title: '只读事务（PG）', sql: 'BEGIN TRANSACTION READ ONLY;' },
      { title: '死锁排查', sql: 'SHOW ENGINE INNODB STATUS;' },
    ],
  },
  {
    id: 'advanced',
    label: '高级特性',
    items: [
      {
        title: 'CTE 公用表表达式',
        sql: 'WITH recent AS (\n  SELECT * FROM orders WHERE created_at > :since\n)\nSELECT * FROM recent WHERE amount > 100;',
      },
      {
        title: '递归 CTE（PG）',
        sql: 'WITH RECURSIVE tree AS (\n  SELECT id, parent_id FROM nodes WHERE parent_id IS NULL\n  UNION ALL\n  SELECT n.id, n.parent_id FROM nodes n JOIN tree t ON n.parent_id = t.id\n)\nSELECT * FROM tree;',
      },
      {
        title: '递归 CTE（生成序列）',
        sql: 'WITH RECURSIVE seq AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 10) SELECT * FROM seq;',
      },
      {
        title: '窗口函数排名',
        sql: 'SELECT id, RANK() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rnk FROM orders;',
      },
      {
        title: '窗口函数累计求和',
        sql: 'SELECT dt, SUM(amount) OVER (ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS total FROM daily;',
      },
      { title: 'LAG 取上一行', sql: 'SELECT dt, amount, LAG(amount, 1) OVER (ORDER BY dt) AS prev FROM daily;' },
      { title: 'JSON 取值（PG）', sql: "SELECT data->>'name' AS name FROM events WHERE payload ? 'name';" },
      { title: 'JSON 取值（MySQL）', sql: "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.name')) AS name FROM events;" },
      {
        title: 'JSON 数组展开（PG）',
        sql: "SELECT (item->>'id')::bigint AS id FROM orders, LATERAL jsonb_array_elements(items) AS item;",
      },
      {
        title: '行转列（PIVOT）',
        sql: 'SELECT * FROM (SELECT user_id, status, COUNT(*) c FROM orders GROUP BY 1,2) t;',
      },
      {
        title: '条件聚合',
        sql: "SELECT COUNT(*) FILTER (WHERE status = 'paid') AS paid, COUNT(*) FILTER (WHERE status = 'refunded') AS refunded FROM orders;",
      },
      { title: '字符串聚合（PG）', sql: "SELECT string_agg(email, ',') FROM users WHERE status = 'active';" },
      { title: '数组与集合运算', sql: "SELECT * FROM users WHERE status = ANY (ARRAY['active','trial']);" },
      {
        title: 'INSERT ON CONFLICT 批量更新',
        sql: 'INSERT INTO counters (key, hits) VALUES (:k, :v)\nON CONFLICT (key) DO UPDATE SET hits = counters.hits + EXCLUDED.hits;',
      },
    ],
  },
];

export const SQL_SNIPPET_COUNT = SQL_SNIPPETS.reduce((sum, group) => sum + group.items.length, 0);

/** 判断字符串是否像 SQL 建表语句。 */
/** 判断文本是不是 SQL 语句（而不是查询结果集）。 */
export function looksLikeSql(text: string): boolean {
  const head = (text.trim().split('\n')[0] ?? '').trim();
  return /^(select|with|insert|update|delete|create|alter|drop|truncate|explain|pragma|show|describe|use|set|begin|commit|rollback|grant|revoke|values|do)\b/i.test(
    head,
  );
}

export function looksLikeDdl(text: string): boolean {
  return /create\s+(table|index|view)\b/i.test(text);
}

export type { SqlDialect };
/** CSV 列字母工具与方言类型的再导出，便于界面复用。 */
export { columnLetterToIndex };
