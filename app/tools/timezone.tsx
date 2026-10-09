import { Clock, Copy, Globe2, RefreshCw, Search, Sun, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  batchLines,
  COMMON_TIME_ZONES,
  describeSlot,
  dstInfo,
  formatOffset,
  formatZoned,
  fromDatetimeLocalInput,
  localTimeZone,
  meetingMatrix,
  rfc3339,
  shortZoneName,
  timeZoneList,
  toDatetimeLocalInput,
} from '../lib/tz';

const MAX_TARGETS = 8;
const DEFAULT_TARGETS = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));
const HEAT = [
  'bg-muted',
  'bg-emerald-500/20',
  'bg-emerald-500/35',
  'bg-emerald-500/50',
  'bg-emerald-500/65',
  'bg-emerald-500/80',
];

type TabKey = 'convert' | 'meeting' | 'batch' | 'clock';

function heatClass(count: number, max: number): string {
  if (max === 0) return 'bg-muted';
  return HEAT[Math.round((count / max) * (HEAT.length - 1))];
}

function useZoneFilter(query: string, extra: string[] = []): string[] {
  const zones = timeZoneList();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? zones.filter((zone) => zone.toLowerCase().includes(q)) : zones;
    // 搜索时仍把已选时区排在前面，避免勾选项被过滤掉
    return [...base.filter((zone) => extra.includes(zone)), ...base.filter((zone) => !extra.includes(zone))];
  }, [query, zones, extra]);
}

