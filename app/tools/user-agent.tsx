import { AlertTriangle, Copy, FileUp, Search, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { pickFile, readAsText } from '../lib/file';
import {
  BOT_KEYWORDS,
  buildClientHints,
  type CapabilityRow,
  CRAWLER_UA_TABLE,
  describeDevice,
  detectCapabilities,
  FEATURE_BROWSERS,
  featureSupport,
  iosDeviceFromOsVersion,
  matchBotKeyword,
  type ParsedUserAgent,
  parseUserAgent,
  type RewriteResult,
  rewriteUserAgent,
  SAMPLE_USER_AGENTS,
  UA_KNOWLEDGE_NOTES,
} from '../lib/user-agent';

type Mode = 'single' | 'batch';

const SUPPORT_STYLE: Record<string, string> = {
  yes: 'text-emerald-600 dark:text-emerald-400',
  partial: 'text-amber-600 dark:text-amber-400',
  no: 'text-destructive',
};

function supportLabel(supported: boolean | 'partial'): string {
  if (supported === 'partial') return '部分';
  return supported ? '支持' : '不支持';
}

function toneOf(supported: boolean | 'partial'): string {
  return supported === true ? 'yes' : supported === 'partial' ? 'partial' : 'no';
}

export function ParsedStats({ ua, parsed }: { ua: string; parsed: ParsedUserAgent }) {
  const device = describeDevice(ua, parsed);
  const iosModel = parsed.os === 'iOS' ? iosDeviceFromOsVersion(parsed.osVersion) : null;
  const keyword = matchBotKeyword(ua);
  return (
    <>
      <StatGrid>
        <Stat label="浏览器" value={parsed.browser} hint={parsed.browserVersion || '版本未知'} />
        <Stat label="渲染引擎" value={parsed.engine} hint={parsed.browser === '未知' ? '未识别' : '按 UA 特征推断'} />
        <Stat label="操作系统" value={parsed.os} hint={parsed.osVersion || '版本未知'} />
        <Stat
          label="设备类型"
          value={device.type}
          hint={parsed.deviceVendor ? `厂商 ${parsed.deviceVendor}` : '未识别厂商'}
        />
      </StatGrid>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            parsed.isBot
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {parsed.isBot ? `爬虫：${parsed.botName ?? '未知'}` : '非爬虫'}
        </span>
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          手机：{parsed.isMobile ? '是' : '否'}
        </span>
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          平板：{parsed.isTablet ? '是' : '否'}
        </span>
        {iosModel && (
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            推测机型：{iosModel}
          </span>
        )}
        {device.suspicious.detected && (
          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3" />
            桌面版伪装
          </span>
        )}
      </div>
      {keyword && (
        <Hint>
          额外关键词命中：{keyword}（内置 {BOT_KEYWORDS.length} 个爬虫关键词）
        </Hint>
      )}
    </>
  );
}

export function CapabilityTable({ rows }: { rows: CapabilityRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full table-fixed text-left text-[11px]">
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" className="w-2/5 px-2 py-1.5 font-medium">
              能力
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 font-medium">
              支持
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium">
              说明
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t">
              <td className="px-2 py-1.5 align-top">{row.name}</td>
              <td className={`px-2 py-1.5 align-top font-mono ${SUPPORT_STYLE[toneOf(row.supported)]}`}>
                {supportLabel(row.supported)}
              </td>
              <td className="px-2 py-1.5 align-top text-muted-foreground">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UserAgentTool() {
  const [mode, setMode] = useState<Mode>('single');
  const [input, setInput] = useState(SAMPLE_USER_AGENTS[0].ua);
  const [featureBrowser, setFeatureBrowser] = useState('Chrome');
  const [featureVersion, setFeatureVersion] = useState(131);
  const [targetBrowser, setTargetBrowser] = useState('Chrome');
  const [targetVersion, setTargetVersion] = useState('131');

  const singleUa = useMemo(() => {
    const ua = input.trim();
    if (!ua) return null;
    const parsed = parseUserAgent(ua);
    return { ua, parsed, device: describeDevice(ua, parsed), capabilities: detectCapabilities(ua, parsed) };
  }, [input]);

  const batch = useMemo(() => {
    if (mode !== 'batch') return { rows: [], distribution: [] };
    const list = input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const rows = list.map((ua) => ({ ua, key: ua, parsed: parseUserAgent(ua) }));
    // 同一条 UA 可能重复出现，用出现次数生成稳定的唯一标识
    const seen = new Map<string, number>();
    for (const row of rows) {
      const occurrence = seen.get(row.ua) ?? 0;
      seen.set(row.ua, occurrence + 1);
      row.key = `${row.ua}#${occurrence}`;
    }
    const counter = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.parsed.os} · ${row.parsed.browser}`;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    const distribution = [...counter.entries()]
      .map(([key, count]) => ({ key, count, percent: rows.length === 0 ? 0 : (count / rows.length) * 100 }))
      .sort((a, b) => b.count - a.count);
    return { rows, distribution };
  }, [input, mode]);

  const hints = useMemo(() => (singleUa ? buildClientHints(singleUa.ua, singleUa.parsed) : null), [singleUa]);

  const rewrite: RewriteResult | null = useMemo(() => {
    if (!singleUa) return null;
    return rewriteUserAgent(singleUa.ua, { browser: targetBrowser, version: targetVersion });
  }, [singleUa, targetBrowser, targetVersion]);

  const featureRows = useMemo(
    () => featureSupport(featureBrowser, Number.isFinite(featureVersion) ? featureVersion : null),
    [featureBrowser, featureVersion],
  );

  const loadSample = useCallback(async () => {
    const file = await pickFile({ accept: '.txt,text/plain' });
    if (!file) return;
    setInput(await readAsText(file));
  }, []);

  return (
    <ToolPanel
      title="User-Agent 解析"
      description="解析浏览器、系统、设备与爬虫标识，生成 Client Hints 并按版本断言特性支持"
      actions={
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={(value) => setMode(value === 'batch' ? 'batch' : 'single')}>
            <TabsList>
              <TabsTrigger value="single">单条</TabsTrigger>
              <TabsTrigger value="batch">批量</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="从文本文件导入 UA"
            onClick={() => void loadSample()}
          >
            <FileUp className="size-3.5" />
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <Note tone="info" title="关于设备与能力推断">
        <span className="inline-flex items-start gap-1">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          全部基于 UA 字符串的关键词匹配与内置版本表，不联网、不上报；UA 可被随意伪造，判定结果只作参考。
        </span>
      </Note>
      <Section
        title={mode === 'single' ? 'User-Agent 字符串' : '批量 UA（每行一条）'}
        description={mode === 'batch' ? '按行解析，输出对比表与系统 / 浏览器分布统计' : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {SAMPLE_USER_AGENTS.map((sample) => (
              <Button
                key={sample.label}
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={() => setInput(sample.ua)}
              >
                {sample.label}
              </Button>
            ))}
          </div>
        }
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            mode === 'single'
              ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...'
              : '每行粘贴一条 UA，可从 nginx 访问日志中整列复制'
          }
          spellCheck={false}
          rows={3}
          className="min-h-20 resize-none font-mono text-xs"
        />
      </Section>

      {mode === 'batch' ? (
        <Section title={`解析结果（${batch.rows.length} 条）`} description="对比表格 + 系统/浏览器分布">
          {batch.rows.length === 0 ? (
            <EmptyHint>粘贴多条 UA（每行一条）后查看对比结果</EmptyHint>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full min-w-[46rem] text-left text-[11px]">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        浏览器
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        版本
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        引擎
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        系统
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        设备
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        爬虫
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <tr key={row.key} className="border-t align-top">
                        <td className="px-2 py-1.5">{row.parsed.browser}</td>
                        <td className="px-2 py-1.5 font-mono">{row.parsed.browserVersion}</td>
                        <td className="px-2 py-1.5">{row.parsed.engine}</td>
                        <td className="px-2 py-1.5">
                          {row.parsed.os} {row.parsed.osVersion}
                        </td>
                        <td className="px-2 py-1.5">{row.parsed.deviceType}</td>
                        <td className="px-2 py-1.5">{row.parsed.isBot ? (row.parsed.botName ?? '是') : '否'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium">分布统计</span>
                {batch.distribution.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="w-48 shrink-0 truncate font-mono text-[11px]">{item.key}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, item.percent)}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                      {item.count} 条 · {item.percent.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      ) : singleUa ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="解析概览">
              <ParsedStats ua={singleUa.ua} parsed={singleUa.parsed} />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium">UA 原文</span>
                <p className="rounded-md border bg-muted/40 p-2 font-mono text-[11px] break-all">{singleUa.ua}</p>
              </div>
              {singleUa.device.notes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                  {singleUa.device.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              {singleUa.device.suspicious.detected && (
                <Note tone="warn" title="设备伪装提示">
                  {singleUa.device.suspicious.note}
                </Note>
              )}
            </Section>

            <Section
              title="UA 缩减 / Client Hints"
              description="Chrome 系生成 Sec-CH-UA 系列；Firefox 给出精简 UA 模板"
            >
              {hints && (
                <div className="flex flex-col gap-2">
                  <ul className="space-y-1 font-mono text-[11px]">
                    {[
                      ['Sec-CH-UA', hints.secChUa],
                      ['Sec-CH-UA-Mobile', hints.secChUaMobile],
                      ['Sec-CH-UA-Platform', hints.secChUaPlatform],
                      ['Sec-CH-UA-Platform-Version', hints.secChUaPlatformVersion],
                    ].map(([name, value]) => (
                      <li key={name} className="flex flex-wrap items-baseline gap-2">
                        <span className="text-muted-foreground">{name}:</span>
                        <span className="break-all">{value}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed break-all">
                    {hints.extraHeaders.map((header) => `${header.name}: ${header.value}`).join('\n')}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() =>
                      copyText(
                        [
                          `Sec-CH-UA: ${hints.secChUa}`,
                          `Sec-CH-UA-Mobile: ${hints.secChUaMobile}`,
                          `Sec-CH-UA-Platform: ${hints.secChUaPlatform}`,
                          `Sec-CH-UA-Platform-Version: ${hints.secChUaPlatformVersion}`,
                          ...hints.extraHeaders.map((header) => `${header.name}: ${header.value}`),
                        ].join('\n'),
                      )
                    }
                  >
                    <Copy className="size-3.5" />
                    复制全部提示头
                  </Button>
                  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                    {hints.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="版本能力推断" description="根据解析出的浏览器与版本判断内置特性支持情况">
              <CapabilityTable rows={singleUa.capabilities} />
              <Hint>数据为内置静态表，仅覆盖常见能力；实际支持还受操作系统版本与硬件影响。</Hint>
            </Section>

            <Section title="UA 对照 / 改写" description="把当前 UA 映射到目标浏览器版本">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  label="目标浏览器"
                  value={targetBrowser}
                  onChange={setTargetBrowser}
                  options={FEATURE_BROWSERS.map((item) => ({ value: item, label: item }))}
                />
                <TextField
                  label="目标版本"
                  value={targetVersion}
                  onChange={setTargetVersion}
                  placeholder="131"
                  hint="留空会使用 {major} 占位符"
                />
              </div>
              {rewrite && (
                <div className="flex flex-col gap-2">
                  <ResultBox
                    label="改写后的 UA"
                    value={rewrite.ua}
                    onCopy={() => copyText(rewrite.ua)}
                    rows="min-h-16"
                  />
                  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                    {rewrite.changes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {rewrite.warnings.length > 0 && (
                    <Note tone="warn" title="注意">
                      <ul className="list-disc space-y-0.5 pl-4">
                        {rewrite.warnings.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </Note>
                  )}
                </div>
              )}
            </Section>
          </div>
        </>
      ) : (
        <EmptyHint>粘贴一条 UA 开始解析，或从上方样例中选择一条</EmptyHint>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="特性断言" description="输入目标浏览器与版本，列出关键特性的支持情况（内置静态数据）">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label="浏览器"
              value={featureBrowser}
              onChange={setFeatureBrowser}
              options={FEATURE_BROWSERS.map((item) => ({ value: item, label: item }))}
            />
            <NumberField label="主版本号" value={featureVersion} onChange={setFeatureVersion} min={0} max={999} />
          </div>
          <CapabilityTable rows={featureRows} />
        </Section>

        <Section title="爬虫 UA 对照表" description="常见爬虫与自动化 UA，用于 SEO 与风控排查">
          <div className="flex flex-col gap-1.5">
            {CRAWLER_UA_TABLE.map((row) => (
              <details key={row.name} className="rounded-md border px-2.5 py-1.5">
                <summary className="cursor-pointer text-[11px] font-medium">{row.name}</summary>
                <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">{row.ua}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">用途：{row.purpose}</p>
                <p className="text-[11px] text-muted-foreground">验证：{row.verify}</p>
              </details>
            ))}
          </div>
        </Section>
      </div>

      <Section title="UA 机制备忘">
        <div className="grid gap-2 sm:grid-cols-2">
          {UA_KNOWLEDGE_NOTES.map((item) => (
            <div key={item.title} className="rounded-md border px-2.5 py-2">
              <p className="text-[11px] font-medium">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
        <Note tone="warn" title="内置爬虫关键词">
          <span className="inline-flex flex-wrap items-start gap-1">
            <Search className="mt-0.5 size-3 shrink-0" />
            {BOT_KEYWORDS.join(' · ')}
          </span>
        </Note>
      </Section>
    </ToolPanel>
  );
}
