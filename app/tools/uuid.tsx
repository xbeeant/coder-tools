import { Dices, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { v1 as uuidv1, v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText } from '../components/ui/result';
import { Select } from '../components/ui/select';

type Version = 'v4' | 'v7' | 'v1';

const GENERATORS: Record<Version, () => string> = {
  v4: uuidv4,
  v7: uuidv7,
  v1: uuidv1,
};

export default function UuidTool() {
  const [version, setVersion] = useState<Version>('v4');
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [seed, setSeed] = useState(0);
  const [cleared, setCleared] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed 仅用于触发重新生成
  const list = useMemo(() => {
    const generate = GENERATORS[version];
    return Array.from({ length: count }, () => {
      const raw = generate();
      const trimmed = hyphens ? raw : raw.replace(/-/g, '');
      return uppercase ? trimmed.toUpperCase() : trimmed;
    });
  }, [version, count, uppercase, hyphens, seed]);

  const output = cleared ? '' : list.join('\n');

  const regenerate = () => {
    setCleared(false);
    setSeed((n) => n + 1);
  };

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-2">
          <Wand2 className="size-4" />
          UUID 生成
        </span>
      }
      description="生成 UUID v4、v7、v1，支持大小写与是否保留连字符"
      actions={
        <div className="flex flex-row gap-1">
          <Select
            ariaLabel="版本"
            label="版本"
            layout={'horizontal'}
            value={version}
            onChange={(value) => {
              setVersion(value as Version);
              setCleared(false);
            }}
            options={[
              { value: 'v4', label: 'v4 随机' },
              { value: 'v7', label: 'v7 时间有序' },
              { value: 'v1', label: 'v1 时间+MAC' },
            ]}
            selectClassName="w-32"
          />
          <label className="flex items-center gap-1.5 text-xs">
            数量
            <Input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => {
                setCount(Math.min(200, Math.max(1, Number(event.target.value) || 1)));
                setCleared(false);
              }}
              className="h-7 w-16 text-xs"
            />
          </label>
          <Checkbox
            label="大写"
            checked={uppercase}
            onChange={(value) => {
              setUppercase(value);
              setCleared(false);
            }}
          />
          <Checkbox
            label="连字符"
            checked={hyphens}
            onChange={(value) => {
              setHyphens(value);
              setCleared(false);
            }}
          />
          <Button size="sm" variant="outline" onClick={regenerate}>
            <Dices className="size-3.5" />
            重新生成
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copyText(output)} disabled={!output}>
            复制全部
          </Button>
          <ClearButton onClick={() => setCleared(true)} disabled={cleared || !output} />
        </div>
      }
    >
      <div className="flex-1 overflow-auto rounded-sm border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap scrollbar-thin">
        {cleared ? <EmptyHint>已清空，点击「重新生成」或调整参数后恢复</EmptyHint> : output}
      </div>
    </ToolPanel>
  );
}
