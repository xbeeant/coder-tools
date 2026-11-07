# Coder Tools 功能清单与代办

> 清单来源：需求表格（14 个分类、84 项工具）+ 本轮新增第 85 项「HTTP 客户端」。
> 状态：`✅ 已完成`。平台类工具（终端、容器、监控等）虽无法在浏览器内内建运行时，
> 但都已提供浏览器内可用的命令速查 / 配置生成器，并附官方文档入口；早期「🧭 外部工具导航」的标记经复核后已校正。
>
> 约定：每个工具对应 `app/tools/<id>.tsx`（少数文件名与 id 不同，见下表）；纯逻辑抽到 `app/lib/<name>.ts`；
> 所有工具在 `app/lib/registry.ts` 中注册（TOOLS + TOOL_TREE）。

## 总览

| 分类 | 数量 | 状态 |
|---|---|---|
| 加密与安全 | 9 | ✅ 全部完成 |
| 编码转换 | 7 | ✅ 全部完成 |
| 数据格式 | 9 | ✅ 全部完成 |
| 网络工具 | 9 | ✅ 全部完成 |
| 开发辅助 | 14 | ✅ 全部完成（含速查 / 配置生成 + 官方入口、HTTP 客户端） |
| 文本处理 | 7 | ✅ 全部完成 |
| 图像与媒体 | 8 | ✅ 全部完成 |
| 时间与单位 | 5 | ✅ 全部完成 |
| 终端与环境 | 4 | ✅ 全部完成（含速查 / 配置生成 + 官方入口） |
| 容器与虚拟化 | 4 | ✅ 全部完成（含速查 / 配置生成 + 官方入口） |
| 监控与运维 | 3 | ✅ 全部完成（含速查 / 配置生成 + 官方入口） |
| 文档与知识 | 1 | ✅ 全部完成 |
| 效率辅助 | 4 | ✅ 全部完成 |
| 导航聚合 | 1 | ✅ 全部完成 |

## 加密与安全

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 1 | Token 生成器 | `token` · `tools/token.tsx` | ✅ 已完成 |
| 2 | UUID / ULID 生成器 | `uuid` · `tools/uuid.tsx` | ✅ 已完成 |
| 3 | 密码强度分析 | `password-strength` · `tools/password-strength.tsx` | ✅ 已完成 |
| 4 | Bcrypt 加密 | `bcrypt` · `tools/bcrypt.tsx` + `lib/bcrypt.ts` | ✅ 已完成 |
| 5 | Hash 计算 | `hash` · `tools/hash.tsx` | ✅ 已完成 |
| 6 | HMAC 生成器 | `hmac` · `tools/hmac.tsx` | ✅ 已完成 |
| 7 | RSA 密钥对生成 | `rsa` · `tools/rsa.tsx` | ✅ 已完成 |
| 8 | 对称加解密（AES / DES / 3DES） | `aes` · `tools/aes.tsx` + `lib/des.ts` | ✅ 已完成 |
| 9 | 安全扫描工具 | `security-scan` · `tools/security-scan.tsx` + `lib/security-scan.ts` | ✅ 已完成 |

## 编码转换

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 10 | Base64 编解码 | `base64` · `tools/base64.tsx` | ✅ 已完成 |
| 11 | URL 编解码 | `url-encode` · `tools/url-encode.tsx` | ✅ 已完成 |
| 12 | HTML 实体转换 | `html-entity` · `tools/html-entity.tsx` | ✅ 已完成 |
| 13 | 进制转换 | `number-base` · `tools/number-base.tsx` | ✅ 已完成 |
| 14 | 文本转 Unicode / 二进制 | `unicode` · `tools/unicode.tsx` | ✅ 已完成 |
| 15 | Punycode 编解码 | `punycode` · `tools/punycode.tsx` | ✅ 已完成 |
| 16 | 字符集转换 | `charset-convert` · `tools/charset-convert.tsx` + `lib/charset.ts` | ✅ 已完成 |

