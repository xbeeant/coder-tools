import * as React from 'react';
import { cn } from './utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-20 w-full min-w-0 rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-xs text-foreground',
      'transition-[border-color,background-color] duration-150 ease-out-quart',
      'placeholder:text-muted-foreground',
      'aria-[invalid=true]:border-danger',
      'read-only:bg-muted/40 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/50 disabled:opacity-60',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
