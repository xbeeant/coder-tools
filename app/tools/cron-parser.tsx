// 默认入口不含多语言包，zh_CN 只在 i18n bundle 中注册；用默认入口会静默回退成英文
import cronstrue from 'cronstrue/dist/cronstrue-i18n';
import { CalendarClock, Copy, Eraser, ListTree, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  buildCronExpr,
  CRON_ALIASES,
  CRON_DIALECT_NOTES,
  CRON_FIELDS,
  CRON_NOTES,
  CRON_PRESETS,
  splitCronFields,
} from '../lib/cheatsheet';

type Tab = 'parse' | 'build' | 'reverse' | 'cheat';

const PRESETS = ['*/5 * * * *', '0 0 * * *', '0 9 * * 1-5', '0 0 1 * *', '@daily'];

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const DOW_ALIAS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const MONTH_ALIAS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAY_OPTIONS = [
  { value: '*', label: '每天' },
  { value: '0', label: '周日' },
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '1-5', label: '周一至周五' },
  { value: '0,6', label: '周六与周日' },
];

function substituteNames(token: string): string {
  return token
    .split(/(\/)/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (DOW_ALIAS[lower] !== undefined) return String(DOW_ALIAS[lower]);
      if (MONTH_ALIAS[lower] !== undefined) return String(MONTH_ALIAS[lower]);
      return part;
    })
    .join('');
}

function normalizeCron(cron: string): string | null {
  const trimmed = cron.trim();
  if (!trimmed) return null;
  const expanded = MACROS[trimmed.toLowerCase()] ?? trimmed;
  const parts = expanded
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part === '?' ? '*' : substituteNames(part)));
  if (parts.length !== 5 && parts.length !== 6) return null;

  const [minute, hour, day, month, weekday] = parts.slice(-5);
  if (minute === undefined || hour === undefined || day === undefined || month === undefined || weekday === undefined) {
    return null;
  }
  // Sunday is both 0 and 7 in crontab; fold 7 into 0.
  const normalizedWeekday = weekday
    .split(',')
    .map((item) => {
      const [range = '', step] = item.split('/');
      const swap = (value: string) => (value === '7' ? '0' : value);
      return step === undefined ? swap(range) : `${swap(range)}/${step}`;
    })
    .join(',');

  const fields = `${minute} ${hour} ${day} ${month} ${normalizedWeekday}`;
  return parts.length === 6 ? `${parts[0]} ${fields}` : fields;
}

function matchesField(value: number, field: string, max: number): boolean {
  for (const segment of field.split(',')) {
    const [rangePart = '*', stepPart] = segment.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isFinite(step) || step <= 0) continue;

    if (rangePart === '*') {
      if (value % step === 0) return true;
      continue;
    }

    const bounds = rangePart.split('-').map(Number);
    const from = bounds[0] ?? 0;
    const to = bounds[1] ?? (bounds[0] === undefined ? max : bounds[0]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (value >= from && value <= to && (value - from) % step === 0) return true;
  }
  return false;
}

