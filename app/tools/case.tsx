/** 大小写转换：智能分词后按目标风格互转，token 逻辑复用 app/lib/case.ts。 */
import { Copy, Download, Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Textarea } from '../components/ui/textarea';
import { CASE_STYLES, type CaseStyle, convertCase, splitWords } from '../lib/case';
import { downloadText, exportName } from '../lib/file';

const SAMPLE = `XMLHttpRequest getHTTPResponse user_name UserName foo2Bar 3DModel
订单 状态 流转记录 id`;

/** 词元形态：小写 / 首字母大写 / 原样（用于自定义分隔符风格）。 */
type WordForm = 'lower' | 'capitalize' | 'keep';

const WORD_FORMS: { value: WordForm; label: string }[] = [
  { value: 'lower', label: '全部小写' },
  { value: 'capitalize', label: '首字母大写' },
  { value: 'keep', label: '保留原样' },
];

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * 把归一化后的词元按任意分隔符拼接。
 * `keepAcronym` 打开时保留 XML / HTTP 这类全大写缩写的原始写法，
 * 而不是降级成 Xml / Http。
 */
function joinWithSeparator(words: string[], separator: string, form: WordForm, keepAcronym: boolean): string {
  return words
    .map((word) => {
      const base = form === 'lower' ? word.toLowerCase() : form === 'capitalize' ? capitalize(word) : word;
      if (!keepAcronym) return base;
      if (word.length >= 2 && word === word.toUpperCase() && /[A-Z]/u.test(word)) return word;
      return base;
    })
    .join(separator);
}

/** camelCase / PascalCase 需要把首个词元压到小写或大写，单独处理缩写保留。 */
function joinIdentifier(words: string[], pascal: boolean, keepAcronym: boolean): string {
  return words
    .map((word, index) => {
      const isAcronym = word.length >= 2 && word === word.toUpperCase() && /[A-Z]/u.test(word);
      if (isAcronym && keepAcronym) return word;
      if (index === 0 && !pascal) return word.toLowerCase();
      return capitalize(word);
    })
    .join('');
}

/** 自定义额外分隔符：追加到 lib/case 的默认分隔符集合。 */
function splitWithExtra(text: string, extra: string): string[] {
  if (extra === '') return splitWords(text);
  const escaped = extra.replace(/[.*+?^${}()|[\]\\-]/gu, '\\$&');
  return splitWords(text.replace(new RegExp(`[${escaped}]`, 'gu'), ' '));
}

function isAcronym(word: string): boolean {
  return word.length >= 2 && word === word.toUpperCase() && /[A-Z]/u.test(word);
}

