import { Blocks, Download, FileCode2, Keyboard, Package2, Puzzle, Table2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  buildEditorconfig,
  buildVscodeExtensions,
  buildVscodeLaunch,
  buildVscodeSettings,
  buildVscodeTasks,
  CAPABILITY_MATRIX,
  EDITOR_LINKS,
  EDITORS,
  type EditorConfigOptions,
  type EditorId,
  editorById,
  INDENT_TABLE,
  JETBRAINS_MAC,
  JETBRAINS_PC,
  MONACO_SNIPPET,
  NVIM_INIT_LUA,
  PLUGIN_LINKS,
  SHORTCUT_TABLE,
  VIM_KEYS,
  VIMRC,
  VSCODE_EXTENSIONS,
  type VscodeSettingsOptions,
} from '../lib/cheatsheet';
import { downloadText, exportName } from '../lib/file';

type MainTab = 'generate' | 'plugins' | 'capability';

type GeneratedFile = { name: string; content: string };

const DEFAULT_SETTINGS: VscodeSettingsOptions = {
  fontFamily: 'JetBrains Mono, SF Mono, Menlo, Consolas, monospace',
  fontSize: 13,
  tabSize: 2,
  insertSpaces: true,
  formatOnSave: true,
  formatter: 'biome',
  lintOnSave: 'biome',
  eol: 'lf',
  theme: 'dark',
  wordWrap: 'off',
  excludeDirs: '',
};

const DEFAULT_EDITORCONFIG: EditorConfigOptions = {
  indentStyle: 'space',
  indentSize: 2,
  endOfLine: 'lf',
  charset: 'utf-8',
  finalNewline: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  maxLineLength: 120,
};

/** 缩进风格选项（直接用 lib 里的常量，避免两处不同步）。 */
const STYLE_OPTIONS = [
  { value: 'space', label: '空格（space）' },
  { value: 'tab', label: '制表符（tab）' },
];

