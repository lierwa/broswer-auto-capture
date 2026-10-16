# Mac 当地安装与实际验收记录

后续更新：VM管理问题已按用户授权修复，恢复原创建模板3行后status exit0、五服务ready，Lima validate及6项宿主测试通过。未重启VM/Mac、未改owner记录。下方该问题未关闭的描述保留历史时点；当前见[最新执行记录](MAC_VM_AND_PUBLIC_NATIVE_TEST_20261012.md)。

## 最新结算与发布口径

导航授权根因已修复，保留原localhost入口的新任务完整验收见[导航修复记录](NAVIGATION_SCOPE_REPAIR_20261012.md)，下方改用check入口的成功属于历史绕行证据。按用户最新指令，旧六次模型失败以“当前正常、未复现”关闭，不再作为活动待办；旧错误及未取得底层cause的事实保留。发布前只读mac-host status仍返回lima_instance_owner_changed / exit1，故该本机维护项保留；当前运行盾及产品主流程正常。用户已授权提交推送当前全部B-A-T代码；本记录下方“不推送/未提交”均为当时边界，不覆盖最新授权。

本记录对应 `MAC_INSTALL_VALIDATION_20261012.md` 的实际执行。基线 `master@a1b28cd0903d1cbff1c03e2534619a7d6117c5fa`，用户已授权拉取并执行安装验收；不创建 Git 分支/worktree、不推送、不访问京东、不使用 Docker、不执行历史关机指令。检测规则与阈值保持原样。

## 当前结论：Mac 正常产品主流程通过

2026-10-12 19:24（Asia/Shanghai）完成正常工作台链路：需求 v3→代表探索→样本试跑→不同输入独立复验→UI 发布 V1→同一发布版本两次正式运行。产品任务 f9cf7406-61c8-4f29-bb35-74ec1978459c，prepare f13d95c5-f2ad-4579-8205-ca3152e0f198。辅助 IAB 只操作工作台；盾页面始终由 B-A-T 原有日常 Chrome 路径控制。

| 阶段 | execution | 本次盾 case | 结果 |
| --- | --- | --- | --- |
| 样本 | 18344fbd-5838-46a0-82fe-46c7b061e037 | b9564756-5573-475c-96b6-155ddfcb585e | Human，39 clear |
| 独立复验 | 9187a297-148b-4096-8abd-5b651adec79c | c5fd91f1-7bca-47e2-9788-2cc10cea5e34 | Human，39 clear |
| 正式一 | d4d0c4fd-ca64-4789-85cc-57f8402f0f41 | e8d9e4f0-69ff-4162-9160-b44c5cb6fe0a | Human，39 clear |
| 正式二 | eba52b6f-6487-4d73-87ee-9e4005545f72 | 44f9c02f-1754-4a99-97f0-b979277d8930 | Human，39 clear |

四次均完成：39 项名称/状态/依据与各自服务端原报告精确一致，结论一致；CrowdSec score 0、challenge/protectedRequest accepted、allowlisted=false。普通运行模型调用 0、modelCalls=[]、auditComplete=true；首次清理 confirmed，runner/browser/child_exit 各阶段确认，四个同 owner lease ended。报告以正常可信 HTTPS GET 读取，未跳过证书验证，未为读取报告重开检测页。

两次正式运行固定 release a72c902c-c417-4b83-81d2-c597d345b167 / V1 / 441fcfb1dfe9d50938c95ecc67fa03cfa2ae6ae28029deeccb397966981cc7f9。第一次使用原默认英文和中文，第二次使用英文 `the sky is bright and clear today.`、中文 `今天阳光明媚，我们一起出去散步。`。独立复验也采用这组变化输入；按用户独立完成验收的授权由执行方选取测试文本，没有额外等待用户填写。链中两处 input.text 分别绑定运行输入字段，target_value 后置检查保留；实际盾报告英文/中文计数随输入变化。四个报告均为各次新生成，未复用旧 case。

### 已处理的问题与改动范围

