import { Keyboard, Monitor, ScrollText, Search, Settings2, SquareTerminal, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock, type CodeLanguage } from '../components/ui/code-block';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

type Tab = 'compare' | 'config' | 'tmux' | 'keys' | 'faq';

const TABS: { value: Tab; label: string }[] = [
  { value: 'compare', label: '终端对比' },
  { value: 'config', label: '配置生成' },
  { value: 'tmux', label: 'tmux 速查' },
  { value: 'keys', label: '快捷键对照' },
  { value: 'faq', label: '常见问题' },
];

interface TerminalRow {
  name: string;
  platform: string;
  gpu: string;
  tabs: string;
  config: string;
  session: string;
  font: string;
  search: string;
  activity: string;
}

/** 紧凑数据行：字段之间用 ` :: ` 分隔（避免与命令里的管道符冲突）。 */
function compareRows(lines: string[]): TerminalRow[] {
  const _keys: (keyof TerminalRow)[] = [
    'name',
    'platform',
    'gpu',
    'tabs',
    'config',
    'session',
    'font',
    'search',
    'activity',
  ];
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return {
      name: parts[0] ?? '',
      platform: parts[1] ?? '',
      gpu: parts[2] ?? '',
      tabs: parts[3] ?? '',
      config: parts[4] ?? '',
      session: parts[5] ?? '',
      font: parts[6] ?? '',
      search: parts[7] ?? '',
      activity: parts[8] ?? '',
    } as TerminalRow & Record<string, string>;
  });
}

const TERMINALS = compareRows([
  'Alacritty :: macOS / Linux / Windows :: OpenGL GPU 加速 :: 无原生标签，用分屏 + tmux :: alacritty.toml :: 无（靠 tmux） :: 连字、彩色 emoji 可配，字体回退需自己写 font.offset :: 无内置搜索（靠 less 或 tmux 复制模式） :: 非常活跃，配置项持续增加',
  'kitty :: macOS / Linux :: OpenGL ES GPU 加速，另有自己的图形协议 :: 原生标签页 + 分屏 :: kitty.conf :: 有 kitty @ IPC，可做会话恢复 :: 连字、emoji 渲染好，字体回退链完整 :: 内置 Ctrl+Shift+F 搜索滚动缓冲 :: 非常活跃，kitty 图形协议生态活跃',
  'WezTerm :: macOS / Linux / Windows :: WebGPU / OpenGL :: 原生标签 + 分屏 :: wezterm.lua（Lua） :: 有 mux domain + wezterm cli attach-gui 可恢复 :: 连字、内置连字字体、emoji 支持好 :: 无内置搜索（分屏/滚动常用 tmux） :: 活跃，功能最全但配置学习曲线陡',
  'Ghostty :: macOS 正式版，Windows / Linux 预览 :: GPU 加速 :: 1.0 起支持分屏 :: config（INI 风格纯文本） :: 无 :: 连字、emoji 渲染优秀，自带主题 :: 无内置搜索 :: 非常活跃，定位「快且原生」',
  'iTerm2 :: 仅 macOS :: Core Animation GPU 渲染 :: 标签 + 水平/垂直分屏，可分屏标签 :: preferences.plist :: 无内置恢复，可配 tmux 集成 :: 连字、emoji、内置 Nerd Font 支持好 :: 内置 Cmd+F，支持正则 :: 活跃，macOS 事实标准之一',
  'Windows Terminal :: 仅 Windows :: DirectWrite + GPU 加速 :: 标签 + 分屏（split pane） :: settings.json :: 无内置恢复，可用 startupActions 近似 :: 连字与 emoji 正常，支持非等宽 :: 内置 Ctrl+Shift+F :: 非常活跃，Windows 默认终端',
  'Warp :: macOS / Linux，Windows 预览 :: GPU 加速 :: 标签 + 分屏，Blocks 块式输出 :: GUI 设置 + ~/.warp 目录 :: 无（官方建议配 tmux） :: 连字正常，块式渲染会影响部分输出格式 :: 内置搜索 :: 商业订阅，闭源',
  'Tabby :: macOS / Windows / Linux :: 可选 GPU 加速（实验性） :: 标签 + 分屏 :: config.yaml :: 无 :: 连字与 emoji 正常 :: 内置搜索 :: 活跃，开源',
  'rio :: macOS / Linux / Windows :: GPU 加速（wgpu） :: 标签（早期版本） :: rio.toml :: 无 :: 简洁，连字可用 :: 无 :: 早期阶段，迭代较慢',
  'ConEmu / Cmder :: 仅 Windows :: 部分 GPU 加速 :: 标签 + 分屏，任务窗格 :: XML 配置 + .ini :: 无 :: 字体与 emoji 一般，ANSI 支持 :: 有限搜索 :: 维护保守，仍大量用户',
  'PuTTY :: 仅 Windows :: 无 GPU 加速 :: 单窗口，会话列表代替标签 :: 无配置文件（会话存为注册表项） :: 会话列表持久化强 :: 字体可选，连字不支持 :: 无搜索 :: 维护保守，稳定优先',
  'SecureCRT :: Windows / macOS / Linux :: 无 GPU :: 标签 + 分屏 :: .ini / 导出 XML :: 会话管理极强（脚本、条件动作） :: 字体可选 :: 有限搜索 :: 商业软件，仍在更新',
  'Konsole :: 仅 Linux（KDE） :: 可选 GPU 渲染 :: 标签 + 分屏 :: .konsolerc + profile 文件 :: 支持保存会话 :: 字体可配，emoji 依赖系统字体 :: 有搜索（Shift+Ctrl+F） :: 活跃，KDE 官方组件',
  'GNOME Terminal :: 仅 Linux :: 默认软件渲染 :: 标签 :: gsettings / dconf :: 无 :: emoji 渲染好 :: 内置搜索（Ctrl+Shift+F） :: 随 GNOME 发布，迭代稳定',
  'tmux :: 所有类 Unix（需本机安装） :: 无 GPU（由外层终端渲染） :: 窗口 + 窗格 :: .tmux.conf :: 核心能力：断开重连不丢会话 :: 跟随外层终端字体 :: 复制模式里可用 / 搜索 :: 非常活跃，服务器上几乎必备',
  'VS Code 集成终端 :: 全平台 :: 跟随宿主（Electron） :: 标签 + 分屏 + 面板 :: settings.json :: terminal.integrated.enablePersistentSessions 可恢复 :: 字体完全可配，连字有设置 :: 集成搜索与滚动条 :: 非常活跃',
]);

