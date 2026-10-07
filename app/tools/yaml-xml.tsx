import {
  ArrowLeftRight,
  ClipboardPaste,
  Download,
  FileCode2,
  FolderOpen,
  Info,
  Layers,
  ListTree,
  ShieldCheck,
  Waypoints,
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
  type FormatResult,
  formatXml,
  formatYaml,
  minifyXml,
  minifyYaml,
  sourceLine,
  splitYamlDocuments,
  summarizeXml,
  summarizeYaml,
  xmlToYaml,
  yamlToXml,
} from '../lib/markup';

type Kind = 'yaml' | 'xml';
type YamlTab = 'format' | 'minify' | 'structure' | 'docs';
type XmlTab = 'format' | 'minify' | 'structure' | 'cross';
/** 互转方向：toYaml 以 XML 为输入，toXml 以 YAML 为输入。 */
type CrossDir = 'toYaml' | 'toXml';

const SAMPLES: Record<Kind, string> = {
  yaml: '# 注释\nname:   示例\nversion: 1\nlist:\n  -   a\n  -   b\nnested:\n  deep:\n    value: true\n',
  xml: '<?xml version="1.0" encoding="UTF-8"?>\n<root id="1">\n  <name>示例</name>\n  <list>\n    <item>a</item>\n    <item>b</item>\n  </list>\n  <nested>\n    <value>true</value>\n  </nested>\n</root>\n',
};

function issueText(result: FormatResult<unknown>): string | null {
  return result.ok ? null : result.issues.map((issue) => issue.message).join('\n') || '处理失败';
}

