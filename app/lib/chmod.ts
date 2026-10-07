/**
 * chmod 权限位计算库：八进制 / 符号 / 三元组 / 十进制 / ACL 简写互转，纯函数无副作用。
 * 位含义：r=4、w=2、x=1；setuid=u+s=4000、setgid=g+s=2000、sticky=+t=1000。
 */

export type Who = 'user' | 'group' | 'other';

export interface Triplet {
  r: boolean;
  w: boolean;
  x: boolean;
}

export interface Mode {
  user: Triplet;
  group: Triplet;
  other: Triplet;
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
}

export const WHO_LIST: Who[] = ['user', 'group', 'other'];

export const WHO_LABEL: Record<Who, string> = {
  user: '属主 u',
  group: '属组 g',
  other: '其他人 o',
};

export const BIT_LABEL: Record<'r' | 'w' | 'x', { value: number; name: string }> = {
  r: { value: 4, name: '读' },
  w: { value: 2, name: '写' },
  x: { value: 1, name: '执行/进入' },
};

export function emptyTriplet(): Triplet {
  return { r: false, w: false, x: false };
}

export function createMode(): Mode {
  return {
    user: emptyTriplet(),
    group: emptyTriplet(),
    other: emptyTriplet(),
    setuid: false,
    setgid: false,
    sticky: false,
  };
}

function tripletValue(triplet: Triplet): number {
  return (triplet.r ? 4 : 0) + (triplet.w ? 2 : 0) + (triplet.x ? 1 : 0);
}

function applyValue(target: Triplet, value: number): void {
  target.r = (value & 4) !== 0;
  target.w = (value & 2) !== 0;
  target.x = (value & 1) !== 0;
}

/** 三组权限位（不含特殊位），0~777。 */
export function permissionsValue(mode: Mode): number {
  return tripletValue(mode.user) * 64 + tripletValue(mode.group) * 8 + tripletValue(mode.other);
}

/** 特殊位数值之和，0~7000。 */
export function specialValue(mode: Mode): number {
  return (mode.setuid ? 4 : 0) * 1000 + (mode.setgid ? 2 : 0) * 1000 + (mode.sticky ? 1 : 0) * 1000;
}

/** 完整数值（八进制表示的数值），例如 0755 -> 493。 */
export function modeValue(mode: Mode): number {
  return permissionsValue(mode) + specialValue(mode);
}

/** 统一输出四位八进制字符串，例如 0755 / 4755 / 1777。 */
export function toOctal(mode: Mode, pad = 4): string {
  return modeValue(mode).toString(8).padStart(pad, '0');
}

/** 三位八进制（忽略特殊位），常用于 chmod 的简写。 */
export function toShortOctal(mode: Mode): string {
  return permissionsValue(mode).toString(8).padStart(3, '0');
}

export function fromOctal(text: string): Mode | null {
  const cleaned = text.trim().replace(/^0[oxb]/i, '');
  if (!/^[0-7]{1,4}$/.test(cleaned)) return null;
  const value = Number.parseInt(cleaned, 8);
  if (value < 0 || value > 0o7777) return null;
  const mode = createMode();
  applyValue(mode.user, Math.floor(value / 64) % 8);
  applyValue(mode.group, Math.floor(value / 8) % 8);
  applyValue(mode.other, value % 8);
  mode.setuid = (value & 0o4000) !== 0;
  mode.setgid = (value & 0o2000) !== 0;
  mode.sticky = (value & 0o1000) !== 0;
  return mode;
}

export function fromDecimal(value: number): Mode | null {
  if (!Number.isInteger(value) || value < 0 || value > 0o7777) return null;
  return fromOctal(value.toString(8));
}

/** 符号表示：rwxr-xr-x；特殊位在对应 x 位显示 s/S/t/T。 */
export function toSymbolic(mode: Mode): string {
  const part = (triplet: Triplet): string => `${triplet.r ? 'r' : '-'}${triplet.w ? 'w' : '-'}${triplet.x ? 'x' : '-'}`;
  let out = part(mode.user);
  if (mode.setuid) out = `${out.slice(0, 2)}${mode.user.x ? 's' : 'S'}`;
  out += part(mode.group);
  if (mode.setgid) out = `${out.slice(0, 5)}${mode.group.x ? 's' : 'S'}`;
  out += part(mode.other);
  if (mode.sticky) out = `${out.slice(0, 8)}${mode.other.x ? 't' : 'T'}`;
  return out;
}

