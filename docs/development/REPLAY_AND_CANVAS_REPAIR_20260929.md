# 复跑错误与节点画布修复执行记录及剩余方案

日期：2026-09-29。状态：**核心运行链路已实施并通过；剩余通用分类与工作台可读性问题单列**。

历史授权起点是先整理错误和节点问题、再在新 session 实施；当前记录已进入该实施 session。全程沿用现有 checkout 和分支，保护已有改动，不创建分支或 worktree，不提交、不推送、不清理历史任务。

最高边界仍是 [AGENTS.md](../../AGENTS.md) 和 [任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md)。在线生成沿用 [现有方案](INCREMENTAL_NODE_COMPILATION_20260928.md)。本文件记录本轮实际实施与剩余范围，不宣称覆盖全部任务类型、循环、回退剪枝或任意输入泛化。

## 0. 当前实施状态

- 已实施并验证：runner 清理真值、execution failed/stale 时当前步骤终态结算、点击后延迟导航 supporting wait 的 runtime scope/readiness 证明、同图 8 阶段分组。原 rejected artifact 已只读重放通过，API 所属回归与 package check 通过。
- 已完成真实主线：job `31290e49-0ed3-4ce7-80d3-844764eff7e3` 完成 19 节点；样本和独立复验完成；Release V4 已发布；正式 execution `52d8ccaa-1347-47ad-8f1b-b3dcc48a7c1f` 以 19 transitions / 22 browserCommands / 0 llmCalls 完成，输出与清理均确认。工作台已显示 V4、运行完成和 8 个阶段。
- 本次 B-U 失败已定因：不是模型调用报错，而是 B-A-T 把“动作即时旧 URL、紧邻有界 wait 已稳定新 URL”的合法跨页证据误判为不连续。旧 12 次模型调用及新 26 次调用均 completed。
- 尚未完成：其它普通 prefix proof/materialization gap 的通用可继续/硬停分类；工作台“重新试做当前需求”无即时反馈；部分阶段标签泛化和横向布局过长；历史 V2 首败及旧启动/模型失败的不可恢复根因；Windows、多任务与全量回归。
- 下文 V2 和更早 execution 是保留的历史现场。凡“未实施”“当前 V2 阻塞”等表述均以本节和 PROGRESS 顶部的最新事实为准，不得覆盖 V4 的真实完成记录。

## 1. 目标与实施前历史基线

要完成的是：按用户明确路径探索，过程中持续生成节点，最终由普通执行器复跑；用户从画布能读懂动作目的与阶段关系。不增加模型交互来美化画布，不靠反复修补后碰到一次成功宣布稳定。

进入本轮实施前，不是“全部不通”，也不是“已稳定”；以下 V2 事实仅作为历史基线：

- 一次新准备已完成，在线最终快照 24 节点、重复事实 0、编译 gap 0；样本与独立复验通过，已发布本地 V2。
- 同一 V2 **正式第一次运行失败，随后一次正式运行成功**。后者模型调用 0，24 transitions / 32 browserCommands，标题正文已保存，清理 confirmed。
- 搜索入口点击的首次失败仍未定因；历史启动与模型错误缺少底层证据，不能补写原因。
- 画布顶层三节点、展开 23 张动作卡是当前数据与投影共同造成的真实问题，不是截图误解。

本轮完成条件分开记账：运行故障的定因与修复证据、诊断缺口修复、画布修复、真实主线验收。任何一项未完成都要单列，不以另外一项通过替代。

## 2. 最小实现边界

```text
Product Alignment:
- natural-language task: 从指定入口搜索目标，按指定顺序进入分页中的目标项，读取字段。
- reusable chain boundary: 现有 TaskChain 中读取、确定性选择、浏览器动作与输出绑定；展示只投影同一图。
- runtime inputs: 保留确认需求和已发布链路的输入合同；本次真实样本输入为 null。
- dynamic task outputs: 现场读取的标题、正文；不写死样本值。
- generic platform capability used: 原生动作适配、ReadSpec、QuickJS、LangGraph、ChainPresentation、运行审计。
- replay model calls: 普通节点为 0；本次任务不新增显式 LLM 节点。
- site/task-specific code added: no；网站、阶段示例、目标名称仅为任务数据和验收事实。
```

