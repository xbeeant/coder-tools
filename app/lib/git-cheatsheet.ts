/**
 * Git 命令速查库：纯数据 + 纯函数，不依赖 React，也绝不执行任何 git 命令。
 * 浏览器环境没有 shell，这里只提供「命令参考」与「场景化操作序列」。
 */

export type GitCategory =
  | 'config'
  | 'commit'
  | 'branch'
  | 'remote'
  | 'undo'
  | 'stash'
  | 'tag'
  | 'inspect'
  | 'rebase'
  | 'submodule'
  | 'worktree'
  | 'hooks'
  | 'troubleshoot'
  | 'advanced'
  | 'ci'
  | 'perf'
  | 'conflict';

export interface GitCategoryMeta {
  id: GitCategory;
  label: string;
  description: string;
}

export const GIT_CATEGORIES: GitCategoryMeta[] = [
  { id: 'config', label: '配置与身份', description: '用户信息、别名、默认分支与忽略规则' },
  { id: 'commit', label: '日常提交', description: 'add / commit / merge 的常规操作' },
  { id: 'branch', label: '分支', description: '创建、切换、合并、重命名与删除分支' },
  { id: 'remote', label: '远程', description: '远端仓库同步、抓取与推送' },
  { id: 'undo', label: '撤销与回退', description: 'reset / revert / restore 的安全用法' },
  { id: 'stash', label: '暂存区 stash', description: '临时保存与恢复工作区改动' },
  { id: 'tag', label: '标签 tag', description: '版本标记、签名与推送标签' },
  { id: 'inspect', label: '查看与对比', description: 'log / diff / show / blame' },
  { id: 'rebase', label: '变基与拣选', description: 'rebase / cherry-pick / range' },
  { id: 'submodule', label: '子模块', description: 'submodule 的添加、更新与同步' },
  { id: 'worktree', label: '多工作区', description: 'worktree 同时检出多个分支' },
  { id: 'hooks', label: '钩子 hooks', description: 'pre-commit、commit-msg 等钩子' },
  { id: 'troubleshoot', label: '排查', description: 'reflog / bisect / fsck 定位问题' },
  { id: 'advanced', label: '高级子命令', description: 'subtree / notes / grep / replace' },
  { id: 'ci', label: 'CI 常用', description: '非交互、脚本化与流水线友好写法' },
  { id: 'perf', label: '大仓库性能', description: 'partial clone、稀疏检出、gc 调优' },
  { id: 'conflict', label: '冲突与文件锁', description: '冲突解决、rerere 与文件锁配置' },
];

export interface GitCommand {
  command: string;
  description: string;
  /** 什么时候用这句话，速查时最需要的信息。 */
  scenario?: string;
  category: GitCategory;
  /** 注意事项或风险，没有就省略。 */
  risk?: string;
  /** 相关命令（在库内按命令文本匹配）。 */
  related?: string[];
}

