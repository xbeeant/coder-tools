/**
 * docker run → docker compose（Compose Spec v2）转换库。
 * 自带 shell 分词器与 docker 参数解析，纯函数、不执行任何命令、不访问网络。
 */

/* ── shell 分词 ───────────────────────────────────────────────── */

export interface ShellToken {
  text: string;
  /** 是否被引号包裹（用于判断是否需要再转义）。 */
  quoted: boolean;
}

export interface TokenizeResult {
  tokens: ShellToken[];
  error: string | null;
}

/**
 * 近似 shell 分词：处理单引号、双引号、反斜杠转义、换行续行。
 * 不做变量展开与 `$(...)` 求值，`$VAR` / `$(cmd)` 原样保留在 token 文本里。
 */
export function tokenizeShell(input: string): TokenizeResult {
  const tokens: ShellToken[] = [];
  let current = '';
  let started = false;
  let quoted = false;
  let quote: '"' | "'" | null = null;
  let line = 1;

  const push = () => {
    if (!started) return;
    tokens.push({ text: current, quoted });
    current = '';
    started = false;
    quoted = false;
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    if (char === '\n') {
      line += 1;
      if (quote === null) {
        push();
        continue;
      }
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      else {
        current += char;
        started = true;
      }
      continue;
    }
    if (quote === '"') {
      if (char === '"') {
        quote = null;
        continue;
      }
      if (char === '\\' && i + 1 < input.length) {
        const next = input[i + 1] as string;
        if (next === '\n') {
          line += 1;
        } else {
          current += next;
          started = true;
        }
        i += 1;
        continue;
      }
      current += char;
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      quoted = true;
      started = true;
      continue;
    }
    if (char === '\\' && i + 1 < input.length) {
      current += input[i + 1] as string;
      started = true;
      i += 1;
      continue;
    }
    if (char === '#' && !started) {
      // 未加引号的 # 在词首表示注释起始。
      while (i < input.length && input[i] !== '\n') i += 1;
      line += 1;
      continue;
    }
    if (/\s/.test(char)) {
      if (char === '\n') line += 1;
      push();
      continue;
    }
    current += char;
    started = true;
  }
  if (quote !== null) return { tokens, error: `第 ${line} 行：引号 ${quote} 没有闭合` };
  push();
  return { tokens, error: null };
}

/* ── docker run 数据结构 ─────────────────────────────────────── */

export type MountType = 'bind' | 'volume' | 'tmpfs' | 'image' | 'pipe';

export interface VolumeMount {
  raw: string;
  source: string;
  target: string;
  readOnly: boolean;
  type: MountType;
  /** 长语法里其余的键（consistency、bind-propagation 等）。 */
  extra: Record<string, string>;
  /** 是否来自 --mount 长语法。 */
  longSyntax: boolean;
}

export interface EnvVar {
  key: string;
  /** null 表示 `-e KEY`，运行时从宿主环境继承。 */
  value: string | null;
}

export interface PortMapping {
  raw: string;
  hostIp: string | null;
  hostPort: string | null;
  containerPort: string;
  protocol: string;
}

export interface HealthcheckSpec {
  test: string;
  interval: string | null;
  timeout: string | null;
  retries: number | null;
  startPeriod: string | null;
}

export interface LinkSpec {
  target: string;
  alias: string | null;
}

export interface DockerRun {
  image: string;
  /** 镜像后的命令与参数。 */
  args: string[];
  containerName: string | null;
  ports: PortMapping[];
  publishAll: boolean;
  volumes: VolumeMount[];
  env: EnvVar[];
  envFile: string[];
  network: string | null;
  networks: string[];
  links: LinkSpec[];
  restart: string | null;
  privileged: boolean;
  capAdd: string[];
  capDrop: string[];
  memory: string | null;
  cpus: string | null;
  user: string | null;
  workdir: string | null;
  entrypoint: string | null;
  healthcheck: HealthcheckSpec | null;
  labels: string[];
  detach: boolean;
  tty: boolean;
  stdinOpen: boolean;
  rm: boolean;
  gpus: string | null;
  shmSize: string | null;
  dns: string[];
  extraHosts: string[];
  devices: string[];
  platform: string | null;
  runtime: string | null;
  init: boolean;
  readOnly: boolean;
  hostname: string | null;
  pid: string | null;
  ipc: string | null;
  tmpfs: string[];
  ulimits: string[];
  logDriver: string | null;
  stopSignal: string | null;
  expose: string[];
  /** 解析到但没有对应 compose 字段的选项。 */
  unknown: string[];
}

function emptyRun(): DockerRun {
  return {
    image: '',
    args: [],
    containerName: null,
    ports: [],
    publishAll: false,
    volumes: [],
    env: [],
    envFile: [],
    network: null,
    networks: [],
    links: [],
    restart: null,
    privileged: false,
    capAdd: [],
    capDrop: [],
    memory: null,
    cpus: null,
    user: null,
    workdir: null,
    entrypoint: null,
    healthcheck: null,
    labels: [],
    detach: false,
    tty: false,
    stdinOpen: false,
    rm: false,
    gpus: null,
    shmSize: null,
    dns: [],
    extraHosts: [],
    devices: [],
    platform: null,
    runtime: null,
    init: false,
    readOnly: false,
    hostname: null,
    pid: null,
    ipc: null,
    tmpfs: [],
    ulimits: [],
    logDriver: null,
    stopSignal: null,
    expose: [],
    unknown: [],
  };
}