```text
Reuse Assessment:
- capability: 动作复跑、后态/读取等待、诊断投影、阶段分组与原位展开。
- existing implementation in repository: vendor/workflow-use、现有 Runner、TaskChainRuntime、presentation.ts、ChainCanvasGraph.ts。
- mature candidates and pinned versions: 沿用现有锁定的 browser-use/workflow-use、QuickJS、LangGraph；前端沿用 @xyflow/react 12.11.6、@dagrejs/dagre 3.1.1、@radix-ui/themes 3.3.0。
- selected implementation: 不更换依赖；修正原适配层与现有展示投影。
- reused public surface: 原动作派发/settle、错误与模型审计、ChainPresentation/ChainStage、ReactFlow 与 dagre。
- B-A-T-owned adapter and remaining gap: 错误事实保存、已有证据到展示分组/标题的确定性投影；首跑根因尚缺证据。
- license/runtime/platform fit: 本次不引入依赖，不新增 shell 专用产品逻辑；沿用既有选型记录，版本若变化须另核验。
- browser/runtime/state ownership conflicts: 不创建第二浏览器会话、Agent loop、调度器或检查点数据库。
- replay model calls: 0。
- rejected candidates and evidence: 不另选库；现有组件已覆盖执行和图展示核心能力，问题位于自有适配。
- focused validation: 原失败路径的针对性反例、真实 Chromium 行为、正式工作台的新准备与普通复跑。
```

2026-09-29 现场补充对齐（清理真值与失败步骤结算）：

```text
Product Alignment:
- natural-language task: 准备或复跑失败后，如实结束当前步骤并确认本次专用浏览器资源是否真正退出。
- reusable chain boundary: 不改 TaskChain 或节点控制流；只修正 execution/step 结算和 runner cleanup 后置条件。
- runtime inputs: 当前 execution、TaskRun 结果、本次 runner 的专用 Profile 路径。
- dynamic task outputs: 原业务输出与失败原因原样保留；清理结论单独记账。
- generic platform capability used: TaskPlanExecutor 终态结算、browser-use close、现有 psutil Profile 进程探针、Runner cleanup 审计。
- replay model calls: 0。
- site/task-specific code added: no。
```

```text
Reuse Assessment:
- capability: 专用浏览器 Profile 退出核验与运行失败结算。
- existing implementation in repository: browser-use Browser.kill、managed_window._profile_process_present、RunnerCleanupReport、TaskPlanExecutor.finish。
- mature candidates and pinned versions: 沿用 browser-use 0.13.8 与现有 psutil，不引入新依赖。
- selected implementation: 在 B-A-T 适配层对 kill 增加有界 Profile 后置核验；在现有 finish 集中同步仍为 running 的当前步骤。
- reused public surface: browser-use 关闭动作、psutil process_iter/cmdline、现有 cleanup stage/code 协议。
- B-A-T-owned adapter and remaining gap: 只补退出证明和状态投影；历史孤儿进程需一次性精确收尾，不回写历史运行。
- license/runtime/platform fit: 不改版本、不改依赖，Profile 匹配沿用跨平台 psutil 实现。
- browser/runtime/state ownership conflicts: 只核验当前 runner 传入的仓库专用 Profile，不扫描或停止普通用户 Chrome。
- replay model calls: 0。
- rejected candidates and evidence: 不修改 venv 中的 browser-use；固定依赖的 kill 回执不能证明 Chromium 已退出。
- focused validation: kill 回执但 Profile 进程仍存活的 Python 反例；owned browser close unconfirmed 的 TS 资源反例；replay once 失败步骤结算反例。
```

2026-09-29 现场补充对齐（在线前缀跨页就绪边界）：

```text
Product Alignment:
- natural-language task: B-U 点击会导航的控件后，经原生有界 wait 到达新页面并继续读取；在线编译不得把这段真实探索误判为来源越界。
- reusable chain boundary: 只修正“动作即时后态仍是旧 URL、紧邻 supporting wait 已稳定在新 URL”的通用运行 scope 证明；不改变任务步骤、业务选择或页面动作。
- runtime inputs: 已保存的动作/观察顺序、URL digest、tab、monotonic 时间、supporting wait coverage、编译后置条件和 proof refs。
- dynamic task outputs: 后续 read-fields 仍读取现场页面；不固化 GitHub、Issues、分页链接或样本值。
- generic platform capability used: 现有 delayed postcondition wait、Hybrid runtime scope、consumer readiness 与在线 prefix materializer。
- replay model calls: 0；修复只消费已保存的原生证据。
- site/task-specific code added: no。
```

```text
Reuse Assessment:
- capability: 点击导航在有界 wait 前完成时的因果边界证明。
- existing implementation in repository: workflow-use delayed_post_for_conditions/continuous_wait_boundary、bounded_postcondition_wait/v1 coverage、hybrid-runtime-scope 与 hybrid-consumer-readiness。
- mature candidates and pinned versions: 沿用当前锁定的 browser-use 0.13.8 与 workflow-use vendor 实现，不引入依赖。
- selected implementation: 复用既有 supporting coverage 和编译后置条件，在 B-A-T runtime scope 适配层核验同一 wait 的顺序、时间、tab、稳定新 URL、结果引用与 proof refs。
- reused public surface: 现有 trace、coverage、segment postconditions、evidence references；不新建等待器、Agent loop 或编译器。
- B-A-T-owned adapter and remaining gap: 补齐物化前的运行 scope 证明；普通编译缺口是否应继续探索仍须按错误分类单独核查，不能吞掉来源损坏或越权。
- license/runtime/platform fit: 不改依赖和平台边界，纯 TypeScript 证据校验。
- browser/runtime/state ownership conflicts: 不启动浏览器、不重放动作、不修改 Profile。
- replay model calls: 0。
- rejected candidates and evidence: 不删除 consumer readiness 校验；本次 trace 已证明读节点、selection 和模型正常，失败仅来自 delayed navigation 被当作不连续。
- focused validation: 由旧 URL 动作后态、紧邻新 URL wait 前后态和后续读取组成的红灯；破坏顺序、时限、tab、URL 稳定性、coverage 或 proof refs 时必须继续拒绝。
```

