# 技术调研与复用结论

本文件只保留当前选型和仍有效的边界。阶段进度见 [PROGRESS](PROGRESS.md)，执行顺序见 [ROADMAP](ROADMAP.md)。

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

最初调研先后把问题误判为“只缺自动布局”和“需要容器/子画布编辑器”。进一步从 TaskChain 事实源和节点编辑闭环核验后，正确边界是：链路只有一套真实动作节点与边；用户阅读层新增版本化**链路阶段**，总览只显示阶段，单击只附着一个临时动作摘要，进入阶段才在同一画布聚焦真实动作子图。子路径不常驻，也不应被塞进撑大主图的阶段容器。

仓库已经使用 `@xyflow/react@12.11.6`。其公开节点、边、Handle、选择、重连、视口和 MiniMap 足以覆盖阶段总览与聚焦子图；两个层级分别布局后，不需要 React Flow `parentId` 的复合 sub-flow。`@dagrejs/dagre@3.1.1` 为 MIT，含 TypeScript 声明，直接依赖 `@dagrejs/graphlib@4.0.5`；npm 元数据的 unpacked size 分别约 1.41 MB 与 0.47 MB，约 1.9 MB 不是浏览器最终 bundle，也不是启动时解包 8 MB。Dagre 只在首次投影、结构改变或用户点击“整理布局”时计算坐标，不在每次渲染运行。

FlowGram.AI 与 Coze Studio 仍是有价值的产品参考，但不作为生产编辑器依赖。官方 free-layout loop 示例用 `isContainer` 建立容器；`toggleLoopExpanded` 在折叠/展开时改变容器尺寸并隐藏/显示子节点和连线。这正是当前产品拒绝的“大容器内常驻子画布”结构。FlowGram 的 editor/document/form/history/variable 等广泛状态所有权也会与 B-A-T 已有服务端 revision、checksum、digest 和持久化事实源重叠。ELK 对阶段总览与单阶段聚焦这两张派生布局没有 Dagre 之外的已证实价值，因此本轮不引入。

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
- capability: 正式 execution 所属资源的可靠清理与恢复；带阶段总览、同画布聚焦编辑和单次 execution 实时运行态的链路工作台。
- existing implementation in repository: ChildProcess/browser-use owner/Windows PID 树终止/临时目录清理；`@xyflow/react@12.11.6`、revision draft layout/checksum/digest、TaskRun 持久化事件。
- mature candidates and pinned versions: 保留现有 runner/browser 公共面；`@xyflow/react@12.11.6`、`@dagrejs/dagre@3.1.1`；FlowGram 1.0.14 与 ELK 仅为对照候选。
- selected implementation: 现有 runner adapter 增加结构化 cleanup report；UI 保留 React Flow，以 Dagre 分别布局阶段总览和聚焦动作子图。
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
