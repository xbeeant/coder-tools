/**
 * 日期计算：全部按「本地日期」语义处理，统一用 new Date(y, m - 1, d) 构造，
 * 避免 UTC 解析导致的差一天问题。不含 React，可在任意环境调用。
 */

export const WEEKDAY_LABELS: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const WEEKDAY_SHORT: string[] = ['日', '一', '二', '三', '四', '五', '六'];
export const MONTH_LABELS: string[] = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

const pad2 = (value: number) => String(value).padStart(2, '0');

/** 校验并构造本地日期；非法输入返回 null。支持 YYYY-MM-DD 与 YYYY/MM/DD。 */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // 反向校验可排除 2026-02-30 这类溢出日期
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/**
 * 解析不带年份的月-日（MM-DD、MM/DD、MMDD），并补上给定年份；
 * 当天不存在时退到当月最后一天（如平年的 2 月 29 日 → 2 月 28 日）。用于节假日列表的简写。
 */
export function parseMonthDay(value: string, year: number): Date | null {
  const match = /^(\d{1,2})[-/](\d{1,2})$/.exec(value.trim()) ?? /^(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, Math.min(day, daysInMonth(year, month - 1)));
}

/** Date → <input type="date"> 的值。 */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 今天的本地零点。 */
export function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 把日期集合转成 Set，便于 O(1) 判断。 */
export function toDateSet(dates: string[]): Set<string> {
  return new Set(dates);
}

export interface HolidayParseResult {
  /** 合法且去重排序后的 YYYY-MM-DD 列表。 */
  dates: string[];
  /** 被忽略的非法条目。 */
  invalid: string[];
}

/**
 * 解析节假日列表：支持逗号、顿号、分号、空格、换行分隔，允许 # 行注释、行尾注释与空行。
 * 日期支持 YYYY-MM-DD、YYYY/MM/DD 与 MM-DD（补上当前年）。
 */
export function parseDateList(text: string, fallbackYear = new Date().getFullYear()): HolidayParseResult {
  const invalid: string[] = [];
  const found = new Set<string>();
  for (const rawLine of text.split('\n')) {
    // 行内注释：# 之后全部忽略
    const line = rawLine.replace(/#.*$/, '');
    for (const raw of line.split(/[,，、;；\s]+/)) {
      const token = raw.trim();
      if (!token) continue;
      const date = parseLocalDate(token) ?? parseMonthDay(token, fallbackYear);
      if (date) found.add(toDateInput(date));
      else invalid.push(token);
    }
  }
  return { dates: [...found].sort(), invalid };
}

export function isHoliday(date: Date, holidays: Set<string>): boolean {
  return holidays.has(toDateInput(date));
}

export function isWorkday(
  date: Date,
  holidays: Set<string>,
  options?: { excludeWeekend?: boolean; skipHolidays?: boolean },
): boolean {
  if (options?.excludeWeekend !== false && isWeekend(date)) return false;
  if (options?.skipHolidays !== false && isHoliday(date, holidays)) return false;
  return true;
}

export function addDays(date: Date, amount: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

export function addMonths(date: Date, amount: number): Date {
  const next = startOfDay(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  // 目标月天数不足时（如 1/31 加一个月）落到当月最后一天
  next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())));
  return next;
}

export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12);
}

/** 加减工作日：正数向后、负数向前，自动跳过周末与节假日。 */
export function addWorkdays(date: Date, amount: number, holidays: Set<string>, skipHolidays = true): Date {
  const step = amount >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.floor(amount));
  let cursor = startOfDay(date);
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (isWorkday(cursor, holidays, { skipHolidays })) remaining -= 1;
  }
  return cursor;
}

export interface DiffOptions {
  /** 是否包含首尾两天，默认只算间隔（不含首日）。 */
  inclusive?: boolean;
  /** 包含首尾时是否计入起始日，默认计入。 */
  includeStart?: boolean;
}

/** 相差天数：起止顺序颠倒时按绝对值计算。 */
export function diffDays(start: Date, end: Date, options?: DiffOptions): number {
  const [from, to] = start <= end ? [start, end] : [end, start];
  const base = Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
  if (!options?.inclusive) return base;
  return base + ((options.includeStart ?? true) ? 1 : 0);
}

/** 相差周数（可含小数）。 */
export function diffWeeks(start: Date, end: Date, options?: DiffOptions): number {
  return diffDays(start, end, options) / 7;
}