const COMPARE_COLUMNS: { key: keyof TerminalRow; label: string }[] = [
  { key: 'platform', label: '平台' },
  { key: 'gpu', label: 'GPU 加速' },
  { key: 'tabs', label: '标签 / 分屏' },
  { key: 'config', label: '配置文件' },
  { key: 'session', label: '会话持久化' },
  { key: 'font', label: '字体 / emoji' },
  { key: 'search', label: '搜索' },
  { key: 'activity', label: '活跃度' },
];

// ── 配置生成 ──────────────────────────────────────────────────────────

type ConfigKind =
  | 'alacritty'
  | 'wezterm'
  | 'kitty'
  | 'ghostty'
  | 'tmux'
  | 'p10k'
  | 'fish'
  | 'inputrc'
  | 'powershell'
  | 'starship'
  | 'windows-terminal'
  | 'iterm2';

const CONFIG_KINDS: { value: ConfigKind; label: string; file: string; language: CodeLanguage; mime: string }[] = [
  {
    value: 'alacritty',
    label: 'Alacritty（alacritty.toml）',
    file: 'alacritty.toml',
    language: 'toml',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'wezterm',
    label: 'WezTerm（wezterm.lua）',
    file: 'wezterm.lua',
    language: 'lua',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'kitty',
    label: 'Kitty（kitty.conf）',
    file: 'kitty.conf',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'ghostty',
    label: 'Ghostty（config）',
    file: 'ghostty-config',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'tmux',
    label: 'tmux（.tmux.conf）',
    file: '.tmux.conf',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'p10k',
    label: 'Powerlevel10k（.p10k.zsh）',
    file: '.p10k.zsh',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'fish',
    label: 'Fish（config.fish）',
    file: 'config.fish',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'inputrc',
    label: 'Readline（.inputrc）',
    file: '.inputrc',
    language: 'conf',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'powershell',
    label: 'PowerShell（$PROFILE）',
    file: 'Microsoft.PowerShell_profile.ps1',
    language: 'shell',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'starship',
    label: 'Starship（starship.toml）',
    file: 'starship.toml',
    language: 'toml',
    mime: 'text/plain;charset=utf-8',
  },
  {
    value: 'windows-terminal',
    label: 'Windows Terminal（settings.json）',
    file: 'settings.json',
    language: 'json',
    mime: 'application/json;charset=utf-8',
  },
  {
    value: 'iterm2',
    label: 'iTerm2（偏好说明）',
    file: 'iterm2-preferences.plist',
    language: 'xml',
    mime: 'application/xml;charset=utf-8',
  },
];

const THEMES = [
  { value: 'auto', label: '跟随系统' },
  { value: 'One Half Dark', label: 'One Half Dark（Alacritty/kitty 内置）' },
  { value: 'Catppuccin Mocha', label: 'Catppuccin Mocha' },
  { value: 'Tokyo Night', label: 'Tokyo Night' },
  { value: 'Dracula', label: 'Dracula' },
  { value: 'Nord', label: 'Nord' },
];

interface ConfigOptions {
  font: string;
  size: number;
  theme: string;
  opacity: number;
  padding: number;
  cursor: string;
  scrollback: number;
  keyNewTab: string;
  keySplit: string;
  keyCopy: string;
  startup: string;
  ligatures: boolean;
  cursorBlink: boolean;
}

const DEFAULT_OPTIONS: ConfigOptions = {
  font: 'JetBrainsMono Nerd Font',
  size: 14,
  theme: 'Catppuccin Mocha',
  opacity: 0.95,
  padding: 8,
  cursor: 'bar',
  scrollback: 10000,
  keyNewTab: 'ctrl+shift+t',
  keySplit: 'ctrl+shift+e',
  keyCopy: 'ctrl+shift+c',
  startup: '',
  ligatures: true,
  cursorBlink: true,
};

const CURSOR_OPTIONS = [
  { value: 'block', label: 'block 方块' },
  { value: 'bar', label: 'bar 竖线' },
  { value: 'underline', label: 'underline 下划线' },
];

