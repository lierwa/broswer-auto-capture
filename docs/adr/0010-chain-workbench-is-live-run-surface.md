# ADR 0010：链路工作台是直接运行与实时观测入口

日期：2026-09-21  
状态：已接受

## 背景

当前 Workbench 把任务选择、运行命令、只读链路画布和结果页分散在不同位置：左侧任务列表既承担选择又暴露运行操作，点击任务本身只更新选中项；链路画布没有直接运行入口，也没有在服务端接受运行后绑定这一次 `TaskExecution`。现有节点状态投影还可能从多次 `TaskRun` 中分别取每个节点的最后事件，因此不能代表一条真实、连续的运行流。

这导致两个产品问题：

1. 用户在最需要确认“将运行哪条链、使用哪个版本”的画布上不能启动复跑；列表点击与运行后的反馈不明确，容易被理解为无响应。
2. 画布只是静态技术图，无法像成熟工作流产品一样显示本次执行当前走到哪里、哪些边已经通过、哪里正在等待或失败。

同时，用户可读的链路阶段与底层动作节点属于同一条可执行链的两个阅读层级，不应被实现为两套互不对应的图，也不应把全部动作永久塞进会撑大主图的容器。

## 决定

### 1. 链路工作台成为已发布链路的主运行入口

- 已发布版本在工作台工具栏提供“运行”或“再次运行”。
- 当前版本与有效预设齐全时，一次点击直接创建独立 execution；预设缺失或失效时，同一位置立即变为“配置并运行”并打开类型化业务字段表单。
- 左侧任务或 session 列表只负责选择、打开和显示摘要状态。整行点击不得启动运行，也不得隐藏运行副作用。
- 结果页可以保留“再次运行”的便捷入口，但它必须导航或调用同一链路工作台运行命令，不能形成第二套运行合同。

### 2. 所有交互必须即时响应

用户触发异步操作后的同一渲染周期必须出现可感知反馈：按钮进入 pressed/busy，文案变为“正在启动…”，重复触发被幂等键和禁用状态阻止。服务端接受后返回明确 execution 引用；失败在触发点附近显示可恢复错误，禁止静默无响应。

统一交互状态至少包括：`idle -> submitting -> accepted -> settled | error`。`accepted` 不等于运行完成，只表示服务端已经创建或确认同一幂等 execution。

### 3. 运行流只绑定一个明确 execution

- 服务端运行命令返回 `executionId`、绑定的 release/plan/chain 引用和幂等 `requestId` 回执。
- 链路工作台自动选择新 execution，并仅投影该 execution 下的 `TaskRun`、节点事件、边转换、人工等待和清理事实。
- 历史运行通过明确的运行选择器切换；不得逐节点拼接不同运行的“最后状态”。
- 页面刷新、网络重连和服务重启后，客户端以持久化事件序列续接同一 execution。实时传输可以使用现有轮询或服务端事件流，但都只能是持久化运行事实的传输方式，不能成为第二个运行状态源。

节点状态至少区分 `pending`、`queued`、`running`、`succeeded`、`waiting`、`failed`、`skipped` 和 `cancelled`。已通过连线保留明确痕迹，当前推进连线可动画；reduced-motion 下停止动画但保留文字、图标和线型，不得只靠颜色表达。

`cleanup_required` 属于 execution 生命周期提示，显示在运行台状态条并阻止新运行；它不是某个链路节点失败，不得在图上伪造 repair 节点。

### 4. 采用“阶段总览—临时摘要—同画布聚焦”

- `TaskChain` 仍只有一套真实动作节点和连线。版本化**链路阶段**只引用一段相连动作子图，声明一个逻辑入口和具名出口；阶段不是运行时节点，也不是第二条流程。
- 总览态只绘制开始、链路阶段、阶段间主路径和结束。阶段卡片显示目的、关键机制摘要、动作数和本次运行状态，不展示通用输入/输出框，也不常驻技术节点。
- 单击阶段可在卡片下方临时附着一条紧凑动作时间线；任一时刻只展开一个。该摘要覆盖在画布上，不参与 Dagre 布局，不把阶段变成巨型容器。含分支、循环或异常出口的路径只给摘要提示，不能被伪装成线性列表。
- “进入阶段”或双击阶段后，同一画布进入聚焦态，面包屑显示“任务链路 / 阶段名”，并绘制该阶段引用的真实动作节点、端口、分支、循环和异常出口。返回总览时恢复原视口与选择。
- 阶段边界来自计划步骤、编译证据或显式版本化事实；不得由 UI 根据网站、文案、节点 label 或坐标猜测。自动布局和临时展开不改变 executable digest。
- 阶段、已发布布局和 descriptor registry reference 由服务端 `ChainPresentation` 按精确 chain reference 持久化；UI 不从 label 或坐标生成阶段。阶段/布局进入 presentation digest 和 revision checksum，不进入 executable digest。
- 节点编辑器由精确匹配 capability name/version 的 `CapabilityDescriptor` 驱动。缺少 descriptor 时节点只读；不得回退到递归 JSON 编辑。

### 5. 保留 React Flow，并以 Dagre 承担确定性布局

当前仓库已经使用 `@xyflow/react@12.11.6`，它的公开 API 覆盖节点、连线、端口、选择、重连、视口、缩略图和运行态样式。本阶段保留 React Flow，以 `@dagrejs/dagre@3.1.1` 分别计算阶段总览和聚焦动作子图的初始布局：

