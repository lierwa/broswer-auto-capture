# browser-use 历史到混合 TaskChain 的编译规范

> **2026-09-17 清理纠正：** 执行参数和局部定位证据必须保全；摘要用于完整性校验，不能替代复跑原值。日志、Git 证据与本地执行数据是不同边界。URL 一致性不代表页面就绪，动作历史也不自动包含截图／模型判断能力。旧稿中超出当前实现的声明不作为已通过证据；当前工作仅限 [清理账本](REPLAY_CLEANUP_20260917.md)。

日期：2026-09-16
状态：第 2 节已按用户当前产品决策修订；后续 v1 结构条款仅历史兼容，新自然来源正在实现
决策：[ADR 0005](../adr/0005-workflow-use-fork-hybrid-compiler.md)
旧路径处置：[workflow-use 旧路径处置与切换规范](WORKFLOW_USE_LEGACY_DISPOSITION.md)

## 1. 目标与成功定义

本规范只解决一个问题：如何把一次已经成功并经业务判定通过的 browser-use 执行历史，结合已确认需求和计划，编译为参数化、可验证、可复跑的混合 TaskChain。

编译器必须同时做到：

1. 每个已执行动作都有唯一归属，不漏掉、不重复消费、不静默跳过；
2. 浏览器定位、等待、重试、分页和状态恢复由普通能力承担；
3. 只有任务本身需要开放语义理解时才产生显式 `llm` 节点；
4. 样本标题、临时元素索引、一次性 selector 和截图内容不能冒充运行参数；
5. 固定输入证据和固定编译版本必须产生唯一的规范化 TaskChain；
6. 证据不足时输出结构化 gap 并停止，不能让模型补图或让执行器撞运气。

`history 成功` 只证明第一次探索完成。它不是链路可编译、可复跑或已验证的证明。

Product Alignment:
- natural-language task: 把已完成的自然语言浏览器任务编译为可复跑的参数化链路
- reusable chain boundary: 一个 TaskPlan 步骤对应一条链；重复输入调用同一链
- runtime inputs: 已确认需求、计划输入、上游节点输出和用户接受的控制意图
- dynamic task outputs: 普通能力结果或显式 LLM 结果，经动态 Schema 校验
- generic platform capability used: browser-use history、受管 workflow-use fork、现有 TaskChain 和 LangGraph
- replay model calls: 仅显式 `llm` 节点；每次有用途、输入、输出、预算和审计
- site/task-specific code added: no

## 2. 已确认任务与实际探索证据（2026-09-16 用户修订）

需求对话只负责把目标、输入输出、顺序、约束、异常和完成标准聊透，并生成用户可读的详细执行任务列表。browser-use 的 Agent(task=...) 直接消费这份自然语言任务，不要求 bat-compilation/v1、PlanControlContract 或另行确认的规则 JSON。

- 原需求文字及其确认版本是业务要求来源；TaskPlan 负责既有步骤/输入输出/依赖的产品编排。
- 原生 Agent/DOM/action result 是实际执行来源。技术定位、参数绑定与状态观察必须和实际来源对应。
- 编译决定是带证据引用的内部产物，不是另一份需求权威，不得把旧 clauses/control 换名继续要求用户生成或确认。
- 不得仅凭本次打开了标题 X，就将 X 冻结为选择规则；不得仅凭重复次数决定用户永久所需数量。
- 证据、值来源或可复用控制结构不足时保留具体编译 gap；缺少独立规则文档不再是禁止开始探索的理由。
- 模型不能生成整份节点图或接管普通复跑。内部类型、序列化传输和运行合同继续由程序维护，不作为额外任务语言交给 b-u。

自然来源使用 bat-hybrid/2，包含已确认需求原文、实际 Agent taskText、需求/计划身份及摘要、输入合同和真实 trace。下述 bat-hybrid/1 clauses/control/acceptedAnnotations 合同及其确认机制保留为历史来源的读取、离线重编译兼容，不再用于新生产 authoring。新路径的实现及实际准入范围见 [执行记录](evidence/browser-use-dom-tools/NATURAL_TASK_IMPLEMENTATION.md)。

## 3. 输入合同

以下为历史 bat-hybrid/1 语义合同。它不得重新成为普通 Markdown authoring 的前置门；新自然来源以第 2 节和当前实现记录为准。

