import { Container, FileCode, Search, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  EmptyHint,
  Hint,
  type LinkItem,
  LinkList,
  Note,
  Section,
  Stat,
  StatGrid,
  ToolPanel,
} from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'compare' | 'commands' | 'dockerfile' | 'compose' | 'security' | 'troubleshoot';

const TABS: { value: Tab; label: string }[] = [
  { value: 'compare', label: '运行时对比' },
  { value: 'commands', label: '命令速查' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'compose', label: 'Compose 片段' },
  { value: 'security', label: '安全基线' },
  { value: 'troubleshoot', label: '排障' },
];

interface RuntimeRow {
  name: string;
  daemon: string;
  rootless: string;
  build: string;
  windows: string;
  note: string;
}

const RUNTIMES = runtimeRows([
  'Docker Engine | 需要 dockerd | 官方支持（rootlesskit） | BuildKit | 桌面与服务器都稳 | 生态最全，镜像与工具最多',
  'Docker Desktop | 自带 VM | 需在设置里开 | 内置 BuildKit | 仅桌面 | macOS/Windows 上跑 Linux 容器最省事',
  'Podman | 无守护进程（libpod） | 原生支持且更成熟 | Buildah | 原生支持 | 与 docker 命令高度兼容，可无 daemon 部署',
  'containerd | 需要 containerd | 有 rootless 模式（nerdctl） | 不负责构建 | 原生支持 | K8s 默认运行时，CNCF 毕业项目',
  'nerdctl | 复用 containerd | 有 rootless 模式 | buildctl | 需额外安装 | containerd 的 Docker 风格 CLI',
  'CRI-O | 需要 crio | 支持 | 不负责构建 | 原生支持 | K8s 另一种合规运行时，RedHat 系主推',
  'runc | 无（单容器） | 依赖 runc 的 rootless 设置 | 不负责构建 | 无官方 | OCI 底层运行时，K8s 里真正跑容器的东西',
  'crun | 同 runc | 同 runc | 不负责构建 | 无官方 | Rust 写的 OCI 运行时，启动更快、内存更省',
  'gVisor | 无（依赖 runc 启动） | 支持 | 不负责构建 | 无官方 | 用户态内核，隔离强但有性能损耗',
  'Firecracker | 无（VMM） | 依赖宿主机 | 不负责构建 | 无官方 | 极简 microVM，K3s / AWS Lambda 用它',
  'LXC / LXD | 需要 snap 或包管理 | 支持 | 有远端镜像 | 无官方 | 系统级容器，接近轻量虚拟机',
  'WSL 2 | 内置 | 不适用 | 不适用 | 仅 Windows | Docker Desktop 底层依赖它，见 WSL 工具',
]);

const RUNTIME_COLUMNS = [
  { key: 'daemon', label: '是否需要守护进程' },
  { key: 'rootless', label: 'Rootless' },
  { key: 'build', label: '构建能力' },
  { key: 'windows', label: 'Windows' },
] as const;

// ── 命令速查 ────────────────────────────────────────────────────────────

interface CommandRow {
  task: string;
  docker: string;
  podman: string;
  note: string;
}

