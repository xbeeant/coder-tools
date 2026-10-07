import type { JsonType } from './json-convert';

/** 转换过程中的「丢弃」哨兵：对象里的 null 在 skip 模式下会被剔除。 */
const OMIT: unique symbol = Symbol('omit');
type Converted = unknown | typeof OMIT;

export interface ShapeField {
  /** 原始 JSON 键。 */
  key: string;
  /** 生成代码里使用的属性名（已转为合法标识符）。 */
  name: string;
  /** 属性名是否与原始键不同（说明发生了改名）。 */
  changed: boolean;
  /** 在样本中出现的次数，用于判断可选字段。 */
  seen: number;
  shape: Shape;
}

export interface Shape {
  /** 观察到的类型集合，超过一个即为联合类型。 */
  kinds: JsonType[];
  /** 对象字段，按首次出现顺序排列。 */
  fields?: ShapeField[];
  /** 数组元素的合并形态。 */
  item?: Shape;
  /** 数组的最大长度。 */
  maxLength?: number;
  /** 参与合并的对象实例数。 */
  sampleCount?: number;
  /** 数字里出现过小数（用于区分 int / double / float64）。 */
  hasFloat?: boolean;
  /** 数字里出现过超出 32 位范围的整数（用于区分 int / long / int64）。 */
  hasBig?: boolean;
}

const EMPTY_SHAPE: Shape = { kinds: ['null'] };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isObjectNode(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeShape(a: Shape, b: Shape): Shape {
  if (a.kinds.length === 0) return b;
  if (b.kinds.length === 0) return a;
  const merged: Shape = {
    kinds: unique([...a.kinds, ...b.kinds]),
    hasFloat: Boolean(a.hasFloat || b.hasFloat),
    hasBig: Boolean(a.hasBig || b.hasBig),
  };
  if (merged.kinds.includes('object')) {
    const fields: ShapeField[] = a.fields?.map((field) => ({ ...field })) ?? [];
    for (const field of b.fields ?? []) {
      const existing = fields.find((item) => item.key === field.key);
      if (existing) {
        existing.shape = mergeShape(existing.shape, field.shape);
        existing.seen += field.seen;
      } else {
        fields.push({ ...field });
      }
    }
    merged.fields = fields;
    merged.sampleCount = (a.sampleCount ?? 0) + (b.sampleCount ?? 1);
  }
  if (merged.kinds.includes('array')) {
    // 空数组不带元素类型，避免把 null 混进元素类型里。
    const item = a.item && b.item ? mergeShape(a.item, b.item) : (a.item ?? b.item);
    if (item) merged.item = item;
    merged.maxLength = Math.max(a.maxLength ?? 0, b.maxLength ?? 0);
  }
  return merged;
}

export interface ConvertOptions {
  /** null 的处理方式，默认 empty（转成空字符串）。 */
  nullAs?: 'empty' | 'skip';
  /** 视为保留字的标识符集合（各语言不同）。 */
  reserved?: Set<string>;
}

function convertNode(value: unknown, options: ConvertOptions): Converted {
  if (value === null || value === undefined) return options.nullAs === 'skip' ? OMIT : { kinds: ['null'] };
  if (Array.isArray(value)) {
    let item: Shape | undefined;
    for (const entry of value) {
      const converted = convertNode(entry, options);
      if (converted === OMIT) continue;
      const shape = converted as Shape;
      item = item === undefined ? shape : mergeShape(item, shape);
    }
    return { kinds: ['array'], item, maxLength: value.length };
  }
  if (isObjectNode(value)) {
    const fields: ShapeField[] = [];
    const usedNames = new Set<string>();
    for (const [key, entry] of Object.entries(value)) {
      const converted = convertNode(entry, options);
      if (converted === OMIT) continue;
      const base = toIdentifier(key, options.reserved);
      let name = base.name;
      let counter = 1;
      while (usedNames.has(name)) {
        counter += 1;
        name = `${base.name}_${counter}`;
      }
      usedNames.add(name);
      fields.push({ key, name, changed: name !== key, seen: 1, shape: converted as Shape });
    }
    return { kinds: ['object'], fields, sampleCount: 1 };
  }
  if (typeof value === 'boolean') return { kinds: ['boolean'] };
  if (typeof value === 'number') {
    return { kinds: ['number'], hasFloat: !Number.isInteger(value), hasBig: Math.abs(value) > 2_147_483_647 };
  }
  if (typeof value === 'bigint') return { kinds: ['number'], hasBig: true };
  return { kinds: ['string'] };
}

// ─────────────────────── 标识符与命名 ───────────────────────

/** 会与目标语言内建类型 / 包名冲突的类型名，分配类型名时补 Item 后缀。 */
const CONTAINER_RESERVED = new Set(['Array', 'Dict', 'List', 'Map', 'Object', 'Record', 'Set', 'Slice', 'String']);

const JS_RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'any',
  'boolean',
  'constructor',
  'declare',
  'get',
  'infer',
  'interface',
  'is',
  'keyof',
  'module',
  'namespace',
  'never',
  'readonly',
  'require',
  'number',
  'object',
  'set',
  'string',
  'symbol',
  'type',
  'undefined',
  'unique',
  'unknown',
  'from',
  'of',
  'as',
  'implements',
  'private',
  'protected',
  'public',
  'static',
  'abstract',
  'await',
]);