export function fromSymbolic(text: string): Mode | null {
  const cleaned = text.trim();
  if (!/^[rwxstST-]{9,10}$/.test(cleaned)) return null;
  const mode = createMode();
  const read = (offset: number): Triplet => {
    const triplet = emptyTriplet();
    triplet.r = cleaned[offset] === 'r';
    triplet.w = cleaned[offset + 1] === 'w';
    triplet.x = cleaned[offset + 2] === 'x';
    return triplet;
  };
  mode.user = read(0);
  mode.group = read(3);
  mode.other = read(6);
  const specialChar = cleaned[3];
  if (specialChar === 's' || specialChar === 'S') mode.setuid = true;
  const gidChar = cleaned[6];
  if (gidChar === 's' || gidChar === 'S') mode.setgid = true;
  const stickyChar = cleaned[9];
  if (stickyChar === 't' || stickyChar === 'T') mode.sticky = true;
  return mode;
}

/** ACL 简写：u=rw,g=r,o=，特殊位追加 u=s / g=s / o=t。 */
export function toAcl(mode: Mode): string {
  const part = (triplet: Triplet): string => {
    let out = '';
    if (triplet.r) out += 'r';
    if (triplet.w) out += 'w';
    if (triplet.x) out += 'x';
    return out;
  };
  const parts = [`u=${part(mode.user)}`, `g=${part(mode.group)}`, `o=${part(mode.other)}`];
  if (mode.setuid) parts.push('u=s');
  if (mode.setgid) parts.push('g=s');
  if (mode.sticky) parts.push('o=t');
  return parts.join(',');
}

const CLAUSE_WHO: Record<string, Who[]> = {
  u: ['user'],
  g: ['group'],
  o: ['other'],
  a: ['user', 'group', 'other'],
};

/**
 * 解析 chmod 的符号子句，如 `u+x,go-w`、`a=rwx`、`u=rw,go=r`。
 * 支持 u/g/o/a 组合、r/w/x/s/t 权限、= + - 三种运算符。
 */
export function applySymbolicClauses(mode: Mode, clauses: string): Mode | null {
  const trimmed = clauses.trim();
  if (trimmed === '') return null;
  const next: Mode = {
    user: { ...mode.user },
    group: { ...mode.group },
    other: { ...mode.other },
    setuid: mode.setuid,
    setgid: mode.setgid,
    sticky: mode.sticky,
  };
  let touched = false;

  for (const rawClause of trimmed.split(',')) {
    const clause = rawClause.trim();
    if (clause === '') continue;
    const match = /^([ugoa]*)([=+-])([rwxXst]*)$/.exec(clause);
    if (match === null) return null;
    const whoSpec = match[1] as string;
    const operator = match[2] as string;
    const permSpec = match[3] as string;
    if (whoSpec === '' || permSpec === '') return null;

    const targets: Who[] = [];
    for (const letter of whoSpec) targets.push(...(CLAUSE_WHO[letter] ?? []));
    for (const who of targets) {
      if (operator === '=') {
        const triplet = next[who];
        // setgid 的目录与 chmod 语义：未显式给 x 时依 umask 由内核补充，这里保持显式结果。
        triplet.r = permSpec.includes('r');
        triplet.w = permSpec.includes('w');
        triplet.x = permSpec.includes('x') || permSpec.includes('X');
      } else {
        const sign = operator === '+' ? 1 : -1;
        if (permSpec.includes('r') || permSpec === 's' || permSpec === 't') {
          next[who].r = sign > 0 ? true : next[who].r && permSpec.includes('r');
        }
        if (permSpec.includes('w')) next[who].w = sign > 0 ? true : next[who].w && permSpec.includes('w');
        if (permSpec.includes('x') || permSpec.includes('X')) {
          next[who].x = sign > 0 ? true : next[who].x && permSpec.includes('x');
        }
      }
      if (permSpec.includes('s')) {
        if (who === 'user') next.setuid = operator !== '-';
        if (who === 'group') next.setgid = operator !== '-';
      }
      if (permSpec.includes('t') && who === 'other') next.sticky = operator !== '-';
      touched = true;
    }
  }
  return touched ? next : null;
}

