---
status: accepted
date: 2026-09-16
supersedes: ADR 0004 中 workflow-use 直接接入、v1 workflow artifact 可执行及 verified 结论
---

# 基于 workflow-use fork 的证据驱动混合链路编译器

## 背景

固定 workflow-use 0.2.11 在 Aster/Beryl 和简单表单中完成过生成与复跑，但真实 LangGraph Issues 任务证明它不能直接承担 B-A-T 的通用 history → reusable TaskChain 职责。

旧接入显式设置 `use_deterministic_conversion=False`，让模型读取完整 browser-use history 后生成整份 workflow definition。该决定没有做两种上游转换方式的同历史对照，也违反“模型不得直接拥有完整节点图”的架构基准。

上游两种模式各有结构性缺陷：

- deterministic conversion 按动作类型机械映射，缺少 Requirement/Plan 的选择语义、动态绑定和控制流依据；其实现还包含固定动作集合、跳过动作和字符串启发式。
- LLM conversion 让模型重写整图，会漏步骤、重排、复制样本值，并受到长 history、截图体积和结构化输出波动影响。

旧路径后续累积 12 份补丁，覆盖 prompt、schema/executor、目标解析、accessible context、弹层、异步等待和点击效果。继续修补已经越过胶水边界。与此同时，B-A-T 的旧 v1 author/replay 仍在正式入口中，删除 patch 文件也不能安全退出。

## 决策

### 1. 以干净上游为受管 fork 基线

将 workflow-use commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249` 的固定源码导入 `vendor/workflow-use/`，保留 AGPL-3.0 LICENSE、来源、commit、导入日期、原始 digest 和 B-A-T change log。

导入基线必须与上游一致，不包含 0001–0012。现有 patch 栈只作为诊断证据；有价值的行为必须依据新合同和通用不变量重新准入，不能复制补丁实现作为起点。

fork 只承担 history 证据规范化和混合编译。它不复制 browser-use 浏览器驱动/Agent loop，不实现第二个 LangGraph、scheduler、checkpoint store 或产品数据库。

### 2. 编译器消费三类意图/证据

权威输入是：

1. 已确认 Requirement：目标、动态输入、约束、输出和完成标准；
2. TaskPlan 与 PlanControlContract：步骤依赖、once/each/batch、步骤内部选择、branch、loop、invoke 和停止条件；
3. 成功且业务判定通过的 browser-use history：动作、前后观察、结果、字段来源和效果证据。

history 记录第一次实际发生了什么，不定义任务本来应该做什么。现有 TaskPlan 不能表达全部步骤内部控制流；缺失时必须读取结构化 Requirement、接受用户确认的 annotation，或输出 gap。不得从一次录像猜循环、分支或选择规则。

### 3. 每个动作必须被覆盖

规范化阶段保留所有成功、失败、取消和未知动作，并建立 action coverage ledger。每个动作必须唯一属于可执行区段、supporting 证据、失败重试、合法 agent internal，或明确的 not_compilable gap。

未知动作不能因为不在 B-A-T 手写名单中而消失；action registry 来自上游公开 action schema。已产生副作用的动作不能被排除。漏动作、重复归属或未解释的 URL/tab/外部状态变化都会阻止候选生成。

### 4. 混合编译只产生三类结论

对每个因果区段，按固定顺序输出：

1. `deterministic`：公共 capability 可执行，且 target、binding、effect、postcondition 都有证据；
2. `explicit_llm`：Requirement 本身需要开放语义函数，输入/输出/候选/预算有界；
3. `not_compilable`：证据、能力、绑定或控制意图不足，保存结构化 gap 并停止。

selector 不稳、等待不足、异步跳转、点击未生效、分页、恢复、重试、未知动作和 schema 不一致都属于普通能力/编译 gap，不能改写成 LLM 需求。

### 5. 样本与运行参数必须分离

每个动作参数必须分类为 runtime input、prior output、Requirement/Plan 授权常量或 sample-only evidence。

例如历史都点击了标题 X：

- “打开第 2 页第 1 条”绑定页码、排序/筛选状态、列表容器和 ordinal；X 只是样本证据。
- “打开标题 X 的条目”才将 X 绑定到 Requirement 输入或授权常量。

sample-only evidence 进入运行参数会产生 `sample_value_leak` gap。临时元素 ref、DOM index 和一次性 selector 不能成为持久 target。

### 6. 模型只返回有界语义值

允许的 LLM 用途是开放词汇分类、自由文本结构抽取、总结、在有界候选中排序/选择和语义去重。显式 LLM 节点读取已绑定数据，返回符合 Schema 的值或候选稳定 ID。

模型不得生成节点、边、预算、重试、selector 或浏览器动作，也不得决定自己是否需要。authoring 模型最多提供带来源的紧凑 `SemanticOperationAnnotation`；编译器按允许用途、候选上限和 Schema 确定性接受或拒绝。

### 7. 物化必须唯一且零模型调用

`HybridCompilation` 包含规范区段、控制图、coverage、gaps、证据和 canonical digest。节点 ID、排序、edge、错误出口、嵌套图、invoke 版本和预算都按固定规则生成。

唯一性含义是：固定 trace、Requirement/Plan/ControlContract、accepted annotations、action registry 和 compiler version 产生同一 canonical digest。HybridCompilation → TaskChain 的物化过程不调用模型。

LangGraph `StateGraph` 继续是唯一图执行引擎。B-A-T adapter 只做边界校验、版本化 artifact、TaskChain 一对一映射、运行编排和审计。

### 8. 证明状态按顺序前进

链路状态为：

```text
static_proven
  -> candidate
  -> sample_passed
  -> different_input_verified
  -> frozen
