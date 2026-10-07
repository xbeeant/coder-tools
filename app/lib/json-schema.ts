/**
 * 迷你 JSON Schema 校验器（draft-07 子集）。
 * 支持 type / properties / required / items / enum / const / 数值与长度约束 /
 * additionalProperties / patternProperties / oneOf / anyOf / allOf / not / 本地 $ref。
 * 纯函数实现，不依赖任何第三方库。
 */

export interface SchemaIssue {
  /** 形如 $.a.b[0] 的定位路径。 */
  path: string;
  /** 触发问题的关键字，例如 type、required。 */
  keyword: string;
  /** 中文说明。 */
  message: string;
}

export interface ValidateResult {
  valid: boolean;
  issues: SchemaIssue[];
  /** 因超出上限而未继续检查。 */
  truncated: boolean;
  /** 实际检查的节点数。 */
  checked: number;
}

export interface ValidateOptions {
  /** 最多收集多少条错误，默认 60。 */
  maxIssues?: number;
  /** 最大递归深度，默认 64。 */
  maxDepth?: number;
}

const SCHEMA_DRAFT = 'http://json-schema.org/draft-07/schema#';

function typeOf(value: unknown): 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'boolean') return 'boolean';
  if (type === 'number') return 'number';
  if (type === 'string') return 'string';
  if (type === 'object') return 'object';
  return 'string';
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === 'integer') return actual === 'number' && Number.isInteger(value);
  if (expected === 'number') return actual === 'number' && Number.isFinite(value);
  return actual === expected;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
  }
  return false;
}

