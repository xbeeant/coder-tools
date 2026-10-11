import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { randomBytes } from '../lib/bytes';
import { downloadText, pickFiles, readAsText } from '../lib/file';
import { analyzePassword, formatDuration, LEVEL_LABELS } from '../lib/password';
import {
  createEmptyVault,
  createItem,
  DEFAULT_ITERATIONS,
  decryptWithKey,
  deriveKey,
  dropVault,
  ENTRY_TYPE_LABELS,
  type EntryType,
  encryptWithKey,
  exportVaultPlain,
  type ItemDraft,
  importVaultPlain,
  loadEncrypted,
  nowIso,
  saveEncrypted,
  searchVault,
  updateItem,
  type Vault,
  type VaultItem,
} from '../lib/vault';

const TYPES: EntryType[] = ['login', 'card', 'note', 'api', 'otp'];

const TYPE_OPTIONS = TYPES.map((type) => ({ value: type, label: ENTRY_TYPE_LABELS[type] }));

const PASSWORD_PRESETS = [
  { id: 'alnum', label: '字母 + 数字', pools: ['abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'] },
  {
    id: 'full',
    label: '全部字符',
    pools: ['abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+'],
  },
] as const;

const TYPE_FIELDS: Record<EntryType, readonly string[]> = {
  login: ['username', 'password', 'url', 'notes'],
  card: ['name', 'number', 'holder', 'expMonth', 'expYear', 'cvc', 'brand', 'notes'],
  note: ['content'],
  api: ['keyId', 'secret', 'baseUrl', 'notes'],
  otp: ['secret', 'issuer', 'notes'],
};

const FIELD_LABELS: Record<string, string> = {
  username: '用户名 / 账号',
  password: '密码',
  url: '网址',
  notes: '备注',
  name: '持卡人 / 名称',
  number: '卡号',
  holder: '持卡人',
  expMonth: '有效期月',
  expYear: '有效期年',
  cvc: '安全码',
  brand: '卡组织',
  content: '内容',
  keyId: 'Key ID',
  secret: '密钥',
  baseUrl: 'Base URL',
  issuer: '签发方',
};

type Panel = 'unlock' | 'entries' | 'settings' | 'data';

