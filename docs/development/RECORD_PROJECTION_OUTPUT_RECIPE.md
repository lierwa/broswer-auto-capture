# 记录投影、消费就绪与任务结果

日期：2026-09-19  
状态：消费就绪、双 DOM 宿主投影、前序读取值绑定和 ResultSpec/ResultBinding 已通过定点验证；真实 B/E1–E4 待验收

本设计服从[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md)。它统一解决三个相连边界：页面记录如何形成类型化节点输出、异步动作后何时允许下一个节点消费页面状态，以及多个节点输出如何形成最终任务输出。

## Product Alignment

- natural-language task: 首次 browser-use 探索取得页面数据并完成真实交互后，把页面关系和消费依赖编译为可跨输入复跑的结构化读取、异步就绪屏障及最终结果。
- reusable chain boundary: 一条记录投影规则读取一个页面范围内的同构记录集合；生产动作与下游目标/投影之间保存一个消费就绪合同；仅数据输出任务在探索后生成一份结果绑定。
- runtime inputs: 任务输入、当前页面作用域、可重新定位的结构目标、读取上限及上游节点输出。
- dynamic task outputs: 当前运行实际存在的记录、字段值、派生数据和最终任务输出。
- generic platform capability used: browser-use 页面/DOM 能力、现有目标重绑定、workflow-use `StepVerifier`/Tenacity、`ValueSchema`、`ValueBinding`、`data.transform` 与 `TaskChain`。
- replay model calls: 0；只有任务明确要求语义推断时，独立生成显式 `llm` 节点。
- site/task-specific code added: no

## Reuse Assessment

- capability: 从探索证据编译通用记录读取规则、由下游消费者反推异步就绪合同，并按最终输出契约确定性组装结果。
- existing implementation in repository: `read.py` 已有记录范围、相对字段、基数和 schema 校验；`postconditions.py` 已复用 `StepVerifier`/Tenacity 做有界事实重查且动作只执行一次；目标解析器已有稳定目标重绑定；`ValueBinding` 与 `data.transform` 已支持正式数据流和装配。
- mature candidates and pinned versions: browser-use 0.13.8 的完整增强 DOM、selector map、`DOMInteractedElement` 与 Actor Element；workflow-use 0.2.11 的 Agent/Tools 生命周期；浏览器原生 DOM 查询与 Mutation APIs。
- selected implementation: B-A-T 新增版本化 `RecordProjection`，从后续目标/投影机械生成 `ConsumerReadiness`；需求/计划 LLM 生成 `ResultSpec`，探索后编译器把它落实为 `ResultBinding`。普通计算与分支复用现有 TaskChain 节点，不建立结果公式语言、第二套等待器、数据流或图运行时。
- reused public surface: browser-use 负责首次探索和浏览器事实；Chrome 负责 DOM 关系与属性读取；LangGraph/TaskChainRuntime 负责正式节点、控制流和审计。
- B-A-T-owned adapter and remaining gap: 从有界真实 DOM 与最终业务结果推导结构目标、记录关系、字段投影及来源证据；把生产动作连接到第一个真实下游消费者；补齐少量安全的确定性派生数据操作。
- license/runtime/platform fit: 不新增运行时依赖；保持当前 TypeScript/Python/Windows 和既有许可证边界。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser、Agent、图调度器或结果数据库；所有观察绑定同一产品 Browser 会话和 document 身份。
- replay model calls: 0。
- rejected candidates and evidence: 不保存五个固定记录 DOM；不让模型提供 CSS、父子选择器、字段属性或等待类型；不以关键词或硬条件判断任务是否需要输出；不以 DOM 静止、network idle、URL 变化或固定 sleep 单独证明完成；不新增结果公式语言；不把本次样本值冻结为运行常量。
- focused validation: 受控页验证 5 条变 2 条、记录前插入普通兄弟、包装层变化、字段同节点多投影、可选字段缺失和歧义拒绝；随后执行真实 GitHub B 同输入及不同输入零模型复跑。

## 1. 术语与职责

### 1.1 记录投影规则 `RecordProjection`

把一个可重新定位的页面记录集合按 DOM 顺序投影为符合 `ValueSchema` 的对象或对象数组。规则保存结构关系和投影方式，不保存探索时的 browser-use index、backend node id、`dom-*` 引用或固定记录位置。

### 1.2 结果要求 `ResultSpec`