/** 区间内的工作日天数。 */
export function countWorkdays(
  start: Date,
  end: Date,
  holidays: Set<string>,
  excludeWeekend = true,
  skipHolidays = true,
): number {
  const from = startOfDay(start <= end ? start : end);
  const to = startOfDay(start <= end ? end : start);
  let count = 0;
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor, holidays, { excludeWeekend, skipHolidays })) count += 1;
  }
  return count;
}

/** 整月数：不足一个月的余数不算。 */
export function wholeMonths(start: Date, end: Date): number {
  const [from, to] = start <= end ? [start, end] : [end, start];
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

export function wholeYears(start: Date, end: Date): number {
  return Math.floor(wholeMonths(start, end) / 12);
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 毫秒余数（只在秒以下时非零）。 */
  milliseconds: number;
  totalMilliseconds: number;
  negative: boolean;
}

/** 把毫秒时长拆成年 / 月（按 30 天）/ 日 / 时 / 分 / 秒。 */
export function splitDuration(milliseconds: number): DurationParts {
  const negative = milliseconds < 0;
  let rest = Math.abs(Math.round(milliseconds));
  const days = Math.floor(rest / 86_400_000);
  rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000);
  rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000);
  rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1000);
  const millis = rest - seconds * 1000;
  return { days, hours, minutes, seconds, milliseconds: millis, totalMilliseconds: milliseconds, negative };
}

export interface IsoWeekInfo {
  /** ISO 8601 周年，可能与日历年不同。 */
  year: number;
  /** ISO 周序号 1-53。 */
  week: number;
  /** ISO 星期序号：1 = 周一 … 7 = 周日。 */
  weekday: number;
}

/** ISO 8601 周序号与星期序号。 */
export function isoWeek(date: Date): IsoWeekInfo {
  const target = startOfDay(date);
  // 挪到本周周四：ISO 周以周四所在年份为准
  const day = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - day + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  const weekday = ((date.getDay() + 6) % 7) + 1;
  return { year: target.getFullYear(), week, weekday };
}

/** ISO 8601 周日期字符串，例如 2026-W01-1。 */
export function isoWeekString(date: Date): string {
  const info = isoWeek(date);
  return `${info.year}-W${pad2(info.week)}-${info.weekday}`;
}

/** 一年中的第几天。 */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.round((startOfDay(date).getTime() - start.getTime()) / 86_400_000) + 1;
}

/** 儒略日（含小数，UT 零日为 .0）。 */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** 儒略日数（整数，一日之始为 UT 正午）。 */
export function julianDayNumber(date: Date): number {
  return Math.floor(julianDay(date) + 0.5);
}

/** 简化儒略日，MJD = JD − 2400000.5。 */
export function modifiedJulianDay(date: Date): number {
  return julianDay(date) - 2400000.5;
}

/**
 * Excel 序列号：基准为 1899-12-30。
 * 1900-03-01 之前因 Excel 沿用 1900 年为闰年的历史错误会相差 1。
 */
export function excelSerial(date: Date): number {
  const base = Date.UTC(1899, 11, 30);
  const days = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const fraction =
    (date.getHours() * 3_600_000 + date.getMinutes() * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds()) /
    86_400_000;
  return (days - base) / 86_400_000 + fraction;
}

const ZODIAC_RANGES: { name: string; from: [number, number]; to: [number, number] }[] = [
  { name: '摩羯座', from: [12, 22], to: [1, 19] },
  { name: '水瓶座', from: [1, 20], to: [2, 18] },
  { name: '双鱼座', from: [2, 19], to: [3, 20] },
  { name: '白羊座', from: [3, 21], to: [4, 19] },
  { name: '金牛座', from: [4, 20], to: [5, 20] },
  { name: '双子座', from: [5, 21], to: [6, 21] },
  { name: '巨蟹座', from: [6, 22], to: [7, 22] },
  { name: '狮子座', from: [7, 23], to: [8, 22] },
  { name: '处女座', from: [8, 23], to: [9, 22] },
  { name: '天秤座', from: [9, 23], to: [10, 23] },
  { name: '天蝎座', from: [10, 24], to: [11, 22] },
  { name: '射手座', from: [11, 23], to: [12, 21] },
];

