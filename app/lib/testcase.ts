/**
 * 测试框架工具的纯逻辑层：用等价类 / 边界值 / 错误推测生成测试用例，渲染 Markdown、JSON、CSV，
 * 以及一个受限的表达式沙盒。
 *
 * 沙盒说明：只用 `new Function` 在当前页面里执行用户输入的表达式，
 * 目的仅仅是「本地算一下断言结果」，执行前会做静态黑名单检查并屏蔽危险全局对象。
 * 它不能替代 Node 里的 vm/子进程隔离，也不要在这里粘贴生产密钥。
 */

export type TestKind = 'function' | 'api';

export type CaseCategory = 'equivalence' | 'boundary' | 'exception' | 'security' | 'performance' | 'happy';

export type Priority = 'P0' | 'P1' | 'P2';

export interface TestCase {
  id: string;
  title: string;
  category: CaseCategory;
  priority: Priority;
  precondition: string;
  steps: string[];
  input: string;
  expected: string;
  tags: string[];
}

export interface ParamSpec {
  name: string;
  type: string;
  optional: boolean;
  desc: string;
}

export interface GenerateInput {
  kind: TestKind;
  name: string;
  signature: string;
  returnType: string;
  rule: string;
  /** 数值域描述，例如 0-100 或 1-64。 */
  domain: string;
  /** 是否包含可选参数。 */
  hasOptional: boolean;
  level: number;
  categories: CaseCategory[];
  tags: string[];
}

export interface GeneratedSuite {
  cases: TestCase[];
  notes: string[];
  params: ParamSpec[];
  /** 按分类统计，便于 UI 展示覆盖情况。 */
  summary: { category: CaseCategory; count: number }[];
}

export const CATEGORY_META: Record<CaseCategory, { label: string; desc: string }> = {
  happy: { label: '正常流程', desc: '典型输入下的预期行为' },
  equivalence: { label: '等价类', desc: '把取值域按有效/无效划分后各取代表值' },
  boundary: { label: '边界值', desc: '上下限及其相邻值，最容易出错的地方' },
  exception: { label: '异常与错误推测', desc: '空值、类型错误、并发、越权等常见缺陷' },
  security: { label: '安全', desc: '注入、XSS、越权、敏感信息泄露' },
  performance: { label: '性能', desc: '并发、峰值、长时间运行与资源占用' },
};

export const DEFAULT_INPUT: GenerateInput = {
  kind: 'function',
  name: 'calcDiscount',
  signature: 'price: number, level: number',
  returnType: 'number',
  rule: '满 200 减 30，满 500 减 80，level 为 1~3 的会员等级，不满足条件返回原价',
  domain: '0-10000',
  hasOptional: true,
  level: 2,
  categories: ['happy', 'equivalence', 'boundary', 'exception', 'security', 'performance'],
  tags: ['单元测试'],
};

