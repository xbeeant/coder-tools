/**
 * 时区换算：全部基于 Intl 内置的 IANA 时区数据，不发起任何网络请求。
 * 时间点统一用时间戳（毫秒）传递，只有「输入墙钟时间」时才需要按目标时区反解。
 */

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
  second: number;
  /** 0 = 周日 */
  weekday: number;
}

/** Intl.supportedValuesOf 在部分旧环境缺失，这里给出常用时区降级列表。 */
const FALLBACK_TIME_ZONES: string[] = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

let zoneCache: string[] | null = null;

/** 可搜索的 IANA 时区列表；supportedValuesOf 不可用时回退到内置列表。 */
export function timeZoneList(): string[] {
  if (zoneCache) return zoneCache;
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  let list: string[] = [];
  if (typeof supported === 'function') {
    try {
      const values = supported('timeZone');
      if (Array.isArray(values)) list = values.filter((item): item is string => typeof item === 'string');
    } catch {
      // 某些实现不支持 'timeZone' 键，直接使用降级列表
    }
  }
  const unique = [...new Set(list)];
  zoneCache = unique.length > 0 ? ['UTC', ...unique.filter((zone) => zone !== 'UTC')] : FALLBACK_TIME_ZONES;
  return zoneCache;
}

/** 浏览器当前时区，异常时回退 UTC。 */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const PARTS_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = PARTS_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  PARTS_CACHE.set(timeZone, formatter);
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 读出某一时刻在目标时区的「墙钟时间」各字段。 */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(isValidTimeZone(timeZone) ? timeZone : 'UTC').formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = part.type === 'weekday' ? (WEEKDAY_INDEX[part.value] ?? 0) : Number(part.value);
  }
  return {
    year: map.year ?? 1970,
    month: map.month ?? 1,
    day: map.day ?? 1,
    hour: map.hour ?? 0,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
    weekday: map.weekday ?? 0,
  };
}

/** Date.UTC 对 0-99 年会映射到 1900-1999，这里修正。 */
function utcFromFields(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  if (year >= 0 && year < 100) {
    const shifted = new Date(time);
    shifted.setUTCFullYear(year);
    return shifted.getTime();
  }
  return time;
}

/** 目标时区在给定时刻的 UTC 偏移（分钟，东八区为 +480）。 */
export function offsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = utcFromFields(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** 偏移格式化为 +08:00 / -03:30 形式。 */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 时区缩写，如 CST / GMT+8 / EST。 */
export function shortZoneName(date: Date, timeZone: string): string {
  return zoneName(date, timeZone, 'short');
}

/** 通用名称（不体现是否夏令时），如「中国标准时间」。 */
export function longZoneName(date: Date, timeZone: string): string {
  return zoneName(date, timeZone, 'longGeneric');
}

function zoneName(date: Date, timeZone: string, style: 'short' | 'longGeneric' | 'long'): string {
  const safeZone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const build = (nameStyle: 'short' | 'longGeneric' | 'long') =>
    new Intl.DateTimeFormat('zh-CN', { timeZone: safeZone, timeZoneName: nameStyle })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  try {
    return build(style) || build('long') || build('short');
  } catch {
    try {
      return build('long');
    } catch {
      return formatOffset(offsetMinutes(date, safeZone));
    }
  }
}

/** 抽样全年（每月 15 日 12:00 UTC）得到偏移范围，南北半球通用。 */
function offsetRange(date: Date, timeZone: string): { min: number; max: number } {
  const year = zonedParts(date, timeZone).year;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let month = 0; month < 12; month++) {
    const sample = new Date(Date.UTC(year, month, 15, 12));
    const offset = offsetMinutes(sample, timeZone);
    if (offset < min) min = offset;
    if (offset > max) max = offset;
  }
  return { min, max };
}

/**
 * 判定是否处于夏令时：当年存在两种偏移时，把最小偏移视为标准时。
 * 例外：爱尔兰等「负夏令时」时区在 tzdb 中冬季反而是标准时，本判定会把它标为夏令时。
 */
export function isDaylightSaving(date: Date, timeZone: string): boolean {
  const { min, max } = offsetRange(date, timeZone);
  if (max === min) return false;
  return offsetMinutes(date, timeZone) > min;
}

/** 某一年的标准时偏移（分钟）。 */
export function standardOffsetMinutes(date: Date, timeZone: string): number {
  return offsetRange(date, timeZone).min;
}

