/**
 * 轻量 SQL 子集引擎：纯 TypeScript、零依赖、纯本地内存执行。
 *
 * 目标不是复刻完整 SQL，而是给「本地查询」提供一个可预测、可单测的最小查询能力：
 * 单表 SELECT、列别名、WHERE 条件、ORDER BY、LIMIT / OFFSET 与 COUNT(*)。
 * 任何非法输入都返回中文原因，绝不抛异常、绝不静默吞掉错误。
 */

export type CellValue = string | number | boolean | null;

/** 数据集中的一行：列名 → 单元格值。 */
export type DataRow = Record<string, CellValue>;

/** 数据集集合：数据集名 → 行数组。 */
export type Dataset = Record<string, DataRow[]>;

export interface QueryResult {
  /** 结果列名，与 rows 中每个数组的下标一一对应。 */
  columns: string[];
  /** 结果行，每行是按 columns 顺序排列的单元格值。 */
  rows: CellValue[][];
  /** 出错时的中文原因；成功时为 null。 */
  error: string | null;
}

export interface CsvResult {
  columns: string[];
  rows: CellValue[][];
  error: string | null;
}

/** 面向用户的支持范围说明，UI 提示与错误信息共用同一口径。 */
export const SQL_SUPPORTED_RANGE =
  '本引擎仅支持单表 SELECT：SELECT 列（含 * 与 AS 别名）或 COUNT(*)、FROM <数据集名>、' +
  'WHERE（= != <> > < >= <= LIKE、AND / OR、括号）、ORDER BY 列 [ASC|DESC]、LIMIT / OFFSET；' +
  '不支持 JOIN、子查询、多表、事务、写入 / DDL 语句、GROUP BY / HAVING / DISTINCT。';

function fail(message: string): QueryResult {
  return { columns: [], rows: [], error: message };
}

class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

// ── 词法 ──────────────────────────────────────────────────────────────

type Token =
  | { kind: 'word'; text: string; pos: number }
  | { kind: 'string'; value: string; pos: number }
  | { kind: 'number'; value: number; pos: number }
  | { kind: 'op'; text: string; pos: number }
  | { kind: 'punct'; text: string; pos: number };

const WORD_START = /[A-Za-z_\u4e00-\u9fff]/;
const WORD_CHAR = /[A-Za-z0-9_\u4e00-\u9fff]/;
const NUMERIC_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/;

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const pos = i;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === "'") {
      i += 1;
      let value = '';
      let closed = false;
      while (i < sql.length) {
        const c = sql[i];
        if (c === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        value += c;
        i += 1;
      }
      if (!closed) throw new QueryError(`字符串字面量缺少结束的单引号（位置 ${pos}）`);
      tokens.push({ kind: 'string', value, pos });
      continue;
    }
    if (ch === '"' || ch === '`') {
      throw new QueryError(
        `不支持${ch === '"' ? '双引号' : '反引号'}（位置 ${pos}）：字符串请用单引号 '...' 包裹，列名支持中文 / 字母 / 下划线`,
      );
    }
    if (ch === '.') {
      throw new QueryError('不支持带点号的限定列名（如 table.column）：本引擎只支持单表查询');
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      let raw = '';
      if (ch === '-') {
        raw += '-';
        i += 1;
      }
      while (i < sql.length && /[0-9]/.test(sql[i])) {
        raw += sql[i];
        i += 1;
      }
      if (sql[i] === '.') {
        raw += '.';
        i += 1;
        while (i < sql.length && /[0-9]/.test(sql[i])) {
          raw += sql[i];
          i += 1;
        }
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new QueryError(`数字字面量无效：${raw}`);
      tokens.push({ kind: 'number', value, pos });
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '<>' || two === '!=') {
      tokens.push({ kind: 'op', text: two, pos });
      i += 2;
      continue;
    }
    if (ch === '=' || ch === '>' || ch === '<') {
      tokens.push({ kind: 'op', text: ch, pos });
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',' || ch === '*' || ch === ';') {
      tokens.push({ kind: 'punct', text: ch, pos });
      i += 1;
      continue;
    }
    if (WORD_START.test(ch)) {
      let raw = '';
      while (i < sql.length && WORD_CHAR.test(sql[i])) {
        raw += sql[i];
        i += 1;
      }
      tokens.push({ kind: 'word', text: raw, pos });
      continue;
    }
    throw new QueryError(`无法识别的字符「${ch}」（位置 ${pos}）`);
  }
  return tokens;
}