## 数据格式

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 17 | JSON 格式化 / 压缩 | `json-formatter` · `tools/json-formatter.tsx` | ✅ 已完成 |
| 18 | JSON ↔ CSV / XML / YAML / TOML | `json-convert` · `tools/json-convert.tsx` + `lib/json-convert.ts` | ✅ 已完成 |
| 19 | JSON 转代码实体 | `json-to-code` · `tools/json-to-code.tsx` + `lib/json-to-code.ts` | ✅ 已完成 |
| 20 | YAML / XML 格式化 | `yaml-xml` · `tools/yaml-xml.tsx` + `lib/markup.ts` | ✅ 已完成 |
| 21 | SQL 格式化 | `sql` · `tools/sql.tsx` | ✅ 已完成 |
| 22 | Markdown 转 HTML | `markdown` · `tools/markdown.tsx` + `lib/markdown.ts` | ✅ 已完成 |
| 23 | 表格互转（Excel / CSV / MD / HTML） | `table-convert` · `tools/table-convert.tsx` + `lib/table.ts` | ✅ 已完成 |
| 24 | 数据库客户端 | `db-client` · `tools/db-client.tsx` + `lib/db-studio.ts` | ✅ 已完成 |
| 84 | JSON 比对 | `json-diff` · `tools/json-diff.tsx` | ✅ 已完成（补登，原清单遗漏此项） |

## 网络工具

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 25 | IPv4 子网计算 | `ipv4-subnet` · `tools/ipv4-subnet.tsx` | ✅ 已完成 |
| 26 | IPv4 地址转换 | `ip-convert` · `tools/ip-convert.tsx` | ✅ 已完成 |
| 27 | IPv6 ULA 生成 | `ipv6-ula` · `tools/ipv6-ula.tsx` + `lib/ipv6.ts` | ✅ 已完成 |
| 28 | MAC 地址生成 / 查询 | `mac-address` · `tools/mac-address.tsx` + `lib/mac.ts` | ✅ 已完成 |
| 29 | HTTP 状态码速查 | `http-status` · `tools/http-status.tsx` | ✅ 已完成 |
| 30 | User-Agent 解析 | `user-agent` · `tools/user-agent.tsx` | ✅ 已完成 |
| 31 | URL 解析 | `url-parser` · `tools/url-parser.tsx` + `lib/url-parser.ts` | ✅ 已完成 |
| 32 | Geohash 编解码 | `geohash` · `tools/geohash.tsx` | ✅ 已完成 |
| 33 | 抓包调试工具 | `packet-debug` · `tools/packet-debug.tsx` + `lib/har.ts` | ✅ 已完成 |

