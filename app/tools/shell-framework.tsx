import { GaugeCircle, Search, Settings2, Sparkles, TerminalSquare, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock, type CodeLanguage } from '../components/ui/code-block';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

type Tab = 'framework' | 'zsh' | 'bash' | 'tips' | 'perf' | 'snippets';

const TABS: { value: Tab; label: string }[] = [
  { value: 'framework', label: '框架对比' },
  { value: 'zsh', label: 'zsh 生成器' },
  { value: 'bash', label: 'bash 生成器' },
  { value: 'tips', label: '效率技巧' },
  { value: 'perf', label: '性能优化' },
  { value: 'snippets', label: '配置片段' },
];

interface FrameworkRow {
  name: string;
  purpose: string;
  install: string;
  config: string;
  shell: string;
  activity: string;
}

function frameworkRows(lines: string[]): FrameworkRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return {
      name: parts[0] ?? '',
      purpose: parts[1] ?? '',
      install: parts[2] ?? '',
      config: parts[3] ?? '',
      shell: parts[4] ?? '',
      activity: parts[5] ?? '',
    };
  });
}

const FRAMEWORKS = frameworkRows([
  'Oh My Zsh :: zsh 框架：主题 + 插件 + 别名一次到位 :: git clone 到 $ZSH 并改 .zshrc :: .zshrc 里的 ZSH_THEME 与 plugins=() :: zsh :: 非常活跃，插件生态最大',
  'Zinit :: 轻量插件管理器，语法是「ice 修饰符 + 插件」:: git clone 后 source 一次 :: .zshrc 里的 zinit ice / zinit light :: zsh :: 非常活跃，主打性能与延迟加载',
  'Sheldon :: 框架 + Rust 写的插件管理器，配置文件是 TOML :: 官方安装脚本（先确认来源再执行）:: ~/.config/sheldon/configs.toml :: zsh / bash :: 活跃，语法树式管理',
  'Oh My Bash :: bash 版「框架」，提供主题与提示符 :: git clone 到 ~/.bash_it 后 source :: .bashrc 追加 source ~/.bash_it/bash_it.sh :: bash :: 稳定可用，更新不快',
  'starship :: 跨 shell 的提示符渲染器，取代主题框架 :: brew / winget / 官方安装脚本 :: ~/.config/starship.toml :: zsh / bash / fish / 其它 :: 非常活跃，性能好、配置统一',
  'Atuin :: 用 SQLite 存 shell 历史，自带 TUI 搜索与回放 :: brew / cargo / 官方脚本 :: ~/.config/atuin/atuin.toml（可选）:: 所有常见 shell（靠 shell 集成）:: 非常活跃，支持跨设备同步',
  'Zoxide :: 用「使用频次 + 模糊匹配」跳目录，替代 cd 导航 :: brew / cargo / 官方脚本 :: 由 source 一次初始化脚本注入 :: 所有常见 shell :: 非常活跃，Rust 写的，毫秒级',
  'fzf :: 通用的模糊查找器，文件、历史、进程都能查 :: brew / apt / 从源码编译 :: 通过 $FZF_DEFAULT_OPTS 与 shell 集成脚本 :: 所有常见 shell :: 非常活跃，事实标准',
  'skim :: Rust 写的 fzf 替代品，启动更快、跨平台 :: cargo / brew :: ~/.skimrc :: bash / zsh :: 活跃，与 fzf 键位基本兼容',
  'direnv :: 进入目录时自动加载/卸载该目录的环境变量 :: brew / apt / pacman :: 每个项目根目录一个 .envrc :: 所有常见 shell :: 非常活跃，权限模型是 allow 列表',
  'nvm :: Node.js 版本管理（生态最久）:: curl 官方脚本（先看内容再执行）:: ~/.nvm/ 目录与环境变量 :: bash / zsh / fish :: 非常活跃',
  'fnm :: Rust 写的 Node 版本管理，切换比 nvm 快一个数量级 :: brew / cargo / winget :: 无文件配置，靠环境变量与默认别名 :: 所有 shell :: 非常活跃',
  'volta :: Node 版本 + 工具链管理，版本写进 package.json 的 volta 字段 :: 官方安装脚本 :: package.json 的 volta 段 :: 所有 shell（无 hook）:: 活跃，团队协作友好',
  'asdf :: 多语言版本管理（Node/Python/Go/Ruby…）:: git clone + asdf plugin add :: 每个项目一个 .tool-versions :: 所有 shell :: 活跃，性能一般',
  'mise :: asdf 的活跃继任者，兼容 .tool-versions，写法更快 :: brew / curl / cargo :: mise.toml :: 所有 shell :: 非常活跃，支持 tasks 与 env 指令',
  'pyenv :: Python 版本管理（配合 pyenv-virtualenv）:: brew / git clone :: 每个项目一个 .python-version :: bash / zsh :: 非常活跃',
  'rbenv :: Ruby 版本管理（配合 ruby-build）:: git clone + git clone ruby-build :: 每个项目一个 .ruby-version :: bash / zsh :: 活跃，Ruby 社区标准方案',
  'thefuck :: 根据错误信息推荐正确命令 :: pipx / brew :: 可选的自定义规则目录 :: bash / zsh / fish :: 活跃，安装脚本需自查（历史上有过恶意代码）',
  'zsh-autosuggestions :: 根据历史输入给出灰色建议，右方向键接受 :: git clone + source :: 无（纯插件，靠 git 版本升级）:: zsh :: 非常活跃',
  'zsh-syntax-highlighting :: 命令行语法着色 :: git clone + source（须在 compinit 之后）:: 无 :: zsh :: 非常活跃',
  'zsh-completions :: 补全函数集合（补充系统自带缺失的）:: git clone + fpath + compinit :: 无 :: zsh :: 非常活跃',
  'zsh 原生 compinit + zstyle :: 自带补全系统：菜单、补全策略、忽略大小写 :: 内置（无需安装）:: .zshrc 里的 zstyle 段 :: zsh :: 官方维护，能力被严重低估',
  'bash-completion :: bash 的补全脚本库（git、docker、kubectl 等）:: brew / apt，或从源码 make install :: .bashrc 里 source /usr/share/bash-completion/bash_completion :: bash :: 非常活跃',
  'bash-completion@2 :: bash-completion 的新分支，支持补全菜单与可编程 API :: 同上 :: 同上 :: bash :: 活跃，bash 5 之后的补全体验明显更好',
  'Fish :: 另一个 shell，语法与配置方式都不同（set / functions）:: brew / apt / 官方安装包 :: ~/.config/fish/config.fish :: fish :: 活跃，自带补全、语法高亮与历史搜索',
  'PowerShell PSReadLine :: PowerShell 的行编辑：补全、预测、预测视图、多行编辑 :: PowerShell 5.1+ 内置 :: $PROFILE :: powershell / pwsh :: 官方活跃，值得配置',
  'with fig（Fig）:: 给各种 CLI 提供图形化自动补全规范 :: 需安装 fig / with 应用并注册账号 :: specs 目录（在应用里管理）:: 跨 shell（生成 bash/zsh/fish 片段）:: 商业化中，改名 with 后以闭源为主',
  'tldr :: 社区维护的命令速查页，只讲「怎么用」:: brew / apt / npm :: 无（内容在仓库里）:: 所有 shell :: 活跃，适合忘记参数时快速查',
  'command-not-found（Homebrew）:: 输入不存在的命令时提示「装它就能用」:: brew 自带 :: 无 :: 所有 shell :: 活跃，macOS 上很顺手',
  'Atuin / 传统 HISTFILE 之外的选择 :: 多终端共享历史的轻量方案 :: 用 tmux 或 zoxide 组合替代 :: 无 :: 任意 :: 活跃，方案层面值得比较',
]);

