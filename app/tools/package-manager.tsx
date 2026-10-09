import { Boxes, FileCog, PackageCheck, Search, ServerCog, TriangleAlert, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'compare' | 'commands' | 'ci' | 'mirror' | 'monorepo' | 'faq';

const TABS: { value: Tab; label: string }[] = [
  { value: 'compare', label: '包管理器对比' },
  { value: 'commands', label: '命令对照' },
  { value: 'ci', label: 'CI 安装加速' },
  { value: 'mirror', label: '镜像配置' },
  { value: 'monorepo', label: 'Monorepo 提速' },
  { value: 'faq', label: '常见问题' },
];

interface PmRow {
  name: string;
  lockfile: string;
  workspace: string;
  nodeModules: string;
  speed: string;
  note: string;
}

// 字段来自各工具官方 README / 文档的稳定事实，版本会变，字段本身不变
const PACKAGE_MANAGERS = compareRows([
  'npm | package-lock.json | npm 7+ 原生 workspace | 扁平 node_modules | 中 | 生态最全，CI 缓存最容易命中',
  'pnpm | pnpm-lock.yaml | 内置 workspace | 内容寻址 + 硬链接 | 快 | 同版本磁盘占用最小，默认隔离 node_modules',
  'yarn | yarn.lock | 内置 workspace | PnP 或 node_modules | 中 | Berry 默认 PnP，零安装体验好',
  'bun | bun.lockb / bun.lock | 原生 workspace | 硬链接安装 | 很快 | 自带运行时与 TS，安装与执行都快',
  'npm@cnpm | package-lock.json | 跟随 npm | 扁平 | 中 | 淘宝源镜像，老牌国内方案',
  'pnpm@pnpm | pnpm-lock.yaml | 内置 workspace | 内容寻址 | 快 | 可复用 npm 全部脚本语义',
  'yarn@berry | yarn.lock | 内置 workspace | PnP | 中 | 需 .yarnrc.yml 与 releases 管理',
  'deno | 无 lock（默认） | 内置 workspace | 无 node_modules | 快 | 直接用 URL 导入，风格偏 ESM 原生',
  'nix | flake.lock | flake 定义 | Nix store | 慢（冷） | 不只管 Node，声明式锁定全系统',
  'gradle | build.gradle.lockfile | multi-project | ~/.gradle 缓存 | 中 | JVM 生态为主',
  'maven | pom.xml | 多模块 | ~/.m2 | 慢 | JVM 生态，settings.xml 配镜像',
  'cargo | Cargo.lock | workspace | ~/.cargo + target | 快 | Rust 生态，C 依赖多时首次编译慢',
  'go mod | go.sum | go.work | GOPATH/pkg/mod | 快 | 标准库外全部走模块代理',
  'composer | composer.lock | 无内建 | vendor | 中 | PHP 生态，platform 约束强',
  'uv | uv.lock | workspace 支持 | 全局缓存 | 很快 | Python 生态，替代 pip/poetry',
  'rye | rye.lock | 无 | 独立工具链目录 | 快 | Python 工具链 + 依赖统一管理',
  'pixi | pixi.lock | workspace | 内容寻址 | 快 | Conda + npm 混合，支持多语言 monorepo',
  'vagrant | 无 lock（内置 box 版本） | 无 | ~/.vagrant.d | 慢 | 虚拟化 box 管理，见虚拟化工具',
  'docker | 无 lock（镜像 digest） | compose 编排 | 镜像层 | 慢 | 环境即镜像，见容器运行时工具',
  'helm | Chart.lock | 多 chart | ~/.cache/helm | 中 | K8s 侧依赖管理，见容器编排工具',
]);

const COMPARE_COLUMNS = [
  { key: 'lockfile', label: '锁文件' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'nodeModules', label: '安装布局' },
  { key: 'speed', label: '相对速度' },
] as const;

// ── 命令对照 ────────────────────────────────────────────────────────────

interface CommandRow {
  task: string;
  npm: string;
  pnpm: string;
  yarn: string;
  bun: string;
}

const COMMAND_ROWS: CommandRow[] = [
  {
    task: '安装全部依赖',
    npm: 'npm ci',
    pnpm: 'pnpm i --frozen-lockfile',
    yarn: 'yarn install --immutable',
    bun: 'bun install --frozen-lockfile',
  },
  {
    task: '只装生产依赖',
    npm: 'npm ci --omit=dev',
    pnpm: 'pnpm i --prod',
    yarn: 'yarn install --production',
    bun: 'bun install --production',
  },
  { task: '加一个依赖', npm: 'npm i pkg', pnpm: 'pnpm add pkg', yarn: 'yarn add pkg', bun: 'bun add pkg' },
  { task: '加开发依赖', npm: 'npm i -D pkg', pnpm: 'pnpm add -D pkg', yarn: 'yarn add -D pkg', bun: 'bun add -d pkg' },
  { task: '删一个依赖', npm: 'npm un pkg', pnpm: 'pnpm remove pkg', yarn: 'yarn remove pkg', bun: 'bun remove pkg' },
  { task: '升级所有依赖', npm: 'npm update', pnpm: 'pnpm update', yarn: 'yarn up', bun: 'bun update' },
  {
    task: '升级单个依赖',
    npm: 'npm i pkg@latest',
    pnpm: 'pnpm update pkg',
    yarn: 'yarn up pkg',
    bun: 'bun update pkg',
  },
  { task: '查看过期依赖', npm: 'npm outdated', pnpm: 'pnpm outdated', yarn: 'yarn outdated', bun: 'bun outdated' },
  { task: '审计漏洞', npm: 'npm audit', pnpm: 'pnpm audit', yarn: 'npm audit', bun: 'bun audit' },
  { task: '跑脚本', npm: 'npm run build', pnpm: 'pnpm build', yarn: 'yarn build', bun: 'bun run build' },
  { task: '跑一次性命令', npm: 'npx tsc', pnpm: 'pnpm dlx tsc', yarn: 'yarn dlx tsc', bun: 'bunx tsc' },
  { task: '列出依赖树', npm: 'npm ls --all', pnpm: 'pnpm why pkg', yarn: 'yarn why pkg', bun: 'bun pm ls' },
  {
    task: '清理缓存',
    npm: 'npm cache clean --force',
    pnpm: 'pnpm store prune',
    yarn: 'yarn cache clean',
    bun: 'bun pm cache rm',
  },
  { task: '发布包', npm: 'npm publish', pnpm: 'pnpm publish', yarn: 'npm publish', bun: 'bun pm publish' },
  { task: '本地链接', npm: 'npm link', pnpm: 'pnpm link --global', yarn: 'yarn link', bun: 'bun link' },
  {
    task: '校验锁文件',
    npm: 'npm ci --dry-run',
    pnpm: 'pnpm install --lockfile-only',
    yarn: 'yarn install --immutable',
    bun: 'bun install --dry-run',
  },
  { task: '交互式装依赖', npm: 'npx nypm', pnpm: 'pnpm add', yarn: 'yarn add', bun: 'bun add' },
  {
    task: '列出直接依赖',
    npm: 'npm ls --depth=0',
    pnpm: 'pnpm list --depth=0',
    yarn: 'yarn info --name-only',
    bun: 'bun pm ls --all',
  },
  { task: '打 tarball', npm: 'npm pack', pnpm: 'pnpm pack', yarn: 'yarn pack', bun: 'bun pm pack' },
  { task: '看已装包来源', npm: 'npm explain pkg', pnpm: 'pnpm why pkg', yarn: 'yarn why pkg', bun: 'bun why pkg' },
];

// ── CI 模板 ────────────────────────────────────────────────────────────

type CiProvider = 'github' | 'gitlab' | 'circle' | 'jenkins';

const CI_PROVIDERS: { value: CiProvider; label: string }[] = [
  { value: 'github', label: 'GitHub Actions' },
  { value: 'gitlab', label: 'GitLab CI' },
  { value: 'circle', label: 'CircleCI' },
  { value: 'jenkins', label: 'Jenkins pipeline' },
];

type PmChoice = 'npm' | 'pnpm' | 'yarn' | 'bun';

const PM_CHOICES: { value: PmChoice; label: string }[] = [
  { value: 'pnpm', label: 'pnpm（推荐）' },
  { value: 'npm', label: 'npm' },
  { value: 'yarn', label: 'Yarn Berry' },
  { value: 'bun', label: 'Bun' },
];

interface CiOptions {
  provider: CiProvider;
  manager: PmChoice;
  nodeVersion: string;
  cache: boolean;
  frozenLockfile: boolean;
  runCommand: string;
  registry: string;
}

const DEFAULT_CI: CiOptions = {
  provider: 'github',
  manager: 'pnpm',
  nodeVersion: '22',
  cache: true,
  frozenLockfile: true,
  runCommand: 'pnpm run build',
  registry: '',
};

export function buildCi(options: CiOptions): string {
  // registry 作为独立的 shell 命令，交给各平台自己缩进，避免嵌套模板把换行搞乱
  const registryStep = options.registry.trim() === '' ? '' : `npm config set registry ${options.registry.trim()}`;
  const install =
    options.manager === 'npm'
      ? `npm ci${options.frozenLockfile ? '' : ' || npm install'}`
      : options.manager === 'pnpm'
        ? `pnpm install${options.frozenLockfile ? ' --frozen-lockfile' : ''}`
        : options.manager === 'yarn'
          ? `yarn install${options.frozenLockfile ? ' --immutable' : ''}`
          : `bun install${options.frozenLockfile ? ' --frozen-lockfile' : ''}`;

  // pnpm / yarn / bun 在 GitHub Actions 镜像里不是预装的，需要显式启用
  const needsCorepack = options.manager === 'pnpm' || options.manager === 'yarn';
  // 缓存键必须跟着锁文件走，否则依赖变了还会命中脏缓存
  const lockfile =
    options.manager === 'npm'
      ? 'package-lock.json'
      : options.manager === 'pnpm'
        ? 'pnpm-lock.yaml'
        : options.manager === 'yarn'
          ? 'yarn.lock'
          : 'bun.lock';

  if (options.provider === 'github') {
    return `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '${options.nodeVersion}'
${
  options.cache
    ? `          cache: '${options.manager}'
`
    : ''
}${
  needsCorepack
    ? `      - name: 启用 ${options.manager}
        run: corepack enable
`
    : ''
}${
  options.manager === 'bun'
    ? `      - name: 安装 Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
`
    : ''
}${
  registryStep === ''
    ? ''
    : `      - name: 设置 registry
        run: ${registryStep}
`
}      - name: 安装依赖
        run: ${install}
      - name: 构建
        run: ${options.runCommand}
`;
  }

  if (options.provider === 'gitlab') {
    return `stages:
  - build

cache:
  key:
    files:
      - ${lockfile}
  paths:
    - .npm
    - node_modules
    - ~/.cache

build-job:
  stage: build
  image: node:${options.nodeVersion}
  cache:
    key:
      files:
        - ${lockfile}
  script:${needsCorepack ? '\n    - corepack enable' : ''}${registryStep === '' ? '' : `\n    - ${registryStep}`}
    - ${install.replace(/\n/g, '\n    - ')}
    - ${options.runCommand}
`;
  }

  if (options.provider === 'circle') {
    return `version: 2.1

jobs:
  build:
    docker:
      - image: cimg/node:${options.nodeVersion}
    steps:
      - checkout
      - restore_cache:
          keys:
            - deps-{{ checksum "${lockfile}" }}
            - deps-
${needsCorepack ? `      - run:\n          name: 启用 ${options.manager}\n          command: corepack enable\n` : ''}${registryStep === '' ? '' : `      - run:\n          name: 设置 registry\n          command: ${registryStep}\n`}      - run:
          name: 安装依赖
          command: ${install.replace(/\n/g, ' && ')}
      - save_cache:
          key: deps-{{ checksum "${lockfile}" }}
          paths:
            - node_modules
            - ~/.cache
            - ~/.npm
      - run:
          name: 构建
          command: ${options.runCommand}
`;
  }

  return `pipeline {
  agent any
  environment {
    nodejs = '${options.nodeVersion}'
  }
  stages {
    stage('依赖') {
      steps {
${needsCorepack ? `        sh 'corepack enable'\n` : ''}${registryStep === '' ? '' : `        sh '${registryStep}'\n`}        sh '${install.replace(/\n/g, ' && ')}'
      }
    }
    stage('构建') {
      steps {
        sh '${options.runCommand}'
      }
    }
  }
  post {
    always {
      junit 'reports/**/*.xml'
    }
  }
}
`;
}

// ── 镜像配置 ────────────────────────────────────────────────────────────

interface MirrorOptions {
  manager: PmChoice;
  registry: string;
  strictSsl: boolean;
  scope: string;
}

const DEFAULT_MIRROR: MirrorOptions = {
  manager: 'pnpm',
  registry: 'https://registry.npmmirror.com/',
  strictSsl: true,
  scope: '',
};

const MIRROR_RECOMMEND: LinkItem[] = [
  {
    name: 'npmmirror（淘宝源）',
    url: 'https://npmmirror.com/',
    description: '国内 npm 镜像，提供二进制与包两种 registry',
    tags: ['npm', '镜像'],
  },
  {
    name: 'npm 官方 registry',
    url: 'https://registry.npmjs.org/',
    description: '官方源，完整性最可靠',
    tags: ['npm', '官方'],
  },
  {
    name: 'pnpm 配置文档',
    url: 'https://pnpm.io/npmrc',
    description: '.npmrc 全部可配置项',
    tags: ['pnpm'],
  },
  {
    name: 'Yarn 配置文档',
    url: 'https://yarnpkg.com/configuration/yml',
    description: '.yarnrc.yml 配置项',
    tags: ['yarn'],
  },
  {
    name: 'Bun 文档',
    url: 'https://bun.sh/docs/pm/cli/install',
    description: 'bun install 行为与配置',
    tags: ['bun'],
  },
  {
    name: 'Volta',
    url: 'https://volta.sh/',
    description: '把 Node 版本写进 package.json，省去 nvm 切换',
    tags: ['node', '版本'],
  },
  {
    name: 'corepack',
    url: 'https://nodejs.org/api/corepack.html',
    description: 'Node 自带的包管理器版本管理',
    tags: ['node', '官方'],
  },
  {
    name: 'depcheck',
    url: 'https://github.com/depcheck/depcheck',
    description: '找出 package.json 里没用的依赖',
    tags: ['清理'],
  },
];

export function buildNpmrc(options: MirrorOptions): string {
  const registry = options.registry.trim() === '' ? 'https://registry.npmjs.org/' : options.registry.trim();
  const lines = [`registry=${registry}`, `strict-ssl=${options.strictSsl}`, `audit=true`];
  if (options.scope.trim() !== '') {
    lines.push(`@${options.scope.trim().replace(/^@/, '')}:registry=${registry}`);
  }
  if (options.manager === 'pnpm') {
    lines.push(
      '',
      '# pnpm 特有：把 store 放到项目同级，CI 缓存可复用',
      'store-dir=.pnpm-store',
      'node-linker=isolated',
      '',
      '# 装完自动跑构建脚本（next.js 等需要）',
      'enable-pre-post-scripts=true',
      '',
      '# 严格校验 peerDependencies',
      'strict-peer-dependencies=true',
    );
  }
  if (options.manager === 'yarn') {
    lines.push('', '# Yarn Berry 请写到 .yarnrc.yml，而不是 .npmrc', 'nodeLinker: node-modules');
  }
  if (options.manager === 'bun') {
    lines.push('', '# Bun 用 bunfig.toml，下面几项等价配置', '[install]', `registry = "${registry}"`, 'exact = true');
  }
  return `${lines.join('\n')}\n`;
}

export function buildYarnrc(options: MirrorOptions): string {
  const registry = options.registry.trim() === '' ? 'https://registry.npmjs.org/' : options.registry.trim();
  return `nodeLinker: node-modules

npmRegistryServer: "${registry}"
enableGlobalCache: true

# 压缩安装包传输
compressionLevel: mixed

# 复用 CI 缓存目录
cacheFolder: .yarn/cache

# 校验与审计
enableStrictSsl: ${options.strictSsl}
npmAuditRegistry: "${registry}"
${options.scope.trim() === '' ? '' : `\n"@${options.scope.trim().replace(/^@/, '')}:registry": "${registry}"\n`}`;
}

// ── Monorepo 提速 ──────────────────────────────────────────────────────

interface MonorepoRow {
  item: string;
  detail: string;
  impact: string;
}

const MONOREPO_TIPS: MonorepoRow[] = [
  {
    item: 'pnpm-workspace.yaml',
    detail: 'packages 只列真正要发布的目录，别用 packages: ["**"]，glob 展开很慢',
    impact: '高',
  },
  { item: 'filter 安装', detail: 'pnpm i --filter @app/web... 只装目标包及其依赖，替代全量安装', impact: '高' },
  { item: '变更检测', detail: 'CI 里用 turbo/moon 的 affected 机制跳过无关包，缓存命中率是关键', impact: '高' },
  { item: '依赖去重', detail: '统一版本范围，pnpm 的 .pnpmfile.cjs 可 hook 强制收敛版本', impact: '中' },
  { item: 'sideEffects 标注', detail: '在 package.json 里写 sideEffects: false，打包产物能小一大截', impact: '中' },
  { item: '构建缓存', detail: '把 tsc 增量产物、swc 缓存目录写进 CI cache key 的附加项', impact: '高' },
  { item: '避免 npm scripts 串联', detail: '&& 串起 10 个子包构建是串行瓶颈，能并行就并行', impact: '中' },
  { item: '依赖图体检', detail: 'pnpm -r why <pkg> 找出重复引入版本，确认没有双份 React', impact: '中' },
  { item: 'preinstall 钩子', detail: '统一用 corepack 锁定包管理器版本，别让 CI 拉到最新 pnpm', impact: '高' },
  {
    item: 'lockfile 必须提交',
    detail: '锁文件不进版本库，CI 每次解析依赖树都不一样，缓存永远命中不了',
    impact: '极高',
  },
  { item: '隔离 node_modules', detail: '默认布局下每个包的 node_modules 只有符号链接，扫描与删除都更快', impact: '中' },
  { item: '私有 registry 缓存', detail: '公司内网 npm 走 Verdaccio/Artifactory 代理并缓存 tarball', impact: '中' },
];

// ── FAQ ────────────────────────────────────────────────────────────────

interface FaqRow {
  q: string;
  a: string;
}

const FAQS: FaqRow[] = [
  {
    q: 'CI 为什么必须提交锁文件？',
    a: '锁文件决定了依赖树的每个版本。没有它，CI 每次都要向 registry 解析依赖树，既慢又会拿到不同版本，缓存 key 也就无法稳定命中。',
  },
  {
    q: 'frozen-lockfile 报 ERR_PNPM_OUTDATED_LOCKFILE？',
    a: '说明锁文件与 package.json 不一致，通常是有人改了依赖没重新安装。本地跑一次不带 frozen 的安装再提交锁文件。',
  },
  {
    q: 'npm i 和 npm ci 有什么区别？',
    a: 'npm ci 严格按锁文件安装且会删掉整个 node_modules，失败时不会留下半成品状态，CI 应该用 ci。npm i 可能修改锁文件。',
  },
  {
    q: 'pnpm 的 ERR_PNPM_PEER_DEPS_ISSUES 怎么开？',
    a: '在 .npmrc 里设 strict-peer-dependencies=true，或者对已知冲突写 public-hoist-pattern。也可以按包豁免。',
  },
  {
    q: 'Yarn PnP 报 "Cannot find module"？',
    a: 'PnP 不把依赖放进 node_modules，依赖方必须在 package.json 里显式声明。常见解法是切回 nodeLinker: node-modules。',
  },
  {
    q: 'bun install 会改变 package.json 吗？',
    a: '默认不会升级已有依赖版本，也不会重写 lockfile 里的解析结果。它的升级行为比 npm 保守，锁文件抖动更少。',
  },
  {
    q: '怎么判断哪个包管理器更适合项目？',
    a: '看是否需要 workspace（pnpm/yarn/bun 内建）、是否被 registry 限速（镜像配置）、团队是否依赖 corepack 统一版本。',
  },
  {
    q: 'install 卡住怎么排查？',
    a: '先用 --reporter ndjson 看每个包的耗时，定位是网络还是构建脚本。构建脚本慢可以加 --ignore-scripts 再单独跑。',
  },
];

function compareRows(lines: string[]): PmRow[] {
  return lines.map((line) => {
    const [name, lockfile, workspace, nodeModules, speed, note] = line.split(' | ');
    return { name, lockfile, workspace, nodeModules, speed, note };
  });
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-56">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 pl-7 text-xs"
        aria-label={placeholder}
      />
    </div>
  );
}

