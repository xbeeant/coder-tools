/** 占位文本生成：内置真实拉丁语 Lorem Ipsum 语料、中文与技术风占位库，可输出 HTML 片段。 */
import { Copy, Download, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Checkbox, NumberField, Select } from '../components/ui/field';
import { Hint, Note, Section, Stat, StatGrid, ToolPanel } from '../components/ui/panel';
import { copyText, ResultBox } from '../components/ui/result';
import { downloadText, exportName } from '../lib/file';

// ── 语料 ─────────────────────────────────────────────────

interface Theme {
  id: string;
  label: string;
  sentences: string[];
}

/** 经典 Lorem Ipsum 拉丁文语料，按主题分组，避免同一句话反复充数。 */
const LATIN_THEMES: Theme[] = [
  {
    id: 'general',
    label: '通用',
    sentences: [
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
      'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
      'Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt.',
    ],
  },
  {
    id: 'city',
    label: '城市与建筑',
    sentences: [
      'Curabitur blandit tempus porttitor. Nulla vitae elit libero, a pharetra augue.',
      'Donec id elit non mi porta gravida at eget metus. Vestibulum id ligula porta felis euismod semper.',
      'Maecenas sed diam eget risus varius blandit sit amet non magna. Cras mattis consectetur purus sit amet fermentum.',
      'Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor.',
      'Sed posuere consectetur est at lobortis. Integer placerat tristique nisl.',
      'Sed quam nisi tempus congue euismod, maximus est euismod magna, eu scelerisque nisl.',
    ],
  },
  {
    id: 'nature',
    label: '自然与田园',
    sentences: [
      'Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh.',
      'Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum.',
      'Praesent blandit. Cras justo odio, dapibus ac facilisis in, egestas eget quam.',
      'Nullam quis risus eget urna mollis ornare vel eu leo.',
      'Etiam porta sem malesuada magna mollis euismod. Cras mattis consectetur purus sit amet fermentum.',
      'Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.',
    ],
  },
  {
    id: 'work',
    label: '工作与商务',
    sentences: [
      'Nunc vel sem sed risus tristique posuere. Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
      'Aenean lacinia bibendum nulla sed consectetur. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.',
      'Donec ullamcorper nulla non metus auctor fringilla. Maecenas sed diam eget risus varius blandit.',
      'Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Fusce dapibus, tellus ac cursus commodo.',
      'Cras mattis consectetur purus sit amet fermentum. Donec id elit non mi porta gravida at eget metus.',
      'Harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est.',
    ],
  },
  {
    id: 'tech',
    label: '技术与系统',
    sentences: [
      'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.',
      'Sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
      'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur.',
      'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium.',
      'Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet.',
      'Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore.',
    ],
  },
  {
    id: 'design',
    label: '设计与创意',
    sentences: [
      'Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores.',
      'Alias consequatur aut perferendis doloribus asperiores repellat. Quia voluptas sit aspernatur aut odit.',
      'Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet.',
      'Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis.',
      'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.',
      'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    ],
  },
  {
    id: 'life',
    label: '生活与日常',
    sentences: [
      'Praesent blandit. Cras justo odio, dapibus ac facilisis in, egestas eget quam.',
      'Nullam quis risus eget urna mollis ornare vel eu leo. Integer placerat tristique nisl.',
      'Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor.',
      'Sed posuere consectetur est at lobortis. Curabitur blandit tempus porttitor.',
      'Maecenas sed diam eget risus varius blandit sit amet non magna. Donec id elit non mi.',
      'Cras mattis consectetur purus sit amet fermentum. Aenean eu leo quam.',
    ],
  },
  {
    id: 'academic',
    label: '学术与研究',
    sentences: [
      'Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae.',
      'Vel illum qui dolorem eum fugiat quo voluptas nulla pariatur. At vero eos et accusamus.',
      'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum.',
      'Sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt neque.',
      'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur.',
      'Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae.',
    ],
  },
];

const LATIN_SENTENCES = LATIN_THEMES.flatMap((theme) => theme.sentences);

const LATIN_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'eiusmod',
  'tempor',
  'labore',
  'magna',
  'aliqua',
  'veniam',
  'nostrud',
  'ullamco',
  'nisi',
  'aliquip',
  'commodo',
  'consequat',
  'aut',
  'irure',
  'reprehenderit',
  'voluptate',
  'cillum',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'occaecat',
  'cupidatat',
  'proident',
  'culpa',
  'officia',
  'deserunt',
  'mollit',
  'anim',
];

