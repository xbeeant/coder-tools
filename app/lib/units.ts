/** 单位换算：按类别维护统一基准单位，非线性单位（温度）单独处理。 */

export interface UnitDef {
  id: string;
  label: string;
  /** 线性单位换算到基准单位的系数。 */
  factor?: number;
  /** 加性偏移，基准值 = value * factor + offset（温度类由专用函数处理）。 */
  offset?: number;
  /** 倒数类单位（如 km/L → L/100km）：基准值 = factor / value。 */
  inverse?: boolean;
  /** 单位说明，展示在「全部单位一览」中。 */
  note?: string;
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  /** 类别一句话说明，缺省时按单位数量与基准单位自动生成。 */
  description?: string;
  units: UnitDef[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: '长度',
    base: 'm',
    units: [
      { id: 'nm', label: '纳米 (nm)', factor: 1e-9 },
      { id: 'um', label: '微米 (µm)', factor: 1e-6 },
      { id: 'mm', label: '毫米 (mm)', factor: 0.001 },
      { id: 'cm', label: '厘米 (cm)', factor: 0.01 },
      { id: 'dm', label: '分米 (dm)', factor: 0.1 },
      { id: 'm', label: '米 (m)', factor: 1 },
      { id: 'km', label: '千米 (km)', factor: 1000 },
      { id: 'in', label: '英寸 (in)', factor: 0.0254 },
      { id: 'ft', label: '英尺 (ft)', factor: 0.3048 },
      { id: 'yd', label: '码 (yd)', factor: 0.9144 },
      { id: 'mi', label: '英里 (mi)', factor: 1609.344 },
      { id: 'nmi', label: '海里 (nmi)', factor: 1852 },
      { id: 'ly', label: '光年 (ly)', factor: 9.4607304725808e15 },
    ],
  },
  {
    id: 'mass',
    label: '质量',
    base: 'kg',
    units: [
      { id: 'mg', label: '毫克 (mg)', factor: 1e-6 },
      { id: 'g', label: '克 (g)', factor: 0.001 },
      { id: 'kg', label: '千克 (kg)', factor: 1 },
      { id: 't', label: '吨 (t)', factor: 1000 },
      { id: 'oz', label: '盎司 (oz)', factor: 0.028349523125 },
      { id: 'lb', label: '磅 (lb)', factor: 0.45359237 },
      { id: 'st', label: '英石 (st)', factor: 6.35029318 },
      { id: 'ct', label: '克拉 (ct)', factor: 0.0002 },
    ],
  },
  {
    id: 'area',
    label: '面积',
    base: 'm²',
    units: [
      { id: 'mm2', label: '平方毫米 (mm²)', factor: 1e-6 },
      { id: 'cm2', label: '平方厘米 (cm²)', factor: 1e-4 },
      { id: 'm2', label: '平方米 (m²)', factor: 1 },
      { id: 'km2', label: '平方千米 (km²)', factor: 1e6 },
      { id: 'ha', label: '公顷 (ha)', factor: 10000 },
      { id: 'in2', label: '平方英寸 (in²)', factor: 0.00064516 },
      { id: 'ft2', label: '平方英尺 (ft²)', factor: 0.09290304 },
      { id: 'acre', label: '英亩 (acre)', factor: 4046.8564224 },
    ],
  },
  {
    id: 'volume',
    label: '体积',
    base: 'L',
    units: [
      { id: 'ml', label: '毫升 (mL)', factor: 0.001 },
      { id: 'l', label: '升 (L)', factor: 1 },
      { id: 'm3', label: '立方米 (m³)', factor: 1000 },
      { id: 'cm3', label: '立方厘米 (cm³)', factor: 0.001 },
      { id: 'gal-us', label: '美制加仑 (gal)', factor: 3.785411784 },
      { id: 'gal-uk', label: '英制加仑 (gal)', factor: 4.54609 },
      { id: 'qt', label: '夸脱 (qt)', factor: 0.946352946 },
      { id: 'pt', label: '品脱 (pt)', factor: 0.473176473 },
      { id: 'cup', label: '杯 (cup)', factor: 0.2365882365 },
      { id: 'floz', label: '液量盎司 (fl oz)', factor: 0.0295735295625 },
    ],
  },
  {
    id: 'speed',
    label: '速度',
    base: 'm/s',
    units: [
      { id: 'ms', label: '米/秒 (m/s)', factor: 1 },
      { id: 'kmh', label: '千米/时 (km/h)', factor: 1000 / 3600 },
      { id: 'mph', label: '英里/时 (mph)', factor: 0.44704 },
      { id: 'kn', label: '节 (kn)', factor: 1852 / 3600 },
      { id: 'fts', label: '英尺/秒 (ft/s)', factor: 0.3048 },
      { id: 'mach', label: '马赫 (Ma, 海平面)', factor: 340.29 },
      { id: 'c', label: '光速 (c)', factor: 299792458 },
    ],
  },
  {
    id: 'time',
    label: '时间',
    base: 's',
    units: [
      { id: 'ms', label: '毫秒 (ms)', factor: 0.001 },
      { id: 's', label: '秒 (s)', factor: 1 },
      { id: 'min', label: '分钟 (min)', factor: 60 },
      { id: 'h', label: '小时 (h)', factor: 3600 },
      { id: 'd', label: '天 (d)', factor: 86400 },
      { id: 'wk', label: '周 (wk)', factor: 604800 },
      { id: 'mo', label: '月 (mo, 按 30 天)', factor: 2592000 },
      { id: 'yr', label: '年 (yr, 按 365 天)', factor: 31536000 },
    ],
  },
  {
    id: 'temperature',
    label: '温度',
    base: 'C',
    units: [
      { id: 'C', label: '摄氏度 (°C)', factor: 1, offset: 0 },
      { id: 'F', label: '华氏度 (°F)', factor: 5 / 9, offset: -32 },
      { id: 'K', label: '开尔文 (K)', factor: 1, offset: -273.15 },
      { id: 'R', label: '兰氏度 (°R)', factor: 5 / 9, offset: -218.52 },
    ],
  },
  {
    id: 'power',
    label: '功率',
    base: 'W',
    units: [
      { id: 'mW', label: '毫瓦 (mW)', factor: 0.001 },
      { id: 'W', label: '瓦 (W)', factor: 1 },
      { id: 'kW', label: '千瓦 (kW)', factor: 1000 },
      { id: 'MW', label: '兆瓦 (MW)', factor: 1e6 },
      { id: 'hp', label: '英制马力 (hp)', factor: 745.6998715822702 },
      { id: 'ps', label: '公制马力 (ps)', factor: 735.49875 },
      { id: 'btu', label: 'BTU/小时', factor: 0.29307107 },
    ],
  },
  {
    id: 'pressure',
    label: '压力',
    base: 'Pa',
    units: [
      { id: 'Pa', label: '帕斯卡 (Pa)', factor: 1 },
      { id: 'kPa', label: '千帕 (kPa)', factor: 1000 },
      { id: 'MPa', label: '兆帕 (MPa)', factor: 1e6 },
      { id: 'bar', label: '巴 (bar)', factor: 1e5 },
      { id: 'mbar', label: '毫巴 (mbar)', factor: 100 },
      { id: 'atm', label: '标准大气压 (atm)', factor: 101325 },
      { id: 'psi', label: '磅每平方英寸 (psi)', factor: 6894.757293168 },
      { id: 'mmHg', label: '毫米汞柱 (mmHg)', factor: 133.322387415 },
      { id: 'torr', label: '托 (torr)', factor: 101325 / 760 },
    ],
  },
  {
    id: 'energy',
    label: '能量',
    base: 'J',
    units: [
      { id: 'J', label: '焦耳 (J)', factor: 1 },
      { id: 'kJ', label: '千焦 (kJ)', factor: 1000 },
      { id: 'cal', label: '卡路里 (cal)', factor: 4.184 },
      { id: 'kcal', label: '千卡 (kcal)', factor: 4184 },
      { id: 'Wh', label: '瓦时 (Wh)', factor: 3600 },
      { id: 'kWh', label: '千瓦时 (kWh)', factor: 3.6e6 },
      { id: 'eV', label: '电子伏 (eV)', factor: 1.602176634e-19 },
      { id: 'BTU', label: 'BTU', factor: 1055.05585262 },
    ],
  },
  {
    id: 'frequency',
    label: '频率',
    base: 'Hz',
    units: [
      { id: 'Hz', label: '赫兹 (Hz)', factor: 1 },
      { id: 'kHz', label: '千赫 (kHz)', factor: 1000 },
      { id: 'MHz', label: '兆赫 (MHz)', factor: 1e6 },
      { id: 'GHz', label: '吉赫 (GHz)', factor: 1e9 },
      { id: 'rpm', label: '转/分 (rpm)', factor: 1 / 60 },
    ],
  },
  {
    id: 'data',
    label: '数据存储',
    base: 'B',
    units: [
      { id: 'b', label: '比特 (bit)', factor: 0.125 },
      { id: 'B', label: '字节 (B)', factor: 1 },
      { id: 'KB', label: '千字节 (KB, 10³)', factor: 1e3 },
      { id: 'MB', label: '兆字节 (MB, 10⁶)', factor: 1e6 },
      { id: 'GB', label: '吉字节 (GB, 10⁹)', factor: 1e9 },
      { id: 'TB', label: '太字节 (TB, 10¹²)', factor: 1e12 },
      { id: 'PB', label: '拍字节 (PB, 10¹⁵)', factor: 1e15 },
      { id: 'KiB', label: '千二进制字节 (KiB, 2¹⁰)', factor: 1024 },
      { id: 'MiB', label: '兆二进制字节 (MiB, 2²⁰)', factor: 1024 ** 2 },
      { id: 'GiB', label: '吉二进制字节 (GiB, 2³⁰)', factor: 1024 ** 3 },
      { id: 'TiB', label: '太二进制字节 (TiB, 2⁴⁰)', factor: 1024 ** 4 },
    ],
  },
  {
    id: 'angle',
    label: '角度',
    base: '°',
    units: [
      { id: 'deg', label: '度 (°)', factor: 1 },
      { id: 'rad', label: '弧度 (rad)', factor: 180 / Math.PI },
      { id: 'grad', label: '百分度 (grad)', factor: 0.9 },
      { id: 'turn', label: '圈 (turn)', factor: 360 },
      { id: 'arcmin', label: '角分 (′)', factor: 1 / 60 },
      { id: 'arcsec', label: '角秒 (″)', factor: 1 / 3600 },
    ],
  },
  {
    id: 'density',
    label: '密度',
    base: 'kg/m³',
    description: '常用 g/cm³ 与 g/L，注意 1 g/cm³ = 1000 kg/m³',
    units: [
      { id: 'mg/l', label: '毫克/升 (mg/L)', factor: 0.001, note: '1 mg/L = 0.001 kg/m³，接近纯净水' },
      { id: 'g/l', label: '克/升 (g/L)', factor: 1, note: '与基准单位相同' },
      { id: 'g/m3', label: '克/立方米 (g/m³)', factor: 0.001 },
      { id: 'g/cm3', label: '克/立方厘米 (g/cm³)', factor: 1000, note: '水的密度约 1 g/cm³' },
      { id: 'kg/m3', label: '千克/立方米 (kg/m³)', factor: 1 },
      { id: 'kg/l', label: '千克/升 (kg/L)', factor: 1000 },
      { id: 'kg/cm3', label: '千克/立方厘米 (kg/cm³)', factor: 1e6 },
      { id: 't/m3', label: '吨/立方米 (t/m³)', factor: 1000 },
      { id: 'lb/ft3', label: '磅/立方英尺 (lb/ft³)', factor: 16.01846337396014 },
      { id: 'lb/in3', label: '磅/立方英寸 (lb/in³)', factor: 27679.904710203125 },
      { id: 'oz/in3', label: '盎司/立方英寸 (oz/in³)', factor: 1729.9940443876953 },
    ],
  },
  {
    id: 'force',
    label: '力',
    base: 'N',
    description: '牛顿与千克力、磅力的换算',
    units: [
      { id: 'n', label: '牛顿 (N)', factor: 1 },
      { id: 'mn', label: '毫牛 (mN)', factor: 0.001 },
      { id: 'kn', label: '千牛 (kN)', factor: 1000 },
      { id: 'mn-k', label: '兆牛 (MN)', factor: 1e6 },
      { id: 'dyn', label: '达因 (dyn)', factor: 1e-5, note: 'CGS 制单位，1 dyn = 10⁻⁵ N' },
      { id: 'kgf', label: '千克力 (kgf)', factor: 9.80665, note: '标准重力加速度 9.80665 m/s²' },
      { id: 'lbf', label: '磅力 (lbf)', factor: 4.4482216152605 },
      { id: 'pdl', label: '磅达 (pdl)', factor: 0.138254954376, note: '英制力单位，1 pdl = 1 lbf / 32' },
    ],
  },
  {
    id: 'fuel',
    label: '油耗',
    base: 'L/100km',
    description: '以「每百公里升数」为基准，mpg 与 km/L 为倒数换算',
    units: [
      { id: 'l100km', label: '升/百公里 (L/100km)', factor: 1, note: '数值越小越省油，中国与欧洲常用' },
      { id: 'km/l', label: '公里/升 (km/L)', factor: 100, inverse: true, note: '倒数换算：L/100km = 100 / (km/L)' },
      {
        id: 'mpg-us',
        label: '美制英里/加仑 (mpg US)',
        factor: 235.214583,
        inverse: true,
        note: 'L/100km = 235.214583 / mpg（1 美制加仑 = 3.785411784 L）',
      },
      {
        id: 'mpg-uk',
        label: '英制英里/加仑 (mpg UK)',
        factor: 282.480936,
        inverse: true,
        note: 'L/100km = 282.480936 / mpg（1 英制加仑 = 4.54609 L）',
      },
    ],
  },
  {
    id: 'data-rate',
    label: '网络速率',
    base: 'bps',
    description: '比特率与字节率，1 B/s = 8 bps',
    units: [
      { id: 'bps', label: '比特/秒 (bps)', factor: 1 },
      { id: 'kbps', label: '千比特/秒 (kbps)', factor: 1e3 },
      { id: 'mbps', label: '兆比特/秒 (Mbps)', factor: 1e6, note: '运营商带宽常用 100 Mbps = 12.5 MB/s' },
      { id: 'gbps', label: '吉比特/秒 (Gbps)', factor: 1e9 },
      { id: 'tbps', label: '太比特/秒 (Tbps)', factor: 1e12 },
      { id: 'bs', label: '字节/秒 (B/s)', factor: 8, note: '与比特率相差 8 倍，别混淆' },
      { id: 'kbs', label: '千字节/秒 (KB/s)', factor: 8e3 },
      { id: 'mbs', label: '兆字节/秒 (MB/s)', factor: 8e6 },
      { id: 'gbs', label: '吉字节/秒 (GB/s)', factor: 8e9 },
    ],
  },
  {
    id: 'illuminance',
    label: '照度',
    base: 'lx',
    description: '光照强度，1 fc ≈ 10.76 lx',
    units: [
      { id: 'lx', label: '勒克斯 (lx)', factor: 1 },
      { id: 'mlx', label: '毫勒克斯 (mlx)', factor: 0.001 },
      { id: 'klx', label: '千勒克斯 (klx)', factor: 1000, note: '晴天户外约 100 klx' },
      { id: 'ph', label: '辐透 (ph)', factor: 10000, note: '1 ph = 10⁴ lx' },
      { id: 'fc', label: '英尺烛光 (fc)', factor: 10.763910416709722 },
      { id: 'nk', label: '诺克斯 (nox)', factor: 0.001 },
    ],
  },
  {
    id: 'luminance',
    label: '亮度',
    base: 'cd/m²',
    description: '屏幕与显示器的发光强度，1 nit = 1 cd/m²',
    units: [
      { id: 'nit', label: '尼特 (nit, cd/m²)', factor: 1 },
      { id: 'knit', label: '千尼特 (knit)', factor: 1000 },
      { id: 'stilb', label: '斯提尔伯 (stilb)', factor: 10000, note: '1 stilb = 10⁴ cd/m²' },
      { id: 'lambert', label: '朗伯 (lambert)', factor: 3183.098861837907, note: '1 lambert = 10⁴/π cd/m²' },
      { id: 'foot-lambert', label: '英尺朗伯 (fL)', factor: 3.4262590996353905, note: '1 fL = 1/π cd/m²' },
      { id: 'asb', label: '阿波司提 (asb)', factor: 0.3183098861837907, note: '1 asb = 1/π cd/m²' },
    ],
  },
];

