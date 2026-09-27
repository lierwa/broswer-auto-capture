# 嵌套集合选择证据补齐（2026-09-27）

## 已定位首次失败

真实 GitHub 发布正文列表的选择动作没有读取完整候选，目标位于第二个 `section` 的多层后代。旧检查只检查目标的直接兄弟，因此编译回落固定 history XPath，未生成选择 Function。来源 `bat-g5-real-selection-YCxUX8/source-result.json` 保持原样；本次离线验证必须拒绝该来源，不把修复后的重试覆盖为首次通过。

Product Alignment:
- natural-language task: 按当前页面条目的业务条件选择并打开一个结果。
- reusable chain boundary: 完整候选读取 → 已确认规则的纯 Function → 原始 ordinal 绑定 → 浏览器动作。
- runtime inputs: 当前列表入口及任务数据中的选择规则。
- dynamic task outputs: 当前候选决定的目标，不保存样本序号作为规则。
- generic platform capability used: 既有 DOM 证据、完整查询、自然选择编译。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 嵌套重复条目的查询与点击证据关系。
- existing implementation in repository: Browser-Use DOM tree、EvidenceCollector、verified_collection_query、natural_target/bind_selection_function。
- mature candidates and pinned versions: 仓库现有 Browser-Use / workflow-use 锁定版本（不更换依赖）。
- selected implementation: 复用以上公开浏览器/DOM 能力，只补 B-A-T 的结构证据关系。
- reused public surface: selector_map、parent_node/children_nodes、get_elements_by_css_selector、既有 read_fields_with_proof。
- B-A-T-owned adapter and remaining gap: 目标可处于重复条目的多层后代；完整查询的全部目标须属于同一局部对应关系。
- license/runtime/platform fit: 不引入依赖；沿用已有 Python / Windows 运行环境。
- browser/runtime/state ownership conflicts: 无新增浏览器、调度器或持久化事实源。
- replay model calls: 0。
- rejected candidates and evidence: 不重写选择器；直接父兄弟检查在真实来源中漏判第二个 section 的链接。
- focused validation: 嵌套未读拒绝、完整同域候选接受及原 ordinal、跨页控件集合拒绝、不可变真实来源离线拒绝。

## 验证记录

- 首次最小验证：`test_nested_collection_selection` + `test_execution_dynamic_selection` 共 15 项，13 通过、2 个 fixture 错误。新 callback fixture 缺合法原生 step（补齐后又暴露缺 get_tabs，补齐后该项通过）；既有 DOM lookup fixture 缺当前 effect/observation/query proof 合同，修正 fixture 后该项定点通过。累计 15 项均通过，不重复整组验证。
- 现有工具错误反馈去掉“唯一链接可以读取 href 后 navigate”的绕行提示，改为完整候选查询 → 已确认规则 → 当前浏览器 click index；明确原始 candidate ordinal 不等于 click index，不能把 selector 缩成样本身份。
- 新增保护：嵌套未读取点击在原生派发前拒绝；编译不能退回样本 XPath；完整嵌套查询保留原始 ordinal=2；全页查询即使含局部同类目标，也不能夹带外部目标。
- 旧真实来源离线编译：首次脚本把严格 UUID 参数传成字符串，未执行编译；修正脚本后仅返回 `collection_selection_read_required`（`a-0002`）。来源 SHA256 `b2ffc16a25f8a09180ee98d6ab3757651ce527d14fc5f41d10ac7b9338b1e66b` 未变。证据 `work/g5-nested-selection-old-source-rejection.json`，浏览器命令 0、模型调用 0。
- 真实新来源/变化数据复跑后续通过：`bat-g5-real-selection-fbdqn3` 成功来源经原ordinal顺序指引与JSON数值等价修复后，同源离线编译，在 `retry-2I4n1L` 两个独立run按不同页候选分别选择ordinal3/v0.17.1和ordinal6/v0.13.1，真实浏览器到达对应详情；两次模型0，同链摘要一致。首复跑的4/4.0误拒和前五个来源/编译失败均保留，详见PROGRESS。复杂版本排序样本仍失败，基础筛选通过不替代该失败。
