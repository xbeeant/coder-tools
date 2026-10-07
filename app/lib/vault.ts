/**
 * 密码管理器的纯逻辑：主密码校验、PBKDF2 派生密钥、AES-GCM 加密保险库、
 * 条目管理、强度评估、导入导出。所有明文数据只存在内存，不写入 localStorage。
 */
import { base64ToBytes, bytesToBase64, bytesToUtf8, randomBytes, utf8ToBytes } from './bytes';

export type EntryType = 'login' | 'card' | 'note' | 'api' | 'otp';

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  login: '登录',
  card: '银行卡',
  note: '安全笔记',
  api: 'API 密钥',
  otp: 'OTP',
};

export interface VaultLogin {
  url?: string;
  username: string;
  password: string;
  notes?: string;
  tags: string[];
  mfa?: boolean;
}

export interface VaultCard {
  name: string;
  number: string;
  holder: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  brand?: string;
  notes?: string;
  tags: string[];
}

export interface VaultNote {
  title: string;
  content: string;
  tags: string[];
}

export interface VaultApi {
  name: string;
  keyId: string;
  secret: string;
  baseUrl?: string;
  notes?: string;
  tags: string[];
}

export interface VaultOtp {
  name: string;
  secret: string;
  issuer?: string;
  digits?: number;
  period?: number;
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  notes?: string;
  tags: string[];
}

export interface VaultItem {
  id: string;
  type: EntryType;
  title: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  login?: VaultLogin;
  card?: VaultCard;
  note?: VaultNote;
  api?: VaultApi;
  otp?: VaultOtp;
}

export interface Vault {
  version: 1;
  items: VaultItem[];
}

export interface EncryptedVault {
  version: 1;
  /** PBKDF2-SHA256 迭代次数 */
  iterations: number;
  /** 盐（base64） */
  salt: string;
  /** nonce（base64） */
  iv: string;
  /** AES-GCM 加密的 vault JSON（base64） */
  ciphertext: string;
}

export interface UnlockState {
  locked: boolean;
  masterHash: string | null;
  salt: string | null;
  iterations: number;
}

export const DEFAULT_ITERATIONS = 600_000;