const C: GitCommand[] = [
  // ── 配置与身份 ───────────────────────────────────────────────
  {
    command: 'git config --global user.name "Amy"',
    description: '设置全局提交者姓名',
    scenario: '第一次配置或换机器',
    category: 'config',
    related: ['git config --global user.email "me@example.com"'],
  },
  {
    command: 'git config --global user.email "me@example.com"',
    description: '设置全局提交者邮箱',
    scenario: '邮箱要与代码托管账号一致，否则提交无法关联账号',
    category: 'config',
  },
  {
    command: 'git config --list --show-origin',
    description: '列出所有配置及其来源文件',
    scenario: '排查「为什么我的配置没生效」',
    category: 'config',
    risk: '输出会包含 token 等敏感值，贴到 issue 前请先删掉',
  },
  {
    command: 'git config --global core.autocrlf false',
    description: 'Windows/macOS 换行符不自动转换',
    scenario: '跨平台协作时避免整文件 diff',
    category: 'config',
    related: ['git config --global core.eol lf', 'git config --list --show-origin'],
  },
  {
    command: 'git config --global pull.rebase true',
    description: '让 git pull 默认走 rebase 而不是 merge 提交',
    scenario: '保持线性历史',
    category: 'config',
  },
  {
    command: 'git config --global init.defaultBranch main',
    description: '新建仓库时默认分支名为 main',
    scenario: '统一团队的默认分支命名',
    category: 'config',
  },
  {
    command: 'git config --local merge.conflictstyle zdiff3',
    description: '冲突标记里额外显示冲突前的原始内容',
    scenario: '三方合并老是合错时强烈建议开启',
    category: 'conflict',
  },
  {
    command: 'git config --global rerere.enabled true',
    description: '自动记住冲突解决过程并复用',
    scenario: '经常重复解决同一类冲突',
    category: 'conflict',
  },
  {
    command: 'git config --global alias.lg "log --oneline --graph --decorate"',
    description: '自定义命令别名',
    scenario: '把长命令缩成短命令',
    category: 'config',
  },

  // ── 日常提交 ────────────────────────────────────────────────
  {
    command: 'git status -sb',
    description: '简洁状态：分支名 + 暂存/未暂存文件',
    scenario: '最常用的日常检查',
    category: 'commit',
  },
  {
    command: 'git add -p',
    description: '按 hunk 交互式选择要暂存的行',
    scenario: '一个文件里有两处改动只想提交一处',
    category: 'commit',
    risk: '交互式操作在脚本里不可用，CI 请改用 git add --patch 也需人工',
  },
  {
    command: 'git add -A',
    description: '暂存全部新增、修改与删除',
    scenario: '准备一次完整提交',
    category: 'commit',
    risk: '会包含 .gitignore 未覆盖的临时文件，提交前先 git status 看一眼',
  },
  {
    command: 'git commit -m "fix: 修复空指针"',
    description: '带信息提交',
    scenario: '日常提交，优先写规范的 message',
    category: 'commit',
    related: ['git commit --amend --no-edit', 'git commit --no-verify -m "chore: 临时提交"'],
  },
  {
    command: 'git commit --amend --no-edit',
    description: '把改动追加到上一次提交且不改 message',
    scenario: '提交完发现漏了文件',
    category: 'commit',
    risk: '已推送的提交被改写后强推会让别人仓库出错',
  },
  {
    command: 'git commit --amend -m "新信息"',
    description: '修改上一次提交的 message',
    scenario: 'message 写错了',
    category: 'commit',
    risk: '同样会改写提交哈希',
  },
  {
    command: 'git commit --no-verify -m "wip"',
    description: '跳过 pre-commit / commit-msg 钩子',
    scenario: '钩子误报或本地调试急需提交',
    category: 'commit',
    risk: '不要养成习惯，合入主干前应让钩子真正通过',
  },
  {
    command: 'git commit --fixup <commit>',
    description: '创建一个 fixup! 提交，供 autosquash 合并',
    scenario: '评审后补小修改',
    category: 'commit',
    related: ['git rebase -i --autosquash origin/main'],
  },
  {
    command: 'git commit --squash <branch> && git merge --squash <branch>',
    description: '把一个分支压成一次提交再合并',
    scenario: '把特性分支干净地并入主干',
    category: 'commit',
  },

  // ── 分支 ───────────────────────────────────────────────────
  {
    command: 'git switch -c feature/login',
    description: '创建并切换到新分支',
    scenario: '开始一个新特性',
    category: 'branch',
    related: ['git checkout -b feature/login'],
  },
  {
    command: 'git switch feature/login',
    description: '切换到已有分支',
    scenario: '回到之前的特性分支',
    category: 'branch',
  },
  {
    command: 'git switch -',
    description: '切回上一个分支',
    scenario: '在 main 与特性分支之间来回跳',
    category: 'branch',
  },
  {
    command: 'git branch -vv',
    description: '列出本地分支及其上游与领先/落后情况',
    scenario: '同步前先看谁领先谁',
    category: 'branch',
  },
  {
    command: 'git branch --merged main',
    description: '列出已合并进 main 的分支',
    scenario: '清理已完成的特性分支',
    category: 'branch',
  },
  {
    command: 'git branch --no-merged main',
    description: '列出尚未合并的分支',
    scenario: '删除分支前确认没有丢工作',
    category: 'branch',
  },
  {
    command: 'git branch -d feature/login',
    description: '安全删除已合并分支',
    scenario: '清理本地分支',
    category: 'branch',
    risk: '未合并时会被拒绝，这是保护而非麻烦',
  },
  {
    command: 'git branch -D feature/login',
    description: '强制删除分支',
    scenario: '确认改动已丢弃或已另存',
    category: 'branch',
    risk: '未合并的提交会变成不可达对象，只能靠 reflog 抢救',
  },
  {
    command: 'git branch -m old-name new-name',
    description: '重命名当前分支',
    scenario: '分支名写错了',
    category: 'branch',
  },
  { command: 'git branch -a', description: '列出本地与远程分支', scenario: '确认远端有哪些分支', category: 'branch' },
  {
    command: 'git branch --set-upstream-to=origin/main main',
    description: '给分支绑定上游',
    scenario: '想直接 git pull / git push 不带参数',
    category: 'branch',
  },
  {
    command: 'git checkout -b tmp && git checkout -',
    description: '旧版 Git 的等价写法：临时分支再切回',
    scenario: 'Git 版本较老时创建并切换分支',
    category: 'branch',
  },

  // ── 远程 ───────────────────────────────────────────────────
  { command: 'git remote -v', description: '查看远端地址', scenario: '确认推到了正确的仓库', category: 'remote' },
  {
    command: 'git remote add origin git@github.com:me/repo.git',
    description: '添加名为 origin 的远端',
    scenario: '克隆别人的仓库或初始化本地仓库',
    category: 'remote',
  },
  {
    command: 'git remote set-url origin <url>',
    description: '修改远端地址',
    scenario: '仓库迁移到新域名',
    category: 'remote',
  },
  {
    command: 'git fetch --all --prune',
    description: '抓取所有远端并清理已删除的远程分支引用',
    scenario: '定期同步远端状态',
    category: 'remote',
  },
  {
    command: 'git fetch origin main:refs/remotes/origin/main',
    description: '把远端分支拉到自定义的本地引用',
    scenario: 'CI 里只想更新一条分支',
    category: 'remote',
  },
  {
    command: 'git push -u origin feature/login',
    description: '推送并建立上游跟踪关系',
    scenario: '第一次推送新分支',
    category: 'remote',
  },
  {
    command: 'git push --force-with-lease',
    description: '推送，但只有远端没被别人推进过才覆盖',
    scenario: '必须改写已推送的提交',
    category: 'remote',
    risk: '远端有他人提交时会被拒绝；push -f 无此保护，别用',
  },
  {
    command: 'git push --atomic origin main feature/login',
    description: '多条引用要么全部成功要么全部失败',
    scenario: '一次推多个分支，不能只推一半',
    category: 'remote',
  },
  {
    command: 'git push origin --delete feature/login',
    description: '删除远端分支',
    scenario: '特性已上线，清理远端',
    category: 'remote',
  },
  {
    command: 'git push --follow-tags',
    description: '推送分支时一并推送可达的标签',
    scenario: '发布时避免漏推 tag',
    category: 'remote',
    related: ['git tag -a v1.0.0 -m "release"'],
  },
  {
    command: 'git pull --rebase --autostash',
    description: '拉取并变基，同时自动暂存/恢复本地改动',
    scenario: '本地有未提交改动又需要同步',
    category: 'remote',
  },

  // ── 撤销与回退 ──────────────────────────────────────────────
  {
    command: 'git restore <file>',
    description: '丢弃工作区对某文件的改动',
    scenario: '改乱了想回到暂存区/HEAD 的版本',
    category: 'undo',
    risk: '未暂存的改动会永久丢失，必要时先 git stash',
  },
  {
    command: 'git restore --staged <file>',
    description: '把文件从暂存区移回工作区',
    scenario: 'git add 错了文件',
    category: 'undo',
  },
  {
    command: 'git reset --soft HEAD~1',
    description: '撤销上一次提交，但保留改动在暂存区',
    scenario: '想重新组织 commit message',
    category: 'undo',
  },
  {
    command: 'git reset --mixed HEAD~1',
    description: '撤销上一次提交，改动回到未暂存状态',
    scenario: '默认写法：撤销提交但保留代码',
    category: 'undo',
  },
  {
    command: 'git reset --hard HEAD~1',
    description: '撤销上一次提交并丢弃所有改动',
    scenario: '彻底扔掉一个提交',
    category: 'undo',
    risk: '工作区与暂存区的改动会直接消失，先 git stash 或确认 reflog 能救',
  },
  {
    command: 'git revert <commit>',
    description: '生成一个反向提交来撤销某个提交',
    scenario: '撤销已经推送到主干的提交',
    category: 'undo',
    risk: 'revert 会新增提交，不要用 reset 改写共享历史',
  },
  {
    command: 'git revert --no-commit <commit>',
    description: '把撤销改动先放进暂存区再手动提交',
    scenario: '想合并多个 revert 再提交',
    category: 'undo',
  },
  {
    command: 'git revert -m 1 <merge-commit>',
    description: '撤销一个合并提交，-m 1 表示保留第一父提交',
    scenario: '误合并了整条分支',
    category: 'undo',
    risk: '-m 选错会保留错误的父提交历史',
  },
  {
    command: 'git commit --allow-empty -m "chore: 空提交"',
    description: '创建一个空提交用于触发流水线',
    scenario: '需要重新跑一次 CI',
    category: 'undo',
  },
  {
    command: 'git reflog expire --expire=now --all && git gc --prune=now',
    description: '立即清除所有 reflog 并回收悬空对象',
    scenario: '本地仓库体积异常需要紧急瘦身',
    category: 'undo',
    risk: '不可逆：dangling commit 在此之后彻底无法找回',
  },

  // ── 暂存区 ─────────────────────────────────────────────────
  {
    command: 'git stash push -m "临时保存"',
    description: '把当前改动收进 stash',
    scenario: '需要切分支但不想提交半成品',
    category: 'stash',
  },
  {
    command: 'git stash push -u -m "含未跟踪" ',
    description: '连未跟踪文件一起暂存',
    scenario: '新写的文件也要先收起来',
    category: 'stash',
  },
  { command: 'git stash list', description: '列出所有 stash', scenario: '找回之前存起来的东西', category: 'stash' },
  {
    command: 'git stash show -p stash@{0}',
    description: '查看某个 stash 的具体改动',
    scenario: '确认 stash 里有什么',
    category: 'stash',
  },
  {
    command: 'git stash pop stash@{0}',
    description: '取出并删除最近一个 stash',
    scenario: '回到干净状态继续干活',
    category: 'stash',
    risk: '可能与当前改动冲突；pop 失败时 stash 会保留，apply 不会删',
  },
  {
    command: 'git stash apply stash@{1}',
    description: '取出指定 stash 但保留记录',
    scenario: '同一份改动要应用多次',
    category: 'stash',
  },
  {
    command: 'git stash drop stash@{0}',
    description: '删除一个 stash',
    scenario: '清理无用暂存',
    category: 'stash',
    risk: '删除后只能靠 reflog 找回（若对象尚未 gc）',
  },
  {
    command: 'git stash branch fix-bug stash@{0}',
    description: '基于 stash 新建分支并应用它',
    scenario: '把半成品独立成一个分支继续开发',
    category: 'stash',
  },

  // ── 标签 ───────────────────────────────────────────────────
  { command: 'git tag', description: '列出全部标签', scenario: '查看已有版本', category: 'tag' },
  {
    command: 'git tag -a v1.2.0 -m "release 1.2.0"',
    description: '创建带说明的注解标签',
    scenario: '打版本号',
    category: 'tag',
    related: ['git push origin v1.2.0'],
  },
  {
    command: 'git tag -s v1.2.0 -m "signed"',
    description: '创建 GPG 签名标签',
    scenario: '发布需要验证来源的产物',
    category: 'tag',
    risk: '需要本地配置 GPG 私钥',
  },
  { command: 'git tag -d v1.2.0', description: '删除本地标签', scenario: '打错版本号', category: 'tag' },
  {
    command: 'git push origin --tags',
    description: '把所有标签推到远端',
    scenario: '本地打好标签后发布',
    category: 'tag',
  },
  {
    command: 'git push origin :refs/tags/v1.2.0',
    description: '删除远端标签',
    scenario: '误推送的标签需要撤回',
    category: 'tag',
    risk: '标签已被别人使用时删除会造成历史混乱',
  },
  {
    command: 'git tag -l "v1.*" --sort=-v:refname',
    description: '按版本号倒序列出 v1.* 标签',
    scenario: '找最新的 v1 版本',
    category: 'tag',
  },
  {
    command: 'git describe --tags --always',
    description: '用最近的标签描述当前提交',
    scenario: '构建脚本里给制品打版本号',
    category: 'tag',
  },

  // ── 查看与对比 ──────────────────────────────────────────────
  {
    command: 'git log --oneline --graph --decorate --all',
    description: '图形化查看所有分支历史',
    scenario: '理解仓库当前拓扑',
    category: 'inspect',
  },
  {
    command: 'git log -p -2 -- <file>',
    description: '只看某文件最近两次提交的补丁',
    scenario: '追溯某文件为什么被改',
    category: 'inspect',
  },
  {
    command: 'git log --format="%h %ad %an %s" --date=short -10',
    description: '自定义输出模板',
    scenario: '生成提交列表或 CI 变更摘要',
    category: 'inspect',
  },
  {
    command: 'git log --author="Amy" --since="2 weeks ago"',
    description: '按作者与时间过滤提交',
    scenario: '统计某人某段时间的工作',
    category: 'inspect',
  },
  {
    command: 'git show <commit>',
    description: '查看某个提交的完整内容',
    scenario: '读懂一次历史改动',
    category: 'inspect',
  },
  { command: 'git diff', description: '工作区与暂存区的差异', scenario: '提交前自查', category: 'inspect' },
  {
    command: 'git diff --staged',
    description: '暂存区与 HEAD 的差异',
    scenario: '提交前最终确认',
    category: 'inspect',
  },
  {
    command: 'git diff main...feature',
    description: 'feature 相对 main 的净差异（三点对称差）',
    category: 'inspect',
    scenario: '开 MR 前自查范围',
    risk: '三点表示对称差；两点 main..feature 会把 main 的新提交也算进来',
  },
  {
    command: 'git diff --stat main...HEAD',
    description: '只看差异的文件与行数统计',
    category: 'inspect',
    scenario: '快速评估改动规模',
    risk: '描述与统计二选一',
  },
  {
    command: 'git blame <file>',
    description: '逐行标注最后修改人',
    scenario: '找到某行代码是谁写的',
    category: 'inspect',
  },
  {
    command: 'git blame -w -C -C <file>',
    description: '忽略空白移动追溯原始作者',
    scenario: '代码被搬来搬去后还要找真正作者',
    category: 'inspect',
  },
  { command: 'git shortlog -sn', description: '按作者汇总提交数', scenario: '生成贡献者列表', category: 'inspect' },
  {
    command: 'git log --merges --oneline',
    description: '只列出合并提交',
    category: 'inspect',
    scenario: '梳理历史合并点',
  },
  {
    command: 'git range-diff main...topic topic2...topic2base',
    description: '比较两个版本分支的提交差异质量',
    category: 'inspect',
    scenario: '审查 rebase 后的补丁是否等价',
    risk: '四个参数较易写错，建议配合 git log --oneline 先看清',
  },
  {
    command: 'git log -S"token" --oneline',
    description: '按内容变化搜索提交（pickaxe）',
    scenario: '找出某个魔法字符串何时被引入或删除',
    category: 'inspect',
  },
  {
    command: 'git log --grep="fix:" --oneline -i',
    description: '按提交信息关键词搜索',
    category: 'inspect',
    scenario: '查某个 issue 的修复记录',
    risk: '加 -i 忽略大小写',
  },

  // ── 变基与拣选 ──────────────────────────────────────────────
  {
    command: 'git rebase main',
    description: '把当前分支的提交搬到 main 之上',
    scenario: '让特性分支跟上主干',
    category: 'rebase',
    risk: '不要对已推送给别人的分支做 rebase，会让对方仓库历史混乱',
  },
  {
    command: 'git rebase -i HEAD~5',
    description: '交互式整理最近 5 个提交',
    scenario: 'squash / fixup / reword / drop / 调整顺序',
    category: 'rebase',
    risk: '交互式，无法在 CI 中使用',
  },
  {
    command: 'git rebase -i --autosquash origin/main',
    description: '整理分支并自动折叠 fixup 提交',
    scenario: '评审意见逐条修复后整理历史',
    category: 'rebase',
  },
  {
    command: 'git rebase --onto main <旧基点> feature',
    description: '把某段提交移到新的基点上',
    scenario: '分支要脱离一个已废弃的基线',
    category: 'rebase',
  },
  {
    command: 'git rebase --continue',
    description: '解决冲突后继续变基',
    category: 'rebase',
    risk: '必须先 git add 已解决的文件',
  },
  { command: 'git rebase --abort', description: '放弃本次变基，回到原状态', category: 'rebase' },
  {
    command: 'git cherry-pick <commit>',
    description: '把某个提交摘到当前分支',
    scenario: '只想要别的分支上的一个修复',
    category: 'rebase',
  },
  {
    command: 'git cherry-pick -n <commit1> <commit2>',
    description: '依次摘取但不自动提交',
    scenario: '把多个修复合成一次提交',
    category: 'rebase',
  },
  {
    command: 'git cherry-pick -x <commit>',
    description: '摘取并在 message 里记录来源哈希',
    scenario: '同步补丁时保留溯源信息',
    category: 'rebase',
  },
  {
    command: 'git revert --no-commit HEAD..feature && git commit -m "回滚整段"',
    description: '批量回滚一个提交区间',
    scenario: '整个特性不合主线',
    category: 'rebase',
  },

  // ── 子模块 ─────────────────────────────────────────────────
  {
    command: 'git submodule add https://github.com/me/lib.git libs/lib',
    description: '添加子模块',
    category: 'submodule',
  },
  {
    command: 'git submodule update --init --recursive',
    description: '克隆并递归初始化所有子模块',
    scenario: 'CI 里检出带子模块的仓库',
    category: 'submodule',
    risk: '最常见的坑：不加 --recursive 会遗漏嵌套子模块',
  },
  {
    command: 'git submodule status',
    description: '查看各子模块的提交指针状态',
    scenario: '确认指针是否最新',
    category: 'submodule',
  },
  {
    command: 'git submodule foreach "git pull --ff-only"',
    description: '在每个子模块里执行命令',
    scenario: '批量同步子模块',
    category: 'submodule',
  },
  {
    command: 'git submodule deinit -f <path> && git submodule rm <path>',
    description: '彻底移除一个子模块',
    scenario: '不再需要该依赖',
    category: 'submodule',
    risk: '别只删目录，.gitmodules 与索引里的指针也要清掉',
  },

  // ── 多工作区 ───────────────────────────────────────────────
  {
    command: 'git worktree add ../hotfix main',
    description: '为 main 额外创建一个工作区',
    scenario: '正在 feature 上开发，同时要紧急修 main',
    category: 'worktree',
    risk: '同一分支不能被两个工作区同时检出',
  },
  { command: 'git worktree add -b new-branch ../dir', description: '创建工作区并同时新建分支', category: 'worktree' },
  { command: 'git worktree list', description: '列出所有工作区', category: 'worktree' },
  {
    command: 'git worktree remove ../dir',
    description: '删除工作区',
    category: 'worktree',
    risk: '目录里有未提交改动时需先 --force',
  },
  {
    command: 'git worktree prune',
    description: '清理已被手动删除的工作区记录',
    scenario: '磁盘上的目录没了但 git 还记着',
    category: 'worktree',
  },

  // ── 钩子 ───────────────────────────────────────────────────
  {
    command: 'git config core.hooksPath .githooks',
    description: '把钩子目录改为仓库内可版本化的位置',
    scenario: '希望团队共享 pre-commit 规则',
    category: 'hooks',
  },
  {
    command: 'ls -l .git/hooks/pre-commit',
    description: '确认钩子文件可执行',
    category: 'hooks',
    risk: '没有 x 位时 Git 会静默跳过该钩子',
  },
  {
    command: 'SKIP=commit-msg git commit -m "msg"',
    description: '跳过指定钩子',
    scenario: '紧急修复分支',
    category: 'hooks',
    risk: '仅临时使用',
  },
  {
    command: 'git commit --no-verify -m "wip"',
    description: '跳过 pre-commit 与 commit-msg',
    category: 'hooks',
    risk: '绕过质量门禁',
  },
  {
    command: 'git rev-parse --git-path hooks/pre-commit',
    description: '打印钩子实际路径',
    category: 'hooks',
    scenario: '排查钩子到底读的是哪个文件',
  },
  {
    command: 'git config core.hooksPath /dev/null',
    description: '临时禁用所有钩子',
    scenario: '在陌生仓库里快速看历史',
    category: 'hooks',
    risk: '不要提交这个配置到仓库',
  },

  // ── 排查 ───────────────────────────────────────────────────
  {
    command: 'git reflog',
    description: '查看 HEAD 的移动历史',
    scenario: 'reset --hard 之后想找回提交',
    category: 'troubleshoot',
    risk: '默认保留 90 天，gc 后不可用',
  },
  { command: 'git reflog show main', description: '查看某个分支的移动历史', category: 'troubleshoot' },
  {
    command: 'git reset --hard HEAD@{3}',
    description: '回到 reflog 中第 3 个历史位置',
    scenario: '找回误删的提交',
    category: 'troubleshoot',
    risk: '先记下目标哈希再操作',
  },
  {
    command: 'git bisect start && git bisect bad && git bisect good <last-good>',
    description: '二分定位引入 bug 的提交',
    scenario: '某个版本开始有问题',
    category: 'troubleshoot',
    risk: '需要能自动化判定好坏的脚本才好用',
  },
  { command: 'git bisect run <script>', description: '用脚本自动执行二分判定', category: 'troubleshoot' },
  { command: 'git bisect reset', description: '结束二分回到原分支', category: 'troubleshoot' },
  {
    command: 'git fsck --lost-found',
    description: '检查对象库完整性与悬空对象',
    scenario: '仓库损坏或想找回丢失对象',
    category: 'troubleshoot',
    risk: '耗时较长，大仓库请加 --no-reflogs',
  },
  { command: 'git fsck --full --no-progress', description: '完整性深度检查', category: 'troubleshoot' },
  {
    command: 'git cat-file -p <object>',
    description: '直接查看任意 git 对象的原始内容',
    scenario: '提交/tag 看起来不对劲',
    category: 'troubleshoot',
  },
  { command: 'git count-objects -vH', description: '统计松散对象与仓库体积', category: 'troubleshoot' },
  {
    command: 'git verify-commit <commit>',
    description: '验证 GPG 提交签名',
    category: 'troubleshoot',
    risk: '需要公钥已导入',
  },
  {
    command: 'git log -- .gitignore',
    description: '查看 .gitignore 的变更历史',
    category: 'troubleshoot',
    scenario: '文件为什么突然被忽略了',
  },

  // ── 高级子命令 ─────────────────────────────────────────────
  { command: 'git grep -n "TODO" -- src/', description: '在指定路径下搜索代码内容', category: 'advanced' },
  {
    command: 'git grep -n -i "api_key" $(git rev-list --all)',
    description: '在所有历史版本中搜索敏感信息',
    scenario: '确认密钥是否曾经提交过',
    category: 'advanced',
    risk: '仅靠删文件无法清除历史，必须配合 filter-repo 或 BFG',
  },
  { command: 'git log -L 100,120:src/app.ts', description: '追踪某个代码行的演化历史', category: 'advanced' },
  { command: 'git notes add -m "与 issue #12 相关"', description: '给提交附加备注', category: 'advanced' },
  { command: 'git log --notes=*', description: '查看所有备注', category: 'advanced' },
  { command: 'git notes copy -C <from> <to>', description: '把备注复制到其它提交', category: 'advanced' },
  {
    command: 'git subtree add --prefix vendor/lib <repo> <branch>',
    description: '把另一个仓库作为子目录并入当前仓库',
    scenario: '不想用子模块',
    category: 'advanced',
    risk: '历史会整体搬入，仓库体积明显增长',
  },
  {
    command: 'git subtree pull --prefix vendor/lib <repo> <branch>',
    description: '更新并入的子树',
    category: 'advanced',
  },
  {
    command: 'git replace --graft <old> <new>',
    description: '临时替换提交父关系用于调试',
    category: 'advanced',
    risk: '只在本地生效，别推送；用 git replace -l 查看、-d 删除',
  },
  {
    command: 'git rev-list --objects --all | git cat-file --batch-check',
    description: '批量统计对象体积',
    scenario: '找出仓库里最大的文件',
    category: 'advanced',
  },

  // ── CI 常用 ────────────────────────────────────────────────
  {
    command: 'git -c core.pager=cat log --oneline -5',
    description: '关闭分页器，保证日志可解析',
    category: 'ci',
    risk: '不加时 CI 输出会包含 --More-- 之类的控制字符',
  },
  {
    command: 'git log --format="%H" <base>..<head>',
    description: '输出提交哈希列表供脚本使用',
    scenario: 'CI 生成变更说明',
    category: 'ci',
  },
  {
    command: 'git diff --name-only <base>..<head>',
    description: '输出变更文件名列表',
    scenario: '决定跑哪些测试',
    category: 'ci',
  },
  {
    command: 'git -c advice.detachedHead=false checkout <sha>',
    description: '检出指定提交且不打印 detached HEAD 建议',
    category: 'ci',
  },
  {
    command: 'git fetch --depth=1 origin <branch>',
    description: '浅克隆单提交',
    scenario: '只需要最新代码的流水线',
    category: 'ci',
    risk: '浅克隆无法做 git log/blame 深度历史分析',
  },
  { command: 'git fetch --unshallow', description: '把浅克隆补成完整历史', category: 'ci' },
  {
    command: 'git config --global --add safe.directory <path>',
    description: '标记目录所有权可信',
    category: 'ci',
    risk: '容器里以 root 拉代码时需要；谨慎授予',
  },
  {
    command: 'git -c user.name=CI -c user.email=ci@example.com commit -m "..."',
    description: '为单次提交指定身份',
    category: 'ci',
  },
  {
    command: 'git diff --quiet',
    description: '无差异时退出码为 0',
    scenario: 'shell 判断「有没有改动」',
    category: 'ci',
    risk: '配合 git diff --quiet --cached 判断暂存区',
  },
  {
    command: 'git merge-base origin/main HEAD',
    description: '求共同祖先',
    scenario: '算出「需要重放的提交」',
    category: 'ci',
    related: ['git log --oneline $(git merge-base origin/main HEAD)..HEAD'],
  },

  // ── 大仓库性能 ─────────────────────────────────────────────
  {
    command: 'git clone --filter=blob:none <url>',
    description: '部分克隆：只取提交与树，按需再拉 blob',
    scenario: '克隆超大仓库',
    category: 'perf',
    risk: '首次读取文件时才联网；CI 需要能访问网络',
  },
  {
    command: 'git clone --depth 50 --single-branch <url>',
    description: '单分支浅克隆',
    scenario: '只要主干最近几十个提交',
    category: 'perf',
  },
  {
    command: 'git sparse-checkout init --cone && git sparse-checkout set src docs',
    description: '稀疏检出：只签出指定目录',
    scenario: '只想改一个子目录',
    category: 'perf',
  },
  { command: 'git sparse-checkout list', description: '查看当前稀疏检出范围', category: 'perf' },
  {
    command: 'git commit-graph write --reachable',
    description: '预生成 commit-graph 加速日志与合并',
    scenario: 'git log 慢、CI 反复拉取同一仓库',
    category: 'perf',
  },
  { command: 'git maintenance start --task=commit-graph', description: '后台自动执行仓库维护任务', category: 'perf' },
  {
    command: 'git gc --aggressive --prune=now',
    description: '彻底重打包并回收空间',
    scenario: 'clone 回来后立刻 shrink',
    category: 'perf',
    risk: '非常耗时，只在本地空闲时做',
  },
  { command: 'git repack -adfl', description: '重打包对象并删除冗余副本', category: 'perf' },
  { command: 'git config core.commitGraph true', description: '开启 commit-graph 加速', category: 'perf' },
  {
    command: 'git rev-list --objects --all --missing=print | grep "^?"',
    description: '找出部分克隆里尚未下载的对象',
    category: 'perf',
    risk: '离线环境下会触发联网请求',
  },

  // ── 冲突与文件锁 ───────────────────────────────────────────
  {
    command: 'git status --porcelain=v1 -uall',
    description: '机器可读的冲突与文件状态',
    scenario: '脚本里判断是否还有未合并文件',
    category: 'conflict',
  },
  { command: 'git diff --name-only --diff-filter=U', description: '列出未解决的冲突文件', category: 'conflict' },
  {
    command: 'git checkout --ours <file>',
    description: '冲突时保留当前分支（我们）的版本',
    scenario: '冲突文件应该以自己为准',
    category: 'conflict',
    risk: '会丢掉对方改动，先备份',
  },
  {
    command: 'git checkout --theirs <file>',
    description: '冲突时保留被合入分支（他们）的版本',
    scenario: '依赖文件以上游为准',
    category: 'conflict',
    risk: '注意：ours/theirs 在 rebase 时的含义与 merge 相反',
  },
  {
    command: 'git show :2:<file> > <file>',
    description: '把暂存区第 2 版（合并前 ours）导出',
    category: 'conflict',
    scenario: '精细合并时的取材技巧',
  },
  { command: 'git show :3:<file> > <file>', description: '把暂存区第 3 版（对方）导出', category: 'conflict' },
  {
    command: 'git merge-file -p <本地> <基线> <对方>',
    description: '脱离仓库直接三方合并两个文件',
    scenario: '解决 lock 文件冲突',
    category: 'conflict',
  },
  { command: 'git mergetool --tool=vimdiff', description: '调用三方合并工具处理冲突', category: 'conflict' },
  { command: 'git checkout -m <file>', description: '在重新合并改动前重建冲突标记', category: 'conflict' },
  { command: 'git rerere status', description: '查看已记忆的冲突解决记录', category: 'conflict' },
  {
    command: 'git rerere forget <file>',
    description: '让 Git 忘记某次冲突解决方案',
    category: 'conflict',
    scenario: '自动套用了错误的解决方案',
  },
  {
    command: 'git merge --abort',
    description: '放弃这次合并',
    category: 'conflict',
    risk: 'merge 失败后可用；rebase 场景请用 rebase --abort',
  },
  {
    command: 'git merge -X ours -X theirs <branch>',
    description: '冲突时自动选择某一方',
    category: 'conflict',
    risk: '会静默丢掉另一侧改动，只适合明确知道差异的场景',
  },
  {
    command: 'git rm --cached -r <path> && git commit -m "chore: 停止跟踪"',
    description: '停止跟踪文件但保留本地副本',
    scenario: '把构建产物或密钥文件移出版本控制',
    category: 'conflict',
    risk: '仅影响后续提交，历史里的内容仍存在',
  },
];

