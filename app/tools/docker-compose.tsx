import { Boxes, Container, Download, FileCode2, Layers, ListChecks, Network, ScrollText, Ship } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  buildCompose,
  COMPOSE_RUN_HINT,
  type ComposeOptions,
  DOCKER_EXAMPLES,
  type DockerRun,
  parseDockerRun,
} from '../lib/docker-run';
import { downloadText, exportName } from '../lib/file';

type ViewTab = 'compose' | 'parse' | 'help';

const DEFAULT_COMMAND =
  'docker run -d --name api -p 8080:80 \\\n  -e NODE_ENV=production -e PORT=8080 \\\n  -e DATABASE_URL \\\n  -v ./data:/app/data:ro \\\n  --restart unless-stopped \\\n  --memory 512m --cpus 1.5 \\\n  node:22-alpine npm start';

interface ParsedLine {
  /** 稳定的行 id，避免用数组下标当 React key。 */
  id: string;
  text: string;
  run: DockerRun | null;
  error: string | null;
}

function parseLines(input: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    // 支持用续行符把一条命令拆成多行。
    const joined = trimmed.replace(/\\\s*$/, '').trim();
    const parsed = parseDockerRun(joined);
    out.push({ id: `${joined.slice(0, 24)}#${out.length}`, text: joined, run: parsed.run, error: parsed.error });
  }
  return out;
}

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 border-b py-1 last:border-b-0">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={mono ? 'min-w-0 flex-1 break-all font-mono text-[11px]' : 'min-w-0 flex-1 text-[11px]'}>
        {value}
      </span>
    </div>
  );
}

