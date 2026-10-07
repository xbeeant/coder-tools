import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, NumberField, TextField } from '../components/ui/field';
import { EmptyHint, type LinkItem, LinkList, Note, Section, ToolPanel } from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'config' | 'commands' | 'linux' | 'troubleshoot' | 'docker';

const TABS: { value: Tab; label: string }[] = [
  { value: 'config', label: '配置生成' },
  { value: 'commands', label: 'WSL 命令' },
  { value: 'linux', label: 'Linux 速查' },
  { value: 'troubleshoot', label: '性能与排坑' },
  { value: 'docker', label: 'Docker 与开发' },
];

interface WslConfig {
  memoryGb: number;
  processors: number;
  swapGb: number;
  localhostForwarding: boolean;
  guiApplications: boolean;
  nestedVirtualization: boolean;
  autoMemoryReclaim: boolean;
  sparseVhd: boolean;
  dnsTunneling: boolean;
  hostAddressLoopback: boolean;
  bootCommand: string;
  appendWindowsPath: boolean;
  generateResolvConf: boolean;
  interopEnabled: boolean;
  defaultUser: string;
}

const DEFAULT_CONFIG: WslConfig = {
  memoryGb: 8,
  processors: 4,
  swapGb: 2,
  localhostForwarding: true,
  guiApplications: true,
  nestedVirtualization: false,
  autoMemoryReclaim: true,
  sparseVhd: false,
  dnsTunneling: false,
  hostAddressLoopback: false,
  bootCommand: '',
  appendWindowsPath: true,
  generateResolvConf: true,
  interopEnabled: true,
  defaultUser: '',
};

interface WslConfConfig {
  systemd: boolean;
  bootCommand: string;
  defaultUser: string;
  automountEnabled: boolean;
  mountRoot: string;
  mountOptions: string;
  interopEnabled: boolean;
  appendWindowsPath: boolean;
  generateResolvConf: boolean;
  generateHosts: boolean;
}

const DEFAULT_WSL_CONF: WslConfConfig = {
  systemd: true,
  bootCommand: '',
  defaultUser: '',
  automountEnabled: true,
  mountRoot: '/mnt/',
  mountOptions: 'metadata,umask=22,fmask=11',
  interopEnabled: true,
  appendWindowsPath: true,
  generateResolvConf: true,
  generateHosts: true,
};

interface CommandRow {
  command: string;
  description: string;
  risk?: 'danger' | 'warn';
}

