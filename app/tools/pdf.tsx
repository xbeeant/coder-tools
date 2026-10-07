import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  Copy,
  Download,
  FileText,
  FlipHorizontal2,
  Images,
  Info,
  Loader2,
  Lock,
  RotateCw,
  Scissors,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatBytes } from '../lib/bytes';
import { baseName, downloadBlob, exportName, pickFile, pickFiles, readAsArrayBuffer } from '../lib/file';
import {
  applyMeta,
  cloneDoc,
  type EmbeddedImage,
  embeddedImageBytes,
  estimateMetadataBytes,
  extractImages,
  formatDate,
  getRotations,
  type LoadedPdf,
  loadPdf,
  MAX_PDF_BYTES,
  mergePdfs,
  OCR_TOOL_LINKS,
  PDF_PAGE_HINT,
  PDF_TOOL_LINKS,
  type PdfMeta,
  parsePageRanges,
  readMeta,
  removePages,
  reorderPages,
  resaveOptimized,
  rotatePages,
  splitPdf,
} from '../lib/pdf';

type TabId = 'merge' | 'split' | 'edit' | 'meta' | 'compress' | 'image' | 'security';

type SourceFile = { name: string; size: number; bytes: Uint8Array };

type PageInfo = { index: number; width: number; height: number; rotation: number };

const TABS: { id: TabId; label: string }[] = [
  { id: 'merge', label: '合并' },
  { id: 'split', label: '拆分' },
  { id: 'edit', label: '页面编辑' },
  { id: 'meta', label: '元数据' },
  { id: 'compress', label: '压缩' },
  { id: 'image', label: '图片' },
  { id: 'security', label: '加密与限制' },
];

const ROTATION_OPTIONS = ([0, 90, 180, 270] as const).map((value) => ({ value: String(value), label: `${value}°` }));