export interface DstRule {
  id: string;
  label: string;
  /** 规则说明文本，仅供阅读参考。 */
  rule: string;
  zones: string[];
}

/**
 * 内置夏令时规则表：Intl 只能给出当前名称，拿不到「几月几日切换」，
 * 因此对美 / 欧 / 澳等主要时区手写规则文案，界面上会标注「内置规则，仅供参考」。
 */
export const DST_RULES: DstRule[] = [
  {
    id: 'us',
    label: '美国 / 加拿大（大部分）',
    rule: '3 月第二个周日 02:00（当地标准时间）开始，11 月第一个周日 02:00 结束。',
    zones: [
      'America/New_York',
      'America/Detroit',
      'America/Toronto',
      'America/Chicago',
      'America/Winnipeg',
      'America/Denver',
      'America/Edmonton',
      'America/Los_Angeles',
      'America/Vancouver',
      'America/Anchorage',
      'America/Boise',
      'America/Juneau',
      'America/Sitka',
      'America/Whitehorse',
      'America/Menominee',
      'America/Indiana/Indianapolis',
      'America/Indiana/Chicago',
      'America/Indiana/Denver',
      'America/Indiana/Los_Angeles',
      'America/North_Dakota/Center',
      'America/North_Dakota/New_Salem',
      'America/Kentucky/Louisville',
      'Canada/Eastern',
      'Canada/Central',
      'Canada/Mountain',
      'Canada/Pacific',
      'US/Eastern',
      'US/Central',
      'US/Mountain',
      'US/Pacific',
      'US/Alaska',
    ],
  },
  {
    id: 'us-fixed',
    label: '美国（不实行夏令时）',
    rule: '全年不实行夏令时：亚利桑那州、怀俄明州、阿拉斯加部分地区与夏威夷。',
    zones: ['America/Phoenix', 'Pacific/Honolulu', 'America/Regina', 'America/Swift_Current', 'Etc/GMT+7', 'HST'],
  },
  {
    id: 'eu',
    label: '欧盟统一规则',
    rule: '3 月最后一个周日 01:00 UTC 开始，10 月最后一个周日 01:00 UTC 结束。',
    zones: [
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Madrid',
      'Europe/Rome',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Vienna',
      'Europe/Zurich',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Prague',
      'Europe/Warsaw',
      'Europe/Budapest',
      'Europe/Lisbon',
      'Europe/Athens',
      'Europe/Helsinki',
      'Europe/Bucharest',
      'Europe/Sofia',
      'Europe/Belgrade',
      'Europe/Zagreb',
      'Europe/Sarajevo',
      'Europe/Skopje',
      'Europe/Tirane',
      'Europe/Riga',
      'Europe/Vilnius',
      'Europe/Tallinn',
      'Europe/Luxembourg',
      'Europe/Malta',
      'Europe/Cyprus',
      'Europe/Monaco',
      'Europe/Ljubljana',
      'Europe/Bratislava',
      'Atlantic/Canary',
      'Atlantic/Faroe',
      'Africa/Casablanca',
      'Africa/Ceuta',
      'CET',
      'EET',
      'WET',
    ],
  },
  {
    id: 'eu-fixed',
    label: '欧洲（已取消夏令时）',
    rule: '全年固定偏移：俄罗斯 2014 年起、欧盟部分国家已取消，夏令时无需考虑。',
    zones: [
      'Europe/Istanbul',
      'Europe/Minsk',
      'Atlantic/Reykjavik',
      'Atlantic/Jan_Mayen',
      'Africa/Algiers',
      'Africa/Tunis',
    ],
  },
  {
    id: 'cn',
    label: '中国大陆',
    rule: '全境不使用夏令时，全年固定 UTC+08:00；新疆部分地区日常作息按 UTC+02:00（Asia/Urumqi）。',
    zones: ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'PRC'],
  },
  {
    id: 'cn-hk',
    label: '港澳台',
    rule: '不使用夏令时，全年固定 UTC+08:00。',
    zones: ['Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'ROC'],
  },
  {
    id: 'asia-east',
    label: '日韩',
    rule: '不使用夏令时，全年固定 UTC+09:00。',
    zones: ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Pyongyang', 'Japan', 'ROK'],
  },
  {
    id: 'asia-fixed',
    label: '亚洲（固定偏移）',
    rule: '不使用夏令时。印度 UTC+05:30、尼泊尔 UTC+05:45 为半小时 / 45 分钟时区。',
    zones: [
      'Asia/Kolkata',
      'Asia/Calcutta',
      'Asia/Kathmandu',
      'Asia/Dhaka',
      'Asia/Yangon',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Pontianak',
      'Asia/Makassar',
      'Asia/Jayapura',
      'Asia/Ho_Chi_Minh',
      'Asia/Saigon',
      'Asia/Kuala_Lumpur',
      'Asia/Singapore',
      'Asia/Manila',
      'Asia/Phnom_Penh',
      'Asia/Vientiane',
      'Asia/Brunei',
      'Asia/Kuching',
      'Asia/Kota_Kinabalu',
      'Asia/Colombo',
      'Asia/Karachi',
      'Asia/Dubai',
      'Asia/Muscat',
      'Asia/Baku',
      'Asia/Tbilisi',
      'Asia/Yerevan',
      'Asia/Tashkent',
      'Asia/Ashgabat',
      'Asia/Dushanbe',
      'Asia/Samarkand',
      'Indian/Maldives',
    ],
  },
  {
    id: 'il',
    label: '以色列',
    rule: '近年规则多次调整，通常在 3 月最后一个周五 02:00 开始、10 月最后一个周日 02:00 结束。',
    zones: ['Asia/Jerusalem', 'Asia/Tel_Aviv', 'Asia/Hebron', 'Asia/Gaza'],
  },
  {
    id: 'ir',
    label: '伊朗',
    rule: '伊朗自 2022 年起不再使用夏令时，全年固定 UTC+03:30。',
    zones: ['Asia/Tehran', 'Iran'],
  },
  {
    id: 'ru',
    label: '俄罗斯',
    rule: '各时区全年固定偏移，不使用夏令时。',
    zones: [
      'Europe/Moscow',
      'Europe/Kaliningrad',
      'Europe/Samara',
      'Europe/Simferopol',
      'Europe/Volgograd',
      'Asia/Yekaterinburg',
      'Asia/Omsk',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Chita',
      'Asia/Yakutsk',
      'Asia/Vladivostok',
      'Asia/Magadan',
      'Asia/Kamchatka',
      'Asia/Anadyr',
      'W-SU',
    ],
  },
  {
    id: 'br',
    label: '巴西',
    rule: '巴西自 2019 年起取消夏令时，全年固定偏移。',
    zones: [
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Fortaleza',
      'America/Recife',
      'America/Belem',
      'America/Manaus',
      'America/Cuiaba',
      'America/Campo_Grande',
      'America/Porto_Velho',
      'America/Boa_Vista',
      'America/Rio_Branco',
      'America/Araguaina',
      'America/Maceio',
      'America/Santarem',
    ],
  },
  {
    id: 'mx',
    label: '墨西哥',
    rule: '墨西哥 2022 年起取消夏令时，临近美国边境的部分州（如 Chihuahua）仍常年保持夏令时偏移。',
    zones: [
      'America/Mexico_City',
      'America/Monterrey',
      'America/Matamoros',
      'America/Chihuahua',
      'America/Ojinaga',
      'America/Ciudad_Juarez',
    ],
  },
  {
    id: 'cl',
    label: '智利',
    rule: '南半球规则：9 月第一个周日 00:00 拨快一小时，次年 4 月第一个周日 00:00 拨回。',
    zones: ['America/Santiago', 'Chile/EasterIsland'],
  },
  {
    id: 'au',
    label: '澳大利亚（东南部）',
    rule: '南半球规则：10 月第一个周日 02:00 拨到 03:00，次年 4 月第一个周日 03:00 拨回 02:00。',
    zones: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Hobart',
      'Australia/Canberra',
      'Australia/ACT',
      'Australia/NSW',
    ],
  },
  {
    id: 'au-adelaide',
    label: '澳大利亚（阿德莱德）',
    rule: '与东南部同一日期切换，夏令时期间为 UTC+10:30，标准时为 UTC+09:30。',
    zones: ['Australia/Adelaide', 'Australia/Broken_Hill'],
  },
  {
    id: 'au-fixed',
    label: '澳大利亚（不实行夏令时）',
    rule: '不使用夏令时：布里斯班 UTC+10:00、达尔文 UTC+09:30、珀斯 UTC+08:00。',
    zones: ['Australia/Brisbane', 'Australia/Darwin', 'Australia/Perth', 'Australia/Lord_Howe', 'Australia/Eucla'],
  },
  {
    id: 'nz',
    label: '新西兰',
    rule: '9 月最后一个周日 02:00 拨到 03:00，次年 4 月第一个周日 03:00 拨回 02:00。',
    zones: ['Pacific/Auckland', 'NZ'],
  },
  {
    id: 'za',
    label: '南部非洲',
    rule: '不使用夏令时，全年固定 UTC+02:00。',
    zones: [
      'Africa/Johannesburg',
      'Africa/Harare',
      'Africa/Maputo',
      'Africa/Maseru',
      'Africa/Mbabane',
      'Africa/Lusaka',
    ],
  },
];