/** 需要取值的选项（含短选项与长选项），value 可能写在 `=` 后或下一个 token。 */
const VALUE_FLAGS: Record<string, string> = {
  '-p': 'ports',
  '--publish': 'ports',
  '-v': 'volumes',
  '--volume': 'volumes',
  '--mount': 'volumes',
  '-e': 'env',
  '--env': 'env',
  '--env-file': 'envFile',
  '--network': 'network',
  '--net': 'network',
  '--restart': 'restart',
  '--memory': 'memory',
  '-m': 'memory',
  '--cpus': 'cpus',
  '--user': 'user',
  '-u': 'user',
  '--workdir': 'workdir',
  '-w': 'workdir',
  '--entrypoint': 'entrypoint',
  '--label': 'labels',
  '-l': 'labels',
  '--gpus': 'gpus',
  '--shm-size': 'shmSize',
  '--dns': 'dns',
  '--add-host': 'extraHosts',
  '--device': 'devices',
  '--platform': 'platform',
  '--runtime': 'runtime',
  '--name': 'containerName',
  '--hostname': 'hostname',
  '-h': 'hostname',
  '--pid': 'pid',
  '--ipc': 'ipc',
  '--stop-signal': 'stopSignal',
  '--ulimit': 'ulimits',
  '--log-driver': 'logDriver',
  '--link': 'links',
  '--cap-add': 'capAdd',
  '--cap-drop': 'capDrop',
  '--expose': 'expose',
  '--tmpfs': 'tmpfs',
  '--health-cmd': 'healthcmd',
  '--health-interval': 'healthinterval',
  '--health-retries': 'healthretries',
  '--health-timeout': 'healthtimeout',
  '--health-start-period': 'healthstartperiod',
  '--pull': 'ignored',
  '--chown': 'ignored',
  '--cgroup-parent': 'ignored',
  '--cidfile': 'ignored',
  '--security-opt': 'ignored',
  '--sysctl': 'ignored',
  '--volumes-from': 'ignored',
  '--dns-search': 'ignored',
  '--memory-swap': 'ignored',
  '--cpuset-cpus': 'ignored',
  '--stop-timeout': 'ignored',
  '--stop-grace-period': 'ignored',
  '--log-opt': 'ignored',
  '--oom-score-adj': 'ignored',
  '--group-add': 'ignored',
  '--annotation': 'ignored',
  '--attach': 'ignored',
  '--blkio-weight': 'ignored',
};

const _BOOL_FLAGS: Record<string, keyof DockerRun> = {
  '-d': 'detach',
  '--detach': 'detach',
  '--rm': 'rm',
  '--privileged': 'privileged',
  '--init': 'init',
  '-i': 'stdinOpen',
  '--interactive': 'stdinOpen',
  '-t': 'tty',
  '--tty': 'tty',
  '-P': 'publishAll',
  '--publish-all': 'publishAll',
  '--read-only': 'readOnly',
  '--no-healthcheck': 'unknown',
  '--sig-proxy': 'unknown',
  '--oom-kill-disable': 'unknown',
};

/** 解析端口字符串，支持 8080:80、127.0.0.1:8080:80/tcp、80、-P。 */
export function parsePort(raw: string): PortMapping | null {
  const value = raw.trim();
  if (value === '') return null;
  const slash = value.lastIndexOf('/');
  let protocol = 'tcp';
  let main = value;
  if (slash > 0 && value.slice(slash + 1).toLowerCase() === 'udp') {
    protocol = 'udp';
    main = value.slice(0, slash);
  } else if (slash > 0) {
    protocol = value.slice(slash + 1);
    main = value.slice(0, slash);
  }
  const parts = main.split(':');
  if (parts.length === 1) {
    return { raw: value, hostIp: null, hostPort: null, containerPort: parts[0] as string, protocol };
  }
  if (parts.length === 2) {
    return {
      raw: value,
      hostIp: null,
      hostPort: parts[0] as string,
      containerPort: parts[1] as string,
      protocol,
    };
  }
  if (parts.length >= 3) {
    return {
      raw: value,
      hostIp: parts[0] as string,
      hostPort: parts[1] as string,
      containerPort: parts[2] as string,
      protocol,
    };
  }
  return null;
}

const PATH_LIKE = /^\.{1,2}\//;

export function isNamedVolume(source: string): boolean {
  if (source === '') return true;
  if (source.startsWith('/') || source.startsWith('~') || PATH_LIKE.test(source)) return false;
  return !source.includes('/');
}

/** 解析 -v src:dst[:mode] 或 --mount type=...,source=...,target=...。 */
export function parseMount(raw: string): VolumeMount | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/type=(bind|volume|tmpfs|image|pipe)\b/.test(value)) {
    const fields: Record<string, string> = {};
    for (const piece of value.split(',')) {
      const eq = piece.indexOf('=');
      if (eq < 0) {
        const key = piece.trim();
        if (key !== '') fields[key] = '';
        continue;
      }
      const key = piece.slice(0, eq).trim();
      if (key !== '') fields[key] = piece.slice(eq + 1).trim();
    }
    const type = (fields.type ?? 'volume') as MountType;
    const source = fields.source ?? fields.src ?? '';
    const target = fields.target ?? fields.destination ?? fields.dst ?? '';
    const extra: Record<string, string> = {};
    const skip = new Set(['type', 'source', 'src', 'target', 'destination', 'dst', 'readonly', 'ro']);
    for (const [key, val] of Object.entries(fields)) {
      if (skip.has(key)) continue;
      extra[key] = val;
    }
    return {
      raw: value,
      source,
      target,
      readOnly: fields.readonly === '' || fields.ro === '' || fields.readonly === 'true' || fields.ro === 'true',
      type,
      extra,
      longSyntax: true,
    };
  }
  const parts = value.split(':');
  if (parts.length === 1) {
    // 只有一个路径：挂载到匿名卷。
    return {
      raw: value,
      source: '',
      target: parts[0] as string,
      readOnly: false,
      type: 'volume',
      extra: {},
      longSyntax: false,
    };
  }
  const source = parts[0] as string;
  const target = parts[1] as string;
  const mode = (parts[2] ?? '').toLowerCase();
  return {
    raw: value,
    source,
    target,
    readOnly: mode.includes('ro'),
    type: isNamedVolume(source) ? 'volume' : 'bind',
    extra: {},
    longSyntax: false,
  };
}

