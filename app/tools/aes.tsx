import { Copy, Download, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Field, NumberField, Select } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  type Bytes,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  hexToBytes,
  isHex,
  randomBytes,
  toBytes,
  utf8ToBytes,
} from '../lib/bytes';
import { DES_TEST_VECTOR, desCbcDecrypt, desCbcEncrypt, isWeakDesKey, tripleDesKind } from '../lib/des';
import { downloadText } from '../lib/file';

type Mode = 'encrypt' | 'decrypt';
type KeyMode = 'password' | 'raw';

interface CipherSpec {
  label: string;
  /** 放入密文头部的稳定标识。 */
  id: string;
  ivBytes: number;
  keyBytes: number[];
  note: string;
  /** WebCrypto 不支持，走内置纯 TS 实现。 */
  local?: boolean;
}

const CIPHERS: CipherSpec[] = [
  {
    id: 'AES-GCM',
    label: 'AES-GCM（128/192/256）',
    ivBytes: 12,
    keyBytes: [16, 24, 32],
    note: '推荐：加密与完整性校验一体，密文自带 128 位认证标签',
  },
  {
    id: 'AES-CBC',
    label: 'AES-CBC（128/192/256）',
    ivBytes: 16,
    keyBytes: [16, 24, 32],
    note: '兼容性最好，但没有认证能力，必须配合 HMAC 或改用 GCM',
  },
  {
    id: '3DES-CBC',
    label: 'TripleDES-CBC（16/24 字节密钥）',
    ivBytes: 8,
    keyBytes: [16, 24],
    note: '遗留系统对接：EDE 三重加密，16 字节密钥时 K3 = K1',
    local: true,
  },
  {
    id: 'DES-CBC',
    label: 'DES-CBC（8 字节密钥）',
    ivBytes: 8,
    keyBytes: [8],
    note: '已被彻底破译，只为兼容老系统，请改用 3DES 或 AES',
    local: true,
  },
];

const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_SALT_BYTES = 16;
const MIN_ITERATIONS = 10_000;
const MAX_ITERATIONS = 2_000_000;

/**
 * 参数头：MAGIC | 密钥模式 | 盐长 | IV 长 | 算法序号 | 密钥长 [| PBKDF2 迭代数（CT3 起）]
 *
 * CT2 为 8 字节头，不含迭代次数，解密时只能取界面上的当前值；
 * CT3 扩为 11 字节并把迭代次数写进密文，避免自定义迭代次数后无法复现。
 */
const MAGIC_CT2 = [0x43, 0x54, 0x32];
const MAGIC_CT3 = [0x43, 0x54, 0x33];
const HEADER_BYTES_CT2 = 8;
const HEADER_BYTES_CT3 = 11;

interface CryptoParams {
  cipher: string;
  keyBytes: number;
  ivHex: string;
  saltBase64: string;
  iterations: number;
  keyMode: KeyMode;
}

interface Unpacked {
  cipher: CipherSpec;
  keyMode: KeyMode;
  keyBytes: number;
  salt: Bytes;
  iv: Bytes;
  body: Bytes;
  /** 密文头里记录的迭代次数；CT2 密文为 null，需回退到界面值。 */
  iterations: number | null;
}

function cipherById(id: string): CipherSpec {
  const found = CIPHERS.find((item) => item.id === id);
  if (!found) throw new Error('密文中的算法标识无法识别，可能不是本工具生成的密文');
  return found;
}

function cipherIndex(cipher: CipherSpec): number {
  const index = CIPHERS.indexOf(cipher);
  if (index === -1) throw new Error('未知算法');
  return index;
}

/** 口令模式使用算法允许的最长密钥；直接密钥模式按用户输入长度。 */
function resolveKeyBytes(cipher: CipherSpec, keyMode: KeyMode, hexKey: string): number {
  if (keyMode === 'raw' && isHex(hexKey)) return hexToBytes(hexKey).length;
  return cipher.keyBytes[cipher.keyBytes.length - 1]!;
}