/** 各终端配置文件生成器：全部按选项拼纯文本，注释为简体中文。 */
function buildConfig(kind: ConfigKind, o: ConfigOptions): string {
  const opacity = Math.min(1, Math.max(0, o.opacity));
  const bg = `background = '#1e1e2e'`;
  switch (kind) {
    case 'alacritty':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.config/alacritty/alacritty.toml
font = { normal = { family = "${o.font}" }, size = ${o.size} }
config_version = "3"

[font]
size = ${o.size}
offset = { x = 0, y = 0 }
# 连字（ligature）开关
builtin_ligatures = ${o.ligatures}

[colors]
[colors.primary]
${bg}
foreground = '#cdd6f4'

[colors.cursor]
text = '#1e1e2e'
cursor = '${o.cursor}'

[colors.selection]
text = '#1e1e2e'
background = '#89b4fa'

[cursor]
style = { shape = "${o.cursor}", blinking = ${o.cursorBlink ? 'on' : 'off'} }
blinking_interval = 600

[window]
opacity = ${opacity}
dynamic_padding = true
decorations = 'Full'

[window.padding]
x = ${o.padding}
y = ${Math.max(2, Math.round(o.padding / 2))}

[scrolling]
history = ${o.scrollback}

[keybindings]
${o.keyNewTab} = { binding = "CreateNewTab", macos_text = "n" }
${o.keySplit} = { binding = "SplitVertical", macos_text = "d" }
${o.keyCopy} = { Copy, macos_text = "c" }
`;
    case 'wezterm':
      return `-- 由「现代终端模拟器导航」生成，放到 ~/.wezterm.lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.font = wezterm.font_with_fallback({
  { '${o.font}' },
  { 'JetBrains Mono', 'Regular' },
})
config.font_size = ${o.size}
config.color_scheme = '${o.theme === 'auto' ? 'Catppuccin Mocha' : o.theme}'
config.window_background_opacity = ${opacity}
config.enable_tab_bar = true
config.macos_forward_to_clipboard = true
config.scrollback = ${o.scrollback}
config.enable_wayland = true

config.cursor_shape = '${o.cursor}'
config.cursor_blink_rate = ${o.cursorBlink ? 0.5 : 0}

config.window_padding = {
  left = ${o.padding},
  right = ${o.padding},
  top = ${o.padding},
  bottom = ${o.padding},
}

config.keys = {
  { '${o.keyNewTab}', wezterm.action.SpawnTab 'DefaultDomain' },
  { '${o.keySplit}', wezterm.action.SplitVertical },
  { '${o.keySplit}'.gsub('ctrl', 'shift'):gsub('%+', '+'), wezterm.action.SplitHorizontal },
  { '${o.keyCopy}', wezterm.action.CopyTo 'Clipboard' },
  { '${o.keyCopy}'.gsub('ctrl', 'shift'):gsub('%+', '+'), wezterm.action.PasteFrom 'Clipboard' },
}

${o.startup ? `wezterm.on('startup', function(ui, pane)\n  pane:send_text('${o.startup}\\n')\nend)\n` : ''}
return config
`;
    case 'kitty':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.config/kitty/kitty.conf
font_family      ${o.font}
font_size        ${o.size}
bold_font        auto
italic_font      auto
bold_italic_font auto
font_features    ${o.ligatures ? '+calt+liga' : '-calt-liga'}

cursor            ${o.cursor}
cursor_blink      ${o.cursorBlink ? 'yes' : 'no'}
cursor_shape      ${o.cursor}

background        #1e1e2e
foreground        #cdd6f4
selection_background #89b4fa
selection_foreground #1e1e2e

# 背景透明度（0~1，越小越透明）
background_opacity ${opacity}
window_padding_width  ${o.padding}
scrollback_pager  yes
scrollback         ${o.scrollback}
tab_bar            yes
tab_bar_style      powerline

# 主题：直接复制官方主题文件内容，或写 theme file,path=/path/to/theme.conf
# theme ${o.theme}

# 快捷键
map ${o.keyNewTab} new_tab
map ${o.keySplit}  split_window
map ${o.keyCopy}   copy_to_clipboard
map ${o.keyCopy.replace('ctrl+shift', 'ctrl+shift+alt')} paste_from_clipboard

# 快捷键：允许在 kitty 里复制上次命令输出
map ctrl+shift+k clear_screen
map ctrl+shift+f scrollback_search

# 启动命令
# remote ${o.startup}
`;
    case 'ghostty':
      return `# 由「现代终端模拟器导航」生成，放到 ~/Library/Application Support/com.mitchellh.ghostty/config
# Ghostty 配置是 INI 风格，键名用连字符
font-family = ${o.font}
font-size = ${o.size}
font-thicken = true
font-feature = ${o.ligatures ? '+liga' : '-liga'}

theme = ${o.theme === 'auto' ? 'catppuccin-mocha' : o.theme.toLowerCase().replace(/ /g, '-')}
background-opacity = ${opacity}
window-padding-x = ${o.padding}
window-padding-y = ${Math.max(2, Math.round(o.padding / 2))}
cursor-style = ${o.cursor}
cursor-style-blink = ${o.cursorBlink ? 'true' : 'false'}
scrollback-limit = ${o.scrollback}
shell-integration = detect
copy-on-select = clipboard
window-save-state = always
# macos-titlebar-style = tabs
`;
    case 'tmux':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.tmux.conf
# 重新加载：tmux source-file ~/.tmux.conf

# 加大历史与关闭确认延迟
set -g history-limit ${o.scrollback}
set -g escape-time 10

# 窗口/分屏快捷键（prefix 之后）
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
bind c new-window -c "#{pane_current_path}"
bind , rename-window

# 鼠标与面板
set -g mouse on
set -g status-keys Vi
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on

# 复制模式：保留整个窗口回滚缓冲
set -g set-clipboard on
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-pipe-and-cancel "tmux save-buffer - | pbcopy"
bind -T copy-mode-vi / send -X search-forward
bind -T copy-mode-vi n send -X search-again

# 窗口/分屏尺寸百分比
bind -r H resize-pane -L 5
bind -r L resize-pane -R 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5

# 一体化状态栏
set -g status-style "bg=#1e1e2e,fg=#cdd6f4"
set -g status-left-length 40
set -g status-left "#[fg=#89b4fa] #S #[default]"
set -g status-right "#[fg=#a6adc8]%Y-%m-%d %H:%M "

# 会话名跟着当前目录走（配合 tmux new -A -s 复用会话的习惯）
set -g automatic-rename on
${o.startup ? `\n# 启动时自动执行的命令：\n# new-session -c "#{pane_current_path}"\n` : ''}
`;
    case 'p10k':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.p10k.zsh
# 步骤：1) brew install zsh zsh-autosuggestions && brew install romkatv/powerlevel10k/powerlevel10k
#      2) git clone --depth=1 https://github.com/romkatv/powerlevel10k.git \${10K}/powerlevel10k
#      3) 首次启动 zsh 时 p10k 会自动进入配置向导；本文件即向导导出的结果

typeset -g POWERLEVEL9K_LEFT_PROMPT=(
  '%*F{red}%(7~|.7<%<)%5F{blue}(%3F>%4I%2w%1u)(%5F{blue}%?)%i'
  '\${%1?&-&}'
  '%9F{blue}(%6u%?%#:~1(l:%1\\))%?%i'
)
typeset -g POWERLEVEL9K_RIGHT_PROMPT=(
  '%1F{white}(%3U%?%#:~1(l:%1\\))%i'
  '%1F{white}%k %7F{blue}%f'
  '%4F{blue}%1v%2v%3v%4v%5v%6v%7v%8v%9v%10v%11v'
  '%(!.#%#.#%#)'
  ' %7F{white}%*%?'
)

typeset -g POWERLEVEL9K_MODE=nerdfont-${o.ligatures ? 'complete' : 'off'}
typeset -g POWERLEVEL9K_ICON_PADDING=none
typeset -g POWERLEVEL9K_LEFT_PADDING=0
typeset -g POWERLEVEL9K_TRANSIENT=off
typeset -g POWERLEVEL9K_INSTANT_PROMPT=off

# 图标
typeset -g POWERLEVEL9K_DIR_VISUAL_IDENTIFIER_EXPANSION=''
typeset -g POWERLEVEL9K_SHORTEN_STRATEGY=truncate_to_unique

# 目录
typeset -g POWERLEVEL9K_DIR_ANCHOR_BOLD=true
typeset -g POWERLEVEL9K_DIR_ANCHOR_BLUE=true
typeset -g POWERLEVEL9K_DIR_MAX_LENGTH=40

# Git
typeset -g POWERLEVEL9K_VCS_CLEAN_BACKGROUND=none
typeset -g POWERLEVEL9K_VCS_UNTRACKED_BACKGROUND=none
typeset -g POWERLEVEL9K_VCS_CLEAN_FOREGROUND=$'e[32m'

# 命令历史
typeset -g POWERLEVEL9K_HISTORY_FOREGROUND=$'\\e[38;5;27m'
typeset -g POWERLEVEL9K_HISTORY_ICON=''
`;
    case 'fish':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.config/fish/config.fish
# fish 的语法和其它 shell 不同：变量用 set，函数用 function ... end

set -gx fish_greeting ""
set -gx EDITOR nvim
set -gx VISUAL \\$EDITOR
set -gx HISTSIZE ${o.scrollback}

# 提示符
function fish_prompt
  set -l last_status \\$status
  set -l arrow '❯'
  printf '%s%s ' (set_color red)\\$arrow (set_color normal)
  echo -n (prompt_pwd)
  set -l git_info (commandline --current-process -f prompt)
  echo -n \\$git_info
  if test \\$last_status -ne 0
    echo -n (set_color red)" [\\$last_status]" (set_color normal)
  end
  echo
end

# 常用别名
alias ll 'ls -lah --color=auto'
alias la 'ls -A --color=auto'
alias .. 'cd ..'
alias -- -='cd -'
alias g 'git'
alias gst 'git status'
alias gd 'git diff'
alias gco 'git checkout'
alias -- --history 'history search'

# 函数：按关键词杀掉进程
function pk
  pkill -f \\$argv[1]
end
`;
    case 'inputrc':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.inputrc
# 影响 bash / zsh(仅部分) / readline 的行编辑行为

set editing-mode emacs
set completion-ignore-case on
set show-all-if-ambiguous on
set colored-stats on
set mark-symlinked-directory-names on
set menu-complete-display-prefix on

# 历史
"\\e[A": history-search-backward
"\\e[B": history-search-forward
"\\eOA": history-search-backward
"\\eOB": history-search-forward
"\\e[C": forward-char
"\\e[D": backward-char
"^R": reverse-search-history
"^A": beginning-of-line
"^E": end-of-line

# 补全
set page-completions on
set completion-query-items 200
set bell-style none

# 目录补全时忽略大小写与结尾斜杠
set match-hidden-files on
set expand-tilde off

# 删除：Ctrl-W 删词而不是空格
"\\C-w": backward-kill-word
`;
    case 'powershell':
      return `# 由「现代终端模拟器导航」生成，追加到 $PROFILE
# 查看路径：$PROFILE；用 code $PROFILE 直接打开

# ---------- 基础 ----------
Set-PSReadLineOption -EditMode Windows
Set-PSReadLineOption -HistorySearchCursorMovesToEnd
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward

# 显示别名定义来源
Set-Alias -Name ll -Value Get-ChildItem -Option AllScope -Description "列出当前目录"
function ll { Get-ChildItem -Force | Format-Table -AutoSize }
function la { Get-ChildItem -Force -Name }
function .. { Set-Location .. }
function grep { Select-String -Path $args[0] -Pattern $args[1] }

# ---------- PSReadLine 补全 ----------
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle ListView

# ---------- 函数定义带注释（PowerShell 7.2+） ----------
function Get-TopProcess {
  <#
    .SYNOPSIS
      列出占用最高的进程
  #>
  Get-Process | Sort-Object -Descending CPU | Select-Object -First 10
}

# ---------- 启动命令 ----------
${o.startup ? `# 每次打开 PowerShell 时执行：\n# ${o.startup}\n` : ''}
`;
    case 'starship':
      return `# 由「现代终端模拟器导航」生成，放到 ~/.config/starship.toml
# 与 shell 无关：zsh/bash/fish 都会用它渲染提示符

add_newline = true
command_timeout = 1000

format = """
$directory\\
$git_branch\\
$git_status\\
$nodejs\\
$python\\
$java\\
$rust\\
$go\\
$java_runtime\\
$cmd_duration\\
$line_number\\
$character\\
$status\
"""

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"
vicmd_symbol = "[❮](bold yellow)"

[nodejs]
symbol = " node "
style = "bold green dimmed"
format = "[$symbol($version )]($style)"

[python]
symbol = " py "
style = "bold cyan dimmed"
format = '[\${symbol}\${version}( ($virtualenv))]($style) '

[git_branch]
symbol = " "
style = "bold purple dimmed"
format = 'on [$symbol$branch]($style) '

[git_status]
style = "bold yellow"
format = '([$all_status$ahead_behind]($style) )'
conflicted = '='
ahead = "⇡\${count}"
behind = "⇣\${count}"
diverged = "⇕⇡\${ahead_count}⇣\${behind_count}"
untracked = "?\${count}"
stashed = "\\$\${count}"
modified = "!\${count}"
staged = "+\${count}"

[cmd_duration]
min_time = 2000
style = "bold yellow dimmed"
format = "[took $duration]($style) "

[directory]
style = "bold cyan dimmed"
truncation_length = 3
truncate_to_repo = true
`;
    case 'windows-terminal':
      return `// 由「现代终端模拟器导航」生成，粘贴到 Windows Terminal 设置的「打开 JSON 文件」
// 注意：整体替换默认设置会丢失部分字段，建议只改需要的那几项
{
  "profiles": {
    "defaults": {
      "font": {
        "face": "${o.font}",
        "size": ${o.size}
      },
      "colorScheme": "${o.theme === 'auto' ? 'Catppuccin Mocha' : o.theme}",
      "opacity": ${opacity},
      "padding": "${o.padding}",
      "cursorShape": "${o.cursor}",
      "historySize": ${o.scrollback},
      "copyOnSelect": true,
      "experimental": {
        "useAtlasEngine": true,
        "relocateMouseWhenScrolling": true
      },
      "keybindings": [
        { "command": "copy", "keys": "${o.keyCopy.replace('ctrl+shift', 'ctrl+shift+')}" },
        { "command": "paste", "keys": "ctrl+shift+v" },
        { "command": "newTab", "keys": "${o.keyNewTab}" },
        { "command": "splitPane", "keys": "${o.keySplit}" },
        { "command": "find", "keys": "ctrl+shift+f" },
        { "command": "clearBuffer", "keys": "ctrl+shift+k" }
      ]
    }
  },
  "actions": [
    { "command": "copyToClipboard", "keys": "ctrl+shift+c" }
  ],
  "copyFormatting": "none",
  "experimental.rendering.software": false
}
`;
    case 'iterm2':
      return `<?xml version="1.0" encoding="UTF-8"?>
<!-- 由「现代终端模拟器导航」生成的 iTerm2 偏好说明片段（节选自 ~/Library/Preferences/com.googlecode.iterm2.plist）
     iTerm2 的设置保存在 plist 里，直接改 XML 有风险，优先用「Preferences → Profiles」图形界面操作。
     下面的键名可用于理解各选项在文件里的位置： -->

<plist version="1.0">
<dict>
  <key>Normal Font</key><dict><key>Font</key><string>${o.font}-${o.size}</string></dict>
  <key>UseBoldFonts</key><true/>
  <key>UseLigatures</key><${o.ligatures ? 'true' : 'false'}/>
  <key>BackgroundColor</key>
  <dict><key>Alpha Component</key><real>${opacity}</real></dict>
  <key>Transparency</key><real>${(1 - opacity).toFixed(2)}</real>
  <key>Scrollback</key><integer>${o.scrollback}</integer>
  <key>CursorType</key><integer>${o.cursor === 'bar' ? 0 : o.cursor === 'block' ? 1 : 3}</integer>
  <key>BlinkCursor</key><${o.cursorBlink ? 'true' : 'false'}/>
  <!-- 常用颜色方案名：Catppuccin Mocha、Dracula、Tokyo Night、One Dark -->
  <key>ColorPreset</key><string>${o.theme === 'auto' ? 'Catppuccin Mocha' : o.theme}</string>
  <key>HotkeyChar</key><integer>13</integer>
  <key>HotkeyCode</key><integer>${o.startup ? '0' : '13'}</integer>
</dict>
</plist>
`;
    default:
      return '';
  }
}

// ── tmux ──────────────────────────────────────────────────────────────

interface TmuxKey {
  keys: string;
  meaning: string;
}

function tmuxRows(lines: string[]): TmuxKey[] {
  return lines.map((line) => {
    const [keys = '', meaning = ''] = line.split(' :: ');
    return { keys: keys.trim(), meaning: meaning.trim() };
  });
}

const TMUX_KEYS = tmuxRows([
  'prefix + d :: 分离会话（detach），程序继续在后台跑',
  'prefix + s :: 列出所有会话并选择',
  'prefix + $ :: 重命名当前会话',
  'tmux new -A -s name :: 关键习惯：不存在就新建，存在就直接连上去',
  'prefix + c :: 新建窗口',
  'prefix + n :: 下一个窗口',
  'prefix + p :: 上一个窗口',
  'prefix + 0-9 :: 跳到第 N 个窗口',
  'prefix + w :: 列出窗口并选择',
  'prefix + , :: 重命名当前窗口',
  'prefix + & :: 关闭当前窗口（有确认）',
  'prefix + % :: 左右垂直分屏',
  'prefix + " :: 上下水平分屏',
  'prefix + z :: 当前窗格全屏 / 取消全屏',
  'prefix + x :: 关闭当前窗格（有关闭确认）',
  'prefix + q :: 显示窗格编号',
  'prefix + 方向键 :: 在窗格之间跳转',
  'prefix + { :: 上一个窗格',
  'prefix + } :: 下一个窗格',
  'prefix + 空格 :: 循环切换布局（even-horizontal/even-vertical/main-vertical 等）',
  'prefix + ! :: 把当前窗格拆成上下两块',
  'prefix + 方向键 + % :: 整块替换布局',
  'prefix + C-方向键 :: 按 1 格调整窗格大小',
  'prefix + [ :: 进入复制模式（可移动光标）',
  '复制模式 空格 :: 开始选择，Enter/Y 复制，Esc 退出',
  '复制模式 / :: 向下搜索，? :: 向上搜索，n/N :: 下一次/上一次匹配',
  '复制模式 q :: 退出复制模式',
  'prefix + [ :: 0 或空格可整屏选中（配合 y 复制）',
  'prefix + D :: 选择窗口并 detach',
  'prefix + t :: 显示时钟（b 与 f 切换 12/24 小时制）',
  'prefix + ? :: 列出全部快捷键',
  'prefix + : :: 命令提示符（source-file、rename-window、set-option 都在这里输入）',
  'prefix + r :: 重载配置（部分版本需先 bind -n r source-file 而非 prefix r）',
  'prefix + Ctrl-b :: 发送实际的 Ctrl-b 给程序',
  'prefix + 空格 + h/j/k/l :: 切换到预设的横向/纵向布局',
]);

const TMUX_SCRIPTS: { title: string; language: CodeLanguage; code: string }[] = [
  {
    title: '一次性列出所有会话与其中的窗口数',
    language: 'shell',
    code: `tmux list-sessions -F '#{session_name} 窗口=#{session_windows} 附件=#{session_attached}'
# 批量 detach 掉所有会话（人不在的时候清干净）
tmux kill-server`,
  },
  {
    title: '把当前会话导出成可重建的脚本',
    language: 'shell',
    code: `# 记录布局与窗口工作目录
tmux list-windows -F '#{window_index} #{window_name} #{pane_current_path}' > windows.txt
tmux show-options -g > options.txt`,
  },
  {
    title: '用 tmux 跑长任务并保留日志',
    language: 'shell',
    code: `tmux new -d -s build 'npm run build 2>&1 | tee /tmp/build.log; echo "[exit=$?]"; sleep infinity'
# 进去看：tmux attach -t build   离开：prefix + d
# 直接看最后 50 行：tail -n 50 /tmp/build.log`,
  },
  {
    title: '让脚本在已有会话里跑（无新窗口）',
    language: 'shell',
    code: `tmux new-window -t mysession -n deploy -c "$PWD"
tmux send-keys -t mysession:deploy 'make deploy' Enter
tmux wait-for -S deploy-done   # 需要对端配合 signal 才结束`,
  },
];

