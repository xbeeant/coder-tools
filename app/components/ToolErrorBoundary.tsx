import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Note } from './ui/panel';

interface Props {
  children: ReactNode;
  /** 切换工具时由父级改变 key，错误状态随之重置 */
  toolId: string;
}

interface State {
  error: Error | null;
  componentStack: string;
}

/**
 * 每个工具的独立错误边界。
 *
 * 任何一个工具在渲染期抛错（例如时间戳工具曾经因 Invalid Date 抛 RangeError），
 * 过去会让整个应用白屏；这里把影响范围限制在当前工具卡片内，其余导航与设置仍可用。
 */
export class ToolErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Coder Tools] 工具渲染失败', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  private retry = () => this.setState({ error: null, componentStack: '' });

  override render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-sm border border-border bg-surface p-6">
        <AlertTriangle className="size-6 text-danger" />
        <div className="text-center">
          <h2 className="text-sm font-medium">该工具暂时无法显示</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            「{this.props.toolId}」在渲染时抛出了异常，其他工具不受影响。
          </p>
        </div>
        <p className="max-w-lg break-all rounded-sm border border-border bg-surface-2 px-3 py-2 text-center font-mono text-[11px] text-danger">
          {error.message || String(error)}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={this.retry}>
            <RotateCcw className="size-3.5" />
            重试
          </Button>
        </div>
        {componentStack && (
          <details className="max-w-lg text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">查看组件调用栈</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono">{componentStack}</pre>
          </details>
        )}
        <Note tone="info" title="可以继续使用">
          从左侧切换任意其他工具即可继续工作；重试会重新挂载当前工具，输入内容若已开启自动保存会被带回。
        </Note>
      </div>
    );
  }
}
