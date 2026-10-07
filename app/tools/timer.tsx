import { AlarmClock, BellRing, Coffee, Flag, Play, Plus, RotateCcw, SkipForward, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  addLap,
  DEFAULT_POMODORO,
  formatCnDuration,
  formatCountdown,
  formatHumanDuration,
  formatStopwatch,
  isoDuration,
  isTypingTarget,
  type Lap,
  lapStats,
  nextPomodoroPhase,
  PHASE_LABEL,
  type PomodoroConfig,
  type PomodoroPhase,
  parseDuration,
  phaseDuration,
} from '../lib/stopwatch';

type TabKey = 'stopwatch' | 'countdown' | 'pomodoro' | 'format';
const POMODORO_KEY = 'coder-tools:pomodoro';

/** 简单蜂鸣器：浏览器要求先有用户手势，因此必须由按钮显式启用。 */
function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(
    () => () => {
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    [],
  );

  const enable = useCallback(() => {
    const ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) {
      setUnsupported(true);
      return;
    }
    const ctx = ctxRef.current ?? new ctor();
    void ctx.resume();
    ctxRef.current = ctx;
    setReady(true);
  }, []);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume();
    const start = ctx.currentTime;
    for (let index = 0; index < 3; index++) {
      const at = start + index * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.26);
    }
    if (typeof navigator.vibrate === 'function') navigator.vibrate([180, 90, 180]);
  }, []);

  return { ready, unsupported, enable, beep };
}

function KeyHint({ items }: { items: string[] }) {
  return (
    <Hint>
      快捷键：
      {items.map((item) => (
        <kbd key={item} className="mx-0.5 rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
          {item}
        </kbd>
      ))}
    </Hint>
  );
}

