import JSON5 from 'json5';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Download,
  FileJson,
  FolderOpen,
  Info,
  Layers,
  Repeat,
  Rows3,
  Wand2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { ClearButton, copyText, ResultBox } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { formatBytes } from '../lib/bytes';
import { downloadText, exportName, pickFiles, readAsText } from '../lib/file';
import {
  type CsvDelimiter,
  csvToJson,
  DATA_FORMATS,
  type DataFormat,
  findInvalidXmlTagKeys,
  type JsonToCsvOptions,
  type JsonToXmlOptions,
  type JsonType,
  jsonToCsv,
  jsonToToml,
  jsonToXml,
  jsonToYaml,
  sniffFormat,
  splitDocuments,
  summarizeJson,
  type TomlNullMode,
  tomlToJson,
  xmlToJson,
  yamlToJson,
} from '../lib/json-convert';

type Direction = 'fromJson' | 'toJson';
type FormatTab = 'json' | 'csv' | 'xml' | 'yaml' | 'toml';

interface ConvertOutcome {
  ok: boolean;
  output: string;
  error: string | null;
  /** 输出目标格式，用于决定下载扩展名。 */
  target: DataFormat | 'json';
}

const FORMAT_LABEL: Record<FormatTab, string> = {
  json: 'JSON',
  csv: 'CSV',
  xml: 'XML',
  yaml: 'YAML',
  toml: 'TOML',
};

const TARGET_TYPE_LABEL: Record<JsonType | 'mixed', string> = {
  null: 'null',
  boolean: '布尔',
  number: '数字',
  string: '字符串',
  array: '数组',
  object: '对象',
  mixed: '混合类型',
};

const SAMPLES: Record<FormatTab, string> = {
  json: JSON.stringify(
    {
      id: 1001,
      name: '示例用户',
      email: 'user@example.com',
      active: true,
      score: 9.5,
      tags: ['admin', 'vip'],
      profile: { city: '上海', remark: null },
      history: [{ date: '2024-01-01', action: 'login' }],
    },
    null,
    2,
  ),
  csv: 'id,name,email,active,score,tags\n1001,示例用户,user@example.com,true,9.5,"admin|vip"\n1002,张三,zhang@example.com,false,7,"guest"\n',
  xml: '<?xml version="1.0" encoding="UTF-8"?>\n<user id="1001">\n  <name>示例用户</name>\n  <email>user@example.com</email>\n  <active>true</active>\n  <tags>\n    <tag>admin</tag>\n    <tag>vip</tag>\n  </tags>\n  <profile>\n    <city>上海</city>\n  </profile>\n</user>\n',
  yaml: 'id: 1001\nname: 示例用户\nemail: user@example.com\nactive: true\nscore: 9.5\ntags:\n  - admin\n  - vip\nprofile:\n  city: 上海\n  remark: null\n',
  toml: 'id = 1001\nname = "示例用户"\nemail = "user@example.com"\nactive = true\nscore = 9.5\ntags = ["admin", "vip"]\n\n[profile]\ncity = "上海"\n',
};

const delimiterOptions = [
  { value: 'auto', label: '自动探测' },
  { value: ',', label: '逗号 ,' },
  { value: ';', label: '分号 ;' },
  { value: '\t', label: '制表符 \\t' },
];

const csvInferOptions = [
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
];

const xmlArrayOptions = [
  { value: 'repeat', label: '同名标签重复' },
  { value: 'item', label: '<item> 包裹' },
];

const tomlNullOptions = [
  { value: 'empty', label: '空字符串' },
  { value: 'skip', label: '丢弃该键' },
];