const COMMANDS: CommandRow[] = [
  { task: '列出运行中的容器', docker: 'docker ps', podman: 'podman ps', note: '加 -a 看已停止的' },
  { task: '查看全部容器', docker: 'docker ps -a', podman: 'podman ps -a', note: '' },
  { task: '看镜像', docker: 'docker images', podman: 'podman images', note: '' },
  {
    task: '进入容器交互 Shell',
    docker: 'docker exec -it <容器> sh',
    podman: 'podman exec -it <容器> sh',
    note: '容器内有 bash 时用 bash',
  },
  {
    task: '不进入直接跑命令',
    docker: 'docker run --rm alpine echo hi',
    podman: 'podman run --rm alpine echo hi',
    note: '',
  },
  { task: '查看资源占用', docker: 'docker stats', podman: 'podman stats', note: '--no-stream 关掉持续刷新' },
  {
    task: '查看容器日志',
    docker: 'docker logs -f --tail 100 <容器>',
    podman: 'podman logs -f --tail 100 <容器>',
    note: '',
  },
  {
    task: '查看容器详情',
    docker: 'docker inspect <容器>',
    podman: 'podman inspect <容器>',
    note: '--format 可只取某个字段',
  },
  { task: '查看端口占用来源', docker: 'docker port <容器>', podman: 'podman port <容器>', note: '' },
  {
    task: '看容器改动过的文件',
    docker: 'docker diff <容器>',
    podman: 'podman diff <容器>',
    note: '排查误写文件很有用',
  },
  {
    task: '清理停止的容器',
    docker: 'docker container prune',
    podman: 'podman container prune',
    note: '危险，会删掉所有停止容器',
  },
  { task: '清理无用镜像', docker: 'docker image prune -a', podman: 'podman image prune -a', note: '' },
  {
    task: '清理卷与网络',
    docker: 'docker system prune --volumes',
    podman: 'podman system prune --volumes',
    note: '最彻底，也最容易误删数据',
  },
  { task: '看磁盘占用分布', docker: 'docker system df -v', podman: 'podman system df -v', note: '' },
  {
    task: '导出镜像为 tar',
    docker: 'docker save -o img.tar img:tag',
    podman: 'podman save -o img.tar img:tag',
    note: '',
  },
  { task: '导入镜像', docker: 'docker load -i img.tar', podman: 'podman load -i img.tar', note: '' },
  {
    task: '导出容器文件系统',
    docker: 'docker export -o c.tar <容器>',
    podman: 'podman export -o c.tar <容器>',
    note: '不保留镜像历史',
  },
  {
    task: '查看构建历史',
    docker: 'docker history img:tag',
    podman: 'podman history img:tag',
    note: '排查镜像体积膨胀',
  },
  { task: '清理构建缓存', docker: 'docker builder prune', podman: 'podman builder prune', note: '' },
  { task: '跨宿主机复制文件', docker: 'docker cp <容器>:/path .', podman: 'podman cp <容器>:/path .', note: '' },
  {
    task: '限制容器资源',
    docker: 'docker run --memory=512m --cpus=1.5 ...',
    podman: 'podman run --memory=512m --cpus=1.5 ...',
    note: '生产环境必设',
  },
  {
    task: '只读根文件系统',
    docker: 'docker run --read-only ...',
    podman: 'podman run --read-only ...',
    note: '配合 tmpfs 挂可写目录',
  },
  { task: '查看运行时事件', docker: 'docker events', podman: 'podman events', note: '配合 --filter 过滤事件类型' },
  {
    task: '查看容器命名空间',
    docker: 'docker inspect --format "{{.State.Pid}}" <容器>',
    podman: 'podman inspect --format "{{.State.Pid}}" <容器>',
    note: '拿到宿主 PID 便于调试',
  },
  {
    task: '重启 / 停止容器',
    docker: 'docker restart <容器>',
    podman: 'podman restart <容器>',
    note: 'stop 更温和，kill 强杀',
  },
];

// ── Dockerfile 生成 ─────────────────────────────────────────────────────

type BaseKind = 'node' | 'python' | 'go' | 'static' | 'rust';

const BASES: { value: BaseKind; label: string }[] = [
  { value: 'node', label: 'Node.js（多阶段 + distroless）' },
  { value: 'python', label: 'Python（slim + 非 root）' },
  { value: 'go', label: 'Go（静态编译 scratch）' },
  { value: 'static', label: '静态站点（Nginx）' },
  { value: 'rust', label: 'Rust（release 精简）' },
];

interface DockerfileOptions {
  base: BaseKind;
  port: number;
  workdir: string;
  nonRoot: boolean;
  multiStage: boolean;
  cacheMounts: boolean;
  healthcheck: boolean;
  alpine: boolean;
}

const DEFAULT_DOCKERFILE: DockerfileOptions = {
  base: 'node',
  port: 3000,
  workdir: '/app',
  nonRoot: true,
  multiStage: true,
  cacheMounts: true,
  healthcheck: true,
  alpine: false,
};