const FRAMEWORK_COLUMNS: { key: keyof FrameworkRow; label: string }[] = [
  { key: 'purpose', label: '作用' },
  { key: 'install', label: '安装方式' },
  { key: 'config', label: '配置文件' },
  { key: 'shell', label: '适用 shell' },
  { key: 'activity', label: '活跃度' },
];

// ── 配置生成 ──────────────────────────────────────────────────────────

type PluginManager = 'oh-my-zsh' | 'zinit' | 'sheldon' | 'none';

const PLUGIN_MANAGERS: { value: PluginManager; label: string }[] = [
  { value: 'oh-my-zsh', label: 'Oh My Zsh（框架 + 插件）' },
  { value: 'zinit', label: 'Zinit（插件管理器）' },
  { value: 'sheldon', label: 'Sheldon（TOML 声明式）' },
  { value: 'none', label: '不用插件管理器（手动 source）' },
];

const ZSH_THEMES = [
  { value: 'powerlevel10k/powerlevel10k', label: 'powerlevel10k（功能最全，需 Nerd Font）' },
  { value: 'robbyrussell', label: 'robbyrussell（经典两段式）' },
  { value: 'agnoster', label: 'agnoster（箭头 + git 分支）' },
  { value: 'af-magic', label: 'af-magic（ASCII 风格）' },
  { value: 'starship', label: 'starship（不是主题，跨 shell 提示符）' },
];

const FS_OPTIONS = [
  { value: '/usr/local/bin', label: '/usr/local/bin（Intel mac / Homebrew 默认）' },
  { value: '/opt/homebrew/bin', label: '/opt/homebrew/bin（Apple Silicon Homebrew）' },
  { value: '$HOME/.local/bin', label: '~/.local/bin（pip --user、自编译）' },
  { value: '$HOME/bin', label: '~/bin（自建脚本）' },
  { value: '$HOME/.cargo/bin', label: '~/.cargo/bin（Rust 工具链）' },
  { value: '$HOME/.local/share/mise/shims', label: 'mise shims' },
  { value: '$HOME/.nvm/versions/node/*/bin', label: 'nvm 的 node 目录（不建议直接写死）' },
];

interface ZshOptions {
  pathDirs: string[];
  aliases: boolean;
  history: boolean;
  completion: boolean;
  pluginManager: PluginManager;
  theme: string;
  keybindings: boolean;
  functions: boolean;
  fzf: boolean;
  zoxide: boolean;
  starship: boolean;
}