## 开发辅助

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 34 | 正则表达式测试 | `regex` · `tools/regex-tester.tsx` | ✅ 已完成 |
| 35 | Crontab 生成器 | `cron` · `tools/cron-parser.tsx` | ✅ 已完成 |
| 36 | JWT 解析 | `jwt` · `tools/jwt.tsx` | ✅ 已完成 |
| 37 | Git 命令速查 | `git` · `tools/git.tsx` + `lib/git-cheatsheet.ts` | ✅ 已完成 |
| 38 | Chmod 计算器 | `chmod` · `tools/chmod.tsx` + `lib/chmod.ts` | ✅ 已完成 |
| 39 | Docker Run 转 Compose | `docker-compose` · `tools/docker-compose.tsx` + `lib/docker-run.ts` | ✅ 已完成 |
| 40 | 代码编辑器 / IDE | `ide` · `tools/ide.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 41 | AI 编程助手 | `ai-assist` · `tools/ai-assist.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 42 | 代码托管平台 | `code-hosting` · `tools/code-hosting.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 43 | 接口调试工具 | `api-debug` · `tools/api-debug.tsx` + `lib/curl.ts` | ✅ 已完成（离线转换，不发起请求） |
| 85 | HTTP 客户端 | `http-client` · `tools/http-client.tsx` + `lib/http-client.ts` | ✅ 已完成（真实发请求，扩展版支持页面上下文通道） |
| 44 | 测试框架 | `test-framework` · `tools/test-framework.tsx` + `lib/testcase.ts` | ✅ 已完成 |
| 45 | 静态代码分析 | `static-analysis` · `tools/static-analysis.tsx` + `lib/static-rules.ts` | ✅ 已完成 |
| 46 | 项目管理工具 | `project-mgmt` · `tools/project-mgmt.tsx` + `lib/pm-store.ts` | ✅ 已完成 |

## 文本处理

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 47 | 大小写转换 | `case` · `tools/case.tsx` | ✅ 已完成 |
| 48 | 文本差异对比 | `text-diff` · `tools/text-diff.tsx` + `lib/diff.ts` | ✅ 已完成 |
| 49 | 文本统计 | `text-stats` · `tools/text-stats.tsx` + `lib/text-stats.ts` | ✅ 已完成 |
| 50 | 占位文本生成 | `lorem` · `tools/lorem.tsx` | ✅ 已完成 |
| 51 | Slugify 转换 | `slug` · `tools/slug.tsx` | ✅ 已完成 |
| 52 | 文本去重 / 排序 / 清洗 | `text-clean` · `tools/text-clean.tsx` | ✅ 已完成 |
| 53 | 字符串混淆 / 反转 | `text-obfuscate` · `tools/text-obfuscate.tsx` | ✅ 已完成 |

## 图像与媒体

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 54 | 二维码生成器 | `qr` · `tools/qr-generator.tsx` | ✅ 已完成 |
| 55 | WiFi 二维码生成 | `wifi-qr` · `tools/wifi-qr.tsx` | ✅ 已完成 |
| 56 | 占位图生成 | `placeholder-image` · `tools/placeholder-image.tsx` + `lib/placeholder.ts` | ✅ 已完成 |
| 57 | 颜色转换器 | `color` · `tools/color.tsx` + `lib/color.ts` | ✅ 已完成 |
| 58 | 图标与表情选择器 | `icon-emoji` · `tools/icon-emoji.tsx` + `lib/emoji.ts` | ✅ 已完成 |
| 59 | 图片压缩 / 格式转换 | `image-convert` · `tools/image-convert.tsx` + `lib/image.ts` | ✅ 已完成 |
| 60 | PDF 处理 | `pdf` · `tools/pdf.tsx` + `lib/pdf.ts` | ✅ 已完成 |
| 61 | 截图标注工具 | `screenshot` · `tools/screenshot.tsx` + `lib/annotate.ts` | ✅ 已完成 |

## 时间与单位

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 62 | 时间戳互转 | `timestamp` · `tools/timestamp.tsx` | ✅ 已完成 |
| 63 | 时区转换 | `timezone` · `tools/timezone.tsx` + `lib/tz.ts` | ✅ 已完成 |
| 64 | 日期计算 | `date-calc` · `tools/date-calc.tsx` + `lib/datetime.ts` | ✅ 已完成 |
| 65 | 单位换算 | `unit` · `tools/unit.tsx` | ✅ 已完成 |
| 66 | 计时器 / 秒表 | `timer` · `tools/timer.tsx` + `lib/stopwatch.ts` | ✅ 已完成 |

## 终端与环境

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 67 | 现代终端模拟器 | `terminal` · `tools/terminal.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 68 | Shell 增强框架 | `shell-framework` · `tools/shell-framework.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 69 | 命令行效率工具 | `cli-efficiency` · `tools/cli-efficiency.tsx` + `lib/fuzzy.ts` | ✅ 已完成 |
| 70 | 包管理器 | `package-manager` · `tools/package-manager.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |

## 容器与虚拟化

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 71 | 容器运行时 | `container-runtime` · `tools/container-runtime.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 72 | 容器编排 | `container-orchestration` · `tools/container-orchestration.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 73 | 虚拟机工具 | `vm` · `tools/vm.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 74 | Linux 子系统 | `wsl` · `tools/wsl.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |

## 监控与运维

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 75 | 指标监控 | `metrics` · `tools/metrics.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 76 | 日志系统 | `logging` · `tools/logging.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |
| 77 | 链路追踪 / APM | `apm` · `tools/apm.tsx` | ✅ 已完成（速查 / 配置生成 + 官方入口） |

## 文档与知识

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 78 | 笔记与知识库 | `notes` · `tools/notes.tsx` + `lib/notes-store.ts` | ✅ 已完成 |