const WSL_COMMANDS: { category: string; rows: CommandRow[] }[] = [
  {
    category: '发行版管理',
    rows: [
      { command: 'wsl --list --verbose', description: '列出已安装的发行版及版本（WSL1/WSL2）' },
      { command: 'wsl --list --online', description: '列出可在线安装的发行版' },
      { command: 'wsl --install -d Ubuntu', description: '安装指定发行版，默认装到 WSL2' },
      { command: 'wsl --set-default-version 2', description: '把新装发行版默认设为 WSL2' },
      { command: 'wsl --set-version Ubuntu 2', description: '把已有发行版从 WSL1 升级到 WSL2（耗时较长）' },
      { command: 'wsl --terminate Ubuntu', description: '关闭指定发行版，释放内存' },
      { command: 'wsl --shutdown', description: '关闭所有发行版与 WSL2 轻量虚拟机' },
      { command: 'wsl --unregister Ubuntu', description: '删除发行版及其全部数据', risk: 'danger' },
      { command: 'wsl --manage Ubuntu --set-default-user user', description: '修改默认登录用户' },
      { command: 'wsl --status', description: '查看 WSL 版本、默认发行版与内核信息' },
      { command: 'wsl --version', description: '查看 WSL 版本与可用更新' },
      { command: 'wsl --update', description: '更新 WSL 内核与组件' },
    ],
  },
  {
    category: '导入导出与备份',
    rows: [
      { command: 'wsl --export Ubuntu D:\\backup\\ubuntu.tar', description: '把发行版导出为 tar 文件（备份或迁移）' },
      {
        command: 'wsl --import MyUbuntu D:\\wsl\\MyUbuntu D:\\backup\\ubuntu.tar',
        description: '从 tar 导入为新发行版',
        risk: 'warn',
      },
      {
        command: 'wsl --import-in-place Ubuntu D:\\backup\\ubuntu.tar',
        description: '原地导入覆盖当前发行版',
        risk: 'danger',
      },
      {
        command: 'wsl --manage docker-desktop-data --move D:\\wsl-data',
        description: '迁移 Docker Desktop 数据盘释放 C 盘',
        risk: 'warn',
      },
    ],
  },
  {
    category: '运行与互操作',
    rows: [
      { command: 'wsl', description: '进入默认发行版' },
      { command: 'wsl -d Ubuntu -u root', description: '以指定用户进入指定发行版' },
      { command: 'wsl -e bash -c "ls /mnt/c"', description: '执行单条命令后退出' },
      { command: 'explorer.exe .', description: '在 WSL 里用资源管理器打开当前目录' },
      { command: 'notepad.exe file.txt', description: '用 Windows 记事本打开 WSL 里的文件' },
      { command: 'code .', description: '用 VS Code 打开当前目录（需装 Remote WSL 扩展）' },
      { command: 'clip.exe < input.txt', description: '把 WSL 输出复制到 Windows 剪贴板' },
      { command: 'wslpath -w /home/user', description: '把 WSL 路径转成 Windows 路径' },
      { command: 'wslpath -u "C:\\Users"', description: '把 Windows 路径转成 WSL 路径' },
    ],
  },
];

const LINUX_COMMANDS: { category: string; rows: CommandRow[] }[] = [
  {
    category: '文件与权限',
    rows: [
      { command: 'ls -lah', description: '列出文件含隐藏文件与可读大小' },
      { command: 'chmod 755 script.sh', description: '给脚本加执行权限' },
      { command: 'chown user:group file', description: '修改文件属主与属组' },
      { command: 'ln -s /mnt/c/project ~/project', description: '创建软链接' },
      { command: 'find . -name "*.log" -mtime +7 -delete', description: '删除 7 天前的日志', risk: 'warn' },
      { command: 'du -sh * | sort -rh', description: '查看当前目录各子项大小并排序' },
      { command: 'df -h', description: '查看磁盘使用情况' },
      { command: 'stat file', description: '查看文件详细元信息' },
    ],
  },
  {
    category: '文本处理',
    rows: [
      { command: 'grep -rn "error" /var/log', description: '递归搜索关键字' },
      { command: 'sed -i "s/old/new/g" file', description: '原地替换文本', risk: 'warn' },
      { command: "awk '{print $1, $3}' file", description: '按列提取字段' },
      { command: "jq '.items[] | .name' data.json", description: '解析 JSON' },
      { command: 'sort file | uniq -c | sort -rn', description: '统计词频并排序' },
      { command: 'tail -f /var/log/syslog', description: '实时跟踪日志' },
      { command: 'head -n 20 file', description: '查看前 20 行' },
      { command: 'wc -l file', description: '统计行数' },
    ],
  },
  {
    category: '网络',
    rows: [
      { command: 'curl -I https://example.com', description: '只看响应头' },
      { command: 'curl -X POST -d \'{"a":1}\' -H "Content-Type: application/json" URL', description: '发 POST 请求' },
      { command: 'ss -tlnp', description: '查看监听端口与进程' },
      { command: 'ping -c 4 8.8.8.8', description: '测试网络连通性' },
      { command: 'scp file user@host:/path', description: '复制文件到远程主机' },
      { command: 'ssh -L 8080:localhost:80 user@host', description: '本地端口转发' },
      { command: 'lsof -i :3000', description: '查看谁占用了 3000 端口' },
    ],
  },
  {
    category: '进程与系统',
    rows: [
      { command: 'top', description: '实时查看进程与资源占用' },
      { command: 'ps aux | grep node', description: '查找指定进程' },
      { command: 'kill -9 PID', description: '强制结束进程', risk: 'warn' },
      { command: 'systemctl status nginx', description: '查看服务状态（需 systemd）' },
      { command: 'journalctl -u nginx -f', description: '跟踪服务日志' },
      { command: 'free -h', description: '查看内存使用' },
      { command: 'uptime', description: '查看运行时长与负载' },
    ],
  },
  {
    category: '包管理与构建',
    rows: [
      { command: 'sudo apt update && sudo apt upgrade', description: '更新软件源并升级', risk: 'warn' },
      { command: 'sudo apt install build-essential', description: '安装编译工具链' },
      { command: 'sudo apt search keyword', description: '搜索软件包' },
      { command: 'make && make install', description: '编译并安装', risk: 'warn' },
      { command: 'docker ps -a', description: '查看所有容器' },
      { command: 'docker compose up -d', description: '后台启动 compose 服务' },
    ],
  },
];

