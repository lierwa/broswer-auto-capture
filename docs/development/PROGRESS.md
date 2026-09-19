# 开发进度

当前开发入口为 [浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。架构边界以
[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md) 为准。

## 当前状态

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
| [D 显式 b-u 节点](replay-repair/D_EXPLICIT_BU_NODE.md) | 下一阶段，未开始 | 需要复用当前 Browser 会话、原生 Agent 与现有模型桥 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 未开始 | 依赖 A–D |

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

## 下一步

**C · 交互执行与异步顺序已通过**。下一阶段是 D；D 和组合验收尚未开始。`RESULT_SPEC_BINDING_IMPLEMENTATION.md`
中的 P1–P6 是已经关闭的 B 内部开发包，C 直接复用其 ResultBinding 与 ConsumerReadiness。

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
[C 独立验收记录](evidence/browser-replay-repair/C_ACCEPTANCE_CONFORMANCE.md)。D 本轮未进入。
