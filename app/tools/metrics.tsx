import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { EmptyHint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'basics' | 'promql' | 'alerts' | 'collect' | 'dashboards';

const TABS: { value: Tab; label: string }[] = [
  { value: 'basics', label: '指标基础' },
  { value: 'promql', label: 'PromQL 速查' },
  { value: 'alerts', label: '告警规则' },
  { value: 'collect', label: '采集与暴露' },
  { value: 'dashboards', label: '看板与成本' },
];

interface PromqlRow {
  query: string;
  description: string;
  note?: string;
}

const PROMQL: { category: string; rows: PromqlRow[] }[] = [
  {
    category: '选择器与匹配',
    rows: [
      { query: 'up', description: '抓取目标是否存活', note: 'up == 0 表示抓取失败' },
      { query: 'http_requests_total{job="api"}', description: '按 job 标签过滤' },
      { query: 'http_requests_total{env=~"prod|staging"}', description: '正则匹配多个值' },
      { query: 'http_requests_total{env!="dev"}', description: '排除某个值' },
      { query: 'http_requests_total{path!~"/health.*"}', description: '正则排除' },
      { query: 'http_requests_total offset 5m', description: '查看 5 分钟前的值' },
      { query: 'http_requests_total @ 1700000000', description: '查看指定时间点的值' },
    ],
  },
  {
    category: '速率与增长',
    rows: [
      {
        query: 'rate(http_requests_total[5m])',
        description: '每秒增长率（Counter 专用）',
        note: 'rate 会自动处理计数器重置',
      },
      { query: 'irate(http_requests_total[5m])', description: '瞬时增长率，只看最后两个点', note: '波动大，适合告警' },
      { query: 'increase(http_requests_total[1h])', description: '1 小时内的总增长量' },
      { query: 'rate(http_requests_total[5m]) * 60', description: '换算成每分钟请求数' },
      { query: 'sum(rate(http_requests_total[5m]))', description: '所有实例的总 QPS' },
      { query: 'sum(rate(http_requests_total[5m])) by (job)', description: '按 job 分组的 QPS' },
    ],
  },
  {
    category: '聚合与分位数',
    rows: [
      { query: 'sum(http_requests_total)', description: '全局总和' },
      { query: 'avg by (instance) (cpu_usage)', description: '按实例求平均' },
      { query: 'topk(5, http_requests_total)', description: '最大的 5 个序列' },
      { query: 'bottomk(3, memory_available)', description: '最小的 3 个序列' },
      { query: 'count(up)', description: '存活目标数' },
      { query: 'count_values("version", build_info)', description: '统计每个值的序列数' },
      {
        query: 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))',
        description: 'P99 延迟',
        note: '必须按 le 聚合，否则结果无意义',
      },
      {
        query: 'histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))',
        description: 'P50 中位数延迟',
      },
    ],
  },
  {
    category: '向量运算与缺失',
    rows: [
      { query: 'cpu_usage / 100', description: '百分比转小数' },
      { query: 'memory_used / memory_total', description: '内存使用率' },
      { query: 'up * 0', description: '把存活目标置零（技巧用法）' },
      { query: 'absent(up{job="api"})', description: '目标完全缺失时触发', note: '用于「连抓取都没有」的告警' },
      { query: 'absent_over_time(up{job="api"}[10m])', description: '10 分钟内一直缺失' },
      { query: 'up or vector(0)', description: '缺失时补零' },
      {
        query: 'predict_linear(memory_available[1h], 3600)',
        description: '1 小时后内存预测值',
        note: '用于「磁盘将满」告警',
      },
      { query: 'changes(process_start_time[1h])', description: '1 小时内重启次数' },
      { query: 'resets(http_requests_total[1h])', description: '计数器重置次数' },
      {
        query: 'label_replace(up, "region", "$1", "instance", "(.*):.*")',
        description: '从 instance 提取 region 标签',
      },
      { query: 'clamp_max(cpu_usage, 100)', description: '限制最大值' },
    ],
  },
];