function StopwatchPanel() {
  const [accumulated, setAccumulated] = useState(0);
  const [display, setDisplay] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const startedRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);

  // 只在运行时用 rAF 重绘显示，历时始终由 performance.now() 计算，不做累加
  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function tick() {
      setDisplay(accumulated + (performance.now() - (startedRef.current ?? 0)));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, accumulated]);

  const pause = useCallback(() => {
    if (startedRef.current !== null) {
      setAccumulated(accumulated + (performance.now() - startedRef.current));
      startedRef.current = null;
    }
    setRunning(false);
  }, [accumulated]);

  const start = useCallback(() => {
    if (startedRef.current === null) startedRef.current = performance.now();
    setRunning(true);
  }, []);

  const toggle = useCallback(() => {
    if (running) pause();
    else start();
  }, [running, pause, start]);

  const reset = useCallback(() => {
    startedRef.current = null;
    setRunning(false);
    setAccumulated(0);
    setDisplay(0);
    setLaps([]);
  }, []);

  const lap = useCallback(() => {
    const current = startedRef.current === null ? accumulated : accumulated + (performance.now() - startedRef.current);
    setLaps((prev) => addLap(prev, current));
  }, [accumulated]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, reset]);

  const stats = useMemo(() => lapStats(laps), [laps]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="秒表" description="毫秒级显示，圈速用 performance.now() 的差值计算">
        <p className="font-mono text-4xl leading-none tracking-tight sm:text-5xl">{formatStopwatch(display)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={toggle}>
            {running ? <AlarmClock className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? '暂停' : display > 0 ? '继续' : '开始'}
          </Button>
          <Button size="sm" variant="outline" onClick={lap} disabled={display === 0}>
            <Flag className="size-3.5" />
            计次
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        </div>
        <KeyHint items={['空格', 'R']} />
      </Section>

      <Section
        title={`计次记录（${laps.length}）`}
        description="圈速为上一圈到本圈的间隔，3 圈起标记最快 / 最慢"
        actions={
          <Button size="sm" variant="ghost" disabled={laps.length === 0} onClick={() => setLaps([])}>
            清空
          </Button>
        }
      >
        {laps.length === 0 ? (
          <EmptyHint>点击「计次」记录每一圈</EmptyHint>
        ) : (
          <div className="max-h-64 overflow-auto scrollbar-thin">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead className="text-[10px] text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 pr-2 font-normal">圈</th>
                  <th className="py-1 pr-2 font-normal">圈速</th>
                  <th className="py-1 pr-2 font-normal">累计</th>
                  <th className="py-1 font-normal">备注</th>
                </tr>
              </thead>
              <tbody>
                {[...laps].reverse().map((item) => (
                  <tr key={item.index} className="border-b last:border-0">
                    <td className="py-1 pr-2">#{item.index}</td>
                    <td
                      className={`py-1 pr-2 ${
                        stats.fastest === item.index
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : stats.slowest === item.index
                            ? 'text-amber-600 dark:text-amber-400'
                            : ''
                      }`}
                    >
                      {formatStopwatch(item.lap)}
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">{formatStopwatch(item.total)}</td>
                    <td className="py-1 text-[10px] text-muted-foreground">
                      {stats.fastest === item.index ? '最快' : stats.slowest === item.index ? '最慢' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stats.average !== null && (
          <Hint>
            第 2 圈起平均圈速 {formatStopwatch(stats.average)}，最快 {formatStopwatch(stats.best ?? 0)}，最慢{' '}
            {formatStopwatch(stats.worst ?? 0)}。
          </Hint>
        )}
      </Section>
    </div>
  );
}

function CountdownPanel() {
  const { ready, unsupported, enable, beep } = useBeep();
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('5');
  const [seconds, setSeconds] = useState('0');
  const [remaining, setRemaining] = useState(300_000);
  const [running, setRunning] = useState(false);
  const [loop, setLoop] = useState(false);
  const [finished, setFinished] = useState(false);
  const endRef = useRef<number | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const total = useMemo(() => {
    const h = Math.max(0, Number(hours) || 0);
    const m = Math.max(0, Number(minutes) || 0);
    const s = Math.max(0, Number(seconds) || 0);
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }, [hours, minutes, seconds]);
  const totalRef = useRef(total);
  totalRef.current = total;

  // 倒计时基于结束时刻计算，标签页被节流后恢复时仍能对上
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (endRef.current === null) return;
      const left = endRef.current - performance.now();
      if (left <= 0) {
        setRemaining(0);
        setFinished(true);
        setRunning(false);
        endRef.current = null;
        beep();
        if (loopRef.current) {
          endRef.current = performance.now() + totalRef.current;
          setRemaining(totalRef.current);
          setFinished(false);
          setRunning(true);
        }
        return;
      }
      setRemaining(left);
    }, 200);
    return () => window.clearInterval(timer);
  }, [running, beep]);

  // 暂停状态下修改时长后，剩余时间跟随新的总时长；暂停本身不会触发
  const lastTotalRef = useRef(total);
  useEffect(() => {
    if (running) {
      lastTotalRef.current = total;
      return;
    }
    if (lastTotalRef.current !== total) {
      lastTotalRef.current = total;
      setFinished(false);
      setRemaining(total);
    }
  }, [total, running]);

  const start = () => {
    const base = remaining > 0 ? remaining : total;
    if (base <= 0) return;
    endRef.current = performance.now() + base;
    setRemaining(base);
    setFinished(false);
    setRunning(true);
  };

  const pause = () => {
    if (endRef.current !== null) {
      setRemaining(Math.max(0, endRef.current - performance.now()));
      endRef.current = null;
    }
    setRunning(false);
  };

  const reset = () => {
    endRef.current = null;
    setRunning(false);
    setFinished(false);
    setRemaining(total);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (running) pause();
        else start();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const percent = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="倒计时" description="支持 时:分:秒 输入、+1 分钟、循环与结束提示">
        <div className="grid grid-cols-3 gap-2">
          <TextField label="时" value={hours} onChange={setHours} type="number" inputClassName="text-center" />
          <TextField label="分" value={minutes} onChange={setMinutes} type="number" inputClassName="text-center" />
          <TextField label="秒" value={seconds} onChange={setSeconds} type="number" inputClassName="text-center" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: '1 分', m: 1 },
            { label: '3 分', m: 3 },
            { label: '5 分', m: 5 },
            { label: '10 分', m: 10 },
            { label: '15 分', m: 15 },
            { label: '25 分', m: 25 },
            { label: '1 时', m: 60 },
          ].map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setHours(String(Math.floor(preset.m / 60)));
                setMinutes(String(preset.m % 60));
                setSeconds('0');
                setFinished(false);
                setRunning(false);
                endRef.current = null;
                setRemaining(preset.m * 60_000);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <p className="font-mono text-4xl leading-none tracking-tight sm:text-5xl">{formatCountdown(remaining)}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={running ? pause : start} disabled={!running && total === 0 && remaining === 0}>
            {running ? <AlarmClock className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? '暂停' : remaining > 0 && !finished ? '继续' : '开始'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next = remaining + 60_000;
              setRemaining(next);
              if (running && endRef.current !== null) endRef.current += 60_000;
            }}
          >
            <Plus className="size-3.5" />
            +1 分钟
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            循环倒计时
          </label>
          <Button size="sm" variant="outline" onClick={enable} disabled={ready}>
            <Volume2 className="size-3.5" />
            {ready ? '提示音已启用' : '启用提示音'}
          </Button>
        </div>
        {unsupported && <Hint>当前环境不支持 Web Audio，仅会尝试调用震动反馈。</Hint>}
        {finished && (
          <Note tone="success" title="时间到">
            倒计时已结束。
          </Note>
        )}
        <KeyHint items={['空格', 'R']} />
      </Section>

      <Section title="提示与限制">
        <StatGrid>
          <Stat label="设定总时长" value={formatHumanDuration(total)} hint={`${formatCountdown(total)}`} />
          <Stat label="剩余" value={formatHumanDuration(remaining)} tone={finished ? 'warn' : 'info'} />
          <Stat label="进度" value={`${percent.toFixed(1)} %`} />
          <Stat label="循环" value={loop ? '开启' : '关闭'} hint={loop ? '结束后自动重启' : undefined} />
        </StatGrid>
        <Note tone="info" title="为什么需要先点按钮">
          浏览器要求音频必须由用户手势触发，扩展页面里的定时结束不会被视为手势。
          所以请先点一次「启用提示音」；未启用时仅尝试 <code className="font-mono">navigator.vibrate</code> 震动。
        </Note>
        <ResultBox
          label="当前剩余（可复制）"
          value={[
            formatCountdown(remaining),
            formatStopwatch(remaining),
            formatHumanDuration(remaining),
            formatCnDuration(remaining),
            isoDuration(remaining),
          ].join('\n')}
          onCopy={() => copyText(formatHumanDuration(remaining))}
          rows="min-h-24"
        />
      </Section>
    </div>
  );
}

