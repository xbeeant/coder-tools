/** Geohash 编解码（base32 编码，标准字母表 0123456789bcdefghjkmnpqrstuvwxyz）。 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < BASE32.length; i++) DECODE_MAP[BASE32[i]] = i;

// 纬度区间为 [-90, 90]，经度为 [-180, 180]
const LAT_RANGE: [number, number] = [-90, 90];
const LON_RANGE: [number, number] = [-180, 180];

export interface GeohashBox {
  latitude: [number, number];
  longitude: [number, number];
}

export function encodeGeohash(latitude: number, longitude: number, precision = 9): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('纬度需在 -90 到 90 之间');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('经度需在 -180 到 180 之间');
  }
  const p = Math.min(12, Math.max(1, Math.round(precision)));

  let [latMin, latMax] = LAT_RANGE;
  let [lonMin, lonMax] = LON_RANGE;
  let hash = '';
  let isLongitude = true;
  let bit = 0;
  let value = 0;

  while (hash.length < p) {
    const range = isLongitude ? [lonMin, lonMax] : [latMin, latMax];
    const mid = (range[0] + range[1]) / 2;
    const target = isLongitude ? longitude : latitude;
    if (target > mid) {
      value = (value << 1) | 1;
      range[0] = mid;
    } else {
      value <<= 1;
      range[1] = mid;
    }
    if (isLongitude) {
      [lonMin, lonMax] = range;
    } else {
      [latMin, latMax] = range;
    }

    isLongitude = !isLongitude;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[value];
      bit = 0;
      value = 0;
    }
  }

  return hash;
}

export function decodeGeohash(hash: string): GeohashBox {
  const normalized = hash.trim().toLowerCase();
  if (normalized.length === 0) throw new Error('Geohash 不能为空');

  let [latMin, latMax] = LAT_RANGE;
  let [lonMin, lonMax] = LON_RANGE;
  let isLongitude = true;

  for (const char of normalized) {
    const index = DECODE_MAP[char];
    if (index === undefined) throw new Error(`无效的 Geohash 字符「${char}」`);

    for (let mask = 16; mask > 0; mask >>= 1) {
      const range = isLongitude ? [lonMin, lonMax] : [latMin, latMax];
      const mid = (range[0] + range[1]) / 2;
      if (index & mask) {
        range[0] = mid;
      } else {
        range[1] = mid;
      }
      if (isLongitude) {
        [lonMin, lonMax] = range;
      } else {
        [latMin, latMax] = range;
      }
      isLongitude = !isLongitude;
    }
  }

  return { latitude: [latMin, latMax], longitude: [lonMin, lonMax] };
}

export interface GeohashInfo {
  geohash: string;
  center: { latitude: number; longitude: number };
  box: GeohashBox;
  latitudeError: number;
  longitudeError: number;
  cellSize: { height: number; width: number };
}

export function describeGeohash(hash: string): GeohashInfo {
  const box = decodeGeohash(hash);
  const latitude = (box.latitude[0] + box.latitude[1]) / 2;
  const longitude = (box.longitude[0] + box.longitude[1]) / 2;
  return {
    geohash: hash.trim().toLowerCase(),
    center: { latitude, longitude },
    box,
    latitudeError: box.latitude[1] - latitude,
    longitudeError: box.longitude[1] - longitude,
    cellSize: { height: box.latitude[1] - box.latitude[0], width: box.longitude[1] - box.longitude[0] },
  };
}

/** 邻近格子的九宫格索引：n、ne、e、se、s、sw、w、nw。 */
const NEIGHBOR_OFFSETS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 0],
];

export function geohashNeighbors(hash: string): Record<string, string> {
  const normalized = hash.trim().toLowerCase();
  const info = describeGeohash(normalized);
  const out: Record<string, string> = {};
  const labels = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'center'];

  for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
    const [dLat, dLon] = NEIGHBOR_OFFSETS[i];
    if (i === NEIGHBOR_OFFSETS.length - 1) {
      out[labels[i]] = normalized;
      continue;
    }
    // 跨极点或日期变更线时按格子大小换算，避免落到非法坐标
    const latitude = info.center.latitude + dLat * info.cellSize.height;
    const longitude = info.center.longitude + dLon * info.cellSize.width;
    out[labels[i]] = encodeGeohash(
      Math.max(-90, Math.min(90, latitude)),
      Math.max(-180, Math.min(180, longitude)),
      normalized.length,
    );
  }

  return out;
}