## 效率辅助

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 79 | Hosts 切换工具 | `hosts-switch` · `tools/hosts-switch.tsx` + `lib/hosts.ts` | ✅ 已完成 |
| 80 | 浏览器脚本扩展 | `userscript` · `tools/userscript.tsx` + `lib/userscript.ts` | ✅ 已完成 |
| 81 | 剪贴板管理 | `clipboard` · `tools/clipboard.tsx` + `lib/clipboard-store.ts` | ✅ 已完成 |
| 82 | 密码管理器 | `password-manager` · `tools/password-manager.tsx` + `lib/vault.ts` | ✅ 已完成 |

## 导航聚合

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 83 | 开发者导航站 | `dev-nav` · `tools/dev-nav.tsx` | ✅ 已完成 |

## 基础设施

| 事项 | 文件 | 状态 |
|---|---|---|
| 共享 UI 套件 | `app/components/ui/panel.tsx`、`field.tsx`、`code-block.tsx` | ✅ 已完成 |
| 字节与编码工具函数 | `app/lib/bytes.ts` | ✅ 已完成 |
| 文件读写与导出工具 | `app/lib/file.ts` | ✅ 已完成 |
| 注册表与工具树登记全部 85 项 | `app/lib/registry.ts` | ✅ 已完成 |
| 类型检查与代码规范零诊断 | `bun run check` | ✅ 已完成（180 文件、0 诊断） |
| 纯函数单测 | `tests/` + `bun run test` | ✅ 已完成（56 用例、0 失败，Bun 内置 runner 零新依赖） |
| HTTP 请求编译与双通道发送 | `app/lib/http-client.ts`、`entrypoints/background.ts` | ✅ 已完成（direct / page MAIN world） |
| 本地存储配额治理 | `app/lib/quota.ts`、`SettingsDialog.tsx` | ✅ 已完成（水位条 + 写入预检 + 失败提示） |
| 扩展构建验证 | `bun run build` | ✅ 已完成（3.57 MB） |
| Web 静态站构建验证 | `bun run build:web` | ✅ 已完成（相对路径产物，支持子路径部署） |
| 双端共用源码 | `app/`（不依赖任何 browser / chrome API） | ✅ 已完成 |
| 设置面板与偏好存储 | `app/components/SettingsDialog.tsx`、`app/hooks/storage.ts` | ✅ 已完成 |
| 本地数据导出 / 导入 / 清空 | `app/lib/workspace.ts` | ✅ 已完成 |
| 工具输入自动保存 / 恢复 | `app/lib/input-snapshot.ts`、`app/hooks/use-input-snapshot.ts` | ✅ 已完成 |
| 运行环境探测与分享链接 | `app/lib/runtime.ts` | ✅ 已完成 |
| 选中文本右键菜单直达工具 | `entrypoints/background.ts` | ✅ 已完成（仅扩展版） |
| 页面上下文采集与填入 | `app/lib/page-context.ts`、`app/components/PageContextPanel.tsx` | ✅ 已完成（仅扩展版） |
| 工具级错误边界 | `app/components/ToolErrorBoundary.tsx` | ✅ 已完成 |

## 本次完善记录（2026-11-07）

### 双形态打包

- 新增 Web 独立入口（项目根 `index.html`）与 `vite.web.config.ts`，与扩展共用 `app/` 全部源码；
  Vite root 必须是项目根，否则 dev 模式下入口对 `app/main.tsx` 的引用不会被正确重写；
  `app/` 内不引用扩展 API 是双端复用的前提。
- `package.json` 新增 `dev:web` / `build:web` / `preview:web` / `build:all`，并显式声明 `@vitejs/plugin-react`。
- `wxt.config.ts` 显式锁定 `entrypointsDir: 'entrypoints'`，避免根目录 Web 入口被当成扩展入口；
  `WXT_OUT_DIR` 可改扩展输出目录，便于并排验证而不清理已有产物。
- Web 产物使用相对资源路径（`base: './'`）、hash 路由，可放任意静态托管；构建不清空输出目录。
- 去掉手工 `manualChunks`，交给 Vite 按 `React.lazy` 自动分块，PDF / cron 等重依赖按需加载。