function buildDockerfile(options: DockerfileOptions): string {
  // BuildKit 缓存挂载是 RUN 的 flag，必须紧跟在 RUN 后面，所以整行拼出来而不是插值
  const runNpm = (command: string) =>
    options.cacheMounts ? `RUN --mount=type=cache,target=/root/.npm \\\n    ${command}` : `RUN ${command}`;
  // 探针命令自己带退出码，HEALTHCHECK 不需要再追加 || exit 1
  const probe =
    options.base === 'python'
      ? `python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:PORT/health').status==200 else 1)"`
      : options.base === 'go'
        ? 'wget -qO- http://127.0.0.1:PORT/health'
        : `node -e "fetch('http://127.0.0.1:PORT/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`;
  const health = options.healthcheck
    ? `\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD ${probe}`
    : '';
  const user = options.nonRoot ? `\n\n# 用内置的非 root 用户，不要自己写 USER root 再切\nUSER node` : '';
  const healthReplaced = health.replace(/PORT/g, String(options.port));

  if (options.base === 'go') {
    return `# 多阶段：编译用完整镜像，运行用 scratch
FROM golang:${options.alpine ? '1.23-alpine' : '1.23'} AS builder
WORKDIR ${options.workdir}
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/app /app
EXPOSE ${options.port}
${options.nonRoot ? 'USER 65534:65534\n' : ''}ENTRYPOINT ["/app"]${healthReplaced}
`;
  }

  if (options.base === 'python') {
    return `# 依赖层单独缓存，代码改动不会让 pip 重装
FROM python:3.12${options.alpine ? '-alpine' : '-slim'} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PIP_NO_CACHE_DIR=1
WORKDIR ${options.workdir}

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE ${options.port}
${options.nonRoot ? '\nRUN useradd --create-home --uid 10001 app\nUSER app\n' : ''}CMD ["python", "-m", "app"]${healthReplaced}
`;
  }

  if (options.base === 'static') {
    return `# 构建产物 + Nginx 运行
FROM node:${options.alpine ? '22-alpine' : '22'}-alpine AS builder
WORKDIR ${options.workdir}
COPY package.json package-lock.json ./
${runNpm('npm ci')}
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder ${options.workdir}/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
${options.nonRoot ? 'USER nginx\n' : ''}CMD ["nginx", "-g", "daemon off;"]${healthReplaced}
`;
  }

  if (options.base === 'rust') {
    return `# 编译产物很大，所以单独一个 builder 阶段
FROM rust:1.82-slim AS builder
WORKDIR ${options.workdir}
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src

COPY . .
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \\
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder ${options.workdir}/target/release/app /app
EXPOSE ${options.port}
${options.nonRoot ? 'USER 10001:10001\n' : ''}ENTRYPOINT ["/app"]${healthReplaced}
`;
  }

  if (!options.multiStage) {
    return `# 单阶段：简单直接，但镜像会带上构建工具
FROM node:${options.alpine ? '22-alpine' : '22'}${options.alpine ? '' : '-slim'}
WORKDIR ${options.workdir}
ENV NODE_ENV=production
COPY package.json package-lock.json ./
${runNpm('npm ci && npm cache clean --force')}
COPY . .
EXPOSE ${options.port}${user}
CMD ["node", "dist/index.js"]${healthReplaced}
`;
  }

  return `# 多阶段：deps 阶段只装依赖，体积小且缓存友好
FROM node:${options.alpine ? '22-alpine' : '22'}${options.alpine ? '' : '-slim'} AS deps
WORKDIR ${options.workdir}
COPY package.json package-lock.json ./
${runNpm('npm ci --omit=dev')}

FROM node:${options.alpine ? '22-alpine' : '22'}${options.alpine ? '' : '-slim'} AS builder
WORKDIR ${options.workdir}
COPY --from=deps ${options.workdir}/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .
RUN npm run build

FROM node:${options.alpine ? '22-alpine' : '22'}${options.alpine ? '' : '-slim'} AS runner
WORKDIR ${options.workdir}
ENV NODE_ENV=production
COPY --from=deps ${options.workdir}/node_modules ./node_modules
COPY --from=builder ${options.workdir}/dist ./dist
COPY package.json ./
EXPOSE ${options.port}${user}
CMD ["node", "dist/index.js"]${healthReplaced}
`;
}

