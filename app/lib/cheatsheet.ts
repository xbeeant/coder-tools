/**
 * 「开发辅助」导航类工具的静态数据与纯逻辑：编辑器配置生成、AI 提示词库、
 * AI 工具选型、代码托管平台对比、CLI 速查、协作规范与配置片段。
 * 全部为离线数据与纯函数，不含 React，也不做任何网络请求。
 */

// ── 编辑器 / IDE ──────────────────────────────────────────────

export type EditorId =
  | 'vscode'
  | 'cursor'
  | 'jetbrains'
  | 'nvim'
  | 'sublime'
  | 'zed'
  | 'emacs'
  | 'vim'
  | 'visualstudio'
  | 'windsurf'
  | 'trae';

export interface EditorOption {
  id: EditorId;
  name: string;
  family: 'vscode' | 'jetbrains' | 'vim' | 'other';
  note: string;
  site: string;
}

export const EDITORS: EditorOption[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    family: 'vscode',
    note: '扩展生态最全，LSP / DAP 标准实现',
    site: 'https://code.visualstudio.com/',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    family: 'vscode',
    note: 'VS Code 分支，内置 AI 编辑与 Tab 补全',
    site: 'https://cursor.com/',
  },
  {
    id: 'windsurf',
    name: 'WindSurf',
    family: 'vscode',
    note: 'Codeium 系的 VS Code 分支，Cascade 智能体',
    site: 'https://windsurf.com/',
  },
  {
    id: 'trae',
    name: 'Trae',
    family: 'vscode',
    note: '字节的 VS Code 分支，中文体验与内置 AI',
    site: 'https://www.trae.ai/',
  },
  {
    id: 'jetbrains',
    name: 'JetBrains 全家桶',
    family: 'jetbrains',
    note: 'IDEA / WebStorm / PyCharm / GoLand / RustRover 等共用平台',
    site: 'https://www.jetbrains.com/idea/',
  },
  {
    id: 'nvim',
    name: 'Neovim',
    family: 'vim',
    note: 'Lua 配置 + LSP/DAP 内置，插件生态现代',
    site: 'https://neovim.io/',
  },
  { id: 'vim', name: 'Vim', family: 'vim', note: '最通用的键盘编辑器，配置为 VimL', site: 'https://www.vim.org/' },
  {
    id: 'sublime',
    name: 'Sublime Text',
    family: 'other',
    note: '极快的启动与多光标，Package 生态',
    site: 'https://www.sublimetext.com/',
  },
  { id: 'zed', name: 'Zed', family: 'other', note: 'Rust 编写的高性能编辑器，内置协作与 AI', site: 'https://zed.dev/' },
  {
    id: 'emacs',
    name: 'Emacs',
    family: 'other',
    note: '可编程为操作系统，Lisp 扩展',
    site: 'https://www.gnu.org/software/emacs/',
  },
  {
    id: 'visualstudio',
    name: 'Visual Studio',
    family: 'other',
    note: 'Windows 上 .NET/C++ 主力 IDE',
    site: 'https://visualstudio.microsoft.com/',
  },
];

export function editorById(id: EditorId): EditorOption {
  return EDITORS.find((editor) => editor.id === id) ?? EDITORS[0];
}

export const INDENT_STYLES = [
  { value: 'space', label: '空格（space）' },
  { value: 'tab', label: '制表符（tab）' },
];

/** .editorconfig 生成器：各编辑器与工具链都识别的跨编辑器格式。 */
export interface EditorConfigOptions {
  indentStyle: 'space' | 'tab';
  indentSize: number;
  endOfLine: 'lf' | 'crlf' | 'cr';
  charset: 'utf-8' | 'utf-8-bom' | 'utf-16';
  finalNewline: boolean;
  trimTrailingWhitespace: boolean;
  insertFinalNewline: boolean;
  maxLineLength: number;
}

export const DEFAULT_EDITORCONFIG: EditorConfigOptions = {
  indentStyle: 'space',
  indentSize: 2,
  endOfLine: 'lf',
  charset: 'utf-8',
  finalNewline: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  maxLineLength: 120,
};

export function buildEditorconfig(options: EditorConfigOptions): string {
  const lines = ['root = true', ''];
  lines.push('[*]');
  lines.push(`indent_style = ${options.indentStyle}`);
  lines.push(`indent_size = ${options.indentSize}`);
  lines.push(
    options.indentStyle === 'tab'
      ? `# tab_width = ${options.indentSize}  # tab 宽度需与编辑器 tabSize 保持一致`
      : `tab_width = ${options.indentSize}`,
  );
  lines.push(`end_of_line = ${options.endOfLine}`);
  lines.push(`charset = ${options.charset}`);
  if (options.maxLineLength > 0) lines.push(`max_line_length = ${options.maxLineLength}`);
  lines.push(`trim_trailing_whitespace = ${options.trimTrailingWhitespace}`);
  lines.push(`insert_final_newline = ${options.insertFinalNewline}`);
  lines.push(`final_newline = ${options.finalNewline}`);
  lines.push('');
  lines.push('# 以下按语言覆盖常见分歧');
  lines.push('[*.{js,jsx,ts,tsx,json,css,scss,html,vue,svelte,yaml,yml}]');
  lines.push('indent_size = 2');
  lines.push('');
  lines.push('[Makefile]');
  lines.push('indent_style = tab');
  lines.push('');
  lines.push('[*.{py,go,rs}]');
  lines.push('indent_size = 4');
  lines.push('');
  lines.push('[*.md]');
  lines.push('trim_trailing_whitespace = false');
  return lines.join('\n');
}

export interface VscodeSettingsOptions {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  formatOnSave: boolean;
  formatter: 'biome' | 'prettier' | 'none';
  lintOnSave: 'eslint' | 'biome' | 'none';
  eol: 'lf' | 'crlf';
  theme: 'default' | 'dark' | 'light' | 'high-contrast';
  wordWrap: 'off' | 'on' | 'wordWrapColumn';
  excludeDirs: string;
}

/** VS Code / VS Code 分支的 settings.json 片段。 */
export function buildVscodeSettings(options: VscodeSettingsOptions): string {
  const settings: Record<string, unknown> = {
    'editor.fontFamily': options.fontFamily,
    'editor.fontSize': options.fontSize,
    'editor.fontLigatures': true,
    'editor.tabSize': options.tabSize,
    'editor.insertSpaces': options.insertSpaces,
    'editor.renderWhitespace': 'selection',
    'editor.formatOnSave': options.formatOnSave,
    'editor.codeActionsOnSave': {} as Record<string, string>,
    'editor.wordWrap': options.wordWrap,
    'files.eol': options.eol,
    'files.trimTrailingWhitespace': true,
    'files.insertFinalNewline': true,
    'files.exclude': {
      '**/.git': true,
      '**/node_modules': true,
      '**/dist': true,
      '**/.next': true,
      '**/.output': true,
      '**/coverage': true,
    },
    'search.exclude': {
      '**/node_modules': true,
      '**/dist': true,
      '**/*.min.js': true,
      '**/pnpm-lock.yaml': true,
      '**/bun.lock': true,
    },
    'files.watcherExclude': {
      '**/.git/objects/**': true,
      '**/node_modules/**': true,
      '**/dist/**': true,
    },
    'search.useIgnoreFiles': true,
    'terminal.integrated.defaultProfile.linux': 'bash',
    'terminal.integrated.defaultProfile.osx': 'zsh',
    'terminal.integrated.defaultProfile.windows': 'PowerShell',
    'workbench.colorTheme': `Default Dark Modern`,
    'workbench.startupEditor': 'none',
    'typescript.tsdk': 'node_modules/typescript/lib',
    'editor.rulers': [120],
  };
  if (options.wordWrap === 'wordWrapColumn') settings['editor.wordWrapColumn'] = 100;
  if (options.excludeDirs.trim() !== '') {
    const extra = options.excludeDirs
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => [item, true]);
    Object.assign(settings['search.exclude'] as Record<string, boolean>, Object.fromEntries(extra));
  }
  if (options.formatOnSave) {
    const actions = settings['editor.codeActionsOnSave'] as Record<string, string>;
    if (options.lintOnSave === 'biome') {
      actions['source.fixAll.biome'] = 'explicit';
      actions['source.organizeImports.biome'] = 'explicit';
    } else if (options.lintOnSave === 'eslint') {
      actions['source.fixAll.eslint'] = 'explicit';
      actions['source.organizeImports.eslint'] = 'explicit';
    }
    if (options.formatter === 'biome') actions['biome.formatDocument'] = 'explicit';
    else if (options.formatter === 'prettier') actions['editor.action.formatDocument'] = 'explicit';
    if (Object.keys(actions).length === 0) delete settings['editor.codeActionsOnSave'];
  }
  if (options.theme === 'light') settings['workbench.colorTheme'] = 'Default Light Modern';
  if (options.theme === 'high-contrast') settings['workbench.colorTheme'] = 'Default High Contrast';
  if (options.theme === 'default' || options.theme === 'dark') settings['workbench.colorTheme'] = 'Default Dark Modern';
  return `// 合并到 .vscode/settings.json（用户设置不会被覆盖，只有工作区设置生效）\n{\n${JSON.stringify(settings, null, 2)}\n}\n`;
}

export function buildVscodeLaunch(): string {
  return `// .vscode/launch.json —— Node 调试配置
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "调试当前文件 (Node)",
      "type": "node",
      "request": "launch",
      "program": "\${file}",
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },
    {
      "name": "npm 脚本：dev",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },
    {
      "name": "调试当前测试文件 (Vitest)",
      "type": "node",
      "request": "launch",
      "program": "\${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "\${file}"],
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
    },
    {
      "name": "附加到 Node 进程 (端口 9229)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
`;
}

export function buildVscodeTasks(): string {
  return `// .vscode/tasks.json —— 常用脚本的快捷任务
{
  "version": "2.0.0",
  "tasks": [
    { "label": "build", "type": "shell", "command": "npm run build", "problemMatcher": [] },
    { "label": "test", "type": "shell", "command": "npm test", "group": { "kind": "test", "isDefault": true } },
    { "label": "lint", "type": "shell", "command": "npm run lint", "group": { "kind": "test", "isDefault": true } },
    { "label": "typecheck", "type": "shell", "command": "tsc --noEmit", "problemMatcher": ["$tsc"] }
  ]
}
`;
}

export interface ExtensionGroup {
  label: string;
  ids: string[];
}

export const VSCODE_EXTENSIONS: ExtensionGroup[] = [
  { label: '语言基础', ids: ['dbaeumer.vscode-eslint', 'biomejs.biome', 'esbenp.prettier-vscode'] },
  {
    label: 'TypeScript / JavaScript',
    ids: ['typescriptteam.vscode-typescript-next', 'dsznaj.es7-en-js', 'yoavbls.pretty-ts-errors'],
  },
  { label: '测试', ids: ['vitest.explorer', 'ms-playwright.playwright', 'jest-schemer.jest-test-runner'] },
  {
    label: '容器与云',
    ids: ['ms-azuretools.vscode-docker', 'ms-kubernetes-tools.vscode-kubernetes-tools', 'redhat.vscode-yaml'],
  },
  {
    label: 'Git 与协作',
    ids: ['eamodio.gitlens', 'github.vscode-pull-request-github', 'github.vscode-github-actions'],
  },
  {
    label: '效率',
    ids: [
      'editorconfig.editorconfig',
      'esbenp.prettier-vscode',
      'zhuangtongfa.material-theme',
      'usernamehw.errorlens',
      'e999018.ai-assistant',
    ],
  },
  { label: '中文与本地化', ids: ['ms-ceintl.vscode-language-pack-zh-hans'] },
];

/** 把扩展清单转成 extensions.json 的 recommendations 数组。 */
export function buildVscodeExtensions(): string {
  const ids = [...new Set(VSCODE_EXTENSIONS.flatMap((group) => group.ids))];
  return `// .vscode/extensions.json —— 团队统一编辑器环境
{
  "recommendations": ${JSON.stringify(ids, null, 2)},
  "unwantedRecommendations": ["ms-vscode.cpptools-extension-pack"]
}
`;
}

export interface ShortcutRow {
  action: string;
  vscode: string;
  jetbrains: string;
  vim: string;
  sublime: string;
}

/** 同一操作在四个编辑器里的按键对照。 */
export const SHORTCUT_TABLE: ShortcutRow[] = [
  {
    action: '命令面板',
    vscode: 'Ctrl/Cmd + Shift + P',
    jetbrains: 'Shift + Search（双击）',
    vim: ':  然后输入命令',
    sublime: 'Ctrl/Cmd + Shift + P',
  },
  {
    action: '快速打开文件',
    vscode: 'Ctrl/Cmd + P',
    jetbrains: 'Ctrl/Cmd + N（macOS 为 ⌘O）',
    vim: 'Ctrl + P / <C-p>',
    sublime: 'Ctrl/Cmd + P',
  },
  {
    action: '全局搜索',
    vscode: 'Ctrl/Cmd + Shift + F',
    jetbrains: 'Shift + Shift（Search Everywhere）',
    vim: '/ 或 :vimgrep',
    sublime: 'Ctrl/Cmd + Shift + F',
  },
  { action: '转到定义', vscode: 'F12', jetbrains: 'Ctrl/Cmd + B', vim: 'gd（插件）', sublime: 'F12' },
  {
    action: '查看引用',
    vscode: 'Shift + F12',
    jetbrains: 'Alt + F7 / ⌥F7',
    vim: 'gD（插件）',
    sublime: 'Alt + Shift + R',
  },
  { action: '重命名符号', vscode: 'F2', jetbrains: 'Shift + F6', vim: ':Rename（插件）', sublime: 'F2' },
  {
    action: '快速修复',
    vscode: 'Ctrl/Cmd + .',
    jetbrains: 'Alt + Enter',
    vim: 'vim-lsp 的 K（诊断跳转）',
    sublime: 'Ctrl/Cmd + .',
  },
  {
    action: '格式化文档',
    vscode: 'Shift + Alt + F',
    jetbrains: 'Ctrl/Cmd + Alt + L',
    vim: 'gg=G',
    sublime: 'Ctrl/Cmd + Alt + F',
  },
  {
    action: '注释切换',
    vscode: 'Ctrl/Cmd + /',
    jetbrains: 'Ctrl/Cmd + /',
    vim: 'gcc（插件）',
    sublime: 'Ctrl/Cmd + /',
  },
  {
    action: '上下移动行',
    vscode: 'Alt + ↑/↓',
    jetbrains: 'Alt + Shift + ↑/↓',
    vim: 'J / K（插件）或 Ctrl+d',
    sublime: 'Ctrl/Cmd + Alt + ↑/↓',
  },
  {
    action: '复制行到下方',
    vscode: 'Shift + Alt + ↓',
    jetbrains: 'Ctrl/Cmd + D',
    vim: 'yy p（插件）',
    sublime: 'Ctrl/Cmd + Shift + Alt + ↓',
  },
  {
    action: '删除整行',
    vscode: 'Ctrl/Cmd + Shift + K',
    jetbrains: 'Ctrl/Cmd + Backspace',
    vim: 'dd',
    sublime: 'Ctrl/Cmd + Shift + K',
  },
  {
    action: '多光标',
    vscode: 'Alt + Click / Ctrl + Alt + ↓',
    jetbrains: 'Ctrl/Cmd + Click（列选 Alt+Shift+Click）',
    vim: 'Ctrl + v（块选）',
    sublime: 'Ctrl/Cmd + Click',
  },
  {
    action: '重命名文件',
    vscode: 'F2（资源管理器）',
    jetbrains: 'Shift + F6（重构重命名）',
    vim: ':saveas',
    sublime: 'F2',
  },
  {
    action: '折叠 / 展开代码',
    vscode: 'Ctrl/Cmd + Shift + [ / ]',
    jetbrains: 'Ctrl/Cmd + Shift + - / +',
    vim: 'zc / zA',
    sublime: 'Ctrl/Cmd + Shift + [ / ]',
  },
  {
    action: '跳转到文件中的符号',
    vscode: 'Ctrl/Cmd + Shift + O',
    jetbrains: 'Ctrl/Cmd + F12',
    vim: 'Ctrl + ]（插件）',
    sublime: 'Ctrl/Cmd + R',
  },
  {
    action: '运行 / 调试',
    vscode: 'F5',
    jetbrains: 'Shift + F9 / F9',
    vim: ':lua require("dap").continue()',
    sublime: 'Ctrl/Cmd + B',
  },
  {
    action: '终端',
    vscode: 'Ctrl/Cmd + `',
    jetbrains: 'Alt + F12（macOS ⌥F12）',
    vim: ':terminal / :!cmd',
    sublime: 'Ctrl/Cmd + `（需插件）',
  },
  {
    action: '切换标签页',
    vscode: 'Ctrl/Cmd + Alt + ←/→',
    jetbrains: 'Alt + ←/→',
    vim: 'gt / gT',
    sublime: 'Ctrl/Cmd + Alt + ←/→',
  },
];

