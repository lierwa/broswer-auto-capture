# 任务方法留存：最小替代方案

日期：2026-10-07；源码基线：`master@3b8049e`。第三稿修订版，取代前两稿的步骤级完成 boolean 方案。**R1–R9 设计评审通过；用户随后授权实施，当前实现与验收结果见第 10 节。** 设计、代码回归和实际业务验收分别结算。

## 1. 要交付的具体行为

准备不能只留下“这次页面已经符合”。当 Agent 没有必要再次执行动作时，仍能只读研究一个真实候选目标，保存如何在下次重新选择并到达它的方法，再通过现有候选链试运行验证效果。

**第一版只补“从当前候选集合选目标并导航”这项已有能力的无动作来源。** 已经真实执行的 click/navigate 继续使用现有选择函数编译；新研究工具仅支持来自真实链接的 navigate，不支持未执行的提交、保存、支付、任意 click，不增加条件跳过、完成 boolean 或运行后 judge。普通节点零模型。

通用实例包括打开最新可用文档、打开最高优先级记录、打开当前最新可播放条目。网站、实体、可用规则和排序规则只存在于任务及函数数据中。首版没有覆盖所有无动作任务的承诺，但既有任务能力不能被删掉或强制改走这项新能力。

设计阶段只修改本文与评审文档。后续实施授权限于最小方案、定向验证和本地 headless 测试；不改 AGENTS、历史数据，不提交，不操作日常浏览器，不访问京东。旧稿和首轮问题依据保留于[评审记录](TASK_METHOD_COMPLETION_REVIEW_20261007.md)。

```text
Product Alignment:
- natural-language task: 根据运行时真实候选规则选择目标并打开，允许初始页面已经符合。
- reusable chain boundary: 当前集合读取 -> 纯选择函数 -> 原生导航 -> 原有后续动作/后置条件。
- runtime inputs: 原确认需求中的运行输入和每次新读取的候选。
- dynamic task outputs: 目标由当次数据计算；执行型最终输出仍为 null。
- generic platform capability used: find_elements、已验证自然读取、选择函数、navigate、既有 sample/verification。
- replay model calls: 普通复跑 0；首次局部源码注解按同一方法最多一次。
- site/task-specific code added: no
```

## 2. 为什么能解决本次实际缺口

原 B 站任务 `5eecaaee-f0e5-4ebf-a0a0-cc9605426660` 的确认稿和 B-U taskText 都要求运行时找最新。真实 `a-0004` 点击作品标题进入 `ss28747`，不是点击 194；随后 wait、done。done 报告 194 在播、195 为预告，但 source 没有 `verified_natural_read` / `selection_function`。链只留了打开作品和等播放，丢掉了选最新的方法。

新方案对此要求的准备过程是：

1. 原生 Agent 打开作品后，读取当前候选、链接和判断可用性所需的真实字段；必要时继续原生调查。`find_elements.complete` 只证明该查询未截断，不证明业务范围已找全。
2. 若确需切换，执行原生 navigate/click，走已有编译路径。
3. 若已经播放正确条目，调用下文的只读研究工具，给出当前读取中该条目的实际链接。宿主保存“将来应导航到所选目标”的方法锚点，本次不导航；随后 Agent 必须通过原生 wait 记录任务要求的播放条件。
4. 一次既有语义注解把选择规则编成函数。期望目标来自上一步真实链接，模型只返回源码；不能固定 194，也不能把预告当可播放正片。
5. 候选链包含新的读取、选择函数、动态 URL 导航和原后续条件。现有试运行实际验证它，之后才能发布。变化后复跑仍重新选目标。

这是取得并运行处理方法；仅报告当前已播放，或仅拒绝旧链，都不算本方案交付成功。旧发布和历史 completed 保留。

## 3. 复用依据与改动预算

