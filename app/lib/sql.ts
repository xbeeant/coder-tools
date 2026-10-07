/**
 * SQL 美化：词法扫描 + 子句换行 + 关键字大写 + 括号缩进。
 *
 * 关键区分：
 * - 函数/类型调用括号（`count(*)`、`varchar(255)`、`now()`、`users(...)`）内部紧凑，不换行；
 * - 子查询与分组括号（`IN (SELECT ...)`、`VALUES (...)`）内部换行缩进；
 * - `.` 与 `::` 两侧不加空格，避免把 `u.id` 拆成 `u. id`；
 * - 关键字判定基于词法扫描，字符串字面量内的内容不会被当成关键字。
 */

const KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'group',
  'by',
  'having',
  'order',
  'limit',
  'offset',
  'insert',
  'into',
  'values',
  'update',
  'set',
  'delete',
  'create',
  'table',
  'view',
  'index',
  'alter',
  'add',
  'drop',
  'truncate',
  'replace',
  'merge',
  'returning',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'lateral',
  'natural',
  'on',
  'using',
  'union',
  'except',
  'intersect',
  'all',
  'distinct',
  'as',
  'with',
  'recursive',
  'and',
  'or',
  'not',
  'in',
  'exists',
  'between',
  'like',
  'ilike',
  'is',
  'null',
  'case',
  'when',
  'then',
  'else',
  'end',
  'asc',
  'desc',
  'nulls',
  'first',
  'last',
  'primary',
  'key',
  'foreign',
  'references',
  'unique',
  'check',
  'default',
  'constraint',
  'cascade',
  'restrict',
  'commit',
  'rollback',
  'transaction',
  'begin',
  'grant',
  'revoke',
  'declare',
  'over',
  'partition',
  'window',
  'explain',
  'analyze',
  'vacuum',
  'filter',
  'within',
  'rows',
  'range',
  'preceding',
  'following',
  'unbounded',
  'current',
  'row',
  'materialized',
  'cascade_',
  'only',
  'lateral_',
]);

/** 出现在行首即视为子句分界的关键字。 */
const CLAUSE_STARTERS = new Set([
  'from',
  'where',
  'group',
  'having',
  'order',
  'limit',
  'offset',
  'union',
  'except',
  'intersect',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'lateral',
  'natural',
  'values',
  'set',
  'returning',
  'window',
]);

/** 这些关键字之后的 `FROM` 属于同一子句（DELETE FROM），不另起一行。 */
const FROM_ATTACHES = new Set(['delete']);

/** 之前出现这些词时，SELECT 属于新的语句，需要另起一行。 */
const SELECT_BREAK_AFTER = new Set(['insert', 'into', 'union', 'all', 'except', 'intersect']);

const TWO_CHAR_OPS = ['<=', '>=', '<>', '!=', '||', '::'];

/**
 * 前缀记号：`:` 在 SQL 中只作命名参数（`:userId`），不是二元运算符。
 * `-` / `+` 仅在紧贴字面量时视为一元符号，否则是减法 / 加法。
 */
const NAMED_PARAM = ':';

export interface FormatSqlOptions {
  indent: string;
  uppercaseKeywords: boolean;
  lowercaseKeywords: boolean;
  newlineBeforeAndOr: boolean;
}

export const DEFAULT_SQL_OPTIONS: FormatSqlOptions = {
  indent: '  ',
  uppercaseKeywords: true,
  lowercaseKeywords: false,
  newlineBeforeAndOr: false,
};

interface BaseToken {
  /** 前面是否存在空白，用于区分函数括号与分组括号。 */
  spaceBefore: boolean;
  /** 在原文中的起止偏移，语法高亮据此原样保留空白与未识别字符。 */
  start: number;
  end: number;
}

type Token =
  | (BaseToken & { kind: 'word'; text: string; keyword: boolean })
  | (BaseToken & { kind: 'punct'; text: string })
  | (BaseToken & { kind: 'literal'; text: string })
  | (BaseToken & { kind: 'comment'; text: string; block: boolean });

const IDENT_START = /[A-Za-z_$#@-￿]/;
const IDENT_PART = /[A-Za-z0-9_$#@-￿]/;

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let spaceBefore = false;

  type TokenDraft =
    | { kind: 'word'; text: string; keyword: boolean }
    | { kind: 'punct'; text: string }
    | { kind: 'literal'; text: string }
    | { kind: 'comment'; text: string; block: boolean };

  const push = (token: TokenDraft, start: number, end: number) => {
    tokens.push({ ...token, spaceBefore, start, end });
    spaceBefore = false;
  };

  while (i < sql.length) {
    const char = sql[i];

    if (/\s/.test(char)) {
      spaceBefore = true;
      i += 1;
      continue;
    }

    // -- 行注释
    if (char === '-' && sql[i + 1] === '-') {
      let end = sql.indexOf('\n', i);
      if (end === -1) end = sql.length;
      push({ kind: 'comment', text: sql.slice(i, end).trimEnd(), block: false }, i, end);
      i = end;
      continue;
    }

    // MySQL # 行注释
    if (char === '#' && !IDENT_PART.test(char)) {
      let end = sql.indexOf('\n', i);
      if (end === -1) end = sql.length;
      push({ kind: 'comment', text: sql.slice(i, end).trimEnd(), block: false }, i, end);
      i = end;
      continue;
    }

    // /* 块注释 */
    if (char === '/' && sql[i + 1] === '*') {
      let end = sql.indexOf('*/', i + 2);
      end = end === -1 ? sql.length : end + 2;
      push({ kind: 'comment', text: sql.slice(i, end), block: true }, i, end);
      i = end;
      continue;
    }

    // 字符串字面量：'' 为转义
    if (char === "'" || char === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === char) {
          if (sql[j + 1] === char) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      push({ kind: 'literal', text: sql.slice(i, j) }, i, j);
      i = j;
      continue;
    }

    // 引用标识符：`x` / [x]
    if (char === '`' || char === '[') {
      const close = char === '`' ? '`' : ']';
      let j = sql.indexOf(close, i + 1);
      j = j === -1 ? sql.length : j + 1;
      push({ kind: 'word', text: sql.slice(i, j), keyword: false }, i, j);
      i = j;
      continue;
    }

    // 数字
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      let j = i;
      while (j < sql.length && /[0-9a-fA-FxX.eE]/.test(sql[j])) j += 1;
      while (j < sql.length && /[+-]/.test(sql[j]) && /[eE]/.test(sql[j - 1] ?? '')) {
        j += 1;
        while (j < sql.length && /[0-9]/.test(sql[j])) j += 1;
      }
      push({ kind: 'literal', text: sql.slice(i, j) }, i, j);
      i = j;
      continue;
    }

    // 标识符与关键字
    if (IDENT_START.test(char)) {
      let j = i;
      while (j < sql.length && IDENT_PART.test(sql[j])) j += 1;
      const text = sql.slice(i, j);
      push({ kind: 'word', text, keyword: KEYWORDS.has(text.toLowerCase()) }, i, j);
      i = j;
      continue;
    }

    const two = sql.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push({ kind: 'punct', text: two }, i, i + 2);
      i += 2;
      continue;
    }

    push({ kind: 'punct', text: char }, i, i + 1);
    i += 1;
  }

  return tokens;
}