禁止借此修复扩大架构：

- 不新增全局完成 judge、模型状态字段、模型阶段标注、自动修复重试或“每个动作都问模型”。
- 不把 DOM 父子结构再塞给 B-U。语义 Function 仍只生成 source，同一观察动作只生成一次，绑定和样例由代码承担。
- 不为展示阶段拆成多个 B-U Agent、多个 TaskPlan 执行步骤或多个浏览器会话。
- 不重写 prefix/final 编译器。当前两者共用规则；最终装配是完整来源闭合与校验，不应重新请求函数或另造一套链。
- 不开发旧任务兼容/迁移；保留旧失败与版本作为证据，不原地改写它们。
- 不提高超时、次数、字节上限来掩盖原因；不删除尚有真实语义的校验换取通过。

## 3. 错误清单：哪些已证实，哪些未定因

### E1：历史 V2 首跑在“打开首页搜索框”时失败——根因不可恢复，非当前 V4 blocker

失败 execution：`d3959bd6-1b6a-41ba-8267-e46fe48be6a0`；run：`a5905d0f-d693-482f-832d-ead803d79771`。

`s-a-0001` 打开 GitHub 首页成功；`s-a-0002` 点击搜索入口后失败。错误：

```text
hybrid_runner_failed:PostconditionNotMet:ordinary_postcondition_failed_target_state_fact_mismatch
```

当时还没有输入 LangGraph，更没有提交搜索。不要再把这个错误叫作“搜索提交失败”或“搜不到仓库”。

已保存的目标是 `button[aria-label="Search or jump to, type / to search"]`，后态期望 `aria-expanded=true`、`disabled=false`。探索有 false→true 的事实；首次复跑失败时的实际属性与实际事件目标没有留下足够证据。不能确定是定位、派发、重渲染后的目标读取、等待时序或页面状态中的哪一环。

之后使用同一 Runner/ManagedWindow、同一前两步，在新 profile 与原 profile 上均成功，单次 trusted click、false→true；后续完整正式运行也成功。这些证据只能说明可成功，**不是首败根因修复**。已核查上游 `Mouse.click` 的按下/释放使用相同坐标，不能再无证据指责它释放到了 `(0,0)`。

当时的处理要求及今后同类故障的证据边界：

1. 沿现有派发→定位→后态读取→settle→错误封装链定位证据丢失位置，先读源码和保存的失败，不先加重试。
2. 复用现有错误/诊断载体，失败时保留本次动作身份、实际派发次数、检查种类、期望值/实际值、前后页面身份。点击定位疑点需能关联实际事件目标与校验目标；只取定位所需的安全摘要，不保存整页 DOM、Cookie、输入正文或浏览器凭据。
3. 在原检查处取事实，不能失败后重新点击；不能为了采集覆盖原始错误。诊断采集失败也不得吞掉主错误。能由已有记录推导的字段不重复落库。
4. 用证据区分“未点击目标”“点击发生但页面未达到条件”“条件已成立但校验读取错误”。只修实际被证实的一项。
5. 若无法复现且旧证据无法恢复，明确保留 E1 未定因，完成诊断缺口；不得宣布 E1 已修，也不得无限循环启动任务碰运气。

原执行顶层为 failed 时，保存的步骤 status 仍有 running。该独立生命周期问题已在现有 `TaskPlanExecutor.finish` 中修正：结束时将仍为 running 的当前步骤同步结算为 failed/blocked/cancelled/paused，并由“只执行一次后失败”的所属回归保护；不更改 TaskRun 的业务结论，也没有新建状态机。历史运行不回写。

### E2：滚动被要求让后续读取值变化——已证实并已修，不能再误述

失败 job：`9c8012df-931e-4af0-83cb-922f1ce5bd3f`；sample run：`f81eb07c-e34a-466f-8144-92720583d367`。

B-U 已完成详情读取；样本在滚动 `s-a-0022` 后报 `read_fields_projection_not_ready`。错误并非“滚动必须改变地址栏 URL”，而是自有逻辑把非导航 UI 动作一律转成“后续读取投影必须变化”。这个任务读的是分页链接 href，滚动露出它不要求 href 改变。

现有修正位于 `vendor/workflow-use/workflows/workflow_use/hybrid/natural_readiness.py`：只有同投影的真实前后变化证据成立，且中间动作边界允许，才要求 transition；否则采用 ready。动作本身的后态事实仍保留。