| 现有实现 | 直接复用内容 | 新增适配 |
| --- | --- | --- |
| `hybrid/author.py`、`author_tools.py` | B-U 原生 Tools 注册、done、同一 Agent/maxSteps、采集与收尾 | 注册一个只读工具；新协议 done 加一个不可推导的语义枚举 |
| `hybrid/capture.py` 及原有目标/DOM 证据采集 | 操作前只读采集、当前文档身份、真实查询/目标 | 研究工具只读验证目标，不能调用派发动作路径 |
| `natural_reads.py` / `natural_selection.py` | 完整读取、同文档候选与 URL 选择绑定 | 接受一种独立的“已研究但未派发”来源 |
| `selection_annotation.py` | source-only 生成、真实样本 expected、QuickJS 验证、一次注解 | 抽出公共的局部选择输入构造；普通实际动作调用保持原合同 |
| `natural_compile_result.py` / `natural_read_liveness.py` | 读取消费、readiness、repeat、动作覆盖 | 在裁剪前加入新方法消费；在工具的真实序列位置插入导航 |
| TS hybrid schema/payload/materializer/artifact、原候选验证入口 | 原文摘要、严格边界、IR 物化、候选验收 | 显式识别 `/3`，校验新来源，复用原 function/navigate；发布前核验研究方法的真实 sample 覆盖 |

```text
Reuse Assessment:
- capability: 在没有重复操作页面时记录并编译一个可复跑的目标选择/导航方法。
- existing implementation in repository: native find_elements、现有来源/目标采集、selection_annotation、URL selection、sample/verification。
- mature candidates and pinned versions: 已锁定 browser-use 0.13.8、受管 workflow-use、QuickJS 0.32.0、LangGraph 1.4.14。
- selected implementation: 保持依赖，仅增加 B-A-T 来源适配。
- reused public surface: 原生 Tools 注册、原 Agent/动作、已有读取/函数/运行能力。
- B-A-T-owned adapter and remaining gap: 未派发方法的持久化、绑定、来源版本与审计。
- license/runtime/platform fit: 不新增或替换依赖；Windows 实现及验证。
- browser/runtime/state ownership conflicts: 原 owner/lease、单控制会话、原 finally；不复制 Profile。
- replay model calls: 普通复跑 0。
- rejected candidates and evidence: native plan_update 可整表替换，current_plan_item 前进可把中间项置完成，不能用它重造覆盖门；全局 judge 不能产生缺失方法；旧 bat_validate_selection 要求 B-U 写代码，不恢复该模式。
- focused validation: 两类本地页面的真实准备/试运行/发布/变化复跑及受影响编译边界最小回归已执行；见第 10 节。
```

## 4. 新增信息：谁填写、为何需要

### 4.1 原生只读工具 `bat_inspect_action`

第一版参数固定为原生 navigate 参数的受限子集，不另设计动作 DSL：

```json
{"action":{"navigate":{"url":"当前候选里实际存在的链接"}}}
```

模型只选择动作和目标，不填写 method ID、readRef、schema、连线、测试、节点或函数。原生 `next_goal`、当前 plan 项文本仅作局部语义上下文，完整确认需求仍进入选择函数提示；不拿原生 plan 当覆盖事实源。

工具算法：

1. 取同一控制会话、当前文档中最近一次成功的完整候选读取。必须唯一确定；不能跨文档回退到旧的“看起来合适”读取。读取截断、缺 href 或作用域失配返回明确错误。
2. 给定 URL 必须是该读取的真实候选链接，按现有 URL 解析/同源和导航边界校验；不去请求该 URL，不导航、不聚焦新窗口，不接受模型提供的页面脚本。
3. 沿现有来源采集验证查询/文档/目标可用，保存 `inspected_method` 事实。`dispatch=false` 是宿主常量；它不是 `status=succeeded` 的 navigate。
4. 工具返回“方法目标已记录，尚未执行；如要求播放等后续状态，继续用原生 wait 记录相应条件”。源码注解由原 `after_step` 路径处理，不要求 B-U 自行编译或重试函数。

新事实由宿主填：研究工具的真实 actionRef/序列、readFactRef、methodRef、原生 navigate 参数、页面/文档身份、requirementDigest、registryDigest、原生意图文本快照。字段来自现有事件；缺少必要证据就失败，不补造。

