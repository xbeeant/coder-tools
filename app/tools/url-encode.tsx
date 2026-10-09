import { ArrowLeftRight, Link2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Section, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';

type Mode = 'encode' | 'decode';
type Scope = 'component' | 'uri';

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
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
        <>
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
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-2">
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
