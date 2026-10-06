# 通用任务分析与分模块交付修复

日期：2026-10-06。当前开发基线：master@0fc8ff22，348 个已有未提交路径。用户授权：先写文档、按文档开发、开发后对抗审查、结束后关机。本文覆盖旧整改文档中“固定来源/单项拆分”和“按技术动作分阶段”的实施决定；历史失败、发布版本和其他人的改动保留。

## 1. 目标和现有缺口

系统收到自然语言任务后，应在需求对话中分析业务步骤、依赖、重复范围和最终交付。B-U 负责研究每个步骤在真实页面如何完成。普通执行器复用同一步骤的操作处理不同输入。业务阶段和动作列表引用这同一份计划与执行图。

已确认缺口：当前投影只有 main 或 sources/item；阶段从单个技术节点起步按依赖合并；原任务累计 20 次准备、18 失败、2 中断；最新进入详情但范围采集不正确，宿主另外拒绝两次成功点击的入口绑定。最近 frontend/backend 转换顺序修复仅有定点证据。完整业务尚未通过。

新增现场问题：扩展为每个连接创建 Playwright · B-A-T 标签组，Chrome 的已保存组与任务窗口关闭不是同一生命周期。须排查分组、连接退出和原生分组操作，不以关闭用户浏览器或改写 Profile 代替清理。

Product Alignment:
- natural-language task: 任意用户浏览器任务，包括页面内容采集和状态操作
- reusable chain boundary: 每个确认的业务步骤一条链路，逐项调用复用同一链路
- runtime inputs: 同版任务输入、已完成步骤输出或逐项当前输入
- dynamic task outputs: 既有完成状态、页面内容和用户明确的数据结果
- generic platform capability used: TaskPlan、值绑定、once/each、B-U 原生 Agent、LangGraph、ChainPresentation、已有浏览器 owner
- replay model calls: 普通节点为 0；显式 llm 节点保留单独审计
- site/task-specific code added: no

## 2. 最小实现边界

新草案增加可读的“任务步骤”段，不要求用户填写，也不另加一次规划模型调用。由现有访谈模型在同一份草案中生成。每步只声明业务名称、输入来源、一次/逐项执行、产出类别和业务目标。模型不填写内部 ID、连线、selector、预算、DOM 身份或配置字段。

```text
## 任务步骤
1. 业务步骤名称
- 输入：任务输入
- 执行：一次执行
- 产出：完成状态
- 目标：本步骤的业务目标；必要的条件、停止点和不足处理。

2. 下一个业务步骤名称
- 输入：步骤 1 的结果
- 执行：逐项执行
- 产出：最终结果
- 目标：只处理当前一项的业务目标。
```

输入可以是任务输入、任务输入中的已声明字段、先前步骤结果。产出复用：完成状态、入口集合、页面内容、最终结果。入口集合使用现有 ElementEntry 与稳定来源键，由宿主生成；页面内容复用已有整体区域产物。逐项输入必须有真实集合与稳定键；基础值集合直接复用值作为键，入口集合沿用宿主键，不猜业务主键。最终结果默认来自末步骤，可通过同版结果说明明确其他步骤。中间完成状态步骤沿同一控制会话继续，先后依赖由步骤顺序和输入引用形成。业务条件留在所属步骤，由真实探索编译分支，缺证阻止发布。

旧已确认 Markdown 仍可读取和复跑，原历史版本不改写。新访谈必须提供任务步骤；旧固定拆分只保留在明确的历史兼容分支，不能成为新生成默认。不根据输出数组推断重复。

业务阶段直接来自当前计划步骤；一条步骤链路的所有真实动作属于它的一个父卡，循环/分支仍是同图真实子节点。prefix 仅展示已保存动作；缺口保留，展示异常继续沿既有未分组降级，不阻塞 B-U。final 结构封存后只更新运行事实。删除动作依赖猜测业务阶段的算法，保留展示校验、真实节点与出口引用及历史显式布局。

入口集合的输出构造直接复用独立的入口适配，不再经过历史两步拆分。文本等输入保留原类型；只有对象输入的字段能继承到入口记录，标量不伪造成字段。最终数量上限只约束结果所属步骤，不擅自截断其他步骤处理范围；选取前 N 项应出现在相应选择步骤的业务目标中。恢复已完成步骤必须放回其实际输出，包括 null。

