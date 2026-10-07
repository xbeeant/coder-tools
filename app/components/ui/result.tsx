import { Copy, Eraser } from 'lucide-react';
import { Button } from './button';
import { Textarea } from './textarea';
import { cn } from './utils';

export function copyText(text: string): void {
  void navigator.clipboard.writeText(text);
}

interface ResultBoxProps {
  label?: string;
  value?: string;
  error?: string | null;
  onCopy?: () => void;
  className?: string;
  /** 传给内部 textarea 的尺寸类，如 min-h-32。 */
  rows?: string;
  /** 让输出区填满剩余高度，用于输入/输出对照的工具。 */
  fill?: boolean;
}

/** 工具面板共用的只读输出区：错误优先展示，出错时不保留旧值以免误导。 */
export function ResultBox({
  label = '输出',
  value = '',
  error = null,
  onCopy,
  className,
  rows = 'min-h-24',
  fill = false,
}: ResultBoxProps) {
  return (
    <div className={cn('flex min-h-0 flex-col gap-1.5', fill && 'flex-1')}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-muted-foreground">
          {label}
          {error && <span className="ml-1.5 break-all text-destructive">{error}</span>}
        </span>
        {onCopy && (
          <Button size="sm" variant="ghost" disabled={!value} onClick={onCopy}>
            <Copy className="size-3.5" />
            复制
          </Button>
        )}
      </div>
      <Textarea
        value={error ? '' : value}
        readOnly
        spellCheck={false}
        className={cn('resize-none font-mono text-xs', fill && 'min-h-0 flex-1', rows, className)}
      />
    </div>
  );
}

export function ClearButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={disabled}>
      <Eraser className="size-3.5" />
      清空
    </Button>
  );
}
