/**
 * 配方执行引擎：按顺序切换工具、回填输入、采集输出、写入变量池。
 *
 * 这是「编排层」的运行时。协议与纯逻辑在 pipeline.ts，DOM 适配在 pipeline-dom.ts，
 * 三者分离是为了让变量解析、导入校验等能在 Bun 里单测，不依赖浏览器。
 */

import { compileStep, type PipelineRecipe, type PipelineVars, putVar } from './pipeline';
import { fillStepInputs, pickPrimaryOutput, waitForTool } from './pipeline-dom';

export type RunLogTone = 'info' | 'success' | 'warn' | 'error';

export interface RunLogEntry {
  /** 稳定 key：日志只追加不重排，用单调递增序号避免 React 列表用数组下标当 key。 */
  id: string;
  step: number;
  label: string;
  tone: RunLogTone;
  message: string;
}

export interface RunSummary {
  ok: boolean;
  executed: number;
  failed: number;
  vars: PipelineVars;
  logs: RunLogEntry[];
}

export interface RunRecipeOptions {
  recipe: PipelineRecipe;
  vars: PipelineVars;
  container: HTMLElement;
  goTo: (toolId: string) => void;
  isToolKnown: (toolId: string) => boolean;
  onLog?: (entry: RunLogEntry) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

let logSequence = 0;

/**
 * 顺序执行配方。单步失败按 step.onFailure 决定中止或继续。
 * 从不抛异常：所有失败都进入日志与 RunSummary，由 UI 展示。
 */
export async function runRecipe(options: RunRecipeOptions): Promise<RunSummary> {
  const { recipe, container, goTo, isToolKnown, onLog } = options;
  const sleep = options.sleep ?? defaultSleep;
  let vars: PipelineVars = { ...options.vars };
  const logs: RunLogEntry[] = [];
  let executed = 0;
  let failed = 0;
  let aborted = false;

  const log = (step: number, label: string, tone: RunLogTone, message: string) => {
    logSequence += 1;
    const entry: RunLogEntry = { id: `log-${logSequence}`, step, label, tone, message };
    logs.push(entry);
    onLog?.(entry);
  };

  if (recipe.steps.length === 0) {
    log(0, recipe.name, 'warn', '配方没有步骤，请先捕获当前工具或手动添加');
    return { ok: false, executed, failed, vars, logs };
  }

  for (let index = 0; index < recipe.steps.length; index += 1) {
    const step = recipe.steps[index];
    if (!step) continue;
    const number = index + 1;
    const label = step.label || step.toolId;

    if (!isToolKnown(step.toolId)) {
      failed += 1;
      log(number, label, 'error', `工具 ${step.toolId} 不存在，可能来自其它版本`);
      if (step.onFailure === 'stop') {
        aborted = true;
        break;
      }
      continue;
    }

    const compiled = compileStep(step, vars);
    if (compiled.missing.length > 0) {
      failed += 1;
      log(number, label, 'error', `变量未解析：${compiled.missing.join('、')}`);
      if (step.onFailure === 'stop') {
        aborted = true;
        break;
      }
      continue;
    }

    goTo(step.toolId);
    const ready = await waitForTool(container, step.toolId);
    if (!ready) {
      failed += 1;
      log(number, label, 'error', '工具未在 8 秒内就绪，已跳过');
      if (step.onFailure === 'stop') {
        aborted = true;
        break;
      }
      continue;
    }

    const filled = fillStepInputs(container, compiled.inputs);
    if (filled.total > 0) {
      log(number, label, 'info', `已回填 ${filled.filled}/${filled.total} 个输入字段`);
    }
    await sleep(Math.max(0, step.delayMs));

    if (step.outputKey) {
      const output = pickPrimaryOutput(container);
      if (!output) {
        failed += 1;
        log(number, label, 'error', `未采集到输出，变量 ${step.outputKey} 未写入`);
        if (step.onFailure === 'stop') {
          aborted = true;
          break;
        }
        continue;
      }
      const result = putVar(vars, step.outputKey, output);
      if (result.error) {
        failed += 1;
        log(number, label, 'error', result.error);
        if (step.onFailure === 'stop') {
          aborted = true;
          break;
        }
        continue;
      }
      vars = result.vars;
      log(number, label, 'success', `输出已写入 {{${step.outputKey}}}（${output.length} 字符）`);
    } else {
      log(number, label, 'success', '已执行');
    }
    executed += 1;
  }

  if (aborted) log(0, recipe.name, 'warn', '因失败策略为「中止」，后续步骤未执行');
  const ok = failed === 0 && !aborted;
  log(0, recipe.name, ok ? 'success' : 'warn', `完成 ${executed} 步，失败 ${failed} 步`);
  return { ok, executed, failed, vars, logs };
}
