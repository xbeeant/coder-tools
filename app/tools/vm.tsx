import { Boxes, HardDrive, Search, Server, TriangleAlert, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { CodeBlock } from '../components/ui/code-block';
import { Checkbox, Select, TextField } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  EmptyHint,
  Hint,
  type LinkItem,
  LinkList,
  Note,
  Section,
  Stat,
  StatGrid,
  ToolPanel,
} from '../components/ui/panel';
import { copyText } from '../components/ui/result';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { downloadText, exportName } from '../lib/file';

type Tab = 'compare' | 'commands' | 'vagrant' | 'vmgen' | 'clone' | 'troubleshoot';

const TABS: { value: Tab; label: string }[] = [
  { value: 'compare', label: '虚拟化对比' },
  { value: 'commands', label: '命令速查' },
  { value: 'vagrant', label: 'Vagrantfile' },
  { value: 'vmgen', label: 'QEMU / libvirt' },
  { value: 'clone', label: '克隆与迁移' },
  { value: 'troubleshoot', label: '排障' },
];

interface VirtRow {
  name: string;
  type: string;
  isolation: string;
  bootSpeed: string;
  guestOs: string;
  note: string;
}

const VIRTUALIZATION = virtRows([
  'VirtualBox | Type-2 桌面虚拟化 | 共享内核 + 硬件虚拟化 | 慢 | 几乎所有桌面 OS | 老的免费方案，VirtualBox 7 之后趋于慢速维护',
  'VMware Workstation Pro | Type-2 桌面虚拟化 | 强（VMware 自己的 hypervisor） | 中 | 主流桌面 OS | 融合了 Workstation 与 Fusion，个人免费',
  'VMware Fusion | Type-2（macOS） | 强 | 中 | macOS / Linux 客机 | macOS 上体验最好，Intel 与 Apple Silicon 都支持',
  'Parallels Desktop | Type-2（macOS / Windows） | 强 | 快 | macOS / Windows / Linux | 商业授权，体验最省心',
  'QEMU | Type-1 用户态模拟器 | 依赖加速器（TCG 或 KVM） | 快（有 KVM） | 任意 | 上层工具链的底座，配合 libvirt 才好用',
  'KVM | Type-1 内核模块 | 硬件级 | 极快 | Linux 客机 | Linux 上性能最好，需要嵌套虚拟化支持',
  'VMware ESXi / vSphere | Type-1 企业虚拟化 | 强 | 快 | 任意 | 企业私有云底座，vMotion 迁移是其杀手锏',
  'Proxmox VE | Type-1（基于 KVM） | 强 | 快 | Linux 客机为主 | 集群、备份、存储一体化，开源私有云常见方案',
  'Xen / XCP-ng | Type-1 Hypervisor | 强（Type-1 隔离） | 快 | Linux 为主 | 强隔离，但生态不如 KVM',
  'Hyper-V | Type-1（Windows） | 强 | 快 | Windows / Linux | Windows Server 与 WSL2 的底座',
  'Apple Virtualization.framework | Type-2（macOS） | 强 | 快 | macOS / Linux | Docker Desktop 与 Multipass 用它',
  'Multipass | 基于虚拟化框架的极简封装 | 强 | 快 | Ubuntu / 官方镜像 | 命令行起一台干净 VM，适合本地实验',
  'Vagrant | 编排层，不是虚拟化本身 | 取决于 provider | 取决于 provider | 任意 | 用 Vagrantfile 声明机器，底层可以是 VMware / VirtualBox / libvirt',
  'Terraform | 基础设施即代码 | 不提供隔离 | 不适用 | 不适用 | 声明云上 VM，与本地虚拟化不是一回事',
  'Firecracker | Type-1 microVM | 强（每个 microVM 独立内核） | 极快（<125ms） | Linux only | 专为 Serverless 设计，单机可跑几千个',
  'Cloud Hypervisor | Type-1 VMM | 强 | 极快 | Linux only | Firecracker 的替代品，更贴近真实硬件',
]);

const VIRT_COLUMNS = [
  { key: 'type', label: '类型' },
  { key: 'isolation', label: '隔离强度' },
  { key: 'bootSpeed', label: '启动速度' },
  { key: 'guestOs', label: '客机系统' },
] as const;

// ── 命令速查 ────────────────────────────────────────────────────────────

interface VirtCommandRow {
  task: string;
  command: string;
  note: string;
}