export const JETBRAINS_MAC = [
  { action: '查找全文', keys: 'Shift + Shift' },
  { action: '转到声明', keys: '⌘ + B' },
  { action: '显示用法', keys: '⌥ + F7' },
  { action: '重构菜单', keys: 'Ctrl + T' },
  { action: '重命名', keys: '⇧ + F6' },
  { action: '快速修复', keys: '⌥ + Enter' },
  { action: '格式化代码', keys: '⌥ + ⌘ + L' },
  { action: '优化导入', keys: '⌃ + ⌥ + O' },
  { action: '运行', keys: '⌃ + R' },
  { action: '调试', keys: '⇧ + F9' },
  { action: '终端', keys: '⌥ + F12' },
  { action: '项目树搜索', keys: '⌘ + N（在 Project 窗口）/ ⌘ + E' },
  { action: '切换视图', keys: '⌘ + 1 … ⌘ + 9' },
  { action: '导航后退 / 前进', keys: '⌃ + [ / ⌃ + ]' },
];

export const JETBRAINS_PC = [
  { action: '查找全文', keys: 'Shift + Shift' },
  { action: '转到声明', keys: 'Ctrl + B' },
  { action: '显示用法', keys: 'Alt + F7' },
  { action: '重构菜单', keys: 'Ctrl + Alt + R' },
  { action: '重命名', keys: 'Shift + F6' },
  { action: '快速修复', keys: 'Alt + Enter' },
  { action: '格式化代码', keys: 'Ctrl + Alt + L' },
  { action: '优化导入', keys: 'Ctrl + Alt + O' },
  { action: '运行', keys: 'Shift + F10' },
  { action: '调试', keys: 'Shift + F9' },
  { action: '终端', keys: 'Alt + F12' },
  { action: '项目树搜索', keys: 'Ctrl + N / Ctrl + E' },
  { action: '切换视图', keys: 'Alt + 1 … Alt + 9' },
  { action: '导航后退 / 前进', keys: 'Alt + ← / Alt + →' },
];

export const VIM_KEYS: { group: string; items: { keys: string; desc: string }[] }[] = [
  {
    group: '移动',
    items: [
      { keys: 'h j k l', desc: '左 / 下 / 上 / 右' },
      { keys: 'w / b / e', desc: '词首 / 词尾 / 词尾字符' },
      { keys: '0 / ^ / $', desc: '行首 / 首个非空字符 / 行尾' },
      { keys: 'gg / G', desc: '文件首行 / 文件末行' },
      { keys: '{n}G 或 :{n}', desc: '跳到第 n 行' },
      { keys: 'Ctrl + d / u', desc: '半屏下移 / 上移' },
      { keys: 'Ctrl + f / b', desc: '整屏下移 / 上移' },
      { keys: 'f{char} / t{char}', desc: '跳到本行下一个 {char}（t 停在字符前）' },
      { keys: '%', desc: '在配对的括号间跳转' },
      { keys: '* / #', desc: '搜索光标词的下一次 / 上一次出现' },
    ],
  },
  {
    group: '编辑',
    items: [
      { keys: 'x / dw / d$', desc: '删字符 / 删词 / 删到行尾' },
      { keys: 'dd / yy / p', desc: '删行 / 复制行 / 粘贴' },
      { keys: 'ciw', desc: '改写光标所在词（change inner word）' },
      { keys: 'u / Ctrl + r', desc: '撤销 / 重做' },
      { keys: '.', desc: '重复上一次修改' },
      { keys: '>> / <<', desc: '增加 / 减少缩进' },
      { keys: 'Ctrl + v', desc: '可视块（列选），I 进入，Esc 退出' },
      { keys: 'o / O', desc: '在下方 / 上方开新行' },
    ],
  },
  {
    group: '窗口与文件',
    items: [
      { keys: ':split / :vsplit', desc: '水平 / 垂直分屏' },
      { keys: 'Ctrl + w h/j/k/l', desc: '切换到左/下/上/右窗口' },
      { keys: 'Ctrl + w = / + / -', desc: '等宽 / 放大 / 缩小' },
      { keys: 'Ctrl + w q', desc: '关闭当前窗口' },
      { keys: ':bd / :bfirst / :blast', desc: '删除缓冲 / 首个缓冲 / 末个缓冲' },
      { keys: ':bn / :bp', desc: '下一个 / 上一个缓冲' },
    ],
  },
  {
    group: '宏与标签页',
    items: [
      { keys: 'qa / qb', desc: '开始录制 a 宏 / 录制到 b 宏' },
      { keys: '@a / 100@a', desc: '执行 a 宏 1 次 / 100 次' },
      { keys: 'gt / gT', desc: '下一个 / 上一个标签页' },
      { keys: '{n}gt', desc: '跳到第 n 个标签页' },
    ],
  },
  {
    group: '宏录制建议',
    items: [
      { keys: 'qaq', desc: '录制 a 宏：qa 开始，q 停止，最后一个 a 是寄存器名' },
      { keys: ':normal @a', desc: '在命令行直接回放宏' },
      { keys: ':help', desc: '所有疑问都以 :help 开头（内置超全文档）' },
    ],
  },
];

export const NVIM_INIT_LUA = `-- ~/.config/nvim/init.lua —— Neovim 最小可用配置
vim.g.mapleader = ' '

-- 文件类型检测与缩进
vim.filetype plugin indent on
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.updatetime = 250
vim.opt.termguicolors = true

-- 剪贴板（macOS 为 pbcopy，Linux 需 xclip）
vim.opt.clipboard = 'unnamedplus'

-- 语法与 treesitter
vim.cmd([[
  require('nvim-treesitter').setup({})
  require('nvim-treesitter.configs').setup({
    highlight = { enable = true },
    ensure_installed = { 'lua', 'vim', 'vimdoc', 'query', 'markdown', 'markdown_inline' },
  })
]])

-- 插件管理：lazy.nvim（把 github.com/ 前缀补全为 https://github.com/）
require('lazy').setup({
  spec = {
    { 'folke/lazy.nvim', version = '*', priority = 10000 },
    { 'folke/lazydev.nvim', version = '*', priority = 10000 },
  },
  -- jellybeans：把 LSP 状态映射到提示符
  { 'arcticiceless/jellybeans', opts = { custom = { icons = true, highlight = true } } },
  {
    'neovim/nvim-lspconfig',
    event = 'LspAttach',
    opts = {
      servers = {
        ts_ls = {},
        pyright = {},
        gopls = {},
        rust_analyzer = {},
        bashls = {},
        gitsigns = { enable = true },
      },
    },
  },
  { 'nvim-neo-tree/neo-tree.nvim', cmd = 'NeoTree' },
})
`;

export const VIMRC = `" ~/.vimrc —— Vim 最小可用配置
set nocompatible
syntax on
filetype plugin indent on

set tabstop=2 shiftwidth=2 expandtab
set number relativenumber
set ignorecase smartcase
set hlsearch
set incsearch
set undofile
set updatetime=250
set backspace=indent,eol,start
set clipboard=unnamedplus

" 保存时去掉行尾空白
autocmd BufWritePre * if &filetype != &ft | %s/\\s\\+$//e | endif
" F 映射：选中内容后按 F 即可格式化
command! -nargs=* -range=% Lint !<C-O>silent !biome check --write --stdin-file-path %:p <C-R>lines<CR>
`;

export const INDENT_TABLE: { language: string; vscode: string; jetbrains: string; note: string }[] = [
  {
    language: 'TypeScript / JavaScript',
    vscode: 'tabSize 2 · space',
    jetbrains: 'Default（4）→ 建议改为 2',
    note: 'Prettier / Biome 官方默认 2',
  },
  { language: 'JSON / YAML', vscode: 'tabSize 2 · space', jetbrains: '2 spaces', note: 'JSON 严格来说无缩进语义' },
  {
    language: 'Python',
    vscode: 'tabSize 4 · space',
    jetbrains: '4 spaces（默认）',
    note: 'PEP 8 规定 4 空格，禁止 Tab',
  },
  { language: 'Go', vscode: 'tabSize 4 · space', jetbrains: 'Default（4）', note: 'gofmt 会统一成 Tab（显示宽度 8）' },
  { language: 'Rust', vscode: 'tabSize 4 · space', jetbrains: '4 spaces', note: 'rustfmt 默认 4 空格' },
  { language: 'Java / Kotlin', vscode: 'tabSize 4 · space', jetbrains: '4 spaces', note: '官方风格 4 空格' },
  {
    language: 'C / C++ / C#',
    vscode: 'tabSize 4 · space',
    jetbrains: '4 spaces',
    note: '微软风格 4 空格，Linux 内核为 Tab',
  },
  { language: 'Shell', vscode: 'tabSize 2 · space', jetbrains: '2 spaces', note: 'ShellCheck 建议 2/4 空格' },
  { language: 'HTML / CSS / Vue', vscode: 'tabSize 2 · space', jetbrains: '2 spaces', note: '与 JS 保持一致便于嵌套' },
  {
    language: 'Makefile',
    vscode: 'tabSize 8 · tab',
    jetbrains: 'Use Tab（4 / 8 宽度）',
    note: '必须用 Tab，否则 make 报错',
  },
];

export interface CapabilityRow {
  capability: string;
  tech: string;
  detail: string;
  where: string;
}

/** 「IDE 能力由什么技术承担」——理解编辑器生态的骨架知识。 */
export const CAPABILITY_MATRIX: CapabilityRow[] = [
  {
    capability: '语法高亮',
    tech: 'TextMate / Tree-sitter / LSP 语义标记',
    detail: '早期靠 TextMate 正则语法，新编辑器多用 Tree-sitter 增量解析；LSP 还能叠加语义 token。',
    where: 'VS Code：TextMate + LSP；Neovim：nvim-treesitter；Zed：Tree-sitter',
  },
  {
    capability: '智能补全',
    tech: 'LSP（Completion）+ 局部索引',
    detail: '候选来自语言服务器，跨文件跳转、类型推导靠 LSP；补全排序由客户端策略决定。',
    where: 'typescript-language-server、gopls、pyright',
  },
  {
    capability: '跳转 / 重命名',
    tech: 'LSP（Definition / References / Rename）',
    detail: '重命名是语义化的，会同步修改字符串常量与 import 路径，风险由服务端校验。',
    where: '所有 LSP 客户端（nvim-lspconfig、vscode-languageclient）',
  },
  {
    capability: '调试',
    tech: 'DAP（Debug Adapter Protocol）',
    detail: '编辑器只负责 UI，真实断点/单步由各语言的调试适配器执行，如 js-debug、gdlv。',
    where: 'Vim：vim-dap；Neovim 内置 nvim.dap；Zed：内置 DAP 客户端',
  },
  {
    capability: '内置终端 / 任务',
    tech: 'Shell + PTY + 任务运行器',
    detail: '把构建、测试、lint 收敛成统一入口，避免手工切窗口。',
    where: 'VS Code：Terminal / tasks.json；JetBrains：Run Configurations',
  },
  {
    capability: '插件系统',
    tech: '插件宿主 + 扩展 API',
    detail: 'VS Code 用 Node 扩展宿主（Extension API），JetBrains 有自研 JVM 插件平台，Neovim 用 Lua。',
    where: '各编辑器 Marketplace / Plugin Manager',
  },
  {
    capability: '代码重构',
    tech: '语言专用工具 + 通用 LSP Rename',
    detail: '跨文件语义重构（如改接口签名）通常要靠编译器或专用工具，LSP Rename 只覆盖符号。',
    where: 'JetBrains 内置重构菜单最强；VS Code 靠插件补齐',
  },
  {
    capability: 'Git 集成',
    tech: 'libgit2 / JGit / Git CLI',
    detail: 'VS Code 逐步把 Git 迁到 libgit2 以提速，大仓库仍建议关掉大量后台 fetch。',
    where: 'GitLens、GitHub PR 扩展、IDEA 的 Git 工具窗口',
  },
  {
    capability: '远程开发',
    tech: 'SSH 转发 / 容器 / 虚拟化文件系统',
    detail: '把文件系统与进程搬到远端，本地只做渲染，因此对弱网机器友好。',
    where: 'VS Code Remote-SSH / Dev Containers；JetBrains Gateway',
  },
  {
    capability: 'AI 补全',
    tech: '服务端大模型 + 上下文拼接（本地索引）',
    detail: '核心成本在「取上下文」：光标前后代码、打开文件、符号索引，而非模型本身。',
    where: 'Copilot、Cursor、Zed AI、通义灵码',
  },
];

export const MONACO_SNIPPET = `// 轻量集成方案：用 Monaco 嵌入一个代码编辑框
// 1) 安装依赖（仅在需要 AI 编辑能力的项目中）
//    npm i @monaco-editor/react monaco-editor
// 2) 在扩展页面里使用
import { useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

export default function MiniEditor() {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [value, setValue] = useState('console.log("hi");');
  return (
    <Editor
      height="320px"
      defaultLanguage="typescript"
      theme="vs-dark"
      value={value}
      onChange={(next) => setValue(next ?? '')}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        });
      }}
      options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
    />
  );
}
// 注意：monaco-editor 体积较大（约数 MB），建议按需动态 import，
// 并在扩展清单里确认 CSP 允许 worker 加载。`;

