# S0-08 运行与恢复原型边界

状态：技术候选原型，编排引擎尚未最终冻结，产品链路 DSL 的图编译尚未完成。

本原型仅验证一个受限异步循环：公开请求经 Zod 校验后绑定 `runId`、`workflowId`、`workflowVersion` 与输入指纹；普通节点只获得可信注入的 `OrdinaryAdapter`。SQLite checkpointer 由官方 `@langchain/langgraph-checkpoint-sqlite` 提供，每项执行前保存稳定幂等键，成功后在同一节点更新结果和完成事件。

“planned 但没有 completed”表示 adapter 可能在副作用后、checkpoint 前失败。恢复会用同一幂等键重入，因此 adapter 必须可重入；本原型不提供也不宣称 exactly-once。浏览器恢复核验是可注入 stub，仅证明恢复门被调用，不证明真实浏览器状态已经重建。

`modelInvocationIntents` 由 `llm_gateway_call_intended` 边界事件派生。事件在进入网关前先持久记录，因此只证明调用意图经过受控边界；记录成功后、供应商请求实际发出前仍有崩溃窗口，它不是供应商计费凭证。普通循环测试中的 0 仅证明受控原型没有经过显式 LLM 网关，不等同于真实站点复跑的零模型证明；真实验收仍需接入实际 BrowserSkill/browser adapter 和持久审计来源。

外部 abort 会中止正在等待的 adapter，但不会凭空写入 `cancelled`：最后一个持久 checkpoint 仍是 `running`，包含 planned 而没有 completed。之后只能经输入绑定与恢复核验门，使用同一幂等键重入。产品是否把用户取消映射为终态需由后续运行生命周期协议决定。

`OrdinaryRunEngine` 只提供同一实例内的 start/resume 互斥，并在关闭前拒绝新运行；它不协调多个引擎实例，也不实现产品队列。官方 `SqliteSaver` 暴露其 better-sqlite3 `db` 句柄，本原型通过 `db.close()` 明确释放 SQLite/WAL 文件生命周期。

XState 5.32.6 对照显示：恢复停在活动 invocation 的持久快照会重新启动该 invocation。组合到当前副作用场景仍需与 LangGraph 相同的幂等键、输入绑定、恢复核验和额外持久化适配；同时维护两套运行语义的成本高于本阶段收益，因此这里只保留对照测试，不构建第二套编排层。