export function formatSql(input: string, options: FormatSqlOptions = DEFAULT_SQL_OPTIONS): string {
  const tokens = tokenize(input);
  if (tokens.length === 0) return '';

  const renderWord = (text: string, keyword: boolean): string => {
    if (!keyword) return text;
    if (options.lowercaseKeywords) return text.toLowerCase();
    if (options.uppercaseKeywords) return text.toUpperCase();
    return text;
  };

  interface ParenFrame {
    /** 紧凑括号：内部不换行，括号紧贴内容。 */
    tight: boolean;
    /** 内部是否已写入 token。 */
    filled: boolean;
  }

  const lines: string[] = [];
  let current = '';
  const parens: ParenFrame[] = [];
  let depth = 0;
  let pendingBreak = false;
  let suppressNextSpace = false;
  /** 刚输出了 SELECT，判断是否需要把它放到新行。 */
  const prevSignificant = (index: number): Token | null => {
    for (let i = index - 1; i >= 0; i--) {
      const token = tokens[i];
      if (!token) continue;
      if (token.kind === 'comment') continue;
      return token;
    }
    return null;
  };

  const nextSignificant = (index: number): Token | null => {
    for (let i = index; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      if (token.kind === 'comment') continue;
      return token;
    }
    return null;
  };

  const flushLine = () => {
    lines.push(current);
    current = '';
  };

  const startLine = () => {
    current = options.indent.repeat(Math.max(0, depth));
    pendingBreak = false;
  };

  const ensureSeparator = () => {
    if (pendingBreak) {
      flushLine();
      startLine();
      return;
    }
    if (suppressNextSpace) {
      suppressNextSpace = false;
      return;
    }
    if (current.length > 0 && !/\s$/.test(current)) current += ' ';
  };

  const breakLine = () => {
    if (current.trim().length > 0 && !pendingBreak) pendingBreak = true;
  };

  const topFrame = (): ParenFrame | undefined => parens[parens.length - 1];

  /**
   * 输出前缀记号（负号、命名参数冒号）。
   * 运算符已写入尾随空格时直接追加，否则先补一个分隔空格，避免出现 `SELECT-1`。
   */
  const emitPrefix = (text: string) => {
    if (/\s$/.test(current) && current.length > 0) {
      current += text;
    } else {
      current = `${current.replace(/\s+$/, '')} ${text}`;
    }
    suppressNextSpace = true;
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    const previous = prevSignificant(index);
    const frame = topFrame();

    if (token.kind === 'comment') {
      if (token.block) {
        token.text.split('\n').forEach((line, i) => {
          if (i === 0) {
            if (current.length > 0 && !/\s$/.test(current) && current.trim().length > 0) current += ' ';
            current += line.trimEnd();
          } else {
            flushLine();
            current = options.indent.repeat(Math.max(0, depth)) + line.trim();
          }
        });
      } else {
        ensureSeparator();
        current += token.text;
        pendingBreak = true;
      }
      continue;
    }

    if (token.kind === 'punct') {
      if (token.text === '(') {
        const prevText = previous?.kind === 'word' ? previous.text.toLowerCase() : null;
        // 紧贴标识符的括号视为函数 / 类型 / 表定义调用
        const tight =
          !token.spaceBefore &&
          previous !== null &&
          previous.kind === 'word' &&
          !(
            previous.keyword &&
            prevText !== null &&
            (CLAUSE_STARTERS.has(prevText) || prevText === 'in' || prevText === 'exists' || prevText === 'values')
          );

        if (tight) suppressNextSpace = true;
        ensureSeparator();
        suppressNextSpace = tight;
        current += '(';
        if (tight) {
          parens.push({ tight: true, filled: false });
        } else {
          depth += 1;
          parens.push({ tight: false, filled: false });
          breakLine();
        }
        continue;
      }

      if (token.text === ')') {
        const closed = parens.pop();
        if (closed?.tight) {
          current = current.replace(/\s+$/, '');
          current += ')';
          suppressNextSpace = false;
        } else {
          if (pendingBreak) pendingBreak = false;
          if (current.trim() === '') {
            // ')' 单独成行：回到上一行末尾
            while ((lines.at(-1) ?? '').trim() === '') lines.pop();
            const last = lines.pop();
            current = last === undefined ? ')' : `${last.trimEnd()})`;
          } else {
            current += ')';
          }
          depth = Math.max(0, depth - 1);
        }
        continue;
      }

      if (token.text === '.') {
        if (pendingBreak) {
          ensureSeparator();
        } else {
          current = current.replace(/\s+$/, '');
        }
        current += '.';
        suppressNextSpace = true;
        continue;
      }

      if (token.text === ',') {
        current += ',';
        suppressNextSpace = false;
        if (frame?.tight !== true) suppressNextSpace = false;
        continue;
      }

      if (token.text === ';') {
        current += ';';
        pendingBreak = true;
        continue;
      }

      // 紧凑括号内不加空格，例如 count(*) 与 abs(-5)
      if (frame?.tight) {
        current = current.replace(/\s+$/, '');
        current += token.text;
        suppressNextSpace = true;
        continue;
      }

      // 运算符：两侧留空格，但 :: 不留
      if (token.text === '::') {
        current = current.replace(/\s+$/, '');
        current += '::';
        suppressNextSpace = true;
        continue;
      }

      if (token.text === NAMED_PARAM) {
        const next = nextSignificant(index + 1);
        if (next !== null && (next.kind === 'word' || next.kind === 'literal')) {
          emitPrefix(':');
          continue;
        }
      }

      // 一元符号：紧贴字面量，或处于表达式起始位置（关键字、运算符、括号之后）
      if (token.text === '-' || token.text === '+') {
        const next = nextSignificant(index + 1);
        const nextIsNumber = next !== null && next.kind === 'literal' && !/^0[xX]/.test(next.text);
        const atExpressionStart =
          previous === null ||
          (previous.kind === 'punct' && previous.text !== ')') ||
          (previous.kind === 'word' && previous.keyword);
        if (nextIsNumber && (!token.spaceBefore || atExpressionStart)) {
          current = current.replace(/\s+$/, '');
          current += token.text;
          suppressNextSpace = true;
          continue;
        }
      }

      current = current.replace(/\s+$/, '');
      current += ` ${token.text} `;
      suppressNextSpace = false;
      continue;
    }

    const lower = token.kind === 'word' ? token.text.toLowerCase() : '';

    // 括号刚开启：紧凑括号不额外缩进换行
    if (frame && !frame.filled) frame.filled = true;

    if (frame?.tight) {
      ensureSeparator();
      current += token.kind === 'word' ? renderWord(token.text, token.keyword) : token.text;
      continue;
    }

    if (token.kind === 'word' && token.keyword) {
      const prevText = previous?.kind === 'word' ? previous.text.toLowerCase() : null;

      if (CLAUSE_STARTERS.has(lower)) {
        const attaches = prevText !== null && FROM_ATTACHES.has(prevText);
        if (!attaches) breakLine();
        ensureSeparator();
        current += renderWord(token.text, true);
        continue;
      }

      if (lower === 'select') {
        if (previous === null || (previous.kind === 'punct' && (previous.text === ')' || previous.text === ';'))) {
          breakLine();
        } else if (prevText !== null && SELECT_BREAK_AFTER.has(prevText)) {
          breakLine();
        }
        ensureSeparator();
        current += renderWord(token.text, true);
        continue;
      }

      if (options.newlineBeforeAndOr && (lower === 'and' || lower === 'or')) {
        if (!(previous?.kind === 'punct' && (previous.text === '(' || previous.text === ','))) breakLine();
        ensureSeparator();
        current += renderWord(token.text, true);
        continue;
      }
    }

    ensureSeparator();
    current += token.kind === 'word' ? renderWord(token.text, token.keyword) : token.text;
  }

  if (current.trim().length > 0) flushLine();

  return lines
    .join('\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, i, all) => !(line.trim() === '' && all[i - 1]?.trim() === ''))
    .join('\n')
    .trim();
}

// ── 通用词法工具 ────────────────────────────────────────────────────────

export type SqlDialect = 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'oracle';

export type PlaceholderStyle = 'question' | 'dollar' | 'named' | 'at';

export interface SqlDialectInfo {
  value: SqlDialect;
  label: string;
  /** 标识符引用风格说明。 */
  quote: string;
  /** 该方言惯用的占位符写法。 */
  placeholder: string;
}

export const SQL_DIALECTS: SqlDialectInfo[] = [
  { value: 'mysql', label: 'MySQL', quote: '反引号 `name`', placeholder: '?' },
  { value: 'postgres', label: 'PostgreSQL', quote: '双引号 "name"', placeholder: '$1' },
  { value: 'sqlite', label: 'SQLite', quote: '双引号 "name"', placeholder: '?' },
  { value: 'sqlserver', label: 'SQL Server', quote: '方括号 [name]', placeholder: '@p1' },
  { value: 'oracle', label: 'Oracle', quote: '双引号 "name"', placeholder: ':name' },
];

export const DIALECT_PLACEHOLDERS: Record<SqlDialect, PlaceholderStyle> = {
  mysql: 'question',
  postgres: 'dollar',
  sqlite: 'question',
  sqlserver: 'at',
  oracle: 'named',
};

/** 去掉 `` `x` `` / ``[x]`` / ``"x"`` 的包裹符号。 */
export function unquoteIdent(text: string): string {
  const first = text[0];
  if (first === undefined) return text;
  if ((first === '`' || first === '"') && text.length > 1 && text.endsWith(first)) return text.slice(1, -1);
  if (first === '[' && text.endsWith(']')) return text.slice(1, -1);
  return text;
}

/** 按方言给标识符加引用；普通小写标识符保持原样以免引入无谓的大小写敏感问题。 */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  const safe = /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED_WORDS.has(name.toLowerCase());
  if (safe) return name;
  if (dialect === 'mysql') return `\`${name.replace(/`/g, '``')}\``;
  if (dialect === 'sqlserver') return `[${name.replace(/\]/g, ']]')}]`;
  return `"${name.replace(/"/g, '""')}"`;
}

