# 正式复跑恢复与链路工作台开发基准

日期：2026-09-21  
状态：已确认设计基准；Windows 正式 I7 与新需求 v3 闭环已通过，详见下方状态更新  
适用 checkout 基线：`master@7d59036332a66de8991744659d2317da126c6123`，但开始开发时必须重新核验实际 checkout、branch、HEAD 和 dirty work  

> 2026-09-22 状态更新（[本轮证据与待办](PROGRESS.md#当前状态)）：正式 I7 已通过，包含真实修订 chain v6 / release v5、4 次零 LLM 普通复跑、清理故障同 execution 恢复及重启；证据为 `work/i7-final-product-1790011932163/result.json`。
> 真正需求回流已产生 v3 并保留旧历史，证据为 `work/i7-requirement-return-1790012443299/result.json`；R1 unique / multiple / none 三分支均已通过，具体路径见 PROGRESS。
> 02:11 新需求 v3 闭环通过：`work/i7-reprepare-1790013905749/result.json` 保存正式准备、sample / verification、release v6 发布及工作台普通复跑，三次运行均 completed / cleanup confirmed / llmCalls=0；同目录 `source-reuse-audit.json` 证明零重探索、仅一次缺失函数注解。当前 fork `44453845`。Windows 本轮 R1–R5 / I7 正式产品门关闭；macOS arm64 仍延期未测，约 48 秒普通点击的内部性能根因尚未定位。下文实施前问题与差距保留为历史快照，已确认设计继续有效。

本文是 2026-09-21 起正式复跑恢复与链路工作台开发的唯一实施基准，针对同一次产品闭环复盘暴露的三个相互关联问题：

1. 发布链路的所有节点和 `TaskRun` 已经成功完成，但上游 runner 清理退出码为 1，外层把清理异常改写成“确定性链路失败、可模型修复”，导致产品不能再次运行；
2. 链路画布把内部 IR、所有技术出口和原始 JSON 直接展示给用户，固定两列坐标造成交叉，节点及详情无法解释任务实际在做什么；
3. 运行主操作散落在左侧任务列表，链路画布只是静态查看页；用户点击任务或运行后没有与本次 execution 绑定的即时反馈和实时运行流。

这不是一次错误字符串映射或 CSS 调整。根因是产品缺少两个明确边界：

- 链路运行结论、执行生命周期和资源清理结论没有独立合同；
- 不可变 Chain IR、单次 execution 运行事实和用户可读链路运行台之间没有稳定的展示投影与交互合同。

本文不受代码文件 500 行限制；它必须足以让全新 session 在不依赖聊天记录的情况下继续开发。实现仍必须遵守代码文件不超过 500 行、函数不超过 100 行、嵌套不超过 3 层。

2026-09-21 实施前历史快照（保留当时事实，不代表当前实现状态）：

| 范围 | 当时事实 | 当时状态 |
| --- | --- | --- |
| 正式复跑 | 链路与 1/1 计划步骤已完成，runner 清理异常被误判为可修复链路失败 | 根因已核验，生产修复未实现 |
| 链路修订服务端 | 草稿、operation、checksum、executable digest、聚焦验证和不可变发布已有基础 | 保留并扩展，不推倒重写 |
| 链路展示 | 固定两列、跨运行事件拼接、原始 JSON 详情不可读 | 生产实现未通过 |
| 交互方案 | 阶段总览、单个临时动作摘要、同画布聚焦编辑已形成 React Flow + Dagre 隔离原型 | 原型已确认，不等于生产完成 |
| 正式闭环 | R2、R3、R5 因本次复跑和画布问题重新打开 | 必须按 I1 → I7 重新实现与验收 |

原型事实位于 `apps/workbench/prototype.html` 与 `apps/workbench/src/prototype/`。实现时必须复用其已经确认的信息层级和交互语义；可以根据真实合同调整组件拆分与视觉细节，但不得退回永久展开子链、大容器子画布、原始 JSON 首屏或列表暗中运行。

## 1. 权威关系与当前结论

本文补充而不取代以下基准：

1. [项目工程规则](../../AGENTS.md)
2. [自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md)
3. [需求对话、任务准备与链路修订产品基准](REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md)
4. [产品最小闭环开发基准](MINIMUM_PRODUCT_LOOP.md)
5. [ADR 0008：区分需求、准备、运行完成与用户验收](../adr/0008-separate-requirement-preparation-run-and-acceptance.md)
6. [ADR 0009：区分链路运行结论与运行资源清理](../adr/0009-separate-chain-outcome-and-runtime-cleanup.md)
7. [ADR 0010：链路工作台是直接运行与实时观测入口](../adr/0010-chain-workbench-is-live-run-surface.md)

冲突处理：

- 旧文档写“R1–R5 已通过”“真实任务可连续复跑”时，以本次正式第三次复跑的最新证据为准：历史两次成功保留，但稳定可复跑和 R5 产品闭环重新打开。
- 旧实现把最后抛出的清理异常投影为确定性链路失败时，以 ADR 0009 为准。
- 旧画布把固定坐标或原始 JSON 当成 R3 完成时，以本文的画布可读性、展示投影和节点详情退出条件为准。
- 旧产品把任务列表主操作当成复跑入口、把链路图当成只读技术详情时，以 ADR 0010 的链路内运行、即时反馈、单次 execution 绑定和实时运行流为准。
- 本文不重新讨论已经确认的需求对话、搜索能力、准备边界、普通复跑零隐式模型调用、不可变版本和用户验收设计。

## 2. 开发规范提炼

以下规则是本迭代的硬约束，不是建议。

### 2.1 产品与领域边界

- B-A-T 是通用浏览器任务编译与执行系统，不为网站、剧集、商品、评论、表单或任何任务样本增加生产 special case。
- 任务实例名称、页面文案、业务字段、CSS class 和具体 URL 只能存在于版本化需求、计划、链路数据或测试样本，不能进入平台分支。
- 需求对话负责“做什么”，准备负责“怎么做”，正式运行负责执行发布链路，用户验收负责判断是否符合预期。
- 正式运行不得在合法终点后追加全局语义 judge；真实节点、合同、浏览器、预算、取消和资源生命周期错误仍必须保留。
- 普通复跑不调用模型，显式 `llm` 节点除外。手动编辑节点和资源清理都不构成模型修复授权。
- 已发布需求、计划、链路、release 和历史运行不可覆盖；修订形成新不可变版本。

### 2.2 根因优先，禁止撞运气补丁

- 修改前先用 CodeGraph 查询定义、调用链和影响面；只有具体字符串、历史记录和已知文件内容使用 `rg` 或定点读取。
- 不得仅为 `upstream_cleanup_unconfirmed:1` 增加字符串分支。新运行必须使用类型化清理合同；旧字符串只能存在于隔离的只读兼容适配层。
- 不得通过忽略非零退出码、无条件标 completed 或允许并发新运行掩盖资源占用。
- 不得只调整现有画布坐标、边类型、CSS 或增加前端定时动画来宣称画布已修复。必须先建立单次 execution 运行合同、链路阶段投影和编辑器适配边界。
- 不得把链路阶段和动作子图维护为两套图，也不得把全部动作常驻在撑大主图的阶段容器中。总览、临时摘要和聚焦态必须引用同一 TaskChain 节点与边。
- 不得把任务行点击或 session 选择暗中当成运行；任何异步交互必须在同一渲染周期进入明确 busy 状态，随后显示 accepted、settled 或 error。

### 2.3 服务端事实先于 UI

实现顺序固定为：

1. contracts 和术语；
2. 清理报告、错误类型和持久化；
3. 执行与产品状态投影；
4. 运行命令的 accepted execution 回执、幂等和事件续接；
5. 结果页恢复操作；
6. 链路运行台、分层展示投影与开源编辑器适配；
7. 节点详情与修订体验；
8. 正式产品入口验收。

UI 不得先用本地状态伪造 `cleanup_required`、成功结果或版本事实。

### 2.4 复用与依赖

- 节点、连线、端口、选择、重连、视口和缩略图继续复用现有 `@xyflow/react@12.11.6`；阶段总览和聚焦动作子图的初始有向布局复用 `@dagrejs/dagre@3.1.1`。B-A-T 不自行重写这些通用基础设施。
- FlowGram/Coze 继续作为交互与视觉参考，不作为生产编辑器依赖。其官方容器示例依赖大子画布和展开后显示内部节点，与“不常驻子路径、不把子图塞进阶段容器”不一致；其 document/form/history/variable 状态所有权也会与服务端 revision 事实源重叠。
- ELK 是更重的布局计算引擎，不是链路编辑器。阶段总览和聚焦子图分别布局后，Dagre 已覆盖当前有向图不变量；没有证据时不再引入 ELK。
- capability descriptor 提供节点标题、摘要、类型化编辑字段、目标要求、端口、兼容替换和验证支持；未知 capability 只读，不用递归 JSON 表单兜底。
- runner 清理继续复用 Node `ChildProcess`、现有 Windows 精确 PID 树终止和 browser-use 的公开 Browser close/kill；第三方进程杀手不能替代所有权、持久化和清理确认，因此不为此新增第二个进程管理框架或 CDP 客户端。

参考：

- [Coze Studio](https://github.com/coze-dev/coze-studio/blob/main/README.md)
- [FlowGram.AI](https://github.com/bytedance/flowgram.ai)
- [FlowGram loop container](https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/nodes/loop/index.ts)
- [FlowGram loop expand/collapse](https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/utils/toggle-loop-expanded.ts)
- [React Flow layouting](https://reactflow.dev/learn/layouting/layouting)
- [React Flow performance](https://reactflow.dev/learn/advanced-use/performance)
- [React Flow Sub Flows](https://reactflow.dev/learn/layouting/sub-flows)

### 2.5 数据、安全与所有权

- 一个产品运行只能拥有一个实际浏览器控制会话。
- 只操作本次 execution 明确拥有的 runner PID、浏览器树和临时目录；禁止按进程名清理，禁止连接或关闭用户日常 Chrome。
- 持久浏览器 Profile 不是临时资源，清理 runner 时不得删除 Profile。
- Cookie、密码、验证码、Profile 内容、原始 DOM、截图正文和页面敏感文本不得进入 Git、普通日志或测试快照。
- Workbench 只接收脱敏清理摘要；PID、临时目录绝对路径和内部异常栈留在受控服务端审计中，不直接投影给用户。

### 2.6 工作区与交付

- 当前工作区有大量既有未提交改动，全部保留。
- 未重新获得用户授权前，不得 reset、clean、checkout 覆盖、创建 worktree、修改相邻项目、提交、推送或关机。
- 每个迭代包只运行覆盖其真实不变量的最小验证；不得重复全量测试或旧七项流程碰运气。
- 自动验收默认 headless，不启动抢焦点的可见浏览器；需要人工登录或验证码时恢复同一运行并等待用户。
- 每个迭代包完成后更新 `PROGRESS.md`，明确通过、失败、阻塞和未测，不得把局部类型检查写成产品闭环通过。

## 3. 已核验的问题证据

### 3.1 正式复跑事实

任务：`e99c66f6-873e-40cf-a1c9-bebca8d05540`  
release：`eefe5eb7-a4be-42f2-836b-66867d67ecd9` v1  
失败 execution：`d5a86b0c-a30b-48ef-8a0c-6e7f92c5daa6`  
对应 TaskRun：`5f6abc37-6108-459c-8c4f-3337753e5040`

持久化事实：

- execution 最终为 `failed`，原因 `运行失败：upstream_cleanup_unconfirmed:1`；
- execution 的 1/1 计划步骤已经 `completed`；
- TaskRun 为 `completed`，实际到达 completed terminal；
- 5 个节点转换全部成功；
- 消费 6 个浏览器命令；
- `llmCalls=0`，没有模型调用；
- 产品投影错误进入 `needs_repair / repair`，因此普通“再次运行”不可用；
- 此前两个正式 execution 的历史 completed 事实保留，但不能证明之后的复跑稳定性。

当前没有发现遗留 runner/Chrome，浏览器状态也没有待清理 owner。这只能证明诊断时没有残留，不能证明失败时的清理过程可靠。

### 3.2 直接代码路径

当前清理失败传播如下：

```text
TaskPlanExecutor.execute
  -> TaskRuntimeHost.group
  -> PythonUpstreamBrowserRuntime.withCapabilities
  -> withHybridCapabilities
  -> work(...) 已经完成并保存 TaskRun completed
  -> finally RunnerProcess.close()
  -> child exitCode = 1
  -> throw Error("upstream_cleanup_unconfirmed:1")
  -> TaskPlanExecutor 通用 catch
  -> failed / deterministic / execution_failed / repairable=true
  -> TaskProductService.project
  -> needs_repair / repair
```

关键文件：

- `apps/api/src/upstream-browser/service.ts`：`RunnerProcess.close()` 忽略 close request 的具体失败，随后只按进程退出码抛字符串异常；异常发生在临时目录删除之前。
- `apps/api/src/upstream-browser/hybrid-runtime.ts`：`withHybridCapabilities()` 在 `finally` 中直接 `await runner.close()`，清理异常可以覆盖成功返回值。
- `apps/api/src/task-chain/plan-executor.ts`：未知异常统一成为可修复的确定性失败。
- `apps/api/src/task-chain/execution-result.ts`：`repairable=true` 直接产生 `nextAction=repair`。
- `apps/api/src/task-chain/product.ts`：最新失败含 repairable evidence 时投影为 `needs_repair`。
- `apps/api/python/browser_use_runner/hybrid_main.py`：close 请求内执行一次 `Runner.close()`，主循环 `finally` 又执行一次；`capability.close()` 或 `browser.kill()` 的具体失败没有可靠返回给产品。

当前证据能确认“清理阶段 runner 退出码为 1”，不能确认具体是哪个 Python 清理动作失败。实现不得伪造更细根因；I2 必须先补齐脱敏阶段证据，再修实际清理故障。

### 3.3 画布事实

- `apps/workbench/src/taskChainProjection.ts` 按数组序号把节点放进固定两列，坐标与边无关。
- 默认展示所有成功、缺失、超时、阻断、人工、失败、取消等边；多个节点共享终态，形成密集交叉。
- 节点主文案是 `node.label + capability@version + event.status`；当前真实链节点 label 为 `s-a-0001` 一类内部 ID，不能说明任务动作。
- `NodeDetail` 直接 `JSON.stringify(node)` 并平铺最近 12 条原始事件。
- 修订草稿已有服务端 revision、checksum、executable digest、不可变候选、验证和发布事实；问题不是“没有编辑功能”，而是没有可读展示层和合格的编辑信息架构。
- 修订草稿布局仍用固定两列生成；发布后的布局没有作为匹配已发布 chain reference 的展示来源稳定复用。

### 3.4 运行入口与反馈事实

- `apps/workbench/src/main.tsx` 的任务行选择只调用 `model.select(id)`；它不会打开链路运行台，也不会产生可见的运行反馈。
- 当前运行命令由左侧列表或独立 `TaskRunDialog` 触发，`useTaskRunner` 的 busy 状态只覆盖 HTTP POST；服务端接受运行后只触发任务模型 reload，没有把新 execution 交给链路画布。
- `TaskWorkspace` 与 `ChainView` 没有接收 runner 或 active execution；用户无法在正在查看的发布链上确认输入、启动并观察同一次运行。
- `LiveChain` 当前按节点从所有匹配 `TaskRun` 事件中取得最后状态，没有明确选择一个 execution。把这组状态做成动画会把不同运行拼成一条伪运行流。
- 因此根因不是“缺一个按钮”或“轮询频率不够”，而是运行命令回执、execution 身份、事件续接和画布投影尚未形成一条产品合同。

### 3.5 根因、影响与正确修复层

| 现象 | 已核验根因 | 产品影响 | 正确修复层 | 明确禁止 |
| --- | --- | --- | --- | --- |
| `upstream_cleanup_unconfirmed:1` 后不能复跑 | `work()` 已返回成功，`finally` 中 `RunnerProcess.close()` 仅按退出码抛普通 Error，外层通用 catch 将其归为 `deterministic / repairable` | TaskRun completed 被产品误投影为链路失败，错误出现模型修复入口 | ExecutionCleanup 合同、runner close 报告、execution 生命周期投影 | 匹配错误字符串后强行 completed、吞掉 close 错误 |
| 链路图交叉且看不懂 | flat TaskChain 直接投影、固定两列坐标、全部出口平铺，没有版本化链路阶段 | 用户不能理解任务顺序，也无法安全定位局部修订范围 | ChainPresentation/ChainStage 服务端事实、React Flow adapter、Dagre 分层布局 | 继续调固定坐标、把子链永久塞进大节点 |
| 节点详情是 JSON 墙 | capability 没有产品编辑描述，UI 递归展示任意 config | 不知道能改什么、改后会影响什么，也无法形成验证闭环 | CapabilityDescriptor registry、上下文编辑器、聚焦验证门 | 给所有 capability 做通用 JSON 编辑器 |
| 点击任务或运行无明确反馈 | 运行 POST 不返回并绑定 active execution；画布跨运行聚合事件 | 用户无法确认是否启动，也看不到真实运行流 | accepted execution 回执、幂等 requestId、按 execution/sequence 续接 | 用前端动画或刷新列表冒充运行流 |

四项修复必须按服务端事实顺序推进。清理故障不是链路编辑问题；链路展示问题也不能靠修好 runner 自动消失。它们只在最终产品入口共同闭环。

## 4. 目标领域模型

### 4.1 三层事实

| 层 | 权威事实 | 可以改变什么 | 不能改变什么 |
| --- | --- | --- | --- |
| 链路运行 | `TaskRun`、节点事件、输出、terminal、消费与模型审计 | 记录实际图执行结果 | 不能被 close 退出码或用户满意度覆盖 |
| 执行生命周期 | `TaskExecution` 的步骤编排、等待、取消和最终闭合 | 在资源清理确认后从待清理闭合 | 不能重写 TaskRun 节点事实 |
| 资源清理 | 本 execution 所属 runner/browser/temp 的结构化清理报告和尝试 | 阻止资源冲突、触发核验清理 | 不能授权链路修复或模型调用 |

### 4.2 状态语义

`TaskRun.status` 继续表达图执行结果，不新增清理状态。

`TaskExecution.status` 增加 `cleanup_required`：

- 当计划步骤尚未完成时，按既有 running/waiting/blocked/failed/cancelled 语义处理；
- 当所有计划步骤和业务输出已经成立，但任一运行资源释放未确认时，状态为 `cleanup_required`；
- 清理确认后，同一 execution 闭合为 `completed`；
- 清理失败尝试追加到清理审计，不把 execution 改成 `failed`；
- 若业务执行本身失败且清理也未确认，业务失败保持主结论，同时产品优先要求清理资源，清理后再显示原业务下一步。

`TaskProductProjection` 增加：

- status：`cleanup_required`；
- primaryAction：`cleanup`。

`TaskExecutionResult.nextAction` 增加 `cleanup`。清理期间不显示“调整链路”“授权模型修复”作为主恢复操作；历史链路和结果仍可只读查看。

### 4.3 清理合同

公共合同只保存脱敏聚合事实，不暴露内部资源地址：

```ts
type ExecutionCleanup = {
  status: "not_recorded" | "pending" | "confirmed" | "unconfirmed"
  attempt: number
  code: string | null
  evidenceDigest: string | null
  updatedAt: string | null
}
```

要求：

- 历史 execution 缺少字段时解析为 `not_recorded`，不能虚构 `confirmed`；
- 新正式 execution 在启动资源前写 `pending`；
- 正常 close 后写 `confirmed`；
- close 请求、runner 退出、进程树、浏览器或临时目录任一无法确认时写 `unconfirmed`；
- 服务重启后遗留的 `pending` 必须先按 owner token 核验；在确认资源已释放前按待清理状态阻止新运行，不能把进程重启当成清理成功；
- 具体阶段证据保存于服务端清理审计，公共摘要以 digest 绑定；
- cleanup 状态变化必须递增 execution sequence 或独立乐观并发 token，避免重复按钮产生并发清理；
- 旧 `upstream_cleanup_unconfirmed:*` 只允许在 legacy read adapter 中解释，不能成为新状态机条件。

如现有 `TaskExecution` 单体字段无法安全保存追加审计，可以增加一份一对一 execution cleanup 记录；不得同时让 execution body 和新表都成为清理状态权威。实施前选择一个事实源，并在合同测试中证明重启后唯一。

### 4.4 清理错误类型

新增领域错误应携带结构化 report，例如 `RuntimeCleanupRequiredError`，至少包括：

- execution/owner 关联；
- 已尝试阶段；
- 哪些阶段确认完成；
- 哪个阶段未确认；
- 安全错误码；
- 是否仍检测到受本次运行拥有的活动资源；
- 证据 digest。

不得把 Python traceback、页面数据、PID 或绝对路径作为面向用户的 reason。

### 4.5 链路展示合同

展示层不修改 `TaskChain` 的执行语义。新增版本附属的 `ChainPresentation`，由服务端创建、校验、持久化，并按精确 chain id/version 读取：

```ts
type ChainStage = {
  id: string
  title: string
  summary: string
  nodeIds: string[]
  entryNodeId: string
  exits: Array<{
    id: string
    label: string
    sourceNodeId: string
    sourcePort: string
  }>
}

type ChainPresentation = {
  contractVersion: number
  chain: { id: string; version: number; digest: string }
  stages: ChainStage[]
  overviewLayout: Array<{ stageId: string; x: number; y: number }>
  focusLayouts: Array<{
    stageId: string
    nodes: Array<{ nodeId: string; x: number; y: number }>
  }>
  descriptorRegistryVersion: string
  presentationDigest: string
}
```

字段名可以在实现时按现有 contracts 风格调整，但以下不变量不可改变：

- 一个发布版本中的每个非 terminal 执行节点必须且只能属于一个阶段；旧链没有展示事实时只能派生一个明确的“未分组动作”只读阶段，不能按 label、网站或坐标猜业务阶段。
- 阶段 `nodeIds` 在真实 TaskChain 中存在，并从 `entryNodeId` 沿阶段内部边可达；阶段外入边只能进入逻辑入口。
- 所有跨阶段出边必须由 `exits` 以真实 `sourceNodeId + sourcePort` 声明；阶段图的分支和回边从真实边派生，不能另存一套可漂移连线。
- 阶段自身不进入 LangGraph，不产生节点事件，不消耗预算；阶段运行状态只聚合所选 execution 中真实节点状态。
- `presentationDigest`、阶段分组和手动布局进入 revision checksum；它们不进入 executable digest。可执行节点、边、值绑定或 capability 配置变化才改变 executable digest。
- 自动布局、临时动作摘要、当前聚焦阶段、视口和选中项是可重算或本地状态，不进入任何发布 digest。
- 发布后 `ChainPresentation` 与新 chain reference 一起不可变；旧版本和历史运行继续解析原 presentation。不得只按“最新布局”覆盖历史版本。

### 4.6 Capability Descriptor 合同

`ChainNode` 保持通用执行合同；产品编辑能力由按 `capability.name + capability.version` 精确匹配的 descriptor registry 提供：

```ts
type CapabilityDescriptor = {
  capability: { name: string; version: number }
  descriptorVersion: number
  family: string
  displayName: string
  editableFields: Array<{
    path: string
    label: string
    control: "text" | "number" | "boolean" | "select" | "binding" | "browser_target"
    required: boolean
    options?: Array<{ value: string; label: string }>
  }>
  targetMode: "none" | "saved_browser_target" | "live_browser_picker"
  ports: Array<{ name: string; role: "primary" | "decision" | "exception"; label: string }>
  replacements: Array<{ name: string; version: number; label: string }>
  validationScope: "structural" | "node" | "node_and_downstream" | "whole_chain"
}
```

要求：

- descriptor 只认识平台通用能力、字段和端口，不认识网站、剧集、商品、页面文案或 CSS class。
- UI 不根据 capability 名称散落 `if/else`。服务端/共享 registry 是标题、摘要、表单、替换兼容性和验证范围的唯一来源。
- exact descriptor 缺失时节点保持可读只读；不得开放递归 JSON 编辑器或猜测字段语义。
- `browser_target` 通过 B-A-T 专用浏览器中的受控目标选择工具形成稳定目标事实，用户不填写 selector。
- “修改字段”和“替换动作”是不同 operation。替换动作必须重建类型化 config、目标要求和端口，不允许遗留旧 capability 的无效字段。
- 任何 executable operation 都立即使 candidate validation 失效；发布按钮保持禁用，直到服务端按 descriptor 的 `validationScope` 完成聚焦验证并证明受影响阶段出口可达。

### 4.7 修订 checksum、digest 与验证关系

```text
revision checksum
  = executable chain snapshot
  + ChainPresentation
  + ordered revision operations

executable digest
  = executable nodes + edges + contracts + bindings + budgets

presentation digest
  = stages + published overview/focus layout + descriptor registry reference
```

- 仅拖动节点、切换布局方向或重分组阶段：更新 checksum/presentation digest，执行验证保持原状态，但必须通过展示结构校验。
- 修改动作、输入绑定、输出绑定、边、端口或 capability：同时更新 checksum 和 executable digest，并使执行验证失效。
- 聚焦验证范围从被修改节点向必要下游扩展，至少到所属阶段具名出口；若上游现场无法安全重建，服务端明确要求从更早阶段或整链验证。
- 发布始终创建新的不可变 chain/presentation 版本；即使 executable digest 与旧版相同，也不得覆盖旧版布局或阶段事实。

## 5. 上游 runner 清理设计

### 5.1 Python close 必须幂等

`Runner.close()` 改为单一幂等清理任务：

- 第一次调用创建并缓存 close task；并发或后续调用等待同一 task；
- 按顺序关闭 capability，再关闭 browser；每个阶段产生 allowlisted 结果；
- browser-use Browser 仍是浏览器所有者，不创建第二个 CDP client；
- Profile 保持存在；只终止本 runner 创建的浏览器树；
- 成功返回结构化 `{ closed, stages }`；失败返回受限错误码，不返回页面正文和原始异常；
- 主循环处理 `close` 后先写完整响应，再退出；外层 `finally` 只调用幂等 `ensure_closed()`，不得制造第二次独立关闭。

### 5.2 TypeScript close 必须保留主结果

`RunnerProcess.close()` 不再做以下事情：

- `.catch(() => {})` 吞掉 close response；
- 仅凭 `exitCode !== 0` 得出全部清理失败；
- 在抛错后跳过临时目录清理；
- 用清理错误覆盖已经成立的业务错误或成功结果。

正确顺序：

1. 有界等待 close protocol 响应；
2. 有界等待 child close；
3. 若超时，按精确 child PID 终止其树；
4. 确认 child 句柄已经 close；
5. 尝试删除本次临时目录，保留持久 Profile；
6. 组装结构化 cleanup report；
7. 无论成功或失败都清空当前对象引用；
8. 返回 report，由调用方决定生命周期状态。

Windows 重启恢复不得直接信任旧 PID；只有进程身份、启动时间或其他 owner token 仍匹配时才能定向终止。无法证明所有权时保持 `unconfirmed` 并提示人工检查，不能误杀其他进程。

### 5.3 主错误与次错误

```text
work 成功 + cleanup 成功
  -> execution completed

work 成功 + cleanup 未确认
  -> TaskRun completed
  -> execution cleanup_required
  -> primary action cleanup

work 失败 + cleanup 成功
  -> 保留真实业务/节点/合同/外部失败分类

work 失败 + cleanup 未确认
  -> 保留真实主失败
  -> 追加 cleanup unconfirmed
  -> 产品先清理，清理后再恢复原失败下一步
```

不得再用 `AggregateError` 的字符串作为产品分类依据；可以保留 AggregateError 供内部诊断，但产品投影必须读取类型化的 primary 和 cleanup facts。

## 6. 产品投影与结果页

### 6.1 产品状态优先级

建议投影顺序：

1. 归档；
2. 需求对话/准备 job；
3. 正在运行或人工等待的 execution；
4. 当前 execution 的 `cleanup.status === unconfirmed`；
5. 需求/release/preset 门；
6. 已清理后的真实业务失败或 completed；
7. runnable。

`cleanup_required` 必须高于 repair/rerun，因为同一浏览器所有权尚未释放时不能启动新运行；但它不能删除或改写原结果。

### 6.2 结果页文案与操作

链路完成、清理未确认时首屏显示：

```text
任务步骤已完成
浏览器资源回收尚未确认，暂时不能再次运行。
[核验并清理资源]
```

次级信息展示：

- 已完成步骤数量和业务输出；
- 清理状态、最近尝试时间和安全错误码；
- “调整链路 / 重新梳理需求”仍可作为结果复盘入口，但不能被描述为这次清理问题的修复方式；
- 不显示“已确认是可修复的确定性失败”；
- 不提供“授权模型修复”。

清理命令必须使用 execution id、expected sequence 和 requestId 幂等。清理成功后重新加载同一 execution，若原链路成功则显示 completed/rerun；若原业务失败则恢复原失败分类和下一步。

### 6.3 历史兼容

- 历史两次 completed execution 保持不变。
- 本次错误 execution 的原始 failure、reason 和时间不得删除。
- 可以追加一次清理核验记录并把产品当前状态恢复为可运行；兼容适配必须同时验证所有步骤/TaskRun 已完成，不能只匹配字符串。
- 新运行不得再生成 legacy cleanup 字符串失败。

### 6.4 运行接受回执与事件续接

链路工作台不能从“任务模型刷新了”推断运行已经创建。正式运行命令必须使用稳定 requestId 幂等，并返回：

```ts
type AcceptedExecution = {
  requestId: string
  executionId: string
  status: "accepted"
  release: VersionReference
  plan: VersionReference
  chains: VersionReference[]
  acceptedAt: string
  nextSequence: number
}
```

同一 task/requestId 的网络重试返回同一 execution；相同 requestId 携带不同版本或输入时拒绝。Workbench 收到回执后立即把 active execution 切换到该 id，先显示 queued/accepted，再按持久化序列续接。

事件查询或流至少以 `executionId + afterSequence` 为边界，返回单调 sequence、TaskRun/node/edge 引用、状态和安全摘要。传输可先复用轮询；只有轮询不能满足即时性或续接时才增加 SSE。无论使用哪种传输，持久化 execution/TaskRun event 都是唯一事实源，客户端不得跨 execution 按节点拼接“最新状态”。

## 7. 链路运行台与分层展示投影

### 7.1 单一投影原则

链路运行台是纯派生展示和产品命令入口，不是第二份 Chain IR：

```text
immutable TaskChain + versioned chain-stage facts
  + immutable/published layout（若存在）
  + one selected TaskExecution and its TaskRun events
  + local preview/focus/selection state
  -> WorkflowPresentation
  -> React Flow adapter
  -> stage overview | attached preview | focused action subgraph
```

除修订草稿的手动布局外，展示和展开状态不进入 executable digest，不改变运行语义。自动布局结果可缓存，但必须能从同一输入重算。运行状态只能来自所选 execution 的持久化事实；客户端动画、轮询响应或编辑器内部状态都不是事实源。

### 7.2 链路阶段与动作子图是同一事实的层级投影

链路只拥有一套可执行节点与边，但同一画布提供三个阅读层级：

- **阶段总览**回答“任务按什么顺序完成”。只显示开始、链路阶段、阶段间主路径和结束；阶段卡片显示目标、关键机制摘要、动作数和本次运行状态，不显示通用输入/输出框。
- **临时动作摘要**回答“这个阶段大致做了什么”。单击阶段在其下方附着一条紧凑时间线，任一时刻只显示一个；它覆盖在画布上且不进入布局。存在分支、循环或异常出口时只提示“进入阶段查看完整路径”，不得伪造成线性列表。
- **聚焦动作子图**回答“具体如何执行和修改”。双击或点击“进入阶段”后，同一画布用面包屑切换到该阶段引用的真实动作节点、端口、边和出口；返回后恢复总览视口与选择。
- 运行中阶段只获得状态强调和可选的非抢焦点摘要，不得自动撑开主图。用户进入聚焦态后可跟随当前动作，但必须能关闭。
- 阶段边界来自计划步骤、编译证据或显式版本化事实；不得由 UI 按网站名称、业务词、节点 label、坐标或数量猜测。旧链缺少可靠阶段时显示“未分组动作”，不得伪造业务含义。

链路阶段引用一段相连的动作子图，必须声明一个逻辑入口和具名出口。阶段外边只能穿过这些边界；阶段自身不参与 runtime 调度。总览、摘要与聚焦态都持有相同节点 ID，不复制运行状态或编辑内容。

端口角色仍由节点/能力合同稳定声明：

- `primary`：普通成功推进；
- `decision`：Branch case/default 等业务控制流；
- `exception`：missing、timeout、blocked、human_required、failed、cancelled 等平台异常流。

角色不得从 label、页面文案或边名称模糊匹配。阶段卡片可以汇总“异常出口 N”；进入聚焦态后必须能看到每条实际路径，未知端口显示为“其他出口”而不是被静默删除。

### 7.3 开源编辑器与布局边界

生产链路运行台冻结为现有 React Flow 加 Dagre：

1. `@xyflow/react@12.11.6` 承担节点、连线、端口、选择、重连、视口、缩略图和运行态绘制；
2. `@dagrejs/dagre@3.1.1` 分别计算阶段总览和当前聚焦动作子图的初始 LR/TB 布局；不对带跨边界子节点的大容器做复合布局；
3. 自动布局只在首次投影、阶段结构改变或用户点击“整理布局”时运行。拖动后的版本化坐标不因渲染、临时摘要或运行事件而改变；
4. FlowGram/Coze 只作为参考。官方 loop 容器与 expand/collapse 源码验证了其核心模式是大容器内显示/隐藏子节点，不符合本迭代的附着预览和同画布聚焦；ELK 当前没有新增价值。

两项依赖均为 MIT，提供 ESM/TypeScript 使用面并可在当前 Vite/Windows 工程内运行。B-A-T 自有代码只承担 TaskChain、阶段、revision、event、capability descriptor 和编辑器模型之间的薄适配；库不得拥有 runtime 状态，也不得把坐标写进 executable digest。

布局结果必须满足：

- 桌面默认按自然阅读方向排列，链路阶段顺序明确；
- 聚焦动作节点不重叠，边不穿节点，主路径不交叉；
- 节点尺寸来自实际测量，端口位于符合流向的边缘；
- 业务分支靠近主轴，异常路径在聚焦图的次级轨道；
- 临时摘要、聚焦切换和运行态变化保持选中节点与合理视口；
- 布局失败显示可恢复错误并退回最近合法布局，不能回到固定两列假装成功。

窄屏以可平移缩放画布和底部全屏检查器为主，不为适配宽度改写已发布手动布局。

### 7.4 布局与分组持久化

- 初次编译的链没有手动布局时使用所选编辑器或布局 adapter 的确定性自动布局。
- 链路阶段分组属于版本化展示事实；临时摘要和聚焦状态属于用户本地展示状态，两者不得混写。
- 创建修订草稿时，以当前自动布局或对应已发布 layout 作为草稿初始布局。
- 拖动阶段或动作节点只修改对应草稿 `layout`，纳入 draft checksum，不进入 executable chain digest。
- I4 优先扩展现有 revision draft/published snapshot 来拥有 `ChainPresentation`，避免再建一份可漂移草稿；repository 必须能按 `published.chain` 精确解析其不可变 presentation。
- 若现有存储结构确实不能提供按 chain reference 的唯一读取，可以使用独立一对一 presentation 记录，但 revision snapshot 与新记录之间只能有一个权威内容源，另一个只保存引用和 digest，不得双写阶段或坐标。

### 7.5 工作台页面结构

链路运行台使用“现有四个工作台 Tab + 紧凑工具栏 + 全高画布 + 右侧检查器”的稳定结构。链路图不能脱离需求对话、任务准备、链路和运行结果四个产品阶段单独占据整页：

```text
┌ 任务链路 / 版本 vN / 本次运行 #N ─ 输入设置 ─ 再次运行 ─ 修订 ─ 发布 ┐
├──────────────────────────────────────────────────────┬─────────────────┤
│  [运行状态：正在执行阶段 2/4]                        │ 阶段/动作名称   │
│                                                      │ 概览            │
│  开始 → [阶段 1 ✓] → [阶段 2 运行中] → [阶段 3] → 完成│ 上下文与条件    │
│                         └ 单个临时动作摘要            │ 动作设置        │
│  面包屑 / 小地图 / 缩放 / 整理布局                    │ 验证与高级信息  │
└──────────────────────────────────────────────────────┴─────────────────┘
```

- 已发布版本的主操作是“运行/再次运行”；无有效预设时显示“配置并运行”。版本、输入和运行对象在按钮附近明确可见。
- 版本选择、只读/草稿标识、验证状态和发布动作位于同一工具栏；digest 和编译器说明移入版本信息弹层。
- 画布占据当前“链路”Tab 的主要面积；桌面检查器建议 360–440 px、可调整和关闭，窄屏使用底部全屏面板。
- 只读版本隐藏编辑手柄；修订草稿显示端口、拖动和连线交互，并始终显示未保存/未验证状态。
- 错误、等待、当前运行和未验证不能只靠颜色表达；图例只解释状态，不承担主操作。
- 编辑器 attribution 如许可证要求可以保留，但不得与节点、缩放控件或产品主操作重叠。

### 7.6 直接运行与即时反馈合同

- 左侧任务/session 列表整行点击只选择任务并打开工作台，立即显示选中态或加载骨架；不得创建 execution。
- 用户点击“运行/再次运行”后，同一渲染周期按钮变为“正在启动…”，设置 `aria-busy` 并禁止重复提交。
- 命令携带稳定 `requestId`；服务端校验 release、preset、input、digest 和浏览器 owner 后，返回明确 `executionId` 及绑定引用。网络重试返回同一 execution。
- `accepted` 后工作台自动选中新 execution 并显示 queued；HTTP 返回但运行尚未开始时不得恢复成无反馈 idle。
- 失败在按钮附近显示业务可读错误和可执行下一步；内部异常码只进高级信息。任何路径都不得静默吞掉点击。
- 预设缺失或失效时立即打开类型化业务表单，提交成功后沿同一命令创建运行；用户不填写 URL、selector 或 JSON。

### 7.7 实时运行流

- 画布一次只绑定一个明确 `TaskExecution`；历史选择器可以切换 execution，但不得跨运行拼接节点状态。
- 节点至少投影 `pending`、`queued`、`running`、`succeeded`、`waiting`、`failed`、`skipped`、`cancelled`；主步骤状态由其真实内部节点聚合，不另造执行事实。
- 当前推进边可以动画，已通过路径保持标记，未选择或跳过路径降低强调；reduced-motion 下用线型、图标和文字保留同等信息。
- 人工等待在对应节点与顶部状态条显示“去处理/核验并继续”；恢复仍是同一 run，不重复已完成副作用。
- `cleanup_required` 显示为 execution 级状态条并阻止新运行，不伪造成节点失败或 repair 路径。
- completed 后保留本次路径和耗时，工具栏给出“查看结果 / 再次运行 / 调整链路 / 重新梳理需求”。
- 实时传输优先复用现有持久化事件和连接层；若轮询不能保证顺序、续接或即时性，可增加服务端事件流，但必须带 execution id 与单调序列，断线重连从持久化事实补齐，不能增加第二个 runtime 状态源。

### 7.8 已确认原型行为

隔离原型已经通过 Windows Edge headless 渲染并得到用户确认。生产实现以以下行为为基线：

1. 需求对话、任务准备、链路图、运行结果四个 Tab 保持在同一任务工作台；链路图不是脱离生命周期的独立全屏产品。
2. 阶段总览显示开始、阶段、结束和阶段间路径；阶段卡片保持紧凑，不显示通用输入/输出框或大图标。
3. 单击阶段只在其下方附着一个动作摘要；选择其他阶段时替换前一个。摘要不参加 Dagre 布局，不永久撑开主图。
4. 双击或“进入阶段”在同一 React Flow 画布进入聚焦态，并显示面包屑返回；真实动作节点、端口和边来自同一 TaskChain。
5. 横向/纵向布局、整理布局、拖动、缩放和小地图复用 React Flow/Dagre；聚焦图允许超出首屏并通过平移、小地图浏览，不为“全图同时可见”缩小到不可读。
6. 右侧面板只解释或编辑当前选择。阶段选择显示阶段边界和真实动作；动作选择显示所属阶段、前后动作、前置条件、动作配置和必须达到的后置条件。
7. 修改 `press Enter` 等原子动作后立即显示“修改后待验证”并禁用发布；替换为点击时先启动真实浏览器目标选择，不出现 CSS selector 输入框。
8. 顶部“再次运行”点击后立即进入 submitting/accepted 状态；原型中的运行动画只证明交互形式，生产状态必须来自 I3 的 execution 回执和事件事实。

生产组件不必复制原型的演示数据、固定尺寸或样例任务文本；这些内容属于隔离样本。生产代码只能消费通用 `ChainPresentation`、descriptor 与运行事件。

## 8. 链路阶段与动作节点卡片设计

阶段总览必须让用户看懂自动化任务怎么走；聚焦后的动作节点必须让用户不打开 JSON 也能理解具体动作。子路径不常驻，阶段和动作节点也不能在视觉上伪装成同一种卡片。

### 8.1 固定结构

每个链路阶段卡片只显示决策所需信息：

- 顺序号和用户可读阶段目标；
- 关键实际机制摘要，包括输入后是按回车、点击按钮还是选择候选等结果相关差异；
- 动作数量、分支/异常提示和当前聚合运行状态；
- “查看动作”与“进入阶段”入口。节点上不重复展示通用输入/输出，不使用占主视觉的大图标。

每个聚焦动作节点至少显示：

- 紧凑类型标识和用户可读类型；
- 一行任务动作标题；
- 一行对象或关键参数摘要；
- 最近一次运行状态；
- 异常出口数量；
- 显式模型节点标识和实际调用状态；
- 选中、运行中、成功、等待、失败的非纯颜色状态。

内部 ID、capability 版本和 digest 不作为主标题。

### 8.2 标题来源

标题按以下优先级生成：

1. 链版本中已有且不是机器占位符的业务可读 `node.label`；
2. 通用 capability descriptor 根据动作类型、值绑定和已保存目标描述生成；
3. 节点族通用名称；
4. 最后才显示技术 ID 作为副标题。

capability descriptor 只认识平台通用能力和合同，例如导航、输入、点击、按键、读取、等待、Function、Branch、Invoke、LLM 和 Terminal；不得认识网站、业务实体、页面 class 或具体任务文案。未知 capability 只提供安全只读摘要，不猜业务语义，也不开放通用 JSON 编辑。

新编译链应产生业务可读 label；旧链通过展示 descriptor 可读，不改写历史版本。

## 9. 节点详情与编辑信息架构

### 9.1 只读详情

右侧详情按以下顺序：

1. **上下文**：所属链路阶段、前一动作、当前动作和下一动作；
2. **概览**：这一步做什么、节点角色、最近状态和耗时；
3. **前置条件**：动作执行前必须成立的目标、焦点或值事实；
4. **动作与目标**：通用能力、业务可读目标和关键参数；
5. **后置条件与去向**：动作后必须成立的事实、成功/业务分支和异常出口；
6. **最近运行**：每次 run 一行，显示结果、持续时间、命令数和模型调用，不平铺 planned/started/finished 三条原始事件；
7. **版本与验证**：chain version、验证状态、复用边界；
8. **高级信息**：技术 ID、capability version、digest、完整 JSON、Function source 或 LLM prompt，默认折叠。

不得在“高级信息”之前显示整段 JSON。

### 9.2 修订详情

查看与编辑使用同一信息结构，但编辑只写 revision draft：

- 基础字段使用 Radix 表单和 Zod 边界；
- capability 配置由通用 capability descriptor 提供字段定义、控件、目标要求、兼容替换和验证支持；缺少 descriptor 的节点只读，不用递归 JSON editor 兜底；
- 输入绑定提供来源选择和类型兼容提示；
- 出口以可读端口和目标节点选择呈现；
- 修改 `press Enter` 之类的原子动作时，面板必须同时显示所属阶段、前置条件、要求达到的后置条件和下一动作。按键可以改为其他合法键或组合键，但这会使旧验证失效；需要改变交互类型时使用“替换动作”，例如换成点击，并通过真实浏览器目标选择器确定目标，用户不填写 CSS selector；
- Function source、LLM prompt 和原始配置属于明确标识的高级编辑；
- 保存、验证、发布分别是不同动作；保存不会调用模型或浏览器；
- 修改任一执行内容使旧 candidate validation 失效；只有聚焦验证重新证明阶段具名出口或后置条件可达后才能发布。仅移动布局不改变 executable digest，但更新 draft checksum。

### 9.3 选择与导航

- 点击节点高亮其直接上游和下游；其他节点降低强调但仍可见。
- 点击阶段卡片的“异常出口 N”会进入该阶段并聚焦对应边。
- 节点详情关闭后焦点回到原节点。
- 键盘可遍历链路阶段和动作节点、打开/关闭临时摘要、进入/退出聚焦态、打开详情和关闭面板。
- reduced motion 下关闭自动平移动画；布局计算不改变焦点顺序。

### 9.4 编辑命令与验证失效

UI 行为必须落到现有或新增的类型化 revision operation，不能直接修改 React Flow node data：

| 用户操作 | revision 语义 | executable digest | validation |
| --- | --- | --- | --- |
| 拖动阶段/动作、整理布局 | 更新 presentation layout | 不变 | 保持；只做展示结构校验 |
| 修改阶段标题/摘要、重分组 | 更新 ChainPresentation | 不变 | 保持执行验证；重新做阶段边界校验 |
| 修改按键、超时、输入绑定或普通 config | `replace_node` 或等价类型化 node patch | 改变 | 立即失效 |
| 把按键替换为点击 | 兼容 capability replacement + 新 browser target | 改变 | 立即失效，目标选择后仍需聚焦验证 |
| 增删节点或连线 | 现有 add/remove/upsert operation | 改变 | 立即失效 |
| 仅切换总览/聚焦、打开摘要 | 本地展示状态 | 不变 | 不变，不保存 |

当前 operation 若不能原子表达“更新 presentation”或“兼容替换 capability”，先扩展服务端合同和 checksum，再接 UI。不得把多次前端 patch 拼接成一个可能半成功的产品操作。

## 10. 迭代包与顺序

本迭代不新增产品阶段 R6；I0–I7 是重新关闭 R2、R3、R5 的实现包。I0 已完成，生产开发严格按 I1 → I7；前包退出门未通过不得靠后包 UI 或全流程复跑绕过。

| 实现包 | 关闭的产品缺口 | 状态 |
| --- | --- | --- |
| I0 | 架构、开源选型与交互原型 | 已完成，只是设计证据 |
| I1–I3 | R2 的执行完成、清理生命周期和可复跑入口 | 待开发 |
| I4–I6 | R3 的服务端展示事实、可读运行台和版本化修订 | 待开发 |
| I7 | R5 正式产品闭环复验 | 待验收 |

### I0 — 架构与交互原型（已完成）

已完成：ADR 0009/0010、领域术语、根因证据、React Flow + Dagre 复用评估，以及 `apps/workbench/prototype.html` 隔离原型。原型验证了四个 Tab、阶段总览、单个临时摘要、同画布聚焦、上下文动作编辑、验证失效和画布内再次运行的交互结构。

边界：原型使用静态样本和本地运行演示，不连接产品 API，不提供正式 execution、revision 或发布证据。生产代码不得导入原型样本；I0 不能作为 I1–I7 任一退出证明。

### I1 — 合同、术语与持久化

目标：建立 `cleanup_required` 与结构化 `ExecutionCleanup`，不改 UI。

改动范围：

- `packages/contracts/src/task-chain/api.ts`
- `packages/contracts/src/task-chain/product.ts`
- `apps/api/src/database/schema.ts`、`migrate.ts`、`invariants.ts`
- `apps/api/src/task-chain/repository.ts`
- 相关 contracts/API tests

细则：

- 跨包边界用 Zod 立即解析；旧记录缺字段可读；新记录必须有清理事实。
- 明确唯一清理事实源，禁止 execution body 与新表双写漂移。
- 新增 `cleanup` primary action；repair evidence 不能承载 cleanup。
- 迁移不得按任务 ID、网站或本次 execution ID 特判。

最小验证：contracts cleanup/status 兼容测试；API 保存、重启读取、并发 token 和唯一事实源测试。

退出条件：可以持久表达“TaskRun completed + execution cleanup_required”，且解析重启后不变。

### I2 — runner 清理协议与恢复

目标：让 Python/TypeScript close 幂等、可观察、可恢复，不覆盖主结果。

改动范围：

- `apps/api/python/browser_use_runner/hybrid_main.py`
- `apps/api/src/upstream-browser/service.ts`
- `apps/api/src/upstream-browser/hybrid-runtime.ts`
- 必要的 typed error/report 文件与最小测试

细则：

- 先用 allowlisted stage code 复现并定位当前 exit 1 的实际失败点，再修复；不得猜。
- close request、child close、process tree、temp cleanup 分段记账。
- 临时目录删除放在不会被前序异常跳过的 finally 中。
- 取消与正常完成分别处理；取消信号不能把真实 cleanup unconfirmed 自动当成功。
- 结束后确认精确 runner/Chrome 数为 0；不碰持久 Profile。

最小验证：真实 child process 的正常 close、close 阶段失败、超时终止、重复 close、业务失败加清理失败、Windows 临时句柄重试。

退出条件：任何路径都返回结构化 cleanup report；成功结果不会被 generic Error 覆盖；具体清理失败阶段可审计。

### I3 — 执行投影、运行回执、事件续接与清理操作

目标：正确投影 `cleanup_required`，建立运行命令的 accepted execution 回执和事件续接，清理确认后恢复原业务下一步。

改动范围：

- `apps/api/src/task-chain/plan-executor.ts`
- `apps/api/src/task-chain/execution-result.ts`
- `apps/api/src/task-chain/product.ts`
- `apps/api/src/task-chain/service.ts` 和命令合同
- `apps/workbench/src/Results.tsx`、`productPresentation.ts`

细则：

- `TaskPlanExecutor` 单独捕获 typed cleanup error；不得落入 deterministic repairable catch。
- 保留步骤 output、TaskRun 和 business failure；cleanup 只改变执行生命周期。
- 清理命令幂等且核验 owner；成功后重新投影同一 execution。
- `run_task` 使用稳定 requestId 幂等，并返回明确 `executionId`、release/plan/chain 引用和 accepted 状态；网络重试不能创建重复 execution。
- 运行查询和事件续接必须按 execution 过滤并带单调序列；禁止 API 只返回“任务已刷新”而不暴露新运行身份。
- 结果页不暴露内部异常字符串。

最小验证：API 定点覆盖四种 primary/cleanup 组合、运行命令幂等、requestId 冲突和按 execution/sequence 读取事件；Workbench 只做结果页文案、清理按钮和无 repair 授权的定点验证。

退出条件：本次故障形态显示“步骤已完成、待清理”，完成清理后可以普通再次运行；一次合法点击可以取得唯一 accepted execution 及其事件流，模型调用为 0。

### I4 — ChainPresentation 与 CapabilityDescriptor 服务端合同

目标：在生产 UI 之前建立版本化链路阶段、布局、descriptor、checksum/digest 和验证失效的服务端事实。

改动范围：

- `packages/contracts/src/task-chain/` 中新增 presentation/descriptor Zod 合同并从公共入口导出；
- `apps/api/src/task-chain/chain-revision.ts` 及 repository/schema/migration 中持久化 draft/published presentation；
- capability registry 放在现有通用能力注册边界，按 name/version 精确匹配；
- revision operation 增加原子 presentation patch 与 capability replacement，或证明现有 operation 可以无半状态地表达；
- 编译/准备输出阶段事实；旧链使用只读“未分组动作”派生投影。

细则：

- Zod 边界立即解析，阶段覆盖、入口、出口、跨阶段边和 layout node id 全部服务端校验。
- 发布版本按精确 chain reference 读取唯一 presentation；旧版本不被新布局覆盖。
- draft checksum 覆盖 executable + presentation + operations；executable/presentation digest 分离。
- 仅 presentation 操作不使执行验证失效，但必须通过展示结构校验；任何 executable 操作立即使 candidate validation 失效。
- descriptor 不得包含网站、业务字段、文案或 CSS class；unknown capability 只读。
- 手动编辑与展示校验均不调用模型；真实浏览器只在用户触发目标选择或聚焦验证时进入单会话队列。

最小验证：contracts schema/兼容测试；API 阶段图不变量、checksum/digest 分离、validation invalidation、发布不可变和重启读取定点测试。

退出条件：不启动 Workbench 也能从正式 API 创建/读取/修改/校验/发布 presentation；旧链只读兼容；新发布版本的 executable 与 presentation 身份稳定且重启不变。

### I5 — 生产链路运行台与实时运行流

目标：把已确认原型接到 I3/I4 的真实合同，用现有 React Flow 与 Dagre 替换固定两列静态图。

改动范围：

- `apps/workbench/src/TaskWorkspace.tsx`、`ChainView.tsx`、`LiveChain.tsx`；
- `taskChainConnection.ts`、`useTaskRunner.ts` 和新的 execution event projection；
- 独立 stage/action node、Dagre layout adapter、inspector shell；
- `main.tsx`、`TaskSidebar.tsx` 的选择/运行职责调整。

细则：

- 左侧列表只选择并立即反馈；运行/再次运行位于链路工具栏。
- 同一渲染周期进入 submitting；accepted 后绑定回执中的 executionId，事件只按该 execution/sequence 续接。
- 阶段总览、单个临时摘要、同画布聚焦/返回、LR/TB 整理布局、拖动、缩放、小地图和视口恢复遵循原型。
- 自动布局只在无发布布局、结构改变或用户明确整理时运行；运行事件和摘要开关不得触发布局跳动。
- 节点/边状态包含文字或图形冗余；reduced-motion 关闭动画但不丢失信息。
- `cleanup_required` 只在 execution 状态条出现，不伪造为节点或 repair 路径。

最小验证：projection/adapter tests；Workbench 类型检查/生产构建各一次；1440px headless 覆盖任务选择、启动即时反馈、accepted 绑定、事件推进、刷新续接、临时摘要和聚焦切换。

退出条件：用户无需 JSON 即可按阶段理解任务，从画布启动并观察唯一 execution；主路径无交叉、节点可读，刷新后不混入历史运行。

### I6 — 上下文动作编辑、聚焦验证与不可变发布

目标：把只读运行台接成真正的版本化修订入口，不让前端本地状态绕过服务端事实。

改动范围：

- `ChainRevisionEditor.tsx` 与按 descriptor 渲染的字段/目标/端口控件；
- I4 revision operations、聚焦验证与 publish API；
- I5 inspector、草稿状态、验证状态与发布反馈。

细则：

- 查看、编辑、高级信息分层；raw JSON、Function source、LLM prompt 默认折叠。
- 动作编辑展示阶段、上一动作、下一动作、前置条件和必须达到的后置条件。
- 修改按键等同类字段走类型化 patch；更换按键为点击走 capability replacement，并启动 B-A-T 浏览器目标选择器。
- 连线必须选择明确 source port 与 target；不得拿“第一个空闲出口”代替用户语义。
- 保存、展示结构校验、浏览器聚焦验证、发布是不同命令；每个异步操作即时反馈且幂等。
- 手动编辑模型调用为 0；只有用户另行明确发起模型辅助修复时才走独立授权路径。

最小验证：revision contracts/API 既有定点加 descriptor/presentation operation；Workbench headless 修改 `Enter`、发布禁用、选择点击目标、聚焦验证、发布新版本一次；服务重启后新旧版本与布局一致。

退出条件：用户可修改一个动作或连线，经服务端验证后发布新不可变版本；旧版本、旧 presentation 和历史运行完全不变。

### I7 — 正式产品入口验收

只在 I1–I6 通过后执行。不得用 runtime 直调、mock、fixture、类型检查、隔离原型或临时脚本冒充产品结果。

正式路径至少覆盖：

1. 从 Workbench 左侧选择任务，立即看到选中/加载反馈并打开当前发布链；左侧点击不启动运行；
2. 从结果页创建修订草稿，修改节点或连线，验证并发布新不可变版本；
3. 在链路运行台中确认当前版本和输入，使用“凡人修仙传”现有任务或同等真实公开任务点击普通再次运行；按钮立即进入启动态并取得唯一 execution；
4. 同一画布自动绑定该 execution；阶段总览与聚焦动作子图的已通过边、当前边、等待和完成状态按持久化事件流转，刷新或断线重连后继续同一次运行；
5. 正式 run 到达 completed，模型调用为 0，runner/Chrome/temp cleanup 为 confirmed；完成后同一运行台可再次运行；
6. 服务重启后 release、preset、运行结果、事件序列、cleanup、链路阶段分组和 published layout 一致；
7. 受控清理异常路径从正式 API/Workbench 投影为 execution 级 cleanup_required，不出现节点 repair；清理确认后恢复原结果；
8. 1440 桌面、390 窄屏、键盘、reduced-motion 和 headless 截图；
9. 在聚焦编辑中把 `提交搜索` 的同类字段改动保存，确认发布禁用；完成聚焦验证并发布新版本，旧版本和历史运行不变；
10. 结果页“符合预期 / 调整链路 / 重新梳理需求”三条路径仍正确；局部问题进入新 revision，目标/来源/范围问题形成新需求版本；
11. 1440 桌面、390 窄屏、键盘、reduced-motion 和 headless 截图；
12. 结束后端口、runner、Chrome、事件连接和临时服务全部关闭。

受控清理故障只能覆盖错误路径，不能替代真实任务的成功复跑。真实任务成功一次也不能替代 cleanup_required 恢复路径。

退出条件：R2 的运行/清理语义、R3 的可读修订工作台和 R5 的正式产品闭环都有独立证据；连续普通复跑不再被清理误分类，且模型调用为 0，才允许重新写“R1–R5 已通过”。

## 11. 按文件实施指引

以下是起点，不是要求机械照抄；新 session 仍须先用 CodeGraph 核对实时结构。

| 文件/区域 | 责任 | 本迭代要求 |
| --- | --- | --- |
| `packages/contracts/src/task-chain/api.ts` | execution/result/review API | 增加 cleanup 合同、状态和 next action；旧记录兼容 |
| `packages/contracts/src/task-chain/product.ts` | 产品状态和主操作 | 增加 cleanup_required/cleanup |
| `packages/contracts/src/task-chain/revision.ts` | revision operation/checksum | 增加 presentation patch、capability replacement 和分离 digest 合同 |
| 新 `presentation.ts` / `capability-descriptor.ts` | 链路阶段和编辑描述 | Zod 定义、图不变量、exact descriptor key 与公共导出 |
| `apps/api/src/database/schema.ts`、`migrate.ts`、repository | 唯一持久化事实 | cleanup 与 published presentation 兼容迁移、重启恢复、不双写 |
| `apps/api/src/upstream-browser/service.ts` | child protocol/close | 结构化 report、保留 close response、始终 temp cleanup |
| `apps/api/python/browser_use_runner/hybrid_main.py` | browser/capability owner | 幂等 close、单一退出路径、allowlisted stage result |
| `apps/api/src/upstream-browser/hybrid-runtime.ts` | capability lifetime | 分离 work result 与 cleanup report |
| `apps/api/src/task-chain/plan-executor.ts` | execution lifecycle | 单独处理 cleanup_required，保留主结果 |
| `apps/api/src/task-chain/execution-result.ts` | 结果投影 | cleanup 不生成 failure/repair |
| `apps/api/src/task-chain/product.ts` | 任务主状态 | cleanup 优先于 rerun/repair，清理后恢复 |
| `apps/api/src/task-chain/service.ts` 与 API command | 正式运行入口 | 幂等 accepted execution 回执；按 execution/sequence 续接事件 |
| `apps/workbench/src/Results.tsx` | 结果与下一步 | 清理 callout/操作，保留结果，移除误导修复入口 |
| `apps/workbench/src/main.tsx`、`TaskSidebar.tsx` | 任务导航 | 列表只选择/打开任务；移除运行副作用并提供即时选择反馈 |
| `apps/workbench/src/TaskWorkspace.tsx`、`ChainView.tsx` | 链路运行台壳 | 接入版本、输入、运行命令、active execution 和结果/修订导航 |
| `apps/workbench/src/useTaskRunner.ts` | 运行命令状态 | idle/submitting/accepted/settled/error；返回并选择唯一 execution |
| `apps/workbench/src/taskChainConnection.ts` | 运行事件连接 | 按 execution 和单调序列读取、重连补齐、释放订阅 |
| `apps/workbench/src/taskChainProjection.ts` | 当前简易图投影 | 拆成阶段总览、聚焦子图、端口角色和单次 execution event projection；移除固定两列 |
| 新 presentation/descriptor client adapter | 服务端事实到 React Flow | 不含业务特判；unknown descriptor 只读；不拥有版本或运行状态 |
| `apps/workbench/src/LiveChain.tsx` | 画布容器 | 阶段总览、临时摘要、聚焦动作子图、运行流、published layout |
| `apps/workbench/src/ChainRevisionEditor.tsx` | 草稿编辑 | 上下文可读表单、兼容替换、明确端口、复用服务端版本事实 |
| `apps/api/src/task-chain/chain-revision.ts` | 草稿/布局/checksum | 阶段分组、自动初始布局与发布布局来源；布局不进 executable digest |
| `apps/workbench/prototype.html`、`src/prototype/` | 隔离交互基准 | 只用于对照；不导入生产入口、不作为 API 或验收事实源 |

## 12. Product Alignment

```text
Product Alignment:
- natural-language task: 用户在可读链路工作台直接启动复跑，先看懂链路阶段，再进入任一阶段查看和修订真实动作路径，并在资源清理异常时保留真实结果、核验清理后再次运行
- reusable chain boundary: 不可变 TaskChain 决定执行；链路阶段只引用真实动作子图并决定阅读层级；每个 TaskExecution 独立拥有运行流和清理事实
- runtime inputs: 当前 release/preset 的业务输入、链版本、运行控制和用户显式清理/修订操作
- dynamic task outputs: accepted execution、TaskRun 事件流、ExecutionCleanup、产品下一步、阶段总览/聚焦动作子图和新不可变修订版本
- generic platform capability used: TaskChain/LangGraph、runner/browser 生命周期、Zod/SQLite、React Flow、Dagre 及现有 revision/validation/publish
- replay model calls: 0，显式 llm 节点除外；清理和手动修订不调用模型
- site/task-specific code added: no
```

## 13. Reuse Assessment

```text
Reuse Assessment:
- capability: 有所有权的 runner/browser 清理；带阶段总览、同画布聚焦编辑和实时运行态的工作流运行台
- existing implementation in repository: Node ChildProcess、browser-use Browser close/kill、Windows 精确 PID 树终止、@xyflow/react 12.11.6、revision draft/layout/checksum/digest、持久化 TaskRun events
- mature candidates and pinned versions: 继续使用现有进程/Browser 公共面；`@xyflow/react@12.11.6` 与 `@dagrejs/dagre@3.1.1`；FlowGram 1.0.14 和 ELK 只作为已核验未采用候选
- selected implementation: 清理在现有 owner/runner 适配层补结构化报告；画布保留 React Flow并以 Dagre 分别布局阶段总览与聚焦动作子图
- reused public surface: ChildProcess close/exit、browser-use Browser ownership；React Flow nodes/edges/handles/selection/reconnect/viewport/minimap；Dagre graph/layout/rankdir
- B-A-T-owned adapter and remaining gap: accepted execution 与事件续接、execution cleanup 持久化、TaskChain/链路阶段/事件到编辑器模型映射、capability descriptor、版本化布局来源和上下文编辑器
- license/runtime/platform fit: React Flow 与 Dagre 均为 MIT；Dagre 3.1.1 含 TypeScript 声明，包与 graphlib 合计约 1.9 MB unpacked，不等于最终 bundle；Windows/Vite headless 原型已通过，生产 bundle/交互仍待 I5，macOS arm64 仍未测
- browser/runtime/state ownership conflicts: 不新增 Browser/CDP owner；编辑器不拥有运行状态或版本事实；cleanup 只作用于本 execution 资源
- replay model calls: 0，显式 llm 节点除外
- rejected candidates and evidence: 固定网格不看边；两套图会漂移；永久容器子画布让主图失控；FlowGram 官方 loop 使用 `isContainer` 与展开隐藏子节点且状态所有权过宽；ELK 对当前分层图无新增必要；自研画布/布局重复成熟能力；原始 JSON 详情不是产品设计
- focused validation: I0 React Flow+Dagre 隔离原型；I2 真实 child cleanup；I4 presentation/descriptor 服务端合同；I5 生产运行台；I6 修订发布；I7 正式 Workbench/API 复跑、清理恢复和产品闭环
```

## 14. 禁止实现

- `if (message.includes("upstream_cleanup_unconfirmed")) completed = true`。
- 捕获 close 错误后无条件忽略。
- 把 cleanup failure 标为 `deterministic/repairable`。
- cleanup_required 时启动模型或重新 author chain。
- 为 Bilibili、视频播放、剧集名、按钮文案或 CSS class 写分支。
- 重新生成一条链来绕过当前 execution 的清理状态。
- 用 `index % 2`、手写层级 BFS 或自己实现边避让继续补坐标。
- 为省事自研 React Flow/Dagre 已经提供的平移缩放、缩略图、连线或布局。
- 把链路阶段和动作节点维护成两张图，或让子路径永久占据阶段总览，或没有任何方式进入真实异常路径。
- 从左侧任务/session 行点击暗中启动运行，或点击后没有 pressed/busy/accepted/error 反馈。
- 用前端定时动画伪造运行流，或按节点混合多个 execution 的最后事件。
- 把画布布局写进 executable digest，或拖动节点导致链执行版本变化。
- 在只读详情首屏输出 JSON、Function source 或完整 prompt。
- 缺少 capability descriptor 时开放递归 JSON 编辑，或让修改动作绕过后置条件与聚焦验证。
- 用“第一个空闲 port”代替用户明确选择连线语义。
- 用类型检查、mock runner、fixture 页面或单张截图宣称正式产品闭环通过。

## 15. 全新 session 开工清单

新 session 必须按顺序执行：

1. 完整读取 `AGENTS.md`、本文、ADR 0008、ADR 0009、`.agents/skills/interview-browser-task/SKILL.md`、`REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md`、`MINIMUM_PRODUCT_LOOP.md`、`CONTEXT.md`、`TASK_CHAIN_ARCHITECTURE.md`、`ROADMAP.md`、`PROGRESS.md`、`RESEARCH.md` 和 `E_INTEGRATION_ACCEPTANCE.md`。旧临时 handoff 的有效结论已经收敛到这些仓库内基准；若它仍存在只能作为历史线索，不能覆盖实时 checkout、持久化事实或本文。
2. 核验实际 checkout、branch、HEAD、worktree 和全部 dirty work；不得假设仍是本文记录值。
3. 用 CodeGraph 查询本次迭代包涉及的定义、调用链和影响面；不要先 grep 猜结构。
4. 读取本次最新失败 execution、TaskRun、product projection 和资源状态；历史文档不得覆盖实时事实。
5. 只选择当前最前面的未完成迭代包；不得并行跳到 UI 或正式验收。
6. 开工前复核本文 Product Alignment 与 Reuse Assessment；若要替换 React Flow/Dagre 或增加关键依赖，必须先提供新的源码/运行证据并更新 ADR，不得在实现中暗换方案。
7. 只运行本包最小验证并更新 PROGRESS；失败时停在所属层修根因。
8. I7 前不得再次宣称 R1–R5 或真实任务闭环已通过。

## 16. 最终完成定义

只有以下条件全部成立，本迭代才完成：

- 成功 TaskRun 不会被任何资源清理异常改写为链路失败；
- cleanup unconfirmed 是类型化、持久化、可重启恢复的产品状态；
- cleanup 问题不出现 repair/model 授权；
- 原业务失败和 cleanup 次错误可同时保存且不互相覆盖；
- 清理确认后同一任务恢复普通再次运行；
- 已发布链路在画布内提供运行/再次运行，点击后立即反馈并取得唯一 accepted execution；左侧列表只选择任务；
- 画布只绑定所选 execution，刷新/重连后继续同一持久化运行流，不混合历史运行；
- 每个已发布 chain reference 都能解析唯一不可变 ChainPresentation；阶段分组、布局、checksum、executable digest 和 presentation digest 边界正确；
- 当前真实链的阶段总览可读；单击只临时显示一个动作摘要，进入阶段后真实动作子图无节点重叠、边穿节点或主路径交叉；
- 所有实际动作与异常路径仍可聚焦、查看和编辑；
- 节点详情首屏没有 raw JSON，用户能理解动作、输入、目标、条件、路由和最近运行；unknown descriptor 节点安全只读；
- 手动修订、验证、发布形成新不可变版本，旧版本和历史运行不变；
- 普通真实复跑模型调用为 0；
- 正式 Workbench/API 完成真实任务复跑、清理确认、服务重启、画布修订与持久化；
- runner、Chrome、编辑器异步资源、事件连接和临时服务全部释放；
- `ROADMAP.md`、`PROGRESS.md` 和 E 验收只在取得上述证据后恢复“通过”结论。
