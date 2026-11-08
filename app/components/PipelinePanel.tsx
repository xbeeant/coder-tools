import { ArrowDown, ArrowUp, Download, Pin, Play, Plus, Trash2, Workflow, X } from 'lucide-react';
import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type FailurePolicy,
  loadRecipes,
  loadVars,
  MAX_STEPS,
  newRecipe,
  newStep,
  type PipelineRecipe,
  type PipelineStep,
  type PipelineVars,
  parseRecipeImport,
  putVar,
  saveRecipes,
  saveVars,
  serializeRecipes,
} from '../lib/pipeline';
import { captureOutputs, captureStepInputs, pickPrimaryOutput } from '../lib/pipeline-dom';
import { type RunLogEntry, runRecipe } from '../lib/pipeline-run';
import { findTool, TOOLS } from '../lib/registry';
import { Button } from './ui/button';
import { Select } from './ui/field';
import { Input } from './ui/input';
import { copyText } from './ui/result';
import { Textarea } from './ui/textarea';
import { cn } from './ui/utils';

export interface PipelinePanelProps {
  open: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: 'success' | 'error') => void;
  containerRef: RefObject<HTMLElement | null>;
  activeToolId: string;
  activeToolName: string;
  goTo: (toolId: string) => void;
}

const TOOL_OPTIONS = TOOLS.map((tool) => ({ value: tool.meta.id, label: tool.meta.name }));
const POLICY_OPTIONS = [
  { value: 'stop', label: '失败则中止' },
  { value: 'continue', label: '失败则继续' },
];

const TONE_CLASS: Record<RunLogEntry['tone'], string> = {
  info: 'text-muted-foreground',
  success: 'text-success',
  warn: 'text-warning',
  error: 'text-danger',
};

