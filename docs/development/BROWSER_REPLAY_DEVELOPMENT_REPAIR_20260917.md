# 浏览器任务链开发方案

## 目标

将自然语言浏览器任务转换为可保存、可参数化、可复跑的 TaskChain。

首次执行由 browser-use（b-u）探索页面并完成任务。系统记录动作、目标、上下文和结果，编译为任务链。复跑使用普通浏览器能力执行确定性步骤；需要视觉、语义判断或处理复杂页面状态的步骤，通过显式 LLM 节点调用 b-u。

## 能力与交付顺序

| 模块 | 交付结果 | 依赖 | 验收状态 |
| --- | --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 可还原的动作参数、真实命中上下文和动作结果 | 原生 Browser/Tools | 受控正式入口通过；实际页受 provider 传输阻塞 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 可重新解析的目标与有来源的字段数据 | 原生 DOM 查询；A 的目标上下文 | 待验收 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 滚动、操作、异步等待、读取按条件顺序衔接 | B 的目标/读取接口 | 待验收 |
| [D b-u 节点](replay-repair/D_EXPLICIT_BU_NODE.md) | 在当前浏览器中完成指定局部任务的显式 LLM 节点 | 原生 Agent、模型桥、现有 llm 节点 | 待实现及验收 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 保存加载、同链换输入、弹窗差异及完整业务验证 | A–D | 待验收 |

从 A 开始。每个模块交付正式入口可调用的版本，完成独立验收后再组合。D 的会话复用接口可提前核验。每次实施只修改当前模块所需文件及直接消费边界。

## 代码入口

| 目录 | 职责 |
| --- | --- |
| `vendor/workflow-use/workflows/workflow_use/hybrid/` | 原生能力适配、动作证据、字段读取、编译 |
| `apps/api/python/browser_use_runner/` | Python runner、浏览器会话、模型连接 |
| `apps/api/src/upstream-browser/` | 跨语言协议、来源存储、TaskChain 物化、运行适配 |
| `apps/api/src/task-chain/` | 产品 authoring、运行、恢复、结果发布 |
| `packages/contracts/`、`packages/runtime/` | 通用 TaskChain 合同、LangGraph 运行时 |

当前固定依赖为 browser-use 0.13.8、workflow-use 0.2.11。实际源码与修改由 `vendor/workflow-use/UPSTREAM.json`、`LOCAL-CHANGES.json` 和 `verify-source.mjs` 校验。开工先检查当前工作区差异及相关文件的实际消费者。

## 实现约束

- 自然语言任务是需求入口；内部协议由程序和工具生成，LLM 接口仅保留必要字段。
- 复用 b-u 的 Agent/Browser/Tools、w-u 的 StepVerifier、Tenacity 和 LangGraph；B-A-T 负责适配、绑定、版本、运行与审计。
- 普通节点不调用模型；显式 LLM 节点允许多轮观察和操作，并执行步骤、时间及取消预算。
- 一个产品运行使用一个实际浏览器控制会话；借用会话的节点不得关闭运行所有者的浏览器。
- 公共源码不包含网站专用选择器、业务字段或样本输出。它们随任务版本保存。
- 执行原值保存在受控运行产物中；日志、Git 和测试快照不包含敏感页面原文、账号或 profile。
- 开发主/子 agent 继承 session 的 modelId 和 reasoning effort；产品模型路由保持现有配置。
- 代码文件上限 500 行；文档不限。工作区与变更操作遵守根目录 AGENTS.md。

## 验收要求

每个模块通过同一生产入口完成三项验证：可重复的真实浏览器边界场景、实际任务页面使用、变化输入或状态复验。以真实事件、页面值和业务副作用为依据；类型检查与 mock 测试仅验证局部合同。

交付记录必须包含源码版本、修改文件、验证入口、实际输入/输出、浏览器及模型调用、失败边界和资源关闭结果。失败定位到所属模块处理，修复前不重复整任务探索。
