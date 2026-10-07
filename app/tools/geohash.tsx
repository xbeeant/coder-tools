import { AlertTriangle, Copy, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  decodeGeohash,
  decodePlusCode,
  describeGeohash,
  encodeGeohash,
  encodePlusCode,
  extractGeoJsonPoint,
  GEOHASH_PRECISION_TABLE,
  type GeohashInfo,
  geohashBits,
  geohashNeighbors,
  haversineDistance,
  isFullPlusCode,
  isShortPlusCode,
  PLUS_CODE_PRECISION_TABLE,
  type PlusCodeArea,
  parseCoordinateText,
  recoverNearestPlusCode,
  validateCoordinate,
} from '../lib/geohash';

type CodeKind = 'geohash' | 'plus';
type Tab = 'codec' | 'neighbors' | 'compare' | 'batch';

type DecodedResult =
  | { ok: false; error: string }
  | { ok: true; kind: 'geohash'; info: GeohashInfo; edge: number }
  | { ok: true; kind: 'plus'; area: PlusCodeArea; edge: number }
  | { ok: true; kind: 'short'; recovered: string };

const NEIGHBOR_LABELS: { key: string; label: string; hint: string }[] = [
  { key: 'nw', label: '西北', hint: '上左' },
  { key: 'n', label: '北', hint: '正上' },
  { key: 'ne', label: '东北', hint: '上右' },
  { key: 'w', label: '西', hint: '正左' },
  { key: 'center', label: '本格', hint: '自身' },
  { key: 'e', label: '东', hint: '正右' },
  { key: 'sw', label: '西南', hint: '下左' },
  { key: 's', label: '南', hint: '正下' },
  { key: 'se', label: '东南', hint: '下右' },
];

const KM_PER_DEGREE = 111.32;

function fmt(value: number, digits = 6): string {
  return value.toFixed(digits);
}

/** 中心点到格边界的近似距离（赤道处度量，高纬会偏小）。 */
function edgeDistance(latSpan: number, lonSpan: number, center: { latitude: number }): number {
  const north = haversineDistance(center.latitude, 0, center.latitude + latSpan / 2, 0).meters;
  const east =
    haversineDistance(center.latitude, 0, center.latitude, lonSpan / 2).meters *
    Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180));
  return Math.max(north, east);
}

