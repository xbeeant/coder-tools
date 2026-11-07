/**
 * 运行环境探测。
 *
 * 同一份 `app/` 源码会分别被 WXT（浏览器扩展）和 Vite（静态 Web）打包，
 * 这里用一个不依赖任何扩展类型声明的方式判断运行时，供设置页展示、
 * 以及个别能力在 Web 端做降级提示。
 */

interface ChromeLike {
  runtime?: { id?: string };
}

function detect(): 'extension' | 'web' {
  try {
    const candidate = (globalThis as { chrome?: ChromeLike }).chrome;
    if (candidate?.runtime?.id) return 'extension';
  } catch {
    // 某些环境下访问 chrome 会抛错，按 Web 处理即可
  }
  return 'web';
}

export const RUNTIME = detect();

export const IS_EXTENSION = RUNTIME === 'extension';

export const IS_WEB = RUNTIME === 'web';

export const RUNTIME_LABEL = IS_EXTENSION ? '浏览器扩展' : 'Web 版';

/** Web 版走 location.hash；扩展版同样支持，保持一致。 */
export function shareableUrl(toolId: string): string {
  return `${window.location.origin}${window.location.pathname}#/tool/${toolId}`;
}
