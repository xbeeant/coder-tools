import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, Field, Select, TextField } from '../components/ui/field';
import { Hint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName } from '../lib/file';
import {
  buildInterceptor,
  buildMutationLogger,
  buildSandboxWrapper,
  buildStyleInjector,
  buildUserscript,
  explainMatch,
  GM_API_TABLE,
  GRANT_OPTIONS,
  META_DIRECTIVES,
  PITFALLS,
  RUN_AT_OPTIONS,
  RUN_AT_PHASES,
  type RunAt,
  SNIPPETS,
  type UserscriptMeta,
} from '../lib/userscript';

type Tab = 'builder' | 'meta' | 'match' | 'install' | 'snippets' | 'pitfalls';

const TABS: { value: Tab; label: string }[] = [
  { value: 'builder', label: '脚本生成器' },
  { value: 'meta', label: '元数据与 API' },
  { value: 'match', label: '匹配测试' },
  { value: 'install', label: '安装与调试' },
  { value: 'snippets', label: '片段库' },
  { value: 'pitfalls', label: '踩坑清单' },
];

const DEFAULT_META: UserscriptMeta = {
  name: '我的脚本',
  namespace: 'https://example.com/userscript',
  version: '1.0.0',
  author: '',
  description: '一句话说明脚本用途',
  match: ['*://*.example.com/*'],
  grants: ['none'],
  runAt: 'document-idle',
};

const MODULES: { key: string; label: string; build: () => string }[] = [
  {
    key: 'sandbox',
    label: '沙盒安全包装',
    build: () => buildSandboxWrapper({ grantNone: true, useUnsafeWindow: false }),
  },
  { key: 'interceptor', label: 'XHR / fetch 拦截器', build: buildInterceptor },
  { key: 'mutation', label: 'DOM 变化记录', build: () => buildMutationLogger() },
  { key: 'style', label: '样式注入', build: () => buildStyleInjector('/* 自定义样式 */') },
];

const LINKS: LinkItem[] = [
  {
    name: 'Tampermonkey',
    url: 'https://www.tampermonkey.net/',
    description: '最主流的脚本管理器，Chrome / Edge / Firefox / Safari 均支持',
    tags: ['管理器'],
  },
  {
    name: 'Violentmonkey',
    url: 'https://violentmonkey.github.io/',
    description: '开源脚本管理器，轻量、可自托管',
    tags: ['管理器', '开源'],
  },
  {
    name: 'Greasemonkey',
    url: 'https://www.greasespot.net/',
    description: 'Firefox 上的老牌脚本管理器',
    tags: ['管理器', 'Firefox'],
  },
  {
    name: 'Greasy Fork',
    url: 'https://greasyfork.org/',
    description: '最大的用户脚本分享站，可搜索与安装现成脚本',
    tags: ['脚本市场'],
  },
  {
    name: 'MDN MutationObserver',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/MutationObserver',
    description: '监听 DOM 变化的官方文档',
    tags: ['文档'],
  },
  {
    name: 'MDN Clipboard API',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Clipboard_API',
    description: '剪贴板读写 API 文档',
    tags: ['文档'],
  },
];