export default function GeohashTool() {
  const [tab, setTab] = useState<Tab>('codec');
  const [kind, setKind] = useState<CodeKind>('geohash');
  const [latText, setLatText] = useState('30.525412');
  const [lonText, setLonText] = useState('114.254421');
  const [precision, setPrecision] = useState(9);
  const [codeInput, setCodeInput] = useState('wt3jxuvx');
  const [geoJsonInput, setGeoJsonInput] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [pointA, setPointA] = useState('30.000000, 121.500000');
  const [pointB, setPointB] = useState('39.900000, 116.400000');

  const encoded = useMemo<{ ok: true; value: string } | { ok: false; error: string }>(() => {
    const latitude = Number(latText);
    const longitude = Number(lonText);
    if (latText.trim() === '' || lonText.trim() === '') return { ok: false, error: '请填写纬度与经度' };
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      return { ok: false, error: '纬度与经度都必须是数字' };
    const check = validateCoordinate(latitude, longitude);
    if (!check.ok) return { ok: false, error: check.error ?? '坐标非法' };
    try {
      return {
        ok: true,
        value:
          kind === 'geohash'
            ? encodeGeohash(latitude, longitude, precision)
            : encodePlusCode(latitude, longitude, precision),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [kind, latText, lonText, precision]);

  const decoded = useMemo<DecodedResult>(() => {
    const raw = codeInput.trim();
    if (!raw) return { ok: false, error: '' };
    try {
      if (raw.includes('+')) {
        if (isFullPlusCode(raw)) {
          const area = decodePlusCode(raw);
          const span = area.box.latitude[1] - area.box.latitude[0];
          const lonSpan = area.box.longitude[1] - area.box.longitude[0];
          return { ok: true, kind: 'plus', area, edge: edgeDistance(span, lonSpan, area.center) };
        }
        if (isShortPlusCode(raw)) {
          const parsed = parseCoordinateText(latText.trim() ? `${latText},${lonText}` : '');
          if (!parsed.ok) return { ok: false, error: '短码需要参考坐标：请先填写左侧纬度/经度' };
          return { ok: true, kind: 'short', recovered: recoverNearestPlusCode(raw, parsed.latitude, parsed.longitude) };
        }
        return { ok: false, error: '不是合法的 Plus Code（含 + 但格式不对）' };
      }
      const info = describeGeohash(raw);
      return {
        ok: true,
        kind: 'geohash',
        info,
        edge: edgeDistance(info.cellSize.height, info.cellSize.width, info.center),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [codeInput, latText, lonText]);

  const bits = useMemo(() => {
    if (!codeInput.trim() || codeInput.includes('+')) return [];
    try {
      // 同一字符可能重复出现，用出现次序生成唯一标识
      const seen = new Map<string, number>();
      return geohashBits(codeInput).map((bit) => {
        const occurrence = seen.get(bit.char) ?? 0;
        seen.set(bit.char, occurrence + 1);
        return { ...bit, key: `${bit.char}-${occurrence}` };
      });
    } catch {
      return [];
    }
  }, [codeInput]);

  const neighbors = useMemo(() => {
    if (!codeInput.trim() || codeInput.includes('+')) return null;
    try {
      return { own: codeInput.trim().toLowerCase(), map: geohashNeighbors(codeInput) };
    } catch {
      return null;
    }
  }, [codeInput]);

  const hierarchy = useMemo(() => {
    if (!codeInput.trim() || codeInput.includes('+')) return [];
    const own = codeInput.trim().toLowerCase();
    const levels: { level: number; prefix: string; widthKm: number; heightKm: number }[] = [];
    for (let level = 1; level <= own.length; level++) {
      const prefix = own.slice(0, level);
      try {
        const box = decodeGeohash(prefix);
        const centerLat = (box.latitude[0] + box.latitude[1]) / 2;
        const latKm = (box.latitude[1] - box.latitude[0]) * KM_PER_DEGREE;
        const lonKm =
          (box.longitude[1] - box.longitude[0]) * KM_PER_DEGREE * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
        levels.push({ level, prefix, widthKm: lonKm, heightKm: latKm });
      } catch {
        break;
      }
    }
    return levels;
  }, [codeInput]);

  const compare = useMemo(() => {
    const latitude = Number(latText);
    const longitude = Number(lonText);
    const check = validateCoordinate(latitude, longitude);
    if (!check.ok) return null;
    const geo = encodeGeohash(latitude, longitude, 9);
    const plus = encodePlusCode(latitude, longitude, 11);
    return { latitude, longitude, geo, plus, decimal: `${fmt(latitude, 6)}, ${fmt(longitude, 6)}` };
  }, [latText, lonText]);

  const batch = useMemo(() => {
    const lines = batchInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.map((line, index) => {
      const parsed = parseCoordinateText(line);
      if (!parsed.ok) return { line, index: index + 1, error: parsed.error };
      try {
        return {
          line,
          index: index + 1,
          geohash: encodeGeohash(parsed.latitude, parsed.longitude, 9),
          plus: encodePlusCode(parsed.latitude, parsed.longitude, 11),
          center: `${fmt(parsed.latitude)}, ${fmt(parsed.longitude)}`,
        };
      } catch (error) {
        return { line, index: index + 1, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }, [batchInput]);

  const distance = useMemo(() => {
    const a = parseCoordinateText(pointA);
    const b = parseCoordinateText(pointB);
    if (!a.ok) return { error: `点 A：${a.error}` };
    if (!b.ok) return { error: `点 B：${b.error}` };
    return { data: haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude) };
  }, [pointA, pointB]);

  const geoJson = useMemo(() => extractGeoJsonPoint(geoJsonInput), [geoJsonInput]);

  return (
    <ToolPanel
      title="Geohash 编解码"
      description="坐标与短串互转，支持 Geohash 与 Plus Code（Open Location Code），全部本地计算"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="codec">编解码</TabsTrigger>
            <TabsTrigger value="neighbors">邻居与前缀</TabsTrigger>
            <TabsTrigger value="compare">多方案对比</TabsTrigger>
            <TabsTrigger value="batch">批量与工具</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'codec' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section
              title="坐标 → 编码"
              actions={
                <div className="flex items-center gap-1.5">
                  <Select
                    ariaLabel="编码方式"
                    value={kind}
                    onChange={(value) => setKind(value === 'plus' ? 'plus' : 'geohash')}
                    selectClassName="h-7 w-28"
                    options={[
                      { value: 'geohash', label: 'Geohash' },
                      { value: 'plus', label: 'Plus Code' },
                    ]}
                  />
                  <ClearButton
                    onClick={() => {
                      setLatText('');
                      setLonText('');
                    }}
                    disabled={!latText && !lonText}
                  />
                </div>
              }
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <TextField label="纬度" value={latText} onChange={setLatText} placeholder="-90 ~ 90" hint="必填" />
                <TextField label="经度" value={lonText} onChange={setLonText} placeholder="-180 ~ 180" hint="必填" />
                <TextField
                  label={kind === 'geohash' ? '精度（1~12 位）' : '长度（2~15 位）'}
                  value={String(precision)}
                  onChange={(value) => setPrecision(Number.parseInt(value, 10) || 1)}
                  hint={kind === 'geohash' ? '默认 9 位' : '默认 11 位（推荐）'}
                />
              </div>
              {encoded.ok ? (
                <ResultBox
                  label="编码结果"
                  value={encoded.value}
                  onCopy={() => copyText(encoded.value)}
                  rows="min-h-12"
                />
              ) : (
                <Note tone="danger" title="坐标校验未通过">
                  {encoded.error}
                </Note>
              )}
              {encoded.ok && (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setCodeInput(encoded.value);
                    if (kind === 'geohash') setKind('geohash');
                  }}
                >
                  送到右侧解码
                </Button>
              )}
              <Hint>
                Geohash 使用 base32（0-9 与 bcdfghjkmnpqrstuvwxy，不含 a/e/o/u/l），Plus Code 使用 23456789CFGHJMPQRVWX
                并在第 8 位后加分隔符 +。
              </Hint>
            </Section>

            <Section
              title="编码 → 坐标"
              description="输入 Geohash 或 Plus Code，输出中心点、边界框与格子尺寸"
              actions={<ClearButton onClick={() => setCodeInput('')} disabled={!codeInput} />}
            >
              <TextField
                label="编码"
                value={codeInput}
                onChange={setCodeInput}
                placeholder="wt3jxuvx 或 8FVC9G8F+6X"
                hint="自动识别类型：包含 + 即按 Plus Code 解析"
              />
              {decoded.ok === false ? (
                decoded.error ? (
                  <Note tone="danger" title="解析失败">
                    {decoded.error}
                  </Note>
                ) : (
                  <EmptyHint>输入编码后查看中心点与边界</EmptyHint>
                )
              ) : decoded.kind === 'short' ? (
                <div className="flex flex-col gap-2">
                  <Note tone="warn" title="这是短码（Short Code）">
                    短码缺少前缀，需要参考坐标才能定位。已用左侧坐标还原：
                  </Note>
                  <ResultBox
                    label="还原后的完整码"
                    value={decoded.recovered}
                    onCopy={() => copyText(decoded.recovered)}
                    rows="min-h-10"
                  />
                </div>
              ) : decoded.kind === 'geohash' ? (
                <div className="flex flex-col gap-2">
                  <StatGrid className="grid-cols-2">
                    <Stat label="中心纬度" value={fmt(decoded.info.center.latitude)} />
                    <Stat label="中心经度" value={fmt(decoded.info.center.longitude)} />
                    <Stat
                      label="纬度边界"
                      value={`${fmt(decoded.info.box.latitude[0], 4)} ~ ${fmt(decoded.info.box.latitude[1], 4)}`}
                    />
                    <Stat
                      label="经度边界"
                      value={`${fmt(decoded.info.box.longitude[0], 4)} ~ ${fmt(decoded.info.box.longitude[1], 4)}`}
                    />
                    <Stat
                      label="格子尺寸"
                      value={`${decoded.info.cellSize.height.toFixed(5)}° × ${decoded.info.cellSize.width.toFixed(5)}°`}
                      hint="纬向 × 经向"
                    />
                    <Stat
                      label="中心到边界"
                      value={`${(decoded.edge / 1000).toFixed(2)} km`}
                      hint="取南北东西中较大者"
                      tone="warn"
                    />
                  </StatGrid>
                  <p className="text-[11px] text-muted-foreground">
                    纬度误差 ±{fmt(decoded.info.latitudeError)}°，经度误差 ±{fmt(decoded.info.longitudeError)}°
                  </p>
                </div>
              ) : decoded.kind === 'plus' ? (
                <div className="flex flex-col gap-2">
                  <StatGrid className="grid-cols-2">
                    <Stat label="中心纬度" value={fmt(decoded.area.center.latitude, 8)} />
                    <Stat label="中心经度" value={fmt(decoded.area.center.longitude, 8)} />
                    <Stat
                      label="纬度边界"
                      value={`${fmt(decoded.area.box.latitude[0], 6)} ~ ${fmt(decoded.area.box.latitude[1], 6)}`}
                    />
                    <Stat
                      label="经度边界"
                      value={`${fmt(decoded.area.box.longitude[0], 6)} ~ ${fmt(decoded.area.box.longitude[1], 6)}`}
                    />
                    <Stat label="有效位数" value={`${decoded.area.codeLength} 位`} />
                    <Stat
                      label="中心到边界"
                      value={`${(decoded.edge / 1000).toFixed(2)} km`}
                      hint="10 位约 13m"
                      tone="warn"
                    />
                  </StatGrid>
                </div>
              ) : null}
            </Section>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="Geohash 精度表" description="1~12 位对应的格子大小（赤道处近似）">
              <div className="max-h-64 overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        位数
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        位数(bits)
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        格子尺寸
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        示例
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {GEOHASH_PRECISION_TABLE.map((row) => (
                      <tr key={row.length} className="border-t">
                        <td className="px-2 py-1 font-mono">{row.length}</td>
                        <td className="px-2 py-1 font-mono">{row.bits}</td>
                        <td className="px-2 py-1 font-mono">
                          {row.latKm < 1 ? `${(row.latKm * 1000).toFixed(1)} m` : `${row.latKm.toFixed(1)} km`} ×{' '}
                          {row.lonKm < 1 ? `${(row.lonKm * 1000).toFixed(1)} m` : `${row.lonKm.toFixed(1)} km`}
                        </td>
                        <td className="px-2 py-1 font-mono">{row.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Plus Code 长度表" description="2~15 位对应的格子大小（10 位约 13m）">
              <div className="max-h-64 overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        位数
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        格子尺寸
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        说明
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLUS_CODE_PRECISION_TABLE.map((row) => (
                      <tr key={row.digits} className="border-t">
                        <td className="px-2 py-1 font-mono">{row.digits}</td>
                        <td className="px-2 py-1 font-mono">
                          {row.latMeters < 1
                            ? `${(row.latMeters * 100).toFixed(2)} cm`
                            : `${row.latMeters.toFixed(2)} m`}{' '}
                          ×{' '}
                          {row.lonMeters < 1
                            ? `${(row.lonMeters * 100).toFixed(2)} cm`
                            : `${row.lonMeters.toFixed(2)} m`}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Note tone="warn" title="Geohash 是近似矩形格">
            <span className="inline-flex items-start gap-1">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              格子是经纬度上的矩形块，不是正方形：越靠近两极东西向越大。相邻编码在格子边界处会「跳变」，
              前缀相同也不代表距离一定近。精确点位（如门牌、POI）建议存原始经纬度，Geohash 只适合做粗筛与分区索引。
            </span>
          </Note>
        </>
      )}

      {tab === 'neighbors' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="32 位二进制拆分" description="每个 base32 字符对应 5 位，经纬交替（经度在前）">
              <TextField
                label="Geohash"
                value={codeInput}
                onChange={setCodeInput}
                placeholder="wt3jxuvx"
                hint="与「编解码」共用同一个输入框"
              />
              {bits.length === 0 ? (
                <EmptyHint>输入不含 + 的 Geohash 查看位拆分</EmptyHint>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/60">
                        <tr>
                          <th scope="col" className="px-2 py-1.5 font-medium">
                            字符
                          </th>
                          <th scope="col" className="px-2 py-1.5 font-medium">
                            索引
                          </th>
                          <th scope="col" className="px-2 py-1.5 font-medium">
                            5 位含义
                          </th>
                          <th scope="col" className="px-2 py-1.5 font-medium">
                            归属
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bits.map((bit) => (
                          <tr key={bit.key} className="border-t">
                            <td className="px-2 py-1 font-mono">{bit.char}</td>
                            <td className="px-2 py-1 font-mono">{bit.index}</td>
                            <td className="px-2 py-1 font-mono tracking-widest">{bit.binary}</td>
                            <td className="px-2 py-1 text-muted-foreground">{bit.dimensions.join(' / ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ResultBox
                    label="完整二进制"
                    value={bits.map((bit) => bit.binary).join('')}
                    onCopy={() => copyText(bits.map((bit) => bit.binary).join(''))}
                    rows="min-h-10"
                  />
                </>
              )}
            </Section>

            <Section title="相邻格子" description="九宫格邻居：按格子大小做经纬度偏移后重新编码（跨极点会自动收敛）">
              {!neighbors ? (
                <EmptyHint>输入不含 + 的 Geohash 查看邻居</EmptyHint>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {NEIGHBOR_LABELS.map((item) => {
                      const value = neighbors.map[item.key];
                      const isSelf = item.key === 'center';
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => value && setCodeInput(value)}
                          aria-label={`${item.label}邻居 ${value ?? ''}`}
                          className={`rounded-md border px-2 py-1.5 text-left transition-colors hover:border-primary/60 hover:bg-accent/50 ${
                            isSelf ? 'border-primary/70 bg-accent/60' : ''
                          }`}
                        >
                          <span className="block text-[10px] text-muted-foreground">
                            {item.label} · {item.hint}
                          </span>
                          <span className="block font-mono text-[11px] break-all">{value}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Hint>
                    邻居算法使用「中心点 ± 格子尺寸」近似，未做进位传播，因此与逐格 bignum 进位实现相比，
                    跨边缘时可能出现一位误差；距离越远（如短码）误差越明显。
                  </Hint>
                </>
              )}
            </Section>
          </div>

          <Section title="父子层级（前缀树）" description="前缀每加一位，格子缩小约 32 倍（面积约 /1024）">
            {hierarchy.length === 0 ? (
              <EmptyHint>输入 Geohash 查看层级树</EmptyHint>
            ) : (
              <div className="overflow-x-auto">
                <ul className="flex min-w-max flex-col gap-1">
                  {hierarchy.map((item) => (
                    <li key={item.level} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[10px] text-muted-foreground">
                        {item.level} 位（{item.level * 5} bits）
                      </span>
                      <span className="font-mono text-[11px]" style={{ paddingLeft: `${(item.level - 1) * 10}px` }}>
                        {item.prefix}
                      </span>
                      <span
                        className="h-2 rounded-full bg-primary/50"
                        style={{ width: `${Math.max(6, 220 / item.level)}px` }}
                      />
                      <span className="font-mono text-[10px] text-muted-foreground">
                        ≈{' '}
                        {item.heightKm < 1
                          ? `${(item.heightKm * 1000).toFixed(0)} m`
                          : `${item.heightKm.toFixed(1)} km`}{' '}
                        × {item.widthKm < 1 ? `${(item.widthKm * 1000).toFixed(0)} m` : `${item.widthKm.toFixed(1)} km`}
                      </span>
                      {item.level === 3 && (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          前 3 位相同 ≈ 同一 150 km 级区域
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Hint>前缀关系可直接用于数据库索引：只按前 4~5 位建索引即可把候选集缩小到街区级，再做精确距离过滤。</Hint>
          </Section>
        </>
      )}

      {tab === 'compare' && (
        <>
          <Section title="同一坐标的四种表达" description="输入坐标后并列对比，便于按场景选型">
            <div className="grid gap-2 sm:grid-cols-3">
              <TextField label="纬度" value={latText} onChange={setLatText} placeholder="-90 ~ 90" />
              <TextField label="经度" value={lonText} onChange={setLonText} placeholder="-180 ~ 180" />
              <div className="flex items-end">
                <Button size="sm" variant="ghost" onClick={() => setLatText('30.525412')}>
                  <MapPin className="size-3.5" />
                  恢复示例
                </Button>
              </div>
            </div>
            {!compare ? (
              <Note tone="danger" title="坐标非法">
                请先修正左侧纬度/经度：纬度需在 -90~90，经度需在 -180~180
              </Note>
            ) : (
              <div className="grid gap-2 lg:grid-cols-4">
                <div className="rounded-md border px-2.5 py-2">
                  <p className="text-[11px] font-medium">Geohash（9 位）</p>
                  <p className="my-1 font-mono text-sm break-all">{compare.geo}</p>
                  <p className="text-[11px] text-muted-foreground">长度 {compare.geo.length} 字符</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    优点：短、前缀可分组、数据库与 Redis 常用。缺点：字母表小易混淆，格子非正方形且边界会跳变。
                  </p>
                </div>
                <div className="rounded-md border px-2.5 py-2">
                  <p className="text-[11px] font-medium">Plus Code（11 位）</p>
                  <p className="my-1 font-mono text-sm break-all">{compare.plus}</p>
                  <p className="text-[11px] text-muted-foreground">长度 {compare.plus.length} 字符</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    优点：Google 官方标准、10 位即 13m、单字符可继续细分、可短码。缺点：需要参考坐标还原前缀。
                  </p>
                </div>
                <div className="rounded-md border px-2.5 py-2">
                  <p className="text-[11px] font-medium">Base32（geohstd 明细）</p>
                  <p className="my-1 font-mono text-sm tracking-widest">{compare.geo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    逐字符索引：
                    {geohashBits(compare.geo)
                      .map((bit) => `${bit.char}=${bit.index}`)
                      .join(' ')}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    优点：看清字符与 5 位二进制的对应关系，便于手算与调试。缺点：仅是编码细节，不适合直接展示给用户。
                  </p>
                </div>
                <div className="rounded-md border px-2.5 py-2">
                  <p className="text-[11px] font-medium">十进制度数</p>
                  <p className="my-1 font-mono text-sm break-all">{compare.decimal}</p>
                  <p className="text-[11px] text-muted-foreground">精度约 1 m（6 位小数）</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    优点：无损、可排序、通用。缺点：位数多、不可读、不便于人脑传播与口述。
                  </p>
                </div>
              </div>
            )}
          </Section>
          <Note tone="info" title="选型建议">
            存储与检索用 Geohash 或 Plus Code 做粗筛，最终定位保留原始经纬度；对外展示地址用 Plus Code， 离线索引与短 ID
            用 Geohash。
          </Note>
        </>
      )}

      {tab === 'batch' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section
              title="批量编码"
              description="每行一条「纬度,经度」"
              actions={<ClearButton onClick={() => setBatchInput('')} disabled={!batchInput} />}
            >
              <Textarea
                value={batchInput}
                onChange={(event) => setBatchInput(event.target.value)}
                placeholder={'39.900000,116.400000\n31.230000,121.470000\n22.543000,114.058000'}
                spellCheck={false}
                className="min-h-28 resize-none font-mono text-xs"
              />
              {batch.length > 0 && (
                <div className="overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/60">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          #
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          坐标
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          Geohash
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          Plus Code
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.map((row) => (
                        <tr key={`${row.index}-${row.line}`} className="border-t align-top">
                          <td className="px-2 py-1 font-mono text-muted-foreground">{row.index}</td>
                          <td className="px-2 py-1 font-mono">
                            {row.error ? (
                              <span className="text-destructive">
                                {row.line}（{row.error}）
                              </span>
                            ) : (
                              row.center
                            )}
                          </td>
                          <td className="px-2 py-1 font-mono">'geohash' in row ? row.geohash : '-'</td>
                          <td className="px-2 py-1 font-mono">'plus' in row ? row.plus : '-'</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="两点距离（haversine）" description="球面大圆距离，适合估算直线距离">
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField label="点 A（纬度,经度）" value={pointA} onChange={setPointA} placeholder="30.0,121.5" />
                <TextField label="点 B（纬度,经度）" value={pointB} onChange={setPointB} placeholder="39.9,116.4" />
              </div>
              {distance.error ? (
                <Note tone="danger" title="坐标校验未通过">
                  {distance.error}
                </Note>
              ) : distance.data ? (
                <StatGrid>
                  <Stat label="距离" value={`${distance.data.kilometers.toFixed(3)} km`} tone="success" />
                  <Stat label="英里" value={`${distance.data.miles.toFixed(3)} mi`} />
                  <Stat label="米" value={`${distance.data.meters.toFixed(1)} m`} />
                  <Stat label="地球半径" value="6371 km" hint="WGS84 平均半径近似" />
                </StatGrid>
              ) : null}
              <Hint>未考虑海拔与实际路网；导航距离请用路径规划服务。</Hint>
            </Section>
          </div>

          <Section
            title="从 GeoJSON 提取坐标"
            description="支持 Feature、FeatureCollection、Point 几何或坐标数组"
            actions={<ClearButton onClick={() => setGeoJsonInput('')} disabled={!geoJsonInput} />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Textarea
                value={geoJsonInput}
                onChange={(event) => setGeoJsonInput(event.target.value)}
                placeholder='{"type":"Feature","geometry":{"type":"Point","coordinates":[114.254421,30.525412]}}'
                spellCheck={false}
                className="min-h-32 resize-none font-mono text-xs"
              />
              <div className="flex flex-col gap-2">
                {!geoJsonInput.trim() ? (
                  <EmptyHint>粘贴 GeoJSON 后自动提取第一个 Point 并编码</EmptyHint>
                ) : geoJson.ok ? (
                  <>
                    <StatGrid>
                      <Stat label="纬度" value={fmt(geoJson.data.latitude)} />
                      <Stat label="经度" value={fmt(geoJson.data.longitude)} />
                      <Stat label="Geohash" value={encodeGeohash(geoJson.data.latitude, geoJson.data.longitude, 9)} />
                      <Stat
                        label="Plus Code"
                        value={encodePlusCode(geoJson.data.latitude, geoJson.data.longitude, 11)}
                      />
                    </StatGrid>
                    {geoJson.data.found > 1 && (
                      <Hint>文档中共找到 {geoJson.data.found} 个 Point 坐标，这里只用了第一个。</Hint>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      onClick={() => {
                        setLatText(fmt(geoJson.data.latitude));
                        setLonText(fmt(geoJson.data.longitude));
                        setTab('codec');
                      }}
                    >
                      载入到编解码
                    </Button>
                  </>
                ) : (
                  <Note tone="danger" title="提取失败">
                    {geoJson.error}
                  </Note>
                )}
              </div>
            </div>
          </Section>
        </>
      )}

      <Note tone="info" title="关于本工具">
        <span className="inline-flex items-start gap-1">
          <Copy className="mt-0.5 size-3 shrink-0" />
          Plus Code 遵循 openlocationcode.js 的官方算法（含 5×4 网格细分与短码还原）；Geohash 使用标准 base32
          字母表，不含 a、e、i、o、u、l。所有计算都在本地完成，不发起任何请求。
        </span>
      </Note>
    </ToolPanel>
  );
}