function describe(token: Token | undefined): string {
  if (token === undefined) return '（语句结束）';
  switch (token.kind) {
    case 'word':
      return `「${token.text}」`;
    case 'string':
      return `字符串 '${token.value}'`;
    case 'number':
      return `数字 ${token.value}`;
    case 'op':
      return `运算符 ${token.text}`;
    case 'punct':
      return `符号 ${token.text}`;
    default:
      return '（未知记号）';
  }
}

// ── 不支持语法的显式拦截 ──────────────────────────────────────────────

const WRITE_WORDS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'MERGE',
  'UPSERT',
]);
const TX_WORDS = new Set(['BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT', 'START']);
const FORBIDDEN_WORDS = new Map<string, string>([
  ['JOIN', 'JOIN 多表连接'],
  ['UNION', 'UNION 集合运算'],
  ['INTERSECT', 'INTERSECT 集合运算'],
  ['EXCEPT', 'EXCEPT 集合运算'],
  ['INSERT', 'INSERT 写入语句'],
  ['UPDATE', 'UPDATE 写入语句'],
  ['DELETE', 'DELETE 写入语句'],
  ['CREATE', 'CREATE DDL 语句'],
  ['DROP', 'DROP DDL 语句'],
  ['ALTER', 'ALTER DDL 语句'],
  ['TRUNCATE', 'TRUNCATE DDL 语句'],
  ['REPLACE', 'REPLACE 写入语句'],
  ['MERGE', 'MERGE 写入语句'],
  ['BEGIN', 'BEGIN 事务语句'],
  ['COMMIT', 'COMMIT 事务语句'],
  ['ROLLBACK', 'ROLLBACK 事务语句'],
  ['TRANSACTION', 'TRANSACTION 事务语句'],
  ['SAVEPOINT', 'SAVEPOINT 事务语句'],
  ['HAVING', 'HAVING 分组筛选'],
  ['DISTINCT', 'DISTINCT 去重'],
  ['EXISTS', 'EXISTS 子查询'],
  ['IN', 'IN 运算符 / 子查询'],
]);

function detectUnsupported(tokens: Token[]): void {
  const first = tokens[0];
  const firstWord = first?.kind === 'word' ? first.text.toUpperCase() : '';
  if (firstWord !== 'SELECT') {
    if (WRITE_WORDS.has(firstWord)) throw new QueryError(`不支持写入 / DDL 语句（${firstWord}）`);
    if (TX_WORDS.has(firstWord)) throw new QueryError(`不支持事务语句（${firstWord}）`);
    throw new QueryError(`仅支持 SELECT 查询语句，无法识别语句开头 ${describe(first)}`);
  }

  for (const token of tokens) {
    if (token.kind !== 'word') continue;
    const label = FORBIDDEN_WORDS.get(token.text.toUpperCase());
    if (label !== undefined) throw new QueryError(`不支持 ${label}（关键字 ${token.text}）`);
  }

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a?.kind === 'punct' && a.text === '(' && b?.kind === 'word' && b.text.toUpperCase() === 'SELECT') {
      throw new QueryError('不支持子查询 / 嵌套 SELECT');
    }
    if (a?.kind === 'word' && a.text.toUpperCase() === 'FROM' && b?.kind === 'punct' && b.text === '(') {
      throw new QueryError('不支持 FROM 子查询 / 派生表');
    }
    if (a?.kind === 'word' && a.text.toUpperCase() === 'GROUP' && b?.kind === 'word' && b.text.toUpperCase() === 'BY') {
      throw new QueryError('不支持 GROUP BY 分组');
    }
  }

  const semis = tokens.filter((token) => token.kind === 'punct' && token.text === ';');
  const last = tokens[tokens.length - 1];
  if (semis.length > 1 || (semis.length === 1 && (last?.kind !== 'punct' || last.text !== ';'))) {
    throw new QueryError('不支持多语句 / 事务脚本：一次只能执行一条 SELECT');
  }
}