```ts
type CompilationRequest = {
  compilerVersion: string;
  actionRegistryVersion: string;
  requirement: {
    id: string;
    version: number;
    digest: string;
    clauses: RequirementClause[];
  };
  plan: {
    id: string;
    version: number;
    digest: string;
    stepId: string;
    inputSchemaDigest: string;
    outputSchemaDigest: string;
    callMode: "once" | "each" | "batch";
  };
  control: PlanControlContract;
  runtimeInputSchema: JsonSchema;
  trace: NormalizedTrace;
  acceptedAnnotations: AcceptedAnnotation[];
};
```

所有 digest 必须在编译入口重算并匹配。任何引用不存在、顺序不连续、来源版本不匹配或多余字段都直接拒绝。

### 3.1 规范化观察

```ts
type NormalizedObservation = {
  id: string;                 // o-0001
  sequence: number;
  url: string;
  tabId: string;
  documentDigest?: string;
  accessibilityDigest?: string;
  interactiveElementsDigest?: string;
  facts: ObservationFact[];   // 执行所需的 URL、role/name、数量、状态等；不能用哈希替代原值
  sourceRefs: EvidenceRef[];
};
```

截图只能作为 `EvidenceRef` 按需引用。编译入口不得默认把全部截图或完整原始页面传给模型。

### 3.2 规范化动作

```ts
type NormalizedAction = {
  id: string;                 // a-0001
  stepIndex: number;
  actionIndex: number;
  name: string;               // 来自 browser-use 注册的真实动作名
  args: JsonValue;            // 保留原生动作字段与值；输入绑定另行记录，不能靠白名单丢弃参数
  status: "proposed" | "started" | "succeeded" | "failed" | "cancelled";
  preObservationRef?: string;
  resultRef?: EvidenceRef;
  postObservationRef?: string;
  effect: "none" | "read" | "ui_state" | "navigation" | "external_write";
  retryOf?: string;
};
```

原始 browser-use history 到 `NormalizedAction` 的映射必须由版本化 action registry 驱动。registry 读取上游公开 action schema；它用于识别和保留动作，不是允许动作的手写白名单。遇到未知动作仍要写入 trace 和 coverage，随后输出 `unsupported_action` gap。

| browser-use 原始事实 | 规范字段 | 拒绝条件 |
| --- | --- | --- |
| history item 顺序 + action list 顺序 | `stepIndex/actionIndex/id` | 顺序重复或断裂 |
| action model 的单个已设置字段 | `name/args` | 同一 action 同时设置多个动作字段 |
| ActionResult error/success/done | `status/resultRef` | 结果无法对应 action |
| item 前 browser state | `preObservationRef` | 副作用动作缺前置事实 |
| item 后 browser state/URL/tabs | `postObservationRef/effect` | 成功动作缺后置事实 |
| interacted element/selector map | observation facts/evidence | 临时 index 直接成为 StableTarget |
| extracted content/final result | `resultRef/finalResultRef` | 原始敏感内容未脱敏 |

### 3.3 规范化历史

```ts
type NormalizedTrace = {
  mediaType: "application/vnd.bat.browser-use-trace+json;version=1";
  source: { provider: "browser-use"; version: string; historyRef: string };
  digest: string;
  judged: boolean;
  completed: boolean;
  actions: NormalizedAction[];
  observations: NormalizedObservation[];
  finalResultRef?: EvidenceRef;
  redactionManifestRef: EvidenceRef;
};
```

只有 `judged=true`、`completed=true` 且业务输出通过 Requirement 完成条件的 trace 可以进入编译。Cookie、Profile、令牌、验证码和原始敏感页面不得进入编译产物或 Git fixture。

## 4. 需求、控制与动作对齐

### 4.1 条款与控制合同

```ts
type RequirementClause = {
  id: string;
  kind: "input" | "selection" | "constraint" | "output" | "completion";
  expression: JsonValue;
};

type PlanControlContract = {
  selections: SelectionIntent[];
  branches: BranchIntent[];
  loops: LoopIntent[];
  invokes: InvokeIntent[];
};
```

每个 intent 必须引用 Requirement clause 或用户确认的 annotation。没有来源的控制意图不得生成。

### 4.2 对齐算法

编译器按以下顺序执行，任何一步失败都不得继续物化 TaskChain：

