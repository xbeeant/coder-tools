import { Copy, Image as ImageIcon, Lock, RefreshCw, Shuffle, Unlock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  averageColor,
  BLACK,
  buildRamp,
  contrastRatio,
  contrastReport,
  cssValue,
  formatAll,
  gradientCss,
  HARMONY_OPTIONS,
  type HarmonyName,
  harmony,
  harmonyLabel,
  kMeansPalette,
  mixColors,
  NAMED_COLORS,
  normalizeInput,
  parseColor,
  type RGB,
  rampStepsFor,
  rampToCssVariables,
  rampToJson,
  rampToScss,
  rampToTailwind,
  randomScheme,
  rgbToHex,
  toCssVariablesBlock,
  toJson,
  toKotlin,
  toObjC,
  toScssVariables,
  toSwift,
  toTailwindConfig,
  vibrantColor,
  WHITE,
} from '../lib/color';
import { downloadText, pickFiles } from '../lib/file';
import { MAX_IMAGE_BYTES } from '../lib/image';

const HISTORY_KEY = 'coder-tools:color-history';
const HISTORY_LIMIT = 24;

const FORMAT_ROWS: { key: keyof ReturnType<typeof formatAll>; label: string }[] = [
  { key: 'hex', label: 'HEX' },
  { key: 'hexShort', label: 'HEX 缩写' },
  { key: 'hex8', label: 'HEX8（含 alpha）' },
  { key: 'rgb', label: 'RGB' },
  { key: 'rgba', label: 'RGBA' },
  { key: 'rgbArray', label: 'RGB 数组' },
  { key: 'rgbObject', label: 'RGB 对象' },
  { key: 'hsl', label: 'HSL' },
  { key: 'hsla', label: 'HSLA' },
  { key: 'hsv', label: 'HSV / HSB' },
  { key: 'cmyk', label: 'CMYK' },
  { key: 'lab', label: 'LAB' },
  { key: 'lch', label: 'LCH' },
  { key: 'oklch', label: 'OKLCH' },
  { key: 'oklab', label: 'OKLAB' },
  { key: 'named', label: 'CSS 命名色' },
  { key: 'css', label: 'CSS 值' },
  { key: 'cssVariable', label: 'CSS 变量' },
  { key: 'swift', label: 'Swift UIKit' },
  { key: 'swiftUI', label: 'SwiftUI' },
  { key: 'kotlin', label: 'Kotlin Compose' },
  { key: 'java', label: 'Java AWT' },
  { key: 'objc', label: 'Objective-C' },
];

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function ColorConverter() {
  const [input, setInput] = useState('#3b82f6');
  const [tab, setTab] = useState('convert');
  const [history, setHistory] = useState<string[]>(readHistory);
  const [rampCount, setRampCount] = useState(11);
  const [harmonyName, setHarmonyName] = useState<HarmonyName>('analogous');
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [gradientAngle, setGradientAngle] = useState(135);
  const [gradientMidpoints, setGradientMidpoints] = useState(2);
  const [lockIndexes, setLockIndexes] = useState<boolean[]>([]);
  const [autoLock, setAutoLock] = useState(false);
  const [paletteName, setPaletteName] = useState('brand');
  const [imagePalette, setImagePalette] = useState<{ palette: RGB[]; average: RGB | null; vibrant: RGB | null } | null>(
    null,
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const color = useMemo(() => parseColor(normalizeInput(input)), [input]);
  const formats = useMemo(() => (color ? formatAll(color, paletteName) : null), [color, paletteName]);

  const pushHistory = useCallback((hex: string) => {
    setHistory((prev) => [hex, ...prev.filter((item) => item !== hex)].slice(0, HISTORY_LIMIT));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // storage 不可用时静默失败
    }
  }, [history]);

  useEffect(() => {
    if (color && color.a > 0) pushHistory(rgbToHex(color));
  }, [color, pushHistory]);

  const contrast = useMemo(() => (color ? contrastReport(color) : null), [color]);
  const onBlack = useMemo(() => (color ? contrastRatio({ ...color, a: 1 }, BLACK) : 0), [color]);
  const onWhite = useMemo(() => (color ? contrastRatio({ ...color, a: 1 }, WHITE) : 0), [color]);
  const steps = useMemo(() => rampStepsFor(rampCount), [rampCount]);
  const ramp = useMemo(() => (color ? buildRamp(color, steps) : []), [color, steps]);
  const scheme = useMemo(() => (color ? harmony(color, harmonyName) : []), [color, harmonyName]);
  const schemeWithLocks = useMemo(() => {
    if (!color) return [];
    const generated = harmony(color, harmonyName);
    return generated.map((item, index) => (lockIndexes[index] ? generated[index] : item));
  }, [color, harmonyName, lockIndexes]);

  const gradientColors = useMemo(() => {
    const base = scheme.length >= 2 ? scheme : [color ?? BLACK, mixColors(color ?? WHITE, BLACK, 0.4)];
    return base.slice(0, 3);
  }, [scheme, color]);
  const gradient = useMemo(
    () =>
      gradientCss({ type: gradientType, angle: gradientAngle, stops: gradientColors, midpoints: gradientMidpoints }),
    [gradientType, gradientAngle, gradientColors, gradientMidpoints],
  );

  const randomPalette = useCallback(() => {
    const next = randomScheme(
      harmonyName,
      schemeWithLocks.map((_, index) => (lockIndexes[index] ? schemeWithLocks[index] : null)),
    );
    const hexes = next.map((item) => rgbToHex(item));
    setInput(hexes[0]);
    setLockIndexes(lockIndexes.map((value, index) => value || (autoLock && index > 0)));
  }, [harmonyName, schemeWithLocks, lockIndexes, autoLock]);

  const pickImage = useCallback(async () => {
    setImageBusy(true);
    setImageError(null);
    try {
      const files = await pickFiles({ accept: 'image/*', multiple: false });
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError(`图片超过 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB，已拒绝读取`);
        return;
      }
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('无法创建绘图上下文');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      imageCanvasRef.current?.remove();
      canvas.className = 'max-h-24 rounded border';
      canvas.setAttribute('aria-label', '取色用的图片缩略图');
      imageCanvasRef.current = canvas;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      setImagePalette({
        palette: kMeansPalette(pixels, 8),
        average: averageColor(pixels),
        vibrant: vibrantColor(pixels),
      });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : '读取图片失败');
      setImagePalette(null);
    } finally {
      setImageBusy(false);
    }
  }, []);

  const applyColor = useCallback((value: RGB | string) => {
    setInput(typeof value === 'string' ? value : rgbToHex(value));
  }, []);

  const swatchTextClass = (swatch: RGB) =>
    contrastReport(swatch).bestForeground === 'black' ? 'text-black' : 'text-white';

  return (
    <ToolPanel
      title="颜色转换器"
      description="HEX / RGB / HSL / HSV / CMYK / LAB / LCH / OKLCH 全格式互转、对比度与配色生成"
      actions={
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={color && color.a > 0 ? rgbToHex(color) : '#000000'}
            onChange={(event) => setInput(event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border bg-background p-0.5"
            aria-label="取色器"
          />
          <Button size="sm" variant="ghost" onClick={() => setInput(rgbToHex(randomScheme(harmonyName, [])[0]))}>
            <Shuffle className="size-3.5" />
            随机
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {/* 左栏：输入 + 历史 */}
        <div className="flex flex-col gap-2.5">
          <Section
            title="颜色输入"
            description="支持 HEX / RGB / HSL / HSV / CMYK / LAB / LCH / OKLCH / 命名色 / transparent"
          >
            <TextField
              label="颜色值"
              value={input}
              onChange={setInput}
              placeholder="#3b82f6"
              hint={color ? '解析成功' : '无法识别该格式'}
            />
            {color && (
              <div
                className="flex h-16 items-end justify-between rounded-md border px-3 py-1.5 font-mono text-xs"
                style={{
                  background: cssValue(color),
                  color: contrastReport(color).bestForeground === 'black' ? '#000' : '#fff',
                }}
              >
                <span>{rgbToHex(color)}</span>
                <span className="text-[10px]">示例文字 Sample</span>
              </div>
            )}
            {!color && <Note tone="danger">输入无法解析为有效颜色，请检查格式。</Note>}
          </Section>

          <Section title="历史记录" description={`保留最近 ${HISTORY_LIMIT} 个颜色（存于 localStorage）`}>
            {history.length === 0 ? (
              <EmptyHint>还没有历史颜色</EmptyHint>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {history.map((hex) => {
                  const parsed = parseColor(hex);
                  if (!parsed) return null;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => applyColor(hex)}
                      className={`size-7 rounded border ${swatchTextClass(parsed)}`}
                      style={{ background: cssValue(parsed) }}
                      aria-label={`使用颜色 ${hex}`}
                      title={hex}
                    >
                      <span className="sr-only">{hex}</span>
                    </button>
                  );
                })}
                <Button size="sm" variant="ghost" onClick={() => setHistory([])}>
                  清空
                </Button>
              </div>
            )}
          </Section>

          <Section
            title="从图片取色"
            description="本地解析，不上传任何文件"
            actions={
              <Button size="sm" variant="outline" onClick={() => void pickImage()} disabled={imageBusy}>
                <ImageIcon className="size-3.5" />
                {imageBusy ? '解析中…' : '选择图片'}
              </Button>
            }
          >
            <div
              ref={(node) => {
                if (node && imageCanvasRef.current) node.appendChild(imageCanvasRef.current);
              }}
              className="min-h-6"
            />
            {imageError && <Note tone="danger">{imageError}</Note>}
            {imagePalette ? (
              <div className="flex flex-col gap-2">
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">量化色板（k-means，Top 8）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {imagePalette.palette.map((item) => (
                      <button
                        key={rgbToHex(item)}
                        type="button"
                        onClick={() => applyColor(item)}
                        className={`rounded border px-2 py-1 font-mono text-[10px] ${swatchTextClass(item)}`}
                        style={{ background: cssValue(item) }}
                      >
                        {rgbToHex(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!imagePalette.average}
                    onClick={() => imagePalette.average && applyColor(imagePalette.average)}
                  >
                    平均色 {imagePalette.average ? rgbToHex(imagePalette.average) : '—'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!imagePalette.vibrant}
                    onClick={() => imagePalette.vibrant && applyColor(imagePalette.vibrant)}
                  >
                    鲜艳色 {imagePalette.vibrant ? rgbToHex(imagePalette.vibrant) : '—'}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadText('palette.json', toJson(imagePalette.palette), 'application/json')}
                >
                  <Copy className="size-3.5" />
                  导出色板 JSON
                </Button>
              </div>
            ) : (
              <EmptyHint>选择一张本地图片后显示主色</EmptyHint>
            )}
            <Hint>「鲜艳色」是简化的 vibrant 策略（综合饱和度与色偏），不等同 Android Palettable 的完整算法。</Hint>
          </Section>
        </div>

        {/* 右栏：结果 */}
        <div className="flex flex-col gap-2.5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="convert">转换</TabsTrigger>
              <TabsTrigger value="contrast">对比度</TabsTrigger>
              <TabsTrigger value="palette">色阶</TabsTrigger>
              <TabsTrigger value="scheme">配色</TabsTrigger>
              <TabsTrigger value="export">导出</TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === 'convert' && (
            <Section title="格式输出" description="点击任意行复制">
              {!formats || !color ? (
                <EmptyHint>输入有效颜色后显示全部格式</EmptyHint>
              ) : (
                <div className="flex flex-col gap-1">
                  {FORMAT_ROWS.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => copyText(formats[row.key])}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-accent"
                    >
                      <span className="shrink-0 text-[11px] text-muted-foreground">{row.label}</span>
                      <span className="min-w-0 truncate font-mono text-xs">{formats[row.key]}</span>
                    </button>
                  ))}
                </div>
              )}
            </Section>
          )}

          {tab === 'contrast' && contrast && color && (
            <div className="flex flex-col gap-2.5">
              <Section title="对比度" description="WCAG 2.x + APCA 近似">
                <StatGrid>
                  <Stat
                    label={`WCAG vs ${contrast.bestForeground === 'black' ? '黑' : '白'}`}
                    value={`${contrast.bestRatio.toFixed(2)} : 1`}
                    tone={contrast.bestRatio >= 4.5 ? 'success' : 'warn'}
                  />
                  <Stat
                    label="对黑"
                    value={`${onBlack.toFixed(2)} : 1`}
                    hint={onBlack >= 4.5 ? '黑字可读' : '黑字不可读'}
                  />
                  <Stat
                    label="对白"
                    value={`${onWhite.toFixed(2)} : 1`}
                    hint={onWhite >= 4.5 ? '白字可读' : '白字不可读'}
                  />
                  <Stat label="APCA Lc" value={contrast.lc.toFixed(1)} hint="绝对值越大越清晰" />
                </StatGrid>
                <div className="flex flex-col gap-1 text-[11px]">
                  <PassRow label="AA 普通文本（≥4.5）" pass={contrast.aaNormal} />
                  <PassRow label="AA 大字（≥3）" pass={contrast.aaLarge} />
                  <PassRow label="AAA 普通文本（≥7）" pass={contrast.aaaNormal} />
                  <PassRow label="AAA 大字（≥4.5）" pass={contrast.aaaLarge} />
                  <PassRow label="UI 组件（≥3）" pass={contrast.uiComponents} />
                </div>
              </Section>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="flex h-14 items-center justify-center rounded-md border font-mono text-xs"
                  style={{ background: rgbToHex(color), color: '#000' }}
                >
                  黑字 Aa
                </div>
                <div
                  className="flex h-14 items-center justify-center rounded-md border font-mono text-xs"
                  style={{ background: rgbToHex(color), color: '#fff' }}
                >
                  白字 Aa
                </div>
              </div>
              <Note tone="info" title="APCA 说明">
                APCA（Accessible Perceptual Contrast Algorithm）Lc 值是 WCAG 2 的下一代方案，数值范围约 -108 ~ 106，
                绝对值越大对比越强。此处实现为 APCA 0.1.9（W3）的常见近似公式，与官方数值可能有极小差异，仅供参考。
              </Note>
            </div>
          )}

          {tab === 'palette' && color && (
            <div className="flex flex-col gap-2.5">
              <Section
                title="色阶"
                description="参考 Tailwind 50~950 的明度曲线，保持色相不变"
                actions={
                  <Select
                    ariaLabel="色阶档数"
                    value={String(rampCount)}
                    onChange={(value) => setRampCount(Number(value))}
                    options={[
                      { value: '8', label: '8 级' },
                      { value: '10', label: '10 级' },
                      { value: '11', label: '11 级（Tailwind）' },
                      { value: '12', label: '12 级' },
                    ]}
                    selectClassName="h-7 w-28 text-xs"
                  />
                }
              >
                <div className="flex flex-col gap-1">
                  {ramp.map(({ step, color: swatch }) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => applyColor(swatch)}
                      className={`flex items-center justify-between rounded px-2 py-1 font-mono text-xs ${swatchTextClass(swatch)}`}
                      style={{ background: rgbToHex(swatch) }}
                    >
                      <span>{step}</span>
                      <span>{rgbToHex(swatch)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(rampToCssVariables(paletteName, color, steps))}
                  >
                    CSS 变量
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyText(rampToJson(color, steps))}>
                    JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyText(rampToScss(color, steps))}>
                    SCSS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyText(rampToTailwind(color, steps))}>
                    Tailwind
                  </Button>
                </div>
              </Section>
              <Section title="预览条">
                <div className="flex h-10 overflow-hidden rounded-md border">
                  {ramp.map(({ step, color: swatch }) => (
                    <div
                      key={step}
                      className="flex-1"
                      style={{ background: rgbToHex(swatch) }}
                      title={`${step} ${rgbToHex(swatch)}`}
                    />
                  ))}
                </div>
              </Section>
            </div>
          )}

          {tab === 'scheme' && color && (
            <div className="flex flex-col gap-2.5">
              <Section
                title="配色方案"
                actions={
                  <Select
                    ariaLabel="配色规则"
                    value={harmonyName}
                    onChange={(value) => setHarmonyName(value as HarmonyName)}
                    options={HARMONY_OPTIONS.map((option) => ({ value: option.name, label: option.label }))}
                    selectClassName="h-7 w-32 text-xs"
                  />
                }
              >
                <div className="flex flex-col gap-1">
                  {schemeWithLocks.map((item, index) => (
                    <div key={rgbToHex(item)} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyColor(item)}
                        className={`flex flex-1 items-center justify-between rounded px-2 py-1 font-mono text-xs ${swatchTextClass(item)}`}
                        style={{ background: rgbToHex(item) }}
                      >
                        <span>
                          {harmonyLabel(harmonyName)} {index + 1}
                        </span>
                        <span>{rgbToHex(item)}</span>
                      </button>
                      <Button
                        size="icon"
                        variant={lockIndexes[index] ? 'default' : 'ghost'}
                        onClick={() =>
                          setLockIndexes((prev) => {
                            const next = [...prev];
                            while (next.length < schemeWithLocks.length) next.push(false);
                            next[index] = !next[index];
                            return next;
                          })
                        }
                        aria-label={lockIndexes[index] ? `解锁第 ${index + 1} 个颜色` : `锁定第 ${index + 1} 个颜色`}
                      >
                        {lockIndexes[index] ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(schemeWithLocks.map((item) => rgbToHex(item)).join('\n'))}
                  >
                    <Copy className="size-3.5" />
                    复制 HEX 列表
                  </Button>
                  <Button size="sm" variant="outline" onClick={randomPalette}>
                    <RefreshCw className="size-3.5" />
                    随机（保留锁定）
                  </Button>
                </div>
                <Hint>锁定的颜色在随机生成时保持不变；点击锁图标可切换。</Hint>
                <Checkbox
                  label="生成后自动锁定其余颜色"
                  checked={autoLock}
                  onChange={setAutoLock}
                  hint="开启后随机生成会把未锁定的槽位也固定下来，方便逐个微调"
                />
              </Section>

              <Section
                title="渐变"
                actions={
                  <Select
                    ariaLabel="渐变类型"
                    value={gradientType}
                    onChange={(value) => setGradientType(value as 'linear' | 'radial')}
                    options={[
                      { value: 'linear', label: '线性' },
                      { value: 'radial', label: '径向' },
                    ]}
                    selectClassName="h-7 w-20 text-xs"
                  />
                }
              >
                <div
                  className="h-20 rounded-md border"
                  style={{ background: gradient || cssValue(color) }}
                  role="img"
                  aria-label="渐变预览"
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="角度"
                    value={gradientAngle}
                    onChange={setGradientAngle}
                    min={0}
                    max={360}
                    suffix="°"
                    disabled={gradientType === 'radial'}
                  />
                  <NumberField
                    label="中间停靠点"
                    value={gradientMidpoints}
                    onChange={setGradientMidpoints}
                    min={0}
                    max={8}
                    suffix="个/段"
                  />
                </div>
                <ResultBox label="CSS" value={gradient} onCopy={() => copyText(gradient)} rows="min-h-20" />
                <Hint>中间色在 OKLCH 空间插值，色相走最短弧，避免穿过灰色区。</Hint>
              </Section>
            </div>
          )}

          {tab === 'export' && color && (
            <div className="flex flex-col gap-2.5">
              <Section title="调色板名称" description="用于生成变量名">
                <TextField label="名称" value={paletteName} onChange={setPaletteName} placeholder="brand" />
              </Section>
              <Section title="导出格式" description="基于当前配色方案">
                <ResultBox
                  label="CSS 变量"
                  value={toCssVariablesBlock(schemeWithLocks, paletteName)}
                  onCopy={() => copyText(toCssVariablesBlock(schemeWithLocks, paletteName))}
                  rows="min-h-20"
                />
                <ResultBox
                  label="JSON"
                  value={toJson(schemeWithLocks)}
                  onCopy={() => copyText(toJson(schemeWithLocks))}
                  rows="min-h-24"
                />
                <ResultBox
                  label="SCSS 变量"
                  value={toScssVariables(schemeWithLocks, paletteName)}
                  onCopy={() => copyText(toScssVariables(schemeWithLocks, paletteName))}
                  rows="min-h-16"
                />
                <ResultBox
                  label="Tailwind config"
                  value={toTailwindConfig(schemeWithLocks, paletteName)}
                  onCopy={() => copyText(toTailwindConfig(schemeWithLocks, paletteName))}
                  rows="min-h-24"
                />
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Button size="sm" variant="outline" onClick={() => copyText(toKotlin(color))}>
                    复制 Kotlin
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyText(toSwift(color))}>
                    复制 Swift
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copyText(toObjC(color))}>
                    复制 Objective-C
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadText(`${paletteName}.json`, toJson(schemeWithLocks), 'application/json')}
                  >
                    下载 JSON
                  </Button>
                </div>
              </Section>
            </div>
          )}

          {tab === 'convert' && color && contrast && (
            <Section title="快速预览">
              <Textarea
                value={`background: ${cssValue(color)};\ncolor: ${contrast.bestForeground === 'black' ? '#000' : '#fff'};`}
                readOnly
                className="min-h-16 resize-none font-mono text-xs"
                aria-label="CSS 片段"
              />
            </Section>
          )}

          <Section title="CSS 命名色速查" description={`内置 ${Object.keys(NAMED_COLORS).length} 条`}>
            <div className="flex max-h-48 flex-wrap gap-1 overflow-auto">
              {Object.entries(NAMED_COLORS)
                .slice(0, 60)
                .map(([name, hex]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyColor(name)}
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px] hover:ring-1 hover:ring-primary"
                    style={{ background: hex }}
                  >
                    {name}
                  </button>
                ))}
            </div>
            <Hint>只列出前 60 条作为快捷入口；直接输入命名色可获取全部 {Object.keys(NAMED_COLORS).length} 条。</Hint>
          </Section>
        </div>
      </div>
    </ToolPanel>
  );
}

function PassRow({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border px-2 py-1">
      <span>{label}</span>
      <span className={pass ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
        {pass ? '通过' : '不通过'}
      </span>
    </div>
  );
}
