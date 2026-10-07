import { Download, QrCode } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Section, ToolPanel } from '../components/ui/panel';
import { Textarea } from '../components/ui/textarea';

type Level = 'L' | 'M' | 'Q' | 'H';

function download(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

export default function QrGenerator() {
  const [text, setText] = useState('https://example.com');
  const [size, setSize] = useState(200);
  const [level, setLevel] = useState<Level>('M');
  const [fg, setFg] = useState('#0f172a');
  const [bg, setBg] = useState('#ffffff');

  const downloadPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-qr]');
    if (canvas) download(canvas.toDataURL('image/png'), 'qrcode.png');
  };

  const downloadSvg = () => {
    const svg = document.querySelector<SVGSVGElement>('svg[data-qr]');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    download(url, 'qrcode.svg');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <QrCode className="size-4" />
          二维码生成
        </span>
      }
      description="生成二维码并支持 PNG/SVG 下载"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={downloadPng} disabled={!text}>
            <Download className="size-3.5" />
            PNG
          </Button>
          <Button size="sm" variant="outline" onClick={downloadSvg} disabled={!text}>
            <Download className="size-3.5" />
            SVG
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto md:flex-row scrollbar-thin">
        <div className="flex flex-1 flex-col gap-2.5">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="URL、文本、WiFi 配置等"
            spellCheck={false}
            className="min-h-20 resize-none font-mono text-xs"
          />
          <Section title="配置">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
                尺寸
                <Input
                  type="number"
                  min={80}
                  max={512}
                  value={size}
                  onChange={(event) => setSize(Math.min(512, Math.max(80, Number(event.target.value) || 200)))}
                  className="h-7 text-xs"
                />
              </label>
              <Select
                ariaLabel="纠错等级"
                value={level}
                onChange={(value) => setLevel(value as Level)}
                options={[
                  { value: 'L', label: 'L 7%' },
                  { value: 'M', label: 'M 15%' },
                  { value: 'Q', label: 'Q 25%' },
                  { value: 'H', label: 'H 30%' },
                ]}
                selectClassName="w-28"
              />
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                配色
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={fg}
                    onChange={(event) => setFg(event.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border bg-background p-0.5"
                    aria-label="前景色"
                  />
                  <input
                    type="color"
                    value={bg}
                    onChange={(event) => setBg(event.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border bg-background p-0.5"
                    aria-label="背景色"
                  />
                </div>
              </div>
            </div>
          </Section>
        </div>
        <div className="flex shrink-0 items-center justify-center rounded-md border p-4">
          {text ? (
            <QRCodeCanvas data-qr value={text} size={size} level={level} fgColor={fg} bgColor={bg} />
          ) : (
            <span className="text-xs text-muted-foreground">输入内容后生成</span>
          )}
        </div>
      </div>
      <div className="hidden">
        {text && <QRCodeSVG data-qr value={text} size={size} level={level} fgColor={fg} bgColor={bg} />}
      </div>
    </ToolPanel>
  );
}