1. 校验 request、版本、digest 和引用闭包；
2. 规范化所有动作、结果和前后观察，保持原顺序和失败尝试；
3. 为每个动作建立 coverage 记录，初始状态为 `unassigned`；
4. 将 Requirement clause、计划步骤和 ControlIntent 与动作的可观察效果对齐；
5. 对每个动作参数做 BindingDecision，区分动态值与样本证据；
6. 按因果规则建立区段；
7. 按固定决策表分类区段；
8. 从权威控制合同构建 branch/loop/invoke，不从录像猜控制流；
9. 检查 action coverage、binding、证明和 gap；
10. 使用规范序列化确定性地物化 TaskChain，并计算 digest。

对齐出现多个同样合理的解释时，编译器只能接受有界人工/模型注解后重新校验，或输出 `ambiguous_clause_alignment`。模型注解不能添加动作、边、重试、预算或控制流。

允许的注解合同只有两种：

```ts
type AcceptedAnnotation = ControlIntentAnnotation | SemanticOperationAnnotation;
type ControlIntentAnnotation = {
  kind: "control_intent";
  clauseRefs: string[];
  intent: SelectionIntent | BranchIntent | LoopIntent | InvokeIntent;
  confirmedBy: "user";
};
type SemanticOperationAnnotation = {
  kind: "semantic_operation";
  segmentEvidenceRefs: EvidenceRef[];
  clauseRefs: string[];
  purpose: ExplicitLlmSegment["purpose"];
  candidateIds?: string[];
  inputFieldRefs: string[];
  proposedOutputSchema: JsonSchema;
};
```

模型只能提出 `SemanticOperationAnnotation`；`ControlIntentAnnotation` 必须来自用户确认。编译器仍要按允许用途、输入上限、候选上限和输出 Schema 接受或拒绝注解。

## 5. 值绑定决定

```ts
type BindingDecision = {
  id: string;
  actionRef: string;
  argumentPath: string;
  kind: "runtime_input" | "prior_output" | "authorized_constant" | "sample_evidence";
  sourceRef: string;
  transform?: SafeTransformRef;
  proofRefs: EvidenceRef[];
};
```

- `runtime_input`：来自链输入。
- `prior_output`：来自已完成节点的类型化输出。
- `authorized_constant`：Requirement/Plan 明确要求的常量，例如固定仓库 URL。
- `sample_evidence`：只证明首次执行发生过，禁止成为运行参数。

必须保留以下反例：同一历史都点击了标题 `X`，但需求不同，编译结果必须不同。

| 需求 | 正确绑定 | 错误结果 |
| --- | --- | --- |
| 打开第 2 页第 1 条 | 页码、排序状态、列表容器、ordinal=1 | 固定点击标题 X |
| 打开标题为 X 的条目 | Requirement 中的 title 输入/常量 X | 用 ordinal=1 替代标题 |

任何 `sample_evidence` 流入可执行参数都会产生 `sample_value_leak` gap。

## 6. 因果区段

默认区段形状为：动作前观察 → 一个产生副作用的动作 → 动作后观察 → 完成断言。

固定规则：

1. 一个确定性区段最多拥有一个副作用动作。成熟执行组件提供原子复合操作时，可以保留它明确记录的子动作和单一效果。
2. `wait`、observe 和验证读取归入它所证明的最近动作；不能独立掩盖没有效果证明的点击。
3. 失败点击和重复等待保留为 `retry_attempt` 证据。只有通用能力合同拥有的有界重试策略可以进入运行配置。
4. 打开筛选弹层和选择选项在弹层状态需要恢复或验证时是两个区段；若公开能力提供可验证的原子 select，则可编为一个区段。
5. scroll 仅用于发现目标时属于 supporting action；当控制合同声明按可见窗口推进列表时，scroll 是 loop progress。
6. 纯读取形成 read capability 区段，必须声明页面事实来源和输出字段来源。
7. 跨标签页动作必须记录旧 tab、新 tab、切换条件和返回条件；共享观察不能隐式归属多个区段。
8. 文件写入、下载和外部提交具有更高副作用等级，必须有授权条款、幂等策略和动作后证据。

## 7. 动作覆盖账本

```ts
type ActionCoverage = {
  actionRef: string;
  disposition:
    | "compiled"
    | "supporting"
    | "retry_attempt"
    | "agent_internal"
    | "not_compilable";
  ownerSegmentId?: string;
  exclusionRule?: string;
  evidenceRefs: EvidenceRef[];
};
```

允许排除的只有不影响业务状态的观察、模型计划记录或被后续成功尝试取代的失败动作。任何已执行副作用动作不能标为 `agent_internal` 或静默排除。

以下情况一律拒绝：