export function PipelinePanel({
  open,
  onClose,
  onNotify,
  containerRef,
  activeToolId,
  activeToolName,
  goTo,
}: PipelinePanelProps) {
  const [recipes, setRecipes] = useState<PipelineRecipe[]>(() => loadRecipes());
  const [selectedId, setSelectedId] = useState('');
  const [vars, setVars] = useState<PipelineVars>(() => loadVars());
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [varName, setVarName] = useState('body');
  const [manualName, setManualName] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const recipe = useMemo(
    () => recipes.find((item) => item.id === selectedId) ?? recipes[0] ?? null,
    [recipes, selectedId],
  );

  useEffect(() => {
    if (!selectedId && recipes[0]) setSelectedId(recipes[0].id);
  }, [recipes, selectedId]);

  useEffect(() => {
    if (!open) return;
    const saved = saveRecipes(recipes);
    if (!saved.ok) onNotify(saved.error ?? '配方保存失败', 'error');
  }, [recipes, open, onNotify]);

  useEffect(() => {
    if (!open) return;
    const saved = saveVars(vars);
    if (!saved.ok) onNotify(saved.error ?? '变量池保存失败', 'error');
  }, [vars, open, onNotify]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  /** 修改当前配方，始终返回新对象，避免直接改 state。 */
  const mutateRecipe = useCallback(
    (mutate: (draft: PipelineRecipe) => void) => {
      setRecipes((prev) => {
        const targetId = prev.some((item) => item.id === selectedId) ? selectedId : prev[0]?.id;
        if (!targetId) return prev;
        return prev.map((item) => {
          if (item.id !== targetId) return item;
          const draft: PipelineRecipe = {
            ...item,
            steps: item.steps.map((step) => ({ ...step, inputs: { ...step.inputs } })),
            updatedAt: new Date().toISOString(),
          };
          mutate(draft);
          return draft;
        });
      });
    },
    [selectedId],
  );

  const mutateStep = useCallback(
    (stepId: string, mutate: (step: PipelineStep) => void) => {
      mutateRecipe((draft) => {
        const step = draft.steps.find((item) => item.id === stepId);
        if (step) mutate(step);
      });
    },
    [mutateRecipe],
  );

  const moveStep = useCallback(
    (stepId: string, delta: number) => {
      mutateRecipe((draft) => {
        const index = draft.steps.findIndex((item) => item.id === stepId);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= draft.steps.length) return;
        const [step] = draft.steps.splice(index, 1);
        if (step) draft.steps.splice(target, 0, step);
      });
    },
    [mutateRecipe],
  );

  const addRecipe = () => {
    const created = newRecipe(`配方 ${recipes.length + 1}`);
    setRecipes((prev) => [...prev, created]);
    setSelectedId(created.id);
    setLogs([]);
  };

  const deleteRecipe = () => {
    if (!recipe) return;
    setRecipes((prev) => prev.filter((item) => item.id !== recipe.id));
    setSelectedId('');
    onNotify('已删除当前配方');
  };

  const captureStep = () => {
    if (!recipe) {
      onNotify('请先新建一个配方', 'error');
      return;
    }
    if (recipe.steps.length >= MAX_STEPS) {
      onNotify(`单个配方最多 ${MAX_STEPS} 步`, 'error');
      return;
    }
    const container = containerRef.current;
    const inputs = container ? captureStepInputs(container) : {};
    const step = newStep(activeToolId, activeToolName, inputs);
    mutateRecipe((draft) => {
      draft.steps.push(step);
    });
    onNotify(`已捕获「${activeToolName}」的 ${Object.keys(inputs).length} 个输入字段`);
  };

  const addBlankStep = (toolId: string) => {
    if (!recipe || recipe.steps.length >= MAX_STEPS) return;
    const step = newStep(toolId, findTool(toolId)?.meta.name ?? toolId);
    mutateRecipe((draft) => {
      draft.steps.push(step);
    });
  };

  const pinOutput = () => {
    const container = containerRef.current;
    if (!container) return;
    const value = pickPrimaryOutput(container);
    if (!value) {
      onNotify('当前工具没有可采集的只读输出区', 'error');
      return;
    }
    const result = putVar(vars, varName, value);
    if (result.error) {
      onNotify(result.error, 'error');
      return;
    }
    setVars(result.vars);
    onNotify(`已把主输出（${value.length} 字符）钉为 {{${varName.trim()}}}`);
  };

  const addManualVar = () => {
    const result = putVar(vars, manualName, manualValue);
    if (result.error) {
      onNotify(result.error, 'error');
      return;
    }
    setVars(result.vars);
    setManualName('');
    setManualValue('');
    onNotify('变量已写入变量池');
  };

  const doImport = () => {
    const parsed = parseRecipeImport(importText);
    if (parsed.error || parsed.recipes.length === 0) {
      onNotify(parsed.error ?? '没有解析到配方', 'error');
      return;
    }
    setRecipes((prev) => [...prev, ...parsed.recipes]);
    setSelectedId(parsed.recipes[0]?.id ?? '');
    setImportText('');
    setShowImport(false);
    onNotify(`已导入 ${parsed.recipes.length} 个配方`);
  };

  const doExport = (download: boolean) => {
    const text = serializeRecipes(recipes);
    if (download) {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'coder-tools-pipelines.json';
      anchor.click();
      URL.revokeObjectURL(url);
      onNotify('已导出配方文件');
    } else {
      copyText(text);
      onNotify('已复制全部配方 JSON');
    }
  };

  const execute = async () => {
    if (!recipe || running) return;
    const container = containerRef.current;
    if (!container) return;
    if (recipe.steps.length === 0) {
      onNotify('配方没有步骤，请先捕获当前工具', 'error');
      return;
    }
    setRunning(true);
    setLogs([]);
    const summary = await runRecipe({
      recipe,
      vars,
      container,
      goTo,
      isToolKnown: (id) => Boolean(findTool(id)),
      onLog: (entry) => setLogs((prev) => [...prev, entry]),
    });
    setVars(summary.vars);
    setRunning(false);
    onNotify(
      summary.ok
        ? `配方完成：${summary.executed} 步全部成功`
        : `配方结束：成功 ${summary.executed} 步，失败 ${summary.failed} 步`,
      summary.ok ? 'success' : 'error',
    );
  };

  if (!open) return null;

  const outputCount = containerRef.current ? captureOutputs(containerRef.current).length : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto p-4 sm:p-8">
      <button type="button" aria-label="关闭流水线" className="fixed inset-0 bg-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="工具编排流水线"
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-sm border border-border-strong bg-surface shadow-lg"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
          <Workflow className="size-3.5 text-muted-foreground" />
          <h2 className="flex-1 font-display text-[13px] font-semibold">工具编排流水线</h2>
          <span className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {recipe?.steps.length ?? 0} 步 · {Object.keys(vars).length} 变量
          </span>
          <Button size="icon" variant="ghost" className="size-7" onClick={onClose} aria-label="关闭流水线">
            <X className="size-3.5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            步骤直接读写工具页的输入框与只读输出区，不需要任何工具改动。先把当前工具「捕获为步骤」，
            再把上一步的输出「钉住」为变量，后续步骤的输入里写{' '}
            <code className="font-mono text-syntax-string">{'{{name}}'}</code> 或{' '}
            <code className="font-mono text-syntax-string">{'{{name.field}}'}</code> 即可引用；最后一键重放整条链路。
          </p>

          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-sm border border-border bg-surface-2/40 p-3">
            <div className="min-w-40 flex-1">
              <span className="instrument-label mb-1 block">当前配方</span>
              <Select
                ariaLabel="选择配方"
                value={recipe?.id ?? ''}
                onChange={setSelectedId}
                options={
                  recipes.length > 0
                    ? recipes.map((item) => ({ value: item.id, label: `${item.name}（${item.steps.length} 步）` }))
                    : [{ value: '', label: '暂无配方' }]
                }
              />
            </div>
            <div className="min-w-32 flex-1">
              <span className="instrument-label mb-1 block">配方名称</span>
              <Input
                aria-label="配方名称"
                value={recipe?.name ?? ''}
                disabled={!recipe}
                onChange={(event) => {
                  const name = event.target.value;
                  mutateRecipe((draft) => {
                    draft.name = name;
                  });
                }}
              />
            </div>
            <Button size="sm" variant="outline" onClick={addRecipe}>
              <Plus className="size-3.5" />
              新建
            </Button>
            <Button size="sm" variant="outline" onClick={deleteRecipe} disabled={!recipe}>
              <Trash2 className="size-3.5" />
              删除
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport((value) => !value)}>
              导入
            </Button>
            <Button size="sm" variant="outline" onClick={() => doExport(false)} disabled={recipes.length === 0}>
              复制 JSON
            </Button>
            <Button size="sm" variant="outline" onClick={() => doExport(true)} disabled={recipes.length === 0}>
              <Download className="size-3.5" />
              下载
            </Button>
          </div>

          {showImport && (
            <div className="mb-4 flex flex-col gap-2 rounded-sm border border-border bg-surface-2/40 p-3">
              <span className="instrument-label">粘贴配方 JSON（单个配方或导出的批量包）</span>
              <Textarea
                aria-label="配方导入内容"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder='{"format":"coder-tools-pipeline","version":1,...}'
                className="min-h-24 font-mono text-[11px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={doImport} disabled={!importText.trim()}>
                  导入并追加
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
                  取消
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="instrument-label">步骤序列</span>
                <Button size="sm" onClick={captureStep} disabled={!recipe || running}>
                  <Pin className="size-3.5" />
                  捕获当前工具
                </Button>
              </div>

              <div className="space-y-2">
                {recipe?.steps.map((step, index) => (
                  <div key={step.id} className="rounded-sm border border-border bg-surface-2/40 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-display text-xs font-medium">{step.label}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{step.toolId}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label="上移步骤"
                        disabled={index === 0 || running}
                        onClick={() => moveStep(step.id, -1)}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label="下移步骤"
                        disabled={index === recipe.steps.length - 1 || running}
                        onClick={() => moveStep(step.id, 1)}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label="删除步骤"
                        disabled={running}
                        onClick={() =>
                          mutateRecipe((draft) => {
                            draft.steps = draft.steps.filter((item) => item.id !== step.id);
                          })
                        }
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">输出变量</span>
                        <Input
                          aria-label="输出变量名"
                          value={step.outputKey}
                          placeholder="留空不采集"
                          disabled={running}
                          onChange={(event) => {
                            const value = event.target.value;
                            mutateStep(step.id, (draft) => {
                              draft.outputKey = value;
                            });
                          }}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">等待毫秒</span>
                        <Input
                          aria-label="等待毫秒"
                          type="number"
                          min={0}
                          max={10000}
                          value={step.delayMs}
                          disabled={running}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            mutateStep(step.id, (draft) => {
                              draft.delayMs = Number.isFinite(value) ? Math.min(10_000, Math.max(0, value)) : 0;
                            });
                          }}
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">失败策略</span>
                        <Select
                          ariaLabel="失败策略"
                          value={step.onFailure}
                          disabled={running}
                          onChange={(value) =>
                            mutateStep(step.id, (draft) => {
                              draft.onFailure = value as FailurePolicy;
                            })
                          }
                          options={POLICY_OPTIONS}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="mt-2 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(step.id)) next.delete(step.id);
                          else next.add(step.id);
                          return next;
                        })
                      }
                    >
                      {expanded.has(step.id) ? '收起' : '展开'}输入字段（{Object.keys(step.inputs).length}）
                    </button>
                    {expanded.has(step.id) && (
                      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                        {Object.entries(step.inputs).length === 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            没有捕获到输入框，执行时只会切换工具并采集输出。
                          </p>
                        )}
                        {Object.entries(step.inputs).map(([key, value]) => (
                          <label key={key} className="flex items-center gap-2">
                            <span
                              className="w-20 shrink-0 truncate font-mono text-[10px] text-muted-foreground"
                              title={key}
                            >
                              {key}
                            </span>
                            <Input
                              aria-label={`输入字段 ${key}`}
                              value={value}
                              disabled={running}
                              className="h-7 font-mono text-[11px]"
                              onChange={(event) => {
                                const next = event.target.value;
                                mutateStep(step.id, (draft) => {
                                  draft.inputs[key] = next;
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {recipe?.steps.length === 0 && (
                  <div className="rounded-sm border border-dashed border-border-strong px-3 py-6 text-center text-[11px] text-muted-foreground">
                    还没有步骤。切换到想用的工具、填好输入，然后点「捕获当前工具」。
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">添加空步骤</span>
                <Select
                  ariaLabel="选择要添加的工具"
                  value=""
                  disabled={!recipe || running}
                  onChange={addBlankStep}
                  options={[{ value: '', label: '选择一个工具…' }, ...TOOL_OPTIONS]}
                />
              </div>
            </section>

            <section className="min-w-0">
              <span className="instrument-label mb-2 block">变量池</span>
              <div className="rounded-sm border border-border bg-surface-2/40 p-3">
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[10px] text-muted-foreground">变量名</span>
                    <Input
                      aria-label="钉住输出的变量名"
                      value={varName}
                      onChange={(event) => setVarName(event.target.value)}
                    />
                  </label>
                  <Button size="sm" onClick={pinOutput} disabled={running}>
                    <Pin className="size-3.5" />
                    钉住主输出
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  当前工具检测到 {outputCount} 个只读输出区，取内容最长的一个。变量随配方一起保存在本地。
                </p>
              </div>

              <div className="mt-3 space-y-1.5">
                {Object.entries(vars).length === 0 && (
                  <p className="rounded-sm border border-dashed border-border-strong px-3 py-4 text-center text-[11px] text-muted-foreground">
                    变量池为空。
                  </p>
                )}
                {Object.entries(vars).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5">
                    <code className="shrink-0 font-mono text-[11px] text-syntax-string">{`{{${name}}}`}</code>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={value}>
                      {value.slice(0, 60)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {value.length}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label={`删除变量 ${name}`}
                      onClick={() =>
                        setVars((prev) => {
                          const next = { ...prev };
                          delete next[name];
                          return next;
                        })
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-sm border border-border bg-surface-2/40 p-3">
                <span className="instrument-label mb-2 block">手动添加变量</span>
                <div className="space-y-2">
                  <Input
                    aria-label="手动变量名"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="变量名"
                  />
                  <Input
                    aria-label="手动变量值"
                    value={manualValue}
                    onChange={(event) => setManualValue(event.target.value)}
                    placeholder="变量值，或 JSON"
                  />
                  <Button size="sm" variant="outline" onClick={addManualVar} disabled={!manualName.trim()}>
                    <Plus className="size-3.5" />
                    写入变量池
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <span className="instrument-label mb-2 block">执行日志</span>
                <div className="max-h-48 min-h-16 overflow-auto rounded-sm border border-border bg-surface p-2 scrollbar-thin">
                  {logs.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">尚未执行。</p>
                  ) : (
                    <ul className="space-y-1">
                      {logs.map((entry) => (
                        <li key={entry.id} className="flex gap-2 text-[10px] leading-relaxed">
                          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                            {entry.step === 0 ? '—' : String(entry.step).padStart(2, '0')}
                          </span>
                          <span className={cn('min-w-0 break-words', TONE_CLASS[entry.tone])}>{entry.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <span className="text-[10px] text-muted-foreground">
            {running ? '正在顺序执行，期间会切换工具页…' : '执行会依次切换工具并回填输入，当前未保存的输入请先确认。'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={running}>
              关闭
            </Button>
            <Button size="sm" variant="signal" onClick={() => void execute()} disabled={running || !recipe}>
              <Play className="size-3.5" />
              {running ? '执行中…' : '执行配方'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
