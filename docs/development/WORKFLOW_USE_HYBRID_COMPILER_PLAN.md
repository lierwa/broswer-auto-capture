# workflow-use fork 混合链路编译器开发计划

2026-09-16 当前修订：用户已否决独立规则 JSON 及前置投影方案，授权直接以详细自然语言任务进入 b-u。下文 PlanControlContract/用户确认 annotation 属于旧设计记录，不能阻塞新探索；新执行顺序见 [自然任务接线](evidence/browser-use-dom-tools/NATURAL_TASK_IMPLEMENTATION.md)。

日期：2026-09-16
状态：前置工具开发已授权，当前会话完成文档交接；H0/H1 通过，H2 局部修复已完成，H3–H6 未完成，H7 尚未开始。

当前执行顺序以 [DOM 前置工具开发计划](BROWSER_USE_DOM_TOOLS_IMPLEMENTATION.md) 为准：先做数据充足的动作工具及相关旧代码整理，再回归真实主线。24 类仅为覆盖清单；不再等待所有动作配套完成。结构/源码依据见 [DOM 交付设计](BROWSER_USE_DOM_HANDOFF_DESIGN.md)。本文后续 H0–H7 保留原阶段验收，不覆盖当前任务优先级。
决策：[ADR 0005](../adr/0005-workflow-use-fork-hybrid-compiler.md)
编译规范：[browser-use 历史到混合 TaskChain 的编译规范](WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)
旧路径处置：[workflow-use 旧路径处置与原子切换规范](WORKFLOW_USE_LEGACY_DISPOSITION.md)

## 1. 目标

把 browser-use 已成功完成且业务判定通过的代表任务，编译为参数化 TaskChain：可证明的页面操作成为普通节点；任务本身需要开放语义理解的区段成为显式 LLM 节点；证据、能力或控制意图不足时停止编译。

这项开发只解决 history → mixed TaskChain。Workbench 图编辑体验、Dify/Coze 产品形态、京东业务和完整平台重构都不能抢占本路线。

Product Alignment:
- natural-language task: 把任意已确认浏览器任务的一次成功探索编译为可验证、可复跑的混合任务链
- reusable chain boundary: 一个 TaskPlan 步骤对应一条参数化链路；重复输入复跑同一链路
- runtime inputs: Requirement/TaskPlan/PlanControlContract 声明的动态输入和上游节点输出
- dynamic task outputs: 普通能力或显式 LLM 节点产生且符合动态 Schema 的结果
- generic platform capability used: browser-use Agent/history、workflow-use fork、TaskChain、LangGraph
- replay model calls: 仅显式 `llm` 节点；普通节点没有模型句柄
- site/task-specific code added: no

## 2. 已证实的当前状态

- 当前 checkout 是 `master`，基线 HEAD `7242264bd3757a7ebe82514f9a17cb63e7bf614c`；不创建分支或 worktree。
- Aster/Beryl 和简单表单只证明旧接线可运行，不能证明通用转换。
- LangGraph Issues 历史实际包含筛选、排序、滚动、分页和详情；旧生成 definition 仍把“第 2 页第 1 条”写成具体样本标题。
- B-A-T 旧路径固定 `use_deterministic_conversion=False`，没有先比较两种上游模式。
- 上游 deterministic 是动作级机械翻译，不能单独恢复；上游 LLM conversion 让模型重写整图，也不能保留。
- 0003–0012 和 runner 改动是未提交诊断现场。不能继续叠加，也不能未经处置直接清理。
- 旧 v1 author/replay 仍有正式入口；仅删除 patch 文件不会让旧路径退出。

整体结论：**未完成/不通过**。下一任务的第一目标是建立可验证的转换合同和安全切换面，不是再跑一次真实网站。

## 3. 目标组件边界

```text
Confirmed Requirement + TaskPlan + PlanControlContract
                         |
           browser-use successful history
                         |
             Evidence Normalizer
                         |
       Coverage + Alignment + Binding
                         |
             Causal Segment Builder
                         |
        ordered classifier / gaps
              |                    |
      deterministic          explicit_llm
              |                    |
        capability/          typed semantic
      branch/loop/invoke       value only
              +---------+----------+
                        |
          canonical HybridCompilation
                        |
          deterministic TaskChain mapping
                        |
               LangGraph StateGraph
```

