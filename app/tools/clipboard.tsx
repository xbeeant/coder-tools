import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../components/ui/utils';
import {
  appendClip,
  type CaseStyle,
  CLEAN_LABELS,
  CLIP_TYPE_LABELS,
  CLIPBOARD_KEY,
  type CleanOp,
  type ClipAction,
  type ClipEntry,
  type ClipFilter,
  type ClipSettings,
  type ClipSort,
  type ClipType,
  collectTags,
  createClipId,
  DEFAULT_SETTINGS,
  detectType,
  filterClips,
  matchesBlacklist,
  nowIso,
  parseImportJson,
  pruneClips,
  relativeTime,
  runAction,
  TRANSFORM_LABELS,
  type TransformKind,
  type TransformOptions,
  toMarkdown,
  transform,
} from '../lib/clipboard-store';
import { downloadText, pickFiles, readAsText } from '../lib/file';

const ACTIONS_KEY = 'coder-tools:clipboard-actions';

const TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  ...(Object.keys(CLIP_TYPE_LABELS) as ClipType[]).map((type) => ({ value: type, label: CLIP_TYPE_LABELS[type] })),
];

const SORT_OPTIONS: { value: ClipSort; label: string }[] = [
  { value: 'time', label: '时间倒序' },
  { value: 'type', label: '按类型分组' },
];

const TRANSFORM_OPTIONS: { value: TransformKind; label: string }[] = [
  { value: 'json-pretty', label: 'JSON 美化' },
  { value: 'json-minify', label: 'JSON 压缩' },
  { value: 'json-to-yaml', label: 'JSON → YAML' },
  { value: 'json-to-csv', label: 'JSON → CSV' },
  { value: 'json-to-sql', label: 'JSON → SQL INSERT' },
  { value: 'json-to-ts', label: 'JSON → TypeScript 类型' },
  { value: 'case', label: '命名风格转换' },
  { value: 'url-parse', label: 'URL 解析' },
  { value: 'url-encode', label: 'URL 编码' },
  { value: 'url-decode', label: 'URL 解码' },
  { value: 'base64-encode', label: 'Base64 编码' },
  { value: 'base64-decode', label: 'Base64 解码' },
  { value: 'timestamp', label: '时间戳 → 可读时间' },
  { value: 'color', label: '颜色 HEX ↔ RGB ↔ HSL' },
  { value: 'escape-json', label: 'JSON 字符串转义' },
  { value: 'escape-html', label: 'HTML 实体转义' },
  { value: 'unescape-html', label: 'HTML 实体还原' },
  { value: 'strip-html', label: 'HTML 标签剥离' },
  { value: 'clean', label: '文本清洗管线' },
];

const CASE_OPTIONS: { value: CaseStyle; label: string }[] = [
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
  { value: 'dot', label: 'a.b.c' },
  { value: 'path', label: 'a/b/c' },
  { value: 'title', label: 'Title Case' },
  { value: 'lower', label: '全部小写' },
  { value: 'upper', label: '全部大写' },
];

const CLEAN_KEYS = Object.keys(CLEAN_LABELS) as CleanOp[];

const NEEDS_INDENT: TransformKind[] = ['json-pretty', 'json-to-yaml'];

