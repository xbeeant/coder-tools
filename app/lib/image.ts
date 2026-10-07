/** 图片处理的底层工具：解码、绘制、编码与浏览器格式支持探测。 */

/** 单文件大小上限，超出直接拒绝，避免解码时内存爆掉。 */
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

/** 画布像素上限（宽 × 高），约 1.2 亿像素，超出会直接拒绝。 */
export const MAX_CANVAS_PIXELS = 120_000_000;

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'gif' | 'bmp';

export interface FormatInfo {
  id: ImageFormat;
  label: string;
  mime: string;
  ext: string;
  /** 是否为有损格式（质量参数生效） */
  lossy: boolean;
  /** 是否支持透明通道 */
  alpha: boolean;
  /** 是否支持导出 */
  exportable: boolean;
  note: string;
}

export const IMAGE_FORMATS: FormatInfo[] = [
  {
    id: 'png',
    label: 'PNG',
    mime: 'image/png',
    ext: 'png',
    lossy: false,
    alpha: true,
    exportable: true,
    note: '无损、支持透明',
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    ext: 'jpg',
    lossy: true,
    alpha: false,
    exportable: true,
    note: '有损、不支持透明',
  },
  {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    ext: 'webp',
    lossy: true,
    alpha: true,
    exportable: true,
    note: '有损、体积小',
  },
  {
    id: 'avif',
    label: 'AVIF',
    mime: 'image/avif',
    ext: 'avif',
    lossy: true,
    alpha: true,
    exportable: true,
    note: '压缩率最高，浏览器支持有限',
  },
  {
    id: 'gif',
    label: 'GIF',
    mime: 'image/gif',
    ext: 'gif',
    lossy: false,
    alpha: true,
    exportable: false,
    note: 'Canvas 不支持导出 GIF，仅可作为输入',
  },
  {
    id: 'bmp',
    label: 'BMP',
    mime: 'image/bmp',
    ext: 'bmp',
    lossy: false,
    alpha: false,
    exportable: false,
    note: '浏览器无法导出 BMP，请先转 PNG',
  },
];

export function formatById(id: string): FormatInfo {
  return IMAGE_FORMATS.find((format) => format.id === id) ?? IMAGE_FORMATS[0];
}

/** 用文件头魔数判断真实类型，避免只依赖扩展名。 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 12) return null;
  const hex = (offset: number, length: number) =>
    Array.from(bytes.subarray(offset, offset + length))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  if (hex(0, 8) === '89504e470d0a1a0a') return 'png';
  if (hex(0, 3) === 'ffd8ff') return 'jpeg';
  if (hex(0, 6) === '47494638') return 'gif';
  if (hex(0, 2) === '424d') return 'bmp';
  if (hex(0, 4) === '52494646' && hex(8, 4) === '57454250') return 'webp';
  if (hex(4, 4) === '66747970' && (hex(8, 4) === '61766966' || hex(8, 4) === '61766d70')) return 'avif';
  return null;
}

/** 扩展名兜底映射。 */
const FORMAT_BY_EXT: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jpe: 'jpeg',
  webp: 'webp',
  avif: 'avif',
  avifs: 'avif',
  gif: 'gif',
  bmp: 'bmp',
};

/** 优先读魔数，失败再按扩展名推断。 */
export async function detectImageFormat(file: File): Promise<ImageFormat> {
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const sniffed = sniffImageFormat(head);
    if (sniffed) return sniffed;
  } catch {
    // 读取失败时按扩展名推断
  }
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return FORMAT_BY_EXT[ext] ?? 'png';
}

export interface LoadedImage {
  /** 数据源，优先 ImageBitmap（支持 imageOrientation 修正） */
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  name: string;
  size: number;
  format: ImageFormat;
  /** 清理 objectURL 等资源 */
  dispose: () => void;
}