export const CATEGORY_BY_ID = new Map(UNIT_CATEGORIES.map((c) => [c.id, c]));

/** 温度的换算方向不同：F→C 是 (v - 32) * 5/9，需要按 category.id 判断。 */
function toBase(categoryId: string, value: number, unit: UnitDef): number {
  const factor = unit.factor ?? 1;
  if (categoryId === 'temperature') {
    if (unit.id === 'C') return value;
    if (unit.id === 'F') return (value - 32) * (5 / 9);
    if (unit.id === 'K') return value - 273.15;
    if (unit.id === 'R') return (value - 491.67) * (5 / 9);
  }
  // 倒数类单位：油耗 km/L → L/100km
  if (unit.inverse) return value === 0 ? Number.POSITIVE_INFINITY : factor / value;
  return value * factor;
}

function fromBase(categoryId: string, value: number, unit: UnitDef): number {
  const factor = unit.factor ?? 1;
  if (categoryId === 'temperature') {
    if (unit.id === 'C') return value;
    if (unit.id === 'F') return value * (9 / 5) + 32;
    if (unit.id === 'K') return value + 273.15;
    if (unit.id === 'R') return (value + 273.15) * (9 / 5);
  }
  if (unit.inverse) return value === 0 ? Number.POSITIVE_INFINITY : factor / value;
  return value / factor;
}