```

`static_proven` 代表合同、绑定、coverage 和静态证明完整；它不要求已经复跑。样本复跑只能发生在 candidate 之后。history success、schema valid 或旧 workflow 正常返回都不能直接写 `verified/frozen`。

### 9. 旧 v1 路径先退休，随后原子切换

旧 workflow artifact v1 保留 decoder、查看和导出，但 writer/compiler/replay/resume 退出。旧 author、replay、queue、invoke 必须在启动 Python、Browser 或模型前返回 `legacy_workflow_use_v1_retired`。

新路径的 protocol、provider、authoring、artifact v2 writer、runtime routing、setup、恢复和 idempotency keys 必须原子切换。旧/new runtime 混用时返回 `mixed_browser_runtime_unsupported`。

旧 artifacts、chains、runs 和 history 原字节保留，不因代码切换删除。只有新真实验收通过后，才能精确删除旧活动 runner/env 和活动 patch 安装路径。

## 复用评估

Reuse Assessment:
- capability: browser-use history 读取、动作/元素证据规范化、混合编译和通过准入的普通执行能力
- existing implementation in repository: TaskChain/LangGraph、版本/绑定/审计/运行；旧 v1 workflow 路径待退休
- mature candidates and pinned versions: workflow-use 0.2.11 @ `5d2d19f`，browser-use 依 fork lock 的 0.13.8 基线
- selected implementation: 干净 workflow-use 受管 fork；逐项复用公开 schema/history surface
- reused public surface: history、interacted element、action schema；executor 需要单独 focused gate
- B-A-T-owned adapter and remaining gap: Requirement/Plan/Control 输入、artifact/version、TaskChain 映射、运行/审计/产品生命周期
- license/runtime/platform fit: workflow-use AGPL-3.0；macOS/Python 基线已知，Windows 和分发义务仍是独立门
- browser/runtime/state ownership conflicts: 一个产品运行一个 browser-use Browser；LangGraph 是唯一图引擎；SQLite 是产品事实源
- replay model calls: 只允许显式 LLM segment
- rejected candidates and evidence: 原生 mechanical deterministic 缺意图；原生 LLM whole-graph 在真实复杂 history 中漏义和固化样本；12 patch 路线停止
- focused validation: 脱敏 fixture、两种上游离线对照、样本、不同输入、真实 LangGraph Issues、非采集任务、模型审计、finally 清理

## 后果

- 开发顺序变为：证据/处置 → 旧执行退休 → 干净 fork → normalize/coverage → 混合分类 → TaskChain 物化 → 原子产品切换 → 一次真实验收。
- 旧 `application/vnd.bat.workflow-use+json;version=1` 不再是可执行产品合同。
- 0001–0012 不再由 setup 应用；它们在完成证据迁移前保留在 dirty 工作区。
- 新编译器会诚实地产生 gap，因此并非每条成功 history 都能生成 candidate。
- AGPL 分发、Windows 兼容和完整 UI 仍是后续独立决策，不影响先证明转换核心。

## 硬停止条件

出现任一条件就停止实现并回到规范/选型：

1. 公共源码需要站点名、业务字段、页面文案或固定 selector；
2. 普通节点、selector 恢复、等待或重试需要隐式调用模型；
3. 无法解释每个已执行动作的唯一归属；
4. 无法为区段证明 target、binding、effect、postcondition；
5. 无法从 Requirement/Plan/ControlContract 证明控制流；
6. 需要新增 browser driver、Agent loop、图调度器、检查点数据库或模型供应商桥；
7. 同一 fork 子系统连续暴露第二个独立核心缺陷，仍准备写第三个修复而未重做 Reuse Assessment；
8. H7 真实验收没有同时完成业务输出、不同输入复用、模型审计和浏览器清理。此时记录 `abandoned`，保留证据并停止。

## 规范性文件

- [编译合同、算法、正反例和验收](../development/WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)
- [旧代码、补丁、数据和切换处置](../development/WORKFLOW_USE_LEGACY_DISPOSITION.md)
- [分阶段开发与通过门](../development/WORKFLOW_USE_HYBRID_COMPILER_PLAN.md)