/** 把任意读入的条目收敛成合法 ClipEntry。 */
function normalizeEntry(input: unknown): ClipEntry | null {
  if (input === null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.content !== 'string' || raw.content === '') return null;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso();
  const type =
    typeof raw.type === 'string' && raw.type in CLIP_TYPE_LABELS ? (raw.type as ClipType) : detectType(raw.content);
  return {
    id: typeof raw.id === 'string' ? raw.id : createClipId(),
    content: raw.content,
    type,
    createdAt: Number.isNaN(new Date(createdAt).getTime()) ? nowIso() : createdAt,
    source: typeof raw.source === 'string' ? raw.source : '历史',
    pinned: raw.pinned === true,
    favorite: raw.favorite === true,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

function clampSettings(raw: unknown): ClipSettings {
  const base = { ...DEFAULT_SETTINGS };
  if (raw === null || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  if (typeof source.blacklist === 'string') base.blacklist = source.blacklist;
  if (typeof source.maxEntries === 'number' && Number.isFinite(source.maxEntries)) {
    base.maxEntries = Math.min(5000, Math.max(1, Math.round(source.maxEntries)));
  }
  if (typeof source.keepDays === 'number' && Number.isFinite(source.keepDays)) {
    base.keepDays = Math.min(365, Math.max(1, Math.round(source.keepDays)));
  }
  if (typeof source.record === 'boolean') base.record = source.record;
  if (typeof source.blacklistEnabled === 'boolean') base.blacklistEnabled = source.blacklistEnabled;
  return base;
}

interface Persisted {
  entries: ClipEntry[];
  settings: ClipSettings;
}

function loadState(): Persisted {
  const fallback: Persisted = { entries: [], settings: { ...DEFAULT_SETTINGS } };
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        entries: pruneClips(
          parsed.map(normalizeEntry).filter((e): e is ClipEntry => e !== null),
          fallback.settings.keepDays,
          fallback.settings.maxEntries,
        ),
        settings: fallback.settings,
      };
    }
    if (parsed === null || typeof parsed !== 'object') return fallback;
    const root = parsed as Record<string, unknown>;
    const list = Array.isArray(root.entries) ? root.entries : [];
    const settings = clampSettings(root.settings);
    const entries = pruneClips(
      list.map(normalizeEntry).filter((e): e is ClipEntry => e !== null),
      settings.keepDays,
      settings.maxEntries,
    );
    return { entries, settings };
  } catch {
    return fallback;
  }
}

function loadActions(): ClipAction[] {
  try {
    const raw = window.localStorage.getItem(ACTIONS_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ClipAction[] = [];
    for (const item of parsed) {
      if (item === null || typeof item !== 'object') continue;
      const rawAction = item as Record<string, unknown>;
      const steps = Array.isArray(rawAction.steps)
        ? rawAction.steps.filter((step): step is TransformKind => typeof step === 'string' && step in TRANSFORM_LABELS)
        : [];
      if (steps.length === 0) continue;
      out.push({
        id: typeof rawAction.id === 'string' ? rawAction.id : createClipId(),
        name:
          typeof rawAction.name === 'string' && rawAction.name !== ''
            ? rawAction.name
            : TRANSFORM_LABELS[steps[0] ?? 'json-pretty'],
        steps,
        options:
          rawAction.options !== null && typeof rawAction.options === 'object'
            ? (rawAction.options as TransformOptions)
            : {},
        createdAt: typeof rawAction.createdAt === 'string' ? rawAction.createdAt : nowIso(),
      });
    }
    return out.slice(0, 60);
  } catch {
    return [];
  }
}

function persist(entries: ClipEntry[], settings: ClipSettings) {
  try {
    window.localStorage.setItem(
      CLIPBOARD_KEY,
      JSON.stringify({
        version: 1,
        savedAt: nowIso(),
        settings,
        entries: pruneClips(entries, settings.keepDays, settings.maxEntries),
      }),
    );
  } catch {
    // 配额不足时静默降级：历史仍在内存中可用
  }
}

function splitTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,，\s]+/)
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
    ),
  ];
}