/** 解析 `a: string, b?: number` 形式的签名，兼容无类型的 `fn(a, b)`。 */
export function parseSignature(signature: string): ParamSpec[] {
  const trimmed = signature.trim();
  if (trimmed === '') return [];
  // 兼容 `(a: string)` 与 `fn(a, b)`：只取第一对括号里的内容。
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  const inner = open !== -1 && close > open ? trimmed.slice(open + 1, close) : trimmed;
  const parts = inner
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const out: ParamSpec[] = [];
  for (const part of parts) {
    const match = /^([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+)$/.exec(part);
    if (match !== null) {
      out.push({
        name: match[1] as string,
        optional: match[2] !== undefined,
        type: (match[3] as string).trim(),
        desc: '',
      });
      continue;
    }
    const bare = /^([A-Za-z_$][\w$]*)$/.exec(part);
    if (bare !== null) {
      out.push({ name: bare[1] as string, optional: false, type: 'any', desc: '' });
      continue;
    }
    // 无法识别时保留原文，交给 UI 提示用户改成规范写法。
    out.push({ name: part.replace(/\W/g, '_') || 'arg', optional: false, type: 'any', desc: `无法解析：${part}` });
  }
  return out;
}

/** 解析 `0-100`、`1..64`、`a|b|c` 这类取值域描述。 */
export function parseDomain(domain: string): { min: number; max: number } | null {
  const match = /^\s*(-?\d+)\s*(?:-|\.\.|~|到|至)\s*(-?\d+)\s*$/.exec(domain);
  if (match === null) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

/** 可复现的伪随机数（mulberry32），保证同一种子生成同一批随机数据。 */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LONG_TEXT = 'a'.repeat(300);
const UNICODE_TEXT = '张三';
const SPECIAL_TEXT = `"><script>alert(1)</script>&'\`;\\`;

const STRING_POOL = ['demo', 'user_1001', 'alice@example.com', '', ' ', '0', UNICODE_TEXT, LONG_TEXT, SPECIAL_TEXT];
const NUMBER_POOL = [0, 1, -1, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10000, 255];

export function sampleValue(type: string, index: number): string {
  const lower = type.toLowerCase();
  if (lower.includes('boolean') || lower.includes('bool')) return index % 2 === 0 ? 'true' : 'false';
  if (lower.includes('number') || lower.includes('int') || lower.includes('float') || lower.includes('double')) {
    return String(NUMBER_POOL[index % NUMBER_POOL.length]);
  }
  if (lower.includes('date') || lower.includes('time')) return '2026-01-01T00:00:00Z';
  if (lower.includes('array') || lower.startsWith('list') || lower.includes('[]')) return '[]';
  if (lower.includes('object') || lower.includes('map') || lower.startsWith('{')) return '{}';
  if (lower.includes('null') || lower.includes('undefined')) return 'null';
  if (lower === 'string' || lower === 'str' || lower === 'text' || lower === '')
    return `'${STRING_POOL[index % STRING_POOL.length]}'`;
  return `'${type}'`;
}

/** 数值参数的有效/无效等价类。 */
function numericEquivalence(
  _param: ParamSpec,
  range: { min: number; max: number } | null,
): { label: string; value: string; valid: boolean }[] {
  if (range === null) {
    return [
      { label: '区间内代表值', value: '100', valid: true },
      { label: '负数', value: '-1', valid: false },
      { label: '零', value: '0', valid: true },
      { label: '小数', value: '1.5', valid: false },
      { label: '非数字', value: "'abc'", valid: false },
      { label: 'NaN', value: 'Number.NaN', valid: false },
    ];
  }
  const mid = Math.round((range.min + range.max) / 2);
  return [
    { label: `区间内（下限侧）`, value: String(range.min), valid: true },
    { label: `区间内（代表值 ${mid}）`, value: String(mid), valid: true },
    { label: `区间内（上限侧）`, value: String(range.max), valid: true },
    { label: '低于下限', value: String(range.min - 1), valid: false },
    { label: '高于上限', value: String(range.max + 1), valid: false },
    { label: '非数字字符串', value: `'${mid}'`, valid: false },
  ];
}

/** 字符串参数的有效/无效等价类。 */
function stringEquivalence(): { label: string; value: string; valid: boolean }[] {
  return [
    { label: '常规值', value: "'alice@example.com'", valid: true },
    { label: '最小长度', value: "'a'", valid: true },
    { label: '空字符串', value: "''", valid: false },
    { label: '纯空格', value: "' '", valid: false },
    { label: '超长', value: `'${'a'.repeat(300)}'`, valid: false },
    { label: '含中文', value: `'${UNICODE_TEXT}'`, valid: false },
    { label: '含特殊字符', value: `'${SPECIAL_TEXT}'`, valid: false },
  ];
}

function booleanEquivalence(): { label: string; value: string; valid: boolean }[] {
  return [
    { label: 'true', value: 'true', valid: true },
    { label: 'false', value: 'false', valid: true },
    { label: '字符串 "true"', value: "'true'", valid: false },
    { label: '数字 0/1', value: '0', valid: false },
    { label: 'null', value: 'null', valid: false },
  ];
}

function genericEquivalence(param: ParamSpec): { label: string; value: string; valid: boolean }[] {
  const lower = param.type.toLowerCase();
  if (lower.includes('bool')) return booleanEquivalence();
  if (lower.includes('number') || lower.includes('int') || lower.includes('float')) return [];
  if (lower.includes('date') || lower.includes('time')) {
    return [
      { label: '正常时间', value: "'2026-01-01T00:00:00Z'", valid: true },
      { label: '非法日期', value: "'2026-02-31'", valid: false },
      { label: '空值', value: 'null', valid: false },
      { label: '时区偏移', value: "'2026-01-01T00:00:00+08:00'", valid: true },
    ];
  }
  if (lower.includes('array') || lower.includes('[]')) {
    return [
      { label: '非空数组', value: '[1, 2, 3]', valid: true },
      { label: '空数组', value: '[]', valid: true },
      { label: '含 null 的数组', value: '[1, null]', valid: false },
      { label: '超大数组', value: 'Array.from({ length: 10000 }, (_, i) => i)', valid: false },
    ];
  }
  return stringEquivalence();
}

function isNumeric(param: ParamSpec): boolean {
  const lower = param.type.toLowerCase();
  return lower.includes('number') || lower.includes('int') || lower.includes('float') || lower.includes('double');
}

/** 边界值：围绕 min/max 与常规长度上限取相邻值。 */
function boundaryCases(
  param: ParamSpec,
  range: { min: number; max: number } | null,
): { label: string; value: string }[] {
  const lower = param.type.toLowerCase();
  if (isNumeric(param) && range !== null) {
    return [
      { label: `${range.min - 1}（下限 -1）`, value: String(range.min - 1) },
      { label: `${range.min}（下限）`, value: String(range.min) },
      { label: `${range.min + 1}（下限 +1）`, value: String(range.min + 1) },
      { label: `${range.max - 1}（上限 -1）`, value: String(range.max - 1) },
      { label: `${range.max}（上限）`, value: String(range.max) },
      { label: `${range.max + 1}（上限 +1）`, value: String(range.max + 1) },
    ];
  }
  if (isNumeric(param)) {
    return [
      { label: '0', value: '0' },
      { label: '-1', value: '-1' },
      { label: 'Number.MAX_SAFE_INTEGER', value: 'Number.MAX_SAFE_INTEGER' },
      { label: 'Number.NaN', value: 'Number.NaN' },
      { label: 'Number.POSITIVE_INFINITY', value: 'Number.POSITIVE_INFINITY' },
    ];
  }
  if (lower.includes('bool')) {
    return [
      { label: 'true', value: 'true' },
      { label: 'false', value: 'false' },
      { label: "字符串 'true'", value: "'true'" },
      { label: 'null', value: 'null' },
    ];
  }
  if (lower.includes('array') || lower.includes('[]')) {
    return [
      { label: '空数组', value: '[]' },
      { label: '单元素', value: '[1]' },
      { label: '100 个元素', value: 'Array.from({ length: 100 }, (_, i) => i)' },
      { label: '元素为 null', value: '[null]' },
    ];
  }
  if (lower.includes('date') || lower.includes('time')) {
    return [
      { label: '纪元时间', value: "'1970-01-01T00:00:00Z'" },
      { label: '跨年', value: "'2025-12-31T23:59:59Z'" },
      { label: '夏令时切换', value: "'2026-03-29T01:30:00Z'" },
      { label: '非法日期', value: "'2026-02-31'" },
    ];
  }
  return [
    { label: '空字符串', value: "''" },
    { label: '1 个字符', value: "'a'" },
    { label: '含空格', value: "' a '" },
    { label: '最大长度（255）', value: `'${'a'.repeat(255)}'` },
    { label: '超过最大长度（256）', value: `'${'a'.repeat(256)}'` },
    { label: '首尾空格', value: "'alice '" },
  ];
}

/** 常见错误推测：来自经验而非工具分析，UI 里要说明这一点。 */
function exceptionCases(params: ParamSpec[], rule: string): { title: string; steps: string[]; expected: string }[] {
  const first = params[0];
  const out: { title: string; steps: string[]; expected: string }[] = [
    {
      title: '缺少必填参数时应报错而非静默通过',
      steps: ['省略必填参数后调用', '观察返回值与异常类型'],
      expected: '抛出参数缺失异常，错误信息里带上缺失的字段名',
    },
    {
      title: '参数类型错误时应给出明确类型提示',
      steps: [`把第一个参数替换为对象或数组`, '调用函数'],
      expected: '抛出类型错误，提示期望类型而不是 undefined 参与运算',
    },
    {
      title: '重复提交同一请求应保持幂等',
      steps: ['用相同入参连续调用两次', '对比两次返回与副作用'],
      expected: '第二次不产生新的副作用，或返回明确的一致结果',
    },
    {
      title: '并发调用不应互相污染状态',
      steps: ['并行发起 50 次调用', '检查返回值是否互相覆盖'],
      expected: '每次调用的结果与单独执行一致',
    },
    {
      title: '依赖的外部服务不可用时应快速失败',
      steps: ['让下游服务超时或返回 5xx', '调用函数'],
      expected: '抛出可识别的下游异常，并记录足够日志，不吞异常',
    },
    {
      title: '时区与本地化不应影响结果',
      steps: ['把运行环境时区改为 UTC 与 UTC+8 各跑一次', '对比返回值'],
      expected: '两者一致，或差异在业务允许范围内',
    },
  ];
  if (rule.trim() !== '') {
    out.unshift({
      title: '规则里提到的每个条件都要有对应分支',
      steps: [`把规则拆成条件：${rule.trim()}`, '逐个条件构造只满足它的输入', '验证只走对应分支'],
      expected: '每个条件都有独立分支，未满足时走默认分支',
    });
  }
  if (first !== undefined) {
    out.push({
      title: `${first.name} 传 null / undefined 的行为要明确`,
      steps: [`分别传入 null 与 undefined 的 ${first.name}`, '对比返回结果'],
      expected: '要么显式拒绝，要么按文档约定的默认值处理，不能出现隐式 NaN',
    });
  }
  return out;
}

function securityCases(params: ParamSpec[], kind: TestKind): { title: string; steps: string[]; expected: string }[] {
  const target = kind === 'api' ? '接口参数' : '函数入参';
  return [
    {
      title: `${target}注入攻击串不应改变查询语义`,
      steps: [`传入 ${params[0]?.name ?? '第一个参数'} = "' OR 1=1 --"`, '检查结果集与执行日志'],
      expected: '按普通字符串处理，SQL 里是参数化查询，日志无完整拼接语句',
    },
    {
      title: '输出内容需要转义，防止 XSS',
      steps: [`传入 <script>alert(1)</script>`, '检查页面渲染与接口返回'],
      expected: '前端转义后展示为文本，不执行脚本',
    },
    {
      title: '越权访问应被拒绝',
      steps: ['用 A 账号的凭证访问 B 账号的资源 id', '观察状态码与响应体'],
      expected: '返回 403 或等价错误，且不泄露资源是否存在',
    },
    {
      title: '鉴权信息缺失或过期应被拒绝',
      steps: ['去掉 Authorization', '换成已过期的 token'],
      expected: '统一返回 401，不因为错误信息不同泄露内部状态',
    },
    {
      title: '敏感信息不应出现在日志与错误信息里',
      steps: ['故意触发异常', '检查日志、响应体与前端提示'],
      expected: '密码、token、证件号等被脱敏或省略',
    },
    {
      title: '高频请求应触发限流而不是打垮服务',
      steps: ['短时间内发起超过阈值的请求', '观察后续请求'],
      expected: '返回 429 并带 Retry-After，服务保持可用',
    },
    {
      title: '请求重放应被识别或需要一次性凭据',
      steps: ['原样重放一次成功的写请求', '观察副作用'],
      expected: '不会产生第二次副作用，或要求 nonce/幂等键',
    },
  ];
}

function performanceCases(name: string): { title: string; steps: string[]; expected: string }[] {
  return [
    {
      title: '单次调用的耗时在可接受范围内',
      steps: ['准备典型入参', '预热若干次后取 P95 耗时'],
      expected: 'P95 满足接口约定，无异常长尾',
    },
    {
      title: '高并发下不应出现错误率上升',
      steps: ['按峰值 QPS 压测 5 分钟', '记录成功率与 P99'],
      expected: '错误率低于约定阈值，超时不雪崩',
    },
    {
      title: '长时间运行不应泄漏内存',
      steps: [`连续调用 ${name} 十万次`, '观察堆内存曲线'],
      expected: '内存趋于平稳，GC 后能回收',
    },
    {
      title: '冷启动与缓存失效时的表现可接受',
      steps: ['清空缓存后首次调用', '对比第二次调用耗时'],
      expected: '首次略慢但不超时，缓存命中后明显变快',
    },
  ];
}

/** 生成用例集：按分类拼装，再统一编号。 */
export function generateCases(input: GenerateInput): GeneratedSuite {
  const params = parseSignature(input.signature);
  const range = parseDomain(input.domain);
  const notes: string[] = [];
  const cases: TestCase[] = [];

  if (input.name.trim() === '') notes.push('没有填写名称，用例标题会用占位名称。');
  if (params.length === 0) notes.push('没有解析到参数，等价类与边界值只能按参数类型默认值生成。');
  const numericParams = params.filter((param) => isNumeric(param));
  if (numericParams.length > 0 && range === null) {
    notes.push(`取值域「${input.domain}」无法识别成 min-max 区间，数值参数会退化到默认边界。`);
  }
  if (input.level < 1 || input.level > 3) notes.push('生成条数按 1~3 处理，越多只是重复边界组合。');

  const level = Math.min(3, Math.max(1, input.level));
  const allCategories: CaseCategory[] = ['happy', 'equivalence', 'boundary', 'exception', 'security', 'performance'];
  if (input.categories.length === 0) {
    notes.push('没有勾选任何覆盖分类，已按全部分类生成。');
  }
  const name = input.name.trim() === '' ? '被测对象' : input.name.trim();
  const call = `${name}(${params.map((param) => param.name).join(', ')})`;
  const want = input.categories.length === 0 ? allCategories : input.categories;

  const push = (
    title: string,
    category: CaseCategory,
    priority: Priority,
    inputText: string,
    expected: string,
    steps: string[],
    tags: string[],
  ) => {
    cases.push({
      id: `TC-${String(cases.length + 1).padStart(2, '0')}`,
      title,
      category,
      priority,
      precondition: input.kind === 'api' ? '服务已启动，测试环境依赖可用' : '单元测试环境，依赖已注入',
      steps,
      input: inputText,
      expected,
      tags,
    });
  };

  // 正常流程
  if (want.includes('happy')) {
    const sample = params.map((param) => sampleValue(param.type, 0)).join(', ');
    push(
      `${name} 使用典型输入返回正确结果`,
      'happy',
      'P0',
      `${call} ← (${sample})`,
      `返回值符合规则：${input.rule.trim() === '' ? '与接口文档一致' : input.rule.trim()}`,
      ['准备典型入参', `调用 ${call}`, '校验返回值'],
      ['冒烟', ...input.tags],
    );
    const optional = params.filter((param) => param.optional);
    if (input.hasOptional && optional.length > 0) {
      push(
        `省略可选参数 ${optional.map((param) => param.name).join('、') || '（无）'} 时走默认值`,
        'happy',
        'P1',
        `${call}（只传必填参数）`,
        '使用文档约定的默认值，且不抛异常',
        ['省略可选参数', `调用 ${call}`],
        ['默认值', ...input.tags],
      );
    }
  }

  // 等价类
  if (want.includes('equivalence')) {
    for (const param of params) {
      const classes = isNumeric(param) ? numericEquivalence(param, range) : genericEquivalence(param);
      const picked = classes.slice(0, level + 3);
      for (const item of picked) {
        const others = params
          .filter((other) => other.name !== param.name)
          .map((other) => sampleValue(other.type, 0))
          .join(', ');
        push(
          `${param.name}：${item.label}`,
          'equivalence',
          item.valid ? 'P1' : 'P2',
          `${call} ← (${[...others, item.value].filter((value) => value !== '').join(', ')})`,
          item.valid ? '按有效等价类处理，返回值符合规则' : '返回参数校验错误，提示该字段不合法',
          [`构造 ${param.name} = ${item.value}`, `调用 ${call}`, '校验返回值或错误信息'],
          ['等价类', param.name, ...input.tags],
        );
      }
    }
    if (params.length === 0) {
      for (const item of stringEquivalence().slice(0, 4)) {
        push(
          `整体入参：${item.label}`,
          'equivalence',
          item.valid ? 'P1' : 'P2',
          item.value,
          item.valid ? '返回成功' : '返回参数校验错误',
          ['构造入参', '调用被测对象'],
          ['等价类', ...input.tags],
        );
      }
    }
  }

  // 边界值
  if (want.includes('boundary')) {
    for (const param of params) {
      const list = boundaryCases(param, range);
      const picked = list.slice(0, level + 3);
      for (const item of picked) {
        push(
          `${param.name} 边界：${item.label}`,
          'boundary',
          'P1',
          `${param.name} = ${item.value}`,
          '边界值本身合法或按规则拒绝，相邻值不应崩溃',
          [`令 ${param.name} = ${item.value}`, `调用 ${call}`, '校验返回值'],
          ['边界值', param.name, ...input.tags],
        );
      }
    }
    if (params.length === 0) {
      notes.push('没有参数信息，边界值用例只给了字符串长度边界。');
    }
  }

  // 异常与错误推测
  if (want.includes('exception')) {
    for (const item of exceptionCases(params, input.rule)) {
      push(item.title, 'exception', 'P0', '见步骤', item.expected, item.steps, ['异常', ...input.tags]);
    }
  }

  // 安全
  if (want.includes('security')) {
    for (const item of securityCases(params, input.kind)) {
      push(item.title, 'security', 'P0', '见步骤', item.expected, item.steps, ['安全', ...input.tags]);
    }
  }

  // 性能
  if (want.includes('performance')) {
    for (const item of performanceCases(name)) {
      push(item.title, 'performance', 'P2', '见步骤', item.expected, item.steps, ['性能', ...input.tags]);
    }
  }

  const order: CaseCategory[] = ['happy', 'equivalence', 'boundary', 'exception', 'security', 'performance'];
  const summary = order
    .map((category) => ({ category, count: cases.filter((item) => item.category === category).length }))
    .filter((item) => item.count > 0);

  return { cases, notes, params, summary };
}

/** 生成一批随机入参样例，用于「随机数据」区块。 */
export function randomSamples(params: ParamSpec[], count: number, seed: number): string[] {
  const rand = makeRandom(seed);
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, Math.min(20, count)); i += 1) {
    out.push(
      params
        .map((param) => {
          const lower = param.type.toLowerCase();
          if (lower.includes('bool')) return rand() > 0.5 ? 'true' : 'false';
          if (isNumeric(param)) return String(Math.floor(rand() * 1000));
          if (lower.includes('array') || lower.includes('[]')) return `[${Math.floor(rand() * 5)}]`;
          if (lower.includes('object')) return `{ k: ${Math.floor(rand() * 10)} }`;
          if (lower.includes('date') || lower.includes('time')) return `2026-0${1 + Math.floor(rand() * 9)}-01`;
          const words = ['alice', 'bob', '张三', 'user_1', 'demo@test.com', '', 'a'.repeat(Math.floor(rand() * 300))];
          return `'${words[Math.floor(rand() * words.length)]}'`;
        })
        .join(', '),
    );
  }
  return out;
}