// ── Open Location Code（Plus Code）─────────────────────────────────
// 参考 Google openlocationcode.js 的规范实现：
// 字母表 20 个字符，第 1~10 位按「纬度 + 经度」成对编码（每对细分一次网格），
// 第 11 位起改用 5 行 × 4 列的网格细分，因此单字符也能继续提升精度。

const OLC_ALPHABET = '23456789CFGHJMPQRVWX';
const OLC_BASE = OLC_ALPHABET.length;
const OLC_SEPARATOR = '+';
const OLC_SEPARATOR_POSITION = 8;
const OLC_PADDING = '0';
const OLC_MIN_DIGITS = 2;
const OLC_MAX_DIGITS = 15;
const OLC_PAIR_LENGTH = 10;
const OLC_PAIR_PRECISION = OLC_BASE ** 3;
const OLC_PAIR_FIRST_PLACE_VALUE = OLC_BASE ** (OLC_PAIR_LENGTH / 2 - 1);
const OLC_GRID_LENGTH = OLC_MAX_DIGITS - OLC_PAIR_LENGTH;
const OLC_GRID_COLUMNS = 4;
const OLC_GRID_ROWS = 5;
const OLC_FINAL_LAT_PRECISION = OLC_PAIR_PRECISION * OLC_GRID_ROWS ** OLC_GRID_LENGTH;
const OLC_FINAL_LNG_PRECISION = OLC_PAIR_PRECISION * OLC_GRID_COLUMNS ** OLC_GRID_LENGTH;

/** 每一对字符对应的网格边长（度）：经纬度各自的方向。 */
const OLC_PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];

function normalizeLatitude(latitude: number): number {
  return Math.min(90, Math.max(-90, latitude));
}

function normalizeLongitude(longitude: number): number {
  let value = longitude;
  while (value < -180) value += 360;
  while (value >= 180) value -= 360;
  return value;
}

/** 坐标合法性校验，返回中文提示。 */
export function validateCoordinate(latitude: number, longitude: number): { ok: boolean; error?: string } {
  if (!Number.isFinite(latitude)) return { ok: false, error: '纬度必须是数字' };
  if (!Number.isFinite(longitude)) return { ok: false, error: '经度必须是数字' };
  if (latitude < -90 || latitude > 90) return { ok: false, error: `纬度 ${latitude} 超出范围，应在 -90 ~ 90 之间` };
  if (longitude < -180 || longitude > 180) {
    return { ok: false, error: `经度 ${longitude} 超出范围，应在 -180 ~ 180 之间` };
  }
  return { ok: true };
}

function locationToIntegers(latitude: number, longitude: number): [number, number] {
  const latSpan = 2 * 90 * OLC_FINAL_LAT_PRECISION;
  const lngSpan = 2 * 180 * OLC_FINAL_LNG_PRECISION;
  let latValue = Math.floor(latitude * OLC_FINAL_LAT_PRECISION) + 90 * OLC_FINAL_LAT_PRECISION;
  if (latValue < 0) latValue = 0;
  else if (latValue >= latSpan) latValue = latSpan - 1;
  let lngValue = Math.floor(longitude * OLC_FINAL_LNG_PRECISION) + 180 * OLC_FINAL_LNG_PRECISION;
  if (lngValue < 0) lngValue = (lngValue % lngSpan) + lngSpan;
  else if (lngValue >= lngSpan) lngValue %= lngSpan;
  return [latValue, lngValue];
}