interface AlertScenario {
  name: string;
  expr: string;
  threshold: string;
  duration: string;
  severity: string;
  summary: string;
}

const ALERT_SCENARIOS: AlertScenario[] = [
  {
    name: '实例宕机',
    expr: 'up == 0',
    threshold: '== 0',
    duration: '5m',
    severity: 'critical',
    summary: '实例 {{ $labels.instance }} 宕机',
  },
  {
    name: 'CPU 持续高',
    expr: '100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100',
    threshold: '> 90',
    duration: '10m',
    severity: 'warning',
    summary: 'CPU 使用率超过 90%',
  },
  {
    name: '内存高',
    expr: 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes',
    threshold: '< 0.1',
    duration: '10m',
    severity: 'warning',
    summary: '可用内存低于 10%',
  },
  {
    name: '磁盘将满',
    expr: 'predict_linear(node_filesystem_avail_bytes[6h], 24 * 3600)',
    threshold: '< 0',
    duration: '0m',
    severity: 'warning',
    summary: '磁盘 24 小时内将满',
  },
  {
    name: '请求错误率高',
    expr: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))',
    threshold: '> 0.05',
    duration: '5m',
    severity: 'critical',
    summary: '5xx 错误率超过 5%',
  },
  {
    name: '延迟 P99 超标',
    expr: 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))',
    threshold: '> 1',
    duration: '5m',
    severity: 'warning',
    summary: 'P99 延迟超过 1s',
  },
  {
    name: '抓取目标失败',
    expr: 'up == 0',
    threshold: '== 0',
    duration: '15m',
    severity: 'warning',
    summary: '抓取目标 {{ $labels.instance }} 失败',
  },
  {
    name: '容器频繁重启',
    expr: 'changes(process_start_time{container!=""}[30m])',
    threshold: '> 3',
    duration: '0m',
    severity: 'warning',
    summary: '容器 {{ $labels.container }} 30 分钟内重启超过 3 次',
  },
  {
    name: '证书即将过期',
    expr: 'cert_expiry_days',
    threshold: '< 14',
    duration: '0m',
    severity: 'warning',
    summary: '证书 {{ $labels.cn }} 14 天内过期',
  },
  {
    name: '日志错误率上升',
    expr: 'sum(rate({app="api"} |= "ERROR" [5m]))',
    threshold: '> 10',
    duration: '5m',
    severity: 'warning',
    summary: '错误日志速率超过 10/s',
  },
];

const EXPORTERS = [
  {
    name: 'node_exporter',
    port: '9100',
    metrics: 'CPU、内存、磁盘、网络、文件系统',
    alerts: '节点资源、磁盘将满、网络异常',
  },
  { name: 'mysqld_exporter', port: '9104', metrics: 'QPS、连接数、慢查询、缓冲池', alerts: '连接数耗尽、复制延迟' },
  { name: 'postgres_exporter', port: '9187', metrics: '事务、锁、连接、复制延迟', alerts: '连接数、长事务、复制延迟' },
  { name: 'redis_exporter', port: '9121', metrics: '内存、QPS、连接、键空间', alerts: '内存使用率、连接数' },
  {
    name: 'blackbox_exporter',
    port: '9115',
    metrics: 'HTTP/TCP/ICMP 探测结果与延迟',
    alerts: '端点不可达、证书过期、延迟超标',
  },
  {
    name: 'kube-state-metrics',
    port: '8080',
    metrics: 'K8s 对象状态（Pod、Deployment、Node）',
    alerts: 'Pod 异常、副本数不足',
  },
  { name: 'cAdvisor', port: '8080', metrics: '容器 CPU、内存、网络、文件系统', alerts: '容器资源超限' },
];