需求对话/计划 LLM 根据完整需求生成、用户确认的任务交付说明。它明确任务是仅执行并核验完成，还是返回结构化业务数据；数据任务同时说明字段意义、产生步骤和空集合等边界流程。它不包含 CSS、DOM 引用或探索时节点 ID。

### 1.3 结果绑定 `ResultBinding`

仅数据输出任务在探索成功后由编译器生成的确定性来源关系，把 `ResultSpec` 中的结果字段连接到已验证的任务输入、节点输出、运行变量或授权常量。计算和分支属于普通 TaskChain 节点，不属于结果绑定。

### 1.4 消费就绪合同 `ConsumerReadiness`

生产动作只负责执行一次；动作后的异步等待由下一个真实消费者定义。消费者可以是结构化读取、下一个交互目标或最终业务完成投影。编译器不判断“分页、筛选、导航、懒加载”等场景名称，只连接轨迹里已经发生的生产者和消费者。

### 1.5 编译证据与复跑规则

| 内容 | 归属 | 是否进入复跑规则 |
| --- | --- | --- |
| 本次页面 backend node、browser-use index、局部 DOM | 探索证据 | 否 |
| 字段实际值、节点父子关系、页面/document 身份 | 编译证据 | 仅保存脱敏摘要和引用 |
| 集合范围、记录关系、字段相对目标、投影方式 | `RecordProjection` | 是 |
| 生产动作、下游消费者、动作前基线和稳定读取 | `ConsumerReadiness` | 是 |
| 任务是否返回业务数据、字段意义及边界流程 | `ResultSpec` | 是 |
| 最终字段的已验证来源路径 | `ResultBinding` | 仅数据任务进入 |
| 样本最终输出 | 验证证据 | 否 |

## 2. 记录投影合同

以下为目标合同形状；正式实现使用 Zod/Pydantic 共享的有界 JSON 数据，不允许任意代码。

```ts
type RecordProjection = {
  contractVersion: "bat-record-projection/v1"
  scope: PageScope
  records: {
    root: RebindableTarget
    item: RelativeStructuralTarget
    order: "dom"
    limit: ValueBinding
  }
  nodes: Record<string, {
    relativeTo: "record"
    target: RelativeStructuralTarget
    cardinality: "one" | "many"
  }>
  fields: Record<string, {
    node: string
    projection:
      | { kind: "visible_text" }
      | { kind: "attribute"; name: string }
    valueSchema: ValueSchema
  }>
  outputSchema: ValueSchema
}
```

`RebindableTarget` 复用已经存在的 history/structure/semantic/locator 目标族；raw locator 只能由编译器机械生成、在当前页面反查并经变输入验证，不能由模型提交。`RelativeStructuralTarget` 只描述从记录节点到后代字段节点的有界关系：轴、标签/角色、稳定属性、祖先关系和结构摘要。

### 2.1 基数与顺序

- `records.order` 当前只允许 `dom`，保证结果顺序与页面可见顺序一致。
- `records.limit` 是 `ValueBinding`，可来自任务输入或需求授权常量；“前 5 条”表示 `take(5)`，不是五个固定目标。
- 实际命中少于上限时返回实际数量；超过上限时只取 DOM 顺序前缀。
- `cardinality=one` 必须恰好命中一个字段节点；`many` 返回 DOM 顺序数组并受字段 schema 的 `maxItems` 约束。

### 2.2 同一节点的多种字段投影

节点别名和字段投影分离。一个链接节点可以同时产生可见标题与 `href`，避免为相同节点重复生成定位规则：

```json
{
  "nodes": {
    "primaryLink": {
      "relativeTo": "record",
      "target": { "axis": "descendant", "role": "link" },
      "cardinality": "one"
    }
  },
  "fields": {
    "title": { "node": "primaryLink", "projection": { "kind": "visible_text" } },
    "detailUrl": { "node": "primaryLink", "projection": { "kind": "attribute", "name": "href" } }
  }
}
```

### 2.3 类型与格式

- `outputSchema` 是结果类型和结构的唯一权威。
- DOM 投影只负责原始可见文本或明确属性；不得在选择器中编码业务解析。
- 通用且安全的转换（trim、URL 解析、布尔/数字转换）必须是白名单投影或独立 `data.transform` 节点。
- 数字字段允许记录一次由全部样本共同证明的固定文本前后缀（例如 `#8059` 的 `#`），再执行严格数字转换；不接受正则、脚本或按样本分支。
- 空白规范化同样必须由两份快照和最终值共同证明；原始文本已经精确相等时保留原文，包括多行正文。
- 业务特定语义不能机械确定时，形成显式 `llm` 节点或编译缺口，不进入普通读取。

