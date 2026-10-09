import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  type BcryptParts,
  COST_DEFAULT,
  COST_MAX,
  COST_MIN,
  costIterations,
  costLabel,
  hashPassword,
  parseBcryptHash,
  SEGMENT_NOTES,
  TEST_VECTORS,
  truncationNote,
  type VerifyResult,
  verifyPassword,
} from '../lib/bcrypt';
import { downloadText } from '../lib/file';

type Mode = 'generate' | 'verify';

const COST_OPTIONS = Array.from({ length: COST_MAX - COST_MIN + 1 }, (_, index) => {
  const cost = COST_MIN + index;
  return { value: String(cost), label: `cost ${cost}（2^${cost} 轮 · ${costLabel(cost)}）` };
});

export default function BcryptTool() {
  const [mode, setMode] = useState<Mode>('generate');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [cost, setCost] = useState(COST_DEFAULT);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyHash, setVerifyHash] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const parts = hash ? parseBcryptHash(hash) : null;
  const truncation = truncationNote(password);

  const generate = async () => {
    if (password === '') return;
    setBusy(true);
    try {
      setHash(await hashPassword(password, cost));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (verifyInput === '' && verifyHash.trim() === '') return;
    setResult(await verifyPassword(verifyInput, verifyHash));
  };

  const reset = () => {
    setPassword('');
    setHash('');
    setVerifyHash('');
    setVerifyInput('');
    setResult(null);
    setVisible(false);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Bcrypt 口令哈希
        </span>
      }
      description="bcrypt 是为口令存储设计的慢哈希：自带随机盐、内置 salt，成本可调"
      actions={
        <>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value === 'verify' ? 'verify' : 'generate')}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="generate" active={mode === 'generate'}>
                生成
              </TabsTrigger>
              <TabsTrigger value="verify" active={mode === 'verify'}>
                校验
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <ClearButton onClick={reset} />
        </>
      }
    >
      <div className="grid  flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <Section
          title={mode === 'generate' ? '明文口令' : '待校验数据'}
          description={mode === 'generate' ? '哈希后无法还原，请自行妥善保存' : '粘贴数据库或用户表中的 bcrypt 哈希'}
        >
          {mode === 'generate' ? (
            <>
              <Field label="口令" hint="明文只在内存中参与计算，不会被发送或持久化">
                <span className="flex items-center gap-1.5">
                  <Input
                    type={visible ? 'text' : 'password'}
                    value={password}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="输入要哈希的口令"
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={visible ? '隐藏口令' : '显示口令'}
                    className="size-8 shrink-0"
                    onClick={() => setVisible((prev) => !prev)}
                  >
                    {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </span>
              </Field>
              <Select
                label="cost 代价因子"
                value={String(cost)}
                options={COST_OPTIONS}
                onChange={(value) => setCost(Number(value))}
                hint="cost 每加 1 计算量翻倍；10 约 50~150ms，12 更安全但登录更慢"
              />
              {truncation && (
                <Note tone="warn" title="口令超长">
                  {truncation}
                </Note>
              )}
              <Button
                size="sm"
                className="self-start"
                disabled={password === '' || busy}
                onClick={() => void generate()}
              >
                <KeyRound className="size-3.5" />
                {busy ? '计算中…' : '生成哈希'}
              </Button>
            </>
          ) : (
            <>
              <Field label="bcrypt 哈希" hint="形如 $2b$10$[22 字符盐][31 字符哈希]，共 60 字符">
                <Textarea
                  value={verifyHash}
                  onChange={(event) => setVerifyHash(event.target.value)}
                  placeholder="$2b$10$..."
                  spellCheck={false}
                  className="min-h-20 resize-none font-mono text-xs"
                />
              </Field>
              <Field label="明文口令" hint="只与哈希比对，不会被保存">
                <Input
                  type={visible ? 'text' : 'password'}
                  value={verifyInput}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="输入要校验的口令"
                  onChange={(event) => setVerifyInput(event.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <Button
                size="sm"
                className="self-start"
                disabled={(verifyInput === '' && verifyHash.trim() === '') || busy}
                onClick={() => void verify()}
              >
                {busy ? '校验中…' : '校验比对'}
              </Button>
            </>
          )}
        </Section>

        <Section title="结果" description="复制后直接存入数据库即可，无需再拼接盐">
          {mode === 'generate' ? (
            <>
              <ResultBox
                label="bcrypt 哈希"
                value={hash}
                onCopy={hash ? () => copyText(hash) : undefined}
                rows="min-h-16"
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hash}
                  onClick={() => copyText(hash)}
                  aria-label="复制哈希"
                >
                  <Copy className="size-3.5" />
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hash}
                  onClick={() => downloadText('bcrypt-hash.txt', `${hash}\n`)}
                  aria-label="下载哈希为 txt 文件"
                >
                  <Download className="size-3.5" />
                  下载 txt
                </Button>
              </div>
              {parts ? <HashStructure parts={parts} /> : <EmptyHint>生成哈希后这里会展示结构拆解</EmptyHint>}
            </>
          ) : (
            <VerifyPanel result={result} />
          )}
        </Section>
      </div>

      <Section>
        <Note tone="info" title="为什么不需要自己拼盐">
          bcrypt 的哈希串里已经包含随机盐（22 字符）与 cost。保存时只需存整串，校验时把盐从串里拆出来复用即可。
          如果自己再拼一层盐或用 <code>MD5(password + salt)</code> 这类快速哈希，攻击者可以用显卡高速穷举，bcrypt
          的慢速特性正是抗暴力破解的关键。
        </Note>

        <Note tone="warn" title="使用边界">
          bcrypt 只能做口令校验，不能解密、不能签发令牌，也不能用于文件完整性校验（那是 SHA-256 的场景）。 口令超过 72
          字节会被静默截断，务必配合服务端的长度限制。
        </Note>
      </Section>

      <Section
        title={
          <span className="flex items-center gap-1.5">
            <FlaskConical className="size-3.5" />
            测试向量
          </span>
        }
        description="公开的已知答案，可用于自检实现是否正确"
      >
        <ul className="flex flex-col gap-1.5">
          {TEST_VECTORS.map((vector) => (
            <li key={vector.hash} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {vector.label}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]" title={vector.hash}>
                {vector.hash}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px]"
                onClick={() => {
                  setMode('verify');
                  setVerifyHash(vector.hash);
                  setVerifyInput(vector.password);
                  setResult(null);
                }}
              >
                填入校验
              </Button>
            </li>
          ))}
        </ul>
        <Hint>点击「填入校验」后执行校验比对，能匹配即说明 bcrypt 实现与公开向量一致。</Hint>
      </Section>

      {SEGMENT_NOTES.map((note) => (
        <Section key={note.title} title={note.title}>
          <Hint>{note.body}</Hint>
        </Section>
      ))}
    </ToolPanel>
  );
}

