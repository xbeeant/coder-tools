import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Select, TextField } from '../components/ui/field';
import { EmptyHint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

type Tab = 'format' | 'logql' | 'es' | 'builder' | 'collect';

const TABS: { value: Tab; label: string }[] = [
  { value: 'format', label: '格式与规范' },
  { value: 'logql', label: 'LogQL 速查' },
  { value: 'es', label: 'ES DSL 速查' },
  { value: 'builder', label: '查询构造器' },
  { value: 'collect', label: '采集与排障' },
];

interface QueryRow {
  query: string;
  description: string;
  note?: string;
}

const LOGQL: { category: string; rows: QueryRow[] }[] = [
  {
    category: '标签选择',
    rows: [
      { query: '{app="api"}', description: '选择 app=api 的日志流' },
      { query: '{app="api", env="prod"}', description: '多标签 AND' },
      { query: '{app="api"} |= "error"', description: '包含 error 的行' },
      { query: '{app="api"} != "error"', description: '不包含 error 的行' },
      { query: '{app="api"} |~ "timeout|refused"', description: '正则匹配' },
      { query: '{app="api"} !~ "health"', description: '正则排除' },
    ],
  },
  {
    category: '解析与处理',
    rows: [
      { query: '{app="api"} | json', description: 'JSON 解析，字段变成标签' },
      { query: '{app="api"} | logfmt', description: 'logfmt 解析' },
      { query: '{app="api"} | regexp "status=(?P<status>\\\\d+)"', description: '正则提取命名捕获组' },
      { query: '{app="api"} | pattern "<_>status=<status> <_>"', description: 'Loki pattern 解析' },
      { query: '{app="api"} | line_format "{{.status}} {{.path}}', description: '自定义输出格式' },
      { query: '{app="api"} | label_format level="{{.level}}"', description: '重命名标签' },
      { query: '{app="api"} | drop __error__', description: '丢弃解析错误字段' },
    ],
  },
  {
    category: '聚合统计',
    rows: [
      { query: 'count_over_time({app="api"}[5m])', description: '5 分钟内日志行数' },
      { query: 'sum(count_over_time({app="api"}[5m]))', description: '总日志量' },
      { query: 'sum by (level) (count_over_time({app="api"}[5m]))', description: '按级别统计' },
      { query: 'rate({app="api"} |= "error" [5m])', description: '错误日志速率' },
      { query: 'bytes_rate({app="api"}[5m])', description: '日志字节速率' },
      { query: 'topk(10, sum by (path) (count_over_time({app="api"}[1h])))', description: 'Top 10 路径' },
      { query: 'sum(rate({app="api"}[5m])) / sum(rate({app="api"} |= "error" [5m]))', description: '错误率' },
    ],
  },
  {
    category: '边界与其它',
    rows: [
      { query: '{app="api"} | json | line_format "{{.message}}"', description: '只输出 message' },
      { query: '{app="api"} |= "trace_id" | json', description: '过滤后解析' },
      { query: 'sum(count_over_time({app="api"}[5m] offset 1h))', description: '1 小时前的量' },
      { query: 'absent_over_time({app="api"}[10m])', description: '10 分钟无日志时触发', note: '用于「日志中断」告警' },
      { query: 'label_replace(up, "region", "$1", "instance", "(.*):.*")', description: '从 instance 提取 region' },
    ],
  },
];

const ES_DSL: { category: string; rows: { query: string; description: string }[] }[] = [
  {
    category: '基础查询',
    rows: [
      { query: '{"query": {"match": {"message": "timeout"}}}', description: '全文匹配' },
      { query: '{"query": {"match_phrase": {"message": "connection refused"}}}', description: '短语匹配' },
      { query: '{"query": {"term": {"status": 500}}}', description: '精确匹配' },
      { query: '{"query": {"terms": {"status": [500, 502, 503]}}}', description: '多值匹配' },
      { query: '{"query": {"range": {"@timestamp": {"gte": "now-1h"}}}}', description: '时间范围' },
      { query: '{"query": {"exists": {"field": "trace_id"}}}', description: '字段存在' },
      { query: '{"query": {"wildcard": {"path": "/api/*"}}}', description: '通配符' },
      { query: '{"query": {"regexp": {"message": "err.*"}}}', description: '正则' },
    ],
  },
  {
    category: 'Bool 组合',
    rows: [
      { query: '{"query": {"bool": {"must": [{"match": {"level": "ERROR"}}]}}}', description: '必须匹配' },
      {
        query: '{"query": {"bool": {"should": [{"match": {"status": 500}}, {"match": {"status": 503}}]}}}',
        description: '任一匹配',
      },
      { query: '{"query": {"bool": {"must_not": [{"match": {"path": "/health"}}]}}}', description: '必须不匹配' },
      {
        query: '{"query": {"bool": {"filter": [{"range": {"@timestamp": {"gte": "now-5m"}}}]}}}',
        description: '过滤（不算分）',
      },
      {
        query: '{"query": {"multi_match": {"query": "timeout", "fields": ["message", "stack"]}}}',
        description: '多字段匹配',
      },
    ],
  },
  {
    category: '聚合分析',
    rows: [
      { query: '{"aggs": {"by_level": {"terms": {"field": "level"}}}}', description: '按级别分桶' },
      {
        query: '{"aggs": {"per_minute": {"date_histogram": {"field": "@timestamp", "fixed_interval": "1m"}}}}',
        description: '按分钟分桶',
      },
      { query: '{"aggs": {"latency_stats": {"stats": {"field": "latency_ms"}}}}', description: '延迟统计' },
      {
        query: '{"aggs": {"latency_percentiles": {"percentiles": {"field": "latency_ms"}}}}',
        description: '延迟分位数',
      },
      { query: '{"aggs": {"cardinality": {"field": "user_id"}}}', description: '基数统计' },
      {
        query: '{"query": {"nested": {"path": "items", "query": {"match": {"items.name": "x"}}}}}',
        description: '嵌套对象查询',
      },
    ],
  },
];

const TROUBLESHOOT = [
  {
    symptom: 'Pod 日志看不到',
    cause: '容器重启后旧日志丢失',
    fix: 'kubectl logs --previous 查看上一个容器的日志；CRI 日志路径 /var/log/pods',
  },
  { symptom: '日志量爆炸', cause: '调试日志未关或异常风暴', fix: '降低日志级别；对错误日志去重；限流丢弃' },
  { symptom: '时区不一致', cause: '容器内 UTC，查看时本地时区', fix: '统一用 UTC 存储，展示层转换；或容器设 TZ' },
  { symptom: '字段被截断', cause: '采集端或存储端字段长度限制', fix: '调大 max_message_size；大字段单独存对象存储' },
  { symptom: 'Loki out-of-order', cause: '日志时间戳乱序', fix: '开启 unordered_writes；或调整 ingestion 时间窗口' },
  {
    symptom: 'ES circuit_breaking_exception',
    cause: '内存不足，查询或聚合太重',
    fix: '减少聚合深度；增加堆内存；用 search_after 替代深分页',
  },
  { symptom: 'ES 拒绝写入', cause: 'max_shards_per_node 或磁盘水位线', fix: '调整集群设置；清理旧索引；增加磁盘' },
  {
    symptom: '__error__ 解析失败',
    cause: '日志格式与解析器不匹配',
    fix: '检查 json/logfmt 解析是否正确；用 line_format 手动处理',
  },
  {
    symptom: 'label 高基数导致 429',
    cause: 'label 值太多（如 user_id）',
    fix: '把高基数字段从 label 移到行内容；用 | json 解析',
  },
  { symptom: '采集端丢弃日志', cause: 'mem buffer 满或背压', fix: '增加 buffer；降低采集频率；用文件缓冲' },
  { symptom: '日志风暴打爆磁盘', cause: '异常时大量重复日志', fix: '应用层限流；采集端采样；设置磁盘配额' },
  {
    symptom: 'trace_id 关联不上',
    cause: '日志里没有 trace_id 或格式不对',
    fix: '确认埋点输出 trace_id；用 | json 或正则提取',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'Loki 文档',
    url: 'https://grafana.com/docs/loki/latest/',
    description: '官方文档：安装、配置、LogQL',
    tags: ['官方'],
  },
  {
    name: 'LogQL 语法',
    url: 'https://grafana.com/docs/loki/latest/query/',
    description: 'LogQL 查询语言完整参考',
    tags: ['官方', '查询'],
  },
  {
    name: 'Elasticsearch 查询 DSL',
    url: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html',
    description: '官方查询 DSL 文档',
    tags: ['官方'],
  },
  {
    name: 'OpenTelemetry Logs',
    url: 'https://opentelemetry.io/docs/specs/otel/logs/',
    description: '日志语义约定与数据模型',
    tags: ['官方', '规范'],
  },
  { name: 'Fluent Bit', url: 'https://docs.fluentbit.io/', description: '轻量日志采集器', tags: ['采集'] },
  {
    name: 'Filebeat',
    url: 'https://www.elastic.co/guide/en/beats/filebeat/current/index.html',
    description: 'Elastic 官方采集器',
    tags: ['采集'],
  },
  { name: 'Vector', url: 'https://vector.dev/', description: '高性能可观测数据管道', tags: ['采集'] },
  {
    name: 'Promtail',
    url: 'https://grafana.com/docs/loki/latest/send-data/promtail/',
    description: 'Loki 官方采集器',
    tags: ['采集'],
  },
  { name: 'Datadog Logs', url: 'https://docs.datadoghq.com/logs/', description: '商业日志管理', tags: ['商业'] },
  {
    name: '阿里云 SLS',
    url: 'https://www.aliyun.com/product/sls',
    description: '阿里云日志服务',
    tags: ['商业', '云'],
  },
];

export default function LoggingTool() {
  const [tab, setTab] = useState<Tab>('format');
  const [query, setQuery] = useState('');
  const [service, setService] = useState('api');
  const [level, setLevel] = useState('ERROR');
  const [keyword, setKeyword] = useState('timeout');
  const [regex, setRegex] = useState('status=5\\\\d+');

  const filteredLogql = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LOGQL;
    return LOGQL.map((group) => ({
      ...group,
      rows: group.rows.filter((row) => `${row.query} ${row.description} ${row.note ?? ''}`.toLowerCase().includes(q)),
    })).filter((group) => group.rows.length > 0);
  }, [query]);

  const generated = useMemo(() => {
    const logql = `{app="${service}"} | json | level="${level}" |= "${keyword}"`;
    const es = JSON.stringify(
      {
        query: {
          bool: {
            must: [{ match: { level } }, { match: { message: keyword } }],
            filter: [{ range: { '@timestamp': { gte: 'now-1h' } } }],
          },
        },
        aggs: { by_level: { terms: { field: 'level' } } },
      },
      null,
      2,
    );
    const sql = `SELECT timestamp, level, message, trace_id
FROM logs
WHERE service = '${service}'
  AND level = '${level}'
  AND message LIKE '%${keyword}%'
  AND timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 100;`;
    return { logql, es, sql };
  }, [service, level, keyword]);

  return (
    <ToolPanel
      title="日志系统"
      description="需日志采集/检索系统，本页提供查询语言速查、结构化规范与查询构造器"
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
      {tab === 'format' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="日志格式对比">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">格式</th>
                    <th className="px-2 py-1 font-medium">特点</th>
                    <th className="px-2 py-1 font-medium">适用场景</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['JSON Lines', '结构化，易解析', '推荐：采集端直接解析'],
                    ['logfmt', 'key=value，可读性好', 'Grafana Loki 默认'],
                    ['PLAIN', '纯文本', '简单场景，需 grok 解析'],
                    ['ECS', 'Elastic Common Schema', 'Elasticsearch 生态'],
                    ['OTel Logs', 'OpenTelemetry 标准', '云原生可观测'],
                  ].map(([format, feature, scene]) => (
                    <tr key={format} className="border-b">
                      <td className="px-2 py-1 font-mono">{format}</td>
                      <td className="px-2 py-1">{feature}</td>
                      <td className="px-2 py-1 text-muted-foreground">{scene}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="结构化字段规范">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['ts', 'ISO 8601 时间戳', '必填'],
                ['level', '日志级别', '必填'],
                ['msg', '日志消息', '必填'],
                ['service', '服务名', '必填'],
                ['env', '环境', '推荐'],
                ['trace_id', '链路 ID', '推荐'],
                ['span_id', 'Span ID', '推荐'],
                ['request_id', '请求 ID', '推荐'],
                ['user_id', '用户 ID', '可选'],
                ['latency_ms', '延迟毫秒', '推荐'],
                ['error.type', '错误类型', '可选'],
                ['error.stack', '错误堆栈', '可选'],
              ].map(([field, desc, required]) => (
                <div key={field} className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
                  <code className="font-mono text-xs">{field}</code>
                  <span className="text-[11px] text-muted-foreground">{desc}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${required === '必填' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}
                  >
                    {required}
                  </span>
                </div>
              ))}
            </div>
          </Section>
          <Section title="脱敏规范">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">必须脱敏</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  密码、手机号、身份证、邮箱、令牌、Cookie、Authorization、银行卡、精确地理位置
                </p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">可保留</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  用户 ID（哈希后）、IP（匿名化）、请求路径、状态码、耗时
                </p>
              </div>
            </div>
            <CodeBlock
              language="javascript"
              title="脱敏示例"
              code={`function maskSensitive(text) {
  return text
    .replace(/1[3-9]\\d{9}/g, m => m.slice(0, 3) + '****' + m.slice(-4))
    .replace(/\\b\\d{17}[\\dXx]\\b/g, m => m.slice(0, 6) + '********' + m.slice(-4))
    .replace(/(password|token|secret)["']?\\s*[:=]\\s*["']?[^"'s]+/gi, '$1=***');
}`}
            />
          </Section>
        </div>
      )}

      {tab === 'logql' && (
        <div className="flex min-w-0 flex-col gap-3">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索查询或说明…"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          {filteredLogql.map((group) => (
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
          {filteredLogql.length === 0 && <EmptyHint>没有匹配的查询</EmptyHint>}
          <Note tone="warn" title="Label 低基数">
            Loki 的 label 是索引，只放低基数字段（service、env、level）。把 user_id、request_id 放 label
            会导致时间线爆炸。
          </Note>
        </div>
      )}

      {tab === 'es' && (
        <div className="flex min-w-0 flex-col gap-3">
          {ES_DSL.map((group) => (
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
                  </div>
                ))}
              </div>
            </Section>
          ))}
          <Section title="keyword vs text">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">keyword</p>
                <p className="mt-1 text-[11px] text-muted-foreground">不分词，精确匹配。用于聚合、排序、过滤。</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs font-medium">text</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  分词后匹配。用于全文搜索。聚合会触发 fielddata，有内存风险。
                </p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === 'builder' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <TextField label="服务名" value={service} onChange={setService} />
            <Select
              label="日志级别"
              value={level}
              onChange={setLevel}
              options={['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].map((l) => ({ value: l, label: l }))}
            />
            <TextField label="关键字" value={keyword} onChange={setKeyword} />
            <TextField label="正则（可选）" value={regex} onChange={setRegex} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Section title="LogQL">
              <CodeBlock code={generated.logql} language="sql" />
              <Button size="sm" variant="outline" onClick={() => copyText(generated.logql)}>
                复制
              </Button>
            </Section>
            <Section title="Elasticsearch DSL">
              <CodeBlock code={generated.es} language="json" />
              <Button size="sm" variant="outline" onClick={() => copyText(generated.es)}>
                复制
              </Button>
            </Section>
            <Section title="SQL">
              <CodeBlock code={generated.sql} language="sql" />
              <Button size="sm" variant="outline" onClick={() => copyText(generated.sql)}>
                复制
              </Button>
            </Section>
          </div>
        </div>
      )}

      {tab === 'collect' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="采集配置片段">
            <CodeBlock
              language="yaml"
              title="Promtail 配置"
              code={`server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          __path__: /var/log/*.log`}
            />
            <CodeBlock
              language="xml"
              title="logback.xml"
              code={`<configuration>
  <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
      <includeContext>false</includeContext>
      <customFields>{"service":"api","env":"prod"}</customFields>
    </encoder>
  </appender>
  <root level="INFO">
    <appender-ref ref="JSON" />
  </root>
</configuration>`}
            />
          </Section>
          <Section title="排障速查">
            <div className="flex flex-col gap-2">
              {TROUBLESHOOT.map((item) => (
                <div key={item.symptom} className="rounded-lg border p-3">
                  <p className="text-xs font-medium">{item.symptom}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">原因：</span>
                    {item.cause}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    <span className="font-medium text-foreground">解决：</span>
                    {item.fix}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <LinkList items={LINKS} />
      </div>
    </ToolPanel>
  );
}
