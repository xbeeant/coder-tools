import { useCallback, useEffect, useState } from 'react';
import {
  type FormatTaskKind,
  type FormatTaskOptions,
  runFormatTask,
  type StreamFormatResult,
} from '../lib/format-stream';
import { LARGE_TEXT_LIMIT } from '../lib/large-text';

export interface LargeTextTask {
  kind: FormatTaskKind;
  options?: FormatTaskOptions;
}

export interface LargeTextGuard {
  /** 小文件是实时输入；大文件是用户点「开始处理」后提交的快照。 */
  source: string;
  isLarge: boolean;
  /** 大文件内容已变化但尚未提交。 */
  pending: boolean;
  busy: boolean;
  start: () => void;
  background: StreamFormatResult | null;
  /** 后台任务成功时的完整输出；未配置后台任务时恒为 null。 */
  output: string | null;
}

/**
 * 所有文本工具共用的大文件守卫。
 *
 * - 小文件：`source === input`，工具原有 useMemo 实时计算，语义能力完全不变。
 * - 大文件：`source` 停在用户手动提交的快照上，不再每次按键触发全量计算；
 *   若配置了 task，则由后台 Worker 做字符串级处理并把完整结果放在 `output`。
 * - 工具自身负责在 `isLarge` 时短路主线程语义计算，并使用 `output` 展示结果。
 *
 * 传 null 作为 task 表示「只做阈值分流」：适用于 YAML / Markdown / diff 这类
 * 依赖第三方解析器、无法在零依赖 classic worker 里等价复刻的工具。
 */
export function useLargeText(
  input: string,
  task: LargeTextTask | null = null,
  limit = LARGE_TEXT_LIMIT,
): LargeTextGuard {
  const [committed, setCommitted] = useState('');
  const [background, setBackground] = useState<StreamFormatResult | null>(null);
  const [busy, setBusy] = useState(false);

  const isLarge = input.length > limit;
  const pending = isLarge && committed !== input;
  const kind = task?.kind ?? null;
  const optionsKey = task?.options === undefined ? '' : JSON.stringify(task.options);

  useEffect(() => {
    if (!isLarge) setCommitted(input);
  }, [input, isLarge]);

  const source = isLarge ? committed : input;

  useEffect(() => {
    if (!isLarge || pending || kind === null || source === '') {
      setBackground(null);
      setBusy(false);
      return undefined;
    }
    let cancelled = false;
    setBackground(null);
    setBusy(true);
    // 由 optionsKey 还原参数，避免调用方每次渲染新建对象导致任务反复提交。
    const parsedOptions: FormatTaskOptions = optionsKey === '' ? {} : (JSON.parse(optionsKey) as FormatTaskOptions);
    void runFormatTask(kind, source, parsedOptions).then((result) => {
      if (cancelled || result.cancelled) return;
      setBackground(result);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isLarge, pending, kind, optionsKey, source]);

  const start = useCallback(() => setCommitted(input), [input]);

  const output = background !== null && background.error === null ? background.output : null;

  return { source, isLarge, pending, busy, start, background, output };
}