const DEFAULT_ZSH: ZshOptions = {
  pathDirs: ['$HOME/.local/bin', '/opt/homebrew/bin'],
  aliases: true,
  history: true,
  completion: true,
  pluginManager: 'oh-my-zsh',
  theme: 'powerlevel10k/powerlevel10k',
  keybindings: true,
  functions: true,
  fzf: true,
  zoxide: true,
  starship: true,
};

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function buildZshrc(o: ZshOptions): string {
  const lines: string[] = ['# 由「Shell 增强框架导航」生成的 ~/.zshrc', ''];

  if (o.pathDirs.length > 0) {
    lines.push('# ---------- PATH ----------');
    lines.push('# 建议：把含敏感信息或临时目录的路径删掉，再合并到一行 PATH=... 里');
    for (const dir of o.pathDirs) lines.push(`export PATH="${dir}:$PATH"`);
    lines.push('typeset -U path PATH            # 去掉重复项');
    lines.push('path=($path[2,-1] $path[1])     # 把 ~/bin 之类挪到最前');
    lines.push('');
  }

  lines.push('# ---------- 基础 ----------');
  lines.push('setopt no_beep                   # 补全时不响铃');
  lines.push('setopt auto_cd                   # 直接输目录名就 cd');
  lines.push('setopt interactive_comments     # 交互式也允许 # 注释');
  lines.push('export EDITOR=nvim');
  lines.push('export VISUAL="$EDITOR"');
  lines.push('export LESS="-R -F -X"           # less 保留颜色、退出时不清屏');
  lines.push('');

  if (o.history) {
    lines.push('# ---------- 历史 ----------');
    lines.push('HISTFILE=~/.zsh_history');
    lines.push('HISTSIZE=50000');
    lines.push('SAVEHIST=50000');
    lines.push('setopt HIST_IGNORE_DUPS          # 连续重复的命令只留一条');
    lines.push('setopt HIST_IGNORE_ALL_DUPS     # 任意位置的重复都去掉');
    lines.push('setopt HIST_REDUCE_BLANKS       # 存历史前删多余空格');
    lines.push('setopt HIST_IGNORE_SPACE        # 空格开头的命令不记');
    lines.push('setopt SHARE_HISTORY            # 多个终端共享历史');
    lines.push('');
  }

  if (o.aliases) {
    lines.push('# ---------- 别名 ----------');
    lines.push('# -g 让别名在所有上下文生效（含脚本里的非交互 shell，注意副作用）');
    lines.push("alias -g ll='ls -alh --color=auto'");
    lines.push("alias -g la='ls -A'");
    lines.push("alias ..='cd ..'");
    lines.push("alias -- -='cd -'");
    lines.push("alias -g g='git'");
    lines.push("alias -g gst='git status -sb'");
    lines.push("alias -g gd='git diff'");
    lines.push("alias -g gl='git log --oneline --graph --decorate -20'");
    lines.push("alias -g mk='mkdir -p'");
    lines.push("alias -g cat='bat --paging=never' 2>/dev/null || alias cat='cat'");
    lines.push("alias -g grep='grep --color=auto'");
    lines.push("alias -g ..g='cd ../'  # 常用：跳到 git 仓库根");
    lines.push('');
  }

  if (o.completion) {
    lines.push('# ---------- 补全 ----------');
    lines.push('autoload -Uz compinit');
    lines.push('compinit -d "$HOME/.cache/zcompdump"   # 缓存放到 XDG 目录');
    lines.push('zstyle ":completion:*" menu select');
    lines.push('zstyle ":completion:*" matcher-list \\');
    lines.push('  "m:{a-zA-Z}={A-Za-z}" \\');
    lines.push('  "r:|=*" "l:|=*" "r:|=*")');
    lines.push('zstyle ":completion:*" list-colors "${(s.:.)LS_COLORS}"');
    lines.push('zstyle ":completion:*" group-name ""');
    lines.push('zstyle ":completion:*:descriptions" format "[%d] %F{red}%f%F{reset}]"');
    lines.push('');
  }

  lines.push('# ---------- 插件 ----------');
  if (o.pluginManager === 'oh-my-zsh') {
    lines.push('# 安装：git clone https://github.com/ohmyzsh/ohmyzsh.git $HOME/.oh-my-zsh');
    lines.push('export ZSH="$HOME/.oh-my-zsh"');
    lines.push('ZSH_THEME="robbyrussell"');
    lines.push('plugins=(git z sudo extract web-search copypath copypaste)');
    lines.push('source $ZSH/oh-my-zsh.sh');
    lines.push('compinit');
    lines.push('# 主题单独 source（放在 compinit 之后）');
    lines.push(`source "\${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/${o.theme}.zsh-theme"`);
  } else if (o.pluginManager === 'zinit') {
    lines.push('# 安装：git clone https://github.com/zdharma-continuum/zinit.git $HOME/.local/share/zinit/zinit.git');
    lines.push('ZINIT_HOME="${HOME}/.local/share/zinit/zinit"');
    lines.push('source "${ZINIT_HOME}/zinit.zsh"');
    lines.push('autoload -Uz _zinit');
    lines.push('(( ${+_comps} )) && _comps[zinit]=_zinit');
    lines.push('');
    lines.push('# ice 修饰符：atclone 只在首次安装时执行，nocomp 关闭补全加载');
    lines.push('zinit ice as"null" lucid from"gh-r"');
    lines.push('zinit light zsh-users/zsh-autosuggestions');
    lines.push('zinit ice as"program" pick"fzf"');
    lines.push('zinit light junegunn/fzf');
    lines.push('zinit ice wait lucid');
    lines.push(`zinit light ${o.theme.includes('/') ? `romkatv/${o.theme.split('/')[0]}` : o.theme}`);
  } else if (o.pluginManager === 'sheldon') {
    lines.push('# 安装：sheldon init --shell zsh，然后编辑 ~/.config/sheldon/configs.toml');
    lines.push('eval "$(sheldon init zsh)"');
    lines.push('# configs.toml 示例：');
    lines.push('#   [plugins]');
    lines.push('#   zsh-autosuggestions = "zdharma-continuum/zsh-autosuggestions"');
    lines.push('#   zsh-syntax-highlighting = "zdharma-continuum/zsh-syntax-highlighting"');
    lines.push('');
  } else {
    lines.push('# 手动 source 插件（全部放最后，加载顺序有讲究）');
    lines.push('source ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh');
    lines.push('# 注意：zsh-syntax-highlighting 必须在 compinit 之后、其它插件之前 source');
  }
  lines.push('');

  if (o.theme === 'starship' || o.starship) {
    lines.push('# ---------- 提示符 ----------');
    if (o.starship) {
      lines.push('# 安装 starship 后只需 init，不再需要主题');
      lines.push('eval "$(starship init zsh)"');
    } else {
      lines.push('# powerlevel10k 需要先 clone 到自定义主题目录：');
      lines.push('source ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k/powerlevel10k.zsh-theme');
      lines.push('[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh');
    }
    lines.push('');
  }

  if (o.keybindings) {
    lines.push('# ---------- 键位 ----------');
    lines.push('# 用 bindkey 而不是 bindkey -v，保留默认 Emacs 键位的同时加自定义');
    lines.push('bindkey -e');
    lines.push("bindkey '^[[A' history-substring-search-up    # 上箭头按已输入前缀搜历史");
    lines.push("bindkey '^[[B' history-substring-search-down");
    lines.push("bindkey '^[[Z' undo                            # Ctrl+");
    lines.push("bindkey '^R'   history-beginning-search-backward");
    lines.push("bindkey '^[b'  backward-word                   # Alt+b");
    lines.push("bindkey '^[f'  forward-word");
    lines.push('');
  }

  if (o.functions) {
    lines.push('# ---------- 函数 ----------');
    lines.push('mkcd() { mkdir -p "$1" && cd "$1"; }');
    lines.push('extract() {');
    lines.push('  case "$1" in');
    lines.push('    *.tar.bz2) tar xjf "$1" ;;');
    lines.push('    *.tar.gz|*.tgz) tar xzf "$1" ;;');
    lines.push('    *.tar) tar xf "$1" ;;');
    lines.push('    *.zip) unzip "$1" ;;');
    lines.push('    *.7z) 7z x "$1" ;;');
    lines.push('    *.rar) unrar x "$1" ;;');
    lines.push('    *.deb) dpkg -i "$1" ;;');
    lines.push('    *) echo "不支持的格式: $1" ;;');
    lines.push('  esac');
    lines.push('}');
    lines.push('greet() { printf "你好，%s\\n" "$(whoami)"; }');
    lines.push('mkf() { mkdir -p "$(dirname "$1")" && touch "$1"; }   # 递归建空文件');
    lines.push('');
  }

  if (o.fzf) {
    lines.push('# ---------- fzf 集成 ----------');
    lines.push('# 安装后运行：$(brew info fzf --json | jq -r ".formula[0].caveats") 里给出的 eval "$(fzf --zsh)"');
    lines.push('eval "$(fzf --zsh)"');
    lines.push('export FZF_DEFAULT_OPTS="--height 50% --layout=reverse --border rounded --info=inline"');
    lines.push('export FZF_DEFAULT_COMMAND="fd --type f --strip-cwd-prefix"');
    lines.push('export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"');
    lines.push('export FZF_ALT_C_COMMAND="ps -ef --forest | head -n $((${FZF_CTRL_T_HEIGHT:-20}))"');
    lines.push('export FZF_CTRL_R_OPTS="--preview \'echo {}\' --preview-window=down:3:wrap:hidden"');
    lines.push('');
  }

  if (o.zoxide) {
    lines.push('# ---------- zoxide 集成 ----------');
    lines.push('eval "$(zoxide init zsh)"');
    lines.push('# 常用：z 目录名（模糊跳转）、zi 关键词（先搜目录再搜文件）');
    lines.push('alias cd=z');
    lines.push('alias cdd=z');
    lines.push('');
  }

  lines.push('# ---------- 启动性能 ----------');
  lines.push('# 如果启动慢，打开 zprof 看耗时分布：');
  lines.push('#   在文件最前面加 zmodload zsh/zprof; zprof');
  lines.push('#   在文件最后面加 zprof');
  lines.push('# 也可以用 zsh -x 打印每条命令来定位慢在哪一行');

  return lines.join('\n');
}

