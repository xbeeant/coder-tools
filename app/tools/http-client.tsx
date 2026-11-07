/**
 * 真·HTTP 客户端：构造请求并真的发出去。
 *
 * 和「接口调试」「抓包调试」的分工：
 * - 那两个工具是离线转换器（curl / HAR / 代码互转 + Mock），不碰网络；
 * - 本工具负责真实发送，复用 curl.ts 的 RequestState 作为唯一的请求模型。
 *
 * 两条发送通道：
 * - direct：当前页面 fetch，Web 与扩展都能用，跨源请求受 CORS 限制；
 * - page  ：扩展专属，把 fetch 注入用户刚交互过的网页（MAIN world）执行。
 *           工具页本身是 chrome-extension:// 源，从这个源请求业务域名永远跨源；
 *           注入到业务页面后就是同源请求，能带上该站点的 Cookie（含 HttpOnly）。
 *           这是 Web 版给不了的能力，且只需要已有的 activeTab 权限。
 *
 * 安全边界：
 * - 请求真的会到达服务端，可能携带凭据，界面顶部固定提示；
 * - 历史只存脱敏 cURL，Authorization / Cookie / token 会替换为占位符；
 * - 本工具在输入自动保存的排除名单里，密码与 token 不会进入 DOM 快照。
 */

import {
  Braces,
  CircleAlert,
  Clock,
  Code2,
  Copy,
  Download,
  Eraser,
  Globe,
  History,
  Import,
  KeyRound,
  ListTree,
  Plus,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Select } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  buildAxios,
  buildCurl,
  buildCurlPretty,
  buildFetch,
  buildUrl,
  CURL_PRESETS,
  emptyState,
  formatJson,
  HTTP_METHODS,
  type HttpMethod,
  makeHeader,
  makePair,
  type PairEntry,
  parseCurl,
  prettyJson,
  type RequestState,
} from '../lib/curl';
import { downloadText, exportName } from '../lib/file';
import {
  compileRequest,
  DEFAULT_TIMEOUT_MS,
  displayHeaderValue,
  type HttpResult,
  isSensitiveHeader,
  prettyBody,
  runDirect,
  runInPage,
  statusTone,
} from '../lib/http-client';
import { canUseExtensionFeatures, EXTENSION_UNAVAILABLE_HINT } from '../lib/page-context';
import { safeSetItem } from '../lib/quota';
import { IS_EXTENSION, RUNTIME_LABEL } from '../lib/runtime';

type Transport = 'direct' | 'page';
type RequestTab = 'params' | 'headers' | 'body' | 'auth' | 'cookies';
type ResponseTab = 'body' | 'headers' | 'code';

interface HistoryEntry {
  id: string;
  at: number;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  transport: Transport;
  /** 脱敏后的 cURL，可重新导入表单重放 */
  curl: string;
}

const HISTORY_KEY = 'coder-tools:http-history';
const MAX_HISTORY = 20;
const MAX_HISTORY_BODY_CHARS = 2_000;

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

