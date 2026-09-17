# DOM 前置工具开发与主线回归计划

> **2026-09-17：历史计划，已由 [问题与清理账本](REPLAY_CLEANUP_20260917.md) 替代。** 下文旧规则 JSON 前置门、旧派发和补丁保留要求不再有效；旧 patch 目录已删除，不得据本文继续执行旧计划。

日期：2026-09-16。当前状态：**D0–D4 首批工具及相关旧实现收敛已验证；M1 正式入口在规则来源门受阻，主线未通过。** 最新证据与限制见 [实施账本](evidence/browser-use-dom-tools/CLEANUP.md)。下方“当前会话仅交付文档”类表述保留为原交接时点记录。

## 1. 唯一目标与顺序

先完成数据足够的 b-u 动作配套工具与对应旧代码整理，再回到 LangGraph Issues 主线验证能否跑通。24 种动作是覆盖账本，不是首批开发清单。不得因暂缓动作缺数据阻塞已具备数据的工具，也不得把局部工具通过当作主线通过。

用户已授权后续会话实施本计划及必要的相关补丁清理，无需重新询问“是否开始”。当前会话不启动实现或主线运行。默认在实际 checkout 的现有分支开发；没有新建分支/worktree、提交、推送、全量测试或删除历史数据的授权。

第一阶段假设对应展示状态下 DOM 结构一致；允许异步加载、节点重新创建、标题/内容和临时编号变化。改版自愈、模糊定位、所有浏览器动作覆盖、UI 和平台重构不属于本阶段。

技术细节与来源见 [DOM 设计](BROWSER_USE_DOM_HANDOFF_DESIGN.md)，架构边界见 [TaskChain 架构](TASK_CHAIN_ARCHITECTURE.md)。本计划覆盖设计中旧的“等 24 类工具齐全再实施”顺序；H0–H7 历史状态不会因此升级。

Product Alignment:
- natural-language task: 按筛选/排序到指定页，操作第 N 个条目；同样支持表单/弹层中结构确定的控件
- reusable chain boundary: 一个已确认步骤的动作、结构定位、前置状态与结果交付
- runtime inputs: 页面入口、已确认筛选/页码/序号、填写值及上游输出
- dynamic task outputs: 本次选中元素对应的页面字段和动作结果
- generic platform capability used: b-u Agent/DOM/Tools、w-u fork、现有 TaskChain/LangGraph 和 artifact 存储
- replay model calls: 普通定位、读取、操作与核验为 0；语义任务只能使用显式 LLM 节点
- site/task-specific code added: no

## 2. 开工基线与事实边界

- 文档交接时分支 master，HEAD 为 7242264bd3757a7ebe82514f9a17cb63e7bf614c；大量 tracked/untracked 修改是现有现场，不能 reset/clean 或整目录覆盖。
- 使用当前固定 b-u 0.13.8、workflow-use 0.2.11，w-u 来源 commit 5d2d19fe8835cc86f1bf3e04302a5000d590f249。不重新混配依赖，不重导入干净 fork 覆盖改动。
- H0/H1 已有通过记录，H2 两个 executor 局部修复已有 focused 证据；H3–H6 部分实现，H7 尚未开始。详情按需查 [PROGRESS](PROGRESS.md)，不要从最早历史结论重新开工。
- 原生旧 history 有交互元素 XPath，但没有序列化 parent/children；状态文本是有损展示。新 capture/history 又裁掉了有用结构。运行时 EnhancedDOMTreeNode 有真实父子关系。
- 真实 history 为 28 步、38 个拟议动作；4 步动作/结果数量不一致。不能把全部拟议动作当作实际执行，不能直接 zip。
- 原任务列表查询有一次零匹配；详情点击连续两次才在后续状态看到详情。不得把失败查询写成成功接口，不能凭该记录推导永久双击/重试。
- 旧表单/提取验证是局部证据；不证明本次结构交付或真实 Issues 已通过。当前普通需求 Markdown 到结构化控制规则尚未完整接通。