interface BashOptions {
  aliases: boolean;
  history: boolean;
  completion: boolean;
  prompt: boolean;
  shopt: boolean;
  functions: boolean;
  extglob: boolean;
  promptCommand: boolean;
  startUp: string;
}

const DEFAULT_BASH: BashOptions = {
  aliases: true,
  history: true,
  completion: true,
  prompt: true,
  shopt: true,
  functions: true,
  extglob: true,
  promptCommand: false,
  startUp: '',
};

function buildBashrc(o: BashOptions): string {
  const lines: string[] = ['# 由「Shell 增强框架导航」生成的 ~/.bashrc（非交互 shell 不会读这个文件）', ''];

  if (o.shopt) {
    lines.push('# ---------- shopt ----------');
    lines.push('shopt -s histappend        # 历史追加而不是覆盖（多终端共享时必开）');
    lines.push('shopt -s histverify        # 命令执行前用历史展开，避免误操作');
    lines.push('shopt -s cdspell           # cd 拼错目录时提示最接近的');
    lines.push('shopt -s nocaseglob        # 通配符忽略大小写');
    lines.push('shopt -s checkwinsize      # 窗口尺寸变化后重算列数');
    lines.push('shopt -s globstar          # 支持 ** 递归通配（配合 bash-completion 很好用）');
    lines.push('shopt -s autocd            # 直接输目录名就 cd');
    lines.push('shopt -s dirspell');
    lines.push('');
  }

  if (o.extglob) {
    lines.push('# ---------- extglob ----------');
    lines.push('# 开启后可以用 !(pattern)、?(pattern)、+(pattern) 这类扩展通配');
    lines.push('shopt -s extglob');
    lines.push('for f in !(README*); do echo "$f"; done');
    lines.push('');
  }

  if (o.history) {
    lines.push('# ---------- 历史 ----------');
    lines.push('HISTSIZE=50000');
    lines.push('HISTFILESIZE=100000');
    lines.push('HISTCONTROL=ignoreboth:erasedups   # 连续重复不记 & 退出时清掉旧历史');
    lines.push('HISTIGNORE="ls:ll:pwd:exit:clear:bg:fg:history"');
    lines.push('shopt -s histappend');
    lines.push('PROMPT_COMMAND="history -a"          # 把内存里的历史立刻写盘');
    lines.push('bind "\\e[A": history-search-backward   # 上箭头按前缀搜（需要 ~/.inputrc）');
    lines.push('bind "\\e[B": history-search-forward');
    lines.push('');
  }

  if (o.aliases) {
    lines.push('# ---------- 别名 ----------');
    lines.push("alias ls='ls -h --color=auto'");
    lines.push("alias ll='ls -alh --color=auto'");
    lines.push("alias ..='cd ..'");
    lines.push("alias grep='grep --color=auto'");
    lines.push('alias ..g="cd $(git rev-parse --show-toplevel 2>/dev/null || echo .)"');
    lines.push('# 需要 sudo 的命令用别名，sudo 会读 secure_path，别名不一定生效');
    lines.push("alias reboot='sudo systemctl reboot'");
    lines.push('');
  }

  if (o.completion) {
    lines.push('# ---------- 补全 ----------');
    lines.push('# Debian/Ubuntu：source /usr/share/bash-completion/bash_completion');
    lines.push('# macOS (brew)：brew install bash-completion@2');
    lines.push('if [ -f /usr/share/bash-completion/bash_completion ]; then');
    lines.push('  source /usr/share/bash-completion/bash_completion');
    lines.push('elif [ -f "$(brew --prefix)/etc/profile.d/bash_completion.sh" ]; then');
    lines.push('  source "$(brew --prefix)/etc/profile.d/bash_completion.sh"');
    lines.push('fi');
    lines.push('bind "set completion-ignore-case on"');
    lines.push('bind "TAB:menu-complete"'); // 连按两次 Tab 显示候选列表
    lines.push('bind "set show-all-if-ambiguous on"');
    lines.push('');
  }

  if (o.prompt) {
    lines.push('# ---------- PS1 ----------');
    lines.push('# 用 \\[ \\] 包住非打印字符，否则光标位置会算错');
    lines.push('# 颜色：\\e[0m 复位，\\e[1;32m 亮绿，\\e[34m 蓝，\\e[33m 黄');
    lines.push('PS1="\\[\\e[1;32m\\]\\u@\\h\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ "');
    lines.push('# 右侧显示 git 分支（配 vcs_prompt 钩子）');
    lines.push(
      'PS1="\\[\\e[1;32m\\]\\u@\\h\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[33m\\]\\$(git branch --show-current 2>/dev/null | sed "s/^/ (\\\\)/")\\[\\e[0m\\]\\$ "',
    );
    lines.push('');
  }

  if (o.promptCommand) {
    lines.push('# ---------- PROMPT_COMMAND ----------');
    lines.push('# 每次显示提示符前执行一次，适合放耗时几百毫秒以内的检查');
    lines.push('PS1_TEMP=$PS1');
    lines.push(
      'PROMPT_COMMAND=\'PS1="${PS1_TEMP}"; if [ -z "${VIRTUAL_ENV:-}" ]; then unset PYTHON_VIRTUAL_ENV; else PYTHON_VIRTUAL_ENV="($(basename "$VIRTUAL_ENV")) "; fi\'',
    );
    lines.push('unset PS1_TEMP');
    lines.push('');
  }

  if (o.functions) {
    lines.push('# ---------- 函数 ----------');
    lines.push('mkcd() { mkdir -p "$1" && cd "$1"; }');
    lines.push('extract() {');
    lines.push('  case "$1" in');
    lines.push('    *.tar.bz2) tar xjf "$1" ;;');
    lines.push('    *.tar.gz|*.tgz) tar xzf "$1" ;;');
    lines.push('    *.zip) unzip "$1" ;;');
    lines.push('    *.deb) dpkg -i "$1" ;;');
    lines.push('    *) echo "不支持的格式: $1" ;;');
    lines.push('  esac');
    lines.push('}');
    lines.push('');
  }

  lines.push('# ---------- 别忘了收尾 ----------');
  lines.push('export PATH="$HOME/.local/bin:$PATH"');
  if (o.startUp) lines.push(`# 启动时执行：${o.startUp}`);

  return lines.join('\n');
}