const LINUX_VIRT_COMMANDS: VirtCommandRow[] = [
  { task: '列出全部虚拟机', command: 'virsh list --all', note: '--all 含已关闭的' },
  { task: '启动虚拟机', command: 'virsh start <name>', note: '' },
  { task: '优雅关机', command: 'virsh shutdown <name>', note: 'guest 里没装 acpid 时不生效' },
  { task: '强制断电', command: 'virsh destroy <name>', note: '等同拔电源，有数据损坏风险' },
  { task: '挂起 / 恢复', command: 'virsh suspend <name> / virsh resume <name>', note: '比关机快，内存状态保留' },
  {
    task: '重命名虚拟机',
    command: 'virsh domstate <name> && virsh define new.xml',
    note: '先导出 XML 改名字再重新定义',
  },
  { task: '看虚拟机的详细配置', command: 'virt-xml-dump <name> --xml', note: '比 virsh dumpxml 更干净' },
  { task: '列出可用网络', command: 'virsh net-list --all', note: '' },
  { task: '列出存储池', command: 'virsh pool-list --all', note: '' },
  { task: '查看磁盘占用', command: 'du -sh /var/lib/libvirt/images', note: 'qcow2 稀疏盘要看实际占用用 qemu-img info' },
  {
    task: '看 qcow2 真实大小',
    command: 'qemu-img info --backing-chain disk.qcow2',
    note: '虚拟大小往往远大于实际大小',
  },
  { task: '压缩 qcow2 磁盘', command: 'qemu-img convert -O qcow2 -c src.qcow2 new.qcow2', note: '需要虚拟机先关机' },
  { task: '转换磁盘格式', command: 'qemu-img convert -O raw a.qcow2 b.raw', note: '' },
  {
    task: '无盘启动',
    command: 'qemu-system-x86_64 -kernel /boot/vmlinuz -initrd /boot/initrd.img -append "root=/dev/vda" ...',
    note: '调试内核常用',
  },
  {
    task: '安装系统（Vagrant 风格）',
    command: 'virt-install --name vm --memory 2048 --vcpus 2 --disk size=20 --cdrom ./iso.iso --os-variant ubuntu22.04',
    note: 'os-variant 不给会导致性能与时钟异常',
  },
  { task: '查看 CPU 虚拟化支持', command: 'grep -cE "vmx|svm" /proc/cpuinfo', note: '结果非 0 才能开 KVM' },
  { task: '查看嵌套虚拟化', command: 'cat /sys/module/kvm_intel/parameters/nested', note: '' },
];

const MULTIPASS_COMMANDS: VirtCommandRow[] = [
  { task: '启动一台 Ubuntu 机器', command: 'multipass launch --name dev --cpus 2 --memory 4G --disk 20G', note: '' },
  { task: '列出机器', command: 'multipass list', note: '' },
  { task: '进入机器', command: 'multipass shell dev', note: '' },
  { task: '执行单条命令', command: 'multipass exec dev -- bash -lc "systemctl status nginx"', note: '' },
  { task: '转发端口', command: 'multipass forward dev --map 8080:80', note: '' },
  { task: '传文件', command: 'multipass transfer dev ./local.txt /home/ubuntu/remote.txt', note: '' },
  { task: '快照', command: 'multipass snapshot dev', note: '' },
  { task: '删除机器', command: 'multipass delete dev --purge', note: '会连同快照一起删' },
  { task: '重启 / 停止', command: 'multipass restart dev / multipass stop dev', note: '' },
];

const VAGRANT_COMMANDS: VirtCommandRow[] = [
  { task: '初始化', command: 'vagrant init', note: '生成 Vagrantfile' },
  { task: '启动虚拟机', command: 'vagrant up', note: '首次会下载 box，最慢的一步' },
  { task: 'SSH 进去', command: 'vagrant ssh', note: '' },
  { task: '看状态', command: 'vagrant status', note: '' },
  { task: '关机（保留数据）', command: 'vagrant halt', note: '' },
  { task: '销毁并重建', command: 'vagrant destroy -f', note: '数据全丢，但配置还能重放' },
  { task: '重新打包 box', command: 'vagrant package --output my.box', note: '' },
  { task: '推送 box 到 Atlas / 私有源', command: 'vagrant box push', note: '' },
  { task: '重新打快照', command: 'vagrant provision', note: '只跑 provisioner，不重建机器' },
  { task: '指定目标 provider', command: 'vagrant up --provider=libvirt', note: '' },
];

// ── Vagrantfile ─────────────────────────────────────────────────────────

interface VagrantOptions {
  box: string;
  hostname: string;
  cpus: number;
  memory: number;
  forwardedPort: number;
  hostPort: number;
  privateNetwork: string;
  syncedFolder: string;
  syncedType: string;
  provisioning: string;
  synced: boolean;
  apt: boolean;
  docker: boolean;
}

const DEFAULT_VAGRANT: VagrantOptions = {
  box: 'ubuntu/jammy64',
  hostname: 'dev-box',
  cpus: 2,
  memory: 2048,
  forwardedPort: 80,
  hostPort: 8080,
  privateNetwork: '192.168.56.0/24',
  syncedFolder: './',
  syncedType: 'rsync',
  provisioning: 'none',
  synced: true,
  apt: true,
  docker: false,
};

