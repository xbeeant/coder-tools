import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Web 独立构建配置。
 *
 * 与扩展构建（wxt.config.ts）共用同一份 `app/` 源码：扩展入口是
 * `entrypoints/index.html`，Web 入口是项目根的 `index.html`，两者都挂载
 * `app/main.tsx`。`app/` 内不引用任何 browser/chrome API，因此可以直接
 * 产出一份纯静态站点，部署到任意静态托管即可通过浏览器访问。
 *
 * Vite root 必须是项目根（而不是 web/ 之类的子目录），否则入口里对
 * `../app/main.tsx` 的引用在 dev 模式下不会被正确重写，浏览器会拿到
 * HTML 而非 JS 模块。WXT 侧已用 `entrypointsDir` 锁定扩展入口目录，
 * 根目录的 index.html 不会被当成扩展入口。
 *
 * emptyOutDir 显式设为 false，构建时只覆盖同名文件、不删除任何已有内容，
 * 便于在受限环境中反复构建；需要干净产物时请手动移除 dist-web 后再构建。
 */
export default defineConfig({
  // 相对路径产物：既可放在域名根目录，也可部署到 GitHub Pages 之类子路径。
  // public/format-worker.js 会原样复制到产物根目录；大文件格式化 Worker 以
  // document.baseURI 解析它（见 app/lib/format-stream.ts）。因此这里必须保持
  // 相对 base，且不要给入口 HTML 添加 <base href>，否则子路径下会加载不到。
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: false,
    target: 'es2022',
    // 工具页在 registry.ts 里用 React.lazy 加载，交给 Vite 自动按入口分块，
    // 各工具的重依赖（pdf-lib、jszip 等）只在打开该工具时才请求。
  },
});