export default function PasswordManagerTool() {
  const [panel, setPanel] = useState<Panel>('unlock');
  const [exists, setExists] = useState(false);
  const [locked, setLocked] = useState(true);
  const [master, setMaster] = useState('');
  const [confirmMaster, setConfirmMaster] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<EntryType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>({ type: 'login', title: '', fields: {} });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [genLength, setGenLength] = useState(20);
  const [genPreset, setGenPreset] = useState<string>('full');
  const [generated, setGenerated] = useState('');
  const [confirmExport, setConfirmExport] = useState('');
  const [plainText, setPlainText] = useState('');
  const [oldMaster, setOldMaster] = useState('');
  const [newMaster, setNewMaster] = useState('');

  // 只在内存里保留派生的 CryptoKey，主密码字符串不会长期驻留。
  const keyRef = useRef<CryptoKey | null>(null);
  const saltRef = useRef<Uint8Array | null>(null);
  const iterationsRef = useRef(DEFAULT_ITERATIONS);
  const idleRef = useRef<number | null>(null);

  const strength = useMemo(() => analyzePassword(newMaster !== '' ? newMaster : master), [master, newMaster]);
  const visible = useMemo(() => searchVault(items, query, types), [items, query, types]);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const clearMemory = useCallback(() => {
    keyRef.current = null;
    saltRef.current = null;
    setItems([]);
    setSelectedId(null);
    setMaster('');
    setConfirmMaster('');
    setEditingId(null);
    setDraft({ type: 'login', title: '', fields: {} });
    setPlainText('');
  }, []);

  const lock = useCallback(() => {
    clearMemory();
    setLocked(true);
    setPanel('unlock');
    setNotice('已锁定，保险库明文已从内存清空');
  }, [clearMemory]);

  const touch = useCallback(() => {
    if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    if (locked || autoLockMinutes <= 0) return;
    idleRef.current = window.setTimeout(lock, autoLockMinutes * 60_000);
  }, [locked, autoLockMinutes, lock]);

  useEffect(() => {
    setExists(loadEncrypted() !== null);
  }, []);

  useEffect(() => {
    touch();
  }, [touch]);

  useEffect(
    () => () => {
      if (idleRef.current !== null) window.clearTimeout(idleRef.current);
    },
    [],
  );

  /** 加密并落盘当前条目列表。 */
  const persist = useCallback(async (next: VaultItem[]) => {
    const key = keyRef.current;
    const salt = saltRef.current;
    if (key === null || salt === null) throw new Error('保险库未解锁');
    const payload: Vault = { version: 1, items: next };
    const blob = await encryptWithKey(payload, key, salt, iterationsRef.current);
    saveEncrypted(blob);
  }, []);

  const createVault = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (master.length < 8) {
      setError('主密码至少 8 位');
      return;
    }
    if (master !== confirmMaster) {
      setError('两次输入的主密码不一致');
      return;
    }
    setBusy(true);
    try {
      const salt = randomBytes(32);
      const key = await deriveKey(master, salt, DEFAULT_ITERATIONS);
      const blob = await encryptWithKey(createEmptyVault(), key, salt, DEFAULT_ITERATIONS);
      saveEncrypted(blob);
      keyRef.current = key;
      saltRef.current = salt;
      iterationsRef.current = DEFAULT_ITERATIONS;
      setExists(true);
      setLocked(false);
      setPanel('entries');
      setItems([]);
      setMaster('');
      setConfirmMaster('');
      setNotice('保险库已创建并解锁');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }, [master, confirmMaster]);

  const unlock = useCallback(async () => {
    setError(null);
    setNotice(null);
    const blob = loadEncrypted();
    if (blob === null) {
      setError('未找到本地保险库');
      return;
    }
    setBusy(true);
    try {
      const salt = new Uint8Array(base64Bytes(blob.salt));
      const iterations = Math.max(DEFAULT_ITERATIONS, blob.iterations);
      const key = await deriveKey(master, salt, iterations);
      const vault = await decryptWithKey(blob, key);
      keyRef.current = key;
      saltRef.current = salt;
      iterationsRef.current = iterations;
      setItems(vault.items);
      setLocked(false);
      setPanel('entries');
      setMaster('');
      setNotice(`已解锁，共 ${vault.items.length} 条条目`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '解锁失败');
    } finally {
      setBusy(false);
    }
  }, [master]);

  const commit = useCallback(
    async (next: VaultItem[]) => {
      setItems(next);
      try {
        await persist(next);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '保存失败');
      }
    },
    [persist],
  );

  const resetDraft = useCallback((type: EntryType = 'login', title = '') => {
    setDraft({ type, title, fields: {} });
    setEditingId(null);
  }, []);

  const addItem = useCallback(() => {
    const title = draft.title.trim() !== '' ? draft.title.trim() : defaultTitle(draft);
    const item = createItem({ ...draft, title });
    setEditingId(null);
    setDraft({ type: draft.type, title: '', fields: {} });
    void commit([item, ...items]);
  }, [draft, items, commit]);

  const saveEdit = useCallback(() => {
    if (editingId === null) return;
    const title = draft.title.trim() !== '' ? draft.title.trim() : defaultTitle(draft);
    const next = items.map((item) => (item.id === editingId ? updateItem(item, draft, title) : item));
    void commit(next);
    setEditingId(null);
    setDraft({ type: 'login', title: '', fields: {} });
  }, [editingId, draft, items, commit]);

  const removeItem = useCallback(
    (id: string) => {
      void commit(items.filter((item) => item.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [items, selectedId, commit],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      void commit(
        items.map((item) => (item.id === id ? { ...item, favorite: !item.favorite, updatedAt: nowIso() } : item)),
      );
    },
    [items, commit],
  );

  const startEdit = useCallback((item: VaultItem) => {
    setEditingId(item.id);
    setDraft({ type: item.type, title: item.title, fields: fieldsOf(item) });
    setPanel('entries');
  }, []);

  const generatePassword = useCallback(() => {
    const preset = PASSWORD_PRESETS.find((item) => item.id === genPreset) ?? PASSWORD_PRESETS[1];
    let pool = preset.pools.join('');
    const size = Math.max(8, Math.min(128, genLength));
    const out: string[] = [];
    for (let index = 0; index < size; index += 1) {
      const [pick, rest] = pickFrom(pool);
      out.push(pick);
      pool = rest;
    }
    setGenerated(out.join(''));
  }, [genLength, genPreset]);

  const writeGenerated = useCallback(() => {
    if (generated === '') return;
    setDraft((prev) => {
      const field = prev.type === 'api' ? 'secret' : 'password';
      return { ...prev, fields: { ...prev.fields, [field]: generated } };
    });
    setGenerated('');
  }, [generated]);

  const changeMaster = useCallback(async () => {
    setError(null);
    const key = keyRef.current;
    const salt = saltRef.current;
    if (key === null || salt === null) {
      setError('保险库未解锁');
      return;
    }
    if (oldMaster.length < 8 || newMaster.length < 8) {
      setError('新旧主密码都至少需要 8 位');
      return;
    }
    setBusy(true);
    try {
      const blob = loadEncrypted();
      if (blob === null) throw new Error('本地保险库不存在');
      const verify = await deriveKey(oldMaster, salt, iterationsRef.current);
      await decryptWithKey(blob, verify);
    } catch {
      setError('旧主密码不正确');
      setBusy(false);
      return;
    }
    try {
      const nextSalt = randomBytes(32);
      const nextKey = await deriveKey(newMaster, nextSalt, iterationsRef.current);
      const blob = await encryptWithKey({ version: 1, items }, nextKey, nextSalt, iterationsRef.current);
      saveEncrypted(blob);
      keyRef.current = nextKey;
      saltRef.current = nextSalt;
      setOldMaster('');
      setNewMaster('');
      setNotice('主密码已更新，请重新记住它');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败');
    } finally {
      setBusy(false);
    }
  }, [oldMaster, newMaster, items]);

  const exportPlain = useCallback(() => {
    if (confirmExport !== 'EXPORT') {
      setError('请输入 EXPORT 以确认明文导出');
      return;
    }
    setPlainText(exportVaultPlain({ version: 1, items }));
    setNotice('明文已生成，仅存在于内存，关闭面板即消失');
  }, [confirmExport, items]);

  const downloadPlain = useCallback(() => {
    if (plainText === '') return;
    downloadText('vault-plaintext.json', plainText);
  }, [plainText]);

  const importPlain = useCallback(async () => {
    setError(null);
    const files = await pickFiles({ accept: '.json,application/json' });
    const file = files[0];
    if (file === undefined) return;
    try {
      const json = await readAsText(file);
      const incoming = importVaultPlain(json);
      await commit([...incoming.items, ...items]);
      setNotice(`已导入 ${incoming.items.length} 条条目`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
    }
  }, [items, commit]);

  const resetVault = useCallback(() => {
    dropVault();
    clearMemory();
    setExists(false);
    setLocked(true);
    setPanel('unlock');
    setNotice('本地保险库已删除');
  }, [clearMemory]);

  return (
    <ToolPanel
      title="密码管理器"
      description={`PBKDF2-SHA256 ${iterationsRef.current.toLocaleString('zh-CN')} 次派生 + AES-GCM-256 加密整个保险库。主密码与明文只存在于内存，锁定即清空；localStorage 里只有密文。`}
      actions={
        locked ? (
          <span className="text-[11px] text-muted-foreground">已锁定</span>
        ) : (
          <Button size="sm" variant="outline" onClick={lock}>
            立即锁定
          </Button>
        )
      }
    >
      <TabsList className="w-full shrink-0">
        <TabsTrigger value="unlock" active={panel === 'unlock'} onClick={() => setPanel('unlock')} className="flex-1">
          {exists ? '解锁' : '创建'}
        </TabsTrigger>
        <TabsTrigger
          value="entries"
          active={panel === 'entries'}
          onClick={() => setPanel('entries')}
          className="flex-1"
          disabled={locked}
        >
          条目
        </TabsTrigger>
        <TabsTrigger
          value="settings"
          active={panel === 'settings'}
          onClick={() => setPanel('settings')}
          className="flex-1"
          disabled={locked}
        >
          安全设置
        </TabsTrigger>
        <TabsTrigger
          value="data"
          active={panel === 'data'}
          onClick={() => setPanel('data')}
          className="flex-1"
          disabled={locked}
        >
          导入导出
        </TabsTrigger>
      </TabsList>

      {error !== null && (
        <Note tone="danger" title="出错了">
          {error}
        </Note>
      )}
      {notice !== null && <Hint>{notice}</Hint>}

      {panel === 'unlock' &&
        (exists ? (
          <Section title="解锁保险库" description="AES-GCM 带认证标签，主密码错误会直接解密失败。">
            <TextField
              label="主密码"
              type="password"
              value={master}
              onChange={setMaster}
              placeholder="输入主密码"
              inputClassName="text-base"
            />
            {master !== '' && (
              <Hint>
                强度：{LEVEL_LABELS[strength.level]}（{strength.entropy.toFixed(1)} bit）·{' '}
                {strength.suggestions[0] ?? '长度足够'}
              </Hint>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => void unlock()} disabled={busy || master === ''}>
                {busy ? '派生密钥中…' : '解锁'}
              </Button>
              <Button variant="outline" onClick={() => setMaster('')}>
                清空
              </Button>
            </div>
            <Hint>
              PBKDF2 {iterationsRef.current.toLocaleString('zh-CN')} 次迭代在部分设备上需要 1-3 秒，属正常现象。
            </Hint>
          </Section>
        ) : (
          <Section title="创建保险库" description="本地尚无保险库。创建后立刻生成加密数据并进入解锁状态。">
            <TextField label="主密码（至少 8 位）" type="password" value={master} onChange={setMaster} />
            <TextField label="确认主密码" type="password" value={confirmMaster} onChange={setConfirmMaster} />
            {master !== '' && (
              <div className="flex flex-col gap-1">
                <Hint>
                  强度：{LEVEL_LABELS[strength.level]} · 熵 {strength.entropy.toFixed(1)} bit · 字符集{' '}
                  {strength.poolSize}
                </Hint>
                <Hint>离线快哈希（100 亿次/秒）下预计耗时：{formatDuration(strength.crackTimes[3]?.seconds ?? 0)}</Hint>
                {strength.suggestions.map((item) => (
                  <Hint key={item}>· {item}</Hint>
                ))}
              </div>
            )}
            <Button onClick={() => void createVault()} disabled={busy}>
              {busy ? '派生密钥中…' : '创建并解锁'}
            </Button>
            <Note tone="warn" title="主密码无法找回">
              保险库只保存密文与盐，忘记主密码等于数据永久丢失。建议先用随机长密码创建，再导入已有条目。
            </Note>
          </Section>
        ))}

      {panel === 'entries' && !locked && (
        <>
          <Section
            title={`条目（${visible.length}/${items.length}）`}
            actions={
              <div className="flex flex-row gap-1">
                <Button size="sm" variant="outline" onClick={() => setQuery('')}>
                  清除搜索
                </Button>
                <Button size="sm" variant="outline" onClick={() => void importPlain()}>
                  导入 JSON
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="搜索" value={query} onChange={setQuery} placeholder="标题、账号、网址、标签、备注" />
              <div className="flex flex-wrap items-end gap-1">
                {TYPES.map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant={types.includes(type) ? 'default' : 'outline'}
                    onClick={() =>
                      setTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]))
                    }
                  >
                    {ENTRY_TYPE_LABELS[type]}
                    <span className="ml-1 opacity-70">{items.filter((item) => item.type === type).length}</span>
                  </Button>
                ))}
              </div>
            </div>
          </Section>

          <Section title={editingId === null ? '新建条目' : '编辑条目'}>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="类型"
                value={draft.type}
                onChange={(value) => setDraft((prev) => ({ ...prev, type: value as EntryType, fields: {} }))}
                options={TYPE_OPTIONS}
              />
              <TextField
                label="标题"
                value={draft.title}
                onChange={(value) => setDraft((prev) => ({ ...prev, title: value }))}
                placeholder={defaultTitle(draft)}
              />
            </div>
            {draft.type === 'note' ? (
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{FIELD_LABELS.content}</span>
                <Textarea
                  value={draft.fields.content ?? ''}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, fields: { ...prev.fields, content: event.target.value } }))
                  }
                  rows={6}
                  spellCheck={false}
                  className="text-xs"
                />
              </label>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {TYPE_FIELDS[draft.type].map((field) => (
                  <TextField
                    key={field}
                    label={FIELD_LABELS[field] ?? field}
                    type={
                      field === 'password' || field === 'secret' || field === 'cvc'
                        ? reveal
                          ? 'text'
                          : 'password'
                        : 'text'
                    }
                    value={draft.fields[field] ?? ''}
                    onChange={(value) => setDraft((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }))}
                  />
                ))}
              </div>
            )}
            <Checkbox
              label="显示明文字段"
              checked={reveal}
              onChange={setReveal}
              hint="仅影响输入框显示，不会写入任何日志。"
            />
            <div className="flex flex-wrap gap-1.5">
              {editingId === null ? (
                <Button onClick={addItem}>添加条目</Button>
              ) : (
                <>
                  <Button onClick={saveEdit}>保存修改</Button>
                  <Button variant="outline" onClick={() => resetDraft(draft.type)}>
                    取消编辑
                  </Button>
                </>
              )}
            </div>
          </Section>

          <Section title="条目列表">
            {visible.length === 0 ? (
              <EmptyHint>{items.length === 0 ? '保险库是空的，从上面新建第一条。' : '没有匹配的条目。'}</EmptyHint>
            ) : (
              <ul className="flex max-h-[380px] flex-col gap-1.5 overflow-auto">
                {visible.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                  >
                    <span className="min-w-0 text-xs">
                      <span className="font-medium">{item.title}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {ENTRY_TYPE_LABELS[item.type]} · {subtitleOf(item)} · {item.updatedAt.slice(0, 10)}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                      >
                        {item.id === selectedId ? '收起' : '详情'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleFavorite(item.id)}>
                        {item.favorite ? '取消收藏' : '收藏'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => removeItem(item.id)}>
                        删除
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {selected !== null && (
            <Section
              title={`详情：${selected.title}`}
              actions={<Checkbox label="显示明文" checked={reveal} onChange={setReveal} />}
            >
              {reveal ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              ) : (
                <Hint>明文已隐藏，勾选「显示明文」后再查看。切换保险库或锁定时会立即清空。</Hint>
              )}
            </Section>
          )}
        </>
      )}

      {panel === 'settings' && !locked && (
        <>
          <Section title="自动锁定" description="空闲后自动锁定并清空内存中的明文。">
            <NumberField
              label="空闲分钟"
              value={autoLockMinutes}
              min={0}
              max={120}
              onChange={(value) => setAutoLockMinutes(Math.max(0, Math.min(120, value)))}
              hint="0 表示不自动锁定"
            />
            <Hint>当前加密强度：PBKDF2-SHA256 {iterationsRef.current.toLocaleString('zh-CN')} 次 + AES-GCM-256。</Hint>
          </Section>
          <Section title="密码生成器" description="使用 crypto.getRandomValues 的拒绝采样，无模偏差。">
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="长度"
                value={genLength}
                min={8}
                max={128}
                onChange={(value) => setGenLength(Math.max(8, Math.min(128, value)))}
              />
              <Select
                label="字符集"
                value={genPreset}
                onChange={setGenPreset}
                options={PASSWORD_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" onClick={generatePassword}>
                生成
              </Button>
              <Button onClick={writeGenerated} disabled={generated === ''}>
                写入当前条目
              </Button>
            </div>
            {generated !== '' && (
              <>
                <Textarea
                  value={generated}
                  onChange={(event) => setGenerated(event.target.value)}
                  rows={2}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                <Hint>
                  强度：{LEVEL_LABELS[analyzePassword(generated).level]}（
                  {analyzePassword(generated).entropy.toFixed(1)} bit）
                </Hint>
              </>
            )}
          </Section>
          <Section title="修改主密码" description="会重新派生密钥并用新盐重新加密整库。">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="旧主密码" type="password" value={oldMaster} onChange={setOldMaster} />
              <TextField label="新主密码（≥8 位）" type="password" value={newMaster} onChange={setNewMaster} />
            </div>
            <Button onClick={() => void changeMaster()} disabled={busy}>
              更新主密码
            </Button>
          </Section>
        </>
      )}

      {panel === 'data' && !locked && (
        <>
          <Section title="明文导出（高风险）">
            <Note tone="danger" title="导出文件不加密">
              明文 JSON 包含全部账号、密码与密钥。请勿通过聊天工具、邮件或公共网盘传输，导出后立刻清理文件。
            </Note>
            <TextField
              label="输入 EXPORT 以确认"
              value={confirmExport}
              onChange={setConfirmExport}
              placeholder="EXPORT"
              inputClassName="max-w-40"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button variant="destructive" onClick={exportPlain}>
                生成明文
              </Button>
              <Button variant="outline" onClick={downloadPlain} disabled={plainText === ''}>
                下载 JSON
              </Button>
              <Button variant="outline" onClick={() => setPlainText('')} disabled={plainText === ''}>
                立即销毁明文
              </Button>
            </div>
            {plainText !== '' && (
              <Textarea
                value={plainText}
                onChange={(event) => setPlainText(event.target.value)}
                rows={8}
                spellCheck={false}
                className="font-mono text-xs"
              />
            )}
          </Section>
          <Section title="明文导入" description="导入的条目会立刻用当前主密码重新加密后落盘。">
            <Button onClick={() => void importPlain()}>选择 JSON 文件</Button>
          </Section>
          <Section title="危险操作">
            <Note tone="danger" title="删除保险库">
              删除后本地的密文、盐与全部条目都会消失，无法撤销。请先导出加密备份或明文备份。
            </Note>
            <Button variant="destructive" onClick={resetVault}>
              删除本地保险库
            </Button>
          </Section>
        </>
      )}

      <StatGrid>
        <Stat
          label="状态"
          value={locked ? '已锁定' : '已解锁'}
          tone={locked ? 'warn' : 'success'}
          hint={locked ? '内存无明文' : '自动锁定生效中'}
        />
        <Stat label="条目数" value={items.length} hint={`${items.filter((item) => item.favorite).length} 个收藏`} />
        <Stat label="PBKDF2 迭代" value={iterationsRef.current.toLocaleString('zh-CN')} hint="下限 600,000" />
        <Stat label="加密算法" value="AES-GCM-256" hint="12 字节随机 IV" />
      </StatGrid>
    </ToolPanel>
  );
}

