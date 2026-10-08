import { AlertTriangle, Layers, Network, Ruler, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { NumberField, Select, TextField } from '../components/ui/field';
import { Note, type NoteTone, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { classifyIpv4, describeSubnet, formatIpv4, ipFlags, parseCidr, parseIpv4, prefixFromMask } from '../lib/ipv4';

type Mode = 'cidr' | 'mask';

const EXAMPLES = ['192.168.1.0/24', '10.0.0.0/8', '172.16.5.10/20', '172.16.0.0/12'];

/** 容纳 hosts 台主机所需的最短前缀（扣掉网络号与广播地址）。 */
function suggestPrefix(hosts: number): number {
  const need = Math.max(2, Math.floor(hosts) + 2);
  let bits = 0;
  while (2 ** bits < need) bits += 1;
  return Math.max(0, 32 - bits);
}

interface Notice {
  tone: NoteTone;
  title: string;
  text: string;
}

/** 针对网段与地址给出特殊用途提示。 */
function specialNotices(network: number, prefix: number, entryAddress: number): Notice[] {
  const notices: Notice[] = [];
  const info = describeSubnet(network, prefix);
  const broadcast = info.broadcast;
  const sample = formatIpv4(entryAddress);
  const add = (tone: NoteTone, title: string, text: string) => notices.push({ tone, title, text });

  if (prefix === 31) add('warn', 'RFC 3021 点对点链路', '/31 的两个地址都可直接使用，常见于路由接口与隧道配置。');
  if (prefix === 32) add('info', '主机路由', '/32 只表示单个地址，不会自动带上网关或网络号。');
  if (prefix <= 8) add('warn', '前缀过短', `/0 ~ /${prefix} 的网段非常大，实际配置中极易与既有路由冲突。`);

  const first = sample.split('.').map(Number) as [number, number, number, number];
  const second = formatIpv4(network).split('.').map(Number) as [number, number, number, number];

  if (second[0] === 169 && second[1] === 254)
    add('warn', '链路本地地址', '169.254.0.0/16 由 APIPA 自动分配，不能作为路由或网关使用。');
  if (second[0] === 100 && second[1] >= 64 && second[1] <= 127)
    add('info', '运营商级 NAT', '100.64.0.0/10 为 RFC 6598 共享地址段，家庭宽带与部分云内网常用。');
  if (second[0] === 192 && second[1] === 0 && second[2] === 2)
    add('info', '文档示例地址', '192.0.2.0/24 是 RFC 5737 保留给文档示例的网段。');
  if (second[0] === 192 && second[1] === 0 && second[2] === 0)
    add('info', 'IANA 协议保留', '192.0.0.0/24 保留给 IETF 协议用途，例如 192.0.0.170/171 是 DNS 探测地址。');
  if (second[0] === 198 && (second[1] === 18 || second[1] === 19))
    add('info', '基准测试网段', '198.18.0.0/15 供 RFC 2544 性能测试使用，不要部署真实业务。');
  if (second[0] === 224 && second[1] <= 4)
    add('info', '组播地址', '224.0.0.0/4 为组播地址，没有网络号/广播地址的概念。');
  if (prefix >= 24 && prefix < 30 && info.usableHosts > 0)
    add('info', '可用主机少', `该网段仅有 ${info.usableHosts} 个可用地址，注意网关与预留地址占用。`);
  if (prefix === 30) add('warn', '仅 2 台主机', '/30 常见于点对点互联，正式配置中建议改用 /31。');
  if (broadcast === 0xffffffff) add('warn', '包含受限广播', '网段覆盖了 255.255.255.255 受限广播地址。');
  if (
    first[0] === 10 ||
    (first[0] === 172 && first[1] >= 16 && first[1] <= 31) ||
    (first[0] === 192 && first[1] === 168)
  )
    add('success', '私有地址', `${sample} 属于 RFC 1918 私有地址，不能在公网路由。`);
  return notices;
}

/** 汇总多个 CIDR 为最小超网，并标出重叠部分。 */
interface Aggregation {
  supernets: string[];
  overlaps: string[];
  smallest: string | null;
  wasted: number;
}

function aggregateCidrs(input: string): Aggregation | { error: string } {
  const lines = input
    .split(/[\n,;\s]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: '请至少输入一个 CIDR，例如 10.1.1.0/24' };

  const parsed: { address: number; prefix: number; text: string }[] = [];
  for (const line of lines) {
    const cidr = parseCidr(line);
    if (!cidr) return { error: `「${line}」不是合法的 CIDR` };
    const info = describeSubnet(cidr.address, cidr.prefix);
    parsed.push({ address: info.network, prefix: cidr.prefix, text: `${formatIpv4(info.network)}/${cidr.prefix}` });
  }

  const overlaps: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      if (!a || !b) continue;
      const short = Math.min(a.prefix, b.prefix);
      const mask = short === 0 ? 0 : (0xffffffff << (32 - short)) >>> 0;
      if ((a.address & mask) >>> 0 === (b.address & mask) >>> 0 && a.prefix !== b.prefix)
        overlaps.push(`${a.text} 与 ${b.text} 相互包含（前者/后者为子集）`);
    }
  }

  // 由细到粗合并：同级相邻且同前缀的两块可合并为上一级超网。
  const pool = [...parsed];
  let merged = true;
  while (merged) {
    merged = false;
    for (let prefix = 32; prefix > 0; prefix--) {
      const group = pool.filter((item) => item.prefix === prefix).sort((a, b) => a.address - b.address);
      if (group.length < 2) continue;
      const rest = pool.filter((item) => item.prefix !== prefix);
      const next: typeof pool = [];
      let index = 0;
      while (index < group.length) {
        const current = group[index];
        const follower = group[index + 1];
        if (current && follower && current.address + 2 ** (32 - prefix) === follower.address) {
          next.push({
            address: current.address,
            prefix: prefix - 1,
            text: `${formatIpv4(current.address)}/${prefix - 1}`,
          });
          index += 2;
          merged = true;
          continue;
        }
        if (current) next.push(current);
        index += 1;
      }
      pool.length = 0;
      pool.push(...next, ...rest);
    }
  }

  const sizes = pool.map((item) => 2 ** (32 - item.prefix));
  const smallestPrefix = sizes.reduce((max, size, index) => {
    const item = pool[index];
    return item && size > 2 ** (32 - max) ? item.prefix : max;
  }, 0);
  const smallestItem = pool.find((item) => item.prefix === smallestPrefix);
  const totalInput = parsed.reduce((sum, item) => sum + 2 ** (32 - item.prefix), 0);
  const totalOutput = sizes.reduce((sum, size) => sum + size, 0);

  return {
    supernets: pool
      .map((item) => `${formatIpv4(item.address)}/${item.prefix}`)
      .sort((a, b) => a.length - b.length || a.localeCompare(b)),
    overlaps: [...new Set(overlaps)],
    smallest: smallestItem ? `${formatIpv4(smallestItem.address)}/${smallestItem.prefix}` : null,
    wasted: Math.max(0, totalOutput - totalInput),
  };
}