/** 去掉字符串字面量的外层单引号，并把 `''` 还原为 `'`。 */
function unquoteLiteral(text: string): string {
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}

/** 转义为 SQL 字符串字面量（`'` 翻倍）。 */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const RESERVED_WORDS = new Set([
  'select',
  'from',
  'where',
  'table',
  'index',
  'order',
  'group',
  'user',
  'default',
  'key',
  'check',
  'column',
  'in',
  'is',
  'not',
  'and',
  'or',
  'null',
  'true',
  'false',
  'case',
  'when',
  'then',
  'else',
  'end',
  'values',
]);

function isPunct(token: Token | undefined, text: string): boolean {
  return token !== undefined && token.kind === 'punct' && token.text === text;
}

function isWord(token: Token | undefined): boolean {
  return token !== undefined && token.kind === 'word';
}

function isWordText(token: Token | undefined, word: string): boolean {
  return token !== undefined && token.kind === 'word' && token.text.toLowerCase() === word;
}

function lowerText(token: Token | undefined): string {
  return token === undefined ? '' : token.text.toLowerCase();
}

/** 从 `index` 开始的非注释、非空白 token 索引。 */
function nextSignificantIndex(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== undefined && token.kind !== 'comment') return i;
  }
  return -1;
}

/** 从 `index` 往前找最近的非注释 token 索引。 */
function prevSignificantIndex(tokens: Token[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token !== undefined && token.kind !== 'comment') return i;
  }
  return -1;
}

interface NameRead {
  /** `db.schema.table` 形式的完整名字。 */
  name: string;
  /** 名字之后的 token 索引。 */
  next: number;
}

/** 读取 `a`、`a.b`、`a . b` 形式的限定名。 */
function readQualifiedName(tokens: Token[], index: number): NameRead | null {
  const first = tokens[index];
  if (first === undefined || first.kind !== 'word' || first.keyword) return null;
  const parts = [unquoteIdent(first.text)];
  let cursor = index + 1;
  while (isPunct(tokens[cursor], '.')) {
    const part = tokens[cursor + 1];
    if (part === undefined || part.kind !== 'word' || part.keyword) break;
    parts.push(unquoteIdent(part.text));
    cursor += 2;
  }
  return { name: parts.join('.'), next: cursor };
}

// ── 语法高亮 ────────────────────────────────────────────────────────────

export type SqlTokenKind =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'identifier'
  | 'plain';

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

const OPERATOR_CHARS = '+-*/%=<>!|~^&:';

function classifyToken(token: Token): SqlTokenKind {
  if (token.kind === 'comment') return 'comment';
  if (token.kind === 'literal') {
    return token.text.startsWith("'") || token.text.startsWith('"') ? 'string' : 'number';
  }
  if (token.kind === 'word') {
    const first = token.text[0];
    if (first === '`' || first === '[' || first === '"') return 'identifier';
    return token.keyword ? 'keyword' : 'identifier';
  }
  return OPERATOR_CHARS.includes(token.text[0] ?? '') ? 'operator' : 'plain';
}

/**
 * 把 SQL 切成可渲染的 token 序列。
 * 输出 token 拼起来与原文完全一致（含空白），可直接用于高亮渲染。
 */
export function highlightSql(sql: string): SqlToken[] {
  const tokens = tokenize(sql);
  const out: SqlToken[] = [];
  let cursor = 0;

  const push = (kind: SqlTokenKind, text: string) => {
    if (text === '') return;
    const last = out.at(-1);
    if (last !== undefined && last.kind === kind) {
      last.text += text;
      return;
    }
    out.push({ kind, text });
  };

  for (const token of tokens) {
    if (token.start > cursor) push('plain', sql.slice(cursor, token.start));
    push(classifyToken(token), token.text);
    cursor = token.end;
  }
  if (cursor < sql.length) push('plain', sql.slice(cursor));

  // 标识符后紧跟左括号 → 函数调用（跳过中间的空白 token）
  for (let i = 0; i < out.length; i++) {
    const current = out[i];
    if (current?.kind !== 'identifier') continue;
    let j = i + 1;
    while (j < out.length && (out[j]?.kind ?? '') === 'plain' && (out[j]?.text ?? '').trim() === '') j += 1;
    if (out[j]?.text.startsWith('(')) current.kind = 'function';
  }
  return out;
}

/** 按 `;` 切分语句，忽略字符串与注释中的分号。 */
export function splitStatements(sql: string): string[] {
  const tokens = tokenize(sql);
  const statements: string[] = [];
  let start = 0;
  for (const token of tokens) {
    if (token.kind !== 'punct' || token.text !== ';') continue;
    const slice = sql.slice(start, token.end);
    if (slice.trim() !== '') statements.push(slice.trim());
    start = token.end;
  }
  const tail = sql.slice(start);
  if (tail.trim() !== '') statements.push(tail.trim());
  return statements;
}

/** 压缩为单行：保留原有分词间距，只删除多余空白与缩进。 */
export function minifySql(sql: string): string {
  const tokens = tokenize(sql);
  let out = '';
  for (const token of tokens) {
    if (out !== '' && token.spaceBefore) out += ' ';
    out += token.text;
    if (token.kind === 'comment' && !token.block) out += '\n';
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

// ── 建表 DDL 解析 ───────────────────────────────────────────────────────

export interface ColumnDefinition {
  name: string;
  type: string;
  /** `varchar(64)` 中的 64、`decimal(10,2)` 中的 `10,2`。 */
  length?: string;
  primaryKey: boolean;
  notNull: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  comment?: string;
  references?: { table: string; column: string };
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  primaryKey: string[];
}

const CONSTRAINT_HEADS = new Set([
  'primary',
  'unique',
  'foreign',
  'key',
  'constraint',
  'check',
  'index',
  'fulltext',
  'spatial',
  'period',
]);

const COLUMN_FLAG_WORDS = new Set([
  'not',
  'null',
  'default',
  'primary',
  'key',
  'unique',
  'references',
  'check',
  'auto_increment',
  'identity',
  'generated',
  'comment',
  'collate',
  'unsigned',
  'zerofill',
  'on',
  'using',
  'stored',
  'virtual',
]);

function firstWordIndex(tokens: Token[]): number {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== undefined && token.kind === 'word') return i;
  }
  return -1;
}

/** 返回 `openIndex` 处的 `(` 所匹配的 `)` 索引，不存在返回 -1。 */
function matchParen(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || token.kind !== 'punct') continue;
    if (token.text === '(') depth += 1;
    else if (token.text === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 括号体是否为空（仅注释），用于 `now()` 之类的零参函数改写。 */
function emptyParenEnd(tokens: Token[], openIndex: number): number {
  const close = matchParen(tokens, openIndex);
  if (close === -1) return -1;
  for (let i = openIndex + 1; i < close; i++) {
    const token = tokens[i];
    if (token !== undefined && token.kind !== 'comment') return -1;
  }
  return close;
}

function parseParenColumns(tokens: Token[], openIndex: number): string[] {
  const close = matchParen(tokens, openIndex);
  if (close === -1) return [];
  const names: string[] = [];
  let depth = 0;
  let buffer = '';
  for (let i = openIndex + 1; i < close; i++) {
    const token = tokens[i];
    if (token === undefined || token.kind === 'comment') continue;
    if (token.kind === 'punct') {
      if (token.text === '(') depth += 1;
      else if (token.text === ')') depth -= 1;
      else if (token.text === ',' && depth === 0) {
        if (buffer.trim() !== '') names.push(unquoteIdent(buffer.trim()));
        buffer = '';
        continue;
      }
    }
    buffer += token.text;
  }
  if (buffer.trim() !== '') names.push(unquoteIdent(buffer.trim()));
  return names;
}

/** 追加主键列并去重。 */
function pushPrimaryKey(table: TableDefinition, name: string): void {
  const safe = unquoteIdent(name.trim());
  if (safe === '' || table.primaryKey.includes(safe)) return;
  table.primaryKey.push(safe);
}

/** 从 from 开始找到下一个 word token 的下标，找不到返回 -1。 */
function nextWordIndex(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i];
    if (token !== undefined && token.kind === 'word') return i;
  }
  return -1;
}