同一研究事件最多生成一次选择源码。`selection_function` 在 `/3` 中增加互斥的 `methodRef` 分支，旧 `actionRef` 分支不改；函数仍为 `main({candidates}) -> url`，source 为模型唯一输出。预期 URL、样本、schema、ID、绑定及模型审计由宿主生成。

### 4.2 done 仅增加一个语义枚举

在 `/3` 准备的原生 done 中增加必填字段：

```text
methodOutcome = recorded | state_only | unsupported
```

- `recorded`：Agent 声明这一步已留下可复用方法，可能来自实际操作，也可能来自只读研究。
- `state_only`：只知道当前状态满足，没有记录以后怎样做。
- `unsupported`：已知当前能力不能支持所需方法。

这个区分不是宿主能从动作数量、工具名称或 done.reason 确定的事实，由原生 Agent 在原 done 调用中声明；不增加另一轮模型调用。success/reason 继续表达当次业务结果，不能用新枚举把“页面已满足”改说成“操作失败”。数据输出/readRefs 保持原语义。

新 guidance 明确：准备目标是保留方法；若状态已经满足，研究可复跑路径，不必重复动作；不支持就如实声明。代码只检查声明与实际来源合同，不解释网页或任务关键词。

仅在 `done.success=true`、`state_only` 第一次出现、原会话仍可继续且原步骤预算还有余量时，沿已有 done 工具错误回执能力提示同一个 Agent：可通过只读研究留下方法，不能重复外部写入。最多一次提示，计数放在同一准备请求/Tools 实例，不放在会被 Agent 构造二次调用的 `use_structured_output_action` 局部闭包中。消耗原 maxSteps，不重开 Agent、不新建浏览器、不延长预算。没有余量、再次 `state_only` 或 `unsupported` 时保存当次结果并结束，方法不足则候选不可发布。

`success=false` 直接保留原失败收尾，不触发上述提示；取消、人工接管和导航限制均保持原处理，不因方法字段重新推进 Agent。`recorded` 但函数编译失败等普通编译缺口只保留 gap，不触发这条提示或模型重试。

### 4.3 宿主方法回执，不循环依赖编译结果

有真实 terminal done 且申请 final candidate 的新来源，关闭前必须保存 `preparation_method_receipt` 事实，绑定该 done、其 methodOutcome、当前 requirementDigest、真实已执行动作引用和 inspectedMethodRefs。它只保存原生声明及事实引用，不写“所有语义已验证”或由最终编译结果反推的 ready，避免 source digest 与编译状态循环依赖。

取消、崩溃、人工等待中断等没有 terminal done 的来源，照常由原 finally 关闭并归档为不完整；不得为了补回执伪造 done、阻止 close 或覆盖原错误。final candidate 准入仍拒绝缺回执，不完整来源的取证/清理不依赖该回执。

final 编译缺回执、未知枚举、引用丢失、研究方法缺读/源码/目标/顺序时拒绝；prefix 阶段允许尚无 terminal 回执。`recorded` 必须有至少一种真实方法来源且所有声明的方法都能编译；固定目标用原实际动作和目标证据即可，不强迫每个任务加选择函数。不得凭“没有 inspect 调用”降级 `/2`。

**语义边界明确：** 枚举是原生 Agent 的方法声明，不是全局正确性证明。模型仍可能错误地认为自己的动作已经覆盖要求；这个门只能检查已声明方法的来源完整性，不能声称确定性发现任意自然语言中的遗漏。对应要求的代表执行及变化验收必须独立检查。增加一个全局 LLM judge 也不提供这种保证，因此不引入。

## 5. 已满足场景的生产者—消费者闭环