export default function CaseConverter() {
  const [input, setInput] = useState(SAMPLE);
  const [selected, setSelected] = useState<CaseStyle[]>(() => CASE_STYLES.map((style) => style.value));
  const [perLine, setPerLine] = useState(true);
  const [keepAcronym, setKeepAcronym] = useState(false);
  const [extraSeparator, setExtraSeparator] = useState('');
  const [customSeparator, setCustomSeparator] = useState('-');
  const [wordForm, setWordForm] = useState<WordForm>('lower');
  const [focusStyle, setFocusStyle] = useState<CaseStyle>('camel');

  const words = useMemo(() => splitWithExtra(input, extraSeparator), [input, extraSeparator]);

  const rows = useMemo(() => {
    const apply = (style: CaseStyle, text: string): string => {
      if (!keepAcronym) return convertCase(text, style);
      const localWords = splitWithExtra(text, extraSeparator);
      switch (style) {
        case 'camel':
          return joinIdentifier(localWords, false, true);
        case 'pascal':
          return joinIdentifier(localWords, true, true);
        case 'title':
        case 'train':
          return localWords
            .map((word) => (isAcronym(word) ? word : capitalize(word)))
            .join(style === 'train' ? '-' : ' ');
        case 'upper':
          return localWords.join(' ').toUpperCase();
        case 'lower':
          return localWords.join(' ').toLowerCase();
        default:
          // 其余风格天然是分隔符 + 全小写，缩写本就没有大小写信息
          return convertCase(text, style);
      }
    };

    const rows = input.split('\n');
    return CASE_STYLES.filter((style) => selected.includes(style.value)).map((style) => {
      const value = perLine ? rows.map((row) => apply(style.value, row)).join('\n') : apply(style.value, input);
      return { style: style.value, label: style.label, example: style.example, value };
    });
  }, [input, selected, perLine, keepAcronym, extraSeparator]);

  const customValue = useMemo(() => {
    const localWords = splitWithExtra(input, extraSeparator);
    if (!perLine) return joinWithSeparator(localWords, customSeparator, wordForm, keepAcronym);
    return input
      .split('\n')
      .map((row) => joinWithSeparator(splitWithExtra(row, extraSeparator), customSeparator, wordForm, keepAcronym))
      .join('\n');
  }, [input, extraSeparator, customSeparator, wordForm, keepAcronym, perLine]);

  const focusValue = useMemo(() => {
    const found = rows.find((row) => row.style === focusStyle);
    return found ? found.value : '';
  }, [rows, focusStyle]);

  const toggleStyle = (style: CaseStyle) =>
    setSelected((prev) => (prev.includes(style) ? prev.filter((item) => item !== style) : [...prev, style]));

  const allOutput = [...rows.map((row) => `${row.label}: ${row.value}`), `自定义: ${customValue}`].join('\n');
  const jsonOutput = JSON.stringify(
    {
      source: input,
      tokens: words,
      results: Object.fromEntries(rows.map((row) => [row.style, row.value])),
      custom: customValue,
    },
    null,
    2,
  );

  const selectAll = (flag: boolean) => setSelected(flag ? CASE_STYLES.map((style) => style.value) : []);

  return (
    <ToolPanel
      title="大小写转换"
      description="智能识别缩写与数字，把任意命名风格互转"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={!allOutput} onClick={() => copyText(allOutput)}>
            <Layers className="size-3.5" />
            全部复制
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!allOutput}
            onClick={() => downloadText(exportName('case', 'txt'), allOutput)}
          >
            <Download className="size-3.5" />
            下载 .txt
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!allOutput}
            onClick={() => downloadText(exportName('case', 'json'), jsonOutput, 'application/json;charset=utf-8')}
          >
            <Download className="size-3.5" />
            下载 .json
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={!input} />
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">输入文本</span>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="每行一条待转换的命名"
            spellCheck={false}
            className="min-h-40 resize-none font-mono text-xs"
            aria-label="输入文本"
          />
          <Hint>
            词元切分：
            {words.length > 0
              ? words
                  .slice(0, 24)
                  .map((word) => `[${word}]`)
                  .join(' ')
              : '（空）'}
            {words.length > 24 ? ' …' : ''}
          </Hint>
        </div>

        <Section title="转换选项" description="分词统一在「归一化词元」上进行，因此正向与反向互转结果一致">
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="自定义额外分隔符"
              value={extraSeparator}
              onChange={setExtraSeparator}
              placeholder="例：,;|"
              hint="与内置分隔符（- _ . / 空格等）叠加"
            />
            <TextField
              label="自定义分隔符"
              value={customSeparator}
              onChange={setCustomSeparator}
              placeholder="例：__ / ~"
              hint="用于「自定义」风格"
            />
            <Select
              label="自定义词形"
              value={wordForm}
              onChange={(value) => setWordForm(value as WordForm)}
              options={WORD_FORMS}
            />
            <Select
              label="单风格速查"
              value={focusStyle}
              onChange={(value) => setFocusStyle(value as CaseStyle)}
              options={CASE_STYLES.map((style) => ({ value: style.value, label: style.label }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Checkbox
              label="每行独立转换"
              checked={perLine}
              onChange={setPerLine}
              hint={perLine ? '输出与输入行数一致' : '整段文本作为一条命名处理'}
            />
            <Checkbox
              label="保留缩写"
              checked={keepAcronym}
              onChange={setKeepAcronym}
              hint="XMLHttpRequest → getXMLHttpResponse（关闭时为 getXmlHttpResponse）"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => selectAll(true)}>
              全选风格
            </Button>
            <Button size="sm" variant="outline" onClick={() => selectAll(false)}>
              清空风格
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(['camel', 'snake', 'kebab'])}>
              常用三种
            </Button>
          </div>
          <Note tone="info" title="正反向转换">
            本工具先把输入拆成词元再拼接，因此「snake → camel」与「camel → snake」都能得到正确结果；
            把任意风格当作原文本粘进来即可，不必先手动反转。
          </Note>
        </Section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ResultBox
          label={`单风格速查 · ${CASE_STYLES.find((style) => style.value === focusStyle)?.label ?? ''}`}
          value={focusValue}
          rows="min-h-24"
          onCopy={() => copyText(focusValue)}
        />
        <ResultBox
          label={`全部复制内容（${rows.length + 1} 行：风格: 结果）`}
          value={allOutput}
          rows="min-h-24"
          onCopy={() => copyText(allOutput)}
        />
      </div>

      <Section
        title="风格对照"
        description="点击任意卡片复制该风格的完整结果"
        actions={
          <span className="text-[11px] text-muted-foreground">
            已选 {rows.length} / {CASE_STYLES.length}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {CASE_STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => toggleStyle(style.value)}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                selected.includes(style.value)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyHint>请至少选择一种目标风格</EmptyHint>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={row.style} className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-medium">{row.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    aria-label={`复制 ${row.label} 结果`}
                    disabled={!row.value}
                    onClick={() => copyText(row.value)}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
                <code className="min-h-8 break-all font-mono text-xs leading-relaxed">{row.value || '—'}</code>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-1 rounded-md border border-dashed p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-medium">custom（自定义）</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  aria-label="复制自定义结果"
                  disabled={!customValue}
                  onClick={() => copyText(customValue)}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
              <code className="min-h-8 break-all font-mono text-xs leading-relaxed">{customValue || '—'}</code>
            </div>
          </div>
        )}
      </Section>
    </ToolPanel>
  );
}
