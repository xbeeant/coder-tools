/** PDF 处理核心：全部基于 pdf-lib，纯函数，不依赖 React。 */

import { degrees, PDFDict, PDFDocument, PDFName, type PDFPage, PDFRawStream, type Rotation } from 'pdf-lib';

/** 把 PDFName / PDFHexString 之类统一转成可比较的字符串。 */
function toNameString(value: unknown): string {
  const candidate = value as { asString?: () => string } | undefined;
  return typeof candidate?.asString === 'function' ? candidate.asString() : '';
}

/** pdf-lib 类型与部分旧版本不完全一致，这里统一收敛成字符串。 */
function normalizeKeywords(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ');
  return typeof value === 'string' ? value : '';
}

/** 单文件大小上限，超出直接拒绝。 */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** 页数提示阈值：超过后合并/拆分速度会明显下降。 */
export const PDF_PAGE_HINT = 500;

export const PDF_ROTATIONS = [0, 90, 180, 270] as const;

export interface LoadedPdf {
  doc: PDFDocument;
  name: string;
  size: number;
  pageCount: number;
}

export function loadPdfOptions(): { ignoreEncryption: boolean; updateMetadata: boolean } {
  // ignoreEncryption: 部分 PDF 使用空口令加密，允许读取以便另存；
  // updateMetadata: false 避免每次加载都改动元数据。
  return { ignoreEncryption: true, updateMetadata: false };
}

export async function loadPdf(bytes: Uint8Array, name: string, size: number): Promise<LoadedPdf> {
  if (size > MAX_PDF_BYTES) {
    throw new Error(`文件超过 ${(MAX_PDF_BYTES / 1024 / 1024).toFixed(0)}MB 上限，已拒绝处理`);
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, loadPdfOptions());
  } catch (error) {
    throw new Error(`PDF 解析失败：${error instanceof Error ? error.message : '文件可能已损坏'}`);
  }
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error('PDF 中没有任何页面');
  return { doc, name, size, pageCount };
}

export interface PdfMeta {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: Date | null;
  modificationDate: Date | null;
  pageCount: number;
  /** 各页尺寸文本，例如 595.28 × 841.89 (A4) */
  pageSizes: string[];
}

function pageSizeLabel(width: number, height: number): string {
  const w = Math.round(width * 100) / 100;
  const h = Math.round(height * 100) / 100;
  const near = (value: number, target: number) => Math.abs(value - target) < 3;
  if (near(w, 595.28) && near(h, 841.89)) return `${w} × ${h}（A4 纵向）`;
  if (near(w, 841.89) && near(h, 595.28)) return `${w} × ${h}（A4 横向）`;
  if (near(w, 612) && near(h, 792)) return `${w} × ${h}（US Letter）`;
  if (near(w, 792) && near(h, 612)) return `${w} × ${h}（US Letter 横向）`;
  if (near(w, 595.28) && near(h, 419.53)) return `${w} × ${h}（A5 横向）`;
  return `${w} × ${h}`;
}

export function readMeta(doc: PDFDocument, maxPages = 20): PdfMeta {
  const pages = doc.getPages();
  const pageSizes: string[] = [];
  for (let i = 0; i < Math.min(pages.length, maxPages); i++) {
    const size = pages[i].getSize();
    pageSizes.push(pageSizeLabel(size.width, size.height));
  }
  if (pages.length > maxPages) pageSizes.push(`…共 ${pages.length} 页，仅列出前 ${maxPages} 页`);
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: normalizeKeywords(doc.getKeywords()),
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: doc.getCreationDate() ?? null,
    modificationDate: doc.getModificationDate() ?? null,
    pageCount: pages.length,
    pageSizes,
  };
}

export function applyMeta(
  doc: PDFDocument,
  meta: Partial<Pick<PdfMeta, 'title' | 'author' | 'subject' | 'keywords' | 'creator' | 'producer'>>,
): void {
  if (meta.title !== undefined) doc.setTitle(meta.title);
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  if (meta.keywords !== undefined)
    doc.setKeywords(
      meta.keywords
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean),
    );
  if (meta.creator !== undefined) doc.setCreator(meta.creator);
  if (meta.producer !== undefined) doc.setProducer(meta.producer);
}