画布组合当前计划和各步骤的原链路/展示引用；步骤间连线来自原计划 dependsOn，不能作为第二张可执行图。按步骤隔离技术节点与运行事件身份，步骤未生成时仅显示业务名称，不伪造动作。准备快照携带当前计划和已经持久化的步骤链，当前 prefix 在所属父卡原位更新。移除步骤下拉切图。采集产物严格合同同时接收原生已存在的可选 textPreview，旧产物兼容，其他未知字段继续拒绝。

每个步骤在线收尾时，将去掉 canonical payload/owner 的展示快照保存到既有 Artifact，job 只持有引用。下一步覆盖当前 build 后，前一步仍从本次 job 拥有的快照显示和检查；读取核验 owner、媒体类型、引用/内容摘要、步骤和 final 身份。完成编译时保留这些引用；不提前保存可执行链路，不改变版本产生时机。旧历史缺失展示引用时不补造历史。

实际采集还需兼容浏览器已接受的内嵌原图。HTML Base64 可省略末尾填充，Python DataHandler 的严格解码会报 Incorrect padding；只在交给已有 DataHandler 前补标准填充，长度先经标准库百分号解码并去 ASCII 空白计算，保留原来源 URL 和原始字节。网络资源、MIME、字节预算、文档身份和清理门不放宽。

Reuse Assessment:
- capability: 任务步骤、逐项执行、业务阶段和浏览器标签组生命周期
- existing implementation in repository: TaskPlan/ValueBinding、plannedProgression、TaskPlanExecutor、ChainPresentation、ConnectedTabGroup
- mature candidates and pinned versions: B-U 0.13.8、现有 workflow-use 适配、现有 LangGraph、Zod 4.1.8、Chrome tabs/tabGroups 公开 API
- selected implementation: 继续复用已有组件，不换库、不新增 Agent loop/调度器/解析器
- reused public surface: 现有 author/withAuthoring、once/each、ElementEntry、RelayConnection.attachedTabs、Chrome 原生已保存组菜单、现有 React Flow 图组合
- B-A-T-owned adapter and remaining gap: 同版草案步骤投影、输入输出绑定、按真实链路引用组合阶段展示；停止自动创建标签组，历史关闭的保存组用原生菜单删除
- license/runtime/platform fit: 沿用已登记版本、许可证及 Windows 环境
- browser/runtime/state ownership conflicts: 一个 execution 一个控制会话；只清理已证明归属的资源
- replay model calls: 不增加普通复跑模型调用
- rejected candidates and evidence: 重写运行器会复制已存在的多步骤/each 能力；Chrome 普通 API 不提供闭合已保存组的完整管理能力，不能把 query 无结果当清理完成
- focused validation: 见各模块验收，不运行根级或全量测试

## 3. 开发顺序与验收

| 模块 | 实施 | 必须取得的证据 |
| --- | --- | --- |
| M0 标签组 | 追踪组创建/退出，避免新运行积累保存组；原有残留按可证明归属处理 | 连接退出竞态检查；任务授权边界不扩大；现场残留数量或明确不可操作原因 |
| M1 自动步骤分析交接 | 访谈草案输出步骤；通用投影替代新任务固定两步；复用类型和绑定 | 多步骤纯操作、入口集合逐项、基础值逐项及错误前向引用的最小边界检查；同版草案直接交给 B-U |
| M2 阶段与在线保存 | 一业务步骤一父卡；子节点仍真实引用；移除技术分组算法 | prefix/final 归属一致、增量阶段身份与坐标保留、非法展示仍拒绝、编译缺口不阻塞原生探索 |
| M3 换输入复跑 | 复用既有 progression/executor；修正真实身份交接缺陷 | 第二个输入实际使用自己的入口/数据，普通动作模型调用为 0；记录首败与未测 |
| M4 组合和正式使用 | 已分析步骤串接；sample/verification/publish/formal；清理独立 | 完整任务实际结果、单项方法复用、运行身份一致；验证码/权限等待不绕过；完整原任务失败仍如实记录 |

每模块先清理被替换的旧路径，再做必要改动。允许邻接模块的输入输出、调用位置和画布接线变化；不借此重写其他模块。每模块完成后只运行所属最小验证；失败修对应层，扩大验证先说明原因。范围未改变的昂贵原任务不重复探索。

## 4. 交付和关机

### 继续修复：页面区域被误当单条字段记录

