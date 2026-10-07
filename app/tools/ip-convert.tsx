import { ArrowLeftRight, Binary, Network, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/field';
import { Note, type NoteTone, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { classifyIpv4, formatIpv4, ipFlags, parseIpv4 } from '../lib/ipv4';
import { classifyIpv6, formatIpv6, ip6ArpaDomain, ipv6GroupTable, ipv6ZeroRun, parseIpv6 } from '../lib/ipv6';

interface Flexible {
  value: number;
  /** 识别出的输入形式。 */
  form: string;
}

/**
 * 识别多种写法：点分十进制、十六进制、八进制、二进制、十进制整数。
 * 无法确定含义时返回 null。
 */
function parseFlexible(input: string): Flexible | null {
  const text = input.trim();
  if (!text) return null;

  if (text.includes('.')) {
    if (text.includes(':')) return null;
    const dotted = parseIpv4(text);
    if (dotted !== null) return { value: dotted, form: '点分十进制' };
    const groups = text.split('.');
    // 二进制点分：10101011.00000001.1.1
    if (groups.length === 4 && groups.every((item) => /^[01]{1,8}$/.test(item))) {
      const value = groups.reduce((acc, item) => ((acc << 8) | Number.parseInt(item, 2)) >>> 0, 0);
      return { value: value >>> 0, form: '二进制（点分字节）' };
    }
    // 八进制点分：010.020.001.012（parseIpv4 会拒绝前导零，故放到这里处理）
    if (groups.length === 4 && groups.every((item) => /^[0-7]{1,3}$/.test(item))) {
      const value = groups.reduce((acc, item) => ((acc << 8) | Number.parseInt(item, 8)) >>> 0, 0);
      return { value: value >>> 0, form: '八进制（点分字节）' };
    }
    return null;
  }

  if (/^0x[0-9a-f]+$/i.test(text)) {
    const value = Number.parseInt(text.slice(2), 16);
    if (value >= 0 && value <= 0xffffffff) return { value: value >>> 0, form: '十六进制（0x 前缀）' };
    return null;
  }
  if (/^0b[01]+$/i.test(text)) {
    const value = Number.parseInt(text.slice(2), 2);
    if (value <= 0xffffffff) return { value: value >>> 0, form: '二进制（0b 前缀）' };
    return null;
  }
  if (/^0o[0-7]+$/i.test(text)) {
    const value = Number.parseInt(text.slice(2), 8);
    if (value <= 0xffffffff) return { value: value >>> 0, form: '八进制（0o 前缀）' };
    return null;
  }
  if (/^[01]{8,32}$/.test(text)) {
    return { value: Number.parseInt(text, 2) >>> 0, form: '二进制（32 位以内）' };
  }
  if (/^0[0-7]+$/.test(text)) {
    // 前导 0 的八进制，最长 11 位有效数字（3^11 > 2^32）
    const digits = text.replace(/^0+/, '');
    const value = digits ? Number.parseInt(digits, 8) : 0;
    if (value <= 0xffffffff) return { value: value >>> 0, form: '八进制（前导 0）' };
  }
  if (/^\d{1,10}$/.test(text)) {
    const value = Number(text);
    if (value <= 0xffffffff) return { value: value >>> 0, form: '十进制整数' };
    return null;
  }
  // 无前缀的十六进制：长度不超过 8 且含 a-f
  if (/^[0-9a-f]{1,8}$/i.test(text) && /[a-f]/i.test(text)) {
    return { value: Number.parseInt(text, 16) >>> 0, form: '十六进制（无前缀）' };
  }
  return null;
}

function toBinaryGrouped(value: number): string {
  return [24, 16, 8, 0].map((shift) => ((value >>> shift) & 0xff).toString(2).padStart(8, '0')).join('.');
}

/** Wireshark 中把 32 位地址放进 64 位字段时的冒号十六进制写法。 */
function toHexColons(value: number): string {
  const bytes = [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff);
  return [...bytes, 0, 0, 0, 0].map((byte) => byte.toString(16).toUpperCase()).join(':');
}

function toArpa(value: number): string {
  return `${[0, 8, 16, 24].map((shift) => (value >>> shift) & 0xff).join('.')}.in-addr.arpa`;
}

function signed32(value: number): number {
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function flagsNotes(value: number): { tone: NoteTone; title: string; text: string }[] {
  const flags = ipFlags(value);
  const ipClass = classifyIpv4(value);
  const notes: { tone: NoteTone; title: string; text: string }[] = [];
  if (flags.private)
    notes.push({
      tone: 'info',
      title: '私有地址',
      text: `${formatIpv4(value)} 属于 RFC 1918 私有地址，不能在公网路由。`,
    });
  if (flags.loopback)
    notes.push({ tone: 'info', title: '环回地址', text: '127.0.0.0/8 为环回地址，出方向流量会直接回到本机。' });
  if (flags.multicast)
    notes.push({ tone: 'info', title: '组播地址', text: '224.0.0.0/4 为组播地址，第一字节最低位为 1。' });
  if (flags.linkLocal)
    notes.push({
      tone: 'warn',
      title: '链路本地地址',
      text: '169.254.0.0/16 由 APIPA 自动分配，通常意味着 DHCP 未成功。',
    });
  if (flags.documentation)
    notes.push({ tone: 'info', title: '文档示例地址', text: '192.0.2.0/24 为 RFC 5737 保留给文档示例。' });
  if (flags.reserved)
    notes.push({ tone: 'warn', title: '保留地址', text: '240.0.0.0/4 为 IANA 保留地址，不可分配使用。' });
  if (flags.broadcast) notes.push({ tone: 'warn', title: '受限广播地址', text: '255.255.255.255 不会被路由器转发。' });
  notes.push({ tone: 'info', title: 'classful 参考', text: `${ipClass.name} ${ipClass.range} — ${ipClass.note}` });
  return notes;
}

function buildText(value: number, form: string): string {
  const rows: [string, string][] = [
    ['点分十进制', formatIpv4(value)],
    ['十进制整数（无符号）', String(value)],
    ['十进制整数（有符号）', String(signed32(value))],
    ['十六进制（0x 前缀）', `0x${value.toString(16).padStart(8, '0').toUpperCase()}`],
    ['十六进制（纯 hex）', value.toString(16).toUpperCase()],
    ['八进制', (value >>> 0).toString(8)],
    ['二进制（32 位点分）', toBinaryGrouped(value)],
    ['十六进制冒号形式（Wireshark 风格）', toHexColons(value)],
    ['反向域名（DNS 指针顺序）', toArpa(value)],
    ['输入形式', form],
  ];
  return rows.map(([key, text]) => `${key}：${text}`).join('\n');
}

const PRESETS = [
  '192.168.1.10',
  '8.8.8.8',
  '10.0.0.1',
  '0xC0A8010A',
  '3232235786',
  '11000000.10101000.00000001.00001010',
];

function Ipv4Detail({ value, form }: { value: number; form: string }) {
  const text = useMemo(() => buildText(value, form), [value, form]);
  return (
    <>
      <StatGrid>
        <Stat label="点分十进制" value={formatIpv4(value)} />
        <Stat label="识别形式" value={form} />
        <Stat label="十进制（无符号）" value={value} hint="0 ~ 4294967295" />
        <Stat
          label="十进制（有符号）"
          value={signed32(value)}
          tone={signed32(value) < 0 ? 'warn' : 'info'}
          hint="超过 2^31-1 时为负"
        />
        <Stat label="十六进制" value={`0x${value.toString(16).padStart(8, '0').toUpperCase()}`} />
        <Stat label="八进制" value={(value >>> 0).toString(8)} />
        <Stat label="二进制（点分）" value={toBinaryGrouped(value)} />
        <Stat label="冒号十六进制" value={toHexColons(value)} hint="后 4 组为 0 填充" />
      </StatGrid>

      <Section title="反向与派生表示">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
            <p className="text-muted-foreground">反向域名（in-addr.arpa）</p>
            <p className="break-all font-mono text-xs">{toArpa(value)}</p>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
            <p className="text-muted-foreground">反转二进制（DNS 指针顺序）</p>
            <p className="break-all font-mono text-xs">
              {[0, 8, 16, 24].map((shift) => ((value >>> shift) & 0xff).toString(2).padStart(8, '0')).join('.')}
            </p>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
            <p className="text-muted-foreground">网络字节序（大端）字节</p>
            <p className="break-all font-mono text-xs">
              {[24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(' · ')}
            </p>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
            <p className="text-muted-foreground">地址归属</p>
            <p className="break-all font-mono text-xs">{classifyIpv4(value).name}</p>
          </div>
        </div>
      </Section>

      {flagsNotes(value).map((note) => (
        <Note key={note.title} tone={note.tone} title={note.title}>
          {note.text}
        </Note>
      ))}

      <ResultBox label="复制内容（多行文本）" value={text} rows="min-h-48" onCopy={() => copyText(text)} />
    </>
  );
}

export default function IpConvert() {
  const [tab, setTab] = useState<'convert' | 'reverse' | 'ipv6'>('convert');
  const [input, setInput] = useState('192.168.1.10');
  const [reverseInput, setReverseInput] = useState('3232235786');
  const [ipv6Input, setIpv6Input] = useState('fd12:3456:789a::1');

  const parsed = useMemo(() => parseFlexible(input), [input]);
  const reverse = useMemo(() => parseFlexible(reverseInput), [reverseInput]);
  const ipv6 = useMemo(() => parseIpv6(ipv6Input), [ipv6Input]);

  return (
    <ToolPanel
      title="IPv4 地址转换"
      description="点分十进制与整数、十六进制、八进制、二进制、DNS 反向域名互转"
      actions={
        <Tabs>
          <TabsList>
            <TabsTrigger active={tab === 'convert'} onClick={() => setTab('convert')}>
              地址转换
            </TabsTrigger>
            <TabsTrigger active={tab === 'reverse'} onClick={() => setTab('reverse')}>
              整数反解
            </TabsTrigger>
            <TabsTrigger active={tab === 'ipv6'} onClick={() => setTab('ipv6')}>
              IPv6 基础
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'convert' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Section title="输入" description="支持点分十进制、整数、0x 十六进制、0o 八进制、0b/纯二进制">
              <TextField
                label="IPv4 地址（多种写法均可）"
                value={input}
                onChange={setInput}
                placeholder="192.168.1.10"
                hint="自动识别输入形式"
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="outline"
                    className="font-mono"
                    onClick={() => setInput(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </Section>
            <Note tone="info" title="识别规则">
              含「.」先按点分十进制解析，失败再尝试二进制点分与八进制点分；带 0x/0b/0o 前缀按对应进制；纯 01 串 （8~32
              位）按二进制；前导 0 的数字按八进制；其余纯数字按十进制整数。存在多种合理解释时以上述优先级为准。
            </Note>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {parsed ? (
              <Ipv4Detail value={parsed.value} form={parsed.form} />
            ) : (
              <Note tone="danger" title="无法解析">
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className="size-3" />
                  请输入点分十进制地址、0~4294967295 的整数、0x/0b/0o 前缀数值或 32 位以内二进制。
                </span>
              </Note>
            )}
          </div>
        </div>
      )}

      {tab === 'reverse' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Section title="输入" description="粘贴整数、十六进制、八进制或二进制，反查点分十进制">
              <TextField label="数值" value={reverseInput} onChange={setReverseInput} placeholder="3232235786" />
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => {
                  if (parsed) setReverseInput(String(parsed.value));
                }}
                disabled={!parsed}
              >
                <ArrowLeftRight className="size-3.5" />
                用上一页结果填充
              </Button>
            </Section>
            <Note tone="info" title="与「地址转换」的区别">
              本页只做「数值 → 地址」方向的还原，适合从数据库、配置文件的整数型 IP、或者抓包里的十六进制字段反查地址。
            </Note>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {reverse ? (
              <Ipv4Detail value={reverse.value} form={reverse.form} />
            ) : (
              <Note tone="danger" title="无法解析">
                请输入十进制整数、0x 十六进制、0o 八进制或 32 位以内二进制串。
              </Note>
            )}
          </div>
        </div>
      )}

      {tab === 'ipv6' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Section title="输入 IPv6 地址" description="支持 :: 压缩、内嵌 IPv4、zone id 与方括号">
              <TextField label="IPv6 地址" value={ipv6Input} onChange={setIpv6Input} placeholder="fd12:3456:789a::1" />
              <div className="flex flex-wrap gap-1.5">
                {['fe80::1', '2001:db8::8a2e:370:7334', '::ffff:127.0.0.1', 'ff02::1', '64:ff9b::1.2.3.4'].map(
                  (preset) => (
                    <Button
                      key={preset}
                      size="sm"
                      variant="outline"
                      className="font-mono"
                      onClick={() => setIpv6Input(preset)}
                    >
                      {preset}
                    </Button>
                  ),
                )}
              </div>
            </Section>
            <Note tone="info" title="更多 IPv6 工具">
              IPv6 的 ULA 生成、地址展开与特殊地址速查见「IPv6 ULA 生成」工具。
            </Note>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {ipv6 ? (
              <>
                <StatGrid>
                  <Stat label="压缩形式" value={formatIpv6(ipv6)} />
                  <Stat label="地址类型" value={classifyIpv6(ipv6).name} />
                  <Stat label="前缀" value={classifyIpv6(ipv6).prefix} />
                  <Stat label=":: 压缩位置" value={ipv6ZeroRun(ipv6) ? `第 ${ipv6ZeroRun(ipv6)?.start} 组起` : '无'} />
                </StatGrid>
                <Section title="分组明细">
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">下标</th>
                          <th className="px-2 py-1.5 text-left font-medium">十六进制</th>
                          <th className="px-2 py-1.5 text-right font-medium">十进制</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {ipv6GroupTable(ipv6).map((row) => (
                          <tr key={row.index} className="border-t">
                            <td className="px-2 py-1 text-muted-foreground">{row.index}</td>
                            <td className="px-2 py-1">0x{row.hex}</td>
                            <td className="px-2 py-1 text-right">{row.decimal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
                <Note tone="info" title={classifyIpv6(ipv6).name}>
                  {classifyIpv6(ipv6).note}
                  {classifyIpv6(ipv6).embeddedIpv4 ? `内嵌 IPv4：${classifyIpv6(ipv6).embeddedIpv4}` : ''}
                </Note>
                <ResultBox
                  label="完整形式 / 展开形式 / 反向域名"
                  value={[
                    `完整形式：${formatIpv6(ipv6, 'full')}`,
                    `展开形式：${formatIpv6(ipv6, 'expanded')}`,
                    `字节点分：${formatIpv6(ipv6, 'bytes')}`,
                    `反向域名：${ip6ArpaDomain(ipv6)}`,
                    `地址类型：${classifyIpv6(ipv6).name}（${classifyIpv6(ipv6).prefix}）`,
                  ].join('\n')}
                  rows="min-h-32"
                  onCopy={() =>
                    copyText(
                      [
                        `压缩形式：${formatIpv6(ipv6)}`,
                        `完整形式：${formatIpv6(ipv6, 'full')}`,
                        `展开形式：${formatIpv6(ipv6, 'expanded')}`,
                        `反向域名：${ip6ArpaDomain(ipv6)}`,
                      ].join('\n'),
                    )
                  }
                />
              </>
            ) : (
              <Note tone="danger" title="无法解析">
                <span className="inline-flex items-center gap-1">
                  <Network className="size-3" />
                  请输入合法的 IPv6 地址，例如 fd12:3456:789a::1；不支持的写法包括多个 ::、超过 8 个分组。
                </span>
              </Note>
            )}
          </div>
        </div>
      )}

      <Note tone="info" title="关于有符号解释">
        <span className="inline-flex items-center gap-1">
          <Binary className="size-3" />
          IPv4 地址本质是 32 位无符号整数；但部分系统（C 语言、Java 的 int、MySQL 的 INT）按有符号解释， 因此 128.0.0.0
          以上的地址会显示为负数。
        </span>
      </Note>
    </ToolPanel>
  );
}
