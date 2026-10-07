import {
  ArrowUpRight,
  Brush,
  Check,
  Circle,
  Copy,
  Download,
  Eye,
  Focus,
  Grid3x3,
  ImagePlus,
  Monitor,
  Redo2,
  Scan,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import {
  arrowHead,
  boundsOf,
  canRedo,
  canUndo,
  clampCrop,
  createHistory,
  currentShapes,
  DRAW_TOOLS,
  type HistoryState,
  hitTest,
  isAreaTool,
  newShapeId,
  normalizeRect,
  type Point,
  pushHistory,
  type Rect,
  redo,
  removeShapes,
  type Shape,
  shapesToJson,
  snapToCells,
  TOOL_LABELS,
  type ToolId,
  translateShapes,
  undo,
} from '../lib/annotate';
import { formatBytes } from '../lib/bytes';
import { downloadBlob, exportName, pickFile } from '../lib/file';
import { canvasToBlob, loadImageFile, MAX_IMAGE_BYTES } from '../lib/image';

const TOOL_ICONS: Record<ToolId, typeof Brush> = {
  pen: Brush,
  rect: Square,
  ellipse: Circle,
  arrow: ArrowUpRight,
  text: Type,
  mosaic: Grid3x3,
  blur: Focus,
};

const COLOR_PRESETS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#000000'];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

type SourceInfo = {
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  name: string;
};

export default function ScreenshotAnnotate() {
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [tool, setTool] = useState<ToolId>('pen');
  const [color, setColor] = useState('#ef4444');
  const [strokeSize, setStrokeSize] = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [mosaicCell, setMosaicCell] = useState(12);
  const [history, setHistory] = useState<HistoryState>(() => createHistory());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<Shape | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textBusy, setTextBusy] = useState(false);
  const [background, setBackground] = useState('#ffffff');
  const [textBackground, setTextBackground] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<SourceInfo | null>(null);
  const dragRef = useRef<{ mode: 'none' | 'draw' | 'move' | 'pan' | 'marquee'; last: Point }>({
    mode: 'none',
    last: { x: 0, y: 0 },
  });

  sourceRef.current = source;
  const shapes = currentShapes(history);

  // 清理旧资源，避免多次截图导致 objectURL 泄漏
  const applySource = useCallback((info: SourceInfo | null) => {
    if (sourceRef.current && sourceRef.current.url !== info?.url) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = info;
    setSource(info);
    if (info) {
      setZoom(Math.min(1.5, 1200 / info.width));
      setOffset({ x: 0, y: 0 });
      setHistory(createHistory());
      setSelected(new Set());
      setCropRect(null);
      setShowCrop(false);
      setCaptured(true);
    }
  }, []);

  useEffect(
    () => () => {
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    },
    [],
  );

  const commit = useCallback((next: Shape[]) => {
    setHistory((prev) => pushHistory(prev, next));
  }, []);

  const pickUpload = async () => {
    setError(null);
    setNotice(null);
    const file = await pickFile({ accept: 'image/*' });
    if (!file) return;
    try {
      const loaded = await loadImageFile(file);
      const url = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('图片解码失败'));
        element.src = url;
      });
      loaded.dispose();
      applySource({ url, image, width: image.naturalWidth, height: image.naturalHeight, name: file.name });
      setNotice('getDisplayMedia 不可用时，可用上传的图片完成标注');
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取图片失败');
    }
  };

  const captureScreen = async () => {
    setError(null);
    setNotice(null);
    const media = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    };
    if (typeof media.getDisplayMedia !== 'function') {
      setError('当前环境不支持 getDisplayMedia（Firefox 需在 HTTPS 或扩展页中使用），请改用「上传图片」');
      return;
    }
    try {
      const stream = await media.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      track?.stop();
      video.srcObject = null;
      const blob = await canvasToBlob(canvas, 'image/png');
      const url = URL.createObjectURL(blob);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('截图解码失败'));
        element.src = url;
      });
      applySource({ url, image, width: image.naturalWidth, height: image.naturalHeight, name: 'screenshot.png' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      if (/denied|NotAllowed/i.test(message)) {
        setError('屏幕捕获被拒绝或不可用，请改用「上传图片」');
      } else {
        setError(`屏幕捕获失败：${message}`);
      }
    }
  };

  // 底图画布：源图 + 马赛克/模糊需要从原图取样
  const paintBase = useCallback(() => {
    const canvas = baseRef.current;
    const info = sourceRef.current;
    if (!canvas || !info) return;
    if (canvas.width !== info.width) canvas.width = info.width;
    if (canvas.height !== info.height) canvas.height = info.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(info.image, 0, 0, info.width, info.height);
  }, []);

  const applyPixelEffect = useCallback((ctx: CanvasRenderingContext2D, shape: Shape, snapshot: HTMLCanvasElement) => {
    if (shape.tool !== 'mosaic' && shape.tool !== 'blur') return;
    const { rect, cell } = shape;
    const step = Math.max(2, cell);
    const cols = Math.ceil(rect.width / step);
    const rows = Math.ceil(rect.height / step);
    if (cols * rows > 40000) return;
    if (shape.tool === 'mosaic') {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = rect.x + col * step;
          const y = rect.y + row * step;
          const size = Math.min(step, rect.x + rect.width - x);
          const sizeY = Math.min(step, rect.y + rect.height - y);
          if (size <= 0 || sizeY <= 0) continue;
          const data = ctx.getImageData(
            Math.max(0, Math.round(x)),
            Math.max(0, Math.round(y)),
            Math.ceil(size),
            Math.ceil(sizeY),
          );
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          for (let i = 0; i < data.data.length; i += 4) {
            r += data.data[i];
            g += data.data[i + 1];
            b += data.data[i + 2];
            a += data.data[i + 3];
          }
          const count = Math.max(1, data.data.length / 4);
          ctx.fillStyle = `rgba(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)}, ${a / count / 255})`;
          ctx.fillRect(x, y, size, sizeY);
        }
      }
      return;
    }
    const region = snapshot.getContext('2d')?.getImageData(rect.x, rect.y, rect.width, rect.height);
    if (!region) return;
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.floor(rect.width / step));
    scaled.height = Math.max(1, Math.floor(rect.height / step));
    const scaledCtx = scaled.getContext('2d');
    if (!scaledCtx) return;
    const temp = document.createElement('canvas');
    temp.width = region.width;
    temp.height = region.height;
    temp.getContext('2d')?.putImageData(region, 0, 0);
    scaledCtx.imageSmoothingEnabled = true;
    scaledCtx.drawImage(temp, 0, 0, scaled.width, scaled.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(scaled, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }, []);

  const drawShape = useCallback(
    (ctx: CanvasRenderingContext2D, shape: Shape, snapshot: HTMLCanvasElement) => {
      ctx.save();
      ctx.globalAlpha = shape.opacity;
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      applyPixelEffect(ctx, shape, snapshot);
      switch (shape.tool) {
        case 'pen': {
          if (shape.points.length < 2) {
            ctx.restore();
            return;
          }
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            const previous = shape.points[i - 1];
            const current = shape.points[i];
            ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
          }
          ctx.stroke();
          break;
        }
        case 'rect':
          if (shape.filled) {
            ctx.fillRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
          } else {
            ctx.strokeRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
          }
          break;
        case 'ellipse':
          ctx.beginPath();
          ctx.ellipse(
            shape.rect.x + shape.rect.width / 2,
            shape.rect.y + shape.rect.height / 2,
            Math.max(1, shape.rect.width / 2),
            Math.max(1, shape.rect.height / 2),
            0,
            0,
            Math.PI * 2,
          );
          if (shape.filled) ctx.fill();
          else ctx.stroke();
          break;
        case 'arrow': {
          ctx.beginPath();
          ctx.moveTo(shape.from.x, shape.from.y);
          ctx.lineTo(shape.to.x, shape.to.y);
          ctx.stroke();
          const [left, right] = arrowHead(shape.from, shape.to, shape.size);
          ctx.beginPath();
          ctx.moveTo(shape.to.x, shape.to.y);
          ctx.lineTo(left.x, left.y);
          ctx.lineTo(right.x, right.y);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'text': {
          ctx.font = `600 ${shape.fontSize}px system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
          ctx.textBaseline = 'top';
          if (shape.background) {
            const metrics = ctx.measureText(shape.text);
            ctx.fillStyle = shape.background;
            ctx.fillRect(shape.at.x - 4, shape.at.y - 2, metrics.width + 8, shape.fontSize * 1.3);
            ctx.fillStyle = shape.color;
          }
          ctx.fillText(shape.text, shape.at.x, shape.at.y);
          break;
        }
        case 'mosaic':
        case 'blur':
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = Math.max(1, shape.size / 2);
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
          break;
        default:
          break;
      }
      ctx.restore();
    },
    [applyPixelEffect],
  );

  // 统一重绘：底图 → 像素效果 → 形状 → 选框
  const repaint = useCallback(() => {
    const info = sourceRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!info || !base || !overlay) return;
    paintBase();
    const baseCtx = base.getContext('2d');
    const ctx = overlay.getContext('2d');
    if (!baseCtx || !ctx) return;
    if (overlay.width !== info.width) overlay.width = info.width;
    if (overlay.height !== info.height) overlay.height = info.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // 像素类工具需要按绘制顺序读取「截至上一个像素效果」的画面
    let snapshot = base;
    let snapshotCtx = baseCtx;
    for (const shape of shapes) {
      if (isAreaTool(shape.tool)) {
        drawShape(ctx, shape, snapshot);
        // 把当前画面复制为新的取样源，保证多个马赛克区域互不干扰
        const copy = document.createElement('canvas');
        copy.width = overlay.width;
        copy.height = overlay.height;
        const copyCtx = copy.getContext('2d');
        if (copyCtx) {
          copyCtx.drawImage(base, 0, 0);
          copyCtx.drawImage(overlay, 0, 0);
          snapshot = copy;
          snapshotCtx = copyCtx;
        }
      } else {
        drawShape(ctx, shape, snapshot);
      }
    }
    void snapshotCtx;

    // 选中高亮
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    selected.forEach((index) => {
      const bounds = shapes[index] ? boundsOf(shapes[index]) : null;
      if (!bounds) return;
      ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
    });
    ctx.restore();
  }, [paintBase, drawShape, shapes, selected]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  // 屏幕坐标 → 截图像素坐标
  const toImageCoords = (event: { clientX: number; clientY: number }): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - offset.x) / zoom,
      y: (event.clientY - rect.top - offset.y) / zoom,
    };
  };

  const beginShape = (point: Point): Shape | null => {
    const base = { id: newShapeId(tool), color, opacity: 1, createdAt: Date.now() } as const;
    if (tool === 'pen') {
      return { ...base, tool: 'pen', size: strokeSize, points: [point] };
    }
    if (tool === 'rect' || tool === 'ellipse') {
      return { ...base, tool, size: strokeSize, rect: { x: point.x, y: point.y, width: 0, height: 0 }, filled: false };
    }
    if (tool === 'arrow') {
      return { ...base, tool: 'arrow', size: strokeSize, from: point, to: point };
    }
    if (tool === 'text') {
      const text = textDraft.trim() || '双击后可编辑';
      return { ...base, tool: 'text', size: 1, at: point, text, fontSize, background: textBackground };
    }
    if (tool === 'mosaic' || tool === 'blur') {
      return {
        ...base,
        tool,
        size: strokeSize,
        rect: snapToCells({ x: point.x, y: point.y, width: 0, height: 0 }, mosaicCell),
        cell: mosaicCell,
      };
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!source) return;
    const point = toImageCoords(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    // 空格 / 中键 → 平移视图
    if (event.button === 1 || event.shiftKey) {
      dragRef.current = { mode: 'pan', last: { x: event.clientX, y: event.clientY } };
      return;
    }

    if (tool === 'text') {
      const started = beginShape(point);
      if (started) {
        setDraft(started);
        commit([...shapes, started]);
        setSelected(new Set([shapes.length]));
        setDraft(null);
      }
      return;
    }

    const hitIndex = shapes.findIndex((shape) => hitTest(shape, point));
    if (hitIndex >= 0) {
      const next = new Set(selected);
      if (event.metaKey || event.ctrlKey) {
        if (next.has(hitIndex)) next.delete(hitIndex);
        else next.add(hitIndex);
      } else {
        next.clear();
        next.add(hitIndex);
      }
      setSelected(next);
      dragRef.current = { mode: 'move', last: point };
      return;
    }

    if (showCrop) {
      dragRef.current = { mode: 'marquee', last: point };
      setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }

    const started = beginShape(point);
    if (!started) return;
    setDraft(started);
    dragRef.current = { mode: 'draw', last: point };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.mode === 'none' || !source) return;

    if (drag.mode === 'pan') {
      setOffset((prev) => ({
        x: prev.x + (event.clientX - drag.last.x),
        y: prev.y + (event.clientY - drag.last.y),
      }));
      dragRef.current = { mode: 'pan', last: { x: event.clientX, y: event.clientY } };
      return;
    }

    const point = toImageCoords(event);

    if (drag.mode === 'marquee') {
      setMarquee(normalizeRect(drag.last, point));
      return;
    }

    if (drag.mode === 'move') {
      const dx = point.x - drag.last.x;
      const dy = point.y - drag.last.y;
      if (dx === 0 && dy === 0) return;
      // 在函数式更新里基于最新快照位移，避免连续 pointermove 读到过期闭包
      setHistory((prev) => {
        if (prev.cursor < 0 || selected.size === 0) return prev;
        const states = [...prev.states];
        states[prev.cursor] = translateShapes(states[prev.cursor] ?? [], [...selected], dx, dy);
        return { ...prev, states };
      });
      dragRef.current = { ...drag, last: point };
      return;
    }

    if (!draft) return;
    if (draft.tool === 'pen') {
      setDraft({ ...draft, points: [...draft.points, point] });
      return;
    }
    if (draft.tool === 'mosaic' || draft.tool === 'blur') {
      setDraft({ ...draft, rect: snapToCells(normalizeRect(drag.last, point), mosaicCell) });
      return;
    }
    if (draft.tool === 'arrow') {
      setDraft({ ...draft, to: point });
      return;
    }
    if (draft.tool === 'rect' || draft.tool === 'ellipse') {
      setDraft({ ...draft, rect: normalizeRect(drag.last, point) });
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag.mode === 'marquee' && marquee) {
      setCropRect(clampCrop(marquee, source?.width ?? 0, source?.height ?? 0));
    }
    if (drag.mode === 'move') {
      if (selected.size > 0) {
        setHistory((prev) => pushHistory(prev, currentShapes(prev)));
      }
    }
    if (drag.mode === 'draw' && draft) {
      const meaningful =
        draft.tool === 'pen'
          ? draft.points.length > 1
          : draft.tool === 'rect' || draft.tool === 'ellipse' || draft.tool === 'mosaic' || draft.tool === 'blur'
            ? draft.rect.width > 3 && draft.rect.height > 3
            : true;
      if (meaningful) {
        commit([...shapes, draft]);
        setSelected(new Set([shapes.length]));
      }
      setDraft(null);
    }
    if (drag.mode === 'marquee') setMarquee(null);
    dragRef.current = { mode: 'none', last: { x: 0, y: 0 } };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      setHistory((prev) => (event.shiftKey ? redo(prev) : undo(prev)));
      return;
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      setHistory((prev) => redo(prev));
      return;
    }
    if (event.key === 'Escape') {
      setSelected(new Set());
      setDraft(null);
      setShowCrop(false);
      setCropRect(null);
      return;
    }
    if (meta && event.key === 'a') {
      event.preventDefault();
      setSelected(new Set(shapes.map((_, index) => index)));
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.size > 0) {
      event.preventDefault();
      commit(removeShapes(shapes, [...selected]));
      setSelected(new Set());
      return;
    }
    if ((event.key === '[' || event.key === ']') && selected.size > 0) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === '[' ? -step : step;
      commit(translateShapes(shapes, [...selected], dx, 0));
      return;
    }
    const hotkeys: Record<string, ToolId> = {
      p: 'pen',
      r: 'rect',
      e: 'ellipse',
      a: 'arrow',
      t: 'text',
      m: 'mosaic',
      b: 'blur',
    };
    const next = hotkeys[event.key.toLowerCase()];
    if (next && !meta) setTool(next);
  };

  const renderExport = useCallback(
    async (opts: { transparent: boolean; background: string; crop: Rect | null }): Promise<Blob | null> => {
      const info = sourceRef.current;
      const base = baseRef.current;
      const overlay = overlayRef.current;
      if (!info || !base || !overlay) return null;
      paintBase();
      const baseCtx = base.getContext('2d');
      const overlayCtx = overlay.getContext('2d');
      if (!baseCtx || !overlayCtx) return null;

      const rect = opts.crop ?? { x: 0, y: 0, width: info.width, height: info.height };
      const output = document.createElement('canvas');
      output.width = rect.width;
      output.height = rect.height;
      const ctx = output.getContext('2d');
      if (!ctx) return null;
      if (!opts.transparent) {
        ctx.fillStyle = opts.background;
        ctx.fillRect(0, 0, output.width, output.height);
      }

      // 重新在输出画布上按顺序绘制，保证像素工具读取正确
      ctx.drawImage(base, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const offsetX = -rect.x;
      const offsetY = -rect.y;
      const translated = shapes.map((shape) => translateShapes([shape], [0], offsetX, offsetY)[0]);
      let snapshot = base;
      for (const shape of translated) {
        drawShape(ctx, shape, snapshot);
        if (isAreaTool(shape.tool)) {
          const copy = document.createElement('canvas');
          copy.width = base.width;
          copy.height = base.height;
          const copyCtx = copy.getContext('2d');
          if (copyCtx) {
            copyCtx.drawImage(base, 0, 0);
            copyCtx.drawImage(overlay, 0, 0);
            snapshot = copy;
          }
        }
      }
      return canvasToBlob(output, 'image/png');
    },
    [paintBase, drawShape, shapes],
  );

  const exportPng = async (transparent: boolean) => {
    setTextBusy(true);
    try {
      const blob = await renderExport({ transparent, background, crop: cropRect });
      if (!blob) return;
      downloadBlob(exportName('screenshot', 'png'), blob);
      setNotice(`已导出 ${formatBytes(blob.size)}`);
    } finally {
      setTextBusy(false);
    }
  };

  const copyToClipboard = async () => {
    setTextBusy(true);
    setError(null);
    try {
      const blob = await renderExport({ transparent: false, background: '#ffffff', crop: cropRect });
      if (!blob) return;
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        setError('当前环境不支持图片写入剪贴板，请改用「下载 PNG」');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNotice('已复制到剪贴板');
    } catch (err) {
      setError(`复制失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setTextBusy(false);
    }
  };

  const applyCrop = async () => {
    if (!cropRect || !source) return;
    setTextBusy(true);
    try {
      const blob = await renderExport({ transparent: false, background: '#ffffff', crop: cropRect });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('裁剪结果解码失败'));
        element.src = url;
      });
      applySource({
        url,
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: `${baseStem(source.name)}-crop.png`,
      });
      setNotice(`已裁剪为 ${image.naturalWidth}×${image.naturalHeight}`);
    } finally {
      setTextBusy(false);
    }
  };

  const outputEstimate = useMemo(() => {
    if (!source || !cropRect) return null;
    return cropRect.width * cropRect.height;
  }, [source, cropRect]);

  return (
    <ToolPanel
      title="截图标注"
      description="屏幕捕获或上传图片后添加标注，支持马赛克、模糊、裁剪与快捷键"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => void captureScreen()}>
            <Monitor className="size-3.5" />
            捕获屏幕
          </Button>
          <Button size="sm" variant="outline" onClick={() => void pickUpload()}>
            <ImagePlus className="size-3.5" />
            上传图片
          </Button>
          <Button size="sm" onClick={() => void exportPng(false)} disabled={!source || textBusy}>
            <Download className="size-3.5" />
            下载 PNG
          </Button>
        </>
      }
    >
      {error && <Note tone="danger">{error}</Note>}
      {notice && <Note tone="success">{notice}</Note>}

      {!source ? (
        <>
          <EmptyHint>先捕获屏幕或上传一张图片</EmptyHint>
          <Note tone="warn">
            <span className="flex items-center gap-1.5">
              <Monitor className="size-3.5" />
              Firefox 默认不提供 <code>getDisplayMedia</code>
              ；受限环境下会自动提示改用「上传图片」，两条路径的标注能力完全一致。
            </span>
          </Note>
        </>
      ) : (
        <>
          <StatGrid>
            <Stat label="尺寸" value={`${source.width}×${source.height}`} />
            <Stat label="形状数" value={String(shapes.length)} />
            <Stat label="已选" value={String(selected.size)} />
            <Stat label="缩放" value={`${Math.round(zoom * 100)}%`} />
            <Stat label="裁剪后" value={cropRect ? `${cropRect.width}×${cropRect.height}` : '未裁剪'} />
            <Stat label="历史" value={`${history.cursor + 1}/${history.states.length}`} />
            <Stat label="来源" value={source.name} hint={captured ? '屏幕捕获' : '上传图片'} />
          </StatGrid>

          <div className="flex flex-wrap items-center gap-1.5">
            {DRAW_TOOLS.map((id) => {
              const Icon = TOOL_ICONS[id];
              return (
                <Button
                  key={id}
                  size="sm"
                  variant={tool === id ? 'default' : 'outline'}
                  onClick={() => setTool(id)}
                  aria-label={TOOL_LABELS[id]}
                  aria-pressed={tool === id}
                >
                  <Icon className="size-3.5" />
                  {TOOL_LABELS[id]}
                </Button>
              );
            })}
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistory((prev) => undo(prev))}
              disabled={!canUndo(history)}
              aria-label="撤销"
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistory((prev) => redo(prev))}
              disabled={!canRedo(history)}
              aria-label="重做"
            >
              <Redo2 className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => {
                commit(removeShapes(shapes, [...selected]));
                setSelected(new Set());
              }}
              aria-label="删除选中"
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                commit([]);
                setSelected(new Set());
              }}
              aria-label="清空全部标注"
            >
              <Scan className="size-3.5" />
              清空
            </Button>
            <Button
              size="sm"
              variant={showCrop ? 'default' : 'outline'}
              onClick={() => {
                setShowCrop((prev) => !prev);
                setCropRect(null);
              }}
              aria-pressed={showCrop}
            >
              <Scan className="size-3.5" />
              {showCrop ? '拖动选择裁剪范围' : '裁剪'}
            </Button>
            {cropRect && (
              <Button size="sm" onClick={() => void applyCrop()} disabled={textBusy}>
                <Check className="size-3.5" />
                应用裁剪
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copyToClipboard()}
              disabled={textBusy}
              aria-label="复制到剪贴板"
            >
              <Copy className="size-3.5" />
              复制
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom((prev) => Math.max(MIN_ZOOM, prev / 1.2))}
              aria-label="缩小"
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="min-w-11 text-center font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZoom((prev) => Math.min(MAX_ZOOM, prev * 1.2))}
              aria-label="放大"
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              aria-label="重置视图"
            >
              <Eye className="size-3.5" />
              1:1
            </Button>
          </div>

          <div
            ref={stageRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: 画布需要接收键盘快捷键（撤销/删除/工具切换），必须可聚焦
            tabIndex={0}
            role="application"
            aria-label="截图标注画布"
            className="relative max-h-[52vh] overflow-auto rounded border bg-muted/40"
            style={{ cursor: dragRef.current.mode === 'pan' ? 'grab' : 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <div
              className="relative inline-block origin-top-left"
              style={{ width: source.width * zoom, height: source.height * zoom }}
            >
              <canvas
                ref={baseRef}
                className="absolute left-0 top-0"
                style={{ width: source.width * zoom, height: source.height * zoom }}
              />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute left-0 top-0"
                style={{ width: source.width * zoom, height: source.height * zoom }}
              />
              {draft && <DraftPreview shape={draft} zoom={zoom} />}
              {marquee && (
                <div
                  className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                  style={{
                    left: (marquee.x + offset.x / zoom) * zoom,
                    top: (marquee.y + offset.y / zoom) * zoom,
                    width: marquee.width * zoom,
                    height: marquee.height * zoom,
                  }}
                />
              )}
              {cropRect && !showCrop && (
                <div
                  className="pointer-events-none absolute border-2 border-emerald-500"
                  style={{
                    left: cropRect.x * zoom,
                    top: cropRect.y * zoom,
                    width: cropRect.width * zoom,
                    height: cropRect.height * zoom,
                  }}
                />
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="样式">
              <div className="flex flex-wrap items-center gap-1.5">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`颜色 ${preset}`}
                    aria-pressed={color === preset}
                    className={`size-6 rounded-full border-2 ${color === preset ? 'border-primary' : 'border-border'}`}
                    style={{ background: preset }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  aria-label="自定义颜色"
                  className="size-6 rounded border bg-transparent p-0"
                />
              </div>
              <NumberField label="线宽" value={strokeSize} onChange={setStrokeSize} min={1} max={40} suffix="px" />
              {tool === 'text' && (
                <>
                  <NumberField label="字号" value={fontSize} onChange={setFontSize} min={8} max={200} suffix="px" />
                  <TextField label="文字内容" value={textDraft} onChange={setTextDraft} placeholder="点击画布时插入" />
                  <Select
                    label="文字背景"
                    value={textBackground ?? 'none'}
                    onChange={(value) => setTextBackground(value === 'none' ? null : value)}
                    options={[
                      { value: 'none', label: '无背景' },
                      { value: '#000000', label: '黑色' },
                      { value: '#ffffff', label: '白色' },
                      { value: '#ffff00', label: '黄色' },
                    ]}
                  />
                </>
              )}
              {(tool === 'mosaic' || tool === 'blur') && (
                <NumberField
                  label="格子边长"
                  value={mosaicCell}
                  onChange={setMosaicCell}
                  min={4}
                  max={60}
                  suffix="px"
                />
              )}
              <TextField
                label="导出背景色"
                value={background}
                onChange={setBackground}
                hint="导出 PNG 时铺在透明区域下方"
              />
            </Section>

            <div className="flex flex-col gap-3">
              <Section title="导出">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => void exportPng(false)} disabled={textBusy}>
                    <Download className="size-3.5" />
                    下载 PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void exportPng(true)} disabled={textBusy}>
                    <Download className="size-3.5" />
                    透明 PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copyToClipboard()} disabled={textBusy}>
                    <Copy className="size-3.5" />
                    复制到剪贴板
                  </Button>
                </div>
                <Hint>JPEG 不支持透明，需要不透明背景时导出 PNG 后再转 JPEG。</Hint>
                {cropRect && (
                  <Hint>
                    当前导出将应用裁剪 {cropRect.width}×{cropRect.height}
                    {outputEstimate ? `（约 ${(outputEstimate / 10000).toFixed(0)} 万像素）` : ''}
                  </Hint>
                )}
                <Checkbox
                  label="捕获时包含浏览器标签页"
                  checked={false}
                  disabled
                  onChange={() => undefined}
                  hint="getDisplayMedia 的可选参数由浏览器决定，本工具默认请求当前标签页"
                />
              </Section>

              <Section title="形状列表" description="按绘制顺序，后画的在上层">
                {shapes.length === 0 ? (
                  <EmptyHint>还没有标注</EmptyHint>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-auto">
                    {shapes
                      .map((shape, index) => ({ shape, index }))
                      .reverse()
                      .map(({ shape, index }) => (
                        <li key={shape.id} className="flex items-center gap-1.5 rounded border px-2 py-1 text-[11px]">
                          <input
                            type="checkbox"
                            checked={selected.has(index)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index);
                                else next.add(index);
                                return next;
                              });
                            }}
                            aria-label={`选择第 ${index + 1} 个形状`}
                            className="size-3 accent-primary"
                          />
                          <span className="w-10 shrink-0 font-mono text-muted-foreground">#{index + 1}</span>
                          <span className="w-10 shrink-0">{TOOL_LABELS[shape.tool]}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {shape.tool === 'text'
                              ? shape.text
                              : `${Math.round(boundsOf(shape)?.width ?? 0)}×${Math.round(boundsOf(shape)?.height ?? 0)}`}
                          </span>
                          <span className="size-3 shrink-0 rounded-full border" style={{ background: shape.color }} />
                        </li>
                      ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>

          <Section title="标注数据" description="可复制后用于复现或迁移">
            <ResultBox
              label="形状 JSON"
              rows="min-h-24"
              value={shapesToJson(shapes)}
              onCopy={() => void copyText(shapesToJson(shapes))}
            />
            <Hint>导入功能不在本工具内；如需恢复标注，可在其他工具中读取这段 JSON。</Hint>
          </Section>

          <Section title="快捷键与限制">
            <div className="grid gap-2 text-[11px] sm:grid-cols-2">
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>P / R / E / A / T / M / B：切换画笔、矩形、椭圆、箭头、文字、马赛克、模糊</li>
                <li>Cmd/Ctrl + Z 撤销，Cmd/Ctrl + Shift + Z 重做，Cmd/Ctrl + A 全选</li>
                <li>Delete 删除选中，[ 与 ] 微移选中形状，Shift 加速</li>
                <li>空格拖动或按住 Shift 平移视图，滚轮区域可滚动</li>
                <li>Esc 取消选择并退出裁剪</li>
              </ul>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>历史栈最多 {60} 步，超出后丢弃最早记录</li>
                <li>马赛克 / 模糊按格子取样，格子过小（&lt;4px）在高倍率下会看到块状感</li>
                <li>截图与标注全在本地内存完成，不上传任何服务器</li>
                <li>单张图片上限 {formatBytes(MAX_IMAGE_BYTES)}，超过会被拒绝</li>
              </ul>
            </div>
          </Section>
        </>
      )}

      {tool === 'text' && shapes.length > 0 && textDraft && (
        <Note tone="info">当前工具为文字，内容为「{textDraft}」，点击画布即可插入。</Note>
      )}
    </ToolPanel>
  );
}