export const GIT_COMMANDS: GitCommand[] = C;

export function gitCategoryLabel(id: GitCategory): string {
  return GIT_CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

const COMMAND_INDEX = new Map<string, GitCommand>();
for (const item of C) if (!COMMAND_INDEX.has(item.command)) COMMAND_INDEX.set(item.command, item);

export function findGitCommand(command: string): GitCommand | undefined {
  return COMMAND_INDEX.get(command.trim());
}

/** 在命令库内搜索：命令、说明、场景、分类、风险全部参与匹配。 */
export function searchGitCommands(query: string, category: GitCategory | 'all'): GitCommand[] {
  const q = query.trim().toLowerCase();
  return C.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (q === '') return true;
    return (
      item.command.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.scenario ?? '').toLowerCase().includes(q) ||
      (item.risk ?? '').toLowerCase().includes(q) ||
      gitCategoryLabel(item.category).toLowerCase().includes(q)
    );
  });
}

export function countByCategory(commands: GitCommand[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of commands) out[item.category] = (out[item.category] ?? 0) + 1;
  return out;
}

/* ── 场景库 ──────────────────────────────────────────────────── */

export interface GitScenarioStep {
  command: string;
  note: string;
}

export interface GitScenario {
  id: string;
  title: string;
  /** 参与「怎么办」查询的关键词。 */
  keywords: string[];
  summary: string;
  steps: GitScenarioStep[];
  warning?: string;
}

