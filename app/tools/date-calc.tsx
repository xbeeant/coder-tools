import { Cake, ChevronLeft, ChevronRight, Info, Minus, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Field, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  addDays,
  addMonths,
  addWeeks,
  addWorkdays,
  addYears,
  ageOf,
  countWorkdays,
  dayOfYear,
  diffDays,
  diffWeeks,
  excelSerial,
  formatCnDate,
  isoWeek,
  isoWeekString,
  julianDay,
  julianDayNumber,
  MONTH_LABELS,
  modifiedJulianDay,
  monthGrid,
  monthWorkdayStat,
  nextBirthday,
  parseDateList,
  parseLocalDate,
  shengxiaoOf,
  splitDuration,
  toDateInput,
  toDateSet,
  todayLocal,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  wholeMonths,
  wholeYears,
  zodiacOf,
} from '../lib/datetime';

type TabKey = 'diff' | 'add' | 'calendar' | 'age' | 'misc';

const ADD_UNITS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
  { value: 'workday', label: '工作日' },
];

const pad2 = (value: number) => String(value).padStart(2, '0');

export default function DateCalculator() {
  const today = useMemo(() => todayLocal(), []);
  const [tab, setTab] = useState<TabKey>('diff');

  // 区间差 / 工作日历共用的日期与节假日
  const [startInput, setStartInput] = useState(() => toDateInput(today));
  const [endInput, setEndInput] = useState(() => toDateInput(addDays(today, 30)));
  const [holidayText, setHolidayText] = useState('');
  const [inclusive, setInclusive] = useState(true);
  const [excludeWeekend, setExcludeWeekend] = useState(true);

  // 日期加减
  const [addDate, setAddDate] = useState(() => toDateInput(today));
  const [addUnit, setAddUnit] = useState('day');
  const [addAmount, setAddAmount] = useState('7');
  const [skipHolidays, setSkipHolidays] = useState(true);

  // 工作日历
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [weekStart, setWeekStart] = useState<0 | 1>(1);

  // 年龄
  const [birthInput, setBirthInput] = useState('1995-06-15');
  const [showShengxiao, setShowShengxiao] = useState(true);

  // 其他
  const [miscDate, setMiscDate] = useState(() => toDateInput(today));
  const [miscWeekStart, setMiscWeekStart] = useState<0 | 1>(1);
  const [miscCursor, setMiscCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const start = useMemo(() => parseLocalDate(startInput), [startInput]);
  const end = useMemo(() => parseLocalDate(endInput), [endInput]);
  const holidays = useMemo(() => toDateSet(parseDateList(holidayText).dates), [holidayText]);
  const holidayParse = useMemo(() => parseDateList(holidayText), [holidayText]);

  const diff = useMemo(() => {
    if (!start || !end) return null;
    const days = diffDays(start, end);
    const inclusiveDays = diffDays(start, end, { inclusive: true });
    const workdays = countWorkdays(start, end, holidays, excludeWeekend, true);
    const months = wholeMonths(start, end);
    const parts = splitDuration(Math.abs(end.getTime() - start.getTime()));
    // 起止顺序颠倒时按绝对值做年/月/日拆分
    const [from, to] = start <= end ? [start, end] : [end, start];
    const ymd = ageOf(from, to);
    return {
      days,
      inclusiveDays,
      weeks: diffWeeks(start, end),
      workdays,
      months,
      years: wholeYears(start, end),
      parts,
      ymd,
      startWeekday: WEEKDAY_LABELS[start.getDay()] ?? '',
      endWeekday: WEEKDAY_LABELS[end.getDay()] ?? '',
      startIso: isoWeek(start),
      endIso: isoWeek(end),
    };
  }, [start, end, holidays, excludeWeekend]);

  const diffText = useMemo(() => {
    if (!start || !end || !diff) return '';
    const p = diff.parts;
    return [
      `起始：${formatCnDate(start)} ${diff.startWeekday}`,
      `结束：${formatCnDate(end)} ${diff.endWeekday}`,
      `相差天数（不含首尾）：${diff.days} 天`,
      `相差天数（含首尾）：${diff.inclusiveDays} 天`,
      `周数：${diff.weeks.toFixed(4)} 周`,
      `整月数：${diff.months} 个月（整年数 ${diff.years}）`,
      `工作日天数：${diff.workdays} 天`,
      `年/月/日拆分：${diff.ymd.years} 年 ${diff.ymd.months} 个月 ${diff.ymd.days} 天`,
      `时/分/秒拆分：${p.hours} 小时 ${p.minutes} 分 ${p.seconds} 秒（合计 ${p.days} 天）`,
      `起始 ISO 周：${isoWeekString(start)}`,
      `结束 ISO 周：${isoWeekString(end)}`,
    ].join('\n');
  }, [start, end, diff]);

  const addResult = useMemo(() => {
    const base = parseLocalDate(addDate);
    if (!base || addAmount.trim() === '' || !Number.isFinite(Number(addAmount))) return null;
    const n = Math.floor(Number(addAmount));
    const shift = (amount: number): Date => {
      switch (addUnit) {
        case 'week':
          return addWeeks(base, amount);
        case 'month':
          return addMonths(base, amount);
        case 'year':
          return addYears(base, amount);
        case 'workday':
          return addWorkdays(base, amount, holidays, skipHolidays);
        default:
          return addDays(base, amount);
      }
    };
    return { plus: shift(n), minus: shift(-n), base };
  }, [addDate, addAmount, addUnit, holidays, skipHolidays]);

  const addText = useMemo(() => {
    if (!addResult) return '';
    const unitLabel = ADD_UNITS.find((item) => item.value === addUnit)?.label ?? '天';
    const lines = [
      `基准日期：${formatCnDate(addResult.base)} ${WEEKDAY_LABELS[addResult.base.getDay()] ?? ''}`,
      `加减量：${addAmount} ${unitLabel}${addUnit === 'workday' && skipHolidays ? '（跳过周末与节假日）' : ''}`,
      '',
      `加：${formatCnDate(addResult.plus)} ${WEEKDAY_LABELS[addResult.plus.getDay()] ?? ''} · ${isoWeekString(addResult.plus)}`,
      `减：${formatCnDate(addResult.minus)} ${WEEKDAY_LABELS[addResult.minus.getDay()] ?? ''} · ${isoWeekString(addResult.minus)}`,
      '',
      `加后距今天：${diffDays(today, addResult.plus)} 天`,
      `减后距今天：${diffDays(today, addResult.minus)} 天`,
    ];
    return lines.join('\n');
  }, [addResult, addAmount, addUnit, skipHolidays, today]);

  const calendarCells = useMemo(
    () => monthGrid(cursor.year, cursor.month, weekStart, holidays, today),
    [cursor, weekStart, holidays, today],
  );
  const calendarStat = useMemo(() => monthWorkdayStat(cursor.year, cursor.month, holidays), [cursor, holidays]);
  const calendarRange = useMemo(
    () => (start && end ? countWorkdays(start, end, holidays, excludeWeekend, true) : 0),
    [start, end, holidays, excludeWeekend],
  );

  const age = useMemo(() => {
    const birth = parseLocalDate(birthInput);
    if (!birth) return null;
    const info = ageOf(birth, today);
    const birthday = nextBirthday(birth, today);
    return {
      birth,
      info,
      birthday,
      zodiac: zodiacOf(birth),
      shengxiao: shengxiaoOf(birth),
    };
  }, [birthInput, today]);

  const misc = useMemo(() => {
    const date = parseLocalDate(miscDate);
    if (!date) return null;
    const info = isoWeek(date);
    return {
      date,
      iso: isoWeekString(date),
      info,
      dayOfYear: dayOfYear(date),
      jd: julianDay(date),
      jdn: julianDayNumber(date),
      mjd: modifiedJulianDay(date),
      excel: excelSerial(date),
      unixSeconds: Math.floor(date.getTime() / 1000),
      utc: date.toISOString(),
    };
  }, [miscDate]);

  const monthTable = useMemo(() => {
    const cells = monthGrid(miscCursor.year, miscCursor.month, miscWeekStart, holidays, today);
    const head = miscWeekStart === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : WEEKDAY_SHORT;
    const lines = [
      `${miscCursor.year} 年 ${miscCursor.month + 1} 月（周起始：${miscWeekStart === 1 ? '周一' : '周日'}）`,
      '',
    ];
    for (let row = 0; row < cells.length / 7; row++) {
      const week = cells.slice(row * 7, row * 7 + 7);
      const days = week.map((cell) => String(cell.day).padStart(2, ' '));
      lines.push(`${String(week[0].week).padStart(2, ' ')} | ${days.join(' ')} | ${week[0].isoWeek.slice(5)}`);
    }
    lines.push(`列：${head.join(' ')}`);
    return lines.join('\n');
  }, [miscCursor, miscWeekStart, holidays, today]);

  const shiftMonth = useCallback((year: number, month: number, step: number) => {
    const next = new Date(year, month + step, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  }, []);

  return (
    <ToolPanel
      title="日期计算"
      description="按本地日期语义计算，区间差、加减天数、工作日历与年龄工龄"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
          <TabsList>
            <TabsTrigger value="diff">区间差</TabsTrigger>
            <TabsTrigger value="add">加减</TabsTrigger>
            <TabsTrigger value="calendar">工作日历</TabsTrigger>
            <TabsTrigger value="age">年龄</TabsTrigger>
            <TabsTrigger value="misc">其他</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'diff' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="区间与选项" description="节假日支持 YYYY-MM-DD、MM-DD、逗号/空格分隔，# 之后为注释">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="起始日期">
                <Input
                  type="date"
                  value={startInput}
                  onChange={(event) => setStartInput(event.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <Field label="结束日期">
                <Input
                  type="date"
                  value={endInput}
                  onChange={(event) => setEndInput(event.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Checkbox label="包含首尾两天" checked={inclusive} onChange={setInclusive} />
              <Checkbox
                label="工作日排除周末"
                checked={excludeWeekend}
                onChange={setExcludeWeekend}
                hint="取消后只按节假日排除"
              />
            </div>
            <Field
              label="节假日列表"
              hint={`已识别 ${holidayParse.dates.length} 天${holidayParse.invalid.length > 0 ? ` · ${holidayParse.invalid.length} 条非法` : ''}`}
            >
              <Textarea
                value={holidayText}
                onChange={(event) => setHolidayText(event.target.value)}
                placeholder={'2026-01-01\n2026-02-17, 04-05 # 春节、清明\n# 整行注释'}
                spellCheck={false}
                className="min-h-24 resize-none font-mono text-xs"
              />
            </Field>
            {holidayParse.invalid.length > 0 && (
              <Hint>已忽略无法解析的条目：{holidayParse.invalid.slice(0, 6).join('、')}</Hint>
            )}
          </Section>

          <Section title="计算结果">
            {!start || !end ? (
              <EmptyHint>请输入合法的日期</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat
                    label={inclusive ? '相差天数（含首尾）' : '相差天数（不含首尾）'}
                    value={`${inclusive ? (diff?.inclusiveDays ?? 0) : (diff?.days ?? 0)} 天`}
                    hint={inclusive ? `不含首尾 ${diff?.days ?? 0} 天` : `含首尾 ${diff?.inclusiveDays ?? 0} 天`}
                  />
                  <Stat label="周数" value={(diff?.weeks ?? 0).toFixed(3)} hint="不含首尾 / 7" />
                  <Stat
                    label="工作日天数"
                    value={`${diff?.workdays ?? 0} 天`}
                    hint={excludeWeekend ? '已排除周末与节假日' : '仅排除节假日'}
                    tone="success"
                  />
                  <Stat label="整月数" value={`${diff?.months ?? 0} 个月`} hint={`整年数 ${diff?.years ?? 0}`} />
                  <Stat
                    label="年/月/日 拆分"
                    value={`${diff?.ymd.years ?? 0} 年 ${diff?.ymd.months ?? 0} 月 ${diff?.ymd.days ?? 0} 天`}
                    hint={`${diff?.parts.hours ?? 0} 时 ${diff?.parts.minutes ?? 0} 分 ${diff?.parts.seconds ?? 0} 秒`}
                  />
                  <Stat label="起始周几" value={diff?.startWeekday ?? '-'} hint={isoWeekString(start)} />
                  <Stat label="结束周几" value={diff?.endWeekday ?? '-'} hint={isoWeekString(end)} />
                  <Stat
                    label="ISO 周数"
                    value={`${start.getFullYear()}-W${pad2(diff?.startIso.week ?? 0)}`}
                    hint={`结束 ${end.getFullYear()}-W${pad2(diff?.endIso.week ?? 0)}`}
                  />
                </StatGrid>
                <ResultBox label="汇总" value={diffText} onCopy={() => copyText(diffText)} rows="min-h-32" />
              </>
            )}
          </Section>
        </div>
      )}

      {tab === 'add' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="日期加减" description="月份与年份按日历进位，1 月 31 日加一个月会落到当月最后一天">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="基准日期">
                <Input
                  type="date"
                  value={addDate}
                  onChange={(event) => setAddDate(event.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <Select label="单位" value={addUnit} onChange={setAddUnit} options={ADD_UNITS} />
            </div>
            <TextField
              label="数量"
              value={addAmount}
              onChange={setAddAmount}
              type="number"
              hint="支持负数，负数与「减」等价"
            />
            <Checkbox
              label="不跨越节假日"
              checked={skipHolidays}
              onChange={setSkipHolidays}
              hint="仅对「工作日」单位生效：跳过周末与节假日列表中的日期"
              disabled={addUnit !== 'workday'}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const base = parseLocalDate(addDate);
                  if (!base) return;
                  setAddDate(toDateInput(addDays(base, Math.abs(Number(addAmount) || 1))));
                }}
              >
                <Plus className="size-3.5" />
                直接加到日期
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const base = parseLocalDate(addDate);
                  if (!base) return;
                  setAddDate(toDateInput(addDays(base, -Math.abs(Number(addAmount) || 1))));
                }}
              >
                <Minus className="size-3.5" />
                直接减到日期
              </Button>
            </div>
          </Section>

          <Section title="结果">
            {!addResult ? (
              <EmptyHint>请输入合法日期与数量</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat
                    label="加后日期"
                    value={toDateInput(addResult.plus)}
                    hint={WEEKDAY_LABELS[addResult.plus.getDay()]}
                    tone="success"
                  />
                  <Stat
                    label="减后日期"
                    value={toDateInput(addResult.minus)}
                    hint={WEEKDAY_LABELS[addResult.minus.getDay()]}
                    tone="warn"
                  />
                  <Stat label="加后 ISO 周" value={isoWeekString(addResult.plus)} />
                  <Stat label="减后 ISO 周" value={isoWeekString(addResult.minus)} />
                  <Stat
                    label="加后是否工作日"
                    value={
                      addResult.plus.getDay() !== 0 &&
                      addResult.plus.getDay() !== 6 &&
                      !holidays.has(toDateInput(addResult.plus))
                        ? '是'
                        : '否'
                    }
                  />
                  <Stat label="加后距今天" value={`${diffDays(today, addResult.plus)} 天`} />
                </StatGrid>
                <ResultBox label="汇总" value={addText} onCopy={() => copyText(addText)} rows="min-h-32" />
              </>
            )}
          </Section>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="grid gap-3 md:grid-cols-[1fr_18rem]">
          <Section
            title={`${cursor.year} 年 ${MONTH_LABELS[cursor.month] ?? cursor.month + 1} 月`}
            description="灰色为周末，橙色为节假日，蓝色描边为今天"
            actions={
              <>
                <Select
                  ariaLabel="周起始日"
                  value={String(weekStart)}
                  onChange={(value) => setWeekStart(value === '0' ? 0 : 1)}
                  options={[
                    { value: '1', label: '周一起始' },
                    { value: '0', label: '周日起始' },
                  ]}
                  selectClassName="h-7 w-24 text-[11px]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="上个月"
                  onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="下个月"
                  onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {(weekStart === 1 ? ['一', '二', '三', '四', '五', '六', '日'] : WEEKDAY_SHORT).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const inRange =
                  start !== null && end !== null && cell.date >= start && cell.date <= end ? true : undefined;
                return (
                  <div
                    key={toDateInput(cell.date)}
                    title={`${formatCnDate(cell.date)} ${WEEKDAY_LABELS[cell.date.getDay()]}${cell.holiday ? ' · 节假日' : ''}${cell.weekend ? ' · 周末' : ''}`}
                    className={[
                      'flex h-14 flex-col items-center justify-center rounded-md border text-[11px]',
                      cell.inMonth ? 'bg-card' : 'bg-muted/20 text-muted-foreground/60',
                      cell.weekend ? 'bg-muted/50 text-muted-foreground' : '',
                      cell.holiday ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300' : '',
                      cell.today ? 'border-primary ring-1 ring-primary/40' : '',
                      inRange ? '' : 'opacity-50',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="font-mono text-xs">{cell.day}</span>
                    <span className="text-[9px] leading-tight">
                      {cell.today ? '今天' : cell.holiday ? '假' : cell.weekend ? '休' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="统计" description="工作日总数按当前节假日列表计算">
            <StatGrid className="grid-cols-2">
              <Stat label="本月工作日" value={`${calendarStat.workdays} 天`} tone="success" />
              <Stat label="本月周末" value={`${calendarStat.weekends} 天`} />
              <Stat label="本月节假日" value={`${calendarStat.holidayCount} 天`} tone="warn" />
              <Stat label="本月总天数" value={`${calendarStat.total} 天`} />
              <Stat
                label="区间工作日"
                value={`${calendarRange} 天`}
                hint={start && end ? `${startInput} ~ ${endInput}` : '请先在区间差页设置日期'}
              />
              <Stat label="节假日条目" value={`${holidayParse.dates.length} 条`} />
            </StatGrid>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              >
                回到本月
              </Button>
            </div>
            <Hint>日期按本地时区处理，跨时区场景请先用「时区转换」把时间点归一到 UTC 再计算。</Hint>
          </Section>
        </div>
      )}

      {tab === 'age' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="出生日期" description="可用来算年龄、工龄、下一个生日">
            <Field label="出生日期">
              <Input
                type="date"
                value={birthInput}
                onChange={(event) => setBirthInput(event.target.value)}
                className="h-8 font-mono text-xs"
              />
            </Field>
            <Checkbox label="显示生肖" checked={showShengxiao} onChange={setShowShengxiao} />
            <Hint>生肖以每年 2 月 4 日前后（立春）为分界，精确判断需要农历春节日期。</Hint>
          </Section>

          <Section title="结果">
            {!age ? (
              <EmptyHint>请输入合法的出生日期</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat
                    label="年龄 / 工龄"
                    value={`${age.info.years} 岁 ${age.info.months} 个月 ${age.info.days} 天`}
                    hint={`合计 ${age.info.totalDays} 天`}
                    tone="success"
                  />
                  <Stat label="总周数" value={`${age.info.weeks} 周`} hint={`余 ${age.info.restDays} 天`} />
                  <Stat label="出生当年第几天" value={`第 ${dayOfYear(age.birth)} 天`} hint={formatCnDate(age.birth)} />
                  <Stat
                    label="生日 ISO 周"
                    value={`${isoWeek(age.birth).year}-W${pad2(isoWeek(age.birth).week)}`}
                    hint={WEEKDAY_LABELS[age.birth.getDay()]}
                  />
                  <Stat label="星座" value={age.zodiac} />
                  {showShengxiao && <Stat label="生肖" value={age.shengxiao} />}
                  <Stat
                    label="下一个生日"
                    value={toDateInput(age.birthday.date)}
                    hint={`${WEEKDAY_LABELS[age.birthday.date.getDay()]} · 满 ${age.birthday.nextAge} 岁`}
                    tone="warn"
                  />
                  <Stat
                    label="生日倒计时"
                    value={`${age.birthday.daysLeft} 天`}
                    hint={age.birthday.daysLeft === 0 ? '就是今天' : undefined}
                  />
                </StatGrid>
                <Note tone="info" title="口径说明">
                  <span className="inline-flex items-start gap-1">
                    <Cake className="mt-0.5 size-3 shrink-0" />
                    年龄按公历整月整日推算；2 月 29 日出生者在平年按 2 月 28 日过生日。
                  </span>
                </Note>
              </>
            )}
          </Section>
        </div>
      )}

      {tab === 'misc' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="日期编码" description="ISO 周日期、儒略日、Excel 序列号与时间戳">
            <Field label="日期">
              <Input
                type="date"
                value={miscDate}
                onChange={(event) => setMiscDate(event.target.value)}
                className="h-8 font-mono text-xs"
              />
            </Field>
            {!misc ? (
              <EmptyHint>请输入合法日期</EmptyHint>
            ) : (
              <>
                <StatGrid>
                  <Stat label="ISO 8601 周日期" value={misc.iso} hint="周一为 1，周日为 7" />
                  <Stat label="年内第几天" value={`第 ${misc.dayOfYear} 天`} />
                  <Stat label="儒略日（含小数）" value={misc.jd.toFixed(5)} hint="UT 零日为 .0" />
                  <Stat label="儒略日整数" value={String(misc.jdn)} hint="一日之始为 UT 正午" />
                  <Stat label="简化儒略日" value={misc.mjd.toFixed(5)} hint="MJD = JD − 2400000.5" />
                  <Stat label="Excel 序列号" value={misc.excel.toFixed(5)} hint="基准 1899-12-30" />
                  <Stat label="Unix 秒" value={String(misc.unixSeconds)} />
                  <Stat label="Unix 毫秒" value={String(misc.date.getTime())} />
                </StatGrid>
                <ResultBox
                  label="完整输出"
                  value={[
                    `本地时间\t${formatCnDate(misc.date)} ${WEEKDAY_LABELS[misc.date.getDay()]}`,
                    `UTC\t\t${misc.utc.slice(0, 19).replace('T', ' ')}`,
                    `ISO 周日期\t${misc.iso}`,
                    `ISO 星期\t${misc.info.weekday}`,
                    `年内第几天\t${misc.dayOfYear}`,
                    `儒略日 JD\t${misc.jd.toFixed(6)}`,
                    `儒略日整数 JDN\t${misc.jdn}`,
                    `简化儒略日 MJD\t${misc.mjd.toFixed(6)}`,
                    `Excel 序列号\t${misc.excel.toFixed(6)}`,
                    `Unix 秒\t${misc.unixSeconds}`,
                    `Unix 毫秒\t${misc.date.getTime()}`,
                  ].join('\n')}
                  onCopy={() =>
                    copyText(
                      [
                        `ISO 周日期\t${misc.iso}`,
                        `儒略日 JD\t${misc.jd.toFixed(6)}`,
                        `Excel 序列号\t${misc.excel.toFixed(6)}`,
                        `Unix 毫秒\t${misc.date.getTime()}`,
                      ].join('\n'),
                    )
                  }
                  rows="min-h-40"
                />
                <Hint>
                  这些数值以「本地日期的零点」为基准，儒略日的小数部分与时间戳跟随本机时区； Excel 序列号基准为
                  1899-12-30，1900-03-01 之前因 Excel 沿用 1900 年为闰年的历史错误会相差 1。
                </Hint>
              </>
            )}
          </Section>

          <Section
            title={`${miscCursor.year} 年 ${miscCursor.month + 1} 月 月视图`}
            description="左侧为 ISO 周序号，可切换周起始日"
            actions={
              <>
                <Select
                  ariaLabel="周起始日"
                  value={String(miscWeekStart)}
                  onChange={(value) => setMiscWeekStart(value === '0' ? 0 : 1)}
                  options={[
                    { value: '1', label: '周一起始' },
                    { value: '0', label: '周日起始' },
                  ]}
                  selectClassName="h-7 w-24 text-[11px]"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="上个月"
                  onClick={() => setMiscCursor(shiftMonth(miscCursor.year, miscCursor.month, -1))}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="下个月"
                  onClick={() => setMiscCursor(shiftMonth(miscCursor.year, miscCursor.month, 1))}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </>
            }
          >
            <ResultBox label="月视图" value={monthTable} onCopy={() => copyText(monthTable)} rows="min-h-40" />
            <Hint>第一列为该行所在 ISO 周的周序号，末列为该周的 ISO 周日期；切换周起始日可对照不同排布。</Hint>
          </Section>

          <div className="md:col-span-2">
            <Note tone="info" title="农历暂不支持">
              <span className="inline-flex flex-col gap-1">
                <span className="inline-flex items-center gap-1">
                  <Info className="size-3 shrink-0" />
                  农历（阴阳历）需要完整的朔闰表，扩展内不内置该算法，可参考以下外部页面查询：
                </span>
                <a
                  href="https://www.hko.gov.cn/tc/gts/time/calendar.htm"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2"
                >
                  香港天文台 公历农历对照表
                </a>
                <a
                  href="https://www.timeanddate.com/calendar/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2"
                >
                  timeanddate.com 日历（可切换农历）
                </a>
              </span>
            </Note>
          </div>
        </div>
      )}
    </ToolPanel>
  );
}