interface PomodoroState {
  phase: PomodoroPhase;
  completedWork: number;
  running: boolean;
  /** 运行中的绝对结束时刻（Date.now() 域），用于跨页面恢复。 */
  endsAt: number | null;
  config: PomodoroConfig;
}

function readPomodoro(): PomodoroState {
  const fallback: PomodoroState = {
    phase: 'work',
    completedWork: 0,
    running: false,
    endsAt: null,
    config: DEFAULT_POMODORO,
  };
  try {
    const raw = localStorage.getItem(POMODORO_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const phase = parsed.phase;
    const config = parsed.config;
    return {
      phase: phase === 'work' || phase === 'short' || phase === 'long' ? phase : 'work',
      completedWork: Number(parsed.completedWork) || 0,
      running: Boolean(parsed.running) && typeof parsed.endsAt === 'number',
      endsAt: typeof parsed.endsAt === 'number' ? parsed.endsAt : null,
      config: {
        workMinutes: Number(config?.workMinutes) || DEFAULT_POMODORO.workMinutes,
        shortMinutes: Number(config?.shortMinutes) || DEFAULT_POMODORO.shortMinutes,
        longMinutes: Number(config?.longMinutes) || DEFAULT_POMODORO.longMinutes,
        cyclesBeforeLong: Number(config?.cyclesBeforeLong) || DEFAULT_POMODORO.cyclesBeforeLong,
      },
    };
  } catch {
    return fallback;
  }
}

function PomodoroPanel() {
  const { ready, enable, beep } = useBeep();
  const [state, setState] = useState<PomodoroState>(readPomodoro);
  const [remaining, setRemaining] = useState(0);

  // 恢复：用 Date.now() 与 endsAt 的差值计算，而不是累加计时器
  useEffect(() => {
    if (!state.running || state.endsAt === null) {
      setRemaining(phaseDuration(state.phase, state.config));
      return;
    }
    const left = state.endsAt - Date.now();
    if (left <= 0) {
      const next = nextPomodoroPhase(state.phase, state.completedWork, state.config);
      const endsAt = Date.now() + phaseDuration(next.phase, state.config);
      setState((prev) => ({ ...prev, phase: next.phase, completedWork: next.completedWork, endsAt }));
      setRemaining(endsAt - Date.now());
      beep();
      return;
    }
    setRemaining(left);
  }, [state, beep]);

  useEffect(() => {
    try {
      localStorage.setItem(POMODORO_KEY, JSON.stringify(state));
    } catch {
      // storage 不可用时静默失败
    }
  }, [state]);

  // 只在运行时轮询，卸载时清理
  useEffect(() => {
    if (!state.running || state.endsAt === null) return;
    const timer = window.setInterval(() => {
      const left = state.endsAt === null ? 0 : state.endsAt - Date.now();
      if (left <= 0) {
        const next = nextPomodoroPhase(state.phase, state.completedWork, state.config);
        const endsAt = Date.now() + phaseDuration(next.phase, state.config);
        setState((prev) => ({ ...prev, phase: next.phase, completedWork: next.completedWork, endsAt }));
        beep();
        return;
      }
      setRemaining(left);
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.running, state.endsAt, state.phase, state.completedWork, state.config, beep]);

  // 运行中修改时长：保留本阶段已用掉的时间，用新时长重算结束时刻
  const prevRef = useRef<{ phase: PomodoroPhase; config: PomodoroConfig }>({
    phase: state.phase,
    config: state.config,
  });
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { phase: state.phase, config: state.config };
    const changed =
      prev.phase === state.phase &&
      (prev.config.workMinutes !== state.config.workMinutes ||
        prev.config.shortMinutes !== state.config.shortMinutes ||
        prev.config.longMinutes !== state.config.longMinutes);
    if (!changed || !state.running || state.endsAt === null) return;
    const oldTotal = phaseDuration(prev.phase, prev.config);
    const elapsed = Math.min(oldTotal, Math.max(0, oldTotal - (state.endsAt - Date.now())));
    const newTotal = phaseDuration(state.phase, state.config);
    setState((cur) => ({ ...cur, endsAt: Date.now() + Math.max(1000, newTotal - elapsed) }));
  }, [state]);

  const phaseTotal = phaseDuration(state.phase, state.config);
  const percent = phaseTotal > 0 ? Math.max(0, Math.min(100, (remaining / phaseTotal) * 100)) : 0;

  const toggle = () => {
    setState((prev) => {
      if (prev.running) return { ...prev, running: false, endsAt: null };
      return { ...prev, running: true, endsAt: Date.now() + Math.max(1000, remaining) };
    });
  };

  const skip = () => {
    setState((prev) => {
      const next = nextPomodoroPhase(prev.phase, prev.completedWork, prev.config);
      return { ...prev, phase: next.phase, completedWork: next.completedWork, endsAt: null, running: false };
    });
  };

  const reset = () => {
    setState((prev) => ({ ...prev, phase: 'work', completedWork: 0, running: false, endsAt: null }));
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section
        title="番茄钟"
        description="状态写入 localStorage，切换工具或关闭页面后按时间差恢复"
        actions={
          <Button size="sm" variant="outline" onClick={enable} disabled={ready}>
            <Volume2 className="size-3.5" />
            {ready ? '提示音已启用' : '启用提示音'}
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
            {PHASE_LABEL[state.phase]}
          </span>
          <span className="text-[11px] text-muted-foreground">已完成 {state.completedWork} 个番茄</span>
        </div>
        <p className="font-mono text-4xl leading-none tracking-tight sm:text-5xl">{formatCountdown(remaining)}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={toggle}>
            {state.running ? <AlarmClock className="size-3.5" /> : <Play className="size-3.5" />}
            {state.running ? '暂停' : '开始'}
          </Button>
          <Button size="sm" variant="outline" onClick={skip}>
            <SkipForward className="size-3.5" />
            跳过本阶段
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        </div>
      </Section>

      <Section title="时长配置" description="修改后立即生效：运行中保留已用时间重算结束时刻，暂停时按新时长重置">
        <div className="grid gap-2 sm:grid-cols-2">
          <NumberField
            label="专注时长"
            value={state.config.workMinutes}
            onChange={(value) => setState((prev) => ({ ...prev, config: { ...prev.config, workMinutes: value } }))}
            min={1}
            max={180}
            suffix="分钟"
          />
          <NumberField
            label="短休息"
            value={state.config.shortMinutes}
            onChange={(value) => setState((prev) => ({ ...prev, config: { ...prev.config, shortMinutes: value } }))}
            min={1}
            max={60}
            suffix="分钟"
          />
          <NumberField
            label="长休息"
            value={state.config.longMinutes}
            onChange={(value) => setState((prev) => ({ ...prev, config: { ...prev.config, longMinutes: value } }))}
            min={1}
            max={120}
            suffix="分钟"
          />
          <NumberField
            label="长休息间隔"
            value={state.config.cyclesBeforeLong}
            onChange={(value) => setState((prev) => ({ ...prev, config: { ...prev.config, cyclesBeforeLong: value } }))}
            min={1}
            max={12}
            suffix="个番茄"
          />
        </div>
        <StatGrid>
          <Stat label="当前阶段" value={PHASE_LABEL[state.phase]} />
          <Stat label="本阶段总长" value={formatHumanDuration(phaseTotal)} />
          <Stat label="已完成番茄" value={`${state.completedWork} 个`} tone="success" />
          <Stat label="状态" value={state.running ? '运行中' : '已暂停'} tone={state.running ? 'success' : 'warn'} />
        </StatGrid>
        <Note tone="info" title="恢复规则">
          <span className="inline-flex items-start gap-1">
            <Coffee className="mt-0.5 size-3 shrink-0" />
            恢复时用 <code className="font-mono">endsAt − Date.now()</code>{' '}
            计算剩余时间；若离开期间已结束，只结算当前这一个阶段并自动进入下一阶段，不会补算多个阶段。
          </span>
        </Note>
      </Section>
    </div>
  );
}

const FORMAT_PRESETS = [
  { label: '1 小时', value: '1h' },
  { label: '90 分钟', value: '90m' },
  { label: '1:02:03', value: '1:02:03' },
  { label: '250 毫秒', value: '250ms' },
  { label: '1 天', value: '1d' },
];

function FormatPanel() {
  const [text, setText] = useState('1h 2m 3s');
  const [seconds, setSeconds] = useState('3723');
  const parsed = useMemo(() => parseDuration(text), [text]);
  const secondsMs = Number(seconds) * 1000;

  const output = useMemo(() => {
    if (parsed === null) return null;
    return {
      ms: parsed,
      stopwatch: formatStopwatch(parsed),
      countdown: formatCountdown(parsed),
      human: formatHumanDuration(parsed),
      cn: formatCnDuration(parsed),
      iso: isoDuration(parsed),
      hours: (parsed / 3_600_000).toFixed(4),
      minutes: (parsed / 60_000).toFixed(4),
      seconds: (parsed / 1000).toFixed(4),
    };
  }, [parsed]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="时长解析" description="支持 3723、1:02:03、1h2m3s、250ms、1d 等写法">
        <TextField label="输入" value={text} onChange={setText} placeholder="1h 2m 3s" />
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMAT_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => setText(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <TextField label="按秒数格式化（毫秒）" value={seconds} onChange={setSeconds} type="number" />
        {!Number.isFinite(secondsMs) ? (
          <EmptyHint>请输入有效秒数</EmptyHint>
        ) : (
          <StatGrid>
            <Stat label="秒 → 可读" value={formatHumanDuration(secondsMs)} />
            <Stat label="秒 → 时分秒" value={formatStopwatch(secondsMs)} />
            <Stat label="秒 → ISO 8601" value={isoDuration(secondsMs)} />
            <Stat label="秒 → 中文" value={formatCnDuration(secondsMs)} />
          </StatGrid>
        )}
      </Section>

      <Section title="格式化结果">
        {!output ? (
          <EmptyHint>无法解析，请检查输入格式</EmptyHint>
        ) : (
          <>
            <StatGrid>
              <Stat label="毫秒" value={String(output.ms)} />
              <Stat label="小时" value={output.hours} />
              <Stat label="分钟" value={output.minutes} />
              <Stat label="秒" value={output.seconds} />
            </StatGrid>
            <ResultBox
              label="各格式"
              value={[
                `毫秒\t${output.ms}`,
                `秒表格式\t${output.stopwatch}`,
                `倒计时格式\t${output.countdown}`,
                `可读时长\t${output.human}`,
                `中文时长\t${output.cn}`,
                `ISO 8601\t${output.iso}`,
              ].join('\n')}
              onCopy={() => copyText(output.iso)}
              rows="min-h-32"
            />
          </>
        )}
        <Note tone="info" title="ISO 8601 时长">
          形如 <code className="font-mono">PT1H2M3S</code>，天以上会带上日期段 <code className="font-mono">P1DT2H</code>
          ； 负数按 0 处理。
        </Note>
      </Section>
    </div>
  );
}

export default function TimerTool() {
  const [tab, setTab] = useState<TabKey>('stopwatch');

  return (
    <ToolPanel
      title="计时器 / 秒表"
      description="秒表、倒计时、番茄钟与时长格式化，全部基于 performance.now() 与 Date.now()，不使用累加式定时器"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
          <TabsList>
            <TabsTrigger value="stopwatch">秒表</TabsTrigger>
            <TabsTrigger value="countdown">倒计时</TabsTrigger>
            <TabsTrigger value="pomodoro">番茄钟</TabsTrigger>
            <TabsTrigger value="format">格式化</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'stopwatch' && <StopwatchPanel />}
      {tab === 'countdown' && <CountdownPanel />}
      {tab === 'pomodoro' && <PomodoroPanel />}
      {tab === 'format' && <FormatPanel />}

      {tab !== 'format' && (
        <Note tone="warn" title="精度与生命周期">
          <span className="inline-flex items-start gap-1">
            <BellRing className="mt-0.5 size-3 shrink-0" />
            秒表与倒计时只保存「开始时刻」，显示值每次由 performance.now() 重新计算，因此不会因定时器节流而漂移；
            页面卸载或切换标签时组件会清理 rAF 与 interval。番茄钟额外写入 localStorage，用绝对时间差恢复。
          </span>
        </Note>
      )}
    </ToolPanel>
  );
}