### 全局能力

- 设置面板（`⌘ / Ctrl + ,`）：主题支持跟随系统、自动保存工具输入、启动时恢复上次工具、记住侧边栏。
- 数据管理：枚举全部 `coder-tools:` 本地数据、导出 JSON 文件 / 复制备份、导入（合并或覆盖）、
  清空（二次确认）；导入做格式、版本、键前缀、类型与 8 MB 体积校验。
- 工具输入自动保存 / 恢复：DOM 级采集与回填，不改动 84 个工具组件；整工具排除 14 个敏感工具，
  字段再按 password / secret / token 等关键词过滤，跳过空值、只读框、开关与超限内容；可关闭、可一键清除。
- 快捷键补充：`⌘[` / `⌘]` 历史后退前进、`⌘⇧F` 收藏、`⌘⇧T` 主题、`⌘⇧C` 复制当前工具链接；
  标题栏新增前进后退按钮，头部显示运行环境标识与分享入口，操作有 toast 反馈。
- 注册表校正 6 处与实现不符的描述（PDF 加密、接口/抓包调试发请求、测试框架"运行器"、
  截图标注"贴图固定"、安全扫描 CVE 快照、IDE 配置生成）。

### 工具缺陷修复

| 文件 | 修复 |
|---|---|
| `tools/timestamp.tsx` | 非有限数字 / 超 Date 范围不再触发 `toISOString()` 白屏，给出错误提示 |
| `tools/geohash.tsx` | 批量结果两列漏花括号导致显示 JSX 源码文字 |
| `tools/regex-tester.tsx` | 文本长度上限、嵌套量词 / 重叠交替检测、结果上限与提示、输入防抖 |
| `tools/ipv4-subnet.tsx` | 「最小超网」恒为「—」的 reduce 初值错误 |
| `tools/cron-parser.tsx` | 日 / 周字段同时受限时改为标准 Vixie cron 的 OR 语义 |
| `tools/unicode.tsx` | 十六进制与十进制两种编码风格现在都能被本工具自己的解码器还原 |
| `tools/text-clean.tsx` | 重复列表硬截断 200 条补上说明 |
| `tools/number-base.tsx` | 四个主结果补一键复制，补清空 / 示例 |
| `tools/password-strength.tsx` | 密码框补显隐切换与清空（明文不落盘） |

### 平台类工具与工程

- 复核确认 13 个平台类工具均已有命令速查 / 配置生成器，原「外部工具导航」标记属于文档过时，已全部校正。
- IDE 工具补齐 `.vscode/extensions.json` 按推荐扩展清单勾选生成，输出区补一键复制；
  消除了与原有「配置生成」tab 重复的 settings.json 表单。
- 补登原清单遗漏的第 84 项工具 `json-diff`。
- 统一 83 个工具文件的 CRLF 行尾为 LF；`biome.json` 排除 `dist-web` / `dist` 等构建产物；
  修复 `json-tree.tsx` 的可访问性问题（`div onClick` 改为 button）；`bun run check` 从 144 个错误降到 0 诊断。

## 第二批完善（2026-11-07 · 扩展专属能力与地基）

**动机**：双端打包后 Web 版与扩展版能力完全一致，`app/` 一行扩展 API 都没用，
扩展形态没有不可替代的价值。这一批补的正是「Web 版做不到」的部分。

### 选中文本右键直达

- `entrypoints/background.ts` 注册「用 Coder Tools 打开」父菜单 + 12 个子项
  （JSON 格式化、Base64、URL 编解码/解析、JWT、Hash、正则、时间戳、文本统计/差异、Unicode、HTML 实体）。
- 工具页未打开时：选中文本暂存后台，新标签启动后一次性拉取（超过 60 秒的旧载荷自动忽略）。
- 工具页已打开时：直接 `tabs.sendMessage` 推送并聚焦，不重载页面、不打断正在填写的内容。
- 应用收到载荷后自动切到目标工具并打开上下文面板。

### 页面上下文采集

