/**
 * 截图标注核心：纯数据与几何计算，不依赖 React 与 DOM。
 * 所有坐标统一使用「截图原始像素」坐标系，与界面缩放无关。
 */

export type ToolId = 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'mosaic' | 'blur';

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

export interface BaseShape {
  id: string;
  tool: ToolId;
  color: string;
  /** 线宽或描边宽度（像素，截图坐标系） */
  size: number;
  opacity: number;
  createdAt: number;
}

export interface StrokeShape extends BaseShape {
  tool: 'pen';
  points: Point[];
}

export interface RectShape extends BaseShape {
  tool: 'rect' | 'ellipse';
  rect: Rect;
  filled: boolean;
}

export interface ArrowShape extends BaseShape {
  tool: 'arrow';
  from: Point;
  to: Point;
}

export interface TextShape extends BaseShape {
  tool: 'text';
  at: Point;
  text: string;
  fontSize: number;
  /** 背景填充色，null 表示无背景 */
  background: string | null;
}

export interface MosaicShape extends BaseShape {
  tool: 'mosaic' | 'blur';
  rect: Rect;
  /** 马赛克格子边长（截图坐标系） */
  cell: number;
}

export type Shape = StrokeShape | RectShape | ArrowShape | TextShape | MosaicShape;

export const TOOL_LABELS: Record<ToolId, string> = {
  pen: '画笔',
  rect: '矩形',
  ellipse: '椭圆',
  arrow: '箭头',
  text: '文字',
  mosaic: '马赛克',
  blur: '模糊',
};

export const DRAW_TOOLS: ToolId[] = ['pen', 'rect', 'ellipse', 'arrow', 'text', 'mosaic', 'blur'];

/** 需要在区域内取样的工具（马赛克 / 模糊按矩形处理）。 */
export function isAreaTool(tool: ToolId): tool is 'mosaic' | 'blur' {
  return tool === 'mosaic' || tool === 'blur';
}

