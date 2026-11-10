/**
 * 大文本保护的共享阈值与纯函数。
 *
 * 三层保护对所有工具一致：
 *   1. 阈值分流：超过 LARGE_TEXT_LIMIT 的输入不再每次按键触发全量解析；
 *   2. 计算移出主线程：能退化为字符串级处理的任务交给后台 Worker；
 *   3. 渲染限量：输出区与列表 DOM 只承载可见规模，复制 / 下载仍用完整结果。
 *
 * 小文件（低于阈值）原有的完整语义能力一律不打折：JSON5 / YAML / Markdown /
 * SQL 解析、diff、结构统计都只在小文件链路上运行。
 */
export const LARGE_TEXT_LIMIT = 1_000_000;
export const LARGE_OUTPUT_PREVIEW_CHARS = 200_000;
export const LARGE_LIST_ROWS = 500;

export function isLargeText(text: string): boolean {
  return text.length > LARGE_TEXT_LIMIT;
}

/** 列表类渲染硬上限：unicode / case / diff 等工具不得按字符或按行生成无限 DOM。 */
export function limitRows<T>(rows: T[], limit = LARGE_LIST_ROWS): T[] {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

/** 只截断「显示」，调用方的复制 / 下载必须继续使用原始完整字符串。 */
export function previewText(text: string, limit = LARGE_OUTPUT_PREVIEW_CHARS): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n… 已截断显示：完整内容共 ${text.length.toLocaleString()} 字符，请用复制或下载获取。`;
}
