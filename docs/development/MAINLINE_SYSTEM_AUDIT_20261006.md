# 主链路系统底账与交付门

2026-10-06，用户全权授权后，先停止按单个错误增补实现。当前 master / 0fc8ff2，正常服务 PID20244、4173/4175；保留所有既有脏改动，不创建 worktree。原任务2aaa0674未发布、未通过验收。下表记录本轮初始断点，后续实证以本文后段及 PROGRESS 最新条目为准。

## 一条事实链与职责

| 边界 | 当前事实源与实际消费者 | 成熟能力 / B-A-T 独有适配 | 已证实问题与处置 |
| --- | --- | --- | --- |
| 需求到计划 | 已确认需求v1/revision2 → TaskPlan v2；sources once → item each，maxItems=5，stop-on-failure | 业务绑定属于B-A-T；不再加规划模型 | 语义已确认，不重问用户，不改任务目标 |
| 代表探索 | B-U Agent/Tools → 真实action、result、DOM观察、内容回执 → 版本化source artifact | B-U 0.13.8 / eb4126921bea3373f91afc49fb4b59d6eda7fed6，MIT；B-A-T仅适配输入、记录和读取合同 | 原native点击可以无页面变化；项目额外物理检查/变化要求已缩减。当前区域定位失败，不是Chrome故障 |
| 来源到链 | artifact → natural_compile → TS materializer → TaskDraft | workflow-use 5d2d19fe8835cc86f1bf3e04302a5000d590f249；hybrid编译是本地适配，不能冒称全部上游实现 | 临时index不能当复跑身份。已有来源绑定能完成5项选择及2项复跑；自写通用selector推导仍未有成熟性证明，本轮不扩大 |
| 链与逐项调用 | TaskPlanExecutor依固定plan版本解析input/stableKey；TaskChainRuntime由LangGraph推进；每项单独TaskRun | 已有LangGraph 1.4.14 StateGraph；B-A-T拥有版本/绑定/预算/审计 | each真实存在，未复制5张链；单项错误按原stop策略保留，不能把两项完成算整体完成 |
| 区域内容 | B-U原生Page/Element → Chrome已加载资源 → 原始HTML/图像字节与受管artifact | B-U原生markdown转换、CDP Page.getResourceTree/getResourceContent；标准库dataURI | 原body方法业务范围错误，不能发布。ready双内容相等门已移除；正确区域尚未取得，不能靠放宽图像缺失冒充完整 |
| 工作台 | 固定draft/release + executionId内的run事件；React Flow投影 | @xyflow/react12.11.6、Dagre3.1.1；B-A-T只适配真实层级/状态 | PlanCanvasGraph将子链terminal平铺，隐藏once/each语义；失败新准备自动打开面板却仍展示旧draft试跑。需明确范围，不改执行图制造假流转 |
| 关闭与结果 | 本execution owner/lease及真实cleanup回执；业务结果独立持久化 | 现有受管会话finally及Chrome原生关闭 | 最近试跑已结算；连接工作正常。BrowserSkill整体接入按用户指令后置，不把它当已完成 |

## 本轮决策

1. 不替换工作中的浏览器连接、不新增Agent loop/选择器算法/调度器/全局完成judge。
2. 原生search_page已经返回实际文字祖先路径，find_elements已经提供属性、文字和children_count；先验证这条已有能力能否为正确区域产生方法。新增的提示仅连接原生观察与既有regions参数，不额外让模型写编译代码。
3. 只在取得正确区域来源后进行编译和复跑；body旧来源只作历史基础验证，不能发布。资源缺失保留失败，不能吞错。
4. 画布改动必须反映真实plan的once/each及单次调用边界，区分新准备与旧试跑。使用已有React Flow的原生组合能力，不增加第二份可执行图。
5. 用户只需看到运行结果。开发者自行核对有序5项来源、每项完整相关区域、原图及来源、独立复验、发布后的完整执行、0隐式模型调用与所属资源关闭。

## 固定来源

