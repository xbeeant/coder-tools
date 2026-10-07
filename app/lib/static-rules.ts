/**
 * 静态代码分析的纯逻辑层：基于正则的行级检查，覆盖安全隐患、代码质量与性能三类规则。
 *
 * 明确的局限：这里没有 AST，也不会做跨语句的数据流分析。
 * 它能抓到的是「肉眼容易漏、但改起来很机械」的模式，类型系统与真正的 linter 仍然更可靠。
 */

export type RuleGroup = 'security' | 'quality' | 'performance';

export type RuleSeverity = 'error' | 'warn' | 'info';

export type Lang = 'js' | 'python' | 'auto';

export interface StaticRule {
  id: string;
  group: RuleGroup;
  severity: RuleSeverity;
  lang: 'js' | 'python' | 'any';
  pattern: RegExp;
  /** 命中后展示的问题描述。 */
  message: string;
  /** 修复建议。 */
  fix: string;
  /** 行内注释里出现这些词就跳过本行（避免示例代码误报）。 */
  skipIfCommentHas?: string;
  /**
   * 规则本身要匹配字符串字面量（import、密钥、SQL 拼接等）。
   * 这类规则只在「去注释、留字符串」的文本上跑，避免把文档里的示例也报出来。
   */
  scanStrings?: boolean;
  /**
   * 需要向后看几行才能判断（例如「循环体里有 await」）。
   * 命中位置仍报在当前行，所以只影响精度不影响定位。
   */
  lookAhead?: number;
}

export interface Issue {
  ruleId: string;
  group: RuleGroup;
  severity: RuleSeverity;
  line: number;
  column: number;
  text: string;
  message: string;
  fix: string;
  ignored: boolean;
}

export interface AnalyzeOptions {
  groups: RuleGroup[];
  severities: RuleSeverity[];
  /** 是否尊重 `analyze-disable-next-line` / `analyze-disable` 注释。 */
  respectDisableComment: boolean;
  /** 是否同时扫描注释与字符串（默认关闭，因为它们更常是文档与示例）。 */
  includeComments: boolean;
  maxLineLength: number;
  lang: Lang;
}

export interface AnalyzeResult {
  lang: 'js' | 'python';
  issues: Issue[];
  stats: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    scannedRules: number;
    bySeverity: Record<RuleSeverity, number>;
    byGroup: Record<RuleGroup, number>;
  };
}

export const SEVERITY_META: Record<RuleSeverity, { label: string; tone: 'danger' | 'warn' | 'info'; weight: number }> =
  {
    error: { label: '高危', tone: 'danger', weight: 3 },
    warn: { label: '建议', tone: 'warn', weight: 2 },
    info: { label: '提示', tone: 'info', weight: 1 },
  };

export const GROUP_META: Record<RuleGroup, { label: string; desc: string }> = {
  security: { label: '安全隐患', desc: '可能造成注入、泄露或权限绕过' },
  quality: { label: '代码质量', desc: '容易出错的写法与遗留物' },
  performance: { label: '性能', desc: '在高频路径上会拖慢执行的写法' },
};

export const DEFAULT_OPTIONS: AnalyzeOptions = {
  groups: ['security', 'quality', 'performance'],
  severities: ['error', 'warn', 'info'],
  respectDisableComment: true,
  includeComments: false,
  maxLineLength: 140,
  lang: 'auto',
};

const SECRET_RE =
  /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*['"][^'"]{6,}['"]/i;

/** 逐行把注释与字符串内容替换成等长空格，避免规则命中文档和示例。 */
export function maskLine(line: string, lang: 'js' | 'python', keepStrings: boolean): string {
  const out = line.split('');
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    const next = line[i + 1];
    if (quote !== null) {
      if (char === '\\') {
        out[i] = ' ';
        if (i + 1 < line.length) out[i + 1] = ' ';
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      if (!keepStrings) out[i] = ' ';
      continue;
    }
    if (lang === 'js' && char === '/' && next === '/') {
      for (let j = i; j < line.length; j += 1) out[j] = ' ';
      break;
    }
    if (lang === 'js' && char === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      continue;
    }
    if (lang === 'python' && char === '#') {
      for (let j = i; j < line.length; j += 1) out[j] = ' ';
      break;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
    }
  }
  return out.join('');
}