职责只有三层：

1. browser-use Agent/Browser 完成首次代表探索并提供 history；
2. 受管 workflow-use fork 负责规范化证据和产生 `HybridCompilation`；
3. B-A-T adapter 校验 artifact、物化现有 TaskChain、编排版本/运行/审计。

AI Connect 仍提供产品模型。新路径不使用 Pi/BrowserSkill 做首次探索，不复制浏览器驱动、Agent loop、LangGraph 调度器或数据库。

## 4. 不得变动的设计决定

1. 编译单位是需求语义区段，不是单个 action，也不是整段 history。
2. action registry 来自上游公开 schema；未知动作必须进入 coverage 并产生 gap，不能写手工白名单或跳过。
3. history 是执行证据；Requirement、TaskPlan 和 PlanControlContract 才是意图来源。
4. 现有 TaskPlan 不足以表达步骤内部 branch/loop，缺失部分必须由结构化需求或用户确认 annotation 补齐。
5. deterministic 同时证明 target、binding、effect、postcondition。
6. explicit_llm 只输出有界数据或候选稳定 ID，不控制浏览器，不生成图。
7. 固定输入和固定编译版本产生唯一 canonical digest；物化阶段零模型调用。
8. 状态按 `static_proven -> candidate -> sample_passed -> different_input_verified -> frozen` 前进。
9. LangGraph `StateGraph` 是唯一图执行引擎；一个产品运行只有一个实际 Browser。
10. v1 artifact 只读/可导出/不可执行；历史数据永不因切换被删除。

## 5. 阶段与通过门

### H0：保护证据和完成处置

目标：在动实现前把当前现场变成可审计输入。

- 核对 HEAD、dirty 和活动进程，不创建 branch/worktree，不清理或提交。
- 按旧路径处置规范给每个 dirty 文件、旧入口、测试和 patch 记录 keep/rewrite/remove。
- 核对两份 LangGraph history 的 path/digest，从原始 ignored 数据生成最小脱敏 fixture 和 redaction manifest。
- 将现有 v1 artifact/data 标为保留、只读、可导出。

通过门：处置表没有“以后再决定”；fixture 不含 Cookie/Profile/原始敏感页面；每份证据有来源和 digest。

### H1：在启动外部运行前退休旧执行入口

目标：防止新开发过程中旧 author/replay 继续污染状态。

- 集中拦截 v1 author、replay、resume、queue 和 invoke。
- 在启动 Python、Browser 或模型前返回 `legacy_workflow_use_v1_retired`。
- 同时请求旧/新 runtime 时返回 `mixed_browser_runtime_unsupported`。
- 保留 v1 decoder、查看和导出。

通过门：focused tests 证明所有旧执行入口零进程、零浏览器、零模型调用；历史仍可读取。

### H2：导入干净 fork 并冻结复用面

目标：以可追溯源码取代活动 patch 安装，不默认接受上游组件质量。

