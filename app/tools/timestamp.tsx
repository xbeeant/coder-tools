import { Copy, RefreshCw, Timer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { cn } from '../components/ui/utils';

const MS_THRESHOLD = 10_000_000_000;

function fromTimestamp(value: string): { date: Date; assumedMs: boolean } | null {
  const numeric = Number(value.trim());
  if (!value.trim() || Number.isNaN(numeric)) return null;
  const assumedMs = Math.abs(numeric) >= MS_THRESHOLD;
  return { date: new Date(assumedMs ? numeric : numeric * 1000), assumedMs };
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function Row({ label, value, hint, onCopy }: { label: string; value: string; hint?: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input value={value} readOnly spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
      {hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
      <Button size="icon" variant="ghost" onClick={onCopy} disabled={!value}>
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

  const useNow = () => {
    const date = new Date();
    setNow(date.getTime());
    setTimestamp(String(Math.floor(date.getTime() / 1000)));
    setLocal(toLocalInput(date));
    setIso(date.toISOString());
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
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          当前 {Math.floor(now / 1000)}
          <Button size="icon" variant="ghost" onClick={useNow}>
            <RefreshCw className="size-3.5" />
          </Button>
        </span>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto scrollbar-thin">
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
          <div className={cn('text-[11px]', parsed ? 'text-muted-foreground' : 'text-destructive')}>
            {parsed ? `已按${parsed.assumedMs ? '毫秒' : '秒'}解析` : timestamp.trim() && '请输入有效数字'}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {formats.map((item) => (
              <Row key={item.label} label={item.label} value={item.value} onCopy={() => copyText(item.value)} />
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
            <Button size="sm" variant="outline" disabled={!localToTimestamp} onClick={() => copyText(localToTimestamp)}>
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div className="font-mono text-xs text-muted-foreground">{localToTimestamp || '无效日期'}</div>
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
            <Button size="sm" variant="outline" disabled={!isoToTimestamp} onClick={() => copyText(isoToTimestamp)}>
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div className="font-mono text-xs text-muted-foreground">{isoToTimestamp || '无效日期'}</div>
        </div>
      </div>
    </ToolPanel>
  );
}
