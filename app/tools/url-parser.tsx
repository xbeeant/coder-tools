import { AlertTriangle, Link2, Scissors, Shuffle, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, TextField } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatIpv4, parseIpv4 } from '../lib/ipv4';
import {
  analyzePathSegments,
  buildSearch,
  curlDataToParams,
  DEFAULT_NORMALIZE_OPTIONS,
  detectUnencodedChars,
  isShortener,
  looksRelative,
  normalizeUrl,
  paramsToCurlData,
  paramsToJson,
  paramsToKeyValue,
  parseUrl,
  percentEncode,
  type QueryParam,
  splitUrl,
  type UrlSegmentKind,
  validateHostname,
} from '../lib/url-parser';

const SEGMENT_STYLE: Record<UrlSegmentKind, string> = {
  scheme: 'text-emerald-600 dark:text-emerald-400',
  text: 'text-muted-foreground',
  userinfo: 'text-amber-600 dark:text-amber-400',
  host: 'text-sky-600 dark:text-sky-400',
  port: 'text-violet-600 dark:text-violet-400',
  path: 'text-foreground',
  query: 'text-blue-600 dark:text-blue-400',
  hash: 'text-rose-600 dark:text-rose-400',
};

const SEGMENT_HINT: Record<UrlSegmentKind, string> = {
  scheme: '协议：决定默认端口与解析规则，http/https 属于「特殊 scheme」',
  text: '分隔符',
  userinfo: 'user:password@，出现在域名之前会触发钓鱼风险提示',
  host: '主机名或 IP 字面量',
  port: '端口，省略时使用协议默认端口',
  path: '路径，以 / 开头的层级',
  query: '查询串，键值对以 & 分隔',
  hash: '片段，浏览器不会把它发送给服务器',
};

const RELATIVE_PRESETS = [
  '../assets/img.png',
  './sibling',
  '/绝对路径',
  '?page=2',
  '#anchor',
  '//cdn.example.com/lib.js',
  'https://other.com/x',
];

const PRESETS = [
  'https://user:pass@api.example.com:8443/v1/users?page=2&sort=name&page=3#top',
  'http://192.168.1.1/login?next=/admin&redirect=%2Fhome',
  'https://例子.测试/路径/带 空格?q=中文&a=1',
  'https://t.co/aBcD1234',
  'ws://localhost:5173/socket?token=abc123',
];

type Tab = 'structure' | 'params' | 'encode' | 'relative';

interface EditableParam {
  key: string;
  value: string;
}

