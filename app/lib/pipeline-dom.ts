/**
 * 编排层的 DOM 适配：输入回填与输出采集。
 *
 * 关键点：这一层不认识任何具体工具，也不要求工具暴露 API。
 * 输入沿用 input-snapshot 的字段 key；输出采集所有只读输出区，
 * 与页面上下文面板「填入当前工具」使用的是同一套机制。
 */

import { captureInputs, fillInputField, type InputFieldInfo, listInputFields } from './input-snapshot';

export interface OutputCandidate {
  key: string;
  label: string;
  value: string;
}

/** 列出当前工具里可以回填的输入字段。 */
export function stepInputFields(container: HTMLElement): InputFieldInfo[] {
  return listInputFields(container);
}

/** 把当前工具的输入保存为步骤模板。 */
export function captureStepInputs(container: HTMLElement): Record<string, string> {
  return captureInputs(container);
}

/**
 * 采集工具页的只读输出。
 * ResultBox 渲染 textarea[readonly]，CodeBlock 渲染 pre/code，
 * 二者都不需要工具改动即可被消费。
 */
export function captureOutputs(container: HTMLElement): OutputCandidate[] {
  const nodes = container.querySelectorAll<HTMLTextAreaElement | HTMLPreElement | HTMLElement>(
    'textarea[readonly], input[readonly], pre, code',
  );
  const candidates: OutputCandidate[] = [];
  nodes.forEach((el, index) => {
    const value =
      el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el.textContent ?? '');
    if (!value.trim()) return;
    const label =
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('data-output-label') ||
      `输出 ${candidates.length + 1}`;
    candidates.push({ key: `out:${index}`, label: label.slice(0, 48), value });
  });
  return candidates;
}

/** 主输出取最长的非空值：通常是结果区，而不是某个短徽标。 */
export function pickPrimaryOutput(container: HTMLElement): string {
  return captureOutputs(container).reduce((best, item) => (item.value.length > best.length ? item.value : best), '');
}

/** 回填一个步骤的输入，返回成功与总数，便于日志里说明「填了 3/4 个字段」。 */
export function fillStepInputs(
  container: HTMLElement,
  inputs: Record<string, string>,
): { filled: number; total: number } {
  let filled = 0;
  for (const [key, value] of Object.entries(inputs)) {
    if (fillInputField(container, key, value)) filled += 1;
  }
  return { filled, total: Object.keys(inputs).length };
}

/**
 * 等待目标工具挂载完成。
 * AppShell 在内容容器上写 data-tool-id，ToolPanel 根节点带 data-tool-panel；
 * Suspense 的 loading 占位两者都没有，因此可据此区分「切换中」与「已就绪」。
 */
export function waitForTool(container: HTMLElement, toolId: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      const ready = container.dataset.toolId === toolId && Boolean(container.querySelector('[data-tool-panel]'));
      if (ready) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(check, 60);
    };
    check();
  });
}