function encodePlusCodeIntegers(latValue: number, lngValue: number, codeLength: number): string {
  const length = Math.min(OLC_MAX_DIGITS, Math.max(OLC_MIN_DIGITS, Math.round(codeLength)));
  if (length < OLC_PAIR_LENGTH && length % 2 === 1) {
    throw new RangeError(`Plus Code 长度 ${length} 非法：10 位以内必须是偶数`);
  }
  const code: string[] = new Array(OLC_MAX_DIGITS + 1).fill('');
  code[OLC_SEPARATOR_POSITION] = OLC_SEPARATOR;

  if (length > OLC_PAIR_LENGTH) {
    // 第 11 位起：每字符在 5×4 的网格里选一格，行代表纬度、列代表经度
    let lat = latValue;
    let lng = lngValue;
    for (let i = OLC_GRID_LENGTH; i >= 1; i--) {
      const latDigit = lat % OLC_GRID_ROWS;
      const lngDigit = lng % OLC_GRID_COLUMNS;
      code[OLC_SEPARATOR_POSITION + 1 + i] = OLC_ALPHABET.charAt(latDigit * OLC_GRID_COLUMNS + lngDigit);
      lat = Math.floor(lat / OLC_GRID_ROWS);
      lng = Math.floor(lng / OLC_GRID_COLUMNS);
    }
  } else {
    latValue = Math.floor(latValue / OLC_GRID_ROWS ** OLC_GRID_LENGTH);
    lngValue = Math.floor(lngValue / OLC_GRID_COLUMNS ** OLC_GRID_LENGTH);
  }

  code[OLC_SEPARATOR_POSITION + 1] = OLC_ALPHABET.charAt(latValue % OLC_BASE);
  code[OLC_SEPARATOR_POSITION + 2] = OLC_ALPHABET.charAt(lngValue % OLC_BASE);
  latValue = Math.floor(latValue / OLC_BASE);
  lngValue = Math.floor(lngValue / OLC_BASE);

  for (let i = OLC_PAIR_LENGTH / 2 + 1; i >= 0; i -= 2) {
    code[i] = OLC_ALPHABET.charAt(latValue % OLC_BASE);
    code[i + 1] = OLC_ALPHABET.charAt(lngValue % OLC_BASE);
    latValue = Math.floor(latValue / OLC_BASE);
    lngValue = Math.floor(lngValue / OLC_BASE);
  }

  if (length >= OLC_SEPARATOR_POSITION) {
    return code.slice(0, length + 1).join('');
  }
  // 短码补 0 与分隔符，便于记忆
  return code.slice(0, length).join('') + '0'.repeat(OLC_SEPARATOR_POSITION - length) + OLC_SEPARATOR;
}

/** 坐标 → Plus Code（Open Location Code），默认 10 位（约 13.5m 精度）。 */
export function encodePlusCode(latitude: number, longitude: number, codeLength = 10): string {
  const check = validateCoordinate(latitude, longitude);
  if (!check.ok) throw new RangeError(check.error ?? '坐标非法');
  const [latValue, lngValue] = locationToIntegers(normalizeLatitude(latitude), normalizeLongitude(longitude));
  return encodePlusCodeIntegers(latValue, lngValue, codeLength);
}

export function isValidPlusCode(code: string): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  if (upper.indexOf(OLC_SEPARATOR) === -1) return false;
  if (upper.indexOf(OLC_SEPARATOR) !== upper.lastIndexOf(OLC_SEPARATOR)) return false;
  if (upper.length === 1) return false;
  const separatorIndex = upper.indexOf(OLC_SEPARATOR);
  if (separatorIndex > OLC_SEPARATOR_POSITION || separatorIndex % 2 === 1) return false;
  if (upper.indexOf(OLC_PADDING) > -1) {
    if (separatorIndex < OLC_SEPARATOR_POSITION) return false;
    if (upper.indexOf(OLC_PADDING) === 0) return false;
    const padMatch = upper.match(new RegExp(`${OLC_PADDING}+`, 'g'));
    if (padMatch === null || padMatch.length > 1 || padMatch[0].length % 2 === 1) return false;
    if (padMatch[0].length > OLC_SEPARATOR_POSITION - 2) return false;
    if (upper.charAt(upper.length - 1) !== OLC_SEPARATOR) return false;
  }
  if (upper.length - separatorIndex - 1 === 1) return false;
  const stripped = upper.split(OLC_SEPARATOR).join('').split(OLC_PADDING).join('');
  for (const char of stripped) {
    if (!OLC_ALPHABET.includes(char)) return false;
  }
  return true;
}

/** 短码：分隔符前不足 8 位，需要结合参考坐标还原。 */
export function isShortPlusCode(code: string): boolean {
  if (!isValidPlusCode(code)) return false;
  const index = code.toUpperCase().indexOf(OLC_SEPARATOR);
  return index >= 0 && index < OLC_SEPARATOR_POSITION;
}

