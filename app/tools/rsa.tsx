import { Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';

const KEY_SIZES = [1024, 2048, 3072, 4096] as const;

interface GeneratedKeys {
  modulusLength: number;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

function toPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 + Base64 的 JWK thumbprint，用作密钥指纹。 */
async function jwkThumbprint(publicJwk: JsonWebKey): Promise<string> {
  const ordered = JSON.stringify({
    crv: publicJwk.crv ?? 'RSA',
    e: publicJwk.e,
    kty: publicJwk.kty,
    n: publicJwk.n,
  });
  const hex = await sha256Hex(ordered);
  let binary = '';
  for (let i = 0; i < hex.length; i += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function RsaTool() {
  const [modulusLength, setModulusLength] = useState<number>(2048);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<GeneratedKeys | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setKeys(null);
    try {
      const pair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt'],
      );
      const [publicKey, privateKey] = await Promise.all([
        crypto.subtle.exportKey('spki', pair.publicKey),
        crypto.subtle.exportKey('pkcs8', pair.privateKey),
      ]);
      const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      setKeys({
        modulusLength,
        publicKey: toPem(publicKey, 'PUBLIC KEY'),
        privateKey: toPem(privateKey, 'PRIVATE KEY'),
        fingerprint: await jwkThumbprint(publicJwk),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-4" />
          RSA 密钥对生成
        </span>
      }
      description="使用 Web Crypto 生成 RSA-OAEP (SHA-256) 密钥对"
      actions={
        <>
          <Select
            ariaLabel="密钥长度"
            value={String(modulusLength)}
            onChange={(value) => setModulusLength(Number(value))}
            options={KEY_SIZES.map((size) => ({ value: String(size), label: `${size} 位` }))}
            selectClassName="w-28"
          />
          <Button size="sm" onClick={() => void generate()} disabled={busy}>
            <ShieldCheck className="size-3.5" />
            {busy ? '生成中…' : '生成密钥对'}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-3 overflow-auto scrollbar-thin">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {busy && !keys && <p className="text-xs text-muted-foreground">正在生成密钥，4096 位可能需要几秒…</p>}

        {keys && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
              <span>密钥长度 {keys.modulusLength} 位</span>
              <span className="text-muted-foreground">SHA-256 JWK 指纹</span>
              <code className="font-mono">{keys.fingerprint}</code>
            </div>

            <KeyBlock label="公钥 (SPKI / PEM)" value={keys.publicKey} />
            <KeyBlock label="私钥 (PKCS#8 / PEM)" value={keys.privateKey} warn />
          </>
        )}

        {!busy && !keys && !error && (
          <p className="text-xs text-muted-foreground">
            使用浏览器 Web Crypto 生成 RSA-OAEP（SHA-256）密钥对，密钥不会离开本机。生产环境建议 2048 位以上。
          </p>
        )}
      </div>
    </ToolPanel>
  );
}

function KeyBlock({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {label}
          {warn && <span className="ml-1.5 text-[10px] text-destructive">请勿分享</span>}
        </span>
        <Button size="sm" variant="ghost" onClick={() => copyText(value)}>
          <Copy className="size-3.5" />
          复制
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
        {value}
      </pre>
    </div>
  );
}
