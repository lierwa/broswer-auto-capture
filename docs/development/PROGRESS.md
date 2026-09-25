# 开发进度

当前开发入口为 [浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。架构边界以
[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md) 为准。

## 当前状态

### 2026-09-25 新标签恢复接入与新任务验收进行中

- 沿用 `master@7d590363` 当前 checkout，保留既有 dirty work；未创建 worktree、reset、clean、提交或推送。正式 Workbench/API 仍在本机运行。旧《凡人》任务的脚本修订成功记录仍不是首次正确编译的产品验收。
- 将实验项目已验证的 `PopupResumeAdapter` 行为接入本项目单个受管 Browser owner：`Browser.start()` 后、业务动作前安装，对新 page session 在原 B-U attach 回调前有界恢复；owner 清理时恢复原回调。没有注册第二个 CDP attach handler，也没有改实验项目或 site-packages。
- 定点 Python 测试 `test_popup_resume.py` 3/3 通过：`waitingForDebugger=false/true`、超时与短命会话、原回调和清理失败时的还原。B-A-T 自身 headless Runner 的本地 Enter 新页样本：153.1 ms 返回、`enter_error=false`、新增 1 页、恢复 2/2、能力与浏览器清理均 confirmed；证据为 `work/recovery-20260925/popup-smoke-result.json`。这只关闭本地新页恢复样本，不代表《凡人》正式准备已通过。
- 原有动态候选门的聚焦测试 `test_execution_dynamic_selection.py` 10/10、`test_author_callback_stop.py` 6/6 通过；仍只证明拒绝缺少完整候选读取的来源。正式新任务还未开始。启动前 `verifyForkSource` 查出 6 份已有本地改动的清单摘要滞后，需在审查源码后同步，不能绕过校验或盲目整跑。

### 2026-09-24 最小闭环恢复实施中（正式退出门尚未通过）

**截至本轮最新结论：** G11 新建需求至手动发布和正式复跑主线、G9 当前 provider 搜索与来源确认、G12 建议接受至新版手动发布和复跑，均已有正式 UI／API／持久化／重启证据。
G12“不采用”、过期和验证失败的正式 UI 门仍未通过；整体尚未完成。用户后续明确要求本轮不关机。下文较早的“待验”记录是当时快照，以后续分节为准。
当前没有真实待拒绝反馈；过期只能通过非中性的用户 review 改变证据，不能伪造满意事实；验证失败没有真实失败条件，不能为了制造证据故意破坏 V2。
最新《凡人修仙传》任务的修订由开发脚本直接调用草稿 API 完成，没有走产品提供给用户的修订入口；技术运行记录保留，但该任务从新建到失败修订的产品闭环**未通过验收**，详见文末取证。

本轮在现有 `master@7d590363` checkout 保留原有 dirty work，不建 worktree、不重置、不提交。启动本轮 API/Workbench 服务前备份了 v17 SQLite；正式 API 启动后迁移为 v18，工作区序号改为事务内单调递增。未改访谈或规划 prompt；用户随后单独授权新增 G12 调整建议 prompt。验证只跑受影响包的类型检查和定点测试，未跑全量测试。

- G1 当前京东任务 `695bc458-95df-410c-8cd0-e540035d98c8`：正式画布可打开无图失败侧栏，展示计划层准确路径和四份原始候选；第 4 次定向纠正仍因 `products` 整体集合缺少归属失败，达到本轮上限。API `stateSequence=2508`；SQLite job 为 `failed/forming_plan`、`browserRunId=null`、4 份候选，草稿/发布/执行均为 0。没有进行 Browser-Use 试做。证据见 `work/recovery-20260924/03-precise-plan-diagnostic.png`、`04-last-plan-correction-submitted.png`、`05-plan-correction-limit.png`、`formal-g1-current-task.json` 和 `g1-sqlite.json`。此任务不能记作完成。
- G1/G2/G9：计划候选和精确问题保存到原 job；只在可核验原候选时按同一 job 继续纠正。访谈搜索扩展事件接入共享 Timeline，业务调研与来源选择分开；相关类型检查和定点测试通过。本轮新建 Python 页面任务由用户提供准确来源，访谈无需搜索；真实 provider 搜索仍未验。
- G11 新建任务 `d104df47-a2bf-44d1-9500-c04356ff062a`：同一正式页面确认需求 v1 后生成合法方案。首个准备 job 因受管 workflow-use 本地改动的登记摘要滞后，在启动浏览器前失败；更新三处清单摘要并经 `verifyForkSource` 核验后，页面“沿已保存方案继续试做”从原方案启动新 job，旧失败记录保留。真实 Browser-Use 来源 `1bc2f1da-72dc-41bb-8fbe-b5035f803fe0` 已关闭且 `sourceSuccess=true`；编成唯一草稿，sample `42b9d7ef-0fc1-4d20-818e-d225954f4d2a` 和后续独立 verification `322be064-25d7-4446-8888-0d7b0237969e` 均完成，清理确认。页面手动发布 Release `4ee2ea37-81df-45fe-8996-aaea4e16d2a1@1`；正式运行 `bbc120f6-1cf7-4c98-88d2-009c38714918` 与 `45875efa-fc63-46fb-871d-040f949e7b40` 均完成、清理确认。四次运行各 3 个浏览器命令、0 次 TaskRun 模型调用，业务输出摘要一致；发布后活动草稿为 0。API／SQLite 摘要在 `work/recovery-20260924/g11-acceptance.json`，正式截图同目录 `g11-g11-explicit-*`。此任务无可变输入；不同输入门不适用。API 服务重启前后 `g11-before-restart.json` 与 `g11-after-restart.json` 的 SHA256 同为 `C19FAFD7DCB03F309699D55843BBEDBDCC4EB8352C01B9190E1CA8E36419E466`；同一未刷新的 UI 页面仍选中该任务并显示 Release V1、当前结果及调整错误。此项 Windows 最小主线和重启复核通过，G12 与其他失败门仍独立待验。
- G10/G13/G14：正式历史面板列出该任务四次运行，选中较早的正式运行显示已发布 V1、清理确认和该次 15 条节点事件，当前画布仍绑定原运行；页面顶部现显示当前发布 V1。编译失败恢复只接受已校验来源并走离线编译，缺失来源时停止；计划已合法但浏览器启动前受管源码失败的恢复已由本轮新任务正式走通。服务端发布门要求样本试跑和后续独立复验。G12 完整调整验收仍待完成。
- G12：已实现保存反馈与精确运行证据、结构化模型建议、差异确认和接受／拒绝／取消／过期边界；用户授权的专用 prompt 已加入。正式页面在新 Release V1 的已选动作提交一次“重名动作改名”说明，原发布和执行均未改变；首次真实模型建议因 `ai_generation_failed` 停在生成层，未形成候选或草稿。已定位当前 JSON Schema 为 336,580 字节的全量操作联合结构，正在缩小模型传输合同并保留服务端完整操作校验；建议、接受、新版验证／发布尚未通过。

### 2026-09-24 G12 后续正式闭环证据（上段为此前失败快照）

- 失败建议 job `b8a57468-f2f0-4172-8e1d-56108e1b9940` 的原反馈和运行证据保留；正式页面从该记录发起离线恢复，形成待确认候选 job `a2f0e1a2-3a01-41c4-874a-35db46798e4a`。接受前活动草稿为 0；用户确认差异后才产生唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9`。候选记录保留 `recoveredFromJobId`，没有在建议生成时改写 V1。
- 新草稿 sample `c5bb324c-9720-45b7-8c2c-6c9b86b42fcc` 与独立 verification `e165c0be-ccbe-4ac7-8c29-028d28ab93dd` 均 `completed`、cleanup `confirmed`。正式 UI 手动发布 Release `930d7739-f6f7-4ad7-8984-93fd3f3f5bfe@2`，digest `a00284bdb02a13a34e2c1de1f6d8e59da8266670967ba621a14aedbc0343f33b`；新版正式运行 `57193eb7-6b1f-43d5-82a6-e5a585dbf01f` 也 `completed`、cleanup `confirmed`。V1 原发布和此前四次执行保持可读，发布后活动草稿为 0。
- `work/recovery-20260924/g12-acceptance.json` 汇总七次执行：各自 `modelCalls=0`、`llmCalls=0`，输出 digest 均为 `7a5808fac2bce36b837bfaef3673b44eb15e7207fba861c4af9a079a7ca7623b`。`g12-before-restart.json` 与 `g12-after-restart.json` 的 SHA256 同为 `11D3469DFC73645741F76564C21FE1233DA3130D839BA16F7742852BBD4E6851`；正式页面的候选、接受、双次试跑、发布、运行和重启显示见同目录 `g11-g12-*.png`，亮色桌面与亮／暗色 390px 截图见 `g11-g12-v2-light.png`、`g12-v2-light-390.png`、`g12-v2-dark-390.png`。
- 本次建议实际只改 `output-assemble` 节点的 `label`：V1/V2 的该链节点数同为 5，变更字段仅为 `label`，执行输出一致。因此只证明自然语言建议经用户确认、验证、手动发布和再次运行的产品流程，**没有证明原链路的行为问题已修复**。G12 拒绝、过期和验证失败路径的正式 UI 验收仍未完成；G9 当前 provider 的真实搜索仍未验。不得据此宣称五组工作包或全部退出门完成。

### 2026-09-24 G9 当前 provider 搜索正式验收（上段 G9 待验为此前快照）

- 正式 UI 新任务 `882f4bb3-7a58-4986-b633-83f4c5769dd4` 从没有 URL 的自然语言需求开始。Pi 实际调用 `web_search`，再调用 `present_source_candidates`；持久化 `messages.aiEvents` 中两项 `tool.execution.completed` 均保留原始 `output.content` 与 `output.details`。搜索 query 为 `site:docs.python.org "What's New in Python 3.14"`，候选提供方记录为 `pi-web-access:web_search`。这验证了当前 provider 的一次真实只读搜索及共享 Timeline／来源候选接线，不能推广为所有 provider 或所有搜索情形均通过。
- Question Panel 展示 1 个官方候选；用户选择 `source:009bfe70f430076c645b`，URL 为 `https://docs.python.org/3/whatsnew/3.14.html`，随后又确认要读取首个实际正文段落。Requirement `a34888db-4de3-4f92-85b4-cbd1b1faeae8@1` 已确认，确认事实含 1 条所选搜索来源，`taskContracts` 中该任务只有 1 条需求记录。正式页面证据见 `work/recovery-20260924/g11-g9-*.png`。
- `g9-before-restart.json` 与 `g9-after-restart.json` 的 SHA256 同为 `367C12B25E5860A0C273CD20370D4AB00301ED2FE89E5ED2736DBF6807733240`。该 G9 专用任务没有准备 job、草稿、发布或执行；不能作为任务链生成与复跑验收。可选 `summary` 和凭据分支尚未正式验证，G12 拒绝／过期／验证失败等退出门也仍独立待验。

### 2026-09-24 恢复顺序与交互原型（仅文档／原型，产品未修复）

[能力对齐与恢复基准](PRODUCT_LOOP_CAPABILITY_AUDIT.md)已按用户复核补齐：Browser-Use 试做失败时尚无链路，技术问题先在授权范围内有界排查；代表试做成功、编译成链路、复跑验证通过、用户发布是四个不同的结果；已有链路出错才从步骤或结果提出修改、确认差异、试跑并手动发布新版。第 8 节把全部待办分成五组并写明用户效果与正式退出证据。`work/prototypes/repair-flow-v1.html` 为隔离交互原型，三情境与 11 次按钮流转经独立 Chrome 检查；它不连接产品运行。

本轮没有改产品代码、prompt、模型设置或持久化数据，没有重跑 Browser-Use 或正式任务。2026-09-22 审计计数与进程 ID 仅为当时快照，实施前须重新核对。最新任务的正常路径和自然语言调整均仍未通过正式产品验收。

### 2026-09-22 新建任务能力对齐审计（最小闭环未通过）

当前依据为 [需求到复跑：能力对齐与最小闭环缺口](PRODUCT_LOOP_CAPABILITY_AUDIT.md)。本次核验了实际 checkout、用户服务、SQLite、固定 AI Connect/Pi 公共能力和最新任务正式页面；没有修改产品实现、prompt 或用户任务，没有重开模型/B-U/正式复跑。

- AI Connect 的模型绑定、Authoring、Question、共享 Timeline/Composer 仍在；Pi 搜索 extension 实际注册成功，但本次未验联网搜索。共享 Timeline 调用缺少 extension adapter，搜索事件即使存在也不能据此认定用户已看见。
- 最新需求 `695bc458-95df-410c-8cd0-e540035d98c8` 确认后，准备 job `816f32af-8790-4e06-89f2-8b552bf856eb` 在 `forming_plan` 失败；两份 JSON 候选均违反结果所有权合同，`browserRunId=null`。该任务没有草稿、发布或执行，不得说成浏览器跑过但未完成。
- 正式 UI 实测无图失败态点击状态后处理面板仍未挂载，也没有生成/恢复主操作；另有快照序号可能回退、失败诊断缺失、任意调研被强制归入来源选择等代码确认的缺口。证据在 `work/capability-alignment-20260922/`。
- 旧链编辑、试跑、发布、运行及重启证据保留为局部通过，**不覆盖全新需求或不中断 UI 的连续生命周期**。此前“Windows 全链路完成”结论撤回；本轮新建任务闭环未通过，macOS 仍未测。

下一步按审计 G1–G8 恢复需求入口、计划/准备与失败处理，补齐 G9–G11 引用、按需历史和正式新建任务验收；仍以一个草稿、用户手动发布、同次 execution 为边界。

### 2026-09-22 工作台与生命周期减法（历史局部验收；不代表新建任务闭环）

Product Alignment:
- natural-language task: 把已确认需求生成、编辑、试跑、手动发布和正式运行收敛为两页工作台与一个活动草稿
- reusable chain boundary: Requirement、TaskDraft、Release、Execution；计划、链路和展示只作为草稿或发布内容
- runtime inputs: 当前需求、草稿 revision/checksum、试跑或正式运行输入与本次 pacing
- dynamic task outputs: 草稿内容、execution 事件与结果、用户手动冻结的不可变 Release
- generic platform capability used: 现有 Zod、SQLite/Drizzle、LangGraph TaskChain runtime、React Flow 与 Dagre
- replay model calls: 0，显式 llm 节点除外；本轮不重跑 B-U 探索
- site/task-specific code added: no

Reuse Assessment:
- capability: 单一活动草稿、显式发布、execution-owned 候选快照、当前工作区最小读取与按需历史
- existing implementation in repository: 当前 immutable plan/chain/release、execution 审计、revision 操作、React Flow/Dagre 与 SQLite 迁移
- mature candidates and pinned versions: 沿用仓库已固定的 Zod、Drizzle/better-sqlite3、LangGraph、@xyflow/react 和 @dagrejs/dagre
- selected implementation: 在既有持久化与运行边界上收敛所有权，不引入新框架
- reused public surface: Zod 边界校验、SQLite 事务、TaskPlanExecutor、TaskChainRuntime、React Flow 画布与 Dagre 布局
- B-A-T-owned adapter and remaining gap: TaskDraft/Release/Execution 绑定、手动发布门、最小快照、旧数据迁移和工作台组合
- license/runtime/platform fit: 不新增依赖；沿用当前 Windows 已验证依赖，macOS 仍需真实设备补验
- browser/runtime/state ownership conflicts: 每次产品运行仍只占用一个浏览器会话；草稿试跑冻结 execution-owned snapshot
- replay model calls: 普通试跑与正式复跑为 0；只有显式 llm 节点可调用模型
- rejected candidates and evidence: 不新增第二套状态机、图存储或前端版本资产；现有能力已覆盖核心运行和画布需求
- focused validation: 每层完成旧调用删除后只运行所属契约/服务/UI 最小验证，最终用正式页面、API、SQLite 与重启复核

- 四个事实源已经落地：普通工作区只返回 `requirement / draft / release / execution / activity` 及并发序列；历史和诊断分别经 `/api/task-chain/history`、`/api/task-chain/diagnostics` 按需读取。TaskDraft 每任务至多一份，试跑冻结 `taskExecutionCandidates`，Release 自包含计划、链路和 Presentation；保存、试跑均不发布，只有 `publish_task_draft` 可调用显式发布。
- 公开命令已收为准备/继续准备、保存/试跑/发布草稿、运行、恢复/清理/取消和用户反馈。旧 `generate_plan / author_task / generate_chain(s) / validate_* / authorize_* / set_execution_pacing`、preset/saveAsDefault、独立 repair coordinator 与兼容退休分支已清退；生产代码零引用。`Plan.tsx`、`Results.tsx`、`ChainView.tsx`、`TaskRunDialog.tsx`、`useTaskRunner.ts`、`AuthoringStatus.tsx`、旧产品投影/任务链投影及无调用辅助文件已删除。
- SQLite v17 在真实 v16 一致备份及正式库均迁移通过：7 个旧 Release、41 次旧 Execution、活动旧修订草稿和 21 个 execution-owned candidate 保留；Release 形状迁移后的历史 Execution 精确引用同步，旧 `repair` nextAction 归一，摘要错配为 0。`taskRunPresets / taskChainRevisionDrafts / taskChainPresentations` 已删除，WAL 保持启用。
- 定点质量门：contracts/API/workbench 三包 `tsc --noEmit`、Workbench 正式 Vite build 通过；34 项草稿/发布/清理/迁移/目标选择/画布投影/按需读取测试全部通过。未运行根级全量测试；Workbench 既有 `draft-projection.test.ts` 有一项与本轮未改动的需求 Markdown 投影基线失败，未伪报全绿。
- 正式页面验收证据为 `work/workbench-simplification-1790027862673/acceptance.json`、`01-four-stage-canvas.png`、`02-completed-execution-history.png`。页面只有“需求对话 / 链路画布”；1440×1000 下文档和 body 高度均为 1000、画布高 864，无主页面纵向滚动；总览 4 阶段，逐阶段展开为 5/2/2/2 共 11 个动作，普通页面无内部 ID/digest/空业务输入框，UI errors 为 0。
- 正式生命周期只执行各一次：页面拖动动作使草稿 revision 12→13 且旧试跑立即失效；sample Execution `33e1c2a2-9ecc-413f-8a71-549412767dce` completed / cleanup confirmed / modelCalls=0，Release 仍为 7；页面显式确认发布后只新增 Release `03736efa-01d5-494b-8fad-85e94234f452@8`；正式运行 `2d3a8012-a0d2-4f93-8869-66a94881ec6c` completed / cleanup confirmed，36 条事件全部属于同一次 execution。最终为 8 个发布、43 次执行、0 个活动草稿，试跑 candidate 永久保留。
- 重启证据：验收服务 PID 1108 优雅退出，PID 12096 从同一 checkout 重启；删除最后一个零调用 `exploration-reuse.ts` 及四个零调用 repository 辅助方法后，再由 PID 21304 加载最终代码。两次重启后 Release v8/digest、两次新 Execution、正式运行 sequence 46、36 条事件、试跑 candidate revision 13、8/43 计数均未变化，浏览器 profile 状态为 closed。未修改 prompt、未重开 B-U 探索、未创建 worktree、未 reset/clean/commit/push；checkout 仍为 `master@7d590363` 并保留用户既有 dirty work。
- 以上 Windows x64 的正式页面/API/SQLite/重启证据仅覆盖所列既有草稿和发布链路；新建任务闭环未覆盖且已发现阻断，见本页最新审计。macOS arm64 本轮没有真实设备证据，不能宣称跨平台完成。技术完成不代替用户对业务结果的满意验收。

### 2026-09-22 工作台减法梳理（仅文档，未实施）

用户要求先梳理文档、做减法。本轮误启动的页面与发布逻辑修改已停止并撤回，保留此前工作；不以本轮撤回前的测试声称交付。最新基准见 [工作台与任务生命周期减法基准](WORKBENCH_SIMPLIFICATION.md)：不仅删除可见冗余，还明确四个产品事实、全量协议瘦身、自动发布移除、旧命令清退、服务端/持久化职责合并、死文件删除、迁移和正式验收顺序。当前仅完成文档，代码尚未按该基准实施。

### 2026-09-22 03:04 节点修订交互与验证含义修正（Windows 编辑与单次试跑通过）

用户复核指出修订区仍暴露内部节点 ID、digest 和整链连线表，且无参数链显示空输入框及“验证不同输入”，不符合节点选中后右侧编辑的产品交互。当前正式 chain v2 的输入合同为空对象，剧名为节点固定值，因此不能把验证框描述成更换任务/动漫的入口。

Product Alignment:
- natural-language task: 在画布选中动作后修改输入和动作设置、查看输出、增删动作及调整后续路线；明确试跑范围
- reusable chain boundary: 现有 TaskChain 与 ChainPresentation 的原子修订；发布版和草稿仍严格分开
- runtime inputs: 只展示已定义的任务参数；节点固定值、上游输出绑定沿用现有 ValueBinding
- dynamic task outputs: 版本化草稿编辑及真实完整试跑记录
- generic platform capability used: 现有 React Flow、Radix、ValueSchemaForm、revision API 与编译器
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no

Reuse Assessment: 不新增库、公共字段或另一份执行图。复用现有节点操作批次与服务端编译校验，以薄 UI 适配完成原子插入、删除、路线调整和绑定编辑；只支持能够保持图和引用合法的操作，不把不完整图当作已保存。验证界面复用现有 sample / verification 事实，以“试跑 / 独立复跑”解释，无参数时隐藏空表单。既有输入含义不改，任务泛化不在本次修订中擅自发生。

- 正式 UI 编辑证据为 `work/node-editor-1790017262509/result.json`：在画布选中动作后，右侧展示输入、输出与动作设置；名称和固定 URL 输入均通过 UI 保存后还原，新增 Function 自动接回前后动作并加入原阶段，随后选中该节点删除。草稿 `b23f7a56-1208-4806-82c8-d070e3895f55` 的 revision 4→10，执行内容与阶段展示均恢复，历史运行和发布版未改，未新增 execution，UI errors 为 0。前后执行内容摘要同为 `9ea5269f29988fc3fec07c281b7c709e4bf4f39dec877fbd98667a24f5de4f73`。
- 正式单次试跑证据为 `work/node-trial-1790017373294/result.json`：从 UI 点击“试跑整条链路”，sample execution `4ca95491-e741-4ffa-8e0e-d627f5962ac2` 精确使用 candidate chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@3` / digest `8c323b1b51cecefc6cad3ae0ca7fdad10ff1b4eb935879c97cdba43c1e3fb23e`，completed / cleanup confirmed / llmCalls=0，12 transitions / 16 browserCommands / activeMs 81059。
- 试跑工具栏实际显示“首次试跑：已通过”；“独立复跑检查”可用，“发布修改”仍禁用。独立复跑未执行，本次未发布，release v7 / chain v2 保持原状。
- 最终视觉检查发现草稿画布曾禁用事件，导致试跑通过但阶段仍为待运行；已按 candidate 的 id/version/digest 和验证记录绑定独立事件批次，修改草稿后清空旧候选事件，不影响“运行结果”的选择。新增候选隔离/事件读取聚焦测试 3 项与工作台类型检查通过。重启后只读复核同次 execution，`work/node-trial-1790017373294/restart/result.json` 确认 36 条事件、4 阶段及 11 动作全部完成，未新增 execution，UI errors 为 0；运行中渐进状态未另外重跑验收。
- 默认可见产品浏览器配置已恢复，Workbench 4173 / API 4175，当前开发服务 PID 24548 / exec session 35600。验收浏览器均确认退出。
- 已移除默认内部 ID 连线列表和空任务输入框。当前链路无运行参数，剧名保存在节点固定值中；试跑会按当前草稿从头执行，不能在这里输入另一部动漫就自动改变整项任务。需要先明确并实现相应参数绑定，才能声称同链可换动漫。
- 首次 UI 验收发现新增节点弹窗错误使用 Radix `Select.Label`；已按 [Radix Select 官方结构](https://www.radix-ui.com/themes/docs/components/select) 将其放入 `Select.Group`，修复后的上述正式 UI 验收通过。复用组件的结构约束必须遵守，不自制替代选择器。
- 最小验证：原子画布编辑 3 项通过，覆盖服务端草稿应用、编译、引用保护与入口接回；相关节点配置定点测试与类型检查通过。收尾只记录既有结果，未重复测试、未运行全量测试。截图位于上述两个证据目录。

### 2026-09-22 02:51 链路阶段与通用异常边修正（Windows 正式产品复核通过）

用户复核指出：上一轮单个 `ungrouped-actions` 仅换业务标题，且把 1 条成功与 60 条通用异常边合为“61 个出口”，并未达到阶段及子链可读性要求。本轮重新打开画布验收门；此前正式运行成功证据保留，不替代本轮展示与稀疏执行链验收。

Product Alignment:
- natural-language task: 按任务业务阶段查看进度，展开同一阶段看真实动作、节点类型和当前状态
- reusable chain boundary: 版本化阶段引用同一执行图；通用异常由运行器统一收束，只有显式业务处理保留分支
- runtime inputs: 已确认需求、已发布链路及其原有输入；本次沿用现有来源和模型程序
- dynamic task outputs: 新不可变链版本与阶段展示、独立验证和复跑事实
- generic platform capability used: 现有 LangGraph StateGraph、TaskChain compiler、revision API、React Flow 与 Dagre
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no；四阶段名称和成员仅作为本任务修订数据

Reuse Assessment: 不引入或替换库。沿用 @langchain/langgraph 1.4.14 的调度与取消、现有 runtime 错误/人工等待/清理边界、@xyflow/react 12.11.6 与 @dagrejs/dagre 3.1.1；仅精简自有 IR 的重复终态路由并修正展示适配。旧显式错误路由仍可读取且保留真实业务恢复分支。验证限于变更的不变量和本任务正式修订、发布、Workbench 复跑，不重开 B-U 探索。

- 已发布 chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@2` / release `6f2cf1e6-eebd-4129-8019-34b4d65151ee@7`。执行图从 18 节点 / 71 连线精简为 11 动作 + 1 完成终态 / 11 连线；60 条通用异常边实际从新版本删除，错误在原节点保留原因与状态，业务恢复边仍优先。没有增加公共字段，没有改旧发布。
- 四阶段为“搜索《凡人修仙传》→进入番剧播放页→确定最新正片→播放并确认”，动作数分别 5 / 2 / 2 / 2。展开显示浏览器动作、读取、Function、等待及同次执行状态；阶段显示编号、完成数和状态，不再展示技术出口计数。默认纵向保证文字可读，仍支持横向及手动缩放。
- 修复正式运行时已有草稿自动覆盖已发布图的问题：只有显式编辑才进入草稿，运行接受后回到发布版。现有 `b23f7a56-1208-4806-82c8-d070e3895f55` 草稿保留；终态及阶段出口也按本次真实事件着色。
- 正式 sample `aa82c140-0fda-4556-8994-68cdfb27729a`、verification `954bfe0f-de32-4e5e-846b-22c2e5202b0b`、Workbench replay `9505d549-1afa-4283-8258-99991de59483` 均 completed / cleanup confirmed / llmCalls=0，使用同一新链；分别 activeMs 86421 / 85627 / 80071。没有重跑 B-U 探索或修改 prompt。
- 完整证据：`work/stage-chain-1790016501961/closure.json`；最终总览和四张子链截图同目录。实时阶段变化见 `work/stage-chain-1790016351783/failure.json` 的 live：该次运行及实时阶段通过，随后测试驱动对 wrapper 派发 dblclick 未进入子链；改用公开“展开动作”按钮，只读补验同一 execution 成功。更早 `cdcda86a` 运行本身成功、草稿覆盖造成图事件为空，修复后才执行上述一次正式复核。
- 重启后只读复核 `work/stage-chain-1790016501961/restart/result.json` 通过：四阶段、四子链、已发布版本及同一历史运行仍匹配，未新增 execution。已恢复默认可见产品浏览器配置；Workbench 4173 / API 4175，当前开发服务 PID 25860 / exec session 70681。
- 最小验证：10 项稀疏链/合同/分支、4 项既有取消/人工恢复、5 项 UI 投影、草稿选择及终态颜色各 1 项通过；相关类型检查通过。未运行全量测试，macOS 未测，未代替用户作业务满意验收。

### 2026-09-22 02:11 正式产品闭环完成（Windows x64）

本轮 R1–R5 / I7 的 Windows 正式产品门已关闭。需求来源 unique / multiple / none、确认、真实预执行、离线编译、候选 sample / verification、工作台普通复跑、修订发布、同 execution 清理恢复及真实需求回流均有产品证据。技术完成仍与用户对结果的满意分开；没有代替用户作业务验收。

- 新需求 v3：`work/i7-reprepare-1790013905749/result.json`。prepare `33585350-8bd6-41e1-8816-7ec341b790e1` 发布 chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@1`（digest `ec152d92e3aadfae9c87b600666b2f37f49e4808406a39a99641274de2fed337`）及 release `0f670d88-9884-47af-869b-12b6aa145eaa@6`（digest `6ad7744ee1958912362307ce3a24a398313afb294b7555f16d195ee8dc69894b`）。sample `7112914e-7171-4ed5-80ed-17c8d3b32285`、verification `e4a1ebf0-d491-46e1-8fd8-6e05e5d7c719`、工作台 replay `5b3141f7-cb12-4805-8c98-51454cb7917d` 均 completed / cleanup confirmed / llmCalls=0 / browserCommands=16；activeMs 分别 83691 / 80015 / 75393。
- 编译层闭合：同目录 `source-reuse-audit.json` 核验复用失败 job `2170b909` 的完整浏览器来源，explorationSessions / explorationToolCalls 均 0；只补 a8 缺失 Function，新增 semantic_annotation 调用 1。原动作、观察、a4 程序和 history.localRef 均保留；新来源 `a2650c7b-f124-4b1f-8224-59aae68b0c15` 的 digest 为 `fe0fc38d6dbfc2ccaec49e25d00fbe2b105ffb335c4f91b0c4fe153f3b0dbead`，旧来源未改。当前受管 fork `44453845480d909488ea0febced547fb5d2f5a71737ac67aadf32e37c7105517`。
- 既有 I7：`work/i7-final-product-1790011932163/result.json` 包含真实修订、4 次普通运行、清理未确认保留成功 TaskRun 后同 execution 恢复、幂等、单次事件归属和重启；真实需求回流 v2→v3 为 `work/i7-requirement-return-1790012443299/result.json`。R1 三分支证据目录见下方过程记录。
- 用户可读投影：新发布阶段标题/说明来自对应计划步骤，精确绑定本次 chain / execution；`results-390.png` 已关闭响应式侧栏，实际查看通过，scrollWidth=390。最终只读复核 `readonly-settled-projection.json` 确认“再次运行”已启用，jobs=36 / executions=35 及全部 ID 前后不变，UI 写请求 0；独立 Chrome 正常退出。最终桌面图为 `chain-settled-1440.png` / `results-settled-1440.png`。新需求准备前的历史发布逐条保持不变。
- 最小验证：离线注解 Python 6 项、TS adapter 3 项通过；严格 TS 检查含 authoring 集成通过。未运行全量或根级测试；本轮 `git diff --check` 通过，仅存在仓库原有换行转换提示。

剩余边界：macOS arm64 按既有决定延期到真实设备，不冒充已测。普通 a4 点击历史 50.196–54.892 秒，本轮 sample 47.558 秒；删除未消费截图后仍有大部分延迟，现有普通节点日志不能继续区分目标准备、派发、事件屏障与后置观察，性能根因仍待定位。当前自然编译 Function 适配支持完整候选到 ordinal 的选择，不宣称所有纯数据变换或任意任务都已验收。

02:15 收尾：验收用 headless dev PID 24692 在无活动任务后正常退出；已移除本轮 headless 环境覆盖，以默认可见浏览器方式启动 dev PID 21892（UI 4173 / API 4175），留给用户查看。`restart-audit.json` 核验同一 release v6 / replay completed / cleanup confirmed / primaryAction=rerun，无活动 job/execution。所有验收 UI Chrome 已关闭。checkout 仍为 master@7d590363，保留全部既有 dirty work，未创建 worktree、提交或推送。

下方按时间记录本轮失败与修复过程；其中“尚未通过 / 正在运行”均属于当时快照，以本节最终证据为准。

### 2026-09-22 00:50–03:00 整体梳理与修复

用户授权从需求对话到普通复跑整体核对、修正错误和删减冗余；北京时间 03:00 停止新增操作并记录完成、阻塞及现场。当前 checkout 仍为 master@7d590363，221 条 dirty entry 全部保留；开始时 4173/4175 无监听。上一轮 job 5563cb52 已按用户指令中断，不是自然失败或完成证据。

Product Alignment:
- natural-language task: 从已确认自然语言需求形成可验证发布的通用链路，并通过正式工作台独立复跑及生命周期闭合
- reusable chain boundary: 需求确认、预执行来源、证据编译、候选验证、发布运行各自拥有唯一交接结果
- runtime inputs: 已确认需求与来源、版本化计划和任务输入、当前浏览器状态
- dynamic task outputs: 业务结果、编译产物、独立运行与清理事实
- generic platform capability used: 现有 Pi、browser-use/workflow-use、QuickJS、LangGraph 和产品持久化
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no

Reuse Assessment: 沿用 RESEARCH 中已核验的现有组件和版本，不引入或替换关键库。本轮 B-A-T 改动限定为交接适配、绑定和产品生命周期；不另造 Agent loop、浏览器控制器、图调度器。公开字段必须有明确消费者，可推导事实不新增冗余字段；诊断与业务合同分离。

首个确定问题：TaskChainAuthoring 在复用来源的重编译仍有任意 gap 时自动重开浏览器，使纯编译缺口越层触发再次探索。本轮已将自动重新探索限定为确切的旧动作注册合同不兼容；其他 gap 保留完整来源并在编译层报错，修复后离线重验。正式验收仍需真实预执行、发布、零隐式模型复跑、清理恢复、修订和需求回流；局部验证不得替代。

01:03 进展：已去掉任意编译 gap 自动重探索，重编译保存本次派生 artifact 及具体缺口，保留旧来源；现有注册兼容边界单项通过，API 类型检查通过。浏览器文档身份采样改为复用 pooled session 的一次 DOM.getDocument，删去临时 nodeId 查询链及仅为其存在的重试；post observation 不再请求未消费截图，scroll(index=0) 按原生 viewport 语义归一。13 项定点验证中 11 首次通过；两项 fixture/DOCTYPE 区分失败修正后分别通过，真实 Chrome 证明 getDocument=1、attachToTarget=0、querySelectorAll=0，测试浏览器已关闭。新 fork `9bb1a8d067726b089909b9d34b1a060db70a786af03874759049d5a39daa6ca4` 已同步。

产品层已修复终态准备时间、单链发布 sample/verification 相位校验、continue_preparation 先校验再记录接受幂等键，以及 sample/verification 清理待确认时保留原阶段并提供同 execution 清理入口。清理确认后服务继续通知原准备/修复协调器，不重新运行已完成的 TaskRun。正式准备 job `b0657639-468f-4571-82c5-d3927bcb0435` 于 `2026-09-21T17:02:51.725Z` 从产品 API 接受，沿用已确认需求 v2；尚未取得终态，不计通过。当前 dev 为本会话启动 PID 16892，headless，4173/4175。

01:06 同次终态：预执行完整成功、来源关闭、编译 gaps=0，source `18356035-d17e-493d-8f5e-0e8530bffbf1`（digest `2dea095926654e97a2c652d90ef3d8d2f08100572843509e63ece48a700dec27`），候选 chain `7623b02a-f531-443b-87ab-71248f97e91b@4`（digest `79cd40d5baa10a8a8517a68eea21f4ee5564dea1ef1eda652b25af4672e0f96f`），包含两段已通过 QuickJS 变化样例的选择 Function。正式 sample `be880b71-6812-4ec0-8946-a1eaefcb34de` / run `62a14de4-0bf5-49ae-8a3a-f87ba548f91c` 完成导航、输入、完整读取、第一段 Function（结果 ordinal=2）后在结构点击 s-a-0004 失败：`element_identity_unavailable`。modelCalls=0、cleanup confirmed；没有新 release。该错误已在相同结构的真实本地 Chrome 复现为 html 容器身份校验缺口，修复中。另发现 TaskRun 已计 7 browserCommands 而 execution 总计仍 0，正在修通现有账本回调；不添加第二套计数状态。

R1 unique 正式 Workbench 一次通过：`work/requirement-dialogue-workbench-unique-2026-09-21T17-03-42-935Z/` 含 acceptance.json、persisted-r1-facts.json、confirmed-requirement.png 和 cleanup.json。真实只读搜索、Question Panel 来源选择及业务澄清、修订 v2、确认与持久化均已核验，旧 v1 保留，未决 0，产品 browserCommands/browserRuns 均 0；需求模型调用 4。独立 UI Chrome 正常关闭。multiple/none 尚未执行，unique 不替代完整 R1/R2–R5 通过。

01:20 更新：真实主文档 HTML 的 frameId 与普通 DOM 子节点 frameId=null 的合法组合已在 `target_document.py` 做严格同 target、根 document、非 shadow 判定；仅放行真实主文档，iframe/shadow/其他 target 继续拒绝。与正式失败相同的结构目标在真实 Chrome 复现并修复，2 项定点验证通过（2.607 秒）。受管 fork 已冻结为 `232778df12fbe85263dccc6332312ae1eae7a10d7f1ab05b4f4894b6a3380fb9`。

随后正式 prepare `d3005a05-0eab-4a73-86af-6f1073f024c9` 离线复用 `b0657639-468f-4571-82c5-d3927bcb0435` 的完整来源：explorationSessions/explorationToolCalls/providerInvocations 均 0，原 history 与 request.trace digest 未变，派生 source 为 `4c724ee9-9a9a-408e-8731-8ef37c300152`。sample execution `9351b545-b7a5-490b-84b8-e6be98949f43` 和 verification `3cb452f6-351f-4e7d-83b5-8f1ecf2c895b` 均 completed、cleanup confirmed、browserCommands=14、llmCalls=0；两段 Function 均成功、各约 0.1 秒。系统于 `2026-09-21T17:19:47.582Z` 正式发布 chain `7623b02a-f531-443b-87ab-71248f97e91b@5`（digest `b76f9c9102cb2201698e125e477e0f12f44d63ed41d775dd7e0d92b5f5303088`）及 release `ad842045-f2da-4f9a-8b39-e0b5a2a0166a@4`（digest `9410bd817f661744301a1b6cd3d2a94e2152cfc579c5640404613a31b144b121`）。该证据关闭本次来源到验证发布门；发布后正式 Workbench 复跑、修订和清理恢复仍需本轮 I7。

运行账本现在通过已有 accountConsumption 边界计入每次实际浏览器派发（含失败、诊断与恢复观察），预算错误保留原类型，不新增第二套计数合同。cleanup.pending 的短暂自动关闭仍属于活动 execution，只有 unconfirmed/cleanup_required 才显示人工清理；compiled 计划也可在技术失败后复用，避免重复生成计划。分别完成所属最小回归及类型检查；未运行根级/全量测试。本会话 dev PID 20368 已正常退出，I7 独立应用持有当前 data。

R1 三分支的真实 Workbench/只读搜索/Question Panel/持久化证据已齐：

- unique：上文目录，另有 `confirmed-requirement-settled.png` 与 `projection-acceptance.json` 核验正常轮询后的已确认 v2 / 等待准备投影；只读复核未产生模型、执行或数据修改。
- multiple：`work/requirement-dialogue-workbench-multiple-2026-09-21T17-16-58-909Z/`。初次验收驱动的全页文字定位误点同名侧栏，保留失败证据后改为 Question Panel 内定位，继续同一持久化待回答问题；真实两候选经选择和业务澄清形成确认 v1，需求模型总调用 4，未决 0。
- none：`work/requirement-dialogue-workbench-none-2026-09-21T17-18-49-387Z/`。首轮无来源、无草稿/确认版本、确认按钮禁用，补充主体信息后由新只读搜索及选择形成确认 v1，需求模型调用 5。`initial-source-gate.json` 保留无候选时不得越过确认门的事实。

三个分支均保留 acceptance、持久化事实与浏览器退出证据；产品 browserCommands/browserRuns/jobs/executions 均 0。以上是开发验收操作，不表示用户已接受业务结果。

01:26 I7 已按精确 release v4 从正式 Workbench 启动，目录 `work/i7-final-product-1790011587219/`。前次驱动缺少 `BAT_ACCEPTANCE_BROWSER_EXECUTABLE`，在创建 UI 浏览器及产品运行前退出，失败证据在 `work/i7-final-product-1790011342260/`；补齐实际 Chrome 路径后继续，不涉及模型或 prompt 调整。I7 尚在运行，不能提前记通过。

01:34 I7 部分证据：正式 Workbench replay `490aa303-6ec2-4998-8832-5652530a59a2`、幂等 API replay `0f12047d-fe15-4624-830d-44aacf5bb1a0` 均 completed / cleanup confirmed / llmCalls=0 / browserCommands=14；侧栏只导航、事件续读和精确 execution 归属已通过。驱动在 Radix 选择弹层关闭后的焦点归还时序处报 `i7_skip_link_missing`；等待弹层归还焦点后键盘跳转已通过。继续验收只复核这两个已有 execution，不重跑；首次续验误等待历史首个 execution 的“最新运行”投影，驱动已按已有两次运行的顺序修正，没有创建额外 execution。当前证据目录 `work/i7-final-product-1790011932163/`，修订草稿 `f71ad7e3-15d5-4ec7-82dd-75c39298fc98` 的 sample `2bfaa904-ea72-42ea-89d3-894b67bbd276` 已完成，独立 verification 进行中；I7 仍未整体记通过。

另修复了实际恢复缺口：业务终态已落库但 cleanup.pending 时进程退出，重启会进入 cleanup_required，并在既有 cleanupResume 保存原 status/reason/result，TaskRun/steps/output 不变；仅显式恢复允许同 execution 的清理 attempt+1。没有 close/owner 审计时保留 pending，不伪造 unconfirmed 的证据摘要。临时 DB 重启回归与原 queued/running 恢复用例 2/2 通过；confirmed 不变、再次恢复幂等、原业务失败保留。该错误路径为定点测试证据，不冒充现场崩溃产品验收。

01:38 I7 正式闭环通过：`work/i7-final-product-1790011932163/result.json`（关联前两次运行证据目录，不重复执行）。修订 draft `f71ad7e3-15d5-4ec7-82dd-75c39298fc98` 发布 chain `7623b02a-f531-443b-87ab-71248f97e91b@6`（digest `2d71a55d8df4d271ea750de2bbe75186470fa232a9932aeb25b66e4c1cb86d7f`）和 release `5933f3e5-5f0c-4935-8516-280a1669993f@5`（digest `4566ced82fcebe6b57cc2088357463a357a5b98ae124a77efbbabd2b668fdfce`）。新发布 Workbench replay `c9ac0a6a-c3f6-4403-84fc-ceb8b8ab4199` 完成；另一真实 replay `b6e5e72c-28b2-4691-81b4-707eb27584dd` 注入 close protocol 未确认后进入 cleanup_required、TaskRun 和业务结果保留，经工作台“核验并清理资源”恢复同 execution completed / confirmed，零模型调用。普通运行、修订 sample/verification、幂等、三个 review 分流、重启持久化、键盘跳转与减弱动效均通过；这仍是开发验收，不代表用户对结果的真实满意。390px 无横向溢出通过，但当时截图被响应式侧栏遮盖，最终只读界面复核会关闭侧栏后补齐结果截图。

真实需求回流另行验证：首个驱动在任务 root 出现但页签尚未挂载时过早点击，停于 execution_selection，未发反馈、未创建 turn；证据 `work/i7-requirement-return-1790012345028/`，独立 Chrome 8632 正常 exit 0，应用已关闭。修正等待后继续，不重跑 I7、不变更业务反馈。当前真实“回对话形成新需求版本”门仍未关闭。

01:52 新需求 v3 从正式工作台确认后，prepare `2170b909-d227-46a1-8abd-a5837ab4e6dd` 完成新 plan `44378eb4-c2cd-41ed-8971-8211a1dbebce@10` 的真实代表执行，source `7cf2f991-27db-4810-8e3e-d8d6e6463858`（digest `886e62dbcda1408bd9cce85d8c6ab79725c34a6d1f122f44c6976fef270de8fd`）sourceSuccess=true、closed=true；编译停于 `missing_binding / a-0008 / selection_function_evidence_required`，没有发布或验证执行。原始完整来源保留在正式 artifact，定点只读副本 `work/reprepare-v3-source-artifact.json`。a7 完整读取38候选的 title/href/text，a8 原始 ordinal=37 的点击有真实DOM事件，done 记录目标播放；批量语义注解只返回 a4 程序、遗漏 a8，宿主原来允许这种不完整响应。不得把 v5 已通过的 I7 当成 v3 已通过。

本次编译修复 Product Alignment 延续本节约束：以同一固定浏览器来源离线补齐缺失 Function，不重新探索、不替用户补业务含义、不写站点分支。模型响应收敛为单段 source/examples，actionRef 由宿主拥有；已存在程序不重生成，缺失程序各至多调用一次。复用现有 AI Connect bridge、semantic_annotation 审计、offline compiler owner 与 QuickJS，不增加模型循环或公开业务字段。新增内部 `hybrid_annotate` 命令仅复用现有 compile 输入加现有 AuthorModel，必须无 Browser owner；返回同一已确认需求/计划和只追加派生函数的新 source payload。旧 artifact 不改，新 job 只计新增模型调用。当前实现和局部验证进行中，尚未再次提交正式准备。

### 2026-09-21 紧急修复接手：本轮证据门

14:46 UTC 受控后续：读取与观察合同已完成最小局部验证，正式准备 job `098be260-01f1-4429-84a7-8abf197f4b84` 已从产品 API 提交，结果待核验。新增导航观察五项验证 3.739 秒通过，含真实 Chrome 初始空页、html backend 对应和导航后旧观察拒绝；补充动作后诊断归属/安全持久化单项 0.023 秒通过。API 类型检查与 Workbench 生产构建通过。最终受管 fork digest 为 `120be06fb6ba32fe3d3dcf5b3aef588388fb87f123a555c776888d5483495f83`；下文较早 digest 属于各轮历史快照，不替代本轮正式产品门。

14:49 UTC 同次结果：该 job 于 `14:49:28.508Z` 失败，source `59dda871-a149-477a-8f6d-3bc4653b40ea`。6 次动作已派发，a-0006 完整读取 38 候选并形成 read-fields，无读取 gap；a-0007 是只读 find_elements，在派发前被 URL guard 拒绝。新诊断证明观察后 26.843 秒内 URL 变化，但 target/document 身份相同、两次采样均稳定；其余 32 条诊断 consistent。没有选集、done、Function 或发布。job 164.026 秒，其中 7 次模型 123.075 秒，dispatch 10.956 秒，回调 11.019 秒，author 内未归因 11.726 秒，窗外 7.250 秒。

后续修复仍属上述 Product Alignment / Reuse Assessment：只读查询不依赖旧页面索引，同文档 URL 变化时允许重新观察一次并记录新 scope，索引动作及换文档仍拒绝。编译必须同时承接该事实，不能退回静态样本 URL；只对有同文档来源证明的 read-fields 允许复跑重新绑定当前 URL，并复用现有 `current_document_id` 和 BrowserStateSummary 可选 documentId 核验同会话、同 tab、同文档，零模型、零动作重派。沿用 browser-use/现有目标身份和 scope 适配，不新增导航器或调度器。此项实现和正式验证尚待完成。

15:02 UTC 局部实现门已完成：只读重新观察/旧索引拒绝/新 scope 合同 9 项（0.171 秒）、document_identity 来源事实 1 项（0.019 秒）、API 来源准入与普通运行 scope 4 项通过；API 类型检查通过（先修复新增可选字段的 TypeScript 边界报错），工作台重建通过。现有 `hybrid-interaction-read.acceptance.ts` 真实无头浏览器验证 1/1 通过（浏览器测试 6.903 秒），确认 runner/协议共享会话读取仍为零模型。为保持单文件上限，runner 的原有 Pydantic 请求类原样抽至 `hybrid_commands.py`，原入口保留导入；导入和严格请求合同定点检查通过。受管 fork 为 `5b7d339d36902e077b96e45ddf366184c924716eb62fb374e2338fedaa077656`。正式准备 job `9651c0f2-83e9-4be2-89ae-b6fe5e0ed725` 已提交，尚未取得发布/复跑证据。

15:04 UTC 同次结果：job `9651c0f2-83e9-4be2-89ae-b6fe5e0ed725` 于 `15:04:17.438Z` 失败于 preexecuting，source `b57723a4-6dd1-468d-8486-42a7bf0eb209`、browserRun `e182d835-7e8b-47fd-8ca8-0c9ec27669fa`，sourceSuccess/completed 均 false、closed=true。4 次动作是 navigate/input/find_elements/click；a4 点击已派发成功，随后 after_step 读取 live document 失败，唯一异常诊断为 state_capture/capture_unavailable，baseline/current/summary 均空。其余 19 条诊断 consistent；未进入业务候选选择，没有 readonly_observation_refreshed、done、Function、新发布或验证运行。job 共 81.958 秒：模型 56.560、派发 9.298、回调 3.442、author 内未归因 6.497、外围 6.161 秒。当前证据只定位到第一次 live_document_sample 未返回，不足以判断具体原生 API 错误；先补齐定位和定向验证，不能直接再跑。

15:15 UTC 导航采样局部修复：真实 headless Chrome 的一次新 tab 点击后，在原生 DOM.getDocument→querySelectorAll 之间发生导航，复现 `RuntimeError` 的固定 CDP `-32000 / Could not find node with given id`。旧实现立即终止，现仅将这一 html_query 瞬态错误交已有 Tenacity 动作后观察重试，不重派点击；其他错误仍停止。新增安全 errorPhase/errorStage/errorType/errorCode/errorDigest 事实，且不再把 get_basic_info 返回 error 时附带的旧 backend ID 当成文档证明。4 项最小验证通过（3.449 秒），包括同一真实样本恢复、一次点击、重试预算和未知错误拒绝，测试浏览器已关闭。旧正式运行的底层异常不可恢复，因此这里只证明通用适配缺口与局部修复，正式门仍待确认。

15:17 UTC：冻结上述补丁并同步受管源码，fork digest `f5adad748762674981915cc8dbc4881bbaadfef33f7950e8d40aab720842f031`。无活动产品 owner 时正常重启本会话开发服务，正式准备 job `5563cb52-cdc0-4f59-89fc-eb34f9df4cf8` 于 `15:17:07.396Z` 提交；需求仍为已确认 v2，结果待核验，不另改 prompt。

本轮正式产品观测（2026-09-21 14:19–14:32 UTC；I7 仍未通过）：

- 首次准备 job `8b7716d4-d792-4c8b-89ff-a3c62b549305` 在 `14:19:23.495Z → 14:19:26.560Z`、共 3.065 秒后于 `preexecuting` 失败。主线程通过 `work/urgent-recompile-diagnostic.mts` 对原来源定点诊断，取得类型化 `UpstreamProtocolError`：`hybrid_runner_failed:ValueError:hybrid_action_registry_mismatch`。兼容处理只允许这一明确的旧动作注册合同不兼容触发放弃 reusableSource、重新实际探索，其他错误不得走该后备路径；`apps/api/tests/hybrid-source-compatibility.test.ts` 中“只有明确的旧动作schema不兼容才允许重新采集来源”1 项通过，未重跑该验证。
- 后续正式准备为同一 task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的 job `d708e143-1888-4183-809f-05503fedf7a6`、browserRun `4b124705-aa67-4f21-8cde-6beaecf6c2f9`、source artifact `160edc71-eaa6-4bc1-8db2-c14ead414065`（digest `3a41834a6b91c87515a504ab4d8845d5280904a674621d4919a6f5eca6827d8d`）。该 job 为 `failed / preexecuting`，来源 `sourceSuccess=false`、`trace.completed=false`、`closed=true`，未形成新 chains 或 validationExecutionIds；本次页面复核时产品为 `ready_to_prepare`，active job/execution 均为空。旧 release v3 和历史执行保留，不充当本次准备通过证据。
- 本次记录 8 个 trace action、7 次实际 dispatch；第 8 个 click 的 `before_action` 在 `14:26:26.516Z → 14:26:26.989Z` 失败，后续没有 dispatch 或 done。来源保留 `observation_url_changed`、`native_agent_run_failed`、`completed_business_result_required` 及 a-0005 读取证据缺口。这里只记录失败事实，不推断页面变化原因或宣告读取/导航问题已解决。

本次耗时按同一 job 的 UTC 时间戳及安全日志 `data/source-lifecycle-diagnostics/4b124705-aa67-4f21-8cde-6beaecf6c2f9.jsonl` 第 1–62 行配对计算；下表各项互不重叠：

| 时间口径 | 数量 / 耗时 | 可复核范围 |
| --- | --- | --- |
| 已结束模型调用 | 8 次 / 145.189 秒（job 总时长的 77.1%） | 日志 2–3、10–11、18–19、26–27、34–35、42–43、50–51、58–59 行；按 callId 配对 |
| 实际动作派发 | 7 次 / 10.089 秒 | dispatch started/completed；navigate 2.722、input 0.227、三次 find_elements 合计 0.023、两次 click 为 6.210 和 0.907 秒 |
| 动作前回调 | 8 次 / 1.563 秒 | before_action started→completed/failed，含末次未派发 click 的 0.473 秒 |
| 动作后回调 | 7 次 / 9.929 秒 | after_step started→completed；两类回调合计 11.492 秒，不重复计入 dispatch |
| author 内未归因间隔 | 13.302 秒 | author 总窗 180.072 秒减上述模型、派发和回调；不能直接归类为浏览器等待、清理或编译 |
| author 窗外时间 | 8.242 秒 | job 创建→author started 为 6.428 秒；author completed→job updatedAt 为 1.814 秒，启动/持久化等更细分项未单独计时 |
| job 总窗 | 188.314 秒 | `14:23:23.072Z → 14:26:31.386Z`；author 窗为日志 1→62 行 `14:23:29.500Z → 14:26:29.572Z` |

`closed=true` 是来源关闭事实；日志没有独立 cleanup started/completed，无法单列清理耗时，也不能把它等同正式 execution 的 cleanup confirmed。准备消费记录 `compilationCalls=0`，artifact 含来源编译响应，但没有独立编译起止；不能把未归因时间记为编译耗时。

- UI 定点验证：`node --import tsx --test apps/workbench/tests/chain-workbench-projection.test.ts apps/workbench/tests/product-presentation.test.ts` 共 6/6，通过终态不显示运行中、链版本/execution/单次 run 事件归属、较晚失败准备与历史结果分离、失败准备不旋转且编译不等于代表执行成功等回归；`npm run check --workspace @browser-capture/workbench` 通过。
- 正式 Workbench 只读复核使用上述 d708 job 的已保存状态，未点击准备/运行；前后 jobs/executions 数量相同，独立 UI Chrome 已关闭。准备页显示“执行代表任务 · 未完成”、旋转数 0；链页显示“本次准备未完成”、再次运行禁用，当前链无相符 execution 时不套用旧动作事件；结果页明确“历史运行 · 已完成”，旧结果为中性色且没有虚假的当前步骤。已实际查看三张截图：[准备页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/preparation.png)、[链路页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/chain.png)、[结果页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/results.png)；同目录 `summary.json` 留存只读计数和 DOM 投影，均位于私有、Git 忽略的 `work/evidence/`。
- 主线程补充读取合同局部证据：`BAT_REAL_BROWSER=1` 下 `tests.test_selection_read_contract -v` 3/3 通过、用时 3.113 秒，包含真实 headless Chrome 本地页面的隐藏候选 textContent、resolved href、缺少属性和原始 ordinal 保留；默认业务可见 innerText 仍拒绝隐藏元素。该证据不证明 a-0005 未知读取错误的唯一成因，也不替代正式准备。

以上更新本轮失败和 UI 投影事实；I7/R2/R3/R5 保持打开。下文接手时快照与其他历史证据原样保留。

实现包局部证据（正式准备尚未通过）：

- 同次旧 job 用时 282.246 秒，其中 12 次完成的模型调用累计 214.329 秒；10 个已派发动作累计 23.716 秒。Enter 派发 18.642 秒，前后回调共 20.780 秒。两次页面改变发生在派发前，原因未知，不能归因用户/网站/自动播放。浏览器关闭发生在 done 之后，没有“提前关闭”证据。
- 共享导航适配使用公开 SwitchTabEvent 和实时 Page.get_url，capture/ordinary 一致；唯一新 tab、真实空白、多 tab 歧义、单次派发和 Enter 跨页共 10 项测试通过。
- capture 回调失败调用公开 Agent.stop 并保留失败来源，5 项故障验证通过；必填 success/reason 的原生 done 适配 4 项验证通过。
- 候选属性/原 ordinal、完整集合溢出、需求绑定选择程序和固定身份目标准入共 11 项验证通过；工具准入矩阵的 1 项现有验证通过。
- Function 的真实 QuickJS 变化输入校验、常量规则拒绝并保留来源、输入/需求事实防替换共 3 项 API 验证通过。API 类型检查通过；未运行根级或全量测试。
- 受管源码已同步，digest `d00b0b30fa9a43fc795b5348c4f7f9cf0d9ce340fc675c4e59510d44722bc1b6`。以上仅为局部合同证据，不能替代下面六项正式产品门。

重新核验现有 checkout 为 `master@7d59036332a66de8991744659d2317da126c6123`，196 条 dirty entry（Git 默认合并未跟踪目录的口径），全部保留。正式 API 最新准备仍为 `1964f027-dc49-45c5-88b6-a119db77f164`，来源 `c01657e0-1a31-441b-82f3-4f7f014196ab`，当前无活动 job/execution，产品 `ready_to_prepare`。以下是修改前分类，不是完成结论：

| 范围 | 分类 | 当前证据与待关闭项 |
| --- | --- | --- |
| 预执行与结束 | 已确认断点 | 读取候选后没有选择及最终状态动作，done 的 null 合同仍形成 sourceSuccess；正常结束标记不等于代表业务完成。 |
| 标签页、导航与耗时 | 已确认断点；部分原因待定位 | Enter 后新增 tab 尚无 URL，随后显式 switch；普通复跑只对 click 的 URL change 收敛新 tab，编译拒绝 switch。两次 before_action 因 observation_url_changed 未派发；触发跳转原因和阶段耗时继续用同次证据核对。 |
| 暴露动作与编译承接 | 已确认断点 | 注册动作多于普通白名单；Function 草稿验证器存在，但 natural compilation 不接受 Function segment。需要逐动作明确执行或取证语义。 |
| 读取、动态规则和绑定 | 已确认断点 | find_elements 的 read contract 只保留 text；末项 count 不表达过滤/排序规则；重复祖先判定又拒绝固定身份的搜索结果导航。 |
| 验证、发布与 UI | API 局部修复已观察；正式 UI 待验证 | API 本次失败为 ready_to_prepare，历史 release 保留；不能以旧 release 的验证证明本次准备成功。 |
| 正式复跑、清理与恢复 | 历史实现/证据存在；本轮未通过 | I1–I6 已有实现及历史定点证据；本轮必须在修复后的正式产品路径验证，I7/R2/R3/R5 保持打开。 |

```text
Product Alignment:
- natural-language task: 已确认的浏览器任务完成一次真实代表执行，保存可执行的动态选择及浏览器状态转换，再经正式验证、发布和普通复跑闭环
- reusable chain boundary: 结构化读取、版本化纯数据规则、稳定身份绑定、导航及标签页动作由现有通用节点和浏览器适配承接
- runtime inputs: 已确认需求、当前页面候选与属性、运行输入和本次会话页面身份
- dynamic task outputs: 有来源的候选/规则结果、实际动作和后置事实、编译缺口、正式验证与独立运行审计
- generic platform capability used: browser-use Agent/Tools/Browser、workflow-use capture/compiler、QuickJS Function、TaskChain/LangGraph 和现有产品生命周期
- replay model calls: 0，显式 llm 节点除外；准备期的有界语义编译独立审计
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 真实浏览器动作到可复跑节点的通用适配，以及候选读取到纯数据规则和目标绑定
- existing implementation in repository: 受管 browser-use/workflow-use、ReadSpec、ConsumerReadiness、functionDraftSchema、validateAndMaterializeFunctionDraft、executeFunctionNode 和普通动作适配
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、workflow-use 0.2.11、quickjs-emscripten 0.32.0、现有 LangGraph；不新增或替换库
- selected implementation: 补齐既有公共能力之间的证据和物化合同
- reused public surface: Agent callbacks、Tools registry、BrowserSession 页面 API、结构化读取、现有 QuickJS 验证与 TaskChain 值绑定
- B-A-T-owned adapter and remaining gap: 来源覆盖、跨页因果、类型化绑定与版本化规则；不实现第二个 Agent loop、浏览器控制器或图调度器
- license/runtime/platform fit: 沿用 MIT/AGPL 既定边界；当前 Windows x64，macOS 延期未测
- browser/runtime/state ownership conflicts: 一个运行一个 Browser owner；Function 无浏览器/网络/文件/模型权限；历史来源和 release 不覆盖
- replay model calls: 0，显式 llm 节点除外
- rejected candidates and evidence: 仅增加 prompt、把样本末项编译成 count、按祖先重复结构拒绝固定身份、Agent done 充当业务完成均不能证明对应不变量
- focused validation: 每个改动包最小合同验证；随后正式 Workbench/API 准备、验证、发布、普通复跑及状态投影；局部测试不作完成证据
```

> 2026-09-21 产品基线纠正：D 的 Windows x64 历史结果保留；产品最小闭环和 R1–R5 曾取得一轮正式 Workbench/API 证据，但同一真实任务第三次正式复跑暴露执行生命周期缺口，实际链路画布也不满足可读修订入口要求。R2、R3、R5 重新打开，当前不得写“产品闭环已通过”。macOS arm64 仍由用户延期且记录为未测。
> 历史七项验收、修订后受控 R1–R5 和真实任务前两次成功均保留为历史证据；它们不能覆盖后续失败。下文较早逐轮记录不代表当前结论。

> 真实任务 `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的前两次正式复跑各为 6 个浏览器命令、0 个模型调用；第三次 execution `d5a86b0c-a30b-48ef-8a0c-6e7f92c5daa6` 的 1/1 步骤和 TaskRun `5f6abc37-6108-459c-8c4f-3337753e5040` 已 completed，但 runner 清理退出码 1 被误写为 `deterministic/repairable`，产品错误进入 `needs_repair` 并失去普通复跑入口。该问题不是链路失败。

> 2026-09-20 产品边界再次确认：需求对话必须继续到所有影响结果的重要歧义均由用户确认或明确委托；缺少入口时在需求阶段做只读来源解析并用 Question Panel 解决多候选。准备任务只研究真实网页实现。正式运行在链路无节点、合同或运行时错误并到达完成终点时即为 completed，不再用链路结尾的全局语义 judge 制造假失败；用户是否满意是独立验收。局部问题通过可编辑链路画布发布新版本，整体需求错误携带运行记录返回需求对话。

> 2026-09-20 R1 来源边界纠正：搜索词及原始搜索结果的业务语义由访谈 LLM 根据完整对话判断；宿主只执行受限搜索、返回真实结果 ID、校验模型提交的候选引用、生成 Question Panel 并持久化用户选择。此前宿主 `rankCandidates`、通用词表和分数阈值属于越权语义判断，相关实现已删除，基于该启发式排名取得的验收证据全部作废；新两步工具协议已重新通过正式 Workbench 验收。

> 2026-09-20 R1 搜索能力边界已按公共根因修复：`opencode` 的 `@agent-platform/pi-agent-session` 现在复用 Pi `DefaultResourceLoader`，只加载宿主声明的 extension/package，并把 extension 与宿主工具合并到精确 active-tools allowlist；B-A-T 仅在需求访谈启用 `pi-web-access` 0.30.0 的 `web_search`，Bing RSS 保留为失败后备。模型设置没有新增搜索项，也没有任何供应商分支。

> 2026-09-21 17:37–17:44 最新准备任务回归：task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的 prepare job `41af88f0-1bdc-40ee-8867-14fa8b9439de` 在 B-U 预执行失败，耗时 428.7 秒。安全生命周期日志记录 18 次串行模型调用和 17 次浏览器动作，模型等待累计 304.7 秒；动作在持久 Profile 遗留页面间反复 `switch / wait`，最后导航到已确认站点的第一方子域时被精确 origin 边界拒绝。此前 I7/R5 通过结论未覆盖该真实回归，继续保持重新打开；修复完成前不得把历史 I7 证据写成当前闭环通过。

最新预执行回归修复开工记录：

```text
Product Alignment:
- natural-language task: 已确认来源的浏览器任务进入准备后，在同一第一方站点的首页、搜索域和内容域完成一次代表任务，不受上次运行遗留空白页干扰
- reusable chain boundary: 每次预执行仅暴露本次自动化会话拥有的页面；来源授权按确认站点边界覆盖该站点的第一方子域，跨站导航仍拒绝
- runtime inputs: 已确认的精确入口 URL、由入口推导的站点域边界、专用持久 Profile 中的登录与存储状态
- dynamic task outputs: 单次预执行动作证据、链路来源、浏览器命令和模型调用审计；不持久化页面正文或 Profile
- generic platform capability used: tldts 注册域解析、browser-use BrowserProfile allowed_domains 和公开页面会话 API、现有 hybrid runner 协议
- replay model calls: 仅首次准备允许探索模型；普通复跑仍为 0，显式 llm 节点除外
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 第一方站点授权与新自动化会话页面隔离
- existing implementation in repository: OriginAccessGate 已用 tldts 按注册站点累计访问边界；hybrid runner 已固定 browser-use 0.13.8 并拥有专用持久 Profile
- mature candidates and pinned versions: tldts 7.0.16；browser-use 0.13.8 的 BrowserProfile.allowed_domains、get_tabs、get_current_page、close_page 与 Page.goto
- selected implementation: TypeScript 从精确入口推导结构化 allowedSites，Python 同时用于 browser-use 预导航拦截和动作后页面核验；新 hybrid session 启动后保留登录存储但把页面集合收敛为一个空白运行页
- reused public surface: tldts getDomain；BrowserProfile allowed_domains；BrowserSession get_tabs/get_current_page/close_page；Page.goto
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有来源到站点边界的转换、跨协议校验和自动化页面所有权收敛；修复后仍需从正式准备入口复跑一次
- license/runtime/platform fit: 不新增依赖；沿用当前 Windows x64 固定运行时，macOS arm64 仍未测
- browser/runtime/state ownership conflicts: 只重置任务自动化会话的导航页，不清 Cookie、localStorage 或 Profile；账号管理浏览器不执行该重置，且产品已有单浏览器所有权门
- replay model calls: 准备阶段允许；普通复跑不增加模型调用
- rejected candidates and evidence: 不枚举站点子域、不加入网站特判、不关闭浏览器安全边界、不提高单轮动作数破坏单次派发审计；browser-use 已提供所需站点白名单与页面 API，无需自研浏览器控制
- focused validation: 待运行跨 TS/Python 启动合同、站点边界及页面归一化定点测试；随后只从正式产品准备入口复跑一次
```

最新预执行 E1 编译缺口修复记录：

```text
Product Alignment:
- natural-language task: 代表执行在异步页面完成业务动作后等待页面稳定，并把这段真实等待保存为可零模型复跑的链路动作
- reusable chain boundary: 原生固定 wait 只在动作前后仍位于同一运行时 URL 时编译；跨页、缺少前后观察或失败 wait 继续保留 gap
- runtime inputs: wait 的固定有界时长和执行前动态 URL digest 基线
- dynamic task outputs: browser.workflow-step wait 节点及 unchanged URL 后置条件
- generic platform capability used: workflow-use Postcondition、StepVerifier 基线读取和 OrdinaryCapability 单次派发
- replay model calls: 0
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 固定等待的确定性复跑与动作前后同页核验
- existing implementation in repository: workflow-use 已记录 wait 参数、前后观察、URL digest、单次 dispatch，并由 Postcondition/StepVerifier 支持 changed/ready/transition 基线语义
- mature candidates and pinned versions: 继续使用受管 workflow-use 0.2.11 与 browser-use 0.13.8；不新增等待库或调度器
- selected implementation: 给既有 Postcondition 增加通用 unchanged authority；natural compiler 仅在 wait 前后 URL digest 相等时生成 wait 节点，运行时在派发前捕获本次动态基线并在等待后比较相等
- reused public surface: declared_checks、capture_check_baselines、check_fact、browser.workflow-step wait、既有 ActionRegistry 与证据引用
- B-A-T-owned adapter and remaining gap: 只补编译合同和运行核验，不把 native extract、Agent done 或页面文案冒充运行节点；修复后需离线重编译本次真实来源并再从正式准备入口验收
- license/runtime/platform fit: 仍在固定 AGPL-3.0 受管 fork 内并更新来源摘要；Windows x64 当前验证，macOS arm64 未测
- browser/runtime/state ownership conflicts: 不增加浏览器或模型 owner；wait 仍在同一 execution 的唯一会话内单次派发
- replay model calls: 0
- rejected candidates and evidence: 不吞掉 missing_effect_proof、不把 wait 标成无条件 agent_internal、不固化样本 URL、不恢复 CSS/自定义模型工具；本次真实来源的 wait 前后 URL digest 相同而 DOM 动态变化，适合运行时 unchanged 基线
- focused validation: 待运行 workflow-use 固定 wait 编译/运行定点测试、真实来源离线重编译和受管 fork digest 校验
```

最新预执行修复定点证据：

- 站点边界与页面归一化合同测试通过；API TypeScript 检查通过。与既有 runner cleanup 组并行执行时 10 项中 9 项通过，唯一失败是原有 150ms close fixture 在并发负载下命中 `cleanup_close_protocol_timeout`，而不是本次站点或页面归一化断言失败；没有以扩大超时或重复整组掩盖该基线现象。
- 正式 prepare requestId `b1122a0e-1a5f-4d49-96c5-9915203e817d` 创建 job `82afb519-4874-4910-86f8-17b215efeecc`。本次预执行从旧失败的 18 次模型调用/17 个浏览器动作、反复 `switch`，降为 10 次 provider 调用/8 个浏览器动作 `navigate,input,click,extract,click,extract,wait,done`，没有 `switch`、遗留空白页抖动或第一方子域越界；来源在 browserRun `38b5aad7-4360-480f-8000-2b5eb0785605` 中成功关闭并保存。
- 该正式任务随后仍在 E1 编译失败，真实唯一 gap 是固定 `wait {seconds:5}` 缺少 effect proof；它的动作前后 URL digest 相同、DOM digest 因动态页面变化而不同。该失败不再归因于浏览器链路，也不能把预执行阶段写成产品闭环通过。
- `unchanged` 合同补齐后，workflow-use 固定 wait 编译与运行时基线比较定点测试 2/2 通过，受管 fork digest 校验通过，API TypeScript 检查通过。同一失败来源 artifact `630e5962-4320-463a-8db8-c04fabdfac29` 离线重编译成功，生成 12 节点链路；其中 wait 节点携带动态 `url_digest + unchanged=true`，没有固化样本 URL。离线重编译只证明编译缺口关闭，仍不代替下一次正式产品准备验收。
- 新的唯一正式准备 requestId `208a8076-aa79-4838-804c-bc812b525fa9` 创建 job `4992d335-2734-4a70-87bd-8b174a1ec86d`。它复用上一 job 已成功关闭的不可变 source artifact，不再调用探索模型；从 18:25:56 到 18:28:26 完成 E2 编译、代表输入与独立复验并进入 `completed/ready`，产品状态为 `runnable`。两次正式验证 TaskRun `22bfe299-f0d6-4d05-8fd2-f611e8cd5112`、`b4dd2f3d-14d2-4de2-8937-0593d2245320` 均由 release 记录为模型调用 0；新 chain `7623b02a-f531-443b-87ab-71248f97e91b@1` 和 release `c65a526d-12b6-4d98-832c-636c57945e34@3` 已发布。后续人工冒烟已否决这份证据，不能据此关闭 B-U、I7 或 R5。

> 2026-09-21 18:29–18:30 用户现场验收否决 release v3：正式 execution `77a13a67-7dab-47a1-80b5-fa7c9e8dc90f` 虽被图运行投影为 completed、cleanup confirmed、模型调用 0，但搜索联想点击单节点耗时 55.2 秒且期间显示 `about:blank`。更关键的是发布链只有 `navigate → input → click 搜索联想 → click 首个作品卡 → wait`，没有读取剧集列表、选择执行时最新非预告正片或核验播放器播放状态。持久 Profile 的既有观看状态使样本偶然落到当前集，双验证没有证明动态选择边界；该 execution、两次验证和 release 只能作为失败验收证据，R2/R3/R5/I7 继续打开。

执行型任务完成证据修复开工记录：

```text
Product Alignment:
- natural-language task: 动态选择任务必须在链路中真实读取候选、选择执行时目标并核验最终浏览器状态，不能依赖持久浏览器的默认或历史状态碰巧满足
- reusable chain boundary: execution ResultSpec 只省略业务数据输出，不省略决定后续动作或证明完成条件的页面读取；无法编译的读取必须形成 gap，不能作为 agent_internal 被吞掉
- runtime inputs: 版本化任务输入、页面结构化候选、纯函数或显式 llm 的选择结果、稳定目标和节点后置条件
- dynamic task outputs: 可复跑读取/选择/动作/核验节点、明确模型审计和不可变新链；原有错误 release 与 execution 保留
- generic platform capability used: 现有 ActionCoverage、browser.read-fields、function/llm 节点、结构目标、ResultSpec 和修订发布合同
- replay model calls: 默认 0；只有链路中可见的显式 llm 节点可以调用模型，本修复不把 extract 模型调用隐藏成普通复跑
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 动态候选选择、完成状态读取和新标签导航收敛
- existing implementation in repository: workflow-use 已有 verified natural read、ActionCoverage、structure/history target、ConsumerReadiness；TaskChain 已有 capability/function/branch/llm；browser-use 提供真实 tab/page/DOM 公开 API
- mature candidates and pinned versions: 继续使用 workflow-use 0.2.11、browser-use 0.13.8、QuickJS 0.32.0 与现有 TaskChain runtime；不增加站点解析、选择器或浏览器库
- selected implementation: 先禁止 execution-only 原生 extract 在影响动作选择或最终完成时被排除；再复用结构化读取与显式计算/语义节点形成真实动态选择，并对新标签只接受完成授权导航的页面
- reused public surface: ActionCoverage/CompilationGap、ReadSpec、StableChain function/llm、TargetResolver、BrowserSession tabs/current page 和正式 revision/validation/release API
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有读取到链路节点/绑定的编译、完成证据硬门和页面所有权收敛；任务字段、候选规则和定位只保存为版本化链数据
- license/runtime/platform fit: 不新增依赖；Windows x64 当前实测，macOS arm64 仍未测
- browser/runtime/state ownership conflicts: 仍为一个 execution 一个浏览器 owner；不清 Cookie/localStorage/观看历史，而是禁止把既有状态当成选择动作
- replay model calls: 0，除非最终链明确含 llm 节点并在画布/审计中可见
- rejected candidates and evidence: 不按 Bilibili、剧集号、页面文案或 URL 写 special case；不把 null 输出、Agent done、同 URL wait 或两次相同 Profile 复跑当完成证明；不覆盖旧 release
- focused validation: execution extract 覆盖硬门、结构化动态选择与新标签导航定点测试；随后只对新不可变版本走正式 Workbench/API 验收
```

当前修订状态：

- R1 已从正式 headless Workbench/API 入口通过 Pi 搜索、候选 Question、充分追问、修订草稿、待决硬门、确认需求和重启持久化；需求阶段产品浏览器命令为 0。
- R2 的来源 judge/链尾 predicate 边界仍有效，但链路完成后 runner 清理异常会覆盖 execution 并误导到链路修复，因此运行完成门重新打开。
- R3 的服务端修订草稿、不可变版本、checksum/digest、验证和发布事实可复用；React Flow 固定网格、全部异常边默认展开和 JSON 详情不满足可读工作台退出条件，因此重新打开。
- R4 已形成“符合预期 / 调整链路 / 重新梳理需求”三条回流，局部问题进入 R3 草稿，整体问题携带运行摘要形成新需求版本。
- R5 历史结构化结果 `work/minimum-product-loop-1789921035029/result.json` 保留；它未覆盖后续清理异常恢复和真实复杂链画布可读性，当前重新打开。

R1 开工记录：

```text
Product Alignment:
- natural-language task: 用户在需求对话中用业务语言确认最终结果、来源、范围、动态词、风险和预期；缺少 URL 时由访谈 LLM 决定搜索词并判断宿主返回的原始结果
- reusable chain boundary: 已确认需求版本只消费宿主持久化的用户决定、来源解析事实和已清零的待决事项，供后续任意浏览器任务准备复用
- runtime inputs: 用户消息、Question Panel 回答、LLM 发起的只读搜索请求、真实结果 ID 与候选选择；不要求 startUrl、selector 或 JSON
- dynamic task outputs: 版本化需求草稿、来源候选/选择、待决事项状态、确认需求合同和审计事实
- generic platform capability used: Pi ResourceLoader/extension/tool registry、AI Connect 公共 Authoring/Question、现有 InterviewState/SQLite 事实源、Zod 边界和 TaskRequirement 版本仓库
- replay model calls: R1 只发生在需求对话；普通 TaskChain 复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 需求对话中的 Pi 搜索工具发现/执行、通用只读后备、LLM 候选判断与引用校验
- existing implementation in repository: AI Connect/Pi AgentSession 已提供宿主 custom tool、公共 Question 和模型连接；共享 adapter 现已提供受控 extension/package 来源、active-tools 与 typed lifecycle，仓库继续复用 Bing RSS、tldts、Zod 和 SQLite/Drizzle
- mature candidates and pinned versions: Pi 0.84.2 的 `DefaultResourceLoader` 与 active-tools；`pi-web-access` 0.30.0（MIT，源码 commit `6c5afa1d0d43eef8552284ad73f4bd9f0612a378`）复用 Pi `modelRegistry` 可用凭据，并为没有原生搜索能力/搜索密钥的连接提供 keyless 后备；Bing RSS 是 B-A-T 最后一层后备
- selected implementation: 由 Pi 加载受控 `pi-web-access` package，需求访谈只激活 `web_search` 并与宿主 `search_sources`/`present_source_candidates` 合并；访谈 LLM 决定是否搜索、查询词、使用主工具还是后备及候选语义；宿主只观察工具事实、校验真实 URL 引用并持久化。模型设置只管理模型连接
- reused public surface: Pi `DefaultResourceLoader`、package `pi.extensions`、`pi.registerTool()`、active-tools、`modelRegistry.getApiKeyAndHeaders()`、extension lifecycle/result；`pi-web-access` provider routing/keyless fallback；RSS 2.0 item；AI Connect Common Question；tldts parse
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有 extension/tool allowlist、结果证据规范化、候选引用校验、持久化和 Question 映射；不复制凭据、不维护 provider 矩阵。R1 已无实现缺口并已通过 R5 组合复验
- license/runtime/platform fit: 仅用于本地个人工作台的候选展示，不把搜索结果提交为页面执行证据；Windows Node 24 当前范围，macOS arm64 延期未测
- browser/runtime/state ownership conflicts: 来源解析不启动任务浏览器、不读取 Profile、不登录、不点击；正式准备仍独占浏览器会话
- replay model calls: 来源解析只发生在需求对话；普通复跑为 0，显式 llm 节点除外
- rejected candidates and evidence: 拒绝按 Anthropic/Qwen/Doubao 等供应商在 B-A-T 业务代码中维护搜索矩阵；拒绝在模型设置旁增加网页搜索项；拒绝删除 Bing 后备；拒绝复制 Pi extension/runtime。`pi-web-search` 1.6.0 缺少非原生模型的通用后备；`pi-web-access` 可选命令凭据来源因 Windows 两项测试失败而不启用
- focused validation: `opencode` extension/custom tool 与多 assistant item 整轮输出投影测试 3/3（13 assertions）、包类型检查、平台持久化/confirmed tests 11/11（51 assertions）通过；正式同步 digest 为 `52e0e9c6630c47cb41874591dc4e5e9f7db36aca8180e4fca47b379b91be01f5`。B-A-T 实际 ResourceLoader 加载 1 个 extension、`web_search` 注册恰好一次；来源合同测试 4/4 与 API 类型检查通过；正式 headless Workbench 验收通过
```

R1 完成证据：

- 正式入口为根级 `npm run accept:requirement-dialogue`；API workspace 的 `preaccept` 必须先构建当前 Workbench，避免用旧 `dist` 验证新服务端。验收不使用 runtime 直调、mock 或 fixture 代替产品交互。
- `work/requirement-dialogue-workbench-unique-2026-09-20T15-44-31-667Z` 从 headless Workbench 新建需求，Pi 工具顺序为 `web_search → present_source_candidates`；用户通过 Question Panel 确认 `bilibili.com`，随后确认“多个备案相关编号全部返回”，纠正产生草稿 v2 且旧版本保留，最终确认 requirement v2。共 4 次需求对话模型调用，未决事项 0，产品浏览器命令 0。
- OpenCode 公共根因修复将一次 Main invocation 中多个成功 assistant item 的规范文本按顺序组成整轮输出；每个 item 只替换自己的 provisional delta，错误或取消只回滚该 item。候选 entry identity、整轮 output hash 与 private ancestry hash 保持独立，符合 ADR-0054；因此工具调用前正文、工具轮和空 final item 不再被错误改判为 `generation.failed`。

- 2026-09-20 搜索可选性修正：删除“新任务必须先产生 URL 来源事实”的服务端硬门；已经发起的来源解析仍必须由用户结算，未发起搜索的需求可把用户确认的业务来源边界保存在 Markdown 中并由准备任务调查技术入口。`TaskRequirement.confirmationFacts.sources` 只保存真实搜索/用户 URL 证据，允许为空；provider 为通用工具来源标识。Pi `web_search` 与 Bing 后备共用真实 URL 引用合同，`requirement-source-resolution.test.ts` 4/4、API 类型检查通过。
- contracts 与 API TypeScript 检查通过；Workbench 生产构建通过。`requirement-source-resolution.test.ts` 3/3 通过，覆盖原始结果不被宿主语义筛选、模型提案决定 outcome、真实候选 ID 校验、Question 回写、待决确认硬门、来源决定和结果预期持久化及重启读取。
- 唯一候选：`work/requirement-dialogue-workbench-unique-2026-09-20T10-47-03-095Z` 从 headless Workbench 新建任务，持久化 AI 事件顺序为 `search_sources → present_source_candidates`；连续确认来源、实际链接、备案类型，用户纠正产生草稿 v2 且 v1 未改写，最终确认 requirement v2。模型调用 5，产品浏览器命令 0。
- 多候选：`work/requirement-dialogue-workbench-multiple-2026-09-20T10-49-19-161Z` 由 LLM 从原始结果提交两个 Mercury 候选，Question Panel 选择后继续澄清标题与链接语义；确认 requirement v1。模型调用 5，工具顺序 `search_sources → present_source_candidates`，产品浏览器命令 0。
- 无候选：`work/requirement-dialogue-workbench-none-2026-09-20T10-51-42-386Z` 由 LLM 对第一轮原始结果提交 `none`，用户在自由输入 Question 补充新业务身份后重新搜索；旧无候选事实标为 `superseded`，新来源经 Question Panel 确认并形成 requirement v1。模型调用 5，两次工具顺序均为 `search_sources → present_source_candidates`，产品浏览器命令 0。
- 生产源码定点扫描未发现 Bilibili、Mercury、备案号、测试虚构名称或已删除的排名/词表符号；测试样本中的站点和字段仅作为冻结验收数据。自动验收全程 headless，正式工作台数据摘要未被写入。

R2 开工记录：

```text
Product Alignment:
- natural-language task: 已确认需求进入准备后，系统只研究真实页面上的实现方法；现场出现会改变来源、范围、选择或结果含义的歧义时返回需求对话，发布链路正常到达完成终点即记为技术完成
- reusable chain boundary: 准备来源只证明真实浏览器动作、读取、输出合同和可编译证据；正式运行只消费不可变 TaskChain 图、节点合同、浏览器状态和预算
- runtime inputs: 已确认需求版本、计划步骤输入、发布链路版本及本次业务输入
- dynamic task outputs: 可复跑链路候选、准备阶段的需求回流事实、正式运行状态、节点输出与错误证据
- generic platform capability used: browser-use Agent 的公开运行/回调、LangGraph StateGraph、TaskChain 节点和输出合同、SQLite 运行审计
- replay model calls: 准备阶段允许探索模型；普通 TaskChain 复跑仍为 0，只有显式 llm 节点可以调用模型
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 真实页面准备、确定性链路执行和技术完成判定
- existing implementation in repository: browser-use Agent 已负责首次浏览器探索；LangGraph StateGraph 已负责链路推进、分支、循环、取消和递归上限；现有 TaskChain runtime 已负责节点、合同、浏览器和预算错误
- mature candidates and pinned versions: browser-use 0.13.8 与 workflow-use 0.2.11 受管 fork；现有 LangGraph 运行图
- selected implementation: 继续复用 browser-use 完成代表任务但关闭其链尾 judge；保留采集/编译的动作、DOM、读取和输出合同校验；正式运行以合法 completed terminal 和真实错误为唯一技术完成边界
- reused public surface: Agent.run、公开 step callbacks、结构化输出、StateGraph 图执行及现有 TaskChain capability/runtime
- B-A-T-owned adapter and remaining gap: B-A-T 只适配来源证据、编译合同、需求歧义回流、不可变版本和运行审计；不增加第二套语义完成判断
- license/runtime/platform fit: 保持当前已固定依赖和 Windows Node 24/Python 3.12 路径；macOS arm64 仍按用户决定延期未测
- browser/runtime/state ownership conflicts: 准备仍只占用一个专用持久浏览器会话并在 finally 关闭；正式复跑不把控制权交回探索模型
- replay model calls: 关闭准备来源 judge 不影响首次探索；正式复跑除显式 llm 节点外不调用模型
- rejected candidates and evidence: browser-use judge、来源 sourceValidated 以及链路结束后的 chain/step/plan completion predicate 二次改判都会在真实节点已成功后制造链外语义失败，因此不作为完成门
- focused validation: 准备来源不发起 judge 调用且仍拒绝真实输出合同错误；正常图到达 completed terminal 稳定完成，真实节点/输出合同错误仍失败；准备编译出现 confirm_intent 时持久化回流事实并引导需求对话
```

R2 完成证据：

- browser-use 代表执行已设为 `use_judge=False`，不再创建 judge 模型、不再读取 `history.is_validated()`、不再因 judge 反馈重跑；模型桥的准备用途只允许 `agent`、`extract` 和 `semantic_annotation`。新 normalized trace 使用 version=2 且没有 `judged`，旧 version=1 只读兼容，即使历史 `judged=false` 也不会成为新编译门。
- 新 hybrid 来源结果删除 `sourceValidated`；旧 source/artifact 的该字段仅作可选只读兼容。候选仍要求 Agent 正常结束且结构化输出通过 JSON Schema，动作派发、DOM/读取证据、编译 gap 和输出合同没有被放宽。
- TaskChain completed terminal 直接形成 completed 并把实际 terminal id 写入 `completionEvidence`；计划执行器不再在步骤和计划结束后用 completion predicate 二次改判。最终计划输出仍通过已发布 `outputContract` 校验，目标定位、节点派发、浏览器、预算、人工等待与取消错误路径保持不变。
- 准备编译出现 `confirm_intent` gap 时保存 `preparation.requirementReturn`，产品投影变为 `needs_requirement / continue_interview`，Workbench 显示“返回需求对话确认”而不是“重新准备”。
- 最小验证通过：contracts、runtime、API、Workbench TypeScript 检查；Python 定点 2/2 证明无 judge 即可接受合同化结果、新 trace 无 judge 且旧 v1 `judged=false` 可兼容；runtime 定点 1/1 证明假 completion predicate 不改判而真实节点与输出合同错误仍失败；API 定点 2/2 证明 chain/step/plan 合法结束为 completed，以及 `confirm_intent` 持久化并路由需求对话。未重复旧七项全流程。

该时点曾将 P1 不可变发布和 P3 直接运行事实保留，并按
[需求对话、任务准备与链路修订产品基准](REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md) 重新开放 R1–R5；随后一轮证据曾关闭这些门，
但 2026-09-21 第三次正式复跑和画布复盘已再次打开 R2、R3、R5。

下列 P1–P6 段落只记录此前实现和验证历史；修订后产品门是否关闭以本页顶部和 R5 记录为准。

## 产品最小闭环 P1

```text
Product Alignment:
- natural-language task: 用户确认浏览器任务并完成准备后，从同一任务获得可持久化、可直接运行且不会静默换链的产品状态
- reusable chain boundary: 一个不可变可运行版本固定需求、计划、全部步骤链路及样本/换输入验证证据
- runtime inputs: 当前可运行版本输入合同校验过的默认业务输入与执行节奏
- dynamic task outputs: 唯一产品状态、唯一主操作，以及后续正式运行绑定的版本事实
- generic platform capability used: 既有 requirement/plan/chain/version digest、ValueSchema、validation execution、SQLite/Drizzle 持久化
- replay model calls: P1 只建立发布、预设和状态事实，不调用模型；普通复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

P1 已完成：

- 新增不可变 `RunnableTaskRelease`，固定 requirement id/version/revision/digest、plan version/digest、全部步骤 chain version/executable digest、真实 sample/verification 运行证据、输入合同和结果形态。
- 新增绑定当前 release 的任务级 `TaskRunPreset`；默认业务输入再次通过有限 ValueSchema 校验，pacing 不进入链 digest。新 release 发布后旧 preset 自动失效，不会迁移成幽灵默认值。
- SQLite 原子迁移到 v12，release 与 preset 重启后保持同一引用和 digest；已发布 release 拒绝改写。
- `TaskProductProjection` 只从访谈、job、当前 release、preset、正式 execution 和 archive 事实产生一个状态与一个主操作；样本/换输入验证 execution 不会投影为正式完成。
- 正式 `authorize_plan` 已收紧为当前 release 执行门，execution 保存 release 引用并逐步骤消费发布清单中的 chain reference；不再在启动时选择数据库最新 verified chain。候选 chain、缺失/失效 preset 均不能创建正式 execution。

P1 聚焦证据：contracts 与 API TypeScript 检查通过；`task-product-state.test.ts` 1/1 通过，覆盖候选拒绝、真实验证证据、不可变发布、重启、失效 preset 和精确 execution 绑定；既有单链“样本→换输入→发布→正式复跑”定点用例通过，普通运行模型调用仍为 0。受管 fork 清单同时修正了 5 个 Windows 换行摘要，实际 `verifyForkSource()` 返回 digest `6354856c9624a2b44589c64bca872e1b4ac3f70c04843017d6356a0bd55be4cb`。既有多步骤 authoring 定点用例在发布逻辑前被测试环境 `model_account_not_found` 阻断，单独记录为基线环境阻塞，未写成 P1 通过证据。

## 产品最小闭环 P2

```text
Product Alignment:
- natural-language task: 用户确认需求后只发起一次“准备任务”，系统持续完成规划、真实预执行、编译和两组输入验证
- reusable chain boundary: 同一持久化 prepare job 串联既有 authoring、preexecution、compile、validation 与 release 发布能力
- runtime inputs: 由有限 ValueSchema 生成的代表业务输入和不同验证业务输入
- dynamic task outputs: 当前准备阶段、必要的业务输入请求、人工等待以及最终可运行产品状态
- generic platform capability used: 既有 TaskChainAuthoring、计划验证 execution、ValueSchema、P1 release/preset 与任务状态 API
- replay model calls: 样本和换输入验证只执行编译链；除链内显式 llm 节点外模型调用为 0
- site/task-specific code added: no
```

P2 已完成：

- 新增持久化 `prepare` job；它按固定阶段推进规划、代表输入预执行、链路编译、样本验证、不同输入验证和发布，不另建 runtime 或第二套调度器。
- 代表输入或不同输入不能安全自动取得时，通过同一 job 的 `inputRequest` 返回有限 ValueSchema 业务表单；等待人工的验证运行保留同一 execution，恢复后继续原 prepare job。等待输入的 job 在服务重启时不会被错误中断。
- 规划提示词和宿主校验不再要求 `startUrl` 运行输入；入口、URL 和页面路径归需求及预执行确认，运行合同只保留每次变化的业务值。
- 正常 Workbench 主路径收敛为“需求对话 / 准备任务 / 运行结果”；准备页提供单一主操作、六阶段进度、业务表单和折叠历史，不再暴露原始 JSON、链路编辑页、样本/换输入按钮或 E1–E4 术语。

P2 聚焦证据：Workbench 与 API TypeScript 检查通过；`task-chain.test.ts` 中“准备任务用同一持久化流程完成规划、业务输入、双验证和发布”定点用例 1/1 通过，最终状态为 runnable，release 与 preset 均由两次真实验证事实发布。测试中的两次普通验证模型调用为 0。运行该定点命令前曾因 npm 参数位置错误启动 API 测试脚本，发现后立即中断；仅有 3 个无关用例先完成，未将其计入 P2 证据。

## 产品最小闭环 P3（历史列表入口实现，已被 ADR 0010 取代）

以下记录保留当时服务端运行与表单实现证据；“从任务列表直接运行”的入口决定已失效。当前要求是列表只选择任务，发布链路在链路运行台直接运行并绑定单次 execution。

```text
Product Alignment:
- natural-language task: 用户从任务列表直接运行或再次运行已准备好的任务，并可按业务字段调整本次输入和节奏
- reusable chain boundary: 每次正式运行只消费当前不可变 release 中固定的计划和步骤链路引用
- runtime inputs: 当前 preset，或经同一有限 ValueSchema 校验的本次业务输入，以及 0–5000ms 节点 pacing
- dynamic task outputs: 独立 execution/run 记录、任务列表产品状态和运行入口
- generic platform capability used: P1 release/preset、queuedExecution、全局服务队列、ValueSchema 递归表单和请求幂等账本
- replay model calls: 普通运行继续只消费普通节点；只有 release 内显式 llm 节点可调用模型
- site/task-specific code added: no
```

P3 已完成：

- 新增正式 `run_task` 命令；请求必须显式携带当前 release id/version/digest，服务端重新核验 requirement、plan、全部 chain、输入合同、preset 和全局浏览器工作所有权后才创建 execution。
- 不传覆盖值时直接消费当前 preset；本次可覆盖业务输入与 pacing，并可选择把两者保存为当前 release 的新默认值。失效 preset 或非法 ValueSchema 输入不会创建运行。
- operation 账本以 requestId 幂等：双击、响应丢失后的同请求重试和轮询不会重复建档；前一次结束后的新 requestId 会创建独立 execution。
- 任务列表直接显示产品状态与唯一主操作“运行 / 再次运行 / 填写输入”。有效 preset 一次点击运行；业务表单、默认值选择和 pacing 位于同一可键盘/触屏操作的对话框，不要求进入准备页。

P3 聚焦证据：contracts、API 与 Workbench TypeScript 检查通过；`task-chain.test.ts` 中“P3 任务直接运行固定 release 和预设，幂等请求不重复且合法再次运行独立建档”定点用例 1/1 通过。证据覆盖同 requestId 只产生一个 execution、忙时第二请求拒绝、默认 preset 直跑、覆盖输入/pacing、保存默认值、第二次合法运行独立建档以及非法输入不启动运行。

## 产品最小闭环 P4

```text
Product Alignment:
- natural-language task: 用户在结果页得到业务结果或执行回执，处理人工等待，并只在确定性失败时显式授权生成修复版本
- reusable chain boundary: 原 execution/run/checkpoint 原位恢复；修复以失败 execution 证据为输入生成新 chain 版本并重新通过两组输入验证
- runtime inputs: 原运行输入、当前浏览器现场核验结果，以及旧 release 中另一组已验证业务输入
- dynamic task outputs: 类型化结果展示、失败分类与证据摘要、修复 job、新 release 和保留的旧版本/运行历史
- generic platform capability used: ResultSpec、TaskRun checkpoint、idempotency、authoring、计划验证、release 发布和模型审计
- replay model calls: 正常运行仍只允许显式 llm；只有用户点击“授权模型修复”后才启动修复 authoring 模型用途
- site/task-specific code added: no
```

P4 已完成：

- 正式 execution 新增类型化产品结果：`execution` 任务只给出完成步骤与证据回执，`data` 任务才携带合同化业务输出；queued/running/completed/partial/waiting/paused/blocked/failed/cancelled/stale 均保存明确状态、摘要和下一步。
- 失败证据固定分类、代码、execution/run/checkpoint/事件位置、原因和 digest。确定性失败标记为可修复；账号、验证码、访问限制、限流等 external failure、版本失效、预算和取消均不会出现模型修复授权。
- 结果页只把正式运行作为主历史，分开呈现执行回执和业务结果；人工等待可从同页核验现场并恢复同一 execution/run，技术步骤与验证运行折叠保留。
- 新增显式 `authorize_repair`：只有用户确认失败证据后才创建 repair job；失败证据进入新的真实 authoring 请求，新 chain 候选先验证失败输入，再验证旧 release 中另一组不同输入，全部通过后才发布新 release。旧 release、失败 execution 和全部运行历史不改写。
- 服务重启继续保留 waiting execution/run/checkpoint。对无数据 capability，恢复现场核验成功后不会重新派发原副作用，也不会因原浏览器命令预算已消费而阻止无副作用继续。

P4 聚焦证据：runtime、contracts、API 与 Workbench TypeScript 检查通过；P4 修复定点用例 1/1 通过，覆盖“未点击无 repair job → 显式授权 → 失败证据 digest 一致 → 新候选两次验证完成 → release v2 发布且 v1 保留 → external 阻断拒绝修复”；P4 人工等待重启定点用例 1/1 通过，重启前后 execution id 和 run id 均未变化，恢复后原运行完成。

## 产品最小闭环 P5

```text
Product Alignment:
- natural-language task: 用户在桌面或窄屏工作台中辨认任务状态，并只沿当前唯一主操作完成准备、运行、人工恢复或显式修复
- reusable chain boundary: UI 只投影任务、当前不可变 release、preset、prepare job 和正式 execution 的服务端事实
- runtime inputs: 有限 ValueSchema 业务字段、当前默认值和 pacing
- dynamic task outputs: 连续准备/运行进度、最后更新时间、业务结果或执行回执，以及可恢复错误
- generic platform capability used: React、Radix UI、TaskProductProjection、类型化结果和正式 task-chain 命令
- replay model calls: 视觉和交互层不增加模型入口；普通运行仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

P5 已完成：

- 新增统一产品状态呈现层，侧栏、顶部栏、准备页和结果页共用状态文案、色调、图标语义和最后更新时间；关键状态同时有文字与图形，不只依赖颜色。
- 任务列表主操作始终可见，并能把同一任务直接带到准备或结果视图；运行请求中全部入口共享 pending 状态，重复点击期间明确显示“正在创建”，不产生第二次派发。
- 准备页和结果页补齐连续阶段、当前步骤、更新时间和 `aria-live` 反馈；运行回执、业务结果、人工等待和有模型成本的修复授权保持不同层级，技术事实继续位于折叠区。
- ValueSchema 表单补齐业务 label/name、长度约束、数值输入模式、错误后首字段聚焦；Dialog/Callout/Field、长标题、长错误、空状态、触屏目标和安全区样式统一。
- 主工作区加入键盘跳转，焦点轮廓、窄屏约束、换行、点击反馈与 reduced-motion 规则完成；桌面继续保持深色、克制的任务状态轨道视觉。

P5 聚焦证据：Workbench 生产构建通过（5048 modules；仅保留既有大 chunk 性能警告）；隔离的正式 Workbench/API 页面以 headless Chromium 在 1440×1000 和真实设备指标 390×844 下完成截图检查，后者 `innerWidth/clientWidth/scrollWidth` 均为 390 且主操作未被裁切。键盘首个 Tab 命中“跳到主工作区”，Enter 后焦点进入 `#main-workspace`；`prefers-reduced-motion: reduce` 媒体覆盖生效。实际计算色值下主标题/背景对比度为 16.26:1，次要文案/背景为 9.01:1；主路径源码未发现 `outline: none`、`transition: all`、`autoFocus` 或可点击 `div`。

## 产品最小闭环 P6

```text
Product Alignment:
- natural-language task: 用户从自然语言需求准备并发布任务，随后直接运行、换业务输入、处理人工等待、授权确定性修复并查看结果
- reusable chain boundary: 正式任务、不可变 release、合法 preset 与固定 requirement/plan/chain digest 共同形成唯一可运行投影
- runtime inputs: 有限 ValueSchema 业务字段和 pacing；入口、URL、页面路径及可选准备动作来自需求与预执行证据
- dynamic task outputs: 执行回执、业务结果、人工等待、外部阻断、修复新版本和完整运行审计
- generic platform capability used: Workbench/API 产品命令、TaskProductProjection、TaskChainRuntime、受管 Browser capability 与持久化恢复
- replay model calls: 普通复跑为 0；本轮发布链不含显式 llm 节点
- site/task-specific code added: no
```

P6 当时已完成（历史结论，不满足后续 R1–R5）：

- 七类独立验收均由正式 Workbench/API 产品入口创建和恢复任务；完整结果为 `completed=true`，没有直接调用 runtime 伪造完成态。
- 执行型任务在服务重启后仍从任务列表绑定同一 release 直接运行并再次运行；数据型任务用同一发布版本分别输入 `alpha`、`beta`，得到对应业务结果，两次普通运行的模型调用均为 0。
- 人工等待跨服务重启后以同一 execution、同一 run 恢复；已完成副作用没有重复派发。HTTP 429 被分类为不可修复的 external block，模型修复请求被拒绝。
- 确定性后置条件失败只有在用户授权后才生成 repair job；新 release v2 通过两组输入验证后发布，旧 release、失败运行和审计保留。预执行证明的可选准备动作只在原目标未就绪时执行，正常路径跳过。
- 正式 Workbench 的桌面、390px 窄屏、键盘跳转、reduced-motion、双击幂等和断网后的同请求恢复全部通过；隔离 Chromium、API、受控站点和产品浏览器在验收后均已释放。

P6 聚焦证据见 [产品最小闭环验收记录](evidence/browser-replay-repair/MINIMUM_PRODUCT_LOOP_ACCEPTANCE.md)。原始结构化结果位于 Git 忽略的 `work/minimum-product-loop-1789843205619/result.json`；桌面和窄屏截图位于同目录 `screenshots/`。Windows x64 为本轮已验收范围；macOS arm64 仍按用户决定延期且未测。

Product Alignment:
- natural-language task: 按运行输入中的完整查询读取两页记录，并在第二页非空时读取首条详情。
- reusable chain boundary: 宿主从原生页面读取反向形成通用记录投影；未实际 dispatch 的失败探测不进入复跑图。
- runtime inputs: 完整起始 URL 与当前浏览器页面状态。
- dynamic task outputs: 两页实际记录及条件详情。
- generic platform capability used: 既有 ReadSpec、ResultBinding、动作覆盖账本和 TaskChain 控制流。
- replay model calls: 0。
- site/task-specific code added: no

| 模块 | 状态 | 当前事实 |
| --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 已通过 | 受控正式入口和真实 GitHub Issues 任务页均通过；来源业务结果及 judge 验证成功 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 已通过 | P1–P6 完成；真实 GitHub B 的 E1/E2/E3/E4 已通过，普通复跑模型调用为 0 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 已通过 | 动作准备/命中、单次派发、具体后态、取消与恢复已通过受控及真实可见 Chrome 独立验收 |
| [D 复跑干扰与显式节点](replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md) | Windows 当前范围已通过 | D1/D3/D4/D5 通过；D2 Windows x64 通过；macOS arm64 延期且未测 |
| [产品最小闭环](MINIMUM_PRODUCT_LOOP.md) | R2/R3/R5 重新打开 | R1/R4 历史证据保留；执行清理误分类、不可复跑和画布不可读尚待 I1–I7 关闭 |
| [正式复跑恢复与链路工作台](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md) | I0–I5 已完成；I6–I7 待开发 | cleanup/accepted execution/event、服务端 presentation/descriptor/不可变发布事实和正式 Workbench 单次 execution 运行台已通过；动作编辑体验与最终正式验收尚未实现 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 未通过当前门 | 历史 `completed=true` 与两次零模型复跑保留；第三次正式复跑失败使稳定闭环结论失效；macOS arm64 延期且未测 |

A 的受控 Chromium 验收在一个 Browser 会话中覆盖 37 个动作、120 个真实 DOM 事件和 42 个业务副作用；
dispatch/result、动作前后 observation 与保存加载均完成对账。真实 GitHub Issues 任务随后在同一个产品 Browser 会话内完成
两页列表及第二页首条详情，`sourceSuccess=true`、`sourceValidated=true`，结束后测试 Chrome 进程数为 0。编译仍保留 10 个
B/C/D 缺口，因此 A 通过不等于已有可冻结 TaskChain。详细事实见
[A 验收记录](evidence/browser-replay-repair/A_ACCEPTANCE_CONFORMANCE.md)。

B 的真实变输入验收使用 Issues 入口运行，job `aaa920b8-0d5c-47d2-81ef-14ec8253a8e7` 在同一 Agent/Browser 中产生两个
`done`：首次业务阶段后，编译字段缺口触发了唯一一次 follow-up；最终 `sourceSuccess=true`、`sourceValidated=true`，共 39 个
浏览器命令和 49 次 provider 调用。补证架构已实际工作，但 B 未通过：最终仍有 11 个编译缺口，其中 4 个字段读取、3 个
postcondition、2 个 URL 绑定、1 个具体效果和 1 个输出装配缺口。字段读取固定失败分别为：详情把含派生字段的完整对象误当作
纯 DOM 对象；第一页集合 selector 返回空样本；第二页投影合同错误曾被折叠成未知工具错误。当前代码已改为指导逐叶读取、复用
同页已证明匹配的集合 selector，并把投影合同错误保留为固定诊断；这些改动只完成定点测试，尚未再次执行真实 GitHub 验收。
复盘确认该方案仍把 raw CSS 暴露给模型，无法从协议上禁止它新增父子组合，因此已停止继续扩展 selector 提示词。B 的当前修复方向改为：
复用 Browser-Use 当前 selector index 和完整增强 DOM 树，以有界局部 DOM 的 opaque node refs 表达字段来源，由适配层机械生成并反查
定位表达，模型不再提交 CSS。

opaque refs 首次真实 GitHub 运行 job `a82fc922-e3ba-441f-8919-8532ebd4b9db` 完成 28 个浏览器命令和 37 次 provider
调用，`sourceSuccess=true`、`sourceValidated=true`，但没有产生 `bat_read_fields`，最终保留 15 个编译缺口。真实原因不是 DOM
定位失败：Browser-Use 在 `ActionResult` 同时有 `long_term_memory` 与 `extracted_content` 时默认只向模型展示前者，导致成功的
`bat_inspect_dom` 只显示“检查了 N 个节点”，模型看不到 `dom-*` refs。当前修复改用其原生
`include_extracted_content_only_once` read-state surface，把 refs 仅暴露给紧邻的一轮模型，同时继续从持久化证据中移除局部 DOM 文本。
该修复完成定点验证后再执行一次真实 B；未出现成功的字段读取和零关键缺口前，B 仍不通过。

服务重启后的真实 job `d08d1dc5-5a02-4817-85e7-b51bc8b2280d` 证明 refs 已进入模型：共 28 个浏览器命令、37 次
provider 调用，模型实际提交了 5 次 `bat_read_fields`。五次都以同一固定错误 `dom_reference_container_mismatch` 失败，最终
`sourceSuccess=true`、`sourceValidated=true` 但仍有 12 个编译缺口。canonical ActionResult digest 已反算确认错误；根因是曾从
Browser-Use 的裁剪增强树推算 `:nth-of-type`，其兄弟序号不等于完整 live DOM。当前代码已改为从 opaque backend node 经
Browser-Use `Element.evaluate` 取得完整 live DOM 路径并反查同一 backend id；定点测试覆盖“增强树漏掉普通兄弟但 live DOM
路径仍正确”。本轮不再重复真实任务，待该不变量完成本地交付检查后再安排下一次 B 验收。

该不变量现已完成真实 Browser-Use 短验收。受控页同时包含两个结构不同的重复记录、普通同标签兄弟，并在 inspect 后动态
插入新兄弟改变 `nth-of-type`；`bat_read_fields` 仍从原 backend nodes 正确读出两条 title/state 记录。根因补充为 Browser-Use
Actor 在 backend id 转 Element 前要求当前 CDP document 已初始化；旧代码直接 `Page.get_element` 会抛
`Document needs to be requested first`。当前复用共享的主文档初始化/身份核验，再读取 live DOM 路径；替换已保存字段节点后
固定返回 `dom_reference_field_mismatch`，不会读相似节点或退回未知错误。13 个 authoring 定点测试通过。尚未再次运行真实 GitHub B。

当前正式入口随后只运行了一次真实 GitHub B，job `58786140-294c-4f29-8cd0-d23254379d39` 完成业务输出，
`sourceSuccess=true`；详情正文与标题两次 `bat_read_fields` 均成功，证明 document 初始化修复在真实页面成立。运行最终未进入
可物化编译：共 49 个浏览器命令、55 次 provider 调用，第三次列表记录读取以固定错误
`dom_reference_outside_container` 失败，最终 judge 未通过，`sourceValidated=false`，job 在 E0 以
`hybrid_successful_judged_source_required` 停止。准确 trace 显示模型选择的 5 个字段 refs 有效，但误把标签节点同时声明为整条
记录的父容器。当前协议已删除模型可填的 `containerRef`；每条 record 只提交字段 refs，适配层从同页真实父链求有界最近公共祖先，
拒绝文档根范围，再用 live backend ids 反查。DOM 固定错误也会进入进度事件，不再折叠为 `unavailable`。15 个 authoring 定点测试
和 fork source manifest 校验通过；尚未再次消耗真实 GitHub 运行。

交互目标的跨页面链接已独立于上述字段读取缺口完成一条模型为零的纵向切片：authoring 证据保存 Browser-Use
`DOMInteractedElement` 的完整哈希、稳定哈希、XPath、AX/身份属性摘要，编译产物新增 `history` 目标；runtime 在每次新 DOM
快照中按 Browser-Use 原生层级重新匹配当前 selector index，并把同层多候选作为歧义失败。真实短验收覆盖两个不同站点：
`example.com` 链接从 index 19 重建为 39 后点击并进入 IANA；`python.org` 搜索框从 index 221 重建为 2211 后输入并读回
`asyncio`。两次均未调用模型且 Browser 在 `finally` 中关闭。该结果只证明交互目标重绑定，不把字段读取、动作后置条件或完整
TaskChain 编译宣称为已通过。

随后又完成正式产品短链：真实首次浏览器在 Python 官网捕获 `navigate + input` 来源，生成零 gap 的
`workflow-use-source/v2`，`materializeHybridChain` 生成两个普通 capability 节点；首次浏览器关闭后，由新的
`withHybridCapabilities + TaskChainRuntime` 会话复跑并完成，消耗 3 个浏览器命令、0 个 LLM 调用、0 条模型审计，
`auditComplete=true`。该链同时暴露并修复了一个独立适配错误：Browser-Use 动作回执对象曾被返回给输出契约为 `null` 的
节点，导致首个 `navigate` 在目标重绑定前即类型失败；当前 host 按节点输出契约丢弃 unit 动作回执，非 unit 输出保持不变。
受控短链没有真实 agent/judge 调用，因此只验证 source artifact、正式物化和正式复跑，不伪造模型审计越过 candidate artifact 门。

消费者驱动的异步就绪已完成第一条通用实现切片：编译器不再要求先识别分页、筛选、导航或弹窗，而是把一个有副作用动作连接到
其后第一个已经验证的结构化读取。导航生成 `ready`，同文档 UI/外部状态动作生成 `transition`；运行时在动作前读取同一投影基线，
动作只执行一次，随后等待投影转换并连续两次一致。动作创建消费者时允许从不可读转换为稳定可读；歧义和无效定位不作为“仍在加载”。
下一个交互目标的解析同样只对缺失/作用域未到达做 30 秒内有界重试，多候选立即失败。该切片复用现有 StepVerifier/Tenacity，
没有新增模型工具、场景枚举、浏览器或调度器。5 个新增 Python 测试、包含历史目标与 authoring 的 23 个相关回归、2 个
TypeScript IR 边界测试、2 个相关物化回归、API 类型检查、Python 静态检查和受管 fork manifest 校验均通过；真实 GitHub B 与不同输入 E4 尚未执行。

记录投影与结果装配已继续接入同一链路。正式 authoring 入口不再向模型注册 `bat_inspect_dom`、`bat_read_fields`、
`bat_wait_for`、`bat_scroll_to`、`bat_summarize`，也取消了业务完成后的第二轮模型补证。宿主现在在原生 `extract` 回调中从同一
增强 DOM 机械寻找唯一字段节点、最近记录祖先和跨记录共同子路径，再用 live DOM 双读验证现有迁移 `ReadSpec`；只有两次稳定结果
与原生业务值完全一致才形成读取节点。重复值无唯一锚点、字段多义和结构不一致均失败关闭。受控真实浏览器短验收中，输出 schema
上限为 5、页面实际只有 2 条且两条之间插入普通兄弟；宿主返回 2 条，生成 `body > main.issues > article.issue`，相对 `href`
确定性解析为绝对 URL，未使用 `nth-*`，浏览器与本地服务均已关闭。结果配方同时支持唯一同 schema 的运行输入整体绑定和需求原文
授权字符串常量；重复输入值不取第一个，动态数组不展开为固定索引。当时正式 `RecordProjection` 结构目标 IR、真实 GitHub B 和 E4 尚未冻结/执行。

随后按正式入口只运行了一次真实 GitHub B：job `6d6c0e9e-4ab7-4f06-8429-1585046ece55`、source artifact
`94b83d3b-f21e-4cc0-8b9c-44bf1b19e103`、browser run `69146779-fbde-42c5-8c4a-2d75a7add180`。Agent 在同一会话中完成
两页各 5 条 Issues、进入详情并返回业务报告，`sourceSuccess=true`、`sourceValidated=true`；共 12 个浏览器动作、18 次 provider
invocation。编译没有进入复跑，保留 9 个缺口：3 个读取证明、input/click/click/navigate 的 4 个动作条件、1 个 wait 条件和 1 个输出
装配缺口。这里不存在“复跑失败”：TaskChain 尚未生成。

该运行推翻了上一版采集假设。真实 Browser-Use `extract` 返回自由文本且 `metadata=null`；第二页 `extract` 回执甚至仍是第一页旧值，
详情 `extract` 又包含比最终成功输出更宽的正文。因此当前实现不再依赖 extract 元数据或回执值：每次 extract 后连续保留两份同页增强
DOM 于内存，业务成功后由最终输出反向寻找两份快照都能唯一复现的最大投影，只持久化 `ReadSpec`、schema、字段路径及摘要，不持久化
raw DOM。一个读取节点可向最终输出的多个字段路径供值。后续动作参数若与某个前序读取输出路径唯一同值，宿主生成普通 `node`
`ValueBinding`；数组索引表示读取结果中的业务项，不表示 DOM 位置，同值多路径会拒绝。Python 编译器与 TypeScript 物化器都会重新核验
源读取事实和实际值。整数 DOM 文本只接受由全部记录共同证明的固定前后缀后再做严格转换；正文默认保留原始多行文本，只有最终值要求时才启用
已证明的空白规范化。最终输出中尚未覆盖的叶子可以唯一复用任一已验证读取的同 schema、同值叶子；多候选不取第一个。hybrid Python
小套件 45/45、TypeScript 定点 7/7、API 类型检查和 Python 静态检查均通过；本轮修复尚未再次执行真实 GitHub B。

动作自身状态也已接回同一身份链：输入或下拉后的值不再要求目标必须有 `aria-label` 才能复查，而是用动作前保存的 Browser-Use
history identity 在动作后 DOM 中唯一重绑定；多个候选立即失败。位于下一条已编译目标动作之前的固定 `wait` 被标记为探索脚手架，
由下一目标的有界解析拥有，不生成定时复跑节点；没有正式消费者的等待仍保持缺口。

对保存的真实 B artifact 做了离线重编译，结果仍显示原 9 个缺口。这不是新逻辑无效：旧 artifact 按隐私边界没有保存 raw DOM，因而不可能
事后补出本轮新增的宿主读取事实、动作后重绑定事实和前序读取绑定。该结果同时固定了验收边界：必须用新代码重新做一次 E1 来源采集，
不能把旧 artifact 的编译结果伪装成新实现验收。

## 当前实现边界

- 固定 browser-use 0.13.8、workflow-use 0.2.11 与 Python 3.12；运行只消费受管 fork 的生产源码子集。
- TaskChain、版本、绑定、运行、恢复和审计由 B-A-T 持有；LangGraph `StateGraph` 仍是唯一图执行器。
- 普通复跑节点不调用模型；只有显式 `llm` 节点可以调用模型并记录审计。
- 原始任务数据、浏览器 Profile、账号配置和 Git 忽略的真实运行产物未参与本轮清理。

## 2026-09-17 仓库清理

- 删除最新提交引入的 290 个无运行职责文件：上游 UI/扩展/示例/开发测试、一次性 API 测试与探针、重复方案文档、
  历史 evidence 和临时 agent 配置。
- 保留 `workflow_use` 生产源码、AGPL-3.0 许可证、来源清单、主链测试需要的最小 fixture、A–E 模块说明及 A 当前证据。
- `PROGRESS.md`、`ROADMAP.md`、`RESEARCH.md` 已收敛为当前事实，不再保存逐轮日志。
- 留存源码的 manifest 校验和 API TypeScript 检查通过；`git diff --check` 通过。当前已有固定依赖环境；Windows 应用控制
  阻止其 Python launcher 后，本轮在忽略的 `work/` 内使用系统 Python 3.12 的薄 venv 复用同一依赖，版本和源码入口核验通过。

## 当前交付状态

R1 → R5 曾按顺序完成一轮实现和验收；下列结论现按最新证据修订：

1. R1 已完成：需求访谈事实、LLM 驱动的只读来源发现、Question Panel、待决硬门和确认需求组装均有正式入口证据。
2. R2 部分事实有效：准备来源不再调用 judge，合法终点不被 chain/step/plan completion predicate 二次改判；但 runner 清理仍可覆盖成功执行并进入修复，故未完成。
3. R3 服务端版本事实、验证和新版本发布可复用；实际画布展示和节点详情不可读，故未完成。
4. R4 已接通结果页三条用户验收路径、链路修订入口和携带运行摘要的需求回流，并由 R5 完成正式产品复验。
5. R5 历史正式入口结果保留；真实任务第三次复跑推翻“可稳定连续复跑”，清理恢复和可读画布也未被覆盖，故未完成。

macOS arm64 实机验收继续延期且未测；当前工作区保留全部既有实现和文档改动，未提交、未推送。

2026-09-19，A/B 当前实现与验收状态已由本地提交 `8aaa4a8` 固定，未推送远程。C 随后在同一 checkout 完成：
没有重复实现稳定目标、ConsumerReadiness、缺失目标分支或 ResultBinding，只补齐动作前准备与命中核验、正确滚动、
单次业务动作派发、具体后态等待，以及取消/恢复时不重复副作用。

[ResultSpec / ResultBinding 开发计划](RESULT_SPEC_BINDING_IMPLEMENTATION.md) 的 P1–P6 已实现：语义计划生成 execution/data
`ResultSpec`，数据 `count` 通过类型化来源关系降低为既有 `data.transform/count`，E1 后编译器生成只绑定来源的 `ResultBinding`；
空列表分支在任何 `[0]` 消费者之前判断，两个装配路径写同一结果变量并汇合到唯一 completed terminal。离线跨层运行覆盖非空、同输入复跑和
空列表，三次普通运行模型调用均为 0；合同 1/1、结果编译 9/9、跨层运行 1/1、API 类型检查和 fork manifest 真校验通过。

2026-09-19 的新真实 GitHub B 使用 task `fc80c0ce-915a-41d8-a576-6bc41f4c8c99`、plan
`2ed8de1c-684d-496c-8c43-22575807bf51` 和证据目录 `work/github-b-1789763257455`：E1 在一次真实探索中返回
`sourceSuccess=true`、`sourceValidated=true`，第一页/第二页各 5 条且有详情；E2 用同一来源重编译为 0 gap、3 个来源赋值、1 个空列表分支，
canonical digest 为 `9c406549819ae79d4c8fafab8d08c36bc534562efba54c15857390abbaa5150c`。当前产物 E3 同输入复跑 completed，
输出 `5/5/有详情`，模型调用 0；E4 不同输入 completed，输出 `1/0/无详情`，模型调用 0。E4 事件证明下一页稳定目标缺失后走
`missing → page2Issues=[]`，没有执行第二页读取、`[0]` 路径或详情读取。B 阶段门已关闭。

2026-09-19，C 已完成并独立验收。受控浏览器覆盖嵌套滚动、5.5 秒延迟后态、永不完成、输入、选择、按键和同 URL
document 替换；业务动作在后态重试外只派发一次。取消验收在服务器确认一次点击后中断，保留
`paused/interrupted + pendingEffect=uncertain`，同一运行恢复后副作用总数仍为 1。新的真实可见 Chrome GitHub TaskChain
完成第一页 5 条、第二页 5 条及第二页首条详情，30 条节点事件闭合、10 次浏览器命令、编译 gaps 为 0，
`modelCalls=0`、`llmCalls=0`；关闭后测试 runner/Chrome 进程数为 0。详见
[C 独立验收记录](evidence/browser-replay-repair/C_ACCEPTANCE_CONFORMANCE.md)。D 尚未开发。

同日补充了干扰与滚动的真实浏览器反例。原生 confirm 在普通复跑侧原先会被多 CDP session 重复记账 4 次，现复用已有
`DialogEventBridge` 并把 owner 收窄为单次普通动作，真实页面只记录 1 次且 authoring owner 不冲突。DOM 蒙层不再被描述为
“可识别弹窗”：完全覆盖时目标不进入 browser-use selector map；部分覆盖时只能由 `elementFromPoint` 证明中心点被其他 DOM
元素挡住。固定 browser-use 的真实 `Tools.act(click)` 是 `isTrusted=false`、坐标 `(0,0)` 的合成点击，不等同于物理鼠标；
同坐标 CDP 鼠标点击才实际命中蒙层。scroll 现保存前后坐标、范围与 wheel/scroll 事件，能区分无范围、边界、CSS 锁定和事件取消。
真实 Chromium 1/1、相关 Python 35/35 与 fork source 校验通过；详见
[干扰与滚动可观测性验收](evidence/browser-replay-repair/INTERFERENCE_OBSERVABILITY_ACCEPTANCE.md)。这不表示任意 DOM 弹窗可自动关闭，也不表示 D 已完成。

2026-09-19，D 已按最新结论重写为一个连续交付阶段：D1 建立 React + Radix UI 干扰实验站并完成确定性干扰处理；
D2 新增隔离 `function`；D3 将二元 branch 升级为有序 N 路 case/default；D4 把 LLM 收敛为编译时保存 prompt、
运行时单次调用且只输出一个 `result` 的显式节点；D5 经受控页面、真实页面和不同输入关闭独立验收。未知弹窗、遮挡、
scroll 或 selector 失败不进入 LLM。[D 实施交接](replay-repair/D_IMPLEMENTATION_HANDOFF.md) 已固定 stable/v2 schema、
25 个场景 ID、逐文件改动、错误码、定点命令和 GitHub 真实语义任务。D2 的 QuickJS 准入已修正为同一 commit/lockfile 下的 Windows x64 与 macOS arm64 实机验证；若产品声明支持 Intel Mac，再补 macOS x64。任一必需平台失败或未测，D2 与 D 均不得写成完成。本次只更新设计文档，没有开始 D 代码实现或验收。

## 2026-09-20 当前产品故障修复

Product Alignment:
- natural-language task: 使用 B-A-T 自有浏览器完成已确认的网页任务，并在后续运行中保留用户亲自建立的登录状态。
- reusable chain boundary: 计划保存预执行入口；浏览器 Profile 属于本机执行环境，不进入 TaskChain 业务节点。
- runtime inputs: 仅任务业务输入；入口 URL 与浏览器 Profile 都不是用户每次复跑填写的字段。
- dynamic task outputs: 保持各任务版本化结果合同不变。
- generic platform capability used: browser-use 受控浏览器、现有来源采集与 TaskChain runtime。
- replay model calls: 普通复跑为 0；仅首次探索保留现有 Agent/Judge 调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 持久浏览器身份、受控导航与现有登录状态复用。
- existing implementation in repository: browser-use `Browser(user_data_dir=...)`、单浏览器 owner、人工等待与恢复合同。
- mature candidates and pinned versions: 已固定 browser-use 0.13.8；不新增浏览器实现或账号仓库。
- selected implementation: 一个由 B-A-T 数据目录拥有的持久 Profile，继续复用 browser-use 公共 Browser API。
- reused public surface: `user_data_dir`、`allowed_domains`、Browser 生命周期与 CDP session。
- B-A-T-owned adapter and remaining gap: IPC 传递本地 Profile 路径、入口事实和错误分类；多 Profile 管理不在本次测试门内。
- license/runtime/platform fit: 沿用当前固定依赖与 Windows x64 范围；macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: Profile 只允许产品单会话拥有；不连接或复制日常 Chrome Profile。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 临时 Profile 会在关闭时删除登录状态；日常 Chrome 直连被用户取消，且当前 Chrome 没有调试端点。
- focused validation: API 类型检查、Python 协议/白名单定点检查和一条无头持久 Profile 浏览器验收；真实用户任务留给用户发起。

当前实现已把 authoring 与普通 runtime 统一绑定到 `data/browser-profile/default`，runner 关闭只终止其自有浏览器树，
不再删除 Profile。计划的 `entryUrls` 现在会进入真实 Browser-Use 任务正文；若浏览器安全策略拒绝跨站导航，宿主在该动作后立即失败，
不再允许 Agent 改用搜索引擎、其他协议或移动站继续试错。browser-use 白名单改为其实际支持的精确 host 形式，B-A-T 继续执行完整 origin 核验。
API 类型检查、入口指令 2/2、越权停止 2/2、fork manifest 与无头浏览器 1/1 均通过；无头验收同时证明 runner 关闭后 Profile
文件仍存在。正式产品 API 当前只返回任务 `e99c66f6-873e-40cf-a1c9-bebca8d05540`；真实 Bilibili 准备由用户发起，尚未冒充通过。

Workbench 顶栏新增“专用浏览器账号”入口。用户点击后才会启动由 B-A-T 独占的可见浏览器，可在网站自身界面登录、退出或切换账号；
完成后由同一入口关闭，之后准备和复跑共享该 Profile。账号浏览器与任务准备/运行互斥，API 和界面都不返回 Profile 路径、Cookie
或密码。产品失败投影也不再显示 `hybrid_source_and_cleanup_failed` 等内部码：组合错误优先投影真实主因，未知失败只给出安全中文说明，
内部分类仍留在 authoring 审计。

本轮新增定点证据：contracts、API、Workbench 类型检查通过；专用 Profile 固定路径与唯一 owner 测试 2/2；错误投影测试 1/1；
Python runner 静态编译通过。开发服务已从同仓库旧实例安全重启为 PID 8564，`/api/browser-profile` 返回 `closed`，正式任务仍只有
上述 1 条，Workbench 及其新入口模块均返回 200。没有由开发验收启动可见浏览器，也没有再次运行真实业务流程；下一步由用户先按需
打开专用浏览器建立登录态，再对该任务发起一次“重新准备”。

用户实测发现账号浏览器设置弹窗可以被提前关闭，导致专用浏览器仍由 B-A-T 持有，而“重新准备”只返回占用错误和无效的原样重试。
现已正常关闭该 B-A-T 浏览器并保留 Profile；设置弹窗在浏览器打开期间不再提供“返回工作台”，Esc/遮罩关闭会提示先完成账号操作，
正常关闭后自动返回工作台。准备/运行错误区识别 `browser_profile_busy` 后直接提供“关闭专用浏览器并继续”，关闭成功即复用原幂等
命令自动重试，不再要求用户寻找另一个入口。Workbench 类型检查与该恢复路径定点测试 1/1 通过；实时 API 状态为 `closed`，
专用 runner/Chrome 进程数为 0，未替用户发起真实任务准备。

## 2026-09-20 R3 链路修订入口（历史实现证据，UI 退出门已重新打开）

以下服务端 revision/checksum/digest/validation/publish 证据仍可复用；“不新增图编辑器、继续现有 React Flow 即完成”的选型结论已被后续真实复杂链复盘和 ADR 0010 取代。

Product Alignment:
- natural-language task: 用户在一次正式运行后修正局部链路实现，并把验证通过的修改发布为后续运行使用的新版本。
- reusable chain boundary: 每个修订草稿只基于当前发布版本中的一条参数化 TaskChain；计划、其他链路、旧发布和历史运行保持不可变。
- runtime inputs: 继续使用计划的类型化业务输入；用户不填写 selector、startUrl 或 JSON。
- dynamic task outputs: 沿用计划和链路已有的类型化输出合同，编辑器不引入网站或业务字段类型。
- generic platform capability used: React Flow 画布、TaskChain/Zod 合同、现有编译器、正式验证队列和不可变发布服务。
- replay model calls: 手动编辑、验证和发布均为 0；只有链路里显式存在的 `llm` 节点可在运行时调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 版本化图修订、结构校验、代表输入/换输入验证和不可变发布。
- existing implementation in repository: React Flow 只读图、`taskChainSchema`、`compileTaskChain`、计划验证队列、不可变 TaskChain/Release 与 SQLite repository。
- mature candidates and pinned versions: 复用仓库已固定的 `@xyflow/react`、Zod、LangGraph 和 SQLite；不新增图编辑器、调度器或版本仓库。
- selected implementation: 在既有公开组件和领域合同之上增加 B-A-T 自有的修订草稿、乐观并发 token、内容 checksum 与可执行 digest 适配层。
- reused public surface: React Flow 节点/连线交互、TaskChain schema/compile、计划 input contract 表单、验证执行与 `TaskProductService.publish`。
- B-A-T-owned adapter and remaining gap: 持久化画布布局和类型化操作，冻结候选后复用正式验证；实现及 R5 正式 Workbench 产品复验均已完成。
- license/runtime/platform fit: 沿用当前依赖和 Windows x64 范围；macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: 验证继续由现有单浏览器队列拥有；草稿不拥有浏览器、不复制运行状态。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 不另造图执行器或通用版本系统；现有 React Flow、编译器、验证队列和发布服务已经覆盖这些职责。
- focused validation: 先验证草稿持久化、乐观并发、候选冻结、正式验证引用和新发布不改写旧事实，再验证 Workbench 类型化编辑闭环。

R3 定点证据：服务端单项回归 1/1 通过，覆盖草稿重启恢复、并发 token、checksum/digest、聚焦请求安全扩展为完整计划验证、代表输入与不同输入、普通节点 0 模型调用、新 release 发布、旧 release/chain/run 不改写；contracts、API 和 Workbench 类型检查通过。React Flow 当前只在草稿态开放拖动和连线，节点详情支持类型化字段编辑、复制、删除和入口切换；已发布和历史版本保持只读。

## 2026-09-20 R4 用户验收与需求回流

Product Alignment:
- natural-language task: 用户查看正式运行的实际结果后，明确表示符合预期、修正局部链路，或携带本次结果重新梳理整体需求。
- reusable chain boundary: 用户验收是追加到 execution 的独立事实；局部问题引用本次实际运行的链路，整体问题返回同一任务的需求对话。
- runtime inputs: 正式 execution、其不可变 release/chain 引用、用户选择和用户业务说明。
- dynamic task outputs: 追加式验收记录、链路修订草稿，或包含用户可读运行摘要的新需求对话轮次。
- generic platform capability used: 现有 TaskExecution/TaskChain API、R3 修订服务、InterviewConnection 与 Common Composer。
- replay model calls: 结果验收和手动链路修订为 0；只有“重新梳理需求”进入需求对话后按正常访谈调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 运行结果验收、局部修订路由和整体需求回流。
- existing implementation in repository: Results 已展示正式 execution/result，R3 已有修订草稿入口，需求对话已有幂等消息、版本草稿和持久化。
- mature candidates and pinned versions: 继续复用 Radix Dialog/Select/TextArea、现有 TaskChainConnection 与 InterviewConnection；不新增反馈框架或第二套会话系统。
- selected implementation: execution 追加 `reviews`；局部选择由服务端核验为本次运行真实 chain reference 并创建 R3 草稿；整体选择保存有界用户可读摘要，再通过正式需求对话命令形成新轮次。
- reused public surface: TaskExecution Zod/SQLite 存储、不可变 chain/release 引用、React/Radix UI 与 Interview API。
- B-A-T-owned adapter and remaining gap: B-A-T 只组装安全运行摘要、校验路由引用并保存用户决定；三条正式产品路径和重启持久化已由 R5 验证。
- license/runtime/platform fit: 不新增依赖；当前 Windows x64，macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: 验收不启动浏览器；需求回流只启动访谈模型，链路修订验证仍通过单浏览器队列。
- replay model calls: 验收与手动编辑 0；需求回流按访谈用途审计，普通复跑约束不变。
- rejected candidates and evidence: 不把技术 completed 等同于用户满意；不让“调整链路”授权模型修复；不把整体需求错误塞进局部节点 patch；不覆盖原 execution 或 requirement。
- focused validation: execution review 合同 2/2、Workbench 连接/回流消息 5/5、R3 服务端 1/1，contracts/API/Workbench 类型检查通过。

## 2026-09-21 R5 与真实可复跑任务闭环

Product Alignment:
- natural-language task: 用户以业务语言确认浏览器任务，经真实页面准备后发布为可从任务列表重复启动的链路，并在结果页完成验收、局部修订或整体需求回流。
- reusable chain boundary: 一个确认需求版本产生不可变计划、参数化 TaskChain、release 与 preset；每次正式运行创建独立 execution/run，旧版本和历史运行不改写。
- runtime inputs: 只包含类型化业务输入；用户不填写 `startUrl`、selector 或 JSON。
- dynamic task outputs: 正式业务结果、运行审计、用户验收、修订版本或带运行摘要的新需求版本。
- generic platform capability used: Pi AgentSession 工具注册、BrowserSkill/browser-use、TaskChain/LangGraph runtime、React Flow 修订入口和 SQLite 事实源。
- replay model calls: 本轮真实链不含显式 `llm` 节点，sample、verification 与两个正式 replay 均为 0。
- site/task-specific code added: no

R5 受控产品验收：

- `work/minimum-product-loop-1789921035029/result.json` 从正式 Workbench/API 入口恢复并完成，顶层 `completed=true`。
- 需求澄清、来源候选、准备边界、合法终点 completed、真实错误、三条结果验收、自由画布修订、新需求版本、人工等待同 run 恢复和重启持久化均取得正式产品事实。
- 旧需求、计划、链路、release 和历史 execution 均保持不可变；自动验收使用 headless 浏览器，没有抢焦点。

真实公开站点任务：

- task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 使用 plan `44378eb4-c2cd-41ed-8971-8211a1dbebce` v7、chain `78ab3e78-7b2b-4bd4-884d-4ebcecc027b0` v4、release `eefe5eb7-a4be-42f2-836b-66867d67ecd9` v1 和有效 preset `f60ae0e4-85c5-4923-8eca-56689ad85abd`。
- preparation job `2bd347c7-ec6f-4e5d-88c5-751b9b94b5ba` 完成；sample execution `a1809272-07c7-4eb9-8aff-af7fab9ec396` 和 verification execution `b61a48b0-64a8-40ba-84a6-c09b916edbae` 均 completed，各自的正式 run 为 6 个浏览器命令、0 个模型调用。
- 两个正式 execution `69b391df-a8c2-4a2d-8ff4-bff9832d4597`、`982066f7-25e9-4bc1-86ae-5932e34ed62a` 均 completed；对应 run `1c72e714-74b9-476a-809c-90fa27936699`、`73c80ae4-4df2-41d9-81c2-d322ad253a15` 各为 5 次节点转换、6 个浏览器命令、0 个模型调用，`auditComplete=true`。
- 根因修复均为通用能力：计划授权入口绑定、执行期观察型读取、弱哈希碰撞后的稳定目标消歧、点击新标签页后的显式聚焦，以及技术失败重试时复用同一不可变计划和版本化来源事实。没有加入网站名、业务字段、页面文案或 CSS class special case。
- 当前受管 fork digest 为 `135fbdfc4a2c6e9f9f9060fe389be861fd849ee52403ded2a92bab43e3ce3d00`。Windows x64 当前范围通过；macOS arm64 仍延期且未测。

## 2026-09-21 正式复跑恢复与链路工作台修订

当前开发基准为
[正式复跑恢复与链路工作台开发基准](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md)，I0 架构与隔离原型已完成，生产按 I1 → I7 推进；I1–I5 已完成，当前进入 I6。

已核验根因：

- TaskRun 和 1/1 计划步骤已经 completed；`withHybridCapabilities` 在成功工作返回后的 `finally` 调用 `RunnerProcess.close()`。
- Python runner 退出码 1 被 `RunnerProcess.close()` 转成 `upstream_cleanup_unconfirmed:1`；close request 的具体失败被吞掉，stderr 也未形成安全产品证据，因此具体 Python 清理阶段仍需 I2 用 allowlisted stage code 定位。
- `TaskPlanExecutor` 把该通用异常归为 `deterministic / execution_failed / repairable=true`，产品随即进入 `needs_repair / repair`。这是执行生命周期和清理事实混淆，不是链路缺陷。
- 当前诊断时没有残留 runner/Chrome，浏览器 owner 也不要求清理；该事实不能倒推失败时的清理可靠。
- `projectChainGraph` 使用固定两列坐标并默认绘制全部出口；`NodeDetail` 直接展示 JSON 和原始事件。服务端 revision/checksum/digest/validation/publish 可复用，但 R3 UI 退出条件不成立。

本轮只完成文档与领域基准：

- 新增 ADR 0009，区分 TaskRun 链路结论、TaskExecution 生命周期和资源清理结论。
- `CONTEXT.md` 新增执行生命周期、资源清理结论、待清理运行和链路展示投影。
- 新迭代文档固定 cleanup_required 合同、runner close 细则、产品投影、ChainPresentation/CapabilityDescriptor 服务端事实、链路阶段与动作路径层级、节点详情、I1–I7 最小验证和正式验收门。
- 同步重新打开 ROADMAP、MINIMUM_PRODUCT_LOOP、REQUIREMENT 基准和 E 组合验收中的冲突完成结论。
- 没有修改生产实现，没有安装依赖，没有运行测试或真实浏览器，没有提交或推送。

## 2026-09-21 链路画布直接运行与实时运行流设计修订

用户确认新的硬交互要求：已经准备完成的任务必须在链路画布直接“运行/再次运行”；左侧任务或 session 列表只负责选择，点击必须立即显示选中/加载反馈，不能暗中启动或无响应。运行被服务端接受后，画布必须像成熟工作流产品一样绑定本次 execution，持续展示节点和连线的真实流转，而不是静态死图。

本轮 CodeGraph 核验的当前差距：

- `main.tsx` 的任务行选择只调用 `model.select(id)`；运行仍由侧栏/独立 `TaskRunDialog` 触发。
- `useTaskRunner` 的 busy 只覆盖 POST，成功后只 reload 任务模型；`TaskWorkspace`/`ChainView` 没有接收新 execution。
- 当前链路投影会从多个 TaskRun 逐节点取最后事件，没有单次 execution 边界，因此不能直接加动画冒充运行流。
- 服务端 revision draft、checksum、executable digest、验证和不可变发布仍是可复用事实；本轮不推翻这些实现。

已更新产品基准：

- 新增 ADR 0010，固定“链路工作台是直接运行与实时观测入口”、即时反馈状态机、accepted execution 回执和按 execution/sequence 续接。其最初写入的“大容器内嵌子画布、FlowGram 优先”方案已在同日架构复盘后被 ADR 当前版本取代，不得据本段实施。
- 当前有效设计是同一 TaskChain 的阶段总览、单个临时动作摘要和同画布聚焦动作子图；技术路径不常驻、不形成第二份图，也不塞进巨型阶段容器。
- 当前选型保留 `@xyflow/react@12.11.6`，引入 `@dagrejs/dagre@3.1.1` 分别布局阶段总览和聚焦子图；FlowGram/Coze 仅作交互参考，ELK 当前不引入。
- 严格顺序保持 I1 → I7；I3 建立幂等运行回执和事件合同，I4 建立 presentation/descriptor 服务端事实，I5 接生产运行台，I6 接修订发布，I7 从正式 Workbench/API 验收。

以上记录描述当时的文档设计阶段；后续同日原型进展见下节。

## 2026-09-21 链路阶段架构对齐与交互原型

核心架构已统一：

- `任务步骤` 仍是计划层单元，一条步骤由一条 `TaskChain` 实现；`链路阶段` 是 TaskChain 内版本化的用户阅读/修订边界；`动作节点` 才是 runtime 执行单元。
- 链路阶段引用相连动作子图并声明逻辑入口与具名出口，自身不参与调度。总览、动作摘要和聚焦子图共享真实节点 ID、边和所选 execution 事实，不生成第二套流程。
- 阶段总览不常驻子链。单击只附着一个不参与布局的动作摘要；双击或“进入阶段”在同一画布聚焦真实动作子图，复杂分支/循环不能用线性时间线冒充。
- 节点编辑由 capability descriptor 驱动，必须展示所属阶段、前置条件、动作、后置条件和下一动作。未知 capability 只读；执行语义改变后旧验证失效，聚焦验证重新证明阶段出口可达前禁止发布。
- executable digest 只随可执行节点、边和绑定变化；阶段分组与手动布局进入 revision checksum；自动布局、临时摘要和聚焦状态不进入 executable digest。

开源复用结论：

- 保留现有 `@xyflow/react@12.11.6`，新增 `@dagrejs/dagre@3.1.1`；总览与聚焦图分别布局，不使用大容器复合 sub-flow。
- FlowGram/Coze 作为交互参考。官方 loop 容器与展开源码使用大容器内显示/隐藏子节点，且 FlowGram 的 document/form/history/variable 所有权与当前服务端 revision 重叠，因此不引入。
- Dagre 及 graphlib 的 npm unpacked size 合计约 1.9 MB，不是浏览器 bundle，也不会在每次布局时解包；自动布局只在初次投影、结构改变或用户明确整理时执行。

可点击原型位于 `apps/workbench/prototype.html` 与 `apps/workbench/src/prototype/`：

- 保留需求对话、任务准备、链路图、运行结果四个产品 Tab；
- 展示阶段总览、单个附着动作摘要、同画布聚焦子图、横/纵布局、拖动/缩放/小地图；
- 展示画布直接“再次运行”及节点/边运行状态演示；该演示明确不连接后端，不作为真实 execution 证据；
- 右侧面板只服务当前选择。`提交搜索` 可修改按键或替换为点击；点击目标通过浏览器目标选择入口表达，不要求 CSS selector；修改立即使验证失效并禁用发布。

定点验证：

- `npm run check --workspace @browser-capture/workbench` 通过；
- Windows Edge headless 1600×1000 成功渲染阶段总览和 `?focus=search-content` 聚焦编辑态；
- 当前只完成架构与隔离原型，不代表 I3 服务端运行回执、I4 presentation/descriptor 合同、I5 生产接线、I6 发布体验或 R3/R5 已通过。

## 2026-09-21 开发文档按已确认原型重组

本轮重新核验 checkout 为 `master@7d59036332a66de8991744659d2317da126c6123`，工作区已有 167 项 dirty entry，全部保留。CodeGraph 对实时源码确认：

- `withHybridCapabilities()` 在 `work()` 返回后由 `finally` 直接等待 `RunnerProcess.close()`；
- `RunnerProcess.close()` 吞掉 close protocol 的具体错误，并在 child exitCode 非零时抛出普通 `upstream_cleanup_unconfirmed:*`，且抛错位于临时目录删除之前；
- `TaskPlanExecutor.execute()` 把该普通异常统一归为 `failed / deterministic / execution_failed / repairable=true`；
- `LiveChain` 仍调用 flat `projectChainGraph()` 并从匹配 run 中聚合节点最后事件，生产画布尚未拥有 active execution 或 ChainPresentation。

开发基准已重组为 I0–I7：

- I0 架构与隔离原型已完成，只作为交互设计证据；
- I1–I3 依次完成 ExecutionCleanup 合同/持久化、runner 结构化清理、accepted execution/事件续接与产品投影；
- I4 在任何生产画布之前完成 ChainPresentation、ChainStage、CapabilityDescriptor、checksum/digest 和验证失效的服务端合同；
- I5 把 React Flow + Dagre 原型接入正式运行台和单次 execution；
- I6 完成上下文动作编辑、浏览器目标选择、聚焦验证和不可变发布；
- I7 才从正式 Workbench/API 重验普通复跑、cleanup_required 恢复、链路修订、需求回流和持久化。

本轮仅重组领域与开发文档，没有修改生产运行逻辑，没有运行正式复跑，也没有把原型演示写成产品通过。

文档定点验证通过：I0–I7 标题顺序唯一，过期的编辑器选型与画布层级表述没有残留，本文涉及的本地 Markdown 链接全部可解析，相关文件 `git diff --check` 通过。仅有 Git 的 LF→CRLF 工作区提示，无内容错误；未运行代码测试或浏览器任务。

## 2026-09-21 I1 清理生命周期合同与持久化

I1 开工记录：

```text
Product Alignment:
- natural-language task: 已发布链路完成后，若本次运行拥有的 runner、浏览器或临时资源尚未确认释放，保留实际业务结果并允许用户核验清理后再次运行
- reusable chain boundary: TaskRun 继续只记录图执行结论；TaskExecution 以一份结构化 ExecutionCleanup 事实记录本次 execution 的资源清理生命周期
- runtime inputs: execution 身份、当前 sequence、资源 owner 关联和幂等清理请求
- dynamic task outputs: cleanup pending/confirmed/unconfirmed 状态、追加审计摘要、cleanup_required 产品状态和清理主操作
- generic platform capability used: Zod 跨包合同、SQLite/Drizzle execution 持久化、现有 operation 幂等账本和产品事实投影
- replay model calls: 0；资源清理不调用模型，也不构成模型修复授权
- site/task-specific code added: no
```

当前包严格只修改 I1 合同、持久化和对应定点测试；runner close 协议、产品恢复命令、事件续接和 Workbench 留给后续 I2–I3。

I1 完成证据：

- `TaskExecution` 新增唯一权威 `cleanup` 摘要；历史 JSON 缺字段只读为 `not_recorded`，新保存会把完整结构写回原 `taskExecutions.body`。没有新增平行 cleanup 状态表或重复列，数据库仍为 v14，无数据迁移需要。
- `cleanup_required`、`cleanup` 主操作和 execution result `nextAction=cleanup` 已进入共享合同；`unconfirmed` 必须绑定 `cleanup_required`，不能伪装成 failure/repair。
- repository 以 execution `sequence` 原子更新 cleanup，限制 `not_recorded → pending → confirmed|unconfirmed` 和 `unconfirmed → pending` 重试；陈旧 sequence 被拒绝，attempt 防止并发清理覆盖新证据。
- `@browser-capture/contracts`、`@browser-capture/api`、`@browser-capture/workbench` TypeScript 检查通过。Workbench 首次检查发现集中产品状态词典缺少新状态，补齐后续跑通过；contracts/API 无错误。
- 定点测试 5/5 通过：合同兼容与伪清理结论拒绝 2 项，API v14/重启恢复/cleanup sequence 持久化 3 项。没有运行根级或全量测试。
- I1 没有改 runner close、计划执行分类、清理命令或产品画布；这些仍由 I2–I5 按顺序完成。

## 2026-09-21 I2 runner 清理协议与恢复

I2 开工记录：

```text
Product Alignment:
- natural-language task: 正式运行完成或失败后，可靠释放本 execution 拥有的 runner、浏览器树和临时目录，并在无法确认时保留原业务结论和可恢复的清理事实
- reusable chain boundary: TaskChain 与 TaskRun 不承载进程清理；upstream runner adapter 只返回本次 owner 的结构化清理报告，执行生命周期在 I3 消费该报告
- runtime inputs: execution ownerId、AbortSignal、当前 runner child、持久 Profile 路径和本次 runner 临时目录
- dynamic task outputs: Python capability/browser 阶段结果、close protocol/child/process tree/temp 阶段结果、受限错误码和证据 digest
- generic platform capability used: 现有 browser-use Browser owner、fd3 child protocol、Node child_process 与有界 Windows 进程树/临时目录清理
- replay model calls: 0；普通复跑与清理均不调用模型，清理异常不授权模型修复
- site/task-specific code added: no
```

本包只修改 I2 runner 清理合同、幂等实现和对应真实 child 定点验证；execution 产品投影、清理命令、accepted execution 与事件续接留给 I3。

I2 完成证据：

- 旧 execution 从最后一个 TaskRun finished 事件到 execution 失败相差约 10.2 秒，与旧 `RunnerProcess.close()` 的 5 秒 close-protocol 等待和 5 秒 child-close 等待吻合；最先失去确认的是 `close_protocol`，exit 1 是超时终止后的次生进程结果，不是链路失败阶段。
- Python `Runner.close()` 现在缓存单一 close task；capability 与 browser 按顺序清理并各自产生 allowlisted stage result，主循环先写完整 close response，外层 `ensure_closed()` 只等待同一 task。未输出 traceback、页面内容、PID 或绝对路径。
- TypeScript `RunnerProcess.close()` 在所有路径返回同一结构化 report，分别记录 Python stage、close protocol、child exit、process tree 和 temporary directory；前序失败不再跳过临时目录删除，Windows 删除继续使用有界原生重试。
- `withHybridCapabilities()` 把 work 结论与 cleanup report 分开；cleanup 未确认时抛出的 `RuntimeCleanupRequiredError` 同时携带 owner、原 work 成功值或原失败和安全 report，不再生成 `upstream_cleanup_unconfirmed:*` 普通异常。I3 尚未消费该 typed error，因此当前还不能宣称产品已投影为 `cleanup_required`。
- I2 根因诊断对同一不可变 chain、空输入和持久 Profile 做了 headless runtime-direct 复跑：本次站点执行返回 TaskRun failed、模型调用 0、cleanup confirmed；它只证明新 close 不再覆盖本次主结论，不作为正式 Workbench/API 产品闭环证据。
- I2 runner lifecycle 定点测试 5/5 通过：真实 Python/browser child 正常 close 与重复 close、Python close 阶段失败、close protocol 超时后的精确 child tree 终止与 temp cleanup、业务失败加 cleanup 失败、Windows 临时目录有界重试参数。`@browser-capture/api` TypeScript 检查通过；第一次检查仅发现旧 BrowserProfile 测试桩仍返回 `void`，改为结构化 confirmed report 后续跑通过。
- 没有运行根级或全量测试，没有修改 TaskPlanExecutor 产品分类、运行命令、事件 API 或 Workbench；这些从 I3 起继续完成。

## 2026-09-21 I3 执行投影、accepted 回执、事件续接与清理操作

I3 开工记录：

```text
Product Alignment:
- natural-language task: 用户在正式工作台点击一次运行后立即得到唯一 execution，能按该 execution 续接真实节点事件；若业务已完成但资源清理未确认，只需核验清理并恢复原结果
- reusable chain boundary: TaskChain/TaskRun 继续记录不可变链与图运行事实；TaskExecution 记录 accepted 命令、业务生命周期和 cleanup overlay，事件 API 只投影所选 execution 引用的 TaskRun
- runtime inputs: requestId、release/plan/chain 引用、executionId、expectedSequence、after event sequence 和结构化 runner cleanup report
- dynamic task outputs: accepted execution receipt、cleanup_required 产品状态、清理后恢复的原 next action、execution-scoped 单调事件批次
- generic platform capability used: 现有 operation 幂等账本、TaskExecution sequence 乐观并发、TaskRun 追加事件、SQLite cleanup 审计与 Fastify API
- replay model calls: 0；普通复跑、事件续接和清理恢复不调用模型，cleanup 不生成 repair 授权
- site/task-specific code added: no
```

本包不修改链路展示结构或动作编辑；ChainPresentation 与正式画布仍严格留给 I4–I6。

I3 完成证据：

- `TaskPlanExecutor` 已把 typed cleanup report 与业务主结论分开持久化：业务 completed/failed/paused 等事实先形成 `cleanupResume`，未确认清理只叠加 `cleanup_required`；不会创建 repair job、不会覆盖 TaskRun，也不会把 cleanup 错误归为确定性链路失败。正常 confirmed 清理直接保留原业务结论。
- 新增只保存追加清理证据的 `taskExecutionCleanupAudits`（SQLite v15）；`taskExecutions.body.cleanup` 仍是唯一生命周期事实源。服务重启遇到 running/queued 且 cleanup pending 时，先把业务状态收敛为 paused，再投影 cleanup_required，清理确认后恢复同一 execution 的 paused 结果。
- `run_task` 正式 API 现在返回 `acceptedExecution`，固定 requestId、executionId、release、plan 和全部 chain 引用；同一 requestId/同一 payload 返回同一 receipt，不同 payload 冲突，新 requestId 只在前一 execution 与清理结束后创建新档。
- 新增按 `executionId + after sequence` 的事件续接 API。它只投影该 execution 实际引用的 run/event，生成单调 execution 事件序列，不会把其他 execution 的节点末态拼成伪运行流；Workbench 连接已解析 accepted receipt 并保存本次 active execution。
- `cleanup_execution` 以 expected execution sequence 与 operation 账本幂等；只依据本 execution 的 allowlisted cleanup audit 和 owner verification 恢复 `cleanupResume`。若仍有 active resource 或缺少可确认事实，继续保持 cleanup_required，不强行标 completed。
- 聚焦验证通过：contracts、API、Workbench TypeScript 检查；API 4 项定点行为（primary/cleanup 四组合、重启 pending cleanup、cleanup sequence 持久化、P3 accepted/幂等/事件续接/清理恢复）全部通过；Workbench 连接 5/5 通过。P3 中 accepted receipt 与事件续接通过真实 Fastify API 注入验证，普通复跑模型调用保持 0。没有运行根级或全量测试。

## 2026-09-21 I4 链路展示与 capability descriptor 服务端合同

I4 开工记录：

```text
Product Alignment:
- natural-language task: 用户按阶段读懂一条已发布链路，并在修订中只编辑服务端明确支持的通用动作字段；旧链和未知动作保持可读只读
- reusable chain boundary: TaskChain 仍是唯一执行图；ChainPresentation 只按精确 chain version 保存阶段分组和发布布局，CapabilityDescriptor 只描述通用 capability 编辑面
- runtime inputs: 不可变 chain reference、阶段/节点/出口引用、descriptor registry version 和类型化 revision operation
- dynamic task outputs: presentation digest、revision checksum、展示结构校验、执行验证失效状态和新版本不可变 presentation
- generic platform capability used: 现有 TaskChain Zod 合同、revision draft/operation 账本、executableChainDigest、SQLite/Drizzle 版本存储与 capability registry 边界
- replay model calls: 0；展示编辑和合同校验不调用模型，普通复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

本包先完成服务端合同、唯一事实和 API 定点验证，不接生产画布；React Flow + Dagre 仍留给 I5。

I4 完成证据：

- 新增共享 `ChainPresentation`、`ChainStage` 与 `CapabilityDescriptor` Zod 合同。每个非 terminal 节点必须且只能属于一个阶段；阶段内部从逻辑入口可达，外部入边只能进入该入口，全部跨阶段/终点出边必须由真实 `sourceNodeId + sourcePort` 声明；overview/focus layout 必须精确引用现有阶段和动作。
- 新增 exact `capability.name@version` descriptor registry v1，当前只描述平台通用浏览器/数据能力、字段、端口、替换兼容和验证范围。unknown version 返回只读；没有递归 JSON 编辑兜底，registry 未包含网站、业务字段、页面文案、URL 或 CSS class。
- SQLite 原子迁移到 v16，`taskChainPresentations` 按 chain id/version 唯一保存已发布 presentation。编辑草稿拥有 mutable presentation；发布后草稿只保留 presentation digest/reference，完整内容唯一位于不可变 presentation 记录，避免双写权威。旧链没有记录时只派生 `legacy_derived/readOnly` 的“未分组动作”，不会猜业务阶段。
- revision checksum 现在覆盖 executable snapshot、presentation 和有序 operations；chain executable digest 与 presentation digest 分离。`move_node/set_presentation` 保留已冻结候选和执行验证，`replace_node/replace_capability/增删节点边` 立即清空 candidate/records 并把 chain validation 置回 candidate；最终阶段图始终重新由服务端校验。
- 正式 TaskChain API state 返回 presentations 与 descriptor registry；`validate_chain_presentation` 使用 requestId、revision/checksum 幂等校验。既有 create/update/full validation/publish API 已接新事实；新编译链在保存时创建通用 presentation，发布后可按精确 chain reference 读取，重启不变。
- 最小验证通过：contracts/API/Workbench TypeScript 检查；contracts 兼容测试 1/1；阶段图、digest 分离、validation invalidation、descriptor exact、不可变发布/旧链只读/重启读取 3/3；v16 迁移 1/1；既有 R3 正式 Fastify API create/read/update/presentation validate/full validate/publish/restart 定点 1/1。没有运行根级或全量测试，没有启动浏览器或模型。

## 2026-09-21 I5 正式链路运行台与单次 execution 流

I5 开工记录：

```text
Product Alignment:
- natural-language task: 用户在当前发布链路的同一画布确认输入、点击运行并只观察这次 accepted execution 的阶段和动作流转
- reusable chain boundary: ChainPresentation 负责阶段总览与聚焦引用，TaskChain 负责真实动作/边，execution event batch 负责单次运行状态；前端不生成第二套可执行图
- runtime inputs: 当前 release/preset、稳定 requestId、accepted executionId、after sequence、布局方向与本地聚焦/摘要状态
- dynamic task outputs: submitting/accepted/running/cleanup/completed 反馈、阶段聚合状态、真实动作和边状态、断线续接位置
- generic platform capability used: @xyflow/react 12.11.6、@dagrejs/dagre 3.1.1、I3 execution event API、I4 presentation/descriptor state 与现有 ValueSchema 运行表单
- replay model calls: 0；运行台只派发正式 run_task 并读取持久化事件，不增加模型入口
- site/task-specific code added: no
```

视觉实现采用现有工作台的克制工业/制图风格：阶段像路线站点、动作像执行卡片，状态同时用文字、形状和颜色表达；不导入原型静态数据或示例任务文案。

I5 完成证据：

- 正式 `LiveChain` 已只消费服务端 `ChainPresentation`、真实 `TaskChain` 和所选 execution event batch：总览只有开始、阶段、阶段间路径和结束；同源同目标的多个概览出口合并为带数量的展示路径，聚焦子图仍保留每条真实动作边。单击只附着一个不参与布局的动作摘要，双击捕获或“进入阶段”在同一 React Flow 画布聚焦真实动作。
- 运行/再次运行与业务输入设置已从任务列表移入链路工作台；任务列表只选择和导航。运行对话使用当前不可变 release、同一 `TaskChainConnection` 和稳定 requestId，accepted 后固定 executionId；轮询只按该 execution 的 `after=sequence` 追加事件并去重，刷新后从持久化 latest execution 恢复，不拼接其他运行。
- 右侧只解释当前阶段或动作，动作面板展示所属阶段、上一动作/前置条件、动作和下一动作/后置条件；原始节点 JSON 仅在折叠高级信息中。旧链通过服务端 `legacy_derived/readOnly` presentation 可读，生产代码没有导入隔离原型数据。
- Workbench 连接与投影定点测试 7/7 通过，覆盖 accepted receipt、同 request 续接、事件去重、分支路径状态和阶段聚合；Workbench/API TypeScript 检查通过，生产 Workbench 构建通过。Vite 仍报告既有大 chunk 警告，本包未扩展成拆包重构。
- `work/i5-chain-workbench-1789976475079/result.json` 从正式 headless Workbench/API 以 1440×1000 完成：任务列表“打开链路”、单摘要、双击进入 1 个真实动作、正式 Workbench 复跑 execution `603e7cc7-ddcf-4714-85d4-0d961681aacb`、6 条持久化动作事件、刷新后同 execution 和成功阶段恢复；execution completed，普通复跑模型调用 0。截图为同目录 `chain-workbench-1440.png`。
- 该 I5 证据只关闭生产运行台接线与可读状态投影，不代替 I6 动作编辑/浏览器目标选择/聚焦验证/发布，也不把受控本地页面复跑写成 I7 真实复杂任务闭环。

## 2026-09-21 I6 上下文动作编辑、目标选择与不可变发布

I6 开工记录：

```text
Product Alignment:
- natural-language task: 用户在真实动作上下文中修改服务端允许的字段或替换动作，用 B-A-T 专用浏览器点击真实页面目标，完成聚焦验证后发布新不可变版本
- reusable chain boundary: descriptor 只描述通用 capability 的可编辑面；TaskChain 仍是唯一执行图，浏览器选择只产生版本化 target 数据，revision/presentation/release 仍由服务端事实拥有
- runtime inputs: draft revision/checksum、当前动作与明确 source port/target、descriptor field、浏览器中用户实际点击的目标、验证业务输入
- dynamic task outputs: typed replace_capability operation、失效的旧验证、目标选择状态、requested focus node、验证记录和新 chain/presentation/release 引用
- generic platform capability used: I4 CapabilityDescriptor/revision operation、现有 browser-use CDP owner 与持久 Profile、React Flow inspector、I3 operation 幂等账本和正式 validation/publish API
- replay model calls: 0；手动编辑、目标选择、验证和发布不授权模型修复，普通复跑仍只有显式 llm 节点可调用模型
- site/task-specific code added: no
```

本包先补 server-owned 浏览器目标选择与 descriptor 编辑适配，再接 inspector 和既有 validation/publish；不会恢复递归 JSON 编辑，也不会用第一个空闲出口替用户决定连线语义。

```text
Reuse Assessment:
- capability: 修订动作的真实浏览器目标选择、稳定目标身份恢复与 descriptor 类型化编辑
- existing implementation in repository: BrowserProfileService/RunnerProcess 已拥有唯一持久浏览器会话和 fd3 协议；workflow-use vendor 已提供 DOM graph、capture_target_identity 与 verified_labeled_query；I4 registry 已提供 exact capability descriptor
- mature candidates and pinned versions: 继续使用仓库受管 browser-use/workflow-use fork、Playwright CDP、@xyflow/react@12.11.6 与 @dagrejs/dagre@3.1.1；不增加选择器或画布库
- selected implementation: 在既有 Profile runner 内新增一次性 pick_target 请求，复用目标身份与可验证 labeled query；Workbench 只按 descriptor 渲染有限控件并提交 replace_capability
- reused public surface: RunnerProcess request/close、BrowserUse page/state、workflow-use target identity/query、CapabilityDescriptor editableFields/replacements、revision operation API
- B-A-T-owned adapter and remaining gap: 只拥有 target-selection command/state、受限结果合同、draft/node/checksum 校验、异步轮询以及 target 写入 revision；不拥有第二套浏览器、选择器推断器或通用表单引擎
- license/runtime/platform fit: 沿用已冻结的仓库依赖和 Python/Node 运行边界；实现不调用平台专属 GUI API，Windows 实测后仍需 I7 的 macOS arm64 真实证据
- browser/runtime/state ownership conflicts: 选择期间仍由 BrowserProfileService 独占同一 runner；结束、取消或失败均关闭该 owner，不能与 prepare/run 并发
- replay model calls: 0；用户点击目标、手动编辑、验证与发布均不调用模型
- rejected candidates and evidence: 不采用 CSS 录制器、递归 JSON、第二个 Playwright owner 或错误字符串 special case；现有 vendor 已能把真实点击绑定到 DOM graph 并生成运行时支持的 hybrid target
- focused validation: contracts/API/Workbench TypeScript 边界、BrowserProfile target owner 定点测试、R3 修订发布回归、Workbench target connection/typed patch，以及正式 headless Workbench/API I6 验收
```

I6 完成证据：

- 新增 server-owned `BrowserTargetSelection` 合同与 `/api/browser-profile/target-selection`：start 必须绑定当前 task/draft/node/revision/checksum 和 exact live-picker descriptor；同一 requestId 幂等，选择期间独占既有 `BrowserProfileService`/`RunnerProcess`，取消、失败和关闭保持结构化状态。目标 URL 只从当前链中已保存的 target scope 或最近唯一前置导航推导，用户不填写 URL 或 selector。
- Python Profile runner 新增 `profile_pick_target`：在当前 BrowserUse 页面捕获一次点击，阻止页面动作，复用 workflow-use 的 `capture_target_identity` 与 `verified_labeled_query`，只返回运行时已支持的 `structure/history` target、tag 和策略；不返回页面正文、DOM、PID、Profile 路径或模型信息。成功、失败或取消后均走同一幂等结构化 close。
- 正式 inspector 已按服务端 `CapabilityDescriptor.editableFields` 渲染有限控件；exact descriptor 缺失的 capability 只读，没有递归 JSON 兜底。浏览器目标由“在浏览器中选择”取得并通过 `replace_capability` 写入；修改立即清空 candidate/验证并禁用发布。React Flow 的隐式拖线已关闭，连线只能在控制台明确选择起点、source port 与目标。
- 保存动作、展示结构校验、代表输入验证、不同输入验证和发布是独立命令；聚焦节点随验证请求保存，服务端继续安全扩展为 `full_plan`。手动编辑、目标选择和两次验证均无模型调用；旧 chain/release/run 不改写，新版本保存独立 presentation。
- 聚焦验证通过：contracts/API/Workbench TypeScript 检查；BrowserProfile 目标 owner 3/3；既有 R3 修订/冻结/发布 1/1；Workbench execution/target connection、typed target patch 和画布投影 9/9；Workbench 生产构建通过（仍仅有既有大 chunk 警告）。
- `work/i6-chain-revision-1789978926127/result.json` 从正式 headless Workbench/API 完成：同一动作的 descriptor 历史为 `send_keys → click`，真实页面按钮产生 `history` target；旧 chain v1 保留，新 chain v2 digest `94e0975f...` 与 release v4 发布；两次正式验证 execution 均 completed、模型调用 0，服务重启后旧/新 chain、新 presentation 和 release 均恢复。截图为同目录 `chain-revision-published-1440.png`。
- I6 只关闭上下文编辑、浏览器目标选择、验证失效和不可变发布；I7 仍需从正式 Workbench/API 对真实复跑、`cleanup_required` 恢复、修订、需求回流及重启持久化做最终闭环，且 macOS arm64 尚未实测。

## 2026-09-21 I7 正式产品闭环验收

I7 开工记录：

```text
Product Alignment:
- natural-language task: 从正式 Workbench/API 连续复跑当前已发布真实任务，刷新与重启后恢复同一 execution；受控清理异常只进入 cleanup_required 并恢复原业务结果，同时验证用户验收、局部链路修订和需求回流入口
- reusable chain boundary: TaskChain 仍是唯一可执行动作图；TaskExecution 绑定一次正式运行和清理 overlay；用户验收、ChainRevision 与 RequirementVersion 分别保存，不互相改写历史事实
- runtime inputs: 当前 release/preset、稳定 requestId、accepted executionId、事件 after sequence、execution expectedSequence、用户验收决定和修订输入
- dynamic task outputs: 连续 completed execution、零模型调用审计、cleanup_required/confirmed 恢复、三类用户决定、不可变新 chain/release 及重启后的持久事实
- generic platform capability used: 正式 Workbench、Fastify TaskChain API、持久 Profile、I1-I6 cleanup/event/presentation/descriptor/revision 合同和 SQLite 事实库
- replay model calls: 0；普通复跑、清理、手动修订和验收路由均不调用模型，只有显式 llm 节点例外
- site/task-specific code added: no
```

本阶段只以正式 Workbench/API 和当前持久任务作为产品闭环证据；runtime 直调、mock、fixture、隔离原型、类型检查或临时脚本均不能替代 I7 验收。自动验收使用 headless，登录或验证码仍只通过 B-A-T 专用持久 Profile 由用户处理。

I7 Windows x64 正式产品闭环通过：

- 正式验收前修复了三个由真实持久状态暴露的通用问题。Workbench 不再把能否再次运行错误绑定到最新结果的单一 `primaryAction`，而按当前 release/preset、active job/execution 和 draft 事实开放运行；结构化 capability/browser/close protocol 已确认且 child 确实退出时，非零 child 返回码不再把资源释放误报为未确认，真实 close 阶段未确认仍进入 cleanup overlay；计划验证现在复用 `taskInputRequiresVariation`，空对象或单值合同仍要求两次独立验证，但不伪造不同输入。
- runner 定点测试 6/6 通过，新增覆盖“结构化 owner close 已确认 + child 非零退出”的资源语义；API TypeScript 检查通过。Workbench 生产构建通过，仍只有既有大 chunk 警告。
- `work/i7-resume-revision-1789980871295/result.json` 记录正式 API 对上次中断草稿的续接：旧 chain v4 不变，代表输入 execution `25b07ca2-b28b-4e11-8726-e8dda7c5ec76` 与换输入 execution `9c812fc6-c2ae-4a2e-8468-fdc84dae402a` 均 completed、cleanup confirmed、模型调用 0；新 chain v5 和 release v2 发布。
- `work/i7-final-product-1789981090285/result.json` 从正式 headless Workbench/API 使用当前持久 Profile 完成最终闭环。普通 execution `d8c4d674-85ad-4b15-8100-414d66f1d0cb`、`bd5bd6cf-aecd-4860-8961-0ac418863689`、`988a8c3d-ae26-4cdd-81c7-b7248809ce2c` 均 completed、cleanup confirmed、模型调用 0；第二轮重复同一 requestId 只返回同一 accepted execution。首轮 15 条 execution-scoped 事件支持 after sequence 续接，刷新后仍绑定同一 execution。
- 同一正式路径的受控 close 回执故障 execution `9aebc4ba-e992-47cb-8faf-5a0818795659` 已完成全部业务步骤，先投影为 `cleanup_required`，没有 failure/repair；结果页“核验并清理资源”依据该 execution 的 owner audit 把 cleanup 恢复为 confirmed，并恢复同一 execution 的 completed/rerun 结果，模型调用仍为 0。故障注入只否定 close 回执可信度，真实 Python capability/browser、child 和临时目录仍走正式清理路径，不能替代前三次成功复跑。
- 结果页“符合预期”追加独立用户验收；“调整链路”从结果 execution 建立修订并发布 v5；“重新梳理需求”由正式 UI 携带安全运行摘要返回需求对话。`work/i7-requirement-return-1789981561006/result.json` 证明访谈草稿从 1 增至 2、形成 draft v2，execution 数不变；该次模型用途仅为 requirement dialogue，最近四次普通 execution 的 `llmCalls` 全为 0。
- 重启后 release v2、preset、chain v4/v5、两个 presentation、全部运行事件和 recovered cleanup 仍可由正式 API 读取。1440 链路与结果截图、390 窄屏截图分别为 `chain-workbench-1440.png`、`results-1440.png`、`results-390.png`；键盘 skip link、reduced-motion 和 390px 无横向溢出均通过。
- 结束后验收 API 端口、runner、验收 Chrome 和事件连接均已关闭；未发现带本次 I7 profile/runner 命令行的 Python、Chrome 或 Node 进程。本次运行没有遗留新的 `bat-hybrid-owner-*` 目录；系统临时目录中仍有本轮开始前已经存在的历史目录，未越权删除。
- 历史 execution `d5a86b0c-a30b-48ef-8a0c-6e7f92c5daa6` 保持不可变旧记录，没有通过字符串 special case 改写；新的结构化运行事实已使正式工作台恢复连续普通复跑。至此 R2 的运行/清理语义、R3 的可读不可变修订和 R5 的 Windows 正式产品闭环重新关闭。macOS arm64 仍没有当前设备上的真实运行证据，不计为跨平台已通过，按 ROADMAP 的延期门在公司设备补验。

## 2026-09-21 真实 B-U 预执行回归：动态集合选择证据

```text
Product Alignment:
- natural-language task: 在执行时页面中确认会变化的合格候选集合，选择当前目标项并完成后续浏览器结果
- reusable chain boundary: 完整候选集合读取、被点击项在该集合中的序号与运行时选择绑定属于 TaskChain；探索模型只负责理解页面和选定合格候选集合
- runtime inputs: 已确认需求、计划步骤、当前页面、完整且未截断的候选查询、被点击目标
- dynamic task outputs: 可复跑 read-fields、集合 count、目标 ordinal binding 与最终状态证明
- generic platform capability used: Browser-Use find_elements、B-A-T verified natural read、data.transform count、structure target
- replay model calls: 0；模型只用于首次准备探索，普通复跑用持久化读取和序号绑定
- site/task-specific code added: no
```

回归事实：正式 job `55079d03-1c5b-484e-8cb4-28496925b138` 把动态末项绑定错误地用于搜索结果，而内容页的实际集合项仍编译成一次性 history 目标；样本验证随后以 `element_identity_unavailable` 失败。该 job 不构成发布或验收。修复必须拒绝没有集合查询证明的重复集合目标，并要求动态选择紧邻消费对应完整候选读取；R2、R3、R5 与 I7 继续保持重新打开。
### Product Alignment: navigation consumer readiness and runnable projection

- natural-language task: 打开目标页面后读取真实候选集合、选择当前可播放的最新项，并且只有正式样本验证通过后才允许直接运行。
- reusable chain boundary: URL 变化的浏览器动作必须等待其已验证的下游结构化读取稳定；已发布版本与已验证可运行状态分别投影。
- runtime inputs: 已确认的入口、搜索词和已发布链路版本。
- dynamic task outputs: 当前页面的候选集合、动态选择序号、播放状态和样本验证结论。
- generic platform capability used: ConsumerReadiness、browser.read-fields、版本化 TaskChain 和 preparation 状态投影。
- replay model calls: 0。
- site/task-specific code added: no

## 2026-09-24 新建《凡人修仙传》任务的 headless 技术运行取证（产品修订闭环未通过）

- 当前 checkout 未清理、未 reset、未建 worktree、未提交或推送。新任务 `2a777a77-353e-4894-9b96-1e505827d366` 从正式 Workbench 建立并确认 Requirement v1 `13891ff7-6f9b-4f49-8938-cbfd729f7ad1`；唯一准备 job `71bf5d64-b038-480d-85dd-34fc89b46fc7` 做过一次 headless B-U 代表试做并生成草稿。它的自动首次样本因页面身份观察失败；原始生成链还在剧集页点击历史 `a[6]`，不能证明每次选最新正片，故未直接发布。
- 开发者在 headless 页面脚本中直接调用草稿修订 API，参考旧 Release V8 的任务数据，手工加入当前剧集列表读取、纯函数选择和运行时目标序号绑定；这一步没有经过产品的用户修订入口或自然语言调整建议确认。旧失败执行保留。第二个样本在点击前因草稿沿用的 15 次命令上限被阻断；该图实际成功路径至少需 17 次。开发者再次直接调用草稿 API 显式把命令上限设为 24，生成草稿 revision 2、链 v3；该操作受计划步骤上限约束。未把站点、剧名、剧集类型写入平台运行源码。曾加入但未被这条任务使用的成功直线路径自动预算推算不能覆盖分支/循环，审计后已删除。
- 开发者脚本修订后的草稿样本 `08fcf792-e672-465d-8ac2-ae37c73a8563` 和独立复验 `feb604f7-4d17-4fb8-8728-42359c5f08e2` 均 completed、各 17 次浏览器命令、0 次模型调用、cleanup confirmed；任务数据中的最后浏览器动作要求 `media_playback=playing` 并成功结束。随后在正式画布点击发布 Release V1 `7e8388ae-4e38-485a-8cf3-a6d8d9aa642f`，验证引用精确绑定这两次 execution；发布操作不能补足此前跳过的用户修订验收。
- 从发布画布发起的普通 execution `020eae50-ca2e-4d76-89f3-4f7e8feb0f40` 与再次运行 `e38832c3-d822-4c47-87ce-4b84fc46aa08` 是不同记录，均绑定同一 Release V1、completed、17 次浏览器命令、0 次模型调用、cleanup confirmed。每次按自身 executionId 查询得到 39 条事件，末尾 `completed` 节点 success；产品 Chrome 进程使用 `--headless=new`，未夺取桌面。运行后无本次产品浏览器 Profile 进程。
- API 再次重启和正式页面刷新后，Release V1、两条发布验证与最新完成 execution 仍可读取；SQLite 只读重开前后均有 4 条候选快照、6 条 execution、6 条 TaskRun、1 条 release、0 条活动草稿。旧准备失败早于当前发布，不再覆盖工作台和左侧任务状态；原 job 留在历史。截图与最小取证见 `work/recovery-20260924/fanren-fresh-headless-1790254513755/final-evidence.json`、`20-final-after-restart.png`（本地忽略目录）。
- 验证范围：预算修订定点测试 1/1、普通观察恢复定点 Python 测试 1/1、API 与 contracts 类型检查通过；没有运行根级全量测试。生产源码字面审计未见 Bilibili/凡人/剧集/PV 的平台特例；只有独立原型示例含凡人文案，正式入口不引用该原型。
- 验收结论：原始自动生成链没有实现“每次选最新”；后续完成记录依赖开发者绕过产品修订入口手工构造的草稿，只证明该修订数据可被执行、验证、发布和复跑，**不能证明用户能从原始失败通过产品的三种状态修订方式完成调整，也不能证明新建任务的完整产品路径通过**。播放后置条件仅证明浏览器观察到 `playing`；本次页面出现会员标记，尚无完整、不受限播放或用户业务满意的证据。用户明确要求不关机，保持设备运行。

## 2026-09-25 新建任务的正式运行与恢复取证

- 本轮 checkout 仍为 `master@7d59036332a66de8991744659d2317da126c6123`，保留原有 dirty 工作区；未创建 worktree，未 reset、clean、提交或推送。用户本轮的新指令是全部退出门通过后关机，覆盖上段历史指令；未通过前不关机。
- B-A-T 的单 Browser owner 接入了实验项目已验证的 popup resume 适配，先恢复新 `page` 再交给原 B-U attach 回调，关闭时还原。本地 headless Enter 开页样本 2/2 恢复并确认清理；正式新任务的 B-U 试做实际新开页面，未再因新页暂停。
- 正式 Workbench 新建的任务 `2db8ebfe-d99d-4b9e-b5a5-6cfc0a314841` 从需求对话确认 Requirement v1 `c8bdd7e6-fb48-4019-8850-6a653a0d42d2`，仅以 Bilibili 为来源，动态选择最新可播放正片并核验播放器状态。第一次代表试做已播放、来源完整，但编译缺 `a-0007` 的 URL 来源绑定；第二次显式沿方案重新采集，新的派生 Function 因宽泛按钮读取而无有效输出。两份失败、来源和审计均未改写，也没有无改动重跑第三次 B-U。
- 编译器现可从旧 trace 中最近且字段值唯一的已验证读取派生 `a-0007.navigate.url` 绑定，TypeScript 入库侧独立复核来源、顺序、值、唯一路径和无既有冲突事实。取 `[0]` 的读取若由输出 schema 的 `minItems: 1` 保证，空读取交由现有合同判失败，不再错误要求“空列表正常完成”分支；无保证及嵌套索引仍保留缺口门。恢复入口按完整需求、方案、输入和来源校验逐份选择旧证据，坏 artifact 只导致不可恢复诊断。`Product Alignment` 与依据见 `RESEARCH.md` 末尾。
- 工作台“只重新编译已保存试做”从第一次不可变来源生成唯一草稿 `33e617b4-5fa7-4197-83a1-2278b1fa2a16`，没有再开产品浏览器。草稿包含两段运行时读取驱动的纯函数选择，导航 URL 由当前读取绑定，最后动作检查 `media_playback=playing`；没有固定一次性剧集序号。样本 execution `0f662546-e773-428e-8f14-2a8ef6f9f82e` 与独立复验 `f7fd4d60-6a7e-4714-8b4b-446254961427` 均 completed，分别 17 次浏览器命令、0 次模型调用、cleanup confirmed。
- 正式画布手动发布 Release V1 `bf1a727a-9822-4f45-8f01-1ccda477f1a3` 后，两次独立正式 execution `4c952dd7-2f61-4023-8c25-a0ca424bd562`、`ed3ac083-035a-4a7d-8447-9e1177dd078d` 均 completed，分别绑定独立 TaskRun、17 次浏览器命令、0 次模型调用、cleanup confirmed；四条 TaskRun 均有完整模型审计和 39 条各自归属的节点事件。API 与全新 Workbench 浏览器在服务重启后仍读出 Requirement V1、Release V1、两次正式运行历史及最后一次画布状态，产品 browser `busy=false`、`cleanupRequired=false`。精简证据见忽略目录 `work/recovery-20260925/formal-result.json` 和同目录截图。
- 验证范围：popup 适配定点测试 3/3、headless 开页烟测 2/2、动态选择 Python 10/10、回调停止 6/6、来源绑定 Python 7/7、结果绑定 Python 15/15、TS 派生绑定 1/1 与选择 4/4、API/Workbench workspace 类型检查和受管 fork 来源校验均通过；未运行根级全量测试。390×844 的正式画布在暗／亮主题下可用，`innerWidth=clientWidth=scrollWidth=390`，见本轮截图。播放条件只证明执行时浏览器观察到 `playing`，不等于用户确认完整、不受限播放。macOS arm64 仍未实测；G12 异常门见下节，不宣称全部退出门完成。

## 2026-09-25 G12 自然语言调整正式页面复验

- 结果页原先填写的问题在进入调整侧栏时丢失，已把结果反馈保存在工作台共享瞬时状态；同一 job 从 `pending` 转为 `accepted` 时才清除，避免历史 `accepted` 状态在挂载侧栏时误删新反馈。调整入口的已有行为抽到独立 `ExecutionActions` 组件，未新增第二套结果或浏览器控制。正式 UI 从同次已完成运行打开调整侧栏，反馈原文保持可见，见 `work/recovery-20260925/formal-26-g12-feedback-retained.png`。
- 旧 Python About 任务 `d104df47-a2bf-44d1-9500-c04356ff062a` 的 Release V2 上，正式 UI 生成一份待确认建议 `7cfa5fa0-3bd0-40b8-8664-3b04d70388f9`；接受前无草稿、新发布，点击“不采用”后状态为 `rejected`，版本和原运行不变。另一生成中 job `1a879f90-373d-4b60-8168-65c99af0cd2c` 经正式 UI 取消；等待后仍为 `cancelled`、无草稿、V2 不变。该次不能单独证明真实模型结果曾在取消后迟到；定点测试覆盖迟到完成的防护。
- 同一旧任务从正式结果页说明 `paragraph` 读取要归一化空白。建议 job `6305d709-a798-4ba9-8fcd-a633fb5f2be5` 基于本次运行证据生成 `replace_node(s-a-0002)`，差异仅把该字段的 `normalizeWhitespace` 设为 `true`。接受前 Release V2 不变、无草稿；从正式 UI“接受并应用”后唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9` revision 1、checksum `e41e18619b7abf6a1a49acb8556fdc738b4286b00aa9eb4642f8953eb395ba98`，验证记录清空。截图 `formal-34-g12-paragraph-pending.png`、`formal-35-g12-paragraph-accepted.png`。
- 正式 UI 草稿样本 `c6f2e999-d134-4db8-80f2-63ca9d6d054d` 和独立复验 `9ad6cf12-b9bf-4efc-89e0-a6993c11caaa` 均 completed、各 3 次浏览器命令、0 次模型调用、cleanup confirmed；两条验证记录引用接受时的相同 checksum。手动发布只新增 Release V3 `0e01c4fc-c6a8-4eb9-8d11-b0b576583507`；正式复跑 `5957839b-11f7-44ea-8eb7-a48084ef630f` completed、3 次浏览器命令、0 次模型调用、cleanup confirmed。正式 UI 历史按需列出 V1/V2/V3 与各次旧执行；API 重启、全新 UI Chrome 重开后仍读出 V3、`accepted` 建议、原 V2 历史和最新完成运行。截图 `formal-39-g12-independent-completed.png`、`formal-41-g12-v3-published.png`、`formal-45-g12-history-panel.png`、`formal-48-g12-release-history.png`、`formal-50-g12-v3-persisted-canvas.png`。
- 后续从 V3 已完成运行提出一份只改动作显示名的建议 `83f98d12-fa7a-4dfd-8e68-d78a79f3e55f`，候选待确认且无草稿。该运行确已满足原 Python About 读取需求，正式结果页据实标记“符合预期”，使候选引用的同次运行 review 证据变化；正式 UI 再点“接受并应用”收到 `adjustment_evidence_stale`，显示“原运行证据已变化，请重新确认问题”，未写草稿、V3 不变。全新 UI Chrome 重开后，待确认候选与反馈仍可恢复；随后通过正式 UI 取消，候选仅留审计，状态 `cancelled`。截图 `formal-51-g12-stale-candidate-pending.png`、`formal-53-g12-source-reviewed.png`、`formal-55-g12-stale-rejected.png`、`formal-57-g12-pending-restored.png`。
- 调整侧栏在正式 390×844 页面暗／亮主题下可见、可读，无页面横向溢出，`innerWidth=clientWidth=scrollWidth=390`，截图 `formal-60-g12-adjustment-390-dark-visible.png`、`formal-61-g12-adjustment-390-light-visible.png`。
- 定点测试：API 调整合同 13/13、Workbench 已接受版本判定 1/1；覆盖取消后模型迟到、过期基线/来源证据、拒绝与重复接受不写草稿。三次新运行各有 15 条同次节点事件，机器可读摘要见 `work/recovery-20260925/g12-result.json`。正式 UI 尚未取得失败草稿试跑、真实需求误解回流及清理异常分流的同轮场景证据；不能用定点测试或历史 I7 记录冒充这些正式退出门。G12 仍是部分通过；在全部退出门取得证据前不执行关机。

## 2026-09-25 全新《凡人修仙传》来源直接编译与复跑

- 修复前的正式新任务 `b1e38157-4e23-4511-9dbe-7eaaf6ca07c2` 经 UI 完成需求确认，B-U 作业 `d301943b-213d-45db-8eec-381618923da0` 真实完成 14 次浏览器命令并观察到播放，但当次自动编译在 a-0013 因 `selection_annotation_unavailable` 留缺口，没有草稿。根因是动态 Pydantic 输出类型与原注解合同交接不兼容；没有用该来源离线重编译宣称验收。
- 修正通用边界后，从正式 Workbench **再次新建**任务 `3286024e-09c8-45b0-a342-488597ebfe99` 并确认 Requirement V1。其唯一准备作业 `b464b45e-5dca-47ca-85dc-94e6f3f9c8b8`、浏览器运行 `fc33da66-efa9-443a-83e9-5b2e64215b6b`、新来源 artifact `618229f3-0d6c-456e-8068-5f95fccee37b` 绑定同次真实 B-U：11 次浏览器命令、`sourceSuccess=true`、自动首编译 12 段且 `gaps=[]`。`recoveredFromJobId`/`resumedFromJobId` 均为空，没有旧来源回填、脚本注入计划或草稿。
- 工作台自动样本 `fa626c71-8f72-4676-82d6-29ade0349544` 与独立复验 `76522b33-e747-4705-8aa9-86079da09076` 均 completed、cleanup confirmed。画布手动发布 Release V1 `ddc3b48e-c8be-4c05-8903-35b9c20953dd`；从已发布画布运行 `cc8fd480-ea18-43fb-801e-1da70d109449`，再次运行 `be137f20-155d-436f-83ff-a209b5b12d13`，四次 execution 各有独立 TaskRun、16 次浏览器命令、`llmCalls=0`、39 条同次节点事件、cleanup confirmed。发布链含当前候选读取及两处纯函数选择，点击使用 Function 的运行时 ordinal；最后 `wait` 节点要求 `media_playback=playing` 并在两次正式运行成功。
- API 重启后，同一 Release V1、最新完成 execution 和其 39 条事件仍可读取；新启动的正式 UI 浏览器也重新显示已发布画布与完成状态。精简证据为 `work/recovery-20260925/fresh-fanren-final.json`，正式页面截图为同目录 `formal-new-fanren-ready.png`、`formal-new-fanren-formal-one.png`、`formal-new-fanren-canvas-after-restart-loaded.png`。集成的新页恢复此前 headless Enter 烟测恢复 2/2；正式 B-U 来源 `d17ad049-ad7c-4f57-8c6c-6e91d48d27bc` 的 a-0004 点击确实跨到新标签，来源仍 `sourceSuccess=true` 且 trace 完成。本轮最终新任务没有把该旧来源用于编译验收。
- 定点验证：动态选择 Python 11/11、注解 7/7、相关 Ruff 与受管 fork 来源校验通过；未运行根级全量测试。结论限于本任务 Windows x64 的新来源直接编译与真实复跑；浏览器观察到 `playing` 不等于用户确认完整、不受限播放。G12 尚缺的异常分支及 macOS 真机仍按上节和 ROADMAP 单独记录。

## 2026-09-25 11:40 用户可见播放手测反证

- 用户从正式画布点击“运行”产生新 execution `ccf34266-54dd-4fef-8f1b-992070ae95c6`，11:39:09 创建、11:40:11 标为 completed；16 次浏览器命令、0 次模型调用。该 API 进程实际继承 `BAT_UPSTREAM_BROWSER_HEADLESS=1`，所以运行中没有可见浏览器窗口。“即时”只设置节点间等待为 0 毫秒。末节点的 `media_playback=playing` 是当时的页面状态，未验证系统扬声器输出。
- 执行结束后 `withHybridCapabilities` 总会关闭 runner，Python runner 对其拥有的浏览器调用 `kill()`；这次第一次清理曾报 `cleanup_close_protocol_timeout` / `cleanup_child_exit_timeout`，但进程树与临时目录已确认回收、无活动资源，第二次 owner verification 于 11:40:11 确认清理。此前“播放成功”的表述只能表示瞬时技术后置条件成立，不能表示用户可持续观看或听到声音。
- 已把当前 API 重启为默认有界面的配置，并从正式工作台 UI 只做一轮新验证：execution `7e6680f2-18a1-4aac-838f-962d9ed091f0` 确实产生无 `--headless` 参数的可见 Chrome 窗口，页面标题到达哔哩哔哩；但本轮在 `s-a-0004` 点击后的 `ordinary_postcondition_failed` 终止，仅 8 次浏览器命令，清理 confirmed。没有盲目重试或据旧 headless 成绩宣称 headed 验收。当前链路尚未通过用户可见播放验收；持续观看还需要明确的用户交接与会话生命周期设计，不能仅取消 headless 或跳过清理。
- 增加不含页面内容的有限失败诊断后，正式有界面 execution `9c49f1f7-584b-4936-85ee-19b15b508ee7` 精确报 `ordinary_postcondition_failed_read_fields_read_collection_limit`，清理 confirmed。唯一新来源的全页 `a` 读取当时恰好 200 条且无人消费，编译器却保留该段并让前一步等待它；页面链接集合后来超过 200 才暴露失败。正在修通用编译依赖/覆盖与就绪条件边界；旧 Release、旧来源重编译和旧运行都不作为修后验收。
- 通用编译修复已落地：只有完整证据支持、无动作或结果消费的纯 `find_elements` 才从复跑主链裁剪，来源覆盖仍可复算；ConsumerReadiness 只重绑到保留的真实读取，且仅跨已有“未派发”证明的失败动作，否则留 `missing_effect_proof` 缺口。定点 Python 36/36、相关 Ruff、受管 fork 来源校验通过。旧来源的只读离线诊断显示宽读取不再入链、原动作改等窄读取；这不算修后新任务验收。依用户最新指令，旧任务 V1 直接弃用，不做兼容修订或额外特例。

## 2026-09-25 修复后全新《凡人修仙传》正式路径

- 正式 Workbench 新建任务 `60d9b658-ba77-4da2-82d8-771d2d0bc9c7`，需求对话选择 Bilibili 官方番剧或版权方页面并确认 Requirement V1；明确执行时动态选最新可播放常规正片、排除预告/花絮/特别内容，只核验播放器正在播放。唯一准备作业 `97f8f1e8-89f4-47c1-8fce-c49e003cbb45` 的新 B-U 运行 `41f5ae97-1ced-4928-8b92-5de30cc78c2b` 有 11 次来源动作、`sourceSuccess=true`，没有 `recoveredFromJobId` 或 `resumedFromJobId`。其中 `a-0005`、`a-0006` 的前后 tab ID 分别变化，两个新页切换后来源继续完成；本次产品 Chrome 进程无 `--headless` 且有窗口句柄。
- 同次首次编译的 source artifact `d06a2e7b-5183-48b8-8940-82fc8c3eac7d`、编译 artifact `3f7cee11-ccc9-42ee-8c4e-3b25c48501ae` 生成 11 段、`gaps=[]`。两个 Function 均从本次运行的候选读取取得输入，目标点击有运行时 `ordinalBinding`；已验证但无人消费的 `a-0007` 只留 `agent_internal/native_dom_lookup_observation/v1` 覆盖，不进入主链或就绪条件。来源候选读取分别为 64/100 和 38/50，均报告完整；将来若页面集合超过上限，运行会严格失败，不能宣称对所有未来页面变化永久保证成功。
- 自动样本 execution `76dce874-dd04-43ee-8e63-5c5498644773` 与独立复验 `430faaf3-a6fd-46b7-811e-0991a99c2d08` 均 completed；随后从正式画布手动发布 Release V1 `3ad2967b-b6b2-4809-893c-e898ee1fa9b9`。两条独立正式 execution `6d27d125-f308-40c1-83c8-c39edaf74021`、`0cfa0b65-c18b-4a5d-8866-2766d2ead177` 均 completed、各 15 次浏览器命令、`llmCalls=0`、cleanup confirmed。四次运行各自拥有不同 TaskRun、各 36 条同次节点事件；最后 `s-a-0010` 的 `media_playback=playing` 后置节点四次均 success。旧任务 `3286024e-09c8-45b0-a342-488597ebfe99` 按用户指令归档弃用，没有改写它的 Release 或失败运行。
- API 进程重启后，全新 Workbench Chrome 重开并选中该任务，正式画布仍显示 Release V1、11/11 完成及最新运行完成，SQLite 只读重开也可读取四次 execution 与其 TaskRun。证据截图位于忽略目录 `work/recovery-20260925/formal-new-fanren-20260925-*.png`；未运行根级全量测试。浏览器的 `playing` 仅证明当时 DOM 播放状态；现有 runner 随 execution 结束自动关闭 Chrome，尚未证明持续可见播放或扬声器有声，不能把这项用户可感知结果写成已验。

## 2026-09-25 单次运行浏览器显示模式与路径复核

- 正式运行弹窗的“运行设置”新增本次 execution 的“无界面运行（Headless）”选项，默认关闭；UI 选择经 `run_task` 合同持久化到 TaskExecution，再传至现有 hybrid BrowserProfile。正式复跑中的显式 `false` 覆盖全局环境变量，恢复同一 execution 使用保存值；旧 BrowserSkill 链路若选择 headless，会在入队前以 `headless_runtime_unsupported` 拒绝。相关合同与 API 定点测试 12/12、contracts/API/workbench 类型检查通过，未运行根级全量测试。
- 正式工作台勾选后发起 execution `442f8563-8e78-4be5-844a-4835983ea137`：持久化 `browser.headless=true`，产品 Chrome 根进程实际包含 `--headless`，运行 completed、15 次浏览器命令、0 次复跑模型调用、cleanup confirmed。重开弹窗默认选项复位为关闭，工作台发起的可见模式 execution `6771d738-8191-429d-8c0f-27803639d6c9` 保存 `browser.headless=false`，前三个节点成功，第四个节点 `s-a-0004` 的 `browser.read-fields` 在 7 次浏览器命令后报 `hybrid_runner_failed:RuntimeError`，cleanup confirmed；本次没有到达播放器，不计为可见模式的业务通过。
- Release V1 持久化路径的第一节点 `s-a-0001` 固定导航到 `https://www.bilibili.com/bangumi/play/ss34430`，来源观察标题是《咒术回战》；第二节点才导航到 `https://www.bilibili.com/bangumi/`，搜索《凡人修仙传》后进入官方作品页、读取剧集、函数选择最新常规正片、点击并等待 `media_playback=playing`。错误深链由候选 TaskPlan 的第三个 `entryUrls` 带入 B-U，再被编译进 Release V1；已确认需求没有授权该具体内容 URL。此发布版本不可原地改写，不能用之前成功的 headless 运行掩盖路径错误或本次可见失败。
