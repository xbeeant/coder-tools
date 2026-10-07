import { Boxes, FileCode, LifeBuoy, Network, Search, ShieldCheck, Workflow } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  EmptyHint,
  Hint,
  type LinkItem,
  LinkList,
  Note,
  Section,
  Stat,
  StatGrid,
  ToolPanel,
} from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'concepts' | 'commands' | 'manifest' | 'helm' | 'resources' | 'troubleshoot';

const TABS: { value: Tab; label: string }[] = [
  { value: 'concepts', label: '对象与关系' },
  { value: 'commands', label: 'kubectl 速查' },
  { value: 'manifest', label: '清单生成' },
  { value: 'helm', label: 'Helm' },
  { value: 'resources', label: '资源与探针' },
  { value: 'troubleshoot', label: '排障' },
];

interface ConceptRow {
  object: string;
  purpose: string;
  example: string;
  note: string;
}

const CONCEPTS: ConceptRow[] = [
  {
    object: 'Pod',
    purpose: '最小调度单位，容器组的抽象',
    example: 'kubectl get pods',
    note: 'Pod 是临时的，重建后 IP 会变',
  },
  {
    object: 'Deployment',
    purpose: '无状态应用部署与滚动更新',
    example: 'kubectl rollout status deploy/api',
    note: '必须配 selector，缺省会用 Pod 模板标签',
  },
  {
    object: 'StatefulSet',
    purpose: '有状态服务，Pod 序号稳定',
    example: 'kubectl scale sts/mysql --replicas=3',
    note: '配套需要 Headless Service',
  },
  {
    object: 'DaemonSet',
    purpose: '每个节点跑一份',
    example: 'kubectl get ds',
    note: '日志采集、监控代理、网络插件都用它',
  },
  {
    object: 'Job / CronJob',
    purpose: '一次性 / 周期性任务',
    example: 'kubectl create job backup-$(date +%s)',
    note: 'CronJob 注意并发策略与历史清理',
  },
  {
    object: 'Service',
    purpose: '为一组 Pod 提供稳定访问入口',
    example: 'kubectl get svc -o wide',
    note: 'ClusterIP / NodePort / LoadBalancer / Headless',
  },
  {
    object: 'Ingress / Gateway',
    purpose: '七层流量入口与路由',
    example: 'kubectl describe ingress web',
    note: '新集群优先用 Gateway API',
  },
  {
    object: 'ConfigMap',
    purpose: '非敏感配置',
    example: 'kubectl get cm app-config -o yaml',
    note: '挂载成文件或环境变量两种方式',
  },
  {
    object: 'Secret',
    purpose: '敏感数据',
    example: 'kubectl get secret db -o jsonpath="{.data.password}"',
    note: '默认只是 base64，不是加密，需要开静态加密或用外部密钥管理',
  },
  {
    object: 'PVC / PV',
    purpose: '持久化存储申请与供给',
    example: 'kubectl get pvc',
    note: 'StorageClass 决定实际后端',
  },
  {
    object: 'ServiceAccount',
    purpose: 'Pod 的身份与权限',
    example: 'kubectl create sa api',
    note: '默认 SA 绑的权限比想象中多，注意收紧',
  },
  {
    object: 'ResourceQuota / LimitRange',
    purpose: '命名空间资源上限与默认值',
    example: 'kubectl describe quota',
    note: '多租户必备',
  },
  {
    object: 'NetworkPolicy',
    purpose: '限制命名空间间流量',
    example: 'kubectl get netpol',
    note: '需要 CNI 支持，否则不生效',
  },
  { object: 'HPA', purpose: '按指标自动扩缩容', example: 'kubectl get hpa', note: '基于 CPU、内存或自定义指标' },
  {
    object: 'PDB',
    purpose: '自愿中断时保证最小可用副本',
    example: 'kubectl get pdb',
    note: '节点维护前不建 PDB，滚动更新会被卡住',
  },
  { object: 'Namespace', purpose: '资源隔离与权限边界', example: 'kubectl get ns', note: '不是安全边界，只是软隔离' },
];

// ── kubectl 速查 ────────────────────────────────────────────────────────

interface KubectlRow {
  task: string;
  command: string;
  note: string;
}

