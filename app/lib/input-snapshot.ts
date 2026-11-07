/**
 * 工具输入快照：切换工具 / 重开页面时自动恢复上次填写的文本。
 *
 * 设计取舍：
 * - 通过 DOM 层采集与回填，避免逐个改动工具组件；回填使用原生 setter + 事件派发，
 *   让 React 19 的受控组件能正常收到 onChange。
 * - 只处理「文本类」输入（text / number / url / textarea / select），不碰 checkbox、
 *   radio、password、file、readOnly 结果框，避免把开关状态写乱或覆盖工具默认示例。
 * - 安全优先：整个工具级排除 + 字段级关键词排除，密码、密钥、token、私钥等绝不落盘。
 * - 空值不写入也不回填，保证工具自带的示例内容不会被清掉。
 * - 所有 localStorage 操作都做异常保护与体积上限；写入失败通过 WriteResult 返回原因，
 *   由上层提示用户，而不是静默丢数据。
 */

import { safeSetItem, type WriteResult } from './quota';

export const SNAPSHOT_KEY_PREFIX = 'coder-tools:input:';

/** 处理凭据、密钥或粘贴源码的工具，整工具不参与自动保存。 */
export const SENSITIVE_TOOL_IDS = new Set([
  'password-manager',
  'password-strength',
  'api-debug',
  'db-client',
  'hmac',
  'jwt',
  'bcrypt',
  'aes',
  'rsa',
  'token',
  'wifi-qr',
  'packet-debug',
  'http-client',
  'security-scan',
  'clipboard',
]);

/** 已有自身持久化逻辑的工具，不需要再存一份 DOM 快照。 */
export const SELF_PERSISTED_TOOL_IDS = new Set(['notes', 'hosts-switch', 'project-mgmt', 'userscript']);

export function shouldSkipTool(toolId: string): boolean {
  return SENSITIVE_TOOL_IDS.has(toolId) || SELF_PERSISTED_TOOL_IDS.has(toolId);
}

export function skipReason(toolId: string): string | null {
  if (SENSITIVE_TOOL_IDS.has(toolId)) return '该工具涉及密码、密钥或凭据，出于安全不保存输入';
  if (SELF_PERSISTED_TOOL_IDS.has(toolId)) return '该工具已自带本地存储，无需重复保存';
  return null;
}

const SENSITIVE_NAME =
  /pass(word)?|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|cookie|bearer|otp|mnemonic|seed[_-]?phrase/i;

const SKIP_INPUT_TYPES = new Set([
  'password',
  'hidden',
  'file',
  'checkbox',
  'radio',
  'submit',
  'button',
  'image',
  'reset',
  'color',
  'range',
  'date',
  'datetime-local',
  'month',
  'week',
]);

/** 单字段与单工具快照的体积上限，localStorage 通常只有 5 MB。 */
const MAX_FIELD_CHARS = 20_000;
const MAX_SNAPSHOT_CHARS = 120_000;

type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface InputSnapshot {
  version: 1;
  savedAt: number;
  fields: Record<string, string>;
}

function eligible(el: Element): el is TextField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement) {
    if (SKIP_INPUT_TYPES.has(el.type) || el.readOnly || el.disabled) return false;
    const meta = [
      el.name,
      el.id,
      el.placeholder,
      el.autocomplete,
      el.getAttribute('aria-label') ?? '',
      el.getAttribute('title') ?? '',
    ].join(' ');
    return !SENSITIVE_NAME.test(meta);
  }
  return false;
}

/** 稳定的字段标识：标签名 + 在候选列表中的位置 + 可用的固有属性。 */
function fieldKey(el: TextField, index: number): string {
  const stable = el.id || el.name || el.getAttribute('placeholder')?.slice(0, 24) || '';
  return `${el.tagName.toLowerCase()}#${index}${stable ? `:${stable}` : ''}`;
}

function queryFields(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('input, textarea, select'));
}