62a122c9已完成来源步骤并进入真实详情。9a4c61b2来源记录证明：原生find_elements找到了7块详情，但没有调用bat_read_fields内容采集；done.reason明确说无法确认单一整体容器。此前工具要求模型给出单一父容器CSS，混用了字段记录的单容器限制与页面内容范围。不能把普通DOM查询节点叫整区域采集成功。

最小改动：新内容工具用regions选择一个或多个已观察的相关区域，可省略并读取当前body；采集层通过标准DOM.contains/parentElement找到这些区域的最近公共祖先，不让模型猜父层级。ReadSpec新增可选、内容专用common-ancestor模式，准备采样与普通复跑复用同一个范围解析入口；字段/入口集合的旧计数规则不改，旧container来源不改。保存一个原始区域产物，不逐字段读取、不清洗、不增模型调用。仍由B-U展开并加载页面，范围预览仍由其对照业务目标判断；文档、图片预算、原图资源与不支持表面门保持。TS消费方同时验证regions与新模式绑定，禁止把新模式借给普通字段或旧来源。需求说明中逻辑引用不再被表述成禁止填写原生工具所需参数。

Product Alignment:
- natural-language task: 商品详情、文章附件等整体相关图文采集
- reusable chain boundary: 单项页面操作与整区域采集
- runtime inputs: 当前项与同版读取方法
- dynamic task outputs: 一份原始HTML/Markdown/原图产物
- generic platform capability used: 已有ReadSpec、受控CDP、B-U Page/Element和既有内容采集
- replay model calls: 0新增
- site/task-specific code added: no

Reuse Assessment:
- capability: 由已选择的DOM区域定位整体读取范围
- existing implementation in repository: TargetResolver、read_sampling、read_fields、capture_region、原生Markdown转换
- mature candidates and pinned versions: B-U0.13.8 Page.get_element、CDP Runtime/DOM与浏览器标准DOM API；沿用已有内容组件
- selected implementation: 复用原查询/内容采集，仅适配共同区域语义
- reused public surface: DOM.contains/parentElement、Runtime.evaluate/releaseObject、DOM.describeNode、Page.get_element
- B-A-T-owned adapter and remaining gap: 将业务区域集合映射为一个可验证读取根，绑定新旧来源语义
- license/runtime/platform fit: 不新增依赖，原Windows解释器
- browser/runtime/state ownership conflicts: 只在原受控target执行只读解析；不新建控制会话、不下载未加载资源
- replay model calls: 0新增
- rejected candidates and evidence: 更换爬虫不能消除模型被要求猜父层级的问题；当前HTML/原图/Markdown能力已存在，不重写
- focused validation: 真DOM的多个兄弟区域采样与两页复跑、旧container保持原计数、TS模式准入和真实原任务

### 继续修复：人工处理与自动执行的交接

05f83c54在提交搜索后进入真实登录等待。用户完成登录，受控Target.getTargets只读核验显示同一初始任务标签已回到搜索列表；恢复接口却返回500，仍保留等待。当前API未公开原生恢复异常，不能把该500的具体异常代码说成已取得。源码明确存在两处缺陷：让模型猜测登录后的完整resumeUrl并逐字匹配；原生恢复异常未转换为产品错误。旧进程已加载这些函数，不能靠改文件使它继续。本次明确中断旧准备，保存历史，重启修复后的服务，复用Chrome已有登录状态重新准备原任务。

最小改动：新人工工具只有reason和prompt；宿主收到用户确认后核验原session、原tab及实际URL仍在授权范围，记录真实前后现场。证据升级为v2；Python编译和TypeScript准入同时支持v2，编译为显式用户确认的人工节点，不把猜测URL作为恢复条件。归还现场不等于登录/业务完成，后续B-U与普通节点仍按实际页面执行；未解除认证可再次等待。v1历史证据与链路继续保持原URL条件，不改写。失败恢复保留原等待，持久化现有白名单代码并返回409，不结束Agent、不写敏感错误正文。观察诊断先保存原失败分类，异步读取不能改变原生重观察分支。

Product Alignment:
- natural-language task: 任意需要用户登录、验证或确认后继续的浏览器任务
- reusable chain boundary: 原业务步骤中的显式人工节点
- runtime inputs: 已确认输入和用户继续指令
- dynamic task outputs: 既有业务输出，不把人工确认当业务完成
- generic platform capability used: 原生Agent回调、既有人工检查点、受控session/tab和授权来源
- replay model calls: 普通节点为0，不增加judge
- site/task-specific code added: no

