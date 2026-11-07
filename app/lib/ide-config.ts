/**
 * VS Code 工作区推荐插件（.vscode/extensions.json）生成的纯逻辑。
 *
 * 数据复用 cheatsheet.ts 里已有的 VS Code 推荐扩展清单；
 * 这里只做「勾选的扩展 id → JSON 字符串」的转换，不依赖 DOM / React。
 */

import { VSCODE_EXTENSIONS } from './cheatsheet';

/** 去重后的全部扩展 id，用于「全选」与计数。 */
export const ALL_EXTENSION_IDS: string[] = [...new Set(VSCODE_EXTENSIONS.flatMap((group) => group.ids))];

/** 按原有分组展示，但跨分组去重，避免同一个扩展出现两个开关。 */
export const EXTENSION_GROUPS: { label: string; ids: string[] }[] = (() => {
  const seen = new Set<string>();
  return VSCODE_EXTENSIONS.map((group) => ({
    label: group.label,
    ids: group.ids.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  })).filter((group) => group.ids.length > 0);
})();

/** 默认勾选一组最通用的扩展。 */
export const DEFAULT_EXTENSION_IDS: string[] = [
  'dbaeumer.vscode-eslint',
  'biomejs.biome',
  'esbenp.prettier-vscode',
  'editorconfig.editorconfig',
  'eamodio.gitlens',
  'usernamehw.errorlens',
  'ms-ceintl.vscode-language-pack-zh-hans',
];

/** 把勾选的扩展 id 转成 extensions.json 的 recommendations 数组。 */
export function buildExtensionsJson(ids: string[]): string {
  const recommendations = [...new Set(ids.filter((id) => id.trim() !== ''))];
  return `${JSON.stringify({ recommendations }, null, 2)}\n`;
}
