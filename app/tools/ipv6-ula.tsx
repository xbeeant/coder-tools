import { Copy, Fingerprint, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  bytesFromEui64,
  classifyIpv6,
  eui64FromBytes,
  formatIpv6,
  generateUla,
  IPV6_SPECIAL,
  interfaceIdOf,
  ip6ArpaDomain,
  ipv6GroupTable,
  ipv6ZeroRun,
  linkLocalAddress,
  parseIpv6,
  randomHex,
} from '../lib/ipv6';
import { parseMac } from '../lib/mac';

type IidMode = 'random' | 'eui64' | 'custom';

export default function Ipv6Ula() {
  const [tab, setTab] = useState<'ula' | 'expand' | 'special'>('ula');

  const [subnetId, setSubnetId] = useState(12);
  const [globalId, setGlobalId] = useState('');
  const [iidMode, setIidMode] = useState<IidMode>('random');
  const [macInput, setMacInput] = useState('00:1B:44:11:3A:B7');
  const [customIid, setCustomIid] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [expandInput, setExpandInput] = useState('fd12:3456:789a::1');

  const macResult = useMemo(() => parseMac(macInput), [macInput]);
  const customIidGroups = useMemo(() => (customIid.trim() ? parseIpv6(customIid.trim()) : null), [customIid]);

  const ula = useMemo(() => {
    // 随机模式靠 refreshKey 触发重新生成，其余参数变化也会重新计算
    void refreshKey;
    const options: Parameters<typeof generateUla>[1] = {};
    if (globalId.trim()) options.globalId = globalId.trim();
    if (iidMode === 'random') options.interfaceId = null;
    if (iidMode === 'eui64' && macResult.ok) options.fromMac = macResult.bytes;
    if (iidMode === 'custom' && customIidGroups) options.interfaceId = customIidGroups.slice(-4);
    if (iidMode === 'eui64' && !macResult.ok) options.interfaceId = null;
    if (iidMode === 'custom' && !customIidGroups) options.interfaceId = null;
    return generateUla(subnetId, options);
  }, [subnetId, globalId, iidMode, macResult, customIidGroups, refreshKey]);

  const macEui = macResult.ok ? eui64FromBytes(macResult.bytes) : null;
  const linkLocal = linkLocalAddress(ula.interfaceId);
  const expanded = useMemo(() => parseIpv6(expandInput), [expandInput]);

  const regenerate = () => {
    setGlobalId(randomHex(40));
    setRefreshKey((value) => value + 1);
  };

  return (
    <ToolPanel
      title="IPv6 ULA 生成"
      description="按 RFC 4193 生成 fd00::/8 唯一本地地址、链路本地与组播地址，并做地址展开"
      actions={
        <Tabs>
          <TabsList>
            <TabsTrigger active={tab === 'ula'} onClick={() => setTab('ula')}>
              ULA 生成
            </TabsTrigger>
            <TabsTrigger active={tab === 'expand'} onClick={() => setTab('expand')}>
              地址展开
            </TabsTrigger>
            <TabsTrigger active={tab === 'special'} onClick={() => setTab('special')}>
              特殊地址
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'ula' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section
              title="生成参数"
              description="fd + 40 位全局 ID + 16 位子网 ID + 64 位接口标识"
              actions={
                <Button size="sm" variant="outline" onClick={regenerate}>
                  <RefreshCw className="size-3.5" />
                  重新生成
                </Button>
              }
            >
              <NumberField
                label="Subnet ID"
                value={subnetId}
                onChange={setSubnetId}
                min={0}
                max={255}
                suffix="0x00 ~ 0xff"
                hint={`决定第 4 个分组，当前为 0x${subnetId.toString(16).padStart(2, '0').toUpperCase()}`}
              />
              <TextField
                label="Global ID（40 位十六进制，留空则随机）"
                value={globalId}
                onChange={setGlobalId}
                placeholder="随机生成"
                hint="RFC 4193 要求全局 ID 随机挑选，避免与他人冲突"
              />
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">接口标识（Interface ID）来源</span>
                <div className="flex flex-wrap gap-3">
                  <Checkbox label="随机生成" checked={iidMode === 'random'} onChange={() => setIidMode('random')} />
                  <Checkbox
                    label="EUI-64（由 MAC 派生）"
                    checked={iidMode === 'eui64'}
                    onChange={() => setIidMode('eui64')}
                  />
                  <Checkbox label="自定义" checked={iidMode === 'custom'} onChange={() => setIidMode('custom')} />
                </div>
              </div>
              {iidMode === 'eui64' && (
                <TextField
                  label="MAC 地址"
                  value={macInput}
                  onChange={setMacInput}
                  placeholder="00:1B:44:11:3A:B7"
                  hint={macResult.ok ? '已解析，将翻转 U/L 位并插入 ff:ff' : macResult.error}
                />
              )}
              {iidMode === 'custom' && (
                <TextField
                  label="自定义接口标识"
                  value={customIid}
                  onChange={setCustomIid}
                  placeholder="0000:0000:0000:0001 或 ::1"
                  hint={
                    customIid.trim() === ''
                      ? '留空时按随机处理'
                      : customIidGroups
                        ? `取低 64 位：${formatIpv6(customIidGroups.slice(-4))}`
                        : '无法解析，将回退为随机生成'
                  }
                />
              )}
            </Section>

            <Section title="生成结果">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">压缩形式</p>
                <p className="break-all font-mono text-sm">{ula.compressed}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <CopyBox label="完整形式" value={ula.full} />
                <CopyBox label="展开形式（每组 4 位）" value={ula.expanded} />
                <CopyBox label="字节点分" value={ula.bytes} />
                <CopyBox label="链路本地 fe80::/10" value={formatIpv6(linkLocal)} />
              </div>
              <ResultBox
                label="复制全部形式"
                value={[
                  `压缩形式：${ula.compressed}`,
                  `完整形式：${ula.full}`,
                  `展开形式：${ula.expanded}`,
                  `Prefix：${ula.prefix}00::/8`,
                  `Global ID：${ula.globalId}`,
                  `Subnet ID：${ula.subnetId}`,
                  `Interface ID：${formatIpv6(ula.interfaceId, 'full')}`,
                  `链路本地：${formatIpv6(linkLocal)}`,
                  `组播 - 所有节点：ff02::1`,
                  `组播 - 所有路由器：ff02::2`,
                ].join('\n')}
                rows="min-h-44"
                onCopy={() =>
                  copyText(
                    [
                      ula.compressed,
                      ula.full,
                      ula.expanded,
                      ula.bytes,
                      formatIpv6(linkLocal),
                      'ff02::1',
                      'ff02::2',
                    ].join('\n'),
                  )
                }
              />
            </Section>
          </div>

          <StatGrid>
            <Stat label="前缀" value="fd00::/8" hint="RFC 4193 唯一本地地址" />
            <Stat label="Global ID" value={ula.globalId} hint="40 位随机" />
            <Stat label="Subnet ID" value={`0x${ula.subnetId.toString(16).padStart(2, '0').toUpperCase()}`} />
            <Stat
              label="Interface ID"
              value={formatIpv6(ula.interfaceId, 'expanded')}
              hint={ula.fromEui64 ? 'EUI-64' : '随机 / 自定义'}
            />
          </StatGrid>

          <Section title="常用特殊地址">
            <div className="grid gap-2 sm:grid-cols-3">
              <CopyBox label="所有节点组播" value="ff02::1" />
              <CopyBox label="所有路由器组播" value="ff02::2" />
              <CopyBox label="本链路 DNS 组播" value="ff02::fb" />
            </div>
          </Section>

          {macEui && (
            <Section title="EUI-64 与隐私扩展">
              <div className="grid gap-2 sm:grid-cols-3">
                <CopyBox label="MAC" value={macResult.ok ? macResult.canonical : ''} />
                <CopyBox label="EUI-64 接口标识" value={formatIpv6(macEui)} />
                <CopyBox label="对应链路本地地址" value={formatIpv6(linkLocalAddress(macEui))} />
              </div>
              <Note tone="info" title="EUI-64 与隐私扩展">
                EUI-64 由 MAC 派生：翻转首字节的 U/L 位后在中间插入 ff:ff。缺点是接口标识稳定可追踪，
                移动到公共网络时会暴露硬件信息。RFC 4941 隐私扩展建议改用随机接口标识
                （本工具的「随机生成」模式），并在网络前缀变化时更换，以避免位置跟踪。
              </Note>
            </Section>
          )}

          <Note tone="warn" title="ULA 不会路由到公网">
            <span className="inline-flex items-start gap-1">
              <ShieldCheck className="size-3 shrink-0" />
              <span>
                ULA 相当于 IPv6 版的 RFC 1918 私有地址：只在本地网络内部使用，公网路由器不会转发 fd00::/8。 与 IPv4
                的差异是没有统一的「私网地址段」概念，任何 fdxx 段都算私有。Docker、WSL2、 OpenStack 的默认网段常用
                fd00::/8 或 fd12:3456:789a::/64，需要与内网 DNS、路由通告配合，
                不能假设它一定能被外部访问。若确实需要公网可达，请申请运营商或云厂商的 2000::/3 全球单播地址。
              </span>
            </span>
          </Note>
        </>
      )}

      {tab === 'expand' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="输入任意 IPv6 地址" description="压缩与完整形式互转，并给出分组明细与反向域名">
            <TextField
              label="IPv6 地址"
              value={expandInput}
              onChange={setExpandInput}
              placeholder="fd12:3456:789a::1"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                'fe80::1',
                '2001:db8::8a2e:370:7334',
                '::ffff:127.0.0.1',
                'ff02::2',
                '2002:c000:204::1',
                '64:ff9b::8.8.8.8',
              ].map((preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant="outline"
                  className="font-mono"
                  onClick={() => setExpandInput(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </Section>

          {expanded ? (
            <Section title="解析结果">
              <StatGrid>
                <Stat label="压缩形式" value={formatIpv6(expanded)} />
                <Stat label="完整形式" value={formatIpv6(expanded, 'full')} />
                <Stat label="地址类型" value={classifyIpv6(expanded).name} />
                <Stat
                  label=":: 压缩位置"
                  value={
                    ipv6ZeroRun(expanded)
                      ? `第 ${ipv6ZeroRun(expanded)?.start} 组起共 ${ipv6ZeroRun(expanded)?.length} 组`
                      : '无压缩'
                  }
                  hint={ipv6ZeroRun(expanded) ? '最长零区间' : '零分组不足 2 组'}
                />
                <Stat label="接口标识（低 64 位）" value={formatIpv6(interfaceIdOf(expanded))} />
                <Stat label="内嵌 IPv4" value={classifyIpv6(expanded).embeddedIpv4 ?? '—'} />
              </StatGrid>
              <ResultBox
                label="全部分组（十进制 / 十六进制）"
                value={ipv6GroupTable(expanded)
                  .map(
                    (row) =>
                      `${String(row.index).padStart(2, ' ')}  ${row.hex}  ${String(row.decimal).padStart(5, ' ')}`,
                  )
                  .join('\n')}
                rows="min-h-40"
                onCopy={() =>
                  copyText(
                    ipv6GroupTable(expanded)
                      .map((row) => `${row.index}\t0x${row.hex}\t${row.decimal}`)
                      .join('\n'),
                  )
                }
              />
              <ResultBox
                label="反向域名与类型"
                value={[
                  `压缩形式：${formatIpv6(expanded)}`,
                  `完整形式：${formatIpv6(expanded, 'full')}`,
                  `展开形式：${formatIpv6(expanded, 'expanded')}`,
                  `字节点分：${formatIpv6(expanded, 'bytes')}`,
                  `ip6.arpa：${ip6ArpaDomain(expanded)}`,
                  `类型：${classifyIpv6(expanded).name}（${classifyIpv6(expanded).prefix}）`,
                  `说明：${classifyIpv6(expanded).note}`,
                ].join('\n')}
                rows="min-h-40"
                onCopy={() =>
                  copyText(
                    [
                      formatIpv6(expanded),
                      formatIpv6(expanded, 'full'),
                      formatIpv6(expanded, 'expanded'),
                      ip6ArpaDomain(expanded),
                    ].join('\n'),
                  )
                }
              />
            </Section>
          ) : (
            <Note tone="danger" title="无法解析">
              请输入合法的 IPv6 地址，例如 fd12:3456:789a::1、fe80::1 或 ::ffff:127.0.0.1。
            </Note>
          )}
        </div>
      )}

      {tab === 'special' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="特殊用途地址速查">
            <ul className="flex flex-col gap-1.5">
              {IPV6_SPECIAL.map((item) => (
                <li key={item.address} className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5">
                  <span className="min-w-32 text-xs font-medium">{item.name}</span>
                  <span className="font-mono text-xs">{item.address}</span>
                  <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{item.scope}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyText(item.address)}
                    aria-label={`复制 ${item.address}`}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="地址类型判定规则">
            <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              <li>全球单播：2000::/3，由运营商或云厂商分配，可公网路由</li>
              <li>唯一本地 ULA：fc00::/7，实际只用 fd00::/8（RFC 4193）</li>
              <li>链路本地：fe80::/10，每个接口自动生成，路由器不转发</li>
              <li>站点本地：fec0::/10，已废弃（RFC 3879）</li>
              <li>组播：ff00::/8，ff02 为链路本地作用域</li>
              <li>NAT64：64:ff9b::/96（RFC 6052）</li>
              <li>6to4：2002::/16，前缀后接公网 IPv4</li>
              <li>Teredo：2001::/32，穿透 NAT 的隧道地址</li>
              <li>文档示例：2001:db8::/32（RFC 3849）</li>
              <li>IPv4 映射：::ffff:0:0/96，Socket 层的 AF_INET6 写法</li>
            </ul>
            <ResultBox
              label="EUI-64 还原示例"
              value={
                ula.fromEui64 && bytesFromEui64(ula.interfaceId)
                  ? `接口标识：${formatIpv6(ula.interfaceId, 'full')}\n对应 MAC：${bytesFromEui64(ula.interfaceId)
                      ?.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
                      .join(':')}`
                  : '当前接口标识不是 EUI-64 结构（随机生成），无法还原 MAC'
              }
              rows="min-h-16"
            />
          </Section>
        </div>
      )}

      <Note tone="info" title="与 IPv4 私有地址的差异">
        <span className="inline-flex items-start gap-1">
          <Network className="size-3 shrink-0" />
          <span>
            IPv4 的私有段是三个固定区间（10/8、172.16/12、192.168/16），IPv6 只有一个 fc00::/7 供本地使用， 且全局 ID
            必须随机挑选以保证全球唯一。同时 IPv6 主机通常默认启用 SLAAC 自动配置地址， 往往同时拥有 ULA
            与链路本地地址，排查问题时两者都要看。
          </span>
        </span>
      </Note>
      <Note tone="info" title="随机源说明">
        <span className="inline-flex items-start gap-1">
          <Fingerprint className="size-3 shrink-0" />
          全局 ID 与随机接口标识均来自 crypto.getRandomValues，不做联网请求；结果只在本地计算，适合测试与示例配置。
        </span>
      </Note>
    </ToolPanel>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] text-muted-foreground">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1"
          onClick={() => copyText(value)}
          disabled={!value}
          aria-label={`复制${label}`}
        >
          <Copy className="size-3" />
        </Button>
      </div>
      <p className="break-all font-mono text-xs">{value || '—'}</p>
    </div>
  );
}