/**
 * 优先用 createImageBitmap 并开启 imageOrientation: 'from-image'，
 * 这样 EXIF 方向会被正确应用；不支持时回退到 <img> + objectURL。
 */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`文件超过 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB 上限，请先压缩后再处理`);
  }
  const canUseBitmap = typeof createImageBitmap === 'function';
  if (canUseBitmap) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        name: file.name,
        size: file.size,
        format: await detectImageFormat(file),
        dispose: () => bitmap.close(),
      };
    } catch {
      // 部分格式（尤其 AVIF/BMP）在个别浏览器上会失败，继续走 <img> 路径
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片解码失败，浏览器可能不支持该格式'));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      name: file.name,
      size: file.size,
      format: await detectImageFormat(file),
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** 计算旋转 / 翻转后的输出尺寸。 */
export function rotatedSize(width: number, height: number, degrees: number): { width: number; height: number } {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 90 || normalized === 270 ? { width: height, height: width } : { width, height };
}

export interface TransformOptions {
  /** 目标宽（0 表示按比例推导） */
  targetWidth: number;
  targetHeight: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** 裁剪区域，基于旋转前的原始像素坐标；null 表示不裁剪 */
  crop: { x: number; y: number; width: number; height: number } | null;
  /** 透明区域填充色，JPEG 等不支持透明的格式必须指定 */
  background: string;
  /** 是否填充背景（PNG/WebP 可选，JPEG 强制开启） */
  fillBackground: boolean;
  borderWidth: number;
  borderColor: string;
  watermarkText: string;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

export const DEFAULT_TRANSFORM: TransformOptions = {
  targetWidth: 0,
  targetHeight: 0,
  rotate: 0,
  flipH: false,
  flipV: false,
  crop: null,
  background: '#ffffff',
  fillBackground: false,
  borderWidth: 0,
  borderColor: '#000000',
  watermarkText: '',
  watermarkColor: '#ffffff',
  watermarkOpacity: 0.6,
  watermarkPosition: 'bottom-right',
};

/** 推导最终输出尺寸（不含边框）。 */
export function computeOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  options: Pick<TransformOptions, 'targetWidth' | 'targetHeight' | 'rotate' | 'crop' | 'borderWidth'>,
): { width: number; height: number } {
  const base = options.crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const rotated = rotatedSize(base.width, base.height, options.rotate);
  let width = options.targetWidth > 0 ? options.targetWidth : rotated.width;
  let height = options.targetHeight > 0 ? options.targetHeight : rotated.height;
  if (options.targetWidth <= 0 && options.targetHeight > 0) {
    width = Math.max(1, Math.round(rotated.height * (options.targetHeight / rotated.width)));
  } else if (options.targetHeight <= 0 && options.targetWidth > 0) {
    height = Math.max(1, Math.round(rotated.width * (options.targetWidth / rotated.height)));
  }
  return {
    width: Math.max(1, Math.round(width) + options.borderWidth * 2),
    height: Math.max(1, Math.round(height) + options.borderWidth * 2),
  };
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  color: string,
  alpha: number,
  position: TransformOptions['watermarkPosition'],
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const fontSize = Math.max(10, Math.round(Math.min(width, height) * 0.06));
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(trimmed);
  const padding = Math.round(fontSize * 0.6);
  const x =
    position === 'top-left'
      ? padding
      : position === 'top-right'
        ? width - metrics.width - padding
        : position === 'bottom-left'
          ? padding
          : position === 'center'
            ? (width - metrics.width) / 2
            : width - metrics.width - padding;
  const y =
    position === 'top-left' || position === 'top-right'
      ? padding + fontSize / 2
      : position === 'center'
        ? height / 2
        : height - padding - fontSize / 2;
  ctx.fillText(trimmed, x, y);
  ctx.restore();
}

/**
 * 按变换参数把源图绘制到离屏 canvas。
 * 返回的 canvas 已经包含旋转、裁剪、缩放、翻转、背景填充、边框与水印。
 */
export function renderToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: TransformOptions,
): HTMLCanvasElement {
  const crop = options.crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const rotated = rotatedSize(crop.width, crop.height, options.rotate);
  const inner = computeOutputSize(sourceWidth, sourceHeight, options);
  const totalPixels = inner.width * inner.height;
  if (totalPixels > MAX_CANVAS_PIXELS) {
    throw new Error(`目标尺寸 ${inner.width}×${inner.height} 超出画布上限，请减小尺寸`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = inner.width;
  canvas.height = inner.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建绘图上下文');

  const needsBackground = options.fillBackground || options.borderWidth > 0;
  if (needsBackground) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 旋转 + 翻转需要先把坐标系变换到「旋转后的逻辑坐标」
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (options.rotate === 90) ctx.rotate(Math.PI / 2);
  else if (options.rotate === 180) ctx.rotate(Math.PI);
  else if (options.rotate === 270) ctx.rotate(-Math.PI / 2);
  ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);

  const drawWidth = rotated.width - options.borderWidth * 2;
  const drawHeight = rotated.height - options.borderWidth * 2;
  const scale = Math.min(drawWidth / crop.width, drawHeight / crop.height);
  const targetW = crop.width * scale;
  const targetH = crop.height * scale;
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, -targetW / 2, -targetH / 2, targetW, targetH);
  ctx.restore();

  if (options.borderWidth > 0) {
    ctx.strokeStyle = options.borderColor;
    ctx.lineWidth = options.borderWidth;
    const offset = options.borderWidth / 2;
    ctx.strokeRect(offset, offset, canvas.width - options.borderWidth, canvas.height - options.borderWidth);
  }

  drawWatermark(
    ctx,
    options.watermarkText,
    canvas.width,
    canvas.height,
    options.watermarkColor,
    options.watermarkOpacity,
    options.watermarkPosition,
  );

  return canvas;
}