// ── 快捷键对照 ────────────────────────────────────────────────────────

interface KeyRow {
  action: string;
  macTerm: string;
  iterm: string;
  alacritty: string;
  windows: string;
}

function keyRows(lines: string[]): KeyRow[] {
  return lines.map((line) => {
    const parts = line.split(' :: ');
    return {
      action: parts[0] ?? '',
      macTerm: parts[1] ?? '',
      iterm: parts[2] ?? '',
      alacritty: parts[3] ?? '',
      windows: parts[4] ?? '',
    };
  });
}

const KEY_MAP = keyRows([
  '复制选中文本 :: ⌘C（需在设置里勾选「用 ⌘C 复制」）:: ⌘C :: ⌘C（Linux 上默认 Ctrl+Shift+C）:: Ctrl+Shift+C',
  '粘贴 :: ⌘V :: ⌘V :: ⌘V（Linux 上 Ctrl+Shift+V）:: Ctrl+Shift+V',
  '新建标签页 :: ⌘T :: ⌘T :: 无原生标签，配合 tmux 或用 wezterm/kitty:: Ctrl+Shift+T',
  '关闭标签页 :: ⌘W :: ⌘W :: ⌘Q 会退出应用，建议用 tmux 关闭:: Ctrl+Shift+W',
  '新建窗口 :: ⌘N :: ⌘N :: ⌘N :: Ctrl+Shift+N',
  '切换相邻标签页 :: ⌃Tab / ⌘⇧↹ :: ⌃Tab :: 无 :: Ctrl+Tab / Ctrl+Shift+Tab',
  '跳到第 N 个标签页 :: ⌘1…⌘9 :: ⌘1…⌘9 :: 无 :: Ctrl+1…Ctrl+9',
  '左右分屏 :: 无（用 tmux prefix + %）:: ⌘D :: ⌘D :: Alt+Shift+加号',
  '上下分屏 :: 无（用 tmux prefix + "）:: ⌘⇧D :: ⌘⇧D :: Alt+Shift+减号',
  '在滚动缓冲里查找 :: 无（用 tmux 复制模式 /）:: ⌘F（可切正则）:: 无（用 tmux /）:: Ctrl+Shift+F',
  '增大字号 :: ⌘+ :: ⌘+ :: ⌘+ :: Ctrl+加号',
  '减小字号 :: ⌘- :: ⌘- :: ⌘- :: Ctrl+减号',
  '重置字号 :: 无（Preferences 里改）:: ⌘0 :: ⌘0 :: Ctrl+0',
  '清屏 :: ⌘K :: ⌘K :: ⌘K :: Ctrl+Shift+K',
  '复制上次命令的输出 :: 无内置，用 tmux 或重定向到文件:: 无内置:: 无内置:: 无内置（可用「清屏后回车上条命令」绕过）',
  '把当前行输出复制到剪贴板 :: 无（配 pbpaste 管道）:: 无（配 pbpaste）:: 无:: 无（可用 PowerShell Get-Clipboard）',
  '发送 SIGINT（Ctrl+C）:: ⌃C :: ⌃C :: ⌃C :: ⌃C',
  '全屏 :: ⌃⌘F :: ⌃⌘F :: ⌃⌘F :: F11',
  '侧边栏 / 书签 :: 无（用 split pane 模拟）:: ⌥⌘I 打开书签栏:: 无 :: 无（配置文件里改）',
  '在标签页间移动窗口 :: ⌥⌘← / ⌥⌘→ :: ⌘⌥← / ⌘⌥→ :: 无 :: Ctrl+Shift+← / Ctrl+Shift+→',
  '滚轮回放历史输出 :: 触控板双指 / ⌘K 后方向键 :: 触控板双指 :: 触控板双指（支持像素级滚动）:: 触控板双指',
  '粘贴上次执行的命令 :: 无（用 ↑ 调历史）:: 无（用 ↑）:: 无（用 ↑）:: 无（用 ↑）',
]);