export function convertUnit(categoryId: string, value: number, fromId: string, toId: string): number {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) throw new Error(`未知单位类别：${categoryId}`);
  const from = category.units.find((u) => u.id === fromId);
  const to = category.units.find((u) => u.id === toId);
  if (!from || !to) throw new Error('未知单位');
  return fromBase(categoryId, toBase(categoryId, value, from), to);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return value.toExponential(6);
  const rounded = Math.abs(value) >= 1000 ? Math.round(value) : Number(value.toPrecision(12));
  return String(rounded);
}

/** 温度类特殊显示：整数度不带小数。 */
export function formatUnitValue(categoryId: string, value: number, _unitId: string): string {
  const out = formatNumber(value);
  if (categoryId === 'temperature') return Number.isInteger(value) ? String(value) : out;
  return out;
}

// ── 以下为工具页面使用的辅助函数 ─────────────────────────────────────────

/** 是否为仿射（加性偏移）换算类别。 */
export function isAffineCategory(categoryId: string): boolean {
  return categoryId === 'temperature';
}

/** 取类别下的单位定义。 */
export function unitById(categoryId: string, unitId: string): UnitDef | undefined {
  return CATEGORY_BY_ID.get(categoryId)?.units.find((unit) => unit.id === unitId);
}

/** 类别说明：优先使用定义中的描述，否则自动生成。 */
export function categoryDescription(categoryId: string): string {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return '';
  return category.description ?? `${category.units.length} 个单位，基准单位 ${category.base}`;
}