/** 只把注释抹掉，保留字符串内容。 */
export function blankComments(line: string, lang: 'js' | 'python'): string {
  const out = line.split('');
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    const next = line[i + 1];
    if (quote !== null) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (lang === 'python' && char === '#') {
      for (let j = i; j < line.length; j += 1) out[j] = ' ';
      break;
    }
    if (lang === 'js' && char === '/' && next === '/') {
      for (let j = i; j < line.length; j += 1) out[j] = ' ';
      break;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
    }
  }
  return out.join('');
}

export const JS_RULES: StaticRule[] = [
  // 安全隐患
  {
    id: 'js-no-eval',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /(?<![.\w])eval\s*\(/,
    message: '使用了 eval，等于把字符串当代码执行',
    fix: '改成 JSON.parse，或用显式的映射表替代动态执行',
  },
  {
    id: 'js-new-function',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /new\s+Function\s*\(/,
    message: 'new Function 同样能执行任意字符串',
    fix: '改成查表或显式分支',
  },
  {
    id: 'js-inner-html',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /\.innerHTML\s*(=|\+=)/,
    message: '直接写 innerHTML，未转义内容会造成 XSS',
    fix: '改用 textContent；确需渲染 HTML 时用 DOMPurify 之类的库清洗',
  },
  {
    id: 'js-dangerously-set-inner-html',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /dangerouslySetInnerHTML/,
    message: 'React 里绕过转义渲染 HTML',
    fix: '优先用 JSX 文本；必须渲染富文本时先消毒',
  },
  {
    id: 'js-document-write',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /document\.write(?:ln)?\s*\(/,
    message: 'document.write 会阻塞解析，且是 XSS 入口',
    fix: '改用 DOM API 或 innerHTML/textContent',
  },
  {
    id: 'js-hardcoded-secret',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: SECRET_RE,
    message: '源码里出现了硬编码的密钥或口令',
    fix: '移到环境变量或配置中心，并轮换已经泄露的凭据',
    scanStrings: true,
  },
  {
    id: 'js-child-process',
    group: 'security',
    severity: 'error',
    lang: 'js',
    pattern: /child_process|\bexecSync\s*\(|\bexec\s*\(|\bspawnSync\s*\(/,
    message: '导入或调用了子进程执行，拼接字符串容易被命令注入',
    fix: '用 execFile/spawn 传参数数组，不要拼 shell 字符串',
    scanStrings: true,
  },
  {
    id: 'js-sql-concat',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /(?:query|execute)\s*\(\s*[`'"].*(?:\+\s*\w+|\$\{)/,
    message: 'SQL 里拼接了变量，存在注入风险',
    fix: '改成参数化查询 / 预编译语句',
    scanStrings: true,
  },
  {
    id: 'js-insecure-http',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/,
    message: '硬编码了明文 http 地址',
    fix: '改成 https，或改成同源相对路径',
    scanStrings: true,
  },
  {
    id: 'js-token-in-storage',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"][^'"]*(?:token|jwt|session)[^'"]*['"]/i,
    message: '把登录凭据存进 localStorage，XSS 时可被直接读取',
    fix: '改用 httpOnly Cookie，或只存短期可丢失的展示态数据',
    scanStrings: true,
  },
  {
    id: 'js-wildcard-cors',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/,
    message: 'CORS 允许任意来源',
    fix: '改成白名单，带凭据时不要使用通配符',
    scanStrings: true,
  },
  {
    id: 'js-math-random-token',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /Math\.random\s*\(\s*\)[\s\S]{0,40}(?:token|nonce|secret|password|otp|code)/i,
    message: '用 Math.random 生成安全相关随机值',
    fix: '改用 crypto.getRandomValues 或 crypto.randomUUID',
  },
  {
    id: 'js-window-open',
    group: 'security',
    severity: 'warn',
    lang: 'js',
    pattern: /window\.open\s*\(/,
    message: 'window.open 可能被用来做钓鱼跳转',
    fix: '加 noopener，或改用 location 赋值',
  },

  // 代码质量
  {
    id: 'js-var',
    group: 'quality',
    severity: 'warn',
    lang: 'js',
    pattern: /(^|[^\w$.])var\s+[A-Za-z_$]/,
    message: 'var 有函数级作用域与提升问题',
    fix: '改成 const，确实需要重新赋值时用 let',
  },
  {
    id: 'js-loose-equality',
    group: 'quality',
    severity: 'warn',
    lang: 'js',
    pattern: /[^=!<>]==[^=]|[^!]!=[^=]/,
    message: '使用了宽松相等，会发生隐式类型转换',
    fix: '改成 === / !==',
  },
  {
    id: 'js-empty-catch',
    group: 'quality',
    severity: 'error',
    lang: 'js',
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    message: '空的 catch 会把错误静默吞掉',
    fix: '至少记录日志，或在注释里写明为什么可以忽略',
  },
  {
    id: 'js-debugger',
    group: 'quality',
    severity: 'warn',
    lang: 'js',
    pattern: /^\s*debugger\s*;?\s*$/,
    message: '遗留的 debugger 语句会在开发者工具里中断执行',
    fix: '删掉',
  },
  {
    id: 'js-console',
    group: 'quality',
    severity: 'info',
    lang: 'js',
    pattern: /\bconsole\.(?:log|debug|dir)\s*\(/,
    message: '调试日志会被打进生产包',
    fix: '删掉或接到统一日志库，并按环境关闭',
  },
  {
    id: 'js-todo',
    group: 'quality',
    severity: 'info',
    lang: 'js',
    pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/,
    message: '遗留标记',
    fix: '补上任务单号，或顺手解决掉',
  },
  {
    id: 'js-parseint-no-radix',
    group: 'quality',
    severity: 'warn',
    lang: 'js',
    pattern: /parseInt\s*\([^,)]*\)/,
    message: 'parseInt 缺第二个参数，遇到 "08" 会被按 8 进制解析',
    fix: '写成 parseInt(value, 10)',
  },
  {
    id: 'js-sort-mutate',
    group: 'quality',
    severity: 'info',
    lang: 'js',
    pattern: /\.sort\s*\(/,
    message: 'Array.sort 原地修改并返回同一数组',
    fix: '需要保留原数组时先 [...arr].sort()',
  },

  // 性能
  {
    id: 'js-await-in-loop',
    group: 'performance',
    severity: 'warn',
    lang: 'js',
    pattern: /\bfor\s*\([\s\S]{0,240}\bawait\b/,
    message: '循环体里串行 await，耗时会逐个累加',
    fix: '改成 Promise.all / Promise.allSettled 并发执行',
    lookAhead: 3,
  },
  {
    id: 'js-await-foreach',
    group: 'performance',
    severity: 'warn',
    lang: 'js',
    pattern: /for\s*\(\s*(?:const|let|var)\s+[\w$]+\s+of\b[\s\S]{0,80}\bawait\b/,
    message: 'for...of 里 await 会让循环串行',
    fix: '改成先收集 Promise 再 Promise.all',
  },
  {
    id: 'js-regex-in-loop',
    group: 'performance',
    severity: 'info',
    lang: 'js',
    pattern: /for\s*\([\s\S]{0,240}\/[a-z]*\/[gimsuy]+/,
    message: '循环体内新建正则字面量，每次迭代都会重新编译',
    fix: '把正则提到循环外面',
    lookAhead: 2,
  },
  {
    id: 'js-json-clone',
    group: 'performance',
    severity: 'info',
    lang: 'js',
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    message: '用 JSON 做深拷贝，丢失类型且大对象很慢',
    fix: '用 structuredClone，或手写拷贝函数',
  },
  {
    id: 'js-new-array',
    group: 'performance',
    severity: 'info',
    lang: 'js',
    pattern: /new\s+Array\s*\(/,
    message: 'new Array(n) 产生稀疏数组',
    fix: '用 Array.from({ length: n }) 或 [...Array(n).keys()]',
  },
];

export const PYTHON_RULES: StaticRule[] = [
  {
    id: 'py-eval',
    group: 'security',
    severity: 'error',
    lang: 'python',
    pattern: /(?<![.\w])(?:eval|exec)\s*\(/,
    message: 'eval / exec 会执行任意代码',
    fix: '改成 ast.literal_eval，或显式分派',
  },
  {
    id: 'py-pickle',
    group: 'security',
    severity: 'error',
    lang: 'python',
    pattern: /\b(?:pickle|cPickle|dill)\.loads?\s*\(/,
    message: '反序列化不可信数据可导致远程代码执行',
    fix: '改用 json；确需对象序列化时校验签名',
  },
  {
    id: 'py-shell',
    group: 'security',
    severity: 'error',
    lang: 'python',
    pattern: /os\.system\s*\(|subprocess\.[a-z_]+\([^)]*shell\s*=\s*True/,
    message: 'shell=True 拼接命令容易被注入',
    fix: '传参数列表，shell=False',
  },
  {
    id: 'py-hardcoded-secret',
    group: 'security',
    severity: 'error',
    lang: 'python',
    pattern: SECRET_RE,
    message: '硬编码的密钥或口令',
    fix: '改用环境变量或密钥管理服务，并轮换',
    scanStrings: true,
  },
  {
    id: 'py-verify-false',
    group: 'security',
    severity: 'error',
    lang: 'python',
    pattern: /verify\s*=\s*False|check_hostname\s*=\s*False/,
    message: '关闭证书校验会让中间人攻击变得可行',
    fix: '指定正确的 CA bundle；自签名证书也要 pin',
    scanStrings: true,
  },
  {
    id: 'py-sql-format',
    group: 'security',
    severity: 'warn',
    lang: 'python',
    pattern: /(?:execute|executemany)\s*\(\s*f['"]/,
    message: '用 f-string 拼 SQL 存在注入风险',
    fix: '用参数占位：execute("... where id=%s", (id,))',
    scanStrings: true,
  },
  {
    id: 'py-bare-except',
    group: 'quality',
    severity: 'warn',
    lang: 'python',
    pattern: /^\s*except\s*:/,
    message: '裸 except 会吞掉 KeyboardInterrupt 与系统退出',
    fix: '改成 except Exception as e 并记录',
  },
  {
    id: 'py-eq-none',
    group: 'quality',
    severity: 'warn',
    lang: 'python',
    pattern: /[!=]=\s*None\b/,
    message: '判断 None 应该用 is / is not',
    fix: '改成 value is None',
  },
  {
    id: 'py-mutable-default',
    group: 'quality',
    severity: 'error',
    lang: 'python',
    pattern: /def\s+\w+\s*\([^)]*=\s*(?:\[\]|\{\}|set\(\))/,
    message: '可变对象作默认参数会在多次调用间共享',
    fix: '改成 None 并在函数体内初始化',
  },
  {
    id: 'py-assert-runtime',
    group: 'quality',
    severity: 'warn',
    lang: 'python',
    pattern: /^\s*assert\b/,
    message: 'assert 在 python -O 下会被移除，不能用于运行时校验',
    fix: '改成显式 if + raise',
  },
  {
    id: 'py-todo',
    group: 'quality',
    severity: 'info',
    lang: 'python',
    pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/,
    message: '遗留标记',
    fix: '补上任务单号，或解决掉',
  },
  {
    id: 'py-print',
    group: 'quality',
    severity: 'info',
    lang: 'python',
    pattern: /^\s*print\s*\(/,
    message: 'print 调试输出',
    fix: '改用 logging，方便控制级别',
  },
  {
    id: 'py-str-join-loop',
    group: 'performance',
    severity: 'warn',
    lang: 'python',
    pattern: /^\s*(?:for|while)\b[\s\S]{0,200}\w+\s*(?:\+=|=\s*\w+\s*\+)\s*['"]/,
    message: '循环里用字符串相加是 O(n²)',
    fix: '收集到列表后 "".join()',
  },
];

export const ALL_RULES: StaticRule[] = [...JS_RULES, ...PYTHON_RULES];

/** 粗略判断语言：Python 特征更明确，其余按 JS 处理。 */
export function detectLanguage(code: string): 'js' | 'python' {
  const pyScore =
    (code.match(/^\s*(?:def|class)\s+\w+/gm) ?? []).length * 2 +
    (code.match(/^\s*(?:import|from)\s+\w+/gm) ?? []).length +
    (code.match(/\bself\b/g) ?? []).length +
    (code.match(/__\w+__/g) ?? []).length;
  const jsScore =
    (code.match(/\b(?:const|let|function|=>|import\s+[\w{*])/g) ?? []).length +
    (code.match(/\bexport\s+(?:default|const|function)/g) ?? []).length +
    (code.match(/;\s*$/gm) ?? []).length / 4;
  return pyScore > jsScore ? 'python' : 'js';
}

function isCommentLine(line: string, lang: 'js' | 'python'): boolean {
  const trimmed = line.trim();
  if (lang === 'python') return trimmed.startsWith('#');
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** 扫描代码，返回按行列排序的问题列表。 */
export function analyze(code: string, options: AnalyzeOptions): AnalyzeResult {
  const lang = options.lang === 'auto' ? detectLanguage(code) : options.lang;
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const rules = ALL_RULES.filter((rule) => {
    if (rule.lang !== 'any' && rule.lang !== lang) return false;
    if (!options.groups.includes(rule.group)) return false;
    if (!options.severities.includes(rule.severity)) return false;
    return true;
  });

  const issues: Issue[] = [];
  let codeLines = 0;
  let commentLines = 0;
  let disabledUntil = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] as string;
    const lineNo = index + 1;
    if (isCommentLine(raw, lang)) commentLines += 1;
    else if (raw.trim() !== '') codeLines += 1;

    if (options.respectDisableComment) {
      if (/(?:analyze|eslint|biome)-disable-next-line/.test(raw)) disabledUntil = lineNo + 1;
      if (/analyze-disable\s*$/.test(raw)) disabledUntil = Number.POSITIVE_INFINITY;
      if (/analyze-enable\s*$/.test(raw)) disabledUntil = 0;
    }
    const lineDisabled = disabledUntil >= lineNo;

    for (const rule of rules) {
      // lookAhead 的规则要把后面几行拼进来一起判断。
      const tail =
        rule.lookAhead === undefined
          ? ''
          : `\n${lines
              .slice(index + 1, index + 1 + rule.lookAhead)
              .map((line) => (options.includeComments ? line : maskLine(line, lang, false)))
              .join('\n')}`;
      const tailComments =
        rule.lookAhead === undefined
          ? ''
          : `\n${lines
              .slice(index + 1, index + 1 + rule.lookAhead)
              .map((line) => (options.includeComments ? line : blankComments(line, lang)))
              .join('\n')}`;
      const masked = options.includeComments ? raw : maskLine(raw, lang, false);
      const noComments = options.includeComments ? raw : blankComments(raw, lang);
      const scanText = `${rule.scanStrings === true ? noComments : masked}${tailComments}`;
      const match = rule.pattern.exec(scanText);
      if (match === null) continue;
      void tail;
      // 「注释里就写清 ignore」的规则不报。
      if (rule.skipIfCommentHas !== undefined && raw.includes(rule.skipIfCommentHas)) continue;
      issues.push({
        ruleId: rule.id,
        group: rule.group,
        severity: rule.severity,
        line: lineNo,
        // 用了 lookAhead 时命中位置可能落在后面的行，列号收敛到当前行内。
        column: Math.min(match.index ?? 0, Math.max(0, raw.length - 1)) + 1,
        text: raw.trim().slice(0, 160),
        message: rule.message,
        fix: rule.fix,
        ignored: lineDisabled,
      });
      break;
    }

    if (options.maxLineLength > 0 && raw.length > options.maxLineLength && !lineDisabled) {
      const group: RuleGroup = 'quality';
      if (options.groups.includes(group) && options.severities.includes('info')) {
        issues.push({
          ruleId: 'generic-long-line',
          group,
          severity: 'info',
          line: lineNo,
          column: options.maxLineLength + 1,
          text: raw.trim().slice(0, 80),
          message: `这一行有 ${raw.length} 个字符，超过 ${options.maxLineLength} 的上限`,
          fix: '拆成多行，或把长字符串抽成常量',
          ignored: false,
        });
      }
    }
  }

  issues.sort((a, b) => a.line - b.line || a.column - b.column);
  const bySeverity: Record<RuleSeverity, number> = { error: 0, warn: 0, info: 0 };
  const byGroup: Record<RuleGroup, number> = { security: 0, quality: 0, performance: 0 };
  for (const item of issues) {
    if (item.ignored) continue;
    bySeverity[item.severity] += 1;
    byGroup[item.group] += 1;
  }

  return {
    lang,
    issues,
    stats: {
      totalLines: lines.length,
      codeLines,
      commentLines,
      scannedRules: rules.length,
      bySeverity,
      byGroup,
    },
  };
}

/** 只保留命中的问题（按等级与分类过滤），忽略行会被剔除。 */
export function filterIssues(
  issues: Issue[],
  filter: { severities: RuleSeverity[]; groups: RuleGroup[]; onlyActive: boolean },
): Issue[] {
  return issues.filter(
    (item) =>
      filter.severities.includes(item.severity) &&
      filter.groups.includes(item.group) &&
      (!filter.onlyActive || !item.ignored),
  );
}

/** 分数：按等级扣分，最低 0 分，方便对比改动前后。 */
export function scoreOf(stats: AnalyzeResult['stats']): number {
  const score = 100 - stats.bySeverity.error * 12 - stats.bySeverity.warn * 5 - stats.bySeverity.info * 1;
  return Math.max(0, Math.min(100, score));
}

export function renderMarkdownReport(
  result: AnalyzeResult,
  issues: Issue[],
  options: { title: string; maxItems: number },
): string {
  const lines: string[] = [];
  lines.push(`# ${options.title}`);
  lines.push('');
  lines.push(`- 语言：${result.lang === 'js' ? 'JavaScript / TypeScript' : 'Python'}`);
  lines.push(
    `- 文件行数：${result.stats.totalLines}（有效 ${result.stats.codeLines}，注释 ${result.stats.commentLines}）`,
  );
  lines.push(`- 命中规则数：${result.stats.scannedRules}`);
  lines.push(
    `- 问题：高危 ${result.stats.bySeverity.error} · 建议 ${result.stats.bySeverity.warn} · 提示 ${result.stats.bySeverity.info}`,
  );
  lines.push(`- 扣分后得分：${scoreOf(result.stats)} / 100`);
  lines.push('');
  lines.push('## 按分类统计');
  lines.push('');
  lines.push('| 分类 | 数量 | 说明 |');
  lines.push('| --- | --- | --- |');
  for (const group of ['security', 'quality', 'performance'] as RuleGroup[]) {
    lines.push(`| ${GROUP_META[group].label} | ${result.stats.byGroup[group]} | ${GROUP_META[group].desc} |`);
  }
  lines.push('');
  lines.push('## 问题清单');
  lines.push('');
  if (issues.length === 0) {
    lines.push('没有命中规则（可能是没开对应分类，或代码确实干净）。');
    return lines.join('\n');
  }
  lines.push('| 等级 | 位置 | 规则 | 问题 | 修复建议 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of issues.slice(0, options.maxItems)) {
    lines.push(
      `| ${SEVERITY_META[item.severity].label} | L${item.line}:${item.column} | ${item.ruleId} | ${mdCell(item.message)} | ${mdCell(item.fix)} |`,
    );
  }
  if (issues.length > options.maxItems) {
    lines.push('');
    lines.push(`> 还有 ${issues.length - options.maxItems} 条未列出，可调大 maxItems 或改用 JSON 导出。`);
  }
  return lines.join('\n');
}

function mdCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderJsonReport(result: AnalyzeResult, issues: Issue[]): string {
  return JSON.stringify(
    {
      lang: result.lang,
      stats: result.stats,
      score: scoreOf(result.stats),
      issues,
    },
    null,
    2,
  );
}

/** 规则说明表，用于 UI 里的「规则清单」。 */
export function ruleDocs(): { rule: StaticRule; example: string }[] {
  return ALL_RULES.map((rule) => ({
    rule,
    example: rule.pattern.source.length > 60 ? `${rule.pattern.source.slice(0, 57)}…` : rule.pattern.source,
  }));
}