function HashStructure({ parts }: { parts: BcryptParts }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5">{parts.algorithm}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{String(parts.cost).padStart(2, '0')}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">{parts.salt}</span>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">{parts.digest}</span>
      </div>
      <StatGrid className="lg:grid-cols-2">
        <Stat
          label="算法版本"
          value={parts.algorithm}
          hint={parts.algorithm === '$2b$' ? '推荐的修复版本' : '历史版本，注意兼容性'}
        />
        <Stat
          label="cost"
          value={String(parts.cost)}
          hint={`${costIterations(parts.cost).toLocaleString('zh-CN')} 轮迭代`}
        />
        <Stat label="盐长度" value={`${parts.salt.length} 字符`} hint="128 位随机盐" />
        <Stat label="哈希长度" value={`${parts.digest.length} 字符`} hint="184 位输出" />
      </StatGrid>
    </div>
  );
}

function VerifyPanel({ result }: { result: VerifyResult | null }) {
  if (!result) return <EmptyHint>输入哈希与口令后点击「校验比对」</EmptyHint>;
  if (result.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span className="break-all">{result.error}</span>
      </div>
    );
  }
  if (!result.matched) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>❌ 不匹配：口令与哈希不是同一份数据，或口令输入有误。</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5 shrink-0" />✅ 匹配：口令正确
      </div>
      <StatGrid className="lg:grid-cols-2">
        <Stat
          label="cost"
          value={String(result.parts?.cost ?? '-')}
          hint={costLabel(result.parts?.cost ?? COST_DEFAULT)}
        />
        <Stat label="迭代次数" value={costIterations(result.parts?.cost ?? 0).toLocaleString('zh-CN')} hint="2^cost" />
      </StatGrid>
    </div>
  );
}