/** 星座（按公历月日划分）。 */
export function zodiacOf(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const range of ZODIAC_RANGES) {
    if (range.from[0] > range.to[0]) {
      if ((month === range.from[0] && day >= range.from[1]) || (month === range.to[0] && day <= range.to[1])) {
        return range.name;
      }
    } else if (month === range.from[0] && day >= range.from[1]) {
      return range.name;
    } else if (month === range.to[0] && day <= range.to[1]) {
      return range.name;
    }
  }
  return '未知';
}

const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** 生肖：按公历年 2 月 4 日前后近似分界（以立春为界，非农历春节）。 */
export function shengxiaoOf(date: Date): string {
  const year = date.getMonth() === 0 && date.getDate() < 4 ? date.getFullYear() - 1 : date.getFullYear();
  return SHENGXIAO[(((year - 4) % 12) + 12) % 12];
}

export interface AgeParts {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  weeks: number;
  /** 不足一周的余数天数。 */
  restDays: number;
  hours: number;
}

/** 年龄 / 工龄：精确到年、月、日。 */
export function ageOf(birth: Date, now: Date = todayLocal()): AgeParts {
  const from = startOfDay(birth);
  const to = startOfDay(now);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += daysInMonth(to.getFullYear(), to.getMonth() - 1);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  return {
    years,
    months,
    days,
    totalDays,
    weeks: Math.floor(totalDays / 7),
    restDays: totalDays % 7,
    hours: Math.floor((now.getTime() - birth.getTime()) / 3_600_000) % 24,
  };
}

export interface BirthdayInfo {
  date: Date;
  /** 距离下一次生日的天数，今天生日为 0。 */
  daysLeft: number;
  /** 即将到来的年龄。 */
  nextAge: number;
}

/** 下一次生日（2 月 29 日在平年按 2 月 28 日处理）。 */
export function nextBirthday(birth: Date, now: Date = todayLocal()): BirthdayInfo {
  const today = startOfDay(now);
  const month = birth.getMonth();
  const day = birth.getDate();
  let year = today.getFullYear();
  let date = new Date(year, month, Math.min(day, daysInMonth(year, month)));
  if (date.getTime() < today.getTime()) {
    year += 1;
    date = new Date(year, month, Math.min(day, daysInMonth(year, month)));
  }
  return {
    date,
    daysLeft: Math.round((date.getTime() - today.getTime()) / 86_400_000),
    nextAge: year - birth.getFullYear(),
  };
}

export interface CalendarCell {
  date: Date;
  day: number;
  /** 是否属于当前月份。 */
  inMonth: boolean;
  weekend: boolean;
  holiday: boolean;
  today: boolean;
  workday: boolean;
  /** 该格所在 ISO 周的 ISO 周日期字符串。 */
  isoWeek: string;
  /** 该格所在 ISO 周的周序号。 */
  week: number;
}

/** 某个月的日历网格，weekStart：0 = 周日，1 = 周一。 */
export function monthGrid(
  year: number,
  month: number,
  weekStart: 0 | 1,
  holidays: Set<string>,
  today: Date = todayLocal(),
): CalendarCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const total = daysInMonth(year, month);
  const weeks = Math.ceil((offset + total) / 7);
  const cells: CalendarCell[] = [];
  for (let index = 0; index < weeks * 7; index++) {
    const date = addDays(first, index - offset);
    const info = isoWeek(date);
    cells.push({
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      weekend: isWeekend(date),
      holiday: isHoliday(date, holidays),
      today: isSameDay(date, today),
      workday: isWorkday(date, holidays),
      isoWeek: isoWeekString(date),
      week: info.week,
    });
  }
  return cells;
}

/** 中文长日期，例如 2026 年 9 月 30 日。 */
export function formatCnDate(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 中文短日期时间，例如 2026-09-30 20:15。 */
export function formatCnDateTime(date: Date): string {
  return `${formatCnDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 某月的工作日统计。 */
export function monthWorkdayStat(
  year: number,
  month: number,
  holidays: Set<string>,
): { workdays: number; weekends: number; holidayCount: number; total: number } {
  const total = daysInMonth(year, month);
  let workdays = 0;
  let weekends = 0;
  let holidayCount = 0;
  for (let day = 1; day <= total; day++) {
    const date = new Date(year, month, day);
    if (isWeekend(date)) weekends += 1;
    if (isHoliday(date, holidays)) holidayCount += 1;
    if (isWorkday(date, holidays)) workdays += 1;
  }
  return { workdays, weekends, holidayCount, total };
}