function parseColumnSegment(segment: Token[], table: TableDefinition): void {
  const head = firstWordIndex(segment);
  if (head === -1) return;
  const headToken = segment[head];
  if (headToken === undefined || headToken.kind !== 'word') return;
  let headText = headToken.text.toLowerCase();

  // 具名约束：`CONSTRAINT users_pkey PRIMARY KEY (id)` / `CONSTRAINT fk_x FOREIGN KEY ...`
  if (headText === 'constraint') {
    const nameIndex = nextWordIndex(segment, head + 1);
    const afterName = nameIndex === -1 ? -1 : nextWordIndex(segment, nameIndex + 1);
    const real = afterName === -1 ? undefined : segment[afterName];
    if (real !== undefined && real.kind === 'word' && CONSTRAINT_HEADS.has(real.text.toLowerCase())) {
      headText = real.text.toLowerCase();
    }
  }

  if (CONSTRAINT_HEADS.has(headText)) {
    if (headText === 'primary') {
      const openIndex = segment.findIndex((token) => isPunct(token, '('));
      if (openIndex !== -1) {
        for (const name of parseParenColumns(segment, openIndex)) pushPrimaryKey(table, name);
      } else if (segment.some((token) => isWordText(token, 'key'))) {
        // `id INT PRIMARY KEY` 这种写在字段定义里的写法
        pushPrimaryKey(table, headToken.text);
      }
    } else if (headText === 'foreign') {
      // 表级外键：`FOREIGN KEY (col) REFERENCES table (col)` / `[CONSTRAINT name] FOREIGN KEY ...`
      const keyIndex = segment.findIndex((token) => isWordText(token, 'key'));
      const openIndex =
        keyIndex === -1
          ? segment.findIndex((token) => isPunct(token, '('))
          : segment.findIndex((token, i) => i > keyIndex && isPunct(token, '('));
      const localColumns = openIndex === -1 ? [] : parseParenColumns(segment, openIndex);
      const refIndex = segment.findIndex((token) => isWordText(token, 'references'));
      if (localColumns.length > 0 && refIndex !== -1) {
        const read = readQualifiedName(segment, refIndex + 1);
        if (read !== null) {
          let targetColumn = '';
          if (isPunct(segment[read.next], '(')) {
            const names = parseParenColumns(segment, read.next);
            targetColumn = names[0] ?? '';
          }
          for (const [index, name] of localColumns.entries()) {
            const column = table.columns.find((item) => item.name === name);
            if (column === undefined) continue;
            column.references = {
              table: read.name,
              column: targetColumn === '' ? (localColumns[index] ?? '') : targetColumn,
            };
          }
        }
      }
    }
    return;
  }

  const column: ColumnDefinition = {
    name: unquoteIdent(headToken.text),
    type: '',
    primaryKey: false,
    notNull: false,
    autoIncrement: false,
  };

  let cursor = head + 1;
  const typeWord = segment[cursor];
  if (typeWord !== undefined && typeWord.kind === 'word') {
    column.type = typeWord.text;
    cursor += 1;
    // double precision / character varying 等复合类型名
    if (isWordText(segment[cursor], 'precision') || isWordText(segment[cursor], 'varying')) {
      const second = segment[cursor];
      if (second !== undefined) column.type = `${column.type} ${second.text.toLowerCase()}`;
      cursor += 1;
    }
  } else {
    column.type = 'TEXT';
  }

  if (isPunct(segment[cursor], '(')) {
    const close = matchParen(segment, cursor);
    if (close !== -1) {
      const args: string[] = [];
      let buffer = '';
      for (let i = cursor + 1; i < close; i++) {
        const token = segment[i];
        if (token === undefined || token.kind === 'comment') continue;
        if (isPunct(token, ',')) {
          args.push(buffer.trim());
          buffer = '';
          continue;
        }
        buffer += token.text;
      }
      if (buffer.trim() !== '') args.push(buffer.trim());
      if (args.length > 0) column.length = args.join(',');
      cursor = close + 1;
    }
  }

  for (; cursor < segment.length; cursor++) {
    const token = segment[cursor];
    if (token === undefined || token.kind !== 'word') continue;
    const word = token.text.toLowerCase();

    if (word === 'not' && isWordText(segment[cursor + 1], 'null')) {
      column.notNull = true;
      cursor += 1;
      continue;
    }
    if (word === 'null') {
      column.notNull = false;
      continue;
    }
    if (word === 'unsigned' || word === 'zerofill') {
      column.type = `${column.type} ${word.toUpperCase()}`;
      continue;
    }
    if (word === 'default') {
      const parts: string[] = [];
      let j = cursor + 1;
      for (; j < segment.length; j++) {
        const next = segment[j];
        if (next === undefined || next.kind !== 'word') break;
        if (COLUMN_FLAG_WORDS.has(next.text.toLowerCase())) break;
        parts.push(next.text);
      }
      if (parts.length > 0) column.defaultValue = parts.join(' ');
      cursor = Math.max(cursor, j - 1);
      continue;
    }
    if (word === 'auto_increment') {
      column.autoIncrement = true;
      continue;
    }
    if (word === 'identity') {
      column.autoIncrement = true;
      if (isPunct(segment[cursor + 1], '(')) {
        const close = emptyParenEnd(segment, cursor + 1);
        if (close !== -1) cursor = close;
      }
      continue;
    }
    if (word === 'generated') {
      // generated always as identity / generated by default as identity
      column.autoIncrement = true;
      for (let j = cursor + 1; j < segment.length; j++) {
        if (isWordText(segment[j], 'identity')) {
          cursor = j;
          break;
        }
      }
      continue;
    }
    if (word === 'primary' && isWordText(segment[cursor + 1], 'key')) {
      column.primaryKey = true;
      pushPrimaryKey(table, column.name);
      cursor += 1;
      continue;
    }
    if (word === 'references') {
      const read = readQualifiedName(segment, cursor + 1);
      if (read !== null) {
        let target = read.name;
        let nextCursor = read.next;
        if (isPunct(segment[nextCursor], '(')) {
          const names = parseParenColumns(segment, nextCursor);
          if (names.length > 0) target = `${target}.${names[0]}`;
        }
        const dot = target.indexOf('.');
        column.references =
          dot === -1 ? { table: target, column: '' } : { table: target.slice(0, dot), column: target.slice(dot + 1) };
        nextCursor = read.next;
        cursor = Math.max(cursor, nextCursor - 1);
      }
      continue;
    }
    if (word === 'comment') {
      const next = segment[cursor + 1];
      if (next !== undefined && next.kind === 'literal') {
        column.comment = unquoteLiteral(next.text);
        cursor += 1;
      }
      continue;
    }
    if (word === 'check') {
      const openIndex = cursor + 1;
      if (isPunct(segment[openIndex], '(')) {
        const close = matchParen(segment, openIndex);
        if (close !== -1) cursor = close;
      }
      continue;
    }
    if (word === 'collate') {
      cursor += 1;
    }
  }

  table.columns.push(column);
}

function parseTableBody(tokens: Token[], start: number, end: number, name: string): TableDefinition {
  const table: TableDefinition = { name, columns: [], primaryKey: [] };
  const segments: Token[][] = [];
  let depth = 0;
  let segmentStart = start;
  for (let i = start; i < end; i++) {
    const token = tokens[i];
    if (token === undefined || token.kind === 'comment') continue;
    if (token.kind === 'punct') {
      if (token.text === '(') depth += 1;
      else if (token.text === ')') depth -= 1;
      else if (token.text === ',' && depth === 0) {
        segments.push(tokens.slice(segmentStart, i));
        segmentStart = i + 1;
      }
    }
  }
  segments.push(tokens.slice(segmentStart, end));
  for (const segment of segments) parseColumnSegment(segment, table);
  return table;
}

/**
 * 轻量 CREATE TABLE 解析：识别表名、字段、长度、主键、默认值、自增与 REFERENCES。
 * 不支持存储过程、生成列表达式与复杂约束，`ON UPDATE CURRENT_TIMESTAMP` 会被忽略。
 */