export default function UrlParser() {
  const [tab, setTab] = useState<Tab>('structure');
  const [urlInput, setUrlInput] = useState(PRESETS[0] ?? '');
  const [source, setSource] = useState<'url' | 'params'>('url');
  const [edited, setEdited] = useState<EditableParam[]>([]);
  const [baseInput, setBaseInput] = useState('https://app.example.com/docs/guide/index.html');
  const [relativeInput, setRelativeInput] = useState('../assets/img/logo.png?v=2#top');

  const parsed = useMemo(() => parseUrl(urlInput), [urlInput]);
  const segments = useMemo(() => (parsed.ok ? splitUrl(parsed) : []), [parsed]);

  const params: EditableParam[] = useMemo(() => {
    if (source === 'params') return edited;
    return parsed.ok ? parsed.params.map(({ key, value }) => ({ key, value })) : [];
  }, [source, edited, parsed]);

  /** 为参数行分配稳定 key，避免同名参数在编辑时串行。 */
  const paramRows = useMemo(() => {
    const seen = new Map<string, number>();
    return params.map((item) => {
      const token = `${item.key}=${item.value}`;
      const occurrence = seen.get(token) ?? 0;
      seen.set(token, occurrence + 1);
      return { ...item, rowId: `${occurrence}-${token}` };
    });
  }, [params]);

  const rebuilt = useMemo(() => {
    if (!parsed.ok) return null;
    try {
      const url = new URL(parsed.url.href);
      url.search = buildSearch(params);
      return url.toString();
    } catch {
      return null;
    }
  }, [parsed, params]);

  const applyParams = (next: EditableParam[]) => {
    setEdited(next);
    setSource('params');
    if (parsed.ok) {
      try {
        const url = new URL(parsed.url.href);
        url.search = buildSearch(next);
        setUrlInput(url.toString());
      } catch {
        /* 保持原值 */
      }
    }
  };

  const normalizeOptions = DEFAULT_NORMALIZE_OPTIONS;
  const normalized = useMemo(() => normalizeUrl(urlInput, normalizeOptions), [urlInput]);
  const hostIssues = parsed.ok ? validateHostname(parsed.hostname) : [];
  const shortener = parsed.ok ? isShortener(parsed.hostname) : null;
  const pathIssues = parsed.ok ? analyzePathSegments(parsed.pathname) : [];
  const unencoded = detectUnencodedChars(urlInput);
  const resolved = useMemo(() => parseUrl(relativeInput, baseInput || undefined), [relativeInput, baseInput]);
  const isIpHost = parsed.ok ? parseIpv4(parsed.hostname) !== null : false;

  return (
    <ToolPanel
      title="URL 解析"
      description="逐段拆解 URL、检查查询参数、做百分号编码与规范化，并支持相对地址解析"
      actions={
        <Tabs>
          <TabsList>
            <TabsTrigger active={tab === 'structure'} onClick={() => setTab('structure')}>
              结构解析
            </TabsTrigger>
            <TabsTrigger active={tab === 'params'} onClick={() => setTab('params')}>
              查询参数
            </TabsTrigger>
            <TabsTrigger active={tab === 'encode'} onClick={() => setTab('encode')}>
              编码与规范化
            </TabsTrigger>
            <TabsTrigger active={tab === 'relative'} onClick={() => setTab('relative')}>
              相对 URL
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <Section
        title="输入 URL"
        description="支持完整 URL 或不带协议的地址（后者会按 https:// 之外的相对地址提示）"
        actions={<ClearButton onClick={() => setUrlInput('')} disabled={!urlInput} />}
      >
        <Textarea
          value={urlInput}
          onChange={(event) => {
            setUrlInput(event.target.value);
            setSource('url');
          }}
          placeholder="https://example.com/path?a=1&b=2#frag"
          spellCheck={false}
          className="min-h-20 resize-none font-mono text-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant="outline"
              className="max-w-full truncate font-mono"
              onClick={() => {
                setUrlInput(preset);
                setSource('url');
              }}
            >
              {preset}
            </Button>
          ))}
        </div>
        {urlInput.length > 2048 && (
          <Note tone="warn" title="URL 过长">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="size-3" />
              当前长度 {urlInput.length} 字符。浏览器地址栏可容纳约 2 MB，但服务端通常更早截断： Nginx 默认
              large_client_header_buffers 为 8k，Apache LimitRequestLine 为 8190， 部分网关在 4k 处即返回
              414。超出后本工具只展示解析结果，不做截断。
            </span>
          </Note>
        )}
      </Section>

      {tab === 'structure' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="逐段着色" description="按协议 / 用户信息 / 主机 / 端口 / 路径 / 查询 / 片段 拆分">
            {parsed.ok ? (
              <>
                <div className="rounded-md border bg-muted/20 p-3 font-mono text-sm break-all">
                  {segments.map((segment) => (
                    <span key={segment.id} className={SEGMENT_STYLE[segment.kind]}>
                      {segment.text}
                    </span>
                  ))}
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {segments
                    .filter((segment) => segment.kind !== 'text')
                    .map((segment) => (
                      <li key={`hint-${segment.id}`} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        <span className={SEGMENT_STYLE[segment.kind]}>{segment.label}</span>
                        <span className="text-muted-foreground"> · {SEGMENT_HINT[segment.kind]}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <Note tone="danger" title="解析失败">
                {parsed.error}
              </Note>
            )}
          </Section>

          {parsed.ok && (
            <Section title="字段明细">
              <StatGrid>
                <Stat
                  label="协议 scheme"
                  value={parsed.scheme}
                  hint={parsed.isSpecialScheme ? '特殊 scheme' : '非特殊 scheme'}
                />
                <Stat label="hostname" value={parsed.hostname} />
                <Stat
                  label="端口"
                  value={parsed.port || '（省略）'}
                  hint={parsed.defaultPort ? `默认端口 ${parsed.defaultPort}` : '该协议无默认端口'}
                  tone={parsed.isDefaultPort ? 'warn' : 'info'}
                />
                <Stat label="username" value={parsed.username || '—'} />
                <Stat label="password" value={parsed.password ? '••••••' : '—'} />
                <Stat label="origin" value={parsed.origin} />
                <Stat label="pathname" value={parsed.pathname} />
                <Stat label="search" value={parsed.search || '—'} />
                <Stat label="hash" value={parsed.hash || '—'} />
                <Stat label="参数数量" value={parsed.params.length} hint={`重复键 ${parsed.duplicateKeys.length}`} />
                <Stat label="路径段数" value={parsed.pathSegments.length} />
                <Stat label="URL 类型" value={parsed.isAbsolute ? '绝对 URL' : '相对 URL'} />
              </StatGrid>
              <ResultBox
                label="href（浏览器规范化后的结果）"
                value={parsed.href}
                rows="min-h-16"
                onCopy={() => copyText(parsed.href)}
              />
            </Section>
          )}

          {parsed.ok && (
            <Section title="安全与合法性检查">
              <StatGrid>
                <Stat
                  label="是否含 userinfo"
                  value={parsed.hasUserInfo ? '是' : '否'}
                  tone={parsed.hasUserInfo ? 'danger' : 'success'}
                />
                <Stat
                  label="是否明文 HTTP"
                  value={parsed.scheme === 'http' ? '是' : '否'}
                  tone={parsed.scheme === 'http' ? 'warn' : 'success'}
                />
                <Stat
                  label="主机名是 IP"
                  value={isIpHost ? `是（${formatIpv4(parseIpv4(parsed.hostname) as number)}）` : '否'}
                  tone={isIpHost ? 'warn' : 'info'}
                />
                <Stat label="短链域名" value={shortener ?? '未命中内置表'} tone={shortener ? 'warn' : 'info'} />
              </StatGrid>
              {parsed.hasUserInfo && (
                <Note tone="warn" title="URL 中包含用户名密码">
                  形如 <code className="font-mono">https://example.com@evil.com/</code> 的地址会把真实访问目标写成
                  userinfo，这是典型的钓鱼手法；同时明文携带凭据也容易被日志与浏览器历史记录留存。
                </Note>
              )}
              {parsed.scheme === 'http' && (
                <Note tone="warn" title="明文传输">
                  http:// 的请求内容（含 Cookie、Token）可被链路上的第三方读取，生产环境应使用 https://。
                </Note>
              )}
              {shortener && (
                <Note tone="warn" title="疑似短链域名">
                  命中内置短链表（{shortener}），短链会隐藏真实目标地址，排查可疑链接时应先展开。
                </Note>
              )}
              {hostIssues.length > 0 && (
                <Note tone="warn" title="主机名问题">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {hostIssues.map((issue) => (
                      <li key={issue.message}>{issue.message}</li>
                    ))}
                  </ul>
                </Note>
              )}
              {hostIssues.length === 0 && shortener === null && !parsed.hasUserInfo && (
                <Note tone="success" title="检查通过">
                  主机名符合标签规则，未检出 userinfo、短链等常见风险特征。
                </Note>
              )}
            </Section>
          )}

          {parsed.ok && pathIssues.length > 0 && (
            <Section title="路径分段与编码对照">
              <div className="overflow-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-left font-medium">原始</th>
                      <th className="px-2 py-1.5 text-left font-medium">解码后</th>
                      <th className="px-2 py-1.5 text-left font-medium">提示</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {pathIssues.map((item) => (
                      <tr key={`${item.index}-${item.raw}`} className="border-t">
                        <td className="px-2 py-1 text-muted-foreground">{item.index}</td>
                        <td className="px-2 py-1">{item.raw}</td>
                        <td className="px-2 py-1">{item.decoded}</td>
                        <td className="px-2 py-1 font-sans text-muted-foreground">
                          {item.unencoded.length > 0
                            ? item.unencoded
                                .map((char) => `${char.char === ' ' ? '空格' : char.char}：${char.reason}`)
                                .join('；')
                            : item.decodable
                              ? '正常'
                              : '百分号序列非法'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === 'params' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="查询参数编辑"
            description="修改后实时重建 URL；支持排序、删除重复键"
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyParams(
                      [...params]
                        .map((item) => ({ key: item.key, value: item.value }))
                        .sort((a, b) =>
                          a.key === b.key ? a.value.localeCompare(b.value) : a.key.localeCompare(b.key),
                        ),
                    )
                  }
                  disabled={params.length === 0}
                >
                  <Shuffle className="size-3.5" />
                  按键排序
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const seen = new Set<string>();
                    applyParams(
                      params.filter((item) => {
                        const token = `${item.key}\u0000${item.value}`;
                        if (seen.has(token)) return false;
                        seen.add(token);
                        return true;
                      }),
                    );
                  }}
                  disabled={params.length === 0}
                >
                  <Scissors className="size-3.5" />
                  删除重复
                </Button>
              </>
            }
          >
            {params.length === 0 ? (
              <Hint>当前 URL 没有查询参数</Hint>
            ) : (
              <div className="flex flex-col gap-1.5">
                {paramRows.map((item, index) => (
                  <div key={item.rowId} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{index + 1}</span>
                    <input
                      value={item.key}
                      onChange={(event) => {
                        const next = [...params];
                        next[index] = { key: event.target.value, value: next[index]?.value ?? '' };
                        applyParams(next);
                      }}
                      className="h-8 w-1/3 rounded-md border bg-background px-2 font-mono text-xs"
                      aria-label={`第 ${index + 1} 个参数名`}
                    />
                    <span className="shrink-0 text-muted-foreground">=</span>
                    <input
                      value={item.value}
                      onChange={(event) => {
                        const next = [...params];
                        next[index] = { key: next[index]?.key ?? '', value: event.target.value };
                        applyParams(next);
                      }}
                      className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
                      aria-label={`第 ${index + 1} 个参数值`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`删除第 ${index + 1} 个参数`}
                      onClick={() => applyParams(params.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => applyParams([...params, { key: 'new', value: '' }])}>
                新增参数
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyParams(
                    curlDataToParams(params.map((item) => `a=${item.key}&b=${item.value}`).join('&')).map(
                      ({ key, value }) => ({
                        key,
                        value,
                      }),
                    ),
                  )
                }
                disabled={params.length === 0}
              >
                从 a=key&b=value 形式导入
              </Button>
            </div>
          </Section>

          <Section title="导出与复制">
            <StatGrid>
              <Stat label="参数总数" value={params.length} />
              <Stat
                label="重复键"
                value={parsed.ok ? parsed.duplicateKeys.length : 0}
                hint={parsed.ok ? parsed.duplicateKeys.join('、') : undefined}
                tone={parsed.ok && parsed.duplicateKeys.length ? 'warn' : 'info'}
              />
            </StatGrid>
            <ResultBox
              label="重建后的 URL"
              value={rebuilt ?? ''}
              rows="min-h-16"
              onCopy={() => copyText(rebuilt ?? '')}
            />
            <ResultBox
              label="JSON"
              value={paramsToJson(params as QueryParam[])}
              rows="min-h-32"
              onCopy={() => copyText(paramsToJson(params as QueryParam[]))}
            />
            <ResultBox
              label="键值对文本"
              value={paramsToKeyValue(params as QueryParam[])}
              rows="min-h-24"
              onCopy={() => copyText(paramsToKeyValue(params as QueryParam[]))}
            />
            <ResultBox
              label="curl -d 片段（空格转 +）"
              value={paramsToCurlData(params as QueryParam[])}
              rows="min-h-24"
              onCopy={() => copyText(paramsToCurlData(params as QueryParam[]))}
            />
          </Section>
        </div>
      )}

      {tab === 'encode' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="百分号编码对照">
            <Select
              label="对整条 URL 应用"
              value="all"
              onChange={() => undefined}
              options={[{ value: 'all', label: '整条 URL' }]}
              hint="下面同时给出四种写法"
            />
            <div className="flex flex-col gap-2">
              <EncodeRow label="encodeURI（保留 :/?#&= 等分隔符）" value={percentEncode(urlInput, 'uri')} />
              <EncodeRow label="encodeURIComponent（编码全部保留字符）" value={percentEncode(urlInput, 'component')} />
              <EncodeRow label="全量转义（含 !'()*）" value={percentEncode(urlInput, 'strict')} />
              <EncodeRow label="表单编码（空格 → +）" value={percentEncode(urlInput, 'form')} />
            </div>
            <Note tone="info" title="%20 与 + 的区别">
              <code className="font-mono">+</code> 只在{' '}
              <code className="font-mono">application/x-www-form-urlencoded</code> 的表单提交中表示空格； 而{' '}
              <code className="font-mono">%20</code> 是 RFC 3986 的通用写法，在 URL 路径与查询串中始终安全。 把{' '}
              <code className="font-mono">+</code> 直接写进查询串时，只有当服务端按表单规则解码才会还原为空格，
              否则会变成字面量的加号。
            </Note>
          </Section>

          <Section title="规范化" description="小写 scheme/host、去默认端口、排序参数、去 fragment、去掉末尾 /">
            {'error' in normalized ? (
              <Note tone="danger" title="无法规范化">
                {normalized.error}
              </Note>
            ) : (
              <>
                <ResultBox
                  label="规范化结果"
                  value={normalized.url}
                  rows="min-h-16"
                  onCopy={() => copyText(normalized.url)}
                />
                <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs">
                  <p className="mb-1 text-muted-foreground">逐项改动</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {normalized.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </div>
                <Note tone="warn" title="规范化会改变语义">
                  去掉 fragment 对服务端无影响，但前端单页应用常依赖 hash 路由；排序参数在签名校验（HMAC 参与原文）
                  的接口上会直接导致验签失败；部分后端对参数顺序敏感。
                </Note>
              </>
            )}
          </Section>

          {unencoded.length > 0 && (
            <Section title="未编码字符检查">
              <Note tone="warn" title={`发现 ${unencoded.length} 处应转义的字符`}>
                <ul className="list-disc space-y-0.5 pl-4">
                  {unencoded.slice(0, 12).map((item) => (
                    <li key={`${item.index}-${item.char}`}>
                      第 {item.index + 1} 位：{item.char === ' ' ? '空格' : item.char} — {item.reason}
                    </li>
                  ))}
                </ul>
              </Note>
            </Section>
          )}
        </div>
      )}

      {tab === 'relative' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="相对地址解析" description="按 RFC 3986 规则处理 ../、./、?query、#fragment">
            <TextField
              label="base（绝对地址）"
              value={baseInput}
              onChange={setBaseInput}
              placeholder="https://example.com/a/b/c"
            />
            <TextField
              label="相对地址"
              value={relativeInput}
              onChange={setRelativeInput}
              placeholder="../img/logo.png?v=1#top"
            />
            <div className="flex flex-wrap gap-1.5">
              {RELATIVE_PRESETS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant="outline"
                  className="font-mono"
                  onClick={() => setRelativeInput(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="解析结果">
            {resolved.ok ? (
              <>
                <ResultBox
                  label="解析后的绝对地址"
                  value={resolved.href}
                  rows="min-h-16"
                  onCopy={() => copyText(resolved.href)}
                />
                <StatGrid>
                  <Stat label="hostname" value={resolved.hostname} />
                  <Stat label="pathname" value={resolved.pathname} />
                  <Stat label="search" value={resolved.search || '—'} />
                  <Stat label="hash" value={resolved.hash || '—'} />
                </StatGrid>
                <Note tone="info" title="解析要点">
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>相对路径以 base 的目录（去掉最后一段）为基准逐级回退或下钻</li>
                    <li>以 / 开头表示从根路径开始，不受 base 目录影响</li>
                    <li>以 ? 开头只替换查询串，路径保持 base 的结果</li>
                    <li>以 # 开头只追加片段，同样保留路径与查询串</li>
                    <li>以 {'//'} 开头表示协议相对地址，会继承 base 的协议</li>
                  </ul>
                </Note>
              </>
            ) : (
              <Note tone="danger" title="解析失败">
                {resolved.error}
              </Note>
            )}
            <Note tone="info" title="当前输入判定">
              当前 URL 被判定为{looksRelative(urlInput) ? '相对地址（缺少协议或 // 前缀）' : '绝对地址'}； 在 JavaScript
              中解析相对地址必须提供第二个参数 base，否则会抛出异常。
            </Note>
          </Section>
        </div>
      )}

      <Note tone="info" title="离线解析说明">
        <span className="inline-flex items-center gap-1">
          <Link2 className="size-3" />
          全部解析基于浏览器内置的 URL 实现（WHATWG Standard）完成，不会发起任何网络请求；
          规范化后的结果仅供比较使用，请勿直接用于生产请求。
        </span>
      </Note>
    </ToolPanel>
  );
}

function EncodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-muted-foreground">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1"
          onClick={() => copyText(value)}
          aria-label={`复制${label}`}
        >
          复制
        </Button>
      </div>
      <p className="break-all font-mono text-xs">{value || '—'}</p>
    </div>
  );
}