真实 Chromium 差分已验证：同一保存来源和实际物化参数，旧条件失败、新条件通过，链接值不变，两边均只派发一次、模型 0。不要重写成“所有动作都不要检查变化”，也不要再把 ready 和 transition 混用。

### E3：读取完成却缺少下一动作必需的路径——缺口已修，历史数据形状未知

V1 execution：`702b3b12-263d-4eea-8c9d-4c6440a19a41`；run：`d53491b7-9224-4395-8076-2998335d4e81`。

`s-a-0023` 读取后，`s-a-0024` 消费 `[0, attribute_href]` 报 `binding_path_missing`。原读取结果未保留，不能断言当时一定为空数组或一定缺 href。

现有 `apps/api/src/upstream-browser/hybrid-read-requirements.ts` 从直接、唯一、无条件消费者推导精确必需路径，交给既有读取与 settle；prefix/final 共用。不是给整个数组每一行强加 required，也不把合法空集合改成全局最少一项。

已撤回初版 `minItems/items.required` 做法；真实延迟 DOM 反例已证明只点击一次、原 settle 等到必需路径出现，模型 0。跨 Function、分支、循环的路径不能未经语义证明照搬这个收紧规则。

### E4：B-U 成功后被自有编译错误拒绝——已修项须保留

已确认并修正的原因，不是“原生配套方法完全没接”：

- 重复 wait 被当作未证明的业务循环；没有要求空列表业务分支却被强制补分支。
- 动作与读取之间有合法原生 wait，却被强制要求直接前驱。普通 supporting wait 继续要求同 tab/URL；另对严格的 `bounded_postcondition_wait/v1`，只有顺序、时间预算、同 tab、稳定新 URL、changed URL clause、coverage 和 proofRefs 均证明时，才接受“动作即时旧 URL、wait 已稳定新 URL”的延迟导航完成观察。页面身份不稳定、断边或引用不全仍拒绝。
- 未派发提议已有原生身份与派发审计，却额外强求并未采到的 URL digest。
- 导航目标需候选选择时，Function 结果没有接到 navigate；已沿原适配补接，不固定样本 URL。
- 原生无效索引、同一受控 tab 的页面过渡被误升为致命错误。当前交回原生重新观察，身份/越权/保存损坏仍停止。
- 逆序伪造样例否定合法“第一项”选择函数；已撤回。不能再以“变化后的答案必须不同”检验业务正确性。
- 删除 DOM enrichment 时误删原生 find_elements/search_page 的必要结果交付；已恢复原文一次交付，不恢复父子结构注入。
- 同观察事实重复追加放大 payload；已按稳定来源键去重。

本轮必须保护：在线保存、来源身份、一次动作派发、失败尝试过滤、必要读取、Function/QuickJS、人工接管、最终缺口阻止发布。普通编译缺口不能截断 B-U，也不能触发自动重放动作。

### E5：启动失败的主错误被清理异常遮蔽——投影已修，历史根因不可恢复

job：`06dc52e2-2422-402b-81c4-631d6bdd914f`，0 动作/0 模型。原启动错误没保存，只剩清理异常。之后同 Runner/profile 启动关闭成功，不能证明此前没有启动问题，也不能据此猜 profile 锁损坏。

`authoring-failure.ts` 已保留 `RuntimeCleanupRequiredError` 的 primary 消息与层级，另记 cleanup；runner 关闭现在还对本次专用 Profile 做有界退出核验，未确认时单列 active resources。历史启动主错误无法追回，后续同类故障按新记录处理；不改资源所有权、不删除 profile/锁。

### E6：原生模型连续失败但审计未保留原因——诊断缺口待处理

job：`ae44d0c7-26e9-46e0-8115-ba1173723aae`，22 模型轮、16 动作、14 节点，最后连续 6 次原生模型调用失败。无法从现有记录区分传输错误、响应格式错误等。随后同配置无浏览器探针成功，不构成定因。

沿已有模型调用审计保留安全的错误类别/原始错误码、用途和调用关联，不记录密钥、完整 prompt 或敏感响应，不新增宿主模型重试。不要改产品模型路由来绕过问题。历史原因仍标未知，不为重新制造历史失败反复调用模型。

## 4. 节点图问题与具体修复

### N1：历史 V2 为什么顶层只有三个节点

实际调用关系：

```text
preparation-plan-projection.ts → 一个 main 计划步骤
presentation.ts → 全部非终态节点放入 ungrouped-actions，并用整个任务标题命名
ChainCanvasGraph.ts → 开始 + 这一阶段 + 完成
LiveChainCanvas.tsx → 展开时切换 focusStage，替换整个画布
```

`buildCanvasGraph` 对当时 V2 的实际输出为 3 个总览节点；展开为 25 个画布节点（23 动作卡 + 阶段入口/出口），全部动作卡同一 y 坐标。固定 LR 与重新 fitView 形成横向长条。不是布局参数单独造成，也不是简单调缩放可以修复。

