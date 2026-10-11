import { ArrowLeftRight, Code2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '../components/ui/button';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { decodeHtmlEntities, encodeHtmlEntitiesAs, type HtmlEntityMode } from '../lib/html-entities';

type Mode = 'encode' | 'decode';

const MODE_OPTIONS: { value: HtmlEntityMode; label: string }[] = [
  { value: 'named', label: '命名实体' },
  { value: 'numeric', label: '十进制' },
  { value: 'hex', label: '十六进制' },
];

export default function HtmlEntityTool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [style, setStyle] = useState<HtmlEntityMode>('named');
  const [input, setInput] = useState('');

  const output = mode === 'encode' ? encodeHtmlEntitiesAs(input, style) : decodeHtmlEntities(input);

  const handleSwap = useCallback(() => {
    if (!output) return;
    setInput(output);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  }, [mode, output]);

  const handleClear = useCallback(() => {
    setInput('');
  }, []);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Code2 className="size-4" />
          HTML 实体转换
        </span>
      }
      description="HTML 实体编码与解码，支持命名、十进制与十六进制格式"
      actions={
        <div className="flex flex-row gap-1">
          {mode === 'encode' && (
            <Tabs value={style} onValueChange={(value) => setStyle(value as HtmlEntityMode)}>
              <TabsList>
                {MODE_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Tabs value={mode} onValueChange={(value) => setMode(value === 'decode' ? 'decode' : 'encode')}>
            <TabsList>
              <TabsTrigger value="encode">编码</TabsTrigger>
              <TabsTrigger value="decode">解码</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={handleSwap} disabled={!output}>
            <ArrowLeftRight className="size-3.5" />
            互换
          </Button>
          <ClearButton onClick={handleClear} disabled={!input} />
        </div>
      }
    >
      <Note tone="info" title="说明">
        编码时会转义 <code className="font-mono">&amp; &lt; &gt; &quot; &#39;</code>{' '}
        以及常见命名实体；解码同时支持命名、十进制与十六进制写法，未知实体原样保留。
      </Note>
      <div className="flex flex-1 flex-col gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === 'encode' ? '输入要转义的文本，例如 <div> & "引号"' : '输入实体文本，例如 &lt;div&gt;&#160;'
          }
          spellCheck={false}
          aria-label={mode === 'encode' ? '待编码文本' : '待解码实体文本'}
          className="min-h-32 flex-1 resize-none font-mono text-xs"
        />
        <ResultBox label="输出" value={output} onCopy={() => copyText(output)} rows="min-h-32" fill />
      </div>
    </ToolPanel>
  );
}