export const VAULT_KEY = 'coder-tools:vault:encrypted';
export const VAULT_SALT_KEY = 'coder-tools:vault:salt';
export const VAULT_ITER_KEY = 'coder-tools:vault:iterations';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createItemId(): string {
  return `item-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
}

/** 派生主密钥：PBKDF2-SHA256，返回 CryptoKey。 */
export async function deriveKey(masterPassword: string, saltBytes: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    utf8ToBytes(masterPassword).buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: Math.max(DEFAULT_ITERATIONS, iterations),
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 用已派生的密钥加密保险库：解锁后保存时复用，避免在内存里长期保留主密码。 */
export async function encryptWithKey(
  vault: Vault,
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
): Promise<EncryptedVault> {
  const iv = randomBytes(12);
  const plaintext = utf8ToBytes(JSON.stringify(vault));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 1,
    iterations: Math.max(DEFAULT_ITERATIONS, iterations),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** 用已派生的密钥解密保险库。 */
export async function decryptWithKey(encrypted: EncryptedVault, key: CryptoKey): Promise<Vault> {
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return parseVaultJson(bytesToUtf8(new Uint8Array(plaintext)));
  } catch {
    throw new Error('主密码错误或保险库已损坏');
  }
}

/** 创建空保险库。 */
export function createEmptyVault(): Vault {
  return { version: 1, items: [] };
}

/** AES-GCM 加密整个保险库 JSON。 */
export async function encryptVault(
  vault: Vault,
  masterPassword: string,
  saltBytes?: Uint8Array,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedVault> {
  const salt = saltBytes ?? randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveKey(masterPassword, salt, iterations);
  const plaintext = utf8ToBytes(JSON.stringify(vault));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext,
  );
  return {
    version: 1,
    iterations: Math.max(DEFAULT_ITERATIONS, iterations),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** 解密保险库；解密失败抛出 Error。 */
export async function decryptVault(encrypted: EncryptedVault, masterPassword: string): Promise<Vault> {
  const salt = base64ToBytes(encrypted.salt);
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const key = await deriveKey(
    masterPassword,
    salt,
    Math.max(DEFAULT_ITERATIONS, encrypted.iterations ?? DEFAULT_ITERATIONS),
  );
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext,
    );
    return parseVaultJson(bytesToUtf8(new Uint8Array(plaintext)));
  } catch {
    throw new Error('主密码错误或保险库已损坏');
  }
}

/** 把解密出来的 JSON 收敛成合法 Vault（容错导入脏数据）。 */
export function parseVaultJson(json: string): Vault {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('保险库内容不是合法 JSON');
  }
  if (parsed === null || typeof parsed !== 'object') throw new Error('保险库格式不正确');
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.items)) throw new Error('保险库缺少 items 数组');
  const items = root.items.map(normalizeItem).filter((item): item is VaultItem => item !== null);
  return { version: 1, items };
}

/** 安全清空内存中的字符串（尽力而为）。 */
export function wipeString(value: string | null): void {
  if (typeof value !== 'string' || typeof window === 'undefined') return;
  try {
    const arr = new Uint8Array(value.length * 2);
    const view = new DataView(arr.buffer);
    for (let i = 0; i < value.length; i += 1) view.setUint16(i * 2, value.charCodeAt(i), true);
  } catch {
    // 无法访问 JS 引擎内部内存，忽略
  }
}

function normalizeItem(item: unknown): VaultItem | null {
  if (item === null || typeof item !== 'object') return null;
  const raw = item as Record<string, unknown>;
  const type =
    typeof raw.type === 'string' &&
    (['login', 'card', 'note', 'api', 'otp'] as EntryType[]).includes(raw.type as EntryType)
      ? (raw.type as EntryType)
      : null;
  if (type === null) return null;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso();
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt;
  const base: VaultItem = {
    id: typeof raw.id === 'string' ? raw.id : createItemId(),
    type,
    title: typeof raw.title === 'string' ? raw.title : '未命名',
    createdAt: Number.isNaN(new Date(createdAt).getTime()) ? nowIso() : createdAt,
    updatedAt: Number.isNaN(new Date(updatedAt).getTime()) ? createdAt : updatedAt,
    favorite: raw.favorite === true,
  };
  if (type === 'login' && raw.login !== null && typeof raw.login === 'object') {
    const l = raw.login as Record<string, unknown>;
    base.login = {
      url: typeof l.url === 'string' ? l.url : undefined,
      username: typeof l.username === 'string' ? l.username : '',
      password: typeof l.password === 'string' ? l.password : '',
      notes: typeof l.notes === 'string' ? l.notes : undefined,
      tags: Array.isArray(l.tags) ? l.tags.filter((t): t is string => typeof t === 'string') : [],
      mfa: l.mfa === true,
    };
  }
  if (type === 'card' && raw.card !== null && typeof raw.card === 'object') {
    const c = raw.card as Record<string, unknown>;
    base.card = {
      name: typeof c.name === 'string' ? c.name : '',
      number: typeof c.number === 'string' ? c.number : '',
      holder: typeof c.holder === 'string' ? c.holder : '',
      expMonth: typeof c.expMonth === 'string' ? c.expMonth : '',
      expYear: typeof c.expYear === 'string' ? c.expYear : '',
      cvc: typeof c.cvc === 'string' ? c.cvc : '',
      brand: typeof c.brand === 'string' ? c.brand : undefined,
      notes: typeof c.notes === 'string' ? c.notes : undefined,
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    };
  }
  if (type === 'note' && raw.note !== null && typeof raw.note === 'object') {
    const n = raw.note as Record<string, unknown>;
    base.note = {
      title: typeof n.title === 'string' ? n.title : base.title,
      content: typeof n.content === 'string' ? n.content : '',
      tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === 'string') : [],
    };
  }
  if (type === 'api' && raw.api !== null && typeof raw.api === 'object') {
    const a = raw.api as Record<string, unknown>;
    base.api = {
      name: typeof a.name === 'string' ? a.name : base.title,
      keyId: typeof a.keyId === 'string' ? a.keyId : '',
      secret: typeof a.secret === 'string' ? a.secret : '',
      baseUrl: typeof a.baseUrl === 'string' ? a.baseUrl : undefined,
      notes: typeof a.notes === 'string' ? a.notes : undefined,
      tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === 'string') : [],
    };
  }
  if (type === 'otp' && raw.otp !== null && typeof raw.otp === 'object') {
    const o = raw.otp as Record<string, unknown>;
    base.otp = {
      name: typeof o.name === 'string' ? o.name : base.title,
      secret: typeof o.secret === 'string' ? o.secret : '',
      issuer: typeof o.issuer === 'string' ? o.issuer : undefined,
      digits: typeof o.digits === 'number' ? Math.max(4, Math.min(10, Math.round(o.digits))) : 6,
      period: typeof o.period === 'number' ? Math.max(10, Math.min(120, Math.round(o.period))) : 30,
      algorithm: o.algorithm === 'SHA256' || o.algorithm === 'SHA512' ? o.algorithm : 'SHA1',
      notes: typeof o.notes === 'string' ? o.notes : undefined,
      tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    };
  }
  return base;
}

/** 表单草稿：类型 + 标题 + 扁平字段表。 */
export interface ItemDraft {
  type: EntryType;
  title: string;
  fields: Record<string, string>;
}

/** 按草稿创建条目，各类型的默认值补齐。 */
export function createItem(draft: ItemDraft): VaultItem {
  const id = createItemId();
  const stamp = nowIso();
  const base = { id, type: draft.type, title: draft.title, createdAt: stamp, updatedAt: stamp, favorite: false };
  const f = draft.fields;
  const tags = splitTags(f.tags ?? '');
  switch (draft.type) {
    case 'login':
      return {
        ...base,
        login: {
          url: f.url ?? '',
          username: f.username ?? '',
          password: f.password ?? '',
          notes: f.notes ?? '',
          tags,
          mfa: f.mfa === 'on' || f.mfa === 'true',
        },
      };
    case 'card':
      return {
        ...base,
        card: {
          name: f.name ?? '',
          number: (f.number ?? '').replace(/\s+/g, ''),
          holder: f.holder ?? '',
          expMonth: f.expMonth ?? '',
          expYear: f.expYear ?? '',
          cvc: f.cvc ?? '',
          brand: f.brand ?? '',
          notes: f.notes ?? '',
          tags,
        },
      };
    case 'note':
      return { ...base, note: { title: draft.title, content: f.content ?? '', tags } };
    case 'api':
      return {
        ...base,
        api: {
          name: draft.title,
          keyId: f.keyId ?? '',
          secret: f.secret ?? '',
          baseUrl: f.baseUrl ?? '',
          notes: f.notes ?? '',
          tags,
        },
      };
    case 'otp':
      return {
        ...base,
        otp: {
          name: draft.title,
          secret: (f.secret ?? '').replace(/\s+/g, ''),
          issuer: f.issuer ?? '',
          digits: Number(f.digits ?? '6') || 6,
          period: Number(f.period ?? '30') || 30,
          algorithm: f.algorithm === 'SHA256' || f.algorithm === 'SHA512' ? f.algorithm : 'SHA1',
          notes: f.notes ?? '',
          tags,
        },
      };
  }
}

/** 用草稿覆盖条目中对应类型的字段。 */
export function updateItem(item: VaultItem, draft: ItemDraft, title: string): VaultItem {
  const fresh = createItem({ ...draft, title });
  fresh.id = item.id;
  fresh.createdAt = item.createdAt;
  fresh.updatedAt = nowIso();
  fresh.favorite = item.favorite;
  return fresh;
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

/** 搜索保险库条目。 */
export function searchVault(items: VaultItem[], query: string, types: EntryType[]): VaultItem[] {
  const key = query.trim().toLowerCase();
  return items
    .filter((item) => types.length === 0 || types.includes(item.type))
    .filter((item) => {
      if (key === '') return true;
      const parts: string[] = [item.title];
      if (item.login) {
        parts.push(item.login.username, item.login.url ?? '', item.login.notes ?? '', item.login.tags.join(' '));
      }
      if (item.card) {
        parts.push(item.card.name, item.card.holder, item.card.number, item.card.notes ?? '', item.card.tags.join(' '));
      }
      if (item.note) {
        parts.push(item.note.title, item.note.content, item.note.tags.join(' '));
      }
      if (item.api) {
        parts.push(item.api.name, item.api.keyId, item.api.notes ?? '', item.api.tags.join(' '));
      }
      if (item.otp) {
        parts.push(item.otp.name, item.otp.issuer ?? '', item.otp.notes ?? '', item.otp.tags.join(' '));
      }
      return parts.join('\n').toLowerCase().includes(key);
    })
    .sort(
      (a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.title.localeCompare(b.title),
    );
}

/** 导出明文 JSON（风险提示由 UI 负责）。 */
export function exportVaultPlain(vault: Vault): string {
  return JSON.stringify(vault, null, 2);
}

/** 从明文本 JSON 导入，保留 ID 或重新生成。 */
export function importVaultPlain(json: string): Vault {
  try {
    const parsed = JSON.parse(json) as unknown;
    const root = parsed === null || typeof parsed !== 'object' ? {} : (parsed as Record<string, unknown>);
    const items: VaultItem[] = Array.isArray(root.items)
      ? root.items.map(normalizeItem).filter((item): item is VaultItem => item !== null)
      : [];
    return { version: 1, items };
  } catch {
    throw new Error('导入的 JSON 格式不正确');
  }
}

/** 写入加密后的保险库（只存密文、盐、IV 与迭代次数）。 */
export function saveEncrypted(encrypted: EncryptedVault): void {
  window.localStorage.setItem(VAULT_KEY, JSON.stringify(encrypted));
}

/** 读取本地加密保险库；不存在或损坏时返回 null。 */
export function loadEncrypted(): EncryptedVault | null {
  const raw = window.localStorage.getItem(VAULT_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const blob = parsed as Record<string, unknown>;
    if (typeof blob.ciphertext !== 'string' || typeof blob.salt !== 'string' || typeof blob.iv !== 'string')
      return null;
    return {
      version: 1,
      iterations: typeof blob.iterations === 'number' ? blob.iterations : DEFAULT_ITERATIONS,
      salt: blob.salt,
      iv: blob.iv,
      ciphertext: blob.ciphertext,
    };
  } catch {
    return null;
  }
}

export function hasVault(): boolean {
  return loadEncrypted() !== null;
}

export function dropVault(): void {
  window.localStorage.removeItem(VAULT_KEY);
}