export interface ParseRunResult {
  run: DockerRun | null;
  error: string | null;
}

/** 布尔开关选项对应的 DockerRun 字段；'unknown' 表示只记录不下结论。 */
const BOOL_TARGET: Record<string, keyof DockerRun | 'unknown'> = {
  '-d': 'detach',
  '--detach': 'detach',
  '--rm': 'rm',
  '--privileged': 'privileged',
  '--init': 'init',
  '-i': 'stdinOpen',
  '--interactive': 'stdinOpen',
  '-t': 'tty',
  '--tty': 'tty',
  '-P': 'publishAll',
  '--publish-all': 'publishAll',
  '--read-only': 'readOnly',
  '--no-healthcheck': 'unknown',
  '--sig-proxy': 'unknown',
  '--oom-kill-disable': 'unknown',
};

function applyBool(run: DockerRun, flag: string): void {
  const key = BOOL_TARGET[flag] ?? 'unknown';
  const mutable = run as unknown as Record<string, unknown>;
  if (key === 'unknown' || typeof mutable[key] !== 'boolean') {
    run.unknown.push(flag);
    return;
  }
  mutable[key] = true;
}

/** 解析一条 docker run 命令（允许省略 docker run 前缀与 sudo）。 */
export function parseDockerRun(command: string): ParseRunResult {
  const { tokens, error } = tokenizeShell(command);
  if (error !== null) return { run: null, error };

  let index = 0;
  while (index < tokens.length) {
    const text = (tokens[index] as ShellToken).text;
    if (text === 'sudo') {
      index += 1;
      continue;
    }
    if (/(^|\/)docker$/.test(text)) {
      index += 1;
      if (tokens[index]?.text === 'run') index += 1;
      continue;
    }
    break;
  }
  if (index >= tokens.length) return { run: null, error: '没有找到镜像名：命令里至少要有一个非选项参数' };

  const run = emptyRun();

  while (index < tokens.length) {
    const token = tokens[index] as ShellToken;
    // 镜像之后的一切都是容器内命令，哪怕长得像选项（例如 redis-server --requirepass）。
    if (run.image !== '') {
      run.args.push(token.text);
      index += 1;
      continue;
    }
    let flag = token.text;
    let inlineValue: string | null = null;
    const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
    if (eq > 2) {
      inlineValue = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }

    // 聚合短选项：-it、-dit、-e 等。
    if (/^-[a-z]{2,}$/.test(flag) && VALUE_FLAGS[flag] === undefined && BOOL_TARGET[flag] === undefined) {
      for (const letter of flag.slice(1)) {
        const short = `-${letter}`;
        if (BOOL_TARGET[short] !== undefined) {
          applyBool(run, short);
          continue;
        }
        if (VALUE_FLAGS[short] !== undefined) {
          const key = VALUE_FLAGS[short] as string;
          const next = tokens[index + 1];
          if (next === undefined || next.text.startsWith('-'))
            return { run: null, error: `选项 ${short} 后面缺少取值` };
          applyValueFlag(run, key, next.text);
          index += 1;
          continue;
        }
        run.unknown.push(short);
      }
      index += 1;
      continue;
    }

    if (BOOL_TARGET[flag] !== undefined) {
      applyBool(run, flag);
      index += 1;
      continue;
    }

    if (VALUE_FLAGS[flag] !== undefined) {
      const key = VALUE_FLAGS[flag] as string;
      let value = inlineValue;
      if (value === null) {
        const next = tokens[index + 1];
        if (next === undefined || (next.text.startsWith('-') && next.text.length > 1)) {
          return { run: null, error: `选项 ${flag} 后面缺少取值` };
        }
        value = next.text;
        index += 1;
      }
      index += 1;
      applyValueFlag(run, key, value);
      continue;
    }

    if (flag.startsWith('-') && flag !== '-') {
      run.unknown.push(token.text);
      index += 1;
      continue;
    }

    // 第一个非选项参数就是镜像。
    run.image = token.text;
    index += 1;
  }

  if (run.image === '') return { run: null, error: '没有找到镜像名' };
  return { run, error: null };
}