function baseStem(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(0, index) : name;
}

function DraftPreview({ shape, zoom }: { shape: Shape; zoom: number }) {
  if (shape.tool === 'pen') {
    const points = shape.points;
    return (
      <svg className="pointer-events-none absolute left-0 top-0" width="100%" height="100%">
        <title>画笔预览</title>
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={shape.color}
          strokeWidth={shape.size}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        />
      </svg>
    );
  }
  const style = { borderColor: shape.color, borderWidth: Math.max(1, shape.size / 2) };
  if (shape.tool === 'arrow') {
    const midX = ((shape.from.x + shape.to.x) / 2) * zoom;
    const midY = ((shape.from.y + shape.to.y) / 2) * zoom;
    return (
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="100%" height="100%">
        <title>箭头预览</title>
        <line
          x1={shape.from.x * zoom}
          y1={shape.from.y * zoom}
          x2={shape.to.x * zoom}
          y2={shape.to.y * zoom}
          stroke={shape.color}
          strokeWidth={shape.size}
          strokeLinecap="round"
        />
        <text x={midX} y={midY - 4} fontSize={11} fill={shape.color} textAnchor="middle">
          箭头
        </text>
      </svg>
    );
  }
  if (shape.tool === 'text') {
    return (
      <div
        className="pointer-events-none absolute font-semibold"
        style={{
          left: shape.at.x * zoom,
          top: shape.at.y * zoom,
          fontSize: shape.fontSize * zoom,
          color: shape.color,
        }}
      >
        {shape.text}
      </div>
    );
  }
  const rect = shape.rect;
  return (
    <div
      className={`pointer-events-none absolute border-2 ${shape.tool === 'ellipse' ? 'rounded-full' : ''}`}
      style={{
        left: rect.x * zoom,
        top: rect.y * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
        ...style,
      }}
    />
  );
}