// ── 技巧速查 ──────────────────────────────────────────────────────────

interface TipRow {
  action: string;
  zsh: string;
  bash: string;
  note: string;
}

function tipRows(lines: string[]): TipRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return { action: parts[0] ?? '', zsh: parts[1] ?? '', bash: parts[2] ?? '', note: parts[3] ?? '' };
  });
}

const TIPS = tipRows([
  '反向搜索历史 :: Ctrl-R（按方向键继续翻同一条历史）:: Ctrl-R :: 找一条记不清完整命令的老命令，两个 shell 一样好用',
  '按前缀搜历史 :: 先敲几个字符再按上箭头（需 history-substring-search-up）:: 先敲几个字符再按上箭头（需 ~/.inputrc）:: 记半截命令时的救命功能',
  '补全文件名 :: Tab（再按一次显示候选列表）:: Tab（按两下显示菜单）:: 需要 compinit / bash-completion 才有候选',
  '补全命令参数 :: Tab（依赖补全函数）:: Tab（依赖 bash-completion）:: 没有补全库时基本只有文件名补全',
  '菜单式选择 :: zstyle menu select + 上下键 :: bind "TAB:menu-complete" :: 候选多时比循环按 Tab 快',
  '扩展上一个单词 :: Ctrl-W（zsh 默认）:: Ctrl-W :: 同为 backward-kill-word，行为一致',
  '替换上一个命令 :: 上箭头 + 改 + Enter（q 退出历史列表）:: 同样可用 :: 经典技巧：输错了不用重打',
  '跳到行首/行尾 :: Ctrl-A / Ctrl-E :: Ctrl-A / Ctrl-E :: 两者一致',
  '按词前后跳转 :: Alt-B / Alt-F（默认可能没绑）:: Alt-B / Alt-F（需 set -o emacs）:: zsh 建议用 bindkey -e 后再绑',
  '撤销上一次改动 :: Ctrl-_ 或 Ctrl-U（kill 整行）:: Ctrl-U :: zsh 里 Ctrl-U 是 kill 整行，Ctrl-_ 是 undo',
  '撤销整条命令的重定向 :: ！加参数变化：!! > /tmp/out :: 同（! 是 bash 与 zsh 通用的历史引用）:: !! 复用上一条命令',
  '引用上一条命令的参数 !!$ :: !!$ 表示最后一个参数 :: 同 :: !:1 / !$1 表示第一个/最后一个参数',
  '把上条命令的 stdout 存文件 :: !cmd | tee out.txt || 同 :: tee 的 || 让管道失败时也能看到错误',
  '列目录并统计大小 :: du -sh * | sort -h | tail :: 同 :: 大目录慎用 du -a，会很慢',
  '跳到 git 仓库根 :: cd $(git rev-parse --show-toplevel) :: 同 :: zoxide 也能记住目录，用 z 更省事',
  'zoxide 模糊跳目录 :: z src（模糊匹配目录名）:: 同（zoxide init bash）:: 记得先 eval "$(zoxide init zsh)"',
  'zoxide 先搜目录再搜文件 :: zi 关键词 :: 同 :: 找不到配置项时用 fd + zi 很顺手',
  'fzf 找文件并执行 :: Ctrl-T（需 shell 集成）:: Ctrl-T（需 shell 集成）:: FZF_CTRL_T_COMMAND 决定搜什么',
  'fzf 搜历史 :: Ctrl-R :: Ctrl-R :: FZF_CTRL_R_OPTS 可以加预览',
  'fzf 递归找内容 :: 搜索时用 ** 触发递归，例如 ** *.ts :: 同 :: 与 rg --glob 的效果对照记忆',
  'fzf 多选 :: 空格标记 + Tab 接受 :: 同 :: 与 --multi 绑定，批量操作文件时很有用',
  'fzf 预览 :: --preview 与 --preview-window :: 同 :: Alt-S 可以在默认布局与全屏预览之间切换',
  'direnv 免 cd 切环境 :: cd 进目录即自动 load :: 同 :: 需要 direnv allow 授权，避免任意代码执行',
  'Atuin 搜历史并回放 :: atuin search，按住 Ctrl-R 边搜边回放 :: 同 :: 需要在 shell 配置里加 eval "$(atuin --shell bash)"',
  'mise 统一版本管理 :: mise use node@lts 后写进 mise.toml :: 同 :: .tool-versions 也能共享给还在用 asdf 的同事',
  'mise 跑任务 :: mise run test（任务写进 mise.toml）:: 同 :: 把长命令收进配置文件，团队共享',
  'fnm 切 Node 版本 :: eval "$(fnm env --shell zsh)" 后 fnm use 22 :: eval "$(fnm env --shell bash)" :: 切版本比 nvm 快很多',
  'nvm 切 Node 版本 :: nvm use 22 :: nvm use 22 :: 首次使用 nvm 需要 source nvm.sh',
  '全局装包前先看体积 :: pnpm add -g --global-dir ~/.local/share/pnpm :: npm root -g && du -sh $(npm root -g) :: 定期清理免得撑爆磁盘',
  '一条命令跑起来看输出 :: 脚本结尾加 | less -R :: 同 :: -R 保留颜色，-S 不折行',
  '让命令在后台跑 :: command & disown :: command & disown :: 关闭终端后仍继续；nohup 更保险',
  '看上一次命令的退出码 :: echo $? :: echo $? :: 立刻判断，别在中间插命令',
  'debug 脚本 :: set -x（zsh 用 set -x 或 setopt xtrace）:: set -euxo pipefail :: 定位问题最快的办法',
  '快速开一个临时目录 :: mktemp -d && cd $_ :: 同 :: 配合 trap 退出时清理',
  '统计当前目录下各后缀文件数 :: fd -e ts -e js | wc -l :: 同 :: 比 find | grep 简洁',
  '把长命令变成函数 :: 写成函数放进 .zshrc/functions :: 同 :: 超过一屏长度的命令就该函数化',
  '打印函数定义 :: which func / type func :: type func :: type 还能看别名展开',
  '临时禁用别名 :: command rm -rf /x（不写别名）:: command rm -rf /x :: 防手滑必备',
  '环境变量只在当前命令生效 :: FOO=1 cmd :: FOO=1 cmd :: 一次性的，不要 export',
  '清理导出的环境变量 :: unset FOO :: unset FOO :: 排查环境污染时常用',
  '记录一段会话 :: script -q /tmp/log :: script -q /tmp/log :: 出问题时可回放',
  '管道里看进度 :: | pv -l -s $(wc -l < f.txt) :: 同 :: 没装 pv 时用 cat -n',
]);

