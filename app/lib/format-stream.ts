/**
 * 大文本后台处理客户端（JSON / 代码 / 标记语言 / 行处理 / 统计 / 编解码）。
 *
 * 部署路径约定（重要）
 * ------------------
 * Worker 脚本是 `public/format-worker.js`，Vite 与 WXT 都会把 public/ 原样
 * 复制到各自产物的根目录。运行时**不**使用 `import.meta.url`，也不使用打包器
 * 生成的 worker chunk 路径，而是：
 *   - 扩展端：`runtime.getURL('format-worker.js')` → `chrome-extension://<id>/format-worker.js`
 *   - Web 端：`new URL('format-worker.js', document.baseURI)` → 相对入口 HTML 解析
 *
 * 因此以下部署都指向同一份随包资源：
 *   `https://host/index.html`                    → `https://host/format-worker.js`
 *   `https://host/mirror/coder-tools/index.html` → `.../mirror/coder-tools/format-worker.js`
 *   `https://host/mirror/coder-tools/#/tool/x`   → `.../mirror/coder-tools/format-worker.js`
 *
 * `base: './'`、hash 路由、子目录部署都不影响这个推导，产物里也不会出现
 * `/assets/format-worker-xxx.js` 这类绝对路径引用。
 *
 * 另一个约束：Chrome 扩展 MV3 的 `worker-src` 只允许 `self` / `none` /
 * `wasm-unsafe-eval`，不允许 `blob:`，且禁止 `eval` / `new Function`。
 * 所以这里用 classic worker 的同源静态脚本：无需放宽 CSP，也不产生内联代码。
 */

export const FORMAT_WORKER_ASSET = 'format-worker.js';
export const FORMAT_WORKER_TIMEOUT_MS = 30_000;

/**
 * 后台内核的任务种类。消息里不带 task 时内核按 json 处理，
 * 因此旧客户端与旧测试载荷仍然兼容。
 */
export type FormatTaskKind = 'json' | 'code' | 'markup' | 'lines' | 'stats' | 'codec';

export interface FormatTaskOptions {
  /** 缩进空格数；-1 表示制表符。json / code / markup 使用。 */
  indent?: number;
  /** 压缩：去掉字符串、注释与标签之外的空白。 */
  minify?: boolean;
  /** codec 子模式：base64-encode / base64-decode / html-encode / html-decode / url-encode / url-decode。 */
  mode?: string;
  /** code 方言：'sql' 时额外识别 -- 行注释。 */
  dialect?: string;
  /** lines：去掉行尾空白或整行首尾空白。 */
  trim?: boolean;
  trimAll?: boolean;
  removeEmpty?: boolean;
  dedupe?: boolean;
  sort?: boolean;
  reverse?: boolean;
  normalizeEol?: boolean;
}

export interface StreamFormatResult {
  output: string;
  /** true 表示后台通道不可用，此时 output 为空且应展示 error。 */
  degraded: boolean;
  elapsedMs: number;
  error: string | null;
  /** true 表示被更新的任务取代，调用方应忽略该结果。 */
  cancelled?: boolean;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  output?: string;
  error?: string;
  elapsedMs?: number;
}

interface PendingTask {
  resolve: (result: StreamFormatResult) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

interface RuntimeLike {
  getURL?: (path: string) => string;
}

/** 纯函数，便于针对子路径部署写回归测试。 */
export function resolveFormatWorkerUrl(base?: string, getUrl?: (path: string) => string): string {
  if (typeof getUrl === 'function') return getUrl(FORMAT_WORKER_ASSET);
  const resolvedBase = base ?? (typeof document === 'undefined' ? 'https://example.test/' : document.baseURI);
  return new URL(FORMAT_WORKER_ASSET, resolvedBase).href;
}

/** 动态探测扩展 runtime；app/ 不静态依赖 browser / chrome / WXT。 */
function extensionGetUrl(): ((path: string) => string) | undefined {
  const scope = globalThis as unknown as {
    browser?: { runtime?: RuntimeLike };
    chrome?: { runtime?: RuntimeLike };
  };
  const runtime = scope.browser?.runtime ?? scope.chrome?.runtime;
  const get = runtime?.getURL;
  if (typeof get !== 'function') return undefined;
  return (path: string) => get.call(runtime, path);
}

const pending = new Map<number, PendingTask>();
let worker: Worker | null = null;
let workerUrl = '';
let disabled = false;
let sequence = 0;

function dropWorker(): void {
  if (worker) worker.terminate();
  worker = null;
  workerUrl = '';
}

function cancelPending(): void {
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.resolve({ output: '', degraded: false, elapsedMs: 0, error: null, cancelled: true });
  }
  pending.clear();
}