/** 需要连续拖动采集点列的工具。 */
export function isFreehandTool(tool: ToolId): tool is 'pen' {
  return tool === 'pen';
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** 马赛克 / 模糊只保留整数个格子，避免边缘出现半格接缝。 */
export function snapToCells(rect: Rect, cell: number): Rect {
  const size = Math.max(1, Math.floor(cell));
  const x = Math.floor(rect.x / size) * size;
  const y = Math.floor(rect.y / size) * size;
  const width = Math.max(size, Math.round(rect.width / size) * size);
  const height = Math.max(size, Math.round(rect.height / size) * size);
  return { x, y, width, height };
}

/** 判断点是否落在形状的命中范围内（用于选中与拖动）。 */
export function hitTest(shape: Shape, point: Point, tolerance = 6): boolean {
  switch (shape.tool) {
    case 'pen':
      return shape.points.some((item) => distance(item, point) <= Math.max(tolerance, shape.size));
    case 'rect':
      return distanceToRect(point, shape.rect) <= tolerance;
    case 'ellipse':
      // 与 rect 一致：内部整体可命中，仅轮廓外保留容差带。
      // ellipseValue 在边界为 0、内部为负，故用 <= 而非绝对值。
      return ellipseValue(shape.rect, point) <= Math.max(tolerance, shape.size) / Math.max(1, shape.rect.width);
    case 'arrow':
      return distanceToSegment(point, shape.from, shape.to) <= Math.max(tolerance, shape.size);
    case 'text': {
      const width = shape.text.length * shape.fontSize * 0.6;
      const height = shape.fontSize * 1.3;
      return (
        point.x >= shape.at.x - 4 &&
        point.x <= shape.at.x + width + 4 &&
        point.y >= shape.at.y - shape.fontSize &&
        point.y <= shape.at.y + height
      );
    }
    case 'mosaic':
    case 'blur':
      return (
        point.x >= shape.rect.x &&
        point.x <= shape.rect.x + shape.rect.width &&
        point.y >= shape.rect.y &&
        point.y <= shape.rect.y + shape.rect.height
      );
    default:
      return false;
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, from);
  let t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}

/** 点到矩形边框的最短距离。 */
function distanceToRect(point: Point, rect: Rect): number {
  const inside =
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  if (inside) return 0;
  const nearestX = Math.min(Math.max(point.x, rect.x), rect.x + rect.width);
  const nearestY = Math.min(Math.max(point.y, rect.y), rect.y + rect.height);
  return distance(point, { x: nearestX, y: nearestY });
}

/** 归一化椭圆方程值，0 表示在边界上。 */
function ellipseValue(rect: Point & Rect, point: Point): number {
  const rx = Math.max(1, rect.width / 2);
  const ry = Math.max(1, rect.height / 2);
  const cx = rect.x + rx;
  const cy = rect.y + ry;
  return (point.x - cx) ** 2 / rx ** 2 + (point.y - cy) ** 2 / ry ** 2 - 1;
}

/** 计算箭头两端的三角形控制点，用于绘制箭头头部。 */
export function arrowHead(from: Point, to: Point, size: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  const length = Math.max(size * 3, 12);
  return [
    { x: to.x - length * Math.cos(angle - spread), y: to.y - length * Math.sin(angle - spread) },
    { x: to.x - length * Math.cos(angle + spread), y: to.y - length * Math.sin(angle + spread) },
  ];
}

/** 框选命中的形状索引（返回自上而下的顺序，便于整体删除）。 */
export function hitTestAll(shapes: Shape[], rect: Rect): number[] {
  const result: number[] = [];
  shapes.forEach((shape, index) => {
    if (boundsOf(shape) && overlaps(boundsOf(shape) as Rect, rect)) result.push(index);
  });
  return result.reverse();
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 形状的包围盒，箭头等开放形状也返回有效包围盒。 */
export function boundsOf(shape: Shape): Rect | null {
  switch (shape.tool) {
    case 'pen': {
      if (shape.points.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of shape.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      const pad = shape.size;
      return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
    }
    case 'rect':
    case 'ellipse':
    case 'mosaic':
    case 'blur':
      return shape.rect;
    case 'arrow': {
      const pad = shape.size;
      return {
        x: Math.min(shape.from.x, shape.to.x) - pad,
        y: Math.min(shape.from.y, shape.to.y) - pad,
        width: Math.abs(shape.to.x - shape.from.x) + pad * 2,
        height: Math.abs(shape.to.y - shape.from.y) + pad * 2,
      };
    }
    case 'text': {
      const width = shape.text.length * shape.fontSize * 0.6;
      const height = shape.fontSize * 1.35;
      return { x: shape.at.x, y: shape.at.y - shape.fontSize, width, height };
    }
    default:
      return null;
  }
}

/** 整体平移所有选中形状。 */
export function translateShapes(shapes: Shape[], indices: number[], dx: number, dy: number): Shape[] {
  const targets = new Set(indices);
  return shapes.map((shape, index) => {
    if (!targets.has(index)) return shape;
    switch (shape.tool) {
      case 'pen':
        return { ...shape, points: shape.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
      case 'arrow':
        return {
          ...shape,
          from: { x: shape.from.x + dx, y: shape.from.y + dy },
          to: { x: shape.to.x + dx, y: shape.to.y + dy },
        };
      case 'text':
        return { ...shape, at: { x: shape.at.x + dx, y: shape.at.y + dy } };
      default:
        return { ...shape, rect: { ...shape.rect, x: shape.rect.x + dx, y: shape.rect.y + dy } };
    }
  });
}

/** 删除指定索引（从大到小删，避免索引错位）。 */
export function removeShapes(shapes: Shape[], indices: number[]): Shape[] {
  const targets = new Set(indices);
  return shapes.filter((_, index) => !targets.has(index));
}

// ── 历史栈 ───────────────────────────────────────────────────

export interface HistoryState {
  /** 每一项都是一次完整的形状快照（Shape[]） */
  states: Shape[][];
  /** 当前所处的历史位置，-1 表示尚未开始 */
  cursor: number;
}

export const HISTORY_LIMIT = 60;

export function createHistory(shapes: Shape[] = []): HistoryState {
  return { states: [shapes], cursor: 0 };
}

/** 当前应渲染的形状集合。 */
export function currentShapes(history: HistoryState): Shape[] {
  return history.states[history.cursor] ?? [];
}

export function pushHistory(history: HistoryState, shapes: Shape[]): HistoryState {
  const trimmed = history.states.slice(0, history.cursor + 1);
  const next = [...trimmed, shapes];
  const overflow = Math.max(0, next.length - HISTORY_LIMIT);
  return { states: next.slice(overflow), cursor: next.length - 1 - overflow };
}

export function undo(history: HistoryState): HistoryState {
  if (history.cursor <= 0) return history;
  return { ...history, cursor: history.cursor - 1 };
}

export function redo(history: HistoryState): HistoryState {
  if (history.cursor >= history.states.length - 1) return history;
  return { ...history, cursor: history.cursor + 1 };
}

export function canUndo(history: HistoryState): boolean {
  return history.cursor > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.cursor < history.states.length - 1;
}

// ── 裁剪 ─────────────────────────────────────────────────────

/** 把裁剪框夹到画布范围内，并保证宽高至少为 1。 */
export function clampCrop(rect: Rect, canvasWidth: number, canvasHeight: number): Rect {
  const x = Math.min(Math.max(0, Math.round(rect.x)), Math.max(0, canvasWidth - 1));
  const y = Math.min(Math.max(0, Math.round(rect.y)), Math.max(0, canvasHeight - 1));
  const width = Math.min(Math.max(1, Math.round(rect.width)), canvasWidth - x);
  const height = Math.min(Math.max(1, Math.round(rect.height)), canvasHeight - y);
  return { x, y, width, height };
}

/** 裁剪时同步偏移所有形状的坐标。 */
export function shiftShapesForCrop(shapes: Shape[], dx: number, dy: number): Shape[] {
  return translateShapes(
    shapes,
    shapes.map((_, index) => index),
    dx,
    dy,
  );
}

// ── 序列化 ───────────────────────────────────────────────────

export function shapesToJson(shapes: Shape[]): string {
  return JSON.stringify(shapes, null, 2);
}

export function shapesFromJson(text: string): { shapes: Shape[]; error?: string } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return { shapes: [], error: '内容必须是数组' };
    const valid = parsed.filter(isShape);
    return { shapes: valid };
  } catch (error) {
    return { shapes: [], error: error instanceof Error ? error.message : 'JSON 解析失败' };
  }
}

function isShape(value: unknown): value is Shape {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Shape>;
  if (typeof candidate.id !== 'string' || typeof candidate.tool !== 'string') return false;
  if (!(candidate.tool in TOOL_LABELS)) return false;
  return true;
}

let seq = 0;

/** 生成稳定且唯一的形状 ID。 */
export function newShapeId(tool: ToolId): string {
  seq += 1;
  return `${tool}-${seq}-${Math.round(performance.now())}`;
}