function buildSummary(address: number, prefix: number): string {
  const info = describeSubnet(address, prefix);
  const flags = ipFlags(info.network);
  const ipClass = classifyIpv4(info.network);
  const rows: [string, string][] = [
    ['输入地址', formatIpv4(address)],
    ['CIDR', `${formatIpv4(info.network)}/${prefix}`],
    ['网络地址', formatIpv4(info.network)],
    ['广播地址', formatIpv4(info.broadcast)],
    ['可用主机范围', `${formatIpv4(info.firstHost)} - ${formatIpv4(info.lastHost)}`],
    ['可用主机数', String(info.usableHosts)],
    ['总地址数', String(info.totalAddresses)],
    ['子网掩码', formatIpv4(info.netmask)],
    ['反掩码 (Wildcard)', formatIpv4(info.wildcard)],
    ['前缀长度', `/${prefix}`],
    ['网络类型（classful 参考）', `${ipClass.name} ${ipClass.range} — ${ipClass.note}`],
    ['私有地址', flags.private ? '是' : '否'],
    ['环回地址', flags.loopback ? '是' : '否'],
    ['组播地址', flags.multicast ? '是' : '否'],
    ['链路本地', flags.linkLocal ? '是' : '否'],
    ['文档示例地址', flags.documentation ? '是' : '否'],
    ['保留地址', flags.reserved ? '是' : '否'],
  ];
  return rows.map(([key, value]) => `${key}：${value}`).join('\n');
}