export function parseCreateTableDefinitions(sql: string): TableDefinition[] {
  const tokens = tokenize(sql);
  const tables: TableDefinition[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || token.kind !== 'word' || token.text.toLowerCase() !== 'create') continue;

    let cursor = nextSignificantIndex(tokens, i + 1);
    let sawTable = false;
    while (cursor !== -1) {
      const current = tokens[cursor];
      if (current === undefined) break;
      if (current.kind === 'punct') break;
      if (current.kind === 'word' && current.text.toLowerCase() === 'table') {
        sawTable = true;
        cursor += 1;
        break;
      }
      cursor = nextSignificantIndex(tokens, cursor + 1);
    }
    if (!sawTable || cursor === -1) continue;

    // 跳过 CREATE TABLE IF NOT EXISTS name
    let nameCursor = cursor;
    for (;;) {
      const filler = tokens[nameCursor];
      if (filler === undefined || filler.kind !== 'word') break;
      if (!CREATE_FILLERS.has(filler.text.toLowerCase())) break;
      nameCursor += 1;
    }

    const name = readQualifiedName(tokens, nameCursor);
    if (name === null) continue;

    let openIndex = name.next;
    while (openIndex < tokens.length && !isPunct(tokens[openIndex], '(')) openIndex += 1;
    if (openIndex >= tokens.length) continue;
    const closeIndex = matchParen(tokens, openIndex);
    if (closeIndex === -1) continue;

    tables.push(parseTableBody(tokens, openIndex + 1, closeIndex, name.name));
    i = closeIndex;
  }
  return tables;
}

// ── 语句分析 ────────────────────────────────────────────────────────────

export interface SqlStatementInfo {
  sql: string;
  /** 语句类型，如 SELECT / INSERT / CREATE TABLE。 */
  type: string;
  tables: string[];
  columns: string[];
  whereColumns: string[];
  joins: string[];
  functions: string[];
  /** 嵌套子查询的最大层数。 */
  subqueryDepth: number;
  starSelect: boolean;
  hasWhere: boolean;
}

export interface SqlHazard {
  level: 'warn' | 'danger';
  label: string;
  detail: string;
}

export interface SqlAnalysis {
  statements: SqlStatementInfo[];
  /** 语句类型去重列表。 */
  types: string[];
  tables: string[];
  columns: string[];
  whereColumns: string[];
  joins: string[];
  functions: string[];
  maxSubqueryDepth: number;
  hazards: SqlHazard[];
}

const TYPE_WORDS = new Set([
  'int',
  'integer',
  'bigint',
  'smallint',
  'tinyint',
  'mediumint',
  'serial',
  'bigserial',
  'decimal',
  'numeric',
  'float',
  'double',
  'real',
  'money',
  'bit',
  'bool',
  'boolean',
  'char',
  'varchar',
  'nchar',
  'nvarchar',
  'text',
  'ntext',
  'tinytext',
  'mediumtext',
  'clob',
  'date',
  'time',
  'datetime',
  'datetime2',
  'timestamp',
  'timestamptz',
  'blob',
  'tinyblob',
  'mediumblob',
  'longblob',
  'binary',
  'varbinary',
  'uuid',
  'json',
  'jsonb',
  'xml',
  'enum',
  'set',
  'interval',
  'bytea',
  'inet',
]);

const CREATE_FILLERS = new Set([
  'if',
  'not',
  'exists',
  'or',
  'replace',
  'temp',
  'temporary',
  'global',
  'local',
  'unlogged',
  'only',
]);

/** 这些词不改变当前子句归属（AND / OR / IN 等表达式连接词）。 */
const TRANSPARENT_KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'in',
  'like',
  'ilike',
  'is',
  'between',
  'exists',
  'any',
  'some',
  'all',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
  'asc',
  'desc',
  'null',
  'collate',
  'similar',
  'escape',
]);

const REGION_WORDS = new Set([
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'union',
  'except',
  'intersect',
  'values',
  'set',
  'returning',
  'window',
  'on',
  'using',
  'insert',
  'delete',
  'with',
  'over',
  'partition',
  'explain',
]);

interface ClauseFrame {
  clause: string;
  hasSelect: boolean;
  table: string;
}

/** 分析单条 SQL：类型、涉及表、字段、条件列、JOIN、函数、子查询层数与 SELECT * 使用。 */
export function analyzeStatement(sql: string): SqlStatementInfo {
  const tokens = tokenize(sql);
  const tables: string[] = [];
  const columns: string[] = [];
  const whereColumns: string[] = [];
  const joins: string[] = [];
  const functions: string[] = [];
  const aliases = new Set<string>();
  const frames: ClauseFrame[] = [{ clause: 'unknown', hasSelect: false, table: '' }];

  let clause = 'unknown';
  let headWord = '';
  let sawTableKeyword = false;
  let pendingTableIntro = false;
  let pendingJoin = false;
  let expectAlias = false;
  let hasWhere = false;
  let starSelect = false;
  let subqueryDepth = 0;

  const topFrame = (): ClauseFrame => frames.at(-1) ?? frames[0];
  const remember = (list: string[], value: string) => {
    if (value !== '' && !list.includes(value)) list.push(value);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;

    if (token.kind === 'punct') {
      if (token.text === '(') {
        frames.push({ clause: 'unknown', hasSelect: false, table: '' });
        pendingTableIntro = false;
        continue;
      }
      if (token.text === ')') {
        frames.pop();
        if (frames.length === 0) frames.push({ clause: 'unknown', hasSelect: false, table: '' });
        continue;
      }
      if (token.text === '*' && topFrame().clause === 'select') {
        const prevIndex = prevSignificantIndex(tokens, i);
        const prev = prevIndex === -1 ? undefined : tokens[prevIndex];
        const isQualifier = isWord(prev) && isPunct(tokens[prevIndex + 1], '.');
        const isSelectStar = isWordText(prev, 'select') || isPunct(prev, ',');
        if (isQualifier || isSelectStar) starSelect = true;
      }
      if (token.text === ',' && topFrame().clause === 'from') pendingTableIntro = true;
      else if (token.text === ',') pendingTableIntro = false;
      continue;
    }

    if (token.kind === 'comment') continue;

    if (token.kind === 'literal') continue;

    const lower = token.text.toLowerCase();
    if (headWord === '') headWord = token.text.toUpperCase();

    if (token.keyword) {
      if (sawTableKeyword && pendingTableIntro && CREATE_FILLERS.has(lower)) continue;
      // AND / OR / IN 等连接词不改变子句归属
      if (TRANSPARENT_KEYWORDS.has(lower)) continue;

      if (lower === 'select') {
        clause = 'select';
        topFrame().hasSelect = true;
        subqueryDepth = Math.max(subqueryDepth, frames.length - 1);
        pendingTableIntro = false;
        expectAlias = false;
        continue;
      }
      if (lower === 'as') {
        expectAlias = true;
        clause = 'other';
        continue;
      }
      if (lower === 'from' || lower === 'into' || lower === 'update' || lower === 'table') {
        clause = 'from';
        pendingTableIntro = true;
        pendingJoin = false;
        expectAlias = false;
        if (lower === 'table' && (headWord === 'CREATE' || headWord === 'ALTER' || headWord === 'DROP')) {
          sawTableKeyword = true;
        }
        continue;
      }
      if (
        lower === 'join' ||
        lower === 'inner' ||
        lower === 'left' ||
        lower === 'right' ||
        lower === 'full' ||
        lower === 'cross' ||
        lower === 'natural' ||
        lower === 'lateral'
      ) {
        clause = 'from';
        pendingTableIntro = true;
        pendingJoin = true;
        expectAlias = false;
        continue;
      }
      if (lower === 'where') {
        clause = 'where';
        hasWhere = true;
        pendingTableIntro = false;
        expectAlias = false;
        continue;
      }
      clause = REGION_WORDS.has(lower) ? lower : 'other';
      pendingTableIntro = false;
      expectAlias = false;
      continue;
    }

    // 非关键字：可能是表名、别名、字段或函数
    if (expectAlias) {
      aliases.add(lower);
      expectAlias = false;
      continue;
    }

    if (pendingTableIntro && !TYPE_WORDS.has(lower)) {
      const read = readQualifiedName(tokens, i);
      if (read !== null) {
        remember(tables, read.name);
        if (pendingJoin) remember(joins, read.name);
        topFrame().table = read.name;
        pendingTableIntro = false;
        pendingJoin = false;
        i = read.next - 1;
        // 裸别名：from users u
        const nextIndex = nextSignificantIndex(tokens, read.next);
        const next = nextIndex === -1 ? undefined : tokens[nextIndex];
        if (next !== undefined && next.kind === 'word' && !next.keyword && !TYPE_WORDS.has(lowerText(next))) {
          aliases.add(next.text.toLowerCase());
          i = nextIndex;
        }
        continue;
      }
    }

    if (isPunct(tokens[i + 1], '.')) {
      aliases.add(lower);
      i += 1;
      continue;
    }

    if (isPunct(tokens[i + 1], '(')) {
      if (!TYPE_WORDS.has(lower)) remember(functions, lower);
      i += 1;
      continue;
    }

    if (clause === 'where') remember(whereColumns, token.text);
    if (clause !== 'unknown' && clause !== 'from' && !tables.includes(token.text)) remember(columns, token.text);
  }

  const isDdl = headWord === 'CREATE' || headWord === 'ALTER' || headWord === 'DROP' || headWord === 'TRUNCATE';
  let type = headWord === '' ? 'UNKNOWN' : headWord;
  if (isDdl && sawTableKeyword) {
    type = `${headWord} TABLE`;
    const parsed = parseCreateTableDefinitions(sql)[0];
    if (parsed !== undefined) for (const column of parsed.columns) remember(columns, column.name);
  }

  if (isDdl) {
    columns.length = 0;
    for (const column of parseCreateTableDefinitions(sql)[0]?.columns ?? []) remember(columns, column.name);
    functions.length = 0;
    whereColumns.length = 0;
  }

  return {
    sql,
    type,
    tables,
    columns,
    whereColumns,
    joins,
    functions,
    subqueryDepth,
    starSelect,
    hasWhere,
  };
}

