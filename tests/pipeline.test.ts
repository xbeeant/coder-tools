/**
 * 编排层纯逻辑回归：变量引用、步骤编译、配方导入校验与本地持久化。
 * 不依赖浏览器 DOM；执行引擎与 DOM 适配由 UI 集成验证。
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  compileStep,
  DEFAULT_STEP_DELAY_MS,
  isValidVarName,
  loadRecipes,
  loadVars,
  MAX_VAR_VALUE_CHARS,
  newRecipe,
  newStep,
  PIPELINE_FORMAT,
  parseRecipeImport,
  putVar,
  RECIPES_KEY,
  resolveTemplate,
  saveRecipes,
  saveVars,
  serializeRecipes,
  VARS_KEY,
} from '../app/lib/pipeline';
import { installStorage, type MemoryStorage } from './helpers/memory-storage';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installStorage();
});

describe('变量引用解析', () => {
  test('{{name}} 原样替换，未定义变量保留原文并记入 missing', () => {
    const result = resolveTemplate('Bearer {{token}} / {{missing}}', { token: 'abc' });
    expect(result.value).toBe('Bearer abc / {{missing}}');
    expect(result.missing).toEqual(['{{missing}}']);
  });

  test('{{name.a.b}} 从 JSON 变量里按路径取值', () => {
    const result = resolveTemplate('{{user.name}}:{{user.roles.0}}', {
      user: JSON.stringify({ name: 'Amy', roles: ['admin'] }),
    });
    expect(result.value).toBe('Amy:admin');
    expect(result.missing).toEqual([]);
  });

  test('路径不存在或值不是 JSON 时不静默替换成空串', () => {
    expect(resolveTemplate('{{user.age}}', { user: '{"name":"Amy"}' }).missing).toEqual(['{{user.age}}']);
    expect(resolveTemplate('{{raw.a}}', { raw: 'not json' }).missing).toEqual(['{{raw.a}}']);
  });

  test('对象值序列化成 JSON，多个相同缺失引用只报一次', () => {
    const result = resolveTemplate('{{a}} {{a}}', { a: '{"x":1}' });
    expect(result.value).toBe('{"x":1} {"x":1}');
    const gap = resolveTemplate('{{z}} + {{z}}', {});
    expect(gap.missing).toEqual(['{{z}}']);
  });

  test('变量名合法性与 putVar 不修改入参', () => {
    expect(isValidVarName('token_2')).toBe(true);
    expect(isValidVarName('2token')).toBe(false);
    expect(isValidVarName('a.b')).toBe(false);
    const before = { a: '1' };
    const result = putVar(before, 'b', '2');
    expect(result.error).toBeNull();
    expect(result.vars).toEqual({ a: '1', b: '2' });
    expect(before).toEqual({ a: '1' });
    expect(putVar(before, 'bad name', 'x').error).toContain('变量名');
    expect(putVar(before, 'a', 'x'.repeat(MAX_VAR_VALUE_CHARS + 1)).error).toContain('上限');
  });
});

describe('步骤编译', () => {
  test('编译全部输入并汇总缺失变量', () => {
    const step = newStep('http-client', '发请求', { f0: '{{base}}/users', f1: '{{token}}', f2: 'fixed' });
    const compiled = compileStep(step, { base: 'https://api.test' });
    expect(compiled.inputs).toEqual({ f0: 'https://api.test/users', f1: '{{token}}', f2: 'fixed' });
    expect(compiled.missing).toEqual(['{{token}}']);
  });

  test('新步骤默认值可预测', () => {
    const step = newStep('jwt', '解析');
    expect(step.onFailure).toBe('stop');
    expect(step.delayMs).toBe(DEFAULT_STEP_DELAY_MS);
    expect(step.outputKey).toBe('');
    expect(step.toolId).toBe('jwt');
  });
});

describe('配方导入导出', () => {
  test('序列化后能往返，步骤字段完整保留', () => {
    const recipe = newRecipe('联调');
    const step = newStep('http-client', '请求', { f0: '{{base}}' });
    step.outputKey = 'body';
    step.onFailure = 'continue';
    step.delayMs = 800;
    recipe.steps.push(step);
    const parsed = parseRecipeImport(serializeRecipes([recipe]));
    expect(parsed.error).toBeNull();
    expect(parsed.recipes).toHaveLength(1);
    const imported = parsed.recipes[0];
    expect(imported?.name).toBe('联调');
    expect(imported?.format).toBe(PIPELINE_FORMAT);
    expect(imported?.steps[0]?.toolId).toBe('http-client');
    expect(imported?.steps[0]?.inputs.f0).toBe('{{base}}');
    expect(imported?.steps[0]?.outputKey).toBe('body');
    expect(imported?.steps[0]?.onFailure).toBe('continue');
    expect(imported?.steps[0]?.delayMs).toBe(800);
  });

  test('支持直接导入单个配方对象', () => {
    const recipe = newRecipe('单个');
    recipe.steps.push(newStep('jwt', '解析'));
    const parsed = parseRecipeImport(JSON.stringify(recipe));
    expect(parsed.error).toBeNull();
    expect(parsed.recipes[0]?.name).toBe('单个');
  });

  test('拒绝非法 JSON、错误格式 / 版本、缺步骤、非字符串输入值', () => {
    expect(parseRecipeImport('not json').error).toContain('JSON');
    expect(parseRecipeImport('{"format":"other","version":1,"steps":[]}').error).toContain('格式');
    expect(parseRecipeImport('{"format":"coder-tools-pipeline","version":2,"steps":[]}').error).toContain('格式');
    expect(parseRecipeImport('{"format":"coder-tools-pipeline","version":1}').error).toContain('步骤');
    expect(parseRecipeImport('x'.repeat(400_001)).error).toContain('上限');
  });

  test('导入时重新分配步骤 id，并夹取异常 delayMs', () => {
    const raw = {
      ...newRecipe('边界'),
      steps: [{ id: 'duplicated', toolId: 'jwt', label: 'x', inputs: { f0: 123 }, delayMs: 999999 }],
    };
    const parsed = parseRecipeImport(JSON.stringify(raw));
    expect(parsed.recipes[0]?.steps[0]?.id).not.toBe('duplicated');
    expect(parsed.recipes[0]?.steps[0]?.inputs).toEqual({});
    expect(parsed.recipes[0]?.steps[0]?.delayMs).toBe(10_000);
  });

  test('超过 24 步的配方被拒绝', () => {
    const recipe = newRecipe('超长');
    for (let i = 0; i < 25; i += 1) recipe.steps.push(newStep('jwt', `步 ${i}`));
    expect(parseRecipeImport(JSON.stringify(recipe)).error).toContain('24');
  });
});

describe('本地持久化', () => {
  test('配方与变量池写入后可重新读出', () => {
    const recipe = newRecipe('持久化');
    recipe.steps.push(newStep('jwt', '解析'));
    expect(saveRecipes([recipe]).ok).toBe(true);
    expect(saveVars({ token: 'abc' }).ok).toBe(true);
    expect(storage.getItem(RECIPES_KEY)).toBeTruthy();
    expect(storage.getItem(VARS_KEY)).toBeTruthy();
    expect(loadRecipes()[0]?.name).toBe('持久化');
    expect(loadRecipes()[0]?.steps).toHaveLength(1);
    expect(loadVars()).toEqual({ token: 'abc' });
  });

  test('损坏数据、非法变量名与超长值安全降级', () => {
    storage.setItem(RECIPES_KEY, '{broken');
    storage.setItem(VARS_KEY, JSON.stringify({ 'bad name': 'x', ok: 'y', huge: 42 }));
    expect(loadRecipes()).toEqual([]);
    expect(loadVars()).toEqual({ ok: 'y' });
    storage.setItem(VARS_KEY, JSON.stringify({ ok: 'x'.repeat(MAX_VAR_VALUE_CHARS + 1) }));
    expect(loadVars()).toEqual({});
  });

  test('空存储返回空集合而不是抛错', () => {
    expect(loadRecipes()).toEqual([]);
    expect(loadVars()).toEqual({});
  });
});