export const GIT_SCENARIOS: GitScenario[] = [
  {
    id: 'secret-committed',
    title: '误提交了密钥 / 密码 / token',
    keywords: ['密钥', 'secret', 'token', '密码', 'password', 'api key', '误提交', '泄露', 'credential'],
    summary: '先止血（吊销密钥），再从索引移除，最后视情况清理历史。',
    steps: [
      { command: 'git log --oneline -20', note: '先确认密钥出现在哪几个提交里' },
      { command: 'git rm --cached <file> && echo "<file>" >> .gitignore', note: '把文件移出版本控制并加进忽略列表' },
      { command: 'git commit -m "chore: 移除误提交的密钥文件"', note: '在平台上重新吊销/轮换该密钥，这一步不能省' },
      {
        command: 'git filter-repo --path <file> --invert-paths',
        note: '若已推送到共享仓库，用 git-filter-repo 清历史（会改写所有提交哈希，需全员重新克隆）',
      },
    ],
    warning: '删文件不等于删历史：只要提交推上去过，密钥就必须视为已泄露，先去平台吊销再谈清理。',
  },
  {
    id: 'undo-last-commit',
    title: '想撤销上一次提交',
    keywords: ['撤销', '取消提交', 'undo', 'reset', '回退', 'revert', '反悔'],
    summary: '按「是否已推送」和「是否要保留改动」选择 reset 或 revert。',
    steps: [
      { command: 'git status -sb', note: '确认工作区是否干净' },
      { command: 'git reset --soft HEAD~1', note: '已推送/想保留改动并重写提交：soft 保留在暂存区' },
      { command: 'git commit -m "新信息"', note: '重新提交' },
      { command: 'git revert HEAD', note: '如果提交已经推到共享主干，用 revert 新增一个反向提交' },
    ],
    warning: 'reset 会改写历史；对已推送给别人的提交使用必须改用 revert，或与所有人协调后再强推。',
  },
  {
    id: 'pick-commit-to-new-branch',
    title: '把某个提交摘到新分支',
    keywords: ['摘', 'cherry-pick', '新分支', '拆分', '单独提交', 'pick'],
    summary: '新建分支后用 cherry-pick 搬运提交，需要干净的工作区。',
    steps: [
      { command: 'git stash push -u', note: '工作区不干净时先存起来' },
      { command: 'git switch -c feature/fix-from-main', note: '从当前基线新建分支' },
      { command: 'git cherry-pick -x <commit>', note: '-x 会在 message 里记录来源哈希，方便溯源' },
      { command: 'git push -u origin feature/fix-from-main', note: '推送并建立跟踪' },
    ],
  },
  {
    id: 'sync-with-colleague',
    title: '和同事的分支同步',
    keywords: ['同步', '拉取', '更新', '同事', '远程', 'sync', 'pull', '落后'],
    summary: 'fetch 看差距，再决定 merge 还是 rebase。',
    steps: [
      { command: 'git fetch --all --prune', note: '只更新远端引用，不动本地代码，安全' },
      { command: 'git branch -vv', note: '看本地分支领先/落后多少' },
      { command: 'git log --oneline HEAD..origin/main', note: '列出你还没有的提交' },
      { command: 'git rebase origin/main', note: '共享分支建议 rebase 保持线性；切勿对已推送的分支强推' },
      { command: 'git push --force-with-lease', note: '改写历史后推送，--force-with-lease 会保护同事已推送的提交' },
    ],
    warning: 'git push -f 没有并发保护，会静默覆盖同事的提交；除非确信没人动过，否则一律用 --force-with-lease。',
  },
  {
    id: 'recover-lost-commit',
    title: '找回 reset --hard 掉的提交',
    keywords: ['找回', '丢失', 'reflog', '误删', '恢复', 'recover', '丢了'],
    summary: 'reflog 记录了 HEAD 的每一步移动，可以回到任意历史位置。',
    steps: [
      { command: 'git reflog --date=local', note: '找到那次 reset 之前的哈希，例如 a1b2c3d' },
      { command: 'git show a1b2c3d --stat', note: '确认这就是你要找回的提交' },
      { command: 'git branch rescue/a1b2c3d a1b2c3d', note: '先建分支保住对象，避免被 gc 回收' },
      { command: 'git reset --hard a1b2c3d', note: '再决定是否把当前分支指针移回去' },
    ],
    warning: 'reflog 只在本仓库保留约 90 天，且可能被 gc 清理；一旦被 gc 回收就只能去对象存储备份里找。',
  },
  {
    id: 'squash-messy-history',
    title: '整理杂乱提交历史',
    keywords: ['整理', 'squash', '合并提交', '历史', 'interactive', 'rebase i', '美化'],
    summary: '交互式 rebase 合并、拆分、重排提交。',
    steps: [
      { command: 'git log --oneline origin/main..HEAD', note: '先看清要整理的范围' },
      { command: 'git rebase -i origin/main', note: '把 fixup/squash/reword/drop 排好序后保存退出' },
      { command: 'git rebase --continue', note: '有冲突时逐个解决并 add 后继续' },
      { command: 'git push --force-with-lease', note: '整理后改写历史，推送要用 lease 保护' },
    ],
    warning: '整理前先 git branch backup 备份；rebase 中断可用 git rebase --abort 回到原状。',
  },
  {
    id: 'find-bug-bisect',
    title: '定位从哪个版本开始出 bug',
    keywords: ['bisect', '二分', '定位', '回归', '哪个版本', 'bug', '排查'],
    summary: '用二分法把问题范围指数级缩小。',
    steps: [
      { command: 'git bisect start', note: '开始二分' },
      { command: 'git bisect bad', note: '当前 HEAD 是坏的' },
      { command: 'git bisect good v1.0.0', note: 'v1.0.0 是已知好的' },
      { command: 'git bisect run ./repro.sh', note: '脚本退出码非 0 视为 bad，0 视为 good' },
      { command: 'git bisect reset', note: '结束后回到原分支' },
    ],
  },
  {
    id: 'switch-with-dirty-worktree',
    title: '带着未提交改动切分支',
    keywords: ['切换分支', '未提交', 'stash', '暂存', '脏工作区', '带改动'],
    summary: '能直接切就直接切，否则先 stash。',
    steps: [
      { command: 'git switch <target>', note: 'Git 会自动携带改动；若报冲突说明目标分支改动重叠' },
      { command: 'git stash push -u -m "切分支前保存"', note: '-u 连未跟踪文件一起存' },
      { command: 'git switch <target>', note: '现在工作区干净，可以随意切' },
      { command: 'git stash pop', note: '回来后恢复改动；pop 失败时 stash 仍保留' },
    ],
  },
  {
    id: 'undo-merge',
    title: '撤销一次误合并',
    keywords: ['撤销合并', '误合并', 'merge', '回退合并', 'revert merge'],
    summary: '合并提交要指定保留哪个父提交。',
    steps: [
      { command: 'git log --oneline -3', note: '找到那个 merge 提交哈希' },
      { command: 'git revert -m 1 <merge-commit>', note: '-m 1 表示保留第一父（合并前的当前分支）' },
      { command: 'git revert --abort', note: '有冲突想放弃时使用' },
    ],
    warning: '-m 的取值搞错会保留错误一侧的历史；撤销前先用 git show <hash> 看清楚两个父提交。',
  },
  {
    id: 'commit-to-wrong-branch',
    title: '提交到了错误的分支',
    keywords: ['提交错分支', 'commit 错', '搬提交', '放错', '选错分支'],
    summary: '把提交搬回正确分支，原分支回退。',
    steps: [
      { command: 'git log --oneline -1', note: '记下误提交哈希' },
      { command: 'git switch <正确的分支>', note: '切到目标分支' },
      { command: 'git cherry-pick <commit>', note: '把改动搬过来' },
      { command: 'git switch <原分支> && git reset --hard HEAD~1', note: '原分支回退掉误提交' },
    ],
  },
  {
    id: 'large-file-in-repo',
    title: '误把大文件提交进仓库',
    keywords: ['大文件', '仓库膨胀', '二进制', '瘦身', 'git lfs', 'shrink'],
    summary: '先从后续历史移除，再回收空间。',
    steps: [
      { command: 'git rm --cached <big-file>', note: '先停止跟踪' },
      { command: 'git commit -m "chore: 移除大文件"', note: '本次提交生效' },
      { command: 'git filter-repo --path <big-file> --invert-paths', note: '从全部历史中抹掉' },
      { command: 'git reflog expire --expire=now --all && git gc --prune=now', note: '回收空间' },
    ],
    warning: '改写历史后所有提交哈希变化，必须通知所有协作者重新克隆；建议以后用 Git LFS 或 .gitattributes 过滤。',
  },
  {
    id: 'update-branch-from-main',
    title: '特性分支跟上主干最新代码',
    keywords: ['同步主干', 'update', 'rebase main', '跟上', '落后主干', '合并主干'],
    summary: '共享分支用 merge，私有分支用 rebase。',
    steps: [
      { command: 'git status -sb', note: '确认没有未提交改动' },
      { command: 'git fetch origin', note: '更新远端引用' },
      { command: 'git rebase origin/main', note: '私有/未推送分支：保持线性历史' },
      { command: 'git push --force-with-lease', note: '若之前推送过，需要改写推送' },
    ],
    warning: '已经推送给同事一起开发的分支不要 rebase，改用 git merge origin/main。',
  },
  {
    id: 'clean-untracked',
    title: '清理未跟踪文件与分支',
    keywords: ['清理', '删除', '未跟踪', 'untracked', '临时文件', 'cleanup'],
    summary: '预览 + 确认后再删。',
    steps: [
      { command: 'git clean -nd', note: '-n 是 dry-run，只打印不删除，务必先跑' },
      { command: 'git clean -ndx', note: '连被忽略的文件也列出来看看' },
      { command: 'git clean -fd', note: '确认无误后删除未跟踪的目录与文件' },
      { command: 'git branch --merged main | grep -v main | xargs -r git branch -d', note: '批量删除已合并分支' },
    ],
    warning: 'git clean -fd 不可撤销；没有 -n 预览过不要执行，-x 会连 node_modules、.env 一起删掉。',
  },
  {
    id: 'tag-release',
    title: '打标签发布一个版本',
    keywords: ['发布', 'release', 'tag', '打标签', '版本号', '语义化版本'],
    summary: '在确定的提交上打注解标签并推送。',
    steps: [
      { command: 'git switch main && git pull --ff-only', note: '确保主干是最新且线性' },
      { command: 'git tag -a v1.4.0 -m "release v1.4.0"', note: '注解标签包含提交者、时间与说明' },
      { command: 'git tag -s v1.4.0 -m "signed" ', note: '需要强验证时用 GPG 签名标签' },
      { command: 'git push origin main --follow-tags', note: '一起推送分支与标签' },
      { command: 'git describe --tags --always', note: '给构建制品生成版本号' },
    ],
  },
  {
    id: 'delete-remote-branch',
    title: '删除远端或本地分支',
    keywords: ['删除分支', '清理分支', 'delete branch', '远程分支'],
    summary: '先确认已合并，再删；强删前务必备份。',
    steps: [
      { command: 'git branch --merged main', note: '确认要删的分支已合并' },
      { command: 'git branch -d <branch>', note: '安全删除，未合并会被拒绝' },
      { command: 'git push origin --delete <branch>', note: '删除远端分支' },
      { command: 'git fetch --prune', note: '清理本地残留的远程跟踪引用' },
    ],
    warning: '-D 强删会让未合并提交变成悬空对象；先 git tag backup/<name> <sha> 保命。',
  },
  {
    id: 'nested-repo-submodule',
    title: '克隆后子模块目录是空的',
    keywords: ['子模块', 'submodule', '空目录', '依赖拉不到', 'nested'],
    summary: '子模块默认不会被自动克隆，需要显式初始化。',
    steps: [
      { command: 'git submodule status', note: '查看子模块指针状态' },
      { command: 'git submodule update --init --recursive', note: '初始化并递归更新所有层级' },
      { command: 'git submodule sync --recursive', note: '远端地址变更后同步 URL' },
    ],
    warning: '漏掉 --recursive 是最常见的坑：嵌套子模块仍然缺失。',
  },
  {
    id: 'resolve-lockfile-conflict',
    title: '解决 lock 文件冲突',
    keywords: ['lock', '锁文件', 'yarn.lock', 'package-lock', '依赖冲突', '冲突'],
    summary: '锁文件不要手合并，选一边再重新生成。',
    steps: [
      { command: 'git checkout --ours package-lock.json', note: '或 --theirs，锁文件应当由工具重新生成而非人工合并' },
      { command: 'git add package-lock.json', note: '标记为已解决' },
      { command: 'rm -rf node_modules && npm ci', note: '按锁文件重新安装' },
      { command: 'git commit -m "chore: 解决依赖冲突"', note: '提交' },
    ],
    warning: '三方合并 lock 文件会产生既不匹配 A 也不匹配 B 的诡异状态；正确做法是取一侧后重新生成。',
  },
  {
    id: 'multi-worktree-parallel',
    title: '同时在两个分支上工作',
    keywords: ['worktree', '多工作区', '并行', '同时', '两个分支', '紧急修复'],
    summary: '用 worktree 而不是反复 stash + switch。',
    steps: [
      { command: 'git worktree add ../hotfix main', note: '为 main 开一个独立目录' },
      { command: 'git worktree add -b hotfix/urgent ../urgent-feature', note: '同时创建分支' },
      { command: 'git worktree list', note: '查看所有工作区' },
      { command: 'git worktree remove ../hotfix', note: '用完移除' },
      { command: 'git worktree prune', note: '手动删过目录后清理记录' },
    ],
    warning: '同一个分支不能被两个工作区同时检出，需要先切换其中一个的分支。',
  },
  {
    id: 'review-diff-of-mr',
    title: '评审一个合并请求的改动',
    keywords: ['评审', 'review', '合并请求', 'MR', 'PR', '看改动', '代码审查'],
    summary: '先看范围，再逐文件看补丁，最后看作者与提交意图。',
    steps: [
      { command: 'git fetch origin pull/123/head:pr-123', note: '把 MR 拉成本地分支' },
      { command: 'git diff --stat origin/main...pr-123', note: '看改动规模' },
      { command: 'git log --oneline origin/main..pr-123', note: '看提交是否被合理切分' },
      { command: 'git diff origin/main...pr-123', note: '逐行看补丁' },
      { command: 'git diff --check origin/main...pr-123', note: '检查空白错误与冲突标记' },
    ],
  },
  {
    id: 'first-time-contributor',
    title: '第一次给开源项目提 PR',
    keywords: ['开源', '贡献', 'PR', '第一次', 'fork', 'contribute'],
    summary: 'fork、同步上游、干净分支、只改一件事。',
    steps: [
      { command: 'git remote add upstream https://github.com/original/repo.git', note: '添加上游仓库' },
      { command: 'git fetch upstream && git switch -c fix/typo main', note: '基于最新主干开分支' },
      { command: 'git commit -m "fix: 修正 README 拼写"', note: '一个 PR 只做一件事' },
      { command: 'git push -u origin fix/typo', note: '推送到自己的 fork' },
      { command: 'git rebase upstream/main', note: '合入前同步上游' },
    ],
  },
  {
    id: 'ci-verify-no-diff',
    title: 'CI 中判断代码是否变化',
    keywords: ['CI', '流水线', '判断改动', 'no diff', '是否变化', '缓存'],
    summary: '用退出码而不是解析文本。',
    steps: [
      { command: 'git diff --quiet origin/main...HEAD', note: '有差异退出码 1，无差异 0' },
      { command: 'git diff --name-only origin/main...HEAD', note: '拿到变更文件列表' },
      {
        command: 'test -z "$(git diff --name-only origin/main...HEAD -- src/)" || npm run build',
        note: '只在关键目录变动时构建',
      },
      { command: 'git log --format="%H %an %s" origin/main..HEAD > changes.txt', note: '生成变更说明供 PR 评论使用' },
    ],
    warning: '不要用 git log | head 之类的输出解析做判断，分页器与颜色会污染文本。',
  },
  {
    id: 'restore-single-file-from-old-commit',
    title: '从历史版本取回某个文件',
    keywords: ['取回文件', '恢复文件', '旧版本', '找回文件', '误删文件'],
    summary: '只把某文件从旧提交取回，不动其他历史。',
    steps: [
      { command: 'git log --oneline -- <file>', note: '找到文件最后一次正确版本' },
      { command: 'git checkout <commit> -- <file>', note: '把该文件取回工作区与暂存区' },
      { command: 'git diff --staged -- <file>', note: '确认只改了这一个文件' },
      { command: 'git commit -m "fix: 恢复被误删的文件"', note: '提交' },
    ],
    warning: '若误删发生在历史中，还需要 rebase 或 git revert 才能真正从仓库里消除删除记录。',
  },
  {
    id: 'hide-and-search-secret',
    title: '确认历史里是否泄露过密钥',
    keywords: ['搜索历史', '泄露检查', 'git grep', '审计', '密钥扫描', '历史搜索'],
    summary: '在所有历史版本中搜索敏感串。',
    steps: [
      { command: 'git log --all --full-history -- "**/.env"', note: '找出曾提交过的环境变量文件' },
      {
        command: 'git grep -n -i -E "(api[_-]?key|secret|password|token)" $(git rev-list --all) | head -50',
        note: '逐个历史版本搜索关键词',
      },
      { command: 'git log -S"AKIA" --oneline --all', note: '按内容 pickaxe 精确定位' },
      { command: 'git filter-repo --invert-paths --path .env', note: '确证后清理历史并通知协作者' },
    ],
    warning: '历史里出现过的任何密钥都必须视为已泄露并吊销，清理历史只是善后。',
  },
];

