import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FileCode2,
  FilePlus2,
  Files,
  Globe,
  GripVertical,
  Info,
  Layers,
  ListChecks,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Field, Select } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../components/ui/utils';
import { downloadText, pickFiles, readAsText } from '../lib/file';
import {
  activeRecords,
  appendRecords,
  buildDeployScript,
  COMMON_ADDRESSES,
  collectDomains,
  compareProfile,
  createProfile,
  type DiffKind,
  deploySteps,
  diffHosts,
  HOSTS_PATH,
  type HostsIssue,
  type HostsProfile,
  ISSUE_LABELS,
  PLATFORM_LABELS,
  type Platform,
  PROFILE_TEMPLATES,
  scriptFilename,
  summarizeContent,
  toHostsFile,
  validateHosts,
} from '../lib/hosts';

type MainTab = 'edit' | 'diff' | 'deploy' | 'reference';

const STORAGE_KEY = 'coder-tools:hosts';

const PLATFORM_LIST: { value: Platform; label: string }[] = [
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows' },
];

function loadProfiles(): HostsProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is HostsProfile =>
        item !== null && typeof item === 'object' && typeof (item as HostsProfile).name === 'string',
    );
  } catch {
    return [];
  }
}

function useProfileStorage(profiles: HostsProfile[]) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // storage 不可用时静默失败，方案内容仍可导出
    }
  }, [profiles]);
}

function createDefaultProfiles(): HostsProfile[] {
  return PROFILE_TEMPLATES.map((tpl) => createProfile({ name: tpl.name, note: tpl.description, content: tpl.content }));
}

