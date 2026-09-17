# Mainline first live source failure (2026-09-17)

## 结论

本次正式 source 验收已实际启动并完成 `finally` 清理，但未生成可执行候选，也未进入 sample。进程退出码为 `1`。当前只确认 authoring 在 browser-use 探索阶段失败；底层异常正文未被保存，因此根因尚未定位。

## 运行身份

- 隔离 runId：`fb3775e0-7e17-40fa-bcff-6ed22cb07a19`
- authoring jobId：`75fb9159-8e5b-4e64-8d91-fbea286ae0d7`
- job 记录的 browserRunId：`205aa484-fae8-4ba9-87a2-356388c94ea2`
- task：`79b4e6a3-b500-4d52-98c7-f9370638675e`
- requirement：`3960924a-335c-4fe3-81b9-19f8add50473` v2
- plan：`e84c7660-21f6-44ac-87af-1826450c9e45` v6
- fork sourceDigest：`a62bfcf8150703af21eb62ad915a914dacbef38a2b0199afcae5155c7d09f630`

## Source 结果

- source 接受数：`1/1`
- `source_success=false`
- `source_judged=false`
- `source_closed=true`
- browser commands：`2`
- action `a-0001`：`navigate`，状态 `succeeded`，有 pre/post observation，effect 为 `navigation`
- action `a-0002`：`click`，selector index `1370`，状态 `succeeded`，只有 pre observation，没有 post observation；trace 将 effect 记录为 `external_write`，但本证据不证明 GitHub 发生了实际写入
- authoring job：`failed`，stage 为 `exploring`，reason 为 `生成未完成：hybrid_successful_judged_source_required`
- 编译缺口包含 `capture_callback_incomplete`、`missing_action_post_observation`、`native_agent_run_failed`、`successful_judged_business_result_required`、`natural_output_assembly_incomplete` 和 `action_pre_and_post_required`

这些缺口是失败后的观测结果，不等于根因。现有 authoring 记录只保留了 `native_agent_run_failed`，没有保留下层异常正文；在取得新的运行或异常传播证据前，根因保持未定位。

## Candidate 与 sample

隔离数据库只读核验结果：

- `chains=0`
- `executions=0`
- `taskExecutions=0`
- `browserRuns=0`
- `audits=0`
- `taskArtifacts=1`，仅为 workflow-use source artifact
- `candidate=false`
- `sample=false`
- `sampleAttempts=0`
- `verification=false`
- `verificationAttempts=0`

因此，本次运行没有候选、sample run、业务输出或换输入 verification；不得将进程已启动或 source 已关闭解释为业务通过。

## 模型审计

source artifact 内记录了两个 `agent` 调用，模型均为 `gpt-5.6-terra`、reasoning effort 为 `medium`：

- `59558144-7c8b-4b8a-a186-3f6d34db927a`：`intended` 后 `completed`，`reportedInvocations=1`
- `ac6c31c9-66d4-4792-9dcb-62bb014022f2`：`intended` 后 `completed`，`reportedInvocations=1`

合计两次已报告 provider invocation。独立 `audits` 表为空；本节证据来自已持久化的 source artifact。

## 清理与保留证据

- `applicationClosed=true`
- `sourceContractsUnchanged=true`
- 未重跑 source，未执行换输入 verification
- source result：`work/natural-task-validation/fb3775e0-7e17-40fa-bcff-6ed22cb07a19/source-result.json`
  - SHA-256：`9a9e64d615f68f91e3fea65ef50be67b48ffbba2e2659e4ac9b056b7b88501d8`
- evidence：`docs/development/evidence/browser-use-dom-tools/mainline-natural-fb3775e0-7e17-40fa-bcff-6ed22cb07a19.json`
  - SHA-256：`0de2a588d31da1672e3fda815df2fcb4713fe28f531bc9529da72af046c3a316`
- stdout/stderr：`/private/tmp/mainline-explicit-consent-run.log`
  - SHA-256：`3a0d95b63e1a57a5bf97418f3c3b70ac4b6dcd16265c079b3d9435b85c79f372`

## 后续只读诊断已定位

真实两动作探针 `/private/tmp/bat-github-after-step-probe.py` 重现相同故障；脱敏证据 `/private/tmp/bat-github-after-step-probe.json`。实时 selector index 为 1363（没有复用原来源的 1370），navigate 成功且有后观察，Issues click 成功而后观察缺失。精确错误为 `ValueError: observation_url_changed`，触发于 `capture.after_step → capture.observe` 的 summary.url / live_url 摘要校验。未调用 provider，Browser 已 finally 关闭。

锁定 browser-use 0.13.8 源码说明：BrowserSession.get_browser_state_summary 默认 cached=False，当前调用已请求新快照；DOM watchdog 在构建前读取 page_url，经过异步 DOM 工作后仍把这个早读 URL 写入 summary。same-tab 导航可在中间完成，形成早读URL与当前DOM/实时URL不一致。本次不是缓存命中，不能用关闭缓存或删除URL校验作为修复。

修复决定已写主计划：仅对动作后的这一专用不一致做有界完整重采；动作不重派、模型不重调、动作前快照不替换。当前仍未产生候选或 sample；本诊断不是完整主线通过。
