/**
 * 页面上下文：应用侧与扩展 background 之间的消息层。
 *
 * 这里刻意不 import 任何 wxt / browser / chrome 模块，只用 globalThis 上的运行时对象，
 * 因此 Web 构建可以原样打包这段代码；Web 环境下所有能力返回「不可用」而不报错。
 *
 * 隐私约定：上下文只保存在组件内存里，不写入 localStorage、不加入工作区备份；
 * 敏感字段在界面上默认打码，复制原始值需要用户主动点击。
 */

import { IS_EXTENSION } from './runtime';

const PENDING_MESSAGE = 'coder-tools:pending';
const CAPTURE_MESSAGE = 'coder-tools:capture';
const PUSH_MESSAGE = 'coder-tools:push';

export interface SelectionPayload {
  text: string;
  toolId: string;
  at: number;
}

export interface PageContext {
  capturedAt: string;
  url: string;
  title: string;
  origin: string;
  referrer: string;
  userAgent: string;
  selection: string;
  meta: { name: string; content: string }[];
  cookies: { name: string; value: string }[];
  storage: { area: string; key: string; value: string }[];
  resources: { name: string; type: string; duration: number }[];
  jsonLd: string[];
  textSample: string;
}

export type CaptureResult = { ok: true; data: PageContext } | { ok: false; error: string };

export interface ContextItem {
  id: string;
  group: string;
  label: string;
  value: string;
  /** 名称命中敏感词：界面默认打码 */
  sensitive: boolean;
}

interface MessageRuntime {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage?: {
    addListener(callback: (message: unknown) => void): void;
    removeListener(callback: (message: unknown) => void): void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extensionRuntime(): MessageRuntime | null {
  const globals = globalThis as {
    chrome?: { runtime?: MessageRuntime };
    browser?: { runtime?: MessageRuntime };
  };
  return globals.chrome?.runtime ?? globals.browser?.runtime ?? null;
}

/** 当前是否真的可以使用扩展专属能力（Web 版恒为 false）。 */
export function canUseExtensionFeatures(): boolean {
  return IS_EXTENSION && extensionRuntime() !== null;
}

export const EXTENSION_UNAVAILABLE_HINT =
  '此能力需要浏览器扩展版，且需先在目标网页上右键使用 Coder Tools 菜单或点击扩展图标。';

/** 通用后台消息通道；Web 环境直接抛出可展示的错误。 */
export async function sendToBackground(message: Record<string, unknown>): Promise<unknown> {
  const runtime = extensionRuntime();
  if (!IS_EXTENSION || !runtime) throw new Error(EXTENSION_UNAVAILABLE_HINT);
  return runtime.sendMessage(message);
}

/** 工具页启动时取走右键菜单暂存的选中文本（只取一次）。 */
export async function takePendingSelection(): Promise<SelectionPayload | null> {
  const runtime = extensionRuntime();
  if (!IS_EXTENSION || !runtime) return null;
  try {
    const response = await runtime.sendMessage({ type: PENDING_MESSAGE });
    if (!isRecord(response) || response.ok !== true || !isRecord(response.payload)) return null;
    const payload = response.payload;
    if (typeof payload.text !== 'string' || typeof payload.toolId !== 'string') return null;
    const at = typeof payload.at === 'number' ? payload.at : 0;
    // 已直接推送给旧页面的选中文本可能仍留在后台，过期的不再重新应用。
    if (at > 0 && Date.now() - at > 60_000) return null;
    return { text: payload.text, toolId: payload.toolId, at };
  } catch {
    return null;
  }
}

/** 请求 background 采集最近交互过的网页上下文。 */
export async function capturePageContext(): Promise<CaptureResult> {
  const runtime = extensionRuntime();
  if (!IS_EXTENSION || !runtime) return { ok: false, error: EXTENSION_UNAVAILABLE_HINT };
  try {
    const response = await runtime.sendMessage({ type: CAPTURE_MESSAGE });
    if (isRecord(response) && response.ok === true && isRecord(response.data)) {
      return { ok: true, data: response.data as unknown as PageContext };
    }
    if (isRecord(response) && typeof response.error === 'string') return { ok: false, error: response.error };
  } catch (error) {
    return { ok: false, error: `后台脚本无响应：${String(error)}` };
  }
  return { ok: false, error: '后台脚本返回了无法识别的结果，请重新加载扩展后重试。' };
}

/** 工具页已打开时，background 会直接推送新的选中文本，无需重载页面。 */
export function onContextPush(handler: (payload: SelectionPayload) => void): () => void {
  const runtime = extensionRuntime();
  if (!IS_EXTENSION || !runtime?.onMessage) return () => {};

  const listener = (message: unknown) => {
    if (!isRecord(message) || message.type !== PUSH_MESSAGE || !isRecord(message.payload)) return;
    const payload = message.payload;
    if (typeof payload.text !== 'string' || typeof payload.toolId !== 'string') return;
    handler({
      text: payload.text,
      toolId: payload.toolId,
      at: typeof payload.at === 'number' ? payload.at : Date.now(),
    });
  };
  runtime.onMessage.addListener(listener);
  return () => runtime.onMessage?.removeListener(listener);
}

const SENSITIVE_NAME = /pass|secret|token|auth|cookie|session|jwt|bearer|api[_-]?key|private|credential|csrf/i;

export function isSensitiveLabel(label: string): boolean {
  return SENSITIVE_NAME.test(label);
}

export function displayValue(item: ContextItem): string {
  if (item.sensitive) return '••••••（已打码）';
  if (item.value.length > 110) return `${item.value.slice(0, 60)}…${item.value.slice(-24)}`;
  return item.value;
}

/** 把采集结果摊平成可逐条复制 / 填入的条目。 */
export function flattenContext(data: PageContext): ContextItem[] {
  const items: ContextItem[] = [];
  const add = (group: string, label: string, value: string, sensitive = false) => {
    if (!value) return;
    items.push({ id: `${group}:${label}:${items.length}`, group, label, value, sensitive });
  };
  const sensitive = (label: string) => isSensitiveLabel(label);

  add('页面', '完整 URL', data.url);
  add('页面', '标题', data.title);
  add('页面', 'Origin', data.origin);
  add('页面', 'Referrer', data.referrer);
  add('页面', 'User-Agent', data.userAgent);
  add('选中文本', '当前选中文本', data.selection);

  for (const meta of data.meta ?? []) add('Meta', meta.name, meta.content, sensitive(meta.name));
  for (const cookie of data.cookies ?? []) add('Cookie', cookie.name, cookie.value, true);
  for (const entry of data.storage ?? [])
    add('本地存储', `${entry.area}: ${entry.key}`, entry.value, sensitive(entry.key));

  for (const resource of data.resources ?? []) {
    add('资源请求', `${resource.type} · ${resource.name}`, resource.name, sensitive(resource.name));
  }
  for (const [index, json] of (data.jsonLd ?? []).entries()) add('结构化数据', `JSON-LD #${index + 1}`, json);
  add('页面文本', '正文片段', data.textSample);

  return items;
}

/** 只有选中文本时也能构造一份最小上下文（右键菜单场景）。 */
export function selectionAsItems(selection: SelectionPayload): ContextItem[] {
  if (!selection.text) return [];
  return [
    {
      id: 'selection:initial',
      group: '选中文本',
      label: '右键送达的文本',
      value: selection.text,
      sensitive: false,
    },
  ];
}