/** 扫描引号 / 反引号 / 方括号 / 块注释是否闭合。 */
export function findUnterminatedQuote(sql: string): string | null {
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    if (char === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      if (nl === -1) return null;
      i = nl;
      continue;
    }
    if (char === '#') {
      const nl = sql.indexOf('\n', i);
      if (nl === -1) return null;
      i = nl;
      continue;
    }
    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return '块注释 /* 未闭合';
      i = end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      const quote = char;
      const close = quote === '[' ? ']' : quote;
      let j = i + 1;
      let closed = false;
      while (j < sql.length) {
        if (quote !== "'" && sql[j] === '\\') {
          j += 2;
          continue;
        }
        if (sql[j] === close) {
          if (quote !== '[' && sql[j + 1] === close) {
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) {
        if (quote === '`') return '反引号（标识符引用）未闭合';
        if (quote === '[') return '方括号（标识符引用）未闭合';
        return '字符串引号未闭合';
      }
      i = j;
      continue;
    }
    i += 1;
  }
  return null;
}

/** 危险操作与注入风险检测。 */
export function detectRisks(sql: string): SqlHazard[] {
  const risks: SqlHazard[] = [];
  const statements = splitStatements(sql).map((item) => analyzeStatement(item));

  for (const statement of statements) {
    const upper = statement.type.toUpperCase();
    if (upper.startsWith('DROP')) {
      risks.push({ level: 'danger', label: 'DROP', detail: '删除表、视图或索引，数据不可恢复。' });
    }
    if (upper === 'TRUNCATE TABLE') {
      risks.push({ level: 'danger', label: 'TRUNCATE', detail: '清空整表数据，通常不可回滚。' });
    }
    if (upper === 'UPDATE' && !statement.hasWhere) {
      risks.push({ level: 'danger', label: 'UPDATE 无 WHERE', detail: '会更新全部行，请补条件或事务保护。' });
    }
    if (upper === 'DELETE' && !statement.hasWhere) {
      risks.push({ level: 'danger', label: 'DELETE 无 WHERE', detail: '会删除全部行，请补条件或事务保护。' });
    }
    if (upper === 'GRANT' || upper === 'REVOKE') {
      risks.push({ level: 'warn', label: '权限变更', detail: '涉及授权操作，注意最小权限原则。' });
    }
    if (statement.starSelect) {
      risks.push({
        level: 'warn',
        label: 'SELECT *',
        detail: '读取全部列：可能拖慢查询，且表结构变化时会出错。',
      });
    }
    if (upper === 'UPDATE' || upper === 'DELETE') {
      risks.push({
        level: 'warn',
        label: '写操作',
        detail: '建议先在事务中执行并确认影响行数。',
      });
    }
  }

  const unterminated = findUnterminatedQuote(sql);
  if (unterminated !== null) {
    risks.push({ level: 'danger', label: '引号不闭合', detail: unterminated });
  }

  const concat = /(['"`])\s*(\|\||\+)|(\|\||\+)\s*(['"`])/.test(
    sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''),
  );
  if (concat) {
    risks.push({
      level: 'danger',
      label: '字符串拼接',
      detail: '字符串与 + 或 || 相邻，典型 SQL 注入写法，请改用参数化查询。',
    });
  }

  if (/\bxp_cmdshell\b|\bsp_executesql\b/i.test(sql)) {
    risks.push({ level: 'danger', label: '执行外部命令', detail: '包含 T-SQL 扩展存储过程调用。' });
  }
  if (/\b(execute|exec)\s+(immediate|@|\()/i.test(sql)) {
    risks.push({ level: 'warn', label: '动态执行', detail: '动态 SQL 需重点关注参数拼接。' });
  }
  if (/--[^\n]*$/.test(sql.split('\n')[0] ?? '') && /['"]/.test(sql)) {
    risks.push({ level: 'warn', label: '行注释截断', detail: '行注释可能吃掉后续条件，构造语句时常见。' });
  }

  const seen = new Set<string>();
  return risks.filter((risk) => {
    const key = `${risk.level}:${risk.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 汇总整段 SQL 的结构信息与风险。 */
export function analyzeSql(sql: string): SqlAnalysis {
  const statements = splitStatements(sql).map((item) => analyzeStatement(item));
  const types: string[] = [];
  const tables: string[] = [];
  const columns: string[] = [];
  const whereColumns: string[] = [];
  const joins: string[] = [];
  const functions: string[] = [];
  let maxSubqueryDepth = 0;

  const remember = (list: string[], value: string) => {
    if (value !== '' && !list.includes(value)) list.push(value);
  };

  for (const statement of statements) {
    remember(types, statement.type);
    for (const table of statement.tables) remember(tables, table);
    for (const column of statement.columns) remember(columns, column);
    for (const column of statement.whereColumns) remember(whereColumns, column);
    for (const join of statement.joins) remember(joins, join);
    for (const fn of statement.functions) remember(functions, fn);
    maxSubqueryDepth = Math.max(maxSubqueryDepth, statement.subqueryDepth);
  }

  return {
    statements,
    types,
    tables,
    columns,
    whereColumns,
    joins,
    functions,
    maxSubqueryDepth,
    hazards: detectRisks(sql),
  };
}

// ── SELECT * 展开 ───────────────────────────────────────────────────────

/** 表名（小写）到字段列表的映射，取自同页的 CREATE TABLE 或手填。 */
export type ColumnDictionary = Record<string, string[]>;

export interface ExpandStarResult {
  sql: string;
  /** 已成功展开的表与字段。 */
  expanded: { table: string; columns: string[] }[];
  /** 找不到定义的表。 */
  missing: string[];
}

/** 推断 SQL 使用的标识符引用风格，用于展开后的字段保持一致。 */
export function detectQuoteStyle(sql: string): SqlDialect {
  if (sql.includes('`')) return 'mysql';
  if (sql.includes('[')) return 'sqlserver';
  return 'postgres';
}

/**
 * 把 `SELECT *` / `SELECT t.*` 展开成实际字段列表。
 * `columns` 找不到对应表时保持原样，并在 `missing` 中列出。
 */
export function expandStarSelect(sql: string, columns: ColumnDictionary): ExpandStarResult {
  const tokens = tokenize(sql);
  const lookup = new Map<string, string[]>();
  for (const [table, list] of Object.entries(columns)) {
    lookup.set(table.toLowerCase(), list);
    const dot = table.lastIndexOf('.');
    if (dot !== -1) lookup.set(table.slice(dot + 1).toLowerCase(), list);
  }

  const dialect = detectQuoteStyle(sql);
  const frameTable = new Map<string, string>();
  const starFrames: { index: number; key: string }[] = [];
  const expanded: { table: string; columns: string[] }[] = [];
  const missing: string[] = [];

  let frameId = 0;
  let segment = 0;
  const stack: number[] = [0];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.kind === 'punct') {
      if (token.text === '(') {
        frameId += 1;
        stack.push(frameId);
        continue;
      }
      if (token.text === ')') {
        stack.pop();
        continue;
      }
      // 分号开启新语句，避免后一条语句的 FROM 覆盖前一条的表
      if (token.text === ';' && stack.length === 1) segment += 1;
      if (token.text === '*') starFrames.push({ index: i, key: `${segment}:${stack.at(-1) ?? 0}` });
      continue;
    }
    if (token.kind !== 'word') continue;
    const lower = token.text.toLowerCase();
    if (lower === 'from' || lower === 'into' || lower === 'update' || lower === 'table') {
      const read = readQualifiedName(tokens, i + 1);
      if (read !== null) {
        frameTable.set(`${segment}:${stack.at(-1) ?? 0}`, read.name);
        i = read.next - 1;
      }
    }
  }

  if (starFrames.length === 0) return { sql, expanded, missing };

  const replacements = new Map<number, string>();
  for (const star of starFrames) {
    const table = frameTable.get(star.key) ?? '';
    const list = lookup.get(table.toLowerCase());
    if (list === undefined || list.length === 0) {
      if (table !== '' && !missing.includes(table)) missing.push(table);
      continue;
    }
    replacements.set(star.index, list.map((name) => quoteIdent(name, dialect)).join(', '));
    const existing = expanded.find((item) => item.table === table);
    if (existing === undefined) expanded.push({ table, columns: list });
  }
  if (replacements.size === 0) return { sql, expanded, missing };

  let out = '';
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.start > cursor) out += sql.slice(cursor, token.start);
    out += replacements.get(i) ?? token.text;
    cursor = token.end;
  }
  out += sql.slice(cursor);
  return { sql: out, expanded, missing };
}