const REQUEST_TABS: { value: RequestTab; label: string }[] = [
  { value: 'params', label: '查询参数' },
  { value: 'headers', label: '请求头' },
  { value: 'body', label: '请求体' },
  { value: 'auth', label: '认证' },
  { value: 'cookies', label: 'Cookie' },
];

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is HistoryEntry => {
        if (typeof item !== 'object' || item === null) return false;
        const entry = item as Partial<HistoryEntry>;
        return (
          typeof entry.id === 'string' &&
          typeof entry.at === 'number' &&
          typeof entry.method === 'string' &&
          typeof entry.url === 'string' &&
          typeof entry.curl === 'string' &&
          (entry.transport === 'direct' || entry.transport === 'page')
        );
      })
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/** 可编辑的 key/value 行列表：查询参数、请求头、Cookie、表单字段共用。 */
function PairEditor({
  entries,
  onChange,
  addLabel,
  keyPlaceholder = '名称',
  valuePlaceholder = '值',
}: {
  entries: PairEntry[];
  onChange: (next: PairEntry[]) => void;
  addLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
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
            aria-label={`启用 ${item.key || '未命名条目'}`}
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
      <Button size="sm" variant="outline" className="self-start" onClick={() => onChange([...entries, makePair()])}>
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

function initialState(): RequestState {
  const state = emptyState();
  state.url = 'https://httpbin.org/get';
  state.method = 'GET';
  state.query = [makePair('page', '1')];
  state.headers = [makeHeader('Accept', 'application/json')];
  return state;
}

export default function HttpClientTool() {
  const [state, setState] = useState<RequestState>(initialState);
  const [transport, setTransport] = useState<Transport>('direct');
  const [includeCredentials, setIncludeCredentials] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [requestTab, setRequestTab] = useState<RequestTab>('params');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [result, setResult] = useState<HttpResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [pretty, setPretty] = useState(true);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const extensionAvailable = canUseExtensionFeatures();
  const pageChannelAvailable = IS_EXTENSION && extensionAvailable;

  const update = useCallback((delta: Partial<RequestState>) => setState((prev) => ({ ...prev, ...delta })), []);
  const updateBody = useCallback(
    (delta: Partial<RequestState['body']>) => setState((prev) => ({ ...prev, body: { ...prev.body, ...delta } })),
    [],
  );
  const updateAuth = useCallback(
    (delta: Partial<RequestState['auth']>) => setState((prev) => ({ ...prev, auth: { ...prev.auth, ...delta } })),
    [],
  );

  const transportOptions = useMemo(
    () => [
      { value: 'direct', label: '直接发送（通用，受 CORS 限制）' },
      {
        value: 'page',
        label: pageChannelAvailable ? '页面上下文发送（扩展专属，带站点 Cookie）' : '页面上下文发送（仅扩展版可用）',
        disabled: !pageChannelAvailable,
      },
    ],
    [pageChannelAvailable],
  );

  const effectiveTransport: Transport = transport === 'page' && !pageChannelAvailable ? 'direct' : transport;

  const compiled = useMemo(
    () => compileRequest(state, { credentials: includeCredentials }),
    [includeCredentials, state],
  );

  const curlCommand = useMemo(
    () => buildCurl(state, { pretty: false, maskSecrets: false, alwaysMethod: false }),
    [state],
  );
  const curlPretty = useMemo(
    () => buildCurlPretty(state, { pretty: false, maskSecrets: false, alwaysMethod: false }),
    [state],
  );
  const fetchCode = useMemo(() => buildFetch(state), [state]);
  const axiosCode = useMemo(() => buildAxios(state), [state]);

  const displayBody = useMemo(() => {
    if (!result?.body) return '';
    return pretty ? prettyBody(result.body, result.contentType ?? '') : result.body;
  }, [pretty, result]);

  const importCurl = useCallback((text: string) => {
    const parsed = parseCurl(text);
    if ('error' in parsed) {
      setImportError(parsed.error);
      return;
    }
    setImportError(null);
    setState(parsed.state);
    setImportText('');
    setResult(null);
  }, []);

  const persistHistory = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    const write = safeSetItem(HISTORY_KEY, JSON.stringify(next));
    setHistoryError(write.ok ? null : (write.error ?? '请求历史没有保存'));
  }, []);

  const send = useCallback(async () => {
    if (!compiled.spec) {
      setResult({
        ok: false,
        transport: effectiveTransport,
        durationMs: 0,
        error: compiled.error ?? '请求参数不完整',
      });
      setWarnings(compiled.warnings);
      return;
    }
    setWarnings(compiled.warnings);
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setResult(null);
    try {
      const response =
        effectiveTransport === 'page'
          ? await runInPage(compiled.spec, controller.signal)
          : await runDirect(compiled.spec, controller.signal);
      setResult(response);

      if (saveHistory) {
        const masked = buildCurl(
          { ...state, body: { ...state.body, raw: state.body.raw.slice(0, MAX_HISTORY_BODY_CHARS) } },
          { pretty: false, maskSecrets: true, alwaysMethod: true },
        );
        const entry: HistoryEntry = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(),
          method: state.method,
          url: compiled.spec.url,
          status: response.status,
          durationMs: response.durationMs,
          transport: response.transport,
          curl: masked,
        };
        persistHistory([entry, ...history].slice(0, MAX_HISTORY));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [compiled, effectiveTransport, history, persistHistory, saveHistory, state]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Zap className="size-4" />
          HTTP 客户端
        </span>
      }
      description="构造并真实发送 HTTP 请求，查看状态码、响应头与响应体；扩展版可在当前网页上下文中发送同源请求"
      actions={
        <div className="flex flex-row gap-1">
          {sending ? (
            <Button size="sm" variant="outline" onClick={cancel}>
              <Square className="size-3.5" />
              取消
            </Button>
          ) : (
            <Button size="sm" disabled={compiled.spec === null} onClick={() => void send()}>
              <Send className="size-3.5" />
              发送请求
            </Button>
          )}
        </div>
      }
    >
      <Note tone="warn" title="这是真实的网络请求，不是模拟">
        点击「发送请求」后，请求会从当前浏览器发出并到达目标服务器；修改类方法（POST / PUT / DELETE）同样会真实生效。
        <span className="font-medium"> 页面上下文发送会携带目标站点的 Cookie</span>
        ，请只对你有权限的接口使用。当前运行环境：
        {RUNTIME_LABEL}。
      </Note>

      <Section title="发送通道">
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            label="通道"
            value={effectiveTransport}
            onChange={(value) => setTransport(value as Transport)}
            options={transportOptions}
          />
          <TextField
            label="超时（秒）"
            value={state.timeout}
            onChange={(value) => update({ timeout: value })}
            placeholder={`默认 ${DEFAULT_TIMEOUT_MS / 1000} 秒，最长 120 秒`}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox
            label="携带 Cookie / 凭据"
            checked={includeCredentials}
            onChange={setIncludeCredentials}
            hint="等价于 fetch 的 credentials: include"
          />
          <Checkbox
            label="保存请求历史"
            checked={saveHistory}
            onChange={setSaveHistory}
            hint="仅保存脱敏后的 cURL，最多 20 条"
          />
        </div>
        {transport === 'page' && !pageChannelAvailable && (
          <Note tone="info">{EXTENSION_UNAVAILABLE_HINT} 当前已自动回退到「直接发送」。</Note>
        )}
        {effectiveTransport === 'page' && (
          <Hint>
            请求会在你最近右键使用 Coder Tools 菜单（或点击扩展图标）的那个网页里执行。若目标地址与该网页不同源，仍会受
            CORS 限制。
          </Hint>
        )}
      </Section>

      <div className="grid flex-1 gap-3 lg:grid-cols-2">
        {/* ── 请求区 ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-3">
          <Section title="从 cURL 导入" description="DevTools → Network → 右键 → Copy as cURL，粘贴后自动填充整个表单">
            <div className="flex flex-col gap-2">
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="curl 'https://api.example.com/v1/users' -H 'Accept: application/json'"
                spellCheck={false}
                aria-label="待导入的 cURL 命令"
                className="min-h-16 resize-none font-mono text-[11px]"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" disabled={importText.trim() === ''} onClick={() => importCurl(importText)}>
                  <Import className="size-3.5" />
                  解析并填充
                </Button>
                <Button size="sm" variant="ghost" disabled={importText === ''} onClick={() => setImportText('')}>
                  <Eraser className="size-3.5" />
                  清空
                </Button>
                {CURL_PRESETS.slice(0, 3).map((preset) => (
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
            <Hint>
              实际请求地址：<code className="break-all font-mono">{buildUrl(state) || '—'}</code>
            </Hint>
          </Section>

          <Section title="请求细节">
            <Tabs value={requestTab} onValueChange={(value) => setRequestTab(value as RequestTab)}>
              <TabsList className="w-full justify-start overflow-x-auto">
                {REQUEST_TABS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} active={requestTab === item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {requestTab === 'params' && (
              <PairEditor
                entries={state.query}
                onChange={(next) => update({ query: next })}
                addLabel="添加参数"
                keyPlaceholder="参数名"
                valuePlaceholder="参数值"
              />
            )}

            {requestTab === 'headers' && (
              <PairEditor
                entries={state.headers}
                onChange={(next) => update({ headers: next })}
                addLabel="添加请求头"
                keyPlaceholder="Header-Name"
                valuePlaceholder="值"
              />
            )}

            {requestTab === 'cookies' && (
              <PairEditor
                entries={state.cookies}
                onChange={(next) => update({ cookies: next })}
                addLabel="添加 Cookie"
                keyPlaceholder="名称"
                valuePlaceholder="值"
              />
            )}

            {requestTab === 'auth' && (
              <div className="flex flex-col gap-2">
                <Select
                  label="认证方式"
                  value={state.auth.kind}
                  onChange={(value) => updateAuth({ kind: value as RequestState['auth']['kind'] })}
                  options={AUTH_OPTIONS}
                />
                {state.auth.kind === 'basic' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField
                      label="用户名"
                      value={state.auth.username}
                      onChange={(value) => updateAuth({ username: value })}
                    />
                    <TextField
                      label="密码"
                      type="password"
                      value={state.auth.password}
                      onChange={(value) => updateAuth({ password: value })}
                    />
                  </div>
                )}
                {(state.auth.kind === 'bearer' || state.auth.kind === 'oauth2') && (
                  <TextField
                    label="Token"
                    type="password"
                    value={state.auth.token}
                    onChange={(value) => updateAuth({ token: value })}
                    placeholder="粘贴 Bearer Token"
                  />
                )}
                {state.auth.kind === 'token' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField
                      label="请求头名"
                      value={state.auth.headerName}
                      onChange={(value) => updateAuth({ headerName: value })}
                      placeholder="Authorization"
                    />
                    <TextField
                      label="Token 值"
                      type="password"
                      value={state.auth.token}
                      onChange={(value) => updateAuth({ token: value })}
                    />
                  </div>
                )}
                <Hint>认证信息只存在于当前页面内存，不会写入输入快照或请求历史。</Hint>
              </div>
            )}

            {requestTab === 'body' && (
              <div className="flex flex-col gap-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    label="类型"
                    value={state.body.kind}
                    onChange={(value) => updateBody({ kind: value as RequestState['body']['kind'] })}
                    options={BODY_OPTIONS}
                  />
                  <TextField
                    label="Content-Type（raw 模式）"
                    value={state.body.contentType}
                    onChange={(value) => updateBody({ contentType: value })}
                    placeholder="text/plain; charset=utf-8"
                  />
                </div>
                {(state.body.kind === 'json' || state.body.kind === 'raw') && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        disabled={state.body.kind !== 'json' || state.body.raw.trim() === ''}
                        onClick={() => {
                          const next = prettyJson(state.body.raw);
                          if (next !== null) updateBody({ raw: next });
                        }}
                      >
                        美化 JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        disabled={state.body.raw.trim() === ''}
                        onClick={() => updateBody({ raw: formatJson(state.body.raw) })}
                      >
                        压成一行
                      </Button>
                      {(state.method === 'GET' || state.method === 'HEAD') && (
                        <span className="text-[11px] text-warning">{state.method} 带 body 会被浏览器忽略</span>
                      )}
                    </div>
                    <Textarea
                      value={state.body.raw}
                      onChange={(event) => updateBody({ raw: event.target.value })}
                      placeholder={state.body.kind === 'json' ? '{\n  "name": "张三"\n}' : '任意文本'}
                      spellCheck={false}
                      aria-label="请求体内容"
                      className="min-h-28 resize-y font-mono text-[11px]"
                    />
                  </div>
                )}
                {state.body.kind === 'form' && (
                  <div className="flex flex-col gap-2">
                    <Checkbox
                      label="使用 multipart/form-data"
                      checked={state.body.multipart}
                      onChange={(checked) => updateBody({ multipart: checked })}
                    />
                    <PairEditor
                      entries={state.body.form}
                      onChange={(next) => updateBody({ form: next })}
                      addLabel="添加字段"
                      keyPlaceholder="字段名"
                      valuePlaceholder="值"
                    />
                  </div>
                )}
              </div>
            )}
          </Section>

          {warnings.length > 0 && (
            <Note tone="warn" title="浏览器能力限制">
              <ul className="list-inside list-disc">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Note>
          )}
        </div>

        {/* ── 响应区 ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col gap-3">
          <Section title="响应">
            {result === null ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {sending ? '请求发送中…' : '填写请求后点击右上角「发送请求」'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <StatGrid>
                  <Stat
                    label="状态码"
                    value={result.status !== undefined ? `${result.status} ${result.statusText ?? ''}` : '—'}
                    tone={result.ok ? statusTone(result.status) : 'danger'}
                  />
                  <Stat label="耗时" value={`${result.durationMs} ms`} />
                  <Stat label="响应大小" value={result.sizeBytes !== undefined ? `${result.sizeBytes} B` : '—'} />
                  <Stat label="通道" value={result.transport === 'page' ? '页面上下文' : '直接发送'} />
                </StatGrid>

                {result.finalUrl && result.finalUrl !== compiled.spec?.url && (
                  <Hint>
                    最终地址：<code className="break-all font-mono">{result.finalUrl}</code>
                    {result.redirected ? '（发生了重定向）' : ''}
                  </Hint>
                )}

                {result.error && (
                  <Note tone="danger" title="请求失败">
                    {result.error}
                    {result.hint && <p className="mt-1">{result.hint}</p>}
                  </Note>
                )}
                {result.hint && result.ok && <Note tone="info">{result.hint}</Note>}
                {result.truncated && (
                  <Note tone="warn">响应体超过 500 KB，仅展示前 500 KB；完整内容请用浏览器 DevTools 查看。</Note>
                )}
              </div>
            )}
          </Section>

          <Section title="响应内容" className="min-h-0 flex-1">
            <Tabs value={responseTab} onValueChange={(value) => setResponseTab(value as ResponseTab)}>
              <TabsList>
                <TabsTrigger value="body" active={responseTab === 'body'}>
                  <span className="inline-flex items-center gap-1">
                    <Globe className="size-3.5" />
                    响应体
                  </span>
                </TabsTrigger>
                <TabsTrigger value="headers" active={responseTab === 'headers'}>
                  <span className="inline-flex items-center gap-1">
                    <ListTree className="size-3.5" />
                    响应头
                  </span>
                </TabsTrigger>
                <TabsTrigger value="code" active={responseTab === 'code'}>
                  <span className="inline-flex items-center gap-1">
                    <Braces className="size-3.5" />
                    导出代码
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {responseTab === 'body' && (
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Checkbox label="美化 JSON" checked={pretty} onChange={setPretty} />
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" disabled={!displayBody} onClick={() => copyText(displayBody)}>
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!displayBody}
                    onClick={() => downloadText(exportName('response', 'txt'), displayBody, 'text/plain;charset=utf-8')}
                  >
                    <Download className="size-3.5" />
                    下载
                  </Button>
                </div>
                <Textarea
                  value={displayBody}
                  readOnly
                  spellCheck={false}
                  aria-label="响应体内容"
                  className="min-h-48 flex-1 resize-y font-mono text-[11px]"
                />
              </div>
            )}

            {responseTab === 'headers' && (
              <div className="max-h-64 overflow-auto rounded-md border scrollbar-thin">
                {!result?.headers || result.headers.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">暂无响应头</p>
                ) : (
                  <ul className="divide-y">
                    {result.headers.map(([name, value]) => (
                      <li key={name} className="flex items-start gap-2 px-3 py-1.5 text-[11px]">
                        <span className="w-40 shrink-0 break-all font-mono text-muted-foreground">{name}</span>
                        <span className="min-w-0 flex-1 break-all font-mono">
                          {displayHeaderValue(name, value)}
                          {isSensitiveHeader(name) && <span className="ml-1 text-muted-foreground">（已打码）</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {responseTab === 'code' && (
              <div className="flex flex-col gap-3">
                <ResultBox
                  label="cURL（含完整凭据，复制前请确认用途）"
                  value={curlCommand}
                  onCopy={() => copyText(curlCommand)}
                  rows="min-h-20"
                />
                <ResultBox label="fetch()" value={fetchCode} onCopy={() => copyText(fetchCode)} rows="min-h-20" />
                <ResultBox label="axios" value={axiosCode} onCopy={() => copyText(axiosCode)} rows="min-h-20" />
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={curlCommand === ''}
                  onClick={() =>
                    downloadText(exportName('request', 'sh'), `${curlPretty}\n`, 'text/x-shellscript;charset=utf-8')
                  }
                >
                  <Download className="size-3.5" />
                  下载可执行脚本
                </Button>
              </div>
            )}
          </Section>
        </div>
      </div>

      <Section
        title="请求历史"
        description="本地保存最近 20 条；点击「重放」把脱敏后的 cURL 填回表单"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={history.length === 0}
            onClick={() => {
              persistHistory([]);
              setHistoryError(null);
            }}
          >
            <Trash2 className="size-3.5" />
            清空
          </Button>
        }
      >
        {historyError !== null && (
          <Note tone="danger" title="历史没有保存">
            {historyError}
          </Note>
        )}
        {history.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">暂无历史记录</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{entry.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={entry.url}>
                  {entry.url}
                </span>
                {entry.status !== undefined && <span className="shrink-0 font-mono text-[11px]">{entry.status}</span>}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {entry.durationMs} ms · {new Date(entry.at).toLocaleTimeString()}
                </span>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => importCurl(entry.curl)}>
                  <History className="size-3" />
                  重放
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Hint>
          历史中的 Authorization、Cookie、Basic 密码与自定义 token 会被替换为占位符，重放后需重新填写；请求体最多保留
          2000 字，仍可能包含敏感内容，处理敏感接口请关闭「保存请求历史」。
        </Hint>
      </Section>

      <Note tone="info" title="能力边界">
        <ul className="list-inside list-disc">
          <li>
            浏览器禁止脚本设置 User-Agent、Host、Origin、Referer、Cookie
            等头，编译时会自动忽略并提示；需要完整控制请用导出的 cURL 在终端执行。
          </li>
          <li>fetch 无法关闭重定向跟随，也拿不到 Set-Cookie 的原文；最终地址与重定向状态会展示在结果里。</li>
          <li>二进制响应（图片、PDF、压缩包等）跳过内容展示，只返回类型与大小。</li>
          <li>
            <span className="inline-flex items-center gap-1">
              <Code2 className="size-3" />
              离线转换（HAR / cURL / Mock 规则）请继续用「抓包调试」与「接口调试」工具。
            </span>
          </li>
        </ul>
      </Note>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CircleAlert className="size-3" />
          请求在浏览器内执行，不经过任何第三方服务器
        </span>
        <span className="inline-flex items-center gap-1">
          <KeyRound className="size-3" />
          凭据不写入自动保存快照
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          默认超时 {DEFAULT_TIMEOUT_MS / 1000} 秒
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="size-3" />
          {IS_EXTENSION ? '扩展版可用页面上下文通道' : 'Web 版仅支持直接发送，跨源接口需服务端允许 CORS'}
        </span>
      </div>
    </ToolPanel>
  );
}
