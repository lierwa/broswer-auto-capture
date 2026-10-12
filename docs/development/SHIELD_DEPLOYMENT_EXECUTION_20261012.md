# 盾双平台部署执行记录

本次遵循 SHIELD_WINDOWS_MAC_DEPLOYMENT_PLAN_20261012.md。Linux x64候选包已冻结并完成当前Windows定点验收，尚未双平台验收；Mac SSH 在 banner 前关闭，最终产品纠正验收后再次只读连接仍被192.168.101.14:22关闭，P0 Mac 实测待连接恢复。用户授权全部任务完成后提交、推送；当前尚未满足。最新用户明确要求完成后也不关机，旧关机授权撤销。

## P0 入场事实

Windows 当前 WSL Ubuntu 26.04 LTS / x86_64 / systemd 259.5。既有五服务 active，WorkingDirectory 均为 `/mnt/d/work/browser-auto-tool/work/antibot-service`；此处为入场时快照，后续所属临时部署与恢复见下方执行记录。宿主实际 checkout/已有改动见 BSK_REMOVAL_EXECUTION_20261012.md。

Product Alignment:
- natural-language task: 用户在各自主机打开盾页面完成检测并获取同次最终报告。
- reusable chain boundary: 独立盾部署，不改任务链和检测语义。
- runtime inputs: 固定 Linux 制品、实例路径、宿主可信证书与实际网络地址。
- dynamic task outputs: 原检测报告与服务生命周期事实。
- generic platform capability used: WSL/Lima、systemd、mkcert、发行版包管理器。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 同一 Linux 服务在 Windows/WSL 与 Mac/Lima 运行。
- existing implementation in repository: paths/lab/prepare/release、五个 systemd 用户单元、原证书/配置/就绪检查及补丁。
- mature candidates and pinned versions: Lima 2.2.1（27bc4c4b101e27994e01e36566a0f2091bbca507）、mkcert 1.4.4、Ubuntu 26.04、原 Node24.9.0/CrowdSec1.8.1/Traefik3.7.14/HAProxy3.2.9-1ubuntu2.2。
- selected implementation: Linux 内直接调用现有 systemd；Windows 保留 WSL 转交和 presence；Mac 使用 Lima 官方 shell/copy/VZ/plain/static forwards/vzNAT。
- reused public surface: execFile 参数数组、wsl.exe、limactl、systemctl/systemd-run、mkcert；无自建守护器/代理。
- B-A-T-owned adapter and remaining gap: 盾自身的路径与架构制品选择、安装配方和发布清单；Mac 原生构建及宿主采集仍须实际验证。
- license/runtime/platform fit: 继承原 NOTICE；Lima Apache-2.0、mkcert BSD-3-Clause。最低 macOS 仍待目标机读取核验。
- browser/runtime/state ownership conflicts: 不移动旧数据、不复制 CA 私钥、不认领其他 VM，不全局关闭 WSL。
- replay model calls: 0。
- rejected candidates and evidence: Docker 明确禁止；叠加 Process Compose 与现有 systemd 重复；自写平台管理器超出部署职责。
- focused validation: Linux/WSL 路径和制品边界、真实构建、独立安装、状态持久化、冻结后两宿主报告及 TLS/H2/H3/RTT。

## 实施断点

开始共同 Linux 入口与固定 arm64 材料核验。检测器、阈值、原源码补丁均保持；类型检查的三个历史错误只作等价类型声明修复。暂无 Mac 制品或双平台通过结论。

P1 断点：Linux 内直接 status 已真实读取原五服务 ready，API 和盾类型检查通过。首个 amd64 runtime 归档为 `930a7824c90f141ef09b869b29190a41c4d0e2026a5aa5060556afde3a569291`（尚未最终冻结），57 项公共制品文件；首次 runtime-release 类型检查有联合类型收窄遗漏，已按属性存在性修复。Mac 薄入口/YAML已实现，未实测；静态转发明确 static，VZ 专用 shieldvz 接口，不挂载宿主家目录。

下一步将按现有 owner 关闭原五服务，在 Linux 本地独立目录安装/验证新包，随后按原数据/源码归属恢复旧服务。原数据库只校验摘要，不拷贝在线 WAL 或私钥；原 CA 信任不变。停止/恢复与新实例资源分别记录，不能在中途关机。

