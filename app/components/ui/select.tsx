/**
 * Select 组件
 *
 * Props 说明：
 *   label        - 表单标签
 *   ariaLabel    - 无障碍标签（无 label 时必填）
 *   value        - 选中值
 *   onChange     - 值变更回调
 *   options      - 选项数组
 *   hint         - 辅助说明文字
 *   disabled     - 禁用状态
 *   className    - 外层容器类名
 *   selectClassName - 下拉按钮类名
 *   displayValue - 自定义选中展示文字
 *   layout       - label 与 select 的布局方式（vertical=上下默认，horizontal=左右）
 *
 * SelectOption 字段：
 *   value  - 选项值
 *   label  - 选项显示文字
 *   disabled - 是否禁用
 *   group  - 分组标签（用于 <optgroup>）
 */

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { Button } from './button';
import { cn } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** 可选：分组标签，用于将多个 option 归入一个 <optgroup>。 */
  group?: string;
}

export interface SelectProps {
  label?: React.ReactNode;
  /** 无 label 时必须提供 ariaLabel。 */
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  hint?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  selectClassName?: string;
  /** 可选：自定义选中项的展示文字。 */
  displayValue?: string;
  /** label 与 select 的布局方式：vertical=上下（默认），horizontal=左右 */
  layout?: 'vertical' | 'horizontal';
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  React.useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      label,
      ariaLabel,
      value,
      onChange,
      options,
      hint,
      className,
      disabled,
      selectClassName,
      displayValue,
      layout = 'vertical',
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const listboxRef = React.useRef<HTMLDivElement>(null);
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const optionsRef = React.useRef<HTMLButtonElement[]>([]);

    // 点击外部关闭
    useClickOutside(containerRef, () => {
      setOpen(false);
      setActiveIndex(-1);
    });

    // 键盘导航
    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!open) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
          return;
        }

        switch (event.key) {
          case 'ArrowDown': {
            event.preventDefault();
            setActiveIndex((prev) => {
              // 跳过 disabled 选项
              let idx = prev + 1;
              while (idx < optionsRef.current.length && optionsRef.current[idx]?.disabled) {
                idx += 1;
              }
              return idx < optionsRef.current.length ? idx : prev;
            });
            break;
          }
          case 'ArrowUp': {
            event.preventDefault();
            setActiveIndex((prev) => {
              let idx = prev - 1;
              while (idx >= 0 && optionsRef.current[idx]?.disabled) {
                idx -= 1;
              }
              return idx >= 0 ? idx : prev;
            });
            break;
          }
          case 'Enter':
          case ' ': {
            event.preventDefault();
            if (activeIndex >= 0 && activeIndex < optionsRef.current.length) {
              const opt = options[activeIndex];
              if (!opt.disabled) {
                onChange(opt.value);
                setOpen(false);
                setActiveIndex(-1);
              }
            }
            break;
          }
          case 'Escape': {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
            buttonRef.current?.focus();
            break;
          }
        }
      },
      [open, activeIndex, onChange, options],
    );

    // 选中项展示
    const selectedLabel = displayValue ?? options.find((o) => o.value === value)?.label ?? '';

    return (
      <div ref={ref} className={cn('relative min-w-0', className)} {...props}>
        <div ref={containerRef}>
          {/* 触发按钮 */}
          {layout === 'horizontal' ? (
            <div className={cn('flex min-w-0 items-center gap-2 text-xs', label && 'text-muted-foreground')}>
              {label && <span className="shrink-0">{label}</span>}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Button
                  ref={buttonRef}
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={label ? undefined : ariaLabel}
                  aria-haspopup="listbox"
                  disabled={disabled}
                  className={cn('flex h-8 w-full items-center justify-between gap-2 px-2 text-xs', selectClassName)}
                  onClick={() => {
                    if (!disabled) setOpen((prev) => !prev);
                  }}
                  onKeyDown={handleKeyDown}
                >
                  <span className="min-w-0 truncate">{selectedLabel}</span>
                  <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
                </Button>
                {hint && <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
              </div>
            </div>
          ) : (
            <div className={cn('flex min-w-0 flex-col gap-1 text-xs', label && 'text-muted-foreground')}>
              {label && <span>{label}</span>}
              <Button
                ref={buttonRef}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-label={label ? undefined : ariaLabel}
                aria-haspopup="listbox"
                disabled={disabled}
                className={cn('flex h-8 w-full items-center justify-between gap-2 px-2 text-xs', selectClassName)}
                onClick={() => {
                  if (!disabled) setOpen((prev) => !prev);
                }}
                onKeyDown={handleKeyDown}
              >
                <span className="min-w-0 truncate">{selectedLabel}</span>
                <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
              </Button>
              {hint && <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
            </div>
          )}

          {/* 下拉列表 */}
          {open && (
            <div
              ref={listboxRef}
              role="listbox"
              aria-label={ariaLabel ?? selectedLabel}
              className={cn(
                'absolute z-50 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg outline-none scrollbar-thin',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in bg-white',
              )}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;

                return (
                  <button
                    type="button"
                    key={`${option.value}`}
                    ref={(el) => {
                      optionsRef.current[index] = el!;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    data-active={isActive}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                      'bg-popover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      option.disabled && 'pointer-events-none opacity-50',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                      isActive && !isSelected && 'bg-accent',
                    )}
                    onClick={() => {
                      if (!option.disabled) {
                        onChange(option.value);
                        setOpen(false);
                        setActiveIndex(-1);
                      }
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {isSelected && <span className="shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