## 3. 首批动作准入

按“动作实例的证据是否够用”判定，不按注册名全部放行。每条记录只分可执行候选、来源不足、明确失败/未执行等可核查状态。

| 动作 | 首批范围 | 必需条件 |
| --- | --- | --- |
| navigate | 同标签页导航 | 参数来源、当前页面、结果及目标页面条件；new_tab 暂缓 |
| click | 结构明确的元素点击 | 当前作用域、历史目标路径或结构关系、实际执行归属、声明后态；坐标型暂缓 |
| go_back | 原路径返回 | 前后页面与需要恢复的列表/表单状态；返回后重新查询 |
| find_elements | 原生有界集合查询 | 查询范围、参数、结果顺序、total/showing/截断；零结果可保留，不能当作找到列表 |
| wait | 等待与前置过程关联 | 保留原时长；有观察依据才构建就绪条件，等待结束不自动等于业务成功 |
| done | 完成和输出记录 | 输出引用和业务完成条件；不绕过前置动作证明 |

input/dropdown_options/select_dropdown 共用元素解析，但当前已核查 history 没有真实动作样本；首批工具通过后用最小表单样本接入验证，不能先标已支持。其余 search/search_page、焦点相关 send_keys、scroll/find_text、switch/close、extract、文件/截图/PDF/evaluate 先登记缺口或独立能力状态，不以一次性支持全部为前置门。

暂缓不等于静默删除：原任务中若出现这些动作，逐项证明是业务必需、探索辅助还是实际未执行。必要动作的数据不足时，补该项；没有完整覆盖不得宣布主线通过。read_fields 是现有读取能力，不等于任意 extract 已可确定转换。

## 4. 四个工具的实现合同

以下为数据职责，不要求新造平行 schema/执行框架；优先扩展现有类型并保留旧 artifact 可读性。

### T1 动作与结构证据交付

输入：原生 action/history、动作前 selector_map、动作后结果/页面状态。
输出：动作 ID、执行归属、页面/文档/frame 作用域、目标结构引用、前置动作引用、结果与后态引用、覆盖及缺失项。

- 新探索从模型实际使用的同一 selector_map 还原目标，再复制必要祖先、子节点、集合关系与中间包装层。不能刷新后用旧 index 查新映射。
- 旧 history 按 action 位置取 interacted_element，保留 XPath；文本缩进仅作候选辅助，不伪造真实父子关系。
- 使用原生前置回调和结束回调、现有单动作配置；失败/中断/关闭后仍如实保存已取得来源。
- 结构证据应可按引用读取，hash 仅用于完整性。允许的结构属性按白名单保存；敏感值脱敏或用输入引用替代，不能保存整页原文、Cookie/Profile/凭据到 Git/日志/快照。
- 若脱敏导致定位或效果无法核验，明确报告该条来源不足，不能用 hash 冒充可读取证据。

### T2 当前元素结构定位

输入：逻辑页面作用域、结构路径/节点类型等约束、前置状态。
输出：当前页面唯一元素及当前动作引用。

- 复用原生 DOM 的 XPath、当前 selector_map 和公开 Page/Element 查询；适配层做作用域与唯一性核验，不写 XPath/CSS 解析器。
- 同结构节点重建后重新解析；历史交互 index/backend ID 不作为跨运行定位规则。
- 原生 replay 的整个 hash/name/fallback 级联不直接启用；不允许匹配失败后退回历史 index 或按相似标题猜测。
- 精确路径可以先解决旧记录的固定结构点击，但不能自动把 XPath 的某个 [1] 解释成业务第一个条目。
- frame/shadow 只接纳已证实的查询边界；其余明确暂缓，不跨文档混用节点 ID。

### T3 集合与条目内部定位

输入：容器查询、item 集合查询、来自需求/输入的选择规则、item 内目标相对路径。
输出：本次集合、选中 item、实际操作子节点及来源。