const KUBECTL: KubectlRow[] = [
  { task: '看当前上下文', command: 'kubectl config current-context', note: '多集群开发时先确认，别在生产上误操作' },
  { task: '切换上下文', command: 'kubectl config use-context <ctx>', note: '' },
  { task: '列出所有上下文', command: 'kubectl config get-contexts', note: '' },
  { task: '看节点状态', command: 'kubectl get nodes -o wide', note: '看 Ready 与 taints' },
  { task: '看某个命名空间全部对象', command: 'kubectl get all -n <ns>', note: '' },
  { task: '看所有命名空间的对象', command: 'kubectl get all --all-namespaces', note: '排查跨服务问题常用' },
  { task: '看某个对象的详情', command: 'kubectl describe pod <pod>', note: 'Events 段是最有价值的排障信息' },
  { task: '导出对象的 YAML', command: 'kubectl get deploy <name> -o yaml', note: '也是「把线上对象存成基线」的办法' },
  { task: '只看某个字段', command: 'kubectl get svc <svc> -o jsonpath="{.spec.clusterIP}"', note: '' },
  { task: '看日志（指定容器）', command: 'kubectl logs <pod> -c <container> -f --tail=100', note: '' },
  {
    task: '看上一个崩溃容器的日志',
    command: 'kubectl logs <pod> -c <c> --previous',
    note: '排查 CrashLoopBackOff 第一步',
  },
  { task: '进入容器', command: 'kubectl exec -it <pod> -- sh', note: '镜像没装 shell 时可用 nsenter' },
  {
    task: '端口转发到本地',
    command: 'kubectl port-forward svc/<svc> 8080:80 -n <ns>',
    note: '调试本地代码连集群内服务最方便',
  },
  { task: '查看资源用量', command: 'kubectl top pod -n <ns> --containers', note: '需要 metrics-server' },
  {
    task: '临时调试 Pod',
    command: 'kubectl run debug --rm -it --image=nicolaka/netshoot -- bash',
    note: '注意它没有 ServiceAccount 权限',
  },
  { task: '复制文件进容器', command: 'kubectl cp <ns>/<pod>:/tmp/a.json ./a.json', note: '' },
  { task: '看滚动更新状态', command: 'kubectl rollout status deploy/<deploy>', note: '' },
  { task: '回滚滚动更新', command: 'kubectl rollout undo deploy/<deploy>', note: '' },
  {
    task: '重启某个 Deployment',
    command: 'kubectl rollout restart deploy/<deploy>',
    note: '改了 ConfigMap 后比删 Pod 更可控',
  },
  { task: '暂停 / 恢复更新', command: 'kubectl rollout pause|resume deploy/<deploy>', note: '分批变更时很有用' },
  {
    task: '给 Pod 打标签',
    command: 'kubectl label pod <pod> tier=web --overwrite',
    note: '配合 Service selector 改流量',
  },
  {
    task: '按标签删对象',
    command: 'kubectl delete pods -l app=api --grace-period=0',
    note: '先 kubectl get -l app=api 确认范围',
  },
  { task: '从文件创建对象', command: 'kubectl apply -f ./manifests/', note: '目录形式会递归 apply' },
  {
    task: '先 dry-run',
    command: 'kubectl apply -f ./manifests/ --dry-run=server',
    note: 'server 模式会真的请求 API 校验',
  },
  { task: '查看资源字段定义', command: 'kubectl explain deployment.spec.template', note: '比翻文档快' },
  { task: '查 API 资源缩写', command: 'kubectl api-resources', note: '' },
  {
    task: '看事件',
    command: 'kubectl get events --sort-by=.lastTimestamp -n <ns>',
    note: '排查调度失败、镜像拉取失败',
  },
  { task: '看审计与变更', command: 'kubectl get --raw /apis/audit.k8s.io/v1', note: '需要开启审计 API' },
];

// ── 清单生成 ────────────────────────────────────────────────────────────

type ManifestKind = 'deployment' | 'service' | 'ingress' | 'hpa' | 'pdb' | 'job' | 'networkpolicy';

const MANIFEST_KINDS: { value: ManifestKind; label: string }[] = [
  { value: 'deployment', label: 'Deployment' },
  { value: 'service', label: 'Service' },
  { value: 'ingress', label: 'Ingress' },
  { value: 'hpa', label: 'HorizontalPodAutoscaler' },
  { value: 'pdb', label: 'PodDisruptionBudget' },
  { value: 'job', label: 'Job / CronJob' },
  { value: 'networkpolicy', label: 'NetworkPolicy' },
];

interface ManifestOptions {
  kind: ManifestKind;
  name: string;
  namespace: string;
  image: string;
  replicas: number;
  containerPort: number;
  servicePort: number;
  serviceType: string;
  path: string;
  host: string;
  cron: boolean;
  resources: boolean;
  probes: boolean;
  labels: string;
}