export default function HostsSwitch() {
  const [profiles, setProfiles] = useState<HostsProfile[]>(() => {
    const stored = loadProfiles();
    return stored.length > 0 ? stored : createDefaultProfiles();
  });
  useProfileStorage(profiles);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>('edit');
  const [draft, setDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [platform, setPlatform] = useState<Platform>('macos');
  const [compareId, setCompareId] = useState<string>('');
  const [domainQuery, setDomainQuery] = useState('');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ name: string; content: string } | null>(null);

  const active = useMemo(() => {
    const found = profiles.find((profile) => profile.id === activeId);
    return found ?? profiles[0] ?? null;
  }, [activeId, profiles]);

  useEffect(() => {
    setDraft(active?.content ?? '');
    setNoteDraft(active?.note ?? '');
    setNameDraft(active?.name ?? '');
  }, [active]);

  const dirty = useMemo(() => {
    if (active === null) return false;
    return draft !== active.content || noteDraft !== active.note || nameDraft !== active.name;
  }, [active, draft, nameDraft, noteDraft]);

  const commit = useCallback(() => {
    if (active === null || !dirty) return;
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === active.id
          ? {
              ...profile,
              name: nameDraft.trim() === '' ? '未命名方案' : nameDraft.trim(),
              note: noteDraft,
              content: draft,
              updatedAt: new Date().toISOString(),
            }
          : profile,
      ),
    );
  }, [active, dirty, draft, nameDraft, noteDraft]);

  const summary = useMemo(() => summarizeContent(draft), [draft]);

  const steps = useMemo(() => deploySteps(platform), [platform]);
  const hostsFile = useMemo(() => toHostsFile(draft, active?.name ?? '未命名方案'), [active?.name, draft]);
  const script = useMemo(
    () => (active === null ? '' : buildDeployScript(platform, draft, active.name)),
    [active, draft, platform],
  );

  const domains = useMemo(() => collectDomains(profiles), [profiles]);
  const filteredDomains = useMemo(() => {
    const key = domainQuery.trim().toLowerCase();
    return key === '' ? domains : domains.filter((item) => item.domain.includes(key));
  }, [domainQuery, domains]);

  const compareTarget = useMemo(
    () => profiles.find((profile) => profile.id === compareId && profile.id !== active?.id) ?? null,
    [active?.id, compareId, profiles],
  );
  const diffRows = useMemo(() => {
    if (active === null || compareTarget === null) return [];
    return diffHosts(active.content, compareTarget.content);
  }, [active, compareTarget]);
  /** 导入预览：解析统计 + 与当前方案的差异，写入前先看一遍。 */
  const importPreview = useMemo(() => {
    if (pendingImport === null) return null;
    return {
      summary: summarizeContent(pendingImport.content),
      issues: validateHosts(pendingImport.content),
      compare:
        active === null
          ? compareProfile('', pendingImport.content)
          : compareProfile(active.content, pendingImport.content),
      rows: active === null ? [] : diffHosts(active.content, pendingImport.content),
    };
  }, [pendingImport, active]);

  const diffStat = useMemo(
    () => compareProfile(compareTarget?.content ?? '', compareTarget === null ? '' : (active?.content ?? '')),
    [active?.content, compareTarget],
  );
  const diffChanged = useMemo(() => diffRows.filter((row) => row.kind !== 'same'), [diffRows]);

  const createProfileAction = useCallback(() => {
    const profile = createProfile({ content: '# 新方案\n127.0.0.1\tlocalhost\n' });
    setProfiles((prev) => [...prev, profile]);
    setActiveId(profile.id);
  }, []);

  const duplicate = useCallback(
    (profile: HostsProfile) => {
      const copy = createProfile({
        name: `${profile.name} 副本`,
        note: profile.note,
        content: profile.content,
      });
      const index = profiles.findIndex((item) => item.id === profile.id);
      setProfiles((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
      setActiveId(copy.id);
    },
    [profiles],
  );

  /** 拖动排序：记录被拖项与悬停位置，松手时按目标位置重排。 */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const reorder = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setProfiles((prev) => {
      const from = prev.findIndex((item) => item.id === sourceId);
      const to = prev.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      if (item === undefined) return prev;
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const move = useCallback(
    (profile: HostsProfile, direction: -1 | 1) => {
      const index = profiles.findIndex((item) => item.id === profile.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= profiles.length) return;
      setProfiles((prev) => {
        const next = prev.slice();
        const [item] = next.splice(index, 1);
        if (item === undefined) return prev;
        next.splice(target, 0, item);
        return next;
      });
    },
    [profiles],
  );

  const remove = useCallback(
    (profile: HostsProfile) => {
      if (!window.confirm(`确定删除方案「${profile.name}」吗？`)) return;
      const next = profiles.filter((item) => item.id !== profile.id);
      setProfiles(next);
      if (activeId === profile.id) setActiveId(next[0]?.id ?? null);
    },
    [activeId, profiles],
  );

  const handleImport = useCallback(async () => {
    try {
      const files = await pickFiles({ accept: '.txt,.hosts,hosts,text/plain', multiple: false });
      const file = files[0];
      if (file === undefined) return;
      const text = await readAsText(file);
      const stat = summarizeContent(text);
      setPendingImport({ name: file.name, content: text });
      setImportNote(
        `已解析 ${file.name}：共 ${stat.lines} 行、${stat.records} 条记录、${stat.comments} 行注释、${stat.domains} 个域名，问题 ${stat.issues.length} 处。`,
      );
    } catch (error) {
      setImportNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const applyImport = useCallback(
    (asNew: boolean) => {
      if (pendingImport === null) return;
      if (asNew) {
        const profile = createProfile({
          name: pendingImport.name.replace(/\.(txt|hosts)$/i, '') || '导入方案',
          content: pendingImport.content,
        });
        setProfiles((prev) => [...prev, profile]);
        setActiveId(profile.id);
        setImportNote(`已作为新方案导入（${pendingImport.name}）。`);
      } else if (active !== null) {
        const before = compareProfile(active.content, pendingImport.content);
        if (
          !window.confirm(
            `用导入内容覆盖「${active.name}」？新增 ${before.added} 行、删除 ${before.removed} 行、修改 ${before.changed} 行。`,
          )
        ) {
          return;
        }
        setProfiles((prev) =>
          prev.map((profile) =>
            profile.id === active.id
              ? { ...profile, content: pendingImport.content, updatedAt: new Date().toISOString() }
              : profile,
          ),
        );
        setImportNote(`已覆盖当前方案（新增 ${before.added}、删除 ${before.removed}、修改 ${before.changed} 行）。`);
      }
      setPendingImport(null);
    },
    [active, pendingImport],
  );

  const issueTone = useCallback((kind: HostsIssue['kind']) => {
    if (kind === 'bad-ip' || kind === 'bad-domain') return 'text-destructive';
    if (kind === 'dup-ip' || kind === 'dup-domain') return 'text-amber-600 dark:text-amber-400';
    return 'text-muted-foreground';
  }, []);

  const renderLines = useCallback(
    (text: string, withIssues: boolean) => {
      const stat = withIssues ? summarizeContent(text) : null;
      const map = new Map<number, HostsIssue[]>();
      for (const issue of stat?.issues ?? []) {
        const list = map.get(issue.line);
        if (list === undefined) map.set(issue.line, [issue]);
        else list.push(issue);
      }
      // 相同内容的多行需要唯一键，用出现次数而不是数组下标。
      const seen = new Map<string, number>();
      return text.split('\n').map((raw, index) => {
        const occurrence = seen.get(raw) ?? 0;
        seen.set(raw, occurrence + 1);
        const lineIssues = map.get(index) ?? [];
        const tone =
          lineIssues.length === 0 ? 'text-foreground' : (issueTone(lineIssues[0]?.kind ?? 'trailing-space') ?? '');
        return (
          <div key={`${raw}-${occurrence}`} className="flex gap-2">
            <span className="w-9 shrink-0 select-none text-right text-[10px] text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
              {raw === '' ? ' ' : raw}
              {lineIssues.length > 0 && (
                <span className="ml-2 text-[10px]">
                  {lineIssues.map((issue) => (
                    <span key={`${issue.kind}-${issue.line}`} className={cn('mr-2', issueTone(issue.kind))}>
                      [{ISSUE_LABELS[issue.kind]}] {issue.message}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className={cn('shrink-0 text-[10px]', tone)}>{lineIssues.length > 0 ? '!' : ''}</span>
          </div>
        );
      });
    },
    [issueTone],
  );

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Settings2 className="size-4" />
          Hosts 切换
        </span>
      }
      description="多套 hosts 方案管理、行级校验、方案对比与一键部署脚本生成"
      actions={
        <>
          <Button size="sm" onClick={createProfileAction}>
            <FilePlus2 className="size-3.5" />
            新建方案
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleImport()}>
            <Upload className="size-3.5" />
            导入 hosts 文件
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadText('hosts.txt', hostsFile)}
            disabled={active === null}
          >
            <Download className="size-3.5" />
            下载 hosts.txt
          </Button>
        </>
      }
    >
      <Note tone="warn" title="扩展无法直接改写系统 hosts">
        浏览器扩展没有权限写 <code>/etc/hosts</code>（需要 native messaging 或额外的本机辅助程序）。本页负责「配置管理 +
        生成可直接粘贴的内容与一键脚本」，最后一步的 <code>sudo</code> / 管理员权限操作必须由你在终端里执行。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="edit" active={tab === 'edit'}>
            编辑与校验
          </TabsTrigger>
          <TabsTrigger value="diff" active={tab === 'diff'}>
            方案对比
          </TabsTrigger>
          <TabsTrigger value="deploy" active={tab === 'deploy'}>
            部署指引
          </TabsTrigger>
          <TabsTrigger value="reference" active={tab === 'reference'}>
            速查与模板
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'edit' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-xs text-muted-foreground">方案列表：拖动手柄或整行拖动排序，也可用箭头微调</span>
            <ul className="flex min-h-24 flex-col gap-1 overflow-auto rounded-md border p-1.5">
              {profiles.length === 0 && <EmptyHint>还没有方案，点右上角「新建方案」</EmptyHint>}
              {profiles.map((profile, index) => (
                <li
                  key={profile.id}
                  draggable
                  onDragStart={(event) => {
                    setDragId(profile.id);
                    event.dataTransfer.effectAllowed = 'move';
                    // Firefox 需要写入数据才会触发 drag 事件。
                    event.dataTransfer.setData('text/plain', profile.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    if (dragOverId !== profile.id) setDragOverId(profile.id);
                  }}
                  onDragLeave={() => setDragOverId((prev) => (prev === profile.id ? null : prev))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = dragId ?? event.dataTransfer.getData('text/plain');
                    if (sourceId !== '') reorder(sourceId, profile.id);
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-accent/60',
                    profile.id === active?.id && 'bg-accent',
                    dragId === profile.id && 'opacity-50',
                    dragOverId === profile.id && dragId !== null && dragId !== profile.id && 'ring-1 ring-primary',
                  )}
                >
                  <button
                    type="button"
                    aria-label={`拖动排序 ${profile.name}`}
                    className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveId(profile.id)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-xs font-medium">{profile.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {summarizeContent(profile.content).records} 条记录 · {profile.note || '无备注'}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`上移 ${profile.name}`}
                    disabled={index === 0}
                    onClick={() => move(profile, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`下移 ${profile.name}`}
                    disabled={index === profiles.length - 1}
                    onClick={() => move(profile, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`复制 ${profile.name}`}
                    onClick={() => duplicate(profile)}
                  >
                    <Files className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`删除 ${profile.name}`} onClick={() => remove(profile)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>

            <StatGrid>
              <Stat label="行数" value={summary.lines} />
              <Stat label="有效记录" value={summary.records} />
              <Stat label="注释行" value={summary.comments} />
              <Stat label="域名数" value={summary.domains} />
              <Stat
                label="校验问题"
                value={summary.issues.length}
                tone={summary.issues.length > 0 ? 'warn' : 'success'}
              />
              <Stat label="状态" value={dirty ? '未保存' : '已保存'} tone={dirty ? 'warn' : 'success'} />
            </StatGrid>

            <div className="flex flex-wrap items-end gap-2">
              <Field label="方案名称">
                <Input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={commit}
                  aria-label="方案名称"
                  className="h-8 w-40 text-xs"
                />
              </Field>
              <Field label="备注" className="min-w-0 flex-1">
                <Input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onBlur={commit}
                  placeholder="例如：联调环境，注意 VPN"
                  aria-label="方案备注"
                  className="h-8 text-xs"
                />
              </Field>
              <Button size="sm" onClick={commit} disabled={!dirty}>
                <Pencil className="size-3.5" />
                保存
              </Button>
            </div>

            {summary.issues.length > 0 ? (
              <div className="flex max-h-40 flex-col gap-1 overflow-auto rounded-md border p-2">
                {summary.issues.slice(0, 30).map((issue) => (
                  <div key={`${issue.kind}-${issue.line}-${issue.message}`} className="text-[11px]">
                    <span className="text-muted-foreground">第 {issue.line + 1} 行</span>
                    <span className={cn('ml-1.5', issueTone(issue.kind))}>
                      [{ISSUE_LABELS[issue.kind]}] {issue.message}
                    </span>
                  </div>
                ))}
                {summary.issues.length > 30 && (
                  <span className="text-[11px] text-muted-foreground">还有 {summary.issues.length - 30} 条…</span>
                )}
              </div>
            ) : (
              <Hint>格式检查通过：IP、域名、重复项与行尾空白都没问题。</Hint>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              spellCheck={false}
              aria-label="hosts 内容编辑器"
              placeholder={'每行一条：IP<TAB或空格>domain [aliases...]\n# 开头是注释\n127.0.0.1\tapi.local'}
              className="min-h-48 flex-1 resize-none font-mono text-xs"
            />
            <div className="max-h-56 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px]">
              {draft === '' ? <EmptyHint>输入内容后这里显示带行号的校验视图</EmptyHint> : renderLines(draft, true)}
            </div>
          </div>
        </div>
      )}

      {tab === 'diff' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <Select
              label="与哪个方案对比"
              value={compareId}
              onChange={setCompareId}
              options={[
                { value: '', label: '选择对比目标' },
                ...profiles
                  .filter((profile) => profile.id !== active?.id)
                  .map((profile) => ({ value: profile.id, label: profile.name })),
              ]}
              hint={
                compareTarget === null
                  ? '选择目标后逐行高亮差异'
                  : `左侧为「${compareTarget.name}」，右侧为「${active?.name}」`
              }
            />
            <StatGrid>
              <Stat label="新增行" value={diffStat.added} tone="success" />
              <Stat label="删除行" value={diffStat.removed} tone="danger" />
              <Stat label="修改行" value={diffStat.changed} tone="warn" />
              <Stat label="相同行" value={diffStat.same} />
            </StatGrid>
            {compareTarget === null ? (
              <EmptyHint>至少要有两套方案才能对比</EmptyHint>
            ) : (
              <>
                <ResultBox
                  label={`「${active?.name}」的 ${activeRecords(draft).length} 条有效记录`}
                  value={activeRecords(draft)
                    .map((entry) => `${entry.ip}\t${entry.domains.join(' ')}`)
                    .join('\n')}
                  rows="min-h-32"
                  onCopy={() =>
                    copyText(
                      activeRecords(draft)
                        .map((e) => `${e.ip}\t${e.domains.join(' ')}`)
                        .join('\n'),
                    )
                  }
                />
                <Hint>逐行对比按行号对齐：同一份 hosts 里调整条目顺序会被记成大量「修改」，不是语义级 diff。</Hint>
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-xs text-muted-foreground">差异列表（仅显示有变化的部分）</span>
            {diffChanged.length === 0 ? (
              <EmptyHint>两个方案逐行一致</EmptyHint>
            ) : (
              <div className="max-h-full overflow-auto rounded-md border p-2 font-mono text-[11px]">
                {diffChanged.map((row) => (
                  <div key={`${row.leftLine}-${row.rightLine}`} className="flex gap-2 py-0.5">
                    <span className={cn('w-10 shrink-0', diffTone(row.kind))}>{DIFF_LABELS[row.kind]}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-muted-foreground">
                      {row.left === '' ? '—' : row.left}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                      {row.right === '' ? '—' : row.right}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'deploy' && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="目标平台"
              value={platform}
              onChange={(value) => setPlatform(value as Platform)}
              options={PLATFORM_LIST}
              selectClassName="w-32"
              hint={`hosts 路径：${HOSTS_PATH[platform]}`}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadText(scriptFilename(platform), script)}
              disabled={active === null}
            >
              <Download className="size-3.5" />
              下载 {scriptFilename(platform)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => copyText(script)} disabled={active === null}>
              <Copy className="size-3.5" />
              复制脚本
            </Button>
          </div>

          <Note tone="info" title="脚本做了什么">
            先 <code>cp</code> 出一份带时间戳的备份（<code>hosts.bak.YYYYMMDD-HHMMSS</code>），再覆盖目标文件，最后刷新
            DNS 缓存；出问题用同一行给出的回滚命令即可恢复。写入前请确认备份确实生成。
          </Note>

          <Section title={`${PLATFORM_LABELS[platform]} 操作步骤`}>
            <ol className="flex list-decimal flex-col gap-2 pl-4">
              {steps.map((step) => (
                <li key={step.title} className="text-[11px] leading-relaxed">
                  <span className="font-medium">{step.title}</span>
                  <span className="block text-muted-foreground">{step.body}</span>
                </li>
              ))}
            </ol>
          </Section>

          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
            <ResultBox
              label="hosts 文件内容（可直接粘贴）"
              value={hostsFile}
              rows="min-h-48"
              fill
              onCopy={() => copyText(hostsFile)}
            />
            <ResultBox
              label={`一键脚本 ${scriptFilename(platform)}`}
              value={script}
              rows="min-h-48"
              fill
              onCopy={() => copyText(script)}
            />
          </div>

          <Note tone="danger" title="安全与限制">
            不要在 hosts 里屏蔽系统安全更新域名，否则会失去补丁来源。修改 hosts 不影响 HTTPS
            证书校验：把域名指向本机后浏览器仍按域名校验证书，所以本地服务得用自签 CA 或 mkcert 签发的证书，并单独信任该
            CA。浏览器自己的 DNS 缓存可以用 chrome://net-internals/#dns（新版已并入 chrome://net-internals 页面）清理。
          </Note>
        </div>
      )}

      {tab === 'reference' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2 overflow-auto">
            <span className="text-xs text-muted-foreground">常用公网 / 内网地址速查（点击加入当前方案）</span>
            {COMMON_ADDRESSES.map((item) => (
              <div key={`${item.ip}-${item.label}-${item.domains.join(',')}`} className="rounded-md border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{item.ip}</code>
                  <span className="text-xs font-medium">{item.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`把 ${item.ip} 加入当前方案`}
                    disabled={active === null}
                    onClick={() => {
                      commit();
                      setProfiles((prev) =>
                        prev.map((profile) =>
                          profile.id === active?.id
                            ? {
                                ...profile,
                                content: appendRecords(profile.content, [{ ip: item.ip, domains: item.domains }]),
                                updatedAt: new Date().toISOString(),
                              }
                            : profile,
                        ),
                      );
                    }}
                  >
                    <FileCode2 className="size-3.5" />
                    加入
                  </Button>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.description}</p>
                {item.warning !== undefined && (
                  <p className="mt-1 flex gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {item.warning}
                  </p>
                )}
              </div>
            ))}
            <Note tone="warn" title="不要屏蔽安全更新域名">
              把系统更新、证书吊销列表（OCSP/CRL）相关域名指向 0.0.0.0 会让系统无法打补丁，也无法吊销泄露的证书。
            </Note>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-auto">
            <Section title="域名清单" description="汇总所有方案里的域名，点击跳到对应方案的对应行">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={domainQuery}
                  onChange={(event) => setDomainQuery(event.target.value)}
                  placeholder="搜索域名"
                  aria-label="搜索域名"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              {filteredDomains.length === 0 ? (
                <EmptyHint>没有匹配的域名</EmptyHint>
              ) : (
                <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
                  {filteredDomains.slice(0, 200).map((item) => (
                    <li key={item.domain} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Globe className="size-3 shrink-0 text-muted-foreground" />
                      <code className="font-mono">{item.domain}</code>
                      <span className="text-muted-foreground">{item.profiles.length} 个方案</span>
                      {item.profiles.map((ref) => (
                        <Button
                          key={ref.id}
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const profile = profiles.find((entry) => entry.id === ref.id);
                            if (profile === undefined) return;
                            commit();
                            setActiveId(profile.id);
                            setTab('edit');
                          }}
                        >
                          {ref.name}
                        </Button>
                      ))}
                    </li>
                  ))}
                  {filteredDomains.length > 200 && (
                    <li className="text-[11px] text-muted-foreground">仅显示前 200 条，用搜索缩小范围。</li>
                  )}
                </ul>
              )}
            </Section>

            <Section title="模板方案" description="一键加载示例，再按自己的环境改">
              <div className="flex flex-wrap gap-2">
                {PROFILE_TEMPLATES.map((tpl) => (
                  <Button
                    key={tpl.id}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const profile = createProfile({ name: tpl.name, note: tpl.description, content: tpl.content });
                      setProfiles((prev) => [...prev, profile]);
                      setActiveId(profile.id);
                      setTab('edit');
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    {tpl.name}
                  </Button>
                ))}
              </div>
              {PROFILE_TEMPLATES.map((tpl) => (
                <Hint key={tpl.id}>
                  <span className="font-medium">{tpl.name}：</span>
                  {tpl.note}
                </Hint>
              ))}
            </Section>
          </div>
        </div>
      )}

      {importNote !== null && (
        <Section title="导入解析预览" actions={<ListChecks className="size-3.5 text-muted-foreground" />}>
          <Hint>{importNote}</Hint>
          {pendingImport !== null && importPreview !== null && (
            <>
              <StatGrid>
                <Stat label="导入记录" value={importPreview.summary.records} />
                <Stat label="导入域名" value={importPreview.summary.domains} />
                <Stat label="导入注释行" value={importPreview.summary.comments} />
                <Stat
                  label="校验问题"
                  value={importPreview.issues.length}
                  tone={importPreview.issues.length === 0 ? 'success' : 'warn'}
                />
              </StatGrid>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => applyImport(true)}>
                  作为新方案导入
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyImport(false)} disabled={active === null}>
                  覆盖当前方案
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
                  取消
                </Button>
              </div>
              <Note tone="info" title="与当前方案的差异">
                {active === null
                  ? '当前没有选中的方案，将作为新方案导入。'
                  : `相对「${active.name}」：新增 ${importPreview.compare.added} 行、删除 ${importPreview.compare.removed} 行、修改 ${importPreview.compare.changed} 行、相同 ${importPreview.compare.same} 行。`}
              </Note>
              {importPreview.rows.some((row) => row.kind !== 'same') ? (
                <ul className="max-h-40 overflow-auto rounded-md border p-2 text-[11px]">
                  {importPreview.rows
                    .filter((row) => row.kind !== 'same')
                    .slice(0, 60)
                    .map((row) => (
                      <li
                        key={`${row.kind}-${row.leftLine ?? 0}-${row.rightLine ?? 0}`}
                        className="flex gap-1.5 py-0.5"
                      >
                        <span className="shrink-0 font-mono text-muted-foreground">
                          L{row.rightLine ?? row.leftLine ?? 0}
                        </span>
                        <span
                          className={cn(
                            'shrink-0',
                            row.kind === 'add' && 'text-emerald-600',
                            row.kind === 'del' && 'text-destructive',
                            row.kind === 'change' && 'text-amber-600',
                          )}
                        >
                          {row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : '~'}
                        </span>
                        <span className="min-w-0 break-all">{row.right || row.left}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <Hint>与当前方案没有差异行。</Hint>
              )}
            </>
          )}
        </Section>
      )}

      <Section title="方案说明" description="一份 hosts 是全局生效的机器级配置">
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li>
            <span className="flex items-center gap-1">
              <Terminal className="size-3" />
              分隔符用 Tab 或空格都可以，多余空格会被解析器忽略但会被本页的校验标出。
            </span>
          </li>
          <li>
            <span className="flex items-center gap-1">
              <Info className="size-3" />
              0.0.0.0 与 127.0.0.1
              的区别：前者通常表现为「连不上」（黑洞），后者会真的打到本机服务，误用容易把自己的开发环境指到本机。
            </span>
          </li>
          <li>
            <span className="flex items-center gap-1">
              <Layers className="size-3" />
              .local 走 mDNS（Avahi/Bonjour），若解析不到可换成 .test 或 .localhost。
            </span>
          </li>
          <li>方案内容只存在浏览器 localStorage（键名 coder-tools:hosts），改系统文件前请先用「导出」留一份。</li>
        </ul>
      </Section>
    </ToolPanel>
  );
}

const DIFF_LABELS: Record<DiffKind, string> = {
  same: '相同',
  add: '新增',
  del: '删除',
  change: '修改',
};

function diffTone(kind: DiffKind): string {
  if (kind === 'add') return 'text-emerald-600 dark:text-emerald-400';
  if (kind === 'del') return 'text-destructive';
  if (kind === 'change') return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}
