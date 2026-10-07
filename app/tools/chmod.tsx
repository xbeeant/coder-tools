import { FolderLock, Info, KeyRound, Lock, ShieldAlert, SlidersHorizontal, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  assessRisks,
  BIT_LABEL,
  buildBatchScript,
  buildChmodCommand,
  COMMON_UMASKS,
  createMode,
  explainBits,
  fromOctal,
  fromUmask,
  type Mode,
  modeValue,
  PRESETS,
  parseChmodCommand,
  parseModeText,
  permissionsValue,
  type RiskItem,
  specialBitsOf,
  type Triplet,
  toAcl,
  toOctal,
  toShortOctal,
  toSymbolic,
  WHO_LABEL,
  WHO_LIST,
  type Who,
} from '../lib/chmod';

type MainTab = 'calc' | 'batch' | 'reverse' | 'umask';

const RISK_TONE: Record<RiskItem['level'], string> = {
  danger: 'border-destructive/60 bg-destructive/5',
  warn: 'border-amber-500/60 bg-amber-500/5',
  info: 'border-primary/60 bg-primary/5',
};

function TripletRow({
  who,
  triplet,
  onToggle,
}: {
  who: Who;
  triplet: Triplet;
  onToggle: (who: Who, bit: 'r' | 'w' | 'x', value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-2.5 py-2">
      <span className="w-20 shrink-0 text-xs font-medium">{WHO_LABEL[who]}</span>
      {(['r', 'w', 'x'] as const).map((bit) => (
        <label key={bit} className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={triplet[bit]}
            onChange={(event) => onToggle(who, bit, event.target.checked)}
            className="size-3.5 accent-primary"
          />
          <span className="font-mono">{bit}</span>
          <span className="text-muted-foreground">{BIT_LABEL[bit].name}</span>
          <span className="text-muted-foreground">({BIT_LABEL[bit].value})</span>
        </label>
      ))}
    </div>
  );
}

function RiskList({ items }: { items: RiskItem[] }) {
  if (items.length === 0) {
    return (
      <Note tone="success" title="未发现常见风险">
        该权限组合没有触发内置的安全提示规则；仍需结合业务场景判断。
      </Note>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li
          key={item.title}
          className={`rounded-md border border-l-2 px-2.5 py-1.5 text-[11px] ${RISK_TONE[item.level]}`}
        >
          <p className="font-medium">
            {item.level === 'danger' ? '高危 · ' : item.level === 'warn' ? '警告 · ' : '提示 · '}
            {item.title}
          </p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}

const DEFAULT_TARGET = 'app.conf';
const DEFAULT_BATCH = `# 每行一个路径，空行与 # 开头的行会被忽略
./src/app.conf
./src/db.conf
./deploy/nginx/site.conf`;

const REVERSE_SAMPLE = 'chmod -R u+x,go-w ./deploy';

export default function ChmodTool() {
  const [tab, setTab] = useState<MainTab>('calc');
  const [mode, setMode] = useState<Mode>(() => fromOctal('0755') ?? createMode());
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [directory, setDirectory] = useState(false);
  const [recursive, setRecursive] = useState(false);
  const [useSymbolic, setUseSymbolic] = useState(false);
  const [manualInput, setManualInput] = useState('0755');
  const [manualError, setManualError] = useState<string | null>(null);
  const [batchInput, setBatchInput] = useState(DEFAULT_BATCH);
  const [batchRecursive, setBatchRecursive] = useState(true);
  const [batchDirectory, setBatchDirectory] = useState(false);
  const [reverseInput, setReverseInput] = useState(REVERSE_SAMPLE);
  const [umaskInput, setUmaskInput] = useState('022');

  const toggle = (who: Who, bit: 'r' | 'w' | 'x', value: boolean) => {
    setMode((prev) => ({ ...prev, [who]: { ...prev[who], [bit]: value } }));
  };

  const octal = toOctal(mode);
  const short = toShortOctal(mode);
  const symbolic = toSymbolic(mode);
  const acl = toAcl(mode);
  const decimal = modeValue(mode);
  const bits = useMemo(() => explainBits(mode), [mode]);
  const risks = useMemo(() => assessRisks(mode, directory), [directory, mode]);
  const specials = useMemo(() => specialBitsOf(mode), [mode]);
  const commands = useMemo(
    () =>
      [
        buildChmodCommand(mode, [target || 'file'], { recursive }),
        buildChmodCommand(mode, [target || 'file'], { recursive, symbolic }),
        recursive ? buildChmodCommand(mode, ['.'], { recursive: true }) : '',
      ].filter((item) => item !== ''),
    [mode, recursive, target, symbolic],
  );
  const batch = useMemo(
    () => buildBatchScript(mode, batchInput, { recursive: batchRecursive, useSymbolic, directory: batchDirectory }),
    [batchDirectory, batchInput, batchRecursive, mode, useSymbolic],
  );
  const reverse = useMemo(() => parseChmodCommand(reverseInput), [reverseInput]);
  const umask = useMemo(() => fromUmask(umaskInput), [umaskInput]);

  const handleManual = (text: string) => {
    setManualInput(text);
    const parsed = parseModeText(text);
    if (parsed === null) {
      setManualError(text.trim() === '' ? null : '无法识别：支持 755 / 0755 / 493 / rwxr-xr-x / u=rw,g=r,o=');
      return;
    }
    setManualError(null);
    setMode(parsed.mode);
  };

  const applyPreset = (octalText: string) => {
    const parsed = fromOctal(octalText);
    if (parsed === null) return;
    setMode(parsed);
    setManualInput(octalText);
    setManualError(null);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <FolderLock className="size-4" />
          Chmod 计算器
        </span>
      }
      description="八进制 / 符号 / 三元组 / 十进制 / ACL 五向互转，附风险评估与批量脚本"
      actions={
        <Select
          ariaLabel="快速套用预设"
          value=""
          onChange={(value) => value !== '' && applyPreset(value)}
          options={[
            { value: '', label: '套用预设…' },
            ...PRESETS.map((preset) => ({ value: preset.octal, label: `${preset.octal}　${preset.name}` })),
          ]}
          selectClassName="w-52"
        />
      }
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as MainTab)}>
        <TabsList>
          <TabsTrigger value="calc" active={tab === 'calc'}>
            <span className="inline-flex items-center gap-1">
              <SlidersHorizontal className="size-3.5" />
              权限计算
            </span>
          </TabsTrigger>
          <TabsTrigger value="batch" active={tab === 'batch'}>
            <span className="inline-flex items-center gap-1">
              <Wand2 className="size-3.5" />
              批量脚本
            </span>
          </TabsTrigger>
          <TabsTrigger value="reverse" active={tab === 'reverse'}>
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3.5" />
              反向解析
            </span>
          </TabsTrigger>
          <TabsTrigger value="umask" active={tab === 'umask'}>
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3.5" />
              umask
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'calc' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            <Section title="三元组勾选" description="r=4、w=2、x=1，逐位勾选即得权限">
              <div className="flex flex-col gap-1.5">
                {WHO_LIST.map((who) => (
                  <TripletRow key={who} who={who} triplet={mode[who]} onToggle={toggle} />
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {WHO_LIST.map((who) => (
                  <Checkbox
                    key={who}
                    label={who === 'user' ? 'setuid (u+s)' : who === 'group' ? 'setgid (g+s)' : 'sticky (+t)'}
                    checked={who === 'user' ? mode.setuid : who === 'group' ? mode.setgid : mode.sticky}
                    onChange={(value) =>
                      setMode((prev) => ({
                        ...prev,
                        [who === 'user' ? 'setuid' : who === 'group' ? 'setgid' : 'sticky']: value,
                      }))
                    }
                  />
                ))}
              </div>
            </Section>

            <Section title="任意写法输入" description="八进制、符号串、ACL 子句、十进制均可">
              <TextField
                label="权限文本"
                value={manualInput}
                onChange={handleManual}
                placeholder="755 / 0755 / 493 / rwxr-xr-x / u=rw,g=r,o="
                hint={manualError ?? '输入后自动同步到左侧勾选与下方所有输出'}
              />
            </Section>

            <Section title="目录与文件的差异" description="同一个 x 位含义完全不同">
              <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
                {bits
                  .filter((bit) => bit.who === 'user')
                  .map((bit) => (
                    <li key={bit.bit} className="rounded border px-2 py-1">
                      <span className="font-mono text-foreground">{bit.bit}</span>
                      ：文件 → {bit.forFile}；目录 → {bit.forDir}
                    </li>
                  ))}
              </ul>
              <Hint>
                常见误解：目录给 444 只是「不能 cd 进去」，读不到里面任何文件内容；web 根目录必须带 x 才能被访问。
              </Hint>
            </Section>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <StatGrid>
              <Stat label="八进制（完整）" value={octal} hint={`三位简写 ${short}`} />
              <Stat label="符号表示" value={symbolic} />
              <Stat label="十进制数值" value={decimal} hint={`权限位 ${permissionsValue(mode)}`} />
              <Stat label="ACL 简写" value={acl} className="col-span-2 sm:col-span-1" />
              <Stat
                label="特殊位"
                value={specials.length === 0 ? '无' : specials.map((bit) => bit.name).join(' ')}
                tone={specials.length === 0 ? 'info' : 'warn'}
              />
              <Stat
                label="目标类型"
                value={directory ? '目录' : '文件'}
                hint={recursive ? '递归 chmod -R' : '非递归'}
              />
            </StatGrid>

            {specials.length > 0 && (
              <Note tone="warn" title="特殊位已启用">
                <ul className="flex flex-col gap-1">
                  {specials.map((bit) => (
                    <li key={bit.id}>
                      <strong>
                        {bit.name}（{bit.octal} / {bit.symbolic}）
                      </strong>
                      ：{bit.description} 风险：{bit.risk}
                    </li>
                  ))}
                </ul>
              </Note>
            )}

            <Section title="可复制的命令行">
              <div className="flex flex-col gap-1.5">
                {commands.map((command) => (
                  <div key={command} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded border bg-muted/30 px-2 py-1 font-mono text-xs">
                      {command}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyText(command)}
                      aria-label={`复制命令 ${command}`}
                    >
                      复制
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox label="目标是目录" checked={directory} onChange={setDirectory} />
                <Checkbox label="递归 -R" checked={recursive} onChange={setRecursive} />
                <Checkbox label="用符号写法" checked={useSymbolic} onChange={setUseSymbolic} />
              </div>
              <TextField
                label="目标路径"
                value={target}
                onChange={setTarget}
                placeholder="./app.conf"
                hint="目录记得带结尾 / 或使用 ./dir 形式，递归时更要确认路径范围"
              />
            </Section>

            <Section title="安全风险" description="按目标类型给出内置规则的判定结果">
              <RiskList items={risks} />
            </Section>

            <Section title="常见预设" description="一键套用内置组合">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PRESETS.map((preset) => {
                  const active = toOctal(fromOctal(preset.octal) ?? createMode()) === octal;
                  return (
                    <button
                      key={preset.octal}
                      type="button"
                      onClick={() => applyPreset(preset.octal)}
                      className={`rounded-md border px-2.5 py-1.5 text-left transition-colors hover:border-primary/60 ${
                        active ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 font-mono text-xs">
                        {preset.octal} · {preset.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {preset.useCase}
                      </span>
                      {preset.risk && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                          ⚠ {preset.risk}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Note tone="info" title="web 目录的常见组合">
              web 根目录 <code>755</code>（可进入）+ 文件 <code>644</code>（可读不可执行）；上传目录若需服务写入用{' '}
              <code>775</code> 并配合属组，<code>777</code> 意味着任何本地用户都能改你的页面。
            </Note>
          </div>
        </div>
      )}

      {tab === 'batch' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <Textarea
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
              placeholder={'每行一个路径\n# 以 # 开头的行会被忽略\n./a.conf ./b.conf'}
              spellCheck={false}
              aria-label="目标路径列表"
              className="min-h-56 flex-1 resize-none font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox label="递归 -R" checked={batchRecursive} onChange={setBatchRecursive} />
              <Checkbox label="目标为目录" checked={batchDirectory} onChange={setBatchDirectory} />
              <Checkbox label="用符号写法" checked={useSymbolic} onChange={setUseSymbolic} />
              <span className="text-[11px] text-muted-foreground">
                当前权限 {short}（{symbolic}）
              </span>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <ResultBox
              label="生成的 shell 脚本"
              value={batch.script}
              onCopy={() => copyText(batch.script)}
              rows="min-h-64"
              fill
            />
            <StatGrid>
              <Stat label="目标数量" value={batch.targets.length} />
              <Stat
                label="已跳过的危险路径"
                value={batch.skipped.length}
                tone={batch.skipped.length > 0 ? 'warn' : 'info'}
              />
              <Stat label="权限" value={useSymbolic ? symbolic : short} />
              <Stat label="递归" value={batchRecursive ? '是' : '否'} />
            </StatGrid>
            {batch.skipped.length > 0 && (
              <Note tone="warn" title="已跳过的路径">
                以下路径包含 shell 特殊字符，为避免注入风险未写进脚本，请手动确认：{batch.skipped.join('、')}
              </Note>
            )}
          </div>
        </div>
      )}

      {tab === 'reverse' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <Textarea
              value={reverseInput}
              onChange={(event) => setReverseInput(event.target.value)}
              placeholder="chmod -R u+x,go-w ./deploy"
              spellCheck={false}
              aria-label="chmod 命令文本"
              className="min-h-32 resize-none font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {['chmod 755 script.sh', 'chmod 0644 app.conf', 'chmod -R 700 ~/.ssh', 'chmod u+s,go-w ./tool'].map(
                (sample) => (
                  <Button
                    key={sample}
                    size="sm"
                    variant="ghost"
                    className="font-mono text-[11px]"
                    onClick={() => setReverseInput(sample)}
                  >
                    {sample}
                  </Button>
                ),
              )}
            </div>
            <Note tone="info" title="解析范围">
              支持 <code>chmod</code> / <code>sudo chmod</code> 前缀、<code>-R</code> 等短选项、
              <code>--reference=</code> 之类的长选项（只记录不下结论）、八进制与符号子句两种权限写法。
            </Note>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            {reverse.mode === null ? (
              <ResultBox label="解析结果" value="" error={reverse.error ?? '未识别到有效权限'} />
            ) : (
              <>
                <StatGrid>
                  <Stat label="八进制" value={reverse.octal} />
                  <Stat label="符号表示" value={reverse.symbolic} />
                  <Stat label="ACL" value={reverse.acl} />
                  <Stat label="递归" value={reverse.recursive ? '-R' : '否'} />
                  <Stat label="目标数量" value={reverse.targets.length} className="col-span-2" />
                </StatGrid>
                <ResultBox
                  label="目标路径"
                  value={reverse.targets.join('\n')}
                  onCopy={() => copyText(reverse.targets.join('\n'))}
                  rows="min-h-20"
                />
                <Section title="换成三元组">
                  <div className="flex flex-col gap-1.5">
                    {WHO_LIST.map((who) => (
                      <div key={who} className="flex items-center gap-2 font-mono text-xs">
                        <span className="w-20 text-muted-foreground">{WHO_LABEL[who]}</span>
                        <span>
                          {(reverse.mode as Mode)[who].r ? 'r' : '-'}
                          {(reverse.mode as Mode)[who].w ? 'w' : '-'}
                          {(reverse.mode as Mode)[who].x ? 'x' : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
                <RiskList items={assessRisks(reverse.mode, reverse.recursive)} />
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'umask' && (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Section title="umask 计算" description="新建文件按 666 取反，新建目录按 777 取反">
              <TextField label="umask" value={umaskInput} onChange={setUmaskInput} placeholder="022" />
              <div className="flex flex-wrap gap-1.5">
                {COMMON_UMASKS.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={umaskInput === item.value ? 'secondary' : 'ghost'}
                    onClick={() => setUmaskInput(item.value)}
                    title={item.note}
                    className="font-mono text-[11px]"
                  >
                    {item.value}
                  </Button>
                ))}
              </div>
            </Section>
            <Note tone="info" title="umask 只做减法">
              umask 不能凭空加上权限。程序用 <code>open(..., 0666)</code> 创建文件时，最终是 <code>0666 & ~umask</code>
              ；目录是 <code>0777 & ~umask</code>，内核不会再补回执行位，所以目录永远带 x。
            </Note>
          </div>
          <div className="flex flex-col gap-3">
            {umask === null ? (
              <ResultBox label="结果" value="" error="请输入 3~4 位八进制数字，例如 022" />
            ) : (
              <>
                <StatGrid>
                  <Stat label="umask" value={umask.umask} />
                  <Stat label="新建文件" value={umask.file} hint="请求模式 666" />
                  <Stat label="新建目录" value={umask.dir} hint="请求模式 777" />
                  <Stat
                    label="风险"
                    value={umask.dirValue & 0o002 ? '过宽' : '合理'}
                    tone={umask.dirValue & 0o002 ? 'danger' : 'success'}
                  />
                </StatGrid>
                <ResultBox
                  label="查看当前 umask"
                  value={`umask              # 输出 ${umask.umask}\numask ${umask.umask}      # 临时设置（仅当前 shell）\n`}
                  onCopy={() => copyText(`umask ${umask.umask}`)}
                  rows="min-h-20"
                />
                <Note tone={umask.dirValue & 0o002 ? 'danger' : 'success'} title="评估">
                  {umask.dirValue & 0o002
                    ? '该 umask 允许其他人新建文件与目录，在多用户服务器上建议收紧到 022 或 027。'
                    : '新建出来的文件与目录不会对其他人开放写权限，符合常见基线。'}
                </Note>
              </>
            )}
          </div>
        </div>
      )}

      <Note tone="info" title="局限与提示">
        <span className="inline-flex items-start gap-1">
          <Info className="mt-px size-3 shrink-0" />
          本工具只做权限位换算与内置规则评估，不读取真实文件系统，也不会执行 chmod。ACL（getfacl/setfacl 的 扩展条目，如
          u:amy:r--）、SELinux/AppArmor 标签、SELinux 的上下文权限都不在覆盖范围内。
          <ShieldAlert className="size-3 shrink-0" />
        </span>
      </Note>
    </ToolPanel>
  );
}