export default function DockerComposeTool() {
  const [input, setInput] = useState(DEFAULT_COMMAND);
  const [tab, setTab] = useState<ViewTab>('compose');
  const [comments, setComments] = useState(true);
  const [includeContainerName, setIncludeContainerName] = useState(false);
  const [mergeAll, setMergeAll] = useState(true);
  const [deps, setDeps] = useState<Record<string, string[]>>({});

  const lines = useMemo(() => parseLines(input), [input]);
  const validRuns = useMemo(() => lines.flatMap((line) => (line.run === null ? [] : [line.run])), [lines]);
  const failed = useMemo(() => lines.filter((line) => line.run === null), [lines]);

  const options: ComposeOptions = useMemo(
    () => ({ comments, includeContainerName, dependsOn: deps, serviceNames: {} }),
    [comments, deps, includeContainerName],
  );

  const built = useMemo(() => {
    if (validRuns.length === 0) return null;
    const runs = mergeAll ? validRuns : [validRuns[0] as DockerRun];
    return buildCompose(runs, options);
  }, [mergeAll, options, validRuns]);

  const yamlText = built?.yaml ?? '';
  const serviceCount = built?.serviceNames.length ?? 0;
  const isMulti = validRuns.length > 1;

  const toggleDep = (service: string, target: string) => {
    setDeps((prev) => {
      const current = prev[service] ?? [];
      return {
        ...prev,
        [service]: current.includes(target) ? current.filter((item) => item !== target) : [...current, target],
      };
    });
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Container className="size-4" />
          Docker Run 转 Compose
        </span>
      }
      description="自带 shell 分词器解析 docker run，生成 Compose Spec v2 的 docker-compose.yml"
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={yamlText === ''}
          onClick={() => downloadText(exportName('docker-compose', 'yml'), yamlText, 'text/yaml;charset=utf-8')}
        >
          <Download className="size-3.5" />
          下载 yml
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as ViewTab)}>
        <TabsList>
          <TabsTrigger value="compose" active={tab === 'compose'}>
            <span className="inline-flex items-center gap-1">
              <FileCode2 className="size-3.5" />
              生成的 compose
            </span>
          </TabsTrigger>
          <TabsTrigger value="parse" active={tab === 'parse'}>
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" />
              解析结果
            </span>
          </TabsTrigger>
          <TabsTrigger value="help" active={tab === 'help'}>
            <span className="inline-flex items-center gap-1">
              <ScrollText className="size-3.5" />
              shell 与 compose 说明
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Section>
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">示例：</span>
            {DOCKER_EXAMPLES.map((example) => (
              <Button
                key={example.name}
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => setInput(example.command)}
              >
                {example.name}
              </Button>
            ))}
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴一条或多条 docker run 命令，每行一条"
            spellCheck={false}
            aria-label="docker run 命令"
            className="min-h-64 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox
              label="合并为一个 compose"
              checked={mergeAll}
              onChange={setMergeAll}
              disabled={!isMulti}
              hint={isMulti ? undefined : '只有一条命令时该项无效'}
            />
            <Checkbox label="注释版（每行中文说明）" checked={comments} onChange={setComments} />
            <Checkbox
              label="写入 container_name"
              checked={includeContainerName}
              onChange={setIncludeContainerName}
              hint="默认不写，固定容器名会让 scale 失效"
            />
          </div>
          {failed.length > 0 && (
            <Note tone="danger" title={`有 ${failed.length} 行未能解析`}>
              <ul className="flex flex-col gap-1">
                {failed.map((line) => (
                  <li key={line.text}>
                    <code className="font-mono">{line.text.slice(0, 60)}</code> —— {line.error}
                  </li>
                ))}
              </ul>
            </Note>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          {tab === 'compose' && (
            <>
              <StatGrid>
                <Stat label="服务数" value={serviceCount} hint={isMulti ? '多服务模式' : '单服务'} />
                <Stat label="命名卷" value={built?.namedVolumes.length ?? 0} />
                <Stat label="自定义网络" value={built?.networks.length ?? 0} />
                <Stat label="解析失败" value={failed.length} tone={failed.length > 0 ? 'danger' : 'success'} />
              </StatGrid>
              <ResultBox
                label="docker-compose.yml"
                value={yamlText}
                error={validRuns.length === 0 ? (failed[0]?.error ?? '请输入 docker run 命令') : null}
                onCopy={() => copyText(yamlText)}
                rows="min-h-72"
                fill
              />
              {(built?.warnings.length ?? 0) > 0 && (
                <Note tone="warn" title="生成时的提示">
                  <ul className="flex flex-col gap-1">
                    {built?.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Note>
              )}
            </>
          )}

          {tab === 'parse' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
              {lines.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  输入命令后这里显示解析出的镜像、端口、卷、环境变量与资源限制
                </p>
              ) : (
                lines.map((line, position) => (
                  <Section
                    key={line.id}
                    title={`第 ${position + 1} 条命令`}
                    description={line.run === null ? undefined : line.run.image}
                  >
                    {line.run === null ? (
                      <Note tone="danger" title="解析失败">
                        {line.error}
                      </Note>
                    ) : (
                      <>
                        <div className="flex flex-col">
                          <Row label="镜像" value={line.run.image} />
                          <Row
                            label="命令"
                            value={line.run.args.length === 0 ? '（使用镜像默认 CMD）' : line.run.args.join(' ')}
                          />
                          <Row label="端口" value={line.run.ports.map((item) => item.raw).join('、') || '无'} />
                          <Row
                            label="卷"
                            value={
                              line.run.volumes.length === 0
                                ? '无'
                                : line.run.volumes
                                    .map(
                                      (mount) =>
                                        `${mount.source === '' ? '匿名卷' : mount.source} → ${mount.target}${
                                          mount.readOnly ? ' (ro)' : ''
                                        }${mount.longSyntax ? ' [long syntax]' : ''}`,
                                    )
                                    .join('、')
                            }
                          />
                          <Row
                            label="环境变量"
                            value={
                              line.run.env.length === 0
                                ? '无'
                                : line.run.env
                                    .map((item) =>
                                      item.value === null ? `${item.key}（继承宿主）` : `${item.key}=${item.value}`,
                                    )
                                    .join('、')
                            }
                          />
                          {line.run.envFile.length > 0 && <Row label="env-file" value={line.run.envFile.join('、')} />}
                          <Row label="网络" value={line.run.network ?? '默认 bridge'} />
                          <Row
                            label="资源限制"
                            value={
                              [
                                line.run.memory === null ? null : `memory=${line.run.memory}`,
                                line.run.cpus === null ? null : `cpus=${line.run.cpus}`,
                                line.run.gpus === null ? null : `gpus=${line.run.gpus}`,
                              ]
                                .filter((item) => item !== null)
                                .join('、') || '无'
                            }
                          />
                          <Row
                            label="健康检查"
                            value={
                              line.run.healthcheck === null || line.run.healthcheck.test === ''
                                ? '无'
                                : line.run.healthcheck.test
                            }
                          />
                          <Row
                            label="其它"
                            value={
                              [
                                line.run.restart === null ? null : `restart=${line.run.restart}`,
                                line.run.privileged ? 'privileged' : null,
                                line.run.user === null ? null : `user=${line.run.user}`,
                                line.run.workdir === null ? null : `workdir=${line.run.workdir}`,
                                line.run.tty && line.run.stdinOpen ? 'tty+stdin（-it）' : null,
                              ]
                                .filter((item) => item !== null)
                                .join('、') || '无'
                            }
                          />
                        </div>
                        {line.run.unknown.length > 0 && (
                          <Note tone="warn" title="未识别的参数">
                            {line.run.unknown.join('、')}（compose 里没有对应字段，已忽略）
                          </Note>
                        )}
                      </>
                    )}
                  </Section>
                ))
              )}
            </div>
          )}

          {tab === 'help' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
              <Section title="粘贴到终端时的 shell 语法" description="浏览器里不做任何展开，原样保留给你在终端执行">
                <ul className="flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    <code>$VAR</code> 与 <code>$&#123;VAR&#125;</code> 不会求值，compose 文件里保留占位符，运行时由
                    compose 从 <code>.env</code> 替换。
                  </li>
                  <li>
                    <code>$(command)</code>、管道、后台符号 <code>&amp;</code> 都原样保留；解析器不执行任何命令。
                  </li>
                  <li>
                    用反斜杠 <code>\</code> 续行时，换行会被当作普通空白处理；一条命令请保持在一行以便识别。
                  </li>
                  <li>
                    单引号内的 <code>$</code> 不展开，双引号内会展开——两者在转成 compose 时都会去掉引号并保持字面值。
                  </li>
                </ul>
              </Section>
              <Section title="docker compose 与 docker-compose 的差异">
                <ul className="flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                  <li>
                    v2 是 Docker CLI 插件，命令名是 <code>docker compose</code>（中间有空格）；v1 是独立二进制{' '}
                    <code>docker-compose</code>。
                  </li>
                  <li>
                    v2 忽略顶层 <code>version</code> 字段；v1 依赖它来判断语法，缺失会用旧默认值。
                  </li>
                  <li>
                    v2 的 <code>depends_on</code> 支持 <code>condition: service_healthy</code>；v1 只表示顺序。
                  </li>
                  <li>
                    v2 新增 <code>profiles</code>、<code>develop</code>、<code>include</code>，v1 不识别。
                  </li>
                  <li>本工具输出的是 Compose Spec v2 格式，不写 version 字段。</li>
                </ul>
              </Section>
              <ResultBox label="常用 compose 命令" value={COMPOSE_RUN_HINT} onCopy={() => copyText(COMPOSE_RUN_HINT)} />
            </div>
          )}
        </div>
      </Section>

      {isMulti && serviceCount > 1 && (
        <Section title="服务依赖确认" description="推断依据不总是可靠，请勾选真实存在的依赖；勾选后会写入 depends_on">
          <div className="flex flex-col gap-2">
            {(built?.serviceNames ?? []).map((service) => {
              const guess = built?.inferred.find((item) => item.service === service);
              return (
                <div key={service} className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="flex items-center gap-1.5 text-xs">
                    <Ship className="size-3.5" />
                    <code className="font-mono">{service}</code>
                    {guess !== undefined && guess.deps.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">未推断到依赖</span>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    {(built?.serviceNames ?? [])
                      .filter((target) => target !== service)
                      .map((target) => {
                        const hint = guess?.deps.find((dep) => dep.service === target);
                        return (
                          <label key={target} className="flex items-center gap-1.5 text-[11px]">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-primary"
                              checked={(deps[service] ?? []).includes(target)}
                              onChange={() => toggleDep(service, target)}
                            />
                            <code className="font-mono">{target}</code>
                            {hint !== undefined && (
                              <span
                                className={
                                  hint.confident ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
                                }
                              >
                                {hint.confident ? `（${hint.reason}）` : `（不确定：${hint.reason}）`}
                              </span>
                            )}
                          </label>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
          <Hint>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3" />
              compose 只保证按 depends_on 顺序启动；需要「等数据库真正可用」时应把健康检查写进 service 再用{' '}
              <code>condition: service_healthy</code>，本工具默认只生成 <code>service_started</code>。
            </span>
          </Hint>
        </Section>
      )}

      <Note tone="info" title="局限说明">
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>本工具只做文本解析与代码生成，不连接 Docker、不执行任何命令、不访问网络。</li>
          <li>
            相对路径挂载（<code>./a:/data</code>）保持相对，不要改成绝对路径——compose 会以 compose
            文件所在目录为基准解析。
          </li>
          <li>
            <code>-P</code>、<code>--volumes-from</code>、<code>--security-opt</code>、<code>--blkio-*</code>{' '}
            等无法静态表达的选项只做提示，不会硬猜。
          </li>
          <li>
            <code>--network container:x</code> 会与 compose 的网络模型冲突，生成结果请用 <code>network_mode</code>{' '}
            手动调整。
          </li>
          <li>
            生成的 YAML 建议执行 <code>docker compose config</code> 校验后再 <code>up</code>。
          </li>
        </ul>
        <span className="mt-1 inline-flex items-center gap-1">
          <Network className="size-3" />
          <Boxes className="size-3" />
          端口绑定 <code>127.0.0.1:8080:80</code> 会原样保留，只监听回环更安全。
        </span>
      </Note>
    </ToolPanel>
  );
}