/** 采集当前工具内可保存的文本输入。 */
export function captureInputs(container: HTMLElement): Record<string, string> {
  const fields: Record<string, string> = {};
  let total = 0;
  queryFields(container).forEach((el, index) => {
    if (!eligible(el)) return;
    const value = el.value;
    if (value === '' || value.length > MAX_FIELD_CHARS) return;
    if (total + value.length > MAX_SNAPSHOT_CHARS) return;
    fields[fieldKey(el, index)] = value;
    total += value.length;
  });
  return fields;
}

/** 把快照回填到当前工具，返回成功回填的字段数。 */
export function restoreInputs(container: HTMLElement, snapshot: InputSnapshot): number {
  let restored = 0;
  queryFields(container).forEach((el, index) => {
    if (!eligible(el)) return;
    const value = snapshot.fields[fieldKey(el, index)];
    if (value === undefined || value === '' || value === el.value) return;
    setNativeValue(el, value);
    restored += 1;
  });
  return restored;
}

function setNativeValue(el: TextField, value: string): void {
  // React 通过 value tracker 判断值是否变化，必须用原型上的原生 setter 绕过它，
  // 否则随后派发的 input 事件会被 React 判定为「没有变化」而丢弃 onChange。
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function readSnapshot(toolId: string): InputSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY_PREFIX + toolId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InputSnapshot>;
    if (parsed.version !== 1 || typeof parsed.fields !== 'object' || parsed.fields === null) return null;
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      fields: Object.fromEntries(
        Object.entries(parsed.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    };
  } catch {
    return null;
  }
}

export function writeSnapshot(toolId: string, fields: Record<string, string>): WriteResult {
  return safeSetItem(
    SNAPSHOT_KEY_PREFIX + toolId,
    JSON.stringify({ version: 1, savedAt: Date.now(), fields } satisfies InputSnapshot),
  );
}

export function clearSnapshot(toolId: string): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY_PREFIX + toolId);
  } catch {
    // ignore
  }
}

export function clearAllSnapshots(): number {
  let count = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(SNAPSHOT_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      localStorage.removeItem(key);
      count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

export function countSnapshots(): number {
  let count = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      if (localStorage.key(i)?.startsWith(SNAPSHOT_KEY_PREFIX)) count += 1;
    }
  } catch {
    return 0;
  }
  return count;
}

// ── 供「页面上下文 → 当前工具」使用的字段识别与回填 ──────────────

const NON_FILLABLE_TYPES = new Set([
  'hidden',
  'file',
  'checkbox',
  'radio',
  'submit',
  'button',
  'image',
  'reset',
  'color',
  'range',
  'date',
  'datetime-local',
  'month',
  'week',
]);

/** 主动填入时放宽限制：允许密码框与敏感字段，但仍跳过只读结果框和开关类控件。 */
function fillable(el: Element): el is TextField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement) return !el.readOnly && !el.disabled && !NON_FILLABLE_TYPES.has(el.type);
  return false;
}

export interface InputFieldInfo {
  key: string;
  label: string;
  preview: string;
}

/** 列出当前工具里可以接受外部文本的字段，供用户选择填入目标。 */
export function listInputFields(container: HTMLElement): InputFieldInfo[] {
  const fields: InputFieldInfo[] = [];
  queryFields(container).forEach((el, index) => {
    if (!fillable(el)) return;
    const label =
      el.getAttribute('placeholder') ||
      el.getAttribute('aria-label') ||
      el.name ||
      el.id ||
      `输入框 ${fields.length + 1}`;
    fields.push({ key: fieldKey(el, index), label: label.slice(0, 48), preview: el.value.slice(0, 40) });
  });
  return fields;
}

/** 把一段文本回填到指定字段，返回是否成功。 */
export function fillInputField(container: HTMLElement, key: string, value: string): boolean {
  const nodes = queryFields(container);
  for (let index = 0; index < nodes.length; index += 1) {
    const el = nodes[index];
    if (!el || !fillable(el) || fieldKey(el, index) !== key) continue;
    setNativeValue(el, value);
    return true;
  }
  return false;
}