| 时点 | 生产者及事实 | 消费者及动作 | 次数/失败出口 |
| --- | --- | --- | --- |
| 当前目标已正确 | 原生 Agent 观察、完整 find_elements | Agent 选择真实目标 URL | 原 maxSteps；缺范围继续原生调查 |
| 留方法 | `bat_inspect_action`，只读验证并记录锚点 | after_step 使用真实 read/target 注解源码 | 每方法一次；失败留 gap，不重放 |
| 收尾 | 原生 done 的 methodOutcome；宿主方法回执 | 编译器校验新来源合同 | 缺声明不通过 schema；state_only 最多提示一次 |
| 编译 | 当前读 → 选择函数 → navigate，位于研究工具的位置；URL 条件明确待验证 | 既有 IR / runtime | 缺绑定、身份或控制流时不产生可发布候选 |
| 验证 | 现有候选链 sample 真实经过研究导航，满足 URL 及其后合法条件 | 保存实际节点/输出/后置条件、零隐式模型审计；没有实际经过不算覆盖 | 同一准备内不新增本方案专属自动重试；失败走原失败/人工修复入口 |
| 发布、复跑 | 已验证的不可变新版本 | 再读候选，重新求目标并导航 | 新目标出现也使用同一方法，不固定样本 URL |

目标解析成功仅证明方法指向真实目标；此前未导航就不能声称导航效果已验证。第一版不生成 apply/skip 分支，正式试运行按任务授权打开所选目标一次；如果任务不允许这次导航、需要保持播放位置、或存在未确认的副作用，应沿现有业务歧义/限制出口处理，不能靠“导航天然安全”豁免。

本方案不把未执行写操作编成可发布方法；旧的真实执行型写操作及其链路保持原逻辑。未来研究未执行 click/保存需要另有目标效果和授权设计，不纳入此次修改。

## 6. 编译顺序和重复动作处理

### 6.1 未派发来源有独立适配，不能伪造旧动作的 post

原 `classify_natural_action` 要求 succeeded/pre/post，原 navigate 还校验 `navigate_url_binding_not_observed` 等观察证据。因此新增 `/3` 的 inspected-navigation 小适配，不把研究记录伪装成已发生 navigate 后喂给旧分类器，也不放松旧分类器。

适配器以真实候选 href、已验证选择函数、原 navigate 能力版本产生普通导航节点及**待试运行验证**的原生 URL 后置条件：`kind=url`、`bindingArgument=url`、`settle=原 NATURAL_SETTLE`。该条件来自能力合同与方法目标，不能生成一条观察所得 `matched=true` 事实。它只允许生成 candidate。

原候选验证入口必须核验：该 candidate 的每个研究导航节点在真实 sample 中被实际执行，并满足动态绑定 URL 及其合法后继条件，才可发布。只跑了别的分支、节点被跳过或仅 source 声明成功，都不算验证覆盖；失败不修改预期、不自动再次导航、不篡改来源。沿现有原生导航 URL 比较及错误合同处理重定向，不新增网站豁免。

### 6.2 固定编译顺序及首版尾部限制

1. **采集并持久化。** 保留真实工具事件、读/文档身份及 method 事实；离线编译只读保存来源，不能补取当前页面。
2. **建立依赖。** 在 `prune_unused_queries` 前建立方法函数对原读取的真实输入绑定和导航 URL 绑定；不用保留所有读取来逃避 liveness。
3. **复用原 liveness、readiness、repeat。** read 必须先于消费，不能跨文档或跨循环轮次错绑。首版研究方法不能跨越不同 repeat 项；无法保持现有作用域就报 gap。
4. **在真实研究事件位置展开函数/导航。** 研究工具本身是只读来源动作，其 action coverage 与拟执行 navigate 的 method provenance 分开。实际 navigate 的执行证据只能由 sample 产生。
5. **严格限制无真实导航的后继。** 研究时没有换页，编译后会换页；首版只允许该研究事件之后是 done、纯内部工具及不依赖旧 DOM 目标且运行时重新观察的原生 wait/后置条件。后面若有 click/input、旧页面读取、另一个研究方法或其他不能证明可重定位的动作，报明确 `inspected_navigation_continuation_unsupported` gap；不能搬运旧文档事实。如果随后有对应真实导航，先按下述规则归并为原实际动作路径。
6. **最终核验。** 目标消费来源、文档/序列、出口与现有后置条件满足 IR 约束后才能生成 candidate；sample 再验证效果。source close、cleanup 与业务结果继续分开。