// ── 性能优化 ──────────────────────────────────────────────────────────

const PERF_ITEMS: { title: string; detail: string; code?: string; language?: CodeLanguage }[] = [
  {
    title: 'zsh 启动慢：先用 zprof 定位',
    detail: '在 .zshrc 最前面加 zmodload zsh/zprof 与 zprof，最后一行加 zprof，然后重新打开终端看各函数的耗时排名。',
    code: `# .zshrc 开头
zmodload zsh/zprof
zprof
# .zshrc 结尾
zprof`,
    language: 'shell',
  },
  {
    title: 'zsh 启动慢：再用 zsh -x 定位到具体命令',
    detail: 'zsh -x 会把执行的每条命令打印出来，能看到是哪一行在等网络或 fork 大量子进程。',
    code: "zsh -x -c 'echo $SHELL' 2>&1 | head -100",
    language: 'shell',
  },
  {
    title: '配置里不要有网络调用',
    detail: '每次启动都 curl 一次检查更新，会让每个新终端多等几百毫秒到几秒。缓存结果、按天检查，或者改用异步加载。',
    code: `# 反例：每次开终端都同步请求
VERSION=$(curl -s https://example.com/latest)

# 正解：缓存一天
CACHE="$HOME/.cache/tool-version"
if [ ! -f "$CACHE" ] || [ "$(date -r "$CACHE" +%s)" -lt $(( $(date +%s) - 86400 )) ]; then
  curl -sf https://example.com/latest > "$CACHE" || true
fi`,
    language: 'shell',
  },
  {
    title: '补全缓存要放在 XDG 目录并定期重建',
    detail: 'compinit 默认会在 dump 文件超过 2000 行时自动重建，重建过程很慢。把它放到 ~/.cache 并按需删除即可。',
    code: `compinit -d "$HOME/.cache/zcompdump"
# 增量重建
rm -f "$HOME/.cache/zcompdump"; compinit -d "$HOME/.cache/zcompdump"`,
    language: 'shell',
  },
  {
    title: '插件延迟加载',
    detail:
      '把平时用不到的插件用 Zinit 的 ice 修饰符延迟到第一次执行时再加载；Zsh 的 zcompile 可以把函数预编译成 .zwc。',
    code: `zinit ice as"null" atload"zle -N zle-keymap-select" atinit"zstyle ':completion:*' menu select"
zinit light zdharma-continuum/fast-syntax-highlighting

# 预编译
zcompile "$HOME/.zshrc"`,
    language: 'shell',
  },
  {
    title: 'bash 的 inputrc 过大同样拖慢',
    detail: 'bash 启动时要解析 .inputrc，绑定上千行会明显变慢。用 bind 命令按需绑定更省。',
    code: `bind 'set completion-ignore-case on'
bind 'set show-all-if-ambiguous on'
bind 'set menu-complete-display-prefix on'
# 批量化：把所有 bind 写进 ~/.inputrc，注意 tab 写法要写成 "\\C-i:menu-complete"`,
    language: 'shell',
  },
  {
    title: '启动时把后台任务挪到后面',
    detail: 'zsh 的 &disown、bash 的 disown 能让不影响后续命令的初始化任务不阻塞提示符出现。',
    code: `(command -v atuin >/dev/null && atuin --daemon &) 2>/dev/null
disown 2>/dev/null || true`,
    language: 'shell',
  },
];

// ── 配置片段 ──────────────────────────────────────────────────────────

const SNIPPET_FILES: { title: string; file: string; language: CodeLanguage; mime: string; code: string }[] = [
  {
    title: '.inputrc（readline / bash / 部分 zsh）',
    file: '.inputrc',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
    code: `set completion-ignore-case on
set show-all-ambiguous on
set colored-stats on
set mark-symlinked-directory-names on
set page-completions on
set completion-query-items 200
set bell-style none
set menu-complete-display-prefix on

"\\e[A": history-search-backward
"\\e[B": history-search-forward
"\\eOA": history-search-backward
"\\eOB": history-search-forward
"\\C-w": backward-kill-word
"\\C-u": unix-line-discard
"\\C-y": yank
"\\C-_": undo
"\\e\\e": kill-big-word`,
  },
  {
    title: 'starship.toml（跨 shell 提示符）',
    file: 'starship.toml',
    language: 'toml',
    mime: 'text/plain;charset=utf-8',
    code: `add_newline = true
command_timeout = 1000

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯(bg:red fg:white)](bold red)"

[directory]
truncation_length = 3
truncate_to_repo = true

[nodejs]
symbol = " node "

[git_branch]
format = "on [$symbol$branch]($style) "
style = "bold purple"

[cmd_duration]
min_time = 2000
format = "[took $duration]($style) "`,
  },
  {
    title: 'fish config.fish',
    file: 'config.fish',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
    code: `set -gx fish_greeting ""
set -gx EDITOR nvim
set -gx HISTSIZE 50000

function fish_prompt
    set -l last $status
    printf '%s%s ' (set_color red)'> '(set_color normal)
    echo -n (prompt_pwd)
    set -l branch (commandline --current-process -f prompt)
    echo -n $branch
    if test $last -ne 0
        echo -n (set_color red)" [$last]" (set_color normal)
    end
    echo
end

alias ll 'ls -lah --color=auto'
alias .. 'cd ..'
alias g 'git'

# fzf 集成
fzf --fish | source`,
  },
  {
    title: 'PowerShell $PROFILE（pwsh 与 Windows PowerShell 通用）',
    file: 'Microsoft.PowerShell_profile.ps1',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
    code: `# 行编辑与补全
Set-PSReadLineOption -EditMode Windows
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle ListView
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward

# 常用别名与函数
Set-Alias -Name ll -Value Get-ChildItem -Option AllScope
function la { Get-ChildItem -Force -Name }
function .. { Set-Location .. }
function grep { Select-String -Path $args[0] -Pattern $args[1] }

# 别名定义可视化
Set-Alias -Name which -Value Get-Command -Option AllScope`,
  },
  {
    title: '.p10k.zsh（powerlevel10k 配置向导导出的片段）',
    file: '.p10k.zsh',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
    code: `typeset -g POWERLEVEL9K_MODE=nerdfont-complete
typeset -g POWERLEVEL9K_LEFT_PROMPT=(
  '%*F{red}%(7~|.7<%<)%5F{blue}(%3F>%4I%2w%1u)(%5F{blue}%?)%i'
  '\${%1?&-&}'
  '%9F{blue}(%6u%?%#:~1(l:%1\\\\))%?%i'
)
typeset -g POWERLEVEL9K_RIGHT_PROMPT=(
  '%1F{white}(%3U%?%#:~1(l:%1\\\\))%i'
  '%1F{white}%k %7F{blue}%f'
  '%4F{blue}%1v%2v%3v%4v%5v%6v%7v%8v%9v%10v%11v'
  '%(!.#%#.#%#)'
  ' %7F{white}%*%?'
)
typeset -g POWERLEVEL9K_LEFT_PADDING=0
typeset -g POWERLEVEL9K_TRANSIENT=off
typeset -g POWERLEVEL9K_INSTANT_PROMPT=off`,
  },
  {
    title: '.tmux.conf（与 tmux 速查配套）',
    file: '.tmux.conf',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
    code: `set -g history-limit 50000
set -g mouse on
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -g escape-time 10
set -g set-clipboard on

bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
bind -T copy-mode-vi y send -X copy-pipe-and-cancel "tmux save-buffer - | pbcopy"
bind -T copy-mode-vi / send -X search-forward
bind -T copy-mode-vi n send -X search-again

# 重建状态栏需要 tmux ≥ 3.0
set -g status-style "bg=#1e1e2e,fg=#cdd6f4"
set -g status-left "#[fg=#89b4fa] #S #[default]"
set -g status-right "#[fg=#a6adc8]%Y-%m-%d %H:%M "`,
  },
];

