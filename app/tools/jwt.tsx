import { AlertTriangle, CheckCircle2, KeyRound, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { NumberField, Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import {
  assessSecretStrength,
  buildJwtTimeClaims,
  createUnsignedJwt,
  decodeJwt,
  encodeJwtSegment,
  flattenJwtPayload,
  getJwtSignatureSpec,
  groupJwtClaims,
  inspectJwtSize,
  JWT_ALG_DOCS,
  JWT_CLAIM_DOCS,
  type JwtHmacResult,
  type JwtInfo,
  type JwtPayload,
  type JwtStructureIssue,
  jwtSampleTokens,
  redactJwtPayload,
  signJwtHmac,
  validateJwtStructure,
  verifyJwtHmac,
} from '../lib/jwt';

type Tab = 'decode' | 'inspect' | 'verify' | 'build' | 'reference';

const LEVEL_STYLE: Record<JwtStructureIssue['level'], { cls: string; Icon: typeof CheckCircle2; text: string }> = {
  error: { cls: 'text-destructive', Icon: XCircle, text: '错误' },
  warn: { cls: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle, text: '警告' },
  info: { cls: 'text-muted-foreground', Icon: ShieldAlert, text: '提示' },
};

const EXPIRY_TONE = {
  valid: 'success',
  expired: 'danger',
  'not-yet-valid': 'warn',
  none: 'info',
} as const;

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function JwtTool() {
  const [tab, setTab] = useState<Tab>('decode');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [hmac, setHmac] = useState<JwtHmacResult | null>(null);
  const [hmacError, setHmacError] = useState('');
  const [busy, setBusy] = useState(false);
  const [buildAlg, setBuildAlg] = useState('HS256');
  const [buildHeader, setBuildHeader] = useState('{\n  "kid": "key-2026-01"\n}');
  const [buildPayload, setBuildPayload] = useState(
    '{\n  "iss": "https://auth.example.com",\n  "sub": "user_1024",\n  "aud": ["my-api", "my-web"],\n  "scope": "openid profile",\n  "role": "admin"\n}',
  );
  const [buildTtl, setBuildTtl] = useState(3600);
  const [addTimeClaims, setAddTimeClaims] = useState(true);
  const [signed, setSigned] = useState('');
  const [buildError, setBuildError] = useState('');

  const decoded = useMemo<{ ok: true; info: JwtInfo } | { ok: false; error: string }>(() => {
    if (!token.trim()) return { ok: false, error: '' };
    try {
      return { ok: true, info: decodeJwt(token) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [token]);

  const structure = useMemo(() => {
    if (!token.trim()) return null;
    return validateJwtStructure(token);
  }, [token]);

  const flatClaims = useMemo(() => (decoded.ok ? flattenJwtPayload(decoded.info.payload) : []), [decoded]);
  const sensitiveCount = useMemo(() => flatClaims.filter((claim) => claim.sensitive).length, [flatClaims]);
  const sizeInfo = useMemo(
    () => (decoded.ok ? inspectJwtSize(token, Object.keys(decoded.info.payload).length) : null),
    [decoded, token],
  );
  const spec = useMemo(() => getJwtSignatureSpec(decoded.ok ? (decoded.info.header.alg ?? '') : ''), [decoded]);

  const runVerify = async () => {
    setBusy(true);
    setHmacError('');
    setHmac(null);
    try {
      setHmac(await verifyJwtHmac(token, secret));
    } catch (error) {
      setHmacError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const runSign = async () => {
    setBusy(true);
    setBuildError('');
    setSigned('');
    try {
      let header: Record<string, unknown> = {};
      if (buildHeader.trim()) {
        const parsed: unknown = JSON.parse(buildHeader);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Header 必须是 JSON 对象');
        }
        header = parsed as Record<string, unknown>;
      }
      const payloadParsed: unknown = JSON.parse(buildPayload);
      if (payloadParsed === null || typeof payloadParsed !== 'object' || Array.isArray(payloadParsed)) {
        throw new Error('Payload 必须是 JSON 对象');
      }
      const payload = { ...(payloadParsed as JwtPayload) };
      if (addTimeClaims) {
        const time = buildJwtTimeClaims({
          ttlSeconds: buildTtl,
          issuer: payload.iss,
          subject: payload.sub,
          audience: payload.aud,
        });
        // 用户手写的声明优先，只有缺失的时间声明才补齐
        for (const [key, value] of Object.entries(time)) {
          if (payload[key as keyof JwtPayload] === undefined) payload[key as keyof JwtPayload] = value as never;
        }
      }
      if (buildAlg === 'none') {
        setSigned(createUnsignedJwt(payload, header));
      } else {
        setSigned(await signJwtHmac({ alg: buildAlg, secret, header, payload }));
      }
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const fillTimeClaims = () => {
    try {
      const base = buildPayload.trim() === '' ? {} : (JSON.parse(buildPayload) as JwtPayload);
      const merged = { ...base, ...buildJwtTimeClaims({ ttlSeconds: buildTtl }) };
      setBuildPayload(prettyJson(merged));
    } catch {
      setBuildPayload(prettyJson(buildJwtTimeClaims({ ttlSeconds: buildTtl })));
    }
  };

  return (
    <ToolPanel
      title="JWT 解析与签发"
      description="本地解析 Header/Payload、结构体检、HMAC 验签与 HS 系列签发，不上传任何数据"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="decode">解析</TabsTrigger>
            <TabsTrigger value="inspect">结构体检</TabsTrigger>
            <TabsTrigger value="verify">HMAC 验签</TabsTrigger>
            <TabsTrigger value="build">签发调试</TabsTrigger>
            <TabsTrigger value="reference">声明与算法</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {tab !== 'reference' && tab !== 'build' && (
        <Section
          title="JWT"
          description="支持带 Bearer 前缀粘贴；解析不做签名验证"
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              {jwtSampleTokens().map((sample) => (
                <Button
                  key={sample.label}
                  size="sm"
                  variant="outline"
                  title={sample.description}
                  onClick={() => {
                    setToken(sample.token);
                    setHmac(null);
                    setHmacError('');
                  }}
                >
                  <Sparkles className="size-3.5" />
                  {sample.label}
                </Button>
              ))}
              <ClearButton
                onClick={() => {
                  setToken('');
                  setHmac(null);
                  setHmacError('');
                }}
                disabled={!token}
              />
            </div>
          }
        >
          <Textarea
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              setHmac(null);
              setHmacError('');
            }}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEwMjQifQ.signature"
            spellCheck={false}
            className="min-h-20 resize-none font-mono text-xs"
          />
          {structure && !structure.ok && (
            <Note tone="danger" title="结构校验未通过">
              {structure.issues
                .filter((issue) => issue.level === 'error')
                .map((issue) => issue.message)
                .join('；')}
            </Note>
          )}
        </Section>
      )}

      {tab === 'decode' &&
        (!token.trim() ? (
          <EmptyHint>粘贴 JWT 或点击上方样例按钮开始解析</EmptyHint>
        ) : !decoded.ok ? (
          <Note tone="danger" title="解析失败">
            {decoded.error}
          </Note>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="有效期与算法">
                <StatGrid className="grid-cols-2">
                  <Stat
                    label="过期状态"
                    value={
                      decoded.info.expires.status === 'valid'
                        ? '未过期'
                        : decoded.info.expires.status === 'expired'
                          ? '已过期'
                          : decoded.info.expires.status === 'not-yet-valid'
                            ? '尚未生效'
                            : '无 exp'
                    }
                    hint={
                      decoded.info.expires.remainingMs !== undefined
                        ? `${Math.round(decoded.info.expires.remainingMs / 1000)} 秒`
                        : undefined
                    }
                    tone={EXPIRY_TONE[decoded.info.expires.status]}
                  />
                  <Stat
                    label="算法 alg"
                    value={String(decoded.info.header.alg ?? '未知')}
                    hint={decoded.info.header.typ ? `typ=${decoded.info.header.typ}` : '未声明 typ'}
                  />
                  <Stat
                    label="签名长度"
                    value={`${decoded.info.signatureBytes} 字节`}
                    hint={spec.supported ? '支持本地验签' : '本工具无法本地验签'}
                  />
                  <Stat
                    label="声明数量"
                    value={`${Object.keys(decoded.info.payload).length} 个`}
                    hint={sensitiveCount > 0 ? `含 ${sensitiveCount} 个敏感字段` : '未发现敏感字段'}
                    tone={sensitiveCount > 0 ? 'warn' : 'info'}
                  />
                  <Stat
                    label="签发时间 iat"
                    value={
                      decoded.info.issuedAt
                        ? new Date((decoded.info.issuedAt.iat ?? 0) * 1000).toLocaleString()
                        : '未设置'
                    }
                    hint={
                      decoded.info.issuedAt?.ageMs !== undefined
                        ? `${Math.round(Math.abs(decoded.info.issuedAt.ageMs) / 1000)} 秒前`
                        : undefined
                    }
                  />
                  <Stat
                    label="生效时间 nbf"
                    value={
                      decoded.info.notBefore?.nbf
                        ? new Date(decoded.info.notBefore.nbf * 1000).toLocaleString()
                        : '未设置'
                    }
                  />
                </StatGrid>
                <Note tone="info" title="算法说明">
                  {decoded.info.algorithmNote}
                </Note>
                <Note tone="info" title="过期时间">
                  {decoded.info.expires.text}
                </Note>
                {decoded.info.audiences.length > 0 && (
                  <Hint>
                    受众 aud：{decoded.info.audiences.join('、')}
                    {Array.isArray(decoded.info.payload.aud) ? '（数组形式，服务端应校验自身是否在列表内）' : ''}
                  </Hint>
                )}
                {sizeInfo && (
                  <Note tone={sizeInfo.level === 'warn' ? 'warn' : 'info'} title="体积">
                    {sizeInfo.text}
                    {sizeInfo.tips.length > 0 && `；${sizeInfo.tips.join('；')}`}
                  </Note>
                )}
              </Section>

              <Section title="分段信息" description="三段各自的 Base64URL 文本与解码结果">
                <div className="flex flex-col gap-2">
                  {structure?.segments.map((segment) => (
                    <div key={segment.name} className="rounded-md border px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium">
                          {segment.index === 0 ? '① header' : segment.index === 1 ? '② payload' : '③ signature'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {segment.rawLength} 字符 / {segment.byteLength} 字节
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] break-all text-muted-foreground">
                        {segment.raw.length > 160 ? `${segment.raw.slice(0, 160)}…` : segment.raw || '（空）'}
                      </p>
                      {!segment.valid && segment.error && (
                        <p className="mt-1 text-[10px] text-destructive">{segment.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Section title="Header" actions={undefined}>
                <ResultBox
                  label="Header JSON"
                  value={prettyJson(decoded.info.header)}
                  onCopy={() => copyText(prettyJson(decoded.info.header))}
                  rows="min-h-28"
                />
                {decoded.info.header.kid ? (
                  <Hint>
                    kid={String(decoded.info.header.kid)}：验证方按此标识选密钥，缺失时只能用「唯一一把密钥」策略。
                  </Hint>
                ) : null}
              </Section>
              <Section title="Payload 原文">
                <ResultBox
                  label="Payload JSON（敏感字段已遮蔽）"
                  value={redactJwtPayload(decoded.info.payload)}
                  onCopy={() => copyText(redactJwtPayload(decoded.info.payload))}
                  rows="min-h-28"
                />
                <Hint>
                  遮蔽仅用于展示：命中 password / secret / token / api_key / cookie / session
                  等关键词的字符串会保留首尾各 2 位。
                </Hint>
              </Section>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Section title="声明分组" description="按注册声明 / 时间声明 / 私有声明归类">
                <div className="flex flex-col gap-2">
                  {groupJwtClaims(decoded.info.payload).map((group) => (
                    <div key={group.group}>
                      <p className="text-[10px] text-muted-foreground">{group.group}</p>
                      <div className="mt-1 overflow-auto rounded-md border">
                        <table className="w-full text-left text-[11px]">
                          <tbody>
                            {group.claims.map((claim) => (
                              <tr key={claim.key} className="border-b last:border-b-0 align-top">
                                <td className="w-28 px-2 py-1 font-mono">{claim.key}</td>
                                <td className="px-2 py-1 font-mono break-all">
                                  <span
                                    className={isSensitivePath(claim.key) ? 'text-amber-600 dark:text-amber-400' : ''}
                                  >
                                    {claim.value}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="扁平化路径" description="嵌套声明展开为 a.b[0] 形式，便于逐项核对">
                <div className="max-h-72 overflow-auto rounded-md border scrollbar-thin">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          路径
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          类型
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          值
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatClaims.map((claim) => (
                        <tr key={claim.path} className="border-t align-top">
                          <td
                            className="px-2 py-1 font-mono whitespace-nowrap"
                            style={{ paddingLeft: 8 + claim.depth * 10 }}
                          >
                            {claim.path}
                            {claim.sensitive && (
                              <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400">敏感</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-[10px] text-muted-foreground">{claim.type}</td>
                          <td className="px-2 py-1 font-mono break-all">{claim.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          </>
        ))}

      {tab === 'inspect' &&
        (!structure ? (
          <EmptyHint>粘贴 JWT 后进行结构体检：段数、Base64URL、JSON、alg 与风险点</EmptyHint>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Section
                title="体检结论"
                actions={
                  decoded.ok ? (
                    <Button size="sm" variant="ghost" onClick={() => setTab('verify')}>
                      去验签
                    </Button>
                  ) : undefined
                }
              >
                <StatGrid className="grid-cols-2">
                  <Stat
                    label="总体结果"
                    value={structure.ok ? '通过' : '未通过'}
                    tone={structure.ok ? 'success' : 'danger'}
                  />
                  <Stat
                    label="段数"
                    value={`${structure.segmentCount} / 3`}
                    tone={structure.segmentCount === 3 ? 'info' : 'danger'}
                  />
                  <Stat label="错误" value={`${structure.issues.filter((i) => i.level === 'error').length} 项`} />
                  <Stat
                    label="警告 / 提示"
                    value={`${structure.issues.filter((i) => i.level === 'warn').length} / ${structure.issues.filter((i) => i.level === 'info').length}`}
                  />
                </StatGrid>
                {structure.issues.length === 0 ? (
                  <Note tone="success" title="未发现问题">
                    段数、Base64URL 编码与 JSON 解析均正常。注意：结构正常不代表签名有效，也不代表 token 未被篡改。
                  </Note>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {structure.issues.map((issue) => {
                      const style = LEVEL_STYLE[issue.level];
                      const Icon = style.Icon;
                      return (
                        <li
                          key={`${issue.code}-${issue.message}`}
                          className="flex items-start gap-1.5 text-[11px] leading-relaxed"
                        >
                          <Icon className={`mt-0.5 size-3 shrink-0 ${style.cls}`} />
                          <span>
                            <span className={`font-medium ${style.cls}`}>{style.text}</span>
                            <span className="text-muted-foreground"> · {issue.message}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section title="逐段校验">
                <div className="flex flex-col gap-1.5">
                  {structure.segments.map((segment) => (
                    <div key={segment.name} className="rounded-md border px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{segment.name}</span>
                        <span
                          className={`text-[10px] ${segment.valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
                        >
                          {segment.valid ? '解码正常' : `解码失败：${segment.error}`}
                        </span>
                      </div>
                      {segment.index < 2 && segment.valid && (
                        <p className="mt-1 max-h-24 overflow-auto font-mono text-[10px] leading-relaxed break-all text-muted-foreground scrollbar-thin">
                          {segment.decoded}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
            <Note tone="warn" title="结构体检能做什么、不能做什么">
              它只判断 token 是否长得像 JWT、能否解析、有没有明显的危险特征（alg=none、外部 jku、缺
              alg、签名长度异常）。 它<b>不能</b>证明签名有效、token
              未过期，或签发方可信——这些必须用密钥和可信时间源在服务端完成。
            </Note>
          </>
        ))}

      {tab === 'verify' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Section
            title="HMAC 验签"
            description="仅支持 HS256 / HS384 / HS512，密钥只在本地内存中参与计算"
            actions={
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowSecret((prev) => !prev)}
                  aria-label="切换密钥可见性"
                >
                  <KeyRound className="size-3.5" />
                  {showSecret ? '隐藏' : '显示'}
                </Button>
                <ClearButton onClick={() => setSecret('')} disabled={!secret} />
              </div>
            }
          >
            <TextField
              label="共享密钥（secret）"
              value={secret}
              onChange={setSecret}
              type={showSecret ? 'text' : 'password'}
              placeholder="至少 32 字节随机串"
              hint={decoded.ok ? `当前 alg=${String(decoded.info.header.alg ?? '未知')}` : '粘贴 token 后自动识别算法'}
            />
            {decoded.ok && (
              <Note
                tone={assessSecretStrength(secret, String(decoded.info.header.alg ?? 'HS256')).ok ? 'info' : 'warn'}
                title="密钥强度"
              >
                {assessSecretStrength(secret, String(decoded.info.header.alg ?? 'HS256')).text}
              </Note>
            )}
            <Button
              size="sm"
              className="self-start"
              disabled={busy || !token.trim() || !secret}
              onClick={() => void runVerify()}
            >
              <CheckCircle2 className="size-3.5" />
              {busy ? '计算中…' : '校验签名'}
            </Button>
            {hmacError && (
              <Note tone="danger" title="验签出错">
                {hmacError}
              </Note>
            )}
            {hmac && (
              <>
                <Note tone={hmac.ok ? 'success' : 'danger'} title={hmac.ok ? '校验通过' : '校验失败'}>
                  {hmac.message}
                </Note>
                <ResultBox
                  label="待签名内容（header.payload）"
                  value={hmac.signingInput}
                  onCopy={() => copyText(hmac.signingInput)}
                  rows="min-h-16"
                />
                <div className="grid gap-2 md:grid-cols-2">
                  <ResultBox
                    label="期望签名（十六进制）"
                    value={hmac.expectedHex}
                    onCopy={() => copyText(hmac.expectedHex)}
                    rows="min-h-10"
                  />
                  <ResultBox
                    label="实际签名（十六进制）"
                    value={hmac.actualHex}
                    onCopy={() => copyText(hmac.actualHex)}
                    rows="min-h-10"
                  />
                </div>
                <Hint>
                  签名不同常见原因：密钥不一致、alg 被篡改（例如把 RS256 换成 HS256 用公钥当密钥）、token
                  传输中被截断或改了任意一个字符。
                </Hint>
              </>
            )}
            {!hmac && !hmacError && <EmptyHint>填写密钥后点击「校验签名」</EmptyHint>}
          </Section>

          <Section title="服务端应做的完整校验" description="本工具只覆盖签名一项，顺序不能颠倒">
            <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              <li>先按固定算法白名单验签（不要直接信任 header 里的 alg）</li>
              <li>检查 iss 是否为可信签发方</li>
              <li>检查 aud 是否包含自己（数组时逐一比对）</li>
              <li>用 exp / nbf 校验有效期，容忍小幅时钟偏移（如 ±60 秒）</li>
              <li>按需检查 jti 重放、scope / role 权限</li>
            </ol>
            <Note tone="warn" title="HS/RS 混淆攻击">
              若接口同时支持 HS 与 RS，攻击者可能把 RS256 改写成 HS256 并用公开的 RSA 公钥当 HMAC 密钥。
              防护方式是：按你的实现固定算法白名单，并确认公钥不会被当作 HMAC 密钥使用。
            </Note>
            <Note tone="warn" title="浏览器内运行的注意点">
              在前端输入真实密钥只适合本地调试。本工具不会保存密钥，但请不要把生产密钥粘贴进来，
              也不要在这里判断「前端能否信任」——token 校验必须在服务端完成。
            </Note>
          </Section>
        </div>
      )}

      {tab === 'build' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="Header" description="会与 alg、typ 合并">
              <Textarea
                value={buildHeader}
                onChange={(event) => setBuildHeader(event.target.value)}
                spellCheck={false}
                className="min-h-24 resize-none font-mono text-xs"
              />
            </Section>
            <Section
              title="Payload"
              description="会与自动生成的时间声明合并（同名以你手写的为准）"
              actions={
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={fillTimeClaims}>
                    <Sparkles className="size-3.5" />
                    填入时间声明
                  </Button>
                  <ClearButton onClick={() => setBuildPayload('')} disabled={!buildPayload} />
                </div>
              }
            >
              <Textarea
                value={buildPayload}
                onChange={(event) => setBuildPayload(event.target.value)}
                spellCheck={false}
                className="min-h-40 resize-none font-mono text-xs"
              />
            </Section>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Section title="签发参数">
              <div className="grid gap-2 sm:grid-cols-3">
                <Select
                  label="算法"
                  ariaLabel="签名算法"
                  value={buildAlg}
                  onChange={setBuildAlg}
                  options={[
                    { value: 'HS256', label: 'HS256' },
                    { value: 'HS384', label: 'HS384' },
                    { value: 'HS512', label: 'HS512' },
                    { value: 'none', label: 'none（不签名）' },
                  ]}
                />
                <NumberField
                  label="有效期（秒）"
                  value={buildTtl}
                  onChange={setBuildTtl}
                  min={0}
                  step={60}
                  hint="写入 exp"
                />
                <TextField
                  label="共享密钥"
                  value={secret}
                  onChange={setSecret}
                  type={showSecret ? 'text' : 'password'}
                  placeholder={buildAlg === 'none' ? 'none 不需要密钥' : '至少 32 字节'}
                  disabled={buildAlg === 'none'}
                />
              </div>
              <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={addTimeClaims}
                  onChange={(event) => setAddTimeClaims(event.target.checked)}
                  aria-label="自动补齐时间声明"
                />
                自动补齐 iat / nbf / exp / jti
              </label>
              {buildAlg !== 'none' && (
                <Note tone={assessSecretStrength(secret, buildAlg).ok ? 'info' : 'warn'} title="密钥强度">
                  {assessSecretStrength(secret, buildAlg).text}
                </Note>
              )}
              {buildAlg === 'none' && (
                <Note tone="danger" title="alg=none 不安全">
                  签出的 token 没有任何签名，任何人都能改 payload。仅用于本地联调「无 token 服务」的场景。
                </Note>
              )}
              <Button size="sm" className="self-start" disabled={busy} onClick={() => void runSign()}>
                <KeyRound className="size-3.5" />
                {busy ? '生成中…' : '生成 JWT'}
              </Button>
              {buildError && (
                <Note tone="danger" title="生成失败">
                  {buildError}
                </Note>
              )}
            </Section>

            <Section title="结果">
              <ResultBox
                label="生成的 token"
                value={signed}
                error={buildError || null}
                onCopy={() => copyText(signed)}
                rows="min-h-16"
              />
              {signed && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => {
                      setToken(signed);
                      setHmac(null);
                      setHmacError('');
                      setTab('decode');
                    }}
                  >
                    拿去解析
                  </Button>
                  <ResultBox
                    label="分段预览"
                    value={signed
                      .split('.')
                      .map((part, index) => `${['header', 'payload', 'signature'][index]}: ${part}`)
                      .join('\n')}
                    onCopy={() =>
                      copyText(
                        signed
                          .split('.')
                          .map((part, index) => `${['header', 'payload', 'signature'][index]}: ${part}`)
                          .join('\n'),
                      )
                    }
                    rows="min-h-16"
                  />
                  <Hint>payload 段 base64url（可直接拼 URL）：{encodeJwtSegment({ sub: 'demo' }).slice(0, 24)}…</Hint>
                </>
              )}
              {!signed && !buildError && <EmptyHint>点击「生成 JWT」查看结果</EmptyHint>}
            </Section>
          </div>
          <Note tone="info" title="签发范围">
            本工具只实现 HMAC 系列与 alg=none，用于本地联调与理解 token 结构；RS/ES/EdDSA 需要引入公钥库或 JWK 处理，
            未在此实现。
          </Note>
        </>
      )}

      {tab === 'reference' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Section title="签名算法对照" description="签名长度、密钥形式与风险等级">
              <div className="overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        alg
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        类型
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        哈希
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        签名
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        风险
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {JWT_ALG_DOCS.map((doc) => (
                      <tr key={doc.alg} className="border-t align-top">
                        <td className="px-2 py-1 font-mono">{doc.alg}</td>
                        <td className="px-2 py-1 text-muted-foreground">{doc.family}</td>
                        <td className="px-2 py-1 font-mono">{doc.hash}</td>
                        <td className="px-2 py-1 font-mono">{doc.signatureBytes} B</td>
                        <td
                          className={`px-2 py-1 ${doc.risk === '高' ? 'text-destructive' : doc.risk === '中' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {doc.risk}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Hint>
                风险列是通用工程经验值：HS* 标为「中」是因为对称密钥泄露即等于可伪造；实际项目优先 RS256/ES256/EdDSA。
              </Hint>
            </Section>

            <Section title="标准与常见声明" description="点击行不改变内容，仅作速查">
              <div className="max-h-96 overflow-auto rounded-md border scrollbar-thin">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        声明
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        类型
                      </th>
                      <th scope="col" className="px-2 py-1.5 font-medium">
                        说明
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {JWT_CLAIM_DOCS.map((doc) => (
                      <tr key={doc.key} className="border-t align-top">
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{doc.key}</td>
                        <td className="px-2 py-1 text-[10px] text-muted-foreground">{doc.type}</td>
                        <td className="px-2 py-1 leading-relaxed">
                          {doc.description}
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">例：{doc.example}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
          <Note tone="info" title="把 PII 放进 JWT 的代价">
            JWT 的 payload 只是 base64url 编码，不是加密：任何拿到 token
            的人都能读到全部内容，而且它会随每个请求反复传输。 手机号、身份证、密钥、密码这类信息不要放进 payload。
          </Note>
        </>
      )}
    </ToolPanel>
  );
}

function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return ['password', 'secret', 'token', 'api_key', 'cookie', 'session', 'pwd'].some((token) => lower.includes(token));
}