- `app/lib/page-context.ts`：只用 `globalThis` 上的运行时对象收发消息，**不 import 任何扩展模块**，
  因此 Web 构建原样打包、运行时按 `IS_EXTENSION` 降级，入口按钮自动隐藏。
- `background.ts` 用 `scripting.executeScript` 注入自包含的采集函数，读取 URL / 标题 / Meta /
  Cookie / 本地存储键值 / 最近资源请求 / JSON-LD / 选中文本 / 正文片段；每项都有长度与数量上限。
- `app/components/PageContextPanel.tsx`：条目可筛选、可复制、可一键填入当前工具选中的输入框。
  填入复用 `input-snapshot.ts` 新增的 `listInputFields` / `fillInputField`，84 个工具零改动。
- 隐私：上下文只在组件内存，刷新即消失，不写入本地存储、不进入工作区备份；
  名称含 token / secret / password 等关键词的字段界面默认打码，复制原始值需主动点击。
- 权限：`contextMenus` + `activeTab` + `scripting`（外加原有 `clipboardWrite`），**不申请 `<all_urls>`**；
  采集目标来自用户右键 / 点击图标时记录的标签页。已核对产物 manifest 与注入函数打包后仍自包含。

### 地基

- 新增 `app/components/ToolErrorBoundary.tsx`，按工具 id 作 key 包裹懒加载组件：
  单个工具渲染抛错只影响当前卡片，导航 / 搜索 / 设置仍可用，不再白屏整个应用。
- 快捷键新增 `⌘/Ctrl + ⇧ + P`；Esc 统一关闭搜索 / 设置 / 上下文面板。

### 验证

`bun run check` 171 个文件零诊断、`tsc --noEmit` 通过、Web 构建与扩展构建均通过；
扩展产物 manifest 权限符合预期，注入函数经打包检查确认无外部符号引用。

## 第三批完善（2026-11-07 · 真·HTTP 客户端、配额治理与单测）

**动机**：`api-debug` / `packet-debug` 名不副实，只是离线字符串转换；同时若干工具共用 5 MB
本地存储却对写入失败静默 catch，用户只会看到「刷新后内容不见了」。这一批把「真的能用」补上，
而不是继续堆第 86 个转换器。

### 真·HTTP 客户端（第 85 项工具）

- 新增 `app/lib/http-client.ts`：复用 `curl.ts` 的 `RequestState`，编译成可执行的 `FetchSpec`；
  处理浏览器禁止设置的头、Cookie / Basic / Bearer / 自定义认证、GET 带 body、超时夹取，
  以及响应体上限（500 KB）、二进制响应跳过、敏感响应头打码。
- 新增 `app/tools/http-client.tsx`：cURL 导入、参数 / 头 / 体 / 认证 / Cookie 编辑、超时与取消、
  状态码 / 耗时 / 大小 / 重定向展示、响应体美化与下载、cURL / fetch / axios 导出、本地请求历史。
- 两条通道：`direct` 在工具页 fetch（Web + 扩展通用，受 CORS 限制）；`page` 由
  `entrypoints/background.ts` 把自包含的 `fetch` 注入用户刚交互过的网页（`world: 'MAIN'`）执行，
  同源接口免 CORS 且自动带站点 Cookie。工具页是 `chrome-extension://` 源，注入后才算真正同源。
- 后台对消息载荷做 URL / 方法 / 头 / 体 / 凭据模式校验；跨源目标会返回明确提示，不假称绕过所有 CORS；
  已核对打包产物里注入函数无任何模块作用域引用。
- **修复既有消息通道缺陷**：WXT 的 `browser` 在 Chrome 下是原生 `chrome` 对象而非 polyfill，
  `onMessage` 监听器直接 `return Promise` 不会触发回复，`pending` / `capture` / `http` 三个分支都受影响。
  现统一改为同步分支 `sendResponse(...)`、异步分支 `.then(sendResponse)` + `return true`，
  并在打包产物里核对过生成代码。
- 安全边界：界面固定提示「请求会真实到达服务端、可能携带凭据」；`http-client` 加入输入自动保存
  排除名单（敏感工具增至 15 个）；请求历史只存脱敏 cURL，最多 20 条，可关闭 / 清空。