const JAVA_RESERVED = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'try',
  'void',
  'volatile',
  'while',
  'true',
  'false',
  'null',
  'var',
  'record',
  'String',
  'Integer',
  'Long',
  'Double',
  'Float',
  'Boolean',
  'Character',
  'Byte',
  'Short',
  'Object',
  'List',
  'Map',
  'Set',
  'Number',
]);

const PYTHON_RESERVED = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
  'str',
  'int',
  'float',
  'bool',
  'list',
  'dict',
  'set',
  'tuple',
  'bytes',
  'object',
  'type',
  'id',
  'input',
  'self',
  'field',
]);

const GO_RESERVED = new Set([
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var',
  'any',
  'bool',
  'byte',
  'comparable',
  'complex64',
  'complex128',
  'error',
  'float32',
  'float64',
  'int',
  'int8',
  'int16',
  'int32',
  'int64',
  'rune',
  'string',
  'uint',
  'uint8',
  'uint16',
  'uint32',
  'uint64',
  'uintptr',
  'true',
  'false',
  'nil',
  'iota',
  'len',
  'cap',
  'make',
  'new',
  'append',
  'copy',
  'delete',
  'panic',
  'recover',
  'print',
  'println',
]);

/** 属性名修正记录，用于 UI 提示「哪些键被改名了」。 */
export interface NameFix {
  path: string;
  key: string;
  name: string;
}

const IDENT_OK = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/**
 * 把任意 JSON 键转成合法标识符：
 * 合法标识符原样保留（含中文等 Unicode 字母），其余按分隔符切分转成驼峰，
 * 数字开头补下划线，命中语言保留字时追加下划线。
 */