/** 供测试与异常恢复重置模块级状态。 */
export function resetFormatWorker(): void {
  cancelPending();
  dropWorker();
  disabled = false;
}

function errorResult(message: string, startedAt: number): StreamFormatResult {
  return { output: '', degraded: true, elapsedMs: Date.now() - startedAt, error: message };
}

function ensureWorker(url: string): Worker | null {
  if (disabled) return null;
  if (worker && workerUrl === url) return worker;
  dropWorker();
  try {
    const instance = new Worker(url);
    worker = instance;
    workerUrl = url;
    instance.onmessage = (event: MessageEvent) => {
      const reply = event.data as WorkerReply;
      const task = pending.get(reply.id);
      if (!task) return;
      pending.delete(reply.id);
      clearTimeout(task.timer);
      task.resolve({
        output: reply.ok ? (reply.output ?? '') : '',
        degraded: false,
        elapsedMs: reply.elapsedMs ?? Date.now() - task.startedAt,
        error: reply.ok ? null : (reply.error ?? '后台处理失败'),
      });
    };
    instance.onerror = () => {
      const reason = `后台计算脚本加载失败：请确认 ${FORMAT_WORKER_ASSET} 与页面位于同一目录`;
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.resolve(errorResult(reason, task.startedAt));
      }
      pending.clear();
      dropWorker();
      disabled = true;
    };
    return instance;
  } catch {
    dropWorker();
    disabled = true;
    return null;
  }
}

/**
 * 把大文本的「字符串级」处理交给后台内核。失败时返回明确中文错误，
 * 绝不在主线程偷偷做一次全量计算（那反而会卡死页面）。
 *
 * 同一时刻界面只挂载一个工具，因此新任务取代仍在排队的旧任务是安全的；
 * 这也能避免用户快速改参数时 Worker 里堆积大量长任务。
 */
export function runFormatTask(
  kind: FormatTaskKind,
  text: string,
  options: FormatTaskOptions = {},
): Promise<StreamFormatResult> {
  const startedAt = Date.now();
  cancelPending();
  const base = typeof document === 'undefined' ? undefined : document.baseURI;
  const url = resolveFormatWorkerUrl(base, extensionGetUrl());
  const instance = ensureWorker(url);
  if (!instance) {
    return Promise.resolve(errorResult(`后台通道不可用：请确认部署目录包含 ${FORMAT_WORKER_ASSET}`, startedAt));
  }

  const id = ++sequence;
  return new Promise<StreamFormatResult>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      dropWorker();
      resolve(errorResult('后台处理超时，已停止；可缩小文件后重试', startedAt));
    }, FORMAT_WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, timer, startedAt });
    try {
      instance.postMessage({
        id,
        task: kind,
        text,
        indent: options.indent ?? 2,
        minify: Boolean(options.minify),
        options,
      });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      dropWorker();
      resolve(errorResult(`提交后台任务失败：${error instanceof Error ? error.message : String(error)}`, startedAt));
    }
  });
}

/** JSON 格式化工具的专用入口，保持第七批的调用签名不变。 */
export function formatLargeJson(text: string, indent: number, minify: boolean): Promise<StreamFormatResult> {
  return runFormatTask('json', text, { indent, minify });
}