- 原 `api-debug` / `packet-debug` 保持离线定位不变，注册表描述已标明。

### 本地存储配额治理

- 新增 `app/lib/quota.ts`：按整个同源 origin 估算占用（UTF-16 × 2，区分工具箱与其他应用），
  75% / 90% 分级，`safeSetItem` 写入前预检并翻译 `QuotaExceededError`。
- `input-snapshot.ts` 与 `workspace.ts` 的写入改走 `safeSetItem`；输入快照失败经 60 秒节流后
  弹出 toast，导入备份失败会显示「仅导入 N/M 项」与原因，不再静默丢数据。
- `SettingsDialog.tsx` 数据页新增配额水位条与清理建议。

### 纯函数单测与顺带修出的缺陷

- `tests/` 新增 4 个测试文件、56 个用例，覆盖配额、工作区备份、HTTP 请求编译、
  bytes / curl / har / diff 纯逻辑；`package.json` 增加 `test` 脚本，零新依赖。
- **发现并修复真实缺陷**：`app/lib/diff.ts` 的 `computeStats` 把删除行与修改行也计入 `unchanged`，
  导致删掉一行后「相似度」仍显示 100%。现在只有真正相同的行计入相似度。

### 验证

`bun run check` 180 个文件零诊断、`tsc --noEmit` 通过、`bun run test` 56/56 通过；
扩展构建（`.output/verify-http`）与 Web 构建均通过；manifest 描述更新为 85 项，权限仍为
`clipboardWrite` + `contextMenus` + `activeTab` + `scripting`，无 `<all_urls>`。

### 下一批候选（按优先级）

1. 工具编排流水线 + 工作区变量：把 85 个孤岛连成可保存重放的工作流。需要先设计步骤协议
   （输入 / 输出类型、变量引用、失败策略），单独一批做，混进其它任务容易做浅。
2. 让 `security-scan` 支持可选 advisory 数据源，并明确离线快照截止日期。
3. JWT 签发 / 验证、db-client 真本地查询等「名不副实」能力的逐项坐实。

## 第四批完善（2026-11-07 · UI 重新设计与实现）

**动机**：原界面是未加设计的 shadcn 默认皮肤 —— 蓝紫主色、纯白 / 近黑、统一 `rounded-md` +
灰边、万物皆卡片、三层横条堆叠且工具名与描述重复、深色只是浅色取反；`index.html` 的
meta 还停留在「83 项工具」。设计目标定为「工业精密 · 仪器面板」，范围限定在令牌 + 共享组件
+ 全局外壳，不重写 85 个工具页内部逻辑。

### 设计系统

- 新建 `.impeccable.md` 设计上下文（用户画像、品牌人格、美学方向、反参考、原则、
  约束与组件状态清单）。
- 重写 `app/globals.css`：OKLCH 语义令牌，浅色暖灰纸感 + 墨蓝主色 + 单一琥珀信号色；
  深色独立调校（抬高主色亮度、前景换深墨色、控件边界改用实色保 3:1）；
  2–3px 微圆角、`font-display` / `font-mono` 字阶、tabular-nums、`ease-out-quart`；
  `scrollbar-thin` / `blueprint-grid` / `instrument-label` / `instrument-rule` / `skip-link`。
- 全局 `:focus-visible` 统一 2px 琥珀焦点环，`prefers-reduced-motion` 禁用非必要动效。
- **先别名过渡、后语义化清理**：先由 `@theme inline` 兼容别名让 85 个工具页零改动换肤，
  随后把 45 个文件、340 处默认调色板类名全量替换为语义类并移除别名层（详见下一节）。

### 共享组件与外壳

- `components/ui/`：Button 增 loading 与 signal 变体；Input / Textarea 增 `aria-invalid`、
  read-only、disabled 态；Select 去掉深色下会变白底的 `bg-white`；Tabs 改底部细线刻度；
  ToolPanel / Section / Note / Stat / CodeBlock / JsonTree 全部改语义令牌与语法色。