export const EDITOR_LINKS = [
  {
    name: 'VS Code 官网',
    url: 'https://code.visualstudio.com/',
    description: '文档、配置项参考与更新日志',
    tags: ['官方'],
  },
  {
    name: 'VS Code 扩展市场',
    url: 'https://marketplace.visualstudio.com/VSCode',
    description: '搜索扩展 id、查看发布者与评分',
    tags: ['插件'],
  },
  {
    name: 'JetBrains Toolbox',
    url: 'https://www.jetbrains.com/toolbox/',
    description: '统一安装与更新全部 IDE',
    tags: ['官方'],
  },
  {
    name: 'JetBrains 快捷键参考',
    url: 'https://www.jetbrains.com/help/idea/keymap-reference.html',
    description: '各 IDE 默认与自定义键位对照',
    tags: ['快捷键'],
  },
  { name: 'Neovim 文档', url: 'https://neovim.io/doc/user/', description: ':help 同源在线版', tags: ['文档'] },
  {
    name: 'lazy.nvim',
    url: 'https://github.com/folke/lazy.nvim',
    description: 'Neovim 现代插件管理器',
    tags: ['插件'],
  },
  {
    name: 'Sublime Text 插件仓库',
    url: 'https://packagecontrol.io/',
    description: 'Package Control 索引',
    tags: ['插件'],
  },
  { name: 'Zed 官网', url: 'https://zed.dev/', description: '高性能编辑器，内置多人协作', tags: ['官方'] },
  {
    name: 'EditorConfig 标准',
    url: 'https://editorconfig.org/',
    description: '跨编辑器统一缩进与行尾',
    tags: ['规范'],
  },
  {
    name: 'LSP 规范',
    url: 'https://microsoft.github.io/language-server-protocol/',
    description: '理解补全、跳转、重命名如何实现',
    tags: ['协议'],
  },
  {
    name: 'DAP 规范',
    url: 'https://microsoft.github.io/debug-adapter-protocol/',
    description: '调试器如何与编辑器通信',
    tags: ['协议'],
  },
  {
    name: 'Tree-sitter',
    url: 'https://tree-sitter.github.io/tree-sitter/',
    description: '增量解析的语法框架',
    tags: ['语法'],
  },
];

export const PLUGIN_LINKS = [
  {
    name: 'eslint',
    url: 'https://eslint.org/',
    description: '静态检查与自动修复，配合 codeActionsOnSave 效果最好',
    tags: ['lint'],
  },
  {
    name: 'Biome',
    url: 'https://biomejs.dev/',
    description: 'Rust 编写，格式化 + lint + import 整理一体，快 10 倍以上',
    tags: ['lint', 'format'],
  },
  {
    name: 'Prettier',
    url: 'https://prettier.io/',
    description: '社区最流行的格式化器，生态插件最全',
    tags: ['format'],
  },
  { name: 'Vitest', url: 'https://vitest.dev/', description: '与 Vite 同源的测试框架', tags: ['test'] },
  { name: 'Playwright', url: 'https://playwright.dev/', description: '跨浏览器 E2E 测试与抓取', tags: ['test', 'e2e'] },
  {
    name: 'Error Lens',
    url: 'https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens',
    description: '把诊断信息内联显示在出错行末',
    tags: ['效率'],
  },
  {
    name: 'GitLens',
    url: 'https://www.gitkraken.com/gitlens',
    description: '逐行 git blame、历史与作者追踪',
    tags: ['git'],
  },
  {
    name: 'GitHub Pull Request 扩展',
    url: 'https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github',
    description: '在编辑器里评审与合并 PR',
    tags: ['git', '协作'],
  },
  {
    name: 'Docker 扩展',
    url: 'https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker',
    description: '管理镜像、容器、compose 与 Dockerfile 提示',
    tags: ['容器'],
  },
  {
    name: 'Kubernetes 扩展',
    url: 'https://marketplace.visualstudio.com/items?itemName=ms-kubernetes-tools.vscode-kubernetes-tools',
    description: '集群资源浏览、Helm 模板与端口转发',
    tags: ['云原生'],
  },
  {
    name: 'Chinese (Simplified) 语言包',
    url: 'https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans',
    description: '界面、文档与错误信息中文化',
    tags: ['中文'],
  },
  {
    name: 'One Dark Pro 主题',
    url: 'https://marketplace.visualstudio.com/items?itemName=zhuangtongfa.Material-theme',
    description: '经典暗色主题，长时间编码不累',
    tags: ['主题'],
  },
];

// ── AI 编程助手 ──────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  summary: string;
  /** 五段式模板：角色 / 上下文 / 任务 / 约束 / 输出。 */
  role: string;
  context: string;
  task: string;
  constraints: string;
  output: string;
}

/** 把五段式模板渲染为可直接粘贴的完整提示词。 */
export function renderPrompt(template: PromptTemplate): string {
  return [
    `【角色】${template.role}`,
    `【上下文】${template.context}`,
    `【任务】${template.task}`,
    `【约束】${template.constraints}`,
    `【输出】${template.output}`,
  ].join('\n');
}

export const PROMPT_CATEGORIES = [
  '写代码',
  '改代码',
  '调试',
  '评审',
  '测试',
  '文档',
  '工程效率',
  '数据与 SQL',
  '正则与校验',
  '重构与性能',
  '安全',
] as const;

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'p-write',
    category: '写代码',
    title: '从需求写函数',
    summary: '给定输入输出契约，让模型只写一个函数并自带测试',
    role: '你是一名资深 TypeScript 工程师，熟悉 strict 模式与类型收窄。',
    context: '我们在 <仓库/模块> 中新增 <功能名>。相关文件：<文件路径列表>。已有工具函数：<名称>。',
    task: '实现 export function <name>(<参数>): <返回类型>，行为要求：1) … 2) … 3) …',
    constraints: '只使用仓库已有的依赖；不要引入新库；错误处理用 Result 而不是抛异常；不写 console.log。',
    output: '先输出完整代码，再输出 3 条边界情况说明，最后列出你用到的已有工具函数。',
  },
  {
    id: 'p-modify',
    category: '改代码',
    title: '按 diff 改现有文件',
    summary: '给出原文与目标，避免模型重写整个文件',
    role: '你是代码修改助手，只做最小必要改动。',
    context: '文件：<path>。\n--- 原文 ---\n<代码>\n--- 期望 ---\n<目标行为>。',
    task: '把原文改成满足期望的版本，保持函数签名与周边风格不变。',
    constraints: '不要重命名变量、不要调整 import 顺序之外的无关代码、不要删除注释。',
    output: '输出修改后的完整文件，随后用「改动点 / 原因 / 风险」三行列出说明。',
  },
  {
    id: 'p-refactor',
    category: '重构与性能',
    title: '先解释再重构',
    summary: '分两步：先不动代码的诊断，再给重构方案',
    role: '你是重构顾问，优先保证行为等价。',
    context: '模块：<path>。现状：<描述>。痛点：<复杂度/重复/耦合>。测试覆盖：<有/无>。',
    task: '第一步给出问题诊断与重构方案（不写代码）；我确认后再输出重构后的代码。',
    constraints: '行为必须完全等价；公共 API 不变；每步改动可独立提交。',
    output: '先「诊断」「方案 A/B」「迁移步骤」，再在你回复「继续」后给代码。',
  },
  {
    id: 'p-perf',
    category: '重构与性能',
    title: '性能瓶颈定位',
    summary: '要求先给假设和验证手段，而不是直接改代码',
    role: '你是性能工程师，熟悉浏览器渲染管线、事件循环与算法复杂度。',
    context: '场景：<场景>。当前表现：<指标，如首屏 3.2s>。相关代码：<path>。运行环境：<Chrome 120 / Node 20>。',
    task: '列出 3 个最可能的瓶颈，每个给出验证方法与对应改动方案。',
    constraints: '必须说明复杂度变化与可能的副作用；不要凭猜测下结论。',
    output: '表格：瓶颈假设 / 验证方法 / 预期收益 / 改动风险。',
  },
  {
    id: 'p-bug',
    category: '调试',
    title: '从报错定位 bug',
    summary: '必须贴完整报错原文与最小复现步骤',
    role: '你是调试专家，习惯用二分法缩小范围。',
    context: '报错原文：\n<完整 stack>。\n复现步骤：1) … 2) …。\n期望：…\n实际：…\n相关代码：<path>。',
    task: '按「最可能的三个原因 + 如何验证 + 修复方案」输出。',
    constraints: '禁止编造不存在的 API；不确定的地方要显式标注「需确认」。',
    output: '1) 原因排序 2) 每个原因的验证命令 3) 首选修复补丁 4) 回归测试建议。',
  },
  {
    id: 'p-flaky',
    category: '调试',
    title: '分析偶发失败',
    summary: '针对 flaky test，需要给确定性复现策略',
    role: '你是测试稳定性专家。',
    context: '测试：<name>。失败率：约 <x>%。完整输出：<log>。测试框架：<vitest/jest/playwright>。',
    task: '给出可能原因（时序、并发、共享状态、外部依赖）并为每种原因设计复现方法。',
    constraints: '不要建议简单加重试或 sleep 掩盖问题。',
    output: '原因表 + 复现脚本 + 确定性修复。',
  },
  {
    id: 'p-review',
    category: '评审',
    title: '代码评审',
    summary: '按维度给结论，明确「必须改」与「建议改」',
    role: '你是严格但务实的技术负责人。',
    context: '变更：<diff 或 PR 链接说明>。背景：<为什么改>。约束：<不能破坏的兼容性>。',
    task: '评审正确性、可读性、性能、安全、测试覆盖五个维度。',
    constraints: '区分「必须修改」和「可选建议」；不要泛泛而谈「建议加注释」。',
    output: '先给「是否可合并」结论，再按维度列出具体行号与理由。',
  },
  {
    id: 'p-security',
    category: '安全',
    title: '安全审计',
    summary: '按威胁面逐项检查，并给出可利用性判断',
    role: '你是应用安全工程师，熟悉 OWASP Top 10。',
    context: '代码：<path 或 diff>。部署环境：<浏览器/服务端/内网>。信任边界：<说明>。',
    task: '逐项检查注入、XSS、越权、SSRF、反序列化、密钥硬编码、依赖风险。',
    constraints: '每条问题必须给出攻击路径示例；不确定严重度时标注范围。',
    output: '表格：位置 / 类型 / 攻击路径 / 严重度 / 修复补丁。',
  },
  {
    id: 'p-test',
    category: '测试',
    title: '补单元测试',
    summary: '要求覆盖边界与失败路径，而不是只测 happy path',
    role: '你是测试工程师，偏好表格驱动测试。',
    context: '被测函数：<path>。签名：<sig>。已有测试风格：<示例>。',
    task: '为该函数编写测试，覆盖正常值、边界值、空输入、异常输入。',
    constraints: '不修改被测代码；使用项目已有断言库；测试之间互不依赖。',
    output: '完整测试文件 + 一句话说明每个用例覆盖的风险。',
  },
  {
    id: 'p-e2e',
    category: '测试',
    title: '写 E2E 用例',
    summary: '以用户故事描述，输出稳定的 Playwright 脚本',
    role: '你是端到端测试工程师。',
    context: '被测应用：<URL 或本地启动命令>。关键页面：<path>。账号：<测试账号>。',
    task: '为「<用户故事>」编写 Playwright 测试。',
    constraints: '禁止固定 sleep，用 expect 轮询与 web-first 断言；选择器优先用 data-testid。',
    output: '完整 spec 文件 + 运行命令。',
  },
  {
    id: 'p-doc',
    category: '文档',
    title: '写 README 段落',
    summary: '面向第一次使用的人，输出可直接粘贴的 Markdown',
    role: '你是技术文档作者。',
    context: '项目：<name>。功能：<一句话>。安装：<命令>。运行环境：<版本要求>。',
    task: '写一段「快速开始」，包含安装、最小示例、常见问题。',
    constraints: '示例必须能跑；命令与版本要与上下文一致；不写营销话术。',
    output: 'Markdown 片段，代码块要标注语言。',
  },
  {
    id: 'p-docstring',
    category: '文档',
    title: '补注释与 JSDoc',
    summary: '只补「为什么」，不重复「做了什么」',
    role: '你是维护代码可读性的工程师。',
    context: '文件：<path>。团队注释规范：<中文注释，说明意图与权衡>。',
    task: '为缺少说明的函数补 JSDoc，包含 @param @returns @throws。',
    constraints: '不要注释显而易见的语句；保留原有注释。',
    output: '修改后的完整文件。',
  },
  {
    id: 'p-commit',
    category: '工程效率',
    title: '生成 commit message',
    summary: '按 Conventional Commits 规范输出',
    role: '你是 Git 提交信息规范维护者。',
    context: 'diff 摘要：<git diff --stat 输出或变更列表>。仓库规范：<Conventional Commits>。',
    task: '生成一条 commit message。',
    constraints: 'type 用 feat/fix/refactor/test/docs/chore；标题 ≤ 72 字符；不要在标题写「修改了」。',
    output: '输出标题行 + 空行 + body（说明动机与影响）+ 可选 BREAKING CHANGE 段。',
  },
  {
    id: 'p-pr',
    category: '工程效率',
    title: '写 PR 描述',
    summary: '从 diff 生成背景、方案、影响面与验证方式',
    role: '你是负责代码评审协作的工程师。',
    context: '分支：<name>。diff：<摘要>。关联 issue：<编号>。',
    task: '写出可直接粘贴的 PR 描述。',
    constraints: '必须包含「如何验证」和「风险与回滚」两节。',
    output: 'Markdown 格式的 PR 描述正文。',
  },
  {
    id: 'p-explain',
    category: '工程效率',
    title: '解释陌生代码',
    summary: '分层解释：先一句话，再逐步，再整体',
    role: '你是耐心的导师。',
    context: '代码：<片段>。背景：<系统用途>。读者水平：<初级工程师>。',
    task: '解释这段代码做了什么、为什么这样写、有哪些隐含前提。',
    constraints: '先一句话结论，再展开；使用类比但不要跑题。',
    output: '一句话总结 → 分段解释 → 关键前提清单。',
  },
  {
    id: 'p-migration',
    category: '改代码',
    title: '框架升级 / API 迁移',
    summary: '给出分步迁移与破坏性变更清单',
    role: '你是迁移专家，熟悉 <从 X> 到 <到 Y> 的官方迁移指南。',
    context: '当前版本：<x>。目标版本：<y>。使用到的 API：<列表>。',
    task: '列出需要修改的地方，按「必须改 / 可选改」分类。',
    constraints: '每条都给出改前 / 改后代码对照；标注行为差异（不只是签名变化）。',
    output: '迁移清单 + 最小可验证的迁移示例。',
  },
  {
    id: 'p-sql',
    category: '数据与 SQL',
    title: '写 SQL 查询',
    summary: '要求先给表结构假设，再给 SQL 与索引建议',
    role: '你是数据库工程师，熟悉 PostgreSQL / MySQL 差异。',
    context: '表结构：<DDL>。业务问题：<描述>。数据量级：<行数>。数据库：<PostgreSQL 15>。',
    task: '写出满足业务需求的 SQL。',
    constraints: '禁止 SELECT *；注意 NULL 语义与三值逻辑；显式写出事务与锁的影响。',
    output: 'SQL + 执行计划要点 + 建议的索引 + 边界情况说明。',
  },
  {
    id: 'p-sql-optimize',
    category: '数据与 SQL',
    title: 'SQL 性能优化',
    summary: '要求给出改写前后与索引理由',
    role: '你是查询优化专家。',
    context: '表结构：<DDL>。慢 SQL：<query>。EXPLAIN ANALYZE：<输出>。',
    task: '找出性能瓶颈并给出改写方案。',
    constraints: '注意索引失效场景（函数包裹、前导通配符、隐式类型转换）。',
    output: '原 SQL / 优化后 SQL / 索引 DDL / 预计收益。',
  },
  {
    id: 'p-schema',
    category: '数据与 SQL',
    title: '设计数据库表',
    summary: '先给实体关系与约束，再给 DDL',
    role: '你是数据建模顾问。',
    context: '业务需求：<描述>。主要查询模式：<列 3~5 条>。一致性要求：<强/最终>。',
    task: '设计表结构、索引与迁移方案。',
    constraints: '主键用自增还是 UUID 要说明理由；必须给出外键与唯一约束。',
    output: 'ER 说明 → DDL（PostgreSQL 语法）→ 回滚迁移脚本 → 索引建议。',
  },
  {
    id: 'p-api',
    category: '写代码',
    title: '设计 REST 接口',
    summary: '定义资源、错误码与幂等性',
    role: '你是 API 设计者，遵循 REST 与 OpenAPI 规范。',
    context: '业务：<描述>。既有约定：<前缀/版本/鉴权方式>。',
    task: '设计接口集合，包含路径、方法、请求响应、错误码。',
    constraints: '写操作必须考虑幂等；分页统一格式；不要在 URL 里放敏感信息。',
    output: 'OpenAPI 片段 + 错误码表 + 一条 curl 示例。',
  },
  {
    id: 'p-regex',
    category: '正则与校验',
    title: '写正则',
    summary: '要求给出多语言写法和 ReDoS 风险评估',
    role: '你是正则专家，熟悉 PCRE / JS / Python / Go 的差异。',
    context: '目标：<校验或提取什么>。输入样例：<正例与反例>。运行环境：<语言>。',
    task: '写出满足需求且不误匹配的正则。',
    constraints: '避免嵌套量词（ReDoS 风险）；说明是否需要命名分组与 flags。',
    output: '各语言写法（JS / Python / Java / Go）+ 边界说明 + 性能提醒。',
  },
  {
    id: 'p-validate',
    category: '正则与校验',
    title: '校验规则实现',
    summary: '把业务规则变成可测试的校验函数',
    role: '你是表单校验专家。',
    context: '规则：<逐条列出>。技术栈：<zod / ajv / 手写>。',
    task: '实现校验逻辑与错误消息（中文）。',
    constraints: '错误消息要指出具体字段与原因；规则可组合复用。',
    output: '实现代码 + 12 条测试用例（正反例各半）。',
  },
  {
    id: 'p-i18n',
    category: '工程效率',
    title: '国际化文案整理',
    summary: '抽出文案 key 并给出多语言表',
    role: '你是国际化工程师。',
    context: '界面文案（硬编码）：<文案列表>。目标语言：<中/英/日>。',
    task: '设计 key 命名方案并生成语言包。',
    constraints: 'key 用语义化层级（a.b.c）；占位符保持一致；注意复数与长文案膨胀。',
    output: 'key 结构 + JSON 语言包 + 提取脚本建议。',
  },
  {
    id: 'p-curl',
    category: '工程效率',
    title: '从抓包生成请求',
    summary: '把浏览器 Network 里的请求翻译成可复现命令',
    role: '你是 HTTP 调试专家。',
    context: '请求：<method + url + headers + body>。目标运行环境：<curl / fetch / httpie>。',
    task: '生成可复现的请求命令。',
    constraints: '敏感头用占位符；说明哪些头可以删除。',
    output: 'curl 命令 + 常见失败原因排查清单。',
  },
  {
    id: 'p-permission',
    category: '安全',
    title: '权限模型设计',
    summary: 'RBAC / ABAC 取舍与校验位置',
    role: '你是安全架构师。',
    context: '资源：<列表>。角色：<列表>。现有鉴权：<JWT / session>。',
    task: '设计权限模型并给出服务端强制校验的位置。',
    constraints: '必须服务端校验，前端隐藏不算防护；说明水平越权防护。',
    output: '模型对比 → 选定方案 → 中间件伪代码 → 越权用例清单。',
  },
  {
    id: 'p-log',
    category: '改代码',
    title: '加结构化日志',
    summary: '明确字段、脱敏与级别',
    role: '你是可观测性工程师。',
    context: '代码路径：<path>。日志系统：<console / pino / zap>。',
    task: '在关键分支加入结构化日志。',
    constraints: '禁止打印密码、Token、身份证；错误必须带上下文与可追踪 ID。',
    output: '修改后的代码 + 日志字段说明表。',
  },
  {
    id: 'p-translate',
    category: '文档',
    title: '翻译注释与文档',
    summary: '中英互译并保持术语一致',
    role: '你是技术译者，术语表见下。',
    context: '原文（<语言>）：<文本>。术语表：commit=提交, PR=合并请求, lint=静态检查。',
    task: '翻译并保持代码标识符不译。',
    constraints: '不翻译字符串字面量与标识符；保持 Markdown 结构。',
    output: '译文 + 术语偏差说明（如有）。',
  },
  {
    id: 'p-refactor-test',
    category: '重构与性能',
    title: '给遗留代码补测试',
    summary: '先用特征测试锁住现有行为',
    role: '你是测试工程师。',
    context: '遗留模块：<path>。无测试。希望锁定的行为：<描述>。',
    task: '设计特征测试（characterization test）以冻结现有行为，再规划重构。',
    constraints: '不要在测试中断言未定义行为；标注「待确认行为」单独列出。',
    output: '特征测试文件 + 风险点清单 + 重构步骤。',
  },
  {
    id: 'p-architecture',
    category: '写代码',
    title: '方案对比',
    summary: '要求给取舍表而不是单边推荐',
    role: '你是技术方案评审人。',
    context: '问题：<描述>。约束：<团队规模/工期/技术栈>。',
    task: '给出 2~3 个可行方案并对比。',
    constraints: '每个方案都要写清成本、风险与回退路径；不要只推荐一个。',
    output: '对比表（维度含开发成本、运维成本、可扩展性、迁移难度）→ 建议与理由。',
  },
  {
    id: 'p-rewrite',
    category: '改代码',
    title: '按规范改写风格',
    summary: '统一命名、错误处理与异步风格',
    role: '你是代码风格一致性维护者。',
    context: '代码：<path>。团队规范：<命名/错误处理/异步/注释>。',
    task: '按规范改写代码，保持行为完全一致。',
    constraints: '不改业务逻辑；不改公开签名。',
    output: '改写后代码 + 逐条对应的规范说明。',
  },
  {
    id: 'p-dependency',
    category: '工程效率',
    title: '依赖选型与升级',
    summary: '给出维护活跃度、许可证与体积',
    role: '你是依赖治理负责人。',
    context: '需求：<描述>。候选：<库 A / 库 B>。运行环境：<浏览器 / Node 20>。',
    task: '对比候选并给建议。',
    constraints: '必须考虑许可证、bundle 体积、维护活跃度与替代成本。',
    output: '对比表 → 建议 → 引入代码 → 卸载/回退方案。',
  },
  {
    id: 'p-rewrite-legacy',
    category: '重构与性能',
    title: '拆分大文件',
    summary: '按职责切片，保留可回滚性',
    role: '你是模块化设计者。',
    context: '文件：<path>，<行数> 行。职责：<列出实际承担的职责>。',
    task: '给出拆分方案与文件结构。',
    constraints: '每一步都要保持可构建可测试；禁止一次性大改。',
    output: '目标目录树 + 分步提交计划 + 每步验证方式。',
  },
];

