import {
  AlertTriangle,
  Copy,
  Eraser,
  FileJson,
  FolderTree,
  Gauge,
  Play,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Field, NumberField, TextField } from '../components/ui/field';
import { Hint, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { downloadText, exportName, pickFile, readAsText } from '../lib/file';
import {
  type AssertionRule,
  type AssertionType,
  applyVariables,
  buildMockResponse,
  collectVariables,
  curlToHar,
  curlToRequest,
  type Environment,
  evaluateAssertions,
  fillTemplate,
  generateAxios,
  generateCurl,
  generateFetch,
  generateHttpie,
  generateOpenApi,
  generatePostmanCollection,
  type HarEntry,
  type HeaderRow,
  harContentText,
  harSummary,
  harToCurl,
  type MockResponse,
  type MockRoute,
  matchMockRoute,
  mockDirectory,
  parseHar,
  parseResponseText,
  type RequestSpec,
  timingSegments,
} from '../lib/har';

export type Tab = 'har' | 'curl' | 'request' | 'assert' | 'mock' | 'guide';

const HAR_PRESET = JSON.stringify(
  {
    log: {
      version: '1.2',
      creator: { name: 'packet-debug 示例', version: '1.0' },
      entries: [
        {
          startedDateTime: '2026-01-01T00:00:00.000Z',
          time: 128.4,
          request: {
            method: 'POST',
            url: 'https://api.example.com/v1/orders?draft=1',
            httpVersion: 'HTTP/2',
            headers: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Authorization', value: 'Bearer demo-token' },
            ],
            queryString: [{ name: 'draft', value: '1' }],
            cookies: [],
            postData: { mimeType: 'application/json', text: '{"sku":"A-1","qty":2}' },
            headersSize: -1,
            bodySize: 24,
          },
          response: {
            status: 201,
            statusText: 'Created',
            httpVersion: 'HTTP/2',
            headers: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'X-Trace-Id', value: 'trace-0001' },
            ],
            cookies: [],
            content: { size: 42, mimeType: 'application/json', text: '{"id":9001,"state":"created"}' },
            redirectURL: '',
            headersSize: -1,
            bodySize: 42,
            timings: { blocked: 1, dns: 4, connect: 8, send: 1, wait: 100, receive: 14, ssl: 6 },
          },
          cache: {},
        },
        {
          startedDateTime: '2026-01-01T00:00:01.000Z',
          time: 36.2,
          request: {
            method: 'GET',
            url: 'https://cdn.example.com/app.css',
            httpVersion: 'http/1.1',
            headers: [],
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: 0,
          },
          response: {
            status: 304,
            statusText: 'Not Modified',
            httpVersion: 'http/1.1',
            headers: [{ name: 'ETag', value: 'W/"abc"' }],
            cookies: [],
            content: { size: 0, mimeType: '', text: '', encoding: '' },
            redirectURL: '',
            headersSize: -1,
            bodySize: 0,
            timings: { blocked: 0, dns: -1, connect: -1, send: 0, wait: 30, receive: 6, ssl: -1 },
          },
          cache: { beforeRequest: {}, afterRequest: {} },
        },
      ],
    },
  },
  null,
  2,
);

const CURL_PRESET = `curl 'https://api.example.com/v1/users?page=1' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer demo-token' \\
  --data-raw '{"name":"张三","age":18}' \\
  --compressed`;

const RESPONSE_PRESET = `HTTP/2 201
content-type: application/json
x-response-time: 42
x-trace-id: trace-0001

{"id":9001,"state":"created","items":[{"sku":"A-1","qty":2}]}`;

const DEFAULT_HEADERS: HeaderRow[] = [
  { id: 'h-content-type', key: 'Content-Type', value: 'application/json', enabled: true },
  { id: 'h-auth', key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
];

const DEFAULT_FORM = [{ id: 'f-1', key: 'sku', value: 'A-1', enabled: true }];

const DEFAULT_ASSERTIONS: AssertionRule[] = [
  { id: 'as-1', type: 'status', field: '', operator: 'equals', expected: '201', enabled: true },
  { id: 'as-2', type: 'jsonPath', field: '$.state', operator: 'equals', expected: 'created', enabled: true },
  { id: 'as-3', type: 'header', field: 'content-type', operator: 'contains', expected: 'json', enabled: true },
  { id: 'as-4', type: 'time', field: '', operator: 'lt', expected: '500', enabled: true },
];

const DEFAULT_MOCKS: MockRoute[] = [
  {
    id: 'm-1',
    method: 'GET',
    path: '/api/users/**',
    status: 200,
    headers: '{"content-type":"application/json"}',
    body: '{"code":0,"data":[{"id":{{int}},"name":"{{name}}","email":"{{email}}"}]}',
    enabled: true,
  },
  {
    id: 'm-2',
    method: 'POST',
    path: '/api/orders',
    status: 201,
    headers: 'content-type: application/json',
    body: '{"code":0,"data":{"id":{{int}},"createdAt":"{{iso}}"}}',
    enabled: true,
  },
];

const BODY_TYPE_OPTIONS = [
  { value: 'none', label: '无 body' },
  { value: 'json', label: 'JSON' },
  { value: 'form', label: '表单 x-www-form-urlencoded' },
  { value: 'raw', label: '原始文本' },
];

const ASSERT_TYPE_OPTIONS: { value: AssertionType; label: string }[] = [
  { value: 'status', label: '状态码' },
  { value: 'header', label: '响应头' },
  { value: 'jsonPath', label: 'JSON 路径' },
  { value: 'regex', label: '正则匹配 body' },
  { value: 'time', label: '响应耗时(ms)' },
  { value: 'bodyContains', label: 'body 包含文本' },
];

const OPERATOR_OPTIONS = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'matches', label: '正则匹配' },
  { value: 'lt', label: '小于' },
  { value: 'gt', label: '大于' },
  { value: 'exists', label: '存在' },
];

const TIMING_COLOR: Record<string, string> = {
  blocked: 'bg-slate-400',
  dns: 'bg-sky-500',
  connect: 'bg-indigo-500',
  ssl: 'bg-violet-500',
  send: 'bg-amber-500',
  wait: 'bg-emerald-500',
  receive: 'bg-teal-500',
};