- `AppShell.tsx`：三层横条压成一条 44px 顶栏；前进 / 后退、当前工具读数、Alt 提示上移；
  去掉重复的工具名 + 描述二级栏；侧栏改 `bg-sidebar`、刻度标签与底部工具总数读数；
  激活项用左侧琥珀竖线；命令面板 / 遮罩 / toast 改 `bg-scrim` + 微圆角；新增 skip-link。
- 三个面板（设置 / 页面上下文 / 错误边界）同步换肤；设置里过时的「能力边界」文案
  补上「真正发请求请用 HTTP 客户端」。

### 入口与验证

- Web / 扩展两个 `index.html`：description 校正为 85 项，`theme-color` 分浅深两套，
  boot 屏配色由设计令牌换算成 sRGB（`#f7f4ee` / `#0f1318`），消除纯白闪屏。
- `tests/design-tokens.test.ts` 从 8 个用例扩到 12 个，新增遮罩令牌、别名层已移除、
  「全项目零残留默认调色板类名」与「共享组件零残留默认皮肤类名」等回归断言。
- README 新增「界面设计」章节；`.impeccable.md` 记录实现决策与配色边界。

### 设计技术债清理（同批收尾）

**动机**：上一节为了让 85 个工具页零改动换肤，曾在 `@theme inline` 里加了一层兼容别名，
把 `text-amber-600` 等默认调色板类重定向到语义令牌。别名层只是过渡手段，长期留着会让
「源码写什么」和「设计系统认什么」出现两个真相来源，新增工具也容易继续写旧类名。

- 精确侦查：实际是 340 处旧类名、82 个唯一类名、43 个工具文件，另有 `lime` / `indigo` /
  `slate` / `teal` 冷门色与 `dark:` 变体；最终改动 45 个文件。
- 映射方案：`amber` / `orange` / `yellow` → `warning`；`emerald` / `green` / `lime` →
  `success`；`red` / `rose` → `danger`；`sky` / `blue` → `info`；`violet` / `fuchsia` /
  `purple` → `syntax-literal`；`teal` → `syntax-string`；`indigo` → `syntax-key`；
  `slate` → `muted-foreground`。删除 110 处冗余 `dark:` 变体（语义令牌自身随 `.dark` 切换）。
- 次要文字不再靠降透明度表达层级：18 处 `text-muted-foreground/NN` 与
  `text-foreground/NN` 改为纯前景色，避免深色主题下低于 WCAG AA。
- 机械映射的三处区分度损失做了手工修正：`sql.tsx` 高亮从状态色改回 `syntax-*` 语法令牌
  与 CodeBlock / JsonTree 统一；`password.ts` 五档强度条改为 3 个语义色 + 透明度递进；
  `packet-debug.tsx` 七段瀑布图改用语义色与语法色保留分段区分。
- 移除 `app/globals.css` 兼容别名层，CSS 从 405 行降到 333 行，配色只由语义令牌提供。
- `tests/design-tokens.test.ts` 扩到 12 个用例：断言别名层已移除、全项目源码零残留默认
  调色板类名与降透明度正文、共享组件与外壳零残留默认皮肤类名。

**验证**：`bun run check` 零诊断（181 文件；Biome 自动修复 13 处批量替换后的 JSX 格式），
`bun test` 68/68 通过；Web 与扩展双端构建通过；从入口 HTML 实际引用的 CSS 核对双端产物，
兼容别名残留 0、默认调色板类规则 0、`.text-warning` / `.bg-success` / `.border-danger` /
`.bg-syntax-key` / `.bg-scrim` 等全部生成；无头 Chrome 补拍浅色 `text-diff` 与深色 `sql`
两张回归截图，确认差异红绿区分、语法色生效、深色无白底残留、无掉色。截图归档在
`.workbuddy/ui-qa/05-cleanup-light.png` 与 `06-cleanup-dark.png`。

**状态**：本批 UI 重设计 + 技术债清理已在 `f902b8c` 提交（67 文件，+1289 / −544，
新建 `.impeccable.md` 与 `tests/design-tokens.test.ts`）；含此前 `af3ca0c` 在内，
本地 `master` 的提交尚未 push 到 `origin/master`。
