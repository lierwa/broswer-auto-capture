# 开发进度

当前开发入口为 [浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。架构边界以
[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md) 为准。

## 当前状态

| 模块 | 状态 | 当前事实 |
| --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 进行中 | 受控正式入口已通过；实际任务页在首个浏览器动作前被模型 provider 的 `fetch failed` 阻塞 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 未开始 | 等待 A 的实际页与变化状态验收 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 未开始 | 依赖 B 的稳定目标和字段读取 |
| [D 显式 b-u 节点](replay-repair/D_EXPLICIT_BU_NODE.md) | 未开始 | 需要复用当前 Browser 会话、原生 Agent 与现有模型桥 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 未开始 | 依赖 A–D |

A 的受控 Chromium 验收在一个 Browser 会话中覆盖 37 个动作、120 个真实 DOM 事件和 42 个业务副作用；
dispatch/result、动作前后 observation 与保存加载均完成对账。该结果只证明受控边界，不代表实际任务页或完整链路通过。
详细事实见 [A 验收记录](evidence/browser-replay-repair/A_ACCEPTANCE_CONFORMANCE.md)。

实际任务页运行在 `browserCommands=0` 时因 provider 传输失败结束。账号连接和模型选择可读，现有证据不支持把原因归为
账号失效；项目代码不得写入 TUN/VPN 绕行。见 [传输阻塞记录](evidence/browser-replay-repair/AI_CONNECT_TUN_TRANSPORT_BLOCKER.md)。

## 当前实现边界

- 固定 browser-use 0.13.8、workflow-use 0.2.11 与 Python 3.12；运行只消费受管 fork 的生产源码子集。
- TaskChain、版本、绑定、运行、恢复和审计由 B-A-T 持有；LangGraph `StateGraph` 仍是唯一图执行器。
- 普通复跑节点不调用模型；只有显式 `llm` 节点可以调用模型并记录审计。
- 原始任务数据、浏览器 Profile、账号配置和 Git 忽略的真实运行产物未参与本轮清理。

## 2026-09-17 仓库清理

- 删除最新提交引入的 290 个无运行职责文件：上游 UI/扩展/示例/开发测试、一次性 API 测试与探针、重复方案文档、
  历史 evidence 和临时 agent 配置。
- 保留 `workflow_use` 生产源码、AGPL-3.0 许可证、来源清单、主链测试需要的最小 fixture、A–E 模块说明及 A 当前证据。
- `PROGRESS.md`、`ROADMAP.md`、`RESEARCH.md` 已收敛为当前事实，不再保存逐轮日志。
- 留存源码的 manifest 校验和 API TypeScript 检查通过；`git diff --check` 通过。当前机器没有 `uv`，且不存在
  `work/upstream-browser-hybrid/.venv`，因此未安装依赖，也未运行依赖该环境的主链测试。

## 下一步

先通过一次不启动浏览器的 provider 传输门，再完成实际任务页 A 和变化输入/状态 A。两项通过后按 B → C → D → 组合验收推进。
每阶段只记录正式入口结果、模型/浏览器调用、失败边界和资源关闭状态。