export default function YamlXml() {
  const [kind, setKind] = useState<Kind>('yaml');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const [yamlTab, setYamlTab] = useState<YamlTab>('format');
  const [xmlTab, setXmlTab] = useState<XmlTab>('format');
  const [yamlIndent, setYamlIndent] = useState(2);
  const [yamlLineWidth, setYamlLineWidth] = useState(100);
  const [xmlIndent, setXmlIndent] = useState(2);

  // XML ↔ YAML 互转选项
  const [crossDir, setCrossDir] = useState<CrossDir>('toYaml');
  const [stripNamespace, setStripNamespace] = useState(true);
  const [parseScalars, setParseScalars] = useState(true);
  const [crossRootName, setCrossRootName] = useState('root');
  const [crossDeclaration, setCrossDeclaration] = useState(true);

  const formattedYaml = useMemo(
    () => (input.trim() === '' ? null : formatYaml(input, yamlIndent, yamlLineWidth)),
    [input, yamlIndent, yamlLineWidth],
  );
  const minifiedYaml = useMemo(() => (input.trim() === '' ? null : minifyYaml(input)), [input]);
  const yamlSummary = useMemo(() => (input.trim() === '' ? null : summarizeYaml(input)), [input]);
  const yamlDocs = useMemo(() => (input.trim() === '' ? null : splitYamlDocuments(input)), [input]);

  const formattedXml = useMemo(() => (input.trim() === '' ? null : formatXml(input, xmlIndent)), [input, xmlIndent]);
  const minifiedXml = useMemo(() => (input.trim() === '' ? null : minifyXml(input)), [input]);
  const xmlSummary = useMemo(() => (input.trim() === '' ? null : summarizeXml(input)), [input]);

  // 互转只计算当前方向，另一方向留空以免给出无意义的报错。
  const xmlToYamlResult = useMemo(
    () =>
      input.trim() === '' || crossDir !== 'toYaml'
        ? null
        : xmlToYaml(input, { indent: yamlIndent, stripNamespace, parseScalars }),
    [input, crossDir, yamlIndent, stripNamespace, parseScalars],
  );
  const yamlToXmlResult = useMemo(
    () =>
      input.trim() === '' || crossDir !== 'toXml'
        ? null
        : yamlToXml(input, {
            rootName: crossRootName.trim() === '' ? 'root' : crossRootName.trim(),
            indent: xmlIndent,
            declaration: crossDeclaration,
          }),
    [input, crossDir, crossRootName, xmlIndent, crossDeclaration],
  );

  // 互转页签下「XML」侧的输入语义由方向决定：转 XML 时左侧其实是 YAML。
  const inputLang: 'yaml' | 'xml' = kind === 'xml' && xmlTab === 'cross' && crossDir === 'toXml' ? 'yaml' : kind;

  const handlePick = useCallback(async () => {
    setBusy(true);
    try {
      const files = await pickFiles({
        accept: inputLang === 'yaml' ? '.yaml,.yml,text/plain' : '.xml,text/xml,text/plain',
        multiple: false,
      });
      const file = files[0];
      if (!file) return;
      setInput(await readAsText(file));
      setFileNote(`已读取 ${file.name}（${formatBytes(file.size)}）`);
    } catch (error) {
      setFileNote(`读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [inputLang]);

  const activeTab: YamlTab | XmlTab = kind === 'yaml' ? yamlTab : xmlTab;
  const currentOutput = useMemo(() => {
    if (kind === 'yaml') {
      if (yamlTab === 'format') return formattedYaml?.ok === true ? formattedYaml.value : '';
      if (yamlTab === 'minify') return minifiedYaml?.ok === true ? minifiedYaml.value : '';
      if (yamlTab === 'structure') return yamlSummary?.ok === true ? JSON.stringify(yamlSummary.value, null, 2) : '';
      return yamlDocs?.documents.map((doc) => `# --- 文档 ${doc.index} ---\n${doc.text}`).join('\n') ?? '';
    }
    if (xmlTab === 'format') return formattedXml?.ok === true ? formattedXml.value : '';
    if (xmlTab === 'minify') return minifiedXml?.ok === true ? minifiedXml.value : '';
    if (xmlTab === 'structure') return xmlSummary?.ok === true ? JSON.stringify(xmlSummary.value, null, 2) : '';
    if (crossDir === 'toYaml') return xmlToYamlResult?.ok === true ? xmlToYamlResult.value : '';
    return yamlToXmlResult?.ok === true ? yamlToXmlResult.value : '';
  }, [
    kind,
    crossDir,
    yamlTab,
    xmlTab,
    formattedYaml,
    minifiedYaml,
    yamlSummary,
    yamlDocs,
    formattedXml,
    minifiedXml,
    xmlSummary,
    xmlToYamlResult,
    yamlToXmlResult,
  ]);

  const currentError = useMemo(() => {
    if (kind === 'yaml') {
      if (yamlTab === 'format') return issueText(formattedYaml ?? { ok: false, issues: [] });
      if (yamlTab === 'minify') return issueText(minifiedYaml ?? { ok: false, issues: [] });
      if (yamlTab === 'structure') return issueText(yamlSummary ?? { ok: false, issues: [] });
      return null;
    }
    if (xmlTab === 'format') return issueText(formattedXml ?? { ok: false, issues: [] });
    if (xmlTab === 'minify') return issueText(minifiedXml ?? { ok: false, issues: [] });
    if (xmlTab === 'structure') return issueText(xmlSummary ?? { ok: false, issues: [] });
    if (crossDir === 'toYaml') return issueText(xmlToYamlResult ?? { ok: false, issues: [] });
    return issueText(yamlToXmlResult ?? { ok: false, issues: [] });
  }, [
    kind,
    crossDir,
    yamlTab,
    xmlTab,
    formattedYaml,
    minifiedYaml,
    yamlSummary,
    formattedXml,
    minifiedXml,
    xmlSummary,
    xmlToYamlResult,
    yamlToXmlResult,
  ]);

  // 结构摘要页签导出 JSON，其余按实际输出格式决定扩展名。
  const outputFormat = useMemo((): { ext: string; mime: string; base: string } => {
    const isJson = (kind === 'yaml' && yamlTab === 'structure') || (kind === 'xml' && xmlTab === 'structure');
    if (isJson) return { ext: 'json', mime: 'application/json;charset=utf-8', base: 'summary' };
    const isYaml =
      (kind === 'yaml' && yamlTab !== 'structure') || (kind === 'xml' && xmlTab === 'cross' && crossDir === 'toYaml');
    return isYaml
      ? { ext: 'yaml', mime: 'application/yaml;charset=utf-8', base: 'formatted' }
      : { ext: 'xml', mime: 'application/xml;charset=utf-8', base: 'formatted' };
  }, [kind, yamlTab, xmlTab, crossDir]);

  const handleDownload = useCallback(() => {
    if (currentOutput === '') return;
    downloadText(exportName(outputFormat.base, outputFormat.ext), currentOutput, outputFormat.mime);
  }, [currentOutput, outputFormat]);

  return (
    <ToolPanel
      title={
        <span className="flex items-center gap-1.5">
          <FileCode2 className="size-4" />
          YAML / XML 工具
        </span>
      }
      description="格式化、压缩、结构校验与互转，全部在本地完成"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => void handlePick()} disabled={busy}>
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
          <ClearButton onClick={() => setInput('')} disabled={input === ''} />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
          <TabsList>
            <TabsTrigger value="yaml" active={kind === 'yaml'}>
              YAML
            </TabsTrigger>
            <TabsTrigger value="xml" active={kind === 'xml'}>
              XML
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (kind === 'yaml') setYamlTab(value as YamlTab);
            else setXmlTab(value as XmlTab);
          }}
        >
          <TabsList>
            <TabsTrigger value="format" active={activeTab === 'format'}>
              格式化
            </TabsTrigger>
            <TabsTrigger value="minify" active={activeTab === 'minify'}>
              压缩
            </TabsTrigger>
            <TabsTrigger value="structure" active={activeTab === 'structure'}>
              结构校验
            </TabsTrigger>
            {kind === 'yaml' ? (
              <TabsTrigger value="docs" active={activeTab === 'docs'}>
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3.5" />
                  多文档
                </span>
              </TabsTrigger>
            ) : (
              <TabsTrigger value="cross" active={activeTab === 'cross'}>
                <span className="inline-flex items-center gap-1">
                  <ArrowLeftRight className="size-3.5" />
                  互转
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLES[kind])}>
              <ClipboardPaste className="size-3.5" />
              {inputLang === 'yaml' ? 'YAML' : 'XML'} 示例
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={kind === 'yaml' || inputLang === 'yaml' ? '粘贴 YAML 内容，支持多文档' : '粘贴 XML 内容'}
            spellCheck={false}
            aria-label={`${inputLang === 'yaml' ? 'YAML' : 'XML'} 输入`}
            className="min-h-48 flex-1 resize-none font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" />
              {input.trim() === ''
                ? '等待输入'
                : currentError !== null
                  ? '解析失败'
                  : `输入 ${formatBytes(new TextEncoder().encode(input).length)}`}
            </span>
            {fileNote && <span className="truncate">{fileNote}</span>}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <ResultBox
            label={`输出（${{ format: '格式化', minify: '压缩', structure: '结构 JSON', docs: '多文档', cross: 'YAML' }[activeTab]}）`}
            value={currentOutput}
            error={currentError}
            onCopy={() => copyText(currentOutput)}
            rows="min-h-48"
            fill
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={currentOutput === ''}>
              <Download className="size-3.5" />
              下载
            </Button>
            <Hint>
              {currentOutput === ''
                ? '没有可下载的内容。'
                : `输出 ${formatBytes(new TextEncoder().encode(currentOutput).length)}`}
            </Hint>
          </div>
        </div>
      </div>

      <Section title="格式化选项" description="只影响当前 Tab 的输出，不修改输入">
        {kind === 'yaml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="缩进空格" value={yamlIndent} onChange={setYamlIndent} min={1} max={8} />
            <NumberField
              label="行宽上限"
              value={yamlLineWidth}
              onChange={setYamlLineWidth}
              min={0}
              max={200}
              hint="0 表示不换行"
            />
          </div>
        )}
        {kind === 'xml' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="缩进空格" value={xmlIndent} onChange={setXmlIndent} min={0} max={8} />
          </div>
        )}
      </Section>

      {kind === 'yaml' && yamlTab === 'structure' && (
        <Section title="YAML 结构摘要" description="键数量、数组长度与嵌套深度">
          {yamlSummary === null ? (
            <EmptyHint>解析 YAML 后显示结构摘要。</EmptyHint>
          ) : yamlSummary.ok ? (
            <div className="flex flex-col gap-3">
              <StatGrid>
                <Stat label="根类型" value={yamlSummary.value.rootType} />
                <Stat label="键数量" value={yamlSummary.value.keyCount} />
                <Stat label="数组数量" value={yamlSummary.value.arrayLengths.length} />
                <Stat label="最大深度" value={yamlSummary.value.maxDepth} />
              </StatGrid>
              {yamlSummary.value.arrayLengths.length > 0 && (
                <ResultBox
                  label="数组位置与长度"
                  value={yamlSummary.value.arrayLengths.map((item) => `${item.path}: ${item.length}`).join('\n')}
                />
              )}
            </div>
          ) : (
            <Note tone="danger" title="YAML 解析失败">
              {yamlSummary.issues.map((issue) => issue.message).join('；')}
            </Note>
          )}
        </Section>
      )}

      {kind === 'yaml' && yamlTab === 'docs' && (
        <Section title="多文档拆分" description="按 `---` 分隔符切分并逐段校验">
          {yamlDocs === null ? (
            <EmptyHint>输入含 `---` 的 YAML 后显示拆分结果。</EmptyHint>
          ) : (
            <div className="flex flex-col gap-2">
              <StatGrid>
                <Stat label="文档数量" value={yamlDocs.documentCount} />
                <Stat label="切分段数" value={yamlDocs.documents.length} />
                <Stat
                  label="校验结果"
                  value={yamlDocs.ok ? '全部通过' : '存在问题'}
                  tone={yamlDocs.ok ? 'success' : 'danger'}
                />
              </StatGrid>
              {yamlDocs.documents.map((doc) => (
                <Note key={doc.index} tone={doc.error === null ? 'success' : 'danger'} title={`文档 ${doc.index}`}>
                  {doc.error ?? `${doc.text.split('\n').length} 行`}
                </Note>
              ))}
            </div>
          )}
        </Section>
      )}

      {kind === 'xml' && xmlTab === 'structure' && (
        <Section title="XML 结构摘要" description="良构性、元素与属性统计、命名空间">
          {xmlSummary === null ? (
            <EmptyHint>解析 XML 后显示结构摘要。</EmptyHint>
          ) : xmlSummary.ok ? (
            <div className="flex flex-col gap-3">
              <StatGrid>
                <Stat
                  label="良构性"
                  value={xmlSummary.value.wellFormed ? '通过' : '未通过'}
                  tone={xmlSummary.value.wellFormed ? 'success' : 'danger'}
                />
                <Stat label="元素数量" value={xmlSummary.value.elementCount} />
                <Stat label="属性数量" value={xmlSummary.value.attributeCount} />
                <Stat label="最大深度" value={xmlSummary.value.maxDepth} />
                <Stat label="根元素" value={xmlSummary.value.rootName} />
                <Stat label="命名空间" value={xmlSummary.value.namespaces.length} />
              </StatGrid>
              <ResultBox
                label="标签出现频次"
                value={xmlSummary.value.tagFrequency.map((item) => `${item.name} × ${item.count}`).join('\n')}
              />
              {xmlSummary.value.namespaces.length > 0 && (
                <Note tone="info" title="检测到命名空间">
                  {xmlSummary.value.namespaces.join('、')}
                </Note>
              )}
            </div>
          ) : (
            <Note tone="danger" title="XML 校验未通过">
              {xmlSummary.issues.map((issue) => issue.message).join('；')}
            </Note>
          )}
        </Section>
      )}

      {kind === 'xml' && (
        <Section title="XML ↔ YAML 互转" description="切换方向后，左侧输入需与所选方向对应">
          <Tabs value={crossDir} onValueChange={(value) => setCrossDir(value as CrossDir)}>
            <TabsList>
              <TabsTrigger value="toYaml" active={crossDir === 'toYaml'}>
                <ArrowLeftRight className="size-3.5" />
                XML → YAML
              </TabsTrigger>
              <TabsTrigger value="toXml" active={crossDir === 'toXml'}>
                <ArrowLeftRight className="size-3.5" />
                YAML → XML
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Hint>
            {crossDir === 'toYaml'
              ? '左侧粘贴 XML。属性写成 @attr，同名兄弟合并为数组；混合内容会报错，因为无法确定结构归属。'
              : '左侧粘贴 YAML。映射规则为根键 → 根元素名、@attr → 属性、- 列表 → 重复子元素，其余标量按内容推断。'}
          </Hint>
          <div className="grid gap-3 sm:grid-cols-2">
            {crossDir === 'toYaml' ? (
              <>
                <Checkbox label="去掉命名空间前缀" checked={stripNamespace} onChange={setStripNamespace} />
                <Checkbox label="推断标量类型" checked={parseScalars} onChange={setParseScalars} />
                <NumberField label="YAML 缩进" value={yamlIndent} onChange={setYamlIndent} min={1} max={8} />
              </>
            ) : (
              <>
                <TextField
                  label="根节点名"
                  value={crossRootName}
                  onChange={setCrossRootName}
                  hint="当 YAML 没有可用的根键名时使用"
                />
                <Checkbox label="输出 XML 声明" checked={crossDeclaration} onChange={setCrossDeclaration} />
                <NumberField label="XML 缩进" value={xmlIndent} onChange={setXmlIndent} min={0} max={8} />
              </>
            )}
          </div>
          <Note tone="info" title={crossDir === 'toYaml' ? '下一步' : '下一步'}>
            {crossDir === 'toYaml'
              ? '得到的 YAML 可以粘回「YAML」页签继续格式化，或按上方映射规则再转回 XML。'
              : '得到的 XML 可以粘回「XML」页签做格式化或压缩。'}
          </Note>
        </Section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5" />
              校验说明
            </span>
          }
        >
          <Hint>
            YAML 通过 <code>yaml</code> 的 document 级错误列表校验，可定位到行列；XML 额外做一次标签配平检查，
            能捕获「开始标签没有对应结束标签」这类被部分解析器静默吞掉的问题。
          </Hint>
        </Section>
        <Section
          title={
            <span className="inline-flex items-center gap-1">
              <Waypoints className="size-3.5" />
              互转约定
            </span>
          }
        >
          <Hint>
            XML 转 YAML 时属性写成 <code>@attr</code>，这样再转回 XML 能还原成属性；纯文本元素会按内容推断成数字或布尔，
            关闭「推断标量类型」可全部保留为字符串。
          </Hint>
        </Section>
      </div>

      {input.trim() !== '' && sourceLine(input, 1) !== undefined && (
        <Section title="首行预览" description="用于确认是否存在不可见字符或 BOM">
          <Hint>
            <span className="inline-flex items-center gap-1">
              <ListTree className="size-3.5" />
              {JSON.stringify(sourceLine(input, 1) ?? '')}
            </span>
          </Hint>
        </Section>
      )}
    </ToolPanel>
  );
}