function nextRuns(cron: string, count: number): Date[] {
  const normalized = normalizeCron(cron);
  if (!normalized) return [];
  const fields = normalized.split(' ');
  const hasSeconds = fields.length === 6;
  const [second = '0', minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = hasSeconds
    ? fields
    : ['0', ...fields];

  const stepSeconds = hasSeconds ? 1 : 60;
  const cursor = new Date();
  cursor.setMilliseconds(0);
  // -1 rolls back one second so the first candidate is always :00 of the current minute.
  cursor.setSeconds(hasSeconds ? -1 : 0, 0);

  const results: Date[] = [];
  const start = Date.now();
  const limit = 366 * 24 * 60 * (hasSeconds ? 60 : 1);
  for (let step = 0; step < limit && results.length < count; step++) {
    cursor.setSeconds(cursor.getSeconds() + stepSeconds);
    if (cursor.getTime() <= start) continue;
    if (
      matchesField(cursor.getSeconds(), second, 59) &&
      matchesField(cursor.getMinutes(), minute, 59) &&
      matchesField(cursor.getHours(), hour, 23) &&
      matchesField(cursor.getDate(), day, 31) &&
      matchesField(cursor.getMonth() + 1, month, 12) &&
      matchesField(cursor.getDay(), weekday, 6)
    ) {
      results.push(new Date(cursor));
    }
  }
  return results;
}

function describe(cron: string): { ok: true; text: string; next: Date[] } | { ok: false; error: string } {
  const value = cron.trim();
  if (!value) return { ok: true, text: '', next: [] };
  try {
    // 保留 cronstrue 的中文描述能力（zh_CN 需从 i18n bundle 加载）
    const text = cronstrue.toString(value, { locale: 'zh_CN', verbose: true });
    return { ok: true, text, next: nextRuns(value, 5) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default function CronParser() {
  const [tab, setTab] = useState<Tab>('parse');
  const [cron, setCron] = useState('0 9 * * 1-5');

  const result = useMemo(() => describe(cron), [cron]);
  const fields = useMemo(() => splitCronFields(cron), [cron]);

  // ── 可视化生成 ──────────────────────────────────────────────
  const [draft, setDraft] = useState({ minute: '*', hour: '*', day: '*', month: '*', weekday: '*' });
  const built = useMemo(() => buildCronExpr(draft), [draft]);
  const setField = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  // ── 反向生成 ────────────────────────────────────────────────
  const [freq, setFreq] = useState('minutes');
  const [interval, setIntervalValue] = useState('5');
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('0');

  const reverse = useMemo(() => {
    const n = Math.max(1, Math.min(59, Number(interval) || 1));
    const h = Math.max(0, Math.min(23, Number(hour) || 0));
    const m = Math.max(0, Math.min(59, Number(minute) || 0));
    switch (freq) {
      case 'minutes':
        return { expr: `*/${n} * * * *`, desc: `每 ${n} 分钟执行一次` };
      case 'hours':
        return { expr: `${m} */${n} * * *`, desc: `每 ${n} 小时的第 ${m} 分钟执行` };
      case 'days':
        return { expr: `${m} ${h} */${n} * *`, desc: `每 ${n} 天的 ${h}:${String(m).padStart(2, '0')} 执行` };
      case 'weeks':
        return { expr: `${m} ${h} * * */${n}`, desc: `每 ${n} 周的周一 ${h}:${String(m).padStart(2, '0')} 执行` };
      case 'daily':
        return { expr: `${m} ${h} * * *`, desc: `每天 ${h}:${String(m).padStart(2, '0')} 执行` };
      case 'workday':
        return { expr: `${m} ${h} * * 1-5`, desc: `工作日每天 ${h}:${String(m).padStart(2, '0')} 执行` };
      case 'monthly':
        return { expr: `${m} ${h} ${n} * *`, desc: `每月 ${n} 日 ${h}:${String(m).padStart(2, '0')} 执行` };
      default:
        return { expr: `${m} ${h} * * *`, desc: `每天 ${h}:${String(m).padStart(2, '0')} 执行` };
    }
  }, [freq, hour, interval, minute]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-4" />
          Crontab 解析与生成
        </span>
      }
      description="解析表达式、查看未来执行时间、可视化生成与反向生成"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCron('0 9 * * 1-5');
            setDraft({ minute: '*', hour: '*', day: '*', month: '*', weekday: '*' });
          }}
        >
          <Eraser className="size-3.5" />
          重置
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList>
          <TabsTrigger value="parse" active={tab === 'parse'}>
            解析
          </TabsTrigger>
          <TabsTrigger value="build" active={tab === 'build'}>
            可视化生成
          </TabsTrigger>
          <TabsTrigger value="reverse" active={tab === 'reverse'}>
            反向生成
          </TabsTrigger>
          <TabsTrigger value="cheat" active={tab === 'cheat'}>
            速查
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'parse' && (
        <>
          <Input
            value={cron}
            onChange={(event) => setCron(event.target.value)}
            placeholder="分 时 日 月 周"
            aria-label="Crontab 表达式"
            spellCheck={false}
            className="h-8 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={cron === preset ? 'secondary' : 'ghost'}
                onClick={() => setCron(preset)}
                className="font-mono"
              >
                {preset}
              </Button>
            ))}
          </div>

          {result.ok ? (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">{result.text || '输入 Cron 表达式'}</div>
              <Section title="字段拆解">
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th className="p-1.5 text-left font-medium">字段</th>
                        <th className="p-1.5 text-left font-medium">当前值</th>
                        <th className="p-1.5 text-left font-medium">取值范围</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CRON_FIELDS.map((field, i) => {
                        const value =
                          i === 0
                            ? fields.minute
                            : i === 1
                              ? fields.hour
                              : i === 2
                                ? fields.day
                                : i === 3
                                  ? fields.month
                                  : fields.weekday;
                        return (
                          <tr key={field.field} className="border-t">
                            <td className="p-1.5 font-medium">{field.field}</td>
                            <td className="p-1.5 font-mono">{value}</td>
                            <td className="p-1.5 text-muted-foreground">{field.range}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
              {result.next.length > 0 ? (
                <Section title="接下来 5 次执行">
                  <div className="flex flex-col gap-1">
                    {result.next.map((date) => (
                      <div
                        key={date.toISOString()}
                        className="flex items-center justify-between rounded-md border px-2.5 py-1.5 font-mono text-xs"
                      >
                        {date.toLocaleString('zh-CN', { hour12: false })}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          aria-label="复制 ISO 时间"
                          onClick={() => void copyText(date.toISOString())}
                        >
                          <Copy className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : (
                <EmptyHint>没有匹配到未来的执行时间</EmptyHint>
              )}
            </>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs text-destructive">
              {result.error}
            </div>
          )}
        </>
      )}

      {tab === 'build' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">生成结果</span>
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{built}</code>
            <Button size="sm" variant="outline" onClick={() => void copyText(built)} aria-label="复制表达式">
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCron(built)}>
              拿去解析
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Select
              label="分钟"
              value={draft.minute}
              onChange={(value) => setField('minute', value)}
              options={[
                { value: '*', label: '每分钟' },
                { value: '*/5', label: '每 5 分钟' },
                { value: '*/10', label: '每 10 分钟' },
                { value: '*/15', label: '每 15 分钟' },
                { value: '*/30', label: '每 30 分钟' },
                { value: '0', label: '整点分 0' },
              ]}
            />
            <Select
              label="小时"
              value={draft.hour}
              onChange={(value) => setField('hour', value)}
              options={[
                { value: '*', label: '每小时' },
                { value: '*/2', label: '每 2 小时' },
                { value: '*/6', label: '每 6 小时' },
                { value: '0', label: '凌晨 0 点' },
                { value: '9', label: '上午 9 点' },
                { value: '18', label: '下午 6 点' },
              ]}
            />
            <Select
              label="日"
              value={draft.day}
              onChange={(value) => setField('day', value)}
              options={[
                { value: '*', label: '每天' },
                { value: '*/7', label: '每 7 天' },
                { value: '1', label: '1 号' },
                { value: '15', label: '15 号' },
                { value: '28-31', label: '月末区间 28-31' },
              ]}
            />
            <Select
              label="月"
              value={draft.month}
              onChange={(value) => setField('month', value)}
              options={[
                { value: '*', label: '每月' },
                { value: '*/3', label: '每 3 个月' },
                { value: '1', label: '1 月' },
                { value: '1,4,7,10', label: '每季度' },
              ]}
            />
            <Select
              label="周"
              value={draft.weekday}
              onChange={(value) => setField('weekday', value)}
              options={WEEKDAY_OPTIONS}
            />
          </div>
          <Section title="精确到字段">
            <div className="grid gap-3 md:grid-cols-5">
              {(['minute', 'hour', 'day', 'month', 'weekday'] as const).map((key) => (
                <TextField
                  key={key}
                  label={CRON_FIELDS[['minute', 'hour', 'day', 'month', 'weekday'].indexOf(key)]?.field ?? key}
                  value={draft[key]}
                  onChange={(value) => setField(key, value)}
                  placeholder="*"
                />
              ))}
            </div>
            <Hint>留空按 * 处理；支持 *、列表 1,2、范围 1-5、步长 */5 与英文缩写 MON-FRI。</Hint>
          </Section>
        </>
      )}

      {tab === 'reverse' && (
        <>
          <Section
            title={
              <span className="inline-flex items-center gap-1">
                <Wand2 className="size-3.5" />
                按频率反推
              </span>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Select
                label="频率"
                value={freq}
                onChange={setFreq}
                options={[
                  { value: 'minutes', label: '每 N 分钟' },
                  { value: 'hours', label: '每 N 小时' },
                  { value: 'days', label: '每 N 天' },
                  { value: 'weeks', label: '每 N 周' },
                  { value: 'daily', label: '每天定点' },
                  { value: 'workday', label: '工作日定点' },
                  { value: 'monthly', label: '每月定点' },
                ]}
              />
              <TextField label="间隔 N" value={interval} onChange={setIntervalValue} placeholder="5" />
              <TextField label="小时" value={hour} onChange={setHour} placeholder="9" />
              <TextField label="分钟" value={minute} onChange={setMinute} placeholder="0" />
            </div>
          </Section>
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
            <code className="font-mono text-sm">{reverse.expr}</code>
            <span className="text-xs text-muted-foreground">{reverse.desc}</span>
            <Button size="sm" variant="outline" onClick={() => void copyText(reverse.expr)} aria-label="复制表达式">
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCron(reverse.expr)}>
              拿去解析
            </Button>
          </div>
          <Section
            title={
              <span className="inline-flex items-center gap-1">
                <ListTree className="size-3.5" />
                常用表达式
              </span>
            }
          >
            <div className="flex flex-col gap-1">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.expr}
                  type="button"
                  onClick={() => setCron(preset.expr)}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[11px] hover:bg-muted/50"
                >
                  <code className="font-mono">{preset.expr}</code>
                  <span className="text-muted-foreground">{preset.label}</span>
                  <span className="ml-auto hidden text-muted-foreground sm:inline">{preset.desc}</span>
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {tab === 'cheat' && (
        <div className="grid gap-2 md:grid-cols-2">
          <Section title="字段含义">
            <div className="flex flex-col gap-1">
              {CRON_FIELDS.map((field) => (
                <div key={field.field} className="rounded-md border p-2 text-[11px] leading-relaxed">
                  <p className="font-medium">
                    {field.field} <span className="font-mono text-muted-foreground">{field.range}</span>
                  </p>
                  <p className="text-muted-foreground">{field.desc}</p>
                </div>
              ))}
            </div>
          </Section>
          <div className="flex flex-col gap-2">
            <Section title="宏别名">
              <div className="flex flex-col gap-1">
                {CRON_ALIASES.map((alias) => (
                  <div key={alias.alias} className="flex items-center gap-2 text-[11px]">
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">{alias.alias}</code>
                    <code className="font-mono text-muted-foreground">{alias.expr}</code>
                    <span className="ml-auto text-muted-foreground">{alias.desc}</span>
                  </div>
                ))}
              </div>
            </Section>
            <Note tone="warn" title="常见误区">
              <ul className="flex list-none flex-col gap-1">
                {CRON_NOTES.map((note) => (
                  <li key={note.title}>
                    <strong className="text-foreground">{note.title}</strong>
                    <span className="text-muted-foreground">：{note.desc}</span>
                  </li>
                ))}
              </ul>
            </Note>
            <Note tone="info" title="各方言差异">
              <ul className="flex list-none flex-col gap-1">
                {CRON_DIALECT_NOTES.map((note) => (
                  <li key={note.title}>
                    <strong className="text-foreground">{note.title}</strong>
                    <span className="text-muted-foreground">：{note.desc}</span>
                  </li>
                ))}
              </ul>
            </Note>
          </div>
        </div>
      )}
    </ToolPanel>
  );
}
