# Coder Tools · 程序员常用工具箱

一个**完全在浏览器本地运行**的开发者工具箱，85 项工具，覆盖加密与安全、编码转换、数据格式、网络、
开发辅助、文本处理、图像与媒体、时间与单位、平台速查、文档与效率等 14 个分类。

同一份 `app/` 源码可以构建成两种形态：

| 形态 | 构建工具 | 产物 | 使用方式 |
|---|---|---|---|
| 浏览器扩展 | WXT | `.output/chrome-mv3/` | 浏览器「加载已解压的扩展程序」 |
| 静态 Web 站点 | Vite | `dist-web/` | 任意静态托管，或本地起服务直接访问 |

`app/` 内不静态引用任何 `browser` / `chrome` / WXT 模块，这是双端复用的关键；扩展专属逻辑通过
`app/lib/page-context.ts` 用 `globalThis` 动态探测运行时，并在 `entrypoints/background.ts`
里实现。所有计算都在本地完成，输入内容不上传；唯一的例外是「HTTP 客户端」工具，它会按你的
指令真实发出请求，界面上有明确提示。

## 快速开始

```bash
bun install

# 扩展开发（Chrome / Firefox）
bun run dev
bun run dev:firefox

# Web 开发服务器：http://localhost:5173
bun run dev:web
```

## 命令一览

| 命令 | 作用 |
|---|---|
| `bun run dev` / `dev:firefox` | WXT 扩展开发模式 |
| `bun run dev:web` | Web 开发服务器（Vite） |
| `bun run build` / `build:firefox` | 构建扩展到 `.output/` |
| `bun run build:web` | 构建静态站点到 `dist-web/` |
| `bun run build:all` | 依次构建扩展与 Web 站点 |
| `bun run preview:web` | 预览 Web 构建产物 |
| `bun run zip` / `zip:firefox` | 打包扩展为可分发的 zip |
| `bun run check` | Biome 全量检查 + TypeScript 类型检查 |
| `bun run test` | Bun 内置 test runner 跑纯函数单测（`tests/`） |
| `bun run compile` | 仅 `tsc --noEmit` |
| `bun run format` / `lint` | 按 Biome 格式化 / 检查代码 |

> 扩展构建可用 `WXT_OUT_DIR` 指定输出根目录（默认 `.output`），便于并排验证而不清理已有产物。
> Web 构建默认**不清空** `dist-web/`；需要全新产物时请先手动移除该目录再构建。

### 部署 Web 版

`dist-web/index.html` 是入口，资源全部使用相对路径（`base: './'`），路由使用 hash
（`#/tool/json-formatter`），因此无需服务端 rewrite，可直接放到域名根目录或 GitHub Pages
之类的子路径下。也可以起一个静态服务器：

```bash
bun run build:web
npx serve dist-web
```

## 主要能力

- **85 项工具**：全部在 `app/lib/registry.ts` 注册，通过 `React.lazy` 按工具分块加载。
- **导航与检索**：工具树、收藏、最近使用、全库模糊搜索（`⌘/Ctrl + K` 或 `/`）、
  按分类顺序切换（`Alt + ↑/↓`）、历史前进后退（`⌘/Ctrl + [ / ]`）。
- **设置面板**（`⌘/Ctrl + ,`）：主题跟随系统 / 浅色 / 深色、自动保存工具输入、
  启动时恢复上次工具、记住侧边栏状态、快捷键清单与运行环境信息。
- **数据管理**：导出 / 复制全量本地数据 JSON，合并或覆盖导入，清空本地数据（二次确认）。
  导入会校验格式、版本、键前缀、类型与体积，只接受 `coder-tools:` 前缀的键。
- **存储配额治理**：设置面板显示同源 5 MB 的水位条；所有写入经预检，空间不足时明确提示
  「本次内容没有保存」，并区分工具箱自身占用与同源下其他应用占用。
- **输入自动保存**：切换工具或重开页面时带回上次填写的文本。可在设置里关闭或一键清除。
- **分享链接**：地址栏 `#/tool/<id>` 可直接定位工具，头部可一键复制当前工具链接。

### 扩展专属能力（仅扩展版）

Web 版与扩展版共用全部 85 个工具，但下面这些依赖浏览器扩展 API，**只在扩展版可用**，
Web 版会自动隐藏入口并给出说明：

