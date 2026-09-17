# 开发进度

当前开发入口为 [浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。架构边界以
[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md) 为准。

## 当前状态

| 模块 | 状态 | 当前事实 |
| --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 已通过 | 受控正式入口和真实 GitHub Issues 任务页均通过；来源业务结果及 judge 验证成功 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 未开始 | A 已交付实际页动作和读取来源；当前编译仍诚实保留字段读取缺口 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 未开始 | 依赖 B 的稳定目标和字段读取 |
| [D 显式 b-u 节点](replay-repair/D_EXPLICIT_BU_NODE.md) | 未开始 | 需要复用当前 Browser 会话、原生 Agent 与现有模型桥 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 未开始 | 依赖 A–D |

A 的受控 Chromium 验收在一个 Browser 会话中覆盖 37 个动作、120 个真实 DOM 事件和 42 个业务副作用；
dispatch/result、动作前后 observation 与保存加载均完成对账。真实 GitHub Issues 任务随后在同一个产品 Browser 会话内完成
两页列表及第二页首条详情，`sourceSuccess=true`、`sourceValidated=true`，结束后测试 Chrome 进程数为 0。编译仍保留 10 个
B/C/D 缺口，因此 A 通过不等于已有可冻结 TaskChain。详细事实见
[A 验收记录](evidence/browser-replay-repair/A_ACCEPTANCE_CONFORMANCE.md)。

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

按 B → C → D → 组合验收推进。每阶段只记录正式入口结果、模型/浏览器调用、失败边界和资源关闭状态。