- action 未归属；
- 同一 action 被两个区段拥有；
- 未知 action 被跳过；
- 副作用 action 没有 postcondition；
- 排除项没有稳定 rule code；
- trace 中发生的 URL/tab/外部状态变化没有解释。

## 8. 三类编译结果与固定决策表

### 8.1 确定性区段

```ts
type DeterministicSegment = {
  id: string;
  kind: "deterministic";
  operation: CapabilityRef;
  target?: StableTarget;
  bindings: BindingDecision[];
  preconditions: FactPredicate[];
  expectedEffect: EffectContract;
  postconditions: FactPredicate[];
  outputs: OutputBinding[];
  retryPolicy?: BoundedCapabilityRetry;
  proofRefs: EvidenceRef[];
};
```

`target`、`binding`、`effect`、`postcondition` 四项缺一不可。临时 DOM index、探索时 ref 和未授权的具体标题不能作为 StableTarget。

### 8.2 显式 LLM 区段

```ts
type ExplicitLlmSegment = {
  id: string;
  kind: "explicit_llm";
  purpose: "classify" | "extract_semantics" | "summarize" | "rank_candidates" | "semantic_dedupe";
  requirementClauseRefs: string[];
  inputSchema: JsonSchema;
  inputBindings: ValueBinding[];
  outputSchema: JsonSchema;
  candidateIdPath?: string;
  validation: OutputValidation;
  budget: { maxCalls: number; maxInputBytes: number; timeoutMs: number };
};
```

LLM 只能处理已读取的有界数据，返回结构化值或候选稳定 ID。它不能持有 Browser、selector、节点图或工具循环。

### 8.3 Gap

```ts
type CompilationGap = {
  id: string;
  code:
    | "invalid_source"
    | "unsupported_action"
    | "missing_observation"
    | "missing_effect_proof"
    | "missing_postcondition"
    | "missing_binding"
    | "sample_value_leak"
    | "ambiguous_clause_alignment"
    | "missing_control_intent"
    | "unsupported_capability"
    | "unbounded_semantic_operation"
    | "incomplete_action_coverage";
  actionRefs: string[];
  clauseRefs: string[];
  reason: string;
  resolution: "collect_evidence" | "confirm_intent" | "add_capability" | "reject_trace";
};
```

能力缺失、selector 不稳、等待不足和动作覆盖缺口不能被归类为 LLM 需要。

固定分类顺序：

1. 证据不完整 → gap；
2. 公共 capability 不支持 → gap；
3. target/binding/effect/postcondition 全部可证明 → deterministic；
4. Requirement 明确需要允许列表中的语义函数，且输入、输出、候选和预算有界 → explicit_llm；
5. 其余 → gap。

## 9. branch、loop 与 invoke 合同

```ts
type BranchIntent = {
  id: string;
  predicateSource: ValueBinding;
  predicate: TypedPredicate;
  outcomes: Record<string, string>;
};

type LoopIntent = {
  id: string;
  bodyRef: string;
  stableItemKey?: ValueBinding;
  maxIterations: number;
  accumulator: AccumulatorContract;
  continuePredicate: TypedPredicate;
  stopOutcomes: Array<"complete" | "exhausted" | "blocked" | "failed">;
};

type InvokeIntent = {
  id: string;
  chainId: string;
  chainVersion: number;
  mode: "once" | "each" | "batch";
  inputBindings: ValueBinding[];
  outputBindings: OutputBinding[];
  onItemFailure: "stop" | "continue" | "pause";
};
```

未在样本中走到的分支不能仅凭一次 history 证明。它必须引用另一条已验证子链、纯值条件和已验证能力，或保持 gap。loop 必须有上限、稳定键、累加方式和真实停止条件；“做 N 次”复用一个 loop body，不能展开 N 份图。

## 10. 确定性物化与状态生命周期

`HybridCompilation` 必须包含规范化的区段、控制图、coverage、gaps、证据和 digest：

```ts
type HybridCompilation = {
  mediaType: "application/vnd.bat.hybrid-compilation+json;version=1";
  compilerVersion: string;
  sourceDigests: string[];
  segments: Array<DeterministicSegment | ExplicitLlmSegment>;
  controlGraph: { entry: string; edges: TypedEdge[]; terminals: TerminalSpec[] };
  coverage: ActionCoverage[];
  gaps: CompilationGap[];
  canonicalDigest: string;
};
```

物化规则必须固定：