// ── Compose 片段 ────────────────────────────────────────────────────────

interface ComposeOptions {
  serviceName: string;
  image: string;
  port: number;
  expose: string;
  envFile: boolean;
  healthcheck: boolean;
  readOnly: boolean;
  resources: boolean;
  restart: string;
}

const DEFAULT_COMPOSE: ComposeOptions = {
  serviceName: 'app',
  image: 'nginx:1.27-alpine',
  port: 8080,
  expose: '80',
  envFile: false,
  healthcheck: true,
  readOnly: true,
  resources: true,
  restart: 'unless-stopped',
};

function buildCompose(options: ComposeOptions): string {
  const limits = options.resources
    ? `\n    deploy:\n      resources:\n        limits:\n          cpus: '1.0'\n          memory: 512M\n        reservations:\n          memory: 256M\n`
    : '';
  const tmpfs = options.readOnly ? `\n    tmpfs:\n      - /tmp\n      - /var/cache\n` : '';
  const health = options.healthcheck
    ? `\n    healthcheck:\n      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:${options.expose}/ || exit 1']\n      interval: 30s\n      timeout: 3s\n      retries: 3\n      start_period: 10s\n`
    : '';
  const env = options.envFile ? `\n    env_file:\n      - .env\n` : '';
  return `# docker compose 配置（注意：Dockerfile 转 Compose 请用扩展里的「Docker Run 转 Compose」工具）
services:
  ${options.serviceName}:
    image: ${options.image}
    container_name: ${options.serviceName}
    restart: ${options.restart}
    ports:
      - '${options.port}:${options.expose}'
${env}${health}${limits}${tmpfs}    security_opt:
      - no-new-privileges:true
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'

# 注意：deploy.resources 在非 Swarm 模式下 Docker Compose v2 已支持，
# 老版本 compose 只认 mem_limit / cpus 顶层字段。
`;
}

// ── 安全基线 ────────────────────────────────────────────────────────────

interface BaselineRow {
  item: string;
  risk: '高' | '中' | '低';
  fix: string;
}

const BASELINES: BaselineRow[] = [
  {
    item: '不要用 root 跑应用进程',
    risk: '高',
    fix: 'Dockerfile 里 USER node / app；K8s 里 runAsNonRoot: true + runAsUser',
  },
  { item: '不要把密钥写进镜像层', risk: '高', fix: '用 build secret / CI secret 注入；镜像层删不掉，写进去等于公开' },
  { item: '镜像按 digest 锁定', risk: '高', fix: 'image: nginx@sha256:... 避免 tag 被重指向到恶意镜像' },
  { item: '删除不需要的构建工具', risk: '中', fix: '多阶段构建，运行阶段只拷贝产物' },
  { item: '基础镜像定期更新', risk: '中', fix: '关注基础镜像的 CVE 公告，用 digest + 自动重建流水线' },
  { item: '只读根文件系统', risk: '中', fix: '--read-only 加 tmpfs /tmp，挡住一部分持久化攻击' },
  { item: '禁止提权', risk: '中', fix: 'security_opt: no-new-privileges:true' },
  { item: '限制 CPU 与内存', risk: '中', fix: 'deploy.resources.limits，避免单容器拖垮宿主机' },
  { item: '挂载最小化', risk: '高', fix: '不要 docker run -v /:/host，宿主目录挂进容器等于交出 root' },
  { item: '限制网络出口', risk: '低', fix: '自定义 network + 防火墙策略，别让容器直接访问元数据服务' },
  { item: '日志不要无限增长', risk: '低', fix: 'json-file driver 设 max-size / max-file，或用 journald / fluentd' },
  { item: '定期扫镜像漏洞', risk: '中', fix: 'trivy / grype 进 CI，HIGH 以上阻断发布' },
];