/** 完整码：8 位以上且首字符对应的纬度经度合法。 */
export function isFullPlusCode(code: string): boolean {
  if (!isValidPlusCode(code)) return false;
  if (isShortPlusCode(code)) return false;
  const upper = code.toUpperCase();
  const firstLat = OLC_ALPHABET.indexOf(upper.charAt(0)) * OLC_BASE;
  if (firstLat >= 180) return false;
  if (upper.length > 1) {
    const firstLng = OLC_ALPHABET.indexOf(upper.charAt(1)) * OLC_BASE;
    if (firstLng >= 360) return false;
  }
  return true;
}

export interface PlusCodeArea {
  code: string;
  center: { latitude: number; longitude: number };
  box: GeohashBox;
  codeLength: number;
}

/** Plus Code → 中心点与边界框。 */
export function decodePlusCode(code: string): PlusCodeArea {
  const upper = code.trim().toUpperCase();
  if (!isFullPlusCode(upper)) {
    throw new Error(`不是有效的完整 Plus Code：${code}（短码需要配合参考坐标还原）`);
  }
  const stripped = upper.split(OLC_SEPARATOR).join('').split(OLC_PADDING).join('');

  let normalLat = -90 * OLC_PAIR_PRECISION;
  let normalLng = -180 * OLC_PAIR_PRECISION;
  let gridLat = 0;
  let gridLng = 0;
  let digits = Math.min(stripped.length, OLC_PAIR_LENGTH);
  let placeValue = OLC_PAIR_FIRST_PLACE_VALUE;
  for (let i = 0; i < digits; i += 2) {
    normalLat += OLC_ALPHABET.indexOf(stripped.charAt(i)) * placeValue;
    normalLng += OLC_ALPHABET.indexOf(stripped.charAt(i + 1)) * placeValue;
    if (i < digits - 2) placeValue /= OLC_BASE;
  }
  let latPrecision = placeValue / OLC_PAIR_PRECISION;
  let lngPrecision = placeValue / OLC_PAIR_PRECISION;

  if (stripped.length > OLC_PAIR_LENGTH) {
    let rowPlaceValue = OLC_GRID_ROWS ** (OLC_GRID_LENGTH - 1);
    let colPlaceValue = OLC_GRID_COLUMNS ** (OLC_GRID_LENGTH - 1);
    digits = Math.min(stripped.length, OLC_MAX_DIGITS);
    for (let i = OLC_PAIR_LENGTH; i < digits; i++) {
      const digitValue = OLC_ALPHABET.indexOf(stripped.charAt(i));
      if (digitValue < 0) throw new Error(`无效的 Plus Code 字符「${stripped.charAt(i)}」`);
      const row = Math.floor(digitValue / OLC_GRID_COLUMNS);
      const col = digitValue % OLC_GRID_COLUMNS;
      gridLat += row * rowPlaceValue;
      gridLng += col * colPlaceValue;
      if (i < digits - 1) {
        rowPlaceValue /= OLC_GRID_ROWS;
        colPlaceValue /= OLC_GRID_COLUMNS;
      }
    }
    latPrecision = rowPlaceValue / OLC_FINAL_LAT_PRECISION;
    lngPrecision = colPlaceValue / OLC_FINAL_LNG_PRECISION;
  }

  const latLo = normalLat / OLC_PAIR_PRECISION + gridLat / OLC_FINAL_LAT_PRECISION;
  const lngLo = normalLng / OLC_PAIR_PRECISION + gridLng / OLC_FINAL_LNG_PRECISION;
  const latHi = latLo + latPrecision;
  const lngHi = lngLo + lngPrecision;

  return {
    code: upper,
    center: {
      latitude: Math.min(latLo + latPrecision / 2, 90),
      longitude: Math.min(lngLo + lngPrecision / 2, 180),
    },
    box: {
      latitude: [latLo, latHi],
      longitude: [lngLo, lngHi],
    },
    codeLength: Math.min(stripped.length, OLC_MAX_DIGITS),
  };
}

