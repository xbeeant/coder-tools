import { Check, ChevronDown, Copy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/file';
import { Button } from './button';
import { copyText } from './result';
import { cn } from './utils';

/** 支持简单着色的语言类型；`text` 表示不高亮。 */
export type CodeLanguage =
  | 'text'
  | 'shell'
  | 'ini'
  | 'yaml'
  | 'json'
  | 'toml'
  | 'dockerfile'
  | 'lua'
  | 'javascript'
  | 'python'
  | 'go'
  | 'java'
  | 'sql'
  | 'xml'
  | 'diff'
  | 'conf'
  | 'ruby'
  | 'powershell'
  | 'typescript'
  | 'markdown'
  | 'html'
  | 'css'
  | 'php'
  | 'rust'
  | 'csharp';

const SHELL_KEYWORDS = [
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'do',
  'done',
  'case',
  'esac',
  'function',
  'return',
  'export',
  'local',
  'source',
  'alias',
  'set',
  'unset',
  'echo',
  'cd',
  'exit',
  'sudo',
  'eval',
  'exec',
  'trap',
  'shift',
  'read',
  'test',
  'true',
  'false',
  'in',
  'select',
  'time',
  'coproc',
];

const JS_KEYWORDS = [
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'class',
  'extends',
  'new',
  'this',
  'typeof',
  'instanceof',
  'async',
  'await',
  'try',
  'catch',
  'finally',
  'throw',
  'import',
  'export',
  'from',
  'default',
  'delete',
  'in',
  'of',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'yield',
  'super',
  'static',
  'get',
  'set',
];

const PY_KEYWORDS = [
  'def',
  'class',
  'return',
  'if',
  'elif',
  'else',
  'for',
  'while',
  'in',
  'not',
  'and',
  'or',
  'is',
  'import',
  'from',
  'as',
  'try',
  'except',
  'finally',
  'raise',
  'with',
  'lambda',
  'yield',
  'global',
  'nonlocal',
  'pass',
  'break',
  'continue',
  'assert',
  'del',
  'async',
  'await',
  'True',
  'False',
  'None',
];

const GO_KEYWORDS = [
  'package',
  'import',
  'func',
  'return',
  'if',
  'else',
  'for',
  'range',
  'go',
  'defer',
  'chan',
  'map',
  'struct',
  'interface',
  'var',
  'const',
  'type',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'select',
  'nil',
  'true',
  'false',
  'string',
  'int',
  'int64',
  'error',
];

const JAVA_KEYWORDS = [
  'public',
  'private',
  'protected',
  'class',
  'interface',
  'extends',
  'implements',
  'static',
  'final',
  'void',
  'int',
  'long',
  'double',
  'boolean',
  'String',
  'return',
  'if',
  'else',
  'for',
  'while',
  'new',
  'this',
  'super',
  'import',
  'package',
  'try',
  'catch',
  'finally',
  'throw',
  'throws',
  'null',
  'true',
  'false',
];

const SQL_KEYWORDS = [
  'select',
  'from',
  'where',
  'group',
  'by',
  'order',
  'having',
  'limit',
  'offset',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'on',
  'as',
  'and',
  'or',
  'not',
  'in',
  'exists',
  'between',
  'like',
  'ilike',
  'union',
  'all',
  'distinct',
  'insert',
  'into',
  'values',
  'update',
  'set',
  'delete',
  'create',
  'table',
  'index',
  'view',
  'alter',
  'drop',
  'with',
  'case',
  'when',
  'then',
  'else',
  'end',
  'asc',
  'desc',
  'null',
  'true',
  'false',
];

const YAML_KEYWORDS = ['true', 'false', 'null', 'yes', 'no', 'on', 'off'];

const LANG_SPEC: Record<CodeLanguage, { comments: string[]; keywords: string[] }> = {
  text: { comments: [], keywords: [] },
  shell: { comments: ['#'], keywords: SHELL_KEYWORDS },
  ini: { comments: [';', '#'], keywords: [] },
  conf: { comments: ['#'], keywords: [] },
  yaml: { comments: ['#'], keywords: YAML_KEYWORDS },
  json: { comments: [], keywords: ['true', 'false', 'null'] },
  toml: { comments: ['#'], keywords: ['true', 'false'] },
  dockerfile: {
    comments: ['#'],
    keywords: [
      'FROM',
      'RUN',
      'CMD',
      'LABEL',
      'EXPOSE',
      'ENV',
      'ADD',
      'COPY',
      'ENTRYPOINT',
      'VOLUME',
      'USER',
      'WORKDIR',
      'ARG',
      'ONBUILD',
      'STOPSIGNAL',
      'HEALTHCHECK',
      'SHELL',
      'AS',
    ],
  },
  lua: {
    comments: ['--'],
    keywords: [
      'local',
      'function',
      'end',
      'if',
      'then',
      'else',
      'elseif',
      'for',
      'while',
      'do',
      'repeat',
      'until',
      'return',
      'require',
      'nil',
      'true',
      'false',
      'and',
      'or',
      'not',
    ],
  },
  javascript: { comments: ['//'], keywords: JS_KEYWORDS },
  python: { comments: ['#'], keywords: PY_KEYWORDS },
  go: { comments: ['//'], keywords: GO_KEYWORDS },
  java: { comments: ['//'], keywords: JAVA_KEYWORDS },
  sql: { comments: ['--'], keywords: SQL_KEYWORDS },
  xml: { comments: ['<!--'], keywords: [] },
  diff: { comments: [], keywords: [] },
  ruby: {
    comments: ['#'],
    keywords: [
      'def',
      'end',
      'if',
      'else',
      'elsif',
      'unless',
      'while',
      'do',
      'return',
      'require',
      'module',
      'class',
      'self',
      'nil',
      'true',
      'false',
      'and',
      'or',
      'not',
      'yield',
      'lambda',
      'local',
    ],
  },
  powershell: {
    comments: ['#'],
    keywords: [
      'param',
      'function',
      'if',
      'else',
      'elseif',
      'foreach',
      'for',
      'while',
      'return',
      'Write-Host',
      'Get-',
      'Set-',
      'New-',
      'Remove-',
      'Select-Object',
      'Where-Object',
      'foreach',
      'begin',
      'process',
      'end',
      'try',
      'catch',
      'finally',
      'throw',
    ],
  },
  typescript: { comments: ['//'], keywords: JS_KEYWORDS },
  markdown: { comments: [], keywords: [] },
  html: { comments: ['<!--'], keywords: [] },
  css: { comments: [], keywords: [] },
  php: {
    comments: ['//', '#'],
    keywords: [
      'function',
      'class',
      'public',
      'private',
      'protected',
      'return',
      'if',
      'else',
      'foreach',
      'for',
      'while',
      'echo',
      'new',
      'use',
      'namespace',
      'array',
      'true',
      'false',
      'null',
    ],
  },
  rust: {
    comments: ['//'],
    keywords: [
      'fn',
      'let',
      'mut',
      'pub',
      'struct',
      'enum',
      'impl',
      'trait',
      'match',
      'if',
      'else',
      'for',
      'while',
      'loop',
      'return',
      'use',
      'mod',
      'const',
      'static',
      'where',
      'async',
      'await',
      'move',
    ],
  },
  csharp: {
    comments: ['//'],
    keywords: [
      'using',
      'namespace',
      'class',
      'public',
      'private',
      'protected',
      'static',
      'void',
      'string',
      'int',
      'bool',
      'var',
      'if',
      'else',
      'foreach',
      'for',
      'while',
      'return',
      'new',
      'async',
      'await',
      'null',
      'true',
      'false',
    ],
  },
};

type TokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword';

interface Token {
  text: string;
  kind: TokenKind;
}

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: '',
  comment: 'italic text-muted-foreground',
  string: 'text-emerald-600 dark:text-emerald-400',
  number: 'text-amber-600 dark:text-amber-400',
  keyword: 'text-sky-600 dark:text-sky-400',
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_.-]/;
const DIGIT = /[0-9]/;

