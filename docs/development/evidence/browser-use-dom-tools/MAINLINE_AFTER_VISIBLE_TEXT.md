# Visible text 字段修复后的原任务正式验收

日期：2026-09-17

结论：**未通过**。本次唯一正式 source 在既有 24 分钟预算到点后超时，脚本终态为 `failed_before_source_acceptance`。隔离库只保留了被中断的 authoring job；没有 source artifact、浏览器动作、模型审计、candidate、sample 或 verification 落盘。因此不能判断字段修复是否在原任务中生效，也不能把本次超时解释为字段读取失败。

## 固定身份

- source manifest digest：`e22d025dc56d6505ed2786e822fb7c254f1d95d9b076a485ec9900d8dfe83e16`
- 探针 SHA256：`093c68232ee5ead1305d79bdf1bb9a7e88ef5eea798515b3a51304d3616369cc`
- task：`79b4e6a3-b500-4d52-98c7-f9370638675e`
- requirement：`3960924a-335c-4fe3-81b9-19f8add50473` v2
- plan：`e84c7660-21f6-44ac-87af-1826450c9e45` v6
- input：`{"startUrl":"https://github.com/langchain-ai/langgraph"}`
- model：`gpt-5.6-terra`，reasoning effort `medium`
- run：`c5388804-13b6-4c70-845b-d1316a0f7bd5`
- job：`d12bfa2f-3d3d-4b1b-85e3-886d4a26f0a2`
- browserRunId：`dc8545e4-6f29-44bd-8be7-5d98aa6d1b54`
- 隔离库：`work/natural-task-validation/c5388804-13b6-4c70-845b-d1316a0f7bd5/workbench.sqlite`
- 脚本证据：`docs/development/evidence/browser-use-dom-tools/mainline-natural-c5388804-13b6-4c70-845b-d1316a0f7bd5.json`
- 完整运行日志：`/private/tmp/mainline-after-visible-text.log`

原 requirement/plan 从原库只读复制到 UUID 隔离应用；原合同和 source manifest 未修改。正式命令只进入了一次 source。此前有一次遗漏 `--run` 的启动尝试，被脚本显式门禁在创建 runId 之前拒绝；它没有启动模型、浏览器或 source，日志保存在 `/private/tmp/mainline-after-visible-text-startup-attempt.log`。

## 终态

- 正式脚本进程 exit code：`1`
- 脚本 status：`failed_before_source_acceptance`
- reasonCode：`mainline_natural_probe_timeout`
- job status：`interrupted`
- job stage：`exploring`
- job createdAt：`2026-09-16T21:29:46.683Z`
- job updatedAt：`2026-09-16T21:53:48.406Z`
- job resultId：空
- source artifact：未落盘
- `source-result.json`：未落盘；日志打印其预期路径不代表文件存在
- candidate：0
- task execution：0
- sample：0
- verification：0
- browserRuns：0
- taskArtifacts：0
- model audits：0
- cleanup：`applicationClosed=true`、`sourceContractsUnchanged=true`

运行期间只能观察到同一 job 的 `running/exploring` 和仍存活的原进程树；隔离库没有写入更细的动作或模型调用记录。预算结束后，正式探针对 job 执行中断和 finally 清理。属于本次运行的 Node、Python、Chromium PID `80279`、`80280`、`80283` 均已消失，未清理其他浏览器进程。

## 验收边界

本次没有 source trace，不能核对实际两页、真实 bug label、排序、分页控件、第二页首条详情、`go_back` 后 fresh 字段读取或显式 summary。也没有 `target_observation_diagnostic`、字段读取结果、output binding 或 compilation gaps 可用于归因。唯一可证实的失败层是正式 source 在被接受并持久化之前超时；字段修复在原任务上的业务效果仍未验证。

没有运行 `/private/tmp/bat-mainline-verify.mjs`。不同输入同链 verification 仍等待 root 单独判断和授权。