export type ParsedModeKind = 'octal' | 'symbolic' | 'acl' | 'decimal';

export interface ParsedMode {
  kind: ParsedModeKind;
  mode: Mode;
  normalized: string;
}

/** 宽松解析任意权限写法：八进制、符号串、ACL/子句、十进制。 */
export function parseModeText(text: string): ParsedMode | null {
  const raw = text.trim();
  if (raw === '') return null;

  if (/^[0-7]{3,4}$/.test(raw)) {
    const mode = fromOctal(raw);
    return mode === null ? null : { kind: 'octal', mode, normalized: toOctal(mode) };
  }
  if (/^\d{1,4}$/.test(raw)) {
    const mode = fromDecimal(Number(raw));
    return mode === null ? null : { kind: 'decimal', mode, normalized: toOctal(mode) };
  }
  if (/^[rwxstST-]{9,10}$/.test(raw)) {
    const mode = fromSymbolic(raw);
    return mode === null ? null : { kind: 'symbolic', mode, normalized: toOctal(mode) };
  }
  const acl = applySymbolicClauses(createMode(), raw);
  if (acl !== null) return { kind: 'acl', mode: acl, normalized: toOctal(acl) };
  return null;
}

/* ── 位解释表 ─────────────────────────────────────────────────── */

export interface BitExplanation {
  who: Who;
  whoLabel: string;
  bit: 'r' | 'w' | 'x';
  bitLabel: string;
  value: number;
  octalDigit: number;
  granted: boolean;
  forFile: string;
  forDir: string;
}

const FILE_MEANING: Record<'r' | 'w' | 'x', string> = {
  r: '可读取文件内容',
  w: '可修改、截断或删除文件',
  x: '可作为程序执行（目录则是可进入）',
};

const DIR_MEANING: Record<'r' | 'w' | 'x', string> = {
  r: '可用 ls 列出目录里的文件名（不读到内容）',
  w: '可在目录中创建、删除、重命名文件',
  x: '可用 cd 进入目录、可按名字访问其中文件',
};

export function explainBits(mode: Mode): BitExplanation[] {
  const digits = permissionsValue(mode);
  const userValue = Math.floor(digits / 64);
  const groupValue = Math.floor(digits / 8) % 8;
  const otherValue = digits % 8;
  const values: Record<Who, number> = { user: userValue, group: groupValue, other: otherValue };
  const out: BitExplanation[] = [];
  for (const who of WHO_LIST) {
    const bits: ('r' | 'w' | 'x')[] = ['r', 'w', 'x'];
    bits.forEach((bit, index) => {
      out.push({
        who,
        whoLabel: WHO_LABEL[who],
        bit,
        bitLabel: `${BIT_LABEL[bit].name} (${BIT_LABEL[bit].value})`,
        value: BIT_LABEL[bit].value,
        octalDigit: 4 - index,
        granted: (values[who] & BIT_LABEL[bit].value) !== 0,
        forFile: FILE_MEANING[bit],
        forDir: DIR_MEANING[bit],
      });
    });
  }
  return out;
}

export interface SpecialBit {
  id: 'setuid' | 'setgid' | 'sticky';
  name: string;
  octal: string;
  symbolic: string;
  description: string;
  risk: string;
}

export const SPECIAL_BITS: SpecialBit[] = [
  {
    id: 'setuid',
    name: 'setuid',
    octal: '4000',
    symbolic: 'u+s',
    description: '属主执行时以文件属主的权限运行。',
    risk: '作用于脚本或可被属主改写的程序等于把提权口交出去，Linux 常忽略脚本上的 setuid。',
  },
  {
    id: 'setgid',
    name: 'setgid',
    octal: '2000',
    symbolic: 'g+s',
    description: '属组执行时以文件属组权限运行；对目录则新文件继承目录的属组。',
    risk: '对共享目录是有意设计，但如果目录对所有人可写，setgid 就失去了约束作用。',
  },
  {
    id: 'sticky',
    name: 'sticky bit',
    octal: '1000',
    symbolic: '+t',
    description: '目录中只有文件属主（与目录属主、root）能删除或重命名其中的文件。',
    risk: '只对目录有效；漏设会让任何用户删掉别人的文件（/tmp 因此必须是 1777）。',
  },
];