function keyHint(cipher: CipherSpec, keyMode: KeyMode): string {
  if (keyMode === 'raw') {
    return `十六进制，长度 ${cipher.keyBytes.map((n) => n * 2).join(' 或 ')} 个字符（${cipher.keyBytes.join('/')} 字节）`;
  }
  return `PBKDF2-SHA256 派生为 ${cipher.keyBytes[cipher.keyBytes.length - 1]! * 8} 位密钥，盐值随密文一起输出`;
}

function pack(
  cipher: CipherSpec,
  keyMode: KeyMode,
  keyBytes: number,
  salt: Bytes,
  iv: Bytes,
  body: Bytes,
  iterations: number,
): Bytes {
  const header = new Uint8Array(HEADER_BYTES_CT3);
  header.set(MAGIC_CT3, 0);
  header[3] = keyMode === 'password' ? 1 : 0;
  header[4] = salt.length;
  header[5] = iv.length;
  header[6] = cipherIndex(cipher);
  header[7] = keyBytes;
  // 迭代次数最多 2,000,000，3 字节足够
  header[8] = (iterations >>> 16) & 0xff;
  header[9] = (iterations >>> 8) & 0xff;
  header[10] = iterations & 0xff;
  return concatBytes(header, salt, iv, body);
}

function unpack(raw: Bytes): Unpacked {
  const isV3 = raw[0] === MAGIC_CT3[0] && raw[1] === MAGIC_CT3[1] && raw[2] === MAGIC_CT3[2];
  const isV2 = raw[0] === MAGIC_CT2[0] && raw[1] === MAGIC_CT2[1] && raw[2] === MAGIC_CT2[2];
  if (!isV2 && !isV3) {
    throw new Error('不是本工具生成的密文：缺少 CT2/CT3 参数头');
  }
  const headerBytes = isV3 ? HEADER_BYTES_CT3 : HEADER_BYTES_CT2;
  if (raw.length <= headerBytes) throw new Error('密文长度不足，无法拆分参数头与 IV');
  const keyMode: KeyMode = raw[3] === 1 ? 'password' : 'raw';
  const saltLength = raw[4]!;
  const ivLength = raw[5]!;
  const cipher = cipherById(CIPHERS[raw[6]!]?.id ?? '');
  const keyBytes = raw[7]!;
  if (!cipher.keyBytes.includes(keyBytes)) {
    throw new Error(`密文头记录的密钥长度 ${keyBytes} 字节与 ${cipher.id} 不符，密文可能被篡改`);
  }
  const salt = raw.subarray(headerBytes, headerBytes + saltLength);
  const iv = raw.subarray(headerBytes + saltLength, headerBytes + saltLength + ivLength);
  const body = raw.subarray(headerBytes + saltLength + ivLength);
  if (salt.length !== saltLength || iv.length !== ivLength) {
    throw new Error('密文长度不足以容纳参数头中记录的盐与 IV，密文可能被截断');
  }
  if (keyMode === 'password' && saltLength !== PBKDF2_SALT_BYTES) throw new Error('盐值长度异常，密文可能被截断');
  if (iv.length !== cipher.ivBytes) throw new Error('IV 长度与算法不匹配，密文可能被截断');
  if (body.length === 0) throw new Error('密文正文为空');
  const iterations = isV3 ? ((raw[8]! << 16) | (raw[9]! << 8) | raw[10]!) >>> 0 : null;
  if (iterations !== null && (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS)) {
    throw new Error(`密文头记录的 PBKDF2 迭代次数 ${iterations} 超出允许范围`);
  }
  return { cipher, keyMode, keyBytes, salt, iv, body, iterations };
}

/** AES 走 WebCrypto；DES/3DES 走内置实现。 */
async function runAes(
  action: 'encrypt' | 'decrypt',
  cipher: CipherSpec,
  key: CryptoKey,
  iv: Bytes,
  data: Bytes,
): Promise<Bytes> {
  const algo: AesGcmParams | AesCbcParams =
    cipher.id === 'AES-GCM'
      ? { name: 'AES-GCM', iv: toBytes(iv), tagLength: 128 }
      : { name: 'AES-CBC', iv: toBytes(iv) };
  const buffer =
    action === 'encrypt'
      ? await crypto.subtle.encrypt(algo, key, toBytes(data))
      : await crypto.subtle.decrypt(algo, key, toBytes(data));
  return new Uint8Array(buffer);
}