/** 常见问题：模型用错时的根因与改法。 */
export const PROMPT_PITFALLS: { problem: string; fix: string }[] = [
  { problem: '只说「帮我写代码」，模型不知道改哪个文件、用什么风格。', fix: '给出文件路径、相关片段和既有风格样例。' },
  { problem: '把报错描述成「报错了」，模型只能猜。', fix: '贴完整报错原文，包括 stack 与请求/响应体。' },
  { problem: '一次问五件事，输出互相矛盾。', fix: '拆成多个独立提问，串行执行。' },
  { problem: '不说输出格式，拿到大段散文。', fix: '明确要求表格 / JSON / diff / 完整文件。' },
  { problem: '模型误解需求，产出全部返工。', fix: '开头加一句「开始前先复述你的理解，等我确认再动手」。' },
  { problem: '贴了整个仓库，得到泛泛建议。', fix: '只贴必要上下文，其余让模型用搜索工具按需读取。' },
  { problem: '模型编造不存在的 API。', fix: '要求「不确定就标注需确认，并给官方文档链接」。' },
  { problem: '代码补全式提问，模型当聊天回答。', fix: '用「实现」「重构」这类动词开头，并给出验收标准。' },
  { problem: '没有验收标准，模型自认为完成。', fix: '写清「怎样算成功」，最好直接给测试用例。' },
  { problem: '中文提问但要求英文代码注释，结果中英混杂。', fix: '在约束里显式声明注释语言。' },
];

export interface AiTool {
  name: string;
  url: string;
  positioning: string;
  scenario: string;
  /** 部署形态：云端 / 本地 / 混合。 */
  deployment: '云端' | '本地' | '混合';
  category: 'AI IDE' | 'CLI 助手' | '插件补全' | '平台型' | '原型生成';
}

/** 工具选型表：官网 + 定位 + 适用场景 + 部署形态。 */
export const AI_TOOLS: AiTool[] = [
  {
    name: 'Cursor',
    url: 'https://cursor.com/',
    positioning: 'AI 原生代码编辑器，VS Code 分支',
    scenario: '日常写码、跨文件重构、补全',
    deployment: '云端',
    category: 'AI IDE',
  },
  {
    name: 'Claude Code',
    url: 'https://docs.anthropic.com/en/docs/claude-code',
    positioning: '终端里的智能体，可读写仓库',
    scenario: '多文件重构、跑测试、写脚本',
    deployment: '云端',
    category: 'CLI 助手',
  },
  {
    name: 'GitHub Copilot',
    url: 'https://github.com/features/copilot',
    positioning: '补全 + Chat + Agent，IDE 插件为主',
    scenario: '团队统一采购、代码补全',
    deployment: '云端',
    category: '插件补全',
  },
  {
    name: 'Windsurf',
    url: 'https://windsurf.com/',
    positioning: 'Cascade 智能体的 VS Code 分支',
    scenario: '与 Cursor 类似的 AI IDE',
    deployment: '云端',
    category: 'AI IDE',
  },
  {
    name: 'Cline',
    url: 'https://cline.bot/',
    positioning: '开源 VS Code 插件，Plan/Act 双模式',
    scenario: '自己配 API Key、审慎执行',
    deployment: '混合',
    category: '插件补全',
  },
  {
    name: 'Roo Code',
    url: 'https://roocode.com/',
    positioning: 'Cline 的分支，自定义模式（architect/code）',
    scenario: '想要分角色工作流',
    deployment: '混合',
    category: '插件补全',
  },
  {
    name: 'Aider',
    url: 'https://aider.chat/',
    positioning: '命令行结对编程，自动提交 Git',
    scenario: '用 Git 记录每次 AI 修改',
    deployment: '云端',
    category: 'CLI 助手',
  },
  {
    name: 'Continue',
    url: 'https://www.continue.dev/',
    positioning: '开源 IDE 插件，可接本地模型',
    scenario: '内网、隐私敏感项目',
    deployment: '混合',
    category: '插件补全',
  },
  {
    name: 'Zed AI',
    url: 'https://zed.dev/docs/ai',
    positioning: '高性能编辑器内置 AI 与编辑预测',
    scenario: '看重速度与大文件编辑',
    deployment: '云端',
    category: 'AI IDE',
  },
  {
    name: 'Sourcegraph Cody',
    url: 'https://sourcegraph.com/cody',
    positioning: '基于代码图谱的上下文检索',
    scenario: '大仓、跨仓库问答',
    deployment: '混合',
    category: '插件补全',
  },
  {
    name: 'Tabnine',
    url: 'https://www.tabnine.com/',
    positioning: '补全为主的商业插件',
    scenario: '合规要求严格的团队',
    deployment: '云端',
    category: '插件补全',
  },
  {
    name: 'JetBrains AI Assistant',
    url: 'https://www.jetbrains.com/ai/',
    positioning: 'IDE 内置 AI 与 Junie 智能体',
    scenario: 'JetBrains 全家桶用户',
    deployment: '云端',
    category: 'AI IDE',
  },
  {
    name: '通义灵码',
    url: 'https://lingma.aliyun.com/',
    positioning: '阿里云的补全 + 智能体，中文优化',
    scenario: '国内网络环境、企业内网版',
    deployment: '云端',
    category: '插件补全',
  },
  {
    name: 'CodeGeeX',
    url: 'https://codegeex.cn/',
    positioning: '智谱的 AI 编程助手，多语言',
    scenario: '国内可用、免费额度',
    deployment: '云端',
    category: '插件补全',
  },
  {
    name: 'Bolt.new',
    url: 'https://bolt.new/',
    positioning: '浏览器里从提示生成可运行全栈应用',
    scenario: '快速出 Demo、原型',
    deployment: '云端',
    category: '原型生成',
  },
  {
    name: 'v0',
    url: 'https://v0.dev/',
    positioning: 'Vercel 的 UI 生成与部署',
    scenario: 'React / Next 界面快速成型',
    deployment: '云端',
    category: '原型生成',
  },
  {
    name: 'Lovable',
    url: 'https://lovable.dev/',
    positioning: '对话式生成并托管全栈应用',
    scenario: '非工程背景做 MVP',
    deployment: '云端',
    category: '原型生成',
  },
  {
    name: 'Replit Agent',
    url: 'https://replit.com/agent',
    positioning: '云端 IDE + 智能体，能自己部署',
    scenario: '教学、分享、零配置演示',
    deployment: '云端',
    category: 'AI IDE',
  },
  {
    name: 'Devin',
    url: 'https://devin.ai/',
    positioning: '并行执行任务的自主工程智能体',
    scenario: '评估自主代理的边界',
    deployment: '云端',
    category: 'CLI 助手',
  },
  {
    name: 'OpenAI Codex',
    url: 'https://openai.com/codex/',
    positioning: '云端编码代理 / CLI',
    scenario: '与 OpenAI 生态配合',
    deployment: '云端',
    category: 'CLI 助手',
  },
  {
    name: 'Gemini CLI',
    url: 'https://github.com/google-gemini/gemini-cli',
    positioning: 'Google 的开源终端助手',
    scenario: '免费额度、大上下文',
    deployment: '云端',
    category: 'CLI 助手',
  },
  {
    name: 'Qwen Code',
    url: 'https://github.com/QwenLM/qwen-code',
    positioning: '通义千问系开源 CLI 助手',
    scenario: '中文任务、本地部署可选',
    deployment: '混合',
    category: 'CLI 助手',
  },
  {
    name: 'SWE-agent',
    url: 'https://github.com/SWE-agent/SWE-agent',
    positioning: '开源研究型代理框架',
    scenario: '自定义工具链、做评测',
    deployment: '混合',
    category: 'CLI 助手',
  },
  {
    name: 'Ollama',
    url: 'https://ollama.com/',
    positioning: '本地模型运行时，一条命令拉起服务',
    scenario: '离线、隐私、可控成本',
    deployment: '本地',
    category: '平台型',
  },
  {
    name: 'llama.cpp',
    url: 'https://github.com/ggml-org/llama.cpp',
    positioning: 'C++ 推理引擎，量化与 CPU 推理最强',
    scenario: '没有显卡也要跑',
    deployment: '本地',
    category: '平台型',
  },
  {
    name: 'vLLM',
    url: 'https://docs.vllm.ai/',
    positioning: 'GPU 批量推理服务',
    scenario: '自建 API 服务',
    deployment: '本地',
    category: '平台型',
  },
  {
    name: 'LM Studio',
    url: 'https://lmstudio.ai/',
    positioning: '带 GUI 的本地模型管理器',
    scenario: '不熟命令行的本地体验',
    deployment: '本地',
    category: '平台型',
  },
  {
    name: 'Jan',
    url: 'https://jan.ai/',
    positioning: '开源本地模型客户端',
    scenario: '桌面端离线助手',
    deployment: '本地',
    category: '平台型',
  },
  {
    name: 'Open WebUI',
    url: 'https://openwebui.com/',
    positioning: '自托管的 ChatGPT 风格界面',
    scenario: '给团队提供统一内部入口',
    deployment: '本地',
    category: '平台型',
  },
];