这一单 main/单分组设计在当时 HEAD 已存在；在线生成新增路径不等于它新发明了三节点总览。V1 为 26 个执行节点、V2 为 24 个，历史证据不支持“这一次把节点数从很少变成了几十”。不能把更早版本的数量靠印象写入结论。

当前 V4 为 19 个执行节点/18 条边，工作台已经在同一图投影为 8 个业务阶段并显示本次 execution 完成状态，不再只有 3 个总览节点。部分阶段标签仍泛化、横向画布仍较长，属于剩余可读性问题，不是当前运行失败。

### N2：历史 V2 的 24 个执行节点具体是什么

V2：8 个浏览器动作、10 个读取、3 个 Function、2 个输出组装、1 个终态。Function 是运行时对候选做选择，不是“点击的 DOM 函数”；读取和选择应保留真实依赖关系，不能为了好看全藏掉。

7 次失败原生动作 `a-0005/0008/0010/0017/0019/0021/0039` 已不对应 V2 的动作节点。不能把当前 23 张卡全部称为“没有过滤失败尝试”。成功但无最终消费者的探查读取与失败动作是两类问题。

### N3：分组采用已有展示契约，不重拆执行计划

实施顺序与确定规则：

1. 复用 `ChainPresentation/ChainStage`。只改来源到展示的投影与画布消费；不为显示阶段修改 `projectPreparationPlan` 的执行次数、预算或 Agent 数量。
2. 先做真实动作可读：动作卡包含操作和目标；优先现有非占位 label、已保存目标的可读名称、已确认输入/输出字段。没有证据只能使用中性的真实操作名，不从 URL 关键词猜业务，也不解析 Function 源码臆测意图。
3. 以真实浏览器动作/最终业务字段读取为可见锚点。相邻且专为同一锚点服务的“读取→选择 Function→动作”可组成同一阶段；从实际绑定和来源证明归属，不按每 N 个节点切块。
4. 合并必须保持图的单入口、真实出口和依赖顺序。共享读取、跨阶段依赖、分支/循环不得为了连成直线移动；保留真实边，不得复制节点。现有 `validateChainPresentation` 仍检查覆盖、入口、出口及布局身份。
5. 多个浏览器动作只有已有证据能关联到同一明确业务推进时才合并。例如本任务“打开搜索框→输入→提交”能否组成一段，先核查现有目标、焦点/输入与页面转换证据；不能仅凭同 URL 合并所有点击，也不能认为一次 URL 变化必然就是一个业务阶段。
6. 证据不足时保留单个真实动作及可读标题，不把整条链重新包装成一个业务阶段。单节点阶段直接显示动作卡，不给它一个无意义的折叠入口。已有有效业务分组优先，不能每次渲染重新猜。
7. 分组生成放在正式 presentation 创建接线处，保存为当前草稿/新版本的展示数据；不是 React 内临时推导另一张权威业务图。若现有 `createStepChainPresentation` 缺少目标语义，最小传入编译现场已有的展示素材，不加 B-U 模型必填字段。

本任务用于核对的业务顺序如下，**不是写进平台的专用分组规则或固定阶段数量**：

```text
打开 GitHub → 首页输入并搜索 LangGraph → 选择目标仓库 → 进入 Issues
→ 前往第二页 → 打开第一条 Issue → 读取标题与正文
```

可有更细的真实动作，也可在证据充分时合并相邻同目的操作。无论分组多少，折叠层必须能读出上述顺序，不能只看到“获取详情”一个大盒子。缺少某条语义映射时指出具体缺失字段及现有生产者，使用真实动作降级；不得为了凑齐七段追加模型调用。

### N4：原位展开与布局

- 复用 ReactFlow 节点和边投影。展开一段时，其余阶段仍留在同一画布，不切到一张只含所有技术节点的图；收起后回到相同阶段。
- 多节点阶段展开显示同一批真实 nodeId；外部连线进入其真实 entry，出去的连线对应真实 exits。分组卡是展示容器，不是可执行节点。
- 一次仅展开一个阶段即可；这只是视图状态，不新增持久运行状态。使用现有 focusStageId 或等价本地状态，避免第二套主图/子图存储。
- 主路径保持可读顺序，阶段内部可纵向排列；继续用已有 dagre。不要手写新的布局引擎，不靠降低 minZoom 把所有卡缩成小字解决问题。
- 展开/收起不 remount 整张 ReactFlow、不每次强制全图 fitView；保留视口上下文。初次载入或用户点击“适应视图”使用既有能力。
- 标题显示动作与目标，详情继续放输入、目标、条件与运行摘要；Function 源码、内部 ID 和 JSON 留在高级信息。不新增大段进度文案、仪表盘或状态种类。
- 节点/连线状态仍来自选中的同一次 execution，不能拼接不同运行的最新事件。在线 prefix 只表示已生成片段，不画伪成功终点；暂未完成分组时直接显示真实动作。