首次新包已安装到 `/home/unclehorse/bat-shield-validation-20261012`；原五服务按 owner 停止。Windows 本机 mkcert 复用既有宿主 CA，仅新叶证书/叶密钥与公开根进入新目录。首次启动 ready 后，下次检查五服务全部 inactive：直接调用 Linux 入口未保留 Windows 的 WSL presence，发行版空闲退出。根因属宿主接线遗漏；提取原 presence 原样逻辑供 Windows 薄入口和原入口共用，Linux/Mac不创建保活器。首败保留，尚未把第一次 ready 结算为稳定运行。

原实例已按原 owner 恢复，五服务 ready；停止前原数据摘要在 original-stopped-hashes.json。新 Linux 安装目录当前保留但未运行，待 Windows presence 薄入口复验。30 项原报告/IME/TLS 定点回归通过（其中cadence仅新增TS非空断言，check-model仅声明文件，运行判据字节未改）。Mac未测。

随后 Windows 薄入口复验：独立实例持续 ready，12 项 HTTP 控制通过；两个独立 Python 进程证明配额持久拒绝。真实挑战已消费票据在 engine 重启前后均拒绝，warm cookie 返回 200；原票据/cookie 不落盘，所属 Chrome/runner 关闭且 Profile 永久删除。systemd SIGKILL origin 后自动重启，13 个 case 和 41 条事件保留；重复启动五项 PID 不变。证据位于 work/shield-deployment-20261012 的 http-controls、lifecycle-proof、original-data-protection 和 windows-evidence/reports/replay-restart-cwhbbjl2。原 secrets/crowdsec/business/budget/challenge-spent 五份摘要均一致。新实例已停止，原实例重新 ready。

以上验证的是首个候选包，后续增加的制品 ELF/启动摘要检查、宿主证书入口和 Mac staging finally 收尾尚未随最终包实跑；不得把候选包证据算作最终冻结验收。Mac 仍未连接，arm64 构建、两端冻结最终报告、VM 重启及网络采集矩阵未完成。Linux 临时安装和 Windows 公共包 stage/临时叶证书尚待最后清理。

最新 amd64 候选包 SHA256 为 34f1bf9e1cab7d1b72d5baf8d59f77d14fb7a4ed49e46f7a01b1987236e668a6。安装目标 `/home/unclehorse/bat-shield-final-validation-20261012`；首次原实例仍 active，原 initialize 保护明确拒绝 stop_lab_before_preparing。按原归属停止原实例后，重试同一包安装成功。Windows 新 trust-localhost 入口实际通过，复用原宿主 CA，临时证书 stage 在 finally 永久删除；随后新实例五服务 ready。原实例此刻暂停，最终任务验收后须恢复；旧新验证目录均为本次所属，不是交付数据。

最终候选重复安装返回alreadyInstalled且运行制品摘要通过；已安装Linux三项位置/geodata验证、30项原报告/IME/TLS回归、两项部署边界与ELF负例、盾类型检查通过。检测源码/补丁/阈值保持。

Windows网络实测：final-network-dg350exo首次夹具误用证书不覆盖的uuid.localhost，ERR_CERT_COMMON_NAME_INVALID；改用已覆盖uuid.shield.localhost，未关闭证书验证。final-network-xo76e_u_中原生Chrome H2 case57c37682和H3 case15dff517分别产生三条TLS记录，JA4/ALPN、H2一致性、H3 SETTINGS/QUIC参数/shape均有效且无协议不一致告警。H2首跳TCP40us/TLS5715us；H3直连QUIC2000us，TLS RTT如实不可用。网络样本未执行行为交互，其telemetry-invalid/browser-marker/input-behavior不可用告警仍保留，不能冒称完整Human。两个浏览器均finally关闭，Profile永久删除。

紧接H2异常控制首次因旧夹具只信任叶证书而失败；最小修复apps/api/tests/antibot_h2_cases.py优先使用公开rootCA.pem，兼容旧自签cert.pem。仅重跑该控制，final-network-fkeg7dcc证明正常H2一致、MPAS异常case触发实际CrowdSec，2项通过，模型0；该目录明确仅controls，不冒称重复跑了原生H2/H3。最终包P2剩余HTTP/端口/VM重启及P3宿主重启未完成；Mac SSH仍认证前关闭且已知Tailscale Mac离线，arm64/Lima实际验收未测。


### 最终包 Windows 独立控制补验