/** 本地模型硬件需求对照（静态数据，实际速度与上下文设置强相关）。 */
export const LOCAL_MODEL_MATRIX = {
  columns: ['规模', '参数', 'Q4 显存约', 'Q8 显存约', '推荐显卡', '典型用途'],
  rows: [
    ['小', '1B ~ 3B', '1 ~ 2 GB', '1.5 ~ 3 GB', '4 GB 显存 / 纯 CPU', '补全、简单问答、脚本'],
    ['中', '7B ~ 8B', '5 ~ 6 GB', '8 ~ 9 GB', '8 GB 显存（RTX 3060 / 4060）', '日常对话、代码补全、小重构'],
    ['中大', '13B ~ 14B', '9 ~ 10 GB', '13 ~ 15 GB', '12 ~ 16 GB 显存（4060Ti 16G / 4080）', '多文件阅读、技术问答'],
    ['大', '30B ~ 34B', '20 ~ 22 GB', '32 ~ 36 GB', '24 GB 显存（3090 / 4090）', '复杂重构、Agent 任务'],
    ['超大', '70B 级', '40 ~ 45 GB', '75 ~ 80 GB', '双 24GB 或 A100 80G', '长上下文分析、批量任务'],
  ],
};

export const QUANT_TABLE = {
  columns: ['量化', '体积相对 FP16', '质量损失', '说明'],
  rows: [
    ['FP16 / BF16', '100%', '基准', '训练与推理默认格式，显存吃紧时第一个放弃'],
    ['Q8_0', '约 50%', '几乎无', '质量与体积的平衡点，推荐先用它'],
    ['Q6_K', '约 37%', '极小', '显存紧张但又想保留质量时用'],
    ['Q5_K_M', '约 32%', '小', '多数场景可接受'],
    ['Q4_K_M', '约 25%', '小到中', '社区最常用，短任务足够'],
    ['Q4_0', '约 25%', '中', '同体积下质量不如 Q4_K_M'],
    ['Q3 / Q2', '< 20%', '明显', '只用于极限场景，代码能力下降明显'],
  ],
};

export const MODELFILE_EXAMPLE = `# ~/Modelfile —— ollama create my-coder -f ~/Modelfile
FROM qwen2.5-coder:14b-instruct-q4_K_M

# 系统提示：让模型偏向简洁的实现型回答
SYSTEM """你是资深工程师。回答先给结论，再给代码。代码用 TypeScript strict 风格。"""

# 预置参数
PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER num_ctx 16384
PARAMETER stop "\`\`\`"

# 预热提示（可选，减少首 token 延迟）
MESSAGE user 你好，请确认你已就绪。
MESSAGE assistant 已就绪。`;

export const OLLAMA_CURL = `# 1) 启动 Ollama 后，本地默认监听 11434 端口
# 2) 列出已安装模型
curl http://localhost:11434/api/tags

# 3) 简单对话（非流式）
curl http://localhost:11434/api/chat -d '{
  "model": "my-coder",
  "messages": [{ "role": "user", "content": "写一个 debounce 函数" }],
  "stream": false
}'

# 4) 只做补全（FIM 风格接口，适合编辑器插件）
curl http://localhost:11434/api/generate -d '{
  "model": "my-coder",
  "prompt": "function debounce(fn, wait) {",
  "suffix": "}",
  "raw": true,
  "stream": false
}'

# 5) 拉取模型
ollama pull qwen2.5-coder:14b-instruct-q4_K_M
ollama run my-coder`;

export const LOCAL_MODEL_PITFALLS = [
  '上下文长度直接吃显存：把 num_ctx 从 8k 提到 32k，KV cache 可能翻几倍，先在 8k 下验证。',
  '工具调用能力弱于云端大模型：本地模型常输出「我建议你调用 xxx」而不是规范的 tool call JSON。',
  '代码补全与对话是两种能力：补全模型（FIM 训练）在编辑器里更跟手，对话模型反而啰嗦。',
  '量化格式别只看体积：Q4_K_M 与 Q4_0 同体积但质量差一截，优先 K 量化。',
  'CPU 推理能跑但别指望交互：每秒几个 token 时不如切回云端。',
  '磁盘与内存都要够：模型文件是内存映射，实际瓶颈常是内存带宽而非显存。',
];

// ── 代码托管平台 ──────────────────────────────────────────────

export interface HostingPlatform {
  name: string;
  url: string;
  hosting: string;
  privateLimit: string;
  freeTier: string;
  ci: string;
  issue: string;
  registry: string;
  review: string;
  api: string;
  fit: string;
}

export const HOSTING_PLATFORMS: HostingPlatform[] = [
  {
    name: 'GitHub',
    url: 'https://github.com/',
    hosting: 'SaaS（Enterprise 私有部署）',
    privateLimit: '免费无限私有仓库（协作人数有限制）',
    freeTier: '公开仓库无限；Actions 公共仓库免费额度',
    ci: 'Actions（YAML 生态最成熟）',
    issue: 'Issues + Projects（含看板/表格/路线图）',
    registry: 'npm / Maven / NuGet / Docker Hub / GHCR / PyPI',
    review: 'PR + CODEOWNERS + required checks + 评审人分配',
    api: 'REST + GraphQL + Webhook，gh CLI',
    fit: '几乎所有团队；开源与协作首选',
  },
  {
    name: 'GitLab',
    url: 'https://gitlab.com/',
    hosting: '两者都有（CE/EE + SaaS）',
    privateLimit: 'SaaS 免费档有限；自建无限制',
    freeTier: '有（功能逐级降级，Pipeline 分钟数有限）',
    ci: '内置 CI/CD（YAML）+ Runner，配置一体化',
    issue: 'Issues + Boards（看板）+ Epics（需求层级）',
    registry: '内置 Container Registry + npm/PyPI/Maven 代理',
    review: 'MR + 审批规则 + CODEOWNERS + 分支保护',
    api: 'REST + GraphQL + glab CLI',
    fit: '研发流程规范、需要内网自建的一体化团队',
  },
  {
    name: 'Gitea',
    url: 'https://about.gitea.com/',
    hosting: '自建（官方也提供云服务）',
    privateLimit: '自建无限制',
    freeTier: '开源软件本身免费',
    ci: '内置 Actions（兼容 GitHub Actions 语法）',
    issue: 'Issues + Projects（看板）',
    registry: '内置包与容器 Registry',
    review: 'PR + 分支保护 + CODEOWNERS（reviewers 文件）',
    api: 'Swagger/OpenAPI + Gitea CLI',
    fit: '小团队、想轻量自建、内存有限',
  },
  {
    name: 'Bitbucket',
    url: 'https://bitbucket.org/',
    hosting: 'SaaS（Server 停售）',
    privateLimit: '有限，按用户数计费',
    freeTier: '小团队免费额度',
    ci: 'Pipelines（Bitbucket 专用配置）',
    issue: 'Issues（功能较弱）',
    registry: '无官方包仓库',
    review: 'PR + 审批 + 分支限制',
    api: 'REST + atlassian git-scm',
    fit: '已在 Atlassian 生态内的团队',
  },
  {
    name: 'Codeberg',
    url: 'https://codeberg.org/',
    hosting: 'SaaS（由 Codeberg eV 运营，Forgejo 驱动）',
    privateLimit: '公开仓库为主，私有有配额',
    freeTier: '公益性质，无广告',
    ci: 'Forgejo Actions（兼容 GitHub Actions）',
    issue: 'Issues + Projects',
    registry: '内置 Packages',
    review: 'PR + 分支保护',
    api: 'REST + Forgejo CLI',
    fit: '偏好欧洲节点、公益基础设施的用户',
  },
  {
    name: 'SourceHut',
    url: 'https://sr.ht/',
    hosting: 'SaaS（少量付费）',
    privateLimit: '私有仓库需订阅',
    freeTier: '公开仓库免费',
    ci: 'builds.sr.ht（YAML，任务矩阵）',
    issue: 'Tickets + Lists（看板）',
    registry: '无包仓库',
    review: '邮件 + patch 驱动的评审流程',
    api: 'GraphQL + hut CLI',
    fit: '重视隐私与邮件工作流、极简开发者',
  },
  {
    name: 'Forgejo',
    url: 'https://forgejo.org/',
    hosting: '自建',
    privateLimit: '自建无限制',
    freeTier: '开源免费（代码数据源迁移自 Gitea）',
    ci: 'Forgejo Actions',
    issue: 'Issues + Projects',
    registry: '内置 Packages',
    review: 'PR + 分支保护',
    api: 'REST + Forgejo CLI',
    fit: '要求完全自控、避免 Gitea 商业化争议',
  },
];

export const HOSTING_COMPARISON_HEADERS = [
  '平台',
  '托管方式',
  '私有仓库限制',
  '免费额度',
  'CI/CD',
  'Issue / 看板',
  '包 / Registry',
  '代码评审',
  'API',
  '适合团队',
];

export const HOSTING_LINKS = [
  { name: 'GitHub', url: 'https://github.com/', description: '最大的代码托管平台', tags: ['Git'] },
  {
    name: 'GitHub Marketplace',
    url: 'https://github.com/marketplace',
    description: 'Actions / Apps / Copilot 等市场',
    tags: ['扩展'],
  },
  { name: 'GitLab', url: 'https://gitlab.com/', description: '一体化 DevOps 平台', tags: ['Git'] },
  { name: 'Gitea', url: 'https://about.gitea.com/', description: '轻量自建 Git 服务', tags: ['自建'] },
  { name: 'Forgejo', url: 'https://forgejo.org/', description: 'Gitea 社区分支，完全开放治理', tags: ['自建'] },
  { name: 'Bitbucket', url: 'https://bitbucket.org/', description: 'Atlassian 的代码托管', tags: ['Git'] },
  { name: 'Codeberg', url: 'https://codeberg.org/', description: 'Forgejo 驱动的公益托管', tags: ['Git'] },
  { name: 'SourceHut', url: 'https://sr.ht/', description: '邮件工作流与补丁式协作', tags: ['Git'] },
  { name: 'gh CLI', url: 'https://cli.github.com/', description: 'GitHub 官方命令行工具', tags: ['CLI'] },
  { name: 'glab CLI', url: 'https://gitlab.com/gitlab-org/cli', description: 'GitLab 官方命令行工具', tags: ['CLI'] },
  { name: 'OpenSSF Scorecard', url: 'https://scorecard.dev/', description: '开源项目安全健康度评分', tags: ['安全'] },
  {
    name: 'OpenSSF Best Practices',
    url: 'https://www.bestpractices.coreinfrastructure.org/',
    description: '项目成熟度徽章标准',
    tags: ['安全'],
  },
];

export interface CliCommand {
  group: string;
  command: string;
  desc: string;
  example: string;
}