export function toIdentifier(key: string, reserved: Set<string> = JS_RESERVED): { name: string; changed: boolean } {
  const trimmed = key.trim();
  if (IDENT_OK.test(trimmed) && !reserved.has(trimmed)) return { name: trimmed, changed: false };

  const parts = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let name = parts
    .map((part, index) => (index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('');
  if (name === '') name = '_';
  if (/^\p{N}/u.test(name)) name = `_${name}`;
  if (!IDENT_OK.test(name)) name = `_${name}`;
  if (reserved.has(name)) name = `${name}_`;
  return { name, changed: name !== key };
}

export function pascalCase(name: string): string {
  const head = [...name][0] ?? '';
  return `${head.toUpperCase()}${name.slice(head.length)}`;
}

/** 收集所有被改名的键路径。 */
export function collectNameFixes(value: unknown, reserved: Set<string> = JS_RESERVED): NameFix[] {
  const fixes: NameFix[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}[${index}]`);
      });
      return;
    }
    if (!isObjectNode(node)) return;
    for (const [key, entry] of Object.entries(node)) {
      const { name, changed } = toIdentifier(key, reserved);
      const childPath = path === '' ? key : `${path}.${key}`;
      if (changed) fixes.push({ path: childPath, key, name });
      walk(entry, childPath);
    }
  };
  walk(value, '');
  return fixes;
}

// ─────────────────────── 形态构建与命名 ───────────────────────

export interface ShapeBundle {
  root: Shape;
  /** 形状 → 类型名，根节点与所有嵌套对象都有名字。 */
  names: Map<Shape, string>;
  /** 类型名的定义顺序（父在子之前）。 */
  order: Shape[];
  rootName: string;
}

/** 由样例值构建合并后的形态。 */
export function buildShape(value: unknown, options: ConvertOptions = {}): Shape {
  const converted = convertNode(value, options);
  return converted === OMIT ? EMPTY_SHAPE : (converted as Shape);
}

/** 构建形态并为每个对象类型分配 PascalCase 名字。 */
export function buildShapeBundle(value: unknown, rootName = 'Root', options: ConvertOptions = {}): ShapeBundle {
  const root = buildShape(value, options);
  const names = new Map<Shape, string>();
  const order: Shape[] = [];
  const used = new Set<string>();

  const allocate = (shape: Shape, hint: string): string => {
    let hintName = pascalCase(toIdentifier(hint, JS_RESERVED).name) || 'Item';
    // List / Map / Set 之类会与 java.util、Python、Go 的内建类型或包名撞车，统一补 Item 后缀。
    if (CONTAINER_RESERVED.has(hintName)) hintName = `${hintName}Item`;
    const base = hintName;
    let name = base;
    let counter = 1;
    while (used.has(name)) {
      counter += 1;
      name = `${base}${counter}`;
    }
    used.add(name);
    names.set(shape, name);
    order.push(shape);
    return name;
  };

  const walk = (shape: Shape, hint: string): void => {
    // 纯数组（含根数组）时元素类型直接继承上层名字，避免出现 UserItem 这类多余命名。
    if (shape.kinds.includes('array') && !shape.kinds.includes('object')) {
      if (shape.item) walk(shape.item, hint);
      return;
    }
    if (shape.kinds.includes('object')) {
      allocate(shape, hint);
      for (const field of shape.fields ?? []) walk(field.shape, field.name);
      return;
    }
    if (shape.item) walk(shape.item, `${hint}Item`);
  };

  walk(root, rootName);
  return { root, names, order, rootName: names.get(root) ?? rootName };
}

function nonNullKinds(shape: Shape): JsonType[] {
  return unique(shape.kinds.filter((kind) => kind !== 'null'));
}

/** 字段是否可选：在样本的每个对象实例里都出现才算必填。 */
export function isFieldOptional(field: ShapeField, parent: Shape): boolean {
  return field.seen < (parent.sampleCount ?? 1);
}

// ─────────────────────── TypeScript ───────────────────────

function wrapTsType(text: string): string {
  return /[|&]/.test(text) ? `(${text})` : text;
}

/** 形态对应的 TS 类型文本。 */
export function tsTypeOfShape(shape: Shape, names: Map<Shape, string>, nullable = false): string {
  const kinds = nonNullKinds(shape);
  const hasNull = shape.kinds.includes('null') || nullable;
  const parts: string[] = [];
  for (const kind of kinds) {
    if (kind === 'array') {
      parts.push(`${wrapTsType(tsTypeOfShape(shape.item ?? EMPTY_SHAPE, names, nullable))}[]`);
    } else if (kind === 'object') {
      parts.push(names.get(shape) ?? 'Record<string, unknown>');
    } else {
      parts.push(kind);
    }
  }
  if (parts.length === 0) return hasNull ? 'null' : 'unknown';
  const text = parts.length === 1 ? (parts[0] as string) : parts.join(' | ');
  return hasNull ? `${text} | null` : text;
}

/** 推断任意 JSON 值的 TS 类型文本（单行）。 */
export function inferTsType(value: unknown): string {
  const bundle = buildShapeBundle(value);
  return tsTypeOfShape(bundle.root, bundle.names);
}

export interface TsOptions {
  rootName?: string;
  /** 用 type 别名代替 interface。 */
  useTypeAlias?: boolean;
  /** 所有字段都视为可空。 */
  nullable?: boolean;
  /** 是否导出（加 export 前缀）。 */
  exported?: boolean;
  /** null 字段的处理方式：empty 记为 string|null，skip 直接丢弃该字段。 */
  nullAs?: 'empty' | 'skip';
}

/** 生成 TypeScript interface / type 声明。 */
export function generateTs(value: unknown, options: TsOptions = {}): string {
  const { rootName = 'Root', useTypeAlias = false, nullable = false, exported = false, nullAs = 'empty' } = options;
  const bundle = buildShapeBundle(value, rootName, { reserved: JS_RESERVED, nullAs });
  const keyword = useTypeAlias ? 'type' : 'interface';
  const prefix = exported ? 'export ' : '';
  const blocks: string[] = [];

  for (const shape of bundle.order) {
    if (!shape.kinds.includes('object')) continue;
    const lines: string[] = [`${prefix}${keyword} ${bundle.names.get(shape) as string} {`];
    for (const field of shape.fields ?? []) {
      const optional = isFieldOptional(field, shape) ? '?' : '';
      lines.push(`  ${field.name}${optional}: ${tsTypeOfShape(field.shape, bundle.names, nullable)};`);
    }
    lines.push('}');
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

// ─────────────────────── Java ───────────────────────

function javaTypeOfShape(shape: Shape, names: Map<Shape, string>): string {
  const kinds = nonNullKinds(shape);
  if (kinds.length === 0) return 'String';
  // Java 没有联合类型，多形态一律退化成 Object；null 会被静默忽略。
  if (kinds.length > 1) return 'Object';
  const kind = kinds[0] as JsonType;
  if (kind === 'array') return `List<${javaTypeOfShape(shape.item ?? EMPTY_SHAPE, names)}>`;
  if (kind === 'object') return names.get(shape) ?? 'Object';
  if (kind === 'boolean') return 'boolean';
  if (kind === 'number') {
    if (shape.hasFloat) return 'Double';
    return shape.hasBig ? 'Long' : 'Integer';
  }
  return 'String';
}

export interface JavaOptions {
  rootName?: string;
  /** 是否生成 getter/setter，默认 true。 */
  accessors?: boolean;
  /** 是否生成 toString，默认 true。 */
  toStringMethod?: boolean;
  /** null 字段的处理方式：empty 记为 String，skip 直接丢弃该字段。 */
  nullAs?: 'empty' | 'skip';
}

/** 生成 Java POJO（嵌套静态类 + getter/setter + toString）。 */
export function generateJava(value: unknown, options: JavaOptions = {}): string {
  const { rootName = 'Root', accessors = true, toStringMethod = true, nullAs = 'empty' } = options;
  const bundle = buildShapeBundle(value, rootName, { reserved: JAVA_RESERVED, nullAs });
  const objects = bundle.order.filter((shape) => shape.kinds.includes('object'));
  if (objects.length === 0) return '// 样例中没有对象结构，无法生成 Java 类';

  // 顶层宿主类：根是对象就用根，否则用根数组的元素类型，保证输出是可直接编译的单文件。
  const host = bundle.root.kinds.includes('object')
    ? bundle.root
    : ((bundle.root.item?.kinds.includes('object') ? bundle.root.item : undefined) ?? (objects[0] as Shape));
  const usesList = JSON.stringify(value).includes('[');

  // 逐层嵌套输出：每渲染完一个类就标记，父类的其余类型作为它的 static 内部类。
  const emitted = new Set<Shape>();

  const renderClass = (shape: Shape, depth: number): string[] => {
    emitted.add(shape);
    const indent = '  '.repeat(depth);
    const className = bundle.names.get(shape) as string;
    const fields = shape.fields ?? [];
    const lines: string[] = [`${indent}public ${depth > 0 ? 'static ' : ''}class ${className} {`];

    for (const field of fields) {
      lines.push(`${indent}  private ${javaTypeOfShape(field.shape, bundle.names)} ${field.name};`);
    }
    if (accessors && fields.length > 0) {
      lines.push('');
      for (const field of fields) {
        const type = javaTypeOfShape(field.shape, bundle.names);
        const suffix = pascalCase(field.name);
        lines.push(`${indent}  public ${type} get${suffix}() {`);
        lines.push(`${indent}    return ${field.name};`);
        lines.push(`${indent}  }`);
        lines.push('');
        lines.push(`${indent}  public void set${suffix}(${type} ${field.name}) {`);
        lines.push(`${indent}    this.${field.name} = ${field.name};`);
        lines.push(`${indent}  }`);
        lines.push('');
      }
      lines.pop();
    }
    if (toStringMethod) {
      const pairs = fields.map((field) => `"${field.name}=" + ${field.name}`);
      const tail = fields.length > 0 ? ' + "}"' : '}';
      lines.push('');
      lines.push(`${indent}  @Override`);
      lines.push(`${indent}  public String toString() {`);
      lines.push(`${indent}    return "${className}{" + ${pairs.join(' + ", " + ')}${tail};`);
      lines.push(`${indent}  }`);
    }
    lines.push(`${indent}}`);
    return lines;
  };

  const head: string[] = [];
  if (usesList) head.push('import java.util.List;', '');
  const hostLines = renderClass(host, 0);
  // 剩余类型作为宿主类的 static 内部类，保证整个输出是单个可编译的 public class。
  for (const shape of objects) {
    if (emitted.has(shape)) continue;
    hostLines.splice(hostLines.length - 1, 0, '', ...renderClass(shape, 1));
  }
  head.push(...hostLines);
  return head.join('\n');
}
// ─────────────────────── Python ───────────────────────

function pythonScalarType(kind: JsonType, shape: Shape): string {
  if (kind === 'number') return shape.hasFloat ? 'float' : 'int';
  if (kind === 'boolean') return 'bool';
  return 'str';
}

function pythonTypeOfShape(shape: Shape, names: Map<Shape, string>): string {
  const kinds = nonNullKinds(shape);
  const hasNull = shape.kinds.includes('null');
  let text: string;
  if (kinds.length === 0) text = 'Any';
  else if (kinds.length === 1) {
    const kind = kinds[0] as JsonType;
    if (kind === 'array') text = `List[${pythonTypeOfShape(shape.item ?? EMPTY_SHAPE, names)}]`;
    else if (kind === 'object') text = names.get(shape) ?? 'Dict[str, Any]';
    else text = pythonScalarType(kind, shape);
  } else {
    const parts = kinds.map((kind) =>
      kind === 'object' ? (names.get(shape) ?? 'Dict[str, Any]') : pythonScalarType(kind, shape),
    );
    text = `Union[${parts.join(', ')}]`;
  }
  return hasNull ? `Optional[${text}]` : text;
}

export interface PythonOptions {
  rootName?: string;
  /** TypedDict 模式（依赖 Python 3.11+ 的 NotRequired）。 */
  typedDict?: boolean;
  /** null 字段的处理方式：empty 记为 str | None，skip 直接丢弃该字段。 */
  nullAs?: 'empty' | 'skip';
}

/** 生成 Python @dataclass 或 TypedDict。类按「先子后父」排列，保证注解在定义时即可求值。 */
export function generatePython(value: unknown, options: PythonOptions = {}): string {
  const { rootName = 'Root', typedDict = false, nullAs = 'empty' } = options;
  const bundle = buildShapeBundle(value, rootName, { reserved: PYTHON_RESERVED, nullAs });
  const classNames = new Set(bundle.order.map((shape) => bundle.names.get(shape) as string));

  // 只导入真正用到的 typing 名字，保持头部干净。
  const typingNames = new Set<string>(typedDict ? ['TypedDict', 'NotRequired'] : ['Optional']);
  let usesFieldHelper = false;
  for (const shape of bundle.order) {
    for (const field of shape.fields ?? []) {
      const type = pythonTypeOfShape(field.shape, bundle.names);
      for (const token of type.match(/[A-Z][A-Za-z]*/g) ?? []) typingNames.add(token);
      if (!typedDict && /^List\[/.test(type)) usesFieldHelper = true;
    }
  }
  const imports = [...typingNames].filter((name) => !classNames.has(name)).sort();
  const header = typedDict
    ? `from typing import ${imports.join(', ')}`
    : `from dataclasses import ${usesFieldHelper ? 'dataclass, field' : 'dataclass'}\nfrom typing import ${imports.join(', ')}`;

  const blocks: string[] = [header];
  // 逆序遍历：嵌套类先于外层类定义，注解里的类型名始终已经存在。
  for (const shape of [...bundle.order].reverse()) {
    if (!shape.kinds.includes('object')) continue;
    const name = bundle.names.get(shape) as string;
    const fields = shape.fields ?? [];
    const required: string[] = [];
    const optional: string[] = [];
    for (const field of fields) {
      const type = pythonTypeOfShape(field.shape, bundle.names);
      if (typedDict) {
        required.push(`    ${field.name}: ${isFieldOptional(field, shape) ? 'NotRequired ' : ''}${type}`);
        continue;
      }
      // dataclass 中带默认值的字段必须排在后面，因此拆成两段输出。
      if (/^List\[/.test(type)) {
        optional.push(`    ${field.name}: ${type} = field(default_factory=list)`);
      } else if (isFieldOptional(field, shape) || type.startsWith('Optional[')) {
        optional.push(`    ${field.name}: ${type} = None`);
      } else {
        required.push(`    ${field.name}: ${type}`);
      }
    }
    const body = [...required, ...optional];
    const lines: string[] = typedDict ? [`class ${name}(TypedDict):`] : ['@dataclass', `class ${name}:`];
    if (body.length === 0) lines.push('    pass');
    else lines.push(...body);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n\n');
}

// ─────────────────────── Go ───────────────────────

function goTypeOfShape(shape: Shape, names: Map<Shape, string>, pointer: boolean): string {
  const kinds = nonNullKinds(shape);
  if (kinds.length !== 1) return 'any';
  const kind = kinds[0] as JsonType;
  let text: string;
  if (kind === 'array') text = `[]${goTypeOfShape(shape.item ?? EMPTY_SHAPE, names, false)}`;
  else if (kind === 'object') text = names.get(shape) ?? 'map[string]any';
  else if (kind === 'boolean') text = 'bool';
  else if (kind === 'number') text = shape.hasFloat ? 'float64' : 'int64';
  else text = 'string';
  const nullable = shape.kinds.includes('null') || pointer;
  return nullable ? `*${text}` : text;
}

export interface GoOptions {
  rootName?: string;
  /** 缺失（可选）字段用指针表示，默认 true。 */
  pointers?: boolean;
  /** null 字段的处理方式：empty 记为 *string，skip 直接丢弃该字段。 */
  nullAs?: 'empty' | 'skip';
}

/** 生成 Go struct（带 json tag）。 */
export function generateGo(value: unknown, options: GoOptions = {}): string {
  const { rootName = 'Root', pointers = true, nullAs = 'empty' } = options;
  const bundle = buildShapeBundle(value, rootName, { reserved: GO_RESERVED, nullAs });
  const blocks: string[] = [];

  for (const shape of bundle.order) {
    if (!shape.kinds.includes('object')) continue;
    const rows: { field: string; type: string; tag: string }[] = [];
    for (const field of shape.fields ?? []) {
      const optional = isFieldOptional(field, shape);
      rows.push({
        field: pascalCase(field.name),
        type: goTypeOfShape(field.shape, bundle.names, pointers && optional),
        tag: `\`json:"${field.key}${optional ? ',omitempty' : ''}"\``,
      });
    }
    const width = rows.reduce((max, row) => Math.max(max, row.field.length), 0);
    const body = rows.map((row) => `  ${row.field.padEnd(width)} ${row.type} ${row.tag}`).join('\n');
    blocks.push(`type ${bundle.names.get(shape) as string} struct {\n${body}\n}`);
  }
  return blocks.join('\n\n');
}

