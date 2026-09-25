# 开发路线

## 当前阶段：新建任务最小闭环已通过；异常分支仍待验

2026-09-25，正式 Workbench 新建的《凡人修仙传》任务已从需求确认走到当次 B-U 成功、自动首编译零缺口、样本与独立复验、手动发布、两次零模型正式复跑和重启持久化；逐项证据见 [PROGRESS](PROGRESS.md#2026-09-25-全新凡人修仙传来源直接编译与复跑)。G12 的失败草稿试跑、真实需求误解回流和清理异常分流尚无同轮正式场景证据，macOS arm64 仍待设备实测，不能纳入已通过结论。

保持 [工作台与任务生命周期减法基准](WORKBENCH_SIMPLIFICATION.md) 的“一个草稿、手动发布、按需历史”方向。减法已经部分实施，不能继续标为未实施，也不能依据旧链局部验收宣称全链路完成。当前唯一恢复顺序见 [能力对齐与恢复基准第 8 节](PRODUCT_LOOP_CAPABILITY_AUDIT.md#8-要做什么完成后能达到什么效果)：先解开最新任务计划失败及无图死路，再对齐需求调研、真实试做和编译，再验证草稿／发布／复跑，最后补齐已有链路出错时的自然语言调整与正式组合验收。保留真实阶段产物和恢复能力，不恢复独立 Plan/Results/repair/preset。

退出必须从正式页面新建需求开始，经过必要调研、方案、真实预执行、链路编译、试跑、手动发布、同链再次运行及重启核验；计划、试做、编译失败各在原阶段恢复，链路形成之后才有链路调整。不能注入计划/链路、不能刷新页面掩盖状态停滞，也不能用旧发布链代验。以下旧阶段记录仅说明当时特定样本通过；不覆盖当前已发现的新建任务阻断。

当前执行顺序是 A → B → C → D → 产品最小闭环既有实现 → 闭环修订 R1–R5 →
[正式复跑恢复与链路工作台开发基准](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md) I1–I7 → 组合复验。I0 架构与交互原型不是生产证据。2026-09-22 02:11 已补齐 R1 三分支、I7 修订与清理恢复、真实需求回流 v3 及新发布 release v6 的零模型正式复跑，Windows x64 产品闭环通过，具体证据见 [PROGRESS](PROGRESS.md#当前状态)。A、B、C 已通过；D 已在当前 Windows x64 产品范围内通过，macOS arm64 由用户延期到公司设备验证且不冒充已测。

2026-09-22 02:51 用户复核后补齐阶段可读性门：正式修订发布 release v7，四业务阶段 / 11 动作 / 11 连线，删除新链中的 60 条重复异常边；实时阶段、子链类型、草稿与运行分离及重启持久化均已正式复核。证据为 `work/stage-chain-1790016501961/closure.json`；此前单阶段“61 个出口”展示不再作为可读性通过证据。

2026-09-22 03:04 补齐节点修订交互与验证含义修正：正式 UI 已验证点选动作后在右侧保存/还原名称与固定输入、新增 Function 及删除后恢复同一执行图和阶段展示；证据 `work/node-editor-1790017262509/result.json`。候选 chain v3 的一次 UI sample completed / cleanup confirmed / llmCalls=0，证据 `work/node-trial-1790017373294/result.json`；独立复跑未执行、未发布，release v7 / chain v2 保持不变。当前链路无运行参数，验证区不能直接换动漫。草稿画布已精确绑定候选验证事件；`work/node-trial-1790017373294/restart/result.json` 重启后只读确认同次 execution 的四阶段与 11 动作完成，未新增运行；Radix Select 分组修复与验收边界见 [RESEARCH](RESEARCH.md#2026-09-22-节点修订交互与验证含义修正)。

| 阶段 | 交付 | 进入条件 | 退出条件 |
| --- | --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 可保存、加载并关联真实动作、命中上下文和结果 | 固定来源校验通过 | 已通过 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 可重新解析的唯一目标及有来源的字段值 | A 通过 | 已通过；ResultSpec/ResultBinding 内部包及真实 GitHub E1–E4 均通过 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 定位、滚动、操作、条件等待和读取按真实后态推进 | B 通过 | 已通过；慢响应、分页、遮挡、取消与恢复无重复副作用 |
| [D 复跑干扰与显式节点](replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md) | React 干扰实验站、跨 Windows/macOS 的隔离 Function、多路 Branch、显式单值 LLM | A–C 已通过 | 干扰矩阵、Function 双平台准入、v2 节点、真实页面和不同输入均通过独立验收 |
| [产品最小闭环](MINIMUM_PRODUCT_LOOP.md) | 可运行版本、运行预设、准备编排、链路画布直接运行与实时运行流、结果回执、人工等待与修复 | D 的当前产品范围通过 | P1–P6 全部退出；用户不接触 JSON 或内部验证按钮即可完成创建、准备、画布内运行、观测、查看结果和修复 |
| [闭环修订 R1–R5](REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md) | 充分需求对话、来源解析、准备边界、技术运行完成、用户验收、自由画布修订和需求回流 | P1–P6 既有事实可用 | R1–R5 Windows x64 正式产品闭环通过；macOS arm64 不冒充已测 |
| [正式复跑恢复与链路工作台](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md) | 分离链路结果与资源清理；先建立 ChainPresentation/CapabilityDescriptor 服务端事实，再接画布内运行、单次 execution 运行流、阶段总览、同画布聚焦和版本化修订 | I0 原型确认；实际第三次复跑与画布问题已核验 | I1–I7 Windows x64 已通过；跨平台结论等待 macOS 真实设备补验 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 正式产品入口、保存加载、同链换输入、清理恢复和可读修订工作台 | A–D 与修订 I1–I7 在 Windows x64 通过 | macOS arm64 真实设备补验；普通复跑继续只允许显式节点调用模型 |

当前动作：

1. [ResultSpec / ResultBinding 开发计划](RESULT_SPEC_BINDING_IMPLEMENTATION.md) 的 B 内部 P1–P6 已完成。
2. 2026-09-19 真实 GitHub B 已通过：E2 0 gap/1 分支，E3 `5/5/详情`、E4 `1/0/无详情`，两次普通复跑模型调用均为 0。
3. B 完成状态已由本地提交 `8aaa4a8` 固定；未推送远程。
4. [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) 已通过：复用稳定目标、ConsumerReadiness、缺失目标分支和 ResultBinding，补齐动作准备、单次派发、真实后态与取消/恢复。
5. C 的定点、受控竞态与真实可见 Chrome 验收均通过；普通复跑模型调用为 0，浏览器已回收。
6. D1、D3、D4、D5 以及 D2 Windows x64 已有独立结果；macOS arm64 延期，边界见 [D 验收记录](evidence/browser-replay-repair/D_ACCEPTANCE_CONFORMANCE.md)。
7. [闭环修订基准](REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md) 的 R1 → R5 与 I1–I7 已在本轮 Windows x64 正式产品验收通过；来源读取、文档身份、离线编译、运行计账及清理生命周期缺口均有对应修复与产品复验，不再依赖较早历史结果。
   搜索继续由 Pi ResourceLoader/extension/tool registry 管理，以成熟搜索 extension 为主、Bing RSS 为通用只读后备；Auth/API Key 只属于模型连接，模型设置不承担搜索配置。
8. ChainPresentation、CapabilityDescriptor、presentation digest、原子 revision operation、React Flow + Dagre 运行台和 descriptor 驱动编辑均已接入正式产品；旧链只读兼容，新发布链保存独立 presentation。
9. TaskRun 无真实节点/合同错误并到达合法终点仍为 completed；runner/browser/temp 清理是独立 execution lifecycle，未确认时只进入 cleanup_required，不进入链路 repair。
10. 当前 I7 证据为 `work/i7-final-product-1790011932163/result.json`，需求回流为 `work/i7-requirement-return-1790012443299/result.json`；v3 再准备、发布 release v6 和工作台普通复跑为 `work/i7-reprepare-1790013905749/result.json`，同目录保存零重探索、单次补函数的来源审计。更早证据保留为历史记录。
11. 下一项独立待办是普通点击约 48 秒的内部性能归因；现有日志仅能证明节点总耗时，未解决根因。不得以盲目重新探索或增加业务字段替代定点计时证据。
12. 组合验收继续保留 A–D 技术不变量；产品闭环通过不自动等于延期的 macOS 验证通过。

任何阶段失败都停在所属模块修复；不重新探索整项任务来掩盖局部合同缺口。