const TROUBLESHOOTS: { q: string; a: string }[] = [
  {
    q: 'docker: Cannot connect to the Docker daemon',
    a: 'daemon 没起或者当前用户不在 docker 组。先 systemctl status docker，再看 sudo docker 是否正常，能 sudo 通说明是权限问题。',
  },
  {
    q: '容器起来立刻退出（exit 1）',
    a: '先 docker logs 看报错。常见是启动命令写错、找不到配置、端口被占。入口是 shell 而 CMD 又被覆盖时容易出现。',
  },
  {
    q: 'OOMKilled 是什么',
    a: '容器内存超限被内核杀掉。docker inspect 看 State.OOMKilled=true。加 --memory 限制前先确认应用真实用量，必要时调 JVM 堆或 Node 的 --max-old-space-size。',
  },
  {
    q: '构建很慢 / 缓存总失效',
    a: 'COPY 顺序问题：把依赖清单（package.json、go.mod）单独 COPY 并先安装，代码改动才不会让依赖层失效。',
  },
  {
    q: '镜像特别大，怎么排查',
    a: 'docker history 看每层体积。常见原因：把 node_modules、构建缓存、.git 一起 COPY 进去了，或基础镜像选了带完整 SDK 的版本。',
  },
  {
    q: '容器内时间不对 / 随机数行为异常',
    a: '镜像默认不继承宿主机时区。加 TZ 环境变量，或挂载 /etc/localtime。随机数容器内熵值偏低，别在容器里生成长期密钥。',
  },
  {
    q: '端口映射了但访问不了',
    a: '三查：宿主机防火墙、容器服务是否监听 0.0.0.0（只听 127.0.0.1 外部访问不到）、映射端口与容器内端口是否一致。',
  },
  {
    q: '文件挂载进去权限不对',
    a: '看容器内用户的 uid/gid。node 镜像内 node 用户 uid=1000，挂载的目录属主要对应得上。必要时加 --user 或改宿主目录属主。',
  },
  {
    q: 'Podman 的 docker 命令能用吗',
    a: '语法高度兼容，可以用 alias 实现；但卷挂载路径、cgroup、systemd 集成上仍有差异，迁移前要专门验证这几项。',
  },
  {
    q: '怎么在不进容器的情况下执行命令',
    a: 'docker exec 需要容器在跑；已停止的容器只能用 docker cp 拷文件出来看，或用 nsenter 从宿主命名空间进入。',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'Docker 官方文档',
    url: 'https://docs.docker.com/',
    description: 'Engine、Compose、BuildKit 全套文档',
    tags: ['Docker', '官方'],
  },
  {
    name: 'Dockerfile 最佳实践',
    url: 'https://docs.docker.com/build/building/best-practices/',
    description: '官方给的层缓存与多阶段建议',
    tags: ['Dockerfile'],
  },
  {
    name: 'BuildKit 文档',
    url: 'https://docs.docker.com/build/buildkit/',
    description: '缓存挂载、Secret、SSH 转发',
    tags: ['构建'],
  },
  {
    name: 'Compose Specification',
    url: 'https://github.com/compose-spec/compose-spec/blob/main/spec.md',
    description: 'compose.yml 字段的规范来源',
    tags: ['Compose'],
  },
  { name: 'Podman 文档', url: 'https://podman.io/docs', description: '无守护进程容器的完整文档', tags: ['Podman'] },
  {
    name: 'containerd 文档',
    url: 'https://containerd.io/docs/',
    description: 'K8s 默认运行时的文档',
    tags: ['containerd'],
  },
  {
    name: 'OCI 运行时规范',
    url: 'https://github.com/opencontainers/runtime-spec',
    description: '容器到底怎么跑的标准',
    tags: ['OCI'],
  },
  { name: 'Slim images', url: 'https://slim.ai/', description: 'Dockerfile 瘦身检查工具', tags: ['优化'] },
  { name: 'Trivy', url: 'https://trivy.dev/', description: '镜像与文件系统漏洞扫描', tags: ['安全'] },
  {
    name: 'Docker Scout',
    url: 'https://docs.docker.com/scout/',
    description: '官方镜像漏洞与基线分析',
    tags: ['安全'],
  },
  {
    name: 'Distroless 镜像',
    url: 'https://github.com/GoogleContainerTools/distroless',
    description: '只有运行时最小依赖的基础镜像',
    tags: ['安全'],
  },
  {
    name: 'rootless 项目主页',
    url: 'https://rootlesscontainerms.github.io/rootless-containers/',
    description: '无 root 权限跑容器的完整方案',
    tags: ['rootless'],
  },
];