- 导入 workflow-use commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249` 到 `vendor/workflow-use/`。
- 保留 AGPL-3.0 LICENSE、UPSTREAM、导入日期、源码 digest 和本地 change log。
- 导入基线不得包含 0001–0012。
- 用源码和 focused behavior 分别评估 history/interacted element 读取、schema、action registry、普通 capability executor。
- 明确 browser-use 版本/lock、Python/macOS 和 Windows/分发未决门。

通过门：原始基线可逐文件复现；Reuse Assessment 明确公开 API、B-A-T adapter 和拒绝项；执行器最小能力在写 compiler 前确定。

### H3：规范化、对照和 fixture

目标：先把两种上游转换的事实变成测试输入，不让其中任何一种控制新设计。

- 用同一脱敏 history 离线运行/分析 deterministic 与 LLM conversion。
- 输出逐 action 覆盖、顺序、样本常量、模型调用、遗漏和不可执行步骤差异。
- 实现 `CompilationRequest`、`NormalizedTrace/Action/Observation`、action registry 和 coverage ledger。
- 为 13 类历史问题建立 fixture 或明确 rejection。

通过门：每个历史 action 唯一归属或明确 gap；未知动作、重复归属和副作用排除都失败；无需真实浏览器。

### H4：混合编译合同与分类器

目标：完成 alignment、binding、causal segmentation 和固定分类。

- 实现 Requirement clause / PlanControlContract 对齐。
- 实现四类 BindingDecision，拒绝 sample evidence 流入运行参数。
- 按编译规范处理 popup、wait/retry、scroll、pure read 和 cross-tab。
- 只产生 deterministic、explicit_llm 或 gap；能力缺失不变成 LLM。
- 实现 branch/loop/invoke 的来源、上限、稳定键、累加和失败策略。

通过门：同一点击标题 X 的 history 在“第 1 条”和“标题 X”两种需求下得到不同 binding；缺控制意图时拒绝；固定输入重复编译结果一致。

### H5：确定性物化现有 TaskChain

目标：把已校验 `HybridCompilation` 一对一映射到现有 IR。

- 稳定生成节点 ID、edge、错误出口、预算、嵌套图和 canonical digest。
- deterministic segment 映射 capability/branch/loop/invoke；explicit_llm 映射 `llm`。
- 普通节点无法取得模型句柄；materializer 不调用模型。
- 不扩张 `TaskChainRuntime`，不建立第二个 scheduler/checkpoint store。

通过门：同输入同版本字节稳定；graph reachability、循环上限、失败出口和模型审计合同通过。

### H6：原子产品切换和本地验证

目标：将 provider、protocol、authoring、artifact writer、runtime、setup 和恢复一次切到 v2。

- 按旧路径处置规范第 8 节一起切换。
- `setup-upstream-browser-runner` 改为 fork source/lock gate，不再应用 patch stack。
- 重写未提交 runner tests；删除任何“未知动作也可继续”的断言。
- 运行最小 fixture、sample 和 different-input；保留一个 Browser、finally、取消和模型审计。
- 做旧引用 allowlist；活动 author/replay/setup 命中必须为零。

通过门：产品正式入口生成 candidate、样本通过、不同输入通过；v1 只能查看/导出；没有 mixed runtime。

### H7：一次真实验收和最终去留

目标：用正常复杂度任务证明转换，而不是继续调试旧路径。

依次验证：

1. 已确认 LangGraph Issues 任务完整业务输出；
2. 改变仓库/筛选/页数/ordinal 中至少一个输入，同链复跑；
3. 一类非数据采集任务；
4. 声明的 LLM 次数与实际审计一致；
5. Browser 在 finally 关闭，无残留进程；
6. action coverage、结果 Schema 和完成条件全部通过。

H7 开始后禁止现场修改 patch、selector、提示词或预算再重跑。发现产品代码缺陷时退出验收，回到对应阶段修复并重新建立候选；同一 fork 子系统准备第三次核心修复时必须重新选型。若最终真实门仍无法通过，记录 `abandoned` 和证据，停止项目。

## 6. 失败处理

每次改代码前记录：

```text
Failure Analysis:
- expected invariant:
- observed evidence:
- responsible layer:
- root cause or falsifiable hypothesis:
- affected public contract:
- keep / rewrite / remove existing change:
- smallest validation:
- reuse decision impact:
```

没有定位责任层和旧改动处置时不能增加补丁。失败应修改造成问题的合同或组件，然后运行能证伪该假设的最小检查。

## 7. 开发会话阅读顺序

1. `AGENTS.md`
2. `docs/development/TASK_CHAIN_ARCHITECTURE.md`
3. `docs/development/WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md`
4. `docs/development/WORKFLOW_USE_LEGACY_DISPOSITION.md`
5. `docs/adr/0005-workflow-use-fork-hybrid-compiler.md`
6. 本文
7. `docs/development/PROGRESS.md`、`RESEARCH.md`、`ROADMAP.md` 顶部现行章节

历史 ADR 0004、旧 replacement 文档和 2026-09-15 `verified` 仅作证据，不定义当前实现方向。