const PROVISIONERS: { value: string; label: string }[] = [
  { value: 'none', label: '不装（最干净）' },
  { value: 'shell', label: '内联 shell 脚本' },
  { value: 'ansible', label: 'Ansible playbook' },
  { value: 'docker', label: 'Docker 化环境' },
];

function buildVagrantfile(options: VagrantOptions): string {
  const synced = options.synced
    ? `
  # 同步目录：默认 /vagrant，改类型可以避开 VirtualBox 共享目录的性能问题
  config.vm.synced_folder "${options.syncedFolder}", "/vagrant", type: "${options.syncedType}"
`
    : `
  # 不同步目录：宿主机上的代码不会进虚拟机，适合纯工具类机器
  config.vm.synced_folder ".", "/vagrant", disabled: true
`;
  const forwarded =
    options.hostPort === 0
      ? '  # 端口转发：把宿主机端口设为 0 表示由 Vagrant 自动分配\n  config.vm.network "forwarded_port", guest: PORT, host: 0, auto_correct: true\n'
      : `  # 端口转发：宿主机 PORT -> 客机 GUEST\n  config.vm.network "forwarded_port", guest: ${options.forwardedPort}, host: ${options.hostPort}, auto_correct: true\n`;
  const apt = options.apt
    ? `
  config.vm.provision "shell", inline: <<-SHELL
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl git vim build-essential
    apt-get clean
  SHELL
`
    : '';
  const provision =
    options.provisioning === 'shell'
      ? `
  # 具体的软件安装写在这里，Vagrant 只在需要时执行
  config.vm.provision "shell", inline: <<-SHELL
    set -e
    echo "provisioning $(date)"
  SHELL
`
      : options.provisioning === 'ansible'
        ? `
  config.vm.provision "ansible" do |ansible|
    ansible.playbook = "playbook.yml"
    ansible.compatibility_mode = "2.0"
    ansible.extra_vars = { env: "dev" }
  end
`
        : options.provisioning === 'docker'
          ? `
  config.vm.provision "docker" do |d|
    d.build_dir = "./docker"
    d.run = "always"
    d.args = ["-d"]
  end
`
          : '';

  return `# -*- mode: ruby -*-
# vi: set ft=ruby :
#
# 常用命令：vagrant up / vagrant ssh / vagrant halt / vagrant destroy -f

Vagrant.configure("2") do |config|
  config.vm.box = "${options.box}"
  config.vm.hostname = "${options.hostname}"

  # VirtualBox 的 provider 专属配置；libvirt 下这段要换成 config.vm.provider "libvirt" do |libvirt| ... end
  config.vm.provider "virtualbox" do |vb|
    vb.name = "${options.hostname}"
    vb.cpus = ${options.cpus}
    vb.memory = ${options.memory}
    # 默认控制器类型对新系统兼容性更好
    vb.controller = "vboxnet"
    vb.customize ["modifyvm", :id, "--audio", "none"]
  end

  config.vm.provider "libvirt" do |lv|
    lv.cpus = ${options.cpus}
    lv.memory = ${options.memory}
  end

  # 内网：多机互联用，宿主机可以直连
  config.vm.network "private_network", ip: "${options.privateNetwork.split('/')[0]}"
${synced}${forwarded}${apt}${provision}end
`;
}

// ── QEMU / libvirt ──────────────────────────────────────────────────────

type VmgenKind = 'qemu' | 'libvirt';

const VMGEN_KINDS: { value: VmgenKind; label: string }[] = [
  { value: 'qemu', label: 'QEMU 命令行' },
  { value: 'libvirt', label: 'libvirt XML' },
];

interface VmgenOptions {
  kind: VmgenKind;
  name: string;
  memory: number;
  cpus: number;
  diskSize: number;
  diskFormat: string;
  network: string;
  accelerator: string;
  headless: boolean;
  secureBoot: boolean;
}

const DEFAULT_VMGEN: VmgenOptions = {
  kind: 'qemu',
  name: 'ubuntu-dev',
  memory: 4096,
  cpus: 2,
  diskSize: 20,
  diskFormat: 'qcow2',
  network: 'virtio',
  accelerator: 'kvm',
  headless: true,
  secureBoot: false,
};