/** 关键单位的补充说明（集中维护，避免改动既有单位定义）。 */
export const UNIT_NOTES: Record<string, string> = {
  'length:ly': '光年：光在真空中一年走过的距离',
  'length:nmi': '海里 = 1852 m',
  'mass:st': '英石 = 14 磅',
  'mass:ct': '克拉：宝石质量单位，1 ct = 0.2 g',
  'volume:gal-us': '美制加仑 = 3.785411784 L',
  'volume:gal-uk': '英制加仑 = 4.54609 L',
  'volume:qt': '夸脱：美制 1 qt = 0.946352946 L',
  'speed:mach': '海平面 15 °C 标准大气条件下的近似值',
  'speed:c': '真空中光速 299792458 m/s',
  'time:mo': '按 30 天折算，实际月份为 28~31 天',
  'time:yr': '按 365 天折算，不考虑闰年',
  'power:hp': '英制机械马力 745.6998715822702 W',
  'power:ps': '公制马力 735.49875 W',
  'power:btu': '英制热单位 BTU/小时，1 BTU ≈ 1055.05585262 J',
  'pressure:torr': '1 Torr = 101325/760 Pa',
  'pressure:mmHg': '毫米汞柱，按 0 °C 与 133.322387415 Pa 定义',
  'energy:BTU': '英制热单位，1 BTU = 1055.05585262 J',
  'energy:eV': '电子伏特，1 eV = 1.602176634 × 10⁻¹⁹ J',
  'energy:cal': '热化学卡 4.184 J；大卡（kcal）= 4184 J',
  'frequency:rpm': '转速与频率相差 2π：1 Hz = 2π rpm',
  'data:b': 'bit 是比特，8 bit = 1 Byte',
  'data:KB': '十进制 1000 字节；部分厂商沿用 1024，注意口径',
  'data:KiB': '二进制 1024 字节，IEC 标准写法',
  'angle:turn': '一圈 = 360°',
  'angle:grad': '百分度：直角 = 100 grad',
  'temperature:C': '基准单位',
  'temperature:F': '°F = °C × 9/5 + 32',
  'temperature:K': '开尔文，°C = K − 273.15（绝对零度 −273.15 °C）',
  'temperature:R': '兰氏度，1 °R = 5/9 K，°C = (°R − 491.67) × 5/9',
};

