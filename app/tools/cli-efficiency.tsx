import { Copy, Download, FileSearch, Gauge, ListFilter, ScrollText, Search, Timer, Zap } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, TextField } from '../components/ui/field';

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
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';
import {
  buildNgrams,
  cleanLines,
  fuzzyFilterIndexed,
  greedyHighlight,
  type HighlightSegment,
  parseQuery,
} from '../lib/fuzzy';
import { STATUS_ENTRIES } from '../lib/http-status';

type Tab = 'fuzzy' | 'grep' | 'tips' | 'monitor' | 'cheatsheet';

const TABS: { value: Tab; label: string }[] = [
  { value: 'fuzzy', label: '模糊搜索' },
  { value: 'grep', label: '高速文本检索' },
  { value: 'tips', label: '效率技巧' },
  { value: 'monitor', label: '会话与资源监控' },
  { value: 'cheatsheet', label: '模糊查找速查' },
];

/** 紧凑数据行：`命令 :: 说明`，用双冒号分隔以免命令里的管道符干扰。 */
function commandRows(lines: string[]): { command: string; description: string }[] {
  return lines.map((line) => {
    const [command = '', description = ''] = line.split(' :: ');
    return { command: command.trim(), description: description.trim() };
  });
}

const COMMAND_CORPUS = commandRows([
  'git status -sb :: 查看工作区与分支的简要状态',
  'git log --oneline --graph --decorate -20 :: 图形化看最近 20 条提交',
  'git switch -c feature/x :: 新建并切换分支（比 checkout 语义更清晰）',
  'git restore --staged file :: 把文件移出暂存区但保留改动',
  'git restore file :: 丢弃工作区改动（不可恢复，慎用）',
  'git commit --amend --no-edit :: 修改上一条提交的信息或内容',
  'git rebase -i HEAD~5 :: 交互式整理最近 5 条提交（force push 需谨慎）',
  'git reset --soft HEAD~1 :: 撤销一次提交但保留改动在暂存区',
  'git reflog :: 找回被 reset 掉的提交',
  'git bisect start :: 二分定位引入 bug 的提交',
  'git worktree add ../proj-b feature/x :: 同一仓库并行开第二个工作目录',
  'git sparse-checkout set src :: 只检出部分目录，缩短 clone 时间',
  'git clone --filter=blob:none --depth=1 :: 浅克隆 + 过滤 blob，CI 里能快很多',
  'git config --global core.autocrlf input :: Windows 上让 Git 不改换行符',
  'git push --force-with-lease :: 比 --force 安全：只在远端没被别人动过时覆盖',
  'npm ls --depth=1 :: 看一层依赖树',
  'npm why <pkg> :: 查某个包被谁依赖（npm 7+）',
  'npm ci :: 按 lock 文件精确安装，CI 必用',
  'npm run build -- --watch :: 给脚本透传参数',
  'npm outdated :: 查看过期依赖',
  'pnpm list --depth -1 :: 反向只显示直接依赖',
  'pnpm why <pkg> :: pnpm 版的依赖溯源',
  'pnpm dlx <pkg> :: 临时执行一次性 CLI，不污染项目',
  'pnpm audit --prod :: 只审计生产依赖',
  'yarn why <pkg> :: Yarn Berry 的依赖溯源',
  'yarn dedupe :: 去重依赖目录',
  'bun test :: 用 Bun 自带测试运行器跑测试',
  'bunx <pkg> :: Bun 版的 npx',
  'bun pm ls :: 列出依赖树',
  'uv sync :: 按 pyproject/uv.lock 同步虚拟环境',
  'uv run <cmd> :: 在项目环境里跑命令',
  'uv pip list --outdated :: 查看可升级的包',
  'poetry install --no-root :: 装依赖但不装项目本身',
  'pipx list :: 查看所有 pipx 安装的工具',
  'pip list --outdated :: 列出可升级的包',
  'pip install -e . :: 可编辑安装，改代码立即生效',
  'python -m venv .venv :: 创建虚拟环境',
  'cargo tree -i <crate> :: 反查某个 crate 被谁依赖',
  'cargo build --release --locked :: 用 lock 文件做可复现的发布构建',
  'cargo clippy -- -D warnings :: 把 clippy 警告当错误',
  'cargo install --locked <crate> :: 安装时严格使用 lock 文件里的版本',
  'go mod tidy :: 整理依赖与 go.sum',
  'go mod download :: 预下载依赖，离线构建用',
  'go list -m -u all :: 查看所有模块及其可升级版本',
  'go test -race ./... :: 开竞态检测跑全部测试',
  'go build -ldflags "-s -w" :: 去掉调试信息，减小二进制',
  'docker ps -a --format "table {{.Names}}\\t{{.Status}}" :: 自定义列输出容器',
  'docker stats --no-stream :: 一次性看资源占用，不刷新',
  'docker inspect -f "{{.State.Health.Status}}" <c> :: 只取一个字段',
  'docker logs -f --since 10m <c> :: 跟最近 10 分钟日志',
  'docker system df -v :: 磁盘占用明细，找出大镜像',
  'docker image prune -a --filter until=168h :: 清理 7 天前未使用的镜像',
  'docker builder prune --filter until=24h :: 清理构建缓存',
  'docker compose up -d --build :: 后台启动并重建镜像',
  'docker compose logs -f --tail=200 :: 跟踪最近 200 行',
  'docker run --rm -it --entrypoint sh img :: 临时进容器排查（没有 shell 的镜像要用 distroless 变体）',
  'kubectl get pods -o wide :: 看 Pod 落在哪个节点、IP 是多少',
  'kubectl get deploy -w :: 观察滚动更新',
  'kubectl logs -f deploy/api --tail=100 :: 直接看 Deployment 的某个 Pod 日志',
  'kubectl logs --previous -l app=api :: 看崩溃前的上一次容器日志',
  'kubectl describe pod <p> :: 看事件与探针失败原因',
  'kubectl exec -it <p> -- sh :: 进容器',
  'kubectl debug -it <p> --image=nicolaka/netshoot --target=<container> :: 临时容器注入网络工具',
  'kubectl top pod --containers :: 看容器级 CPU/内存',
  'kubectl rollout undo deploy/api :: 回滚滚动更新',
  'kubectl rollout status deploy/api --timeout=60s :: 等待发布完成',
  'kubectl port-forward svc/api 8080:80 :: 把 Service 端口转到本机',
  'kubectl get events --sort-by=.lastTimestamp :: 按时间排事件',
  'systemctl status nginx --no-pager :: 看服务状态与最近日志',
  'systemctl list-units --failed :: 列出失败的服务',
  'journalctl -u nginx -f -n 100 :: 跟踪服务日志',
  'journalctl --since "1 hour ago" -p err :: 看最近一小时错误级日志',
  'lsof -i :8080 :: 谁占用了 8080 端口',
  'ss -tulnp :: 列出监听端口与进程（比 netstat 现代）',
  'ps aux --sort=-%mem | head :: 内存占用最高的进程',
  'pgrep -af node :: 按命令行找进程',
  'kill -TERM $(pgrep -f "worker") :: 优雅结束一批进程',
  'lsof -p <pid> | grep cwd :: 看进程的当前目录',
  'ls -lahS :: 按大小倒序列出文件',
  'find . -type f -name "*.log" -mtime -7 :: 7 天内改过的日志',
  'find . -type f -size +100M :: 大于 100MB 的文件',
  'du -sh * | sort -h | tail -20 :: 找出最占空间的目录',
  'duf -h :: 更直观的 du 替代品',
  'dust :: 快速扫目录树（比 du 快，默认忽略 .gitignore 里的东西）',
  'tokei . :: 统计代码行数与语言占比',
  'rg -n "TODO" --glob "!dist" :: 递归搜内容并排除目录',
  'rg -l "import" src :: 只列出包含关键字的文件',
  'rg -c "error" -g "*.log" :: 只输出每个文件的命中次数',
  'rg -F "a.b" :: 按固定字符串搜，不走正则',
  'rg --type ts -S "SECRET" -uuu :: 搜隐藏文件与 gitignore 忽略的文件',
  'rg -S "password" -g "!.git" -g "!node_modules" :: 排除目录',
  'fd -e ts -e tsx :: 按扩展名找文件，比 find 简洁',
  'fd -H . -t d :: 包含隐藏文件，只找目录',
  'bat -l cpp --style=numbers :: 带语法高亮和行号看文件',
  'jq -r ".items[] | .name" data.json :: 提取 JSON 数组字段',
  'jq -s "map(.value) | add" *.json :: 多个文件合并成一个数组再求和',
  'jq -e "select(.status >= 500)" <<< "$json" :: 条件筛选出错误响应',
  'yq -o=json ".spec.containers[0].image" deploy.yaml :: YAML 转 JSON 并取字段',
  'curl -sS -o /dev/null -w "%{http_code} %{time_total}\\n" https://example.com :: 只看状态码与耗时',
  'curl -sS -H "Authorization: Bearer $TOKEN" --data @body.json -H "Content-Type: application/json" https://api.example.com/v1 :: 发 JSON 请求',
  'ab -n 1000 -c 50 https://example.com :: 压测 1000 次 50 并发',
  'hey -n 2000 -c 100 -q 1 https://example.com :: hey 版的快速压测',
  'hyperfine --runs 10 "cmd1" "cmd2" :: 公平对比两条命令的耗时',
  'time (for i in {1..100}; do cmd; done :: 手动计时（bash 下用 time 加子 shell）',
  'watch -n 2 "df -h" :: 每 2 秒刷新一次',
  'column -t -s $"\\t" file.txt :: 把 TSV 对齐成表格',
  'xargs -0 -n1 -P4 cmd < list.txt :: 用 NUL 分隔、4 并发地跑',
  'xargs -I{} curl -s {} < urls.txt :: 逐行作为参数（注意特殊字符）',
  'parallel -j4 "echo {}" ::: *.jpg :: GNU parallel，语法更友好',
  'awk "{print \\$1, \\$NF}" file :: 打印第一列和最后一列',
  'awk -F: "{print \\$1}" /etc/passwd :: 按冒号切分',
  'awk "{sum+=\\$1} END {print sum}" numbers :: 求和',
  'sed -n "1,10p" file :: 打印前 10 行',
  'sed -i.bak "s/a/b/g" file :: 原地替换并留备份',
  'cut -d, -f1,3 data.csv :: 取第 1、3 列',
  'sort -u | uniq -c | sort -rn | head :: 计数并按频次倒序',
  'paste -sd, < list :: 拼成一行 CSV',
  'nl -ba file | sed -n "5,10p" :: 带行号看片段',
  'diff -u old new | less -R :: 彩色 unified diff',
  'comm -12 <(sort a) <(sort b) :: 求两个已排序文件的交集',
  'join -t: -1 1 -2 1 a.txt b.txt :: 按键关联两个文件',
  'tr "a-z" "A-Z" < file :: 大小写转换',
  'echo -e "a\\tb" | column -t :: 生成对齐表格',
  'truncate -s 0 huge.log :: 清空大日志但保留 inode（磁盘马上释放）',
  'split -l 1000 big.log part- :: 拆分大文件',
  'tail -f app.log | grep --line-buffered ERROR :: 管道里别让 grep 缓冲',
  'nc -zv host 443 :: 测端口通不通',
  'dig +short example.com :: 查 A 记录',
  'ip route get 1.1.1.1 :: 看默认路由怎么走',
  'openssl s_client -connect example.com:443 -servername example.com < /dev/null :: 看证书链',
  'gzip -c file | wc -c :: 压缩后的大小',
  'tar -czf backup.tar.gz --exclude=node_modules . :: 打包并排除目录',
  'rsync -aP --delete src/ dst/ :: 增量同步，-P 显示进度',
  'zoxide add ~/projects :: 手动给常用目录加权',
  'fzf --preview "bat --color=always {}" --bind "ctrl-o:execute(vim {})" :: 带预览与编辑的查找',
  'history | grep docker | tail -20 :: 翻历史',
  '!! :: 重复上一条命令',
  'sudo !! :: 以 root 重跑上一条命令',
  'git diff --stat HEAD~5 :: 看最近 5 次提交的改动统计',
  'git log -S "函数名" --oneline :: 搜索代码增删历史（比 grep 强）',
  'git show HEAD:path/to/file :: 直接看某版本的文件内容',
  'git stash push -m "wip" :: 暂存当前改动',
  'git branch --merged main | grep -v main | xargs git branch -d :: 清理已合并分支',
  'procs :: 更好的 ps，彩色且支持过滤',
  'btop :: 图形化资源监控，鼠标点选比 top 舒服',
  'glances -w ::  glances 的 Web 模式，可远程看',
  'ncdu :: 交互式扫磁盘，定位大目录最快',
  'iotop -oP :: 看哪个进程在写盘',
  'pidstat -d 1 :: 每秒看 IO',
  'vmstat 1 :: 每秒看上下文切换、IO 等待',
  'ss -s :: 连接状态统计',
  'ping -c 5 -W 1 1.1.1.1 :: 5 次、单次 1 秒超时',
  'mtr -rw example.com :: 逐跳统计丢包，比 traceroute 直观',
  'httpie http GET example.com :: 比 curl 更易读的 HTTP 客户端',
  'gh pr list --author @me :: GitHub CLI',
  'gh run list --limit 5 :: 看最近的 CI 运行',
]);