- **选中文本右键直达**：在任意网页选中文本，右键「用 Coder Tools 打开」→ 12 个常用工具
  （JSON 格式化、Base64、URL 解析、JWT、哈希、正则、时间戳、文本统计/对比、Unicode、HTML 实体等）。
  文本送到对应工具并打开上下文面板；工具页已打开时直接推送，不重载页面、不打断正在填写的内容。
- **页面上下文采集**（`⌘/Ctrl + ⇧ + P`）：读取你刚刚交互过的网页的 URL、标题、Meta、Cookie、
  本地存储键值、最近资源请求、JSON-LD、选中文本与正文片段。每条都可复制，或一键填入当前工具
  选中的输入框——复用输入快照的字段识别与回填机制，现有工具一行都不用改。
- **页面上下文发送 HTTP 请求**：见下节「HTTP 客户端」，这是扩展形态最不可替代的能力。
- **最小权限**：只申请 `contextMenus` + `activeTab` + `scripting`（外加 `clipboardWrite`），
  没有 `<all_urls>`。采集与发送目标都来自用户右键 / 点击图标时记录的那个标签页，不是任意网站；
  权限不足时会明确提示重新在目标网页上右键使用菜单。

### HTTP 客户端（双端可用，扩展版更强）

`http-client` 是第 85 项工具，也是唯一会真正发起网络请求的工具。它复用 `app/lib/curl.ts`
的 `RequestState` 作为请求模型，支持 cURL 导入、查询参数 / 请求头 / Cookie / 认证 / 请求体编辑、
超时与取消、状态码 / 响应头 / 响应体展示、cURL / fetch / axios 导出，以及本地请求历史。

| 通道 | 可用环境 | 行为 |
|---|---|---|
| 直接发送 | Web + 扩展 | 在工具页内 `fetch`，跨源请求受 CORS 限制 |
| 页面上下文发送 | 仅扩展 | 把 `fetch` 注入用户刚交互过的网页（`MAIN` world）执行；同源接口不受 CORS 限制，并自动携带该站点 Cookie（含 HttpOnly） |

工具页本身是 `chrome-extension://` 源，从它请求任何业务域名都是跨源；注入到业务页面后才是真正的
同源请求。这正是 Web 版给不了的能力，且只复用已有的 `activeTab` 权限，不需要 `<all_urls>`。
目标地址与捕获页面不同源时，界面会明确说明仍受 CORS 限制，不会假称「绕过所有跨域」。

安全边界：请求真实到达服务端并可能携带凭据，界面固定提示；浏览器禁止脚本设置的头
（User-Agent / Host / Origin / Cookie 等）编译时会被忽略并提示；`fetch` 无法关闭重定向跟随，
最终地址会展示；二进制响应跳过内容展示；响应头里的 `Set-Cookie` / `Authorization` 默认打码。
请求历史只保存脱敏后的 cURL（凭据替换为 `<已隐藏>`），最多 20 条，可一键关闭或清空。

### 快捷键

| 按键 | 作用 |
|---|---|
| `⌘/Ctrl + K`、`/` | 打开工具搜索 |
| `⌘/Ctrl + B` | 显示 / 隐藏侧边栏 |
| `⌘/Ctrl + ,` | 打开设置 |
| `⌘/Ctrl + [ / ]` | 后退 / 前进到历史工具 |
| `⌘/Ctrl + ⇧ + F / T / C` | 收藏 / 切换主题 / 复制当前工具链接 |
| `⌘/Ctrl + ⇧ + P` | 打开页面上下文（仅扩展版） |
| `Alt + ↑/↓` | 按分类顺序切换工具 |
| `Esc` | 关闭搜索 / 设置 |

## 数据与安全

- 所有工具计算在本地完成，无后端、无网络上报；本地数据统一存 `localStorage` 的
  `coder-tools:` 前缀下，可用设置面板导出备份。
- **输入自动保存有明确的安全边界**：密码管理器、密码强度、API 调试、HTTP 客户端、数据库客户端、
  HMAC、JWT、Bcrypt、AES、RSA、Token、WiFi 二维码、抓包调试、安全扫描、剪贴板等
  15 个工具整工具排除；其余工具里名称含 password / secret / token / private_key 等
  关键词的字段也会被跳过。只保存文本框与下拉框，不保存开关状态、空值与超限内容。
