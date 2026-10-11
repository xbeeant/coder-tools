import JSON5 from 'json5';
import {
  Braces,
  ClipboardPaste,
  Code2,
  Database,
  Download,
  FileJson,
  FolderOpen,
  Info,
  Languages,
  ListTree,
  Repeat,
  Table2,
  Wand2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatBytes } from '../lib/bytes';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  buildShapeBundle,
  CODE_TARGETS,
  type CodeTarget,
  collectNameFixes,
  generateGo,
  generateJava,
  generateJsonSchema,
  generatePython,
  generateSampleText,
  generateSqlDdl,
  generateTs,
  type NameFix,
  type ShapeRow,
  shapeRows,
} from '../lib/json-to-code';

const SAMPLE = JSON.stringify(
  {
    id: 1001,
    user_name: '张三',
    email: 'zhang@example.com',
    active: true,
    score: 9.5,
    class: 'A',
    tags: ['admin', 'vip'],
    address: { city: '上海', zip: null },
    items: [{ sku: 'A1', qty: 2, price: 9.9 }],
  },
  null,
  2,
);

const MIME_BY_TARGET: Record<CodeTarget, string> = {
  ts: 'text/plain;charset=utf-8',
  java: 'text/plain;charset=utf-8',
  python: 'text/plain;charset=utf-8',
  go: 'text/plain;charset=utf-8',
  sql: 'text/plain;charset=utf-8',
  schema: 'application/json;charset=utf-8',
  sample: 'application/json;charset=utf-8',
};

interface Generated {
  output: string;
  error: string | null;
  rows: ShapeRow[];
  fixes: NameFix[];
  typeCount: number;
  fieldCount: number;
}

