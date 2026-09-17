# 动作后快照一致性修复（2026-09-17）

> **2026-09-17 纠正：** 代码只检查采集时的 URL／tab 一致性，不证明 DOM 已就绪、业务异步已完成或 URL 变化由上一个点击引起。以下“导航在中间完成”为当时解释；引用的临时复验文件本次未找到，不作为本次重新核实的因果证据。保留此检查仅用于采样身份一致性。

真实 GitHub 故障为 `observation_url_changed`：新快照内部先取URL再构建DOM，导航在中间完成，collector因快照与实时URL不一致拒绝后态。`get_browser_state_summary`默认不走缓存；原失败证据保持不变。

最小补丁仅改 `hybrid/capture.py` 并新增 `snapshot_consistency.py`。动作后重采使用现有Tenacity、30秒总超时/100次/300ms；只重试专用URL不一致。每次重新取summary，检查tab/URL，重读现场facts，末尾再次校验。query、action-result、extract/field/summary结果事实只生成一次；失败尝试不进入observations。动作前采集不重试，tab变化/取消/其他异常立即传播。没有新增LLM接口字段、模型调用或动作执行入口。

代码主审、两文件py_compile及现有venv Ruff通过。临时反例诊断 `/private/tmp/bat-post-snapshot-coherence-diagnostic.py` 覆盖重采事实、错误tab不重试、持续URL不一致有界失败、取消立即传播。诊断中的常量actions计数不作为“动作未重派”的运行证据；该项由无动作入口的代码检查及真实trace动作次数核验。

root仅更新上述两个owned源码的manifest，并确认未owned源码未变化。新sourceDigest：`4445920edd2f6ffa96db5a0a0ccaf9bc0482ef442e17aeffe666a8d002ccd82e`；`setup-upstream-browser-runner.mjs --check`通过。原GitHub两动作复验及正式原任务结果待追加，当前不得称完整验收通过。

真实 GitHub 两动作复验通过：`/private/tmp/bat-github-after-step-probe-post-snapshot-coherence.json`（SHA256 `60967164d325f9c487929c6810f8fceca31e5a0429eaebf6f134914fb69141af`）。navigate/click/done各一次、均succeeded且都有后观察，sourceSuccess=true，boundaryFailures为空，browserClosed=true。旧红证据未覆盖（SHA256 `0a61f31657157caffcace72e1a74f26caf1a879b62f441ac5588a54874e8b9f7`）。这是实际故障点的无provider诊断，主线继续使用真实provider正式入口验收。