async function runLocal(action: 'encrypt' | 'decrypt', key: Bytes, iv: Bytes, data: Bytes): Promise<Bytes> {
  return action === 'encrypt' ? desCbcEncrypt(key, iv, data) : desCbcDecrypt(key, iv, data);
}

export default function AesTool() {
  const [mode, setMode] = useState<Mode>('encrypt');
  const [cipher, setCipher] = useState<CipherSpec>(CIPHERS[0]!);
  const [input, setInput] = useState('');
  const [keyMode, setKeyMode] = useState<KeyMode>('password');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [hexKey, setHexKey] = useState('');
  const [hexIv, setHexIv] = useState('');
  const [iterations, setIterations] = useState(PBKDF2_ITERATIONS);
  const [output, setOutput] = useState('');
  const [params, setParams] = useState<CryptoParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 解密模式下算法与密钥模式以密文头为准，避免用错下拉框里的设置
  const preview = useMemo(() => {
    if (mode !== 'decrypt' || input.trim() === '') return null;
    try {
      return unpack(base64ToBytes(input));
    } catch {
      return null;
    }
  }, [mode, input]);
  const activeCipher = preview?.cipher ?? cipher;
  const activeKeyMode = preview?.keyMode ?? keyMode;
  const lockedByHeader = mode === 'decrypt' && preview !== null;

  const resolvedKeyBytes = resolveKeyBytes(activeCipher, activeKeyMode, hexKey);
  const keyState = rawKeyState(activeCipher, resolvedKeyBytes);

  const reset = () => {
    setInput('');
    setOutput('');
    setParams(null);
    setError(null);
  };

  /** 取出密钥材料；直接密钥模式按目标算法校验长度。 */
  const resolveKey = (target: CipherSpec, targetMode: KeyMode): Bytes => {
    if (targetMode === 'password') {
      if (password === '') throw new Error('请输入口令');
      return utf8ToBytes(password);
    }
    if (!isHex(hexKey)) throw new Error('密钥必须是十六进制文本');
    const key = hexToBytes(hexKey);
    if (!target.keyBytes.includes(key.length)) {
      throw new Error(`${target.label} 的密钥长度必须是 ${target.keyBytes.join(' 或 ')} 字节，当前 ${key.length} 字节`);
    }
    return key;
  };

  const resolveIv = (): Bytes => {
    if (hexIv.trim() === '') return randomBytes(cipher.ivBytes);
    if (!isHex(hexIv)) throw new Error('IV 必须是十六进制文本');
    const iv = hexToBytes(hexIv);
    if (iv.length !== cipher.ivBytes) {
      throw new Error(`${cipher.label} 的 IV 必须是 ${cipher.ivBytes} 字节，当前 ${iv.length} 字节`);
    }
    return iv;
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'encrypt') {
        const iv = resolveIv();
        const salt = keyMode === 'password' ? randomBytes(PBKDF2_SALT_BYTES) : new Uint8Array(0);
        const material = resolveKey(cipher, keyMode);
        const keyBytes = keyMode === 'raw' ? material.length : resolveKeyBytes(cipher, keyMode, hexKey);
        const body = await process(
          'encrypt',
          cipher,
          keyMode,
          material,
          salt,
          iv,
          utf8ToBytes(input),
          iterations,
          keyBytes,
        );
        setOutput(bytesToBase64(pack(cipher, keyMode, keyBytes, salt, iv, body, iterations)));
        setParams({
          cipher: cipher.id,
          keyBytes,
          ivHex: bytesToHex(iv),
          saltBase64: salt.length > 0 ? bytesToBase64(salt) : '未使用（直接密钥模式）',
          iterations: keyMode === 'password' ? iterations : 0,
          keyMode,
        });
      } else {
        const parsed = unpack(base64ToBytes(input));
        const material = resolveKey(parsed.cipher, parsed.keyMode);
        // CT3 密文自带迭代次数；CT2 只能回退到界面上的当前值。
        const effectiveIterations = parsed.iterations ?? iterations;
        const body = await process(
          'decrypt',
          parsed.cipher,
          parsed.keyMode,
          material,
          parsed.salt,
          parsed.iv,
          parsed.body,
          effectiveIterations,
          parsed.keyBytes,
        );
        setOutput(bytesToUtf8(body, true));
        setParams({
          cipher: parsed.cipher.id,
          keyBytes: parsed.keyBytes,
          ivHex: bytesToHex(parsed.iv),
          saltBase64: parsed.salt.length > 0 ? bytesToBase64(parsed.salt) : '未使用（直接密钥模式）',
          iterations: parsed.keyMode === 'password' ? effectiveIterations : 0,
          keyMode: parsed.keyMode,
        });
      }
    } catch (err) {
      setOutput('');
      setParams(null);
      setError(mode === 'decrypt' ? decryptError(err) : messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = input.length > 0 && (activeKeyMode === 'raw' ? hexKey.trim().length > 0 : password.length > 0);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          {mode === 'encrypt' ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          对称加解密
        </span>
      }
      description="AES-GCM / AES-CBC 使用 WebCrypto，DES-CBC / 3DES-CBC 使用内置纯 TS 实现"
      actions={
        <>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value === 'decrypt' ? 'decrypt' : 'encrypt')}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="encrypt" active={mode === 'encrypt'}>
                加密
              </TabsTrigger>
              <TabsTrigger value="decrypt" active={mode === 'decrypt'}>
                解密
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            ariaLabel="选择算法"
            value={activeCipher.id}
            options={CIPHERS.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(value) => {
              if (!lockedByHeader) setCipher(cipherById(value));
            }}
            selectClassName="h-7 w-auto text-xs"
            disabled={lockedByHeader}
          />
        </>
      }
    >
      <Note tone={activeCipher.local ? 'warn' : 'info'} title={activeCipher.id}>
        {activeCipher.local
          ? `当前浏览器的 crypto.subtle 只支持 AES 系列，DES 家族改用内置实现（FIPS 46-3 表格）。${activeCipher.note}。`
          : `${activeCipher.note} · 口令模式使用 PBKDF2-SHA256 ${iterations.toLocaleString('zh-CN')} 次迭代。`}
      </Note>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <Section title={mode === 'encrypt' ? '明文' : '密文（Base64）'}>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === 'encrypt' ? '要加密的文本' : '粘贴本工具生成的 Base64 密文'}
            spellCheck={false}
            className="min-h-32 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" disabled={!ready || busy} onClick={() => void run()}>
              {busy ? '处理中…' : mode === 'encrypt' ? '加密' : '解密'}
            </Button>
            <Button size="sm" variant="outline" disabled={!output} onClick={() => setInput(output)}>
              回填为输入
            </Button>
            <ClearButton onClick={reset} disabled={!input && !output} />
          </div>
        </Section>

        <Section title="结果">
          <ResultBox
            label={mode === 'encrypt' ? '密文（Base64）' : '明文'}
            value={output}
            error={error}
            onCopy={output ? () => copyText(output) : undefined}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!output}
              onClick={() => copyText(output)}
              aria-label="复制结果"
            >
              <Copy className="size-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!output}
              onClick={() => downloadText('cipher-text.txt', `${output}\n`)}
              aria-label="下载结果为 txt 文件"
            >
              <Download className="size-3.5" />
              下载
            </Button>
          </div>
          {params ? <ParamPanel params={params} /> : <EmptyHint>执行一次加解密后这里会显示可复现的参数</EmptyHint>}
        </Section>
        <Section title="密钥与 IV" description="直接密钥模式按算法要求校验长度，口令模式自动派生固定长度">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Select
              label="密钥模式"
              value={activeKeyMode}
              options={[
                { value: 'password', label: '口令派生（PBKDF2）' },
                { value: 'raw', label: '直接输入密钥（十六进制）' },
              ]}
              onChange={(value) => setKeyMode(value === 'raw' ? 'raw' : 'password')}
              disabled={lockedByHeader}
              hint={lockedByHeader ? '由密文的参数头决定，不可切换' : undefined}
            />
            {activeKeyMode === 'password' ? (
              <Field label="口令" hint={keyHint(activeCipher, activeKeyMode)}>
                <span className="flex items-center gap-1.5">
                  <Input
                    type={visible ? 'text' : 'password'}
                    value={password}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="输入加解密口令"
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0"
                    aria-label={visible ? '隐藏口令' : '显示口令'}
                    onClick={() => setVisible((prev) => !prev)}
                  >
                    {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </span>
              </Field>
            ) : (
              <Field label="密钥（十六进制）" hint={keyHint(activeCipher, activeKeyMode)}>
                <Input
                  value={hexKey}
                  spellCheck={false}
                  placeholder={activeCipher.keyBytes.map((n) => String(n * 2)).join(' 或 ')}
                  onChange={(event) => setHexKey(event.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
            )}
            <Field
              label="IV（十六进制，可选）"
              hint={
                lockedByHeader
                  ? `解密使用密文头里的 IV（${activeCipher.ivBytes} 字节），此处不可修改`
                  : `留空则随机生成 ${activeCipher.ivBytes} 字节 IV`
              }
            >
              <Input
                value={hexIv}
                spellCheck={false}
                disabled={lockedByHeader}
                placeholder={lockedByHeader ? '来自密文' : '留空随机生成'}
                onChange={(event) => setHexIv(event.target.value)}
                className="h-8 font-mono text-xs"
              />
            </Field>
            {activeKeyMode === 'password' && (
              <NumberField
                label="PBKDF2 迭代次数"
                value={iterations}
                min={MIN_ITERATIONS}
                max={MAX_ITERATIONS}
                step={10_000}
                onChange={(value) =>
                  setIterations(
                    Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.round(value) || PBKDF2_ITERATIONS)),
                  )
                }
                hint="解密时需与加密时一致；OWASP 建议 SHA-256 不低于 600,000 次"
              />
            )}
          </div>
          {activeKeyMode === 'raw' && isHex(hexKey) && (
            <Hint>
              {keyState.ok
                ? `密钥长度 ${keyState.length} 字节，符合 ${activeCipher.label} 要求。`
                : `密钥长度 ${keyState.length} 字节不符：${activeCipher.label} 需要 ${activeCipher.keyBytes.join(' 或 ')} 字节。`}
            </Hint>
          )}
          {activeCipher.local &&
            activeKeyMode === 'raw' &&
            keyState.ok &&
            keyState.length === 8 &&
            isWeakDesKey(hexToBytes(hexKey)) && (
              <Note tone="danger" title="弱密钥">
                这是 DES 的公开已知弱密钥，安全性显著下降，请勿用于真实数据。
              </Note>
            )}
          {activeCipher.local && activeKeyMode === 'raw' && keyState.ok && keyState.length === 24 && (
            <Hint>
              按 {tripleDesKind(hexToBytes(hexKey))} 处理：K1 / K2 / K3 为密钥的前、中、后 8 字节，16 字节密钥时 K3 =
              K1。
            </Hint>
          )}
        </Section>

        <Section>
          <Note tone="warn" title="CBC 模式必须自己补认证">
            CBC 只保证机密性，不保证完整性：攻击者可以翻转密文位，解密会得到被篡改的明文（padding oracle
            攻击即源于此）。 正确做法是 Encrypt-then-MAC —— 先 AES-CBC 加密，再对 [IV || 密文] 计算 HMAC-SHA256
            并把标签一并保存； 或直接改用 GCM，GCM 自带认证标签，校验失败会直接报错。
          </Note>

          <Note tone="info" title="DES 降级与自测">
            WebCrypto 不提供 DES/3DES，本扩展内置了纯 TS 实现，并用 NIST 向量自测：密钥 0x{DES_TEST_VECTOR.key}、 明文 “
            {DES_TEST_VECTOR.plain}” → 密文 0x{DES_TEST_VECTOR.cipher}。DES 分组仅 56
            位有效密钥且已被公开破解，仅用于遗留系统互通。
          </Note>
        </Section>
      </div>
    </ToolPanel>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function decryptError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const message = messageOf(err);
  // WebCrypto 在 GCM 认证失败与 CBC 填充错误时统一抛 OperationError
  if (name === 'OperationError' || /operation-specific reason/i.test(message)) {
    return '解密失败：口令错误或密文被篡改（GCM 认证标签校验失败或 CBC 填充校验未通过）';
  }
  if (message.includes('填充无效')) {
    return '解密失败：口令错误或密文被篡改（DES-CBC 填充校验未通过）';
  }
  if (message.includes('不支持') || message.includes('Unsupported') || message.includes('not supported')) {
    return '解密失败：当前浏览器不支持该算法，请改用 AES-GCM 或 AES-CBC';
  }
  if (message.includes('不是') || message.includes('不匹配') || message.includes('长度')) {
    return `解密失败：${message}`;
  }
  return `解密失败：口令错误或密文被篡改（${message}）`;
}

