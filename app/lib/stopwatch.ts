/**
 * 计时相关纯函数：时长格式化、输入解析、计次与番茄钟阶段推进。
 * 不含 React，秒表 / 倒计时页面直接调用。
 */

const pad2 = (value: number) => String(value).padStart(2, '0');
const pad3 = (value: number) => String(value).padStart(3, '0');

/** 秒表显示格式：00:00:00.000（超过 100 小时继续累加小时数）。 */
export function formatStopwatch(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

/** 倒计时显示格式：不足 1 小时用 MM:SS，否则 HH:MM:SS。 */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/** 可读时长：1h 2m 3s / 250ms。 */
export function formatHumanDuration(milliseconds: number, options?: { milliseconds?: boolean }): string {
  const negative = milliseconds < 0;
  const safe = Math.abs(Math.round(milliseconds));
  const days = Math.floor(safe / 86_400_000);
  const hours = Math.floor((safe % 86_400_000) / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (parts.length === 0) parts.push(options?.milliseconds === false ? '0s' : `${millis}ms`);
  else if (options?.milliseconds && millis > 0) parts.push(`${millis}ms`);
  return `${negative ? '-' : ''}${parts.join(' ')}`;
}

/** ISO 8601 时长，例如 PT1H2M3.5S。 */
export function isoDuration(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds));
  const days = Math.floor(safe / 86_400_000);
  const hours = Math.floor((safe % 86_400_000) / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = (safe % 60_000) / 1000;
  const date = `P${days > 0 ? `${days}D` : ''}`;
  const time = [
    hours > 0 ? `${hours}H` : '',
    minutes > 0 ? `${minutes}M` : '',
    seconds > 0 ? `${Number(seconds.toFixed(3))}S` : '',
  ].join('');
  if (date === 'P' && time === '') return 'PT0S';
  return `${date}${time === '' ? 'T0S' : `T${time}`}`;
}

/** 中文可读时长：1 小时 2 分 3 秒。 */
export function formatCnDuration(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds));
  const days = Math.floor(safe / 86_400_000);
  const hours = Math.floor((safe % 86_400_000) / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} 天`);
  if (hours > 0) parts.push(`${hours} 小时`);
  if (minutes > 0) parts.push(`${minutes} 分`);
  if (seconds > 0) parts.push(`${seconds} 秒`);
  return parts.length > 0 ? parts.join(' ') : '0 秒';
}

/**
 * 解析时长输入：支持纯秒数、1:02:03 / 02:03、1h2m3s、100ms、1d 等写法。
 * 无法解析时返回 null。
 */
export function parseDuration(text: string): number | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw) * 1000;
  if (raw.includes(':')) {
    const parts = raw.split(':');
    if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
    let total = 0;
    for (const part of parts) total = total * 60 + Number(part);
    return total * 1000;
  }
  const tokens = raw.match(/(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|d|天|小时|分钟|秒)/g);
  if (!tokens) return null;
  const cleaned = raw.replace(/(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|d|天|小时|分钟|秒)/g, '');
  if (/[^\s]/.test(cleaned)) return null;
  let total = 0;
  for (const token of tokens) {
    const match = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(token);
    if (!match) return null;
    const value = Number(match[1]);
    switch (match[2]) {
      case 'ms':
        total += value;
        break;
      case 's':
      case 'sec':
      case '秒':
        total += value * 1000;
        break;
      case 'm':
      case 'min':
      case '分钟':
        total += value * 60_000;
        break;
      case 'h':
      case '小时':
        total += value * 3_600_000;
        break;
      case 'd':
      case '天':
        total += value * 86_400_000;
        break;
      default:
        return null;
    }
  }
  return Number.isFinite(total) ? total : null;
}

export interface Lap {
  /** 第 n 圈，从 1 开始。 */
  index: number;
  /** 本圈用时（毫秒）。 */
  lap: number;
  /** 从启动到本圈结束的累计用时（毫秒）。 */
  total: number;
}

/** 记录一次计次：圈速 = 累计 - 上一圈累计。 */
export function addLap(laps: Lap[], elapsed: number): Lap[] {
  const previous = laps.length > 0 ? laps[laps.length - 1].total : 0;
  return [...laps, { index: laps.length + 1, lap: Math.max(0, elapsed - previous), total: elapsed }];
}

export interface LapStats {
  fastest: number | null;
  slowest: number | null;
  best: number | null;
  worst: number | null;
  average: number | null;
}

/**
 * 最快 / 最慢圈速统计，返回的序号与 Lap.index 一致（从 1 开始）。
 * 第一圈通常是按键前的残留段，圈数少于 3 时不做标记，避免误判。
 */
export function lapStats(laps: Lap[]): LapStats {
  if (laps.length < 3) {
    return { fastest: null, slowest: null, best: null, worst: null, average: null };
  }
  const comparable = laps.slice(1);
  const best = Math.min(...comparable.map((item) => item.lap));
  const worst = Math.max(...comparable.map((item) => item.lap));
  // comparable[0] 对应第 2 圈，因此序号为「位置 + 2」
  return {
    fastest: comparable.findIndex((item) => item.lap === best) + 2,
    slowest: comparable.findIndex((item) => item.lap === worst) + 2,
    best,
    worst,
    average: comparable.reduce((sum, item) => sum + item.lap, 0) / comparable.length,
  };
}

export type PomodoroPhase = 'work' | 'short' | 'long';

export interface PomodoroConfig {
  workMinutes: number;
  shortMinutes: number;
  longMinutes: number;
  /** 多少个番茄后进入长休息。 */
  cyclesBeforeLong: number;
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  workMinutes: 25,
  shortMinutes: 5,
  longMinutes: 15,
  cyclesBeforeLong: 4,
};

export interface PomodoroAdvance {
  phase: PomodoroPhase;
  /** 已完成的工作番茄数（休息结束回到工作时递增）。 */
  completedWork: number;
  longBreak: boolean;
}

/** 阶段推进：工作结束进入休息（按计数决定长短），休息结束回到工作。 */
export function nextPomodoroPhase(
  phase: PomodoroPhase,
  completedWork: number,
  config: PomodoroConfig,
): PomodoroAdvance {
  if (phase === 'work') {
    const done = completedWork + 1;
    const longBreak = done % Math.max(1, config.cyclesBeforeLong) === 0;
    return { phase: longBreak ? 'long' : 'short', completedWork: done, longBreak };
  }
  return { phase: 'work', completedWork, longBreak: false };
}

/** 阶段默认时长（毫秒）。 */
export function phaseDuration(phase: PomodoroPhase, config: PomodoroConfig): number {
  const minutes = phase === 'work' ? config.workMinutes : phase === 'short' ? config.shortMinutes : config.longMinutes;
  return Math.max(1, minutes) * 60_000;
}

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  work: '专注',
  short: '短休息',
  long: '长休息',
};

/** 判断键盘事件是否来自可输入控件，命中时不拦截快捷键。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION';
}
