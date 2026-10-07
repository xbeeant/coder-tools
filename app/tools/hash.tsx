import { Copy, Hash } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';

const SHA_ALGS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
type ShaAlg = (typeof SHA_ALGS)[number];

function md5(input: string): string {
  const add = (x: number, y: number) => {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  };
  const rotate = (n: number, c: number) => (n << c) | (n >>> (32 - c));
  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) =>
    add(rotate(add(add(a, q), add(x, t)), s), b);
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t);

  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const [x0, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11, x12, x13, x14, x15] = Array.from({ length: 16 }, (_, i) =>
      view.getInt32(offset + i * 4, true),
    ) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    a = ff(a, b, c, d, x0, 7, -680876936);
    d = ff(d, a, b, c, x1, 12, -389564586);
    c = ff(c, d, a, b, x2, 17, 606105819);
    b = ff(b, c, d, a, x3, 22, -1044525330);
    a = ff(a, b, c, d, x4, 7, -176418897);
    d = ff(d, a, b, c, x5, 12, 1200080426);
    c = ff(c, d, a, b, x6, 17, -1473231341);
    b = ff(b, c, d, a, x7, 22, -45705983);
    a = ff(a, b, c, d, x8, 7, 1770035416);
    d = ff(d, a, b, c, x9, 12, -1958414417);
    c = ff(c, d, a, b, x10, 17, -42063);
    b = ff(b, c, d, a, x11, 22, -1990404162);
    a = ff(a, b, c, d, x12, 7, 1804603682);
    d = ff(d, a, b, c, x13, 12, -40341101);
    c = ff(c, d, a, b, x14, 17, -1502002290);
    b = ff(b, c, d, a, x15, 22, 1236535329);

    a = gg(a, b, c, d, x1, 5, -165796510);
    d = gg(d, a, b, c, x6, 9, -1069501632);
    c = gg(c, d, a, b, x11, 14, 643717713);
    b = gg(b, c, d, a, x0, 20, -373897302);
    a = gg(a, b, c, d, x5, 5, -701558691);
    d = gg(d, a, b, c, x10, 9, 38016083);
    c = gg(c, d, a, b, x15, 14, -660478335);
    b = gg(b, c, d, a, x4, 20, -405537848);
    a = gg(a, b, c, d, x9, 5, 568446438);
    d = gg(d, a, b, c, x14, 9, -1019803690);
    c = gg(c, d, a, b, x3, 14, -187363961);
    b = gg(b, c, d, a, x8, 20, 1163531501);
    a = gg(a, b, c, d, x13, 5, -1444681467);
    d = gg(d, a, b, c, x2, 9, -51403784);
    c = gg(c, d, a, b, x7, 14, 1735328473);
    b = gg(b, c, d, a, x12, 20, -1926607734);

    a = hh(a, b, c, d, x5, 4, -378558);
    d = hh(d, a, b, c, x8, 11, -2022574463);
    c = hh(c, d, a, b, x11, 16, 1839030562);
    b = hh(b, c, d, a, x14, 23, -35309556);
    a = hh(a, b, c, d, x1, 4, -1530992060);
    d = hh(d, a, b, c, x4, 11, 1272893353);
    c = hh(c, d, a, b, x7, 16, -155497632);
    b = hh(b, c, d, a, x10, 23, -1094730640);
    a = hh(a, b, c, d, x13, 4, 681279174);
    d = hh(d, a, b, c, x0, 11, -358537222);
    c = hh(c, d, a, b, x3, 16, -722521979);
    b = hh(b, c, d, a, x6, 23, 76029189);
    a = hh(a, b, c, d, x9, 4, -640364487);
    d = hh(d, a, b, c, x12, 11, -421815835);
    c = hh(c, d, a, b, x15, 16, 530742520);
    b = hh(b, c, d, a, x2, 23, -995338651);

    a = ii(a, b, c, d, x0, 6, -198630844);
    d = ii(d, a, b, c, x7, 10, 1126891415);
    c = ii(c, d, a, b, x14, 15, -1416354905);
    b = ii(b, c, d, a, x5, 21, -57434055);
    a = ii(a, b, c, d, x12, 6, 1700485571);
    d = ii(d, a, b, c, x3, 10, -1894986606);
    c = ii(c, d, a, b, x10, 15, -1051523);
    b = ii(b, c, d, a, x1, 21, -2054922799);
    a = ii(a, b, c, d, x8, 6, 1873313359);
    d = ii(d, a, b, c, x15, 10, -30611744);
    c = ii(c, d, a, b, x6, 15, -1560198380);
    b = ii(b, c, d, a, x13, 21, 1309151649);
    a = ii(a, b, c, d, x4, 6, -145523070);
    d = ii(d, a, b, c, x11, 10, -1120210379);
    c = ii(c, d, a, b, x2, 15, 718787259);
    b = ii(b, c, d, a, x9, 21, -343485551);

    a0 = add(a0, a);
    b0 = add(b0, b);
    c0 = add(c0, c);
    d0 = add(d0, d);
  }

  return [a0, b0, c0, d0]
    .flatMap((n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha(alg: ShaAlg, input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(alg.replace('-', '').toLowerCase(), new TextEncoder().encode(input));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function HashTool() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<Record<ShaAlg | 'MD5', string> | null>(null);
  const [busy, setBusy] = useState(false);

  const compute = async () => {
    if (!input) return;
    setBusy(true);
    try {
      const [sha1, sha256, sha384, sha512] = await Promise.all([
        sha('SHA-1', input),
        sha('SHA-256', input),
        sha('SHA-384', input),
        sha('SHA-512', input),
      ]);
      setResults({ MD5: md5(input), 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-384': sha384, 'SHA-512': sha512 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Hash className="size-4" />
          哈希计算
        </span>
      }
      description="计算 MD5、SHA-1、SHA-256、SHA-384、SHA-512 哈希值"
      actions={
        <>
          <Button size="sm" onClick={() => void compute()} disabled={!input || busy}>
            {busy ? '计算中' : '计算'}
          </Button>
          <ClearButton
            onClick={() => {
              setInput('');
              setResults(null);
            }}
            disabled={!input}
          />
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto scrollbar-thin">
        <Textarea
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setResults(null);
          }}
          placeholder="输入文本后点击计算"
          spellCheck={false}
          className="min-h-20 resize-none font-mono text-xs"
        />
        {results && (
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(results).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-medium">{label}</span>
                <Input value={value} readOnly spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
                <Button size="icon" variant="ghost" onClick={() => copyText(value)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolPanel>
  );
}
