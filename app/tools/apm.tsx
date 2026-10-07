import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { NumberField } from '../components/ui/field';
import { type LinkItem, LinkList, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

type Tab = 'concepts' | 'semconv' | 'code' | 'query' | 'analysis';

const TABS: { value: Tab; label: string }[] = [
  { value: 'concepts', label: '原理与概念' },
  { value: 'semconv', label: '埋点速查' },
  { value: 'code', label: '代码生成' },
  { value: 'query', label: '查询与关联' },
  { value: 'analysis', label: '性能分析与 SLO' },
];

const SPAN_KINDS = [
  { kind: 'server', usage: '服务端处理请求', example: 'HTTP GET /users/:id', note: '入口 span，有 parent' },
  { kind: 'client', usage: '客户端发起调用', example: 'HTTP POST /orders', note: '调用下游服务' },
  { kind: 'producer', usage: '发送消息到队列', example: 'messaging publish', note: '消息生产者' },
  { kind: 'consumer', usage: '从队列消费消息', example: 'messaging process', note: '消息消费者' },
  { kind: 'internal', usage: '进程内部操作', example: 'cache lookup', note: '无跨进程边界' },
];

const SEMCONV = [
  {
    category: 'HTTP',
    spanName: 'GET /users/:id',
    attrs: 'http.request.method, http.route, http.response.status_code, url.path, server.address',
    error: '把完整 URL 当 span 名',
  },
  {
    category: 'RPC',
    spanName: 'grpc UserService/GetUser',
    attrs: 'rpc.system, rpc.service, rpc.method, rpc.grpc.status_code',
    error: '漏了 rpc.system',
  },
  {
    category: '数据库',
    spanName: 'SELECT users',
    attrs: 'db.system.name, db.namespace, db.operation.name, db.query.summary',
    error: '把完整 SQL 当 span 名',
  },
  {
    category: '消息',
    spanName: 'messaging process',
    attrs: 'messaging.system, messaging.destination.name, messaging.operation',
    error: 'destination 用了高基数 topic',
  },
  {
    category: '缓存',
    spanName: 'cache get',
    attrs: 'db.system.name=redis, db.operation.name=get',
    error: '没区分缓存与数据库',
  },
  {
    category: 'FaaS',
    spanName: 'function invoke',
    attrs: 'faas.invoked_name, faas.invoked_provider, faas.trigger',
    error: '漏了 trigger 类型',
  },
];

const CODE_SNIPPETS = [
  {
    language: 'javascript' as const,
    title: 'Node.js OpenTelemetry',
    code: `const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// 手动 span
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('my-service');

app.get('/api/users/:id', async (req, res) => {
  const span = tracer.startActiveSpan('get-user', (span) => {
    span.setAttribute('user.id', req.params.id);
    return span;
  });
  try {
    const user = await db.users.findById(req.params.id);
    res.json(user);
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    span.end();
  }
});`,
  },
  {
    language: 'python' as const,
    title: 'Python OpenTelemetry',
    code: `from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer(__name__)

@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    with tracer.start_as_current_span("get-user") as span:
        span.set_attribute("user.id", user_id)
        user = await db.users.find_by_id(user_id)
        return user`,
  },
  {
    language: 'go' as const,
    title: 'Go OpenTelemetry',
    code: `package main

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

var tracer = otel.Tracer("my-service")

func main() {
    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx, span := tracer.Start(r.Context(), "handle-request")
        defer span.End()
        span.SetAttributes(attribute.String("http.route", r.URL.Path))
        // 业务逻辑
    })
    http.ListenAndServe(":8080", otelhttp.NewHandler(handler, "server"))
}`,
  },
  {
    language: 'java' as const,
    title: 'Java OpenTelemetry',
    code: `// 启动参数
// -javaagent:opentelemetry-javaagent.jar
// -Dotel.service.name=my-service
// -Dotel.exporter.otlp.endpoint=http://otel-collector:4318

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.instrumentation.annotations.WithSpan;

public class UserService {
    @WithSpan
    public User getUser(@SpanAttribute("user.id") String userId) {
        Span.current().setAttribute("db.system.name", "postgresql");
        return db.users.findById(userId);
    }
}`,
  },
  {
    language: 'javascript' as const,
    title: '浏览器 Performance API',
    code: `// Resource Timing
const resources = performance.getEntriesByType('resource');
resources.forEach(r => {
  console.log(r.name, r.duration, r.transferSize);
});

// 自定义 mark 与 measure
performance.mark('task-start');
doHeavyWork();
performance.mark('task-end');
performance.measure('heavy-task', 'task-start', 'task-end');

// Long Task 观察
new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    console.log('Long task:', entry.duration, entry.startTime);
  });
}).observe({ entryTypes: ['longtask'] });

// 清理 buffer
performance.clearResourceTimings();`,
  },
];

const QUERY_EXAMPLES = [
  {
    system: 'Jaeger',
    queries: [
      'service=api&operation=get-user&limit=20',
      'service=api&error=true&lookback=1h',
      'service=api&minDuration=100ms&limit=10',
    ],
  },
  {
    system: 'Zipkin',
    queries: [
      'serviceName=api&spanName=get-user&limit=20',
      'serviceName=api&annotationQuery=error=true',
      'serviceName=api&minDuration=100&limit=10',
    ],
  },
  {
    system: 'Tempo',
    queries: [
      '{resource.serviceName="api"}',
      '{resource.serviceName="api"} | status=error',
      '{resource.serviceName="api"} | duration > 1s',
    ],
  },
  {
    system: 'Datadog',
    queries: ['service:api @http.status_code:500', 'service:api @duration:>1000ms', 'service:api error:true'],
  },
  {
    system: 'SkyWalking',
    queries: ['traceId = "abc123"', 'service=api&endpoint=get-user', 'service=api&status=ERROR'],
  },
];

const PROFILING = [
  {
    lang: 'Node.js',
    tool: 'node --cpu-prof --cpu-prof-dir=./profiles server.js',
    note: '生成 .cpuprofile，用 --prof-process 分析',
  },
  { lang: 'Python', tool: 'py-spy record -o profile.svg -- python app.py', note: '火焰图，无需改代码' },
  { lang: 'Go', tool: 'go tool pprof -http=:8080 cpu.prof', note: 'go test -cpuprofile 或 net/http/pprof' },
  {
    lang: 'Java',
    tool: 'java -XX:+FlightRecorder -XX:StartFlightRecording=duration=60s,filename=rec.jfr',
    note: 'JFR 记录，用 JMC 分析',
  },
  {
    lang: 'Linux',
    tool: 'perf record -F 99 -g -- sleep 30 && perf script | stackcollapse-perf.pl | flamegraph.pl > out.svg',
    note: 'perf + FlameGraph 脚本',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'OpenTelemetry 文档',
    url: 'https://opentelemetry.io/docs/',
    description: '官方文档：概念、SDK、Collector',
    tags: ['官方'],
  },
  {
    name: 'OTel 语义约定',
    url: 'https://opentelemetry.io/docs/specs/semconv/',
    description: 'span 与属性命名规范',
    tags: ['官方', '规范'],
  },
  { name: 'Jaeger', url: 'https://www.jaegertracing.io/', description: '开源分布式追踪系统', tags: ['开源'] },
  { name: 'Zipkin', url: 'https://zipkin.io/', description: 'Twitter 开源的追踪系统', tags: ['开源'] },
  {
    name: 'Grafana Tempo',
    url: 'https://grafana.com/oss/tempo/',
    description: 'Grafana 出品的追踪后端',
    tags: ['开源'],
  },
  { name: 'Datadog APM', url: 'https://www.datadoghq.com/product/apm/', description: '商业 APM 平台', tags: ['商业'] },
  {
    name: 'SkyWalking',
    url: 'https://skywalking.apache.org/',
    description: 'Apache 顶级项目，APM + 可观测',
    tags: ['开源'],
  },
  { name: 'Elastic APM', url: 'https://www.elastic.co/apm', description: 'Elastic 可观测性套件', tags: ['商业'] },
  {
    name: 'Sentry Performance',
    url: 'https://sentry.io/for/performance/',
    description: '错误监控 + 性能追踪',
    tags: ['商业'],
  },
  {
    name: 'py-spy',
    url: 'https://github.com/benfred/py-spy',
    description: 'Python 采样 profiler',
    tags: ['开源', '工具'],
  },
];

export default function ApmTool() {
  const [tab, setTab] = useState<Tab>('concepts');
  const [sloTarget, setSloTarget] = useState(99.9);
  const [windowDays, setWindowDays] = useState(30);
  const [totalRequests, setTotalRequests] = useState(1000000);
  const [currentErrorRate, setCurrentErrorRate] = useState(0.02);

  const sloResult = useMemo(() => {
    const windowSeconds = windowDays * 24 * 3600;
    const allowedErrorRate = 1 - sloTarget / 100;
    const allowedErrorTime = allowedErrorRate * windowSeconds;
    const allowedErrorRequests = Math.floor(allowedErrorRate * totalRequests);
    const currentErrorRequests = Math.floor((currentErrorRate / 100) * totalRequests);
    const budgetRemaining = Math.max(0, 1 - currentErrorRate / 100 / allowedErrorRate);
    const burnRate = allowedErrorRate > 0 ? currentErrorRate / 100 / allowedErrorRate : 0;
    const daysLeft = burnRate > 0 ? budgetRemaining / burnRate : Infinity;
    return {
      allowedErrorRate: (allowedErrorRate * 100).toFixed(3),
      allowedErrorTime: `${Math.floor(allowedErrorTime / 3600)}h ${Math.floor((allowedErrorTime % 3600) / 60)}m`,
      allowedErrorRequests,
      currentErrorRequests,
      budgetRemaining: (budgetRemaining * 100).toFixed(1),
      burnRate: burnRate.toFixed(2),
      daysLeft: Number.isFinite(daysLeft) ? daysLeft.toFixed(1) : '∞',
    };
  }, [sloTarget, windowDays, totalRequests, currentErrorRate]);

  return (
    <ToolPanel
      title="链路追踪 / APM"
      description="需埋点 SDK 或 APM 后端，本页提供概念、语义约定、代码生成与 SLO 计算器"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'concepts' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="SpanKind 语义">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Kind</th>
                    <th className="px-2 py-1 font-medium">用途</th>
                    <th className="px-2 py-1 font-medium">示例</th>
                    <th className="px-2 py-1 font-medium">注意</th>
                  </tr>
                </thead>
                <tbody>
                  {SPAN_KINDS.map((row) => (
                    <tr key={row.kind} className="border-b">
                      <td className="px-2 py-1 font-mono">{row.kind}</td>
                      <td className="px-2 py-1">{row.usage}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{row.example}</td>
                      <td className="px-2 py-1 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="上下文传播">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">W3C Trace Context</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                  <br />
                  32 位 trace-id + 16 位 span-id + 2 位 flags
                </p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">采样策略</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Head 采样：入口决定，简单但可能丢关键链路。Tail 采样：收集完再决定，保留错误与慢请求，但成本高。
                </p>
              </div>
            </div>
          </Section>
          <Section title="调用链示例">
            <div className="rounded-md border p-3">
              <svg viewBox="0 0 600 160" className="w-full" role="img" aria-label="调用链示例">
                <rect
                  x="10"
                  y="20"
                  width="120"
                  height="30"
                  rx="4"
                  fill="var(--primary)"
                  opacity="0.2"
                  stroke="var(--primary)"
                />
                <text x="70" y="39" textAnchor="middle" fontSize="11" fill="var(--foreground)">
                  GET /api/users
                </text>
                <rect
                  x="180"
                  y="60"
                  width="100"
                  height="30"
                  rx="4"
                  fill="var(--primary)"
                  opacity="0.2"
                  stroke="var(--primary)"
                />
                <text x="230" y="79" textAnchor="middle" fontSize="11" fill="var(--foreground)">
                  DB query
                </text>
                <rect
                  x="330"
                  y="100"
                  width="100"
                  height="30"
                  rx="4"
                  fill="var(--primary)"
                  opacity="0.2"
                  stroke="var(--primary)"
                />
                <text x="380" y="119" textAnchor="middle" fontSize="11" fill="var(--foreground)">
                  Redis get
                </text>
                <line x1="130" y1="35" x2="180" y2="60" stroke="var(--muted-foreground)" strokeWidth="1" />
                <line x1="280" y1="75" x2="330" y2="100" stroke="var(--muted-foreground)" strokeWidth="1" />
                <text x="155" y="55" fontSize="9" fill="var(--muted-foreground)">
                  50ms
                </text>
                <text x="305" y="95" fontSize="9" fill="var(--muted-foreground)">
                  5ms
                </text>
              </svg>
            </div>
          </Section>
        </div>
      )}

      {tab === 'semconv' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="OpenTelemetry 语义约定">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">类别</th>
                    <th className="px-2 py-1 font-medium">Span 名</th>
                    <th className="px-2 py-1 font-medium">关键属性</th>
                    <th className="px-2 py-1 font-medium">常见错误</th>
                  </tr>
                </thead>
                <tbody>
                  {SEMCONV.map((row) => (
                    <tr key={row.category} className="border-b">
                      <td className="px-2 py-1 font-medium">{row.category}</td>
                      <td className="px-2 py-1 font-mono">{row.spanName}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{row.attrs}</td>
                      <td className="px-2 py-1 text-destructive">{row.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="埋点检查清单">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>入口 span 覆盖所有 HTTP/RPC/消息入口</li>
              <li>下游调用（HTTP 客户端、DB、缓存、消息）自动或手动埋点</li>
              <li>错误捕获：recordException + status=ERROR</li>
              <li>PII 脱敏：用户 ID 哈希、手机号打码</li>
              <li>采样率合理：入口 10-50%，错误 100%</li>
              <li>属性低基数：不用 user_id、request_id 当属性</li>
              <li>健康探针排除：/health、/metrics 不产生 span</li>
              <li>异步传播：线程池、消息队列正确传递 context</li>
              <li>span 命名规范：低基数路由，不含具体参数</li>
            </ul>
          </Section>
        </div>
      )}

      {tab === 'code' && (
        <div className="flex min-w-0 flex-col gap-3">
          {CODE_SNIPPETS.map((snippet) => (
            <Section key={snippet.title} title={snippet.title}>
              <CodeBlock code={snippet.code} language={snippet.language} lineNumbers />
              <Button size="sm" variant="outline" onClick={() => copyText(snippet.code)}>
                复制
              </Button>
            </Section>
          ))}
        </div>
      )}

      {tab === 'query' && (
        <div className="flex min-w-0 flex-col gap-3">
          {QUERY_EXAMPLES.map((item) => (
            <Section key={item.system} title={item.system}>
              <div className="flex flex-col gap-1.5">
                {item.queries.map((q) => (
                  <div key={q} className="flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5">
                    <code className="min-w-0 break-all font-mono text-xs">{q}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyText(q)} aria-label="复制查询">
                      复制
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          ))}
          <Section title="Trace ↔ Logs ↔ Metrics 关联">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">Trace → Logs</p>
                <p className="mt-1 text-[11px] text-muted-foreground">日志里输出 trace_id，用 trace_id 过滤日志</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">Logs → Trace</p>
                <p className="mt-1 text-[11px] text-muted-foreground">从日志的 trace_id 跳转到对应链路</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">Metrics → Trace</p>
                <p className="mt-1 text-[11px] text-muted-foreground">从告警的 label 找到异常 trace 样本</p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === 'analysis' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Profiling 工具速查">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">语言</th>
                    <th className="px-2 py-1 font-medium">命令</th>
                    <th className="px-2 py-1 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {PROFILING.map((row) => (
                    <tr key={row.lang} className="border-b">
                      <td className="px-2 py-1 font-medium">{row.lang}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{row.tool}</td>
                      <td className="px-2 py-1 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="SLO 计算器">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberField
                label="可用性目标"
                value={sloTarget}
                min={90}
                max={99.999}
                step={0.1}
                suffix="%"
                onChange={setSloTarget}
              />
              <NumberField label="时间窗口" value={windowDays} min={1} max={90} suffix="天" onChange={setWindowDays} />
              <NumberField
                label="总请求数"
                value={totalRequests}
                min={1000}
                max={100000000}
                step={1000}
                onChange={setTotalRequests}
              />
              <NumberField
                label="当前错误率"
                value={currentErrorRate}
                min={0}
                max={100}
                step={0.01}
                suffix="%"
                onChange={setCurrentErrorRate}
              />
            </div>
            <div className="mt-3">
              <StatGrid>
                <Stat label="允许错误率" value={`${sloResult.allowedErrorRate}%`} />
                <Stat label="允许错误时间" value={sloResult.allowedErrorTime} />
                <Stat label="允许错误请求数" value={sloResult.allowedErrorRequests.toLocaleString()} />
                <Stat label="当前错误请求数" value={sloResult.currentErrorRequests.toLocaleString()} />
                <Stat
                  label="错误预算剩余"
                  value={`${sloResult.budgetRemaining}%`}
                  tone={Number(sloResult.budgetRemaining) < 50 ? 'warn' : 'success'}
                />
                <Stat
                  label="燃尽速率"
                  value={`${sloResult.burnRate}x`}
                  tone={Number(sloResult.burnRate) > 1 ? 'danger' : 'success'}
                />
                <Stat label="预算可撑天数" value={sloResult.daysLeft} />
              </StatGrid>
            </div>
            <Note tone="info">
              错误预算 = 1 - SLO 目标。燃尽速率 &gt; 1 表示预算会提前耗尽。例如 99.9% SLO 允许 0.1% 错误， 当前错误率
              0.02% 是允许值的 0.2 倍，燃尽速率 0.2x。
            </Note>
          </Section>
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <LinkList items={LINKS} />
      </div>
    </ToolPanel>
  );
}