function buildVmgen(options: VmgenOptions): string {
  if (options.kind === 'qemu') {
    return `# 先准备磁盘镜像
qemu-img create -f ${options.diskFormat} ${options.name}.${options.diskFormat} ${options.diskSize}G

# 启动虚拟机
qemu-system-x86_64 \\
  -name ${options.name} \\
  -m ${options.memory}M \\
  -smp ${options.cpus},cores=${options.cpus} \\
  -accel ${options.accelerator === 'none' ? 'tcg' : options.accelerator} \\
  -drive file=${options.name}.${options.diskFormat},if=virtio,format=${options.diskFormat} \\
  -netdev user,id=net0,hostfwd=tcp::2222-:22 \\
  -device ${options.network},netdev=net0 \\
  ${options.headless ? '-nographic \\\n' : ''}  -serial mon:stdio
`;
  }
  return `<domain type='kvm'>
  <name>${options.name}</name>
  <memory unit='MiB'>${options.memory}</memory>
  <currentMemory unit='MiB'>${options.memory}</currentMemory>
  <vcpu placement='static'>${options.cpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc-q35'>hvm</type>
    ${options.secureBoot ? "<loader readonly='yes' type='pflash'>/usr/share/OVMF/OVMF_CODE.secboot.fd</loader>" : "<loader readonly='yes' type='pflash'>/usr/share/OVMF/OVMF_CODE.fd</loader>"}
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-passthrough' check='none'/>
  <clock offset='utc'>
    <timer name='rtc' tickpolicy='catchup'/>
  </clock>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='${options.diskFormat}'/>
      <source file='/var/lib/libvirt/images/${options.name}.${options.diskFormat}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <controller type='usb' index='0' model='ich9-ehci1'/>
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
  </devices>
</domain>

# 保存并注册
virsh define ${options.name}.xml
virsh start ${options.name}
# 如果要长期管理，建议用 virt-install 直接建，别手工 define
virt-install --name ${options.name} --memory ${options.memory} --vcpus ${options.cpus} \\
  --disk path=/var/lib/libvirt/images/${options.name}.${options.diskFormat},size=${options.diskSize} \\
  --os-variant ubuntu22.04 --network network=default --import
`;
}

// ── 克隆与迁移 ──────────────────────────────────────────────────────────

interface CloneRow {
  scenario: string;
  steps: string[];
  note: string;
}

const CLONE_SCENARIOS: CloneRow[] = [
  {
    scenario: 'Vagrant box 打包与分发',
    steps: [
      'vagrant package --output my.box',
      'vagrant box add my.box --name my-local',
      '分发到内部源：vagrant cloud publish 或放到 HTTP 服务',
      '使用方：vagrant box add my-local https://内部地址/my.box',
    ],
    note: 'box 里通常已经装好 Vagrant / VirtualBox guest additions，开箱即用',
  },
  {
    scenario: '虚拟磁盘克隆（关机状态）',
    steps: [
      'qemu-img convert -O qcow2 -c 源.qcow2 目标.qcow2',
      '生成新的 MAC 与 UUID：virt-xml 改 XML 后 virsh define',
      'virt-install --import 挂载新盘',
    ],
    note: '运行中的虚拟机不能直接克隆盘；Vagrant 提供了 vagrant clone 做这件事',
  },
  {
    scenario: '整机迁移到新宿主机',
    steps: [
      'virsh dumpxml <vm> > vm.xml',
      'qemu-img convert -O qcow2 -c 旧盘.qcow2 新盘.qcow2',
      'scp 传 xml 与镜像到新宿主机',
      'virsh define vm.xml && virsh start <vm>',
    ],
    note: '记得改 XML 里的磁盘路径与网络名；MAC 地址保持一致可以保留 DHCP 绑定',
  },
  {
    scenario: '从云上导出为本地可跑',
    steps: [
      '导出为 OVA / QCOW2 / RAW（各家控制台或 API）',
      'qemu-img convert 转成目标格式',
      'virt-install --import 指定 os-variant',
    ],
    note: '云镜像的固件类型（BIOS/UEFI）与虚拟网卡型号可能需要手动对齐，否则启动不了',
  },
  {
    scenario: 'Vagrant 私有 box 仓库',
    steps: [
      'Vagrantfile 里 source "my-org/box", "https://内部源/box.box"',
      '或 box add 时用 --insecure 处理自签证书',
      '团队统一 box 版本，避免每人 box 不一致',
    ],
    note: 'box 版本写死，别用 latest，否则 CI 会突然换环境',
  },
];