“打开目标”的 inspect→done 至少经过上述 URL 条件。要求播放时，inspect **之后**必须真实出现可编译成页面级 `media_playback=playing` 的原生 wait（沿 `natural_compile.py` 现有等待合同）；运行图为 navigate→wait，wait 在新导航后重新观察媒体。inspect 之前的 wait 不能挪到后面，也不能把原 playing 值当成试运行结果。若没有合适的原生等待条件，保留方法缺口，不能生成全局完成函数补齐。

如果研究后 Agent 又真实执行了同一导航：只有同一 requirement、同一 readFactRef、同一规范化目标和连续合法作用域能确定是一项方法时，复用已生成函数，优先保留真实动作节点，不再插入第二个导航。沿现有 PreparedSelections 的已验证记录/动作绑定机制适配，不创建新的通用去重系统。无法证明等价就留下明确顺序/归属 gap，不猜测合并。

## 7. `/3` 分派、来源与兼容

选择 **`bat-hybrid/3`** 承载上述研究来源及方法回执；不另建独立方法版本开关。现有 `workflow-use-source/v3` 是外层 artifact 格式名称，与本次 compilerVersion 不是同一个版本，保持其现有意义。

| 环节 | 明确决定 |
| --- | --- |
| 新准备 job | 宿主在启动前持久化 `sourceProtocol: bat-hybrid/3`，传入 author 请求；不能根据返回事实选择版本 |
| Python author/registry | 按请求 `/3` 构造含新工具/新 done 枚举的注册表；registry digest 与实际模型工具一致 |
| Python request/fact schema | `/2` 原合同；`/3` 复用公共结构但严格识别新增事实及 selection methodRef 分支；未知版本拒绝 |
| 编译入口 | 显式 `/2`、`/3` 分派；共用旧编译步骤，仅 `/3` 接入方法消费/回执；不复制整套 compiler |
| TS schema/payload | 修改所有显式 `/2` 分派入口，不将“不是 /2”自动视为旧另一协议；raw fact 白名单和原文摘要检查包含 `/3` 新事实 |
| sourcePayloads | 保持自然来源的五个 payload 槽位及六项 sourceDigests 含义；新事实放在 trace，进入原 trace canonical digest，不增加无关的结果字段 |
| materializer/artifact/审计 | `/3` 合法来源物化为现有 function/navigate；新 method 生成也计入 semantic_annotation 审计；不添加公共 IR 节点种类 |
| 接收/恢复 | job 期望 `/3` 但收到 `/2` 一律不接受为该次新来源；保留诊断来源，不 fallback。旧 job 按保存的原请求/注册表恢复；不得通过给所有缺字段 job 默认 `/3` 改写历史 |

原始 `/2` 来源离线重编译使用旧注册表和原协议，不触发新工具或新 done 要求，不调用模型/浏览器。历史 source/release/digest 不变；新 candidate 用自身内容和编译身份算摘要，不冒用旧产物 digest。未知版本、缺字段、混用 registry/sourceProtocol 均明确拒绝。

除了上表中的 sourceProtocol 与适配字段，不修改 TaskRun 完成语义、账号、浏览器选择、Profile、服务生命周期、访谈 authoring、搜索、依赖库或公共调度。`outputSchema=null` 不自动成为新增 read tool 的理由。

## 8. 验证与交付判据

### 8.1 最小代码回归（实施时选择具体已有用例）

