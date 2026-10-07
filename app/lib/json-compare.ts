/**
 * JSON 结构比对的纯逻辑层：按 JSONPath 递归比较两侧数据，
 * 输出新增、删除、类型变更与值变更，不依赖任何 UI。
 *
 * 语义要点：
 * - 对象按键比较，缺少的键记为新增/删除，嵌套对象会继续下降而不是整块报差异；
 * - 数组默认按下标逐一比较，也可切换为按值集合匹配（忽略顺序与重复）；
 * - 两侧类型不同记为类型变更，不做隐式转换；
 * - ignoreKeys 对任意层级生效，仅作用于结构比对；
 * - 递归深度超过 MAX_DEPTH 时停止下降并标记 truncated，避免超深嵌套爆栈。
 */
/** 递归深度上限，超出后停止下降，避免超深嵌套爆栈。 */
const MAX_DEPTH = 200;

export type ChangeKind = 'added' | 'removed' | 'type' | 'changed';

export interface Change {
  /** 稳定标识，用于列表 key。 */
  id: string;
  kind: ChangeKind;
  /** 形如 `$.users[2].name` 的路径。 */
  path: string;
  left: string;
  right: string;
}

export interface CompareOptions {
  /** 需要跳过的字段名（任意层级都生效）。 */
  ignoreKeys: string[];
  /** 数组按值集合比较，忽略顺序与重复。 */
  unorderedArrays: boolean;
  /** 数字比较容差，绝对差 ≤ 该值视为相同。 */
  tolerance: number;
}

export interface CompareResult {
  changes: Change[];
  /** 两侧完全一致（含顺序语义）时为 true。 */
  identical: boolean;
  added: number;
  removed: number;
  changed: number;
  /** 两侧差异深度超过上限时提示已截断。 */
  truncated: boolean;
  /** 被 ignoreKeys 跳过的字段数。 */
  ignored: number;
}

type PathToken = string | number;

function renderPath(tokens: PathToken[]): string {
  let out = '$';
  for (const token of tokens) {
    if (typeof token === 'number') {
      out += `[${token}]`;
      continue;
    }
    // 仅标识符走点号，其余用方括号避免歧义。
    out += /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token) ? `.${token}` : `[${JSON.stringify(token)}]`;
  }
  return out;
}

/** 单行紧凑表示，用于变更列表里对比左右值。 */
function show(value: unknown): string {
  if (value === undefined) return '(不存在)';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 规范化键序后序列化，作为数组无序匹配时的等价标识。 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tolerance;
  return canonical(a) === canonical(b);
}

interface WalkContext {
  options: CompareOptions;
  out: Change[];
  ignored: number;
  truncated: boolean;
}

function push(ctx: WalkContext, kind: ChangeKind, tokens: PathToken[], left: unknown, right: unknown) {
  const path = renderPath(tokens);
  const before = show(left);
  const after = show(right);
  ctx.out.push({ id: `${path}|${kind}|${before}|${after}`, kind, path, left: before, right: after });
}

/** 数组无序比较：贪心匹配两侧等价元素，剩下的按整值记为新增/删除。 */
function compareUnordered(a: unknown[], b: unknown[], tokens: PathToken[], ctx: WalkContext) {
  const rightPool = new Map<string, number[]>();
  b.forEach((item, index) => {
    const key = canonical(item);
    const bucket = rightPool.get(key);
    if (bucket) bucket.push(index);
    else rightPool.set(key, [index]);
  });

  // 先按等价键吃掉右侧下标，未匹配的记录下来。
  const leftKeys: string[] = [];
  const matchedRight = new Set<number>();
  const matchedLeft = new Set<number>();
  a.forEach((item, index) => {
    const key = canonical(item);
    leftKeys.push(key);
    const bucket = rightPool.get(key);
    const free = bucket?.find((candidate) => !matchedRight.has(candidate));
    if (free === undefined) return;
    matchedRight.add(free);
    matchedLeft.add(index);
  });

  a.forEach((item, index) => {
    if (matchedLeft.has(index)) return;
    push(ctx, 'removed', [...tokens, index], item, undefined);
  });
  b.forEach((item, index) => {
    if (matchedRight.has(index)) return;
    push(ctx, 'added', [...tokens, index], undefined, item);
  });
}

function walk(a: unknown, b: unknown, tokens: PathToken[], ctx: WalkContext, depth: number) {
  if (depth > MAX_DEPTH) {
    ctx.truncated = true;
    return;
  }
  const { ignoreKeys, unorderedArrays, tolerance } = ctx.options;

  const leftKeys = isPlainObject(a) ? Object.keys(a) : [];
  const rightKeys = isPlainObject(b) ? Object.keys(b) : [];
  const ignored = new Set([...leftKeys, ...rightKeys].filter((key) => ignoreKeys.includes(key)));
  if (ignored.size > 0) ctx.ignored += ignored.size;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (unorderedArrays) {
      compareUnordered(a, b, tokens, ctx);
      return;
    }
    const shared = Math.min(a.length, b.length);
    for (let index = 0; index < shared; index += 1) walk(a[index], b[index], [...tokens, index], ctx, depth + 1);
    for (let index = shared; index < a.length; index += 1) {
      if (isPlainObject(a[index])) walk(a[index], {}, [...tokens, index], ctx, depth + 1);
      else push(ctx, 'removed', [...tokens, index], a[index], undefined);
    }
    for (let index = shared; index < b.length; index += 1) {
      if (isPlainObject(b[index])) walk({}, b[index], [...tokens, index], ctx, depth + 1);
      else push(ctx, 'added', [...tokens, index], undefined, b[index]);
    }
    return;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    for (const key of rightKeys) {
      if (ignored.has(key)) continue;
      if (!(key in a)) {
        if (isPlainObject(b[key])) walk({}, b[key], [...tokens, key], ctx, depth + 1);
        else push(ctx, 'added', [...tokens, key], undefined, b[key]);
        continue;
      }
      walk(a[key], b[key], [...tokens, key], ctx, depth + 1);
    }
    for (const key of leftKeys) {
      if (ignored.has(key) || key in b) continue;
      if (isPlainObject(a[key])) walk(a[key], {}, [...tokens, key], ctx, depth + 1);
      else push(ctx, 'removed', [...tokens, key], a[key], undefined);
    }
    return;
  }

  if (typeName(a) !== typeName(b)) {
    push(ctx, 'type', tokens, a, b);
    return;
  }
  if (!sameValue(a, b, tolerance)) push(ctx, 'changed', tokens, a, b);
}

export function compareJson(left: unknown, right: unknown, options: CompareOptions): CompareResult {
  const ctx: WalkContext = { options, out: [], ignored: 0, truncated: false };
  walk(left, right, [], ctx, 0);
  const added = ctx.out.filter((item) => item.kind === 'added').length;
  const removed = ctx.out.filter((item) => item.kind === 'removed').length;
  const changed = ctx.out.filter((item) => item.kind === 'changed' || item.kind === 'type').length;
  return {
    changes: ctx.out,
    identical: ctx.out.length === 0 && !ctx.truncated,
    added,
    removed,
    changed,
    truncated: ctx.truncated,
    ignored: ctx.ignored,
  };
}
