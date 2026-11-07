import type { RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
  captureInputs,
  clearAllSnapshots,
  clearSnapshot,
  readSnapshot,
  restoreInputs,
  shouldSkipTool,
  writeSnapshot,
} from '../lib/input-snapshot';

const SAVE_DELAY = 350;
const MAX_RESTORE_ATTEMPTS = 8;

interface Options {
  toolId: string;
  /** 包裹工具组件的稳定容器；工具切换时容器本身不会卸载。 */
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** 本地存储写入失败时提示用户；内部做了节流，避免防抖保存反复弹提示。 */
  onError?: (message: string) => void;
}

const ERROR_THROTTLE_MS = 60_000;

/**
 * 自动保存 / 恢复当前工具的文本输入。
 *
 * 恢复需要等待 lazy 组件挂载完成，因此同时使用延时重试与 MutationObserver；
 * 保存走防抖，并在页面隐藏、切换工具前由 `flush()` 主动落盘。
 */
export function useInputSnapshot({ toolId, containerRef, enabled, onError }: Options) {
  const latest = useRef({ toolId, containerRef, enabled, onError });
  latest.current = { toolId, containerRef, enabled, onError };
  const lastErrorAt = useRef(0);

  const flush = useCallback(() => {
    const current = latest.current;
    if (!current.enabled || shouldSkipTool(current.toolId)) return;
    const container = current.containerRef.current;
    if (!container) return;
    const fields = captureInputs(container);
    if (Object.keys(fields).length === 0) {
      clearSnapshot(current.toolId);
      return;
    }
    const result = writeSnapshot(current.toolId, fields);
    if (!result.ok && result.error && Date.now() - lastErrorAt.current > ERROR_THROTTLE_MS) {
      lastErrorAt.current = Date.now();
      current.onError?.(result.error);
    }
  }, []);

  useEffect(() => {
    if (!enabled || shouldSkipTool(toolId)) return;
    const container = containerRef.current;
    if (!container) return;

    const initial = readSnapshot(toolId);
    if (!initial || Object.keys(initial.fields).length === 0) {
      // 没有快照时仍然需要挂上保存监听
      let timer: number | undefined;
      const save = () => flush();
      const onInput = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(save, SAVE_DELAY);
      };
      container.addEventListener('input', onInput, true);
      container.addEventListener('change', onInput, true);
      return () => {
        window.clearTimeout(timer);
        container.removeEventListener('input', onInput, true);
        container.removeEventListener('change', onInput, true);
      };
    }

    let disposed = false;
    let restored = false;
    let attempts = 0;
    let timer: number | undefined;
    let restoreTimer: number | undefined;
    let observer: MutationObserver | undefined;

    const tryRestore = () => {
      if (disposed || restored) return;
      const count = restoreInputs(container, initial);
      if (count > 0) {
        restored = true;
        observer?.disconnect();
        return;
      }
      attempts += 1;
      if (attempts < MAX_RESTORE_ATTEMPTS) restoreTimer = window.setTimeout(tryRestore, 60 * attempts);
    };

    // 首次尝试在下一帧；lazy chunk 加载慢时由 DOM 变化继续触发。
    restoreTimer = window.setTimeout(tryRestore, 0);
    observer = new MutationObserver(() => {
      if (!restored) tryRestore();
    });
    observer.observe(container, { childList: true, subtree: true });

    const onInput = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => flush(), SAVE_DELAY);
    };
    container.addEventListener('input', onInput, true);
    container.addEventListener('change', onInput, true);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(restoreTimer);
      observer?.disconnect();
      container.removeEventListener('input', onInput, true);
      container.removeEventListener('change', onInput, true);
    };
  }, [toolId, enabled, containerRef, flush]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [enabled, flush]);

  const clearCurrent = useCallback(() => clearSnapshot(latest.current.toolId), []);
  const clearAll = useCallback(() => clearAllSnapshots(), []);

  return { flush, clearCurrent, clearAll };
}
