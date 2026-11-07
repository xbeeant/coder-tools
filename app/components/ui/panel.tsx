import type * as React from 'react';
import { cn } from './utils';

export interface ToolPanelProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * 所有工具的根容器，85 个工具页共用这一层。
 *
 * 仪器面板结构：左侧一条墨蓝细线标记「当前工具通道」，标题区只出现一次，
 * 内容区是可滚动的工作面。层级来自规则线与留白，不来自叠卡片与阴影。
 */
export function ToolPanel({ title, description, actions, children, className, bodyClassName }: ToolPanelProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-l-2 border-border border-l-primary bg-surface',
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[13px] font-semibold leading-tight tracking-[0.01em]">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 scrollbar-thin', bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** 工具内部的子区块：细线边界 + 微型刻度标题，不再套一层浮起卡片。 */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2 rounded-sm border border-border bg-surface-2/40 p-3', className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {title && <h3 className="instrument-rule text-[11px] font-semibold text-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type NoteTone = 'info' | 'success' | 'warn' | 'danger';

const NOTE_TONES: Record<NoteTone, string> = {
  info: 'border-l-info bg-info/5',
  success: 'border-l-success bg-success/5',
  warn: 'border-l-warning bg-warning/5',
  danger: 'border-l-danger bg-danger/5',
};

/** 提示条：说明用途、风险或限制。左侧色条编码语气，正文始终用达标的前景色。 */
export function Note({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoteTone;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-sm border border-l-2 px-3 py-2 text-[11px] leading-relaxed', NOTE_TONES[tone], className)}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4', className)}>{children}</div>;
}

const STAT_TONES: Record<NoteTone, string> = {
  info: 'text-foreground',
  success: 'text-success',
  warn: 'text-warning',
  danger: 'text-danger',
};

export function Stat({
  label,
  value,
  hint,
  tone = 'info',
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: NoteTone;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-sm border border-border bg-surface-2/40 px-2.5 py-2', className)}>
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('truncate font-mono text-sm tabular-nums', STAT_TONES[tone])}>{value}</p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface LinkItem {
  name: string;
  url: string;
  description?: string;
  tags?: string[];
}

/** 外部工具入口列表，导航与平台类工具共用。 */
export function LinkList({
  items,
  columns = 2,
  className,
}: {
  items: LinkItem[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-2', columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2', className)}>
      {items.map((item) => (
        <li key={item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex h-full flex-col gap-1 rounded-sm border border-border bg-surface px-3 py-2 transition-colors duration-150 ease-out-quart hover:border-primary/60 hover:bg-surface-2"
          >
            <span className="text-xs font-medium">{item.name}</span>
            {item.description && (
              <span className="text-[11px] leading-relaxed text-muted-foreground">{item.description}</span>
            )}
            {item.tags && item.tags.length > 0 && (
              <span className="mt-auto flex flex-wrap gap-1 pt-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function EmptyHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('py-6 text-center text-xs text-muted-foreground', className)}>{children}</p>;
}

export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[11px] leading-relaxed text-muted-foreground', className)}>{children}</p>;
}