- [B-U原生页面文本搜索和DOM查询](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py#L1191)：现成Tools能力，不复制实现。
- [B-U原生点击及后备](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/watchdogs/default_action_watchdog.py#L733)：动作成功不等于URL变化，不以项目自写物理检查替代。
- Chrome Page.getResourceTree/getResourceContent为现有原资源接口；正确区域完整保存仍须真实样本，不能仅凭API可调用冻结验收。

## 验证边界

沿原任务normal prepare/sample/verification/publish/run API，不写DB绕过系统。保留每次首败及来源，禁止无变化重跑。每个变更只跑保护实际不变量的最小检查；交付前进行对抗subagent review。当前底账没有声称穷尽所有未来站点或适配缺陷。

## 发布就绪查询与大产物的读取边界

独立复验028ac357在SDK初始目标会话未就绪处失败，尚无业务动作；清理attempt2确认。同期发现工作台查询draftReadiness每次完整重读样本Execution（107,777,842字符）及6个TaskRun并重算输出摘要。只读实际样本实测读取364ms、解析351ms、摘要与run校验624ms；与CDP中继共用Node事件循环。这是确定的同步重复工作，尚不能单独解释SDK失败。

Product Alignment:
- natural-language task: 大页面存档、批量文件/表单结果读取
- reusable chain boundary: 原链与运行不变，只读工作台发布就绪投影
- runtime inputs: 相同草稿版本/验证记录、同SQLite连接的变更标识
- dynamic task outputs: 不缓存原页面或图片，只缓存既有验证摘要
- generic platform capability used: SQLite data_version/total_changes及成熟LRU
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 数据未变时复用发布就绪查询的已验证摘要
- existing implementation in repository: 每次validatedDraftTrials完整解析/摘要；锁文件已有lru-cache传递依赖，未有此投影缓存
- mature candidates and pinned versions: lru-cache11.4.0，1702b18817826ef7e5505ab2aa1e31f540312cd6；better-sqlite3 12.10.0
- selected implementation: lru-cache公开LRUCache(max=32)/get/set；SQLite原生变更计数
- reused public surface: PRAGMA data_version、total_changes()、Database.inTransaction；LRU不自行实现
- B-A-T-owned adapter and remaining gap: key绑定草稿/验证记录与数据库版本；本连接和外部写入均失效；事务中绕过缓存，发布仍执行原完整校验
- license/runtime/platform fit: ISC、Node20或22+，当前Node版本满足；SQLite公共领域，Windows既有better-sqlite3
- browser/runtime/state ownership conflicts: 只读摘要，原SQLite事实源不变，不改变会话或任务执行
- replay model calls: 0
- rejected candidates and evidence: 增大连接超时不消除阻塞；TTL可能把修改后的证据继续显示为可发布；缓存原大结果保留内存压力
- focused validation: 同版本重复读取复用、同连接及外部修改失效、事务/回滚不污染；原样本只读性能复测、真实独立复验

固定源码：[LRUCache](https://github.com/isaacs/node-lru-cache/blob/1702b18817826ef7e5505ab2aa1e31f540312cd6/src/index.ts)；[SQLite data_version](https://www.sqlite.org/pragma.html#pragma_data_version)、[total_changes](https://www.sqlite.org/lang_corefunc.html#total_changes)。data_version不包含本连接写入，因此必须同时使用total_changes；事务内部不复用摘要。

## 工作台调用层级适配

### 图文结果显示的合同适配

Product Alignment:
- natural-language task: 页面资料保存、网页报告存档
- reusable chain boundary: 读取既有bat-page-content/v1产物，不新增执行节点
- runtime inputs: 原产物JSON字符串、原输出合同
- dynamic task outputs: 原文预览、保存的原图、完整原始产物下载
- generic platform capability used: React19.1.1、Radix Themes3.3.0、Zod4.1.8、浏览器原生图片/下载
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 已保存图文内容的用户可读展示
- existing implementation in repository: API已校验pageContentSchema并保存Artifact；FieldValue把整串Base64直接排版，折叠记录也提前生成正文
- mature candidates and pinned versions: 现有React19.1.1、Radix Themes3.3.0、Zod4.1.8
- selected implementation: 现有Radix Button、原生details/img/Blob下载；原API schema上移共享contracts
- reused public surface: React.useMemo/useState、Button、Zod.safeParse、URL.createObjectURL/revokeObjectURL
- B-A-T-owned adapter and remaining gap: 只识别版本化产物格式，点击打开记录才解析；来源只允许http/https链接；原HTML不进入宿主DOM
- license/runtime/platform fit: 既有MIT依赖与Chrome原生API；不加库
- browser/runtime/state ownership conflicts: 只读既有产物，不访问原站、不控制浏览器、不调用模型、不另建文件存储
- replay model calls: 0
- rejected candidates and evidence: 直接插入原HTML会执行不可信内容；把Base64当业务文本无法验收原图；另建抓取/解析框架没有必要
- focused validation: 版本/图片数量校验、恶意HTML不执行、普通字符串保留；真实五项产物打开/原图展示

2026-10-06 后续纠正：用户否定外框包住旧组件、把子链终点改名为“返回”的版本，该显示方案撤销。一个 plan step 对应一个原业务主节点，once/each 属于节点调用方式；原 CanvasActionList 原位显示，分支/循环保留原节点身份。全计划只有一个结束边界，其状态必须来自相同 execution。

当前适配依据：继续直接使用同版本 React Flow 的自定义节点、Handle、Edge、ResizeObserver 测量和既有 Dagre 布局 API；仅结果明细使用 HTML details/summary，不折叠动作列表，不增加图引擎或状态机。B-A-T 代码仅映射 TaskPlan、原链动作和同运行的结果。验证保护无重复外框/子链终点、循环方式可见、原动作选中与终点失败事实不会丢失。

Product Alignment:
- natural-language task: 多步骤页面采集、逐条后台操作
- reusable chain boundary: 每个plan step引用同一原链；外层once/each和内部单次调用分层显示
- runtime inputs: 固定TaskPlan、TaskChain、同execution的事件
- dynamic task outputs: 仍为原TaskRun/Execution结果；画布不新增运行事实
- generic platform capability used: React Flow自定义节点及原生测量、Dagre；原CanvasActionList/循环体
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 业务主节点及内部动作、分支、循环的同源显示
- existing implementation in repository: PlanCanvasGraph平铺stages和terminals，依赖边连接末stage而不是plan调用边界
- mature candidates and pinned versions: @xyflow/react12.11.6，commit0a1f9575b25679f2880175de8d3eae21aedde921，MIT
- selected implementation: 既有StageCanvasCard、CanvasActionList、LoopBody；React Flow测量后交给已有Dagre布局
- reused public surface: 自定义节点、Handle、Edge、onNodesChange dimensions；不是自写嵌套布局引擎
- B-A-T-owned adapter and remaining gap: 映射plan step身份与once/each；内部动作和跨阶段路径保留原id，子链终态放本次调用结果明细，依赖边连接业务主节点
- license/runtime/platform fit: 既有MIT React依赖，Windows浏览器；不加库
- browser/runtime/state ownership conflicts: 只读显示，原链/plan/执行记录不可变；失败终态不改成成功返回
- replay model calls: 0
- rejected candidates and evidence: 只改“完成”文案仍不能表达外层逐项语义；另建运行图会违反唯一事实源
- focused validation: 只读画布两项、真实两轮不同分支执行进入计划画布一项通过；Workbench类型检查通过；真实工作台无重复外框、原列表/下一项可见、结果按钮打开原终点详情通过。旧测试预期遗漏output已按整链同阶段修正，首败保留。

已读固定源码：[React Flow原生节点测量](https://github.com/xyflow/xyflow/blob/0a1f9575b25679f2880175de8d3eae21aedde921/packages/react/src/components/NodeWrapper/useNodeObserver.ts)。被否定的DefaultNode/parentId外框方案不再使用。对抗审查发现的跨阶段边、cleanup_required覆盖已完成业务、尺寸展开重叠、结果点击冒泡均已处理；审查不代替原五项业务验收。

## 准备修订资料的缺口与最小交接

### 生成与现有主子节点的实际衔接核验

- `AuthoringBuild.accept` 的 final 经过 `materializeHybridChain`，再经过 `createStepChainPresentation`；自然循环和结果分支确实生成真实 IR，进入原 `canvasStageList` / `CanvasActionList`。既有循环体、分支出口和动作身份不是示意稿。
- prefix 使用 `materializeHybridPrefix`，仅物化已闭合普通动作，传入 `repeats: []`；完整控制结构属于 final。不能把生成片段说成最终链路，也不能为显示临时伪造控制节点。
- 京东当前旧草稿 sources 为 7 capability + 1 terminal，item 为 6 capability + 1 terminal。逐项执行属于 `TaskPlan.invocation.each`，不是这两条链里的 loop。画布缺少计划调用到现成循环显示的适配，不能修改执行 IR 强塞一个假 loop。
- 用户再次指出原有主节点＋子节点列表应直接复用：撤销本轮新增动作折叠，继续原位显示 `CanvasActionList`；把既有循环体显示提取为共享 `LoopBody`，分别展示有真实来源的链内循环和 plan.each。后者标明“下一项”，不复制子链、执行事件或终点。
- 对抗 review 的跨阶段边与清理覆盖问题需处理；主图只有一次步骤引用，原跨阶段路径内联保留真实目标，结束事实使用既有 `executionOutcome`，资源清理单列。

### 原生可选目标滚动的适配缺口

8f06d1dc 已通过真实区域读取，`selected_live_region`、30 图、原参数文本，所有来源已关闭。首次失败为两条原生 `scroll(index=...)` 的 `natural_binding_evidence_missing:index`；DOM 历史身份已记录，适配器却把 scroll 只当 viewport 动作。不是缺少新浏览器能力。

Product Alignment:
- natural-language task: 滚动页面详情区或后台侧栏列表
- reusable chain boundary: 带或不带元素目标的原生 scroll
- runtime inputs: 已捕获 DOM 身份、方向、页数
- dynamic task outputs: 原生动作回执及后续读取
- generic platform capability used: B-U ScrollAction / Tools.act，既有历史目标匹配
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生 scroll 可选 index 的记录与复跑
- existing implementation in repository: TARGET_ACTIONS 只覆盖必选目标动作，scroll 缺少已有目标解析器的衔接
- mature candidates and pinned versions: B-U 0.13.8 / eb4126921bea3373f91afc49fb4b59d6eda7fed6
- selected implementation: 原生 Tools.scroll / ScrollActionEvent
- reused public surface: Tools.act，既有 TargetResolver 将持久身份解析为当次 index
- B-A-T-owned adapter and remaining gap: 区分必选/可选目标；原 index 不进入复跑参数；无目标 viewport 仍合法
- license/runtime/platform fit: MIT，当前 Python/Windows 既有依赖
- browser/runtime/state ownership conflicts: 同一浏览器会话、同一来源身份与预算；不改变原生滚动/是否有移动的行为
- replay model calls: 0
- rejected candidates and evidence: 放行旧 index 会跨页面误指；改为 viewport 会改变原动作目标；另写滚动算法无必要
- focused validation: 历史目标编译及可选目标 native dispatch 定点测试；原来源离线恢复与真实复跑

固定依据：[B-U scroll](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py#L1256) 明确 index 可选，并分派已有 ScrollEvent。

后续证据：可选目标编译/原生派发新增两例通过；同文件既有 `test_consumer_read_does_not_replace_physical_scroll_evidence` 断言只期望 scroll_position，而当前编译同时返回 read_fields，记录基线不一致，未改该断言。fork manifest 4344f6f0… 通过。2b2949db 离线恢复成功形成 rev3，8cc9015a 样本在 sources/input 首败，0 LLM、cleanup confirmed；未通过整任务。

输入失败的下一处已确认协议差异：`target_value_condition` 生成值条件没有 settle，而导航、滚动、消费者就绪已有统一 NATURAL_SETTLE；执行器因此只读一次即失败。是否存在页面延迟仍待真实复验，不能称已找到唯一根因。适配只复用已有 Tenacity/StepVerifier 有界重读，不重派 input、不放宽值相等、不允许换目标。保护不变量是异步值到达可等待、持续错值仍失败、动作派发一次。

9b91aea1仍以done(false)结束，sequence221；source artifact7cdb9089-2086-43d2-899d-be4809e7a151。实际已保存区域含品牌、型号、程序、容量与包装清单；Agent把导航标签误作区域，又搜索图片文案，未定位实际详情。对应内容回执只在私有产物目录保存，未将原始页面写入Git。

当前prepare API只能重发确认任务，不能携带已核对的技术发现。browserUseTask虽有旧repair参数，当前正式API没有接入；不得改DB或把站点路径写进平台prompt。新准备应显式引用同需求、已结束来源的技术备注，并写入新plan版本的对应步骤，让正常taskText身份核验、编译、离线复验沿同一计划重建；备注不是可执行动作或业务要求，不改变确认版本。

Product Alignment:
- natural-language task: 修订页面采集方法或后台操作方法的技术定位
- reusable chain boundary: 同一业务步骤的新代表来源；原版本保留
- runtime inputs: 来源job/sequence、所属step、artifact身份与摘要、技术备注
- dynamic task outputs: 新来源、新草稿及原业务输出；不复用备注冒充现场证据
- generic platform capability used: 现有B-U Agent(task)与B-A-T版本化TaskPlan/Artifact
- replay model calls: 0新增；首次修订仍属于已授权探索
- site/task-specific code added: no

Reuse Assessment:
- capability: 有来源的准备期技术交接
- existing implementation in repository: browserUseTask/Agent.task、source artifact、task-product prepare幂等与计划版本；缺少显式备注入口
- mature candidates and pinned versions: B-U0.13.8/eb4126921bea3373f91afc49fb4b59d6eda7fed6原生Agent.task；不需要另选Agent框架
- selected implementation: 继续原prepare→Agent→source→compiler；仅扩展B-A-T独有的版本化准备资料
- reused public surface: Agent(task)、已有TaskPlan/schema/digest、已有来源引用解析器
- B-A-T-owned adapter and remaining gap: 接单前验证同task/requirement/step/owner/sequence/摘要/关闭事实；新plan保存备注，task builder明确现场复核后才可形成动作
- license/runtime/platform fit: 不新增依赖；现有TS/Zod/Python
- browser/runtime/state ownership conflicts: 不增加浏览器会话、重试循环或调度器；旧job/artifact不改写；备注URL不扩导航授权
- replay model calls: 0新增
- rejected candidates and evidence: 全局提示追加站点事实污染通用能力；直接改DB/source违反来源身份；无资料原样重试已反复失败
- focused validation: 错owner/step/摘要/过期sequence/变更需求拒绝；备注只交给对应步骤且进入新plan摘要；原任务实际重新准备

发布就绪摘要：3项定点与API类型检查通过，对抗review无确定P1/P2。限制是全库任意写入都会使缓存失效，持续运行仍可能重读；不能说全部事件循环阻塞或连接故障已解决。服务闲置核验后替换原PID17892为20244，没有重复启动。用户随后说明手动关闭过浏览器，此事实需与先前失败时间核对，不能把复验首败直接归因为代码。7c0c4bfb新复验原Chrome SDK连接1.6秒完成，仍只属连接事实。

### 正式运行超时诊断边界

7c0c4bfb 独立复验随后完成全部 5 项且清理确认，正常发布 v1。首次正式运行 8f6a0cf0 在 sources/s-a-0002 输入步骤返回 TimeoutError，清理确认；正式验收仍未通过。旧诊断只覆盖 PostconditionNotMet，不能据此推断是输入、目标解析或观察超时。

Product Alignment:
- natural-language task: 任意页面输入或操作失败后定位实际断点
- reusable chain boundary: 已有单次 hybrid_execute 错误边界
- runtime inputs: 已有 actionRef、原异常 traceback
- dynamic task outputs: 原失败保持；追加同 owner 的固定源码位置
- generic platform capability used: Python 3.12 原生异常链和现有 fd4 脱敏诊断
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 保留超时的实际调用位置
- existing implementation in repository: startup_diagnostics 已有固定模块名、原生 traceback、异常链上限；复用该提取器
- mature candidates and pinned versions: 当前 Python 3.12 的 BaseException.__traceback__/__cause__/__context__；已有 Zod 4.1.8
- selected implementation: 标准库异常事实 + 现有 DiagnosticChannel/SourceLifecycleDiagnostics
- reused public surface: 原生 traceback 帧与异常链；不添加日志框架、浏览器动作或重试
- B-A-T-owned adapter and remaining gap: hybrid_execute 错误边界映射到固定模块标签与行号，排除异常消息、局部变量、路径与页面值
- license/runtime/platform fit: 当前 Python/TypeScript/Windows；无新增依赖
- browser/runtime/state ownership conflicts: 不触碰浏览器，不改变原错误、执行状态或 finally 清理
- replay model calls: 0
- rejected candidates and evidence: 原始 stderr/完整 traceback 可能包含页面和凭据；无定位重复执行不能说明真实断点
- focused validation: 同一错误保留、固定来源位置、敏感消息剔除、未知来源拒绝；随后一次带诊断的正式复跑

依据：[Python 3.12 exception context](https://docs.python.org/3.12/library/exceptions.html#exception-context)；既有 startup_diagnostics 与固定 B-U 0.13.8 源码位置，不改变上游行为。

### 正式结果后的列表投影阻塞

d8067258 五项正式执行完成且0LLM；实际工作台等待完成状态45秒超时。Node原生CPU采样8秒显示热点为 `/api/tasks → projectTasks → projectTaskSummary → latestExecution/execution`，重复从SQLite解析含原图的大结果；本机进程私有内存约3.4GB。原readiness缓存不覆盖此路径。另有browserHandoff unavailable且物理京东窗口仍在，runner cleanup confirmed不能冒称物理窗口已关闭；必须经owner end核验。

Product Alignment:
- natural-language task: 查看已完成采集任务或后台操作任务
- reusable chain boundary: 任务列表摘要投影
- runtime inputs: 原TaskSummary及SQLite提交版本
- dynamic task outputs: 同一事实版本的状态、提示与归属摘要
- generic platform capability used: 已选lru-cache、SQLite提交版本
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 相同持久事实不重复加载大输出生成列表
- existing implementation in repository: projectTaskSummary每次全读运行；已有readRevision与lru-cache就绪缓存
- mature candidates and pinned versions: lru-cache11.4.0/1702b18817826ef7e5505ab2aa1e31f540312cd6；现有SQLite
- selected implementation: LRU公开API，缓存仅TaskSummary，不缓存页面/完整执行
- reused public surface: LRUCache.get/set，ProductStore.readRevision
- B-A-T-owned adapter and remaining gap: task输入摘要和提交版本双重键；事务不缓存、写后失效、对外返回副本
- license/runtime/platform fit: 已有ISC依赖、当前Windows/Node；无新增依赖
- browser/runtime/state ownership conflicts: 不改变执行、发布或窗口关闭权限；任何持久写入触发原投影重算
- replay model calls: 0
- rejected candidates and evidence: 提升超时不减少原图重读；缓存大执行扩大内存；重写数据库或状态同步无必要
- focused validation: 列表不重复重读、输入变化/本地写入/外部写入/事务回滚失效；实际成果UI重新验证

限制：这是已定位的高频列表路径；单次详情传输体积仍需如实度量，不能声称整个大结果存储已优化。

### 退出进程与物理页面关闭的断点

真实d8067258的runner close协议与child_exit均超时，随后process_tree终止已确认，报告activeResources=false、browser_close为not_required；恢复逻辑直接用这个布尔值确认清理，遗漏物理窗口核验。该owner归档租约仍running，6个ownedTargets仍有页面；显式end最初返回hybrid_managed_window_controlled。由原生Node调试器捕获固定错误码，未记录私有异常消息。

Product Alignment:
- natural-language task: 采集或后台操作结束后关闭本次任务窗口
- reusable chain boundary: 同一execution的资源恢复与显式end
- runtime inputs: 原owner/lease与已持久化的runner child_exit审计
- dynamic task outputs: 物理目标关闭回执；原业务结果保持
- generic platform capability used: 已有AttachedWindow.end与原生CDP Target.closeTarget
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 原控制进程退出后继续关闭其遗留目标
- existing implementation in repository: verifyClosedExecutionBrowser已核验原owner及child_exit，但offline end未接收该已证明权限；activeResources与browser_close矛盾被忽略
- mature candidates and pinned versions: 既有Playwright relay固定8b552173与B-U0.13.8/CDP Target.closeTarget
- selected implementation: 不增加关闭算法；原targets_to_close、物理closeTarget与关闭核验继续复用
- reused public surface: 同owner原生目标关闭；已有持久runner退出审计
- B-A-T-owned adapter and remaining gap: 仅宿主证明同owner完整退出审计且controller不活跃时，私有协议传controllerReleased；HTTP不能自授权限；browser_close未确认时必须核验物理页面
- license/runtime/platform fit: 既有依赖与Windows；无新增库
- browser/runtime/state ownership conflicts: 不关闭Chrome进程，不触碰无关目标；人工等待保留原权利，缺退出审计不放行
- replay model calls: 0
- rejected candidates and evidence: 放开所有running租约会干扰活跃任务；直接杀Chrome会影响用户页面；只看child退出已被真实窗口否定
- focused validation: 活控制器/错owner拒绝，已退出同owner只关闭已有目标，activeResources=false与browser_close未确认不能跳过核验；原窗口实际end

对抗review修正：退出证明接受child_exit或process_tree确认；close协议超时不代表控制进程仍存活，browser_close为not_required也不能替代物理页面核验。8类恢复边界定点验证通过。旧清理历史不改写。

显式end在上述权限修正后返回ConnectionRefusedError：服务重启后只读inspection endpoint不重连，关闭请求仍回落到旧relay端口。继续复用已有DailyChromeExtension.endpoint与固定Playwright授权launcher（8b552173e8d767db29b8baef8f4a1f08cf7f26bf）：只有显式end使用已有主动连接入口；inspect/verify_closed继续只读。dailyWindowTransport仍核验原owner、未结束租约和稳定Profile绑定，不新建任务页面。此次仅修B-A-T的动作到既有能力映射；定点验证关闭可以刷新临时端口、只读不唤醒浏览器、已结束租约不连接。

### relay 重启后的目标身份恢复

真实显式end重连成功，但返回end_unconfirmed：原BrowserModel._detachedTabs和扩展_ownedTabs均为连接内存，重启后丢失；CDP getTargets为空，但物理页面仍在。现有持久租约保存Chrome原生targetId，缺少把这个身份交还原生关闭API的适配。

Product Alignment:
- natural-language task: 采集或后台操作结束后恢复关闭遗留页
- reusable chain boundary: 同owner离线end，不重放任务
- runtime inputs: 已核验租约的Chrome targetId
- dynamic task outputs: 同目标原生关闭及不存在回执
- generic platform capability used: chrome.debugger.getTargets和chrome.tabs.remove
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 临时relay状态丢失后按持久原生身份关闭
- existing implementation in repository: 固定Playwright BrowserModel.closeTarget、CDPOwnerScopes.check、持久AttachedWindow租约
- mature candidates and pinned versions: Playwright 8b552173；BrowserSkill 3f10983c09fcd443c7420830ab984c9d409954bf apps/extension/src/tools/tabs.ts 的chromeTabMutationApi.remove；Chrome原生debugger/tabs API
- selected implementation: 复用原CDP owner检查与原生API；仅增加B-A-T持久targetId到原生tabId的窄适配
- reused public surface: chrome.debugger.getTargets提供精确id/tabId；chrome.tabs.remove关闭并再次核验原id消失
- B-A-T-owned adapter and remaining gap: relay只对原owner已登记target允许close；扩展内部精确查id，不传私人列表到host、不按URL/标题/窗口猜归属、不attach debugger
- license/runtime/platform fit: 既有Apache-2.0 relay与Chrome扩展权限；BrowserSkill MIT源码作为原生关闭参考；Windows既有Chrome
- browser/runtime/state ownership conflicts: 不创建新目标、数据库或调度；保留原租约及原业务结果；未知/不可枚举不能确认关闭
- replay model calls: 0
- rejected candidates and evidence: BrowserSkill原tab_borrow需要人工确认且不是原BAT owner；按标题关窗口无法核验target身份；自动attach所有tab扩大权限
- focused validation: 只关匹配page、已不存在幂等、枚举失败拒绝、remove后仍存活拒绝、foreign owner在relay拒绝；实际原窗口关闭

原生依据：https://developer.chrome.com/docs/extensions/reference/api/debugger#method-getTargets 与 https://developer.chrome.com/docs/extensions/reference/api/tabs#method-remove 。不增加新的浏览器连接实现。

对抗首轮发现P1：原CDPOwnerScopes在合法session时提前返回，Target.closeTarget却按全局target路由，可能绕过目标归属。已把target检查移到session提前返回之前，补合法session携foreign target拒绝回归；3项定点通过，窄复审无新增P1/P2。扩展构建并通过Chrome原生扩展页重载，管理窗口用后关闭。

正式d8067258经正常handoff/end返回成功，sequence189、browserHandoff ended，原6目标租约ended且物理窗口消失。只读verify在旧relay无映射时可能报错，因此同owner控制进程退出证明成立、且非human_wait时仍沿原生end恢复；未知退出/人工等待保持拒绝。原先错误确认的样本d4cd0cc0与复验7c0c4bfb，依据各自首次runner审计、browser/1确定owner与process_tree确认，使用既有runtime执行一次维护关闭，未改写数据库历史；两个原租约均ended，剩余Chrome窗口仅工作台。