function runtimeRows(lines: string[]): RuntimeRow[] {
  return lines.map((line) => {
    const [name, daemon, rootless, build, windows, note] = line.split(' | ');
    return { name, daemon, rootless, build, windows, note };
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

export default function ContainerRuntime() {
  const [tab, setTab] = useState<Tab>('compare');
  const [query, setQuery] = useState('');
  const [dockerfile, setDockerfile] = useState<DockerfileOptions>(DEFAULT_DOCKERFILE);
  const [compose, setCompose] = useState<ComposeOptions>(DEFAULT_COMPOSE);

  const filteredRuntimes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return RUNTIMES;
    return RUNTIMES.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return COMMANDS;
    return COMMANDS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredTrouble = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TROUBLESHOOTS;
    return TROUBLESHOOTS.filter((row) => `${row.q} ${row.a}`.toLowerCase().includes(q));
  }, [query]);

  const dockerfileText = useMemo(() => buildDockerfile(dockerfile), [dockerfile]);
  const composeText = useMemo(() => buildCompose(compose), [compose]);

  const imageLayers = useMemo(
    () => dockerfileText.split('\n').filter((line) => line.startsWith('FROM ')).length,
    [dockerfileText],
  );

  return (
    <ToolPanel
      title="容器运行时速查"
      description={`${RUNTIMES.length} 种运行时对比、${COMMANDS.length} 组命令、Dockerfile 与 Compose 生成、${BASELINES.length} 条安全基线`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索运行时或命令" />}
    >
      <Note tone="warn" title="定位说明">
        浏览器扩展<b>不能创建容器、不能执行 docker 命令，也不碰你的 Docker socket</b>。
        本工具提供的是选型对比、命令速查、配置文件生成与安全基线。真正跑容器请在本机终端或 CI 里执行。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'compare' && <Container className="size-3.5" />}
                {item.value === 'commands' && <Wrench className="size-3.5" />}
                {item.value === 'dockerfile' && <FileCode className="size-3.5" />}
                {item.value === 'compose' && <FileCode className="size-3.5" />}
                {item.value === 'security' && <ShieldCheck className="size-3.5" />}
                {item.value === 'troubleshoot' && <TriangleAlert className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'compare' && (
        <Section
          title="容器运行时与沙箱对比"
          description="从 OCI 底层运行时到用户态内核、VMM，理解隔离强度与开销的取舍"
        >
          {filteredRuntimes.length === 0 ? (
            <EmptyHint>没有匹配的运行时</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">名称</th>
                    {RUNTIME_COLUMNS.map((column) => (
                      <th key={column.key} className="py-1.5 pr-2 font-medium">
                        {column.label}
                      </th>
                    ))}
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuntimes.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.name}</td>
                      {RUNTIME_COLUMNS.map((column) => (
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
            隔离强度大致是：runl/crun &lt; gVisor &lt;
            Firecracker（越右隔离越强、开销越大）。命名空间共享内核，所以内核漏洞会同时影响宿主与容器。
          </Hint>
        </Section>
      )}

      {tab === 'commands' && (
        <Section title="命令速查" description="Docker 与 Podman 语法基本一致，差异主要在存储与卷挂载路径">
          {filteredCommands.length === 0 ? (
            <EmptyHint>没有匹配的命令</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">任务</th>
                    <th className="py-1.5 pr-2 font-medium">Docker</th>
                    <th className="py-1.5 pr-2 font-medium">Podman</th>
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommands.map((row) => (
                    <tr key={row.task} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.task}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.docker}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.podman}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint>
            如果只想把 docker 命令换成 podman，可用 alias alias; alias docker=podman，真遇到参数差异再回来查这张表。
          </Hint>
        </Section>
      )}

      {tab === 'dockerfile' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项" description="多阶段 + 非 root 是最值得先做的两件事">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="基础镜像"
                value={dockerfile.base}
                onChange={(base) => setDockerfile({ ...dockerfile, base: base as BaseKind })}
                options={BASES}
              />
              <TextField
                label="容器端口"
                type="number"
                value={String(dockerfile.port)}
                onChange={(value) => setDockerfile({ ...dockerfile, port: Number(value) || 3000 })}
              />
              <TextField
                label="工作目录"
                value={dockerfile.workdir}
                onChange={(workdir) => setDockerfile({ ...dockerfile, workdir })}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {dockerfile.base === 'node' && (
                <Checkbox
                  label="多阶段构建"
                  checked={dockerfile.multiStage}
                  onChange={(multiStage) => setDockerfile({ ...dockerfile, multiStage })}
                />
              )}
              <Checkbox
                label="缓存挂载（npm/pip）"
                checked={dockerfile.cacheMounts}
                onChange={(cacheMounts) => setDockerfile({ ...dockerfile, cacheMounts })}
              />
              <Checkbox
                label="非 root 运行"
                checked={dockerfile.nonRoot}
                onChange={(nonRoot) => setDockerfile({ ...dockerfile, nonRoot })}
              />
              <Checkbox
                label="HEALTHCHECK"
                checked={dockerfile.healthcheck}
                onChange={(healthcheck) => setDockerfile({ ...dockerfile, healthcheck })}
              />
              <Checkbox
                label="用 alpine 基础镜像"
                checked={dockerfile.alpine}
                onChange={(alpine) => setDockerfile({ ...dockerfile, alpine })}
                hint="体积更小，musl libc 可能带来兼容问题"
              />
            </div>
          </Section>
          <StatGrid>
            <Stat label="构建阶段数" value={imageLayers} hint="FROM 指令条数" />
            <Stat label="总行数" value={dockerfileText.split('\n').length} />
            <Stat
              label="非 root"
              value={dockerfile.nonRoot ? '是' : '否'}
              tone={dockerfile.nonRoot ? 'success' : 'warn'}
            />
            <Stat
              label="缓存挂载"
              value={dockerfile.cacheMounts ? '是' : '否'}
              tone={dockerfile.cacheMounts ? 'success' : 'info'}
            />
          </StatGrid>
          <Section
            title="Dockerfile"
            description="按依赖清单分层，构建缓存才有效"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(dockerfileText)} aria-label="复制 Dockerfile">
                复制
              </Button>
            }
          >
            <CodeBlock
              code={dockerfileText}
              language="dockerfile"
              title="Dockerfile"
              filename="Dockerfile"
              lineNumbers
              maxLines={40}
            />
          </Section>
          <Section title="配套 .dockerignore" description="忽略没用的文件，既快又安全">
            <CodeBlock
              code={`node_modules
dist
.next
.git
.github
coverage
*.log
.env
.env.*
!.env.example
Dockerfile
.dockerignore
README.md
.vscode
.idea`}
              language="text"
              title=".dockerignore"
              filename=".dockerignore"
              maxLines={25}
            />
          </Section>
          <Section
            title="下载"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName('Dockerfile', 'dockerfile'), dockerfileText)}
              >
                下载 Dockerfile
              </Button>
            }
          >
            <Hint>`.env` 在 ignore 里但 `.env.example` 要保留，这样镜像内构建时仍能拿到变量名而不含真实密钥。</Hint>
          </Section>
        </div>
      )}

      {tab === 'compose' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Note tone="info" title="与已有工具的分工">
            这里只生成<b>最小可用</b>的 compose 片段（单服务 + 安全与资源限制）。 如果你要把已有 <code>docker run</code>{' '}
            命令转换成完整 compose，请用扩展里的「Docker Run 转 Compose」工具，它参数覆盖更全。
          </Note>
          <Section title="生成选项">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                label="服务名"
                value={compose.serviceName}
                onChange={(serviceName) => setCompose({ ...compose, serviceName })}
              />
              <TextField label="镜像" value={compose.image} onChange={(image) => setCompose({ ...compose, image })} />
              <TextField
                label="宿主端口"
                type="number"
                value={String(compose.port)}
                onChange={(value) => setCompose({ ...compose, port: Number(value) || 8080 })}
              />
              <TextField
                label="容器端口"
                value={compose.expose}
                onChange={(expose) => setCompose({ ...compose, expose })}
              />
              <Select
                label="重启策略"
                value={compose.restart}
                onChange={(restart) => setCompose({ ...compose, restart })}
                options={[
                  { value: 'unless-stopped', label: 'unless-stopped（推荐）' },
                  { value: 'always', label: 'always' },
                  { value: 'on-failure', label: 'on-failure' },
                  { value: 'no', label: 'no' },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox
                label="healthcheck"
                checked={compose.healthcheck}
                onChange={(healthcheck) => setCompose({ ...compose, healthcheck })}
              />
              <Checkbox
                label="只读根文件系统"
                checked={compose.readOnly}
                onChange={(readOnly) => setCompose({ ...compose, readOnly })}
              />
              <Checkbox
                label="资源限制"
                checked={compose.resources}
                onChange={(resources) => setCompose({ ...compose, resources })}
              />
              <Checkbox
                label="env_file"
                checked={compose.envFile}
                onChange={(envFile) => setCompose({ ...compose, envFile })}
              />
            </div>
          </Section>
          <Section
            title="compose.yaml"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(composeText)} aria-label="复制 compose 配置">
                复制
              </Button>
            }
          >
            <CodeBlock code={composeText} language="yaml" title="compose.yaml" filename="compose.yaml" maxLines={45} />
          </Section>
          <Section title="常用变体">
            <CodeBlock
              code={`# 单机多服务：应用 + 数据库 + 反代
services:
  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app']
      interval: 10s
volumes:
  pgdata:`}
              language="yaml"
              title="多服务示例"
              maxLines={30}
            />
          </Section>
          <Section
            title="下载"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName('compose', 'yaml'), composeText, 'text/yaml;charset=utf-8')}
              >
                下载 compose.yaml
              </Button>
            }
          >
            <Hint>
              下载后建议先跑 <code>docker compose config</code> 验证语法，它会展开变量并打印最终配置，比直接 up 更安全。
            </Hint>
          </Section>
        </div>
      )}

      {tab === 'security' && (
        <Section title="安全基线" description="按风险排序；「高」这一档通常在第一次评审就会被抓到">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-medium">检查项</th>
                  <th className="py-1.5 pr-2 font-medium">风险</th>
                  <th className="py-1.5 pr-2 font-medium">做法</th>
                </tr>
              </thead>
              <tbody>
                {BASELINES.map((row) => (
                  <tr key={row.item} className="border-b last:border-b-0 align-top">
                    <td className="py-1.5 pr-2 font-medium">{row.item}</td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          row.risk === '高'
                            ? 'bg-destructive/15 text-destructive'
                            : row.risk === '中'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.risk}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note tone="danger" title="镜像层里的密钥删不掉">
            某一层 <code>ENV SECRET=xxx</code> 后再 <code>RUN rm</code>，密钥仍然留在那一层的元数据里，任何人 docker
            history 都能看到。 正确做法是用 <code>RUN --mount=type=secret</code> 或运行时环境变量注入。
          </Note>
        </Section>
      )}

      {tab === 'troubleshoot' && (
        <Section title="常见问题排查" description="按报错信息搜索">
          {filteredTrouble.length === 0 ? (
            <EmptyHint>没有匹配的问题</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredTrouble.map((row) => (
                <li key={row.q} className="rounded-md border px-3 py-2">
                  <p className="font-mono text-xs font-medium">{row.q}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.a}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="官方文档与工具">
        <LinkList items={LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}