export default function JsonConvert() {
  const [direction, setDirection] = useState<Direction>('fromJson');
  const [tab, setTab] = useState<FormatTab>('csv');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  // JSON → 其它格式的选项
  const [csvHeader, setCsvHeader] = useState(true);
  const [csvBom, setCsvBom] = useState(false);
  const [csvLineEnding, setCsvLineEnding] = useState<'lf' | 'crlf'>('crlf');
  const [xmlIndent, setXmlIndent] = useState(2);
  const [xmlDeclaration, setXmlDeclaration] = useState(true);
  const [xmlArrayMode, setXmlArrayMode] = useState<'repeat' | 'item'>('repeat');
  const [xmlItemName, setXmlItemName] = useState('item');
  const [xmlRootName, setXmlRootName] = useState('root');
  const [yamlIndent, setYamlIndent] = useState(2);
  const [yamlFlow, setYamlFlow] = useState(false);
  const [tomlNull, setTomlNull] = useState<TomlNullMode>('empty');

  // 其它格式 → JSON 的选项
  const [csvDelimiter, setCsvDelimiter] = useState<CsvDelimiter>('auto');
  const [csvInfer, setCsvInfer] = useState(true);
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  const [xmlStripNamespace, setXmlStripNamespace] = useState(true);
  const [xmlParseScalars, setXmlParseScalars] = useState(true);

  const jsonSource = useMemo(() => {
    if (direction === 'fromJson') return input;
    // 反向转换时，JSON 作为结果展示，这里不参与解析。
    return '';
  }, [direction, input]);

  const parsedJson = useMemo(() => {
    if (direction !== 'fromJson' || jsonSource.trim() === '') return { value: null as unknown, ok: true, error: null };
    try {
      return { value: JSON5.parse(jsonSource) as unknown, ok: true, error: null };
    } catch (error) {
      return {
        value: null,
        ok: false,
        error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }, [direction, jsonSource]);

  const outcome = useMemo<ConvertOutcome>(() => {
    const empty: ConvertOutcome = { ok: true, output: '', error: null, target: 'json' };
    if (input.trim() === '') return empty;

    try {
      if (direction === 'fromJson') {
        if (!parsedJson.ok) return { ok: false, output: '', error: parsedJson.error, target: 'json' };
        const value = parsedJson.value;
        if (tab === 'json') {
          return { ok: true, output: JSON.stringify(value, null, 2), error: null, target: 'json' };
        }
        if (tab === 'csv') {
          const options: JsonToCsvOptions = {
            header: csvHeader,
            bom: csvBom,
            lineEnding: csvLineEnding === 'crlf' ? '\r\n' : '\n',
          };
          return { ok: true, output: jsonToCsv(value, options), error: null, target: 'csv' };
        }
        if (tab === 'xml') {
          const options: JsonToXmlOptions = {
            indent: xmlIndent,
            declaration: xmlDeclaration,
            arrayMode: xmlArrayMode,
            arrayItemName: xmlItemName.trim() === '' ? 'item' : xmlItemName.trim(),
            arrayRootName: xmlRootName.trim() === '' ? 'root' : xmlRootName.trim(),
          };
          return {
            ok: true,
            output: jsonToXml(value, xmlRootName.trim() || 'root', options),
            error: null,
            target: 'xml',
          };
        }
        if (tab === 'yaml') {
          return {
            ok: true,
            output: jsonToYaml(value, { indent: yamlIndent, flow: yamlFlow }),
            error: null,
            target: 'yaml',
          };
        }
        return { ok: true, output: jsonToToml(value, { nullAs: tomlNull }), error: null, target: 'toml' };
      }

      if (tab === 'json')
        return { ok: true, output: JSON.stringify(JSON5.parse(input), null, 2), error: null, target: 'json' };
      if (tab === 'csv') {
        return {
          ok: true,
          output: JSON.stringify(
            csvToJson(input, { delimiter: csvDelimiter, inferTypes: csvInfer, header: csvHasHeader }),
            null,
            2,
          ),
          error: null,
          target: 'json',
        };
      }
      if (tab === 'xml') {
        return {
          ok: true,
          output: JSON.stringify(
            xmlToJson(input, { stripNamespace: xmlStripNamespace, parseScalars: xmlParseScalars }),
            null,
            2,
          ),
          error: null,
          target: 'json',
        };
      }
      if (tab === 'yaml')
        return { ok: true, output: JSON.stringify(yamlToJson(input), null, 2), error: null, target: 'json' };
      return { ok: true, output: JSON.stringify(tomlToJson(input), null, 2), error: null, target: 'json' };
    } catch (error) {
      return { ok: false, output: '', error: error instanceof Error ? error.message : String(error), target: 'json' };
    }
  }, [
    csvBom,
    csvDelimiter,
    csvHasHeader,
    csvHeader,
    csvInfer,
    csvLineEnding,
    direction,
    input,
    parsedJson,
    tab,
    tomlNull,
    xmlArrayMode,
    xmlDeclaration,
    xmlIndent,
    xmlItemName,
    xmlParseScalars,
    xmlRootName,
    xmlStripNamespace,
    yamlFlow,
    yamlIndent,
  ]);

  /** 反向转换时的结果对象，用于右侧统计。 */
  const resultValue = useMemo<unknown>(() => {
    if (!outcome.ok || outcome.output === '') return null;
    try {
      return JSON.parse(outcome.output) as unknown;
    } catch {
      return null;
    }
  }, [outcome]);

  const summary = useMemo(() => {
    if (direction === 'fromJson')
      return parsedJson.ok && parsedJson.value !== null ? summarizeJson(parsedJson.value) : null;
    return resultValue === null ? null : summarizeJson(resultValue);
  }, [direction, parsedJson, resultValue]);

  const invalidTags = useMemo(() => {
    if (direction !== 'fromJson' || tab !== 'xml' || !parsedJson.ok) return [];
    return findInvalidXmlTagKeys(parsedJson.value, xmlRootName.trim() || 'root');
  }, [direction, parsedJson, tab, xmlRootName]);

  const sniffed = useMemo(() => (input.trim() === '' ? 'unknown' : sniffFormat(input)), [input]);

  const documents = useMemo(() => (input.trim() === '' ? [] : splitDocuments(input)), [input]);

  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({ accept: '.json,.csv,.xml,.yaml,.yml,.toml,text/plain', multiple: false });
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
    if (!outcome.ok || outcome.output === '') return;
    const meta = DATA_FORMATS.find((item) => item.value === outcome.target);
    downloadText(exportName('convert', meta?.ext ?? 'txt'), outcome.output, meta?.mime);
  }, [outcome]);

  const outputLabel = direction === 'fromJson' ? `${FORMAT_LABEL[tab]} 输出` : 'JSON 输出';

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <Repeat className="size-4" />
          JSON / CSV / XML / YAML / TOML 转换
        </span>
      }
      description="JSON 与结构化文本格式互转，纯本地处理不上传任何数据"
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
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={direction} onValueChange={(value) => setDirection(value as Direction)}>
          <TabsList>
            <TabsTrigger value="fromJson" active={direction === 'fromJson'}>
              <span className="inline-flex items-center gap-1">
                <ArrowRight className="size-3.5" />
                JSON 转其它
              </span>
            </TabsTrigger>
            <TabsTrigger value="toJson" active={direction === 'toJson'}>
              <span className="inline-flex items-center gap-1">
                <ArrowLeft className="size-3.5" />
                其它转 JSON
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={tab} onValueChange={(value) => setTab(value as FormatTab)}>
          <TabsList>
            {DATA_FORMATS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid flex-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLES[tab])}>
              <ClipboardPaste className="size-3.5" />
              {FORMAT_LABEL[tab]} 示例
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDirection(direction === 'fromJson' ? 'toJson' : 'fromJson')}
              aria-label="交换转换方向"
            >
              <Wand2 className="size-3.5" />
              切换方向
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={direction === 'fromJson' ? '粘贴 JSON 内容' : `粘贴 ${FORMAT_LABEL[tab]} 内容`}
            spellCheck={false}
            aria-label={`${FORMAT_LABEL[tab]} 输入`}
            className="min-h-48 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" />
              {input.trim() === '' ? '等待输入' : `嗅探为 ${sniffed === 'unknown' ? '未知' : sniffed.toUpperCase()}`}
            </span>
            {fileNote && <span className="truncate">{fileNote}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <ResultBox
            label={outputLabel}
            value={outcome.output}
            error={outcome.error}
            onCopy={() => copyText(outcome.output)}
            rows="min-h-48"
            fill
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!outcome.ok || outcome.output === ''}
            >
              <Download className="size-3.5" />
              下载 {FORMAT_LABEL[outcome.target as FormatTab]}
            </Button>
            <Hint>
              {outcome.output === ''
                ? '输出为空时无法下载。'
                : `输出 ${formatBytes(new TextEncoder().encode(outcome.output).length)}`}
            </Hint>
          </div>
        </div>
      </div>

      <Section title="转换选项" description="选项只作用于当前格式，切换标签后各自保留">
        {direction === 'fromJson' && tab === 'json' && (
          <Hint>JSON → JSON 用于规范化键顺序与缩进，可配合「键排序」使用。</Hint>
        )}

        {direction === 'fromJson' && tab === 'csv' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="输出表头" checked={csvHeader} onChange={setCsvHeader} hint="关闭后只输出数据行" />
            <Checkbox label="添加 UTF-8 BOM" checked={csvBom} onChange={setCsvBom} hint="Excel 打开中文 CSV 更稳" />
            <Select
              label="行尾符"
              value={csvLineEnding}
              onChange={(value) => setCsvLineEnding(value as 'lf' | 'crlf')}
              options={[
                { value: 'crlf', label: 'CRLF（RFC 4180）' },
                { value: 'lf', label: 'LF（Unix）' },
              ]}
            />
          </div>
        )}

        {direction === 'toJson' && tab === 'csv' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="分隔符"
              value={csvDelimiter}
              onChange={(value) => setCsvDelimiter(value as CsvDelimiter)}
              options={delimiterOptions}
            />
            <Select
              label="类型识别"
              value={csvInfer ? 'on' : 'off'}
              onChange={(value) => setCsvInfer(value === 'on')}
              options={csvInferOptions}
              hint="识别 true / false / null / 数字"
            />
            <Checkbox
              label="首行是表头"
              checked={csvHasHeader}
              onChange={setCsvHasHeader}
              hint="关闭时使用列1、列2…作为键"
            />
            <Checkbox
              label="空单元格转 null"
              checked
              onChange={() => {}}
              hint="与 JSON → CSV 的 null→空串互为逆操作"
              disabled
            />
          </div>
        )}

        {direction === 'fromJson' && tab === 'xml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="根节点名" value={xmlRootName} onChange={setXmlRootName} hint="非法字符会自动替换" />
            <NumberField label="缩进空格" value={xmlIndent} onChange={setXmlIndent} min={0} max={8} />
            <Select
              label="数组写法"
              value={xmlArrayMode}
              onChange={(value) => setXmlArrayMode(value as 'repeat' | 'item')}
              options={xmlArrayOptions}
            />
            <TextField
              label="item 标签名"
              value={xmlItemName}
              onChange={setXmlItemName}
              disabled={xmlArrayMode !== 'item'}
            />
            <Checkbox label="输出 XML 声明" checked={xmlDeclaration} onChange={setXmlDeclaration} />
          </div>
        )}

        {direction === 'toJson' && tab === 'xml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox
              label="去掉命名空间前缀"
              checked={xmlStripNamespace}
              onChange={setXmlStripNamespace}
              hint="ns:name → name"
            />
            <Checkbox
              label="推断标量类型"
              checked={xmlParseScalars}
              onChange={setXmlParseScalars}
              hint="把 123 / true 转成对应类型"
            />
          </div>
        )}

        {direction === 'fromJson' && tab === 'yaml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="缩进空格" value={yamlIndent} onChange={setYamlIndent} min={1} max={8} />
            <Checkbox label="紧凑流式写法" checked={yamlFlow} onChange={setYamlFlow} hint="输出为 { a: 1 } 形式" />
          </div>
        )}

        {direction === 'fromJson' && tab === 'toml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="null 处理"
              value={tomlNull}
              onChange={(value) => setTomlNull(value as TomlNullMode)}
              options={tomlNullOptions}
            />
            <Hint>TOML 没有 null 概念，只能按上面的方式取舍。</Hint>
          </div>
        )}

        {direction === 'toJson' && tab !== 'csv' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {tab === 'json' && <Hint>使用 JSON5 宽松解析，注释与尾逗号都会被忽略。</Hint>}
            {tab === 'xml' && <Hint>属性统一以 @ 开头；同名子节点会合并成数组。</Hint>}
            {tab === 'yaml' && <Hint>支持多文档 YAML，读取时会取第一份文档。</Hint>}
            {tab === 'toml' && <Hint>TOML 根节点一定是表，因此输出始终是 JSON 对象。</Hint>}
          </div>
        )}
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="结果统计" description="转换后的结构概览">
          {summary === null ? (
            <EmptyHint>转换成功后显示根类型、字段数与深度。</EmptyHint>
          ) : (
            <StatGrid>
              <Stat label="根类型" value={TARGET_TYPE_LABEL[summary.type]} />
              <Stat label="字段数" value={summary.keys} />
              <Stat label="元素个数" value={summary.items} />
              <Stat label="最大深度" value={summary.depth} />
              <Stat label="输入体积" value={formatBytes(new TextEncoder().encode(input).length)} />
              <Stat
                label="输出体积"
                value={outcome.output === '' ? '0 B' : formatBytes(new TextEncoder().encode(outcome.output).length)}
              />
              <Stat label="文档段数" value={documents.length} />
              <Stat
                label="XML 非法标签"
                value={invalidTags.length}
                tone={invalidTags.length === 0 ? 'success' : 'warn'}
              />
            </StatGrid>
          )}
        </Section>

        <Section title="批量与结构提示" description="多段文档、格式嗅探与标签名检查">
          {documents.length > 1 ? (
            <Hint>
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5" />
                检测到 {documents.length} 段文档，转换只处理整段内容。
              </span>
            </Hint>
          ) : (
            <Hint>
              <span className="inline-flex items-center gap-1">
                <Rows3 className="size-3.5" />
                单段文档。
              </span>
            </Hint>
          )}
          {invalidTags.length > 0 && (
            <Note tone="warn" title={`${invalidTags.length} 个键名会被 XML 标签规则替换`}>
              {invalidTags
                .slice(0, 6)
                .map((item) => `${item.path} → &lt;${item.tag}&gt;`)
                .join('；')}
              {invalidTags.length > 6 ? '；…' : ''}
            </Note>
          )}
          {invalidTags.length === 0 && input.trim() !== '' && (
            <Note tone="success" title="标签名检查通过">
              所有键名都能直接作为 XML 元素名使用。
            </Note>
          )}
        </Section>
      </div>

      <Note tone="info" title="转换约定">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>CSV：对象数组按列转表头；嵌套对象与数组压缩成 JSON 字符串；null 写成空单元格。</li>
          <li>XML：以 @ 开头的键写成属性；其余键写成子元素；同名子元素合并为数组；非法标签名按规则替换。</li>
          <li>YAML：保留 null 语义，多文档输入只取第一份。</li>
          <li>TOML：根节点必须是对象；null 按选项变成空串或被丢弃。</li>
        </ul>
      </Note>

      <Section title="示例数据" description="按当前 Tab 填入一段可直接转换的样例">
        <div className="flex flex-wrap gap-2">
          {DATA_FORMATS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={item.value === tab ? 'default' : 'outline'}
              onClick={() => {
                setTab(item.value);
                setInput(SAMPLES[item.value]);
              }}
            >
              <FileJson className="size-3.5" />
              {item.label}
            </Button>
          ))}
        </div>
      </Section>
    </ToolPanel>
  );
}
