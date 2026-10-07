import {
  Braces,
  ClipboardPaste,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  Info,
  ListTree,
  ScrollText,
  ShieldAlert,
  Sparkles,
  TableProperties,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatBytes } from '../lib/bytes';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  analyzeMarkdown,
  type CleanOptions,
  cleanHtml,
  extractHeadings,
  htmlToMarkdown,
  renderMarkdownReport,
  renderTocMarkdown,
  scanRiskyMarkup,
} from '../lib/markdown';

type MdTab = 'preview' | 'html' | 'toc' | 'back';

const SAMPLE = `# Markdown 速览

支持 **粗体**、*斜体*、~~删除线~~ 与 \`行内代码\`。

## 列表

- 项目 A
- 项目 B
  - 嵌套 B1

1. 第一
2. 第二

## 引用与代码

> 引用文字。

\`\`\`ts
const value: number = 42;
\`\`\`

## 表格

| 名称 | 值 |
| --- | --- |
| 甲 | 1 |

## 危险内容示例

下面这段会被净化掉：

<script>alert(1)</script>

<div onclick="steal()">事件属性</div>

<a href="javascript:alert(2)">危险链接</a>
`;

export default function Markdown() {
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<MdTab>('preview');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const [gfm, setGfm] = useState(true);
  const [breaks, setBreaks] = useState(false);
  const [headingAnchors, setHeadingAnchors] = useState(true);

  const [stripImages, setStripImages] = useState(false);
  const [stripExternalLinks, setStripExternalLinks] = useState(false);
  const [lazyImages, setLazyImages] = useState(true);
  const [hardenExternalLinks, setHardenExternalLinks] = useState(true);

  const report = useMemo(() => {
    if (input.trim() === '') return null;
    try {
      return renderMarkdownReport(input, { gfm, breaks, headingAnchors });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  }, [input, gfm, breaks, headingAnchors]);

  const html = report === null ? '' : 'error' in report ? '' : report.html;

  const cleaned = useMemo(() => {
    if (html === '') return null;
    const options: CleanOptions = {
      stripImages,
      stripExternalLinks,
      lazyImages,
      hardenExternalLinks,
    };
    try {
      return cleanHtml(html, options);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  }, [html, stripImages, stripExternalLinks, lazyImages, hardenExternalLinks]);

  const headings = useMemo(() => (input.trim() === '' ? [] : extractHeadings(input)), [input]);
  const toc = useMemo(() => (input.trim() === '' ? '' : renderTocMarkdown(input)), [input]);
  const stats = useMemo(() => (input.trim() === '' ? null : analyzeMarkdown(input)), [input]);

  const rawRisky = useMemo(() => {
    if (input.trim() === '') return [];
    // 直接扫用户粘贴的原文，提示潜在 XSS 写法（不依赖渲染结果）。
    return scanRiskyMarkup(input);
  }, [input]);

  const backToMarkdown = useMemo(() => {
    if (cleaned === null) return '';
    if ('error' in cleaned) return '';
    try {
      return htmlToMarkdown(cleaned.html);
    } catch (error) {
      return `转换失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }, [cleaned]);

  // 清洗选项必须反映到 HTML 输出与预览上；清洗失败时退回净化结果。
  const finalHtml = useMemo(() => {
    if (cleaned === null) return html;
    if ('error' in cleaned) return html;
    return cleaned.html;
  }, [cleaned, html]);

  const output = useMemo(() => {
    if (tab === 'preview') return finalHtml;
    if (tab === 'html') return finalHtml;
    if (tab === 'toc') return toc;
    return backToMarkdown;
  }, [tab, finalHtml, toc, backToMarkdown]);

  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.md,.markdown,.txt,text/markdown,text/plain', multiple: false });
      const file = files[0];
      if (!file) return;
      setInput(await readAsText(file));
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (output === '') return;
    const ext = tab === 'html' ? 'html' : tab === 'back' ? 'md' : tab === 'toc' ? 'md' : 'html';
    const mime = ext === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8';
    downloadText(exportName('markdown', ext), output, mime);
  }, [output, tab]);

  const renderError = report !== null && 'error' in report ? report.error : null;
  const cleanError = cleaned !== null && 'error' in cleaned ? cleaned.error : null;

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <FileCode2 className="size-4" />
          Markdown 工具
        </span>
      }
      description="渲染预览、导出净化后的 HTML、生成目录并可反向转回 Markdown"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => void handlePick()} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={input === ''} />
        </>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MdTab)}>
        <TabsList>
          <TabsTrigger value="preview" active={tab === 'preview'}>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" />
              预览
            </span>
          </TabsTrigger>
          <TabsTrigger value="html" active={tab === 'html'}>
            <span className="inline-flex items-center gap-1">
              <Braces className="size-3.5" />
              HTML
            </span>
          </TabsTrigger>
          <TabsTrigger value="toc" active={tab === 'toc'}>
            <span className="inline-flex items-center gap-1">
              <ScrollText className="size-3.5" />
              目录
            </span>
          </TabsTrigger>
          <TabsTrigger value="back" active={tab === 'back'}>
            <span className="inline-flex items-center gap-1">
              <TableProperties className="size-3.5" />
              转回 MD
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
              <ClipboardPaste className="size-3.5" />
              示例
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴 Markdown 内容"
            spellCheck={false}
            aria-label="Markdown 输入"
            className="min-h-48 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" />
              {input.trim() === '' ? '等待输入' : `输入 ${formatBytes(new TextEncoder().encode(input).length)}`}
            </span>
            {fileNote && <span className="truncate">{fileNote}</span>}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          {tab === 'preview' ? (
            <div className="flex min-h-48 flex-1 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">渲染预览（已净化）</span>
              {html === '' ? (
                <EmptyHint>输入 Markdown 后在此预览渲染结果。</EmptyHint>
              ) : report !== null && !('error' in report) && report.escaped ? (
                <EmptyHint>检测到无法净化的危险内容，已整体转义为纯文本，请查看「HTML」页签。</EmptyHint>
              ) : (
                // HTML 已由 DOMPurify 清洗，这里仅输出已净化的片段。
                <div
                  className="prose-sm min-h-48 flex-1 overflow-auto rounded-md border p-3 text-sm leading-relaxed scrollbar-thin dark:prose-invert"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容经 DOMPurify.sanitize 白名单过滤后不含脚本与事件属性
                  dangerouslySetInnerHTML={{ __html: finalHtml }}
                />
              )}
            </div>
          ) : (
            <ResultBox
              label={tab === 'html' ? '净化后的 HTML' : tab === 'toc' ? '目录 Markdown' : '反向转换结果'}
              value={output}
              error={tab === 'html' ? (renderError ?? cleanError) : tab === 'back' ? cleanError : null}
              onCopy={() => copyText(output)}
              rows="min-h-48"
              fill
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={output === ''}>
              <Download className="size-3.5" />
              下载
            </Button>
            <Hint>
              {output === '' ? '没有可下载的内容。' : `输出 ${formatBytes(new TextEncoder().encode(output).length)}`}
            </Hint>
          </div>
        </div>
      </div>

      <Section title="渲染选项" description="影响所有输出页签">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox label="启用 GFM" checked={gfm} onChange={setGfm} hint="表格、删除线、任务列表、自动链接" />
          <Checkbox label="换行转 <br>" checked={breaks} onChange={setBreaks} hint="关闭时按 CommonMark 合并段落" />
          <Checkbox label="标题加锚点" checked={headingAnchors} onChange={setHeadingAnchors} hint="目录链接依赖锚点" />
        </div>
      </Section>

      <Section title="清洗选项" description="作用于「HTML」与「转回 MD」页签的输出">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Checkbox label="剔除图片" checked={stripImages} onChange={setStripImages} />
          <Checkbox
            label="剔除外链"
            checked={stripExternalLinks}
            onChange={setStripExternalLinks}
            hint="只保留站内地址与锚点"
          />
          <Checkbox label="图片懒加载" checked={lazyImages} onChange={setLazyImages} hint="补 loading 属性" />
          <Checkbox
            label="外链加 noopener"
            checked={hardenExternalLinks}
            onChange={setHardenExternalLinks}
            hint="补 rel 属性"
          />
        </div>
        {cleaned !== null && !('error' in cleaned) && (cleaned.removedImages > 0 || cleaned.removedLinks > 0) && (
          <Note tone="warn" title="清洗改动了内容">
            移除图片 {cleaned.removedImages} 张、移除链接 {cleaned.removedLinks} 个。
          </Note>
        )}
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="文档统计" description="字数、行数与元素数量">
          {stats === null ? (
            <EmptyHint>输入 Markdown 后显示统计信息。</EmptyHint>
          ) : (
            <StatGrid>
              <Stat label="字符数" value={stats.chars} />
              <Stat label="词数" value={stats.words} hint="中文按字计" />
              <Stat label="行数" value={stats.lines} />
              <Stat label="标题" value={stats.headings} />
              <Stat label="链接" value={stats.links} />
              <Stat label="图片" value={stats.images} />
              <Stat label="代码块" value={stats.codeBlocks} />
              <Stat label="目录条目" value={headings.length} />
            </StatGrid>
          )}
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="size-3.5" />
              安全检查
            </span>
          }
          description="渲染前的危险写法扫描"
        >
          {rawRisky.length === 0 ? (
            <Note tone="success" title="没有发现风险写法">
              原文里没有 script 标签、事件属性或 javascript: 链接。
            </Note>
          ) : (
            <div className="flex flex-col gap-2">
              {rawRisky.map((item) => (
                <Note key={item.kind} tone="warn" title={`${item.label} × ${item.count}`}>
                  {item.samples.map((sample) => sample).join('、')}
                </Note>
              ))}
            </div>
          )}
          {report !== null && !('error' in report) && report.escaped && (
            <Note tone="danger" title="净化不可用，已整体转义">
              运行环境缺少完整 DOM 实现，无法可靠过滤内容，因此整段 HTML 已按纯文本转义处理。
            </Note>
          )}
          {report !== null &&
            !('error' in report) &&
            !report.escaped &&
            (report.removedNodes > 0 || report.removedAttributes > 0) && (
              <Note tone="info" title="DOMPurify 已移除">
                节点 {report.removedNodes} 个、属性 {report.removedAttributes} 个。
              </Note>
            )}
        </Section>
      </div>

      {headings.length > 0 && (
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <ListTree className="size-3.5" />
              标题层级
            </span>
          }
          description="按出现顺序列出，锚点与目录链接一致"
        >
          <div className="max-h-48 overflow-auto rounded-md border scrollbar-thin">
            <ul className="divide-y">
              {headings.map((heading) => (
                <li
                  key={`${heading.level}:${heading.slug}`}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 text-xs"
                >
                  <span className="w-8 shrink-0 font-mono text-muted-foreground">H{heading.level}</span>
                  <span className="min-w-0 flex-1 truncate">{heading.text}</span>
                  <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">#{heading.slug}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      <Note tone="info" title="净化规则">
        <span className="inline-flex items-start gap-1">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" />
          所有输出先经过 DOMPurify 白名单过滤：script、iframe、object、embed、form、style 等标签被移除， on* 事件属性与
          javascript: 链接被丢弃。预览区直接渲染净化后的片段，导出的 HTML 也是同一份结果。
        </span>
      </Note>
    </ToolPanel>
  );
}
