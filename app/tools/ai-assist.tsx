import { Copy, Cpu, HardDrive, Library, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/field';
import { LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  AI_TOOLS,
  LOCAL_MODEL_MATRIX,
  LOCAL_MODEL_PITFALLS,
  MODELFILE_EXAMPLE,
  OLLAMA_CURL,
  PROMPT_CATEGORIES,
  PROMPT_PITFALLS,
  PROMPT_TEMPLATES,
  type PromptTemplate,
  QUANT_TABLE,
  renderPrompt,
} from '../lib/cheatsheet';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';

type MainTab = 'prompt' | 'tools' | 'local' | 'library';

const LIBRARY_KEY = 'coder-tools:ai-prompt-library';

interface SavedTemplate {
  id: string;
  name: string;
  tags: string[];
  prompt: string;
  createdAt: string;
}

function readLibrary(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedTemplate =>
        typeof item === 'object' && item !== null && typeof (item as SavedTemplate).prompt === 'string',
    );
  } catch {
    return [];
  }
}

/** 粗略 token 估算：英文按 4 字符/token，中文按 1.5 字符/token，取加权结果。 */
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

interface BuilderState {
  goal: string;
  context: string;
  stack: string;
  constraints: string;
  output: string;
}

const EMPTY_BUILDER: BuilderState = { goal: '', context: '', stack: '', constraints: '', output: '' };

function buildPromptText(state: BuilderState): string {
  const lines: string[] = [];
  if (state.goal.trim()) lines.push(`【任务】${state.goal.trim()}`);
  if (state.context.trim()) lines.push(`【上下文】${state.context.trim()}`);
  if (state.stack.trim()) lines.push(`【技术栈】${state.stack.trim()}`);
  if (state.constraints.trim()) lines.push(`【约束】${state.constraints.trim()}`);
  if (state.output.trim()) lines.push(`【输出】${state.output.trim()}`);
  lines.push('开始前先用一句话复述你对需求的理解，等我确认后再动手。');
  return lines.join('\n');
}

