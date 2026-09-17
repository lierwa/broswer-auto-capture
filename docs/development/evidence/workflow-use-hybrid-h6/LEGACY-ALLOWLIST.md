# H6 活动旧引用核查

> **2026-09-17 补充：** 无活动依赖的旧 `patches/workflow-use` 目录（12 个 patch 及 README）已删除，不在保留项中。vendor 源码和来源、修改清单继续承担构建与校验职责。

2026-09-16；范围：apps/api/src/upstream-browser、apps/api/src/task-chain、apps/api/python/browser_use_runner、scripts/setup-upstream-browser-runner.mjs。

活动调用匹配以下表达式为 0：

```text
HealingService | run_with_no_ai | run_agent_with_validation_repair
use_deterministic_conversion | .withSession( | session.replay(
upstream-browser-runner/source | patches/workflow-use
```

保留项均为类型、读取或明确拒绝：

| 路径 | 保留原因 |
| --- | --- |
| upstream-browser/protocol.ts | v1 数据类型及旧协议反例；运行实际采用 hybrid-protocol/Python REQUEST，旧 author/replay 不在 Python union |
| upstream-browser/service.ts | v1 Session/Result 类型和立即抛退休错误的 withSession/start/author/replay 壳；正式方法为 withAuthoring/withCapabilities |
| upstream-browser/workflow-artifact.ts | 历史 decoder、变量读取辅助；writer/compiler 仅退休错误壳，没有编译/写入实现 |
| upstream-browser/retirement.ts | 检测 v1/delegate/mixed 并在外部动作前拒绝 |
| task-chain/runtime-host.ts | 缺 provider 的错误壳；保留旧 BrowserSkill 诊断入口，正式 v2 authoring 不调用它 |
| packages/contracts 与历史测试 fixture | 兼容读取和主动证明旧数据不能执行；不作为 v2 生成输入 |

旧代码归档的 10 条摘要全部匹配 preserved-source.json；不是删除历史记录。受影响检查：正式 authoring/失败来源/严格协议 5 项通过；此前 v1 退役 3 项通过。检查不等于 H7 真实业务验收。
