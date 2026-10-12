# 盾服务 Windows/WSL 与 Apple Silicon Mac 部署方案

日期：2026-10-12。入场状态：开发方案已纠正，尚未实施或在 Mac 验证。

同日实施补注：Linux公共包、WSL薄入口和Lima配置已实现，x64最终包已有Windows定点实测；Apple Silicon Mac尚未连通，arm64原生构建、Lima实际部署及双平台验收未完成。逐项事实见 [执行记录](SHIELD_DEPLOYMENT_EXECUTION_20261012.md) 与 [PROGRESS顶部](PROGRESS.md)。下文保留方案形成时的基线和关闭条件。

用户目标：现有盾继续在 Windows/WSL 使用，另一台 Apple Silicon Mac 也能独立、方便地运行。优先接入成熟开源运行环境，禁止自写跨平台服务管理框架。本文与 [B-A-T 两项清理](BSK_REMOVAL_AND_EXPLORATION_CLEANUP_PLAN_20261012.md) 分开实施；本轮仍只交文档。

## 0. 已纠正的错误与不可覆盖的既有决定

此前本稿推荐 Docker Compose，没有先核对已作出的运行环境决定，现撤回该建议和全部 Docker 实施步骤。

真实原因见 [10月8日运行环境纠正](ANTIBOT_SERVICE_IMPLEMENTATION_20261008.md#2026-10-08-运行环境纠正)：当时将残留 Docker CLI/文件误判为可用安装，两次启动分别失败于 dockerInference、Secrets Engine；用户明确本机没有可用 Docker Desktop，停止路线，改用已确认可用的 WSL Ubuntu 26.04 与 systemd。没有证据把当时拒绝 Docker 的原因改写成指纹或网络失真。旧目录保留与未清理状态仍按原记录，不在本次文档工作中处理。

新 session 不安装、修复或重新引入 Docker Desktop、Docker Engine、Compose、Colima/containerd 来绕回这条路线。

## 1. 推荐接入方案与职责

**Windows 保留现有 WSL；Mac 接入开源 Lima 的 VZ Linux 虚拟机；五服务统一在 Linux 内由现有 systemd 管理。发行同一源码、同一配方的 Linux amd64/arm64 服务包。**

Lima 负责 Mac 上 Linux 虚拟机的创建、启动、停止、SSH、磁盘和标准网络配置；systemd 负责原服务的启停、退出回收、失败重启和日志。盾不实现替代它们的跨平台进程管理器。

| 层 | Windows x64 | Apple Silicon Mac | 盾保留的责任 |
| --- | --- | --- | --- |
| Linux 环境 | 已有 WSL2 Ubuntu | Lima VZ + 原生 arm64 Ubuntu | 固定支持版本、Lima YAML、实例标识 |
| 服务生命周期 | Linux systemd | 同一 Linux systemd 单元/启动配方 | 原五服务配置、已有 readiness 与所有权核验 |
| 服务制品 | Linux amd64 包 | Linux arm64 包 | 来源、补丁、依赖与 SHA 清单 |
| 可信 HTTPS | 本机 mkcert/Windows 信任库 | 同一 mkcert/macOS 钥匙串 | 证书名称、保管位置、向 Linux 交付叶证书 |
| 用户入口 | 现有命令入口调用 wsl.exe | 薄入口调用 limactl | 参数校验与状态展示，不承担守护、重连或进程调度 |

这里的跨平台支持方式是**两端运行同一套 Linux 服务**。本期不另做一套 Darwin 原生 HAProxy/CrowdSec 构建，也不把 Mac 指向 Windows 远程服务。

目标体验：

1. Windows 继续使用已有 WSL 环境；Mac 发行安装说明/入口负责引导固定 Lima 与对应 Linux 服务包，无需 B-A-T、BSK 或开发编译器。
2. Mac 首次准备 Linux 实例和本机可信证书；日常启动直接调用 Lima/systemd 的公开命令，不重复装依赖或编译。
3. 入口显示实际就绪状态、可信检测页地址、日志和报告位置；报告仍通过盾自己的页面/API取得。
4. 停止只处理本实例五服务；Mac 独占的盾 VM 可以另行停止。Windows 不使用全局 wsl --shutdown 关闭其他工作。
5. 重启和升级保留数据，卸载程序、删除数据和撤销证书分别处理。

本期验收平台为 **Windows x64/WSL2 + macOS Apple Silicon/arm64**。macOS 版本在接入机器时读取；最低支持版本以固定 Lima 制品及 VZ 实测为准，不从 CPU 型号推定。

## 2. 成熟组件的源码核验与选型边界

### 2.1 Lima：固定候选，不把文档支持冒充项目通过

本轮核到 [Lima v2.2.1](https://github.com/lima-vm/lima/releases/tag/v2.2.1)，2026-10-03 发布；tag 对应 commit **27bc4c4b101e27994e01e36566a0f2091bbca507**，Apache-2.0，官方提供 Darwin-arm64 制品。版本作为本方案候选固定；未下载安装或启动，制品摘要、目标 macOS 可执行性在 P0/P1 验证。

核验的实际公开表面：

- [固定模板](https://github.com/lima-vm/lima/blob/v2.2.1/templates/default.yaml)：VZ/aarch64、带 digest 的 Linux 镜像、provision、网络和静态端口配置。
- [固定 defaults.go](https://github.com/lima-vm/lima/blob/v2.2.1/pkg/limayaml/defaults.go)：fixUpForPlainMode 会禁用 containerd、移除目录挂载和非 static 端口转发。不能启用 plain 后仍依赖默认自动转发。
- [Plain mode](https://lima-vm.io/docs/config/plain/)：仍可用 SSH/limactl shell 与 provisioning。优先采用 plain: true、显式静态 TCP 转发、无容器运行时的配置。
- [VMNet/vzNAT](https://lima-vm.io/docs/config/network/vmnet/)：VZ 可提供宿主可达的 VM 私网地址，不要求另装 socket_vmnet；作为 H3/UDP 直达入口的候选，是否满足盾测量要实测。
- [WSL2 支持说明](https://lima-vm.io/docs/config/vmtype/wsl2/)仍标为 experimental，部分配置不支持。因此不为追求相同宿主命令把现有 Windows WSL 迁到 Lima。

Linux 镜像 URL/digest、内核/systemd、全部 arm64 服务制品尚未冻结。优先与现有 Ubuntu 发行版匹配；若只能选择不同发行版，先记录 ABI/依赖差异再验证，不顺带升级检测组件。

### 2.2 为什么不另加一层管理工具

| 候选 | 能承担什么 | 本次结论 |
| --- | --- | --- |
| Lima + 已有 systemd | Mac Linux 环境 + 现有服务生命周期 | 推荐进入最小实测；复用 Linux 构建与内部回环拓扑 |
| Process Compose | 多进程编排、依赖、健康检查、日志 | [官方实现](https://github.com/F1bonacc1/process-compose)并不提供 Linux 环境；单独使用仍需移植原生库，叠在 systemd 上职责重复，本次不引入 |
| mise | 工具版本、环境变量、任务入口 | [官方实现](https://github.com/jdx/mise)不能替代 Linux 环境或项目补丁构建；本次没有另加工具管理层的必要 |
| Mac 原生服务 + launchd/另一 supervisor | Darwin 原生部署 | 当前构建配方固定 Linux；会扩大到双 OS 库/补丁/生命周期验证，不作为最小方案。不是断言上游源码无法支持 Darwin |
| Docker/Compose | 容器部署 | 已有明确停止决定，见0节；本轮不恢复 |
| 自写 PlatformAdapter/ProcessManager/后台 daemon | 自行覆盖各 OS | 禁止；已有 Lima/WSL/systemd 负责这些通用能力 |

不为减少几个安装命令同时叠加 Ansible、Nix、Process Compose 等新框架。安装和制品分发沿现有 release 能力，Lima 使用官方 provision；需要系统依赖时使用固定 Linux 发行版的包管理器。若后续实证存在未覆盖能力，先补复用评估再决定。

## 3. 当前耦合与最小改造范围

基线：master@94fb77d9c04803ebee608814ee20b09fb545c230。本轮只读调查，未现场核验运行中的服务/PID。盾独立性见 [原结算](SHIELD_INDEPENDENCE_CLOSEOUT_20261010.md)。

| 现有文件（均在 tools/antibot-lab） | 当前事实 | 最小调整 |
| --- | --- | --- |
| paths.ts / lab_paths.py | wsl -d Ubuntu、wslpath；固定 Linux x64 Node 路径 | 服务包内部只使用 Linux 路径；架构制品由清单确定。宿主调用留入口，Linux 内不递归调用 WSL |
| lab.ts | systemctl --user、systemd-run、WSL presence、已有 owner/readiness | 保留 systemd；抽取 Linux 内共同入口。WSL 保活留 Windows 入口；不得在 Mac 复制 WSL presence 或自造 VM 保活 |
| prepare.ts / artifacts.json | x64 压缩包、amd64 deb、WSL 解包 | 按 amd64/arm64 维护固定材料，使用同一 Linux 构建过程 |
| prepare-edge-h2.py | Linux-glibc、x86_64 库目录、HAProxy 3.2.9-1ubuntu2.2 与 H2/H3/ALPN/RTT 补丁 | 依赖架构参数化，保留补丁，分别构建并验证；不在用户首次启动临时编译 |
| prepare-persistent-engine.py / activate-persistent-engine.py | 固定 CrowdSec、SQLite spent 补丁、Go/CGO 与 WSL 外壳 | 保留原源码补丁和持久化语义，Linux 构建/激活复用 systemd |
| prepare-geodata.py 等维护入口 | 有 WSL 调用 | Linux 内使用原维护逻辑；来源、刷新、过期校验保持 |
| settings.ts / edge.ts / h2-online.py | 五服务回环通信；内部 PROXY 信任127.0.0.2；WSL私网地址用于H3 | 保持单 Linux 环境内拓扑；部署配置提供实际可达地址，不重新设计容器寻址或扩大信任 |
| trusted-tls.ts | Windows mkcert1.4.4、LOCALAPPDATA、WSL chmod | 调用 mkcert 官方 Mac arm64 版本与钥匙串能力；Linux 内权限由正常安装配置处理 |
| release.ts / package.json / fixtures | 独立包已存在，部分准备需 PowerShell | 发布 Linux 双架构制品、Lima配置及薄入口；测试准备与用户安装分离，安装不触发维护旧实例 |

必须保留现有五服务：CrowdSec engine、Node origin、Traefik gateway 与原 bouncer、带补丁 HAProxy edge、Python H2。继续共用 shared/ 的固定 wheel，不复制算法或依赖 B-A-T 安装目录。

现有版本以 artifacts/锁文件/补丁回执为准，包括 CrowdSec1.8.1 源码909b5157986a2b2c2163300fdaef5ed01289f7d2、HAProxy3.2.9-1ubuntu2.2、Node24.9.0；Traefik/bouncer、Python包和数据源不得在部署改造中静默换最新版。

## 4. 配置与数据设计

### 4.1 一个 Linux 生命周期

- 五服务仍在同一 Linux 环境中，保留内部 loopback、原代理认证与端口关系。
- systemd 接收原前台命令，承担 restart、停止超时和控制组回收；沿用原单元或将当前 transient 参数固化为同一份配置，禁止再实现任务调度/进程树扫描器。
- 继续原健康检查：origin/engine/AppSec/gateway/edge/H2 和数据源完整性。systemd active 不等于应用 ready，直接读取已有健康端点。
- 共同安装/配置在 Linux 内执行；宿主薄入口只校验参数并转交 wsl.exe 或 limactl，状态必须取自现成管理器和健康端点。
- Lima provisioning 只安装已校验制品、放置配置并调用已有初始化入口；重复执行不得覆盖密钥、清空数据库或创建重复单元。
- 使用官方静态转发和 SSH/copy 能力，不写网络代理、不修改 Lima 内部源码、不新增另一后台 daemon。

### 4.2 两架构发行

- Windows 使用 Linux amd64；Mac 使用 Linux arm64/aarch64 原生制品，不用 x64 模拟结果冒充支持。
- 现有 release 生成独立归档，包含执行所需 Node/Python环境、五服务制品、共享wheel、固定配置和来源清单；构建时处理依赖，普通使用者无需 Go/C/Python 开发工具链。
- HAProxy/SSL/Lua/PCRE 与 CrowdSec CGO/SQLite 在目标架构构建并做最小行为验证。无对应发行制品时使用固定上游源码和原补丁，不丢补丁换成原版。
- 二进制摘要随架构不同，源码和补丁来源一致。build receipt 必须记录架构、依赖、编译配方与输出摘要；运行仍验证实际制品。
- CI/本地构建均不要求 Docker。不同平台的构建结果不能替代宿主浏览器实测。
- 不改既有 SQLite schema；不把可执行路径、制品下载地址和数据目录混为一个变量。

### 4.3 HTTPS 与持久数据

- 复用 [mkcert v1.4.4](https://github.com/FiloSottile/mkcert/blob/v1.4.4/README.md) 的主机信任能力。每台主机独立 CA；首次信任走正常系统授权，日常启动不重复索要。
- 保留 localhost、shield.localhost、*.shield.localhost、127.0.0.1、::1 的现有证书/随机子域语义。H3入口若使用VM私网地址，按现有方式给实际地址签发适用证书；不能把IP改了却跳过主机名验证。
- CA 私钥留宿主专属位置，只有必要叶证书/私钥和公开根证书进入所属 Linux 实例；不要用 Lima 默认家目录挂载暴露整个宿主目录。
- Linux 内数据库放 VM/WSL 自身文件系统。报告使用既有导出或受控copy，不能让两实例共写一份 SQLite。
- 新 Mac 默认新实例、新密钥，不复制 Windows CA 私钥或在线 WAL。迁移历史不是本期前提；以后迁移须用停写/SQLite backup。
- stop/重启/升级不重置 budget、spent、会话与报告。发行包不含活动数据库、密钥、个人浏览器数据或原始敏感报告。
- Tor/Geo/ASN 等数据继续原刷新、摘要和有效期检查，不以跨平台为由忽略失效状态。

## 5. 网络验证必须覆盖的真实问题

Lima 提供虚拟机和网络能力，不自动证明检测行为等价。Windows 当前已对 H3 使用 WSL 私网地址，因为 localhost 转发不承载所需 UDP；Mac 也不能凭“HTTPS页面打开”宣布 H3 正常。

最小网络方案：页面所需本地 TCP 端口使用 Lima 显式静态转发，内部管理端口不无差别发布；H3 使用 VZ/vzNAT 的宿主可达私网地址候选。实际IP通过 Lima/guest公开命令获取，传入已有配置，不能硬编码某次DHCP地址。HAProxy 继续是原TLS终点。

| 验证内容 | 通过条件 |
| --- | --- |
| 页面与随机子域 | 宿主日常浏览器可信HTTPS、secure context、原重定向/会话域名正常 |
| TLS/JA4/ALPN/H2 | 请求到原HAProxy，中途没有新增TLS终止；字段有真实来源且有效 |
| H3/QUIC | 实际宿主浏览器成功走UDP/H3，Alt-Svc与证书正确；不以HTTP/1或H2回退代替 |
| peer IP与RTT | 标明实际观测链路；核对转发/NAT引入的影响，不把VM/代理地址冒充用户公网地址 |
| 内部信任 | 原PROXYv2、bouncer、AppSec认证边界保留；直连/伪造上下文仍拒绝 |
| Worker/IME/事件/报告 | 真实宿主浏览器采集；39项口径与同次服务端报告一致，合法OS差异不要求字节一致 |
| 重启后的地址变化 | 重启VM、重新获取入口地址后仍可检测，不读过期地址或遗留证书 |

特别注意：当前 edge-ssl-rtt.c 使用 OpenSSL SSL_get_handshake_rtt，不是所谓 Linux TCP_INFO 采集。对其平台/网络影响必须按真实字段含义解释，不能凭组件名称造根因。

若候选网络不满足原已支持测量，保留首败并定位具体入口/字段；优先核验 Lima 标准配置，不改阈值、删检测项、自写代理或退回已拒绝 Docker 路线。未覆盖的原基线项与新增部署回归分别记录。

## 6. 实施顺序与关闭条件

### P0：Linux公共入口与Lima最小样本

1. 实核checkout/dirty work、原配置/补丁摘要与资源所有权。读取实际Mac版本，不重问已确认的Apple Silicon。
2. 核现有systemd参数与WSL包装边界，记录可以直接复用的Linux部分；先不停止旧服务。
3. 固定Lima候选、Linux镜像与arm64依赖清单；检查官方制品摘要、许可证和宿主要求。
4. 在所属临时Mac实例/端口验证无Docker/containerd的Lima启动、SSH、systemd和原HAProxy最小TLS/H2/H3样本。
5. 关闭条件：源码复用边界清楚，原协议采集有效，平台新增失败有定位。没有Mac访问时只推进独立的构建/Windows工作，P0 Mac项保持未测，不冻结“已支持”。

### P1：共同Linux发行与最小接线

1. 改现有paths/prepare/release，使Linux内部没有Windows/WSL依赖；保留现有Windows入口的必要转交/保活。
2. 产出同一配方的amd64/arm64独立制品、固定来源/补丁回执、同一systemd配置和Lima YAML。
3. 接mkcert的Mac能力和薄启动入口；现有配置生成、readiness、报告入口继续复用。
4. 关闭条件：干净Linux实例可安装并连续start/status/stop，运行阶段无编译器需求、无B-A-T/BSK依赖；不引入自建supervisor。

### P2：受影响回归与状态持久化

1. 对实际变更运行所属package最小验证：路径/制品选择、证书、配置/探针资产、spent/配额持久化，不跑根级全量测试。
2. 验证重复启动、缺制品/摘要不符、数据过期、端口冲突、服务异常退出/重启、VM重启和停止；失败不能清空数据。
3. Windows同版受影响路径做回归，新实例验证后再按明确归属切换；不升级WSL发行版、不覆盖原数据库。
4. 关闭条件：业务输出、服务生命周期和清理分别有证据，spent重启后拒绝重放、配额和报告保留。

### P3：冻结后双平台实际验收

1. 冻结代码、配置、来源清单和制品。Windows及真实Apple Silicon Mac分别从独立包运行，另一台电脑/B-A-T不在线也能工作。
2. 实际完成原检测页中英文交互与最终报告获取，核第5节全部受影响项；正常/异常控制按原规则判断，不预设一律Human。
3. 验证停止再启动、宿主重启、报告和状态保留；记录首次失败。若修复，原失败保留，重新冻结受影响版本后验证，不混称第一次通过。
4. 关闭条件：双机实际矩阵、版本/制品摘要、安装/日志/报告/备份回退说明齐全；Mac未实测就明确保留未测。

## 7. Product Alignment 与 Reuse Assessment

~~~text
Product Alignment:
- natural-language task: 用户在Windows或Mac本机打开盾页面、完成原检测并读取最终报告。
- reusable chain boundary: 独立盾部署；不改变B-A-T任务编译与复跑。
- runtime inputs: 平台架构、固定发行包、实例配置、浏览器请求、实例数据。
- dynamic task outputs: 原报告、检测有效性、挑战与限流结果。
- generic platform capability used: Lima/WSL的Linux环境、现有systemd、mkcert。
- replay model calls: 0；部署不引入模型。
- site/task-specific code added: no new detector special cases
~~~

~~~text
Reuse Assessment:
- capability: 双宿主独立运行现有Linux服务，成熟组件承担虚拟机与服务生命周期。
- existing implementation in repository: 独立盾包、systemd五服务、固定制品、配置生成、readiness、release、共享wheel。
- mature candidates and pinned versions: Lima2.2.1/27bc4c4b101e27994e01e36566a0f2091bbca507；mkcert1.4.4；现有检测组件固定版本。Linux镜像/systemd包/arm64制品待P0实核固定。
- selected implementation: Windows保留WSL；Mac Lima VZ Linux arm64；内部共用systemd。选型方向明确，真实样本未完成前不冻结为已验证。
- reused public surface: limactl与YAML/provision/static forwards/vzNAT、wsl.exe、systemctl/systemd-run/journalctl、mkcert。
- B-A-T-owned adapter and remaining gap: 实为盾独立部署配置、制品清单、Linux入口及薄宿主转交；补齐arm64构建和证书/网络接线。
- license/runtime/platform fit: Lima Apache-2.0，mkcert BSD-3-Clause，systemd沿发行版现成包；保留各组件NOTICE/许可证。Mac宿主要求及实际行为待验。
- browser/runtime/state ownership conflicts: 浏览器留宿主，VM/服务/磁盘明确归属；Windows原实例不受接管；两机不共写数据库，不分发CA私钥。
- replay model calls: 0。
- rejected candidates and evidence: Docker因既有明确停止决定；Lima Windows后端实验性；Process Compose/mise不提供Linux运行环境；原生Darwin扩大编译与生命周期范围。
- focused validation: P0原TLS/H2/H3真实样本，P1安装制品，P2状态/错误路径，P3冻结后双机完整检测与报告。
~~~

## 8. 交付与临时资源边界

- 交付对应架构独立服务包、Lima固定配置、两端安装/启停入口、一次性信任说明、日志/报告路径、更新与数据备份回退说明。
- 本次不改检测算法/阈值/评分，不改B-A-T主流程，不处理其他Chrome扩展，不访问京东，不上公网。
- 创建与清理先读 [工具策略拒绝复盘](TOOL_POLICY_INCIDENT_20261007.md)。记录临时VM名称/磁盘、服务unit、数据绝对路径与归属；复用官方管理器清理。
- 临时服务停止、VM停止、实例/磁盘永久删除分别记录；不得对用户现有WSL发行版、个人浏览器、其他Lima实例执行全局清理。保留的正式实例数据不算待删除垃圾。
- 本轮只读研究与文档修订：未安装Lima/证书、未下载运行制品、未创建或启停VM/盾/浏览器、未改数据库、未运行产品测试、未提交/推送/worktree/关机。
- 默认后续顺序仍为B-A-T A0→A3单独结算，再盾P0→P3；若新session明确只做盾，执行本文即可，不扩B-A-T任务。
