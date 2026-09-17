# Failed native DOM lookup coverage

日期：2026-09-17

## Product Alignment

- natural-language task: 在通用浏览器探索中定位页面结构；既覆盖列表采集，也覆盖表单定位。
- reusable chain boundary: 失败的原生 `find_elements` 只保留为首次探索的只读观察，不进入确定性复跑执行段。
- runtime inputs: 保持原任务输入与现有绑定不变。
- dynamic task outputs: 不新增、不改写业务输出。
- generic platform capability used: 原生 DOM 查询证据、动作 coverage 与同页运行时 scope 连续性。
- replay model calls: 0；失败 lookup 不生成执行节点。
- site/task-specific code added: no

## Reuse boundary

本修复复用现有 `native_dom_lookup_observation/v1` 的成功分类、动作 registry schema 校验、`dom_query` 证据和独立 coverage 重算，只新增失败专用 exclusion rule。失败准入必须同时证明：动作精确为 `find_elements`、`effect=read`、`status=failed`、存在 `resultRef`、参数通过当前原生 schema、前后观察均存在且引用对应、前后同 tab 且 URL digest 不变、唯一 `dom_query` 的 `actionRef` 与 scope 和动作边界一致。它不放行其他动作、缺观察、跨页面、query 不匹配或 scope 不一致，也不扩大既有 `failed_bat_read_fields`。

TS 消费端仅在 coverage 行和源 trace 重新核对上述同等事实、query sourceRefs 与 URL digest 后，才允许失败只读 lookup 保持前后 scope 边界；成功 lookup 继续走原路径。

## Baseline

- 修改前成功 lookup 定点验收：`test_successful_same_document_find_elements_is_audited_internal_observation`，1/1 通过。
- 待验证 source：`work/natural-task-validation/30db3c05-a8e9-47b5-907f-9e19d5ba1e80/source-result.json`；原 source、成功标记与 candidate 状态不得改写。

## Implementation

- `natural_compile.py` 在既有成功 `native_dom_lookup_observation/v1` 之后接入失败专用 `failed_native_dom_lookup_observation/v1`；两条规则互不替代，失败动作不生成 segment。
- `coverage.py` 从 trace 重新调用纯分类函数生成 expected row，并与 ledger row 完整比较；不是只比较 exclusion 字符串。准入继续使用 production `ActionRegistry.validate_action` 与严格 `DomQueryEvidence`。
- `hybrid-runtime-scope.ts` 只为该失败规则增加连续性消费：重新核对动作、参数、前后 observation、同 tab/URL digest、`dom_query`、scope、失败 limitation 及 evidenceRefs，之后才将边界推进到 post observation。
- production `FindElementsAction` schema 已通过 `output_model_for(outputSchema, "HybridAgentOutput")` 和 `author_tools` 实际读取：`attributes` 允许 `array<string> | null`；`max_results` 原生层只要求 integer，正数要求来自 `bat.dom-query/v1` 证据合同。

## Focused validation

- 原 source 离线重编译：使用隔离库中的真实 step output schema、production `output_model_for(..., "HybridAgentOutput")`、`author_tools` 与相同 registry。仅 a-0018/a-0019 的两条 `successful_action_result_required` 消失；segments、outputAssembly、其他 coverage 行和其他 gap 原样一致。
- 新 coverage：a-0018/a-0019 均为 `agent_internal` / `failed_native_dom_lookup_observation/v1`；source SHA256 为 `40e86826603532b6f194f155a45c9dcf508afc138e61c78ddf23df0a10e0aeb6`，文件字节未改。
- source 终态仍为 `completed=false`、`judged=false`，candidate 未生成。
- `/private/tmp/failed_lookup_coverage_probe.py` 从真实 source 派生 actionName、status、scope、URL、args 和缺 observation 反例，分类与独立 coverage 均拒绝；删减 evidenceRefs 的伪造 row 被 `invalid_exclusion` 拒绝。
- `/private/tmp/failed_lookup_runtime_scope_probe.mts` 接受完整失败 lookup 的同页连续边界；拒绝 actionName、status、args、scope、URL、sourceRefs 与 digest 反例。
- 既有成功 lookup 定点用例修改后再次 1/1 通过；未修改仓库测试。
- `npm run check --workspace @browser-capture/api`：通过。
- Python `py_compile` 与 `ruff check --no-fix`（`natural_compile.py`、`coverage.py`）：通过。
- 行数：`natural_compile.py` 471、`coverage.py` 171、`hybrid-runtime-scope.ts` 370；均低于 500。
- 开发子 agent `turn_context`：Codex session `rollout-2026-09-17T06-52-06-01a0ac6b-938b-74e3-8152-fca7b47c4a11.jsonl`，记录 `model=gpt-5.6-sol`、`effort=high`。

未启动浏览器、未调用模型、未生成正式 candidate、未改 source 或 manifest、未新增仓库测试，也未运行根级或全量测试。