/** 逐行扫描的简易分词器：只区分注释、字符串、数字与关键字，不追求完整语法高亮。 */
function tokenizeLine(line: string, spec: { comments: string[]; keywords: string[] }): Token[] {
  const keywords = new Set(spec.keywords);
  const tokens: Token[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer !== '') {
      tokens.push({ text: buffer, kind: 'plain' });
      buffer = '';
    }
  };

  while (i < line.length) {
    const char = line[i];

    if (char === '"' || char === "'" || char === '`') {
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '\\') {
          end += 2;
          continue;
        }
        if (line[end] === char) {
          end += 1;
          break;
        }
        end += 1;
      }
      flush();
      tokens.push({ text: line.slice(i, Math.min(end, line.length)), kind: 'string' });
      i = Math.min(end, line.length);
      continue;
    }

    const comment = spec.comments.find((prefix) => line.startsWith(prefix, i));
    if (comment) {
      flush();
      if (comment === '<!--') {
        const close = line.indexOf('-->', i);
        const end = close === -1 ? line.length : close + 3;
        tokens.push({ text: line.slice(i, end), kind: 'comment' });
        i = end;
      } else {
        tokens.push({ text: line.slice(i), kind: 'comment' });
        i = line.length;
      }
      continue;
    }

    if (IDENT_START.test(char)) {
      let end = i;
      while (end < line.length && IDENT_PART.test(line[end])) end += 1;
      const word = line.slice(i, end);
      flush();
      tokens.push({ text: word, kind: keywords.has(word) ? 'keyword' : 'plain' });
      i = end;
      continue;
    }

    if (DIGIT.test(char)) {
      let end = i;
      while (end < line.length && /[0-9._a-fA-FxX-]/.test(line[end])) end += 1;
      flush();
      tokens.push({ text: line.slice(i, end), kind: 'number' });
      i = end;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flush();
  return tokens;
}