export default function ClipboardTool() {
  const [entries, setEntries] = useState<ClipEntry[]>(loadState().entries);
  const [settings, setSettings] = useState<ClipSettings>(loadState().settings);
  const [actions, setActions] = useState<ClipAction[]>(loadActions);
  const [tab, setTab] = useState<'capture' | 'history' | 'transform' | 'settings'>('capture');
  const [draft, setDraft] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [source, setSource] = useState('手动录入');
  const [draftType, setDraftType] = useState<ClipType | 'auto'>('auto');
  const [filter, setFilter] = useState<ClipFilter>({ query: '', types: [], tags: [], sort: 'time' });
  const [kind, setKind] = useState<TransformKind>('json-pretty');
  const [options, setOptions] = useState<TransformOptions>({
    indent: 2,
    caseStyle: 'camel',
    ops: ['trim'],
    prefix: '',
    suffix: '',
  });
  const [output, setOutput] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionName, setActionName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const tags = useMemo(() => collectTags(entries), [entries]);
  const visible = useMemo(() => filterClips(entries, filter), [entries, filter]);
  const blacklistState = useMemo(
    () =>
      settings.blacklistEnabled ? matchesBlacklist(draft, settings.blacklist) : { blocked: false, invalid: false },
    [draft, settings.blacklist, settings.blacklistEnabled],
  );
  const stats = useMemo(() => {
    const byType = new Map<ClipType, number>();
    let bytes = 0;
    for (const entry of entries) {
      byType.set(entry.type, (byType.get(entry.type) ?? 0) + 1);
      bytes += entry.content.length;
    }
    return { byType, bytes };
  }, [entries]);

  useEffect(() => {
    persist(entries, settings);
  }, [entries, settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
    } catch {
      // 忽略写入失败
    }
  }, [actions]);

  const commit = useCallback(
    (incoming: ClipEntry) => {
      setEntries((prev) => {
        const next = appendClip(prev, incoming, settings.maxEntries);
        return pruneClips(next.entries, settings.keepDays, settings.maxEntries);
      });
    },
    [settings.keepDays, settings.maxEntries],
  );

  /** 黑名单校验：命中或正则非法时都拒绝入库，避免敏感内容落盘。 */
  const guard = useCallback(
    (text: string): string | null => {
      if (settings.blacklistEnabled) {
        const result = matchesBlacklist(text, settings.blacklist);
        if (result.invalid) return '黑名单正则不合法，已阻止写入（请检查设置）';
        if (result.blocked) return '内容命中黑名单正则，未写入历史';
      }
      return null;
    },
    [settings.blacklist, settings.blacklistEnabled],
  );

  const readClipboard = useCallback(async () => {
    setNotice(null);
    if (!navigator.clipboard?.readText) {
      setNotice('当前环境不支持读取剪贴板，请手动粘贴到输入框（部分浏览器需要 HTTPS 或用户手势）');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text === '') {
        setNotice('剪贴板为空');
        return;
      }
      setDraft(text);
      setSource('读取剪贴板');
      setNotice('已读取剪贴板内容，确认后点击「记录到历史」');
    } catch {
      setNotice('浏览器拒绝了剪贴板读取权限，请手动粘贴');
    }
  }, []);

  const addDraft = useCallback(() => {
    const text = draft;
    if (text.trim() === '') {
      setNotice('内容为空，未记录');
      return;
    }
    const denied = guard(text);
    if (denied !== null) {
      setNotice(denied);
      return;
    }
    commit({
      id: createClipId(),
      content: text,
      type: draftType === 'auto' ? detectType(text) : draftType,
      createdAt: nowIso(),
      source,
      pinned: false,
      favorite: false,
      tags: splitTags(draftTags),
    });
    setDraft('');
    setDraftTags('');
    setNotice('已记录到本地历史');
  }, [draft, draftTags, source, draftType, guard, commit]);

  const update = useCallback((id: string, patch: Partial<ClipEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const exportJson = useCallback(() => {
    const payload = JSON.stringify({ version: 1, exportedAt: nowIso(), entries: visible }, null, 2);
    downloadText('clipboard-history.json', payload);
  }, [visible]);

  const exportMarkdown = useCallback(() => {
    downloadText('clipboard-history.md', toMarkdown(visible));
  }, [visible]);

  const importJson = useCallback(async () => {
    const files = await pickFiles({ accept: '.json,application/json', multiple: true });
    if (files.length === 0) return;
    let added = 0;
    let skipped = 0;
    for (const file of files) {
      try {
        const parsed = parseImportJson(await readAsText(file));
        for (const entry of parsed) {
          const denied = guard(entry.content);
          if (denied !== null) {
            skipped += 1;
            continue;
          }
          commit({ ...entry, id: createClipId(), source: `导入 ${file.name}` });
          added += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    setNotice(`导入完成：新增 ${added} 条${skipped > 0 ? `，跳过 ${skipped} 条（格式错误或命中黑名单）` : ''}`);
  }, [guard, commit]);

  const runTransform = useCallback(
    (input: string, transformKind: TransformKind, transformOptions: TransformOptions) => {
      const result = transform(input, transformKind, transformOptions);
      setOutput(result.value);
      setDetail(result.detail);
      setError(result.error);
      return result;
    },
    [],
  );

  const saveAction = useCallback(() => {
    const label = actionName.trim() !== '' ? actionName.trim() : TRANSFORM_LABELS[kind];
    setActions((prev) =>
      [{ id: createClipId(), name: label, steps: [kind], options: { ...options }, createdAt: nowIso() }, ...prev].slice(
        0,
        60,
      ),
    );
    setActionName('');
  }, [actionName, kind, options]);

  const applyAction = useCallback(
    (action: ClipAction) => {
      const result = runAction(draft, action);
      setOutput(result.value);
      setDetail(result.detail);
      setError(result.error);
    },
    [draft],
  );

  const toggleType = useCallback((type: ClipType) => {
    setFilter((prev) => ({
      ...prev,
      types: prev.types.includes(type) ? prev.types.filter((item) => item !== type) : [...prev.types, type],
    }));
  }, []);

  return (
    <ToolPanel
      title="剪贴板"
      description="本页可见历史 + 格式化粘贴。数据仅存在当前浏览器的 localStorage（coder-tools:clipboard），不上传、不同步、不写剪贴板以外的位置。"
      actions={
        <span className="text-[11px] text-muted-foreground">
          {entries.length} 条 · 置顶 {entries.filter((entry) => entry.pinned).length} · 收藏{' '}
          {entries.filter((entry) => entry.favorite).length}
        </span>
      }
    >
      <TabsList className="w-full shrink-0">
        <TabsTrigger value="capture" active={tab === 'capture'} onClick={() => setTab('capture')} className="flex-1">
          记录
        </TabsTrigger>
        <TabsTrigger value="history" active={tab === 'history'} onClick={() => setTab('history')} className="flex-1">
          历史
        </TabsTrigger>
        <TabsTrigger
          value="transform"
          active={tab === 'transform'}
          onClick={() => setTab('transform')}
          className="flex-1"
        >
          格式化
        </TabsTrigger>
        <TabsTrigger value="settings" active={tab === 'settings'} onClick={() => setTab('settings')} className="flex-1">
          设置
        </TabsTrigger>
      </TabsList>

      {tab === 'capture' && (
        <Section
          title="记录一条片段"
          description="类型自动识别；关闭记录或命中黑名单时不会写入历史。"
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => void readClipboard()}>
                读取剪贴板
              </Button>
              <Button size="sm" onClick={addDraft}>
                记录到历史
              </Button>
            </>
          }
        >
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span className="text-muted-foreground">内容</span>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="在这里粘贴或输入内容…"
              className="font-mono text-xs"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="来源标签" value={source} onChange={setSource} placeholder="手动录入" />
            <TextField label="标签" value={draftTags} onChange={setDraftTags} placeholder="用空格或逗号分隔" />
            <Select
              label="类型"
              ariaLabel="类型"
              value={draftType}
              onChange={(value) => setDraftType(value as ClipType | 'auto')}
              options={[
                {
                  value: 'auto',
                  label: `自动识别（${draft.trim() === '' ? '—' : CLIP_TYPE_LABELS[detectType(draft)]}）`,
                },
                ...TYPE_OPTIONS.slice(1),
              ]}
            />
          </div>
          <StatGrid>
            <Stat label="识别类型" value={draft.trim() === '' ? '—' : CLIP_TYPE_LABELS[detectType(draft)]} />
            <Stat
              label="字符数"
              value={draft.length}
              hint={`约 ${stats.bytes > 0 ? Math.round(draft.length / 2) : 0} 字节(粗估)`}
            />
            <Stat label="行数" value={draft === '' ? 0 : draft.split('\n').length} />
            <Stat
              label="黑名单"
              value={
                !settings.record
                  ? '已关闭记录'
                  : blacklistState.invalid
                    ? '正则非法'
                    : blacklistState.blocked
                      ? '命中'
                      : '通过'
              }
              tone={!settings.record || blacklistState.blocked || blacklistState.invalid ? 'warn' : 'success'}
            />
          </StatGrid>
          {notice !== null && <Hint>{notice}</Hint>}
          {!settings.record && (
            <Note tone="warn" title="记录已关闭">
              设置里已关闭剪贴板历史记录，新内容不会写入 localStorage。
            </Note>
          )}
          {blacklistState.invalid && (
            <Note tone="danger" title="黑名单正则不合法">
              出于安全考虑，正则非法时所有写入都会被拒绝。请到「设置」里修正表达式。
            </Note>
          )}
        </Section>
      )}

      {tab === 'history' && (
        <>
          <Section
            title="筛选"
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFilter({ query: '', types: [], tags: [], sort: 'time' })}
              >
                重置筛选
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label="搜索内容 / 标签 / 来源"
                value={filter.query}
                onChange={(value) => setFilter((prev) => ({ ...prev, query: value }))}
                placeholder="关键词"
              />
              <Select
                label="排序"
                value={filter.sort}
                onChange={(value) => setFilter((prev) => ({ ...prev, sort: value as ClipSort }))}
                options={SORT_OPTIONS}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_OPTIONS.map((option) => {
                const active = option.value !== 'all' && filter.types.includes(option.value as ClipType);
                return (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => {
                      if (option.value === 'all') setFilter((prev) => ({ ...prev, types: [] }));
                      else toggleType(option.value as ClipType);
                    }}
                  >
                    {option.label}
                    {option.value !== 'all' && stats.byType.get(option.value as ClipType) !== undefined
                      ? ` ${stats.byType.get(option.value as ClipType)}`
                      : ''}
                  </Button>
                );
              })}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Button
                    key={tag}
                    size="sm"
                    variant={filter.tags.includes(tag) ? 'default' : 'outline'}
                    onClick={() =>
                      setFilter((prev) => ({
                        ...prev,
                        tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
                      }))
                    }
                  >
                    #{tag}
                  </Button>
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`历史（${visible.length}/${entries.length}）`}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={exportJson}>
                  导出 JSON
                </Button>
                <Button size="sm" variant="outline" onClick={exportMarkdown}>
                  导出 Markdown
                </Button>
                <Button size="sm" variant="outline" onClick={() => void importJson()}>
                  导入 JSON
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setEntries([])}>
                  清空
                </Button>
              </>
            }
          >
            {visible.length === 0 ? (
              <EmptyHint>
                {entries.length === 0
                  ? '暂无历史，切到「记录」页粘贴内容，或导入 JSON 备份。'
                  : '没有符合筛选条件的条目。'}
              </EmptyHint>
            ) : (
              <ul className="flex max-h-[420px] flex-col gap-2 overflow-auto pr-1">
                {visible.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex flex-col gap-1.5 rounded-md border p-2',
                      entry.pinned && 'border-primary/50 bg-primary/5',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {relativeTime(new Date(entry.createdAt))} · {CLIP_TYPE_LABELS[entry.type]} · {entry.source} ·{' '}
                        {entry.content.length} 字符
                        {entry.pinned ? ' · 置顶' : ''}
                        {entry.favorite ? ' · 收藏' : ''}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => setDraft(entry.content)}>
                          载入
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void navigator.clipboard?.writeText(entry.content)}
                        >
                          复制
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => update(entry.id, { pinned: !entry.pinned })}>
                          {entry.pinned ? '取消置顶' : '置顶'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update(entry.id, { favorite: !entry.favorite })}
                        >
                          {entry.favorite ? '取消收藏' : '收藏'}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => remove(entry.id)}>
                          删除
                        </Button>
                      </span>
                    </div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">
                      {entry.content}
                    </pre>
                    <TextField
                      label="标签"
                      value={entry.tags.join(' ')}
                      onChange={(value) => update(entry.id, { tags: splitTags(value) })}
                      inputClassName="h-7"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {tab === 'transform' && (
        <>
          <Section title="输入" description="留空则使用当前记录框内容；转换结果只在本地生成，不会自动写回历史。">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="待转换的内容…"
            />
          </Section>
          <Section title="动作">
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="转换"
                value={kind}
                onChange={(value) => setKind(value as TransformKind)}
                options={TRANSFORM_OPTIONS}
              />
              {NEEDS_INDENT.includes(kind) && (
                <NumberField
                  label="缩进空格"
                  value={options.indent ?? 2}
                  min={0}
                  max={8}
                  onChange={(value) => setOptions((prev) => ({ ...prev, indent: value }))}
                />
              )}
              {kind === 'case' && (
                <Select
                  label="命名风格"
                  value={options.caseStyle ?? 'camel'}
                  onChange={(value) => setOptions((prev) => ({ ...prev, caseStyle: value as CaseStyle }))}
                  options={CASE_OPTIONS}
                />
              )}
              {kind === 'clean' && (
                <>
                  <TextField
                    label="行前缀（配合 add-prefix）"
                    value={options.prefix ?? ''}
                    onChange={(value) => setOptions((prev) => ({ ...prev, prefix: value }))}
                    placeholder="例如：- "
                  />
                  <TextField
                    label="行后缀（配合 add-suffix）"
                    value={options.suffix ?? ''}
                    onChange={(value) => setOptions((prev) => ({ ...prev, suffix: value }))}
                    placeholder="例如："
                  />
                </>
              )}
            </div>
            {kind === 'clean' && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">清洗步骤（按点击顺序执行）</span>
                <div className="flex flex-wrap gap-1">
                  {CLEAN_KEYS.map((op) => {
                    const active = (options.ops ?? []).includes(op);
                    return (
                      <Button
                        key={op}
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        onClick={() =>
                          setOptions((prev) => {
                            const ops = prev.ops ?? [];
                            return {
                              ...prev,
                              ops: ops.includes(op) ? ops.filter((item) => item !== op) : [...ops, op],
                            };
                          })
                        }
                      >
                        {active ? `${(options.ops ?? []).indexOf(op) + 1}. ` : ''}
                        {CLEAN_LABELS[op]}
                      </Button>
                    );
                  })}
                </div>
                <Hint>
                  顺序：
                  {(options.ops ?? []).map((op, position) => `${position + 1}. ${CLEAN_LABELS[op]}`).join(' → ') ||
                    '未选择'}
                </Hint>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => runTransform(draft, kind, options)}>执行转换</Button>
              <Button
                variant="outline"
                onClick={() => {
                  const result = runTransform(draft, kind, options);
                  if (result.error === null && result.value !== '') {
                    const denied = guard(result.value);
                    if (denied !== null) {
                      setNotice(denied);
                      return;
                    }
                    commit({
                      id: createClipId(),
                      content: result.value,
                      type: detectType(result.value),
                      createdAt: nowIso(),
                      source: `转换 ${TRANSFORM_LABELS[kind]}`,
                      pinned: false,
                      favorite: false,
                      tags: splitTags(draftTags),
                    });
                    setNotice('转换结果已写入历史');
                  }
                }}
              >
                结果存入历史
              </Button>
              <Button
                variant="outline"
                disabled={output === ''}
                onClick={() => void navigator.clipboard?.writeText(output)}
              >
                复制结果
              </Button>
            </div>
          </Section>
          <Section title="结果">
            {error !== null && (
              <Note tone="danger" title="转换失败">
                {error}
              </Note>
            )}
            {error === null && detail !== '' && <Hint>{detail}</Hint>}
            {output === '' && error === null ? (
              <EmptyHint>选择一个动作并点击「执行转换」。</EmptyHint>
            ) : (
              <Textarea
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                rows={8}
                spellCheck={false}
                className="font-mono text-xs"
              />
            )}
          </Section>
          <Section title="动作模板" description="保存当前「转换 + 参数」组合，之后一键复用。">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="动作名称" value={actionName} onChange={setActionName} placeholder="留空则用动作名" />
              <div className="flex items-end gap-1.5">
                <Button variant="outline" onClick={saveAction}>
                  保存当前配置
                </Button>
              </div>
            </div>
            {actions.length === 0 ? (
              <EmptyHint>还没有保存的动作模板。</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {actions.map((action) => (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                  >
                    <span className="min-w-0 text-xs">
                      <span className="font-medium">{action.name}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {action.steps.map((step) => TRANSFORM_LABELS[step]).join(' → ')}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => applyAction(action)}>
                        应用
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setActions((prev) => prev.filter((item) => item.id !== action.id))}
                      >
                        删除
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {tab === 'settings' && (
        <>
          <Section title="记录策略">
            <Checkbox
              label="启用剪贴板历史记录"
              checked={settings.record}
              onChange={(checked) => setSettings((prev) => ({ ...prev, record: checked }))}
              hint="关闭后所有写入路径都会被拒绝，localStorage 里的旧数据保留但不再更新。"
            />
            <Checkbox
              label="启用正则黑名单"
              checked={settings.blacklistEnabled}
              onChange={(checked) => setSettings((prev) => ({ ...prev, blacklistEnabled: checked }))}
              hint="命中即拒绝写入；正则非法时按拒绝处理，避免误把凭据类内容落盘。"
            />
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">黑名单正则（单行，i 大小写不敏感）</span>
              <Textarea
                value={settings.blacklist}
                onChange={(event) => setSettings((prev) => ({ ...prev, blacklist: event.target.value }))}
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
              />
              <span className="text-[11px] leading-relaxed text-muted-foreground/80">
                默认：{DEFAULT_SETTINGS.blacklist}
              </span>
            </label>
            <Hint>正则非法：{matchesBlacklist('测试', settings.blacklist).invalid ? '是' : '否'}</Hint>
          </Section>
          <Section title="保留策略">
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="最大条数"
                value={settings.maxEntries}
                min={1}
                max={5000}
                onChange={(value) =>
                  setSettings((prev) => ({ ...prev, maxEntries: Math.min(5000, Math.max(1, value)) }))
                }
                hint="超出后按时间淘汰，置顶/收藏条目始终保留。"
              />
              <NumberField
                label="保留天数"
                value={settings.keepDays}
                min={1}
                max={365}
                onChange={(value) => setSettings((prev) => ({ ...prev, keepDays: Math.min(365, Math.max(1, value)) }))}
                hint="超期条目在下次写入时清理。"
              />
            </div>
            <StatGrid>
              <Stat label="总条目" value={entries.length} />
              <Stat label="去重窗口" value="5 分钟" hint="同内容只留最新一条" />
              <Stat label="存储位置" value="localStorage" hint="coder-tools:clipboard" />
              <Stat label="跨设备同步" value="不支持" hint="仅手工导入导出" />
            </StatGrid>
          </Section>
          <Section title="隐私说明">
            <Note tone="info" title="数据边界">
              记录仅保存在当前浏览器当前站点的
              localStorage，不做任何网络请求。清空历史会立即删除这些键值；浏览器清理站点数据同样会清空。
              浏览器扩展无法在后台持续监听系统剪贴板，跨设备同步需要系统级工具（例如系统剪贴板管理器）配合本页的手工导入导出。
            </Note>
          </Section>
        </>
      )}
    </ToolPanel>
  );
}