function defaultTitle(draft: ItemDraft): string {
  const field =
    draft.type === 'note'
      ? 'content'
      : draft.type === 'api'
        ? 'keyId'
        : draft.type === 'otp'
          ? 'issuer'
          : draft.type === 'card'
            ? 'holder'
            : 'username';
  const value = (draft.fields[field] ?? '').trim();
  return value === '' ? '未命名条目' : value.slice(0, 24);
}

function fieldsOf(item: VaultItem): Record<string, string> {
  const out: Record<string, string> = {};
  const push = (
    target: Record<string, string>,
    keys: readonly string[],
    source: Record<string, unknown> | undefined,
  ) => {
    if (source === undefined) return;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value !== '') target[key] = value;
    }
  };
  if (item.login !== undefined)
    push(out, ['username', 'password', 'url', 'notes'], item.login as unknown as Record<string, unknown>);
  if (item.card !== undefined)
    push(
      out,
      ['name', 'number', 'holder', 'expMonth', 'expYear', 'cvc', 'brand', 'notes'],
      item.card as unknown as Record<string, unknown>,
    );
  if (item.note !== undefined) push(out, ['content'], item.note as unknown as Record<string, unknown>);
  if (item.api !== undefined)
    push(out, ['keyId', 'secret', 'baseUrl', 'notes'], item.api as unknown as Record<string, unknown>);
  if (item.otp !== undefined) push(out, ['secret', 'issuer', 'notes'], item.otp as unknown as Record<string, unknown>);
  return out;
}

function subtitleOf(item: VaultItem): string {
  if (item.login?.username !== undefined && item.login.username !== '') return item.login.username;
  if (item.api?.keyId !== undefined && item.api.keyId !== '') return item.api.keyId;
  if (item.card?.holder !== undefined && item.card.holder !== '') return item.card.holder;
  if (item.otp?.issuer !== undefined && item.otp.issuer !== '') return item.otp.issuer;
  if (item.note !== undefined) return `${item.note.content.length} 字符`;
  return '—';
}

/** 从字符串还原 base64 字节，失败时抛错。 */
function base64Bytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 从字符池里用拒绝采样取一个字符并返回剩余池。 */
function pickFrom(pool: string): [string, string] {
  const size = pool.length;
  if (size === 0) return ['', ''];
  const limit = Math.floor(256 / size) * size;
  const buf = new Uint8Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0] as number;
  } while (value >= limit);
  const index = value % size;
  return [pool.charAt(index), pool.slice(0, index) + pool.slice(index + 1)];
}