const TROUBLESHOOTS: { q: string; a: string }[] = [
  {
    q: '虚拟机特别慢（QEMU / libvirt）',
    a: '先用 virsh domblklist / 确认磁盘不是 raw 裸文件，再检查是否用了 TCG 模拟而不是 KVM。virsh domstate 看是否 running，正常情况虚拟化加速一定要开。',
  },
  {
    q: 'Vagrant up 卡在 SSH 认证',
    a: '多半是 box 里的 authorized_keys 与本机公钥不匹配。vagrant destroy -f 后 vagrant up --provision，或者 vagrant ssh-config 看实际端口手动连。',
  },
  {
    q: 'Vagrant 同步目录很慢',
    a: 'VirtualBox 共享目录在大文件多时极慢。改成 type: "rsync"（需要 vagrant rsync 插件）或 type: "virtualbox" 换成 NFS / virtiofs。',
  },
  {
    q: 'KVM 不可用',
    a: 'grep -cE "vmx|svm" /proc/cpuinfo 为 0 说明 CPU 不支持或 BIOS 没开 VT-x / AMD-V。云上还要确认实例类型是否支持嵌套虚拟化。',
  },
  {
    q: '虚拟机时间飘移',
    a: 'virt-install 一定要带 --os-variant，它决定时钟模型和电源管理。缺省情况下 Windows 客机的时间会莫名跳变。',
  },
  {
    q: '磁盘快满了但 df 显示还有空间',
    a: 'qcow2 是稀疏盘，虚拟大小不等于实际占用。qemu-img info 看 actual，du -sh 看真实文件大小。清理 guest 里的空间不会自动还给宿主，需要 fstrim + 稀疏支持。',
  },
  {
    q: 'VirtualBox 启动报 VT-x 错误',
    a: 'Hyper-V / WSL2 / 内存完整性会占用虚拟化扩展。要么关掉这些特性，要么改用 VMware 或 Hyper-V 这类能共存的方式。',
  },
  {
    q: '怎么确认虚拟机的资源限制',
    a: 'virsh dominfo 看当前配置，virsh setvcpus / virsh setmaxmem 调整。Windows 客机里还要确认 guest 自己的分页文件与休眠设置。',
  },
];

const LINKS: LinkItem[] = [
  {
    name: 'QEMU 文档',
    url: 'https://www.qemu.org/docs/master/',
    description: 'QEMU 参数与设备模型',
    tags: ['QEMU', '官方'],
  },
  {
    name: 'libvirt 文档',
    url: 'https://libvirt.org/docs.html',
    description: 'virsh / virt-install / XML 格式',
    tags: ['libvirt'],
  },
  {
    name: 'Vagrant 文档',
    url: 'https://developer.hashicorp.com/vagrant/docs',
    description: 'Vagrantfile 与 provider 机制',
    tags: ['Vagrant'],
  },
  {
    name: 'Vagrant box 仓库',
    url: 'https://app.vagrantup.com/boxes/search',
    description: '官方 box 搜索，注意版本与 provider',
    tags: ['Vagrant'],
  },
  {
    name: 'Multipass 文档',
    url: 'https://documentation.ubuntu.com/multipass/',
    description: '命令行起轻量 VM',
    tags: ['Multipass'],
  },
  { name: 'virt-manager', url: 'https://virt-manager.org/', description: 'libvirt 的图形界面', tags: ['GUI'] },
  {
    name: 'Proxmox 文档',
    url: 'https://pve.proxmox.com/pve-docs/',
    description: '开源自建虚拟化平台',
    tags: ['Proxmox'],
  },
  {
    name: 'Firecracker 文档',
    url: 'https://github.com/firecracker-microvm/firecracker',
    description: 'microVM 运行时的设计与取舍',
    tags: ['microVM'],
  },
  {
    name: 'cloud-hypervisor',
    url: 'https://www.cloudhypervisor.org/',
    description: '更贴近真实硬件的 VMM',
    tags: ['microVM'],
  },
  {
    name: 'NVIDIA vGPU 文档',
    url: 'https://docs.nvidia.com/vgpu/',
    description: '虚拟机里用 GPU 的官方方案',
    tags: ['GPU'],
  },
];

function virtRows(lines: string[]): VirtRow[] {
  return lines.map((line) => {
    const [name, type, isolation, bootSpeed, guestOs, note] = line.split(' | ');
    return { name, type, isolation, bootSpeed, guestOs, note };
  });
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-56">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 pl-7 text-xs"
        aria-label={placeholder}
      />
    </div>
  );
}