const EMOJI_CORPUS = commandRows([
  ':rocket: rocket :: 火箭，表示发布/启动',
  ':fire: fire :: 火，热度高的意思',
  ':sparkles: sparkles :: 闪亮，暗示「刚加的新功能」',
  ':bug: bug :: 缺陷，GitHub issue 标签',
  ':hammer: hammer :: 施工中，wip 状态',
  ':memo: memo :: 备忘录，写文档时用',
  ':books: books :: 文档/手册',
  ':warning: warning :: 警告，破坏性变更要标',
  ':x: x :: 失败',
  ':white_check_mark: white_check_mark :: 通过/完成',
  ':tada: tada :: 发布庆祝',
  ':lock: lock :: 权限与安全',
  ':wrench: wrench :: 工具、配置',
  ':gear: gear :: 设置项',
  ':package: package :: 依赖与版本',
  ':recycle: recycle :: 重构、回收',
  ':twisted_rightwards_arrows: twisted_rightwards_arrows :: 合并/同步',
  ':arrow_right: arrow_right :: 迁移到别处',
  ':arrow_left: arrow_left :: 回滚',
  ':globe_with_meridians: globe_with_meridians :: 国际化/多语言',
  ':heavy_check_mark: heavy_check_mark :: 强强调的完成',
  ':zap: zap :: 高性能、快速',
  ':hourglass: hourglass :: 等待中',
  ':no_entry: no_entry :: 禁止、已废弃',
  ':question: question :: 疑问，需要确认',
  ':eyes: eyes :: 观察/监控',
  ':mag: mag :: 搜索',
  ':floppy_disk: floppy_disk :: 存储',
  ':boom: boom :: 爆炸，故障',
  ':snowflake: snowflake :: 冷启动/冷数据',
  ':sunny: sunny :: 顺利',
  ':pushpin: pushpin :: 重要位置固定',
  ':recycle_bin: trash :: 删除',
  ':seedling: seedling :: 新项目、新功能',
  ':bar_chart: bar_chart :: 指标与看板',
  ':clipboard: clipboard :: 剪贴板/文档',
  ':hammer_and_wrench: construction :: 基础设施变更',
  ':electric_plug: electric_plug :: 接口、集成',
  ':link: link :: 链接与跳转',
  ':hourglass_flowing_sand: hourglass_flowing_sand :: 迁移进行中',
  ':crab: crab :: Rust 官方吉祥物',
  ':elephant: elephant :: PostgreSQL',
  ':dolphin: dolphin :: MySQL',
  ':whale: whale :: Docker',
  ':penguin: penguin :: Linux',
  ':cat: cat :: 命令行/shell',
  ':dog: dog :: 守护进程',
  ':wastebasket: wastebasket :: 清理',
  ':test_tube: test_tube :: 测试',
  ':microscope: microscope :: 调试、观测',
  ':triangular_ruler: triangular_ruler :: 布局与样式',
  ':label: label :: 标签',
  ':bookmark: bookmark :: 收藏',
  ':bell: bell :: 通知',
  ':calendar: calendar :: 计划',
  ':chart_with_upwards_trend: chart_with_upwards_trend :: 增长',
  ':chart_with_downwards_trend: chart_with_downwards_trend :: 下降',
  ':shield: shield :: 安全',
  ':telescope: telescope :: 可观测性',
  ':crystal_ball: crystal_ball :: 预测性维护',
  ':nerd_face: nerd_face :: 面向开发者的表情',
  ':octopus: octopus :: 多容器编排',
  ':whale2: orca :: 容器运行时',
]);

const HTTP_LINES = STATUS_ENTRIES.map((entry) => `${entry.code} ${entry.name} :: ${entry.category}：${entry.summary}`);