/** JPEG 等不支持透明，导出前需要铺一层底色。 */
export function flattenTransparency(canvas: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * canvas → Blob。
 * toBlob 在旧版 Safari 上可能返回 null，这里回退到 toDataURL 再转 Blob。
 */
export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === mime) {
          resolve(blob);
          return;
        }
        try {
          const dataUrl = quality === undefined ? canvas.toDataURL(mime) : canvas.toDataURL(mime, quality);
          const comma = dataUrl.indexOf(',');
          if (comma < 0) {
            reject(new Error('导出失败：画布未能生成数据'));
            return;
          }
          const binary = atob(dataUrl.slice(comma + 1));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: mime }));
        } catch {
          reject(new Error('当前浏览器不支持该编码格式，请改用 PNG 或 JPEG'));
        }
      },
      mime,
      quality,
    );
  });
}

/** 1×1 探测像素能否用指定 MIME 编码，用于展示浏览器格式支持表。 */
export async function probeFormatSupport(mime: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 2, 2);
  try {
    const blob = await canvasToBlob(canvas, mime, 0.8);
    return blob.type === mime;
  } catch {
    return false;
  }
}

/** 导出流程的统一入口：按需铺底色后编码。 */
export async function encodeCanvas(canvas: HTMLCanvasElement, format: FormatInfo, quality: number): Promise<Blob> {
  const needsFlatten = !format.alpha && format.exportable;
  const target = needsFlatten ? flattenTransparency(canvas, '#ffffff') : canvas;
  return canvasToBlob(target, format.mime, format.lossy ? quality : undefined);
}

/**
 * 二分搜索编码质量，直到体积不超过目标字节数。
 * PNG 为无损格式，质量参数无效，直接返回 100。
 */
export async function solveQuality(
  canvas: HTMLCanvasElement,
  format: FormatInfo,
  targetBytes: number,
  onProgress?: (quality: number, bytes: number) => void,
): Promise<{ quality: number; bytes: number }> {
  if (!format.lossy) {
    const blob = await encodeCanvas(canvas, format, 1);
    return { quality: 100, bytes: blob.size };
  }
  let low = 0.05;
  let high = 1;
  let best = { quality: high, bytes: Number.POSITIVE_INFINITY };
  let quality = 0.7;
  for (let i = 0; i < 9; i++) {
    quality = (low + high) / 2;
    const blob = await encodeCanvas(canvas, format, quality);
    onProgress?.(quality, blob.size);
    if (blob.size <= targetBytes) {
      best = { quality, bytes: blob.size };
      low = quality;
    } else {
      high = quality;
    }
    if (high - low < 0.02) break;
  }
  if (best.bytes === Number.POSITIVE_INFINITY) {
    const blob = await encodeCanvas(canvas, format, low);
    best = { quality: low, bytes: blob.size };
  }
  return best;
}

/** SVG 字符串 → 栅格化 canvas，用于占位图等矢量转位图。 */
export function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    // 加 XML 声明，避免部分浏览器把 SVG 当成 HTML 片段解析
    const source = svg.startsWith('<?xml') ? svg : `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('无法创建绘图上下文'));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 栅格化失败，可能是图案过于复杂'));
    };
    image.src = url;
  });
}

/** 在预览与截图类工具中把 Blob 读成 objectURL，用完由调用方释放。 */
export function blobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function formatRatio(original: number, result: number): string {
  if (original <= 0) return '—';
  const ratio = (result / original) * 100;
  if (ratio >= 100) return `+${(ratio - 100).toFixed(1)}%`;
  return `${ratio.toFixed(1)}%`;
}