// ── 参数化改写 ──────────────────────────────────────────────────────────

export interface ParameterizeOptions {
  style?: PlaceholderStyle;
  /** 是否把数字字面量也换成占位符。 */
  numbers?: boolean;
}

export interface ParameterizeResult {
  sql: string;
  /** 按占位符出现顺序给出原始字面量。 */
  params: string[];
}

/** 把字符串 / 数字字面量换成占位符，相同字面量复用同一个参数。 */
export function parameterizeSql(sql: string, options: ParameterizeOptions = {}): ParameterizeResult {
  const style = options.style ?? 'question';
  const includeNumbers = options.numbers ?? false;
  const tokens = tokenize(sql);
  const params: string[] = [];
  const assigned = new Map<string, string>();
  const usedNames = new Set<string>();

  const placeholder = (literal: string): string => {
    const existing = assigned.get(literal);
    if (existing !== undefined) return existing;
    const slot = params.length;
    params.push(literal);
    let text: string;
    switch (style) {
      case 'question':
        text = '?';
        break;
      case 'dollar':
        text = `$${slot + 1}`;
        break;
      case 'at':
        text = `@p${slot + 1}`;
        break;
      default: {
        const base = unquoteIdent(literal)
          .replace(/[^A-Za-z0-9_]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase();
        let name = base === '' ? `p${slot + 1}` : base;
        let counter = 2;
        while (usedNames.has(name)) {
          name = `${base === '' ? 'p' : base}_${counter}`;
          counter += 1;
        }
        usedNames.add(name);
        text = `:${name}`;
      }
    }
    assigned.set(literal, text);
    return text;
  };

  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) out += sql.slice(cursor, token.start);
    cursor = token.end;

    if (token.kind === 'literal') {
      const isString = token.text.startsWith("'") || token.text.startsWith('"');
      if (isString || includeNumbers) {
        out += placeholder(token.text);
        continue;
      }
      out += token.text;
      continue;
    }
    if (token.kind === 'punct' && token.text === '?') {
      const slot = params.length;
      params.push('');
      out +=
        style === 'question'
          ? '?'
          : style === 'dollar'
            ? `$${slot + 1}`
            : style === 'at'
              ? `@p${slot + 1}`
              : `:p${slot + 1}`;
      continue;
    }
    out += token.text;
  }
  out += sql.slice(cursor);
  return { sql: out, params };
}

// ── 方言转换 ────────────────────────────────────────────────────────────

interface SimpleToken {
  text: string;
  spaceBefore: boolean;
  line: boolean;
}

function toSimple(tokens: Token[]): SimpleToken[] {
  return tokens.map((token) => ({
    text: token.text,
    spaceBefore: token.spaceBefore,
    line: token.kind === 'comment' && !token.block,
  }));
}

function shouldJoin(prev: SimpleToken | undefined, next: SimpleToken): boolean {
  if (prev === undefined) return false;
  const prevText = prev.text;
  if (prevText.endsWith('(') || prevText === '.' || prevText === '::') return false;
  if (next.text === ')' || next.text === ',' || next.text === ';' || next.text === '.' || next.text === '::') {
    return false;
  }
  return true;
}

function renderSimple(tokens: SimpleToken[]): string {
  let out = '';
  let prev: SimpleToken | undefined;
  let freshLine = false;
  for (const token of tokens) {
    if (token.text === '') continue;
    if (freshLine) {
      out = out.replace(/[ \t]+$/, '');
      out += '\n';
      freshLine = false;
    } else if ((token.spaceBefore || out.endsWith(' ')) && shouldJoin(prev, token)) {
      out += ' ';
    }
    out += token.text;
    if (token.line) freshLine = true;
    prev = token;
  }
  return out.replace(/[ \t]+$/gm, '').trim();
}

interface FunctionRename {
  to: string;
  /** 目标写法不带括号（如 `now()` → `CURRENT_TIMESTAMP`）。 */
  dropParens?: boolean;
  note?: string;
}

/** 目标方言下常见的函数改名表（未列出的函数保持原样）。 */
const FUNCTION_RENAMES: Record<SqlDialect, Record<string, FunctionRename>> = {
  mysql: {},
  postgres: {
    IFNULL: { to: 'COALESCE' },
    NVL: { to: 'COALESCE' },
    NOW: { to: 'CURRENT_TIMESTAMP', dropParens: true },
    CURDATE: { to: 'CURRENT_DATE', dropParens: true },
    CURTIME: { to: 'CURRENT_TIME', dropParens: true },
    RAND: { to: 'RANDOM', dropParens: true },
    GROUP_CONCAT: { to: 'STRING_AGG', note: 'STRING_AGG 需要第二个参数 ORDER BY' },
    LOCATE: { to: 'STRPOS' },
    DATE_FORMAT: { to: 'TO_CHAR', note: 'MySQL 格式串需改为 PG 模板' },
  },
  sqlite: {
    NOW: { to: 'CURRENT_TIMESTAMP', dropParens: true },
    CURDATE: { to: 'CURRENT_DATE', dropParens: true },
    RAND: { to: 'RANDOM', dropParens: true },
  },
  sqlserver: {
    IFNULL: { to: 'ISNULL' },
    NVL: { to: 'ISNULL' },
    NOW: { to: 'GETDATE' },
    CURDATE: { to: 'GETDATE' },
    RAND: { to: 'NEWID', dropParens: true },
    GROUP_CONCAT: { to: 'STRING_AGG', note: 'STRING_AGG 需要第二个参数 WITHIN GROUP' },
    UNIX_TIMESTAMP: { to: 'DATEDIFF', note: '需自行补 from_unixtime 语义' },
  },
  oracle: {
    IFNULL: { to: 'NVL' },
    NOW: { to: 'SYSTIMESTAMP', dropParens: true },
    GROUP_CONCAT: { to: 'LISTAGG' },
  },
};

interface KeywordRename {
  /** 目标写法，按词拆分输出。 */
  to: string[];
  /** 紧随其后的空括号组需要一并丢弃。 */
  dropEmptyParens?: boolean;
  note?: string;
}

const KEYWORD_RENAMES: Record<SqlDialect, Record<string, KeywordRename>> = {
  mysql: { IDENTITY: { to: ['AUTO_INCREMENT'], dropEmptyParens: true } },
  postgres: {
    AUTO_INCREMENT: { to: ['SERIAL'] },
    IDENTITY: { to: ['SERIAL'], dropEmptyParens: true },
    UNSIGNED: { to: [], note: 'PostgreSQL 没有 UNSIGNED，已移除' },
  },
  sqlite: {
    AUTO_INCREMENT: { to: ['AUTOINCREMENT'], note: 'SQLite 需要 INTEGER PRIMARY KEY AUTOINCREMENT 组合' },
    UNSIGNED: { to: [], note: 'SQLite 没有 UNSIGNED，已移除' },
  },
  sqlserver: {
    AUTO_INCREMENT: { to: ['IDENTITY'], dropEmptyParens: true, note: '建议写成 IDENTITY(1,1)' },
    UNSIGNED: { to: [], note: 'SQL Server 没有 UNSIGNED，已移除' },
  },
  oracle: {
    AUTO_INCREMENT: { to: ['GENERATED', 'BY', 'DEFAULT', 'AS', 'IDENTITY'] },
    IDENTITY: { to: [], note: 'Oracle 请使用 GENERATED BY DEFAULT AS IDENTITY' },
    UNSIGNED: { to: [], note: 'Oracle 没有 UNSIGNED，已移除' },
  },
};

const MYSQL_TABLE_OPTIONS = new Set([
  'ENGINE',
  'AUTO_INCREMENT',
  'DEFAULT',
  'CHARSET',
  'CHARACTER',
  'COLLATE',
  'ROW_FORMAT',
  'COMMENT',
  'DELAY_KEY_WRITE',
]);

