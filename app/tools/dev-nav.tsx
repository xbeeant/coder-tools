import { Compass, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '../components/ui/input';
import { type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';

interface NavCategory {
  id: string;
  label: string;
  description: string;
  items: LinkItem[];
}

/** 开发者常用站点的离线导航表：只存名称、地址与一句话说明，不做任何网络请求。 */
const CATEGORIES: NavCategory[] = [
  {
    id: 'dev',
    label: '开发',
    description: '语言运行时、在线编辑器与调试',
    items: [
      {
        name: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/zh-CN/',
        description: 'Web 平台 API 的权威参考，前端必备',
        tags: ['MDN', '前端', '文档'],
      },
      {
        name: 'TypeScript Playground',
        url: 'https://www.typescriptlang.org/play',
        description: '在线编译 TS，验证类型推断与配置',
        tags: ['TypeScript'],
      },
      {
        name: 'Node.js',
        url: 'https://nodejs.org/',
        description: '服务端 JavaScript 运行时',
        tags: ['Node.js', '后端'],
      },
      {
        name: 'Can I use',
        url: 'https://caniuse.com/',
        description: '浏览器特性与兼容性查询',
        tags: ['兼容', '前端'],
      },
      {
        name: 'Regex101',
        url: 'https://regex101.com/',
        description: '正则表达式在线调试与解释',
        tags: ['正则'],
      },
      {
        name: 'JSON Crack',
        url: 'https://jsoncrack.com/',
        description: 'JSON 树形可视化',
        tags: ['JSON'],
      },
    ],
  },
  {
    id: 'docs',
    label: '文档与知识',
    description: '文档写作、托管与知识管理',
    items: [
      {
        name: 'MDN Chinese',
        url: 'https://developer.mozilla.org/zh-CN/docs/Web',
        description: '中文 Web 文档入口',
        tags: ['文档'],
      },
      {
        name: 'DevDocs',
        url: 'https://devdocs.io/',
        description: '数十种技术文档聚合搜索',
        tags: ['API', '速查'],
      },
      {
        name: 'Read the Docs',
        url: 'https://readthedocs.org/',
        description: '托管项目文档',
        tags: ['文档'],
      },
      {
        name: 'Excalidraw',
        url: 'https://excalidraw.com/',
        description: '手绘风格流程图与草图',
        tags: ['白板', '图表'],
      },
      {
        name: 'Diagrams.net',
        url: 'https://app.diagrams.net/',
        description: 'draw.io，在线画 ER 图、时序图、拓扑图',
        tags: ['图表', 'ER'],
      },
    ],
  },
  {
    id: 'ops',
    label: '云与运维',
    description: '监控、日志、部署与容器',
    items: [
      {
        name: 'Grafana',
        url: 'https://grafana.com/grafana/',
        description: '指标看板与告警',
        tags: ['监控'],
      },
      {
        name: 'Loki',
        url: 'https://grafana.com/oss/loki/',
        description: '日志聚合，与 Grafana 同源',
        tags: ['日志'],
      },
      {
        name: 'Jaeger',
        url: 'https://www.jaegertracing.io/',
        description: '分布式链路追踪',
        tags: ['APM'],
      },
      {
        name: 'Docker Hub',
        url: 'https://hub.docker.com/',
        description: '镜像仓库',
        tags: ['容器'],
      },
      {
        name: 'Kubernetes 文档',
        url: 'https://kubernetes.io/zh-cn/docs/home/',
        description: '官方中文文档',
        tags: ['K8s'],
      },
      {
        name: 'Playwright',
        url: 'https://playwright.dev/',
        description: '端到端测试与浏览器自动化',
        tags: ['测试', 'E2E'],
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    description: '模型、Prompt 与机器学习资源',
    items: [
      {
        name: 'Hugging Face',
        url: 'https://huggingface.co/',
        description: '模型与数据集社区',
        tags: ['模型', '数据集'],
      },
      {
        name: 'Ollama',
        url: 'https://ollama.com/',
        description: '本地运行开源大模型',
        tags: ['本地模型'],
      },
      {
        name: 'OpenAI 文档',
        url: 'https://platform.openai.com/docs',
        description: 'API 参考与最佳实践',
        tags: ['API'],
      },
      {
        name: 'Google AI Studio',
        url: 'https://aistudio.google.com/',
        description: 'Gemini 在线调试',
        tags: ['Gemini'],
      },
      {
        name: 'Papers with Code',
        url: 'https://paperswithcode.com/',
        description: '论文与官方实现索引',
        tags: ['论文'],
      },
    ],
  },
  {
    id: 'design',
    label: '设计',
    description: '原型、配色与图形素材',
    items: [
      {
        name: 'Figma',
        url: 'https://www.figma.com/',
        description: '在线协作界面设计',
        tags: ['UI', '原型'],
      },
      {
        name: 'Coolors',
        url: 'https://coolors.co/',
        description: '配色方案生成',
        tags: ['配色'],
      },
      {
        name: 'Iconify',
        url: 'https://icon-sets.iconify.design/',
        description: '上百套开源图标检索',
        tags: ['图标'],
      },
      {
        name: 'unDraw',
        url: 'https://undraw.co/illustrations',
        description: '可改色插画',
        tags: ['插画'],
      },
      {
        name: 'Google Fonts',
        url: 'https://fonts.google.com/',
        description: '开源字体库',
        tags: ['字体'],
      },
    ],
  },
  {
    id: 'office',
    label: '办公与效率',
    description: '协作、文档与自动化',
    items: [
      {
        name: 'OnlyOffice',
        url: 'https://www.onlyoffice.com/',
        description: '可私有部署的在线 Office',
        tags: ['文档'],
      },
      {
        name: 'AppFlowy',
        url: 'https://appflowy.com/',
        description: '开源 Notion 替代',
        tags: ['笔记'],
      },
      {
        name: 'Excalidraw 协作白板',
        url: 'https://excalidraw.com/',
        description: '快速草图与评审',
        tags: ['白板'],
      },
      {
        name: 'regex101',
        url: 'https://regex101.com/',
        description: '正则调试',
        tags: ['正则'],
      },
      {
        name: 'TinyPNG',
        url: 'https://tinypng.com/',
        description: '图片压缩',
        tags: ['图片'],
      },
    ],
  },
  {
    id: 'community',
    label: '社区与资源',
    description: '资讯、问答与源码检索',
    items: [
      {
        name: 'GitHub Trending',
        url: 'https://github.com/trending',
        description: '今日热门仓库',
        tags: ['GitHub'],
      },
      {
        name: 'Stack Overflow',
        url: 'https://stackoverflow.com/',
        description: '编程问答',
        tags: ['问答'],
      },
      {
        name: 'Dev.to',
        url: 'https://dev.to/',
        description: '开发者博客平台',
        tags: ['博客'],
      },
      {
        name: 'Hacker News',
        url: 'https://news.ycombinator.com/',
        description: '技术资讯聚合',
        tags: ['资讯'],
      },
      {
        name: 'Regex101 速查表',
        url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Regular_expressions',
        description: 'MDN 正则章节',
        tags: ['正则', 'MDN'],
      },
    ],
  },
];

export default function DevNav() {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        ...category,
        items: q
          ? category.items.filter((item) =>
              [item.name, item.description ?? '', ...(item.tags ?? [])].join(' ').toLowerCase().includes(q),
            )
          : category.items,
      })).filter((category) => category.items.length > 0),
    [q],
  );

  const total = useMemo(() => filtered.reduce((sum, category) => sum + category.items.length, 0), [filtered]);

  return (
    <ToolPanel
      title="开发者导航站"
      description={`按场景聚合常用站点，共 ${CATEGORIES.reduce((sum, c) => sum + c.items.length, 0)} 个入口`}
      actions={
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选站点或标签"
            className="h-8 pl-7 text-xs"
          />
        </div>
      }
    >
      <Note tone="info" title="离线导航">
        <span className="inline-flex items-center gap-1">
          <Compass className="size-3" />
          清单内置在扩展内，搜索与筛选全部在本地完成；点击条目在新标签打开对应站点。
        </span>
      </Note>

      {total === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">没有匹配的站点</p>
      ) : (
        filtered.map((category) => (
          <Section key={category.id} title={category.label} description={category.description}>
            <LinkList items={category.items} />
          </Section>
        ))
      )}
    </ToolPanel>
  );
}
