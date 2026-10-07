import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Coder Tools',
    short_name: 'Coder Tools',
    description: '程序员常用工具箱：JSON 格式化、正则、Base64、URL 编解码、UUID、哈希、时间戳、Cron、二维码。',
    permissions: ['clipboardWrite'],
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
