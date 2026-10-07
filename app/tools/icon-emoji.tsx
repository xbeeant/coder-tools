/**
 * 图标预览用的字形集合。
 * 只静态引入一小批常用图标，避免把整个 lucide-react 打进包里；
 * 清单中其余图标回退为等宽文本显示名称。
 */
import {
  AlertTriangle,
  BarChart,
  Bell,
  Bookmark,
  Box,
  Camera,
  Check,
  Circle,
  Clock,
  Cloud,
  Code,
  Copy,
  Database,
  Download,
  Eye,
  File,
  Folder,
  Github,
  Globe,
  HardDrive,
  Heart,
  Home,
  Image,
  Info,
  Key,
  Laptop,
  Layers,
  Link,
  Lock,
  Mail,
  MapPin,
  Menu,
  Monitor,
  Music,
  Package,
  Palette,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  Smartphone,
  Star,
  Terminal,
  Trash2,
  Upload,
  User,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Select } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  codePoints,
  decimalEntities,
  EMOJI_CATEGORIES,
  EMOJI_TOTAL,
  type EmojiItem,
  entityFor,
  filterEmojis,
  filterIcons,
  filterSymbols,
  hasSkinTone,
  hexEntities,
  ICON_CATEGORY_NAMES,
  ICON_TOTAL,
  type IconItem,
  iconCssClass,
  iconImport,
  iconJsx,
  isZwjSequence,
  queryEntities,
  SYMBOL_GROUPS,
  utf16Length,
} from '../lib/emoji';

const EMOJI_CATEGORY_OPTIONS = [
  { value: 'all', label: `全部（${EMOJI_TOTAL}）` },
  ...EMOJI_CATEGORIES.map((category) => ({
    value: category.id,
    label: `${category.icon} ${category.label}`,
  })),
];

const ICON_CATEGORY_OPTIONS = [
  { value: 'all', label: `全部（${ICON_TOTAL}）` },
  ...ICON_CATEGORY_NAMES.map((name) => ({ value: name, label: name })),
];

const SYMBOL_CATEGORY_OPTIONS = [
  { value: '全部', label: '全部' },
  ...SYMBOL_GROUPS.map((group) => ({ value: group, label: group })),
];

export default function IconEmoji() {
  const [tab, setTab] = useState('emoji');

  return (
    <ToolPanel
      title="图标与表情"
      description={`内置 ${EMOJI_TOTAL} 个 emoji、${ICON_TOTAL} 个 Lucide 图标与常用符号，全部离线检索`}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icon">Lucide 图标</TabsTrigger>
          <TabsTrigger value="symbol">符号与实体</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'emoji' && <EmojiPanel />}
      {tab === 'icon' && <IconPanel />}
      {tab === 'symbol' && <SymbolPanel />}
    </ToolPanel>
  );
}

