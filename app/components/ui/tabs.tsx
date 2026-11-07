import * as React from 'react';
import { cn } from './utils';

const TabsContext = React.createContext<{ onValueChange?: (value: string) => void }>({});

type TabsProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: string;
  onValueChange?: (value: string) => void;
};

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(({ className, value, onValueChange, ...props }, ref) => (
  <TabsContext.Provider value={React.useMemo(() => ({ onValueChange }), [onValueChange])}>
    <div
      ref={ref}
      role="tablist"
      aria-orientation="horizontal"
      data-value={value}
      className={cn('w-full', className)}
      {...props}
    />
  </TabsContext.Provider>
));
Tabs.displayName = 'Tabs';

/** 刻度式标签条：底部一条发丝规则线，激活项由琥珀下划线标记。 */
const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('inline-flex h-8 w-full items-stretch border-b border-border', className)}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  /** 受控模式下由 Tabs 的 value 派生；非受控时点自身切换高亮。 */
  value?: string;
};

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, active, value, onClick, type = 'button', ...props }, ref) => {
    const { onValueChange } = React.useContext(TabsContext);
    const [uncontrolled, setUncontrolled] = React.useState(false);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (value !== undefined) {
        if (onValueChange) onValueChange(value);
        else setUncontrolled((prev) => !prev);
      }
    };

    const isActive = active ?? (value === undefined ? uncontrolled : false);

    return (
      <button
        ref={ref}
        type={type}
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? 'active' : 'inactive'}
        onClick={handleClick}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap border-b-2 border-transparent px-2.5 text-xs font-medium',
          'transition-colors duration-150 ease-out-quart disabled:pointer-events-none disabled:opacity-45',
          isActive ? 'border-signal text-foreground' : 'text-muted-foreground hover:text-foreground',
          className,
        )}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export { Tabs, TabsList, TabsTrigger };
