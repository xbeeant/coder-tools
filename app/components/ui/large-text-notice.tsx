import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LargeTextGuard } from '../../hooks/use-large-text';
import { Button } from './button';
import { Note } from './panel';

interface LargeTextNoticeProps {
  guard: LargeTextGuard;
  /** 该工具在大文件模式下具体不生效的能力，必须如实写明。 */
  children?: ReactNode;
  /** 是否配置了后台任务；影响标题与状态行的措辞。 */
  background?: boolean;
  /** 大文件模式下明确拒绝语义转换、且不提供后台结果；此时不显示提交按钮与状态行。 */
  reject?: boolean;
}

/**
 * 大文件模式的统一提示与提交入口。小文件时返回 null，
 * 因此工具页可以直接挂在内容区顶部，不需要额外的条件渲染。
 */
export function LargeTextNotice({ guard, children, background = false, reject = false }: LargeTextNoticeProps) {
  if (!guard.isLarge) return null;
  return (
    <Note
      tone="warn"
      title={reject ? '大文件模式 · 不支持完整解析' : background ? '大文件模式 · 后台处理' : '大文件模式 · 手动提交'}
    >
      <p>
        {reject
          ? '内容超过 100 万字符：已停止实时解析。本工具在此规模下不提供降级的后台处理，请拆分文件后使用，或改用有后台通道的格式化工具（JSON / SQL / XML / 文本统计等）；小于该阈值的文件功能不打折。'
          : '内容超过 100 万字符：已停止每次按键的实时解析，请点「开始处理」提交当前内容；小于该阈值的文件仍使用完整语义链路，功能不打折。'}
      </p>
      {children && <p className="mt-1">{children}</p>}
      {!reject && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={guard.start} disabled={!guard.pending || guard.busy}>
            <Play className="size-3.5" />
            {guard.pending ? '开始处理' : '已是最新'}
          </Button>
          {guard.busy && <span className="text-xs text-info">后台处理中…</span>}
          {!guard.busy && guard.pending && <span className="text-xs text-warning">内容已变化，等待重新处理</span>}
          {!guard.busy && guard.background?.degraded && (
            <span className="text-xs text-danger">{guard.background.error}</span>
          )}
          {background && !guard.busy && guard.background !== null && !guard.background.error && (
            <span className="text-xs text-success">后台完成 · {guard.background.elapsedMs} ms</span>
          )}
        </div>
      )}
    </Note>
  );
}