Reuse Assessment:
- capability: 人工现场交回和安全错误传递
- existing implementation in repository: HumanWaitControl、AuthorRequestLoop、TaskChainRuntime检查点和verifyResume
- mature candidates and pinned versions: 已登记B-U0.13.8及既有LangGraph
- selected implementation: 继续复用原Agent、原等待和原检查点
- reused public surface: on_step_end、get_current_page、受控CDP、现有resume命令
- B-A-T-owned adapter and remaining gap: 删除额外模型URL猜测，版本化真实证据并映射安全错误
- license/runtime/platform fit: 不新增依赖，沿用Windows环境
- browser/runtime/state ownership conflicts: 原session/tab及来源校验保留，不接管其他标签，不绕过验证
- replay model calls: 0新增
- rejected candidates and evidence: 全局完成judge和模型猜登录跳转均不能替代实际现场；不采用
- focused validation: v1兼容、v2跳转、越权/换tab拒绝、失败仍可继续、跨语言证据准入及诊断不改变重观察分类

### 2026-10-06 继续修复：导航后焦点丢失

用户要求继续解决原任务失败，不能将上一轮关机记录当成交付完成。保留8d6e4d1b首败。本轮先补已有观察诊断的缺失事实：原生SessionManager收到的detach、失效session查询前后的focus、受控页面/session计数，以及观察失败时实际CDP目标是否仍存在。只记录事件类别、数量、目标/会话摘要与时间，不记录页面、URL、Cookie或凭据；限定16条，沿既有observation_diagnostic保存。不改变原生动作、恢复、浏览器所有权和Agent loop；不因诊断重放动作。仅在查明并复现具体原因后修改对应层。

Product Alignment:
- natural-language task: 任意会导航或切页的浏览器任务
- reusable chain boundary: 现有步骤链路和同一受控浏览器会话
- runtime inputs: 已确认任务输入，不增加模型字段
- dynamic task outputs: 不改变任务产物，仅补失败诊断
- generic platform capability used: 既有受控目标适配和observation_diagnostic事实
- replay model calls: 不增加
- site/task-specific code added: no

Reuse Assessment:
- capability: 定位原生当前页丢失，不复制恢复调度
- existing implementation in repository: TargetScope与SourceObservationScope
- mature candidates and pinned versions: 已安装B-U0.13.8 SessionManager及Chrome Target.getTargets
- selected implementation: 复用原生事件和枚举，已有适配只记录事实
- reused public surface: CDP Target.getTargets；在既有固定版本SessionManager适配位置记录原生detach/查询
- B-A-T-owned adapter and remaining gap: 将受控会话失败信息接到已有来源事实
- license/runtime/platform fit: 沿用原选型与Windows解释器
- browser/runtime/state ownership conflicts: 不创建目标，不改变focus，不读取未授权页面正文
- replay model calls: 0新增
- rejected candidates and evidence: 自动切页、加等待或重试没有该次失效事件证据，暂不采用
- focused validation: 只检查原生返回/异常原样传播、诊断有限且无原始数据，再复现实际失败段

明确的同模块缺陷：TargetScope将原生_recover_agent_focus替换为无条件失败，即使同一个任务还有已授权的列表页，也不能沿原生逻辑恢复。修复为复用原生恢复，只允许现存受控页；原生恢复中的新建应急页禁止。借助ContextVar限制这次恢复调用，不阻止独立正常创建动作，不复制恢复锁、等待或调度。此缺陷并未证明是8d6e4d1b首次首页故障的原因。复用核验：当前SDK原函数选择已有page、使用原恢复锁及2秒attach等待；无现存页和等待失败会创建about:blank，须由受控适配阻止。所属最小测试调用真实SDK恢复函数，验证已授权列表恢复、无页失败和应急创建拒绝。

真实验收追加：入口段允许编号 URL 列表后出现来源解释段；解释不新增起点，全文 URL 仍校验真实来源。来源探索不能把 a 标签查询当成“所有可点击目标”的证明；沿用原生 B-U 研究其他控件，不复制 Agent loop、不绕过 done(false)、不按网站加 selector。若仍无法取得真实入口，记录原生退出证据，不发布假链路。

在 PROGRESS 记录各模块：实际改动、通过、首次失败、修后结果、阻塞、未测。开发验证后启用对抗 subagent，只读审查本轮文档和改动，重点查固定任务套路、输入绑定、普通节点隐式模型调用、旧路径残留和浏览器权限。