const SAMPLE_LOG = `# app.log
2026-01-04T10:00:01.120Z INFO  http server started on :8080
2026-01-04T10:00:03.455Z INFO  db pool size=10 acquired=1
2026-01-04T10:01:11.001Z WARN  slow query took 1820ms sql=SELECT * FROM orders WHERE user_id=?
2026-01-04T10:01:12.556Z INFO  request GET /api/orders status=200 duration=31ms
2026-01-04T10:02:00.900Z ERROR upstream timeout url=https://pay.example.com/v1/charge timeout=3000ms
2026-01-04T10:02:00.901Z ERROR retry attempt=1
2026-01-04T10:02:02.450Z ERROR upstream timeout url=https://pay.example.com/v1/charge timeout=3000ms
2026-01-04T10:02:02.451Z INFO  giving up after 2 retries
# access.log
127.0.0.1 - - [04/Jan/2026:10:02:03 +0800] "GET /api/orders HTTP/1.1" 200 512
10.0.0.9 - - [04/Jan/2026:10:02:04 +0800] "POST /api/charge HTTP/1.1" 502 128
10.0.0.9 - - [04/Jan/2026:10:02:05 +0800] "POST /api/charge HTTP/1.1" 502 128
10.0.0.9 - - [04/Jan/2026:10:02:06 +0800] "POST /api/charge HTTP/1.1" 502 128
# worker.log
2026-01-04T10:03:00.000Z INFO  job=nightly-reconcile state=start
2026-01-04T10:03:12.500Z INFO  job=nightly-reconcile state=done processed=18203 skipped=17
2026-01-04T10:04:00.000Z INFO  job=email-digest state=start
2026-01-04T10:04:02.000Z ERROR smtp connection refused host=smtp.example.com:587
2026-01-04T10:04:02.001Z ERROR job=email-digest state=failed
# debug.log
DEBUG pid=1 loading config from /etc/app/config.yaml
DEBUG pid=1 listening on 0.0.0.0:8080
DEBUG pid=1 connected to postgres://db:5432/app
WARN  pid=1 TLS handshake slow peer=10.0.0.5 took=412ms
ERROR pid=1 unhandled rejection reason="socket hang up" stack=at Pool._acquire
INFO  pid=1 shutting down gracefully
`;

type Dataset = 'paste' | 'commands' | 'http' | 'emoji' | 'all';

const DATASETS: { value: Dataset; label: string; hint: string }[] = [
  { value: 'paste', label: '粘贴文本（每行一个候选）', hint: '适合文件列表、命令历史片段、应用名' },
  { value: 'commands', label: '内置命令行速查', hint: '真实命令 + 说明' },
  { value: 'http', label: '内置 HTTP 状态词', hint: '来自本扩展的 HTTP 状态码数据' },
  { value: 'emoji', label: '内置 emoji 名称', hint: 'shortcode 与含义' },
  { value: 'all', label: '全部内置数据合并', hint: '命令 + HTTP 状态词 + emoji，单次搜索全部条目' },
];

// ── 模糊搜索面板 ──────────────────────────────────────────────────────

