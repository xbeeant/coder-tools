import { BarChart3, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Note, Section, ToolPanel } from '../components/ui/panel';
import { Textarea } from '../components/ui/textarea';
import {
  ATTACK_LABELS,
  type AttackKind,
  analyzePassword,
  CHAR_CLASSES,
  formatDuration,
  LEVEL_COLORS,
  LEVEL_LABELS,
} from '../lib/password';

export default function PasswordStrength() {
  const [password, setPassword] = useState('');

  const result = useMemo(() => analyzePassword(password), [password]);
  const percent = Math.min(100, (result.entropy / 128) * 100);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          密码强度分析
        </span>
      }
      description="本地分析密码熵、字符集、词典命中与暴力破解耗时"
    >
      <div className="flex flex-1 flex-col gap-3 overflow-auto scrollbar-thin">
        <Textarea
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入密码进行评估，内容不会离开本机"
          spellCheck={false}
          autoComplete="off"
          className="min-h-16 resize-none font-mono text-xs"
        />

        {password.length === 0 ? (
          <Note tone="info" title="说明">
            <span className="flex items-center gap-2">
              <BarChart3 className="size-3.5" />
              全部计算在本机完成，密码不会被发送或存储。
            </span>
          </Note>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{LEVEL_LABELS[result.level]}</span>
                <span className="tabular-nums text-muted-foreground">{result.entropy.toFixed(1)} bits 熵</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${LEVEL_COLORS[result.level]}`}
                  style={{ width: `${Math.max(3, percent)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
              <Stat label="长度" value={String(result.length)} />
              <Stat label="唯一字符" value={String(result.uniqueCount)} />
              <Stat label="字符集大小" value={String(result.poolSize)} />
              <Stat label="可能组合数" value={`≈2^${result.entropy.toFixed(0)}`} />
            </div>

            <Section title="字符集覆盖">
              <div className="flex flex-wrap gap-1.5">
                {CHAR_CLASSES.map((cls) => {
                  const hit = result.classes.includes(cls);
                  return (
                    <span
                      key={cls.label}
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${
                        hit ? 'border-primary bg-primary/10' : 'text-muted-foreground'
                      }`}
                    >
                      {cls.label} {hit ? `+${cls.poolSize}` : '未使用'}
                    </span>
                  );
                })}
              </div>
            </Section>

            {result.matches.length > 0 && (
              <Section title="词典命中">
                <ul className="space-y-0.5">
                  {result.matches.map((match) => (
                    <li key={`${match.dictionary}-${match.word}-${match.span[0]}`} className="text-xs">
                      <span className="text-muted-foreground">{match.dictionary}：</span>
                      <code className="font-mono">{match.word}</code>
                      <span className="ml-1 text-muted-foreground">
                        （位置 {match.span[0]}-{match.span[1] - 1}）
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="暴力破解耗时估算">
              <ul className="space-y-1">
                {result.crackTimes.map(({ kind, seconds }) => (
                  <li key={kind} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{ATTACK_LABELS[kind as AttackKind]}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatDuration(seconds)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {result.suggestions.length > 0 && (
              <Section title="改进建议">
                <ul className="space-y-0.5 text-xs">
                  {result.suggestions.map((tip) => (
                    <li key={tip} className="flex gap-1.5">
                      <span className="text-muted-foreground">·</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </ToolPanel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-xs tabular-nums">{value}</div>
    </div>
  );
}
