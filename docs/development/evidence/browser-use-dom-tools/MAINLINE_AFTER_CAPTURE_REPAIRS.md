# Capture 修复后的原任务正式验收

日期：2026-09-17

结论：**未通过**。正式入口接受请求并完成一次真实探索，source 执行成功且会话关闭，但 judge 拒绝该 source；没有生成 candidate，因此没有 sample 或不同输入 verification。不得把进程正常清理、`sourceSuccess=true` 或保存了结构化 output 解释为业务验收通过。

## 固定身份

- source baseline digest：`6fc78935a791184985736b7d351c3300c7276ace06ab3d8d485e14852df122e9`
- task：`79b4e6a3-b500-4d52-98c7-f9370638675e`
- requirement：`3960924a-335c-4fe3-81b9-19f8add50473` v2
- plan：`e84c7660-21f6-44ac-87af-1826450c9e45` v6
- input：`{"startUrl":"https://github.com/langchain-ai/langgraph"}`
- run：`5c333a80-53e0-45bd-9755-ae5560ed7608`
- job：`27223f9f-c59d-44db-84a6-27f3af337ea5`
- source artifact：`work/natural-task-validation/5c333a80-53e0-45bd-9755-ae5560ed7608/source-result.json`
- run summary：`docs/development/evidence/browser-use-dom-tools/mainline-natural-5c333a80-53e0-45bd-9755-ae5560ed7608.json`

原 requirement/plan 从原库只读复制到 UUID 隔离应用；`accountOrProfileCopied=false`。正式 `generate_task_chains` HTTP 返回 202。只执行了这一次 source，不重跑。

## 终态

- job：`failed`，stage=`exploring`，failureLayer=`browser-use 探索`
- reason：`生成未完成：hybrid_successful_judged_source_required`
- accepted source：1/1
- `sourceSuccess=true`
- `sourceValidated=false`，`trace.judged=false`
- `source.closed=true`
- candidate：0
- sample：0 次；没有 execution/run/output 可验收
- verification：0 次
- browser commands：29
- cleanup：`applicationClosed=true`、`sourceContractsUnchanged=true`

模型审计只属于首次探索：agent completed 30、failed 1；judge completed 1。因为 candidate/sample 都未产生，本次不存在可供核对的普通节点复跑、零模型复跑或显式 summary 节点模型审计。

## 确定的 source 缺口

### a-0008 overlay 变化不能证明完成

`a-0008` 是 succeeded click，目标索引 7586。其 pre `o-0013` 与 post `o-0014` URL digest 均为 `de5a055c...d296`，但 visible overlays 从 `4f53cda1...b945` 变为 `0f1f3489...f10a`。compiler 将 `a-0008` 标为 `not_compilable`，没有生成 `s-a-0008`，并给出：

- code：`missing_effect_proof`
- reason：`visible_overlays_change_not_completion_proof`
- resolution：`collect_evidence`

这条 gap 精确归属于 `a-0008`，不是 `a-0007` 或 `a-0009`。相邻 `a-0007` 与 `a-0009` 均生成了 segment。

### 唯一字段读取失败，输出没有完成工具绑定

整条 trace 只有一次 `bat_read_fields`：`a-0027`，status=`failed`。它尝试写入 `pages[0].issues[0]`，字段为 `number/title/labels/updatedAt/detailUrl`。对应 pre `o-0051` 保存了 container、fields、outputPath 三个 natural bindings；post `o-0052` 没有字段读取事实。compiler 只以 `failed_bat_field_read_probe/v1` 排除该动作。

具体 ActionResult 错误正文没有持久化，现有 source 只能证明调用失败，不能进一步断言是 DOM selector、返回形状或其他运行时错误。可以排除两种误归因：

- 不是成功读取后被最终 output 改写：没有任何 succeeded `bat_read_fields`，也没有可被改写的成功绑定值。
- 没有跨读取的重复 output path：整条 trace 只有这一次失败调用，没有成功 output paths 进入 assembly。不能把未保存的错误猜成 duplicate-path 错误。

另有一条独立且确定的合同缺口：该调用只指向 `pages[0].issues[0]`，没有读取 `pages[0].page`。后续也没有详情页字段读取和 `bat_summarize`。所以即使只看动作参数，也不足以完成全部输出叶子。

`a-0027` 后只有 `a-0028`、`a-0029` 两次 `find_elements`，随后 `a-0030 done`。不存在分页、详情打开、`go_back`、返回后的 fresh `bat_read_fields` 或 summary 调用。

### 结构化 output 被保留，但业务内容为空

author 保留了符合输出 Schema 的实际 done output：

- `pages=[]`
- `secondPageFirstDetail.number/author/createdAt` 均为空字符串
- report 明确说明无法采集第一页，因此没有分页、详情或返回后状态核验

`trace.completed=true` 且 `finalResultRef` 存在，证明 output 没有再被 author 丢弃；但 compilation 的 `outputAssembly=null`，并产生 `natural_output_assembly_incomplete`。没有成功字段读取或 summary 证据能够绑定 `pages`、详情或 report 的动态输出叶子。

judge 的调用完成，但具体 judge 理由未持久化；只能确认 `trace.judged=false`、`sourceValidated=false` 以及 gate `successful_judged_business_result_required`，不能从 gap 或 done 文本反推 judge 原话。

## 三条 compilation gaps

1. `a-0008`：`visible_overlays_change_not_completion_proof`
2. source gate：`successful_judged_business_result_required`
3. output：`natural_output_assembly_incomplete`

本次没有登录、验证码或访问限制证据。运行失败后未重跑、未执行 `/private/tmp/bat-mainline-verify.mjs`、未改原 source/flags/digest，也未启动新的浏览器会话。