1. Python 环境漏装 diskcache、pyrate-limiter、filelock、patchright、bat-request-budget，导致执行器导入失败。经仓库原 upstream:setup 安装并通过原检查。
2. opencode-dev 原 HEAD82f28e6d 落后同名远端分支两个提交，已快进到 881d5958c750eb4898c170b94218a3ddd3497c95，保留原用户改动；重叠测试按原本地等价行为恢复。24 项相关检查通过，producer 源码仍为 dirty，不能描述为纯净远端构建。原 ai-connect:stage/sync 成功，B-A-T 消费 core 0.3.4-86075794、React 0.3.2-cc7d94fe、Pi AgentSession 0.1.0-5921e108，Pi 依赖为 1.0.2。首次旧源码 0.3.2 同步的 npm404 保留；其无引用临时制品已删除。
3. 任务来源再次遗漏已知配置。10 月 11 日已有使用 check.shield.localhost 的解决记录，本次 Mac 初始任务重新使用 localhost，正文允许子域并未更新结构化边界。通过正常需求修订确认 v3，入口改为 `https://check.shield.localhost:4185/measurement/check?mode=interactive`，授权来源随之为 shield.localhost。原通用派发/落地 URL 契约修复已在 HEAD 中，没有再次改代码或放宽安全范围。

探索阶段两次 bat_read_fields 参数未符合输出 schema，第三次原生纠正成功；失败动作未进入正式成功链。旧六次 ai_generation_failed 的底层 cause 已被原包装丢弃，仍保留未唯一归因；不能把包更新后的成功当作旧失败根因已证实。

更新包后重新冻结的 1228 份源码/配置在全部产品验证期间未变。API 类型检查和 UI 构建通过；桥接 2 项 TS、2 项实际 Python 检查通过，另一个旧测试 author_step 替身缺 human_wait 参数，测试失败单列，没有改生产源码迎合。用户要求撤销的三处安装源码和临时测试/脚本未重新添加；没有修改产品输入节奏、导航保护、盾规则/阈值，没有提交/推送/创建分支/worktree。

### 仍未关闭的安装维护项

安装期间生成的 VM owner 配置摘要与后来恢复的仓库模板摘要不一致，mac-host 管理命令仍会报 lima_instance_owner_changed；当前五服务和上述产品流程运行正常。未修改 owner 记录绕过，不把主流程通过表述为此维护问题已修复。宿主重启未执行，用户当前明确禁止自动重启或关机。首次依赖失败的 cleanup unconfirmed 保留原结论，不被四次新清理成功覆盖。

最终工作台 API PID38647、checkout 正确；日常 Chrome Default 保存授权正常、connected=true、busy=false。ignored 证据目录 `work/mac-install-validation-20261012/` 中的 `mac-product-mainflow-final-proof.json`、`final-execution-cleanup-audits.json`、`latest-packages-receipt.json`、四份 `shield-report-*.json` 和 `mac-product-final-verdict.png` 保存本次结果。下方不通过/未完成结论均为原始阶段记录，保留用于追溯。

## 用户纠正后的历史结论

**Mac的B-A-T产品验收未完成。** 下文是安装过程证据，不能替代正常产品任务链路。原31803ab6报告的输入由桌面工具快速按键生成，跳过了B-A-T内置随机节奏；冻结原检测器对留存事件精确重现两项红灯。它既不能证明Mac产品输入有缺陷，也不能作为B-A-T输入通过的证据。原失败记录继续保留。

按用户要求，本轮3个安装源码文件已恢复到上述HEAD并逐字核对；2个新增测试、14个临时脚本/源码副本已永久删除（包括重启与恢复脚本）。回执：work/mac-install-validation-20261012/session-code-removal.json。正式安装、数据、证书与授权保留。当前无产品/安装源码差异，仅有本文及PROGRESS记录。已安装VM归属记录仍对应安装时模板，当前恢复模板的SHA不同，mac-host管理入口会拒绝；不改归属绕过，当前盾仍运行。

正式路线要求正常工作台的新需求、prepare、样本与独立验证、发布和两次同版本正式运行，第二次改变输入；验证完整39项报告、输入绑定、零隐式模型调用与所属资源清理。**不得整机重启或关机。** 下文“仅剩宿主重启”“一键文件已准备”“保留安装修复”等过程状态已过时，以本节及后续产品证据为准。