export default function PackageManager() {
  const [tab, setTab] = useState<Tab>('compare');
  const [query, setQuery] = useState('');
  const [ci, setCi] = useState<CiOptions>(DEFAULT_CI);
  const [mirror, setMirror] = useState<MirrorOptions>(DEFAULT_MIRROR);

  const filteredManagers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return PACKAGE_MANAGERS;
    return PACKAGE_MANAGERS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return COMMAND_ROWS;
    return COMMAND_ROWS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredTips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return MONOREPO_TIPS;
    return MONOREPO_TIPS.filter((row) => `${row.item} ${row.detail}`.toLowerCase().includes(q));
  }, [query]);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return FAQS;
    return FAQS.filter((row) => `${row.q} ${row.a}`.toLowerCase().includes(q));
  }, [query]);

  const ciText = useMemo(() => buildCi(ci), [ci]);
  const npmrc = useMemo(() => buildNpmrc(mirror), [mirror]);
  const yarnrc = useMemo(() => buildYarnrc(mirror), [mirror]);

  return (
    <ToolPanel
      title="包管理器导航"
      description={`${PACKAGE_MANAGERS.length} 款包管理器对比、${COMMAND_ROWS.length} 组命令对照、CI 与镜像配置生成`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索包管理器或命令" />}
    >
      <Note tone="warn" title="定位说明">
        浏览器扩展<b>无法执行 npm/pnpm/yarn 命令，也无法读写你的 node_modules</b>。 本工具提供选型对比、命令速查、CI
        与镜像配置生成。真正安装依赖请在本机终端运行。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'compare' && <Boxes className="size-3.5" />}
                {item.value === 'commands' && <PackageCheck className="size-3.5" />}
                {item.value === 'ci' && <Workflow className="size-3.5" />}
                {item.value === 'mirror' && <ServerCog className="size-3.5" />}
                {item.value === 'monorepo' && <FileCog className="size-3.5" />}
                {item.value === 'faq' && <TriangleAlert className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'compare' && (
        <Section
          title="包管理器对比"
          description="包含 Node 生态之外的 Maven / Gradle / Cargo / uv 等，便于横向理解设计取舍"
        >
          {filteredManagers.length === 0 ? (
            <EmptyHint>没有匹配的包管理器</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">名称</th>
                    {COMPARE_COLUMNS.map((column) => (
                      <th key={column.key} className="py-1.5 pr-2 font-medium">
                        {column.label}
                      </th>
                    ))}
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredManagers.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.name}</td>
                      {COMPARE_COLUMNS.map((column) => (
                        <td key={column.key} className="py-1.5 pr-2 text-muted-foreground">
                          {row[column.key]}
                        </td>
                      ))}
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint>
            「相对速度」是同量级依赖下的粗略体感，不是基准测试结果。真实差距受网络、磁盘、构建脚本数量影响很大。
          </Hint>
        </Section>
      )}

      {tab === 'commands' && (
        <Section title="命令对照" description="左列是任务，右列是四个主流 Node 包管理器的等价命令">
          {filteredCommands.length === 0 ? (
            <EmptyHint>没有匹配的命令</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">任务</th>
                    <th className="py-1.5 pr-2 font-medium">npm</th>
                    <th className="py-1.5 pr-2 font-medium">pnpm</th>
                    <th className="py-1.5 pr-2 font-medium">Yarn</th>
                    <th className="py-1.5 pr-2 font-medium">Bun</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommands.map((row) => (
                    <tr key={row.task} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.task}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.npm}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.pnpm}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.yarn}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.bun}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint>「跑一次性命令」一行的差异最容易踩坑：npm 用 npx，pnpm 是 dlx，Yarn 是 dlx，Bun 是 bunx。</Hint>
        </Section>
      )}

      {tab === 'ci' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项" description="缓存键建议包含锁文件哈希">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="CI 平台"
                value={ci.provider}
                onChange={(provider) => setCi({ ...ci, provider: provider as CiProvider })}
                options={CI_PROVIDERS}
              />
              <Select
                label="包管理器"
                value={ci.manager}
                onChange={(manager) => setCi({ ...ci, manager: manager as PmChoice })}
                options={PM_CHOICES}
              />
              <TextField
                label="Node 版本"
                value={ci.nodeVersion}
                onChange={(nodeVersion) => setCi({ ...ci, nodeVersion })}
                hint="建议用大版本号，配合 corepack 锁定包管理器"
              />
              <TextField
                label="构建命令"
                value={ci.runCommand}
                onChange={(runCommand) => setCi({ ...ci, runCommand })}
              />
              <TextField
                label="registry（留空则不设置）"
                value={ci.registry}
                onChange={(registry) => setCi({ ...ci, registry })}
                placeholder="https://registry.npmmirror.com/"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox label="开启依赖缓存" checked={ci.cache} onChange={(cache) => setCi({ ...ci, cache })} />
              <Checkbox
                label="严格按锁文件安装"
                checked={ci.frozenLockfile}
                onChange={(frozenLockfile) => setCi({ ...ci, frozenLockfile })}
              />
            </div>
          </Section>
          <Section
            title="CI 配置"
            description="把缓存键与锁文件绑定，是 CI 提速最有效的一步"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(ciText)} aria-label="复制 CI 配置">
                复制
              </Button>
            }
          >
            <CodeBlock
              code={ciText}
              language={
                ci.provider === 'gitlab'
                  ? 'yaml'
                  : ci.provider === 'github'
                    ? 'yaml'
                    : ci.provider === 'circle'
                      ? 'yaml'
                      : 'conf'
              }
              title={`ci.${ci.provider}`}
              filename={`ci.${ci.provider === 'circle' ? 'yml' : ci.provider === 'github' ? 'yml' : ci.provider === 'gitlab' ? 'yml' : 'jenkinsfile'}`}
              maxLines={40}
            />
          </Section>
          <Note tone="info" title="缓存要点">
            <ul className="list-disc pl-4">
              <li>缓存键必须包含锁文件哈希，否则依赖一变就用了脏缓存。</li>
              <li>node_modules 是否缓存取决于包管理器：pnpm 缓存 store 更快，npm 缓存整个 node_modules 也行。</li>
              <li>缓存构建工具产物（.next、dist、tsbuildinfo）通常比缓存依赖收益更大。</li>
            </ul>
          </Note>
        </div>
      )}

      {tab === 'mirror' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="镜像配置" description="生成 .npmrc；Yarn Berry 另给 .yarnrc.yml">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="包管理器"
                value={mirror.manager}
                onChange={(manager) => setMirror({ ...mirror, manager: manager as PmChoice })}
                options={PM_CHOICES}
              />
              <TextField
                label="registry"
                value={mirror.registry}
                onChange={(registry) => setMirror({ ...mirror, registry })}
              />
              <TextField
                label="限定 scope（可选）"
                value={mirror.scope}
                onChange={(scope) => setMirror({ ...mirror, scope })}
                placeholder="例如 company"
                hint="只对 @company/* 走镜像"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox
                label="校验 TLS 证书（strict-ssl）"
                checked={mirror.strictSsl}
                onChange={(strictSsl) => setMirror({ ...mirror, strictSsl })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName('npmrc', 'npmrc'), npmrc, 'text/plain;charset=utf-8')}
              >
                下载 .npmrc
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName('yarnrc', 'yml'), yarnrc, 'text/plain;charset=utf-8')}
              >
                下载 .yarnrc.yml
              </Button>
            </div>
          </Section>
          <Section title=".npmrc" description="pnpm / npm 通用">
            <CodeBlock code={npmrc} language="ini" title=".npmrc" filename=".npmrc" maxLines={30} />
          </Section>
          <Section title=".yarnrc.yml" description="Yarn Berry 专用，配置在 YAML 里而不是 .npmrc">
            <CodeBlock code={yarnrc} language="yaml" title=".yarnrc.yml" filename=".yarnrc.yml" maxLines={30} />
          </Section>
          <Note tone="warn" title="不要把 strict-ssl 关掉">
            公司网络需要自签证书时，正确做法是把 CA 证书装到系统或 Node 的信任库里，而不是关掉校验。
            关掉后任何中间人都能替换你安装的包。
          </Note>
          <Section title="镜像与工具入口">
            <LinkList items={MIRROR_RECOMMEND} columns={2} />
          </Section>
        </div>
      )}

      {tab === 'monorepo' && (
        <Section title="Monorepo 提速清单" description="按影响排序，先做前三条通常就有明显收益">
          {filteredTips.length === 0 ? (
            <EmptyHint>没有匹配的条目</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredTips.map((row) => (
                <li key={row.item} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium">{row.item}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        row.impact === '极高'
                          ? 'bg-destructive/15 text-destructive'
                          : row.impact === '高'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      影响 {row.impact}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'faq' && (
        <Section title="常见问题" description="锁文件、缓存与 PnP 是踩坑最多的三块">
          {filteredFaqs.length === 0 ? (
            <EmptyHint>没有匹配的问题</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredFaqs.map((row) => (
                <li key={row.q} className="rounded-md border px-3 py-2">
                  <p className="text-xs font-medium">{row.q}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.a}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </ToolPanel>
  );
}