## 3. 记录投影的确定性推导

1. 在原生 `extract`/最终业务结果产生时，B-A-T 自动保存同一 document 的有界 DOM 事实；模型不调用证据工具。
2. 按最终输出 schema 和实际值查找字段候选节点。文本、链接和属性必须与真实值一致；无法唯一定位时保留候选集合。
3. 对同一业务记录的字段候选求有界最近公共祖先，形成记录节点候选。
4. 比较至少两条记录候选的父范围、结构摘要和字段相对路径，找到重复记录关系。
5. 删除只属于样本的 index、backend id、动态生成属性和具体兄弟序号；任务输入可绑定的值转为 `ValueBinding`。
6. 用候选 `RecordProjection` 重新读取当前页面，结果必须与原生业务输出逐字段、逐记录、逐顺序完全一致。
7. 保存规则、schema 和证明摘要；原始敏感 DOM 不进入 Git、长期日志或测试快照。
8. 只有一条样本、多个等价结构候选或字段无法唯一归属时，规则保持 candidate；不同输入验证前不得冻结。

该算法允许“值相同但节点不同”的歧义存在并显式失败，不能以首个匹配兜底。编译器可以使用多个字段联合确定记录归属，但不得跨记录拼接字段。

### 3.1 当前迁移切片

当前生产入口已经停止向探索模型注册 `bat_inspect_dom`、`bat_read_fields`、`bat_wait_for`、`bat_scroll_to` 和
`bat_summarize`，也不再启动第二轮模型补证。原生 `extract` 成功后，宿主在同一 document 的增强 DOM 中执行以下机械步骤：

1. 只接受有界的对象或对象数组 schema，以及标量/标量数组字段；
2. 以与提取值完全相等的可见文本或白名单属性寻找字段节点；相对 `href` 只有在浏览器原生 URL 解析后与输出一致时才使用 `resolveUrl`；
3. 要求每条记录存在唯一锚点，求字段节点的最近公共祖先，并跨记录生成不含样本序号的共同子路径；
4. 每次原生 `extract` 后连续捕获两份同页增强 DOM 快照；业务成功后才用最终输出反向选择候选。只有容器身份未变、两份快照读值一致且与最终业务值 canonical digest 完全相同才形成 `verified_natural_read`；
5. 重复值没有唯一记录锚点、字段多义、包装层关系不一致或反读不等时均不生成证据，后续编译保持缺口。

这一步消除了模型选择 DOM、CSS 和等待类型的随机性，但它仍是迁移适配层，不是最终 `RecordProjection` IR：当前持久化节点仍消费宿主生成并实读验证的
`ReadSpec`。正式结构目标必须在受控变结构与 E4 通过后替换该迁移载体，不能把当前 CSS 字符串宣布为冻结规则。

## 4. 消费者驱动的异步就绪

### 4.1 不是万能等待器

系统只提供统一验证框架，不提供统一完成信号：

```text
生产动作 A（执行一次）
  → 动作前基线／动作 token
  → 下游消费者 C 的就绪合同
  → C 使用通过校验的目标或投影
```

`MutationObserver`、轮询、浏览器事件和网络事件只能唤醒重查，不能单独作为成功证据。稳定窗口也只能防止渲染抖动，不能替代业务事实。

### 4.2 合同形状

当前实现先复用现有动作 `postconditions` 承载生产者与消费者之间的屏障，避免新增第二个等待运行时：

```ts
type ConsumerReadiness =
  | {
      kind: "read_fields"
      consumerRef: NodeId
      read: RecordProjection
      scope: PageScope
      ready: true
      settle: SettlePolicy
    }
  | {
      kind: "read_fields"
      consumerRef: NodeId
      read: RecordProjection
      scope: PageScope
      transition: true
      settle: SettlePolicy
    }
```