export function dstRuleFor(timeZone: string): DstRule | undefined {
  return DST_RULES.find((rule) => rule.zones.includes(timeZone));
}

export interface DstInfo {
  /** 当前时刻是否处于夏令时。 */
  isDst: boolean;
  /** 当前 UTC 偏移（分钟）。 */
  offset: number;
  /** 标准时偏移（分钟）。 */
  standardOffset: number;
  /** 与标准时的差值（分钟）。 */
  deltaMinutes: number;
  /** 规则说明。 */
  rule: string;
  /** 规则来源：Intl 名称或内置规则表。 */
  source: 'intl' | 'builtin';
  /** 命中的内置规则名称。 */
  ruleLabel?: string;
}

/** 夏令时综合信息：是否在夏令时、与标准时差、规则说明。 */
export function dstInfo(date: Date, timeZone: string): DstInfo {
  const safeZone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const offset = offsetMinutes(date, safeZone);
  const { min, max } = offsetRange(date, safeZone);
  const builtin = dstRuleFor(safeZone);
  const generic = longZoneName(date, safeZone);
  return {
    isDst: max > min && offset > min,
    offset,
    standardOffset: min,
    deltaMinutes: offset - min,
    rule: builtin ? builtin.rule : generic || '无夏令时信息（该时区全年使用固定偏移）',
    source: builtin ? 'builtin' : 'intl',
    ruleLabel: builtin?.label,
  };
}

