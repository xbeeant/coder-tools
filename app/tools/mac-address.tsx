import { AlertTriangle, Copy, Network, Shuffle, Wifi } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select, TextField } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { bytesFromEui64, formatIpv6, parseIpv6 } from '../lib/ipv6';
import { analyzeMac, eui64InterfaceId, formatMac, generateMacs, linkLocalFromMac, parseMac } from '../lib/mac';

type Format = 'colon' | 'hyphen' | 'cisco' | 'plain-lower' | 'plain-upper';

const FORMAT_OPTIONS = [
  { value: 'colon', label: '冒号 00:1B:44:11:3A:B7' },
  { value: 'hyphen', label: '连字符 00-1B-44-11-3A-B7' },
  { value: 'cisco', label: 'Cisco 点分 001b.4411.3ab7' },
  { value: 'plain-lower', label: '无分隔小写 001b44113ab7' },
  { value: 'plain-upper', label: '无分隔大写 001B44113AB7' },
];

export default function MacAddress() {
  const [tab, setTab] = useState<'generate' | 'inspect' | 'batch'>('generate');

  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<Format>('colon');
  const [oui, setOui] = useState('');
  const [unicast, setUnicast] = useState(true);
  const [localAdmin, setLocalAdmin] = useState(true);
  const [multicast, setMulticast] = useState(false);

  const [inspectInput, setInspectInput] = useState('00:1B:44:11:3A:B7');
  const [batchInput, setBatchInput] = useState(
    '00:1B:44:11:3A:B7\n00-1B-44-11-3A-B7\n08:00:27:AA:BB:CC\n001b.4411.3ab7\nGG:11:22:33:44:55',
  );

  const generated = useMemo(() => {
    const list = generateMacs({
      count,
      oui: oui.trim() || null,
      unicast,
      multicast,
      localAdmin: localAdmin && !multicast,
    });
    return list.map((bytes) => {
      const analysis = analyzeMac(bytes);
      return {
        text: formatMac(bytes, format),
        bytes,
        analysis,
      };
    });
  }, [count, format, oui, unicast, localAdmin, multicast]);

  const generatedText = generated.map((item) => item.text).join('\n');

  const inspect = useMemo(() => {
    const parsed = analyzeMacSafe(inspectInput);
    return parsed;
  }, [inspectInput]);

  const batch = useMemo(() => {
    const rows = batchInput
      .split(/[\n,;\t]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ line, parsed: analyzeMacSafe(line) }));

    const vendorCount = new Map<string, number>();
    const macCount = new Map<string, number>();
    let valid = 0;
    for (const row of rows) {
      if (!row.parsed.ok) continue;
      valid += 1;
      const vendor = row.parsed.analysis.vendor ?? '未在内置表内';
      vendorCount.set(vendor, (vendorCount.get(vendor) ?? 0) + 1);
      macCount.set(row.parsed.analysis.canonical, (macCount.get(row.parsed.analysis.canonical) ?? 0) + 1);
    }
    return {
      rows,
      valid,
      invalid: rows.length - valid,
      vendors: [...vendorCount.entries()].sort((a, b) => b[1] - a[1]),
      duplicates: [...macCount.entries()].filter(([, times]) => times > 1),
    };
  }, [batchInput]);

  return (
    <ToolPanel
      title="MAC 地址生成 / 查询"
      description="生成虚拟机网卡 MAC、解析厂商与位标志，并做 MAC ⇄ EUI-64 ⇄ IPv6 链路本地互转"
      actions={
        <Tabs>
          <TabsList>
            <TabsTrigger active={tab === 'generate'} onClick={() => setTab('generate')}>
              生成
            </TabsTrigger>
            <TabsTrigger active={tab === 'inspect'} onClick={() => setTab('inspect')}>
              查询解析
            </TabsTrigger>
            <TabsTrigger active={tab === 'batch'} onClick={() => setTab('batch')}>
              批量解析
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'generate' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="生成参数" description="随机源为 crypto.getRandomValues，不发送任何网络请求">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="生成数量" value={count} onChange={setCount} min={1} max={100} suffix="个" />
              <Select
                label="输出格式"
                value={format}
                onChange={(value) => setFormat(value as Format)}
                options={FORMAT_OPTIONS}
              />
            </div>
            <TextField
              label="自定义厂商 OUI（可留空）"
              value={oui}
              onChange={setOui}
              placeholder="52:54:00"
              hint="例如 VMware 000C29、Docker/VM 常见 525400；留空则整机随机"
            />
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">首字节位标志</span>
              <div className="flex flex-wrap gap-3">
                <Checkbox label="单播（最低位 0）" checked={unicast} onChange={setUnicast} />
                <Checkbox
                  label="组播（最低位 1）"
                  checked={multicast}
                  onChange={(value) => {
                    setMulticast(value);
                    if (value) setUnicast(false);
                  }}
                  hint="与单播互斥"
                />
                <Checkbox label="本地管理（次低位 1）" checked={localAdmin} onChange={setLocalAdmin} />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => setCount((value) => (value >= 100 ? 1 : value + 1))}
            >
              <Shuffle className="size-3.5" />
              再生成一批
            </Button>
          </Section>

          <Section title="生成结果">
            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">MAC</th>
                    <th className="px-2 py-1.5 text-left font-medium">厂商</th>
                    <th className="px-2 py-1.5 text-left font-medium">标志</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {generated.map((item) => (
                    <tr key={item.text} className="border-t">
                      <td className="px-2 py-1">{item.text}</td>
                      <td className="px-2 py-1 font-sans text-muted-foreground">{item.analysis.vendor ?? '—'}</td>
                      <td className="px-2 py-1 font-sans text-muted-foreground">
                        {[
                          item.analysis.multicast ? '组播' : '单播',
                          item.analysis.localAdmin ? '本地' : '全局',
                          item.analysis.virtual ? '虚拟网卡' : '',
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ResultBox label="复制全部" value={generatedText} rows="min-h-32" onCopy={() => copyText(generatedText)} />
            <StatGrid>
              <Stat label="生成数量" value={generated.length} />
              <Stat label="单播" value={generated.filter((item) => !item.analysis.multicast).length} />
              <Stat label="本地管理" value={generated.filter((item) => item.analysis.localAdmin).length} />
              <Stat label="虚拟网卡 OUI" value={generated.filter((item) => item.analysis.virtual).length} />
            </StatGrid>
          </Section>
        </div>
      )}

      {tab === 'inspect' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="粘贴 MAC 地址" description="支持冒号、连字符、Cisco 点分与无分隔写法">
            <TextField
              label="MAC 地址"
              value={inspectInput}
              onChange={setInspectInput}
              placeholder="00:1B:44:11:3A:B7"
              hint={inspect.ok ? `规范化：${inspect.analysis.canonical}（原分隔符 ${inspect.separator}）` : undefined}
            />
            <div className="flex flex-wrap gap-1.5">
              {['00:1B:44:11:3A:B7', '08:00:27:AA:BB:CC', '52:54:00:12:34:56', 'FF:FF:FF:FF:FF:FF', '000C29FFEE01'].map(
                (preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="outline"
                    className="font-mono"
                    onClick={() => setInspectInput(preset)}
                  >
                    {preset}
                  </Button>
                ),
              )}
            </div>
            <ClearButton onClick={() => setInspectInput('')} disabled={!inspectInput} />
          </Section>

          {inspect.ok ? (
            <Section title="解析结果">
              <StatGrid>
                <Stat label="规范化" value={inspect.analysis.canonical} />
                <Stat
                  label="厂商（内置表）"
                  value={inspect.analysis.vendor ?? '未在内置表内'}
                  tone={inspect.analysis.vendor ? 'info' : 'warn'}
                />
                <Stat label="OUI（前 3 字节）" value={inspect.analysis.oui} />
                <Stat label="设备标识（后 3 字节）" value={inspect.analysis.deviceId} />
                <Stat
                  label="单播 / 组播"
                  value={inspect.analysis.multicast ? '组播' : '单播'}
                  tone={inspect.analysis.multicast ? 'warn' : 'success'}
                />
                <Stat label="地址类型" value={inspect.analysis.localAdmin ? '本地管理' : '全局管理'} />
                <Stat
                  label="EUI-64 可用"
                  value={inspect.analysis.usableForEui64 ? '是' : '否'}
                  tone={inspect.analysis.usableForEui64 ? 'success' : 'warn'}
                />
                <Stat label="虚拟网卡" value={inspect.analysis.virtual ? '是（常见虚拟化 OUI）' : '否'} />
              </StatGrid>

              <Section title="MAC ⇄ EUI-64 ⇄ IPv6 链路本地" className="border-dashed">
                <div className="grid gap-2 sm:grid-cols-2">
                  <CopyBox
                    label="EUI-64 接口标识"
                    value={formatIpv6(eui64InterfaceId(inspect.analysis.bytes).groups, 'full')}
                  />
                  <CopyBox label="链路本地地址 fe80::/10" value={linkLocalFromMac(inspect.analysis.bytes)} />
                  <CopyBox
                    label="链路本地完整形式"
                    value={formatIpv6(parseIpv6(linkLocalFromMac(inspect.analysis.bytes)) ?? [], 'full')}
                  />
                  <CopyBox label="从接口标识还原 MAC" value={restoreMac(linkLocalFromMac(inspect.analysis.bytes))} />
                </div>
                <Hint>
                  EUI-64 的做法是翻转首字节的 U/L 位后在中间插入
                  ff:ff，因此链路本地地址天然可用于邻居发现协议（ND/NDP）。
                </Hint>
              </Section>

              {!inspect.analysis.vendor && (
                <Note tone="warn" title="未在内置 OUI 表内">
                  内置表只是常见厂商片段（{'>'}40 条），并非 IEEE 完整注册库。需要精确结果时可在 IEEE 官方查询：
                  <a
                    className="ml-1 underline"
                    href="https://standards-oui.ieee.org/"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    standards-oui.ieee.org
                  </a>
                </Note>
              )}
              {(inspect.analysis.isBroadcast || inspect.analysis.isZero) && (
                <Note tone="danger" title="特殊地址">
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="size-3" />
                    {inspect.analysis.isBroadcast ? '这是广播地址' : '这是全 0 地址'}，不能作为设备 MAC 使用。
                  </span>
                </Note>
              )}
              <ResultBox
                label="复制内容"
                value={[
                  `规范化：${inspect.analysis.canonical}`,
                  `OUI：${inspect.analysis.oui}`,
                  `设备标识：${inspect.analysis.deviceId}`,
                  `厂商：${inspect.analysis.vendor ?? '未在内置表内'}`,
                  `单播/组播：${inspect.analysis.multicast ? '组播' : '单播'}`,
                  `本地/全局：${inspect.analysis.localAdmin ? '本地管理' : '全局管理'}`,
                  `EUI-64 接口标识：${eui64InterfaceId(inspect.analysis.bytes).text}`,
                  `链路本地：${linkLocalFromMac(inspect.analysis.bytes)}`,
                ].join('\n')}
                rows="min-h-40"
                onCopy={() =>
                  copyText(
                    [
                      inspect.analysis.canonical,
                      inspect.analysis.oui,
                      inspect.analysis.vendor ?? '未在内置表内',
                      linkLocalFromMac(inspect.analysis.bytes),
                    ].join('\n'),
                  )
                }
              />
            </Section>
          ) : (
            <Note tone="danger" title="无法解析">
              <span className="inline-flex items-center gap-1">
                <Wifi className="size-3" />
                {inspect.error}
              </span>
            </Note>
          )}
        </div>
      )}

      {tab === 'batch' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="批量粘贴" description="每行一个 MAC，可用逗号、分号或制表符分隔">
            <Textarea
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
              placeholder={'00:1B:44:11:3A:B7\n08-00-27-AA-BB-CC\n001b.4411.3ab7'}
              spellCheck={false}
              className="min-h-48 resize-none font-mono text-xs"
            />
            <ClearButton onClick={() => setBatchInput('')} disabled={!batchInput} />
          </Section>

          <Section title="解析结果">
            <StatGrid>
              <Stat label="总行数" value={batch.rows.length} />
              <Stat label="合法" value={batch.valid} tone="success" />
              <Stat label="非法" value={batch.invalid} tone={batch.invalid ? 'danger' : 'info'} />
              <Stat label="重复项" value={batch.duplicates.length} tone={batch.duplicates.length ? 'warn' : 'info'} />
            </StatGrid>

            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">原始输入</th>
                    <th className="px-2 py-1.5 text-left font-medium">规范化</th>
                    <th className="px-2 py-1.5 text-left font-medium">厂商</th>
                    <th className="px-2 py-1.5 text-left font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {batch.rows.map((row) => (
                    <tr key={row.line} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground">{row.line}</td>
                      <td className="px-2 py-1">{row.parsed.ok ? row.parsed.analysis.canonical : '—'}</td>
                      <td className="px-2 py-1 font-sans">
                        {row.parsed.ok ? (row.parsed.analysis.vendor ?? '未命中') : '—'}
                      </td>
                      <td className="px-2 py-1 font-sans">
                        {row.parsed.ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {row.parsed.analysis.multicast ? '组播' : '单播'} /{' '}
                            {row.parsed.analysis.localAdmin ? '本地' : '全局'}
                          </span>
                        ) : (
                          <span className="text-destructive">非法</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="厂商分布">
            {batch.vendors.length === 0 ? (
              <p className="text-xs text-muted-foreground">没有可统计的合法 MAC</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {batch.vendors.map(([vendor, times]) => (
                  <li key={vendor} className="flex items-center gap-2 text-xs">
                    <span className="w-48 shrink-0 truncate">{vendor}</span>
                    <span
                      className="h-2 rounded bg-primary/70"
                      style={{ width: `${Math.max(8, (times / batch.valid) * 160)}px` }}
                    />
                    <span className="font-mono text-muted-foreground">{times}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="重复检测">
            {batch.duplicates.length === 0 ? (
              <p className="text-xs text-muted-foreground">未发现重复的 MAC</p>
            ) : (
              <Note tone="warn" title="存在重复 MAC">
                <ul className="list-disc space-y-0.5 pl-4">
                  {batch.duplicates.map(([mac, times]) => (
                    <li key={mac}>
                      {mac} 出现 {times} 次
                    </li>
                  ))}
                </ul>
              </Note>
            )}
          </Section>
        </div>
      )}

      <Note tone="info" title="关于内置 OUI 表">
        <span className="inline-flex items-start gap-1">
          <Network className="size-3 shrink-0" />
          <span>
            扩展内的厂商表是内置的常用 OUI 片段（非完整 IEEE 注册库），覆盖虚拟化、服务器、路由器与消费电子等常见厂商，
            足以应付日常排查；未命中的前缀建议用 IEEE 官方 OUI 数据库二次确认。本工具完全离线，不发起任何查询请求。
          </span>
        </span>
      </Note>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => copyText(generatedText)} disabled={!generatedText}>
          <Copy className="size-3.5" />
          复制当前生成结果
        </Button>
      </div>
    </ToolPanel>
  );
}

/** 从链路本地地址反推 MAC，非 EUI-64 结构时返回占位文本。 */
function restoreMac(linkLocal: string): string {
  const groups = parseIpv6(linkLocal);
  const bytes = groups ? bytesFromEui64(groups.slice(-4)) : null;
  return bytes ? formatMac(new Uint8Array(bytes), 'cisco') : '非 EUI-64 接口标识，无法还原';
}

/** 解析并分析单个 MAC，非法时保留中文错误。 */
function inspectMac(input: string) {
  const parsed = parseMac(input);
  if (!parsed.ok) return parsed;
  return { ok: true as const, analysis: analyzeMac(parsed.bytes), separator: parsed.separator };
}

const analyzeMacSafe = inspectMac;

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
          <Copy className="size-3.5" />
        </Button>
      </div>
      <p className="break-all font-mono text-xs">{value || '—'}</p>
    </div>
  );
}