function EmojiPanel() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [skinOnly, setSkinOnly] = useState(false);
  const [zwjOnly, setZwjOnly] = useState(false);
  const [selected, setSelected] = useState<EmojiItem[]>([]);

  const items = useMemo(
    () => filterEmojis({ query, category, skinOnly, zwjOnly }),
    [query, category, skinOnly, zwjOnly],
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [items]);

  const toggle = (item: EmojiItem) => {
    setSelected((prev) =>
      prev.some((x) => x.char === item.char) ? prev.filter((x) => x.char !== item.char) : [...prev, item],
    );
  };

  const copySelection = () => {
    if (selected.length === 0) return;
    copyText(selected.map((item) => item.char).join(''));
  };

  const current = selected[0];

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、中文标签或 shortcode"
              className="h-8 pl-7 text-xs"
              aria-label="搜索 emoji"
            />
          </div>
          <Select
            ariaLabel="emoji 分类"
            value={category}
            onChange={(value) => setCategory(value)}
            options={EMOJI_CATEGORY_OPTIONS.map((option) => ({
              value: option.value,
              label: option.value === 'all' ? option.label : `${option.label}（${counts.get(option.value) ?? 0}）`,
            }))}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Checkbox label="仅肤色修饰" checked={skinOnly} onChange={setSkinOnly} />
          <Checkbox label="仅 ZWJ 序列" checked={zwjOnly} onChange={setZwjOnly} />
          {selected.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={copySelection}>
                <Copy className="size-3.5" />
                复制 {selected.length} 个
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                清空
              </Button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyHint>没有匹配的 emoji，换个关键词试试</EmptyHint>
        ) : (
          <div className="grid grid-cols-8 gap-1 overflow-auto sm:grid-cols-12 lg:grid-cols-16">
            {items.map((item) => {
              const active = selected.some((x) => x.char === item.char);
              return (
                <button
                  key={`${item.category}-${item.char}-${item.shortcode}`}
                  type="button"
                  onClick={() => toggle(item)}
                  className={`flex aspect-square items-center justify-center rounded-md text-xl transition-colors ${
                    active ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent'
                  }`}
                  title={`${item.zh} · ${item.name} · :${item.shortcode}:`}
                  aria-label={`${item.zh}，点击${active ? '取消选择' : '选择'}`}
                  aria-pressed={active}
                >
                  {item.char}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Section title="详情" description={current ? current.zh : '点击左侧 emoji 查看'}>
          {current ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-5xl leading-none">{current.char}</span>
                <div className="min-w-0 text-[11px]">
                  <p className="truncate font-medium">{current.name}</p>
                  <p className="text-muted-foreground">{current.zh}</p>
                </div>
              </div>
              <dl className="flex flex-col gap-1 text-[11px]">
                <Row
                  label="shortcode"
                  value={`:${current.shortcode}:`}
                  onCopy={() => copyText(`:${current.shortcode}:`)}
                />
                <Row
                  label="码点"
                  value={codePoints(current.char).join(' ')}
                  onCopy={() => copyText(codePoints(current.char).join(' '))}
                />
                <Row label="UTF-16 长度" value={String(utf16Length(current.char))} />
                <Row
                  label="十进制实体"
                  value={decimalEntities(current.char)}
                  onCopy={() => copyText(decimalEntities(current.char))}
                />
                <Row
                  label="十六进制实体"
                  value={hexEntities(current.char)}
                  onCopy={() => copyText(hexEntities(current.char))}
                />
                <Row label="肤色修饰" value={hasSkinTone(current.char) ? '有' : '无'} />
                <Row label="ZWJ 序列" value={isZwjSequence(current.char) ? '是' : '否'} />
              </dl>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" onClick={() => copyText(current.char)}>
                  复制 emoji
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyText(`:${current.shortcode}:`)}>
                  复制 shortcode
                </Button>
              </div>
            </>
          ) : (
            <EmptyHint>未选择</EmptyHint>
          )}
        </Section>

        <StatGrid className="grid-cols-2">
          <Stat label="已选" value={selected.length} />
          <Stat label="筛选结果" value={items.length} />
        </StatGrid>

        <Note tone="info" title="提示">
          连续点击可多选，凑齐一组后一次性复制拼接结果；ZWJ 序列（如 👨‍👩‍👧）与肤色修饰在部分终端宽度下会错位。
        </Note>
      </div>
    </div>
  );
}

function IconPanel() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<IconItem | null>(null);

  const items = useMemo(() => filterIcons(query, category), [query, category]);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索组件名、中文说明或 CSS 类名"
              className="h-8 pl-7 text-xs"
              aria-label="搜索图标"
            />
          </div>
          <Select
            ariaLabel="图标分类"
            value={category}
            onChange={(value) => setCategory(value)}
            options={ICON_CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </div>

        {items.length === 0 ? (
          <EmptyHint>没有匹配的图标</EmptyHint>
        ) : (
          <div className="grid grid-cols-8 gap-1 overflow-auto sm:grid-cols-12">
            {items.map((item) => {
              const active = selected?.name === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`flex aspect-square items-center justify-center rounded-md transition-colors ${
                    active ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent'
                  }`}
                  title={`${item.name} · ${item.zh}`}
                  aria-label={`图标 ${item.name}，${item.zh}`}
                  aria-pressed={active}
                >
                  <IconGlyph name={item.name} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Section title="用法" description={selected ? selected.zh : '点击图标查看'}>
          {selected ? (
            <>
              <div className="flex items-center justify-center gap-3 rounded-md border py-4">
                <IconGlyph name={selected.name} className="size-8" />
                <span className="font-mono text-xs">{selected.name}</span>
              </div>
              <CopyRow label="导入" value={iconImport(selected.name)} />
              <CopyRow label="JSX" value={iconJsx(selected.name)} />
              <CopyRow label="CSS 类名" value={iconCssClass(selected.name)} />
              <Hint>CSS 类名适用于 lucide 原生 CDN 版本；本地打包时用组件 + Tailwind 类名即可。</Hint>
            </>
          ) : (
            <EmptyHint>未选择</EmptyHint>
          )}
        </Section>
        <StatGrid className="grid-cols-2">
          <Stat label="图标总数" value={ICON_TOTAL} />
          <Stat label="筛选结果" value={items.length} />
        </StatGrid>
        <Note tone="warn" title="版本差异">
          <span className="inline-flex items-start gap-1">
            <Info className="mt-0.5 size-3 shrink-0" />
            清单为常用图标的手写子集（不遍历 npm 包）。少数名称在不同 lucide 版本间存在别名差异， 例如旧版的{' '}
            <span className="font-mono">Edit3</span>、<span className="font-mono">AlertCircle</span> 在新版中已改名为{' '}
            <span className="font-mono">PenLine</span>、<span className="font-mono">CircleAlert</span>。
          </span>
        </Note>
      </div>
    </div>
  );
}

type GlyphProps = { className?: string };

const GLYPH_ALIASES: Record<string, string> = {
  CircleAlert: 'AlertTriangle',
  Info: 'Info',
  Search: 'Search',
  Image: 'Image',
  Camera: 'Camera',
  Palette: 'Palette',
};

/**
 * 图标预览：优先用静态引入的字形，其余回退为等宽名称文本。
 * 清单来自内置数据，不遍历 npm 包，缺字形只影响预览不影响复制。
 */
function IconGlyph({ name, className = 'size-5' }: { name: string; className?: string }) {
  const registry = lucideSubset as unknown as Record<string, React.ComponentType<GlyphProps>>;
  const Glyph = registry[GLYPH_ALIASES[name] ?? name];
  if (!Glyph) return <span className="font-mono text-[9px] text-muted-foreground">{name.slice(0, 6)}</span>;
  return <Glyph className={className} />;
}

const lucideSubset = {
  AlertTriangle,
  BarChart,
  Bell,
  Bookmark,
  Box,
  Camera,
  Check,
  Circle,
  Clock,
  Cloud,
  Code,
  Copy,
  Database,
  Download,
  Eye,
  File,
  Folder,
  Github,
  Globe,
  HardDrive,
  Heart,
  Home,
  Image,
  Info,
  Key,
  Laptop,
  Layers,
  Link,
  Lock,
  Mail,
  MapPin,
  Menu,
  Monitor,
  Music,
  Package,
  Palette,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  Smartphone,
  Star,
  Terminal,
  Trash2,
  Upload,
  User,
  Users,
  Wifi,
  Zap,
};

function SymbolPanel() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const items = useMemo(() => filterSymbols(query, group), [query, group]);
  const entities = useMemo(() => (query.startsWith('&') || query.startsWith('#') ? queryEntities(query) : []), [query]);

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索字符、名称、实体名（支持 &amp; 或 &#8594;）"
              className="h-8 pl-7 text-xs"
              aria-label="搜索符号"
            />
          </div>
          <Select
            ariaLabel="符号分组"
            value={group}
            onChange={(value) => setGroup(value)}
            options={SYMBOL_CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </div>

        {entities.length > 0 && (
          <Note tone="success" title="实体查询结果">
            <div className="flex flex-wrap gap-1.5">
              {entities.map((item) => (
                <button
                  key={item.char}
                  type="button"
                  onClick={() => copyText(entityFor(item) || item.char)}
                  className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-accent"
                >
                  {item.char} {entityFor(item)}
                </button>
              ))}
            </div>
          </Note>
        )}

        {items.length === 0 ? (
          <EmptyHint>没有匹配的符号</EmptyHint>
        ) : (
          <div className="grid max-h-[26rem] grid-cols-8 gap-1 overflow-auto sm:grid-cols-12">
            {items.map((item) => (
              <button
                key={`${item.group}-${item.char}-${item.code}`}
                type="button"
                onClick={() => copyText(item.char)}
                className="flex aspect-square items-center justify-center rounded-md text-lg hover:bg-accent"
                title={`${item.zh} · ${item.name}${item.entity ? ` · &${item.entity};` : ''}`}
                aria-label={`复制符号 ${item.zh}`}
              >
                {item.char === ' ' ? '␣' : item.char}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Section title="说明">
          <Hint>
            点击任意符号即可复制字符本身。ASCII 分组覆盖可打印的 32~126；箭头、数学、货币与希腊字母均附带 HTML
            命名实体，方便直接粘贴到 HTML。
          </Hint>
          <Hint>
            搜索框支持直接粘贴实体（如 <span className="font-mono">&amp;rarr;</span>）或数值实体（如{' '}
            <span className="font-mono">&#8594;</span>）反查字符。
          </Hint>
        </Section>
        <StatGrid className="grid-cols-2">
          <Stat label="筛选结果" value={items.length} />
          <Stat label="分组" value={group} />
        </StatGrid>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1.5">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{value}</code>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        onClick={() => {
          copyText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        }}
        aria-label={`复制${label}`}
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded border px-2 py-1">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono">{value}</span>
      {onCopy && (
        <button type="button" onClick={onCopy} aria-label={`复制${label}`} className="shrink-0 hover:text-primary">
          <Copy className="size-3" />
        </button>
      )}
    </div>
  );
}