/**
 * 把「目标时区的墙钟时间」反解成时间戳。
 * 做法：先按 UTC 猜一次，再用猜出的偏移修正；夏令时切换附近再收敛一次。
 */
export function instantFromZonedInput(
  fields: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): Date {
  const safeZone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const naive = utcFromFields(fields.year, fields.month, fields.day, fields.hour, fields.minute, fields.second);
  let time = naive;
  for (let round = 0; round < 2; round++) {
    const offset = offsetMinutes(new Date(time), safeZone);
    const next = naive - offset * 60000;
    if (next === time) break;
    time = next;
  }
  return new Date(time);
}

/** 目标时区比源时区快多少小时（可为负，含半小时 / 45 分钟时区）。 */
export function zoneDiffHours(source: string, target: string, date: Date): number {
  return (offsetMinutes(date, target) - offsetMinutes(date, source)) / 60;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** 目标时区的可读时间，例如 2026-09-30 20:15:00。 */
export function formatZoned(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** 带偏移的 ISO 8601，例如 2026-09-30T20:15:00+08:00。 */
export function isoZoned(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}${formatOffset(
    offsetMinutes(date, timeZone),
  )}`;
}

/** RFC 3339 时间戳（带偏移，与 ISO 8601 兼容）。 */
export function rfc3339(date: Date, timeZone: string): string {
  return isoZoned(date, timeZone);
}

export interface ZoneRow {
  timeZone: string;
  local: string;
  utc: string;
  offset: string;
  isDst: boolean;
  abbr: string;
  diffHours: number;
  weekday: string;
}

/** 目标时区对照表的一行。 */
export function zoneRow(date: Date, timeZone: string, sourceZone: string): ZoneRow {
  const p = zonedParts(date, timeZone);
  const diff = zoneDiffHours(sourceZone, timeZone, date);
  const diffText = Number.isInteger(diff)
    ? `${diff >= 0 ? '+' : ''}${diff}`
    : `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
  return {
    timeZone,
    local: formatZoned(date, timeZone),
    utc: `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    offset: formatOffset(offsetMinutes(date, timeZone)),
    isDst: isDaylightSaving(date, timeZone),
    abbr: shortZoneName(date, timeZone),
    diffHours: diff,
    weekday: `${WEEKDAY_LABEL[p.weekday] ?? ''} · 时差 ${diffText} 小时`,
  };
}

export const WEEKDAY_LABEL: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface MeetingRow {
  timeZone: string;
  /** 该时区在每个 UTC 小时对应的本地小时。 */
  localHours: number[];
  /** 该时区在每个 UTC 小时是否处于工作时段。 */
  inWork: boolean[];
}

export interface MeetingMatrix {
  /** UTC 0-23。 */
  hours: number[];
  rows: MeetingRow[];
  /** 每个 UTC 小时上处于工作时段的时区数量。 */
  counts: number[];
  maxCount: number;
  /** 达到重叠阈值的连续 UTC 小时段。 */
  slots: { startUtc: number; endUtc: number; count: number }[];
}

/**
 * 会议时间助手：按 UTC 0-23 点逐时评估各时区是否落在工作时段，
 * 输出色块矩阵所需的计数与可用时间段。
 */
export function meetingMatrix(
  day: Date,
  timeZones: string[],
  workStart: number,
  workEnd: number,
  minOverlap: number,
): MeetingMatrix {
  const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const rows: MeetingRow[] = timeZones.map((timeZone) => {
    const localHours: number[] = [];
    const inWork: boolean[] = [];
    for (const hour of hours) {
      const local = zonedParts(new Date(base + hour * 3_600_000), timeZone).hour;
      localHours.push(local);
      inWork.push(local >= workStart && local < workEnd);
    }
    return { timeZone, localHours, inWork };
  });
  const counts = hours.map((_, index) => rows.filter((row) => row.inWork[index]).length);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const slots: { startUtc: number; endUtc: number; count: number }[] = [];
  let start = -1;
  for (let hour = 0; hour <= 24; hour++) {
    const ok = hour < 24 && counts[hour] >= minOverlap;
    if (ok && start < 0) start = hour;
    if (!ok && start >= 0) {
      const slice = counts.slice(start, hour);
      slots.push({ startUtc: start, endUtc: hour, count: Math.min(...slice) });
      start = -1;
    }
  }
  return { hours, rows, counts, maxCount, slots };
}

export interface MeetingSlot {
  startUtc: number;
  endUtc: number;
  /** 每个时区对应的本地时间范围文本。 */
  ranges: { timeZone: string; text: string }[];
}

/** 把 UTC 时间段翻译成各时区的本地时间段文本。 */
export function describeSlot(day: Date, slot: { startUtc: number; endUtc: number }, timeZones: string[]): MeetingSlot {
  const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  return {
    startUtc: slot.startUtc,
    endUtc: slot.endUtc,
    ranges: timeZones.map((timeZone) => {
      const from = zonedParts(new Date(base + slot.startUtc * 3_600_000), timeZone);
      const to = zonedParts(new Date(base + (slot.endUtc - 1) * 3_600_000), timeZone);
      return {
        timeZone,
        text: `${pad2(from.hour)}:00–${pad2(to.hour)}:59`,
      };
    }),
  };
}

export interface WorldClockEntry {
  id: string;
  label: string;
}

/** 世界时钟卡片使用的常用时区。 */
export const COMMON_TIME_ZONES: WorldClockEntry[] = [
  { id: 'Asia/Shanghai', label: '上海' },
  { id: 'Asia/Tokyo', label: '东京' },
  { id: 'Asia/Singapore', label: '新加坡' },
  { id: 'Europe/London', label: '伦敦' },
  { id: 'America/New_York', label: '纽约' },
  { id: 'America/Los_Angeles', label: '洛杉矶' },
  { id: 'Europe/Paris', label: '巴黎' },
  { id: 'Asia/Dubai', label: '迪拜' },
  { id: 'Australia/Sydney', label: '悉尼' },
];

/** 批量转换：生成多行可复制文本。 */
export function batchLines(date: Date, timeZones: string[]): string {
  const lines: string[] = [`ISO 8601（UTC）  ${date.toISOString()}`, `RFC 3339（UTC） ${date.toISOString()}`, ''];
  for (const timeZone of timeZones) {
    const info = dstInfo(date, timeZone);
    lines.push(
      `${timeZone}  ${isoZoned(date, timeZone)}  ${shortZoneName(date, timeZone)} ${formatOffset(info.offset)}${
        info.isDst ? ' 夏令时' : ''
      }`,
    );
  }
  return lines.join('\n');
}

/** 时刻 → <input type="datetime-local"> 的值（按目标时区的墙钟时间）。 */
export function toDatetimeLocalInput(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 解析 <input type="datetime-local"> 的值，按目标时区反解成时间戳。 */
export function fromDatetimeLocalInput(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return instantFromZonedInput(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: 0,
    },
    timeZone,
  );
}
