import { Download, ShieldAlert, Wifi } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';

type Level = 'L' | 'M' | 'Q' | 'H';
type Security = 'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'nopass';

/** WiFi 二维码里具有特殊含义的字符，出现在 SSID 或密码中必须转义。 */
const SPECIALS = /[\\;,:"]/g;

function escapeWifiValue(value: string): string {
  return value.replace(SPECIALS, (char) => `\\${char}`);
}

/** 生成标准 ZXing WiFi payload：WIFI:T:WPA;S:ssid;P:pass;H:true;; */
function buildWifiPayload(ssid: string, password: string, security: Security, hidden: boolean): string {
  const parts = [`T:${security}`];
  parts.push(`S:${escapeWifiValue(ssid)}`);
  if (security !== 'nopass') parts.push(`P:${escapeWifiValue(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

const SECURITY_OPTIONS = [
  { value: 'WPA', label: 'WPA' },
  { value: 'WPA2', label: 'WPA2' },
  { value: 'WPA3', label: 'WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'nopass（开放网络）' },
];

const LEVEL_OPTIONS = [
  { value: 'L', label: 'L 约 7%' },
  { value: 'M', label: 'M 约 15%' },
  { value: 'Q', label: 'Q 约 25%' },
  { value: 'H', label: 'H 约 30%' },
];

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * SVG → PNG 的通用路径：把 SVG 序列化为 Blob 后用 Image 解码再画进 canvas。
 * toBlob 在旧版 Safari 上可能返回 null，因此调用方需准备 toDataURL 兜底。
 */
function svgStringToPngBlob(svg: string, size: number): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('无法创建绘图上下文'));
        return;
      }
      ctx.drawImage(image, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      const comma = dataUrl.indexOf(',');
      if (comma < 0) {
        reject(new Error('画布导出 PNG 失败'));
        return;
      }
      const binary = atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: 'image/png' }));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG 解码失败'));
    };
    image.src = url;
  });
}

function downloadBlobUrl(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function WifiQr() {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<Security>('WPA2');
  const [hidden, setHidden] = useState(false);
  const [size, setSize] = useState(320);
  const [level, setLevel] = useState<Level>('M');
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => buildWifiPayload(ssid, password, security, hidden), [ssid, password, security, hidden]);

  const ssidBytes = useMemo(() => byteLength(ssid), [ssid]);
  const passwordBytes = useMemo(() => byteLength(password), [password]);
  const ssidTooLong = ssidBytes > 32;
  const passwordTooLong = security !== 'WEP' && passwordBytes > 63;
  const passwordOdd = security === 'WEP' && password.length > 0 && ![5, 13].includes(password.length);

  const ready = ssid.trim().length > 0 && !ssidTooLong;

  const downloadPng = useCallback(async () => {
    setError(null);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-wifi-qr]');
    try {
      if (canvas) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          downloadBlobUrl('wifi-qr.png', blob);
          return;
        }
      }
      // 画布导出不可用时退回 SVG → canvas 路径
      const svg = document.querySelector<SVGSVGElement>('svg[data-wifi-qr]');
      if (!svg) throw new Error('找不到二维码节点');
      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = await svgStringToPngBlob(serialized, size);
      if (!blob) throw new Error('画布导出 PNG 失败');
      downloadBlobUrl('wifi-qr.png', blob);
    } catch (err) {
      setError(`PNG 导出失败：${err instanceof Error ? err.message : '未知错误'}，请改用 SVG 下载`);
    }
  }, [size]);

  const downloadSvg = useCallback(() => {
    setError(null);
    const svg = document.querySelector<SVGSVGElement>('svg[data-wifi-qr]');
    if (!svg) {
      setError('找不到二维码节点，请稍后重试');
      return;
    }
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlobUrl('wifi-qr.svg', blob);
  }, []);

  return (
    <ToolPanel
      title="WiFi 二维码生成"
      description="生成扫码即可连网的 WiFi 配置码，全部在本地渲染，不做任何网络请求"
      actions={
        <>
          <Button size="sm" variant="outline" disabled={!ready} onClick={downloadPng}>
            <Download className="size-3.5" />
            PNG
          </Button>
          <Button size="sm" variant="outline" disabled={!ready} onClick={downloadSvg}>
            <Download className="size-3.5" />
            SVG
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <TextField
            label="SSID（网络名称）"
            value={ssid}
            onChange={setSsid}
            placeholder="例如 MyWiFi"
            hint={`UTF-8 字节长度 ${ssidBytes} / 32`}
          />
          <TextField
            label="密码"
            value={password}
            onChange={setPassword}
            placeholder={security === 'nopass' ? '开放网络无需密码' : '至少 8 位'}
            type="password"
            hint={
              security === 'nopass'
                ? '开放网络不会写入密码字段'
                : security === 'WEP'
                  ? 'WEP 只支持 5 位（ASCII）或 13 位'
                  : `UTF-8 字节长度 ${passwordBytes} / 63`
            }
            disabled={security === 'nopass'}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="加密方式"
              value={security}
              onChange={(value) => setSecurity(value as Security)}
              options={SECURITY_OPTIONS}
            />
            <Select
              label="纠错等级"
              value={level}
              onChange={(value) => setLevel(value as Level)}
              options={LEVEL_OPTIONS}
            />
          </div>
          <NumberField label="尺寸" value={size} onChange={setSize} min={128} max={1024} step={16} suffix="px" />
          <Checkbox label="隐藏网络" checked={hidden} onChange={setHidden} hint="勾选后会追加 H:true 字段" />
          <Note tone="warn" title="安全提示">
            二维码里含有明文密码。生成后请勿把图片发到公开场合、社交平台或工单系统；对外打印时建议用完即毁。
          </Note>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex min-h-40 items-center justify-center rounded-lg border bg-muted/20 p-4">
            {ready ? (
              <QRCodeCanvas data-wifi-qr value={payload} size={Math.min(size, 512)} level={level} marginSize={1} />
            ) : (
              <span className="text-xs text-muted-foreground">填写 SSID 后生成</span>
            )}
          </div>
          <StatGrid>
            <Stat label="SSID 字节" value={`${ssidBytes} / 32`} tone={ssidTooLong ? 'danger' : 'info'} />
            <Stat
              label="密码字节"
              value={security === 'nopass' ? '不适用' : `${passwordBytes} / 63`}
              tone={passwordTooLong ? 'danger' : passwordOdd ? 'warn' : 'info'}
            />
            <Stat label="payload 长度" value={`${payload.length} 字符`} />
            <Stat label="纠错等级" value={level} />
          </StatGrid>
          {ssidTooLong && <Note tone="danger">SSID 超过 32 字节，部分手机会解析失败，请缩短。</Note>}
          {passwordTooLong && <Note tone="warn">密码超过 63 字节，实际无法配对，建议缩短。</Note>}
          {passwordOdd && <Note tone="warn">WEP 密码长度必须是 5 或 13 位。</Note>}
          <ResultBox
            label="Payload 文本"
            value={payload}
            onCopy={ready ? () => copyText(payload) : undefined}
            rows="min-h-16"
          />
          <Input
            value={payload}
            readOnly
            aria-label="WiFi payload"
            className="h-8 font-mono text-[11px]"
            spellCheck={false}
          />
          {error && (
            <Note tone="danger" title="导出失败">
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="size-3" />
                {error}
              </span>
            </Note>
          )}
          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wifi className="size-3" />
            标准格式：<span className="font-mono">WIFI:T:WPA;S:名称;P:密码;;</span>，SSID 与密码中的{' '}
            <span className="font-mono">; , : " \</span> 会自动按规范转义。
          </p>
        </div>
      </div>

      <Section title="说明">
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          <li>nopass（开放网络）不会写入密码字段，部分旧机型识别率较低，可改用 WPA 留空密码。</li>
          <li>SSID 与密码中的反斜杠会被转义为两个反斜杠，扫描端会自动还原。</li>
          <li>纠错等级越高图案越密、识别越稳，但同样尺寸下可容纳的内容越少。</li>
        </ul>
      </Section>

      <div className="hidden" aria-hidden>
        {ready && <QRCodeSVG data-wifi-qr value={payload} size={size} level={level} marginSize={1} />}
      </div>
    </ToolPanel>
  );
}