export default function AiAssist() {
  const [tab, setTab] = useState<MainTab>('prompt');

  // ── 提示词工程 ──────────────────────────────────────────────
  const [category, setCategory] = useState<string>('全部');
  const [templateId, setTemplateId] = useState(PROMPT_TEMPLATES[0].id);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);

  const templates = useMemo(
    () => (category === '全部' ? PROMPT_TEMPLATES : PROMPT_TEMPLATES.filter((t) => t.category === category)),
    [category],
  );
  const template: PromptTemplate = PROMPT_TEMPLATES.find((item) => item.id === templateId) ?? PROMPT_TEMPLATES[0];
  const rendered = renderPrompt(template);
  const builtText = buildPromptText(builder);
  const builtTokens = estimateTokens(builtText);

  const setBuilderField = (key: keyof BuilderState, value: string) => setBuilder((prev) => ({ ...prev, [key]: value }));

  // ── 提示词库 ────────────────────────────────────────────────
  const [library, setLibrary] = useState<SavedTemplate[]>(readLibrary);
  const [libName, setLibName] = useState('');
  const [libTags, setLibTags] = useState('');
  const [libText, setLibText] = useState('');
  const [libFilter, setLibFilter] = useState('');
  const [libQuery, setLibQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch {
      // 存储不可用时静默降级为仅本次会话有效
    }
  }, [library]);

  const allTags = useMemo(
    () => [...new Set(library.flatMap((item) => item.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [library],
  );
  const filteredLibrary = useMemo(() => {
    const tag = libFilter.trim();
    const keyword = libQuery.trim().toLowerCase();
    return library.filter((item) => {
      if (tag !== '' && !item.tags.includes(tag)) return false;
      if (keyword === '') return true;
      return `${item.name} ${item.tags.join(' ')} ${item.prompt}`.toLowerCase().includes(keyword);
    });
  }, [libFilter, libQuery, library]);

  const saveCurrent = useCallback(() => {
    if (libText.trim() === '') {
      setNote('先粘贴一段提示词');
      return;
    }
    const tags = libTags
      .split(/[,，\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const item: SavedTemplate = {
      id: `t_${Date.now().toString(36)}`,
      name: libName.trim() || `提示词 ${library.length + 1}`,
      tags,
      prompt: libText,
      createdAt: new Date().toISOString(),
    };
    setLibrary([item, ...library]);
    setLibName('');
    setLibTags('');
    setLibText('');
    setNote(`已保存「${item.name}」`);
  }, [libName, libTags, libText, library]);

  const importLibrary = useCallback(async () => {
    try {
      const files = await pickFiles({ accept: '.json,application/json', multiple: false });
      const file = files[0];
      if (!file) return;
      const parsed: unknown = JSON.parse(await readAsText(file));
      if (!Array.isArray(parsed)) throw new Error('应为提示词数组');
      const items = parsed.filter(
        (item): item is SavedTemplate =>
          typeof item === 'object' && item !== null && typeof (item as SavedTemplate).prompt === 'string',
      );
      setLibrary([...items, ...library]);
      setNote(`已导入 ${items.length} 条提示词`);
    } catch (error) {
      setNote(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [library]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Wand2 className="size-4" />
          AI 编程助手导航
        </span>
      }
      description={`${PROMPT_TEMPLATES.length} 条提示词模板、${AI_TOOLS.length} 款工具选型与本地模型参考`}
      actions={note ? <span className="text-[11px] text-muted-foreground">{note}</span> : undefined}
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="prompt" active={tab === 'prompt'}>
            提示词工程
          </TabsTrigger>
          <TabsTrigger value="tools" active={tab === 'tools'}>
            工具与选型
          </TabsTrigger>
          <TabsTrigger value="local" active={tab === 'local'}>
            本地模型
          </TabsTrigger>
          <TabsTrigger value="library" active={tab === 'library'}>
            提示词库
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        {tab === 'prompt' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <div className="flex flex-wrap items-center gap-1">
                {['全部', ...PROMPT_CATEGORIES].map((item) => (
                  <Button
                    key={item}
                    size="sm"
                    variant={category === item ? 'secondary' : 'ghost'}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              <ul className="flex flex-col gap-1">
                {templates.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(item.id)}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50 ${
                        item.id === templateId ? 'border-primary bg-accent/50' : ''
                      }`}
                    >
                      <span className="font-medium">{item.title}</span>
                      <span className="block text-[10px] text-muted-foreground">{item.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <ResultBox
                label={`五段式模板：${template.title}`}
                value={rendered}
                onCopy={() => void copyText(rendered)}
                rows="min-h-56"
              />
              <Section title="提示词组装器" description="填表 → 实时生成，token 为粗估">
                <div className="flex flex-col gap-2">
                  <TextField
                    label="目标（做什么）"
                    value={builder.goal}
                    onChange={(value) => setBuilderField('goal', value)}
                    placeholder="实现一个带防抖的搜索输入框"
                  />
                  <TextField
                    label="上下文（文件、报错、相关代码）"
                    value={builder.context}
                    onChange={(value) => setBuilderField('context', value)}
                    placeholder="app/components/Search.tsx，使用 React 19 与 Tailwind v4"
                  />
                  <TextField
                    label="语言 / 框架"
                    value={builder.stack}
                    onChange={(value) => setBuilderField('stack', value)}
                    placeholder="TypeScript strict / React 19 / Tailwind v4"
                  />
                  <TextField
                    label="约束（不能做什么）"
                    value={builder.constraints}
                    onChange={(value) => setBuilderField('constraints', value)}
                    placeholder="不引入新依赖；保持无障碍；不用 any"
                  />
                  <TextField
                    label="输出格式"
                    value={builder.output}
                    onChange={(value) => setBuilderField('output', value)}
                    placeholder="完整文件 + 3 条边界说明"
                  />
                </div>
                <StatGrid>
                  <Stat label="字符数" value={builtText.length} />
                  <Stat label="粗估 token" value={builtTokens} hint="字符/4 折算，中文按 1.5 字符/token" />
                </StatGrid>
                <ResultBox label="生成结果" value={builtText} onCopy={() => void copyText(builtText)} rows="min-h-32" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBuilder(EMPTY_BUILDER)}
                    disabled={builtText === ''}
                  >
                    清空
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setLibName(`组装器 ${new Date().toLocaleDateString('zh-CN')}`);
                      setLibText(builtText);
                      setTab('library');
                    }}
                    disabled={builtText === ''}
                  >
                    存入提示词库
                  </Button>
                </div>
              </Section>
            </div>
          </>
        )}

        {tab === 'tools' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="选型速查" description="按分类与部署形态看，官网链接可点">
                <div className="overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                      <tr>
                        <th className="p-1.5 text-left font-medium">工具</th>
                        <th className="p-1.5 text-left font-medium">形态</th>
                        <th className="p-1.5 text-left font-medium">部署</th>
                        <th className="p-1.5 text-left font-medium">适用场景</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AI_TOOLS.map((tool) => (
                        <tr key={tool.name} className="border-t align-top">
                          <td className="p-1.5">
                            <a
                              href={tool.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {tool.name}
                            </a>
                            <span className="block text-[10px] text-muted-foreground">{tool.positioning}</span>
                          </td>
                          <td className="p-1.5 text-muted-foreground">{tool.category}</td>
                          <td className="p-1.5">
                            <span
                              className={
                                tool.deployment === '本地'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : tool.deployment === '混合'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-muted-foreground'
                              }
                            >
                              {tool.deployment}
                            </span>
                          </td>
                          <td className="p-1.5 text-muted-foreground">{tool.scenario}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="官网入口" description="全部为各产品官方地址">
                <LinkList
                  items={AI_TOOLS.map((tool) => ({
                    name: tool.name,
                    url: tool.url,
                    description: `${tool.positioning} · ${tool.scenario}`,
                    tags: [tool.category, tool.deployment],
                  }))}
                  columns={2}
                />
              </Section>
              <Section title="选型时的四个问题">
                <ul className="flex list-none flex-col gap-1 text-[11px] text-muted-foreground">
                  <li>1. 代码能不能出内网？决定能不能用云端服务；不能就只看「本地 / 混合」。</li>
                  <li>2. 主要工作在终端还是编辑器？终端为主选 CLI 助手，编辑器为主选插件或 AI IDE。</li>
                  <li>
                    3. 需不需要跑命令、装依赖？需要就必须选 agent 类（Claude Code / Cline / Aider），纯补全插件做不到。
                  </li>
                  <li>
                    4. 团队规模？多人协作优先考虑统一平台（Copilot / 通义灵码 / Cursor
                    团队版），避免每人工具不同导致规范分裂。
                  </li>
                </ul>
              </Section>
            </div>
          </>
        )}

        {tab === 'local' && (
          <>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="size-3.5" />
                    模型规模与硬件需求
                  </span>
                }
                description="静态参考值，显存需求随上下文长度与并发上升"
              >
                <div className="overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr>
                        {LOCAL_MODEL_MATRIX.columns.map((col) => (
                          <th key={col} className="p-1.5 text-left font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {LOCAL_MODEL_MATRIX.rows.map((row) => (
                        <tr key={row[0]} className="border-t">
                          {row.map((cell, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: 只读静态表格
                            <td key={index} className="p-1.5 font-mono">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section
                title={
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="size-3.5" />
                    量化格式
                  </span>
                }
                description="Q4_K_M 起步，质量与体积平衡最好"
              >
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        {QUANT_TABLE.columns.map((col) => (
                          <th key={col} className="p-1.5 text-left font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {QUANT_TABLE.rows.map((row) => (
                        <tr key={row[0]} className="border-t">
                          {row.map((cell, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: 只读静态表格
                            <td key={index} className="p-1.5">
                              {index === 0 ? <span className="font-mono">{cell}</span> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              <Section title="本地部署要点">
                <ul className="flex list-none flex-col gap-1 text-[11px] text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Ollama</strong>：最省事。`ollama pull qwen2.5-coder:7b` 起，自带
                    11434 HTTP 接口，编辑器插件与 CLI 都能直接连。适合个人与小团队。
                  </li>
                  <li>
                    <strong className="text-foreground">llama.cpp</strong>：性能天花板最高，GGUF 生态源头，CPU
                    也能跑。适合显存受限或要精细控制采样参数的场景。
                  </li>
                  <li>
                    <strong className="text-foreground">vLLM</strong>：面向 GPU 批量推理的 PagedAttention
                    服务，适合把本地模型做成团队共享 API。
                  </li>
                  <li>
                    起步建议：8GB 显存跑 7B~8B 的 Q4_K_M；12~16GB 跑 13B~14B；24GB 再考虑 30B。CPU 也能跑，但每秒几个
                    token 时不如云端。
                  </li>
                </ul>
              </Section>
              <ResultBox label="Modelfile 示例" value={MODELFILE_EXAMPLE} rows="min-h-40" />
              <ResultBox label="curl 调用示例" value={OLLAMA_CURL} rows="min-h-40" />
              <Note tone="warn" title="常见坑">
                <ul className="flex list-none flex-col gap-0.5">
                  {LOCAL_MODEL_PITFALLS.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </Note>
            </div>
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="flex flex-col gap-2">
              <Section title="保存自定义提示词" description="存在 localStorage，可导出备份">
                <div className="flex flex-col gap-2">
                  <TextField
                    label="名称"
                    value={libName}
                    onChange={setLibName}
                    placeholder="如：给新同事写 onboarding 文档"
                  />
                  <TextField label="标签" value={libTags} onChange={setLibTags} placeholder="文档, 团队, 中文" />
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">提示词内容</span>
                    <textarea
                      value={libText}
                      onChange={(event) => setLibText(event.target.value)}
                      placeholder="粘贴提示词"
                      spellCheck={false}
                      className="min-h-32 w-full resize-none rounded-md border bg-background px-3 py-2 font-mono text-xs focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" onClick={saveCurrent}>
                      <Plus className="size-3.5" />
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLibName('');
                        setLibTags('');
                        setLibText('');
                      }}
                    >
                      清空
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLibText(rendered);
                        setLibName(template.title);
                        setLibTags(template.category);
                        setNote('已把当前模板填入编辑区，点「保存」入库');
                      }}
                    >
                      <Sparkles className="size-3.5" />
                      填入当前模板
                    </Button>
                  </div>
                </div>
              </Section>
              <Section title="筛选" description={`共 ${library.length} 条`}>
                <TextField label="搜索" value={libQuery} onChange={setLibQuery} placeholder="按名称、标签或内容过滤" />
                <div className="flex flex-wrap items-center gap-1">
                  {allTags.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">还没有标签</span>
                  ) : (
                    allTags.map((tag) => (
                      <Button
                        key={tag}
                        size="sm"
                        variant={libFilter === tag ? 'secondary' : 'ghost'}
                        onClick={() => setLibFilter(libFilter === tag ? '' : tag)}
                      >
                        {tag}
                      </Button>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadText(
                        exportName('ai-prompts', 'json'),
                        JSON.stringify(library, null, 2),
                        'application/json;charset=utf-8',
                      )
                    }
                    disabled={library.length === 0}
                  >
                    导出 JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void importLibrary()}>
                    导入 JSON
                  </Button>
                </div>
              </Section>
            </div>
            <div className="flex flex-col gap-2 overflow-auto scrollbar-thin">
              {filteredLibrary.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">提示词库为空</p>
              ) : (
                filteredLibrary.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1.5 rounded-md border p-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs font-medium">{item.name}</span>
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label={`复制提示词 ${item.name}`}
                          onClick={() => void copyText(item.prompt)}
                        >
                          <Copy className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label={`编辑提示词 ${item.name}`}
                          onClick={() => {
                            setLibName(item.name);
                            setLibTags(item.tags.join(', '));
                            setLibText(item.prompt);
                            setLibrary(library.filter((x) => x.id !== item.id));
                            setNote(`已把「${item.name}」载入编辑区，保存后会覆盖旧内容`);
                          }}
                        >
                          <Wand2 className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label={`删除提示词 ${item.name}`}
                          onClick={() => setLibrary(library.filter((x) => x.id !== item.id))}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </span>
                    </div>
                    <pre className="max-h-32 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap scrollbar-thin">
                      {item.prompt}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {tab === 'prompt' && (
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <Library className="size-3.5" />
              常见问题：为什么模型答非所问
            </span>
          }
          description="这些是实践里最有效的改进"
        >
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {PROMPT_PITFALLS.map((item) => (
              <li key={item.problem} className="rounded-md border p-2 text-[11px] leading-relaxed">
                <p className="text-destructive">✗ {item.problem}</p>
                <p className="mt-0.5 text-muted-foreground">✓ {item.fix}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Note tone="info" title="本扩展不调用任何模型">
        所有内容都是离线模板与选型参考，运行期间不发出任何网络请求，也不会把你的代码或提示词发到任何服务。自定义提示词仅保存在浏览器
        localStorage，清除浏览器数据会丢失，可在「提示词库」页导出 JSON 备份。
      </Note>
    </ToolPanel>
  );
}