export interface ScenarioMatch {
  scenario: GitScenario;
  score: number;
}

/** 场景匹配：以标题/摘要为高权重，关键词逐个命中累计得分。 */
export function matchScenarios(query: string): ScenarioMatch[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const scored: ScenarioMatch[] = [];
  for (const scenario of GIT_SCENARIOS) {
    let score = 0;
    if (scenario.title.toLowerCase().includes(q)) score += 12;
    if (scenario.summary.toLowerCase().includes(q)) score += 5;
    for (const keyword of scenario.keywords) {
      if (q.includes(keyword.toLowerCase())) score += 4;
      else if (keyword.toLowerCase().includes(q)) score += 2;
    }
    for (const step of scenario.steps) {
      if (step.note.toLowerCase().includes(q)) score += 1;
    }
    if (score > 0) scored.push({ scenario, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.scenario.title.localeCompare(b.scenario.title, 'zh-CN'));
}

/* ── git log --graph 解析 ─────────────────────────────────────── */

/** `--graph` 输出里每条 lane 的字符宽度。 */
const LANE_WIDTH = 2;

export interface GraphRow {
  /** 行内唯一序号，用于渲染时的稳定 key。 */
  id: number;
  /** 原始文本行。 */
  raw: string;
  /** 本行出现过的 lane 编号（升序）。 */
  lanes: number[];
  /** 本行 commit 信息，合并提交行（Merge ...）没有 commit。 */
  commit: { hash: string; label: string; lane: number } | null;
  /** 括号里的引用，如 HEAD -> main, origin/main。 */
  refs: string[];
  /** `\` 换行：在下一行向 (lane+1) 分叉。 */
  forks: number[];
  /** `/` 汇合：在下一行并入 lane-1。 */
  merges: number[];
  /** 合并提交标题行。 */
  isMerge: boolean;
}

export interface GraphParseResult {
  rows: GraphRow[];
  /** 出现过的所有引用名（含 HEAD），用于配色。 */
  refs: string[];
  warnings: string[];
}

const GRAPH_CHARS = new Set(['|', '/', '\\', '*', ' ']);

/** 把图形前缀与文本部分分开：图形只由 | / \\ * 与空格组成。 */
function splitGraphLine(line: string): { graph: string; text: string } {
  let index = 0;
  while (index < line.length && GRAPH_CHARS.has(line[index] as string)) index += 1;
  return { graph: line.slice(0, index), text: line.slice(index) };
}

function parseHash(text: string): { hash: string; label: string } {
  const match = /^[|*\\/ ]*([0-9a-f]{4,40})\s*(.*)$/.exec(text);
  if (match === null) return { hash: '', label: text.trim() };
  return { hash: match[1] as string, label: (match[2] ?? '').trim() };
}

function extractRefs(text: string): string[] {
  const out: string[] = [];
  const re = /\(([^()]*)\)/g;
  let match = re.exec(text);
  while (match !== null) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part.trim().replace(/^HEAD -> /, '');
      if (name !== '') out.push(name);
    }
    match = re.exec(text);
  }
  return out;
}

