# Native click 迟到导航边界

日期：2026-09-17

结论：通过定点实现与离线诊断。这里的“通过”只表示真实 source 中 `a-0002 → a-0003 → a-0004` 的编译证据和 TypeScript runtime scope 消费已闭环；没有运行浏览器或 provider，也没有把整条失败任务标记为成功。

## Product Alignment

- natural-language task: 从 GitHub 仓库页点击可见的 Issues 入口后继续操作 Issues 页。
- reusable chain boundary: 原生 click 返回后才完成的 URL 导航，只能由下一实际动作的 pre observation 证明。
- runtime inputs: 既有 `NormalizedTrace`、action coverage、compiled segment 和 source payload。
- dynamic task outputs: 既有 `url_digest changed` postcondition 与后续 segment runtime scope marker。
- generic platform capability used: `browser.workflow-step`、evidence ledger、proof refs、raw fact assertion。
- replay model calls: 0。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 给 native click 归因一个有界迟到的 URL 变化，并让下一个真实 browser segment 安全消费该页面边界。
- existing implementation in repository: `delayed_post_for_conditions`、`not_dispatched_coverage`、`NATURAL_SETTLE`、`assertFact`、`classifyRuntimeScopeDecisions`。
- mature candidates and pinned versions: 不涉及新库；这是现有 trace/compilation 私有证据语义的局部补齐。
- selected implementation: Python 只读证据 helper 加 TS 私有 scope classifier 分支。
- reused public surface: 既有 observation/action/coverage/segment 字段；没有新增公共 contract 或 LLM 字段。
- B-A-T-owned adapter and remaining gap: B-A-T 仅验证证据归因和 runtime scope；不新增等待、重试、浏览器控制或调度器。
- license/runtime/platform fit: 只使用 Python 标准库和仓库既有 TypeScript/Python API。
- browser/runtime/state ownership conflicts: 无；诊断完全离线，产品仍只拥有一个浏览器会话。
- replay model calls: 0。
- rejected candidates and evidence: 拒绝把任意下游 title/overlay/URL 变化归给 click；拒绝跨已进入的真实动作；拒绝只凭 clauseRef 或下游 observation 放行。
- focused validation: 见下文。

## 真实证据与不变量

来源固定为 `work/natural-task-validation/da124af1-ef86-4905-bf54-3e3f00431445/source-result.json`，没有修改 source、flags、digest 或 observation。

- `a-0002` 是 succeeded click；`o-0003` 与即时 `o-0004` 同 tab、同唯一 64 hex URL digest。
- `a-0003` 是 failed click；唯一 `native_action_dispatch` 事实严格证明 `entered=false`，coverage 为 `native_action_not_dispatched/v1`。
- 下一实际动作 `a-0004` 的 pre 是 `o-0005`；`o-0004.sequence=3`、`o-0005.sequence=4`，同 tab，monotonic 差 13,562ms，URL digest 从 `d25d...3968` 变为 `c747...758d`。
- Python 只允许这一类 click 的 `url_digest` 迟到完成证据。原 pre 与即时 post 必须同 tab、同 digest；即时 post 到下一实际 pre 必须 sequence 连续、时钟单调且不超过 30 秒。
- 中间 action 只能由现有 `not_dispatched_coverage` 严格证明未进入执行。第一个其他 action 只提供 pre boundary；实现不会越过它读取 post 或更下游 observation。
- click 的掩码 `target_value` 不再被当作完成证据；该快捷完成仅保留给 `input` 和 `select_dropdown`。
- TS 对正常 clauseRef 位于原 post 的 segment 保留旧路径；只有 clauseRef 精确落在当前 owner 的 pre URL fact 时进入迟到路径。迟到路径重新核验时间、sequence、tab、digest、coverage、dispatch fact 和全部 proof refs，不再拿未派发 action 的合成 observation 与旧 URL 比较。

## 定点验证

临时诊断位于 `/private/tmp/late-nav-python-diagnostic.py` 和 `/private/tmp/late-nav-ts-diagnostic.ts`，未添加测试文件。

- 真实 Python 编译红绿：诊断通过实际 `author_tools` 与 `ActionRegistry.from_tools` 校验原生 click 参数；旧 compilation 对 `a-0002` 含 `natural_postcondition_evidence_missing`，新编译生成 `s-a-0002`，其唯一 postcondition 是 `o-0005` 的 `url_digest changed`。`a-0003` coverage 保留，`s-a-0004` 仍独立存在。
- 诊断使用最小 null 输出模型来构造真实 Tools registry，因此它的 registry digest 与旧 source digest 不同；`registry_version_mismatch` 全局 gap 被刻意保留，没有伪装成原 registry。该 gap 不影响本次只检查 a2 局部证据分类。
- proof refs：`s-a-0002` 包含原 action result、迟到 observation/URL fact 和 `a-0003` 未派发证明。
- TS focused scope：用新编译和真实 trace 的聚焦 `s-a-0002 → s-a-0004` edge 得到 `{ segmentId: "s-a-0004", runtimeScopeFrom: "s-a-0002" }`。正向 `assertFact` 对原 source 中同 observation/id/kind/value/sourceRefs 做逐项严格比对，共执行 26 次；负例使用 no-op assert 隔离本次新增守卫。
- 负例全部拒绝：跨 tab、超过 30 秒、sequence 不连续、跨真实动作、未派发证明失效、重复 URL digest、即时 URL 已变化、伪造 clauseRef、缺失 bridge proof、owner result 缺失、负 action index、同 actionRef 存在多条 dispatch fact。
- 正常 clauseRef 指向原 post 时仍走旧路径；该诊断得到原有 `runtime_scope_not_dispatched_unproven`，没有被误判成迟到 clause。
- Python 内存编译：通过。
- Ruff（两个 Python 文件）：通过。
- `npm run check --workspace @browser-capture/api`：通过。

## 真实宿主摘要红绿

此前 TS focused scope 诊断只逐字段比较 fact，没有调用生产 `naturalPayloadContext` 的原始摘要校验，因而没有覆盖 `capture.fact` 对 `monotonic_ms` 固定散列 `{kind,value}` 的真实 consumer 边界。

- 真实红灯：`node --import tsx /private/tmp/late-nav-real-consumer-regression.mts` 读取上述 source 的 `sources[0].result.response` 与 `request`，在生产 `context.assertFact` 校验 `o-0004` 的 `monotonic_ms` 时稳定抛出 `hybrid_natural_fact_digest_mismatch`。
- 局部修复：`assertRawFact` 仅让 `url_digest` 和 `monotonic_ms` 两类 `capture.fact` 基础事实按 `{kind,value}` 计算摘要；其他 kind 仍按原 `value` 规则验证。
- 真实绿灯：同一命令对 `o-0004`、`o-0005` 的原始 `monotonic_ms` 均通过；篡改任一 value 仍被拒绝。
- 生产 scope 消费：将 `/private/tmp/late-nav-python-diagnostic.py` 的实际 compilation 聚焦为 `s-a-0002 → s-a-0004` edge，并传入 `trace: context.ordinary.trace` 与 `assertFact: context.assertFact`，结果为 `{ segmentId: "s-a-0004", runtimeScopeFrom: "s-a-0002" }`。这里没有使用空 `assertFact` 或自造摘要。
- 修复后 `npm run check --workspace @browser-capture/api`：通过。

## 边界

没有运行浏览器/provider，没有新增依赖、测试文件、公共 contract、manifest 更新、分支、worktree、提交或推送。TS marker 是局部适配器诊断，不是持久化宿主通过。完整任务仍有与本修复无关的既有 gaps；本证据不把 source task 宣称为已完成。
