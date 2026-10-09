import { ArrowLeftRight, Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { downloadText, exportName } from '../lib/file';
import {
  CATEGORY_BY_ID,
  categoryDescription,
  convertAll,
  convertUnit,
  formatNumber,
  formatValue,
  isAffineCategory,
  toMarkdownTable,
  UNIT_CATEGORIES,
  type UnitCategory,
  unitNote,
} from '../lib/units';

const SIGNIFICANT_OPTIONS = [
  { value: '3', label: '3 位有效数字' },
  { value: '6', label: '6 位有效数字' },
  { value: '12', label: '12 位有效数字' },
];

const DEFAULT_UNITS: Record<string, { from: string; to: string }> = {
  length: { from: 'm', to: 'ft' },
  mass: { from: 'kg', to: 'lb' },
  temperature: { from: 'C', to: 'F' },
  speed: { from: 'kmh', to: 'mph' },
  data: { from: 'MB', to: 'MiB' },
};

/** 首个分类作为默认选择；常量兜底可避免数组索引在严格索引检查下报错。 */
const DEFAULT_CATEGORY: UnitCategory = UNIT_CATEGORIES[0] ?? {
  id: 'length',
  label: '长度',
  base: 'm',
  units: [{ id: 'm', label: '米 (m)', factor: 1 }],
};

export default function UnitConverter() {
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY.id);
  const category = CATEGORY_BY_ID.get(categoryId) ?? DEFAULT_CATEGORY;
  const fallback = DEFAULT_UNITS[categoryId] ?? {
    from: category.units[0].id,
    to: category.units[1]?.id ?? category.units[0].id,
  };
  const [fromUnit, setFromUnit] = useState(fallback.from);
  const [toUnit, setToUnit] = useState(fallback.to);
  const [valueInput, setValueInput] = useState('1');
  const [significant, setSignificant] = useState(12);
  const [scientific, setScientific] = useState(false);
  const [thousands, setThousands] = useState(false);

  // 切换分类时重置为该分类的常用组合
  useEffect(() => {
    const preset = DEFAULT_UNITS[categoryId] ?? {
      from: category.units[0].id,
      to: category.units[1]?.id ?? category.units[0].id,
    };
    setFromUnit(preset.from);
    setToUnit(preset.to);
  }, [categoryId, category.units]);

  const formatOptions = useMemo(() => ({ significant, scientific, thousands }), [significant, scientific, thousands]);

  const value = Number(valueInput.trim());
  const valid = valueInput.trim() !== '' && Number.isFinite(value);

  const result = useMemo(() => {
    if (!valid) return null;
    // 切换分类时 fromUnit / toUnit 可能还未被 useEffect 更新，先校验
    const fromUnitDef = category.units.find((u) => u.id === fromUnit);
    const toUnitDef = category.units.find((u) => u.id === toUnit);
    if (!fromUnitDef || !toUnitDef) return null;
    try {
      return convertUnit(categoryId, value, fromUnit, toUnit);
    } catch {
      return null;
    }
  }, [categoryId, value, valid, fromUnit, toUnit, category.units]);

  const resultText =
    result === null ? '' : `${formatValue(result, formatOptions)} ${unitShort(category.units, toUnit)}`;
  const allRows = useMemo(() => {
    if (!valid) return [];
    // 切换分类时校验单位是否属于当前分类
    if (!category.units.some((u) => u.id === fromUnit)) return [];
    return convertAll(categoryId, value, fromUnit, formatOptions);
  }, [categoryId, value, valid, fromUnit, formatOptions, category.units]);
  const markdown = useMemo(() => {
    if (!valid) return '';
    if (!category.units.some((u) => u.id === fromUnit)) return '';
    return toMarkdownTable(categoryId, value, fromUnit, formatOptions);
  }, [categoryId, value, valid, fromUnit, formatOptions, category.units]);

  const swap = useCallback(() => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
    if (result !== null) setValueInput(formatValue(result, { significant: 15 }));
  }, [toUnit, fromUnit, result]);

  const unitOptions = category.units.map((unit) => ({ value: unit.id, label: unit.label }));

  return (
    <ToolPanel
      title="单位换算"
      description={`${UNIT_CATEGORIES.length} 个类别、${UNIT_CATEGORIES.reduce((sum, item) => sum + item.units.length, 0)} 个单位，温度等非线性单位单独处理`}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={!markdown}
            onClick={() =>
              downloadText(exportName(`unit-${categoryId}`, 'md'), markdown, 'text/markdown;charset=utf-8')
            }
          >
            <Download className="size-3.5" />
            导出 Markdown
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copyText(resultText)} disabled={!resultText}>
            复制结果
          </Button>
        </>
      }
    >
      <Section title="分类" description={categoryDescription(categoryId)}>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_CATEGORIES.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === categoryId ? 'default' : 'outline'}
              className="h-6 px-2 text-[11px]"
              onClick={() => setCategoryId(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </Section>

      <div className="grid gap-3 md:grid-cols-2">
        <Section title="换算" description={`基准单位 ${category.base}`}>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="源值" hint="支持负数、小数与科学计数法，如 1.6e-9">
                <Input
                  value={valueInput}
                  onChange={(event) => setValueInput(event.target.value)}
                  aria-label="源值"
                  inputMode="decimal"
                  spellCheck={false}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <div className="flex items-end">
                <Button size="icon" variant="outline" onClick={swap} aria-label="交换源单位与目标单位">
                  <ArrowLeftRight className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="源单位" value={fromUnit} onChange={setFromUnit} options={unitOptions} />
              <Select label="目标单位" value={toUnit} onChange={setToUnit} options={unitOptions} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="有效数字"
                value={String(significant)}
                onChange={(next) => setSignificant(Number(next))}
                options={SIGNIFICANT_OPTIONS}
              />
              <div className="flex items-end pb-1">
                <Checkbox label="科学计数法" checked={scientific} onChange={setScientific} />
              </div>
              <div className="flex items-end pb-1">
                <Checkbox label="千分位分隔" checked={thousands} onChange={setThousands} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setValueInput('1')} disabled={valueInput === '1'}>
                <RefreshCw className="size-3.5" />
                重置为 1
              </Button>
              <Hint>交换按钮会同时把换算结果回填为新的源值，实现反向换算。</Hint>
            </div>
          </div>
        </Section>

        <Section title="结果">
          <ResultBox
            label="换算结果"
            value={resultText}
            error={valueInput.trim() ? (valid ? null : '源值不是有效数字') : null}
            onCopy={() => copyText(resultText)}
            rows="min-h-16"
          />
          <StatGrid className="grid-cols-2">
            <Stat label="数值" value={result === null ? '-' : formatValue(result, formatOptions)} />
            <Stat label="目标单位" value={unitShort(category.units, toUnit)} hint={labelOf(category.units, toUnit)} />
            <Stat
              label="1 源单位"
              value={allRows.find((row) => row.unit.id === toUnit)?.text ?? '-'}
              hint={`= ${unitShort(category.units, toUnit)}`}
            />
            <Stat label="基准单位" value={category.base} hint={categoryDescription(categoryId)} />
          </StatGrid>
          {isAffineCategory(categoryId) ? (
            <Note tone="warn" title="温度为仿射换算">
              温度不能简单地乘系数：°F = °C × 9/5 + 32，°C = K − 273.15。本工具按{' '}
              {category.units.map((unit) => unitNote(categoryId, unit.id)).join('；')}。
            </Note>
          ) : (
            <Hint>线性换算：先乘以源单位系数得到基准值，再除以目标单位系数。</Hint>
          )}
        </Section>
      </div>

      <Section title="常用换算表" description={`1 ${labelOf(category.units, fromUnit)} 等于各类目标单位的数值`}>
        {allRows.length === 0 ? (
          <EmptyHint>请输入有效的源值</EmptyHint>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allRows.map((row) => (
              <div
                key={row.unit.id}
                className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                  row.unit.id === toUnit ? 'border-primary/60 bg-primary/5' : 'bg-muted/20'
                }`}
              >
                <span className="truncate text-[11px] text-muted-foreground" title={row.unit.label}>
                  {row.unit.label}
                </span>
                <span className="shrink-0 font-mono text-xs">{row.text}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="全部单位一览"
        description={`系数为「1 该单位 = ? ${category.base}」，倒数类与温度类另行标注`}
        actions={
          <Button size="sm" variant="ghost" disabled={!markdown} onClick={() => copyText(markdown)}>
            复制 Markdown
          </Button>
        }
      >
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="text-[10px] text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-3 font-normal">单位</th>
                <th className="py-1.5 pr-3 font-normal">换算系数</th>
                <th className="py-1.5 font-normal">说明</th>
              </tr>
            </thead>
            <tbody>
              {category.units.map((unit) => (
                <tr key={unit.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-mono">{unit.label}</td>
                  <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                    {isAffineCategory(categoryId)
                      ? '仿射'
                      : unit.inverse
                        ? `${formatNumber(unit.factor ?? 1)} / 数值`
                        : formatNumber(unit.factor ?? 1)}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{unitNote(categoryId, unit.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Note tone="info" title="口径提醒">
        KB / MB / GB 是十进制（1000 进制），KiB / MiB / GiB 是二进制（1024 进制）；1 字节 = 8 比特。
        油耗类为倒数换算（km/L、mpg 换算成 L/100km 时取倒数），因此 0 无法作为输入。
      </Note>
    </ToolPanel>
  );
}

function unitShort(categoryUnits: { id: string; label: string }[], unitId: string): string {
  const unit = categoryUnits.find((item) => item.id === unitId);
  const match = /\(([^()]+)\)\s*$/.exec(unit?.label ?? '');
  return match ? match[1] : (unit?.label ?? unitId);
}

function labelOf(categoryUnits: { id: string; label: string }[], unitId: string): string {
  return categoryUnits.find((item) => item.id === unitId)?.label ?? unitId;
}