/**
 * 解析 `git log --graph --oneline --decorate`（或 `--pretty=oneline`）的文本输出。
 * 采用与 Git 一致的 lane 语义：每列 2 个字符一条 lane，
 * `\` 表示本行 lane n 在下一行分叉出 lane n+1，`/` 表示 lane n+1 在下一行并入 lane n。
 */
export function parseGitGraph(text: string): GraphParseResult {
  const rows: GraphRow[] = [];
  const warnings: string[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const { graph, text: rest } = splitGraphLine(raw);
    const isMerge = /^Merge\s/.test(rest.trim()) || /^commit\s/.test(rest.trim());
    const commitMatch = /[*]/.test(graph);
    const forks: number[] = [];
    const merges: number[] = [];
    const lanes: number[] = [];
    let commit: GraphRow['commit'] = null;

    for (let i = 0; i < graph.length; i += 1) {
      const char = graph[i] as string;
      const lane = Math.floor(i / LANE_WIDTH);
      if (char === '*') {
        lanes.push(lane);
        if (commit === null) {
          if (commitMatch) {
            const parsed = parseHash(rest);
            commit = { hash: parsed.hash, label: parsed.label, lane };
          } else {
            commit = { hash: '', label: rest.trim(), lane };
          }
        }
      } else if (char === '\\') {
        if (lane > 0) {
          forks.push(lane - 1);
          lanes.push(lane);
        }
      } else if (char === '/') {
        if (lane > 0) {
          merges.push(lane - 1);
          lanes.push(lane);
        }
      } else if (char === '|') {
        lanes.push(lane);
      }
    }

    const uniqueLanes = [...new Set(lanes)].sort((a, b) => a - b);
    if (uniqueLanes.length === 0 && rest.trim() !== '') {
      warnings.push(`第 ${rows.length + 1} 行无法识别图形前缀：${raw.trim().slice(0, 60)}`);
    }
    const refs = extractRefs(rest);
    if (!commit && !isMerge && rest.trim() !== '' && refs.length === 0) {
      // 非 commit 行（如 "|\"）不应产生 commit，但空 lane 时给出提示即可。
    }

    rows.push({
      id: rows.length,
      raw,
      lanes: uniqueLanes,
      commit,
      refs,
      forks: [...new Set(forks)],
      merges: [...new Set(merges)],
      isMerge: isMerge && commit === null,
    });
  }

  const refs = [...new Set(rows.flatMap((row) => row.refs))];
  if (rows.length === 0)
    warnings.push('没有可解析的内容，请粘贴 `git log --graph --oneline --decorate --all` 的输出。');
  return { rows, refs, warnings };
}