function FuzzyPanel() {
  const [dataset, setDataset] = useState<Dataset>('commands');
  const [paste, setPaste] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'any'>('all');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [exclude, setExclude] = useState('');
  const [limit, setLimit] = useState(200);
  const [sortMode, setSortMode] = useState<'none' | 'asc' | 'desc'>('none');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const candidates = useMemo<string[]>(() => {
    const sort = sortMode === 'none' ? undefined : sortMode;
    if (dataset === 'paste') return cleanLines(paste, { unique: true, sort });
    const lines =
      dataset === 'commands'
        ? COMMAND_CORPUS.map((row) => `${row.command}  ${row.description}`)
        : dataset === 'http'
          ? HTTP_LINES
          : dataset === 'all'
            ? [
                ...COMMAND_CORPUS.map((row) => `${row.command}  ${row.description}`),
                ...HTTP_LINES,
                ...EMOJI_CORPUS.map((row) => `${row.command}  ${row.description}`),
              ]
            : EMOJI_CORPUS.map((row) => `${row.command}  ${row.description}`);
    return cleanLines(lines.join('\n'), { unique: true, sort });
  }, [dataset, paste, sortMode]);

  // 查询语法：空格分词；'整词' 与 "整词" 要求子串精确包含；-词 或 !词 排除
  const parsed = useMemo(() => parseQuery(query), [query]);
  const excludePatterns = useMemo(
    () => [...parsed.exclude, ...exclude.split(/\s+/).filter((item) => item !== '')],
    [parsed.exclude, exclude],
  );
  const patterns = parsed.include;
  const exactPatterns = parsed.exact;

  const result = useMemo(() => {
    const start = performance.now();
    // 候选超过 4000 条时启用字符位掩码预剪枝（fzf 同类实现的思路）
    const index = candidates.length >= 4000 ? buildNgrams(candidates) : undefined;
    const base =
      patterns.length === 0
        ? candidates.map((item, position) => ({ item, score: 0, matches: [], index: position }))
        : fuzzyFilterIndexed(patterns, candidates, {
            mode,
            caseSensitive,
            reverse,
            exclude: excludePatterns,
            limit,
            indexThreshold: 4000,
            index,
          });
    // 引号部分必须字面包含，不参与模糊打分
    const hits =
      exactPatterns.length === 0
        ? base
        : base.filter((hit) => {
            const haystack = caseSensitive ? hit.item : hit.item.toLowerCase();
            return exactPatterns.every((word) => haystack.includes(caseSensitive ? word : word.toLowerCase()));
          });
    return { hits, elapsed: performance.now() - start, usedIndex: index !== undefined };
  }, [candidates, patterns, exactPatterns, mode, caseSensitive, reverse, excludePatterns, limit]);

  const toggleRow = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectedText = useMemo(
    () => result.hits.filter((hit) => selected.has(hit.index)).map((hit) => hit.item),
    [result.hits, selected],
  );

  const usedIndex = result.usedIndex;
  const elapsed = result.elapsed;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title="候选来源" description="内置数据集与本地粘贴文本二选一">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="数据集"
            value={dataset}
            onChange={(value) => setDataset(value as Dataset)}
            options={DATASETS}
            hint={DATASETS.find((item) => item.value === dataset)?.hint}
          />
          <Select
            label="文本清洗"
            value={sortMode}
            onChange={(value) => setSortMode(value as 'none' | 'asc' | 'desc')}
            options={[
              { value: 'none', label: '不去重不排序（保持原顺序）' },
              { value: 'asc', label: '去重 + 升序' },
              { value: 'desc', label: '去重 + 倒序' },
            ]}
            hint="清洗后再参与打分，去重永远开启"
          />
        </div>
        {dataset === 'paste' && (
          <Textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={'每行一个候选，例如：\nsrc/tools/terminal.tsx\nsrc/lib/fuzzy.ts\nsrc/tools/wsl.tsx'}
            aria-label="候选文本"
            spellCheck={false}
            className="min-h-40 resize-y font-mono text-xs"
          />
        )}
      </Section>

      <Section title="查询" description="空格分词后按所选模式合并；'整词' 要求字面包含；-词 排除">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="查询词"
            value={query}
            onChange={setQuery}
            placeholder="例如：git log 或 rg 'exact string'"
            hint={`已解析 ${patterns.length} 个模糊词${exactPatterns.length > 0 ? ` + ${exactPatterns.length} 个精确词` : ''}${parsed.exclude.length > 0 ? ` - ${parsed.exclude.length} 个排除词` : ''}`}
          />
          <Select
            label="多词关系"
            value={mode}
            onChange={(value) => setMode(value as 'all' | 'any')}
            options={[
              { value: 'all', label: 'AND（全部命中）' },
              { value: 'any', label: 'OR（任一命中）' },
            ]}
          />
          <TextField
            label="结果条数上限"
            type="number"
            value={String(limit)}
            onChange={(value) => setLimit(Math.max(1, Number(value) || 100))}
          />
        </div>
        <TextField
          label="排除模式（空格分隔）"
          value={exclude}
          onChange={setExclude}
          placeholder="例如：docker git"
          hint={`命中任意一个排除词的候选会被直接剔除${parsed.exclude.length > 0 ? `（查询词里已带 ${parsed.exclude.length} 个）` : ''}`}
        />
        <div className="flex flex-wrap gap-3">
          <Checkbox label="区分大小写" checked={caseSensitive} onChange={setCaseSensitive} />
          <Checkbox label="反向排序（命中位置越靠后越靠前）" checked={reverse} onChange={setReverse} />
        </div>
      </Section>

      <StatGrid>
        <Stat label="候选总数" value={candidates.length} hint="清洗后的行数" />
        <Stat label="命中条数" value={result.hits.length} hint={`上限 ${limit}`} tone="success" />
        <Stat
          label="计算耗时"
          value={`${elapsed.toFixed(2)} ms`}
          hint={usedIndex ? '用了字符位掩码预剪枝' : '线性打分'}
        />
        <Stat label="已勾选" value={selected.size} tone={selected.size > 0 ? 'info' : 'info'} hint="可复制或下载" />
      </StatGrid>

      <Section
        title="结果"
        description="黄色为命中字符，右侧是分数与命中位置"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(result.hits.map((hit) => hit.index)))}>
              全选
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              清空选择
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="复制勾选的结果"
              disabled={selectedText.length === 0}
              onClick={() => copyText(selectedText.join('\n'))}
            >
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="下载勾选的结果"
              disabled={selectedText.length === 0}
              onClick={() => downloadText(exportName('fuzzy-result', 'txt'), selectedText.join('\n'))}
            >
              <Download className="size-3.5" />
              下载
            </Button>
          </>
        }
      >
        {result.hits.length === 0 ? (
          <EmptyHint>没有命中，试试更短的查询词或改成 OR 模式</EmptyHint>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
            {result.hits.map((hit) => {
              const segments =
                patterns.length === 0
                  ? [{ text: hit.item, hit: false }]
                  : greedyHighlight(
                      hit.item,
                      // 逐词取第一个命中词高亮，避免多词 join 造出查询里不存在的组合
                      patterns.find((word) =>
                        (caseSensitive ? hit.item : hit.item.toLowerCase()).includes(
                          caseSensitive ? word : word.toLowerCase(),
                        ),
                      ) ?? patterns[0],
                      { caseSensitive },
                    );
              return (
                <li key={`${hit.index}-${hit.item}`}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1 text-[11px] hover:bg-accent/40">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-3.5 accent-primary"
                      checked={selected.has(hit.index)}
                      onChange={() => toggleRow(hit.index)}
                      aria-label={`选择 ${hit.item}`}
                    />
                    <span className="min-w-0 flex-1 break-all font-mono">{highlightSpans(segments)}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {hit.score} 分 · [{hit.matches.slice(0, 8).join(',')}
                      {hit.matches.length > 8 ? '…' : ''}]
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <Hint>
          打分规则：连续命中加分、词首与 camelCase 边界加分、完全相等额外加权，命中位置越靠后与候选越长都会扣分。
          同分时保持原始顺序，因此结果稳定可复现。
        </Hint>
      </Section>
    </div>
  );
}

// ── 高速文本检索面板 ───────────────────────────────────────────────────

interface GrepHit {
  file: string;
  line: number;
  text: string;
  ranges: [number, number][];
}

interface FileStat {
  file: string;
  hits: number;
}

type GrepMode = 'lines' | 'files' | 'count' | 'filecount';

const GREP_MODES: { value: GrepMode; label: string; equivalent: string }[] = [
  { value: 'lines', label: '命中行（默认）', equivalent: 'grep -n' },
  { value: 'files', label: '仅文件名', equivalent: 'grep -l' },
  { value: 'count', label: '仅命中次数', equivalent: 'grep -c' },
  { value: 'filecount', label: '文件名 + 次数', equivalent: 'grep -cH' },
];

interface GrepOutcome {
  hits: GrepHit[];
  files: FileStat[];
  totalLines: number;
  elapsed: number;
  errors: string[];
  matchCount: number;
}

/** 把 `(?i)abc` 解析成 flags + pattern；`!abc` 视为排除模式。 */
function parsePattern(raw: string): { exclude: boolean; flags: string; body: string } {
  let text = raw.trim();
  const exclude = text.startsWith('!');
  if (exclude) text = text.slice(1).trim();
  let flags = '';
  const flagMatch = /^\(\?([a-z]*)\)/.exec(text);
  if (flagMatch) {
    const parsed = flagMatch[1] ?? '';
    for (const char of parsed) {
      if ((char === 'i' || char === 'm' || char === 's' || char === 'u') && !flags.includes(char)) flags += char;
    }
    text = text.slice(flagMatch[0].length);
  }
  return { exclude, flags, body: text };
}

function runGrep(text: string, rawPatterns: string[], context: number, mode: GrepMode): GrepOutcome {
  const start = performance.now();
  const errors: string[] = [];
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  for (const raw of rawPatterns) {
    if (raw.trim() === '') continue;
    const parsed = parsePattern(raw);
    if (parsed.body === '') continue;
    try {
      const regex = new RegExp(parsed.body, parsed.flags.includes('g') ? parsed.flags : `${parsed.flags}g`);
      (parsed.exclude ? exclude : include).push(regex);
    } catch (error) {
      errors.push(`${raw} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const hits: GrepHit[] = [];
  const files: FileStat[] = [];
  const contextStore = new Map<string, string[]>();
  let totalLines = 0;
  let matchCount = 0;
  let file = '(粘贴文本)';
  let fileHitCount = 0;

  const pushHit = (lineNumber: number, line: string, ranges: [number, number][]) => {
    matchCount += 1;
    fileHitCount += 1;
    if (mode === 'lines' || mode === 'filecount') hits.push({ file, line: lineNumber, text: line, ranges });
    if (context > 0 && !contextStore.has(file)) {
      const all = text.split('\n');
      contextStore.set(file, all);
    }
  };

  const lines = text.split('\n');
  const flushFile = () => {
    if (fileHitCount > 0) files.push({ file, hits: fileHitCount });
    fileHitCount = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    totalLines += 1;
    if (raw.startsWith('# ') && /^#\s+\S/.test(raw) && !isRegexLine(raw)) {
      flushFile();
      file = raw.replace(/^#\s+/, '').trim();
      continue;
    }
    if (raw.startsWith('#') && !isRegexLine(raw)) continue;

    const isExcluded = exclude.some((regex) => {
      regex.lastIndex = 0;
      return regex.test(raw);
    });
    if (isExcluded) continue;

    const ranges: [number, number][] = [];
    let matched = false;
    for (const regex of include) {
      regex.lastIndex = 0;
      let found = regex.exec(raw);
      while (found !== null) {
        matched = true;
        if (found[0].length > 0) ranges.push([found.index, found.index + found[0].length]);
        else regex.lastIndex += 1;
        found = regex.exec(raw);
      }
    }
    if (matched) pushHit(i + 1, raw, ranges);
  }
  flushFile();

  return {
    hits,
    files,
    totalLines,
    elapsed: performance.now() - start,
    errors,
    matchCount,
  };
}

/** 注释行判定：以 # 开头但不以 #? / #{ 之类开头的都当作分区标记。 */
function isRegexLine(line: string): boolean {
  return /^#(\?|\{|\/)/.test(line);
}

function GrepPanel() {
  const [text, setText] = useState(SAMPLE_LOG);
  const [patterns, setPatterns] = useState('(?i)error|timeout');
  const [context, setContext] = useState(2);
  const [mode, setMode] = useState<GrepMode>('lines');
  const [showContext, setShowContext] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 大文本时用 useDeferredValue 让输入保持响应
  const deferredText = useDeferredValue(text);
  const deferredPatterns = useDeferredValue(patterns);

  const rawPatterns = useMemo(() => deferredPatterns.split('\n'), [deferredPatterns]);

  const outcome = useMemo(
    () => runGrep(deferredText, rawPatterns, context, mode),
    [deferredText, rawPatterns, context, mode],
  );

  const contextLines = useMemo(() => deferredText.split('\n'), [deferredText]);

  const exportText = useMemo(() => {
    if (mode === 'files') return outcome.files.map((item) => item.file).join('\n');
    if (mode === 'count') return String(outcome.matchCount);
    if (mode === 'filecount') return outcome.files.map((item) => `${item.file}:${item.hits}`).join('\n');
    return outcome.hits.map((hit) => `${hit.file}:${hit.line}:${hit.text}`).join('\n');
  }, [mode, outcome]);

  const toggleContext = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title="输入" description="用 `# 文件名` 开头的行分隔「文件」，可以模拟多文件检索">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="正则模式（每行一个）"
            value={patterns}
            onChange={setPatterns}
            placeholder="(?i)error"
            hint="支持 (?i) (?m) (?s) 修饰符；以 ! 开头表示排除"
          />
          <Select
            label="输出模式"
            value={mode}
            onChange={(value) => setMode(value as GrepMode)}
            options={GREP_MODES.map((item) => ({ value: item.value, label: item.label }))}
            hint={GREP_MODES.find((item) => item.value === mode)?.equivalent}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <TextField
            label="上下文行数"
            type="number"
            value={String(context)}
            onChange={(value) => setContext(Math.max(0, Math.min(10, Number(value) || 0)))}
            className="w-32"
          />
          <Checkbox label="展开上下文" checked={showContext} onChange={setShowContext} />
        </div>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="粘贴日志或文本"
          aria-label="待检索文本"
          spellCheck={false}
          className="min-h-48 resize-y font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE_LOG)}>
            载入示例日志
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setText('')} disabled={text === ''}>
            清空
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="生成 10 万行压测文本"
            onClick={() => {
              const base = SAMPLE_LOG.split('\n');
              const out: string[] = [];
              for (let i = 0; i < 100000; i += 1) out.push(base[i % base.length] ?? '');
              setText(out.join('\n'));
            }}
          >
            生成 10 万行压测文本
          </Button>
        </div>
      </Section>

      {outcome.errors.length > 0 && (
        <Note tone="danger" title="正则有误">
          {outcome.errors.map((item) => (
            <p key={item} className="font-mono">
              {item}
            </p>
          ))}
        </Note>
      )}

      <StatGrid>
        <Stat label="扫描行数" value={outcome.totalLines.toLocaleString('zh-CN')} />
        <Stat label="命中次数" value={outcome.matchCount.toLocaleString('zh-CN')} tone="success" />
        <Stat label="涉及文件" value={outcome.files.length} hint="用 # 文件名 分隔" />
        <Stat
          label="耗时"
          value={`${outcome.elapsed.toFixed(1)} ms`}
          hint={`${rawPatterns.length} 个模式`}
          tone={outcome.elapsed > 200 ? 'warn' : 'info'}
        />
      </StatGrid>

      <Section
        title="命中结果"
        description="黄色为命中片段；点击行可展开上下文"
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label="复制命中结果"
              disabled={exportText === ''}
              onClick={() => copyText(exportText)}
            >
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="下载命中结果"
              disabled={exportText === ''}
              onClick={() => downloadText(exportName('grep-result', 'txt'), exportText)}
            >
              <Download className="size-3.5" />
              下载
            </Button>
          </>
        }
      >
        {mode !== 'lines' ? (
          outcome.files.length === 0 ? (
            <EmptyHint>没有命中</EmptyHint>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
              {outcome.files.map((item) => (
                <li
                  key={item.file}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[11px]"
                >
                  <span className="min-w-0 flex-1 break-all">{item.file}</span>
                  <span className="text-muted-foreground">{mode === 'count' ? outcome.matchCount : item.hits} 次</span>
                </li>
              ))}
            </ul>
          )
        ) : outcome.hits.length === 0 ? (
          <EmptyHint>没有命中，试试 (?i)error 这样的写法</EmptyHint>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
            {outcome.hits.slice(0, 1000).map((hit, index) => {
              const open = expanded.has(index) && showContext && context > 0;
              const from = Math.max(0, hit.line - 1 - context);
              const to = Math.min(contextLines.length - 1, hit.line - 1 + context);
              return (
                <li key={`${hit.file}-${hit.line}`} className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => toggleContext(index)}
                    aria-label={`${hit.file} 第 ${hit.line} 行，点击${open ? '收起' : '展开'}上下文`}
                    className="flex w-full items-start gap-2 px-2 py-1 text-left font-mono text-[11px] hover:bg-accent/40"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {hit.file}:{hit.line}
                    </span>
                    <span className="min-w-0 flex-1 break-all">{highlightLine(hit.text, hit.ranges)}</span>
                  </button>
                  {open && (
                    <div className="border-t bg-muted/20 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {contextLines.slice(from, to + 1).map((line, offset) => {
                        const lineNumber = from + offset + 1;
                        return (
                          <p key={lineNumber} className={lineNumber === hit.line ? 'text-foreground' : ''}>
                            {lineNumber}: {line || ' '}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {outcome.hits.length > 1000 && mode === 'lines' && <Hint>界面只渲染前 1000 条，导出会包含全部命中。</Hint>}
      </Section>
    </div>
  );
}

/** 把高亮分片渲染成 span；用累计偏移做 key，避免使用数组下标。 */
function highlightSpans(segments: HighlightSegment[]): React.ReactNode {
  let offset = 0;
  return segments.map((segment) => {
    const key = `${offset}-${segment.text.length}`;
    offset += segment.text.length;
    return (
      <span key={key} className={segment.hit ? 'rounded bg-amber-400/40 font-semibold text-foreground' : ''}>
        {segment.text}
      </span>
    );
  });
}

function highlightLine(line: string, ranges: [number, number][]) {
  if (ranges.length === 0) return line || ' ';
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) nodes.push(line.slice(cursor, start));
    nodes.push(
      <mark key={`${start}-${end}`} className="rounded bg-amber-400/40 text-foreground">
        {line.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < line.length) nodes.push(line.slice(cursor));
  return nodes;
}

// ── 效率技巧 ──────────────────────────────────────────────────────────

interface TipRow {
  command: string;
  description: string;
  alternative: string;
}

function tipRows(lines: string[]): TipRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return { command: parts[0] ?? '', description: parts[1] ?? '', alternative: parts[2] ?? '' };
  });
}

const TIPS = tipRows([
  'cmd > out.txt :: 标准输出重定向到文件，覆盖写 :: > 是覆盖，>> 是追加，2>file 单独收错误',
  'cmd 2>&1 :: 把标准错误也重定向到标准输出（顺序很关键）:: 2>&1 放在 > file 之后才生效，写在前面无效',
  'cmd > /dev/null 2>&1 :: 彻底静音输出 :: 想留错误日志就只重定向 stdout',
  'cmd & :: 放到后台跑，终端立刻返回 :: 关掉终端进程就没了，用 nohup 或 tmux 才安全',
  'Ctrl-C :: 向前台进程发 SIGINT，通常让它自己清理退出 :: 顽固进程用 Ctrl-\\ 发 SIGQUIT，kill -9 是最后手段',
  'kill -TERM $(pgrep -f worker) :: 优雅结束一批进程，给它时间保存数据 :: 先 TERM 再 KILL，顺序反了可能丢数据',
  'disown %1 :: 把后台作业从 shell 的作业表里摘出去 :: 关闭终端后仍继续，配合 nohup 使用',
  'jobs -l :: 查看当前 shell 的后台作业与 PID :: fg/bg 前后台切换',
  'nohup cmd > out.log 2>&1 & :: 脱离终端运行并写日志 :: 长任务建议再套一层 tmux，能随时回来看',
  'xargs -P4 -n1 cmd < list.txt :: 4 并发地跑，替代手工 for 循环后台化 :: -P 等于 CPU 核数附近比较合适',
  'parallel -j4 "cmd {}" ::: list.txt :: GNU parallel，语法更清晰、有进度条与分块输出 :: 需额外安装，很多发行版未预装',
  'xargs -0 :: 用 NUL 分隔，正确处理带空格的文件名 :: -0 必须和 find -print0 配对使用',
  'xargs -I{} cmd {} :: 逐行作为参数插入命令 :: 行内容含引号时会有注入风险，敏感场景别用',
  'rg -n "x" -g "!node_modules" -g "!dist" :: ripgrep 搜内容，默认自动跳过 .gitignore :: 比 grep -r 快一个数量级',
  'fd -e ts :: fd 找文件，正则默认、无需转义 :: 比 find 简洁，语义更像「我要什么」',
  'jq -r ".a[] | .name" :: JSON 处理用 jq，别用正则 :: 解析失败会直接报错，比脆弱的正则可靠',
  'yq -o=json "." k8s.yaml :: YAML 转 JSON 再交给 jq :: 避免装 yq 的 jq 插件',
  'bat -l ts file.ts :: 带高亮与行号看文件，可 --diff 跟 git diff 一起用 :: 纯读文件时 bat 明显更舒服',
  'duf -h :: 可视化 du，条形图更直观 :: 老实用 du -sh * | sort -h',
  'dust -d 1 :: 并行扫目录，默认读 .gitignore，跳过依赖目录 :: 仓库里比 du 快得多',
  'procs --sort cpu :: 彩色且可按列排序的 ps :: 交互式直接按方向键排序列',
  'tokei . :: 统计代码行数与语言占比，比 cloc 快很多 :: cloc 结果更细但很慢',
  'hyperfine "cmd1" "cmd2" --runs 20 :: 自动多次运行取统计量与标准差，结果可信度远高于手动 time :: 别用 time 跑一次的数字做结论',
  'awk "{s+=\\$1} END {print s}" :: 一行流式求和，比多次 awk 快很多 :: 复杂字段处理才值得上 python',
  'awk -F: "{print \\$1}" /etc/passwd :: 按分隔符切列，$0 是整行 :: -v 可以把 shell 变量传进 awk',
  'sed "s/a/b/g" :: 简单正则替换够了 :: 复杂改写用 perl -pe 或直接写代码',
  'sed -i.bak :: 原地修改并留备份，比裸 -i 安全 :: GNU sed 与 BSD sed 的 -i 语法不同，BSD 后面要跟空串',
  'cut -d, -f1,3 :: 取列比 awk 简单，也比 awk 快 :: 复杂逻辑还是 awk',
  'sort | uniq -c | sort -rn :: 计数并按频次倒序，是日志分析的标准三连 :: 只去重不计数用 sort -u',
  'grep --line-buffered :: 管道里别让 grep 缓冲，否则实时日志看不到输出 :: 配合 tail -f 必备',
  'find . -type f -name "*.log" -print0 | xargs -0 grep -l err :: 两步组合比 find -exec 更快、更易加条件 :: 也可用 rg -l 直接搞定',
  'find . -type f -newermt "2026-01-01" :: 按修改时间筛文件 :: -newermt 比 -mtime +N 直观得多',
  'locate vs updatedb :: locate 查全盘毫秒级，但索引可能过期 :: 手工触发 updatedb 后再查',
  'fd -0 | xargs -0 -P4 rg :: 全流程用 NUL 分隔，文件名带空格也不炸 :: 组合拳记住这一条就够用',
  'git log -S "字符串" -p :: 搜索代码的增删历史，能定位「什么时候引入的」:: git grep 只能看当前内容',
  'git worktree add ../a feature :: 同一仓库并行开多个工作目录，省内存 :: 比 clone 一次快得多，共享对象库',
  'git sparse-checkout set src :: 只检出部分目录，巨型仓库 clone 提速明显 :: 配合 --filter=blob:none 效果更好',
  'git clone --depth=1 --filter=blob:none :: CI 里浅克隆 + 过滤 blob，快很多 :: 代价是不能 fetch 完整历史',
  'git config --global core.fsmonitor true :: macOS 上用 FSEvents 事件监听，大仓库 status 变快 :: Linux 上不适用',
  'git maintenance run --task=commit-graph :: 生成 commit-graph，git log 与 blame 变快 :: 配合 maintenance.auto 定期自动跑',
  'nohup rg --stats "TODO" . > report.txt :: 长扫描放后台并留统计，省得干等 :: rg 加 --stats 会列出搜索的文件数与耗时',
  'cmake -j$(nproc) :: 用满 CPU 核并行编译 :: 所有支持并行的构建系统都值得加 -j',
  'make -j8 && make test :: 编译与测试串在一个命令里，CI 常用 :: 记得 make -j 的输出顺序不可复现',
  'htop 按 F5 树状显示 :: htop 的树视图能看清父子进程关系 :: ps --forest 也能，但 htop 交互更舒服',
  'ss -tulnp | grep :8080 :: 查端口占用，ss 比 netstat 现代、输出更清楚 :: 老系统上 netstat -tulnp 也行',
  'lsof -p PID -a -d cwd :: 精确定位进程的当前目录 :: 排查「文件被谁占用」最快',
  'journalctl -f -u docker :: 跟某个服务的日志，比 tail 更结构化 :: -o json 输出可直接交给 jq',
  'strace -f -p PID :: 跟踪系统调用，排查「卡住了」最有效 :: 影响性能，生产慎用；strace -c 统计耗时分布',
  'perf stat cmd :: 统计缓存命中、分支预测等硬件事件 :: 采样型 profiler 先给出热点分布',
  'echo $? :: 上一条命令的退出码 :: 中间插了任何命令就会变，注意时机',
  'time -v cmd :: 显示最大内存、页错误等完整资源占用（GNU coreutils）:: macOS 上用 /usr/bin/time -l',
  'nice -n 19 cmd :: 降低优先级，让重要任务先跑完 :: ionice 可以同时调 IO 优先级',
  'ionice -c3 cmd :: IO 空闲时才跑，适合大文件扫描 :: 与 nice 一起用效果最好',
]);

// ── 会话与资源监控 ────────────────────────────────────────────────────

interface MonitorRow {
  command: string;
  description: string;
  note: string;
}

function monitorRows(lines: string[]): MonitorRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return { command: parts[0] ?? '', description: parts[1] ?? '', note: parts[2] ?? '' };
  });
}

const MONITOR_COMMANDS = monitorRows([
  'top :: 传统实时视图，按 1 看每核、P 排 CPU、M 排内存 :: 数字含义要靠 %Cpu(s) 里的 us/sy/id/wa 区分',
  'htop :: 彩色 + 树形进程 + 筛选，比 top 好用 :: F5 树视图、F9 发送信号、h 关闭线程',
  'btop :: 图形化资源监控，鼠标点选直观 :: 需要较新的内核与 GPU 环境',
  'glances :: 跨平台、可导出数据到脚本 :: glances -w 还能当 Web 面板',
  'free -h :: 内存与 swap 使用量 :: available 那一列比 free 更有意义',
  'vmstat 1 :: 每秒输出：r 队列、b 阻塞、wa IO 等待、si/so swap :: wa 高说明瓶颈在磁盘',
  'iostat -x 1 :: 每块设备的 %util、await、读写吞吐 :: await 高是延迟问题，%util 100% 是饱和问题',
  'mpstat -P ALL 1 :: 每颗 CPU 的使用率，能发现单核打满 :: -P ALL 必须显式指定才会分核',
  'pidstat -d 1 :: 按进程看 IO 与内存 :: -d 1 5 表示每 1 秒输出 5 次',
  'sar -u 1 :: 历史与实时的系统级统计，很多开关 :: 需 sysstat 包，服务端排查常用',
  'ss -s :: TCP 连接状态统计（比 netstat -s 简洁）:: 看大量 TIME_WAIT 要调 tcp_tw_reuse',
  'ss -tulnp :: 监听端口与占用进程 :: -p 需要 root 才看得到完整信息',
  'lsof -i :8080 :: 谁占着 8080 :: 容器里没有 ss 时退路',
  'nmap -sV -p 1-1024 host :: 端口与版本探测，仅对自己的资产扫描 :: 扫描他人资产可能违法',
  'nmap -sS :: SYN 扫描，不建立完整连接，更隐蔽 :: 需要 root',
  'docker stats --no-stream :: 一次性看所有容器资源占用 :: --format "{{.Name}} {{.MemPerc}}" 可脚本化',
  'docker system df -v :: 镜像/容器/卷/构建缓存的占用明细 :: -v 才看得到具体镜像大小',
  'dive <image> :: 逐层看镜像内容，找出哪层把体积撑大 :: CI 里配成必跑项能防体积回归',
  'docker system df -v && docker builder prune :: 清理构建缓存，CI 磁盘不够时最有效 :: 卷不要随便 prune',
  'journalctl --disk-usage :: 看 systemd 日志占了多少磁盘 :: -u 只看某服务，配置项 SystemMaxUse',
]);

interface MetricSeries {
  id: string;
  label: string;
  unit: string;
  warn: number;
  critical: number;
  describe: string;
  base: number;
  seed: number;
}

const METRICS: MetricSeries[] = [
  {
    id: 'cpu',
    label: 'CPU 使用率',
    unit: '%',
    warn: 70,
    critical: 90,
    base: 42,
    seed: 1.1,
    describe: 'us 用户态 + sy 内核态；wa 是 IO 等待，wa 高说明 CPU 在等磁盘',
  },
  {
    id: 'mem',
    label: '内存使用率',
    unit: '%',
    warn: 75,
    critical: 90,
    base: 58,
    seed: 2.7,
    describe: '看 available 而不是 free；容器里还要留意 cgroup 限制与 OOMKilled',
  },
  {
    id: 'net',
    label: '网络吞吐',
    unit: 'MB/s',
    warn: 60,
    critical: 85,
    base: 22,
    seed: 4.3,
    describe: '入向+出向，突增往往对应批量任务或异常重试',
  },
  {
    id: 'disk',
    label: '磁盘利用率',
    unit: '%',
    warn: 75,
    critical: 92,
    base: 61,
    seed: 0.6,
    describe: '%util 接近 100% 表示设备饱和，await 升高说明请求在排队',
  },
];

/** 折线图：固定种子生成的示意数据，不代表任何真实环境。 */
function Sparkline({ metric, points }: { metric: MetricSeries; points: number[] }) {
  const width = 520;
  const height = 120;
  const max = 100;
  const step = width / Math.max(1, points.length - 1);
  const path = points
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${(height - (value / max) * height).toFixed(1)}`,
    )
    .join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  const warnY = height - (metric.warn / max) * height;
  const criticalY = height - (metric.critical / max) * height;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full"
      role="img"
      aria-label={`${metric.label} 示意折线图`}
    >
      <defs>
        <linearGradient id={`grad-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect x="0" y={warnY} width={width} height={height - warnY} className="fill-amber-400/10" />
      <rect x="0" y={criticalY} width={width} height={warnY - criticalY} className="fill-destructive/10" />
      <line x1="0" y1={criticalY} x2={width} y2={criticalY} className="stroke-destructive/50" strokeDasharray="4 3" />
      <line x1="0" y1={warnY} x2={width} y2={warnY} className="stroke-amber-500/50" strokeDasharray="4 3" />
      <path d={area} fill={`url(#grad-${metric.id})`} className="text-sky-500" />
      <path d={path} fill="none" className="stroke-sky-500" strokeWidth="1.5" />
    </svg>
  );
}

function MonitorPanel() {
  const [metricId, setMetricId] = useState('cpu');
  const metric = METRICS.find((item) => item.id === metricId) ?? METRICS[0];

  const points = useMemo(() => {
    const out: number[] = [];
    let value = metric.base;
    for (let i = 0; i < 90; i += 1) {
      const wave = Math.sin(i / 7 + metric.seed) * 8 + Math.sin(i / 2.3 + metric.seed * 2) * 4;
      const noise = ((Math.sin(i * 12.9898 + metric.seed * 78.233) * 43758.5453) % 1) * 6 - 3;
      // 制造一段明显的尖峰，方便演示告警配色
      const spike = i > 58 && i < 64 ? 22 - Math.abs(i - 61) * 4 : 0;
      value = Math.min(99, Math.max(3, metric.base + wave + noise + spike));
      out.push(value);
    }
    return out;
  }, [metric]);

  const peak = Math.max(...points);
  const avg = points.reduce((sum, value) => sum + value, 0) / points.length;
  const breach = points.filter((value) => value >= metric.critical).length;
  const load = [
    { label: '1 分钟', value: 1.82, hint: '最近一分钟的平均可运行任务数' },
    { label: '5 分钟', value: 1.34, hint: '平滑过的短中期值' },
    { label: '15 分钟', value: 0.97, hint: '长周期基线，用来判断是尖峰还是趋势' },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Note tone="warn" title="只做说明，不执行任何命令">
        浏览器里拿不到本机的 CPU/内存/网络数据，<b>这里不会连接你的系统</b>。 下面的曲线是<b>固定的示意数据</b>
        ，只用来解释「监控面板上那些数字与颜色分别代表什么」。 真实数据请在本机跑上面的命令，或接入 Prometheus/Grafana。
      </Note>

      <Section
        title="监控面板长什么样（示意）"
        description="选择指标查看阈值配色含义"
        actions={
          <Select
            ariaLabel="选择示意指标"
            value={metricId}
            onChange={setMetricId}
            className="w-40"
            options={METRICS.map((item) => ({ value: item.id, label: item.label }))}
          />
        }
      >
        <div className="text-sky-500">
          <Sparkline metric={metric} points={points} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-sky-500/70" />
            正常区间
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-amber-400/40" />
            超过 {metric.warn}
            {metric.unit} 预警
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-destructive/40" />
            超过 {metric.critical}
            {metric.unit} 严重
          </span>
          <span>时间轴：最近 90 个采样点（示意）</span>
        </div>
        <StatGrid>
          <Stat
            label="当前值"
            value={`${points[points.length - 1]?.toFixed(1) ?? '0'}${metric.unit}`}
            tone="info"
            hint="最后一个采样点"
          />
          <Stat
            label="区间峰值"
            value={`${peak.toFixed(1)}${metric.unit}`}
            tone={peak >= metric.critical ? 'danger' : 'success'}
          />
          <Stat label="区间均值" value={`${avg.toFixed(1)}${metric.unit}`} hint="只看均值会漏掉尖峰" />
          <Stat label="越线采样点" value={`${breach} / ${points.length}`} tone={breach > 0 ? 'warn' : 'success'} />
        </StatGrid>
        <Hint>{metric.describe}</Hint>
      </Section>

      <Section
        title="Linux load average 怎么读"
        description="三个数字分别是 1/5/15 分钟的平均可运行任务数（含不可中断睡眠）"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 pr-2 font-medium">窗口</th>
                <th className="py-1.5 pr-2 font-medium">示意值</th>
                <th className="py-1.5 pr-2 font-medium">含义</th>
              </tr>
            </thead>
            <tbody>
              {load.map((item) => (
                <tr key={item.label} className="border-b last:border-b-0 align-top">
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{item.label}</td>
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{item.value.toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{item.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint>
          经验法则：load 大于 CPU 核数说明任务在排队。1 分钟远高于 15
          分钟是刚出现的尖峰；三个值缓慢一起上涨才是真的负载问题。 容器里看到 load
          异常高，往往是宿主机整体状态，而不是这个容器自己的问题。
        </Hint>
      </Section>

      <Section title="Top 进程列表示意" description="不同工具的列不一样，但核心信息一致">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 pr-2 font-medium">列</th>
                <th className="py-1.5 pr-2 font-medium">top</th>
                <th className="py-1.5 pr-2 font-medium">htop / btop</th>
                <th className="py-1.5 pr-2 font-medium">怎么用</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['CPU%', '%CPU', 'CPU%', '单进程超过 100% 意味着多线程，超出核数就是抢核'],
                ['内存', '%MEM', 'RES', 'RES 高但没到上限说明还有余量，cache 计入不等于真用'],
                ['虚拟内存', 'VIRT', 'VIRT', '虚拟地址空间，通常远大于实际占用，不必紧张'],
                ['状态', 'STAT', 'S/D/R', 'D 状态（不可中断 IO）是磁盘问题的典型信号'],
                ['优先级', 'PR / NI', 'PR', 'NI 值越大优先级越低，正数常被误解为「更高」'],
                ['线程', 'Threads', 'Threads', '线程数暴涨通常伴随上下文切换风暴'],
                ['运行时长', 'TIME', 'TIME', 'CPU 时间不是墙钟时间，多线程会累加超过运行时长'],
              ].map((row) => (
                <tr key={row[0]} className="border-b last:border-b-0 align-top">
                  <td className="py-1.5 pr-2 font-medium">{row[0]}</td>
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row[1]}</td>
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row[2]}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="监控命令速查" description="都需要在本机或跳板机上执行">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b">
                <th className="py-1.5 pr-2 font-medium">命令</th>
                <th className="py-1.5 pr-2 font-medium">用途</th>
                <th className="py-1.5 pr-2 font-medium">要点</th>
              </tr>
            </thead>
            <tbody>
              {MONITOR_COMMANDS.map((row) => (
                <tr key={row.command} className="border-b last:border-b-0 align-top">
                  <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{row.command}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{row.description}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ── 模糊查找速查 ──────────────────────────────────────────────────────

interface FzfRow {
  keys: string;
  action: string;
  fzf: string;
  skim: string;
  note: string;
}

function fzfRows(lines: string[]): FzfRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return {
      keys: parts[0] ?? '',
      action: parts[1] ?? '',
      fzf: parts[2] ?? '',
      skim: parts[3] ?? '',
      note: parts[4] ?? '',
    };
  });
}

const FZF_KEYS = fzfRows([
  'Ctrl-T :: 找文件并执行（需 shell 集成）:: shell 集成默认绑定 :: 同样支持 :: 靠 FZF_DEFAULT_COMMAND 决定搜什么',
  'Ctrl-R :: 模糊搜历史并执行 :: shell 集成默认绑定 :: 同样支持 :: 可用 FZF_CTRL_R_OPTS 加预览',
  'Alt-C :: 切换到 fzf 界面浏览当前目录 :: 无需 shell 集成 :: 无需集成 :: 在任何 shell 里都能用',
  'Ctrl-S :: 预览开关 :: 默认已开，按键可关闭 :: 类似 :: 想边看边选时用',
  'Tab / Shift-Tab :: 多选标记 :: 空格标记、Tab 接受 :: 空格标记、Tab 接受 :: 结果按标记顺序返回',
  '↑ / ↓ :: 移动光标（vim 模式可用 j/k）:: --bind "up:previous-item" 可用 j/k :: 默认支持 j/k :: 布局切换后依然可用',
  'Alt-S :: 在默认布局与全屏预览之间切换 :: --bind "alt-s:toggle-preview" 可启用 :: 支持 :: 预览窗口很大时用它',
  'Ctrl-S :: 横向切换布局（reverse / 上下）:: --layout=reverse 是默认 :: --layout 同样支持 :: 加 --layout=reverse 头朝下',
  'Ctrl-R / Ctrl-F :: 在预览里翻页 :: 内置 :: 内置 :: 预览内容多时常用',
  'Enter :: 接受当前项 :: 内置 :: 内置 :: 多选时返回所有标记项（换行分隔）',
  'Esc / Ctrl-C :: 取消 :: 内置 :: 内置 :: 退出码 130 与 1 不同，脚本里可区分',
  '** 前缀 :: 切换到递归模式，搜目录内所有文件 :: fzf 特有语法 :: skim 不支持该语法 :: 老版本 fzf 才有，新版用 --recursive',
  '** 后缀与过滤 :: 组合语法：fzf --extended ** *.ts :: --extended 开启 ** 语法 :: --extended 需显式开启 :: 输入行内组合条件',
  '--multi :: 允许多选 :: 可加 --bind 也可以 :: 支持 :: 配合 TAB 标记',
  '--preview CMD :: 预览命令，{ } 代表当前项 :: 内置 :: 内置 :: {q} 传查询词，{} 当前项，{+} 全部标记项',
  '--preview-window=right:60%:wrap :: 控制预览窗口位置与换行 :: 内置 :: 内置 :: 常用 right / down:N / hidden',
  '--bind "ctrl-o:execute(CMD)" :: 绑快捷键执行外部命令 :: 内置 :: 内置 :: 典型用法：ctrl-o 用编辑器打开',
  '--bind "ctrl-y:execute-silent(CMD)+abort" :: 执行后直接退出 :: 内置 :: 内置 :: 配合 accept 写配置常用',
  '--header / --header-first / --header-last :: 定制顶部/底部提示行 :: 内置 :: 内置 :: 放快捷键提示非常实用',
  '--prompt "搜索> " :: 自定义提示符 :: 内置 :: 内置 :: 中文界面里特别有用',
  '--height 40% --layout=reverse --border=rounded --info=inline :: 常用外观组合 :: 内置 :: 内置 :: 抄这一行就够用',
  '--pointer "▶" --marker "✓" :: 自定义指针与选中标记 :: 内置 :: 内置 :: 等宽字体下别用 emoji',
  '--exact / --algo=fuzzy :: 精确匹配 / 指定算法 :: 内置 :: 内置 :: fuzzy 默认对顺序宽容',
  '--nth=2.. :: 只用第 2 列之后匹配 :: 内置 :: 内置 :: 处理「名字 路径」这类两列数据',
  '--with-nth=1..,2/.. :: 同时改显示与匹配范围 :: 内置 :: 内置 :: 隐藏 id 列时很实用',
  '--history=FILE --history-size=100 :: 记录选择历史并预热排名 :: 内置 :: 支持 --history :: 与 zsh 历史配合效果好',
  '--no-sort --tac :: 关闭排序 / 反转结果顺序 :: 内置 :: 内置 :: --no-sort 保持管道原始顺序',
  '-0 :: 用 NUL 分隔输入，可配合 fd -0 :: 内置 :: 内置 :: 处理带空格文件名必备',
  '--jump-labels=abc :: 跳到对应首字母的分组 :: 内置 :: 支持 :: 结果很多时定位快',
  '--listen :: 启动服务模式，被 Ctrl-T 调用 :: 内置 :: 不支持 :: 启动快一点的做法之一',
]);

const FZF_LINKS: LinkItem[] = [
  {
    name: 'fzf',
    url: 'https://github.com/junegunn/fzf',
    description: 'README 里的 --bind 与 --preview 说明是最佳参考',
    tags: ['模糊查找'],
  },
  {
    name: 'skim',
    url: 'https://github.com/skim-search/skim',
    description: 'Rust 版 fzf，键位基本兼容',
    tags: ['模糊查找'],
  },
  {
    name: 'ripgrep',
    url: 'https://github.com/BurntSushi/ripgrep',
    description: 'rg 的指南里有「与 fzf 组合」的章节',
    tags: ['搜索'],
  },
  {
    name: 'fd',
    url: 'https://github.com/sharkdp/fd',
    description: 'find 的现代替代，输出可直接喂给 fzf',
    tags: ['文件'],
  },
  {
    name: 'bat',
    url: 'https://github.com/sharkdp/bat',
    description: '带高亮的 cat，常作为 fzf 预览命令',
    tags: ['查看'],
  },
  {
    name: 'jq',
    url: 'https://jqlang.github.io/jq/',
    description: 'JSON 处理的瑞士军刀，--stream 适合大文件',
    tags: ['JSON'],
  },
  { name: 'yq', url: 'https://mikefarah.gitbook.io/yq/', description: 'YAML/JSON/XML 互转与查询', tags: ['YAML'] },
  {
    name: 'zoxide',
    url: 'https://github.com/ajeetdsouza/zoxide',
    description: '目录跳转，和 fzf 补全配合最好',
    tags: ['导航'],
  },
  { name: 'atuin', url: 'https://docs.atuin.sh/', description: '带 UI 的历史搜索，Ctrl-R 可绑定', tags: ['历史'] },
  { name: 'btop', url: 'https://github.com/aristocratos/btop', description: '图形化资源监控', tags: ['监控'] },
  {
    name: 'hyperfine',
    url: 'https://github.com/sharkdp/hyperfine',
    description: '命令行基准测试，自动统计与对比',
    tags: ['性能'],
  },
  {
    name: 'tokei',
    url: 'https://github.com/XAMPPRocky/tokei',
    description: '快速统计代码行数与语言占比',
    tags: ['统计'],
  },
];

export default function CliEfficiency() {
  const [tab, setTab] = useState<Tab>('fuzzy');

  return (
    <ToolPanel
      title="命令行效率工具"
      description={`本地模糊搜索（内置 ${COMMAND_CORPUS.length + HTTP_LINES.length + EMOJI_CORPUS.length} 条候选）、浏览器内高速文本检索、提速技巧与监控概念演示`}
      actions={
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="size-3.5" />
          全部计算在本地完成
        </span>
      }
    >
      <Note tone="info" title="真的能跑的部分">
        模糊搜索与文本检索是<b>纯本地</b>的：fzf 风格打分、子串预筛、正则扫描都在这个页面里完成，不发任何网络请求。
        命中率、耗时、导出结果都是真实计算结果。跨设备、跨会话的持久化请交给 Atuin 或 shell 自己的历史。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'fuzzy' && <Search className="size-3.5" />}
                {item.value === 'grep' && <FileSearch className="size-3.5" />}
                {item.value === 'tips' && <Zap className="size-3.5" />}
                {item.value === 'monitor' && <Gauge className="size-3.5" />}
                {item.value === 'cheatsheet' && <ListFilter className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'fuzzy' && <FuzzyPanel />}
      {tab === 'grep' && <GrepPanel />}
      {tab === 'tips' && (
        <Section title={`提速技巧（共 ${TIPS.length} 条）`} description="命令 · 说明 · 值得注意的点或替代方案">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-medium">命令 / 技巧</th>
                  <th className="py-1.5 pr-2 font-medium">说明</th>
                  <th className="py-1.5 pr-2 font-medium">替代方案或坑</th>
                </tr>
              </thead>
              <tbody>
                {TIPS.map((row) => (
                  <tr key={row.command} className="border-b last:border-b-0 align-top">
                    <td className="py-1.5 pr-2 font-mono break-all">{row.command}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.description}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.alternative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              copyText(
                [
                  '# 命令行提速技巧（由「命令行效率工具」导出）',
                  '',
                  '命令\t说明\t替代方案',
                  ...TIPS.map((row) => [row.command, row.description, row.alternative].join('\t')),
                ].join('\n'),
              )
            }
          >
            复制全部技巧为 TSV
          </Button>
        </Section>
      )}
      {tab === 'monitor' && <MonitorPanel />}
      {tab === 'cheatsheet' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section
            title={`fzf 与 skim 速查（共 ${FZF_KEYS.length} 条）`}
            description="fzf 与 skim 键位基本一致，差异列已标注"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">按键 / 选项</th>
                    <th className="py-1.5 pr-2 font-medium">作用</th>
                    <th className="py-1.5 pr-2 font-medium">fzf</th>
                    <th className="py-1.5 pr-2 font-medium">skim</th>
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {FZF_KEYS.map((row) => (
                    <tr key={row.keys} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{row.keys}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.action}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.fzf}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.skim}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="高频组合" description="复制即用">
            <ul className="flex flex-col gap-1.5">
              {[
                'git checkout $(git branch --show-current | cut -c1-7)  # 短哈希',
                'fzf --preview "bat --color=always --style=numbers {}" --bind "ctrl-o:execute(vim {})"',
                'fd -t f -e log | fzf -m | xargs -r tail -n 20',
                'cat *.json | fzf --schema | jq -c ".[].id"',
                'export FZF_DEFAULT_OPTS="--height 45% --layout=reverse --border rounded --info=inline --pointer ▶"',
                'gh pr list | fzf | cut -f1 | xargs -I{} gh pr checkout {}',
                'kill -9 $(pgrep -f "vite" | tr "\\n" " ")  # 批量结束开发服务器',
              ].map((command) => (
                <li key={command}>
                  <code className="block break-all rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-[11px]">
                    {command}
                  </code>
                </li>
              ))}
            </ul>
            <Hint>
              <span className="inline-flex items-center gap-1">
                <ScrollText className="size-3" />
                组合时的通用套路：上游负责「找」（fd / rg / gh），fzf 负责「选」，下游负责「做」（xargs / 管道）。
              </span>
            </Hint>
          </Section>
        </div>
      )}

      <Section title="官方入口" description="参数与行为以官方文档为准">
        <LinkList items={FZF_LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}