// ── 语法 ──────────────────────────────────────────────────────────────

type CmpOp = '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=' | 'LIKE';

type Operand = { kind: 'column'; name: string } | { kind: 'literal'; value: CellValue };

type Expr = { kind: 'and' | 'or'; left: Expr; right: Expr } | { kind: 'cmp'; left: Operand; right: Operand; op: CmpOp };

interface SelectItem {
  kind: 'star' | 'column' | 'count';
  column?: string;
  alias?: string;
}

interface OrderTerm {
  column: string;
  direction: 'asc' | 'desc';
}

interface Statement {
  items: SelectItem[];
  from: string;
  where: Expr | null;
  order: OrderTerm[];
  limit: number | null;
  offset: number;
}

/** 不能作为列名 / 别名 / 数据集名的关键字。 */
const RESERVED = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'ASC',
  'DESC',
  'AS',
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'JOIN',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'COUNT',
  'ON',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'IN',
  'IS',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'VALUES',
  'INTO',
  'SET',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'SAVEPOINT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'REPLACE',
  'MERGE',
  'NULL',
  'TRUE',
  'FALSE',
]);

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private peekAhead(offset: number): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private next(): Token | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private isWord(text: string): boolean {
    const token = this.peek();
    return token?.kind === 'word' && token.text.toUpperCase() === text;
  }

  private takeWord(text: string): boolean {
    if (!this.isWord(text)) return false;
    this.next();
    return true;
  }

  private expectWord(text: string): void {
    if (!this.takeWord(text)) throw new QueryError(`期望关键字 ${text}，实际得到 ${describe(this.peek())}`);
  }

  private isPunct(text: string): boolean {
    const token = this.peek();
    return token?.kind === 'punct' && token.text === text;
  }

  private expectPunct(text: string): void {
    if (!this.isPunct(text)) throw new QueryError(`期望符号 ${text}，实际得到 ${describe(this.peek())}`);
    this.next();
  }

  parse(): Statement {
    this.expectWord('SELECT');
    const items = this.parseSelectList();
    this.expectWord('FROM');
    const from = this.parseFrom();

    let where: Expr | null = null;
    if (this.takeWord('WHERE')) where = this.parseOr();

    const order: OrderTerm[] = [];
    if (this.takeWord('ORDER')) {
      this.expectWord('BY');
      order.push(...this.parseOrderList());
    }

    let limit: number | null = null;
    let offset = 0;
    let offsetSeen = false;
    for (let guard = 0; guard < 4; guard += 1) {
      if (limit === null && this.takeWord('LIMIT')) {
        limit = this.parseCount('LIMIT');
        continue;
      }
      if (!offsetSeen && this.takeWord('OFFSET')) {
        offset = this.parseCount('OFFSET');
        offsetSeen = true;
        continue;
      }
      break;
    }

    if (this.isPunct(';')) this.next();
    const rest = this.peek();
    if (rest !== undefined) throw new QueryError(`SQL 结尾存在无法解析的内容 ${describe(rest)}`);
    return { items, from, where, order, limit, offset };
  }

  private parseCount(keyword: string): number {
    const token = this.next();
    if (token?.kind !== 'number' || !Number.isInteger(token.value) || token.value < 0) {
      throw new QueryError(`${keyword} 之后必须是非负整数，实际得到 ${describe(token)}`);
    }
    return token.value;
  }

  private parseSelectList(): SelectItem[] {
    const items: SelectItem[] = [];
    while (true) {
      items.push(this.parseSelectItem());
      if (this.isPunct(',')) {
        this.next();
        continue;
      }
      break;
    }
    return items;
  }

  private parseSelectItem(): SelectItem {
    if (this.isPunct('*')) {
      this.next();
      return { kind: 'star' };
    }
    const ahead = this.peekAhead(1);
    if (this.isWord('COUNT') && ahead?.kind === 'punct' && ahead.text === '(') {
      this.next();
      this.expectPunct('(');
      if (!this.isPunct('*')) throw new QueryError('COUNT 聚合只支持 COUNT(*)');
      this.next();
      this.expectPunct(')');
      const alias = this.parseAlias();
      return alias === null ? { kind: 'count' } : { kind: 'count', alias };
    }
    const token = this.next();
    if (token?.kind !== 'word' || RESERVED.has(token.text.toUpperCase())) {
      throw new QueryError(`SELECT 列表中的列名无效：${describe(token)}`);
    }
    const alias = this.parseAlias();
    return alias === null ? { kind: 'column', column: token.text } : { kind: 'column', column: token.text, alias };
  }

  private parseAlias(): string | null {
    if (this.takeWord('AS')) {
      const token = this.next();
      if (token?.kind !== 'word' || RESERVED.has(token.text.toUpperCase())) {
        throw new QueryError(`AS 之后必须是列别名，实际得到 ${describe(token)}`);
      }
      return token.text;
    }
    const token = this.peek();
    if (token?.kind === 'word' && !RESERVED.has(token.text.toUpperCase())) {
      this.next();
      return token.text;
    }
    return null;
  }

  private parseFrom(): string {
    const token = this.next();
    if (token?.kind !== 'word' || RESERVED.has(token.text.toUpperCase())) {
      throw new QueryError(`FROM 之后必须是数据集名，实际得到 ${describe(token)}`);
    }
    if (this.isPunct(',')) throw new QueryError('不支持多表查询：FROM 之后只能指定一个数据集');
    const next = this.peek();
    if (next?.kind === 'word' && !RESERVED.has(next.text.toUpperCase())) {
      throw new QueryError('不支持表别名 / 多表：FROM 之后只能指定一个数据集名');
    }
    return token.text;
  }

  private parseOrderList(): OrderTerm[] {
    const terms: OrderTerm[] = [];
    while (true) {
      const token = this.next();
      if (token?.kind !== 'word' || RESERVED.has(token.text.toUpperCase())) {
        throw new QueryError(`ORDER BY 列名无效：${describe(token)}`);
      }
      let direction: 'asc' | 'desc' = 'asc';
      if (this.takeWord('DESC')) direction = 'desc';
      else if (this.takeWord('ASC')) direction = 'asc';
      terms.push({ column: token.text, direction });
      if (this.isPunct(',')) {
        this.next();
        continue;
      }
      break;
    }
    return terms;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.takeWord('OR')) {
      left = { kind: 'or', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parsePrimary();
    while (this.takeWord('AND')) {
      left = { kind: 'and', left, right: this.parsePrimary() };
    }
    return left;
  }

  private parsePrimary(): Expr {
    if (this.isPunct('(')) {
      this.next();
      const expr = this.parseOr();
      if (!this.isPunct(')')) throw new QueryError('WHERE 条件中的括号未闭合');
      this.next();
      return expr;
    }
    return this.parseCondition();
  }

  private parseCondition(): Expr {
    const left = this.parseOperand();
    const op = this.parseCmpOp();
    const right = this.parseOperand();
    return { kind: 'cmp', left, right, op };
  }

  private parseOperand(): Operand {
    const token = this.next();
    if (token === undefined) throw new QueryError('WHERE 条件不完整：缺少比较值');
    if (token.kind === 'string') return { kind: 'literal', value: token.value };
    if (token.kind === 'number') return { kind: 'literal', value: token.value };
    if (token.kind === 'word') {
      const upper = token.text.toUpperCase();
      if (upper === 'NULL') return { kind: 'literal', value: null };
      if (upper === 'TRUE') return { kind: 'literal', value: true };
      if (upper === 'FALSE') return { kind: 'literal', value: false };
      if (RESERVED.has(upper)) {
        throw new QueryError(`WHERE 条件中出现保留关键字「${token.text}」，或条件不完整`);
      }
      return { kind: 'column', name: token.text };
    }
    throw new QueryError(`WHERE 条件中的操作数无效：${describe(token)}`);
  }

  private parseCmpOp(): CmpOp {
    const token = this.next();
    if (token?.kind === 'op') return token.text as CmpOp;
    if (token?.kind === 'word' && token.text.toUpperCase() === 'LIKE') return 'LIKE';
    throw new QueryError(`WHERE 条件缺少比较运算符（支持 = != <> > < >= <= LIKE），实际得到 ${describe(token)}`);
  }
}