function EditorConfigForm({
  value,
  onChange,
}: {
  value: EditorConfigOptions;
  onChange: (next: EditorConfigOptions) => void;
}) {
  const set = <K extends keyof EditorConfigOptions>(key: K, next: EditorConfigOptions[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        label="缩进风格"
        value={value.indentStyle}
        onChange={(next) => set('indentStyle', next as EditorConfigOptions['indentStyle'])}
        options={STYLE_OPTIONS}
      />
      <NumberField
        label="缩进大小"
        value={value.indentSize}
        onChange={(next) => set('indentSize', next)}
        min={0}
        max={8}
        suffix={value.indentStyle === 'tab' ? '宽度' : '空格'}
        hint="tab 风格时表示 tab 显示宽度"
      />
      <Select
        label="行尾符"
        value={value.endOfLine}
        onChange={(next) => set('endOfLine', next as EditorConfigOptions['endOfLine'])}
        options={[
          { value: 'lf', label: 'LF（Unix / 推荐）' },
          { value: 'crlf', label: 'CRLF（Windows）' },
          { value: 'cr', label: 'CR（旧 Mac）' },
        ]}
      />
      <Select
        label="字符集"
        value={value.charset}
        onChange={(next) => set('charset', next as EditorConfigOptions['charset'])}
        options={[
          { value: 'utf-8', label: 'UTF-8' },
          { value: 'utf-8-bom', label: 'UTF-8 with BOM' },
          { value: 'utf-16', label: 'UTF-16' },
        ]}
      />
      <NumberField
        label="最大行长"
        value={value.maxLineLength}
        onChange={(next) => set('maxLineLength', next)}
        min={0}
        max={400}
        suffix="列"
        hint="填 0 表示不限制"
      />
      <div className="flex flex-col justify-end gap-1">
        <Checkbox
          label="final_newline"
          checked={value.finalNewline}
          onChange={(checked) => set('finalNewline', checked)}
        />
        <Checkbox
          label="insert_final_newline"
          checked={value.insertFinalNewline}
          onChange={(checked) => set('insertFinalNewline', checked)}
        />
        <Checkbox
          label="trim_trailing_whitespace"
          checked={value.trimTrailingWhitespace}
          onChange={(checked) => set('trimTrailingWhitespace', checked)}
        />
      </div>
    </div>
  );
}

function VscodeForm({
  value,
  onChange,
}: {
  value: VscodeSettingsOptions;
  onChange: (next: VscodeSettingsOptions) => void;
}) {
  const set = <K extends keyof VscodeSettingsOptions>(key: K, next: VscodeSettingsOptions[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid grid-cols-2 gap-2">
      <TextField
        label="编辑器字体"
        value={value.fontFamily}
        onChange={(next) => set('fontFamily', next)}
        className="col-span-2"
      />
      <NumberField label="字号" value={value.fontSize} onChange={(next) => set('fontSize', next)} min={10} max={24} />
      <NumberField
        label="tabSize"
        value={value.tabSize}
        onChange={(next) => set('tabSize', next)}
        min={1}
        max={8}
        suffix="空格"
      />
      <Select
        label="缩进方式"
        value={value.insertSpaces ? 'space' : 'tab'}
        onChange={(next) => set('insertSpaces', next === 'space')}
        options={STYLE_OPTIONS}
      />
      <Select
        label="换行"
        value={value.wordWrap}
        onChange={(next) => set('wordWrap', next as VscodeSettingsOptions['wordWrap'])}
        options={[
          { value: 'off', label: '不自动换行' },
          { value: 'on', label: '按视口宽度' },
          { value: 'wordWrapColumn', label: '按列数（100）' },
        ]}
      />
      <Select
        label="格式化器"
        value={value.formatter}
        onChange={(next) => set('formatter', next as VscodeSettingsOptions['formatter'])}
        options={[
          { value: 'biome', label: 'Biome' },
          { value: 'prettier', label: 'Prettier' },
          { value: 'none', label: '不配置' },
        ]}
      />
      <Select
        label="保存时检查"
        value={value.lintOnSave}
        onChange={(next) => set('lintOnSave', next as VscodeSettingsOptions['lintOnSave'])}
        options={[
          { value: 'biome', label: 'Biome（fixAll + organizeImports）' },
          { value: 'eslint', label: 'ESLint（fixAll + organizeImports）' },
          { value: 'none', label: '不配置' },
        ]}
      />
      <Select
        label="行尾符"
        value={value.eol}
        onChange={(next) => set('eol', next as VscodeSettingsOptions['eol'])}
        options={[
          { value: 'lf', label: 'LF' },
          { value: 'crlf', label: 'CRLF' },
        ]}
      />
      <Select
        label="颜色主题"
        value={value.theme}
        onChange={(next) => set('theme', next as VscodeSettingsOptions['theme'])}
        options={[
          { value: 'dark', label: 'Default Dark Modern' },
          { value: 'light', label: 'Default Light Modern' },
          { value: 'default', label: '跟随系统' },
          { value: 'high-contrast', label: '高对比度' },
        ]}
      />
      <TextField
        label="额外排除目录"
        value={value.excludeDirs}
        onChange={(next) => set('excludeDirs', next)}
        placeholder="**/vendor, **/fixtures"
        className="col-span-2"
        hint="追加到 search.exclude 与 files.exclude，逗号分隔"
      />
      <Checkbox
        label="保存时自动格式化与修复"
        checked={value.formatOnSave}
        onChange={(checked) => set('formatOnSave', checked)}
      />
    </div>
  );
}

function CheatTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border scrollbar-thin">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-muted/90 backdrop-blur">
          <tr>
            {headers.map((header) => (
              <th key={header} className="p-1.5 text-left font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-t align-top">
              {row.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 只读静态表格，行内无状态与 ref
                <td key={index} className="p-1.5 leading-relaxed">
                  {index === 0 || /^[[\]{}()<>|+*]/.test(String(cell)) ? (
                    <span className="font-mono">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Ide() {
  const [tab, setTab] = useState<MainTab>('generate');
  const [editor, setEditor] = useState<EditorId>('vscode');
  const [settings, setSettings] = useState<VscodeSettingsOptions>(DEFAULT_SETTINGS);
  const [editorConfig, setEditorConfig] = useState<EditorConfigOptions>(DEFAULT_EDITORCONFIG);
  const [picked, setPicked] = useState<string>('settings.json');

  const current = editorById(editor);
  const isVscode = current.family === 'vscode';

  const files = useMemo<GeneratedFile[]>(() => {
    const editorconfig: GeneratedFile = { name: '.editorconfig', content: buildEditorconfig(editorConfig) };
    if (isVscode) {
      return [
        { name: '.vscode/settings.json', content: buildVscodeSettings(settings) },
        { name: '.vscode/launch.json', content: buildVscodeLaunch() },
        { name: '.vscode/tasks.json', content: buildVscodeTasks() },
        { name: '.vscode/extensions.json', content: buildVscodeExtensions() },
        editorconfig,
      ];
    }
    if (current.family === 'vim') {
      const nvim = current.id === 'nvim';
      return [{ name: nvim ? 'init.lua' : '.vimrc', content: nvim ? NVIM_INIT_LUA : VIMRC }, editorconfig];
    }
    if (current.family === 'jetbrains') {
      return [
        {
          name: 'keymap-reference.md',
          content: [
            '# JetBrains 常用快捷键',
            '',
            '查找与导航：Settings → Keymap 里可以直接搜索动作名。',
            '',
            '## macOS',
            ...JETBRAINS_MAC.map((row) => `- ${row.action}：\`${row.keys}\``),
            '',
            '## Windows / Linux',
            ...JETBRAINS_PC.map((row) => `- ${row.action}：\`${row.keys}\``),
            '',
          ].join('\n'),
        },
        editorconfig,
      ];
    }
    return [editorconfig];
  }, [current, editorConfig, isVscode, settings]);

  const activeFile = files.find((file) => file.name === picked) ?? files[0];

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Blocks className="size-4" />
          代码编辑器 / IDE 导航
        </span>
      }
      description="能力速查、编辑器配置生成与插件推荐（不含 IDE 本身）"
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="generate" active={tab === 'generate'}>
            配置生成
          </TabsTrigger>
          <TabsTrigger value="plugins" active={tab === 'plugins'}>
            插件与主题
          </TabsTrigger>
          <TabsTrigger value="capability" active={tab === 'capability'}>
            能力清单
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        {tab === 'generate' && (
          <>
            <div className="flex flex-col gap-2">
              <Select
                label="编辑器 / IDE"
                value={editor}
                onChange={(value) => {
                  setEditor(value as EditorId);
                  setPicked('settings.json');
                }}
                options={EDITORS.map((item) => ({ value: item.id, label: item.name }))}
                hint={current.note}
              />
              {isVscode && <VscodeForm value={settings} onChange={setSettings} />}
              {!isVscode && current.family !== 'vim' && (
                <Note tone="info" title="配置方式">
                  {current.family === 'jetbrains'
                    ? 'JetBrains 不使用 JSON 配置：插件从 Marketplace 装，行为通过 Settings（⌘, / Ctrl+Alt+S）与 Keymap 调整。下面提供快捷键速查与通用 .editorconfig。'
                    : '该编辑器主要通过插件市场扩展能力，配置多为 GUI 驱动。下面提供通用 .editorconfig，以及官网文档入口。'}
                </Note>
              )}
              {current.family === 'vim' && (
                <Note tone="info" title="配置方式">
                  {current.id === 'nvim'
                    ? 'Neovim 默认读 ~/.config/nvim/init.lua。下面给出含 LSP、Treesitter 与 lazy.nvim 的最小可用配置。'
                    : 'Vim 默认读 ~/.vimrc。下面给出含语法、缩进与映射的最小配置。'}
                </Note>
              )}
              <EditorConfigForm value={editorConfig} onChange={setEditorConfig} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {files.map((file) => (
                  <Button
                    key={file.name}
                    size="sm"
                    variant={activeFile?.name === file.name ? 'secondary' : 'ghost'}
                    className="font-mono"
                    onClick={() => setPicked(file.name)}
                  >
                    {file.name}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!activeFile}
                  onClick={() => {
                    if (!activeFile) return;
                    const flat = activeFile.name.replace(/\//g, '-');
                    downloadText(exportName(flat.replace(/^\./, ''), 'txt'), activeFile.content);
                  }}
                >
                  <Download className="size-3.5" />
                  下载
                </Button>
              </div>
              <ResultBox label={activeFile?.name ?? '配置'} value={activeFile?.content ?? ''} rows="min-h-72" fill />
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={current.site}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] text-primary underline-offset-4 hover:underline"
                >
                  {current.name} 官网 ↗
                </a>
              </div>
            </div>
          </>
        )}

        {tab === 'plugins' && (
          <>
            <div className="flex flex-col gap-2">
              <Section title="官方与生态入口">
                <LinkList items={EDITOR_LINKS} />
              </Section>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="高价值插件与主题" description="每条都说明它解决什么问题">
                <LinkList items={PLUGIN_LINKS} columns={2} />
              </Section>
              <Section title="VS Code 推荐扩展清单" description="可直接生成 extensions.json">
                <ul className="flex flex-col gap-2">
                  {VSCODE_EXTENSIONS.map((group) => (
                    <li key={group.label}>
                      <p className="mb-1 text-[11px] font-medium">{group.label}</p>
                      <div className="flex flex-wrap gap-1">
                        {group.ids.map((id) => (
                          <code
                            key={id}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {id}
                          </code>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditor('vscode');
                    setPicked('extensions.json');
                    setTab('generate');
                  }}
                >
                  <FileCode2 className="size-3.5" />
                  生成 extensions.json
                </Button>
              </Section>
              <Section title="JetBrains 插件" description="从 Marketplace 搜索动作名更高效">
                <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  <li>
                    Settings → Plugins 里按「动作」搜索比按插件名搜索更快：例如搜 Reformat File
                    会列出所有提供该动作的插件。
                  </li>
                  <li>
                    常用组合：Rainbow Brackets（括号配色）、GitToolBox（提交面板增强）、Save Actions
                    x（保存时自动执行）、Translation（中文注释双向翻译）。
                  </li>
                  <li>插件装多了会拖慢启动，用 Settings → Plugins 的「已安装」页按最近使用时间清理。</li>
                </ul>
              </Section>
            </div>
          </>
        )}

        {tab === 'capability' && (
          <>
            <div className="flex flex-col gap-2">
              <Section title="IDE 能力由什么技术承担" description="理解这层，跨编辑器迁移时就知道该换什么">
                <div className="max-h-[26rem] overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                      <tr>
                        <th className="p-1.5 text-left font-medium">能力</th>
                        <th className="p-1.5 text-left font-medium">技术</th>
                        <th className="p-1.5 text-left font-medium">说明</th>
                        <th className="p-1.5 text-left font-medium">代表实现</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CAPABILITY_MATRIX.map((row) => (
                        <tr key={row.capability} className="border-t align-top">
                          <td className="p-1.5 font-medium">{row.capability}</td>
                          <td className="p-1.5 font-mono leading-relaxed">{row.tech}</td>
                          <td className="p-1.5 leading-relaxed text-muted-foreground">{row.detail}</td>
                          <td className="p-1.5 leading-relaxed text-muted-foreground">{row.where}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Note tone="info" title="怎么用这张表">
                遇到「这个编辑器能不能干 X」的问题时，先看 X 对应的技术，再看该编辑器是否实现了这项技术。例如问「Cursor
                为什么能跨文件重构」，答案是它内置了 LSP 客户端与代码索引，而不是靠模型直接改所有文件。
              </Note>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <Keyboard className="size-3.5" />
                    快捷键四栏对照
                  </span>
                }
                description="同一操作在 VS Code / JetBrains / Vim / Sublime 里的做法"
              >
                <CheatTable
                  headers={['操作', 'VS Code', 'JetBrains', 'Vim', 'Sublime Text']}
                  rows={SHORTCUT_TABLE.map((row) => [row.action, row.vscode, row.jetbrains, row.vim, row.sublime])}
                />
              </Section>
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <Table2 className="size-3.5" />
                    缩进与制表符速查
                  </span>
                }
              >
                <CheatTable
                  headers={['语言', 'VS Code', 'JetBrains', '备注']}
                  rows={INDENT_TABLE.map((row) => [row.language, row.vscode, row.jetbrains, row.note])}
                />
              </Section>
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <Puzzle className="size-3.5" />
                    Vim / Neovim 按键速查
                  </span>
                }
                description="Vim 的所有疑问都可以用 :help 查"
              >
                <div className="flex flex-col gap-2">
                  {VIM_KEYS.map((group) => (
                    <div key={group.group}>
                      <p className="mb-1 text-[11px] font-medium">{group.group}</p>
                      <ul className="grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
                        {group.items.map((item) => (
                          <li key={item.keys} className="flex gap-1.5 text-[11px]">
                            <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                              {item.keys}
                            </code>
                            <span className="text-muted-foreground">{item.desc}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </>
        )}
      </div>

      <Note tone="info" title="为什么这里没有 IDE">
        浏览器扩展受 CSP 与沙箱限制，无法内嵌完整的语言服务器、调试器与文件系统访问；而且一个真正的 IDE 体积在数百 MB
        量级，装进扩展既不现实也没必要。这里的替代思路是：告诉你<strong>怎么把编辑器配置好</strong>
        ，并解释每项能力背后依赖什么技术。需要在线 编辑能力时，用 Monaco 这类轻量方案。
      </Note>

      <Section
        title={
          <span className="inline-flex items-center gap-1">
            <Wand2 className="size-3.5" />
            Monaco Editor 轻量集成示例
          </span>
        }
        description="本扩展未安装该依赖，代码仅供参考"
      >
        <ResultBox label="MiniEditor.tsx" value={MONACO_SNIPPET} rows="min-h-48" />
        <Note tone="warn" title="接入前需要确认">
          <span className="inline-flex items-start gap-1">
            <Package2 className="mt-0.5 size-3" />
            monaco-editor 体积在数 MB 量级，建议动态 import；worker 需要在扩展清单的 CSP 中放行； Monaco 的 TypeScript
            智能来自内置的 TS 编译器（只做类型检查，不执行代码），体积与内存开销都要评估后再决定。
          </span>
        </Note>
      </Section>
    </ToolPanel>
  );
}
