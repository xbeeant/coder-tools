/**
 * 工具编排流水线：步骤协议、变量引用与配方持久化。
 *
 * 设计前提：85 个工具页都是普通 React 组件，输入与输出最终都是 DOM 元素。
 * 因此协议不要求任何工具改代码 —— 输入复用 input-snapshot 的字段识别，
 * 输出由 pipeline-dom.ts 采集只读输出区。工具只需保持「输入可填、输出可读」。
 *
 * 变量引用语法：
 *   {{name}}              取变量池里的原始字符串
 *   {{name.a.b}}          若 name 是 JSON，则按路径取值；对象会序列化成 JSON 字符串
 * 未解析的引用保留原文并记入 missing，避免静默把用户数据替换成空串。
 */

import { safeSetItem, type WriteResult } from './quota';

export const PIPELINE_FORMAT = 'coder-tools-pipeline';
export const RECIPES_KEY = 'coder-tools:pipeline:recipes';
export const VARS_KEY = 'coder-tools:pipeline:vars';
export const MAX_STEPS = 24;
export const MAX_VAR_VALUE_CHARS = 200_000;
export const MAX_RECIPE_CHARS = 400_000;
export const DEFAULT_STEP_DELAY_MS = 350;

export type FailurePolicy = 'stop' | 'continue';

export interface PipelineStep {
  id: string;
  toolId: string;
  label: string;
  /** 输入字段 key -> 值（可含 {{变量}} 引用）。key 来自 listInputFields。 */
  inputs: Record<string, string>;
  /** 本步主输出写入变量池的名字；留空表示不采集。 */
  outputKey: string;
  onFailure: FailurePolicy;
  /** 填完输入后等待工具计算的时间，防抖型工具可适当调大。 */
  delayMs: number;
}

export interface PipelineRecipe {
  format: typeof PIPELINE_FORMAT;
  version: 1;
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: string;
  updatedAt: string;
}

export type PipelineVars = Record<string, string>;

export interface CompiledStep {
  inputs: Record<string, string>;
  missing: string[];
}

export interface RecipeImportResult {
  recipes: PipelineRecipe[];
  error: string | null;
}

const REF = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_-]+)*)\s*\}\}/g;
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function newStep(toolId: string, label: string, inputs: Record<string, string> = {}): PipelineStep {
  return {
    id: uid('s'),
    toolId,
    label,
    inputs,
    outputKey: '',
    onFailure: 'stop',
    delayMs: DEFAULT_STEP_DELAY_MS,
  };
}

export function newRecipe(name = '未命名配方'): PipelineRecipe {
  const now = nowIso();
  return { format: PIPELINE_FORMAT, version: 1, id: uid('r'), name, steps: [], createdAt: now, updatedAt: now };
}

/** 把一段模板里的 {{变量}} 替换成变量池的值，返回未解析的引用列表。 */
export function resolveTemplate(template: string, vars: PipelineVars): { value: string; missing: string[] } {
  const missing: string[] = [];
  const addMissing = (token: string) => {
    if (!missing.includes(token)) missing.push(token);
  };
  const value = template.replace(REF, (whole, ref: string) => {
    const [root, ...path] = ref.split('.');
    if (!root || !(root in vars)) {
      addMissing(whole);
      return whole;
    }
    const raw = vars[root] ?? '';
    let current: unknown = raw;
    if (path.length > 0) {
      try {
        current = JSON.parse(raw);
      } catch {
        addMissing(whole);
        return whole;
      }
      for (const key of path) {
        if (current === null || typeof current !== 'object' || !(key in (current as object))) {
          addMissing(whole);
          return whole;
        }
        current = (current as Record<string, unknown>)[key];
      }
    }
    if (current === undefined || current === null) {
      addMissing(whole);
      return whole;
    }
    return typeof current === 'object' ? JSON.stringify(current) : String(current);
  });
  return { value, missing };
}

/** 编译一个步骤的所有输入，汇总缺失变量。 */
export function compileStep(step: PipelineStep, vars: PipelineVars): CompiledStep {
  const inputs: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, raw] of Object.entries(step.inputs)) {
    const resolved = resolveTemplate(raw, vars);
    inputs[key] = resolved.value;
    for (const token of resolved.missing) {
      if (!missing.includes(token)) missing.push(token);
    }
  }
  return { inputs, missing };
}

export function isValidVarName(name: string): boolean {
  return VAR_NAME.test(name);
}

/** 写入变量前的校验：名字合法且值不过大。返回新的变量池，不修改入参。 */
export function putVar(vars: PipelineVars, name: string, value: string): { vars: PipelineVars; error: string | null } {
  const key = name.trim();
  if (!isValidVarName(key)) return { vars, error: '变量名只能包含字母、数字与下划线，且需以字母或下划线开头' };
  if (value.length > MAX_VAR_VALUE_CHARS) {
    return { vars, error: `变量值超过 ${MAX_VAR_VALUE_CHARS} 字符上限，请裁剪后再钉住` };
  }
  return { vars: { ...vars, [key]: value }, error: null };
}