export function formatDate(date: Date | null): string {
  if (!date) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** 复制一页到目标文档（用于拆分）。 */
export async function copyPageTo(source: PDFDocument, index: number, target: PDFDocument): Promise<void> {
  const [copied] = await target.copyPages(source, [index]);
  target.addPage(copied);
}

// ── 页码范围解析 ────────────────────────────────────────────

export interface PageRangeResult {
  /** 每段对应的 0 基页码索引 */
  groups: number[][];
  /** 展开后的全部页码索引（去重、升序） */
  pages: number[];
  error?: string;
}

/**
 * 解析 "1-3,5,8-10" 形式的页码范围。
 * alsoReturnSorted: true 时额外返回升序去重的全部页码（删除/重排用）。
 */
export function parsePageRanges(
  input: string,
  pageCount: number,
  mode: 'groups' | 'sorted' = 'groups',
): PageRangeResult {
  const groups: number[][] = [];
  const collected = new Set<number>();
  const bounded = Number.isFinite(pageCount);
  const text = input.trim();
  if (!text) return { groups, pages: [], error: '页码范围不能为空' };

  for (const rawSegment of text.split(/[,，\s]+/).filter(Boolean)) {
    const segment = rawSegment.trim();
    const match = /^(\d+)\s*(?:[-~—]\s*(\d+))?$/.exec(segment);
    if (!match) return { groups, pages: [], error: `无法识别的片段「${segment}」，示例：1-3,5,8-10` };
    const start = Number.parseInt(match[1], 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : start;
    if (start < 1 || end < 1) return { groups, pages: [], error: `页码从 1 开始，「${segment}」无效` };
    if (bounded && (start > pageCount || end > pageCount)) {
      return { groups, pages: [], error: `页码 ${Math.max(start, end)} 超出范围（共 ${pageCount} 页）` };
    }
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const pages: number[] = [];
    for (let page = from; page <= to; page++) {
      pages.push(page - 1);
      collected.add(page - 1);
    }
    groups.push(pages);
  }

  const sorted = [...collected].sort((a, b) => a - b);
  return mode === 'sorted' ? { groups, pages: sorted } : { groups, pages: sorted };
}

// ── 合并 ────────────────────────────────────────────────────

export interface MergeSource {
  bytes: Uint8Array;
  name: string;
  size: number;
}

/** 按列表顺序合并多个 PDF。 */
export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  if (sources.length < 2) throw new Error('至少需要 2 个 PDF 文件才能合并');
  const merged = await PDFDocument.create();
  for (const source of sources) {
    const doc = await PDFDocument.load(source.bytes, loadPdfOptions());
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save({ useObjectStreams: true });
}

// ── 拆分 ────────────────────────────────────────────────────

export interface SplitPart {
  name: string;
  bytes: Uint8Array;
  /** 原始 1 基页码，例如 "1-3" 或 "5" */
  label: string;
}

/** 按范围拆分：每个片段独立成一个 PDF。 */
export async function splitPdf(source: Uint8Array, ranges: string): Promise<SplitPart[]> {
  // 先不带上限解析，具体范围在拿到页数后再校验
  const parsed = parsePageRanges(ranges, Number.POSITIVE_INFINITY);
  if (parsed.groups.length === 0) throw new Error(parsed.error ?? '页码范围不能为空');

  const doc = await PDFDocument.load(source, loadPdfOptions());
  const parts: SplitPart[] = [];
  for (let i = 0; i < parsed.groups.length; i++) {
    const group = parsed.groups[i];
    if (group.some((page) => page >= doc.getPageCount())) {
      throw new Error(`第 ${i + 1} 段包含超出范围的页码（当前共 ${doc.getPageCount()} 页）`);
    }
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, group);
    for (const page of copied) out.addPage(page);
    parts.push({
      name: `part-${String(i + 1).padStart(2, '0')}.pdf`,
      bytes: await out.save({ useObjectStreams: true }),
      label: group.map((page) => page + 1).join(','),
    });
  }
  return parts;
}

// ── 删除 / 重排 / 旋转 ───────────────────────────────────────

/** 删除指定页（0 基索引），返回新文档的字节。 */
export async function removePages(source: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, loadPdfOptions());
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  for (const index of sorted) {
    if (index < 0 || index >= doc.getPageCount()) continue;
    doc.removePage(index);
  }
  if (doc.getPageCount() === 0) throw new Error('删除后已无剩余页面');
  return doc.save({ useObjectStreams: true });
}