function applyValueFlag(run: DockerRun, key: string, value: string): void {
  switch (key) {
    case 'ports': {
      const port = parsePort(value);
      if (port !== null) run.ports.push(port);
      return;
    }
    case 'volumes': {
      const mount = parseMount(value);
      if (mount !== null) run.volumes.push(mount);
      return;
    }
    case 'env': {
      const eq = value.indexOf('=');
      if (eq < 0) run.env.push({ key: value, value: null });
      else run.env.push({ key: value.slice(0, eq), value: value.slice(eq + 1) });
      return;
    }
    case 'envFile':
      run.envFile.push(value);
      return;
    case 'network':
      run.network = value;
      if (!run.networks.includes(value)) run.networks.push(value);
      return;
    case 'links': {
      const colon = value.indexOf(':');
      if (colon < 0) run.links.push({ target: value, alias: null });
      else run.links.push({ target: value.slice(0, colon), alias: value.slice(colon + 1) });
      return;
    }
    case 'healthcmd':
      run.healthcheck = { test: value, interval: null, timeout: null, retries: null, startPeriod: null };
      return;
    case 'healthinterval':
      run.healthcheck = { ...emptyHealth(run), interval: value };
      return;
    case 'healthtimeout':
      run.healthcheck = { ...emptyHealth(run), timeout: value };
      return;
    case 'healthretries':
      run.healthcheck = { ...emptyHealth(run), retries: Number(value) };
      return;
    case 'healthstartperiod':
      run.healthcheck = { ...emptyHealth(run), startPeriod: value };
      return;
    case 'capAdd':
      run.capAdd.push(value);
      return;
    case 'capDrop':
      run.capDrop.push(value);
      return;
    case 'ignored':
      run.unknown.push(`${key}=${value}`);
      return;
    default:
      break;
  }
  const listKey = key as keyof DockerRun;
  if (listKey === 'containerName' || listKey === 'restart' || listKey === 'memory' || listKey === 'cpus') {
    (run[listKey] as string | null) = value;
    return;
  }
  if (listKey === 'user' || listKey === 'workdir' || listKey === 'entrypoint' || listKey === 'gpus') {
    (run[listKey] as string | null) = value;
    return;
  }
  if (listKey === 'shmSize' || listKey === 'platform' || listKey === 'runtime' || listKey === 'logDriver') {
    (run[listKey] as string | null) = value;
    return;
  }
  if (listKey === 'hostname' || listKey === 'pid' || listKey === 'ipc' || listKey === 'stopSignal') {
    (run[listKey] as string | null) = value;
    return;
  }
  const list = run[listKey];
  if (Array.isArray(list)) (list as string[]).push(value);
}

function emptyHealth(run: DockerRun): HealthcheckSpec {
  return run.healthcheck ?? { test: '', interval: null, timeout: null, retries: null, startPeriod: null };
}

/* ── YAML 输出 ────────────────────────────────────────────────── */

const PLAIN_SAFE = /^[A-Za-z0-9_./:@%+^=()\s-]+$/;