- item 根与 title/link 分别建模；操作 item 根时相对路径为空。
- 包装层保留，不能把 list.children 一概当 item；序号作用在已证明的 item 集合。
- 查询在当前指定容器内执行，保持原生文档顺序。复用公开查询或原生节点关系，不拼网站专用脚本，不写泛用 DOM 查询引擎。
- 构建候选后必须与探索当次真实点击节点对应，并验证范围与唯一性。零结果、集合范围不明、截断影响目标序号时不能晋升。
- 选择第 N 个和按字段条件选择是不同需求；本阶段先实现有明确序号依据的路径，不从历史标题推导选择条件。

### T4 前置状态与后态核验

输入：动作依赖、已有观察支持的就绪条件、动作参数及结果。
输出：就绪/有界等待/失败与本次证据。

- 页面导航、翻页、展开弹层完成后再定位控件；仅 URL 或页码改变不能必然证明列表已刷新。
- 复用 StepVerifier 的声明检查、既有有界等待与 LangGraph 依赖；不新建调度器或重试循环。
- 有界等待只重新观察，不能重发 click/input 等动作。点击返回成功与进入详情是两件事。
- 当前缺少就绪事实时保留缺口，不能编造固定延迟、标题必须改变或永久双击规则。

## 5. 复用与代码整理

Reuse Assessment:
- capability: 动作结构证据交付、当前节点绑定、集合相对定位和状态核验
- existing implementation in repository: hybrid capture/history/registry/capability/read/postconditions、StepVerifier、artifact 与 materializer
- mature candidates and pinned versions: browser-use 0.13.8 / workflow-use 0.2.11，来源 commit 见第 2 节
- selected implementation: 原生 Agent hooks、DOM/selector_map、Page/Element/Tools，受管 w-u fork 内适配
- reused public surface: registry schema、AgentHistory、parent_node/children_nodes、Page.get_elements_by_css_selector、Element.get_basic_info、Tools.act；具体作用域 API 在写适配前定点核验
- B-A-T-owned adapter and remaining gap: 证据版本化、结构/意图绑定、coverage 与结果审计；补齐当前裁剪信息
- license/runtime/platform fit: 延续现有许可证与锁文件；macOS 现有环境，Windows 尚未验证
- browser/runtime/state ownership conflicts: 单 Browser，原生 Agent 探索，LangGraph 推进，既有存储持久化
- replay model calls: 普通工具为 0，不使用 prompt 定位或 Agent.rerun_history 整体兜底
- rejected candidates and evidence: 旧 converter 字段不兼容；展示树有损；完整模糊匹配级联不满足 ordinal 语义；见 DOM 设计第 8 节
- focused validation: 第 6 节按阶段最小验证，不运行根级/全量测试

| 现有位置 | 处置要求 |
| --- | --- |
| vendor/workflow-use/workflows/workflow_use/hybrid/capture.py、history.py、author.py | 改写结构交付，替代摘要不足及必须预先给 selector 才能采集的限制；保留来源与关闭审计 |
| 同目录 capability.py、read.py、postconditions.py 与 selection_target 相关代码 | 收敛到统一作用域/元素/集合解析；删除被替代的重复定位分支，保留唯一性、越界、动态值、动作一次执行等不变量 |
| w-u ElementFinder / StepVerifier / executor | 保留原生能力及已证明有效的局部修复；仅替换实际不兼容调用或宽松核验，不重写整体 |
| apps/api/src/upstream-browser/hybrid-*、apps/api/python/browser_use_runner/ | 仅接结构来源及必要版本边界；复用现有进程/协议/取消/存储；不重复建传输层 |
| packages/contracts、packages/runtime | 必要的通用契约适配；不引入网站节点类型或第二个状态机 |
| patches/workflow-use/0001–0012、旧 runner/archive | 确认不再被活动 setup/import/调用链引用；按既有处置规范保留诊断/只读来源，主线通过前不批量物理删除 |
| 旧测试 | 保留真实不变量；重写依赖样本标题/临时编号/假成功的断言，删除确已被替代且无独立价值的重复测试 |

