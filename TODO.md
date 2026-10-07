# Coder Tools 功能清单与代办

> 清单来源：需求表格（10 个分类、85 项能力）。
> 状态：`✅ 已完成` / `🧭 外部工具导航`（浏览器扩展无法内建的平台能力，提供清单、配置生成与官方入口）
>
> 约定：每个工具对应 `app/tools/<id>.tsx`；纯逻辑抽到 `app/lib/<name>.ts`；
> 所有工具在 `app/lib/registry.ts` 中注册（TOOLS + TOOL_TREE）。

## 总览

| 分类 | 数量 | 状态 |
|---|---|---|
| 加密与安全 | 9 | ✅ 全部完成 |
| 编码转换 | 7 | ✅ 全部完成 |
| 数据格式 | 8 | ✅ 全部完成 |
| 网络工具 | 9 | ✅ 全部完成 |
| 开发辅助 | 13 | ✅ 全部完成（3 项为外部工具导航） |
| 文本处理 | 7 | ✅ 全部完成 |
| 图像与媒体 | 8 | ✅ 全部完成 |
| 时间与单位 | 5 | ✅ 全部完成 |
| 终端与环境 | 4 | ✅ 全部完成（4 项为外部工具导航） |
| 容器与虚拟化 | 4 | ✅ 全部完成（4 项为外部工具导航） |
| 监控与运维 | 3 | ✅ 全部完成（3 项为外部工具导航） |
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
| 17 | JSON 格式化 / 压缩 / 校验 | `json-formatter` · `tools/json-formatter.tsx` + `lib/json-schema.ts` | ✅ 已完成 |
| 18 | JSON ↔ CSV / XML / YAML / TOML | `json-convert` · `tools/json-convert.tsx` + `lib/json-convert.ts` | ✅ 已完成 |
| 19 | JSON 转代码实体 | `json-to-code` · `tools/json-to-code.tsx` + `lib/json-to-code.ts` | ✅ 已完成 |
| 20 | YAML / XML 格式化 | `yaml-xml` · `tools/yaml-xml.tsx` + `lib/markup.ts` | ✅ 已完成 |
| 21 | SQL 格式化 | `sql` · `tools/sql.tsx` | ✅ 已完成 |
| 22 | Markdown 转 HTML | `markdown` · `tools/markdown.tsx` + `lib/markdown.ts` | ✅ 已完成 |
| 23 | 表格互转（Excel / CSV / MD / HTML） | `table-convert` · `tools/table-convert.tsx` + `lib/table.ts` | ✅ 已完成 |
| 24 | 数据库客户端 | `db-client` · `tools/db-client.tsx` + `lib/db-studio.ts` | ✅ 已完成 |

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
| 40 | 代码编辑器 / IDE | `ide` · `tools/ide.tsx` | 🧭 外部工具导航 |
| 41 | AI 编程助手 | `ai-assist` · `tools/ai-assist.tsx` | 🧭 外部工具导航 |
| 42 | 代码托管平台 | `code-hosting` · `tools/code-hosting.tsx` | 🧭 外部工具导航 |
| 43 | 接口调试工具 | `api-debug` · `tools/api-debug.tsx` + `lib/curl.ts` | ✅ 已完成 |
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
| 67 | 现代终端模拟器 | `terminal` · `tools/terminal.tsx` | 🧭 外部工具导航 |
| 68 | Shell 增强框架 | `shell-framework` · `tools/shell-framework.tsx` | 🧭 外部工具导航 |
| 69 | 命令行效率工具 | `cli-efficiency` · `tools/cli-efficiency.tsx` + `lib/fuzzy.ts` | ✅ 已完成 |
| 70 | 包管理器 | `package-manager` · `tools/package-manager.tsx` | 🧭 外部工具导航 |

## 容器与虚拟化

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 71 | 容器运行时 | `container-runtime` · `tools/container-runtime.tsx` | 🧭 外部工具导航 |
| 72 | 容器编排 | `container-orchestration` · `tools/container-orchestration.tsx` | 🧭 外部工具导航 |
| 73 | 虚拟机工具 | `vm` · `tools/vm.tsx` | 🧭 外部工具导航 |
| 74 | Linux 子系统 | `wsl` · `tools/wsl.tsx` | 🧭 外部工具导航 |

## 监控与运维

| # | 工具 | id / 文件 | 状态 |
|---|---|---|---|
| 75 | 指标监控 | `metrics` · `tools/metrics.tsx` | 🧭 外部工具导航 |
| 76 | 日志系统 | `logging` · `tools/logging.tsx` | 🧭 外部工具导航 |
| 77 | 链路追踪 / APM | `apm` · `tools/apm.tsx` | 🧭 外部工具导航 |

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
| 注册表与工具树登记全部 83 项 | `app/lib/registry.ts` | ✅ 已完成 |
| 类型检查与代码规范零错误 | `bun run check` | ✅ 已完成 |
| 构建验证 | `bun run build` | ✅ 已完成（3.53 MB） |