export function specialBitsOf(mode: Mode): SpecialBit[] {
  return SPECIAL_BITS.filter((bit) => mode[bit.id]);
}

/* ── 预设 ─────────────────────────────────────────────────────── */

export interface Preset {
  octal: string;
  name: string;
  useCase: string;
  risk?: string;
}

export const PRESETS: Preset[] = [
  { octal: '0644', name: '普通文件', useCase: '配置、源码、文档：属主可读写，其他人只读' },
  { octal: '0755', name: '可执行 / 脚本 / 目录', useCase: '命令、web 目录、可遍历目录' },
  {
    octal: '0600',
    name: '仅属主可读写',
    useCase: 'SSH 私钥、含密码的 .env、证书私钥',
    risk: '服务以非该用户运行时可能读不到',
  },
  { octal: '0700', name: '私有目录', useCase: '用户家目录下的 .ssh、.config' },
  { octal: '0664', name: '协作文件', useCase: '同组同事需要一起改的文件' },
  { octal: '0775', name: '协作目录', useCase: '同组可进入并新建文件' },
  { octal: '0444', name: '只读', useCase: '挂载只读、防止误改的产物' },
  {
    octal: '0000',
    name: '完全禁止',
    useCase: '临时封禁某个路径的访问',
    risk: '除 root 外任何人都无法恢复，出错时只能重挂或重启',
  },
  {
    octal: '1777',
    name: '/tmp 共享临时目录',
    useCase: '所有人可读写，但只能删除自己的文件（sticky）',
    risk: '任何用户都能新建文件占空间（DoS），长期存在时需要配合清理任务',
  },
  {
    octal: '4755',
    name: 'setuid 可执行',
    useCase: 'passwd、sudo 等特权程序',
    risk: '脚本或可被属主改写的程序不要设 setuid，否则等价于无密码 root',
  },
  {
    octal: '2755',
    name: 'setgid 目录',
    useCase: '共享组目录，新文件继承属组',
    risk: '目录若对所有人可写，setgid 会被绕过',
  },
  { octal: '4644', name: 'setuid + 只读', useCase: '特权程序且不需属主写入', risk: '同样要求二进制不可被属主改写' },
];

/* ── 命令行生成 ───────────────────────────────────────────────── */

export interface ChmodCommandOptions {
  recursive?: boolean;
  /** 符号写法（如 u+x,go-w），留空则用八进制。 */
  symbolic?: string;
  /** 附加的 chmod 选项，如 -R、--reference=other。 */
  extraOptions?: string;
}

export function buildChmodCommand(mode: Mode, targets: string[], options: ChmodCommandOptions = {}): string {
  const spec = options.symbolic !== undefined && options.symbolic !== '' ? options.symbolic : toShortOctal(mode);
  const parts = ['chmod'];
  if (options.recursive) parts.push('-R');
  if (options.extraOptions !== undefined && options.extraOptions.trim() !== '') {
    parts.push(options.extraOptions.trim());
  }
  parts.push(spec, ...targets);
  return parts.join(' ');
}

export interface ParsedChmodCommand {
  octal: string;
  symbolic: string;
  acl: string;
  recursive: boolean;
  options: string[];
  targets: string[];
  mode: Mode | null;
  error: string | null;
}

