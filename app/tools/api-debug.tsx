import {
  Braces,
  Bug,
  Copy,
  Download,
  Eraser,
  FileJson,
  History,
  Import,
  KeyRound,
  ListPlus,
  Play,
  Plus,
  ScrollText,
  ShieldAlert,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Field, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  buildAxios,
  buildCurl,
  buildCurlPretty,
  buildFetch,
  buildMockResponse,
  CURL_PRESETS,
  CURL_TIPS,
  type CurlBuildOptions,
  cookieHeader,
  emptyState,
  estimateRequest,
  extractEnvRefs,
  formatJson,
  type HeaderEntry,
  HTTP_METHODS,
  type HttpMethod,
  hostOf,
  MOCK_CONTENT_TYPES,
  MOCK_DELAY_OPTIONS,
  MOCK_STATUS_OPTIONS,
  makeHeader,
  makePair,
  mockBodyFor,
  nextId,
  type PairEntry,
  parseCurl,
  pathOf,
  prettyJson,
  type RequestState,
  suggestHeaders,
} from '../lib/curl';
import { downloadText, exportName } from '../lib/file';
import {
  type AssertionRule,
  type AssertionRunReport,
  DEFAULT_ASSERTION_RULES,
  HTTP_HISTORY_KEY,
  lastHistoryResponseText,
  runAssertions,
} from '../lib/har';

type OutputTab = 'curl' | 'code' | 'mock' | 'notes' | 'response';

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({ value: method, label: method }));

const AUTH_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'basic', label: 'Basic（用户名密码）' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'token', label: '自定义 Token 头' },
  { value: 'oauth2', label: 'OAuth2 Bearer' },
];

const BODY_OPTIONS = [
  { value: 'none', label: '无请求体' },
  { value: 'json', label: 'JSON' },
  { value: 'form', label: '表单 / multipart' },
  { value: 'raw', label: '原始文本' },
];

const ASSERTION_TYPE_OPTIONS: { value: AssertionRule['type']; label: string }[] = [
  { value: 'status', label: '状态码' },
  { value: 'header', label: '响应头' },
  { value: 'jsonPath', label: 'JSON 路径' },
  { value: 'regex', label: '正则匹配' },
  { value: 'time', label: '响应耗时' },
  { value: 'bodyContains', label: '响应体包含' },
];

const OPERATOR_OPTIONS: { value: AssertionRule['operator']; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'matches', label: '匹配' },
  { value: 'lt', label: '小于' },
  { value: 'gt', label: '大于' },
  { value: 'exists', label: '存在' },
];

/** 导入框示例：一条能通过多数默认规则、仅耗时断言失败的真实格式响应。 */
const RESPONSE_PRESET = `HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
x-response-time: 642
x-trace-id: trace-demo-0001

{"code":"OK","data":{"id":9001,"state":"created"},"items":[{"sku":"A-1","qty":2}]}`;

function assertionNeedsField(type: AssertionRule['type']): boolean {
  return type === 'header' || type === 'jsonPath' || type === 'regex';
}

function assertionFieldPlaceholder(type: AssertionRule['type']): string {
  switch (type) {
    case 'header':
      return '响应头名，如 content-type';
    case 'jsonPath':
      return 'JSON 路径，如 $.data.id';
    case 'regex':
      return '正则表达式';
    default:
      return '此类型无需字段';
  }
}

/** 结果列表里用一行文字复述规则，便于对照。 */
function describeRule(rule: AssertionRule): string {
  const typeLabel = ASSERTION_TYPE_OPTIONS.find((item) => item.value === rule.type)?.label ?? rule.type;
  const opLabel = OPERATOR_OPTIONS.find((item) => item.value === rule.operator)?.label ?? rule.operator;
  const field = rule.field.trim() !== '' ? ` ${rule.field}` : '';
  return `${typeLabel}${field} ${opLabel} ${rule.expected || '（空）'}`;
}

