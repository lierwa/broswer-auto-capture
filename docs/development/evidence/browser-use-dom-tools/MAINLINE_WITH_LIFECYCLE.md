# Source lifecycle diagnostics 后的原任务正式验收

日期：2026-09-17

结论：**未通过**。本次唯一正式 source 已自然结束并持久化 1 份 source artifact，但该 source 的 trace 为 `completed=false`、`judged=false`，业务输出为 `null`，因此正式 authoring job 被 `hybrid_successful_judged_source_required` 门禁拒绝。没有 candidate、sample 或 verification。

这次已不再是“24 分钟到点前没有 source artifact”的失败。source lifecycle diagnostics 在运行中持续落盘，最终可以确认失败发生在 browser-use 探索及 source 验收层：32 个浏览器动作中有 22 个成功、10 个失败；8 次 `bat_read_fields` 全部失败，未形成字段读取结果、后置条件证据或完整输出。

## 固定身份

- source manifest digest：`07f5141c1cc5cba0e735d3b1c3d53068b12a7da64f5f3f769182b42674bb20e6`
- 探针 SHA256：`093c68232ee5ead1305d79bdf1bb9a7e88ef5eea798515b3a51304d3616369cc`
- task：`79b4e6a3-b500-4d52-98c7-f9370638675e`
- requirement：`3960924a-335c-4fe3-81b9-19f8add50473` v2
- plan：`e84c7660-21f6-44ac-87af-1826450c9e45` v6
- input：`{"startUrl":"https://github.com/langchain-ai/langgraph"}`
- model：`gpt-5.6-terra`，reasoning effort `medium`
- run：`30db3c05-a8e9-47b5-907f-9e19d5ba1e80`
- job：`3f85a872-69b6-4f87-8792-790ae762212a`
- browserRunId / diagnostic ownerId：`ca1aaa1b-4978-4099-8227-89edf84b8aab`
- 隔离库：`work/natural-task-validation/30db3c05-a8e9-47b5-907f-9e19d5ba1e80/workbench.sqlite`
- source artifact：`work/natural-task-validation/30db3c05-a8e9-47b5-907f-9e19d5ba1e80/source-result.json`
- lifecycle diagnostics：`work/natural-task-validation/30db3c05-a8e9-47b5-907f-9e19d5ba1e80/source-lifecycle-diagnostics/ca1aaa1b-4978-4099-8227-89edf84b8aab.jsonl`
- 脚本证据：`docs/development/evidence/browser-use-dom-tools/mainline-natural-30db3c05-a8e9-47b5-907f-9e19d5ba1e80.json`
- 完整运行日志：`/private/tmp/mainline-with-lifecycle.log`

正式命令只执行一次，并包含 `--run`：

```text
ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false BAT_UPSTREAM_BROWSER_HEADLESS=true node --import tsx /private/tmp/mainline-natural-probe.mts --run > /private/tmp/mainline-with-lifecycle.log 2>&1
```

## 终态

- 正式脚本进程 exit code：`1`
- job status：`failed`
- job stage：`exploring`
- failure layer：`browser-use 探索`
- reason：`生成未完成：hybrid_successful_judged_source_required`
- source：`acceptedSourceCount=1/1`、`status=explored`、`closed=true`
- source flags：`sourceSuccess=false`、`sourceValidated=false`、trace `completed=false`、trace `judged=false`
- trace：32 actions、70 observations，业务 `output=null`
- candidate：`false`
- sample：`false`，attempts `0`
- verification：`false`，attempts `0`
- 隔离库：chains `0`、taskExecutions `0`、executions `0`、browserRuns `0`、taskArtifacts `1`、audits 表记录 `0`
- source 内模型审计可用：Terra medium 的 agent 调用 `38 intended / 32 completed / 6 failed`；没有 judge 调用
- cleanup：`applicationClosed=true`、`sourceContractsUnchanged=true`

## Lifecycle diagnostics 与动作归属

诊断文件共 282 条安全事件。`author` 从 started 到 completed，持续约 707.63 秒；终态没有 active phase。最长失败模型调用约 48.32 秒，没有单次模型调用超过 180 秒。

动作聚合：

- `navigate`：1 次成功
- `click`：2 次成功
- `input`：1 次成功
- `find_elements`：18 次成功、2 次失败；失败后曾恢复成功
- `bat_read_fields`：8 次失败、0 次成功

8 次 `bat_read_fields` 分布在 trace step 12、13、16、21、32、33、34、36。Agent 确实多次调整了 container 和字段 selector；前 7 次写入 `pages[0].issues`，最后一次缩小到 `pages[0].issues[0]`。所有失败动作在持久化 trace 中都指向同一个脱敏结果引用：`sha256:46bd73c68fe60cd7ccc09de1f0e934232225b379b4383d7633ec17cbbb19c965`。

这证明失败不是“没有尝试字段读取”，也不是 diagnostics 把同一组参数重复记录了 8 次。当前 source artifact 只保留失败状态、参数和脱敏结果引用，没有保留可直接读取的原始错误反馈正文，因此仅凭该 artifact 不能进一步确定是 container 未命中、字段 selector 未命中，还是动作结果校验拒绝。不能把 8 次失败归因成某一个具体 selector 缺陷。

trace 中没有成功 `bat_read_fields`，也没有分页、第二页详情或 `go_back` 动作。后续 `find_elements` 虽然能够继续成功，但不能替代正式字段结果、真实两页业务输出和 summary。

## Source 验收 gaps

编译/验收记录了 6 个 gaps：

- `missing_binding`：`natural_binding_evidence_missing:text`
- 两条 `invalid_source`：`successful_action_result_required`
- `missing_effect_proof`：`natural_postcondition_evidence_missing`
- `invalid_source`：`successful_judged_business_result_required`
- `missing_effect_proof`：`natural_output_assembly_incomplete`

失败动作在 coverage 中被标为 `agent_internal` / `failed_bat_field_read_probe/v1`，没有被编译成可复跑链路。最终 `outputAssembly=null`，所以 candidate gate 拒绝是正式 source 证据不足的结果，不是脚本把一个成功 source 误报为失败。

## 清理与验收边界

finally 已关闭应用，隔离目录不再有 SQLite lock。按 runId、browserRunId 和探针路径检查进程时，仅匹配到检查命令自身，没有属于本次运行的 Node、Python 或 Browser 进程残留。

本次没有运行 `/private/tmp/bat-mainline-verify.mjs`。因为 sample 未生成且未通过，不具备加载同一候选做不同 input verification 的前提。失败证据保留在隔离库、source artifact、lifecycle JSONL 和 `/private/tmp` 日志中；没有自动重跑 source，也没有修改来源成功标记。