const ZH_SENTENCES = [
  '此处填写描述信息，用于说明该区域的主要内容与使用方式。',
  '在这里补充一段说明文字，帮助读者快速理解背景与前提条件。',
  '请填写标题，建议控制在二十个字以内，便于在列表中辨认。',
  '本段为占位内容，正式发布前请替换为真实业务文案。',
  '补充一段细节说明，包括关键步骤、注意事项与常见问题。',
  '这里可以放一段引导文案，告诉用户下一步该做什么。',
  '此处填写联系方式或引用来源，方便读者进一步了解。',
  '一句话概括本节要点，保持简洁有力，避免冗长描述。',
  '此处填写版权声明、版本信息或更新日志摘要。',
  '写下你的结论或行动建议，让内容有明确的落点。',
];

const EN_TECH_SENTENCES = [
  'The service layer retries transient failures with exponential backoff and jitter.',
  'Requests are authenticated with a short-lived token refreshed by the session endpoint.',
  'The pipeline caches build artifacts keyed by lockfile hash to avoid redundant work.',
  'Every write goes through an idempotency key so retries never duplicate records.',
  'Structured logs carry a correlation id that ties the whole request chain together.',
  'The queue consumer scales horizontally and backs off when the downstream API rate-limits.',
  'Configuration is validated at startup so misconfiguration fails fast in development.',
  'Metrics are exported in Prometheus format for dashboards and alert rules.',
  'Database migrations run in a transaction and are guarded by an advisory lock.',
  'The cache is invalidated lazily on read, which keeps write paths free of extra round trips.',
];

type Variant = 'latin' | 'zh' | 'en';
type OutputType = 'paragraph' | 'sentence' | 'word' | 'list' | 'table';
type Separator = '\n' | '\n\n' | '\n\n\n';

const VARIANTS: { value: Variant; label: string }[] = [
  { value: 'latin', label: '经典 Lorem Ipsum' },
  { value: 'zh', label: '简中占位' },
  { value: 'en', label: '英文技术风' },
];

const OUTPUT_TYPES: { value: OutputType; label: string }[] = [
  { value: 'paragraph', label: '段落' },
  { value: 'sentence', label: '句子' },
  { value: 'word', label: '单词' },
  { value: 'list', label: '列表项' },
  { value: 'table', label: '表格单元格' },
];

const SEPARATORS: { value: Separator; label: string }[] = [
  { value: '\n', label: '换行' },
  { value: '\n\n', label: '空行' },
  { value: '\n\n\n', label: '双换行' },
];

const TEMPLATES: { value: string; label: string; build: (items: string[]) => string }[] = [
  {
    value: 'p',
    label: '<p> 段落',
    build: (items) => items.map((item) => `<p>${item}</p>`).join('\n'),
  },
  {
    value: 'h1',
    label: '<h1> 标题',
    build: (items) => items.map((item) => `<h1>${item}</h1>`).join('\n'),
  },
  {
    value: 'ul',
    label: '<ul><li> 列表',
    build: (items) => `<ul>\n${items.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`,
  },
  {
    value: 'table',
    label: '<table> 表格',
    build: (items) =>
      [
        '<table>',
        '  <thead>',
        '    <tr><th>编号</th><th>名称</th><th>描述</th></tr>',
        '  </thead>',
        '  <tbody>',
        ...items.map((item, index) => `    <tr><td>${index + 1}</td><td>${item}</td><td>${item}</td></tr>`),
        '  </tbody>',
        '</table>',
      ].join('\n'),
  },
  {
    value: 'form',
    label: 'Bootstrap 风格表单',
    build: (items) =>
      [
        '<form class="row g-3">',
        ...items.flatMap((item) => [
          '  <div class="col-md-6">',
          `    <label class="form-label" for="${item}">${item}</label>`,
          `    <input type="text" class="form-control" id="${item}" placeholder="请输入${item}">`,
          '  </div>',
        ]),
        '  <div class="col-12">',
        '    <button type="submit" class="btn btn-primary">提交</button>',
        '  </div>',
        '</form>',
      ].join('\n'),
  },
  {
    value: 'card',
    label: '卡片',
    build: (items) =>
      [
        '<div class="card">',
        ...items.map(
          (item) =>
            `  <div class="card-body"><h5 class="card-title">${item}</h5><p class="card-text">${item}</p></div>`,
        ),
        '</div>',
      ].join('\n'),
  },
  {
    value: 'nav',
    label: '导航',
    build: (items) =>
      [
        '<nav class="navbar navbar-expand-lg">',
        '  <div class="container-fluid">',
        `    <a class="navbar-brand" href="#">${items[0] ?? 'Brand'}</a>`,
        '    <ul class="navbar-nav">',
        ...items.map((item) => `      <li class="nav-item"><a class="nav-link" href="#">${item}</a></li>`),
        '    </ul>',
        '  </div>',
        '</nav>',
      ].join('\n'),
  },
  {
    value: 'footer',
    label: '页脚',
    build: (items) =>
      [
        '<footer class="py-3 my-4 border-top">',
        '  <p class="text-center text-muted">',
        `    ${items.join(' · ')}`,
        '  </p>',
        '</footer>',
      ].join('\n'),
  },
];