export function yamlString(value: string): string {
  if (value === '') return "''";
  if (/[\n\r\t"'#{}[\],&*?|>%@`]/.test(value)) return JSON.stringify(value);
  if (!PLAIN_SAFE.test(value)) return JSON.stringify(value);
  if (/^(y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|off|Off|null|Null|NULL|~)$/.test(value)) {
    return `'${value}'`;
  }
  if (/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+)$/.test(value)) return `'${value}'`;
  if (/^\s|\s$/.test(value)) return `'${value}'`;
  if (value.includes(': ')) return `'${value}'`;
  if (value.endsWith(':')) return `'${value}'`;
  if (value.startsWith('-')) return `'${value}'`;
  return value;
}

export interface YamlComment {
  __comment: string;
}

export type YamlValue = string | number | boolean | null | YamlValue[] | YamlComment | { [key: string]: YamlValue };

export function comment(text: string): YamlComment {
  return { __comment: text };
}

function isCommentValue(value: unknown): value is YamlComment {
  return value !== null && typeof value === 'object' && typeof (value as YamlComment).__comment === 'string';
}

function scalar(value: YamlValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return yamlString(value);
  return JSON.stringify(value);
}

function emitObject(lines: string[], obj: { [key: string]: YamlValue }, indent: number): void {
  const pad = '  '.repeat(indent);
  for (const [key, child] of Object.entries(obj)) {
    if (child === undefined) continue;
    if (isCommentValue(child)) {
      lines.push(`${pad}# ${child.__comment}`);
      continue;
    }
    if (Array.isArray(child)) {
      if (child.length === 0) {
        lines.push(`${pad}${key}: []`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      emitArray(lines, child, indent + 1);
      continue;
    }
    if (child !== null && typeof child === 'object') {
      if (Object.keys(child).length === 0) {
        lines.push(`${pad}${key}: {}`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      emitObject(lines, child, indent + 1);
      continue;
    }
    lines.push(`${pad}${key}: ${scalar(child)}`);
  }
}

function emitArray(lines: string[], items: YamlValue[], indent: number): void {
  const pad = '  '.repeat(indent);
  for (const item of items) {
    if (isCommentValue(item)) {
      lines.push(`${pad}# ${item.__comment}`);
      continue;
    }
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}- []`);
        continue;
      }
      lines.push(`${pad}-`);
      emitArray(lines, item, indent + 1);
      continue;
    }
    if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        lines.push(`${pad}- {}`);
        continue;
      }
      const sub: string[] = [];
      // 对象项：子键统一缩进一级，首行改成 "- key: value"，后续行保持一级缩进。
      emitObject(sub, item, indent + 1);
      let started = false;
      for (const line of sub) {
        if (!started && !line.trimStart().startsWith('#')) {
          lines.push(`${pad}- ${line.trimStart()}`);
          started = true;
          continue;
        }
        lines.push(line);
      }
      continue;
    }
    lines.push(`${pad}- ${scalar(item)}`);
  }
}

export function toYaml(root: Record<string, YamlValue>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (value === undefined) continue;
    if (isCommentValue(value)) {
      lines.push(`# ${value.__comment}`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      emitArray(lines, value, 1);
      continue;
    }
    if (value !== null && typeof value === 'object') {
      if (Object.keys(value).length === 0) {
        lines.push(`${key}: {}`);
        continue;
      }
      lines.push(`${key}:`);
      emitObject(lines, value, 1);
      continue;
    }
    lines.push(`${key}: ${scalar(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

/* ── compose 生成 ─────────────────────────────────────────────── */

export interface ComposeOptions {
  /** 是否给每个字段加中文注释。 */
  comments: boolean;
  /** 是否包含 container_name。 */
  includeContainerName: boolean;
  /** 多服务模式下手动指定的 depends_on：service → 依赖的 service 列表。 */
  dependsOn: Record<string, string[]>;
  /** 覆盖默认的服务名。 */
  serviceNames: Record<string, string>;
}

/** 从镜像名推导服务名：去掉 registry 与 tag，转成合法 compose key。 */
export function deriveServiceName(image: string): string {
  const withoutDigest = image.split('@')[0] as string;
  const lastSlash = withoutDigest.lastIndexOf('/');
  const tail = lastSlash < 0 ? withoutDigest : withoutDigest.slice(lastSlash + 1);
  const name = (tail.split(':')[0] ?? tail).toLowerCase();
  const cleaned = name.replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'service' : cleaned;
}

/** 把 `1g` / `512m` / `1024` 这类内存写法转成 compose 可用的字符串。 */
export function normalizeMemory(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return `${trimmed}b`;
  if (/^\d+(\.\d+)?(b|k|kb|kib|m|mb|mib|g|gb|gib|t|tb|tib|b)?$/.test(trimmed)) {
    if (/^\d+b$/.test(trimmed)) return trimmed;
    if (trimmed.endsWith('b') && !trimmed.endsWith('ib')) return trimmed;
    return trimmed;
  }
  return trimmed;
}

export interface ComposeService {
  name: string;
  run: DockerRun;
}

export interface ComposeBuildResult {
  yaml: string;
  serviceNames: string[];
  namedVolumes: string[];
  networks: string[];
  warnings: string[];
  /** 每个服务的依赖推断结果（含理由与可信度），供 UI 让用户确认。 */
  inferred: { service: string; deps: InferredDep[] }[];
}

/** 把 docker run 对象转换成 Compose Spec v2 的 services 结构。 */
export function buildCompose(runs: DockerRun[], options: ComposeOptions): ComposeBuildResult {
  const warnings: string[] = [];
  const services: Record<string, YamlValue> = {};
  const namedVolumes: string[] = [];
  const networks = new Set<string>();
  const usedNames = new Set<string>();

  // 第一遍：确定服务名，保证依赖推断能看到全部对等服务。
  const names: string[] = [];
  for (const run of runs) {
    const normalized = deriveServiceName(run.image);
    let name = normalized;
    let counter = 2;
    while (usedNames.has(name)) {
      name = `${normalized}${counter}`;
      counter += 1;
    }
    usedNames.add(name);
    names.push(options.serviceNames[name] ?? name);
  }
  const peers = runs.map((run, index) => ({ name: names[index] as string, run }));
  const serviceNames = [...names];
  const inferred: { service: string; deps: InferredDep[] }[] = [];

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index] as DockerRun;
    const name = names[index] as string;
    const c = options.comments;
    const service: Record<string, YamlValue> = {};
    if (c) service.image = comment(`原命令里的镜像：${run.image}`);
    service.image = run.image;

    if (run.args.length > 0) {
      if (c) service.command = comment('镜像启动命令（原 docker run 的位置参数）');
      service.command = run.args.map((arg) => (/[\s"'#]/.test(arg) ? JSON.stringify(arg) : arg));
    }
    if (run.entrypoint !== null) {
      if (c) service.entrypoint = comment('覆盖镜像 ENTRYPOINT');
      service.entrypoint = run.entrypoint;
    }
    if (run.containerName !== null) {
      if (options.includeContainerName) {
        if (c) service.container_name = comment('Compose 默认按服务名生成容器名，确认无需固定时建议删掉本行');
        service.container_name = run.containerName;
      } else {
        warnings.push(
          `服务 ${name} 的 --name "${run.containerName}" 未写入：compose 会自动生成 ${name}-1 形式的容器名，固定名字会让 scale 失效。`,
        );
      }
    }

    const volumes = buildVolumes(run, namedVolumes, c);
    if (volumes.length > 0) service.volumes = volumes;

    if (run.env.length > 0 || run.envFile.length > 0) {
      const items: YamlValue[] = [];
      for (const item of run.env) {
        if (item.value === null) {
          if (c) items.push(comment(`-e ${item.key}：不在这里给值，运行时从宿主环境读取`));
          items.push(item.key);
          continue;
        }
        items.push(`${item.key}=${item.value}`);
      }
      if (items.length > 0) service.environment = items;
      if (run.envFile.length > 0) {
        if (c) service.env_file = comment('--env-file 对应的文件，需和 compose 文件放在一起');
        service.env_file = [...run.envFile];
      }
    }

    if (run.ports.length > 0 || run.publishAll) {
      const items: YamlValue[] = [];
      for (const port of run.ports) {
        const parts: string[] = [];
        if (port.hostIp !== null) parts.push(port.hostIp);
        if (port.hostPort !== null) parts.push(port.hostPort);
        parts.push(port.containerPort);
        let text = parts.join(':');
        if (port.protocol !== 'tcp') text += `/${port.protocol}`;
        items.push(text);
      }
      if (run.publishAll) {
        if (c) {
          items.push(comment('-P 会随机映射所有 EXPOSE 端口，compose 无法静态表达，请手动确认需要的端口'));
        }
      }
      if (items.length > 0) service.ports = items;
    }
    if (run.expose.length > 0) {
      if (c) service.expose = comment('仅容器内暴露，不映射到宿主机');
      service.expose = [...run.expose];
    }

    if (run.tty && run.stdinOpen) {
      if (c) service.tty = comment('-it 的组合：compose 把两者拆开写');
      service.tty = true;
      service.stdin_open = true;
    } else if (run.tty || run.stdinOpen) {
      if (c) service.tty = comment(run.tty ? '只带了 -t' : '只带了 -i');
      if (run.tty) service.tty = true;
      service.stdin_open = true;
    }

    if (run.restart !== null) {
      if (c) service.restart = comment('--restart');
      service.restart = run.restart === 'no' ? 'no' : run.restart;
    }
    if (run.privileged) {
      if (c) service.privileged = comment('--privileged：等价于宿主机 root，等同放弃隔离');
      service.privileged = true;
      warnings.push(`服务 ${name} 使用了 --privileged，几乎等于把宿主机交给容器，务必确认必要性。`);
    }
    if (run.capAdd.length > 0 || run.capDrop.length > 0) {
      if (run.capAdd.length > 0) {
        if (c) service.cap_add = comment('--cap-add');
        service.cap_add = [...run.capAdd];
      }
      if (run.capDrop.length > 0) {
        if (c) service.cap_drop = comment('--cap-drop');
        service.cap_drop = [...run.capDrop];
      }
    }
    if (run.readOnly) {
      if (c) service.read_only = comment('--read-only');
      service.read_only = true;
    }
    if (run.init) {
      if (c) service.init = comment('--init：PID 1 信号转发');
      service.init = true;
    }
    if (run.user !== null) {
      if (c) service.user = comment('--user');
      service.user = run.user;
    }
    if (run.workdir !== null) {
      if (c) service.working_dir = comment('--workdir');
      service.working_dir = run.workdir;
    }
    if (run.hostname !== null) {
      if (c) service.hostname = comment('--hostname');
      service.hostname = run.hostname;
    }
    if (run.platform !== null) {
      if (c) service.platform = comment('--platform');
      service.platform = run.platform;
    }
    if (run.runtime !== null) {
      if (c) service.runtime = comment('--runtime');
      service.runtime = run.runtime;
    }
    if (run.shmSize !== null) {
      if (c) service.shm_size = comment('--shm-size');
      service.shm_size = run.shmSize;
    }
    if (run.dns.length > 0) {
      if (c) service.dns = comment('--dns');
      service.dns = [...run.dns];
    }
    if (run.extraHosts.length > 0) {
      if (c) service.extra_hosts = comment('--add-host');
      service.extra_hosts = run.extraHosts.map((host) => {
        const colon = host.indexOf(':');
        if (colon < 0) return host;
        return `${host.slice(0, colon)}:${host.slice(colon + 1)}`;
      });
    }
    if (run.devices.length > 0) {
      if (c) service.devices = comment('--device');
      service.devices = [...run.devices];
    }
    if (run.tmpfs.length > 0) {
      if (c) service.tmpfs = comment('--tmpfs');
      service.tmpfs = [...run.tmpfs];
    }
    if (run.ulimits.length > 0) {
      const items: YamlValue[] = [];
      for (const limit of run.ulimits) {
        const colon = limit.indexOf(':');
        if (colon < 0) items.push(limit);
        else {
          items.push({ name: limit.slice(0, colon), soft: limit.slice(colon + 1), hard: limit.slice(colon + 1) });
        }
      }
      if (c) service.ulimits = comment('--ulimit');
      service.ulimits = items;
    }
    if (run.logDriver !== null) {
      if (c) service.logging = comment('--log-driver');
      service.logging = { driver: run.logDriver };
    }
    if (run.stopSignal !== null) {
      if (c) service.stop_signal = comment('--stop-signal');
      service.stop_signal = run.stopSignal;
    }
    if (run.gpus !== null) {
      if (c)
        service.gpus = comment(
          '--gpus：Compose Spec 2.30+ 的顶层字段，旧版本请改用 deploy.resources.reservations.devices',
        );
      service.gpus = run.gpus;
    }
    if (run.memory !== null || run.cpus !== null) {
      const limits: Record<string, YamlValue> = {};
      if (run.memory !== null) limits.memory = normalizeMemory(run.memory);
      if (run.cpus !== null) limits.cpus = String(run.cpus);
      if (c) {
        service.deploy = comment('--memory / --cpus 转成 deploy.resources.limits；旧版 compose 需要 3.x 语法才生效');
      }
      service.deploy = { resources: { limits } };
    }
    if (run.healthcheck !== null && run.healthcheck.test !== '') {
      const test: Record<string, YamlValue> = {};
      if (run.healthcheck.interval !== null) test.interval = run.healthcheck.interval;
      if (run.healthcheck.timeout !== null) test.timeout = run.healthcheck.timeout;
      if (run.healthcheck.retries !== null) test.retries = run.healthcheck.retries;
      if (run.healthcheck.startPeriod !== null) test.start_period = run.healthcheck.startPeriod;
      const health: Record<string, YamlValue> = {
        test: run.healthcheck.test.startsWith('[') ? run.healthcheck.test : ['CMD-SHELL', run.healthcheck.test],
        ...test,
      };
      if (c) service.healthcheck = comment('--health-cmd 等参数转成 healthcheck');
      service.healthcheck = health;
    }
    if (run.network !== null) {
      const networkName = normalizeNetwork(run.network);
      networks.add(networkName);
      if (c) service.networks = comment('--network');
      service.networks = [networkName];
    }
    if (run.pid !== null) {
      if (c) service.pid = comment('--pid');
      service.pid = run.pid;
    }
    if (run.ipc !== null) {
      if (c) service.ipc = comment('--ipc');
      service.ipc = run.ipc;
    }
    if (run.detach || run.rm) {
      if (c)
        service.restart = service.restart ?? comment('docker run -d / --rm 在 compose 中由 up -d / down 默认行为覆盖');
    }

    const guesses = inferDependsOn(run, peers, name);
    inferred.push({ service: name, deps: guesses });
    const manual = options.dependsOn[name] ?? [];
    const chosen = [...new Set([...guesses.filter((dep) => dep.confident).map((dep) => dep.service), ...manual])];
    if (chosen.length > 0) {
      const depRecord: Record<string, YamlValue> = {};
      for (const dep of chosen) depRecord[dep] = { condition: 'service_started' };
      if (c) service.depends_on = comment('由 --link / 参数引用推断，请人工确认启动顺序');
      service.depends_on = depRecord;
    }
    if (guesses.some((dep) => !dep.confident) || manual.length > 0) {
      warnings.push(
        `服务 ${name} 的依赖关系是推断出来的（${
          guesses.map((dep) => `${dep.service}（${dep.reason}）`).join('、') || '无'
        }），请在下方手动勾选确认后再启动。`,
      );
    }

    if (run.unknown.length > 0) {
      warnings.push(
        `服务 ${name} 有未识别的参数：${run.unknown.join('、')}，已忽略。可查 docker run --help 补进 compose。`,
      );
    }
    services[name] = service;
  }

  const root: Record<string, YamlValue> = {};
  if (options.comments)
    root.services = comment('由「Docker Run 转 Compose」生成；Compose Spec v2 不需要顶层 version 字段');
  root.services = services;
  if (namedVolumes.length > 0) {
    if (options.comments) root.volumes = comment('命名卷必须在这里声明，bind 挂载（./ 与 / 开头）不需要');
    const volumeMap: Record<string, YamlValue> = {};
    for (const volume of namedVolumes) volumeMap[volume] = null;
    root.volumes = volumeMap;
  }
  if (networks.size > 0) {
    if (options.comments) root.networks = comment('--network 对应的网络，compose 默认也会生成项目名_default');
    const networkMap: Record<string, YamlValue> = {};
    for (const network of networks) networkMap[network] = null;
    root.networks = networkMap;
  }

  return {
    yaml: toYaml(root),
    serviceNames,
    namedVolumes,
    networks: [...networks],
    warnings,
    inferred,
  };
}

function normalizeNetwork(name: string): string {
  if (name === 'bridge' || name === 'host' || name === 'none' || name === 'default') return name;
  return name.replace(/^.*\//, '');
}

function buildVolumes(run: DockerRun, namedVolumes: string[], comments: boolean): YamlValue[] {
  const out: YamlValue[] = [];
  for (const mount of run.volumes) {
    if (mount.longSyntax) {
      const entry: Record<string, YamlValue> = { type: mount.type };
      if (mount.source !== '') entry.source = mount.source;
      entry.target = mount.target;
      if (mount.readOnly) entry.read_only = true;
      for (const [key, value] of Object.entries(mount.extra)) {
        if (key === 'source' || key === 'src' || key === 'target' || key === 'destination' || key === 'dst') continue;
        entry[key] = value;
      }
      if (mount.type === 'volume' && mount.source !== '' && !namedVolumes.includes(mount.source)) {
        namedVolumes.push(mount.source);
      }
      out.push(entry);
      continue;
    }
    if (mount.type === 'bind') {
      // 相对路径保持相对，不要改写成绝对路径。
      out.push(mount.readOnly ? `${mount.source}:${mount.target}:ro` : `${mount.source}:${mount.target}`);
      continue;
    }
    const volumeName = mount.source === '' ? '匿名卷（compose 不支持匿名卷，建议改成命名卷）' : mount.source;
    if (mount.source !== '' && !namedVolumes.includes(mount.source)) namedVolumes.push(mount.source);
    if (mount.source === '') {
      if (comments) out.push(comment(`${mount.target}：原命令是匿名卷，compose 请显式命名`));
      continue;
    }
    out.push(mount.readOnly ? `${volumeName}:${mount.target}:ro` : `${volumeName}:${mount.target}`);
  }
  return out;
}

export interface InferredDep {
  service: string;
  reason: string;
  /** 推断是否可靠；不可靠的依赖只写进建议不写进 depends_on。 */
  confident: boolean;
}

/** 服务间的可检索文本：环境变量、启动参数、网络名，用于判断「谁被谁引用」。 */
function referenceText(run: DockerRun): string {
  const parts: string[] = [run.image, run.network ?? ''];
  for (const item of run.env) if (item.value !== null) parts.push(item.value);
  parts.push(...run.args);
  for (const host of run.extraHosts) parts.push(host);
  return parts.join(' ').toLowerCase();
}

/** 从 --link / 互相引用 / 共享网络推断服务依赖，并给每条推断标注理由与可信度。 */
export function inferDependsOn(run: DockerRun, peers: { name: string; run: DockerRun }[], self: string): InferredDep[] {
  const deps = new Map<string, InferredDep>();
  const text = referenceText(run);

  for (const link of run.links) {
    const target = link.target.split('/')[0] as string;
    const base = deriveServiceName(target);
    const peer = peers.find((item) => item.name === base || deriveServiceName(item.run.image) === base);
    if (peer === undefined || peer.name === self) continue;
    deps.set(peer.name, { service: peer.name, reason: `--link ${link.target}`, confident: true });
  }

  for (const peer of peers) {
    if (peer.name === self) continue;
    const aliases = new Set<string>([peer.name, deriveServiceName(peer.run.image)]);
    const shortImage = (peer.run.image.split('/').pop() ?? peer.run.image).split(':')[0] ?? peer.run.image;
    aliases.add(shortImage.toLowerCase());
    for (const alias of aliases) {
      if (alias === '') continue;
      if (new RegExp(`(^|[^a-z0-9_-])${alias}([^a-z0-9_-]|$)`, 'i').test(text)) {
        const existing = deps.get(peer.name);
        deps.set(peer.name, {
          service: peer.name,
          reason: existing?.reason ?? `参数或环境变量里引用了 ${alias}`,
          confident: existing?.confident ?? true,
        });
        break;
      }
    }
  }

  // 只共享自定义网络不足以判断启动顺序，标记为不可靠，交由用户勾选。
  const myNetwork = run.network;
  if (myNetwork !== null && !['bridge', 'host', 'none', 'default'].includes(myNetwork)) {
    for (const peer of peers) {
      if (peer.name === self) continue;
      if (peer.run.network === myNetwork && !deps.has(peer.name)) {
        deps.set(peer.name, { service: peer.name, reason: `同在网络 ${myNetwork}，但先后顺序未知`, confident: false });
      }
    }
  }

  // 共享同一个命名卷说明有数据往来，也只作为提示。
  const myVolumes = new Set(run.volumes.map((mount) => mount.source).filter((source) => source !== ''));
  for (const peer of peers) {
    if (peer.name === self || deps.has(peer.name)) continue;
    const shared = peer.run.volumes.find((mount) => mount.source !== '' && myVolumes.has(mount.source));
    if (shared !== undefined) {
      deps.set(peer.name, { service: peer.name, reason: `共享卷 ${shared.source}`, confident: false });
    }
  }

  return [...deps.values()];
}

/* ── 示例 ─────────────────────────────────────────────────────── */

export interface DockerExample {
  name: string;
  command: string;
}

export const DOCKER_EXAMPLES: DockerExample[] = [
  {
    name: 'Node 应用',
    command:
      'docker run -d --name api -p 3000:3000 -e NODE_ENV=production -e PORT=3000 --restart unless-stopped node:22-alpine npm start',
  },
  {
    name: 'Nginx',
    command:
      'docker run -d -p 80:80 -p 443:443 -v ./html:/usr/share/nginx/html:ro -v ./conf.d:/etc/nginx/conf.d:ro nginx:1.27-alpine',
  },
  {
    name: 'PostgreSQL',
    command:
      'docker run -d --name pg -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app -p 5432:5432 -v pgdata:/var/lib/postgresql/data --restart always postgres:16',
  },
  {
    name: 'Redis',
    command:
      'docker run -d --name redis -p 6379:6379 -v redis-data:/data redis:7-alpine redis-server --requirepass secret',
  },
  {
    name: 'MongoDB',
    command:
      'docker run -d --name mongo -p 27017:27017 -v mongo-data:/data/db -e MONGO_INITDB_ROOT_PASSWORD=secret mongo:7',
  },
  {
    name: 'Kafka',
    command:
      'docker run -d --name kafka -p 9092:9092 -e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093 --name kafka --hostname kafka --network kafka-net confluentinc/cp-kafka:7.6.0',
  },
  {
    name: 'Jenkins',
    command:
      'docker run -d --name jenkins -p 8080:8080 -p 50000:50000 -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts',
  },
  {
    name: 'Nginx + Node 组合',
    command:
      'docker run -d --name web -p 8080:80 --network app-net nginx:alpine\ndocker run -d --name api -p 3000:3000 --network app-net -e BASE_URL=http://web node:22-alpine',
  },
];

export const COMPOSE_RUN_HINT = [
  'docker compose up -d          # 后台启动（等价 docker run -d）',
  'docker compose down           # 停止并删除容器（等价 --rm 生命周期）',
  'docker compose down -v        # 同时删除命名卷，数据会丢',
  'docker compose logs -f api    # 看单个服务日志',
  'docker compose config         # 校验并渲染最终配置（含变量替换）',
  'docker compose build && docker compose up -d',
  'docker compose run --rm api npm test   # 一次性任务（等价 --rm）',
  'docker compose exec api sh              # 进容器（等价 -it）',
  '',
  '# 版本 1 的 docker-compose 与版本 2 的 docker compose 区别：',
  '#   命令名不同（docker-compose vs docker compose 插件）',
  '#   v1 的 file 语法（version: "3.8"）在 v2 中已废弃，version 字段被忽略',
  '#   v1 的 depends_on 不支持 condition，v2 支持 condition: service_healthy',
  '#   v2 支持 profiles、develop、include 等新字段',
].join('\n');
