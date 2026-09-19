# ResultSpec / ResultBinding 开发计划

日期：2026-09-19  
状态：P1–P6 已实现并通过离线定点验证；2026-09-19 唯一一次新真实 GitHub B 在 E1 返回边界因 `schemaValue` 别名泄漏失败，缺口已离线修复，B 尚未通过

本文只描述下一阶段开发顺序和验收边界。记录投影、消费就绪和历史真实 B 证据见
[记录投影、消费就绪与任务结果](RECORD_PROJECTION_OUTPUT_RECIPE.md)，当前事实见 [PROGRESS](PROGRESS.md)。

## 0. 在总路线中的位置

项目主线只有一条：

```text
A 动作记录（已通过）
  → B DOM 定位与数据读取（当前阶段）
    → C 交互执行与异步顺序
      → D 复跑干扰、Function、多路 Branch 与显式单值 LLM
        → 组合验收
```

本文 P1–P6 全部是**关闭 B 当前缺口的内部开发包**，不是与 B、C、D 并列的新任务，也不改变上述主线：

- P1–P3 让需求草稿、计划和 B-U 预执行明确是否需要业务数据以及需要什么数据；
- P4–P5 把 B 已验证的读取结果连接为可复跑的 `ResultBinding`，并处理 B 验收所需的空列表路径；
- P6 是 B 的定点验证；随后真实 GitHub B 才是 B 的阶段验收。

ConsumerReadiness 已提前实现的部分只支撑 GitHub B 的分页/导航读取，它也是 C 的共享基础。B、C 当前已经完成；D 按 React 干扰实验站、Function、多路 Branch、显式单值 LLM 和独立验收重新规划，尚未开发。

## Product Alignment

- natural-language task: 用户提出任意浏览器任务；需求对话模型决定任务只需执行并核验完成，还是还需返回业务数据。
- reusable chain boundary: 每个计划步骤仍由一条参数化 TaskChain 实现；结果生产复用普通读取、数据、条件和分支节点。
- runtime inputs: 已确认需求、计划步骤输入、B-U 当前页面状态和上游步骤输出。
- dynamic task outputs: 仅数据任务具有版本化业务输出；仅执行任务只产生平台执行回执。
- generic platform capability used: 需求 Markdown、`TaskPlan`、`ValueSchema`、`ValueBinding`、现有 data/condition/branch 节点、LangGraph、hybrid 编译证据。
- replay model calls: 普通复跑为 0；只有计划明确生成的 `llm` 节点可以调用模型。
- site/task-specific code added: no

## Reuse Assessment

- capability: 从 LLM 生成的结果要求和一次真实 B-U 预执行，编译出可确定性复跑的最终结果来源。
- existing implementation in repository: `semanticPlanSchema` 已由计划 LLM 生成任务计划；`browserUseTask` 已把需求和计划传给 B-U；`natural_output.py` 已能从已验证读取生成直接字段绑定；`hybrid-output.ts` 已复用 `data.transform` 的 merge/assemble；公共 IR 已有 data、condition、branch 和 LangGraph 控制流。
- mature candidates and pinned versions: 继续使用当前 browser-use/workflow-use fork、Zod/Pydantic 合同和 LangGraph，不引入外部表达式或规则引擎。
- selected implementation: 需求草稿保留 Markdown 事实源；计划 LLM 增加可选 `ResultSpec`；E1 后编译器生成 `ResultBinding`。派生和分支复用现有 TaskChain 节点词汇，禁止新增结果公式解释器。
- reused public surface: `ValueSchema`、`ValueBinding`、`predicateSchema`、`data.transform`、branch 节点、control graph、terminal output。
- B-A-T-owned adapter and remaining gap: 把 `ResultSpec` 的逻辑产生步骤连接到已验证 E1 节点，验证路径、类型、顺序、证据和分支，再物化现有 IR。
- license/runtime/platform fit: 不新增依赖、进程、浏览器会话或持久化引擎。
- browser/runtime/state ownership conflicts: B-U 仍只拥有首次探索；B-A-T 拥有计划、编译、复跑和审计。
- replay model calls: 0，除显式 `llm` 节点。
- rejected candidates and evidence: 不按关键词判断输出；不要求所有任务输出；不恢复 draft `brief`；不创建 Excel/表达式语言；不从 E1 样本推断 count、常量或空列表行为；不让模型生成 CSS/DOM 绑定。
- focused validation: 合同/计划提示定点测试，ResultSpec/ResultBinding 编译测试，5/2/0 条记录与无输出任务运行测试，随后真实 GitHub B 的 E1/E2/E3/E4。