- 已有独立本地存储的笔记、剪贴板、保险库、Hosts、项目管理等不会重复保存。
- **页面上下文只保存在组件内存**，刷新即消失，不写入本地存储、不进入工作区备份；
  名称含 token / secret / password 等关键词的字段在界面上默认打码，复制原始值需用户主动点击。
- **工具级错误边界**：单个工具渲染抛错只影响当前卡片，导航、搜索、设置仍可用，不会白屏整个应用。
- 能力边界：接口调试 / 抓包调试是**离线的 cURL / HAR 转换器**，不会真正发起网络请求；
  真正发请求的是 HTTP 客户端（见上节）。安全扫描使用本地 CVE 快照，不等同于实时漏洞库；
  PDF 工具不支持写入打开密码；平台类工具（终端、容器、监控等）提供命令速查与配置生成，不内建运行时。
- **纯函数单测**：`tests/` 覆盖配额估算与写入预检、工作区备份校验、HTTP 请求编译、编码互逆、
  cURL / HAR / diff 等纯逻辑，`bun run test` 零依赖运行。

## 界面设计

采用「工业精密 · 仪器面板」设计系统，浅色为设计基准，深色独立调校。完整设计上下文见
`.impeccable.md`，令牌集中在 `app/globals.css`（OKLCH 语义变量 + Tailwind v4 `@theme inline`）。

- **密度优先**：全局只有一条顶栏；工具名与描述只在工具面板出现一次；前进 / 后退上移到顶栏，
  原二级标题栏被移除。
- **层级来自细线**：2–3px 微圆角、发丝规则线、极淡工程网格纹理，不用阴影堆叠与「万物皆卡片」。
- **配色**：暖灰纸感中性底色 + 墨蓝主色 + 单一琥珀信号色（只标注「当前 / 聚焦 / 需注意」）。
  数字统一 tabular-nums，等宽字体只用于真实数据与标识符。
- **双主题与可访问性**：正文对比度 ≥ 4.5:1、交互边界 ≥ 3:1，两套主题分别由
  `tests/design-tokens.test.ts` 实算 OKLCH → OKLab → 线性 sRGB → WCAG 对比度校验；
  全局 `:focus-visible` 焦点环、跳至主内容链接、`prefers-reduced-motion` 支持齐全。
- **全量语义化**：85 个工具页都通过 `ToolPanel` 与 `components/ui/` 继承样式；页面内的
  340 处默认调色板类名已全部替换为 `text-warning` / `bg-success` / `border-danger` 等语义类，
  不再依赖兼容别名，配色随主题自动切换。新增工具请直接使用语义类。
- **离线约束**：只用系统字体栈，无远程字体 / CDN 外链，扩展版完全离线可用。

## 目录结构

```
app/
  globals.css                       设计令牌、语义色、字体阶与自定义 utilities
  AppShell.tsx                      主界面：顶栏、导航、搜索、设置、快捷键、工具容器
  components/ui/                    共享 UI 套件（Card / Field / Select / CodeBlock / JsonTree …）
  components/SettingsDialog.tsx      设置与数据管理面板
  components/PageContextPanel.tsx    页面上下文面板（扩展专属）
  components/ToolErrorBoundary.tsx   工具级错误边界
  hooks/                            偏好与本地存储、输入快照
  lib/registry.ts                   工具注册表 + 导航树（唯一登记入口）
  lib/page-context.ts               扩展消息层、上下文脱敏与 Web 降级
  lib/http-client.ts                HTTP 请求编译、双通道发送与响应序列化
  lib/quota.ts                      本地存储配额估算与带预检的写入
  lib/                              纯逻辑：编码、格式转换、生成器、工作区快照等
  tools/                            85 个工具页面
tests/                               Bun 单测（纯函数、本地存储替身、设计令牌对比度）
index.html                           Web 版入口（Vite root = 项目根）
entrypoints/                         扩展专属入口（background.ts 后台脚本、index.html）
vite.web.config.ts                   Web 独立构建配置
wxt.config.ts                        扩展构建配置
.impeccable.md                       设计上下文、美学方向与实现约束
TODO.md                              功能清单、状态与完善记录
```

新增工具的约定：页面放 `app/tools/<id>.tsx`，纯逻辑抽到 `app/lib/<name>.ts`，
最后在 `app/lib/registry.ts` 的 `TOOLS` 与 `TOOL_TREE` 中登记。