/** gh / glab 常用命令速查（45+）。 */
export const CLI_COMMANDS: CliCommand[] = [
  { group: 'gh · 认证', command: 'gh auth login', desc: '交互式登录（浏览器或 token）', example: 'gh auth login' },
  { group: 'gh · 认证', command: 'gh auth status', desc: '查看当前账号与 token 权限', example: 'gh auth status' },
  { group: 'gh · 认证', command: 'gh auth logout', desc: '登出当前账号', example: 'gh auth logout' },
  {
    group: 'gh · 认证',
    command: 'gh auth token',
    desc: '打印 token 便于脚本取用（注意不要 echo 到日志）',
    example: 'TOKEN=$(gh auth token)',
  },
  { group: 'gh · 认证', command: 'gh auth switch', desc: '多账号间切换', example: 'gh auth switch --user me' },
  {
    group: 'gh · 认证',
    command: 'gh auth refresh -s workflow',
    desc: '给已有 token 增加 workflow 权限',
    example: 'gh auth refresh -h github.com -s workflow',
  },
  {
    group: 'gh · 仓库',
    command: 'gh repo create',
    desc: '新建仓库（可同时推送）',
    example: 'gh repo create my-app --private --source=. --remote=origin --push',
  },
  { group: 'gh · 仓库', command: 'gh repo clone', desc: '克隆仓库', example: 'gh repo clone owner/name' },
  {
    group: 'gh · 仓库',
    command: 'gh repo view',
    desc: '查看仓库信息（--web 打开网页）',
    example: 'gh repo view --json name,stargazerCount',
  },
  { group: 'gh · 仓库', command: 'gh repo fork', desc: 'fork 到自己账号', example: 'gh repo fork owner/name --clone' },
  { group: 'gh · 仓库', command: 'gh repo archive', desc: '归档仓库', example: 'gh repo archive owner/name --yes' },
  { group: 'gh · 仓库', command: 'gh repo sync', desc: '同步 fork 的上游', example: 'gh repo sync owner/name' },
  { group: 'gh · 仓库', command: 'gh repo rename', desc: '重命名仓库', example: 'gh repo rename new-name' },
  {
    group: 'gh · PR',
    command: 'gh pr create',
    desc: '创建 PR，可自动填标题与正文',
    example: 'gh pr create --fill --draft',
  },
  {
    group: 'gh · PR',
    command: 'gh pr list',
    desc: '列出 PR（--state、--label、--assignee）',
    example: 'gh pr list --state open --limit 20',
  },
  { group: 'gh · PR', command: 'gh pr view', desc: '查看 PR 详情与 diff', example: 'gh pr view 123 --web' },
  { group: 'gh · PR', command: 'gh pr diff', desc: '输出 PR 的 diff', example: 'gh pr diff 123' },
  { group: 'gh · PR', command: 'gh pr checkout', desc: '本地检出 PR 分支', example: 'gh pr checkout 123' },
  {
    group: 'gh · PR',
    command: 'gh pr merge',
    desc: '合并 PR（可 squash / rebase）',
    example: 'gh pr merge 123 --squash --delete-branch',
  },
  {
    group: 'gh · PR',
    command: 'gh pr review',
    desc: '提交评审（approve / request-changes / comment）',
    example: 'gh pr review 123 --approve --body "LGTM"',
  },
  { group: 'gh · PR', command: 'gh pr ready', desc: '把草稿 PR 标记为可评审', example: 'gh pr ready 123' },
  { group: 'gh · PR', command: 'gh pr close', desc: '关闭 PR', example: 'gh pr close 123 --comment "已由 #456 修复"' },
  { group: 'gh · PR', command: 'gh pr reopen', desc: '重新打开 PR', example: 'gh pr reopen 123' },
  { group: 'gh · PR', command: 'gh pr status', desc: '查看与当前分支相关的 PR 状态', example: 'gh pr status' },
  { group: 'gh · PR', command: 'gh pr checks', desc: '查看 PR 的 CI 检查结果', example: 'gh pr checks 123 --watch' },
  {
    group: 'gh · Issue',
    command: 'gh issue list',
    desc: '列出 Issue，可按标签/负责人过滤',
    example: 'gh issue list --label bug --state open',
  },
  {
    group: 'gh · Issue',
    command: 'gh issue create',
    desc: '创建 Issue',
    example: 'gh issue create --title "崩溃" --body-file bug.md',
  },
  { group: 'gh · Issue', command: 'gh issue view', desc: '查看 Issue', example: 'gh issue view 42 --comments' },
  {
    group: 'gh · Issue',
    command: 'gh issue close',
    desc: '关闭 Issue',
    example: 'gh issue close 42 --reason completed',
  },
  { group: 'gh · Issue', command: 'gh issue reopen', desc: '重开 Issue', example: 'gh issue reopen 42' },
  {
    group: 'gh · Issue',
    command: 'gh issue comment',
    desc: '评论 Issue',
    example: 'gh issue comment 42 --body "已在 #43 修复"',
  },
  {
    group: 'gh · Issue',
    command: 'gh issue edit',
    desc: '编辑 Issue（标题/正文/标签/里程碑）',
    example: 'gh issue edit 42 --add-label "p1,area/auth"',
  },
  { group: 'gh · Issue', command: 'gh issue develop', desc: '为 Issue 创建开发分支', example: 'gh issue develop 42' },
  {
    group: 'Release',
    command: 'gh release create',
    desc: '创建 Release（可传 tag 与产物）',
    example: 'gh release create v1.2.0 dist/*.tgz --generate-notes',
  },
  { group: 'Release', command: 'gh release list', desc: '列出 Release', example: 'gh release list --limit 5' },
  { group: 'Release', command: 'gh release view', desc: '查看某个 Release', example: 'gh release view v1.2.0' },
  {
    group: 'Release',
    command: 'gh release download',
    desc: '下载 Release 产物',
    example: 'gh release download v1.2.0 -D ./out',
  },
  {
    group: 'Release',
    command: 'gh release delete',
    desc: '删除 Release 及其 tag',
    example: 'gh release delete v1.2.0 --yes',
  },
  { group: 'Workflow', command: 'gh workflow list', desc: '列出工作流文件', example: 'gh workflow list' },
  {
    group: 'Workflow',
    command: 'gh workflow run',
    desc: '手动触发工作流',
    example: 'gh workflow run deploy.yml -f env=prod',
  },
  {
    group: 'Workflow',
    command: 'gh run list',
    desc: '列出执行记录',
    example: 'gh run list --workflow ci.yml --limit 10',
  },
  { group: 'Workflow', command: 'gh run view', desc: '查看某次执行详情', example: 'gh run view 1234567' },
  {
    group: 'Workflow',
    command: 'gh run watch',
    desc: '实时跟踪执行输出',
    example: 'gh run watch 1234567 --exit-status',
  },
  {
    group: 'Workflow',
    command: 'gh run rerun',
    desc: '重跑（可只重跑失败任务）',
    example: 'gh run rerun 1234567 --failed',
  },
  { group: 'Workflow', command: 'gh run download', desc: '下载执行产物', example: 'gh run download 1234567 -n dist' },
  { group: 'Workflow', command: 'gh run cancel', desc: '取消执行', example: 'gh run cancel 1234567' },
  {
    group: 'Workflow',
    command: 'gh run view --log-failed',
    desc: '只看失败任务的日志',
    example: 'gh run view 1234567 --log-failed',
  },
  {
    group: 'Gist',
    command: 'gh gist create',
    desc: '创建 Gist（私有/公开）',
    example: 'gh gist create --public note.md',
  },
  { group: 'Gist', command: 'gh gist view', desc: '查看 Gist', example: 'gh gist view 1234' },
  { group: 'Gist', command: 'gh gist list', desc: '列出自己的 Gist', example: 'gh gist list --limit 20' },
  {
    group: 'Project',
    command: 'gh project list',
    desc: '列出组织/用户的 Project（看板）',
    example: 'gh project list --owner @me',
  },
  {
    group: 'Project',
    command: 'gh project create',
    desc: '创建 Project 看板',
    example: 'gh project create --title "迭代 12" --owner @me',
  },
  {
    group: 'Project',
    command: 'gh project item-add',
    desc: '把 Issue/PR 加入看板',
    example: 'gh project item-add 12 --owner @me --url https://github.com/o/r/issues/1',
  },
  {
    group: 'Project',
    command: 'gh project field-list',
    desc: '查看看板字段（状态/迭代）',
    example: 'gh project field-list 12 --owner @me',
  },
  {
    group: 'glab · 认证',
    command: 'glab auth login',
    desc: '登录 GitLab',
    example: 'glab auth login --hostname gitlab.com',
  },
  { group: 'glab · 认证', command: 'glab auth status', desc: '查看登录状态', example: 'glab auth status' },
  { group: 'glab · 认证', command: 'glab auth logout', desc: '登出', example: 'glab auth logout' },
  {
    group: 'glab · 认证',
    command: 'glab config set',
    desc: '设置默认 host / 编辑器',
    example: 'glab config set editor vim',
  },
  {
    group: 'glab · 仓库',
    command: 'glab repo create',
    desc: '创建项目（仓库）',
    example: 'glab repo create my-app --group my-group',
  },
  { group: 'glab · 仓库', command: 'glab repo clone', desc: '克隆项目', example: 'glab repo clone group/project' },
  { group: 'glab · 仓库', command: 'glab repo view', desc: '查看项目信息', example: 'glab repo view' },
  { group: 'glab · 仓库', command: 'glab repo fork', desc: 'fork 项目', example: 'glab repo fork group/project' },
  {
    group: 'glab · 仓库',
    command: 'glab repo archive',
    desc: '归档项目',
    example: 'glab repo archive --name my-project',
  },
  { group: 'glab · MR', command: 'glab mr create', desc: '创建合并请求', example: 'glab mr create --fill --draft' },
  { group: 'glab · MR', command: 'glab mr list', desc: '列出 MR', example: 'glab mr list --state opened' },
  { group: 'glab · MR', command: 'glab mr view', desc: '查看 MR', example: 'glab mr view 12 --web' },
  { group: 'glab · MR', command: 'glab mr diff', desc: '查看 MR diff', example: 'glab mr diff 12' },
  { group: 'glab · MR', command: 'glab mr checkout', desc: '检出 MR 分支', example: 'glab mr checkout 12' },
  {
    group: 'glab · MR',
    command: 'glab mr merge',
    desc: '合并 MR',
    example: 'glab mr merge 12 --squash --remove-source-branch',
  },
  { group: 'glab · MR', command: 'glab mr approve', desc: '批准 MR', example: 'glab mr approve 12' },
  { group: 'glab · MR', command: 'glab mr close', desc: '关闭 MR', example: 'glab mr close 12' },
  {
    group: 'glab · Issue',
    command: 'glab issue create',
    desc: '创建 Issue',
    example: 'glab issue create --title "崩溃" --label bug',
  },
  { group: 'glab · Issue', command: 'glab issue list', desc: '列出 Issue', example: 'glab issue list --all' },
  { group: 'glab · Issue', command: 'glab issue view', desc: '查看 Issue', example: 'glab issue view 42' },
  {
    group: 'glab · Issue',
    command: 'glab issue note',
    desc: '给 Issue 加评论',
    example: 'glab issue note 42 -m "已在 !12 修复"',
  },
  { group: 'glab · Issue', command: 'glab issue close', desc: '关闭 Issue', example: 'glab issue close 42' },
  { group: 'glab · 流水线', command: 'glab ci list', desc: '列出流水线', example: 'glab ci list' },
  { group: 'glab · 流水线', command: 'glab ci view', desc: '查看某次流水线', example: 'glab ci view 9876' },
  { group: 'glab · 流水线', command: 'glab ci trace', desc: '跟踪流水线日志', example: 'glab ci trace 9876' },
  { group: 'glab · 流水线', command: 'glab ci retry', desc: '重试流水线', example: 'glab ci retry 9876' },
  { group: 'glab · 流水线', command: 'glab ci status', desc: '查看当前分支流水线状态', example: 'glab ci status' },
  {
    group: 'glab · Release',
    command: 'glab release create',
    desc: '创建 Release',
    example: 'glab release create v1.2.0 --name v1.2.0',
  },
  { group: 'glab · Release', command: 'glab release list', desc: '列出 Release', example: 'glab release list' },
  { group: 'glab · 其他', command: 'glab api', desc: '直接调用 GitLab API', example: 'glab api projects/:id/issues' },
  {
    group: 'gh · 其他',
    command: 'gh api',
    desc: '直接调用 GitHub API',
    example: 'gh api /repos/o/r --jq .stargazers_count',
  },
  { group: 'gh · 其他', command: 'gh cache delete', desc: '清理 Actions 缓存', example: 'gh cache delete --all' },
  {
    group: 'gh · 其他',
    command: 'gh secret set',
    desc: '设置仓库 Secret',
    example: 'gh secret set NPM_TOKEN < token.txt',
  },
];

export const CONVENTIONAL_COMMITS = [
  { type: 'feat', desc: '新功能（影响 minor 版本）', example: 'feat(auth): 支持短信验证码登录' },
  { type: 'fix', desc: '修复缺陷（影响 patch 版本）', example: 'fix(parser): 修正空输入导致的崩溃' },
  { type: 'docs', desc: '只改文档', example: 'docs(readme): 补充本地开发步骤' },
  { type: 'style', desc: '不影响逻辑的格式调整', example: 'style: 按 biome 重新格式化' },
  { type: 'refactor', desc: '重构，行为不变', example: 'refactor: 抽出 useDebounce hook' },
  { type: 'perf', desc: '性能优化', example: 'perf(list): 虚拟滚动替换全量渲染' },
  { type: 'test', desc: '测试相关', example: 'test: 补充 debounce 的边界用例' },
  { type: 'build', desc: '构建系统与依赖', example: 'build: vite 升级到 6' },
  { type: 'ci', desc: 'CI 配置与脚本', example: 'ci: 增加矩阵测试 Go 1.22/1.23' },
  { type: 'chore', desc: '其他杂项（不产生版本变化）', example: 'chore: 升级依赖锁文件' },
  { type: 'revert', desc: '回滚', example: 'revert: feat(auth): 回滚短信登录' },
];

export const COMMIT_SCOPES = [
  { scope: 'auth', desc: '登录、会话、权限' },
  { scope: 'ui', desc: '组件与样式' },
  { scope: 'api', desc: '接口与服务端逻辑' },
  { scope: 'db', desc: '数据模型与迁移' },
  { scope: 'perf', desc: '性能' },
  { scope: 'deps', desc: '依赖升级' },
  { scope: 'docs', desc: '文档' },
  { scope: 'test', desc: '测试' },
];

export const BRANCH_PATTERNS = [
  { pattern: 'feature/<类型>-<描述>', example: 'feature/auth-sms-login', note: 'Git Flow 常用' },
  { pattern: 'fix/<描述>', example: 'fix/parser-null-input', note: 'hotfix/ 留给线上紧急修复' },
  { pattern: '<用户>/<描述>', example: 'zhang/rewrite-scheduler', note: 'GitHub Flow，团队小最好用' },
  { pattern: 'type/<epic>-<序号>-<描述>', example: 'feat/PM-123-billing-export', note: '带 issue 编号便于追溯' },
  { pattern: 'release/<版本>', example: 'release/1.4.0', note: '发布分支，只进修复' },
];

export const MERGE_STRATEGIES = [
  {
    name: 'Merge Commit',
    icon: '保留全部历史',
    detail: '产生一个合并提交，父提交都保留。历史线性度差，但能明确标记「这是一次合并」。',
    when: '需要保留完整分支脉络、团队习惯于 git log --graph 阅读时。',
  },
  {
    name: 'Squash and Merge',
    icon: '压成一个提交',
    detail: '把整个 PR 压成一个提交后合入主线，历史最干净，便于 bisect 与语义化版本。',
    when: '默认推荐。注意 commit message 要手动写清，PR 内的碎提交信息会丢失。',
  },
  {
    name: 'Rebase and Merge',
    icon: '线性重放',
    detail: '把 PR 提交逐个重放到最新 main 上再快进合并，无合并提交。',
    when: '分支落后不多且提交本身质量好。落后太多时 rebase 会产生噪音。',
  },
  {
    name: 'Rebase Merge (no-ff)',
    icon: '重放并保留合并点',
    detail: '同上但强制生成一个合并提交，兼顾线性与拓扑标记。',
    when: '既想线性历史又想保留「这里发生过集成」的标记。',
  },
];

export const CODEOWNERS_SYNTAX = [
  { pattern: '*', desc: '匹配所有文件', example: '* @acme/infra' },
  { pattern: '/apps/web/', desc: '目录（末尾 / 表示目录下全部）', example: '/apps/web/ @acme/frontend' },
  { pattern: '*.js *.ts', desc: '按扩展名匹配', example: '*.ts @acme/frontend' },
  { pattern: '/docs/', desc: '以斜杠开头的目录', example: '/docs/ @acme/writer' },
  { pattern: '@org/team', desc: '组织下的团队可作为 owner', example: '.github/ @acme/platform' },
];

