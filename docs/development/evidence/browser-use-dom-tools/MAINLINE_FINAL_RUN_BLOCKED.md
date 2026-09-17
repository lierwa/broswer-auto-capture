# 原任务正式验收权限阻塞历史（2026-09-17）

最新状态：权限已解除，真实运行 `fb3775e0-7e17-40fa-bcff-6ed22cb07a19` 已完成清理，当前失败为来源点击后采集中断，详见 MAINLINE_FIRST_LIVE_FAILURE.md。

授权补充：用户随后逐字明确“我允许使用现有 Codex 订阅，将本次已确认需求、计划、输出格式，以及 GitHub 页面文字和截图发送到 chatgpt.com，完成原任务测试。”root已按该精确授权恢复唯一正式验收，原拒绝与无进程事实保留为历史。此次执行agent=01a0ab6f-0f4d-7b90-ad7d-e0f8ab350da6，实际Sol/high已核验。

历史结果：用户明确说“给你权限了”后，root将其解释为前述具体范围的知情测试授权，并让新Sol/high子agent恢复相同命令。自动审批再次拒绝，认为“做测试”仍未明确授权具体payload发往chatgpt.com。命令在进程创建前被拒绝，无process session、无新runId、无Browser/source；未绕过。实际执行agent=01a0ab6a-f0a5-75e0-b7db-4e3cfe162dcf，turn_context已核验Sol/high。下方“恢复记录”保留当时决定，不能作为本次已运行证据。

第二次拒绝理由原文：`该测试会将原任务及可能包含敏感内容的需求/计划数据经模型连接发送到 chatgpt.com，并启动浏览器和写入本地证据；用户仅概括授权“做测试”，未明确授权该具体 payload 发往该目的地。`

恢复记录：用户已在获知现有 Codex 订阅、任务与 GitHub 页面内容发送范围后明确授权继续测试。原拒绝保留为历史；现在按 MAINLINE_FINAL_RUN_TASK.md 恢复正式验收，不再把缺授权当作当前阻塞。

当时结论：**未完成**。该次受限沙箱运行已由正式 HTTP 入口接受（202），随后在 `browser-use 探索` 阶段因本机模型桥无法监听 `127.0.0.1` 而失败。按任务规则保留隔离库与来源，不重跑 source。沙箱外原命令被自动审批拒绝，未绕过。

## 运行身份与结果

- 执行时间：`2026-09-17T01:42:37+08:00`
- 执行 agent：`CODEX_THREAD_ID=01a0ab4b-58a3-7432-93a0-97d350d862ad`，`gpt-5.6-sol/high`
- runId：`c1fb5edf-6d28-4c80-84f0-b5456a39d170`
- authoring job：`54d81fff-8306-4f3b-8af0-6c2280e5676c`
- 原任务：task `79b4e6a3-b500-4d52-98c7-f9370638675e`；requirement `3960924a-335c-4fe3-81b9-19f8add50473` v2；plan `e84c7660-21f6-44ac-87af-1826450c9e45` v6
- 输入：`startUrl=https://github.com/langchain-ai/langgraph`
- 正式入口：`generate_task_chains`，HTTP `202`
- job：`failed`；stage：`exploring`；failureLayer：`browser-use 探索`
- reason：`生成未完成：listen EPERM: operation not permitted 127.0.0.1`
- source：0；candidate：0；sample：0；verification：0
- 隔离库定点查询：`chains=0`、`executions=0`、`taskExecutions=0`、`browserRuns=0`、`taskArtifacts=0`、`taskAuthoringJobs(failed)=1`、模型审计行 0
- cleanup：`applicationClosed=true`；`sourceContractsUnchanged=true`

## 自动审批拒绝原文

> This action was rejected due to unacceptable risk.
> Reason: 该命令会启动正式浏览器/模型验收并将本地任务合同等未知敏感数据发送至外部服务；用户未明确授权该具体载荷及目的地。
> The agent must not attempt to achieve the same outcome via workaround, indirect execution, or policy circumvention. Proceed only with a materially safer alternative, or if the user explicitly approves the action after being informed of the risk. Otherwise, stop and request user input.

被拒动作是以同一已审查探针、同一环境和同一输入在沙箱外补偿运行一次，用于允许模型桥监听本地端口，解决第一次运行中已经证实的 `listen EPERM`。未再次执行。

## 若用户授权，实际外发范围

浏览器目的站点为 `github.com`，具体入口为上面的 `startUrl`。运行使用临时 Browser profile；探针没有复制账号、Cookie 或既有 Profile。

当前公开 AI Connect 配置显示：连接种类 `official`，integration `openai-codex:oauth`，provider `openai-codex`，API `openai-codex-responses`，目的端点 `https://chatgpt.com/backend-api`（域名 `chatgpt.com`）；选中模型为 `gpt-5.6-terra`，reasoning effort 为 `medium`。本记录没有读取或输出 token。

发送给模型的字段范围由现有公开请求结构限定为：

- 请求元数据：用途只允许 `agent`、`judge`、`extract`、`semantic_annotation`，以及可选的上游 session id。
- 指令与消息：BrowserUse 系统指令、B-A-T 自然任务指令、已确认需求正文、步骤名称与业务目标、计划摘要、前置步骤、调用模式、真实运行输入、输入/输出 schema、完成条件、授权范围和风险停止点。
- 浏览器上下文：Agent 为 `use_vision=true`；模型消息结构允许页面相关文本和 `png/jpeg/webp/gif` 图片数据。因此实际运行可能把当前 GitHub 页面中 Agent 选择的可见文本/DOM 表示与截图发送给模型。原始 Agent history 不持久化不等于这些上下文不会在当次模型请求中外发。
- 结构化返回约束：需要结构化输出时附带 JSON Schema。
- 不外发到 Python 子进程的账号凭据：Python 只得到本次 localhost 模型桥的随机口令；AI provider 凭据保留在 TS AI Connect 中。

第一次失败发生在打开 localhost 模型桥时。隔离库中模型审计、browserRuns 和 source 均为 0，因此当前证据没有证明任何模型请求或浏览器站点访问已发生。

## 保留产物

- 临时探针：`/private/tmp/mainline-natural-probe.mts`，SHA256 `093c68232ee5ead1305d79bdf1bb9a7e88ef5eea798515b3a51304d3616369cc`
- 沙箱失败日志：`/private/tmp/mainline-final-run.sandbox-denied.log`，SHA256 `b97840885de45ae83ad51e391af0bfc347c67b684e1d2ef68ea1e5ef27d779b2`
- 隔离库：`work/natural-task-validation/c1fb5edf-6d28-4c80-84f0-b5456a39d170/workbench.sqlite`，SHA256 `5cc1a229b104ae2fc61f735917652d862fd73c68fa495ad189a5b61339de5be0`
- source 结果：`work/natural-task-validation/c1fb5edf-6d28-4c80-84f0-b5456a39d170/source-result.json`，SHA256 `bbd993c5cd473ce1d4a34bb6fcd2c171ca0286c71eba0a454b12c0f363b6b0bd`
- evidence：`docs/development/evidence/browser-use-dom-tools/mainline-natural-c1fb5edf-6d28-4c80-84f0-b5456a39d170.json`，SHA256 `c66349b3c04a5ccd378c94a93934d7cccf695c4483d0ac9d80e92728684ab46b`

当前状态：具体授权已经取得，沙箱外正式运行已执行；见 MAINLINE_FIRST_LIVE_FAILURE.md。权限阻塞已解除，下一步定位真实来源点击后的采集异常。sample 尚未通过，仍未执行同链换输入 verification。
