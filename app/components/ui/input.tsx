import * as React from 'react';
import { cn } from './utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-8 w-full min-w-0 rounded-sm border border-border-strong bg-surface px-2 py-1 text-xs text-foreground',
      'transition-[border-color,background-color] duration-150 ease-out-quart',
      'file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground',
      'placeholder:text-muted-foreground',
      'aria-[invalid=true]:border-danger',
      'read-only:bg-muted/40 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/50 disabled:opacity-60',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
