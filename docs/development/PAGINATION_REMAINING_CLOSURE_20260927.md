# 分页重复方法的组件复用与剩余边界（2026-09-27）

## 本次结论

本次只核对既有源码、所属测试和已记录实机证据，没有启动浏览器、模型或测试。当前可证明的自然重复入口是：**完整查询下一页 href、同 tab 导航、用同一方法读新页、按稳定键累积，直到完整继续查询为空**。

在该范围内没有发现需要改动的调度重复实现或错误接线，因此保留现有组件和适配；不为了“复用”换库、重写状态机或重跑已经通过的样本。按钮在同一 URL 更新内容、滚动加载和多套重复方法是明确的**自然证据/编译适配缺口**，不能继续统称“只是未测”，也不能从普通 scroll 动作曾通过推断滚动分页已支持。

## Product Alignment

- natural-language task: 把公开列表所有分页中的已确认字段读出，保持来源顺序并按稳定来源键去重。
- reusable chain boundary: 一条参数化链包含一份读取方法、继续条件和翻页方法，每页复用同一组节点。
- runtime inputs: 当前入口、每轮实际 DOM 读取、当前继续查询、执行预算及持久化检查点。
- dynamic task outputs: 本次实际遍历得到的记录数组，或带已累计检查点的明确失败/限制。
- generic platform capability used: Browser-Use action、已有 ReadSpec 适配、B-A-T 证据编译、LangGraph StateGraph、现有 loop/branch/accumulator。
- replay model calls: 普通分页复跑为 0；首次准备的方法注解独立审计。
- site/task-specific code added: no

## Reuse Assessment