const TROUBLESHOOT: { symptom: string; cause: string; fix: string }[] = [
  {
    symptom: '访问 /mnt/c 下的项目特别慢',
    cause: '跨文件系统 I/O，WSL2 访问 Windows 磁盘要走 9P 协议',
    fix: '把项目放到 WSL 文件系统内（如 ~/project），需要与 Windows 互操作时用 /mnt/c 只做偶尔访问',
  },
  {
    symptom: '文件监听 / hot reload 不生效',
    cause: '跨文件系统 inotify 事件不可靠',
    fix: '项目放 WSL 内；或 VS Code 设置 usePolling: true；把目录加入 Windows Defender 排除项',
  },
  {
    symptom: 'WSL2 内存占用越来越高',
    cause: 'WSL2 默认会缓存内存，Windows 下不主动释放',
    fix: '.wslconfig 设 memory 上限；开启 autoMemoryReclaim；定期 wsl --shutdown',
  },
  {
    symptom: 'localhost 端口访问不到',
    cause: 'WSL2 默认 NAT 网络，Windows 访问 WSL 端口需转发',
    fix: '.wslconfig 开 localhostForwarding=true；或改用 mirrored 网络模式（需较新 Windows）',
  },
  {
    symptom: '时钟漂移，定时任务时间不对',
    cause: 'WSL2 挂起后时钟与 Windows 不同步',
    fix: '执行 wsl --shutdown 后重开；或 sudo hwclock -s 同步硬件时钟',
  },
  {
    symptom: 'DNS 解析失败',
    cause: 'resolv.conf 被覆盖或 DNS 配置错误',
    fix: '/etc/wsl.conf 设 generateResolvConf=false 后手动写 /etc/resolv.conf；或开 dnsTunneling 实验特性',
  },
  {
    symptom: 'systemd 服务不启动',
    cause: 'WSL 默认不启用 systemd',
    fix: '/etc/wsl.conf 加 [boot] systemd=true，然后 wsl --shutdown 重开',
  },
  {
    symptom: 'chmod 在 /mnt/c 上无效',
    cause: 'Windows 文件系统不支持 Unix 权限位',
    fix: '把需要权限控制的项目放 WSL 文件系统内；/mnt 挂载加 metadata 选项可部分改善',
  },
  {
    symptom: 'IPv6 不通',
    cause: 'WSL2 NAT 默认不支持 IPv6',
    fix: '.wslconfig 开 hostAddressLoopback 与 dnsTunneling；或配置镜像网络',
  },
  {
    symptom: '磁盘空间不释放',
    cause: 'WSL2 的 ext4.vhdx 是动态扩展的，删除文件后不自动缩小',
    fix: '管理员 PowerShell 执行 Optimize-VHD -Path $env:LOCALAPPDATA\\Docker\\...\\ext4.vhdx -Mode Full；或 .wslconfig 开 sparseVhd',
  },
  {
    symptom: 'Windows 防火墙拦截 WSL 网络',
    cause: 'WSL2 虚拟网卡被防火墙规则拦截',
    fix: '防火墙放行 vmmem 或 WSL 虚拟网卡；mirrored 模式下通常无此问题',
  },
  {
    symptom: 'VirtualBox / VMware 变慢或报错',
    cause: 'Windows 的 Hyper-V / Virtual Machine Platform 与旧虚拟化冲突',
    fix: 'WSL2 需要 Hyper-V；旧版 VirtualBox 需升级支持 Hyper-V 的版本，或关闭 VMP（会失去 WSL2）',
  },
  {
    symptom: 'WSL --install 失败',
    cause: '未启用虚拟化或可选功能未开',
    fix: 'BIOS 开虚拟化；管理员 PowerShell 启用 Microsoft-Windows-Subsystem-Linux 与 VirtualMachinePlatform；重启后再装',
  },
  {
    symptom: 'GUI 应用打不开 / 无显示',
    cause: 'WSLg 未启用或显示服务异常',
    fix: '确认 .wslconfig 开 guiApplications；更新 WSL；检查 DISPLAY 环境变量',
  },
  {
    symptom: 'Docker Desktop 启动慢或数据盘爆 C 盘',
    cause: 'docker-desktop-data 的 vhdx 默认在 C 盘',
    fix: 'wsl --shutdown 后 wsl --manage docker-desktop-data --move D:\\wsl-data 迁移数据盘',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'Microsoft Learn: WSL 文档',
    url: 'https://learn.microsoft.com/zh-cn/windows/wsl/',
    description: '官方中文文档：安装、配置、发行版管理',
    tags: ['官方'],
  },
  {
    name: 'WSL 配置文件参考',
    url: 'https://learn.microsoft.com/zh-cn/windows/wsl/wsl-config',
    description: '.wslconfig 与 /etc/wsl.conf 全部配置项',
    tags: ['官方', '配置'],
  },
  {
    name: 'WSL 发行版列表',
    url: 'https://learn.microsoft.com/zh-cn/windows/wsl/install-manual#step-4---download-the-linux-kernel-update-package',
    description: '可安装的发行版与手动安装步骤',
    tags: ['官方'],
  },
  {
    name: 'WSL 网络问题排查',
    url: 'https://learn.microsoft.com/zh-cn/windows/wsl/networking',
    description: 'localhost 转发、mirrored 模式、IPv6',
    tags: ['官方', '网络'],
  },
  {
    name: 'Docker Desktop on WSL2',
    url: 'https://docs.docker.com/desktop/features/wsl/',
    description: 'Docker Desktop 的 WSL2 后端配置与数据迁移',
    tags: ['Docker'],
  },
  {
    name: 'VS Code Remote WSL',
    url: 'https://code.visualstudio.com/docs/remote/wsl',
    description: '在 WSL 里用 VS Code 开发的官方指南',
    tags: ['VS Code'],
  },
];