// ── 随机 ─────────────────────────────────────────────────

/** mulberry32：固定种子可复现，方便把同一份占位文本写进用例。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)] as T;
}

const EXPORT_FORMATS = [
  { value: 'txt', label: '.txt 纯文本' },
  { value: 'html', label: '.html 网页' },
  { value: 'md', label: '.md Markdown' },
  { value: 'json', label: '.json 结构化' },
];

const MIME_BY_FORMAT: Record<string, string> = {
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

export default function LoremGenerator() {
  const [variant, setVariant] = useState<Variant>('latin');
  const [outputType, setOutputType] = useState<OutputType>('paragraph');
  const [count, setCount] = useState(3);
  const [minSentences, setMinSentences] = useState(3);
  const [maxSentences, setMaxSentences] = useState(5);
  const [separator, setSeparator] = useState<Separator>('\n\n');
  const [seed, setSeed] = useState(20260930);
  const [asHtml, setAsHtml] = useState(false);
  const [template, setTemplate] = useState('p');
  const [zhOnly, setZhOnly] = useState(false);
  const [exportFormat, setExportFormat] = useState('txt');

  const result = useMemo(() => {
    const rand = mulberry32(seed);
    const activeVariant: Variant = zhOnly ? 'zh' : variant;
    const pool = activeVariant === 'zh' ? ZH_SENTENCES : activeVariant === 'en' ? EN_TECH_SENTENCES : LATIN_SENTENCES;
    const low = Math.max(1, Math.min(minSentences, maxSentences));
    const high = Math.max(1, Math.max(minSentences, maxSentences));
    const total = Math.max(1, Math.min(200, count));

    const makeParagraph = (): string => {
      const n = low + Math.floor(rand() * (high - low + 1));
      const used = new Set<number>();
      const picked: string[] = [];
      for (let i = 0; i < n; i++) {
        let index = Math.floor(rand() * pool.length);
        let guard = 0;
        while (used.has(index) && guard < 12) {
          index = Math.floor(rand() * pool.length);
          guard += 1;
        }
        used.add(index);
        picked.push(pool[index] as string);
      }
      return picked.join(' ');
    };

    const items: string[] = [];
    if (outputType === 'word') {
      for (let i = 0; i < total * 6; i++)
        items.push(activeVariant === 'zh' ? pick(ZH_SENTENCES, rand).slice(0, 4) : pick(LATIN_WORDS, rand));
    } else if (outputType === 'sentence') {
      for (let i = 0; i < total; i++) items.push(pick(pool, rand));
    } else if (outputType === 'list') {
      for (let i = 0; i < total; i++) items.push(makeParagraph().split('.')[0]?.trim() || makeParagraph());
    } else if (outputType === 'table') {
      for (let i = 0; i < total; i++) {
        items.push(
          `${pick(pool, rand).split(' ').slice(0, 3).join(' ')} | ${pick(pool, rand).split(' ').slice(0, 3).join(' ')}`,
        );
      }
    } else {
      for (let i = 0; i < total; i++) items.push(makeParagraph());
    }

    const plain = items.join(separator);
    const body = asHtml ? (TEMPLATES.find((t) => t.value === template) ?? TEMPLATES[0]).build(items) : plain;
    return { items, plain, html: body, isHtml: asHtml };
  }, [variant, zhOnly, outputType, count, minSentences, maxSentences, separator, seed, asHtml, template]);

  const stats = useMemo(() => {
    const text = result.plain;
    const chars = Array.from(text).length;
    const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
    const cjk = (text.match(/\p{Script=Han}/gu) ?? []).length;
    return { chars, words: text.split(/\s+/u).filter(Boolean).length, latin, cjk, paragraphs: result.items.length };
  }, [result]);

  const exported = useMemo(() => {
    if (exportFormat === 'json') {
      return JSON.stringify(
        { variant: zhOnly ? 'zh' : variant, type: outputType, template: asHtml ? template : null, items: result.items },
        null,
        2,
      );
    }
    if (exportFormat === 'md') {
      return result.items.map((item) => `${asHtml ? '```html' : ''}\n${item}\n${asHtml ? '```' : ''}`).join('\n\n');
    }
    return result.html;
  }, [exportFormat, result, variant, outputType, asHtml, template, zhOnly]);

  return (
    <ToolPanel
      title="占位文本生成"
      description={`内置 ${LATIN_THEMES.length} 组真实拉丁文语料，共 ${LATIN_SENTENCES.length} 句，可循环取用`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setSeed((value) => (value + 1) >>> 0)}>
            <RefreshCw className="size-3.5" />
            换一批
          </Button>
          <Button size="sm" variant="outline" disabled={!exported} onClick={() => copyText(exported)}>
            <Copy className="size-3.5" />
            复制
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="生成参数" description="固定种子可复现同一份结果，便于写进测试用例">
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="起始变体"
              value={variant}
              onChange={(value) => setVariant(value as Variant)}
              options={VARIANTS}
            />
            <Select
              label="输出类型"
              value={outputType}
              onChange={(value) => setOutputType(value as OutputType)}
              options={OUTPUT_TYPES}
            />
            <NumberField
              label="数量"
              value={count}
              onChange={(value) => setCount(Math.max(1, Math.min(200, value || 1)))}
              min={1}
              max={200}
            />
            <NumberField label="随机种子" value={seed} onChange={(value) => setSeed(value >>> 0)} min={0} />
            <NumberField
              label="每段最少句数"
              value={minSentences}
              onChange={(value) => setMinSentences(Math.max(1, Math.min(20, value || 1)))}
              min={1}
              max={20}
              disabled={outputType !== 'paragraph'}
            />
            <NumberField
              label="每段最多句数"
              value={maxSentences}
              onChange={(value) => setMaxSentences(Math.max(1, Math.min(20, value || 1)))}
              min={1}
              max={20}
              disabled={outputType !== 'paragraph'}
            />
            <Select
              label="段落分隔符"
              value={separator}
              onChange={(value) => setSeparator(value as Separator)}
              options={SEPARATORS}
            />
            <Select
              label="HTML 模板"
              value={template}
              onChange={setTemplate}
              options={TEMPLATES.map((item) => ({ value: item.value, label: item.label }))}
              disabled={!asHtml}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Checkbox label="输出 HTML" checked={asHtml} onChange={setAsHtml} />
            <Checkbox label="只用中文占位符" checked={zhOnly} onChange={setZhOnly} hint="强制使用中文占位文本库" />
          </div>
        </Section>

        <Section title="统计" description="基于未套 HTML 模板的纯文本">
          <StatGrid>
            <Stat label="字符数" value={stats.chars} />
            <Stat label="词数" value={stats.words} />
            <Stat label="段落 / 条目" value={stats.paragraphs} />
            <Stat label="西文字母" value={stats.latin} />
            <Stat label="汉字" value={stats.cjk} />
            <Stat
              label="输出形式"
              value={result.isHtml ? 'HTML' : '纯文本'}
              hint={result.isHtml ? template : 'text/plain'}
            />
          </StatGrid>
          <Note tone="info" title="语料说明">
            拉丁文语料取自公有领域的经典 Lorem Ipsum 文本，按主题分组并做了去重，生成时在同一段内尽量不重复取句。
            表格单元格类型输出为「左列 | 右列」，粘贴到表格编辑器时可直接分列。
          </Note>
        </Section>
      </div>

      <ResultBox
        label={result.isHtml ? `HTML 输出（模板：${template}）` : '生成结果'}
        value={result.html}
        rows="min-h-72"
        onCopy={() => copyText(result.html)}
      />

      <Section title="导出" description="按需要的格式复制或下载">
        <div className="grid gap-3 md:grid-cols-2">
          <Select label="导出格式" value={exportFormat} onChange={setExportFormat} options={EXPORT_FORMATS} />
          <div className="flex items-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!exported}
              onClick={() => downloadText(exportName('lorem', exportFormat), exported, MIME_BY_FORMAT[exportFormat])}
            >
              <Download className="size-3.5" />
              下载 .{exportFormat}
            </Button>
            <Button size="sm" variant="outline" disabled={!exported} onClick={() => copyText(exported)}>
              <Copy className="size-3.5" />
              复制 {exportFormat.toUpperCase()}
            </Button>
          </div>
        </div>
        <Hint>选择「HTML 网页」且开启「输出 HTML」时，导出的是套好模板的片段；否则始终导出纯文本。</Hint>
      </Section>

      <Section title="HTML 片段模板预览" description="手写模板字符串，不经过任何渲染库">
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.slice(0, 4).map((item) => (
            <div key={item.value} className="min-w-0 rounded-md border bg-muted/20 p-2">
              <p className="mb-1 font-mono text-[11px] font-medium">{item.label}</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
                {item.build(result.items)}
              </pre>
            </div>
          ))}
        </div>
      </Section>
    </ToolPanel>
  );
}
