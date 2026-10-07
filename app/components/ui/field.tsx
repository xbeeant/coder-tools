import * as React from 'react';
import { Input } from './input';
import { cn } from './utils';

interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** 表单字段容器：标题在上、控件在下、说明文字在底部。 */
export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs', className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

export interface TextFieldProps {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  type?: React.HTMLInputTypeAttribute;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  spellCheck?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
  className,
  inputClassName,
  disabled,
  readOnly,
  spellCheck = false,
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        spellCheck={spellCheck}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-8 font-mono text-xs', inputClassName)}
      />
    </Field>
  );
}

export interface NumberFieldProps {
  label: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  className,
  disabled,
}: NumberFieldProps) {
  return (
    <Field label={label} hint={hint} className={className}>
      <span className="flex items-center gap-1">
        <Input
          type="number"
          value={Number.isFinite(value) ? String(value) : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-8 font-mono text-xs"
        />
        {suffix && <span className="shrink-0 text-[11px] text-muted-foreground">{suffix}</span>}
      </span>
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
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
}

export function Select({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  hint,
  className,
  disabled,
  selectClassName,
}: SelectProps) {
  const id = React.useId();
  const select = (
    <select
      id={label ? id : undefined}
      aria-label={label ? undefined : ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-8 w-full rounded-md border bg-background px-2 text-xs', selectClassName)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
  if (!label) {
    return (
      <div className={cn('min-w-0', className)}>
        {select}
        {hint && <span className="mt-1 block text-[11px] text-muted-foreground/80">{hint}</span>}
      </div>
    );
  }
  return (
    <Field label={label} hint={hint} className={className}>
      {select}
    </Field>
  );
}

export interface CheckboxProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({ label, checked, onChange, hint, className, disabled }: CheckboxProps) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="size-3.5 accent-primary"
        />
        {label}
      </span>
      {hint && <span className="pl-5 text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>}
    </label>
  );
}