/** 断言规则编辑器：与 PairEditor 同构，复用共享 Input / Select / Button。 */
function AssertionEditor({ rules, onChange }: { rules: AssertionRule[]; onChange: (next: AssertionRule[]) => void }) {
  const patch = (id: string, delta: Partial<AssertionRule>) =>
    onChange(rules.map((item) => (item.id === id ? { ...item, ...delta } : item)));
  return (
    <div className="flex flex-col gap-1.5">
      {rules.length === 0 && <p className="text-[11px] text-muted-foreground">暂无规则，点下方按钮添加</p>}
      {rules.map((rule) => (
        <div key={rule.id} className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2/40 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="checkbox"
              className="size-3.5 shrink-0 accent-primary"
              checked={rule.enabled}
              aria-label="启用该断言"
              onChange={(event) => patch(rule.id, { enabled: event.target.checked })}
            />
            <Select
              ariaLabel="断言类型"
              value={rule.type}
              options={ASSERTION_TYPE_OPTIONS}
              onChange={(value) => patch(rule.id, { type: value as AssertionRule['type'] })}
              className="w-28 shrink-0"
            />
            <Select
              ariaLabel="比较方式"
              value={rule.operator}
              options={OPERATOR_OPTIONS}
              onChange={(value) => patch(rule.id, { operator: value as AssertionRule['operator'] })}
              className="w-24 shrink-0"
            />
            <Input
              value={rule.expected}
              placeholder="期望值"
              aria-label="期望值"
              className="h-7 min-w-0 flex-1 font-mono text-[11px]"
              onChange={(event) => patch(rule.id, { expected: event.target.value })}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="删除该断言"
              onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {assertionNeedsField(rule.type) && (
            <Input
              value={rule.field}
              placeholder={assertionFieldPlaceholder(rule.type)}
              aria-label="字段名 / 路径"
              className="h-7 font-mono text-[11px]"
              onChange={(event) => patch(rule.id, { field: event.target.value })}
            />
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() =>
          onChange([
            ...rules,
            { id: nextId('as'), type: 'status', field: '', operator: 'equals', expected: '200', enabled: true },
          ])
        }
      >
        <Plus className="size-3.5" />
        添加规则
      </Button>
    </div>
  );
}

/** 可编辑的 key/value 行列表：查询参数、请求头、Cookie、表单字段共用。 */
function PairEditor({
  entries,
  onChange,
  addLabel,
  keyPlaceholder = '名称',
  valuePlaceholder = '值',
  defaultKey = '',
}: {
  entries: PairEntry[];
  onChange: (next: PairEntry[]) => void;
  addLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  defaultKey?: string;
}) {
  const patch = (id: string, delta: Partial<PairEntry>) => {
    onChange(entries.map((item) => (item.id === id ? { ...item, ...delta } : item)));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {entries.length === 0 && <p className="text-[11px] text-muted-foreground">暂无条目</p>}
      {entries.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            className="size-3.5 shrink-0 accent-primary"
            checked={item.enabled}
            aria-label={`启用 ${item.key || '未命名的条目'}`}
            onChange={(event) => patch(item.id, { enabled: event.target.checked })}
          />
          <Input
            value={item.key}
            placeholder={keyPlaceholder}
            aria-label="名称"
            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
            onChange={(event) => patch(item.id, { key: event.target.value })}
          />
          <Input
            value={item.value}
            placeholder={valuePlaceholder}
            aria-label="值"
            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
            onChange={(event) => patch(item.id, { value: event.target.value })}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="删除该条目"
            onClick={() => onChange(entries.filter((row) => row.id !== item.id))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...entries, makePair(defaultKey)])}
      >
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

export default function ApiDebugTool() {
  const [state, setState] = useState<RequestState>(() => {
    const base = emptyState();
    base.url = 'https://api.example.com/v1/users';
    base.method = 'GET';
    base.query = [makePair('page', '1'), makePair('size', '20')];
    base.headers = [makeHeader('Accept', 'application/json')];
    return base;
  });
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tab, setTab] = useState<OutputTab>('curl');
  const [pretty, setPretty] = useState(true);
  const [maskSecrets, setMaskSecrets] = useState(false);
  const [alwaysMethod, setAlwaysMethod] = useState(false);

  const [mockStatus, setMockStatus] = useState('200');
  const [mockDelay, setMockDelay] = useState('80');
  const [mockType, setMockType] = useState(MOCK_CONTENT_TYPES[0]?.value ?? 'application/json');
  const [mockBody, setMockBody] = useState('');
  const [responseText, setResponseText] = useState('');
  const [responseError, setResponseError] = useState<string | null>(null);
  const [assertionRules, setAssertionRules] = useState<AssertionRule[]>(() =>
    DEFAULT_ASSERTION_RULES.map((rule) => ({ ...rule })),
  );
  const [assertionRun, setAssertionRun] = useState<AssertionRunReport | null>(null);

  const update = useCallback((delta: Partial<RequestState>) => setState((prev) => ({ ...prev, ...delta })), []);

  const options: CurlBuildOptions = useMemo(
    () => ({ pretty, maskSecrets, alwaysMethod }),
    [alwaysMethod, maskSecrets, pretty],
  );

  const curl = useMemo(() => buildCurl(state, options), [options, state]);
  const curlPretty = useMemo(() => buildCurlPretty(state, options), [options, state]);
  const fetchCode = useMemo(() => buildFetch(state), [state]);
  const axiosCode = useMemo(() => buildAxios(state), [state]);
  const size = useMemo(() => estimateRequest(state), [state]);
  const envRefs = useMemo(() => {
    const all = [
      state.url,
      cookieHeader(state),
      ...state.headers.map((item: HeaderEntry) => `${item.key}${item.value}`),
      state.auth.token,
    ];
    return extractEnvRefs(all.join('\n'));
  }, [state]);

  const mock = useMemo(
    () =>
      buildMockResponse(state, {
        status: Number(mockStatus),
        delayMs: Number(mockDelay),
        body: mockBody,
        contentType: mockType,
      }),
    [mockBody, mockDelay, mockStatus, mockType, state],
  );

  const fillMockBody = useCallback(
    (status: string) => {
      setMockStatus(status);
      setMockBody(mockBodyFor(Number(status), state.method, pathOf(state.url)));
    },
    [state.method, state.url],
  );

  const importCurl = useCallback((text: string) => {
    const parsed = parseCurl(text);
    if ('error' in parsed) {
      setImportError(parsed.error);
      setWarnings([]);
      return;
    }
    setImportError(null);
    setState(parsed.state);
    setWarnings(parsed.warnings);
    setImportText('');
  }, []);

  const runAssertionsHandler = useCallback(() => {
    if (responseText.trim() === '') {
      setResponseError('请先粘贴 HTTP 响应文本，或从 http-client 历史读取一条记录');
      setAssertionRun(null);
      return;
    }
    const next = runAssertions(responseText, assertionRules);
    setAssertionRun(next);
    setResponseError(next.total === 0 ? '没有启用的断言规则，请至少启用一条' : null);
  }, [responseText, assertionRules]);

  const loadFromHistory = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(HTTP_HISTORY_KEY);
    } catch {
      raw = null;
    }
    const text = lastHistoryResponseText(raw);
    if (text === null) {
      setResponseError('没有可用的 http-client 本地历史，或历史数据无法解析；也可以直接粘贴完整响应报文。');
      setResponseText('');
      setAssertionRun(null);
      return;
    }
    setResponseError(null);
    setResponseText(text);
    setAssertionRun(null);
  }, []);

  const fillResponsePreset = useCallback(() => {
    setResponseText(RESPONSE_PRESET);
    setResponseError(null);
    setAssertionRun(null);
  }, []);

  const clearResponse = useCallback(() => {
    setResponseText('');
    setResponseError(null);
    setAssertionRun(null);
  }, []);

  const suggestions = useMemo(() => suggestHeaders(state), [state]);
  const jsonError = useMemo(() => {
    if (state.body.kind !== 'json' || state.body.raw.trim() === '') return null;
    return prettyJson(state.body.raw) === null ? '这段内容不是合法 JSON，导出时会原样发送' : null;
  }, [state.body.kind, state.body.raw]);

  const responseBody = useMemo(
    () => (assertionRun ? (prettyJson(assertionRun.response.body) ?? assertionRun.response.body) : ''),
    [assertionRun],
  );

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Zap className="size-4" />
          接口调试
        </span>
      }
      description="构造、解析 curl 命令并导出前端代码；全程离线，不发起任何网络请求"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="outline" disabled={curl === ''} onClick={() => copyText(curl)}>
            <Copy className="size-3.5" />
            复制 curl
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={curl === ''}
            onClick={() =>
              downloadText(exportName('request', 'sh'), `${curlPretty}\n`, 'text/x-shellscript;charset=utf-8')
            }
          >
            <Download className="size-3.5" />
            下载脚本
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as OutputTab)}>
        <TabsList>
          <TabsTrigger value="curl" active={tab === 'curl'}>
            <span className="inline-flex items-center gap-1">
              <ScrollText className="size-3.5" />
              curl
            </span>
          </TabsTrigger>
          <TabsTrigger value="code" active={tab === 'code'}>
            <span className="inline-flex items-center gap-1">
              <Braces className="size-3.5" />
              前端代码
            </span>
          </TabsTrigger>
          <TabsTrigger value="mock" active={tab === 'mock'}>
            <span className="inline-flex items-center gap-1">
              <Bug className="size-3.5" />
              本地 Mock
            </span>
          </TabsTrigger>
          <TabsTrigger value="notes" active={tab === 'notes'}>
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="size-3.5" />
              联调说明
            </span>
          </TabsTrigger>
          <TabsTrigger value="response" active={tab === 'response'}>
            <span className="inline-flex items-center gap-1">
              <FileJson className="size-3.5" />
              真实响应
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3 overflow-auto pr-0.5">
          <Section title="从 curl 命令导入" description="浏览器 DevTools → Network → 右键 → Copy as cURL">
            <div className="flex flex-col gap-2">
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="curl 'https://api.example.com/v1/users/1' -H 'Authorization: Bearer $TOKEN'"
                spellCheck={false}
                aria-label="待导入的 curl 命令"
                className="min-h-16 resize-none font-mono text-[11px]"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" disabled={importText.trim() === ''} onClick={() => importCurl(importText)}>
                  <Import className="size-3.5" />
                  解析并填充表单
                </Button>
                <Button size="sm" variant="ghost" disabled={importText === ''} onClick={() => setImportText('')}>
                  <Eraser className="size-3.5" />
                  清空
                </Button>
                <span className="text-[11px] text-muted-foreground">或用示例：</span>
                {CURL_PRESETS.slice(0, 4).map((preset) => (
                  <Button
                    key={preset.name}
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    title={preset.note}
                    onClick={() => importCurl(preset.command)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
              {importError !== null && (
                <Note tone="danger" title="无法解析">
                  {importError}
                </Note>
              )}
            </div>
          </Section>

          <Section title="请求">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
              <Select
                label="方法"
                value={state.method}
                onChange={(value) => update({ method: value as HttpMethod })}
                options={METHOD_OPTIONS}
              />
              <TextField
                label="URL"
                value={state.url}
                onChange={(value) => update({ url: value })}
                placeholder="https://api.example.com/v1/users"
                inputClassName="font-mono"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              主机 <code className="font-mono">{hostOf(state.url)}</code> · 路径{' '}
              <code className="font-mono">{pathOf(state.url)}</code>
            </p>
          </Section>

          <Section title="查询参数" description="会被拼到 URL 的 ? 后面">
            <PairEditor
              entries={state.query}
              onChange={(next) => update({ query: next })}
              addLabel="添加参数"
              keyPlaceholder="参数名"
              valuePlaceholder="参数值"
            />
          </Section>

          <Section title="请求头" description="Authorization、Cookie 建议在下面单独维护">
            <div className="flex flex-col gap-2">
              <PairEditor
                entries={state.headers}
                onChange={(next) => update({ headers: next })}
                addLabel="添加请求头"
                keyPlaceholder="Header-Name"
                valuePlaceholder="值 / $TOKEN"
              />
              {suggestions.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Wand2 className="size-3" />
                    建议补充：
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((item) => (
                      <Button
                        key={item.key + item.value}
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        title={item.reason}
                        onClick={() => update({ headers: [...state.headers, makeHeader(item.key, item.value)] })}
                      >
                        <ListPlus className="size-3" />
                        {item.key}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section title="请求体">
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="类型"
                  value={state.body.kind}
                  onChange={(value) => update({ body: { ...state.body, kind: value as RequestState['body']['kind'] } })}
                  options={BODY_OPTIONS}
                />
                <Field label="Content-Type（raw 模式）" hint="仅 raw 模式使用；JSON 与表单会自动补全">
                  <Textarea
                    value={state.body.contentType}
                    onChange={(event) => update({ body: { ...state.body, contentType: event.target.value } })}
                    placeholder="text/plain; charset=utf-8"
                    spellCheck={false}
                    aria-label="Content-Type"
                    className="h-8 min-h-8 resize-none px-2 py-1 font-mono text-[11px]"
                  />
                </Field>
              </div>

              {(state.body.kind === 'json' || state.body.kind === 'raw') && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">内容</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px]"
                      disabled={state.body.kind !== 'json' || state.body.raw.trim() === ''}
                      onClick={() => {
                        const next = prettyJson(state.body.raw);
                        if (next !== null) update({ body: { ...state.body, raw: next } });
                      }}
                    >
                      美化 JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px]"
                      disabled={state.body.raw.trim() === ''}
                      onClick={() => update({ body: { ...state.body, raw: formatJson(state.body.raw) } })}
                    >
                      压成一行
                    </Button>
                    {jsonError !== null && <span className="text-[11px] text-destructive">{jsonError}</span>}
                  </div>
                  <Textarea
                    value={state.body.raw}
                    onChange={(event) => update({ body: { ...state.body, raw: event.target.value } })}
                    placeholder={state.body.kind === 'json' ? '{\n  "name": "张三"\n}' : '任意文本'}
                    spellCheck={false}
                    aria-label="请求体内容"
                    className="min-h-28 resize-none font-mono text-[11px]"
                  />
                </div>
              )}

              {state.body.kind === 'form' && (
                <div className="flex flex-col gap-2">
                  <Checkbox
                    label="以 multipart/form-data 发送（对应 -F）"
                    checked={state.body.multipart}
                    onChange={(checked) => update({ body: { ...state.body, multipart: checked } })}
                    hint="multipart 的 boundary 由客户端生成，不要手写 Content-Type"
                  />
                  <PairEditor
                    entries={state.body.form}
                    onChange={(next) => update({ body: { ...state.body, form: next } })}
                    addLabel="添加字段"
                    valuePlaceholder="值，文件写 @./a.pdf"
                  />
                  <Hint>
                    <FileJson className="size-3" />
                    浏览器出于安全限制无法读取本地文件路径，<code className="font-mono">@</code>{' '}
                    开头的值只会原样带到命令里，需要你在终端或 Apifox 里真正上传。
                  </Hint>
                </div>
              )}
            </div>
          </Section>

          <Section title="鉴权">
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="方式"
                value={state.auth.kind}
                onChange={(value) => update({ auth: { ...state.auth, kind: value as RequestState['auth']['kind'] } })}
                options={AUTH_OPTIONS}
              />
              {(state.auth.kind === 'bearer' || state.auth.kind === 'oauth2') && (
                <TextField
                  label="Token"
                  value={state.auth.token}
                  onChange={(value) => update({ auth: { ...state.auth, token: value } })}
                  placeholder="$TOKEN"
                  inputClassName="font-mono"
                  hint="建议用 $TOKEN 占位，避免把密钥写进文档"
                />
              )}
              {state.auth.kind === 'token' && (
                <TextField
                  label="请求头名称"
                  value={state.auth.headerName}
                  onChange={(value) => update({ auth: { ...state.auth, headerName: value } })}
                  placeholder="X-Api-Key"
                  inputClassName="font-mono"
                />
              )}
              {state.auth.kind === 'token' && (
                <TextField
                  label="Token"
                  value={state.auth.token}
                  onChange={(value) => update({ auth: { ...state.auth, token: value } })}
                  placeholder="$API_KEY"
                  inputClassName="font-mono"
                />
              )}
              {state.auth.kind === 'basic' && (
                <TextField
                  label="用户名"
                  value={state.auth.username}
                  onChange={(value) => update({ auth: { ...state.auth, username: value } })}
                  inputClassName="font-mono"
                />
              )}
              {state.auth.kind === 'basic' && (
                <TextField
                  label="密码"
                  type="password"
                  value={state.auth.password}
                  onChange={(value) => update({ auth: { ...state.auth, password: value } })}
                  inputClassName="font-mono"
                />
              )}
            </div>
          </Section>

          <Section title="Cookie">
            <PairEditor
              entries={state.cookies}
              onChange={(next) => update({ cookies: next })}
              addLabel="添加 Cookie"
              keyPlaceholder="sid"
              valuePlaceholder="值"
            />
          </Section>

          <Section title="请求选项">
            <div className="grid grid-cols-2 gap-2">
              <Checkbox
                label="跟随重定向 (-L)"
                checked={state.followRedirects}
                onChange={(checked) => update({ followRedirects: checked })}
              />
              <Checkbox
                label="请求压缩 (--compressed)"
                checked={state.compressed}
                onChange={(checked) => update({ compressed: checked })}
              />
              <Checkbox
                label="跳过证书校验 (-k)"
                checked={state.insecure}
                onChange={(checked) => update({ insecure: checked })}
                hint="浏览器 fetch 无法设置，仅命令会带上"
              />
              <TextField
                label="超时 --max-time（秒）"
                value={state.timeout}
                onChange={(value) => update({ timeout: value })}
                placeholder="不设置"
                inputClassName="font-mono"
                type="number"
              />
              <TextField
                label="User-Agent"
                value={state.userAgent}
                onChange={(value) => update({ userAgent: value })}
                placeholder="可留空"
                inputClassName="font-mono"
                className="col-span-2"
              />
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-2">
          {tab === 'curl' && (
            <>
              <StatGrid>
                <Stat label="方法" value={state.method} />
                <Stat label="查询参数" value={state.query.filter((item) => item.enabled).length} />
                <Stat label="请求头" value={size.headerCount} />
                <Stat
                  label="请求体"
                  value={size.bodyBytes === 0 ? '无' : `${size.bodyBytes} B`}
                  hint={size.bodyLabel}
                />
              </StatGrid>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox label="多行格式" checked={pretty} onChange={setPretty} />
                <Checkbox label="始终写 -X" checked={alwaysMethod} onChange={setAlwaysMethod} />
                <Checkbox
                  label="隐藏密钥"
                  checked={maskSecrets}
                  onChange={setMaskSecrets}
                  hint="只遮住 Authorization / Cookie / -u 等敏感项"
                />
                <span className="text-[11px] text-muted-foreground">
                  预计请求体积 <span className="font-mono">{size.totalBytes} B</span>（仅文本，不含 TLS）
                </span>
              </div>
              <ResultBox
                label="curl 命令"
                value={pretty ? curlPretty : curl}
                error={state.url.trim() === '' ? '请先填写 URL' : null}
                onCopy={() => copyText(pretty ? curlPretty : curl)}
                rows="min-h-64"
                fill
              />
            </>
          )}

          {tab === 'code' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">导出目标：</span>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => copyText(fetchCode)}>
                  <Copy className="size-3" />
                  复制 fetch
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => copyText(axiosCode)}>
                  <Copy className="size-3" />
                  复制 axios
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() =>
                    downloadText(exportName('request', 'ts'), `${fetchCode}\n`, 'text/typescript;charset=utf-8')
                  }
                >
                  <Download className="size-3" />
                  下载 fetch 示例
                </Button>
              </div>
              <ResultBox
                label="fetch（浏览器 / Node 18+）"
                value={fetchCode}
                error={state.url.trim() === '' ? '请先填写 URL' : null}
                onCopy={() => copyText(fetchCode)}
                rows="min-h-44"
              />
              <ResultBox
                label="axios"
                value={axiosCode}
                error={state.url.trim() === '' ? '请先填写 URL' : null}
                onCopy={() => copyText(axiosCode)}
                rows="min-h-44"
              />
            </>
          )}

          {tab === 'mock' && (
            <>
              <Note tone="info" title="这是本地构造的假响应">
                用来对齐前端的错误处理分支（空数据、鉴权失败、超时提示等）。没有任何请求发出，也不会读本地文件。
              </Note>
              <div className="grid grid-cols-2 gap-2">
                <Select label="状态码" value={mockStatus} onChange={fillMockBody} options={MOCK_STATUS_OPTIONS} />
                <Select label="模拟耗时" value={mockDelay} onChange={setMockDelay} options={MOCK_DELAY_OPTIONS} />
                <Select label="响应类型" value={mockType} onChange={setMockType} options={MOCK_CONTENT_TYPES} />
                <Field label="说明">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setMockBody(mockBodyFor(Number(mockStatus), state.method, pathOf(state.url)))}
                  >
                    <Wand2 className="size-3.5" />
                    按状态码填充示例
                  </Button>
                </Field>
              </div>
              <Textarea
                value={mockBody}
                onChange={(event) => setMockBody(event.target.value)}
                placeholder="模拟的响应体"
                spellCheck={false}
                aria-label="模拟响应体"
                className="min-h-28 resize-none font-mono text-[11px]"
              />
              <StatGrid>
                <Stat
                  label="状态"
                  value={mock.statusLine.replace('HTTP/1.1 ', '')}
                  tone={Number(mockStatus) < 300 ? 'success' : Number(mockStatus) < 500 ? 'warn' : 'danger'}
                />
                <Stat label="模拟耗时" value={`${mockDelay} ms`} hint="仅展示用" />
                <Stat label="响应体" value={`${new TextEncoder().encode(mock.body).length} B`} />
                <Stat label="报文总长" value={`${mock.totalBytes} B`} />
              </StatGrid>
              <ResultBox
                label="原始 HTTP 报文"
                value={mock.raw}
                onCopy={() => copyText(mock.raw)}
                rows="min-h-56"
                fill
              />
            </>
          )}

          {tab === 'notes' && (
            <div className="flex flex-1 flex-col gap-3 overflow-auto">
              {envRefs.length > 0 && (
                <Note tone="warn" title="检测到环境变量占位符">
                  <ul className="flex flex-wrap gap-1.5">
                    {envRefs.map((name) => (
                      <li key={name}>
                        <code className="rounded bg-muted px-1 font-mono">{`$${name}`}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">
                    这些占位符只在 shell 里展开；粘贴到浏览器控制台或前端代码前请替换成真实值，否则会被原样发送。
                  </p>
                </Note>
              )}
              <Section title="怎么用这个工具做联调">
                <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  <li>在浏览器或 Apifox 里抓到一次失败请求，用「Copy as cURL」把命令粘进来反向还原参数。</li>
                  <li>
                    改完参数后复制 curl 到终端执行，加 <code className="font-mono">-v</code>{' '}
                    就能看到完整的请求头与响应。
                  </li>
                  <li>
                    需要跨域时先确认服务端的 <code className="font-mono">Access-Control-Allow-*</code>，curl 不受 CORS
                    限制所以看不出问题。
                  </li>
                  <li>把「本地 Mock」里的状态码切到 4xx/5xx，确认前端有对应的错误提示与重试逻辑。</li>
                  <li>需要复现别人的问题就直接贴请求参数，不要贴真实 token。</li>
                </ol>
              </Section>
              <Section title="常见坑">
                <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  {CURL_TIPS.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </Section>
              <ResultBox
                label="更多示例命令"
                value={CURL_PRESETS.map((item) => `# ${item.name}｜${item.note}\n${item.command}`).join('\n\n')}
                onCopy={() => copyText(CURL_PRESETS.map((item) => item.command).join('\n'))}
              />
            </div>
          )}

          {tab === 'response' && (
            <div className="flex flex-col gap-2">
              <Note tone="info" title="对真实响应执行断言">
                粘贴一次真实的 HTTP 响应（状态行 + 响应头 + 空行 + body），或从 http-client 的本地历史读取最近一条记录，
                点「运行断言」后逐条给出通过 / 失败与实际值。解析与比对都在本地完成，不发起任何请求。
              </Note>
              <Note tone="warn" title="从历史读取的能力边界">
                http-client 的本地历史只保存状态码与脱敏 cURL，不含响应体 /
                响应头；从历史读取时只能还原状态行与少量元信息头。 要校验 body / JSON 字段，请直接粘贴完整 HTTP
                响应报文。
              </Note>

              <Section title="导入真实响应" description="状态行 + 头 + 空行 + body">
                <Textarea
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  placeholder={RESPONSE_PRESET}
                  spellCheck={false}
                  aria-label="待导入的 HTTP 响应文本"
                  className="min-h-32 resize-none font-mono text-[11px]"
                />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" disabled={responseText.trim() === ''} onClick={runAssertionsHandler}>
                    <Play className="size-3.5" />
                    运行断言
                  </Button>
                  <Button size="sm" variant="outline" onClick={loadFromHistory}>
                    <History className="size-3.5" />从 http-client 历史读取
                  </Button>
                  <Button size="sm" variant="ghost" onClick={fillResponsePreset}>
                    填入示例
                  </Button>
                  <Button size="sm" variant="ghost" disabled={responseText === ''} onClick={clearResponse}>
                    清空
                  </Button>
                </div>
                {responseError !== null && (
                  <Note tone="danger" title="无法执行">
                    {responseError}
                  </Note>
                )}
              </Section>

              <Section
                title="断言规则"
                description={`默认 ${DEFAULT_ASSERTION_RULES.length} 条，可增删 / 停用后重新运行`}
              >
                <AssertionEditor rules={assertionRules} onChange={setAssertionRules} />
              </Section>

              <Section title="执行结果" description="逐条列出通过 / 失败、期望与实际值">
                {assertionRun === null ? (
                  <EmptyHint>粘贴响应并点击「运行断言」，结果会显示在这里</EmptyHint>
                ) : (
                  <>
                    <StatGrid>
                      <Stat label="规则数" value={assertionRun.total} />
                      <Stat label="通过" value={assertionRun.passed} tone="success" />
                      <Stat
                        label="失败"
                        value={assertionRun.failed}
                        tone={assertionRun.failed > 0 ? 'danger' : 'info'}
                      />
                      <Stat label="响应状态" value={assertionRun.response.status} />
                    </StatGrid>
                    {assertionRun.results.length === 0 ? (
                      <EmptyHint className="py-3">没有启用的断言规则</EmptyHint>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {assertionRun.results.map((result) => (
                          <li
                            key={result.rule.id}
                            className={`rounded-sm border px-2 py-1.5 text-[11px] ${
                              result.passed ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`shrink-0 font-medium ${result.passed ? 'text-success' : 'text-danger'}`}
                              >
                                {result.passed ? '通过' : '失败'}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                                {describeRule(result.rule)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                              <span>
                                期望：
                                <code className="font-mono text-foreground">{result.rule.expected || '（空）'}</code>
                              </span>
                              <span>
                                实际值：<code className="font-mono text-foreground">{result.actual || '（空）'}</code>
                              </span>
                            </div>
                            <p className="mt-0.5 leading-relaxed text-muted-foreground">{result.message}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Section>

              <ResultBox
                label="解析出的响应体（JSON 自动美化）"
                value={responseBody}
                onCopy={() => copyText(responseBody)}
                rows="min-h-24"
              />
            </div>
          )}

          {warnings.length > 0 && (
            <Note tone="warn" title={`解析时发现 ${warnings.length} 个需要注意的点`}>
              <ul className="flex flex-col gap-1">
                {warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Note>
          )}
        </div>
      </div>

      <Note tone="info" title="权限与限制">
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            工具不会调用 fetch / XMLHttpRequest，所有输出都是字符串拼接；真实请求请在终端、Apifox 或 Postman 里发。
          </li>
          <li>
            浏览器无法读取本地文件，所以 multipart 上传只能生成 <code className="font-mono">-F</code> 参数与 FormData
            骨架。
          </li>
          <li>
            <KeyRound className="size-3" /> 密钥与 Cookie 请用 <code className="font-mono">$TOKEN</code>{' '}
            占位；分享命令前建议勾选「隐藏密钥」。
          </li>
          <li>状态码、响应头来自内置表，只是常见值；真实响应以服务端为准。</li>
        </ul>
      </Note>
    </ToolPanel>
  );
}
