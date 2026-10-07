import { AlertTriangle, Compass, Copy, Eraser, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  filterStatuses,
  getStatusDetail,
  lookupStatus,
  STATUS_SEMANTICS,
  type StatusCategory,
  type StatusDetail,
  type StatusEntry,
  type StatusSemantic,
  statusSemantics,
} from '../lib/http-status';

const CATEGORY_ORDER: (StatusCategory | '全部')[] = ['全部', '信息', '成功', '重定向', '客户端错误', '服务端错误'];

/** 类别徽标配色，1xx~5xx 一眼区分。 */
const CATEGORY_CLASS: Record<StatusCategory, string> = {
  信息: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  成功: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  重定向: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  客户端错误: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  服务端错误: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  未分配: 'border-border bg-muted text-muted-foreground',
};

const SEMANTIC_CLASS: Record<StatusSemantic, string> = {
  retry: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'retry-careful': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'no-retry': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  auth: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'fix-request': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'client-closed': 'border-border bg-muted text-muted-foreground',
};

const SEMANTIC_LABEL: Record<StatusSemantic, string> = {
  retry: '可重试',
  'retry-careful': '需谨慎重试',
  'no-retry': '不可重试',
  auth: '需要认证',
  'fix-request': '需修改请求',
  'client-closed': '客户端提前断开',
};

function CategoryBadge({ category }: { category: StatusCategory }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${CATEGORY_CLASS[category]}`}>{category}</span>;
}

function SemanticBadges({ code }: { code: number }) {
  const tags = statusSemantics(code);
  if (tags.length === 0) return <span className="text-[10px] text-muted-foreground">无特殊语义</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className={`rounded border px-1.5 py-0.5 text-[10px] ${SEMANTIC_CLASS[tag]}`}>
          {SEMANTIC_LABEL[tag]}
        </span>
      ))}
    </span>
  );
}

/** 详情缺失时的兜底内容：用基础字段拼出可用的处理建议。 */
function fallbackDetail(entry: StatusEntry): StatusDetail {
  return {
    meaning: entry.summary,
    scenario: `属于「${entry.category}」类别，具体使用场景以服务端实现为准。`,
    causes: ['以 RFC 9110 的语义定义为准', '也可能是框架或网关的私有扩展'],
    handling: [entry.advice],
    idempotentNote: '先确认上一次请求是否已产生副作用，再决定是否重试。',
    methodImpact: '取决于具体接口实现，注意阅读接口文档。',
    related: [],
    example: `HTTP/1.1 ${entry.code} ${entry.name}\nContent-Type: application/json\n\n{"error":"${entry.name
      .replace(/\s+/g, '_')
      .toLowerCase()}"}`,
  };
}

