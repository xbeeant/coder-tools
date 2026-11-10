import { ArrowLeftRight, ClipboardPaste } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { LargeTextNotice } from '../components/ui/large-text-notice';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { useLargeText } from '../hooks/use-large-text';

type Mode = 'encode' | 'decode';

const SAMPLE_PLAIN = 'Hello 世界 👋\n第二行内容';
const SAMPLE_BASE64 = 'SGVsbG8g5LiW55WMIPCfkYsK56ys5LqM6KGM5YaF5a65';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): string {
  // 同时兼容 URL-safe 变体与缺失的padding。
  const normalized = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export default function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');

  const guard = useLargeText(input, {
    kind: 'codec',
    options: { mode: mode === 'encode' ? 'base64-encode' : 'base64-decode' },
  });

  const result = useMemo<{ ok: true; output: string } | { ok: false; error: string }>(() => {
    if (guard.isLarge) return { ok: true, output: '' };
    if (guard.source === '') return { ok: true, output: '' };
    try {
      return { ok: true, output: mode === 'encode' ? toBase64(guard.source) : fromBase64(guard.source) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [guard.source, guard.isLarge, mode]);

  const outputValue = guard.isLarge ? (guard.output ?? '') : result.ok ? result.output : '';
  const outputError = guard.isLarge
    ? guard.background?.error
      ? `后台处理失败：${guard.background.error}`
      : null
    : result.ok
      ? null
      : result.error;

  const swap = useCallback(() => {
    if (outputError || outputValue === '') return;
    setInput(outputValue);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  }, [outputError, outputValue, mode]);

  return (
    <ToolPanel
      title="Base64 编码/解码"
      description="UTF-8 安全的 Base64 转换，解码兼容 URL-safe 变体"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="ghost" onClick={swap} disabled={!outputValue}>
            <ArrowLeftRight className="size-3.5" />
            互换
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={input === ''} />
        </div>
      }
    >
      <LargeTextNotice guard={guard} background={true}>
        大文件模式使用后台 UTF-8 编解码：不兼容 URL-safe 变体（- / _）与缺失 padding，也不做 fatal 严格 UTF-8 校验。
      </LargeTextNotice>
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="encode" active={mode === 'encode'}>
            编码
          </TabsTrigger>
          <TabsTrigger value="decode" active={mode === 'decode'}>
            解码
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setInput(mode === 'encode' ? SAMPLE_PLAIN : SAMPLE_BASE64);
            }}
          >
            <ClipboardPaste className="size-3.5" />
            示例
          </Button>
        </div>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={mode === 'encode' ? '输入要编码的文本，支持中文和 Emoji' : '输入要解码的 Base64 字符串'}
          spellCheck={false}
          aria-label="Base64 输入"
          className="min-h-32 flex-1 resize-none font-mono text-xs"
        />
        <ResultBox
          label="输出"
          value={outputValue}
          error={outputError}
          onCopy={() => copyText(outputValue)}
          rows="min-h-32"
          fill
        />
      </div>

      <Note tone="info" title="说明">
        编码走 TextEncoder，按 UTF-8 处理中文与 Emoji；解码使用 fatal 模式，遇到非 UTF-8
        字节（即二进制内容）会直接报错而不是静默产生乱码。
      </Note>
    </ToolPanel>
  );
}