export default function JsonToCode() {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<CodeTarget>('ts');
  const [rootName, setRootName] = useState('Root');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  // 各目标语言的可选开关
  const [useTypeAlias, setUseTypeAlias] = useState(false);
  const [tsNullable, setTsNullable] = useState(false);
  const [tsExported, setTsExported] = useState(false);
  const [javaAccessors, setJavaAccessors] = useState(true);
  const [javaToString, setJavaToString] = useState(true);
  const [pythonTypedDict, setPythonTypedDict] = useState(false);
  const [goPointers, setGoPointers] = useState(true);
  const [sqlTableName, setSqlTableName] = useState('');
  const [sampleSeed, setSampleSeed] = useState(42);
  const [sampleArrayLength, setSampleArrayLength] = useState(2);
  const [nullAsSkip, setNullAsSkip] = useState(false);

  const parsed = useMemo(() => {
    if (input.trim() === '') return { value: null as unknown, ok: true, error: null };
    try {
      return { value: JSON5.parse(input) as unknown, ok: true, error: null };
    } catch (error) {
      return {
        value: null,
        ok: false,
        error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }, [input]);

  const generated = useMemo<Generated>(() => {
    if (input.trim() === '') return { output: '', error: null, rows: [], fixes: [], typeCount: 0, fieldCount: 0 };
    if (!parsed.ok) return { output: '', error: parsed.error, rows: [], fixes: [], typeCount: 0, fieldCount: 0 };

    const value = parsed.value;
    const name = rootName.trim() === '' ? 'Root' : rootName.trim();
    const nullAs: 'skip' | 'empty' = nullAsSkip ? 'skip' : 'empty';
    const bundle = buildShapeBundle(value, name, { nullAs });
    const rows = shapeRows(bundle);
    const fixes = collectNameFixes(value);
    const fieldCount = bundle.order.reduce((sum, shape) => sum + (shape.fields?.length ?? 0), 0);
    const typeCount = bundle.order.length;

    try {
      let output = '';
      if (target === 'ts') {
        output = generateTs(value, {
          rootName: name,
          useTypeAlias,
          nullable: tsNullable,
          exported: tsExported,
          nullAs,
        });
      } else if (target === 'java') {
        output = generateJava(value, {
          rootName: name,
          accessors: javaAccessors,
          toStringMethod: javaToString,
          nullAs,
        });
      } else if (target === 'python') {
        output = generatePython(value, { rootName: name, typedDict: pythonTypedDict, nullAs });
      } else if (target === 'go') {
        output = generateGo(value, { rootName: name, pointers: goPointers, nullAs });
      } else if (target === 'sql') {
        output = generateSqlDdl(value, {
          ...(sqlTableName.trim() === '' ? {} : { tableName: sqlTableName.trim() }),
          nullAs,
        });
      } else if (target === 'schema') {
        output = generateJsonSchema(value, name, { nullAs });
      } else {
        output = generateSampleText(value, { seed: sampleSeed, arrayLength: sampleArrayLength });
      }
      return { output, error: null, rows, fixes, typeCount, fieldCount };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : String(error),
        rows,
        fixes,
        typeCount,
        fieldCount,
      };
    }
  }, [
    input,
    javaAccessors,
    javaToString,
    goPointers,
    nullAsSkip,
    parsed,
    pythonTypedDict,
    rootName,
    sampleArrayLength,
    sampleSeed,
    sqlTableName,
    target,
    tsExported,
    tsNullable,
    useTypeAlias,
  ]);

  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.json,.json5,.txt,application/json,text/plain', multiple: false });
      const file = files[0];
      if (!file) return;
      setInput(await readAsText(file));
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (generated.output === '') return;
    const meta = CODE_TARGETS.find((item) => item.value === target);
    downloadText(exportName('json-to-code', meta?.ext ?? 'txt'), generated.output, MIME_BY_TARGET[target]);
  }, [generated.output, target]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Code2 className="size-4" />
          JSON 转代码
        </span>
      }
      description="由一份 JSON 样例推断类型，生成 TypeScript / Java / Python / Go / SQL / JSON Schema"
      actions={
        <div className="flex flex-row gap-1">
          <Button size="sm" variant="outline" onClick={() => void handlePick()} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={input === ''} />
        </div>
      }
    >
      <Note tone="info" title="使用说明">
        <span className="inline-flex items-center gap-1">
          <FileJson className="size-3.5" />
          左侧贴一份真实结构的 JSON 样例即可。所有字段都会按样例推断，建议提供包含多种类型的完整对象数组。
        </span>
      </Note>
      <Tabs value={target} onValueChange={(value) => setTarget(value as CodeTarget)}>
        <TabsList>
          {CODE_TARGETS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={target === item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {target === 'sample' && (
        <Note tone="info" title="示例数据说明">
          <span className="inline-flex items-center gap-1">
            <Repeat className="size-3.5" />
            示例数据用于快速造出符合推断结构的测试数据，数值随机但可复现，不保证业务语义正确。
          </span>
        </Note>
      )}

      {target === 'schema' && (
        <Note tone="info" title="Schema 适用范围">
          <span className="inline-flex items-center gap-1">
            <Languages className="size-3.5" />
            生成的是 draft-07 的常用子集，只描述「样例里出现过的类型」，不包含枚举取值与格式约束。
          </span>
        </Note>
      )}
      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
              <ClipboardPaste className="size-3.5" />
              示例
            </Button>
            <TextField
              label="根类型名"
              horizontal={true}
              value={rootName}
              onChange={setRootName}
              placeholder="Root"
              className="w-40"
              hint="会转成 PascalCase"
            />
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="粘贴一份 JSON 样例（支持 JSON5）"
            spellCheck={false}
            aria-label="JSON 样例输入"
            className="min-h-48 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" />
              {input.trim() === ''
                ? '等待输入'
                : parsed.ok
                  ? `已解析 ${formatBytes(new TextEncoder().encode(input).length)}`
                  : '解析失败'}
            </span>
            {fileNote && <span className="truncate">{fileNote}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <ResultBox
            label={`${CODE_TARGETS.find((item) => item.value === target)?.label ?? ''} 输出`}
            value={generated.output}
            error={generated.error}
            onCopy={() => copyText(generated.output)}
            rows="min-h-48"
            fill
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={generated.output === ''}>
              <Download className="size-3.5" />
              下载文件
            </Button>
            <Hint>
              {generated.output === ''
                ? '生成内容后可以下载。'
                : `输出 ${formatBytes(new TextEncoder().encode(generated.output).length)}`}
            </Hint>
          </div>
        </div>
      </div>

      <Section title="生成选项" description="按目标语言显示对应开关">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {target === 'ts' && (
            <>
              <Checkbox
                label="使用 type 别名"
                checked={useTypeAlias}
                onChange={setUseTypeAlias}
                hint="关闭时生成 interface"
              />
              <Checkbox label="所有字段可空" checked={tsNullable} onChange={setTsNullable} hint="统一加上 | null" />
              <Checkbox label="加 export 前缀" checked={tsExported} onChange={setTsExported} />
            </>
          )}
          {target === 'java' && (
            <>
              <Checkbox label="生成 getter/setter" checked={javaAccessors} onChange={setJavaAccessors} />
              <Checkbox label="生成 toString" checked={javaToString} onChange={setJavaToString} />
            </>
          )}
          {target === 'python' && (
            <Checkbox
              label="使用 TypedDict"
              checked={pythonTypedDict}
              onChange={setPythonTypedDict}
              hint="关闭时生成 @dataclass"
            />
          )}
          {target === 'go' && (
            <Checkbox label="可选字段用指针" checked={goPointers} onChange={setGoPointers} hint="关闭时统一用值类型" />
          )}
          {target === 'sql' && (
            <TextField label="表名" value={sqlTableName} onChange={setSqlTableName} placeholder="留空则用 items" />
          )}
          {target === 'sample' && (
            <>
              <NumberField
                label="随机种子"
                value={sampleSeed}
                onChange={setSampleSeed}
                min={0}
                hint="相同种子结果可复现"
              />
              <NumberField
                label="数组元素数"
                value={sampleArrayLength}
                onChange={setSampleArrayLength}
                min={1}
                max={20}
              />
            </>
          )}
          {target === 'schema' && <Hint>生成的 Schema 是 draft-07 子集，可直接粘贴到 JSON 校验页使用。</Hint>}
        </div>
        <Checkbox
          label="null 字段直接丢弃"
          checked={nullAsSkip}
          onChange={setNullAsSkip}
          hint="关闭时 null 视为一种类型，生成可空字段"
        />
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1">
            <ListTree className="size-3.5" />
            类型推断树
          </span>
        }
        description="父在子之前，显示推断出的类型与字段 / 元素数量"
        actions={
          <span className="inline-flex items-center gap-1">
            <Table2 className="size-3.5" />
            {generated.rows.length} 个节点
          </span>
        }
      >
        {generated.rows.length === 0 ? (
          <EmptyHint>输入 JSON 样例后显示推断出的类型结构。</EmptyHint>
        ) : (
          <div className="max-h-64 overflow-auto rounded-md border p-2 scrollbar-thin">
            <ul className="space-y-0.5">
              {generated.rows.map((row) => (
                <li
                  key={`${row.depth}:${row.name}:${row.type}`}
                  className="flex items-baseline gap-2 font-mono text-xs"
                  style={{ paddingLeft: `${row.depth * 12}px` }}
                >
                  <span className="truncate text-foreground">{row.name}</span>
                  <span className="shrink-0 text-primary">{row.type}</span>
                  {row.detail !== '' && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{row.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <Braces className="size-3.5" />
              结构统计
            </span>
          }
        >
          <StatGrid>
            <Stat label="类型节点" value={generated.typeCount} />
            <Stat label="对象字段" value={generated.fieldCount} />
            <Stat
              label="改名键数"
              value={generated.fixes.length}
              tone={generated.fixes.length === 0 ? 'success' : 'warn'}
            />
            <Stat label="输出行数" value={generated.output === '' ? 0 : generated.output.split('\n').length} />
          </StatGrid>
        </Section>

        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <Wand2 className="size-3.5" />
              键名改写
            </span>
          }
          description="JSON 键转成标识符时的调整"
        >
          {generated.fixes.length === 0 ? (
            <Hint>所有键名都可以直接作为合法标识符，无需改写。</Hint>
          ) : (
            <ResultBox
              label={`${generated.fixes.length} 个键被改写`}
              value={generated.fixes.map((fix) => `${fix.path} → ${fix.name}`).join('\n')}
              rows="min-h-24"
            />
          )}
        </Section>
      </div>

      <Section
        title={
          <span className="inline-flex items-center gap-1">
            <Database className="size-3.5" />
            类型映射约定
          </span>
        }
      >
        <div className="grid gap-3 text-[11px] text-muted-foreground sm:grid-cols-2">
          <ul className="list-disc space-y-0.5 pl-4">
            <li>TypeScript：整数与小数同为 number，可空字段加 | null。</li>
            <li>Java：整数用 Integer / Long，小数用 Double，列表用 List&lt;T&gt;。</li>
            <li>Python：整数 int、小数 float、列表 List[T]，可空字段包在 Optional 里。</li>
          </ul>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Go：字符串 string、布尔 bool、整数 int64、小数 float64，可选字段用指针。</li>
            <li>SQL：嵌套对象与数组统一存 JSON 列，主键按 id / *_id / uuid / code / key 猜测。</li>
            <li>示例数据：按键名猜内容（如 mail、created_at、uuid），相同种子结果一致。</li>
          </ul>
        </div>
      </Section>
    </ToolPanel>
  );
}