export default function WslTool() {
  const [tab, setTab] = useState<Tab>('config');
  const [config, setConfig] = useState<WslConfig>(DEFAULT_CONFIG);
  const [wslConf, setWslConf] = useState<WslConfConfig>(DEFAULT_WSL_CONF);
  const [query, setQuery] = useState('');

  const wslconfigText = useMemo(() => {
    const lines: string[] = [
      '# WSL2 全局配置，位于 C:\\Users\\<用户名>\\.wslconfig',
      '# 修改后需执行 wsl --shutdown 再重开才生效',
      '',
      '[wsl2]',
    ];
    lines.push(`memory=${config.memoryGb}GB`);
    lines.push(`processors=${config.processors}`);
    lines.push(`swap=${config.swapGb}GB`);
    lines.push(`localhostForwarding=${config.localhostForwarding}`);
    lines.push(`guiApplications=${config.guiApplications}`);
    lines.push(`nestedVirtualization=${config.nestedVirtualization}`);
    if (config.autoMemoryReclaim) lines.push('autoMemoryReclaim=gradual');
    if (config.sparseVhd) lines.push('sparseVhd=true');
    if (config.dnsTunneling) lines.push('dnsTunneling=true');
    if (config.hostAddressLoopback) lines.push('hostAddressLoopback=true');
    if (config.bootCommand) lines.push(`boot.command=${config.bootCommand}`);
    lines.push('', '[interop]');
    lines.push(`enabled=${config.interopEnabled}`);
    lines.push(`appendWindowsPath=${config.appendWindowsPath}`);
    if (config.defaultUser) lines.push(`defaultUser=${config.defaultUser}`);
    return lines.join('\n');
  }, [config]);

  const wslConfText = useMemo(() => {
    const lines: string[] = ['# WSL 发行版内配置，位于 /etc/wsl.conf', '# 修改后需 wsl --shutdown 再重开才生效', ''];
    if (wslConf.systemd) {
      lines.push('[boot]');
      lines.push('systemd=true');
      if (wslConf.bootCommand) lines.push(`command=${wslConf.bootCommand}`);
      lines.push('');
    }
    if (wslConf.defaultUser) {
      lines.push('[user]');
      lines.push(`default=${wslConf.defaultUser}`);
      lines.push('');
    }
    if (wslConf.automountEnabled) {
      lines.push('[automount]');
      lines.push('enabled=true');
      lines.push(`root=${wslConf.mountRoot}`);
      lines.push(`options="${wslConf.mountOptions}"`);
      lines.push('');
    }
    lines.push('[interop]');
    lines.push(`enabled=${wslConf.interopEnabled}`);
    lines.push(`appendWindowsPath=${wslConf.appendWindowsPath}`);
    lines.push('');
    lines.push('[network]');
    lines.push(`generateResolvConf=${wslConf.generateResolvConf}`);
    lines.push(`generateHosts=${wslConf.generateHosts}`);
    return lines.join('\n');
  }, [wslConf]);

  const filterRows = (rows: CommandRow[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.command} ${row.description}`.toLowerCase().includes(q));
  };

  return (
    <ToolPanel
      title="Linux 子系统（WSL）"
      description="WSL 需 Windows 环境，本页提供配置文件生成、命令速查与排坑指南"
      actions={
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {tab === 'config' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Section title=".wslconfig（Windows 侧）">
              <div className="grid grid-cols-3 gap-2">
                <NumberField
                  label="内存上限"
                  value={config.memoryGb}
                  min={1}
                  max={64}
                  suffix="GB"
                  onChange={(v) => setConfig({ ...config, memoryGb: v })}
                />
                <NumberField
                  label="CPU 核数"
                  value={config.processors}
                  min={1}
                  max={32}
                  onChange={(v) => setConfig({ ...config, processors: v })}
                />
                <NumberField
                  label="交换分区"
                  value={config.swapGb}
                  min={0}
                  max={32}
                  suffix="GB"
                  onChange={(v) => setConfig({ ...config, swapGb: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Checkbox
                  label="localhost 转发"
                  checked={config.localhostForwarding}
                  onChange={(v) => setConfig({ ...config, localhostForwarding: v })}
                />
                <Checkbox
                  label="GUI 应用（WSLg）"
                  checked={config.guiApplications}
                  onChange={(v) => setConfig({ ...config, guiApplications: v })}
                />
                <Checkbox
                  label="嵌套虚拟化"
                  checked={config.nestedVirtualization}
                  onChange={(v) => setConfig({ ...config, nestedVirtualization: v })}
                />
                <Checkbox
                  label="自动内存回收"
                  checked={config.autoMemoryReclaim}
                  onChange={(v) => setConfig({ ...config, autoMemoryReclaim: v })}
                />
                <Checkbox
                  label="稀疏 VHD（省空间）"
                  checked={config.sparseVhd}
                  onChange={(v) => setConfig({ ...config, sparseVhd: v })}
                />
                <Checkbox
                  label="DNS 隧道（实验）"
                  checked={config.dnsTunneling}
                  onChange={(v) => setConfig({ ...config, dnsTunneling: v })}
                />
                <Checkbox
                  label="主机地址回环（实验）"
                  checked={config.hostAddressLoopback}
                  onChange={(v) => setConfig({ ...config, hostAddressLoopback: v })}
                />
                <Checkbox
                  label="追加 Windows PATH"
                  checked={config.appendWindowsPath}
                  onChange={(v) => setConfig({ ...config, appendWindowsPath: v })}
                />
              </div>
              <TextField
                label="boot.command（可选）"
                value={config.bootCommand}
                onChange={(v) => setConfig({ ...config, bootCommand: v })}
                placeholder="如：sysctl -w vm.max_map_count=262144"
              />
              <TextField
                label="默认用户（可选）"
                value={config.defaultUser}
                onChange={(v) => setConfig({ ...config, defaultUser: v })}
              />
            </Section>
            <Section title="/etc/wsl.conf（发行版内）">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Checkbox
                  label="启用 systemd"
                  checked={wslConf.systemd}
                  onChange={(v) => setWslConf({ ...wslConf, systemd: v })}
                />
                <Checkbox
                  label="启用 automount"
                  checked={wslConf.automountEnabled}
                  onChange={(v) => setWslConf({ ...wslConf, automountEnabled: v })}
                />
                <Checkbox
                  label="启用 interop"
                  checked={wslConf.interopEnabled}
                  onChange={(v) => setWslConf({ ...wslConf, interopEnabled: v })}
                />
                <Checkbox
                  label="追加 Windows PATH"
                  checked={wslConf.appendWindowsPath}
                  onChange={(v) => setWslConf({ ...wslConf, appendWindowsPath: v })}
                />
                <Checkbox
                  label="自动生成 resolv.conf"
                  checked={wslConf.generateResolvConf}
                  onChange={(v) => setWslConf({ ...wslConf, generateResolvConf: v })}
                />
                <Checkbox
                  label="自动生成 hosts"
                  checked={wslConf.generateHosts}
                  onChange={(v) => setWslConf({ ...wslConf, generateHosts: v })}
                />
              </div>
              <TextField
                label="默认用户（可选）"
                value={wslConf.defaultUser}
                onChange={(v) => setWslConf({ ...wslConf, defaultUser: v })}
              />
              <TextField
                label="挂载根目录"
                value={wslConf.mountRoot}
                onChange={(v) => setWslConf({ ...wslConf, mountRoot: v })}
              />
              <TextField
                label="挂载选项"
                value={wslConf.mountOptions}
                onChange={(v) => setWslConf({ ...wslConf, mountOptions: v })}
              />
            </Section>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Section title="生成结果">
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => copyText(wslconfigText)}>
                  复制 .wslconfig
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText(exportName('wslconfig', 'wslconfig'), wslconfigText, 'text/plain;charset=utf-8')
                  }
                >
                  下载
                </Button>
                <Button size="sm" variant="outline" onClick={() => copyText(wslConfText)}>
                  复制 wsl.conf
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadText(exportName('wslconf', 'conf'), wslConfText, 'text/plain;charset=utf-8')}
                >
                  下载
                </Button>
              </div>
              <CodeBlock code={wslconfigText} language="ini" filename=".wslconfig" lineNumbers />
              <CodeBlock code={wslConfText} language="ini" filename="/etc/wsl.conf" lineNumbers />
            </Section>
            <Note tone="info" title="生效方式">
              修改 .wslconfig 或 /etc/wsl.conf 后，必须执行 <code className="font-mono">wsl --shutdown</code> 再重新进入
              WSL 才生效。
            </Note>
          </div>
        </div>
      )}

      {(tab === 'commands' || tab === 'linux') && (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索命令或说明…"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
          {(tab === 'commands' ? WSL_COMMANDS : LINUX_COMMANDS).map((group) => {
            const rows = filterRows(group.rows);
            if (rows.length === 0) return null;
            return (
              <Section key={group.category} title={group.category}>
                <div className="flex flex-col gap-1.5">
                  {rows.map((row) => (
                    <div key={row.command} className="flex items-start gap-2 rounded-md border px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs">{row.command}</code>
                          {row.risk === 'danger' && (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                              危险
                            </span>
                          )}
                          {row.risk === 'warn' && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                              注意
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{row.description}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => copyText(row.command)} aria-label="复制命令">
                        复制
                      </Button>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}
          {query &&
            (tab === 'commands' ? WSL_COMMANDS : LINUX_COMMANDS).every((g) => filterRows(g.rows).length === 0) && (
              <EmptyHint>没有匹配的命令</EmptyHint>
            )}
        </div>
      )}

      {tab === 'troubleshoot' && (
        <div className="flex min-w-0 flex-col gap-2">
          {TROUBLESHOOT.map((item) => (
            <div key={item.symptom} className="rounded-lg border p-3">
              <p className="text-xs font-medium">{item.symptom}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">原因：</span>
                {item.cause}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed">
                <span className="font-medium text-foreground">解决：</span>
                {item.fix}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === 'docker' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="Docker Desktop on WSL2">
            <p className="text-xs leading-relaxed">
              Docker Desktop 的 WSL2 后端把数据存在 docker-desktop-data 发行版的 ext4.vhdx 里，默认在 C 盘。
              迁移数据盘：先 <code className="font-mono">wsl --shutdown</code>，再执行{' '}
              <code className="font-mono">wsl --manage docker-desktop-data --move D:\wsl-data</code>。
            </p>
          </Section>
          <Section title="VS Code Dev Containers + WSL">
            <p className="text-xs leading-relaxed">
              在 WSL 里用 VS Code 打开项目（<code className="font-mono">code .</code>），装 Remote WSL 扩展后， Dev
              Containers 可以直接在 WSL 文件系统里构建容器，避免跨文件系统性能问题。
            </p>
          </Section>
          <Section title="wsl --install 失败排查">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>BIOS 确认开启虚拟化（Intel VT-x / AMD-V）。</li>
              <li>
                管理员 PowerShell 启用可选功能：Microsoft-Windows-Subsystem-Linux 与
                VirtualMachinePlatform，重启后再装。
              </li>
              <li>旧版 Windows 不支持 WSL2，先 wsl --update 升级。</li>
              <li>安装特定发行版：wsl --install -d Ubuntu。</li>
            </ul>
          </Section>
          <Section title="发行版选型">
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 font-medium">发行版</th>
                    <th className="px-2 py-1 font-medium">特点</th>
                    <th className="px-2 py-1 font-medium">适用场景</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Ubuntu', '生态最全，文档最多', '通用开发、AI/ML、服务器模拟'],
                    ['Debian', '稳定保守', '生产环境对齐、稳定性优先'],
                    ['Alpine', '体积极小（~5MB）', '容器基础镜像、嵌入式'],
                    ['Fedora', '新特性快', '前沿技术、RHEL 上游'],
                    ['openSUSE', 'YaST 管理工具', '企业环境、SUSE 生态'],
                    ['Kali', '安全工具预装', '安全测试、渗透学习'],
                  ].map(([name, feature, scene]) => (
                    <tr key={name} className="border-b">
                      <td className="px-2 py-1 font-mono">{name}</td>
                      <td className="px-2 py-1">{feature}</td>
                      <td className="px-2 py-1 text-muted-foreground">{scene}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      <div className="mt-auto border-t pt-3">
        <LinkList items={LINKS} />
      </div>
    </ToolPanel>
  );
}