### N5：五个无值消费者的读取——核查后才决定是否删

当前 V2 对全部节点绑定递归检查后，以下读取没有直接或间接的值绑定消费者：`s-a-0007`、`s-a-0009`、`s-a-0031`、`s-a-0038`、`s-a-0043`。其余主要依赖为：

| 读取 | 当前消费者 |
| --- | --- |
| s-a-0015 | selection-a-0016 → s-a-0016 选择并点击仓库 |
| s-a-0022 | selection-a-0023 → s-a-0023 选择并点击 Issues |
| s-a-0024 | s-a-0025 导航到分页链接 |
| s-a-0035 | selection-a-0036 → s-a-0036 选择并点击第一项 |
| s-a-0044 | output-values → output-assemble |

“无值消费者”不等于可删。必须检查 proofRefs、readiness、runtimeScope、循环/共享依赖和成功动作的定位来源。Function 消费字段是 `inputs`，不能只搜 `input` 后下结论。

原 `natural_read_liveness.py` 已有 `consumed_query_ids/prune_unused_queries/rebind_consumer_readiness`：当前同时引用整个 trace 的 natural_binding/dom_structure/selection_function 等事实。可能存在无效旧引用让探查读取继续存活，但还没有逐个证实。

只在原 liveness 模块修正“没有任何有效执行/证明用途的纯探查读取”，留下 coverage 排除依据，重接原 readiness。无法证明安全删除的保留。此项不是整棵探索树剪枝，也不是 UI 隐藏卡片；不能以最终节点必须少于某个数验收。布局修复无需等这五个节点全部删除。

## 5. 修改入口与职责

| 范围 | 现有入口 | 最小职责 |
| --- | --- | --- |
| 点击/后态/读取 | vendor/workflow-use/workflows/workflow_use/hybrid/natural_effects.py、postconditions.py、read.py、既有派发适配 | 查明 E1 检查链，补原失败位置的安全事实；没有根因不改条件 |
| TS/Python 错误边界 | apps/api/python/browser_use_runner/hybrid_main.py、hybrid_commands.py；apps/api/src/upstream-browser/；task-chain/authoring-failure.ts | 保留主错误、原调用身份，清理单独记账；复用已有错误载体 |
| 精确读取要求 | apps/api/src/upstream-browser/hybrid-read-requirements.ts、hybrid-materializer.ts、hybrid-prefix-materializer.ts | 保留 E3 修复，不扩成通用推理器 |
| 读取保留性 | vendor/workflow-use/workflows/workflow_use/hybrid/natural_read_liveness.py | 逐条证明必要性，修正无效引用，不重造编译器 |
| 展示数据 | apps/api/src/task-chain/presentation.ts；packages/contracts/src/task-chain/presentation.ts | 复用 stages/entry/exits/layout；优先不新增公共字段 |
| 可读节点与嵌套图 | apps/workbench/src/chainNodePresentation.ts、ChainCanvasGraph.ts、LiveChainCanvas.tsx、chainWorkbenchProjection.ts、chainLayout.ts、useLiveChain.ts | 同图原位展开、真实标题与事件、保留上下文 |

这是定位地图，不是要求修改所有文件。先沿当前结构确认真实入口；CodeGraph 可用时优先使用，本次工具列表中不可用，所以使用已知文件定点读取，未执行初始化。不要扫描 node_modules。

`hybrid_main.py` 已约 500 行、`hybrid-runtime-scope.ts` 约 497 行；新逻辑不能继续堆进去。确需局部拆分只提取本职责，不顺手重构整个运行器。

## 6. 历史实施顺序与本轮执行结果

下列 A-E 是进入本轮时的实施顺序。A、清理/步骤结算、延迟导航 readiness、8 阶段分组和 D 的 V4 正式主线已经执行；E 只运行了实际改动所属的最小验证。未完成项以本文件第 0 节和 ROADMAP 顶部为准。

### A. 接手，不重做整轮探索

确认当前根目录、分支、HEAD、dirty；本次记录基线为 master / `1e9d635d7e860c1758a4e05f635b0beb1eaf9676`，只是接手定位，**不是可回退目标**。已有依赖更新、vendor 删除与大量未提交实现都要保留。

先读本文件、AGENTS、PROGRESS 顶部和实际涉及的模块；查活动 authoring job、execution、浏览器占用与 cleanup。PID/端口只作历史线索，不照抄 kill。一个产品运行只用一个真实控制会话。

### B. 优先补可定位性并处理 E1

按照 E1/E5/E6 核对已有错误通路，补最小丢失环节。增加的测试保护“失败原因不被清理/封装覆盖、失败事实来自原动作、诊断不会重派动作”，不是只断言新错误字符串。模型异常用已有可控错误路径验证，不调用模型制造错误。