- 总览与聚焦图独立布局，因此不依赖 Dagre 对带外部连线 sub-flow 的处理；默认支持从左到右和从上到下两种阅读方向。
- 自动布局只在初次投影或用户明确点击“整理布局”时运行；拖动后的版本化坐标不因渲染、展开或运行事件而跳动。
- React Flow 只拥有瞬时编辑交互；Dagre 只计算坐标。`TaskChain`、阶段分组、运行事件、revision checksum、executable digest、验证与发布仍由服务端拥有。
- B-A-T 只实现 TaskChain/阶段/运行事件到编辑器模型的薄适配和产品特有的运行、验证、发布、审计；不自研平移缩放、基础连线、缩略图或布局算法。

FlowGram/Coze 继续作为产品交互参考，但不作为本阶段编辑器依赖。官方示例的容器节点通过 `isContainer` 和展开后隐藏/显示子节点来形成大子画布，这与本决定“不常驻子路径、不把子图塞进大阶段容器”的结构不一致；同时其 document、form、history、variable 等广泛状态所有权会与现有服务端 revision 和事实源重叠。若未来出现 React Flow 无法覆盖的明确不变量，再以独立 ADR 重新评估，而不是并存两套编辑器。

`apps/workbench/prototype.html` 已验证上述交互层级并得到用户确认。它是设计证据而非产品实现：静态样本、模拟运行状态和原型查询参数不得进入生产事实源或正式验收。

## 结果

正面影响：

- 用户在链路上下文中完成运行、观察、等待、复盘和修订，操作位置与对象一致。
- 每次交互都有立即反馈，每条运行流都有唯一 execution 身份，刷新和重连不丢失事实。
- 阶段可读性与动作节点可审计性由同一 TaskChain 的不同聚焦层级共同提供，主图不会因技术路径常驻而失去可读性。
- 通过成熟开源编辑器减少自研画布基础设施和后续维护面。

代价与约束：

- 运行命令必须先补齐 accepted execution 回执与事件序列合同，不能只在前端加按钮和动画。
- 现有 `LiveChain` 与 task list runner 接线需要重构；历史运行选择和实时事件订阅需要明确资源释放。
- 需要新增阶段展示合同和 capability descriptor；旧链缺少可靠分组时只能显示“未分组动作”。
- Dagre 只提供几何布局，阶段投影、上下文编辑和发布门仍是 B-A-T 独有职责。

## 被否决的方案

- 保留列表运行、仅给链路图增加跳转按钮：运行对象与反馈仍分离。
- 点击任务行直接运行：选择和高影响操作混在一起，无法提供可靠的输入、版本和幂等反馈。
- 只给现有静态图加 CSS 动画：没有单次 execution 绑定，动画无法代表真实运行。
- 主流程和技术路径维护为两套图：节点与运行状态会漂移。
- 把技术节点永久展开在阶段容器中：多种布局下会让主图高度失控、层级难辨并产生跨容器连线问题。
- 为本阶段迁移到 FlowGram：其容器子画布模式与目标交互不符，且广泛编辑器状态所有权会重复现有服务端能力。
- 继续手写坐标、引入 ELK 或自研布局：当前分层图只需 Dagre 的确定性有向布局，额外复杂度没有对应不变量。

## 验收约束

只有从正式 Workbench/API 证明以下事实，才能认为本决定已实现：

1. 从已发布链路画布点击运行，同一渲染周期出现启动反馈，服务端返回明确 execution；双击或网络重试不创建重复 execution。
2. 画布自动绑定该 execution，节点与连线随持久化事件流转；刷新或重连继续同一次运行。
3. 左侧列表点击只选择并打开任务，产生可见选中/加载反馈，不启动运行。
4. 总览只显示可读阶段；单击只临时显示一个动作摘要，进入阶段后同一画布显示真实动作、分支和异常出口，返回后总览视口稳定。
5. 人工等待、失败、取消、completed 和 cleanup_required 都在正确层级显示；普通复跑模型调用为 0，显式 `llm` 节点除外。
6. 选择动作节点后，右侧编辑器按 capability descriptor 显示上下文、前置条件、动作、后置条件和兼容替换；缺少 descriptor 时只读，不回退到 JSON 墙。
7. 服务重启后 exact chain reference 仍解析同一不可变 ChainPresentation；presentation/executable digest 分离，旧版本布局不被新草稿覆盖。
8. 修改动作或替换能力会使旧验证失效；只有聚焦验证重新证明阶段出口/后置条件可达后才能发布。完成后可再次运行、查看结果或进入版本化修订，旧版本和历史运行不变。

## 参考

- [Coze Studio 对 FlowGram 的说明](https://github.com/coze-dev/coze-studio/blob/main/README.md)
- [FlowGram.AI](https://github.com/bytedance/flowgram.ai)
- [FlowGram loop container](https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/nodes/loop/index.ts)
- [FlowGram loop expand/collapse](https://github.com/bytedance/flowgram.ai/blob/main/apps/demo-free-layout/src/utils/toggle-loop-expanded.ts)
- [React Flow layouting](https://reactflow.dev/learn/layouting/layouting)
- [React Flow Sub Flows](https://reactflow.dev/learn/layouting/sub-flows)
- [React Flow performance](https://reactflow.dev/learn/advanced-use/performance)
