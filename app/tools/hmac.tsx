import { Signature } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Note, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';

const HMAC_ALGS: { name: string; hash: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' }[] = [
  { name: 'HMAC-SHA1', hash: 'SHA-1' },
  { name: 'HMAC-SHA256', hash: 'SHA-256' },
  { name: 'HMAC-SHA384', hash: 'SHA-384' },
  { name: 'HMAC-SHA512', hash: 'SHA-512' },
];

type Encoding = 'hex' | 'base64' | 'base64url';

function toBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const raw = btoa(binary);
  return urlSafe ? raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : raw;
}

/** 定长比较：逐位累积差异，避免首个不匹配即返回造成的时序泄漏。 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function format(bytes: Uint8Array, encoding: Encoding): string {
  if (encoding === 'hex') return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return toBase64(bytes, encoding === 'base64url');
}

export default function HmacTool() {
  const [alg, setAlg] = useState(HMAC_ALGS[1]);
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState('');
  const [encoding, setEncoding] = useState<Encoding>('hex');
  const [result, setResult] = useState<
    { ok: true; value: string; encoding: Encoding } | { ok: false; error: string } | null
  >(null);

  const sign = async () => {
    setResult(null);
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: alg.hash },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
      setResult({ ok: true, value: format(new Uint8Array(signature), encoding), encoding });
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const verify = async () => {
    if (!result?.ok) return;
    setResult(null);
    try {
      // 用产生该签名时的编码解析，而非当前下拉框：切换编码后仍能正确校验。
      const hex = result.encoding === 'hex' ? result.value : null;
      const bytes =
        hex !== null
          ? new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
          : new Uint8Array(
              atob(result.encoding === 'base64url' ? result.value.replace(/-/g, '+').replace(/_/g, '/') : result.value)
                .split('')
                .map((char) => char.charCodeAt(0)),
            );
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: alg.hash },
        false,
        ['sign'],
      );
      const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
      const actualBytes = new Uint8Array(bytes);
      const expectedBytes = new Uint8Array(expected);
      setResult({
        ok: true,
        encoding: result.encoding,
        value: constantTimeEqual(actualBytes, expectedBytes) ? '校验通过：签名与消息匹配' : '校验失败：签名不匹配',
      });
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const disabled = !message || !secret;

  const options = useMemo(() => HMAC_ALGS.map((item) => item.name), []);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Signature className="size-4" />
          HMAC 生成器
        </span>
      }
      description="使用密钥对消息计算消息认证码，用于 Webhook 签名与接口验签"
      actions={<ClearButton onClick={() => setMessage('')} disabled={message === ''} />}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto scrollbar-thin">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Select
            ariaLabel="算法"
            value={alg.name}
            onChange={(value) => {
              const found = HMAC_ALGS.find((item) => item.name === value);
              if (found) setAlg(found);
            }}
            options={options.map((name) => ({ value: name, label: name }))}
            selectClassName="w-36"
          />
          <Select
            ariaLabel="输出编码"
            value={encoding}
            onChange={(value) => setEncoding(value as Encoding)}
            options={[
              { value: 'hex', label: 'hex' },
              { value: 'base64', label: 'base64' },
              { value: 'base64url', label: 'base64url' },
            ]}
            selectClassName="w-28"
          />
          <label className="flex flex-1 items-center gap-1.5">
            密钥
            <Input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="密钥"
              autoComplete="off"
              className="h-7 flex-1 font-mono text-xs"
            />
          </label>
        </div>

        <span className="text-xs text-muted-foreground">消息</span>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="要签名的请求体或字符串"
          spellCheck={false}
          aria-label="消息"
          className="min-h-24 resize-none font-mono text-xs"
        />

        <div className="flex gap-2">
          <Button size="sm" onClick={() => void sign()} disabled={disabled}>
            生成签名
          </Button>
          <Button size="sm" variant="outline" onClick={() => void verify()} disabled={disabled || !result?.ok}>
            重新校验
          </Button>
        </div>

        <ResultBox
          label="结果"
          value={result?.ok ? result.value : ''}
          error={result && !result.ok ? result.error : null}
          onCopy={() => copyText(result?.ok ? result.value : '')}
          rows="min-h-16"
        />
      </div>

      <Note tone="info" title="说明">
        验签按恒定时间比较，避免通过响应耗时侧信道推断签名；重新校验使用生成该签名时的编码， 切换输出编码不会影响结果。
      </Note>
    </ToolPanel>
  );
}