/** 按给定顺序重排页面（0 基索引数组）。 */
export async function reorderPages(source: Uint8Array, order: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, loadPdfOptions());
  const total = doc.getPageCount();
  if (order.length !== total) throw new Error(`重排列表长度应为 ${total}，当前为 ${order.length}`);
  const seen = new Set<number>();
  for (const index of order) {
    if (index < 0 || index >= total) throw new Error(`页码索引 ${index} 超出范围`);
    if (seen.has(index)) throw new Error(`页码 ${index + 1} 重复出现`);
    seen.add(index);
  }
  const pages = order.map((index) => doc.getPage(index));
  // rebuild order
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  for (const page of pages) doc.addPage(page);
  return doc.save({ useObjectStreams: true });
}

/** 旋转指定页；indices 为空表示全部页面。 */
export async function rotatePages(source: Uint8Array, delta: number, indices: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source, loadPdfOptions());
  const pages = indices.length > 0 ? indices : doc.getPageIndices();
  const normalized = ((delta % 360) + 360) % 360;
  for (const index of pages) {
    if (index < 0 || index >= doc.getPageCount()) continue;
    const page = doc.getPage(index);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + normalized) % 360) as Rotation);
  }
  return doc.save({ useObjectStreams: true });
}

export function getRotations(source: Uint8Array): Promise<number[]> {
  return PDFDocument.load(source, loadPdfOptions()).then((doc) =>
    doc.getPages().map((page: PDFPage) => page.getRotation().angle),
  );
}

// ── 重新保存（体积估算）─────────────────────────────────────

export interface ResaveResult {
  bytes: Uint8Array;
  originalSize: number;
  newSize: number;
}

const METADATA_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

/**
 * 「体积优化」：开启对象流重新序列化，并移除 XMP 元数据包。
 * 这不是无损压缩，页数多时可能反而变大，界面需要如实对比。
 */
export async function resaveOptimized(source: Uint8Array): Promise<ResaveResult> {
  const doc = await PDFDocument.load(source, loadPdfOptions());
  const before = source.length;
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes, originalSize: before, newSize: bytes.length };
}

/** 从原始字节里估算 XMP 元数据占用（仅用于展示，不做修改）。 */
export function estimateMetadataBytes(source: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(source.subarray(0, Math.min(source.length, 4 * 1024 * 1024)));
  let total = 0;
  for (const key of METADATA_KEYS) {
    let index = text.indexOf(`/${key}`);
    while (index >= 0) {
      total += key.length + 8;
      index = text.indexOf(`/${key}`, index + key.length);
      if (index > 2_000_000) break;
    }
  }
  return total;
}

// ── 内嵌图片提取 ────────────────────────────────────────────

export interface EmbeddedImage {
  pageIndex: number;
  indexInPage: number;
  bytes: Uint8Array;
  ext: 'png' | 'jpg';
}