清理必须落在本次工具责任范围：实施前逐项记录“旧行为/调用点、保留/重写/删除、替代位置、保护的不变量、验证结果”。在同一功能替换中完成整理，不能先加新分支再留下所有旧分支兜底。没有证据不能因用户怀疑代码质量就宣称所有既有修复错误。

清理账本写入 docs/development/evidence/browser-use-dom-tools/CLEANUP.md（实施时创建）。数据、原始历史、用户 Profile、未知归属 dirty、无关功能不在删除范围；不得全库恢复到 HEAD。

## 6. 执行阶段与完成标准

| 阶段 | 工作与产物 | 通过条件 |
| --- | --- | --- |
| D0 | 定点 baseline、现有调用核查、相关清理账本 | 明确每个改动的旧职责/替代点，保护现有修改；不重复全面选型 |
| D1 | T1 新采集及旧 history 导入 | 动作与结果正确对应，结构可读取；单步截断/缺结果/敏感数据等边界明确 |
| D2 | T2/T3 与首批动作薄适配 | 真实浏览器本地合成结构样本：动态 ID/标题、包装层、item 与 title、序号变化、重复区域、越界；准确命中且普通执行零模型 |
| D3 | T4 接线并收尾相关补丁清理 | 异步翻页/弹层/DOM 重建正确等待；错误作用域、歧义目标在动作前失败；后态失败不重复动作 |
| D4 | 首批候选编译→持久化→加载→同链复跑 | 正式路径消费结构引用和参数，输出使用本次值；最小表单补验可随后复用同一解析层 |
| M1 | 回到已确认 Issues 原任务 | 先补必要来源/规则/字段接线，再执行完整样本和至少一种输入变化；记录剩余缺口或真实通过 |

D1–D4 是前置工具门，不替代主线验收。局部测试页面只用于可控反例，不写入平台网站逻辑。新增测试放在所属 package 的 tests/，围绕上述不变量；先选受影响现有测试，需要时再加。测试命令以 checkout 内的实际配置为准，使用现有环境，不全量测试或重装依赖。

D4 后继续 M1，不以“工具通过”结束整个授权任务。若主线含暂缓动作，先判断其业务必要性，必要的定点补采/适配继续做；不得丢掉动作让验收变简单。原任务禁止拼接分页/筛选 URL，必须沿控件操作。

M1 的链路：进入 Issues → 原筛选/排序 → 控件翻页 → 列表就绪 → item[ordinal-1] → 条目内目标 → 详情字段读取 → 结果装配/按要求返回。需求里的页码/序号已明确，无需要求用户重新解释或提供 selector。

已有普通 Markdown 到结构化规则的缺口在此接通；不能用手写测试合同冒充自然语言正式入口。优先在现有需求/计划边界落规则，不扩展模型权限或引入第二次整图生成。不能解决的具体边界如实报告。

最终报告分别列出：工具已实现及证据、旧代码处置、主线样本、同链不同输入、普通节点模型次数、未测项。H7 仍按原计划包含非采集任务等门，未全部验收不声明项目全部通过。

## 7. 遇到失败怎样处理

先区分来源缺失、定位绑定错误、后态时序、业务规则/输出接线、上游 API 不兼容。一次旧 history 缺数据不推导方向不可行。

修复应回到负责模块，同时重写或移除被证据推翻的旧分支，不继续堆补丁。若固定结构/完整数据下仍无法唯一操作，或必须靠样本标题、隐式模型、网站分支、新驱动才能通过，则记录具体反例，暂停相关部分并回到设计；已有能独立完成的部分继续收尾。

主线验收前锁定候选；验收中发现代码缺陷则退出验收回到对应阶段，不边改 selector/提示词/预算边宣称同一候选通过。保留来源不足与架构失败的区别。
