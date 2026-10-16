> **2026-10-13 当前：C真实新来源与双验证通过，现场两缺陷及请求取消传播已修，最终冻结3验收中。** 速度前两轮不达标，原失败保留。两站最终发布/同版复跑未完成，以[PROGRESS](PROGRESS.md)顶部及[本轮记录](BAT_NATIVE_EXPLORATION_EXECUTION_20261013.md)为准，下方为历史。

## 2026-10-13 原生探索整改：复用选择与审核纠正

复用既有 B-U 0.13.8 Agent/Tools、多动作序列及停止能力，TaskBrowser/Actor/CDP 原接线保留；B-A-T 仅补逐动作来源、IR 和版本生命周期。锁定上游源码及本机签名确认默认最多 5 动作，当前 1 动作来自自有适配。workflow-use 现有 fork/LICENSE 与依赖不变，不重装上游覆盖反爬补丁。完整 Reuse Assessment 见[方案第 10 节](BAT_NATIVE_EXPLORATION_REMEDIATION_PLAN_20261013.md)。

独立 review 纠正：现有 not-dispatched 规则不能直接接受原生正常停止的无结果尾部；bat_inspect_dom 等实际工具也可能刷新索引；访问限制当前在整轮结束结算；同 URL SPA 的子控件身份保护不能未经反例核验宣称完备。方案已逐条补接线与兼容核验，未改产品代码。默认不先增加异步编译复杂度，先减不必要调用并测剩余瓶颈。

模型 error-only 方法仍为语义质量问题，需新真实观察/方法/来源、局部候选与真实变化验证；不能以格式门或重编译旧 CSS 关闭。局部修订需同时处理 preparation-research 与 hybrid-source-reuse 的 failed-only 假设，保留 completed 的原运行事实。性能按全 job/同终点计算，开发变化验收不成为所有产品任务的统一完成门。

后续用户质疑暴露首轮漏项 M1：逐动作记录完整不证明最终方法合适。定点核查 `natural_compile_actions`、`natural_compile_result`、`natural_read_liveness` 与 `coverage`，现有能力覆盖探查分类、纯未消费查询裁剪、readiness 重绑定、输出装配与 repeat 方法，但不拥有一般的导航/回退副作用消除。方案新增 §8.0 B3：沿现有编译器做有限证据变换，明确数据/控制/状态依赖、必需无值动作、动态目标和参数化方法，保守保留合法冗余，错误副作用经局部新来源修订；不新增模型逐动作 keep/drop、轨迹优化框架或最短路径发布门。

本轮仅文档/只读 review，B3 增补已修正“跨 revision 冻结分类”和“retry coverage 误当副作用安全证明”两项发现，两个 reviewer 均复审通过；源码、平台、速度、稳定性和反爬行为尚未按该方案验收。证据与必须执行的能力核验见[审核记录](BAT_NATIVE_EXPLORATION_REMEDIATION_REVIEW_20261013.md)。

## 2026-10-13 模型质量与宿主过度约束的分离

原来源证明 Pixelscan 的 error-only 条件由模型提交；BrowserScan 未观察图标就声称没有状态也是模型判断问题。相反，错误的读取基数、Python/TS 方法合同不同步、必需结果跳过等待属于代码错误。发布证据检查不是两站这些失败的原始原因。

同需求、同代码对照：5.6-sol/high 第一阶段不再限定 error，第二阶段仍限定；样本与独立复跑均完成不能消除这一缺陷。刷新账号目录后试用 astra/high，其原生结束明确因没有处理中生命周期证据而拒绝完成。用户随后明确指定 6.1-sol，产品已切换，后续仅使用该型号。当前宿主指导要求每次结果读取都捕获处理中快照，但 B-U 的正常动作完成后页面可能早已结束；这把调查途径变成额外完成门，与“有可执行完成条件”并非同一要求。

本次修正只限指导：观察当前结果区域、可见完成标志与尚在处理的反证；仅在实际见到初始/处理中状态时用其排除错误方法，不要求倒追或重做操作来捕获短暂中间态。继续要求可复跑的等待条件，不把特定业务结果值、模型思考耗时或固定睡眠当作完成条件。不新增字段、模型调用或全局 judge。6.1-sol 未改代码基线 fe37db7a 同因 done(false)，19 动作/22 调用且首次 cleanup confirmed。现仅修正 author.py 与 method_read_diagnostics.py 两处宿主说明，既有公共/历史模型 schema 和普通执行器不变，待同型号原需求实跑。

```text
Product Alignment:
- natural-language task: 原已确认的 Pixelscan 检测及同类异步结果读取。
- reusable chain boundary: 原生探索记录读取方法，普通执行器执行现有等待与读取。
- runtime inputs: 原需求、阶段输入、页面实际状态。
- dynamic task outputs: 原合同的现场检测结论和项目。
- generic platform capability used: Browser-Use 原生观察与 CSS 投影、现有 StepVerifier/Tenacity。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 纠正探索指导中的额外完成门，不新增观察器或等待引擎。
- existing implementation in repository: Browser-Use action/observation、自然读取证据及原有界等待。
- mature candidates and pinned versions: 沿用现有锁定版本，无依赖变更。
- selected implementation: 现有 B-U 观察和现有 runtime 等待。
- reused public surface: find_elements、原生动作、bat_read_fields 和既有后置条件。
- B-A-T-owned adapter and remaining gap: 只改宿主对方法形成的说明；模型仍负责语义选择。
- license/runtime/platform fit: 沿用既有依赖，纯指导修改。
- browser/runtime/state ownership conflicts: 不创建第二控制器，不更改历史来源。
- replay model calls: 0。
- rejected candidates and evidence: 无需新增全局 judge、状态词表、截图抓拍循环或 LLM 必填字段。
- focused validation: 保留真实失败，原需求用指定模型验证；不新增测试文件。
```

## 2026-10-13 主流程发布证据与方法验证边界

复用现有 TaskRun/TaskExecution/Candidate、SQLite 事务、Zod 和执行器输入展开；没有新增依赖或通用框架。新反例证实 completed 摘要不能独立授权发布或准备完成，三处消费已收敛至同一 release-evidence。最小模型入口与旧来源 parser 分开，回归夹具同步到各自真实接口。新增固定主流程检查入口，389 项不同定向检查分组与定点复验通过；产品语义变化验证未因此获得证明。

关键否定证据：Pixelscan 两份当前草稿试跑能通过完整运行证据校验，但条件仍限定本次结果。这说明一致性校验与方法有效范围是两件事。禁止将所有属性选择器禁用、用状态词表或新增全局 judge 代替；合法筛选任务是直接反例。现有 prepare_task.research 只接收 failed job，也不能冒称已有 completed 来源的完整局部修订入口。后续能力与关闭条件见 MAIN_FLOW_INVARIANT_AUDIT_20261013.md；当前整体验收不通过。

## 2026-10-13 原生查询摘要保留

Reuse Assessment:
- capability: 查询总数事实与原生详情同时保留。
- existing implementation in repository: action_dispatch.bind_tools_act和dom_evidence.complete_find_elements_query。
- mature candidates and pinned versions: 当前已固定browser-use Tools.find_elements，原生long_term_memory携带总数首句，extracted_content携带明细。
- selected implementation: 原生两个返回字段原样复用，不重查页面或新建解析协议。
- reused public surface: ActionResult.long_term_memory/extracted_content。
- B-A-T-owned adapter and remaining gap: 适配器不能覆盖原生计数首句；追加详情继续满足后续模型记忆。
- license/runtime/platform fit: 既有依赖，纯Python字符串组装，无新增平台依赖。
- browser/runtime/state ownership conflicts: 不新增控制会话、查询、状态库或模型循环。
- replay model calls: 0。
- rejected candidates and evidence: 放宽正则兼容错误替换会保留双重事实源；应在造成信息丢失的适配器修复。
- focused validation: 真实原生0/多项结果经派发适配器、捕获和既有空集合编译链核验。

## 2026-10-13 逐行标量集合适配

Reuse Assessment:
- capability: 每个观察到的DOM行生成一个标量结果，保持采样与普通复跑一致
- existing implementation in repository: 现有ReadSpec maxValues、多值投影、normalize_author_action前置来源捕获
- mature candidates and pinned versions: 已固定browser-use actor CSS公开API；JSON Schema Draft202012Validator
- selected implementation: 复用上述现有能力
- reused public surface: :root容器与原CSS行选择器、多值fields.value
- B-A-T-owned adapter and remaining gap: 仅在已确认标量数组且value=:scope时互换原container与field selector；不推断父元素或任务语义
- license/runtime/platform fit: 不引入依赖；现有Python/Chrome跨平台接口
- browser/runtime/state ownership conflicts: 不新增浏览器或DOM写入；来源捕获前定型参数
- replay model calls: 0
- rejected candidates and evidence: 不新增模型字段、模型循环或另一读取执行器；原110项误报单容器超限的真实来源855601a2保留
- focused validation: 19项合同/来源/采样，真实Chrome异构卡片与变更复读，实际Python到TS四场景，32组旧Schema/10份来源兼容通过

## 2026-10-13 组合字段读取复用

真实缺口：同一业务字符串由名称和SVG图标属性组成，整个父节点又含不应采集的原始值。现有DOM投影/ReadSpec和绑定编译器覆盖读取生命周期，局部扩展parts复用querySelectorAll/getAttribute，不另造DOM引擎或语义模型。两类适用任务为状态报告（名称+图标）、订单/工单列表（标题+徽标）。parts每段仅selector/可选attribute，换行由代码固定，不让模型填类型、数量预算、分隔符、样例或绑定。属性命名空间按原生getAttribute读取，状态原值不按网站特判转换。闭环要求真实DOM变更状态后复读、旧schema摘要不变、Python→TS编译消费以及两站正式业务输出验收。

## 2026-10-13 读取动画稳定性复用

使用原生Web Animations的getAnimations/finished与下一帧事件，不改变页面，不让模型提供等待字段。有限动画3秒超时明确失败，无限动画不阻塞。实际Chrome局部回归通过，依据与真实外站根因见[当前修复记录](PUBLIC_NATIVE_REMAINING_ROOT_CAUSES_20261012.md#第三轮复验发现的动画中间态)。

## 2026-10-13 两站原生准备修复的复用核验

读取界面复用当前 Pydantic create_model / model_validator 和 JSON Schema Draft202012Validator，执行仍复用既有 ReadSpec；无新读取器或模型重试循环。完成来源复用现有 assemble / ValueBinding；只把合同唯一值、已有输入和经验证读取贯通。旧注册表只读适配与 HEAD 的32种组合摘要逐一相等。生命周期复用 RunnerCleanupReport、同 owner managedWindowAction 与 SQLite 部分索引，不引入第二套调度。

网络诊断采用 Node 官方 [Undici DiagnosticsChannel](https://github.com/nodejs/undici/blob/main/docs/docs/api/DiagnosticsChannel.md)，实测真实 fetch 并发调用隔离、HTTP 503 和 TCP 断开，只返回白名单 code / HTTP status。由请求对象 WeakMap 关联 AsyncLocalStorage 调用，不记录 URL、请求头、正文或异常消息。选型为现有 Node 24 内置能力，无新增依赖、许可证或 Python 平台差异。

进程代理采用 Node 官方 [NODE_USE_ENV_PROXY](https://nodejs.org/docs/latest-v24.x/api/cli.html#node_use_env_proxy1)，本机 Node 24.12 支持；normal dev/API start 通过可选 .env 读取，NO_PROXY 保留回环直连。不改共享 Clash 规则、系统时区、个人扩展或远程控制。Node 24.14 的 setGlobalProxyFromEnv 本机不可用，未采用，亦未自写代理路由器。

# 技术调研与复用结论

## 2026-10-12 导航授权承接与主流程核查

沿用 tldts 的站点解析、browser-use allowed_domains/SecurityWatchdog、既有来源引用与草案确认、LangGraph 运行/恢复及 owner 清理。B-A-T 只增加版本化 navigationScope 并贯穿准备/复跑，禁止业务输入或观察 URL 反向授予权限；原生越界拒绝保留。具体 Reuse Assessment、原入口失败证据、协议/端口/来源反例和逐阶段验收见 [导航修复记录](NAVIGATION_SCOPE_REPAIR_20261012.md)。新任务保留原 localhost 入口完成准备、样本、变化输入独立验证、发布和同版两次正式运行；四次HUMAN/39 clear、输出与各自原报告一致、普通模型0、清理confirmed。此结论来自新证据，旧更换入口成功不再承担根因关闭证明。

## 2026-10-12 部署Review修复复用

Lima2.2.1固定源码确认create --set、list --json中的dir/arch/vmType/param与info.limaHome；实例目录不存在时LimaDir可直接返回路径，因此创建标准home后再做realpath。绑定真实实例配置、唯一创建标记和目录身份，不以同名与旁路记录认领。归档按固定SHA复用和原子替换；停止继续复用Lima/systemd。

GeoIP直接编译既有CrowdSec1.8.1模块内geoip-calibration.go，作为第七个原生制品发行，runtime维护不调用Go；原35天过期门与MMDB检查未变。x64空PATH真实数据控制通过。完整复用评估、固定源码链接、首败及验证见[Review](SHIELD_MULTIPLATFORM_REVIEW_20261012.md)。Mac当地原生构建及实机验收见[交接](MAC_INSTALL_VALIDATION_20261012.md)，当前仍未测。

## 2026-10-12 真实扩展协议与清理归属修复

现有扩展将原生CDP错误对象编码到Error.message，relay再次包装时丢失code。真实跨域fetch取消两次复现-32602/Invalid InterceptionId.无法到达已有精确分类；恢复原code/message/data，不增加错误豁免、不重发动作。该包装在本轮前HEAD即存在。修后六时序通过，其中四次真实取消；真实WS边界测试与既有准入测试通过。取消恢复只补齐同task/execution持久化草稿owner，不重造恢复器；13项边界及真实产品自动关闭原lease通过。完整复用记录见[根因记录](PRODUCT_BROWSER_ACCEPTANCE_CORRECTION_20261012.md)，新冻结真实产品验收见[最终报告](PRODUCT_BROWSER_FINAL_REPORT_20261012.md)。

## 2026-10-12 验收浏览器入口纠正

Chromium [runtime_features.cc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/child/runtime_features.cc#393) 将 `--remote-debugging-port=0` 开启 AutomationControlled，[Navigator::webdriver](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/navigator.cc#L76) 返回 true。当前本仓产品 chromeLauncher 并不注入此参数；错误来自本次另写的任务浏览器验收启动脚本。直接复用正常工作台的 DailyChromeExtension→CDPRelayServer→原 launcher，辅助 UI 客户端独立，不通过另换调试参数或属性覆盖绕开。复用/所有权/真实验收门见[纠正记录](PRODUCT_BROWSER_ACCEPTANCE_CORRECTION_20261012.md)。

## 2026-10-12 冻结任务首败追补：原生参数与隐藏页键盘

原生ContentReadToolParams的宿主默认regionMode必须沿新来源normalize→Python编译→TS代表输出边界保存；旧无标记trace保持历史common-ancestor解释。以同一原生schema规范化，18项Python/17项TS及原失败真实来源离线交接通过，未改原trace。证据见[BSK执行记录](BSK_REMOVAL_EXECUTION_20261012.md)。

普通输入在Chrome154隐藏页面收到63键盘派发却0输入，直连CDP通用页复现。DOM刷新、窗口显示及前台激活无效；一次原生截图后21字符/43输入事件成功。固定[B-U BrowserSession](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/session.py)的公开take_screenshot直接调用CDP；[Chromium固定源码](https://chromium.googlesource.com/chromium/src/+/a2401fdfbd4c6620a9e513a19671eab8f37df2a5/content/browser/devtools/protocol/page_handler.cc)的CaptureScreenshot显式请求隐藏页产帧。采用隐藏页键盘前一次有界调用，不存图、不交模型、不恢复普通观察截图、不改变输入实现/事件校验。6项边界与通用真实输入通过；这是测得的Chrome环境行为，不声称取得154精确源码或修复全部浏览器背景场景。

## 2026-10-12 实施补充

BSK承接只使用原Native Tools/Actor/TargetResolver与同一runner，外部CLI/session/transport已删除。原生CDP建页回执可能晚于autoAttach，现有归属层仅补本次创建回执对应的早到事件；未确认创建保持cleanup未知。Chrome通过CDP安装的扩展会被其[固定源码的CleanUpCdpInstalledExtensions](https://chromium.googlesource.com/chromium/src/+/993e57a3e1af70dcad63122ef1ea98835cf8a1f2/extensions/browser/extension_prefs.cc)在重启清除；连接夹具重复加载同一扩展并保留storage，不能冒称测试了桌面手动安装持久性。

盾继续原systemd/WSL，Linux入口不再递归调用WSL。Lima2.2.1 Darwin-arm64官方SHA为9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e，Ubuntu26.04 release-20260927 arm64镜像使用固定模板摘要63a93bd5a8d76e33b15ceb5daa3657bd79be804748051ab178e643b0f5da22e7。[官方SHA清单](https://github.com/lima-vm/lima/releases/download/v2.2.1/SHA256SUMS)、[固定镜像模板](https://github.com/lima-vm/lima/blob/v2.2.1/templates/_images/ubuntu-26.04.yaml)。arm64 Node/Traefik使用官方校验和，Ubuntu arm64 dev包按同版本官方ports字节核验；CrowdSec v1.8.1发行只有amd64，arm64使用同一固定源码原生构建。Mac机器行为仍未验证，不冻结支持结论。

新Linux包第一次在WSL安装/启动ready，随后缺宿主presence而空闲退出，首败保留；复用原presence给Windows薄入口后持续ready。生命周期仍由systemd/Lima负责，无Docker、无新supervisor，检测规则/阈值不改。详见[执行记录](SHIELD_DEPLOYMENT_EXECUTION_20261012.md)。

## 2026-10-12 BSK移除、探索清理与盾双平台：设计核验，未实施

[BSK开发方案](BSK_REMOVAL_AND_EXPLORATION_CLEANUP_PLAN_20261012.md)第2–4节记录实际装配、能力承接和完整Product Alignment/Reuse Assessment。固定BrowserSkill源码说明CLI与daemon同一binary，扩展承担实际浏览器操作；本仓仍有PATH启动bsk的旧执行分支，当前B-U主线并非全部旧合同的自动替代。采用已有browser-use0.13.8/受管runner、Playwright固定relay与内置BrowserSkill传输组件，删除外部执行依赖；不以CLI打包、禁用旧任务或重写控制器替代。旧探索与当前共享工具分开处理，LangGraph/访谈Pi/来源恢复/在线编译保留。

[盾部署方案](SHIELD_WINDOWS_MAC_DEPLOYMENT_PLAN_20261012.md)已撤回本轮错误的Docker推荐：既有[10月8日决定](ANTIBOT_SERVICE_IMPLEMENTATION_20261008.md#2026-10-08-运行环境纠正)明确因无可用Desktop、dockerInference/Secrets Engine两次启动失败停止该路线。本次采用Windows保留WSL、Mac接入Lima VZ Linux arm64的设计，两端共用原Linux五服务、systemd、补丁、共享wheel和mkcert；不自写跨平台supervisor。已核Lima v2.2.1/27bc4c4b101e27994e01e36566a0f2091bbca507的模板、defaults.go、发行资产和Apache-2.0许可：plain禁用containerd和动态转发，可配置静态转发及vzNAT；Lima的WSL2后端仍实验性，不接管现有Windows。Process Compose/mise不提供Linux环境，不另行叠加。具体源码链接、能力界限、arm64构建与网络验证门见方案第2–6节。尚未安装或实跑Lima，Linux镜像/制品摘要及Mac行为待P0/P1，不把上游支持当成盾已通过。

## 2026-10-11 Worker追查：CDP消息线程中的同步存储

原三次事件和网关时序保存于`work/bat-shield-mainflow-20261011/mainline-repair-02/worker-root-cause/original-comparison.json`。单次启动诊断未复现不可测，但实际栈采到`CDPClient._handle_messages → EventRegistry.handle_event → Runner.record_document_response → DocumentResponses.record → remember → diskcache.Cache.__init__`在消息线程执行同步SQLite。固定cdp-use1.4.5的接收循环逐条await事件handler，因此此处慢写也阻塞Worker attach/resume与Fetch继续消息。旧代码的受控本地Worker用例以4秒慢存储确定性得到3006ms unavailable，未访问盾；不得以此推称已取得两个历史运行当时的锁等待栈。

Product Alignment: natural-language task=打开使用Worker的报表或编辑器；reusable chain boundary=单次任务页面及其响应；runtime inputs=本次CDP响应；dynamic task outputs=原页面状态/Worker结果；generic platform capability used=现有请求及响应准入；replay model calls=0；site/task-specific code added=no。

Reuse Assessment: capability=响应退避持久化不占用CDP接收线程；existing implementation=Admission.decide已支持Response阶段、asyncio.to_thread(remember)、失败关闭及close取消，专属Profile/iframe已使用；selected implementation=同一路径扩到普通任务页，Network回调仅保留原文档状态和挑战标记；reused public surface=[CDP Fetch RequestStage](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)、现有TaskBrowser/RequestGate；B-A-T-owned gap=原普通页只启用Request，随后Network回调同步补写；license/runtime/platform=原已固定CDP/B-U/cdp-use/磁盘缓存依赖不变，Windows现场验证；ownership=沿已有任务session启用，不扩大个人页面或SW所有权；replay model calls=0；rejected alternative=另造异步队列或单纯await to_thread事件handler仍占用原CDP逐条消息处理，直接跳过持久化又破坏退避，因此复用原Response准入；focused validation=先失败单测、慢存储真实Worker前后对照、持久化早于响应放行、存储失败拒绝、原准入/iframe边界。DiskCache官方也说明重新打开较慢，见[原教程](https://grantjenks.com/docs/diskcache/tutorial.html)，本轮不扩成缓存生命周期重构。

## 2026-10-11 导航参数与落地事实分离

复用B-U0.13.8固定eb412692的Tools.navigate/Tools.act，及已有ActionDispatchAudit参数摘要、natural_bindings来源绑定、native_action_receipt和动作所属页面scope。B-A-T取消新来源与当前生成入口自动添加的“落地URL等于输入”，不放宽URL匹配器、来源授权或显式equals；旧无回执来源维持原准入。受管fork0abe91b5。10项新增及15项其他生成入口检查通过，原source离线编译和完整Workbench发布/普通复跑证据见[结算](BAT_SHIELD_MAINFLOW_CLOSEOUT_20261011.md)。无新依赖、导航框架或额外模型调用；首败与3项既有mock回归失败独立记录。

## 2026-10-11 主流程阻塞与连接页

复用固定B-U 0.13.8 SecurityWatchdog公开BrowserErrorEvent与Bubus event_history；SourceObservationScope仅消费本次scope创建之后的NavigationBlocked/TabCreationBlocked，原站点准入不改。Playwright扩展8b552173的WebSocket与ConnectedTabs继续拥有连接；按[Chrome官方WebSocket生命周期](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)每20秒发送空保活消息，连接关闭清除定时器。成功后仅关闭本次握手tab；最后一个Chrome tab延迟到任务自建窗口之后，已被用户导航的tab不关闭。没有重建连接框架或增加重连机制。2项生命周期不变量和既有释放/readiness用例通过，真实原Chrome Reload后保存授权连接与无常驻页保活通过。其余既有测试失败独立记录，不伪称整套通过。

## 2026-10-11 草稿纠错诊断窄修复

复用已固定AI Connect authoring公共解析与现有一次Pi repair；B-A-T自有Markdown领域校验此前只抛错误码，通用authoring不能解释其章节/字段规则。本次只在自有校验处补具体诊断并传入原修复流程，不重写公共解析器、不加模型循环、不改盾。接受门为本次两份真实原输出得到明确诊断、原非法/冲突仍拒绝、修复仍最多一次、真实保存模型能纠正被拒绝草稿并通过原校验；随后继续原产品流程，其它失败单独记录。

实际结算：目标字段经真实单次repair通过原准备草案解析，但同一草案随后暴露中文引号URL校验错误；原正式需求重试成功后，准备阶段另受页面观测一致性阻塞。二者未修，不把字段修复成功扩大为全流程或盾通过。40/42聚焦通过，2项HEAD协议测试基线失败、3项盾类型错误另列，受影响文件定向类型检查通过。见[修复与主流程证据](INTERVIEW_REPAIR_AND_MAINFLOW_20261011.md)。

## 2026-10-11 当前包：IME 真实键对与三项独立测量

真人Ctrl+Space/Tab首错配最小修复后，用户自行操作两次均Human/39clear，三项逐字段有效，原失败不改写。B-A-T原发布链正式四变体实际输出7/11/13及无合格候选失败、模型0；原盾判据不改。首轮点击ACK完整却事件0仍未定因；不能把后续成功当根因修复。本轮唯一生产适配是复用原SQLite覆盖索引events(case_id,action,id)，消除管理报告同步全表回查导致的健康超时；源码、查询计划和真实业务证据见SHIELD_TASK_ACCEPTANCE_20261011.md与PROGRESS顶部。

Reuse Assessment:
- capability: 输入法键盘事件适配与原三项时间检测，不新增分类器。
- existing implementation in repository: 原 collector、Kitsune f0a22b3 两个公开统计函数、FCaptcha 1.43.0/56aa2b38 checkTypingCadence。
- mature candidates and pinned versions: 保留已校验 SHA 的原组件；UI Events 标准的 KeyboardEvent/CompositionEvent，Windows 原 IME 与现有 owned 验收能力。
- selected implementation: 原检测函数/原阈值，补 DOM 原生事件配对适配；无新依赖，无模型训练。
- reused public surface: 原事件 timeStamp/code/keyCode/isComposing、原 OrdinaryCapability/ManagedWindow 与 Windows IME API。
- B-A-T-owned adapter and remaining gap: 仅采集真实时刻与可核验键对；两字段分别采样，按间隔、熵、完整键对分别校验；缺身份/缺释放不补造，实际异常/时钟倒序不忽略。
- license/runtime/platform fit: 原许可/组件版本保持；本机 Windows Chrome 实测，不宣称所有输入法都产出足够键盘事件。
- browser/runtime/state ownership conflicts: 测试只用精确归属的临时 Profile/PID，finally关闭删除；用户窗口不连接CDP、不代输入，服务端原 SQLite 为事实源。
- replay model calls: 0
- rejected candidates and evidence: 拒绝“取消所有valid检查/统一刷绿/用composition提交时刻造hold”；原版FCaptcha函数不排除IME，只检查键数、间隔/hold与粘贴门。
- focused validation: Ctrl+Space回归先失败；真实Windows同流程修前unknown、修后Human/39clear，两个字段分别29/29与28/28真实键对，模型0、DOM/API一致、IME精确恢复；脚本来源仍Bot，错误/重复/无Control/非原生/陈旧Space释放仍invalid，真实快速原规则阳性仍保留。29项聚焦、子包类型检查通过，34份Profile永久删除；真人原失败不改写，首错配片段原时刻回放通过。未重新要求真人手验，未称已完成修后新真人运行，见SHIELD_IME_TIMING_ACCEPTANCE_20261011.md。

原生诊断发现 code 可为空，229 down 配有229 up，并额外出现非229 up。300ms OS按住的实际观测：首个229 down/up间隔287.6ms，后一键315.5ms；不能把额外up当第二次按键，也不能把组合结束时刻当释放。匿名事件时序保存在reports/shield-ime-physical-20261011/native-events-before.json与held-native-events.json；无输入内容/键值落盘。来源：[UI Events组合期间键事件](https://www.w3.org/TR/uievents/#events-compositionevents)、[固定FCaptcha原函数](https://raw.githubusercontent.com/WebDecoy/FCaptcha/56aa2b38b8a5b7333cc7bf7d179a9e14538b2c5b/server-node/inputforensics.js)。Windows按住探针使用官方keybd_event仅用于受控证据，不进入产品控制器。

Ctrl+Space复现同时核验本机ImmGetHotKey(IME_CHOTKEY_IME_NONIME_TOGGLE)：modifiers=49154、virtualKey=32。Windows事件链为Control 229/普通down→compositionend(false)→Control 229/普通up→Space up，无Space down；IME关闭时也能出现普通Control down/up→Space up。原[IME切换标识](https://learn.microsoft.com/en-us/windows/win32/intl/ime-hot-key-identifiers)、[TSF OnKeyTraceDown/Up及Process派发源码](https://raw.githubusercontent.com/chromium/chromium/main/ui/base/ime/win/tsf_text_store.cc)解释该边界；本机实测是行为依据，上游main不冒称本机二进制同版。识别快捷键只影响它自身的非采样上下文，不修改既有真实数值或检测阈值。

## 2026-10-11 原生输入上下文与双语采样纠正

真实缺口：网站把所有 isTrusted=false 的组合/焦点辅助事件额外解释为异常，脱离原 scripted-input 的五类事件判据；单个最近 textarea 的节奏采集又使中文组合抹去先前英文。用户实际无 CDP 原记录与 Chrome 原生 IME 复现 compositionend=false，因此不能据此称“非原生”。

源码依据：[Blink 原生 IME 结束派发](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/editing/ime/input_method_controller.cc) 的 DispatchCompositionEndEvent 调用 DispatchScopedEvent；[EventDispatcher](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/events/event_dispatcher.cc) 与 [ScopedEventQueue](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/events/scoped_event_queue.cc) 直接进入队列派发；[EventTarget](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/dom/events/event_target.cc) 的普通原生 DispatchEvent 才设置 trusted=true。主分支源码用于解释路径，不能当本机二进制逐字同版证明；本机 Chrome 154.0.8037.98 实际原生事件回执另作行为证据。DOM 信任位按原样保留。

Product Alignment:
- natural-language task: 真人与 B-A-T 在同页完成同样的中英文、滚动与提交，不把正常输入法报异常。
- reusable chain boundary: 原 OrdinaryCapability 导航、输入、滚动、提交与读取，无新增公共动作。
- runtime inputs: 既有本次 run/page、同源遥测、原生挑战回执。
- dynamic task outputs: 同页原报告、原信任位、按规则适用范围得到的状态。
- generic platform capability used: 原所属浏览器控制与生命周期。
- replay model calls: 0
- site/task-specific code added: no (本检测站采样范围只在盾 collector 中，未进入公共 runtime)

Reuse Assessment:
- capability: 输入事件原规则核验与键盘节奏上下文采集。
- existing implementation in repository: 原 CrowdSec 1.8.1/scripted-input、既有 collector、Kitsune f0a22b3 与 FCaptcha 1.43.0 固定判据。
- mature candidates and pinned versions: 保留以上已选组件与版本；Chromium 原生 IME/剪贴板能力用于实测，不引入新库。
- selected implementation: 原 five-type scripted-input 与原节奏检测器；仅纠正网站额外告警与页面级采样目标。
- reused public surface: 既有原生 DOM events、原 OrdinaryCapability、原协议与服务端挑战审计。
- B-A-T-owned adapter and remaining gap: 盾模型按事件类型投影，检测页英文采样隔离；辅助上下文保留而不新增异常，未知类型/丢失/无效仍 Unknown；旧样本无法重建时刻，保持不适用。
- license/runtime/platform fit: 既有 Apache/MIT 等许可与固定组件不变；Windows Chrome/WSL 同实例验证，无新增运行平台承诺。
- browser/runtime/state ownership conflicts: 一次可见 owned 会话重复使用；原生粘贴反向使用独立 headless clipboard，不读取/覆盖用户系统剪贴板；server/SQLite 事实源不替换。
- replay model calls: 0
- rejected candidates and evidence: 没有重选库；拒绝“改 trust 位/五类规则/阈值/仅无异常即真人”的替代方案，原阳性与验证必要性用现有反向控制保护。
- focused validation: 原失败先验、18 项聚焦、12 项 HTTP 控制、原生 IME/B-A-T 同双语39 clear、原无头 Chrome 原生粘贴仍 Bot，见[本包结算](SHIELD_INPUT_CONTEXT_CLOSEOUT_20261011.md)。

剪贴板边界：[Chromium HeadlessClipboard](https://raw.githubusercontent.com/chromium/chromium/main/components/headless/clipboard/headless_clipboard.cc) 使用 ClipboardNonBacked，与平台剪贴板独立；本机实测 native Ctrl+V 产生 trusted paste，Windows GetClipboardSequenceNumber 前后不变，正常粘贴未被误判，但原自动化标记/挑战仍拒绝该控制组。输入法或粘贴是正常上下文，既不能单独报 Bot，也不能单独证明操作者身份。

## 2026-10-11 原版服务端验证接入与 IME 公平性

Product Alignment:
- natural-language task: 同一检测页面由真人与 B-A-T 完成英文、中文、滚动和提交，查看可抓取的真实判定。
- reusable chain boundary: 既有普通输入/点击/滚动/读取；网站只组合检测原件。
- runtime inputs: 本次独立 run/page/域名与遥测批次。
- dynamic task outputs: 同页报告、服务端本次挑战回执及缺失/异常原因。
- generic platform capability used: 既有浏览器会话与原普通能力。
- replay model calls: 0
- site/task-specific code added: no (检测站业务不进入公共 runtime)

Reuse Assessment:
- capability: 新鲜挑战验证、原规则消费及可审计的单次服务端结论。
- existing implementation in repository: CrowdSec 1.8.1/909b515、固定 Hub f5cd0975、Traefik 原 bouncer 710e8880、已有 SQLite cases/events 与独立 HTTPS。
- mature candidates and pinned versions: BotD 2.0.0、fpscanner 1.0.8 原版对照已运行；本次复用当前 CrowdSec 内置固定 fpscanner，不替换库/训练模型。
- selected implementation: 当前 CrowdSec 1.8.1 完整挑战 + 原 balanced >=75；BotD/CreepJS/身份对照补充原证据，Kitsune/FCaptcha 节奏仅供解释。
- reused public surface: 原 bouncer challenge 响应、sealed cookie、on_challenge_submit LogAccepted/RejectSubmission、原普通浏览器能力、SQLite 原事务。
- B-A-T-owned adapter and remaining gap: 独立 run 域名、受保护完成路由、原接受审计投影、服务端报告及中英文完成采集；不复制 PoW/签名/cookie 引擎。
- license/runtime/platform fit: CrowdSec MIT；Windows 桌面浏览器 + 已有 WSL/Node/systemd；mkcert 1.4.4 复用既有用户 CA，为 *.shield.localhost 签发有效会话域证书。原 *.localhost 顶级通配符不满足严格主机名校验，不能以原信任回执冒称会话域可信。
- browser/runtime/state ownership conflicts: 检测站不拥有浏览器控制；原 engine/bouncer 验证，原 SQLite 存事实；不记录输入内容/通行 Cookie/完整指纹。
- replay model calls: 0
- rejected candidates and evidence: 独立“物理真人认证模型”不属于本次通过问题；原数据集失败保留，不继续围绕 B-A-T 调参。
- focused validation: 实际无 CDP 真人 Windows 中文输入法及 B-A-T 同一中英文流程均 Human；原标准无头 Chrome 同流程 Bot/原分数500拒绝；原生 IME 取消/提交、旧 Cookie 409、脚本五类事件、伪造/跨会话/丢失/无效/采集失败锁存及重访新 run 已验证。23 项聚焦、子包类型、原冻结业务版本7/模型0和资源结算见 SHIELD_VERIFIED_FLOW_CLOSEOUT_20261011.md。未做其它输入法、独立人群统计或外站新的复跑。

源码依据：[固定 GetOnChallengeSubmitEnv](https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/pkg/appsec/waf_helpers.go#L234) 的 RejectSubmission 是 terminal；LogAccepted 只在已经密码验证的提交中可调用。接受审计追加在原 balanced 拒绝分支之后，不改评分或判据；后续保护路由到达仍须原 bouncer 验证本次 cookie。只看阴性遥测或全局统计不能授予 Human。

B-A-T复验首败：底层Page.goto验收前页面hidden=true，出现原BotD窗口阳性/输入事件归属失败；等待非零窗口未解决，已删除。改用原OrdinaryCapability导航及所属页面激活后，verified-flow-46jdo7rl完整同流程Human，原尺寸/焦点组件正常；两个首败目录保留。原[BotD窗口判据](https://raw.githubusercontent.com/fingerprintjs/BotD/v2.0.0/src/detectors/window_size.ts)未改，失败瞬间全部组件未采到，不冒称已完整证明内部时序。匿名采集诊断已移除，公共控制源码/vendor无本轮变化。

## 2026-10-10 至 11 中文 IME 采集适配修正

Reuse Assessment:
- capability: 原采集器正确分段中文组合输入、区分有效节奏与排除样本、按事件类型公开来源证据。
- existing implementation in repository: 原 collector/checkReceipt/单页模型；固定 Kitsune f0a22b3 与 FCaptcha 1.43.0 checkTypingCadence。
- mature candidates and pinned versions: 继续使用这两个原函数/固定 SHA，不新增检测库或自研统计模型；浏览器 Event/KeyboardEvent/CompositionEvent 标准 API。
- selected implementation: 原函数完全不变；适配层维护当前 textarea 焦点段的排除、按下/释放配对和匿名事件类型计数。
- reused public surface: 原 keystrokeIntervalMedian/keystrokeEntropy/isScrollTeleport/checkTypingCadence；DOM Event.isTrusted/isComposing、compositionstart/end；验收复用原 ManagedWindow/OrdinaryCapability/Chrome Input.imeSetComposition；Windows 原 IMM 与 WScript.Shell 仅作为 owned 验收夹具。
- B-A-T-owned adapter and remaining gap: 排除段不继续错误配对；229/Process 前置排除；原始 invalid 不被后来的排除覆盖。keyboard 模型应用范围外显式 excluded，滚动不受影响。公开回执新增 byType；强阳性事件集合与 rules.ts 原 scripted-input 保持一致（input/change/click/keydown/keyup），非原生组合等辅助事件 advisory/unknown，原 CrowdSec 观察行仍完整记录。原引擎已经排除 compositionend；原网站误用了粗粒度 untrusted 总数，本次将投影对齐既有规则，未修改 rules.ts 或引擎配置。
- license/runtime/platform fit: 原 MIT 固定上游许可、Node 24、Windows Chrome + WSL 服务边界不变；无新依赖。
- browser/runtime/state ownership conflicts: 仅 owned 临时 Profile，finally 确认关闭再永久删除；不记录文字/候选/按键内容，不操作个人浏览器。Windows 模式记录初值并恢复，不安装输入法或改系统偏好。
- replay model calls: 0；B-A-T 公共 runtime 无网站特判或新增循环。
- rejected candidates and evidence: 只改颜色、把 excluded 当 clear、全忽略 untrusted、改阈值/源码都不能保护真实异常。原判据仅适用完整逐键时刻；IME 结束释放 isComposing 可为 false，单一标志无法完成配对。
- focused validation: IME 提交/取消/失焦/快捷键/长按与倒退时间、不完整、原快速控制；类型证据、旧无类型回执、脚本输入不被组合事件掩盖、原阳性锁存；真实同源 HTTP/单页 JSON 与 B-A-T 普通控制。实际结果见 PROGRESS，Windows OS IME 结果与浏览器 CDP 组合场景分别结算。

依据：[MDN keyup 的 IME 边界](https://developer.mozilla.org/en-US/docs/Web/API/Element/keyup_event#keyup_events_with_ime)、[DOM Event.isTrusted 定义](https://dom.spec.whatwg.org/#dom-event-istrusted)、[Chrome Input 协议](https://chromedevtools.github.io/devtools-protocol/tot/Input/)、[Windows 原 IME 窗口 API](https://learn.microsoft.com/en-us/windows/win32/api/imm/nf-imm-immgetdefaultimewnd)。原非原生辅助事件仍是可审计线索，不能当真人认证；旧历史回执不改写。

系统补验：用户协调唯一 owned 窗口，确认前台 owner PID 后复用原 OrdinaryCapability 聚焦输入框，原 IMM/WSH 发送公开合成拼音，实际中文提交及组合边界在 check-ime-9cl7gzbs 完整观察。系统输入也出现 compositionend 非原生，五类强输入均原生；原投影正确保留 advisory/unknown，三项键盘 excluded，无 flagged/failed。IME open/conversion 恢复初值、同页 DOM JSON 一致、普通模型 0、默认 TLS，所属 Profile 已永久删除。先前夹具“所有事件必定原生”与焦点错误分别保留，修的是验收前提，不改判据；其他输入法/真人人群未测。

## 2026-10-10 暗色检测网站与真实 localhost 信任

Reuse Assessment:
- capability: 真实检测结果展示、浏览器输入采样、本机 HTTPS 信任。
- existing implementation in repository: BotD 2.0.0、CreepJS 10aa6724、UA-CH/structured-headers 2.0.3、Kitsune f0a22b3、FCaptcha 1.43.0、collector/telemetry；旧 openssl 自签叶证书验收依赖 owned SPKI 忽略，不能证明日常浏览器信任。
- mature candidates and pinned versions: mkcert 1.4.4；正式公网域名使用公开 CA/ACME，localhost 没有可签发的公网域名。
- selected implementation: mkcert 官方 Windows x64 binary，SHA256 d2660b50a9ed59eada480750561c96abc2ed4c9a38c6a24d93e30e0977631398，摘要由 Microsoft winget 固定 1.4.4 manifest 核对。
- reused public surface: mkcert -install、-cert-file/-key-file、CAROOT、TRUST_STORES=system；全部原检测器 API/固定原函数及原服务生命周期。
- B-A-T-owned adapter and remaining gap: 暗色 V3/原创点阵动画、回执结果投影/逐批确认；系统根信任/服务证书路径配置。原规则不改，节奏线索不独立判 Bot。全部自动项有效阴性才展示本次 Human，缺失/排除/失败保留未知。公网域名/部署未提供，不算公网证书验收。
- license/runtime/platform fit: mkcert BSD-3-Clause，Windows x64；静态页面/ES module 沿用 Node 24 独立服务，不另造检测引擎。
- browser/runtime/state ownership conflicts: 不使用个人 Profile；CA 私钥只留本机用户 AppData，不进服务数据/Git/发布包。公开 CA 链供本进程使用，不修改 WSL 系统信任库；旧证书备份 ignored，不动预算/业务/challenge 数据。
- replay model calls: 0；真实 ManagedWindow + OrdinaryCapability 输入/滚动/点击，无模型参与。
- rejected candidates and evidence: 忽略证书/仅加 https 未建立系统信任；自建 CA 复制成熟能力；报告对照无授权，删除。
- focused validation: 投影/归属/缺失/未知/锁存/排除/弱行为边界，默认 Chrome TLS，同页 DOM/JSON，自动/交互回执与真实普通控制。结果记 PROGRESS。

依据：[mkcert 1.4.4 README](https://github.com/FiloSottile/mkcert/blob/v1.4.4/README.md)、[Windows ROOT store 源码](https://github.com/FiloSottile/mkcert/blob/v1.4.4/truststore_windows.go)、[winget 1.4.4 摘要](https://github.com/microsoft/winget-pkgs/blob/master/manifests/f/FiloSottile/mkcert/1.4.4/FiloSottile.mkcert.installer.yaml)。

## 2026-10-10 独立化纠正已实施与实际复用

最终实现/证据见[交付结算](SHIELD_INDEPENDENCE_CLOSEOUT_20261010.md)。Reuse Assessment: capability=单一quota实现/独立交付；existing=原quota函数+SQLiteBucket；selected=PyrateLimiter4.5.0/filelock3.19.1，标准build1.2.2.post1/Hatchling1.27.0；public surface=init_from_file/leak/put_decision/close与标准wheel/zipimport；adapter=原函数迁移、双侧参数及来源回执；ownership=各自DB/策略、不新增RPC或browser session；replay model calls=0；rejected=双份适配、导入整个runner、无必要新服务。Windows受管、WSL -I、坏/缺制品、持久/并发/短窗/隔离与空实例/冻结联合已实际验证，原vendor锁和摘要不覆盖新包且未被修改。

标准构建源码/版本依据：[Hatch构建配置](https://hatch.pypa.io/latest/config/build/)、[Hatchling1.27.0元数据](https://pypi.org/pypi/hatchling/1.27.0/json)、[Python3.12 zipimport](https://docs.python.org/3.12/library/zipimport.html)。公共src/制品分别冻结，缺制品的重建必须先核原sourceDigest、再核原wheelSha256，不登记新摘要逃过检查。

真实空实例跨C/D盘暴露原Rollup12.1.2 TypeScript program按cwd漏源。依据固定[tsconfig实现](https://raw.githubusercontent.com/rollup/plugins/typescript-v12.1.2/packages/typescript/src/options/tsconfig.ts)、[插件入口](https://raw.githubusercontent.com/rollup/plugins/typescript-v12.1.2/packages/typescript/src/index.ts)和失败日志，选择公开tsconfig选项、明确files与相对上游include；保留Rollup4.30.1/TS5.7.3/noCheck/原异常探针，不复制编译器。Windows读取cscli内部POSIX链接EACCES时采用WSL原tar并核链接归属，未遇到工具策略拒绝，不换权限或造第二套恢复框架。

固定源归档/实际许可证、维护及Windows/WSL限制沿原artifacts和新增THIRD_PARTY_NOTICES；发布排除敏感runtime。空实例源构建/激活/ready、同版源码搬迁/回退和真实挑战重启通过；不外推其它OS、新机器安装或跨版本存储兼容。原检测组件/模型研究和首败记录继续保留。

## 2026-10-10 晚间独立化复用纠正（仅方案）

[完整方案第 6–8、13 节](SHIELD_INDEPENDENCE_PLAN_20261010.md)记录依赖结构、发布方式与 review。当前未提交 budget.py 虽直接调用原 PyrateLimiter，但重复了 apps/api/python/browser_use_runner/quota.py 的既有结果适配；此前“未重写 SQL/滑窗/锁”为真，不足以证明没有重复代码。拟移原函数为公共 Python 小包，B-A-T 与盾消费同一固定制品，分别使用各自策略和数据库，不新增限速服务或框架。

标准 wheel 复用已有 Hatchling/build 路线；Hatchling 原声明未固定具体版本，实施 S1 须固定并做最小装载验证。WSL Python -I 使用原显式已校验 wheel 加载，不能只加 PYTHONPATH；B-A-T 安装回执增加共享依赖记录，原 vendor 摘要不自动覆盖新包。以上为 reviewed 设计，未构建/安装或运行验收。本轮未重新选检测模型/引擎，原固定源码、分数及失败证据保留。

## 2026-10-10 盾独立包复用与验收

主线提交dc45be4之后实施，范围及证据见[独立化结算](ANTIBOT_STANDALONE_20261010.md)。Reuse Assessment: capability=原盾独立部署；existing=tools/antibot-lab原npm包/固定制品/systemd；selected=原Node/npm、Rollup4.30.1/plugin-typescript12.1.2/TS5.7.3构建探针，运行zod4.1.8及原四依赖，开发TS5.9.2/esbuild0.25.12/React19.1.1取现有锁版本；public surface=原npm安装/Node TS/systemd环境/固定PyrateLimiter4.5.0 SQLiteBucket；adapter=模块自身源码位置、显式数据配置、盾自有薄预算结果映射；无新检测引擎/模型/服务管理器。许可与原固定源不变；Windows+WSL实际平台保留，系统Python只从原哈希wheels加载预算组件。数据/secret/浏览器所有权不混入Git，普通模型0。B-A-T API反向导入和根依赖被移除，原Go校准测试按字节移入盾tests。107文件仓库外副本独立安装/类型检查/6边界通过；WSL预算跨进程持久拒绝；副本真实服务→冻结原业务7/完整TLS/H2/0模型通过，资源关闭/临时副本及Profile永久删除。未从零重建全套上游二进制、跨天或外站，不扩大验收结论。

## 2026-10-10 B03独立键盘联合判据窄校准

最小在线适配已验：原FCaptcha输入函数与MIT许可按固定URL/SHA登记artifacts；cadence.ts仅做无内容输入形状/有效性与原API适配，均值/方差来自实测时序。原FormAnalyzer会拦截form.submit并按field id/name合并，本项目不复用其整个页面控制器；在现有collector中仅给当前textarea焦点段配对原生时刻，标识仅内存、100键窗口、失焦错误/缺keyup/重复/IME/粘贴保留无效或排除。原整页paste排除在换字段后仍保留。device-1y96mqod六在线控制/业务7与device-73vyfl72容量/恢复边界通过，详见PROGRESS；不把规则的独立正常校准外推为一般行为模型。

此前FCaptcha14个脚本persona不能证明真人误报，但不因此否定每个原函数。复用本地MIT固定56aa2b38b8a5b7333cc7bf7d179a9e14538b2c5b的server-node/inputforensics.js导出checkTypingCadence（SHA256 28c90a5d442eb3a1db5d7922129c7369fe998ae66b6554a087e0ac68de002d32），不启动其服务/下载依赖或改阈值。CMU原DD/H每条11键，51人/408session/20400条、零误报；原快速联合控制触发，粘贴/缺hold/正常hold/慢节奏不触发。d10-fcaptcha-cadence.json保存匿名分组分母、源码/原CSV摘要；缺hold仍须标不可测，不把原函数空数组当阴性。这只验证键盘子规则，B02一般鼠标/行为分类未解决，尚未接在线采集；不拼接独立session满足另一个20键模型的门。

新论文[arXiv2607.26935v1](https://arxiv.org/html/2607.26935v1)说明真实agent与CAPTCHA正常来源、合成bot及事件级特征，作者明确跨控制框架泛化未实测。现有B-A-T已不等于其缺路径点击基线；论文数字不能作为本项目接受率。正文未提供可直接加载的固定模型/实现入口，继续查公开制品；不复刻9401模型搜索、不把异源采样频率当已校准人机规则。

## 2026-10-10 E04重复采样的原告警归属

随后有效性复核：原worker/index.ts:378/382对硬件字段的truthy前置不满足时不运行比较；原adapter以非null作已测，在实际Worker零值控制device-uhxawevt误报clear。仅对齐这两原前置条件，device-xj1ckgem两个不可测/正常恢复与HTTP入库通过。原四条件、版本和阈值不变，不将此子项外推到原语言例外。最后检索的DELBOT/BeCAPTCHA/Lightweight候选仍是已有否决或输入/授权未闭合的实现，没有新的有效模型可直接替换，未重复下载/运行。

固定CreepJS10aa6724的lieRecords是模块累计数组，原worker-client用includes读整个历史，真实同文档恢复后仍假报platform矛盾（device-t93wuxdm）。复用既有哈希锁定workerOptions构建适配：原四比较的documentLie仍执行，同时产生函数局部comparisonLies回执；不改原条件、清历史、重写检测或增加调度器。在线client只读本次回执，缺回执为error。修后device-stlv5a1q三采样及原HTTP入库、device-rzg9ltxb真实交叠Worker/不可用再恢复通过；构建源版本和最小事件适配SHA保存在原manifest。原源文件没有编辑，语言正常切换例外不在本修复中关闭。

## 2026-10-10 B01增强颜色原生入口

固定[Chrome154原ColorPicker](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/core/html/forms/resources/color_picker.js#L1937)的HEX字段支持8位透明度，原FormatToggler用ArrowUp切格式。复用当前ColorWell的AX子树、原DOM.focus/CDP char，既不复制CSS解析器，也不把整数百分比alpha slider当精确128/255。实际Blink增强仅在owned验收Profile显式开启，产品启动不增flag。HEX6/8无损输入已通过；非HEX CSS/P3仍原保真兼容，并修复Watchdog真实blur提交。原ColorPicker输出srgb，无公开原生P3通道入口，不能把压成sRGB的值说成P3正确。

iframe首败来源得到[固定InspectorAccessibilityAgent](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/modules/accessibility/inspector_accessibility_agent.cc#L199)及运行双证据：getFullAXTree未传frameId会用root；同源frame共用session并不意味着同一AX树。按目标backendNode祖先frameId取原树后，同源/OOPIF两入口及主frame正式联合通过。详细分母与首败见PROGRESS。

## 2026-10-10 B01精细range复用与验收

候选已完成最小真实验证并适配：device-v67zt93m四主frame与device-h0030y9a四frame/OOPIF样本、device-zr5pytjb真实取消/焦点变化、6新+10原边界、device-8aimoag3完整HTTPS普通动作采集/盾/业务7均通过。无需新增第三方包；Windows自带UIAutomationClient只承担原生RangeValuePattern，B-A-T只提供原租约/TargetScope证明、目标匹配和两阶段动作/结果校验。DOM实际值才是设值结果，UIA缓存可能滞后；native_range.py/.ps1不输出名称/输入/原错误，只有固定状态。只扩展owned可见窗口能力，其它模式保留原兼容路径；原回退限制不能从文档删除。

## 2026-10-10 N06 JA4L后续源码核验

纠正此前许可表述：FoxIO1.1明确包含个人/内部测试用途，不能仅因其不是BSD就认定本地校准不可复用；对外托管/商业化需另按原条款核验，不随盾独立化自动授权。固定c6469a7b0dbf8fe963810162429fbfd9d1acc4d5的LICENSE及原Zeek JA4L源码/摘要已存upstream/candidate-review/ja4l-c6469a7b。原实现输出TCP/应用时延、TTL和delta，没有给出能排除合法端点处理延迟的bot分类器；此前本地CPU延迟正常反例仍未解决。此轮只核源码，没有安装Zeek/重新捕获流量或修改线上阈值，N06判据仍未闭合，不能将已有测量冒称代理/机器人判定。

此前“Chrome键盘1/100精度不可达”不能直接推出所有原生接口均不可达。固定[AXSlider源码](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/modules/accessibility/ax_slider.cc#L74)覆盖原生range SetValue/input/change；固定[Windows原生入口](https://github.com/chromium/chromium/blob/154.0.8037.98/ui/accessibility/platform/ax_platform_node_win.cc#L3217)将IRangeValueProvider的double传入既有kSetValue。复用[Windows公开RangeValuePattern.SetValue](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.rangevaluepattern.setvalue?view=windowsdesktop-9.0)先做独占窗口小样本；文档明确控件可能规范化值，必须核实际值和原生事件，不能凭接口签名宣称成功。尚未接入产品/新增依赖；精确目标/owner、焦点和取消边界均须另验。

## 2026-10-10 V06 在线collector截止与独立测量

复用原collector的15秒Promise.race及固定BotD2.0.0/CreepJS10aa6724，不改变检测规则。真实业务`device-oken5jnl`在collector已加载且高熵UA调用1次挂起时，三组环境探针均未启动；前两个原型注入影响挑战页的结果不作为此证据。适配把UA/BotD/worker/WebGL独立启动，UA及BotD有界等待，各自保留error/timeout；客户端高熵有效性是可选协议字段，非measured必须null，迟到返回不得重新覆盖已结算状态。上游BotD [notification_permissions.ts](https://github.com/fingerprintjs/BotD/blob/v2.0.0/src/sources/notification_permissions.ts)直接await permissions.query，因此另外验证此原采集挂起和模块加载失败；没有请求权限/采集私有资料。现有对象探针可能观察测试注入，控制必须按具体规则区分，不拿对象替换告警冒充其它检测。修后`device-xvqxowcx`三项通过；7项协议/identity与定点TS通过，迟到/其它失败及正式链联合验收继续，结果见PROGRESS。

## 2026-10-10 D6移动后坐标过期修复

固定[B-U Actor源码](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/actor/element.py)的click在移动前计算坐标，Watchdog同序；新增真实布局反例`capture-o4onzk5y`确认Actor和正式ordinary均在目标移动后点击旧位置，ACK齐全、trusted click落到目标外、业务未执行。该反例第一次移动没有生成多段轨迹，因此不能说只由ghost-cursor引起；附加轨迹仅扩大该间隔。

复用原Element.hover在原点击计算几何之前完成移动，最终原click使用任务局部ContextVar保留上游原移动时序；两入口共用薄适配，不复制几何/遮挡/按下/释放或原回退，不重发已点击动作。8项原指针及新取消/参数/任务隔离验证通过，`capture-_ibc4gyu`两个实际入口均一次点击新中心且业务成功、原input/Shadow/iframe/OOPIF/导航/采集/CDP探针及释放通过。第一次修后布局已通过，但旧夹具查询已销毁iframe报-32001，`capture-qsziupx1`保留；只修测试按当前frame target核活动监听。三个Profile永久删除。连续运动/恶意每次移入移位仍非绝对稳定保证；历史3isei3ss/9jri6mtt缺当次坐标，不能追认这就是其根因。

## 2026-10-10 D2固定denseMatrix的窄筛选

实测`d10-dense-canary-result.json`：原6个human有3个被原0.2阈值误报；bot2可测命中/2不足，空输入不足。按运行前门拒绝，不再扩到47人或在线B-A-T，不把原训练canary当独立效度。运行不到一秒，无训练/调参；锁文件依赖只在owned ignored runtime，校验精确绝对路径后永久删除（d10-dense-runtime-cleanup.json），原制品和报告保留。

Reuse Assessment: capability=一般鼠标行为候选判别；existing=已归档DELBOT1.3.3/TF.js4.0.0及固定712a00ea994738b680b0b11bb4b518979385d07b源码/原制品；selected=candidate-only denseMatrix（不是已失败的convolutional）；public surface=TensorFlowModel/DataMovementMatrix/Recorder.isHuman，原像素/原0.2阈值。MIT根许可证与npm Apache字段差异继续保留，两者源码证据不改；纯JS临时运行，Windows、无浏览器/产品状态/模型调用冲突。只适配本地固定制品载入，不写模型/特征算法。预定门：10条原canary只作管线否决、不当独立准确率；任一可测human误报即停止，后续独立47人及各类bot既定门不放宽。旧失败模型不重跑、不调阈值、B-A-T不参与选型或训练。

## 2026-10-10 D6正常事件委托造成假缺失

原document捕获监听晚于页面既有委托，后者可以先完成业务并调用stopImmediatePropagation。真实Chrome组件首败`capture-3n7jxb8q`确认业务完成、采集missing/0，不能把这种采集缺失等同没有派发。复用[WHATWG DOM事件路径](https://dom.spec.whatwg.org/#concept-event-dispatch)，只把既有隔离世界监听/解绑移动到window capture，原生事件内容/目标验证/浏览器派发均保留，captureBoundary如实为window_capture。没有覆盖页面函数或重新实现事件系统；更早的window阻断仍可能不可采集，不宣称绝对完备。

`capture-80gvc5n8`原点击/输入/Shadow/iframe/OOPIF/导航/监听清理/固定fpscanner CDP阴性通过；`capture-dlbtft9u`另补正式OrdinaryCapability委托点击验证通过，0模型，全部临时Profile永久删除。原12轮`combined-w_9poft8`仅说明当次未重现历史故障；这些新反例均不能追认为3isei3ss/9jri6mtt已定因。

公开同类调查：[B-U #5469](https://github.com/browser-use/browser-use/issues/5469)报告Input成功而DOM无事件，但其routing修法在browser-harness CLI；本项目走固定Python SDK，不能用升级CLI结算。行为候选[Charweb](https://github.com/Sg-fit/Charweb)数据规模和未见bot类别召回不足、[cside说明](https://cside.com/blog/catching-bots-that-dont-want-to-be-caught)未公开判据/权重、[AegisNano](https://huggingface.co/anckursingh/aegis-nano/blob/main/README.md)所链源码当前404，均未安装或冻结；BeCAPTCHA申请限制与既有DELBOT输入核验复用旧记录。当前不把继续搜到宣传材料当分类器进展。

## 2026-10-10 D6动作失败诊断丢失修复

复用已有OrdinaryCapability/NativeEventCapture/event_target_error和Runner安全诊断契约，不替换B-U输入、等待、取消或错误语义。真实源码路径中complete成功后，dispatch抛错与Tools返回error两种分支丢弃采集结果；Runner仅捕获RuntimeError，另使TimeoutError/取消的派发统计缺失。最小离线原函数调用先复现，再经原AuthorRequestLoop输出口保护错误类型、计数和敏感文本边界；11项定点验证通过，首次与修复中暴露的第二缺口日志分别保留。LOCAL-CHANGES按原LF摘要更新两个自有适配文件。此修复只保留已有失败证据，不补造事件、不重试动作、不宣称历史零事件根因已定位。详见PROGRESS当前包。

## 2026-10-10 D2新候选OpenSentinel源码筛选

固定[de86cee82b11c92d2a9c8edb890b7b7bfaa7b2bf训练源码](https://github.com/Azanian-Eagle/OpenSentinel/blob/de86cee82b11c92d2a9c8edb890b7b7bfaa7b2bf/scripts/train_model.py)、LICENSE和实际Git树：MIT、最近提交2026-10-05，确有15916字节ONNX。训练“human”全部由五个特征区间独立均匀随机生成，bot亦由三个手造区间生成；随机划分后的合成测试准确率不能当真人/跨源校准。输入还要求同session鼠标与键盘两通道，现有独立鼠标样本不能无依据补造键盘值。源码/树与SHA保存reports/d10-opensentinel-source.json及d10-opensentinel。不安装其Rust服务/ONNX依赖、不执行或重训模型，不把“发现制品”升级成一般行为分类通过；当前仍无满足原误报<=1%、每类召回>=80%及输入契约的已验证候选。

## 2026-10-10 E05/V06原异步探针的截止适配

固定[CreepJS10aa6724音频实现](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/src/audio/index.ts)的getRenderedBuffer/hasFakeAudio只等待complete；原creep-entry顺序await会阻断之后的fonts/media。复用原算法，适配只用原生Promise.race/setTimeout为各模块加4000ms截止并在finally清计时器；timeout字段lied=null，不改变任何bot判据。底层原库没有取消接口，页面生命周期释放上下文，不能称超时已经取消采集。

input-1dtqriin实际页面将OfflineAudioContext.startRendering保持pending，8秒后整probe仍无输出；input-a2s_ywt8修后四控制正常/挂起/缺API/恢复分别measured/timeout/unavailable/measured，五模块均有状态、fonts/media正常。所有Profile关闭/永久删除。原online webglIntegrity函数不变；Rollup固定构建的新SHA25c738c8b7533606916d5a4b3b18ee68b73c207f27ed16c7a02766def8264f23已由原readProbe摘要校验加载。初次未设BAT_RUN_OWNED_INPUT仅为测试入口错误、未创建浏览器，实际首败另存。

## 2026-10-10 普通Worker暖恢复的Fetch协议边界

公开检测`launch-xmemt5nr`暴露专属恢复失败；原owned浏览器上普通worker返回-32601，page/shared_worker可执行Fetch.enable。固定Chromium[33a59a99普通Worker](https://github.com/chromium/chromium/blob/33a59a9936447ff271246583d88c785ac04f14dd/content/browser/devtools/dedicated_worker_devtools_agent_host.cc)仅注册IO/Storage/Target/Network；[所属frame更新实现](https://github.com/chromium/chromium/blob/33a59a9936447ff271246583d88c785ac04f14dd/content/browser/devtools/render_frame_devtools_agent_host.cc#L1153)通过DedicatedWorkerHostsForDocument同时更新普通Worker的factory。源码快照不是本机Chrome精确构建，行为以本机实证为准。

Reuse Assessment: capability=已拥有专属Profile恢复准入；existing=RequestGate/refresh_owned_factories；selected=原Chrome Target/Fetch及B-U0.13.8；adapter=只向有原生Fetch的page/iframe/service_worker/shared_worker发送空patterns更新；普通worker由所属frame更新，不吞协议错误、不创建第二个拦截器；license/runtime/state=原BSD/Windows、既有owned租约、0模型；validation=launch-slgmue3l复现首读成功但恢复失败，launch-iii6q3cm同worker恢复后8请求仅1个实际到达，累计2且7拒绝，原页面与Worker不刷新/不重建。

日常启动暂停修复同时已由launch-wtikdgwi完整4183两模式三业务/37条检测对照、admission-6yq2qg50原iframe初始配额/429/click/release证明。公开静态23/交互26信号两模式均阴性；专属恢复首败另列，不重跑外站制造全绿。

## 2026-10-10 日常扩展iframe启动暂停误伤普通Worker

本轮可见Chrome154.0.8037.98实测：`launch-m_quzfvj`专属三业务通过而日常挑战不提交；`launch-73ikba4_`扫描器已完成；`launch-31lgvvut`5个原Worker零message/error/附着事件；原relay命令明确为waitForDebuggerOnStart=true、filter只包含iframe。仅诊断关闭iframe启动暂停后日常三业务/恢复通过。原规则、PoW难度与扫描器不改，不将诊断旁路算准入验收。

[Chrome debugger官方接口](https://developer.chrome.com/docs/extensions/reference/api/debugger)提供父tab下flat子session。Chromium[固定修复86f02ace](https://chromium.googlesource.com/chromium/src/+/86f02acec0a7e06df10c197b97a1ea0666eb311b)记录filter排除worker却先暂停的同类死锁；[固定target_auto_attacher源码8b96632e](https://chromium.googlesource.com/chromium/src/+/8b96632ef93385dbf3039bb44b9447240102dbd9/content/browser/devtools/protocol/target_auto_attacher.cc)的RendererAutoAttacherBase先向renderer传wait标志，ChildWorkerCreated再DispatchAutoAttach。前者修复service/shared等路径不自动证明本机普通Worker路径已修；运行证据独立保存，不把源码快照冒称本机精确构建。

复用现有TargetScope/B-U0.13.8/Chrome debugger，无新库。薄适配把普通worker加入当前owned父session的autoAttach过滤，仅接收本次附着事件→原Runtime.runIfWaitingForDebugger→Target.detachFromTarget；不加入页面owned集合或SDK目标池，不启用Worker Runtime/Fetch，不接管shared_worker/service_worker。iframe继续暂停到原准入就绪。验收必须包括原日常完整盾业务、iframe初始配额/429、外部父session和共享Worker拒绝、父session释放撤销待恢复权限；全量替代和历史点击根因分别结算。

## 2026-10-10 共享SW主线源码补证（未解决，未扩大拦截）

复用原15x6cgt6漏门、h3uhf2i6无关页误伤、qhexxnlq同URL四请求的运行证据，不重复浏览器实验。固定CDP源码`8033bef7599713ae32b8777386fcbd82a7e612ed`：[Fetch](https://github.com/ChromeDevTools/devtools-protocol/blob/8033bef7599713ae32b8777386fcbd82a7e612ed/pdl/domains/Fetch.pdl)、[Network](https://github.com/ChromeDevTools/devtools-protocol/blob/8033bef7599713ae32b8777386fcbd82a7e612ed/pdl/domains/Network.pdl)、[ServiceWorker](https://github.com/ChromeDevTools/devtools-protocol/blob/8033bef7599713ae32b8777386fcbd82a7e612ed/pdl/domains/ServiceWorker.pdl)。networkId能连接同一请求的协议事件；controlledClients是worker客户集合，不是每条请求的因果页面字段。实际worker记录中的loaderId为空、frame/initiator未区分两页面，与协议没有矛盾。

固定[Chromium ServiceWorker.postMessage源码](https://github.com/chromium/chromium/blob/3cd4500069b0eaa3dd5da1c6b98ff2a718b22f3a/third_party/blink/renderer/modules/service_worker/service_worker.cc)没有发送方异步栈赋值。不能据此宣称所有浏览器实现都不可能；当前没有证明可复用的跨消息逐请求归属链。Playwright[官方SW路由说明](https://playwright.dev/docs/service-workers#network-events-and-routing)也把SW请求和Frame请求分开：透明转发的Frame请求不直接可路由，SW拥有的请求没有Frame API归属。Chrome [webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)的documentId可选、无相关标签时tabId为-1，未给出消息触发fetch的因果保证；没有因此增加扩展权限。

原fixture只有message处理器，不含fetch处理器，结论限于已测message→fetch；不能把透明转发说明写成已做新的真实实验。当前不采用URL/时序猜归属，不把附着tab等同请求方，不扩大共享Profile拦截、不禁用SW、不替换用户选择的浏览器模式。静态补证保存在`work/antibot-service/reports/d8-mainline-source-audit.json`，含每文件SHA/commit/摘录；未新增依赖或产品实现。关闭条件仍为实际任务配额生效且同Profile无关页面不受损，当前未达到。

## 2026-10-10 E05剩余字体有效性（实施前）

固定CreepJS字体源码getPixelEmojis内部catch返回emojiSet=[]/pixelSizeSystemSum=0，当前适配当measured；getFontFaceLoadFonts的原Promise.allSettled永不settle时整probe卡住。复用现有固定SHA Rollup诊断插件/原函数，新增该次emoji catch状态及仅枚举等待的有限采集预算，采用标准Promise.race与finally clearTimeout；不修改字体清单、判断算法、浏览器API或bot阈值。超时只标本次字段timeout/partial/lied=null，emoji与其它模块继续保留；不重试、不宣称底层Promise可取消。独立真实页面先复现layout-error和pending，再校准原生/恢复与异常边界。只改实验测量出口，已校准在线webglIntegrity逻辑保持原算法，无产品模型调用、个人字体或音视频内容落盘。

结果：input-q4xyyn1c实际复现emoji异常仍measured/false、FontFace.load永不settle令8秒外层诊断返回probe-pending；修复后input-8f7xtlpn八控制通过：原生、布局异常、永久pending、check/constructor/同步load异常、合法空清单、恢复。3秒枚举采集截止只将该组字段标timeout，emoji保留；emoji错误只影响其两字段和完整判定，枚举保留。bundle 05c0ab6a1aee2eb4b9655e50307853b3bf9529d759dadf27b137c23c1ff12630，原在线webglIntegrity函数未变；两浏览器关闭/Profile永久删除、0模型。首次命令遗漏测试环境gate发生在资源创建前，d4-font-remaining-first单列，不改gate。多硬件/整体模块无限等待的外层有效性仍不由本控制外推。

## 2026-10-10 D3准入层新首败：已消失的拦截ID污染后续请求

N06加载后H2完整入口9控制及独立解码通过；combined-xm_khvq1实际B-A-T在导航前ERR_BLOCKED_BY_CLIENT。sgp9t_pw被动栈定位Admission.decide→Fetch.continueRequest；再采原CDP固定错误字段确认-32602/Invalid InterceptionId.，随后self.failure把另一Document也拒绝。不归因RTT规则（未新增）、Windows权限或策略耗尽。插入探针安装步骤的t5huyu8j可到业务，只说明时序差异，不当修复。所有运行保留关闭/永久删除证据。

Reuse Assessment:
- capability: 已取消/失效的原生Fetch拦截与真正准入状态错误分离
- existing implementation in repository: Admission调用原CDP continueRequest；所有异常目前均永久污染gate
- mature candidates and pinned versions: browser-use0.13.8/cdp-use1.4.5；Playwright1.61.0 crNetworkManager.ts RouteImpl.continue/catchDisallowedErrors
- selected implementation: 保留原SDK/单一Fetch责任方，沿成熟实现的已取消请求容错语义做更窄的协议边界适配
- reused public surface: 原Fetch.continueRequest与CDP -32602 Invalid InterceptionId.；[固定源码](https://github.com/microsoft/playwright/blob/v1.61.0/packages/playwright-core/src/server/chromium/crNetworkManager.ts)
- B-A-T-owned adapter and remaining gap: 仅原continueRequest送达阶段的准确错误记interception-gone，不重发/退款/放行新请求；准入检查、策略/存储错误及其它CDP错误仍原失败关闭；委托原责任方不更改
- license/runtime/platform fit: 原库均保留，参考Apache-2.0实现的协议语义，不移植网络管理器
- browser/runtime/state ownership conflicts: 无新浏览器/代理或全Profile接管；只处理原已拥有请求的发送结果
- replay model calls: 0
- rejected candidates and evidence: 统一吞RuntimeError或给每次导航加等待会掩盖真正错误；重发/改配额不符合原契约
- focused validation: 首次失效ID后下一合法请求仍可继续，未知CDP/存储/策略错误不能变成成功；真实完整入口业务及异常盾控制

Product Alignment:
- natural-language task: 页面导航选择与表单提交中，已失效网络请求不能污染后续合法动作
- reusable chain boundary: 原普通节点/原RequestGate不变
- runtime inputs: 既有Fetch暂停请求和原生协议返回
- dynamic task outputs: 页面实际读取、选择与提交结果
- generic platform capability used: 原访问准入及错误生命周期映射
- replay model calls: 0
- site/task-specific code added: no

实际验证：d3-admission-delivery-first四边界中失效ID后gate污染先失败，其余3过；修复后四项及原cancelled_admission通过。admission-ipm9qi78真实8并发、耗尽前2到达、缓存、重定向2到达、真实短到期、独立origin和坏策略零放行通过。combined-kdul8ku5导航已恢复、两次click均有原生事件，但原测试马上goto下一case，两个链接请求未到源站；补等待原URL提交后rcnw6e22三业务结果正确、异常标记/脚本输入和缺探针仍有效。随后旧断言把同批行为健康行当重复输入，修为仅检查本包单一input行。最终combined-7dsjtysf完整通过：三业务、34原生事件、12 TLS/H2记录、零协议误报、原异常仍命中，遥测并发202/400及重启后400、missing→timeout有效，0模型。origin由原验收流程重启；窗口关闭/Profile永久删除确认。不能将此夹具导航取消等同历史3isei3ss零事件根因。

## 2026-10-10 D6完整链新首败：指纹采集等待AI可用性

新诊断需要受影响链回归；为保留SaTblJ全部原证据，用原SQLite backup+manifest复制到新owned实验目录（不是Git worktree）。product-d6-counters-3DrRmg首次在collection-a-0003等待30秒后hybrid_read_fields_runtime_error，未到点击。源站记录只有初始挑战/两个脚本，无submit/业务opened。W24bS3给原scanner外层加只记完成状态的诊断仍复现；UCmXxO按固定原函数名投影7异步子项，只有ai=pending，媒体/键盘/高熵/WebGPU/Canvas/Worker完成；页面visible且focused。原3isei3ss/9jri6mtt点击首败仍是另一问题，不能混淆。

CrowdSec909b515固定submodule为fpscanner c701505f1d755d24e2be99ad269283c79e3a0ee7。实际src/signals/ai.ts对非Opera依次await Summarizer.availability()和带language参数的availability，没有超时；上游ce79dc8（2026-07-02）只以Opera例外解决同类挂起，不能照抄成Chrome豁免。原库collectFingerprint用Promise.all，任何此类pending会卡整个挑战。公开Chrome文档说明availability只查状态、create才触发实例/下载，本轮没有调用create/模型。requestIdleCallback不存在，媒体不可见猜测也由当前测量排除；不以猜测归因用户切换窗口。

独立ManagedWindow+原B-U的combined-1yizyjtm为scanner约2.8秒完成、3.9秒到业务；精简env对照f5t1x_4g也成功，排除环境裁剪。Profile路径125字符的k4r3_ghs成功；正式布局138字符的6c79kgnq挂起36秒。保留同样深Profile，仅Chrome TMP/TEMP/TMPDIR改为本次owned较短目录的pnukyewj于4.06秒进入业务，说明问题位于临时路径。w8740b7u原深临时目录再现，并记录Chrome154.0.8037.98 unzipper_impl的writing_assistance配置文件FILE_ERROR_NOT_FOUND；不是模型推理调用。Windows具体下层长度上限尚未独立证明，不把它归因权限。所有浏览器关闭/Profile永久删除；k4r3_ghs首次cleanup断言只支持浅目录，补精确路径核验后单独完成删除，未重跑业务。

Product Alignment:
- natural-language task: 动态目录选择与表单任务均需真实Chrome功能和稳定资源生命周期
- reusable chain boundary: 原发布链/浏览器owner边界不变
- runtime inputs: 原Profile、owner、宿主临时目录
- dynamic task outputs: 原页面读取/选择/点击结果
- generic platform capability used: 专属Chrome临时目录随浏览器而非Runner存活
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 深工作目录下Chrome临时文件能力与handoff/恢复/收尾
- existing implementation in repository: ManagedWindow把Chrome TEMP嵌在Profile下以免占用Runner临时目录；长路径已实测退化
- mature candidates and pinned versions: Python现有tempfile.mkdtemp/shutil、原ManagedWindow owner/lease/psutil关闭核验；Chrome154.0.8037.98
- selected implementation: 标准库原子创建短临时目录，路径写入原租约，沿原进程生命周期删除
- reused public surface: tempfile.mkdtemp、shutil.rmtree；Node os.tmpdir只传宿主根，不继承Runner临时根
- B-A-T-owned adapter and remaining gap: 增加临时目录归属标记/路径校验，handoff保留，确认进程关闭后删除；恢复及共享专属进程沿原lease迁移
- license/runtime/platform fit: 标准库既有依赖，无新增浏览器控制器或系统配置
- browser/runtime/state ownership conflicts: 不改Profile/日常浏览器/原Chrome参数；拒绝链接、异属目录，不做共享TEMP扫描或全局清理
- replay model calls: 0
- rejected candidates and evidence: 直接使用Runner TMP会破坏handoff；只缩项目文件名或Chrome AI豁免会掩盖通用缺口；8.3别名不保证卷启用
- focused validation: 归属/未确认关闭/恢复和失败清理边界，真实深Profile冻结发布链，原handoff输入保持；盾不变

修复后product-d6-temp-CQbajs四冻结变体通过（7/11/13及无合格99拒绝），普通0模型、11条H2正常、四execution清理confirmed、四Profile永久删除；d6-temp-handoff-real同session/tab跨Runner保留/恢复并确认TEMP最终不存在。7新边界（实际Windows junction拒绝，无skip）/7原策略/API check通过。test_window_replay首次8/11，3项daily旧夹具仍期待全局owner锁或依赖本机Chrome存在。按现有独立owner收据契约改夹具并显式模拟存活后9/11；余2项需要Browser.getVersion模拟，补齐后仅重跑inspect两项通过。d6-temp-replay-boundary、d7-window-replay-fixture-final、d7-window-replay-inspect-final保留各次结果；未改daily产品代码或隐去首败。原3isei3ss/9jri6mtt仍未定因。

## 2026-10-10 E05内部采集异常诊断

原fontEnumerationValidity只查API存在，不能看到原CreepJS内部catch。固定src/fonts/index.ts的getFontFaceLoadFonts在check、constructor或同步load抛错时直接返回[]；Promise.allSettled的缺字体拒绝则是合法空清单。既有夹具新增三异常+正常空清单/恢复先复现。最小适配复用原Rollup load插件模式，仅把局部catch是否发生作为该次fonts返回值的布尔诊断，原算法/列表/判据不动、不包装浏览器API；adapter把相应字段映射error/partial，保留emoji结果。锁定源文件SHA，源码变化拒绝构建；新增诊断不成为bot评分。无需新依赖/产品模型/个人字体日志，属于已授权E05测量错误边界。

input-t37b30h0先复现三异常全部measured；适配后input-r9us7edk六控制通过，三异常error/partial、合法空列表与原生/恢复measured。两个owned Profile均永久删除，0模型；新bundle摘要f9636312，原源码仍ce2bcefd，构建回执记录适配摘要。WebGL原导出不变，没有扩大线上处置范围。

## 2026-10-10 N06 RTT复用审计（未冻结）

H3补证：rtt-quic-f8u5onls原quic-go0.55.0单请求200，但fc_rtt(us)=0、source=unavailable，首次断言错误地期待所有本地QUIC均正数。固定HAProxy源码quic_loss-t.h的srtt/rtt_var本身是整数毫秒，不能因导出us称微秒分辨率；原日志缺样本显示“-”而非HTTP响应夹具的空串。保持生产字段/分类不变，只在原测试发送器的标准net.PacketConn加20ms收包延迟（原quic.Transport、TLS和HTTP3不变），rtt-quic-lqt7u7f9实测24000us/11000us方差、direct-quic；TLS指标仍unavailable。两客户端退出、未创建浏览器/新服务，无网络系统设置变更；零值不当零耗时正常或机器人。该控制只校准字段和分辨率，不是公网/真实Chrome H3重测或代理判定。[固定quic-go公开Dial接口](https://github.com/quic-go/quic-go/blob/v0.55.0/client.go)。

候选7780205e十控制rtt-native-a5jt8c5n已实测：TLS1.2/1.3冷连接及1.3恢复可测，TLS1.2恢复的原API返回-1/error，不补0；延迟客户端处理200ms也会令TLS值约201ms，而HTTP等待200ms不计入TLS。首跳值经TLV与内层回环值分开，缺TLV为空/unavailable。首轮s3gs1pxl误期待所有恢复可测；第二轮a5jt8c5n明确错误码后只复验已保存十条，不重发请求。miu1wkg2在构建未结束时误验证旧候选，未启动进程；配置f-string单括号语法首误也保留。两实际临时unit及4196/4197/4198均关闭，无浏览器/个人数据。

N06被动字段已激活，rtt-activation-CASuwj保存旧binary/config/receipt与新摘要；维护脚本误用systemctl start已被--collect回收的临时unit，后续catch stop又遮蔽原错误。原lab start成功恢复edge9161/ready，其余四服务未停；d1-rtt-activation/recovery均保留，不记无首败。正式lab激活入口现保留校验rtt摘要、明确传候选能力，旧/首次/坏摘要边界与定点TS通过。h2-integrated-mm4ts75g原9控制/独立解码/来源与容量边界通过。没有新增CrowdSec RTT判bot规则。

原BADPASS论文的50ms差值是其网络数据上的阈值，不得照搬成本站真人判定；本轮客户端处理延迟反例说明需要分开解释。CalcuLatency正式论文还用WebSocket/ICMP/0trace等层；censoredplanet/calculatency-code固定18b0248f无根LICENSE，公开树是评估/抖动数据，并非完整成品分类器；zerotrace-code固定3f511496为MPL-2.0的主动TCP路由测量器，不是本轮被动计时的替换。不部署主动公网测量、云或跨天；RTT公开判据/真实正常网络校准仍是未关闭子项。

后续源码核验找到可直接复用的正式API：[OpenSSL3.5 SSL_get_handshake_rtt](https://docs.openssl.org/3.5/man3/SSL_get_handshake_rtt/)。现有HAProxy3.2.9实际编译/运行库均3.5.5，固定头文件含此函数；HAProxy固定ssl_sample.c没有导出它。其值含端点处理时间，不是纯网络传播。BYU候选ae6b3148的旧3.0.5补丁无单独LICENSE且已被正式API替代，不安装旧deb/重写计时。此前“未取得TLS计时”调查缺口由本条更新，判定和真实网络反例仍未关闭。

Reuse Assessment:
- capability: N06首跳传输RTT与原TLS握手RTT测量，不等同代理或bot判定
- existing implementation in repository: 固定HAProxy扩展构建、原PROXY v2 TLV、OpenSSL3.5.5已存在
- mature candidates and pinned versions: HAProxy3.2.9-1ubuntu2.2 GPL-2.0-or-later；OpenSSL3.5.5 Apache-2.0；既有artifact完整性锁
- selected implementation: 原fc_rtt(us)/fc_rttvar(us)及SSL_get_handshake_rtt；先在独立候选进程校准，不提前激活
- reused public surface: OpenSSL原计时/错误返回，HAProxy原sample和PROXY TLV
- B-A-T-owned adapter and remaining gap: 只导出原值和可用性、传递首跳值；不另造计时器/网络解码器/分类引擎；判据/正常网络泛化仍待校准
- license/runtime/platform fit: 沿用既有Windows客户端+WSL本地盾，无新增系统包或远程服务
- browser/runtime/state ownership conflicts: 候选另用runtime子目录，原binary与五服务不变；临时user unit/回环端口均记录owner并finally关闭
- replay model calls: 0
- rejected candidates and evidence: 旧BYU补丁已被正式API替代；JA4L不套JA4许可；内层fc_rtt只代表回环转接不能当首跳
- focused validation: TLS1.2/1.3冷/恢复、单纯HTTP等待反例、TLS客户端处理延迟、PROXY来源一致和缺失；只记录元数据，不落报文/Cookie/密钥

现有HAProxy3.2.9可直接复用[fc_rtt(us)/fc_rttvar](https://docs.haproxy.org/3.2/configuration.html#7.3.3-fc_rtt)：TCP为内核RTT，QUIC为平滑RTT；不是TLS应用握手耗时。当前TLS端口前还有owned_hello TCP转接，直接在内层读TCP RTT会把回环代理当原客户端；需首跳取值并经已有PROXY TLV传递，不能先填报“已测”。[BADPASS原论文](https://www.eurecom.edu/publication/7056/download/sec-publi-7056.pdf)区分TCP/TLS RTT；当前未取得与此匹配、经正常CPU/网络变化校准的原TLS计时实现。单个RTT不能当真实地理/代理/bot证明。

JA4L候选的[原实现/许可证](https://github.com/FoxIO-LLC/ja4/blob/main/LICENSE)属于FoxIO1.1，不能把JA4的BSD许可套到JA4L；当前不新增依赖或自写等价算法。已固定Kitsune f0a22b3 registry中没有可直接启用的通用RTT差异判据，宣传页不当源码证据。N06此项继续作为具体复用/校准缺口，不自动归入外部豁免；本次未改edge配置或重启服务。

## 2026-10-10 D5/V04本地Privacy Pass协议验收前置

真实issuer未配置只阻塞外部信任，不免除本地协议检查。本轮复用已下载官方0.9.0源码及RFC9577/9578；registry的gitHead确认为4edc0e2bf639a60142a3f809d38ce7bd5c6f8c9e。先在独立ignored协议依赖目录安装固定发行包（禁安装脚本），沿原Client/Issuer/Origin跑本地2048-bit RSA盲签及错误路径；没有Attester，不伪造设备证明，不调用fetchToken/远程issuer，不让实验token绕过原CrowdSec。

Reuse Assessment:
- capability: V04公开Privacy Pass本地发行与验证协议、错误边界
- existing implementation in repository: 原web-bot-auth独立校准及PAT子资源401/403归因；Privacy Pass此前只有源码审计
- mature candidates and pinned versions: Cloudflare privacypass-ts0.9.0 / 4edc0e2b；RFC9577/9578，官方原协议测试向量
- selected implementation: 先候选校准官方发行包，未经最小样本不冻结生产选型
- reused public surface: publicVerif.Client/Issuer/Origin、Token/TokenChallenge、原HTTP header编码
- B-A-T-owned adapter and remaining gap: 仅实验编排和证据；原Origin.verify只验证签名，挑战/issuer绑定与一次消费需单独验证，不重写密码算法
- license/runtime/platform fit: Apache-2.0，Node>=20，当前Windows Node；依赖lock/官方完整性核对
- browser/runtime/state ownership conflicts: 本地进程内合成issuer，无浏览器/持久私钥/个人身份/远程网络验证
- replay model calls: 0
- rejected candidates and evidence: Web Bot Auth证明签名agent身份，不能替代Privacy Pass；真实签发/硬件信任不在合成样本中冒称
- focused validation: 正常协议、错签名/密钥/nonce/digest/type/长度、重放与跨挑战；先保留原库实际结果，再决定是否需要薄边界适配

private-token-tCqAF7实际盲签/headers往返与10错误控制通过；原库跨Origin/重复签名验证仍true，尾随token/challenge字节被忽略、空issuer可构造、非零byteOffset失败。这些不是完整Origin的验收通过。按[RFC9577 2.2.3](https://www.rfc-editor.org/rfc/rfc9577.html#section-2.2.3)在private-token-verifier.mjs添加应用边界：调用方固定issuer公钥/已签发challenge，长度先验、独立buffer、digest/keyID一致、原verify、原SQLite唯一约束消费回调。原crypto/编码没有复制或修改，不按客户端声明发现issuer，不新增信任根。

private-token-binding-NuBy9F：13控制通过；有效签名错上下文、错issuer配置、nonce/key/digest/signature改动、超长/短/缺失/过期都拒绝，无效票不消费；有效offset可用且重放拒绝，SQLite重开连接后仍拒绝，8并发仅1接受，存储异常拒绝。只落hash、摘要和布尔状态，私钥/原token不落盘。现冻结官方库用于独立本地协议夹具及薄边界适配，通过原prepare-fixtures复制固定lock、禁安装脚本；没有在线路由或真实Attester，硬件/issuer信任仍未验，数据库重开不冒称完整服务重启。

V04后续独立进程验收private-token-binding-9cXGhp：首个Node验签消费后退出，另一独立进程同票拒绝；八进程竞争另一张合法票仅1次成功，十进程全部退出且SQLite只存两个摘要。合成公钥/挑战/票据只经IPC；不重跑已过13控制，不当断电/分布式或真实issuer证明。入口沿原校准器--processes及private-token-process.mjs，未新增在线旁路。

## 2026-10-10 D4/E05字体API缺失有效性（先复现）

固定CreepJS10aa6724的src/fonts/index.ts:getFontFaceLoadFonts在FontFace或document.fonts.check不可用/抛错时内部catch返回[]，外层仍返回含emoji测量/lied=false的对象；现有creep-entry仅凭对象存在把整项及空fontFaceLoadFonts标measured。真实缺口是采集不可用被误记阴性，不是缺少真人概率模型。

先在既有独立probe里删除本地页面FontFace能力复现，随后最小适配只读取原能力是否存在/读取是否抛错，并给字体枚举字段区分measured/unavailable/error；保留正常空数组、原emoji字段和所有原检测判据。复用固定CreepJS、原Rollup/noCheck、原owned-input启动/finally；不访问个人字体清单/音视频、没有新库/外发/模型调用，不扩冻结访客网站。验收为原生、FontFace缺失、document.fonts缺失、getter抛错、OfflineAudioContext缺失与恢复；缺失/错误不能标正常，同机控制不冒充多硬件。此项仅盾测量适配，不改变产品链路。

实际首败input-dmz1osjc：no-fontface仍fonts.measured且lied=false。更早input-g_juv8c1为原Page.evaluate不支持async单参数箭头的测试格式错误，单列保留。修复后input-vptp3hlz七控制通过：原生/恢复/有效空清单measured，FontFace/FontFaceSet缺失字段unavailable，getter抛错error；部分测量父级partial且lied=null，emoji保留measured；OfflineAudioContext缺失仍unavailable。只修creep-entry能力映射、重建原bundle，未改原规则/在线WebGL导出/产品输入。三次owned浏览器关闭及Profile永久删除确认，0模型。未覆盖所有FontFace.load内部失败，也不称多设备校准或整个E05完成。

## 2026-10-10 D2新增公开候选：先离线校准，不装入盾

进一步静态核验：not-a-robot0.1.0发布源码SHA256 a3822a74fb62e51a48b8e05f687d3a4a545525a8bf59fe03d98dbdac92d55ce5实际MIT/Alpha，BotDetector默认CalibratedClassifierCV+RandomForest，score在未fit时抛错，发行38文件无预训练权重；不是新可直接运行的分类模型。未安装/拟合/调参，源码/许可/receipt在candidate-review/not-a-robot-0.1.0，不能把同一批旧数据重新拟合作新盲测。behaviorDNA固定4dd0ba0bf00036c7d490a4815d3f86270f9020c0完整树无LICENSE，权重为DVC引用；该游戏识别候选未接入、未下载DVC模型，不外推浏览器bot准确率。[发行来源](https://pypi.org/project/not-a-robot/0.1.0/)、[固定候选树](https://github.com/Lo1s/behaviorDNA/tree/4dd0ba0bf00036c7d490a4815d3f86270f9020c0)。

后续只读筛选：BotSight固定5c09da65无LICENSE/预训练权重，需训练；Behavioral-Biometrics-Bot-Detection固定c48e77fd无LICENSE文件/权重，README宣称不当许可或验收。palisade固定440ed12f实际baseline.go只有请求量、序列间隙、导航类别、外部判定等粗规则，没有通用鼠标分类器；server AGPL3/sensor Apache2、Go1.27、六源码/许可及摘要留candidate-review/palisade-440ed12f。其新凭据/检测引擎会重复现有CrowdSec职责，不为B02引入整套系统。均未安装/运行，不以静态拒绝冒称算法校准。

Mouse-BB-Team/Bot-Detection固定4438d8ccec1baaa22f3357213e6d52a62ff6d618（2020-12-24，MIT）实际inceptionV3.py仅ImageNet特征+新Dense层并调用fit，Git树无已训练人机模型；不是可直接使用的分类器。Lightweight固定618f2b35树内确有ONNX和PTH，但无LICENSE，原客户端明文human信任缺陷仍在；不将这次源码检查冒称模型已校准或下载安装到产品。

新候选[bot-signal2.0.18](https://github.com/okasi/bot-signal/tree/5cda0e5fb6e39840b66d253321cdee2d9b03e757)最后提交2026-10-05，MIT，TypeScript；公开analyzeBehavioralSamples可独立消费保存轨迹，原analysis/scoring纯函数没有网络、浏览器或状态所有权。已核原源码、阈值/样本要求和collector；只下载固定六个源码/许可文件到ignored candidate-review，不运行其安装脚本、浏览器collector、服务/IP模块，不替换CrowdSec。它是固定加权启发式，不把score称真人概率，也不凭Star/README证明成熟。

运行前固定：沿用原47人2776段AdSERP末500点及原adaptive非增强跨来源样本；不修时钟/插值/改变坐标，少于6点或非递增时钟独立记不可测。仅校准鼠标几何/时序子集，原数据没有isTrusted/movementX/screen等字段；统一禁用synthetic事件线索（isTrusted=true只是此离线控制条件，不是实际trusted证据），其它缺项不补造，点击/键盘/触屏空集。原0.55阈值、固定权重均不改；不训练，既有开发数据不是新盲测。先正常反例，再报告每类bot召回，沿原正常误报<=1%、每类>=80%门，仅满足也不能越过缺字段及在线校准门直接上线。新依据是原实现新增滑窗线性/快速跳跃组合，不重复失败RF/motion/DELBOT。

behavior-bot-signal-xUHcww实际结果：AdSERP2772可测/4无效、跨源human203可测/1无效，均无误报；10类bot415可测全部漏检，23不足/1坏时钟分列。固定启发式在只有原数据x/y/t的条件下未过召回门，不能作为一般鼠标分类器接盾；也不外推该库含点击/键盘等其它输入的整套行为能力已经被否决。没有训练、调权重/阈值、追加模型或B-A-T浏览器试跑；六个源码文件和报告留ignored，未安装任何运行依赖。

## 2026-10-10 D6输入未发送与超时取消的被动诊断缺口

三份历史首败分别有页面零事件/无业务请求、普通链ordinary_event_target_unverified，但无当次Input发送/取消证据，无法凭后续四次成功定位根因。当前只有成功ACK计数；固定browser-use0.13.8的actor/element.py及default_action_watchdog.py分别吞掉1/3秒、3/5秒press/release TimeoutError。新假设为原超时取消与真正ACK后零事件需要分开，尚未认定历史首败由此引起。

最小差异：在现有task_pointer的原Input调用处记录三种固定事件的attempted/cancelled/failed计数，并沿原Python→Zod→owner诊断文件保留本动作差值；不额外查询浏览器、不保存坐标/URL/正文、不改变时序/期限/异常/动作次数。Product Alignment：通用点击导航和表单任务；原普通动作边界；输入是原Input结果，动态输出仍为原业务结果；平台能力为原运行审计，普通0模型、网站特判no。Reuse Assessment：复用已固定B-U/CDP及原DiagnosticChannel/SourceLifecycleDiagnostics；只扩B-A-T诊断映射，不复制输入引擎/恢复器。最小验证保护取消与原错误传播、零重发、旧诊断兼容及敏感额外字段拒绝；模拟的取消不冒称重现历史浏览器首败。

验证：5项pointer、2项原Runner失败通道、9项TS owner持久诊断均通过。API原check暴露既有盾测试引入.ts扩展但noEmit配置未允许的5条TS5097；显式同check加allowImportingTsExtensions通过。将该选项固化到API已有noEmit配置，兼容原tsx执行路径，不改盾源码/网页或发射产物。首次误用不存在的typecheck脚本也保留日志；必要检查以实际check为准。当前只关闭诊断缺口，历史缺点击根因仍未关闭，不据此宣布D6通过。

## 2026-10-10 D3共享SW逐请求归属字段核验（未能恢复页面归属）

真实缺口沿用15x6cgt6（SW冷暖8/8到达，页面2/4）与h3uhf2i6（拦共享SW误伤另一窗口2/2，释放后恢复）。现有RequestGate仅对owned专属Profile使用browser Fetch；daily page/iframe的TargetScope不能把关联SW视作独占。扩展BrowserModel把child session转给拥有debugger的tab，这只是调试传输归属，不是SW请求发起窗口。

公开来源：[CDP Fetch原协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Fetch.pdl)、[Network原协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Network.pdl)、[Playwright SW路由说明](https://playwright.dev/docs/service-workers#network-events-and-routing)、[Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)，2026-10-10复核。Fetch有requestId/frameId/networkId/redirectedRequestId；Network有requestId/loaderId/documentURL/frameId/initiator；二者均未承诺message事件来源clientId。webRequest允许tabId=-1，initiator只是origin；不能凭API字段名认定能逐请求归属。

本轮新假设：以networkId连接Fetch与Network后，原initiator/异步栈或frame是否仍带发消息窗口。最小差异只加所属apps/api/tests诊断，复用现有真实daily extension验收、两个owned窗口和原finally；两窗口向同一SW发送同一URL，按执行阶段留标签，标签不能作为产品判据。只保存本地合成请求的元数据，不记录Cookie/正文；分别记录动作、请求尝试/暂停和源站到达，直连夹具无网关，不能伪称网关计数。接受条件是可靠页面归属且无关窗口正常；若缺失，保留此项未完成并继续其它包，不引入时间/URL猜测，不全Profile拦截，不改SW/缓存/库/个人Profile。

Reuse Assessment：复用browser-use0.13.8/cdp-use1.4.5、原Chrome扩展及已有测试启动/收尾；没有新增产品引擎、运行依赖或模型调用。此步仅协议边界诊断，不是新链路功能；没有修复结论前不扩产品能力声明。

实际admission-qhexxnlq：任务窗口/另一窗口各1条message、各2个相同URL请求，四条均暂停后原样放行并到达源站；Fetch.networkId全部关联成功，但Fetch.frameId四条相同、Network.frameId均缺失、loaderId为空，documentURL与initiator调用栈仅sw.js且完全相同，没有message来源clientId。该公开字段关联假设被实际反例否决；序号或诊断phase只能说明测试安排，不能作为归属规则。继续保留D3未完成。可兼容路径仍是用户明确选择原受管独占Profile，不能静默替换daily；共享模式需浏览器提供因果归属或业务SW主动协作，当前通用公开接口不能由此证明支持任意自主请求。

首轮admission-jorlpui0在建立观察前5秒超时：此前iframe修复已使原daily autoAttach过滤掉SW，不是请求被准入器阻断。后续只在owned诊断夹具内临时允许原CDP观察SW，产品scope不改；未因此重跑原冷暖泄漏试验。两轮daily窗口/测试进程沿原finally关闭，daily-profile-deleted.json确认永久删除；0模型，无个人Profile。诊断通过不称共享SW修复。

## 2026-10-10 盾的访问者检测网站

后续用户已纠正优先级：下述页面代码保留但暂停扩展；先完成原反爬主线并本地提交，再处理独立化及专业网站。该段仅记录已有页面的复用选择，不是当前继续做页面的指令。执行入口见PROGRESS及其2026-10-10交接链接。

用户明确目标是独立真人/机器人检测网站和好看的结果反馈。参考https://deviceandbrowserinfo.com/are_you_a_bot_interactions的公开说明，邮箱/密码用于虚构交互测试，不是真实登录。现有origin首页只是创建夹具提示，overview是管理员表，不能视为已交付该网站。采用frontend-design技能，设计为浅暖色检测工作台、深色结果区、清晰状态和可展开证据；不增加前端框架或展示虚构概率。

Reuse Assessment：BotD2.0.0、固定CreepJS及Kitsune/原identity函数、collector→ingest→CrowdSec已校准，全部保留；HTML原生表单/details和现有Node/Zod/SQLite用于界面与会话，无新依赖。自有代码只投影原检测行（类型/判据/有效性/结果）及本次事件计数，不传回IP、Cookie、账号、原始指纹或输入内容。独立观察入口沿现有4185的measurement路由，不改完整4183挑战/封禁；明示本次报告范围，尚未接入网络/长期关联的展示保持未覆盖。校准复用旧判据，仅新增报告边界和一次实际浏览器正常/异常/不可用及响应式检查；不把网页变绿当全部检测或矛能力验收。

## 2026-10-09 D2输入节奏后的长文本预算兼容

Product Alignment：通用长表单/编辑任务，复用原input动作与文本参数，最终控件值和框架状态不变，普通0模型、无网站特判。新增逐字等待必须覆盖长文本，不能只验邮箱/密码。固定B-U TypeTextEvent默认60秒、bubus原事件dispatcher在执行前取event_timeout；Agent原步骤180秒和产品运行预算是另外的上限。Reuse Assessment：仍由原B-U逐字输入和bubus调度/取消；仅在本Browser事件分派前，为未显式配置的TypeTextEvent默认预算加上本适配器最大附加等待（1.5秒×字符数）。显式event_timeout、TIMEOUT_TypeTextEvent环境配置及外层步骤/运行预算完全保留，不重发字符、不自动转粘贴、不扩通用调度器。用既有输入验收的315字符正常文本先记录原失败，再核同动作完整值/原生事件；边界保护显式超时和取消。

实测input-pefb31cm在原60秒期限取消；input-s8euzfwh同315字符完整匹配，约78.95秒、1246条采集事件全部原生、0模型，原滚动/按键/锚点测量继续。d2-long-input-independent-review物理复核三份owned Profile关闭且永久删除。中间q1i_ivdb原输入返回成功，但测试把Python的True字符串与小写true比较而失败，改结构化JSON后通过，未因此改产品；2条预算/原bubus取消边界通过，首次model_construct跳过事件初始化与dict节点不合原serializer的夹具错误保留。不是外层180秒/任意长度文本全部已验，也未放宽用户配置的期限。

## 2026-10-09 D7在线探针制品的启动校验

真实缺口：lab readiness只验证端口、管理归属和首页200，不读在线CreepJS/Worker bundle；探针文件缺失或错版仍可能先报告ready，直到业务页加载才变error。复用现有bundle/manifest及Node crypto、Zod，把creep.ts与worker.ts重复的读取/摘要校验合并为同一适配，启动前及status核四个既有制品；不是新健康监控引擎，也不以制品齐全代替检测验收。不重建M0、不重装依赖、不重开浏览器；使用独立小目录校准缺失/损坏/错版/正常，然后只读当前制品与服务状态。motion-attestation分类器虽未采纳，其原collector仍由human.ts使用，因此保留该库，不能误删采集能力。

实施结果：d7-probe-assets-boundary及d7-probe-assets-types通过，临时校准目录按归属永久删除。d7-probe-status实机五服务/制品/网络和地理来源可用；未重启常驻服务，新的HTTP读取校验随下次原origin启动加载，CLI start/status已直接使用本次代码。未把制品健康计作新的检测通过。差异检查曾错误关闭Git CRLF转换把整份既有文档报为行尾空格；恢复原配置后定点检查通过，未重写文档行尾。

前一项d2-trace-calibration：固定Kitsune函数对47人2776段没有重复hash，复制/改时间的异常仍同hash；但12个静止采样仍返回hash，坐标低16位截断也允许不同形状同hash。原“运动下限/字节相同即必为回放”说明不能当成立，暂不接成封禁规则；未改线上盾或训练另一分类器。它不关闭B02的一般分类缺口。

## 2026-10-09 D6公开交互输入修复及独立复核通过

[DeviceAndBrowserInfo指纹页](https://deviceandbrowserinfo.com/are_you_a_bot)明示供bot测试；[交互页](https://deviceandbrowserinfo.com/are_you_a_bot_interactions)明示可提交任意虚构邮箱/密码，并增加CDP鼠标坐标、速度和交互判据。仅用owned临时可见Profile、原B-U/OrdinaryCapability各一次，不涉及真实登录；保存其公开命名布尔结果、测量有效性及资源收尾，不存原指纹或页面正文。复用既有ignored public-probe及原生命周期，不添加产品依赖/新浏览器驱动。它是第三方检测交叉核验，不替代本地校准或自然语言准备/发布。

首轮public-probe-l1xz209c的独立指纹页有效返回isBot=false及22个公开信号false，实际保留原B-U控制连接。交互页邮箱/密码原生输入完成，但该页另有代理查询表单，验收脚本宽泛submit selector被原目标唯一性门拒绝，尚未提交；原首败保留。只将测试selector限定该站公开loginForm，再仅跑未完成的交互页，不重复指纹页，不修改产品定位或盾判据。

实际交互public-probe-b45e_toe成功提交，但isBot=true且唯一阳性为suspiciousClientSideBehavior；superHumanSpeed、hasCDPMouseLeak及22个指纹项阴性。原B-U/OrdinaryCapability原生动作，0模型，两个窗口关闭/Profile永久删除。不能把动作成功当检测通过。公开device_info.min.js的collectAsyncInteractions采集字符修饰键、字段/提交点击位置、时序和querySelector调用栈；源码SHA256 cac11e743ba20871b499abab4a7a075c169f36efaa5287fc226ffa410405b677。固定B-U输入的char事件未传递keyDown的modifiers/code，可能造成真实键盘语义不一致；下一步仅被动观察原请求中的这些字段，不记录完整指纹/token，不盲目调整延迟或服务器判据。

kgk9dwek被动测量确认typeAtCharacter=true、typeAtWithModifier=false、hasModifierKeyPressed=false；无字段点击、提交正中心也为实际采集事实，暂不推定哪个触发服务器规则。原本地React输入验收新增keypress不变量后，Actor/Watchdog的@/!均暴露修饰键丢失，d2-keypress-first保存首败。按[CDP正式Input协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl)每条事件的modifiers默认0、code默认空，Chrome不会自动继承之前keyDown的参数。

Product Alignment：通用表单填写/编辑任务；原input节点、文本输入和页面动态结果；普通0模型，无网站特判。Reuse Assessment：复用固定B-U 0.13.8原字符映射/顺序/清空/框架提交及原CDP dispatcher；只在同会话相邻keyDown→char间补缺失modifiers/code，不生成新按键、不复制键盘映射、不改时序/采集。明确给出的字段原样保留，keyUp/异常/取消清除待传递状态，跨会话隔离。关键不变量用原真实React两入口及换行/中文/替换回归，加无效/取消/显式覆盖边界验证；第三方判定再独立测一次，不能从协议修复推定检测已通过。

后续修饰键本地修复已通过，公开3cnczxpj仍阳性。一次三组受控对照d6-public-behavior-factors：只增加每键120ms实际等待即全部阴性，只改变提交坐标仍阳性，两者组合阴性；未拦改站点采集/上报，原中心点击/无字段点击/页面栈仍存在。这支持修复打字节奏，不支持同时改点击几何或重写定位。CloakBrowser固定37d81bce9bc79159b9adf189119ae9ee63ae67e4的human模块已核源码：提供整体替代输入、随机错字/纠正及无CDP时脚本派发，与保留B-U和输入语义冲突，不引入另一引擎或二进制；其独立时序只依赖标准random/sleep。这里直接复用Python标准random.uniform与asyncio.sleep给原B-U可打印keyDown加120–200ms可取消间隔，导航/快捷键原样；不复制按键映射/事件循环、不伪造时间。CMU原数据204000个DD间隔四分位128.4/191.1/300.7ms支持数量级，未训练或把此区间称人类分布模型；保留原60秒输入事件超时，长文本逐字输入耗时会增长，不自动转粘贴或放宽运行预算。实际产品与外站需再验。

上述窄均匀间隔仅为首版尝试：omqlmr6r仍阳性，不能从受控固定120ms通过推出它也通过。用户6mnui357在同B-U连接但无自动输入的独立窗口完成正常对照，全部阴性；邮箱/密码中位232/194ms，标准差535/351ms。只记无内容布尔/统计结果，Profile永久删除。替换窄均匀等待为标准库lognormvariate（mu=-1.655、sigma=.63，由独立CMU中位191.1ms和四分位跨度确定），保留右偏停顿并限额60–1500ms；这是输入节奏适配，不是训练检测器或声称完整真人分布。原CMU判据/盾阈值不动，再做原输入兼容与真实公开判定；若仍失败继续保留，不无界调参过此站。

最终f58my_b7使用正式产品路径、没有测试侧按键等待/坐标偏移，isBot及全部25个具名信号阴性。邮箱/密码键间中位232/296ms，原中心点击、无字段点击和页面采集继续存在。input-d5gv6t3p原Actor/Watchdog中文/清空/替换/React/换行/number通过，4项隔离/显式参数/异常与取消边界通过；joint-calibration-BMK7jo复用此次实际键时刻，原Kitsune两判据均阴性、已有真人三段正常、固定快速/慢速异常仍检出，未改盾阈值。该统计线索不是普遍人机分类器，B02继续未关闭。

独立4hnide0t去掉请求观察器、时序及坐标试验包装，正式输入/click再次全部阴性。原ignored public-probe迁移为apps/api/tests/antibot-public.acceptance.py并移除实验分支，只保留原生测量、显式真人模式及既有finally资源收尾；无新浏览器引擎。八个本轮Profile永久删除已物理复核，d2-public-input-independent-review保存前后/真人/资源结算；第四方检测模型未外推。

## 2026-10-09 B02剩余公开候选源码筛查

DELBOT既有失败已复核预处理：DataMovementMatrix的mayNormalize=false与原训练scale=1一致，模型输入是像素位移矩阵而非时间，标签由!isHuman.result正确转换；原canary也有6个人类样本中4个误报。d2-delbot-input-audit.json记录未发现接线错误，未重装或重跑该候选。Bot_tracker固定932d48ebe96b00b510aa32d4954cfa5425a2f288只交付README，无可运行实现/权重，不安装。下一小项只校准已固定Kitsune traceHash的跨会话重复轨迹；原32位坐标hash不认证真人、会有量化/碰撞/平凡轨迹问题，须先用已有47人2776轨迹及缺失/重复控制验证，再决定是否适配原CrowdSec，不先增加产品代码或另建分类器。

本次只查源码与复用条件，没有安装、训练或另开浏览器。BotSight固定`5c09da65cba35199943a6c740edbf98e39c97f4e`的[train_rf.py](https://github.com/abdulmalik505/BotSight/blob/5c09da65cba35199943a6c740edbf98e39c97f4e/train_rf.py)把已计算角度熵重新赋零，时钟不齐直接填零，入口仍需训练而未交付模型；translator实际是SHAP文案而非README声称的特征提取。未达到本次直接复用成熟分类器的条件，不能把该README当改善证据。DualChannelBotDMM固定`98bb6b8d01102013bbaf061759161eeab6c2bac6`针对[社交账号内容/关系表示](https://github.com/JaydenDuan/DualChannelBotDMM/tree/98bb6b8d01102013bbaf061759161eeab6c2bac6)，不是鼠标轨迹分类，不接入本项。

Lightweight-Mouse固定`618f2b3517b737478cce81452c188fc2b5190403`的[app_simple.py](https://github.com/Saksham-Lakhera/Lightweight-Bot-Detection-using-mouse-telemetry/blob/618f2b3517b737478cce81452c188fc2b5190403/app_simple.py)直接接受客户端两值及明文status=human Cookie；(0,0)即获human判定，不能采用为真人证明。这只否决该完整示例的可信边界，不代表其ONNX模型已做准确率验证；未下载安装或执行模型，许可证/独立正常校准亦未完成。不由这些筛查推断所有公开方案无效，一般行为分类仍未关闭；已有失败组合不重训、不改验收阈值。

## 2026-10-09 D6准备阶段明确挑战恢复通过

真实缺口：新的verification响应已在普通TaskRun恢复，但AuthorAccessControl原停止码不识别它，首测pswwk1g3实际1次导航/1次固定回复后以native_agent_run_failed结束，未进入人工等待；仅加停止码也会使真人可解决的挑战终止准备。复用刚通过的主文档分类、原HumanWaitControl request/resume/release、宿主同job人工等待和B-U on_step_end。只把原publish/等待/同session-tab核验提取为共享方法，供明确响应触发的等待调用；不伪造模型bat_request_human动作或编译证据，不增加模型调用、自动求解、动作重发或新状态机。原普通403/429等停止边界保留；无宿主人工通道时拒绝且保留原错误。在原resume应答前检查实际主文档状态；仍是挑战则拒绝确认并保留同一等待，用户处理完成后可再确认；release后再核一次防止状态已变化。不能把点击“继续”当解除证明。

Product Alignment：自然语言网页采集/表单准备；复用链路边界为原探索导航/读取；输入为官方主文档挑战标记，输出为原探索结果；通用能力为原宿主人工等待；模型仍仅原Agent决策，响应分类不询问模型；网站任务特判no。Reuse Assessment：固定B-U on_step_end＋现有HumanWaitControl及TS人工恢复；自有改动仅适配自动识别的访问状态，原显式人工动作编译保持；验收用既有真实B-U本地HTTP夹具先复现，再验证同控制会话等待/确认后继续、未解除与无宿主拒绝、原显式人工协议。该本地确认夹具不冒充真人样本或外站准备发布验收。

真实B-U验收ldkr1zh8及最终nmukraj6：第一次403暂停，夹具模拟确认后200，Agent继续下一次原导航200；同session/tab、3次固定本地模型回复、0外部模型调用、sourceGaps为空，均关闭并永久删除Profile。13项Python身份/拒绝/仍等待/原显式证据及2项TS宿主恢复边界通过；source校验摘要1ed8c397addd3a08e3998714e0fe2e7e4964947f689ea633e62fe26c139bb879。确认门单测首次复用了同一个异常实例，assertRaises清理旧traceback导致暂停协程清理，修为每次独立异常后通过，原失败日志保留；未因此改产品判据。

## 2026-10-09 D6被动计数复跑与D3归属边界复核

只执行一次不增加CDP读取的原冻结链回归：d6-passive-product四次7/11/13/无资格99正确，普通0模型，4个owned Profile永久删除；历史缺点击仍未复现，不当根因修复、不再重复。查到[上游类似报告](https://github.com/browser-use/browser-use/issues/5469)，但属于另一harness/macOS路径且没有稳定复现或修复，不能归因本机故障，未引入其JS点击/重附着后备。

[Playwright官方Service Worker说明](https://playwright.dev/docs/service-workers#network-events-and-routing)确认SW发出的请求仅在context层可路由且没有frame归属，页面对应事件不能直接拦截；与15x6cgt6漏门和h3uhf2i6误伤证据一致。原Chrome扩展ServiceWorker域权限限制仍在。仅更换库不能证明逐请求归属，未新增第二驱动/全Profile接管/禁用SW，日常共享SW治理继续未完成；已有独占专属Profile冷暖/重启/借用恢复不重跑。

## 2026-10-09 D6外站正式人工恢复通过

用户已同意为这次正式TaskRun验收再完成一次人工验证。准备时发现原执行器将403统一映射blocked，不能进入已存在的verification/human_required检查点。按[Cloudflare正式响应协议](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)仅识别主文档`cf-mitigated: challenge`，保留实际HTTP状态；无标记403仍拒绝、子资源/PAT不污染主文档、后续正常响应清除旧状态。复用原DocumentResponses、已有verification分类、ManagedWindow handoff和TaskChainRuntime恢复；不识别验证码内容或自动求解，不写特定测试站分支。Product Alignment：通用访问/表单的人工挑战恢复，输入为原响应元数据，动态输出为原任务结果，普通0模型。Reuse Assessment：官方挑战标记＋原运行/恢复能力，新增仅响应映射，不新建人工状态机；最小验证先保留原403误归类首败，再验证文档范围/解除/普通拒绝及真实同run恢复。

实际`bat-human-wait-real-WNvXve`首次403归类verification，TaskRun保存observe检查点并交还原窗口。用户明确完成后，同一run恢复重新导航，原browser.read-fields读取到公开成功正文，completed、0模型、首败事件保留；owned窗口关闭及Profile永久删除。外站未做“尚未完成时再次挑战”请求，receipt的stillWaiting仅表示保存的检查点，不能算第二次外站恢复试验。该夹具走真实TaskChainRuntime/Runner/人工恢复，是正式运行协议验收；不冒称该外站完成过自然语言准备/发布。原本地401重复等待证据仍单列。首个分类失败见d6-challenge-classification-first.log；修复后文档范围Python、TS映射5项、API类型及本次实际恢复通过。

## 2026-10-09 N06运行期GeoIP时效修复与验收

查原sourceRules已用每事件TimeNow保护Tor名单，无需重做。GeoIP目前只有启动/报告检查，固定Hub的timezone_country评分hook没有运行期有效期条件；原EvaluateMismatches每请求继续查询已加载MMDB。复用原CrowdSec Expr TimeNow与完整Hub评分配置，只给这一依赖GeoIP的hook加真实构建截止；原5分、其它评分/阈值/挑战不变。生成配置覆盖owned配置别名，不编辑固定Hub源码，不新建刷新服务/定时引擎。期满表示地理测量不可用，现有报告继续显示stale，不当正常反例；来源刷新仍走原维护路径。最小验收：先保存原hook过期仍加5分；原Expr同进程短截止前后、同国正常、非Geo评分保留，再核实际配置加载。不等待35天，不用缩短测试声称真实长测已验。

已验d1-geo-live-expiry-first/final：原Geo hook在截止后仍5分，新原Expr条件当前异常5/同国0/同进程短截止后0；actual生成配置校准同样通过。2项配置/来源边界确认除了该filter及注释，其余原Hub源码逐字不变；TS通过。原engine PID3011经归属/无长测核验后停止，配置-t通过，原start重新加载为5243，五服务ready；source SHA e5445319b2f281ea5cd9f5420fb6f953fadbebf2a190bd1510d6bf827df16bc8不变，当前真实截止2026-11-05T01:36:12Z。报告d1-geo-guard-activation/ready保存；不报热更新或35天通过。恢复时start只在engine停下时更新owned配置；active且需改动则明确拒绝，避免磁盘变更冒充已加载。

## 2026-10-09 D3/D4最终框架验收与D6点击首败

原扩展路径admission-4iy0c07g、专属路径admission-aaa781nh：iframe初始inline脚本4请求只有2次实际到达；429后下一请求源站零到达。同源/跨源原DOM和click、任务关闭清空池/归属、日常连接保留均通过，两个Profile永久删除。v18vutb9提前请求4次全到达及cc0ad8rx响应退避失效两次真实首败保留。原23连接、5归属/错误边界、2响应/取消回归通过；共享SW仍未覆盖，不扩大其所有权。

冻结product-SaTblJ的无诊断正式复跑首次7成功、11报ordinary_event_target_unverified，源站确实没有selected；首败保存在reports/d6-frame-product-first-failure。仅通过已有RunnerLifecycle.runnerScript挂一次临时诊断后，7/11/13及无合格99四次原正式复跑正确、0模型，三次click原move/press/release均ACK且采集1个事件。诊断首个入口漏原TLS runner造成的导航失败单列d6-frame-diagnostic-tls-first；修为链接原runner/SPKI而非系统信任后通过。d6-frame-independent-review核4次状态及Profile永久删除。后续成功不是历史零事件根因修复，不能归因用户失焦；既有最小化/恢复combined-4wl6pb5r也已通过，不重测。

Product Alignment:
- natural-language task: 点击动态选中的候选，以及在表单中操作控件。
- reusable chain boundary: 原普通动作派发与事件校验失败诊断。
- runtime inputs: 原动作、原事件采集和既有CDP输入应答。
- dynamic task outputs: 原业务结果不变；失败增加固定计数。
- generic platform capability used: 现有Runner/DiagnosticChannel/Zod持久化。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 定位原生输入应答成功但事件缺失。
- existing implementation in repository: task_pointer、verify_event_target、runtime_diagnostics与source-lifecycle-diagnostics。
- mature candidates and pinned versions: 保留当前B-U原Input和既有原生采集，不新接控制库。
- selected implementation: 原失败通道添加可选eventCapture状态/事件数/限制数及三类Input ACK计数。
- reused public surface: 原异常、原DiagnosticChannel和严格Zod结构。
- B-A-T-owned adapter and remaining gap: 只适配自身运行审计；不记录URL、文本、节点、输入值或限制详情，不添加动作/重试/等待。
- license/runtime/platform fit: 原依赖不变，无新增包。
- browser/runtime/state ownership conflicts: 无新会话；原失败类型、目标校验和生命周期不变。
- replay model calls: 0。
- rejected candidates and evidence: 不靠重发点击、抢焦点或JS事件掩盖首败。
- focused validation: Python诊断2项、原pointer4项、TS诊断9项通过；API类型检查通过。首个新断言误把fixture的RuntimeError格式当详细reason，已修断言；首次tsc漏现有allowImportingTsExtensions参数，按既有参数重跑通过，未改无关导入。

## 2026-10-09 D3框架首次请求准入首败与复用

初步修复8ihbvius观察前请求2到达/2拒、rv9q682t初始inline脚本同样2到达/2拒；二者原DOM/click与释放池/保留连接通过。续测cc0ad8rx实际429后下一请求仍到达，定位原SDK只为page/tab开启Network监控、Runner也只接顶层响应；iframe以原Fetch Response stage交既有Admission.remember，不复制退避算法，不把HTTP响应再次计配额。此错误首败保留，修复后重测初始请求/退避/清理。

admission-v18vutb9实际扩展路径：OOPIF被DOM观察前4请求全部到达，预算仅2；此前5_x4sv1w只验证观察后有效。复用原RequestGate/Fetch及固定B-U SessionManager，不增加控制器或配额引擎；原Chrome Target.setAutoAttach只对已拥有父session的iframe设置等待，SDK建立session后先启原准入器再恢复执行。共享Worker和无关页不暂停、不授予新所有权。默认原采集和现有顶层控制保留，独占Profile原browser级Fetch路径不改。验收必须包含初始脚本和观察前真实到达数、原DOM/click/清理及错误边界，不能仅测观察后。

V04公开资料审计：Cloudflare明确PAT子请求401是可预期降级。d5-pat-status验证原Runner子资源401/403不改变主文档200、不设冷却，真正主文档401仍报authentication_required，产品不改。官方privacypass-ts0.9.0固定4edc0e2b源码已核，Apache-2.0/Node>=20；Origin.verify仅验原签名，不负责挑战绑定/重放/设备信任，不能直接当成完整盾。此次未安装依赖、未发令牌或外部请求；真实issuer/PAT信任仍未验。来源：https://developers.cloudflare.com/cloudflare-challenges/reference/private-access-tokens/ 、https://github.com/cloudflare/privacypass-ts/tree/4edc0e2bf639a60142a3f809d38ce7bd5c6f8c9e 。

## 2026-10-09 D4跨源框架恢复验收

父session归属薄适配后，原B-U DOM/ClickElementEvent在专属9207xv25与实际chrome.debugger扩展h9ycj574均发现并点击同源/跨源iframe按钮。8wiiwjql再证明关闭含OOPIF任务页后原release_operation清空SDK目标池、页/子session归属且连接仍存；不另造恢复引擎。原23连接复用、3归属/对话框边界通过。扩展53bpoc77首败属于测量器错误：扩展getTargets只枚举获准顶层页；改为独占测试Profile的原生只读getTargets核对OOPIF，未扩大产品枚举。全部owned Profile关闭并永久删除。

## 2026-10-09 继续执行：点击投递边界与特殊颜色输入

D3/B06：复用历史3isei3ss/9jri6mtt及原B-U eb412692的click。一次bounded会话combined-3r0i4nv9分别测正常冷flow、Chrome显式ignore-input控制、恢复与冷catalog，命令仅内存计时。三正常单次点击送达，ignore控制三命令均应答但页面零事件；原资源finally关闭并永久删除。该控制证明CDP ack不足以证明送达，不证明历史故障原因；未添加重试/抢焦点或修改产品点击。依据[Chromium InputInjector](https://github.com/chromium/chromium/blob/main/content/browser/devtools/protocol/input_handler.cc)：事件未排入队列也可sendSuccess。停止重复普通焦点检查，历史项继续未定位。

D2/B01真实缺口：fill_color依据HTML属性存在就回退，未区分浏览器实际支持；空颜色值在旧控件实际规范化为黑色，但适配直接拒绝原生输入。旧五项首败/兼容证据input-s_lxi7za保留，原React夹具不改。input-skg2d4hn已验：actor/watchdog六项颜色值/React/提交/焦点正确、脚本事件0；原两个range回退保持值正确，owned Profile关闭并永久删除。真正增强颜色仍未测。

大范围range改造已验：复用Chrome原thumb/track几何与原B-U Mouse.move/click作一次原生定位，再按实际值走原有键盘微调；不写拖拽/输入引擎，不放宽精确值或既有检测。input-pba8y3m0横向LTR/RTL、纵向和CSS缩放共八项actor/watchdog值/React/提交正确，每项一次原生click、零脚本事件。input-z2n4mk69九项旧特殊回退中八项原生化（六颜色、两range），超精细step=any的0.12345仍保留原兼容四脚本事件；Chrome键盘可达的0.12已原生化。原28项非文本兼容input-qo25sjm2通过。取消释放原按键、遮挡不点击两项边界通过。首次d2-range-native-first.log为误把B-U异步mouse属性当函数，修调用方式后才通过；没有重跑无关全量。

复用固定[Chrome154 SliderThumbElement](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/core/html/forms/slider_thumb_element.cc)位置/方向语义；适配只选坐标，值计算/钳位由Chrome负责。旋转/倾斜不套轴向公式，命中检查必须仍是目标控件。独立读取上述原报告确认8/8 native、9项中唯一精细回退、旧28项及四个Profile关闭/永久删除；最后result.json的旧字段nativeColors=8包括两range，生成端已改名nativeCases，原证据不覆写。真正alpha/P3增强和其它平台仍未验，不能按HTML属性存在假称已启用。

B02离线数据契约审计d2-feature-contract-audit.json：复用原六特征、原训练/留出分组，无新模型、拟合或阈值修改。原56bot训练样本速度变异系数中位0.069/0.171，新独立bot为0.421–1.0；原submovement比例中位0.329/0.341，新bot约0.029–0.167，与human分布重叠。统一坐标缩放10倍/时间单位换算的最大特征变化0.004（浮点峰值比较），不是可解释417全漏检的千倍时钟错误。结论是当前训练域/特征不能支持跨来源分类，不能以重装候选或调整阈值消去首败；一般分类仍未关闭。

D3下一具体调查：原daily chrome.debugger相关target是否包含共享SW、原page Fetch能否约束其自主请求。只用已有owned daily验收Profile/原服务器作边界诊断，保留非任务页正常请求。不能把Target父子通知解释为独占整个Profile，不能停用SW或把日常模式静默改为专属。原CrowdSec dump数据为诊断输出，当前固定源码未发现活动bucket跨进程restore；不把SIGHUP配置重载报作恢复。

D3实测admission-15x6cgt6：相同2次/分钟预算下，原daily page Fetch使4次直接请求只有2次到达，但同SW冷/暖各4次全部到达，原related事件实际包含service_worker。admission-h3uhf2i6追加另一个窗口：向该关联SW启用Fetch拦截后，第二个窗口触发的两请求也被拦，释放拦截后两次恢复200。证明“相关target”不是可按页面隔离的准入边界；直接纳入原gate会影响共享该SW的其它正常页面，不能作为合格修复。两次有效报告均原finally关闭并永久删除Profile，0模型、未操作个人浏览器。shared-control首败35_87o13为诊断回调内部await CDP造成读循环等待，原60秒超时；外部释放同测试会话Fetch后原finally完成清理。改用原Admission已有的调度方式才完成共享对照，未修改产品准入/采集或启动参数。

接续D2/B03：现有键盘判据只有本机一人反例，鼠标47人数据不能补键盘。选[CMU DSN2009公开基准](https://www.cs.cmu.edu/~keystroke/)51人、每人8session/400次测量，用其原DD键间间隔还原相对keydown时刻，秒转毫秒；只用于既有固定Kitsune判据离线正常反例，不训练/调阈值、不识别用户、不分发数据或复制生物认证算法。官网明确分享供研究复现，要求引用Killourhy/Maxion DSN2009；无通用开源许可证声明，数据只留ignored研究目录。Aalto136M有research/noncommercial条款且体积大，本次不下载。原始键名/文本不进入评测结果；公开历史跨session数据不替代本机真实跨天作业。

B03结果d2-keyboard-independent.json：51人20400段全部可测，原30ms间隔与0.15熵阈值均零误报；固定快/慢自动节奏仍触发原相应判据。已核官方MD5，源SHA256 b11d23538b1865fa6ecf4e8b78567caa312e9c1027604bb022fcc6ad7eaa7a33。没有模型拟合、判据修改、新依赖或浏览器运行。固定文本正确输入不代替自由输入/IME/粘贴人群反例。

B02补充公开候选复用评估：motion-attestation1.1.0/bea077b307e58d7a034a75fdaf84979f438cfdd7，MIT、Node>=18、纯ESM零运行依赖，mini公开analyze接受现有[x,y,ms]轨迹，无浏览器/状态/模型调用冲突；固定六运动特征与原0.55阈值，实际源码已读。只有4个公开提交，不能按README的27个内置正常样本认定成熟或一般有效；限一次既有独立47人正常集的离线否决检查，未安装包、不运行其服务/挑战/采集器、不采用nonce认证真人的说法。无法通过独立正常反例时不扩展到B-A-T或另开浏览器。首次GitHub API限流403改用公开git引用/codeload固定归档只提取源码与许可；不是工具策略拒绝。

结果d2-motion-candidate.json：47人2776段中4坏时钟/1不足；2771可测真人866判bot、1905判human，不能采用为一般分类，停止该候选，不扩大浏览器实验。

B02一次有变化的验证协议（运行前固定）：前次RF只训练56段两类bot，原数据契约审计已证明未覆盖新来源。复用同sklearn1.7.2 RandomForestClassifier(random_state=20261009,n_jobs=1,class_weight=balanced)、原六特征、原默认决策，不调参/阈值；加入公开非增强bot中的七类作训练，完整留出stealth/trace_conditioned/llm三类；AdSERP原37训练/10人592段留出保持不变，新来源human按原文件名SHA首字节奇偶整文件分组，不拆同文件segment。独立留出正常超过1%误报或三类任一低于80%识别即否决，不继续搜索；不足/坏时钟不计为正常通过。此次是已有公开数据上的预定开发验证，不能冒充新的盲测数据；不让B-A-T参加训练、不把候选分数作为产品验收。复用成熟估计器而非新建学习引擎，安装到本次独占ignored环境，结果和版本保留，结束撤下依赖。

behavior-transfer-fixed结果：stealth40/40、trace_conditioned23/40、llm2/34识别；新来源human11/99误报，AdSERP原独立592和原39正常均零误报。两个预定门都失败，否决，不能用局部召回改善声称模型有效。原六特征/估计器组合没有解决一般行为分类，停止这一组合，不搜索阈值。d2-transfer-runtime-removed确认本次独占venv及cache永久删除；模型/来源/评测保留。首次uv默认C盘cache与D盘临时文件跨盘持久化失败，改为本次专属D盘cache后安装成功；非Windows权限或审批拒绝。

B01复核首败input-7tuog1lu：新增range位置逻辑在真实Shadow DOM中值正确但回到脚本事件，原因是document.elementFromPoint返回host而非内部input。前两个启动/夹具错误分别为遗漏显式owned-input环境门、手工backend入口未先DOM.getDocument，未算产品失败。最小改动改用[原生DOM.getNodeForLocation](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getNodeForLocation)，同一整数坐标用于原生命中和原B-U鼠标，includeUserAgentShadowDOM=false只取控件而非其UA内部thumb。复用原Chrome命中/遮挡/frame实现，不自建Shadow选择器遍历；保留遮挡拒绝、取消释放与原fallback。验证范围仅本次range：Shadow/同源iframe两个容器、既有八几何条件和两异常边界，不重跑模型准备或全部输入。

iframe续败4iu5l0gj/yo3b7i2h/vvoainh_实际原始geometry已定位：getNodeForLocation在[Chrome154 InspectorDOMAgent](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/core/inspector/inspector_dom_agent.cc#L1741)按文档坐标处理，而Input/BoxModel为视口坐标。调用原Page.getLayoutMetrics把命中点加cssLayoutViewport.pageX/Y，鼠标仍用原视口点；不是放开遮挡检查。ej0b2br8两个真实嵌套场景通过后移除临时命中探针；最终input-zmyqfxqj八几何+Shadow+同源iframe十项全部原生、一次click、值正确；两边界包括滚动坐标/取消释放保持通过。原28项输入回归未无变化重跑，真实跨源OOPIF另审计。

D4具体缺口调查：原固定B-U0.13.8 SessionManager的原attached处理负责iframe/session与递归autoAttach；现有TargetScope过滤仅page/tab，AttachedWindow显式关cross_origin_iframes，与原BrowserProfile默认true不同。先复用原admission owned Profile/本地HTTP入口做同源正常与跨源OOPIF对照，确认DOM发现和ClickElementEvent业务是否受损；不能用全Profile枚举放开个人页，也不另建iframe/浏览器引擎。若确有裁剪则保留原SDK实现，只修B-A-T的归属适配及配置。

D4真实首败admission-16nuer9n：同源iframe按钮发现1并原生点击成功；跨源Chrome实际iframe target=1，原B-U开关true，但SDK iframe session=0、按钮发现0。l1jougc3是诊断Page.evaluate参数格式错误，非产品首败；两个owned Profile均按原finally关闭/永久删除。

Product Alignment: natural-language task=处理内嵌认证表单或页面内嵌应用；reusable chain boundary=原浏览器DOM观察/普通click；runtime inputs=已获准任务页及框架；dynamic task outputs=框架内控件与动作结果；generic platform capability used=原B-U OOPIF/SessionManager；replay model calls=0；site/task-specific code added=no。

Reuse Assessment: capability=恢复任务页内跨源iframe的原SDK能力；existing=TargetScope、原SessionManager与Chrome扁平related事件；selected=依据已批准父session的原生attached事件识别派生iframe，再交原SDK递归autoAttach/DOM/动作，不复制frame树、连接、选择器或恢复引擎。B-A-T只保存活动session的父关系用于归属，iframe不写入顶层页面租约；外国页/根级未关联iframe/共享worker仍不扩权。沿用固定browser-use0.13.8与Chrome CDP，原许可证/runtime不变；日常路径删除B-A-T额外设置的false，使用原默认true。焦点及关闭仍仅顶层owned page。最小验收=协议父子/嵌套/外部目标/断开；实际专属和日常扩展的同源/跨源发现与原生click，清理和原owner边界。

Product Alignment: natural-language task=表单配置或页面偏好设置；reusable chain boundary=原普通输入；runtime inputs=目标及请求值；dynamic task outputs=Chrome规范化值与框架提交；generic platform capability used=原生颜色控件/原B-U输入；replay model calls=0；site/task-specific code added=no。

Reuse Assessment: existing=fill_color的原Chrome AX popup、B-U键盘与原fallback；selected=同控件未连接clone的浏览器原生规范化、有效alpha/colorSpace能力判断；只把值解释适配给现有原生popup，不复制CSS颜色解析器。依据[HTML颜色规范](https://html.spec.whatwg.org/multipage/input.html#color-state-(type=color))及固定Chrome154实测。有效增强属性仍保留原fallback，不把未启用功能算增强已验。最小验收=旧三颜色回退实例在actor/watchdog两路径值/React/blur/原生事件；超精细range仍保持兼容，不伪称原生。

## 2026-10-09 D6受影响整链与D7收尾修复

E03/E04在线采集后，d6-worker-product.log复用既有product-SaTblJ发布版，仅新增四次正式运行，不重做模型准备：7/11/13与无资格99失败正确，普通模型0、11条H2一致。独立日志复核为72原BotD、44身份、四WebGL正常，三个页面完成四项Worker测量；无资格页结束快，未完成的Worker测量不填正常。输入行为42条无样本仍unavailable，不因业务成功结算为真人行为。四execution关闭确认，原报告备份d6-before-worker-5651d246。

实际发现验收脚本只关闭host、未永久删除Profile：本次专属测试根下留有13个历次复跑目录。核原manifest、零Chrome进程、精确路径及无链接后已永久删除；旧profile-cleanup仅属于原初次验收，不能覆盖后续复跑。复用已有tests/helpers/owned-profile-cleanup.py和ManagedWindow原进程核验，新增明确的antibot-product分支；只在原host关闭后核归属、拒绝链接/活进程/无法核验，再永久删除该测试Profile。原产品持久Profile与旧helper入口不改，业务失败记录不被清理覆盖。两个针对真实删除边界的测试、实际Python child清理及API类型检查通过。首次child路径缺PYTHONPATH、首次误用不存在npm typecheck脚本均保留；修为同root Python路径与实际tsc入口后通过，无额外浏览器重跑。

复用审计：此次没有增加通用资源管理器或清理产品资料；只补本验收脚本原finally遗漏。删除仅为临时测试根下Profile，SQLite/报告/固定发布链路保留。函数22行，独立子进程调用由Node原execFile完成，失败留下profile-cleanup-failure而不伪称已删。

## 2026-10-09 E04 跨Worker判据在线接入（本子项已验）

combined-cs55bitl：完整HTTPS六case初始24项原生全部正常；平台/UA/内存/硬件并发数四单侧矛盾各触发一个原CrowdSec告警；真实worker-src CSP阻止创建后四项均unavailable/null，报告同样不可用、无bot误告警。原108条BotD与六个WebGL镜像仍正常，单次原生点击实际源站version7正确，0模型。在线probe未注册SW，最终专属Worker为零，浏览器关闭confirmed/Profile永久删除，independent-receipt.json逐条复核。严格协议重复/缺项/矛盾状态/原值拒绝和Worker五种生命周期通过。

构建首败d4-worker-online-build.log：Rollup TypeScript插件在load阶段已输出JS，transform阶段不能再比原TS哈希；改为原文件校验后的load+固定TypeScript.transpileModule，仅指定worker模块，原比较算法保留。最终worker-client edb2561e、source f0f42c33。最小类型检查暴露source-data已存在let别名无法缩窄，条件改为等价previous?.lastModified后通过，不改变来源时效行为。没有改检测阈值/增加依赖或B-A-T注入。

现有独立校准证明平台/UA/内存三项矛盾，但业务collector未调用。固定CreepJS worker/index.ts原函数无参数，默认相对路径./creep.js且先注册/注销Service Worker；不能直接移植到业务页覆盖其现有SW。仅构建期扩可选scriptSource/dedicatedOnly，默认路径/顺序不变，在线选择同源短生命周期DedicatedWorker，三秒无结果也terminate。检测比较仍全部执行固定上游原函数，不复制判据；不把Worker缺失当正常。上游源SHA256 0599255c8661c1c6fcbe3cf2f069a8c32a03fc21a788be9fcbb9c3e3fd641d61。

Reuse Assessment: capability=已校准跨上下文判据接入在线盾；existing=creep-worker-client/source、固定[CreepJS worker函数](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/src/worker/index.ts)、collector/telemetry和原CrowdSec browser-marker；selected=固定原算法加可选Worker地址/类型的构建适配、原生Worker生命周期，复用现有三态遥测；rejected=原默认直接调用会干扰业务SW，隔离iframe只比较子frame不能代表业务主上下文；license/runtime/platform=原MIT、既有Rollup/浏览器Worker，不新增依赖；ownership=只拥有创建的专属Worker、成功/错误/超时均terminate，不注册SW、不改现有业务SW；replay model calls=0；focused validation=原生四字段、单侧四矛盾、真实worker-src拒绝、旧BotD/WebGL不回归、实际业务结果。遥测只保留字段名/判定，不落原UA或硬件值。

## 2026-10-09 N04 form-factors补齐（本子项已验）

combined-pru4axf9：实际Chrome十一字段全部正常；新增formFactors单侧矛盾产生原CrowdSec告警1；真实iframe权限拒绝七项unavailable、零身份误告警；单次原生点击源站选择version=7/correct=true，0模型。独立逐行复核保存independent-receipt.json，owned关闭confirmed、Profile永久删除。原十项控制复用既有证据，不重复跑。四个定点组通过；首次类型命令误带不存在的types.d.ts未执行检查，纠正为实际两个入口后最小类型检查通过；未修改盾阈值/B-A-T身份。原normalBrandOrder字段现在只在确实运行该控制时记true。

沿[UA-CH规范3.4](https://wicg.github.io/ua-client-hints/#sec-ch-ua-form-factors)复用现有structured-headers与原identity/CrowdSec规则，补最后一个非弃用高熵字段。HTTP为sf-list，JS为字符串数组，大小写有意义；只比较列表内容，不把空/缺失或权限拒绝当真人证据。保留旧六字段payload兼容；不复刻解析器，不新增依赖、网络重试或UA覆盖。定点正常/矛盾/大小写/畸形/缺失测试后，用既有combined入口只跑新增控制及一条实际业务，不重跑旧十项异常。

D7当前Tor来源即将到期，先在source-refresh-8qjbNO用原refreshSource/configureSource取得实际新1174地址（published 2026-10-09T09:00Z，expires 2026-10-10T09:00Z），校验后才停owned engine加载三条原来源规则；原配置备份在stage/before，其它规则/edge未改，没有真实长窗任务。d7-source-refresh-start.log确认五服务ready=true，随后身份在线验收通过；刷新仍为维护动作，非自动热更新。

## 2026-10-09 E03 已校准WebGL判据接在线盾（本子项已验）

combined-r1fzbajl：完整4183四个实际case原生均测量正常，原72条BotD无额外阳性；单侧VENDOR矛盾实际原CrowdSec告警1、双侧一致无告警、缺WebGL2明确unavailable无bot告警。原生单click源站实际选择7，原输入采集trusted click保留。独立日志/业务/关闭复核保存independent-webgl-receipt.json。combined-fgfqof6z在同case暖会话用真实CSP阻止creep.js，实际securitypolicyviolation已确认；BotD仍measured、WebGL为error，报告明确区分，无假正常。1kj2rp7p首败是验收将原Page.evaluate的标量True当JSON解析，探针当时已error；改包裹对象只复测CSP分支，未重复前四控制。三Profile全部关闭并永久删除，0模型。

改动仅原creep-entry导出既有判据、collector异步有界采集、Zod三态输入与脱敏日志、report逐页有效性；复用原browser-marker规则，无新规则/阈值/白名单，无新生产依赖。新bundle e4b140b8；只重启owned origin，engine/edge未重启。已有验收BotD固定18条向量现在按其原版本投影，避免把新增Creep一条误拼入BotD协议；没有删旧判据。新增边界首败未知integrity字段→修复通过，类型首败测试fixture错误→真实IncomingMessage后通过，均保留日志。

Reuse Assessment: capability=将已校准的CreepJS镜像一致性接入真实业务遥测/原CrowdSec；existing=固定CreepJS10aa6724原webgl/getTrash、creep-entry及telemetry/browser-marker原规则；selected=仅导出原WebGL探针的三态结果、collector异步调用、Zod输入适配，复用已有browser-marker告警，不新增检测/风险引擎；license/runtime/platform=原MIT/原浏览器bundle和Node/Zod；ownership=一个owned可见Profile、无GPU原值持久化，finally原关闭；replay model calls=0；focused validation=真实原生业务无误报，单侧矛盾告警、双侧一致正常、缺WebGL2/导入失败不冒充正常，受影响原输入/采集仍工作。先做边界首败，再接入和实际HTTP验收；不重跑所有五探针或主业务准备。

D2固定分类实验未达到门槛：behavior-classifier-zdk_oga6用37人训练、10人完整留出；592有效独立正常/39跨采集器正常/本机3段全正常。但独立adaptive真实原始bot417段全部漏检，21段不足、1段时钟无效；正常203段全正常、1段无效。2628增强副本按预定元数据排除，未参与训练/验证；未把439bot session等同独立用户。未调参数、阈值或添加B-A-T训练数据，不能上线或关闭一般行为分类。首败d2-classifier-first为输入标签枚举拼写，cross-source首败为原数据两种容器形状，均修适配后才完成上述判断。候选运行依赖撤下，模型、来源摘要及报告留ignored可复现；独立人群数据缺口已补，分类有效性仍未解决。下一独立包E03在线联接不需用户操作。

## 2026-10-09 D2 独立行为样本补齐（进行中）

用户指出主线未完成却再次停下：当前无整体阻塞、无待用户操作，继续已授权软件工作。此次先补独立正常样本，避免再用单人三段冒充人群证据。AdSERP [Zenodo 15236546](https://zenodo.org/records/15236546)原数据说明为47参与者、2776次查询，CC BY 4.0；只读取约10MB鼠标数据与必要元数据，不下载屏幕录像/页面/眼动。不根据检测结果挑样本，不伪造缺失时钟/设备字段，不用于识别人。

Reuse Assessment: capability=已有行为判据的独立人群和跨采集器校准；existing implementation=固定Kitsune biomech原特征、js-bot-detector原规则及已有校准入口；selected implementation=先复用原算法和公开分组数据，必要分类训练只考虑成熟库公开API，不重造特征/模型引擎；license/runtime/platform fit=原MIT判据、CC BY 4.0数据、现有Python/Node；ownership conflicts=离线ignored研究数据，无浏览器和个人数据；replay model calls=0；focused validation=真实时钟/原用户分组/固定正常集、异常集与缺失分离，B-A-T不参与拟合。选型尚未冻结。

首轮完成：behavior-independent-l0061a33按原始mousemove/末500点固定契约读取全部2776条、47参与者；不插值、不修时钟，4条无效。Kitsune原0.05规则2759正常/13误报（12人）；同数据js-bot-detector原规则behavior-candidate-YK5Ioq有2754正常/18误报。只证明独立正常集表现，旧高级bot漏检未被关闭。新增数据下载首次使用concept DOI构造文件URL得404；改用原record API返回的具体文件链接20391173，不猜数据内容或误记源数据不可得。

下一次有限模型实验的预注册：只用固定Kitsune trace_descriptor六个原特征，不加入数据来源、用户ID、绝对坐标、UA或样本总数；复用[scikit-learn 1.7.2 RandomForestClassifier](https://github.com/scikit-learn/scikit-learn/blob/1.7.2/sklearn/ensemble/_forest.py)原fit/predict，BSD-3-Clause，Windows wheel。固定random_state=20261009/n_jobs=1/class_weight=balanced，其余默认，不网格搜索、不调分类阈值。AdSERP按参与者ID数字模5分组，0为完整未训练正常留出；原100条公开集仅bot（moderate/advanced）用于训练，原human全作跨采集器正常验证；新adaptive数据全作跨来源留出、本机单人三段及B-A-T全不参与训练。部署门：所有原有正常操作必须保留；有误报/高级漏检就如实保留，不因aggregate准确率高冻结为封禁器。实验依赖仅ignored独立目录，失败撤下依赖；不重写通用分类器。

新增来源核验：adaptive-captcha-defense固定c0d7b8513a79d49a760ad1827ebf1e6221eee0a3的LICENSE实际0字节，不因GitHub显示License入口而当成代码许可；其[独立公开数据20391172](https://zenodo.org/records/20391172)有CC BY 4.0，只可单独评估数据契约。CaptchaSolve30k明确无跨session身份、坐标归一到200网格且原输入只有固定采样序号，不能冒充独立用户分组或原DOM时钟。Balabit训练用户可区分，但数据是RDP用户身份任务、仓库无标准许可证，不直接当通用bot标注。GitHub REST首次遇到限流，元数据查询未成功；没有安装候选运行依赖。

## 2026-10-09 N04 高熵Client Hints

本增量已验：d1-high-entropy-boundaries.log三个定点组与typecheck通过；combined-k52o3uzj十个真实HTTP/JS正常字段、原规则十个独立矛盾告警通过。combined-pnvg88n3只补单次原生点击后的源站业务断言，version=7/correct=true，不重复13控制；combined-8qg0hgy_再用真实iframe Permissions Policy禁止高熵读取（非getter假值），原API确实返回低熵字段、高熵六项缺失，在线六项均unavailable、零误告警，正常业务仍到达7。三个Profile已关闭并永久删除，0模型。新增信息始终内存比较，报告没有原值。未重跑全部产品准备/发布；原冻结整链证据保留，本改动作用于盾的身份采集/对照，不改B-A-T身份或主业务。

当前实际结果：combined-k52o3uzj十字段原生正常、十单侧矛盾各一个CrowdSec告警、重排正常及低/高熵API缺失分离通过。独立业务复核发现旧验收最后click后立即finally关闭，未保存selected；本次有真实trusted click，12ms后窗口hidden，不能混同既往零事件。independent-business-first.json与independent-input-first.json保留；只补验收等待与源站selected断言，不改产品点击/加重试，下一次只验业务分支而不重跑13个控制。重启owned origin后首次status过早读到ready=false已保留，实际两秒后初始化且进程running；无engine/edge重启，不归因反爬。

真实缺口：identity.ts只对照UA及三个低熵CH字段，尚无Accept-CH/原getHighEntropyValues对照。沿[Chrome官方](https://developer.chrome.com/docs/privacy-security/user-agent-client-hints)与[UA-CH规范](https://wicg.github.io/ua-client-hints/)补architecture/bitness/fullVersionList/model/platformVersion/wow64六项；只在实验case响应请求提示，比较后仅落clear/mismatch/unavailable/invalid，不保存硬件/版本值。缺权限/缺头不判bot，桌面空model合法，品牌重排不误判，不增加Critical-CH重试。

Reuse Assessment: capability=已有HTTP/JS一致性判据扩展；existing implementation=identity.ts原structured-headers2.0.3+Zod、collector、CrowdSec request-identity；selected implementation=复用原RFC解析与规则，仅扩字段映射/Accept-CH及原浏览器API；license/runtime/platform fit=现有库/标准浏览器API，无新依赖；ownership conflicts=自有测试case+Profile，值只在请求内存，复跑0模型；focused validation=正常六字段、逐项单侧矛盾、品牌重排、空model、无权限/缺头及实际CrowdSec告警。仅盾增量，B-A-T保留原Chrome身份，不伪造提示。

公开Sannysoft诊断：public-probe-jonmhm3q当前可见ManagedWindow一次原生访问，实际读取25项均passed、无挑战，含CHR_DEBUG_TOOLS/SELENIUM_DRIVER/HEADCHR_IFRAME。原采样器未归一标签名换行，部分Intoli行未保存，因此只结算25项，未重新开窗补数字；静态urllib此前403不是B-A-T失败。0模型、Profile关闭并永久删除。该站复用fpscanner，与本地同库不能计作独立算法，非网站业务或“大多数网站”通过证明。

## 2026-10-09 E03 WebGL跨API原判据出口

结果：device-4m1jyzh8首测五分支均无比较出口、原对象lied=false，首败保留。补原getTrash出口及两种渲染测量有效性后，device-j5lit4ec实际可见Chrome单側VENDOR矛盾命中；原生、双侧相同变化及版本差异均正常，WebGL2不可用返回unavailable/null。先完成原生对象扫描再注入控制，五分支均getLies为空，排除用方法篡改信号冒充跨API判据。旧bundle/receipt保存于d4-creep-before-mirror，新24702ca6由原Rollup固定构建成功；上游源码/原始字段不改，不落硬件值。两个Profile关闭/永久删除确认，0模型。这是已有独立探针的本地判据校准，尚非CrowdSec在线处置，也不关闭WebGPU物理身份/跨硬件正常反例。

固定CreepJS的webgl模块已比较WebGL/WebGL2镜像参数，按原VersionParam排除版本相关合法差异；但差异进入getTrash而不是getLies，现有creep-entry只返回lied/getLies，漏了这条判据。拟只补原getTrash的规则名与比较有效性，不保存参数/GPU指纹，不改上游判据或历史能力哈希表。源码：[固定webgl模块](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/src/webgl/index.ts)。

Reuse Assessment: capability=已有跨WebGL版本一致性判据可见；existing implementation=固定CreepJS10aa6724原getCanvasWebgl/getTrash及现有测量页；selected implementation=扩原creep-entry脱敏输出、复用原ManagedWindow验收；public surface=原导出probe/getTrash，判据完全由上游计算；license/runtime/platform fit=沿原MIT/浏览器构建；ownership conflicts=一个owned可见Profile、finally关闭删除，不控制个人浏览器；replay model calls=0；focused validation=原生、单侧vendor矛盾、双侧一致变更、合法版本差异、缺WebGL2。此为镜像一致性，不能推出WebGL与WebGPU属于同一物理GPU。

## 2026-10-09 D1 来源数据有效期门

结果：d1-source-validity-first.log实际复现有效期被改后仍available、过期304未报错。最小适配后d1-source-validity-final.log四组边界通过（Node含父项5tests）：新鲜304不续期、损坏到期拒绝、过期304拒绝/200换新后可配置、503不损坏有效缓存；失败均保留已生成规则和原缓存。只扩原校验，lab start增加Tor与既有GeoIP并列启动门，未改检测阈值。d1-source-validity-typecheck.log通过，d7-status-after-source-validity.json现场5服务ready、两来源available；未重启活跃服务，启动拒绝本身按入口静态核验、未通过篡改活跃数据实测。长期进程仍沿原CrowdSec过期告警与维护刷新，不声称自动热更新。

发现可修软件缺口：Tor缓存读取只验地址摘要/数量，未校验expires是否仍为published+24h；refreshSource在过期缓存收到304时仍返回成功，configureSource和start也未拒绝过期Tor来源。原运行中CrowdSec stale规则保留，但不能把旧数据重新装入后显示整盾ready。先在独立临时数据目录复现，再补已有入口的校验；不重启当前服务、不清规则、不增加调度器。

Reuse Assessment: capability=外部数据有效性与启动门；existing implementation=source-data.ts/原Zod/Node fetch/原CrowdSec过期规则；selected implementation=只扩已有读缓存/刷新/配置/启动条件，无新依赖；license/runtime/platform fit=既有Node/Zod，Windows+WSL；ownership conflicts=测试仅本次临时目录，不改活跃服务；replay model calls=0；focused validation=正常缓存、过期304、损坏有效期、失败刷新保留旧数据及拒绝生成过期规则。盾适配，不改产品链路。

共享SW边界未变：[Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)允许无所属tab的请求，tabId为-1；换用该API仍不能据此取得共享worker逐请求归属，不扩大全Profile拦截。行为候选[BeCAPTCHA-Mouse](https://github.com/BiDAlab/BeCAPTCHA-Mouse)提供研究基准说明，但下载要求签署许可并提供联系方式，不是本次可直接采用的公开模型；没有代用户发送申请或安装依赖，原四候选结果保留。

## 2026-10-09 D6 未连接控制器的公开挑战对照

用户随后同意并亲自完成公开练习站验证：public-human-gqj0hiht先用原ManagedWindow交接并断开控制器，UIA确认存在验证勾选框；用户回复完成后，控制器仍未连接时UIA已确认成功内容。原ManagedWindow resume后再次读取到成功页；独立20ms租约观察确认owner/lease/session/target四项不变，0模型。关闭/Profile永久删除均已核。这是实际外站人工验证后的底层接回/内容读取；未测接回后的新HTTP请求，也不是正式TaskRun外站checkpoint验收，不能把旧自动初访403改写为自动穿透。

public-uncontrolled-w6dlgqon：普通可见Chrome、全新owned Profile，无CDP/automation/headless/证书绕过参数；仅通过[Windows UIA FromHandle](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.fromhandle)读取本进程窗口，15/35秒均显示验证页，未到业务成功内容。没有人工交互，不测HTTP状态，不能称真人验证失败或复现403；只排除“初始挑战只在连接B-A-T时出现”的解释。原B-A-T403仍未通过，不据此改控制接口或自动处理第三方挑战。

首轮a9yjb6_7选中同进程翻译气泡，documentCount=0，测量作废；改为同owner最大可见窗口后w6dlgqon取得3个Document节点。两个浏览器均关闭确认/Profile永久删除，原首败保留；无个人资料/系统信任变更。

## 2026-10-09 D2 后续行为候选实际核验

三项新增候选没有直接进入依赖：BotSight固定5c09da65只有训练源码、未附LICENSE或冻结模型，train_rf.py还把已算角熵覆盖为0；evolved-civilian/Behavioral-Biometrics-Bot-Detection固定c48e77fd完整Git树仅README.md，没有宣称的模型/实现。均不能据README准确率接入。[BotSight固定源码](https://github.com/abdulmalik505/BotSight/blob/5c09da65cba35199943a6c740edbf98e39c97f4e/train_rf.py)、[仅README候选](https://github.com/evolved-civilian/Behavioral-Biometrics-Bot-Detection/tree/c48e77fd4ff29872c1cada9b55335151173cff93)。

js-bot-detector固定2cd13e65、package1.1.0声明MIT且无运行依赖；读取原MouseMovementSignal/Signal后，仅下载这两个固定源码与package并核SHA到ignored候选目录，未npm安装/修改主依赖。behavior-candidate-i8SRgD原阈值离线复用原样本：公开44human中39时钟有效均不触发，5时钟无效单列；28moderate全触发，28advanced全部漏检；本机一人三段均未触发。一点数据原方法直接判可疑，缺失不能作正常阴性。属于跨采集器诊断，不报独立人群准确率；不调阈值，不替换既有盾或宣称一般分类完成。[原判据](https://github.com/niksbanna/js-bot-detector/blob/2cd13e65626a96864dd2d808e6a5a77187cc77f0/src/signals/behavior/MouseMovementSignal.js)。

复核CrowdSec1.8.1原cmd/crowdsec/dump.go与官方配置：--dump-data保存解析/注桶诊断，不是活动桶恢复入口。当前SQLite历史和精确配额已独立持久化；不为补表格另写通用漏桶恢复引擎。lab.ts start原本已有实际persistent-engine摘要校验，没有添加重复校验/重复构建。

## 2026-10-09 D2 颜色候选列表兼容（实施前）

固定Chromium154.0.8037.98原[color_suggestion_picker.js](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/core/html/forms/resources/color_suggestion_picker.js)实现候选色及other-color按钮，后者调用原initializeColorPicker。现有适配因list属性直接回退脚本写值；先用现有React输入页临时添加datalist证明实际事件与值，再沿原ColorWell的AX子树选择原按钮并复用既有RGB输入，不写新的控件/颜色解析/点击引擎。alpha/P3是否支持由本机实际Chromium决定，不把属性存在当能力可用。

Product Alignment: natural-language task=设置外观颜色或填写配置表单；reusable chain boundary=原type_text；runtime inputs=目标和值；dynamic task outputs=真实控件/框架值；generic platform capability used=原生颜色输入；replay model calls=0；site/task-specific code added=no。

Reuse Assessment: existing=task_special_input原ColorWell AX/RGB适配；selected=固定Chromium原候选列表/颜色选择器、B-U Element与Page键盘；license/runtime/platform=原BSD、Windows Chrome154；B-A-T-owned=原popup字段/按钮定位；ownership=同target且仅原ColorWell子树；rejected=重写颜色或OS点击引擎不必要；focused validation=候选内/外颜色、原RGB、框架提交和原生事件，资源走现有finally。未验证前不冻结新分支。

input-un_fphry/98nsa5az实际发现Actor回退不只是脚本事件，而是请求#123456/#112233均留黑色、React也错误。原生候选列表修复后input-noyq0n9z六项正确/零脚本；原popup按钮用页面坐标点击未进入RGB的s1su7z2d首败保留，改为同popup原DOM.focus和原Input Enter字符激活，不加OS输入/网页脚本click。Chrome154当前alpha/P3增强未启用，实际序列化分别#123456/#ff0000，不宣称已测宽色域或透明度。

下一处兼容修复复用固定B-U0.13.8的DefaultActionWatchdog._set_value_directly原方法（源码已核）：它已有特殊值、React原setter和事件适配，element_node参数在该版本未使用；Actor仅在原生适配明确不可用且控件可编辑时调用同browser/watchdog/target的原方法，并真实blur/focus提交。探索仍用原分支，不重复调用；原脚本事件如实保留，不能算原生化。验收保护超大range步数、step=any和alpha/P3属性下的当前浏览器值语义，不复制颜色或输入引擎。

最终input-s_lxi7za五项回退值/React/提交/焦点通过，各保留4个脚本事件；正常原生input-wrr9of6k的28项兼容继续零脚本事件。85drp71t/k4g0nj9j首败为值已正确但真实blur未发生、committed为空；同target原Page.press Tab产生实际焦点离开后再恢复，才关闭提交回归。所有本增量owned浏览器关闭/Profile永久删除。没有改采集、判据或测试页构建；临时datalist只在现有验收页本次文档内。新候选定位替换原list拒绝分支，移除验收器临时AX诊断分支，保留原始报告。

## 2026-10-09 D4 原跨上下文判据补校准（实施前）

固定CreepJS10aa6724的worker/index已比较platform/userAgent/hardwareConcurrency/deviceMemory；navigator/index还比较language/languages。已有独立devices入口正调用worker→navigator原函数，但验收只覆盖hardwareConcurrency、GPU方法和屏幕，不能把其余装载等同有效。复用同一入口/构建/一个owned浏览器，只通过临时Page预加载脚本制造各window单侧矛盾；正常原生与属性不可用分列，不新增页面/指纹算法或修改上游。只落规则名称/有效性，不落原始指纹，结束移除测试注入并走原finally。只验证未验原判据，不重复已过屏幕/GPU6分支。

结果device-ibbsdfem：原生正常无lies，五个单侧改写均出现同名Navigator告警，但未保存判据原因，不能区分对象改写和跨上下文比较。随后device-6px58rnw改为先让原原生对象扫描完成，再改变window值、调用同一原probe，并只保存固定原因“does not match worker scope”的命中名；平台/UA/设备内存三项独立比较准确命中，两个语言矛盾均无告警。这关闭了“被其它探针掩盖”的测量歧义，后者仍是未覆盖项。源码worker/index371前明确因Chrome正常切语言例外跳过；navigator/index194–204在两个API存在时提前返回，不改原判据去制造通过。HTTP/JS语言及数组内部一致性是不同判据。首轮device-wzuu9er5为验收器None解码错误，修对象包装后通过；三次窗口/Profile均收尾，未改探针构建/页面/产品注入，原CSP/缺Worker证据复用。


## 2026-10-09 D1 QUIC参数形状（实施前）

结果：h3-integrated-k872ytfk在线异常/正常/测量边界与独立抓包通过，20827e94已激活且实际进程摘要一致；H2流程combined-zl8z0j8h通过，0模型/资源收尾确认。d1-quic-shape-boundaries-final.log与d1-quic-shape-typecheck.log通过。四组原始ID/长度序列含2^61+17扩展与tshark一致；129额外参数真实请求200且测量capacity。以下“实施前/尚未激活”描述选型时序，不能覆盖本结果。

固定HAProxy的quic_transport_params_decode已经逐项解出type/len，包括随后忽略的扩展；仅在原解码成功位置保存有界128项ID/长度并导出，不另写QUIC解析。保留原始顺序用于独立抓包核验，不保留参数内容、CID、重置令牌。依据[RFC9000 18.1/18.2](https://datatracker.ietf.org/doc/html/rfc9000#section-18.1)，参数顺序没有协议意义，31N+27是正常GREASE；因此原顺序和GREASE不参与连续性判断。ID集合与初始源CID长度供原CrowdSec distinct规则作软关联，不能单独判bot或认证身份。

Reuse Assessment: fixed=HAProxy3.2.9-1ubuntu2.2原解码/生命周期及CrowdSec原distinct；adapter=有界元数据出口、有效性映射与规则配置；原LGPL/GPL许可/WSL不变、不新增库/进程。已有12项有效参数保持原路径；重复/越界/截断明确invalid/unavailable，不放宽协议。验收=正常Chrome重连/GREASE/换序不误报、同会话混栈实际告警、原始ID/长度与tshark独立一致、128项容量边界。超界只关闭该测量，不阻止原解码和正常业务。

本增量只改独立盾，不改B-A-T网络与任务链；原H3业务作为必要回归。代码/组件通过构建不算检测验收，结果随后写入实施记录。

冻结前复用_c0yc_c3原抓包发现正常冷/暖Chrome的ID集合相差12583，原候选会误报，保存d1-quic-shape-normal-first.json。[QUICHE原定义/序列化](https://github.com/google/quiche/blob/main/quiche/quic/core/crypto/transport_parameters.cc)明确0x3127为可选initial_round_trip_time_us；不把缓存RTT提示有无当网络栈切换。新关联只排除此已证动态项及RFC GREASE、忽略顺序，原始事实仍完整保留；旧12项规则与阈值不变。边界同时保护这一正常变化和未知大ID，当前尚未激活。

## 2026-10-09 D6 原生点击与前后台（按用户最新优先级）

用户说明此前玩游戏并切换前台，随后暂停游戏，要求优先完成焦点测试。不能把这条线索直接归因为用户操作。`combined-4wl6pb5r`同一owned窗口正常/最小化/恢复均收到完整trusted点击；`combined-r2zjqceb`同窗口六次冷挑战导航亦正常。`combined-9jri6mtt`公开动态页12→12、clicks=[]且无加载更多请求；`combined-lskbsztn`仅内存记录原CDP后12→24、坐标/会话正确，press/release约6ms应答。诊断成功仍不是首败修复；未加入点击重试、脚本click或生产抢焦点代码。

`combined-7l9jvyqc`用同一owned Profile的两个窗口，按[Windows GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)实际HWND核前台：前台/完全遮挡/恢复/按下前切走/释放前切走五组均收到完整trusted点击，后台组OS前台始终留在遮挡窗口、未误点遮挡页。完全遮挡时首次move应答5秒，其余约0–16ms；页面document.hasFocus可被CDP输入改变，不能代替Windows前台事实。首轮fg1s6st5直接创建无opener页面被原owner scope拒绝，验收器改走原window.open归属后才完成，产品所有权不放宽。

跨进程补测使用标准库Tk临时窗口，仅当前进程拥有、不接触个人应用。g_v_xnok未建立前台；pxtm3p2y用户回复已点击但观测未见目标前台、最终超时，均不算后台输入失败。SetForegroundWindow返回false符合[官方前台限制](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)，不等于Codex工具策略拒绝或用户开发授权不足。79q642j5调整对照顺序后实际建立跨进程稳定遮挡：OS前台保持Tk、页面hidden，仍完整trusted点击到原目标，前台和恢复两组亦通过。该次最后两组切换条件未建立，测试注入异常触发上游JS fallback，明确作废；uq_0mrj9尝试仅向本测试PID使用官方AllowSetForegroundWindow仍未建立条件，停止这条尝试。跨进程点击瞬间切换保持未测，不使用AttachThreadInput/全局输入绕过。

oyly6yze只在内存被动记录Windows前台归属和原TaskElement.click起止（10ms采样、不改Input命令、不切焦点）；真实公开动态页12→24，trusted按钮点击及加载接口200/H2。全程Chrome不在前台，说明普通背景状态本身不足以解释9jri6mtt/3isei3ss零事件。所有上述owned窗口/Profile均有关闭与永久删除收据。该结果只关闭普通前后台对照，不冒充历史首败修复，也不把游戏全屏/原始输入条件称已重现；后续停止重复同一焦点实验，追查有因果证据的软件路径。

## 2026-10-09 D3 宿主默认路径与明确策略的边界

正式链路回归`d6-navigation-product-regression.log`首败`capture_access_state_unavailable`：RunnerProcess总是传data/access-policies.json，即便从未创建。此前Python忽略不存在文件掩盖了这一调用契约；修复明确策略丢失后暴露真实兼容回归。修正宿主只在启动时发现默认文件存在才声明它，原runnerEnvironment显式配置仍优先；stat仅ENOENT代表未配置，权限/其它错误不可放行。已声明文件在运行中消失继续原拒绝。新增默认文件从下一Runner生效；已有文件内容仍逐请求按mtime重读，不引入热配置引擎。

Product Alignment沿D3原访问准入：普通网页/账号任务，无策略能运行，有明确策略的故障不能撤销限额，普通0模型、无网站特判。Reuse Assessment：仅用Node原fs.stat区分可选默认路径，复用既有spawn/env与Python准入，不增加库或存储。验收=现有受控Python child保护未配置/默认存在/明确缺失三个宿主传参分支，原真实浏览器缺失拒绝证据继续有效；随后重跑刚失败的冻结产品链路，不重新准备。

## 2026-10-09 D6 Actor导航早于defer脚本（先复现）

QUIC增量后H2业务首轮combined-9eth66wz点击SPA后未提交，原H2字段一致；ax610kwt补诊断后正常，不能叫首败已修。代码核验当前B-U0.13.8 Actor Page.goto只发送Page.navigate即返回，而原BrowserSession._navigate_and_wait已有按target/loaderId过滤的生命周期等待和同文档跳转分支。沿现有admission夹具只延迟defer脚本1.2秒，`d6-deferred-navigation-first.log`实际证明导航返回时按钮已有但handler未挂，单击被丢弃；这是可稳定复现的软件缺口，仍不能反推未保存点击状态的历史首败一定同因。

Reuse Assessment: selected=固定B-U原_navigate_and_wait(wait_until=domcontentloaded)，不新建网络idle/事件订阅/轮询引擎；TaskPage只把既有导航转接同一target的原方法，保留Fetch/CDP/采集/权限；原库没有Actor公开load等待API，局部版本绑定记录于此。DOM就绪超时必须显式失败，不伪称页面已好；DOMContentLoaded只保证defer执行，不代表任意SPA异步业务就绪，后者仍走已有声明后置条件。

Product Alignment: natural-language task=网页采集或表单/预约；reusable chain boundary=原普通导航；runtime inputs=url与既有target；dynamic task outputs=已提交并DOM就绪的页面或明确错误；generic platform capability used=B-U原生命周期；replay model calls=0；site/task-specific code added=no。验收=先复現的延迟脚本+单次原生点击、同文档跳转、原H2表单/SPA/303/API/缓存；不增加点击重试或模型。

## 2026-10-09 D1 QUIC原生传输参数（实施前）

结果：`h3-integrated-_c0yc_c3`首次在线通过，正常Windows B-A-T无TLS/H3/QUIC连续性告警，原quic-go混栈触发新增原CrowdSec quic-continuity；12有效参数与独立tshark一致，17000ms显式超时控制准确。原H3 62位/容量、ALPN首广告与独立JA4同时保留通过，0模型，owned浏览器关闭/Profile永久删除。新候选SHA256 772a9bb722f0c2d6a485af790e2b9894f988a8847a69275c46fa06c245b99386，旧候选在before-quic-params-20261009。`d1-quic-parameter-boundaries.log`缺失/协议回退/整数精度/7个非法边界及合法大声明通过，`d1-quic-params-typecheck.log`通过。此次只增加明确辅助判据，B-A-T保持Chrome原生参数，没有为过测伪造网络。

固定HAProxy3.2.9原quic_conn.tx.params明确是客户端发送、服务端须遵守的参数，rx.params是服务端自己声明，不能混用。复用原quic_transport_params_decode及原H3请求生命周期，导出RFC9000的12个流控/ACK/超时/迁移标量有效值；省略项由原解码器应用RFC默认值，不能描述为原始编码或字段出现顺序。不采集CID/重置令牌内容，不复制解析、重组、指纹评分或挑战。已支持H3 SETTINGS及头序保持不变。

Reuse Assessment: existing=HAProxy3.2.9-1ubuntu2.2固定源码/已验sample-fetch适配与CrowdSec distinct场景；selected=原QUIC解码后元数据→现有日志适配→原CrowdSec连续性辅助告警；license=原LGPL/GPL包与声明保留；runtime=现有WSL，不加进程/库；B-A-T-owned=有限字段出口与有效性映射；reject=单独接另一HTTP3服务器/自研QUIC解码没有必要；validation=真实Chrome正常复用/重连，原quic-go可控数值，缺失/越界，Wireshark独立解码，混栈变化实际告警。合法客户端可改变参数，连续性变化是辅助线索，不单独封禁，不泛化成真人证明。

依据：[RFC9000传输参数定义](https://datatracker.ietf.org/doc/html/rfc9000#section-18.2)、[HAProxy原生QUIC运行接口](https://cdn.haproxy.com/documentation/haproxy-runtime-api/reference/show-quic/)。CLI已有参数但非逐请求同步事件，故仅扩现有sample-fetch，不轮询CLI推断请求归属。当前还未运行验收；扩展参数/原始顺序和真实公网变化不冒充已测。

## 2026-10-09 D7 准备与已加载版本

补齐现有prepare-fixtures.ps1原worker/devices构建调用，纠正README首次prepare→GeoIP→网络候选激活→挑战候选构建/启动/激活顺序；不新增安装器。d7-build-workers.log及d7-build-devices.log构建通过，d7-loaded-builds.json核5服务owner、实际/proc/PID/exe与receipt、原源码/gofmt后补丁及3份HTTPS已服务制品摘要一致。首轮审计误将未gofmt源码直接比较构建摘要、第二次误用HTTP请求TLS-only4185，均是审计入口错误，独立记录first.json，未改服务迎合。此为当前机器可恢复/版本一致性，不冒充新机器从零安装已测。

## 2026-10-09 D3 已声明策略文件消失（实施前）

结果：定点首测d3-missing-policy-first.log复现未抛错，删除原fail-open分支后缺失/载入后消失/恢复不重置额度与原策略校验2项通过。admission-i8nc33yy实际浏览器初次1到达，配置消失后3次尝试/0到达，原capture_access_state_unavailable保留，0模型、closed confirmed/Profile永久删除。浏览器首轮ydk96sq4其实已经拒绝请求，但验收器在失败后重新取session又触发原错误而中止；改为事前保存gate引用，产品未再改，首败保留。

日常共享SW边界复核：[Chrome debugger官方支持域](https://developer.chrome.com/docs/extensions/reference/api/debugger#restricted-domains)不含ServiceWorker，targetInfo的tabId仅定义于page；相关worker附着不授予整个个人Profile的所有权。现有专属browser Fetch已验，日常tab Fetch不能据此宣称覆盖共享worker自主请求。保留未覆盖项，不禁SW、不扩大全Profile拦截、不默改用户浏览器选择；后续需要可验证的逐请求归属能力，或用户明确选择整个受管Profile的运行边界。本次没有这项运行验证，不能关闭D3整包。

实际代码缺口：`access_policy.acquire`把显式BAT_ACCESS_POLICY_FILE的FileNotFoundError当unconfigured，配置丢失后会放行。本次仅替换这一分支，沿原Admission错误拒绝/原PyrateLimiter持久配额，不新建配置或请求引擎。未指定策略仍保持unconfigured，未知origin只有成功读到有效策略后才可认定不受声明配额约束。先用现有Cooldown测试复现，再用现有真实admission入口证明请求未到源站；恢复策略不能重置已消费配额。

Product Alignment: natural-language task=采集网页或检查账号；reusable chain boundary=现有跨任务访问准入；runtime inputs=origin/明确策略；dynamic task outputs=请求或可见失败；generic platform capability used=原Fetch owner/持久配额；replay model calls=0；site/task-specific code added=no。

Reuse Assessment: capability=明确配置不可读时停止准入；existing implementation=access_policy/Admission/PyrateLimiter4.5.0；selected implementation=保留既有组件，仅删除fail-open分支；public surface=Path.stat及原异常路径；license/runtime/platform fit=标准库/既有Windows实现；ownership conflicts=不扩大浏览器权限；focused validation=缺失/缓存后消失/恢复配额/真实到达数。

## 2026-10-09 D2 color原生入口（实施前）

实际产品结果：`input-oyp4a1ng`原B-U探索七类控件全部原生事件，color从4脚本事件→0，值/React/blur提交/焦点正确。Actor连续兼容首败i_rl1iru/w510bfty/ljivtnsi：仅等待/enable均未解决，4wqpm4z2与5hohnt3v证明点击正确且trusted、原popup消费Escape，但AX未挂到ColorWell子树；先用原getPartialAXTree建立owner节点后，`input-l841yl5l`28项通过，含大小写/黑白颜色、两lang属性、原日期清空/闰日/范围精度。不是两种OS语言证明。暂时诊断分支已从测试移除，原报告保留；产品只留原native API适配，未复制输入引擎。当前仅Windows Chrome已验RGB；alpha/P3/datalist/其它平台保留原兼容路径和未验状态。

已在单个owned Chrome154.0.8037.98核验：原ColorWell的AX子树包含浏览器原生颜色popup，DOM.describeNode/DOM.focus可定位其r/g/bValueContainer，不依赖中文标签或坐标。固定Chromium154源码color_picker.js SHA b9fa996218bf4a9a14b36d2ee2a7ea4c501b289f0cd18db2f2b96f5298d7360a（BSD；[源码](https://github.com/chromium/chromium/blob/154.0.8037.98/third_party/blink/renderer/core/html/forms/resources/color_picker.js)）负责全部颜色解析/更新/关闭。Page.press数字不带char所以不输入；原Actor.fill在popup返回Node不属该document；Input.insertText未更新。原Input.dispatchKeyEvent char能进popup：input-qzgbklzt #abcdef及React state正确，3 input/1 change均trusted。前三种失败记录保留，不继续复用错误分支。

Reuse Assessment：复用Chromium原颜色选择器、AX/DOM/CDP公开接口与B-U点击/快捷键；只做hex→原RGB控件绑定和本次popup关闭，无OS全局输入、无第二浏览器控制器，不复制键盘或颜色引擎。缺原生popup/alpha或非sRGB格式保留上游fallback；不把未覆盖平台记通过。

Product Alignment: natural-language task=填写颜色字段或调整页面配色；reusable chain boundary=原输入节点；runtime inputs=目标与颜色值；dynamic task outputs=实际值/框架/提交；generic platform capability used=原Chrome控件与CDP输入；replay model calls=0；site/task-specific code added=no。

## 2026-10-09 D2 键盘/滚动联合校准（先测）

后续整链回归：`product-SaTblJ/resume-proof.json`复用原发布版，在最新访问/网络/行为盾下新建四次正式运行，7/11/13正确、99无资格分支正确失败、11次本次H2一致、普通0模型、四次cleanup confirmed。首轮resume_draft_missing来自验收器假定成功发布后仍有草稿，未启动浏览器；改为直接复跑冻结发布版，不改产品/历史，不重新调用准备模型。准备/试跑/发布沿用原SaTblJ证据；本次不是重新准备。此后color独立28项验证覆盖其影响路径，不无变化重跑整链。

结果：`joint-calibration-s3OgSI`既有真人3段键盘中位300.7/171.2/865.4ms，两原判据均未触发；真实B-A-T Actor/watchdog为46.5/31ms，未触发；原滚轮/键盘滚动未触发，程序跳转触发。输入测量首败`input-rck89see`是夹具无可滚动高度，增加本次运行的高度后`input-nu_h6h3p`可测。仍是单人局部校准，不能叫一般人机分类已完成，也不因局部阴性改B-A-T输入节奏。

在线复用原TS函数、MIT固定源码制品，通过现有collector/telemetry→CrowdSec；只保留最多128个匿名键盘时刻在报文内，持久日志仅判定，不记录字符/按键值；排除长按重复与IME合成键，缺触屏API/缺样本/倒退时钟明确不可用或无效。`combined-w8h0xwyi`完整4183下B-A-T真实输入阴性、8组正常/异常/缺失控制、3个原CrowdSec告警与真实表单提交通过，0模型/Profile永久删除。首轮`combined-lczsjsxh`已过判据但300ms后的URL断言失败，未保存当时页面原因；增加提交前值/有效性与5秒有界等待后通过，不能声称已证明首败根因或产品修复。滚动锚点/自动填充正常反例仍可能触发上游实验线索，不单独封禁；焦点单信号原Kitsune已列dead-end，不新增自造规则。

Reuse Assessment：复用已固定Kitsune f0a22b3的collector/src/behavioral.ts（本地原文件SHA256 238f681da2ce6b6a37a926a9214a269ce7215c84bdae59902165a37ec4c9ac87）公开keystrokeEntropy/keystrokeIntervalMedian/isScrollTeleport，以及原registry 0.15/30ms阈值；不重写统计算法。原规则均experimental/corroborating，滚动锚点/滚动条、浏览器自动填充/IME和键盘自动重复必须作为正常反例，不能直接封禁。用已保存单人三段数据和一个owned B-U会话先测；不把受控慢速轨迹称真人，不把后台或没有鼠标单独当bot。当前B-U Actor原18ms固定间隔、watchdog原输入及原滚轮路径保留，发现具体异常才改。候选无独立人群效度仍归X1。

## 2026-10-09 N06 当前GeoIP数据增量（实施前）

结果：`geo-source-iowd9nh4/current.json`原CrowdSec读库/时区一致与矛盾、IPv4/IPv6、私网/无效地址通过。首轮错误预设公共IPv6解析器为US，实际库记录CA，修正测试假设而未改规则。`d1-geo-validity.log`截止/未来构建/延长到期/重复文件/损坏校准及lab定点tsc通过。部署后`d1-geo-engine-maps.json`证明owned引擎实际映射两份MMDB，五服务ready；到期2026-11-05T01:36:12Z。启动拒绝缺失/损坏/过期，持续进程到期报告stale但不自动热更新，需要维护刷新。公网物理地理、旅行/远程及RTT仍未测。

原固定Hub的geoip-enrich确有公开下载，但现场HEAD显示City/ASN Last-Modified均为2026-02-05，不能在10月冒充最新。选用[DB-IP Lite 2026-10](https://db-ip.com/db/lite.php) Country/ASN月包（CC BY4.0、公开免账户）；HEAD为2026-10-01。已读项目固定geoip2-golang1.13.0的reader.go：DBIP-Country-Lite明确兼容City()、DBIP-ASN-Lite兼容ASN()，以及CrowdSec原GeoIPInit/IPToCountryString/TimezoneCountryMismatch。Country包4MB压缩即可覆盖现有国家/时区判据，不为不存在的城市规则下载60MB City包，不把无坐标记为坐标已测。

Reuse Assessment：复用原CrowdSec/geoip2/maxminddb读取、规则和MMDB元数据，Python标准gzip/curl只负责有界下载和部署，现有生命周期管理维护窗口；不改地理数据库格式或实现IP查找引擎。新制品先落独立候选目录并核build epoch/数据库类型/原函数实际查找，再启用。B-A-T原浏览器环境不改，无模型/账号信息；数据不入Git。报告及使用地理结果的实验页标明DB-IP许可和来源；保存源月份/摘要/实际build epoch/到期，启动与报告区分available/stale/unavailable，不能用下载时间续期。当前公网地理真实性/旅行样本仍需外部对照，不用公共解析器地址代表用户物理位置。

## 2026-10-09 D1 N04 HTTP与页面身份对应（实施前）

实际结果：`combined-jv0lwleg`经完整4183/B-A-T原生Fetch，4字段均clear且无身份告警；按原页面claim发6组明确标注syntheticPayload的控制，品牌换序正常，4单侧矛盾各触发原CrowdSec独立告警，缺API的3个字段保留unavailable；原业务点击成功、0模型、浏览器关闭/Profile永久删除。`d1-identity-boundaries-final.log`两组协议边界通过：RFC引号/逗号、任意品牌、非整数版本正常；格式/类型/超量/缺失、隐私空值不变健康负例。最小类型检查通过。未修改B-A-T的UA/CH来迎合盾，客户端联合造假仍是已证限制。

真实缺口：既有CrowdSec已包含Accept-Language/nav.language和UA/平台等原判据，但HTTP UA及低熵Client Hints与同次页面遥测的对应尚无在线验证。沿用原collector/telemetry及CrowdSec trigger，不添加页面、浏览器控制或综合评分引擎。只将同一请求的HTTP UA、规范化Sec-CH-UA/platform/mobile与浏览器公开值作相等性关联；原始值只在内存，日志只留各字段measured/mismatch/unavailable。此为可伪造客户端线索，不能认证真人。

Reuse Assessment：仓库没有Structured Fields解析器；选择`structured-headers2.0.3`（MIT、无运行依赖、Node>=18/Windows+WSL），npm固定gitHead `1c17b4402eb81e1c85247e881505d0ad83523dc4`，已读原parser.ts/types.ts，复用公开parseList/parseItem；Zod继续负责边界。依赖仅盾工具目录。依据[WICG UA-CH](https://wicg.github.io/ua-client-hints/)，低熵值与高熵授权分开，缺API/头不判bot，品牌顺序不当身份变化。不采用bot-signal2.0.18的整套引擎：实际analysis.ts的版本regex不解析RFC字段，语言精确匹配比现有CrowdSec基础语言规则更激进，附带GeoIP/列表与当前职责重复；没有必要为几个相等性关系引入整套引擎。B-A-T仅适配协议值到原规则，模型调用0，无控制/存储所有权冲突。关闭门：原生B-A-T正常/缺失/错误/单侧矛盾，正常品牌顺序及非Chrome品牌、受限API；原实际CrowdSec告警和输入/业务保留，未通过前不冻结。

## 2026-10-09 D1 首广告ALPN原生出口

H3原始字段增量已验：`h3-integrated-25ygwnnz`正常Chrome重复/复用与GREASE变化无协议告警；混入原quic-go空SETTINGS后，原TLS与新增原CrowdSec h3-continuity均触发；62位ID/值精确保留，257项容量标invalid，原ALPN独立tshark一致。候选SHA256 `d87fa0ec060daef5c26ca9d3fb214537331c92d04eb8298cf1667a79aba5f86d`。普通模型0、配置摘要不变、owned浏览器关闭/Profile永久删除。仅关闭所测SETTINGS/每stream伪头关联，不称所有QUIC传输参数或所有网络盾完成。

首轮测量首败`h3-integrated-9bbwzcvr`：Chrome三请求/两个握手原设置与头序有效，随机GREASE不改变关联；Go设置为missing，未产生新增H3告警。响应阶段候选`yl_oysud`仍失败，推翻“只因HEADERS先到”的初始判断。已定位固定HAProxy的h3_rcv_buf：零长度SETTINGS头经过原校验后，因buf为空直接break，根本不调用payload解析器；quic-go默认发空SETTINGS。候选在原帧校验后记录实际零长度，不伪造缺失默认值、不改协议处理。最终取响应阶段的连接事实，删除重复请求阶段取样；日志上限16384覆盖既定256项62位容量。原TLS混栈仍命中。旧候选及两次首败证据保留。

下一增量：HTTP3原始SETTINGS与每stream伪头顺序。继续复用已固定HAProxy3.2.9原b_quic_dec_int/qpack_decode_fs，不另接代理/协议解析器。原h3c/h3s生命周期保存最多256项62位原值及5种伪头名顺序，sample-fetch输出，无头值/Cookie。保持原协议错误处置。将非GREASE设置/顺序作为额外协议连续性事实交原CrowdSec关联规则；不按单个固定指纹直接认定机器人。成熟候选malivvan/server v1.0.2只有包文档可取得，GitHub源码404且API额度已尽，不凭README选型或引入另一整套服务器。当前未实现/未验，不提前记通过。关闭条件为已知字段控制、原生Chrome正常重复/复用、缺失/容量/HTTP2回退、原关联异常仍有效；QUIC其余参数另列。

验收更新：`tls-fragment-z8ueuwx7`四TCP边界、`h3-direct-saxjmoge`真实B-A-T/混栈异常/首广告不同控制通过；4个QUIC握手独立tshark一致。`h3-integrated-pi6offav`已删除临时第二套HAProxy服务，复用常驻4183通过相同控制：原configureEdge增加本机当前WSL私网TCP/UDP绑定，start在edge尚未运行时重取地址并校验配置，Windows验收只在owned Profile中指定本地解析。原管理/源站仍回环，仅完整盾入口可由Windows直达；原五服务启动成功，配置验前验后摘要相同，Profile永久删除。个人DNS/证书未改；其它QUIC字段未完成。

H3候选排除：已读[Stylobot固定2c494594的Http3FingerprintAtom](https://github.com/scottgal/stylobot/blob/2c4945940a18ec615607a2ac71e0f612e8939242/src/Mostlylucid.BotDetection/Orchestration/Atoms/Http3FingerprintAtom.cs)，AGPL-3.0/.NET，读取外部注入X-QUIC头，内部没有SETTINGS/QPACK采集；主要是运输参数词表、0RTT/迁移加分，缺信任服务时默认信头。不能用它关闭当前首跳原始采集缺口，且额外引入完整.NET检测编排不符合薄适配；暂不引入。H3原始SETTINGS/头序及QUIC其余参数保持具体软件待办，不因候选宣传算覆盖。

真实缺口：TCP preread遇分片会partial，QUIC没有该preread而使用协商结果，首广告与协商不同时JA4不正确。固定HAProxy3.2.9的ssl_sock_advertise_alpn_protos已收到OpenSSL校验的客户端列表，原ssl_capture已有SSL对象生命周期。候选在原capture中保留至多255字节首协议并提供一个sample-fetch；复用原JA4 Lua计算，替换旧preread来源适配，不实现QUIC/TLS解码、加解密或重组。依据[OpenSSL3.5 ALPN回调](https://docs.openssl.org/3.5/man3/SSL_CTX_set_alpn_select_cb/)及已校验Ubuntu源码。原Ubuntu安全补丁/原发行binary保留，选择校验覆盖新recipe。

Reuse Assessment: 成熟原HAProxy/OpenSSL负责TLS/QUIC和ALPN，B-A-T仅导出首广告元数据；无新库/检测引擎。产品不伪造TLS参数。需要TCP首广告不同/缺省/分片及真实H3首广告不同控制，独立tshark对照；然后原异常关联必须仍触发。当前仅设计，不以采集新增报检测通过。

## 2026-10-09 相关SW产品适配验收更新

最终替换：`admission-0a6jp5r5`采用Chromium原browser-target Fetch后，同Profile真实浏览器重启、保留原SW注册，跨重启共2次到达，重启后8请求仅余量1获准。删除RelatedWorkers/OwnedWorkers及其Target回调/Network探测/时机分支。固定公开实现[BrowserDevToolsAgentHost](https://github.com/chromium/chromium/blob/main/content/browser/devtools/browser_devtools_agent_host.cc)本身提供FetchHandler，[URLLoaderFactory原接线](https://github.com/chromium/chromium/blob/main/content/browser/devtools/devtools_instrumentation.cc)对browser Fetch统一处理，不必等SW target创建后再安装。仅已核验专属Profile整体请求采用此入口，日常/账号借用仍限批准页面，不触个人target；原B-U页面/代理认证责任保留。

旧SW方案首败均保留：3qzql4lp为related重启漏口，v_kgkpl0扩大SW监控仍漏；0lh3inww及后续类型/原生target诊断证实目标已附着、Fetch安装完成后后续批次会限流，但首次8次已漏过。此前将其直接归因未附着的解释不成立；原browser Fetch在网络factory建立前接入，消除这条安装时机缺口。新`admission-f6w01b32`页面缓存/302/配额/到期/冷SW/429恢复通过，`admission-e38pbiyz`原407认证通过。响应统一入口还复现了Fetch+Network重复加罚2次（d3-response-owner-first.log）；修复为Fetch持久化、Network保留文档采集/状态，2项定点边界通过。`cooldown-eqxi1U`两个真实Runner、无Retry-After的30秒实际到期恢复通过，到期前源站仅1请求、其它origin正常、0模型，Profile永久删除。

## 2026-10-09 D6 现实场景增量

D3后续结果：专属账号暖SW首败`admission-qj2dwrjv`及仅browser Fetch候选`ho6zip9r`均8/8漏放。固定Chromium原[BrowserDevToolsAgentHost](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/browser_devtools_agent_host.cc)给FetchHandler的更新callback为空，已运行页面/worker不会自动更换URLLoaderFactory。复用原Target/Fetch接口，对已核验owned专属Profile内现存target临时启用空patterns→原厂factory更新→detach；不重启/注销Worker、不改页面内容、不关闭缓存。该命令不放行任何请求，唯一配额责任仍在browser Fetch。没有新增连接或通用协议引擎。

`admission-myu1fect`证明账号借用保留暖SW、共享余量1/8、429→0→真实到期、账号Fetch与导航每个响应只记1次；首次2vdfk29y揭示只刷新worker而不刷新页面时账号429未被捕获，已覆盖全部现存页面/worker。`admission-it5cw_10`同一浏览器handoff→resume共享配额通过；首败vjio1i2l及n5ikjmol保留，后者揭示B-U TargetScope枚举过滤了worker，使用functools.wraps保留原API，仅已核验专属入口取原native快照，SDK日常页面枚举/原权限过滤不变。`admission-osxgpbkw`原账号缓存/损坏策略/共享预算回归，`admission-nkhsz5hg`原407认证通过。所有Profile永久删除、0模型。日常共享SW仍未覆盖：Chrome扩展的tab级所有权不能推出共享worker仅服务本任务，不能把本方案扩到个人Profile。

Product Alignment:
- natural-language task: 原浏览器任务在人工/账号交接后继续访问与读取。
- reusable chain boundary: 原任务链/节点不变；跨控制阶段访问准入保持。
- runtime inputs: 原目标URL、明确origin策略与持久冷却。
- dynamic task outputs: 原动态结果及真实访问受限错误。
- generic platform capability used: 原ManagedWindow/账号借用、原CDP Fetch与持久配额组件。
- replay model calls: 0。
- site/task-specific code added: no。

实际结果：`combined-ba1bbs5l`最新browser Fetch下原完整HTTPS表单/SPA/303/API/缓存通过，9TLS及9H2有效，正常case无invalid/detected，原缺前置异常仍告警。`combined-kzx3ovko`外站图书两页各20项成功；动态页首轮未增长；Cloudflare专用页实际403、cf-mitigated=challenge与挑战资源，20秒仍未放行，明确未通过。增加网络/原生点击诊断的`combined-64_1nw1e`实际BUTTON trusted点击、Fetch200、12→24成功且无加载错误；没有改产品，首次失败原因尚不能归因。单次诊断成功不算修复首次失败。两者owned资源均关闭、Profile永久删除。

下一独立缺口：专属账号借用在原B-U handoff后仅附着page Fetch，已存在的SW可能继续绕过主动预算。复用[Playwright原new_browser_cdp_session](https://playwright.dev/python/docs/api/class-browser#browser-new-browser-cdp-session)与同一Admission，仍只针对已核验ManagedWindow的专属进程，daily不扩大权限。正常窗口/账号页借用不增加第二个实际浏览器会话。产品网络/输入/采集职责不变；请求与响应统一持久化需去除账号导航/Fetch上的重复remember。先实际暖SW基线，再最小替换和原账号缓存/限流回归。

在最新原生browser Fetch后复核原完整HTTPS业务；另复用同一个ManagedWindow/TaskBrowser验收入口做少量公开页面任务，独立记录真实站点结果。选取[Books to Scrape](https://books.toscrape.com/)原站明示scraping sandbox、[ScrapingCourse](https://www.scrapingcourse.com/)原站公开动态加载及Cloudflare挑战练习，禁止登录/个人数据/验证码自动作答，单次导航和一次加载动作，无循环撞挑战。这些是第三方站点兼容/已观测防护证据，不代表所有商业站点或人工同条件对照。

Reuse Assessment: 保留原B-U Actor、TaskBrowser、ManagedWindow finally和原证据结构；仅在已有combined验收中增加场景选择，不新增浏览器控制器或检测库。来源[Cloudflare公开检测引擎](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/)区分JS/请求/会话/行为；观测server/cf-mitigated/协议与资源路径类别，不能由Cloudflare CDN响应头推断该页启用了Bot Management。外部挑战停留将单独记失败或需人工，不自动求解。

重启反例更新：`admission-3qzql4lp`同Profile保留注册、实际重启后8/8漏放。[Chromium FrameAutoAttacher](https://github.com/chromium/chromium/blob/main/content/browser/devtools/frame_auto_attacher.cc)明确导航发起时可能不附着已有SW，related的页面URL归属与初始about:blank存在时机缺口。替换为原生browser-target子session的setAutoAttach，仅filter service_worker；**范围是本次ManagedWindow可证明拥有的整个专属Profile的SW请求**，持续时间仅B-A-T控制期间。原页面/iframe的B-U root session不改，日常个人Profile不启用；不停止或删除SW。删除related/pages缓存分支而非叠加第二套监控。验收要求原注册保留、实际重启、余量1下8次只1到达；未通过前此项仍缺。

下文SW“API可行性/尚未接入”的阶段状态已被`admission-wbv4yfg5`替代：原ManagedWindow明确标记Profile归属，只在该专属路径启用原生相关SW监控；共享同一原准入器，Request阶段准入、Response阶段沿原remember记录429/503。剩余1次下8请求仅1到达；429后第二次零到达，2.2秒真实到期恢复。日常共享SW不在此所有权中，仍待处理；暖启动/重启尚未验。未新增解析器、浏览器连接或窗口调度。

## 2026-10-09 D5 BotD process 正常缺省校准

后续D4真实扩展证据：admission-fgfrl1lv的任务控制准入与原fpscanner hasCDP阴性通过，账号borrow的损坏策略仍放行。定位原BrowserModel仅向borrow别名转发Overlay事件；Fetch.requestPaused仍发主Playwright session，原driver在无route时直接continue。新增适配只在该tab已经批准的Fetch.enable借用期间指定唯一requestPaused收件方，保留原auth收件方，detach恢复原Fetch配置；不广播导致双continue，不重建CDP或网络引擎。需真实扩展重测及别名释放/原auth/无关tab的定点边界。首轮x8yvl63e是误用要求网关凭据的4189探针入口，修测试使用已有4185和仅owned Profile本地SPKI。

D4修复已由admission-_vzu9yie真实扩展及2项协议边界通过。SW原生可行性：admission-j8ukd77x在同一CDP连接创建仅服务相关SW的browser-target子session，autoAttachRelated绑定当前owned页面，不覆盖原B-U autoAttach；新SW原8/8漏过变为剩余1/8到达。此报告是API可行性，尚非产品接入。下一适配只给可证明由ManagedWindow拥有的专属Profile启用，配额明确聚合该受管Profile中与任务页面相关SW的网络请求；日常个人Profile可能共享SW，不能借此全局暂停/附着，保持该分支未覆盖。人工handoff释放监控。复用原CDP暂停/恢复和原准入库，不删除SW或改网络栈；SW响应429/503的测量与退避也须覆盖。

D3页面/账号/普通Worker/原代理认证、共享状态和取消已增量通过；SW自主请求漏口保留为软件待办（admission-65_bhfwq）。原生Target.autoAttachRelated会取消原setAutoAttach，不能直接覆盖B-U root会话；共享SW可能服务无关个人页面，后续必须在明确所有权下接入。官方依据：[Target协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl)、[Chromium TargetHandler](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/protocol/target_handler.cc)。先继续不依赖该接入的D5正常反例缺口。

固定BotD2.0.0 / 66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47原[source/process](https://github.com/fingerprintjs/BotD/blob/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src/sources/process.ts)明确将普通页面window.process不存在表示为Undefined；[detectProcess](https://github.com/fingerprintjs/BotD/blob/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src/detectors/process.ts)仅对renderer/electron阳性。现有适配把正常不存在统一归入partial，导致正常浏览器固定telemetry-invalid，属于测量状态映射错误。最小修复仅将确切的process/Undefined/原错误文本记expectedAbsence，保留原state、原detector和全部18规则；getter抛错/非对象/其它缺失仍invalid。验收须普通缺省、Electron阳性及读取抛错三组真实页面，不能仅改状态后宣称健康。

Reuse Assessment: 复用原BotD公开组件与判据，不改bundle制品/检测阈值；自有适配只解释固定版本的错误状态。无新依赖，无产品浏览器伪装、采集关闭或白名单。新增/替换跟随原collector和probe入口，不另造环境探针。

## 2026-10-09 D3 接入契约与原放行责任

固定B-U0.13.8源码更正：`BrowserSession._setup_proxy_auth`在没有username/password时直接返回；有凭据才注册原authRequired与requestPaused无条件continue回调，SessionManager也只在该条件启用Fetch。不能把它描述为所有会话始终启用，也不能在有代理认证时再注册一个竞争放行器。后续适配优先在现有continueRequest出口统一准入，保留原认证处理；无代理路径只设一个放行责任方。仅作用于本次产品控制的页面/子资源，不在个人浏览器全局启用拦截或暂停所有target。

主动治理候选契约：显式按origin声明限额，跨B-A-T执行/Profile共享计数；没有已声明策略时标为未配置，保留已完成Retry-After退避，不猜网站隐藏配额、不套盾的60/h或240/day。配额计入客户端实际准备放行的HTTP请求尝试，和网关/源站到达数分别报告；重定向、缓存与SW须实际验证覆盖，不能把节点数当请求数。耗尽后不发请求、不自动重试或问模型，交还已有受限访问/恢复语义并保存到期时间，不能无限占着浏览器等待。

Reuse Assessment：复用盾已固定的PyrateLimiter4.5.0 SQLiteBucket、put_decision/leak和filelock3.19.1（归档SHA在artifacts.json，MIT/Unlicense），不自写限流算法/SQL锁。以单一薄适配供客户端和实验配额调用，删除被替换的重复实现。当前Windows产品venv尚无这两包，安装仅在该venv内并加入固定hash runtime-requirements，不改B-U frozen lock。共享算法不是独立到达验证，真实测试须另核原CrowdSec/网关计数。

Product Alignment：资料读取、预约/表单、账号检查共用访问准入；预算输入来自声明的站点策略，普通复跑0模型，不新增网站特判或调度引擎。先完成所有权与最小真实请求校准，再扩大到其它阶段/自主流量；部分可控覆盖不得结算为完整D3。

## 2026-10-09 D2 非文本控件：先复现再适配

`input-6xczwtc9`先在真实React受控组件复现原生探索：date/time/datetime-local/month/week/color/range各4个脚本事件，值及state正确，但模拟blur没有更新React提交状态。`input-vhfbw4ow`只读DOM证据确认Chromium本身拥有日期/时间的语义spinbutton子字段；颜色只有色块，不能将日期方案外推颜色。两次owned浏览器已关闭且Profile永久删除。

Reuse Assessment：固定B-U0.13.8原`_set_value_directly`针对上述类型直接赋值并dispatchEvent；[Playwright1.61固定源码](https://github.com/microsoft/playwright/blob/v1.61.0/packages/injected/src/injectedScript.ts)的fill同样对上述七种类型赋值/合成事件，换一个fill库不能消除此问题。候选复用Chromium已实现的日期字段/范围键盘行为、CDP的DOM.describeNode/DOM.focus及现有B-U Page.press，仅适配标准ISO值到原生字段；不重写键盘、日期选择器或输入引擎。实现前先核实际DOM字段，修改后用值、React state、实际blur提交、事件与焦点共同验证；不以trusted推断真人。颜色/不支持类型保留兼容能力并继续列缺口，不能删除功能换通过。

Product Alignment：日期预约、资料筛选、通用表单等共用输入能力；普通节点输入仍来自任务参数，输出/模型调用/采集与主链不变；site/task-specific code added: no。候选实现仅当前Browser实例hook，不修改安装库源码。

## 2026-10-09 D1 同连接H2采集扩展（已校准子项）

运行结论：固定候选SHA256 `378005719314abb0b939310b937823c836ae6eb0d27d5561998d28181ee9c218`，原发行binary保留；`h2-integrated-z4zmsgkf`验证完整4183入口九组协议、原始16位ID/32位值、WINDOW_UPDATE、分片/每stream头序、独立Hypercorn一致性、缺失/容量及伪造转发头。原CrowdSec仅对混栈正例告警。`combined-hxw_fp77`三项真实B-A-T目录/预约业务通过，原浏览器标记/脚本输入正例仍触发；不是自然语言完整产品验收，后者单独执行。H3完整字段和其余跨层判据仍未关闭。

首败：控制发送器不补DATA流控导致Firefox窗口耗尽超时；空SETTINGS被HAProxy日志表示为“-”。分别修测试客户端流控和显式empty元数据，未改Kitsune判据/阈值；报告`h2-integrated-u0viw72n`、`h2-integrated-bsh_ppvt`保留。构建缺crypt.h/链接变量失配也保留build.log。未来重建命令为`python tools/antibot-lab/prepare-edge-h2.py`，停止owned服务后`lab.ts activate-edge-h2`校验源/适配/binary摘要并选择候选，`lab.ts start`仍走原生命周期；选择不自动标记检测验收。

已核当前edge.ts：4183→4181终止客户端TLS/HTTP2，再由HAProxy重建到4182的连接；4193 Hypercorn是独立入口。把4193直接接在HTTP代理后会得到HAProxy的SETTINGS/伪头顺序，不能称客户端检测。Hypercorn原生事件接口已可独立校准，但将它改为完整代理还需新的转发与PROXY身份适配；已有NGINX候选需额外OpenSSL/NGINX补丁，不优于扩现有入口。

Reuse Assessment：继续HAProxy3.2.9-1ubuntu2.2（GPL-2.0-or-later）原TLS/H2/HPACK/QUIC与代理引擎、原JA4 Lua、固定Kitsune判据及CrowdSec规则。选定候选是对HAProxy原解码结果增加有界只读sample-fetch出口：原始初始SETTINGS及每stream伪头顺序，不实现帧解析/HPACK/代理，不改变协议验证和处置。沿原日志/原h2服务把元数据送原分类器；HAProxy日志不写头值/Cookie/解密密钥。保持原Ubuntu安全补丁和编译功能，不用未打发行版补丁的旧上游替换已安装binary。原二进制保留，候选校验后显式选择；额外成本为固定源码编译，不新增系统代理或产品依赖。

源码依据：[HAProxy固定3.2.9归档](https://www.haproxy.org/download/3.2/src/haproxy-3.2.9.tar.gz)，官方SHA256 e660d141b29019f4d198785b0834cc3e9c96efceeb807c2fff2fc935bd3354c2；Ubuntu对应dsc/debian补丁与现用3.2.9-1ubuntu2.2一致。原mux_h2.c的h2c_handle_settings、hpack_decode_frame返回处及h2c_frt_stream_new已读，前者已有完整帧/16位ID/32位值校验，后者仍保留原伪头顺序。候选只导出元数据，原算法与内存所有权不另造。

focused validation：先真实TLS控制发送已知SETTINGS/伪头，检查16位扩展、分片、同连接后续不同顺序、超量不可测及H1回退；与原Hypercorn独立结果对照，再在完整4183原规则下证明异常进入CrowdSec、正常B-A-T业务通过。通过前不关闭N03/D1；后续H3完整字段仍是独立缺口。

Product Alignment：适用于资料读取和表单任务的同连接网络身份测量；复用现有盾与产品验收，普通复跑0模型；本候选仅盾元数据适配，无产品网站特判、不替换browser-use。

## 2026-10-09 讨论结论：盾必须对齐真实反爬机制

本次仅整理已核资料和已有结果，不新增依赖、候选引擎或运行试验。执行范围/教训见[主计划0节](ANTIBOT_NEXT_SESSION_PLAN_20261008.md)；下文“用户睡眠/关机”的安排是昨晚历史，不能作为当前继续开发的全局阻塞。

当日对话已核对[Cloudflare检测引擎](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/)与[AWS Bot Control官方规则说明](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-bot.html)。前者明确结合请求/浏览器/会话信号、JavaScript与机器学习；后者明确静态请求分析、浏览器检查/指纹、行为、会话token、限流及挑战。这证明这些机制在真实产品中使用，不证明各站启用了相同阈值，也不证明现有开源判据与其专有模型等价。

| 实际机制族 | 当前实现/不足 | 对应开发包 |
| --- | --- | --- |
| 网络、请求与浏览器身份一致性 | 已有首跳TLS、独立H2与H3混栈关联；完整入口/协议及跨层字段仍缺 | D1；不能只测JA4字符串或网关回源 |
| 浏览器环境、自动化与跨上下文信号 | 已有BotD/fpscanner/部分CreepJS与CDP改善；日常扩展、剩余设备/worker/API分支未结清 | D4/D5；探针安装、字段采集不算有效检测 |
| 行为与序列 | 输入原生化/轨迹、CSRF前置已有结果；三行为候选校准未满足一般分类，键盘/滚动/焦点联合项仍缺 | D2/D3；CSRF和连续曲线不能代替人机分类 |
| 会话、请求历史、频率与关联 | 原CrowdSec规则/挑战、SQLite配额、短时状态和合成关联已验；全阶段主动访问治理未完 | D3/D4/D5；真实历史/公网数据与软件机制分别结算 |
| 挑战、验证token与处置 | 原挑战、消费持久化、真人处理后恢复已验；非公开模型、真实issuer及遥测可信边界仍需明确 | D5/D6；人工恢复是产品能力，不把实验验证码强度说成商用等价 |

后续机制覆盖记录必须有：真实产品/公开源码依据、查询日期、具体信号与判据、现有组件、正常/异常/缺失样本和B-A-T路径。优先补共同机制；对Akamai、国内WAF等既有来源按当前缺口增量核验，不因只有两个厂商的资料就报“大多数网站覆盖完成”。真实场景发现本地漏项时回填对应D包；不让现实校验成为绕开本地盾建设的理由。

架构事实：盾为CrowdSec独立服务＋开源组件＋适配/配置，确实包含固定CrowdSec挑战持久消费补丁，见prepare-persistent-engine.py/spent_sqlite.go及实施记录。日常与专属模式的差异需拆为Profile连续性、可见/无头和控制传输；[Chromium数据目录说明](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md)确认Profile保存历史/Cookie等，[Chrome debugger说明](https://developer.chrome.com/docs/extensions/reference/api/debugger)确认扩展也可作为调试协议传输。持久专属可以保留正常站点状态，不应把临时冷Profile实验外推成“专属天然更假”。

## 2026-10-09 后续主动访问治理的未决边界

已实现跨阶段/Runner的429/503冷却、明确Retry-After与无期限退避，且原源站请求数证明有效；这是响应后的访问治理。主动配额不能把盾实验的60/h、240/day硬套给所有真实网站，也不能把nodeDelayMs变成“已限真实请求”。准备/复跑/账号检查可以共享既有DiskCache状态；浏览器自主资源、Service Worker和重定向的逐请求准入还没有实现。

再次核固定B-U eb412692的session.py:1838–1957和session_manager.py:436–449：原代理认证会在root、当前和新session启用Fetch，注册requestPaused后无条件continueRequest；另加独立拦截器有多处理器争抢放行和所有权冲突，不能仅新建一个limiter后称接入完成。PyrateLimiter4.5.0原SQLite窗口已经在盾的真实并发/重启/短窗验证，算法不需重写。下一步仍应适配原网络处理链，先明确每站主动策略的来源/范围、静态与自主请求是否消耗、额度耗尽等待还是暂停、跨账号是否合并；这些会改变用户任务行为，当前没有已确认的产品契约。此项是未完成的软件/策略工作，不伪装为开源组件不存在或所有本地工作已完成。

行为模型的三候选原阈值校准均未满足一般真人正常反例；新训练/再校准需要独立参与者与设备样本及允许的误报验收口径。用户睡眠期间不能补真实样本，不复制单人片段扩大分母、不调阈值让B-A-T过。真实公网身份/硬件issuer/跨天仍另列。按本次明确“无法独立作决定也关机”的指令，保存这些具体未决项，不等待用户继续操作或保持跨天作业。

## 2026-10-09 H3 私网直达校准门（实施前）

实施结果：`reports/h3-direct-e9dozewa`实际Windows B-A-T使用h3，原CrowdSec冷挑战后业务/Fetch200；Chrome初始/PSK恢复保持同TLS族，无协议连续性误报。同UA/同实验Cookie的quic-go0.55.0原HTTP3客户端形成第二TLS族，原CrowdSec触发。独立tshark从QUIC Initial解析的3个JA4变体全部与HAProxy一致，无TLS密钥落盘。只结清本地H3跨栈关联子项，不外推H3 SETTINGS/所有QUIC特征或公网；首广告ALPN通用状态仍partial。两次临时WSL私网服务均关闭、捕获正常结束、Profile永久删除，原常驻配置SHA不变。可复现入口`apps/api/tests/antibot-h3.acceptance.py`与薄Go客户端，测试专用DNS/SPKI/QUIC flags不进入产品。

首败`h3-direct-htnah8fi`已实际h3且两种网络族测量正确，但临时HAProxy日志只写报告目录，没有进入原CrowdSec采集路径，故没有告警；这是组合测试接线错误，不是已证检测通过。修复仅令临时服务stdout追加现有logs/tls.jsonl，再以唯一case关联取回，规则/阈值未改。首败normal/mixed/pcap及清理证据保留。

复用现有HAProxy3.2.9的原QUIC/TLS能力及原CrowdSec协议连续性规则；仅临时owned服务把原配置的监听地址改为实际WSL私网IPv4:4195，内部终止4196，不改常驻服务/系统防火墙/WSL网络模式。Chrome独立Profile使用官方`origin-to-force-quic-on`、单host解析及已有SPKI pin；目的在于避开WSL NAT localhost不转UDP的测量障碍，不加入产品启动参数。依据Chromium官方playing-with-quic文档；证书与个人信任不变。正常B-A-T冷挑战/原生Fetch应实际h3并无协议关联误报；随后同实验会话混入固定quic-go0.55.0原http3.Transport（MIT、Linux已构建），期望原transport=q独立桶识别不同TLS族。只消费公开HTTP客户端API，不复制QUIC引擎，不外发Cookie；测试Cookie仅stdin/内存，资源finally核owner后关闭，抓包只4195/40秒/4MB。

Kitsune固定f0a22b3的detection-catalog.md已把quic_grease_vs_ua/quic_pq_keyshare_vs_ua列为retired，原因含其捕获链未充分验证；不能把其README的HTTP3字样当成熟可用判据。本次只校准已有实际跨请求网络族关联，原JA4 QUIC广告ALPN仍partial，不重新启用上述退役规则。

## 2026-10-09 N03 在线校准结果及富文本输入

`reports/combined-_bof1ng_`：9项真实TLS/H2控制（两组一致、两组矛盾、空/未知、16位扩展、分片、复用）和2次实际B-A-T原生请求通过；原CrowdSec仅两个矛盾场景命中。`h2-boundaries-c_zlt20a`容量超限/HTTP1明确unavailable，伪造转发头不改变来源；`h2-reused-order-xwxm4o4r`同连接第二请求改伪头顺序实际触发，避免复用首请求顺序漏报。4193为独立首跳H2层，未与4183首跳TLS合并，未证明HTTP3。

首次`combined-i71d1es7`失败来自测试发送库hyperframe6.1.0 SettingsFrame.serialize_body中的`setting & 0xFF`，16位扩展43981实际发成205，服务端记录正确。仅测试发送器按RFC的uint16/uint32打包，接收库/判据不改；首败日志与清理保留。原Kitsune上游LF文件SHA为6b391de9a21b4de97468edfb8438662ff05793a1d2ab69082e7b273b7ef199ef，旧离线CRLF副本SHA不同但换行归一后相同。离线构建改用h2-hints-offline，避免覆盖在线进程使用的二进制；在线start核摘要、WSL Python>=3.11和实际checkout归属。

富文本沿已有B-U0.13.8输入适配复用Page.press及原填入引擎，不增加依赖。上游Actor清空仅赋this.value，contenteditable真实内容残留；原watchdog清空/commit合成事件。源码为固定eb412692的actor/element.py:886及browser/watchdogs/default_action_watchdog.py:1242、1931。产品仅扩已有STATE空值识别和原生blur/focus的Range保存恢复；编辑器和普通文本框共享能力，无网站特判/模型调用。`input-15nordny`真实首败：Actor替换/清空不正确，脚本事件2/2，watchdog5且未真实blur提交；`input-6turf6sq`替换/追加/清空/探索、React状态/提交/焦点通过且脚本事件0；`input-77olqhzl`原中文、React、数字、多行、空值/追加兼容通过。日期/颜色等非文本控件仍保留原兼容fallback，未伪称原生化。

Product Alignment: natural-language task=编辑富文本与填写普通表单；reusable chain boundary=原输入节点；runtime inputs=目标/文本/clear；dynamic task outputs=实际控件与框架状态；generic platform capability used=已有B-U/CDP按键与焦点；replay model calls=0；site/task-specific code added=no。

## 2026-10-09 N03 在线 H2 最小复用门

原NGINX候选未接入。替代为独立回环4193协议检测入口：Hypercorn0.17.3原TLS/ASGI生命周期、hyper-h2 4.3.0原SETTINGS与RequestReceived事件、hpack4.1.0/hyperframe6.1.0原解码；均MIT，Python>=3.11，WSL当前3.14.4，固定wheel与SHA入制品清单。只适配固定H2Protocol._handle_events事件出口，原处理器照常执行；不复制HTTP/HPACK/代理引擎，不保存解密密钥或头值。Kitsune f0a22b3原SettingsBrowser/Browser判据继续用已校准Go程序；CrowdSec继续拥有告警。

初始SETTINGS记录实际收到的字段，而非remote_settings补全后的默认值；伪头顺序在Hypercorn filter_pseudo_headers之前取得。超出256项、缺失/未知判为不可测；hyper-h2会折叠重复SETTINGS ID，本接口只声称有效初始设置及伪头顺序，不声称保留重复帧原始字节。范围只限独立协议入口，不能冒充现有4183完整盾或HTTP3。来源固定wheel protocol/h2.py、protocol/__init__.py、h2/connection.py；公开代码：https://github.com/pgjones/hypercorn/blob/0.17.3/src/hypercorn/protocol/h2.py 。

预先校准：真实TLS上的Chrome型/Firefox型一致正常、互换伪头矛盾异常、未知/空设置不可测、16位扩展ID不截断、正常分片/连接复用；随后B-A-T真实原生请求。由真实socket提供来源，不信任转发头；原CrowdSec规则正反例和事件有效性分开证明。服务归原systemd生命周期管理，原4183入口不改，不增加产品依赖或模型调用。

## 2026-10-09 B06 前置流程校准（实施前）

Reuse Assessment：现有原生Fetch、CrowdSec观察parser、LAPI与LRUCache11.4.0继续使用；新增仅实验盾依赖csrf-sync4.2.1，ISC、Node14+、原lib/index.js已核验，复用generateToken/isRequestValid及公开状态读写扩展点。固定npm完整性`sha512-+q9tlUSCi/kbwr1NYwn5+MeuNhwxz3wSv1yl42BgIWfIuErZ3HajRwzvZTkfiyIqt1PZT8lQSlffhSYjCneN7g==`，只用原会话令牌验证，不引入Express或自研CSRF引擎。现有挑战票据不承担业务前置步骤；不把CSRF令牌当真人身份证明。来源：https://github.com/Psifi-Solutions/csrf-sync 。

限定新`/case/{id}/flow`合成流程，不改既有catalog/booking验收页。服务器签发同会话令牌、原LRU有界TTL；无令牌/跨会话/错误Origin提交应403并产生原CrowdSec告警；正常导航、SPA、缓存、重定向和持有合法前置状态的直接API应通过。Cookie/令牌不进日志/Git，正常token重复使用遵循原CSRF语义，不伪称一次消费。重启失效明确为状态丢失；模型0次、一个owned会话及finally清理，先正反例后结算。

Product Alignment：查询确认和表单提交都需要保留站点真实前置状态，runtime继续原生浏览器网络；此增量只补盾的公开机制/反例，不给公共产品增加站点规则。

## 2026-10-09 B02 第三模型结果与 N03 候选边界

DELBOT原阈值0.2：`reports/delbot-baFNcb/result.json`公开human44中39可测全部误报，5时钟无效；advanced/moderate各28均报bot；本机1人3段均误报，原B-A-T轨迹报bot。原训练数据仅作管线canary，`delbot-rceIFv`原human6中2识别人/4误报，原bot4中2识别bot/2不可测；不拿训练数据作独立准确率。模型/权重/适配均不调参，候选拒绝接入封禁，整体行为分类仍未完成。

N03继续核验固定NGINX插件的实际解码代码，确认SETTINGS/PRIORITY宽度截断不是文档误读；需同时patch NGINX/OpenSSL并调整入口来源传递。现有HAProxy3.2原dev/h2/h2-tracer.lua只解析frame头且跳过payload，无SETTINGS内容/HPACK解码，不能凭装上tracer宣称已有指纹。TLS keylog+tshark是诊断方案，会新增解密密钥与流量采集，不当作常驻盾替代品。保留原离线校准，在线原始H2缺口不虚结。

## 2026-10-09 V06/S03/S05 联合反例补验

不新增引擎/规则，扩现有两份真实验收脚本的独立入口：`--telemetry-adversarial-only`仅验证客户端同时伪造18 clear与trusted会被形状协议接受，以及跨case/缺失/重复/未知/error/overflow；`--association-only`复用原源站auth-probe、原CrowdSec distinct与8个127/8实际连接来源，证明共享出口/正常迁移反例与跨来源异常关系。原Alert按来源展开导致首次用例数量预期错误，原28事件与12Alert离线复核通过，不重跑碰状态。结果路径在PROGRESS；源码/评分不变，普通客户端遥测缺少可信签发不能被协议有效性包装为防伪。

## 2026-10-09 B02 第三行为模型输入契约复核（候选门）

纠正此前DELBOT整体未试的依据：固定712a00ea994738b680b0b11bb4b518979385d07b的DataMovementMatrix.mayNormalize=false；原dataTraining.ts:120明确以1/1加载原像素。因此原卷积矩阵模型可消费现有像素轨迹，无需捏造screen尺寸；RNN/特征模型仍不能套此结论。固定源包SHA256 e77016a6acb81158879ed0cb0c7073625bba79f063a55e9897c168082ff738ff，LICENSE.md为MIT、npm字段Apache-2.0（都保留，不声称字段一致）。候选只在独立实验runtime使用原@chrisgdt/delbot-mouse1.3.3、原TensorFlow.js4.0.0/24KB原卷积权重及公开TensorFlowModel/Recorder/DataMovementMatrix，0训练、原0.2阈值不变，不复制网络/特征算法。

复用既有公开正式标签500点与真人3段，以及新B-A-T轨迹；输入缺失、时钟逆序/不足先列不可测。预先接受门为原阈值下既有可测human/本机样本无误报、至少一半可测高级bot命中；不调整权重或阈值迎合结果，分母/来源分开。原训练数据不当独立留出，公开数据缺少独立用户/设备分组继续限制泛化。Windows/纯JS CPU，无浏览器、无上传；自有代码只本地加载固定权重、格式适配与记录结果，未验证前不接实时封禁。

## 2026-10-09 B02 鼠标轨迹复用候选（实施前评估）

固定browser-use0.13.8/eb412692的Actor与原生watchdog均直接mouseMoved至终点，随后原按下/释放；现有原生事件修复并没有运动轨迹。候选选择ghost-cursor1.4.2（Xetera/ghost-cursor固定5525a783fcf833a60f1b0746a8f80653ccfee2ba，204次提交；源码src/spoof.ts、math.ts及许可已读），复用公开path(start,end,{useTimestamps:true})，保留原Bezier与时间算法。包声明ISC而根LICENSE为MIT，两者均宽松但原LICENSE须保留；不宣称来源字段一致。只考虑纯路径函数，不用其Puppeteer控制器/随机游走/页面注入，browser-use仍拥有会话、目标、点击及清理。其move实现直接把毫秒时间传CDP、不真实等待，故不复用该控制器；B-A-T适配按时间间隔实际派发原生事件，禁止伪造CDP时间戳。

Product Alignment：表单控件及资料链接等任务的通用指针移动，输入为原浏览器选定的坐标，输出保持原动作结果；0模型，无网站特判。B-A-T仅把固定库路径接入当前受管CDP Input实例，不新增选择器或控制引擎；先独立路径边界/基线测量，再实际Actor与原生探索兼容验收。鼠标按下拖动、未知初始坐标、触屏保持原路径，不暗改拖拽语义；取消必须不发后续点击。

实测首轮：原4次点击均仅1个mousemove；候选`input-tpkyfkn1`目标/计数/原生事件通过，但每次约194个CDP调用需要3.2秒。随后公开moveSpeed=2在短距离因上游逐段四舍五入出现整段0毫秒（`input-3yvv4_rr`仅2次move/1.9ms），拒绝此参数。恢复上游默认时间轴，仅按16ms帧间距选择原采样点、不插值、不改曲线、不假时间；256点/8秒为派发安全上限。原curve相同坐标会产生NaN，在入库前作为无需移动处理。重测实际时长后才冻结。

Reuse Assessment：现有TaskBrowser/TaskElement、cdp-use1.4.5 InputClient实例公开dispatchMouseEvent可适配。Windows复用既有Node进程能力，独立有界路径计算进程只读坐标、不接浏览器、不访问页面、不持久化坐标；先测启动耗时，再冻结。Python移植python_ghost_cursor2021版本无时间轴；HumanCursor1.1.5标准包入口加载Selenium/PyAutoGUI且曲线内部API无时间轴；human-browser-use0.2.1为Alpha并复制大段watchdog，不整套替换B-U。现有motion-attestation1.1.0/Kitsune高级轨迹漏检限制仍保留，不以能生成曲线当盾分类有效或整体穿透通过。

## 2026-10-09 V03 本地人工验证码及原运行恢复（已验证）

实际结果：3组协议边界通过；`bat-human-wait-real-tIFyCm`实际用户在完整HTTPS4183/原PoW后回答图片挑战，原TaskChainRuntime两次未解决等待与之后原run完成通过、0模型。只记录答案判定结果；观察不截图，DOM仅摘要，验证码文本未写证据。实验SPKI仅加到精确owned Profile的测试启动器；跨Windows/WSL的活动SQLite只经原源站报告读取。首次驱动模式/证书/独立WAL读不到新事件的失败见PROGRESS，源码最终不改变产品访问控制。svg-captcha是旧版本小型图片库，不能借此声称抵御现代OCR或商业验证码等价。

Reuse Assessment：现有CrowdSec PoW不等于人工验证码；B-A-T已有401人工暂停/checkpoint/同owner恢复，复用此路径。选择[svg-captcha1.4.0](https://github.com/produck/svg-captcha)公开svgCaptcha(text,options)仅生成图片，npm原包SHA512 /fkkhavXPE57zRRCjNqAP3txRCSncpMx3NnNZL7iEoyAtYwUjPhJxW6FQTQPG5UPEmCrbFoXS10C3YdJlW7PDg==已核对，源码lib/index.js、ch-to-path.js、random.js及MIT许可已读取；内部Math.random不负责答案，适配用Node crypto生成文本。保留原字体/路径引擎，不复制渲染器。Node/纯JS适合Windows+WSL；固定lru-cache11.4.0负责数量/TTL，答案和一次通行会话仅内存、不写日志/Git，输入一次消费、同case/UA绑定。独立小依赖包放既有lab工具，不改变产品依赖或浏览器控制。

Product Alignment：登录/身份检查和任务中的人工验证，共用原暂停/继续合同；系统不读取图像答案、不求解、不代用户输入；正常答案后检查同一run与浏览器恢复、0模型。异常包括错误/缺失/重放/跨会话，正常需真人操作。图片识别强度不等价商业验证码；当前只验交互挑战机制和运行恢复。候选dchest/captcha可用但需额外Go服务，现有Node源站公开API更小；不新建服务管理器或会话平台。页面挂在原检测入口后，保留原规则和业务配额。

## 2026-10-09 B01 数字输入的原生事件补漏

固定B-U eb4126921bea3373f91afc49fb4b59d6eda7fed6的[Actor清空](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/actor/element.py)及[默认watchdog](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/watchdogs/default_action_watchdog.py)源码仍有脚本清空/提交分支；现有task_input仅覆盖文本类型。原真实数字框用例追加事件观察，不改页面；`number-input-before.log`证明Actor与原生探索均值正确但存在脚本事件。最小变更把number纳入同一已聚焦原生键盘清空/blur提交，原不支持选择区间由既有try处理；失败仍由原兼容路径处理。

Product Alignment：表单中的数量/预约时长等数字输入，共用已有B-U输入事件；输入数字字符串、输出实际字段状态；普通复跑0模型，无网站分支。

Reuse Assessment：复用既有B-U Page.press/TypeTextEvent、TaskElement和每Browser watchdog的原生清空/提交hook，无新库/输入引擎；Windows既有运行时/会话所有权不变。只扩展已支持的键盘控件类型，日期/颜色/富文本等仍独立验证。focused validation为原Actor/原生探索数字34/56、异常原脚本事件和正常原生事件反例、真实值/焦点与owned资源清理。

## 2026-10-09 B05 无 Retry-After 的跨任务退避

真实结果：缺头场景两个Runner/原生浏览器在30秒内源站仅1次到达，独立origin正常，真实到期恢复，0模型。首次`cooldown-L5Ze58`及timestamp去重候选`cooldown-wSNSn8`到期仍拒绝；诊断确认同requestId在两个CDP会话接收时间不同，改为requestId/loader/URL去重后通过。原明确Retry-After保护等6边界通过，新响应身份边界通过；该测试首版443与无显式port不匹配已纠正。503/429/200原错误归因以服务器明确Retry-After:0通过，区分无头退避场景。各浏览器/Profile清理均确认。

原 `remember` 在429/503缺头或头无效时直接返回；新任务仍可立即访问。最小原实现首败 `cooldown-no-header-baseline.log`：guard未拒绝。复用现有DiskCache5.6.3事务/TTL与urllib3 2.7.0 [Retry公开算法](https://urllib3.readthedocs.io/en/2.7.0/reference/urllib3.util.html)，不再引入限流库。无有效期限时30/60/120秒上限退避，连续失败数保留一小时；有效Retry-After优先且不截短，明确0允许立即继续。活动冷却不被同origin旁路200清除；过期后成功清连续失败。没有主动重试、常驻worker或模型调用，不覆盖浏览器自主请求预算。沿原账号/准备/运行入口验证；源码与真实分母待下述运行证据更新。

Product Alignment：原自然语言浏览器任务与账号维护；可复用边界为既有origin访问准入；输入HTTP响应，输出原访问失败码；使用现有Runner/人工恢复；普通复跑0模型；无网站特判。

Reuse Assessment：existing implementation为access_cooldown；selected为已安装DiskCache5.6.3（Apache-2.0）与urllib3 2.7.0（MIT），复用Cache.transact/TTL及Retry.parse_retry_after/get_backoff_time；B-A-T只存origin哈希、失败次数、状态和截止时间。Windows既有运行时、单浏览器归属不变；不用Retry发网络请求，不复制调度器。PyrateLimiter能做固定配额但不能替代未知站点的响应退避，此处不增加该产品依赖。focused validation：原失败、边界回归、两个实际Runner与真实到期，分别记录。

## 2026-10-09 S06 动态点击的宿主候选读取（实施门）

原`product-JHSWo3`来源已经证明：原生模型没有find_elements，直接点击列表内版本7；缺完整候选读取导致无法编译。不能删collection_selection_read_required，也不重试原模型碰运气。局部方案在原点击前的采集回调复用既有DOM同组关系、record_projection_dom选择器、read_fields_with_proof读取整个同组候选；真实两次读取/节点身份一致后保存宿主事实。原生点击仍只执行一次，不把额外DOM结构交给原生Agent，不重放动作。现有selection_annotation只生成一次纯选择函数，编译为原read-fields/function/结构定位节点；读取失败保留原编译缺口。

Product Alignment：自然语言按当前资料属性选择一项，也适用于列表中的预约/记录选择；可复用边界为已有点击前DOM采集→read-fields→纯函数→结构目标；运行输入为当前页面候选，动态输出为本次目标/原任务结果；0普通复跑模型；无网站/测试答案特判。

Reuse Assessment：已有Browser-Use0.13.8 DOM/actor与固定workflow-use中的record_projection_dom、collection_structure、read_fields_with_proof、selection_annotation、原QuickJS校验和LangGraph；不引入库、不复制选择器/Agent loop/调度器。B-A-T仅适配其宿主候选事实与既有IR。边界为同一主文档、完整<=300候选、原128KB预算、稳定真实读取；iframe/不可证明全集继续缺口。验收先保护原拒绝门及两类DOM布局、变化/缺失反例，再原真实产品准备/试跑/发布/变化复跑；不将底层成功冒充整链成功。

实际`product-czNRud`编译通过，代表复跑在挑战过渡页读到[]、Function失败。补漏继续复用现有requiredPaths及workflow-use declared_checks/verify_declared、Tenacity9.1.2有界等待（30秒/300ms/100次）；选择后点击必需至少一个候选，宿主集合节点声明路径[0]，不把任意允许空集合的读取都改成非空。Runner在已有必需路径检查前等可读事实，不重发导航/点击、不识别或求解验证码、不调用模型。合法永久空集合在上限后失败；正常异步页面/挑战自行完成后继续。先复用保存草稿、以0模型试跑验证，避免重复探索。

## 2026-10-08 E06 账号控制兼容候选：限定实际产品能力

选型实际结果：`account-runtime-7rD1LY`、`account-driver-compat-8cbd4b46`及2026-10-09 `combined-quz4hw9q`通过，故采用限定账号连接的兼容驱动。独立Runtime由阳性变阴性，13来源/65状态、原CSP/存储/焦点，以及当前完整盾冷挑战→动态业务/Fetch和异常告警保留。固定依赖/源码条件修补已经进入setup；临时候选安装移除。首败和未测传输/OS见实施记录，不承诺整个Playwright API等价。

正式适配通过后，复用既有combined用例增加--account-borrow分支，只验本次新连接在冻结HTTPS4183完整入口的冷挑战、动态读取/选择和原生Fetch，以及原webdriver异常仍告警；不重复原三项业务/重启/遥测故障全套。保持全部规则/盾配置，不额外创建测试文件或改测试页；只开一个owned浏览器并finally原生命周期关闭删除。既有专属候选校准和13来源/65状态结果见实施记录。

Reuse Assessment:
- capability: 账号借用保留原页面、Locator、导航Response、主世界evaluate、Cookie/Storage和原生CDP事件，同时避免重复Runtime订阅。
- existing implementation in repository: Playwright1.61.0账号连接已实测Runtime阳性；browser-use0.13.8主控制及动作采集保持。
- mature candidates and pinned versions: Patchright1.63.0，driver f34b86146dd4e6b54eeacb023af0dbfe19ee09db；Windows wheel SHA256 cbeb9c7f552d96ced0922ad2fc4bd5fca817a97fb2eeabc13d1bfadf95efac1a。1.61.0只有driver tag，本次PyPI版本查询404，不将其当已发布Python包。
- selected implementation: 先在ignored候选目录安装原wheel，仅既有账号Runtime对照替换连接工厂；通过真实样本后才决定产品采用。
- reused public surface: 原connect_over_cdp(no_defaults=True)、Locator、evaluate(isolated_context=False)、CDPSession；不自行重写定位器/驱动、不修改浏览器启动参数。
- B-A-T-owned adapter and remaining gap: 账号连接及必要evaluate/TimeoutError兼容；主控制、输入/DOM事件采集和盾探针保留。上一轮直接因Console/initScripts限制排除候选过于宽泛：账号当前不订阅console，且明确禁止initScript；仍须实际证明页面console/CSP/主世界和既有功能没有改变。
- license/runtime/platform fit: Apache-2.0；Windows x64 wheel，依赖范围兼容已固定pyee13.0.1/greenlet3.5.6；不安装新浏览器。
- browser/runtime/state ownership conflicts: 仅连接已handoff owner，stop连接后owner必须存活；检测异常控制保持；不对第三方网站/个人Profile实验。
- replay model calls: 0。
- rejected candidates and evidence: Rebrowser支持声明仍停在1.52，当前driver打包布局已变；不手工移植补丁。Patchright并非完整Playwright等价物，不承诺其console订阅能力，也不拿README通过列表当结果。
- focused validation: 复用已冻结Brotector和实际borrow用例，保留Runtime原阳性；候选须阴性且探针ready，后台焦点/Locator/导航/owner清理通过；随后只运行受影响账号HTTP/认证与动作采集兼容检查。

候选首测 `account-runtime-mKXAXU`：Runtime阴性且probe ready/errors0，导航/Locator/owner存活和永久清理通过，但后台焦点反例失败。固定Patchright源码crPagePatch.ts:230–232替换原条件时丢失Playwright的skipDefaultOverrides；仅恢复该条件，不关闭盾/采集。候选coreBundle原SHA34898aeefffcbe4f5b3c02d24cc510362fe401055ee26d40a95db91af5152c8d，单条件修正后38f9f625508e917ddac324d2a78a82c7c6f5aaff92b41ccb6aaa719dce07f886。新增原用例主世界读写和console原方法检查后复核，不能把首测记全绿。

## 2026-10-08 N03 最小H2判据校准（测量前冻结）

Reuse Assessment:
- capability: 同条客户端HTTP/2连接的SETTINGS族与伪头顺序矛盾。
- existing implementation in repository: tshark4.6.4真实首段pcap已保留；当前仅采集，未消费独立H2判据。
- mature candidates and pinned versions: tshark原解析器；Kitsune f0a22b3600a829f7de9d6abb48ff1aaebfb5a69e原h2.go（SHA90969540ab6663ecaed1f92403a0d7941636c976f42b994be3847c3135c1dffa）及原net.h2_settings_vs_order规则。其浏览器族提示不是权威浏览器身份库。
- selected implementation: 仅固定原H2Fingerprint.SettingsBrowser/Browser公开方法，CLI JSON适配；tshark读取原始协议事实，CrowdSec承接已知族之间不等判据。原结果unknown/缺帧不能记阴性。
- reused public surface: 原Go公开方法、tshark JSON解码、CrowdSec trigger；不复制H2/HPACK/指纹引擎。
- B-A-T-owned adapter and remaining gap: 字段转换/完整性/证据归属；先做独立组件/原生规则校准，常驻在线采集接入仍未完成，不能冒充当前组合入口已启用。
- license/runtime/platform fit: 原MIT/Go标准库；WSL原tshark；不更改主产品库/网络栈。
- browser/runtime/state ownership conflicts: 复用已有owned报告pcap，仅提取settings/伪头顺序，不打印头值/Cookie/请求正文；不新增浏览器。
- replay model calls: 0。
- rejected candidates and evidence: NGINX候选需两层fork且已见字段截断，记录在上一节；整套Kitsune新网关不因一条信号替换已校准入口。
- focused validation: 原Chrome/Firefox一致合成反例、双向不一致正例、空/未知/H1不可测；同原pcap实际B-A-T普通导航/原生Fetch族一致；原CrowdSec隔离规则检查。无一般误报率/全协议/真实Firefox硬件声明。

## 2026-10-08 N03 追加原始H2观测候选调查

固定phuslu/nginx-ssl-fingerprint e72f932b630717939b508b58e5b4a48ec014adf3（另公开v1.0.5=ea2b5ae）README/许可证及NGINX1.30补丁已保存candidate-review/nginx-h2。原BSD-2-Clause。该方案需要修改NGINX及OpenSSL，不能直接作为当前HAProxy配置启用；其release-1.30.0.patch（SHA ad28a12a44f450ecf575e9d14f237f377a5b353652b97a1c40693b150c452650）将SETTINGS id、stream/dependency截为uint8，设置缓冲仅32字节（最多6项），未提供截断测量状态，不能据此宣称任意H2参数准确。未安装/替换现有入口；不把README或增加组件数当N03完成。原Kitsune完整uint16 SETTINGS与伪头序算法仍是候选，现有tshark保存实测可复用。来源：https://github.com/phuslu/nginx-ssl-fingerprint/tree/e72f932b630717939b508b58e5b4a48ec014adf3 。

V02/B05本次结果、测试驱动首败和配置恢复见实施记录的“后续短测”；实际未使用票据到期检查已通过，账号打开页/存储导航遗漏已修，账号Runtime仍阳性。

## 2026-10-08 B05 账号入口/存储导航冷却补漏（测量前冻结）

源码审计发现CheckPage及原生Fetch已接Retry-After，但account_session.open_page与account_auth.storage_origin仍直接page.goto，跨入口可绕过同origin冷却。复用现有DiskCache/urllib3适配，不新增限速器；计划提取四行公共导航调用，保留原Playwright等待/超时/Response和scope/回滚校验。已有真实本地429服务器测试增加这两条路径到达数，先复现再修；只重跑该必要真实请求测试及受影响账号auth最小回归，不改变账号Runtime仍阳性的结论。

## 2026-10-08 V02 在线票据过期短测（测量前冻结）

复用原keyring公开配置key_rotation_interval=30s（原允许最小值）、max_live_epochs=2；保持PoW/签名/评分、已修持久spent不变。一个owned可见会话：正常新票接受为正控制；第二独立实验host原JS生成的有效提交在CDP传输边界暂停并取消，未到服务器消费，票据仅内存。等待真实65秒后由同UA提交，预期原协议failed/no Cookie；不是伪造时间戳，也不是已用票据重放导致拒绝。finally恢复原签名配置字节及engine、核SHA。此短测证明在线到期分支，不冒充默认15分钟实际窗口或12小时Cookie寿命；禁止长测并行，不动个人Profile。

## 2026-10-08 V02 重启重放首败与持久存储适配门

`replay-restart-53ii718u`：原生正常挑战后同票重放status=failed/no Cookie；真实engine重启后同票status=ok/Set-Cookie，第二次再拒。原Cookie正常反例仍有效。原nonce/票据仅内存，测试Profile已确认关闭并永久删除。此为实际盾缺陷，不能以既有SpentSet单测关闭。

Reuse Assessment:
- capability: 原挑战的已消费nonce跨重启原子保留。
- existing implementation in repository: 固定CrowdSec909b5157/gcache0.0.2内存LRU；持久master下重启会丢重放记录；原Config无持久化选项。
- mature candidates and pinned versions: 现有CrowdSec依赖mattn/go-sqlite3 1.14.32及SQLite原事务/唯一约束；Redis需新增守护进程且当前单实例无必要。
- selected implementation: 固定上游源码小补丁，增加可选spent_set_db公开配置字段，以SQLite事务、唯一主键、原20分钟TTL承接原checkAndInsert；哈希nonce，无原票据/Cookie。
- reused public surface: database/sql、原sqlite3驱动、BEGIN IMMEDIATE/唯一约束；上游HMAC/PoW/评分/挑战JS全部保留。
- B-A-T-owned adapter and remaining gap: 薄持久存储适配与可复现固定源码构建，不复制检测/认证/窗口引擎；上游原内存路径仍保留作对照。
- license/runtime/platform fit: CrowdSec MIT、go-sqlite3 MIT；现有WSL构建/运行，Windows主产品无依赖变更。
- browser/runtime/state ownership conflicts: 新DB仅盾owned data目录；原库不覆盖；验证后切换owned engine二进制，不重置历史/配额/secret。
- replay model calls: 0。
- rejected candidates and evidence: 无配置后端可启用（固定config.go/spent_set.go）；轮换master会丢正常Cookie且不能实现跨实例一次性，不能当修复；外置代理重写协议职责更大。
- focused validation: 原SpentSet相关测试+新增双连接/并发唯一消费、重开、真实短TTL、容量/损坏拒绝；新二进制原配置检查；实际原Browser挑战/重启同票拒绝及暖Cookie正常。仅此package和cmd构建，不运行全量测试。断电/多主机仍不外推。

## 2026-10-08 V02 原挑战重启边界（测量前冻结）

固定CrowdSec 909b5157（v1.8.1）原 `pkg/appsec/challenge/spent_set.go` 使用 gcache 内存LRU；`ticket.go`以原keyring时间窗及20分钟上限验证新鲜度；持久master保证重启后签名/Cookie连续，但没有持久spent接口。新增单次本地实测：原生可见浏览器正常完成挑战，原提交只在内存；重启前重放应拒绝，真实engine重启后重放仍应拒绝。保留原HTTP200下协议status/Cookie事实，不把HTTP码当接受。若重启后接受，记盾缺陷并调查原生扩展/成熟存储的最小适配，不宣称V02完成。沿用已有restart ownership/长测互斥与finally清理；不访问第三方、不保存原票据。

账号焦点修复复核：`account-runtime-ZAFwXU`后台hidden=true/focus=false在实际借用前后保持，导航/Locator/owner存活与关闭删除通过，模型0；同一原Brotector仍报告账号Runtime阳性。Playwright默认Runtime.enable不能由no_defaults关闭；Rebrowser公开支持声明最后完整测试1.52.0，当前固定1.61.0不在该证明范围，未改已安装驱动。该项保留未修复。

## 2026-10-08 N05/B04 已定位账号借用的默认环境改写

`account-runtime-Zy1pf3`与`account-runtime-4CO9nN`：同一已校准Brotector探针TaskBrowser阴性/实际Playwright借用阳性，init ready且无错误；Runtime差异未修。后一组额外验证owned后台页原hidden=true/focus=false，连接借用后变为hidden=false/focus=true。公开固定Playwright1.61.0 crPage.ts:515–520无条件启用focus emulation，原no_defaults公开选项能够跳过这项默认覆盖，Runtime.enable仍独立存在于:506。

Reuse Assessment:
- capability: 账号借用时保持用户页面原生焦点/可见性及默认上下文设置。
- existing implementation in repository: 已固定playwright==1.61.0；borrow_window使用connect_over_cdp但未传no_defaults。
- mature candidates and pinned versions: Microsoft Playwright1.61.0公开connect_over_cdp(no_defaults=True)。
- selected implementation: 只增加该公开参数；保持原页面/Locator/Network/CDP订阅/账号源函数和主B-U事件采集。
- reused public surface: https://github.com/microsoft/playwright/blob/v1.61.0/packages/playwright-core/src/server/chromium/crPage.ts 与官方BrowserType API。
- B-A-T-owned adapter and remaining gap: 一处连接参数；不冒充Runtime痕迹已修，不根据阳性禁用采集。
- license/runtime/platform fit: 原Apache-2.0、现有Windows运行时，不替换依赖。
- browser/runtime/state ownership conflicts: 同一个handed-off owner，停止借用后owner仍存活；额外后台对照页仅在owned测试进程。
- replay model calls: 0。
- rejected candidates and evidence: Patchright v1.61.0原README明确禁用Console API、InitScripts采用路由注入HTML；未证明符合当前功能/采集/CSP不变约束，未安装。Rebrowser补丁与本机1.61驱动布局兼容性未证明，不直接改已安装依赖。
- focused validation: 同owned后台反例改前/改后焦点与可见性；既有独立Runtime仍应如实为阳性；账号页面导航/Locator读取/owner释放/关闭删除。


## 2026-10-08 N05/E06 账号借用连接审计（测量前冻结）

复用已校准Brotector98b3309 Runtime分支与既有holdout fixture，不改探针/页面/阈值。同一owned专属Profile：TaskBrowser原连接打开正常对照文档；handoff后由实际borrow_window/CheckPage打开第二新文档。预登记假设：Playwright的额外连接可能重新启用Runtime。比较的是两条产品控制路径，不将Playwright基线当真人。保留测量有效性、业务读取/导航、停止借用后owner存活与最终清理。只调查已有连接适配，不先替换库/关闭采集/访问个人Profile；普通模型0。


## 2026-10-08 后续：持久滚动配额、行为第二候选、收尾边界

- **盾持久配额已上线**：固定PyrateLimiter4.5.0原SQLiteBucket/SlidingWindowLog + filelock3.19.1，业务准入按服务端case+真实来源IP分组，60/滚动小时、240/滚动日，保留所有原CrowdSec漏桶和挑战；拒绝HTTP429/Retry-After并产生原生CrowdSec告警。组件Windows `budget-jwtp89au`、WSL `budget-3tqk3zl7`：第61次拒绝，跨进程继续拒绝，独立范围正常；20并发竞争10余量恰好放10/拒10，坏DB明确error，无内存降级。真实4.15秒到期/更长8秒窗口仍拒；这些不代表真实小时/日运行或断电容灾。
- **真实HTTP/重启**：`budget-http-4cboa8b1`源站单层校准64请求，主组60成功/2拒，独立IP/独立case各1成功；真实源站Invocation变更后仍拒，原CrowdSec告警存在。没有网关参与此隔离校准，不能当完整盾穿透。生产数据为WSL单OS写，未支持Windows/WSL同时写同一个SQLite。按首次准入计数，失败前的客户端尝试/前置挑战不计入此窗口。
- **组合业务成功，清理首败保留**：`combined-bfxuff7p`新窗口启用下三项底层业务、34原生事件、12条有效TLS、0普通模型均通过；独立异常仍触发，无B-A-T白名单。清理时close报告confirmed但Profile进程即时仍存，脚本exit1；后来进程自行退出，精确Profile已永久删除，写入`cleanup-first-failure.json`及`profile-deleted-recovery.json`。不能把该运行写成无失败。
- **矛的最小收尾修复已验**：ManagedWindow在关闭前保留已核验owner的子进程列表并等待；Profile进程未退时保留租约/返回unconfirmed，不覆盖业务成功。7项专属环境/错误边界测试通过；`launch-rgwvj_lf`真实可见窗口、同target/session/input人工交接恢复、关闭确认和Profile删除通过，未重跑三项业务。
- **第二行为算法仍不足**：原Kitsune f0a22b3的实验性power-law阈值0.05不变，`biomech-r3l6ksow`公开44human中39可测均未触发、5时钟无效；28advanced全部未触发；28moderate中25可测（12触发/13未触发）、3不可测；本机1人3段均未触发。合成恒速曲线命中、直线/空不可测、逆序无效通过。仅局部辅助诊断，不接入生产封禁、不声称一般FPR或高级行为分类完成。DELBOT仍存在许可字段/历史样本screen输入契约未结清；未部署。
- 首败：维护TS脚本在ignored目录被按CJS处理，尚未执行配置，改用.mts；HTTP校准首次缺管理Origin被403，修测试调用后才完成。原始日志保留。

整体仍进行中：H2/H3独立判据、行为分类、完整跨阶段访问与全产品编译等没有结清；原`product-JHSWo3`的collection_selection_read_required仍失败。跨天仍暂停、未部署云、未提交/推送。


## 2026-10-08 专属浏览器收尾首败与最小修复门

`combined-bfxuff7p`三项完整盾业务、34原生事件和TLS测量均通过，但`close`已返回confirmed后即时Profile进程扫描仍为true；脚本exit1。后续扫描无所属Chrome，不额外终止进程，精确Profile永久删除写入recovery，保留首败。

Product Alignment:
- natural-language task: 既有本地浏览器任务完成后正确结算资源。
- reusable chain boundary: 不修改链路编译/节点/输出；仅专属进程关闭确认。
- runtime inputs: 已核验owner/PID/create_time/exe/Profile租约。
- dynamic task outputs: 保留业务结果；残留子进程时仍是cleanup_required，不误报清理成功。
- generic platform capability used: 原ManagedWindow所有权和psutil进程等待。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment: 继续复用现有psutil.wait_procs与Chrome Browser.close；先获取已核验owner的子进程列表，等待整个已知树；end在Profile进程仍存在时保留租约并报unconfirmed。无新的浏览器管理引擎，不关闭个人/retained进程。最小验证保护“主进程已退、子进程尚存”和真实owned窗口关闭；不重跑已通过三项业务。


## 2026-10-08 B05/S04 持久滚动配额复用门（实施前）

Reuse Assessment:
- capability: 本地盾业务入口的精确滚动小时/日配额，跨服务进程重启保留；不是把漏桶换名为滚动计数。
- existing implementation in repository: CrowdSec1.8.1漏桶活动状态仅内存，SQLite保存已产生告警/决策。核固定源码BucketStateFile/BucketStateDumpDir只见声明；不能以配置字段当恢复实现。
- mature candidates and pinned versions: PyrateLimiter4.5.0（2026-08-30发布）SQLiteBucket；rate-limiter-flexible原SQLite支持现有better-sqlite3但为fixed window，不满足精确滚动窗口。
- selected implementation: 先校准PyrateLimiter原默认SlidingWindowLog和SQLiteBucket；filelock3.19.1负责跨进程互斥。保持CrowdSec原漏桶/封禁及完整挑战。
- reused public surface: SQLiteBucket.init_from_file/put_decision/leak/close、Rate/RateItem；SQLite公共PRAGMA synchronous=FULL；不复制窗口算法、数据库SQL或锁。
- B-A-T-owned adapter and remaining gap: 实验源站按服务端case命名空间+网关确认IP的SHA256选表，业务进入前检查，429/Retry-After与CrowdSec观察字段适配。默认60/滚动小时、240/滚动日；被拒绝请求不再占准入配额。挑战/遥测/静态资源不计，网关既有全量日志保留。不是覆盖所有客户端尝试或公网全站配额。
- license/runtime/platform fit: Pyrate MIT、filelock Unlicense，均纯Python wheel；Windows/WSL分别做本地状态验证，不增加Docker或系统包。固定wheel直接zipimport，不修改主产品依赖。
- browser/runtime/state ownership conflicts: 每次检查短进程，SQLite单实例文件锁；hash表名，不存Cookie、URL参数或输入内容。不创建第二个浏览器/Agent。
- replay model calls: 0。
- rejected candidates and evidence: 原生CrowdSec未提供当前版本活动桶恢复；rate-limiter-flexible固定窗口不冒充滚动，Redis部署不是本地此增量必需。
- focused validation: 默认真实小时配置准入60/拒第61、进程重建仍拒、独立key正常；缩短窗口仅验证真实到期/空闲停止后恢复；并发竞争不得超发、坏数据库必须报测量失败。先验证依赖再冻结；真实1h/24h连续窗口与断电容灾未测，仍最后安排。


## 2026-10-08 B02 第二候选：先验证迁移有效性

Reuse Assessment:
- capability: 鼠标曲率/速度关系的辅助诊断，非完整真人分类或新增封禁器。
- existing implementation in repository: motion-attestation 判别验收失败；现有真人三段/公开正式标注数据可复用，不再开浏览器或要求重采。
- mature candidates and pinned versions: DELBOT-Mouse 1.3.3/712a00ea994738b680b0b11bb4b518979385d07b；Kitsune f0a22b3600a829f7de9d6abb48ff1aaebfb5a69e（新近项目，成熟度不能从宣传推断）。
- selected implementation: 暂仅诊断性执行 Kitsune 原 harness/biomech.py；不冻结为生产组件。原 MIT；源码SHA256 b005a549224d803b927948a7889f83fce696ad9fe281758b452ea7fbf1e537bd。
- reused public surface: 原 extract/power_law；registry 的实验性 bh.power_law_violation 原阈值0.05，保持辅助性质。
- B-A-T-owned adapter and remaining gap: 仅既有脱敏轨迹转为x/y/t并输出分母；逆序/相同时钟单列无效，不排序补值。原直线/空轨迹为不可测，不当正常真人。
- license/runtime/platform fit: 原模块MIT/纯Python标准库/Windows3.12；公开数据CC BY-NC-SA仅本地研究。DELBOT根LICENSE与package许可证字段不一致，且既有真人样本未保留原模型要求的screen尺寸，暂不安装/套分。
- browser/runtime/state ownership conflicts: 无浏览器/账号/服务状态改动；无新模型训练、没有云服务。
- replay model calls: 0。
- rejected candidates and evidence: DELBOT当前本地输入契约与许可尚未结清；Kitsune README中的普遍准确性不作为证据，独立原始数据与设备分组仍缺。
- focused validation: 先冻结原0.05；合成恒速曲线阳性、直线/空不可测、逆序时钟无效，再诊断既有44human/56bot及本机1人3段；不调阈值、不将单人三段当三人。


## E02/E03/E05 屏幕、WebGPU及权限短测（实施前）

复用固定CreepJS10aa6724的screen/index.ts、navigator/index.ts与lies/index.ts，保留Screen↔matchMedia、DPR↔resolution、GPU.requestAdapter原生方法完整性原判据。已有Worker真实结果传给Navigator，无新指纹/真假人算法。WebGPU仅requestAdapter读能力，不requestDevice/渲染/录制；权限只query，页面camera/microphone/geolocation策略保持拒绝。输出只含有效性/原判据/权限状态分类，硬件型号与原始指纹不持久化。

预定正常：当前owned可见B-A-T、CDP一致屏幕/DPR缩放（明确浏览器仿真，不冒充换物理显示器）；阳性：screen单侧改值、GPU原方法包装；缺失：gpu/permissions unavailable。CreepJS当前源码没有可靠的WebGL↔WebGPU不同GPU自动判bot规则；多GPU/软件回退不能因字符串不等就判异常，仍为未结清的具体判别子项。只做源码所支持的完整性校准，不以API采集代替这个缺口。

## N01 当前公开来源属性（实施前复用核验）

Reuse Assessment: 复用Tor Project Onionoo v8公开details/exit_addresses（过去24小时实际出口地址，CC0数据），仅下载running Exit的地址字段，不收身份/通信内容；CrowdSec1.8.1原File字符串名单、TimeNow有效期与trigger/leaky规则承担匹配/关联。B-A-T工具只校验JSON/IP/版本/大小/发布日期、固定数据摘要与生成配置，不造信誉库/检测引擎。新客户端按官方协议发送压缩/If-Modified-Since、区分304/错误；名单失效显示unavailable，不称健康阴性。默认24小时是数据质量上限，不是bot阈值；不自动启动常驻更新任务。

候选与依据：原CrowdSec全局信誉需要CAPI/相应数据条件；当前目标先补无需账号的公开Tor来源属性，不能将它称完整信誉。bulkexitlist虽可用，但Onionoo协议明确字段、发布日期与CC0；选后者。来源：[协议和许可](https://metrics.torproject.org/onionoo.html)，固定原组件`pkg/enrichment/dataprovider.go`、`pkg/exprhelpers/helpers.go`的File/TimeNow及原scenario data字段。Windows下载/WSL匹配，不涉及B-A-T浏览器会话/模型/代理改变。

预定验收：当前名单样本命中、同名单成功正常请求仅属性提示而无ban；同来源重复429/503组合异常；非名单/缺失/过期不冒充属性阴性；首测与现场生效分开。匹配样本通过原引擎合成输入验证，不伪造公网IP实际连接；真实入口防伪复用既有证据。未接入前只算候选。

## B05 跨任务访问治理：站点明确Retry-After已完成局部验收

Product Alignment: 资料导航、表单后访问和账号只读检查都需尊重站点429/503冷却；复用原B-U导航/Actor、现有请求与主文档归属检查，不新增模型、调度器或站点特判。输入为真实已授权响应Retry-After；输出为既有外部访问阻断，过期才允许新的用户任务。未收到有效Retry-After不臆造目标站点配额，也不把该子项说成全部流量预算。

Reuse Assessment:
- capability: 同一origin收到明确冷却后，跨Runner/任务/进程保留截止时间，在新的受控导航或账号Fetch前拒绝重复访问。
- existing implementation in repository: 当前只停止单轮探索/账号轮询；Runner重建后状态丢失，nodeDelay不覆盖真实请求。
- mature candidates and pinned versions: rate-limiter-flexible11.2.1（ISC，1bf9eb1c，支持better-sqlite3）适用于宿主配额但Python实际请求路径需要跨语言服务；Bottleneck持久集群需要Redis，当前无必要引入。DiskCache5.6.3（Apache2，纯Python/SQLite，原Cache事务/过期API）直接复用跨进程TTL；不是用缓存重造通用限流器。
- selected implementation: DiskCache5.6.3通过当前Windows/Python3.12事务/关闭/重开与实际两个Runner验收后冻结；B-A-T只处理站点响应、origin归属和原异常契约。
- reused public surface: Cache/get/set/transact/expire/close；上游原TTL及并发由库承担。
- B-A-T-owned adapter and remaining gap: 存origin哈希和截止时间/status，不存URL、Cookie/正文；不调度自动重试。浏览器自主资源/未观测目标/任意页面JS流量不能说已全覆盖。
- license/runtime/platform fit: 许可/源码固定于https://github.com/grantjenks/python-diskcache/tree/v5.6.3 ，Windows支持与当前实测分开；旧发布版本的维护风险保留，不能只靠README稳定声明。
- browser/runtime/state ownership conflicts: 默认放自有data/access-state，测试隔离目录；检查只用于产品控制路径，不影响个人手动浏览。不把网页429当成全网封锁。
- replay model calls: 0。
- rejected candidates and evidence: 不增加Redis/网络代理/任务调度，不复制通用计时器；暂不冻结任意全站默认分钟/天配额。
- focused validation: 先证明旧路径在两个运行内发送两次；候选首次一次、另一Runner同站到达前阻断，正常独立站继续，真实到期后恢复。秒数/HTTP日期/无效/负值/正常200及取消分列。

公开依据：[RFC9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)、[DiskCache事务与进程安全API](https://grantjenks.com/docs/diskcache/tutorial.html)、[SQLite限流候选](https://github.com/animir/node-rate-limiter-flexible/wiki/SQLite)。

验证：旧`cooldown-IZRCWm`源站收到2次，首次失败保留；候选`cooldown-I9RYyL`两个真实Runner在20秒期限内仅1次，到期恢复200、不同origin正常、0模型、两个owner关闭/Profile删除。`cooldown-boundaries-first.log`5项通过（日期/秒数、超6小时不缩短、无效值、origin隔离、存储异常不报健康、新准备任务0模型、实际账号Fetch/导航共用冷却）；`document-access-yhwct1`证明无Retry-After的503/429/200仍各1次且可恢复。urllib32.7.0原冻结uv.lock提供解析器；setup检查精确版本，不改上游lock。API类型检查/来源检查通过。普通动作预派发检查已加入；页面自主网络与所有并发请求的全局配额仍未完成。

## E03/E04 Worker跨上下文补测

继续复用固定CreepJS 10aa6724原`src/worker/index.ts`的`spawnWorker/getBestWorkerScope`，原实现比较window/worker的platform、UA、hardwareConcurrency、deviceMemory并报告原生对象差异；明确跳过Chrome正常语言切换。原service/shared/dedicated回退、终止及unregister全部保留。只构建本地探针入口，字段内容留内存，报告只保留可用性/原判据；不运行原主站上传。正常原生、故意window单侧hardwareConcurrency差异、三种worker类型可用性和CSP阻断为预定短测。无新的浏览器控制器/指纹算法或产品注入；真实多GPU/远程设备仍单独未测。

## V06 在线遥测完整性补齐（本地短测）

复用原Zod边界和SQLite原子唯一索引：`page+batch`只认领一次、先验证协议再认领，原上报日志失败仍显式失败，不静默重试；页面UUID不是身份认证。BotD固定18个判据名、版本及measured/partial/error结构一致性必验，空报告不能被记成健康阴性。10秒仍没有环境报告则呈现timeout（测量SLO，不是bot阈值），不封禁正常慢设备。测试预定为并发重复202/400且只有一条实际观测、origin真实重启后重复400、错误版本/空健康400、禁collector从missing变timeout。无新依赖/检测引擎/任务模型，Cookie和输入原文不记录。

## N02/N03 持续入口候选：HAProxy公开JA4扩展（核验中）

ALPN局限不直接豁免：继续采用HAProxy自己的`req.ssl_alpn`在TCP尚未解密时解析ClientHello，以其原生PROXY-v2自定义TLV传入同进程TLS终止入口；原Lua只替换ALPN数据来源的一行，保留原算法/MPL声明/固定上游摘要并记录派生摘要。依据[官方配置接口](https://www.haproxy.com/documentation/haproxy-configuration-manual/3-2r1/)、[3.2源码payload.c](https://github.com/haproxy/haproxy/blob/v3.2.0/src/payload.c)。新内部端口只回环，不解析公网传来的PROXY身份；QUIC无法沿用TCP预读，仍须独立保留partial，不能伪称H3已修。先前`owned-test,http/1.1`实采反例必须修后与tshark首广告值一致。此为复用公开解析/转发扩展，不重写TLS解码。

首测`edge-_jm_tqho`真实Chrome正常重连误报：扩展41（pre_shared_key）由17变18，旧JA4_ab关联假设失效；保存首败，不改触发容量/阈值。协议依据：[RFC8446 4.2.11](https://www.rfc-editor.org/rfc/rfc8446#section-4.2.11)。小适配`continuity.lua`只消费未修改上游`raw`公开输出，规范化该标准恢复扩展、保留版本/全部密码套件/其余扩展/签名算法并哈希；完整原指纹继续记录，TCP/QUIC分组，绝不将此线索升级为单独bot身份。不是减少采集、白名单或全新指纹算法。

独立测量首败：tshark4.6.4在signature_algorithms中保留GREASE，而[JA4规范](https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md)要求所有位置忽略GREASE；独立测试保留原值与按公开规范纠正后的值。另上游Lua读取协商ALPN而非首个广告ALPN，所有在线JA4暂显式标`partial-alpn-negotiated`，不让正常样本恰好相等掩盖反例。关联不使用ALPN与原始扩展数量；额外正常ALPN反例必须实采，不冻结完整JA4正确性。

Reuse Assessment:
- capability: 首个TLS终止点持续产生JA4，并与同一HTTP请求/实验会话关联，避免pcap离线回放才有检测输入。
- existing implementation in repository: Traefik/CrowdSec与tshark实采回放；Traefik当前扩展点不提供ClientHello给bouncer，无法从回源协议重建。
- mature candidates and pinned versions: HAProxy 3.2.9-1ubuntu2.2（Ubuntu26.04便携提取，不安装系统服务，SHA256 dea67c09366e9a2197edcc1341031125c0989c345b9f4f62237f6aac153b5a4d）；FriendlyCaptcha ja4-haproxy v1.0.0 / 6abe401466537f896482900969b06c1e302498a0 / Lua SHA256 7ecfa5d8c3e7e535ede667a67826f241d30249f9d703131bbfb13c75449a5f19。
- selected implementation: 候选尚未冻结；HAProxy ssl_fc采样+未修改原Lua。其21个公开提交、2026-02-12发布、具体源码/测试入口已核对；成熟基础代理不等于附加脚本已自动验收。
- reused public surface: lua.ja4、原生JSON日志、PROXY v2、systemd、CrowdSec原解析与关联规则。
- B-A-T-owned adapter and remaining gap: 仅配置新增本地TLS入口、归属/制品校验和日志字段映射；JA4不是机器人身份，异常只复用既定关联告警；H3正常切换需独立分组，不能因协议不同判bot。
- license/runtime/platform fit: HAProxy包GPL许可随包保留；Lua文件MPL2.0，算法JA4为BSD3，不混淆其它JA4+许可。WSL Ubuntu26.04本机-vv/ldd实际通过，支持Lua/TLS/QUIC，不改Windows信任库。
- browser/runtime/state ownership conflicts: 保留原Traefik/CrowdSec挑战和主业务。新4183入口→专用4182内部TLS入口；PROXY v2仅接受明确本地代理源地址，是传输源地址认证边界，不是反爬白名单，须验伪造头/来源保留。日志不存Cookie/密钥或请求内容。
- replay model calls: 0。
- rejected candidates and evidence: 不自写JA4算法、TLS解码或通用流连接引擎；tshark继续作为独立首段复核。
- focused validation: 先配置/归属/日志有效性，后原生和混合网络异常+正常变化、实际业务及来源防伪；采集成功不能关闭检测验收。

公开来源：[固定源码](https://github.com/FriendlyCaptcha/ja4-haproxy/tree/6abe401466537f896482900969b06c1e302498a0)、[JA4与JA4+许可](https://github.com/FoxIO-LLC/ja4/blob/main/License%20FAQ.md)。Lua的默认fallback与capture-buffer不足必须显式记测量无效。

## 2026-10-08 19:22 起：先完成本地功能和短测，再安排跨天

会话短测复用固定CrowdSec公开`challenge.cookie_ttl`，在无产品/长测运行时临时设为20秒，通过真实网关/原挑战签发，按真实时钟验证到期前接受、到期后重新挑战，再在finally恢复原配置字节并重启核验。签名/PoW/票据引擎全部复用原组件，不自己签Cookie，不降低评分规则；短TTL比默认更短，测试证据不得写为真实12小时验收。Cookie/配置密钥仅内存，证据只保留配置SHA256、状态和计数。

后续B05短测：`author-access-vj46l28w`使用真实Runner→author_step→B-U Agent.run和本地HTTP503，模型回复仅为固定测试夹具，无外部模型。发现普通runtime已有停止规则未覆盖探索：两个请求、三个模型决策，预先标准为首次明确HTTP失败后一个请求、一个决策。Reuse Assessment：复用原HumanWaitControl.finish_step/on_step_end、Agent.stop和Runner.assert_document_access；只加入B-A-T访问约束适配，不复制Agent循环、不改重试阈值、不生成测试模型。正常200仍应允许两次请求及结束决策，人工等待/恢复保留。Product Alignment：自然语言准备阶段的通用站点访问；输入既有URL，输出原sourceGaps及停止事实；适用于查询与表单任务；不增加复跑模型，不写站点特判。

用户明确要求先结清所有当前可运行功能和短测，服务稳定完善后才讨论云端部署与跨天。已取消两个日级组和12小时Cookie worker，保留小时正反例；不得把等待当作停止开发的理由。

Reuse Assessment:
- capability: 将已校准的浏览器标记与DOM输入观测接入真实业务入口，而非只离线回放。
- existing implementation in repository: origin业务页、固定BotD 2.0.0、本地observations日志、CrowdSec parser/scenario。
- mature candidates and pinned versions: 既定BotD 2.0.0（MIT）与CrowdSec 1.8.1；源码及规则校准来源沿用实施记录。
- selected implementation: BotD公开load/getDetections/getComponents和CrowdSec原生trigger。
- reused public surface: monitoring=false本地bundle、既有文件采集与原生规则。
- B-A-T-owned adapter and remaining gap: 页面事件摘要→Zod校验→本地日志；源站绑定实际IP/场景，客户端报告可伪造，因此只告警，不授予身份或豁免原挑战；统计模型与TLS实时关联仍独立待办。
- license/runtime/platform fit: 无新增依赖，Windows浏览器+WSL源站。
- browser/runtime/state ownership conflicts: 不增加浏览器会话，无外发，不持久化输入值/按键/剪贴板/原始指纹；遥测走独立路径，不冒充业务请求数，网关全量仍记录。
- replay model calls: 0。
- rejected candidates and evidence: 无需另造评分器/挑战引擎；只消费已校准的成熟规则。
- focused validation: 原生规则正常/异常/无效输入，以及完整4187入口实际读取/表单/脚本事件阳性；检测阴性必须同时报告组件缺失，不能升级为完整通过。

## 2026-10-08 已授权实施：检测校准与原生浏览器请求

用户已确认新计划。现有 master/e92b1d2 开工，原文档改动保留；[实施证据](ANTIBOT_IMPLEMENTATION_20261008.md)。复用固定 CrowdSec 上游挑战/指纹测试和 `cscli hubtest`，窗口与关联均由原生规则执行。新增 tshark 4.6.4（WSL）观测首个 TLS 终止点，未改系统证书信任。账号读取改用原 owner 页的 Fetch，保留原 MC 签名与返回解析。真实对照显示旧三次 HTTP/1.1 独立连接变为 Chrome HTTP/2 复用；这不是完整反爬验收。当前版本 `state_input_file/state_output_dir` 仅有配置声明，没有找到恢复调用，不能据字段存在接入虚假持久化。

以下“待 review / 不开发”均为上一 session 历史状态，整体范围仍以已确认主计划为准。

后续复用：专属启动直接使用固定B-U `_find_free_port`，B-A-T仅核对psutil监听者归属；本机Chrome实证visible标记改善、headless仍有UA阳性，文档概述不能替代测量。真实Cookie/票据验证直接消费CrowdSec原HTTP协议，不复写签名/PoW/会话引擎。原GeoIPEnrich及TimezoneCountryMismatch使用上游微型MMDB校准，有ASN无City和私有IP保持unavailable，未伪称实时全球数据。详细首次失败、正常反例和边界均在实施记录。

普通任务5xx消费原CDP主文档状态和既有externalFailure transient/blocked，避免网站503被记为成功；真实正常恢复与一次请求分母验证后冻结该小补丁。Cookie寿命采用原12小时配置与真实时钟，单独内存worker仅3次HTTP检查，不自写会话引擎，不持久化Cookie。

本轮继续复用BotD2.0.0本地探针（MIT，关闭monitoring）、固定CrowdSec JS/Go校准与官方GetDecisionsSinceCount历史profile；bouncer默认未封禁缓存60秒的实际处置延迟已经验证并通过配置改善。B-U0.13.8普通文本原生清空与框架提交采用实例级薄适配，源码依据、正常React回归及首败见实施记录；特殊控件仍用上游。motion-attestation与公开行为数据的判别有效性未达到选型门，未调轨迹阈值迎合B-A-T。Web Bot Auth0.2.0官方库（Apache-2.0、自述未经审计）已完成本地签名、到期、authority、nonce等正反例；签名bot身份不等于真人/硬件证明。CreepJS固定原模块已完成篡改/基线/缺失/CSP四类实际检查，不外发指纹。

行为候选新增固定FCaptcha 1.43.0源码审计：其14-persona基准源码明确是脚本CDP、环境归一与合成扰动，不能作为真人群体正常反例；JA4表为空，不能把导出API存在当成有效指纹识别。暂不引入另一套网关或重写评分器。原CrowdSec配置承担可解释关联；需分别核对误报、数据有效性和真实本地行为。

## 2026-10-08 当前范围：公开检测覆盖与下一阶段方案 review

入口：[主计划](ANTIBOT_NEXT_SESSION_PLAN_20261008.md)、[逐项缺口](ANTIBOT_COVERAGE_BACKLOG_20261008.md)、[对抗复审](ANTIBOT_PLAN_REVIEW_20261008.md)。当前仅整理和复审文档；用户 review 确认后另开 session 开发。

范围纠正：盾主动调查并补齐公开可实现机制，不能把“现有探针只命中 CDP”当成停止依据；矛调查所有相关底层路径，实际补丁仍需有效测量和主业务回归。默认通过已有组件配置、公开扩展点、成熟开源库与薄适配补缺；没有现成库不是自动豁免，也不授权重造检测/挑战/调度引擎。

CrowdSec 当前规则实际参与评分与挑战，但逐项校准不完整；TLS/JA4、输入行为模型、跨任务长期频率与完整会话关联仍是缺口。商业资料用于确认公开机制，全球数据/私有模型与本地可实现软件分开结算。已有固定候选保留，下一阶段重新核验具体子项和最小样本后才能冻结新增选型。

本次代码快照 `e92b1d2` 已保存；本 session 未新增产品依赖、未运行浏览器或重新验收效果。以下记录为各历史阶段的证据，不能覆盖上述范围更新。

## 2026-10-08 历史冻结：无 Docker 检测服务及底层控制对照

CrowdSec 1.8.1（909b515…，MIT）、Hub f5cd097…（MIT）、Traefik 3.7.14（MIT）、bouncer v1.8.0-alpha（710e888…，Apache-2.0）通过公开 localplugins 与 AppSec 原生挑战协议组合。便携发行包 SHA256 固定在 tools/antibot-lab/artifacts.json，现有 WSL/systemd 用户服务管理生命周期；没有另写评分/挑战/PoW/规则安装器。候选选择及公开配置源见 [服务实施](ANTIBOT_SERVICE_IMPLEMENTATION_20261008.md)。Alpha 状态保留为兼容风险。

固定 Hub 已缓存 YAML 时，cscli install 跳过外部数据集下载，导致 SQLi/XSS 等已有规则报缺文件；核验固定 CrowdSec clihub.upgrade 源码后，使用其官方 hub upgrade 数据刷新解决，未换规则分支，实际数据摘要另存。源码：https://github.com/crowdsecurity/crowdsec/blob/909b5157986a2b2c2163300fdaef5ed01289f7d2/cmd/crowdsec-cli/clihub/hub.go 。

明确测量边界：之前人工访问可能留下 clearance，不能把后续同域放行当独立自动化阴性。每个新样本改用 UUID.localhost，检测器不读取分组标签，双侧同默认 balanced/75；旧 Browser+原事件桥三轮均 CDP/100 拒绝，新会话复用/隔离事件采集三轮官方 challenge_accepted/solved 增一且业务完成。精确候选得分未知，不能记 0。根因和修复属于底层控制，未新增产品依赖或改变 B-U Agent loop。

已完成服务真实重启持久化及最小类型/源码检查。网络 TLS/JA4、长期请求频率、商用风控未测；没有把本轮结果扩展成全网不可识别。完整首败和交付见 [结果记录](ANTIBOT_DELIVERY_20261008.md)。

## 2026-10-08 历史：无 Docker 的固定开源组合验证中

复用 CrowdSec 1.8.1、固定 Hub、Traefik 3.7.14 与支持 AppSec 原生挑战的固定 bouncer 1.8.0-alpha。现有 WSL Ubuntu/systemd 已核验可用，便携制品限于 work/antibot-service。评分、挑战签名、PoW 和跨请求规则均属于上游，不在 B-A-T 重写。选型仍需真实样本验证，详见实施记录。

详见 [常驻服务实施记录](ANTIBOT_SERVICE_IMPLEMENTATION_20261008.md)。下面是历史阶段证据。

## 2026-10-08 W3 效果确认与独立探针冻结

保留 browser-use 0.13.8 / cdp-use 1.4.5；以原 Page 的公开 session_id、Chromium isolated world/显式 Runtime.addBinding 和既有 daily BrowserModel 的标准 Target 事件完成最小适配。真实 daily 下，固定 fpscanner 1.0.8 的 CDP 信号从三轮均命中变为三轮均未命中，webdriver 两侧本来均 false；没有修改网页属性或采用专属启动参数修正替代日常路径。

独立采用 [Brotector 98b3309](https://github.com/ttlns/brotector/blob/98b330999e9928a226ca0c8254dddf909d1583bd/brotector.js) 的 Runtime 分支，MIT、浏览器 JS、测试期本地托管；不加入产品运行依赖。固定 JS/LICENSE/PDF 摘要见 [W3 复用记录](ANTIBOT_W3_EVENT_CAPTURE_20261007.md)。当前 Chrome 中 stack getter 计数为 0，而原版 Error.prototype.name 计数对显式 Runtime.enable 正例为 3；因此不能采用只看旧 stack getter 的探针作为独立证明。Brotector 原版 PDF 分支会干扰单主文档来源，首次日常复核第二轮被来源保护拒绝；通过公开派生适配只禁用该无关分支、保留 Runtime 源码/阈值，重新三正三负校准有效，再取得日常修正前 3/3、修正后 0/3。产品代码未按独立探针调参。

既有 `method-completion-native.acceptance.ts` 完成真实准备、发布、动态变化和失败分支，零普通复跑模型调用；没有复制 Agent loop、检测引擎或发布调度。效果范围限定为已测 E04/E06；人工 Profile 差异、十六项 fpscanner unknown、四个原测试基线失败、常驻 API 未重启及未测网络/挑战维度均在交付记录中保留。以下调研条目记录各阶段当时认识。

## 2026-10-08 W3 daily 兼容缺口：标准 Target 事实通知

实际 daily 的旧实现三轮 webdriver=false、CDP=true，证明先前 dedicated webdriver 阳性不能用于此模式。候选真实失败在 TargetResolver 的 selector map 为空，尚未进入事件桥；单补 DOM.enable 无效，已撤销。B-U 固定 0.13.8 的 SessionManager 通过 Target.targetInfoChanged 更新 URL/title，DOMWatchdog 根据该缓存选择是否采集 DOM；现有 Playwright 派生 relay 虽已查询真实 TargetInfo，却没有把查询后的变化通知 SDK。

保留成熟 BrowserModel、chrome.debugger 原生查询和 B-U 事实源，仅在同一 target 的真实 URL/title 改变时发标准事件，复用 CDPOwnerScopes 投递给原 owner。无新依赖、无新轮询、不恢复多余 attach/Runtime 订阅。协议回归已复现缺事件，并验证修正、去重、身份拒绝、原生查询失败保留及 owner 隔离。真实浏览器修正结果仍未测；完整选型和日志见 [W3 记录](ANTIBOT_W3_EVENT_CAPTURE_20261007.md#2026-10-08daily-首败与离线修复边界)。

独立复核只做了源码范围核验：固定 [BotD error_trace](https://github.com/fingerprintjs/BotD/blob/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src/sources/error_trace.ts) 和 [CreepJS headless](https://github.com/abrahamjuliot/creepjs/blob/10aa6724cd33a1015db1574211890518cd04f0cc/src/headless/index.ts) 所列检测不能直接当作本轮 Runtime 订阅机制的独立证明；Rebrowser Bot Detector 有相关候选，但尚未锁版本、核验全源码或运行，不宣称已接入独立探针。

## 2026-10-07 W3：复用 B-U 会话和 Chromium 隔离上下文

实际全局模式 daily/revision=55，前次 dedicated 实验不能代表此路径。已保留原 browser-use/cdp-use 和控制动作，仅在 Browser 构造适配中为原 Page 传入 SessionManager 已有 session_id；事件采集复用 Page.createIsolatedWorld、显式 context 的 Runtime.addBinding、DOM.resolveNode。原生事件结构、目标命中和来源合同继续保留，不重造浏览器控制/Agent loop，也不在网页伪造 webdriver。

固定上游源码表明：B-U 不传 session_id 的 Actor 会额外 attach 并启用 Runtime；V8 的 bindingCalled 不要求开启整个 Runtime 流，但仅删除 enable 会失去原 executionContextCreated 与跨文档绑定。通过公开 isolated world 返回的真实 context ID 建立 frame 关联，每次动作重新取得当前 frame/context，避免直接关闭别人的 Runtime 订阅。

运行结果明确分阶段：原组件 CDP=true；仅隔离桥仍 true；会话复用后 false。完整 Runner 无界面三轮动态选择、零模型和清理通过。日常扩展前后比较、独立探针、正式发布链尚未验收。完整 Product Alignment、Reuse Assessment、源码 URL、失败与清理证据见 [W3 实施记录](ANTIBOT_W3_EVENT_CAPTURE_20261007.md)。

## 2026-10-07 M0 六组闭环：启动标记与执行路径差异已复现

用户明确安排剩余两组可见实验后，B-U 观察与 B-A-T 原 Runner 执行各三轮完成，合并人工/校准/调试/连接共 18 样本。Chrome 154.0.8037.98 下，主页面/iframe webdriver：人工 0/3、其余各组 3/3；CDP：仅 B-A-T 执行 3/3，其余各组 0/3。B-A-T 三轮动态选择均正确，每轮三条普通能力命令、0 模型，cleanup confirmed。限定 M0 测量闭环已完成，非反检测效果验收。

现有 `_launch` 使用端口 0；[GoogleChrome 固定版本文档](https://github.com/GoogleChrome/chrome-launcher/blob/a8e688f6b7524eb8fa59bdb8f5d201e7b567c6e0/docs/chrome-flags-for-tools.md)明确该配置设置 webdriver=true，与实测相符。将其列为 W1 最小候选，生产配置尚未改。CDP 差异只能定位到完整 Runner 路径，尚不能归因单个动作/观察调用，不进行批量 stealth 注入。明细及 P2/P3 边界见 [M0 结算](ANTIBOT_M0_IMPLEMENTATION_20261007.md#六组测量完成后的结算)。

## 2026-10-07 后续人工对照：已取得有效 webdriver 正反例

用户重新授权并亲自完成三轮人工测试，`run-CDgBAu` 的已登记五项信号输入均有效、均未命中。与此前 `run-2DrjRv` 的正例/仅调试端口/B-U 连接各三轮相比，浏览器二进制 SHA256、Windows、可见模式及全新 Profile 策略匹配；主页面和 iframe 的 webdriver 有稳定正反例。CDP 规则两侧均 false，仍缺机制阳性校准，不能据此宣称控制不可见。

人工第二轮选择版本 7（当轮最大已发布为 11），业务选择保留 failed；真人身份/环境采样仍有效。报告将信号校准与任务正确性分别列出，不要求为了环境参考重复人工操作。现有 ManagedWindow 启动源码使用 `--remote-debugging-port=0`，仅登记为后续待验证的 W1 路径，尚未改生产代码。详见 [人工补测记录](ANTIBOT_M0_IMPLEMENTATION_20261007.md#人工补测与离线比较)。

## 2026-10-07 M0 首轮实施：部分证据，可见测试已停止

测试侧复用 fpscanner 1.0.8 固定 npm 制品，sha512 及 ES bundle sha256 均锁定；入口与五条规则源码逐一匹配复审固定提交。只接本地 node:http、B-U 原生接口与现有 RunnerProcess，无生产代码/数据库/协议改造。实现前 Product Alignment/Reuse Assessment、探针有效性和边界见 [M0 实施记录](ANTIBOT_M0_IMPLEMENTATION_20261007.md)。

正例、仅开启调试端口、B-U 仅连接各三轮：webdriver 均命中，CDP 规则均未命中。后者没有机制阳性校准，不能称“未暴露 CDP”。人工数据缺失、观察组中断、产品执行未测；未触发生产补丁。用户暂时无空人工操作后，开发 agent 错误批量启动可见测试干扰桌面，随后按用户反馈立即停止并核验关闭。后续不得把“先做其他工作”当作批量可见测试许可。

## 2026-10-07 已满足初态下的方法留存适配

复用 browser-use 0.13.8 的 Tools 注册、原生 Agent/step/done、现有 find_elements 与只读字段采样，复用现有 source-only 选择注解及 QuickJS 0.32.0 验证，保持 LangGraph 1.4.14 的运行职责。没有增删依赖、重写调度器或增加普通复跑模型调用。具体 Product Alignment/Reuse Assessment 及证据见 [实施方案](TASK_METHOD_COMPLETION_PLAN_20261007.md#10-实施与证据2026-10-07)。

新增仅限 B-A-T 来源适配：只读 inspected_method、宿主 preparation_method_receipt、`/3` 版本分派以及到已有 function/navigate IR 的映射。未执行导航的效果明确等待原 sample 真实验证，不生成虚构 matched=true。URL 授权核验复用固定 B-U SecurityWatchdog 的 `_is_url_allowed`；这是一个受版本约束的私有适配点，已核验本机 0.13.8 方法签名/行为并覆盖拒绝路径，升级需复查；不另造域名白名单框架。

## 2026-10-07 开发工具策略根因与项目现状只读核验

对照本机 Codex 0.160.0 与固定官方源码，三次 `Remove-Item … -Force` 的 BBP 来自 Windows 危险命令分类、Never→Forbidden 及 Other 通用错误文案；默认配置/空规则匹配均不能替代有效会话和内置判定。没有引入库、改安全配置、绕过策略或新增产品 LLM 调用。根因、执行门和未完成的永久清理见 [复盘](TOOL_POLICY_INCIDENT_20261007.md)。

当前能力按源码、既有受控/真实验收、API/SQLite 和发布链交叉结算，见 [统一现状](PROJECT_STATUS_20261007.md)。已发布 Bilibili 链只有 navigate/input/click/click/wait/terminal，确认计划中的运行时“最新”没有显式读取/选择或等价规则证明；保留当次运行成功，不外推动态覆盖。本轮没有据此改 IR、添加完成 judge 或启动新任务。

## 2026-10-07 所选浏览器、冷启动连接及可复用登录来源

继续复用固定MediaCrawler `380b4260`、social-auto-upload `0012d2c3`、Playwright扩展 `8b552173` 以及原AccountIdentities/PlatformChecks/AccountTransfers。修复宿主browserKind冻结、维护可见性、connect页既有keepalive生命周期；已安装扩展需要实际Reload，构建成功不能代替生效证据。

真实差异证明旧日常凭据与仍有效的专属凭据不同而UID/UA相同；同一检查器在两者分别返回未登录/已登录。新来源选择只使用另一当前binding的同平台/版本/同UID已验证候选，写入仍由原transfer重新检查双方与回滚保护；不新增同步框架或站点特判。23项定向回归、两种真实维护入口、冷启动和冻结后的原正式任务通过。完整Product Alignment、Reuse Assessment、首败和冻结边界见[记录](BROWSER_SELECTION_REPAIR_20261007.md)。

## 2026-10-07 未写入登录转移的离线恢复

现场 transfer `173d7956` 的 DPAPI 材料为 `rollback_ready`，无任何已写入凭据；恢复却前置 inspect，空 relay 枚举同时堵住账号检查和 B-U 准备。新增回归先在 HEAD 复现：未写入恢复仍调用浏览器。原始首次转移错误被旧 safeReason 抹去，不能将猜测当根因。

Product Alignment:
- natural-language task: 检查账号以及启动任何使用已登记账号的浏览器任务。
- reusable chain boundary: 账号准备恢复，不修改网站任务或执行图。
- runtime inputs: 既有加密恢复引用与 owner/lease。
- dynamic task outputs: 无写入撤销或需要有界浏览器恢复。
- generic platform capability used: 原 DPAPI RollbackStore、原 auth_restore 与原窗口清理。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 按既有写前日志事实恢复未开始的转移，避免无意义的旧页连接依赖。
- existing implementation in repository: account_auth.py 在每条 Cookie/storage 写入前持久化 write_started；account_secrets.py 的原 DPAPI store；原 account_session 协议。
- mature candidates and pinned versions: 现有 Windows DPAPI、Python 3.12 和既有 Playwright 原生 CDP；无新依赖。
- selected implementation: 原恢复入口先检查加密阶段；未写入直接结束，有写入仍用原恢复校验。
- reused public surface: RollbackStore.load/remove 和原 restore；不自建恢复循环。
- B-A-T-owned adapter and remaining gap: 宿主先作不连接浏览器的恢复探测，再根据 browser_required 进入原路径；保留 schema/owner/scope 校验。
- license/runtime/platform fit: 既有 Windows 原生实现，无许可或平台变化。
- browser/runtime/state ownership conflicts: 未写入分支不改当前浏览器状态；已写入分支不放宽 digest 守卫。
- replay model calls: 0。
- rejected candidates and evidence: 不清空数据库 pending、不猜原页已关、不恢复未曾写入的旧登录。
- focused validation: Python 2项、账号操作/共享登录15项、后续人工可见性与选择12项定点通过，API/Workbench检查和构建通过；原生 headless 故障注入后原UI检查18.972秒完成且物理残留0；保存的真实账号经UI检查/刷新通过，0模型、维护页closed。对抗P2人工复用隐藏页已修并复审。冻结原Bilibili任务自然完成B-U、编译、两次0模型复跑及UI发布；正式运行受keep_open/headless UI守卫阻塞，未绕过提交，完整产品验收未通过。921文件冻结比对无变化，见[完整记录](ACCOUNT_RECOVERY_AND_BILI_20261007.md)。

自动专属账号检查直接复用 ManagedWindow/Chrome 的现有 headless 启动；内部 `accountMaintenance` 只允许把该连接交回同一宿主检查操作，不放开任务的 headless 人工交接。账号、owner、Profile、CDP 核验及 finally 关闭全部沿原实现；人工打开、添加和重新登录仍可见。该字段为宿主固定值，不交由模型生成。B-U 任务继续使用既有独立 headless 模式，未加入网站补丁。

## 2026-10-07 账号检查整次操作与收尾

现场操作 d15feffd：120 秒期限包含建窗、检查与跨 Profile 登录复用；目标在 16:01:53Z 已确认登录，随后备份删除撞到期限，事务回滚，目标维护页没有进入 finally 收尾。每次 accountSession 都重启完整 Python runner，之前测试替换了该真实传输，因此没有覆盖累计开销。

Product Alignment:
- natural-language task: 检查任意已登记网站的登录，必要时复用已确认账号。
- reusable chain boundary: 一次账号操作；不修改业务任务链。
- runtime inputs: 已登记身份、owner、lease 与取消信号。
- dynamic task outputs: 真实账号检查、登录复用及各自清理事实。
- generic platform capability used: 原 RunnerProcess 多请求协议、Node AsyncLocalStorage、原 AccountWindows.finish。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同次账号操作复用已启动进程，按原信号取消；检查页 finally 收尾。
- existing implementation in repository: RunnerProcess.request/close、Python AuthorRequestLoop、AccountService.exclusive 和 AccountWindows.finish。
- mature candidates and pinned versions: Node 24.14.1 AsyncLocalStorage；现有 Python 3.12 asyncio 与固定 B-U 0.13.8/CDP 1.4.5。
- selected implementation: 只扩展原进程生命周期适配，不建进程池、重试或浏览器驱动。
- reused public surface: AsyncLocalStorage.run/getStore；原 runner 的多条 account_session 请求和关闭协议。
- B-A-T-owned adapter and remaining gap: 操作作用域和一次请求取消后原进程废弃；保持每条请求的 owner 校验。
- license/runtime/platform fit: 已安装 Node/Python、Windows 既有实现，无新库。
- browser/runtime/state ownership conflicts: 同一时刻仍只借用一个 owner 页；操作结束必关本次无浏览器控制权的 Python runner，取消后恢复使用新进程。
- replay model calls: 0。
- rejected candidates and evidence: 不以单纯增大超时掩盖重复进程开销；不把保留人工登录页套用于只读检查失败。
- focused validation: 最终冻结 round-4 完整 UI 检查操作通过，原 native runner/隔离 headless 双 Profile/原扩展/本地认证站，20.121 秒，12 次账号请求仅 1 次 compiler 启动，0 模型；物理新增残留页 0。关闭失败的独立 UI notice、刷新及手动关页后 prepareStartup 恢复通过；后者直接复用原精确 owner finish，移除阻止其运行的 inspect 前置条件，不把空枚举视为已关闭。7 定点、API 检查、Workbench 构建通过；对抗发现的清理事实隐藏 P2 已修复并复审，恢复路径补审无新增 P1/P2。首败和未测范围见 [完整记录](ACCOUNT_OPERATION_FIX_20261007.md)。

## 2026-10-06 冻结版本 GitHub 主流程验收

本轮未引入或替换组件。用户明确不强制接入 BrowserSkill，沿现有 Playwright 扩展/B-U 生产路径，从简短新需求检验系统自主澄清、计划、输出及执行。连接和本次自动清理有事实，但准备失败：单 once 计划、4 个动态条目选择证据缺口、字段读取失败，未进入正式运行。实际轨迹和未测范围见[验收记录](GITHUB_MAINLINE_ACCEPTANCE_20261006.md)。后续修复须针对计划和编译衔接取固定源码依据，不把单站选择器补丁、底层连接成功或开发救场当作通用主流程交付。

## 2026-10-06 大成果投影与重启后物理关闭

原生Node CPU采样定位/api/tasks重复加载含原图的execution；直接复用已固定lru-cache缓存轻量TaskSummary，SQLite事实版本失效，1项定点通过，暖列表31/16ms，最终真实完成画布7秒可见。未重写持久化或扩大缓存为整份页面。

退出进程不等于物理页面关闭：复用现有runner审计、AttachedWindow.end与固定Playwright relay（8b552173e8d767db29b8baef8f4a1f08cf7f26bf，Apache-2.0）；显式end沿原授权入口重连，原owner的持久targetId通过Chrome debugger.getTargets精确映射tabId，再调用tabs.remove并核验消失。原生关闭参考BrowserSkill固定3f10983c的tools/tabs.ts，未引入新的连接或资源调度框架。官方API依据和完整Product Alignment/Reuse Assessment在[系统底账](MAINLINE_SYSTEM_AUDIT_20261006.md)。

最小真实样本：原正式6目标及两个旧试跑租约均ended，京东窗口消失；工作台保留。关闭恢复9项、传输1项、目标/隔离3项、扩展构建与API类型检查通过。对抗P1（合法session跳过target归属）已修并复审。BrowserSkill原生会话与现生产CDP仍是不同接口，全面替换不在本轮已通过结论内。

## 2026-10-06 就绪验证、结果呈现与故障定位

就绪摘要直接复用 lru-cache11.4.0（固定1702b18817826ef7e5505ab2aa1e31f540312cd6），SQLite data_version/total_changes约束失效；发布入口仍完整读取。页面图文仅适配已有React19.1.1、Radix3.3.0、Zod4.1.8和浏览器原生img/details/Blob，不执行保存的HTML。运行异常位置复用Python3.12原生traceback及项目既有脱敏通道，不新增调度、重试或浏览器实现。对应Product Alignment、Reuse Assessment、源码链接、验证限制及对抗审查见[系统底账](MAINLINE_SYSTEM_AUDIT_20261006.md)。

## 2026-10-06 主子节点接线与原生可选目标

源码链已确认：final真实控制IR进入原CanvasActionList，prefix只投影已闭合普通动作；TaskPlan.each是复用同一链的外层调用，不应为了显示再制造IR loop。撤销外框与返回卡片，直接复用原StageCanvasCard/动作列表/LoopBody。React Flow12.11.6固定源码0a1f9575的原生测量接既有Dagre，不新增布局/执行框架。B-U0.13.8固定源码eb41269的scroll明确支持可选index，现仅补齐既有目标解析器衔接；输入值等待复用既有Tenacity/StepVerifier，不重派动作、不放松目标和值。Product Alignment、Reuse Assessment、固定链接、对抗审查和最小验证见[系统底账](MAINLINE_SYSTEM_AUDIT_20261006.md)。局部验证不冻结原五项任务验收。

## 2026-10-06 原任务编译实际断点

真实 prepare 6dd44720 来源执行完成，却因联想词误选缺少动态绑定而无法编译。保留门槛，仅用 B-U 固定源码的原生输入/提交能力修正探索说明，并同步已有 regions 采集合同；不新增浏览器框架。Product Alignment、Reuse Assessment、原来源证据及验收门见 [原任务复跑验收](JD_REPLAY_ACCEPTANCE_20261006.md)。

本次源码核对中，以下是“尚未证明有可直接接入的上游实现”，不是声称所有开源项目都没有该能力：

| 边界 | 固定来源及已核验事实 | 仍未有依据的部分 |
| --- | --- | --- |
| BrowserSkill 到 B-U | BrowserSkill 3f10983c 的原生 session/tool RPC 已可用；B-U 0.13.8 当前使用 CDP | 未找到它直接提供 B-U 标准 CDP WebSocket 的公开接口，不得补造网关或宣布替换完成 |
| 探索记录转 B-A-T 链 | workflow-use 5d2d19fe 的 recorder/builder/executor 是原实现；本仓 LOCAL-CHANGES 将 hybrid 下 119 个生产 Python 文件明确列为本地新增 | 原仓没有本项目完整 IR、证据、绑定编译实现；位于 vendor 不能充当直接复用证明，不得将新增通用算法冒称上游能力 |
| 目标与选择器 | B-U 原生 Actor/DOM 和 workflow-use ElementFinder 可复用 | record_projection_dom 的选择器组合及项目自己的目标判定仍是本地逻辑；本轮没有将其扩大或冻结为成熟方案 |
| 内容与暂停恢复 | B-U 原生 Page/Element、CDP 原资源读取；BrowserSkill 原生 request_help/session 生命周期 | B-A-T coverage 证明、跨层 waitpoint 及其恢复适配不是 BrowserSkill 原实现，既有局部测试不证明全部恢复链路 |
| 图推进 | 现有 @langchain/langgraph 1.4.14 StateGraph 在 engine.ts 中实际被调用 | B-A-T IR/审计映射属于本项目职责；不得在该层另写通用调度或检查点框架 |

后续实际复跑又确认：普通点击不应强制出现页面后态，也不应在 Tools.act 前由项目物理命中算法否决原生后备。继续直接复用固定 B-U eb41269 的 Tools.act / DefaultActionWatchdog，缩减该适配层；原生成果只经过重新编译，不重放模型探索。空条件已贯通 TS、Python 命令及 StepVerifier；离线恢复重新判定旧编译终态，保留真实来源缺口。上表未证实的基础能力不借本次业务验收宣布完成；BrowserSkill 全面接入按用户最新指令后置。

## 2026-10-06 直接恢复成熟组件连接入口

按用户“通用代码必须有源码参考、优先直接复用”要求，核验 Tencent/BrowserSkill 3f10983c 原 daemon/扩展/session；本机 0.3.2 持久宿主连接、独立空白 session start/stop 通过，不是 B-U CDP 兼容证明。当前生产 CDP 复用已有 Playwright 8b552173：删除已保存授权连接中的 requestPopup 拦截，恢复原服务 launcher/握手。真实独立宿主与正常服务均连接成功，工作台票据为空，没有 JD/模型请求；不新增转换网关。类型检查通过，已有首次授权测试保留 Windows mode 断言失败。对抗静态审查无新增确定 P1/P2。完整来源、实施、首败、未测范围见 [上游复用记录](BROWSER_RUNTIME_UPSTREAM_REUSE_20261006.md)。

## 2026-10-06 用户明确要求直接复用 BrowserSkill

此前仅参考 BrowserSkill 界面、以自定授权策略拒绝其连接机制的取舍已撤销。官方当前 HEAD 已核验为3f10983c09fcd443c7420830ab984c9d409954bf；已读原 ConnectionController、WSTransport、后台启动/唤醒/保活及断线清理源码。本机CLI为0.3.1，尚未确认其与main对应关系；原foreground启动后独立status仍不在线，保留首败。生产替换未冻结，不能宣称已接入。来源清单、直接复用边界及最小验证见[BROWSER_RUNTIME_UPSTREAM_REUSE_20261006.md](BROWSER_RUNTIME_UPSTREAM_REUSE_20261006.md)。

## 2026-10-06 11:38 debugger状态不能作为物理关窗证明

现场Chrome原生onDetach(target_closed)之后，本连接原窗口的Chrome.windows.update(id,{})仍成功，未发关闭命令；空Target.getTargets只反映扩展可控制的debugger会话。沿现有微软协议v2与Chrome tabs.remove/onRemoved复用，保留创建者的物理tab清理引用，禁止再次自动attach。Python通过现有Browser.getVersion区分桥接枚举与原生CDP，未知端点保守返回未确认，不复制浏览器控制或恢复框架。

本地原Chrome真实Cancel后窗口仍存在，再经原finally关闭并收到onRemoved；modelCalls=0、未访问京东。对抗审查指出只读入口及新增popup竞态，修正后窄复核通过。服务/扩展重启丢失原映射不推测个人tab归属；这仍不证明京东任务完成或验证码触发原因。详见[修复计划](MODULE_DELIVERY_REPAIR_20261006.md)与[实际结果](MODULE_DELIVERY_RESULT_20261006.md)。

## 2026-10-06 区域采集与单条字段记录分离

原62a122c9的B-U找到7个详情模块却未采集，因为宿主工具强制模型定位唯一父CSS。复用B-U0.13.8原生Page.query/Element、DOM.contains/parentElement及受控CDP把已观察相关区域解析为公共祖先，再调用现有capture_region和原图保存；不另造采集引擎或字段清洗。选择器查询与祖先Element必须复用同一初始化Page，首个真实样本揭示该要求，修后两输入完整范围采集通过。CDP对象释放为best-effort，不覆盖身份错误，取消传播。详见[设计与复用记录](MODULE_DELIVERY_REPAIR_20261006.md)。真实原任务仍待验收，成熟组件复用不构成业务成功证明。

## 2026-10-06 人工交接与受控焦点恢复

详见[继续修复设计](MODULE_DELIVERY_REPAIR_20261006.md)。实际SDK0.13.8源码表明：原生SessionManager负责恢复锁/事件、目标与session池；B-A-T此前将恢复替换为无条件失败，导致已有任务列表页也不可恢复。现在只适配候选所有权和session有效性，复用公开get_all_sessions_for_target及原恢复，不复制调度；ContextVar仅禁止恢复中应急建页，正常任务新tab动作保留。原SDK测试验证失效详情不能遮挡有效列表，且个人页不进入候选。

人工工具的resumeUrl是本项目额外必填字段，URL跳转不能靠模型猜测。新工具删除该字段，继续复用原on_step_end等待、显式宿主确认、受控身份和授权来源；编译以真实稳定post为v2证据，普通复跑沿既有人工检查点处理。v1来源和发布版本不改。真实旧500的原生代码没有取得，不能把静态缺陷或测试结果当它的完整因果证明。

## 2026-10-06 同版业务步骤与浏览器分组

复用结论在 [本轮实施文档](MODULE_DELIVERY_REPAIR_20261006.md)。保留B-U0.13.8原生Agent loop、既有workflow-use适配、LangGraph、TaskPlan/once/each和React Flow；宿主只投影同版业务步骤/值绑定及真实链路引用，不新增规划Agent或调度器。Chrome已保存关闭组独立于任务窗口；[官方tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)没有关闭保存组删除接口。本轮用原生菜单清理17组，停止自动分组，授权成员复用RelayConnection.attachedTabs。真实模型自动生成非采集逐项步骤；既有方法3→2项完整发布复跑0模型通过。原京东曾完成来源、进入详情，读取失败复现为Python拒绝Chrome已加载的缺填充Base64；复用原DataHandler/标准库解码，仅补必要填充，同页整区域0模型读取通过。随后完整任务8d6e4d1b失败在导航后的SDK当前页焦点丢失，确切事件未查明；截图关/开各一次零模型单段通过不作为修复或五项完成证据。展示复用现有Artifact，逐步保存已收尾快照而不提前保存可执行链。详见 [实际结果](MODULE_DELIVERY_RESULT_20261006.md)。

## 2026-10-06 复用原生几何/可见区域及现有 scope

Reuse Assessment:
- capability: 捕获已经内嵌于当前页面的原图，不误要求它出现在Chrome网络资源树中。
- existing implementation in repository: capture_region、resource_index、Page.getResourceContent、原图字节预算与receipt。
- mature candidates and pinned versions: Python3.12标准库urllib.request.DataHandler（RFC2397），现有ChromeCDP资源API。
- selected implementation: data URI直接使用标准库DataHandler.data_open；网络图片仍只读取Chrome已加载资源。
- reused public surface: DataHandler.data_open(Request)、response.read/headers.get_content_type、既有Page.getResourceContent。
- B-A-T-owned adapter and remaining gap: 按URI协议接到同一个原图/字节预算出口；隐藏CSS背景不代表实际渲染资源，不纳入需取得的图片集合。可见宿主的伪元素另按其自身computed style检查display/visibility/opacity，保留原DOM ordinal与离屏可见内容。
- license/runtime/platform fit: Python3.12标准库/PSF许可，当前Windows受管环境；不新增依赖。
- browser/runtime/state ownership conflicts: data解码没有网络、Cookie、另一个浏览器或HTTP downloader；网络资源只读当前owner的CDP。
- replay model calls: 0。
- rejected candidates and evidence: 现实现只看Page.getResourceTree会把内嵌data图判missing；不以缺资源为理由建立带凭据的下载器，也不放弃原图完整性门。
- focused validation: 已有真实Chrome原图/区域测试增加data原图及隐藏背景，保留离屏可见canvas拒绝；修后原任务再验收。

标准库能力据 [Python3.12官方文档](https://docs.python.org/3.12/library/urllib.request.html#urllib.request.DataHandler) 与当前受管解释器的DataHandler源码核验。`b6384d1d` 的body采集实际报资源missing；现有持久错误未记录缺资源协议，因此内嵌图/隐藏背景是独立已确认的实现缺口，不能直接宣称就是该次唯一根因。

本轮选型不新增依赖。复用 Chrome getClientRects/elementFromPoint、B-U Element.evaluate/Page.mouse、原生 innerText、已有区域 receipt、MethodReadRecords 完成引用与 runtimeScopeFrom 文档身份。现有 mature API 能确定的状态全部由代码处理，不新增语义 judge、字段抓取、模型补元数据或调度器。实际旧错误、新边界和对抗审查证据见实施文档新增章节。

45de8f71 的持久化原生记录另证明输入边界缺失：所选集合叶控件与实际点击标题位于同一重复记录，却未拥有可复用记录范围。沿现有 record_projection_dom / ElementEntry 适配完整原生集合的一对一根与已观察的唯一相对控件，原生 Agent、LangGraph 与浏览器控制均保持原职责。核验 browser-use 0.13.8 官方 Actor 源码，Element没有区域查询接口；集合使用 Page 公开 CSS 查询，记录内解析直接复用 Chrome CDP 的 backend 根与 DOM.querySelectorAll，避免全页 CSS 随记录重排改变归属。Source 登记前也复用同一原生根内查询并核对实际动作 backend；冻结旧快照不足以证明当前归属，不添加第二套定位器。渲染可见性用Chrome checkVisibility，不按视口坐标丢弃离屏内容；隐藏opaque DOM标签保留在原HTML。真实两输入、同文档记录重排、多匹配拒绝，以及目标跨记录移动/同类替代控件的 Source 拒绝已通过。

## 2026-10-05 原生入口身份与命名控件唯一性

沿既有 browser-use 0.13.8/Actor 和 workflow-use 0.2.11 复用，不增删库：入口用实际 backendNodeId 与 CSS :root 文档身份，展示 text 允许空；稳定去重键不包含临时 backend/文档根。命名控件复用 DOMInteractedElement hash/XPath 和原生 parent_node，只合并单条祖先链中的同名映射；运行时仍唯一命中原点击位置，隐藏目标、独立分支、跨 frame 和输入失配拒绝。不增加 Agent、定位器、调度器或模型判断。完整 Reuse Assessment 与实际首败见 [实施记录](WORKFLOW_AND_DELIVERY_IMPLEMENTATION_20261005.md)；入口 15 项、命名目标 14 项所属验证通过，原任务完整验收仍进行中。

实际客服入口错误另证明观察信息交接不足：AgentSettings 的固定默认不包含 href，已通过 Agent.include_attributes 原生公开配置追加而不覆盖默认；同观察代表预览仅返回名字和规范链接目的源，不按站点判定业务。反斜杠等非规范 href 放弃 origin，避免标准库/浏览器解析差异泄露路径。沿原 long_term_memory、观察所有权和读取证明适配，不增浏览器查询、强制探查、判断模型或重试循环。

## 2026-10-05 同范围只读确认不等于收集循环

Reuse Assessment:
- capability: 按已观察事实区分来源读取确认与实际推进后的重复收集，避免多余模型注解阻塞。
- existing implementation in repository: `repeat_annotation`/`natural_repeat_evidence`、VerifiedNaturalRead、原生 NormalizedTrace/effect 与宿主自然读取验证器。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 原生历史/动作，workflow-use 0.2.11 受管适配；不改变依赖或选型。
- selected implementation: 沿既有 repeat 候选识别，在完备同方法/文档/区域身份/覆盖/样本及区间受限纯读取时排除确认候选；原推进注解和 validator 完整保留。
- reused public surface: 原生历史和已有宿主读取证据；不新增循环器、解析器、模型提示判定或运行状态机。
- B-A-T-owned adapter and remaining gap: 重复确认只是读取 producer 的编译准入，保留全部动作与最终输出来源；实际分页/加载循环继续原证据门。
- license/runtime/platform fit: 现有许可、Python/Windows 和受管虚拟环境不变。
- browser/runtime/state ownership conflicts: 不创建或操作浏览器，仅处理持久化来源；不改写旧运行。
- replay model calls: 0；能够从宿主证据确定的确认不再多调用注解模型。
- rejected candidates and evidence: 仅按同 outputPath 两次成功读取触发模型，在真实京东 job `9af8745b` 产生 `repeat_annotation_not_applicable` 阻塞；保存实际 rejected artifact。
- focused validation: 所属 9 项回归通过，含 scroll/文档变化/样本变化/缺身份的保守门；同份真实 canonical request 离线 6 segments/0 gaps，TS 9 节点/8 边通过，未调用模型或篡改原记录。对抗定点复审无成立问题；完整实际业务另验收。

## 2026-10-05 原生索引到入口范围的宿主适配

Reuse Assessment:
- capability: 把 B-U 已能选择的真实条目索引转换为可复跑的来源读取范围，避免模型必须猜 CSS。
- existing implementation in repository: `record_projection_dom._relative_selector/_identity/_elements`、原生 DOM 快照、ReadSpec/ReadSample 与 method_read_evidence。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 原生 DOM 索引/BrowserSession/Page/Element、workflow-use 0.2.11；版本与依赖不变。
- selected implementation: 通过这些原生公开查询与既有投影适配读取；CSS 解析/浏览器查询继续交给原生 Page。没有新增选择器解析器、Agent loop 或抓取驱动。
- reused public surface: get_dom_element_by_index/get_browser_state_summary、Page.get_elements_by_css_selector，及已有 DOM→ReadSpec 投影帮助函数。
- B-A-T-owned adapter and remaining gap: 单次 indices 选择的实际 backend 身份与完整集合前缀核验；持久化 native_entry_selection 证明，复跑只使用方法而非样本索引。
- license/runtime/platform fit: 沿现有 Python/Windows 虚拟环境、现有依赖许可；没有替换关键库。
- browser/runtime/state ownership conflicts: 使用当前同一 BrowserSession，不新建浏览器，不把 DOM 父子结构注入模型，不改变来源/资源所有者。
- replay model calls: 0；不增加语义确认、字段询问或模型重试循环。
- rejected candidates and evidence: 要求 LLM 自行声明 CSS 在真实京东任务中导致 done=false，虽然原生索引可见；固定每条样本位置不能构成复用集合方法。
- focused validation: 入口/准备/输出派生及原 method-read 合同定点检查；之后同一完整生产路径与真实任务验收，不能拿局部检查替代结果。


## 2026-10-04 既有 owner 恢复与通知交互

沿用现有 TaskConnection/RunnerProcess、AttachedWindow/ManagedWindow、AccountTransfers、CDPClient、Radix 和本地存储；没有新增驱动、调度器、状态机、依赖或模型调用。新增适配只负责原 owner 的资源证据、稳定授权传输身份、共享账号投影、通知已读与定位。复用评估、拒绝边界及实测首败见 [复跑资源闭环](REPLAY_RECOVERY_CLOSURE_20261004.md)。

## 2026-10-04 原迁移器的双向 admission 与当前Profile检查投影

用户明确允许将专属登录复用到daily，旧“个人Profile只读”的产品限制据此替代。原迁移器、原生CDP/Playwright认证操作与DPAPI已经支持两种kind，不新增Cookie vault/驱动/状态机；只改通用admission和目录维护接线，保留UID/认证范围/owner/lease/目标状态及回滚核验。启动改目标先查、同UID零源操作；展示复用SQLite的每Profile最后检查，不用TTL制造登出，也不把缓存当本次运行证据。

UI复用原Radix组件和主题Token，统一所有尺寸下的结构和80px设置行。首轮原生可见验收已结束；用户新增测试只用headless，随后真实popup/UI/正式只读加载均遵守。源码证据、Product Alignment、Reuse Assessment、14项不变量、真实双向样本、首败与未测范围见 [研究与验收](BROWSER_ACCOUNT_SHARING_UI_20261004.md)。

## 2026-10-04 单窗口连接与共享账号目录的登录维护

复用原 Microsoft 扩展 relay 的授权握手/BrowserModel、CDP owned target、Browser-Use/Playwright 与原账号 TaskChain；零目标连接不要求创建引导页。专属 Chrome 使用 Chromium 官方 `--no-startup-window`，由原 ManagedTargets 创建唯一操作页；固定已安装 Chrome 的 Windows 冷启动实证通过。账号目录维护冻结所选身份，自定义链源码及版本保持不变；源核验继续显式使用原来源。未新增驱动、调度器、网站公共类型或模型调用。

首次额外窗口及零目标 readiness 失败、修订、单页/连续运行实证、Chromium 官方源码链接和 Reuse Assessment 均见 [本轮研究和验收](BROWSER_CONNECTION_ACCOUNT_REPAIR_20261004.md)。受控 Profile 和夹具 UI 不代替全部私人的线上 SSO；个人扩展仍须重新加载一次。

## 2026-10-04 真实主链路暴露的最小兼容门

72afa27e首败busy：已完成交付的relay endpoint随重载变化，不是Profile身份。复用原宿主releasedOwners、AttachedWindow/TargetScope，只归档确定completed/cleanupconfirmed/delivery owner，新ownedTargets空；旧owner恢复/关闭仍核验旧endpoint，不回收个人标签。cd7e2c56重试lease_changed：旧JSON缺新增默认字段，复用既有Pydantic合同比较当前/已有archive，保留真实冲突拒绝和最终原字节复核。新增旧base+旧archive完整发布后unlink前崩溃样本；8/8与窄对抗复审通过。

Product Alignment：同一自然语言任务/不可变发布V1，运行输入沿原合同，输出动态保存；通用能力是确定owner归档、新目标隔离及跨版本收据兼容；两次实际modelCalls=0，公共runtime未加站点特判。Reuse Assessment：沿原browser-use0.13.8/cdp-use1.4.5、TargetScope、Pydantic、TaskChain/LangGraph/SQLite，不新增驱动/调度器/检查DSL。真实Windows日常扩展已授权连接与原JD链路9c6f6482、9dfa0c86均完成，输出各2且摘要一致，中间无end；证据actual-main-persistence.json。额外再服务重启自动审核拒绝，未绕过，不能当成修复后重载证据；首次成功已实际跨旧relay收据归档，修复由fresh Python child加载。

2026-10-04 加载补证：用户明确授权后原 dev 重载完成，PID28908；实际持久 owner 准入判据只读执行与新服务账号 availability 均通过，原租约不变，私人任务未自动执行。证据为 service-loaded-admission.json；先前自动审批拒绝保留，不伪写为首次通过。

## 2026-10-04 完成页误作控制锁：复用原 owner/TargetScope 修订

只读既有 SQLite 证实 completed/cleanup confirmed/active delivery 被 activeBrowserWindowLease 排斥；既有账号 startup 还存在独立 retained blocker。现沿 ProductStore 同判据生成服务内部 whitelist，原 AttachedWindow/ManagedWindow 原子归档 owner 并取得新 target；Managed 保存当前进程收据至原子替换，旧 owner 转 target-only，历史 end 不关闭共享进程。复用 browser-use/CDP/TargetScope/TaskChain/LangGraph，不新增驱动、调度器或检查 DSL，MC/SAU 平台判据未改。

对抗首轮 R1–R6 及 U1–U3 纠正归档崩溃切点、持久未知创建、未知请求覆盖、handoff 请求身份、历史反馈恢复、账号 startup 接线。自有 Windows 两模式各四次真实正式复跑与 49 项定点回归通过；UI 复用 Radix 和已有可调宽抽屉。源码与行为证据、首败/重试及服务加载受阻见 [开发基准](RUN_CONTROL_IMPLEMENTATION_20261004.md) / [交付](RUN_CONTROL_DELIVERY_20261004.md)。旧通过的 Windows 门沿原审计，不重复运行；私人平台正向不是此次工程证据。

## 2026-10-03 现场首败修正：删除额外首页校验，继续复用原能力

`work/account-user-regressions-20261003/live-first-failure.json` 与原源码诊断证明知乎在 MC/SAU 检查之前因 `ordinary_postcondition_failed_url_fact_mismatch` 失败；正常 signin 跳转被自写胶水误拒。删除 navigateAccount，不新增检查 DSL/驱动；直接借原 owner/lease/target 调用原 Playwright goto，保留原允许来源边界。单次8秒网络观察失败不是人工扫码总等待失败，原 TaskChain/LangGraph 继续，5分钟总等待结束/取消保留窗口。固定 MC/SAU 判据与 vendor 数据未改。

Product Alignment/Reuse Assessment 沿 [统一开发文档](BROWSER_ACCOUNT_UNIFIED_20261003.md)；窗口/任务历史分类复用原冻结 browser 转换，未知所有权不关闭。13平台78样本、旧三平台策略/MC与SAU非侵入门保留，不重复旧通过验证；新增受影响知乎35秒/正常redirect/真实公开页面、native自定义/SQLite、UI单一入口/运行错误门已通过。克隆知乎门只一行，继承文字three不代表三行重验。代码对抗两项P1已修复，真实服务/旧事实摘要一致；私人账号与真实SSO未测。来源、许可证、扩展加载、首败和索引见 [当前交付](BROWSER_ACCOUNT_MANAGEMENT_DELIVERY_20261003.md)。

## 2026-10-03 单平台账号方案：复用冻结、非侵入观察和原启动路径

完整 Product Alignment / Reuse Assessment 在 [当前统一文档](BROWSER_ACCOUNT_UNIFIED_20261003.md)。固定 MC `380b426000aac3d612837ed72c99808347dc94c9` 与 SAU `0012d2c355f88f683cc38dde2a2db209e14091bc` 原函数、ZIP、许可不变；版本化目录 `20261003.2` 新增观察入口。宿主只借用原 owned 页面、投影三态和必要身份、适配原 TaskChain/生命周期，不搬两库的爬虫/上传产品，不重造驱动、调度器或检查 DSL。

原 normal 检查与 observe 分开：observe 抑制 goto/等待导航并审计，不暴露 click/fill/focus/raw page；最终用独立 owned 检查页或原范围只读接口验证。真实 Windows MC/SAU 两条门证实 URL、输入及焦点不变。登录有界循环由 LangGraph 承担，宿主保存冻结 revision 与 UID、操作和实际独立 TaskRun；无隐式模型，点击返回或完成不盖登录章。

自动复用仍调用原增量 CDP/HMAC/DPAPI prepare/write/check/restore，守卫扩展到逻辑账号 revision、源绑定和授权 epoch。只对任务冻结 allowedOrigins 交集工作；公开只读任务按真实不可变 invoke 闭包识别，伪 effect=read 的 click 不能免检。实际 Python authoring/withCapabilities 启动前回调验证原 persisted active job/execution 和原 controller，仅排除自己的控制器；resume 直接保留现有 runner。

最小 Windows 样本揭示受管 `end` 原来直接终止进程，登录 Cookie 尚未落盘；仅给夹具 Max-Age 不能修复。已接线原 ManagedWindow.end_gracefully，等待原验证专属进程正常退出后才用原 fallback。AttachedWindow 的个人路径未进入 Browser.close。修正后三平台受控自有目标复用、同 UID 零写入及浏览器/SQLite 重开通过；首败与两次失败重试均保留。

证据：`source-compatibility.json`（13 行/78 样本固定原函数，真实 PW DOM/受控 HTTP），`observe-windows.json`，`native-login-reuse/result.json`，`native-custom/result.json`，均位于 `work/account-unified-20261003/`。三平台自动复用只是工程范围门，不冒充私人线上 SSO；其它十平台保持原源且拒绝未核验复制。扩展仍跟浏览器主题，Radix Dialog/DropdownMenu/Select/Avatar/主题 token 沿用现成组件。旧评估和旧人工共享/AI 识别节仅作历史。

## 2026-10-03 主流平台固定源码适配已验证

完整Reuse Assessment见 [重建文档](BROWSER_ACCOUNT_REBUILD_20261003.md)。固定MediaCrawler `380b426000aac3d612837ed72c99808347dc94c9`、social-auto-upload `0012d2c355f88f683cc38dde2a2db209e14091bc`：7/11项、重合5、union13；原ZIP/逐文件hash/许可保留。已完成原函数AST执行+受限已有owner页面/HTTP适配，13行分别完成正/明确负/挑战/503/超时/结构变化兼容样本，0模型。engineeringState=ready只代表工程门；未宣传13个平台私人登录正例通过。

关键源码限制：MC贴吧仅Cookie存在、抖音仅本地标记；SAU TikTok异常返回true、多个后台没有正向依据时也返回true；SAU B站check调用biliup renew有认证刷新副作用。必须保留源码并做结果适配/必要局部修正，不直接将boolean视为当前登录事实。SAU默认另开浏览器/读取storage_state文件，MC部分检查依赖现有HTTP/页面与签名实现；最小兼容样本要证明真实Profile、owner、单控制器及敏感数据范围成立。

迁移实际复用Playwright/CDP公开Network.getCookies/setCookies/deleteCookies，按批准域/认证key增量操作，不使用全storage_state覆盖、不采集全部Profile。当前只有B站/微博/知乎策略允许准备；源无稳定UID或目标未知拒绝。两方向owned Windows实测+服务器身份匹配+新进程DPAPI恢复通过，新增native写后actual/intended guard与共享父域范围门单补通过，不重跑整组旧验收。IndexedDB/localStorage能力未获特定平台范围证明时拒绝该平台迁移，不凭公开API存在承诺通用成功。

D0最终复查已放行，完整首轮/重试见document-review.md。实际Windows借用揭示原扩展桥未向新客户端重发已准入目标，Playwright公开new_cdp_session还需要browser-root借用及独立tab session别名。只适配原BrowserModel/relay，不新增驱动或Cookie权限、不暴露个人标签；原tab debugger所有权仍在扩展，借用detach不撤销它。真实最终日常门通过，专属门此前通过。

依赖固定Playwright1.61.0、xhshow0.2.0（MC原sign_with_xhshow公共API）、pycryptodome3.23.0。uv首次跨磁盘缓存失败、同盘缓存重试AccessDenied；Python官方ensurepip/pip无缓存安装成功。未替换原B-U/W-U/cdp-use版本。DPAPI采用Windows原CryptProtectData，已有ProviderCredentialStore固定包源码证实仅JSON文件锁，无加密，不能存回滚凭据。

Reuse Assessment（自定义页面方法的局部补齐）：Chrome原生DOM/Overlay inspect拥有选取；Playwright公开locator拥有唯一性/可见性/文本读取；宿主只组装原navigate/read-fields/QuickJS/terminal，TaskChainRuntime/LangGraph运行。公开接口依据：[Overlay.setInspectMode](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/#method-setInspectMode)、[Playwright CDPSession](https://playwright.dev/python/docs/api/class-cdpsession)、[locators](https://playwright.dev/python/docs/locators)。Chrome154退出inspect也必须传highlightConfig={}，真实首败已保留；不自造选择器引擎/录制器，只有唯一id/testid可建立，缺定位回到已有只读链。确认即归档版本，取消/标识消失/0模型/SQLite与原日常Overlay借用事件门通过。

来源补齐：贴吧复用原同步/签名函数而非Cookie盖章；XHS仅固定原pong selfinfo成功信号，无虚构UID/游客必填；SAU后台正向结构来自原发布流程只读控件，不上传。原异常true、网络失败、非2xx和结构变化独立投影未知。隐私清理包含TaskRun browser URL/outcome/invocation错误；恢复旧scope在当前目录加载前由原加密范围/owner校验。对抗R1–R7已修，最终approved；全部源码/门与首败见交付记录。

## 2026-10-03 账号复验：元数据收录与真实占用/导航失败

复用 AttachedWindow 的 Target.getTargets、ManagedWindow 的现有 /json/list，只返回原 owner 交付标签的 URL；不扫描私人标签或页面正文。新增 page 动作延续原 RunnerProcess/Zod/Pydantic 协议，未新增驱动。元数据先确定平台，再由原 native producer/TaskChain 读取身份；首次建链自动衔接检查，普通更新零模型。查询串/片段不进入自动来源记录。

实证发现全局 active lease 判断及 Python 恢复/离线动作两处选型把另一个种类的已交付窗口误认成当前 owner；原 daily 与 dedicated 本有独立租约文件，改为精确 owner/明确 browserMode 路由，活跃控制器仍全局互斥。公开真实 B 站进一步暴露无末尾斜杠 URL 与浏览器规范化事实不一致，修复入口规范化且保持精确来源边界；原始条目不改。失败后先沿原 owner 只读核验，不能把已释放窗口伪装待清理，也不能把 endpoint 拒绝当成关闭证明。

源码、固定版本复用、实际首败及实验边界见 [可用性修复记录](BROWSER_ACCOUNT_USABILITY_REPAIR_20261003.md)。这次真实用户记录打开经过实际 Windows 浏览器检查，不以受控样本代替。

## 2026-10-03 通用账号管理：固定源码适配与已观察验收

Reuse Assessment:
- capability: Profile 身份、双浏览器账号维护、当前会话只读检查及方法生产。
- existing implementation in repository: DailyChromeExtension 原 token/relay；BrowserProfileService/RunnerProcess handoff + managedWindow resume；B-U native Agent、W-U hybrid compiler/materializer；TaskChainRuntime/LangGraph；ProductStore/SQLite；Radix Themes。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11（受管源码 5d2d19fe8835cc86f1bf3e04302a5000d590f249）；Microsoft Playwright extension 0.4.0（8b552173e8d767db29b8baef8f4a1f08cf7f26bf）；LangGraph 1.4.14、QuickJS 0.32.0；Drizzle 0.45.2 / better-sqlite3 12.10.0；Radix Themes 3.3.0。
- selected implementation: 全部沿现有组件；没有新增/替换关键库。
- reused public surface: 原扩展 chrome.debugger/CDP 桥、withCapabilities/withAuthoring/recompile、原生 before_action/compilation checkpoint、materializeHybridChain、TaskChainRuntime.execute、executeFunctionNode、ProductStore.db、Radix Dialog/Table/Button/Select/TextField/Callout。
- B-A-T-owned adapter and remaining gap: 稳定 BrowserIdentity、账号目录和不可变检查快照；维护事实引用原 owner/lease；当前会话读取编译后接一个来源仅为函数源码的语义 Function。原数据编译器只绑定真实读取，不替模型合成 outcome/identityConfirmed；因此读取产物先是受限 evidence，宿主确定节点/边/绑定，一次生成纯分类函数，QuickJS 验证唯一真实样本，真实正反例齐备前保持候选。显式“重新建立方式”保留同 chainId 并递增版本；不后台修复、不退出用户账号取反例。
- license/runtime/platform fit: Microsoft fork Apache-2.0；workflow-use 仓库 LICENSE 为 AGPL-3.0（沿原受管分发与本地补丁清单，不误写成 MIT）。沿现有 Node24/Python3.12/Windows Chrome154。B-U/cdp-use 版本由原 setup 脚本核验，未扫描 node_modules。
- browser/runtime/state ownership conflicts: 手工完成只释放原维护 owner，不确认身份；原任务/保留窗口占用仍阻止账号操作。日常仅使用当前绑定 token 摘要，不复制 Profile/凭据；专属 visible/headless 共用原 Profile 的随机持久标识。每次操作单一控制器，handoff 后控制器退出，下一次在同 lease 恢复。窗口清理失败独立保留，不能覆盖已完成检查。
- replay model calls: 全部普通检查 0；研究/显式修订单独保存模型次数及完整性，失败不能把未知次数伪称 0。在线 prefix/final 节点生成回执在 ACK 前落原 SQLite，只有节点数量/缺口码/来源摘要，不保存私人页面全文。最终持久的是普通 TaskChain 与精确 digest。
- rejected candidates and evidence: 原 BrowserProfileService 的 startProfile→handoff 只有窗口事实，不能做身份验证；Cookie/URL/点击完成均不充分。没有选另一个驱动、调度器、检查 DSL 或 UI 控件。原 native producer 直接输出身份分类无动态 DOM 来源合同，改用既有读取编译 + Function，未绕过编译缺口。
- focused validation: 专属真实会话正/反/挑战/身份切换、日常原扩展同 Profile 登录/检查、同一检查链三环境、关自有任务页失败与独立重试、185秒空闲、服务重启/SQLite、公开 GitHub 未登录；证据和首败详见交付文档。

固定源码实测发现两个接入点：日常 resume 仍须沿原 endpoint resolver；Chrome tabs.group 未传 createProperties.windowId 会把任务标签移到当前活动窗口。后者由实际 Target.activateTarget 的所有权拒绝定位，修复为按原窗口分别建组，绝不放宽 ownedWindows/ownedTabs 校验。隔离 Windows 受控重试已证明原标签保留、任务标签仅在自建窗口。

真实方法建立首次只观察正例后，对 signed-out 返回 inconclusive，属于合理候选边界，不能以测试要求猜反例。第二次显式修订读取真实未登录页并保留上一版正向规则，v2 再经真实正反例验证可用。`work/account-method-1790973111685/result.json` 含 v1/v2 的 prefix/final 回执、各5次研究模型调用和全部检查的0模型审计。公开 GitHub：`work/account-method-1790972763987/result.json`，实际 outcome=unauthenticated/reason=login_required；未登录私人账号。



## 2026-10-03 通用账号管理的事实来源与开发边界

已定点核验 BrowserProfileService/RunnerProcess、browser-profile contracts、TaskChainBrowserAdapter、TaskChainRuntime：专属窗口交付后 runner 退出，只有窗口生命周期，没有网站身份验证；现有 browser.perform 页面/目标读取、Function/Branch 与 LangGraph 可复用。受管日常扩展固定版本/许可沿 UPSTREAM.json，公共 UI 沿 Radix Themes 3.3.0 / Lucide 0.544.0。完整 Product Alignment、Reuse Assessment、身份判据、Profile 隔离、同 Dialog 布局与验收门见 [开发文档](BROWSER_ACCOUNT_MANAGEMENT_DEVELOPMENT_20261003.md)。

文档区分当前接口与待开发适配，不把原型当事实源。首次平台方法须真实调查和正反例验证；普通复查固定链路、0 模型，未知不得降成未登录。实施 session 须补精确 B-U/W-U 版本与会话复用真实样本；未据文档冻结未测能力。

交接机制：工具目录未提供 thread/automation 管理工具，CLI help 验证支持新持久 exec session；本机 models_cache 与 [官方 GPT-6 Astra 文档](https://developers.openai.com/api/docs/models/gpt-6-astra) 均列 gpt-6-astra/xhigh。官方 [App Server 文档](https://developers.openai.com/codex/app-server) 明确线程/模型及参数能力。本机 daemon version 探测因控制 socket os error 10050 失败，保留为首败；不重启现有 Codex，改用 CLI 独立 session。后台只读当前会话/turn/goal/queue 事实，不写 Codex 数据库，不把回退进程冒充 Codex 定时任务。

## 2026-10-03 扩展公共控件与持久偏好首帧（实施前）

开关已存入 chrome.storage.local，但 usePopupState 把未知状态投影为 false，并等待工作台网络读取后才发布本地快照。status.tsx 使用 input + popup.css 的 appearance/pseudo-element 手写 Switch，选中拇指硬编码 #30260c。修正为读取中展示 Radix Skeleton；拿到本地后台快照立即呈现保存值，不等待宿主，后续异步读取不得覆盖用户刚完成的操作。

Reuse Assessment:
- capability: 原生扩展内的开关、按钮、读取占位及明暗主题。
- existing implementation in repository: Workbench 已使用 @radix-ui/themes 3.3.0，专属窗口开关为 Switch radius=full；lucide-react 0.544.0 已安装。
- mature candidates and pinned versions: 同一 @radix-ui/themes 3.3.0 / Switch primitive 1.2.6 / lucide-react 0.544.0；不引入第二套控件库。
- selected implementation: 直接使用 Themes Switch、Skeleton、Button、Theme 及 Lucide 图标，删除手工轨道/圆点/焦点样式。
- reused public surface: checked/onCheckedChange、radius、variant、appearance；matchMedia 仅驱动浏览器主题；Vite resolve.dedupe 保证上游 React 19.2.7 与应用 React 19.1.1 不重复加载。
- B-A-T-owned adapter and remaining gap: 业务状态组合、读取与操作竞争保护、340px 浮窗布局；不实现基础控件。
- license/runtime/platform fit: Radix/Lucide 的公开 npm 入口与原 Vite 构建；依赖许可证随构建归档，Windows 原生 action popup 验证。
- browser/runtime/state ownership conflicts: 同一 chrome.storage 偏好，首次未知不伪造 OFF；不新增授权或主题存储。
- replay model calls: 0。
- rejected candidates and evidence: 自绘 input 样式已造成拇指、主题、首帧交互不一致，删除；无需替换扩展框架。
- focused validation: ON/OFF 重开首个开关值、宿主慢响应/离线、真实点击持久化、键盘焦点、Radix DOM/白色拇指、明暗与原生 popup 无 tab。

官方实现依据：[Switch API](https://www.radix-ui.com/themes/docs/components/switch)、[Switch 源码](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/switch.tsx)、[Switch 样式](https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/switch.css)、[Vite dedupe](https://vite.dev/config/shared-options.html#resolve-dedupe)。静态排查也发现工作台侧栏/画布/上下文区还有原生 button/select；本次不能宣称全项目公共控件已收敛，后续需按真实使用入口替换验证，原型及第三方内部实现分别处理。

账号中心的现状：BrowserProfileState 只有 status/openedAt，Profile 服务负责同一个专属 Profile 和登录窗口所有权，没有平台清单或各站登录事实。本轮先提供复用 Radix 的独立交互原型：平台域名、账号备注、最近确认时间、待确认/最近确认/需重新登录；打开网站后由用户确认登录，明确区分历史确认与当前可用性，不通过 Cookie 存在伪造已登录，不读取密码或敏感 Profile 内容。未将演示记录当成产品已保存账号。

## 2026-10-03 浏览器偏好、全局授权和运行连接分离（实施前）

问题证据：BrowserEnvironmentService.select 进入 exclusive 时调用 assertBrowserIdle，随后 disconnectIdle 关闭上游与扩展连接，导致持有旧窗口的任务阻断“下一次准备和运行”的设置。准备活动由 preparation.ts 保存 store.executionBrowser()，正式运行在 runtime-host.ts 将执行快照的 mode 传给 runtime；当前任务不应读取之后更改的偏好。设置保存改为同步校验 revision 并持久化，不触碰运行连接。exclusive/disconnectIdle 仍供实际打开账号窗口使用，保留所有权核验。

授权页当前按 connected 显示/隐藏“连接 Chrome”，却已存在 DailyChromeExtension.endpoint 的运行时自动复用。界面改为 Chrome 授权、已授权用户与撤销入口；未授权时“授权 Chrome”沿原扩展浮窗确认协议取得持久授权。首次授权仍通过已有握手确认双方身份，内部传输连接不再作为用户需手动维护的设置。扩展的“允许连接”开关及暂停语义不变，真实任务启动与恢复继续使用原占用保护。

Product Alignment:
- natural-language task: 搜索资料、填写表单等任务可独立选择下一次浏览器，一次 Chrome 授权供全部任务复用。
- reusable chain boundary: 全局浏览器偏好与授权入口，不改变链路或单次运行快照。
- runtime inputs: 启动时冻结的 browser mode 和既有持久授权。
- dynamic task outputs: 不变。
- generic platform capability used: 现有 ProductStore revision 校验、Radix 控件、扩展原授权握手与 endpoint 自动连接。
- replay model calls: 0。
- site/task-specific code added: no。

复用既有组件与协议，无新增基础设施或依赖。最小验证覆盖：有活动任务/保留租约/账号窗口时偏好可保存且不清理连接；运行快照与 revision 保护不变；账号窗口的真实连接清理仍受原保护；授权 UI 在已连接/未连接下保持一致，未授权入口、取消及撤销可达。

## 2026-10-03 扩展主题归浏览器所有

用户明确浮窗明暗应跟随浏览器，不跟随工作台。使用 CSS 标准 prefers-color-scheme 和 color-scheme: light dark；沿用既有 Radix 色板，构建时生成浅色默认及深色 media 覆盖。移除工作台发送 theme、PopupBridge 存取 bat-theme、popup 状态中的 theme 和 React 设置 data-theme 的链路；旧工作台携带 theme 的消息由原 Zod object 忽略该字段，旧存储不再参与渲染。CSS 首帧即可选择颜色，浏览器偏好变化时即时更新，无新增监听器、主题偏好或依赖。

复用依据：[CSSWG prefers-color-scheme](https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme)读取浏览器提供的颜色偏好；浏览器选择跟随操作系统时继承系统明暗。不采集浏览器主题图片/自定义品牌颜色，不更改个人 Chrome 设置。验证范围：旧消息不能再改变浮窗主题、扩展构建、Workbench 类型检查、隔离 Windows Chrome 原生 popup 的浏览器明暗及工作台主题独立性；不复跑任务或改变授权。

## 2026-10-03 浏览器设置统一入口（实施前）

用户截图暴露了两份不同作用域的选择：BrowserEnvironmentDialog 保存全局 mode；ChainRunDialog 将其复制到本地 browserMode 后允许单次 override，不回写全局。准备任务和普通草稿试跑从 ProductStore 读取当前选择，正式运行却可传另一份选择，界面没有解释差异。本次取消运行弹框中的本地选择副本：显示已保存的浏览器摘要，通过「更改」打开同一个 BrowserEnvironmentDialog，返回后重新读取已保存值，保留输入与节奏。统一设置只展示日常 Chrome / 专属浏览器；专属的可见性用显示窗口开关表达。底层三个枚举、执行快照与历史数据保持兼容。

Product Alignment:
- natural-language task: 查询资料或填写表单时，准备、试跑和正式运行使用一致的浏览器设置。
- reusable chain boundary: 工作台浏览器配置和执行前确认；不改变链路动作。
- runtime inputs: 已保存 mode、业务输入、复跑节奏；需要交付原页面时阻止后台运行。
- dynamic task outputs: 不变。
- generic platform capability used: 已有浏览器配置 API、Radix Dialog/RadioCards/Switch 和执行命令。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 单一配置入口、两层选择表达、运行前确认。
- existing implementation in repository: BrowserEnvironmentDialog、useBrowserEnvironment、ProductStore 与 browserEnvironmentSchema。
- mature candidates and pinned versions: 现有 Radix Themes 3.3.0、React 19.1.1；Chrome action 原生 popup。
- selected implementation: 复用原 Dialog/RadioCards/Switch，只改变领域组合，不新增设置库/窗口控制器。
- reused public surface: Radix 受控 open/value/checked API、原 GET/PUT browser-environment。
- B-A-T-owned adapter and remaining gap: 单次运行不再维护另一份浏览器选择；配置返回后刷新与不兼容提示。
- license/runtime/platform fit: 现有 MIT 依赖，Windows Chrome。
- browser/runtime/state ownership conflicts: 不操作个人 Chrome、原授权和历史 lease；保留切换忙碌/版本核验以及执行快照。
- replay model calls: 0。
- rejected candidates and evidence: 不引入第二套全局状态或第三方设置面板；现有配置和成品控件已覆盖需求。
- focused validation: Workbench 类型检查，隔离 Windows Chrome 的同入口更改/输入保留/持久化/失败不替换/需要原页面时禁止后台运行；不启动真实业务或模型。

白框再次核验：Chromium ExtensionPopup 的外壳固定使用 BubbleBorder::STANDARD_SHADOW；BubbleBorder 在内容区外绘制 1px stroke，action 和 manifest 公共接口没有关闭该 stroke 的设置。保留用户要求的原生工具栏浮窗，不用标签页、独立窗口或个人 Chrome 主题变更伪装修复。网页内截图只能验证内容，不是外壳已经消失的证据；此项仍为浏览器原生边框限制。

## 2026-10-03 工作台基础控件与浏览器模式说明

用户截图的搜索框重复描边来自 styles.css 的全局 :focus-visible 与 Radix TextField 自带焦点轮廓叠加；button 的低优先级 cursor 被组件主题覆盖。沿用现有 Radix Themes，不新增控件：按[官方 cursor tokens](https://www.radix-ui.com/themes/docs/theme/cursors)集中配置 button/checkbox/radio/switch/menu-item 的 pointer；原生 disabled 保留 not-allowed；全局焦点兜底排除已有 Radix reset 控件，保留组件自身键盘焦点。不是移除可访问性焦点或对每个输入框重写样式。

当前三项对应运行契约 daily / dedicated-visible / dedicated-headless。后两项共用专属 Profile 和 BrowserProfileDialog，因此下面都是同一「管理登录账号」，无两套不同菜单；差异仅为运行是否显示窗口。日常 Chrome 才有扩展、全局授权和连接管理。现有扁平呈现把浏览器来源与窗口可见性混在一起；本轮解释实际行为并修复基础样式，未擅自替换为新的两级选择，也未改模式切换的资源所有权保护。

原生浮窗外框核验：[Chromium extension_popup.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/views/extensions/extension_popup.cc)使用 BubbleDialogDelegateView / STANDARD_SHADOW；[bubble_border.cc](https://github.com/chromium/chromium/blob/main/ui/views/bubble/bubble_border.cc)在内容边界外绘制 1px 边框并使用 Chrome ColorProvider。扩展 HTML 的背景跟随工作台，Chrome 外层边框由浏览器绘制；不能把网页内 CSS 修正宣传为移除了原生框。

## 2026-10-03 方案 A 用户验收：旧授权下开关不可点击

截图对应的实际宿主状态 paired=true、connected=false、busy=false。原 UI 把 canEnable 限制为 pending 或扩展新增 bat-authorized=true；旧版本全局凭据有效但尚无新本地标记时开关被禁用。修复沿原连接恢复路径：宿主确认有已保存授权时允许用户主动开启并请求恢复；是否真的批准仍由原私有票据 token 匹配决定，不能因公开 paired=true 就伪造本地已授权。首次无授权仍需要工作台选择 Profile 并发起原授权请求。

这是原方案 A 的升级兼容缺口，沿用上一节 Product Alignment / Reuse Assessment，不新增控制器、授权协议或同源豁免。新增最小回归覆盖「只有宿主授权、无本地新标记」的主动开启和 token 失配不能获授权；Windows 直接从工具栏打开浮窗复现，检查真实输入可点击并恢复。主题当前由工作台主题控制，扩展保存最近值，初始默认 dark。本次同时核对用户所指外框是否属于 Chrome 原生容器，不能将网页内截图当作原生外框证据。

## 2026-10-03 方案 A 连接卡片实施前决策

用户已选 A。保留原型的连接卡片、允许连接开关、浏览器名称、范围折叠及工作台入口；首次与日常使用同一布局。后台持久化 enabled，与 relay 连通事实分开。OFF 关闭原扩展连接、保留宿主授权，并拦截普通任务的自动连接；ON 对待授权票据执行明确确认，已有授权经当前同源工作台恢复连接。无 token 的新授权票据始终要求本次明确开启，不能被旧的 ON 设置静默批准。首次授权不重新关联任务/历史 lease。

Product Alignment:
- natural-language task: 查询资料或填写表单时复用用户选择的 Chrome 登录状态。
- reusable chain boundary: 全局授权和扩展连接偏好，独立于任务链路。
- runtime inputs: 原私有票据、原 token、持久开关和真实 relay 状态。
- dynamic task outputs: 不改变任务输出。
- generic platform capability used: 原微软扩展、同源授权路由、Chrome storage/action。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 原生浮窗中的连接偏好、连接事实与现有全局授权适配。
- existing implementation in repository: 原 Microsoft/playwright 8b552173 扩展/relay、PopupBridge、工作台外部消息轮询及 ProviderCredentialStore。
- mature candidates and pinned versions: 已核验 BrowserSkill 47ac947f 的 connectionEnabled 与实际连接分离；现有 React/Vite 和 Chrome 原生 checkbox/details 控件。
- selected implementation: 原控制器和原 token 保持唯一事实源；仅补偏好门禁、同源恢复请求和方案 A 视图。
- reused public surface: Chrome storage.local/action.openPopup、原 group.close、现有 POST connect；Radix colors 公开导出提供工作台相同色值。
- B-A-T-owned adapter and remaining gap: 暂停失败原因、一次性的恢复意图、工作台主题同步；没有另一套浏览器控制器或常驻重连调度器。
- license/runtime/platform fit: 原 Apache-2.0/MIT 组件；Windows Chrome 原生浮窗。
- browser/runtime/state ownership conflicts: OFF 只关闭原连接拥有的控制会话；不删除任务/lease/凭据，不操作用户已有标签页。恢复由现有同源工作台发起，保留原 Origin/Fetch Metadata 校验。
- replay model calls: 0。
- rejected candidates and evidence: 不迁移 BrowserSkill runtime；其借用页与任务调度不属于本次界面职责。
- focused validation: 开关存储和两条 token 自动连接入口门禁、暂停后新票据、明确开启、恢复不重复授权、Windows 原生 popup 和零授权 tab；API/Workbench 类型检查及扩展构建。

## 2026-10-03 三版扩展浮窗原型评审（未选型）

用户要求先提供三版原型自行选择。本轮只制作独立 HTML/CSS/JS 演示：A 连接卡片、B 紧凑面板、C 浏览器名片。参考已调研的 BrowserSkill，将持久连接偏好与实际连通状态分开；首次手动开启、所有任务共用授权、关闭暂停但保留授权。原型使用原生 checkbox/switch 与 details，沿用工作台 Sand/Amber 色值和 Aptos/Microsoft YaHei UI 字体，不新增依赖、不接产品 API。真实持久开关仍未实现，设计仍待用户选择。

产物 work/chrome-popup-prototypes-20261003/index.html；含首次、已连接、暂停、工作台离线、深浅色及单版查看。Windows Chrome 154 独立临时 Profile 核对交互和实际截图；不触发个人 Chrome、真实授权或任务。原型截图不能作为真实授权协议或任务执行验收证据。

## 2026-10-02 首次确认文案与操作层级收敛

用户实际截图仍包含重复标题/引导语、表格式对象信息、无语义箭头、批准前对勾，以及首次请求时多余的工作台出口。首次面板收敛为：浏览器名称、一个范围说明、全局授权有效性、暂不连接/授权并连接。删除装饰图标与常驻页脚，两按钮等宽，由颜色区分主次；已授权详情继续折叠。沿用原协议，用户主动拒绝在工作台显示普通取消反馈，真实技术失败仍保留错误态。验证仅扩展构建、Workbench 类型检查、隔离 Chrome 首次确认/取消反馈/已连接视觉；不重复无变更的持久化与协议测试。

## 2026-10-02 扩展面板交互修正与实际运行入口（实施前）

实际服务核验：4175 的 PID 2584 仍运行旧授权 tab 入口，GET 状态不含 popupRequest；这是用户仍看到新 tab 的确定原因。沿本项目 dev/shutdown 身份核验接口重启后，新服务含 popupRequest；7 条 execution 记录及浏览器 lease 摘要完全一致。隔离 Chrome 测试不能替代这项实际服务交付核验。

已直接读取 BrowserSkill 47ac947f 的 popup/App.tsx、use-connection-state.ts、switch.tsx、style.css：主状态与 connectionEnabled 分离，开关修改后台持久偏好，瞬时 connecting 不让文字来回跳，未接通的设置不展示控件；popup 高度随内容变化。对照 uBlock Origin 的 popup-fenix.html/js（官方 master，2026-10-02 读取），主要操作靠近状态，次要工具和详细信息渐进展开；只参考交互，不引入其 GPL 源码。Chrome 官方 Add a popup 明确 action.default_popup 是工具栏浮层，失焦会关闭；再次打开应恢复后台事实。

本次设计：首次请求呈现所选 Chrome、实际操作范围和“拒绝／允许连接”；连接后改为紧凑连接面板，权限说明收起，仅保留一个工作台入口。断开是单次连接操作，授权保留，不用持久启用开关伪装 socket 状态。使用可读字号、明确焦点和进行中反馈；首次状态未读完不误报未授权。工作台取消后清除过期请求，重试可以再次打开浮窗。

Product Alignment:
- natural-language task: 在使用登录账号进行查询或填写表单前，用户确认浏览器权限；后续任务复用。
- reusable chain boundary: 原全局 Chrome 授权与单次控制会话，独立于任务链路。
- runtime inputs: 原待授权请求、后台连接事实、服务端保存的授权。
- dynamic task outputs: 无新增业务输出。
- generic platform capability used: Chrome action popup、原连接消息、React 状态与原 Button。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 扩展连接面板与待授权请求生命周期。
- existing implementation in repository: 固定 Playwright 0.4.0 的 status.html、React、Button、原 token 和 relay；已增加的 popupBridge。
- mature candidates and pinned versions: 上述固定源码；BrowserSkill 47ac947f 的真实组件和连接控制器；uBlock 官方面板结构作为交互参考。
- selected implementation: 继续复用原组件和 Chrome 原生 popup，只重组 B-A-T 状态、文案和样式。
- reused public surface: chrome.action.openPopup、runtime 消息、storage；原 Button、token、disconnect。
- B-A-T-owned adapter and remaining gap: 过期授权请求与全局服务事实同步；不新增浏览器调度、开关偏好或权限协议。
- license/runtime/platform fit: 无新依赖；原 Apache-2.0/MIT 依赖；Windows Chrome 154 定点验证。
- browser/runtime/state ownership conflicts: 不操作用户 Chrome，不改任务租约；测试使用专属隔离 Profile。
- replay model calls: 0。
- rejected candidates and evidence: 把断线画成持久关闭开关会与自动复用冲突；始终展示授权介绍混淆首次确认和已连接状态；两个工作台按钮没有两个真实目的地。
- focused validation: 原生 POPUP 上下文、零授权 tab、首次拒绝/重试/批准、取消后的新请求、已保存授权复用、连接后简洁面板与实际服务入口。

参考：https://github.com/gorhill/uBlock/blob/master/src/popup-fenix.html；https://github.com/gorhill/uBlock/blob/master/src/js/popup-fenix.js；https://developer.chrome.com/docs/extensions/develop/ui/add-popup。

## 2026-10-02 日常 Chrome 工具栏浮窗（实施前）

Product Alignment:
- natural-language task: 用户点击工作台“授权并连接”，在 Chrome 工具栏浮窗查看范围并确认一次，后续任务复用。
- reusable chain boundary: 全局连接设置，不改变链路、运行、历史任务或窗口租约。
- runtime inputs: 当前工作台、所选 Chrome 用户、原扩展 token 与 relay。
- dynamic task outputs: 不变；授权拒绝不产生任务或修改旧任务。
- generic platform capability used: Chrome action popup、扩展消息、原 Playwright relay 握手。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: Chrome 原生工具栏 popup 与本机工作台的连接引导。
- existing implementation in repository: 固定 Microsoft/playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf，React/Vite、status.html、PendingConnections、ConnectedTabGroup 与原 token 握手。
- mature candidates and pinned versions: Chrome action API（openPopup 自 127 普遍可用）；上述固定微软扩展 0.4.0；BrowserSkill 官方 popup 仅作交互参考。
- selected implementation: manifest.default_popup 复用原 status.html/Vite 入口，Chrome runtime.sendMessage/onMessageExternal 传递随机本机请求地址，chrome.action.openPopup 打开原生面板。
- reused public surface: https://developer.chrome.com/docs/extensions/reference/api/action；https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable；https://developer.chrome.com/docs/extensions/develop/concepts/messaging。
- B-A-T-owned adapter and remaining gap: 把工作台连接请求交给浮窗、显示全局授权与连接状态；扩展专属随机 HTTP 地址保留原 token 私密交接，拒绝结束待授权请求。不创建授权 tab，不重写 CDP、浏览器控制或调度。
- license/runtime/platform fit: 保留 Apache-2.0、原 React/Vite 固定依赖与扩展 key；Chrome 154 Windows 覆盖 API 最低版本，无新增库。
- browser/runtime/state ownership conflicts: 面板只通过明确的用户授权创建原 owned bootstrap；不 attach 个人页、不改旧 owner。工作台应在加载扩展的 Chrome 中；其它浏览器不能调用该 Chrome 的原生 action API，显示手动点击扩展图标的指引，不退回授权 tab。
- replay model calls: 0。
- rejected candidates and evidence: BrowserSkill 自动连接/借用页授权不是本项目持久 token 配对政策；新授权 tab 或独立 Chrome window 都不符合用户截图中的工具栏浮窗。
- focused validation: 私有交接拒绝/同源边界、保存 token 复用和原所有权回归；原 Vite 构建、所属类型检查、浮窗状态与视觉验证。实际用户 Chrome 的点击由用户操作。

视觉方向：与工作台一致的深色/琥珀色，紧凑 360px 面板。连接卡显示工作台/Chrome 用户和状态；首次申请显示范围与“拒绝 / 授权并连接”；已授权显示“所有任务可复用”、连接管理和工作台入口。禁止把原始 token、个人页面内容或技术配置铺在主界面。

## 2026-10-02 Browser-Skill 本地连接交互与当前授权页对照（只读调查）

用户要求先查 Browser-Skill 如何连接和授权，确认当前跳转页面是否由 B-A-T 修改。本机 bsk --version 为 0.3.1；现有只读诊断源码为 Tencent/BrowserSkill 的 47ac947f188bc554b66c09f5873b8045d6be57b2（2026-09-04）。另核验官方当前 main=3f10983c09fcd443c7420830ab984c9d409954bf 的 README、popup/App.tsx、connection-controller.ts、instance-id.ts 和 background.ts；未把历史源码当作当前发行版本，也未操作用户 Browser-Skill 扩展或启动会话。

Browser-Skill 本地连接：工具栏扩展 popup 显示连接开关和状态；getConnectionEnabled 未设置时为 true，设置写入 chrome.storage.local；后台根据该设置建立本机 WebSocket 并自动做 system.handshake，控制器/keepalive/heartbeat 负责连接恢复。首次本地连接没有 Playwright 的 connect.html 导航和每客户端 Allow 令牌交接。扩展启用设置属于浏览器实例，任务创建不重做这一设置。借用用户已有标签页的独立确认通过原页面 overlay 发起；缺少可用 content script 时，chrome.notifications 的 Allow/Deny 是兜底。不能把借用页确认解释为所有任务都要重做全局连接授权，也不能据本地流程推断远程设备配对的交互。

当前 B-A-T 授权页来源：vendor/daily-chrome-extension/UPSTREAM.json 固定 Microsoft/playwright 的 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / 扩展 0.4.0；上游已有 packages/extension/src/ui/connect.tsx 与连接页 Allow 流程。B-A-T 在该页面上修改了中文内容、任务窗口范围和 persistAuthorization 首次令牌交接，宿主只在握手就绪后保存凭据。它是改造后的扩展页面，不能称为 Chrome/Windows 原生权限弹窗，也不能把跳转网页宣称为浏览器必需步骤。当前本地 connect.tsx 只有“允许并保存授权”按钮，尚无直接的“拒绝”按钮；接口夹具中的拒绝分支不能代替真实 Chrome 页的拒绝交互验证。

官方依据：https://github.com/Tencent/BrowserSkill；https://github.com/Tencent/BrowserSkill/blob/3f10983c09fcd443c7420830ab984c9d409954bf/apps/extension/src/lib/instance-id.ts；同 commit 的 entrypoints/popup/App.tsx、lib/connection-controller.ts、entrypoints/background.ts；https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/extension/src/ui/connect.tsx。此轮只记录交互差异，不冻结替代方案。


## 2026-10-02 Windows 授权入口与历史任务占用解耦（本轮最小修复）

用户明确要求：选定 Chrome 用户只授权一次，所有任务和服务重启默认复用；授权弹窗由用户点击工作台按钮触发，用户自行选择拒绝或允许。Windows 当前首次授权在进入扩展握手前，被历史 execution 的保留窗口记录拦截。授权凭据本来就是全局保存；缺口在入口错误复用了任务资源占用检查。

Product Alignment:
- natural-language task: 用户从工作台授权日常 Chrome 一次，后续任意浏览器任务复用该授权。
- reusable chain boundary: 不改变任务链路、任务窗口所有权或运行互斥；授权是浏览器全局配置。
- runtime inputs: 选定的 Chrome 用户、固定扩展握手及已保存授权。
- dynamic task outputs: 原任务结果、错误、清理和保留窗口记录保持原样。
- generic platform capability used: 既有 DailyChromeExtension、同源 HTTP 入口和凭据持久化。
- replay model calls: 0 added。
- site/task-specific code added: no。

继续复用固定 Microsoft 扩展 0.4.0 的 CDPRelayServer，以及已安装 ProviderCredentialStore；不新增依赖或授权协议。首次授权、已保存授权复用不检查历史任务租约；只有替换仍连接的 relay 时才核验原连接占用。浏览器环境切换与授权处理继续互斥，任务启动继续保护正在进行的授权。拒绝不得保存凭据，保存授权应跨任务和服务实例复用。最小验证限定在所属授权/环境 HTTP 与 relay 错误路径，不替用户操作实际 Chrome 的允许/拒绝。


## 2026-10-02 执行失败、再次运行与原因入口（本轮授权，macOS 原任务通过）

用户本轮明确收窄为：失败后再次运行、查看同一次历史失败原因，并核实日常 Chrome 已保存授权。沿用已有侧栏和历史，不删除失败详情，不扩展采集/成果格式。

Product Alignment:
- natural-language task: 从已发布工作台再次运行失败的任务，并查看之前失败原因。
- reusable chain boundary: 同一不可变发布版本，每次再跑创建独立 execution；不自动继续旧运行。
- runtime inputs: 既有输入、运行预设、浏览器环境及持久授权。
- dynamic task outputs: 原运行输出/错误/清理审计分别保留；不补造旧错误。
- generic platform capability used: 原 cleanup_execution/verify_closed、run_task、execution detail/history，以及原扩展连接。
- replay model calls: 0 added；只允许显式 LLM 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 失败原因展示、失败资源自动核验及再次运行。
- existing implementation in repository: TaskChainService.cleanupExecution、TaskPlanExecutor 的 finally/cleanupResume、AttachedWindow.verify_closed、SourceLifecycleDiagnostics、原 Radix 侧栏/按钮。
- mature candidates and pinned versions: 继续 Microsoft 扩展0.4.0/8b552173e8d767db29b8baef8f4a1f08cf7f26bf（Apache-2.0），原 BrowserModel/createTarget 与 chrome.tabs.remove；B-U0.13.8、cdp-use1.4.5、原 W-U/LangGraph；Radix Themes3.3.0（MIT）。固定入口/许可见此前记录与 vendor/UPSTREAM.json。
- selected implementation: 沿用现有生命周期与公开 Chrome/CDP 能力；不建立授权或恢复状态机。
- reused public surface: 原 run_task、cleanup_execution、verify_closed、Target.createTarget/closeTarget、chrome.tabs.remove；现有执行侧栏与历史。
- B-A-T-owned adapter and remaining gap: 从同一 owner 的既有脱敏启动诊断展示原失败阶段/错误类别；原 worker 退出后及用户再次运行时分别做一次既有释放核验。已确认旧 createTarget 未发给扩展；真正已发送而回执丢失的场景仍不得确认释放。
- license/runtime/platform fit: 不换库、不增加依赖；macOS 现场验证；Windows 缺实机阻塞。
- browser/runtime/state ownership conflicts: 一次运行只占一个控制会话，恢复只检查已证明归属的资源；个人 Chrome 与页面保留。
- replay model calls: 0 added。
- rejected candidates and evidence: 不引入第二浏览器驱动/通用状态机。固定原扩展未持久保存无回执窗口所有权；旧断线后不能据新连接空列表证明旧未知窗口消失。
- focused validation: 原 HTTP 红：cleanup_required 阻断再次运行，原因只有 RuntimeError。原 API 进程只读诊断进一步证实 ExtensionConnection._lastId=0、无 attached session、WebSocket 已以1001结束，唯一引导 tab 已不存在。因此旧任务没有发出窗口创建命令，区别于已发送但无回执的反例。原 verify_closed 同 owner 核验现已通过；旧失败及 digest 未改变。最终所属 TS47项、Python10项、API/UI/Contracts 类型检查通过；真实工作台原V5成功、0模型、清理确认，旧失败历史仍可查看。详见 PROGRESS 最新节。

原 endpoint 的只读释放证明仍走 B-U/cdp-use/AttachedWindow：CDP 初始化先读取 Browser.getVersion，再 Target.getTargets；只允许未派发任务窗口创建的原断线 relay 回答本地版本元数据和空的任务目标集合，所有浏览器动作仍拒绝。已派发而无 ACK 的断线反例继续拒绝，不更换 endpoint，不发现/接管个人页。开发现场仅临时把这几个原 relay 方法更新到持有原连接事实的 API 进程；随后通过现有 cleanup_execution 取得真实释放确认，未直接修改数据库或删除租约，最终已关闭 inspector 并加载正常源码服务。

**已保存授权的空闲连接反例及修补**：服务刷新后原授权直接连接，但125.4秒后的真实 GET 为 paired=true/connected=false。固定扩展的批准页面原来提供定时 keepalive，B-A-T 关闭该页面后，原 relay 在尚未附着 owned 引导页 debugger 时即报告就绪。Chrome 官方 [MV3 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) 说明 active chrome.debugger session 可维持 worker。复用原 BrowserModel Target.setAutoAttach 与 Target.getTargets，先对唯一 owned 引导页完成接入再报告连接，不增加心跳、恢复或授权协议。修补后实际日常 Chrome154 空闲131.5秒仍连接，随后原V5完整运行通过；不要求用户满足开发固定版本，也没有再次改扩展 worker 或要求重载。

旧03:33失败的确定事实是创建任务窗口阶段 CDP 通信异常、原连接断开且没有向扩展发送命令。原诊断只保存 os_error 而未区分 ConnectionError，断开的具体触发原因未记录，不能把后续空闲反例写成旧失败的唯一根因。新增错误类别仅保存固定 connection_error，无原始异常消息、URL、凭据或页面内容。

## 2026-10-02 浏览器环境弹窗整理（用户明确授权）

用户现场指出环境选择、持久授权/连接状态和按钮层级混乱，授权修改实际弹窗。当前真实状态为已保存授权、绑定用户1、未连接；不得把未连接写成未授权，也不得把连接状态写成原 V5 已恢复。

Reuse Assessment:
- capability: 三环境选择、授权状态和管理动作的可读组合。
- existing implementation in repository: `BrowserEnvironmentSelect`、`useBrowserEnvironment` 的原 CAS 保存；`DailyChromeAuthorization` 的状态轮询、操作序号与原 authorize/connect/revoke；已有 Radix Themes3.3.0。
- mature candidates and pinned versions: Radix Themes3.3.0 / `7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43`，原 [RadioCards](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/packages/radix-ui-themes/src/components/radio-cards.tsx) 直接包装 RadioGroup primitive；原 [DropdownMenu](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/packages/radix-ui-themes/src/components/dropdown-menu.tsx)；[LICENSE](https://github.com/radix-ui/themes/blob/7300f2a9be4309e04b2c1b4e43b5d7cf4a58eb43/LICENSE) MIT。tag 已核对实际 peeled commit；不读取 node_modules。
- selected implementation: 沿用已安装 Radix 原组件，增加原环境选择器的说明式显示；运行设置仍用原紧凑 Select。
- reused public surface: RadioCards.Root/Item 的受控 value/onValueChange/disabled 和原键盘选择、DropdownMenu.Trigger/Item、Dialog/Button/Badge；不自写选项键盘逻辑或菜单。
- B-A-T-owned adapter and remaining gap: 中文用途、已有授权/连接事实的展示和原 API 动作组合。已授权管理动作收进菜单；首次安装说明渐进展开。
- license/runtime/platform fit: MIT、现有 React19/TypeScript/浏览器入口，不新增依赖。macOS 现场验证后结算；Windows 实机仍阻塞。
- browser/runtime/state ownership conflicts: 不改浏览器驱动、Profile、凭据、租约或恢复合同；只读状态失败禁止按旧状态继续授权操作；初始化读取不显示撤销动作。
- replay model calls: 不增加模型调用，三环境选择仍不新增链路复验。
- rejected candidates and evidence: 无需替换现有可用成品组件，不新增框架。
- focused validation: 所属 workbench 类型检查通过；实际工作台三选项、绑定用户1、已授权/未连接、单一连接主按钮、管理菜单、关闭和刷新重开通过。真实页面 viewport1840×979，弹窗560×638，scrollHeight/clientHeight同为638，无内容裁切。首读过程实见“读取中”，未出现撤销按钮。当前服务器状态 paired=true/connected=false/busy=false，与 UI 一致。没有为验证 UI 撤销现有授权或切换真实环境；原 V5 清理阻塞独立保留。用户本轮已确认重新加载扩展。

Product Alignment:
- natural-language task: 用户选择执行任务的浏览器，理解当前授权与连接，并完成最少必要的授权操作。
- reusable chain boundary: 不修改已发布任务链路。
- runtime inputs: 原 BrowserMode 和指定 Chrome Profile。
- dynamic task outputs: 不修改成果内容或展示合同。
- generic platform capability used: 既有环境保存和扩展授权管理。
- replay model calls: 0 added。
- site/task-specific code added: no。

## 2026-10-02 采集内容与成果展示调研（未冻结产品或选型）

用户要求先看成熟产品和开源实现，再决定采集/展示；本节只提交调研证据，不修改采集合同、旧任务或成果 UI。官方文档于本日读取；商业产品的登录后控制台、付费 API、导出下载没有实测，不把文档或截图当作 B-A-T 验收。公开 GitHub 样本只用于离线比较，不采集登录态、Cookie 或私人页面。

### 成熟产品怎样组织成果

| 参考对象 | 已核对的实际产品入口与做法 | 可借鉴之处与边界 |
| --- | --- | --- |
| [Apify Dataset schema / Output tab](https://docs.apify.com/storage/dataset-schema) | `fields` 描述记录，`views.transformation` 控制字段/嵌套展开，`views.display` 描述表格和 URL/图片等格式；同一数据可有不同视图。文档明确视图不决定 JSON/CSV/Excel 的导出格式。 | 值、界面投影、下载格式分别有事实源。适用于结构化记录，不据此把所有浏览器任务强制变成表格。 |
| [Browse AI 数据结构](https://help.browse.ai/en/articles/13171414-understanding-your-data-structure)、[管理/导出](https://help.browse.ai/en/articles/10477537-how-to-view-manage-and-export-your-scraped-data)、[JSON 导出](https://help.browse.ai/en/articles/13187052-how-to-export-your-data-as-a-json) | 文本字段进入列，列表有各自列表页；记录包含采集时间、来源及运行输入等上下文。JSON 保留嵌套列表，CSV 需要扁平化；截图有独立展示。 | 单条长正文和多条记录不是同一种浏览体验；导出需明示嵌套与扁平化的差别。文档称抓取值默认按网站呈现为字符串，不能据此替 B-A-T 决定数值类型。 |
| [Firecrawl Scrape](https://docs.firecrawl.dev/features/scrape) | 明确选择 Markdown、HTML、rawHtml、JSON、截图等输出，并返回 metadata；正文筛选、包含/排除区域与输出格式各有入口。 | HTML、可读正文和结构化 JSON 是不同采集结果。`onlyMainContent` 或自动清洗会改变内容范围，不能直接继承为 B-A-T 通用默认。 |
| [Crawl4AI Fit Markdown](https://docs.crawl4ai.com/core/fit-markdown/) | `raw_markdown`、含引用版本、references、`fit_markdown`/`fit_html` 分别保存；Fit 输出先经过 Pruning/BM25 等过滤。 | “保留正文结构”和“挑选重要内容”应能区分；过滤后的版本不能伪装成完整原文。它是采集框架/工具，未提供已验收的 B-A-T 成果界面。 |

上述产品做法没有收敛为唯一显示方式。Apify 的视图和导出相互独立；Browse AI 的导出也可能受当前过滤/列选择影响；Firecrawl/Crawl4AI 明确区分格式和过滤结果。不能把这些差异统一写成未经确认的 B-A-T 规则。

### 固定开源源码与实际复用入口

每项均核对固定源码与许可证，下载文件的 SHA-256 保存在 ignored `work/collection-research-20261002/sources.json`。本轮没有安装产品依赖、接入云服务或更换 B-U/W-U。

| 实现 / 固定版本与 commit | 实际源码入口 | 许可证、运行时与维护观察 | 本轮证据与职责限制 |
| --- | --- | --- | --- |
| Crawlee v3.18.2 / `78da0622762e1b569b5cb0b56e8eb06a0a010d93` | [Dataset](https://github.com/apify/crawlee/blob/78da0622762e1b569b5cb0b56e8eb06a0a010d93/packages/core/src/storages/dataset.ts)：`pushData/getData/exportToJSON/exportToCSV` | Apache-2.0；TypeScript/Node，core manifest 为 Node >=16；release 2026-09-29。 | 核验了源码和模型；未启动存储/抓取框架或验证 Windows。整体引入会增加已有存储、调度和浏览器所有权，不能替换 B-A-T 链路主线。 |
| Firecrawl v2.11.0 / `ef12eb36b2f3382838dfe0a0c1a5add3d5df7fe5` | [parseMarkdown](https://github.com/firecrawl/firecrawl/blob/ef12eb36b2f3382838dfe0a0c1a5add3d5df7fe5/apps/api/src/lib/html-to-markdown.ts)、Go `ConvertHTMLToMarkdown`：GitHubFlavored/RobustCodeBlock 插件 | 根 LICENSE 为 AGPL-3.0；API manifest 另写 ISC，不能仅按该字段认定服务源码为 ISC。TypeScript + Go/CGO + Rust 原生组件；release 2026-06-19。 | 核验了实际转换与原生/HTTP 调用入口；服务/模型提取与 Windows 原生部署未测。不能为了格式转换整体接入另一套抓取服务。 |
| Crawl4AI v0.9.4 / `133e1d92e37885dfccc03ea2e3687d06c98b7ceb` | [DefaultMarkdownGenerator.generate_markdown](https://github.com/unclecode/crawl4ai/blob/133e1d92e37885dfccc03ea2e3687d06c98b7ceb/crawl4ai/markdown_generation_strategy.py)、`MarkdownGenerationResult` / `CrawlResult` | LICENSE 含 Apache-2.0 正文及额外 Attribution Requirement，要求显著署名；Python >=3.10、Playwright >=1.49.0；release 2026-09-23。 | 源码将 raw、citations、fit、extracted_content、metadata 分开。未运行其浏览器/过滤器或验证 Windows；整套 crawler 会与既有 driver/执行器重叠。 |
| Mozilla Readability 0.6.0 / `04fd32f72b448c12b02ba6c40928b67e510bac49` | [Readability.parse](https://github.com/mozilla/readability/blob/04fd32f72b448c12b02ba6c40928b67e510bac49/Readability.js)，返回 `content` HTML、`textContent`、title/byline/excerpt/lang/publishedTime 等 | Apache-2.0；JavaScript + DOM，Node >=14；固定 tag，非浏览器驱动。 | 用同一固定 JSDOMParser 在公开正文片段执行通过，结构保留见下表。文章选择启发式尚未做真实整页/列表任务准入；一份合成表格样本也保留全部9行，不能捏造“列表必败”的反例。 |
| Turndown v7.2.4 / `fb7a865ef5eba4081dfd4e20a894a61ef7a2edca` | [commonmark-rules](https://github.com/mixmark-io/turndown/blob/fb7a865ef5eba4081dfd4e20a894a61ef7a2edca/src/commonmark-rules.js)：heading/list/code/link 的确定性转换 | MIT；JavaScript/DOM，Node >=18、npm >=9；Node 依赖 Domino；release 2026-04-03。 | 源码已核验，未跑该库或 GFM 插件。基本规则不提供 Markdown 表格转换入口；若后续选用须核验所需插件，不自行重写转换器。 |
| 现有 B-U0.13.8 / `eb4126921bea3373f91afc49fb4b59d6eda7fed6` + markdownify1.2.2 / `241ed02bc1a5d567ecf486de7d84bb74db0068d2` | [convert_html_to_markdown / _preprocess_markdown_content](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/dom/markdown_extractor.py)；已安装 markdownify 公共函数 | 两者固定 LICENSE 均为 MIT；当前 Python 环境实读版本；不新增依赖或浏览器。 | 两个实际入口都已执行。原 wrapper 针对模型上下文删除 JSON 片段，不等价于保真成果；`tools.extract` 自带模型调用，不可进入普通复跑。若后续决定 Markdown，应优先验证既有确定性转换入口而非引入第二驱动。 |

### 阅读视图、表格与文件的现成组件

已核对当前 workbench manifest：已有 React19.1.1、Radix Themes3.3.0，没有 Markdown 阅读器、数据网格或 Excel 写入库。实际 `SavedResultDialog` → `ExecutionPresentation.TaskOutputView` 按绑定合同显示值；长字符串成为普通段落，数组成为分页折叠记录；`ArtifactList` 只显示 mediaType、artifactId、digest，尚不是可下载/可预览的文件交付入口。这些是当前实现事实，不能把 artifact 元数据展示说成 Excel 已交付。

| 固定候选 / commit | 实际入口与许可 | 已有证据 / 尚缺证据 |
| --- | --- | --- |
| react-markdown10.1.0 / `44d2e4a44b37461ab7778d6870c1a9eb36393ad2` | [lib/index.js](https://github.com/remarkjs/react-markdown/blob/44d2e4a44b37461ab7778d6870c1a9eb36393ad2/lib/index.js) 的 `Markdown`、components、`defaultUrlTransform`；MIT，React peer >=18。原实现默认将 raw HTML 转为文字，默认转换 URL。 | 与现有 React 版本的声明匹配；未安装、未做真实工作台阅读/链接/代码块视觉验收。若选择 Markdown 阅读，可复用其 parser/rendering；不能把旧纯文本按字段名猜成 Markdown。GFM 表格需另核验原插件。 |
| AG Grid36.2.0 / `release-36.2.0` / `0fee5b7b1e839ae23fe860e404042448f3c1375d` | [Community CsvExportModule](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/csvExport/csvExportModule.ts)：`getDataAsCsv/exportDataAsCsv`；Community/React 包 MIT。`ExcelExportModule` 位于 Enterprise，并依赖 EnterpriseCoreModule，商业许可。release 2026-09-16。 | 固定源码和许可证已核验；未运行网格。官方 [CSV](https://www.ag-grid.com/react-data-grid/csv-export/) 文档说明取值/格式化和实际 cell renderer 的区别；[Excel](https://www.ag-grid.com/react-data-grid/excel-export/) 是另一入口。不能声称 Community 同时免费提供原生 XLSX，也不为少量单条正文默认引入整套网格。 |
| ExcelJS4.4.0 / `ac96f9a61e9799c7776bd940f05c4a51d7200209` | [Workbook](https://github.com/exceljs/exceljs/blob/ac96f9a61e9799c7776bd940f05c4a51d7200209/lib/doc/workbook.js) 与 [XLSX.writeBuffer/load](https://github.com/exceljs/exceljs/blob/ac96f9a61e9799c7776bd940f05c4a51d7200209/lib/xlsx/xlsx.js)；MIT；固定 manifest Node >=8.3.0，提供浏览器 bundle；固定 tag commit 日期2023-10-19，不冒称新版本。 | 下载固定 npm 4.4.0 bundle（SHA-256 `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9`），在 ignored 调研目录执行真实写入/回读。未安装为产品依赖；没有浏览器、Agent 或模型调用。实际 Excel/Numbers、Windows 与工作台下载/文件预览未测。 |

ExcelJS 最小文件样本：将同一公开 issue 原 Markdown 保存为 string 单元格，保留1740字符/47个换行，中文/引号/换行合成字段回读一致。另用 Python 标准库 zipfile/ElementTree 独立读取 OOXML，正文内容与 string 类型一致，合成字段没有 formula 节点。样本 `work/collection-research-20261002/exceljs-sample.xlsx`；`exceljs-sample-proof.json` 与 `exceljs-ooxml-proof.json` 通过。它只证明这个编码样本，不能证明完整 Excel 产品交付或未知大文件/富文本的兼容性。

可供取舍的组合是：少量记录沿用现有 Radix/合同组合，正文格式明确时复用 Markdown 阅读器；大量同构记录才评估现成网格；XLSX 复用确定性写入库。抓取格式、默认视图和文件交付仍待用户决定，本轮不接入这些库、不添加采集字段、不创建第二份输出事实源。下载候选源码时错误 tag/path 的404仍保留在调研日志；AG Grid 最终锁定其实际 `release-36.2.0` tag，没有把官网版本文字直接当作可用源码。

### 实际样本：结构在哪一层丢失

样本为公开 [LangGraph issue #9075](https://github.com/langchain-ai/langgraph/issues/9075)，GitHub API 提供原 Markdown 与渲染 HTML，updated_at=`2026-09-25T12:59:22Z`。这是离线字段片段测试，不是通过 API 替代 B-A-T 原浏览器任务，不改变旧发布数据。

| 同一片段的处理方式 | 长度 / 换行 | 标题 / 列表 / fenced code | 事实结论 |
| --- | --- | --- | --- |
| GitHub 原 Markdown | 1740 / 47 | 5 / 2 / 1块 | 有真实可读结构。标题计数包括代码行中的 Markdown 标记，不作为 HTML 语义标题数。 |
| 渲染 HTML | 6900字符 | HTML h 标签4、li2、pre1、链接3 | 保留语义结构，也有渲染附加标记。不能把全部 HTML 都展示或永久采集。 |
| HTML 文本再压平空白 | 1723 / 0 | 行结构0 / 0 / 0 | 已丢段落、代码围栏和列表标记，UI 无法事后还原可靠层级。此文本转换与浏览器 innerText 不是同一 API，不混用数值。 |
| 现有 markdownify1.2.2 直接转换 | 1903 / 47 | 5 / 2 / 1块、链接3 | 此公开样本保留可读格式；非逐字复原原 Markdown，仍需确认字段范围/清洗策略。 |
| B-U0.13.8 wrapper | 1887 / 31 | 5 / 2 / 1块、链接3 | 本样本被过滤16字符/空行；另一个技术配置反例中，原转换保留的长 JSON 示例被 wrapper 删除231字符。不能把它默认用于成果保真。 |
| Readability0.6.0 / 同源 JSDOMParser | HTML5178、text1657 | HTML标题4、pre1、链接3 | 指定正文片段执行通过；未证明从整页挑选正文的正确性，也未冻结选择该库。 |

实际旧 V5 的 `ReadField` 正文是 rendered text 且 `normalizeWhitespace=true`；2026-10-02 已成功运行的存量正文1630字符、换行0。旧值只有普通文本，不补造 HTML、标题层级或未保存的来源事实。新采集若需要 Markdown/HTML 层次，必须在读取/编译/字段合同处保留相应信息，再用成熟转换或渲染组件展示；仅换成果弹窗无法实现。

证据：`format-comparison.json`、`readability-comparison.json`、`readability-table-counterexample.json`；公开样本/转换文件在同一 ignored 研究目录。JSON 配置反例为明确标记的合成技术片段，不冒充真实网页现场或生产验收。

### 交用户选择的范围与建议（尚未实施）

建议参考 Apify 的“记录 / 视图 / 导出”区分和 Firecrawl/Crawl4AI 的“格式 / 过滤”区分：单条正文考虑文档阅读，多条字段考虑表格和详情，文件成果考虑预览及下载。采集的确切字段、是否保留链接/代码/图片，以及最终 Markdown/Excel 等目标格式由任务需求与后续确认决定；不能统一强制表格、Markdown 或原始 HTML。

元数据候选也分清用途：来源 URL、采集时间、字段类型/内容格式帮助读者理解；运行/发布版本和读取来源引用支持审计；内部 selector/ID/digest 留在高级信息。无需为层级展示保存整页 DOM、全部 HTML 属性、Cookie 或登录态。格式信息只描述已经实际保存的值，不能按字段名猜“正文”就是 Markdown，也不能让 UI 用模型给旧纯文本虚构章节。

后续待用户判断的是内容保真度与允许的清洗范围、默认阅读视图，以及文件交付范围。暂不更改公共契约、不添加 HTML/Markdown 抓取字段、不接入导出库、不重写旧任务；Windows 上的候选执行也未测。

## 2026-10-02 首次授权自动配置：已获实施授权，采集体验仅调研

用户确认开发“安装后首次允许、自动保存原授权、后续自动连接”，尽量减少人工操作；采集方式和成果展示须先调研成熟产品/开源实现，不能自行冻结默认格式或抓取规则。当前基线为 master / 0a904506255986f30b13d0658aa29bbcc6c2d89f，工作区干净。之前提交时跳过检查的要求已完成，本轮只执行授权接线所属的最小验证，不运行根级/全量测试。

```text
Product Alignment:
- natural-language task: 在指定日常 Chrome 安装扩展后，首次点击允许即保存授权，后续主动连接/运行无需复制码。
- reusable chain boundary: 原 TaskChain、B-U/W-U、TaskConnection 和任务专属窗口保持原合同。
- runtime inputs: 指定 Profile；原扩展的 Profile-local token；原 loopback relay。
- dynamic task outputs: 公开的已授权/已连接/处理中状态；不返回凭据。
- generic platform capability used: 原 extension Allow、原初始化事件、原 token 校验、现有凭据存储及撤销队列。
- replay model calls: 0 新增；只允许原显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: 首次明确批准后自动配置既有长期令牌，以及刷新后准确展示持久授权。
- existing implementation in repository: DailyChromeExtension、CDPRelayServer、extension connectToTab/extension.initialized、ProviderCredentialStore、Radix Dialog。
- mature candidates and pinned versions: Microsoft Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / extension 0.4.0；现有 ws 8.21.3、Zod 4.1.8、Radix Themes 3.3.0。
- selected implementation: 沿用当前固定扩展；用户已批准一处首次配置适配，不替换浏览器组件。
- reused public surface: 原 Allow 消息、获准后才建立的原 loopback WebSocket、原 initialization handshake；原凭据 set/get/remove。
- B-A-T-owned adapter and remaining gap: 仅在宿主显式请求首次配置且用户点允许时交接原 token；初始化完成才保存。初始化携带的凭据由宿主消费，不进入 CDP/运行事实。
- license/runtime/platform fit: Apache-2.0/MIT 保留；不增加库或原生安装器；Windows 实机仍单列阻塞。
- browser/runtime/state ownership conflicts: 扩展 Origin 和原随机路径限制；沿用单连接及 revoke 胜过迟到授权；不关闭用户 Chrome、不复制 Profile、不控制个人页。
- replay model calls: 0。
- rejected candidates and evidence: 原上游 README 明确要求复制 PLAYWRIGHT_MCP_EXTENSION_TOKEN；原 connect.tsx 的 Allow 仅建立当次连接，pair 必须人工提供 token。这一具体缺口已交用户确认最小适配，不另造 token、授权状态机或恢复机制。
- focused validation: 无码首次保存、撤销/迟到批准、重建宿主保留、凭据不进入状态或 CDP；真实 owned Chromium 的一次批准→持久连接→原零模型运行→重启/撤销；实际日常 Profile 的现有授权兼容和刷新状态分别记账。
```

源码入口：[固定上游扩展说明](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/extension/README.md#bypassing-the-connection-approval-dialog)。固定版本和必要适配仍登记在 vendor/daily-chrome-extension/UPSTREAM.json。实施后证据见本节末的分项结算。

首次授权真实兼容测试已走通一次 Allow、权限0600保存、B-U导航/DOM及非任务目标拒绝；首次脚本返回布尔序列化失败已修正并保留日志。第二/三次在任务关闭后枚举失败：原生 fixture CDP 证实 ownedTargetsRemaining=0，扩展仍 connected=true，故不能把此错误归为断线或未关闭。既有 BrowserModel.closeTarget 等原 chrome.tabs.remove ACK 返回，但 getTargets 新鲜事实适配此时仍可能向尚未收到 detach 的旧 tab 发 Target.getTargetInfo。最小回归将原 remove ACK 与稍后的原 onRemoved 分开；修补仅在成功 ACK 后调用上游已有 onTabRemoved/幂等 detach，不增加目标发现、恢复或清理权限；remove 失败继续传播。此为授权生命周期所属适配修补，完整运行和原窗口清理合同保持不变。

```text
Reuse Assessment:
- capability: 原 Chrome remove 已成功、异步目标移除事件尚未送达时的 CDP 枚举一致性。
- existing implementation in repository: 原 BrowserModel.closeTarget/onTabRemoved/_detachTab，以及现有 owned lease 核验。
- mature candidates and pinned versions: 同一 Microsoft 8b552173/extension0.4.0；Chrome tabs.remove Promise 公共入口。
- selected implementation: 原移除回调在成功 remove ACK 后消费同一原生事实，迟到事件仍走原幂等入口。
- reused public surface: chrome.tabs.remove、BrowserModel.onTabRemoved；无新状态机或驱动。
- B-A-T-owned adapter and remaining gap: 仅对齐既有新鲜 Target 读取与 ACK/事件间隙，不吞未知错误、不把断线当清理通过。
- license/runtime/platform fit: 原 Apache-2.0/TypeScript；Windows 实机仍阻塞。
- browser/runtime/state ownership conflicts: 只处理原映射已拥有的 target；失败 remove 不删除映射，不关闭用户进程。
- replay model calls: 0。
- rejected candidates and evidence: 不退回旧 URL 缓存、不补建应急页、不加恢复重试；真实 v2/v3 的失败与连接/原生关闭事实分开保留。
- focused validation: 同一已有协议测试构造成功 remove ACK、延迟 onRemoved 的先红后绿；真实生命周期继续验证。
```

### 本轮授权验证结算与额外正式运行反例

| 状态 | 证据 |
| --- | --- |
| 通过 | 所属 `daily-chrome-relay-compat.test.ts` 10/10；API、workbench 类型检查；最终解压扩展构建。没有根级/全量测试，没有新增产品依赖或 tracked 文件。 |
| 通过 | 独立真实 Chromium134/全新测试 Profile：只点一次原 Allow，不读/复制/提交授权码；0600保存，原 SDK 导航/DOM，非任务目标拒绝；两次 W-U/LangGraph 普通运行、0模型、清理确认；重建宿主与测试 Chrome 重启复用保存授权；扩展撤销立即断开、旧 token 拒绝、宿主凭据移除。日志 `first-approval-consumer-20261002-v4.log`。撤销后的产品连接无法自恢复而 cleanup 未确认，与 fixture 所有者最终回收自身进程通过，分别保留。 |
| 通过 | 实际日常 Chrome154/用户1 的已有授权兼容：两次独立最小普通运行均 completed、0模型、auditComplete=true、cleanup confirmed；其中第二次只针对“手动连接后闲置”的差异等待5秒，未复现下面的失败。`actual-saved-first-approval-20261002.log`、`actual-saved-warm-20261002-v2.log`。此成功不证明原 V5 失败根因。 |
| 通过 | 原拥有的开发服务经既有 shutdown 退出并加载本轮补丁；工作台显示“授权已保存/已绑定用户1”，主动连接即时 busy，成功后显示已连接；刷新/重开弹窗仍保留。最终截图 `first-approval-ui-final-20261002.png` 显示失败后授权仍保存、当前未连接，准确区分两种事实。用户 Chrome PID657 未结束。 |
| 失败，保留 | 早期 fixture 的布尔 evaluate 序列化错误；v2/v3 的 remove ACK/异步事件间隙；一次临时诊断 wrapper 漏掉 async，修正后第二次 warm 样本通过。最终入口已移除临时 private monkeypatch/延迟开关；这些失败不冒充产品验证通过。 |
| 失败，未解决 | 从实际工作台重新执行原 V5，execution `7634032b-2ebe-41d4-8d55-699bbc4c2f02` 在启动创建任务窗口时失败：0节点推进/0命令计账/0模型。`task_target_prepare` 的 `Target.createTarget` 等待回复处报 os_error，SDK 包装为 `hybrid_runner_failed:RuntimeError`。没有到达 GitHub 搜索点击，因此不能把它说成原首步点击回归复发。真实失败的原 CDP 异常文本未留存；具体断开原因仍未知。 |
| 阻塞 | 原同次租约 owner/lease `118646fb-aab0-48a6-8d1f-6bc28e1e7862` 保留 starting、ownedTargets=[]；原 relay 由当前 API 所有，但扩展连接已断开。按既有 `cleanup_execution` 请求一次，结果 `cleanup_owner_verification_unavailable`，execution 继续 cleanup_required。没有猜目标、换 endpoint 核验、删除租约或改写历史。该任务正式复跑门当前不能计为通过。 |
| 阻塞 | Windows 没有实机，安装/ACL/启动复用/重启/撤销不能验收。 |
| 未测 | 实际日常 Profile 使用新版包重新加载后的“全新无码第一次批准”（保留现有真实授权，不为测试撤销）；日常 Chrome 冷启动/重启/卸载/重新生成授权；首次完整 LLM 探索→编译→发布；iframe/popup/下载额外样本；商业产品登录后 UI/导出及候选组件工作台接入。 |

正式运行反例定位：[AttachedWindow._create](../../apps/api/python/browser_use_runner/attached_window.py) 先创建，再保存收到的 targetId；创建响应丢失时，本次 lease 没有能证明所有权的目标。[固定 relay](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/playwright-core/src/tools/mcp/cdpRelay.ts) 的扩展断线/单连接与当前保留 original endpoint 的 `verify_closed` 合同不能从新连接反推旧目标。当前接口返回的清理阻塞是实际反例；下一步若需要增加“创建响应丢失”的核验方式，必须先给用户现成实现及具体冲突取舍，不擅自增加恢复发现、重试或状态机。旧 V5 的上次完整成功和本次启动失败都保留。

## 2026-10-02 搜索首步回归：任务窗口实际激活（实施前记录与修后结算）

同一 V5 可执行摘要的六次历史运行均通过 `s-a-0002`，四次完整成功；扩展接入后 execution `88c57009-f73a-4355-8c85-ab16a74517ca` 首次停在该点击。原失败诊断 `data/source-lifecycle-diagnostics/7c82e11a-459f-4309-82c8-8804bfbf1cb0.jsonl:9` 已确认同一 target/document、单次 trusted 点击命中目标后代，94次检查仍 expanded=false、focused=false，非派发异常。W-U 与 TaskChainRuntime 未改动。

当前实际 Chrome154/已保存授权的原前两步复现失败；任务页 `visibility=hidden`。仅在导航前通过既有 relay 调用 `Target.activateTarget`，同一 selector、动作与检查条件立即通过，页面 visible、expanded=true、focused=true，模型0、清理确认。固定 B-U0.13.8 的 `Browser.get_or_create_cdp_session(..., focus=True)` 只设置 agent_focus_target_id，并不调用 activateTarget/bringToFront；受管扩展的新窗口适配使用 `chrome.windows.create(..., focused:false)`。首次失败日志没有记录 visibility，不补造旧现场；本轮对照证明窗口实际激活缺失这一回归及当前复现的原因。

```text
Product Alignment:
- natural-language task: 在日常 Chrome 的任务专属窗口执行已发布链路。
- reusable chain boundary: 发布链路、selector、动作、后条件与运行审计不变。
- runtime inputs: 已保存授权、原 Profile、execution 的已登记目标。
- dynamic task outputs: 原运行结果与清理事实。
- generic platform capability used: Chrome Target.activateTarget、既有任务窗口/TargetScope。
- replay model calls: 0 新增调用，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: 新建任务页的真实激活，而非 SDK 内部控制目标切换。
- existing implementation in repository: AttachedWindow.start/start_connected；BrowserModel.activateTarget 已调用 chrome.tabs.update(active:true) 与 chrome.windows.update(focused:true)。
- mature candidates and pinned versions: 沿用 B-U0.13.8/cdp-use1.4.5 与 Microsoft8b552173e8d767db29b8baef8f4a1f08cf7f26bf/extension0.4.0；不更换驱动、协议或状态机。
- selected implementation: 在现有 task_target_focus 阶段、目标租约持久化且 TargetScope 核验后，复用当前 SDK 根 CDP 连接调用 Target.activateTarget。
- reused public surface: cdp-use.send.Target.activateTarget；既有受限 relay/Chrome tabs.update、windows.update。
- B-A-T-owned adapter and remaining gap: 仅补两处新/复用父连接 operation 的任务页激活；完整 V5 正式运行待修后验证。
- license/runtime/platform fit: 不新增依赖；原 Apache-2.0/MIT 记录不变；Windows实机阻塞。
- browser/runtime/state ownership conflicts: 只激活已登记目标；激活失败仍沿原 task_target_focus/close 合同清理。避免在 createTarget 回执/租约登记前添加可失败副作用。
- replay model calls: 0。
- rejected candidates and evidence: 不修改 GitHub selector/等待/状态条件，不额外点击或模型重试；内部 focus 已被固定源码证实不等于实际激活。
- focused validation: 当前 hidden 首两步红、仅原 API 激活后绿；待运行所属 owner/激活失败回归与完整正式 V5。
```

对照入口：ignored `work/daily-chrome-p0/search-prefix-proof.ts` 与 `search-prefix-entry.py`；原失败 `search-prefix-actual.log`、激活对照 `search-prefix-activate.log`。探针最初两次混用 stable/v1/v2 图格式，在 schema 校验处失败、未执行 GitHub 动作，清理确认；随后先做边界解析再执行。只保存固定 DOM 布尔值/计数，不保存页面文本、凭据或 Cookie。

修后结算：所属 Python 24/24 通过，新/复用连接激活和激活失败清理两项先红后绿。真实工作台提交未改动的 V5，execution `97a83b22-1a20-4308-8095-6536b2669a53` / run `443055d0-2e3b-494c-8b42-90675eb98f80` 均 completed；20 transitions、23 browserCommands、0 llmCalls、审计完整、清理 confirmed。首页搜索至第二页首个 Issue 标题/正文完成，UI 成果弹窗已核验；标题97字符、正文1630字符，只额外保存长度与摘要。`search-focus-full-v5-proof.json` 与 `search-focus-full-v5-result.jpg` 为当前证据，原失败保留。初版 prefix 汇总误用 event.type，firstClickPassed 字段错误；对照的 completed/实际布尔值有效，已改用 event.status/outcome 统计，未重写原日志。诊断脚本移入 ignored `work/daily-chrome-p0/debug-search-focus-20261002/`，不在产品入口；没有新增长期日志。Windows 实机仍阻塞，实际 Profile 冷启动/重启/撤销及首次探索发布未测，不以此次复跑替代。

## 2026-10-02 实际 Chrome154 连接页修复、持久授权与普通运行

用户已经加载现成扩展并取得原授权码，首次保存打开 connect.html 时实际 Chrome154.0.8037.92 显示 ERR_BLOCKED_BY_CLIENT。只读核对安装身份 egiggbcomooebckhjcimllnoediapped、目录与当前包一致，禁用原因为空；修补前宿主 paired=false。记录不含授权码或完整连接 URL。此真实反例推翻了此前以 Chromium134 原生启动成功认定不需要 web_accessible_resources 的结论。

```text
Product Alignment:
- natural-language task: 首次连接日常 Chrome，在任务专属窗口执行既有任务。
- reusable chain boundary: 原 TaskChain、B-U/W-U、任务窗口与 TargetScope 不变。
- runtime inputs: 原 Profile-local 授权码和既定 Profile。
- dynamic task outputs: 原连接、运行与清理事实。
- generic platform capability used: 原 relay 浏览器启动、Chrome 扩展资源导航、原 token 校验。
- replay model calls: 0 新增调用，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: loopback HTTP 启动地址安全导航到原扩展连接页。
- existing implementation in repository: 原 CDPRelayServer launcher + 私有 WSServer 302；当前 manifest 未声明可访问连接页。
- mature candidates and pinned versions: 沿用 Microsoft8b552173e8d767db29b8baef8f4a1f08cf7f26bf/extension0.4.0；Chrome Manifest V3 官方 web_accessible_resources；既有 B-U0.13.8/cdp-use1.4.5 测试消费者。
- selected implementation: 已采用并实测 Chrome 官方资源声明的最小修补，不更换组件、协议或驱动。
- reused public surface: Chrome manifest.web_accessible_resources；原 token/协议检查与任务窗口创建。
- B-A-T-owned adapter and remaining gap: 只使原 connect.html 可从原127.0.0.1启动地址导航；用户重新加载后，实际日常 Profile 真握手、保存与普通运行已通过。
- license/runtime/platform fit: Apache-2.0 原源码与入口不变；Windows继续缺实机。
- browser/runtime/state ownership conflicts: 不放开所有扩展资源，不取消 token 校验、不向 Chrome argv 写凭据、不改 Profile/个人页所有权。
- replay model calls: 0。
- rejected candidates and evidence: 不退回原 argv token，也不使用关闭浏览器安全检查或复制 Profile 的方式消除拦截。
- focused validation: 原 HTTP redirect + manifest 边界用例先红后绿；所属4例和API检查通过；Chromium134原生跳转通过；用户重新加载后的Chrome154实际配对、保存授权复用及原W-U/LangGraph普通运行通过。
```

官方入口：[Chrome 扩展资源导航合同](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources)。从 web origin 导航到扩展资源需要声明可访问资源；matches 匹配 origin，路径必须为 /*。本次只声明 `connect.html` 对 `http://127.0.0.1/*` 可访问；原 token 校验、连接协议和任务窗口边界不变。修补后用户重新加载，实际工作台显示“连接已验证，授权已保存”；凭据文件权限0600，状态API不返回秘密。未关闭其他用户扩展或关闭浏览器安全检查。

固定源码/依赖版本用于构建复现和许可证追溯，不要求用户安装相同 Chrome 版本或降级。实际日常Chrome154与独立Chromium134均已补证；不能由此宣称所有Chrome版本和所有CDP能力已测。

| 状态 | 本次证据 |
| --- | --- |
| 通过 | 原loopback跳转/manifest回归4例；最终包原地重建；API类型检查；独立Chromium134同路径握手与清理；Chrome154实际首次配对、0600保存，随后运行自动复用已保存授权；合成本地页面经PythonUpstreamBrowserRuntime → W-U → TaskChainRuntime/LangGraph完成1次普通运行，modelCalls=0、auditComplete=true、cleanup=confirmed。 |
| 失败，保留 | 已发布GitHub任务V5的实际execution `88c57009-f73a-4355-8c85-ab16a74517ca`：导航完成，在s-a-0002点击后报target_state_fact_mismatch；llmCalls=0、审计完整、清理确认。根因尚未证明，后续合成页面成功不改写该失败。独立CfT145探针在浏览器版本/扩展断言之前TimeoutError，清理确认，不能算145兼容失败或通过。 |
| 验证准备失败，已补救 | 额外真实Profile探针首次请求第二条relay时被现有闲置连接挡住；单连接保护生效。通过原环境切换入口释放闲置连接并恢复daily，再仅重测受影响探针通过；不修改并发合同，不自动重试原GitHub任务。 |
| 阻塞 | Windows缺实机，不能核验实际安装、ACL、启动/复用、重启、撤销。 |
| 未测 | 实际日常Chrome冷启动/重启、实际Profile重新生成授权码与卸载、首次LLM探索→编译→发布全链、iframe/popup/下载额外样本、根级全量测试。 |

入口：`apps/api/tests/daily-chrome-relay-compat.test.ts`；`node scripts/build-daily-chrome-extension.mjs`；实际Profile探针复用既有 `daily-chrome-playwright-relay.ts` 的 `BAT_SAVED_DAILY_PROOF=1` 模式（先停止任务并释放现有闲置连接，仅读取现有已保存授权，不配对/撤销，不读取个人页面）。证据：ignored `work/daily-chrome-p0/redirect-manifest-red.log`、`redirect-chromium134-green.log`、`redirect-chrome145-red.log`、`real-daily-chrome154-runtime-busy-first.log`、`real-daily-chrome154-runtime.log` 与不含授权码的工作台截图 `real-daily-chrome154-authorization.jpg`。原GitHub运行/模型审计/清理事实来自SQLite中的taskExecutions、taskContracts及taskExecutionCleanupAudits只读记录。

## 2026-10-01 受管微软组件的真实产品消费与采用边界

固定候选的最小适配已完成真实样本验证：最终扩展包 + DailyChromeExtension + PythonUpstreamBrowserRuntime + 原 W-U/LangGraph 连续两次普通运行，0模型；宿主重建和测试 Chrome 重启后持久授权有效；扩展重新生成 token 立即撤销，旧 token 被拒绝；同窗口/拖分组不能准入个人页。该结论限定 macOS 独立可见 Chromium134测试 Profile；实际日常 Profile 和 Windows仍未验收。

```text
Reuse Assessment:
- capability: 指定日常Profile的扩展控制、持久凭据和任务窗口生命周期。
- existing implementation in repository: TaskConnection、AttachedWindow/TargetScope、原失败/恢复/cleanup_required、B-U/W-U/LangGraph、ai-connect凭据存储、Radix。
- mature candidates and pinned versions: Microsoft commit 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / extension0.4.0（Apache-2.0）；ws8.21.3（MIT）；ai-connect0.3.2/f0ef768f（MIT）；B-U0.13.8 / cdp-use1.4.5 / W-U0.2.11 fork5d2d19fe8835cc86f1bf3e04302a5000d590f249。
- selected implementation: 已真实消费的固定微软受管子集；不引入Playwright浏览器驱动或完整MCP/BrowserSkill。
- reused public surface: 原 ExtensionProtocolV2 / BrowserModel / token生成比较与localStorage / PendingConnections / ConnectedTabGroup / chrome.debugger、tabs、windows；公开 ProviderCredentialStore；ws.WebSocketServer(noServer)/handleUpgrade。
- B-A-T-owned adapter and remaining gap: browser-level Target缺口接回原session，目标事实用原Target.getTargetInfo更新；窗口/标签owner、同源边界、原运行入口、持久凭据引用和权限UI。Node HTTP/ws只替换上游私有HTTP包装；不写CDP驱动/密码学/恢复状态机。
- license/runtime/platform fit: UPSTREAM.json记录原文件摘要与修改，Apache版权保留；产物附LICENSE与React/react-dom/scheduler固定包许可证。Node>=24；Windows代码存在，缺实机不能过门。
- browser/runtime/state ownership conflicts: Profile不复制、不写登录态；单CDP client；原扩展映射在正常SDK交付/更换连接时保留，撤销/服务关闭用原close；断线由原TargetScope阻止自动重连。
- replay model calls: 实际两次普通运行均0，显式llm边界不变。
- rejected candidates and evidence: 不更换先前候选；Panerelay/Playwriter原反例仍保留。微软原版Target.setDiscoverTargets首败与缓存URL失败通过局部适配解决，无第二套控制器。
- focused validation: product-lifecycle-ownership.log退出0，导航/点击/DOM、两次原TaskChainRuntime样本、宿主/Chrome重启、撤销与旧码拒绝、同窗口/分组越权反例；11所属用例、API/workbench检查与构建、真实UI。
```

Chrome启动完全沿固定原 spawn/Singleton入口；token URL由私有loopback跳转，不在Chrome argv中。可见测试实例真实复用通过；headless夹具不能代替日常可见启动器验证。当时Chromium134原生启动样本通过，未新增web-accessible声明；此判断已由上节实际Chrome154反例推翻并修补，不能继续作为不需要声明的依据。`Browser.grantPermissions`警告保留为能力限制，未做成功空回执扩张。精确入口：`vendor/daily-chrome-extension/UPSTREAM.json`、`scripts/build-daily-chrome-extension.mjs`、`apps/api/src/browser/daily-extension.ts`。

清理被替代的研究VM/probe/旧构建共8文件至ignored retired-research；历史P0文档里的旧命令只描述当时执行，不作为当前入口。完整日常实装及Windows、首次全链探索和额外能力样本均不可借本结论补造。

## 2026-10-01 接续：自行修复现有 B-U 与固定扩展的兼容缺口

用户继续要求开发方自行解决 browser-use 连接失败，不把技术排查交回用户。先对已实际构建/握手的微软固定扩展作受管最小兼容修复；沿用其 CDP/session 模型、授权 token 与传输，不增加浏览器驱动、协议或恢复状态机。真实消费者通过前不冻结整体采用。目标日常 Profile 安装与开发验证分别结算。

```text
Product Alignment:
- natural-language task: 从 B-A-T 在指定日常 Chrome 的任务窗口执行既有任务。
- reusable chain boundary: 原 TaskChain 与 B-U/W-U 执行入口不变。
- runtime inputs: 现有任务 owner、Profile 与已获准控制的目标。
- dynamic task outputs: 既有任务输出、连接失败和清理事实。
- generic platform capability used: 固定扩展的 BrowserModel/CDP relay 与现有 TargetScope。
- replay model calls: 普通节点 0，仅显式 llm 节点。
- site/task-specific code added: no

Reuse Assessment:
- capability: browser-use 的浏览器级 Target 初始化与任务目标枚举。
- existing implementation in repository: 固定原版扩展/relay 真实握手；原 AttachedWindow/TargetScope。
- mature candidates and pinned versions: Microsoft Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf，extension 0.4.0；browser-use 0.13.8/cdp-use 1.4.5。
- selected implementation: 仅受管扩展当前固定候选的局部兼容；整体准入尚待真实消费者验证。
- reused public surface: ExtensionProtocolV2/BrowserModel，原 chrome.debugger attach/sendCommand 及消息。
- B-A-T-owned adapter and remaining gap: 浏览器级 Target 命令接入原模型；目标仅来自原授权事件，不枚举个人标签页。
- license/runtime/platform fit: Apache-2.0，保留版权、原版本、原文件摘要与修改记录；macOS 实测，Windows 缺机。
- browser/runtime/state ownership conflicts: 复用原映射；拒绝不在已授权模型中的 target，不新增控制会话。
- replay model calls: 0。
- rejected candidates and evidence: 不切换候选；原版真实失败 Target.setDiscoverTargets，extensionHandshake=true、cleanup=confirmed。
- focused validation: 原真实失败探针、Target 命令所属边界用例，然后同一现有 SDK 消费修复版。
```

本次原版复现：`work/daily-chrome-p0/consumer-resume-baseline.log`，握手成功，consumer_start 的 `Target.setDiscoverTargets` 失败，0 模型，清理确认。日常安装页再次被浏览器自动安全审查拒绝：仅 HTTP/HTTPS，明确禁止 alternate UI/raw-CDP 绕过；不据此停止其余开发，也不把 owned Profile 探针标为日常验收。

局部兼容已真实通过：`consumer-managed-final-cleanup.log` 的 sdkStart、navigationAndDom、observation 为 true，status=passed、modelCalls=0、cleanup=confirmed。沿用原 Session 映射补 discovery/getTargets/attach/getTargetInfo；B-U 在 discovery 后才注册 attached 监听，显式 attach 重发原 session 事件。夹具中 loader.stop 会关闭 Chrome、原 owner 已删临时目录后的重复删除等问题分别修正，不算产品兼容反例。

P1 的持久事实继续复用微软原 Profile-local auth-token 与原 getConnectionStatus/disconnect，撤销时调用原断连；B-A-T 凭据保存复用现有 `@agent-platform/ai-connect` 0.3.2/f0ef768f 的公开 `integration/credentials/provider-credential-store`（MIT、Node>=24，原文件锁/原子 rename/0600），使用独立本地文件，不混入模型账号。已核对固定 tgz 的公开 exports、类型及实际写入源码，不另写凭据库/锁/加密/授权协议。浏览器启动沿用原 CDPRelayServer spawn/singleton Profile 参数；其 token URL 改由同一 loopback HTTP 包装跳转，进程参数只有无 token 的原连接地址。扩展仅增加 chrome.windows 与原 tabs 命令的任务窗口薄映射；不复制 CDP driver。实际入口与完整许可随产品包记录；Windows 实机仍阻塞。

## 2026-10-01 原组件三环境复用与真实扩展消费者（最新）

P0 日常扩展兼容仍未通过；P2 独立专属环境产品接线及 P3 环境/账号 UI 已实施。下面早期“未实施/未重载”记录是阶段历史，当前状态以本节和 PROGRESS 最新节为准。

```text
Reuse Assessment:
- capability: 三环境配置、同次准备/执行快照、原专属 Profile 账号与清理。
- existing implementation in repository: BrowserProfileService、ManagedWindow、TaskConnection、原 TaskChainRuntime/LangGraph、SQLite/Drizzle、Radix Dialog/Select。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11（受管 fork 5d2d19fe8835cc86f1bf3e04302a5000d590f249）、Radix Themes 3.3.0。
- selected implementation: 专属模式沿用仓库组件；没有产品依赖替换。日常扩展未冻结。
- reused public surface: 原 Browser/BrowserProfile、cdp-use Browser.close、runner RPC、原账号窗口与清理合同、Drizzle、Radix Select/Dialog。
- B-A-T-owned adapter and remaining gap: mode/revision、准备及 execution 快照、已有入口分流和 audit/cleanup；候选持久配对与窗口授权缺口仍未实施。
- license/runtime/platform fit: 沿用原许可证；Node24.12/Python3.12/macOS 真浏览器通过；Windows 缺设备阻塞。
- browser/runtime/state ownership conflicts: 运行或账号/交付窗口占用时不切换；只释放空闲父连接；Browser.close 限于核验 PID/createTime/exe/Profile/browserID 的专属 lease，日常 Chrome 不受此关闭入口影响。
- replay model calls: 新真实普通 LangGraph 运行两个模式均 0，没有新 judge/重试模型/必填字段。
- rejected candidates and evidence: 三个扩展不可原样通过；Playwright 真实 SDK consumer 首条 Target.setDiscoverTargets 失败，Panerelay native fixture 未到消费者，不能冻结采用。
- focused validation: 所属 CAS/并发/旧合同/迁移/owner/断线验证、真实共享存储与确认清理、原账号窗口及真实三环境 UI；不以私有空白样本代替完整新准备或日常授权验收。
```

- 对应实际入口：`BrowserEnvironmentService.select`、`ProductStore.executionBrowser`、`TaskPreparationCoordinator.start`、`TaskChainAuthoring.explorePlan`、`TaskChainService.enqueueDraftTrial/runTask`、`PythonUpstreamBrowserRuntime.withAuthoring/withCapabilities`、`ManagedWindow.end_gracefully`。沿用现有恢复合同，未新增状态机。
- Playwright 真原扩展/relay handshake 已通过，但固定 browser-use 0.13.8/cdp-use1.4.5 在 autoAttach 前发送 Target.setDiscoverTargets，原 relay 无 attached tab 可转发并拒绝；这是实消费者兼容反例。原内部入口/argv token/分组扩权等源码反例仍成立。
- Panerelay 固定原后台/协议 Native Messaging 测试 manifest fixture 的实际 Chrome native Host 退出，根因未知，consumer 未到达；独立 helper 原 relay.listen 正常启动仅是局部证据。原 manifest 完整构建与正式 Native Host 安装未验证。遵循 [Chrome Native Messaging 官方机制](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)，没有发明生产安装器或凭据协议。
- 真实 LangGraph 探针每个 run 逻辑命令 1、页面访问计数分别 [0,1] 与 [2,3]，实际原因未查明；这里只证明共享 Profile 存储连续与零模型，不声明物理动作唯一性。
- 下阶段唯一新增取舍是成熟候选的受管行为扩展/继续寻找，不重新询问三环境、任务窗口、首版平台、单 Profile 或断线合同。[证据与失败结算](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#继续实施真实消费者与三环境产品接线)。

## 2026-10-01 P0 无人值守构建与真实扩展加载补证

原版 Playwright 候选 extension 0.4.0 已按固定上游 Vite 配置构建，在全新测试 Profile 中经现有 browser-use/cdp-use 完成 UI 与真实后台消息验证，模型 0、清理 confirmed；没有采用 Playwright 产品驱动或冻结候选。当前受管环境未安装 Playwright；历史 bundled Chromium 与微软 extension/relay 是不同事实。工具仅拒绝日常 Chrome 的受保护安装页，不能据此停止可独立进行的构建/测试。[完整补证与首败](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#后续补证用户不在电脑旁时的开发验证) 保留 CfT 145 启动超时、辅助 API 格式错误、首次清理核验和各项最小补救。真实日常 Chrome 154、完整 SDK relay 消费和 Windows 仍未验收，P0 兼容门仍不通过。

## 2026-10-01 日常 Chrome 扩展 P0 固定来源与执行反例

本轮已授权开发，从实际 `master@674ed366` 与 6 个既有文档 dirty paths 开始，保护原改动，无分支/worktree/提交/推送。完整 Product Alignment、Reuse Assessment、固定来源/许可证及真实层级证据见 [P0 记录](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md)。

固定 Playwriter `33d5c5a`、Playwright `8b552173`，补查 Panerelay `852dcd82` / `0.11.1`。原样采用均不满足已确认边界：Playwriter 历史云资源清理与默认日志；Playwright group 拖入扩权、空目标枚举、argv token；Panerelay 新页要求 all-tabs，并在真实 HTTP/WS 路径丢弃 newWindow。Panerelay 实际撤销旧凭据性质通过，可以作为复用依据，不代表持久配对或 Chrome 兼容。

新增固定来源脚本与 API 显式 P0 探针，9 项各自有通过记录；来源下载/测试输入及纯类型循环的首次失败独立保留，补救只重验受影响项；所属 API typecheck 通过。没有产品候选接线、模型调用、Chrome/Native Host 安装或服务切换。P0 兼容准入不通过，已按用户要求提出候选最小扩展/继续寻找的取舍，未自行冻结采用。Windows 缺实机阻塞；扩展安装/批准需要用户实际操作。

## 2026-10-01 日常 Chrome 扩展接入方案（文档与静态核查）

详见 [开发文档](DAILY_CHROME_EXTENSION_DEVELOPMENT.md) 与 [ADR 0013](../adr/0013-daily-chrome-task-window-control-boundary.md)。用户确认默认仅任务专属窗口、首版 macOS/Windows、本地加载解压扩展、主动连接/运行自动打开 Chrome、一个指定 Profile；已纠正把模式切换强制升级为链路复验的建议，产品不新增这一步。

保留 browser-use 0.13.8/cdp-use 1.4.5/workflow-use 0.2.11 的主线。候选为 Playwriter `33d5c5a2c5ebf702e387d94d609e038c98e0acec` 公开 CDP relay；Playwright `8b552173e8d767db29b8baef8f4a1f08cf7f26bf` 扩展的按 Profile token 为成熟授权对照。只复用传输，不引入额外 Agent/执行器。

静态发现：现有 endpoint/path 与 newWindow 语义有适配差异；候选默认 CDP logger 会落盘，自动启动助手按端口管理进程，relay 自身还包含辅助执行器和启动后的 orphan-cloud 清理。必须关闭这些不符合本项目秘密/资源所有权边界的默认行为，不能只因公开导出 relay 就冻结选型。browser-use 固定版本已有 headers→CDP additional_headers，是可核验的成熟凭据消费入口，不据此新增短期 token 协议；真实兼容、两平台安装、持久授权与京东效果均未验证。

当前断线源码证据：`TargetScope.ensure_connection` 与受管 `_auto_reconnect` 拒绝擅自重连；`TaskChainRuntime.executeExclusive` 对中断/预算以外异常进入 `failRun`。已有 checkpoint/resumeRequest/verifyResume 是条件性的既有恢复合同，不能推断控制掉线后自动暂停/续跑。文档沿用这些事实，不新增恢复系统。

用户最新强制要求覆盖开发的所有环节：先找现成开源实现，能复用/沿用就复用/沿用，不由 agent 自行作出新增产品、架构或选型决策。故不预先指定自定义短期 token/epoch、OS 凭据包或新授权协议；P0 逐项注明所用现成源码/API、实际不满足点与真实证据，不以文档中的示例字段为自研要求。

本 session 只编写文档并做只读核查，没有安装、启停、连接浏览器、模型运行或产品测试。开发文档与接续指令已完成，产品取舍已收敛；技术候选由新 session 的 P0 完成证据核验，未实施、未冻结采用决定。

## 2026-09-30 解锁后真实消费核查与输出约束补救

解锁后从原任务/日常 Chrome 实际点 Allow，首次连上的 operation 保留父连接，下一次 operation 没有 SDK connect 或原生确认且运行完成。成功 run 的 40 个事件有真实输入/输出 envelope，11 对 recorded、9 对 redacted。原任务现场、完整成果和 Function 参数/返回均已核对；首个连上后 target mismatch 失败保留且根因未知。此结论只覆盖同 task/config 的有效连接，不支持跨任务、Chrome/服务重启的永久授权。Chrome 官方明确新调试 session 需要确认：[官方连接说明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

输出省 merge 的同源整图核查发现旧 `applyReadRequirements` 只消费非空叶绑定；新 assemble 改为根 source 加常量 paths 后就绪约束丢失。最小补救复用 runtime 已公开的 `dataCapabilityConfigSchema`，按 arguments 别名、常量 mode/paths 和实际源键恢复原路径；目标映射路径与源 requiredPaths 分开。直接 terminal 返回只消费实际非空 node 绑定，根值、动态参数和控制流不增加猜测。独立对冲覆盖别名、嵌套前缀、非法路径、空/动态映射和 identity 变量写，无新模型字段、契约字段、图调度或库。

两个真实消费反例先红；所属 4 条含 Python readiness probe 通过。原 artifact 通过当前 materializer/compiler 产生 19 节点，非输出节点及控制流、输入输出合同保持；本轮保存的 read 值经新 assemble 值/键序一致。旧 release 原文与摘要保持，候选未写入产品仓储或发布。这是新代码编译/数据消费验收，尚非新候选整链浏览器验收。

交付边界定点核查：`/api/task-chain/artifact` 返回仓储 JSON 元数据，`ArtifactList` 只展示媒体类型/ID/摘要，没有真实文件下载端点或文件生成证明；不能宣称 Excel/Markdown 已交付。原窗口聚焦已有 `controlHandoff(focus)` → managedWindowAction → AttachedWindow.focus 的生产 seam，要求原 handoff lease 和原 target 仍存在；当前数据任务无需页面保留，所以本轮不以它验收现场交付。

展示死规则反证：case ID 是版本数据，不是固定失败或循环含义。按实际源 node.kind/cases 优先解释节点、阶段、循环体与边，标准端口再按其真实类型处理；不能保留“blocked/limit 命中就是异常”的字符串表，也不能加保留字限制回避合法图。边在投影前持有真实源身份，私有 label 直接给 React Flow；分组合并保留已声明 case 身份，文案相同也不与循环边合并。独立对冲及 6 个先红反例保护此不变量；30 条所属验证通过，同文案反例补救仅重验 control 17 条。数据操作按既有注册 merge 与常量 transform+assemble 的算法语义显示中文，动态/未知不猜，无新增模型字段或第二翻译表，受影响单项及 Workbench check 通过。

循环轮数与集合项数不互相推算：while 的已完成稳定次数和当前次数用“轮”，each 的集合游标/已处理数用“项”；未知总数没有分母。此最后文案补救只重验已有未知 while 单项，通过，不追加运行字段。

## 2026-09-30 最小字段与输出精简最终对冲结论

本轮沿已有事实路径与 Reuse Assessment 执行，不新增库、模型用途或必填 LLM 字段。删除重复 review invocation/result 身份、outputNames、missing 的 not_recorded 原因、无消费的路径展开接口和重复端口表。剩余 kind/标准端口/能力翻译来自公开 IR 与已验证配置，未添加网站、任务 ID、URL/selector 词表。schema 说明复用现有 ValueSchema 类型字段；只为 Function 展示真实结构和约束，普通动作保持短类型。

输出方案已经查清 materializeOutputAssembly → data.transform → executeDataOperation → assembleValue 与 parseTaskValue：校验不规范化对象键序，既有 equals/Function 可观察顺序，不能靠字段名或 schema 宣称多字段重组恒等。独立对冲允许复用已有 assembler 删除同源 merge：rewrite 后父绑定完全一致、唯一字符串源键、paths 键序与字段顺序完全一致、closed 父对象 properties 恰好覆盖所选 required 键；否则回退。最终输出合同与变量写仍在 assemble，未重写数据能力或编译框架。新候选整值 exact contract 可 0 节点，同源投影 1 节点；旧 release 不改。输出 5 条定点不变量通过，目标合同验证调整后受影响 1 条通过；新候选整链真实运行未验。

启动失败补救同样用生产消费事实：只在 fresh operation、无旧交付恢复、无 handoff 目的/目标回执、owner/lease 相同、当前真实清理报告 confirmed 且无 activeResources、browser_close confirmed/not_required 时清掉启动占用。旧交付/回执不明/释放不确认/owner 错配保守阻断；typed UpstreamProtocolError 且无 step.runIds 才归 existing external、repairable=false，不按错误字符串猜权限原因。现有 startup/handoff 5 条（含 5 类反例）通过，新实际失败 b104a9fc 同样无残留租约。

用户后来明确授权处理本机原生 Allow；当时 Mac 已锁定，native UI 无法操作，未点击。新 sdk_connect 失败不当作链路回归通过，也不改原失败。真实首连及连续第二次复用未验证；当前保留有效 task 父连接只覆盖同 task/config 与连接存续期，不覆盖浏览器/服务重启。[Chrome 官方新调试会话确认边界](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

## 2026-09-30 正式运行之间的日常 Chrome 连接边界补救

Product Alignment:
- natural-language task: 同一任务再次运行时复用仍有效的用户 Chrome 控制连接，详情先说明实际业务事实。
- reusable chain boundary: 每次 execution 独立页、能力与审计；task 拥有同一 SDK 父连接。读取、导航和表单共用。
- runtime inputs: 原 task、operation owner、endpoint/profile/headless/origins/sites 指纹与真实释放报告。
- dynamic task outputs: 原任务返回值、清理与交付事实；不改历史发布和运行。
- generic platform capability used: 现有 TaskConnection.borrow/release、ConnectedTaskScope 与 retainedConnection 审计。
- replay model calls: 0 新增。
- site/task-specific code added: no

Reuse Assessment:
- capability: 正式运行确认释放本 operation 后继续保留同 task 的 SDK 父连接。
- existing implementation in repository: 准备/复验已经使用此保留路径，runtime-host 仅对 replay 强制 closeAfterOperation。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、cdp-use 1.4.5、bubus 1.5.6；不引入/删除库。
- selected implementation: 复用已存在的同任务释放路径，不新建连接池、代理、浏览器或自动重连。
- reused public surface: TaskConnection 借用与释放、SDK start/stop、TargetScope ownedTargets。
- B-A-T-owned adapter and remaining gap: 移除正式运行独有的强制断连；真实首次连接的 Chrome 原生授权仍不可省略。
- license/runtime/platform fit: 不变；macOS 代码验证，Windows 真实运行未测。
- browser/runtime/state ownership conflicts: 同 task/config 才可复用；不同 task 下一次借用、服务关闭、取消、handoff、启动失败、释放不确认或掉线最终关闭。业务失败的 operation 若确认释放，可保留父连接，不能承诺所有失败都断连。
- replay model calls: 无新增。
- rejected candidates and evidence: 不跨 task 共享、不自动 Allow、不关闭用户 Chrome、不换私有 Profile。Chrome 官方原生调试会话每次新连接需确认，保留连接只减少重连次数，不提供永久授权。
- focused validation: 真实 runtime-host 正式入口适配与原 TaskConnection 生命周期定点验证；此次新的真实尝试失败在 sdk_connect、0 节点，不将其归因于前一次正式运行关闭。

独立只读对冲已核验 resume 原租约、handoff 保留页面并关闭 SDK、配置漂移拒绝、operation 清理与父连接审计；结论允许最小补救，首连授权仍是当前接入方式的产品限制。[Chrome 官方说明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)。

## 2026-09-30 独立交接后的节点展示与运行事实实施门

Product Alignment:
- natural-language task: 用户查看同一次链路调用的动作、条件、循环、实际输入输出与成果，并从结果回到同任务需求对话。
- reusable chain boundary: 阶段内真实节点的只读投影和单次运行事实；导航读取、重复处理、表单操作共用。
- runtime inputs: 所选不可变候选或发布图、需求引用、TaskRun.input、同 run/invocation 的有序事件。
- dynamic task outputs: 同次返回值、逐次安全 I/O、真实循环与条件出口、交付和清理事实。
- generic platform capability used: React Flow 阶段父卡、现有 contracts/runtime 事件、产品仓储、访谈幂等命令。
- replay model calls: 展示与留存不增加模型调用；用户明确需求回流使用既有访谈用途。
- site/task-specific code added: no

Reuse Assessment:
- capability: 节点解释、运行事实留存、同任务需求回流及新候选输出绑定简化。
- existing implementation in repository: ChainPresentation、TaskRun.events、TaskContractRepository.saveRun、executionEvents、review_execution、InterviewConnection。
- mature candidates and pinned versions: 保留 React Flow 12.11.6、Radix Themes 3.3.0、Dagre 3.1.1、LangGraph 1.4.14、Zod；不引入/删除库。
- selected implementation: 适配现有公共接口；持久事实仍由现有运行仓储承担。
- reused public surface: React Flow Node/Handle、Radix 详情与结果布局、Zod schema、既有运行事件和幂等提交。
- B-A-T-owned adapter and remaining gap: 当前事件只有状态出口，没有完整逐次 I/O；workspace summary 未携带精确需求、调用输入、review。新增可选受控事实并保持旧记录缺失语义；未冻结字段接受独立只读审查后实施。
- license/runtime/platform fit: 已有依赖及许可证不变，浏览器与 Windows 真实验收另记。
- browser/runtime/state ownership conflicts: 不增加浏览器控制会话、前端进度库、调度器或检查点库；查看不触发浏览器操作。
- replay model calls: 0 新隐式调用。
- rejected candidates and evidence: 不以日志保存 I/O，不从列表相邻/标题推断循环体，不从技术限额生成分母，不改旧 release/历史 run。
- focused validation: 按阶段覆盖当前次优先、未知总数、分支共享汇合、缺事件、具名参数、输出绑定和回流幂等，不跑根级全量测试。

当前基线：HEAD `2a8d2cdeb2b2b7ea3cfe49930511a1e9d5081683`，master；原有 10 个已跟踪文档修改与 2 个未跟踪文档保留。独立交接文档已全文阅读。展示稿采用一张阶段画布，直接子行、当前次分支规则、右侧计时、可查看起止卡；结果打开宽区，集合按保存值浏览，长文本可完整读。

## 2026-09-30 变动数据下的跨页消费者就绪作用域补救

Product Alignment:
- natural-language task: 原任务读取第二页首条详情；首条随实时列表变化，不锁定探索样本。
- reusable chain boundary: 点击或键盘导航后，唯一字段消费者绑定本次动作结果页；详情读取与导航后表单读取共用。
- runtime inputs: 当前结构选择结果、动作所属 session/target、实际导航 URL、已编译读取配方。
- dynamic task outputs: 当前选中详情的标题及正文，字段合同保持不变。
- generic platform capability used: 已有 action_result_readiness、navigation owner、同轮 Page 身份校验和有界事实轮询。
- replay model calls: 0；不重新探索，不重派已经执行的点击。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将跨页 ready 消费者的样本作用域绑定到合法动作结果，不改变固定 URL 的授权条件。
- existing implementation in repository: workflow-use fork 已有 transition 消费者动作结果绑定；ready 消费者遗漏。
- mature candidates and pinned versions: 继续 browser-use 0.13.8 / workflow-use 0.2.11 fork；不引入新库。
- selected implementation: 扩展现有唯一消费者选择条件，复用全部导航和身份核验。
- reused public surface: OrdinaryCapability.execute_checked、TargetResolver、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: 仅补 ready 分支；不添加模型、控制器或第二套导航循环。
- license/runtime/platform fit: 原许可证及 Python/Node 运行时不变；Windows 未做真实运行验收。
- browser/runtime/state ownership conflicts: 消费者必须仍归同一次动作 session/target；固定 URL、多个消费者或无 URL 变化证明不得动态改写。
- replay model calls: 0。
- rejected candidates and evidence: 不删除 scope 校验、不硬编码新详情 URL。真实失败 run 1210bb38-ac4e-4ea2-8083-b2b39656bdc5 的 s-a-0028 返回首条 #9057，s-a-0029 的 ready scope 却为样本 #9050；现有选择函数只接纳 transition。
- focused validation: 真实 capability seam 对 ready 导航先红后绿，保留固定 URL/歧义/动作身份反例；更新 fork manifest，原来源离线重编译后继续独立复验及正式运行。

实测 c0f1e3f5-cd88-48e7-8edf-f26b0f4cb3b1 的日常 Chrome 首连已成功，执行到上述点击后校验失败；16 transitions / 22 browserCommands / 0 llmCalls，操作页清理确认、同任务父连接保留。该失败不能记为已通过，也不改变旧运行。

实施后验收：真实 seam 动态 ready 正例先红后绿，6 条用例逐条通过，固定 URL/多个消费者/缺少 changed/归属变化仍拒绝，点击严格一次。原 final 只读离线重编译得到同一 20 节点摘要、新模型调用 0，因此未修改草稿或旧 artifact 历史摘要。真实独立复验 e3dd159d 及本地 V5 正式运行 01987d57 均 completed，各 20 transitions / 23 browserCommands / 0 llmCalls，输出真实当前首条 #9057 而非探索 #9050，cleanup confirmed。复验到正式阶段同 Python PID69039，正式 startup 没有 sdk_connect；结束后进程退出，Chrome PID657 保持。完整证据与截图在 PROGRESS 顶部。

## 2026-09-30 同任务连续阶段连接复用实施门

Product Alignment:
- natural-language task: 继续原任务，在日常 Chrome 完成独立复验及正式执行，不反复断连授权。
- reusable chain boundary: 同任务父连接、每次操作独立页与能力；读取和表单操作同样需要。
- runtime inputs: task connectionOwnerId、独立 operation ownerId、原生端点、已确认来源。
- dynamic task outputs: 原链路输出与不可变版本不变。
- generic platform capability used: 原 Browser/SessionManager、CDP Target attach/close、TargetScope。
- replay model calls: 0；不增加模型判断或重试循环。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同任务准备/样本/复验共享一个 SDK 连接，正式结束及服务关闭断开父连接。
- existing implementation in repository: RunnerProcess 每次 start/close，AttachedWindow/TargetScope 已限定 ownedTargets；生命周期过短导致每阶段新连接。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、bubus 1.5.6；已查公开 Browser.start/stop 及 SessionManager Target.attachToTarget。
- selected implementation: 复用现有 SDK Browser、CDP 与 Scope，不引入控制器、代理或 Agent loop。
- reused public surface: Browser.start 已连接幂等；Target.createTarget/attachToTarget/closeTarget；最终 Browser.stop。
- B-A-T-owned adapter and remaining gap: 同任务独占借用、父子所有权及释放审计；每次独立页面/缓存；配置漂移拒绝；真正清理失败阻断复用。
- license/runtime/platform fit: 不增删库，原 Node/Python 运行时；真实验收仅本机 macOS，Windows 未测。
- browser/runtime/state ownership conflicts: 父任务拥有连接/进程/临时目录，execution 只拥有页及能力；释放报告明确 retainedConnection，不伪报父进程退出；最终关闭只断连接，不关用户 Chrome。
- replay model calls: 无新增。
- rejected candidates and evidence: keep_alive 不能阻止 Browser.stop 重置 CDP；不靠跳过清理、不池化不同任务、不自建 websocket 重连。
- focused validation: 真实 Runner/AttachedWindow seam 先红后绿；两 owner 一连接、独立页、最终 stop；取消、漂移及释放失败反例；随后原草稿独立复验与正式入口真实验收。

此处为实施前记录，不代表真实复用已通过。历史连接失败及业务运行保持原样，后续验收另记。

首连等待补救（真实复验 `46d6defb-20f1-4695-8773-03b3ba6093ab` 未执行节点）：复用不解决首次授权耗时。当前 pinned `CDPClient.start` 没有公开 open_timeout 入参，内部 websocket 默认 10 秒；BrowserStart handler 又硬编码 connect 15 秒，BrowserStartEvent 默认 30 秒。只延长一个外层 timeout 无效。继续复用原 SDK 的 start/connect/event bus，通过限定当前 Browser、当前本机 endpoint、首连 await 的窄适配提供有界人工确认预算；不修改安装依赖，不复制连接主体，不新增连接/重试循环。公开事件 timeout 优先复用；若需代理依赖调用点，必须版本锁定、无关调用保持原值、退出/取消 finally 恢复，并以新 seam 红绿测试核验。预算扩大只延长已有明确授权连接的等待，不增加接入对象或数据权限。

## 2026-09-30 日常 Chrome 连接入口补救

Product Alignment:
- natural-language task: 在原任务继续准备及复跑，始终复用用户日常 Chrome，不以私有 Profile 替代。
- reusable chain boundary: 任务浏览器连接与窗口所有权；页面读取和页面操作任务共用。
- runtime inputs: 本机 Chrome 原生连接、当前 ownerId、恢复租约和已确认来源。
- dynamic task outputs: 原任务结果合同不变。
- generic platform capability used: 既有 AttachedWindow / TargetScope；Chrome 原生 DevToolsActivePort。
- replay model calls: 连接与普通复跑 0；B-U 探索审计不变。
- site/task-specific code added: no

Reuse Assessment:
- capability: 附加日常浏览器，限定本次任务窗口及标签所有权。
- existing implementation in repository: RunnerProcess.startHybrid、AttachedWindow、TargetScope 已有本机 ws 连接与隔离/清理能力；缺失默认原生端点解析，准备入口未传产品 ownerId。
- mature candidates and pinned versions: 继续 browser-use 0.13.8 / cdp-use 1.4.5；核对 Chrome 官方原生连接文档和 chrome-devtools-mcp BrowserManager.ts（源 blob 699c1613f97412d73b560ec97c2cdcc238e86ccb）。
- selected implementation: 原生 DevToolsActivePort 配置读取，连接仍由现有 Browser-Use/CDP 与 AttachedWindow 承担。
- reused public surface: Chrome 用户数据根的 DevToolsActivePort；既有 Browser(cdp_url=...)；不另建 MCP 控制器或 Agent loop。
- B-A-T-owned adapter and remaining gap: 严格解析本机端点，显式连接优先；配置缺失在启动前报错，不再静默启动私有浏览器；准备/样本/正式运行传同一产品所有权。
- license/runtime/platform fit: 不增删依赖；Node fs/os/path 与原 Python 运行时；按平台解析 Chrome 标准目录，Windows/Linux 只做定点路径验证，不冒充真实验收。
- browser/runtime/state ownership conflicts: 不读取 Cookie/Profile 内容，不复制登录态，不关闭 Chrome；原 profilePath 仅作为既有任务租约元数据位置。清理只关闭 ownedTargets。
- replay model calls: 不新增。
- rejected candidates and evidence: 不使用 chrome-devtools-mcp 的私有启动默认值，也不添加其 Puppeteer 控制器；项目既有附加连接已覆盖控制/所有权需求，缺口仅配置适配。关闭遗留私有 Chromium 不再作为此任务的重试方案。
- focused validation: 三项真实 RunnerProcess seam 回归先红（静默私有启动、原生端点遗漏、显式连接覆盖）；补准备 owner 回归，接回原工作台任务做真实验证。

本机初始日常 Chrome PID657 无调试监听且原生开关关闭，API 未设置临时 BAT_UPSTREAM_BROWSER_CDP_URL；历史 Windows 成功不能证明本机配置。用户明确授权开启后，Chrome 原生界面已显示 127.0.0.1:9222，DevToolsActivePort 生成且监听仍为 PID657。官方原生连接需开关和每次连接 Allow：[Chrome 文档](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)，源码读取规则见 [BrowserManager](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/BrowserManager.ts)。同一原任务 final 与第一遍普通样本已通过，独立复验在启动阶段失败，完整验收尚未完成。

启动诊断补充：复用现有 DiagnosticChannel / fd4 / SourceLifecycleDiagnostics，而非新增控制器或重试循环。仅适配 `reserve`、`sdk_connect`、`task_target_prepare`、`task_target_focus` 固定阶段；失败因果链最多 4 层，只保留固定异常分类、精确安全码和可信源码名称/行号，不保存 SDK 消息、个人路径或页面数据。诊断先于原清理且写入失败不改变原异常，原浏览器/租约所有权不变。实际 AttachedWindow.start 与 TS 持久化 seam 先红后绿，Python 9 项与 TS 6 项通过；补齐 Runner callback 后从原草稿独立复跑，不能用后续成功改写首次连接失败的未知子因。

新复验的 SDK 连接在 10211ms 超时，未进入目标初始化；安全定位到 pinned cdp-use/client.py:277 的 websocket 握手，默认 open_timeout=10。连续阶段的原生授权重复来自 B-A-T 每次 close/handoff → Browser.stop → SDK reset → WebSocket.stop，并非 keep_alive 可以保住连接。公开 Browser.start 在已连接时跳过新连接；公开 CDP Target.attachToTarget + 原 SessionManager 可处理新任务页：先拒绝提前的未知 autoAttach，createTarget 回执后持久化 owner，再显式 attach，不信任未知 target、不重造控制器。[Target 协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl)。受控 SDK 检查 connect/stop 均为 0，未控制真实 Chrome，不当作复用已接入。最小范围是同一准备批次：单独拥有连接，运行只拥有各自任务页/能力/状态；必须明确资源所有权和 cleanup 事实，不能直接绕过 stop 或套任意跨任务池。SDK 意外掉线仍有自身重连行为，不能承诺所有场景永远无原生授权。

## 2026-09-30 原主线保存来源修复：就绪依赖与等待分类一致性

Product Alignment:
- natural-language task: 从既有浏览器任务取得第二页首条详情；先修同一失败来源，不新建替代任务。
- reusable chain boundary: 现有动作、读取、选择函数及其来源证明到同一参数化 TaskChain 的编译适配。
- runtime inputs: 已确认需求与运行输入，不固化站点字段或样本 href。
- dynamic task outputs: 按原结果合同读取的详情标题和正文。
- generic platform capability used: 已验证的读取就绪依赖保留、等待 coverage 来源校验、选择注解错误诊断，以及只含布尔值/摘要的通用焦点效果事实。
- replay model calls: 普通节点 0；不增模型重试或全局完成 judge。
- site/task-specific code added: no

Reuse Assessment:
- capability: 保存原生探索事实后形成可审计复跑图，不复制浏览器或工作流控制能力。
- existing implementation in repository: browser-use 0.13.8 原生 Agent；workflow-use 0.2.11 fork 的公开 compile_request、现有 consumer_readiness_by_action / waits_owned_by_next_target / QuickJS 校验。
- mature candidates and pinned versions: 继续使用上述锁定组件；LangGraph StateGraph 保持正式图调度所有权。
- selected implementation: 修正 B-A-T 自有来源适配，不替换外部关键库。
- reused public surface: 同一 compile_request 与既有零模型来源重编译入口；prefix/final 同一规则。
- B-A-T-owned adapter and remaining gap: a33 合法选择函数已验证，却因唯一下游就绪读 a34 被值活性裁掉而留下悬空消费者；a6 分类器已证明等待归属，独立 coverage 校验不识别同一规则。保留最小必需就绪读；可由真实物理后态或另一已保留读取证明时仍裁掉冗余探查。
- license/runtime/platform fit: 不增删依赖；browser-use 沿用 MIT、workflow-use fork 沿用 AGPL-3.0，既有 Python/TS/QuickJS 运行时不变；本轮不宣称 Windows 验收。
- browser/runtime/state ownership conflicts: 离线重编译不控制浏览器、不写历史来源；正式执行仍是原单会话、LangGraph 和 SQLite 产品事实源。
- replay model calls: 不新增。
- rejected candidates and evidence: 不以重写 Agent loop、执行器或删除安全闸门补救；ADR0005 多缺陷复评表明这些缺陷位于自有 liveness/coverage 适配，不是外部组件控制能力缺失。若原生记录无法证明动作效果，仍保留 gap，不能由本修复强行发布。
- focused validation: 原失败 cad814b6 来源无模型/无浏览器重编译；先红的跨层回归与断因果、伪归属负例，再回原任务正式入口。a35 原源码/错误细节未保存，a3/a4/a5 效果证据尚未证明，分别处理，不归因于模型。

焦点证据补充复评：现有 `Page.get_elements_by_css_selector` / `Element.get_basic_info` / `Element.evaluate` 已覆盖焦点读取，不添加 DOM 控制组件。新采集可读取固定 `:focus` backend 身份集合摘要和 target 的 `:focus-within` 布尔值，不记录输入值、页面文本或 selector 猜测。旧 TaskChain 的 `target_state` 读取默认不包含新字段；只有新来源明确含 `focused` 的条件才启用，避免改变旧发布链的严格 JSON 比较。焦点动作效果仍须真实证据，不将未变化焦点或 trusted dispatch 本身冒充效果。

## 2026-09-30 两线修复：先需求对话阻断与局部 UI，再回主线编译

用户已明确授权：在原任务修复草案网址误解析、长标题、输入区双重焦点边框，以及报错/重试分离的布局；支线验证后继续原主线，不新增替代任务。原任务 `acf401e3-caed-40d9-8c1b-5d1d753f2194` 的 revision 5/6 原始输出在正式 `parseInterviewOutput` 中都报 `interview_draft_url_unverified`；已选来源保留，入口绑定正确。唯一变量探针去掉 Markdown 反引号后均通过：原 URL 提取器把末尾反引号解析为 `%60`。标题由首条请求截取 80 字，并非模型短标题过长。修正必须保留来源白名单，不允许任意同站深链。

```text
Product Alignment:
- natural-language task: 在原需求对话恢复合法准备草案提交，清晰呈现失败、重试与输入状态；之后继续原浏览器任务编译主线。
- reusable chain boundary: 用户来源事实与 Markdown 草案 -> 确定性来源校验；对话/任务事实 -> 标题与失败操作展示。适用于页面读取与表单/内容操作任务。
- runtime inputs: 原对话、已选来源、失败输出及最新访谈轮次；不新增业务输入。
- dynamic task outputs: 原准备草案与来源引用不变；不伪造结果或运行成功。
- generic platform capability used: URL 标准化、既有来源绑定、SQLite/Drizzle 投影、共享 InteractiveTimeline/Composer、Radix 主题与控件。
- replay model calls: 普通节点 0；同任务人工触发一次需求重试沿既有模型调用，不追加模型标题或 judge。
- site/task-specific code added: no

Reuse Assessment:
- capability: 合法 Markdown URL 与来源事实适配，以及需求对话局部状态布局。
- existing implementation in repository: source-resolution.ts、ProductStore.list、AI Connect InteractiveTimeline/Composer、Radix Themes。
- mature candidates and pinned versions: 标准 URL API；AI Connect React 0.3.2 cc7d94fe；Radix Themes 3.3.0；React 19.1.1。
- selected implementation: 保留以上现有实现，不增删库；只修正文 URL 字面边界与宿主显示组合。
- reused public surface: URL.href、既有 selectedSourceFacts/preparationEntryFacts、Timeline composition/entries/actions、Radix Button/Theme。
- B-A-T-owned adapter and remaining gap: 严格来源准入与任务标题派生、失败反馈的领域组合；不实现新 Markdown 渲染器、对话框架或重试队列。
- license/runtime/platform fit: 已锁定的现有依赖与 TypeScript/浏览器 CSS；不改变许可证、Node 或 Windows 路径边界。
- browser/runtime/state ownership conflicts: 不修改来源历史、用户命名、模型设置、浏览器所有权或执行器；不新建产品任务。
- replay model calls: 普通复跑 0；重试仍是需求对话一次原有调用。
- rejected candidates and evidence: 不更换组件或加完整 Markdown 框架；此次缺口是已证实的 URL 字面边界，不是渲染能力缺失。
- focused validation: 先红后绿的草案/来源与标题回归，原失败输出零模型重放，原任务一次正式 UI 重试，深浅色与窄屏布局核验。
```

主线当前 job `4cff3311-c8fc-4fc7-8d49-46ea8db41570` 已失败，不再是执行中；B-U 已读取详情并 done，终编仍拒绝。支线通过后基于保存来源处理读取依赖剪枝、supporting wait 规则接线与注解诊断证据，不将支线通过当作主线完成。

## 2026-09-30 真实展示证据与新准备验收边界

正式参数化新任务 job `ede1384b-0e40-4fb2-8aa4-6c43888a45e0` 已验证 `ChainPresentationContent` 的真实 prefix 保存/公开投影与阶段父节点 adapter：sequence 3→46 中 `stage-d66f280c217976b3`、内部 nodeId 和 `(0,0)` 坐标稳定，prefix 无伪 terminal。42 个动作、字段读取与 done 已完成，cleanup confirmed、`activeResources=false`；但 source `44140aee-fec5-42c7-8cac-4df4c6e4166d` 的 `a-0023` 选择证据不足，最终编译拒绝。选择程序仅收到 candidates，不能直接读取需求中的运行时仓库输入，故没有把样本仓库名固化进函数来冒充泛化。正式 UI 离线 job `c46c94a8-b23a-4c78-818f-d0369bfefb1c` 在不启动浏览器的情况下复现缺口。这些事实证明展示 seam 与资源闭合，不证明新任务 final 成功；本轮保持编译语义不变。

V4 正式新 execution `b3c37d38-dca4-4d9b-89eb-6f1a81848225` 以 19 transitions / 22 browserCommands / 0 llmCalls 完成且清理确认。Workbench 真实显示 8 个父阶段、内部动作与动作说明；节点输出缺少持久化事实时显示“本次节点输出未记录”，结果区按精确合同呈现标题/正文单条记录。这核验了现有发布链与本次展示改动的兼容，尚不能证明新的 final build 与 draft 保存内容相同。

真实重新准备暴露了画布身份边界：仅以 task/step 作为 React Flow key，会把旧发布链视口沿用到新的首个 prefix，首阶段被裁出画面。修正仅在新的 authoring job 首个 build 改变画布身份，并将该身份保留到同批 final、草稿和运行；build sequence、展开、主题与运行状态都不参与 key。复用 React 的现有组件身份与 React Flow 首次 fitView，不添加布局器或自动重试；6 项所属回归、Workbench typecheck 和真实 prefix 可见性通过。新增 Hook 热更新的开发页面在重载后恢复，后端探索未受影响。键盘详情、主题和窄屏下方面板已有真实 UI 证据，触屏硬件与 reduced-motion 的现场行为仍未单独测试。

2026-09-30 的正式新准备 job `4cff3311-c8fc-4fc7-8d49-46ea8db41570` 继续使用已确认无输入需求，观察到了 navigate/wait 两阶段 prefix 的稳定身份、归属和布局；当前尚无 final/draft/validation。完整验收结论须等该新记录实际闭环，不能用旧 V4、离线重编译或截图替代。

## 2026-09-29 准备期阶段嵌套与结果展示：现有能力足够，缺口在投影接线

本节最初是[准备期阶段嵌套画布、节点详情与结果展示开发方案](PREPARATION_STAGE_NESTED_WORKBENCH_20260929.md)的只读证据摘要；后续实施已验证原选型成立。产品代码只在既有 contracts/API presentation seam、Workbench React Flow adapter、详情和结果 renderer 内接线，没有新增依赖、数据库表、模型字段、浏览器动作、Agent loop、调度器或运行状态。聚焦回归、三个 workspace 类型检查与 Workbench production build 已通过；真实 Workbench 新任务和浏览器验收仍未执行。

- `hybrid-prefix-schema.ts` 明确不含完整入口、终点、output assembly 和 result binding；但 `hybrid-prefix-materializer.ts` 已只返回当前依赖闭合的真实 nodes/edges。因此准备期可以画真实局部阶段，不能画假完成、假终点或假结果。
- 实施前 `AuthoringBuild.accept` 已在每次 prefix/final checkpoint 保存 build，而 `TaskAuthoringActivity.build` 只有 nodes/edges。现已在同一保存屏障复用 `ChainPresentationContent`，没有让 React 根据 label、URL 或动作数量临时猜分组。
- `createStepChainPresentation` 已在完整候选链形成后、草稿和样本复跑前创建正式 presentation。最终阶段视图不需要等待样本或独立复验结束；需要的是 final build 与草稿 presentation 的覆盖、身份和布局一致性门。
- 实施前 `ChainCanvasGraph` 对准备 build 使用 LR Dagre 把每个动作画成 240×112 顶层节点，并只为多节点阶段画容器；这同时造成准备期横向长链和单/多动作两套层级语法。现已仅把阶段作为 React Flow 节点，仍只复用 React Flow、Dagre 和现有 ChainPresentation，没有引入 FlowGram、ELK 或第二张执行图。
- 既有结果合同已经区分 `payload.mode = execution|data`，`TaskOutput.kind = value|artifact`，值 schema 可区分 object、array 和标量。实施前 Workbench 只用 `ResultValue` 递归展示 JSON；现已按原合同选择 renderer，没有增加网站、Issue、商品或“报告类型” special case。
- 交互原型只验证“阶段父节点 + 动作列表 + 阶段间连线 + 独立结果区”的结构。视觉必须使用现有 Workbench/Radix 主题 token，不复制原型的颜色、尺寸或装饰。

复用结论：保持不新增关键依赖、数据库表、模型字段、浏览器动作、Agent loop、调度器或运行状态；API 现已拥有 prefix/final 阶段投影、公开降级和 final chain digest 一致性门，Workbench 只负责 React Flow adapter、选择、详情和结果渲染。实现前的 flat build 红灯已精确命中旧行为；最终聚焦证据为 contracts 12/12、API 16/16、Workbench 29/29。上述属于受控静态/行为证据，不替代 P4 真实任务验收。

## 2026-09-29 延迟导航 supporting wait 误拒绝：定因、修正与真实验收

旧 job `8c036479-d914-4671-868c-492e7dd063d3` 在 sequence 13 被宿主拒绝，artifact `4677984b-1e03-4c13-87cb-5c42160ba4fe`。保存证据表明 `a-0010` 点击 Issues 已派发；其即时 post `o-0020` 仍是旧仓库 URL，紧邻 `a-0011` 是成功的 `bounded_postcondition_wait/v1`，pre/post `o-0021/o-0022` 已在同一新 Issues URL 和同一 tab/document 稳定，随后 `a-0012` 正常读取 Next 候选。旧 `hybrid-runtime-scope` 只接受动作 post 与 supporting wait pre 同 URL，因而产生 `runtime_scope_supporting_wait_discontinuous`，再被投影成 `hybrid_consumer_readiness_boundary_unproven` / `hybrid_compilation_host_rejected`。旧运行 12 次模型调用均 completed；模型、选择结果和页面读取不是本次根因。

修正仍复用 workflow-use 已保存的 delayed postcondition coverage：只有 wait 类型/结果、相邻 observation sequence、同 tab、单调时间和 settle 上限、稳定新 URL、唯一 changed URL 后置条件、clauseRef、coverage 与 proofRefs 全部吻合时，才把 wait post 作为前驱动作的完成观察；普通同 URL supporting wait 仍先走原逻辑。消费者 readiness 复用同一次 scope 决策检查 URL 变化。任一顺序、时限、tab、URL 稳定、coverage 或引用被破坏时继续拒绝；没有新增依赖、浏览器动作、模型调用、重试或站点特例。

定点证据：真实形状回归先红，旧代码返回 `runtime_scope_supporting_wait_discontinuous`；修正后 `hybrid-read-scope.test.ts` 与 `consumer-readiness.test.ts` 合计 14/14，API package check 通过。原 rejected artifact 经正式 `materializeHybridPrefix` 只读重放为 12 节点/11 连线并保留消费者，未调用模型、浏览器或写数据库。

真实验收不是离线探针：新 job `31290e49-0ed3-4ce7-80d3-844764eff7e3` 跨过原 sequence 13，B-U 26 次 provider invocation 全部完成，final sequence 25、19 节点/18 连线。样本 `9ffd8c7b-c43e-4365-88bd-f9334f55a61f` 与独立复验 `e83d25cd-3e89-47a5-831a-dab6d767163a` 各为 19 transitions / 22 browserCommands / 0 llmCalls，cleanup confirmed；发布 Release V4 `eb5409ff-e3d1-4539-8c0b-6818b485a798` 后，正式 execution `52d8ccaa-1347-47ad-8f1b-b3dcc48a7c1f` 同样完成并返回 #9046 标题与正文，cleanup confirmed，精确 Profile 检查无残留。工作台可见 V4、运行完成和 8 个阶段。

剩余边界单列：其它普通编译 proof gap 是否允许 B-U 继续仍需 sequence/ACK 安全分类，不能因此吞掉来源损坏、越权或保存失败；工作台重试按钮无即时反馈和阶段标签/横向布局仍待定位；历史 V2 首败及旧启动/模型失败的底层原因不可恢复。上述缺口不推翻当前 V4 正式运行通过，也不能被本次通过冒充已解决。

## 2026-09-29 历史研究记录：已保存失败来源驱动的最小收尾修复

真实收尾证据：6320f07d准备→在线final→样本795d23f1→复验ed19a4e9→本地V2发布均完成；后续正式cff34d1b完成24节点/32浏览器命令/模型0，标题正文已保存。V2正式首跑d3959bd6在首页搜索按钮的target_state条件失败仍未定因：新临时profile和原正式profile经同一Runner/ManagedWindow执行保存的前两步均为单次trusted点击、aria-expanded false→true；源码证实锁定Mouse.click按下/释放坐标相同，不是up(0,0)。后续正式运行仅加固定布尔诊断，没有改规则，成功不能证明该首败已修。诊断插桩已删除、摘要恢复，既有状态条件保留，不再无证据叠加补丁。历史06dc启动与ae44模型底层错误缺证据，亦不列为已修。

同一准备9c8012df的B-U完成40动作、final41、26节点；样本96f87a0e在s-a-0022滚动后失败。原规则仅凭非navigation effect即要求后续读取值变化；滚动位置已经变化，但分页链接值可以完全相同，导致无意义等待30秒。删除这个按动作大类的推断：只有当前动作之前、未跨其它页面动作的同一已验证读取，与后态投影确实不同，才生成transition；否则生成ready。原URL/滚动位置/控件后置校验、字段schema和稳定读取保留。该规则同时适用于滚动到控件与点击已显示区域，不是网站特例；有实际前后数据变化证据的列表更新继续要求变化。prefix/final仍共用同一编译器，无新模型字段/次数/重派；TS同样核验ready与transition的真实来源。原失败source与草稿不改写。

ebb69527在搜索页确认仓库存在后，done(false)明确以“没有可点击索引且不能使用查询序号/样本href”为原因提前结束，7动作、无编译gap。现只澄清已有系统提示：find_elements不承诺点击索引，缺索引应先使用原生wait/scroll/search_page刷新或露出目标，再按新状态点击；不能仅凭查询输出没索引就判任务不可能。保留用户路径、原生done(false)、原生预算和错误处理，不添加宿主补问/重试/强制成功，也不虚构索引。此为模型指引修正，不是已证明解决所有模型提前放弃；只能由后续真实运行验证。

真实正式复跑 702b3b12 在 s-a-0024 的 `[0, attribute_href]` 绑定失败；样本与独立复验均成功，因此它们不能证明稳定性。已发布 IR 的 s-a-0023 允许空数组/缺 href，其前驱 readiness 也使用同一宽合同：旧页面 scope 不符时 baselineUnavailable=true，新页面连续空读取也可判成功。该漏洞可独立复现；本次失败未保留节点原始输出，不能声称已区分空数组与缺 href。

最小修复继续共用原编译/物化、字段读取和 Tenacity settle：仅当读取成功后**直接、无条件**进入消费它的能力节点时，将已验证的 ValueBinding 精确路径交给运行读取与对应 readiness。条件分支和整体列表绑定不收紧，不改变用户允许的空结果语义，不依据样本条数或内容猜阈值，不增加模型字段、等待秒数、重派动作或校验循环。requiredPaths 仅由物化器从已有绑定生成，不进入 ReadSpec 或 B-U 工具输入。原始事实、已发布 V1 和失败运行保留；新来源经同一 prefix/final 物化规则生成新版本，不能手工修改 V1 冒充修复。

初版 minItems/items.required 已撤换：实际只绑定第一项 href 时，其它项缺少该可选字段仍应通过；真实读取器反例先红后绿。保留原宽输出 schema，用精确路径存在性检查覆盖空数组/缺字段；未使用的其它行不受影响。普通节点仍无模型，既有 settle 只重读、不重派动作。

沿用下方 Product Alignment / Reuse Assessment，不增删库、模型或运行器。983c259d 的真实路径是动作→原生 wait→正式读取；原 scope 分类已正确保留 wait，但 consumer readiness 又强制直接前驱必须是动作，导致误拒绝。该历史修正仅允许沿现有成功边跨过有同 tab/URL 证据的原生 wait；跨 URL 的严格 bounded navigation wait 是本文件顶部随后增加并由 V4 验收的独立分支。跨 tab、断边与隐藏动作仍拒绝。普通复跑模型 0。

同批修正只作用于新任务：完整 final 收到并核验后将失败归在编译阶段；失败生成快照不得遮住已有草稿/发布链路，无链路时仍显示失败片段。另核对 prefix/final 的先前读取绑定是否受空业务输出影响；只有复现后才改。源码清单只更新本次实际修改文件的摘要，保留旧来源和失败历史。验证依次为已保存真实来源纯编译、所属边界回归、正式工作台新准备及普通复跑；前两者不冒充真实主线完成。

## 2026-09-28 减少模型交互与探索/编译断流修正（实施中）

2026-09-29 编译闸门减法（同一 Product Alignment）：983c259d 完成45个实际动作并读取详情，final 因 repeated_operation_reuse_unproven（两次原生wait）与 natural_empty_list_control_required（唯一下一页读取的数组索引绑定）拒绝。不是本次读到了空列表。原 rejected artifact 5269971b-c5fa-4b0e-8a02-6d1dcbe736ab 在无模型、无浏览器的正式重编译入口精确复现。删除仅按操作摘要相同推断业务循环的全局闸门，保留已声明 repeat_method/fold 和输入批量边界；相同等待/控件操作不等于重复处理N个业务输入。未声明空列表成功分支时，不替用户强造该业务行为，也不要求额外LLM/字段；既有 ValueBinding.readPath 在数据不足时抛 binding_path_missing，正常运行失败而非伪造空结果成功。已声明的 edgeCases 继续完整验证、生成原分支。两个最小生产编译回归均已先红，修正后还须回放原失败产物并走真实链路。

2026-09-29 同一来源过滤边界修正：job 62ab4bbe 的 B-U 正常完成41步，最终主机因 hybrid_consumer_readiness_boundary_unproven 拒绝（artifact 71170a11-7e53-4750-8508-866bbdbbbd63）。正式物化入口只读重放精确复现：未派发 a-0016/18 的原生历史有 URL/tab 与 dispatch entered=false，却没有尚未完成的额外 url_digest 采集；Python 已按未派发排除，TS scope 又要求该缺失事实。同一 Product Alignment 下仅调整自有 IR 来源适配：已证明未派发且没有完整现场 URL fact 的提议，只核对原生 URL/tab 元数据，不补造事实；有 URL fact 时仍核验，后继实际观察仍核验连续性。复用现有派发审计与分类器，不增加模型、依赖或恢复循环；原拒绝来源保持不变。

2026-09-29 延续同一 Product Alignment / Reuse Assessment：job 978a9267 点击 Issues 成功后，step10 尚未生成动作时，观察前后同一 target/document 的 URL 正常从仓库转到 Issues，被自有 scope 判为 observation_changed_during_capture 并 stop。source 99f77362-ac91-4598-8e8c-8ca81c46f91f 已关闭；9步8节点、重复事实0，不是原生模型或函数失败。修正同一受控 tab 的 URL/文档过渡：模型观察不交付混合快照，旧提议不派发，通过已有 ObservationRefreshRequired 回到原生 Agent.step 错误处理；动作后仍用已有 snapshot settle。tab/session 归属变化、读取身份失败、持久化失败继续停止。没有新增重试循环、字段、模型调用或上限。反例同时复现正常过渡误停和动作后归属变化误放；14项所属 scope/只读刷新/CDP读取检查通过，真实主线仍待验证。

在线选择接线补齐（沿用本节 Product Alignment / Reuse Assessment）：job d741b45e 已由原生 B-U 完成详情读取与 done；分页读 a-0014 的12条结果中，页码2与 Next 是同一 href，a-0015 navigate 因普通值绑定要求唯一路径而缺口。final 又移除未消费读取，连带使 a-0010 readiness 与其 Function 消费者不完整。只复用现有 selection annotation / FunctionDraft / QuickJS / ValueBinding：必要的动态导航同样按实际动作生成一个源码，输出候选 href，由原导航节点消费；不放宽唯一路径规则，不固化样本 URL，不添 Agent loop 或编译修复轮。输入/输出 schema 与绑定仍由动作和真实读取决定，模型响应仍只有 source。此属补齐既有通用能力，可用于分页控件和目录/搜索结果导航；无新库、无新运行器、普通复跑模型0。

同一 Product Alignment 下补齐原生错误恢复边界：真实 job d4b34548-c296-496c-8fb5-58587ab70ce6 的 a-0006 提议点击 index4771，尚未进入 Tools.act，因 B-A-T 将 `observation_target_index_unavailable` 判为来源破坏而 stop；此前5步在线保存、重复事实0。沿用已有 ObservationRefreshRequired 让同一已核验文档上的无效索引回到原生 step 错误处理，不另建重试/加次数/重新选目标；未派发审计保留，实际文档身份变化和保存失败仍拒绝。此修复必须先覆盖真实 callback → collector → scope → after_step 边界，再继续原任务，不能以局部验证宣布全链通过。

真实修正过程保留：job 387ad9bb-9ef6-4da1-84b9-531875872e0f 已在线生成选择函数并到达 Issues，但查询分页链接反复进行。原 a-0029/30/35 查询均有11条实际结果，原生 MessageManager 因 long_term_memory 优先而不交付 extracted_content。此次删除整个 enrichment 连必要结果交付也删掉了，属本轮减法错误；主动取消该轮并确认 browser busy/cleanup=false，不把取消算成功。修复只用原生 include_extracted_content_only_once 交付原生查询原文，不再添加 DOM 查询/祖先/额外摘要。原生 search_page 使用同样结果合同，也应一起交付，避免只修一个工具。

原候选集合检查还额外要求同位置元素 class 完全相等，会把 selected/visited 等样式差异当作集合不成立。删掉这层猜测：复用已验证 CSS 查询的实际 backend 成员以及原 DOM 树，要求全部命中属于同一重复条目组、每项至多一个命中；仍拒绝跨组和一项多个目标。复用既有 _walk_structural，不加选择器或语义打分；纯结构反例与原同组/跨组测试负责此边界，不能冒充真实 GitHub 全链通过。

```text
Product Alignment:
- natural-language task: 保留用户指定入口与动作顺序，在原生探索中生成可复跑节点。
- reusable chain boundary: 原生动作与现场证据 → 在线编译 → 同一持久化草稿；适用于列表导航与表单/控件操作。
- runtime inputs: 确认输入及运行时 DOM 候选；不固定样本身份。
- dynamic task outputs: 保留原字段读取与输出绑定。
- generic platform capability used: B-U 原生回调/重试、现有 selection annotation、QuickJS、前缀编译及 ACK。
- replay model calls: 普通节点 0；删除完成 judge，必要的选择函数按实际动作生成一次。
- site/task-specific code added: no
```

不增删关键依赖、不重造 Agent loop/选择器/执行器。当前失败 a-0039..43 来自逆序伪反例；随后潜在的完成审查仅已有观察就达 278452 字节，超过自己的 256000 上限（该次真实任务未到此阶段）。删除审查而非提高预算。

删除探索模型的 `bat_validate_selection` 前置任务；复用既有选择注解到在线回调，只让模型返回源码或 null，不要求 outcome/reason/examples。真实动作 ordinal 是检查样例，输入/schema/节点/连线全部由代码组装。唯一控件继续复用已证明单例的确定性保护。按动作来源键保留一次生成结果，包括失败；最终编译不重复请求。原 `bat_read_fields` 与人工接管保留：前者提供零模型复跑的字段方法，后者处理登录/验证码/访问限制。

普通前缀缺口记录并继续原生探索；不再在下一动作前用未完成的编译依赖拦截动作。最终有缺口仍不得发布或伪称成功。来源保存/身份/权限失败仍停止。模型或函数失败不生成替代节点、不自动重放动作、不新建重试队列。在线片段不是已发布链路；历史失败来源保持不变。

撤回上一小节“给 B-U 注入祖先结构”的修补：原生模型上下文不再由 action adapter 增加 DOM 祖先或压缩候选；结构证据仍由现有 collector 在 B-A-T 内部采集。下列旧记录是历史决策，凡与本节冲突均已被本节替代。

## 2026-09-28 删除逆序伪反例，保留在线节点主线

Product Alignment：同一确认任务在 B-U 实际动作后在线生成节点；选择输入来自原 DOM 顺序读取，输出仍绑定原 ordinal，复跑普通节点模型 0，不新增网站代码。保留原采集/前缀编译/持久化/画布/样本验证，不退回仅探索或结束后临时补节点。

真实 job `e50ab706-4f6d-422b-825e-e17945e00ee3` 到达第二页，a-0038 返回 ordinal 1..25。a-0039 的 `return candidates[0].ordinal` 用原 QuickJS 执行成功返回 1；同一程序仅因 B-A-T 追加逆序输入被拒绝为 actual25/expected1，随后五次拒绝后 B-U 失败退出。删除这项与读取器 DOM 顺序合同冲突的校验及“输入可能无序”提示，不更换函数实现或放宽真实 ordinal/来源检查。

另外，原 a-0009 结果有标题父级 h3 的结构，但只在 extracted_content；long_term_memory 没有 ancestry 且 include_extracted_content_only_once=false。锁定 Browser-Use 的 MessageManager 优先 memory，因而模型收不到这部分已采证据。复用原 ActionResult 的一次性读取字段来交付既有详情，不另建工具、选择器或 Agent 循环；以真实保存结果经过原 MessageManager 验证，不将仅原始输出中存在信息当成模型已收到。

## 2026-09-28 撤掉与任务规则冲突的选择校验

同一边界补齐空集合反馈：job `82bdbd3b-6d9b-480d-8c7a-5ac36a39dec6` 的原始五次选择请求都绑定到最新空读取，不是函数语法错。原工具现在在 HTTP 校验前明确要求纠正页面查询，不能跳回较早非空读取。保存来源重放五次均返回 `selection_candidates_empty`、HTTP 0；新增针对“旧非空/新空”组合的回归先红后绿。它只证明反馈归因修正，不证明 B-U 会正确恢复，也不替代完整任务验收。

```text
Product Alignment:
- natural-language task: 按确认规则选择条目，包括始终选择第一项或固定页码。
- reusable chain boundary: 真实 DOM 读取 → 需求规则对应的纯函数 → 原始 ordinal 绑定 → 点击。
- runtime inputs: 当前真实候选；不固化样本标题、URL 或临时元素编号。
- dynamic task outputs: 同版任务输出不变。
- generic platform capability used: 原生 B-U 选择工具、原 QuickJS 执行和既有 Function 物化。
- replay model calls: 0；不新增模型、语义裁判或重试流程。
- site/task-specific code added: no
```

上一轮“强制变化、单例另开例外”应删除，不继续堆例外。序号固定不等于写死样本；用户要求第一项时，各个合法输入都返回 1 才正确。额外示例改为可选辅助验证，不以数量、内容变化或序号变化充当语义证明。已有大小上限仅作资源保护，不能解释为正确性门槛。仍保留真实候选执行、schema/ordinal 归属、原始顺序身份检查、QuickJS 沙箱、需求/读取来源绑定及提供示例的实际断言。

沿用已验证来源事实幂等修正，不加大 8MB/超时预算。当前 500 动作合成来源测试不覆盖真实多步采集，不能用于宣布真实采集容量已通过。先让已保存反例经过正式校验入口，再进入实际任务；历史失败不改写。

唯一控件复用原 `unique_query_target` 的同文档/完整查询/单项双读证明，不再要求 B-U 编造业务选择算法。系统派生一个使用既有 Function/QuickJS 的唯一性保护（输入长度必须为 1，否则抛错），随原 `selection_function` 来源进入同一编译器；多项候选仍由需求对应的模型程序决定，已有已验证规则优先，不能以唯一性保护覆盖冲突规则。无新增公共类型、选择器或执行器。原失败 source `d3ee8809-04ca-4aa2-8528-745b0726191d` 的 a-0030 已在内存副本经真实准备准入、attach、编译、TS 物化与 QuickJS 执行：无 gap、返回 1；加入第二候选即失败。该核查不修改 SQLite，也不冒充实际浏览器复跑。

## 2026-09-28 点击前选择证据与在线编译统一

同需求重跑又暴露两个独立不变量：`maxItems=1` 的集合合同不允许任何合法的数量/ordinal 变化，却仍强制这种变化；在线归档重复调用 `SourceObservationScope.attach` 把同一个诊断追加多次。真实 32 动作来源有 2611 个同观察同 ID 重复事实，最终检查点触发 `hybrid_compilation_payload_limit`（不是 selection gap）。仍沿用上面 Product Alignment：前者只在合同本身严格限单例时验证不同内容而非不可能的序号变化；普通集合变化检查不放宽，运行读取超上限仍拒绝。后者复用现有事实 ID 去重/冲突拒绝语义，不提高 8MB 上限、不裁掉真实诊断、不修改旧来源。

```text
Product Alignment:
- natural-language task: 按确认步骤探索，成功动作当场具备节点编译证据。
- reusable chain boundary: 完整候选读取、规则校验、点击、在线编译；适用于导航控件与业务列表。
- runtime inputs: 当前候选和同版确认规则。
- dynamic task outputs: 原任务输出不变。
- generic platform capability used: 原 PreparedSelections、QuickJS 校验与 selection_function 事实。
- replay model calls: 0；沿用固定 Function 节点。
- site/task-specific code added: no
```

最小修正删除“完整单例直接放行”例外，所有已有 queryCandidate/readActionRef 的集合点击均要求匹配已验证规则，并在派发前记录。已有规则不再被提前返回丢弃；未校验时使用原 SelectionMethodRequired 让原生 Agent 在现场补齐，不新建重试循环。重复推进最终虽由 repeat 编译拥有，探索期间仍遵守相同点击准入，避免在 repeat 证据尚未闭合的在线前缀中漏掉节点证据。不改编译准入、不伪造历史规则。旧失败来源仍缺事实，不能靠重新编译将它变成成功。

复用当前锁定的原生 B-U Tools 注册和原 QuickJS 校验，无增删依赖、无新执行器或选择器。定点回归覆盖单例已有/缺失规则、规则 ordinal 不匹配，以及记录进入原 attach/编译路径；随后继续相同已确认真实任务。

## 2026-09-28 拼写提示与搜索结论边界

```text
Product Alignment:
- natural-language task: 保留用户路径；有证据时提示疑似拼写差异，搜索未命中时只报告实际查过的范围。
- reusable chain boundary: 同一需求确认版本到 B-U；用户明确纠正只替换对应输入。
- runtime inputs: 同版草案声明的输入，不引入自动改词。
- dynamic task outputs: 原输出字段不变；失败说明区分本次未找到与目标不存在。
- generic platform capability used: 现有访谈 Skill、原始用户消息、B-U 任务提示。
- replay model calls: 普通节点 0；不新增纠错模型、词典、循环或门槛。
- site/task-specific code added: no
```

仅修改现有提示和交接回归，不引入或替换基础设施。拼写识别为增强能力，不是主流程必过门；发现时说明原词、候选拼写与实际依据，未经用户明确纠正不静默替换，更不能借此绕过指定入口或步骤。未发现时如实保留尝试和范围，不能从局部未命中推断全站无结果或目标不存在。

本轮用户已授权把实际测试词改为 `LangGraph` 并重跑：通过原任务需求对话提交明确纠正，形成新版本，保留旧失败。只执行所属交接测试和该真实任务，不跑全量测试，不用手写节点或修改数据库代替正式入口。

### 正确任务实跑暴露的独立阻塞（未修）

job `aedbccd5-877f-4cb6-8009-5153ac4e7771` 到达 Issues 后停止，保存前缀 sequence32：a-0030 是成功的唯一 Issues 控件点击，a-0031 已读到分页链接；唯一编译 gap 是 `selection_function_evidence_required`。不是找不到仓库，也不是保存服务故障。

诊断复现使用只读 SQLite 中该 job 的 `authoring.build.payload.canonicalRequest`，按 `NaturalCompilationRequest` 解析；由正式 `output_model_for(schema, 'HybridAgentOutput')` 与 `author_tools_for_result_spec(model, request.plan.resultSpec, selection_methods=True)` 创建同一 ActionRegistry，先断言 `registry.schemaDigest == request.actionRegistryVersion`，再调用 `compile_natural_prefix(request, registry, output_schema=schema)`。输出与已保存 `response.compilation.gaps` 完全相等，断言无 gap 稳定失败：`real_online_prefix_not_replayable`。只运行纯编译，不创建 Browser/Agent、不调用模型、不改产品数据库。

进一步缩小至真实 a-0030 的 pre-observation、此前 verified read 与 `PreparedSelections.before_dispatch`：当前 query 为 `nav a#issues-tab`，候选完整且仅 1 项，`uniqueQueryBypass=true`。即使内存中提供匹配规则记录，`selectionRecordedAfterBeforeDispatch=0`；真实 trace 对该动作的 `selection_function` 事实也为 0。对应源码 `selection_tool.py:122-123` 提前返回与 `natural_selection.py:61-65` 强制要求事实不一致。该探针的内存记录只验证提前返回，不补写来源、不冒充真实工具成功记录。后续必须统一唯一控件与集合选择的准入合同，不靠换搜索词、改网站步骤或重开探索碰运气。

## 2026-09-28 需求明确程度修正（实施中）

```text
Product Alignment:
- natural-language task: 保留用户明确的起点、字面输入、步骤及顺序；仅澄清尚未授权的重要业务取舍。
- reusable chain boundary: 同一确认草案到 B-U，不新增计划或执行图。
- runtime inputs: 同版草案声明的业务输入。
- dynamic task outputs: 同版草案声明的输出字段；不冻结搜索所得内容。
- generic platform capability used: Pi 只读工具、来源引用、公共 Question、Markdown 草案、确认事实。
- replay model calls: 普通节点 0；不改探索或运行循环。
- site/task-specific code added: no

Reuse Assessment:
- capability: 区分来源事实与待决选择，并保留原始用户要求到准备阶段。
- existing implementation in repository: createSourceResolutionTools、projectProvidedDraftSources、InterviewCoordinator、syncConfirmedRequirement、browserUseTask。
- mature candidates and pinned versions: 当前锁定的 AI Connect 0.3.2 / Pi AgentSession 0.1.0 / Zod 4.1.8；不换库。
- selected implementation: 扩展现有候选提交工具，允许确无待决或明确委托时随同草案确认；原始用户消息作为同版确认事实传递。
- reused public surface: MainModelTool、现有 authoring parser / Question projector、原事务和 schema。
- B-A-T-owned adapter and remaining gap: 宿主只核对搜索 ID、候选引用、唯一候选与同版草案；明确程度由访谈模型按完整上下文判断。
- license/runtime/platform fit: 不新增依赖、后台服务或平台特例。
- browser/runtime/state ownership conflicts: 不启动第二浏览器；旧轮次/来源保留，新事实随成功轮次提交。
- replay model calls: 0；没有额外语义审核模型。
- rejected candidates and evidence: 原工具对唯一候选一律生成 Question，且原始要求未进入 B-U；不能仅修改措辞或按关键词自动选站。
- focused validation: 明确/模糊/混合/委托的交接回归、引用与确认门、API 类型检查；之后继续原 GitHub 真实任务。
```

已复现旧门允许以仓库深链替换用户指定首页路径，且首页缺引用时反而拒绝。此为内存诊断，不是 B-U 已执行绕路的证据。真实任务尚停在来源题板；本轮保留原历史，修改后继续同一任务。

实施核查补充：来源 URL 已包含确定的协议与主机，因此其无查询根首页可沿同一 resolutionId 追溯；确认门和计划投影共用 `sourceSupportsEntry`。这不是“同站任意 URL 放行”，未引用路径、查询、子域名和协议改变均拒绝。真实第 3 轮草案已保留完整路径，但被旧 exact-URL 门拒绝，此项修正后才继续原轮次。夹具进一步发现原数据库把所有搜索来源强制关联 Question，现仅为 status=open、唯一且成功搜索带 searchId 的候选允许无题板；确认时才选中。新能力没有另起来源语义判断器或计划模型。

## 2026-09-28 在线生成实施：共用规则与保存屏障已接通

承接下方复用评估，依赖与所有权不变：不增加库、Agent loop、浏览器、选择器、队列、表或调度器。B-A-T 新增部分仅承担前缀/完整准入适配、原 fd3/stdin 检查点确认、现有 job 保存与工作区投影。完整编译继续使用原读取活性/消费者重绑/重复折叠；普通运行仍使用原 LangGraph 路径。

实现入口：`natural_compile_actions.py` 为 prefix/final 共用分类；`capture_snapshot.py` 生成不修改原事实的快照；`author_compilation.py` 由原回调驱动；`compilation_control.py` 与 `hybrid-compilation-checkpoint.ts` 实现单批确认；`authoring-build.ts` 核对版本/来源、物化并保存。TS 共用物化拆至 `hybrid-materializer-{source,nodes}.ts`，完整与前缀没有分别维护节点转换规则。快照公开投影不包含 canonical 来源或原模型 history；正式新任务缺在线最终结果时明确失败，原离线重新编译只供显式操作。

### 实施验证及范围

- `online-compilation.test.ts` 从真实 TaskChainAuthoringService 进入原 Python 请求循环和 fd3/stdin，再回 TS 校验、SQLite、候选/原 TaskChainRuntime。普通执行返回不同于探索夹具的新读取值，模型调用为 0；离线补编译 stub 被调用即失败。浏览器动作/模型来源是夹具，不是真实网站，不能证明真实首次探索完成。另验证重复包只有一次保存/ACK、冲突拒绝、保存失败保留前有效快照、异步验证期间取消不覆盖状态、人工恢复先保存 running 再接受下一包、业务歧义回原确认入口。
- Python 编译/采集/回调与 ACK 定点测试保护：原始来源不变、派生事实不重复、无动作 LLM 错误允许原生重试、前缀不伪造终态、消费者/重复依赖严格分类、已派发失败不串接假后态、取消/超时不重发动作。TS 前缀/完整身份、来源、QuickJS、数字词法与原最终关闭/显式离线恢复检查通过。
- 最小 UI 只复用现有卡片/详情与一句状态；`chain-build-projection` 及原只读组件测试共 6 项通过，保护不伪造终点/运行、生成图只读、无草稿时仍有原人工/失败入口。生成片段仅在 preexecuting/compiling 投影，样本/独立验证由正式草稿与本次运行接管，此阶段交接有生产投影验证。API/Workbench package check 通过；真实挂载后的视口/选中保持和刷新尚未测。
- `hybrid-prefix-budget.test.ts` 实际调用 Python 和宿主：500 读取动作、1000 观察，5,610,341-byte 整包；Python 677.7ms，宿主物化 425.6ms；500 节点/499 边。在该形状下低于 8MB/10 秒余量。Function 预算另有包含逆序样例的两端用例，不把全读取性能外推到极端字段/Function 组合、所有平台或浏览器耗时。
- `LOCAL-CHANGES.json` 按实际变动逐项更新，来源校验通过，fork 摘要 `4411251ab85b6f6564728ebccbdfaecf1ec912bca21efad7a39dd8db433aadcd`。没有关闭来源校验、扫描 node_modules、改模型路由或相邻项目。

首次失败及对应处置：共享代码抽取时 TS 类型遗漏在类型检查中修正；UUID 测试改用生产 JSON 入口、方法夹具改回原输出 schema；prefix 的计划身份改为完整入口使用的原 canonical 计划，不采用 Zod 补默认值后的副本；跨进程测试发现 ACK/下一检查点同批到达时旧槽未释放，现为发送 ACK 前释放且旧 finally 只清自己的槽。收尾检查修正生成片段遮住验证阶段草稿的投影范围；新增工作台 SSR 夹具首次遗漏生产 Theme，补同一提供者后验证。unittest 类名和 `typecheck` 脚本名输入错误均属发现阶段失败，改用实际类名/`check` 后通过。以上没有靠新增模型重试、放宽来源或自动离线回退取得通过。

下列为已执行定点入口的复现索引，不要求每次重跑全部：

```sh
# workdir 必须为当前实际 checkout 根目录；不是根级/全量测试。
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-prefix.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/online-compilation.test.ts tests/hybrid-selection.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-prefix-budget.test.ts
npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-authoring-final-close.test.ts tests/preparation-offline-compilation.test.ts
npm exec --workspace @browser-capture/api -- tsx --test --test-name-pattern='保留数字词法' tests/hybrid-offline-annotation.test.ts
npm exec --workspace @browser-capture/workbench -- tsx --test tests/chain-build-projection.test.ts tests/chain-canvas-readonly.test.ts
npm run check --workspace @browser-capture/api
npm run check --workspace @browser-capture/workbench
```

Python 使用受管 `work/upstream-browser-hybrid/.venv/bin/python -m unittest -v`，`PYTHONDONTWRITEBYTECODE=1`、`ANONYMIZED_TELEMETRY=false`、`BROWSER_USE_CLOUD_SYNC=false`；`PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests`，覆盖 `test_method_source_compile`、`test_natural_prefix`、`test_capture_prefix`、`test_author_compilation`、`test_author_callback_stop`；ACK 测试入口为 `apps/api/tests/test_compilation_control.py`。原 liveness/repeat/readiness 只运行受影响方法，未运行完整目录。

**验收未闭合：** 本轮没有启动产品服务/真实浏览器/模型或真实网站任务；真实新任务从需求到首次复跑、mounted UI、Windows、极端多 Function/字节前缀仍待验证。原 D6 和正式自动转人工等旧缺口不因此消失。后续真实任务必须保留第一次结果和失败，不把同任务修补后的成功计为首次通过。

## 2026-09-28 在线生成文档修订：来源不变，生成快照可更新

开发入口：[边执行边生成节点最小方案](INCREMENTAL_NODE_COMPILATION_20260928.md)。旧文档把“事实不可变”误加成“生成节点全部字段永久冻结”，与现有 `rebind_consumer_readiness`、读取活性裁剪、repeat 折叠及 TS scope/准备动作物化冲突。现已明确采用每步确定性重算有限前缀、整体保存一个可更新快照；prefix 不提前裁掉未来可能被消费的读取，最终完整编译执行原有归一化。不是在全量编译后忽略 gaps，也不是新写另一套编译器。

ADR 0012 原有“只能关闭后编译”同时作限定修订：允许在线纯编译与保存，但最终 source/v3 仍独立留档并核对身份、摘要及关闭事实，之后才进入正式候选与验证。显式离线重新编译保留，不成为在线失败的隐藏后备。架构基准已加对应说明。以下是设计与局部复用证据，不表示新在线入口已实施。

```text
Reuse Assessment:
- capability: 在同一 B-U 代表执行期间，将采集前缀转换并保存为现有节点。
- existing implementation in repository: AuthorCaptureCallbacks/EvidenceCollector、natural_compile、natural_read_liveness、hybrid-materializer/selection、RunnerProcess、job SQLite 仓储。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 / workflow-use 0.2.11 受管 fork；LangGraph 运行层不变。
- selected implementation: 原生步骤回调串行等待；共用现有分类和物化，每步重算有界前缀；一份生成快照、一次保存确认。
- reused public surface: Agent.run(on_step_end)、现有 before_action 接点和 Agent.stop；原有 fd3/stdin、saveJob、节点 schema。
- B-A-T-owned adapter and remaining gap: 非终结来源快照、prefix/final 准入拆分、保存 ACK 与在线最终结果交接；不重写 Agent、浏览器控制、图调度或选择器。
- license/runtime/platform fit: 不新增或替换依赖；保留 workflow-use AGPL-3.0 来源及 Python 3.12/TS 进程边界。Windows/macOS 管道接线本轮未作运行验收。
- browser/runtime/state ownership conflicts: 一个 Agent/Browser；原始事实与未发布投影分开；关闭事实单列；不生成第二执行图/数据库或伪造可运行的部分 TaskChain。
- replay model calls: 普通节点 0；prefix 纯计算也为 0；既有准备注解保留原有有界时机和审计，不每步重新调用。
- rejected candidates and evidence: 永久冻结节点与现有消费者重绑冲突；缓存失效引擎增加第二套编译状态；fd4 最佳努力诊断不能承担保存成功确认；仅删除完整编译 gaps 会绕过终态门。
- focused validation: 下列两个无浏览器/模型探针 exit_code=0；新 prefix 入口、ACK/取消、上界性能、正式首次链路仍待实施验收。
```

### 两项已执行的局部探针

命令均以实际 checkout 根目录为 workdir；只读取仓库源码/夹具，不写测试文件、不启动浏览器/模型。下列命令为复现记录，本轮不会重复执行。

1. 消费者重绑：相同来源重复计算相同，旧来源及旧草稿副本未改变；节点 `s-a-0001` 的 consumerRef 从 `s-a-0002` 合法变为 `s-a-0004`。exit_code=0。

```sh
PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false \
PYTHONPATH=vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests \
work/upstream-browser-hybrid/.venv/bin/python - <<'PY'
from copy import deepcopy
from types import SimpleNamespace
from test_natural_read_liveness import NaturalReadLivenessTests, REGISTRY
from workflow_use.hybrid.natural_read_liveness import prune_unused_queries, rebind_consumer_readiness

trace, initial, ledger = NaturalReadLivenessTests().fixture()
original, source_before, outputs = deepcopy(initial), deepcopy(trace), []
for _ in range(2):
    segments, rows, _, issues = prune_unused_queries(
        SimpleNamespace(trace=trace), REGISTRY, deepcopy(initial), deepcopy(ledger))
    assert not issues
    assert not rebind_consumer_readiness(trace, segments, rows)
    outputs.append((segments, rows))
assert outputs[0] == outputs[1]
assert trace == source_before and initial == original
assert initial[0]['id'] == outputs[0][0][0]['id']
assert initial[0]['postconditions'] != outputs[0][0][0]['postconditions']
print('PASS: deterministic derivation; source and old draft unchanged; same node ID')
PY
```

2. 前缀与完整准入分开：从方法合同夹具去掉终态、只保留首动作/两观察，保持 `completed=false`。现有 `classify_natural_action` 可产出同一个 read-fields 方法；完整 `compile_request` 仍返回 `completed_business_result_required` 且无可执行入口。exit_code=0。

```sh
PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false \
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests \
work/upstream-browser-hybrid/.venv/bin/python - <<'PY'
from test_method_source_compile import method_source
from workflow_use.hybrid.compiler import compile_request
from workflow_use.hybrid.natural_compile import classify_natural_action
from workflow_use.hybrid.evidence import digest

request, registry, schema, verified = method_source()
body = request.trace.model_dump(mode='json', exclude={'digest'})
body.update(completed=False, finalResultRef=None,
            actions=body['actions'][:1], observations=body['observations'][:2])
trace = type(request.trace).model_validate({**body, 'digest': digest(body)})
prefix = request.model_copy(update={'trace': trace})
segment, paths, issues = classify_natural_action(
    prefix, registry, trace.actions[0], trace.observations[0], trace.observations[1], schema)
assert not issues and segment['operation']['name'] == 'browser.read-fields'
assert segment['operation']['specification'] == verified.specification.model_dump(mode='json')
full = compile_request(prefix, registry, output_schema=schema)
assert 'completed_business_result_required' in [item['reason'] for item in full.gaps]
assert full.controlGraph['entry'] == ''
assert trace.completed is False and trace.finalResultRef is None
print('PASS: partial classification reuses method; final compiler rejects incomplete source')
PY
```

第二项第一次导入失败：测试命令的 PYTHONPATH 未包含 `apps/api/python`，抛出 `ModuleNotFoundError: No module named 'browser_use_runner'`，尚未执行断言。只修正测试命令后继续该探针，生产源码未改。上方复现命令保留成功断言，输出文案简化；原回执另明确 browser_calls=0、model_calls=0。

另一次只选取消费者就绪/读取活性/重复方法的八项 unittest 批次已发起，但未取到终态回执；其通过数、失败数和退出码均未确认，不计入证据，也未重新运行该批次。没有运行全量/根级测试。

边界：探针 1 证明派生节点更新合法，探针 2 证明局部分类可复用；二者都没有调用尚未实现的 `compile_natural_prefix`。实际 prefix 组合、Python↔TS ACK、SQLite 持久化、取消/人工等待、最大规模性能、真实首次准备/复跑仍须按开发文档验收，不能由本节推断通过。

## 2026-09-28 逐动作生成：复用现有编译，先验证增量闭合

以下为本日较早方案的历史记录，其中 G0/G1 路线和“仍待决定增量闭合方式”已被上节及修订开发文档替代；不作为当前实施指令。

开发说明及证据入口：[边执行边生成节点最小方案](INCREMENTAL_NODE_COMPILATION_20260928.md)。本轮为源码核查/文档，不是运行验收或选型已冻结。

```text
Reuse Assessment:
- capability: B-U 执行中将已采集动作及时转换并保存为既有 TaskChain 节点。
- existing implementation in repository: AuthorCaptureCallbacks/EvidenceCollector、natural_compile、hybrid-materializer、RunnerProcess、job SQLite 仓储、React Flow 画布。
- mature candidates and pinned versions: 现有 browser-use 0.13.8 / workflow-use 0.2.11 受管 fork；LangGraph 继续负责正式运行，不替换依赖。
- selected implementation: 复用原生 Agent hook 与现有分类/物化，增加薄的串行保存交接；G0/G1 通过前不宣称可用。
- reused public surface: Agent.run(on_step_end)、既有动作前回调、公开 Agent.stop；现有节点合同与仓储。
- B-A-T-owned adapter and remaining gap: 来源前缀快照、局部闭合、产品保存确认；完整编译的终态依赖仍须先验证拆分。
- license/runtime/platform fit: 保留 workflow-use AGPL-3.0 来源和受管 Python 3.12/TS 进程边界；Windows/macOS 使用现有启动/管道，不新增依赖或重新选型。本轮未作平台运行验收。
- browser/runtime/state ownership conflicts: 同一 Agent/Browser；job 只存生成快照，不建调度器或框架检查点库；LangGraph 职责不变。
- replay model calls: 普通节点 0；准备期既有语义注解独立审计，不新增模型播报或隐式修复。
- rejected candidates and evidence: 不用 fd4 最佳努力诊断保存节点；不以全量编译忽略 gaps 冒充增量；不另加工作流/事件框架，现有 hook、IPC 和仓储已有基础能力。
- focused validation: 先 G0 局部转换与终态一致性，再 G1 正式协议/持久化/普通复跑；本轮未执行这些验证。
```

固定版本源码的 `Agent._execute_step` 在原生 step timeout 之外 await `on_step_end`；新保存确认必须单独有界并可取消。`capture.finish` 有终结行为，`natural_compile` 有完成来源门，终态包含读取重绑/裁剪与重复方法折叠，不能把 hook 可用推论成逐动作节点已经稳定。[B-U 官方 hooks](https://docs.browser-use.com/open-source/customize/hooks)仅佐证扩展点；具体时序以上述锁定版本为准。CodeGraph 工具在本轮会话不可用，采用已知文件定点读取，未初始化或重建索引。

## 2026-09-28 现有 Chrome 接入与同一任务慢速复跑验证（本次真实样本通过）

最终证据：同发布京东收藏任务在用户完成常用Chrome登录后，真实工作台按3000ms节奏产生execution `3da5ada2-ebcd-458b-83ba-27e627213b00` / run `282e2ce8-a69c-42de-8d73-63bb2983e950`，completed，9节点/9浏览器命令/模型0，实际2条结果；cleanup confirmed、原任务窗口交付active。重启API后的持久化与UI结果一致。采用当前SDK连接的适配在这一真实样本成立；未知iframe归属按拒绝处理、验证码和其他网站未测，未声称浏览器环境是历史风控的唯一原因。下列“进行中”描述为各阶段事实，详见PROGRESS最新记录。

追加恢复边界：真实正式运行 c58dde32 在 `function_output_invalid` 后仅 browser_close 未确认；原 close_protocol、child_exit、temporary_directory 均 confirmed。只读核实所属目标已全部消失，原用户页未变。恢复将复用现有 cleanup_execution/运行审计，加上同 execution owner、原控制器退出及其余清理阶段确认门，再通过 CDP 只读 verify_closed 核验目标消失；不终止用户 Chrome、不修改旧业务失败。适用于任意网站的关闭确认，模型调用0。

Product Alignment:
- natural-language task: 沿用用户当前浏览器完成已授权的只读任务，并设置每节点3秒间隔。
- reusable chain boundary: 不可变发布链路保持原样，替换本次执行的浏览器连接/资源所有权适配。
- runtime inputs: 既有链路、业务输入、显式本机CDP端点、execution owner、已有pacing。
- dynamic task outputs: 原发布结果合同，真实页面数量不足时保留实际数量。
- generic platform capability used: 用户浏览器连接、任务标签所有权、检查点、窗口交付与慢速运行。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: browser-use连接现有Chrome，同时只操作本次任务标签。
- existing implementation in repository: Browser/BrowserProfile(cdp_url)、ManagedWindow、RunnerProcess、ExecutionPacingController；已有节点节奏无需重写。
- mature candidates and pinned versions: 当前browser-use 0.13.8/cdp-use 1.4.5/workflow-use 0.2.11；Chrome原生144+远程调试。
- selected implementation: 保持当前SDK及编译/执行链路，用公开CDP连接和目标创建API；补充B-A-T所需的外部浏览器所有权适配，验证前不冻结。
- reused public surface: CDPClient、Browser(cdp_url,is_local=False)、BrowserProfile、Browser.stop、原SessionManager、既有pacing.beforeNode。
- B-A-T-owned adapter and remaining gap: 当前SDK无任务target白名单，connect会遍历既有页，SecurityWatchdog会关闭授权域外页。适配需在manager启动前限制目标池/入口枚举，限制弹窗处理和焦点恢复；不复制Agent loop、connect、selector或调度。
- license/runtime/platform fit: 使用仓库已锁定依赖和Windows当前Chrome，未安装或替换关键库。
- browser/runtime/state ownership conflicts: 用户Chrome进程不可由运行器终止；不得执行reset_automation_tabs；本次只创建/关闭自有窗口，交付只断开；不导出用户Cookie或Profile。
- replay model calls: 普通复跑0，保持原审计。
- rejected candidates and evidence: 直接把cdp_url传入旧启动路径会导航用户newtab并触发域限制关页；已读session.py:1921-1988、security_watchdog.py:73-89。切回BrowserSkill不符合已确定迁移方向。
- focused validation: 先空白页连接/目标范围/清理检查，再真实UI发起同一京东发布任务、pacing=3000；首次失败分别保留。当前仅Chrome连接已成功，任务尚未执行。

连接记录：用户已授权自行处理，不再提问。原生设置页实测开关未勾选；在该页启用后生成9222端口，使用原生连接确认后Browser.getVersion返回Chrome/153.0.8010.53。未请求京东。运行弹窗已设3000ms，证据work/human-existing-chrome-pacing-proof.json；调试连接证据work/existing-chrome-connection.json。官方入口说明：https://developer.chrome.com/docs/devtools/agents/get-started/configuration 。

首次空白验证失败保留：诊断程序在启动生产 Runner 之前的 CDP inventory 连接超时（`TimeoutError:timed out during opening handshake`），现场 Chrome 原生 Allow 确认框尚在；未创建任务窗口、未请求站点，不能归为京东拒绝。用户随后明确已点击 Allow。`cdp-use 1.4.5` 的公开构造器没有握手超时参数；不复制传输实现。适配收窄为在 SDK 已连接、尚未枚举页面的 SessionManager 启动钩子中创建/验证任务页，复用同一连接完成运行、交付前核验和关闭，避免建页/验页短连接。证据 `work/existing-chrome-smoke-proof.json` 按 attempts 保留。

## 2026-09-28 BrowserSkill webdriver 实测补证

- 在已连接的 Chrome 153 中通过 BrowserSkill 创建本次所属空白窗口，实际 evaluate 得到 `navigator.webdriver=false`；随后 session stop 成功，未访问京东。证据 `work/browser-skill-webdriver-proof.json`。
- 与上一轮当前 B-U 正式 ManagedWindow 实测 `true` 对照，现已确认本机 B-S 为 false、当前 B-U 正式入口为 true；下文“未实测 B-S”保留为上一阶段历史状态。
- 首次 CLI 查询因 Windows Job Object 无法独立启动 daemon 而失败；使用 CLI 提示的官方前台模式启动成功，再完成测量。首次失败和恢复方式均写入证据。

## 2026-09-27 BrowserSkill 与当前 browser-use 访问环境差异：实测

### 已证实的差异

- BrowserSkill 已有源码通过 `chrome.windows.create({type: 'normal'})` 在扩展所在浏览器创建窗口，并通过 `chrome.debugger.attach/sendCommand` 控制标签页。结合用户陈述，其此前使用日常浏览器环境；它不需要本项目另起一个独立 Profile 的浏览器进程。证据：`work/browser-skill-diagnostic-source/apps/extension/src/session-manager/agent-window.ts:35`、`browser-driver/chromium-cdp.ts:73`。本轮没有重新连接用户日常浏览器，不能声称实测了其当前页面属性。
- 当前 hybrid 路径使用 `data/browser-profile/default`，与日常浏览器 Profile 独立。`owned_browser` 未指定 executable/channel，由 browser-use 定位器选择；`ManagedWindow._launch` 明确优先定位系统 Chrome，自行拼接启动参数，随后让 browser-use 附加。这是当前集成的两套浏览器启动配置。
- 使用同一个新建临时 Profile、均有界面、仅访问 `about:blank`，分别调用这两个现有生产启动入口各一次，实际读到：

| 属性 | 准备/验证入口 owned_browser | 正式交付入口 ManagedWindow |
| --- | --- | --- |
| 实际可执行文件 | ms-playwright/chromium-1161/chrome-win/chrome.exe | Program Files/Google/Chrome/Application/chrome.exe |
| 页面 UA 主版本 | Chrome/134.0.0.0 | Chrome/153.0.0.0 |
| navigator.webdriver | false | true |
| 页面 innerWidth × innerHeight | 2544 × 1292 | 1249 × 1277 |
| 调试端口参数 | 显式非零端口 | --remote-debugging-port=0 |
| 语言/时区 | zh-CN, zh / Asia/Shanghai | 相同 |

- browser-use 自己的启动参数包含 `--disable-blink-features=AutomationControlled`；自建 ManagedWindow 启动参数未复用 BrowserProfile.get_args。这里只记录已有参数差异，未修改参数或注入脚本隐藏自动化。Google Chrome 官方参数说明确认端口参数 0 会令 webdriver 为 true：https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md 。扩展 CDP 机制说明：https://developer.chrome.com/docs/extensions/reference/api/debugger 。
- 两次空白页探针均清理 confirmed，模型调用 0，没有请求京东。证据 `work/browser-environment-comparison-proof.json`；复现入口 `work/browser-environment-comparison.py`。首次纯配置探针漏传 get_args 所需 user_data_dir，失败后补上临时路径；该失败已保留在证据中。没有新增 tests 文件或运行根级/全量测试。

### 原因判断与边界

- 已定位的工程缺陷是迁移后没有保持浏览器环境一致性：日常浏览器改为独立 Profile；当前准备/验证与正式运行还会选中不同内核版本、启动参数及窗口尺寸。同一路径正常完成验证，不能证明另一种浏览器环境也可完成正式运行。网页可直接看到上述 UA、webdriver 和尺寸差异。
- 既有同任务样本和独立验证均读取了真实收藏结果，正式运行在读取入口候选后、点击派发前失败。故不能归结为 browser-use 完全无法访问京东，也不能把全部失败直接归因于反自动化。窗口尺寸变化也可能影响元素布局/可见性，当前没有失败页面快照证明这一分支。
- 用户报告正式窗口受到反自动化限制；已保存机器错误是 `ordinary_target_missing`。原失败浏览器已关闭，未保留拦截页/挑战响应证据，因此不能确认京东具体读取了哪个信号，不能声称 webdriver 是唯一触发条件。历史 BrowserSkill 评论采集与本次收藏任务也不是同时间、同页面的受控对照。
- 当前排查优先级：统一现有 browser-use/workflow-use 路径的可执行文件选择、Profile 所有权及启动配置来源，使验证覆盖正式使用的环境；在保留真实现场的前提下定位站点响应。不能仅把端口 0 改掉就宣称已修复，也不切回 BrowserSkill。生产实现本轮未改，正式主线仍未验收。

## 2026-09-27 BrowserSkill 既有能力与当前链路接入核对

- 用户纠正：项目就是从 BrowserSkill 迁移到当前 browser-use + workflow-use；这是已确定的技术方向。此前将保留的旧适配器视为“接回主线”的修复方向是本轮判断错误，撤回该建议。后续沿当前栈定位问题，BrowserSkill 的历史成功仅作为浏览器环境、会话连续性和操作节奏的对照证据。
- 用户反馈此前 BrowserSkill 借助日常浏览器可以完成京东采集；历史小样本成功不能被本次正式复跑失败否定，也不自动证明今天的账户/页面状态。
- 当前仓库保留 `BrowserHost` 与 `TaskChainBrowserAdapter`。前者通过官方 `session start --no-focus [--browser ...]` 创建所属会话，每条命令绑定 session，finally 执行 session stop；不是缺少 BrowserSkill 依赖。
- `TaskRuntimeHost.group` 的 hybrid 分支调用 `upstream.withCapabilities`，提前返回；当前已发布 hybrid 链路不会进入后面的 BrowserSkill 分支。这符合已确定的迁移方向，不能据此判为接入断点。已有 BrowserSkill capability 配置为 `mode/operation/arguments/capture`，与当前 hybrid 配置不同；旧适配器存在不构成切回依据。
- 本机公开 CLI `bsk --version` 返回 `0.3.0`；`--help` 正常。首次 `--json status` 长时间无输出，本轮已按确切父子 PID 终止自己发起的查询；保留既有 daemon。后续 `browsers` 未执行，因此当前扩展连接/可用实例仍未核实。没有启动会话、访问京东或读取日常浏览器页面。
- 本轮仅做既有接入核对，没有替换浏览器库、修改指纹参数或重试京东。正式复跑仍失败；不能将历史 BrowserSkill MVP、CLI 存在或适配器存在记为当前产品通过。下一项沿 browser-use + workflow-use 核对准备、样本、独立验证与正式运行的浏览器启动、会话保持及访问节奏差异，定位后修复当前路径；不再以切回旧适配器作为处理方向。

## 2026-09-27 同一来源的重复注解恢复

Product Alignment:
- natural-language task: 分页或滚动任务的代表来源已经保存，但派生方法注解因适配错误未通过。
- reusable chain boundary: 原来源→既有离线注解→新编译结果；不重新运行浏览器。
- runtime inputs: 不可变来源、原缺口、用户发起的重新准备/编译上下文。
- dynamic task outputs: 仅追加已验证的repeat_method派生事实；旧动作、观察、摘要和失败记录不改。
- generic platform capability used: 现有hybrid_annotate RPC、annotate_repeat_method及同一来源校验。
- replay model calls: 0；离线准备注解另计semantic_annotation。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已保存重复来源的派生注解重试。
- existing implementation in repository: 原生准备已调用annotate_repeat_method；离线compile_offline/recompileHybridSource却只接selection注解。
- mature candidates and pinned versions: 沿用现有Browser-Use模型接口、B-A-T既有注解器和Python/TS证据校验，不新增库。
- selected implementation: 在既有RPC接上同一个repeat注解器；只允许已知可重试重复缺口。
- reused public surface: 原annotate_repeat_method、AIConnectModel、hybrid_annotate、validateNaturalRepeats。
- B-A-T-owned adapter and remaining gap: 只接已有编译生命周期；附加事实必须属于原缺口中的成功读取，旧事实必须逐项不变。
- license/runtime/platform fit: 现有锁定Windows运行时及许可证，无新依赖。
- browser/runtime/state ownership conflicts: 离线compiler不启动浏览器，不接管京东窗口或其他owner。
- replay model calls: 0。
- rejected candidates and evidence: 不重开B-U来重取同一批已存在证据，不手写方法事实，不把index:null改写进原source。
- focused validation: 原失败来源null index生产守卫修前/修后、追加事实完整性拒绝，再同源一次离线注解/编译/真实普通复跑；无新tests文件。

## 2026-09-27 查询属性进入原生模型消息

Product Alignment:
- natural-language task: 从动态列表提取方法，或根据表单控件状态选择操作。
- reusable chain boundary: 既有find_elements结果到下一轮Agent观察。
- runtime inputs: 实际selector/attributes及原生ActionResult。
- dynamic task outputs: 有界摘要中保留实际请求的属性与空串布尔属性。
- generic platform capability used: Browser-Use公开find_elements、CDP和MessageManager。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已有DOM查询结果的长期摘要投递。
- existing implementation in repository: enrich_find_elements_result仅摘要固定7类属性，遗漏模型请求的style/id/class；if(value)还遗漏空串属性。
- mature candidates and pinned versions: 现有锁定Browser-Use 0.13.8的ActionResult/MessageManager。
- selected implementation: 沿原生结果和有界摘要，仅修请求属性优先与缺失/空串区别。
- reused public surface: ActionResult.long_term_memory、已有CDP Runtime.evaluate、原生MessageManager。
- B-A-T-owned adapter and remaining gap: 已有观察增强薄适配，不复制查询器、Agent loop或记忆框架。
- license/runtime/platform fit: 现有许可证及Windows环境，无新依赖。
- browser/runtime/state ownership conflicts: 同一受管浏览器会话，不新开或转移所有权。
- replay model calls: 0。
- rejected candidates and evidence: SDK实际实现默认include_extracted_content_only_once=false且优先long_term_memory；只把属性写入extracted_content无法交给下一轮，须修现有摘要。
- focused validation: 真实SDK MessageManager与生产enrich入口的修前/修后消息对比，不用mock替代消息消费，不调用模型。

## 2026-09-27 取消原因与资源清理保持独立

Product Alignment:
- natural-language task: 任意准备或浏览器运行超过时间预算、被用户取消时，准确保留中断原因。
- reusable chain boundary: RunnerProcess请求失败边界与独立cleanup报告。
- runtime inputs: 原AbortSignal、pending请求和当前child。
- dynamic task outputs: 原始取消reason，不被子进程退出码覆盖。
- generic platform capability used: Node AbortSignal及既有runner进程清理。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 取消错误归属。
- existing implementation in repository: launch监听abort并调用现有terminate/close，close事件却覆盖原reason。
- mature candidates and pinned versions: 当前Node原生AbortSignal.reason/throwIfAborted；无依赖变更。
- selected implementation: 原生reason直接拒绝既有pending请求，保留原清理路径。
- reused public surface: AbortSignal.reason/addEventListener，现有RunnerProcess.rejectAll/terminate。
- B-A-T-owned adapter and remaining gap: 请求错误映射；注册后检查取消，覆盖临时目录创建期间的取消窗口。
- license/runtime/platform fit: 现有Node/Windows运行时，无新增许可证。
- browser/runtime/state ownership conflicts: 只清理本runner拥有的进程树与临时目录，不修改浏览器控制/任务调度。
- replay model calls: 0。
- rejected candidates and evidence: 无需另建取消框架；真实临时Python runner已复现TimeoutError被覆盖。
- focused validation: 真实RunnerProcess的超时、自定义取消、普通异常退出及cleanup；不调用模型/浏览器，不新增tests文件。

## 2026-09-27 顺序第3项：同页原生推进适配（实施中，未验收）

9ZWvfC真实来源确认准备提示混淆了两种角色：click的查询结果是可操作目标，scroll的查询结果仅是继续谓词。该来源已观测明确结束提示及其隐藏状态，却因“所有eligible controls必须排除隐藏”的反馈拒绝方法。修正仅限通用准备指导：按钮仍须可见可操作；滚动允许按已观察终止标记的非终止状态建立唯一查询，缺标记不能冒充终止，读取仍须新稳定键且依赖实际页面就绪。DOM条件复用原生CSS查询，TaskChain/registry/运行调度均不变；不在平台源码写网站ID或选择器。此项属于上述证据到IR的适配职责，不引入库或自行实现CSS判断。

rnvXxu实际普通复跑已读取62条，末次查询也读到了终态属性，但裸marker查询始终1项，因多一次scroll而TimeoutError。不能把已取得数据或sourceSuccess当运行成功。进一步明确当前IR的唯一语义：重复控制只看查询匹配数量，绝不解读返回属性；持续存在的结束标记必须在selector中编码非终态。该约束同时进入准备指导、读取反馈及重复注解指导；不按站点/selector名称加编译猜测，不给运行末尾追加judge，旧错误source/chain/run均不修改。

Product Alignment:
- natural-language task: 收集分页/增量加载的公开结果，或逐批处理动态列表中的任务项。
- reusable chain boundary: 同一读取、继续条件、原生推进组成复用循环，代表来源必须证明新稳定键。
- runtime inputs: 原有TaskChain输入、完整DOM读取、唯一继续控制、预算。
- dynamic task outputs: 按稳定键累积的所有批次，包括末批；无新数据、含糊目标或预算耗尽保持失败。
- generic platform capability used: Browser-Use原生click/scroll、已有read_fields transition、既有LangGraph loop/append_unique。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 同页按钮/滚动触发增量内容的准备证据与IR适配。
- existing implementation in repository: natural_readiness已生成消费者投影transition；natural_compile保留原生动作；natural_repeat及TS物化却限定navigate/href。
- mature candidates and pinned versions: 沿用当前锁定Browser-Use、workflow-use fork和LangGraph StateGraph，不引入/替换库。
- selected implementation: 上述现有公开原生动作与循环能力。
- reused public surface: Tools click/scroll、已有browser.workflow-step、data.transform、loop及append_unique。
- B-A-T-owned adapter and remaining gap: 证明同文档推进与下一批稳定键、折叠代表动作、绑定唯一继续控制。只扩展版本化证据到现有IR的映射。
- license/runtime/platform fit: 沿用当前许可证/Windows运行时，真实样本验证前不宣称选型冻结或能力通过。
- browser/runtime/state ownership conflicts: 原Browser-Use单会话；LangGraph推进；原持久化不变。
- replay model calls: 0。
- rejected candidates and evidence: 不另建通用循环/等待器；natural_readiness._verified_consumer_readiness已拥有操作前后读取变化条件，现有执行器负责轮询。
- focused validation: 生产编译与物化入口验证新模式、旧href来源兼容及拒绝假进展；再使用真实公开网页验证。不开第二条正式G6，不新增tests文件。

运行时补充：SAME_DOCUMENT证明必须贯穿advance动作前后。此前scope仅在派发前检查，成功回执可把同URL的新document接纳为前驱；现在同一scope实例保存派发文档并在succeed前比较、失败清空，不增加调度器或状态数据库。7项受控生产验证及API check通过（work/repeat-same-document-after-proof.json）。真实按钮候选使用NuGet公开版本列表；其官方page-display-package脚本在加载成功后替换版本表并隐藏按钮父容器，浏览器预检8→55条已观察，接下来才检验自然编译及普通复跑。

真实首次来源qn3bc2又暴露两类不同问题：继续查询忽略控件的隐藏/禁用状态且两次attributes不同，这是来源缺证，继续拒绝并改进通用准备指导；成功原生wait被当作不属于repeat的动作，则应复用已有纯等待/原生回执分类，将有同文档且无副作用证明的准备等待归入支持证据。正式循环仍靠既有read_fields transition轮询，不引入固定秒数等待器；缺回执、换文档或有事件的等待必须拒绝。原来源不可改，也不能把提示词修正算作验收通过。仅完善B-A-T证据映射；复用组件/会话/模型边界沿用上述Reuse Assessment。

第二来源HzfopD仍在事后改查询，停止原样调用模型。最小改进复用Browser-Use ActionResult.long_term_memory，在bat_read_fields成功结果旁提供当前readRef之后宿主已捕获的完整查询参数候选；不改extracted_content摘要、不自动改模型参数、不替模型判断哪个继续条件正确。另用实际Browser-Use registry.create_action_model核实当前ActionModel是Pydantic RootModel，旧normalize_author_action直接查顶层属性而一直没有生效。适配入口应通过Pydantic公开root解包，再执行既有默认属性/viewport index规范化；保留显式参数，不改旧来源。无新工具/注册schema/运行调度或依赖。


本文件只保留当前选型和仍有效的边界。阶段进度见 [PROGRESS](PROGRESS.md)，执行顺序见 [ROADMAP](ROADMAP.md)。

本轮按全项目落实成熟组件复用，职责矩阵、实际反例、保留/替代依据见[PROJECT_REUSE_REVIEW](PROJECT_REUSE_REVIEW_20260927.md)。该审查不以安装依赖数证明系统已完成，也不将阶段性样例代替通用产品目标。

## 2026-09-27 准备函数失败关联：沿原来源定位，不新增tests文件

### 第2项：编译失败仍可沿原需求重新准备

Product Alignment:
- natural-language task: 任意已确认任务的技术准备失败后，沿原需求补充代表执行。
- reusable chain boundary: 保留原来源/失败job；沿既有prepare_task建立新准备，不改需求版本。
- runtime inputs: 当前已确认requirement、failed activity及现有离线恢复诊断。
- dynamic task outputs: 可重编译时仍提供原准备入口，不把来源可读取误当作一定能编译成功。
- generic platform capability used: 现有Radix Button、React条件展示、prepare_task命令与持久化。
- replay model calls: 本次验证0；用户重新准备仍按已有授权边界调用准备模型。
- site/task-specific code added: no。

定点验证：实际WorkbenchContext在失败/compiling/来源可用下渲染，修前仅重编译、无重新准备；改条件后核验两个入口及不可用/运行中分支。后端沿现有真实准备失败消费者命名用例核验技术缺证不回访谈。不上新库，不新增tests文件。

### 后续修复：选择方法在原生探索循环内先验证

Product Alignment:
- natural-language task: 按规则选择列表目标，或选择后续表单操作的对象。
- reusable chain boundary: 当前候选读取→已验证纯函数→原生点击；普通复跑使用同一程序。
- runtime inputs: 当前完整候选、原 ordinal、确认规则与变化样例。
- dynamic task outputs: 本次选定目标与来源关联；方法错误回原 Agent 工具结果。
- generic platform capability used: Browser-Use Tools 注册和 Agent 原生循环、既有 QuickJS Function 验证、同一授权 HTTP 桥。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在实际点击前验证准备方法，避免事后另生成不一致程序。
- existing implementation in repository: `selection_annotation.py` 在来源结束后调用模型；`validateAndMaterializeFunctionDraft` 已由 QuickJS 验证完整样例。
- mature candidates and pinned versions: Browser-Use 0.13.8、quickjs-emscripten 0.32.0、已受管 workflow-use commit 5d2d19fe8835cc86f1bf3e04302a5000d590f249。
- selected implementation: 复用 Browser-Use 原生工具和错误反馈循环、现有 QuickJS；不增加依赖。
- reused public surface: Tools.registry.action、ActionResult、Agent.run、现有 executeFunctionNode。
- B-A-T-owned adapter and remaining gap: 从宿主捕获读取提供不可伪造的当前候选，将已验证程序绑定到后续真实 click 的既有 selection_function；约束是 B-A-T 证据身份，不自写模型循环或 JS 执行器。
- license/runtime/platform fit: 沿用现有许可证与 Windows 受管 Python/Node 运行时；本轮需真实验证。
- browser/runtime/state ownership conflicts: 工具仅计算 JSON，无浏览器或模型控制；原 Agent 继续唯一控制浏览器，编译不再重生这份方法。
- replay model calls: 0；选择校验端点不调用模型。
- rejected candidates and evidence: 上游 DeterministicWorkflowConverter.convert_history_to_steps 逐条处理历史，不拥有 B-A-T 读取身份/Function 证据；BuilderService 产出上游 WorkflowDefinitionSchema 并可包含 Agent 步骤，不能替代当前版本化 IR 及零隐式模型契约。仅复用其浏览器基础能力。
- focused validation: 原失败来源保持原拒绝；生产 HTTP+QuickJS 检查错误样例与合法方法；再走新自然来源、编译、变化输入普通复跑。不开第二条正式 G6，不新增 tests 文件。

Product Alignment:
- natural-language task: 按确认规则选择条目，或计算后续填写/操作所需值。
- reusable chain boundary: 准备生成的纯函数经已有沙箱验证，失败必须关联本次来源中的实际动作。
- runtime inputs: 不可变来源、已有Function segment与真实/变化样例。
- dynamic task outputs: 原失败码和对应actionRefs；不改写样例或放宽校验。
- generic platform capability used: 现有QuickJS验证器、Error cause、CompilationGap。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment: 保留quickjs-emscripten 0.32.0、现有validateAndMaterializeFunctionDraft和gap持久化；仅适配所属动作关联，不引入库、不实现另一个校验器或修复循环。真实失败SfWUgg中程序/样例不一致被正确拒绝，但withSelectionValidation固定写actionRefs=[]，丢失定位。用同一不可变来源经生产离线编译检查失败码、动作关联与原文件摘要；不新增tests文件，不启动浏览器/模型，不把定位改进说成错误程序已能执行。

当前补齐的复用/输入输出依据分别见 [人工等待](HUMAN_WAIT_CLOSURE_20260927.md)、[嵌套选择证据](NESTED_SELECTION_CLOSURE_20260927.md)、[只读画布局部核验](UI_REMAINING_CHECK_20260927.md)。均沿既有Browser-Use、LangGraph、React Flow与产品持久化边界适配，不新增调度器/浏览器控制器或隐式复跑模型。

## 2026-09-27 跨语言原生动作参数的JSON数值等价

Product Alignment:
- natural-language task: 滚动列表选择结果，或滚动表单到填写区域。
- reusable chain boundary: 已绑定原生参数经过公开schema校验后值不变；JSON number的整数/浮点表示不构成改变。
- runtime inputs: 从TS JSON传回Python的原生action参数。
- dynamic task outputs: 合法等价参数继续执行，真实改值仍拒绝。
- generic platform capability used: 既有ActionRegistry、jsonschema、Pydantic。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: JSON值等价校验。
- existing implementation in repository: ActionRegistry先jsonschema校验，再Pydantic规范化，最后比较Python词法digest；4→4.0被误判。
- mature candidates and pinned versions: 当前已锁定jsonschema Draft202012Validator；不新增依赖。
- selected implementation / reused public surface: 使用公开const schema + is_valid比较JSON值，复用其布尔/数值、数组和对象语义，不自写递归比较器。
- B-A-T-owned adapter and remaining gap: 原input schema门保持；只替换参数校验后的等价判断，不改变不可变来源digest或模型参数。
- license/runtime/platform fit: 沿用当前Python/Windows依赖。
- browser/runtime/state ownership conflicts: 无额外派发、浏览器或模型。
- rejected candidates and evidence: Python序列化SHA不能表达TS number语义；真实source首复跑在scroll pages=4被拒绝。
- focused validation: 真正Browser-Use公开scroll模型接受4/4.5，字符串/布尔拒绝；规范化改值仍拒绝；同来源离线重编译复跑。

## 2026-09-27 导航失败保留本次主文档拒绝

Product Alignment:
- natural-language task: 采集或打开页面遇到认证拦截，保留原现场等待用户。
- reusable chain boundary: 原生导航失败时仍按本次实际HTTP响应归类；不推断登录完成。
- runtime inputs: 同次导航URL及既有Network.responseReceived的Document状态。
- dynamic task outputs: authentication/access/rate typed failure，或原始普通动作失败。
- generic platform capability used: 现有 Browser-Use Tools.act、CDP主文档事件和hybridExternalFailure。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生动作失败后的精确HTTP拒绝投影。
- existing implementation in repository: execute_checked会先抛ordinary_action_failed，Runner只在成功分支检查document_status，真实401未进等待。
- mature candidates and pinned versions: 当前Browser-Use/Chrome CDP已有事件监听；不加网络客户端或第二次导航。
- selected implementation / reused public surface: 单次原生导航前清除目标旧状态；仅ordinary_action_failed时检查本次同URL主文档状态，沿既有capture_*错误映射。
- B-A-T-owned adapter and remaining gap: 只修错误边界；无响应、其他URL响应、陈旧401不能推导认证等待；Basic Auth对话与成功认证仍单独记录。
- license/runtime/platform fit: 沿现有Python/Windows依赖。
- browser/runtime/state ownership conflicts: 不启动Browser、不重派动作、不改已有业务结果。
- rejected candidates and evidence: 根据任意异常文本或旧URL状态猜401会误报；外部HEAD401仅用于选定协议现场，不能充当本次Browser证据。
- focused validation: 本次401/无响应/异URL/陈旧拒绝四种边界，以及真实Runner再次验证。

## 2026-09-27 执行型选择的准备复核边界

Product Alignment:
- natural-language task: 按列表规则打开详情，或选择表单中符合条件的选项后停留。
- reusable chain boundary: 只补准备阶段模型上下文，不修改普通运行完成规则。
- runtime inputs: 已有 AuthorInput.resultSpec.mode、outputSchema、同现场读取证据。
- dynamic task outputs: 可追溯的选择方法或明确缺证；execution 模式无记录列表输出。
- generic platform capability used: 已有 Browser-Use Agent/find_elements/click、准备复核与 Function 选择编译。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 已确认结果类型传递和动态选择动作的可编译性指引。
- existing implementation in repository: author_step 已接收 resultSpec，_review_completion 未向复核传递结果类型；annotation 只对有完整候选证明的 click 编译动态选择。
- mature candidates and pinned versions: 现有 Browser-Use 0.13.8 与 pinned workflow-use fork；版本/依赖不变。
- selected implementation / reused public surface: 原 Agent 公开工具、既有 CompletionReview/ResultSpec、Function 和严格绑定；无新工具或执行循环。
- B-A-T-owned adapter and remaining gap: 将结果模式/合同送入准备复核，说明空 collectionProofCandidates 对无数据输出并非缺项；仍要求真实范围证据。提示动态列表选链接使用有目标证据的 click，不把代表 href 直接导航当可复跑选择方法。
- license/runtime/platform fit: 沿用现有许可证、Python/Windows/TS 桥。
- browser/runtime/state ownership conflicts: 不增加 Browser，不重置预算/trace，不覆盖旧来源。
- rejected candidates and evidence: 第二次真实来源在执行型任务的续查后索要“记录列表输出”的 collectionProofCandidates；未携带 resultSpec 是明确上下文缺口。不得跳过所有准备复核或伪造 collectionProofCandidate。
- focused validation: 单条生产复核输入边界测试；随后一次相同公开页面的自然来源验证，记录首次失败。

后续明确选择输入的顺序合同：真实基础筛选来源给出正确点击，但模型程序用数组 `.find()` 表达“正文第一项”，被既有保留ordinal的数组重排校验拒绝。原指引仅说明返回原ordinal，未明确数组包装顺序可变、正文顺序由ordinal定义；现只补这项既有合同说明，不改变校验、输入字段或旧来源。纯指引改动定点核对，不新增镜像测试；在新的真实来源上验证，原拒绝保留。

## 2026-09-27 G6：原窗口前台激活的真实回执

### OS 拒绝的 API 与界面反馈边界

Product Alignment:
- natural-language task: 查看采集或表单任务保留的原窗口。
- reusable chain boundary: 聚焦失败独立于已完成链路与结果。
- runtime inputs: 已验证 execution/owner 的显式 focus。
- dynamic task outputs: 固定可读错误；刷新后的原完成状态和租约。
- generic platform capability used: 既有 DomainError 与 TaskChainConnection 状态刷新。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 精确系统拒绝的安全错误投影与交互反馈。
- existing implementation in repository: UpstreamProtocolError、DomainError、controlBrowserHandoff、controlHandoff/reload。
- mature candidates and pinned versions: 当前 TypeScript/Error、Fastify 错误处理与既有连接；无新增依赖。
- selected implementation / reused public surface: 只在 focus 边界匹配已知 runner code/reason，转为固定 DomainError；刷新后保留本次操作错误。
- B-A-T-owned adapter and remaining gap: 不透传未知异常；不改变已完成结果、active 租约或增加重试。
- license/runtime/platform fit: 沿用现有依赖及 Windows Python 协议。
- browser/runtime/state ownership conflicts: 不控制窗口、不写执行状态。
- replay model calls: 0
- rejected candidates and evidence: 全局异常透传会泄露非公开错误；现有 UI catch 中 reload 成功会清空刚写入的操作失败。
- focused validation: 一个连接回归保护成功刷新后仍显示错误，一个既有 handoff API 测试保护固定映射与持久化结果不变。

Product Alignment:
- natural-language task: 采集结果或填写表单后，保留本次原窗口并由用户打开查看。
- reusable chain boundary: 资源交付证明同 owner/target 仍存在；显式聚焦独立证明 Windows 前台窗口已切换。
- runtime inputs: 已核验租约中的浏览器 PID 和目标，不接受任意窗口句柄。
- dynamic task outputs: 保留的 active 租约，或明确的前台激活拒绝；已有 TaskRun 和业务输出不改。
- generic platform capability used: 既有 ManagedWindow 租约、CDP activate 与 Windows User32。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 本次受管原窗口的可见性和前台激活回执。
- existing implementation in repository: ManagedWindow._visible_window 枚举 owned PID，但忽略 SetForegroundWindow 返回值，只要窗口可见就报成功；handoff 又直接复用了 focus。
- mature candidates and pinned versions: 当前 Windows User32 系统 API；沿用 Python ctypes，不增加库。
- selected implementation / reused public surface: EnumWindows、GetWindowThreadProcessId、GetWindow、IsWindowVisible、IsIconic、ShowWindow、SetForegroundWindow、GetForegroundWindow。
- B-A-T-owned adapter and remaining gap: 只筛选已核验 owned PID 的可见主窗口，恢复后请求聚焦并核对实际 HWND；拒绝时保留租约并给明确错误。handoff 返回同一已核验活租约，显式 focus 独立验证前台。
- license/runtime/platform fit: 系统公开 API，无新依赖；明确 ctypes 的 HWND/BOOL/LPARAM 类型以适配 Windows 64 位。
- browser/runtime/state ownership conflicts: 不附着其他进程输入队列、不模拟输入、不改前台锁、不重开浏览器；只操作 owned 主窗口。
- replay model calls: 0
- rejected candidates and evidence: 不使用 AttachThreadInput 或按键技巧跨越系统前台保护。Microsoft 明确后台进程即使满足部分条件也可能被拒，不能把 CDP activate 或“窗口存在”作为前台成功证据。
- focused validation: 单个所属 Python 测试文件验证拒绝保留租约、真实前台回执及 handoff 独立性；同一正式 UI 再次 focus 由主 agent 核验，不新建任务/浏览器。

官方依据：[SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)、[GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)。现场只读诊断确认 owned Chrome PID 1968 有主窗口 HWND 2622766，另一个可见 HWND 1574350 是主窗口的 owned 辅助窗口；前台仍为 PID 19260。原两次截图门 `owned_window_not_foreground` 保留，具体 OS 拒绝条件不能仅凭此诊断断言。

## 2026-09-27 G5：Profile 所有权与浏览器检查点关联

- Profile 的 Product Alignment / Reuse Assessment：账号窗口维护是登录后查阅、表单等任务共有的资源所有权门；复用既有 ManagedWindow.start/handoff/end/inspect、RunnerProcess 分阶段清理和 psutil 身份核验。只新增私有 owner 适配，持久化 controller/Windows launcher 的 PID/创建时间/exe 与目录 owner token；旧空记录保留明确拒绝，不新增进程控制框架。TS 6/6、Python 10/10；真实临时窗口在两次适配失败修正后完成 open→handoff→重建 service→recover，零模型调用、共享 Profile 保留、finally 清理确认。
- 检查点的 Product Alignment / Reuse Assessment：多页读取、表单等链在纯计算节点后恢复，需要精确浏览器前驱；复用原 TaskCheckpoint/finished event、digestJson 和 LangGraph 运行驱动，只增加可选 browserNodeId/browserStateDigest。末事件不能代表末浏览器动作，单 nodeId 不能绑定具体摘要；新关联必须独立核验最新回执/同 invocation/现场身份，无 pendingEffect，旧缺字段不猜。生产 runtime 无浏览器测试 6/6，另 4 个现有恢复用例通过；真实已编译链恢复脚本已备，尚未运行。

两项均不新增网站专用代码、模型调用或第二份检查点存储；版本、许可证与 Windows 运行条件沿用既有依赖。完整设计、首次失败及未测项见 [PROGRESS](PROGRESS.md) 的两个 G5 所属小节；Profile 原始失败和成功结果保留在 `work/profile-owner-smoke-*.json`。

## 2026-09-27 G1：F1 调用身份与 F4 发布事务

Product Alignment:
- natural-language task: 任意浏览器任务的同一条已确认链路可按参数复跑，已验证草稿由用户手动发布。
- reusable chain boundary: `invoke` 的每次调用绑定父运行、节点、外层执行现场、子链完整版本和本次输入；发布绑定唯一草稿修订、不可变 Release 与同请求回执。
- runtime inputs: 父执行 binding/idempotencyKey、当前子链/输入、草稿 revision/checksum 与 publish requestId。
- dynamic task outputs: 独立子链输出或明确身份冲突；单次发布事实和可幂等读取的同一回执。
- generic platform capability used: 现有 TaskChainRuntime、LangGraph 检查点、SQLite/Drizzle 事务和 Zod；不新建缓存或发布状态机。
- replay model calls: 普通复跑只在显式 `llm` 节点调用模型；F1/F4 都不调用模型。
- site/task-specific code added: no

验证设计：F1 用生产 TaskChainRuntime 区分同子链的不同 invoke 节点、输入、版本及外层循环，同时确认同次恢复不重派已完成副作用；F4 用隔离 SQLite 的真实发布入口注入请求回执写入失败，核对 Release/草稿/回执同成同败、同 ID 同内容重试幂等、同 ID 不同内容被拒。两项各做最小所属验证，静态类型和单个 helper 不能替代真实入口。现有运行器、仓储和事务提供所需通用能力，无关键库引入、替换或删除。

## 2026-09-27 G2：F2 缺结果形状与 F3 选择注解拒绝

Product Alignment:
- natural-language task: 用户用业务语言确认要得到单条、列表或其他形状；准备阶段只能从真实页面证据提炼可复用选择方法。
- reusable chain boundary: 唯一确认草案及同版来源不因缺字段或缺证被改写；编译只消费合法方法或明确 gap。
- runtime inputs: 模型原响应、当前需求版本、固定来源的选择候选和实际证据；不把猜测默认值当运行输入。
- dynamic task outputs: 合法草案/方法，或可定位的缺项/缺证/服务错误，均经现有状态与审计保存。
- generic platform capability used: 现有 Zod 准入、Pi 结果解析、workflow-use SelectionProgram/QuickJS 和 B-A-T 编译 gap；不新增 Agent loop。
- replay model calls: 普通复跑仅显式 `llm` 节点；F2/F3 属访谈和首次编译，失败不触发额外模型重试。
- site/task-specific code added: no

验证设计：F2 从真实草案解析消费者输入合法数据形状与缺失形状，核对旧版不覆盖且给具体拒绝；F3 在现有 selection_annotation 生产者→来源→编译消费者区分成功方法、证据不足和服务故障，拒绝不得伪装为成功。沿现有公开结果边界做最小扩展；不引入/替换关键库，保留 vendor 工作流的 QuickJS 校验与真实来源审计。纯解析定点样本不代表模型稳定性或正式浏览器验收。

## 2026-09-27 G3：F5 精确搜索引用与读取响应减法

Product Alignment:
- natural-language task: 访谈按需只读搜索并让用户确认真实来源；准备从真实页面证明一次可复用读取方法。
- reusable chain boundary: 来源提案只引用本轮模型确实可见的指定搜索调用和结果；读取的代表样本仍由宿主保存并进入同版编译证据。
- runtime inputs: 模型选的调查对象、原样查询、搜索调用/结果引用，以及读取方法的 DOM 投影参数；数量和 proof 由工具事实推导。
- dynamic task outputs: `none/unique/multiple` 来源 Question 或明确引用错误；短模型读取回执与完整宿主证据对应的可验证来源。
- generic platform capability used: 现有 Pi MainModelTool、搜索事件旁听、Zod、Browser-Use ActionResult、workflow-use ReadSample 与编译验证；无新搜索或浏览器框架。
- replay model calls: 搜索属于访谈，读取属于首次准备；普通复跑只在显式 `llm` 节点调用模型。
- site/task-specific code added: no

真实交接字段表：`search_sources` 已把 `searchId/results[].id` 放进模型可见文本，宿主另外持有原 URL/标题/摘要和调用记录；现行 proposal 却重复生成 `searchTool/query/outcome/candidateUrls`，按同词选末次搜索。Pi `web_search` 模型可见原结果文本，宿主旁听产生的候选 ID 尚不可见。新 proposal 只让模型给 `subject/query/searchId/candidateIds`；宿主从精确调用记录推导 provider、URL、数量分支并保存，`query` 必须是该调用的原样查询。Pi 通过现有 MainModelTool 暴露完成调用的精确 ID 和可选结果 ID 后才准提交；后备直接使用原本可见 ID。业务相关性仍由模型判断。用户 Question 和历史来源保留原摘要/URL；缺引用不回退到“同词最近一次”。

`bat_read_fields` 模型输入保留 `outputPath/container/fields/maxItems`，宿主从最终输出合同推导类型/读路径。当前模型响应含整个 `ReadSample`，其中 `specificationDigest/outputDigest/pageIdentity/documentRootId/containerIdsDigest` 是宿主内部证明，模型只需 `readRef/outputPath`、至多三条代表值和当前 DOM 覆盖提醒；完整 ReadSample 保留在 `MethodReadRecords`，编译继续校验原始样本、文档身份、digest 和覆盖。缩短可见响应不是把证明移入内层字符串。验证采用生产工具边界的同词多次搜索、未展示 Pi 引用拒绝、题板/持久化投影，以及读取工具→证据验证→编译映射的所属现有用例；这些用例不证明真实 provider 的稳定语义或真实浏览器页面。

## 2026-09-27 G4：正式能力路径与缺口矩阵

矩阵按当前生产源码核对；“已有路径”仅说明代码可达，所需真实样本另列。受管真实浏览器定点样本使用独立临时 Profile：`managed-window-runner.acceptance.ts` 1/1 证明原窗口同 owner/target 在 Runner 退出后恢复与结束；`hybrid-interaction-read.acceptance.ts` 1/1 证明点击后态等待、读取与遮挡后处理在同一会话，普通动作模型调用 0。这两项没有生成新 source、编译完整业务链或创建正式工作台任务。

| 能力 | 当前生产者 → 持久化 → 编译 → 运行 | G4 结论 / G5 最小缺口 |
| --- | --- | --- |
| 1 按需访谈/来源/题板 | `InterviewCoordinator.runShared` + Pi/后备工具 → ProductStore messages/aiEvents/sourceResolutions/drafts → `syncConfirmedRequirement`/`projectPreparationPlan` 同版入口 → `TaskChainAuthoring.explorePlan`。 | 静态路径连通，G3 精确 ID/SQLite 定点通过；新版真实 Pi、全阶段 UI 与重启服务未测。 |
| 2 局部 query 与业务范围 | workflow-use `author_step`/完成复核可沿同 Agent/Browser/job 有界 `add_new_task` → source/v3 artifact → `recompileHybridSource` → fixed chain。 | 代码有续查边界；多组/跨页真实范围证明未测。`authoring.ts` 先以 `sourceSuccess=false` 抛通用错误，再检查 `confirm_intent` gap，业务歧义返回访谈可能被遮蔽，需定点修。 |
| 3 action/read/document/后态 | B-U `EvidenceCollector`/ActionDispatchAudit → source/v3 原文 → `natural_compile` 裁剪/补消费者后态、`hybrid-materializer` 证据校验 → RuntimeHost/普通能力。 | 真实 Runner 点击/后态/read 1/1；本轮同版真实 source→裁剪→编译→运行未测，模型 `done` 不能代替证明。 |
| 4 方法/选择/重复/累积 | `method_read_tool` 与 `selection_annotation` → 代表样本及 source → `natural_selection`/TS 选择 Function → QuickJS；Runtime 有 loop/condition/accumulator。 | 动态选择有代码路径、缺证可拒；`natural_compile_result` 对重复签名给 `repeated_operation_reuse_unproven`，只建 linear graph，TS authority/control loops 为空；**真实来源到循环未接通**。不能把运行器已支持循环说成任务已支持跨页/重复。 |
| 5 定位/一次派发/等待/取消恢复 | `RuntimeHost.group` → hybrid runner → `OrdinaryCapability.execute_checked` + TargetResolver/StepVerifier → checkpoint + owner 验证。 | 同会话点击、后态、读取受控样本通过；稳定定位、取消后副作用计数/恢复以及不同 DOM 时失败仍需真实受管样本。普通 `bat_scroll_to/bat_wait_for` 存在，首次创作工具入口尚未核实，不计已接通。 |
| 6 人工等待 | `TaskPlanExecutor` 的 human_wait handoff → execution/browserHandoff/cleanup 与事件 → `resume_execution` 原现场门 → UI `ExecutionActions`。 | 代码不允许正式运行在原 lease 未 active 时静默重开；真实人工等待/取消/重启恢复未测。 |
| 7 原窗口交付与清理 | plan `browserHandoff=keep_open` → execution owner/lease/targetDigest → Runner `handoff`/`managedWindowAction` → UI 聚焦/结束。 | 同 owner 原窗口真实测试 1/1；Profile `close()` 的 `finally reset()` 会把未确认清理误报 closed，需修。正式任务原页可见及 TaskRun/cleanup 分离待 G6。 |
| 8 彻底删除 | `/api/tasks` DELETE → `TaskDeletionService` 查 idle/owner、Pi sessions/journal → `ProductStore.deleteTask` 定向 operations/业务表；共享配置不在删除表。 | `source-lifecycle-diagnostics/<owner>.jsonl` 用 job.id 或 job.browserRunId 命名，删除服务未覆盖；需按任务真实 owner 精确清理、两任务隔离及重启核验。旧无 owner 回执仅可按存活事实归属，不能猜测归属。 |

G4 的矩阵已给 G5 确定适配范围；重复方法、歧义回访谈、Profile 未确认关闭和来源诊断删除是当前明确缺口。真实来源的跨页方法、取消恢复及正式 UI 尚无证据，G4 的全能力行为退出门仍未通过；G5 只沿现有组件补缺并取得这些证据后才重新判门。无新库选型，本轮只读审查及既有受管 Runner 样本不引入/替换关键组件。

## 2026-09-27 G5：按 G4 矩阵接通缺口的改动边界

### 重复方法适配的具体实施边界（进行中，尚未验收）

2026-09-27 G6 真实来源离线复核（实现前）：`work/g6-valid-source.json` 保留原始成功来源；Python 编译零 gaps，TS 首次拒绝为 `hybrid_repeat_advance_binding_invalid`。差异已定位为推进动作显式携带 `new_tab=false`：URL 仍是已验 `repeat_destination`，另一个 `authorized_constant` 由该动作的 `natural_binding/native_parameter` 事实证明。TS 把推进绑定总数固定为 1，误拒合法同 tab 参数。拟仅额外接受唯一 `new_tab=false` 常量，继续经过现有 `assertNaturalBinding` 的事实与 proofRefs 校验；URL 动态绑定、同 tab/页面谱系和未知参数拒绝规则保留。不引入库、调度或网站分支，不改来源，不以当前失败推断正式验收通过。

Product Alignment:
- natural-language task: 读取分页记录或分批列表，按已确认结果中的稳定来源键汇总。
- reusable chain boundary: 一个尾部收集步骤复用同一读取、继续查询和推进动作；代表样本不会被展开成固定页数。
- runtime inputs: 当前页 DOM、每轮新查的继续地址、已确认结果合同与现有执行预算。
- dynamic task outputs: 完整累计值，或保留运行检查点的失败/预算耗尽；最后一页先累积再判断结束。
- generic platform capability used: 已有 verified_natural_read、普通导航、loop.repeatCondition、append_unique、LangGraph 和 output assembly。
- replay model calls: 仅准备阶段至多一次结构化方法注解；普通循环零模型。
- site/task-specific code added: no

实现选择：模型只引用真实读取/查询/推进动作及稳定键路径，宿主核验同构 ReadSpec、单个继续地址、至少一次实测转移及第二页同方法读取和完整继续查询、全部动作归属；来源保存 `repeat_method` 事实。最后 `advanceActionRef=null` 只表示代表采样结束，不表示终页：最后查询可以非空，只有完整查询实际为零才记录“已观察终页”。Python 将代表样本折叠为已有能力节点并生成控制图，TS 再验来源与图后物化现有 loop/branch/accumulator。首次循环先读，后续循环在预算门通过后才推进；每轮返回先累积，复跑只有完整继续查询为空才正常结束，预算耗尽保留失败和累计检查点。已有 StateGraph/loop 足够，继续沿下方 Reuse Assessment 的组件和许可证，不新增调度器或浏览器控制器。准备无需预抓到终页；可选终页探查仍须有实测 owner/URL，不能省略未知副作用。首版仅接受一个尾部方法、显式 scalar 稳定键和可证实的地址推进；按钮状态、滚动加载、多个重复方法仍须明确缺证。

Reuse Assessment（代表样本边界增量，无新库）：沿用已审查的 LangGraph StateGraph、`read_fields`、`data.transform/deduplicate`、`loop.repeatCondition` 与 `append_unique`；组件版本、许可证、Windows/会话所有权不变。B-A-T 仅修正重复方法证据的准入：两页正例与一次真实推进即可证明可复用方法，所有非空继续查询（包括最后代表查询）仍须指向唯一合法地址，不修改来源 ReadSpec、稳定键、预算或运行调度。复跑模型调用仍为零。最小新增验证：Python 编译正反例 1/1、Python→TS 生产桥 1/1；新桥最后完整查询仍有 4 个同值链接，明确 `terminalObserved=false`，非法地址/两个目的地拒绝。首次 Python 验证如实拒绝旧的强制空终页规则，修正后通过；没有修改任何失败真实来源，也未以此替代真实浏览器或 G6 验收。

2026-09-27 真实页面补证：GitHub 发布列表的完整 Next 查询返回4份相同 href；单元素 max_results=1 会截断，不能作为唯一目的地证明。现复用既有 data.transform 的 deduplicate，完整查询后按 href 去重，输出合同最多1个目的地；新派生 repeat_destination 仅在整份重复方法证据核验后成立。普通值绑定的唯一路径规则保持；两个不同目的地必须在推进前拒绝。完整性继续依赖现有 read_fields 的 includeOrdinal/requireComplete 拒绝截断，不添加第二个DOM读取器。原失败来源不重写。

最小验证：完成接口错误码与两次复核原因持久化；方法正反例、来源篡改/遗漏动作拒绝；编译后的真实 TaskChainRuntime 在变化数据中重新查询、累积末页，并在推进前执行预算门。浏览器真实来源、正式 UI 和 G6 必须另有证据，单元测试不替代这些门。

复核更正：现有证据证明 G5 尚未实现和验证，不证明技术上无法解决。三页受控样本只覆盖基础读取/翻页。原始 done 回执显示 `[r1,r2,r3]` 被完成接口拒绝，后续分别选择 r3/r1 只返回一页；同路径读取冲突被 `AuthorTools.done` 的统一错误码掩盖。完成复核的详细拒绝理由未持久化，不能从通用 gap 推定具体语义根因。下一步应修清代表样本、重复方法与完成引用的契约衔接，并补可追溯的失败事实，而不是原样增加模型试跑；当前不能宣称正式产品通过或问题不可解决。

Product Alignment:
- natural-language task: 用户确认普通浏览器任务后，从真实页面方法执行可复跑链路；多组记录逐组处理，必要时人工处理并在原现场继续，最后能看原窗口和彻底删除本任务。
- reusable chain boundary: 每个业务主步骤只有一条参数化链；同版 source 的重复方法映射到现有 loop/condition/accumulator，已发布版本与独立运行不改写。
- runtime inputs: 当前需求/计划/来源 digest、实际页面选择与读取方法、执行 owner/lease、每轮变化输入和用户显式控制。
- dynamic task outputs: 可证明的每轮累积或明确 gap/limit/等待/清理；准确窗口交付、删除回执与本任务私有文件清理。
- generic platform capability used: 现有 Browser-Use、workflow-use 原生 capture/selection/read、B-A-T IR、LangGraph StateGraph、SQLite 事务、Pi session store 与受管 Runner；不另造浏览器控制或调度器。
- replay model calls: 普通复跑只允许显式 `llm` 节点；首次方法注解独立审计，循环/删除/清理不暗中调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从真实重复方法的同版证据编译可复跑循环，并由已有运行器推进、取消、恢复和累积。
- existing implementation in repository: workflow-use capture/natural compiler 与 Browser-Use 工具持有动作/读方法；`packages/runtime` 的 loop/condition/accumulator 和 LangGraph StateGraph 已负责推进及检查点；TS materializer 负责 B-A-T IR 映射。
- mature candidates and pinned versions: 保留当前锁文件固定的 Browser-Use、workflow-use fork、LangGraph、Zod；不新增/替换库，具体版本以本 checkout 锁文件和 fork 清单为准。
- selected implementation: 只在自然来源证据→现有 IR 映射补可证明的循环，不复制 graph scheduler、Agent loop 或读取/定位实现。
- reused public surface: 现有 source/v3、workflow-use compiler/capture、`TaskChainRuntime`/LangGraph 与 Browser-Use 原生 action/read。
- B-A-T-owned adapter and remaining gap: 固定来源身份、方法绑定、每轮输入输出/稳定键及审计；自然重复合同与真实跨页验证尚待最小样本确认，不预写第二套 DSL。
- license/runtime/platform fit: workflow-use fork 已保留 AGPL 许可证和来源清单；当前受管 Windows Runner 两项真实浏览器局部测试通过，跨平台未测。
- browser/runtime/state ownership conflicts: 同一 execution 一个受管浏览器 owner；人工等待、交付租约及 Profile 清理各自保持可核验状态；不借现有归属不明的 Chrome。
- replay model calls: 循环只运行固定普通节点；模型调用仍限显式 `llm`。
- rejected candidates and evidence: 自写循环调度器会与现有 StateGraph 重复；把重复项展开成 N 条链会破坏参数化复跑；模型逐项操控页面会破坏普通执行器边界。
- focused validation: 当前只完成 G4 矩阵和受管 Runner 的窗口/动作局部样本；循环需真实来源、编译、变化数据复跑与最后一轮累积/limit 证据后才冻结。

局部故障进展：`BrowserProfileService.close()` 未确认时保留 busy 状态并以私有标记跨服务重启阻止误报可用；现有 Runner close 缓存结果、丢弃句柄，重复调用不是有效重试，独立资源核验和恢复入口仍待完成。删除已按 task 的 job.id/browserRunId 精确清理来源诊断且保留其他任务/共享 Profile；准备遇仅含 `confirm_intent` gap 会回需求对话，缺证/服务故障不伪装成业务歧义。隔离 service/SQLite/文件定点通过，真实窗口、产品任务删除与重启恢复未测；不以类型检查替代。

G5 真实来源审查结论：隔离三页受控现场第三次生产 Runner 采集确实包含两次 Next 点击、三次成功读取与终页无 Next 查询；但最终 `sourceSuccess=false`，`trace.completed=false`，输出只有首个代表标题，复核 gap 为 `completion_review_after_continuation_unresolved`。两个点击的 `selectorIndex` 分别为 19/42，虽然历史 XPath 同为 `html/body/main/a`，宿主 `dom_structure` 明示 `query_candidate_unavailable` 和 `upstream_dom_coverage_not_proven`；终页的完整查询不能反推前两页的动态选择方法。当前来源没有可验证的循环体、继续/停止条件、每轮累积和稳定键合同；将重复动作按 XPath 合并或把已访问的三页展开成三条链都会猜测方法。故不冻结 loop 映射、不把被拒来源伪装成可编译来源；G4/G5 行为门仍未过。独立 Profile 清理恢复也缺确切 owner 核验面，不能因标记存在就自动清除。详见 PROGRESS 的三次首次失败、局部验证和未测项。

## 2026-09-27 先删后写实施：D1 智能修复退役的产品边界与验证设计

Product Alignment:
- natural-language task: 普通用户确认浏览器任务，准备可复跑链路，查看失败事实，并手动发布已验证草稿。
- reusable chain boundary: 唯一确认草案、同版来源、一个活动 TaskDraft、不可变 Release 和每次独立 Execution；退役另外一条模型改链候选流程。
- runtime inputs: 已确认需求、明确的运行参数与当前链路版本；调整反馈不再作为普通运行输入。
- dynamic task outputs: 来源、草稿、样本及独立复验、正式运行结果和准确的失败/等待/清理事实。
- generic platform capability used: 现有 Pi、Browser-Use、Zod、SQLite、LangGraph 和工作台组件；只移除智能修复专属消费者，不替换基础设施。
- replay model calls: 普通复跑仅显式 `llm` 节点可调用模型；需求访谈、准备注解独立审计，智能修复模型调用退出。
- site/task-specific code added: no

验证设计：先核对调整命令的生产者/消费者和共享作业、取消、草稿发布职责；改动后运行受影响 package 的类型检查、旧调整命令拒绝及普通草稿/发布/失败路径的最小现有用例。类型检查只能证明接线和类型，不能证明真实浏览器或正式产品闭环；UI 动态阶段仍留到 G6。

## 2026-09-27 D2/D3：手工写图、人工拾取与布局写入退役

Product Alignment:
- natural-language task: 用户确认任务后查看由真实来源编译的草稿/发布链，并从同一画布试跑、发布和再次运行。
- reusable chain boundary: 唯一草稿与不可变 Release 共用一张只读动作图；取消普通用户写节点、改路线、拾取 selector 和拖拽保存布局的第二条创作路径。
- runtime inputs: 确认需求、同版来源、草稿/发布版本及本次业务输入；画布位置不是运行输入。
- dynamic task outputs: 节点说明、阶段及运行事件、试跑/正式运行结果；查看或缩放不改变 revision/checksum/验证事实。
- generic platform capability used: 保留 React Flow、既有自动布局、BrowserProfile 登录、B-U 原生动作/TargetResolver、IR/绑定校验及 LangGraph。
- replay model calls: 普通复跑只允许显式 `llm` 节点；移除编辑/拾取不引入模型代替操作。
- site/task-specific code added: no

验证设计：先从现有调用链确认写图、拾取和布局保存是专属消费者；删除后检查合同/API/Workbench 及必要 Python runner 边界，定点覆盖草稿创建/试跑/发布、账号 Profile 以及草稿/Release 同一只读节点说明。验证查看、平移、缩放不产生 `save_task_draft` 命令；类型检查及静态组件验证不能代替真实浏览器或 G6 工作台验收。

## 2026-09-27 D4：旧格式读取退役

Product Alignment:
- natural-language task: 用户从当前工作台查看同一任务的来源、草稿、已发布链路及本次或历史运行事实。
- reusable chain boundary: 当前 source/v3、TaskDraft、Release、Execution 作为读取权威；旧 plans/chains/executions 原文读取和诊断摘要退出产品入口。
- runtime inputs: 当前任务 ID、发布版本及 execution 引用；历史旧表原文不是运行输入。
- dynamic task outputs: 当前可审计来源、结果和事件；旧格式摘要不再混入用户诊断。
- generic platform capability used: 既有 SQLite schema/migrations、Zod、当前仓储和工作台按需历史；迁移结构和防重复导入标记保留。
- replay model calls: 普通复跑仍只允许显式 `llm` 节点；删除只读旧格式入口不增减模型调用。
- site/task-specific code added: no

验证设计：沿 `legacyOriginal`、`legacyContractRows`、诊断 `legacy` 字段和路由的真实消费者删除；保留必要的旧库迁移与导入标记。用所属包类型检查及定点仓储/历史/诊断用例证明现行记录可读、旧路由拒绝或不再注册。类型检查不能证明运行态产品历史或重启后的实际持久化，后者留到 G6。

## 2026-09-27 U01–U35：主线界面收敛

Product Alignment:
- natural-language task: 用户从需求对话确认草案、生成并试跑链路、手动发布、再次运行、查看结果及原窗口。
- reusable chain boundary: 工作台只投影一份确认草案、活动草稿、不可变 Release 和单次 Execution；页面减去重复展示，不增加产品状态或第二份执行图。
- runtime inputs: 当前草案/发布引用、本次业务输入及用户明确触发的确认、运行、等待、清理和删除操作。
- dynamic task outputs: 真实搜索/题板、阶段进度、节点事件、结果、失败、原窗口与历史审计。
- generic platform capability used: 现有 Radix、AI Connect Timeline/Question Panel、React Flow、服务端投影和 SQLite 事实源。
- replay model calls: 普通复跑只允许显式 `llm` 节点；展示减法不引入模型判断。
- site/task-specific code added: no

验证设计：逐项从现有 UI/回调/投影核对重复内容与共享职责；静态文案只做定点差异，跨组件/合同的变化做 Workbench 类型检查和所属现有用例。U11/U12 未证明的共享组件重复先核对真实渲染，不先改合同；U28/U33/U35 只核验保留。成功/失败/等待、原窗口、删除确认及即时反馈必须仍可达。动态全阶段 UI/API/SQLite 与重启证据留给前置门通过后的 G6，不提前造任务截图。

U26/U27/U28/U34 补充边界：用户在本次原窗口处理登录或等待并继续，输入是所选 execution 的 ID/sequence、handoff owner/lease 与 Profile 状态；输出是本次运行结论及窗口可用事实。复用已有 resume/cleanup/cancel/handoff/Profile 命令，不修改 IR；普通复跑模型调用仍只来自显式 `llm` 节点，不加入站点特例。检查 UI 文案时区分 TaskRun 结论、窗口交付与清理结论，不把 Profile 未知或失败关闭显示为空闲。

## 2026-09-27 基础设施与模型交接的只读审查

用户要求先核验基础设施正确性和充分性：非 LLM 环节必须按明确输入、版本及现场条件返回结果或错误；模型只承担必要语义，宿主能确定或推导的事实不重复交给模型填写。逐环节证据、四个确定边界问题及字段减法见[基础设施审查](MAINLINE_METHOD_COMPILATION_GAPS.md#8-基础设施正确性充分性与-llm-字段所有权审查)。本轮仅审查和记录，未修改生产代码、运行验证或冻结新选型。

后续修复继续复用已存在的调用进度/输入摘要/循环身份、SQLite 事务、草案解析与来源失败保存、原生 Tools 和已有注解边界。不新增依赖、控制器、调度器或平行计划；既有 TargetResolver、OrdinaryCapability、StepVerifier、ReadSpec 和 LangGraph 职责应保留。

模型负担按真实工具调用和模型响应核对：AuthorInput/source/v3 是宿主协议；search_sources 的 ID 确实进入模型工具结果，原生 Pi web_search 的宿主 ID 则没有。不能从“宿主有字段”直接推断“模型能引用字段”。可推导的来源 outcome 及模型不消费的内部读取证明是明确的精简候选；完整动作能力和正式入口尚未接通的高级合同应分别记录。

## 2026-09-24 新建任务恢复实施边界

Product Alignment:
- natural-language task: 从已确认的浏览器需求继续生成可复跑草稿；准备失败时说明准确原因并从原阶段恢复
- reusable chain boundary: 一个 Requirement、一个活动 TaskDraft、显式 Release、每次独立 Execution
- runtime inputs: 当前确认需求、原计划候选、草稿 revision/checksum 与本次运行输入
- dynamic task outputs: 合法 TaskPlan、Browser-Use 来源、候选链、试跑和正式运行结果
- generic platform capability used: 现有 AI Connect、Pi AgentSession、Browser-Use、workflow-use、LangGraph、SQLite、Radix 与 React Flow
- replay model calls: 普通复跑 0；仅显式 llm 节点例外；计划纠正属于准备期独立审计
- site/task-specific code added: no

当前 checkout 为 `master@7d590363`，既有 dirty work 保留。计划失败候选只从该 job 的审计事件读取；恢复不得重建未知候选、放宽 ResultSpec 校验或自动重开 Browser-Use。新增工作仅适配上述既有能力和 B-A-T 的候选、并发、诊断及生命周期合同，不引入或替换关键库。正式通过范围以本轮页面、API、SQLite 与重启证据为准。

本轮对 `result_spec_path_conflict` 核对了 `resultSpecSchema`、workflow-use 的 `compile_result_binding` 和宿主 `assertResultBinding`：完整数组路径与第 0 项子字段不能同时拥有结果，且不同 `producerRef` 代表不同逻辑来源。第三份京东候选的父子来源各不相同，自动折叠会改变来源含义，所以没有把删掉子归属、放宽合同或重开浏览器作为修复。宿主只补充精确路径、来源及必填集合缺口诊断，交给既有计划纠正入口；第四份模型候选仍缺集合归属，按四次上限停止并保留全部审计。输出 schema 的业务字段未改。

### 自然语言调整建议与成功结果归属

Product Alignment:
- natural-language task: 用户对已有链路的步骤或运行结果说明问题，收到有前后差异、可拒绝的修改建议
- reusable chain boundary: 当前 Requirement／Release、准确 Execution 与 TaskRun 证据、唯一活动 TaskDraft；接受建议后仍须独立试跑和显式发布
- runtime inputs: 保存的用户反馈、链路 revision、执行证据及当前草稿校验值
- dynamic task outputs: 带来源审计的结构化修订候选、可审阅差异和接受后的新草稿 revision
- generic platform capability used: AI Connect `AIModelProvider.generateObject`、Zod、既有 ChainRevisionOperation／编译校验、SQLite 与工作台侧栏
- replay model calls: 普通链路复跑 0；调整建议是用户单独发起、独立审计的模型调用
- site/task-specific code added: no

Reuse Assessment:
- capability: 从已保存反馈与准确版本／运行证据生成链路修订建议
- existing implementation in repository: AI Connect 结构化输出、TaskAuthoringJob 审计、revision preview／编译／可执行校验、SQLite 草稿事务
- mature candidates and pinned versions: 沿用仓库固定的 AI Connect、Zod 和现有任务链合同；不新增依赖
- selected implementation: 复用现有结构化模型接口，新增范围受限的调整指令和 B-A-T 证据投影／候选适配
- reused public surface: `AIModelProvider.prepare().generateObject`、Zod 边界与既有 revision operations
- B-A-T-owned adapter and remaining gap: 候选来源重校验、差异确认、过期／取消／拒绝和唯一草稿接受事务；正式页面、真实建议质量和新版发布仍待验
- license/runtime/platform fit: 不变更依赖或运行时，Windows 本轮定点类型检查与假模型测试通过，macOS 未测
- browser/runtime/state ownership conflicts: 建议生成不持有浏览器；接受仍核对精确版本与运行证据，不改旧发布或执行
- replay model calls: 普通试跑／正式运行 0，只有显式 llm 节点例外
- rejected candidates and evidence: Pi Main 服务于访谈／浏览器探索，不是无工具的结构化链路修订建议接口；现有计划提示明确不生成节点图，不能挪用
- focused validation: contracts／API／Workbench 类型检查、调整聚焦测试 9 项及 BrowserProfile 门测试通过；正式 UI／API／SQLite／重启待验

用户在本轮明确授权**仅新增调整建议专用 prompt**，不扩大为访谈、计划或探索 prompt 改动。先前真实 Python About 试做来源已保存并正常关闭，但其计划要求必填 `status` 而确认需求没有给成功枚举值，来源也没有对应可执行事实；不能仅凭 `sourceSuccess` 或模型技术任务文字合成业务结果。离线内存模拟证明，当确认需求明确给出成功状态字面值时，现有自然读取和静态值归属可组装成功分支；不同需求摘要的旧来源不得复用。编译器只补可选字段缺省处理与缺失路径诊断，未虚构输出或放宽必填归属；该旧来源仍不能发布。

### G12 后续复用与正式证据边界（2026-09-24）

上方 Reuse Assessment 的“正式 UI／API／SQLite／重启待验”记录的是实施时状态。本轮随后在正式页面恢复失败建议 `b8a57468-f2f0-4172-8e1d-56108e1b9940`，沿原反馈和精确运行证据生成 `a2f0e1a2-3a01-41c4-874a-35db46798e4a` 的待确认候选；接受前活动草稿为 0，接受后才形成唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9`。样本和独立复验执行 `c5bb324c-9720-45b7-8c2c-6c9b86b42fcc`、`e165c0be-ccbe-4ac7-8c29-028d28ab93dd` 完成且清理确认；用户手动发布 Release V2 `930d7739-f6f7-4ad7-8984-93fd3f3f5bfe`，随后正式执行 `57193eb7-6b1f-43d5-82a6-e5a585dbf01f` 完成且清理确认。V1 与原四次执行保留。七次执行均无普通复跑模型／LLM 调用，输出 digest 同为 `7a5808fac2bce36b837bfaef3673b44eb15e7207fba861c4af9a079a7ca7623b`；重启前后快照文件 SHA256 同为 `11D3469DFC73645741F76564C21FE1233DA3130D839BA16F7742852BBD4E6851`。证据索引为 `work/recovery-20260924/g12-acceptance.json`、`g12-before-restart.json`、`g12-after-restart.json` 及同目录正式 UI 的亮／暗色、390px 截图。

候选只执行一次 `replace_node`，V1/V2 同一链的节点数均为 5，变更只落在 `output-assemble.label`，路线和执行输出未变。由此验收的是既有 AI Connect 结构化建议、服务端完整操作校验、用户确认、唯一草稿、两次固定链路试跑、手动发布及重启后的持久化；**不能推断行为缺陷已修复**。G12 拒绝、过期和验证失败的正式 UI 路径仍缺证据；G9 当前 provider 的联网搜索也尚未验。上述缺口继续阻止整体完成声明。

### G12 运行结果反馈交接（2026-09-25）

Product Alignment:
- natural-language task: 用户在本次运行结果旁说明哪里不符合预期，进入链路调整时保留这段未提交的业务反馈。
- reusable chain boundary: 反馈仅在同一任务当前运行的结果与调整侧栏间传递；生成建议仍由用户显式提交，并绑定准确运行和链路版本。
- runtime inputs: 当前 execution、用户已输入的反馈、所选步骤和链路引用。
- dynamic task outputs: 调整侧栏预填反馈；建议、草稿、发布和历史运行事实仍由原有流程产生。
- generic platform capability used: React 本地状态、现有 Workbench 侧栏与 TaskChainConnection。
- replay model calls: 0；用户明确点击生成修改建议后才发生独立的调整模型调用。
- site/task-specific code added: no

结果侧栏原先把反馈保存在自己的局部状态，切到调整侧栏时组件卸载，文字随之丢失。此次只修同次运行的前端临时状态交接；不改 API、持久化合同、prompt 或普通复跑。

### G9 当前 provider 搜索与来源选择正式证据（2026-09-24）

上段 G9“尚未验”是该时点状态。正式 UI 新任务 `882f4bb3-7a58-4986-b633-83f4c5769dd4` 没有用户填写的 URL；Pi 自行发起 `web_search`，query 为 `site:docs.python.org "What's New in Python 3.14"`，随后用 `present_source_candidates` 提交来源候选。SQLite `messages.aiEvents` 为两次 `tool.execution.completed` 保存了原始 `output.content` 和 `output.details`；候选事实的 provider 是 `pi-web-access:web_search`。这核验的是 Pi 工具事件经现有 adapter 进入正式 Timeline 与受限来源候选的真实一次调用，不把普通业务调研搜索强制转为来源选择，也不以宿主词表判断语义相关性。

Question Panel 展示 1 个官方候选，用户选中 `source:009bfe70f430076c645b`，准确 URL 为 `https://docs.python.org/3/whatsnew/3.14.html`；下一轮继续确认“首个实际正文段落”的业务含义，才形成 Requirement `a34888db-4de3-4f92-85b4-cbd1b1faeae8@1`。确认事实包含这条所选搜索来源；该任务的 `taskContracts` 只有 1 条需求记录，准备、草稿、发布和执行均为 0。重启前后 `work/recovery-20260924/g9-before-restart.json` 与 `g9-after-restart.json` 的 SHA256 同为 `367C12B25E5860A0C273CD20370D4AB00301ED2FE89E5ED2736DBF6807733240`；正式 UI 的搜索进度、来源选择、澄清和确认截图为同目录 `g11-g9-*.png`。

此次只覆盖当前 provider 的一次只读搜索和来源确认。可选 `summary`、凭据及其他 provider 分支仍缺正式证据；该专用任务未进入计划、Browser-Use、发布或复跑，不能据此扩大 G11/G12 或整体完成结论。

## 2026-09-22 AI Connect / Pi 能力对齐与新建任务审计

完整缺口、UI↔逻辑对应和退出门见 [PRODUCT_LOOP_CAPABILITY_AUDIT](PRODUCT_LOOP_CAPABILITY_AUDIT.md)。继续复用现有 AI Connect 连接/Authoring/Question、ai-connect-react Timeline/Composer、Pi AgentSession/ResourceLoader，不另建聊天、工具或 Agent 框架。

实际固定版本为 AI Connect `0.3.2-e61cfe91`、React `0.3.2-15d6e5f0`、Pi AgentSession `0.1.0-52e0e9c6`。vendor 归档 SHA256 与 release.json 一致；实际安装包公共模块可导入。ResourceLoader 离线加载搜索 extension 成功，注册 `web_search/source_check/fetch_content/get_search_content`，BAT 只激活 `web_search`。未执行联网搜索，不能把注册成功写成搜索端到端已通过。

实际公共事件 bridge 可把合成工具事件变为 AIEvent；公共 `projectAIInvocationTimeline` 接收 extension adapter 后可生成搜索 hook。BAT 当前调用没有传该 adapter，是明确的共享 UI 接线缺口，不是共享包没有能力。需求宿主另将任何搜索强制绑定来源选择，尚未对齐任务驱动的通用业务调研；修复应区分调研依据与用户来源决定，不能写成每个任务必须搜索/补 URL。

当前最新任务的两次模型计划均因 ResultSpec 结果所有权失败，未进入真实浏览器。不能放宽合同、删除字段或重开 B-U 掩盖问题；需要准确诊断、保存候选并复用既有纠正/恢复能力。正式 UI 另确认无图失败态无处理面板，完整新建任务闭环尚未通过。本次只有审计和文档，无产品实现或 prompt 修改。

## 2026-09-22 节点修订交互与验证含义修正

继续复用 React Flow、Radix Themes、ValueSchemaForm、现有 revision API 与编译器，不新增公共字段、图模型或编辑调度器。用户从画布选择动作，在右侧调整名称、输入绑定、输出和动作设置；新增/删除通过一批既有 revision operations 同时维护执行图和 ChainPresentation。删除前保护节点输出、变量、完成条件和循环引用，只有明确单一后继才自动接回，不能替用户猜测分支合流。

Radix `Select.Label` 必须放在 `Select.Group` 内；[官方 Select 文档](https://www.radix-ui.com/themes/docs/components/select) 的结构示例与 Group / Label 说明构成复用依据。首次新增节点弹窗暴露该组合错误，修复分组后正式 UI 通过，不替换现有组件库。

界面将 sample / verification 解释为“试跑整条链路 / 独立复跑检查”。只有输入合同声明的参数才显示表单；当前链路合同为空对象，剧名是固定节点值，无参数试跑使用保存的配置，不能在验证区直接换动漫，更不能把输入自然语言当作任务泛化。发布仍须既有候选验证门满足。

聚焦测试与类型检查已通过；正式编辑证据 `work/node-editor-1790017262509/result.json` 覆盖名称与固定输入保存还原、Function 新增/删除、执行内容与展示恢复、历史不变。正式 UI sample `work/node-trial-1790017373294/result.json` 精确绑定 chain v3 候选，completed / cleanup confirmed / llmCalls=0。仅完成本次 sample，独立复跑未执行、未发布。草稿事件独立读取并按候选精确引用及验证记录隔离，修改后立即清空旧候选显示；`work/node-trial-1790017373294/restart/result.json` 只读复核同次试跑的四阶段及 11 动作完成，未重跑浏览器任务。

## 2026-09-22 阶段展示与通用异常缺省处理

复用现有 LangGraph StateGraph、TaskChainRuntime 的结果和人工恢复机制，不新增调度器、错误状态字段或另一份执行图。`stable/v2` 正常/业务端口仍必需；可选通用错误端口有显式路由时优先执行，未处理时在当前节点沿现有结果合同收束。`stable/v1` 保持原有完整端口合同。新自然链物化复用 `compactGeneratedFailureRoutes`，只压缩来源和终态结构均与受管编译原样匹配、无业务结果/自定义原因/引用的异常路线。

画布仍用 React Flow / Dagre；业务阶段和动作节点使用同一版本化 presentation，不把任务实例写入平台。通过既有修订 API 保存用户确认的四阶段与节点名称，实际执行图精简后重新验证发布，旧发布与历史执行不改。局部验证包含 10 项稀疏链/合同/分支、4 项既有取消/人工恢复、5 项 UI 投影及相关类型检查；正式产品证据在 PROGRESS 记录，未运行全量测试。

正式复核已发布 chain v2 / release v7，sample、verification 与 Workbench replay 均零模型调用完成且清理确认；四阶段实时推进、逐阶段动作及节点类型、重启持久化均通过，汇总 `work/stage-chain-1790016501961/closure.json`。另补草稿覆盖运行及终态提前绿色两项定点回归；草稿与发布图使用显式模式切换，运行状态只来源于本次事件。

## 2026-09-22 离线编译与正式产品验收

本轮继续复用现有 browser-use / workflow-use、AI Connect bridge、QuickJS 与 LangGraph，不引入或替换关键库。删除批量可遗漏的选择函数响应，改为每个缺失函数一次有界 `semantic_annotation`：模型仅返回 source / examples，宿主拥有 actionRef、schema、绑定及节点身份。旧函数不覆盖；缺口只能形成明确编译失败，不能触发新的浏览器探索。

离线 `hybrid_annotate` 复用 compile 请求和已有模型连接合同，runner 必须没有 Browser owner。Python canonical/sourcePayloads 保留原数字词法；TS 边界禁止改写需求、计划、输入、动作及旧观察，只能追加对应动作的派生函数。新来源另存，历史来源和旧运行不变；没有引入新业务字段、Agent loop 或调度器。

局部准入为 Python 6 项、TS adapter 3 项及严格类型检查。正式门为 `work/i7-reprepare-1790013905749/result.json` 与 `source-reuse-audit.json`：原失败来源离线追加一个函数、探索次数 0、新增注解调用 1；sample / verification / Workbench replay 均完成、清理确认且模型调用 0。修订、清理恢复与需求回流的组合证据见 [PROGRESS](PROGRESS.md#当前状态)。当前 Windows x64 通过，macOS 未测。

删除未消费截图是已证明的冗余删除，不能等同性能根因已解决：当前普通 a4 点击仍耗时 47.558 秒，普通路径缺少内部阶段计时；后续优化须先取得同一 command 的阶段耗时，不扩大公共业务协议。

## 2026-09-21 紧急修复：公开动作准入与已有能力接线

本轮沿用 browser-use 0.13.8 / workflow-use 0.2.11 / QuickJS 0.32.0，不新增 Agent loop、浏览器控制器或运行调度器。
实际安装源码证明 `StructuredOutputAction.success` 默认 true 且从模型 schema 隐藏；`Agent` 构造还会再次调用公开 `Tools.use_structured_output_action`。
薄 `AuthorTools` 适配该公开方法，通过 `registry.action` 保留原生 done 的输出实现，只补必填 success/reason。结束声明仍不代替正式产品验收，也不增加语义 judge。

| 实际 action | 处理与合同 |
| --- | --- |
| navigate/go_back/wait/click/input/scroll/send_keys/select_dropdown | 由现有 workflow-step 承接，仍须当前来源绑定、目标和后置事实；Enter/click 共用唯一新增 tab 的实时 URL 收敛。 |
| find_elements | 完整查询转 read-fields，保存 text、请求属性和原 ordinal；缺属性如实省略。动态规则独立为需求绑定 Function，不由样本末项猜 count。 |
| search_page/dropdown_options | 原生只读文本发现，仅在同页事实连续时作探索证据；后续选项值仍须需求/输入绑定。不是复跑输出。 |
| extract | 仅 data 准备可用；已有确定性字段投影/显式语义合同负责复跑，不隐式重复原生提取模型。 |
| done | 显式成功/失败及原因，业务 data 合同保持不变；不产生执行节点。 |
| search | 未暴露：内建搜索引擎 URL 缺来源/输入绑定；已确认入口 navigate、站内 input/Enter 保留。 |
| find_text | 未暴露：包含滚动副作用而无复跑目标合同；search_page、scroll 和完整查询保留。 |
| switch/close | 未暴露：随机 tab suffix 无跨运行身份合同。唯一新 tab 前进由共享导航适配处理，不能将任意切页/关闭隐藏为探索。 |
| save_as_pdf、原有文件操作/evaluate/screenshot | 未暴露：当前无自然编译的文件交付或执行合同；不能调用后再静默丢弃。 |

Function 注解对每个缺失函数只有一次有界准备调用；模型只提交纯程序与变化样例，宿主拥有输入 schema、节点身份、边、预算与绑定。
来源事实和需求摘要不可分离，正式接收前复用既有 QuickJS 执行实际样本、变化样本和保留 ordinal 的数组重排；拒绝程序保留为编译 gap 和不可变来源。
代码只适配这些既有公共能力，不增加网站或业务类别固定逻辑。Windows 定点验证见 PROGRESS；macOS 仍为未测，不扩大为跨平台通过。

补充读取合同核验：browser-use 0.13.8 `tools/service.py` 的原生 `find_elements` 对全部 CSS 匹配元素使用 `textContent`，`href/src` 优先读取解析后的 DOM 属性；原有 read-fields 的默认可见 `innerText` 不能等价重放该查询。ReadField 因此明确区分 `rendered` 与 `textContent`，查询适配选择后者，默认业务字段和旧序列化摘要保持原合同。缺属性省略、完整集合上限和原 ordinal 仍由宿主校验。真实无头 Chrome 的三候选样本覆盖隐藏文字、隐藏元素、相对链接和缺属性，同时证明默认可见字段仍拒绝隐藏值。此证据只证明适配合同修复；最新正式 a-0005 的旧通用错误没有保留底层错误码，不能追溯断言它只有这一个原因。

补充导航观察核验：原生 DOMWatchdog 的摘要 URL 来自 SessionManager 异步 Target 缓存；公开 `Page.get_target_info/get_url` 则查询 CDP `Target.getTargetInfo`。本次 author scope 仅包装本次 Browser 的公开摘要方法，前后核验实时 URL、target 与 html backend，并与原生 DOM 树对应；只有稳定同一文档时才校正过期摘要 URL。模型等待后真正换 URL/document 仍拒绝旧索引，动作后的合法导航交既有 Tenacity settle 重读，不重派动作。finally 恢复原方法，诊断仅保存摘要与时间，并按 pending/native step 关联到同次 action。五项定点验证（含真实 Chrome 文档身份）和一个新增证据归属验证通过；真实站点是否命中缓存问题须等正式来源诊断，不能由本地样本推定。

## Reuse Assessment

- capability: 浏览器 Agent 探索、原生动作/DOM 能力、history 证据、确定性工作流执行和条件核验。
- existing implementation in repository: B-A-T 已有 TaskChain、LangGraph、版本、输入输出绑定、预算、幂等、恢复、持久化和模型审计。
- mature candidates and pinned versions: browser-use 0.13.8；workflow-use 0.2.11，
  commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；Python 3.12。
- selected implementation: 受管 workflow-use fork 的运行源码子集，通过公开 schema/history/Tools/Agent/StepVerifier surface 适配。
- reused public surface: browser-use Browser、Agent、Tools、action schema、history、DOM/element 查询；
  workflow-use schema、executor、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: Requirement/TaskPlan 输入、证据规范化、TaskChain 物化、版本、审计和产品生命周期；
  A 的受控页和实际任务页已通过，B/C/D 与组合验收未完成。
- license/runtime/platform fit: browser-use 为 MIT；workflow-use 为 AGPL-3.0。仓库保留许可证、固定 commit、archive digest、
  留存源码逐文件 digest 和本地变更 digest；来源校验以 LF 为规范字节，兼容 Windows checkout 的 CRLF。Windows 运行由当前 checkout 的正式验证决定。
- browser/runtime/state ownership conflicts: 一个产品运行只占用一个 Browser 会话；借用节点不关闭外层会话；
  LangGraph 是唯一图执行器，产品数据库是运行事实源。
- replay model calls: 普通节点为零；仅显式 `llm` 节点允许调用模型。
- rejected candidates and evidence: 上游 mechanical conversion 缺少任务意图、动态绑定和完整控制依据；
  LLM 整图生成会漏步骤、重排和固化样本；旧多层 patch 路线已退出。
- focused validation: 固定来源校验、主链测试、受控真实 Browser、实际任务页、变化输入/状态、模型审计和 finally 资源关闭。

## 当前结论

fork 只保留 B-A-T 运行和主链回归需要的文件：生产 Python 包、锁文件、包 README、许可证、来源/本地变更清单、
来源校验器，以及两个生成主链 fixture 的 Python 文件。上游扩展、独立 UI、示例、CI、开发测试、样本 storage 和重复文档
不参与产品运行，已从 checkout 删除。

首次探索可调用模型和浏览器；成功且业务结果完整后，程序依据 Requirement、TaskPlan、真实 trace 和 provenance 编译。
固定输入与编译版本必须产生稳定 TaskChain。复跑只执行普通能力和显式声明的 LLM 节点，所有模型调用进入运行审计。

选型尚未由完整业务验收冻结。A 已通过；B 的稳定读取、C 的异步顺序、D 的共享会话模型节点以及 E 的同链换输入仍须分别通过。

## 需求对话搜索工具复用（2026-09-20）

Product Alignment:
- natural-language task: 访谈模型在来源身份或入口确有歧义时自行决定是否搜索、搜索词和相关候选，再由用户确认来源。
- reusable chain boundary: 搜索只是需求对话的只读工具能力；确认后的来源事实供任意后续准备任务使用。
- runtime inputs: 完整对话、Pi 当前活动工具、搜索请求、真实结果/引用和用户候选选择。
- dynamic task outputs: 可审计搜索事实、稳定候选 ID、用户来源决定和仍未解决的待决事项。
- generic platform capability used: Pi ResourceLoader、extension/package、tool registry、active tools；AI Connect Question 与持久化事实。
- replay model calls: 只发生在需求对话；普通 TaskChain 复跑仍为 0，显式 `llm` 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在 Pi AgentSession 中向任意支持工具调用的访谈模型提供可发现、可审计的只读搜索工具，并允许无额外搜索密钥的后备。
- existing implementation in repository: B-A-T 已有 Bing RSS 只读 resolver、候选引用校验和 Question 投影；共享 Pi adapter 现已公开“准确 extension 来源 + active tools”入口并投影同一工具生命周期。
- mature candidates and pinned versions: `@earendil-works/pi-coding-agent` 0.84.2 tag `914cf1472e715297caa30db4b9535d534a9eb718`；`pi-web-access` 0.30.0 commit `6c5afa1d0d43eef8552284ad73f4bd9f0612a378`，MIT，支持 Pi `modelRegistry` 凭据解析和无需额外密钥的公开搜索后备。
- selected implementation: 复用 Pi `DefaultResourceLoader`、extension/tool registry 和 `pi-web-access` 的 `web_search`；只在需求访谈会话启用该工具，现有 Bing RSS 作为工具失败时的通用只读后备。模型连接仍只负责模型，搜索工具是否可用由 Pi 注册表和 extension 自身决定。
- reused public surface: `DefaultResourceLoader`、package `pi.extensions`、`pi.registerTool()`、active tools、`modelRegistry.getApiKeyAndHeaders()`、extension tool lifecycle/result，以及 `pi-web-access` 的 provider routing 与 keyless fallback。
- B-A-T-owned adapter and remaining gap: B-A-T 只声明允许的 package/tool、观察 Pi 的原始工具结果、把其中真实 URL 规范化为稳定候选并校验模型引用，然后持久化用户决定；不复制凭据、不选择搜索词、不判断相关性。R1 已从正式 Workbench 产品入口通过，剩余仅为 R5 组合复验，不再实现搜索后端。
- license/runtime/platform fit: Pi 与 `pi-web-access` 均为 MIT；Node 24/Windows x64 下，`pi-web-access` 精确版本安装、类型检查和真实 keyless 搜索通过。上游 38 个定点测试中 36 个通过，2 个 Windows 失败只涉及本项目未启用的可选命令凭据来源；macOS 延期未测。
- browser/runtime/state ownership conflicts: 搜索 extension 不启动 B-A-T 任务浏览器；需求对话仍不读取 Profile、不登录、不点击。只允许审查后的 extension 集，不能隐式加载用户全局任意 extension。
- replay model calls: 搜索由当前访谈模型发起，不增加第二个语义判断模型；普通复跑无搜索工具。
- rejected candidates and evidence: `pi-web-search` 1.6.0 只覆盖 provider 原生能力，不能给不带搜索的当前模型提供通用后备；不在 B-A-T 按供应商维护搜索矩阵，不在模型弹窗增加搜索配置，不删除 Bing 后备，不复制 Pi extension/runtime。`pi-web-access` 的可选命令凭据来源未启用，因为其 Windows 定点测试存在 2 个失败，而 `web_search` 本身不依赖该路径。
- focused validation: `opencode` 的 extension/custom tool 与多 assistant item 整轮输出投影测试 3/3（13 assertions）、包类型检查、平台持久化/confirmed tests 11/11（51 assertions）通过；同步 digest 为 `52e0e9c6630c47cb41874591dc4e5e9f7db36aca8180e4fca47b379b91be01f5`。B-A-T 实际加载 1 个 `pi-web-access` extension 且 `web_search` 恰好注册一次；来源合同测试 4/4 与 API 类型检查通过。正式 headless Workbench/API 入口完成 `web_search → present_source_candidates → Question → requirement v2`，未决事项 0，需求阶段产品浏览器命令 0；证据为 `work/requirement-dialogue-workbench-unique-2026-09-20T15-44-31-667Z`。

## 首次业务完成后的确定性读取补证（已撤销）

2026-09-18：本节记录的第二轮 Agent follow-up 已从生产入口删除。真实运行证明“再让模型选择 DOM refs/字段工具”仍把
复跑证据交给随机模型，且会增加 provider 调用。当前方案改为原生 `extract` 同页回调中的宿主记录投影；以下内容仅保留为否决证据。

Product Alignment:
- natural-language task: 首次浏览任务已完成业务读取，但原生 `extract` 尚未留下可供普通执行器复跑的字段读取证据。
- reusable chain boundary: 在同一首次探索和同一 Browser 会话内，对编译器明确报告的字段读取缺口执行一次有界补证，然后重新编译。
- runtime inputs: 已确认的输入/输出合同、首次业务结果、标准化 trace、编译缺口和仍存活的 Browser 会话。
- dynamic task outputs: 新增的 `bat_read_fields` 验证事实、重新编译后的剩余缺口和原首次业务结果。
- generic platform capability used: browser-use Agent 的公开 follow-up API、现有 `bat_read_fields`、标准化证据和编译门。
- replay model calls: 0；补证属于首次探索，冻结后的普通复跑仍只允许显式 `llm` 节点调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 业务完成后继续使用同一 Agent、消息历史和 Browser 会话收集缺失的确定性读取证据。
- existing implementation in repository: `author_step` 已拥有同一 Browser、Agent、Tools、EvidenceCollector、字段读取工具和编译器；缺口是业务 `done` 后没有补证阶段。
- mature candidates and pinned versions: browser-use 0.13.8 的 `Agent.add_new_task()` 与再次 `Agent.run()`；workflow-use 0.2.11 的既有编译和证据适配层。
- selected implementation: 复用 `add_new_task()` 发起至多一次有界补证；只在首次业务 `done` 成功、输出合同通过且编译器仍报告 `natural_field_read_evidence_missing` 时启动。首次 judge 已通过则保留原业务结果；首次 judge 未通过时，只接受补证后再次通过 judge 的完整结果。
- reused public surface: `Agent.add_new_task()` 明确保留同一 task id 和消息历史、重置控制状态并重建 Agent event bus；`run()` 重新启动同一外部 keep-alive Browser 会话。
- B-A-T-owned adapter and remaining gap: B-A-T 只识别自己的编译缺口、生成通用补证指令、合并新 trace 并重编译；不实现新的 Agent loop、选择器推理器或网站专用路径。
- license/runtime/platform fit: 延续已固定的 browser-use MIT / workflow-use AGPL-3.0 与 Windows Python 3.12 运行边界，不新增依赖。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser 或并发运行；补证仍在原产品运行中，最终由既有 `finally` 关闭外层会话。
- replay model calls: 0；补证模型调用只发生在首次 authoring。
- rejected candidates and evidence: 不把 `extract` 伪装成确定性读取；不复制 Agent loop；不靠重复整次任务碰运气；不写 GitHub 页面或业务字段 special case。
- focused validation: 先用受控多字段列表/详情样本证明单次 follow-up 只在目标缺口出现时触发且沿用同一 Agent；再执行一次真实 GitHub B 验收，要求三个字段读取缺口消失或输出新的固定失败原因，禁止无变化重试。

上述 follow-up 的“模型先用 `find_elements` 猜出 CSS，再交给 `bat_read_fields`”接口不再作为 B 的实现方向。
真实运行已经证明，即使提示词要求复用已匹配 selector，字符串参数仍允许模型自行增加父子组合；这不是可由更多提示词修复的执行契约。

## 真实 DOM 节点引用到确定性字段读取（已撤销为生产入口）

2026-09-18：opaque refs、DOM 检查工具和字段读取工具仍保留历史回归代码，但不再注册给 authoring 模型，也不再参与新的来源补证。
它们证明了 backend node/live DOM 反查边界，也证明“让模型声明字段—节点关系”并不可靠；生产迁移入口由宿主自动推导并反读验证。

Product Alignment:
- natural-language task: 首次 Agent 已从截图和 Browser-Use DOM 状态识别业务字段，需要把它实际选择的页面节点编译成零模型复跑读取。
- reusable chain boundary: 模型只选择当前观察中的真实节点并声明节点到输出字段的对应关系；B-A-T 保存有界局部 DOM 关系，机械生成并验证复跑定位表达。
- runtime inputs: 当前 Browser-Use `BrowserStateSummary`、原生 selector index、输出 schema、页面身份和同会话节点引用表。
- dynamic task outputs: 经当前页反查证明的容器与相对字段定位、字段值、局部 DOM 来源摘要和固定失败原因。
- generic platform capability used: Browser-Use `selector_map`、`EnhancedDOMTreeNode` 父子关系/backend id、Actor `Element` 与现有 `browser.read-fields`。
- replay model calls: 0；普通复跑只执行已验证定位和字段投影。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从模型已选择的真实 DOM 节点形成可持久化、可重新解析的字段读取描述。
- existing implementation in repository: `dom_evidence.py` 已复制交互节点的祖先、直接子节点、XPath、结构属性和页面身份；`read.py` 已拥有受 schema 约束的容器/相对字段读取及双读一致性校验。
- mature candidates and pinned versions: browser-use 0.13.8 的 `selector_map`、`EnhancedDOMTreeNode`、`DOMInteractedElement` 和 Actor `Element`；workflow-use 0.2.11 的原生 Agent/Tools 生命周期。
- selected implementation: 新增有界 DOM 检查工具，以 Browser-Use 当前 selector index 为锚点返回仅在本次 authoring 会话有效的 opaque node refs；`bat_read_fields` 只接受这些 refs。适配层从真实父子关系机械生成 CSS 路径，并用浏览器原生查询反查 backend id；只有容器集合和每个相对字段都与所选节点完全一致时才生成现有 `ReadSpec`。
- reused public surface: Browser-Use 负责页面观察、交互节点编号、完整增强 DOM 树、CDP 页面和 Element 包装；Chrome 负责解析生成后的 CSS；现有 `read_fields_with_proof` 负责页面、集合和双读一致性。
- B-A-T-owned adapter and remaining gap: 只维护 authoring 会话内节点引用、局部结构投影、从已选真实节点到已验证 `ReadSpec` 的转换及证据脱敏；不实现第二个 Agent loop、CSS 解析器或站点规则。当前切片先支持同一主文档内的有界对象/对象数组和标量叶；frame/shadow 边界保持显式不支持，后续复用原生能力扩展。
- license/runtime/platform fit: 不新增依赖；延续 browser-use MIT、workflow-use AGPL-3.0 与 Windows Python 3.12 边界。
- browser/runtime/state ownership conflicts: 不创建 Browser 或 Agent；节点引用绑定当前 target/url/backend node，只能在产生它的活跃页面消费。
- replay model calls: 0。
- rejected candidates and evidence: 拒绝模型提交 raw CSS；拒绝把旧 backend node id 当作跨页面持久定位；拒绝保存整页原始 DOM；拒绝复制 Browser-Use 的 Agent rerun。原生 `find_elements` 只返回扁平文本且仍以模型 CSS 为输入，不能作为节点来源证明。
- focused validation: 先证明任意模型 CSS 已从字段工具契约消失、跨页/伪造 ref 被拒绝、生成定位反查到同一 backend node、节点重建和记录重排后现有 reader 仍读取新值；再只运行一次真实 GitHub B。

首次真实 GitHub B 运行暴露了 Browser-Use `ActionResult` 的一个集成语义：同时设置
`long_term_memory` 与 `extracted_content` 时，默认只把前者放入下一轮模型上下文；只有
`include_extracted_content_only_once=true` 才会把后者放入一次性 read state。旧实现因此让动作成功、证据也被采集，
但模型实际只看到“检查了 N 个节点”的摘要，看不到任何 `dom-*` 引用。修复必须使用 Browser-Use 已有的一次性 read state
公开 surface；不能删除长期摘要，也不能把含页面文本的局部 DOM 长期保留在模型记忆或持久化证据中。

同一次修复后的第二个请求没有启动 Browser，而是复用了修复前的 source artifact。检查确认复用门只校验需求、计划、输入、
业务结果和关闭状态，没有校验 artifact 的 `forkSourceDigest` 是否仍等于当前受管 fork。编译 gap 仍是派生结果：在同一 fork
摘要下允许当前编译器重新判定；但 fork 摘要变化意味着 authoring 工具、采集或编译实现至少一项已变化，旧来源不能假装由当前
实现产生。复用门因此必须新增当前 fork 摘要匹配；不通过时重新探索，而不是继续重编译旧 trace。

修复后真实 B 已能连续提交 opaque refs，但五次 `bat_read_fields` 都返回同一个固定错误
`dom_reference_container_mismatch`。按持久化 ActionResult 的 canonical digest 反算确认了该错误，不是猜测。根因是适配层从
Browser-Use 的增强 DOM 树计算 `:nth-of-type`；该树服务于模型观察，会裁剪普通 DOM 节点，因此其兄弟序号不等于浏览器完整
DOM 的 CSS 序号。下一步保留 opaque backend-node refs，但不再从增强树推算定位：通过 Browser-Use 已有 `Page.get_element` 和
`Element.evaluate` 在被选真实节点上读取完整 live DOM 的机械路径，再由 `Page.get_elements_by_css_selector` 反查同一 backend id；
字段相对路径也只从容器和字段节点各自的 live 路径求差并在容器内反查。模型仍不提交或编辑 CSS。

真实 Browser-Use 受控页进一步暴露了 Actor 的公开前置条件：仅有 backend id 时直接调用 `Page.get_element`，
`Element.evaluate` 会因当前 CDP document 尚未请求而返回 `Document needs to be requested first`。这不是 selector
不匹配，也不能继续折叠成未知工具错误。修复复用现有 `element_from_backend`：先通过公开页面 API 初始化并核验当前主文档，
再包装已保存 backend node；容器和字段节点的查询仍反查同一 backend id。节点已被替换或离开当前文档时分别固定为
`dom_reference_container_mismatch` / `dom_reference_field_mismatch`，不回退到相似节点。

真实 GitHub job `58786140-294c-4f29-8cd0-d23254379d39` 证明上述 document 初始化修复成立：详情正文和标题的两次
`bat_read_fields` 都从 opaque refs 成功读取。新失败 `dom_reference_outside_container` 的证据中，模型为同一列表记录选择了
准确的编号、标题、标签、时间和链接节点，却把标签节点 `dom-965` 同时声明为整条记录的父容器；其余字段自然不在该节点内。
这不是目标节点失效，也不是 CSS 解析问题，而是协议仍要求模型判断父子范围。后续不得放宽为跨容器任意拼接，也不得让模型重猜
父节点；记录范围应由 B-A-T 从同一受控 DOM 中所选字段 refs 的有界最近公共祖先机械推导并用 live backend ids 反查。

Product Alignment:
- natural-language task: 首次 Agent 选择一条页面记录的真实字段节点，后续将该记录编译为可复跑字段读取。
- reusable chain boundary: 模型只声明输出记录及字段到 opaque DOM refs 的对应关系；记录容器由程序从真实父链推导。
- runtime inputs: 同一当前页面的字段 refs、Browser-Use 增强 DOM 父链、输出 schema 和 live backend nodes。
- dynamic task outputs: 经有界公共祖先和 live DOM 反查证明的记录容器、相对字段定位和值。
- generic platform capability used: Browser-Use 节点父链/backend id、现有 `browser.read-fields` 与证据门。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从多个已选字段节点确定同一记录的读取范围。
- existing implementation in repository: `DomReferenceStore` 已持有真实父链、页面身份和 backend id；`ReadSpec` 已要求容器内字段完全匹配。
- mature candidates and pinned versions: browser-use 0.13.8 `EnhancedDOMTreeNode.parent_node` 与 Actor `Element`。
- selected implementation: 移除模型可填的 `containerRef`，在每个显式 record 内对全部字段 refs 求有界最近公共祖先；跨页面、跨 frame/shadow、超过有界父链、落到文档根或多记录得到同一容器均固定失败。
- reused public surface: 继续复用 Browser-Use 父链和 `element_from_backend`；不新增 DOM 解析器或浏览器控制层。
- B-A-T-owned adapter and remaining gap: 只负责记录分组、公共祖先门和现有 `ReadSpec` 适配；字段跨刷新重绑定仍由后续字段 history target 切片完成。
- license/runtime/platform fit: 不新增依赖，延续固定 Python/Browser-Use 版本。
- browser/runtime/state ownership conflicts: 不创建新 Browser/Agent，会话和页面仍由现有 authoring 持有。
- replay model calls: 0。
- rejected candidates and evidence: 不信任模型提供父容器；不接受 `body/html` 级公共祖先；不在失败后回退到相似文本、CSS 或任意跨记录拼接。
- focused validation: 两条结构不同记录能从字段 refs 推导各自容器并读取；跨记录混选被固定拒绝；模型 schema 不再暴露 `containerRef`；DOM 错误进入诊断而非折叠为 unavailable。

## 本地环境安装

Reuse Assessment:
- capability: 一条命令安装 npm workspace、Python 3.12 和固定 Python 依赖。
- existing implementation in repository: 根 `package-lock.json`、workflow-use `uv.lock` 与
  `scripts/setup-upstream-browser-runner.mjs` 已拥有依赖同步和版本核验。
- mature candidates and pinned versions: npm 11 的 lockfile 安装；Astral uv 0.12.15 官方独立安装器及受管 Python。
- selected implementation: `npm run setup` 调用 `npm ci`，再把固定 uv 安装到忽略的 `work/tools/uv`，
  最后复用现有 `uv sync --frozen --python 3.12`。
- reused public surface: uv 的 `UV_UNMANAGED_INSTALL`、`UV_PYTHON_INSTALL_DIR`、`UV_CACHE_DIR`、
  managed Python 下载和 frozen sync。
- B-A-T-owned adapter and remaining gap: 只负责版本门、项目内路径、跨平台进程调用和最终版本核验；首次安装需要访问 npm、
  Astral/GitHub 与 Python 包源。
- license/runtime/platform fit: uv 采用 MIT OR Apache-2.0；官方安装器支持 Windows、macOS 和 Linux。
- browser/runtime/state ownership conflicts: 安装阶段不启动 Browser、模型、队列或产品服务；环境位于忽略的 `work/`。
- replay model calls: 0。
- rejected candidates and evidence: 不依赖全局 Python/pip 或手写虚拟环境；不复制解析器和安装器。
- focused validation: 全新工具目录执行 setup、重复执行 setup check、来源 digest、Python/包版本和 API TypeScript 检查。

## 旧批次计划读取兼容

Product Alignment:
- natural-language task: 启动最新代码后仍能读取任务列表并进入需求对话。
- reusable chain boundary: 已持久化计划的只读兼容；执行门继续拒绝缺少批次聚合声明的计划。
- runtime inputs: 同一协议版本下、尚未包含 `aggregates` 的历史 `batch` invocation。
- dynamic task outputs: 读取时规范化为空聚合列表，并返回明确的不可执行问题。
- generic platform capability used: Zod 持久化协议解析与 `taskPlanExecutionIssues` 执行门。
- replay model calls: 0。
- site/task-specific code added: no
# 交互节点跨页面重绑定（2026-09-18）

Product Alignment:
- natural-language task: 首次由模型选择交互节点，后续打开同类页面时由普通执行器定位并操作同一业务目标。
- reusable chain boundary: 交互动作保存 Browser-Use 历史元素身份，复跑映射到当前 selector index。
- runtime inputs: 参数化动作参数与当前页面 DOM。
- dynamic task outputs: 当前唯一目标 index、动作结果和声明的后置条件。
- generic platform capability used: 版本化目标、证据、能力节点与运行审计。
- replay model calls: 0。
- site/task-specific code added: no。

# 动作后精确目标核验（2026-09-20）

Product Alignment:
- natural-language task: 输入值后页面立即出现通知或动态层时，确认本次输入已经完成，再执行预执行学到的后续准备节点。
- reusable chain boundary: 同一普通动作派发目标的只读后置条件；后续动作仍重新解析目标和遮挡状态。
- runtime inputs: 已验证的稳定目标、本次派发保留的原生 element 与声明式 postcondition。
- dynamic task outputs: 输入/选择动作的完成事实或确定性失败。
- generic platform capability used: OrdinaryCapability、TargetResolver 和现有确定性 postcondition verifier。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: Browser-Use 历史交互元素在新 DOM 快照中的重绑定。
- existing implementation in repository: `dom_evidence.py` 已保存局部图，但编译器只产出 CSS/XPath，运行器未消费原生历史身份。
- mature candidates and pinned versions: browser-use 0.13.8 `DOMInteractedElement`、`element_hash`、`compute_stable_hash`、XPath、AX name 与 selector map。
- selected implementation: 直接保存原生哈希/结构身份；运行时及动作后控件值复查都在新 selector map 按原生层级匹配，并在每层强制唯一。
- reused public surface: `DOMInteractedElement.load_from_enhanced_dom_tree`、增强节点哈希、稳定哈希、XPath、AX 与属性。
- B-A-T-owned adapter and remaining gap: 只负责隐私安全序列化、页面范围约束、唯一性门和当前 index 输出；frame/shadow 仍显式不支持。
- license/runtime/platform fit: 不新增依赖，继续使用固定 browser-use 0.13.8 与现有 Python 3.12 进程。
- browser/runtime/state ownership conflicts: 不创建 Agent/Browser，不接管循环或会话，只读取当前 BrowserSession selector map。
- replay model calls: 0。
- rejected candidates and evidence: `Agent.rerun_history` 会接管整段历史、最终调用摘要模型并关闭会话；私有 `_update_action_indices` 返回首个弱匹配且不能作为稳定公开契约；复制 raw DOM 或 backend id 不能跨刷新。
- focused validation: selector index 改变仍按稳定哈希命中；同层多候选明确失败；编译产物保留 history identity 且不降级为 CSS/XPath；无 `aria-label` 输入框仍能在动作后唯一重绑定并读取值。

# 消费者驱动的异步就绪（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 完成真实异步交互后，把同一过程冻结为动作一次、零模型的确定性复跑。
- reusable chain boundary: 有副作用动作到其后第一个已验证目标或结构化读取之间的消费就绪合同。
- runtime inputs: 动作参数、动作前同一投影基线、下游目标/投影、页面作用域和有界等待策略。
- dynamic task outputs: 当前运行实际解析出的唯一目标或通过 schema 且稳定的投影结果。
- generic platform capability used: 现有目标重绑定、`browser.read-fields`、workflow-use `StepVerifier`/Tenacity 和 TaskChain capability。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 异步动作后等待真正的下游可消费事实，同时保证副作用动作不重试。
- existing implementation in repository: `OrdinaryCapability.execute_checked` 已先取基线、执行一次动作、再通过 `StepVerifier`/Tenacity 重查后置事实；`TargetResolver` 已重新解析当前 DOM；`ReadSpec` 已有 schema 和有界基数。
- mature candidates and pinned versions: workflow-use 0.2.11 `StepVerifier`、Tenacity 9.1.2、browser-use 0.13.8 页面/元素 API；Playwright web-first assertion 作为职责边界参考，不新增依赖。
- selected implementation: 编译器从相邻成功轨迹引用第一个 `VerifiedNaturalRead`；导航使用 `ready`，同文档/外部状态使用 `transition`；目标型消费者在目标解析入口只重试缺失。
- reused public surface: `StepVerifier.verify_step`、Tenacity 有界重试、现有 `read_fields`、目标解析和页面 scope。
- B-A-T-owned adapter and remaining gap: 生产者/消费者因果连接、基线不可读到稳定可读的转换语义、两次一致门和固定错误分类；字段投影已移出模型工具，正式结构目标 IR 与 E4 仍待冻结。
- license/runtime/platform fit: 不新增依赖，不改变 Python/TypeScript/Windows、浏览器会话或许可证边界。
- browser/runtime/state ownership conflicts: 动作仍只由现有 capability 执行一次；不创建第二个等待器、Agent loop、Browser 或状态机。
- replay model calls: 0。
- rejected candidates and evidence: 不用 DOM 静止、network idle、URL 变化或 fixed sleep 单独证明完成；不让模型选择等待类型；不建立分页/筛选/导航/懒加载场景枚举；不把歧义当作加载中。
- focused validation: 同文档投影必须变化且连续两次一致；动作创建的投影允许不可读到稳定可读；导航投影不读旧页面基线；目标缺失重试、多候选立即失败。

# 宿主拥有的记录投影与结果配方（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 用原生浏览器能力取得业务结果后，程序自动形成零模型复跑所需的记录读取和最终输出绑定。
- reusable chain boundary: 一个同页原生 `extract` 对应一个经 live DOM 反读证明的对象/对象数组读取；多个动态来源按 `ValueBinding` 装配最终输出。
- runtime inputs: 同页连续两份增强 DOM、当前 document 身份、输出 schema、任务输入、需求原文和最终成功业务输出。
- dynamic task outputs: 当前页面实际记录数、字段值、绝对链接、运行输入映射和最终任务输出。
- generic platform capability used: browser-use 增强 DOM/Actor Element、现有 `ReadSpec`/`read_fields_with_proof`、`ValueBinding` 和 `data.transform`。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在不要求模型描述 DOM、等待或输出绑定的前提下，把首次业务读取转成候选复跑规则。
- existing implementation in repository: `EvidenceCollector` 已拥有原生 extract 回调和最终输出；`ReadSpec` 已有 schema/基数/双读门；输出装配已有 merge/assemble 数据节点。
- mature candidates and pinned versions: browser-use 0.13.8 `SerializedDOMState`/`EnhancedDOMTreeNode`/Actor Element；Chrome `innerText`、属性和 URL 解析；workflow-use 0.2.11 证据生命周期。
- selected implementation: 模型只执行原生 Browser-Use 业务动作。每次 extract 后宿主在内存连续捕获两份同页增强 DOM；业务成功后用最终输出反向寻找两份快照都能唯一复现的最大字段投影，生成迁移 `ReadSpec`。数字文本只允许共同固定前后缀，空白规范化必须由最终值证明。结果配方接受 node、唯一同 schema input 和需求原文授权字符串 constant；后续动作可绑定前序读取的唯一精确值路径，未覆盖输出叶子可唯一复用已验证读取的同 schema、同值叶子。
- reused public surface: 不复制 Browser/Agent/图执行器；继续使用 browser-use 页面事实、现有 reader、TaskChain `ValueBinding` 与 `data.transform`。
- B-A-T-owned adapter and remaining gap: 当前只支持同一主文档、有界对象/对象数组、标量/标量数组字段和共同直接子路径；正式 `RecordProjection` 结构目标、frame/shadow/虚拟列表和派生数据节点仍待分阶段验证。
- license/runtime/platform fit: 不新增依赖；保持固定 Python、TypeScript、Windows 与许可证边界。
- browser/runtime/state ownership conflicts: 只读取当前 authoring Browser；没有第二轮 Agent、第二个 Browser、第二套等待器或输出运行时。
- replay model calls: 0。
- rejected candidates and evidence: 不再注册五个 B-A-T 模型工具；不信任 `extract` 回执或 metadata；不把重复值绑定到第一个节点/输入路径；不保存每条样本 selector；不把宿主生成但未由两份 DOM 共同证明的 CSS 当作证据；不把 DOM index 当作业务绑定。
- focused validation: 合成结构测试覆盖 2 条记录、普通兄弟、同节点文本+href、多值字段、重复值拒绝、一个读取节点映射多个输出字段和整体数组绑定；hybrid Python 40/40、TypeScript 定点 7/7、API 类型检查通过。最新真实 GitHub B 来源成功，但编译尚有 9 个缺口，修复后未重跑，E4 未执行。

真实 job `6d6c0e9e-4ab7-4f06-8429-1585046ece55` 的关键反证：三个原生 `extract` 均未提供可用结构化 metadata；第二页回执仍含第一页列表，
而最终 `done` 中第二页列表已经正确；详情回执又比最终输出选择的正文范围更宽。因此 `extract` 回执只能是 Agent 探索材料，不能作为编译事实源。
新的权威链为“同一动作时刻的两份同页 DOM + 最终成功输出 + 确定性反向投影”；无法唯一复现即缺口，不调用模型补证。

# 干扰与滚动可观测性（2026-09-19）

Product Alignment:
- natural-language task: 复跑浏览器动作时，准确区分原生 dialog、DOM 遮挡和滚动无效，不靠模型猜测页面语义。
- reusable chain boundary: 一个普通浏览器动作的准备、实际派发、事件命中和后置事实。
- runtime inputs: 当前稳定目标或有界 scroll 参数、当前页面状态和声明的后置条件。
- dynamic task outputs: dialog occurrence、DOM 命中关系、scroll 前后坐标/范围/事件及稳定失败原因。
- generic platform capability used: `browser.workflow-step`、browser-use Browser/Tools、CDP 事件和现有 StepVerifier。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 原生 dialog 去重、实际点击机制核验、滚动输入与效果核对。
- existing implementation in repository: browser-use 0.13.8 watchdog/Tools/ScrollEvent，A 的 `DialogEventBridge`，C 的 `NativeEventCapture` 与后态验证。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11、Tenacity 9.1.2。
- selected implementation: 复跑动作级复用已有 dialog bridge；scroll 派发窗口同时捕获 wheel/scroll，并读取前后固定数值事实。
- reused public surface: BrowserSession、Tools.act、现有 CDP EventRegistry、Page.evaluate、StepVerifier/Tenacity。
- B-A-T-owned adapter and remaining gap: owner 生命周期、无位移原因分类和审计 metadata；不拥有任意 DOM 弹窗语义判断或关闭策略。
- license/runtime/platform fit: 不新增依赖、浏览器或执行循环；沿用受管 AGPL fork 和 Windows/Python 3.12 环境。
- browser/runtime/state ownership conflicts: authoring 继续拥有 run-scoped bridge；普通复跑只在单次动作内借用并恢复同一 registry handler。
- replay model calls: 0。
- rejected candidates and evidence: `role=dialog`/样式不能证明业务语义；browser-use 合成 click 与物理鼠标机制不同；ActionResult 成功不能证明 scroll 实际位移。
- focused validation: 一个真实 Chromium 会话覆盖 native confirm、DOM 完全/部分覆盖、合成/物理点击、正常/无范围/边界/CSS 锁定/事件取消滚动；相关 Python 35/35。

# D 节点职责与沙箱选型（2026-09-19）

Product Alignment:
- natural-language task: 在确定性浏览器复跑中加入纯函数、多路条件和明确声明的语义判断，同时不让未知页面干扰触发模型接管。
- reusable chain boundary: 一个 stable/v2 TaskChain；Function、Branch、LLM 和可选准备动作均为跨网站通用语义。
- runtime inputs: 值绑定、当前页面观察或截图产物和随链版本保存的函数/prompt。
- dynamic task outputs: Function 的一个 JSON 值、Branch port 和 LLM 的一个类型化 `result`。
- generic platform capability used: Zod、LangGraph、QuickJS/WASM、browser-use/CDP、AI Connect。
- replay model calls: Function/Branch/干扰处理为 0；每个实际到达的显式 LLM 节点为 1。
- site/task-specific code added: no。

调研结论：

- [Dify Workflow 快速入门](https://docs.dify.ai/en/guides/application-orchestrate/creating-an-application) 将参数提取/LLM、IF/ELSE、列表处理和模板格式化分开，并明确规则格式化用非 LLM 节点可以获得稳定、零 token 的结果。
- [Dify 错误处理](https://docs.dify.ai/zh/use-dify/build/predefined-error-handling-logic) 把失败终止、默认值和 failure branch 作为节点运行合同，不要求模型生成错误字段。
- [Coze Studio 后端节点文档](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-%28backend%29/e4f740cd15c24f89fb9289592420bdc706fc02b5) 使用动态普通 port、default port 和 exception port；分支选择由节点实际输出映射到 port。
- [Coze Studio Code Runner 配置](https://github.com/coze-dev/coze-studio/wiki/5.-%E5%9F%BA%E7%A1%80%E7%BB%84%E4%BB%B6%E9%85%8D%E7%BD%AE/a95a5bcb378ffed2e75add220aa969cbba0ddb0d) 区分 sandbox/local，并为环境、读写、进程、网络、超时和内存提供许可边界。
- [Dify Sandbox](https://github.com/langgenius/dify-sandbox) 是 Apache-2.0 的成熟独立服务，但依赖 Linux、seccomp 和 chroot，不符合 B-A-T 当前 Windows 本地默认运行条件。
- [Node.js `vm` 文档](https://nodejs.org/download/release/latest-v21.x/docs/api/vm.html) 明确说明 `node:vm` 不是安全机制，不能执行链路内不受信任代码。
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) 通过 QuickJS/WASM 在 Node 中隔离执行 JavaScript；当前固定候选版本 0.32.0、MIT，适合作为 Windows 与 macOS 共用 Function 执行器的直接候选，但理论可移植性不能代替双平台实测。

Reuse Assessment:
- capability: stable/v2 Function、N 路 Branch、单次单值 LLM 和确定性页面干扰处理。
- existing implementation in repository: stable/v1 六类节点、ValueBinding、TaskDataContract、LangGraph runtime、browser-use/CDP adapter 和 AI Connect 审计。
- mature candidates and pinned versions: quickjs-emscripten 0.32.0；Dify Workflow/Dify Sandbox；Coze Studio workflow/code runner。
- selected implementation: Function 复用 QuickJS/WASM；Branch 采用动态 port；LLM 复用现有单次模型桥并移除 delegate。
- reused public surface: QuickJS runtime/context/interrupt；现有 Zod、LangGraph、BrowserSession/CDP 和模型审计。
- B-A-T-owned adapter and remaining gap: stable/v2 合同、v1 只读、沙箱输入输出、port 物化、固定 prompt、可选准备动作、UI 和运行证据。
- license/runtime/platform fit: quickjs-emscripten 为 MIT 且无需 Linux sidecar；安装后必须在同一 commit/lockfile 的 Node 24/Windows x64 与 macOS arm64 上验证中断、内存、栈、宿主隔离和清理；若产品支持 Intel Mac，再补 macOS x64。
- browser/runtime/state ownership conflicts: Function/LLM 无 Browser 权限；干扰处理继续借用唯一 Browser；不新增 Agent loop、图引擎或 checkpoint store。
- replay model calls: 普通路径 0；显式 LLM 每节点最多 1。
- rejected candidates and evidence: Dify Sandbox 缺 Windows 默认支持；Coze local runner 无安全隔离；`node:vm` 不是安全边界；browser-use Agent 会混合模型决策和浏览器动作。
- focused validation: React/Radix 干扰站可见 + headless；QuickJS Windows/macOS 双平台 spike；stable/v1/v2 保存加载；Function/Branch/LLM 正常和错误出口；真实页面不同输入。

# Hybrid 复跑的 HTTP 外部状态与恢复（2026-09-20）

Product Alignment:
- natural-language task: 已发布任务复跑时，主文档要求登录则暂停同一运行等待处理，主文档限流或拒绝访问则给出外部阻断且不启动修复模型。
- reusable chain boundary: 一个普通 `browser.workflow-step` 在真实主文档响应与当前浏览器观察之间形成通用外部状态结果。
- runtime inputs: 已发布链路固定 URL、真实 Chromium 主文档 HTTP 状态和当前 browser summary。
- dynamic task outputs: authentication `human_required`、rate-limit/access `blocked`、恢复观察和类型化 external failure。
- generic platform capability used: browser-use Browser、cdp-use Network 事件、TaskChain capability outcome、checkpoint 与 verifyResume。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 不读站点文案地识别主文档认证、拒绝和限流，并把人工处理后的页面重新接回同一 run。
- existing implementation in repository: BrowserSkill 路径已把 `authentication_required`/`verification_required` 映射为 `human_required`，把 `rate_limited`/`access_denied` 映射为外部阻断；TaskChain runtime 已拥有 checkpoint、resume condition 和同 run 恢复。
- mature candidates and pinned versions: browser-use 0.13.8 的现有 Browser/CDP session；cdp-use 1.4.5 的 `Network.responseReceived` 注册面与 `Network.enable` 命令。
- selected implementation: hybrid runner 订阅同一 Browser 的主文档响应，只保留当前 URL 的 401/403/429 数值；TypeScript adapter 将受控错误码映射到既有 capability outcome/externalFailure，并只对全链可安全导航恢复的场景使用当前 URL 作为恢复条件。
- reused public surface: `CDPClient.register.Network.responseReceived`、`BrowserSession.get_or_create_cdp_session`、现有 `NodeCapabilityResult`、`TaskCheckpoint` 和 `verifyResume`。
- B-A-T-owned adapter and remaining gap: 只承担 Python 安全错误码到产品通用失败合同的适配；验证码等没有协议级信号的页面仍不能靠文字猜测，本阶段不扩展 Profile/账号管理。
- license/runtime/platform fit: 不新增依赖，继续使用已固定的 Python 3.12、browser-use 0.13.8、cdp-use 1.4.5 和 Windows x64 产品范围；macOS arm64 保持延期未测。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser、Agent loop 或 checkpoint store；HTTP 事实来自 hybrid runner 已拥有的唯一 Chromium。
- replay model calls: 0。
- rejected candidates and evidence: 不按登录页文字、CSS class、站点 URL 或业务弹窗做识别；不复制网络抓取器；不把 403/429 当确定性 selector 失败；不为恢复创建新 execution/run。
- focused validation: 401 等待并在受控外部状态解除后恢复同一 run；403/429 为 external block 且无 repair；普通 200 页面不改变既有 hybrid 运行。

# 无参数任务的准备输入语义（2026-09-20）

Product Alignment:
- natural-language task: 用户确认一个无需填写业务参数的浏览器任务后，系统自动完成样本验证、独立复验和发布。
- reusable chain boundary: 一份输入合同为 `null` 的通用任务计划及其两次独立验证运行。
- runtime inputs: 合同允许的 JSON `null` 值；它是已捕获输入，不是“尚未提供”的哨兵。
- dynamic task outputs: 两次执行回执、不可变 release 和默认 preset。
- generic platform capability used: ValueSchema、准备状态机、TaskExecution 和产品发布投影。
- replay model calls: 0；首次准备阶段的模型调用保持原有审计。
- site/task-specific code added: no。

# 根对象业务结果的字段绑定（2026-09-20）

Product Alignment:
- natural-language task: 浏览器一次读取返回完整业务对象时，按已确认的 ResultSpec 字段将该对象发布为可复跑业务结果。
- reusable chain boundary: 一份已验证的根对象输出与若干不重叠的声明字段之间的确定性绑定。
- runtime inputs: verified output assembly、有限 ValueSchema 和计划拥有的 producerRef。
- dynamic task outputs: 每个声明字段对应的 `ResultBinding.assignment`，来源仍指向同一个已验证节点的子路径。
- generic platform capability used: workflow-use output assembly、ResultSpec/ResultBinding、ValueBinding path。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将一个已验证根对象拆分绑定到多个声明结果字段。
- existing implementation in repository: workflow-use 已拥有 output assembly、字段所有权检查与 ResultBinding 编译；TypeScript host 已逐 assignment 校验源/目标 schema。
- mature candidates and pinned versions: 受管 workflow-use 0.2.11 fork；无需新增库。
- selected implementation: 扩展现有 `compile_result_binding`，仅在根/祖先来源覆盖多个不重叠声明字段时追加相对子路径。
- reused public surface: 已有 `ValueBinding.path`、`ResultBinding.assignments` 和 host `assertAssignmentSchemas`。
- B-A-T-owned adapter and remaining gap: 无新增运行时；只补齐已有公共合同的确定性 lowering。
- license/runtime/platform fit: 不新增依赖或平台要求，继续由受管 fork 哈希门保护。
- browser/runtime/state ownership conflicts: 无；不创建浏览器、Agent loop 或状态库。
- replay model calls: 0。
- rejected candidates and evidence: 不把两个业务字段合并成一个虚构 producerRef，不按字段名猜来源，也不放宽无证据输出。
- focused validation: Python 定点测试覆盖根对象拆分；TypeScript host 继续校验每个子路径 schema；随后以真实业务结果任务验收。

# 修复探索来源身份（2026-09-20）

Product Alignment:
- natural-language task: 用户授权依据某次真实确定性失败重新准备任务，并保留失败证据与旧版本。
- reusable chain boundary: 修复探索任务文本、Python 返回的自然来源和 TypeScript host 身份核验使用同一份失败证据。
- runtime inputs: 已确认需求、计划、失败运行输入和持久化 `TaskExecutionFailureEvidence`。
- dynamic task outputs: 绑定该失败证据的新候选链、两次验证与新不可变 release。
- generic platform capability used: 既有 repair coordinator、browserUseTask、source artifact 和 host source identity gate。
- replay model calls: 0；只有用户授权的修复探索允许模型调用。
- site/task-specific code added: no。

# 自然来源中的可选页面准备（2026-09-20）

Product Alignment:
- natural-language task: 预执行遇到会遮挡后续业务操作的对话层时，把已验证的关闭动作编入新版本；复跑页面没有该对话层时直接跳过。
- reusable chain boundary: 同文档内一个有单次派发证据的准备动作和紧随其后的稳定目标消费者，物化为“检查消费者；必要时准备；再次检查”的通用分支。
- runtime inputs: 原始自然 trace 的遮挡变化、对话语义、原生派发、文档身份及消费者稳定目标证据。
- dynamic task outputs: `ready | missing | blocked | ambiguous` 目标就绪性和确定性分支结果。
- generic platform capability used: 既有 workflow-use 稳定目标解析、`materializePreparationGraph`、stable/v2 Branch 和同一 Browser session。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已准备页面变体的可选动作及后续目标就绪性检查。
- existing implementation in repository: workflow-use 已拥有唯一目标解析、命中遮挡检查和文档身份；host 已有未接入的 `materializePreparationGraph`。
- mature candidates and pinned versions: 受管 workflow-use 0.2.11、browser-use 0.13.8、现有 stable/v2 runtime；无需新增库。
- selected implementation: 从已校验原始事实保守识别“对话内单次 click 改变 overlay 状态，且同文档后续目标变为唯一可操作”的相邻动作；复用现有准备图并给 runner 增加只读目标就绪性命令。
- reused public surface: `TargetResolver.prepare_action_target`、目标准备的 document identity、TaskChain capability/branch ports。
- B-A-T-owned adapter and remaining gap: 只负责证据到版本化准备图的适配和 TS/Python 协议；无法证明的页面变化仍显式中断并要求重新准备。
- license/runtime/platform fit: 不新增依赖；Windows x64 当前范围，macOS arm64 继续延期未测。
- browser/runtime/state ownership conflicts: 检查、准备和消费者共用一个 runner/Browser；不新增 Agent loop、运行时或 checkpoint store。
- replay model calls: 0。
- rejected candidates and evidence: 不按网站、文案、业务字段、CSS class 或 URL 猜弹窗；不让模型在复跑时临时找关闭按钮；不把准备动作无条件执行。
- focused validation: 纯合同测试覆盖证据不足拒绝与图改写；真实 headless 页面同时覆盖 overlay 存在和不存在，两条路径都零模型。

# 修复候选的零派发验证重试（2026-09-20）

Product Alignment:
- natural-language task: 用户已授权并生成新候选后，若验证在任何节点或 Browser 命令派发前因宿主预检失败，修好宿主后继续验证同一候选。
- reusable chain boundary: 同一失败证据、同一已保存不可变候选和一次新的显式重试授权。
- runtime inputs: 失败修复任务、候选链引用、零 transitions/commands/invocations 的验证执行事实。
- dynamic task outputs: 新的验证执行；通过后继续双输入验证和发布。
- generic platform capability used: 已有 repair job、TaskExecution consumption、不可变 chain reference 和验证队列。
- replay model calls: 0；只有没有可复用候选时才重新探索。
- site/task-specific code added: no。
## 2026-09-20 自然语言站点入口与只读链路画布

```text
Product Alignment:
- natural-language task: 用户只说目标站点名称和业务目标，准备任务自行确定预执行入口；用户可查看实际发布的节点链路
- reusable chain boundary: 计划保存需求授权范围内的预执行入口，链路画布只投影已保存的计划、链版本、节点和运行证据
- runtime inputs: 只有复跑时会变化的业务值；入口 URL 不进入用户运行表单
- dynamic task outputs: 经预执行验证的 TaskChain、版本状态、节点图和运行审计
- generic platform capability used: TaskPlan、受控 origin grant、React Flow、既有 TaskChainConnection
- replay model calls: 普通复跑不增加模型调用；入口只在规划/预执行阶段形成
- site/task-specific code added: no
```

真实新建任务暴露了 P6 样本未覆盖的合同断层：已确认需求明确写有站点名称，但 `collectOrigins` 只识别完整 URL，准备流程把空 `allowedOrigins` 直接交给 hybrid runner，两次均在任何浏览器动作和探索模型调用前失败。修复把通用 `entryUrls` 保存为计划事实，由规划模型根据已确认来源生成，宿主再派生受控 origin；不向用户请求 `startUrl`，也不为具体网站加映射。旧计划继续可读，新规划候选必须提供至少一个 http/https 入口。

原 React Flow `LiveChain` 组件和节点投影从未删除，但产品导航曾移除唯一入口。当前恢复为“链路画布”只读标签页，保留平移、缩放、版本选择、节点详情与运行证据；JSON 输入框和内部样本/换输入验证按钮不回到正常产品路径。

# 执行资源清理与链路工作台修订（2026-09-21）

第三次真实正式复跑证明：当前上游 runner close 的非零退出码会覆盖已经 completed 的 TaskRun，并被通用 catch 误分类为可模型修复的确定性链路失败。
当前清理实现已经拥有 ChildProcess、browser-use Browser owner、Windows 精确 PID 树终止和临时目录删除；缺口是结构化清理报告、幂等 close、
持久化恢复和产品投影，不是缺少另一个进程框架或浏览器驱动。新增第三方进程管理库不能解决 owner、Profile、历史结果和 cleanup_required 合同，因此不采用。

最初调研先后把问题误判为“只缺自动布局”和“需要容器/子画布编辑器”。当时进一步核验后形成“阶段总览 + 单个临时动作摘要 + 聚焦真实动作子图”的结论；2026-09-29 的准备期长链反例证明单个摘要仍不足，项目最高层级规则又明确禁止切换成另一张子图。当前决定改为每个阶段父节点内常驻紧凑动作列表；分支、循环和复杂出口也只在原父节点原位展开。列表行和展开路由只引用同一 TaskChain 的真实 nodeId/edge，不是 React Flow compound child、第二份图或可执行子链。

仓库已经使用 `@xyflow/react@12.11.6`。其公开节点、边、Handle、选择、重连、视口和 MiniMap 足以覆盖阶段父节点总览；阶段内的动作列表和原位展开路由是同一父节点的 DOM/SVG 内容，不需要 React Flow `parentId` 的复合 sub-flow 或另一张 focus graph。`@dagrejs/dagre@3.1.1` 为 MIT，含 TypeScript 声明，直接依赖 `@dagrejs/graphlib@4.0.5`；npm 元数据的 unpacked size 分别约 1.41 MB 与 0.47 MB，约 1.9 MB 不是浏览器最终 bundle，也不是启动时解包 8 MB。Dagre 只在首次投影、阶段结构改变或用户点击“整理布局”时计算父节点坐标，不在每次渲染运行。

FlowGram.AI 与 Coze Studio 仍是有价值的产品参考，但不作为生产编辑器依赖。官方 free-layout loop 示例用 `isContainer` 建立容器；`toggleLoopExpanded` 在折叠/展开时改变容器尺寸并隐藏/显示子节点和连线。当前方案拒绝由第二批画布节点组成的 compound sub-flow；阶段卡里的动作列表与展开路由是同一父节点的 DOM/SVG 投影，不参与运行调度。FlowGram 的 editor/document/form/history/variable 等广泛状态所有权也会与 B-A-T 已有服务端 revision、checksum、digest 和持久化事实源重叠。ELK 对阶段父节点布局没有 Dagre 之外的已证实价值，因此本轮不引入。

节点详情不能由 UI 递归解释任意 config。需要新增通用 capability descriptor registry，为每种平台能力声明标题/摘要生成、类型化字段、控件、目标要求、端口、兼容替换和验证支持。它不认识网站、业务字段、页面文案或 CSS class。缺少 descriptor 的 capability 只读，不能用 JSON 编辑器兜底。修改原子动作时必须连同所属阶段、前置条件、后置条件和下一动作展示；任何执行语义改变使旧验证失效，直到聚焦验证重新证明阶段具名出口可达。

CodeGraph 对当前接线的核验还显示：任务行选择只更新选中项；运行命令在侧栏/独立 Dialog，accepted 后没有把新 execution 交给链路画布；现有节点投影会跨多个 TaskRun 按节点取最后事件。故“增加运行按钮和动画”不是完整修复，必须先增加幂等 accepted execution 回执、按 execution/sequence 的事件续接，再由画布绑定单次运行。左侧列表只保留选择和即时反馈。

参考：

- https://github.com/coze-dev/coze-studio/blob/main/README.md
- https://github.com/bytedance/flowgram.ai
- https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/nodes/loop/index.ts
- https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/utils/toggle-loop-expanded.ts
- https://reactflow.dev/learn/layouting/layouting
- https://reactflow.dev/learn/layouting/sub-flows
- https://reactflow.dev/learn/advanced-use/performance

Reuse Assessment:
- capability: 正式 execution 所属资源的可靠清理与恢复；带阶段总览、阶段内原位展开编辑和单次 execution 实时运行态的链路工作台。
- existing implementation in repository: ChildProcess/browser-use owner/Windows PID 树终止/临时目录清理；`@xyflow/react@12.11.6`、revision draft layout/checksum/digest、TaskRun 持久化事件。
- mature candidates and pinned versions: 保留现有 runner/browser 公共面；`@xyflow/react@12.11.6`、`@dagrejs/dagre@3.1.1`；FlowGram 1.0.14 与 ELK 仅为对照候选。
- selected implementation: 现有 runner adapter 增加结构化 cleanup report；UI 保留 React Flow，Dagre 只布局阶段父节点，复杂路由在父节点内原位展开。
- reused public surface: ChildProcess close/exit、browser-use Browser close/kill；React Flow nodes/edges/handles/selection/reconnect/viewport/minimap；Dagre graph/layout/rankdir。
- B-A-T-owned adapter and remaining gap: cleanup 持久化与产品状态、accepted execution/事件续接、ChainPresentation/CapabilityDescriptor 服务端事实、TaskChain/阶段/事件到编辑器模型映射、发布布局来源和上下文节点编辑。
- license/runtime/platform fit: 不为清理新增依赖；React Flow/Dagre 均为 MIT，Dagre 含类型声明；Windows/Vite headless 隔离原型已通过，生产接线仍待 I5，macOS arm64 仍延期未测。
- browser/runtime/state ownership conflicts: 不新增 Browser/CDP owner；编辑器不拥有 runtime、版本或执行状态。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 忽略 close/按退出码改判、第三方进程框架、固定网格、两套可执行图、永久大容器子画布、FlowGram 的重叠状态所有权、无证据引入 ELK、自研画布/布局和原始 JSON 编辑均不能满足当前不变量。
- focused validation: I0 React Flow+Dagre 隔离原型；I2 真实 child cleanup；I4 presentation/descriptor 服务端合同；I5 生产运行台；I6 修订发布；I7 正式 Workbench/API 画布内复跑、cleanup_required 恢复和产品闭环。
# 2026-09-24 新建凡人任务样本观察恢复

Product Alignment:
- natural-language task: 从新建需求准备并复跑“在 Bilibili 播放当前最新可播放的《凡人修仙传》正片”。
- reusable chain boundary: 已编译草稿的普通执行器只重取当前页面观察；失败的样本执行和链版本保持不可变。
- runtime inputs: 当前浏览器会话、标签页、URL 与 DOM；无业务输入。
- dynamic task outputs: 同一次浏览器动作之后一致的页面身份与观察摘要，供运行检查点审计。
- generic platform capability used: 已有 Browser-Use 页面状态读取、workflow-use 页面身份检查、TaskRun 事件和清理协议。
- replay model calls: 0；重取观察不重发浏览器动作或调用模型。
- site/task-specific code added: no。

新建任务 `2a777a77-353e-4894-9b96-1e505827d366` 的一次 headless Browser-Use 代表试做成功并编成唯一草稿；首个样本运行在 `s-a-0008` 点击后以 `target_document_identity_unavailable` 失败，前面节点已完成，14 次浏览器命令、0 次模型调用，清理已确认。当前错误把页面身份探测的底层异常折叠为同一代码，尚不能证明唯一根因。点击后的 URL 变化与观察时 DOM 尚不可用存在竞态风险；修复只在普通观察读取暂不可用时短时重取整份快照，保持标签页和 URL 一致，不重发动作。现有 Browser-Use 和 workflow-use 已提供全部读取能力，不引入新依赖。

Product Alignment:
- natural-language task: 同一新建任务必须每次重新选择 Bilibili 当前可播放的最新正片，并排除非正片。
- reusable chain boundary: 只修订该任务的唯一草稿；从当前剧集列表读取候选，经纯函数选出序号，再让同一链路继续点击和播放。
- runtime inputs: 无；剧集列表是本次浏览器页面的动态观察。
- dynamic task outputs: 当前候选序号及播放状态，历史失败样本和旧任务发布版本不改写。
- generic platform capability used: 已有 read-fields、function、结构目标序号绑定、草稿修订 API 与画布展示。
- replay model calls: 0；普通样本和正式运行只用固定执行器。
- site/task-specific code added: no；剧集筛选表达式和页面选择器仅保存在此任务草稿数据中。

原始新草稿在进入剧集页后直接点预执行时记录的 `a[6]`，没有读取剧集列表或绑定最新候选，不能满足已确认需求。开发者随后通过 headless 页面脚本直接调用草稿 API，参考此项目中该任务旧 Release V8 的“读取列表→纯函数选序号→结构目标点击”任务数据，为新草稿补入两个节点并替换点击配置，同时在非正片过滤中加入本次需求明确的 PV；其余计划和动作保持不变。这是开发者手工构造的修订数据，没有使用产品给用户的修订入口或自然语言调整建议确认。后续样本、独立复验和页面发布的技术事实不能替代新任务的完整产品验收；历史 V8 的运行也不能替代新任务验收。

Product Alignment:
- natural-language task: 修订后的浏览器链路要在已确认计划额度内完成样本与复验，发布后工作台要展示当前版本的真实状态。
- reusable chain boundary: 预算修订生成新的草稿版本和候选快照；历史执行和准备失败保留审计，不回写发布链路。
- runtime inputs: 当前计划步骤授权上限、草稿命令额度、准备活动与发布的时间顺序。
- dynamic task outputs: 当前草稿的预算、验证记录与当前工作台活动状态。
- generic platform capability used: TaskDraft 修订、TaskPlan 额度校验、TaskExecution/Release 投影。
- replay model calls: 0；这些改动不增加普通复跑模型调用。
- site/task-specific code added: no；站点和剧集规则只在任务草稿与发布数据中。

新任务的开发者修订链 v2 增加了当前页面读取和函数选择，仍保留旧的 15 次命令额度，第二次样本在 15/15 后于目标点击前被预算阻断。计划步骤授权上限为 3850；开发者再次通过页面脚本直接调用草稿修订 API 将额度显式设为 24，产生草稿 revision 2 / 链 v3，清空旧验证。新的样本及独立复验各使用 17 次浏览器命令、0 次模型调用，均完成并确认清理，随后从正式画布点击发布 Release V1。审计曾发现一段只沿成功直线推算命令数的自动算法，无法覆盖分支、循环和异常观察，且本任务没有实际用到；已删除，只保留受计划上限约束的显式修订和真实试跑验证。发布后的旧准备失败一度仍被工作台投影为当前活动；按当前草稿/发布与准备活动的时间顺序修正投影，旧失败记录不删除。发布后普通执行已完成两次，但依赖前述开发者直接修订，故完整用户产品路径仍未通过验收。

Product Alignment:
- natural-language task: 浏览器任务中的一次点击或 Enter 打开新标签页后，预执行仍须保存可编译的真实页面证据。
- reusable chain boundary: 仅给本次 Browser-Use owner 新附加的页面会话解除调试暂停；不改动作、链路或来源合同。
- runtime inputs: 受管 Browser-Use 会话及 Target.attachedToTarget 的 page/session 身份。
- dynamic task outputs: 原生新页面继续导航后由现有观察、编译和运行路径生成的事实。
- generic platform capability used: browser-use 0.13.8 SessionManager attach 流程与 cdp-use 1.4.5 Runtime.runIfWaitingForDebugger。
- replay model calls: 0；附加页恢复不调用模型或重复浏览器业务动作。
- site/task-specific code added: no。

本地安装包源码核验：`SessionManager._handle_target_attached` 仅在事件 `waitingForDebugger=true` 时调用 `Runtime.runIfWaitingForDebugger`，而 `BrowserSession.get_or_create_cdp_session(focus=True)` 已对聚焦页面无条件调用同一命令并将失败视为非致命。`cdp-use` 事件注册每个 method 只有一个 handler，因此 B-A-T 不能另注册 `Target.attachedToTarget` 以免覆盖 Browser-Use 的会话池。已验证的实验适配限于本次 Browser 实例：对该事件标识的 page session **先**有界发送相同恢复命令，再执行原 attach 回调；已关闭标签页的会话缺失按短生命周期处理。此前仅由采样推测的标签发现扩窗和 DOM 重读补丁已经撤回；它们没有证明针对本故障。

Product Alignment:
- natural-language task: 每次运行都从当页可能变化的候选集合中按已确认规则选择目标。
- reusable chain boundary: 首次 Browser-Use 试做必须留下完整候选读取与目标绑定；缺证的集合点击不进入可发布候选。
- runtime inputs: 当前页面的候选集合，不使用样本序号、站点名称或剧集编号。
- dynamic task outputs: 已证明的读取、纯函数选择结果及本次目标序号。
- generic platform capability used: Browser-Use find_elements、既有 verified_natural_read、selection_function 与编译 gap。
- replay model calls: 0；选择函数仅在准备时生成，普通复跑不调用模型。
- site/task-specific code added: no。

原始凡人来源 a-0008 的同级链接共享结构 class，但没有该页的完整候选读取，编译器误把历史 a[6] 当成可复跑目标。通用修正对这种未绑定集合点击在原生派发前向探索 Agent 返回读取要求，并在离线编译时拒绝固定 XPath；不允许历史成功运行或开发脚本修订回填这个来源。以该来源的原始持久事实离线检查，现返回 `collection_selection_read_required`，目标为 null。此门只阻止假成功；后续仍须用新的正式预执行、两次验证、手动发布和再次运行证明首次编译真正完成。

2026-09-25 接入核验：沿用 `browser-use@0.13.8` 和 `cdp-use@1.4.5`，复用实验项目 `PopupResumeAdapter` 的单实例方法包装，不替换库、不接管 B-U 会话池。B-A-T 的 `Runner.start`/`start_profile` 在 `Browser.start()` 后安装，`Runner._close` 的 `finally` 还原；本地 headless Enter 开页样本新增 1 页，恢复 2/2、清理确认，见 `work/recovery-20260925/popup-smoke-result.json`。这是通用新标签行为证据，正式《凡人》准备与链路编译仍需单独验收。

Product Alignment:
- natural-language task: 每次从当前页面的完整候选集合按用户已确认规则点击目标。
- reusable chain boundary: 集合点击只消费本次同页 `find_elements` 的已验证读取；准备期纯函数将读取转换为运行时 ordinal，候选漂移要求重新读取。
- runtime inputs: 当前 DOM 集合及准确页面身份；不得沿用探索时的序号。
- dynamic task outputs: 已验证读取引用、纯函数所选原始 ordinal、同次目标点击。
- generic platform capability used: 现有 `find_elements`、`verified_natural_read`、`browser.read-fields`、QuickJS function 与结构目标绑定。
- replay model calls: 0；模型只在准备期生成并校验选择函数。
- site/task-specific code added: no。

合同审查发现：`verified_collection_query` 只核对页签、URL、数量与被点击 backend，未核对当前集合身份/内容仍等于原读取；`selection_read` 未核对读取 targetId 与点击前 tab，`bind_selection_function` 在匹配失败时放行原样点击。修正只关联内部集合读取来源并在原 Browser owner 内复核，保留唯一语义标签目标的固定路径；不引入浏览器控制、图调度或模型后备。

Product Alignment:
- natural-language task: 从 Bilibili 现场查到作品入口后继续进入剧集页，再按本次页面列表选择最新正片。
- reusable chain boundary: 导航地址必须绑定到此前已验证读取的确切输出字段；多次读取同一值时，以最近一次仍能唯一定位该值的读取为来源，单次读取内重复值仍拒绝。
- runtime inputs: 当前页面重新读取的链接集合；无用户业务参数。
- dynamic task outputs: 已验证的链接字段和后续当前剧集选择，不固化一次性页面 URL。
- generic platform capability used: 既有 `verified_natural_read`、node output binding、编译器来源校验和 `browser.read-fields`。
- replay model calls: 0；普通复跑只消费确定性读取输出。
- site/task-specific code added: no。

2026-09-25 正式新任务首编译事实：代表试做已通过新页进入 Bilibili 搜索页，完成 10 次浏览器命令并观察到播放；`a-0006` 的精确作品链接读取只含一条，`a-0007 navigate.url` 与其中 `attribute_href` 相等。先前更宽的 `a-0005` 读取也含同一 URL 四次，旧绑定器把所有历史匹配并在两次读取之间判为歧义，留下唯一 `natural_binding_evidence_missing:url` gap。收集器已改为优先最近的唯一读取，同次读取多路径歧义仍拒绝。

Product Alignment:
- natural-language task: 准备任务已有有效方案、代表试做却缺少可编译的页面来源时，从该方案重新采集一次证据。
- reusable chain boundary: 仅在完整旧来源的编译缺口全部要求 `collect_evidence` 时显示显式续做；旧来源、运行和失败审计不可改写。
- runtime inputs: 当前已确认需求、保存的方案与代表输入，以及本次新浏览器页面事实。
- dynamic task outputs: 新的独立试做来源和草稿候选；旧编译缺口保留可追溯。
- generic platform capability used: 既有准备任务 `resume_preparation_from_plan`、source artifact 校验和 Browser-Use 单会话 owner。
- replay model calls: 0；重新采集只发生在准备任务，正式复跑仍无隐式模型调用。
- site/task-specific code added: no。

旧来源的 `a-0007` 预观察里没有 URL 绑定事实，但完整 trace 已保存更早的已验证读取。续做门据来源 artifact 的 `collect_evidence` 缺口开放，明确从保存方案开启新的代表试做；旧来源和失败审计始终保留。第二次真实试做解决了入口 URL 绑定问题，后续却因宽泛按钮查询导致入口点击的自动 Function 样本无有效输出，且最新剧集 Function 的变化样本超出读取规格的 ordinal 上限，留下 `function_output_invalid`。不应直接第三次试做或修改模型答案。

Product Alignment:
- natural-language task: 已保存试做中，若导航参数与此前已验证读取的唯一字段完全相等，可以从不可变 trace 恢复来源绑定。
- reusable chain boundary: 离线编译器只派生来源决策，不修改原浏览器事实；TS 入库侧独立复核原始读取、动作顺序、值和唯一字段路径。
- runtime inputs: 运行时的 `browser.read-fields` 节点输出，而非本次试做 URL 常量。
- dynamic task outputs: 后续导航地址随实时读取更新；原 trace 和旧失败记录不改。
- generic platform capability used: 现有 `verified_natural_read`、node output binding 和离线编译恢复。
- replay model calls: 0。
- site/task-specific code added: no。

Product Alignment:
- natural-language task: 从页面候选中读取首项后继续执行；候选为空时明确失败，不报告任务完成。
- reusable chain boundary: 已验证读取的输出 schema 若保证所用索引存在，编译器可直接使用该索引；读取不满足 schema 时由运行时进入失败路径。未受 schema 保证的索引仍须有显式控制流。
- runtime inputs: 当前浏览器读取结果，不使用探索样本列表。
- dynamic task outputs: 当前读取的首项字段及其后续动作；空列表产生可审计的运行失败。
- generic platform capability used: `browser.read-fields` 输出 schema 校验、已有失败路由和节点输出绑定。
- replay model calls: 0。
- site/task-specific code added: no。

Product Alignment:
- natural-language task: 首次试做必须能把中间页面动作和最终动态目标分别编译为可复跑链路；页面候选变化时仍按相应步骤的规则选择。
- reusable chain boundary: 选择注解只使用当步真实读取、动作上下文与已确认需求；模型变化样例必须落在该读取的输入和输出合同内，异常直接留下编译缺口。
- runtime inputs: 本次页面重新读取的候选与其原始 ordinal，不使用上次试做的候选位置。
- dynamic task outputs: 当步纯函数选择的 ordinal、动作结果及后续播放状态。
- generic platform capability used: 既有 Browser-Use find_elements、verified_natural_read、准备期 selection annotation、QuickJS 合同校验和 CollectionReadRequired 补读回路。
- replay model calls: 0；仅首次准备期对缺失的选择规则生成程序。
- site/task-specific code added: no。

2026-09-25 第二次新来源的首编译失败分两处：中间页的宽泛 `button` 查询包含 41 个不同用途的控件，模型把最终“最新正片”规则错套到只显示“立即观看”的中间动作，真实观察样例即失败；最终剧集选择程序的变化样例输出 ordinal 91/52/77，超出浏览器读取 `maxItems=50`。修正必须在新的 B-U 之前作用于常规准备路径：让当步动作语义和候选合同进入注解边界，保留严格的实际样例与变化样例校验；不能通过删除失败样例、放宽运行合同或复用旧来源宣称成功。

2026-09-25 新任务 `b1e38157-4e23-4511-9dbe-7eaaf6ca07c2` 的第一次正式准备：B-U 已完成并观察到播放，14 次浏览器命令，入口导航绑定与宽泛中间按钮问题未再出现；自动首编译仍在 a-0013 留下 `selection_annotation_unavailable` 和 `selection_function_evidence_required`，没有草稿。结构化选择输出改成按 `maxItems` 动态 Pydantic 模型后，调用仍以原 `SelectionProgram.model_validate` 解析完成对象；Pydantic 对不同基类的模型实例报 `model_type`，定点复现了该跨模型交接缺口。动态模型现继承原合同，并新增“真实结构化模型实例”测试；下一次只能用新 B-U 来源验证正常首编译，不能把这份来源的重编译算验收。

2026-09-25 验收复核：模型桥接 `apps/api/python/browser_use_runner/ai_connect.py` 在带 `output_format` 时把完成值先解析成对应 Pydantic 实例，证明上述跨基类交接是真实运行路径。修正后新建的另一任务 `3286024e-09c8-45b0-a342-488597ebfe99` 有唯一准备作业、唯一新来源，B-U 成功后在同次作业自动编译为 12 段且零缺口；样本与独立复验、手动发布 V1、两次普通零模型复跑、每次 `media_playback=playing` 节点成功及重启恢复均有正式 UI/API/SQLite 证据。未以旧来源重编译或开发者草稿注入作为该结论。G12 异常分支与 macOS 真机仍各自保留未验边界。

2026-09-25 有界面复跑失败的诊断准备：正式 UI execution `7e6680f2-18a1-4aac-838f-962d9ed091f0` 在 `s-a-0004` 的 30 秒后置核验失败；Chrome 历史证明动作访问了与发布链 scope 完全相同的搜索 URL。该节点同时检查 URL 变化和搜索页 `a` 集合读取；现有 `StepVerifier` 已返回失败检查名，`postconditions.verify_once` 却折叠成统一 `ordinary_postcondition_failed`，因此持久记录无法区分页焦点、候选超额、投影或稳定性。先补不含页面内容的有限诊断，再依据同一次正式运行的事实修复；不凭页面 URL 猜测或复用旧 headless 成功记录。

Product Alignment:
- natural-language task: 从浏览器页面进入下一页后，若运行未满足后置条件，指出具体失败的通用检查条件以便修复。
- reusable chain boundary: 保留不可变发布链与单次运行事件；失败只携带有限检查种类和固定诊断码，不携带页面正文、URL 或账号数据。
- runtime inputs: 本次动作前后由既有 StepVerifier 检查的页面事实。
- dynamic task outputs: 本次失败的安全检查类别；业务输出仍按原链路合同。
- generic platform capability used: workflow-use StepVerifier、Tenacity settle、既有错误码安全边界。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 复跑后置条件失败的有限诊断。
- existing implementation in repository: `workflow_use.hybrid.postconditions.verify_once` 已调用上游 `StepVerifier.verify_step`，后者返回 `checks_failed` 和详情；`safe_runtime_error_code` 已限制可透传的受管错误码。
- mature candidates and pinned versions: 当前受管 workflow-use 0.2.11 的 StepVerifier、Tenacity 9.1.2；无需新库。
- selected implementation: 复用 StepVerifier 的结构化失败检查，仅在受管适配层映射成固定安全码。
- reused public surface: `VerificationOutcome.checks_failed`、已有 `VerificationCheck.parameters` 和 settle 策略。
- B-A-T-owned adapter and remaining gap: 只补安全诊断映射，不重写校验器或浏览器动作。
- license/runtime/platform fit: 沿用现有受管 fork、Python 3.12、Windows x64 路径；无新依赖。
- browser/runtime/state ownership conflicts: 不改变一次动作、单浏览器 owner、checkpoint 或清理。
- replay model calls: 0。
- rejected candidates and evidence: 不把页面原文或上游任意异常直接写入运行理由；现有统一错误码已使本次失败缺乏可判定条件。
- focused validation: 受管适配层定点测试和一次正式 UI 有界面复跑；结果待取得。

2026-09-25 定点诊断结果：正式有界面运行 `9c49f1f7-584b-4936-85ee-19b15b508ee7` 在 `s-a-0004` 报 `ordinary_postcondition_failed_read_fields_read_collection_limit`，清理已确认。来源 `618229f3-0d6c-456e-8068-5f95fccee37b` 的完整全页 `a` 查询当时恰好读到 200 条；其后失败的点击未派发，窄范围查询读到一条目标链接，后续导航只消费窄查询的链接。发布链却保留无人消费的全页读取，并使前一步的 ConsumerReadiness 指向它；页面链接数后来超过读取上限，触发严格拒绝。不能截断集合、调大上限、手改旧 Release，或把旧来源的重新编译算作全新任务验收。

Product Alignment:
- natural-language task: 浏览器先宽泛观察页面，再用更准确的完整候选读取决定后续导航或选择，并在普通复跑中可靠执行。
- reusable chain boundary: 只把有实际动作、绑定或输出职责的已验证读取纳入 TaskChain；被排除的纯探索读取仍须由来源和覆盖账本审计。动作后的就绪条件指向保留且真正被消费的读取。
- runtime inputs: 当前页面的真实候选集合、源动作顺序、读取查询与后续值绑定；不复用探索时的 200 条样本。
- dynamic task outputs: 正式运行时重新读取的目标链接或候选序号，以及原来源动作的完整覆盖分类。
- generic platform capability used: 现有 natural compiler、verified natural read、ConsumerReadiness、source coverage 和输出绑定。
- replay model calls: 0；普通读取、导航和选择不隐式调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 已验证纯读取的依赖裁剪与动作就绪条件重绑。
- existing implementation in repository: 受管 workflow-use 0.2.11 的 natural compiler 已有逐动作读取编译、绑定、ConsumerReadiness、coverage 和输出合同；缺少最终依赖裁剪。
- mature candidates and pinned versions: 继续复用受管 workflow-use 0.2.11 的编译与证据模块；该局部编译规则无需另引图优化库。
- selected implementation: 在现有编译最终化阶段依据真实绑定和输出消费判断读取是否存活；对经过原始查询与读取证据验证的死读取记录排除覆盖，再用保留读取重建就绪条件。
- reused public surface: 现有 compiled segments、verified natural read、source coverage 和 ConsumerReadiness 合同。
- B-A-T-owned adapter and remaining gap: 只补 B-A-T 的来源到可复跑 TaskChain 的编译决策与审计，保留原 Browser-Use 浏览器控制。
- license/runtime/platform fit: 不引入依赖，沿用当前受管 fork、Python 3.12、Windows x64。
- browser/runtime/state ownership conflicts: 不创建第二个浏览器 owner，不改变运行时图调度、检查点或清理职责。
- replay model calls: 0。
- rejected candidates and evidence: 提高 `maxItems` 或截断会掩盖完整候选合同；直接修改发布版本或复用旧来源无法验证首次编译；全新编译器会重复已有成熟能力。
- focused validation: 编译/coverage/输出/ConsumerReadiness 定点测试，受管 fork 校验；之后正式工作台全新 B-U 来源的首次编译、样本、独立复验和有界面普通运行。

Product Alignment:
- natural-language task: 用户在每次正式运行前选择是否显示浏览器窗口，适用于视频播放、网页读取和表单等任务。
- reusable chain boundary: 展示模式属于本次 execution 的启动设置，不属于不可变 TaskChain、发布版本、节点或业务输入；恢复同次 execution 时沿用已保存设置。
- runtime inputs: 已发布链路的业务输入、每次运行明确选择的 headless 布尔值。
- dynamic task outputs: 本次运行事件、业务输出和可审计的浏览器启动设置。
- generic platform capability used: 既有运行弹窗、`run_task` Zod 边界、TaskExecution 持久化、单一 Browser owner 和 BrowserProfile.headless。
- replay model calls: 0；展示模式不改变模型调用边界。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 单次正式运行选择有界面或无界面浏览器。
- existing implementation in repository: 运行设置弹窗已有节奏控件，后端已有 Python hybrid runner 的 `headless` 参数及 BrowserProfile 启动能力；当前仅由全局环境变量决定。
- mature candidates and pinned versions: 现有 Radix Themes、Zod、browser-use/BrowserProfile 与已接入的 Python hybrid runner；无需新增库。
- selected implementation: 在既有 UI/API/TaskExecution 合同中保存本次布尔设置，并将其穿过现有单会话 owner 传给 runner。
- reused public surface: Radix 表单控件、Zod 解析、现有 `startHybrid` 和 `BrowserProfile(headless=...)`。
- B-A-T-owned adapter and remaining gap: 为正式运行补齐每次 execution 的展示设置交接；显式的 `false` 必须覆盖服务端旧环境变量。
- license/runtime/platform fit: 沿用仓库已有依赖与 Windows 运行路径，无新依赖。
- browser/runtime/state ownership conflicts: 单次运行仍只启动一个产品浏览器控制会话；设置写入当前 execution 后不随环境变化漂移。
- replay model calls: 0。
- rejected candidates and evidence: 不用全局环境变量代替用户本次选择；它无法表达同一发布链路不同 execution 的模式，也无法作为恢复事实。
- focused validation: 合同解析与持久化、runner 启动参数定点测试，以及发布链路的实际有界面/无界面运行。
## 2026-09-25 同文档 URL 变化后的安全重观察（实施前记录）

Product Alignment:
- natural-language task: 浏览器试做在动态页面中选择真实可播放内容，页面地址在模型观察与点击之间发生同文档变化时继续查明当前页面。
- reusable chain boundary: 首次探索中的旧索引动作必须不派发，新观察与新选择由原探索 Agent 完成；已失败且无可复用来源时，工作台可显式创建同一 Requirement 版本的新准备 job，原失败记录保留。
- runtime inputs: 当前浏览器标签、文档身份、模型曾见的观察与拟执行动作。
- dynamic task outputs: 只有重新观察后真实完成的来源、浏览器命令和错误证据。
- generic platform capability used: 现有 workflow-use `SourceObservationScope`、`AuthorCaptureCallbacks`、Browser-Use Agent 回合、来源审计及 `prepare_task` 工作台命令。
- replay model calls: 正式复跑 0；只影响首次 B-U 探索中的观察恢复。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同一标签同一文档发生 SPA 地址变化时，在派发旧索引动作前请求 Agent 重新观察。
- existing implementation in repository: workflow-use `verify_before_action` 已比较标签、文档和 URL，`CollectionReadRequired` 已证明回调可拒绝动作并允许 Agent 下一轮重新决策。
- mature candidates and pinned versions: 沿用已固定的 browser-use 0.13.8、workflow-use 0.2.11；不引入新库。
- selected implementation: 扩展现有受管 workflow-use 捕获回调，仅对稳定的同标签、同文档、仅 URL 改变抛可恢复的观察刷新信号；无来源可续时工作台提供手动重新试做入口。
- reused public surface: Browser-Use 原生回合及现有单次 Browser owner；不复制浏览器控制或 Agent loop。
- B-A-T-owned adapter and remaining gap: 只把可恢复的观察失效映射为未派发动作、下一轮重新观察；不同文档或不稳定观察仍失败关闭；UI 手动重试复用现有 `prepare_task`，不改旧 job。
- license/runtime/platform fit: 沿用仓库现有受管依赖、Windows Python 3.12；无新运行时依赖。
- browser/runtime/state ownership conflicts: 仍由同一个 B-U 会话拥有浏览器；未重新启动会话，不接受旧观察作为新动作证据。
- replay model calls: 0。
- rejected candidates and evidence: 当前新任务的第 9 个动作在 `before_action` 被拒；持久化诊断显示 targetId 和 documentDigest 相同、stable=true，只有 urlDigest 改变。直接放行旧索引会破坏来源证据；整次失败会丢失可安全恢复的探索机会。
- focused validation: 新增同文档 URL 变化回调测试、不同文档仍拒绝测试；随后仅在同一新任务中按真实失败状态恢复。

同一新任务的再次试做在第 13 步 `wait` 前置观察耗时约 60 秒后失败，但 Python `author_step` 随后正常返回；该次未保存来源。持久化事实把最终失败限定在 Python 返回到 TS `session.author` 返回之间，无法区分 fd3、结果 schema 与响应校验。为避免无证据重跑，只在既有 owner 诊断 JSONL 增加固定的 TS 接收阶段码；不改变浏览器动作、业务合同、UI 或发布版本，也不记录异常正文及页面内容。下一次同任务试做只用于定点查明该交接层，再据实修复。

# 2026-09-25 唯一准备计划草案的代码交接（实施前记录）

Product Alignment:
- natural-language task: 用户在同一需求对话确认来源、试做入口、运行输入、业务步骤与结果；随后从工作台启动 B-U 代表试做。
- reusable chain boundary: 一份已确认准备计划草案版本投影内部 TaskRequirement/TaskPlan；B-U 来源、链路草稿和验证均绑定该版本与摘要。
- runtime inputs: 只来自草案明确列出的可变业务输入；没有输入时使用 null。
- dynamic task outputs: 按草案的交付形式与字段合同保存；执行状态和数据结果分别投影，不能凭任务网站或关键词推断。
- generic platform capability used: 现有访谈 Authoring、来源候选事实、Zod 合同、SQLite 版本记录、B-U 代表试做与 TaskChain 编译/运行。
- replay model calls: 普通复跑为 0，只有发布链中的显式 llm 节点例外；确认后不再调用模型生成业务计划。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从同一确认草案投影内部计划并核验来源/入口证据。
- existing implementation in repository: 访谈 Markdown 草案、sourceResolutions、TaskRequirement/TaskPlan、Zod、SQLite、TaskChainAuthoring 与 browserUseTask。
- mature candidates and pinned versions: 沿用仓库固定的 Zod 4.1.8、Drizzle 0.45.2、browser-use 0.13.8 和当前 AI Connect Authoring；不引入新库。
- selected implementation: 在现有确认边界与计划合同中做确定性投影和引用校验。
- reused public surface: 现有 Authoring 草案输出、Zod parse、TaskPlan/ResultSpec 与 B-U author API。
- B-A-T-owned adapter and remaining gap: 草案到技术合同的映射、入口引用/摘要绑定及失败关闭；真实页面动作仍交给 B-U。
- license/runtime/platform fit: 不新增依赖；当前 Windows x64 验证，macOS 尚无本轮设备证据。
- browser/runtime/state ownership conflicts: 仍只有每次产品运行的单一 Browser owner；确认草案本身不启动 Browser。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 已持久化任务显示确认草案没有入口引用，独立模型计划增添错误深链；因此不复用确认后 `planPrompt` 生成路径。
- focused validation: 入口/版本投影定点测试、类型检查、同一新任务的正式 Workbench/API/SQLite 验收；不重复整跑旧任务。

# 2026-09-25 browser.read-fields 可见模式定点诊断与安全错误码

持久化 execution `6771d738-8191-429d-8c0f-27803639d6c9` 为 `headless=false`，TaskRun `16cf3692-c699-44a1-8b3e-5ba14eac34aa` 在 `s-a-0004 browser.read-fields` 失败，累计 7 次浏览器命令、0 次复跑模型调用，清理已确认。该节点读取全页 `div`，`maxItems=100`、`includeOrdinal=true`；首次 B-U 来源中的同类查询为 64/100 条，但不是失败瞬间的 DOM。旧运行发生在 14:04；当前 Python runner 的读取/观察阶段包装直到 15:03 的 `43ed385` 快照才存在。旧 SQLite 只保存 `hybrid_runner_failed:RuntimeError`，runner stderr 未保存。只读复核又确认：前驱 `s-a-0003` 的 ConsumerReadiness 使用与 `s-a-0004` 完全相同的 ReadSpec 和 scope，稳定后置检查在 `06:04:05.139Z` 成功；`s-a-0004` 在 `.142Z` 开始、`.369Z` 失败，仅隔 227 毫秒。故不能把旧故障归因为已确认的集合上限或当前隔离样本的输出 schema 错误；更具体的底层异常仍不可恢复。

一次独立临时 Profile 的可见浏览器只读样本在进入公开番剧入口后立即读取 `div`，得到 `FieldReadError:read_output_schema_mismatch`，随后浏览器已关闭。它与旧运行的错误类型和任务前态不同，只能证明当前合同有可诊断的另一种失败，**不是旧故障复现，也不是新任务或旧 Release 的通过证据**。为保留下一次定点故障的可判定条件，Python owner 现在只将受管读取层固定错误码透传 fd3；字段名、页面正文、任意依赖异常继续留在 owner 内，未知错误仍映射为 `hybrid_read_collection_failed`。这修复了错误归因的证据缺口，旧可见失败的运行时根因及新任务可见复跑仍待正式证据。

Product Alignment:
- natural-language task: 通用网页任务从实时页面读取候选或字段，再据此筛选、导航或形成结果。
- reusable chain boundary: 已发布 TaskChain 的 `browser.read-fields` v2 只读节点；本次只改 Python owner 的错误回执，不改业务链路或执行语义。
- runtime inputs: 当前浏览器页面、已编译且受校验的 ReadSpec、运行时 DOM。
- dynamic task outputs: 字段值、属性和 DOM 顺序；失败时仅有固定诊断码，不把原始页面内容当作业务输出。
- generic platform capability used: 现有 Browser-Use 页面查询、受管 workflow-use 字段读取、fd3 协议和 TaskRun 审计。
- replay model calls: 0；诊断不调用模型或重派浏览器动作。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 保留确定性字段读取的安全、可区分错误原因。
- existing implementation in repository: workflow-use 的 `FieldReadError` 与 `read.py` 已产生固定读取错误码；Python hybrid runner 原先将它们统一包装为 `hybrid_read_collection_failed`。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11、browser-use 0.13.8 与既有 Python 3.12 runner；不引入或替换库。
- selected implementation: 在既有 runner 边界以固定白名单透传已知读取错误码，未知异常仍保留安全阶段码。
- reused public surface: 现有 `read_fields`、`FieldReadError`、runner fd3 响应和 TaskRun 错误传播。
- B-A-T-owned adapter and remaining gap: 只负责安全错误投影；浏览器 DOM 查询和字段投影仍由现有组件承担；旧异常原始栈不可恢复。
- license/runtime/platform fit: 不新增依赖或许可证；定点验证在当前 Windows x64/Python 3.12 环境完成，其他平台未测。
- browser/runtime/state ownership conflicts: 不新增浏览器 owner，不改变动作派发、检查点、发布版本或清理。
- replay model calls: 0。
- rejected candidates and evidence: 不持久化原始异常栈、字段名或页面文本；现有 SQLite 未保存旧异常，不能凭一个不同的可见样本假定旧根因或做猜测性重试。
- focused validation: `test_hybrid_read_stage.py` 所属 3/3 通过，补充检查错误码白名单的单项 1/1 通过，`git diff --check` 通过；正式新任务的可见读取与完整链路未测。

# 2026-09-25 B-U 成功来源到业务可复跑链路的证据交接（实施前记录）

Product Alignment:
- natural-language task: 每次运行从已确认来源动态选择目标，执行浏览器动作，并以用户确认的可观察状态证明完成。
- reusable chain boundary: B-U 的来源动作和观察交给现有 hybrid 编译器；编译后的 TaskChain 必须保留能证明完成的通用浏览器后置条件，不能只凭动作覆盖和合法终点宣布业务成功。
- runtime inputs: 已确认草案的输入合同、运行时页面候选和浏览器观察。
- dynamic task outputs: 运行时选中对象以及实际观察到的状态；若草案要求在结果中说明动态字段，应使用现有 data ResultSpec 和字段绑定。
- generic platform capability used: 现有 workflow-use 自然动作编译、media_playback 观察与后置条件、TaskChain 节点运行、ResultSpec 和输出绑定。
- replay model calls: 普通复跑为 0；不添加全局语义 judge。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 把首次成功试做的可观察状态编译为普通复跑时可核验的条件，并保留动态结果字段。
- existing implementation in repository: 受管 workflow-use 已有 media_playback 事实和后置条件，hybrid materializer 已映射后置条件；ResultSpec data、outputAssembly 和执行结果投影已有类型与运行路径。
- mature candidates and pinned versions: 沿用当前受管 workflow-use 0.2.11、browser-use 0.13.8、Zod 4.1.8；不引入、替换或删除库。
- selected implementation: 在现有编译器的动作观察关联处修正有证据的 media_playback 漏编译；访谈 Skill 明确要求把用户期待的动态结果说明写成 data 字段。
- reused public surface: workflow-use 的自然编译与媒体事实、现有 TaskChain postconditions、ResultSpec/data outputAssembly。
- B-A-T-owned adapter and remaining gap: 宿主继续验证编译产物与已确认草案的类型/版本，不根据网站、标题或页面正文推断播放；当前成功来源中的 playing 观察没有进入链路，而执行模式只交付技术状态。
- license/runtime/platform fit: 沿用已有依赖、许可证与 Windows 运行时；未改变浏览器 owner。
- browser/runtime/state ownership conflicts: 一个产品运行仍只有一个 Browser owner；不重发已完成动作，不改旧 Release 或历史运行。
- replay model calls: 0，发布链显式 llm 节点除外。
- rejected candidates and evidence: 不增加全局语义 judge、网站/剧集特例或另一轮业务规划；持久化新任务的 B-U 来源有 playing，已发布链末尾仅 URL 不变，三次技术完成运行的结果均无实际播放证据。
- focused validation: 仅运行编译器媒体事实定点测试、受影响包的必要类型/协议测试；边界修复通过后，用一个全新正式工作台任务验证从对话到复跑的同版证据。

同一媒体交接的运行期核验补充（实施前）：

Product Alignment:
- natural-language task: 目标页的导航和播放状态都必须在同一次普通浏览器运行中成立。
- reusable chain boundary: 现有 StepVerifier 逐项核验后置条件；一次有界重查中的多个页面事实应来自同一个受控 Page，焦点或页面身份漂移应继续重查事实而不重派动作。
- runtime inputs: 当前 Browser owner、已声明的页面级后置条件与既有 settle 预算。
- dynamic task outputs: 本次核验通过或固定失败码；不记录页面 URL、选择器、正文和媒体内容。
- generic platform capability used: 现有 Browser-Use Page 公共 API、TargetResolver.assert_scope、workflow-use StepVerifier/verify_declared。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 一次后置核验的页面事实身份一致性。
- existing implementation in repository: workflow-use 已有 Browser owner、Page.get_target_info/get_url、TargetResolver.assert_scope 与有界 settle 重试。
- mature candidates and pinned versions: 复用当前受管 workflow-use 0.2.11 与 browser-use 0.13.8；无新依赖。
- selected implementation: 在现有 verify_once 边界固定本次 Page，给页面事实复用，并在结束时复核焦点/身份；漂移交给已有 PostconditionNotMet 重试。
- reused public surface: 上述 Browser/Page/TargetResolver 与 StepVerifier，不复制动作派发或等待调度。
- B-A-T-owned adapter and remaining gap: 只补运行证据的一致性，不能从可见媒体布尔事实推导具体流身份。
- license/runtime/platform fit: 沿用已有 Python/Windows 运行路径；macOS 未在本轮实测。
- browser/runtime/state ownership conflicts: 仍由一个 Browser owner 执行；漂移时只重读，不再次点击。
- replay model calls: 0。
- rejected candidates and evidence: 不用动作完成后的一次稳定观察倒推核验期间两项事实同页；当前 URL 与媒体各自调用 get_current_page，现有代码没有跨两次读取的页面身份约束。
- focused validation: 页面在两项读取间切换的定点测试、现有后置条件定点回归及受管 fork 摘要核验；不做浏览器整跑。

# 2026-09-25 可见 read-fields 的缺失阶段证据（实施前记录）

Product Alignment:
- natural-language task: 通用网页任务需要从可见浏览器页面完整读取候选集合以驱动后续动作。
- reusable chain boundary: 已发布的 browser.read-fields 节点仍通过单一 Python Browser owner 执行；只为故障记录安全阶段码，不改变读取结果或旧 Release。
- runtime inputs: 已编译 ReadSpec、当前页面身份及实时 DOM。
- dynamic task outputs: 读取到的候选字段；异常时只记录固定阶段与异常类，不记录页面内容或选择器。
- generic platform capability used: 现有 workflow-use read_fields、Browser-Use/CDP 查询和 hybrid runner 回执。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 判定 read-fields 失败发生在页面身份检查、集合查询、字段投影还是读后观察。
- existing implementation in repository: Runner.execute 已分派 ReadCommand，现有受管读取器执行集合和字段读取，安全错误码可沿 fd3 返回。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11、browser-use 0.13.8 和 Python 3.12；不引入新库。
- selected implementation: 在既有边界增加不含页面数据的固定阶段诊断，保持原异常类型和动作语义。
- reused public surface: 现有 read_fields/TargetResolver 与 Runner.execute；不复制查询实现。
- B-A-T-owned adapter and remaining gap: 只负责阶段回执和审计。旧运行未保存 traceback、浏览器已关闭，旧瞬间无法唯一还原。
- license/runtime/platform fit: 无新依赖；先以当前 Windows 运行路径定点验证。
- browser/runtime/state ownership conflicts: 不新增 Browser owner，不重派已完成的读取或观察。
- replay model calls: 0。
- rejected candidates and evidence: 不按后来 64/100 的来源样本推断旧故障是集合上限；旧前驱曾以相同 ReadSpec 稳定通过，旧节点 227 毫秒后出现未分阶段的 RuntimeError。
- focused validation: 仅运行所属 Python 错误阶段测试和静态检查；同条件现场只做一次定点读取验证，不整链撞运气。

# 2026-09-25 B-U 前观察与 Python→TS 返回边界诊断（实施前记录）

已持久化准备 job `992070a0-c171-4448-879f-152df55b1557` 的 owner JSONL 显示：第 13 步 `wait` 的 `before_action` 从 `08:17:19.913Z` 至 `08:18:19.903Z` 失败，没有动作派发；Python `author_step` 在 `08:21:20.412Z` 返回，但 SQLite 来源数组仍为空。TS 只在 `session.author` 返回后加入来源，所以第二个故障位于 Python 完成之后、TS 来源接收之前。旧诊断既没有前观察子阶段，也没有 fd3 序列化/写入结果，不能唯一确定旧运行的具体 CDP 方法或返回故障。当前固定 browser-use 的每个 CDP 请求默认上界为 60 秒，Agent step 上界为 180 秒；前观察的 59.990 秒与 CDP 读取超时吻合，但多个读取方法共享该上界。

Product Alignment:
- natural-language task: 通用浏览器任务在代表试做中按实时页面完成动作，并把首次来源交给编译。
- reusable chain boundary: 同一 Browser owner 的动作前只读观察及 Python fd3→TS 来源返回；仅补固定阶段和安全异常类别，绝不改动作或结果。
- runtime inputs: 当前 Page、动作前观察、Python 结构化来源响应。
- dynamic task outputs: 已验证来源或固定故障阶段码；页面、网址、选择器、异常原文不进入诊断。
- generic platform capability used: browser-use Page/CDP、既有 workflow-use 捕获、fd3 响应、fd4 owner JSONL、Zod 准入。
- replay model calls: 0；诊断也不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在现有 Browser-Use 会话中识别动作前读取失败，并确保 Python 来源响应序列化失败时仍返回固定错误。
- existing implementation in repository: `SourceObservationScope`、`ObservationCapture`、`AuthorCaptureCallbacks`、`DiagnosticChannel`、`RunnerProcess` 和 `SourceLifecycleDiagnostics` 已构成单 owner 的读取及安全诊断通道。
- mature candidates and pinned versions: 复用当前 browser-use 0.13.8、cdp-use 1.4.5、Python 3.12、Zod 4.1.8；不引入新库。
- selected implementation: 只在现有调用边界发固定子阶段/异常类和 fd3 响应阶段事件，Python 序列化失败用既有 `hybrid_runner_failed` 协议回固定原因。
- reused public surface: Browser-Use Page API、现有 fd3/fd4、Zod schema 与 owner JSONL。
- B-A-T-owned adapter and remaining gap: 仅拥有来源交接与安全错误投影；旧运行无原始栈，新增诊断不能追认旧根因。
- license/runtime/platform fit: 不改变依赖、许可、进程或 Windows 浏览器所有权；其他平台待产品证据。
- browser/runtime/state ownership conflicts: 仍为同一 Browser owner；不修改超时、重试、Agent loop 或浏览器控制。
- replay model calls: 0。
- rejected candidates and evidence: 不能凭 59.990 秒把所有 CDP 方法归为一个具体故障；扩大超时或盲重试不能修复已证实的结果丢失，且缺乏恢复浏览器状态的证据。
- focused validation: fd3 序列化失败、固定诊断码和原异常链的所属包定点测试；受管 fork 摘要核验，不跑浏览器整链或根级测试。

# 2026-09-25 专用 Profile 的浏览器版本与 owner 启动边界（实施前记录）

专用 Profile 的 `Default/Preferences.profile.created_by_version` 为 Chrome 153；当前 Browser-Use 0.13.8 默认发现 bundled Chromium 134。专用 Profile + Chromium 134 的启动产生 breakpoint crash dump；空 Profile + Chromium 134 可启动，同 Profile 的临时副本 + Chrome 153 可启动。版本组合是当前启动失败的最强证据。Browser-Use `BrowserProfile(channel=CHROME)` 或显式 `executable_path` 含 chrome 时会把指定 Profile 复制到系统临时目录；B-A-T 精确 `user_data_dir` owner 检查正确拒绝这种路径。外部 CDP attach 虽是公共 API，Browser-Use 不拥有外部进程，现有关闭回执不能证明 Chrome 已退出。受管 fork 无需修改；`LocalBrowserWatchdog._find_installed_browser_path` 可通过标准 `PLAYWRIGHT_BROWSERS_PATH` 指向不含 bundled Chromium 的 owner 临时目录，让默认 channel 回退发现系统 Chrome，仍由原 Browser-Use watchdog 启动和清理。该行为依赖固定的 browser-use 0.13.8 查找顺序；同一原 Profile + 系统 Chrome 153 已在可见模式经 Browser-Use 与正式 RunnerProcess 各做一次定点启动/关闭，通过且无该 Profile 的残留浏览器进程。正式 API 尚未加载代码，也没有新任务 B-U 证据。

Product Alignment:
- natural-language task: 在现有账号 Profile 中执行已确认的通用浏览器任务，避免启动时版本回退使任务在 B-U 前失败。
- reusable chain boundary: 仅修 Browser owner 选择兼容二进制的启动配置；不改 Requirement、B-U Agent loop、TaskChain、headless 或新页恢复。
- runtime inputs: 当前实际专用 Profile、系统安装的浏览器及单次 runner owner 临时目录。
- dynamic task outputs: 同一 Profile 的成功启动、关闭及资源所有权回执；后续仍由正式任务自身产生业务输出。
- generic platform capability used: Browser-Use 0.13.8 `LocalBrowserWatchdog` 原生浏览器发现、启动和清理，Playwright 标准浏览器目录环境变量。
- replay model calls: 0；浏览器选择不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 持久 Profile 兼容浏览器的单 owner 启动及清理。
- existing implementation in repository: `owned_browser` 保证精确 Profile 路径；`RunnerProcess` 保证唯一 Python owner、fd3/fd4 与关闭回执。
- mature candidates and pinned versions: 复用 browser-use 0.13.8、cdp-use 1.4.5 和已安装的系统 Chrome 153；不引入新依赖。
- selected implementation: 只在 Windows runner 子进程的环境中把 Playwright 浏览器目录指向本次 owner 的空临时目录，让 Browser-Use 原生查找回退到系统浏览器；不显式指定 Chrome channel 或另起 CDP owner。
- reused public surface: `PLAYWRIGHT_BROWSERS_PATH`、Browser-Use 默认 BrowserProfile/LocalBrowserWatchdog、现有 RunnerProcess owner。
- B-A-T-owned adapter and remaining gap: 只传递受控发现配置并验证实际二进制、Profile 路径及清理；若系统 Chrome 不存在或旧 Profile 仍崩溃，不把解析成功算启动修复。
- license/runtime/platform fit: 沿用现有 Browser-Use/Playwright 许可和 Windows 运行路径；其他平台未测。
- browser/runtime/state ownership conflicts: Chrome channel 的临时 Profile 副本与外部 CDP 进程均不满足现有所有权约束，不能采用；正常 Browser-Use watchdog 仍是唯一 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不降级或重建现有 Profile，不放宽精确所有权检查，不用第二个外部浏览器进程；前者可能丢登录态或掩盖启动根因，后者在现有关闭路径会留下进程。
- focused validation: 系统 Chrome 153 路径解析通过；原 Profile 可见模式 Browser-Use 启动/关闭、原 Profile 路径核验通过；正式 TS RunnerProcess `profile_start=ok`、`cleanup=confirmed`，结束后无该 Profile Chrome 进程；API package TypeScript 检查通过。正式服务加载及同任务 B-U 仍未测。

# 2026-09-25 新任务 B-U 结果接收后的 API 退出事实

正式工作台新任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 的首次准备 job `e27d9627-1314-4d5a-8b70-cbd1c9428dec` 使用已确认草案 v1 投影的 Plan v1。Python 第 10 步 `done` 后完成两次语义注解，并在 `12:16:33Z` 序列化、写出 fd3 响应；TS owner JSONL 已记录 `author_response_received`，但未记录 schema 失败、校验失败或接受。API 随后退出，SQLite 对该任务没有来源 artifact，重启后 job 为 `interrupted`。原 API 未保留 stderr，Windows 未生成对应的 node.exe 崩溃报告；目前**不能唯一断定 API 的具体退出机制**。旧同入口约 0.5 MB 来源和最大约 1.24 MB 来源在隔离 Node 进程中通过现有 schema/校验，只能排除这些旧样本上的必现失败，不能代替当前任务验收。Python 原始 history 已删除，本次 fd3 payload 未落盘。现有可证明的交接缺口是 `session.author` 返回且 Browser owner 关闭之前没有来源 artifact。

随后查到此前漏检的 Windows System 事件 2004：`20:16:18` 系统提交量 `35,983,015,936 / 36,081,029,120` 字节，仅余约 98 MB，物理内存使用 `16,446,586,880 / 16,984,236,032` 字节。最大进程是已有的 `browser.exe` PID 11984（约 6.41 GB）、`chrome.exe` PID 8580（约 4.89 GB，创建于本次 B-U 浏览器根进程启动后约 2 秒）和 `League of Legends.exe` PID 18868（约 2.01 GB）。这是本次响应交接时**确定存在**的系统级内存耗尽条件，时间上比 API 退出早约 15 秒；进程创建时间强烈支持 Chrome 属于本次试做，但缺少当时的父子进程快照，不能当作已验证所有权。该事件足以解释 Node 分配失败的风险，仍没有 API 退出码或 stderr 可证明唯一机制。`20:31` 时游戏进程已退出、提交余量约 6.57 GB，其他用户进程不由项目关闭。此处仅补持久化事实，不冻结新增源码方案或把旧来源当作当前任务通过。

# 2026-09-25 中断准备作业的工作台恢复入口（实施前记录）

同一新任务的 job 在 SQLite 为 `interrupted/preexecuting`，API `/api/task-chain/diagnostics` 的 `preparation.planRecovery=null`，工作台因此只显示“正在核对已保存方案与预执行恢复条件”，不显示“重新试做当前草案”。`TaskPreparationCoordinator.planRecovery` 仅接受 `failed`，而 UI 对 `failed` 与 `interrupted` 都进入恢复面板，且要收到 `planRecovery.available === false` 才开放同版草案重新试做。当前 job 已有浏览器动作、无来源 artifact，不能沿旧 Browser 状态或旧方案直接续做；它需要明确的不可续做诊断，旧 job 保留。

Product Alignment:
- natural-language task: 已确认草案的代表试做因服务退出中断后，用户从正式工作台看到原因并可重新试做同一草案。
- reusable chain boundary: 仅修准备诊断从 API 到 UI 的状态投影；不改访谈、B-U、编译、发布或复跑。
- runtime inputs: 当前 job 的 interrupted 状态、阶段、动作记录和来源引用。
- dynamic task outputs: planRecovery.available=false 与原层原因，工作台显示正式重试入口；旧 job 不改写。
- generic platform capability used: 现有 planRecovery、canResumeSavedPlan、Workbench preparation context。
- replay model calls: 0；诊断不调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将中断的预执行 job 投影为可判断的恢复诊断。
- existing implementation in repository: TaskPreparationCoordinator.planRecovery 已返回可用/不可用及原因；WorkbenchContext 已按该返回值显示操作。
- mature candidates and pinned versions: 复用现有 TypeScript/Zod 合同和 UI；不引入库。
- selected implementation: 让 planRecovery 对 interrupted/preexecuting 进入同一安全核查，保持浏览器动作已发生时 available=false。
- reused public surface: 现有诊断 API、canResumeSavedPlan 和 prepare_task 工作台命令。
- B-A-T-owned adapter and remaining gap: 只修 API/UI 状态交接；原始 B-U 来源仍缺失，不能由此声称首次成功。
- license/runtime/platform fit: 无新增依赖和平台分支。
- browser/runtime/state ownership conflicts: 不恢复旧 Browser、不重用无 closed=true 的来源；重试会产生新 job。
- replay model calls: 0。
- rejected candidates and evidence: 不把 interrupted job 改写成 failed，也不开放无来源的离线编译；SQLite/正式 UI 已证明状态不一致。
- focused validation: 所属 API 恢复合同测试覆盖中断后返回 available=false；API 类型检查和正式工作台只读按钮核验。

实施与验收结果：只把 `TaskPreparationCoordinator.planRecovery` 的状态门扩至 `interrupted`；当旧 job 已有浏览器动作却无 closed source 时，诊断返回 `available=false`，正式工作台显示“重新试做当前草案”。所属 `preparation-plan-resume.test.ts` 最终 3/3 通过，API 类型检查通过；未增加来源 checkpoint、第二 Browser owner 或业务计划生成。工作台的第二 job `f6d17aa7-c418-438a-8f42-b3de517317c2` 真实完成 B-U、零缺口首编译及两次草稿验证，随后手动发布并在同一 Release 上完成两次零模型正式执行；完整证据与保留的失败见 [PROGRESS](PROGRESS.md#2026-09-25-同一全新任务最终验收与资源清理)。这证明当前状态交接恢复入口可用，不证明第一次 job 的 API 退出机制已修。发布后重启命令被自动审批以 `blocked by policy` 拒绝，重启持久化未测。

# 2026-09-25 B-U 最后响应与 Function 校验的资源交接（实施前记录）

首次 job `e27d9627-1314-4d5a-8b70-cbd1c9428dec` 的 fd3 响应已由 API 接收，尚未记录 `author_response_accepted`；系统事件在约 15 秒前记录提交内存仅余约 98 MB。现有 `withHybridAuthoring` 在仍持有 Browser owner 时执行 `withSelectionValidation`，该校验可启动隔离的 Function Worker；只有整个 `work(session)` 结束后才调用已存在的 `RunnerProcess.close()`。同版草案第二次 job 成功且没有同期内存耗尽事件。首次 payload、API 退出码和 stderr 未保存，因此无法把具体退出机制或两次差异唯一归于内存或 LLM 输出。修正目标仅为消除可证实的 Browser/Worker 生命周期重叠；不能据定点测试宣称首次一次通过稳定性已验收。

Product Alignment:
- natural-language task: 任意已确认浏览器任务的 B-U 代表试做在最终响应后交付可编译来源。
- reusable chain boundary: 最后一个计划步骤收到完整响应后，先确认同一 Browser owner 关闭，再做来源 Function 校验和 artifact 准入；中间步骤仍在同一会话连续试做。
- runtime inputs: 同版计划步骤位置、fd3 响应、既有 owner 清理回执。
- dynamic task outputs: 校验后的来源或原层校验/清理失败；不补写业务目标、网址或旧来源。
- generic platform capability used: 现有 `RunnerProcess.close()`、Browser-Use owner、QuickJS Function 校验与来源合同。
- replay model calls: 0；B-U 代表试做的模型调用及普通链路复跑行为均不变。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 最后 B-U 响应之后释放 Browser，再运行纯数据 Function 校验。
- existing implementation in repository: `RunnerProcess.close()` 已缓存关闭结果并核验 Python/browser/child/temp；`withSelectionValidation` 已负责 Function 准入。
- mature candidates and pinned versions: 继续复用 browser-use 0.13.8、现有 QuickJS/Node Worker 与 Zod 4.1.8；不引入或替换库。
- selected implementation: 仅在最后计划步骤的 TS 会话调用元数据中标记响应后关闭，沿用既有关闭回执和最终来源准入。
- reused public surface: `RunnerProcess.close()`、现有 `HybridAuthorSession.author` 与 `withSelectionValidation`；标记不进入 Python 来源或公共合同。
- B-A-T-owned adapter and remaining gap: 调整交接顺序，保留多步同 owner 和清理失败不能标 closed 的规则；旧 API 退出机制仍缺直接证据。
- license/runtime/platform fit: 无新依赖、许可、进程或平台分支；Windows 定点测试后仍需新任务产品验收。
- browser/runtime/state ownership conflicts: 不建立第二 Browser owner，不延长会话，不重放旧动作；最终步已完成才关闭同一 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不重写 B-U Agent/Function 引擎，不因旧退出猜测而增大超时或整链重试；这些做法均不解决已证实的内存重叠。
- focused validation: 所属 API 测试断言最终步关闭先于校验、非最终步保持同一 owner、关闭未确认时不接受来源；API 类型检查及差异检查。正式一次性稳定性另需新任务从工作台验证。

# 2026-09-25 简短需求的来源调查与题板证据准入（实施前记录）

正式工作台任务 `a40711c9-91f0-4e07-a022-dfa67f9ecf03` 的首句由验收操作者写成含来源类型、最新规则、排除项、受限停止和完成标准的长指令，故该任务**不能验收**访谈能否从普通简短需求主动拆解。该首句没有“腾讯”。访谈模型在 22:07:21 自行用 `凡人修仙传 动画 官方 腾讯视频` 调用 Pi `web_search`；22:07:29 的原始结果中，同一页既有两条腾讯视频单集/旧集线索，也有“bilibili独家呈现”“B站独播”的反证。模型于 22:07:33 仍把两条腾讯短播放页提交为 `multiple`。宿主只核验 URL 确实出现在本轮结果，题板丢弃原摘要，统一写“来自 Pi web_search 的原始只读搜索结果”，并按首位加“推荐”。首轮未打开播放页；搜索成功和引用合法不能证明版权身份或可供动态最新选集的入口。用户随后在正式题板选择“都不是”，第二轮模型才改查 Bilibili；该任务草案 v2 仍未确认、未启动 B-U。

Product Alignment:
- natural-language task: 用户可以只说简短目标，由需求对话调查来源、澄清结果差异并形成唯一准备计划草案。
- reusable chain boundary: 访谈模型比较完整只读搜索证据并提交业务相关候选；宿主仅保留原始结果引用和摘要、展示 Question，不代替模型决定网站或业务身份。
- runtime inputs: 本任务完整对话、Pi `web_search` 的本轮标题/URL/摘要、模型提交的候选 URL。
- dynamic task outputs: 有摘要证据的来源候选或保留待决；最终目标和入口仍由用户确认，B-U 再调查现场。
- generic platform capability used: 现有 Pi 搜索事件、`PiSourceSearchObserver`、`SourceCandidate.description`、公共 Question Panel。
- replay model calls: 0；仅需求访谈在用户发起的轮次调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将现有只读搜索的候选摘要带到来源 Question，并使模型处理搜索假设与反证。
- existing implementation in repository: Pi `web_search` 已在事件中返回标题、URL 和摘要；`piSearchCandidates` 目前只保存标题/URL并写统一占位描述；访谈 Skill 与 `present_source_candidates` 已规定模型语义判断、宿主引用校验。
- mature candidates and pinned versions: 继续复用当前 `pi-web-access` 0.30.0、Pi AgentSession、AI Connect Question 与 Zod 4.1.8；不引入搜索、打分或网页抓取新库。
- selected implementation: 只适配 Pi 原始 `Source:` 行旁的摘要到既有 `description`，题板用“搜索候选”与原始摘要，不把首位自动标成有证据的推荐；在既有访谈指令中要求中性搜索、比较相反证据和动态目标入口适配。
- reused public surface: Pi `web_search` 工具结果/事件、现有来源合同和 Question projector；没有第二搜索事实源。
- B-A-T-owned adapter and remaining gap: 只验证引用真实性与投影摘要，不能由规则判断“腾讯/B站”等业务语义；模型仍可能判断错，须用简短新需求的真实访谈定点验收。
- license/runtime/platform fit: 无新依赖、许可或浏览器会话；Windows API/UI 可定点核验。
- browser/runtime/state ownership conflicts: 访谈只读，不启动 Browser owner，不访问登录态或页面控件。
- replay model calls: 0。
- rejected candidates and evidence: 不加入网站词典、平台名单、标题关键词评分或宿主来源推荐；它们会把任务实例写入平台并违反模型语义职责。也不把这次过度详细的首句当作简短需求验收。
- focused validation: Pi 原始摘要到候选/Question 的所属包测试、访谈提示定点检查、API 类型检查；随后只用自然简短的一句需求从正式工作台验证来源选择与草案交接，完整 B-U 需先满足资源前提。

实施与定点结果：沿用 Pi `web_search` 和既有 `SourceCandidate.description`，把原始搜索结果中紧邻 `Source: title (URL)` 的摘要按 URL 关联到候选；来源题板显示原摘要、称为“搜索候选”，所有原始候选均不因排序自动获得推荐标记。Skill、访谈阶段指令和候选提交工具说明要求模型比较未限定平台的结果及相反证据，不增加网站词表或宿主语义评分。所属来源测试 11/11、API package TypeScript 检查、`git diff --check` 通过。

正式工作台随后以一句普通需求“帮我播放《凡人修仙传》最新一集。”创建任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82`。本轮 Pi 搜索词为“《凡人修仙传》 动画 官方 在线观看 最新集”，候选 `https://www.bilibili.com/bangumi/play/ss28747` 的原摘要含“高清独家在线观看”；来源题板未标推荐。验收操作者在正式 UI 选择该来源后，访谈继续询问“最新一集”是否包括会员抢先看；选择“公开可看的最新正片”后生成唯一草案 v1，并在正式 UI 确认。草案写明动态选集、排除预告花絮、受限时停下和实际播放状态。API 返回 `confirmedVersion=1`，来源状态 `selected`；这证明简短输入到已确认草案的访谈路径，不证明 B-U 或网页可访问性。最初过长输入任务 `a40711c9-91f0-4e07-a022-dfa67f9ecf03` 的草案 v2 仍未确认，不计入本次验收。

该短句本身未指定“动画”，模型的首次搜索却加了“动画”；题板题干明确写了动画，验收操作者选择哔哩哔哩国创页，因而本次对象经题板确认，但首次搜索可能排除同名其他形态。已将“未指定同名作品形态时不得只用猜测形态限定唯一搜索；让用户看清或确认对象”补入通用访谈 Skill 和阶段指令。该提示增量尚无新的短句运行证据，不把本次旧提示下的表现算成它的验证。

确认草案后关闭本次 UI 驱动 Chrome，回执 `closed=true`；系统可用提交内存仍只有约 2.11 GiB，而旧可见 B-U 时项目 Chrome 曾占约 4.89 GiB，且曾出现仅余 98 MB 的系统事件。未结束用户游戏或归属不明的 `browser.exe`，也未在已知低余量下启动 B-U。待资源满足再沿这条已确认草案由正式工作台启动首次代表试做；不得用旧任务、旧来源或另一个草案代替。

同域候选缺少 URL 路径会让用户难以区分页面，已在既有来源 Question 描述中补入经本轮搜索校验的完整 URL，并把 Skill 中误写的“提交结果 ID”统一为工具实际接受的“提交真实结果 URL”；没有改来源语义判断。所属来源测试 11/11、API 类型检查通过。对 API PID 11936 的加载新代码重启命令被自动审批直接拒绝，仅返回 `blocked by policy`；命令未执行，服务仍健康。因此完整 URL 展示尚无正式 UI 运行证据。

# 2026-09-25 可见 read-fields 内层阶段证据补齐（实施前记录）

旧可见 execution `6771d738-8191-429d-8c0f-27803639d6c9` 只保留 `hybrid_runner_failed:RuntimeError`，没有旧 Python 异常链或阶段；它不能被追认为已修。当前安全诊断把 `read_fields` 内的第一次/末次 `TargetResolver.assert_scope`，以及 `resolve_collection` 查询前的 `_snapshot(scope)` 异常统称 `hybrid_read_fields_*`；现有 `target_query` 标记只覆盖实际 CSS 查询。三种页面身份读取和字段投影仍混在一个阶段，下一次同类失败无法定点归因。

Product Alignment:
- natural-language task: 通用网页任务在可见或无界面浏览器中从当前页面读取动态候选与字段。
- reusable chain boundary: 既有 `browser.read-fields` v2 调用和单一 Python Browser owner；仅补安全诊断阶段，不改变读取、运行或业务合同。
- runtime inputs: 已验证 ReadSpec、页面 scope、当前 Browser-Use Page。
- dynamic task outputs: 原字段结果；失败只给固定阶段与异常类别，不外传页面内容。
- generic platform capability used: 受管 workflow-use `read_fields`/`TargetResolver`、现有 fd3 错误回执。
- replay model calls: 0；不重试或重派动作。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 区分 read-fields 内层页面 scope、集合快照、CSS 查询、字段投影与读后观察失败。
- existing implementation in repository: Runner 已有安全阶段码，`TargetResolver.resolve_collection` 已给 CSS 查询异常加固定 `__notes__`；Python 3.12 异常链与 `add_note` 可保留原因。
- mature candidates and pinned versions: 继续复用受管 workflow-use 0.2.11、browser-use 0.13.8、Python 3.12；无新依赖。
- selected implementation: 仅在既有三个异常边界补固定 note，由 Runner 现有安全映射输出固定码；原异常类型和控制流不变。
- reused public surface: `read_fields`、`TargetResolver.assert_scope`、`TargetResolver._snapshot`、Runner fd3 回执。
- B-A-T-owned adapter and remaining gap: 只负责阶段归因与敏感信息隔离；旧运行的底层异常不可恢复，新阶段码本身不修复 CDP/页面错误。
- license/runtime/platform fit: 沿用现有依赖与 Windows/Python 3.12；其他平台仍未测。
- browser/runtime/state ownership conflicts: 不创建 Browser、CDP owner、检查点或第二调度器；同一次只读调用的异常原样上抛。
- replay model calls: 0。
- rejected candidates and evidence: 旧 `s-a-0003` 同规格就绪检查刚通过，`s-a-0004` 227 毫秒后只留泛化 RuntimeError；无证据支持扩大超时、重试、修改 Release 或归因集合上限。
- focused validation: 所属 Python 测试注入内层前/后 scope、集合快照、CSS 查询故障，核验固定码、异常链、安全边界和单次调用；现有正常读取合同定点回归，不启动浏览器整链。

实施与定点结果：在 `read_fields` 内两次 `assert_scope` 和 `TargetResolver.resolve_collection` 的 `_snapshot` 异常处加固定 note；Runner 沿既有 fd3 安全错误投影分别输出 `inner_pre_scope`、`inner_post_scope`、`target_snapshot`，原 CSS 查询仍为 `target_query`，其余字段异常仍为 `fields`。同时只在带有 CSS 查询阶段 note 时把对应 DOM 查询错误投影为容器定位失败，避免集合快照异常碰巧含同一文字时被误分类。没有改读取结果、动作、重试、超时、浏览器 owner 或旧 Release。所属 Runner/受管读取测试 8/8 通过，正常读取合同 2/2 通过（真实浏览器项按现有显式门跳过）；改动文件 Ruff 在排除 `hybrid_main.py` 既有 F401 未使用导入后通过，原样全文件 Ruff 仍报该文件既有 F401；受管 fork 来源清单更新 `read.py` 和 `targets.py` 哈希，规范 setup 与 `--check` 均通过，最终来源摘要 `80bbe96277d770752d150432a5534ad0a84f5eceb3c5b06df245e7c7b3d71b5b`；`git diff --check` 通过。没有启动真实浏览器，旧可见故障的原始子因仍未知；本改动只使下一次同类错误可在安全回执中区分阶段。

# 2026-09-25 显式清理开发端口的 npm script（实施前记录）

用户运行 `npm run dev` 时，4175 被此前独立启动的本项目 API PID 11936 占用。该进程命令使用相对入口 `apps/api/src/main.ts`，健康接口没有 `development` 根目录身份；`scripts/dev.mjs` 的自动接管守卫无法从进程命令推断 checkout，正确拒绝停止。只读 SQLite 已确认没有活动访谈、准备或执行；随后核对精确 PID/命令并仅停止 11936，4173/4175 均释放。用户需要一个显式的 npm script，在此类已知端口占用时主动清理本项目开发端口，而不改自动启动守卫的保守行为。

Product Alignment:
- natural-language task: 用户主动清空本地工作台/API 开发端口，再重新运行开发服务。
- reusable chain boundary: 仅开发期进程与端口管理；不接触 Requirement、B-U、TaskChain、发布或正式执行数据。
- runtime inputs: 工作台端口 4173、当前配置的 API 端口、OS TCP LISTEN 的 PID 集合。
- dynamic task outputs: 被终止的端口/PID 与端口释放结论。
- generic platform capability used: 现有 `scripts/dev.mjs` 的 TCP listener PID 查找、开发服务安全 shutdown、Node `process.kill`。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 显式清理当前项目开发服务器端口。
- existing implementation in repository: `tcpListenerPids` 已区分 TCP LISTEN 与 UDP/客户端端口；`requestDevelopmentShutdown` 可优先关闭带开发身份的单进程宿主；`selectedPorts` 统一 4173 与可配置 API 端口。
- mature candidates and pinned versions: 复用 Node 24、既有 Windows `Get-NetTCPConnection`/Unix `lsof`、现有 `find-process` 2.1.1；无新依赖。
- selected implementation: 根 `npm run clean` 显式调用现有开发端口探测，二次核对端口与 PID，只停止初始占用者，等待端口释放；如新占用者出现则失败且不终止它。
- reused public surface: 现有 `dev.mjs` 的端口选择、OS listener 查找及优先开发服务 shutdown。
- B-A-T-owned adapter and remaining gap: npm 命令只对开发端口作明确终止，不能替用户判断其他端口或操作系统服务的归属。
- license/runtime/platform fit: 现有 Node/OS 命令，Windows 本机定点验证；macOS/Linux 行为待对应设备。
- browser/runtime/state ownership conflicts: 不关闭 Browser owner、不删除 Profile、数据或工作区文件；清理命令本身是用户对指定开发端口占用进程的显式授权。
- replay model calls: 0。
- rejected candidates and evidence: 不放宽 `npm run dev` 的自动接管身份门，不加入宽泛 `taskkill`/全部 node 进程清理；那会误停其他项目和用户程序。
- focused validation: 清理函数的稳定/变化 PID 定点样本与 `npm run clean` 空端口行为；不运行根级或全量测试。

实施与定点结果：根 `package.json` 增加 `clean` script，调用 `scripts/dev.mjs --clean`。它复用现有 TCP LISTEN PID 查询与开发宿主 shutdown；初始 PID 集合二次核对后仅终止这些 PID，若出现新占用者则停止而不杀新进程，5 秒内等待端口释放。`node --check scripts/dev.mjs` 通过，4173/4175 空闲时 `npm run clean` 返回“开发端口已空闲”；本项目临时子进程监听随机端口 49858，调用同一清理函数后子进程退出且端口释放；注入 PID 从 8001 变为 8002 的样本返回“新的占用者”，终止调用为零。未运行根级或全量测试，也未停止用户服务。

# 2026-09-26 新需求输入被旧执行清理状态误锁（实施前记录）

截图中新建任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的输入框无法聚焦。旧任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 的 execution `82bdc9d7-e341-4d0d-8885-cd091f56c15b` 自 23:42 起为 `cleanup_required`/`unconfirmed`；清理审计记 `activeResources:false`。`projectTaskSummary` 将该状态投影为 `executing`，工作台再把它选为全局 running，`TaskWorkspace` 将其他任务的 `blocked` 传给共享 Timeline 的 `disabled`，所以文字输入本身被禁用。截图创建于 23:56，另一 B-U job 23:58 才启动，不能把截图归因于那次试做。命令行调用现有 `cleanup_execution` 被 API 的 `Sec-Fetch-Site` 门以 `forbidden_ai_origin` 拒绝，旧记录未被改写；不得伪造浏览器来源来绕过产品边界。

Product Alignment:
- natural-language task: 用户在已有运行记录待清理或其他任务正运行时，新建需求并先写下自然语言目标。
- reusable chain boundary: TaskRun/Execution 的清理状态独立于浏览器活动；全局互斥只阻止实际受限操作，不阻止本地编辑对话草稿。
- runtime inputs: 已持久化的 execution/cleanup 状态、任务列表状态、当前受控 composer 草稿。
- dynamic task outputs: 如实显示待清理状态；新任务文字可聚焦输入，真正的并行发送限制仍由现有 UI/API 执行。
- generic platform capability used: 既有 TaskSummary 投影、AI Connect Timeline 的 `sendDisabled` 与 `composerDraft` 公共属性。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在禁发消息期间保留可编辑的对话草稿，并准确显示执行清理状态。
- existing implementation in repository: `ChatTimeline` 已持有受控草稿，`TaskWorkspace` 已显示全局任务提示；TaskChain execution 合同已有 `cleanup_required`。
- mature candidates and pinned versions: 沿用本仓库现有 `@agent-platform/ai-connect-react` 0.3.2 与 Zod 4.1.8，不引入库。
- selected implementation: 用共享 Timeline 明确支持的 `sendDisabled` 控制发送、保留 composer 可编辑；TaskSummary 明示待清理，避免投影成进行中的浏览器活动。
- reused public surface: 已打包的 `InteractiveTimelineProps.sendDisabled` 文档明确“阻止聊天发送，同时保留草稿、控件和停止动作”；继续使用现有 `composerDraft`。
- B-A-T-owned adapter and remaining gap: 只调整 B-A-T 的状态投影和传参；旧 execution 仍须经工作台的受控清理恢复，不自动改写审计。
- license/runtime/platform fit: 无新增依赖或进程；沿用现有许可和 Windows 服务。
- browser/runtime/state ownership conflicts: 不关闭浏览器、不释放未知 owner、不重试 B-U、不改旧运行结论。
- replay model calls: 0。
- rejected candidates and evidence: 不把 `cleanup_required` 直接改为业务失败或成功，不用 `npm run clean` 清理浏览器；这两者都不能表达持久化清理状态。命令行请求被同源门拒绝，不绕过。
- focused validation: task status 合同与投影的定点测试、Workbench composer 门的定点验证、所属包类型检查；不跑根级或完整任务链。

实施与定点结果：TaskSummary 增加 `cleanup_required` 展示状态，执行投影不再把它写成 `executing`；实际仍在处理的其他任务继续禁止发送，但共享 Timeline 用其现有 `sendDisabled` 保留输入框可编辑。合同、Workbench、API 三个所属包的 TypeScript 检查通过，Workbench 现有模型发送门测试 3/3、改动文件 `git diff --check` 通过。确认最新 B-U job 已终止且项目 Python/Chrome owner 已退出后，仅用用户要求的 `npm run clean` 清理 4173/4175 并重启 `npm run dev`。新 API `/api/tasks` 返回旧任务 `cleanup_required`、新任务 `new`，4173 页面 200，Vite 当前模块已加载新的 `sendDisabled`/`disabled` 属性。未通过浏览器实际点击与键入复验；旧 execution 的清理审计仍未确认，未改写原失败结论。

# 2026-09-26 样本复跑 read scope 来源交接（实施前记录）

正式任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82` 的第二次准备 job `ea2ccf85-cda3-4f63-8f64-87ddcb5f637c` 已完成 B-U 和首编译，但样本运行 `2a0c20dd…` 在 `s-a-0003 browser.read-fields` 读前范围核验失败，固定码 `hybrid_read_inner_pre_scope_value_error`。首次导航 `s-a-0001` 成功；源轨迹在导航后到一个未编译的只读 `find_elements` 之前，同一 tab/同一 document 的 URL 从合集页转为剧集页，并保存了 `before_action_read_refresh/readonly_observation_refreshed` 证明。`advanceReadOnlyBoundary` 仍要求这段 URL 完全相同，分类为 `runtime_scope_read_exclusion_discontinuous`；运行节点因此只剩 B-U 的静态剧集页 URL scope。本次样本重新从合集入口导航，读前校验失败。固定错误码没有原始 ValueError 和现场 URL，不能进一步断定底层三种 ValueError 中的哪一种。

Product Alignment:
- natural-language task: 用户确认动态最新内容后，第一次试做编译出的读取步骤须在新一次合法导航后重新读取页面。
- reusable chain boundary: B-U 来源提供同文档只读刷新证据；编译只准入经证明的页面交接，运行时以本次 Browser owner 的页面状态绑定 read scope。
- runtime inputs: 来源轨迹的前后观察、URL digest、document identity、只读刷新诊断及本次运行浏览器状态。
- dynamic task outputs: 运行时 read scope 和字段结果；异文档、缺证据或跨 tab 仍拒绝。
- generic platform capability used: 现有 `classifyRuntimeScopeDecisions`、`HybridRuntimeScopeState` 与 `browser.read-fields@2`。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 试做中的同文档只读 URL 变化后，安全地重绑本次运行的读取范围。
- existing implementation in repository: 已有 `runtimeScopeFrom`/`runtimeScopeReadOnlySameDocument` 标记、来源证据验证、运行时同 session/tab/document 核验；当前缺口只在被排除的只读动作边界传播。
- mature candidates and pinned versions: 继续复用现有 Zod 4.1.8、workflow-use 0.2.11 和 browser-use 0.13.8；不引入或替换库。
- selected implementation: 在现有 TS 分类器内，仅凭已验证同文档刷新诊断接受中间只读动作 URL 漂移，并把只读同文档标记传到运行；不改 Python 浏览器控制。
- reused public surface: 现有来源 `observation_diagnostic`、`document_identity` 与 RuntimeScopeState 公开边界。
- B-A-T-owned adapter and remaining gap: 仅对 B-A-T 自有的来源到版本化链路适配补齐证据交接；旧失败运行不能逆改，完整新任务仍需正式验收。
- license/runtime/platform fit: 无新依赖、平台分支或会话；Windows 定点验证。
- browser/runtime/state ownership conflicts: 保持一个 Browser owner，运行时换 tab、换 session、换 document 拒绝；不加入网站特例。
- replay model calls: 0。
- rejected candidates and evidence: 不删除 read scope、不忽略 ValueError、不放宽浏览器页面身份检查；这会让错误页面字段进入结果。
- focused validation: 分类器中间只读 URL 漂移正反例、RuntimeScopeState 同文档/跨文档正反例、API 所属包类型检查；不整跑 B-U。

实施与定点结果：`advanceReadOnlyBoundary` 仅在 `find_elements` 的已验证同文档只读刷新诊断存在时接受中间 URL 漂移；分类器把该漂移传成现有 `runtimeScopeReadOnlySameDocument` 标记，并核验前驱到当前读取仍为同一文档。点击等非读取节点不能获得此标记。所属 API 测试 5/5、API 类型检查通过。对失败 job 的持久化来源只读重新分类，`s-a-0003` 由旧的 `runtime_scope_read_exclusion_discontinuous` 变成 `runtimeScopeFrom=s-a-0001` 且 `readOnlySameDocument=true`；该来源没有可选准备图，物化阶段不会移除标记。这只验证原失败来源的分类/交接，不证明新 B-U、样本、独立复验或播放。

# 2026-09-26 最新目标与访问限制的访谈边界、来源题板长度（实施前记录）

正式工作台任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 原话只要求在指定服务播放“最新一集”，没有免费限制。首轮 `web_search` 真实执行，用户确认了作品入口。随后访谈生成推荐选项“最新已公开正片”，副说明却规定最新集需会员时回退到最新免费集；用户点击后，草案 v1 固定了回退规则。准备任务按该草案运行，打开第 180 话；这不能算用户原目标的成功。该来源候选的 333 字选项说明来自 URL 与原始搜索摘要拼接；完整摘要应作为可追溯证据保留，但题板只需简洁地辅助选择。用户本轮明确纠正：有证据显示最新集需会员时，应先问是否具备并愿意使用会员；回答没有后，只有先查明具体可访问替代集、再问是否接受，才能变更目标。门槛若在 B-U 现场才发现，须退回需求对话，正式运行不自行择旧集。旧草案须保留为历史版本，后续纠正须走正式需求版本。

Product Alignment:
- natural-language task: 用户给一句普通动态目标，访谈识别真正最新对象；有证据表明它需额外资格时先问用户，否定回答后另行确认具体替代对象。
- reusable chain boundary: 访谈 Skill 决定业务歧义和提问，来源 Question 只投影已持久化搜索候选；B-U 执行用户确认的唯一草案，不替换目标。
- runtime inputs: 原始需求、用户后续纠正、已确认来源、只读搜索候选及原摘要。
- dynamic task outputs: 语义一致的草案版本、简短来源候选预览及完整可追溯证据。
- generic platform capability used: 现有 Pi 搜索、Common Question、SourceCandidate 和版本化访谈状态。
- replay model calls: 0；访谈模型调用不进入普通链路复跑。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 让动态目标排序与访问资格分离，并控制来源候选题板的信息密度。
- existing implementation in repository: 私有访谈 Skill 和 stage guidance 已负责语义；`sourceQuestion` 使用 Common Question，`SourceCandidate.description` 保留既有摘要片段，`aiEvents` 保留完整工具输出。
- mature candidates and pinned versions: 沿用已接入的 `@agent-platform/ai-connect` 0.3.2 Common Question、Pi AgentSession 与 Zod 4.1.8；无新依赖。
- selected implementation: 在 Skill 和访谈指令中明确资格确认与替代目标确认是先后两个决策；B-U 新发现的业务门槛退回需求对话；来源题板只展示有长度界限的摘要预览，原候选描述与完整工具输出分别保留在来源和搜索事件。
- reused public surface: `createCommonQuestionFromPanel`、现有访谈 prompt 层与 SourceCandidate 合同。
- B-A-T-owned adapter and remaining gap: 仅调整 B-A-T 的访谈规则及候选显示投影；模型实际是否遵守仍须用新的自然短句从正式 UI 验证。
- license/runtime/platform fit: 沿用现有组件及 Windows 开发运行环境。
- browser/runtime/state ownership conflicts: 不启动浏览器、不改 B-U owner、运行时、旧任务或旧草案。
- replay model calls: 0。
- rejected candidates and evidence: 不用站点剧集词典、会员关键词过滤或宿主打分来替模型判断语义；不默默改写已经确认的 v1 草案。
- focused validation: 所属来源题板长摘要预览测试、访谈 prompt 定点检查、API 包类型检查；正式 UI 的下一条全新短句和完整任务链验收单独记录。

实施与定点结果：访谈 Skill 和阶段指令已写明资格确认、替代对象调查与第二次确认的顺序；访问门槛在 B-U 才显现时返回需求对话。`sourceQuestion` 只对题板摘要作 88 字符预览，候选原描述和 `aiEvents` 原始工具输出不改。来源所属测试 12/12、API 包 TypeScript 检查、改动文件 `git diff --check` 通过。新规则尚无新的正式任务模型行为证据；旧任务 v1 与试做、样本、复验不计作修后通过。

# 2026-09-26 访谈搜索历史在 Timeline 中可见（实施前记录）

任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的 `aiEvents` 持久化了真实 `web_search` 开始和完成事件、两条查询及原始结果；现有 `projectInterviewTimeline` 也产出 `tool-progress` hooks。但当前接入的 `@agent-platform/ai-connect-react` 0.3.2 `InteractiveTimeline` 从 `entries` 构造可见内容，`hooks` 只留在 value，不进入该组件的历史活动区；所以搜索完成后页面看不到搜索 UI。搜索结果原文约 8.9 千字符，须折叠呈现并保持可检查，不能再贴入题板。

Product Alignment:
- natural-language task: 用户用普通短句提出任务后，访谈按需只读搜索，并能看到真实搜索及其依据。
- reusable chain boundary: 搜索由访谈工具执行；Workbench 只把持久化事件投影成用户可读历史，不伪造工具调用或把搜索写入任务链。
- runtime inputs: 访谈消息的 `aiEvents`、工具 callId、查询和实际工具输出。
- dynamic task outputs: 每次实际搜索的简短状态、查询和可展开的原始结果，刷新后仍可见。
- generic platform capability used: 既有 `InteractiveTimelineItem.kind="content"` 与 `ConversationEntry` 投影接口。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在共享 Timeline 中显示已完成的访谈搜索记录和完整证据。
- existing implementation in repository: 搜索事件已由 API 持久化，`projectSearchHook` 已解析开始/完成/失败、查询和引用；Workbench 使用共享 `InteractiveTimeline`。
- mature candidates and pinned versions: 复用当前 `@agent-platform/ai-connect-react` 0.3.2 公开的 `content` entry，不新增库或另造 Timeline。
- selected implementation: 保留现有 hooks 供其他 Timeline 消费；同时仅对真实 `web_search`/`search_sources` 事件投影一条历史 content entry，主行简短，原始工具结果放折叠区。
- reused public surface: `projectInteractiveTimelineValue`、`InteractiveTimelineItem.kind="content"`、原生 HTML `details`。
- B-A-T-owned adapter and remaining gap: 只补 Workbench 的事件到 UI 投影；不修改共享组件、搜索工具或持久化事实。
- license/runtime/platform fit: 沿用已验证组件和浏览器原生折叠控件，Windows/React 19 可用。
- browser/runtime/state ownership conflicts: 仅只读展示，不发起第二次搜索、不控制浏览器。
- replay model calls: 0。
- rejected candidates and evidence: 当前共享 `InteractiveTimeline` 的可见活动只从 `entries` 的 reasoning/tool part 读取，忽略 `value.hooks`；更换/复制 Timeline 或把完整搜索摘要塞进 Question Panel 都会扩大职责和界面负担。
- focused validation: 对真实结构事件的投影与可见 markup 定点测试、Workbench 包类型检查；不运行根级或完整任务链。

实施与定点结果：Workbench 在共享 `InteractiveTimeline` 的公开 `content` entry 内，把每次真实搜索调用压成一条可见记录，查询与终态在主行，原始结果和提取的引用在原生折叠区；旧来源 Question 仅在有匹配 `sourceResolution.questionId` 时生成最多 88 字的只读预览，原始问题、来源候选与工具输出均未改写。两个所属包定点测试 2/2、Workbench 类型检查、`git diff --check` 通过。对正式任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 的持久化状态只读重投影，得到 1 条真实搜索记录、可展开原始结果；原来源副标题 333 字，历史 UI 投影为 137 字。浏览器实际页面呈现由后续工作台验收核验；本验证不代表业务目标正确或完整任务链通过。

# 2026-09-26 业务调查误入来源提案后的状态恢复（实施前记录）

新任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的首版草案没有主动核查会员资格；操作者随后错误地代用户发了指导性补充，故该任务不得计作自然短句一次通过。该轮 `web_search` 用于调查已选来源内的观看资格，模型仍调用 `present_source_candidates`，生成了多余来源 Question。下一轮普通纠正消息将该 Question 标为 `superseded`，但对应 `sourceResolution` 仍为 `open`；`assertRequirementReady` 会将此孤儿来源误判为待决，阻止日后新草案。原已选来源必须保留，未确认草案和用户对话不能由脚本改写。

Product Alignment:
- natural-language task: 用户纠正对话中的错误提问后，系统保留原来源与完整历史，并能继续就真正的业务问题提问。
- reusable chain boundary: Question 的待决生命周期与来源决议状态一致；来源解析只服务入口确认，业务事实搜索不成为新入口。
- runtime inputs: 已持久化的 Question 状态、`sourceResolution.questionId` 与用户新一轮消息。
- dynamic task outputs: 被取代的来源候选标为 superseded，原 selected 来源不变，新业务问题仍可继续。
- generic platform capability used: 现有访谈状态、`beginRound`/`finishRound` 和确认门。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 访谈来源题板被新对话取代时同步撤销对应来源待决事实。
- existing implementation in repository: `finishRound` 已把旧 open Question 标为 superseded；`sourceResolution` 通过 questionId 关联，`assertRequirementReady` 已拒绝未决来源。
- mature candidates and pinned versions: 沿用现有 `@browser-capture/contracts` 访谈状态与 Zod 4.1.8；不引入依赖。
- selected implementation: 在已有轮次边界按 questionId 同步 open 来源决议；对已持久化的孤儿状态在下一轮开始时同样收敛。原 selected、answered 决议不变。
- reused public surface: `InterviewState.unresolved`、`sourceResolutions`、`beginRound`、`finishRound`。
- B-A-T-owned adapter and remaining gap: 仅维护 B-A-T 的版本化访谈事实一致性；被指导性消息污染的任务仍不可作一次通过验收。
- license/runtime/platform fit: 仅 TypeScript 状态投影；Windows/SQLite 既有环境。
- browser/runtime/state ownership conflicts: 不运行浏览器、不修改旧草案或旧执行。
- replay model calls: 0。
- rejected candidates and evidence: 不直接改 SQLite 或静默选择多余来源；这会抹去错误问答的审计，也不能修复一般状态交接。
- focused validation: 所属 transition 测试覆盖 open Question 被取代与持久化孤儿下一轮收敛，API 包类型检查；不整跑产品任务。

# 2026-09-26 用户自身事实题不预设推荐答案（实施前记录）

新任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的会员题板把“有且愿意使用大会员”标成推荐。该题只询问用户自身资格和使用意愿，访谈搜索无法证明用户的答案；更早的需求对话是操作者用用户身份补写指导才引出此题，因此该任务不构成自然短句首轮成功证据。`commonQuestionAuthoring` 当前强制每道选择题恰有一个推荐，Skill 也作同样要求，这是无依据推荐的直接协议原因。

Product Alignment:
- natural-language task: 用户只说普通目标，访谈在需要时主动调查并向用户确认其个人资格，不替用户暗示答案。
- reusable chain boundary: 访谈模型判断该问什么；公共 Question 仅表达问题与可选推荐，宿主不根据网站或词语猜测用户身份。
- runtime inputs: 用户原话、可追溯搜索证据、访谈历史和已知用户决定。
- dynamic task outputs: 对用户自身事实的无推荐业务 Question；有证据支持的方案取舍仍可给一个推荐。
- generic platform capability used: AI Connect Common Question Authoring 的 `recommendation: "optional"`。
- replay model calls: 0；访谈不进入链路复跑。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 区分有依据的方案建议与只有用户能回答的事实题。
- existing implementation in repository: `apps/api/src/interview/protocol.ts` 已复用 Common Question parser/projector；当前设置 `recommendation: "required"`。
- mature candidates and pinned versions: 已固定 `@agent-platform/ai-connect` 0.3.2 的公开 `CommonQuestionAuthoringOptions` 支持 `forbidden | optional | required`，已装组件支持无推荐选项；不引入库。
- selected implementation: 改用公开的 `optional`，在访谈 Skill 和阶段指令中约束事实题不推荐答案；保留有依据的方案推荐。
- reused public surface: `commonQuestionAuthoring` 与 `createCommonQuestionFromPanel`。
- B-A-T-owned adapter and remaining gap: 仅调整访谈呈现规则；模型是否自主调查并正确提问尚需未受操作者指导的新任务证明。
- license/runtime/platform fit: 不变，沿用现有 TypeScript/Windows 包。
- browser/runtime/state ownership conflicts: 无浏览器操作或状态迁移。
- replay model calls: 0。
- rejected candidates and evidence: 不由宿主按会员或其他业务关键词自动删推荐，也不把用户自身事实伪装成有优劣的方案；这会把语义判断移出访谈模型。
- focused validation: 协议测试核验无推荐事实题可被接受、多个推荐仍拒绝，并执行 API 包类型检查；不运行正式任务或全量测试。

# 2026-09-26 自然语言纠正与未决 Question 的轮次交接（实施前记录）

正式工作台任务 `449e20e7-91aa-46ed-bac1-2cdc93b0ad8c` 在无开发指令的普通短句及同版来源选择后，访谈自己调用 `web_search` 调查访问资格，给出无推荐的会员 Question。随后使用普通用户表达“资格不确定、只要最新、受阻不换旧集”，模型完整生成了符合草案段落语法的 Markdown，API 却将轮次记为 failed。持久化输出和源码可定位：`parseInterviewOutput` 在 `finishRound` 把上一道 open Question 标为 superseded **之前**调用 `assertRequirementReady`，仍见 `interview_unresolved_items_open`；失败后旧 Question 仍 open。该时间顺序使自由纠正不能成稿，用户只能点不能如实表达的二元选项。不得用点击“有会员”或重复整跑掩盖。

Product Alignment:
- natural-language task: 用户可以用正常语言纠正上一道题，说明“不知道资格但保持原目标、受阻停止”，访谈在此基础上形成可审阅草案。
- reusable chain boundary: 模型判断纠正是否消除业务歧义；宿主只在验证本轮候选草案时投影本轮成功提交后会发生的 Question 生命周期，不替模型选择答案。
- runtime inputs: 当前 active turn、此前 open Question、来源决议、用户自然语言回复和模型本轮草案。
- dynamic task outputs: 通过机械确认门的同版草案，或仍可核验的未决错误；真实状态只在成功轮次提交后改变。
- generic platform capability used: 现有 `InterviewState`、`beginRound`/`finishRound`、Common Question 与 `assertRequirementReady`。
- replay model calls: 0；仅访谈轮次调用模型。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 自然语言回复可以取代过时题板，且草案验证看到与成功提交一致的待决状态。
- existing implementation in repository: `finishRound` 已在成功时 supersede 旧 open Question 并同步 open 来源决议；`parseInterviewOutput` 当前在此之前检查原状态。
- mature candidates and pinned versions: 沿用 AI Connect Common Question 0.3.2、现有 Zod 4.1.8 和既有访谈状态；无新依赖。
- selected implementation: 对正在运行的轮次，草案准入用纯投影模拟其成功提交后对旧 open Question/关联来源的 supersede；成功时仍由 `finishRound` 原子写回，失败不抹掉历史 Question。
- reused public surface: `parseInterviewOutput`、`finishRound`、`assertRequirementReady`、`sourceResolution.questionId`。
- B-A-T-owned adapter and remaining gap: 仅修 B-A-T 访谈轮次状态与草案门的先后次序；语义充分性仍由访谈 Skill 判断，不增加关键词分类器。
- license/runtime/platform fit: 无新增库或平台路径，Windows 现有环境。
- browser/runtime/state ownership conflicts: 不触碰浏览器、不改旧任务草案、不自动确认草案或启动 B-U。
- replay model calls: 0。
- rejected candidates and evidence: 不代用户点会员选项、不跳过所有待决校验、不在失败轮次原地标记回答；这些会伪造决定或丢失可恢复 Question。
- focused validation: 自然语言纠正后本轮草案可验证、失败轮次原状态不变、未证实入口仍拒绝，所属 API 测试与类型检查；不整跑 B-U。
## 2026-09-26 Pi 搜索来源列表标题的证据保真

Product Alignment:
- natural-language task: 用户只说要在指定服务播放某作品的最新一集，访谈自行搜索并让用户核对来源。
- reusable chain boundary: 草案确认后才把一个有引用的入口交给 B-U；动态目标由版本化链路在运行时选择。
- runtime inputs: 无；账号资格与页面现场状态由浏览器观察，不能由搜索或宿主猜测。
- dynamic task outputs: 目标正片已开始播放，或明确报告无法播放；不可回退到旧集冒充成功。
- generic platform capability used: Pi `web_search` 工具事实、来源候选引用、公共 Question 与草案版本门。
- replay model calls: 0；来源解析只属于访谈。
- site/task-specific code added: no

Reuse Assessment:
- capability: 把 Pi 只读搜索返回的原始来源列表标题与 URL 原样保留到来源题板。
- existing implementation in repository: `PiSourceSearchObserver`、`piSearchCandidates`、`SourceCandidate` 和公共 Question 投影已经存在。
- mature candidates and pinned versions: 继续复用仓库现有 Pi 搜索 extension 与 AI Connect；不引入新的搜索/解析库。
- selected implementation: 在既有解析适配层识别搜索结果中编号标题紧邻 URL 的结构，以该原标题更新同一 URL 的候选展示。
- reused public surface: `web_search` 的原始文本事件及现有来源候选/Question 合同。
- B-A-T-owned adapter and remaining gap: 仅保存真实搜索文本的标题和引用；来源业务相关性仍由访谈模型与用户判断，页面真实身份由 B-U 核验。
- license/runtime/platform fit: 无新依赖或运行时要求。
- browser/runtime/state ownership conflicts: 不启动浏览器、不更改来源选择或既有版本。
- replay model calls: 0。
- rejected candidates and evidence: 不以站名、链接路径、关键词相似度或候选顺序推断来源身份；本次原始搜索有“凡人修仙传 _ 国创 _ bilibili ...”的来源列表标题，但持久化候选只显示内联动作文字“点击观看/追番”及“身份尚待确认”，属于证据提取丢失。
- focused validation: Pi 搜索格式回归用例、访谈来源用例和 API 类型检查；本次旧任务的已确认候选不改写。

## 2026-09-26 动态候选域覆盖失败（调查记录；未实施修复）

正式新任务 `449e20e7-91aa-46ed-bac1-2cdc93b0ad8c` 的用户已确认需求明确要求“最新已发布正片；受限时停止，不改播旧集”。B-U 只读取当前页面的 177–184 分组，`li[title]` 查询的 10 项包含 2 个模式项和 8 个正片项，因 `dom_query.complete=true` 就把组内最大 184 当作全域最新。官方播放页近期显示第 192 集会员正片、第 193 集预告（[官方页面](https://www.bilibili.com/bangumi/play/ep3854807?from_spmid=666.5.banner.6)）。隔离只读 Chrome 核验了页面确有多个范围分组。后续编译、样本、独立复验和正式复跑技术完成，但沿同一局部候选集运行，业务结果失败。

**设计修正（2026-09-26）：** 最初提出的“编译候选域覆盖门”方案已撤回；编译器无法还原 B-U 未访问的页面，业务调查和纠错必须发生在 B-U 原现场。

### 修正后的 B-U 修复边界（未实施）

Product Alignment:
- natural-language task: 根据已确认草案，在 B-U 现场调查可能改变动态选择的页面内容，执行动作并观察结果；无法判断时明确未完成。
- reusable chain boundary: 需求对话确定业务目标；B-U 用浏览器现场完成探索；编译器只转换已记录的技术路径；普通复跑执行发布版本。
- runtime inputs: 已确认草案、当前页面、同一浏览器观察和账号现场状态。
- dynamic task outputs: 实际选择、动作后态和来源轨迹，或未查清的具体原因。
- generic platform capability used: browser-use Agent 原生观察/动作及同 Agent 后续任务接口、workflow-use 现有证据和编译接口。
- replay model calls: 0，显式 LLM 节点除外；B-U 的有界复核仍属于首次探索。
- site/task-specific code added: no。

Reuse Assessment:
- capability: B-U 动态选择前的现场调查和同 job 有界续做。
- existing implementation in repository: `author.py:251-253` 把增大 `max_results` 描述成覆盖完整候选列表，容易混同当前查询与业务范围；当前只调用一次 `Agent.run`。`natural_selection.py` 只验证已记录读取、函数和点击一致，不能还原未访问的页面。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8 Agent、受管 Browser 和 workflow-use fork；[上游 Agent.add_new_task/run 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/agent/service.py) 支持同 Agent/history/browser 的后续任务。其内建 judge 仅附 verdict，不自动纠错或续做。
- selected implementation: 待定点协议核验后，优先在 B-U 首次 `Agent.run` 与 collector.finish 之间做一次有界完成复核；若发现具体未调查的可见入口，则给同一 Agent 加后续任务并继续原 Browser。预算用尽或仍无法判明时，来源未完成。复核不能只靠模型自述“已看全”。
- reused public surface: browser-use 的原生动作、Agent.run 与 add_new_task；保留现有 capture、EvidenceCollector 和来源输出，不新建 Agent loop 或浏览器控制会话。
- B-A-T-owned adapter and remaining gap: 须核验二次 run 的总步数、模型用途审计、回调 step_number/trace 连续性，以及首次临时 done 不污染最终编译；编译保持技术一致性职责。
- license/runtime/platform fit: 不引入依赖，沿用现有 Windows Browser owner；跨平台效果未测。
- browser/runtime/state ownership conflicts: 同一 B-U job、Agent 和 Browser；不改写旧来源或已发布 V1。
- replay model calls: 0，显式 LLM 节点除外。
- rejected candidates and evidence: 增大 `max_results` 只能扩大单次查询；分页/候选域专用编译门无法重现漏看的现场；只打开 `use_judge=True` 不会续做，且压缩历史和截图仍可能漏判。
- focused validation: 先做二次 run 的步骤编号和 trace 定点协议测试，再用通用多视图现场验证 B-U 能在同一 job 续查并纠正局部选择；最终仅以一个全新正式任务验收。未运行这些测试。

## 2026-09-26 修复前记录：同版结果、人工等待与原窗口交付

Product Alignment:
- natural-language task: 用户可要求获取数据或文件，也可要求操作完成后继续使用当前网页；访问限制发生时由用户在原站点处理。
- reusable chain boundary: 已确认准备草案的结果意图与来源证据投影到 Plan、候选链和不可变 Release；正式复跑沿发布链执行，结束后由本次 browser owner 交付或清理现场。
- runtime inputs: 草案版本、运行时输入、页面观察、当前 execution 的 browser owner 与可见模式。
- dynamic task outputs: 本次实际值、目标页面引用、人工等待事实，以及窗口交付或清理的独立事实。
- generic platform capability used: 既有 outputContract、TaskRun checkpoint、TaskAuthoringJob.waitpoint、RunnerProcess、BrowserProfileService owner、Workbench 状态投影。
- replay model calls: 0，除已发布链中的显式 llm 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在同一浏览器现场等待用户处理访问限制，并在需要时交付已完成任务的原窗口。
- existing implementation in repository: browser-use 0.13.8 的 Agent/Browser、hybrid Runner 和 browser owner；TaskRun human_required/checkpoint、准备 job waitpoint、单次 headless 合同与工作台组件已存在。
- mature candidates and pinned versions: 复用固定 browser-use 0.13.8 与现有 RunnerProcess、BrowserProfileService；先核验其公开 CDP 附着/会话停止接口与 Windows 行为。
- selected implementation: 待 Windows 最小真样证明同一 owner 可在关闭自动化控制会话后保留原窗口，才冻结查看租约和同 owner 人工交还适配。
- reused public surface: browser-use 的 BrowserProfile.cdp_url/is_local、BrowserSession 生命周期及现有 Runner/TaskRun 协议；不复制 Agent loop 或浏览器驱动。
- B-A-T-owned adapter and remaining gap: 草案通用交付标记的同版投影、运行时结果与目标页绑定、人工等待/恢复、查看租约审计及跨任务通知。
- license/runtime/platform fit: 沿用仓库已固定依赖；Windows 同窗存活、Profile 锁及服务重启认领尚须实测。
- browser/runtime/state ownership conflicts: 每个产品运行一个控制会话；人工等待与交付只转移本次可证明的 owner，不重开 URL 冒充原现场。
- replay model calls: 0，显式 llm 节点除外；首次 B-U 续做属于准备模型用途。
- rejected candidates and evidence: 当前 runner.close 会关闭其拥有的 Chrome；单改 headless、keep_alive 或跳过 close 不能证明安全交付，重开 URL 不是同一页面。
- focused validation: 先用固定依赖做 Windows 原窗口断开控制/留存/结束清理真样，再做同 owner 等待与恢复、重启失主门；最后从正式工作台验 UI/API/SQLite 和可见原窗口。

Windows 最小真样（独立临时 Profile，`work/handoff-lifecycle-probe/result.json`，未使用产品任务）：系统 Chrome 由 B-A-T 样本进程持有，browser-use 0.13.8 通过公开 CDP URL 附着；`Browser.stop()` 后 Chrome owner PID、原 page target ID、data URL 与可见窗口仍在，随后只终止经专属 Profile 命令行核验的该 owner 树并清理专属临时 Profile。首次样本把 `cdp_url/is_local=False` 只传给 `BrowserProfile`，但该版本 `Browser` 构造器在直接 `cdp_url` 缺失时会覆盖 `is_local=True`，因此该次不能证明非本地附着；改为同时传给 `Browser(..., cdp_url=..., is_local=False)` 后二次样本 `attachedNonLocal=true`、`sameTargetAfterStop=true`、`windowAfterStop=true`、`ownerAliveAfterCleanup=false`。这只验证基本断开/存活/定点结束，不验证视频连续播放、Runner 协议、租约持久化或服务重启认领；这些仍是实施门。[固定版本 BrowserSession.stop 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/browser/session.py)、[LocalBrowserWatchdog 源码](https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/browser/watchdogs/local_browser_watchdog.py)。

实施后底层真样（`apps/api/tests/managed-window-runner.acceptance.ts`，Windows，1/1）：真实可见 Chrome 在首次 Runner 导航与观察后 handoff，自动化 Runner 清理确认且原 owner/target 保留；同 owner 新 Runner 的 sessionId/tabId 与首次一致，二次 handoff 保持 leaseId/targetDigest，再经 focus 与 end 定点结束。异主启动和异主 end 均拒绝。复用 browser-use 0.13.8 公开 `Browser(..., cdp_url=..., is_local=False)`、`Browser.stop()`；Chrome 可执行文件定位暂借固定版本 `LocalBrowserWatchdog._find_installed_browser_path('chrome')` 内部方法，只用于定位，不复制浏览器驱动或 Agent loop。Chrome 原生 localhost DevTools HTTP 仅验证 PID、Profile、CDP、target 身份及激活 target；浏览器动作仍走既有 Browser-Use capability。该真样不证明正式工作台、真实访问限制、视频连续播放或服务重启恢复。

## 2026-09-26 修复前记录：任务永久删除与全局通知

Product Alignment:
- natural-language task: 用户能永久移除自己选择的任务及其私有历史，同时在切换任务后仍看见需要处理或已经完成的任务状态。
- reusable chain boundary: 删除只作用于一个 task 的访谈、准备、发布和运行事实；通知仅投影已有持久化 job/execution 事实，不更改链路或任务结果。
- runtime inputs: 目标 taskId、已确认的删除命令、本次任务与 browser owner 状态；通知读取持久化状态和单调事件。
- dynamic task outputs: 删除成功或可操作的拒绝原因；跨任务待处理、完成和失败提示。
- generic platform capability used: Fastify、SQLite/Drizzle 事务、Pi session 删除导出、cleanupOwned、既有工作台列表与 Radix 组件。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 安全删除任务拥有的持久化记录和私有 session，并投影跨任务状态。
- existing implementation in repository: TaskStore/TaskChainRepository、现有 archived 列表、BrowserService.cleanupOwned 与任务状态 API；Pi binding/sessionId 分别以 taskId/jobId 关联。
- mature candidates and pinned versions: 复用已固定 @agent-platform/pi-agent-session 0.1.0 的 platform-internal 删除导出、better-sqlite3 12.10.0/Drizzle 0.45.2 事务、Radix Themes 3.3.0；删除前核验导出与残留行为。
- selected implementation: 先拒绝活动或 owner 不明的任务，清理可证明属于目标的 Pi 私有状态，再在单个 SQLite 事务中按外键顺序删除 task 专属行；UI 收到成功才移除列表。通知由既有 job/execution 数据派生。
- reused public surface: PiAgentSessionBindingStore/deletePiSessionData、SQLite transaction、现有 Fastify route 和工作台组件；不重写 Pi 路径校验或文件删除。
- B-A-T-owned adapter and remaining gap: task 到 Pi session/job、运行 owner、外部审计和各关系表的所有权映射；失败可重试诊断与当前/归档列表更新。
- license/runtime/platform fit: 既有本地 Windows 依赖，无新增库；platform-internal 是固定版本的弱稳定接口，须定点验证。
- browser/runtime/state ownership conflicts: 活动执行、cleanup_required、未知 owner 均拒绝删除；只清除该 task 自有资源，不动全局 aiSettings 或其他任务 Profile。
- replay model calls: 0。
- rejected candidates and evidence: archive 仅改 tasks.archived；SQLite 外键没有自动级联，直接删 tasks 会失败或遗留记录；直接递归扫 Pi/浏览器目录无法证明所有权。
- focused validation: 隔离新任务的活动拒绝、无活动删除、重启后 task 各专属表与 Pi binding 无残留、其他任务与全局设置不变；跨任务通知按真实 job/execution 状态显示并在切换后保留。

实施前核验（删除切片）：当前 SQLite 为 v18，`operations` 只有 scope/requestId/digest/resultId，没有 taskId；现存全局旧键中有 14 条旧修订／布局操作，其 resultId 已无存活事实可证明归属。新记录须写入显式 owner；旧记录只能按直接任务 scope 或仍存在且唯一的结果事实归属定向删除，14 条不可猜删。当前主库没有 `researchRuns`，但迁移链中的新库会创建它，删除须按真实表存在性处理。`originAccessEvents`/`originAccessBlocks` 是跨任务来源访问限制事实，不能为删除一个任务清空全局限流。Pi 0.1.0 `platform-internal` 明确导出 `PiAgentSessionBindingStore` 与 `deletePiSessionData`；该删除先去 binding 再删 session 文件，文件删除失败时适配层须恢复原 binding，保留重试入口。Browser journal 是全局 owner 文件与追加日志；只可在 owner 已关闭且日志每行可验证 taskId 时移除该任务记录，遇到损坏或未知归属须拒绝，不能粗删。

## 2026-09-26 访谈结果形状：同版记录列表

正式工作台新任务 `486738b7-00fb-4d7d-9e23-93d2dc62f49c` 暴露通用合同缺口：自然需求要求返回多条各含标题和链接的记录，但已确认 v1 草案把标题和链接声明为两个顶层文本字段，投影为单个对象，无法表示逐项对应关系。该首次确认和 B-U 尝试保留为原始事实；修复只约束后续草案，不回写任务数据。

Product Alignment:
- natural-language task: 一次运行交付来源范围内多条对象，每项保留相互对应的业务字段。
- reusable chain boundary: 访谈草案确认结果形状；同版 Plan/ResultSpec 只投影草案；B-U 读取并编译实际来源，普通复跑按不可变 Release 返回记录数组。
- runtime inputs: 已确认来源、运行时业务输入与真实页面内容。
- dynamic task outputs: 逐项的字段记录及空集合；字段值、条数和顺序由本次真实执行决定。
- generic platform capability used: 现有 ValueSchema 数组/对象、ResultSpec 根路径、ResultBinding 与 typed outputContract。
- replay model calls: 0，除显式 llm 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在可审阅草案中表达并验证多条配对字段记录的结果合同。
- existing implementation in repository: `ValueSchema` 已有 `array<object>`，`ResultSpec` 的 `valuePathSchema` 接受空根路径，TypeScript `requiredPathsCovered` 和现有 Python `compile_result_binding` 均支持整份结果一个根路径 producer；草案 parser 之前只生成顶层 object 字段。
- mature candidates and pinned versions: 直接复用仓库已固定的 Zod、TypeScript ResultSpec、workflow-use 既有输出绑定；不新增或替换库。
- selected implementation: 数据草案显式写“单条记录”或“记录列表”，后一种将字段解释为每条记录的属性，投影一个数组对象合同和根路径 `[]` 的整体 producer；旧无形状草案按原单对象读取。
- reused public surface: `valueSchemaSchema`、`resultSpecSchema`、同版 `projectPreparationPlan` 与既有 B-U 请求序列化。
- B-A-T-owned adapter and remaining gap: Markdown 语法投影、访谈提示和固定形状验证；B-U 对全域来源、编译、正式 UI 与 SQLite 的真实验收另行记录。
- license/runtime/platform fit: 无新依赖或跨平台行为。
- browser/runtime/state ownership conflicts: 不改任务浏览器、原任务、数据库或 Release。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 顶层平行“标题列表”和“链接列表”没有逐项配对合同；让 Plan 或编译器从“全部”猜出数组形状违反同版草案唯一事实源。对每个数组元素声明固定索引路径也会冻结动态条数。
- focused validation: `preparation-draft-handoff.test.ts` 与 `interview-protocol.test.ts` 共 22/22 通过，`@browser-capture/api` TypeScript 检查通过；真实 B-U、首编译、正式复跑和 UI/SQLite 的新形状验收未测，不会重跑旧任务冒充首次通过。

## 2026-09-26 列表来源同现场证据门与编译装配

正式目录任务的第一个 B-U 把一次精确查询的 0 命中及两次宽查询的 156/175 命中当作“全部一级章节”，最终输出两个拼接字符串；来源标成功，但编译因精确字段读和结果装配缺证失败。新草案的记录列表合同解决上游形状，来源阶段还需在原 Browser 关闭前核对业务集合与实际可复跑读取。

Product Alignment:
- natural-language task: 用户可要求某个来源范围内全部有序记录，每条记录带相互关联字段。
- reusable chain boundary: 访谈确认范围与输出形状；B-U 同一 Agent/Browser 调查范围并给出实际读取；编译只映射已证明的动作和值；发布后普通链路零隐式模型复跑。
- runtime inputs: 已确认草案与来源、真实页面和运行时数据。
- dynamic task outputs: 每条记录的字段、顺序和数量，以及现场证据不足时的明确未完成。
- generic platform capability used: browser-use 0.13.8 原生 `extract`/`find_elements`、既有宿主 DOM ReadSpec 双次现场重验、同 Agent `add_new_task`、workflow-use 输出装配。
- replay model calls: 0，显式 `llm` 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 在来源关闭前核对结构化集合输出的范围查询与成对字段读取，保留给编译器可验证的证据。
- existing implementation in repository: `record_projection_snapshot` 可从原生 extract 的增强 DOM 两次重验 ReadSpec；`find_elements` 可保存完整查询与有序容器身份；已有 completion review/continuation 与 compiler gap/coverage。
- mature candidates and pinned versions: 沿用已固定的 browser-use 0.13.8 Agent/Browser 与受管 workflow-use fork，无新增依赖。
- selected implementation: 对实际输出中的记录数组要求宿主配对读取的 schema/value digest、同页完整非零查询、同序容器 identity digest/数量一致；复核须引用具体查询并判断业务范围。证据不足时同一 Agent 续查一次，仍不足则来源失败。探索查询只有与最终值/schema 精确相符才进入输出装配。
- reused public surface: browser-use 原生动作及 `Agent.add_new_task`/`run`；现有宿主 ReadSpec、来源 collector、编译器输出装配与 action coverage。
- B-A-T-owned adapter and remaining gap: 连接来源查询、宿主读与结果合同的证明；模型对“业务全集”的判断仍需真实页面和正式新任务检验，机器 cardinality 不单独证明业务范围。
- license/runtime/platform fit: 既有固定依赖与 Windows Runner；没有新许可证或平台能力。
- browser/runtime/state ownership conflicts: 同一准备 job、Agent、Browser 和累计步数；只在关闭前续查，不启动第二个控制会话。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 调大 `max_results` 只扩大一次局部查询；在编译器猜未访问页面、接受无 read 的输出、把查询完整等同业务全集均会重复第一次失败。
- focused validation: 新增集合门槛 5/5、输出范围 1/1、完成复核 7/7、输出装配 15/15、fork 摘要核验通过；记录投影 19/20，唯一 `host_record_projection_ambiguous` 在原始 HEAD 相关模块上也复现。正式新任务产品全链另记，不把定点测试当成验收。

## 2026-09-26 根数组结构化输出的 JSON 值适配

第二条从正式工作台新建的普通目录任务 `233dd9fe-0be6-4927-8f05-d326f0721b53` 在首次 B-U 就失败。持久化来源显示原生 `done(success=true)` 返回了 `data.value` 中 15 条成对的标题/链接记录，且两次完整候选查询各为 16 项；宿主却保存 `output=null`、`sourceSuccess=false` 和 `business_output_schema_not_proven`。只读解码确认 `AgentHistoryList.get_structured_output(output_model)` 可以解析该原生结果；旧 `output_model_for` 对根数组直接取 `.value`，其中元素仍为 Pydantic 子模型，随后 JSON Schema 校验期待 JSON 对象而拒绝。它是输出适配边界的类型错误，不能把这一条失败来源重写成成功。

Product Alignment:
- natural-language task: 用户可以要求一组动态记录，每条记录保留对应字段，也可以要求单值或单条对象结果。
- reusable chain boundary: 已确认草案定义结果形状；B-U 的原生结构化 `done` 经既有结果适配和 JSON Schema 校验成为来源事实；编译只消费通过校验的真实输出，普通复跑使用发布的结果绑定。
- runtime inputs: 已确认的动态输出 schema、B-U 原生结构化结果与现场读取证据。
- dynamic task outputs: 符合草案 schema 的 JSON 数组、标量或对象；数组项数和值由实际运行决定。
- generic platform capability used: 既有 browser-use 结构化输出、Pydantic v2 `model_dump(mode='json')` 和 JSON Schema 校验。
- replay model calls: 0，除发布链路中的显式 `llm` 节点。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将根层非对象结构化输出转换成真正的 JSON 值，再交给已有 schema 校验。
- existing implementation in repository: `apps/api/python/browser_use_runner/output_schema.py` 已用 `create_model` 包装根层非对象 schema；对象根原本通过 `model_dump(mode='json')` 处理，但非对象根直接返回 `.value`，保留嵌套 Pydantic 对象。
- mature candidates and pinned versions: 沿用 `vendor/workflow-use/workflows/uv.lock` 固定的 browser-use 0.13.8、Pydantic 2.12.5、jsonschema 4.25.1；没有新增、替换或删除库。
- selected implementation: 对非对象根使用已有 Pydantic `model_dump(mode='json')['value']`；原对象根的可选字段处理与后续 JSON Schema 校验不变。
- reused public surface: browser-use `AgentHistoryList.get_structured_output`、Pydantic `BaseModel.model_dump` 和既有 `output_model_for`/结果校验边界。
- B-A-T-owned adapter and remaining gap: 只做 B-A-T 输出合同的 JSON 值适配；16 个页面候选到 15 条业务结果的过滤缺少可复跑、确定性的读取/选择合同，不能靠序列化修复来证明。还须从全新正式工作台任务验证首次 B-U、首编译及后续全部门槛。
- license/runtime/platform fit: 复用现有 Python 运行环境和库公开 API；无新增许可或平台依赖。
- browser/runtime/state ownership conflicts: 不增加浏览器会话、不修改 Agent 探索或持久化旧来源；数据转换只在原生 `done` 的结果适配边界执行。
- replay model calls: 0；首次 B-U 的模型调用仍按准备用途单独审计。
- rejected candidates and evidence: 让 JSON Schema 直接接受 Pydantic 子模型会改变通用值合同；把这次 15 条按网站或条数特判、忽略 16→15 差异，均不能证明结果在普通复跑时可从页面确定性重现。
- focused validation: 所属 Python 定点用例覆盖 `list<object>`、`list<string>`、标量与 `null`，1/1 通过；旧失败 artifact 只读解码为 15 条普通 JSON 记录，schema gap 为 0；受管 fork manifest 核验通过。16→15 的确定性过滤合同与正式新任务首轮 B-U/首编译仍未由这些检查证明，旧失败记录不改写。

## 2026-09-26 动态记录列表的现场读取与滚动动作效果

第三条正式工作台新任务的首次来源输出与两次完整候选查询均为同序 16 项，包含 Appendix，但来源仍因配对字段现场读取缺失而失败。定点追踪发现原有记录投影要求结果 JSON Schema 明写 `maxItems`；用户要的是动态列表，合法根数组合同没有这个字段。另一个独立 gap 来自编译器把末尾 `scroll_position changed` 一律判为不能证明业务完成，尽管运行能力已有对滚动位置变化的定点后置检查。两项都不能通过删除来源动作、固定 16 项或弱化结果证据来绕过。

Product Alignment:
- natural-language task: 用户要求从实际页面范围读取动态数量的有序记录，每条含对应字段；探索时也可能滚动以调查页面。
- reusable chain boundary: 首次 B-U 同一 Browser/Agent 采完整查询和宿主双快照配对读；编译保留滚动的物理效果，但结果完成仍单独依赖 ReadSpec、输出装配和集合范围证据；普通复跑按固定链路运行。
- runtime inputs: 本次页面、完整 DOM 候选、结果 schema 和实际滚动前后态。
- dynamic task outputs: 数量及值均由页面决定的记录列表；缺失字段、超出安全预算或来源不完整时明确失败。
- generic platform capability used: browser-use 0.13.8 的原生 `find_elements`、既有宿主 ReadSpec 的 300 项上限、`OrdinaryCapability.execute_checked` 的 `scroll_position changed` 后置条件。
- replay model calls: 0，显式 `llm` 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 对无声明 `maxItems` 的动态数组安全取得成对页面记录，并为已发生的滚动保留可复验的物理效果。
- existing implementation in repository: `record_projection_capture` 的宿主双快照、ReadSpec 限额与 backendNodeId；`collection_completion` 的完整查询同序核验；`natural_compile` 的普通动作效果编译；运行器已有滚动变化核验。
- mature candidates and pinned versions: 复用当前固定的 browser-use 0.13.8、受管 workflow-use fork 与现有 ReadSpec；无新库、框架或浏览器控制路径。
- selected implementation: `maxItems` 缺省时只在读取器内部采用现有 300 项安全上限，显式超限仍拒绝；宿主容器摘要采用与原生查询相同的 backendNodeId 顺序格式；滚动只编译位置 `changed` 后置条件，不充当结果完成证明。
- reused public surface: browser-use 原生浏览器动作、宿主 ReadSpec 与已实现的 `OrdinaryCapability.execute_checked` 后置条件。
- B-A-T-owned adapter and remaining gap: 把同现场候选、成对读取和结果合同接成可核查来源；旧失败产物没有宿主双快照，离线不能证明修后会成功。完整候选到经业务规则过滤的子集仍缺通用确定性变换合同。
- license/runtime/platform fit: 没有新增依赖，继续使用当前 Windows Runner 和固定 Python 环境。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser，不回写失败 task/source；现场读取仍受单 owner 和同页目标约束。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 给结果 schema 强加固定 `maxItems` 会把动态业务数量冻结；只看原生 `done` 和查询数量无法证明配对字段可复跑；丢弃末尾滚动会改变动作 trace；用滚动证明业务完成会跳过独立数据核验。
- focused validation: `test_host_read_mapping` 6/6、`test_collection_completion` 5/5、`test_natural_scroll_effect` 2/2；`test_record_projection_capture` 14/15，唯一 `host_record_projection_ambiguous` 与交接中原 HEAD 同样复现，属基线。旧来源的 16 条输出与两次完整查询逐项同序同值，但没有持久化宿主双快照，不能离线证明修后首 B-U/首编译；须由另一条全新正式工作台任务实证。受管 fork 清单核验另记。
## 2026-09-26 完整原生查询对齐 extract 双快照

Product Alignment:
- natural-language task: 从页面范围返回全部配对记录，字段与条数由实际页面决定。
- reusable chain boundary: 原生查询记录候选身份；extract 双快照证明读取；编译输出普通 ReadSpec。
- runtime inputs: 已确认输出 schema、同页完整查询、两次冻结 DOM。
- dynamic task outputs: 逐项有序记录与明确证据不足。
- generic platform capability used: 已有 browser-use DOM/query、ReadSpec 和宿主 selector 证明适配器。
- replay model calls: 0，显式 llm 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将完整原生查询中的成对字段映射到业务字段，保留同一批节点身份与双快照证明。
- existing implementation in repository: find_elements_read_spec/read_fields_with_proof 已有稳定读取；record_projection_snapshot/record_projection_dom 已有双快照与 selector 证明。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use、jsonschema 4.25.1；无新依赖。
- selected implementation: 在既有双快照投影失败时，用完整原生查询约束唯一逐字段映射和有序 backendNodeId 摘要；两个快照分别复现相同值、节点身份及选择器后输出现有 ReadSpec。
- reused public surface: Browser DOM snapshot、原生 find_elements、现有 ReadSpec/读运行器。
- B-A-T-owned adapter and remaining gap: 只连接原生来源到 B-A-T 输出合同，不重写查询、Agent 或执行器；机器集合一致仍须原有业务范围复核。
- license/runtime/platform fit: 既有固定依赖与 Windows；无新增许可证。
- browser/runtime/state ownership conflicts: 不增浏览器控制会话，不改原始查询事实，不回写旧任务。
- replay model calls: 0，显式 llm 节点除外。
- rejected candidates and evidence: 直接改写 find_elements 的 VerifiedRead 会破坏原生查询规格和消费者绑定；只去掉可见性过滤会误选重复导航项。无模型现场诊断中 16 条记录仅 5 条可由原快照投影定位，其余为 anchor_missing；原生查询完整保存 16 项。
- focused validation: 将用所属 Python 测试覆盖完整映射、重复导航项、隐藏于视口外的记录、子集/歧义/顺序或身份变化拒绝，以及来源到编译装配；真实产品验收另记。

补充复跑边界：完整集合的新 ReadSpec 标记 `requireComplete=true`，若实际集合超过内部读取预算则抛出既有 `read_collection_limit`，不静默返回前缀；缺省 false 的旧规格 canonical bytes 保持不变。TypeScript/Zod 边界显式保留此可选标记。快照投影另核验 query/read actionRef 配对并限制最多 20,000 个 DOM 节点，超限明确拒绝。基础读取、普通执行和预算均复用既有能力。

## 2026-09-26 来源接收与编译协议准入分离

第六条新任务 Python author/序列化/传输均结束，API 的 `hybridAuthorResultSchema` 拒绝结果；旧边界只记固定失败码，未保留具体 Zod 路径或来源产物，因此无法追溯精确字段。接收事实须先于严格编译准入保存。

Product Alignment:
- natural-language task: 任意浏览器任务的首次代表执行结束后，其来源不能因编译协议不兼容而丢失。
- reusable chain boundary: Runner 规范化响应接收 → 私有未验证产物 → 严格来源及编译准入。
- runtime inputs: 原确认需求/计划/步骤/输入摘要、受管源码摘要、Runner 响应。
- dynamic task outputs: 独立的接收证据与通过准入的来源；前者不具备可执行资格。
- generic platform capability used: 既有 TaskArtifact、SQLite、Zod 和 owner 生命周期诊断。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 跨语言边界失败证据保留。
- existing implementation in repository: saveArtifact、source/v2 准入、SourceLifecycleDiagnostics、ZodError。
- mature candidates and pinned versions: 既有 SQLite/better-sqlite3 12.10.0、Zod 4.1.8；不新增依赖。
- selected implementation: 复用任务产物持久化；新增 received-source/v1 明确 unverified，不进入既有 source/v2 复用路径。
- reused public surface: repository.saveArtifact、Zod.parse/ZodError.issues。
- B-A-T-owned adapter and remaining gap: 接收回调连接任务身份；固定协议字段的安全错误路径；未验证记录只供诊断，不修补或篡改原响应。
- license/runtime/platform fit: 沿用仓库既有依赖，Windows 本地 SQLite。
- browser/runtime/state ownership conflicts: 接收保存发生在关闭和校验前；关闭仍在既有 finally 路径完成，无第二浏览器。
- replay model calls: 0。
- rejected candidates and evidence: 只记笼统失败码已使第六次真实失败丢失子因；记录 raw error.message 会扩散页面内容，不采用。
- focused validation: schema 拒绝前回调保存且正常关闭、不进入候选；嵌套 union 安全路径与敏感键/值/错误文字不落日志；API TypeScript。

## 2026-09-26 主线单一来源与采集、离线编译分离（第 0/1 步进行中）

第六条正式新任务的第一次 Python author/序列化/传输完成，但 TS 对复合 author 结果的 schema 准入失败，持久化来源数为 0、编译调用数为 0；精确字段子因缺历史记录。当前 `source/v2` 把采集请求与 `compilerResponse` 放在同一产物，`received-source` 又为诊断形成一条未验证保存热路径。上一节的 `received-source` 双保存只记录当时的局部诊断做法，不是新主线。决定见 [ADR 0012](../adr/0012-mainline-single-source-and-phase-boundaries.md)。下列选型是修复边界，不能写成已经通过产品验收。

Product Alignment:
- natural-language task: 任意浏览器任务从已确认需求开始，在一条真实浏览器路径上采集来源，再生成可验证、可复跑的链路；数据读取和页面交互均适用。
- reusable chain boundary: 唯一已确认草案 → 同版确定性投影 → 单 Browser 代表采集 → 每次采集唯一不可变来源 → 显式离线编译 → 样本/独立复验 → 手动 Release → 独立 Run。
- runtime inputs: 草案版本及来源引用、步骤/动态输入、Browser 原生 trace、当前 owner 关闭事实和固定输出合同。
- dynamic task outputs: 实际 `output`、完整 `canonicalRequest`、`sourceGaps`、从 trace 派生的来源技术摘要，以及独立编译结果或缺口；值与条数来自真实运行。
- generic platform capability used: browser-use Agent/Browser、workflow-use 编译、现有 Pydantic 规范化序列化、Zod 边界、SQLite TaskArtifact 和 LangGraph 运行调度。
- replay model calls: 普通节点为 0；仅发布链中的显式 `llm` 节点可调用模型。首次代表采集与准备期注解分别审计。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 把一次代表采集固定为单一、可重读的来源，让编译在浏览器关闭后独立消费它。
- existing implementation in repository: `author.py` 已调用 browser-use 并生成 natural request；`hybrid-artifact.ts` 的 `source/v2` 仍含 `result.response`/`compilerResponse`，`hybrid_compile`/workflow-use 已有离线编译入口，`hybrid-received-source.ts` 保存未验证诊断产物，TaskArtifact/SQLite 已持久化任务私有版本事实。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、Pydantic 2.12.5、Zod 4.1.8、better-sqlite3 12.10.0 与 Drizzle 0.45.2；workflow-use 继续使用受管 fork，LangGraph 继续承担既有图运行。无新增、替换或删除依赖。
- selected implementation: Python author 仅返回 `{ output, canonicalRequest, sourceGaps }`，复用既有 Python canonical serializer 完整保留 trace 和 request 数值；history、技术 `sourceSuccess`、browser command count 从同一 trace 派生。TS 在接收 JSON 时先存唯一不可变 `source/v3` 原文，标记 `received`，随后才严格解析三字段并核对同版身份；拒绝时只留下这份不可编译的原文。owner close 的结论另记在 job 来源引用；恢复时严格重读该来源，只有已确认关闭、显式指定且与确认草案同版/身份/摘要匹配的来源可进入离线编译，编译响应只进入独立产物。
- reused public surface: browser-use Agent/Browser、受管 workflow-use natural compile、Pydantic 序列化、Zod.parse、既有 TaskArtifact/SQLite 持久化和 LangGraph StateGraph。
- B-A-T-owned adapter and remaining gap: 跨 Python/TS 的来源 schema、版本/digest/owner 绑定和一次保存由 B-A-T 实现；原文保存不等于来源准入，恢复入口仍须严格校验。旧 `source/v2`、`received-source` 与旧模型计划只供历史查看，不作为计划、编译或恢复执行输入，也不设执行兼容层。旧模型计划生成、纠正和方案续接入口已删除，API/Workbench 类型检查通过；后续仍须让 LLM 输出引用真实读取并正式验收产品链路。
- license/runtime/platform fit: 复用本仓库已固定的 Python/TypeScript 依赖和 Windows 本地运行环境；无新许可证、外部服务或平台要求。
- browser/runtime/state ownership conflicts: 一个准备 job 内只使用一个 Browser owner；接收时保留来源以免关闭失败丢证，关闭确认后才允许编译。编译失败保留来源，不自动启动第二个 Browser，也不从旧失败任务找来源；旧来源/Release/SQLite 事实不改写，历史记录仅供查看。
- replay model calls: 普通复跑 0，显式 `llm` 节点除外；采集/注解模型调用保持独立用途审计。
- rejected candidates and evidence: 继续把含编译响应的复合 author 结果当来源会重现第六条的跨语言准入耦合；活跃地双写 `received-source` 与正式来源会形成两份状态；编译失败自动重采会掩盖首次失败并占用新 Browser；给 v2 或旧模型计划保留执行兼容会让两套业务事实源继续并存。
- focused validation: Python canonical 输出/trace 所属定点 4/4、TS 来源/关闭/离线注解等独立定点合计 26/26；原文拒绝后留存、关闭失败和首编译失败相关的 5 项重跑通过，属于这 26 项的子集，不另计。最近来源回调修改后的 API 类型检查与 Workbench 类型检查通过。尚无新合同的正式产品验收，且旧入口拒绝/历史只读须继续按实际证据核对。之后从正式工作台新建普通需求，逐门记录首次来源、首编译、样本、独立复验、发布、正式 Run 与 UI/API/SQLite/交付现场。

## 2026-09-27 现场方法编译差距与读取裁剪后的证据保留

### 正确性复审后的本轮最小修复

Product Alignment:
- natural-language task: 从任意列表读取数据或判断下一步是否存在，准备保存方法，正式执行产生完整结果。
- reusable chain boundary: 原生查询结果/宿主方法采样 → 来源事实 → 正式输出绑定。
- runtime inputs: 既有 ReadSpec、当前页面、确认后的结果合同；不增加网站或业务字段。
- dynamic task outputs: 实际读取结果及其派生数量；代表样本不冒充最终结果。
- generic platform capability used: 既有 DOM 字段投影、ReadSpec、ResultBinding、数据 count 和原生查询采集。
- replay model calls: 0；显式 llm 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 样本范围准确、空查询证据贯通、正式绑定基数可满足性。
- existing implementation in repository: read.py 的逐字段 DOM 投影、_read_shape 的标量数组包装、DomQueryEvidence/capture、natural_output/ResultBinding；这些公开阶段的职责已审查。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use 0.2.11、既有 Pydantic/Zod/JSON Schema；不引入、删除或替换库。
- selected implementation: 在原字段投影中增加宿主采样参数，复用同一投影脚本和原 ReadSpec；coverage 沿既有 readPath 计数。空查询修真实生产者；准备兼容和正式结果兼容分层，正式阶段拒绝互斥基数及已知缺少集合选择的直接绑定。
- reused public surface: 现有 browser element.evaluate/Tools 结果、字段投影、capture、自然编译和 TS 物化入口。
- B-A-T-owned adapter and remaining gap: 只修上述阶段连接，不实现第二个读取引擎或调度器；重复控制仍须单独闭合。
- license/runtime/platform fit: 同一 Windows/Python/TS 依赖和许可证，无额外服务。
- browser/runtime/state ownership conflicts: 不创建 Browser，不改会话所有权或原有运行历史。
- replay model calls: 普通读取与绑定检查均不调用模型。
- rejected candidates and evidence: 把旧 maxItems 的截断恢复为业务选择会混淆预算和语义；继续放宽正式结果合同会放行 max300→min1000 的不可能链；只测手造 complete=true 空查询会绕过真实生产者。
- focused validation: 新增所属测试从实际方法/原生 ActionResult 进入采集及编译消费者；验证真实投影次数、样本与正式读取分离、静态必失败绑定拒绝。结果随后记录于 PROGRESS，不跑产品任务或全量检查。

本轮结果：确定断点已有局部修复；所属 Python 19、TS 9 项最终通过，含修正夹具后仅重跑失败项，详细分类见 PROGRESS。所谓“实际方法/原生 ActionResult”是调用生产函数并提供模拟 DOM/CDP，不是让真实浏览器访问测试页面。用户复核后停止继续添加数量夹具；该证据只保护局部程序边界，不冻结自然重复方法编译为已实现，也不证明产品可用。本轮最终 API 类型检查、真实浏览器和产品验收未做。

后续实施更新：复用 ReadSpec、字段投影、原生 Tools 注册和 capture callback，新增宿主采样/证据适配；公开 `bat_read_fields` 只声明方法，`done` 只交读取引用。正式读取继续使用同一个 `read_fields`，不新增浏览器、Agent loop、图调度器或依赖。capture 已移除最终输出反推 DOM 的主线兜底。跨语言只在真实采样路径校验代表输出，原正式输出合同与每页预算保留。循环执行器已有，自然来源到 loops 的连接仍未实现；补充工具在 runtime 存在但 author 未注册的问题单列于差距清单，不能称已启用。

本阶段所属验证：采样 13、工具 7、证据 8、引用完成 4、done 边界 6、完整自然编译 2、准备边界 5 项，TS 方法来源 11 项以及 API 类型检查通过。首次运行有夹具失败，修正后只重跑受影响项；未运行根级/全量检查或任何新产品任务。普通原生动作现经 `Runner.execute → OrdinaryCapability.execute_checked → TargetResolver/Tools/StepVerifier`；字段读取经 `Runner.execute → read_fields`，这些是已有配套能力的实际调用。

主线核查见 [方法编译差距](MAINLINE_METHOD_COMPILATION_GAPS.md)。预执行的产物是现场方法及代表证据，完整业务集合由编译链路在运行时取得。当前方法交接和自然循环入口尚未补齐，禁止以新产品任务碰运气代替能力实现。

Product Alignment:
- natural-language task: 读取目录、查阅工单、逐页处理记录等通用任务；探索提炼 DOM 读取与重复操作方法。
- reusable chain boundary: 现场方法与代表证据 → 唯一来源 → 离线编译 → 既有读取、值绑定和循环节点。
- runtime inputs: 同版确认合同、运行参数、当前页面与动态继续条件。
- dynamic task outputs: 正式运行实际读取并累积的结果；代表样本不宣称为全集。
- generic platform capability used: 既有 ReadSpec/read_fields、browser-use Tools/callback、workflow-use 编译与证据、ValueBinding、LangGraph loop/predicate/accumulator。
- replay model calls: 普通复跑 0；显式 llm 节点除外。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 现场读取方法与重复执行的编译交接；本轮代码切片仅修复读取裁剪后的动作后态保留。
- existing implementation in repository: read.py/natural_reads.py、未注册的 field_read_tool、natural_compile_result.py、natural_read_liveness.py、hybrid-materializer.ts 和 runtime loop.ts。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、受管 workflow-use 0.2.11 和已有 LangGraph StateGraph；没有新增、替换或删除库。
- selected implementation: 继续使用已有浏览器读取、字段映射、后态和图运行器。方法入口及自然控制适配的具体变更须经过 A/B 门验证，尚未冻结为已实现选型。
- reused public surface: Browser-Use 原生动作及公开 Tools 注册/callback；已有 ReadSpec、natural_effect_condition、consumer_readiness、ActionCoverage、TaskChain loop/predicate/accumulator。
- B-A-T-owned adapter and remaining gap: 方法与样本分离、真实读取引用、自然来源到循环 IR 的适配仍缺失；不复制 Agent loop、浏览器控制或调度器。
- license/runtime/platform fit: 不新增依赖或许可证边界；局部修复在当前 Windows Python 环境验证，未声称跨平台真实验收。
- browser/runtime/state ownership conflicts: 本轮只有离线编译代码与文档，未启动 Browser；后续仍由一个产品 owner 持有一个控制会话，来源仍只保存一次。
- replay model calls: 0；当前修复是确定性的编译行为。
- rejected candidates and evidence: 不能原样恢复旧逐条 DOM refs 工具，其采样/最终数量耦合未解决；不能把旧 CompilationRequest/authority 执行兼容接回新自然入口；不能把 done 扩成第二张图；loop.ts 已支持所需调度，不应新建循环执行器。
- focused validation: 本轮仅运行 test_natural_scroll_effect 与 test_natural_read_liveness 一次，9/9。保护物理 scroll 证据在裁剪后仍存在，以及失去唯一后态时仅返回 typed gap/不可编译审计而不发送空后态执行段。方法读取、自然循环和正式产品 A/B/C 门尚未通过。

## 2026-09-27 读取方法引用的精确复用

Product Alignment:
- natural-language task: 分页目录或工单列表等任务在后续页面继续读取相同字段。
- reusable chain boundary: 已成功验证的读取方法引用 → 当前页代表读取 → 原生 capture → 自然编译。
- runtime inputs: 当前 owner 的已验证 readRef、页面与既有输出合同。
- dynamic task outputs: 当前页面新样本与运行时实际数据，保留原方法的 ReadSpec/outputPath/maxItems。
- generic platform capability used: MethodReadRecords、ReadSpec、sample_read_fields、verified_natural_read、既有编译器。
- replay model calls: 普通读取 0；没有新增模型或浏览器控制循环。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 方法参数的显式引用复用与来源严格验证。
- existing implementation in repository: method_read_tool.py 的记录集和展开器、method_read_evidence.py、natural_reads.py。
- mature candidates and pinned versions: 沿用受管 workflow-use 0.2.11（上游 5d2d19fe8835cc86f1bf3e04302a5000d590f249）及已有 browser-use 范围 >=0.13.8,<0.14。
- selected implementation: 扩展现有 bat_read_fields 参数；复用已有 sample_read_fields/read_fields，不引入库。
- reused public surface: browser-use Tools action 的 Pydantic 参数模型、现有成功记录、capture 与编译读取事实。
- B-A-T-owned adapter and remaining gap: 把只含 readRef 的模型参数绑定到同 owner 更早成功记录；引用调用仍产生独立当前页证据。
- license/runtime/platform fit: 不变更依赖、许可证或进程；使用当前 Windows 既有 Python 解释器作离线定点验证。
- browser/runtime/state ownership conflicts: 不创建浏览器；引用在注册本工具返回的 MethodReadRecords 内解析，不跨 owner。
- replay model calls: 0。
- rejected candidates and evidence: 不放宽规格相等；已知旧来源 normalizeWhitespace true/false 不相同，必须保留失败证据。
- focused validation: 只做所属参数/引用/capture/自然编译生产入口测试；结果追加 PROGRESS，不启动新真实来源。

## 2026-09-27 根数组读取路径的合同提示

Product Alignment:
- natural-language task: 目录清单、工单清单等任务以记录根数组交付。
- reusable chain boundary: 确认输出合同 → 工具参数说明 → 当前页读取方法与既有 capture。
- runtime inputs: 真实 output_schema、显式 outputPath=[] 或已验证 readRef。
- dynamic task outputs: 仍由当前页面读取；说明不含页面猜测或业务数据。
- generic platform capability used: 现有 Pydantic 工具 schema、MethodReadToolParams、sample_read_fields。
- replay model calls: 0；未新增重试或控制循环。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 将真实根数组路径与 Browser-Use 结构化响应包装的 value 字段区分。
- existing implementation in repository: output_schema.py 的非对象响应 value 包装；method_read_tool.py 已按真实合同验证路径。
- mature candidates and pinned versions: 继续使用现有 Pydantic create_model 和 browser-use Tools，依赖版本不变。
- selected implementation: 为根数组注册参数 schema 的路径 description/examples，并给路径校验错误追加固定安全提示。
- reused public surface: 既有 Tools.action param_model、严格路径验证和 ActionResult.error。
- B-A-T-owned adapter and remaining gap: 仅说明 outputPath=[] 来自真实业务合同；不改业务 schema、不把错误参数自动改成有效参数。
- license/runtime/platform fit: 没有新依赖、进程或平台行为。
- browser/runtime/state ownership conflicts: 不启动浏览器、不改变 owner 或记录所有权。
- replay model calls: 0。
- rejected candidates and evidence: 不把根数组包装成业务对象，不允许 ['value'] 或 ['value',0]，不加自动重试。
- focused validation: 新增所属定点测试验证工具 schema、真实 Tools 调用、无效包装路径拒绝及 readRef 兼容；仅 mock 采样，不开浏览器或模型。

## 2026-09-27 选择动作与需求冲突保持为准备缺证

Product Alignment:
- natural-language task: 通用自然语言浏览器任务的准备与方法编译。
- reusable chain boundary: 已确认需求下，从真实候选读取绑定参数化选择动作。
- runtime inputs: 当前候选集合及已确认需求。
- dynamic task outputs: 来源一致的选择方法，或带动作引用的准备缺证记录。
- generic platform capability used: 既有 annotate_selections、Pydantic 结构化拒绝与 CompilationGap。
- replay model calls: 0；本次验证使用受控拒绝返回，不调用模型或浏览器。
- site/task-specific code added: no

本次仅修正错误归属：observed_choice_conflicts_requirement 表示已执行的选择与既定需求冲突，落到既有 missing_binding / collect_evidence，不能单凭技术选错向用户要求重新确认需求。保留来源与动作引用，不增加协议、修复循环或 tests 文件。

最小行为验证通过：使用保存来源构造仅去除 selection_function 派生注解的内存输入，调用生产 annotate_selections，注入一次受控 observed_choice_conflicts_requirement 拒绝；结果为 actionRefs=[a-0003]、missing_binding、collect_evidence。原来源 SHA256 仍为 9cbd70faefdb1101386fa71939f2761db4e652a82fc08e0dc3145f3aaf08ef33，原 trace、探针输入和返回 trace 均未改变；真实模型调用 0，浏览器命令 0，无新增 tests 文件。证据：work/selection-refusal-classification-proof.json。限定文件 git diff --check 通过（仅现有 LF/CRLF 提示）。

## 2026-09-27 同页追加记录的宿主代表样本

Product Alignment:
- natural-language task: 通用清单读取、检索结果展开等同页追加任务。
- reusable chain boundary: 已验证 ReadSpec 的准备样本，不改变正式读取或循环编排。
- runtime inputs: 原 ReadSpec、宿主确认的完整 DOM 容器顺序、sampleLimit。
- dynamic task outputs: 在正式 maxItems 范围内最多三条代表记录，默认首一条与末两条；ordinal 保留真实 DOM 位置。
- generic platform capability used: 既有 sample_read_fields、project_field_records、JSON Schema 校验和页面身份快照。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 同页追加后，有限准备样本能够包含新增记录的稳定键。
- existing implementation in repository: read_sampling.py 只选择 DOM 前缀；read.py 的 project_field_records 已拥有字段投影、类型转换和字段错误处理。
- mature candidates and pinned versions: 沿用已固定的 Browser-Use 原生 DOM 元素与现有 jsonschema/Pydantic；没有依赖版本变化。
- selected implementation: 只适配宿主所选记录的索引，所有字段读取仍调用 project_field_records。
- reused public surface: 原元素 evaluate 与现有生产字段投影入口；不新增字段提取器。
- B-A-T-owned adapter and remaining gap: 宿主为代表样本保留原始 DOM ordinal；对象包装的 scalar-array 字段内部仍按原有 field_samples 前缀读取，本改动仅覆盖记录容器采样。
- license/runtime/platform fit: 无新库、进程或平台要求。
- browser/runtime/state ownership conflicts: 不创建浏览器，不改 ReadSpec、coverage.total/runtimeTruncated 或正式 read_fields。
- replay model calls: 0。
- rejected candidates and evidence: 不复制 Browser-Use DOM 控制与项目字段投影；该职责仅为已有投影选择有界容器子集，不需要另加库。
- focused validation: inline 调用生产 sample_read_fields，受控 DOM 传输返回覆盖一/二/三条、追加前后新稳定键、真实 ordinal、截断边界及正式 read_fields 全量读取；不开真实浏览器或模型，不新增 tests 文件。

本组最小验证已通过：生产 sample_read_fields/read_fields 加受控 Browser-Use 传输共九例；0/1/2/3 条不变，5→8 条追加时样本从 ordinal=[1,4,5] 变为 [1,7,8] 并读出真实新增稳定键；sampleLimit=1/2、正式 maxItems=5 截断及 coverage.total=8/runtimeTruncated=true 保持原语义。正式 read_fields 仍按原 DOM 顺序返回全部预算内记录，ReadSpec 摘要不变。首轮无失败；真实浏览器与模型调用均为0。证据 work/read-sampling-tail-proof.json；未声称真实按钮/滚动验收已通过。

## 2026-09-27 第4项京东人工登录恢复

Product Alignment:
- natural-language task: 用户完成登录/验证码后，在同一任务窗口继续只读检查。
- reusable chain boundary: 稳定IR中的显式人工等待能力交还现场，恢复继续同一run；不把跳到首页当成登录证明。
- runtime inputs: 已发布IR内人工条件、原owner/session/tab/checkpoint和授权来源。
- dynamic task outputs: 人工等待/恢复结果和后续真实页面读取。
- generic platform capability used: 现有capability.human、withHybridCapabilities、managedWindow handoff/observe和恢复条件。
- replay model calls: 0。
- site/task-specific code added: no（京东URL与标记仅属于隔离验证任务数据）。

Reuse Assessment: 现有LangGraph/TaskChainRuntime的capability.human、waitForCapabilityHuman和resumeState已拥有等待/恢复，不新增状态机。最初检查把legacy human节点当成当前stable节点，发现schema实际不支持后已撤掉该未验证适配，改用稳定IR能力browser.wait-for-human v1：必须显式human合同、read效果、空参数/配置，仅observe原现场并返回human_required。只增加B-A-T边界胶水，复用原managedWindow交接及原检查点。恢复仍按原条件验正，仅让现有equals-url条件和exists-url一样支持同owner授权站点内人工导航。站点URL与登录标记仅在隔离验收任务数据中，平台无京东分支。最小验证先验生产等待/条件未满足仍暂停/条件满足同run恢复，再打开用户选择的京东人工现场；受控回执不能替真实登录。
# 2026-09-27 通用人工介入主流程补接（实施中，未验收）

Product Alignment:
- natural-language task: 在登录、验证码或访问确认挡住任务时交给用户处理，随后完成原任务；本次实际样本为读取京东收藏商品前5项名称及链接。
- reusable chain boundary: 同一准备 Agent 的人工交接，以及编译后的同一 TaskRun 检查点恢复；适用于账户内读取和需要人工确认后继续的表单任务。
- runtime inputs: 版本化任务的人工作业说明、允许站点及恢复条件。
- dynamic task outputs: 用户确认范围内的实际业务结果；登录标记不代替任务结果。
- generic platform capability used: Browser-Use Tools/Agent 回调、原 human 合同、原检查点和受管浏览器身份。
- replay model calls: 0，显式 llm 节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 准备阶段等待人工并继续，以及把该操作编译成既有通用人工能力。
- existing implementation in repository: TaskChainRuntime.resumeState、browser.wait-for-human v1、HumanWaitpoint、TaskAuthoringJob.waitpoint、RunnerProcess 请求关联。
- mature candidates and pinned versions: 已有 browser-use 0.13.8、Python asyncio；不换库、不新增 Agent loop。
- selected implementation: 复用原生 Agent.run(on_step_end)；人工等待置于该公开回调内，宿主只适配受限控制消息。
- reused public surface: Tools.registry.action、Agent.run(on_step_end)、ActionResult、asyncio 任务/事件。
- B-A-T-owned adapter and remaining gap: 当前准备进程只接受顺序请求，尚无人工请求/继续命令和自然来源到 human 节点的映射，需补齐；运行期检查点已有，不重写。
- license/runtime/platform fit: 沿用仓库固定的 MIT Browser-Use、Python 3.12、Windows 运行配置。
- browser/runtime/state ownership conflicts: 等待时原 Agent 停在回调，保留一个浏览器；继续须绑定请求及原 session/tab，不能换窗口或凭用户回复直接判成功。
- replay model calls: 0；准备阶段恢复后仍由原探索 Agent 完成代表任务。
- rejected candidates and evidence: 不在 tool 函数内长期等待。官方 0.13.8 agent/service.py:2254-2271 将 step 放在 wait_for 内，而 on_step_end 在超时范围外；后者满足人工时间不消耗单步超时。
- focused validation: 待执行：真实生产入口的等待/错误身份/条件未满足/继续/取消；真实受限账户任务的业务结果、编译及普通复跑。当前均不记通过。

源码依据：https://raw.githubusercontent.com/browser-use/browser-use/0.13.8/browser_use/agent/service.py 。旧京东运行仅为手工组装链的局部恢复证据，不证明上述准备主线已接通。

## 2026-09-27 新标签页空 URL 快照：人工恢复后的首败修复

原任务215b5b90-f588-447c-afa8-6e66e143a2f2、原job d2259771-bc7a-4879-8b2d-9768bb640ec0真实人工恢复成功；a-0006原生click成功并自动切换新标签页后，after_step采集失败。不可变来源de0b6a24-baa7-403c-8513-af669fc4f616保留。最后快照诊断的baseline/current为同tab、同文档且稳定，SDK summary URL摘要却等于空字符串；反复cached=False仍耗尽30秒。首次业务准备失败，不计编译、收藏结果或复跑通过。安全摘要见work/human-favorites-first-failure-proof.json。

Product Alignment:
- natural-language task: 用户处理登录后继续读取授权内容；点击链接进入新标签页后继续查询或填写任务。
- reusable chain boundary: 准备采集的单一浏览器会话中新标签页状态与真实文档绑定。
- runtime inputs: 原会话、当前tab和既有动作。
- dynamic task outputs: 对应真实新页面的状态与可核验观察证据。
- generic platform capability used: Browser-Use Page实时URL查询、原生DOMWatchdog及既有SourceObservationScope。
- replay model calls: 0；本次适配不引入模型调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从当前受控标签页取得实时URL，交由原SDK生成一致的页面快照。
- existing implementation in repository: SourceObservationScope、原生get_browser_state_summary和前后文档一致性核验。
- mature candidates and pinned versions: 已固定browser-use 0.13.8的BrowserSession.get_current_page_url、Page.get_url及DOMWatchdog。
- selected implementation: 在现有观察作用域内，通过SDK公开Page.get_url读取实时URL；复用SDK原生DOM构建。
- reused public surface: BrowserSession当前页接口、Page.get_url（Target.getTargetInfo）及既有状态接口。
- B-A-T-owned adapter and remaining gap: 原get_current_page_url依赖SessionManager缓存URL，新tab缓存空值令DOMWatchdog提前返回空DOM。适配须绑定当前原会话/标签页，只在当前实例生效并在close恢复。
- license/runtime/platform fit: 沿用固定依赖、MIT许可及Windows/Python环境，无新增依赖。
- browser/runtime/state ownership conflicts: 不创建新控制会话、不修改SDK私有缓存、不接管DOM构建；保留原前后tab/document/URL核验。
- replay model calls: 0。
- rejected candidates and evidence: 单纯重复cached=False已在本次88次空URL快照中无效；放宽URL一致性检查会把不同页面证据混在一起，不采用。
- focused validation: 实施前记录；先验证固定SDK空URL分支、实时URL适配、作用域清理和真实换页拒绝，再从工作台复验原需求。当前未记修复通过。

最小验证结果：实际browser-use 0.13.8 DOMWatchdog配合受控传输共15项通过，包含修前空URL跳过DOM复现、修后原生DOM构建、当前tab返回副本、session/tab/URL/document变化拒绝及作用域退出恢复。首个负例发现旧root存在但selector_map为空时原守卫漏检，已补“快照提供document identity即须与实时identity一致”，首败保留。无浏览器/模型调用，未新增tests文件。证据work/human-post-navigation-snapshot-proof.json；fork摘要58474b2895c501c14ad4dfba56a397e3d3b55342da0b4d7f23eb6b4800b137a3已校验。固定SDK源码位置：browser/session.py:2406、browser/watchdogs/dom_watchdog.py:243、actor/page.py:295及301。此处通过仅为缺口修复验证，实站业务重试另记。

实站首次重试8a05ed6c-8e99-4845-8820-3678f922fc30仍失败：5次准备模型调用，a2点击由集合选择守卫阻止（entered=false、eventCount=0），实际只派发navigate及两次find_elements。后续观察出现额外home.jd.com/t.jd.com标签，模型响应期间焦点变为另一about:blank文档，a5尚未派发即因observation_changed_after_capture拒绝。用户不确定期间是否操作；SDK有target detach后恢复焦点/创建空tab的既有机制，但本轮未记录相应生命周期归因，原因保持未知，不归因用户或SDK，不放宽守卫。来源24506d1a-a610-4286-8d91-7c583c6de556/digest4c245bfb40cd4ae4b8e679de18402d25cb3140137476325836811f29e5d0d2b9及work/human-favorites-retry-first-failure-proof.json保留。该终止job不能人工继续或离线编译；由原确认需求发起一次限定重试，仍属带失败上下文的重试验收。

## 2026-09-27 准备探查与执行读取、现场选择与离线注解的边界修复

第三轮job4071fd86-3994-406c-8a61-9df04bbe4aa0完成真实代表试做，当前页面返回2条收藏，两条名称均为页面显示的“此商品已删除”，有商品链接；不推断已删除商品原名。来源67b9f84c-666b-426e-89f6-245020300f4e/digest2fd5c995364734121a5476491fce8a3bbd3dc4652ae49c4339b993c201463f73不可变。16次准备模型调用、14个浏览器动作；未发布、未复跑。

纯离线检查（0模型/0浏览器）定位两处：a6的find_elements(max_results=600)完整返回568项，适配器却将600直接送入上限300的业务ReadSpec，故缺少额外业务读取证据。该查询无执行消费者，真正导航采用a7、结果读取采用a12；原生查询与同文档证据仍在。另createHybridArtifact把现场bat_validate_selection生成的selection_function一概视为离线semantic_annotation，触发hybrid_annotation_audit_missing，掩盖后续编译缺口。证据work/human-favorites-compile-first-failure-proof.json；首次诊断脚本误从已发布plan表取未发布candidatePlan，也已保留并改为只读原job。

Product Alignment:
- natural-language task: 查找任务入口并读取授权结果；也适用于找到表单入口后填写的任务。
- reusable chain boundary: 准備中的只读发现与正式可复跑读取按真实消费者区分；模型审计按实际调用用途和事实来源区分。
- runtime inputs: 原不可变来源、动作回执、文档身份、查询/绑定/选择/重复/输出引用及模型审计。
- dynamic task outputs: 实际业务读取产生的结果；无消费者的发现查询不成为业务输出。
- generic platform capability used: 原native_dom_lookup_observation、consumed_query_ids/覆盖审计、现有事实摘要与模型调用审计。
- replay model calls: 0，显式llm节点除外。
- site/task-specific code added: no

Reuse Assessment:
- capability: 对已有来源做依赖检查并分类为准备发现或执行读取；核对现场选择与离线注解的审计归属。
- existing implementation in repository: 原生DOM查询、native_dom_lookup_observation、消费引用与覆盖审计、selection_function及bat_validate_selection固定工具。
- mature candidates and pinned versions: 继续复用browser-use 0.13.8原生查询、现有编译器与Zod/Pydantic合同；不新增调度、查询或模型框架。
- selected implementation: 扩展现有分类与独立TS守卫；只接受原生只读回执、同文档前后证明完整且无任何执行消费者的发现查询。现场选择必须绑定实际bat_validate_selection及已完成Agent调用；真正离线注解仍须semantic_annotation审计。
- reused public surface: 既有query事实、固定工具回执、自然来源和模型审计schema。
- B-A-T-owned adapter and remaining gap: 修复平台独有的来源到IR分类及审计匹配；不补造a6缺失的verified_natural_read，不扩大300项读取上限，不改历史来源。
- license/runtime/platform fit: 无新增库或平台要求。
- browser/runtime/state ownership conflicts: 全部在原不可变来源上离线执行，不启动Browser、不读Profile、不追加模型调用。
- replay model calls: 0。
- rejected candidates and evidence: 重新访问网站补a6既浪费且不属于原时点；直接删除缺口、只信Python标记或放宽被消费读取的证据均不采用。
- focused validation: 待实施；原真实来源、被消费查询/身份或回执缺证拒绝、现场选择与离线注解审计区分。原首败和原sourceGaps永久保留，修复后编译结论另存。

阶段证据（尚非主线验收）：Python分类22项通过，原来源SHA acf6b7aecd6bc44ba57b5a51415957c10e30e85320168d8364092c208a46f5bd不变，新离线编译gaps为空；work/query-discovery-offline-proof.json。现场选择审计12项通过，缺工具回执、变更函数、缺Agent调用和真正离线注解仍拒绝；work/selection-provenance-audit-proof.json。嵌套原生回执复用原始JSON词法摘要，4项通过；首次探针手工拼接JSON错误发生在生产入口之前，已保留，改用原生JSON.rawJSON构建；work/nested-native-receipt-digest-proof.json。API整合与真实工作台后续门仍未通过。

独立依赖审查：natural_output.py:153-167要求verified_natural_read及保留的读取segment；natural_result_binding.py:32-68和202-228只派生已有输出/segment绑定；summary_compile.py:88-114要求verified read及先前读取segment；natural_repeat_evidence.py:42-47、109-118及natural_read_liveness.py:21-24约束循环继续读取。当前不存在从裸dom_query.total或原生文本直接进入执行结果/条件的路径，审查撤回仅因枚举字段不全而提出的疑点。审计粒度仍为原job/source的用途记账，没有新增逐模型响应到action的签名机制。

复用两份既有真实普通复跑成功来源作交叉检查：按钮55条、滚动62条各一次离线重编译，segments、controlGraph、outputAssembly、resultBinding、resultBranches、repeatMethods、coverage逐项deepEqual且gaps为空。0模型、0浏览器，不改源；work/discovery-existing-source-crosscheck.json。这不替代新的UI编译、验证、发布和普通复跑。

整合验证：独立TS来源/回执/消费/覆盖/同文档拒绝18项通过，work/query-discovery-ts-proof.json；真实createHybridArtifact通过并形成9节点，原sourceGaps保留，work/human-artifact-integration-proof.json。API包检查首败为新增内部查找返回值影响public assertFact类型，恢复void合同后重查通过。测试探针自身两处首败也写入各proof。未新增tests文件，未运行根级/全量测试；此阶段没有模型或浏览器调用。

## 2026-09-27 首次真实草稿试跑：动作结果页面与样本 URL 边界

真实UI“只重新编译已保存试做”产生job0446ec2b-672c-4903-8d3e-51b0669c73e6，离线编译模型0、形成草稿并自动开始sample。execution579615ce-4c4c-4e31-8a51-9f6f2a5bb539/run e220d9c0-2913-41c7-817a-4cb828843094在s-a-0009失败，错误ordinary_postcondition_failed_read_fields_target_scope_mismatch；模型0，清理confirmed。前序读取及选择已完成。原始首败见work/human-sample-first-failure-proof.json。

确定事实：编译后的read_fields transition scope固定了试做时包含动态query的完整后态URL；本次实际选中入口href没有query。失败时终态浏览器观察未持久化，最终URL仍未证实，不能把推断写成已观测事实。通用边界缺口是参数化点击之后的读取仍以样本URL充当本次运行约束。

Product Alignment:
- natural-language task: 打开动态选择的入口并读取内容；点击查询/提交控件后读取结果。
- reusable chain boundary: 已证明导航的动作及其紧邻消费者读取共享本次动作结果页面。
- runtime inputs: 当前运行已解析目标、派发前tab、本次唯一新增tab或原tab、实时document与URL。
- dynamic task outputs: 本次页面的合同内读取结果。
- generic platform capability used: 原native navigation归属、Browser-Use公开Page接口、既有ConsumerReadiness与StepVerifier。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 导航后消费者读取绑定动作实际结果，保留固定目的地与文档一致性约束。
- existing implementation in repository: OrdinaryCapability.execute_checked、navigation.py唯一新tab收敛、TargetResolver、read_fields及有界StepVerifier。
- mature candidates and pinned versions: 已固定browser-use 0.13.8公开Page/BrowserSession、workflow-use StepVerifier、tenacity既有边界。
- selected implementation: 在现有适配层修正来源到本次动作结果的绑定，不新增浏览器/等待/调度实现。
- reused public surface: get_current_page/get_target_info/get_url、既有document身份、on_SwitchTabEvent及现有有界核验。
- B-A-T-owned adapter and remaining gap: 明确动态导航消费者与固定URL条件的区别；同一轮读取统一tab/document/URL，跨轮身份变化清除稳定候选。
- license/runtime/platform fit: 沿用固定依赖与Windows运行环境，无新库。
- browser/runtime/state ownership conflicts: 无新tab时只能接纳原tab，有新tab时只能接纳本动作唯一新增tab；不得跟随人工切入的其他已有tab。
- replay model calls: 0。
- rejected candidates and evidence: 删除URL检查、去掉query或写站点专用规则均不能证明动作归属，不采用；重新探索来源不能修复每次运行的动态参数变化。
- focused validation: 实施前记录；需覆盖动态同tab/新tab、固定URL不放宽、已有无关tab切换拒绝、跨文档稳定候选重置与实际草稿试跑。当前仍未验收。

设计审查决定：不新增公开marker，不修改已保存IR/source。既有_runtime_read_scope已按运行时URL binding实例化样本scope；本次在单次execute_checked内部增加另一种受限实例化：仅click/send_keys、url/url_digest.changed=true、恰一条完整read_fields.transition，且没有任何URL equals/bindingArgument。消费者引用/读取配方/样本scope及导航前后URL另在TS物化入口用既有verified read、URL fact和来源边界证明独立核验。runtime仅临时绑定本动作结果page，跨轮身份变化清稳定候选；后续正式read节点仍执行原配方与本次页面守卫。B-A-T新增部分只负责来源到IR和执行结果归属适配。

实施验证：Python原12项受控生产入口通过，root复核补双transition一残缺边界后仅追加该负例通过；work/action-result-scope-python-proof.json保留首次环境路径错误及reviewFinding。TS原真实factory通过、4类篡改拒绝；按钮/滚动旧产物不适用新分支，未重编译，work/consumer-readiness-source-proof.json。API check两次类型首败修正后通过。实际浏览器重试另记，以上不算主线通过。

## 2026-09-27 用户反馈反自动化后的环境核对

用户报告此前browser-skill复用日常Chrome、慢速读取京东评论可用，而本次遇到反自动化拦截。停止本站自动重试，不据此改选择器或绕过拦截。

已核实差异：hybrid-runtime.ts:72固定使用产品data目录下browser-profile/default，并非用户日常Chrome Profile；managed_window.py:322自行启动已安装Chrome，参数包含remote-debugging-port=0。MDN Navigator.webdriver文档明确Chrome在此参数为0时暴露webdriver=true（https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver）。此处为代码与浏览器文档依据，未在已关闭的失败窗口补测JS，也不能据此证明京东具体风控规则。

SQLite证据：sample d52195cb于15:15:28Z启动、verification5dc18463于15:18:12Z启动、正式643dabd5于15:21:28Z启动，三次pacing.nodeDelayMs均0。正式browser.headless=false；草稿没有显式browser字段，不能未经核实便称草稿headless。草稿走owned_browser/BrowserProfile启动，正式走ManagedWindow/CDP接管；验证与正式环境不一致是确定的验证缺口。Profile、启动信号和访问节奏均为合理调查方向；具体拦截规则与各因素权重未知，不把推断写成结论。本次仅核对和记录，没有修改指纹参数、接管日常Chrome或增加站点绕过逻辑。

## 2026-09-30 checkpoint 后最小性与性能修复

Product Alignment:
- natural-language task: 同任务查看浏览器读取或表单提交的真实进度、输入和成果，再携带原结果返回需求对话。
- reusable chain boundary: 原不可变版本、单 execution/run 事实；通知只是失效序号，不是另一份执行图。
- runtime inputs: 已有 workspace sequence、运行事件、值绑定和冻结输出合同。
- dynamic task outputs: 已保存运行成果和用户原话；不编造历史或循环分母。
- generic platform capability used: 原 SQLite 序列、原生事件/HTTP 流、React 引用复用、既有脱敏记录。
- replay model calls: 0；不新增模型字段或调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 消除空闲工作区轮询并有界合并失效通知，减少重复渲染/审计数据。
- existing implementation in repository: v18 taskWorkspaceSequences 触发器、唯一持锁 ProductStore、既有 NDJSON 访谈流/增量事件游标、React Flow/Dagre、node execution 脱敏。
- mature candidates and pinned versions: better-sqlite3 12.10.0 public function、SQLite TEMP trigger、Node 原生 events.once/Readable、React 19.1.1、React Flow 12.11.6；均复用已安装能力，无新依赖。
- selected implementation: 同连接 TEMP trigger 唤醒，microtask 后读已提交权威序号；每订阅仅一个 once，慢消费者恢复直接读最新；客户端先消费工作区/完整事件/必要详情，再确认序号。
- reused public surface: https://www.sqlite.org/lang_createtrigger.html （TEMP trigger 连接作用域）；https://github.com/WiseLibs/better-sqlite3/blob/v12.10.0/docs/api.md （function）；https://nodejs.org/api/events.html#eventsonemitter-eventname-options （on 默认无界且背压需 pause/resume）。
- B-A-T-owned adapter and remaining gap: 已有持久版本到失效通知的薄适配；不保存通知队列，不增加调度/检查点/模型协议。静态 chain/batch 缓存必须由消费入口维持不可变引用。
- license/runtime/platform fit: 现有依赖和 Node 运行时，无新增库/操作系统绑定。
- browser/runtime/state ownership conflicts: 不控制浏览器、不启停用户 Chrome、不改永久数据库 schema；store 关闭先 abort 订阅。
- replay model calls: 0。
- rejected candidates and evidence: 增大 800ms 间隔仍空闲轮询；events.on 缓冲慢消费者时无界，独立 review 和红测试确认，改 native once；第二份失效持久队列或 scheduler 没有必要。
- focused validation: 已复现纯 rollback、提交后 rollback、慢消费积压和关闭后观察；once 修复后 4/4。前端接线和 HTTP 生命周期待定点验证；不以旧浏览器成功验收新代码。

设计补充（实施前）：反馈只持久化自身选择和结果摘要，task/execution/需求/版本引用从不可变父 execution 投影，兼容旧记录而不改历史；重连必须读尽原事件分页后再推进捕获的 workspace 版本。需求对话携带受控摘要，不增加 LLM 必填字段。


2026-10-01 设计/验证闭环：独立 review 拒绝事件队列、关闭后迭代、分页遗漏、晚回执清空、历史录制值洗白及最后 started 回退旧 finished；均以具体反例修正。来源检查收窄只读节点/事件依赖并导出 safeRecordedOutput，运行与历史摘要共用当前政策，不加模型或持久标记。反馈持久化严格接受自身两字段或旧完整 context，完整回执从不可变父记录派生；已有反馈恢复不重查旧 run、不改原摘要。产品 LLM 调用及模型必填字段新增均为 0；safeCallSummary 自身没有模型调用，只给既有用户发起的需求回流提供已保存安全数据。相关临时真实 HTTP、异步合并、隐私/幂等反例与所属类型检查通过；边界和首败详见 PROGRESS 最新节。

## 2026-10-04 循环/分支定稿 UI 的复用与接入

Product Alignment、Reuse Assessment 和验证门详见 [CHAIN_CONTROL_UI_INTEGRATION_20261004.md](CHAIN_CONTROL_UI_INTEGRATION_20261004.md)。复用现有 React Flow 12.11.6、Dagre 3.1.1、lucide-react 0.544.0 和统一主题 token；没有新图框架、模型 judge、浏览器控制或 scheduler。声明 body 关系提取到 contracts 的只读图关系工具，准备/发布分组与当前轮事实隔离共用它。自然生成 repeat 真实 IR 的主节点归属缺口已经验证修正；通用业务 if/else 证据生成的未完成范围不与本轮 UI 接线混为同一结论。

## 2026-10-04 账号 closed 与原生 handoff 分裂

复用原 AttachedWindow、CDPClient、AccountWindows/AccountReuse、releasedOwners 与 per-owner 归档。源码和持久证据确认：inspect 返回无目标却不更新收据，宿主保存 closed 后再也不处理，任务许可只包含历史任务交付 owner。修正原适配，增加当前同身份 closed 维护许可，不复制调度/驱动/租约系统。Product Alignment、Reuse Assessment、首败与真实 headless 验收见 REPLAY_ACCOUNT_LEASE_REPAIR_20261004.md。

## 2026-10-05 起止节点统一与单条两行省略

检查 Dify 官方公共节点、start/end 实际源码：共享标题区，没有变量/输出则不渲染空主体。保留已验证 React Flow/Dagre/Radix 与主题 token；用现有节点组合和原生 CSS 两行省略。实际 96px 空白来自结果样式重复覆盖，且与 48px 图模型不一致；统一到 54px 标题卡片，原节点检查器保留完整信息。设计门、源码引用、首败和最小 headless 验收见 [NODE_UI_COMPACT_20261005.md](NODE_UI_COMPACT_20261005.md)。

## 2026-10-05 单行与类型图标（后续要求）

用户将两行改为一行，并要求类型直接可见。复用已有 actionPresentation、真实 kind/能力引用、lucide 图标与主题；固定左侧类型图标，右侧运行状态，取消循环文字 tag。跨主节点分支目标从原图补取类型，缺失来源不猜类型。复用门、首次遗漏与修正后的 headless 验证见 [NODE_TYPE_ICONS_20261005.md](NODE_TYPE_ICONS_20261005.md)。

## 2026-10-05 并行浏览器最小复用门

- [开发方案](PARALLEL_BROWSER_LIFECYCLE_20261005.md) 记录 Product Alignment/Reuse Assessment。沿用 browser-use 0.13.8、cdp-use 1.4.5、受管 Playwright extension v2、ws 和 LangGraph；不另建浏览器控制器、Agent loop、图调度或检查点库。
- 实际阻塞来自 TaskChainService 的全局队列与历史门、TaskConnection 单父连接、relay 单客户端和 AttachedWindow 公共收据；只放开 UI 不构成并行。B-A-T 适配只处理 owner→独立 runner/Profile/目标及持久执行事实。
- 查看固定 SDK 明确源码 storage_state_watchdog.py：原 LoadStorageStateEvent 支持内存状态、会话 Cookie 归一化与按 origin 的 localStorage init script。沿该原事件导入新的私有 Profile，保存目录已验证的范围，不复制个人 Profile、不实现第二 Cookie vault；真实合成状态样本通过。日常 Chrome 继续禁止全局存储导入/导出/同步。
- 专属原生双会话与独立关闭通过，日常 relay 的实际 WS/BrowserModel 多客户端隔离通过；个人 Chrome 与真实网站任务完整验收另列未测。两项 Windows/POSIX 权限基线失败、首败与修正均保留，无全量测试或用户服务重启。

## 2026-10-05 主流程合同交接复用门
见 [修复文档](MAINLINE_CONTRACT_REPAIR_20261005.md) 的 Product Alignment、Reuse Assessment。复用 ReadSpec、TaskPlan each、QuickJS、现有 source/compiler/materializer 与 LangGraph；不新建浏览器控制或 Agent loop。


## 2026-10-05 主流程合同修复最终记录

2026-10-05 05:16 CST：修复代码及定点、真实受控生成/发布/正式复跑验证完成，对抗复审限定范围未发现成立阻断。原京东任务仍失败：排序与前五集合读取已通过；详情继承的生产者字段保证传播未闭合，并记录两次 ai_structured_output_invalid，未发布不完整来源。资源 cleanup=confirmed、lease=ended。完整通过、首败、未测与下一步合同修复见 [结果报告](MAINLINE_CONTRACT_REPAIR_RESULT_20261005.md)。按用户明确指令保存原因后关机；没有认定原业务全部解决。


## 2026-10-05 任务主流程、范围采集与交付整改

当前实施依据为 [WORKFLOW_AND_DELIVERY_REBUILD_20261005.md](WORKFLOW_AND_DELIVERY_REBUILD_20261005.md)：自然语言确认业务目标和交付，原生 B-U 探索动作、范围、分支和重复方法，按需整体采集页面/区域，通过成熟组件完成内容取得和转换，B-A-T 负责绑定、持久化与复跑。数据清洗及其处理节点不在本轮实施范围。旧逐字段继承整改只保留历史证据，不再作为新任务主路径。当前只修改文档，原京东未完成状态保留。

## 2026-10-05 页面/区域采集直接复用

确认后 P0 实测更新：B-U 0.13.8 Element.evaluate 的公开调用以 `this` 取得当前区域；convert_html_to_markdown 返回 Markdown/字符数/图片信息三元组；现有受控 CDP Page.getResourceTree/getResourceContent 可取得已加载 img 的原字节。Windows 最小展开样本和两个输入的普通读取回归已通过，未安装 Crawl4AI，未增加下载器或第二浏览器。选定当前 B-U/CDP/markdownify 适配面；缓存、范围/图片缺失保留失败，不降级为“完整”。真实生产入口的三条 sample、两条 verification、发布及两条正式复跑通过，普通节点 0 模型。首次失败和限制见 [实施记录](WORKFLOW_AND_DELIVERY_IMPLEMENTATION_20261005.md)。

调研范围：已锁定依赖、相邻 domain-analysis 的实际内容保存源码、B-U 0.13.8 与 Crawl4AI v0.9.4 的官方源码。只读源码核查已完成，未安装 Crawl4AI，未控制用户浏览器，未执行真实原图采集或正式复跑。GitHub REST 版本查询受到限流后通过官方 release/tag 源码核验候选版本，不将查询失败当成产品阻塞。

| 候选及事实 | 已核验的能力 | 接入决定及限制 |
| --- | --- | --- |
| 已锁定 browser-use 0.13.8 / markdownify 1.2.2 | HTMLSerializer.serialize 序列化传入 DOM；extract_clean_markdown 从现有会话/DOM 服务取得内容；convert_html_to_markdown 调用成熟 markdownify，内容转换不需要 LLM | 首选已有组件；browser_session 路径可能直接取缓存，须使用既有观察/DOM API 确认内容晚于最后一次加载变化。序列化不等同原始 HTML/原图归档；区域及附件接线仍需验证，不能另写转换器或缓存框架 |
| B-U 原生 extract | 先取得 Markdown，再进行模型语义提取；output_schema 可选，图像选项保留 src URL；有长内容分块 | 完整工具仅用于首次探索并审计，不能直接物化为复跑 llm；正式语义步骤消费普通节点已取得输入，沿既有显式 llm 的固定 prompt/单次调用约束。恢复工具不等于范围/原图闭环完成 |
| Crawl4AI v0.9.4 | LXMLWebScrapingStrategy.scrap(url, html) 接受已有 HTML；DefaultMarkdownGenerator.generate_markdown(input_html) 接受内容；css_selector/target_elements 提供范围选择及内容派生 | B-U 公开接口有具体局部缺口时直接复用这些 API；不创建第二个 AsyncWebCrawler 浏览器重访已登录页面。候选接入尚未冻结，需一个 Windows 最小样本及原图证明 |
| 相邻 domain-analysis | publicWebResourceContent.captureEvent 按响应保存完整 HTML 或附件原字节；zolCatalogGalleryProvider.downloadImage 取得真实图片响应并沿同一快照/附件事实保存 | 参考原始内容及资源关联的边界；不搬网站 Provider、站点字段、内容词表、HTTP 调度或数据库进本平台。该代码及历史运行不证明 B-A-T 通用 AI 范围采集已实现 |

源码核验发现：B-U HTMLSerializer 会过滤非内容标签及 data:image，Markdown 与链接不能替代原始区域/原图保存；extract_clean_markdown(browser_session=...) 缓存非空时不会主动刷新，不能据此保证展开/切页/SPA 变化后的当前内容。采集前用既有 B-U 观察/DOM API 取得最后一次变化之后的内容并核验 owner、target/document 和范围，新鲜度缺口阻止发布，身份/可靠来源失配按硬边界停止。Crawl4AI 的 target_elements 主要限定内容生成，媒体/链接仍可能来自整页，不能当成区域附件边界；css_selector 的无匹配分支可能回退全页，宿主须以既有定位证据确认命中。派生内容的长度过滤、图像评分和 cleaned/fit 策略不能丢掉原始任务内容。辅助网络请求、真实懒加载与图片字节取得在最小样本核验，不能仅根据签名承诺无副作用。

Reuse Assessment:
- capability: 从当前受控页面/区域取得原始内容与所需附件，形成普通节点可复跑的方法。
- existing implementation in repository: browser-use 0.13.8、markdownify 1.2.2、workflow-use 适配、Artifact/来源引用、值绑定及 LangGraph。
- mature candidates and pinned versions: 现有 browser-use 0.13.8/markdownify 1.2.2；补充候选 Crawl4AI v0.9.4（未安装或冻结接入）。
- selected implementation: 优先直接复用 B-U 与已有内容转换接口；若有可证实局部缺口，采用 Crawl4AI 公开 HTML 输入 API 补足。
- reused public surface: HTMLSerializer.serialize、extract_clean_markdown/convert_html_to_markdown、原生 Tools/回调；候选 LXMLWebScrapingStrategy.scrap 和 DefaultMarkdownGenerator.generate_markdown。
- B-A-T-owned adapter and remaining gap: 任务范围到现有定位/采集 API 的绑定、文档身份、产物落库、附件来源与覆盖、编译和正式复跑；不是重写解析、下载或浏览器框架。
- license/runtime/platform fit: B-U 0.13.8 为 MIT；Crawl4AI v0.9.4 要求 Python >=3.10，LICENSE 含 Apache-2.0 和额外署名要求，采用时保留其要求的 NOTICE/署名。现有 Python 桥在 Windows 运行，新增范围/附件调用仍未验收。
- browser/runtime/state ownership conflicts: 只使用本次 execution 的浏览器、owner 和 target；Crawl4AI 如被采用只接收该会话已取得内容，不能另接个人 CDP、导出 Cookie/Profile 或建立竞争控制器。
- replay model calls: 普通内容采集/格式转换 0；完整原生 extract 仅用于首次探索，不直接编成复跑 llm。已确认语义步骤由普通观察先取得一个输入，再调用现有显式 llm，prompt 随版本冻结、单次模型调用、类型化结果，不持有 Browser/Tools/文件系统；本轮不自动补语义或清洗节点。
- rejected candidates and evidence: 尚未否决成熟候选；缺少局部能力优先扩展/适配现有组件。采用额外组件要记录已有 API 不能覆盖的具体不变量；不得以便利或可控性为理由手写同等能力。
- focused validation: 在原执行会话取得一份含文本/表格/图片的真实区域，包含一次展开/内容变更后核验当前观察、范围、原文及原图落盘，再以另一输入证明同一方法可复跑。仅用所改边界的定点验证；真实原京东和纯操作闭环按主文档阶段分别记录。纯编译修复消费已保存原来源，不自动重开浏览器或重派动作。

官方依据：[B-U 0.13.8 内容转换](https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/dom/markdown_extractor.py)、[DOM 序列化](https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/dom/serializer/html_serializer.py)、[extract](https://github.com/browser-use/browser-use/blob/0.13.8/browser_use/tools/service.py)、[MIT](https://github.com/browser-use/browser-use/blob/0.13.8/LICENSE)；[Crawl4AI v0.9.4 发布](https://github.com/unclecode/crawl4ai/releases/tag/v0.9.4)、[HTML 输入采集](https://github.com/unclecode/crawl4ai/blob/v0.9.4/crawl4ai/content_scraping_strategy.py)、[内容转换](https://github.com/unclecode/crawl4ai/blob/v0.9.4/crawl4ai/markdown_generation_strategy.py)、[运行依赖](https://github.com/unclecode/crawl4ai/blob/v0.9.4/pyproject.toml)、[许可证](https://github.com/unclecode/crawl4ai/blob/v0.9.4/LICENSE)、[范围选择说明](https://docs.crawl4ai.com/core/content-selection/)。版本源码与最小行为证据一起决定接法，不把 README 或 API 存在当成真实闭环通过。
## 2026-10-05 对抗审查后的 CSS 资源适配

Reuse Assessment:
- capability: 保存已选 DOM 范围中的 CSS background-image 与伪元素背景原图，不能遗漏后标记完整。
- existing implementation in repository: B-U Element.evaluate 取得当前 CSSOM；Chrome Page.getResourceTree/getResourceContent 已取得加载资源。缺少 CSS 值的规范解析。
- mature candidates and pinned versions: tinycss2 1.4.0 / webencodings 0.5.1；已有 Crawl4AI 方案不能替代本次实际浏览器会话的 CSSOM 与资源事实。
- selected implementation: tinycss2；固定版本加入现有受管 Python 安装与版本核验，不改 B-U frozen lock。
- reused public surface: parse_component_value_list；URLToken / FunctionBlock 的公开 AST 属性。原字节继续由已有 CDP 连接取得，不重写 CSS parser 或下载器。
- B-A-T-owned adapter and remaining gap: 将当前计算背景 URL 对应到本会话资源及 Archive。image-set、paint、element 等不能证明实际图像时返回 content_css_resource_unproven；iframe/canvas/open shadow 同样明确拒绝，未声称任意页面媒体完整。
- license/runtime/platform fit: 官方 [1.4.0 源码与许可证](https://github.com/Kozea/tinycss2/tree/v1.4.0)，BSD；纯 Python。已在当前 Windows / Python 3.12 环境验证公开解析 API 与 Chrome 原图字节。
- browser/runtime/state ownership conflicts: 无第二浏览器、下载会话或状态存储；只适配既有 owner 的原始内容 Archive 与 Artifact。
- replay model calls: 0；普通读取节点调用原解析及 CDP API。
- rejected candidates and evidence: 自写 regex 不能正确处理带括号/转义的 CSS URL，未采用；另接 crawler 无法证明当前已展开页面的相同文档与加载资源，不采用。
- focused validation: 引号及括号 URL 解析、无法证明的变体拒绝；真实区域的 img 与 CSS 原始 PNG 字节一起归档，8MB 原图不进入模型回传；同 URL 重载真实拒绝。最初根参数验证暴露 TS/Python ReadSpec 仍只允许对象，边界一起修复并仅复测失败项。

官方 [公开 API 文档](https://doc.courtbouillon.org/tinycss2/stable/api_reference.html) 用于核验 API；实际固定版本与运行行为以 1.4.0 及本次测试为准。
## 2026-10-05 真实访谈的 Pi/Codex 文本事实适配

Reuse Assessment:
- capability: 将原生 Agent 结果与工作台可见正文一致交接，避免已完成草稿被桥接层错误拒绝。
- existing implementation in repository: @agent-platform/pi-agent-session 0.1.0-2c522ec8 的公开 createPiAgentSessionAdapter / createPiAgentSessionAIEventBridge。
- mature candidates and pinned versions: 当前固定 2c522ec8 与仓库另存 65f7aeff 包。直接读取两个 vendored tgz 的 dist/js/index.js，均在 partial commentary phase 尚缺失时可能流出该文本，message.ended 又过滤该 phase；bridge.settle 要求原始 delta 是 result.outputText 的前缀。
- selected implementation: 保留当前成熟包，新增 B-A-T 展示适配 completedMessageEvents；不改相邻项目或包内原生 Agent loop。
- reused public surface: assistant.message.ended 的正文事实与 bridge.onRuntimeEvent / settle；start、工具、推理与结果事件实时传递。结束正文通过原桥接校验，普通业务节点不调用模型。
- B-A-T-owned adapter and remaining gap: partial token 不直接投影正文；消息结束才展示其确定正文。即时 busy 和工具进度仍保留；暂不提供逐 token 正文预览，避免未确定 phase 污染可确认文本。
- license/runtime/platform fit: 沿用既有 package 与 Windows/Node 运行时，不引入/替换关键依赖。
- browser/runtime/state ownership conflicts: 无浏览器控制、流程重跑或模型设置改选；原生运行与事件保留，失败轮次不改写。
- replay model calls: 0；适配只用于现有需求访谈/探索模型用途，没有新增模型交互。
- rejected candidates and evidence: 单纯升级到本仓已有 65f7aeff 不改变该路径；拼接 raw delta 并覆盖最终结果会把 commentary 当成接受事实，不采用。
- focused validation: 现场 task 2aaa0674-ce91-462a-bce4-c21502ce755c 原始事件证明同一 message streamed=1383、ended=1321，差异为前置 commentary；保存的模型最终结果正常 stop。公开 bridge 定点测试覆盖 commentary 过滤、多轮工具消息正文和完成交接，通过。
## 2026-10-05 点击后真实入口读取

Reuse Assessment:
- capability: 读取实际导航后的当前文档 URL，不依赖列表 href，也不生成业务链接。
- existing implementation in repository: B-U 原生 click/navigation、Element.evaluate、ReadSpec、sample_read_fields 与文档身份核验；既有循环编译及 LangGraph。
- mature candidates and pinned versions: 已固定 browser-use 0.13.8、workflow-use vendored baseline 5d2d19fe8835cc86f1bf3e04302a5000d590f249；标准 DOM Document.URL。
- selected implementation: 沿已选 B-U 公开 Element.evaluate 读取 ownerDocument.URL。
- reused public surface: Element.evaluate 的受宿主固定投影；原有 CSS 容器查询、采样、输入输出合同及原生导航。
- B-A-T-owned adapter and remaining gap: 增加一项固定 valueSource 映射与 TS/Python 合同校验，不重写原生导航或循环；无稳定进入/返回循环时继续明确编译缺口。
- license/runtime/platform fit: 沿当前已选 MIT/Apache 组件及 Windows 运行时；不增加依赖。
- browser/runtime/state ownership conflicts: 只读本运行已拥有的文档；保留读取前后页面身份检查及不可变来源事实；不访问其它用户窗口。
- replay model calls: 0，原生探索调用单独审计。
- rejected candidates and evidence: 从商品编号拼 URL 不能证明真实入口；另建 Playwright/HTTP 浏览器会话会破坏现有所有权，均不采用。
- focused validation: Windows 真实无 href 控件点击后获取真实页面URL，原生方法/readRef两页普通读取1项通过（第二页为page.goto）；TS新字段边界1项通过。对抗找到来源交接白名单缺口S2，canonical→代表输出→实际普通节点用例首次失败，补齐后1项通过，API check通过。完整来源循环及京东业务仍未通过。

标准 DOM 事实核验：[Document.URL](https://developer.mozilla.org/en-US/docs/Web/API/Document/URL) 返回当前文档地址字符串；适配不解析、生成或猜测业务路由。

## 2026-10-05 无 AX 控件与在线编译覆盖

Reuse Assessment:
- capability: 无 AX 名称控件的确定目标身份、缺口后的在线节点覆盖投影。
- existing implementation in repository: HistoryTargetIdentity / fixedTargetAuthority、在线 prefix 和 coverage、既有 React Flow / Radix / Zod。
- mature candidates and pinned versions: 现有 browser-use 0.13.8；不新增或替换库。
- selected implementation: 原生 EnhancedDOMTreeNode.get_all_children_text 与 DOMInteractedElement 身份，既有校验后的编译覆盖/节点物化。
- reused public surface: 现场通过 inspect.getsource 核验 get_all_children_text 遍历原生 TEXT_NODE，返回当前目标的完整子文本；load_from_enhanced_dom_tree 只读取 AX 名称，不含目标子文本。复用原生 helper，不复制 DOM 文本解析器或 Agent loop。
- B-A-T-owned adapter and remaining gap: 只把需求已明确、当前唯一的短目标名字绑定为可复跑身份摘要；同源编译覆盖用于产品进度。动态业务项仍需要真实输入/读取和选择证明；旧来源没有名字摘要时不可补造。
- license/runtime/platform fit: 沿既有 MIT 组件、Python 3.12 和 Windows 已固定运行环境。
- browser/runtime/state ownership conflicts: 仅访问本次已拥有的原生快照；在线快照无运行/发布权限，保留来源及清理边界。
- replay model calls: 0；不为固定控件或进度调用模型。
- rejected candidates and evidence: 放宽所有重复条目为固定 XPath 会把样本条目写死；只删 prefix 缺口过滤而跳过依赖闭合会产生无来源绑定；均不采用。
- focused validation: 无 AX 控件的真实原生 DOM 重定位、唯一性及错误目标拒绝；prefix 在缺口之后保留独立合法读取并展示具体缺口。实施前记录，结果随后回填。

### 2026-10-05 普通动作上下文及原生返回交接

Reuse Assessment:
- capability: 新页进入后返回先前页、先前真实 URL 的运行时值绑定；避免导航页的 incidental autoplay 改写动作合同。
- existing implementation in repository: BrowserSession/Tools native switch、runner browser receipt、ValueBinding、OrdinaryCapability、StepVerifier、prefix 物化。
- mature candidates and pinned versions: 已安装 browser-use 0.13.8 / workflow-use 0.2.11，不引入新库。
- selected implementation: 现有原生 BrowserSession 和 Tools.switch，B-A-T 只适配上下文输出和编译证据。
- reused public surface: 已定点核验 Tools.switch 调 get_target_id_from_tab_id 与 SwitchTabEvent；原生 tab_id 为四位，错误分支可能只返回 attempted 文本。get_tabs 与 alias 核验先于派发，active_tab 读取原生 focus 而非信任文本。
- B-A-T-owned adapter and remaining gap: 仅在后续消费时为已编译动作补 url/tabId 输出；来源值只证明 binding，本次输出由 runner 实时 receipt 提供。普通动态条目循环仍不能从未读取的集合捏造。
- license/runtime/platform fit: 沿用受管上游、既有 Windows Python 3.12 运行环境；真实本地 Chrome headless 验证通过。
- browser/runtime/state ownership conflicts: 不新增浏览器实例共享状态；本次完整 target ID 来自当前节点输出，别名唯一核验和 active_tab 后置条件，finally 关闭测试浏览器。
- replay model calls: 0；不接管 Agent loop，不增加 judge 或模型重试。
- rejected candidates and evidence: 冻结录制四位 tab ID 会跨运行失配；以 go_back 代替 switch 对无历史新页无效；复制状态机/控制器不必要。
- focused validation: 原生 Tools + 正式 EvidenceCollector/SourceObservationScope 采集7动作；换新session 普通复跑两次新页整体区域读取并返回原来源，7段无编译缺口，0模型。保存本地临时证据，未放入Git。该证据通过 TS 生产前缀物化7节点6边与严格 runner 命令；首个 TS 白名单遗漏失败保留，统一准入定义后通过。不等于完整京东任务发布/正式运行通过。


## 2026-10-05 原生固定控件、标签页上下文及在线编译复用

Reuse Assessment:
- capability: 固定无 AX 控件、普通动作上下文输出/切页复跑、真实覆盖进度。
- existing implementation in repository: browser-use 0.13.8、workflow-use 0.2.11 受管 hybrid、Zod、现有 ValueBinding/runner receipt/StepVerifier/LangGraph。
- mature candidates and pinned versions: 当前原生 browser-use/CDP/受管 workflow-use；无需新库或第二个浏览器控制/Agent loop。
- selected implementation: 通过现有公开 API 和 B-A-T 证据适配层复用。
- reused public surface: native DOM get_all_children_text、原生 Element/Tools.act/get_tabs/get_target_id_from_tab_id；既有回调/派发回执、后置条件、编译/物化及 Zod subset/strip。
- B-A-T-owned adapter and remaining gap: 确认且唯一的固定名称权威、同源事件投影、即时状态证明与按需 ValueBinding；缺口只影响发布。动态来源及正式业务仍未整链验收。
- license/runtime/platform fit: 既有 MIT 依赖，Windows 现有 Python venv/CDP 与 TS；未替换关键能力库。
- browser/runtime/state ownership conflicts: 一个运行一个实际 session；本次原生完整 tab 转四位别名必须唯一、复跑用新 session 的真实节点输出，旧样本 ID 不作为常量。runner cleanup 与业务结果独立。
- replay model calls: 受控真实浏览器普通动作/整块内容读取验证为 0；未运行本次京东 Agent 或结尾 judge。
- rejected candidates and evidence: 无新增自研等价能力；上下文匹配仅是来源到 B-A-T IR 的适配，不扩为通用条件引擎。
- focused validation: 原生 7 动作→编译→新 session 普通复跑；真实来源 TS 7 节点/6 边；合法 navigate/switch 三节点生产前缀；迟到/假事实/假变化、文档身份 extra 及旧包只读进度边界。最终服务 UI/API 17/3/11、中断状态与持久化来源一致。

Reuse/验收结论仅覆盖上述能力，不是原京东选型冻结或动态来源业务通过。源码和首败见实施记录及对抗代码审查；最终受管摘要 091e010554ccd8eb29166c42102287322c11b007826ccb5536dee84bcb9199e3。
# 2026-10-05：点击入口的最小来源适配

Reuse Assessment:
- capability: 目录/后台条目只提供点击入口时，读取入口并复用单项链。
- existing implementation in repository: ReadSpec 双读采样、TargetResolver、OrdinaryCapability、TaskPlan each、LangGraph StateGraph。
- mature candidates and pinned versions: 已冻结 browser-use 0.13.8 / workflow-use 0.2.11 / cdp-use 1.4.5；不新增或替换库。
- selected implementation: 沿用现有版本与会话。
- reused public surface: Page.get_elements_by_css_selector、Element.evaluate/get_basic_info、Tools.switch/click；既有能力的派发与命中检查。
- B-A-T-owned adapter and remaining gap: ReadSpec 按需附入口输出、已证输入目标的编译绑定；each 编排保持已有实现。
- license/runtime/platform fit: 沿用已冻结选型及 Windows Python 3.12 环境，无新增分发依赖。
- browser/runtime/state ownership conflicts: 一个产品 execution 仍一个 owner/session；入口只引用本次来源标签，不接管其它窗口。
- replay model calls: 普通节点 0；不增加 Agent loop 或语义 judge。
- rejected candidates and evidence: 不另选控制器；原生查询及目标解析已覆盖需求，不自研浏览器控制、选择器解析或循环调度。
- focused validation: 所属跨语言边界、原 prepare_task→样本/复验→发布→完整逐项执行，以及实际原任务；结果另记 PROGRESS。
# 2026-10-05：原生入口索引的观察所有权

Reuse Assessment:
- capability: 把模型选择的原生索引绑定到它实际看见的元素，而不是后来刷新后的缓存。
- existing implementation in repository: EvidenceCollector callback、MethodReadRecords、record_projection_dom 与原生 selector_map；复用现有组件，不新增浏览器控制器。
- mature candidates and pinned versions: 已安装 B-U 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11。
- selected implementation: 原生观察/Actor + B-A-T 已有证据适配层。
- reused public surface: BrowserSession.get_browser_state_summary、get_dom_element_by_index、Page.get_elements_by_css_selector、Element.get_basic_info；核验安装的明确函数源码，索引查询仅查当前缓存。
- B-A-T-owned adapter and remaining gap: 在既有 callback 保存不可变 target/backend/url 身份，本次工具消费并验证实时来源；当前泛化错误需要固定阶段码。
- license/runtime/platform fit: 沿既有受管依赖与 Windows Python 3.12，不引入或替换库。
- browser/runtime/state ownership conflicts: 单动作、单 MethodReadRecords owner；不转移会话，不另建 Agent loop/DOM 解析器/调度器。
- replay model calls: 0。
- rejected candidates and evidence: 没有拒绝或重写原生能力；只补项目证据与编译边界。
- focused validation: 观察后缓存重建/节点对象变异仍绑定原 backend；跨页/缺失/不匹配快照必须拒绝；原真实任务的最新失败保留，具体异常阶段尚未确认。
# 2026-10-06 主链路首败整改

修复前的断点、固定上游依据与最小验证范围见 [整改记录](GITHUB_MAINLINE_REPAIR_20261006.md)。旧冻结轮次保留失败，新代码必须重新验收。

## 2026-10-06 来源跨页面输入验收与完成协议适配

固定 browser-use 0.13.8 的 Element.evaluate/HTMLAnchorElement.href、Tools.navigate 与 Tools.get_output_model 直接复用；B-A-T 只适配新旧入口 schema、来源键与已验证 readRef 的完成交接，没有新增连接框架、调度器或恢复 loop。真实双链接单标签导航、旧合同身份保护、25 项 Python入口验证、8项完成协议、API合同1项、计划投影6项通过。真实新任务冻结生成后正式运行及独立复跑均完成5项、0模型调用。当前证据限于被测任务，原图UI解码已补齐。评估、许可证、固定源码和首败见 [本轮整改](GITHUB_MAINLINE_REPAIR_20261006.md)。

## 2026-10-06 基础契约整改（当前范围）
用户要求仅独立 headless/本地样本验证底层，不运行京东或接管日常浏览器。已复用 B-U Page/Element/原生 DOM/CDP、原 Playwright owner relay、LangGraph 与 Python traceback，修正来源存活准入、数量绑定、精确选区及安全诊断；新增通用基础库为零。真实 runner 重建暴露异步缓存标题污染恢复摘要，改用原生实时标题后同 run、SQLite 重开、数量 1/3、0LLM、owned 清理验证通过。DOM 编译适配与浏览器原生查询职责、四项 review P2、全部首败与未测范围见 [基础整改记录](FOUNDATION_CONTRACT_REPAIR_20261006.md)。

## 2026-10-06 LLM 字段归属与需求来源首败

真实首败不是搜索不可用，而是重复要求模型填写已知 URL/来源身份。复用 Pi 搜索事实与公共 Authoring，宿主展开引用；同时审查活跃模型边界，删除重复方法固定路径/无消费解释、执行型固定空引用、根数组固定输出路径。真实UI首轮另外暴露起点与最终目标/访问条件混淆；第二轮收紧职责说明，并把无候选判断绑定实际调查集合。没有新增模型字段、通用解析器、Agent loop 或 judge。Product Alignment、Reuse Assessment、字段归属、旧摘要兼容及全部首败见 [整改记录](INTERVIEW_SOURCE_BINDING_20261006.md)。第二轮定点验证/复审已完成，正常UI验收仍待结算。
# 2026-10-06：需求输出的一次定向修复

Product Alignment:
- natural-language task: 任意来源检索、浏览器操作需求的对话与准备草案。
- reusable chain boundary: 需求输出准入，失败候选不进入已确认计划。
- runtime inputs: 原对话、原输出、公共解析诊断、同轮真实来源引用。
- dynamic task outputs: 原有 Question 或 Markdown 草案，无新增模型字段。
- generic platform capability used: AI Connect 注册、buffered scope、同一 parser；Pi AgentSession。
- replay model calls: 正式复跑不变；只在需求输出校验失败时额外一次同模型调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 非法需求输出的有限修复。
- existing implementation in repository: protocol.ts 已注册 directive；coordinator 缺少校验失败修复。
- mature candidates and pinned versions: 已安装 ai-connect 0.3.4、pi-agent-session 0.1.0（vendor/release 固定快照）。
- selected implementation: 保持同一 compileAuthoringProtocol / resolveAuthoringTurn / createAuthoringTurnSession；buffered repair 不安装视觉内容和搜索工具。
- reused public surface: 公共 Authoring 和 Pi adapter API。
- B-A-T-owned adapter and remaining gap: 一次领域准入修复、引用事务、原始事件与最终接受 invocation 的关联。
- license/runtime/platform fit: 不新增/替换依赖，沿用已验证 Windows TypeScript 运行时。
- browser/runtime/state ownership conflicts: 不启动浏览器，不重做搜索，不接受失败候选，不改变已确认业务。
- replay model calls: 0 个新增隐式执行调用。
- rejected candidates and evidence: 不造 XML 容错解析器，不自动补闭合标签；公共 parser 已能提供 unclosed_tag 诊断。上游 authoring-registry.ts 的 buffered scope 直接覆盖所需能力。
- focused validation: 10 项定点与 API 类型检查通过；入口编号补充样本通过；headless round-3 真实首败经一次修复后成功，UI 确认和刷新持久化通过（见 PROGRESS 最新条目）。
# 账号连接整改：owner 隔离与 Playwright 握手

Product Alignment:
- natural-language task: 任意网站的账号检查与任务准备前检查。
- reusable chain boundary: 原 owner 浏览器连接，不修改业务链。
- runtime inputs: 已持久化 owner/lease 与原生 CDP 握手。
- dynamic task outputs: 实际账号检查结果。
- generic platform capability used: Playwright connect_over_cdp；原 CDP relay owner 路由。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: Playwright 在 owner endpoint 上查询默认 target 信息。
- existing implementation in repository: 固定微软 Playwright relay；cdpOwnerScopes 是 B-A-T 隔离适配。
- mature candidates and pinned versions: vendor/daily-chrome-extension/UPSTREAM.json 固定 Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf、扩展 0.4.0。
- selected implementation: 保持原 relay/BrowserModel/Playwright，只把无 target 的只读握手绑定到本 owner 当前存活 target；重连复用原 attach 通知与 session。
- reused public surface: connect_over_cdp、new_cdp_session、Target.getTargetInfo。
- B-A-T-owned adapter and remaining gap: owner 默认读取目标解析；不放宽跨 owner 命令，不复制连接框架。
- license/runtime/platform fit: 已有 Apache-2.0 Windows TypeScript/Python 组件。
- browser/runtime/state ownership conflicts: 不接触个人浏览器；新建隔离 headless Profile 验证真实扩展与 owner 地址。
- replay model calls: 0。
- rejected candidates and evidence: 不绕过 owner scope；旧验收使用无 owner 地址，无法覆盖生产路径。
- focused validation: 修复前真实 headless 复现 connect_over_cdp 的 Target.getTargetInfo 被 daily_chrome_target_required 拒绝；证据 work/account-scoped-borrow-20261006/before/retry-daily.json。

第二处实际断点是重连缺少原 owned target 的 attached 通知，修正调用时机并只清本 owner 的通知标记。对抗审查指出历史首 target 已关闭的情况，改用原生活目标与权限集合交集后复审关闭。最终真实 headless Chrome/原扩展/owner URL 的借用、限定来源 Cookie 读取、断开后保留任务页通过；没有操作个人 Profile。账号检查中断使用既有 DomainError 与审计事实归入账号准备检查，保留账号，不交给模型修复。验证详情、首败及两项已复现的基线测试失败见 [账号连接修复记录](ACCOUNT_SCOPED_BORROW_FIX_20261006.md)。

## 2026-10-07 本地浏览器反检测与账号风险调研（未冻结选型）

### 请求、事实与证据范围

用户要求先读本机 BAT_ANTIBOT_HANDOFF_20261007_195314.md，调查主流反爬机制及反检测技术，服务于本地浏览器自动化。核心是环境、控制方式、操作路径与行为的一致性；降频和暂停重试不能代替反检测研究。

核验 checkout：master@3b8049e93c843ef72b27191e89368ad173cf912e；开始时分支领先 origin/master 10 个提交，已有大量未提交工作。本节仅追加研究记录，不改产品代码、依赖、运行配置和既有研究内容，不创建 worktree、不提交、不推送。

账号限制已由用户截图及 ACCOUNT_RESTRICTION_AND_ACCEPTANCE_20261007.md 确认。截图未披露命中的请求、执行或规则；不能推断由某个 flag、指纹、HTTP 客户端或请求频率单独导致，也不能排除自动化相关性。本轮没有访问京东、检查账号、迁移登录态、启动浏览器或重试任务。

证据等级：

- 本仓库源码及固定版本上游源码：证明实现中存在的路径，不证明事故执行命中了该路径。
- 官方文档、论文和公开 release：证明公开机制、接口、版本及作者报告；供应商通过率和不可检测宣传不是 B-A-T 验收证据。
- 本轮没有运行候选工具，没有站点通过率、账号安全性或日常浏览器对照结论。下面的优先级是架构适配判断，不是防封效果排名。

### 主要反爬检测层

| 检测层 | 可观察内容 | 对本地工具的意义 |
| --- | --- | --- |
| 网络与协议 | IP/ASN/信誉、TLS JA3/JA4、HTTP/2 参数、请求头一致性 | 本地运行仍会发出可观察请求；修改 UA 不会把 HTTPX 变成 Chrome 网络栈。 |
| 浏览器环境 | webdriver、UA/Client Hints、字体、WebGL/Canvas/Audio、语言时区、屏幕与硬件组合 | 应核验真实一致性；叠加随机伪造可能产生矛盾。单个 Canvas 值不是自动化的充分证据。 |
| 控制与注入 | 注入脚本痕迹、执行上下文、API 行为改变、特定版本的调试器副作用 | CDP、扩展、headless 的名字本身不能决定是否可检测。必须对应实际版本与调用。 |
| 输入及行为 | 指针/键盘/滚动事件、焦点、页面可见性、导航顺序、时间间隔、重复路径 | CDP 原生输入、页面 JS click、直接赋值、OS 输入是不同路径；随机 sleep 只影响其中一部分。 |
| 会话与账号关联 | Cookie 连续性、设备变化、登录/检查次数、跨请求行为、已有风险标签 | 一次页面放行不证明账号长期安全，换身份不等于修复原账号风险。 |
| 挑战与动态验证 | JS 挑战、动态令牌、设备验证、工作量证明、验证码 | 能执行 JS 不等于通过全部挑战；本项目保持登录、验证码和访问限制人工处理。 |
| 业务策略 | 数据读取范围、重复访问模式、接口上下文与站点自有规则 | 通用检测页通过不能覆盖业务风控，更不能推断京东采用某个供应商。 |

公开依据：

- [Cloudflare 检测引擎](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/)：启发式、JavaScript 检测、机器学习与会话特征；[JA3/JA4](https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/)。
- [Akamai detection methods](https://techdocs.akamai.com/cloud-security/docs/detection-methods)：请求头/版本异常、主动验证和交互行为。
- [DataDome threat detection](https://docs.datadome.co/docs/threat-detection)：签名、行为、信誉等检测；[设备特征一致性研究](https://datadome.co/threat-research/the-art-of-bot-detection-picasso-for-device-class-fingerprinting/)。
- [HUMAN Bot Defender](https://docs.humansecurity.com/applications/bot-characteristics)：流量、已知/自定义签名及交互能力；[F5 2026-09-15 公告](https://www.f5.com/company/news/press-releases/bot-defense-device-intelligence-agentic-ai-detection)：跨交互关联设备、行为与客户端完整性。公告是产品描述，不是独立效果验证。
- [Imperva](https://www.imperva.com/products/advanced-bot-protection-management/)：客户端检查、行为、连接特征与威胁情报；[Kasada 官方资料](https://www.kasada.io/wp-content/uploads/2023/05/23-05-09_-Datasheet-The-Hidden-Risks-Behind-APIs-1.pdf)：客户端属性关联与工作量证明，资料年份为 2023，不能当作 2026 的内部规则清单。
- [阿里云 WAF Bot 管理](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/bot-management/)：Client ID、JA3/JA4、JS 验证和动态令牌；[腾讯云 Bot 智能分析](https://intl.cloud.tencent.com/zh/document/product/1145/56970)：静态/动态规则与高级 Bot 分析。
- [顶象设备指纹](https://www.dingxiang-inc.com/business/fingerprint)、[数美设备指纹](https://help.ishumei.com/docs/tw/sdk/overview/)：设备与业务风险关联。厂商对唯一性、稳定性等绝对表述未经本轮独立验证。
- [瑞数 Botgate 官方旧版资料](https://www.riversecurity.com/productpage/%E3%80%902021%E3%80%91%E7%91%9E%E6%95%B0%E6%9C%BA%E5%99%A8%E4%BA%BA%E9%98%B2%E7%81%AB%E5%A2%99Botgate%EF%BC%88%E8%BD%AF%E4%BB%B6%E7%89%88%EF%BC%89.pdf)：动态封装、动态验证与代码变换；用于说明技术路线，不能用旧资料宣称当前产品细节已核验。

这里覆盖主要公开技术路线和代表产品，不声称穷尽所有商业产品、未公开规则或存在统一的最强排名。

### 候选技术与 B-A-T 适配判断

| 路线与代表 | 核心能力 | 本地/现有会话适配 | 本轮判断 |
| --- | --- | --- | --- |
| 已有日常 Chrome + 扩展/CDP | 保留真实浏览器、Profile、站点存储与网络栈 | 项目已有入口；无需迁移到另一浏览器，但控制产生的特征仍须测量 | 作为首要审计基线。已有连接并不证明反检测合格。 |
| Patchright | 修改 Playwright 驱动、执行上下文和启动参数等 | Node/Python 路线可本地运行；不是 cdp-use 的替换包 | 优先作为 Chromium 对照候选，不能声称安装即可修复 B-U。 |
| Rebrowser patches | 对 Puppeteer/Playwright 做运行时上下文等补丁 | 绑定特定驱动版本，具有调试/API 兼容影响 | 作为源码参考；本轮看到的已验证版本较旧，不直接冻结。 |
| SeleniumBase UC/CDP | UC 基于驱动修补，CDP 模式减少 WebDriver 依赖，并提供 GUI 操作 | 可本地；可能自有浏览器启动、Profile 和控制生命周期 | 作为独立 Chromium 对照候选，必须解决 owner/lease 衔接。 |
| nodriver / Zendriver | Python 直接 CDP 控制，避开 Selenium/ChromeDriver 路径 | 可本地；默认临时 Profile、退出清理等行为必须核查 | B-U 已经直接 CDP，换同类控制器不自动带来同等收益。 |
| Camoufox + BrowserForge | Firefox 定制、指纹配置与一致性生成 | 有 Windows 构建；不是日常 Chrome 的原 Profile，也不是现有 CDP 适配器的直接替换 | 可作为另选专属浏览器的后续实验，当前不替换 daily 路线。 |
| Puppeteer-extra stealth / Playwright stealth 类 | 注入或修补 navigator、WebGL 等 JS 暴露面 | 作用于相应驱动和页面上下文 | 有用的局部补丁路线；不默认全量叠加，也不是 TLS/账号风控解决方案。 |
| Apify fingerprint-suite / BrowserForge | 生成相互关联的指纹参数，部分工具提供注入 | 适合需要合成会话的专属环境 | 真实日常身份优先保留原值；随机化并非本项目默认需求。 |
| curl_cffi / curl-impersonate / TLS client 类 | 模拟部分浏览器 TLS/HTTP 协议特征 | 本地 HTTP 客户端；不提供真实 DOM、输入行为和完整浏览器会话 | 仅限明确需要独立 HTTP 请求的分支候选；不能拿来代替浏览器一致性。 |
| Crawlee | 采集队列、会话池、指纹集成、代理与重试 | 自有采集生命周期 | 复用评估时需避免与 LangGraph、B-A-T run/checkpoint/owner 重叠。自动换身份重试不适合作为个人登录账号的默认处理。 |
| DrissionPage / Botasaurus | 浏览器操作、HTTP 路径或采集工作流封装 | 可以本地，仍须逐条核查请求与操作路径 | API 易用性与网页成功示例不等于反检测最强；不因名称或宣传替换现有控制栈。 |
| OS 输入 / RPA | 从系统输入流发送键盘和鼠标，绕开部分页面 JS 合成事件 | Windows 可通过成熟工具使用 SendInput 等；通常涉及桌面焦点、分辨率与用户操作冲突 | 仅在测得具体输入差异且现有组件不能解决时评估；不作为透明后台操作的默认方案。 |
| Multilogin / AdsPower 等指纹浏览器 | 多 Profile、独立身份配置、自动化接口，部分支持本地资料 | 本地存储不等于原 Chrome 身份或所有元数据完全离线 | 多身份管理价值与本项目单一真实账号需求不同，不默认导入真实账号。 |
| 商业远程浏览器/Unlocker | 托管浏览器、指纹、代理、挑战及会话管理 | 浏览器/网络/部分状态交由供应商托管 | 纳入市场覆盖，但不作为本地日常浏览器修复的默认方案。 |
| 网站认可的 Agent 身份/正式接口 | 通过合作或签名向参与网站证明访问者身份 | 取决于网站支持 | 属于新路线；签名不等于登录授权，也不能假定京东支持。 |

候选依据：

- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)：公开说明其 Console、InitScript/路由等兼容限制，且并非通过全部 Playwright 测试。v1.63.0 的 [crPagePatch.ts](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/blob/v1.63.0/driver_patches/crPagePatch.ts) 已定点读取，确认在 Playwright 层变更 Runtime.enable 等调用。不能把作者的 undetectable 表述转成产品保证。
- [Rebrowser](https://github.com/rebrowser/rebrowser-patches/blob/main/README.md)：本轮 README 标明完整验证到 Puppeteer 24.8.1、Playwright 1.52.0，不能据此宣称覆盖本项目 Playwright 1.61.0。公开 repo API 显示最后推送时间为 2025-05-09；这是本轮快照，不是对未来维护状态的断言。
- [SeleniumBase](https://github.com/seleniumbase/SeleniumBase)；已定点读取 v4.55.1 的 seleniumbase/undetected/cdp_driver/tab.py，看到 CDP 与 GUI 路径并存；[nodriver](https://github.com/ultrafunkamsterdam/nodriver)、[Zendriver](https://github.com/cdpdriver/zendriver)，已读取 Zendriver v0.17.1 的 connection.py，事件订阅会影响协议域启用，不能只凭 CDP-only 名称保证没有可观察副作用。
- [Camoufox](https://github.com/daijro/camoufox)、[官方说明](https://camoufox.com/)；[Apify fingerprint-suite](https://github.com/apify/fingerprint-suite)；[Puppeteer stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)。
- [curl_cffi 协议模拟文档](https://curl-cffi.readthedocs.io/en/v0.12.0/impersonate/_index.html)及[会话 PSK 说明](https://curl-cffi.readthedocs.io/en/stable/impersonate/psk.html)；[Crawlee 避免阻断](https://crawlee.dev/js/docs/guides/avoid-blocking)；[DrissionPage](https://www.drissionpage.cn/dp40docs/get_start/concept/)；[Botasaurus](https://github.com/omkarcloud/botasaurus)。
- [Windows SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)：存在权限等级、按键现态等约束；OS 合成输入也不能证明长期行为等同真人。
- [Multilogin 本地/云 Profile](https://multilogin.com/help/en_US/functionality/cloud-and-local-storage)。AdsPower 本轮只纳入同类市场扫描，未完成固定版本源码/二进制行为核验，不据此选型。

商业服务进一步区分：

- [Bright Data Browser API](https://docs.brightdata.com/products/scraping-browser/introduction)：明确为托管云浏览器，包含代理、指纹和会话处理。
- [Browserless](https://docs.browserless.io/baas/bot-detection/overview)：公开区分 stealth、Unblock 与挑战处理；不能假设云端能力均包含在可自托管版本中。
- [Browserbase Identity](https://docs.browserbase.com/platform/identity/overview)：本轮旧 stealth 文档跳转到 Identity，当前说明 Verified 浏览器及 Web Bot Auth；参与网站仍自行决定是否允许访问，身份签名不授予账号登录权限。
- [Zyte API](https://docs.zyte.com/zyte-api/usage/features.html)及[CDP](https://docs.zyte.com/zyte-api/usage/cdp.html)：不同请求/连接间的 IP 与 Cookie jar 复用存在明确边界。
- [ZenRows Browser Sessions](https://docs.zenrows.com/browser-sessions/introduction)：原 Scraping Browser，提供远程 CDP 与代理能力。
- [Scrapfly ASP](https://scrapfly.io/bypass)：官方宣称组合协议指纹、浏览器指纹和代理能力，其成功率未经本轮复验。
- Oxylabs Web Unblocker 已纳入扫描，但所请求文档页面工具读取失败；不填造接口细节或当前通过率。

### 已核验版本与来源快照

本表是对照候选快照，不是已安装版本、已完成兼容验收或冻结选型。许可证列是仓库主许可证；实际引入仍需核查捆绑组件。

| 组件 | 本轮公开快照 | 维护/平台证据 | 主许可证 |
| --- | --- | --- | --- |
| browser-use | 0.13.8；tag commit eb4126921bea3373f91afc49fb4b59d6eda7fed6 | 与仓库脚本固定版本对应；定点读取 session.py、profile.py、default_action_watchdog.py | 沿现有依赖评估，不新增 |
| Patchright | [v1.63.0](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/releases/tag/v1.63.0)；f34b86146dd4e6b54eeacb023af0dbfe19ee09db | release 2026-09-08，仓库最近推送 2026-10-01；本轮没有 Windows 行为测试 | Apache-2.0 |
| Camoufox | [v156.0.1-beta.36](https://github.com/daijro/camoufox/releases/tag/v156.0.1-beta.36)；7a4ac0d4dca2dfdeb277f521824a26efb0b6a7b6 | release 2026-10-06；API 确认 win.x86_64、win.i686 构建；没有下载或运行 | MPL-2.0 |
| SeleniumBase | [v4.55.1](https://github.com/seleniumbase/SeleniumBase/releases/tag/v4.55.1) | release 2026-10-06；源码定点检查，未在本机验证 | MIT |
| Zendriver | [v0.17.1](https://github.com/cdpdriver/zendriver/releases/tag/v0.17.1) | release 2026-10-02；源码定点检查，未在本机验证 | AGPL-3.0 |
| nodriver | 主分支元数据快照；未冻结版本 | repo 最近推送 2026-10-05；releases/latest 未取得 release，不等于没有可用包 | AGPL-3.0 |
| Rebrowser patches | [1.0.19](https://github.com/rebrowser/rebrowser-patches/releases/tag/1.0.19) | release 2025-05-09；公开兼容验证较旧 | API 未识别，尚未完成核验 |
| curl_cffi | [v0.16.4b1](https://github.com/lexiforest/curl_cffi/releases/tag/v0.16.4b1) | releases/latest 返回此 tag，名称含 b1；不当作稳定性承诺 | MIT |

### 纠正容易过时的技术判断

1. CDP 不是浏览器自动向网站暴露的一根固定开关。经典 Error.stack/console 序列化副作用检测已受 2025 年 V8 修改影响。[Castle 2025-08-28 研究](https://blog.castle.io/why-a-classic-cdp-bot-detection-signal-suddenly-stopped-working-and-nobody-noticed/)和[DataDome 2026-06-01 复核](https://datadome.co/threat-research/how-browser-vendors-are-quietly-making-automation-harder-to-detect/)均说明该旧方法变化。不能用旧检测页阴性证明所有 CDP 特征已消失，也不能见到 Runtime.enable 就认定当前版本必被识别。
2. [Chrome Headless](https://developer.chrome.com/docs/automation-and-testing/headless)已与有界面模式共享实现；运行模式、启动参数、显示环境和页面可见性仍可能不同。headless 不等于必被封，有界面也不等于不可识别。
3. [MDN isTrusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)区分浏览器生成事件和脚本派发；HTML element.click() 的 click 事件有其特定语义。isTrusted=true 本身不证明物理真人操作，不能用改一个值代替真实事件路径。
4. [Chrome 136 的远程调试变更](https://developer.chrome.com/blog/remote-debugging-port)限制默认数据目录上的调试参数。因此保留原日常 Profile 与通过专属目录启动浏览器是不同方案，不能把迁移 Profile 当作透明替换。
5. [FP-Inconsistent 论文](https://arxiv.org/abs/2406.07647)研究了伪装指纹之间的矛盾；[2026 Web Agent 多层指纹论文](https://arxiv.org/abs/2606.30119)报告部分反检测措施反而增加其样本可识别性。这些是特定实验结果，不能外推所有工具必然失效。

### 对当前 B-A-T 的具体发现

#### 1. 专属浏览器存在应优先测量的启动参数

apps/api/python/browser_use_runner/managed_window.py:375 使用 --remote-debugging-port=0；headless 分支还加入 --headless=new。

[MDN navigator.webdriver](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver)把 Chrome 的 --remote-debugging-port=0、--headless 和 --enable-automation 列为 webdriver=true 的条件。因此该分支存在明确的环境暴露核验项。尚未启动浏览器测量实际值，不能说事故当时值已确认，更不能把这项结论套到扩展连接的日常浏览器。

后续改动位置候选：ManagedWindow._launch 及其现有浏览器配置适配；先复现实际值和必要连接能力，再评估成熟组件配置，不能直接堆叠来源不明的 stealth 脚本。

#### 2. 账号检查有独立 HTTP 网络路径

apps/api/python/browser_use_runner/account_http.py:18-30 从借用浏览器读取 UA/Cookie，再用 httpx.AsyncClient 请求；RecordingClient 也使用 HTTPX。该代码路径不是浏览器原生网络栈。由此可提出协议和会话不一致风险，但本轮没有逐一确认所有平台路由，也没有证据证明京东走过此分支。

后续位置候选：该适配器及 account_borrow/account_session 的既有公共能力；区分“读取浏览器已有状态”与“额外向远端发请求”，核对目标平台实际支持的官方接口/页面路径。不能仅替换 UA 或装 curl_cffi 就宣布整个会话一致。

#### 3. 直接 CDP 不代表动作全部等同手动输入

固定 browser-use 0.13.8 [default_action_watchdog.py](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/watchdogs/default_action_watchdog.py)：通常点击走 Input.dispatchMouseEvent；几何信息不足、遮挡等部分分支调用 this.click()，部分特殊输入通过原生 setter 赋值并派发 JS 事件。源码证明存在这些分支，不证明此前任务触发过。

后续位置候选：B-A-T 现有动作能力适配/捕获层与固定上游能力配置；记录实际选择了哪条路径，在受控页面对照事件与页面效果。若需修正，优先通过上游公开能力或限定扩展复用，不自研新的输入框架。

#### 4. daily 已保留部分重要身份属性

apps/api/src/browser/daily-extension.ts 使用真实 Profile 元数据并建立扩展 relay；apps/api/python/browser_use_runner/attached_window.py:329-335 设置 headless=false、no_viewport=true、storage_state=None，借用现有浏览器存储。这是值得保留的已有能力，不应在未证明需要时用新指纹浏览器或云会话替换。

该结构不能证明所有后续检查/动作都没有额外信号，尤其要联合审查账号维护、准备、sample/verification、正式复跑和失败重试的累计请求。

#### 5. Patchright 不覆盖整个当前控制栈

scripts/setup-upstream-browser-runner.mjs 固定 browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11，账号相关 Playwright 为 1.61.0。browser-use 固定源码 session.py 直接使用 cdp_use.CDPClient。

因此不能按“项目安装了 Playwright”推导“替换成 Patchright 即修复 B-U 的全部动作”。需要分别确认 Playwright 借用路径、B-U/cdp-use 路径和扩展 relay 的调用责任。若改为另一控制器，必须重新覆盖观察、动作、编译证据、普通复跑、恢复和资源清理。

### 推荐顺序与尚未执行的验证门

当前首选是保留真实日常 Chrome 身份，在既有控制边界内先消除实测差异；这是适配成本和会话连续性判断，不是已经证明防封更强。

1. 固定 Chrome/组件版本，建立受控页面上的环境、输入和请求对照。分别记录手动基线、现有系统、单一候选改变；禁止把多个 stealth 补丁一起加入后只观察成功率。
2. 先验证专属启动参数、HTTPX 分支、JS 点击/赋值路径以及维护/准备/复跑累计动作。按“本项目引入、上游默认、配置可调整、固有差异、未知”记录归属。
3. 若现有适配不能解决已证实的问题，以 Patchright、SeleniumBase CDP 作为 Chromium 候选对照；Camoufox 留作独立专属浏览器选项。不能让候选创建第二个实际控制会话或接管清理责任。
4. 浏览器侧测环境属性、事件序列/信任标记、焦点与可见性；网络侧另用自有或获授权 HTTPS 端点测 TLS/HTTP、Cookie 连续性及请求来源。仅本地 DOM 页不能验证外网 IP 信誉或生产风控。
5. 开发验证沿既有独立 headless 约束，不打扰用户电脑；其结论只覆盖该环境。日常浏览器是否一致需要独立安排的证据，不能由 headless 结果代签。
6. 运行、账号与清理分别结算：动作成功、获取到正确数据、检测信号变化、账号状态、零隐式模型调用、owner 资源关闭是不同事实。无需为了检查账号状态额外访问受限制平台。

所有候选仍需验证：Windows 当前 Chrome 配合、Profile/owner 生命周期、恢复与回放语义、是否增加网络请求、日志是否泄漏敏感数据。普通节点零隐式 LLM 的产品边界保持不变。

Reuse Assessment（调研态）:
- capability: 减少本地浏览器自动化引入的可测环境、输入和会话差异。
- existing implementation in repository: 日常 Chrome 扩展/CDP relay、AttachedWindow/ManagedWindow、browser-use/cdp-use、账号检查 HTTPX/Playwright 路径、LangGraph 运行和既有 owner/lease。
- mature candidates and pinned versions: 见上方公开版本快照；候选成熟度不替代本机兼容证据。
- selected implementation: 尚未冻结；优先审计已有 Chrome 路线，未安装任何候选。
- reused public surface: 优先已有浏览器配置、原生输入/页面能力、既有会话借用；候选公开 API 的可替换性待对照。
- B-A-T-owned adapter and remaining gap: 路径证据、会话归属、编译/复跑审计；不新增 Agent loop、输入框架、代理池或通用采集调度器。
- license/runtime/platform fit: 见快照；若实际引入仍需核查完整依赖与捆绑许可证，Windows 行为未测。
- browser/runtime/state ownership conflicts: 云服务、临时 Profile、驱动自有清理/恢复和爬虫会话池均可能冲突，尚未证明能无损替换。
- replay model calls: 本轮没有产品模型调用；候选不得使普通复跑增加隐式模型调用。
- rejected candidates and evidence: 本轮未判定工具无效；暂不优先云浏览器、身份轮换、Firefox 替换、全量 stealth 注入，原因是现有本地真实身份和控制契约不匹配或兼容证据不足。
- focused validation: 完成交接/事故/源码/官方资料/release 对照；未执行浏览器、工具或目标站点实测，不能冻结选型或宣称已修复。

## 2026-10-07 补充：Ego、原生桌面输入与内核反检测方案

### 用户真正要求与本轮结论

用户要求明确回答：有没有一套能替代真人使用浏览器的方案、能否完全像人、Ego browser 是否已深入调查。上一轮工具列表和三个实现风险没有充分回答选型问题。本节补充操作机制、源码边界、Windows 可用性和推荐决策，不把宣传成功率变成账号安全保证。

- 替代人完成一部分搜索、阅读、填写、下载任务：已有可用路线；跨任意网站、任意页面的可靠全自动仍不能保证。
- 尽量沿用真人操作的浏览器和桌面输入路径：可以作为明确的工程目标；本机 Windows 首选评估“既有普通 Chrome + 成熟桌面输入组件 + B-A-T 任务链”。
- 让网站在所有情况下都无法区分、保证账号不受限制：没有本轮证据支持任何工具作此保证。
- 上述首选是按用户“本地、真实身份、接近手动操作”的目标作出的工程判断，未经过真实对照，不是已验证的最低封号率排名。

### Ego(lite)：已经核验到公开 SDK 源码

确认用户所说 ego browser 对应的公开候选为 [Ego(lite)](https://www.egolite.app/) / [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite)。本轮由 git ls-remote 固定公开仓库 HEAD 为 `dca7003349c5f7132189ba00547cbbd7ff8e597e`。

官方资料：[产品原理](https://www.egolite.app/document/en/docs/product-introduce)、[固定 README](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/README.md)。

1. 它是 Chromium 浏览器；用户和 agent 可以使用同一浏览器内的登录态。Space 是任务工作空间，不是新的 Chrome Profile。按官方说明，agent 可以在自己的标签页工作，不切走用户标签页或抢键盘焦点。
2. 官方说明把语义 Snapshot 建在修改后的 Chromium 内部，覆盖跨源 iframe、shadow DOM 等结构；页面引用用于动作定位，批量 Node.js 调用减少模型往返。这些是浏览器任务执行能力，不等于不可识别证明。
3. 已定点读取 SDK 的 browser-runtime.ts、driver/pointer.ts、driver/keyboard.ts、http.ts 和 API 文档。pointer.ts:605-606 的鼠标动作调用 Input.dispatchMouseEvent；keyboard.ts 包含 Input.dispatchKeyEvent/Input.insertText；runtime 通过宿主 sendCDPMessage 桥接。其公开输入层仍包含 CDP，并非把所有动作转成 Windows/macOS 物理键鼠输入。
4. 固定源码：[pointer.ts](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/package/ego-browser/src/driver/pointer.ts#L605)、[keyboard.ts](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/package/ego-browser/src/driver/keyboard.ts)、[runtime](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/package/ego-browser/src/browser-runtime.ts)。使用 CDP 也不能反向推导“必然被识别”；需观察实际实现和当前版本行为。
5. 本轮以只读内存归档检查该固定提交，没有发现 Chromium C++ 源码或补丁文件，不能声称已审计其浏览器内核。仓库 MIT 许可不能自动外推至未公开的全部内核修改。
6. 官方产品说明明确：网站仍可要求 CAPTCHA 或其他安全检查，Ego 不绕过这些检查。公开说明目前提供 macOS，Windows 尚处即将推出的内测计划，不能作为当前 Windows 已可直接替换的结论。
7. 官方宣称在相同模型的 31 个真实任务中，30 个得到满分。这是作者报告的任务完成结果，不能代替长期账号安全、京东兼容或独立反检测评测。已读 [benchmark 仓库说明](https://github.com/citrolabs/ego-browser-benchmark-framework)，它明确为 public beta、受控比较而非通用排行榜；本轮未完成其 31 项原始结果逐项复核，也未执行评测。
8. 官方“经验积累为可复用 tool/workflow”仍标 coming soon，不能据此认定已实现 B-A-T 不可变任务链、参数绑定和普通复跑零模型调用。

### Windows 原生桌面路线：Midscene 与 Cua 的真实边界

[Midscene Desktop 官方文档](https://midscenejs.com/platforms/desktop)支持 Windows/macOS/Linux 的原生键鼠、屏幕截图和多显示器。固定 HEAD：`1c2d8f7d0ab1d45d8d60e3ec476d90c6777f8a2b`；该提交 packages/computer/package.json 版本 `1.14.0`，MIT，依赖 @computer-use/libnut ^4.2.0。版本来自仓库源码，不等于本机已安装或 npm 发布已验证。

- [公开导出](https://github.com/web-infra-dev/midscene/blob/1c2d8f7d0ab1d45d8d60e3ec476d90c6777f8a2b/packages/computer/src/index.ts)包含 ComputerDevice；[device.ts:738](https://github.com/web-infra-dev/midscene/blob/1c2d8f7d0ab1d45d8d60e3ec476d90c6777f8a2b/packages/computer/src/device.ts#L738)公开 inputPrimitives，提供 pointer、keyboard、scroll。它们走设备驱动，不需要通过 aiAct 才能调用；这些动作本身没有模型决策。
- [input-driver.ts](https://github.com/web-infra-dev/midscene/blob/1c2d8f7d0ab1d45d8d60e3ec476d90c6777f8a2b/packages/computer/src/input-driver.ts)复用 libnut mouseToggle/mouseClick/keyTap 等；Windows 指针路径另处理物理像素与 DPI。无需在 B-A-T 自研一套 Windows 输入框架。
- 默认文本输入可以走剪贴板粘贴；顺序键入是可选配置。源码有固定平滑移动参数。不能把“native input”描述成默认具备真人完整行为分布，也不能把每次粘贴说成逐键输入。
- 键鼠原语零模型调用，不等于动态目标定位和数据读取也自动零模型。aiAct/aiLocate/aiQuery 等有模型用途；B-A-T 普通复跑只能使用已编译且可重定位的目标和已有读取规则。纯图像任务若必须每次让模型定位，需要显式 LLM 节点或重新准备，不能暗中改变复跑契约。
- 原生桌面输入会使用实际交互桌面和焦点；锁屏、前台窗口、DPI、多屏、中文输入及权限等级必须验证。不能承诺用户继续使用同一鼠标的同时，所有网页动作都可靠完成。
- 上游调试日志的 typeViaClipboard 分支包含文本预览字段；接入前需核对并限制日志，不能让账号输入或敏感页面内容进入 B-A-T 日志。

[Cua 官方 Windows 实现说明](https://github.com/trycua/cua/blob/main/blog/inside-windows-computer-use.md)进一步证明“后台桌面自动化”不是单一路径：UIA/MSAA、PostMessage、SendInput 会按控件路由。Chromium 坐标点击可能不接受后台消息，默认后台模式会报 background_unavailable，需要明确选择前台输入。演示中的独立光标是轨迹覆盖层，不代表每次动作均为独立的系统物理光标。Cua 因此保留为桌面能力候选，不能凭“不抢鼠标”演示断言所有 Chrome 动作都等同手动操作。

### 内核反检测路线：CloakBrowser 比简单 JS stealth 更值得作为对照

固定公开 HEAD：`5fa65172f0612b3ea3efbee719be0cb618594285`。本轮 [README](https://github.com/CloakHQ/cloakbrowser/blob/5fa65172f0612b3ea3efbee719be0cb618594285/README.md)报告 wrapper `0.5.12`、Chromium `154.0.8037.57.1`，并提供 Windows x64 构建。未下载浏览器二进制或在本机启动。

- 作者宣称 87 处 C++ 层补丁，覆盖浏览器指纹、部分 CDP 输入行为等，并提供 humanize 鼠标、键盘和滚动动作。它处理的问题层次与仅替换 Playwright 驱动不同，应纳入专属浏览器候选。
- 已读 [browser.py](https://github.com/CloakHQ/cloakbrowser/blob/5fa65172f0612b3ea3efbee719be0cb618594285/cloakbrowser/browser.py)：包装层启动其 Chromium 二进制并复用 stock Playwright；源码明确移除了 Patchright backend。不能无依据推荐“CloakBrowser + Patchright + 多套 stealth”叠加。
- [BINARY-LICENSE.md](https://github.com/CloakHQ/cloakbrowser/blob/5fa65172f0612b3ea3efbee719be0cb618594285/BINARY-LICENSE.md)区分 MIT wrapper 与专有浏览器构建/补丁；本轮只能核验公开包装层和文档，不能独立审计所宣称的全部补丁。
- 作者检测站通过率和 reCAPTCHA 分数不是本轮结果；其 README 自身承认部分网站仍区分 headless，并列出站点问题排查。当前 README 与二进制许可对最新版本试用/付费的表述不完全一致，采用前需确认实际分发条款，不能将完整组件描述为完全开源免费。
- 如评估该路线，应作为独立、固定配置的专属浏览器对照，不能直接迁移受限账号、随机轮换身份或声称导入 Cookie 就保留了原日常环境的全部属性。

### Ego 类 Windows 候选：BrowserOS

[BrowserOS 官方仓库](https://github.com/browseros-ai/BrowserOS)固定 HEAD：`7d12ab39332baad966f96bde64376a4882ee300f`。官方区分日常浏览器 BrowserOS 与外部 agent 使用的 BrowserOS neo；两者不能混称完全同一产品。官方 README 将 Windows 列为可用平台，仓库公布 Chromium patch 目录，主项目 AGPL-3.0。

本轮已读 [浏览器子包说明](https://github.com/browseros-ai/BrowserOS/blob/7d12ab39332baad966f96bde64376a4882ee300f/packages/browseros/README.md)，未完成动作底层源码审计。只读源码归档读取触发自设 45 MB 大小上限后终止，未解压、未安装；不能因此写成“已验证比 Ego 更强的反检测浏览器”。它是后台浏览器体验的候选，不是已证明防封效果的优胜者。

### 具体建议及冻结前的最小证据

针对用户当前首要目标，建议优先验证下列组合：

`B-A-T 已有任务链 -> 已验证的目标定位/数据读取 -> Midscene ComputerDevice 原生输入 -> 用户选定的普通 Chrome`

1. 保留用户选定浏览器的身份连续性和浏览器原生网络请求；观察层与动作层分别审计。若观察层仍保留扩展/CDP，也必须如实记录，不能给整套方案冠以“完全无 CDP”。
2. 普通节点直接复用输入原语；B-A-T 只承担目标绑定、链路审计及生命周期。不能把每一步重新交给 Midscene agent 决策，也不能用固定屏幕坐标冒充动态定位。
3. 发生访问限制、登录挑战或身份不确定时停止相应任务，保留进度并等待人工处理；自动重试不能成为默认恢复路径。平台规则仍保持通用，不增加京东源码特判。
4. 先在自有/获授权页面比较手动、既有控制器、桌面驱动：目标正确性、事件实际序列、焦点/DPI/输入法、读取结果、模型调用数和资源归属。桌面路线的真实输入验证需要交互桌面，headless 结果不能代签；当前没有启动此验证。
5. 若“后台不抢桌面”优先级高于接近原生桌面输入，则改变主选型：macOS 评估 Ego，Windows 评估 BrowserOS；CloakBrowser 留作专属反检测浏览器对照。没有证据证明把这些产品堆在一起就是最优。

为什么输入更像人仍不足以保证账号安全：[Cloudflare 官方评分说明](https://developers.cloudflare.com/bots/concepts/bot-score/)明确结合请求特征、会话、浏览器信号和用户请求模式。这只说明行业存在跨层判断，不能推导京东具体使用 Cloudflare，也不能据此认定本次限制的触发原因。

Reuse Assessment（补充，未冻结）:
- capability: 本地浏览器任务的原生桌面输入、浏览器内建 agent 能力及专属内核反检测候选比较。
- existing implementation in repository: 既有 B-U/CDP/扩展观察动作、参数化链路、LangGraph 编排、owner/lease 与模型审计。
- mature candidates and pinned versions: 本节固定 Ego/Midscene/CloakBrowser/BrowserOS 源码提交；Cua 为官方机制说明，未固定源码。
- selected implementation: 首选评估 Chrome + Midscene ComputerDevice 输入原语；无本机行为验收，尚未冻结引入。
- reused public surface: ComputerDevice.inputPrimitives/actionSpace；Ego 宿主 API、CloakBrowser 官方 launcher 作为不同路线，不混用不支持的 backend。
- B-A-T-owned adapter and remaining gap: 页面/屏幕坐标映射、动态目标、读取与编译证据、前台占用、取消和归属；不自研 Agent loop 或原生输入库。
- license/runtime/platform fit: Midscene TypeScript/Node/MIT/Windows 文档已核验；二进制依赖和实际兼容未验收。Ego 当前非 Windows 公开可用；CloakBrowser 核心专有；BrowserOS AGPL 与引入方式待核查。
- browser/runtime/state ownership conflicts: 桌面动作可影响真实焦点；浏览器分叉/迁移改变会话环境；外部 agent 或工作流不能替代 B-A-T 唯一运行事实源。
- replay model calls: 输入原语本身不调用模型；动态定位、视觉读取或语义判断需要独立证明，模型用途须显式。
- rejected candidates and evidence: 未判定任何候选全局无效；当前不优先将真实账号迁入未验证的新内核，亦不把后台 CDP 浏览器称为 OS 原生键鼠。
- focused validation: 已读官方资料和上述固定源码；未安装、未运行候选，未访问京东或检查账号，未执行反检测站评测。仅更新本调研文档。


## 2026-10-07 用户澄清后纠正：保留 browser-use，目标是网站侧识别结果

本节覆盖上一节将“普通 Chrome + Midscene 原生桌面键鼠”列为主路线的建议。该建议把用户的“像真人”错误解释为操作系统输入方式，应撤回，不作为后续实施依据。

用户目标：京东、淘宝等网站看到的浏览器环境、设备属性、网络请求、会话与访问行为应呈现正常用户的一致性，减少自动化判定及账号限制。评价对象是网站可观察的客户端与整段会话，桌面鼠标动作只是其中一个输入维度。

明确保留：browser-use 的首次探索与既有浏览器能力；B-A-T 的任务编译、参数绑定、版本化 TaskChain、LangGraph 复跑、显式模型调用审计及资源所有权。此轮没有得到替换这些核心组件的指令，也没有修改产品代码。

当前源码依据：
- apps/api/src/upstream-browser/service.ts:107 的 startHybrid 已区分 daily 与 dedicated，并经既有 endpoint/owner 接口把浏览器连接传给 runner。这是宿主适配边界，不要求重写任务架构。
- 固定 browser-use 0.13.8 的 BrowserSession 已提供 cdp_url、executable_path、browser_profile、user_data_dir 等接口。来源：https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/session.py 。浏览器宿主与 Agent 决策循环可以分别处理。

新的工作边界：
1. 宿主与会话：浏览器启动/连接、设备属性及其相互一致性、已有身份连续性。
2. 控制行为：现有 browser-use/CDP 的实际观察和动作路径；不能把一切自动化信号归咎于框架名称，也不能仅改变鼠标轨迹就结算完成。
3. 网络与累计行为：准备、验证、账号维护、正式复跑和失败恢复的请求来源及累计访问；消除不必要的额外探测和重复访问。
4. 兼容宿主对照：CloakBrowser 等 Chromium 内核候选应接在现有浏览器宿主接口，browser-use 保留。其内核能力和 Playwright 包装层 humanize 能力必须分开核验；B-U 直接 CDP 动作不会自动获得另一个包装层的动作处理。Ego 的 SDK/Space 接口也不能未经适配核验就写成 B-U 的直接替换项。

当前决策：撤回桌面驱动优先的选型；围绕保留 browser-use 的宿主、会话、控制和访问行为展开后续评估。没有安装新组件、创建浏览器、访问京东/淘宝或检查账号；既有京东事故处置边界继续有效。


## 2026-10-07 Windows Computer Use 与网站侧反爬检测实验室

### 决策与本轮完成范围

用户确认“无法退出”指“尚未推出或支持 Windows computer use”。本轮同时调查两个问题：Codex Windows 的真实产品支持，以及用于评价 B-A-T 访问环境的反爬检测机制。

结论：
1. OpenAI 当前官方文档已明确支持 Windows Computer Use；Windows 的产品限制是占用当前交互桌面与前台输入，不能在用户继续使用同一 Windows 会话时后台操作。
2. 建立独立的反爬检测实验室，保留 browser-use 与现有 B-A-T 编译/复跑架构。评测站作为被访问的网站，观察自动化实际产生的信号。
3. 机制按五层、30 项检测族登记；使用开源探针、网络指纹实现和可配置会话规则组合，避免从零复制商用反爬引擎。
4. 检测器需要先完成误报、漏报和版本适用性校准，再用于比较自动化方案。既有 TaskRun 完成状态与实验室检测结果分别记录。
5. 本轮完成研究与评测设计；没有实现或运行检测站，没有安装组件、修改产品代码、操作浏览器、访问京东/淘宝或检查账号。

### A. Codex Windows：已经支持，当前会话缺少控制工具

已搜索并实际读取 [OpenAI Computer Use 文档](https://learn.chatgpt.com/docs/computer-use)和 [Windows 功能说明](https://learn.chatgpt.com/docs/whats-new#use-windows-apps-and-control-codex-remotely)。当前文档说明：
- 在支持地区，Computer Use 可用于 macOS 与 Windows 的 ChatGPT Work/Codex，需要安装或启用 Computer Use 插件，打开 server 和 skill 开关。
- Windows 使用 active desktop，目标应用应可见，运行期间会移动系统指针、键入并占用前台；同一会话后台操作不受支持。锁屏使用是 macOS 特性。
- Windows 需保持会话解锁。官方列出的隔离方法是独立 Windows VM；这是桌面资源隔离方法，不是网站反检测建议。
- 工作区管理员可以通过 requirements.toml 禁用 Computer Use；应用许可和文件/命令权限是不同层次。

本机只读检查：本次工具目录没有 Computer Use 控制工具；常规 config.toml 未发现 computer_use、相关 feature 或插件项；已检查的 curated/primary 插件缓存根目录没有对应目录。Plugin Management 搜索没有返回匹配的官方 Computer Use 条目。这些结果只定位当前会话的工具缺席与常规安装痕迹缺失，不证明整个产品未发布，也没有定位账户地区、管理策略或插件分发中的具体哪一项。

推荐的排查顺序是：桌面插件入口可见性 -> 安装/启用状态及 server/skill 开关 -> 新会话工具是否加载 -> 应用许可 -> 目标是否处于解锁的交互桌面。不是先换模型、重装 browser-use 或修改 B-A-T。

底层技术边界：[Microsoft SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)说明合成输入受 UIPI 完整性等级约束；[Window Stations and Desktops](https://learn.microsoft.com/en-us/windows/win32/winstation/window-stations-and-desktops)说明界面资源被桌面/窗口站隔离。这些解释 Windows GUI 自动化的工程约束，不能冒充 OpenAI 未公开的内部实现或历史发布时间原因。

### B. 先定义被测对象和判定结果

网站通常观察网络对端、浏览器暴露的数据、请求及交互历史；普通页面不能任意读取用户机器的进程列表、完整 Profile 或直接得知“正在运行 browser-use”。设备或浏览器扩展主动上报的信息须另列来源。

实验室分别输出三项事实：
- 自动化信号：观察到哪些可复现特征，适用于哪个浏览器/探针版本。
- 行为及业务风险：访问量、路径、会话和业务规则是否异常。
- 处置：当前测试策略选择放行、观察、挑战、暂停或阻断。

三者不能混为一个“真人百分比”。获授权的自动化可以允许，真人也可能违反频率或业务规则。指纹用于归类或关联，本身不是“机器人”的充分条件；挑战成功也不是完整的人类身份认证。

市场依据：[Cloudflare Bot scores](https://developers.cloudflare.com/bots/concepts/bot-score/)、[Akamai detection methods](https://techdocs.akamai.com/cloud-security/docs/detection-methods)、[HUMAN characteristics](https://docs.humansecurity.com/applications/bot-characteristics)。这些是公开行业机制，不表示京东或淘宝采用了其中某家产品或全部规则。

### C. 五层检测清单：30 个检测族

每一行是一个需要拥有来源、探针、对照和适用版本的检测族，不是已实现的检测器。“本地”表示未来可在受控环境采集；“外部/历史”表示还需要受控外网端点、时间积累或供应商情报。

#### C1. 网络与协议

| ID | 网站可观察机制 | 实验室采集/测试设计 | 容易误判的情况 |
| --- | --- | --- | --- |
| N01 | 出口 IP、ASN、代理/机房及历史信誉 | 自有外网端点记录来源，情报另接独立服务；localhost 标未覆盖 | 公司 NAT、校园网、正常 VPN 共用出口 |
| N02 | TLS ClientHello、JA3/JA4、ALPN | 在第一处 TLS 终止点或限定流量抓包，复用 JA4 实现 | 浏览器升级、GREASE、扩展顺序变化 |
| N03 | HTTP/2 SETTINGS、伪头顺序、HTTP/3 等协议特征 | 保存实际协议及原始接入层特征，不能从归一化框架 headers 反推原始序列 | CDN/代理转换协议或头顺序 |
| N04 | HTTP UA、Client Hints、语言与 JS 环境的一致性 | 同一次会话关联服务端请求和页面报告，比较矛盾而非只比较字符串 | UA reduction、隐私设置、CH 请求协商 |
| N05 | 连接复用、TLS 恢复、浏览器与额外 HTTP 客户端混用 | 对同一任务阶段关联连接/请求族；将真实浏览器与独立 HTTP 栈对照 | 浏览器进程/连接池自然变化 |
| N06 | 网络地理、时区、时延等跨层一致性 | 受控外网观察与页面时区关联，弱信号单独呈现 | 出差、远程办公、代理、手动时区 |

来源：[Cloudflare JA3/JA4](https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/)、[FoxIO JA4](https://github.com/FoxIO-LLC/ja4)、[阿里云流量分析](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/flow-analysis)。JA4 相同只代表一类握手特征相同，不证明访问者是同一个人或操作由人完成。

#### C2. 浏览器环境与完整性

| ID | 网站可观察机制 | 实验室采集/测试设计 | 容易误判的情况 |
| --- | --- | --- | --- |
| E01 | webdriver、已知框架暴露属性或全局对象 | 复用 BotD 的原始 components 与 detections，保留具体命中项 | 开发、无障碍工具、普通自动测试 |
| E02 | 窗口、屏幕、DPR、语言、平台与功能集合 | 按浏览器版本及窗口模式记录，一次只改一个环境因素 | 多屏、缩放、RDP、非标准窗口 |
| E03 | Canvas、WebGL、GPU 渲染特征及组合矛盾 | 使用 CreepJS 等独立探针，关注跨次变化与不一致 | 隐私浏览器、显卡驱动、软件渲染 |
| E04 | 原型、属性描述符、内建函数及跨 realm 一致性 | 主页面、worker、iframe 的可比属性对照，保存探针版本 | 扩展、隐私保护、浏览器实现差异 |
| E05 | 字体、音频、媒体能力、设备能力与声明环境是否相符 | 对高熵特征做最小化采集和本地摘要，不做唯一指纹即判机器人 | 字体精简、音频禁用、企业策略 |
| E06 | inspector/CDP 的版本相关可观察副作用 | 每条规则标适用版本，在手动 DevTools 开/关对照后判读 | 真人使用 DevTools；旧探针已失效 |

来源：[BotD 固定源码](https://github.com/fingerprintjs/BotD/tree/66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47/src)、[CreepJS 固定源码](https://github.com/abrahamjuliot/creepjs/tree/10aa6724cd33a1015db1574211890518cd04f0cc)、[DataDome 2026-06-01 研究](https://datadome.co/threat-research/how-browser-vendors-are-quietly-making-automation-harder-to-detect/)。经典 Error.stack getter/CDP 检测受 V8 修改影响，不能把该旧规则无命中登记成“CDP 不可检测”。

#### C3. 交互和浏览路径

| ID | 网站可观察机制 | 实验室采集/测试设计 | 容易误判的情况 |
| --- | --- | --- | --- |
| B01 | pointer/mouse/focus/input/change 顺序及 isTrusted | 受控页面记录事件种类与时序，不记录键入正文 | isTrusted=true 可来自浏览器自动化；合法应用也会派发脚本事件 |
| B02 | 鼠标轨迹、点击分布、滚动动力学 | 比较分布与完整操作上下文，不把贝塞尔曲线等同真人 | 键盘用户、触屏、运动障碍与辅助设备 |
| B03 | 键入间隔、粘贴、编辑和输入法组合事件 | 使用合成测试文本，分开测逐键输入、粘贴、中文 IME | 真人粘贴整段文本、密码管理器填充 |
| B04 | 页面可见性、焦点、交互目标与可交互状态 | 记录动作当时的遮挡、可见性和焦点；后台模式独立分组 | 多标签、阅读模式、后台页面正常活动 |
| B05 | 请求频率、并发、间隔、连续运行和重复失败 | 汇总准备、验证、维护、正式复跑与重试的全部请求，按窗口计算 | 页面预取、自动刷新、用户快速操作 |
| B06 | 访问路径、资源加载、前后动作及 API 调用关系 | 两类受控业务流程建立序列对照；缓存/Service Worker 单独标记 | 书签直达、SPA、缓存命中、辅助技术 |

来源：[DataDome 信号分类](https://datadome.co/bot-management-protection/why-client-side-signals-are-a-must-have-for-detecting-sophisticated-attacks/)、[HUMAN bot characteristics](https://docs.humansecurity.com/applications/bot-characteristics)、[MDN isTrusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)、[Cloudflare sequence rules](https://developers.cloudflare.com/bots/additional-configurations/sequence-rules/)。

#### C4. 会话、账号及业务历史

| ID | 网站可观察机制 | 实验室采集/测试设计 | 容易误判的情况 |
| --- | --- | --- | --- |
| S01 | Cookie/会话持续性、过期与重建频率 | 仅用实验室自有会话，记录生命周期及摘要 | 清理数据、无痕、Cookie 限制 |
| S02 | 浏览器存储、挑战状态与服务端会话绑定 | 受控站维护自己的 session 与状态，验证跨页/重启连续性 | 存储分区、浏览器清理和安全产品 |
| S03 | 登录时的设备/地域/会话突变 | 合成账号和场景，测变化检测；不迁移真实受限账号 | 更换电脑、旅行、正常安全恢复 |
| S04 | 单账号长期访问强度与历史基线 | 独立长周期数据集，短测只给本轮分布 | 用户真实需求改变、集中办事 |
| S05 | 多账号、设备、IP 之间的关联与协调活动 | 用虚拟身份测试关联规则；全网信誉属于外部覆盖项 | 家庭/公司共享网络与设备 |
| S06 | 搜索/读取/交易等业务路径与平台政策 | 测试任务数据定义合法顺序和预算；自动化与业务风险分列 | 真人高频操作、被允许的批处理 |

来源：[AWS Bot Control 关联活动](https://docs.aws.amazon.com/waf/latest/APIReference/API_AWSManagedRulesBotControlRuleSet.html)、[HUMAN detection overview](https://docs.humansecurity.com/applications/bd-detection-overview)、[阿里云高级规则](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/custom-advanced-rules)。外部站点的历史账号信誉及私有阈值不在本地实验室数据中；这一项必须显示为未覆盖，而非“检测通过”。

#### C5. 主动挑战、可信声明和反篡改

| ID | 网站可观察机制 | 实验室采集/测试设计 | 容易误判的情况 |
| --- | --- | --- | --- |
| V01 | JavaScript 执行、浏览器能力探测及主动环境检查 | 加入受控探测页面，区分不支持、脚本错误、拒绝执行与异常结果 | JS 禁用、CSP、网络失败、隐私工具 |
| V02 | 时效 token、nonce、会话绑定、重放与请求顺序 | 只实现实验室自己的挑战合同和失效案例，不复制目标站私有协议 | 标签页恢复、时间误差、旧缓存 |
| V03 | CAPTCHA、无感挑战、PoW 与后续风险评估 | 通过模拟挑战测 B-A-T 的暂停/人工接管/恢复；真实服务另作独立对照 | 挑战通过不能推导全部行为可信 |
| V04 | PAT/设备证明、已验证 bot 或 Web Bot Auth | 核验各类声明实际证明什么；不支持与验证失败分开 | PAT 不支持不等于机器人；签名 agent 仍是自动化 |
| V05 | 蜜罐字段、诱饵链接、不可见或遮挡目标 | 仅在受控页面设计可访问性友好的诱饵，检测错误定位与无差别读取 | 屏幕阅读器、预取、搜索索引 |
| V06 | 探针缺失、上报时序异常、内容篡改与信号重放 | 服务端关联一次性采集凭据和请求事实；不能完全信任客户端布尔结果 | 广告拦截、离线恢复、采集器自身故障 |

来源：[DataDome Device Check](https://docs.datadome.co/docs/device-check)、[Kasada 官方机制资料](https://get.kasada.io/hubfs/Kasada-Data-Sheet.pdf)、[Cloudflare PAT](https://developers.cloudflare.com/cloudflare-challenges/reference/private-access-tokens/)、[AWS Web Bot Auth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-web-bot-auth.html)、[阿里云 Bot 管理](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/bot-management/)。PoW 证明完成计算；签名证明声明的主体；二者均不能直接等同人类操作。

### D. 市场覆盖与变化记录

| 厂商/项目 | 本轮已核验的机制面 | 对本实验室的作用 |
| --- | --- | --- |
| Cloudflare | TLS 指纹、规则/ML、JS、序列、挑战及可信声明 | 网络/请求/挑战分层与独立商用对照候选 |
| Akamai | 请求异常、主动检测、行为与已知 bot 分类 | 提醒保留头顺序、版本矛盾与事务行为 |
| DataDome | 客户端、服务端、信誉、主动设备检查与版本变化 | 规则适用版本、行为/信誉与即时信号分离 |
| HUMAN | 环境伪装、篡改、交互、业务路径、网络信誉 | 检测原因与自动化能力分列 |
| Kasada | 客户端完整性及计算挑战 | 覆盖主动挑战，不把它缩成验证码 |
| AWS WAF | 常见/定向检测、关联活动 ML 与 token | 关联数据和自有外部 WAF 对照 |
| 阿里云 WAF | Client ID/UMID、JA3/JA4/H2、行为与评分 | 国内产品公开机制覆盖，不外推淘宝具体部署 |
| BotD / CreepJS / JA4 | 可读源码的基础探针及指纹计算 | 本地实现复用，不能替代上列完整商用体系 |

特别更新：[阿里云 2026-09-23 公告](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/product-overview/waf-bot-management-module-upgrade-notice)发布 Agentic Bot，将行为、频率、路径、设备和网络信号用于评分/分类。旧模块文档不能自动代表最新售卖/部署能力。上述矩阵覆盖已公开的主流机制族；各厂商未公开参数、模型和私有数据放入外部覆盖登记，不宣称穷尽所有私有规则。

### E. 明确复用方案和源码核验

| 组件 | 固定快照 | 已读实际实现 | 采用方式和边界 |
| --- | --- | --- | --- |
| BotD | 2.0.0；66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47 | src/sources/index.ts、detectors/index.ts、webdriver.ts、webgl.ts、package.json | MIT；打包到本地测试页面，保留源数据和命中项。上游目前 stability-only；仅基础检测 |
| CreepJS | 10aa6724cd33a1015db1574211890518cd04f0cc | README、package.json、src/creep.ts、server.js | MIT；作为独立研究探针。上游明确不是通用指纹库；接入前核查完整外联、日志与服务绑定 |
| JA4 | c6469a7b0dbf8fe963810162429fbfd9d1acc4d5 | README、python/README.md、LICENSE | TLS JA4 为 BSD-3；JA4H 等 JA4+ 有独立 FoxIO 许可。复用 Python/tshark 工具，不重写解析器 |
| 受控页面与实验记录 | B-A-T 当前本地工具链 | 本轮未修改运行实现 | TypeScript/Zod；只实现项目独有实验配置、样本关联、报告和会话测试规则 |

实际核验发现：BotD webdriver 检测把真值映射成 HeadlessChrome，WebGL 规则中仍有特定历史渲染器字串判断。因此其标签要视为探针结果，不能未经校准就声称“识别了所有现代自动化”。CreepJS 部分源码会把指纹 JSON 打印到控制台，服务默认监听也应收紧；完整外联审计尚未完成，不能直接将官方演示页用于个人浏览器采样。

JA4 Python 文档提供 Windows 用法，依赖 Python 3 和 tshark，推荐 tshark 4.0.6+。只读检查未在 C:/Program Files/Wireshark/tshark.exe 找到文件；不代表其他位置没有安装。没有安装抓包驱动或修改证书信任。

### F. 实验室结构：网站侧证据与 B-A-T 事实分开

建议结构：

```text
手动浏览 / 现有 browser-use / 单一候选改动
                  |
          同一受控测试站与任务
                  |
     网络入口 + 页面探针 + 会话/序列规则
                  |
          逐项证据与实验报告

B-A-T 现有运行事件 --只读关联--> 实验报告
实验标签与版本清单 --评测时合并--> 实验报告
```

评测站属于开发工具，不属于生产公共 runtime，不修改 TaskRun 的合法完成定义，不增加全局 LLM judge。浏览器和 runner 的 owner/lease 继续由现有能力管理，一个产品运行仍只占一个实际浏览器控制会话。

两种观测环境必须分开：
- 本地受控站：页面/事件/会话/规则测试；没有真实外网 IP 信誉，HTTP 页面也没有 TLS 指纹。
- 自有或获授权 HTTPS 端点：网络协议和外部 WAF 对照；由收到原始连接的一侧采集。中间代理重新建立 TLS 后，源站看到的是代理指纹，不能当作客户端原始指纹。

抓包只限实验地址与端口，使用合成登录和数据；真实 Cookie、Profile、验证码正文及敏感页面内容不进仓库、日志或快照。优先在受控接入端取所需元数据，避免为检查 TLS 改写实际客户端网络路径。未取到的协议字段标 missing，不推测补齐。

### G. 对照、校准与验收方法

对照组与候选必须在相同浏览器版本、任务、页面数据和网络条件下运行，改变一个因素时记录其余条件。人工组须真实手动完成，不能用自动化录制回放冒充人工样本。

首轮样本分五组：
1. 手动基线：鼠标、键盘导航、粘贴/IME、多标签、DevTools 开/关、隐私设置。用于发现误报。
2. 现有 browser-use：分别记录初次探索、sample/verification、正式普通复跑和失败恢复，避免只测一段。
3. 候选单变量：保持 browser-use，只调整一个宿主/配置/会话实现，比较差异。
4. 已知异常对照：在自有测试站用合成错误验证规则能检测环境矛盾、会话失效、过量请求、挑战重放和采集缺失。
5. 留出集：未参与调参的任务、页面状态或独立探针；用于防止只对着自写规则优化。

业务样本至少包括“搜索/列表筛选/详情读取”与“表单填写/修改/提交/恢复”两类；使用通用测试数据，不在公共 contracts/runtime 固定京东或淘宝字段。

报告必须给出：
- 样本数、浏览器/宿主/框架/探针版本、环境、任务和运行阶段。
- 每项测量、规则命中、证据强度、采集失败和未覆盖项。
- 误报率 FP/(FP+TN)、漏报率 FN/(TP+FN)，分环境/人群展示，不能只报总体准确率。
- 业务结果、请求总数/重复数、耗时分布、隐式模型调用和资源清理结果。
- 候选相对现有方案消除/新增的信号，以及独立留出集结果。

校准样本不足时报告分子/分母与区间，不产生没有校准依据的“99% 真人”概率。工程不变量（如会话不串用、挑战后停止、无未授权重试）使用确定性检查；行为分布阈值由真人对照和业务场景校准，不能凭空写死“每页几秒就是安全”。

验收依次进行：探针本身可检测已知异常 -> 手动基线误报被解释/修正 -> 当前 B-A-T 的完整访问成本被测出 -> 单变量候选比较 -> 独立探针或自有域名商用 WAF 复核。自有域名 WAF 放行与目标平台账号安全分别记录，不能把前者命名为“京东通过”。

### H. 实施次序与本轮未执行项

实施次序：先搭本地检测站及证据格式，再接现有 browser-use 跑受控任务，再加受控 TLS 观测，最后校准行为/会话与独立商用对照。优先复用探针，不先迁移真实账号，也不先替换 browser-use。

截至本轮，30 项检测族、来源和采集边界已定义；实现、人工基线、浏览器对照及外网/WAF 均未运行。缺少具体部署地址不阻止本地设计；后续真实外网验证必须有自有/获授权端点。京东事故处置中的停止自动访问规则继续有效。

Reuse Assessment（检测实验室研究态）:
- capability: 从网站侧观察浏览器自动化特征，并比较人工基线、现有 B-A-T 和候选改动。
- existing implementation in repository: browser-use 探索、参数化链路、正式复跑、运行/模型/资源审计；本轮不改动。
- mature candidates and pinned versions: BotD 2.0.0、CreepJS 与 JA4 的上述固定提交；商用引擎作为独立对照。
- selected implementation: 组合本地 BotD 探针、独立 CreepJS 对照、JA4 网络观测与薄实验记录层；具体引入版本在最小样本通过后冻结。
- reused public surface: BotD load/detect/collect 类公开能力以固定版本接口核验为准；CreepJS 独立页面；JA4 Python/tshark CLI。
- B-A-T-owned adapter and remaining gap: 实验身份、版本清单、证据关联、网站任务夹具和对照报告；外部信誉/账号历史单列未覆盖。
- license/runtime/platform fit: BotD/CreepJS MIT；JA4 TLS BSD-3、其他 JA4+ 独立许可；Windows 抓包依赖尚未完成本机验证。
- browser/runtime/state ownership conflicts: 检测站不取得个人浏览器所有权；报告不覆盖生产运行事实；端口/进程/临时目录沿用已有资源处置边界。
- replay model calls: 检测和比较本身使用代码；正式复跑仍为零隐式模型调用，探索调用单独记录。
- rejected candidates and evidence: 不采用单一检测站总分、固定真人概率、旧 CDP 规则一票结算或从零仿制完整商用风控。
- focused validation: 官方文档和固定源码只读核验完成；仅文档更新，未安装/运行/发布任何检测组件。


## 2026-10-07 开源检测主体与 B-A-T 深度整合设计（文档交付）

用户明确要求先选择开源方案，仅补其缺口，并把选型和现有系统改造写成详细文档。本次只完成研究与开发设计，没有实施检测系统或产品改造。

- [开源选型、30 类机制覆盖与扩展边界](ANTIBOT_OPEN_SOURCE_ASSESSMENT_20261007.md)：主选先验证 CrowdSec 1.8.1 + 独立锁定的 Hub / 官方 bouncer，直接复用内置 fpscanner、挑战协议、规则和行为场景；BotD/CreepJS 独立复核，JA4 补充 TLS。新 Bot Detection 仍为 Alpha，不写成已成熟验收。
- [系统集成与实施方案](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md)：保留 browser-use、workflow-use、TaskChain、LangGraph；列明现有源码入口、W1–W5 改造包、P0–P4 阶段、协议/状态所有权、12 项验收不变量和回滚。
- 本次决定补充并覆盖此前“仅 BotD + CreepJS + JA4 组合”的检测底座建议：服务器侧复用 CrowdSec，不把规则引擎、挑战协议和行为窗口重新交给 B-A-T 自研。此前已撤回的“桌面原生输入优先”建议继续无效。
- 源码核验补充：BotD npm load 默认有抽样 monitoring，接入应关闭；独立 fpscanner 的 XOR 不是安全完整性协议；CrowdSec Engine / Hub / Lua 依赖须分别固定，不能把 Next 文档当稳定版本合同。
- 运行状态：组件未安装、未启动；人工基线、Windows 浏览器对照、TLS 抓包、产品改造均未执行。未访问京东/淘宝，京东事故处置边界继续有效。后续按两份文档取得最小实测证据后才冻结采用版本。


## 2026-10-07 反爬开发计划设计复审：首批缩减与效果验收纠正

用户追问是否经过 review、是否最小、能否满足网站侧识别目标。本轮进行主 agent 设计复审，不是独立 reviewer 审核。六项发现及处理已写入 [集成方案第 0 节](ANTIBOT_SYSTEM_INTEGRATION_PLAN_20261007.md#0-设计复审结论与纠正)，并同步修订 [开源选型](ANTIBOT_OPEN_SOURCE_ASSESSMENT_20261007.md)。

本条覆盖前条的首批实施顺序：M0 只使用固定 fpscanner、既有本地夹具和现有运行记录；无需先部署 CrowdSec/容器或增加产品 schema、数据库、UI。CrowdSec 仍为需要挑战与跨请求判定时的开源扩展，JA4 在声明网络改善前接入；W1–W5 全部改为按实测缺口触发。

固定 fpscanner 源码进一步核验：采集错误与检测规则异常不能直接按 false 结算；CDP 探针修改 Error.prepareStackTrace，独立新文档隔离探针扰动。效果验收新增 G1–G5：有效观测、同条件对照、预登记目标变化、成对重复与独立复核、业务和声明范围。撤回“检测库必须开源因此所有客户端宿主也必须完整开源”的额外假设。

本轮只修订设计文档；组件、浏览器、产品测试与目标平台访问均未运行。


## 2026-10-11 在线收尾按最终编译结果最小修复

真实首败task48c3061d：final canonicalRequest与source逐字一致，final compilation.gaps=[]/已保存，raw sourceGaps两项无消费者探查历史错误；AuthoringBuild.finish仍按raw列表非空阻断。

Product Alignment:
- natural-language task: 表格采集或交互检测完成后产出可复跑链路
- reusable chain boundary: 同一来源的在线final编译回执到候选链
- runtime inputs: 已保存final envelope与原始来源
- dynamic task outputs: 版本化候选链及原始错误审计
- generic platform capability used: 现有AuthoringBuild/自然编译器/持久化ACK
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 判定在线编译是否完成
- existing implementation in repository: natural_read_liveness.retire_unused_discovery由现有compiler唯一分类有效缺口；AuthorCompilation.finish传入raw gaps后保存final；TS validateHybridResponse/materializeHybridChain/ACK已验证最终缺口、来源及保存
- mature candidates and pinned versions: 当前受管workflow-use 0.2.11 / bat-hybrid/3及Zod4.1.8，均原仓库实现；不引新库或复制分类器
- selected implementation: 复用已经验证并保存的final compilation.gaps，原始sourceGaps保留审计
- reused public surface: AuthoringBuild.accept/finish及原final materialization
- B-A-T-owned adapter and remaining gap: 仅修宿主收尾读取了错误事实源；保持canonicalRequest一致及必须有final回执
- license/runtime/platform fit: 沿用现有依赖/许可证及Windows Node/Python进程
- browser/runtime/state ownership conflicts: 无新增会话/状态机/模型调用，旧来源不改写
- replay model calls: 0
- rejected candidates and evidence: 不另写TS探查分类器，避免跨语言复制已由编译器完成的分类
- focused validation: 原受控在线callback到ACK/SQLite/候选的测试增加已退休raw gap与未解决gap反例；真实旧来源验证finish；类型检查后冻结，新建任务全主流程首次验收

## 2026-10-11 继续根因修复（root-cause-03）

冻结 #2 原首败不改写。完整 Python 7 步诊断、完整管道/宿主编译保存均无页面断连；宿主单步 0.73 秒以内。实际 API /tasks 冷读 3845ms；只读生产 SQLite + 原 TaskSummaryProjector CPU profile 冷读 3924ms、命中 63ms、模拟无关写入导致全局 revision 改变后 3805ms；旧任务 2aaa0674 单次投影 3353–3425ms，最新 execution body 113649995 字符。根本缺口是任务摘要使用全库写版本缓存，进度写入持续使所有历史大结果重读；与 CDP relay 共用 Node 主线程。原首败无客户端 Network.loadingFailed 和 Python 清理子阶段时间，不能伪造原时刻唯一归因，补受控同路径验证。

Product Alignment:
- natural-language task: 页面检测或资料填写后读取结果
- reusable chain boundary: 原生导航、准备结果与清理分离、工作台摘要
- runtime inputs: 已确认站点和输入、单任务持久化序列
- dynamic task outputs: 实际来源/业务失败及独立清理回执
- generic platform capability used: ActionDispatchAudit、RuntimeCleanupRequiredError、taskWorkspaceSequences
- replay model calls: 0 新增
- site/task-specific code added: no

Reuse Assessment:
- capability: 导航健康查询边界、独立清理结算、任务局部缓存失效
- existing implementation in repository: B-U 0.13.8 导航后 get_browser_state_summary；原 ActionDispatchAudit；已用 RuntimeCleanupRequiredError；SQLite workspace sequence triggers；lru-cache
- mature candidates and pinned versions: 保留锁定的 browser-use 0.13.8 / cdp-use 1.4.5 / SQLite + better-sqlite3 + lru-cache，不替换依赖
- selected implementation: 复用上述公开实现与项目已有契约
- reused public surface: 原 Tools.act/Browser summary、既有 cleanup.primary、workspaceSequence
- B-A-T-owned adapter and remaining gap: 健康查询不冒充供 Agent 使用的观察快照；同任务提交才失效摘要；业务失败穿过独立清理层
- license/runtime/platform fit: 原依赖和 Windows 运行时不变
- browser/runtime/state ownership conflicts: 不新建浏览器框架、不修改盾或上游源码
- replay model calls: 无新增
- rejected candidates and evidence: 无新库选型；现有能力足够
- focused validation: 导航健康查询/动作前身份/安全拒绝；清理双失败投影；跨任务缓存与回滚；真实只读大记录 CPU 对照；验证后新冻结任务

## 2026-10-11 第三次冻结首败后的读取反馈修复

首次 prepare 0d22fe9c 以 1202 文件逐字未变结束：导航、输入、滚动、单次提交完成；盾 Bot/38clear+1trusted 命中、全部可测，清理 confirmed 约1.3s。停止根因是 bat_read_fields 的字段模式与原内容采集参数混用：AuthorMethodReadToolParams 仍暴露 captureContent，容器单参会被旧解析器解释为内容采集；当前任务为结构化对象时只报 natural_read_schema_mismatch。错误字段名也只回相同码；原有 field_read_tool 已给 required/allowed，当前 method_read_tool 未复用，模型 5 次读取失败后主动 done(false)。最终链接歧义曾回 match_count=2，证明不是通用 DOM 不可读。

Product Alignment: natural-language task=读取资料字段或检测结果；reusable chain boundary=一个受确认输出路径的 DOM 读取方法；runtime inputs=确认输出schema及现场选出的投影；dynamic task outputs=实际页面字段；generic platform capability used=既有 Pydantic 参数模型、FieldReadError、_read_shape/field_read_contract_fields 与 B-U 原生纠错；replay model calls=0 新增；site/task-specific code added=no。

Reuse Assessment: 不扩建 Agent/读取/校验框架，复用现有 shape 推导和字段匹配校验；隐藏当前字段工具不支持的内部 captureContent 参数，向已有错误回执补充 required/allowed/missing/unknown、字段类型、准确路径和如何重新调用。不给模型代填selector，不降低校验或伪造结果，不新增模型重试循环。最小测试：原同构错误参数在修前反馈缺信息、修后可定位，保留有效映射/引用/旧来源兼容和异常脱敏。验证完成再新冻结任务；第三次首败不恢复成成功。


## 2026-10-11 后台资源巡检的全历史同步读取

实测主进程92秒CPU profile：约28.1秒来自browserResourceRecords→Drizzle JSON解码/同步SQLite all，app每15秒分别daily/dedicated调用，合计重复读取50条/444623701字符历史，当前实际待清理候选0。此前只读任务列表cache修复漏掉此定时入口。新首败bef81e57为连接超时，原次没有握手时序，不把后来1.53秒连接成功当根因已关闭。

Product Alignment:
- natural-language task: 检测任务和资料浏览任务均需稳定连接与清理
- reusable chain boundary: execution资源生命周期巡检
- runtime inputs: 已持久化execution清理/交付状态
- dynamic task outputs: 原输出保持不变
- generic platform capability used: SQLite部分索引、既有资源命令和Zod字段合同
- replay model calls: 0新增
- site/task-specific code added: no

Reuse Assessment:
- capability: 从持久事实筛选待恢复资源且不读取已结束大历史
- existing implementation in repository: Drizzle/better-sqlite3，taskExecutions.body唯一权威，recoverRecord原owner核验
- mature candidates and pinned versions: 仓库现有SQLite/Drizzle锁定版本，不引入组件
- selected implementation: SQLite原生部分索引派生候选；Drizzle仅提取资源字段
- reused public surface: CREATE INDEX WHERE / json_extract、select/where、原dispatch/control
- B-A-T-owned adapter and remaining gap: 资源候选predicate与字段投影；不新增双写状态或定时器
- license/runtime/platform fit: 现有依赖与Windows运行保持
- browser/runtime/state ownership conflicts: 原body与owner仍唯一权威；索引自动随写入/事务更新
- replay model calls: 0
- rejected candidates and evidence: 单加缓存仍首读444MB且需失效，SQL无索引筛选仍1.33秒扫描，故复用原生部分索引
- focused validation: 修前反例、筛选/回滚/外部写入/inspect后状态变化、真实历史只读对照、实际服务定时采样


## 2026-10-11 连接页依赖移除（实施前边界）

Product Alignment:
- natural-language task: 任意站点浏览器任务，包括资料阅读和交互检测
- reusable chain boundary: 日常Chrome授权连接与既有CDP入口，任务链/Agent/窗口owner不变
- runtime inputs: 所选Profile及已明确授权的token、扩展暂停偏好
- dynamic task outputs: 真实连接和任务输出
- generic platform capability used: BrowserSkill后台WSTransport、heartbeat、keepalive；既有Playwright CDP relay
- replay model calls: 0新增
- site/task-specific code added: no

Reuse Assessment:
- capability: 不依赖tab的已授权后台连接、断线重连、MV3唤醒与保活
- existing implementation in repository: Playwright 8b552173 CDPRelayServer/RelayConnection；PopupBridge首次授权和暂停；ws8.21.3/Fastify5.12.3
- mature candidates and pinned versions: Tencent/BrowserSkill 3f10983c09fcd443c7420830ab984c9d409954bf transport/ws-transport.ts、lib/heartbeat.ts、lib/keepalive.ts；Chrome公开alarms/WebSocket API
- selected implementation: 直接引入原WSTransport/heartbeat/keepalive，保留MIT；只调整import路径，types仅摘取通道类型
- reused public surface: WSTransport.connect/disconnect/onMessage/onConnectionStateChange/webSocketFactory；startHeartbeat；startKeepalive
- B-A-T-owned adapter and remaining gap: 后台先提交原token到同一工作台origin的固定WS入口，服务验证既有授权后把同一socket交给原Playwright relay；只映射授权和暂停，不复制重连循环/浏览器网关
- license/runtime/platform fit: MIT TypeScript/MV3，既有Chrome Windows/macOS同实现；新增alarms权限用于原上游唤醒
- browser/runtime/state ownership conflicts: 一个实际控制socket；首次授权仍沿原popup明确确认；后台不得创建授权或复活被撤销token；连接重建不恢复旧任务或借用个人tab
- replay model calls: 0
- rejected candidates and evidence: BrowserSkill ConnectionController自带system.handshake/session RPC，不能直接替换B-U需要的CDP；不重写协议转换器。Playwright connect.html入口依赖tab，保留其控制通道而替换连接交付入口
- focused validation: 新/错/撤销token拒绝，首次授权等待确认，暂停跨worker重启保持，实际Chrome无tab新增连接/断线重连/宿主重启恢复；随后冻结全新需求到发布和正式复跑

首次失败独立保存，所有受控Profile按owner/PID/绝对路径finally永久清理；不改盾。

## 2026-10-11 无窗口冷启动补充

实际已授权Default在`--no-startup-window`下30秒连接超时，进程已退出（connection-background-06/actual-cold-first.json）；未新建业务任务。Chrome本机154.0.8037.98源码 `BackgroundModeManager` 在扩展加载后释放启动keepalive，只有 `BackgroundApplicationListModel::IsPersistentBackgroundApp` 的background权限持有进程。固定源码：https://github.com/chromium/chromium/blob/154.0.8037.98/chrome/browser/background/extensions/background_application_list_model.cc 。BrowserSkill固定3f10983c的manifest没有此权限，WS组件只覆盖浏览器仍在运行的连接生命周期，不能证明完全退出后的启动。

Reuse Assessment补充：复用Chrome官方background权限和原Playwright无窗口launcher，仅manifest加一项；不用测试保活参数，不加隐藏页面或OS常驻进程。权限会让Chrome最后一个窗口关闭后保持后台，Chrome自身退出/后台设置保持有效；B-A-T首次授权及暂停仍由原popup/storage控制。Product Alignment沿本节之前后台连接项，浏览资料/填报等共同需要，0额外模型/无网站分支。关闭条件：同Profile真实零窗口连接，暂停/断连边界原证据保留，之后冻结新任务。

2026-10-12实机补验：旧已安装SW执行脚本122883字符，不包含bat.authenticate，当前产物134280字符含后台协议；manifest更新不证明SW已重载。通过Chrome官方developerPrivate.reload完成一次开发扩展更新，原token/ON保留。新增background权限0.4.1，实际产品完全退出后578.7ms连接、无窗口，无Inspector依赖。原18聚焦和真实首次授权/暂停/重连/服务重启证据保留。诊断Chrome出现Secure Preferences重置，初始快照已恢复16项、加密键未变；3个其它商店扩展新增Chrome文件损坏标记1024，未绕过校验，独立记录，不算B-A-T测试通过的组成部分。此环境事故唯一底层归因尚未关闭，不继续重复冷启；详见connection-background-06/profile-config-incident.json及profile-recovery-check.json。


## 2026-10-12 结果读取范围纠错最小修复

Product Alignment:
- natural-language task: 完成交互检测并获取最终报告，或读取普通详情页总结与列表。
- reusable chain boundary: 当前页多字段结果读取方法及原生探索纠错。
- runtime inputs: 已确认结果合同与真实 DOM。
- dynamic task outputs: 当前页面的结果文本、列表和实际来源地址。
- generic platform capability used: 既有 bat_read_fields/ReadSpec、B-U 原生探索与 Zod/Pydantic 合同。
- replay model calls: 0；不新增模型循环。
- site/task-specific code added: no

Reuse Assessment:
- capability: 对相对字段的零匹配报告正确范围，指导原生探索修复已有方法。
- existing implementation in repository: method_read_tool.py、method_read_diagnostics.py、read_sampling.py 和既有 page-url。
- mature candidates and pinned versions: 既有 B-U 与 workflow-use 固定 fork，版本沿 LOCAL-CHANGES；不用新库。
- selected implementation: 复用已有 FieldReadError 与宿主合同派生诊断。
- reused public surface: 原生 action 说明、参数描述与失败 ActionResult。
- B-A-T-owned adapter and remaining gap: 原反馈只允许改投影，遗漏共同容器是另一错误来源；当前文档 URL 不应要求 DOM 内另有超链接。
- license/runtime/platform fit: 不变。
- browser/runtime/state ownership conflicts: 不新增浏览器生命周期或调度器。
- replay model calls: 0。
- rejected candidates and evidence: 不自动猜容器、不写盾 selector、不放宽匹配与必填合同、不另造 Agent loop。
- focused validation: 原首败保留；针对零匹配范围/多匹配/敏感值边界的定点测试，实际工具读取通用页面与真实模型单次纠错，然后重新冻结主流程。


2026-10-12 验收结果：范围纠错 25 项聚焦通过，真实模型单次修正后实际 DOM 读取成功，另一页普通复读模型 0。1222 文件冻结的新任务 c52e7dc3 首次需求→准备→样本→独立复验→发布 V1→正式复跑 43e68dd4 全部完成；完整输出含 39 项及本次地址，与盾原报告逐项相符。既有 page-url、ReadSpec 与原生 Agent loop 足够，无新库/网站特判/模型重试循环。原 ce595f4a 首败不覆盖，资源清理见本轮结算。


### 2026-10-12 终态读取方法与原生CSS纠错

mNBhcZ真实轨迹首败证明：探索期间终态已出现不保证普通复跑终态；`:has-text`不属于浏览器原生CSS，模型改为无条件容器会丢掉等待语义。复用既有ReadSpec/consumer readiness，无新增库/工具/judge。只补通用指导与错误反馈保留状态条件，并覆盖多区域所有分支。readiness-correction-3_rjxq6b：当前产品模型一次生成条件，同一方法0模型读取complete/failed两种终态，相关详情保留，所属窗口关闭。该证据不替代新任务全链路验收。

隐藏页面原生产帧范围后续由input/send_keys扩为click/select_dropdown，scroll在原生动作后、事件采集关闭前经同一B-U公开screenshot刷新；不写截图文件、不调用模型、不重放动作，身份或超时失败即停止。其原因、直接CDP复现、源码版本限制及8项边界见BSK执行记录；盾规则不变。


### 2026-10-12 查询精确值与已保存方法的记忆交付

真实原生Agent诊断native-readiness-WwvdpN观察值是data-state=running，后续模型记忆却变成可见文案processing，生成错误排除条件且反复读取后success=false。固定B-U eb412692源码：[Tools.find_elements](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py#L1340)同时返回详细extracted_content与仅数量long_term_memory；[MessageManager](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/agent/message_manager/service.py#L304)默认取long_term_memory，only-once详情下一步即清空。现有适配此前仅把详情交付一次，不足以保留用于后续方法的精确状态。

Reuse Assessment:
- capability: 准备过程中保留原生查询的精确值和代码已接受的方法参数
- existing implementation in repository: bind_tools_act与MethodReadRecords.feedback
- mature candidates and pinned versions: B-U eb412692 ActionResult / MessageManager
- selected implementation: 原生long_term_memory及原60k单条上限，不新建记忆框架
- reused public surface: ActionResult.extracted_content / long_term_memory；查询与结果原文不改
- B-A-T-owned adapter and remaining gap: find_elements原文进入原生长期历史，search_page仍一次详情；已保存read参数回显到原有反馈。长上下文后续压缩仍属原生Agent，不声称无限记忆
- license/runtime/platform fit: 既有MIT依赖，无新依赖/安装
- browser/runtime/state ownership conflicts: 无新浏览器、DOM查询、父子结构注入或数据库
- replay model calls: 0
- rejected candidates and evidence: 不自建缓存、语义judge或模型循环；已有公开API覆盖
- focused validation: 3项直接使用原生MessageManager验证跨步精确值保留、搜索一次详情及错误结果不提升；完整原生三状态诊断进行中

## 2026-10-12 最终异步结果方法与输入章节边界证据

新冻结task5c07ca39采用一个共同容器的原生CSS生命周期条件，原始读取与结构化读取共用原ReadSpec/consumer readiness，不新增完成judge、selector解析器、状态机或模型重试。普通样本/独立复验/两次同版正式运行均取得39项终态报告、模型0、首次清理确认；规则仍可能给出Bot，未为通过改变盾。系统指导与工具参数说明补充是必要的生成边界，本次真实结果不证明任意未来模型生成方法必然正确，历次部分输出及原生模型失败继续保留。

输入章节最小修复只按Markdown显式列表投影Schema，原说明仍在确认草稿里；错误显式字段、纯说明无声明和其它结构标记照常拒绝。表单多字段/查询参数均适用，复用原fields及章节语法，未做业务语义猜测。真实首败先复现，6项定点与API类型检查通过。恢复/资源/具体run及来源记录见BSK_REMOVAL_EXECUTION_20261012.md；Mac候选不可用实测证据仍按独立部署门保留。