function rawKeyState(cipher: CipherSpec, length: number): { ok: boolean; length: number } {
  return { ok: cipher.keyBytes.includes(length), length };
}

/** 统一调度：口令模式走 PBKDF2，直接密钥模式直接使用原始密钥。 */
async function process(
  action: 'encrypt' | 'decrypt',
  cipher: CipherSpec,
  keyMode: KeyMode,
  material: Bytes,
  salt: Bytes,
  iv: Bytes,
  data: Bytes,
  iterations: number,
  keyBytes: number,
): Promise<Bytes> {
  const bits = keyBytes * 8;
  if (keyMode === 'password') {
    const base = await crypto.subtle.importKey('raw', toBytes(material), 'PBKDF2', false, ['deriveBits']);
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: toBytes(salt), iterations, hash: 'SHA-256' }, base, bits),
    );
    if (cipher.local) return runLocal(action, derived, iv, data);
    const key = await crypto.subtle.importKey('raw', toBytes(derived), cipher.id, false, ['encrypt', 'decrypt']);
    return runAes(action, cipher, key, iv, data);
  }
  if (cipher.local) return runLocal(action, material, iv, data);
  const key = await crypto.subtle.importKey('raw', toBytes(material), cipher.id, false, ['encrypt', 'decrypt']);
  return runAes(action, cipher, key, iv, data);
}

function ParamPanel({ params }: { params: CryptoParams }) {
  return (
    <div className="flex flex-col gap-2">
      <StatGrid className="lg:grid-cols-2">
        <Stat label="算法" value={params.cipher} hint={params.keyMode === 'password' ? '口令派生' : '直接密钥'} />
        <Stat label="密钥长度" value={`${params.keyBytes} 字节`} hint={`${params.keyBytes * 8} 位`} />
        <Stat label="IV" value={params.ivHex} hint="十六进制，随密文输出" />
        <Stat
          label="PBKDF2 迭代"
          value={params.iterations > 0 ? params.iterations.toLocaleString('zh-CN') : '—'}
          hint={params.iterations > 0 ? '解密时需一致' : '直接密钥模式不涉及'}
        />
      </StatGrid>
      <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-2.5 py-2">
        <span className="text-[10px] text-muted-foreground">盐值（Base64，解密时需要）</span>
        <code className="break-all font-mono text-[11px]">{params.saltBase64}</code>
      </div>
      <Hint>
        密文自带 CT3 参数头（算法、密钥模式、盐、IV、密钥长度、PBKDF2
        迭代次数），解密时全部自动读取；跨系统对接时把这一串一并传递即可。
      </Hint>
    </div>
  );
}
