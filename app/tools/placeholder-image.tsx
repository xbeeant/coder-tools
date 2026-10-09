import { Copy, Dices, Download, Image as ImageIcon, RefreshCw, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { downloadDataUrl, downloadText, pickFiles } from '../lib/file';
import { canvasToBlob, rasterizeSvg } from '../lib/image';
import {
  buildPlaceholderSvg,
  cssSnippet,
  DEFAULT_OPTIONS,
  FORMAT_OPTIONS,
  loremText,
  markdownSnippet,
  PATTERN_OPTIONS,
  type PlaceholderFormat,
  type PlaceholderOptions,
  pictureSnippet,
  placeholderFileName,
  randomPlaceholderSubtitle,
  randomPlaceholderTitle,
  SIZE_PRESETS,
  svgToDataUri,
  xhtmlSnippet,
} from '../lib/placeholder';

const PATTERN_SELECT = PATTERN_OPTIONS.map((option) => ({ value: option.value, label: option.label }));
const FORMAT_SELECT = FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

interface FormatMeta {
  label: string;
  mime: string;
  ext: string;
}

export function formatInfo(value: PlaceholderFormat): FormatMeta {
  return FORMAT_OPTIONS.find((option) => option.value === value) ?? FORMAT_OPTIONS[0];
}

export default function PlaceholderImage() {
  const [options, setOptions] = useState<PlaceholderOptions>({
    ...DEFAULT_OPTIONS,
    title: '占位图',
    subtitle: `${DEFAULT_OPTIONS.width} × ${DEFAULT_OPTIONS.height}`,
  });
  const [format, setFormat] = useState<PlaceholderFormat>('png');
  const [quality, setQuality] = useState(0.92);
  const [useBase64, setUseBase64] = useState(true);
  const [lockRatio, setLockRatio] = useState(true);
  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  const [rasterSize, setRasterSize] = useState(0);
  const [rasterError, setRasterError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const patch = useCallback((next: Partial<PlaceholderOptions>) => {
    setOptions((prev) => ({ ...prev, ...next }));
  }, []);

  const svg = useMemo(() => buildPlaceholderSvg(options), [options]);
  const dataUri = useMemo(() => svgToDataUri(svg, useBase64), [svg, useBase64]);
  const info = formatInfo(format);

  // 位图格式需要把 SVG 栅格化，参数变化时重新生成预览
  useEffect(() => {
    if (format === 'svg') {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setRasterUrl(null);
      setRasterSize(0);
      setRasterError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setRasterError(null);
    (async () => {
      try {
        const canvas = await rasterizeSvg(svg, options.width, options.height);
        const blob = await canvasToBlob(canvas, info.mime, info.label.includes('JPEG') ? quality : undefined);
        if (cancelled) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setRasterUrl(url);
        setRasterSize(blob.size);
      } catch (error) {
        if (!cancelled) {
          setRasterError(error instanceof Error ? error.message : '栅格化失败');
          setRasterUrl(null);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [svg, format, info.mime, info.label, quality, options.width, options.height]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const setWidth = (width: number) => {
    const next = Math.min(4096, Math.max(16, Math.round(width || 16)));
    if (lockRatio && options.width > 0) {
      const ratio = options.width / Math.max(1, options.height);
      patch({ width: next, height: Math.max(16, Math.round(next / ratio)) });
    } else {
      patch({ width: next });
    }
  };

  const setHeight = (height: number) => {
    const next = Math.min(4096, Math.max(16, Math.round(height || 16)));
    if (lockRatio && options.height > 0) {
      const ratio = options.width / Math.max(1, options.height);
      patch({ height: next, width: Math.max(16, Math.round(next * ratio)) });
    } else {
      patch({ height: next });
    }
  };

  const applyPreset = (value: string) => {
    const preset = SIZE_PRESETS.find((item) => item.label === value);
    if (!preset) return;
    patch({
      width: preset.width,
      height: preset.height,
      subtitle: `${preset.width} × ${preset.height}`,
    });
  };

  const fillLorem = () => {
    patch({
      title: loremText(true, 1),
      subtitle: loremText(true, 2),
    });
  };

  const randomize = () => {
    patch({
      title: randomPlaceholderTitle(),
      subtitle: randomPlaceholderSubtitle(options.width, options.height),
    });
  };

  const copyWithFeedback = (text: string, key: string) => {
    copyText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1200);
  };

  const download = () => {
    const filename = placeholderFileName(options, info.ext);
    if (format === 'svg') {
      downloadText(filename, svg, 'image/svg+xml;charset=utf-8');
      return;
    }
    if (rasterUrl) {
      downloadDataUrl(filename, rasterUrl);
    } else {
      // 栅格化失败时退化为下载 SVG，至少让用户拿到可用资源
      downloadText(placeholderFileName(options, 'svg'), svg, 'image/svg+xml;charset=utf-8');
    }
  };

  const readOutputSize = async () => {
    const files = await pickFiles({ accept: 'image/*', multiple: false });
    const file = files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('读取失败'));
        element.src = url;
      });
      patch({
        width: image.naturalWidth,
        height: image.naturalHeight,
        subtitle: `${image.naturalWidth} × ${image.naturalHeight}`,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <ToolPanel
      title="占位图生成"
      description="按尺寸与文案生成 SVG / PNG / JPEG / WebP 占位图，全部本地渲染"
      actions={
        <Button size="sm" onClick={download} disabled={busy && !rasterUrl}>
          <Download className="size-3.5" />
          下载 {info.label.split('（')[0]}
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {/* 左栏：参数 */}
        <div className="flex flex-col gap-2.5">
          <Section title="尺寸" description="常用预设一键套用">
            <Select
              ariaLabel="尺寸预设"
              value={SIZE_PRESETS[0].label}
              onChange={applyPreset}
              options={SIZE_PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="宽" value={options.width} onChange={setWidth} min={16} max={4096} suffix="px" />
              <NumberField label="高" value={options.height} onChange={setHeight} min={16} max={4096} suffix="px" />
            </div>
            <Checkbox
              label="锁定宽高比"
              checked={lockRatio}
              onChange={setLockRatio}
              hint="勾选后改动一侧会自动按当前比例计算另一侧"
            />
            <Button size="sm" variant="outline" onClick={() => void readOutputSize()}>
              <Wand2 className="size-3.5" />
              用已有图片的尺寸
            </Button>
          </Section>

          <Section title="配色与形状">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                背景
                <input
                  type="color"
                  value={options.background}
                  onChange={(event) => patch({ background: event.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border bg-background p-0.5"
                  aria-label="背景色"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                前景
                <input
                  type="color"
                  value={options.foreground}
                  onChange={(event) => patch({ foreground: event.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border bg-background p-0.5"
                  aria-label="前景色（文字）"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="圆角"
                value={options.radius}
                onChange={(radius) => patch({ radius })}
                min={0}
                max={999}
                suffix="px"
              />
              <NumberField
                label="边框宽度"
                value={options.borderWidth}
                onChange={(borderWidth) => patch({ borderWidth })}
                min={0}
                max={64}
                suffix="px"
              />
            </div>
            <TextField
              label="背景色值"
              value={options.background}
              onChange={(background) => patch({ background })}
              placeholder="#1e293b"
              hint="同时支持 CSS 颜色名与 rgba()"
            />
            <Checkbox
              label="渐变背景"
              checked={options.gradient}
              onChange={(gradient) => patch({ gradient })}
              hint="关闭后只填充纯背景色"
            />
            {options.gradient && (
              <TextField
                label="渐变终止色"
                value={options.secondary}
                onChange={(secondary) => patch({ secondary })}
                placeholder="#334155"
              />
            )}
          </Section>

          <Section title="文案与图案">
            <TextField
              label="主标题"
              value={options.title}
              onChange={(title) => patch({ title })}
              placeholder="占位图"
            />
            <TextField
              label="副标题"
              value={options.subtitle}
              onChange={(subtitle) => patch({ subtitle })}
              placeholder="1200 × 630"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={randomize}>
                <Dices className="size-3.5" />
                随机文案
              </Button>
              <Button size="sm" variant="outline" onClick={fillLorem}>
                <RefreshCw className="size-3.5" />
                Lorem 填充
              </Button>
            </div>
            <Select
              label="图案"
              value={options.pattern}
              onChange={(value) => patch({ pattern: value as PlaceholderOptions['pattern'] })}
              options={PATTERN_SELECT}
            />
            <NumberField
              label="图案透明度"
              value={Math.round(options.patternOpacity * 100)}
              onChange={(value) => patch({ patternOpacity: value / 100 })}
              min={0}
              max={100}
              step={5}
              suffix="%"
            />
            <NumberField
              label="整体不透明度"
              value={Math.round(options.opacity * 100)}
              onChange={(value) => patch({ opacity: value / 100 })}
              min={0}
              max={100}
              step={5}
              suffix="%"
            />
          </Section>
        </div>

        {/* 右栏：预览与输出 */}
        <div className="flex flex-col gap-2.5">
          <Section
            title="预览"
            actions={
              <Select
                ariaLabel="输出格式"
                value={format}
                onChange={(value) => setFormat(value as PlaceholderFormat)}
                options={FORMAT_SELECT}
                selectClassName="h-7 w-32 text-xs"
              />
            }
          >
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-md border bg-[repeating-conic-gradient(#808080_0%_25%,#a9a9a9_0%_50%)] bg-[length:16px_16px] p-2">
              {format === 'svg' ? (
                <img src={dataUri} alt="占位图预览" className="max-h-64 w-auto max-w-full rounded shadow" />
              ) : rasterUrl ? (
                <img src={rasterUrl} alt="占位图预览" className="max-h-64 w-auto max-w-full rounded shadow" />
              ) : (
                <span className="text-xs text-muted-foreground">{busy ? '生成中…' : '预览不可用'}</span>
              )}
            </div>
            {format !== 'svg' && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                质量
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(quality * 100)}
                  onChange={(event) => setQuality(Number(event.target.value) / 100)}
                  className="flex-1 accent-primary"
                  aria-label="JPEG 导出质量"
                />
                <span className="font-mono text-[11px]">{Math.round(quality * 100)}</span>
              </label>
            )}
            {rasterError && (
              <Note tone="warn" title="位图导出不可用">
                {rasterError}。当前浏览器可能不支持该编码，可改用 SVG 格式下载。
              </Note>
            )}
          </Section>

          <StatGrid>
            <Stat label="尺寸" value={`${options.width}×${options.height}`} />
            <Stat label="格式" value={info.label.split('（')[0]} hint={info.mime} />
            <Stat
              label="预估体积"
              value={
                format === 'svg'
                  ? `${Math.round(svg.length / 1024)} KB`
                  : rasterSize
                    ? `${Math.round(rasterSize / 1024)} KB`
                    : '—'
              }
              hint={format === 'svg' ? 'SVG 源码长度' : '实际编码结果'}
            />
            <Stat label="SVG 源码" value={`${Math.round(svg.length / 1024)} KB`} />
          </StatGrid>

          <Section title="SVG 源码" description="结构化输出，可直接保存为 .svg">
            <Textarea value={svg} readOnly spellCheck={false} className="min-h-28 resize-none font-mono text-xs" />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => copyWithFeedback(svg, 'svg')}>
                <Copy className="size-3.5" />
                {copied === 'svg' ? '已复制' : '复制 SVG'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadText(placeholderFileName(options, 'svg'), svg, 'image/svg+xml')}
              >
                <Download className="size-3.5" />
                下载 SVG
              </Button>
            </div>
          </Section>

          <Section title="代码片段" description="data URI 可直接贴进 CSS 或 Markdown">
            <Checkbox
              label="使用 base64 编码（体积略小）"
              checked={useBase64}
              onChange={setUseBase64}
              hint="关闭后改用 URI 编码，兼容性更好但长度更长"
            />
            <SnippetBlock title="data URI" value={dataUri} onCopy={() => copyWithFeedback(dataUri, 'uri')} />
            <SnippetBlock
              title="CSS background-image"
              value={cssSnippet(dataUri)}
              onCopy={() => copyWithFeedback(cssSnippet(dataUri), 'css')}
            />
            <SnippetBlock
              title="picture / srcset"
              value={pictureSnippet(dataUri)}
              onCopy={() => copyWithFeedback(pictureSnippet(dataUri), 'pic')}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <SnippetBlock
                title="Markdown"
                value={markdownSnippet(dataUri)}
                onCopy={() => copyWithFeedback(markdownSnippet(dataUri), 'md')}
              />
              <SnippetBlock
                title="HTML"
                value={xhtmlSnippet(dataUri)}
                onCopy={() => copyWithFeedback(xhtmlSnippet(dataUri), 'html')}
              />
            </div>
          </Section>

          <Note tone="info" title="使用说明">
            <span className="inline-flex items-start gap-1">
              <ImageIcon className="mt-0.5 size-3 shrink-0" />
              位图格式由 SVG 栅格化而来，噪点图案的转换结果可能与源 SVG
              有细微差异；文字使用系统字体栈渲染，不同操作系统的字形会略有区别。
            </span>
          </Note>
        </div>
      </div>
    </ToolPanel>
  );
}

export function SnippetBlock({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium">{title}</span>
        <Button size="sm" variant="ghost" onClick={onCopy} disabled={!value}>
          <Copy className="size-3" />
          复制
        </Button>
      </div>
      {value ? (
        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
          {value}
        </pre>
      ) : (
        <EmptyHint className="py-2">无内容</EmptyHint>
      )}
    </div>
  );
}
