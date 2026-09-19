---
status: accepted
date: 2026-09-19
supersedes: TASK_CHAIN_ARCHITECTURE.md 2026-09-17 中显式 LLM 复用 browser-use Agent/Tools 处理陌生页面状态的决定
---

# 确定性干扰处理与显式决策节点边界

## 背景

原 D 方案把“陌生弹窗或复杂页面状态”路由到可多轮操作 Browser 的 b-u LLM 节点。真实 Chromium 反例证明这无法形成清晰合同：native dialog 能由 CDP 事件识别，DOM 蒙层只能证明目标缺失或命中被截获；`role=dialog`、样式和关闭图标都不能证明页面元素是可安全关闭的干扰。滚动无位移也可能来自无范围、边界、CSS 锁定、事件取消或错误容器。

同时，当前 stable/v1 只有 `capability/llm/branch/loop/invoke/terminal`：缺少链路内纯函数，branch 固定为 true/false，llm 还允许 delegate Agent。该结构既不能表达 Dify/Coze 式的 Function + 多路控制流，也把模型决策和浏览器操作混在一起。

## 决策

### 1. 未知干扰不调用 LLM

运行时只记录 native dialog、目标解析、`elementFromPoint`、真实事件命中、scroll/wheel 和业务后态等可观察事实。预执行已证明的关闭动作可以成为可选准备动作：原目标已就绪则跳过；原目标未就绪且准备目标唯一时执行一次；随后必须重查原目标。

预执行未出现、运行时新出现的 DOM 阻挡没有保存的安全处理证据。当前运行失败并保存证据，用户后续发起修复后生成新链路版本。平台不扫描“像弹窗”的元素、不猜关闭按钮、不用 LLM 临时接管。业务确认、登录、验证码和权限按各自语义或人工等待处理。

### 2. 引入 stable/v2 Function

新增 `function` 节点，执行随链路版本保存的 JavaScript 纯函数。输入来自 ValueBinding，输出是一个满足 TaskDataContract 的 JSON 值。函数不能访问 Browser、模型、网络、文件、环境变量、进程、时间或随机数，也不能修改图。

执行器采用 QuickJS/WASM 的成熟实现，通过有界时间、内存、源码和输出大小限制隔离执行。该适配器必须在 Windows 与 macOS 上以同一合同、同一限制和同一错误语义运行；不得用 `node:vm`、宿主 `eval` 或自研解释器替代安全边界。

### 3. Branch 使用动态多路 port

新增有序 N-case + default + failed 的 branch 合同。按顺序选择第一条命中 case，边使用稳定 case id 作为 port。case 数只受 TaskChain 总节点/总边和运行预算约束，不固定为二路或任意业务数量。

stable/v1 的 true/false/failed 原字节可读；新 writer 只产 stable/v2。Workbench、compiler、runtime 和审计共享同一 port id，不把用户看到的多路节点暗中展开成二元节点串。

### 4. LLM 是显式单次单值决策节点

LLM 节点只能来自用户明确要求或用户已确认的 TaskPlan 语义步骤。B-A-T 可在计划阶段提出使用模型，但不能静默加入；运行时更不能因普通失败新增 LLM。

prompt 在编译时生成并随链路版本保存。运行时只绑定一个 JSON 输入，最多调用 provider 一次，并只接收一个名为 `result` 的类型化值。模型不返回 reason/confidence/status 等平台字段，不返回节点、边、selector、动作或预算。

LLM 不拥有 Browser、Tools、Agent loop 或 delegate。页面数据和截图先由普通能力形成输入；LLM 输出由 Function/Branch/Capability 继续消费。错误、模型身份、token、耗时和状态由宿主审计。

## 依据与复用

Dify 将 Code、IF/ELSE、LLM 和错误出口分离，并建议规则化处理使用非 LLM 节点。Coze Studio 的工作流使用动态 branch/default/exception port，Code Runner 也把 sandbox 与 local 执行区分开。B-A-T 复用这些职责分离原则，但不引入它们的图引擎。

Reuse Assessment:
- capability: 隔离纯函数、多路条件路由、显式语义决策与确定性干扰恢复
- existing implementation in repository: TaskChain stable/v1、LangGraph runtime、ValueBinding、browser-use adapter、模型桥和运行审计
- mature candidates and pinned versions: quickjs-emscripten 0.32.0；Dify Workflow/Dify Sandbox；Coze Studio workflow ports/code runner
- selected implementation: QuickJS/WASM function adapter；TaskChain stable/v2 动态 port；现有 AI Connect 单次模型桥
- reused public surface: QuickJS runtime/context/interrupt；现有 Zod contracts、LangGraph、Browser/CDP 和模型审计
- B-A-T-owned adapter and remaining gap: 节点合同、版本兼容、输入输出校验、port 物化、可选准备动作、UI 与产品证据
- license/runtime/platform fit: quickjs-emscripten MIT，通过 Node/WASM 面向 Windows 与 macOS；平台可移植性必须由同一 commit/lockfile 的双平台实机测试证明，不能由 WASM 理论兼容代替；Dify Sandbox 为 Apache-2.0 但要求 Linux/seccomp，不直接采用
- browser/runtime/state ownership conflicts: Function/LLM 不拥有 Browser；browser capability 继续使用唯一产品会话；LangGraph 仍是唯一图执行器
- replay model calls: 普通干扰、Function、Branch 为 0；每个实际到达的显式 LLM 节点为 1
- rejected candidates and evidence: node:vm 官方声明不是安全机制；Dify Sandbox 默认要求 Linux；Coze local runner 无隔离；b-u Agent 会把模型判断和浏览器动作重新混合
- focused validation: Windows x64 与 macOS arm64 的 Node 24 sandbox spike（若产品声明支持 Intel Mac，再加 macOS x64）；D1 可见/headless 干扰矩阵；stable/v1 只读；stable/v2 保存加载；Function/Branch/LLM 正常与错误出口；真实页面不同输入

## 后果

- 原 D “b-u 局部 Agent 兜底”退出，不再实现。
- 新链增加 `function`，branch 不再固定二元，llm 移除 delegate。
- 某些未知干扰会诚实失败，直到预执行/修复取得安全处理证据；这比自动误关业务确认更可控。
- 需要浏览器操作的语义任务必须拆成“普通观察 → LLM 单值 → Branch → 普通动作”，不能在一个节点里完成多轮浏览器 Agent。
- `stable/v2` 需要 contracts、compiler、runtime、Workbench 和持久化原子接线；历史 stable/v1 保持只读。
- D2 只有在 Windows 与 macOS 必需目标上都通过同一套超时、内存、栈、隔离和释放验证后才能关闭；任一平台失败或未测都必须停在 D2，不能以单平台通过宣称跨平台可用。

## 规范性文件

- [D 阶段开发方案](../development/replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md)
- [自然语言浏览器任务链路架构基准](../development/TASK_CHAIN_ARCHITECTURE.md)
- [当前路线](../development/ROADMAP.md)