// ─────────────────────── SQL DDL ───────────────────────

function quoteSqlIdent(name: string): string {
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

function sqlTypeOfShape(shape: Shape): string {
  const kinds = nonNullKinds(shape);
  if (kinds.length !== 1) return 'TEXT';
  const kind = kinds[0] as JsonType;
  if (kind === 'boolean') return 'BOOLEAN';
  if (kind === 'number') return shape.hasFloat ? 'DOUBLE PRECISION' : 'BIGINT';
  if (kind === 'string') return 'TEXT';
  if (kind === 'object' || kind === 'array') return 'JSON';
  return 'TEXT';
}

export interface SqlOptions {
  /** 表名，默认取根类型名或 items。 */
  tableName?: string;
  /** 主键字段名候选正则，默认 id / *_id / uuid / code / key。 */
  primaryKeyPattern?: string;
  /** null 字段的处理方式：empty 记为 NULL，skip 直接丢弃该列。 */
  nullAs?: 'empty' | 'skip';
}

/** 由样例推断 CREATE TABLE 语句（嵌套结构统一存 JSON 列）。 */
export function generateSqlDdl(value: unknown, options: SqlOptions = {}): string {
  const { tableName, primaryKeyPattern = '^(id|.*_id|uuid|code|key)$', nullAs = 'empty' } = options;
  const sample = Array.isArray(value) && value.every(isObjectNode) ? (value[0] as Record<string, unknown>) : value;
  if (!isObjectNode(sample)) throw new Error('SQL 建表需要对象或对象数组作为样例');

  const root = tableName ?? 'items';
  const rows: string[] = [];
  for (const [key, entry] of Object.entries(sample)) {
    if (entry === null && nullAs === 'skip') continue;
    const shape = buildShape(entry, { nullAs });
    const nullable = entry === null;
    const constraints: string[] = [nullable ? 'NULL' : 'NOT NULL'];
    if (!nullable && shape.kinds.includes('number') && new RegExp(primaryKeyPattern, 'i').test(key)) {
      constraints.push('PRIMARY KEY');
    }
    rows.push(`  ${quoteSqlIdent(key)} ${sqlTypeOfShape(shape)} ${constraints.join(' ')}`);
  }

  return [
    '-- 由 JSON 样例推断；嵌套对象与数组统一存为 JSON 列，请按业务需要拆表',
    `CREATE TABLE ${quoteSqlIdent(root)} (`,
    rows.join(',\n'),
    ');',
  ].join('\n');
}

// ─────────────────────── JSON Schema draft-07 ───────────────────────

/** 由样例推断 JSON Schema（draft-07）。 */
export function generateJsonSchema(value: unknown, title?: string, options: ConvertOptions = {}): string {
  const bundle = buildShapeBundle(value, title ?? 'Root', options);
  const schemaOf = (shape: Shape): Record<string, unknown> => {
    const kinds = nonNullKinds(shape);
    const typeList: string[] = kinds.length > 0 ? [...kinds] : ['null'];
    if (shape.kinds.includes('null') && !typeList.includes('null')) typeList.push('null');
    if (typeList.length === 1 && typeList[0] === 'number' && !shape.hasFloat) typeList[0] = 'integer';
    const out: Record<string, unknown> = { type: typeList.length === 1 ? typeList[0] : typeList };
    if (shape.kinds.includes('array')) out.items = schemaOf(shape.item ?? EMPTY_SHAPE);
    if (shape.kinds.includes('object')) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const field of shape.fields ?? []) {
        properties[field.key] = schemaOf(field.shape);
        if (!isFieldOptional(field, shape)) required.push(field.key);
      }
      out.properties = properties;
      if (required.length > 0) out.required = required;
      out.additionalProperties = false;
    }
    return out;
  };

  const root = schemaOf(bundle.root);
  return JSON.stringify(
    { $schema: 'http://json-schema.org/draft-07/schema#', title: bundle.rootName, ...root },
    null,
    2,
  );
}