- 节点 ID 由 plan step、区段序号、区段种类稳定生成；
- 节点和 edge 按规范顺序排序；
- 每个失败、阻断、耗尽和人工等待出口显式存在；
- 子图和 invoke 固定版本；
- 技术预算由能力成本、循环上限和子链预算推导；
- 使用 canonical JSON 序列化后计算 digest；
- 物化过程不调用模型。

“唯一结果”指固定 trace、固定 Requirement/Plan/ControlContract、固定 accepted annotations、固定 registry 和 compiler version 得到同一 canonical digest。

状态只允许按证据前进：

```text
static_proven
  -> candidate
  -> sample_passed
  -> different_input_verified
  -> frozen
```

`static_proven` 只代表编译合同和 action coverage 完整。样本复跑发生在 candidate 之后，不能反过来作为 deterministic 分类的前置条件。任何代码路径不得从 history success 直接写 `verified` 或 `frozen`。

## 11. LangGraph Issues 工作示例

已确认测试任务的控制图是：

```text
navigate(repo)
  -> open Issues
  -> filter state=closed
  -> filter label=bug
  -> sort updated desc
  -> loop page <= 2 {
       read first 5 rows
       if page == 1: next page
     }
  -> select page=2, ordinal=1
  -> open detail
  -> read author + createdAt
  -> restore/list or finish according to plan
  -> emit result
```

Issue `#7479` 及其标题只是本次 history 的样本证据。它们不能进入 select 节点 target。筛选、排序、分页、ordinal 选择、跳转验证和字段读取默认应为 deterministic；只有 Requirement 明确要求对正文做开放语义分类或总结时才产生显式 LLM 节点。

真实证据只在忽略目录保存：

- 短历史：`data/upstream-browser-artifacts/0d64348d-f4d1-44d0-8000-cbbc62241eee/874566da-bd4e-4485-8b1b-dcde7e7df248-collect-filtered-issues/history.json`
  - SHA-256 `3f941f1dc9b95780dae7e2ca5fc9e8068b7c7c6334db7a29aabc69259e647577`
- 完整历史：`data/upstream-browser-artifacts/e76cc02e-4760-4901-8692-9579e02097d3/84974663-8e1b-4ef0-8c3a-a3910025cf99-collect-issues/history.json`
  - SHA-256 `9fbc88645c29c65155e2e235727d318f7a70e1e1accceda76eacda580197b69a`

开发必须从这些文件生成最小脱敏 fixture，并保存 source path、digest、redaction manifest 和预期 compilation。不得提交原始 history、截图或 Profile。

| fixture | 预期 |
| --- | --- |
| 完整 history + “第 2 页第 1 条”控制意图 | ordinal binding；图包含两页 loop；`#7479`/标题不进入 target；无 gap 后才能 candidate |
| 同 history + “打开标题 X”控制意图 | title 来自 Requirement；不能复用 ordinal binding |
| 旧 definition 直接导入 | `sample_value_leak`，拒绝 candidate |
| 删除任一成功 click 的 post observation | `missing_postcondition` 或 `missing_effect_proof` |
| 注入 `future_action` | coverage 保留该 action，并输出 `unsupported_action` |

## 12. 必须覆盖的测试

正向 fixture 至少证明：导航、筛选弹层、选项点击、排序、滚动、分页、详情、读取、返回/结束可形成完整 coverage 和稳定图。

反向 fixture 至少拒绝：

- 未知动作；
- 动作缺 post observation；
- 点击没有效果证明；
- 样本标题泄漏；
- 同一动作重复归属；
- 已执行副作用被排除；
- 计划缺少循环/分支意图；
- 无界候选或 LLM 直接返回浏览器动作；
- 普通节点持有模型句柄；
- 固定输入重复编译得到不同 digest。

验收还必须包含不同输入：改变仓库、筛选值、页数或 ordinal 后，链结构保持在声明的复用边界内，binding 值改变，具体样本标题不参与定位。

## 13. 硬停止条件

出现以下任一情况，停止实现并记录 gap 或重新选型：

1. 需要给公共代码加入 GitHub、Issue、商品、评论或固定页面文案；
2. 需要模型生成整图、浏览器动作、等待、selector 或重试；
3. 不能解释某个已执行动作的唯一归属；
4. 不能从 Requirement/Plan/ControlContract 证明 branch、loop 或选择语义；
5. 需要再写一套 browser driver、Agent loop、scheduler 或 checkpoint database；
6. 同一 fork 子系统已出现第二个独立核心缺陷，仍准备写第三个补丁而没有重新完成 Reuse Assessment。