- capability: 将同版代表执行证据映射为已有循环 IR，并由现有执行器驱动动态分页。
- existing implementation in repository: `repeat_annotation.py`、`natural_repeat_evidence.py`、`natural_repeat.py`、`hybrid-natural-repeat.ts`、`packages/runtime/src/task-chain/{engine,loop,data}.ts`。
- mature candidates and pinned versions: 沿用已采用的 Browser-Use 0.13.8、workflow-use 受管 fork（上游 commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`）、`@langchain/langgraph` 1.4.14；没有引入或替换库。
- selected implementation: 保留 Browser-Use 的浏览器动作和 LangGraph 的异步推进；B-A-T 只拥有来源校验、IR 映射、预算、稳定键和运行审计。
- reused public surface: Browser-Use 原生 action；现有普通读取适配；LangGraph `Annotation.Root`、`StateGraph.addNode`、`addConditionalEdges`、`compile`、`invoke`；既有 loop 与 `data.transform` 合同。
- B-A-T-owned adapter and remaining gap: repeat 模块是本项目在受管 fork 中新增的适配，不能称为 workflow-use 上游现成功能。它们校验真实动作/读取引用并折叠代表样本。按钮和滚动仍缺可验证的继续/停止与动作后新批次归属适配。
- license/runtime/platform fit: 本次沿用已有选型和许可证记录，不新增依赖。当前源码仍使用既有 Node/TypeScript 与 Windows Python Runner；历史 href 分页有 Windows 实机结果；本次未复验跨平台。
- browser/runtime/state ownership conflicts: 自然方法来源和复跑各自保留明确 owner；本次未创建 owner。产品 TaskRun/TaskCheckpoint 继续由宿主持久化，不建立第二套框架状态数据库。
- replay model calls: 现有普通分页图只包含确定性读取、导航、条件与累积，没有隐式 LLM。
- rejected candidates and evidence: 没有发现需要另选组件的调度缺口；自写分页调度器会重复 `engine.ts` 已调用的 StateGraph。没有证据支持把按钮/滚动缺口归因于 LangGraph，替换调度库不能补出缺失来源证据。
- focused validation: 本次为只读核验及文档定点检查；沿用下方已有所属测试和实机记录，不把旧通过写成本次新通过。

## 真实路径与各自职责

| 阶段 | 现有代码与事实 | 拥有的职责 |
| --- | --- | --- |
| 代表执行 | `repeat_annotation.py` 的 `_repeated_reads`、`_annotation_input`、`annotate_repeat_method` | 从已验证的 `bat_read_fields` 与 `find_elements` 提供最小模型视图；模型只提议动作引用和稳定键，不提供运行图或选择器。 |
| 来源准入 | `natural_repeat_evidence.py::validate_repeat_method` | 核验同构 ReadSpec、同一需求/页/tab、完整继续查询、稳定键、真实推进、代表动作顺序和全部动作归属。 |
| 来源保存 | `hybrid-artifact.ts::createHybridSourceArtifact` | `workflow-use-source/v3` 保存接收来源、需求/计划/输入/fork 摘要与模型审计；保存和后续来源准入分开，失败来源不抹除。 |
| Python 编译 | `natural_repeat.py::{repeat_context,fold_repeat,wire_repeat_graph}` | 首轮读取/查询/推进成为执行节点；后续代表动作变为可审计 supporting evidence。生成 loop/first 路由数据，不在 Python 中执行分页循环。 |
| TypeScript 准入 | `hybrid-natural-repeat.ts::validateNaturalRepeats` | 独立核对来源摘要、动作身份、样本、输出装配和控制图；拒绝篡改图和绕过 body 的路径。 |
| IR 物化 | `materializeNaturalRepeats`、`bindContinuationVariable`、`applyRepeatScopes` | 生成现有 loop/branch/accumulator；当前页 Next 查询先按 href 去重，只有唯一地址允许进入本轮导航；后续读取绑定真实浏览器前驱。 |
| 执行推进 | `packages/runtime/src/task-chain/engine.ts::driveTaskChain` | `StateGraph.invoke` 推进单次节点步骤，处理异步等待、条件循环、AbortSignal 和递归上限。 |
| 产品循环语义 | `packages/runtime/src/task-chain/loop.ts::executeLoop` | 解释 B-A-T 的 cursor/稳定键/累积/检查点。每次从 body 返回先累积本页，再检查 repeatCondition 和预算；并非浏览器控制器或第二个异步调度器。 |

分页适配文件中没有 DOM 查询执行器、选择器解析器或浏览器控制实现；它们引用/校验已有读取规格及动作。该结论只覆盖重复方法适配，不将项目其他 DOM 读取实现的选型视为已经重新审查。

实际复跑顺序为：初始化 Next → loop → 首轮直接读当前页 → 完整查 Next → 地址去重 → 回 loop 累积；若 Next 非空且预算允许，下轮先导航到本轮读取的地址，再读新页；Next 为空时，最后一页已累积后才结束。非空的最后一个**准备样本**只表示采样结束，不能被当成业务终页。

## 明确支持边界

| 模式 | 当前事实 | 所属边界 |
| --- | --- | --- |
| href 下一页 | Python 校验同目的地完整查询；编译后的推进必须是动态 `navigate.url`；TS 再验同 tab 和实际地址变更。 | 当前单链支持范围。 |
| 同页按钮加载 | `_query_scope` 要求 href，`_advance` 要求 URL 变更，折叠和物化要求 navigate。 | 自然证据与编译适配未接通；不是 LangGraph 无循环能力。 |
| 滚动追加 | repeat 的推进准入不接受 scroll；仅观察到 scroll_position 变化不能证明新增记录或最终范围完成。 | 需真实继续/停止和新记录归属证据；现有普通 scroll 的成功不关闭此门。 |
| 多套重复方法 | `repeat_annotation.py` 对多 outputPath 组返回 `repeat_annotation_multiple_output_paths`，当前图物化面向一个尾部方法。 | 明确超出当前单尾部方法适配；不在本次复用核验中悄悄扩张。 |

## 既有验证与本次检查

- 既有所属测试：`apps/api/tests/hybrid-natural-repeat.test.ts` 覆盖三页动态读取、稳定键去重、最后一页先累积、同链变化输入、预算在下次翻页前失败、重复布局同目的地、来源/控制图篡改，以及 Python 生产 normalizer/compiler → TS 准入桥。
- 既有 Python 测试：`vendor/workflow-use/workflows/tests/test_natural_repeat.py` 覆盖代表样本折叠、完整查询预算差异、终页探查、未归属副作用和非动态推进拒绝。
- 既有实机记录：PROGRESS 的“G5 真实 GitHub 分页来源、编译与普通复跑通过”，`bat-g5-real-repeat-kneXYw` 记录两页代表、8 页普通遍历、7 次实际翻页、77 条 URL 唯一记录、复跑模型 0；这不是本次新跑，也不是按钮/滚动证据。
- 本次没有生产代码改动，没有测试重跑、浏览器启动或模型调用；仅新增本记录并定点检查差异。
- 本次只读检索有两个路径拼写失误：`vendor/workflow-use/PINNED_VERSION.json` 与 `apps/api/src/upstream-browser/hybrid-authoring.ts` 不存在；已使用实际 `LOCAL-CHANGES.json` 和已知 `hybrid-artifact.ts`，不据不存在路径推断组件状态。

没有通过本次文档检查关闭 G6 或按钮/滚动验收。原首次失败、重试结果、未测范围和 D6 待决状态均保持原义。
