import { ClipboardPaste, Copy, RefreshCw, Timer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { EmptyHint, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { cn } from '../components/ui/utils';

const MS_THRESHOLD = 10_000_000_000;

const SAMPLE_TIMESTAMP = '1700000000';
const TYPICAL_VALUES = '0（Unix 纪元）、1700000000（秒）、1700000000000（毫秒，自动识别）';

export function fromTimestamp(value: string): { date: Date; assumedMs: boolean } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  // NaN 会被 Number.isNaN 拦下，但 Infinity / 1e309 这类非有限值不会，必须显式排除，
  // 否则 new Date() 得到 Invalid Date，后续 toISOString() 会抛 RangeError。
  if (!Number.isFinite(numeric)) return null;
  const assumedMs = Math.abs(numeric) >= MS_THRESHOLD;
  const date = new Date(assumedMs ? numeric : numeric * 1000);
  // 数值虽有限，但秒→毫秒换算或绝对值仍可能超出 Date 的 ±8.64e15 毫秒范围。
  if (Number.isNaN(date.getTime())) return null;
  return { date, assumedMs };
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function TimestampRow({
  label,
  value,
  hint,
  onCopy,
}: {
  label: string;
  value: string;
  hint?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input value={value} readOnly spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
      {hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
      <Button size="icon" variant="ghost" onClick={onCopy} disabled={!value} aria-label={`复制${label}`}>
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

export default function TimestampTool() {
  const [now, setNow] = useState(() => Date.now());
  const [timestamp, setTimestamp] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [local, setLocal] = useState(() => toLocalInput(new Date()));
  const [iso, setIso] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const parsed = useMemo(() => fromTimestamp(timestamp), [timestamp]);

  const inputError = useMemo(() => {
    if (parsed || !timestamp.trim()) return '';
    if (!Number.isFinite(Number(timestamp.trim()))) {
      return '无效时间戳：请输入有限数字（不支持 Infinity、1e309 等超大值）';
    }
    return '无效时间戳：数值超出 JavaScript Date 可表示的范围（约 ±8.64×10¹⁵ 毫秒）';
  }, [parsed, timestamp]);

  const formats = useMemo(() => {
    if (!parsed) return [];
    const { date } = parsed;
    return [
      { label: '本地时间', value: date.toLocaleString('zh-CN', { hour12: false }) },
      { label: 'UTC', value: date.toISOString() },
      { label: '秒', value: String(Math.floor(date.getTime() / 1000)) },
      { label: '毫秒', value: String(date.getTime()) },
      { label: 'ISO', value: date.toISOString() },
      { label: 'RFC 2822', value: date.toUTCString() },
    ];
  }, [parsed]);

  const localToTimestamp = useMemo(() => {
    const ms = new Date(local.replace(' ', 'T')).getTime();
    return Number.isNaN(ms) ? '' : String(Math.floor(ms / 1000));
  }, [local]);

  const isoToTimestamp = useMemo(() => {
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? '' : String(Math.floor(ms / 1000));
  }, [iso]);

  const useNow = useCallback(() => {
    const date = new Date();
    setNow(date.getTime());
    setTimestamp(String(Math.floor(date.getTime() / 1000)));
    setLocal(toLocalInput(date));
    setIso(date.toISOString());
  }, []);

  const fillSample = () => {
    const date = new Date(Number(SAMPLE_TIMESTAMP) * 1000);
    setTimestamp(SAMPLE_TIMESTAMP);
    setLocal(toLocalInput(date));
    setIso(date.toISOString());
  };

  const clearAll = () => {
    setTimestamp('');
    setLocal('');
    setIso('');
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Timer className="size-4" />
          时间戳转换
        </span>
      }
      description="Unix 时间戳与本地时间、ISO 8601 格式互相转换"
      actions={
        <div className="flex flex-row items-center gap-1">
          <Button size="sm" variant="ghost" onClick={fillSample}>
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
          <ClearButton onClick={clearAll} disabled={!timestamp && !local && !iso} />
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            当前 {Math.floor(now / 1000)}
            <Button size="icon" variant="ghost" onClick={useNow} aria-label="使用当前时间">
              <RefreshCw className="size-3.5" />
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-4 overflow-auto scrollbar-thin">
        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor="ts-input">
            Unix 时间戳
          </label>
          <Input
            id="ts-input"
            inputMode="numeric"
            value={timestamp}
            onChange={(event) => setTimestamp(event.target.value)}
            placeholder="秒或毫秒"
            spellCheck={false}
            className="h-8 font-mono text-xs"
          />
          <div
            className={cn('text-[11px]', !parsed && timestamp.trim() ? 'text-destructive' : 'text-muted-foreground')}
            role="alert"
          >
            {parsed ? `已按${parsed.assumedMs ? '毫秒' : '秒'}解析` : inputError}
          </div>
          {!parsed && !timestamp.trim() && (
            <EmptyHint>输入 Unix 时间戳（秒或毫秒）自动转换，或点击上方「示例」。典型值：{TYPICAL_VALUES}</EmptyHint>
          )}
          <div className="grid grid-cols-1 gap-1.5">
            {formats.map((item) => (
              <TimestampRow
                key={item.label}
                label={item.label}
                value={item.value}
                onCopy={() => copyText(item.value)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor="local-input">
            本地时间 → 时间戳
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="local-input"
              value={local}
              onChange={(event) => setLocal(event.target.value)}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!localToTimestamp}
              onClick={() => copyText(localToTimestamp)}
              aria-label="复制本地时间对应的时间戳"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {localToTimestamp || (local ? '无效日期' : '输入本地时间后显示时间戳')}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor="iso-input">
            ISO 8601 → 时间戳
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="iso-input"
              value={iso}
              onChange={(event) => setIso(event.target.value)}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!isoToTimestamp}
              onClick={() => copyText(isoToTimestamp)}
              aria-label="复制 ISO 时间对应的时间戳"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {isoToTimestamp || (iso ? '无效日期' : '输入 ISO 8601 时间后显示时间戳')}
          </div>
        </div>
      </div>
    </ToolPanel>
  );
}