/** 单位说明文本。 */
export function unitNote(categoryId: string, unitId: string): string {
  const key = `${categoryId}:${unitId}`;
  if (UNIT_NOTES[key]) return UNIT_NOTES[key];
  const unit = unitById(categoryId, unitId);
  if (unit?.note) return unit.note;
  const base = CATEGORY_BY_ID.get(categoryId)?.base ?? '';
  if (unit?.inverse) return `倒数换算：基准值 = ${unit.factor ?? 1} / 数值`;
  if (isAffineCategory(categoryId)) return '仿射换算，见工具页说明';
  return `线性换算：1 单位 = ${formatNumber(unit?.factor ?? 1)} ${base}`;
}

export interface FormatOptions {
  /** 有效数字位数，3 / 6 / 12。 */
  significant?: number;
  /** 是否强制使用科学计数法。 */
  scientific?: boolean;
  /** 是否添加千分位分隔符。 */
  thousands?: boolean;
}

function addThousands(text: string): string {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [intPart = '', fracPart] = body.split('.');
  if (intPart.length <= 3) return text;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fracPart ? `.${fracPart}` : ''}`;
}

/** 按有效位数 / 科学计数法 / 千分位格式化数值。 */
export function formatValue(value: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(value)) return String(value);
  const significant = Math.min(15, Math.max(1, Math.round(options.significant ?? 12)));
  const abs = Math.abs(value);
  if (abs !== 0 && (options.scientific || abs >= 1e15 || abs < 1e-6)) {
    const [mantissa = '', exponent = ''] = value.toExponential(significant - 1).split('e');
    const head = options.thousands ? addThousands(mantissa) : mantissa;
    return `${head}e${exponent}`;
  }
  const rounded = abs >= 1000 ? Math.round(value) : Number(value.toPrecision(significant));
  const text = String(rounded);
  return options.thousands ? addThousands(text) : text;
}

export interface ConvertedUnit {
  unit: UnitDef;
  value: number;
  text: string;
}

/** 把一个数值换算到类别内所有单位，用于「常用换算表」。 */
export function convertAll(
  categoryId: string,
  value: number,
  fromId: string,
  options?: FormatOptions,
): ConvertedUnit[] {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return [];
  return category.units.map((unit) => {
    const converted = convertUnit(categoryId, value, fromId, unit.id);
    return { unit, value: converted, text: formatValue(converted, options) };
  });
}

/** 导出为 Markdown 表格。 */
export function toMarkdownTable(categoryId: string, value: number, fromId: string, options?: FormatOptions): string {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return '';
  const from = unitById(categoryId, fromId);
  const head = `# ${category.label}换算（1 ${from?.label ?? fromId}）\n\n基准单位：${category.base}\n\n`;
  const rows = convertAll(categoryId, value, fromId, options).map((item) => `| ${item.unit.label} | ${item.text} |`);
  return `${head}| 单位 | 数值 |\n| --- | --- |\n${rows.join('\n')}\n`;
}