export default function UserscriptTool() {
  const [tab, setTab] = useState<Tab>('builder');
  const [meta, setMeta] = useState<UserscriptMeta>(DEFAULT_META);
  const [customCode, setCustomCode] = useState('');
  const [modules, setModules] = useState<string[]>(['sandbox']);
  const [matchInput, setMatchInput] = useState('*://*.example.com/*\nhttps://github.com/*');
  const [testUrl, setTestUrl] = useState('https://example.com/page');
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

  const code = useMemo(() => {
    const parts = modules.map((key) => MODULES.find((m) => m.key === key)?.build() ?? '');
    const body = [customCode, ...parts].filter((part) => part.trim().length > 0).join('\n\n');
    return buildUserscript(meta, body);
  }, [meta, customCode, modules]);

  const checkSyntax = () => {
    try {
      new Function(code);
      setSyntaxError(null);
    } catch (error) {
      setSyntaxError(error instanceof Error ? error.message : String(error));
    }
  };

  const matchLines = matchInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const matchResults = matchLines.map((pattern) => ({ pattern, result: explainMatch(pattern, testUrl) }));

  const addSnippet = (snippetCode: string) => {
    setCustomCode((prev) => (prev.trim() ? `${prev}\n\n${snippetCode}` : snippetCode));
    setTab('builder');
  };

  return (
    <ToolPanel
      title="浏览器脚本扩展"
      description="生成 Tampermonkey / Violentmonkey / Greasemonkey 用户脚本，含元数据、匹配测试与片段库"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'builder' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Section title="元数据">
              <div className="grid grid-cols-2 gap-2">
                <TextField label="脚本名" value={meta.name} onChange={(value) => setMeta({ ...meta, name: value })} />
                <TextField
                  label="命名空间"
                  value={meta.namespace}
                  onChange={(value) => setMeta({ ...meta, namespace: value })}
                />
                <TextField
                  label="版本"
                  value={meta.version}
                  onChange={(value) => setMeta({ ...meta, version: value })}
                />
                <TextField
                  label="作者"
                  value={meta.author ?? ''}
                  onChange={(value) => setMeta({ ...meta, author: value })}
                />
              </div>
              <TextField
                label="描述"
                value={meta.description ?? ''}
                onChange={(value) => setMeta({ ...meta, description: value })}
              />
              <Field label="@match 匹配规则（每行一条）">
                <Textarea
                  value={matchInput}
                  onChange={(event) => {
                    setMatchInput(event.target.value);
                    setMeta({
                      ...meta,
                      match: event.target.value
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean),
                    });
                  }}
                  spellCheck={false}
                  className="min-h-20 resize-none font-mono text-xs"
                />
              </Field>
              <Field label="@grant 授权">
                <div className="flex flex-wrap gap-3">
                  {GRANT_OPTIONS.map((option) => (
                    <Checkbox
                      key={option.value}
                      label={option.value}
                      checked={meta.grants.includes(option.value)}
                      onChange={(checked) =>
                        setMeta({
                          ...meta,
                          grants: checked
                            ? [...meta.grants, option.value]
                            : meta.grants.filter((g: string) => g !== option.value),
                        })
                      }
                    />
                  ))}
                </div>
                <Hint>选 none 表示无授权沙盒模式，可直接读页面变量但没有 GM_* API。</Hint>
              </Field>
              <Select
                label="@run-at 注入时机"
                value={meta.runAt}
                onChange={(value) => setMeta({ ...meta, runAt: value as RunAt })}
                options={RUN_AT_OPTIONS.map((option: { value: string; label: string }) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </Section>
            <Section title="功能模块">
              <div className="flex flex-wrap gap-3">
                {MODULES.map((module) => (
                  <Checkbox
                    key={module.key}
                    label={module.label}
                    checked={modules.includes(module.key)}
                    onChange={(checked) =>
                      setModules((prev) => (checked ? [...prev, module.key] : prev.filter((k) => k !== module.key)))
                    }
                  />
                ))}
              </div>
            </Section>
            <Section title="自定义代码">
              <Textarea
                value={customCode}
                onChange={(event) => setCustomCode(event.target.value)}
                placeholder="在这里写脚本主体，或从「片段库」添加现成片段"
                spellCheck={false}
                className="min-h-32 resize-none font-mono text-xs"
              />
            </Section>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">生成结果</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={checkSyntax}>
                  语法检查
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyText(code)}>
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText(exportName('userscript', 'user.js'), code, 'text/javascript;charset=utf-8')
                  }
                >
                  下载
                </Button>
              </div>
            </div>
            {syntaxError ? (
              <Note tone="danger" title="语法错误">
                {syntaxError}
              </Note>
            ) : (
              <Note tone="success">语法检查通过（仅检查语法，不执行代码）。</Note>
            )}
            <CodeBlock
              code={code}
              language="javascript"
              filename={`${meta.name || 'userscript'}.user.js`}
              lineNumbers
            />
          </div>
        </div>
      )}

      {tab === 'meta' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="元数据指令">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">指令</th>
                    <th className="px-2 py-1 font-medium">必填</th>
                    <th className="px-2 py-1 font-medium">说明</th>
                    <th className="px-2 py-1 font-medium">示例</th>
                  </tr>
                </thead>
                <tbody>
                  {META_DIRECTIVES.map((row: (typeof META_DIRECTIVES)[number]) => (
                    <tr key={row.directive} className="border-b">
                      <td className="px-2 py-1 font-mono">{row.directive}</td>
                      <td className="px-2 py-1">{row.required ? '是' : '否'}</td>
                      <td className="px-2 py-1">{row.summary}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{row.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="GM_* API 速查">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">API</th>
                    <th className="px-2 py-1 font-medium">异步</th>
                    <th className="px-2 py-1 font-medium">需要授权</th>
                    <th className="px-2 py-1 font-medium">说明</th>
                    <th className="px-2 py-1 font-medium">注意事项</th>
                  </tr>
                </thead>
                <tbody>
                  {GM_API_TABLE.map((row: (typeof GM_API_TABLE)[number]) => (
                    <tr key={row.api} className="border-b">
                      <td className="px-2 py-1 font-mono">{row.api}</td>
                      <td className="px-2 py-1">{row.async ? '是' : '否'}</td>
                      <td className="px-2 py-1">{row.needsGrant}</td>
                      <td className="px-2 py-1">{row.summary}</td>
                      <td className="px-2 py-1 text-muted-foreground">{row.caveat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="注入时机">
            <div className="grid gap-2 sm:grid-cols-2">
              {RUN_AT_PHASES.map((phase: (typeof RUN_AT_PHASES)[number]) => (
                <div key={phase.phase} className="rounded-md border p-2.5">
                  <p className="font-mono text-xs font-medium">{phase.phase}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{phase.when}</p>
                  <p className="mt-1 text-[11px]">可用：{phase.available}</p>
                  <p className="text-[11px] text-muted-foreground">缺失：{phase.missing}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {tab === 'match' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="匹配测试">
            <TextField label="待测 URL" value={testUrl} onChange={setTestUrl} />
            <Field label="模式列表（每行一条）">
              <Textarea
                value={matchInput}
                onChange={(event) => setMatchInput(event.target.value)}
                spellCheck={false}
                className="min-h-24 resize-none font-mono text-xs"
              />
            </Field>
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">模式</th>
                    <th className="px-2 py-1 font-medium">结果</th>
                    <th className="px-2 py-1 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResults.map(({ pattern, result }) => (
                    <tr key={pattern} className="border-b">
                      <td className="px-2 py-1 font-mono">{pattern}</td>
                      <td className="px-2 py-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            result.matched
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {result.matched ? '命中' : '未命中'}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{result.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Note tone="info" title="@match vs @include vs @exclude">
            @match 是 Chrome 扩展规范写法，精确且安全；@include 用通配符，灵活但优先级低；@exclude
            优先级最高，用于排除。 建议优先用 @match，只在需要跨路径匹配时用 @include。
          </Note>
        </div>
      )}

      {tab === 'install' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="安装步骤">
            <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
              <li>
                安装脚本管理器：Chrome / Edge 用 Tampermonkey 或 Violentmonkey，Firefox 用 Greasemonkey 或
                Violentmonkey。
              </li>
              <li>Chrome / Edge 需在扩展管理页开启「开发者模式」，才能拖拽安装 .user.js 文件。</li>
              <li>点击管理器图标 → 「添加新脚本」，把生成的代码粘贴进去保存；或直接把 .user.js 文件拖进浏览器。</li>
              <li>访问 @match 匹配的页面，管理器图标上会显示脚本已启用。</li>
            </ol>
          </Section>
          <Section title="更新机制">
            <p className="text-xs leading-relaxed">
              在元数据里声明 @updateURL 与 @downloadURL，管理器会定期检查更新。版本号用
              SemVer，管理器按版本号比较决定是否更新。 可以把脚本托管到 GitHub Gist，把 Gist 的原始文件地址填给
              @downloadURL。
            </p>
          </Section>
          <Section title="调试技巧">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>控制台里输入 GM_info 查看脚本信息与版本。</li>
              <li>
                @grant none 时脚本与页面共享 window，可以直接读页面变量；声明了其它 grant 后进入沙盒，要用
                unsafeWindow。
              </li>
              <li>React / Vue 页面要等渲染完成再操作 DOM，配合 MutationObserver 或 document-idle。</li>
              <li>iframe 里的页面默认不注入，需要单独 @match 或去掉 @noframes。</li>
              <li>页面有 CSP 时 GM_addStyle 仍可用，但注入的内联样式可能受限。</li>
            </ul>
          </Section>
          <Note tone="warn" title="安全与合规">
            用户脚本只影响你自己的浏览器。不要绕过付费墙或 DRM，不要嵌入他人版权内容，不要在脚本里写真实密钥。
            GM_xmlhttpRequest 可以跨域请求，注意隐私与目标站点的服务条款。
          </Note>
        </div>
      )}

      {tab === 'snippets' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {SNIPPETS.map((snippet: (typeof SNIPPETS)[number]) => (
            <div key={snippet.title} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
              <div>
                <p className="text-xs font-medium">{snippet.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{snippet.summary}</p>
              </div>
              <CodeBlock code={snippet.code} language="javascript" maxLines={12} />
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => copyText(snippet.code)}>
                  复制
                </Button>
                <Button size="sm" variant="outline" onClick={() => addSnippet(snippet.code)}>
                  加入生成器
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'pitfalls' && (
        <div className="flex min-w-0 flex-col gap-2">
          {PITFALLS.map((pitfall: (typeof PITFALLS)[number]) => (
            <div key={pitfall.title} className="rounded-lg border p-3">
              <p className="text-xs font-medium">{pitfall.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{pitfall.detail}</p>
              <p className="mt-1 text-[11px] leading-relaxed">
                <span className="font-medium text-foreground">解决：</span>
                {pitfall.fix}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <LinkList items={LINKS} />
      </div>
    </ToolPanel>
  );
}