let idSeed = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idSeed += 1)}`;

export default function PacketDebug() {
  const [tab, setTab] = useState<string>('har');

  /* HAR 分析 */
  const [harText, setHarText] = useState(HAR_PRESET);
  const [entryIndex, setEntryIndex] = useState(0);
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urlKeyword, setUrlKeyword] = useState('');
  const parsedHar = useMemo(() => parseHar(harText), [harText]);
  const summary = useMemo(() => (parsedHar.ok ? harSummary(parsedHar.entries) : null), [parsedHar]);
  const filtered = useMemo(() => {
    if (!parsedHar.ok) return [];
    const keyword = urlKeyword.trim().toLowerCase();
    return parsedHar.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (methodFilter && entry.request.method !== methodFilter) return false;
        if (statusFilter && String(entry.response.status) !== statusFilter) return false;
        if (keyword && !entry.request.url.toLowerCase().includes(keyword)) return false;
        return true;
      });
  }, [parsedHar, methodFilter, statusFilter, urlKeyword]);
  const activeRow = filtered[Math.min(entryIndex, Math.max(0, filtered.length - 1))];
  const currentEntry: HarEntry | undefined = activeRow?.entry;

  /* cURL 解析 */
  const [curlText, setCurlText] = useState(CURL_PRESET);
  const curlParsed = useMemo(() => curlToRequest(curlText), [curlText]);
  const curlEntry = useMemo(() => (curlParsed.error ? null : curlToHar(curlText)), [curlParsed, curlText]);

  /* 请求构造 */
  const [method, setMethod] = useState('POST');
  const [url, setUrl] = useState('https://api.example.com/v1/orders');
  const [headers, setHeaders] = useState<HeaderRow[]>(DEFAULT_HEADERS);
  const [bodyType, setBodyType] = useState<RequestSpec['bodyType']>('json');
  const [body, setBody] = useState('{\n  "sku": "A-1",\n  "qty": 2\n}');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [environments, setEnvironments] = useState<Environment[]>([
    { id: 'env-1', name: '本地开发', active: true, variables: [{ key: 'token', value: 'dev-token' }] },
    { id: 'env-2', name: '预发环境', active: false, variables: [{ key: 'token', value: 'staging-token' }] },
  ]);

  const spec: RequestSpec = useMemo(
    () => ({ method, url, headers, body, bodyType, form }),
    [method, url, headers, body, bodyType, form],
  );
  const activeEnv = environments.find((item) => item.active);
  const resolvedSpec: RequestSpec = useMemo(() => {
    if (!activeEnv) return spec;
    const vars = activeEnv.variables;
    return {
      ...spec,
      url: applyVariables(spec.url, vars),
      body: applyVariables(spec.body, vars),
      headers: spec.headers.map((row) => ({ ...row, value: applyVariables(row.value, vars) })),
    };
  }, [spec, activeEnv]);
  const templateVars = useMemo(
    () => collectVariables(`${spec.url}\n${spec.body}\n${spec.headers.map((item) => item.value).join('\n')}`),
    [spec],
  );

  /* 断言 */
  const [responseText, setResponseText] = useState(RESPONSE_PRESET);
  const [rules, setRules] = useState<AssertionRule[]>(DEFAULT_ASSERTIONS);
  const response = useMemo(() => parseResponseText(responseText), [responseText]);
  const results = useMemo(() => evaluateAssertions(rules, response), [rules, response]);
  const passedCount = results.filter((item) => item.passed).length;
  const resultLog = results.map((item) => `${item.passed ? 'PASS' : 'FAIL'} ${item.message}`).join('\n');

  /* Mock */
  const [mocks, setMocks] = useState<MockRoute[]>(DEFAULT_MOCKS);
  const [probeMethod, setProbeMethod] = useState('GET');
  const [probeUrl, setProbeUrl] = useState('https://api.example.com/api/users/9001?fields=id');
  const probeMatch = useMemo(() => matchMockRoute(mocks, probeMethod, probeUrl), [mocks, probeMethod, probeUrl]);
  const probeResponse: MockResponse | null = useMemo(() => {
    if (!probeMatch) return null;
    const built = buildMockResponse(probeMatch.route);
    return { status: built.status, headers: built.headers, body: built.body, time: 12 };
  }, [probeMatch]);
  const probeText = probeResponse
    ? [
        `HTTP/1.1 ${probeResponse.status}`,
        ...probeResponse.headers.map((item) => `${item.name}: ${item.value}`),
        '',
        probeResponse.body,
      ].join('\n')
    : '';

  const handleTabChange = useCallback((value: string) => setTab(value), []);

  return (
    <ToolPanel
      title="HTTP 抓包调试"
      description="解析 HAR、把请求转成 cURL 或代码、用断言核对响应，并生成 Mock 规则"
      actions={
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger active={tab === 'har'} value="har">
              HAR 分析
            </TabsTrigger>
            <TabsTrigger active={tab === 'curl'} value="curl">
              cURL 解析
            </TabsTrigger>
            <TabsTrigger active={tab === 'request'} value="request">
              请求构造
            </TabsTrigger>
            <TabsTrigger active={tab === 'assert'} value="assert">
              断言核对
            </TabsTrigger>
            <TabsTrigger active={tab === 'mock'} value="mock">
              Mock
            </TabsTrigger>
            <TabsTrigger active={tab === 'guide'} value="guide">
              调试指引
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <Note tone="info" title="本地处理">
        <span className="inline-flex items-center gap-1">
          <Gauge className="size-3" />
          HAR、cURL、响应文本全部只在当前标签页内存中解析，刷新页面即清空；文件导入走浏览器 File API，不经过任何服务器。
        </span>
      </Note>
      {tab === 'har' && (
        <div className="flex flex-col gap-3">
          <Section
            title="HAR 输入"
            description="支持 DevTools 导出的 .har JSON，base64 响应体会自动解码"
            actions={
              <div className="flex flex-row gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const file = await pickFile({ accept: '.har,.json,application/json' });
                    if (!file) return;
                    setHarText(await readAsText(file));
                  }}
                >
                  <Upload className="size-3.5" />
                  导入 .har
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadText(exportName('requests', '.har'), harText, 'application/json')}
                  disabled={!harText}
                >
                  <FileJson className="size-3.5" />
                  导出 HAR
                </Button>
                <ClearButton onClick={() => setHarText('')} disabled={!harText} />
              </div>
            }
          >
            <Field label="HAR JSON">
              <Textarea
                value={harText}
                onChange={(event) => setHarText(event.target.value)}
                placeholder='{"log":{"version":"1.2","entries":[…]}}'
                spellCheck={false}
                className="min-h-40 resize-none font-mono text-xs"
              />
            </Field>
            {parsedHar.ok ? (
              <Note
                tone="success"
                title={`解析成功：HAR ${parsedHar.har.version}，共 ${parsedHar.entries.length} 条记录`}
              >
                来自 {parsedHar.har.creator.name} {parsedHar.har.creator.version}。全部在本地内存中处理，不会上传。
              </Note>
            ) : (
              <Note tone="danger" title="HAR 解析失败">
                {parsedHar.error}
              </Note>
            )}
          </Section>

          {summary && (
            <Section title="统计概览">
              <StatGrid>
                <Stat label="请求数" value={summary.total} />
                <Stat label="总耗时" value={`${summary.totalTime} ms`} />
                <Stat label="平均耗时" value={`${summary.averageTime} ms`} />
                <Stat label="最慢" value={`${summary.maxTime} ms`} />
                <Stat label="响应体积合计" value={`${summary.totalTransfer} B`} />
                <Stat label="命中缓存" value={summary.cacheHits} hint="cache 字段非空" />
              </StatGrid>
              <div className="grid gap-3 md:grid-cols-3">
                <Distribution title="方法分布" items={summary.methods} />
                <Distribution
                  title="状态码分布"
                  items={summary.statuses}
                  tone={
                    summary.statuses.some((item) => item.key.startsWith('4') || item.key.startsWith('5'))
                      ? 'warn'
                      : 'info'
                  }
                />
                <Distribution title="域名分布" items={summary.hosts} />
              </div>
              <div className="overflow-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <caption className="sr-only">耗时最慢的请求</caption>
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-left font-medium">请求</th>
                      <th className="px-2 py-1.5 text-left font-medium">状态</th>
                      <th className="px-2 py-1.5 text-left font-medium">耗时</th>
                      <th className="px-2 py-1.5 text-left font-medium">耗时分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.slowest.map((item) => {
                      const segments = timingSegments(item.entry).filter((segment) => segment.value > 0);
                      const total = Math.max(
                        1,
                        segments.reduce((sum, segment) => sum + segment.value, 0),
                      );
                      return (
                        <tr key={`slow-${item.index}`} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground">{item.index}</td>
                          <td className="px-2 py-1 font-mono">
                            <span className="font-sans text-muted-foreground">{item.entry.request.method}</span>{' '}
                            {item.entry.request.url}
                          </td>
                          <td className="px-2 py-1 font-mono">{item.entry.response.status}</td>
                          <td className="px-2 py-1 font-mono">{Math.round(item.entry.time)} ms</td>
                          <td className="px-2 py-1">
                            <span className="flex h-2 w-full overflow-hidden rounded bg-muted">
                              {segments.map((segment) => (
                                <span
                                  key={segment.key}
                                  title={`${segment.label} ${segment.value} ms`}
                                  style={{ width: `${(segment.value / total) * 100}%` }}
                                  className={TIMING_COLOR[segment.key] ?? 'bg-muted-foreground'}
                                />
                              ))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {parsedHar.ok && (
            <Section
              title="请求明细"
              description="按方法、状态码与 URL 关键字筛选后逐条查看"
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMethodFilter('');
                    setStatusFilter('');
                    setUrlKeyword('');
                    setEntryIndex(0);
                  }}
                  disabled={!methodFilter && !statusFilter && !urlKeyword}
                >
                  <Eraser className="size-3.5" />
                  清除筛选
                </Button>
              }
            >
              <div className="grid gap-2 md:grid-cols-3">
                <Select
                  label="方法"
                  value={methodFilter}
                  onChange={(value) => {
                    setMethodFilter(value);
                    setEntryIndex(0);
                  }}
                  options={[
                    { value: '', label: '全部方法' },
                    ...(summary?.methods ?? []).map((item) => ({ value: item.key, label: item.key })),
                  ]}
                />
                <Select
                  label="状态码"
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value);
                    setEntryIndex(0);
                  }}
                  options={[
                    { value: '', label: '全部状态码' },
                    ...(summary?.statuses ?? []).map((item) => ({ value: item.key, label: item.key })),
                  ]}
                />
                <TextField
                  label="URL 关键字"
                  value={urlKeyword}
                  onChange={(value) => {
                    setUrlKeyword(value);
                    setEntryIndex(0);
                  }}
                  placeholder="例如 /v1/"
                />
              </div>

              <div className="max-h-56 overflow-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <caption className="sr-only">筛选后的请求列表</caption>
                  <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">#</th>
                      <th className="px-2 py-1.5 text-left font-medium">方法</th>
                      <th className="px-2 py-1.5 text-left font-medium">URL</th>
                      <th className="px-2 py-1.5 text-left font-medium">状态</th>
                      <th className="px-2 py-1.5 text-right font-medium">耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ entry, index }, position) => (
                      <tr
                        key={`row-${index}-${entry.request.url}`}
                        className={`cursor-pointer border-t ${activeRow && activeRow.index === index ? 'bg-accent/60' : ''}`}
                        onClick={() => setEntryIndex(position)}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{index}</td>
                        <td className="px-2 py-1 font-mono">{entry.request.method}</td>
                        <td className="max-w-[22rem] truncate px-2 py-1 font-mono">{entry.request.url}</td>
                        <td className="px-2 py-1 font-mono">{entry.response.status}</td>
                        <td className="px-2 py-1 text-right font-mono">{Math.round(entry.time)} ms</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                          没有符合筛选条件的请求
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {currentEntry ? (
                <>
                  <StatGrid>
                    <Stat label="方法" value={currentEntry.request.method} />
                    <Stat
                      label="状态"
                      value={`${currentEntry.response.status} ${currentEntry.response.statusText}`.trim()}
                      tone={
                        currentEntry.response.status >= 500
                          ? 'danger'
                          : currentEntry.response.status >= 400 || currentEntry.response.status >= 300
                            ? 'warn'
                            : 'success'
                      }
                    />
                    <Stat label="协议" value={currentEntry.response.httpVersion} />
                    <Stat label="总耗时" value={`${Math.round(currentEntry.time)} ms`} />
                    <Stat label="响应体积" value={`${Math.max(0, currentEntry.response.bodySize)} B`} />
                    <Stat label="重定向到" value={currentEntry.response.redirectURL || '—'} />
                  </StatGrid>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ResultBox
                      label="请求 URL"
                      value={currentEntry.request.url}
                      rows="min-h-16"
                      onCopy={() => copyText(currentEntry.request.url)}
                    />
                    <ResultBox
                      label="请求头"
                      value={headerLines(currentEntry.request.headers)}
                      rows="min-h-40"
                      onCopy={() => copyText(headerLines(currentEntry.request.headers))}
                    />
                    <ResultBox
                      label="请求体"
                      value={currentEntry.request.postData?.text ?? '（无）'}
                      rows="min-h-24"
                      onCopy={() => copyText(currentEntry.request.postData?.text ?? '')}
                    />
                    <ResultBox
                      label="响应头"
                      value={headerLines(currentEntry.response.headers)}
                      rows="min-h-40"
                      onCopy={() => copyText(headerLines(currentEntry.response.headers))}
                    />
                    <ResultBox
                      label={`响应体${currentEntry.response.content.encoding === 'base64' ? '（已解码 base64）' : ''}`}
                      value={harContentText(currentEntry) || '（空）'}
                      rows="min-h-40"
                      onCopy={() => copyText(harContentText(currentEntry))}
                    />
                    <div className="flex flex-col gap-1.5">
                      <ResultBox
                        label="cURL（浏览器导出风格）"
                        value={harToCurl(currentEntry)}
                        rows="min-h-40"
                        onCopy={() => copyText(harToCurl(currentEntry))}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCurlText(harToCurl(currentEntry));
                            setTab('curl');
                          }}
                        >
                          <Terminal className="size-3.5" />
                          送到 cURL 解析
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMethod(currentEntry.request.method);
                            setUrl(currentEntry.request.url);
                            setHeaders(
                              currentEntry.request.headers.map((item, position) => ({
                                id: `h-import-${position}`,
                                key: item.name,
                                value: item.value,
                                enabled: true,
                              })),
                            );
                            const post = currentEntry.request.postData;
                            const mime = post?.mimeType ?? '';
                            if (!post?.text) {
                              setBodyType('none');
                            } else if (mime.includes('json')) {
                              setBodyType('json');
                              setBody(post.text);
                            } else if (mime.includes('x-www-form-urlencoded')) {
                              setBodyType('form');
                              setForm(
                                post.text.split('&').map((pair, position) => {
                                  const [key = '', value = ''] = pair.split('=');
                                  return {
                                    id: `f-import-${position}`,
                                    key: decodeURIComponent(key),
                                    value: decodeURIComponent(value.replace(/\+/g, ' ')),
                                    enabled: true,
                                  };
                                }),
                              );
                            } else {
                              setBodyType('raw');
                              setBody(post.text);
                            }
                            setTab('request');
                          }}
                        >
                          <Plus className="size-3.5" />
                          送到请求构造
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setResponseText(
                              [
                                `HTTP/${currentEntry.response.httpVersion.replace('HTTP/', '')} ${currentEntry.response.status} ${currentEntry.response.statusText}`.trim(),
                                headerLines(currentEntry.response.headers),
                                '',
                                harContentText(currentEntry),
                              ].join('\n'),
                            );
                            setTab('assert');
                          }}
                        >
                          <ShieldCheck className="size-3.5" />
                          送到断言核对
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <Hint>请选择一条请求查看明细</Hint>
              )}
            </Section>
          )}
        </div>
      )}

      {tab === 'curl' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="cURL 命令"
            description="支持多行续行、单双引号、-H/--header、-d/--data-raw/-F、-u/-b、-G 等常见写法"
            actions={
              <div className="flex flex-row gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const file = await pickFile({ accept: '.txt,.sh,text/plain' });
                    if (!file) return;
                    setCurlText(await readAsText(file));
                  }}
                >
                  <Upload className="size-3.5" />
                  导入文本
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCurlText(CURL_PRESET)}>
                  示例
                </Button>
                <ClearButton onClick={() => setCurlText('')} disabled={!curlText} />
              </div>
            }
          >
            <Field label="curl 命令">
              <Textarea
                value={curlText}
                onChange={(event) => setCurlText(event.target.value)}
                spellCheck={false}
                className="min-h-40 resize-none font-mono text-xs"
                placeholder="curl 'https://api.example.com/v1/users' -H 'Accept: application/json'"
              />
            </Field>
            <Note tone="info" title="解析范围">
              会先折叠「\」续行再做引号切分，因此 Chrome 的「Copy as cURL」多行输出可以直接粘贴；
              <code className="font-mono">--config</code>、管道、重定向等 shell 特性不会被求值。
            </Note>
          </Section>

          <Section title="解析结果">
            {curlParsed.error ? (
              <Note tone="danger" title="解析失败">
                {curlParsed.error}
              </Note>
            ) : (
              <>
                <StatGrid>
                  <Stat label="方法" value={curlParsed.method} />
                  <Stat label="URL" value={curlParsed.url} />
                  <Stat label="请求头数" value={curlParsed.headers.length} />
                  <Stat label="body 长度" value={curlParsed.body.length} />
                  <Stat
                    label="Basic 认证"
                    value={curlParsed.auth ? curlParsed.auth.replace(/:[^:]*$/, ':***') : '—'}
                    tone={curlParsed.auth ? 'warn' : 'info'}
                  />
                  <Stat label="Cookie" value={curlParsed.cookies ? `${curlParsed.cookies.slice(0, 40)}…` : '—'} />
                </StatGrid>
                <ResultBox
                  label="请求头"
                  value={headerLines(curlParsed.headers)}
                  rows="min-h-32"
                  onCopy={() => copyText(headerLines(curlParsed.headers))}
                />
                <ResultBox
                  label="body"
                  value={curlParsed.body || '（无）'}
                  rows="min-h-24"
                  onCopy={() => copyText(curlParsed.body)}
                />
                {curlParsed.flags.length > 0 && (
                  <Note tone="info" title="识别到的选项">
                    {curlParsed.flags.join('、')}。未识别的选项会被忽略，生成请求时不会带上。
                  </Note>
                )}
                <ResultBox
                  label="规范化后的 HAR 请求"
                  value={curlEntry ? JSON.stringify(curlEntry.request, null, 2) : ''}
                  rows="min-h-40"
                  onCopy={() => copyText(curlEntry ? JSON.stringify(curlEntry.request, null, 2) : '')}
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!curlEntry) return;
                      downloadText(
                        exportName('curl-request', '.json'),
                        JSON.stringify(curlEntry, null, 2),
                        'application/json',
                      );
                    }}
                    disabled={!curlEntry}
                  >
                    <FileJson className="size-3.5" />
                    导出为 HAR 条目
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!curlEntry) return;
                      setMethod(curlEntry.request.method);
                      setUrl(curlEntry.request.url);
                      setHeaders(
                        curlEntry.request.headers.map((item, position) => ({
                          id: `h-curl-${position}`,
                          key: item.name,
                          value: item.value,
                          enabled: true,
                        })),
                      );
                      const text = curlEntry.request.postData?.text ?? '';
                      const mime = curlEntry.request.postData?.mimeType ?? '';
                      if (!text) setBodyType('none');
                      else if (mime.includes('json')) {
                        setBodyType('json');
                        setBody(text);
                      } else if (mime.includes('x-www-form-urlencoded')) {
                        setBodyType('form');
                        setForm(
                          text.split('&').map((pair, position) => {
                            const [key = '', value = ''] = pair.split('=');
                            return {
                              id: `f-curl-${position}`,
                              key: decodeURIComponent(key),
                              value: decodeURIComponent(value.replace(/\+/g, ' ')),
                              enabled: true,
                            };
                          }),
                        );
                      } else {
                        setBodyType('raw');
                        setBody(text);
                      }
                      setTab('request');
                    }}
                    disabled={!curlEntry}
                  >
                    <Plus className="size-3.5" />
                    送到请求构造
                  </Button>
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      {tab === 'request' && (
        <div className="flex flex-col gap-3">
          <Section
            title="请求定义"
            description="填写后生成 cURL / fetch / axios / httpie 代码，支持 {{变量}} 与环境切换"
          >
            <div className="grid gap-2 md:grid-cols-3">
              <Select
                label="方法"
                value={method}
                onChange={setMethod}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((item) => ({
                  value: item,
                  label: item,
                }))}
              />
              <div className="md:col-span-2">
                <TextField label="URL" value={url} onChange={setUrl} placeholder="https://api.example.com/v1/users" />
              </div>
              <Select
                label="body 类型"
                value={bodyType}
                onChange={(value) => setBodyType(value as RequestSpec['bodyType'])}
                options={BODY_TYPE_OPTIONS}
              />
            </div>

            <HeaderEditor headers={headers} onChange={setHeaders} />

            {bodyType === 'form' ? (
              <FormEditor form={form} onChange={setForm} />
            ) : (
              <>
                <Field
                  label={bodyType === 'json' ? 'JSON body' : bodyType === 'raw' ? '原始 body' : 'body（当前类型为无）'}
                >
                  <Textarea
                    value={bodyType === 'none' ? '' : body}
                    onChange={(event) => setBody(event.target.value)}
                    spellCheck={false}
                    disabled={bodyType === 'none'}
                    className="min-h-32 resize-none font-mono text-xs"
                  />
                </Field>
                {bodyType === 'json' && <JsonHint text={body} />}
              </>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setBody(JSON.stringify({ name: '{{name}}', email: '{{email}}', id: '{{int}}' }, null, 2))
                }
              >
                填入示例 JSON
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBody('{"broken": }')}>
                填入错误 JSON
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBody('')}>
                清空 body
              </Button>
            </div>
          </Section>

          <Section title="环境变量" description="用 {{key}} 引用；生成代码前会替换为当前激活环境的值">
            <div className="flex flex-wrap gap-1.5">
              {environments.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={item.active ? 'default' : 'outline'}
                  onClick={() => setEnvironments(environments.map((env) => ({ ...env, active: env.id === item.id })))}
                >
                  {item.active ? <Play className="size-3.5" /> : null}
                  {item.name}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEnvironments([
                    ...environments,
                    { id: nextId('env'), name: `环境 ${environments.length + 1}`, active: false, variables: [] },
                  ])
                }
              >
                <Plus className="size-3.5" />
                新增环境
              </Button>
            </div>
            {activeEnv ? (
              <div className="flex flex-col gap-1.5">
                {activeEnv.variables.map((item, position) => (
                  <div key={item.key} className="flex items-center gap-1.5">
                    <input
                      value={item.key}
                      onChange={(event) =>
                        updateVariable(environments, setEnvironments, activeEnv.id, position, 'key', event.target.value)
                      }
                      className="h-8 w-1/3 rounded-md border bg-background px-2 font-mono text-xs"
                      aria-label={`第 ${position + 1} 个变量名`}
                    />
                    <span className="shrink-0 text-muted-foreground">=</span>
                    <input
                      value={item.value}
                      onChange={(event) =>
                        updateVariable(
                          environments,
                          setEnvironments,
                          activeEnv.id,
                          position,
                          'value',
                          event.target.value,
                        )
                      }
                      className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
                      aria-label={`第 ${position + 1} 个变量值`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`删除第 ${position + 1} 个变量`}
                      onClick={() =>
                        setEnvironments(
                          environments.map((env) =>
                            env.id === activeEnv.id
                              ? { ...env, variables: env.variables.filter((_, i) => i !== position) }
                              : env,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEnvironments(
                      environments.map((env) =>
                        env.id === activeEnv.id
                          ? {
                              ...env,
                              variables: [...env.variables, { key: `var${env.variables.length + 1}`, value: '' }],
                            }
                          : env,
                      ),
                    )
                  }
                >
                  <Plus className="size-3.5" />
                  新增变量
                </Button>
              </div>
            ) : (
              <Hint>没有激活的环境，生成的代码会保留 {'{{变量}}'} 占位符</Hint>
            )}
            {templateVars.length > 0 && (
              <Note tone="info" title="检测到的占位符">
                {templateVars.join('、')}。未在环境变量中定义时会原样保留，方便在 Postman / CI 中再替换。
              </Note>
            )}
          </Section>

          <Section title="生成代码" description="全部离线生成，不会发起任何请求">
            <div className="grid gap-3 md:grid-cols-2">
              <ResultBox
                label="cURL"
                value={generateCurl(resolvedSpec)}
                rows="min-h-40"
                onCopy={() => copyText(generateCurl(resolvedSpec))}
              />
              <ResultBox
                label="fetch"
                value={generateFetch(resolvedSpec)}
                rows="min-h-40"
                onCopy={() => copyText(generateFetch(resolvedSpec))}
              />
              <ResultBox
                label="axios"
                value={generateAxios(resolvedSpec)}
                rows="min-h-40"
                onCopy={() => copyText(generateAxios(resolvedSpec))}
              />
              <ResultBox
                label="httpie"
                value={generateHttpie(resolvedSpec)}
                rows="min-h-24"
                onCopy={() => copyText(generateHttpie(resolvedSpec))}
              />
              <ResultBox
                label="Postman Collection"
                value={generatePostmanCollection(resolvedSpec)}
                rows="min-h-40"
                onCopy={() => copyText(generatePostmanCollection(resolvedSpec))}
              />
              <ResultBox
                label="OpenAPI 片段"
                value={generateOpenApi(resolvedSpec)}
                rows="min-h-40"
                onCopy={() => copyText(generateOpenApi(resolvedSpec))}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    exportName('collection', '.postman_collection.json'),
                    generatePostmanCollection(resolvedSpec),
                    'application/json',
                  )
                }
              >
                导出 Postman
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(exportName('api', '.openapi.json'), generateOpenApi(resolvedSpec), 'application/json')
                }
              >
                导出 OpenAPI
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCurlText(generateCurl(spec));
                  setTab('curl');
                }}
              >
                <Terminal className="size-3.5" />
                把生成的 cURL 送去解析
              </Button>
            </div>
          </Section>
        </div>
      )}

      {tab === 'assert' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="响应文本"
            description="支持「响应头 + 空行 + body」；耗时取 x-response-time 头"
            actions={
              <div className="flex flex-row gap-1">
                <Button size="sm" variant="outline" onClick={() => setResponseText(RESPONSE_PRESET)}>
                  示例
                </Button>
                <ClearButton onClick={() => setResponseText('')} disabled={!responseText} />
              </div>
            }
          >
            <Field label="响应">
              <Textarea
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                spellCheck={false}
                className="min-h-40 resize-none font-mono text-xs"
                placeholder={'HTTP/2 200\ncontent-type: application/json\n\n{"ok":true}'}
              />
            </Field>
            <StatGrid>
              <Stat label="状态码" value={response.status} tone={response.status >= 400 ? 'warn' : 'success'} />
              <Stat label="响应头数" value={response.headers.length} />
              <Stat label="body 长度" value={response.body.length} />
              <Stat label="解析出的耗时" value={`${response.time} ms`} />
            </StatGrid>
          </Section>

          <Section
            title="断言规则"
            description="状态码、响应头、JSON 路径、正则、body 包含与耗时"
            actions={
              <div className="flex flex-row gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRules([
                      ...rules,
                      {
                        id: nextId('as'),
                        type: 'bodyContains',
                        field: '',
                        operator: 'contains',
                        expected: '',
                        enabled: true,
                      },
                    ])
                  }
                >
                  <Plus className="size-3.5" />
                  新增断言
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRules(DEFAULT_ASSERTIONS)}>
                  <Eraser className="size-3.5" />
                  重置
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-2">
              {rules.map((rule) => (
                <RuleEditor
                  key={rule.id}
                  rule={rule}
                  onChange={(next) => setRules(rules.map((item) => (item.id === rule.id ? next : item)))}
                  onRemove={() => setRules(rules.filter((item) => item.id !== rule.id))}
                />
              ))}
              {rules.length === 0 && <Hint>还没有断言规则</Hint>}
            </div>
          </Section>

          <Section title={`断言结果：${passedCount}/${results.length} 通过`}>
            {results.length === 0 ? (
              <Hint>添加规则后即可逐条核对</Hint>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  {results.map((item) => (
                    <div
                      key={item.rule.id}
                      className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${item.passed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}
                    >
                      <span
                        className={`mt-0.5 font-mono ${item.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {item.passed ? 'PASS' : 'FAIL'}
                      </span>
                      <span className="min-w-0">
                        {item.message}
                        <span className="block text-[10px] text-muted-foreground">
                          {ASSERT_TYPE_OPTIONS.find((option) => option.value === item.rule.type)?.label} ·{' '}
                          {OPERATOR_OPTIONS.find((option) => option.value === item.rule.operator)?.label}{' '}
                          {item.rule.expected || '—'}
                          {item.rule.field ? ` · 字段 ${item.rule.field}` : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <ResultBox
                  label="结果摘要（可贴进日志）"
                  value={resultLog}
                  rows="min-h-24"
                  onCopy={() => copyText(resultLog)}
                />
              </>
            )}
          </Section>
        </div>
      )}

      {tab === 'mock' && (
        <div className="flex flex-col gap-3">
          <Section
            title="Mock 规则"
            description="路径支持 * 单层与 ** 多层通配；响应头与 body 支持 {{uuid}}、{{int}}、{{name}}、{{email}}、{{iso}}、{{timestamp}}、{{ip}} 等占位符"
            actions={
              <div className="flex flex-row gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMocks([
                      ...mocks,
                      {
                        id: nextId('m'),
                        method: 'GET',
                        path: '/api/new/**',
                        status: 200,
                        headers: '{"content-type":"application/json"}',
                        body: '{"code":0,"data":null}',
                        enabled: true,
                      },
                    ])
                  }
                >
                  <Plus className="size-3.5" />
                  新增规则
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText(exportName('mock-routes', '.json'), mockDirectory(mocks), 'application/json')
                  }
                  disabled={mocks.length === 0}
                >
                  <FolderTree className="size-3.5" />
                  导出目录
                </Button>
                <ClearButton onClick={() => setMocks([])} disabled={mocks.length === 0} />
              </div>
            }
          >
            {mocks.length === 0 ? (
              <Hint>还没有 Mock 规则</Hint>
            ) : (
              <div className="flex flex-col gap-3">
                {mocks.map((route) => (
                  <MockEditor
                    key={route.id}
                    route={route}
                    onChange={(next) => setMocks(mocks.map((item) => (item.id === route.id ? next : item)))}
                    onRemove={() => setMocks(mocks.filter((item) => item.id !== route.id))}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="规则匹配测试" description="按「精确 > 通配」优先级挑选一条规则并生成响应">
            <div className="grid gap-2 md:grid-cols-3">
              <Select
                label="方法"
                value={probeMethod}
                onChange={setProbeMethod}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', '*'].map((item) => ({ value: item, label: item }))}
              />
              <div className="md:col-span-2">
                <TextField
                  label="请求 URL"
                  value={probeUrl}
                  onChange={setProbeUrl}
                  placeholder="https://api.example.com/api/users/1"
                />
              </div>
            </div>
            {probeMatch && probeResponse ? (
              <>
                <Note tone="success" title={`命中规则 ${probeMatch.route.method} ${probeMatch.route.path}`}>
                  匹配方式：{probeMatch.reason}（得分 {probeMatch.score}）。* 只匹配单层，** 匹配任意层级。
                </Note>
                <ResultBox
                  label={`生成的响应（状态码 ${probeResponse.status}）`}
                  value={probeText}
                  rows="min-h-32"
                  onCopy={() => copyText(probeText)}
                />
                <Button size="sm" variant="outline" onClick={() => setResponseText(probeText)}>
                  <ShieldCheck className="size-3.5" />
                  送去断言核对
                </Button>
              </>
            ) : (
              <Note tone="warn" title="没有命中任何规则">
                检查方法是否一致（规则可用 * 表示任意方法），以及路径通配符是否覆盖该层级。
              </Note>
            )}
            <ResultBox
              label="规则目录（静态结构）"
              value={mockDirectory(mocks)}
              rows="min-h-32"
              onCopy={() => copyText(mockDirectory(mocks))}
            />
          </Section>
        </div>
      )}

      {tab === 'guide' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section title="如何使用">
            <ol className="list-decimal space-y-1 pl-4 text-xs">
              <li>
                在 DevTools 的 Network 面板勾选 <strong>Preserve log</strong>，先登录再操作，否则关键请求（如{' '}
                <code className="font-mono">/user/info</code>）会因跳转而丢失。
              </li>
              <li>
                右键目标请求 → <strong>Copy → Copy as cURL</strong>，粘贴到「cURL 解析」即可得到结构化请求；含凭据的
                header 请先脱敏。
              </li>
              <li>
                需要整体统计时用「导入 .har」：Network 面板 → 右键空白处 → <strong>Save all as HAR with content</strong>
                。
              </li>
              <li>把真实响应粘进「断言核对」，为关键接口固定状态码与关键 JSON 字段断言，回归时可快速发现结构变化。</li>
              <li>用「请求构造」把脱敏后的请求转成 fetch / axios 代码，生成前可切换环境替换 {'{{token}}'} 等变量。</li>
            </ol>
          </Section>

          <Section title="抓包要点与常见坑">
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>Network 面板默认看不到 WebSocket 帧、HSTS 拦截与 Service Worker 缓存的请求，需要取消相关过滤。</li>
              <li>发送顺序不等于到达顺序：HTTP/2 多路复用下请求并发，耗时瀑布图中重叠的段是正常现象。</li>
              <li>
                状态码 304 表示命中协商缓存，DevTools 仍会显示请求；真正的缓存命中看 Size 列的 disk / memory cache。
              </li>
              <li>Failed / (canceled) 通常是页面跳转、刷新或请求被 AbortController 取消，不是服务端错误。</li>
              <li>请求体为 Form Data 或二进制时，HAR 中可能只保留边界字符串，抓包前应先在代码里固定参数顺序。</li>
              <li>
                Chrome 的「Copy as cURL (bash)」带 <code className="font-mono">--compressed</code> 与{' '}
                <code className="font-mono">$'...'</code> 转义，粘贴到别的终端执行前要确认 shell 一致。
              </li>
              <li>抓包内容可能包含手机号、Token、身份证号，粘贴到工单或聊天工具前务必脱敏。</li>
            </ul>
          </Section>

          <Section title="文档与工具">
            <LinkList
              items={[
                {
                  name: 'HTTP 字段语义（RFC 9110）',
                  url: 'https://www.rfc-editor.org/rfc/rfc9110',
                  description: '方法、状态码与首部字段的权威定义',
                },
                {
                  name: 'Fetch 标准',
                  url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API',
                  description: 'Request / Headers / Body 用法',
                },
                {
                  name: 'HAR 1.2 规范',
                  url: 'http://www.softwareishard.com/blog/har-12-spec/',
                  description: 'HAR 文件格式定义',
                },
                {
                  name: 'Chrome DevTools Network 参考',
                  url: 'https://developer.chrome.com/docs/devtools/network',
                  description: '各列含义与过滤技巧',
                },
              ]}
            />
          </Section>

          <Section title="本工具的边界">
            <Note tone="warn" title="只做文本解析，不会发请求">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3" />
                所有转换都是纯文本与正则处理：不替你发起请求，也不校验服务器是否可达；
                「断言核对」把粘贴进来的响应文本当作事实来源，不能替代真实联调。
              </span>
            </Note>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>
                cURL 解析覆盖常见选项，复杂的 <code className="font-mono">--config</code>、
                <code className="font-mono">--next</code>、管道与重定向不会被求值。
              </li>
              <li>
                HAR 的 <code className="font-mono">content.text</code> 可能被截断（Chrome 单条上限约 5 MB），
                大文件请改用「Save all as HAR with content」。
              </li>
              <li>JSON 路径断言只支持点号与下标形式，不支持过滤器表达式与递归下降。</li>
              <li>生成的 Postman / OpenAPI 片段是最小可用版本，鉴权方案与 schema 引用需要自行补充。</li>
            </ul>
          </Section>
        </div>
      )}
    </ToolPanel>
  );
}