- `ready`：文档导航后不读取旧文档基线；等待消费者投影连续两次产生相同的合法结果。
- `transition`：动作前尝试读取同一投影；若基线可读，必须得到不同且稳定的结果；若消费者由动作创建，允许从“不可读”转换为稳定可读。
- 缺失可以等待；歧义、非法结构和无效选择器立即失败，不能当作“尚未加载”。
- 目标型消费者不需要另存场景条件；目标解析本身只对“尚未出现／作用域尚未到达”做有界重试，歧义立即失败。
- 输入/下拉动作完成后的控件值使用动作前保存的 Browser-Use history identity 在新快照中唯一重绑定；不要求控件必须有 `aria-label`，也不生成 CSS。固定时长 `wait` 若只位于下一条已编译目标动作之前，则作为探索脚手架归属于下一目标的有界解析，不成为复跑节点。

### 4.3 编译选择算法

1. 从成功轨迹中找到一个有副作用动作之后的第一个已验证结构化读取；遇到另一个有副作用动作即停止搜索，禁止跨动作错配。
2. 后续读取已经包含投影、schema、页面身份和字段来源；编译器直接引用它，不让模型选择条件或再次描述 DOM。
3. 导航动作生成 `ready`；同文档 UI/外部状态动作生成 `transition`。输入值、目标值和 URL 等动作自己拥有的直接事实可与消费者条件共享同一等待预算。
4. 下游读取没有形成正式节点、投影不一致或来源证据缺失时，生成固定编译缺口，不冻结候选。
5. 正式运行先取基线、只执行一次生产动作、反复读取消费者事实；超时失败，不重新点击、输入、提交或滚动。
6. 固定秒数等待没有独立业务结果；只有下一动作已经拥有正式可重绑定目标时才可从链中删除。没有消费者的等待仍保留编译缺口，不能全局忽略。

编译器在这里不理解网页业务语义。它只执行“相邻因果边 + 已验证消费者合同”的机械转换，因此新增网站异步行为不需要增加场景枚举；只有出现新的可观察事实类型时才扩展通用 IR。

### 4.4 可证明边界

- 中间状态即使短暂稳定，只要未满足消费者 schema、数量、值绑定或耗尽条件，就不能通过。
- “读取全部”必须有页面提供的耗尽事实或有界业务上限；无法证明终点时不能确定性编译。
- 动作后没有任何可观察消费者时，保持 `not_compilable`；模型说明、截图感觉或全局 DOM digest 变化不能补证。
- 编译结果只是 E2 候选；E3 同输入和 E4 不同输入均验证完成条件后才能冻结。

## 5. 任务结果合同

### 5.1 决策归属

任务是否具有业务数据输出，由需求对话/计划 LLM 根据完整语境决定，并在可确认草稿中明确展示；不得用“播放、获取、统计”等关键词或网站类型硬编码判断。草稿既供用户审阅，也作为后续计划 LLM 和 B-U 预执行的语义输入。

LLM 生成的是 `ResultSpec`，不是探索后的真实节点绑定。用户确认后它成为版本化计划的一部分：

```ts
type ResultSpec =
  | { mode: "execution" }
  | {
      mode: "data"
      schema: ValueSchema
      fields: Array<{
        path: ValuePath
        description: string
        producerRef: string
      }>
      derivations: Array<{
        producerRef: string
        operation: "count"
        sourceProducerRef: string
        sourcePath: ValuePath
      }>
      edgeCases: Array<{
        description: string
        controlRef: string
      }>
    }
```

以上形状表达职责，不要求另造一套结果表达式语言。`producerRef` 和 `controlRef` 引用稳定逻辑来源；当前唯一的确定性派生 `count` 明确引用一个数组字段，由编译器降低为已有 `data.transform/count`。筛选和真假分支仍使用 TaskChain 已有节点词汇。若某种语义只能由模型完成，计划必须声明显式 `llm` 节点。

### 5.2 仅执行任务

`mode=execution` 表示任务没有业务数据输出。步骤 `outputContract` 使用 `null`，成功与失败通过完成条件、运行状态和证据判断；面向用户的“已播放”“已提交”属于平台执行回执，不生成 `ResultBinding`，也不伪造成业务字段。

例如“播放《凡人修仙传》最新一集”只要求证明目标剧集、最新集和播放状态。它不进入本节的数据装配路径。

### 5.3 数据输出任务

`mode=data` 表示用户需要结构化业务结果。计划 LLM 根据已确认需求生成 schema、字段意义、产生步骤及边界流程；B-U 接收同一份计划完成 E1。探索成功后，编译器把计划中的逻辑产生步骤连接到本次已验证节点，形成 `ResultBinding`：