最终包34f1bf9e：12项HTTP控制全部通过（verified-http-UjzqAq）。final-lifecycle.json证明重复启动PID不变、origin SIGKILL后systemd自动恢复、过期来源拒绝、缺失h2制品拒绝、外来端口owner拒绝；fixture全部复原，五服务再次ready且Windows WSL presence恢复。停止前后31 cases / 782 events及完整内容摘要一致。端口冲突时未终止外来fixture，而由测试自己的finally关闭。仍非Mac/Lima/宿主重启证明。

最终包budget-http-tnosghp9：64实际HTTP请求，主来源60允许、2拒绝；重启origin后配额仍保留，独立IP与另一case不受影响，CrowdSec原生告警存在，模型0。该验证直接覆盖来源准入，明确gateway未参与、没有等待真实长窗口或加白名单，不代替完整网关会话验收。

最终包nonce跨引擎重启：replay-restart-sh2s42va真实Chrome完成原HTTP挑战，同一已用ticket在重启前、重启后和第二次重放均返回protocolStatus=failed且不发cookie；原warm cookie请求200无挑战。原始ticket/cookie只在内存，未持久化。模型0，窗口cleanup confirmed且Profile永久删除。仍不等价于VM或宿主重启验收。


### 临时发布/证书与首个Linux实例退场

两个public package stage、旧930a7824候选tgz（458797849字节）和host-tls暂存均核对owner/摘要/绝对路径后永久删除；最终34f1bf9e包保留，个人mkcert CA目录未删除。首个Linux实例退场脚本第一次在删除前因误将安装manifest SHA与整个tgz SHA比较而停止（retire-first-candidate.log）。核对install-linux.py确认releaseSha256指runtime-release.json；改为核验该文件实算摘要、install-owner、installed三者后，确认无systemd/进程占用，永久删除旧prefix。其13 cases/41 events、原reports及owner已归档到retired-first-candidate-evidence；没有归档secret或私钥。当前最终实例继续服务本轮新任务，原实例仍待恢复。

原实例恢复前第一项摘要检查用错时间基线：19:30主文件快照之后，原实例在19:43:51至19:51:59真实恢复运行（systemd journal已归档），因此不能要求后来engine库仍字节不变。当前secret、business、budget、spent四个主文件SHA仍一致，crowdsec.db不同；只读quick_check=ok，bouncer last_pull=19:44:07、machine last_heartbeat=19:51:06，均落在原实例实际运行区间。未覆盖或回滚原文件。没有旧engine SQLite内容副本，不能宣称已逐行解释所有差异；旧主文件SHA也不证明在线WAL不变。首次检查失败及校正说明保留在original-old-snapshot-mismatch/original-snapshot-explanation.json。

### 最终任务报告与资源结算

x64最终包下，冻结新任务完整需求→代表准备→样本→变化输入独立复验→UI发布V1→两次同版正式运行已完成。每次取得39项完整最终报告，名称/结果与同次服务端一致，普通模型0；正式报告均Bot/38 clear/1 WebDriver flagged，引擎验证未完成，如实交付而非判为Human。详见BSK执行记录和final-detection-report.txt。

最终Linux验收实例已停止，原五服务与WSL presence已按原数据目录恢复且ready。核验install-owner/runtime-release/installed摘要、systemd归属及/proc工作目录后，原生SQLite backup归档其49 cases/1579 events，归档前后逻辑摘要一致；报告/公共安装回执保留，未复制secrets或私钥。随后永久删除`/home/unclehorse/bat-shield-final-validation-20261012`。旧候选目录此前已永久删除。两个网络诊断access-state补清；所有验收Chrome/Profile均关闭/永久删除。最终公共tgz34f1bf9e保留为交付候选，不是临时stage。

正常工作台最终PID23656、六张原历史表摘要一致、个人Chrome未关闭；原盾五服务ready，原CA与历史数据保留。没有全局关闭共享WSL，未关闭未知归属的既有shell。恢复后engine正常心跳可继续更新其库，不能用旧主文件SHA要求其不写入。

Mac收尾只读复核仍Connection closed by 192.168.101.14 port 22，未执行uname/sw_vers。Lima配置与薄入口、arm64材料清单仅是实现候选；原生arm64构建、实际Mac安装/TLS/H2/H3/交互报告、VM及宿主重启验收仍未完成。不能宣布双平台支持已验收，也不能触发用户附条件授权的提交、推送、远程核对或最终关机。待可连接Apple Silicon Mac后继续P0/P1/P2/P3；后续代码变化须重新冻结并按最终交付要求验证，不覆盖本次首次失败。
