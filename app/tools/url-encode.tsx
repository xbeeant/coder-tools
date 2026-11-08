import { ArrowLeftRight, ClipboardPaste, Link2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Hint, Section, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';

type Mode = 'encode' | 'decode';
type Scope = 'component' | 'uri';

const SAMPLE_URL = 'https://example.com/搜索?q=中文&tag=c++&name=张三&redirect=/a b#片段';
const SAMPLE_ENCODED = '%E4%BD%A0%E5%A5%BD%20World%20%F0%9F%91%8B';

export default function UrlEncode() {
  const [mode, setMode] = useState<Mode>('encode');
  const [scope, setScope] = useState<Scope>('component');
  const [input, setInput] = useState('');

  const result = useMemo<{ ok: true; output: string } | { ok: false; error: string }>(() => {
    if (!input) return { ok: true, output: '' };
    try {
      if (mode === 'encode') {
        return { ok: true, output: scope === 'component' ? encodeURIComponent(input) : encodeURI(input) };
      }
      return { ok: true, output: scope === 'component' ? decodeURIComponent(input) : decodeURI(input) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const reason =
        mode === 'decode'
          ? '解码失败：请输入合法的百分号编码（% 后必须跟两位十六进制），不完整的 %XX 序列无法还原'
          : '编码失败：文本包含不完整的 Unicode 字符（孤立代理项），无法编码';
      return { ok: false, error: `${reason}（${detail}）` };
    }
  }, [input, mode, scope]);

  const parsed = useMemo(() => {
    if (mode !== 'encode' || !input) return null;
    try {
      const url = new URL(input);
      return {
        protocol: url.protocol,
        host: url.host,
        pathname: url.pathname,
        search: [...url.searchParams.entries()].map(([key, value]) => `${key} = ${value}`).join('\n'),
      };
    } catch {
      return null;
    }
  }, [input, mode]);

  const swap = useCallback(() => {
    if (!result.ok || !result.output) return;
    setInput(result.output);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  }, [result, mode]);

  const fillSample = () => {
    setInput(mode === 'encode' ? SAMPLE_URL : SAMPLE_ENCODED);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Link2 className="size-4" />
          URL 编码/解码
        </span>
      }
      description="使用 encodeURIComponent/encodeURI 进行 URL 编码与解码"
      actions={
        <div className="flex flex-row gap-1">
          <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)}>
            <TabsList>
              <TabsTrigger value="component">Component</TabsTrigger>
              <TabsTrigger value="uri">URI</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="encode">编码</TabsTrigger>
              <TabsTrigger value="decode">解码</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={swap} disabled={!result.ok || !result.output}>
            <ArrowLeftRight className="size-3.5" />
            互换
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={fillSample}>
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
          {!input && <Hint>输入 URL 或编码片段后自动显示结果，或点击左侧「示例」</Hint>}
        </div>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={mode === 'encode' ? '输入完整 URL 或需要编码的片段' : '输入需要解码的 %XX 字符串'}
          spellCheck={false}
          className="min-h-28 flex-1 resize-none font-mono text-xs"
          aria-label="输入 URL 或编码片段"
        />
        {parsed && (
          <Section title="URL 解析">
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">协议</div>
                <div className="font-mono">{parsed.protocol}</div>
              </div>
              <div className="min-w-0">
                <div className="text-muted-foreground">主机</div>
                <div className="truncate font-mono">{parsed.host}</div>
              </div>
              <div className="min-w-0">
                <div className="text-muted-foreground">路径</div>
                <div className="truncate font-mono">{parsed.pathname}</div>
              </div>
              {parsed.search && (
                <div className="sm:col-span-3">
                  <div className="text-muted-foreground">查询参数</div>
                  <div className="whitespace-pre-wrap font-mono">{parsed.search}</div>
                </div>
              )}
            </div>
          </Section>
        )}
        <ResultBox
          label="输出"
          value={result.ok ? result.output : ''}
          error={result.ok ? null : result.error}
          onCopy={() => copyText(result.ok ? result.output : '')}
          rows="min-h-20"
          fill
        />
      </div>
    </ToolPanel>
  );
}