const LINKS: LinkItem[] = [
  {
    name: 'Prometheus 文档',
    url: 'https://prometheus.io/docs/',
    description: '官方文档：安装、配置、查询',
    tags: ['官方'],
  },
  {
    name: 'PromQL 函数参考',
    url: 'https://prometheus.io/docs/prometheus/latest/querying/functions/',
    description: '全部 PromQL 函数与用法',
    tags: ['官方', '查询'],
  },
  { name: 'Grafana 文档', url: 'https://grafana.com/docs/', description: '看板、告警、数据源配置', tags: ['官方'] },
  {
    name: 'OpenTelemetry 语义约定',
    url: 'https://opentelemetry.io/docs/specs/semconv/',
    description: '资源与 span 属性命名规范',
    tags: ['官方', '规范'],
  },
  {
    name: 'VictoriaMetrics',
    url: 'https://victoriametrics.com/',
    description: '高性能 TSDB，兼容 PromQL',
    tags: ['TSDB'],
  },
  { name: 'Mimir', url: 'https://grafana.com/oss/mimir/', description: 'Grafana 出品的可扩展指标存储', tags: ['TSDB'] },
  { name: 'Thanos', url: 'https://thanos.io/', description: 'Prometheus 高可用与长期存储方案', tags: ['TSDB'] },
  { name: 'Zabbix', url: 'https://www.zabbix.com/', description: '传统监控平台，适合企业环境', tags: ['监控'] },
  { name: 'Datadog', url: 'https://www.datadoghq.com/', description: '商业 APM 与监控平台', tags: ['商业', 'APM'] },
  { name: 'New Relic', url: 'https://newrelic.com/', description: '商业可观测性平台', tags: ['商业', 'APM'] },
];