// ─────────────────────── 假数据生成 ───────────────────────

export interface SampleOptions {
  /** 随机种子，相同种子结果可复现。 */
  seed?: number;
  /** 数组生成几个元素，默认 1。 */
  arrayLength?: number;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const STRING_HINTS: { pattern: RegExp; make: (rand: () => number) => string }[] = [
  { pattern: /mail/i, make: () => 'user@example.com' },
  { pattern: /phone|mobile|tel/i, make: () => '13800000000' },
  { pattern: /url|uri|link|site/i, make: () => 'https://example.com/page' },
  { pattern: /image|img|avatar|icon|pic|photo/i, make: () => 'https://example.com/image.png' },
  { pattern: /time|date|created|updated|_at$/i, make: () => '2024-01-01T00:00:00.000Z' },
  { pattern: /uuid/i, make: (rand) => `0000${Math.floor(rand() * 9000 + 1000)}-0000-4000-8000-000000000000` },
  { pattern: /(^|_)id$/i, make: () => '1001' },
  { pattern: /name|user|title|author/i, make: () => '示例名称' },
  { pattern: /desc|content|text|remark|comment|note|message/i, make: () => '示例文本内容' },
  { pattern: /code|serial|no$/i, make: (rand) => `CODE-${Math.floor(rand() * 9000 + 1000)}` },
  { pattern: /status|type|kind|category|state/i, make: () => 'active' },
  { pattern: /color/i, make: () => '#4f46e5' },
];

function sampleString(key: string, rand: () => number): string {
  // 列表元素的键是自动加的后缀，先剥掉再匹配，避免误命中。
  const bare = key.replace(/Item$/i, '') || key;
  for (const hint of STRING_HINTS) {
    if (hint.pattern.test(bare)) return hint.make(rand);
  }
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  return words[Math.floor(rand() * words.length)] as string;
}

/** 按推断出的形态生成一份符合结构的假数据。 */
export function generateSample(value: unknown, options: SampleOptions = {}): unknown {
  const { seed = 20240101, arrayLength = 1 } = options;
  const rand = mulberry32(seed);
  const shape = buildShape(value);

  const fromShape = (node: Shape, key: string, depth: number): unknown => {
    if (depth > 6) return null;
    const kind = nonNullKinds(node)[0];
    if (kind === undefined) return null;
    if (kind === 'object') {
      const out: Record<string, unknown> = {};
      for (const field of node.fields ?? []) out[field.key] = fromShape(field.shape, field.key, depth + 1);
      return out;
    }
    if (kind === 'array') {
      return Array.from({ length: Math.max(1, arrayLength) }, () =>
        fromShape(node.item ?? EMPTY_SHAPE, `${key}Item`, depth + 1),
      );
    }
    if (kind === 'boolean') return rand() > 0.5;
    if (kind === 'number') return node.hasFloat ? Number((rand() * 1000).toFixed(2)) : Math.floor(rand() * 1000);
    return sampleString(key, rand);
  };

  return fromShape(shape, 'root', 0);
}

/** 生成假数据并序列化为格式化 JSON 文本。 */
export function generateSampleText(value: unknown, options: SampleOptions & { indent?: number } = {}): string {
  const { indent = 2 } = options;
  return JSON.stringify(generateSample(value, options), null, indent);
}

// ─────────────────────── 类型树（UI 用） ───────────────────────

export interface ShapeRow {
  depth: number;
  name: string;
  /** 语言无关的类型描述，例如 `string | null`、`array<object(3)>`。 */
  type: string;
  detail: string;
}

function describeShape(shape: Shape): string {
  const parts: string[] = nonNullKinds(shape).map((kind) => {
    if (kind === 'array') return `array<${describeShape(shape.item ?? EMPTY_SHAPE)}>`;
    if (kind === 'object') return `object(${shape.fields?.length ?? 0})`;
    return kind;
  });
  if (shape.kinds.includes('null')) parts.push('null');
  return parts.length > 0 ? parts.join(' | ') : 'null';
}

/** 把形态拍平成可渲染的类型树行（父在子之前）。 */
export function shapeRows(bundle: ShapeBundle): ShapeRow[] {
  const rows: ShapeRow[] = [];
  const seen = new Set<Shape>();
  const walk = (shape: Shape, name: string, depth: number): void => {
    if (seen.has(shape)) return;
    seen.add(shape);
    const details: string[] = [];
    if (shape.kinds.includes('array')) details.push(`最多 ${shape.maxLength ?? 0} 个元素`);
    if (shape.kinds.includes('object')) details.push(`${shape.fields?.length ?? 0} 个字段`);
    if (shape.kinds.includes('null')) details.push('可能为 null');
    rows.push({ depth, name, type: describeShape(shape), detail: details.join(' · ') });
    for (const field of shape.fields ?? []) walk(field.shape, field.name, depth + 1);
    // 数组元素本身是对象时才展开成子节点；元素类型已写在父行的 array<…> 里。
    const item = shape.item;
    if (item?.kinds.includes('object')) {
      // 根数组的元素类型会继承根名，这里补 Item 后缀避免出现两行同名节点。
      const itemName = bundle.names.get(item) ?? `${name}Item`;
      walk(item, itemName === name ? `${name}Item` : itemName, depth + 1);
    }
  };
  walk(bundle.root, bundle.rootName, 0);
  return rows;
}

/** 各语言保留字表，供 UI 显示改名提示。 */
export const CODE_LANGUAGE_RESERVED: Record<string, Set<string>> = {
  ts: JS_RESERVED,
  java: JAVA_RESERVED,
  python: PYTHON_RESERVED,
  go: GO_RESERVED,
};

/** 目标语言 / 产物列表，供 UI 的 Tab 使用。 */
export const CODE_TARGETS = [
  { value: 'ts', label: 'TypeScript', ext: 'ts' },
  { value: 'java', label: 'Java', ext: 'java' },
  { value: 'python', label: 'Python', ext: 'py' },
  { value: 'go', label: 'Go', ext: 'go' },
  { value: 'sql', label: 'SQL DDL', ext: 'sql' },
  { value: 'schema', label: 'JSON Schema', ext: 'schema.json' },
  { value: 'sample', label: '示例数据', ext: 'json' },
] as const;

export type CodeTarget = (typeof CODE_TARGETS)[number]['value'];