// ── 常见问题 ──────────────────────────────────────────────────────────

interface FaqItem {
  title: string;
  body: string;
  code?: string;
}

const FAQS: FaqItem[] = [
  {
    title: 'SSH 一断线，进程就没了',
    body: '网络抖动、跳板机重启、NAT 超时都会掐断 SSH。三个常用手段：客户端保活、服务端复用会话、换用 UDP 传输的 mosh。',
    code: `# ~/.ssh/config：每 30 秒发一次保活，连续 3 次无响应才断开
Host *
  ServerAliveInterval 30
  ServerAliveCountMax 3
  TCPKeepAlive yes

# 断线重连后回到原会话
Host work
  HostName bastion.example.com
  User you
  RemoteCommand tmux new -A -s main
  RequestTTY force`,
  },
  {
    title: '中文与 emoji 宽度错乱',
    body: '三个原因叠加：locale 不是 UTF-8、字体缺少对应字形、程序按字节而不是按字符计算宽度。',
    code: `locale                 # 期望看到 LANG=zh_CN.UTF-8 或 en_US.UTF-8
wc -L /tmp/out.txt      # 终端宽度，按显示宽度算
# 给 zsh 装宽度处理插件，或统一使用 Nerd Font 覆盖 emoji 区段`,
  },
  {
    title: '粘贴大段文本时终端乱码 / 出现转义序列',
    body: '终端用 bracketed paste（ESC [ 200 ~ 包裹）告诉程序「这段是粘贴进来的，不要逐字符解释」。如果读到的输入里出现 ^[ 之类的乱码，通常是程序自己关掉了 bracketed paste，vim 里的 paste 模式最常见。',
    code: `# vim 里
set paste      # 关闭自动缩进与括号补全
set nopaste`,
  },
  {
    title: 'Vim 里方向键变成 ^[OA / 乱码',
    body: 'TERM 与终端能力不匹配。tmux 里退出到外层终端再打开 vim 试试：确定是 $TERM 设置错了还是程序对终端能力判断失误。',
    code: `echo $TERM
infocmp "$TERM" | head -20
# 常见修正：tmux 内使用 screen/tmux-256color，外层用 xterm-256color`,
  },
  {
    title: '脚本里 docker exec 加不加 -t',
    body: 'exec 进容器跑交互式程序（bash、top、vim）需要 TTY，加 -it；跑管道命令时加 -t 会把 CR 混进输出，CI 里反而更麻烦。',
    code: `docker exec -it web bash            # 交互式：要
docker exec web cat /etc/nginx/nginx.conf   # 管道/重定向：不要`,
  },
  {
    title: '终端滚动缓冲被截断，看不到更早的输出',
    body: '每个终端都有自己的 scrollback 上限。Alacritty 默认 10000 行、kitty 默认 10000 行，WT 的 historySize 默认 9001 行。需要长时间留痕时把输出重定向到文件更可靠。',
    code: `command 2>&1 | tee /tmp/run.log
# 需要同时看屏幕和文件时用 script
script -q /tmp/terminal.log            # macOS
script -q -f /tmp/terminal.log bash   # Linux`,
  },
];