export function serializeRecipes(recipes: PipelineRecipe[]): string {
  return JSON.stringify({ format: PIPELINE_FORMAT, version: 1, exportedAt: nowIso(), recipes }, null, 2);
}

/** 导入配方：接受单个配方对象或 serializeRecipes 产出的批量包；严格校验后重新分配 id。 */
export function parseRecipeImport(text: string): RecipeImportResult {
  if (text.length > MAX_RECIPE_CHARS) {
    return { recipes: [], error: `文件超过 ${MAX_RECIPE_CHARS} 字符上限` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { recipes: [], error: '不是合法的 JSON' };
  }
  const rawList = isRecord(parsed) && Array.isArray(parsed.recipes) ? parsed.recipes : [parsed];
  const recipes: PipelineRecipe[] = [];
  for (const raw of rawList) {
    if (!isRecord(raw) || raw.format !== PIPELINE_FORMAT || raw.version !== 1) {
      return { recipes: [], error: '配方格式或版本不匹配（需要 coder-tools-pipeline v1）' };
    }
    if (typeof raw.name !== 'string' || !Array.isArray(raw.steps)) {
      return { recipes: [], error: '配方缺少名称或步骤列表' };
    }
    if (raw.steps.length > MAX_STEPS) {
      return { recipes: [], error: `单个配方最多 ${MAX_STEPS} 步` };
    }
    const steps: PipelineStep[] = [];
    for (const item of raw.steps) {
      if (!isRecord(item) || typeof item.toolId !== 'string' || !item.toolId) {
        return { recipes: [], error: '步骤缺少有效的工具 id' };
      }
      const inputs: Record<string, string> = {};
      if (isRecord(item.inputs)) {
        for (const [key, value] of Object.entries(item.inputs)) {
          if (typeof value === 'string') inputs[key] = value;
        }
      }
      const step = newStep(item.toolId, typeof item.label === 'string' ? item.label : item.toolId, inputs);
      if (typeof item.outputKey === 'string' && isValidVarName(item.outputKey)) step.outputKey = item.outputKey;
      if (item.onFailure === 'continue') step.onFailure = 'continue';
      if (typeof item.delayMs === 'number' && Number.isFinite(item.delayMs)) {
        step.delayMs = Math.min(10_000, Math.max(0, Math.trunc(item.delayMs)));
      }
      steps.push(step);
    }
    recipes.push({
      ...newRecipe(raw.name.slice(0, 80)),
      steps,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
    });
  }
  return { recipes, error: null };
}

function readRaw(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 读取配方列表。逐字段规范化，任何损坏数据都安全降级，不让整个应用打不开。 */
export function loadRecipes(): PipelineRecipe[] {
  const raw = readRaw(RECIPES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: PipelineRecipe[] = [];
    for (const item of parsed) {
      if (!isRecord(item) || item.format !== PIPELINE_FORMAT || item.version !== 1) continue;
      if (typeof item.name !== 'string' || !Array.isArray(item.steps) || item.steps.length > MAX_STEPS) continue;
      const steps: PipelineStep[] = [];
      for (const rawStep of item.steps) {
        if (!isRecord(rawStep) || typeof rawStep.toolId !== 'string' || !rawStep.toolId) continue;
        const inputs: Record<string, string> = {};
        if (isRecord(rawStep.inputs)) {
          for (const [key, value] of Object.entries(rawStep.inputs)) {
            if (typeof value === 'string') inputs[key] = value;
          }
        }
        steps.push({
          id: typeof rawStep.id === 'string' ? rawStep.id : uid('s'),
          toolId: rawStep.toolId,
          label: typeof rawStep.label === 'string' ? rawStep.label : rawStep.toolId,
          inputs,
          outputKey:
            typeof rawStep.outputKey === 'string' && isValidVarName(rawStep.outputKey) ? rawStep.outputKey : '',
          onFailure: rawStep.onFailure === 'continue' ? 'continue' : 'stop',
          delayMs:
            typeof rawStep.delayMs === 'number' && Number.isFinite(rawStep.delayMs)
              ? Math.min(10_000, Math.max(0, Math.trunc(rawStep.delayMs)))
              : DEFAULT_STEP_DELAY_MS,
        });
      }
      result.push({
        format: PIPELINE_FORMAT,
        version: 1,
        id: typeof item.id === 'string' ? item.id : uid('r'),
        name: item.name.slice(0, 80),
        steps,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
      });
    }
    return result;
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: PipelineRecipe[]): WriteResult {
  return safeSetItem(RECIPES_KEY, JSON.stringify(recipes));
}

export function loadVars(): PipelineVars {
  const raw = readRaw(VARS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const result: PipelineVars = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isValidVarName(key) && typeof value === 'string' && value.length <= MAX_VAR_VALUE_CHARS) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveVars(vars: PipelineVars): WriteResult {
  return safeSetItem(VARS_KEY, JSON.stringify(vars));
}