export default function PdfTool() {
  const [tab, setTab] = useState<TabId>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 合并
  const [mergeFiles, setMergeFiles] = useState<SourceFile[]>([]);
  const [mergeResult, setMergeResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);

  // 拆分
  const [splitBytes, setSplitBytes] = useState<Uint8Array | null>(null);
  const [splitName, setSplitName] = useState('');
  const [splitCount, setSplitCount] = useState(0);
  const [ranges, setRanges] = useState('1-2');
  const [splitParts, setSplitParts] = useState<{ name: string; label: string; size: number; bytes: Uint8Array }[]>([]);

  // 页面编辑
  const [editBytes, setEditBytes] = useState<Uint8Array | null>(null);
  const [editCount, setEditCount] = useState(0);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rotateTarget, setRotateTarget] = useState<'all' | 'selected'>('selected');
  const [rotateDelta, setRotateDelta] = useState('90');
  const [orderText, setOrderText] = useState('');
  const [editResult, setEditResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);

  // 元数据
  const [metaBytes, setMetaBytes] = useState<Uint8Array | null>(null);
  const [meta, setMeta] = useState<PdfMeta | null>(null);
  const [metaDraft, setMetaDraft] = useState({
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
  });
  const [metaEstimate, setMetaEstimate] = useState(0);
  const [metaResult, setMetaResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);

  // 压缩
  const [compressBytes, setCompressBytes] = useState<Uint8Array | null>(null);
  const [compressOriginal, setCompressOriginal] = useState(0);
  const [imageBytes, setImageBytes] = useState(0);
  const [resave, setResave] = useState<{ originalSize: number; newSize: number } | null>(null);
  const [resaveBytes, setResaveBytes] = useState<Uint8Array | null>(null);

  // 图片
  const [imageSrc, setImageSrc] = useState<Uint8Array | null>(null);
  const [imageSrcName, setImageSrcName] = useState('');
  const [images, setImages] = useState<EmbeddedImage[]>([]);
  const [imageBusy, setImageBusy] = useState(false);

  const pickPdf = useCallback(async () => {
    setError(null);
    setNotice(null);
    const file = await pickFile({ accept: 'application/pdf,.pdf' });
    if (!file) return null;
    if (file.size > MAX_PDF_BYTES) {
      setError(`文件超过 ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)}MB 上限，已拒绝处理`);
      return null;
    }
    const buffer = await readAsArrayBuffer(file);
    return new Uint8Array(buffer);
  }, []);

  /** 重新读取页数与旋转角，供每次变换后刷新页面列表。 */
  const refreshPages = useCallback(async (bytes: Uint8Array) => {
    try {
      const rotations = await getRotations(bytes);
      const doc = await cloneDoc(bytes);
      setPages(
        doc
          .getPages()
          .slice(0, 300)
          .map((page, index) => {
            const size = page.getSize();
            return {
              index,
              width: Math.round(size.width),
              height: Math.round(size.height),
              rotation: rotations[index] ?? 0,
            };
          }),
      );
    } catch {
      // 页面列表刷新失败不影响主流程，保留旧列表
    }
  }, []);

  const readPdf = async (bytes: Uint8Array, name: string, size: number) => {
    try {
      const loaded: LoadedPdf = await loadPdf(bytes, name, size);
      await refreshPages(bytes);
      return loaded;
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析 PDF 失败');
      return null;
    }
  };

  // ── 合并 ────────────────────────────────────────────────

  const addMergeFiles = async () => {
    setError(null);
    const files = await pickFiles({ accept: 'application/pdf,.pdf', multiple: true });
    if (files.length === 0) return;
    const loaded: SourceFile[] = [];
    for (const file of files) {
      if (file.size > MAX_PDF_BYTES) {
        setError(`${file.name} 超过 ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)}MB，已跳过`);
        continue;
      }
      const buffer = await readAsArrayBuffer(file);
      loaded.push({ name: file.name, size: file.size, bytes: new Uint8Array(buffer) });
    }
    setMergeFiles((prev) => [...prev, ...loaded]);
    setMergeResult(null);
  };

  const runMerge = async () => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await mergePdfs(mergeFiles);
      setMergeResult({ bytes, size: bytes.length });
      setNotice(`已合并 ${mergeFiles.length} 个文件，共 ${formatBytes(bytes.length)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '合并失败');
    } finally {
      setBusy(false);
    }
  };

  // ── 拆分 ────────────────────────────────────────────────

  const openSplit = async () => {
    const bytes = await pickPdf();
    if (!bytes) return;
    const loaded = await readPdf(bytes, 'source.pdf', bytes.length);
    if (!loaded) return;
    setSplitBytes(bytes);
    setSplitName('source.pdf');
    setSplitCount(loaded.pageCount);
    setRanges(`1-${Math.min(2, loaded.pageCount)}`);
    setSplitParts([]);
  };

  const runSplit = async () => {
    if (!splitBytes) return;
    setBusy(true);
    setError(null);
    try {
      const parts = await splitPdf(splitBytes, ranges);
      setSplitParts(parts.map((part) => ({ ...part, size: part.bytes.length })));
      setNotice(`已拆分为 ${parts.length} 个文件`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拆分失败');
    } finally {
      setBusy(false);
    }
  };

  const runSplitZip = async () => {
    if (splitParts.length === 0) return;
    setBusy(true);
    try {
      const [{ default: JSZip }, base] = await Promise.all([
        import('jszip'),
        Promise.resolve(baseName(splitName) || 'split'),
      ]);
      const zip = new JSZip();
      for (const part of splitParts) zip.file(part.name, part.bytes);
      downloadBlob(exportName(base, 'zip'), await zip.generateAsync({ type: 'blob' }));
    } finally {
      setBusy(false);
    }
  };

  // ── 页面编辑 ────────────────────────────────────────────

  const openEdit = async () => {
    const bytes = await pickPdf();
    if (!bytes) return;
    const loaded = await readPdf(bytes, 'source.pdf', bytes.length);
    if (!loaded) return;
    setEditBytes(bytes);
    setEditCount(loaded.pageCount);
    setSelected(new Set());
    setEditResult(null);
    setOrderText('');
  };

  const togglePage = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const runRemove = async () => {
    if (!editBytes || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const count = selected.size;
      const bytes = await removePages(editBytes, [...selected]);
      setEditBytes(bytes);
      setEditResult({ bytes, size: bytes.length });
      setEditCount((prev) => Math.max(0, prev - count));
      setSelected(new Set());
      await refreshPages(bytes);
      setNotice(`已删除 ${count} 页`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const runRotate = async () => {
    if (!editBytes) return;
    setBusy(true);
    setError(null);
    try {
      const indices = rotateTarget === 'selected' ? [...selected] : [];
      if (rotateTarget === 'selected' && indices.length === 0) throw new Error('请先选择要旋转的页面');
      const bytes = await rotatePages(editBytes, Number(rotateDelta), indices);
      setEditBytes(bytes);
      setEditResult({ bytes, size: bytes.length });
      await refreshPages(bytes);
      setNotice(rotateTarget === 'selected' ? `已旋转 ${indices.length} 页` : '已旋转全部页面');
    } catch (err) {
      setError(err instanceof Error ? err.message : '旋转失败');
    } finally {
      setBusy(false);
    }
  };

  const runReorder = async () => {
    if (!editBytes) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = parsePageRanges(orderText, editCount, 'sorted');
      if (parsed.error) throw new Error(parsed.error);
      // 重排必须是完整排列，否则页数会变化，pdf-lib 的重排语义不适用
      const order = orderText.trim() ? parsed.pages : [...Array(editCount).keys()];
      if (order.length !== editCount)
        throw new Error(`重排需要覆盖全部 ${editCount} 页，当前只填了 ${order.length} 页`);
      const bytes = await reorderPages(editBytes, order);
      setEditBytes(bytes);
      setEditResult({ bytes, size: bytes.length });
      await refreshPages(bytes);
      setNotice(`已按「${orderText}」重排`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重排失败');
    } finally {
      setBusy(false);
    }
  };

  const runRotateAll = async (delta: number) => {
    if (!editBytes) return;
    setBusy(true);
    try {
      const bytes = await rotatePages(editBytes, delta, []);
      setEditBytes(bytes);
      setEditResult({ bytes, size: bytes.length });
      await refreshPages(bytes);
    } finally {
      setBusy(false);
    }
  };

  // ── 元数据 ──────────────────────────────────────────────

  const openMeta = async () => {
    const bytes = await pickPdf();
    if (!bytes) return;
    setMetaBytes(bytes);
    setMetaResult(null);
    setMetaEstimate(estimateMetadataBytes(bytes));
    try {
      const doc = await cloneDoc(bytes);
      const info = readMeta(doc);
      setMeta(info);
      setMetaDraft({
        title: info.title,
        author: info.author,
        subject: info.subject,
        keywords: info.keywords,
        creator: info.creator,
        producer: info.producer,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取元数据失败');
    }
  };

  const runApplyMeta = async () => {
    if (!metaBytes) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await cloneDoc(metaBytes);
      applyMeta(doc, metaDraft);
      const bytes = await doc.save({ useObjectStreams: true });
      setMetaBytes(bytes);
      setMetaResult({ bytes, size: bytes.length });
      setMetaEstimate(estimateMetadataBytes(bytes));
      setMeta(readMeta(doc));
      setNotice('元数据已写入，记得下载保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入失败');
    } finally {
      setBusy(false);
    }
  };

  const runStripMeta = async () => {
    if (!metaBytes) return;
    setBusy(true);
    try {
      const doc = await cloneDoc(metaBytes);
      applyMeta(doc, { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
      const bytes = await doc.save({ useObjectStreams: true });
      setMetaBytes(bytes);
      setMetaResult({ bytes, size: bytes.length });
      setMetaDraft({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
      setMetaEstimate(estimateMetadataBytes(bytes));
      setNotice('已清空元数据');
    } finally {
      setBusy(false);
    }
  };

  // ── 压缩 ────────────────────────────────────────────────

  const openCompress = async () => {
    const bytes = await pickPdf();
    if (!bytes) return;
    setCompressBytes(bytes);
    setCompressOriginal(bytes.length);
    setResave(null);
    setResaveBytes(null);
    setImageBusy(true);
    try {
      const total = await embeddedImageBytes(bytes);
      setImageBytes(total);
    } catch {
      setImageBytes(0);
    } finally {
      setImageBusy(false);
    }
  };

  const runResave = async () => {
    if (!compressBytes) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resaveOptimized(compressBytes);
      setResave({ originalSize: result.originalSize, newSize: result.newSize });
      setResaveBytes(result.bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新保存失败');
    } finally {
      setBusy(false);
    }
  };

  // ── 图片 ────────────────────────────────────────────────

  const openImages = async () => {
    const bytes = await pickPdf();
    if (!bytes) return;
    setImageSrc(bytes);
    setImageSrcName('source.pdf');
    setImageBusy(true);
    setError(null);
    try {
      const found = await extractImages(bytes, 200);
      setImages(found);
      setNotice(`提取到 ${found.length} 张内嵌图片`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取图片失败');
    } finally {
      setImageBusy(false);
    }
  };

  const imageTotal = useMemo(() => images.reduce((sum, item) => sum + item.bytes.length, 0), [images]);

  const runDownloadImagesZip = async () => {
    if (images.length === 0) return;
    setImageBusy(true);
    try {
      const [{ default: JSZip }, base] = await Promise.all([
        import('jszip'),
        Promise.resolve(baseName(imageSrcName) || 'images'),
      ]);
      const zip = new JSZip();
      for (const item of images) {
        zip.file(`page-${String(item.pageIndex + 1).padStart(3, '0')}-${item.indexInPage}.${item.ext}`, item.bytes);
      }
      downloadBlob(exportName(base, 'zip'), await zip.generateAsync({ type: 'blob' }));
    } finally {
      setImageBusy(false);
    }
  };

  const savePdf = (bytes: Uint8Array, prefix: string) => {
    downloadBlob(`${prefix}-${Date.now()}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  };

  return (
    <ToolPanel
      title="PDF 处理"
      description="合并、拆分、页面编辑、元数据、体积估算与内嵌图片提取，全部在浏览器内完成"
      actions={
        <span className="text-[11px] text-muted-foreground">
          上限 {formatBytes(MAX_PDF_BYTES)} · 超过 {PDF_PAGE_HINT} 页会明显变慢
        </span>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && <Note tone="danger">{error}</Note>}
      {notice && <Note tone="success">{notice}</Note>}

      {tab === 'merge' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="待合并文件"
            description="按列表顺序拼接，可拖动行调整"
            actions={
              <Button size="sm" variant="outline" onClick={() => void addMergeFiles()}>
                <FileText className="size-3.5" />
                添加
              </Button>
            }
          >
            {mergeFiles.length === 0 ? (
              <EmptyHint>至少选择 2 个 PDF</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1">
                {mergeFiles.map((file, index) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: 合并列表按序号编排，索引即稳定标识
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px]"
                  >
                    <span className="shrink-0 font-mono text-muted-foreground">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{formatBytes(file.size)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => setMergeFiles((prev) => prev.filter((_, i) => i !== index - 1))}
                      aria-label={`上移 ${file.name}`}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === mergeFiles.length - 1}
                      onClick={() => setMergeFiles((prev) => prev.filter((_, i) => i !== index + 1))}
                      aria-label={`下移 ${file.name}`}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMergeFiles((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`移除 ${file.name}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" onClick={() => void runMerge()} disabled={busy || mergeFiles.length < 2}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
              合并
            </Button>
          </Section>

          <div className="flex flex-col gap-2.5">
            <StatGrid>
              <Stat label="文件数" value={String(mergeFiles.length)} />
              <Stat label="总大小" value={formatBytes(mergeFiles.reduce((sum, f) => sum + f.size, 0))} />
              <Stat label="合并结果" value={mergeResult ? formatBytes(mergeResult.size) : '—'} />
              <Stat
                label="变化"
                value={
                  mergeResult
                    ? `${(
                        ((mergeResult.size - mergeFiles.reduce((sum, f) => sum + f.size, 0)) /
                          Math.max(
                            1,
                            mergeFiles.reduce((sum, f) => sum + f.size, 0),
                          )) *
                          100
                      ).toFixed(1)}%`
                    : '—'
                }
                tone={
                  mergeResult && mergeResult.size <= mergeFiles.reduce((sum, f) => sum + f.size, 0) ? 'success' : 'warn'
                }
              />
            </StatGrid>
            {mergeResult && (
              <Button size="sm" onClick={() => savePdf(mergeResult.bytes, 'merged')}>
                <Download className="size-3.5" />
                下载合并结果
              </Button>
            )}
            <Section title="说明">
              <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                <li>合并会按列表顺序复制全部页面，页数超过 500 页时可能需要十几秒。</li>
                <li>输出统一开启对象流（useObjectStreams），体积通常更小。</li>
                <li>加密 PDF 若使用非空口令，本工具无法读取，请先用 qpdf 解密。</li>
              </ul>
            </Section>
          </div>
        </div>
      )}

      {tab === 'split' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="拆分"
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => void openSplit()}>
                  <FileText className="size-3.5" />
                  选择 PDF
                </Button>
                <Button size="sm" onClick={() => void runSplit()} disabled={busy || !splitBytes}>
                  <Scissors className="size-3.5" />
                  拆分
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void runSplitZip()}
                  disabled={busy || splitParts.length === 0}
                >
                  <Download className="size-3.5" />
                  打包下载
                </Button>
              </>
            }
          >
            {splitBytes ? (
              <>
                <StatGrid>
                  <Stat label="源文件" value={splitName} />
                  <Stat label="总页数" value={String(splitCount)} />
                  <Stat label="源大小" value={formatBytes(splitBytes.length)} />
                  <Stat label="输出数" value={String(splitParts.length)} />
                </StatGrid>
                <TextField
                  label="页码范围"
                  value={ranges}
                  onChange={setRanges}
                  placeholder="1-3,5,8-10"
                  hint="逗号分隔，每段生成一个 PDF；每段内部按升序"
                />
              </>
            ) : (
              <EmptyHint>先选择一个 PDF 文件</EmptyHint>
            )}
          </Section>

          <Section title="输出文件" description="逐个下载或一次性打包成 zip">
            {splitParts.length === 0 ? (
              <EmptyHint>尚无输出</EmptyHint>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
                {splitParts.map((part) => (
                  <li
                    key={part.name}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono">{part.name}</span>
                      <span className="ml-1.5 text-muted-foreground">第 {part.label} 页</span>
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">{formatBytes(part.size)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => savePdf(part.bytes, part.name.replace('.pdf', ''))}
                      aria-label={`下载 ${part.name}`}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === 'edit' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="页面编辑"
            description="勾选页面后可删除或旋转"
            actions={
              <Button size="sm" variant="outline" onClick={() => void openEdit()}>
                <FileText className="size-3.5" />
                选择 PDF
              </Button>
            }
          >
            {!editBytes ? (
              <EmptyHint>先选择一个 PDF 文件</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat label="页数" value={String(editCount)} />
                  <Stat label="已选" value={String(selected.size)} />
                  <Stat label="当前大小" value={formatBytes(editBytes.length)} />
                  <Stat label="输出大小" value={editResult ? formatBytes(editResult.size) : '—'} />
                </StatGrid>

                <div className="flex flex-wrap gap-1.5">
                  <Select
                    label="旋转范围"
                    value={rotateTarget}
                    onChange={(value) => setRotateTarget(value as 'all' | 'selected')}
                    options={[
                      { value: 'selected', label: '仅选中页' },
                      { value: 'all', label: '全部页面' },
                    ]}
                    className="w-32"
                  />
                  <Select
                    label="角度"
                    value={rotateDelta}
                    onChange={setRotateDelta}
                    options={ROTATION_OPTIONS}
                    className="w-20"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-end"
                    onClick={() => void runRotate()}
                    disabled={busy}
                  >
                    <RotateCw className="size-3.5" />
                    旋转
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void runRemove()}
                    disabled={busy || selected.size === 0}
                  >
                    <Trash2 className="size-3.5" />
                    删除选中
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void runRotateAll(90)} disabled={busy}>
                    <RotateCw className="size-3.5" />
                    全部 +90°
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void runRotateAll(-90)} disabled={busy}>
                    <FlipHorizontal2 className="size-3.5" />
                    全部 -90°
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(selected.size === pages.length ? new Set() : new Set(pages.map((p) => p.index)))
                    }
                  >
                    {selected.size === pages.length ? '取消全选' : '全选'}
                  </Button>
                </div>

                <div className="flex items-end gap-2">
                  <TextField
                    className="flex-1"
                    label="重排顺序"
                    value={orderText}
                    onChange={setOrderText}
                    placeholder="3,1,2,4-10"
                    hint={`留空表示保持原顺序；必须覆盖全部 ${editCount} 页，缺页或多页都会报错`}
                  />
                  <Button size="sm" variant="outline" onClick={() => void runReorder()} disabled={busy}>
                    应用重排
                  </Button>
                </div>

                {editResult && (
                  <Button size="sm" onClick={() => savePdf(editResult.bytes, 'edited')}>
                    <Download className="size-3.5" />
                    下载结果
                  </Button>
                )}
              </>
            )}
          </Section>

          <Section title="页面列表" description={pages.length >= 300 ? '仅显示前 300 页' : undefined}>
            {pages.length === 0 ? (
              <EmptyHint>未加载页面</EmptyHint>
            ) : (
              <ul className="grid max-h-80 grid-cols-3 gap-1 overflow-auto sm:grid-cols-4">
                {pages.map((page) => (
                  <li key={page.index}>
                    <button
                      type="button"
                      onClick={() => togglePage(page.index)}
                      aria-pressed={selected.has(page.index)}
                      aria-label={`第 ${page.index + 1} 页${selected.has(page.index) ? '，已选中' : ''}`}
                      className={`flex w-full flex-col items-center gap-0.5 rounded border px-1 py-1.5 text-[10px] transition-colors ${
                        selected.has(page.index) ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <span className="font-mono font-medium">{page.index + 1}</span>
                      <span className="text-muted-foreground">
                        {page.width}×{page.height}
                      </span>
                      {page.rotation !== 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                          <RotateCw className="size-2.5" />
                          {page.rotation}°
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === 'meta' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="文档信息"
            actions={
              <Button size="sm" variant="outline" onClick={() => void openMeta()}>
                <Info className="size-3.5" />
                选择 PDF
              </Button>
            }
          >
            {!meta ? (
              <EmptyHint>先选择一个 PDF 文件</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat label="页数" value={String(meta.pageCount)} />
                  <Stat label="源大小" value={metaBytes ? formatBytes(metaBytes.length) : '—'} />
                  <Stat label="元数据估算" value={formatBytes(metaEstimate)} />
                  <Stat label="输出大小" value={metaResult ? formatBytes(metaResult.size) : '—'} />
                </StatGrid>
                <TextField
                  label="标题"
                  value={metaDraft.title}
                  onChange={(title) => setMetaDraft((prev) => ({ ...prev, title }))}
                />
                <TextField
                  label="作者"
                  value={metaDraft.author}
                  onChange={(author) => setMetaDraft((prev) => ({ ...prev, author }))}
                />
                <TextField
                  label="主题"
                  value={metaDraft.subject}
                  onChange={(subject) => setMetaDraft((prev) => ({ ...prev, subject }))}
                />
                <TextField
                  label="关键词"
                  value={metaDraft.keywords}
                  onChange={(keywords) => setMetaDraft((prev) => ({ ...prev, keywords }))}
                  hint="逗号分隔"
                />
                <TextField
                  label="创建工具"
                  value={metaDraft.creator}
                  onChange={(creator) => setMetaDraft((prev) => ({ ...prev, creator }))}
                />
                <TextField
                  label="生成器"
                  value={metaDraft.producer}
                  onChange={(producer) => setMetaDraft((prev) => ({ ...prev, producer }))}
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => void runApplyMeta()} disabled={busy}>
                    <Settings2 className="size-3.5" />
                    应用修改
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void runStripMeta()} disabled={busy}>
                    <Ban className="size-3.5" />
                    清空元数据
                  </Button>
                  {metaResult && (
                    <Button size="sm" variant="ghost" onClick={() => savePdf(metaResult.bytes, 'meta')}>
                      <Download className="size-3.5" />
                      下载
                    </Button>
                  )}
                </div>
              </>
            )}
          </Section>

          <div className="flex flex-col gap-2.5">
            <Section title="原始元数据">
              {meta ? (
                <ResultBox
                  label="只读"
                  rows="min-h-40"
                  onCopy={() =>
                    void copyText(
                      JSON.stringify(
                        {
                          title: meta.title,
                          author: meta.author,
                          subject: meta.subject,
                          keywords: meta.keywords,
                          creator: meta.creator,
                          producer: meta.producer,
                          creationDate: formatDate(meta.creationDate),
                          modificationDate: formatDate(meta.modificationDate),
                          pageCount: meta.pageCount,
                          pageSizes: meta.pageSizes,
                        },
                        null,
                        2,
                      ),
                    )
                  }
                  value={JSON.stringify(
                    {
                      标题: meta.title || '（空）',
                      作者: meta.author || '（空）',
                      主题: meta.subject || '（空）',
                      关键词: meta.keywords || '（空）',
                      创建工具: meta.creator || '（空）',
                      生成器: meta.producer || '（空）',
                      创建时间: formatDate(meta.creationDate),
                      修改时间: formatDate(meta.modificationDate),
                      页数: meta.pageCount,
                      页面尺寸: meta.pageSizes,
                    },
                    null,
                    2,
                  )}
                />
              ) : (
                <EmptyHint>未加载</EmptyHint>
              )}
            </Section>
            <Note tone="info">
              <strong>去元数据说明：</strong>
              「清空元数据」只会改写 Info 字典与 XMP 中的文本字段，无法删除
              GPS、相机型号等嵌入内容。要彻底去除痕迹，推荐用
              <code> exiftool -all= in.pdf</code> 或 <code>qpdf --remove-page-labels</code> 在本地命令行处理。
            </Note>
          </div>
        </div>
      )}

      {tab === 'compress' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="体积优化"
            description="重新序列化并开启对象流，如实对比前后体积"
            actions={
              <Button size="sm" variant="outline" onClick={() => void openCompress()}>
                <FileText className="size-3.5" />
                选择 PDF
              </Button>
            }
          >
            {!compressBytes ? (
              <EmptyHint>先选择一个 PDF 文件</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat label="原大小" value={formatBytes(compressOriginal)} />
                  <Stat label="重存后" value={resave ? formatBytes(resave.newSize) : '—'} />
                  <Stat
                    label="节省"
                    value={
                      resave
                        ? `${(((resave.originalSize - resave.newSize) / Math.max(1, resave.originalSize)) * 100).toFixed(1)}%`
                        : '—'
                    }
                    tone={resave && resave.newSize < resave.originalSize ? 'success' : resave ? 'warn' : 'info'}
                  />
                  <Stat label="内嵌图片" value={imageBusy ? '统计中…' : formatBytes(imageBytes)} />
                </StatGrid>
                <Button size="sm" onClick={() => void runResave()} disabled={busy}>
                  <Settings2 className="size-3.5" />
                  重新保存并对比
                </Button>
                {resaveBytes && (
                  <Button size="sm" variant="outline" onClick={() => savePdf(resaveBytes, 'optimized')}>
                    <Download className="size-3.5" />
                    下载优化结果
                  </Button>
                )}
                <Hint>
                  对象流重存对「元数据多、图片已压缩」的 PDF
                  效果明显；若文件以扫描图为主，重存后往往反而变大，这时应改用下方外部工具命令。
                </Hint>
              </>
            )}
          </Section>

          <Section title="外部命令" description="需要本地安装 qpdf 或 Ghostscript">
            <div className="flex flex-col gap-2">
              {[
                {
                  title: 'qpdf 生成对象流 + 重压缩',
                  code: 'qpdf --object-streams=generate --recompress-flate in.pdf out.pdf',
                },
                { title: 'qpdf 线性化（加快首屏）', code: 'qpdf --linearize in.pdf out.pdf' },
                {
                  title: 'Ghostscript 电子书级',
                  code: 'gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -sOutputFile=out.pdf in.pdf',
                },
                {
                  title: 'Ghostscript 屏幕级',
                  code: 'gs -sDEVICE=pdfwrite -dPDFSETTINGS=/screen -sOutputFile=out.pdf in.pdf',
                },
                { title: 'pdfimages 导出内嵌图片', code: 'pdfimages -png in.pdf out' },
              ].map((item) => (
                <div key={item.code} className="rounded border">
                  <button
                    type="button"
                    onClick={() => void copyText(item.code)}
                    aria-label={`复制命令：${item.title}`}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] font-medium"
                  >
                    <span>{item.title}</span>
                    <Check className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                  <Textarea
                    readOnly
                    value={item.code}
                    className="resize-none rounded-none border-0 border-t font-mono text-[11px]"
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <LinkList items={PDF_TOOL_LINKS.map((item) => ({ ...item, url: item.url }))} />
          </Section>
        </div>
      )}

      {tab === 'image' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="内嵌图片提取"
            description="按页提取位图，最多 200 张"
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => void openImages()}>
                  <Images className="size-3.5" />
                  选择 PDF
                </Button>
                <Button
                  size="sm"
                  onClick={() => void runDownloadImagesZip()}
                  disabled={imageBusy || images.length === 0}
                >
                  <Download className="size-3.5" />
                  全部打包
                </Button>
              </>
            }
          >
            {!imageSrc ? (
              <EmptyHint>先选择一个 PDF 文件</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat label="图片数" value={String(images.length)} />
                  <Stat label="原始合计" value={formatBytes(imageTotal)} />
                  <Stat label="PDF 大小" value={formatBytes(imageSrc.length)} />
                  <Stat
                    label="图片占比"
                    value={imageSrc.length > 0 ? `${((imageTotal / imageSrc.length) * 100).toFixed(1)}%` : '—'}
                  />
                </StatGrid>
                <Hint>
                  若图片占比很高，说明文件体积主要来自图片而非字体或元数据。此时把图片导出后用 squoosh / sharp
                  二次压缩，再回填 PDF 收益最大。
                </Hint>
              </>
            )}
          </Section>

          <Section title="图片列表" description="按原始位图原样导出，不做二次编码">
            {imageBusy ? (
              <EmptyHint>提取中…</EmptyHint>
            ) : images.length === 0 ? (
              <EmptyHint>{imageSrc ? '该 PDF 没有可提取的位图（可能是纯矢量）' : '未加载'}</EmptyHint>
            ) : (
              <ul className="grid max-h-72 grid-cols-2 gap-1.5 overflow-auto sm:grid-cols-3">
                {images.map((item) => {
                  const url = URL.createObjectURL(
                    new Blob([item.bytes as BlobPart], { type: item.ext === 'jpg' ? 'image/jpeg' : 'image/png' }),
                  );
                  return (
                    <li
                      key={`${item.pageIndex}-${item.indexInPage}`}
                      className="flex flex-col gap-1 rounded border p-1"
                    >
                      <img
                        src={url}
                        alt={`第 ${item.pageIndex + 1} 页第 ${item.indexInPage + 1} 张图片`}
                        className="h-20 w-full rounded bg-muted object-contain"
                        onLoad={() => setTimeout(() => URL.revokeObjectURL(url), 0)}
                      />
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        p{item.pageIndex + 1}#{item.indexInPage + 1} · {formatBytes(item.bytes.length)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          downloadBlob(
                            `page-${String(item.pageIndex + 1).padStart(3, '0')}-${item.indexInPage}.${item.ext}`,
                            new Blob([item.bytes as BlobPart], {
                              type: item.ext === 'jpg' ? 'image/jpeg' : 'image/png',
                            }),
                          )
                        }
                        aria-label={`下载第 ${item.pageIndex + 1} 页第 ${item.indexInPage + 1} 张图片`}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="加密与权限限制">
            <Note tone="warn">
              <strong>本工具无法写入 PDF 打开密码。</strong>
              <code>pdf-lib</code>{' '}
              只能读取允许加密的文档，不支持创建加密或权限限制。如果需要「打开需要口令」或「禁止复制 / 打印」，
              请在本地用 qpdf 处理：
            </Note>
            <div className="flex flex-col gap-2">
              {[
                {
                  title: '设置打开密码（AES-256）',
                  code: 'qpdf --encrypt user owner 256 -- in.pdf out.pdf',
                  note: 'user 是打开密码，owner 是权限口令',
                },
                {
                  title: '仅限制操作（保留可打开）',
                  code: 'qpdf --print=none --modify=none --extract=n -- in.pdf out.pdf',
                  note: '禁止打印、编辑与提取',
                },
                {
                  title: '移除打开密码',
                  code: 'qpdf --password= --decrypt in.pdf out.pdf',
                  note: '需知道原口令或为空口令文档',
                },
              ].map((item) => (
                <div key={item.code} className="rounded border">
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <span className="text-[11px] font-medium">{item.title}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyText(item.code)}
                      aria-label={`复制命令：${item.title}`}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={item.code}
                    className="resize-none rounded-none border-0 border-t font-mono text-[11px]"
                    rows={2}
                  />
                  <p className="border-t px-2 py-1 text-[10px] text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </div>
          </Section>

          <div className="flex flex-col gap-2.5">
            <Section title="外部工具" description="加密、OCR 与深度压缩">
              <LinkList items={PDF_TOOL_LINKS.map((item) => ({ ...item, url: item.url }))} />
            </Section>
            <Section title="OCR 说明">
              <Note tone="info">
                扫描件 PDF 没有文本层，本工具<strong>不内置 OCR</strong>
                。可先用下方工具生成可搜索文本层，或在外部完成后再用本工具拆分 / 合并。
              </Note>
              <LinkList items={OCR_TOOL_LINKS.map((item) => ({ ...item, url: item.url }))} />
            </Section>
            <Note tone="warn">
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" />
                处理含敏感信息的 PDF 时，请优先使用本地命令行工具，避免上传到任何在线服务。
              </span>
            </Note>
          </div>
        </div>
      )}
    </ToolPanel>
  );
}