export function renderMarkdown(suite: GeneratedSuite, input: GenerateInput): string {
  const lines: string[] = [];
  lines.push(`# 测试用例：${input.name.trim() === '' ? '未命名' : input.name.trim()}`);
  lines.push('');
  lines.push(`- 类型：${input.kind === 'api' ? '接口测试' : '单元测试'}`);
  lines.push(`- 签名：\`${input.signature.trim() === '' ? '（未填写）' : input.signature.trim()}\``);
  if (input.returnType.trim() !== '') lines.push(`- 返回类型：\`${input.returnType.trim()}\``);
  if (input.rule.trim() !== '') lines.push(`- 业务规则：${input.rule.trim()}`);
  if (input.domain.trim() !== '') lines.push(`- 取值域：${input.domain.trim()}`);
  lines.push(`- 用例总数：${suite.cases.length}`);
  lines.push('');
  lines.push('| 覆盖分类 | 用例数 |');
  lines.push('| --- | --- |');
  for (const item of suite.summary) lines.push(`| ${CATEGORY_META[item.category].label} | ${item.count} |`);
  lines.push('');
  for (const category of suite.summary.map((item) => item.category)) {
    lines.push(`## ${CATEGORY_META[category].label}`);
    lines.push('');
    for (const item of suite.cases.filter((one) => one.category === category)) {
      lines.push(`### ${item.id} ${item.title}`);
      lines.push('');
      lines.push(`- 优先级：${item.priority}`);
      lines.push(`- 前置条件：${item.precondition}`);
      lines.push(`- 输入：\`${item.input}\``);
      lines.push('- 步骤：');
      item.steps.forEach((step, index) => {
        lines.push(`  ${index + 1}. ${step}`);
      });
      lines.push(`- 预期结果：${item.expected}`);
      if (item.tags.length > 0) lines.push(`- 标签：${item.tags.join('、')}`);
      lines.push('');
    }
  }
  if (suite.notes.length > 0) {
    lines.push('## 生成说明');
    lines.push('');
    for (const note of suite.notes) lines.push(`- ${note}`);
  }
  return lines.join('\n');
}

