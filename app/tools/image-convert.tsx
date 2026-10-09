import { Ban, Crop, Download, Images, Loader2, Trash2, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ResultBox } from '../components/ui/result';
import { formatBytes } from '../lib/bytes';
import { baseName, downloadBlob, exportName, pickFile, pickFiles } from '../lib/file';
import {
  blobUrl,
  computeOutputSize,
  DEFAULT_TRANSFORM,
  encodeCanvas,
  type FormatInfo,
  formatById,
  formatRatio,
  IMAGE_FORMATS,
  type ImageFormat,
  type LoadedImage,
  loadImageFile,
  MAX_IMAGE_BYTES,
  probeFormatSupport,
  renderToCanvas,
  rotatedSize,
  solveQuality,
  type TransformOptions,
} from '../lib/image';

type BatchItem = {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  message: string;
  resultBytes: number;
  resultWidth: number;
  resultHeight: number;
  blob: Blob | null;
};

type Rect = { x: number; y: number; width: number; height: number };

const FORMAT_OPTIONS = IMAGE_FORMATS.map((format) => ({
  value: format.id,
  label: format.exportable ? format.label : `${format.label}（浏览器不支持导出）`,
  disabled: !format.exportable,
}));

const ROTATE_OPTIONS = [
  { value: '0', label: '0°' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
];

const SIZE_MODES = [
  { value: 'auto', label: '保持原始尺寸' },
  { value: 'width', label: '按宽度（等比）' },
  { value: 'height', label: '按高度（等比）' },
  { value: 'both', label: '指定宽高（可能变形）' },
  { value: 'percent', label: '按百分比' },
  { value: 'maxedge', label: '限制最大边长' },
];

const WATERMARK_POSITIONS = [
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
  { value: 'center', label: '居中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' },
];

let batchSeq = 0;
const nextBatchId = () => `batch-${(batchSeq += 1)}`;

export default function ImageConvert() {
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageFormat>('webp');
  const [quality, setQuality] = useState(0.8);
  const [transform, setTransform] = useState<TransformOptions>({ ...DEFAULT_TRANSFORM });
  const [sizeMode, setSizeMode] = useState('auto');
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [percent, setPercent] = useState(100);
  const [maxEdge, setMaxEdge] = useState(1920);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cropping, setCropping] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [result, setResult] = useState<{ url: string; bytes: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetKb, setTargetKb] = useState(0);
  const [support, setSupport] = useState<Record<string, boolean>>({});
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [zipBusy, setZipBusy] = useState(false);

  const sourceRef = useRef<LoadedImage | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  sourceRef.current = source;
  sourceUrlRef.current = sourceUrl;
  resultUrlRef.current = result?.url ?? null;

  const info = useMemo(() => formatById(format), [format]);

  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(
        IMAGE_FORMATS.filter((item) => item.exportable).map(
          async (item) => [item.mime, await probeFormatSupport(item.mime)] as const,
        ),
      );
      setSupport(Object.fromEntries(entries));
    })();
  }, []);

  // 仅在组件卸载时释放资源，避免切换图片时误释放新资源
  useEffect(
    () => () => {
      sourceRef.current?.dispose();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const replaceSource = useCallback((loaded: LoadedImage | null, url: string | null) => {
    sourceRef.current?.dispose();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    sourceRef.current = loaded;
    sourceUrlRef.current = url;
    resultUrlRef.current = null;
    setSource(loaded);
    setSourceUrl(url);
    setResult(null);
  }, []);

  const patch = useCallback((next: Partial<TransformOptions>) => {
    setTransform((prev) => ({ ...prev, ...next }));
  }, []);

  const openImageFile = async (file: File) => {
    setError(null);
    try {
      const loaded = await loadImageFile(file);
      replaceSource(loaded, blobUrl(file));
      setTransform({ ...DEFAULT_TRANSFORM });
      setCrop(null);
      setCropping(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取图片失败');
    }
  };

  const openImage = async () => {
    setError(null);
    const file = await pickFile({ accept: 'image/*' });
    if (!file) return;
    await openImageFile(file);
  };

  // 把 UI 的缩放方式翻译成 TransformOptions 的目标宽高（只填一个方向即等比缩放）
  const effective = useMemo<TransformOptions>(() => {
    const next = { ...transform, crop };
    if (!source) return next;
    const rotated = rotatedSize(source.width, source.height, transform.rotate);
    if (sizeMode === 'both') {
      next.targetWidth = targetWidth;
      next.targetHeight = targetHeight;
      return next;
    }
    if (sizeMode === 'percent') {
      const scale = Math.max(1, percent) / 100;
      next.targetWidth = Math.max(1, Math.round(rotated.width * scale));
      next.targetHeight = 0;
      return next;
    }
    if (sizeMode === 'maxedge') {
      const longest = Math.max(rotated.width, rotated.height);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      next.targetWidth = Math.max(1, Math.round(rotated.width * scale));
      next.targetHeight = 0;
      return next;
    }
    if (sizeMode === 'width') {
      next.targetWidth = Math.max(1, targetWidth);
      next.targetHeight = 0;
      return next;
    }
    if (sizeMode === 'height') {
      next.targetWidth = 0;
      next.targetHeight = Math.max(1, targetHeight);
      return next;
    }
    next.targetWidth = 0;
    next.targetHeight = 0;
    return next;
  }, [source, transform, crop, sizeMode, targetWidth, targetHeight, percent, maxEdge]);

  const outputSize = useMemo(
    () => (source ? computeOutputSize(source.width, source.height, effective) : null),
    [source, effective],
  );

  const render = useCallback(() => {
    if (!source) return null;
    return renderToCanvas(source.source, source.width, source.height, effective);
  }, [source, effective]);

  const generate = useCallback(async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = render();
      if (!canvas) return;
      const blob = await encodeCanvas(canvas, info, quality);
      const url = blobUrl(blob);
      const previous = resultUrlRef.current;
      resultUrlRef.current = url;
      setResult({ url, bytes: blob.size, width: canvas.width, height: canvas.height });
      if (previous) URL.revokeObjectURL(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }, [source, render, info, quality]);

  // 参数变化后自动重算，保证预览与参数一致
  useEffect(() => {
    if (!source) return;
    const timer = window.setTimeout(() => void generate(), 200);
    return () => window.clearTimeout(timer);
  }, [source, generate]);

  const solveTarget = async () => {
    if (!source || targetKb <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = render();
      if (!canvas) return;
      const solved = await solveQuality(canvas, info, targetKb * 1024);
      setQuality(Math.min(1, solved.quality));
    } catch (err) {
      setError(err instanceof Error ? err.message : '体积反推失败');
    } finally {
      setBusy(false);
    }
  };

  const downloadResult = async () => {
    if (!result || !source) return;
    const response = await fetch(result.url);
    downloadBlob(exportName(`${baseName(source.name)}-converted`, info.ext), await response.blob());
  };

  const runBatch = async () => {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    if (files.length === 0) return;
    const items: BatchItem[] = files.map((file) => ({
      id: nextBatchId(),
      name: file.name,
      status: 'pending',
      message: '',
      resultBytes: 0,
      resultWidth: 0,
      resultHeight: 0,
      blob: null,
    }));
    setBatch(items);

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const id = items[index].id;
      setBatch((prev) => prev.map((item) => (item.id === id ? { ...item, status: 'processing' } : item)));
      let loaded: LoadedImage | null = null;
      try {
        loaded = await loadImageFile(file);
        const canvas = renderToCanvas(loaded.source, loaded.width, loaded.height, { ...DEFAULT_TRANSFORM });
        const blob = await encodeCanvas(canvas, info, quality);
        const width = loaded.width;
        const height = loaded.height;
        loaded.dispose();
        loaded = null;
        setBatch((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'done',
                  message: `${width}×${height} → ${canvas.width}×${canvas.height}`,
                  resultBytes: blob.size,
                  resultWidth: canvas.width,
                  resultHeight: canvas.height,
                  blob,
                }
              : item,
          ),
        );
      } catch (err) {
        setBatch((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'error', message: err instanceof Error ? err.message : '处理失败' }
              : item,
          ),
        );
      } finally {
        loaded?.dispose();
      }
    }
  };

  const downloadSingleBatchItem = (item: BatchItem) => {
    if (!item.blob) return;
    downloadBlob(exportName(`${baseName(item.name)}-converted`, info.ext), item.blob);
  };

  const downloadZip = async () => {
    const done = batch.filter((item) => item.blob);
    if (done.length === 0) return;
    setZipBusy(true);
    try {
      const [{ default: JSZip }, entries] = await Promise.all([
        import('jszip'),
        Promise.all(
          done.map(async (item) => {
            const used = batch.filter((other) => other.blob).map((other) => other.name);
            let name = `${baseName(item.name)}.${info.ext}`;
            let counter = 1;
            while (used.includes(name)) name = `${baseName(item.name)}-${counter++}.${info.ext}`;
            return { name, blob: item.blob as Blob };
          }),
        ),
      ]);
      const zip = new JSZip();
      const used = new Set<string>();
      for (const entry of entries) {
        let name = entry.name;
        let counter = 2;
        while (used.has(name)) name = entry.name.replace(/\.[^.]+$/, `-${counter++}.${info.ext}`);
        used.add(name);
        zip.file(name, entry.blob);
      }
      downloadBlob(exportName('images', 'zip'), await zip.generateAsync({ type: 'blob' }));
    } finally {
      setZipBusy(false);
    }
  };

  // 裁剪选框交互：预览区显示的是「已旋转 + 已缩放」后的结果，因此换算回原图坐标
  const rectToImageCoords = (rect: Rect): Rect => {
    const node = previewRef.current;
    const canvas = outputSize;
    if (!node || !canvas) return rect;
    const scale = source ? Math.min(node.clientWidth / canvas.width, node.clientHeight / canvas.height) || 1 : 1;
    const offsetX = (node.clientWidth - canvas.width * scale) / 2;
    const offsetY = (node.clientHeight - canvas.height * scale) / 2;
    return {
      x: Math.round((rect.x - offsetX) / scale),
      y: Math.round((rect.y - offsetY) / scale),
      width: Math.round(rect.width / scale),
      height: Math.round(rect.height / scale),
    };
  };

  const startCrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!cropping) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDraft({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: 0, height: 0 });
  };

  const moveCrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!draft || !cropping) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    setDraft({
      x: Math.min(draft.x, x),
      y: Math.min(draft.y, y),
      width: Math.abs(x - draft.x),
      height: Math.abs(y - draft.y),
    });
  };

  const endCrop = () => {
    if (!draft) return;
    if (draft.width > 8 && draft.height > 8) {
      const mapped = rectToImageCoords(draft);
      setCrop({
        x: Math.max(0, mapped.x),
        y: Math.max(0, mapped.y),
        width: Math.max(1, mapped.width),
        height: Math.max(1, mapped.height),
      });
    }
    setDraft(null);
  };

  return (
    <section
      aria-label="图片处理区，可拖入图片文件"
      className="flex flex-1 flex-col"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));
        if (!file) return;
        event.preventDefault();
        void openImageFile(file);
      }}
    >
      <ToolPanel
        title="图片压缩与格式转换"
        description="纯本地 Canvas 处理：格式转换、缩放、旋转、裁剪、填充、水印与批量打包"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void openImage()}>
              <Images className="size-3.5" />
              选择图片
            </Button>
            <Button size="sm" onClick={() => void downloadResult()} disabled={!result || busy}>
              <Download className="size-3.5" />
              下载
            </Button>
          </>
        }
      >
        {!source ? (
          <>
            <EmptyHint>先选择一张本地图片开始处理，文件不会离开浏览器</EmptyHint>
            {error && <Note tone="danger">{error}</Note>}
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <Section title="输出格式">
                <Select
                  label="格式"
                  value={format}
                  onChange={(value) => setFormat(value as ImageFormat)}
                  options={FORMAT_OPTIONS}
                  hint={info.note}
                />
                {info.lossy ? (
                  <label className="flex items-center gap-2 text-xs">
                    质量
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={1}
                      value={Math.round(quality * 100)}
                      onChange={(event) => setQuality(Number(event.target.value) / 100)}
                      className="h-8 flex-1 accent-primary"
                      aria-label="输出质量"
                    />
                    <span className="w-9 shrink-0 text-right font-mono text-[11px]">{Math.round(quality * 100)}</span>
                  </label>
                ) : (
                  <Hint>PNG 为无损格式，质量参数不生效。</Hint>
                )}
                <div className="flex items-end gap-2">
                  <NumberField
                    className="flex-1"
                    label="目标体积反推"
                    value={targetKb}
                    onChange={setTargetKb}
                    min={0}
                    step={10}
                    suffix="KB"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void solveTarget()}
                    disabled={busy || targetKb <= 0}
                  >
                    <Wand2 className="size-3.5" />
                    反推
                  </Button>
                </div>
                <Hint>输入期望大小后用二分搜索逼近最接近的质量值；PNG 会直接提示无损。</Hint>
              </Section>

              <Section title="尺寸">
                <Select label="缩放方式" value={sizeMode} onChange={setSizeMode} options={SIZE_MODES} />
                {sizeMode === 'width' && (
                  <NumberField
                    label="目标宽"
                    value={targetWidth}
                    onChange={setTargetWidth}
                    min={1}
                    max={20000}
                    suffix="px"
                  />
                )}
                {sizeMode === 'height' && (
                  <NumberField
                    label="目标高"
                    value={targetHeight}
                    onChange={setTargetHeight}
                    min={1}
                    max={20000}
                    suffix="px"
                  />
                )}
                {sizeMode === 'both' && (
                  <>
                    <NumberField
                      label="宽"
                      value={targetWidth}
                      onChange={setTargetWidth}
                      min={1}
                      max={20000}
                      suffix="px"
                    />
                    <NumberField
                      label="高"
                      value={targetHeight}
                      onChange={setTargetHeight}
                      min={1}
                      max={20000}
                      suffix="px"
                    />
                  </>
                )}
                {sizeMode === 'percent' && (
                  <NumberField label="百分比" value={percent} onChange={setPercent} min={1} max={1000} suffix="%" />
                )}
                {sizeMode === 'maxedge' && (
                  <NumberField
                    label="最大边长"
                    value={maxEdge}
                    onChange={setMaxEdge}
                    min={16}
                    max={20000}
                    suffix="px"
                  />
                )}
                {outputSize && (
                  <Hint>
                    输出 {outputSize.width}×{outputSize.height}
                    {transform.borderWidth > 0 ? `（含 ${transform.borderWidth}px 边框 ×2）` : ''}
                  </Hint>
                )}
              </Section>

              <Section title="旋转与翻转">
                <div className="grid grid-cols-4 gap-1.5">
                  {ROTATE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={transform.rotate === Number(option.value) ? 'default' : 'outline'}
                      onClick={() => patch({ rotate: Number(option.value) as TransformOptions['rotate'] })}
                      aria-label={`旋转 ${option.label}`}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Checkbox label="水平翻转" checked={transform.flipH} onChange={(flipH) => patch({ flipH })} />
                  <Checkbox label="垂直翻转" checked={transform.flipV} onChange={(flipV) => patch({ flipV })} />
                </div>
              </Section>

              <Section title="裁剪" description="在右侧结果预览上按住拖动选择区域">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={cropping ? 'default' : 'outline'}
                    onClick={() => {
                      setCropping((prev) => !prev);
                      setDraft(null);
                    }}
                  >
                    <Crop className="size-3.5" />
                    {cropping ? '拖动选择中' : '开始裁剪'}
                  </Button>
                  {crop && (
                    <Button size="sm" variant="ghost" onClick={() => setCrop(null)}>
                      <X className="size-3.5" />
                      清除选区
                    </Button>
                  )}
                </div>
                {crop ? (
                  <Hint>
                    选区 x{crop.x} y{crop.y} {crop.width}×{crop.height}
                  </Hint>
                ) : (
                  <Hint>未裁剪时输出整张图片。</Hint>
                )}
              </Section>

              <Section title="背景与边框" description="JPEG 不支持透明，会自动铺白底">
                <Checkbox
                  label="填充背景色"
                  checked={transform.fillBackground}
                  onChange={(fillBackground) => patch({ fillBackground })}
                  hint="PNG / WebP 也可铺底色，代价是失去透明通道"
                />
                {transform.fillBackground && (
                  <TextField
                    label="背景色"
                    value={transform.background}
                    onChange={(background) => patch({ background })}
                    placeholder="#ffffff"
                  />
                )}
                <NumberField
                  label="边框宽度"
                  value={transform.borderWidth}
                  onChange={(borderWidth) => patch({ borderWidth })}
                  min={0}
                  max={200}
                  suffix="px"
                />
                {transform.borderWidth > 0 && (
                  <TextField
                    label="边框颜色"
                    value={transform.borderColor}
                    onChange={(borderColor) => patch({ borderColor })}
                  />
                )}
              </Section>

              <Section title="文字水印">
                <TextField
                  label="水印文字"
                  value={transform.watermarkText}
                  onChange={(watermarkText) => patch({ watermarkText })}
                  placeholder="留空则不加水印"
                />
                {transform.watermarkText && (
                  <>
                    <Select
                      label="位置"
                      value={transform.watermarkPosition}
                      onChange={(value) => patch({ watermarkPosition: value as TransformOptions['watermarkPosition'] })}
                      options={WATERMARK_POSITIONS}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="颜色"
                        value={transform.watermarkColor}
                        onChange={(watermarkColor) => patch({ watermarkColor })}
                      />
                      <NumberField
                        label="不透明度"
                        value={Math.round(transform.watermarkOpacity * 100)}
                        onChange={(value) => patch({ watermarkOpacity: value / 100 })}
                        min={0}
                        max={100}
                        suffix="%"
                      />
                    </div>
                  </>
                )}
              </Section>
            </div>

            <div className="flex flex-col gap-2.5">
              <Section title="预览对比">
                <div className="grid grid-cols-2 gap-2">
                  <figure className="flex min-w-0 flex-col gap-1">
                    <figcaption className="truncate text-[11px] text-muted-foreground">
                      原图 {source.width}×{source.height} · {formatBytes(source.size)}
                    </figcaption>
                    {sourceUrl && (
                      <img src={sourceUrl} alt="原图预览" className="max-h-52 w-full rounded border object-contain" />
                    )}
                  </figure>
                  <figure className="flex min-w-0 flex-col gap-1">
                    <figcaption className="truncate text-[11px] text-muted-foreground">
                      结果 {result ? `${result.width}×${result.height}` : busy ? '生成中…' : '无结果'}
                    </figcaption>
                    {/* biome-ignore lint/a11y/useSemanticElements: 需要同时承载按下-移动-抬起三态手势的裁剪选区，button 语义无法表达拖拽 */}
                    <div
                      ref={previewRef}
                      role="button"
                      tabIndex={0}
                      aria-label={cropping ? '裁剪选区：拖动选择范围，回车清除选区' : '结果预览'}
                      className={`relative flex h-52 items-center justify-center overflow-hidden rounded border bg-muted/30 ${
                        cropping ? 'cursor-crosshair' : ''
                      }`}
                      onMouseDown={startCrop}
                      onMouseMove={moveCrop}
                      onMouseUp={endCrop}
                      onMouseLeave={endCrop}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          setCrop(null);
                          setDraft(null);
                        }
                      }}
                    >
                      {result ? (
                        <img src={result.url} alt="结果预览" className="max-h-52 max-w-full object-contain" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{busy ? '处理中…' : '无结果'}</span>
                      )}
                      {draft && (
                        <div
                          className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                          style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height }}
                        />
                      )}
                    </div>
                  </figure>
                </div>
              </Section>

              <StatGrid>
                <Stat label="原大小" value={formatBytes(source.size)} />
                <Stat label="结果大小" value={result ? formatBytes(result.bytes) : '—'} />
                <Stat
                  label="体积变化"
                  value={result ? formatRatio(source.size, result.bytes) : '—'}
                  tone={result ? (result.bytes < source.size ? 'success' : 'warn') : 'info'}
                />
                <Stat label="输出格式" value={`${info.label} · ${info.lossy ? Math.round(quality * 100) : '无损'}`} />
              </StatGrid>

              {error && <Note tone="danger">{error}</Note>}

              <Section title="当前参数" description="便于核对与复现">
                <ResultBox
                  label="参数 JSON"
                  rows="min-h-32"
                  value={JSON.stringify(
                    {
                      format: info.id,
                      quality: info.lossy ? Math.round(quality * 100) : null,
                      size: outputSize ? `${outputSize.width}×${outputSize.height}` : null,
                      rotate: transform.rotate,
                      flipH: transform.flipH,
                      flipV: transform.flipV,
                      crop,
                      fillBackground: transform.fillBackground,
                      background: transform.background,
                      border: `${transform.borderWidth}px ${transform.borderColor}`,
                      watermark: transform.watermarkText
                        ? `${transform.watermarkText} @ ${transform.watermarkPosition} ${Math.round(transform.watermarkOpacity * 100)}%`
                        : null,
                    },
                    null,
                    2,
                  )}
                />
              </Section>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="批量转换"
            description="批量流程统一按原尺寸输出为当前格式，便于快速打包"
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => void runBatch()}>
                  <Images className="size-3.5" />
                  选择多张
                </Button>
                <Button
                  size="sm"
                  onClick={() => void downloadZip()}
                  disabled={zipBusy || !batch.some((item) => item.blob)}
                >
                  <Download className="size-3.5" />
                  {zipBusy ? '打包中…' : '全部下载'}
                </Button>
              </>
            }
          >
            {batch.length === 0 ? (
              <EmptyHint>未选择文件</EmptyHint>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
                {batch.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.status === 'pending' && <span className="shrink-0 text-muted-foreground">等待中</span>}
                    {item.status === 'processing' && (
                      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-label="处理中" />
                    )}
                    {item.status === 'error' && (
                      <>
                        <Ban className="size-3.5 shrink-0 text-destructive" aria-label="失败" />
                        <span className="shrink-0 truncate text-destructive">{item.message}</span>
                      </>
                    )}
                    {item.status === 'done' && (
                      <>
                        <span className="shrink-0 font-mono text-muted-foreground">{item.message}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadSingleBatchItem(item)}
                          aria-label={`下载 ${item.name}`}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Hint>单文件超过 {formatBytes(MAX_IMAGE_BYTES)} 会被直接跳过，避免解码时内存爆掉。</Hint>
            {batch.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setBatch([])}>
                <Trash2 className="size-3.5" />
                清空列表
              </Button>
            )}
          </Section>

          <div className="flex flex-col gap-2.5">
            <Section title="浏览器格式支持" description="用 2×2 画布实际编码探测">
              <SupportTable support={support} />
            </Section>
            <Section title="说明">
              <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                <li>BMP 无法导出：浏览器 Canvas 不支持 image/bmp 编码，请先转 PNG。</li>
                <li>GIF 仅可作为输入；导出 GIF 需要专用编码器，本工具不提供。</li>
                <li>
                  AVIF 依赖浏览器内置编码器，Chrome / Edge 支持较好，Firefox 与 Safari 支持有限，不支持时请改用 WebP。
                </li>
                <li>
                  去元数据：所有输出都经 Canvas 重绘，EXIF / GPS 等元数据不会保留；EXIF 方向在解码阶段已通过
                  createImageBitmap 的 imageOrientation 修正。
                </li>
                <li>支持拖放或粘贴：把图片文件拖到面板上即可替换当前图片。</li>
                <li>输出文件名格式：原名-converted-时间戳.扩展名。</li>
              </ul>
            </Section>
          </div>
        </div>

        {error && !source && <Note tone="danger">{error}</Note>}
      </ToolPanel>
    </section>
  );
}

function SupportTable({ support }: { support: Record<string, boolean> }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead>
        <tr className="text-muted-foreground">
          <th className="font-normal">格式</th>
          <th className="font-normal">导出</th>
          <th className="font-normal">质量</th>
          <th className="font-normal">透明</th>
        </tr>
      </thead>
      <tbody>
        {IMAGE_FORMATS.map((format: FormatInfo) => (
          <tr key={format.id} className="border-t">
            <td className="py-1">{format.label}</td>
            <td>
              {!format.exportable ? (
                <span className="text-muted-foreground">不支持</span>
              ) : support[format.mime] === undefined ? (
                <span className="text-muted-foreground">检测中</span>
              ) : support[format.mime] ? (
                <span className="text-emerald-600 dark:text-emerald-400">可用</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">不可用</span>
              )}
            </td>
            <td>{format.lossy ? '生效' : '无效'}</td>
            <td>{format.alpha ? '支持' : '不支持'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