function headerLines(headers: { name: string; value: string }[]): string {
  return headers.map((item) => `${item.name}: ${item.value}`).join('\n');
}

function updateVariable(
  environments: Environment[],
  setEnvironments: (next: Environment[]) => void,
  envId: string,
  position: number,
  field: 'key' | 'value',
  value: string,
) {
  setEnvironments(
    environments.map((env) =>
      env.id === envId
        ? {
            ...env,
            variables: env.variables.map((item, i) => (i === position ? { ...item, [field]: value } : item)),
          }
        : env,
    ),
  );
}

function Distribution({
  title,
  items,
  tone = 'info',
}: {
  title: string;
  items: { key: string; count: number }[];
  tone?: 'info' | 'warn';
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  return (
    <div className="rounded-md border px-2.5 py-2">
      <p className="mb-1 text-xs font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">无数据</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key} className="text-[10px]">
              <div className="flex justify-between">
                <span className="truncate font-mono">{item.key}</span>
                <span className="shrink-0 text-muted-foreground">{item.count}</span>
              </div>
              <span className="mt-0.5 block h-1.5 overflow-hidden rounded bg-muted">
                <span
                  className={`block h-full ${tone === 'warn' ? 'bg-amber-500' : 'bg-sky-500'}`}
                  style={{ width: `${(item.count / total) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JsonHint({ text }: { text: string }) {
  try {
    const parsed = JSON.parse(text) as unknown;
    return (
      <Note tone="success" title="JSON 格式正确">
        顶层类型：{Array.isArray(parsed) ? '数组' : typeof parsed}
      </Note>
    );
  } catch (error) {
    return (
      <Note tone="warn" title="JSON 格式有误">
        {error instanceof Error ? error.message : '无法解析为 JSON'}
      </Note>
    );
  }
}

function HeaderEditor({ headers, onChange }: { headers: HeaderRow[]; onChange: (next: HeaderRow[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">请求头</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...headers, { id: nextId('h'), key: '', value: '', enabled: true }])}
        >
          <Plus className="size-3.5" />
          新增
        </Button>
      </div>
      {headers.map((row, position) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <Checkbox
            label="启用"
            checked={row.enabled}
            onChange={(checked) =>
              onChange(headers.map((item) => (item.id === row.id ? { ...item, enabled: checked } : item)))
            }
          />
          <input
            value={row.key}
            onChange={(event) =>
              onChange(headers.map((item) => (item.id === row.id ? { ...item, key: event.target.value } : item)))
            }
            className="h-8 w-1/3 rounded-md border bg-background px-2 font-mono text-xs"
            placeholder="Header"
            aria-label={`第 ${position + 1} 个请求头名称`}
          />
          <input
            value={row.value}
            onChange={(event) =>
              onChange(headers.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))
            }
            className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
            placeholder="值"
            aria-label={`第 ${position + 1} 个请求头值`}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label={`删除第 ${position + 1} 个请求头`}
            onClick={() => onChange(headers.filter((item) => item.id !== row.id))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {headers.length === 0 && <Hint>没有请求头，生成代码会省略 -H</Hint>}
    </div>
  );
}

function FormEditor({
  form,
  onChange,
}: {
  form: { id: string; key: string; value: string; enabled: boolean }[];
  onChange: (next: { id: string; key: string; value: string; enabled: boolean }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">表单字段（application/x-www-form-urlencoded）</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...form, { id: nextId('f'), key: '', value: '', enabled: true }])}
        >
          <Plus className="size-3.5" />
          新增字段
        </Button>
      </div>
      {form.map((row, position) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <Checkbox
            label="启用"
            checked={row.enabled}
            onChange={(checked) =>
              onChange(form.map((item) => (item.id === row.id ? { ...item, enabled: checked } : item)))
            }
          />
          <input
            value={row.key}
            onChange={(event) =>
              onChange(form.map((item) => (item.id === row.id ? { ...item, key: event.target.value } : item)))
            }
            className="h-8 w-1/3 rounded-md border bg-background px-2 font-mono text-xs"
            placeholder="字段名"
            aria-label={`第 ${position + 1} 个表单字段名`}
          />
          <input
            value={row.value}
            onChange={(event) =>
              onChange(form.map((item) => (item.id === row.id ? { ...item, value: event.target.value } : item)))
            }
            className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
            placeholder="字段值"
            aria-label={`第 ${position + 1} 个表单字段值`}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label={`删除第 ${position + 1} 个表单字段`}
            onClick={() => onChange(form.filter((item) => item.id !== row.id))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {form.length === 0 && <Hint>没有表单字段，body 会是空字符串</Hint>}
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: AssertionRule;
  onChange: (next: AssertionRule) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="flex items-end gap-1.5">
        <Checkbox label="启用" checked={rule.enabled} onChange={(checked) => onChange({ ...rule, enabled: checked })} />
        <div className="grid flex-1 grid-cols-2 gap-1.5 md:grid-cols-4">
          <Select
            label="类型"
            value={rule.type}
            onChange={(value) => onChange({ ...rule, type: value as AssertionType })}
            options={ASSERT_TYPE_OPTIONS}
          />
          <Select
            label="比较"
            value={rule.operator}
            onChange={(value) => onChange({ ...rule, operator: value as AssertionRule['operator'] })}
            options={OPERATOR_OPTIONS}
          />
          <TextField
            label="字段"
            value={rule.field}
            onChange={(value) => onChange({ ...rule, field: value })}
            placeholder={rule.type === 'jsonPath' ? '$.data.id' : '字段'}
          />
          <TextField
            label="期望值"
            value={rule.expected}
            onChange={(value) => onChange({ ...rule, expected: value })}
            placeholder="期望"
          />
        </div>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="删除该断言" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MockEditor({
  route,
  onChange,
  onRemove,
}: {
  route: MockRoute;
  onChange: (next: MockRoute) => void;
  onRemove: () => void;
}) {
  const preview = useMemo(() => {
    const built = buildMockResponse(route);
    return `${built.status}\n${headerLines(built.headers)}\n\n${built.body}`;
  }, [route]);
  return (
    <div className="rounded-md border px-2 py-2">
      <div className="flex items-end gap-1.5">
        <Checkbox
          label="启用"
          checked={route.enabled}
          onChange={(checked) => onChange({ ...route, enabled: checked })}
        />
        <Select
          label="方法"
          value={route.method}
          onChange={(value) => onChange({ ...route, method: value })}
          options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', '*'].map((item) => ({ value: item, label: item }))}
        />
        <div className="flex-1">
          <TextField
            label="路径"
            value={route.path}
            onChange={(value) => onChange({ ...route, path: value })}
            placeholder="/api/users/**"
          />
        </div>
        <NumberField
          label="状态码"
          value={route.status}
          onChange={(value) => onChange({ ...route, status: value })}
          min={100}
          max={599}
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="删除该 Mock 规则"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="mt-1.5 grid gap-2 md:grid-cols-2">
        <Field label="响应头（JSON 对象或每行一条）">
          <Textarea
            value={route.headers}
            onChange={(event) => onChange({ ...route, headers: event.target.value })}
            spellCheck={false}
            className="min-h-20 resize-none font-mono text-xs"
          />
        </Field>
        <Field label="响应体">
          <Textarea
            value={route.body}
            onChange={(event) => onChange({ ...route, body: event.target.value })}
            spellCheck={false}
            className="min-h-20 resize-none font-mono text-xs"
          />
        </Field>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => copyText(preview)}>
          <Copy className="size-3.5" />
          复制生成的响应
        </Button>
        <Button size="sm" variant="outline" onClick={() => onChange({ ...route, body: fillTemplate(route.body) })}>
          <Play className="size-3.5" />
          固化当前随机值
        </Button>
      </div>
    </div>
  );
}