export interface DialectConvertResult {
  sql: string;
  /** 已做的改写说明。 */
  notes: string[];
  /** 需要人工复核的语法差异。 */
  warnings: string[];
}

function requote(text: string, target: SqlDialect): string {
  const name = unquoteIdent(text);
  if (name === text) return text;
  if (target === 'mysql') return `\`${name}\``;
  if (target === 'sqlserver') return `[${name}]`;
  return `"${name}"`;
}

/**
 * 启发式方言改写：引号风格、常见函数与关键字映射、占位符、LIMIT 写法与
 * MySQL 表选项清理。属于文本级改写，不保证语义等价，务必人工复核。
 */
export function convertSqlDialect(sql: string, target: SqlDialect): DialectConvertResult {
  const tokens = tokenize(sql);
  const source: SimpleToken[] = toSimple(tokens);
  const notes: string[] = [];
  const warnings: string[] = [];

  // 1. 保留 DELETE / UPDATE 之类的语句类型，按 token 重排
  const out: SimpleToken[] = [];
  const funcRenames = FUNCTION_RENAMES[target];
  const keywordRenames = KEYWORD_RENAMES[target];
  const placeholderStyle = DIALECT_PLACEHOLDERS[target];
  let placeholderIndex = 0;

  // MySQL 表选项：CREATE TABLE 右括号之后到分号之间的引擎 / 字符集设置
  const dropUntil = new Set<number>();
  for (let i = 0; i < source.length; i++) {
    const token = source[i];
    if (token === undefined) continue;
    if (token.text.toUpperCase() !== 'CREATE') continue;
    let cursor = i + 1;
    while (cursor < source.length && source[cursor]?.text.toUpperCase() !== 'TABLE') cursor += 1;
    if (cursor >= source.length) continue;
    let depth = 0;
    let open = -1;
    for (let j = cursor + 1; j < source.length; j++) {
      const current = source[j];
      if (current === undefined) continue;
      if (current.text === '(') {
        depth += 1;
        if (open === -1) open = j;
      } else if (current.text === ')') {
        depth -= 1;
        if (depth === 0) {
          const next = source[j + 1];
          if (next !== undefined && MYSQL_TABLE_OPTIONS.has(next.text.toUpperCase()) && target !== 'mysql') {
            for (let k = j + 1; k < source.length; k++) {
              const tail = source[k];
              if (tail === undefined || tail.text === ';') break;
              dropUntil.add(k);
            }
            notes.push('已移除 MySQL 专有的表选项（ENGINE / CHARSET / COLLATE 等）');
          }
          break;
        }
      }
    }
  }

  for (let i = 0; i < source.length; i++) {
    const token = source[i];
    if (token === undefined) continue;
    if (dropUntil.has(i)) continue;

    const upper = token.text.toUpperCase();

    // 标识符引用风格
    if (token.text.startsWith('`') || token.text.startsWith('[')) {
      const next = requote(token.text, target);
      if (next !== token.text) notes.push(`标识符引用 ${token.text} → ${next}`);
      out.push({ ...token, text: next });
      continue;
    }

    // MySQL 冲突写入的简化改写
    if (upper === 'ON' && isWordTextSimple(source[i + 1], 'DUPLICATE') && isWordTextSimple(source[i + 2], 'KEY')) {
      if (target === 'postgres' || target === 'sqlite') {
        out.push({ text: 'ON', spaceBefore: true, line: false });
        out.push({ text: 'CONFLICT', spaceBefore: true, line: false });
        out.push({ text: 'DO', spaceBefore: true, line: false });
        out.push({ text: 'NOTHING', spaceBefore: true, line: false });
        warnings.push('ON DUPLICATE KEY UPDATE 简化为 ON CONFLICT DO NOTHING，冲突更新逻辑需自行补写');
        i += 3;
        continue;
      }
      out.push(token);
      continue;
    }

    // SQL Server TOP n → LIMIT n
    if (upper === 'TOP' && target !== 'sqlserver') {
      const next = source[i + 1];
      if (next !== undefined && /^[0-9]/.test(next.text)) {
        out.push({ text: 'LIMIT', spaceBefore: token.spaceBefore, line: false });
        out.push(next);
        warnings.push('TOP n 已改为 LIMIT n，Oracle 仍需改写为 FETCH FIRST');
        i += 1;
        continue;
      }
    }

    // MySQL `LIMIT a, b` → `LIMIT b OFFSET a`
    if (upper === 'LIMIT' && (target === 'postgres' || target === 'sqlite' || target === 'oracle')) {
      const first = source[i + 1];
      const comma = source[i + 2];
      const second = source[i + 3];
      if (
        first !== undefined &&
        comma !== undefined &&
        comma.text === ',' &&
        second !== undefined &&
        /^[0-9]/.test(first.text) &&
        /^[0-9]/.test(second.text)
      ) {
        out.push({ text: 'LIMIT', spaceBefore: token.spaceBefore, line: false });
        out.push({ text: second.text, spaceBefore: true, line: false });
        out.push({ text: 'OFFSET', spaceBefore: true, line: false });
        out.push({ text: first.text, spaceBefore: true, line: false });
        warnings.push('MySQL 的 LIMIT 偏移写法已转换为标准 LIMIT … OFFSET');
        i += 3;
        continue;
      }
    }

    // 占位符风格
    if (token.text === '?' && target !== 'mysql') {
      placeholderIndex += 1;
      out.push({
        text:
          placeholderStyle === 'dollar'
            ? `$${placeholderIndex}`
            : placeholderStyle === 'at'
              ? `@p${placeholderIndex}`
              : placeholderStyle === 'named'
                ? `:p${placeholderIndex}`
                : '?',
        spaceBefore: token.spaceBefore,
        line: false,
      });
      continue;
    }

    // 函数改名
    const funcRename = funcRenames[upper];
    if (funcRename !== undefined && source[i + 1]?.text === '(') {
      if (funcRename.dropParens === true) {
        const close = emptyParenEndSimple(source, i + 1);
        if (close !== -1) {
          out.push({ text: funcRename.to, spaceBefore: token.spaceBefore, line: false });
          if (funcRename.note !== undefined) notes.push(`${token.text} → ${funcRename.to}：${funcRename.note}`);
          i = close;
          continue;
        }
      }
      if (funcRename.note !== undefined) notes.push(`${token.text} → ${funcRename.to}：${funcRename.note}`);
      out.push({ ...token, text: funcRename.to });
      continue;
    }

    // 关键字 / 类型改名
    const keywordRename = keywordRenames[upper];
    if (keywordRename !== undefined) {
      if (keywordRename.to.length === 0) {
        notes.push(keywordRename.note ?? `已移除 ${token.text}`);
        continue;
      }
      keywordRename.to.forEach((word, order) => {
        out.push({ text: word, spaceBefore: order === 0 ? token.spaceBefore : true, line: false });
      });
      if (keywordRename.dropEmptyParens === true && source[i + 1]?.text === '(') {
        const close = emptyParenEndSimple(source, i + 1);
        if (close !== -1) i = close;
      }
      if (keywordRename.note !== undefined) notes.push(keywordRename.note);
      continue;
    }

    out.push(token);
  }

  if (target === 'sqlserver' && /(\|\|)/.test(renderSimple(out))) {
    warnings.push('SQL Server 不支持 || 字符串拼接，请改写为 CONCAT(a, b)');
  }
  if (target === 'oracle') {
    warnings.push('Oracle 不支持 LIMIT / OFFSET，请改写为 ROWNUM 或 FETCH FIRST … ROWS ONLY');
  }
  if (target !== 'mysql' && /\b(if|ifnull|date_format|from_unixtime|unix_timestamp)\s*\(/i.test(renderSimple(out))) {
    warnings.push('存在 MySQL 特有函数，请人工替换');
  }

  return { sql: formatSql(renderSimple(out), DEFAULT_SQL_OPTIONS), notes, warnings };
}

function isWordTextSimple(token: SimpleToken | undefined, word: string): boolean {
  return token !== undefined && !token.line && token.text.toLowerCase() === word;
}

function emptyParenEndSimple(tokens: SimpleToken[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.text === '(') depth += 1;
    else if (token.text === ')') {
      depth -= 1;
      if (depth === 0) {
        for (let j = openIndex + 1; j < i; j++) {
          const inner = tokens[j];
          if (inner !== undefined && !inner.line && inner.text.trim() !== '') return -1;
        }
        return i;
      }
    }
  }
  return -1;
}
