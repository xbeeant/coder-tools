import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  // 显式锁定扩展入口目录：项目根的 index.html 是独立 Web 版入口，不属于扩展。
  entrypointsDir: 'entrypoints',
  // 默认产物在 .output；需要并排验证时可指定 WXT_OUT_DIR 输出到别处，避免清理已有产物。
  outDir: process.env.WXT_OUT_DIR ?? '.output',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Coder Tools',
    short_name: 'Coder Tools',
    description: '程序员常用工具箱：85 项本地工具，支持选中文本右键直达、当前页上下文采集与同源请求联调。',
    // activeTab + scripting 只在用户通过右键菜单 / 图标交互后授予，用于采集上下文或发送同源请求；
    // 作用范围始终是那一个标签页，不申请 <all_urls>，工具箱默认不读取任意网站数据。
    permissions: ['clipboardWrite', 'contextMenus', 'activeTab', 'scripting'],
    // 不设置 default_popup：点击工具栏图标时由 background 打开独立页面标签。
    action: {
      default_title: '打开 Coder Tools',
    },
    browser_specific_settings: {
      gecko: {
        id: 'coder-tools@example.com',
      },
    },
  },
});