```ts
type ResultBinding = {
  contractVersion: "bat-result-binding/v1"
  schema: ValueSchema
  assignments: Array<{
    to: ValuePath
    from: ValueBinding
    producerRef: string
  }>
}
```

`ResultBinding` 只保存来源连接，不执行计算、不选择分支、不包含自然语言表达式。它可以引用任务输入、已完成节点、运行变量和需求授权常量。对象数组必须整体绑定，禁止把当前五条样本展开为五组固定索引。

### 5.4 派生和边界流程

派生值及条件流程由计划 LLM 明确声明，再物化为现有 TaskChain 节点：

- 数组计数使用 `ResultSpec.derivations` 的类型化来源关系，并降低为已有 `data.transform/count`；
- 提取、映射、筛选、排序和去重使用已有普通数据节点；
- 空列表与非空列表使用已有 `condition`/`branch` 和控制图边；
- 只有明确需要语义理解的结果才使用显式 `llm` 节点。

这不是 `ResultBinding` 的公式功能，也不增加一套 Excel/表达式语言。平台不需要穷举网站或任务类型；LLM 负责形成计划，编译器只接受公共 IR 能表达且有证据验证的部分。不能表达或不能证明时保留编译缺口。

空列表判断必须先于任何 `[0]` 数据路径解析。真分支才允许读取第一条记录并执行详情动作；假分支直接跳过详情动作并产生计划已声明的无详情结果。两条路径最后汇合到同一个有类型的结果来源。

### 5.5 生成与校验

生成顺序固定为：

1. 需求对话 LLM 在 Markdown 草稿中写明交付形态、结果字段和边界流程；不确定时向用户提问。
2. 用户确认草稿；计划 LLM 将其转换为带 `ResultSpec` 的版本化任务计划。
3. B-U 收到完整需求、计划、步骤输入及 `ResultSpec`，完成真实预执行和最终结果。
4. 宿主记录读取、动作、消费者就绪和最终结果事实。
5. 编译器将直接 `producerRef` 唯一连接到已验证节点；声明的 `count` 先降低为普通数据节点；随后生成只绑定来源的 `ResultBinding`。不得按样本值或字段名猜测来源。
6. TypeScript 物化器再次验证计划摘要、来源顺序、路径、schema 和证据后，复用现有 merge/assemble 节点。

数据任务冻结前必须满足：最终 schema 的每个 required 路径恰好绑定一次；来源和目标 schema 一致；父子路径不冲突；常量有需求或协议授权；派生节点可审计；E1 样本重算与最终结果一致。任一来源不唯一或边界分支未被计划表达时保持缺口。

## 6. GitHub B 的物化示例

需求/计划 LLM 先把 GitHub B 确认为数据输出任务，并在 `ResultSpec` 中描述列表、实际数量、详情及空列表流程。任务特有字段只存在于该任务版本的数据中。E1 后的示例节点：

```text
read-page1 ───────────────→ page1Issues
     └─ count-page1 ──────→ report.page1ReadCount
click-next ──transition(read-page2)──→ read-page2
read-page2 ───────────────→ page2Issues
     └─ count-page2 ──────→ report.page2ReadCount
     └─ branch-has-page2
          ├─ true → navigate-first-detail → read-detail
          └─ false → unavailable-detail
read-detail / unavailable-detail ─→ secondPageFirstIssueDetail
completion-status ────────→ report.executionStatus / limitations
authorized constants ─────→ report.filters
```

另一个仓库只有两条匹配记录时，`read-page1` 输出长度为 2，`count-page1` 输出 2；不存在第三至第五条固定绑定。第二页为空时先走 false 分支，不解析 `[0]`，也不执行详情导航。

## 7. 物化与运行时边界

- `RecordProjection` 物化为一个普通 `browser.read-fields` capability 节点的新版本；运行时只解析目标、枚举记录、相对投影并校验 schema。
- `ConsumerReadiness` 复用当前 `postconditions`/`StepVerifier`/Tenacity；目标消费者复用目标解析器的有界缺失重试。两者均不调用模型、不重复生产动作。
- `ResultSpec` 由计划 LLM 生成并进入 B-U 任务语义；`ResultBinding` 由编译器在 E1 后生成，不让模型编造真实节点 ID。
- 结果生产继续使用现有 `data.transform`、`condition`、`branch`、控制图和 LangGraph；不新增公式解释器或图执行器。
- 最终 terminal 只绑定已经通过输出契约校验的装配节点结果。