/** 可搜索的 IANA 时区单选：搜索框 + 原生下拉。 */
export function ZoneSearchSelect({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useZoneFilter(query, [value]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索时区，如 Shanghai、New_York"
          aria-label={`${label}搜索`}
          spellCheck={false}
          className="h-8 pl-7 text-xs"
        />
      </div>
      <Select
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={filtered.map((zone) => ({ value: zone, label: zone }))}
        selectClassName="w-full"
      />
      {hint && <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
    </div>
  );
}

/** 可搜索的时区多选（上限 8 个）。 */
export function ZoneMultiSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState('');
  const filtered = useZoneFilter(query, value);

  const toggle = (zone: string) => {
    if (value.includes(zone)) onChange(value.filter((item) => item !== zone));
    else if (value.length < MAX_TARGETS) onChange([...value, zone]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索目标时区（最多 8 个）"
          aria-label="搜索目标时区"
          spellCheck={false}
          className="h-8 pl-7 text-xs"
        />
      </div>
      <div className="grid max-h-40 grid-cols-1 gap-x-3 overflow-auto rounded-md border p-2 sm:grid-cols-2 scrollbar-thin">
        {filtered.length === 0 ? (
          <span className="py-2 text-xs text-muted-foreground">没有匹配的时区</span>
        ) : (
          filtered.map((zone) => (
            <Checkbox
              key={zone}
              label={
                <span className="truncate font-mono" title={zone}>
                  {zone}
                </span>
              }
              checked={value.includes(zone)}
              onChange={() => toggle(zone)}
              className="py-0.5"
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">未选择目标时区</span>
        ) : (
          value.map((zone) => (
            <span
              key={zone}
              className="flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]"
            >
              {zone}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== zone))}
                aria-label={`移除 ${zone}`}
              >
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          ))
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          已选 {value.length} / {MAX_TARGETS}
        </span>
      </div>
    </div>
  );
}

export default function TimezoneTool() {
  const [tab, setTab] = useState<TabKey>('convert');
  const [sourceZone, setSourceZone] = useState(() => localTimeZone());
  const [sourceInput, setSourceInput] = useState(() => toDatetimeLocalInput(new Date(), localTimeZone()));
  const [follow, setFollow] = useState(false);
  const [targets, setTargets] = useState<string[]>(DEFAULT_TARGETS);
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(18);
  const [minOverlap, setMinOverlap] = useState(2);
  // 世界时钟每秒走一格，组件卸载时清理
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const manual = useMemo(() => fromDatetimeLocalInput(sourceInput, sourceZone), [sourceInput, sourceZone]);
  const source = follow ? now : manual;

  const setToNow = useCallback(() => {
    setFollow(true);
    setSourceInput(toDatetimeLocalInput(new Date(), sourceZone));
  }, [sourceZone]);

  const rows = useMemo(() => {
    const date = source ?? new Date();
    const sourceOffset = dstInfo(date, sourceZone).offset;
    const utcText = date.toISOString().slice(0, 19).replace('T', ' ');
    return targets.map((zone) => {
      const info = dstInfo(date, zone);
      return {
        zone,
        local: formatZoned(date, zone),
        utc: utcText,
        offset: formatOffset(info.offset),
        isDst: info.isDst,
        abbr: shortZoneName(date, zone),
        diff: info.offset - sourceOffset,
      };
    });
  }, [source, sourceZone, targets]);

  const matrix = useMemo(
    () => meetingMatrix(source ?? new Date(), targets, workStart, workEnd, minOverlap),
    [source, targets, workStart, workEnd, minOverlap],
  );

  const batch = useMemo(() => batchLines(source ?? new Date(), targets), [source, targets]);

  const clockZones = useMemo(() => {
    const local = localTimeZone();
    return [{ id: local, label: '本地' }, ...COMMON_TIME_ZONES];
  }, []);

  return (
    <ToolPanel
      title="时区转换"
      description="IANA 时区对照、夏令时分析、跨时区会议时间与批量转换，全部离线计算"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={setToNow}>
            <RefreshCw className="size-3.5" />
            现在
          </Button>
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList>
              <TabsTrigger value="convert">对照</TabsTrigger>
              <TabsTrigger value="meeting">会议</TabsTrigger>
              <TabsTrigger value="batch">批量</TabsTrigger>
              <TabsTrigger value="clock">世界时钟</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      <Section title="源时间与源时区" description="默认为浏览器本地时区与当前时间">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">源时间</span>
            <Input
              type="datetime-local"
              value={sourceInput}
              onChange={(event) => {
                setFollow(false);
                setSourceInput(event.target.value);
              }}
              aria-label="源时间"
              className="h-8 font-mono text-xs"
            />
            <Checkbox
              label="实时跟随当前时间"
              checked={follow}
              onChange={setFollow}
              hint="勾选后按每秒刷新，忽略上方手动输入"
            />
          </div>
          <ZoneSearchSelect
            label="源时区"
            value={sourceZone}
            onChange={(zone) => {
              setSourceZone(zone);
              if (follow) setSourceInput(toDatetimeLocalInput(new Date(), zone));
            }}
            hint="输入框按源时区的墙钟时间理解"
          />
          <StatGrid className="grid-cols-2">
            <Stat label="UTC 时间" value={(source ?? new Date()).toISOString().slice(0, 19).replace('T', ' ')} />
            <Stat
              label="源时区偏移"
              value={formatOffset(dstInfo(source ?? new Date(), sourceZone).offset)}
              hint={shortZoneName(source ?? new Date(), sourceZone)}
            />
            <Stat label="本地时区" value={localTimeZone()} />
            <Stat label="可搜索时区数" value={String(timeZoneList().length)} />
          </StatGrid>
        </div>
        {!manual && !follow && <Hint>源时间格式无效，已回退到当前时间。</Hint>}
      </Section>

      {tab === 'convert' && (
        <>
          <Section title="目标时区" description="勾选后在上方时间点下对照，最多 8 个">
            <ZoneMultiSelect value={targets} onChange={setTargets} />
          </Section>

          <Section
            title="时间对照表"
            description="含 UTC 偏移、夏令时标记与相对源时区的时差"
            actions={
              <Button
                size="sm"
                variant="ghost"
                disabled={targets.length === 0}
                onClick={() =>
                  copyText(rows.map((row) => `${row.zone}\t${row.local} ${row.abbr} ${row.offset}`).join('\n'))
                }
              >
                <Copy className="size-3.5" />
                复制表格
              </Button>
            }
          >
            {rows.length === 0 ? (
              <EmptyHint>请至少选择一个目标时区</EmptyHint>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[720px] border-collapse text-left font-mono text-xs">
                  <thead className="text-[10px] text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-1.5 pr-3 font-normal">时区</th>
                      <th className="py-1.5 pr-3 font-normal">本地时间</th>
                      <th className="py-1.5 pr-3 font-normal">UTC 时间</th>
                      <th className="py-1.5 pr-3 font-normal">偏移</th>
                      <th className="py-1.5 pr-3 font-normal">夏令时</th>
                      <th className="py-1.5 pr-3 font-normal">缩写</th>
                      <th className="py-1.5 font-normal">与源时差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.zone} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">{row.zone}</td>
                        <td className="py-1.5 pr-3">{row.local}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{row.utc}</td>
                        <td className="py-1.5 pr-3">{row.offset}</td>
                        <td className="py-1.5 pr-3">
                          <span className={row.isDst ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
                            {row.isDst ? '是' : '否'}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">{row.abbr}</td>
                        <td className="py-1.5">
                          {row.diff === 0
                            ? '0'
                            : `${row.diff > 0 ? '+' : '-'}${formatOffset(Math.abs(row.diff)).slice(1)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="夏令时说明" description="Intl 只能给出当前名称，切换日期来自内置规则表（仅供参考）">
            {targets.length === 0 ? (
              <EmptyHint>请选择目标时区后查看夏令时规则</EmptyHint>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {targets.map((zone) => {
                  const info = dstInfo(source ?? new Date(), zone);
                  return (
                    <div key={zone} className="flex min-w-0 flex-col gap-1.5 rounded-md border bg-muted/20 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs">{zone}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                            info.isDst
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {info.isDst ? '夏令时中' : '标准时'}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{info.rule}</p>
                      <p className="text-[10px] text-muted-foreground/80">
                        {info.source === 'builtin'
                          ? `内置规则，仅供参考（${info.ruleLabel ?? ''}）`
                          : '规则来源：Intl 通用名称'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}

      {tab === 'meeting' && (
        <Section
          title="会议时间助手"
          description="按 UTC 0-23 点逐时评估各时区是否落在工作时段，颜色越深表示可用人数越多"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="工作时段开始"
              value={String(workStart)}
              onChange={(value) => setWorkStart(Number(value))}
              options={HOUR_OPTIONS}
            />
            <Select
              label="工作时段结束"
              value={String(workEnd)}
              onChange={(value) => setWorkEnd(Number(value))}
              options={HOUR_OPTIONS}
            />
            <Select
              label="至少重叠时区数"
              value={String(minOverlap)}
              onChange={(value) => setMinOverlap(Number(value))}
              options={[
                { value: '1', label: '1 个即可' },
                { value: '2', label: '2 个及以上' },
                { value: '3', label: '3 个及以上' },
                { value: String(Math.max(1, targets.length)), label: '全部时区' },
              ]}
              hint="只统计所选目标时区"
            />
          </div>

          {targets.length === 0 ? (
            <EmptyHint>请先在上方「目标时区」中勾选参与会议的时区</EmptyHint>
          ) : (
            <>
              <div className="overflow-x-auto scrollbar-thin">
                <div className="min-w-[720px]">
                  <div
                    className="grid gap-0.5 text-center text-[9px] text-muted-foreground"
                    style={{ gridTemplateColumns: 'minmax(6rem, 8rem) repeat(24, minmax(0, 1fr))' }}
                  >
                    <span className="text-left">时区 \ UTC</span>
                    {matrix.hours.map((hour) => (
                      <span key={hour}>{String(hour).padStart(2, '0')}</span>
                    ))}
                  </div>
                  {matrix.rows.map((row) => (
                    <div
                      key={row.timeZone}
                      className="mt-0.5 grid items-stretch gap-0.5"
                      style={{ gridTemplateColumns: 'minmax(6rem, 8rem) repeat(24, minmax(0, 1fr))' }}
                    >
                      <span
                        className="flex items-center truncate pr-1 text-left font-mono text-[10px]"
                        title={row.timeZone}
                      >
                        {row.timeZone}
                      </span>
                      {matrix.hours.map((hour) => {
                        const local = row.localHours[hour] ?? 0;
                        return (
                          <span
                            key={hour}
                            className={`rounded-sm py-1 text-center font-mono text-[9px] ${heatClass(
                              matrix.counts[hour] ?? 0,
                              matrix.maxCount,
                            )} ${row.inWork[hour] ? 'text-foreground' : 'text-muted-foreground/50'}`}
                            title={`UTC ${String(hour).padStart(2, '0')}:00 → ${row.timeZone} ${String(local).padStart(2, '0')}:00`}
                          >
                            {String(local).padStart(2, '0')}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Hint>
                  工作时段 {String(workStart).padStart(2, '0')}:00–{String(workEnd).padStart(2, '0')}
                  :00；单元格内数字为该时区的本地小时。
                </Hint>
                {matrix.slots.length === 0 ? (
                  <Note tone="warn" title="没有满足条件的重叠时段">
                    当前工作时段与所选时区没有达到重叠阈值，可放宽工作时段或减少时区数量。
                  </Note>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {matrix.slots.map((slot) => {
                      const detail = describeSlot(source ?? new Date(), slot, targets);
                      return (
                        <div key={`${slot.startUtc}-${slot.endUtc}`} className="rounded-md border bg-muted/20 p-2.5">
                          <p className="flex items-center gap-1.5 font-mono text-xs">
                            <Users className="size-3.5" />
                            UTC {String(slot.startUtc).padStart(2, '0')}:00 – {String(slot.endUtc).padStart(2, '0')}
                            :00（
                            {slot.endUtc - slot.startUtc} 小时）
                          </p>
                          <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {detail.ranges.map((range) => `${range.timeZone} ${range.text}`).join(' · ')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Section>
      )}

      {tab === 'batch' && (
        <Section title="批量转换" description="使用上方源时间，输出 ISO 8601 / RFC 3339 与各时区本地时间">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">输入时间（源时区）</span>
              <Input
                value={sourceInput}
                onChange={(event) => {
                  setFollow(false);
                  setSourceInput(event.target.value);
                }}
                aria-label="批量转换的输入时间"
                spellCheck={false}
                className="h-8 font-mono text-xs"
              />
              <StatGrid className="grid-cols-2">
                <Stat label="ISO 8601（UTC）" value={(source ?? new Date()).toISOString()} />
                <Stat label="RFC 3339（UTC）" value={rfc3339(source ?? new Date(), 'UTC')} />
                <Stat label="Unix 秒" value={String(Math.floor((source ?? new Date()).getTime() / 1000))} />
                <Stat label="Unix 毫秒" value={String((source ?? new Date()).getTime())} />
              </StatGrid>
            </div>
            <ResultBox label="批量结果" value={batch} onCopy={() => copyText(batch)} rows="min-h-48" />
          </div>
        </Section>
      )}

      {tab === 'clock' && (
        <Section title="世界时钟" description="本地时区与 9 个常用城市，每秒刷新">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {clockZones.map((entry) => {
              const info = dstInfo(now, entry.id);
              return (
                <div key={`${entry.label}-${entry.id}`} className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{entry.label}</span>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      {shortZoneName(now, entry.id)} {formatOffset(info.offset)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-lg leading-tight">{formatZoned(now, entry.id).slice(11)}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {info.isDst ? '夏令时中 · ' : ''}
                    {formatZoned(now, entry.id).slice(0, 10)}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Note tone="info" title="UTC 与 GMT 的区别">
        <span className="inline-flex items-start gap-1">
          <Globe2 className="mt-0.5 size-3 shrink-0" />
          GMT 是「格林尼治标准时」的旧称，UTC 是基于原子钟的协调世界时，两者偏移都是 0 但定义不同（GMT
          受地球自转影响会闰秒，UTC 不跳秒）。 IANA 时区库中 Greenwich 已被视为 UTC 的别名，业务上可以互换使用。
        </span>
      </Note>
      <Note tone="warn" title="夏令时对定时任务的影响">
        <span className="inline-flex items-start gap-1">
          <Sun className="mt-0.5 size-3 shrink-0" />
          依赖本地时间的定时任务（cron、CI、日志轮转）在切换夏令时的那一天会「丢失」或「重复」一小时。
          建议把关键调度固定在 UTC，或在夏令时切换当天人工复核；调度服务通常会自动适配，但日志与账单类任务需要留意。
          <Clock className="mt-0.5 ml-1 size-3 shrink-0" />
        </span>
      </Note>
    </ToolPanel>
  );
}