export async function extractImages(source: Uint8Array, limit = 200): Promise<EmbeddedImage[]> {
  const doc = await PDFDocument.load(source, loadPdfOptions());
  const context = doc.context;
  const results: EmbeddedImage[] = [];
  const pages = doc.getPages();
  const seen = new Set<string>();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (results.length >= limit) return results;
    let xobjects: PDFDict | undefined;
    try {
      const resources = pages[pageIndex].node.Resources();
      if (!resources) continue;
      xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    } catch {
      // 该页没有 Resources 或结构异常，跳过即可
      continue;
    }
    if (!xobjects) continue;
    let indexInPage = 0;
    for (const [, ref] of xobjects.entries()) {
      if (indexInPage >= limit - results.length) return results;
      let stream: PDFRawStream | undefined;
      try {
        const object = context.lookup(ref);
        if (object instanceof PDFRawStream) {
          const subtype = toNameString(object.dict.get(PDFName.of('Subtype')));
          // 只导出位图，跳过 Form XObject（矢量与遮罩）
          if (subtype === '/Image') stream = object;
        }
      } catch {
        continue;
      }
      if (!stream) continue;
      let bytes: Uint8Array;
      try {
        bytes = stream.getContents();
      } catch {
        continue;
      }
      // 同一张图可能在多页复用，按内容去重避免重复导出
      const signature = `${bytes.length}:${ref.toString()}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      results.push({ pageIndex, indexInPage, bytes, ext: isJpeg(bytes) ? 'jpg' : 'png' });
      indexInPage += 1;
    }
  }
  return results;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** 统计内嵌图片的原始体积合计。 */
export async function embeddedImageBytes(source: Uint8Array): Promise<number> {
  const images = await extractImages(source, 500);
  return images.reduce((sum, image) => sum + image.bytes.length, 0);
}

// ── 保存 ────────────────────────────────────────────────────

export async function saveDoc(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

/** 复制整个文档（用于「另存为」而不破坏原对象）。 */
export async function cloneDoc(source: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(source, loadPdfOptions());
}

// ── 外部工具命令与链接 ──────────────────────────────────────

export const QPDF_COMMANDS: { label: string; command: string; note: string }[] = [
  {
    label: '设置打开密码与权限',
    command: 'qpdf --encrypt user owner 256 -- in.pdf out.pdf',
    note: 'user 为打开密码，owner 为权限口令，256 表示 AES-256',
  },
  {
    label: '仅禁止复制与修改（无打开密码）',
    command: 'qpdf --print=none --modify=none --extract=n -- in.pdf out.pdf',
    note: '保留可打开，但限制打印、复制与编辑',
  },
  {
    label: '线性化（加快首屏渲染）',
    command: 'qpdf --linearize in.pdf out.pdf',
    note: '不改变内容，只优化访问顺序',
  },
  {
    label: '生成对象流（减小体积）',
    command: 'qpdf --object-streams=generate --recompress-flate in.pdf out.pdf',
    note: '真正有效的体积优化手段之一',
  },
  {
    label: '拆分页面',
    command: 'qpdf --pages in.pdf 1-3 -- out.pdf',
    note: '取出第 1~3 页',
  },
  {
    label: '合并文件',
    command: 'qpdf --empty --pages a.pdf b.pdf 1-z -- out.pdf',
    note: '1-z 表示全部页面',
  },
];

export const GHOSTSCRIPT_COMMANDS: { label: string; command: string; note: string }[] = [
  {
    label: '电子书级压缩',
    command:
      'gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile=out.pdf in.pdf',
    note: '150dpi，体积与清晰度平衡',
  },
  {
    label: '屏幕级压缩',
    command:
      'gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/screen -dNOPAUSE -dQUIET -dBATCH -sOutputFile=out.pdf in.pdf',
    note: '72dpi，适合屏幕阅读',
  },
  {
    label: '印刷级（高质量）',
    command:
      'gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/printer -dNOPAUSE -dQUIET -dBATCH -sOutputFile=out.pdf in.pdf',
    note: '300dpi，体积最大',
  },
  {
    label: '提取页面内嵌图片',
    command: 'pdfimages -png in.pdf out',
    note: '把位图导出为 PNG，便于二次压缩',
  },
];

export const PDF_TOOL_LINKS = [
  {
    name: 'qpdf',
    url: 'https://qpdf.readthedocs.io/',
    description: '命令行 PDF 结构工具，加密与体积优化的首选',
    tags: ['加密', '命令行'],
  },
  {
    name: 'SumatraPDF',
    url: 'https://www.sumatrapdfreader.org/',
    description: 'Windows 轻量阅读器，内置编辑与打印',
    tags: ['桌面'],
  },
  {
    name: 'Stirling PDF',
    url: 'https://stirlingpdf.com/',
    description: '可自托管的在线 PDF 工具箱，支持合并拆分与 OCR',
    tags: ['自托管', 'OCR'],
  },
  {
    name: 'iLovePDF',
    url: 'https://www.ilovepdf.com/',
    description: '在线 PDF 处理，注意文件会上传到服务器',
    tags: ['在线', 'OCR'],
  },
  {
    name: 'PDF24',
    url: 'https://www.pdf24.org/',
    description: 'Windows 免费 PDF 工具箱，含 OCR 与加密',
    tags: ['桌面', 'OCR'],
  },
  {
    name: 'Tesseract OCR',
    url: 'https://github.com/tesseract-ocr/tesseract',
    description: '开源 OCR 引擎，扫描件转文字的事实标准',
    tags: ['OCR', '开源'],
  },
];

export const OCR_TOOL_LINKS = [
  {
    name: 'Tesseract OCR',
    url: 'https://github.com/tesseract-ocr/tesseract',
    description: '本地 OCR，支持中文与 100+ 语言',
  },
  {
    name: 'OCRmyPDF',
    url: 'https://ocrmypdf.readthedocs.io/',
    description: '给扫描件 PDF 加上可搜索文本层',
    tags: ['命令行'],
  },
  {
    name: 'Google Cloud Vision',
    url: 'https://cloud.google.com/vision/docs/ocr',
    description: '云端 OCR，效果好但会上传图片',
    tags: ['云端'],
  },
];