const LINKS: LinkItem[] = [
  { name: 'Oh My Zsh', url: 'https://ohmyz.sh/', description: 'zsh 框架，插件仓库 odw`，安装即用', tags: ['zsh'] },
  {
    name: 'Zinit',
    url: 'https://github.com/zdharma-continuum/zinit',
    description: 'zsh 插件管理器，主打延迟加载',
    tags: ['zsh'],
  },
  {
    name: 'Sheldon',
    url: 'https://sheldon.rs/',
    description: 'Rust 写的插件管理器，声明式 TOML 配置',
    tags: ['zsh', 'bash'],
  },
  { name: 'starship', url: 'https://starship.rs/', description: '跨 shell 提示符，配置文件为 TOML', tags: ['提示符'] },
  { name: 'Atuin', url: 'https://docs.atuin.sh/', description: 'shell 历史数据库，带 TUI 搜索与同步', tags: ['历史'] },
  {
    name: 'Zoxide',
    url: 'https://github.com/ajeetdsouza/zoxide',
    description: ' smarter 目录跳转，替代 cd -',
    tags: ['导航'],
  },
  {
    name: 'fzf',
    url: 'https://github.com/junegunn/fzf',
    description: '通用模糊查找器，文档里的 --bind 说明最全',
    tags: ['模糊查找'],
  },
  { name: 'direnv', url: 'https://direnv.net/', description: '按目录加载环境变量，许可模型说明在此', tags: ['环境'] },
  {
    name: 'mise',
    url: 'https://mise.jdx.dev/',
    description: 'asdf 的活跃继任者，含 tasks 与 env 指令',
    tags: ['版本管理'],
  },
  {
    name: 'fnm',
    url: 'https://github.com/Schniz/fnm',
    description: 'Rust 写的 Node 版本管理，切换极快',
    tags: ['Node'],
  },
  {
    name: 'zsh-syntax-highlighting',
    url: 'https://github.com/zdharma-continuum/zsh-syntax-highlighting',
    description: '加载顺序有要求，README 有说明',
    tags: ['zsh'],
  },
  {
    name: 'fish',
    url: 'https://fishshell.com/docs/current/index.html',
    description: 'fish 官方文档，语法自成一套',
    tags: ['shell'],
  },
  {
    name: 'PSReadLine',
    url: 'https://learn.microsoft.com/powershell/module/psreadline/',
    description: 'PowerShell 行编辑官方文档',
    tags: ['PowerShell'],
  },
  { name: 'tldr', url: 'https://tldr.sh/', description: '社区命令速查，只讲常用参数', tags: ['速查'] },
];

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
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-7 text-xs"
      />
    </div>
  );
}