const LINKS: LinkItem[] = [
  { name: 'Alacritty', url: 'https://alacritty.org/', description: 'GPU 加速的极简终端，配置用 TOML', tags: ['终端'] },
  {
    name: 'Kitty',
    url: 'https://sw.kovidgoyal.net/kitty/',
    description: 'GPU 加速 + 自有图形协议，配置为 key value 风格',
    tags: ['终端'],
  },
  {
    name: 'WezTerm',
    url: 'https://wezterm.org/',
    description: 'Lua 配置 + 跨平台，内置 mux 与 wezterm CLI',
    tags: ['终端'],
  },
  { name: 'Ghostty', url: 'https://ghostty.org/', description: '原生体验优先的终端，配置为 INI 风格', tags: ['终端'] },
  {
    name: 'iTerm2',
    url: 'https://iterm2.com/',
    description: 'macOS 终端，文档里的 Profiles 说明最全',
    tags: ['终端', 'macOS'],
  },
  {
    name: 'Windows Terminal',
    url: 'https://learn.microsoft.com/windows/terminal/',
    description: 'Windows 默认终端，官方文档与快捷键列表',
    tags: ['终端', 'Windows'],
  },
  {
    name: 'tmux',
    url: 'https://github.com/tmux/tmux/wiki/Getting-Started',
    description: '会话复用与分屏，官方 wiki 速查最实用',
    tags: ['终端复用'],
  },
  {
    name: 'zellij',
    url: 'https://zellij.dev/',
    description: '开箱即用的 tmux 替代，有布局与插件系统',
    tags: ['终端复用'],
  },
  { name: 'mosh', url: 'https://mosh.org/', description: 'UDP 传输的 SSH 替代品，弱网与漫游更友好', tags: ['远程'] },
  { name: 'Atuin', url: 'https://atuin.sh/', description: '带 UI 的 shell 历史库，支持跨设备同步', tags: ['历史'] },
  {
    name: 'starship',
    url: 'https://starship.rs/',
    description: '跨 shell 的提示符，配置文件为 TOML',
    tags: ['提示符'],
  },
  {
    name: 'powerlevel10k',
    url: 'https://github.com/romkatv/powerlevel10k',
    description: 'zsh 最流行的提示符主题，配置向导会生成 .p10k.zsh',
    tags: ['提示符', 'zsh'],
  },
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

export default function Terminal() {
  const [tab, setTab] = useState<Tab>('compare');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ConfigKind>('alacritty');
  const [options, setOptions] = useState<ConfigOptions>(DEFAULT_OPTIONS);

  const filteredTerminals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TERMINALS;
    return TERMINALS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return KEY_MAP;
    return KEY_MAP.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredTmux = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TMUX_KEYS;
    return TMUX_KEYS.filter((row) => `${row.keys} ${row.meaning}`.toLowerCase().includes(q));
  }, [query]);

  const configMeta = CONFIG_KINDS.find((item) => item.value === kind) ?? CONFIG_KINDS[0];
  const config = useMemo(() => buildConfig(kind, options), [kind, options]);

  return (
    <ToolPanel
      title="现代终端模拟器导航"
      description={`${TERMINALS.length} 款终端选型对比、12 类配置文件生成、tmux 与快捷键速查`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索终端、配置、快捷键" />}
    >
      <Note tone="warn" title="定位说明">
        浏览器扩展拿不到 PTY、终端尺寸变化、信号与 GPU 渲染上下文，<b>无法提供真正的终端模拟器</b>。
        本工具提供的是：选型对比、配置文件生成、快捷键与排障速查。真正跑命令请用本机终端或 tmux。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'compare' && <Monitor className="size-3.5" />}
                {item.value === 'config' && <Settings2 className="size-3.5" />}
                {item.value === 'tmux' && <SquareTerminal className="size-3.5" />}
                {item.value === 'keys' && <Keyboard className="size-3.5" />}
                {item.value === 'faq' && <TriangleAlert className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'compare' && (
        <Section title="终端与复用器对比" description="字段来自各项目官方文档，配置格式与能力差异较稳定">
          {filteredTerminals.length === 0 ? (
            <EmptyHint>没有匹配的终端</EmptyHint>
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
                  </tr>
                </thead>
                <tbody>
                  {filteredTerminals.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.name}</td>
                      {COMPARE_COLUMNS.map((column) => (
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
          <Hint>
            「会话持久化」指断线/重启后能否回到原来的会话：终端本身大多没有，只有 tmux
            这类复用器把「会话」当成一等公民。
          </Hint>
        </Section>
      )}

      {tab === 'config' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项" description="按需填写，生成结果可直接复制或下载">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="字体" value={options.font} onChange={(font) => setOptions({ ...options, font })} />
              <TextField
                label="字号"
                type="number"
                value={String(options.size)}
                onChange={(value) => setOptions({ ...options, size: Number(value) || 12 })}
              />
              <Select
                label="配色主题"
                value={options.theme}
                onChange={(theme) => setOptions({ ...options, theme })}
                options={THEMES}
              />
              <TextField
                label="背景不透明度"
                type="number"
                value={String(options.opacity)}
                onChange={(value) => setOptions({ ...options, opacity: Number(value) })}
                hint="0.9 左右比较舒服，纯透明会影响可读性"
              />
              <TextField
                label="内边距"
                type="number"
                value={String(options.padding)}
                onChange={(value) => setOptions({ ...options, padding: Number(value) })}
              />
              <Select
                label="光标形状"
                value={options.cursor}
                onChange={(cursor) => setOptions({ ...options, cursor })}
                options={CURSOR_OPTIONS}
              />
              <TextField
                label="滚动历史行数"
                type="number"
                value={String(options.scrollback)}
                onChange={(value) => setOptions({ ...options, scrollback: Number(value) || 1000 })}
              />
              <TextField
                label="新建标签快捷键"
                value={options.keyNewTab}
                onChange={(keyNewTab) => setOptions({ ...options, keyNewTab })}
              />
              <TextField
                label="分屏快捷键"
                value={options.keySplit}
                onChange={(keySplit) => setOptions({ ...options, keySplit })}
              />
              <TextField
                label="复制快捷键"
                value={options.keyCopy}
                onChange={(keyCopy) => setOptions({ ...options, keyCopy })}
              />
              <TextField
                label="启动命令（可选）"
                value={options.startup}
                onChange={(startup) => setOptions({ ...options, startup })}
                hint="会写进配置的注释或 tmux startup 部分"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox
                label="启用连字"
                checked={options.ligatures}
                onChange={(ligatures) => setOptions({ ...options, ligatures })}
              />
              <Checkbox
                label="光标闪烁"
                checked={options.cursorBlink}
                onChange={(cursorBlink) => setOptions({ ...options, cursorBlink })}
              />
            </div>
          </Section>

          <Section
            title="配置预览"
            description="按上方选项生成，请先阅读对应的官方文档再覆盖原文件"
            actions={
              <Select
                ariaLabel="选择终端配置类型"
                value={kind}
                onChange={(value) => setKind(value as ConfigKind)}
                options={CONFIG_KINDS.map((item) => ({ value: item.value, label: item.label }))}
                className="w-56"
              />
            }
          >
            <CodeBlock
              code={config}
              language={configMeta.language}
              title={configMeta.label}
              filename={configMeta.file}
              mime={configMeta.mime}
              lineNumbers
              maxHeight="28rem"
              maxLines={220}
            />
            <Note tone="warn" title="覆盖前先备份">
              配置文件写坏会导致终端起不来。建议先 <code className="font-mono">cp 原文件 原文件.bak</code>，
              确认新配置能正常打开再删掉备份；iTerm2 优先用图形界面改设置，不要直接编辑 plist。
            </Note>
          </Section>
        </div>
      )}

      {tab === 'tmux' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Note tone="info" title="prefix 是什么">
            tmux 所有快捷键都先按 <b>prefix</b>（默认 <code className="font-mono">Ctrl-b</code>），
            松开后再按第二个键。整体是「按两下」的节奏，所以不会有单键冲突。 想换键就在配置里写{' '}
            <code className="font-mono">unbind C-b &amp;&amp; set -g prefix C-a &amp;&amp; bind C-a send-prefix</code>。
          </Note>

          <Section title="常用快捷键" description={`共 ${TMUX_KEYS.length} 条，默认 prefix 为 Ctrl-b`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">按键</th>
                    <th className="py-1.5 pr-2 font-medium">作用</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTmux.map((row) => (
                    <tr key={row.keys} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-mono whitespace-nowrap">{row.keys}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="脚本化用法" description="把 tmux 当成可编程的会话管理器">
            <div className="flex flex-col gap-2">
              {TMUX_SCRIPTS.map((script) => (
                <CodeBlock
                  key={script.title}
                  code={script.code}
                  language={script.language}
                  title={script.title}
                  filename={`${script.title}.sh`}
                  maxHeight="18rem"
                />
              ))}
            </div>
            <Hint>
              <span className="inline-flex items-center gap-1">
                <ScrollText className="size-3" />
                记住 <code className="font-mono">tmux new -A -s name</code> 这一个习惯，服务器上的体验会完全不同。
              </span>
            </Hint>
          </Section>
        </div>
      )}

      {tab === 'keys' && (
        <Section title="快捷键对照" description="同一操作在不同终端里的按键差异，空白表示没有内置功能">
          {filteredKeys.length === 0 ? (
            <EmptyHint>没有匹配的快捷键</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">操作</th>
                    <th className="py-1.5 pr-2 font-medium">macOS Terminal</th>
                    <th className="py-1.5 pr-2 font-medium">iTerm2</th>
                    <th className="py-1.5 pr-2 font-medium">Alacritty</th>
                    <th className="py-1.5 pr-2 font-medium">Windows Terminal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((row) => (
                    <tr key={row.action} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium">{row.action}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.macTerm}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.iterm}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.alacritty}</td>
                      <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.windows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint>Alacritty 刻意只做终端不做标签页与分屏管理，这部分交给 tmux 是它的推荐用法。</Hint>
        </Section>
      )}

      {tab === 'faq' && (
        <div className="flex min-w-0 flex-col gap-3">
          {FAQS.map((item) => (
            <Section key={item.title} title={item.title}>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{item.body}</p>
              {item.code && (
                <CodeBlock code={item.code} language="shell" title={item.title} lineNumbers={false} maxHeight="20rem" />
              )}
            </Section>
          ))}
          <Section title="手动复制" description="想一次性带走这些速查">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copyText(
                  [
                    '# 终端速查（由「现代终端模拟器导航」导出）',
                    '',
                    '## tmux',
                    ...TMUX_KEYS.map((row) => `${row.keys}\t${row.meaning}`),
                    '',
                    '## 快捷键对照',
                    ['操作', 'macOS Terminal', 'iTerm2', 'Alacritty', 'Windows Terminal'].join('\t'),
                    ...KEY_MAP.map((row) =>
                      [row.action, row.macTerm, row.iterm, row.alacritty, row.windows].join('\t'),
                    ),
                  ].join('\n'),
                )
              }
            >
              复制全部速查为文本
            </Button>
          </Section>
        </div>
      )}

      <Section title="官方入口" description="配置文件格式与快捷键以官方文档为准">
        <LinkList items={LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}