export const REVIEW_CHECKLIST = [
  '功能是否覆盖需求描述中的验收标准（含边界值）',
  '是否有隐藏副作用：改了公共签名却没更新调用方',
  '错误路径是否处理：空值、超时、网络失败、权限不足',
  '并发与幂等：重复提交会不会写两次',
  '性能：是否有 N+1 查询、全表扫描、同步阻塞 UI',
  '安全：输入校验、越权、注入、敏感信息是否进日志',
  '测试：新增逻辑是否被测试覆盖，测试是否真的会因为 bug 失败',
  '可观测性：关键分支是否有日志与指标，错误是否可定位',
  '兼容性与迁移：是否需要灰度、开关、迁移脚本与回滚方案',
  '文档：README / CHANGELOG / 接口文档是否同步',
];

export const CONFLICT_RESOLVE = [
  { situation: '双方改了同一行的不同部分', fix: '手工合并，必要时拆成两次提交，先改代码后改测试' },
  { situation: '两边都改接口签名', fix: '不要机械 accept，先确定最终形态，再各自适配调用方' },
  { situation: '依赖文件（lock）冲突', fix: '取一侧版本后重装依赖重新生成，不要手工编辑 lock' },
  { situation: 'rebase 反复冲突', fix: '改用 merge 策略，或先 rebase 到最新 main 一次性解决' },
  { situation: '大批量冲突', fix: '中止操作，先同步 main，再用 git rerere 复用已解冲突' },
];

export const BRANCH_PROTECTION_CONCEPTS = [
  { term: 'Required checks', desc: '指定的 CI 任务必须通过才允许合并' },
  { term: 'Required reviews', desc: '至少 N 人 approve，且 approve 后有新提交会重置批准' },
  { term: 'Require linear history', desc: '禁止 merge commit，保持线性' },
  { term: 'Dismiss stale reviews', desc: '有新提交后自动撤销过期 approve' },
  { term: 'Require conversation resolution', desc: '所有评论线程必须解决才能合并' },
  { term: 'Force push 限制', desc: '限制或禁止 force push，避免他人分支被覆盖' },
];

// ── 工作流与配置片段 ──────────────────────────────────────────

export interface WorkflowStep {
  title: string;
  desc: string;
  when: string;
  /** 分支拓扑节点：[标签, x, y]，由组件映射为 SVG 坐标。 */
  nodes: { label: string; x: number; y: number; kind: 'main' | 'branch' | 'tag' | 'commit' }[];
  edges: [number, number][];
}

export const WORKFLOWS: WorkflowStep[] = [
  {
    title: 'GitHub Flow',
    desc: '主干永远可用：从 main 拉短生命周期分支，完成后合并并部署。',
    when: 'Web/SaaS、持续部署、允许特性开关控制发布节奏。',
    nodes: [
      { label: 'main', x: 30, y: 30, kind: 'main' },
      { label: 'main', x: 150, y: 30, kind: 'main' },
      { label: 'main', x: 270, y: 30, kind: 'main' },
      { label: 'feat/a', x: 150, y: 90, kind: 'branch' },
      { label: 'commit', x: 195, y: 90, kind: 'commit' },
      { label: 'release', x: 345, y: 30, kind: 'tag' },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 2],
      [2, 5],
    ],
  },
  {
    title: 'Git Flow',
    desc: '用 develop、release、hotfix 分支把开发与发布节奏彻底分开。',
    when: '有明确版本发布窗口、同时维护多个线上版本、需要长期维护分支。',
    nodes: [
      { label: 'main', x: 30, y: 30, kind: 'main' },
      { label: 'main', x: 150, y: 30, kind: 'main' },
      { label: 'tag', x: 270, y: 30, kind: 'tag' },
      { label: 'develop', x: 150, y: 80, kind: 'branch' },
      { label: 'develop', x: 270, y: 80, kind: 'branch' },
      { label: 'feat', x: 210, y: 130, kind: 'commit' },
      { label: 'release', x: 330, y: 80, kind: 'branch' },
      { label: 'hotfix', x: 210, y: 30, kind: 'branch' },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [3, 4],
      [4, 2],
      [2, 1],
      [1, 7],
      [7, 2],
      [3, 5],
      [5, 4],
      [4, 6],
      [6, 1],
    ],
  },
  {
    title: 'Trunk-Based Development',
    desc: '所有人频繁向主干提交，用特性开关与短周期发布降低风险。',
    when: '测试覆盖率高、能快速回滚、团队规模大到需要频繁集成。',
    nodes: [
      { label: 'trunk', x: 30, y: 60, kind: 'main' },
      { label: 'trunk', x: 120, y: 60, kind: 'main' },
      { label: 'trunk', x: 210, y: 60, kind: 'main' },
      { label: 'trunk', x: 300, y: 60, kind: 'main' },
      { label: 'a', x: 120, y: 20, kind: 'commit' },
      { label: 'b', x: 210, y: 20, kind: 'commit' },
      { label: 'release', x: 300, y: 100, kind: 'tag' },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 1],
      [5, 2],
      [3, 6],
    ],
  },
];

export const WORKFLOW_FLOW_STEPS: Record<string, string[]> = {
  'GitHub Flow': [
    '从 main 切出 feat/xxx 分支',
    '频繁提交并推送，PR 尽早开（可先开 draft）',
    'CI 通过 + 至少一人 approve',
    '合并到 main（默认 squash）',
    '合并即触发部署，失败则回滚上一个版本',
  ],
  'Git Flow': [
    'feature 分支从 develop 切出，合并回 develop',
    '达到发布条件后切 release/x.y，修复直接在该分支提交',
    '发布分支合并到 main 与 develop（打 tag）',
    '线上出问题从 main 切 hotfix，修复合并回 main 与 develop',
    'develop 上线时清理 release 分支',
  ],
  'Trunk-Based Development': [
    '所有改动在极短分支（< 1 天）完成',
    '小步提交到主干，用特性开关控制用户可见性',
    '主干每次提交都跑完整测试与冒烟',
    '按时间窗（如每天/每两周）发布到生产',
    '出现异常立即关闭特性开关（比回滚更快）',
  ],
};

export const SEMVER_RULES = [
  { bump: 'MAJOR（x.0.0）', trigger: '不兼容的 API 变更、删除字段、修改默认值', example: '2.x 移除 v1 的 /user 接口' },
  { bump: 'MINOR（x.y.0）', trigger: '向后兼容地新增功能或新可选参数', example: '新增 /user/batch 接口' },
  { bump: 'PATCH（x.y.z）', trigger: '向后兼容的缺陷修复、文档与依赖补丁升级', example: '修复分页边界越界' },
  { bump: '预发布标识', trigger: 'alpha → beta → rc，最后一个数字即预发布号', example: '1.5.0-rc.1' },
];

export const COMMIT_TO_SEMVER = [
  { commit: 'BREAKING CHANGE: …', effect: 'MAJOR', note: '也可用类型后加 !，如 feat(api)!:' },
  { commit: 'feat: …', effect: 'MINOR', note: '仅文档/测试类的 feat 可标 chore' },
  { commit: 'fix: …', effect: 'PATCH', note: 'perf 视团队约定可记为 PATCH 或 MINOR' },
  { commit: 'docs / style / test / chore / ci / build / refactor', effect: '不发布', note: '不触发版本变化' },
  { commit: 'revert: …', effect: '按被回滚的提交', note: '回滚 feat 通常算 MINOR 或 MAJOR' },
];

export const CHANGELOG_FORMAT = `# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.4.0] - 2026-01-15

### 新增
- 用量统计支持按标签筛选（#123）

### 修复
- 修复导出 CSV 在空值时抛错（#131）

### 破坏性变更
- 登录接口不再接受 form 编码，请改用 JSON

## [1.3.2] - 2025-12-20

### 修复
- 修复刷新令牌并发刷新导致的登出
`;

export const RELEASE_NOTE_TEMPLATE = `## v1.4.0 (2026-01-15)

### 新增
- <特性描述>（#123）

### 修复
- <缺陷描述>（#131）

### 破坏性变更
- <不兼容改动与迁移方式>

### 升级步骤
1. <需要执行的动作，如 npm run migrate>

### 校验
- <如何验证这次发布，附冒烟用例>
`;

export const GH_CI_YAML = `name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  test:
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-\${{ matrix.node }}
          path: coverage/

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/`;

export const GH_CI_PY_YAML = `name: CI (Python)

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.11", "3.12", "3.13"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
          cache: pip
      - run: pip install -e ".[dev]"
      - run: ruff check .
      - run: pytest -q --junitxml=report.xml
      - uses: actions/upload-artifact@v4
        with:
          name: pytest-report-\${{ matrix.python-version }}
          path: report.xml`;

export const GH_CI_GO_YAML = `name: CI (Go)

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.23"
          cache: true
      - run: go vet ./...
      - run: go test -race -coverprofile=cover.out ./...
      - run: go build ./...`;

export const DEPENDABOT_YAML = `# .github/dependabot.yml —— 依赖与 Actions 双重更新
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "10:00"
      timezone: Asia/Shanghai
    open-pull-requests-limit: 5
    reviewers:
      - acme/frontend
    labels:
      - dependencies
    groups:
      dev-dependencies:
        dependency-type: development
      typescript:
        patterns: ["typescript", "@types/*"]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
    labels:
      - ci
`;

export const BUG_REPORT_TEMPLATE = `---
name: 缺陷报告
about: 报告一个可复现的问题
labels: bug
---

## 现象
<!-- 一句话描述发生了什么 -->

## 复现步骤
1.
2.
3.

## 期望行为
<!-- 应该怎样 -->

## 实际行为与报错原文
\`\`\`text
<完整 stack / 响应体，不要截断>
\`\`\`

## 环境
- 版本 / commit：
- 操作系统与浏览器：
- 复现概率：必现 / 偶发（约 x%）

## 影响面
<!-- 是否影响生产？有没有 workaround？ -->
`;

export const PR_TEMPLATE = `## 变更内容
<!-- 这次 PR 做了什么，1~3 句 -->

Closes #

## 变更类型
- [ ] 功能
- [ ] 缺陷修复
- [ ] 重构（无行为变化）
- [ ] 文档 / 配置
- [ ] 依赖升级

## 验证方式
<!-- 给出可复现的步骤或命令，让评审者能自己跑一遍 -->

\`\`\`bash
npm ci
npm test
\`\`\`

## 影响面与风险
- 涉及模块：
- 是否需要迁移/配置变更：
- 回滚方案：

## 自检
- [ ] lint / typecheck 通过
- [ ] 新增逻辑有测试
- [ ] 没有提交密钥、token 与调试代码
- [ ] 文档 / CHANGELOG 已同步
`;

export const CODEOWNERS_FILE = `# .github/CODEOWNERS
# 顺序即优先级：先匹配到的生效，最后一行是兜底

# 默认
*                       @acme/infra

# 前端
/apps/web/              @acme/frontend
/apps/admin/            @acme/frontend @zhangsan

# 后端
/services/api/          @acme/backend
/services/billing/      @lisi @wangwu

# 基础设施与 CI
/.github/workflows/     @acme/platform
/Dockerfile             @acme/infra
/docker/                @acme/infra

# 安全敏感路径必须两人评审
/crypto/                @acme/security @acme/infra
`;

export const GITLAB_CI_YAML = `# .gitlab-ci.yml —— 取 GitLab 缓存与内置 lint/report 特性
stages:
  - lint
  - test
  - build

variables:
  NODE_ENV: test

cache:
  key:
    files:
      - package-lock.json
  paths:
    - node_modules/

.node-base:
  image: node:22-alpine
  before_script:
    - npm ci

lint:
  extends: .node-base
  stage: lint
  script:
    - npm run lint
    - npx tsc --noEmit

test:
  extends: .node-base
  stage: test
  script:
    - npm test -- --coverage
  coverage: '/lines\\s*:\\s*(\\d+\\.\\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    expire_in: 1 week

build:
  extends: .node-base
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
  only:
    - main
`;

export const GITMESSAGE_TEMPLATE = `# ~/.gitmessage —— git commit -t <file> 时作为模板
# 格式：<type>(<scope>): <subject>

# ── type ──
# feat     新功能
# fix      缺陷修复
# docs     文档
# style    格式
# refactor 重构
# perf     性能
# test     测试
# build    构建
# ci       CI
# chore    杂项
# revert   回滚

# ── 规则 ──
# 1. subject 用祈使句，不加句号，≤ 72 字符
# 2. body 说明「为什么改」，不是「改了什么」
# 3. 破坏性变更写在 footer：BREAKING CHANGE: <迁移说明>

feat(scope):

# body:

# BREAKING CHANGE:
`;

export const GITCONFIG_SNIPPET = `[user]
\tname = Your Name
\temail = you@example.com
\tsigningkey = 0xDEADBEEF

[init]
\tdefaultBranch = main

[pull]
\t# true = 拉取时自动 rebase，保持线性历史
\trebase = true

[push]
\t# 首次推送自动设置上游，之后可以只写 git push
\tautoSetupRemote = true
\tdefault = current

[rebase]
\t# 自动 squash fixup!/squash! 提交
\tautoSquash = true
\tautoStash = true
\tupdateRefs = true

[merge]
\tconflictstyle = zdiff3
\ttool = vimdiff

[diff]
\tcolorMoved = zebra
\talgorithm = histogram
\tmnemonicPrefix = true

[core]
\teditor = nvim
\tattributesfile = ~/.gitattributes_global
\texcludesfile = ~/.gitignore_global
\tpager = delta

# 大仓库 / 慢盘的性能开关
[core.fsmonitor]
\tenabled = true
[feature]
\tmanyFiles = true
[gc]
\tauto = 256
[rerere]
\tenabled = true          # 复用历史冲突解法
[fetch]
\tprune = true            # 定期清理远端已删分支
[help]
\tautocorrect = prompt
`;

export const GITATTRIBUTES = `# .gitattributes —— 让 diff 与语言统计更准
* text=auto eol=lf

# 语言统计
*.[jt]s linguist-language=TypeScript
*.tsx linguist-language=TypeScript
*.py linguist-language=Python
*.go linguist-language=Go
*.md linguist-language=Markdown
# 生成物与锁文件不计入统计
package-lock.json linguist-generated=true
bun.lock linguist-generated=true
dist/** linguist-generated=true
*.min.js linguist-generated=true
# 测试文件降低权重
**/*.test.ts linguist-documentation=false
tests/** linguist-generated=true
`;

export const PLATFORM_TRAPS = [
  'GitHub Actions 默认不给写权限：需要写评论、发 Release、推标签时用 permissions: write 显式声明。',
  'schedule 触发的 workflow 在高负载时可能延迟数分钟到数十分钟，不要用它做秒级调度。',
  'GitLab 的 include 与 job 覆盖规则容易互相抵消，排查时先用 CI Lint 工具验证。',
  'Gitea / Forgejo 的 Actions 是兼容实现，部分 action 版本可能不可用，选版本时优先选常用稳定版。',
  '自建平台的 Runner 记得加 concurrency 限制，否则 CI 排队时间会失控。',
];