- 原固定目标、动态选择、data/readRefs、execution null、once/each/空集合、人工接管和 source close 保持。
- 新工具真实零派发：导航计数不变，不调用目标 URL；伪 URL、旧文档、截断读、未知动作拒绝。
- 未派发研究不伪造成功动作；节点在正确位置；研究后同一真实导航不重复编译、注解和执行。
- 未实测 navigate 的 URL 条件只能是待验证合同，不能是伪造的 matched 事实；sample 未经过该方法不得发布。
- inspect 后旧 DOM 读取/click/input/第二方法必须拒绝；inspect 后页面级媒体 wait 要在复跑导航后重新检查；inspect 前的 playing 不能充当后态。
- 新 receipt 缺失/非法或方法缺源码不得发布；recorded 的固定目标仍可用；state_only 原生反馈最多一次且不重开 Agent。
- Agent 二次注册 done 不重置提示次数；success=false、取消、人工等待、预算耗尽保持原出口。
- liveness 保住所需读并仍删除无关读；同 URL 文档替换、前后状态相反、repeat 跨项均不能错绑。
- `/2` 离线来源和旧 release 不改变；`/3` 缺回执不降级；未知版本拒绝；原始摘要与候选摘要分别验证。
- 无新增隐式模型，函数生成失败不启动代码 repair loop，不重复外部写入。

### 8.2 两类正常产品流程

使用本地受控页面和独立 headless 开发浏览器，经过正常需求准备、候选试运行、发布、复跑。冻结后只改夹具初态/数据，不手工改图，不替 Agent 选目标。

| 场景 | 独立预期与依据 |
| --- | --- |
| 打开最新可用文档，初始已经在正确页面 | 来源包含完整候选、可复跑选择和动态目标；实际试运行能打开该目标 |
| 增加更新可用项，同时保留更新但不可用项，重排显示 | 选择满足规则的新项，不能硬编码原 URL 或取列表首项 |
| 打开最高优先级未关闭记录，初始打开低优先项或已正确 | 两种初态都可准备并运行；优先级/关闭状态变后同一链仍正确 |
| 两类任务读缺字段、候选截断、页面身份变化 | 明确错误，不把部分集合当全部、不沿旧 URL 继续 |
| 新源码在当前样本正确、在明确负例错误 | 记录失败，不以一次正样本匹配宣称规则已验收 |

输入、业务规则、期望由开发者按照确认任务独立编写，不由生成函数的模型自造答案。重排仅用于规则与展示顺序无关的这两类任务；不宣称适用于“选第一项”等不同任务。

之后冻结代码，原 B 站要求用用户选择的日常浏览器创建新候选并验收，检查候选范围、最新可播放规则、动态目标和实际播放，不边跑边改，不访问京东。能播放一次、只能拒绝发布、或需要手工加节点，均不算通过。

### 8.3 三类结论分别记录

编译准入证明来源/绑定/控制流合法；开发变化回归证明已覆盖方法；具体任务验收证明该版本在记录场景符合需求。任意一项不能替代另外两项，模型对方法覆盖的声明也不能替代它们。本方案不承诺数学上证明任意自然语言任务正确。

## 9. 对抗复核与实施门

同一 reviewer 要逐项复核：只读研究是否真实不派发；是否从研究误推效果；methodOutcome 是否有明确职责且只增加一个必要字段；同一 Agent 的一次反馈是否绕过原预算；新旧来源、摘要、注册表是否闭合；编译顺序、去重和普通功能是否受破坏。

R1 的验收口径是明确区分方法声明、证据合同和独立业务验收，不能宣称纯代码从任意 prose 证明无遗漏；R2/R3 由真实研究事件提供锚点，现有 sample 验证效果；R5 由上表完整版本分派承担。任何尚存具体漏洞继续修订，不能再把一份无替代设计的阻塞清单当作本任务交付。

最终复核通过本方案的限定设计，逐项关闭依据见评审文档末尾。实施后的真实验证独立记入下节，不能以文档通过替代。

## 10. 实施与证据（2026-10-07）

实现保持现有 IR、LangGraph、QuickJS、浏览器 owner/lease 和原生 Agent loop。新增只读研究工具、未派发导航来源适配、宿主方法回执；新准备显式使用 `/3`，`/2` 历史来源保留原注册表和严格解析。模型新增一个 `methodOutcome` 枚举；选择注解仍只返回源码，同一来源动作只尝试一次。研究后仅允许尾部 wait/done；相邻等价真实导航可复用同一函数，旧页 wait 不能给后续导航证明播放。