export default function Ipv4Subnet() {
  const [tab, setTab] = useState<'detail' | 'split' | 'aggregate'>('detail');
  const [mode, setMode] = useState<Mode>('cidr');
  const [cidrInput, setCidrInput] = useState('192.168.1.0/24');
  const [addressInput, setAddressInput] = useState('172.16.5.10');
  const [maskInput, setMaskInput] = useState('255.255.240.0');

  const [splitCidr, setSplitCidr] = useState('10.0.0.0/16');
  const [splitMode, setSplitMode] = useState<'hosts' | 'prefix'>('hosts');
  const [hosts, setHosts] = useState(50);
  const [splitPrefix, setSplitPrefix] = useState(26);
  const [limit, setLimit] = useState(64);

  const [aggregateInput, setAggregateInput] = useState('192.168.0.0/25\n192.168.0.128/25\n10.0.0.0/8\n192.168.1.5/32');

  const detail = useMemo<{ ok: true; address: number; prefix: number } | { ok: false; error: string }>(() => {
    if (mode === 'cidr') {
      const cidr = parseCidr(cidrInput);
      if (!cidr) return { ok: false, error: '请输入合法 CIDR，例如 192.168.1.0/24（省略 / 时按 /32 处理）' };
      return { ok: true, address: cidr.address, prefix: cidr.prefix };
    }
    const address = parseIpv4(addressInput);
    if (address === null) return { ok: false, error: '请输入合法点分十进制地址，例如 172.16.5.10' };
    const mask = parseIpv4(maskInput);
    if (mask === null) return { ok: false, error: '请输入合法子网掩码，例如 255.255.255.0' };
    const prefix = prefixFromMask(mask);
    if (prefix === null) return { ok: false, error: '子网掩码必须由连续的 1 后接连续的 0 组成（例如 255.255.255.0）' };
    return { ok: true, address, prefix };
  }, [mode, cidrInput, addressInput, maskInput]);

  const split = useMemo(() => {
    const cidr = parseCidr(splitCidr);
    if (!cidr) return { ok: false as const, error: '请输入合法 CIDR，例如 10.0.0.0/16' };
    const base = describeSubnet(cidr.address, cidr.prefix);
    const target = splitMode === 'hosts' ? suggestPrefix(hosts) : Math.max(0, Math.min(32, Math.floor(splitPrefix)));
    if (target < base.prefix)
      return { ok: false as const, error: `目标前缀 /${target} 比原网段 /${base.prefix} 更粗，会放大网段范围` };
    const count = 2 ** (target - base.prefix);
    const cap = Math.max(1, Math.min(1024, Math.floor(limit) || 1));
    const rows = Math.min(count, cap);
    const list = Array.from({ length: rows }, (_, index) =>
      describeSubnet(base.network + index * 2 ** (32 - target), target),
    );
    return {
      ok: true as const,
      base,
      target,
      count,
      cap,
      list,
      truncated: count > rows,
      targetHosts: Math.max(0, 2 ** (32 - target) - 2),
    };
  }, [splitCidr, splitMode, hosts, splitPrefix, limit]);

  const aggregation = useMemo(() => aggregateCidrs(aggregateInput), [aggregateInput]);

  const detailInfo = detail.ok ? describeSubnet(detail.address, detail.prefix) : null;
  const detailFlags = detail.ok ? ipFlags(detail.address) : null;
  const detailClass = detail.ok ? classifyIpv4(detail.address) : null;

  return (
    <ToolPanel
      title="IPv4 子网计算"
      description="CIDR 与掩码互算、等长子网划分、多个网段合并为最小超网"
      actions={
        <Tabs>
          <TabsList>
            <TabsTrigger active={tab === 'detail'} onClick={() => setTab('detail')}>
              网段详情
            </TabsTrigger>
            <TabsTrigger active={tab === 'split'} onClick={() => setTab('split')}>
              子网划分
            </TabsTrigger>
            <TabsTrigger active={tab === 'aggregate'} onClick={() => setTab('aggregate')}>
              超网汇总
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'detail' && (
        <>
          <Section
            title="输入"
            description="支持 10.0.0.0/24 或「地址 + 子网掩码」两种写法"
            actions={
              <>
                <Tabs>
                  <TabsList>
                    <TabsTrigger active={mode === 'cidr'} onClick={() => setMode('cidr')}>
                      CIDR
                    </TabsTrigger>
                    <TabsTrigger active={mode === 'mask'} onClick={() => setMode('mask')}>
                      地址 + 掩码
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="清空输入"
                  onClick={() => {
                    setCidrInput('');
                    setAddressInput('');
                    setMaskInput('');
                  }}
                >
                  清空
                </Button>
              </>
            }
          >
            {mode === 'cidr' ? (
              <TextField
                label="网段（CIDR）"
                value={cidrInput}
                onChange={setCidrInput}
                placeholder="192.168.1.0/24"
                hint="可直接粘贴主机地址，会自动回退到所属网段"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="IP 地址"
                  value={addressInput}
                  onChange={setAddressInput}
                  placeholder="172.16.5.10"
                  hint="支持主机地址或网络地址"
                />
                <TextField
                  label="子网掩码"
                  value={maskInput}
                  onChange={setMaskInput}
                  placeholder="255.255.255.0"
                  hint="必须是连续的 1 后接连续的 0"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">示例</span>
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  size="sm"
                  variant="outline"
                  className="font-mono"
                  onClick={() => setCidrInput(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
            {detail.ok && detailInfo && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">等价前缀</span>
                {Array.from({ length: 8 }, (_, index) => index * 4).map((prefix) => (
                  <Button
                    key={prefix}
                    size="sm"
                    variant={detail.prefix === prefix ? 'secondary' : 'ghost'}
                    className="font-mono"
                    onClick={() => setCidrInput(`${formatIpv4(detailInfo.network)}/${prefix}`)}
                  >
                    /{prefix}
                  </Button>
                ))}
              </div>
            )}
          </Section>

          {detail.ok && detailInfo && detailFlags && detailClass && (
            <>
              <Section title="结果概览">
                <StatGrid>
                  <Stat label="网络地址" value={formatIpv4(detailInfo.network)} hint={`CIDR /${detail.prefix}`} />
                  <Stat label="广播地址" value={formatIpv4(detailInfo.broadcast)} />
                  <Stat label="可用主机数" value={detailInfo.usableHosts} hint="已扣除网络号与广播" />
                  <Stat label="总地址数" value={detailInfo.totalAddresses} />
                  <Stat
                    label="可用主机范围"
                    value={`${formatIpv4(detailInfo.firstHost)} →`}
                    hint={formatIpv4(detailInfo.lastHost)}
                  />
                  <Stat label="子网掩码" value={formatIpv4(detailInfo.netmask)} />
                  <Stat label="反掩码" value={formatIpv4(detailInfo.wildcard)} hint="ACL 通配符" />
                  <Stat label="前缀长度" value={`/${detail.prefix}`} />
                </StatGrid>
              </Section>

              <Section title="结构解析">
                <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                  {[
                    ['输入地址', formatIpv4(detail.address)],
                    ['归属网段', `${formatIpv4(detailInfo.network)}/${detail.prefix}`],
                    ['网络类型（classful 参考）', `${detailClass.name} ${detailClass.range}`],
                    ['类型说明', detailClass.note],
                    ['是否私有地址（RFC 1918）', detailFlags.private ? '是' : '否'],
                    ['是否环回地址', detailFlags.loopback ? '是' : '否'],
                    ['是否组播地址', detailFlags.multicast ? '是' : '否'],
                    ['是否链路本地', detailFlags.linkLocal ? '是' : '否'],
                    ['是否受限广播', detailFlags.broadcast ? '是' : '否'],
                    ['是否文档示例地址', detailFlags.documentation ? '是' : '否'],
                    ['是否保留地址', detailFlags.reserved ? '是' : '否'],
                  ].map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                      <dt className="w-44 shrink-0 text-muted-foreground">{key}</dt>
                      <dd className="min-w-0 break-all font-mono text-xs">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section>
                {specialNotices(detailInfo.network, detail.prefix, detail.address).map((notice) => (
                  <Note key={notice.title} tone={notice.tone} title={notice.title}>
                    {notice.text}
                  </Note>
                ))}

                <ResultBox
                  label="复制内容（多行文本）"
                  value={buildSummary(detail.address, detail.prefix)}
                  rows="min-h-56"
                  onCopy={() => copyText(buildSummary(detail.address, detail.prefix))}
                />
              </Section>
            </>
          )}
          {!detail.ok && <ResultBox label="输出" error={detail.error} rows="min-h-16" />}
        </>
      )}

      {tab === 'split' && (
        <>
          <Section
            title="划分条件"
            description="按每子网主机数或直接指定目标前缀等分原网段"
            actions={<ClearButton onClick={() => setSplitCidr('')} disabled={!splitCidr} />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="原网段" value={splitCidr} onChange={setSplitCidr} placeholder="10.0.0.0/16" />
              <Select
                label="划分方式"
                value={splitMode}
                onChange={(value) => setSplitMode(value as 'hosts' | 'prefix')}
                options={[
                  { value: 'hosts', label: '按每子网主机数（自动建议前缀）' },
                  { value: 'prefix', label: '直接指定目标前缀' },
                ]}
                hint={
                  splitMode === 'hosts' ? `N 台主机至少需要 ${suggestPrefix(hosts)} 位前缀` : '将从原前缀切分到目标前缀'
                }
              />
              {splitMode === 'hosts' ? (
                <NumberField
                  label="每子网主机数"
                  value={hosts}
                  onChange={setHosts}
                  min={1}
                  max={65534}
                  suffix="台"
                  hint={`自动建议前缀 /${suggestPrefix(hosts)}（需 2^bits ≥ 主机数 + 2）`}
                />
              ) : (
                <NumberField
                  label="目标前缀"
                  value={splitPrefix}
                  onChange={setSplitPrefix}
                  min={0}
                  max={32}
                  suffix="位"
                  hint="前缀越长子网越小"
                />
              )}
              <NumberField
                label="最多显示子网数"
                value={limit}
                onChange={setLimit}
                min={1}
                max={1024}
                suffix="条"
                hint="防爆炸上限，超出部分会提示截断"
              />
            </div>
          </Section>

          {split.ok ? (
            <>
              <StatGrid>
                <Stat
                  label="原网段"
                  value={`${formatIpv4(split.base.network)}/${split.base.prefix}`}
                  hint={`可用 ${split.base.usableHosts} 个地址`}
                />
                <Stat label="目标前缀" value={`/${split.target}`} hint={`每子网 ${split.targetHosts} 个可用地址`} />
                <Stat label="子网总数" value={split.count} />
                <Stat label="已列出" value={split.list.length} hint={split.truncated ? '已截断' : '完整'} />
              </StatGrid>
              {split.truncated && (
                <Note tone="warn" title="结果已截断">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="size-3" />
                    实际子网数为 {split.count}，超过上限 {split.cap}；请调高上限或增大前缀长度后重试。
                  </span>
                </Note>
              )}
              <Section title="子网列表">
                <div className="max-h-72 overflow-auto scrollbar-thin rounded-md border">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">序号</th>
                        <th className="px-2 py-1.5 text-left font-medium">网络地址</th>
                        <th className="px-2 py-1.5 text-left font-medium">CIDR</th>
                        <th className="px-2 py-1.5 text-left font-medium">掩码</th>
                        <th className="px-2 py-1.5 text-left font-medium">可用范围</th>
                        <th className="px-2 py-1.5 text-right font-medium">主机数</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {split.list.map((item, rowIndex) => (
                        <tr key={formatIpv4(item.network)} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground">{rowIndex + 1}</td>
                          <td className="px-2 py-1">{formatIpv4(item.network)}</td>
                          <td className="px-2 py-1">
                            {formatIpv4(item.network)}/{split.target}
                          </td>
                          <td className="px-2 py-1">{formatIpv4(item.netmask)}</td>
                          <td className="px-2 py-1">
                            {formatIpv4(item.firstHost)} - {formatIpv4(item.lastHost)}
                          </td>
                          <td className="px-2 py-1 text-right">{item.usableHosts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          ) : (
            <Note tone="danger" title="无法划分">
              {split.error}
            </Note>
          )}
        </>
      )}

      {tab === 'aggregate' && (
        <>
          <Section
            title="待汇总的网段"
            description="每行一个 CIDR，粘贴 IPAM 导出的地址池即可"
            actions={<ClearButton onClick={() => setAggregateInput('')} disabled={!aggregateInput} />}
          >
            <Textarea
              value={aggregateInput}
              onChange={(event) => setAggregateInput(event.target.value)}
              placeholder={'192.168.0.0/25\n192.168.0.128/25\n10.0.0.0/8'}
              spellCheck={false}
              className="min-h-28 resize-none font-mono text-xs"
            />
          </Section>

          {'error' in aggregation ? (
            <Note tone="danger" title="解析失败">
              {aggregation.error}
            </Note>
          ) : (
            <>
              <StatGrid>
                <Stat label="合并后网段数" value={aggregation.supernets.length} />
                <Stat label="最小超网" value={aggregation.smallest ?? '—'} hint="覆盖全部输入的最粗网段" />
                <Stat
                  label="重叠项"
                  value={aggregation.overlaps.length}
                  tone={aggregation.overlaps.length ? 'warn' : 'info'}
                />
                <Stat
                  label="多覆盖地址数"
                  value={aggregation.wasted}
                  tone={aggregation.wasted > 0 ? 'warn' : 'info'}
                  hint="聚合后多包含的地址"
                />
              </StatGrid>

              <Section title="路由聚合结果">
                {aggregation.supernets.map((cidr) => {
                  const parsed = parseCidr(cidr);
                  const info = parsed ? describeSubnet(parsed.address, parsed.prefix) : null;
                  return (
                    <div
                      key={cidr}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <Network className="size-3.5 text-muted-foreground" />
                      <span className="font-mono">{cidr}</span>
                      {info && (
                        <span className="text-muted-foreground">
                          掩码 {formatIpv4(info.netmask)} · 可用主机 {info.usableHosts} · 广播{' '}
                          {formatIpv4(info.broadcast)}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => copyText(cidr)}
                        aria-label={`复制 ${cidr}`}
                      >
                        复制
                      </Button>
                    </div>
                  );
                })}
              </Section>

              {aggregation.overlaps.length > 0 && (
                <Note tone="warn" title="存在重叠网段">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {aggregation.overlaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Note>
              )}
              {aggregation.wasted > 0 && (
                <Note tone="warn" title="聚合会放大地址范围">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-3" />
                    合并为最小超网会多覆盖 {aggregation.wasted} 个地址，路由上等价但会占用更大的转发范围。
                  </span>
                </Note>
              )}
              <Note tone="info" title="合并规则">
                <span className="inline-flex items-center gap-1">
                  <Ruler className="size-3" />
                  仅合并「同一前缀且地址连续」的相邻网段，自底向上逐级收缩；重叠但不相邻的网段不会被强行合并。
                </span>
              </Note>
            </>
          )}
        </>
      )}

      <Note tone="info" title="关于 classful 参考">
        <span className="inline-flex items-center gap-1">
          <Wand2 className="size-3" />
          A/B/C 类划分（CIDR 之前的历史概念）早已废弃，此处仅作对照参考；实际网络一律按 CIDR 前缀理解。
        </span>
      </Note>
    </ToolPanel>
  );
}