/** 反向解析 `chmod 755 file` / `chmod -R u+x,go-w dir` 这样的命令文本。 */
export function parseChmodCommand(text: string): ParsedChmodCommand {
  const trimmed = text.trim();
  const result: ParsedChmodCommand = {
    octal: '',
    symbolic: '',
    acl: '',
    recursive: false,
    options: [],
    targets: [],
    mode: null,
    error: null,
  };
  if (trimmed === '') {
    result.error = '请输入 chmod 命令';
    return result;
  }
  const tokens = tokenizeShell(trimmed).filter((token) => token !== '');
  const head = tokens[0];
  if (head !== undefined && /(^|\/)chmod$/.test(head)) tokens.shift();
  else if (head !== undefined && head.toLowerCase() === 'sudo') {
    tokens.shift();
    if (tokens[0] !== undefined && /(^|\/)chmod$/.test(tokens[0])) tokens.shift();
  }

  while (tokens.length > 0) {
    const token = tokens[0] as string;
    if (token === '-R' || token === '--recursive' || token === '-r') {
      result.recursive = true;
      tokens.shift();
      continue;
    }
    if (token.startsWith('-') && token !== '--') {
      result.options.push(token);
      tokens.shift();
      continue;
    }
    if (token.startsWith('--')) {
      const [name, ...rest] = token.split('=');
      result.options.push(rest.length > 0 ? `${name}=${rest.join('=')}` : (name as string));
      tokens.shift();
      continue;
    }
    break;
  }

  const spec = tokens.shift();
  if (spec === undefined) {
    result.error = '缺少权限参数';
    return result;
  }
  result.targets = tokens;
  const parsed = parseModeText(spec);
  if (parsed === null) {
    // 形如 chmod 644 的相对写法：从已有权限出发做加减无法还原，这里如实报错。
    result.error = `无法识别的权限写法：${spec}`;
    return result;
  }
  result.mode = parsed.mode;
  result.octal = toOctal(parsed.mode);
  result.symbolic = toSymbolic(parsed.mode);
  result.acl = toAcl(parsed.mode);
  return result;
}

/** 简易 shell 分词（单引号 / 双引号 / 反斜杠转义），chmod 解析够用。 */
function tokenizeShell(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '\\' && i + 1 < text.length) {
        current += text[i + 1];
        i += 1;
        continue;
      }
      if (char === '"') quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '\\' && i + 1 < text.length) {
      current += text[i + 1];
      i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== '') {
        out.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current !== '') out.push(current);
  return out;
}

/* ── 安全评估 ─────────────────────────────────────────────────── */

export type RiskLevel = 'danger' | 'warn' | 'info';

export interface RiskItem {
  level: RiskLevel;
  title: string;
  detail: string;
}

export function assessRisks(mode: Mode, isDirectory: boolean): RiskItem[] {
  const items: RiskItem[] = [];
  const permissions = permissionsValue(mode);
  const other = permissions % 8;

  if (other === 7) {
    items.push({
      level: 'danger',
      title: '其他人拥有 rwx（权限结尾是 7）',
      detail: '任何用户都能读、写、执行或删除。生产环境几乎总是权限过宽，改为 755 或更严。',
    });
  } else if ((other & 2) !== 0) {
    items.push({
      level: 'warn',
      title: '其他人可写',
      detail: '任何用户都能修改内容，等于把文件交给所有人。',
    });
  }
  if ((permissions & 0o022) !== 0) {
    items.push({
      level: 'warn',
      title: '属组或其他人可写',
      detail: '组内成员或外部用户可篡改内容；服务端配置建议改 644。',
    });
  }
  if (isDirectory && (permissions & 0o111) === 0) {
    items.push({
      level: 'danger',
      title: '目录缺少 x 权限',
      detail: '没有 x 就无法 cd 进入，也无法按名字访问其中文件；ls 仍能看到文件名列表。',
    });
  }
  if (isDirectory && (permissions & 0o444) !== 0 && (permissions & 0o111) === 0) {
    items.push({
      level: 'info',
      title: '典型的「只列不进」状态',
      detail: '例如 0444 的目录：能看到文件名，却读不到任何内容，通常是误配。',
    });
  }
  if (mode.setuid) {
    items.push({
      level: 'danger',
      title: 'setuid 位已设置',
      detail:
        '属主执行时获得属主权限。必须是不可被属主改写的二进制；脚本上的 setuid 会被 Linux 忽略且在别的系统上极其危险。',
    });
  }
  if (mode.setgid && isDirectory) {
    items.push({
      level: 'info',
      title: '目录设置了 setgid',
      detail: '新建文件会继承目录的属组，协作目录常用；确认属组本身权限不过宽。',
    });
  }
  if (mode.sticky && !isDirectory) {
    items.push({
      level: 'warn',
      title: 'sticky 位只对目录有意义',
      detail: '设置在文件上没有实际效果。',
    });
  }
  if (permissions === 0) {
    items.push({
      level: 'danger',
      title: '权限为 0000',
      detail: '连属主都无法访问；误配后往往只能以 root 或从救援环境恢复。',
    });
  }
  if (mode.user.x && (mode.setuid || mode.setgid)) {
    items.push({
      level: 'warn',
      title: '特权位与执行位同时存在',
      detail: '确认目标文件不是可被属主改写的脚本或配置。',
    });
  }
  return items;
}