function DetailBody({ entry }: { entry: StatusEntry }) {
  const detail = getStatusDetail(entry.code) ?? fallbackDetail(entry);
  const unknown = !getStatusDetail(entry.code);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xl font-semibold">{entry.code}</span>
        <span className="text-sm">{entry.name}</span>
        <CategoryBadge category={entry.category} />
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          aria-label={`复制状态码 ${entry.code} 的示例报文`}
          onClick={() => copyText(detail.example)}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>

      {unknown && (
        <Note tone="warn" title="该状态码没有收录详情">
          下面是按类别与基础字段生成的兜底说明。标准码请查阅 RFC 9110，扩展码请查阅对应厂商文档。
        </Note>
      )}

      <dl className="grid gap-2 text-[11px] leading-relaxed">
        <div>
          <dt className="font-medium">含义</dt>
          <dd className="text-muted-foreground">{detail.meaning}</dd>
        </div>
        <div>
          <dt className="font-medium">典型场景</dt>
          <dd className="text-muted-foreground">{detail.scenario}</dd>
        </div>
        <div>
          <dt className="font-medium">常见触发原因</dt>
          <dd>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {detail.causes.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium">客户端处理建议</dt>
          <dd>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {detail.handling.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="font-medium">幂等与重试提醒</dt>
          <dd className="text-muted-foreground">{detail.idempotentNote}</dd>
        </div>
        <div>
          <dt className="font-medium">常见 HTTP 方法下的影响</dt>
          <dd className="text-muted-foreground">{detail.methodImpact}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium">语义标签</span>
        <SemanticBadges code={entry.code} />
      </div>

      {detail.related.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium">相关状态码</span>
          <ul className="space-y-1">
            {detail.related.map((item) => {
              const found = lookupStatus(item.code);
              return (
                <li key={`${item.code}-${item.note}`} className="rounded-md border px-2.5 py-1.5 text-[11px]">
                  <p className="font-medium">
                    {item.code} {found?.entry.name ?? ''}
                  </p>
                  <p className="text-muted-foreground">{item.note}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium">示例响应报文</span>
        <pre className="overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap scrollbar-thin">
          {detail.example}
        </pre>
      </div>
    </div>
  );
}

export default function HttpStatusTool() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<StatusCategory | '全部'>('全部');
  const [semantic, setSemantic] = useState<StatusSemantic | ''>('');
  const [selected, setSelected] = useState<number>(404);
  const [lookupInput, setLookupInput] = useState('');

  const list = useMemo(
    () => filterStatuses({ category, semantics: semantic === '' ? null : semantic, query }),
    [category, semantic, query],
  );

  const selectedEntry = useMemo(() => lookupStatus(selected)?.entry ?? null, [selected]);

  const lookup = useMemo<
    { ok: true; entry: StatusEntry; fallback: boolean } | { ok: false; error: string } | null
  >(() => {
    const raw = lookupInput.trim();
    if (!raw) return null;
    const code = Number(raw);
    if (!Number.isInteger(code)) return { ok: false, error: '请输入 100~599 之间的整数状态码' };
    const found = lookupStatus(code);
    if (!found) return { ok: false, error: `状态码 ${code} 超出 100~599 的合法范围` };
    return { ok: true, entry: found.entry, fallback: found.fallback };
  }, [lookupInput]);

  const semanticGroups = useMemo(
    () =>
      STATUS_SEMANTICS.map((meta) => ({
        meta,
        entries: filterStatuses({ category: '全部', semantics: meta.id }),
      })),
    [],
  );

  return (
    <ToolPanel
      title="HTTP 状态码速查"
      description="RFC 9110 标准码 + nginx / CDN 私有扩展，含客户端处理建议与重试判断"
      actions={
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 200 / not found / 4xx / 重定向"
            aria-label="搜索 HTTP 状态码"
            className="h-8 pl-7 text-xs"
          />
        </div>
      }
    >
      <Tabs value={category} onValueChange={(value) => setCategory(value as StatusCategory | '全部')}>
        <TabsList className="flex-wrap">
          {CATEGORY_ORDER.map((item) => (
            <TabsTrigger key={item} value={item}>
              {item === '全部' ? '全部' : `${item[0]}xx ${item}`}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <Section
          title={`状态码列表（${list.length}）`}
          actions={
            <div className="flex items-center gap-1.5">
              <Select
                ariaLabel="按语义筛选"
                value={semantic}
                onChange={(value) => setSemantic(value as StatusSemantic | '')}
                selectClassName="h-7 w-32"
                options={[
                  { value: '', label: '全部语义' },
                  ...STATUS_SEMANTICS.map((item) => ({ value: item.id, label: item.label })),
                ]}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="清空搜索与筛选"
                onClick={() => {
                  setQuery('');
                  setCategory('全部');
                  setSemantic('');
                }}
              >
                <Eraser className="size-3.5" />
              </Button>
            </div>
          }
        >
          {list.length === 0 ? (
            <EmptyHint>没有匹配的状态码，换个关键字或清空筛选试试</EmptyHint>
          ) : (
            <ul className="-mx-1 max-h-[26rem] space-y-1 overflow-auto pr-1 scrollbar-thin">
              {list.map((entry) => (
                <li key={entry.code}>
                  <button
                    type="button"
                    onClick={() => setSelected(entry.code)}
                    aria-pressed={selected === entry.code}
                    className={`flex w-full flex-col gap-1 rounded-md border px-2.5 py-1.5 text-left transition-colors hover:border-primary/60 hover:bg-accent/50 ${
                      selected === entry.code ? 'border-primary/70 bg-accent/60' : ''
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold">{entry.code}</span>
                      <span className="text-xs">{entry.name}</span>
                      <CategoryBadge category={entry.category} />
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">{entry.summary}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">建议：{entry.advice}</span>
                      <SemanticBadges code={entry.code} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="状态码详情" description="含典型场景、触发原因、处理建议、关联码与示例报文">
          {selectedEntry ? (
            <div className="max-h-[26rem] overflow-auto pr-1 scrollbar-thin">
              <DetailBody entry={selectedEntry} />
            </div>
          ) : (
            <EmptyHint>点击左侧任意状态码查看详情</EmptyHint>
          )}
        </Section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="快速对照" description="输入状态码，查看大字号含义与处理建议">
          <TextField
            label="状态码"
            value={lookupInput}
            onChange={setLookupInput}
            placeholder="例如 429"
            hint="支持整数，例如 200、404、502"
          />
          {lookup && !lookup.ok && (
            <Note tone="danger" title="输入无效">
              {lookup.error}
            </Note>
          )}
          {lookup?.ok && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-5xl leading-none font-semibold">{lookup.entry.code}</span>
                <span className="text-sm">{lookup.entry.name}</span>
                <CategoryBadge category={lookup.entry.category} />
              </div>
              <p className="text-[11px] text-muted-foreground">{lookup.entry.summary}</p>
              <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-[11px] leading-relaxed">
                <p className="mb-1 font-medium">处理建议</p>
                <p className="text-muted-foreground">{lookup.entry.advice}</p>
              </div>
              <SemanticBadges code={lookup.entry.code} />
              {lookup.fallback && <Hint>该码不在收录列表中，仅按首位归类，建议查阅 IANA 注册表。</Hint>}
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => {
                  setSelected(lookup.entry.code);
                  setQuery('');
                  setCategory('全部');
                  setSemantic('');
                }}
              >
                <Compass className="size-3.5" />
                在上方列表中查看
              </Button>
            </div>
          )}
        </Section>

        <Section title="语义清单" description="按客户端处理方式归类的状态码集合">
          <div className="flex flex-col gap-2">
            {semanticGroups.map((group) => (
              <div key={group.meta.id} className="rounded-md border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${SEMANTIC_CLASS[group.meta.id]}`}>
                    {group.meta.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{group.entries.length} 个</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{group.meta.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {group.entries.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      onClick={() => setSelected(entry.code)}
                      aria-label={`查看状态码 ${entry.code} ${entry.name} 的详情`}
                      className="rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors hover:border-primary/60 hover:bg-accent/50"
                    >
                      {entry.code}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Note tone="warn" title="重试前先问三个问题">
              <span className="inline-flex items-start gap-1">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                这次请求是否幂等？上一次是否已经执行？服务端是否给了 Retry-After？5xx 可退避重试，4xx 基本需要改请求。
              </span>
            </Note>
          </div>
        </Section>
      </div>

      <Note tone="info" title="语义筛选说明">
        <StatGrid className="grid-cols-1 sm:grid-cols-3">
          <Stat label="可重试" value="500 / 502 / 503 / 504 / 429" hint="配指数退避与幂等键" tone="success" />
          <Stat label="不可重试" value="400 / 403 / 404 / 410 / 501" hint="必须改代码或换配置" tone="danger" />
          <Stat label="需要认证" value="401 / 403 / 407 / 511" hint="重新登录或申请授权" tone="warn" />
        </StatGrid>
      </Note>
    </ToolPanel>
  );
}