实施复核修正了：不可用候选 href 应允许缺失；`/3` 禁止离线第二次模型注解；研究后等待再导航不能合并；缺失研究段必须严格验证等价真实导航和函数来源，不能静默跳过。

定向 Python 编译/采集与 TS 物化/QuickJS 回归、API 类型检查已通过。测试覆盖两版本注册表、一次反馈、旧来源兼容、缺回执/身份变化/路径绕过拒绝、动态 URL 绑定、独立播放等待与执行型/数据型交接。没有运行全量测试。

真实验收使用 `apps/api/tests/method-completion-native.acceptance.ts`：独立数据库、本地 HTTP 页面、独立 headless 浏览器，通过现有 prepare_task → 自动代表试做 → trial_task_draft → publish_task_draft → run_task。确认需求直接注入夹具，**不包含需求对话 UI 验收**。模型使用当前产品配置，不改模型设置；普通复跑必须零模型。

首败分别保留，不用重试覆盖：

- `work/method-completion-proof/native-JX4a1j`：来源编译已成功，草案交接旧 done 严格 schema 拒绝 methodOutcome。已按版本分派并加入执行型、数据型回归。
- `work/method-completion-proof/native-Bqms27`：新工具缺少动作采集分类，ActionDispatchAudit 在派发前拒绝。已补 read 分类和两版本全注册动作采集回归。
- `work/method-completion-proof/native-RcVSxN`：模型已通过真实 click 留存选择函数，又用旧读取研究目标，被正确拒绝后误声明 unsupported。澄清原生动作与研究动作均可留存方法，并返回重新读取的具体指引；没有放松证据门或自动改写模型声明。
- 上述两次运行资源已关闭，临时 browser-profile 已永久删除，各目录 cleanup.json 留存证据；第二次 Chrome 隐藏 BITS 临时文件曾导致普通删除失败，核对精确路径后仅清除该文件 Hidden 属性再删除，无工具策略拒绝。

**最后一次冻结验收通过：** `work/method-completion-proof/native-5Cb3UH/proof.json`。两类任务都通过真实配置模型的原生探索，路径为 navigate → find_elements → bat_inspect_action → wait → done；编译 gaps 均为空，链中存在读取 → 选择函数 → 动态导航。初始已打开目标 7，不重做实际点击。

| 场景 | 最新已发布资料 | 最高优先级未关闭记录 |
| --- | --- | --- |
| 准备后的代表试做/验证 | 选 7，排除不可用 99 | 选 7，排除已关闭 99 |
| 新增合格 11 并打乱顺序，再试运行 | 选 11 | 选 11 |
| 发布后改回原候选正式复跑 | 选 7 | 选 7 |
| 仅剩不合格 99 | 明确失败，未打开 99 | 明确失败，未打开 99 |

每类 5 次执行（sample、verification、草案试运行、两次正式运行），4 completed + 1 预期 failed；全部 TaskRun.modelCalls 为 0，execution.cleanup 为 confirmed。原生探索与语义注解的模型调用独立计入准备阶段，不宣称整个准备零模型。

`work/method-completion-proof/freeze-validation.json` 记录 940 个源码/测试/配置文件与最后冻结清单一致。`freeze-first/second/third.json` 保留前次失败时的代码边界，不把修复前结果混成同一次冻结通过。四次原生测试的 browser-profile 均已永久删除，精确 PID 检查无存活归属进程，各自 cleanup.json 有证据。保留源记录、数据库及验收报告供复查。

同一对抗 reviewer 完成实施复核，无已知阻断；不是未测功能不回归的保证。Bilibili 原任务、真实账号、需求对话 UI 本轮未验收；原有服务未重载，旧发布链不会自动增加方法节点，仍需通过产品重新准备形成新版本。没有 AGENTS 改动、worktree、Git 提交或推送。