/** 短码 + 参考坐标 → 最近的完整码。 */
export function recoverNearestPlusCode(shortCode: string, latitude: number, longitude: number): string {
  const upper = shortCode.trim().toUpperCase();
  if (isFullPlusCode(upper)) return upper;
  if (!isShortPlusCode(upper)) throw new Error(`不是有效的 Plus Code 短码：${shortCode}`);
  const referenceLat = normalizeLatitude(latitude);
  const referenceLng = normalizeLongitude(longitude);
  const separatorIndex = upper.indexOf(OLC_SEPARATOR);
  const paddingLength = OLC_SEPARATOR_POSITION - separatorIndex;
  const resolution = OLC_BASE ** (2 - paddingLength / 2);
  const halfResolution = resolution / 2;

  const prefix = encodePlusCode(referenceLat, referenceLng).slice(0, paddingLength);
  const area = decodePlusCode(prefix + upper);
  let centerLat = area.center.latitude;
  let centerLng = area.center.longitude;
  if (referenceLat + halfResolution < centerLat && centerLat - resolution >= -90) centerLat -= resolution;
  else if (referenceLat - halfResolution > centerLat && centerLat + resolution <= 90) centerLat += resolution;
  if (referenceLng + halfResolution < centerLng) centerLng -= resolution;
  else if (referenceLng - halfResolution > centerLng) centerLng += resolution;

  return encodePlusCode(centerLat, centerLng, area.codeLength);
}

/** 完整码 → 短码（去掉可省略的前缀）。 */
export function shortenPlusCode(code: string, latitude: number, longitude: number): string {
  if (!isFullPlusCode(code)) throw new Error('只能缩短有效的完整 Plus Code');
  const upper = code.trim().toUpperCase();
  if (upper.includes(OLC_PADDING)) throw new Error('不能缩短带 0 填充的码');
  const area = decodePlusCode(upper);
  if (area.codeLength < 6) throw new Error('长度不足 6 位，无法缩短');
  const range = Math.max(
    Math.abs(area.center.latitude - normalizeLatitude(latitude)),
    Math.abs(area.center.longitude - normalizeLongitude(longitude)),
  );
  for (let i = OLC_PAIR_RESOLUTIONS.length - 2; i >= 1; i--) {
    if (range < OLC_PAIR_RESOLUTIONS[i] * 0.3) return upper.substring((i + 1) * 2);
  }
  return upper;
}

export interface PlusCodePrecisionRow {
  digits: number;
  example: string;
  latDegrees: number;
  lonDegrees: number;
  latMeters: number;
  lonMeters: number;
  note: string;
}

const METERS_PER_DEGREE = 111_320;

/** 各长度 Plus Code 的格子尺寸（赤道处近似）。 */
export const PLUS_CODE_PRECISION_TABLE: PlusCodePrecisionRow[] = (() => {
  const rows: PlusCodePrecisionRow[] = [];
  for (let digits = 2; digits <= OLC_MAX_DIGITS; digits++) {
    if (digits < OLC_PAIR_LENGTH && digits % 2 === 1) continue;
    let latDegrees: number;
    let lonDegrees: number;
    let note: string;
    if (digits <= OLC_PAIR_LENGTH) {
      const pairs = Math.ceil(digits / 2);
      const resolution = OLC_PAIR_RESOLUTIONS[pairs - 1];
      latDegrees = resolution;
      lonDegrees = resolution;
      note = pairs === 1 ? '城市级别，10 位以内必须是偶数长度' : '成对细分：奇数位是纬度、偶数位是经度';
    } else {
      const gridDigits = digits - OLC_PAIR_LENGTH;
      latDegrees = OLC_PAIR_RESOLUTIONS[4] / OLC_GRID_ROWS ** gridDigits;
      lonDegrees = OLC_PAIR_RESOLUTIONS[4] / OLC_GRID_COLUMNS ** gridDigits;
      note = `第 ${OLC_PAIR_LENGTH + 1}~${digits} 位使用 5 行 × 4 列网格，可单字符细分`;
    }
    rows.push({
      digits,
      example: encodePlusCode(30.525412, 114.254421, digits),
      latDegrees,
      lonDegrees,
      latMeters: latDegrees * METERS_PER_DEGREE,
      lonMeters: lonDegrees * METERS_PER_DEGREE,
      note,
    });
  }
  return rows;
})();

// ── Geohash 辅助 ───────────────────────────────────────────────────

export interface GeohashBit {
  char: string;
  index: number;
  /** 5 位二进制，高位在前。 */
  binary: string;
  /** 每一位归属的维度，经度在前。 */
  dimensions: ('经度' | '纬度')[];
}