// ── 求值 ──────────────────────────────────────────────────────────────

function resolveDatasetKey(datasets: Dataset, name: string): string | null {
  if (Object.hasOwn(datasets, name)) return name;
  const lower = name.toLowerCase();
  return Object.keys(datasets).find((key) => key.toLowerCase() === lower) ?? null;
}

function resolveColumn(columns: string[], name: string): string | null {
  if (columns.includes(name)) return name;
  const lower = name.toLowerCase();
  return columns.find((column) => column.toLowerCase() === lower) ?? null;
}

/** 取所有行键的并集，按首次出现顺序，兼容各行列不齐的情况。 */
function columnsOf(rows: DataRow[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  return String(value);
}

function validateExpr(expr: Expr, columns: string[], datasetName: string): string | null {
  if (expr.kind === 'and' || expr.kind === 'or') {
    return validateExpr(expr.left, columns, datasetName) ?? validateExpr(expr.right, columns, datasetName);
  }
  for (const operand of [expr.left, expr.right]) {
    if (operand.kind !== 'column') continue;
    const canonical = resolveColumn(columns, operand.name);
    if (canonical === null) {
      return `WHERE 条件中的列「${operand.name}」不存在于数据集「${datasetName}」，可用列：${columns.join('、') || '（无）'}`;
    }
    operand.name = canonical;
  }
  return null;
}

function sign(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function numberLike(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '' || !NUMERIC_PATTERN.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * 统一比较：NULL 视为最小值；数值型字符串按数值比较，其余按码位比较。
 * 返回 -1 / 0 / 1，供 = != > < 等运算符与 ORDER BY 共用。
 */
function compare(a: CellValue, b: CellValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return sign(a - b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return sign(Number(a) - Number(b));
  const na = numberLike(a);
  const nb = numberLike(b);
  if (na !== null && nb !== null) return sign(na - nb);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** LIKE：% 任意字符序列、_ 单个字符，不区分大小写（与常见数据库默认一致）。 */
function likeMatch(text: string, pattern: string): boolean {
  let source = '^';
  for (const ch of pattern) {
    if (ch === '%') source += '[\\s\\S]*';
    else if (ch === '_') source += '[\\s\\S]';
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  source += '$';
  try {
    return new RegExp(source, 'i').test(text);
  } catch {
    return false;
  }
}

function applyCmp(left: CellValue, op: CmpOp, right: CellValue): boolean {
  if (op === 'LIKE') {
    if (left === null || right === null) return false;
    return likeMatch(String(left), String(right));
  }
  const value = compare(left, right);
  switch (op) {
    case '=':
      return value === 0;
    case '!=':
    case '<>':
      return value !== 0;
    case '>':
      return value > 0;
    case '<':
      return value < 0;
    case '>=':
      return value >= 0;
    case '<=':
      return value <= 0;
    default:
      return false;
  }
}

function evaluate(expr: Expr, row: DataRow): boolean {
  if (expr.kind === 'cmp') {
    const left = expr.left.kind === 'column' ? (row[expr.left.name] ?? null) : expr.left.value;
    const right = expr.right.kind === 'column' ? (row[expr.right.name] ?? null) : expr.right.value;
    return applyCmp(left, expr.op, right);
  }
  if (expr.kind === 'and') return evaluate(expr.left, row) && evaluate(expr.right, row);
  return evaluate(expr.left, row) || evaluate(expr.right, row);
}

/** 稳定排序：多列依次比较，完全相等时保留原始行序。 */
function sortRows(rows: DataRow[], order: OrderTerm[]): DataRow[] {
  if (order.length === 0) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      for (const term of order) {
        const value = compare(a.row[term.column] ?? null, b.row[term.column] ?? null);
        if (value !== 0) return term.direction === 'desc' ? -value : value;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

function sliceList<T>(list: T[], offset: number, limit: number | null): T[] {
  const end = limit === null ? undefined : offset + limit;
  return list.slice(offset, end);
}

// ── 执行 ──────────────────────────────────────────────────────────────

function execute(datasets: Dataset, statement: Statement): QueryResult {
  const key = resolveDatasetKey(datasets, statement.from);
  if (key === null) {
    const names = Object.keys(datasets);
    const list = names.length > 0 ? names.join('、') : '（尚未载入任何数据集）';
    return fail(`数据集「${statement.from}」不存在，可用数据集：${list}`);
  }
  const raw = datasets[key];
  if (!Array.isArray(raw)) return fail(`数据集「${key}」格式无效：应为行数组`);

  const rows: DataRow[] = [];
  for (const row of raw) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return fail(`数据集「${key}」中存在无效行：每行应为「列名 → 值」的对象`);
    }
    const normalized: DataRow = {};
    for (const [column, value] of Object.entries(row)) normalized[column] = normalizeCell(value);
    rows.push(normalized);
  }
  const columns = columnsOf(rows);
  const available = columns.join('、') || '（数据集为空，无可用列）';

  for (const item of statement.items) {
    if (item.kind !== 'column') continue;
    const canonical = resolveColumn(columns, item.column ?? '');
    if (canonical === null) {
      return fail(`列「${item.column}」不存在于数据集「${key}」，可用列：${available}`);
    }
    item.column = canonical;
  }

  const aliases = new Map<string, string>();
  for (const item of statement.items) {
    if (item.kind === 'column' && item.alias !== undefined) aliases.set(item.alias.toLowerCase(), item.column ?? '');
  }

  if (statement.where !== null) {
    const reason = validateExpr(statement.where, columns, key);
    if (reason !== null) return fail(reason);
  }
  for (const term of statement.order) {
    const canonical = resolveColumn(columns, term.column);
    if (canonical !== null) {
      term.column = canonical;
      continue;
    }
    const mapped = aliases.get(term.column.toLowerCase());
    if (mapped !== undefined) {
      term.column = mapped;
      continue;
    }
    return fail(`ORDER BY 列「${term.column}」不存在于数据集「${key}」，可用列：${available}`);
  }

  const where = statement.where;
  const filtered = where === null ? rows : rows.filter((row) => evaluate(where, row));

  const counts = statement.items.filter((item) => item.kind === 'count');
  if (counts.length > 0) {
    if (statement.items.length > 1) return fail('COUNT(*) 不能与列或 * 混用：本引擎不支持 GROUP BY');
    const label = counts[0].alias ?? 'COUNT(*)';
    const aggregate: CellValue[][] = [[filtered.length]];
    return { columns: [label], rows: sliceList(aggregate, statement.offset, statement.limit), error: null };
  }

  const ordered = sortRows(filtered, statement.order);
  const sliced = sliceList(ordered, statement.offset, statement.limit);

  const outColumns: string[] = [];
  const getters: Array<(row: DataRow) => CellValue> = [];
  for (const item of statement.items) {
    if (item.kind === 'star') {
      for (const column of columns) {
        outColumns.push(column);
        const name = column;
        getters.push((row) => row[name] ?? null);
      }
    } else {
      outColumns.push(item.alias ?? item.column ?? '');
      const name = item.column ?? '';
      getters.push((row) => row[name] ?? null);
    }
  }
  return { columns: outColumns, rows: sliced.map((row) => getters.map((get) => get(row))), error: null };
}

/**
 * 在内存数据集上执行一条 SELECT。
 * 绝不抛异常：任何非法输入都返回 { columns: [], rows: [], error: 中文原因 }。
 */
export function runLocalQuery(datasets: Dataset, sql: string): QueryResult {
  if (typeof sql !== 'string' || sql.trim() === '') return fail('SQL 不能为空');
  if (datasets === null || typeof datasets !== 'object' || Array.isArray(datasets)) {
    return fail(`数据集格式无效：应为「名称 → 行数组」的对象。${SQL_SUPPORTED_RANGE}`);
  }
  try {
    const tokens = tokenize(sql);
    detectUnsupported(tokens);
    const statement = new Parser(tokens).parse();
    return execute(datasets, statement);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`${detail}。${SQL_SUPPORTED_RANGE}`);
  }
}

// ── CSV ───────────────────────────────────────────────────────────────

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

/**
 * 解析 CSV：逗号分隔、首行表头、双引号字段、"" 转义、CRLF / LF / CR 行尾、BOM。
 * 纯文本解析，不做类型转换（空字段为 ''），类型推断交给调用方。
 */
export function parseCsv(text: string): CsvResult {
  if (typeof text !== 'string' || text.trim() === '') {
    return { columns: [], rows: [], error: 'CSV 内容为空：至少需要包含列名的首行' };
  }
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  let quoteClosed = false;

  const endField = () => {
    row.push(field);
    field = '';
    quoteClosed = false;
  };
  const endRow = () => {
    endField();
    records.push(row);
    row = [];
    started = false;
    quoteClosed = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (quoteClosed) {
      if (ch === ' ' || ch === '\t') continue;
      if (ch !== ',' && ch !== '\r' && ch !== '\n') {
        return { columns: [], rows: [], error: `CSV 解析失败：引号字段结束后出现多余字符「${ch}」（位置 ${i}）` };
      }
    }
    if (ch === '"' && field === '') {
      quoted = true;
      started = true;
      field = '';
      continue;
    }
    if (ch === ',') {
      started = true;
      endField();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      if (started || field !== '' || row.length > 0) endRow();
      continue;
    }
    started = true;
    field += ch;
  }
  if (quoted) {
    return { columns: [], rows: [], error: 'CSV 解析失败：存在未闭合的引号字段' };
  }
  if (field !== '' || row.length > 0 || started) endRow();
  if (records.length === 0) {
    return { columns: [], rows: [], error: 'CSV 解析失败：没有读到任何行' };
  }

  const header = (records[0] ?? []).map((name, index) => (name.trim() === '' ? `列${index + 1}` : name.trim()));
  if (header.length === 0) {
    return { columns: [], rows: [], error: 'CSV 表头为空：首行必须包含列名' };
  }
  const columns = makeUniqueHeaders(header);
  const width = columns.length;
  const rows: CellValue[][] = [];
  for (const record of records.slice(1)) {
    const normalized: CellValue[] = [];
    for (let index = 0; index < width; index += 1) normalized.push(record[index] ?? '');
    if (normalized.every((cell) => cell === '')) continue;
    rows.push(normalized);
  }
  return { columns, rows, error: null };
}