export function renderJson(suite: GeneratedSuite, input: GenerateInput): string {
  return JSON.stringify(
    {
      target: { name: input.name, kind: input.kind, signature: input.signature, rule: input.rule },
      params: suite.params,
      summary: suite.summary.map((item) => ({
        category: item.category,
        label: CATEGORY_META[item.category].label,
        count: item.count,
      })),
      cases: suite.cases,
      notes: suite.notes,
    },
    null,
    2,
  );
}

/** CSV 转义：含逗号、引号、换行时用双引号包起来。 */
function csvCell(value: string): string {
  const text = value.replaceAll('\r\n', ' ').replaceAll('\n', ' ');
  if (/[",]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function renderCsv(suite: GeneratedSuite): string {
  const rows: string[] = ['编号,分类,优先级,标题,前置条件,输入,步骤,预期结果,标签'];
  for (const item of suite.cases) {
    rows.push(
      [
        item.id,
        CATEGORY_META[item.category].label,
        item.priority,
        item.title,
        item.precondition,
        item.input,
        item.steps.map((step, index) => `${index + 1}. ${step}`).join(' '),
        item.expected,
        item.tags.join('|'),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return rows.join('\n');
}

/** 表达式沙盒：执行前静态拦截危险标识，再屏蔽一批全局对象。 */
const FORBIDDEN = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'navigator',
  'window',
  'document',
  'globalThis',
  'self',
  'top',
  'parent',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'importScripts',
  'require',
  'process',
  'eval',
  'Function',
  'import',
  'Deno',
  'Bun',
  'Worker',
  'SharedWorker',
  'Notification',
  'open',
  'postMessage',
  'sendBeacon',
  'alert',
];

export interface SandboxResult {
  ok: boolean;
  value: string;
  error: string | null;
  /** 命中过的禁用标识，方便用户理解为什么被拦。 */
  blocked: string[];
}

/** 找出表达式里出现的禁用标识（跳过字符串字面量里的内容）。 */
export function findForbidden(source: string): string[] {
  const withoutStrings = source
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '/regex/');
  const hits = new Set<string>();
  for (const token of FORBIDDEN) {
    if (new RegExp(`(^|[^.\\w$])${token.replaceAll('$', '\\$')}\\s*[(\\s.]`).test(withoutStrings)) hits.add(token);
  }
  return [...hits];
}

export function runExpression(source: string, scope: Record<string, unknown> = {}): SandboxResult {
  const blocked = findForbidden(source);
  if (blocked.length > 0) {
    return { ok: false, value: '', blocked, error: `表达式里出现了受限标识：${blocked.join('、')}，请改成纯计算。` };
  }
  const trimmed = source.trim();
  if (trimmed === '') return { ok: false, value: '', blocked, error: '表达式为空' };
  if (trimmed.length > 500) return { ok: false, value: '', blocked, error: '表达式太长，请控制在 500 字符以内' };

  const names = Object.keys(scope).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  try {
    // 变量通过形参注入，不使用 with，因此处于严格模式。
    // eslint-disable-next-line no-new-func -- 沙盒的运行方式就是 new Function，见文件头说明
    const factory = new Function(...names, `"use strict"; return (${trimmed});`) as (...args: unknown[]) => unknown;
    const result = factory(...names.map((name) => scope[name]));
    return {
      ok: true,
      value: typeof result === 'string' ? result : (JSON.stringify(result, null, 2) ?? String(result)),
      blocked,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      value: '',
      blocked,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

/** 断言表达式模板：UI 里给用户一键填入的示例。 */
export const ASSERTION_TEMPLATES: { name: string; expr: string; desc: string }[] = [
  { name: '恒等断言', expr: 'value === expected', desc: '最基础的相等判断' },
  { name: '浮点比较', expr: 'Math.abs(value - expected) < 1e-9', desc: '避免直接用 === 比较小数' },
  { name: '近似相等', expr: 'Math.round(value) === Math.round(expected)', desc: '业务上只关心整数位时用' },
  { name: '范围断言', expr: 'value >= 0 && value <= 100', desc: '校验结果落在区间内' },
  { name: '集合包含', expr: 'Array.isArray(value) && value.includes(expected)', desc: '数组包含指定元素' },
  { name: '深比较', expr: 'JSON.stringify(value) === JSON.stringify(expected)', desc: '字段顺序敏感，慎用' },
  { name: '空值断言', expr: 'value === null || value === undefined', desc: '校验确实没有返回' },
  {
    name: '抛错断言',
    expr: '(() => { try { fn(); return false; } catch { return true; } })()',
    desc: '确认函数按预期抛出异常',
  },
];