/** 解析 `#/a/b/c` 形式的本地引用。 */
function resolveRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  const path = ref.slice(1).replace(/^\//, '');
  if (path === '') return root;
  let node: unknown = root;
  for (const rawSegment of path.split('/')) {
    const segment = decodeURIComponent(rawSegment).replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

interface Context {
  root: unknown;
  maxIssues: number;
  maxDepth: number;
  issues: SchemaIssue[];
  checked: number;
  truncated: boolean;
}

function push(ctx: Context, issue: SchemaIssue): void {
  if (ctx.issues.length >= ctx.maxIssues) {
    ctx.truncated = true;
    return;
  }
  ctx.issues.push(issue);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  switch (typeof value) {
    case 'string':
      return `字符串 ${JSON.stringify(value.length > 12 ? `${value.slice(0, 12)}…` : value)}`;
    case 'number':
    case 'boolean':
      return `${typeof value === 'number' ? '数字' : '布尔值'} ${String(value)}`;
    default:
      return '对象';
  }
}

function validateNode(value: unknown, rawSchema: unknown, path: string, ctx: Context, depth: number): void {
  if (ctx.issues.length >= ctx.maxIssues) return;
  if (depth > ctx.maxDepth) {
    push(ctx, { path, keyword: 'depth', message: '嵌套层级过深，已停止检查' });
    return;
  }
  ctx.checked += 1;

  if (rawSchema === true || rawSchema === undefined) return;
  if (rawSchema === false) {
    push(ctx, { path, keyword: 'false', message: '该位置不允许出现任何值' });
    return;
  }
  if (rawSchema === null || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) {
    push(ctx, { path, keyword: 'schema', message: 'Schema 片段必须是对象或布尔值' });
    return;
  }

  let schema = rawSchema as Record<string, unknown>;
  const rawRef = typeof schema.$ref === 'string' ? schema.$ref : null;
  if (rawRef !== null) {
    const resolved = resolveRef(ctx.root, rawRef);
    if (resolved === undefined) {
      push(ctx, { path, keyword: '$ref', message: `无法解析引用 ${rawRef}，只支持 # 开头的本地引用` });
      return;
    }
    const { $ref: _ref, ...rest } = schema;
    const merged = Object.keys(rest).length > 0 ? { ...(resolved as object), ...rest } : resolved;
    if (merged === null || typeof merged !== 'object' || Array.isArray(merged)) {
      push(ctx, { path, keyword: '$ref', message: `引用 ${rawRef} 指向的内容不是合法的 Schema` });
      return;
    }
    schema = merged as Record<string, unknown>;
  }

  // ── type ──
  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? (schema.type as string[]) : [String(schema.type)];
    if (!expected.some((item) => matchesType(value, item))) {
      push(ctx, {
        path,
        keyword: 'type',
        message: `期望类型 ${expected.join(' 或 ')}，实际是 ${typeOf(value)}（${describe(value)}）`,
      });
      return; // 类型不符时后续关键字多半无意义，直接返回避免噪声。
    }
  }

  // ── enum / const ──
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((item) => deepEqual(item, value))) {
      push(ctx, {
        path,
        keyword: 'enum',
        message: `值必须是 ${schema.enum.map((item) => JSON.stringify(item)).join('、')} 之一，实际是 ${JSON.stringify(value)}`,
      });
    }
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    push(ctx, {
      path,
      keyword: 'const',
      message: `值必须恒等于 ${JSON.stringify(schema.const)}，实际是 ${JSON.stringify(value)}`,
    });
  }

  // ── 数值约束 ──
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      push(ctx, { path, keyword: 'minimum', message: `数值必须大于等于 ${schema.minimum}，实际是 ${value}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      push(ctx, { path, keyword: 'maximum', message: `数值必须小于等于 ${schema.maximum}，实际是 ${value}` });
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      push(ctx, {
        path,
        keyword: 'exclusiveMinimum',
        message: `数值必须大于 ${schema.exclusiveMinimum}，实际是 ${value}`,
      });
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      push(ctx, {
        path,
        keyword: 'exclusiveMaximum',
        message: `数值必须小于 ${schema.exclusiveMaximum}，实际是 ${value}`,
      });
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
      const ratio = value / schema.multipleOf;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
        push(ctx, {
          path,
          keyword: 'multipleOf',
          message: `数值必须是 ${schema.multipleOf} 的整数倍，实际是 ${value}`,
        });
      }
    }
  }

  // ── 字符串约束 ──
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schema.minLength === 'number' && length < schema.minLength) {
      push(ctx, { path, keyword: 'minLength', message: `字符串长度至少 ${schema.minLength}，实际是 ${length}` });
    }
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) {
      push(ctx, { path, keyword: 'maxLength', message: `字符串长度最多 ${schema.maxLength}，实际是 ${length}` });
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value)) {
          push(ctx, { path, keyword: 'pattern', message: `字符串不匹配正则 /${schema.pattern}/` });
        }
      } catch {
        push(ctx, { path, keyword: 'pattern', message: `正则 /${schema.pattern}/ 不合法，Schema 本身有问题` });
      }
    }
  }

  // ── 数组约束 ──
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      push(ctx, {
        path,
        keyword: 'minItems',
        message: `数组至少需要 ${schema.minItems} 个元素，实际是 ${value.length}`,
      });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      push(ctx, { path, keyword: 'maxItems', message: `数组最多 ${schema.maxItems} 个元素，实际是 ${value.length}` });
    }
    if (schema.uniqueItems === true) {
      const seen: string[] = [];
      const duplicate = value.find((item) => {
        const key = JSON.stringify(item);
        if (seen.includes(key)) return true;
        seen.push(key);
        return false;
      });
      if (duplicate !== undefined) {
        push(ctx, { path, keyword: 'uniqueItems', message: '数组元素必须互不相同，存在重复值' });
      }
    }
    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        // 元组写法：按下标匹配，多余元素用 additionalItems 控制（这里宽松放行）。
        schema.items.forEach((item, index) => {
          if (index < value.length) validateNode(value[index], item, `${path}[${index}]`, ctx, depth + 1);
        });
      } else {
        value.forEach((item, index) => {
          validateNode(item, schema.items, `${path}[${index}]`, ctx, depth + 1);
        });
      }
    }
  }

  // ── 对象约束 ──
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const patternProperties = (schema.patternProperties ?? {}) as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const additional = schema.additionalProperties;

    for (const key of required) {
      if (!Object.hasOwn(record, key) || record[key] === undefined) {
        push(ctx, { path, keyword: 'required', message: `缺少必填字段「${key}」` });
      }
    }
    if (typeof schema.minProperties === 'number' && Object.keys(record).length < schema.minProperties) {
      push(ctx, {
        path,
        keyword: 'minProperties',
        message: `对象至少需要 ${schema.minProperties} 个字段，实际是 ${Object.keys(record).length}`,
      });
    }
    if (typeof schema.maxProperties === 'number' && Object.keys(record).length > schema.maxProperties) {
      push(ctx, {
        path,
        keyword: 'maxProperties',
        message: `对象最多 ${schema.maxProperties} 个字段，实际是 ${Object.keys(record).length}`,
      });
    }

    for (const [key, item] of Object.entries(record)) {
      const childPath = `${path}.${key}`;
      let handled = false;
      if (Object.hasOwn(properties, key)) {
        validateNode(item, properties[key], childPath, ctx, depth + 1);
        handled = true;
      }
      for (const [pattern, subSchema] of Object.entries(patternProperties)) {
        let regex: RegExp | null = null;
        try {
          regex = new RegExp(pattern, 'u');
        } catch {
          regex = null;
        }
        if (regex?.test(key)) {
          validateNode(item, subSchema, childPath, ctx, depth + 1);
          handled = true;
        }
      }
      if (handled || additional === undefined) continue;
      if (additional === false) {
        push(ctx, { path: childPath, keyword: 'additionalProperties', message: `不允许出现未定义的字段「${key}」` });
      } else if (additional !== true) {
        validateNode(item, additional, childPath, ctx, depth + 1);
      }
    }
  }

  // ── 组合关键字 ──
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((sub, index) => {
      validateNode(value, sub, `${path}`, ctx, depth + 1);
      void index;
    });
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const passed = schema.anyOf.some((sub) => countIssues(value, sub, path, ctx) === 0);
    if (!passed) push(ctx, { path, keyword: 'anyOf', message: '不满足 anyOf 中的任何一个子 Schema' });
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const matches = schema.oneOf.filter((sub) => countIssues(value, sub, path, ctx) === 0).length;
    if (matches === 0) {
      push(ctx, { path, keyword: 'oneOf', message: '不满足 oneOf 中的任何一个子 Schema' });
    } else if (matches > 1) {
      push(ctx, { path, keyword: 'oneOf', message: `同时满足 ${matches} 个 oneOf 子 Schema，结果有歧义` });
    }
  }
  if (schema.not !== undefined && countIssues(value, schema.not, path, ctx) === 0) {
    push(ctx, { path, keyword: 'not', message: '命中了 not 声明的不允许形态' });
  }
}

/** 在静默子上下文中试跑一次校验，只返回错误数量（深度从 0 重新计数）。 */
function countIssues(value: unknown, schema: unknown, path: string, ctx: Context): number {
  const sub: Context = { ...ctx, issues: [], truncated: false };
  validateNode(value, schema, path, sub, 0);
  return sub.issues.length;
}

/** 用 draft-07 Schema 校验数据，返回中文错误列表。 */
export function validateJsonSchema(data: unknown, schema: unknown, options: ValidateOptions = {}): ValidateResult {
  const ctx: Context = {
    root: schema,
    maxIssues: options.maxIssues ?? 60,
    maxDepth: options.maxDepth ?? 64,
    issues: [],
    checked: 0,
    truncated: false,
  };
  validateNode(data, schema, '$', ctx, 0);
  return { valid: ctx.issues.length === 0, issues: ctx.issues, truncated: ctx.truncated, checked: ctx.checked };
}

/** 空 draft-07 Schema 模板，给 UI 的输入框做默认值。 */
export function emptySchema(): string {
  return JSON.stringify(
    {
      $schema: SCHEMA_DRAFT,
      title: '示例',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['active', 'disabled'] },
      },
      required: ['id', 'name'],
    },
    null,
    2,
  );
}