## 1. 已冻结的职责

### 1.1 需求草稿

需求对话 LLM 根据完整上下文生成 Markdown 草稿。草稿必须有一段“结果与完成”，清楚说明：

- 任务只执行并核验，还是返回业务数据；
- 数据任务要返回什么；
- 已知空集合、缺失项或不足数量时如何执行；
- 只执行任务用什么可观察事实判断完成。

不得增加关键词分类器。语义不明确时由 LLM 在草稿前继续询问用户。新草稿仍保持 `brief=null`；Markdown 是确认事实源。

### 1.2 ResultSpec

计划 LLM读取已确认草稿后生成结构化 `ResultSpec`：

- `execution`：没有业务数据输出；步骤输出合同为 `null`，只保留完成条件和执行回执。
- `data`：声明输出 schema、结果字段对应的逻辑产生步骤、类型化派生来源，以及边界流程对应的逻辑控制步骤。

结果产生步骤必须使用当前 TaskChain 已拥有的通用节点语义。浏览器来源先使用稳定逻辑引用，不能包含 E1 尚不存在的节点 ID。若需要新的语义推理，使用显式 `llm` 节点；不能用自然语言塞进普通运行器执行。

### 1.3 ResultBinding

E1 成功后，编译器把 `ResultSpec` 中的逻辑来源唯一连接到已验证节点，生成 `ResultBinding`。它只包含目标输出路径、公共 `ValueBinding` 和来源证明；不计算、不分支、不执行文本。

来源不唯一、类型不一致、引用顺序错误或缺少证据时必须形成固定编译缺口。禁止使用最终样本值作为运行常量兜底。

### 1.4 普通节点和执行回执

计数、筛选、排序、条件和空列表分支继续物化为现有 data/condition/branch 节点。当前 `ResultSpec.derivations` 仅允许把明确的数组来源降低为已有 `data.transform/count`；它不是公式语言。编译器负责降低为公共 IR，不得创建另一套 evaluator。

执行回执从运行状态和完成证据生成，永远不要求伪造业务输出字段。

## 2. 开发顺序

### P1：需求草稿明确结果形态

目标：让确认草稿成为用户和后续 LLM 共同看到的唯一语义来源。

改动：

1. 找到需求访谈系统提示和草稿质量校验，要求 Markdown 草稿包含“结果与完成”。
2. 明确禁止按关键词或网站类型判断；是否输出由需求 LLM 根据完整对话决定。
3. 明确新草稿继续写 `brief=null`，不恢复旧结构化 brief。
4. 增加两个提示/协议测试：动作型任务草稿、数据型任务草稿。

完成结果：Bilibili 播放任务的草稿明确“无业务数据、按播放状态完成”；GitHub 列表任务明确数据字段和空列表行为。

### P2：计划合同增加 ResultSpec

目标：计划 LLM 把草稿语义转成可编译但不绑定 DOM 的结果要求。

改动：

1. 在 `packages/contracts/src/task-chain/plan.ts` 增加版本化、可选的 `ResultSpec`，并保留旧计划读取兼容。
2. 在 `apps/api/src/task-chain/authoring.ts` 的 `semanticPlanSchema` 和计划提示中要求模型生成它。
3. `execution` 与 `null` 输出合同必须一致；`data` 与非 `null` 输出 schema 必须一致。
4. 结果产生/控制引用只复用已有通用节点语义和稳定逻辑 ID；不增加公式字符串、脚本或任意表达式。
5. 旧计划没有 `ResultSpec` 时可以展示，但新的自然来源编译必须报告明确缺口，不能猜补。

完成结果：计划本身能够回答“是否有业务输出、由哪些逻辑步骤产生、空列表走哪条流程”。

### P3：把 ResultSpec 传给 B-U 预执行

目标：B-U 按用户确认的完整计划获取正确结果和必要证据。

改动：

1. `browserUseTask` 生成的任务正文必须包含当前步骤的 `ResultSpec` 人类可读投影。
2. TypeScript `AuthorInput`、Python `AuthorInput` 和 `NaturalCompilationRequest` 传递同一份 canonical 结果要求及摘要。
3. action-only 步骤使用 `null` 输出；现有 `finish({})` 仍验证宿主累积结果，不允许模型绕过合同。
4. 不重新暴露 `bat_inspect_dom`、`bat_read_fields`、`bat_wait_for`、`bat_scroll_to`、`bat_summarize`。

完成结果：B-U 知道需要完成哪些浏览器动作、取得哪些业务数据及如何处理边界，但不负责生成 CSS 或最终真实节点绑定。