### 最初两次正式产品准备结果：不通过（历史）

- 新任务f9cf7406-61c8-4f29-bb35-74ec1978459c，经真实工作台需求对话确认v2，保持daily revision2/Default。辅助IAB仅操作工作台，任务浏览器由B-A-T创建；冻结1228个源码/配置文件，全程无变化。
- 首次prepare f13e06d3-ebc5-4d0c-8c45-3cd91e0da934：upstream_runner_closed，动作0、探索模型调用0。执行器只读导入检查明确缺diskcache；现有Python环境缺diskcache/pyrate-limiter/filelock/patchright/bat-request-budget。依README执行原npm run upstream:setup，复用原managed Python环境；原--check及canonical import/assert_runtime通过，无源码修改。
- 依赖恢复后prepare 1e7bf588-94f0-40dc-89a3-d2a20136fd40：浏览器reserve、sdk_connect、task_target_prepare、task_target_focus均成功。6次原内置探索模型调用全部ai_generation_failed，动作0、页面保持about:blank，终态hybrid_completed_source_required。没有形成可发布链路，没有普通执行，没有新的39项报告。
- 具体模型失败原因未确定。固定AI Connect包的generation.js丢弃底层异常cause，仅保留统一错误码；不能据此断言Mac、账号、额度、模型或网络根因。无凭据Node/curl HEAD均返回403，只证明HTTP可达，不是模型调用成功证据。不修改库、不换模型、不无变化重试。
- 第二次owner/lease 24b99221-d4c7-4a3d-8371-3c7240168406状态ended，原清理审计confirmed/activeResources=false；第一次导入失败的cleanup unconfirmed仍保留。正常工作台和盾保持运行，模型设置、Chrome授权摘要保持；AI账号令牌由既有OAuth正常刷新，审计credential_refreshed/succeeded，不把该文件误报为字节不变。
- 未测完：完整39项、输入值和动态报告匹配、草稿样本与独立复验、发布、同版两次变化参数复跑、普通运行模型0及各自清理。

证据：ignored目录中的product-first-failure-summary.json、product-runner-import-check.json、product-upstream-setup.log、product-runtime-restored.json、两份product-job记录、product-second-run-cleanup.json、product-final-proof.json与product-workbench-failure.png。原两次盾控制报告继续保留，不能用它们补齐本次产品验收。

### 后续定位：模型调用成功，当前卡在导航范围

- 文本JSON、有效PNG、加载工作台相同模块并走现有openModelBridge三类对照成功，账号/模型仍为原保存选择。无效1x1夹具被供应商明确拒绝只是诊断对照，不是原六次失败根因。
- 根据新成功证据，从真实工作台独立prepare 6026bb17-360c-48e6-8fa1-9eba7b3d26e7。探索模型1次completed，第一个navigate目标为原localhost入口，之后hybrid_navigation_outside_authorized_scope。旧六次ai_generation_failed仍保留，不能把后续成功解释为已查明旧根因。
- 当前任务结构化entryUrls只有https://localhost:4185；转换出的站点includeSubdomains=false。需求文字允许*.shield.localhost:4185，但该范围没有传入执行器。盾check.js会申请session并跳转随机*.shield.localhost:4185；现有B-A-T和原生B-U函数均复现入口允许、子域拒绝。原始拒绝事件未保存目标URL；配置缺口有独立源码及函数行为证据，不伪造原日志。
- 新owner/lease 512d577c-2465-4f0f-80a8-24ac03aa1968已ended；清理confirmed/activeResources=false。IAB辅助工作台页已关闭。仍无完整39项、发布或两次正式运行，不修改范围保护以求过测。
- B-A-T固定AI Connect核心制品为0.3.4-1464cd24；本机配置指向的opencode-dev源码与现存release为0.3.2。两者不是实时源码链接，未盲目同步降版。安装VM配置摘要冲突尚在；当前服务正常运行。无源码变更、整机重启或关机。

新增证据：model-minimal-repro.json、model-image-repro.json、model-valid-image-repro.json、model-production-bridge-repro.json、product-job-6026bb17-360c-48e6-8fa1-9eba7b3d26e7.json、product-third-artifact.json、navigation-scope-repro.json与product-third-scope-failure.png，均在原ignored验收目录。