// ── 正则表达式 ────────────────────────────────────────────────

export interface RegexToken {
  token: string;
  name: string;
  desc: string;
}

/** 常用元字符与分组速查（JavaScript / PCRE 通用部分）。 */
export const REGEX_TOKENS: RegexToken[] = [
  { token: '.', name: '任意字符', desc: '除换行外的任意字符；配合 s 标志可匹配换行' },
  { token: '^ $', name: '锚点', desc: '^ 行首、$ 行尾；配合 m 标志可匹配每行的首尾' },
  { token: '\\b \\B', name: '单词边界', desc: '\\b 单词边界，\\B 非单词边界' },
  { token: '\\d \\w \\s', name: '字符类简写', desc: '数字 / 单词字符 / 空白；大写取反（\\D \\W \\S）' },
  { token: '[abc] [^abc]', name: '字符集合', desc: '匹配集合内任一字符，^ 取反，连字符表示范围 [a-z]' },
  { token: '* + ?', name: '量词', desc: '0 次以上 / 1 次以上 / 0 或 1 次；默认贪婪' },
  { token: '*? +? ??', name: '惰性量词', desc: '在量词后加 ? 改为非贪婪，尽量少匹配' },
  { token: '{n} {n,} {n,m}', name: '精确量词', desc: '限定重复次数，最易被忽略的写法' },
  { token: '( )', name: '捕获分组', desc: '既分组又捕获，match[i] 取第 i 组' },
  { token: '(?: )', name: '非捕获分组', desc: '只分组不捕获，省一个编号，也避免误用 $1' },
  { token: '(?<name> )', name: '命名分组', desc: '可读性更好，JS 用 match.groups.name 取值' },
  { token: '(?= ) (?! )', name: '先行断言', desc: '后面必须 / 必须不满足，不消耗字符' },
  { token: '(?<= ) (?<! )', name: '后行断言', desc: '前面必须 / 必须不满足，不消耗字符' },
  { token: '|', name: '或', desc: '优先级最低，尽量用非捕获分组包起来' },
  { token: '\\1 \\k<name>', name: '反向引用', desc: '引用前面已捕获的内容' },
  { token: '\\n \\t \\\\', name: '转义', desc: '转义特殊字符；JS 里匹配字面量 / 必须写 \\/' },
];

export interface RegexFlag {
  flag: string;
  name: string;
  desc: string;
}

export const REGEX_FLAGS: RegexFlag[] = [
  { flag: 'g', name: '全局', desc: '查找全部匹配而不只是第一个' },
  { flag: 'i', name: '忽略大小写', desc: '字母大小写不敏感' },
  { flag: 'm', name: '多行', desc: '^ $ 匹配每行的首尾' },
  { flag: 's', name: '点号匹配换行', desc: '. 也能匹配 \\n' },
  { flag: 'u', name: 'Unicode', desc: '按码点处理，配合 \\u{...} 与 \\p{...} 使用' },
  { flag: 'y', name: '粘性', desc: '只从 lastIndex 处匹配，不回退' },
  { flag: 'd', name: '索引', desc: '结果里带 indices 属性' },
  { flag: 'v', name: '集合运算', desc: '新式集合写法，需与 u 互斥' },
];

export interface RegexPreset {
  title: string;
  pattern: string;
  flags: string;
  desc: string;
  sample: string;
}

/** 常见场景模板，可一键载入后再改。 */
export const REGEX_PRESETS: RegexPreset[] = [
  {
    title: '邮箱',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}',
    flags: 'g',
    desc: '宽松匹配，够用但会放过少数非法域名',
    sample: '联系我们 support@example.com 或 admin@sub.example.co.uk。',
  },
  {
    title: 'URL',
    pattern: 'https?://[^\\s<>"]+',
    flags: 'g',
    desc: '抓取 http/https 链接，结尾标点需自行裁掉',
    sample: '见 https://example.com/docs?a=1 以及 http://localhost:3000。',
  },
  {
    title: 'IPv4',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b',
    flags: 'g',
    desc: '校验 0-255 的四段地址，比简单 \\d+ 严格',
    sample: '网关 192.168.1.1，非法值 999.1.1.1 应被跳过。',
  },
  {
    title: '日期 YYYY-MM-DD',
    pattern: '\\b(\\d{4})-(\\d{2})-(\\d{2})\\b',
    flags: 'g',
    desc: '带分组，可再对分组做范围校验',
    sample: '发布于 2026-01-15，上一版 2025-12-31。',
  },
  {
    title: '时间 HH:mm:ss',
    pattern: '\\b([01]\\d|2[0-3]):([0-5]\\d):([0-5]\\d)\\b',
    flags: 'g',
    desc: '24 小时制，含 00-23 / 00-59 范围限制',
    sample: '定时任务 09:30:00 与 23:59:59。',
  },
  {
    title: '中文数字金额',
    pattern: '[零一二三四五六七八九十百千万亿]+[元圆]',
    flags: 'g',
    desc: '匹配中文金额表达',
    sample: '本次费用为三千五百二十元整。',
  },
  {
    title: '十六进制颜色',
    pattern: '#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b',
    flags: 'g',
    desc: '匹配 #RGB / #RGBA / #RRGGBB / #RRGGBBAA',
    sample: '主色 #1e90ff，透明 #ffffff80，简写 #fff。',
  },
  {
    title: '去除 HTML 标签',
    pattern: '<[^>]+>',
    flags: 'g',
    desc: '粗暴剥标签；解析 HTML 请用 DOMPurify，别用正则',
    sample: '<p>你好 <b>世界</b></p>',
  },
  {
    title: '提取命名捕获组',
    pattern: '(?<proto>https?)://(?<host>[^/]+)(?<path>/[^?]*)?',
    flags: 'g',
    desc: '用 match.groups 分别取协议、域名、路径',
    sample: 'https://example.com/a/b?x=1',
  },
  {
    title: '重复单词',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    desc: '经典回溯引用示例（需 \\w 词字符，中文不算，故样例用英文词）',
    sample: '这里 the the 和 test test 都会被匹配，中文之间不算重复。',
  },
];

export interface RegexGroupInfo {
  index: number;
  name: string;
  value: string;
}

export interface RegexMatchInfo {
  index: number;
  end: number;
  text: string;
  groups: RegexGroupInfo[];
}

export type RegexCompileResult = { ok: true; re: RegExp } | { ok: false; error: string };

export function compileRegex(pattern: string, flags: string): RegexCompileResult {
  try {
    return { ok: true, re: new RegExp(pattern, flags) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function toGroupInfo(match: RegExpExecArray): RegexGroupInfo[] {
  return Array.from(match, (value, i) => ({
    index: i,
    name: String(i),
    value: value ?? '',
  }));
}

/** 取出命名捕获组的名称（按出现顺序）；无命名分组时返回空数组。 */
export function namedGroupNames(re: RegExp): string[] {
  if (!re.source) return [];
  try {
    // 追加 "|"，让正则匹配空串后 groups 的键会带上所有命名分组
    const probe = new RegExp(`${re.source}|`, re.flags.replace(/[gy]/g, ''));
    const match = probe.exec('');
    return match?.groups ? Object.keys(match.groups) : [];
  } catch {
    return [];
  }
}

/**
 * 收集匹配。支持全局与粘性标志；空匹配会推进 lastIndex 以避免死循环。
 * 超过 limit 后停止，防止在超长文本上卡住。
 */
export function findMatches(re: RegExp, text: string, limit = 500): RegexMatchInfo[] {
  const global = re.global || re.sticky;
  const out: RegexMatchInfo[] = [];
  if (limit <= 0) return out;
  if (!global) {
    const single = re.exec(text);
    if (single)
      out.push({
        index: single.index,
        end: single.index + single[0].length,
        text: single[0],
        groups: toGroupInfo(single),
      });
    return out;
  }
  re.lastIndex = 0;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    out.push({ index: match.index, end: match.index + match[0].length, text: match[0], groups: toGroupInfo(match) });
    if (match[0] === '') re.lastIndex += 1;
    if (out.length >= limit) break;
    match = re.exec(text);
  }
  return out;
}

/** 高亮预览：转义后用 <mark> 包裹命中区间。 */
export function buildHighlightHtml(matches: RegexMatchInfo[], text: string): string {
  let html = '';
  let cursor = 0;
  for (const match of matches) {
    html += escapeRegexHtml(text.slice(cursor, match.index));
    html += `<mark>${escapeRegexHtml(match.text)}</mark>`;
    cursor = match.end;
  }
  return html + escapeRegexHtml(text.slice(cursor));
}

export function escapeRegexHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 替换预览：支持 $1 / $<name> 引用分组。
 * 直接用 String.replace：非全局正则本就只替换首个匹配，
 * 无需把 match[0] 单独再跑一次（那会丢失上下文，让前后行断言失效）。
 */
export function applyReplacement(text: string, pattern: string, flags: string, replacement: string): string {
  const compiled = compileRegex(pattern, flags);
  if (!compiled.ok) return text;
  compiled.re.lastIndex = 0;
  return text.replace(compiled.re, replacement);
}

export function countMatches(re: RegExp, text: string, repeats = 200): number {
  // 非全局正则的 exec 永远从 0 开始且命中后不推进 lastIndex，
  // 直接循环会一直数到 repeats，必须按单次匹配处理。
  if (!re.global && !re.sticky) return re.test(text) ? 1 : 0;
  re.lastIndex = 0;
  let count = 0;
  let match = re.exec(text);
  while (match !== null && count < repeats) {
    count += 1;
    if (match[0] === '') re.lastIndex += 1;
    match = re.exec(text);
  }
  return count;
}

// ── Crontab ───────────────────────────────────────────────────

export interface CronField {
  field: string;
  name: string;
  range: string;
  desc: string;
}

export const CRON_FIELDS: CronField[] = [
  { field: '秒', name: 'second', range: '0-59', desc: '部分实现支持，很多 crontab 不支持' },
  { field: '分', name: 'minute', range: '0-59', desc: '每分钟的第几分钟' },
  { field: '时', name: 'hour', range: '0-23', desc: '每天的第几个小时，0-23，24 点即 0' },
  { field: '日', name: 'day', range: '1-31', desc: '每月第几天；与「周」冲突时通常取或' },
  { field: '月', name: 'month', range: '1-12 或 JAN-DEC', desc: '月份，支持英文缩写' },
  { field: '周', name: 'day of week', range: '0-7 或 SUN-SAT', desc: '0 和 7 都是周日' },
];

export const CRON_ALIASES: { alias: string; expr: string; desc: string }[] = [
  { alias: '@yearly', expr: '0 0 1 1 *', desc: '每年 1 月 1 日 00:00' },
  { alias: '@annually', expr: '0 0 1 1 *', desc: '同 @yearly' },
  { alias: '@monthly', expr: '0 0 1 * *', desc: '每月 1 日 00:00' },
  { alias: '@weekly', expr: '0 0 * * 0', desc: '每周日 00:00' },
  { alias: '@daily', expr: '0 0 * * *', desc: '每天 00:00' },
  { alias: '@midnight', expr: '0 0 * * *', desc: '同 @daily' },
  { alias: '@hourly', expr: '0 * * * *', desc: '每小时整点' },
];

export interface CronPreset {
  label: string;
  expr: string;
  desc: string;
}

export const CRON_PRESETS: CronPreset[] = [
  { label: '每 5 分钟', expr: '*/5 * * * *', desc: '最常见的轮询间隔' },
  { label: '每小时整点', expr: '0 * * * *', desc: '分钟固定为 0' },
  { label: '每天 00:00', expr: '0 0 * * *', desc: '跨天任务' },
  { label: '每天 09:30', expr: '30 9 * * *', desc: '上班前的批处理' },
  { label: '工作日 09:00', expr: '0 9 * * 1-5', desc: '周一到周五' },
  { label: '每周末 03:00', expr: '0 3 * * 0,6', desc: '周清理类任务' },
  { label: '每月 1 日', expr: '0 0 1 * *', desc: '月度账单' },
  { label: '每季度', expr: '0 0 1 1,4,7,10 *', desc: '季度结算' },
  { label: '每周一 08:00', expr: '0 8 * * 1', desc: '周报生成' },
  { label: '每年 1 月 1 日', expr: '0 0 1 1 *', desc: '年度维护' },
  { label: '带秒（每 10 秒）', expr: '*/10 * * * * *', desc: '6 位表达式，部分实现支持' },
];

export interface CronNote {
  title: string;
  desc: string;
}

export const CRON_NOTES: CronNote[] = [
  { title: '时区', desc: 'crontab 按服务器本地时区执行，容器里常是 UTC；跨时区要显式设置 TZ 或用 cron 的 CRON_TZ。' },
  { title: '重叠执行', desc: '上一次没跑完下一次就触发会堆积，多数实现需要自己保证不并发（如加锁）。' },
  { title: '百分比', desc: 'crontab 不支持 %m 这类占位符，需要写日志请用完整命令重定向到文件。' },
  { title: '最短周期', desc: 'crontab 最小粒度是分钟；要秒级请用 systemd timer 或常驻循环。' },
  { title: '日志', desc: 'crontab 默认只发邮件，很多机器没配 MTA，日志会静默丢失，建议自行重定向到文件。' },
];

export const CRON_DIALECT_NOTES: CronNote[] = [
  { title: 'Linux / Vixie cron', desc: '标准 5 位表达式；不认 ? ，秒需用扩展或绕过。' },
  { title: 'macOS / BSD cron', desc: '5 位；不认 ? ，且对 0-7 的周日处理与 Linux 略有差异。' },
  { title: 'Quartz（Java）', desc: '6 位（秒在最前）、支持 ? 、支持 L / W / #，日与周同时指定时取交集而非或。' },
  { title: 'Kubernetes CronJob', desc: '5 位 + 起始秒必须为 0，起点是 UTC，另有 startingDeadlineSeconds / 并发策略。' },
  { title: 'GitHub Actions', desc: '5 位（POSIX），固定按 UTC 调度，且 schedule 事件在高峰期会延迟数分钟。' },
  { title: 'systemd timer', desc: '用 OnCalendar 表达式，精度到秒，比 crontab 更适合替代高频调度。' },
];

/** 由可视化配置拼 cron：数值数组转成 * / 列表 / 步长 / 范围。 */
export function buildCronExpr(input: {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
}): string {
  return [input.minute, input.hour, input.day, input.month, input.weekday].map((v) => v.trim() || '*').join(' ');
}

/** 反向：从表达式抽出各字段，供可视化编辑器回填。 */
export function splitCronFields(cron: string): {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
} {
  const parts = cron.trim().split(/\s+/).filter(Boolean);
  const five = parts.length === 6 ? parts.slice(-5) : parts.slice(0, 5);
  return {
    minute: five[0] ?? '*',
    hour: five[1] ?? '*',
    day: five[2] ?? '*',
    month: five[3] ?? '*',
    weekday: five[4] ?? '*',
  };
}