function tokenize(code: string, language: CodeLanguage): Token[][] {
  const spec = LANG_SPEC[language] ?? LANG_SPEC.text;
  if (spec.comments.length === 0 && spec.keywords.length === 0) {
    return code.split('\n').map((line) => [{ text: line, kind: 'plain' as const }]);
  }
  return code.split('\n').map((line) => tokenizeLine(line, spec));
}

export interface CodeBlockProps {
  /** 要展示的纯文本内容。 */
  code: string;
  language?: CodeLanguage;
  /** 顶部标题，同时作为下载按钮的默认文件名。 */
  title?: string;
  /** 下载文件名，含扩展名，例如 alacritty.toml。 */
  filename?: string;
  mime?: string;
  lineNumbers?: boolean;
  startLine?: number;
  /** 超过该行数时折叠并提供「展开」按钮；0 表示不折叠。 */
  maxLines?: number;
  maxHeight?: string;
  wrap?: boolean;
  className?: string;
  actions?: React.ReactNode;
}

/**
 * 命令 / 脚本 / 配置片段展示块：等宽字体、复制、下载、可选行号与简易高亮。
 * 纯展示组件，不做任何网络请求。
 */
export function CodeBlock({
  code,
  language = 'text',
  title,
  filename,
  mime,
  lineNumbers = false,
  startLine = 1,
  maxLines = 0,
  maxHeight,
  wrap = false,
  className,
  actions,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const lines = code.split('\n');
  const tokenLines = useMemo(() => tokenize(code, language), [code, language]);
  const collapsed = maxLines > 0 && lines.length > maxLines && !expanded;
  const visible = useMemo(
    () =>
      (collapsed ? lines.slice(0, maxLines) : lines).map((text, index) => ({
        key: `${startLine + index}-${text.slice(0, 12)}`,
        number: startLine + index,
        tokens: tokenLines[startLine + index - 1] ?? [],
      })),
    [collapsed, lines, maxLines, startLine, tokenLines],
  );
  const gutterWidth = lineNumbers ? String(lines.length + startLine - 1).length : 0;

  const handleCopy = () => {
    copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-md border bg-muted/20', className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b px-2 py-1">
        <span className="truncate font-mono text-[10px] text-muted-foreground">{title ?? language}</span>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            aria-label={copied ? '已复制到剪贴板' : '复制代码'}
            onClick={handleCopy}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? '已复制' : '复制'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            aria-label={filename ? `下载 ${filename}` : '下载代码'}
            disabled={code === ''}
            onClick={() => downloadText(filename ?? 'snippet.txt', code, mime)}
          >
            <Download className="size-3" />
            下载
          </Button>
        </div>
      </div>
      <pre
        className={cn(
          'overflow-auto p-2 font-mono text-[11px] leading-relaxed',
          maxHeight,
          wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
        )}
      >
        <code>
          {visible.map((line) => (
            <span key={line.key} className="flex min-w-max">
              {lineNumbers && (
                <span
                  aria-hidden
                  className="mr-3 shrink-0 select-none text-right text-muted-foreground/60 tabular-nums"
                  style={{ width: `${Math.max(2, gutterWidth)}ch` }}
                >
                  {line.number}
                </span>
              )}
              <span className="min-w-0 flex-1">
                {line.tokens.length > 0
                  ? line.tokens.map((token, tokenIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: 分词结果无稳定标识
                      <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                        {token.text}
                      </span>
                    ))
                  : ' '}
              </span>
            </span>
          ))}
        </code>
      </pre>
      {collapsed && (
        <Button
          size="sm"
          variant="ghost"
          className="mx-2 mb-1 h-6 self-start text-[10px]"
          aria-label={`展开剩余 ${lines.length - maxLines} 行`}
          onClick={() => setExpanded(true)}
        >
          <ChevronDown className="size-3" />
          展开剩余 {lines.length - maxLines} 行
        </Button>
      )}
    </div>
  );
}