若复现 E1，保留失败证据后作最小修正，证明旧逻辑在同一反例失败、新逻辑通过且派发仍一次。若不复现，记录未定因，继续可独立完成的画布修复，不能反复运行整条任务代替诊断。

### C. 让链路可读，再定点处理冗余读取

先用当前真实 V2 在内存验证展示分组/标题/图边映射，再接正式创建 presentation 的路径；不得在 DB 手工拼阶段或修改已发布 V2 充当产品实现。

最小反例包括：同 URL 的不同操作不能被全吞成一段；一次点击不跳 URL 仍可推进；共享读取不能复制；分支/循环不能被直线化；展开某阶段时其他阶段仍可见；切换 execution 不串运行状态。使用已有结构能力，不要求另跑两套新网站任务。

对 N5 逐条列出保留原因或可删证据；实际需要改 liveness 才执行相关编译测试。原 prefix 与 final 同源规则、失败动作过滤和最终无缺口必须保持。

### D. 正式主线验收

通过实际 Workbench 入口创建新的准备/版本，按已确认需求运行：GitHub 首页→首页搜索 LangGraph→目标仓库→Issues→第二页→第一条详情→标题/正文。不得从仓库 URL 起步，不手动填节点/绑定/输出，不绕过同源检查触发准备。需要修正实施中的错误时保留第一次失败，再报告原因和变化，不能把第二次成功冒充首次通过。

记录需求版本、job/source、在线快照变化、最终 chain/digest、样本、独立验证、发布版本、正式 execution/run、模型调用审计、输出与 cleanup。检查运行过程中已出现节点，而非结束后才一次生成。

当前“第二页第一条”会随网站变化；以运行当时列表顺序和真实点击为准，不把历史 #9033 或 1801 字符设为断言。读取结果在本地受控记录内核对，原始正文不加入 Git、快照或日志。

### E. 验证范围与成本约束

- 只跑本次实际修改相关的现有 test 文件/用例。不要执行根级 test 或 workspace 的全量 test 通配脚本。
- 前端优先现有 `chain-workbench-projection.test.ts`、`chain-canvas-readonly.test.ts`、`chain-build-projection.test.ts` 中相关用例；API 依修改范围选择 `runner-cleanup.test.ts`、`hybrid-read-requirements.test.ts`、`consumer-readiness.test.ts`、`online-compilation.test.ts`。不是全跑清单。
- 测试选择使用项目已有 tsx/Python 环境，不调用可能下载包的临时工具，不更换依赖。涉及 TS 边界时运行对应 workspace 的 `check`，例如 `npm run check --workspace @browser-capture/api`；不默认全仓 build。
- 已存在真实 Chromium 夹具 `read_requirements_browser.py`、`read_requirements_probe.py`、`scroll_readiness_browser.py`；仅相关逻辑变化才重跑。不要为演示通过重新堆一组模拟测试。
- 修改 vendor Python 后仅更新 `LOCAL-CHANGES.json` 中实际变化文件的摘要，并经现有 `verifyForkSource` 核验；不能全量重建摘要掩盖意外变动。
- 需要重载服务时先确认无活动 job/execution/browser/cleanup，识别本 checkout 拥有的实例，只通过原关闭入口操作；不能边跑边改 Python 源码或杀别的任务。
- 最后真实查看工作台：折叠可读流程、原位展开、运行反馈/输出；保存本地截图作为证据。静态投影通过不能代替这一步。

## 7. 验收判据

1. **主线真实性**：新准备实际从首页走明确路径，边运行边保存节点；普通复跑模型 0，合法终点完成，清理独立确认，第一次失败记录不被改写。
2. **故障定位**：失败能区分原生探索、编译、普通动作、读取、模型、清理；安全主原因不被后续异常吞掉。E1 没有根因证据时明确未修，不因成功重跑打勾。
3. **可读性**：用户不打开 JSON 能看出搜索、仓库、Issues、分页、目标项和字段读取的先后；不再只有整个任务一个盒子。
4. **折叠价值**：多动作阶段可原位展开，其他阶段保持可见；单动作不强制套壳；技术动作有真实目标，Function/读取依赖可追溯。
5. **同一执行图**：展示分组/布局不改变 executable chain digest、节点身份、实际控制流与模型调用。阶段覆盖每个非终态节点一次，业务不同终态不合并。
6. **减法安全**：不以少节点数为目标；删除读取必须有无用途证据，不损坏定位、readiness、输出和样本。去掉错误约束不等于取消所有检查。
7. **未知诚实**：历史启动/模型原因若已丢失，不要求凭空恢复，不以它们为无限重跑目标；结论保留“历史未定因，错误保存链已修/仍未修”。任何新的同类失败都必须按新证据处理。

不得给出“绝对不会失败”的保证。交付应说明本次证明了哪条不变量、真实首跑是否通过、还有哪个故障未定因。

## 8. 实际记录索引（只读证据）