/** 拆解 Geohash 的 base32 位：字符 → 索引 → 5 位含义。 */
export function geohashBits(hash: string): GeohashBit[] {
  const normalized = hash.trim().toLowerCase();
  const out: GeohashBit[] = [];
  let isLongitude = true;
  for (const char of normalized) {
    const index = DECODE_MAP[char];
    if (index === undefined) throw new Error(`无效的 Geohash 字符「${char}」`);
    const dimensions: ('经度' | '纬度')[] = [];
    for (let mask = 16; mask > 0; mask >>= 1) {
      dimensions.push(isLongitude ? '经度' : '纬度');
      isLongitude = !isLongitude;
    }
    out.push({
      char,
      index,
      binary: index.toString(2).padStart(5, '0'),
      dimensions,
    });
  }
  return out;
}

export interface GeohashPrecisionRow {
  length: number;
  bits: number;
  lonDegrees: number;
  latDegrees: number;
  lonKm: number;
  latKm: number;
  example: string;
}

/** 1~12 位 Geohash 对应的格子尺寸（赤道处近似）。 */
export const GEOHASH_PRECISION_TABLE: GeohashPrecisionRow[] = Array.from({ length: 12 }, (_, i) => {
  const length = i + 1;
  const bits = length * 5;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  const lonDegrees = 360 / 2 ** lonBits;
  const latDegrees = 180 / 2 ** latBits;
  return {
    length,
    bits,
    lonDegrees,
    latDegrees,
    lonKm: (lonDegrees * METERS_PER_DEGREE) / 1000,
    latKm: (latDegrees * METERS_PER_DEGREE) / 1000,
    example: encodeGeohash(30.525412, 114.254421, length),
  };
});

export interface DistanceResult {
  kilometers: number;
  miles: number;
  meters: number;
}

/** 球面大圆距离（haversine）。 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): DistanceResult {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const kilometers = 6371 * c;
  return {
    kilometers,
    miles: kilometers * 0.621371,
    meters: kilometers * 1000,
  };
}

/** 解析「lat,lon」文本，附带中文错误提示。 */
export function parseCoordinateText(
  text: string,
): { ok: true; latitude: number; longitude: number } | { ok: false; error: string } {
  const cleaned = text.trim().replace(/[，;；]/g, ',');
  const parts = cleaned.split(',').map((part) => part.trim());
  if (parts.length !== 2) return { ok: false, error: '请输入「纬度,经度」两个数字，用逗号分隔' };
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (parts[0] === '' || parts[1] === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: '纬度与经度都必须是数字' };
  }
  const check = validateCoordinate(latitude, longitude);
  if (!check.ok) return { ok: false, error: check.error ?? '坐标非法' };
  return { ok: true, latitude, longitude };
}

export interface GeoJsonPointResult {
  latitude: number;
  longitude: number;
  /** 命中了几处坐标，便于提示用户检查多要素数据。 */
  found: number;
}

/** 从 GeoJSON（Feature / FeatureCollection / Geometry / 坐标数组）中提取 Point 坐标。 */
export function extractGeoJsonPoint(
  text: string,
): { ok: true; data: GeoJsonPointResult } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  const points: [number, number][] = [];

  const collect = (node: unknown, depth = 0): void => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.type === 'Point' && Array.isArray(record.coordinates)) {
      const [lng, lat] = record.coordinates as unknown[];
      if (typeof lat === 'number' && typeof lng === 'number') points.push([lat, lng]);
      return;
    }
    if (Array.isArray(node)) {
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        points.push([node[1] as number, node[0] as number]);
        return;
      }
      for (const item of node) collect(item, depth + 1);
      return;
    }
    if (Array.isArray(record.features)) {
      for (const item of record.features) collect(item, depth + 1);
      return;
    }
    if (Array.isArray(record.coordinates)) {
      collect(record.coordinates, depth + 1);
      return;
    }
    if (record.geometry) collect(record.geometry, depth + 1);
  };

  collect(parsed);

  if (points.length === 0) return { ok: false, error: '未找到 Point 类型坐标；请确认是 GeoJSON Point 或坐标数组' };
  const [latitude = 0, longitude = 0] = points[0];
  const check = validateCoordinate(latitude, longitude);
  if (!check.ok) return { ok: false, error: check.error ?? '坐标非法' };
  return { ok: true, data: { latitude, longitude, found: points.length } };
}