### P4：编译 ResultBinding 和边界控制

目标：从计划关系和 E1 证据得到唯一、可执行的结果来源。

改动：

1. Python 编译器读取 `ResultSpec`，把逻辑浏览器来源连接到 `verified_natural_read`/前序读取事实。
2. 直接字段继续复用当前 `natural_output.py` 的 schema、路径、digest 和唯一性校验。
3. `ResultSpec.derivations` 中声明的数组计数降低为已有 `data.transform/count`；其他普通派生/条件步骤继续使用 data/condition/branch IR；不新增 evaluator。
4. 空列表判断位于任何 `[0]` 路径解析之前；false 分支跳过详情导航和详情读取。
5. 两条分支汇合到同一个有类型的结果来源，再生成 `ResultBinding`。
6. action-only 步骤跳过结果绑定，terminal 使用 `null` 输出并保留完成证据。

完成结果：5、2、0 条记录均由同一计划产生正确控制流；0 条时不会访问第一条记录。

### P5：TypeScript 物化和双重校验

目标：模型或 Python 编译器不能绕过公共合同。

改动：

1. 在 `hybrid-schema.ts` 为 `ResultSpec` 摘要和 `ResultBinding` 增加严格 schema/digest 校验。
2. 在 `hybrid-materializer.ts` 重新校验计划身份、逻辑引用、执行顺序、schema、路径和证据。
3. 在 `hybrid-output.ts` 继续使用现有 merge/assemble；计算和分支使用现有 data/branch 节点与 LangGraph。
4. 不创建第二套图执行器、等待器、状态数据库或模型回退。

完成结果：编译产物只有通过 TypeScript 侧独立校验后才能成为 TaskChain。

### P6：最小验证

先运行能够覆盖本次不变量的定点测试，不运行根级全量测试：

1. 合同：旧计划可读；新 execution/data ResultSpec 的正反例。
2. 计划：LLM 语义计划必须包含一致的结果要求；不含关键词分类代码。
3. 编译：直接数组、多个读取来源、count、非空/空列表分支、来源歧义拒绝。
4. 物化：空列表不会提前解析 `[0]`；false 分支不包含详情浏览器动作。
5. 运行：action-only 返回 null 业务结果但执行回执完整；data 任务按输出 schema 返回。
6. 审计：普通复跑模型调用为 0。

所有新增代码继续满足单文件不超过 500 行、函数不超过 100 行，并更新 fork manifest 后调用真正的 `verifyForkSource` 导出函数验证。

## 3. 真实验收顺序

定点验证通过后，只启动一次新的真实 GitHub B，作为当前主线 B 的阶段验收：

1. E1：B-U 完成真实任务并形成完整业务结果、DOM/读取和消费就绪证据。
2. E2：编译无 gap，ResultBinding 每个 required 路径均有唯一来源。
3. E3：相同输入正式复跑，业务结果一致，模型调用 0。
4. E4：换记录数量不同的仓库；至少覆盖不足 5 条，最好直接覆盖第二页为空。
5. 空列表验收：不解析 `[0]`、不进入详情页、返回计划声明的无详情结果。

任一步失败必须区分产品缺陷、测试/夹具缺陷、环境阻塞和未验证假设。相同失败连续出现时停止补丁，重新检查 ResultSpec、证据连接或控制流设计。

## 4. 明确不做

- 不在平台代码写 GitHub、Issue、Bilibili、剧集或“前 5 条”等业务 special case。
- 不用关键词、正则或网站枚举判断是否需要输出。
- 不创建 OutputRecipe 公式语言、模板解释器或 `eval`。
- 不让普通复跑调用模型补齐来源或分支。
- 不把执行回执混成业务数据输出。
- 不重新运行旧真实 B artifact 来证明新逻辑；旧 artifact 没有新的 ResultSpec/DOM 事实。
- 不创建 worktree，不提交、不推送，除非用户另行授权。

## 5. 完成定义

只有同时满足以下条件，才能宣布三类问题闭环：

- RecordProjection/迁移 ReadSpec 在新 E1 中形成可用读取；
- ConsumerReadiness 在 E3/E4 中正确等待且动作只执行一次；
- action-only 与 data 两种 ResultSpec 均通过定点测试；
- 数据任务生成经双重校验的 ResultBinding；
- GitHub B 的 E1、E2、E3、E4 全部通过；
- E3/E4 普通复跑模型调用为 0。

这些条件只允许把主线从 B 推进到 C，不能同时宣布 C、D 或组合验收完成。
