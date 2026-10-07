import type * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { cn } from './utils';

export interface ToolPanelProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** 所有工具的根容器：标题区 + 可滚动内容区。 */
export function ToolPanel({ title, description, actions, children, className, bodyClassName }: ToolPanelProps) {
  return (
    <Card className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
          <span className="min-w-0 truncate">{title}</span>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-auto scrollbar-thin', bodyClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** 工具内部的子区块。 */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2 rounded-lg border p-3', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && <h3 className="text-xs font-medium">{title}</h3>}
            {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type NoteTone = 'info' | 'success' | 'warn' | 'danger';

const NOTE_TONES: Record<NoteTone, string> = {
  info: 'border-l-primary/70 bg-primary/5',
  success: 'border-l-emerald-500/70 bg-emerald-500/5',
  warn: 'border-l-amber-500/70 bg-amber-500/5',
  danger: 'border-l-destructive/70 bg-destructive/5',
};

/** 提示条：说明用途、风险或限制。 */
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
      className={cn('rounded-md border border-l-2 px-3 py-2 text-[11px] leading-relaxed', NOTE_TONES[tone], className)}
    >
      {title && <p className="mb-0.5 font-medium">{title}</p>}
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4', className)}>{children}</div>;
}

const STAT_TONES: Record<NoteTone, string> = {
  info: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
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
    <div className={cn('min-w-0 rounded-md border bg-muted/30 px-2.5 py-2', className)}>
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('truncate font-mono text-sm', STAT_TONES[tone])}>{value}</p>
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
            className="flex h-full flex-col gap-1 rounded-md border px-3 py-2 transition-colors hover:border-primary/60 hover:bg-accent/50"
          >
            <span className="text-xs font-medium">{item.name}</span>
            {item.description && (
              <span className="text-[11px] leading-relaxed text-muted-foreground">{item.description}</span>
            )}
            {item.tags && item.tags.length > 0 && (
              <span className="mt-auto flex flex-wrap gap-1 pt-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