const DEFAULT_MANIFEST: ManifestOptions = {
  kind: 'deployment',
  name: 'api',
  namespace: 'default',
  image: 'ghcr.io/example/api:1.0.0',
  replicas: 2,
  containerPort: 8080,
  servicePort: 80,
  serviceType: 'ClusterIP',
  path: '/',
  host: 'api.example.com',
  cron: false,
  resources: true,
  probes: true,
  labels: 'app=api',
};

/** 标签写成 app=api,tier=web 这种一行式，返回缩进到 indent 层的 YAML 片段。 */
function labelBlock(options: ManifestOptions, indent: number): string {
  const raw = options.labels.trim() === '' ? `app=${options.name}` : options.labels;
  const pad = ' '.repeat(indent);
  const pairs = raw
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (pairs.length === 0) return `${pad}app: ${options.name}`;
  return pairs
    .map((pair) => (pair.includes('=') ? `${pad}${pair.replace('=', ': ')}` : `${pad}app: ${pair}`))
    .join('\n');
}

function buildManifest(options: ManifestOptions): string {
  const ns = `  namespace: ${options.namespace}`;

  if (options.kind === 'service') {
    return `apiVersion: v1
kind: Service
metadata:
  name: ${options.name}
${ns}
  labels:
${labelBlock(options, 4)}
spec:
  type: ${options.serviceType}
  selector:
${labelBlock(options, 4)}
  ports:
    - name: http
      port: ${options.servicePort}
      targetPort: ${options.containerPort}
      protocol: TCP
`;
  }

  if (options.kind === 'ingress') {
    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${options.name}
${ns}
  annotations:
    # 证书管理与重写行为由具体 Ingress Controller 决定，先按社区通行写法给一份参考
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ${options.host}
      secretName: ${options.name}-tls
  rules:
    - host: ${options.host}
      http:
        paths:
          - path: ${options.path}
            pathType: Prefix
            backend:
              service:
                name: ${options.name}
                port:
                  number: ${options.servicePort}
`;
  }

  if (options.kind === 'hpa') {
    return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${options.name}
${ns}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${options.name}
  minReplicas: ${Math.max(1, options.replicas)}
  maxReplicas: ${Math.max(2, options.replicas * 4)}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    # 内存型负载（缓存、队列消费者）通常比 CPU 更准
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      # 缩容慢一点，避免流量抖动时来回扩缩
      stabilizationWindowSeconds: 300
`;
  }

  if (options.kind === 'pdb') {
    return `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${options.name}
${ns}
spec:
  minAvailable: ${Math.max(1, Math.ceil(options.replicas / 2))}
  selector:
    matchLabels:
${labelBlock(options, 6)}
`;
  }

  if (options.kind === 'networkpolicy') {
    return `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${options.name}
${ns}
spec:
  podSelector:
    matchLabels:
${labelBlock(options, 6)}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # 默认拒绝后放行必要来源
    - from:
        - podSelector:
            matchLabels:
              app: gateway
      ports:
        - protocol: TCP
          port: ${options.containerPort}
  egress:
    # DNS 必须放行，否则名字解析会失败
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    - ports:
        - protocol: TCP
          port: 443
`;
  }

  if (options.kind === 'job') {
    if (!options.cron) {
      return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${options.name}
${ns}
spec:
  backoffLimit: 3
  # 超过 10 分钟还在跑就杀掉，避免僵尸任务堆积
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels:
${labelBlock(options, 8)}
    spec:
      restartPolicy: Never
      containers:
        - name: task
          image: ${options.image}
          env:
            - name: TZ
              value: Asia/Shanghai
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: '1'
              memory: 512Mi
`;
    }
    return `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${options.name}
${ns}
spec:
  schedule: '0 3 * * *'
  timeZone: Asia/Shanghai
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        metadata:
          labels:
${labelBlock(options, 12)}
        spec:
          restartPolicy: Never
          containers:
            - name: task
              image: ${options.image}
              resources:
                requests:
                  cpu: 100m
                  memory: 128Mi
                limits:
                  cpu: '1'
                  memory: 512Mi
`;
  }

  const probes = options.probes
    ? `          livenessProbe:
            httpGet:
              path: /healthz
              port: ${options.containerPort}
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /readyz
              port: ${options.containerPort}
            initialDelaySeconds: 5
            periodSeconds: 5
          startupProbe:
            # 启动慢的应用用它兜住，否则 liveness 会误杀
            httpGet:
              path: /healthz
              port: ${options.containerPort}
            failureThreshold: 30
            periodSeconds: 5
`
    : '';
  const res = options.resources
    ? `          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: '1'
              memory: 512Mi
`
    : '';

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${options.name}
${ns}
  labels:
${labelBlock(options, 4)}
spec:
  replicas: ${options.replicas}
  selector:
    matchLabels:
${labelBlock(options, 6)}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
${labelBlock(options, 8)}
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: ${options.image}
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: ${options.containerPort}
          env:
            - name: TZ
              value: Asia/Shanghai
          envFrom:
            - configMapRef:
                name: ${options.name}-config
            # Secret 用 secretKeyRef 精确引用，别把整个 Secret 塞进来
            - secretRef:
                name: ${options.name}-secret
${res}${probes}          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
`;
}

// ── Helm ────────────────────────────────────────────────────────────────

interface HelmRow {
  task: string;
  command: string;
  note: string;
}

const HELM: HelmRow[] = [
  { task: '搜索仓库', command: 'helm search repo <keyword>', note: '' },
  {
    task: '添加仓库',
    command: 'helm repo add bitnami https://charts.bitnami.com/bitnami',
    note: '加完记得 helm repo update',
  },
  { task: '更新所有仓库索引', command: 'helm repo update', note: '' },
  { task: '查看可配置项', command: 'helm show values <chart>', note: 'values.yaml 是最需要读的文件' },
  {
    task: '本地渲染模板',
    command: 'helm template <release> <chart> -f values.yaml',
    note: '不装集群就能看最终 YAML，最常用',
  },
  { task: '带调试信息渲染', command: 'helm template <release> <chart> --debug', note: '' },
  { task: '校验 Chart', command: 'helm lint ./mychart', note: '提交前跑一下' },
  { task: '创建 Chart 骨架', command: 'helm create mychart', note: '' },
  { task: '本地依赖包', command: 'helm dependency build ./mychart', note: '' },
  { task: '试安装', command: 'helm install <release> <chart> --dry-run', note: '' },
  { task: '安装到指定命名空间', command: 'helm install -n <ns> --create-namespace <release> <chart>', note: '' },
  {
    task: '安装并立即删除',
    command: 'helm install <release> <chart> --atomic --timeout 5m',
    note: '失败自动回滚，生产建议默认加',
  },
  { task: '升级', command: 'helm upgrade <release> <chart> -f values.yaml', note: '' },
  { task: '回滚到上一版本', command: 'helm rollback <release> 1', note: '历史版本号看 helm history' },
  { task: '看历史', command: 'helm history <release>', note: '' },
  { task: '从回滚版本恢复', command: 'helm rollback <release> <revision>', note: '' },
  { task: '查看已发布值', command: 'helm get values <release> -a', note: '排查线上到底跑了什么配置' },
  { task: '查看清单', command: 'helm get manifest <release>', note: '' },
  { task: '查看全部状态', command: 'helm get all <release>', note: '' },
  { task: '卸载', command: 'helm uninstall <release>', note: '会删掉 release 的所有资源' },
  { task: '导出 Chart', command: 'helm pull <repo>/<chart> --version <v> --untar', note: '' },
  { task: 'CRD 型模板需装 CRD', command: 'helm install <crd-chart> crds/', note: 'CRD 目录下的模板不会随普通安装部署' },
];

const HELM_TEMPLATE = `{{- /* 常用模板函数速查 */ -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{ include "mychart.fullname" . }}
{{- /* range / if / with */ -}}
{{- range .Values.ingress.hosts }}
- host: {{ .host | quote }}
{{- end }}
{{- if .Values.resources }}
resources:
{{ toYaml .Values.resources | indent 12 }}
{{- end }}
{{- /* required：缺值直接失败，比静默生成坏配置好 */ -}}
{{ required "必须设置 image.repository" .Values.image.repository }}
{{- /* lookup：只在集群里能查到，安装时不返回 */ -}}
{{- $existing := lookup "v1" "Service" .Release.Namespace (include "mychart.fullname" .) }}
{{- /* 常见错误：-}} 吃掉换行后忘写 {{ end }} */ -}}
`;

// ── 资源与探针 ──────────────────────────────────────────────────────────

interface ResourceRow {
  item: string;
  when: string;
  note: string;
}

const RESOURCES: ResourceRow[] = [
  { item: 'CPU request', when: '必填', note: '调度与扩缩容的依据，填不准会导致节点资源被浪费或 Pod Pending' },
  { item: 'CPU limit', when: '按需', note: '不设 limit 能避免被 CFS 限流导致的 p99 抖动，但会抢邻居资源' },
  { item: 'memory request', when: '必填', note: '' },
  { item: 'memory limit', when: '建议填', note: '超了直接 OOMKilled，Java 类应用要留足堆外空间' },
  { item: 'livenessProbe', when: '必填', note: '判断进程是否需要重启，配错会导致无限重启' },
  { item: 'readinessProbe', when: '必填', note: '决定是否接流量，配错会导致流量打到没准备好的实例' },
  { item: 'startupProbe', when: '启动慢时', note: '替代调大 liveness initialDelaySeconds 的更好做法' },
  { item: 'PodDisruptionBudget', when: '多副本', note: '维护前不建 PDB，节点排空会被卡住' },
  { item: 'topologySpreadConstraints', when: '高可用', note: '把副本摊到不同节点/可用区，单机故障不至于全挂' },
  { item: 'anti-affinity', when: '高可用', note: '同 Deployment 的副本尽量不落在同一节点' },
  { item: 'terminationGracePeriodSeconds', when: '有长连接', note: '要大于应用的最长请求处理时间，否则会被 SIGKILL' },
  { item: 'preStop hook', when: '优雅下线', note: '先 sleep 几秒让流量摘除，再开始关服务' },
  { item: 'requests/limits 比例', when: '规划容量', note: 'request 是基准，limit 是上限，两者差距过大会造成调度浪费' },
  { item: 'HPA + metrics-server', when: '自动扩缩', note: '没装 metrics-server 时 HPA 拿不到指标，会一直 Unknown' },
  { item: 'Cluster autoscaler', when: '自动扩容节点', note: '注意扩容有分钟级延迟，突发流量要用 HPA 而非 CA' },
];

const TROUBLESHOOTS: { q: string; a: string }[] = [
  {
    q: 'Pod 一直 Pending',
    a: '调度器没找到合适节点。kubectl describe pod 看 Events：可能是资源不够、节点选择器不匹配、污点没容忍、PVC 绑不上。',
  },
  {
    q: 'CrashLoopBackOff',
    a: '容器反复启动失败。顺序是：kubectl logs --previous 看崩溃前日志 → 检查配置与依赖 → 检查探针是否太严格。',
  },
  {
    q: 'ImagePullBackOff',
    a: '拉不到镜像。用 kubectl get pod -o yaml 看真实镜像名与拉取凭据；私有仓库要配 imagePullSecrets，镜像 tag 也要确认存在。',
  },
  {
    q: '服务不通但 Pod 正常',
    a: '依次查：Service selector 是否与 Pod labels 匹配 → Endpoints 是否有后端 → NetworkPolicy 是否拦截 → Ingress 规则是否命中。',
  },
  {
    q: '改了 ConfigMap 但没生效',
    a: 'env 方式注入的环境变量不会热更新；volume 挂载会自动刷新（最长约 1 分钟），但程序要支持重载。最稳的做法是 rollout restart。',
  },
  {
    q: '滚动更新卡住',
    a: '多半是 maxUnavailable=0 但没有足够资源起新 Pod，或者 PDB 阻止驱逐。kubectl rollout status 看进度，describe 看具体事件。',
  },
  {
    q: '节点 NotReady',
    a: 'kubelet 失联。看节点上容器运行时是否正常；虚拟机类环境常见原因是磁盘满或时钟漂移。',
  },
  {
    q: 'Helm 升级后资源没变化',
    a: '可能值放在了错误的层级。helm get values <release> -a 看实际生效值；模板里有条件渲染时尤其容易漏。',
  },
  {
    q: '怎么快速确认集群里的实际配置',
    a: 'kubectl get <kind> <name> -o yaml 是唯一可靠的真相来源。GitOps 仓库里的清单可能和线上已经 drift。',
  },
  {
    q: '生产集群该不该直接 kubectl edit',
    a: '临时排查可以，但改动不会被 GitOps 同步回来，下次 reconcile 就被覆盖。应急完要立刻把改动落到仓库。',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'Kubernetes 中文文档',
    url: 'https://kubernetes.io/zh-cn/docs/home/',
    description: '官方中文文档，概念与 API 最权威',
    tags: ['K8s'],
  },
  {
    name: 'kubectl 速查表',
    url: 'https://kubernetes.io/zh-cn/docs/reference/kubectl/quick-reference/',
    description: '官方一页纸命令表',
    tags: ['kubectl'],
  },
  {
    name: 'Helm 官方文档',
    url: 'https://helm.sh/docs/',
    description: 'Chart 结构、模板函数、发布管理',
    tags: ['Helm'],
  },
  { name: 'Helm Hub', url: 'https://artifacthub.io/', description: '社区 Chart 搜索，注意看维护状态', tags: ['Helm'] },
  { name: 'Gateway API', url: 'https://gateway-api.sigs.k8s.io/', description: 'Ingress 的下一代标准', tags: ['流量'] },
  {
    name: 'Kustomize',
    url: 'https://kubectl.docs.kubernetes.io/references/kustomize/',
    description: '不用模板的清单管理方式',
    tags: ['配置'],
  },
  {
    name: 'kube-score',
    url: 'https://github.com/zegl/kube-score',
    description: '静态检查清单，CI 里很有用',
    tags: ['检查'],
  },
  { name: 'Polaris', url: 'https://polaris.docs.fairwinds.com/', description: 'K8s 配置最佳实践检查', tags: ['检查'] },
  { name: 'Datree', url: 'https://www.datree.io/', description: '策略即代码的集群校验', tags: ['策略'] },
  {
    name: 'metrics-server',
    url: 'https://github.com/kubernetes-sigs/metrics-server',
    description: 'kubectl top 依赖的组件',
    tags: ['指标'],
  },
  {
    name: 'Prometheus Operator',
    url: 'https://prometheus-operator.dev/',
    description: 'K8s 里部署 Prometheus 的常见方式',
    tags: ['监控'],
  },
  {
    name: 'Kubernetes 状态与事件排错',
    url: 'https://kubernetes.io/docs/concepts/cluster-administration/system-monitoring/',
    description: '官方给的排障思路',
    tags: ['排障'],
  },
];

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-56">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 pl-7 text-xs"
        aria-label={placeholder}
      />
    </div>
  );
}