/* ── umask ────────────────────────────────────────────────────── */

export interface UmaskResult {
  umask: string;
  file: string;
  dir: string;
  fileValue: number;
  dirValue: number;
}

export const COMMON_UMASKS: { value: string; note: string }[] = [
  { value: '022', note: '最常见：新建文件 644、新建目录 755' },
  { value: '002', note: '同组协作：新建文件 664、新建目录 775' },
  { value: '027', note: '较严：新建文件 640、新建目录 750' },
  { value: '077', note: '私有：新建文件 600、新建目录 700' },
  { value: '000', note: '完全开放：新建文件 666、新建目录 777' },
];

/**
 * 计算 umask 影响：内核对新建文件按请求模式 666 再与 umask 取反，
 * 新建目录按请求模式 777 取反（不会再补回 x）。
 */
export function fromUmask(text: string): UmaskResult | null {
  const cleaned = text.trim().replace(/^0o?/i, '');
  if (!/^[0-7]{1,4}$/.test(cleaned)) return null;
  const mask = Number.parseInt(cleaned, 8);
  if (mask < 0 || mask > 0o777) return null;
  const fileValue = 0o666 & ~mask;
  const dirValue = 0o777 & ~mask;
  return {
    umask: mask.toString(8).padStart(3, '0'),
    file: fileValue.toString(8).padStart(3, '0'),
    dir: dirValue.toString(8).padStart(3, '0'),
    fileValue,
    dirValue,
  };
}

/* ── 批量脚本 ─────────────────────────────────────────────────── */

export interface BatchOptions {
  recursive?: boolean;
  useSymbolic?: boolean;
  directory?: boolean;
  comment?: boolean;
}

export interface BatchResult {
  script: string;
  targets: string[];
  skipped: string[];
}

const SHELL_UNSAFE = /[;&|`$()<>\\"'*?![\]{}\n\r]/;

/** 由多行文件名生成批量 chmod 脚本。 */
export function buildBatchScript(mode: Mode, rawTargets: string, options: BatchOptions = {}): BatchResult {
  const targets: string[] = [];
  const skipped: string[] = [];
  for (const rawLine of rawTargets.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    // 支持空格分隔的多路径写法。
    for (const token of line.split(/\s+/)) {
      const path = token.replace(/^["']|["']$/g, '');
      if (path === '') continue;
      if (SHELL_UNSAFE.test(path)) {
        skipped.push(path);
        continue;
      }
      targets.push(path);
    }
  }

  const spec = options.useSymbolic ? toSymbolic(mode) : toShortOctal(mode);
  const flag = options.recursive ? ' -R' : '';
  const lines: string[] = [];
  lines.push('#!/usr/bin/env bash');
  lines.push('# 由「Chmod 计算器」生成，执行前请确认目标列表');
  lines.push(`set -euo pipefail${flag}`);
  lines.push('');
  if (targets.length === 0) {
    lines.push('# 没有可用的目标路径');
  }
  for (const target of targets) {
    if (options.comment) lines.push(`# ${options.directory ? '目录' : '文件'}：${target}`);
    lines.push(`chmod ${spec} ${quotePath(target)}`);
  }
  if (skipped.length > 0) {
    lines.push('');
    lines.push('# 以下路径含 shell 特殊字符，已跳过，请手动确认：');
    for (const path of skipped) lines.push(`#   ${path}`);
  }
  lines.push('');
  lines.push(`echo "共处理 ${targets.length} 个${options.directory ? '目录' : '文件'}"`);
  return { script: lines.join('\n'), targets, skipped };
}

function quotePath(path: string): string {
  return /^[A-Za-z0-9_./@-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`;
}