export default function ShellFramework() {
  const [tab, setTab] = useState<Tab>('framework');
  const [query, setQuery] = useState('');
  const [zsh, setZsh] = useState<ZshOptions>(DEFAULT_ZSH);
  const [bash, setBash] = useState<BashOptions>(DEFAULT_BASH);

  const filteredFrameworks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return FRAMEWORKS;
    return FRAMEWORKS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredTips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TIPS;
    return TIPS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const zshrc = useMemo(() => buildZshrc(zsh), [zsh]);
  const bashrc = useMemo(() => buildBashrc(bash), [bash]);

  return (
    <ToolPanel
      title="Shell 增强框架导航"
      description={`${FRAMEWORKS.length} 个框架对比、zsh / bash 配置生成、${TIPS.length} 条技巧与启动性能排查`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索框架或技巧" />}
    >
      <Note tone="warn" title="定位说明">
        扩展运行在浏览器里，<b>无法向你的 shell 注入任何东西</b>：没有改 <code className="font-mono">.zshrc</code>{' '}
        的权限， 也不能执行安装命令。这里提供的是框架对比、配置生成与提速排查参考，落地要靠你自己复制粘贴。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'framework' && <TerminalSquare className="size-3.5" />}
                {item.value === 'zsh' && <Settings2 className="size-3.5" />}
                {item.value === 'bash' && <Settings2 className="size-3.5" />}
                {item.value === 'tips' && <Zap className="size-3.5" />}
                {item.value === 'perf' && <GaugeCircle className="size-3.5" />}
                {item.value === 'snippets' && <Sparkles className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'framework' && (
        <Section title="框架与插件对比" description="安装方式里的脚本请先看清内容再执行，历史上出现过投毒案例">
          {filteredFrameworks.length === 0 ? (
            <EmptyHint>没有匹配的框架</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">名称</th>
                    {FRAMEWORK_COLUMNS.map((column) => (
                      <th key={column.key} className="py-1.5 pr-2 font-medium">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredFrameworks.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.name}</td>
                      {FRAMEWORK_COLUMNS.map((column) => (
                        <td key={column.key} className="py-1.5 pr-2 text-muted-foreground">
                          {row[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {tab === 'zsh' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="zsh 选项" description="勾选决定生成哪些段落">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="插件管理器"
                value={zsh.pluginManager}
                onChange={(value) => setZsh({ ...zsh, pluginManager: value as PluginManager })}
                options={PLUGIN_MANAGERS}
              />
              <Select
                label="提示符主题"
                value={zsh.theme}
                onChange={(theme) => setZsh({ ...zsh, theme })}
                options={ZSH_THEMES}
                hint="选 starship 时会生成 init 语句，不再 source 主题文件"
              />
            </div>
            <div>
              <p className="mb-1 text-muted-foreground">PATH 目录（可多选，生成时会逐条 export）</p>
              <div className="flex flex-wrap gap-3">
                {FS_OPTIONS.map((option) => (
                  <Checkbox
                    key={option.value}
                    label={option.label}
                    checked={zsh.pathDirs.includes(option.value)}
                    onChange={() => setZsh({ ...zsh, pathDirs: toggle(zsh.pathDirs, option.value) })}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Checkbox label="历史设置" checked={zsh.history} onChange={(history) => setZsh({ ...zsh, history })} />
              <Checkbox
                label="补全系统"
                checked={zsh.completion}
                onChange={(completion) => setZsh({ ...zsh, completion })}
              />
              <Checkbox label="别名" checked={zsh.aliases} onChange={(aliases) => setZsh({ ...zsh, aliases })} />
              <Checkbox
                label="键位绑定"
                checked={zsh.keybindings}
                onChange={(keybindings) => setZsh({ ...zsh, keybindings })}
              />
              <Checkbox
                label="常用函数"
                checked={zsh.functions}
                onChange={(functions) => setZsh({ ...zsh, functions })}
              />
              <Checkbox label="fzf 集成" checked={zsh.fzf} onChange={(fzf) => setZsh({ ...zsh, fzf })} />
              <Checkbox label="zoxide 集成" checked={zsh.zoxide} onChange={(zoxide) => setZsh({ ...zsh, zoxide })} />
              <Checkbox
                label="starship 提示符"
                checked={zsh.starship}
                onChange={(starship) => setZsh({ ...zsh, starship })}
              />
            </div>
          </Section>
          <Section title="生成结果" description="追加或覆盖 ~/.zshrc 前请先备份">
            <CodeBlock
              code={zshrc}
              language="shell"
              title="~/.zshrc"
              filename=".zshrc"
              lineNumbers
              maxLines={260}
              maxHeight="30rem"
            />
            <Note tone="warn" title="生成后务必手工检查 PATH">
              勾选出来的 PATH 是模板值，可能包含你并不需要的目录，也可能漏掉你自己的工具目录。
              把敏感目录、临时目录删掉，再合并成一行 <code className="font-mono">export PATH=...</code> 更干净。
            </Note>
            <Hint>不同框架的插件加载顺序不同：语法高亮要在 compinit 之后、自动建议通常放最后。</Hint>
          </Section>
        </div>
      )}

      {tab === 'bash' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="bash 选项" description="macOS 自带 bash 3.2，多数新特性需要 brew install bash">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Checkbox label="shopt 选项" checked={bash.shopt} onChange={(shopt) => setBash({ ...bash, shopt })} />
              <Checkbox label="历史设置" checked={bash.history} onChange={(history) => setBash({ ...bash, history })} />
              <Checkbox label="别名" checked={bash.aliases} onChange={(aliases) => setBash({ ...bash, aliases })} />
              <Checkbox
                label="补全"
                checked={bash.completion}
                onChange={(completion) => setBash({ ...bash, completion })}
              />
              <Checkbox label="自定义 PS1" checked={bash.prompt} onChange={(prompt) => setBash({ ...bash, prompt })} />
              <Checkbox
                label="PROMPT_COMMAND"
                checked={bash.promptCommand}
                onChange={(promptCommand) => setBash({ ...bash, promptCommand })}
              />
              <Checkbox
                label="常用函数"
                checked={bash.functions}
                onChange={(functions) => setBash({ ...bash, functions })}
              />
              <Checkbox label="extglob" checked={bash.extglob} onChange={(extglob) => setBash({ ...bash, extglob })} />
            </div>
            <TextField
              label="备注：启动时要执行什么（可选）"
              value={bash.startUp}
              onChange={(startUp) => setBash({ ...bash, startUp })}
              hint="只会写进注释里，方便你后面对照"
            />
          </Section>
          <Section title="生成结果" description="写进 ~/.bashrc；登录 shell 的设置放 ~/.bash_profile">
            <CodeBlock
              code={bashrc}
              language="shell"
              title="~/.bashrc"
              filename=".bashrc"
              lineNumbers
              maxLines={200}
              maxHeight="28rem"
            />
            <Note tone="info" title="bashrc 与 bash_profile 的区别">
              登录 shell（ssh 进来、启动 Terminal 的登录项）读 <code className="font-mono">~/.bash_profile</code>，
              交互式非登录 shell 读 <code className="font-mono">~/.bashrc</code>。 常见做法是 .bash_profile 里写{' '}
              <code className="font-mono">[ -f ~/.bashrc ] &amp;&amp; source ~/.bashrc</code>。
            </Note>
          </Section>
        </div>
      )}

      {tab === 'tips' && (
        <Section
          title={`效率技巧速查（共 ${TIPS.length} 条）`}
          description="左列是操作，右列是 zsh 与 bash 的差异与备注"
        >
          {filteredTips.length === 0 ? (
            <EmptyHint>没有匹配的技巧</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">操作</th>
                    <th className="py-1.5 pr-2 font-medium">在 zsh</th>
                    <th className="py-1.5 pr-2 font-medium">在 bash</th>
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTips.map((row) => (
                    <tr key={row.action} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium">{row.action}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.zsh}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.bash}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              copyText(
                [
                  '# Shell 技巧速查（由「Shell 增强框架导航」导出）',
                  '',
                  ['操作', 'zsh', 'bash', '备注'].join('\t'),
                  ...TIPS.map((row) => [row.action, row.zsh, row.bash, row.note].join('\t')),
                ].join('\n'),
              )
            }
          >
            复制全部技巧为 TSV
          </Button>
        </Section>
      )}

      {tab === 'perf' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Note tone="info" title="先测量，再优化">
            终端启动慢的常见原因只有三个：配置里有网络调用、插件数量爆炸、补全缓存需要重建。 先用{' '}
            <code className="font-mono">zprof</code> / <code className="font-mono">zsh -x</code>{' '}
            定位到具体行，再决定砍哪个。
          </Note>
          {PERF_ITEMS.map((item) => (
            <Section key={item.title} title={item.title}>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
              {item.code && (
                <CodeBlock code={item.code} language={item.language ?? 'shell'} title={item.title} maxHeight="18rem" />
              )}
            </Section>
          ))}
        </div>
      )}

      {tab === 'snippets' && (
        <div className="flex min-w-0 flex-col gap-3">
          {SNIPPET_FILES.map((item) => (
            <Section key={item.title} title={item.title} description="直接下载或复制到对应位置">
              <CodeBlock
                code={item.code}
                language={item.language}
                title={item.file}
                filename={item.file}
                mime={item.mime}
                lineNumbers
                maxHeight="22rem"
              />
            </Section>
          ))}
        </div>
      )}

      <Section title="官方入口" description="安装脚本与配置项以官方文档为准">
        <LinkList items={LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}