## 当地基线

- Apple M1 Pro，macOS 26.5.1/25F80，原生 Node 24.12.0/arm64、npm 11.6.2。Lima 实际信息为 hostArch=aarch64；系统另有 Rosetta Python，不能拿它的 `platform.machine()` 当物理 Mac 架构。
- 本地工作区入场干净，HEAD 与 origin/master 为同一完整 SHA，ahead/behind 0/0。
- B-A-T 旧任务库保持空，模型设置与日常 Chrome 授权原摘要保护。新版工作台已启动，接口确认任务 0、日常 Chrome paired/connected/idle。
- 盾独立依赖按锁安装；Lima 2.2.1 官方归档摘要 `9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e` 实核一致。

## 首次失败与必要修复

首次 `mac-host.ts setup` 在真实 Lima create 的配置校验失败。宿主传入 `internal_batShieldOwner`，模板没有消费它；固定上游 [validateParamIsUsed](https://github.com/lima-vm/lima/blob/v2.2.1/pkg/limayaml/validate.go) 明确拒绝。此时没有 VM 或实例目录。

修复限原模板：默认声明空标记，原 provision 在执行前核验宿主注入值非空；实际 VM 的归属仍由既有 Lima 参数、目录、配置 SHA 和目录身份核验，没有另建 VM 管理器。新增实际固定 CLI 回归，修前同错、修后通过；原 6 项宿主回归和盾包类型检查通过。该测试只 validate，不创建 VM，保护真实参数校验边界。

本次 pending owner 的恢复先核对固定归档、原记录、LIMA_HOME、实例列表及目录不存在，才更新已修模板摘要，原 token 保留；没有删除 owner 或接管同名 VM。之后实际 `bat-shield` 已创建并绑定原身份，aarch64/VZ/4 CPU/6 GiB/40 GiB。镜像下载两次 `unexpected EOF`，VM 仍 Stopped；当前按同一官方 URL/原 SHA 续传，完整校验前不加载缓存。断流根因未唯一确定。

源码发布首次缺少未入 Git 的公共 wheel。原固定源码/build 1.2.2.post1/Hatchling 1.27.0 的重建又报摘要变化。已逐项核对五个 wheel payload；仅将 ZIP 中央目录的创建平台字段恢复为原 Windows 字段后，整个 wheel SHA 精确还原为 `cfc34413d49556d19891b1992252958081768957ce5decf6ef86464ac65a40ca`。共享源码、版本、依赖及 manifest 均未改，不放宽原摘要门。CRLF 猜测复现不匹配的过程也保留，不能写成原因。

独立源码归档已生成，148 个明确选择文件，SHA `8c030a28ca87d7959faa775dd74887489d4e76db735fab2f96fa97f9121f4ac6`；不含运行数据、CA、密钥、数据库、node_modules 或宿主 stage。所属宿主 stage 和字节复现目录均已记录 owner，后续按精确路径永久收尾。

## 当前结论与下一步

固定镜像 945530880 字节已核原 SHA `63a93bd5a8d76e33b15ceb5daa3657bd79be804748051ab178e643b0f5da22e7`；通过原 Lima 缓存加载、转换并启动 VZ。缓存首次加载存在本轮调度错误：setup 早于异步缓存提交，再次走下载后失败；等提交和失败退出后按正确顺序启动成功，该失败单独保留。

实际客体为 Ubuntu 26.04.1 LTS/aarch64，systemd 259（259.5-0ubuntu3.4），shieldvz 私网地址 192.168.64.2。未安装状态 stop-vm、重复 stop-vm、同 owner setup 恢复均实际通过；此时没有盾数据库，不能算最终数据保留或宿主重启。平台观测辅助首次误调用不在 PATH 中的 `systemd`，改用已有 `systemctl --version` 取得实际版本；这不是 systemd 服务缺失。

源码已按原归档 SHA 复制至新的所属 Linux 构建目录。当前安装文档列出的构建工具，之后按原 `build-linux.sh` 生成原生 arm64 包；构建与安装 stage 的归属和精确路径均在当地 receipt 中。安装仍未完成；归档和原生 ELF 验证、同包重复安装、Mac 本机信任及后续实际验收尚待继续。

构建首败在 `lab prepare` 的材料并发下载，原 stderr 为 `terminated`；31 项中 30 项文件全部符合原 SHA，仅 Traefik 归档未写入。固定 URL 的 curl 代理路径传输很慢并超时；同 URL 直连断点续传完成，43.4 MiB 文件满足原 `e5a2d062` SHA。未改变公共材料清单或下载版本，恢复同一 build/data。

第一次恢复在 Go 冷构建出现 `spawnSync go ETIMEDOUT`；现场 H2 二进制已生成、原生 CrowdSec receipt 未生成，原维护桥的统一 120 秒不足以完成冷原生编译。最小改动是复用同一 execFileSync 的 timeout 选项，Go 编译明确使用 900000ms，所有维护/启停调用默认仍为 120000ms；新增协议边界回归修前失败、修后及类型检查通过。没有修改编译源码、检测规则/阈值或任何材料摘要。保留原失败，当前从相同原配方失败点继续；本次 guest 源码覆盖文件及 SHA 单列记录，最终发行包按实际当前源码重新生成。

固定 mkcert 1.4.4/arm64 摘要已核，Mac 本机 CA 和待签叶证书已生成，CA 私钥未复制到 VM。系统信任安装首次因 sudo 要求交互管理员密码失败；目前未声称系统信任已安装，已请求用户在远程终端完成这一次输入，其余构建继续。公开 CA 指纹为 `AC:B1:A6:89:C8:58:7B:21:E8:AB:01:03:4D:A2:0A:C7:AD:66:08:D6:D9:F7:77:BF:B6:5F:4C:1D:51:87:CF:59`。此为 macOS 实际权限要求，不是工具策略或自动审批 reviewer 拒绝。

恢复02已完成原生 CrowdSec、持久化引擎和 HAProxy 构建；随后锁定的探针构建依赖 `npm ci` 报 ECONNRESET/network aborted，exit1。首败保留在 native-resume02 日志；恢复03仅从该 npm 步骤继续原配方，没有重编译或放宽摘要。用户已回复可以远程输入；工具明确禁止控制 Terminal 应用，已把固定 mkcert 的正常安装命令交给用户在远程终端输入，不尝试替代 UI 技术绕过限制。

## 原生包、安装与本机检测

原生构建已完成，归档 SHA `0c77990ac2b6a4293c9ab2f21f9daed9684b9386960d973dd35f7dd12a9bc1cf`，496174584 字节。59 项 manifest 文件全部逐字核对 SHA，7 个可执行文件均为 ELF64/little endian/AArch64（e_machine=183）；源码归档 SHA `5610e85a90de668dd2403caf9a6b49f604494bda696c5ffd4800bdccb04ffeca`。不含运行数据或宿主 CA。GeoIP 下载首败 curl56/TLS EOF 保留，改用同一官方当月 URL 下载候选后仍由原 MMDB 元数据/期限/原生校验器验证；Tor 原入口已取得有效的原始公开来源，未改门或规则。

新安装与同包重复安装均 exit0，后者明确 alreadyInstalled；两个唯一安装 stage 已由原 finally 永久删除。用户通过本轮 `.command` 一键文件在正常 sudo 提示输入密码，回执 exit0/passwordSaved=false，系统 security verify-cert 通过。原 trust-localhost 为实际 shieldvz IP 192.168.64.2 签发并只复制叶证书/叶私钥/公开根/receipt 到 VM。五服务首次 start/status、重复 start/status 均 ready，5 个 InvocationID 前后一致，所有 WorkingDirectory 属于正式 Linux 数据目录，当前 PID 26791/26800/26807/26821/26826。

首次真实浏览器工具入口报告 `75661d6b-87d7-4739-981b-ffd908b9060c`：34 项环境正常，但原引擎明确 automation=true/is_bot=true/signals=[cdp]，score100 拒绝；完成中英文、滚动和提交后的完整报告为 Unknown/36 clear/3 unavailable，challenge_timeout，UI 与 API 39 项完全匹配。首败、截图及引擎最小诊断保留，不删记录或调阈值。

同一个既有日常 Chrome 改用原生 macOS 窗口、键盘与 AX 读取：新独立报告 `31803ab6-9c61-4830-bc9c-34b004b33f0b` 为 Human/37 clear/2 flagged，原引擎已接受、无白名单、四项 Worker 一致性正常，中英文/中文原生输入法选字/滚动/提交全部完成。两项 flagged 是按键间隔和节奏变化的参考线索，按原规则不独立判 Bot；不写成39全clear。输入期间纠正了宿主当前中文输入法对英文按键的转换，完成后恢复原中文输入源；不是物理人工基线。原生 UI 导出的完整39项JSON与API逐项一致，原截图/导出/同页摘要保存。12项原 HTTP 阳性锁存、防伪和拒绝控制已实跑通过（verified-http-Cs5ZaZ）。

## 协议、Worker与持久状态

日常 Chrome 的 case `08183e2d-f051-4a46-b8cb-04a6bb26b96d` 实际 H2：ALPN=h2，JA4/SETTINGS/伪头顺序真实，首跳 TCP RTT 68/16us、TLS RTT 3053/1009us。宿主 localhost 使用 Lima 的原 TCP 转发，没有额外 TLS 终止；这里的 TCP RTT不是公网 RTT。两个原 hyperframe/hpack 实际报文控制（正常与混合伪头）及原 CrowdSec 阳性均通过。驱动首次误读 arm64 的覆盖清单，未装载公共 wheel；改为原基础材料清单校验同一 wheel 后继续，没有更换库。

原 quic-go@v0.55.0 发送器以 darwin-arm64 构建后在 Mac 宿主执行，直达 shieldvz=192.168.64.2:4183；实际 peer192.168.64.1、HTTP/3.0/200、ALPN=h3、JA4/QUIC 参数与 shape 均采到，25ms RTT响应原20ms受控读取延迟，TLS RTT按原能力标 unavailable。大64位 SETTINGS 原值保留；没有 TLS 代理或关闭验证。此为原 QUIC 控制客户端证据，未冒称 Chrome H3 基线。首次 Go 控制库缺失与后续依赖断流保留；同固定版本补齐，Go下载 HTTP2 开关只作用于该构建命令。首个 H3 驱动错误地要求 SETTINGS 非空，原 quic-go 正常发送空 SETTINGS，原产品解析亦接受；原真实空记录保留，额外宽值控制是独立用例，没有改盾规则。首次驱动在断言前未保存 client stdout，只保留 stderr/断言和服务端原记录，不能伪造首轮完整驱动回执。

原 Worker 用例在同一个所属日常 Chrome 标签取得 service/shared/dedicated measured 且无误报，tampered 命中 Navigator.hardwareConcurrency，CSP blocked 为 unavailable；39项报告中的四个 Worker属性均正常。协议控制只订阅 Network，Runtime订阅关闭；没有修改网站属性来隐藏调试标记。原生基线与这些开发控制分别记录。首个重放请求从 worker 的 connect-src none 页面被 CSP 拒绝，改在原业务页面执行；原拒绝不充当 nonce 拒绝证据。

64次原配额 HTTP 用例实际通过：主来源60允许、2拒绝，origin InvocationID 4b0ca81d→74225921后仍拒绝，独立IP/另一case允许，原 CrowdSec 告警存在；是来源准入控制，不冒称完整网关或真实长窗口。实际已接受的同一原 TLS挑战票据在 engine 重启前、重启后及再次重放均 failed/无新Cookie，原warmCookie业务200且无挑战；engine InvocationID 731f53d5→92185a32。票据在原20分钟龄期上限内（257秒），不是用过期票据充当持久防重放证明。原票据/Cookie只在内存，安全摘要回执保存后引用清除、所属标签关闭；没有创建或删除个人Profile。

## 维护、负向准入与冷VM恢复

原 Tor运行期刷新 exit0。GeoIP在发行包运行、PATH明确无Go时完成原 MMDB/35天/摘要及样本校验，调用正式 arm64 geoip-validator；原默认HTTP下载首败curl56/TLS EOF保留，同一guest的curl HTTP1.1下载成功，再以仅本次CURL_HOME配置的HTTP1.1执行原refresh-geodata全过程通过，没有更改全局网络、源码、检测或期限。默认网络下载失败不能抹去；当前网络的运行入口需这个独立下载选项，已准备 ignored 的 `刷新GeoIP并恢复盾.command`，复用原Lima/盾维护入口并在finally删除仅本次curl配置。

实际负向准入全部通过：合法过期Tor元数据拒绝、缺原生H2制品拒绝且未启服务；同名origin服务/4188端口被测试自己的异归属fixture占用时，原start以unit_owner_changed拒绝，fixture PID29968/InvocationID不变，没有被盾终止。所有原字节及制品SHA恢复，fixture由创建方finally关闭，所属五服务再start恢复ready。没有修改规则或放宽准入。

实际冷VM stop-vm→start通过：boot_id由 e8cf305d-cadf-4b86-9993-1faa8efab4ed 变为 e1d42308-ed4a-4bf2-ab83-e3fec3579382；business/budget/challenge-spent三个SQLite库的逐表行数和内容摘要全同，secret/install-owner摘要全同，五服务恢复active。原Human完整39项、结论、原验证和输入流经API回查完全保留，不把VM启动当作Mac整机重启。

宿主FileVault开启，fdesetup supportsauthrestart实测true；原系统help确认authrestart只对下一次重启解锁。宿主重启仍未执行，会中断当前远程会话。已准备、仅语法检查 `重启Mac并留存验收.command` 与 `恢复并验收Mac重启.command`：前者在正常停止所属VM前保存当前SQLite/归属摘要，然后由用户在正常sudo/fdesetup提示安全输入；后者要求Mac kern.boottime真实改变才恢复原盾、比较完整报告及数据库，再在4173/4175未占用时沿原npm run dev恢复工作台。没有安装启动项或保存密码/恢复密钥；恢复脚本未运行，不把计划写成宿主验收。最后由用户安排整机重启时间。

## 收尾及交付状态

本次 Linux build、宿主 source stage、wheel byte复现目录、Mac临时QUIC控制二进制及待签叶证书/私钥已按owner、路径和制品SHA永久删除。冷VM重启已终止前一boot的构建进程；正式五服务CWD全部位于正式数据目录。两个原安装stage也已由原finally永久删除。所属验收窗口/标签剩余0，原8个日常Chrome标签保留，未创建临时Profile。正式Lima、VM、安装数据、本机CA、公共发行包及非敏感首败证据保留。

最终B-A-T保护实核：任务0，aiSettings单行以原SQLite行编码计算的SHA与入场完全相同，两个授权文件SHA完全相同；REST投影编码与原行编码不同，比较按原事实源完成，未保存设置值。工作台原服务保留。当前盾五服务ready、两公开来源available；检测规则/阈值、模型路由和产品主流程未改。Git只保留必要安装修复与记录，未提交、推送或创建分支/worktree。

| 文档验收项 | 当前当地证据 |
| --- | --- |
| 1 原生平台/制品 | 通过：59文件SHA、7 ELF AArch64、五服务Linux归属 |
| 2 安装/启停/归属 | 通过：新装/同包/重复start/stop/start/未装stop-vm/归属拒绝 |
| 3 协议/Worker/持久状态 | 通过：真实Chrome H2、Mac原QUIC发送器H3、RTT、Worker、nonce与配额重启 |
| 4 日常Chrome完整报告 | 通过：Human/37 clear/2节奏参考线索，39项UI/API一致；首次Unknown保留 |
| 5 负向及维护 | 通过：原阳性/过期源/缺制品/外来归属拒绝；无Go刷新使用仅本次HTTP1.1下载配置 |
| 6 VM与宿主重启 | VM通过；Mac整机尚未执行，已请求用户安排时间，一键文件仅准备/语法检查 |
| 7 临时资源 | 通过：所属临时运行与目录分别结算，正式数据和个人Chrome保留 |

安装可用，整份文档的最终验收仍未完成，因为Mac整机重启尚待实际证据。整机操作没有因等待而自动获授权。原始失败、归档/模板/wheel 校验、公共包、最终报告和owner/清理记录在 ignored 的 `work/mac-install-validation-20261012/`。