export default function ContainerOrchestration() {
  const [tab, setTab] = useState<Tab>('concepts');
  const [query, setQuery] = useState('');
  const [manifest, setManifest] = useState<ManifestOptions>(DEFAULT_MANIFEST);

  const filteredConcepts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return CONCEPTS;
    return CONCEPTS.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredKubectl = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return KUBECTL;
    return KUBECTL.filter((row) => `${row.task} ${row.command} ${row.note}`.toLowerCase().includes(q));
  }, [query]);

  const filteredHelm = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return HELM;
    return HELM.filter((row) => `${row.task} ${row.command} ${row.note}`.toLowerCase().includes(q));
  }, [query]);

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return RESOURCES;
    return RESOURCES.filter((row) => Object.values(row).join(' ').toLowerCase().includes(q));
  }, [query]);

  const filteredTrouble = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TROUBLESHOOTS;
    return TROUBLESHOOTS.filter((row) => `${row.q} ${row.a}`.toLowerCase().includes(q));
  }, [query]);

  const manifestText = useMemo(() => buildManifest(manifest), [manifest]);
  const manifestLines = useMemo(() => manifestText.split('\n').length, [manifestText]);

  return (
    <ToolPanel
      title="Kubernetes 编排工具"
      description={`${CONCEPTS.length} 个核心对象、${KUBECTL.length} 条 kubectl 命令、7 类清单生成、${HELM.length} 条 Helm 命令`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索对象或命令" />}
    >
      <Note tone="warn" title="定位说明">
        浏览器扩展<b>无法连接你的集群</b>：没有 kubeconfig、无法调API server、也无法执行 kubectl。
        本工具提供概念梳理、命令速查、清单生成与排障思路。 改集群请用 kubectl / Helm / Argo CD
        等真实工具，并先在测试环境验证。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'concepts' && <Boxes className="size-3.5" />}
                {item.value === 'commands' && <Workflow className="size-3.5" />}
                {item.value === 'manifest' && <FileCode className="size-3.5" />}
                {item.value === 'helm' && <Network className="size-3.5" />}
                {item.value === 'resources' && <ShieldCheck className="size-3.5" />}
                {item.value === 'troubleshoot' && <LifeBuoy className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'concepts' && (
        <Section title="核心对象与关系" description="先理清「对象 + selector + 期望状态」，剩下的都是细节">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-medium">对象</th>
                  <th className="py-1.5 pr-2 font-medium">作用</th>
                  <th className="py-1.5 pr-2 font-medium">常用命令</th>
                  <th className="py-1.5 pr-2 font-medium">要点</th>
                </tr>
              </thead>
              <tbody>
                {filteredConcepts.map((row) => (
                  <tr key={row.object} className="border-b last:border-b-0 align-top">
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.object}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.purpose}</td>
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">{row.example}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint>
            用 Deployment + Service + Ingress 这三件套就能覆盖大多数无状态服务；先保证这三者 label
            对得上，再考虑加探针、HPA、PDB。
          </Hint>
        </Section>
      )}

      {tab === 'commands' && (
        <Section title="kubectl 速查" description="排障时最常用的是 describe、logs --previous、get -o yaml">
          {filteredKubectl.length === 0 ? (
            <EmptyHint>没有匹配的命令</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filteredKubectl.map((row) => (
                <li key={row.task} className="rounded-md border px-3 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium">{row.task}</span>
                    <code className="font-mono text-[11px] text-muted-foreground">{row.command}</code>
                  </div>
                  {row.note !== '' && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {tab === 'manifest' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项" description="生成后先用 --dry-run=server 校验再 apply">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="对象类型"
                value={manifest.kind}
                onChange={(kind) => setManifest({ ...manifest, kind: kind as ManifestKind })}
                options={MANIFEST_KINDS}
              />
              <TextField label="名称" value={manifest.name} onChange={(name) => setManifest({ ...manifest, name })} />
              <TextField
                label="命名空间"
                value={manifest.namespace}
                onChange={(namespace) => setManifest({ ...manifest, namespace })}
              />
              {(manifest.kind === 'deployment' ||
                manifest.kind === 'job' ||
                manifest.kind === 'hpa' ||
                manifest.kind === 'pdb') && (
                <>
                  <TextField
                    label="副本数"
                    type="number"
                    value={String(manifest.replicas)}
                    onChange={(value) => setManifest({ ...manifest, replicas: Math.max(1, Number(value) || 1) })}
                  />
                  <TextField
                    label="标签（selector 与 labels 共用）"
                    value={manifest.labels}
                    onChange={(labels) => setManifest({ ...manifest, labels })}
                    placeholder="app=api"
                  />
                </>
              )}
              {manifest.kind !== 'ingress' && manifest.kind !== 'networkpolicy' && manifest.kind !== 'pdb' && (
                <TextField
                  label="镜像"
                  value={manifest.image}
                  onChange={(image) => setManifest({ ...manifest, image })}
                />
              )}
              {(manifest.kind === 'deployment' ||
                manifest.kind === 'service' ||
                manifest.kind === 'ingress' ||
                manifest.kind === 'networkpolicy') && (
                <TextField
                  label="容器端口"
                  type="number"
                  value={String(manifest.containerPort)}
                  onChange={(value) => setManifest({ ...manifest, containerPort: Number(value) || 8080 })}
                />
              )}
              {(manifest.kind === 'service' || manifest.kind === 'ingress') && (
                <TextField
                  label="Service 端口"
                  type="number"
                  value={String(manifest.servicePort)}
                  onChange={(value) => setManifest({ ...manifest, servicePort: Number(value) || 80 })}
                />
              )}
              {manifest.kind === 'service' && (
                <Select
                  label="Service 类型"
                  value={manifest.serviceType}
                  onChange={(serviceType) => setManifest({ ...manifest, serviceType })}
                  options={[
                    { value: 'ClusterIP', label: 'ClusterIP（默认）' },
                    { value: 'NodePort', label: 'NodePort' },
                    { value: 'LoadBalancer', label: 'LoadBalancer' },
                  ]}
                />
              )}
              {manifest.kind === 'ingress' && (
                <>
                  <TextField
                    label="域名"
                    value={manifest.host}
                    onChange={(host) => setManifest({ ...manifest, host })}
                  />
                  <TextField
                    label="路径前缀"
                    value={manifest.path}
                    onChange={(path) => setManifest({ ...manifest, path })}
                  />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {manifest.kind === 'deployment' && (
                <>
                  <Checkbox
                    label="资源 requests / limits"
                    checked={manifest.resources}
                    onChange={(resources) => setManifest({ ...manifest, resources })}
                  />
                  <Checkbox
                    label="三种探针"
                    checked={manifest.probes}
                    onChange={(probes) => setManifest({ ...manifest, probes })}
                    hint="liveness / readiness / startup"
                  />
                </>
              )}
              {manifest.kind === 'job' && (
                <Checkbox
                  label="生成 CronJob（关掉则是一次性 Job）"
                  checked={manifest.cron}
                  onChange={(cron) => setManifest({ ...manifest, cron })}
                />
              )}
            </div>
          </Section>
          <StatGrid>
            <Stat
              label="对象类型"
              value={MANIFEST_KINDS.find((item) => item.value === manifest.kind)?.label ?? manifest.kind}
            />
            <Stat label="行数" value={manifestLines} />
            <Stat label="命名空间" value={manifest.namespace} />
            <Stat label="标签" value={labelBlock(manifest, 0).replace(/\n/g, ' ').trim()} tone="info" />
          </StatGrid>
          <Section
            title="清单"
            description="刻意省略了 ConfigMap 与 Secret 对象本体，它们由环境或密钥管理系统提供"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(manifestText)} aria-label="复制清单">
                复制
              </Button>
            }
          >
            <CodeBlock
              code={manifestText}
              language="yaml"
              title={`${manifest.name}.yaml`}
              filename={`${manifest.name}.yaml`}
              lineNumbers
              maxLines={60}
            />
          </Section>
          <Section
            title="下载"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName(manifest.name, 'yaml'), manifestText, 'text/yaml;charset=utf-8')}
              >
                下载 YAML
              </Button>
            }
          >
            <Hint>下载后建议补齐 ConfigMap / Secret 与 NetworkPolicy，并用 kube-score 或 Polaris 做一次静态检查。</Hint>
          </Section>
        </div>
      )}

      {tab === 'helm' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Helm 命令速查" description="helm template 不装集群就能看最终 YAML，是最该养成习惯的命令">
            {filteredHelm.length === 0 ? (
              <EmptyHint>没有匹配的命令</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {filteredHelm.map((row) => (
                  <li key={row.task} className="rounded-md border px-3 py-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-medium">{row.task}</span>
                      <code className="font-mono text-[11px] text-muted-foreground">{row.command}</code>
                    </div>
                    {row.note !== '' && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="模板函数速查" description="values.yaml 到 YAML 的常用写法">
            <CodeBlock
              code={HELM_TEMPLATE}
              language="shell"
              title="templates/_helpers.tpl"
              filename="_helpers.tpl"
              maxLines={25}
            />
          </Section>
          <Note tone="warn" title="模板里的常见坑">
            <ul className="list-disc pl-4">
              <li>
                <code>{'{{- x -}}'}</code> 的减号会吃掉换行，容易把两行粘成一行。
              </li>
              <li>
                忘记写 <code>{'{{ end }}'}</code> 会直接渲染失败，这类错误用 helm lint 就能抓到。
              </li>
              <li>
                用 <code>default</code> 时顺序写反会得到意外结果：<code>{'x | default y'}</code> 而不是{' '}
                <code>{'default y x'}</code>。
              </li>
              <li>
                indentation 用 <code>nindent</code> 还是 <code>indent</code> 决定要不要额外换行，写错就是 YAML
                语法错误。
              </li>
            </ul>
          </Note>
        </div>
      )}

      {tab === 'resources' && (
        <Section
          title="资源与探针"
          description="这一块配好了，能避免大部分「服务莫名重启」和「流量打到没准备好的实例」"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-medium">配置项</th>
                  <th className="py-1.5 pr-2 font-medium">什么时候必须</th>
                  <th className="py-1.5 pr-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {filteredResources.map((row) => (
                  <tr key={row.item} className="border-b last:border-b-0 align-top">
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.item}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.when}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note tone="info" title="三种探针的分工">
            startup 决定「还在启动就别急着重启」，liveness 决定「要不要重启」，readiness 决定「要不要接流量」。 把
            liveness 当 readiness 用，会在依赖抖动时引发不必要的重启。
          </Note>
        </Section>
      )}

      {tab === 'troubleshoot' && (
        <Section title="排障路径" description="从症状反推，先看 Events 再看日志，最后才看配置">
          {filteredTrouble.length === 0 ? (
            <EmptyHint>没有匹配的问题</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredTrouble.map((row) => (
                <li key={row.q} className="rounded-md border px-3 py-2">
                  <p className="text-xs font-medium">{row.q}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.a}</p>
                </li>
              ))}
            </ul>
          )}
          <Note tone="warn" title="排查顺序建议">
            <ol className="list-decimal pl-4">
              <li>kubectl describe 看 Events，多数调度与拉镜像问题在这里就有答案。</li>
              <li>kubectl logs --previous 看崩溃前最后一个日志。</li>
              <li>kubectl get -o yaml 确认线上真实配置，别只信 GitOps 仓库。</li>
              <li>kubectl port-forward 绕开 Ingress 与 Service，直接验证应用本身。</li>
              <li>再考虑集群层面：节点状态、CNI、存储、网络策略。</li>
            </ol>
          </Note>
        </Section>
      )}

      <Section title="官方文档与工具">
        <LinkList items={LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}