任务 `a81d8a80-50ae-48aa-a06c-558ccf08f76a`，确认需求 v2 / revision5，标题“获取第二页首个 Issue 详情”。

当前 V4 证据：

| 记录 | ID / 事实 |
| --- | --- |
| 成功准备 | job `31290e49-0ed3-4ce7-80d3-844764eff7e3`；final sequence25；19 节点/18 边；26 次 provider invocation completed |
| 关闭来源 | artifact `a1deeba0-4878-4f29-838c-6f5d92adda7b`；digest `228562d16d249eb66cbfa626a65b1edb41101080a69a61fec223c6db9936f461` |
| 样本 | execution `9ffd8c7b-c43e-4365-88bd-f9334f55a61f`；19 transitions/22 commands/模型0/cleanup confirmed |
| 独立验证 | execution `e83d25cd-3e89-47a5-831a-dab6d767163a`；19/22/模型0/cleanup confirmed |
| 本地发布 V4 | release `eb5409ff-e3d1-4539-8c0b-6818b485a798`；chain `19a25488-cadb-4042-80da-dc5f5635b4c4` v1 |
| V4 正式成功 | execution `52d8ccaa-1347-47ad-8f1b-b3dcc48a7c1f`；19/22/模型0/cleanup confirmed；标题与正文已保存 |

以下是保留的 V2 历史证据：

| 记录 | ID / 事实 |
| --- | --- |
| 历史成功准备 | 6320f07d-a641-45d5-8ae8-c15fded197e3；45 原生动作，final sequence46，24 节点，dup0/gap0 |
| 关闭来源 | 23378830-f5d7-4fe3-823c-9ad0b3db97d7；digest 155dbf2562785bc4533de7420527f99134d855d4875cf86b72e616356f0a22aa |
| 样本 | 795d23f1-a17f-400d-8380-8b42633a7eb0；run 733a7459-a8e0-47f9-801d-f19f9113981e；24 transitions/32 commands/模型0 |
| 独立验证 | ed19a4e9-3eeb-4677-8288-dab4426b5eaa；run fdeb3c01-7717-4de6-8146-4c7752958ddf；24/32/模型0 |
| 本地发布 V2 | plan v3；chain 7cc1e3dd-0595-43ad-81ef-2df380c7c9b8/v1；digest bbaa7067ef9600063dda3282255b02dca267914d02d9f707d02b2a533aac395b |
| V2 首次正式失败 | execution d3959bd6-1b6a-41ba-8267-e46fe48be6a0；run a5905d0f-d693-482f-832d-ead803d79771；2 transitions/4 commands/模型0/cleanup confirmed |
| V2 后续正式成功 | execution cff34d1b-2c78-451f-8c27-1514d0d454e9；run 1a91cbd2-c0c1-4963-8676-421d5360b566；24/32/模型0/cleanup confirmed |

本地数据库为 `data/workbench.sqlite`，使用只读连接；先确认表结构再查询，避免误读旧 contract 行：

- `taskAuthoringJobs.body` 中 `authoring.build.payload` 是 JSON 字符串，payload 内 canonicalRequest 也是 JSON 字符串。
- `taskArtifacts.body` 保存 source/v3，result 中有 canonicalRequest/sourceGaps；闭合来源不得改写。
- `taskReleases.body` 的 `content.steps[]` 含完整 chain 与 presentation；当前发布链不应从旧 `taskContracts` chain 行推断。
- `taskContracts` 中 kind=run 为 TaskRun；`taskExecutions` 记录本次产品执行、步骤与清理。失败时 checkpoint 可能已清空，不能假设旧节点结果还在。

成功截图：`work/github-corrected-run-gkX8r0/v2-formal-run-completed.png`。诊断探针也在该目录，仅作调查材料，不是正式验收入口；旧临时 profile 探针曾出现 lease 清理不确认，已按 owner 恢复，不能不查资源归属就重复运行。

上一轮临时布尔插桩已撤销，产品 `natural_effects.py` 恢复原摘要。最后记录的 fork digest 为 `328645776beda12f146f9a4e8462a8a3dc72eaea806d0afe34f54656b4e73d58`；它是历史基线，接手发现源码变化时以当前核验为准。

## 9. 交付与停止条件

当前核心实施与 V4 正式验收已经完成；PROGRESS 顶部记录“已修且证据是什么 / 尚未定因 / 未测”，历史事实保留。ROADMAP 只保留下一步，不再把多个旧“正在运行”状态当成当前事实。

收尾至少给出：最小改动清单、E1/E5/E6 当前结论、分组前后真实截图、节点保留/删除依据、一次正式主线记录和模型/清理审计。没有完成就明确未完成；不得只以测试条数、编译通过或重跑成功交付。

需要新授权的动作（新增工作树/分支、清理持久数据、更换关键依赖、改相邻项目、提交/推送）停止并询问。遇到登录/验证码交用户，不绕过。当前已授权的局部修复及其必要针对性验证无需反复询问。