结束前保存 `MODULE_DELIVERY_RESULT_20261006.md`，列出实际模块状态、真实任务结果、review 结论、未解决原因和下一断点。登录/验证码和必要用户选择不可由开发伪造；这些阻塞不成为无限等待或不关机的理由。停止本轮拥有的后台任务、保留记录，按用户明确授权执行关机；关机命令接受与实际电源状态分别报告。


### 11:18 导航时真实detach，先查事实

b62b89f4第一个navigate失败，受管source 6c660729-f2d1-40c3-8e34-f94d566efc8c。新增记录已证明原任务session收到detach，SDK清除目标和焦点；当前页枚举0。Chrome debugger原始reason在现有协议适配中被丢弃，尚不能确定关闭者。先对现有Relay的事件入口和closeTarget调用做临时只读诊断，并用现有SourceObservationScope/Tools导航作一次0模型现场样本；不修改所有权、恢复或Agent循环。若样本不能复现，则保持事件诊断再继续原有真实任务取得原因，不能把样本通过当作消除原失败。


### 11:27 物理页面清理与debugger断开分开

第三个0模型探查复现detach，并通过原chrome.windows.update({},无属性变化)证实原任务窗口仍在。桌面显示任务已到京东验证页；不得绕过验证，已请求用户完成，停止网站请求。Chrome官方onDetach说明明确包含调试连接终止，不能作为物理tab关闭证明：https://developer.chrome.com/docs/extensions/reference/api/debugger#event-onDetach。

Product Alignment:
- natural-language task: 任意浏览器操作/内容读取
- reusable chain boundary: 不改链路；修正本运行拥有的资源释放事实
- runtime inputs: 原租约记录的ownedTargets
- dynamic task outputs: 业务输出及失败原因保留
- generic platform capability used: 原生Chrome tabs.remove与已知tab/target映射
- replay model calls: 0新增
- site/task-specific code added: no

Reuse Assessment:
- capability: debugger断开后实际任务tab仍可按已证明的所有权清理
- existing implementation in repository: 原Playwright extension BrowserModel/RelayConnection、AttachedWindow._end_connected
- mature candidates and pinned versions: 现有微软协议v2适配、browser-use0.13.8、Chrome tabs/remove事件
- selected implementation: 保留原协议；只把已创建物理tab与debugger session记录分开
- reused public surface: chrome.tabs.remove、chrome.tabs.onRemoved、Target.closeTarget
- B-A-T-owned adapter and remaining gap: 断开时保留已知target→tab清理引用；真实onRemoved结束物理所有权；按全部租约目标请求关闭并检查回执，不以attached列表为空确认清理
- license/runtime/platform fit: 现有Apache-2.0组件，Windows Chrome现场已复现
- browser/runtime/state ownership conflicts: 不重连已断开的debugger、不接管个人tab、不补造可运行target；未知旧映射清理返回未确认
- replay model calls: 0新增
- rejected candidates and evidence: 自动重attach/修改验证页面不符合用户接管边界；把断开的tab伪报为可执行CDP target也不能采用
- focused validation: 只验证断开但物理tab存在可清理、真实移除幂等、未知/个人目标拒绝及原清理ACK失败保留；完成后静态对抗复审

最小修改：extension的_ownedTabs直到真实onRemoved才删除；BrowserModel单独保留detached target→原tab清理记录和真实关闭事实，getTargets仍只返回真实attached CDP目标；closeTarget可关闭本连接原先创建但debugger已断开的tab。AttachedWindow在已确认的Chrome/Extension-Bridge端逐个关闭原租约ownedTargets，成功回执不确定则保留cleanup_required，不改原业务失败；原生Chrome/Chromium CDP保留真实页面枚举作为关闭依据，未知端点不猜测。服务/扩展重启丢失映射时必须未确认，不能静默当所有目标已关闭。

11:38补充：inspect/verify_closed也禁止凭空桥接枚举确认结束。关闭目标前后的租约集合必须一致；新popup没有关闭回执，不能覆盖旧快照后写ended。对抗审查指出这两个P1后，已修正并各以所属最小回归检查保护。原Chrome本地真实debugger Cancel后执行物理清理通过，证据work/native-local-cleanup-proof.json。历史已误报ended且扩展重启丢失映射的窗口不能推测归属或伪造修复记录；现场旧验证窗口已不在，未把其消失算成程序通过。
