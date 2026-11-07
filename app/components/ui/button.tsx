import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from './utils';

/**
 * 仪器面板按钮：发丝线边界、2px 微圆角、150ms ease-out-quart 换色。
 * 焦点环由 globals.css 的全局 :focus-visible 统一提供，各组件不再各写一套 ring。
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent text-xs font-medium tabular-nums transition-[color,background-color,border-color] duration-150 ease-out-quart disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary',
        destructive: 'border-danger bg-danger text-destructive-foreground hover:bg-danger/85 active:bg-danger',
        outline:
          'border-border-strong bg-surface text-foreground hover:border-foreground/50 hover:bg-surface-2 active:bg-muted',
        secondary: 'border-border bg-surface-2 text-foreground hover:bg-muted active:bg-surface-2',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
        /** 单一信号色：只用于「当前 / 需要注意」的主行动，不作装饰。 */
        signal: 'border-signal bg-signal text-signal-foreground hover:bg-signal/85 active:bg-signal',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-[11px]',
        lg: 'h-9 px-4',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** loading 会禁用交互并显示旋转标记，覆盖 Component States Checklist 的加载态。 */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && !asChild ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