## 8. 迁移步骤

1. 已删除 authoring prompt 对五个 B-A-T 自定义工具的要求，并停止向模型注册这些工具。
2. 已把 DOM 事实采集移到原生 `extract` 回调旁的 B-A-T 内部记录器；连续两份同页增强 DOM 只在内存保留，不信任 extract 的自由文本/元数据，非 extract 页面事实仍需按消费者补齐。
3. 业务成功后从最终输出反向选择两份 DOM 都能唯一复现的最大投影，再保存宿主生成的 `ReadSpec`、多字段映射、受限文本转换和证明摘要；正式 `RecordProjection` 合同与结构目标仍待变结构验收后冻结。
4. 让读取 capability 消费结构目标和相对节点规则，不消费模型参数。
5. 已实现编译器以第一个已验证下游读取生成 `ready`/`transition`；目标解析只重试缺失，不重试歧义。
6. 已扩展现有 output assembly 的 `node`、`input` 和需求授权字符串 `constant`，完成一个读取节点映射多个输出字段、required 路径覆盖、唯一读取叶子跨输出复用及后续动作引用前序读取值。
7. 待实现：让需求草稿明确交付形态，让计划 LLM 生成 `ResultSpec`，并把它传给 B-U；不得按关键词硬编码是否输出。
8. 待实现：探索后生成 `ResultBinding`，把计划中的普通数据/分支步骤物化为现有 TaskChain 节点；空列表分支必须先于 `[0]` 解析。
9. 定点验证通过后只运行一次真实 GitHub B，再执行同输入 E3 和记录数量变化/空列表 E4。

## 9. 验收门

| 场景 | 必须结果 |
| --- | --- |
| 五条记录变两条 | 返回两条；无固定索引、无缺失第三条错误 |
| 记录前插入普通兄弟 | 记录集合及字段仍正确 |
| 包装层变化 | 结构目标可重绑定，或明确结构漂移；不得读相似节点 |
| 同字段文本重复 | 联合记录关系唯一定位，无法唯一时拒绝编译 |
| 一个节点提供文本和链接 | 两个字段引用同一节点别名并各自投影 |
| 多标签、空标签、可选字段 | 基数和 schema 语义准确，不把缺失转成空成功 |
| 输出数组长度变化 | 整体数组绑定，计数和最终 schema 正确 |
| 只执行、无业务数据 | 不生成 `ResultBinding`；完成条件与执行回执正常 |
| 需求语义决定是否输出 | 由 LLM 草稿和用户确认决定；不存在关键词分类代码 |
| 第二页为空 | 不解析 `[0]`、不执行详情动作，按计划产生无详情结果 |
| 动态派生状态 | 只由普通数据节点生成，零模型调用 |
| 点击后列表异步替换 | 动作一次；同一投影相对基线转换并连续稳定后读取 |
| 导航后异步渲染 | URL/文档事实成立；下游投影稳定可读，不读取旧文档基线 |
| 弹窗或新控件延迟出现 | 下一个目标只重试缺失；多个匹配立即失败 |
| 中间态短暂停留 | 未满足消费者合同不得通过；不以 DOM 安静或 network idle 兜底 |
| 同输入正式复跑 | 业务结果一致、模型调用 0、审计完整 |
| 不同输入正式复跑 | 绑定生效、数量变化正确、模型调用 0 |

## 10. 实现中仍需验证的边界

- `RelativeStructuralTarget` 最小字段集合及与现有 history/structure target 的共享方式。
- 原生 `extract` 返回值与 DOM 候选发生多义时，允许哪些机械联合消歧；不得引入新的模型工具循环。
- `ResultSpec` 中逻辑 `producerRef` 与当前计划步骤/预执行动作 ID 的最小共享标识；必须复用现有 IR，不得扩成第二套表达式语言。
- 需求草稿仍以 Markdown 为事实源；结构化 `ResultSpec` 由计划 LLM 生成，不能恢复已废弃的 draft `brief` 执行合同。
- frame、open shadow root 和虚拟列表的独立作用域表达；closed shadow root 保持显式不支持。

以上决策必须先在受控多结构样本上验证，再更新本文件状态或形成 ADR。