/* ── 简易图示 DSL ─────────────────────────────────────────────── */

/**
 * 列式 DSL：以「每行一条 lane」描述提交在时间轴上的分布。
 *   main       ●───●───●
 *   feature         ┌───●───●
 *   hotfix              └───────●
 * 规则：
 *   ● 提交点；| │ ┌ ┐ └ ┘ 视为「该时间点这条 lane 存在」的占位；
 *   横线连接同一 lane 上相邻的存在点，竖线连接上下相邻 lane 的同一列存在点。
 */
export interface DslCell {
  lane: number;
  name: string;
  column: number;
  commit: boolean;
}

export interface DslGraph {
  cells: DslCell[];
  lanes: { lane: number; name: string }[];
  width: number;
  height: number;
  warnings: string[];
}

export function parseGraphDsl(text: string): DslGraph {
  const cells: DslCell[] = [];
  const lanes: { lane: number; name: string }[] = [];
  const warnings: string[] = [];
  let width = 0;

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '');
    if (line.trim() === '') continue;
    const match = /^(\S+)\s+(.*)$/.exec(line);
    if (match === null) {
      warnings.push(`无法解析的行：${raw.trim().slice(0, 40)}`);
      continue;
    }
    const name = match[1] as string;
    const body = match[2] as string;
    const lane = lanes.length;
    lanes.push({ lane, name });
    // 每个「符号 + 任意长度连接线」算一个时间列。
    const re = /([●○*]|[|│┌┐└┘])([─—\s]*)/g;
    let found = re.exec(body);
    while (found !== null) {
      const symbol = found[1] as string;
      cells.push({ lane, name, column: cells.filter((c) => c.lane === lane).length, commit: /[●○*]/.test(symbol) });
      found = re.exec(body);
    }
  }

  for (const cell of cells) width = Math.max(width, cell.column + 1);
  return { cells, lanes, width, height: lanes.length, warnings };
}

/** 依据字符串稳定分配一个颜色下标，用于分支/引用配色。 */
export function colorIndexFor(name: string, total: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return total === 0 ? 0 : hash % total;
}