export default function MetricsTool() {
  const [tab, setTab] = useState<Tab>('basics');
  const [query, setQuery] = useState('');
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>(['实例宕机', '请求错误率高', '延迟 P99 超标']);

  const filteredPromql = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROMQL;
    return PROMQL.map((group) => ({
      ...group,
      rows: group.rows.filter((row) => `${row.query} ${row.description} ${row.note ?? ''}`.toLowerCase().includes(q)),
    })).filter((group) => group.rows.length > 0);
  }, [query]);

  const alertsYaml = useMemo(() => {
    const lines: string[] = ['groups:', '  - name: coder-tools-alerts', '    rules:'];
    for (const scenario of ALERT_SCENARIOS.filter((s) => selectedAlerts.includes(s.name))) {
      lines.push(`      - alert: ${scenario.name.replace(/\s/g, '')}`);
      lines.push(`        expr: ${scenario.expr}`);
      lines.push(`        for: ${scenario.duration}`);
      lines.push(`        labels:`);
      lines.push(`          severity: ${scenario.severity}`);
      lines.push(`        annotations:`);
      lines.push(`          summary: "${scenario.summary}"`);
      lines.push(`          description: "当前值: {{ $value }}"`);
    }
    return lines.join('\n');
  }, [selectedAlerts]);

  return (
    <ToolPanel
      title="指标监控"
      description="需 Prometheus / Grafana 等后端，本页提供指标口径、PromQL 速查与告警规则生成"
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
      {tab === 'basics' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="四类指标对比">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">类型</th>
                    <th className="px-2 py-1 font-medium">语义</th>
                    <th className="px-2 py-1 font-medium">典型用途</th>
                    <th className="px-2 py-1 font-medium">命名惯例</th>
                    <th className="px-2 py-1 font-medium">错误用法</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      'Counter',
                      '只增不减的累计值',
                      '请求总数、错误数、字节数',
                      '_total 后缀',
                      '对 Counter 用 avg 而不先 rate',
                    ],
                    [
                      'Gauge',
                      '可增可减的瞬时值',
                      '内存使用、连接数、队列长度',
                      '无特殊后缀',
                      '用 Gauge 累计计数（重启会归零）',
                    ],
                    [
                      'Histogram',
                      '分桶统计，可算分位数',
                      '请求延迟、响应大小',
                      '_bucket/_sum/_count',
                      '不按 le 聚合 histogram_quantile',
                    ],
                    [
                      'Summary',
                      '客户端计算分位数',
                      '延迟（客户端聚合）',
                      '_sum/_count',
                      '跨实例聚合 Summary 分位数（不可加）',
                    ],
                    ['Info', '元信息（值恒为 1）', '版本、构建信息', '_info', '把 Info 当 Gauge 用'],
                  ].map(([type, semantic, usage, naming, wrong]) => (
                    <tr key={type} className="border-b">
                      <td className="px-2 py-1 font-mono font-medium">{type}</td>
                      <td className="px-2 py-1">{semantic}</td>
                      <td className="px-2 py-1">{usage}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{naming}</td>
                      <td className="px-2 py-1 text-destructive">{wrong}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Label 设计规范">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">推荐 Label</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  service、env、region、instance、job、path、method、status_code —— 低基数、有业务含义、数量可控。
                </p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">高基数危害</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  把 user_id、request_id、完整 URL 当 label 会导致时间线爆炸：每个唯一值一条序列，Prometheus
                  内存与查询性能急剧下降。
                </p>
              </div>
            </div>
          </Section>
          <Section title="RED / USE / 黄金信号">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">RED（服务）</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Rate 请求速率、Errors 错误率、Duration 延迟</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">USE（资源）</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Utilization 使用率、Saturation 饱和度、Errors 错误
                </p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">四个黄金信号</p>
                <p className="mt-1 text-[11px] text-muted-foreground">延迟、流量、错误、饱和度</p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === 'promql' && (
        <div className="flex min-w-0 flex-col gap-3">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索查询或说明…"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          {filteredPromql.map((group) => (
            <Section key={group.category} title={group.category}>
              <div className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <div key={row.query} className="rounded-md border px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <code className="min-w-0 break-all font-mono text-xs">{row.query}</code>
                      <Button size="sm" variant="ghost" onClick={() => copyText(row.query)} aria-label="复制查询">
                        复制
                      </Button>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{row.description}</p>
                    {row.note && <p className="text-[11px] text-amber-600 dark:text-amber-400">{row.note}</p>}
                  </div>
                ))}
              </div>
            </Section>
          ))}
          {filteredPromql.length === 0 && <EmptyHint>没有匹配的查询</EmptyHint>}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs text-muted-foreground">勾选要包含的告警场景：</p>
            {ALERT_SCENARIOS.map((scenario) => (
              <label key={scenario.name} className="flex items-start gap-2 rounded-md border px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={selectedAlerts.includes(scenario.name)}
                  onChange={(event) =>
                    setSelectedAlerts((prev) =>
                      event.target.checked ? [...prev, scenario.name] : prev.filter((n) => n !== scenario.name),
                    )
                  }
                  className="mt-0.5 size-3.5 accent-primary"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{scenario.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        scenario.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {scenario.severity}
                    </span>
                  </div>
                  <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
                    {scenario.expr}
                  </code>
                </div>
              </label>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">生成结果</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => copyText(alertsYaml)}>
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadText(exportName('alerts', 'yml'), alertsYaml, 'text/yaml;charset=utf-8')}
                >
                  下载
                </Button>
              </div>
            </div>
            <CodeBlock code={alertsYaml} language="yaml" filename="alerts.yml" lineNumbers />
            <Note tone="info" title="for 字段">
              for 表示条件持续多久才触发告警，避免瞬时抖动产生噪音。critical 告警通常 5m，warning 可 10-15m。
            </Note>
          </div>
        </div>
      )}

      {tab === 'collect' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Exporter 清单">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Exporter</th>
                    <th className="px-2 py-1 font-medium">端口</th>
                    <th className="px-2 py-1 font-medium">暴露指标</th>
                    <th className="px-2 py-1 font-medium">常用告警</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPORTERS.map((row) => (
                    <tr key={row.name} className="border-b">
                      <td className="px-2 py-1 font-mono">{row.name}</td>
                      <td className="px-2 py-1 font-mono">{row.port}</td>
                      <td className="px-2 py-1">{row.metrics}</td>
                      <td className="px-2 py-1 text-muted-foreground">{row.alerts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="采集代码片段">
            <div className="flex flex-col gap-2">
              <CodeBlock
                language="javascript"
                title="Node.js prom-client"
                code={`const client = require('prom-client');
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 请求延迟',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path ?? 'unknown', status_code: res.statusCode }));
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});`}
              />
              <CodeBlock
                language="python"
                title="Python prometheus_client"
                code={`from prometheus_client import Counter, Histogram, start_http_server
import time

REQUEST_COUNT = Counter('http_requests_total', '请求总数', ['method', 'status_code'])
REQUEST_LATENCY = Histogram('http_request_duration_seconds', '请求延迟', buckets=[0.01, 0.05, 0.1, 0.5, 1, 5])

start_http_server(8000)

@app.route('/api')
def api():
    start = time.time()
    REQUEST_COUNT.labels(method='GET', status_code='200').inc()
    REQUEST_LATENCY.observe(time.time() - start)
    return 'ok'`}
              />
              <CodeBlock
                language="yaml"
                title="prometheus.yml 抓取配置"
                code={`scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
  - job_name: 'api'
    metrics_path: /metrics
    static_configs:
      - targets: ['api:8080']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance`}
              />
            </div>
          </Section>
        </div>
      )}

      {tab === 'dashboards' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Grafana 面板与成本">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">面板类型选择</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Time series 看趋势、Stat 看单值、Gauge 看百分比、Table 看明细、Heatmap 看分布、Logs 看日志。
                </p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">变量与间隔</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  用 $service 等变量做下拉筛选；rate 间隔用 $__rate_interval 自动适配，避免固定 [5m] 在低分辨率下断线。
                </p>
              </div>
            </div>
          </Section>
          <Section title="TSDB 对比">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">方案</th>
                    <th className="px-2 py-1 font-medium">架构</th>
                    <th className="px-2 py-1 font-medium">适用规模</th>
                    <th className="px-2 py-1 font-medium">成本模型</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Prometheus', '单节点 TSDB', '中小规模', '本地磁盘，成本最低'],
                    ['VictoriaMetrics', '单节点或集群', '大规模', '压缩率高，磁盘省 5-10 倍'],
                    ['Mimir', '微服务拆分', '超大规模', '对象存储，按用量付费'],
                    ['Thanos', 'Sidecar + Store', '超大规模', '对象存储，长期保留'],
                  ].map(([name, arch, scale, cost]) => (
                    <tr key={name} className="border-b">
                      <td className="px-2 py-1 font-mono">{name}</td>
                      <td className="px-2 py-1">{arch}</td>
                      <td className="px-2 py-1">{scale}</td>
                      <td className="px-2 py-1 text-muted-foreground">{cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="指标健康自查">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>只看平均值不看分位数（P99 才是用户体验）</li>
              <li>告警阈值一刀切，没有按服务分级</li>
              <li>没有业务 SLO，只有技术指标</li>
              <li>指标命名混乱，同一含义多个名字</li>
              <li>看板无人看，告警无人认领</li>
              <li>没有 up 监控（抓取失败无感知）</li>
              <li>没有 scrape duration 监控（抓取慢无感知）</li>
              <li>label 用了 timestamp 或自增 ID</li>
              <li>histogram 没按 le 聚合就 quantile</li>
              <li>Counter 直接 avg 而不先 rate</li>
            </ul>
          </Section>
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <LinkList items={LINKS} />
      </div>
    </ToolPanel>
  );
}
