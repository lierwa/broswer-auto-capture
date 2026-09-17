# 开发路线

> 开发入口：[浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。模块状态与验收要求以该方案及其模块文档为准。

## 2026-09-17 当前门：完成 A 实际页验收后才能进入 B

A 的动作身份、真实事件局部图、参数/结果、保存加载已通过单会话受控正式入口矩阵；该矩阵包含滚动、select、
dialog/modal、popup/tab、frame 重建、shadow、导航删除、重复同参与失败无事件，不再使用旧 20 动作脚本作为通过标准。
但实际 GitHub 页运行在首动作前被 provider 传输失败阻断，尚无实际页事件、数据或业务副作用。因此 A 仍未完成，
B/C/D 与组合验收不得开始。下一执行顺序固定为：一次无浏览器传输门 → 原任务实际页 A → 变化输入/状态 A → B → C → D → 组合验收。
网络阻塞及禁止的代理补丁见 [AI Connect / TUN 记录](evidence/browser-replay-repair/AI_CONNECT_TUN_TRANSPORT_BLOCKER.md)。

## 2026-09-17 历史推进：正式业务验收

R3当前运行页scope、R4条件等待、R5最小字段接口及显式摘要已完成局部真实验证。原任务阶段按 [正式执行派发](evidence/browser-use-dom-tools/MAINLINE_FINAL_RUN_TASK.md) 连续推进：原需求/计划 → 正式候选保存与sample → 同一候选换startUrl。下方旧21缺口是历史来源事实，不能当成当前源码结论；尚未把原任务标为通过。最新正式运行因沙箱listen EPERM及后续自动审批拒绝而停止，需明确外部模型载荷授权后继续，非生产编译失败。

## 当前执行入口（2026-09-16）

按 [动作还原与可靠复跑修复计划](BROWSER_REPLAY_REPAIR_PLAN.md) 执行 R1–R6，再完成原任务正式复跑及同链换输入验证。先文档、后实施；当前未完成。该入口覆盖旧阶段中“规则 JSON 待决定”“本轮结束”等过期推进指令，历史证据保留。

## 2026-09-16 当前：自然语言任务直接进入 b-u，移除独立规则 JSON

用户已明确需求对话只负责聊透需求并产出详细精准的执行任务列表，随后授权实施。此前“同源条款投影/再次确认”选项撤回，不再等待用户决定。生产 authoring 已移除 bat-compilation/v1/独立 authority 的依赖，任务文字直接进入原生 Agent；编译消费实际来源，无法证明的部分保留具体 gap，不能以空规则假通过。

本轮结果：自然来源 Python → TypeScript 保存/加载 → Python 重编译的边界验证通过；最后一次原 Issues 任务探索及来源保存通过，编译仍有 21 个缺口，候选、样本及同链不同输入均未通过。本轮按用户对耗时的反馈收敛并结束。后续工作应以这份实际来源中的字段上下文、同快照目标和效果/绑定证据缺口为依据，不能再增设用户规则 JSON；不会以扩展通用边界代替原任务验收。

执行及复用边界见 [NATURAL_TASK_IMPLEMENTATION.md](evidence/browser-use-dom-tools/NATURAL_TASK_IMPLEMENTATION.md)。上一轮 DOM 工具通过证据继续有效，但不替代本次自然入口与真实主线验收。下面历史“规则来源待用户决定”只代表当时时点。


## 2026-09-16 DOM 首批工具已验证，原主线在规则来源门受阻

D0–D4 首批工具及相关旧实现收敛完成：动作前可读结构、摘要完整性、统一当前作用域/集合解析、后态观察、正式编译与持久化加载已接入。真实 Chrome 验证了重建列表、重复区域、包装层、item 根/内部标题区别、越界零动作；同一持久化 chain 改序号后输出 Fresh Alpha / Fresh Beta，每次 4 个浏览器命令、0 模型。真实表单回归也通过。探索提供方为 scripted fixture，不是实际 provider 或主线业务验收。

M1 已用原 requirement v2 / plan v6 调用正式 HTTP 入口核验：返回 `409 missing_control_intent / structured_authority_missing`，停在探索前，模型/Browser/队列均未调用。原 Markdown 意图已明确，但现规范未允许其后生成投影直接成为执行 authority；[同源条款投影取舍](evidence/browser-use-dom-tools/MAINLINE_AUTHORITY_DECISION.md) 待用户决定。原 Issues 样本与同链不同输入均未通过；H7 不升级。

实现、验证命令与未测范围见 [清理账本](evidence/browser-use-dom-tools/CLEANUP.md)，正式入口实证见 [mainline-entry.json](evidence/browser-use-dom-tools/mainline-entry.json)。旧 patch/archive 继续隔离保留，受检历史摘要未变；未创建分支/worktree、提交、推送、安装或运行全量测试。下方交接及阶段叙述保留历史时点含义。

## 2026-09-16 当前执行顺序：前置工具 → 相关补丁整理 → 主线验收

执行入口：[DOM 前置工具开发与主线回归计划](BROWSER_USE_DOM_TOOLS_IMPLEMENTATION.md)。先按数据充足程度实现首批动作的证据交付、结构定位、集合相对定位和前后态核验；24 类是覆盖账本，缺数据的暂缓。相关旧代码在替换时按保留/重写/删除收敛，保护已有 dirty 和历史数据。工具完成后继续原 Issues 任务及同链不同输入验证。

当前会话只落文档与交接，未修改运行代码、未启动浏览器/模型、未执行测试或清理。下一会话已获实施授权，按 D0–D4 → M1 执行。H3–H6 仍未完成，H7 尚未开始；下方历史继续项不覆盖本节顺序。动作与源码证据见 [DOM 设计](BROWSER_USE_DOM_HANDOFF_DESIGN.md)。

## 2026-09-16 混合编译与 v2 接线持续开发中

**未完成，继续按 H0–H7 推进；H7 尚未开始。** 当前实现仍以受管 w-u fork 为主，宿主复用既有 TaskChain/LangGraph、版本、存储和审计。

- H0/H1：原 dirty/历史保护与 v1 零副作用退役门保持。H2：干净 188 文件基线可追溯，原 executor 两个局部缺陷已修复。
- H3：[同源离线对照与十三类问题](evidence/workflow-use-hybrid-h3/README.md) 已更新。8/38 个动作、14/59 个结构 gap 均保留；已记录 LLM definition 的 16 步不具备 action 来源，不算候选。
- H4/H5：来源绑定、稳定目标、字段效果、有界语义、条款型循环、纯输入分支、已验证线性 once 子链和输出装配已接入。9 项跨语言物化检查通过，图推进仍由现有 LangGraph 执行。
- H6 正式入口：author_task 支持既有嵌套输入合同，生成来源/候选并沿原队列做样本、换输入和授权复跑；相关正式入口及退役检查 6 项通过。原生 Agent、模型桥、脱敏 trace 与来源 artifact 已接通；旧 delegate replay 和 v1 writer/compiler 的实现已归档移出活动代码。
- H6 实际 Chrome：异步两字段表单从原生探索到候选、样本、换输入均通过；每次启用运行 4 个动作、0 次模型，禁用分支 0 个动作；验证证据在 finally 关闭后发布。模型响应为本地合成 fixture，不属于实际 provider 或真实业务验收。
- 恢复：真实只读来源恢复、页面变化拒绝、已取消恢复零动作与执行取消检查通过；表单/未决写入/人工等待不允许靠重新导航假装恢复。
- 来源/模型边界：规范化 gap 保留完整脱敏来源，模型只允许探索、判定、提取和有界语义注解；普通节点与物化不调用模型。API TypeScript 检查通过；未运行根级/全量测试。

当前继续项：完成滚动与未覆盖控制形态的准入，完成实际需求控制确认的产品衔接，收齐 H6 门后再进入 H7。未创建分支/worktree、提交、推送或清理用户历史。源码保护见 [H6 manifest](evidence/workflow-use-hybrid-h6/preserved-source.json)；实现分析见 [fork 记录](evidence/workflow-use-hybrid-h2/H3-IMPLEMENTATION.md)。

- 本轮新增：显式有界等待复用 Tenacity；原生 extract 封装与单对象字段输出修复。真实提取同链换输入结果变化，两次复跑各 2 个动作、0 次模型；相关 Python 9 项通过。
- 来源失败收尾：后续步骤失败或关闭失败保留已取得来源，closed 如实记录，零候选；正式来源/协议 5 项通过。API 类型检查通过，10 条源码归档摘要一致，本次 Chrome 专属进程残留为 0；见 [旧引用 allowlist](evidence/workflow-use-hybrid-h6/LEGACY-ALLOWLIST.md)。


- 来源重编译已接通：正式生成在编译阶段失败后复用完整且已关闭的相同需求/计划/输入来源，实际 Python 离线重编译通过；新作业浏览器会话、动作和模型调用均为 0，原来源审计保留。原生来源关闭后重编译得到相同 canonical bytes。
- 原生结构提取支持单对象及有界重复字段；旧单值 ReadSpec 的 canonical digest 保持兼容。后续动作可按输出条款引用实际已读取值，样本值不符或缺证据拒绝；两次运行消费各自动态值的跨语言验证通过。
- 当次刷新验证已完成：changed 只比较本次明确字段/标题的前后值，缺前态零动作；Tenacity 只重查事实。真实异步表单发现并修复“动作已完成后 wait 无归属”的缺口，受影响真实 Chrome 回归通过（约 23 秒）；样本/换输入各 4 动作、0 模型，禁用分支 0 动作。最新清理核查本次专属 Chrome 残留为 0。
- 普通自然语言入口仍未通过：当前 readHybridAuthority 只接受确认正文中的 bat-compilation/v1，而访谈输出普通 Markdown。是否扩展为“控制草稿随需求一起确认”已提出具体取舍，尚未改变规范或现有确认数据。H7 不冒充已开始。

## 2026-09-16 H2 fork executor 已修复，恢复推进

已按用户明确要求直接修改 w-u fork。`extract_page_content` 复用原有 extraction handler 并保留 goal/output/验证元数据；显式 ordinal 越界或非法时失败，selector/text fallback 不能绕过位置，点击前必须只命中一个元素。未指定位置保留上游行为。真实模块导入的 7 项 focused 回归通过，覆盖真实 wait/selector 方法到内存 Element.click；没有启动实际浏览器或调用模型。

此前把两个可修复缺陷作为停止 fork 开发的理由已撤销。H2 的执行器局部修复已完成；H3–H7 和正式产品接线仍未完成。下一阶段继续在 w-u fork 内做 history 规范化与动作 coverage，缺证据的动作应进入明确 gap。详情及测试边界见 [fork 修复记录](evidence/workflow-use-hybrid-h2/FORK-REPAIR.md)。下方停止结论保留为被本节取代的历史记录。

## 2026-09-16 H2 普通能力准入未通过，触发停止门

**未完成。H0/H1 通过，H2 来源门通过但复用面未冻结；H3–H7 未开始。** `vendor/workflow-use/` 已导入指定 commit 的 188 个干净文件、LICENSE 和逐文件摘要，未应用 0001–0012。原样方法探针复现 schema/executor 不一致与越界 ordinal 返回首项；真实 history 成功标志虽为 true，却没有专用逐 action 后置观察。普通执行面和区段 effect/postcondition 尚不能证明，按 ADR 0005 硬停止条件 4 停止 compiler 实现，已重做 Reuse Assessment。详见 [H2 准入证据与停止理由](evidence/workflow-use-hybrid-h2/README.md)。

保留通过的退役 gate、脱敏 fixture、干净 fork 和全部既有诊断/用户数据；不重跑网站、不续加补丁、不清理旧环境。没有把方法级探针称为包集成或真实运行通过，没有记录 H7 abandoned，因为 H7 尚未开始。下一步必须先解决 H2 普通能力与逐动作证据的成熟公开复用门，不能直接进入分类器。

## 2026-09-16 H0/H1 已通过，H2 开始

两份真实 history digest 匹配，25 个初始 dirty 文件已登记并保留。最小脱敏结构 fixture、处置与失败分析见 [H0/H1 证据](evidence/workflow-use-hybrid-h0/README.md)。v1 author/writer/compiler/replay/resume/queue/invoke 在模型准备、Python、Browser 和 capability factory 前退休；mixed 单独拒绝，v1 读取/导出保持。专用 `workflow-retirement.test.ts` 3/3 通过（内部覆盖 8 类 HTTP 命令、两种队列及子链）；API TypeScript 通过。没有运行根级/全量测试，没有真实浏览器运行、安装、提交或清理。旧 v1 正向测试与 runner/patch 仍隔离保留，H6 前不声称原子切换完成。

H2 开始核对干净固定源码与普通 executor 准入；完整 history 存在 action/result 数量不匹配，尚未证明可规范化或生成 candidate。

## workflow-use fork 混合编译路线（2026-09-16）

本路线取代下方 2026-09-15 的 workflow-use 直接接入路线。编译算法见[混合编译规范](WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)，旧实现退出见[旧路径处置规范](WORKFLOW_USE_LEGACY_DISPOSITION.md)，阶段门见[混合编译器开发计划](WORKFLOW_USE_HYBRID_COMPILER_PLAN.md)，决策见 [ADR 0005](../adr/0005-workflow-use-fork-hybrid-compiler.md)。

1. **H0 证据与处置**：保护 dirty，核对真实 history digest，生成脱敏 fixture；逐项完成旧文件/入口/数据 keep/rewrite/remove。
2. **H1 旧执行退休**：v1 author/replay/resume/queue/invoke 在进程、Browser 和模型启动前拒绝；v1 只读/可导出。
3. **H2 干净 fork 与复用面**：导入固定 workflow-use 源码、LICENSE 和来源，不含 0001–0012；先冻结 history/schema/capability 的公开复用面。
4. **H3 规范化与对照**：同一脱敏 history 对照两种上游转换；建立 action registry、NormalizedTrace 和完整 coverage。
5. **H4 混合分类**：实现需求/控制对齐、BindingDecision、因果区段和固定分类；缺 target/binding/effect/postcondition 或控制意图即 gap。
6. **H5 TaskChain 物化**：稳定节点/边/预算/canonical digest；普通节点无模型，LangGraph 是唯一图引擎。
7. **H6 原子产品切换**：protocol、provider、authoring、artifact v2、runtime、setup、resume 一起替换，活动旧引用清零。
8. **H7 最终验收与删除**：真实 LangGraph Issues、不同输入和非采集任务通过后才删除旧 runner/env/活动 patch 路径；最终硬门失败则记录 abandoned。

## browser-use / workflow-use 替换路线（2026-09-15）

本路线取代下方临时复刻 Agent Loop 的继续开发安排。具体范围见 [阶段 0 处置](BROWSER_USE_REPLACEMENT.md)，本地集成决策见 [ADR 0004](../adr/0004-browser-use-workflow-use-replacement.md)。

1. 阶段 0：只读核验、逐文件处置与草案，已完成；已有后续实施授权。
2. 阶段 1：官方锁依赖/许可证/平台；macOS 官方 lock 安装和 import 通过，0.13.10 组合失败已记录。
3. 阶段 2：AI Connect 薄模型桥及本机协议/日志隔离；真实 vision/multi-message/schema 调用已通过，Windows 仍待测。
4. 阶段 3：无害本地 Agent 完整 task、history、judge 和共享 Browser 关闭，已通过。
5. 阶段 4：两份获授权的本地上游补丁修复 prompt 和 extraction dispatch；公开生成、样本及不同 primitive 输入复跑已通过。
6. 阶段 5：非采集“填写并预览、禁止提交”任务的 Agent、生成和两个输入复跑已通过；见[补丁与兼容证据](evidence/workflow-use-local-patches-2026-09-15/README.md)。
7. 阶段 6–7：本地产品接线、旧自研新路径退出及最小合同/生命周期验证已通过；真实产品链完成样本、不同输入验证和授权复跑，状态到 `verified`。见[产品接线验收](evidence/workflow-use-product-2026-09-15/README.md)。
8. 阶段 8：新京东需求版本确认后才失效化旧 artifact、单品→样本→换 URL→完整任务。

本地补丁只维护上游原生改动和回归测试；禁止在 B-A-T 中另写 converter/executor。禁止通过 BrowserSkill 跑新 authoring/replay，禁止嵌套 Pi loop 或复制模型凭据。失败不通过重复运行掩盖。

## 临时 E1 验证接续（2026-09-15）

当前优先级暂停在链路编译之前：先按[临时预执行 Agent Loop 验证方案](TEMPORARY_PREEXECUTION_AGENT_LOOP.md)证明 `AI Connect -> Pi AgentSession -> BrowserSkill -> 有效业务结果`。保留现有技术栈，只复刻 browser-use/workflow-use 的同会话错误修复、增量业务输出和宿主最终验收；不引入 Python 运行时，不复制 AGPL 源码。

实施顺序只有三步：

1. **E1-A 聚焦闭环**：错误输出得到精确结构化反馈，模型在同一 Pi session 修正，`finish({})` 由宿主接受。
2. **E1-B 真实公开页**：使用真实 AI Connect、Pi 和 BrowserSkill 完成一个自然语言任务，保存输出与审计并清理浏览器会话。
3. **E1-C 可选来源门**：A、B 通过后只尝试一个已授权京东详情页；外部验证或频控单独分类，不反向否定 Agent loop。

A、B 未同时通过前，不继续链路节点生成、样本复跑、换输入复跑和技术栈切换评估。旧 `complete_step` 路径先隔离保留，避免临时验证破坏现有 authoring。

## 当前执行路线（2026-09-13）

2026-09-14 接续：已补齐多步骤同会话的整计划样本、换输入、一次修复重验和持久恢复，具体实现与本轮最小验证见 PROGRESS 首节。P6 真实业务门继续保留，不因本地回归通过而关闭。

当前主流程以[稳定通用任务链节点迭代说明](STABLE_TASK_CHAIN_ITERATION.md)为接续入口。架构决策见 [ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md) 与 [ADR 0003](../adr/0003-guidance-first-preexecution-and-repair-validation.md)。已确认需求先形成可组合计划，再由 Pi 在一个浏览器会话中为每个步骤探索一条代表路径；候选必须自动样本复跑，本地失败进入一次修复—验证，外部限制暂停。

文档阶段 P0 已完成。剩余六个代码与验收阶段依次为：

1. **P1 可组合计划**：先确定可复用步骤、数据依赖、代表输入及 `once`、`each`、`batch` 调用语义；不得先跑完整任务再从执行记录拆图。
2. **P2 Pi 代表路径探索**：复用 AI Connect 中用户选择的订阅模型，让 Pi AgentSession 在一个 BrowserSkill 会话内只探索每个步骤的一条代表路径。
3. **P3 稳定能力轨迹**：记录工具调用、动作后观察、业务结果和字段来源；模型只补充输入、循环、输出来源、完成条件和复用假设。
4. **P4 确定性稳定图编译器**：宿主只生成 `capability`、`llm`、`branch`、`loop`、`invoke`、`terminal` 六类节点，补齐绑定、出口和推导预算，再交给 `compileTaskChain`。
5. **P5 产品编排、恢复与 Workbench**：接入探索/可编译/样本可执行/换输入已验证四级状态，分开登录等待、技术预算和供应商错误。
6. **P6 真实浏览器验收、清理与冻结**：先核验同一 Profile 登录，再做一个京东详情代表输入、两个不同输入、一个品牌 10 个型号的同链复跑及一类非数据采集任务；最后删除所有被替代实现和过时材料。

P1–P5 已完成本轮实现与聚焦验证。P6 的非采集编辑任务已通过真实探索、样本和两个换输入验证。京东历史记录证明 2026-09-12 的已登录窗口内存在短时频控：一分钟内连续直达 11 个商品后进入 `risk_handler`，同一 URL 随后又恢复，故不是永久 SKU 封禁或直接 URL 必封；同 IP 无 Cookie 请求也排除整站式纯 IP 封禁。断电后当前首页明确未登录，当前详情失败按登录过期保留，不能冒充仍在频控。为避免继续施压站点，不再用当前 Profile 运行两个新 URL 或品牌 10 型号；京东 E1–E4 保持未通过且不要求用户处理登录或验证码。验收任务、运行证据和剩余门记录于 PROGRESS 首节；不得用非采集任务替代京东验收。现有通用 contracts、LangGraph runtime、SQLite/Drizzle、BrowserSkill、AI Connect/Pi 和 Workbench 继续保留。

下文 M1–M7、F1–F6 和阶段 0–3 只保留历史开发证据，不定义当前方案或下一动作。若与本节、ADR 0002 或重构实施说明冲突，以当前入口为准。

## 目标产品载体（2026-09-11）

后续产品以浏览器扩展作为需求、计划、本机执行与结果的主前端，Web 只承担辅助管理，Node 服务端继续承担 AI Session、凭据与数据库。迁移边界、已确认模型形态、撤回前提和真实验收门见 [产品运行架构方向](PRODUCT_ARCHITECTURE.md)。当前本地 Workbench 与 `bsk` 进程链是迁移基线，不能把计划可查看当作扩展形态或真实执行闭环已经完成。

## 公共 Agent surface 完整对齐（2026-09-10）

开发先读相邻 opencode checkout 的唯一共同规范 [`docs/platform/ai-connect-host-surface-parity.md`](../../../opencode/docs/platform/ai-connect-host-surface-parity.md)，再沿现有两个 checkout 实施；不另写第二份共享技术规范。目标是让 B-A-T 与 opencode Examples 共用生命周期投影、Timeline、Composer、模型设置和 Question 注册/答复；B-A-T 只保留任务访谈 Skill、任务事实、浏览器能力接入及主题色、助手名称、图标配置。

交付状态：

1. 私有 `interview-browser-task` Skill 保持采访业务约束，共享 authoring/Question 负责宿主注册模式的格式、校验与答复；当前 BCT 新问题启用单选和复选，均保留同面板自由补充，历史开放题继续只读恢复。
2. 在 opencode 公共包补齐统一生命周期/事件投影和 Question 契约，再由 BCT 删除薄投影并接入同一 surface；宿主不得复制共享布局或状态机。
3. 让 producer stage 与 BCT sync 在同级 checkout 默认布局及显式覆盖下可重复执行，并以同一 release manifest、内容哈希、依赖 manifest 与 lockfile 为准。当前机器的手写本机配置和一次成功同步不是跨环境通过证据。
4. 运行少量业务验收：共享包所属协议/组件测试，以及 BCT 正式业务路由中的无正文 `currentRun` 活动状态、单选/复选加自由补充、历史开放题回放、草稿确认和失败/取消链。fixture 只用于聚焦回归，不得用无合理 UI、无法回写的 fixture 或测试路由代替真实宿主验收。

前 3 项已完成；第 4 项已完成 contracts/API/Workbench、隔离生产路由、正式页面只读历史和刷新验证。当前规则变更后的弱表达自然访谈另按显式小预算验收；provider 内部 attempt 以审计为准，连续无进展或技术失败即停止。该场景只验证访谈，不启动 Plan 取证或浏览器抓取。公司 Windows/macOS 独立 checkout 的同步复现仍是交付环境验收项。

接续边界：以实际 checkout、当前分支、工作区 diff 和运行事实为准，保留两仓全部未提交修改；禁止自行创建 worktree、reset、清理或 push。先按明确文件所有权协调两仓改动，不从 HEAD 或历史机器路径重建。`domain-analysis` 本阶段只读参考。

## F5/F6 历史出口（2026-09-06）

F6 已接通完整上游输入的批量执行、持久检查点、运行结果与来源导出、独立复跑、同运行恢复核验和独立修复授权；SQLite v7 保存运行历史与步骤消耗。普通节点无模型入口，实际末页与字段证据决定覆盖结论。当前海尔真实完整验收暂停在分页交互，已保存的258个目录链接不等同于完整三步骤产物。具体证据见 PROGRESS、RESEARCH R-013。

该记录不再是当前接续指令。海尔末页、详情/派生、独立复跑/恢复/修复、旗舰店和第二站点只作为历史待验收范围；是否继续必须等通用合同、唯一运行器和浏览器适配器完成迁移，并从当前运行记录重新核对。不得重复启动或重置旧消耗。

## 历史接续顺序（2026-09-06）

本节记录 F2–F5 当时采用的分阶段验收与交接方法。当前执行顺序已经由本文开头的 M1–M7 取代；项目命令始终按根 `AGENTS.md` 在实际 checkout 执行。

原型先作为布局基线，转入具体功能开发。统一入口见 [DEVELOPMENT_BASELINE](DEVELOPMENT_BASELINE.md)，每项功能同时覆盖 [UI_STATES](UI_STATES.md) 中对应的正常/等待/失败/恢复界面，不再单独无止境地打磨静态原型。下表连接既有阶段编号，不替换已经通过的原型证据。

| 切片 | 依赖 / 对应阶段 | 用户可得到的结果 | 完成门 |
| --- | --- | --- | --- |
| F1 任务与需求访谈正式化 | 现有多任务访谈；继续 S0-09 | 既有对话、草稿和确认在正式本地服务中可靠保存与继续使用 | 正式 API/事务；旧文件可重复迁移且保留原件；多任务隔离；取消/失败/刷新/进程恢复无伪成功；界面回归不倒退 |
| F2 受控浏览器能力 | F1；S0-10 | 服务能在限定任务和权限下观察真实页面 | 语义目标重新定位、单浏览器任务互斥、访问受限转人工、finally 回收、实际命令和模型用途审计 |
| F3 任务计划按需来源取证 | F1、F2；阶段 1 | 已确认需求在计划需要时取得真实入口、代表页证据、访问条件和覆盖缺口 | 查询/候选/观察归入 PlanRecord.evidence；登录通过 request-help 转人工并恢复同一计划；关键缺口可回访谈 |
| F4 单一计划与授权 | F3 能力内聚；阶段 1 | 同一版本内形成 evidence 与 proposal，审阅范围/预算后独立授权启动 | 需求版本/revision 与证据摘要绑定、步骤依赖、失效复核、防重复启动、持久队列与单浏览器执行 |
| F5 探索、链路与验证 | F2、F4、既有引擎；阶段 1 | 逐任务步骤真实探索形成受控动作图，并在新输入上验证 | 普通节点不隐式调模型、DSL 编译、条件/循环/终止、人工等待恢复、节点类型和真实运行状态 |
| F6 执行、结果与生命周期 | F5；阶段 1 → 2 | 授权范围内真实结果、覆盖/缺口、独立复跑、同运行恢复与修复 | 来源关联、检查点、去重、漂移暂停、修复授权、新版本验证、完整旗舰店与第二站点验收 |

### F1 已实现（2026-09-06）

- 输入：现有 taskContract/interviewContract、TaskService/InterviewService、useTasks/useInterview、官方模型 adapter 与已通过的 62 项测试；先查看实际 checkout 和差异，不从旧 HEAD 重建原型。
- 实施范围：本项目正式本地 API、SQLite/Drizzle 持久边界、workbench 接口适配和所属测试。沿用已采用的模型、登录、私有 skill、AI Connect React 完整对话界面、Radix 与 React Flow。
- 业务优先：保留任务、用户原文、轮次、建议/决策、待决事项、草稿版本及确认/失效语义；Decision/Unresolved 的具体表结构按当前业务不变量设计，不照搬相邻项目的商品领域。
- 迁移和恢复：保留旧 JSON 原件，验证重复导入、失败回滚、取消后不提交草稿、服务重启后无永久 active；只对实际失败或缺口修复，不重写已正确工作的聊天交互。
- 验收：协议与迁移测试、正式 API 集成测试、既有页面回归；普通测试使用替身。必要的真实模型验收另计用途和调用审计，不能用模型调用替代故障测试。
- 出口：能通过正式路径新建任务 → 持续访谈 → 审阅/确认草稿 → 重启继续，保留当前界面和历史。更新 PROGRESS 后交付此切片，再推进 F2/F3，不顺带重做全站或声称真实抓取已完成。

F1 已完成本地 API、事务、迁移、生命周期与界面验收，当前证据见 PROGRESS；F2–F6 继续按上表依赖实施。服务/数据库驱动的具体兼容性以 RESEARCH 和 PROGRESS 的实测为依据。

### F2 已实现（2026-09-06）

受控 BrowserSkill adapter、正式 API 内部 BrowserService、SQLite 浏览器运行事实和来源页状态已接入；语义刷新、有界就绪观察、单浏览器互斥、版本校验、停止/受限/异常回收及命令审计已验证。当前没有公开的任意命令或任意 URL 执行接口，调研启动与来源产物由下一 session 的 F3 接通。真实证据范围是本地夹具的导航、语义按键/点击及回收，完整商店与第二站点仍属于后续阶段。

### F3 已实现（2026-09-06）

> 本节记录迁移前的独立 Research 实现证据；现行产品入口已把该能力并入 Plan，历史 API 和页面不再是当前合同。

正式调研API与SQLite v4已接通。模型通过受控判断选择查询或真实候选，BrowserService执行观察；来源版本绑定已确认需求，查询/候选/观察/覆盖/缺口分别保存。来源页正常、受限、失败、停止、刷新、详情与带证据回访谈已验收。真实品牌需求完成搜索→海尔官网冰箱目录→代表详情，结果partial保留实测缺口；不代表全目录抓取。证据和边界见PROGRESS、RESEARCH R-010。下一session只实施F4，之后继续全新F5、F6 session；仅本地提交。

### F4 已实现（2026-09-06）

> 本节记录迁移前 Plan 消费独立 ResearchRecord 的实现证据；现行 PlanRecord 直接拥有按需证据与 proposal。

正式计划 API、版本化步骤与完整需求/来源绑定、字段/目标/缺口映射、预算与终止规则、用户独立确认授权、持久 FIFO 队列及单浏览器授权入口已接通。真实 F3 partial 来源形成三步可审阅计划，说明字段按已确认规则派生，全量枚举作为执行责任保留。授权后默认排队等待 F5 的 PlanExecutor，不代表已有抓取结果。验收、失败修复和限制见 PROGRESS、RESEARCH R-011。下一全新 session 只实施 F5，完成后再交给全新 F6；本地提交，不推送。

## 阶段 0：产品基线与组件验证

- 固化需求、术语、授权门和验收范围。
- 调研成熟的编排、持久化、浏览器调用和模型接入组件，记录官方资料、维护与许可证、TypeScript 支持、本地能力、部署依赖、安全、测试和退出成本。
- 通过最小原型验证生成链路、异步节点、循环、进度保存、显式模型调用和 Windows 安装约束；验证后形成架构基线。

### 本阶段执行任务

| ID | 依赖 | 文件范围 | 产物 | 开发模型 | 验证门 |
| --- | --- | --- | --- | --- | --- |
| S0-01 | 无 | 根目录、`.codex/`、`AGENTS.md` | workspace、工程规则、角色配置 | Astra high（主控） | `git status`、配置静态核对 |
| S0-02 | S0-01 | `packages/contracts` | 受控链路、节点、运行审计 Zod 契约 | Sol high（开发子 agent） | 契约单测与 `tsc --noEmit` |
| S0-03 | S0-02 | `packages/runtime` | LangGraph 普通节点循环、取消和恢复原型 | Sol high（开发子 agent） | 零模型审计、恢复和取消测试 |
| S0-04 | S0-01 | `apps/workbench` | Token、Radix/React Flow 工作台流程样例 | Sol high（开发子 agent） | Vite 构建、浏览器可操作性检查 |
| S0-05 | S0-03、S0-04 | `docs/development/*` | 选型结论、架构基线、阶段证据 | Sol high | 组件原型与 Windows 启动核验 |
| S0-06 | S0-01 | `README.md`、`AGENTS.md`、`docs/development/{ROADMAP,RESEARCH,PROGRESS}.md`、`.codex/config.toml`、`.codex/agents/*.toml` | 开发期 Astra/Sol 模型规则与角色配置同步 | Sol high（开发子 agent） | 静态一致性检查；实际 `turn_context` 核验 model/effort |

该表中的 Astra/Sol 分工是阶段 0 的历史安排。现行规则以根 `AGENTS.md` 为准：只有主 agent 使用 Astra 时，开发执行子 agent 才使用 Sol high；其他情况保持当前或用户明确选择的模型与 reasoning effort。产品运行时模型路由不变。

### 阶段 0 补充验收任务

| ID | 依赖 | 文件范围 | 产物与复用组件 | 开发模型 | 验证门 |
| --- | --- | --- | --- | --- | --- |
| S0-07 | S0-01、R-014现行实现核验 | `apps/api/src/ai/**`、`apps/api/src/interview/**` | AI Connect 账号选择、结构结果、typed event 与访谈流 | Sol high；Astra high集成 | API focused、typecheck、真实账号模型 smoke 与中断后进程退出 |
| S0-08 | S0-02、S0-03 | `packages/runtime/**`、`packages/contracts/**` | LangGraph检查点/XState对照、真实调用边界审计；受控图校验 | Sol high；Astra high评审 | 25步以上循环、外部AbortSignal、独立运行/恢复隔离、调用审计拒绝伪零、跨进程恢复 |
| S0-09 | S0-07、S0-04 | `apps/api/**`、`apps/workbench/**` | Fastify流式聊天与AI Connect React受控投影；用户会话事实源 | Sol high；Astra high集成 | 浏览器发送真实需求、收到流与已校验结果、取消不提交、重载保留会话 |
| S0-10 | S0-08、S0-09 | `packages/browser/**`、原型测试 | BrowserSkill受控命令边界、会话回收与权限 | Sol high；Astra high评审 | 限定session、语义定位刷新、登录/验证码暂停、零模型命令审计 |

当前引擎已验证固定函数图、SQLite跨进程检查点和受控网关事件审计；尚未实现产品DSL编译与真实浏览器恢复。负责人同意原型先保留并转入功能开发，不表示所有状态已视觉签核。S0-07 的旧 App Server probe 已由 AI Connect focused 验证替代；正式 API/事务与生命周期沿 S0-09 继续验收。阶段0关键门均有证据后作选型评审；不将普通循环原型的0次网关事件称为真实站点零模型复跑。

## 阶段 1：完整本地用户流程

- 以 PRODUCT_FLOW.md 的九阶段、产物归属和失败回路为实施基线；阶段顺序不限制 UI 查看。
- 先接通持续访谈、决策/待决事项、版本化草稿与独立草稿确认；S0-07 单轮接入 probe 不代表访谈产品通过。
- 再接通基于确认草稿的一次 Planning Run：按需完成真实来源搜索、代表页面、访问条件和覆盖证据，再形成任务计划；缺口带证据返回需求讨论。
- 然后接通授权队列、逐步骤动作探索、任务链路生成与新输入验证、完整执行、人工等待、复跑及恢复。
- 提供链路查看、自然语言修改、版本记录、受影响链路暂停及用户发起修复。

### 本轮 UI 设计修订

现行范围：需求与流程文档、Workbench 对话/Plan 界面、本地 Fastify API、AI Connect 项目模型选择及所属测试；访谈、Plan 取证和链路/采集共享同一模型端口，不修改相邻项目。
产物：AI Connect React 连续时间线与 Composer、正式访谈协议、版本化 Markdown 草稿与侧栏/抽屉审阅、本地多任务独立保存与旧单会话迁移、任务搜索/重命名/归档恢复、四视图上下文保持，以及 Plan 内阶段/证据/proposal 的单一投影。全工作台的主层、折叠、侧栏、抽屉与短弹窗清单见 WORKBENCH_LAYOUT.md。
验证：API/Workbench focused、类型检查与生产构建；真实多轮访谈、纠正/草稿确认/恢复；浏览器检查连续消息、文档层级、视图保持、节点选择、主题与窄屏。真实账号模型与完整业务浏览器验收仍单独设门。

## 阶段 2：真实来源验收

- 完整处理一个京东旗舰店的冰箱商品与每个页面前 100 条评论。
- 在新的输入上冻结链路复跑，核对数据、终止原因、耗时和模型调用记录。
- 通过第二个不同结构的公开站点任务验证适用范围。

## 阶段 3：交付与接入评估

- 验证 Windows 安装与运行说明、数据导出和必要的运行恢复。
- 根据真实证据决定后续规模与平台支持，以及 `domain-analysis` 的集成边界。