function filterRows<T>(query: string, rows: T[], fields: (keyof T)[]) {
  const q = query.trim().toLowerCase();
  if (q === '') return rows;
  return rows.filter((row) =>
    fields
      .map((key) => String(row[key]))
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

export default function Vm() {
  const [tab, setTab] = useState<Tab>('compare');
  const [query, setQuery] = useState('');
  const [vagrant, setVagrant] = useState<VagrantOptions>(DEFAULT_VAGRANT);
  const [vmgen, setVmgen] = useState<VmgenOptions>(DEFAULT_VMGEN);

  const filteredVirt = useMemo(
    () => filterRows(query, VIRTUALIZATION, ['name', 'type', 'isolation', 'bootSpeed', 'guestOs', 'note']),
    [query],
  );
  const filteredLinux = useMemo(() => filterRows(query, LINUX_VIRT_COMMANDS, ['task', 'command', 'note']), [query]);
  const filteredMultipass = useMemo(() => filterRows(query, MULTIPASS_COMMANDS, ['task', 'command', 'note']), [query]);
  const filteredVagrantCommands = useMemo(
    () => filterRows(query, VAGRANT_COMMANDS, ['task', 'command', 'note']),
    [query],
  );
  const filteredClones = useMemo(() => filterRows(query, CLONE_SCENARIOS, ['scenario', 'note']), [query]);
  const filteredTrouble = useMemo(() => filterRows(query, TROUBLESHOOTS, ['q', 'a']), [query]);

  const vagrantText = useMemo(() => buildVagrantfile(vagrant), [vagrant]);
  const vmgenText = useMemo(() => buildVmgen(vmgen), [vmgen]);

  const vmCount =
    VIRTUALIZATION.length + LINUX_VIRT_COMMANDS.length + MULTIPASS_COMMANDS.length + VAGRANT_COMMANDS.length;

  return (
    <ToolPanel
      title="虚拟化工具"
      description={`${VIRTUALIZATION.length} 种虚拟化方案对比、${vmCount} 条命令、Vagrantfile 与 QEMU / libvirt 配置生成`}
      actions={<SearchBox value={query} onChange={setQuery} placeholder="搜索方案或命令" />}
    >
      <Note tone="warn" title="定位说明">
        浏览器扩展<b>无法创建虚拟机、无法运行 QEMU / Vagrant、也不碰宿主机的虚拟化后端</b>。
        本工具提供选型对比、命令速查与配置文件生成。 Vagrant box 也无法在浏览器里下载与挂载，必须在本机或 CI
        的虚拟化环境中执行。
      </Note>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} active={tab === item.value}>
              <span className="inline-flex items-center gap-1">
                {item.value === 'compare' && <Boxes className="size-3.5" />}
                {item.value === 'commands' && <Wrench className="size-3.5" />}
                {item.value === 'vagrant' && <Server className="size-3.5" />}
                {item.value === 'vmgen' && <Server className="size-3.5" />}
                {item.value === 'clone' && <HardDrive className="size-3.5" />}
                {item.value === 'troubleshoot' && <TriangleAlert className="size-3.5" />}
                {item.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'compare' && (
        <Section title="虚拟化方案对比" description="从桌面 Type-2 到云上 microVM，理解隔离层级与性能取舍">
          {filteredVirt.length === 0 ? (
            <EmptyHint>没有匹配的方案</EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1.5 pr-2 font-medium">名称</th>
                    {VIRT_COLUMNS.map((column) => (
                      <th key={column.key} className="py-1.5 pr-2 font-medium">
                        {column.label}
                      </th>
                    ))}
                    <th className="py-1.5 pr-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVirt.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{row.name}</td>
                      {VIRT_COLUMNS.map((column) => (
                        <td key={column.key} className="py-1.5 pr-2 text-muted-foreground">
                          {row[column.key]}
                        </td>
                      ))}
                      <td className="py-1.5 pr-2 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Hint>
            Type-1 直接跑在裸机上，隔离最强、开销最低；Type-2 跑在宿主 OS 之上，多一层依赖但装起来简单。microVM
            给每个实例独立内核，是云上高密度的折中方案。
          </Hint>
        </Section>
      )}

      {tab === 'commands' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="virsh / QEMU / libvirt" description="Linux 上管理 KVM 虚拟机的常用命令">
            {filteredLinux.length === 0 ? <EmptyHint>没有匹配的命令</EmptyHint> : <CommandList rows={filteredLinux} />}
          </Section>
          <Section title="Multipass" description="命令极简，适合本地起一台干净环境做实验">
            {filteredMultipass.length === 0 ? (
              <EmptyHint>没有匹配的命令</EmptyHint>
            ) : (
              <CommandList rows={filteredMultipass} />
            )}
          </Section>
          <Section title="Vagrant" description="Vagrant 是编排层，真正的虚拟化由 provider 提供">
            {filteredVagrantCommands.length === 0 ? (
              <EmptyHint>没有匹配的命令</EmptyHint>
            ) : (
              <CommandList rows={filteredVagrantCommands} />
            )}
          </Section>
          <Note tone="info" title="virsh 常用小技巧">
            <ul className="list-disc pl-4">
              <li>
                <code>virsh console &lt;vm&gt;</code> 直接接串口，比 ssh 更快看到启动过程。
              </li>
              <li>
                <code>virsh domifaddr &lt;vm&gt;</code> 查客机真实 IP，比在控制台跑命令方便。
              </li>
              <li>
                <code>virsh snapshot-create-as &lt;vm&gt; snap1</code> 做快照，出问题时回滚比重装快。
              </li>
            </ul>
          </Note>
        </div>
      )}

      {tab === 'vagrant' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项" description="provider 与 box 决定了这台机器的底子">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                label="box"
                value={vagrant.box}
                onChange={(box) => setVagrant({ ...vagrant, box })}
                hint="vagrant init 后可以按需替换"
              />
              <TextField
                label="hostname"
                value={vagrant.hostname}
                onChange={(hostname) => setVagrant({ ...vagrant, hostname })}
              />
              <TextField
                label="内存 (MB)"
                type="number"
                value={String(vagrant.memory)}
                onChange={(value) => setVagrant({ ...vagrant, memory: Number(value) || 2048 })}
              />
              <TextField
                label="CPU 核数"
                type="number"
                value={String(vagrant.cpus)}
                onChange={(value) => setVagrant({ ...vagrant, cpus: Number(value) || 2 })}
              />
              <TextField
                label="客机端口"
                type="number"
                value={String(vagrant.forwardedPort)}
                onChange={(value) => setVagrant({ ...vagrant, forwardedPort: Number(value) || 80 })}
              />
              <TextField
                label="宿主机端口（0 表示自动分配）"
                type="number"
                value={String(vagrant.hostPort)}
                onChange={(value) => setVagrant({ ...vagrant, hostPort: Math.max(0, Number(value) || 0) })}
              />
              <TextField
                label="内网网段"
                value={vagrant.privateNetwork}
                onChange={(privateNetwork) => setVagrant({ ...vagrant, privateNetwork })}
                hint="多机互联时改成静态 IP"
              />
              <Select
                label="同步目录类型"
                value={vagrant.syncedType}
                onChange={(syncedType) => setVagrant({ ...vagrant, syncedType })}
                options={[
                  { value: 'rsync', label: 'rsync（性能好，推荐）' },
                  { value: 'virtualbox', label: 'virtualbox（默认，最兼容）' },
                  { value: 'nfs', label: 'nfs' },
                  { value: 'virtiofs', label: 'virtiofs' },
                ]}
              />
              <Select
                label="provision"
                value={vagrant.provisioning}
                onChange={(provisioning) => setVagrant({ ...vagrant, provisioning })}
                options={PROVISIONERS}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox
                label="同步宿主机目录"
                checked={vagrant.synced}
                onChange={(synced) => setVagrant({ ...vagrant, synced })}
              />
              <Checkbox
                label="基础软件包（shell provisioner）"
                checked={vagrant.apt}
                onChange={(apt) => setVagrant({ ...vagrant, apt })}
              />
              <Checkbox
                label="追加 Docker provisioner"
                checked={vagrant.docker}
                onChange={(docker) => setVagrant({ ...vagrant, docker })}
              />
            </div>
          </Section>
          <StatGrid>
            <Stat label="内存" value={`${vagrant.memory} MB`} />
            <Stat label="CPU" value={vagrant.cpus} />
            <Stat
              label="端口映射"
              value={vagrant.hostPort === 0 ? '自动' : `${vagrant.hostPort} → ${vagrant.forwardedPort}`}
            />
            <Stat
              label="同步类型"
              value={vagrant.synced ? vagrant.syncedType : '关闭'}
              tone={vagrant.synced ? 'success' : 'warn'}
            />
          </StatGrid>
          <Section
            title="Vagrantfile"
            description="生成后放进项目目录，再执行 vagrant up"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(vagrantText)} aria-label="复制 Vagrantfile">
                复制
              </Button>
            }
          >
            <CodeBlock
              code={vagrantText}
              language="ruby"
              title="Vagrantfile"
              filename="Vagrantfile"
              lineNumbers
              maxLines={50}
            />
          </Section>
          <Section title="常用命令">
            <CodeBlock
              code={`# 第一次启动会下载 box，最慢的一步
vagrant up

# 进去之后装东西
vagrant ssh
sudo apt-get update && sudo apt-get install -y <包名>

# 只重跑 provision，不重建机器
vagrant provision

# 关机保留数据 / 销毁重建
vagrant halt
vagrant destroy -f

# 看实际使用的端口与连接参数
vagrant port
vagrant ssh-config`}
              language="shell"
              title="shell"
              maxLines={25}
            />
          </Section>
          <Section
            title="下载"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(exportName('Vagrantfile', 'rb'), vagrantText)}
              >
                下载 Vagrantfile
              </Button>
            }
          >
            <Hint>
              box 版本要写死（不要 latest），否则同事之间的环境会不一致；CI 里配合{' '}
              <code>vagrant box update --box &lt;box&gt;</code> 显式升级。
            </Hint>
          </Section>
        </div>
      )}

      {tab === 'vmgen' && (
        <div className="flex min-w-0 flex-col gap-3">
          <Section title="生成选项">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="输出形式"
                value={vmgen.kind}
                onChange={(kind) => setVmgen({ ...vmgen, kind: kind as VmgenKind })}
                options={VMGEN_KINDS}
              />
              <TextField label="虚拟机名" value={vmgen.name} onChange={(name) => setVmgen({ ...vmgen, name })} />
              <TextField
                label="内存 (MB)"
                type="number"
                value={String(vmgen.memory)}
                onChange={(value) => setVmgen({ ...vmgen, memory: Number(value) || 2048 })}
              />
              <TextField
                label="vCPU"
                type="number"
                value={String(vmgen.cpus)}
                onChange={(value) => setVmgen({ ...vmgen, cpus: Number(value) || 2 })}
              />
              <TextField
                label="磁盘 (GB)"
                type="number"
                value={String(vmgen.diskSize)}
                onChange={(value) => setVmgen({ ...vmgen, diskSize: Number(value) || 20 })}
              />
              <Select
                label="磁盘格式"
                value={vmgen.diskFormat}
                onChange={(diskFormat) => setVmgen({ ...vmgen, diskFormat })}
                options={[
                  { value: 'qcow2', label: 'qcow2（稀疏，推荐）' },
                  { value: 'raw', label: 'raw' },
                  { value: 'vmdk', label: 'vmdk（VMware）' },
                ]}
              />
              <Select
                label="加速方式"
                value={vmgen.accelerator}
                onChange={(accelerator) => setVmgen({ ...vmgen, accelerator })}
                options={[
                  { value: 'kvm', label: 'KVM（硬件加速）' },
                  { value: 'tcg', label: 'TCG（纯模拟，慢）' },
                ]}
                hint="没有 KVM 时才用 TCG，性能差一个数量级"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Checkbox
                label="无界面（headless）"
                checked={vmgen.headless}
                onChange={(headless) => setVmgen({ ...vmgen, headless })}
              />
              <Checkbox
                label="Secure Boot（OVMF）"
                checked={vmgen.secureBoot}
                onChange={(secureBoot) => setVmgen({ ...vmgen, secureBoot })}
              />
            </div>
          </Section>
          <StatGrid>
            <Stat
              label="加速"
              value={vmgen.accelerator === 'kvm' ? 'KVM' : 'TCG'}
              tone={vmgen.accelerator === 'kvm' ? 'success' : 'warn'}
            />
            <Stat label="磁盘格式" value={vmgen.diskFormat} />
            <Stat label="配置行数" value={vmgenText.split('\n').length} />
            <Stat label="固件" value={vmgen.secureBoot ? 'Secure Boot' : '普通 UEFI'} />
          </StatGrid>
          <Section
            title={vmgen.kind === 'qemu' ? 'QEMU 命令' : 'libvirt 域定义'}
            description="手工定义 XML 只适合一次性实验，长期管理建议用 virt-install"
            actions={
              <Button variant="ghost" size="sm" onClick={() => copyText(vmgenText)} aria-label="复制配置">
                复制
              </Button>
            }
          >
            <CodeBlock
              code={vmgenText}
              language={vmgen.kind === 'qemu' ? 'shell' : 'xml'}
              title={vmgen.kind === 'qemu' ? 'run.sh' : `${vmgen.name}.xml`}
              filename={vmgen.kind === 'qemu' ? 'run.sh' : `${vmgen.name}.xml`}
              maxLines={55}
            />
          </Section>
          <Section
            title="下载"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadText(
                    exportName(vmgen.kind === 'qemu' ? 'run-vm' : vmgen.name, vmgen.kind === 'qemu' ? 'sh' : 'xml'),
                    vmgenText,
                    vmgen.kind === 'qemu' ? 'text/x-shellscript;charset=utf-8' : 'application/xml;charset=utf-8',
                  )
                }
              >
                下载
              </Button>
            }
          >
            <Hint>执行前确认宿主机已安装 qemu-system-x86_64；libvirt 方式还需要能写 /etc/libvirt/qemu 目录。</Hint>
          </Section>
        </div>
      )}

      {tab === 'clone' && (
        <Section title="克隆与迁移" description="按场景给出的步骤顺序">
          {filteredClones.length === 0 ? (
            <EmptyHint>没有匹配的场景</EmptyHint>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredClones.map((row) => (
                <div key={row.scenario} className="rounded-md border p-3">
                  <p className="text-xs font-medium">{row.scenario}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                    {row.steps.map((step) => (
                      <li key={step} className="font-mono">
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[11px] text-muted-foreground">{row.note}</p>
                </div>
              ))}
            </div>
          )}
          <Note tone="warn" title="克隆时的坑">
            MAC 地址与磁盘 UUID 不改的话，新机器可能拿不到 DHCP 绑定，或者被当作同一台机器重复注册。 迁移前顺手改掉：
            <code>virt-xml --edit --network network=... --match mac ...</code>。
          </Note>
        </Section>
      )}

      {tab === 'troubleshoot' && (
        <Section title="排障" description="性能、时钟、磁盘三个方向最容易出问题">
          {filteredTrouble.length === 0 ? (
            <EmptyHint>没有匹配的问题</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredTrouble.map((row) => (
                <li key={row.q} className="rounded-md border px-3 py-2">
                  <p className="text-xs font-medium">{row.q}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.a}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="官方文档与工具">
        <LinkList items={LINKS} columns={3} />
      </Section>
    </ToolPanel>
  );
}

function CommandList({ rows }: { rows: VirtCommandRow[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li key={row.task} className="rounded-md border px-3 py-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium">{row.task}</span>
            <code className="font-mono text-[11px] text-muted-foreground">{row.command}</code>
          </div>
          {row.note !== '' && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}
