# R5c 执行摘要与动态输出装配实施证据

日期：2026-09-17。结论：R5c 的 source、自然编译、TypeScript 物化和动态输出装配已通过 localhost 真实 Chromium 联合验收；同一条链在两组运行输入下重新读取 DOM，并各执行一次有审计的显式摘要模型调用。本结论不代表真实 provider、原网站或原任务正式主线已通过。

## 执行身份与范围

- agent task：`/root/r5_summary_output`
- session id：`01a0ab2c-3a26-7a42-8a7f-96bfee043779`
- 主 agent 已核验实际 turn context：`gpt-5.6-sol` / `high`
- source 侧新增 `summary_context.py`、`summary_tool.py`、`summary_evidence.py`、`summary_compile.py`，只在获准的 `author.py`、`capture.py`、`registry.py`、`evidence.py`、`natural_compile.py`、`natural_output.py` 接线。
- 宿主侧新增 `hybrid-summary.ts`，只在获准的 `hybrid-schema.ts`、`hybrid-natural-payload.ts`、`hybrid-materializer.ts` 接线。
- 未修改 `capability.py`、`ORDINARY_ACTIONS`、runtime、protocol、旧 `semantic.py`、公共 TaskChain 合同、测试、原 requirement/plan/source；未安装、提交、创建分支/worktree、调用 provider 或原网站。

## 实现结果

1. Agent 只看到 `bat_summarize(outputPath)` 一个输入字段。任务文本、最终输出 schema、本次 runtime input、此前成功的 verified reads、已完成动作事实和预算均由程序构造。在线 author 显式注入既有 `models['semantic_annotation']`；offline registry 固定 `model=None`，只建立相同工具 schema，不能执行摘要模型。
2. source 模型调用使用严格对象输出 `{value: string}`，程序解包后让工具成功结果保持纯文本。这样不依赖 AI Connect/model bridge 对根 scalar structured output 的支持；宿主最终 llm 输出合同仍是目标 string schema。
3. 摘要只接受至少一个该动作之前的成功 `verified_natural_read`。输出路径必须是原输出合同中的 string 叶子，并与读取和既有摘要路径互斥。工具失败、模型失败、成功动作缺少固定位置记录或记录被篡改时均不产生 `verified_natural_summary`。
4. collector 只消费动作前记录列表固定起点后的唯一记录，核对 action result、路径、schema、实际摘要和当次上下文后生成 `verified_natural_summary`。失败保留 gap，不通过 readonly 排除隐藏。
5. 自然 compiler 独立复核每个读取来源均在摘要动作之前完成、有真实 action/result/observation、已编译为 `browser.read-fields`，且 schema、path、value、binding 与来源 fact 一致。已完成事实同样必须在图中先行编译并可达。
6. 自然摘要是独立 strict `explicit_llm` variant，带 `sourceRef`，没有伪造 `requirementClauseRefs`。它只允许一个程序构造的虚拟 binding `summary-input-<actionRef>`，budget 只含 `maxCalls: 1` 和 `timeoutMs`。
7. 宿主把 runtime input 与各前序读取的动态 `ValueBinding` 交给既有 `data.transform` merge，再接既有显式 `llm` 节点。控制图中所有进入摘要节点的边先进入 merge，merge 的 success 再进入 llm；新增节点和连线继续由 `compileTaskChain` 检查。
8. 最终 output assembly 分别绑定确定性读取节点和显式 llm 节点；DOM 字段不交给模型改写，来源样本值不写入 constant binding，整份输出也不由模型重新生成。

## 两项明确取舍

- 自然摘要 variant 不设置 `maxInputBytes`，工具也不做固定 128 KB 截断。原 legacy/public semantic variant 的既有 `maxInputBytes` 保持不变。R5c 只复用正式图预算中的一次调用上限和超时，避免凭空引入另一个字节上限或静默丢失事实。
- 发给摘要模型的 `completedFacts` 只含 `{kind, actionRef, actionName}`。URL、页面位置、selector、resultDigest 和事实样本值不进入 instruction；完整证据只留在程序内部，用于核对这些事实已在摘要之前真实完成并编译。

## 当前验证

开始门首先运行了既有 hybrid Python 模块的最小 `py_compile`，通过。随后临时 probe 通过真实 `Tools.act` 和脚本 `ainvoke` 覆盖两组不同读取值，并确认：每次恰好一次 source 模型调用；摘要随读取值变化；DOM 样本逐字不变；无读取、路径冲突、模型失败、成功无记录、篡改来源及未编译来源均拒绝；自然摘要无 clause refs；报告 binding 来自显式 llm，merge 的来源是动态 input/node binding。该 probe 没有启动 Browser，也不是 provider 或正式 runtime 证据。

宿主最小校验：

```text
npm run check --workspace @browser-capture/api
=> tsc --noEmit, exit 0

work/upstream-browser-hybrid/.venv/bin/python -m py_compile <R5c 10 个 Python 接线文件>
=> exit 0

work/upstream-browser-hybrid/.venv/bin/ruff check <R5c 10 个 Python 接线文件>
=> All checks passed!
```

局部 probe 源文件位于 `/private/tmp/r5c_summary_probe.py`，稳定结果位于 `/private/tmp/r5c_summary_probe.json`。其中 `readAndSummaryAssemblyCaptured=true`、`readAndSummaryAssemblyCompiled=true`，证明 read 与 summary 能共同通过生产的 output assembly capture/compile 两个入口。

主 agent 登记 16 个 owned fork 路径并通过 `verifyForkSource` 与 setup `--check` 后，只运行了一次联合 Browser probe。脚本位于 `/private/tmp/r5_combined_pipeline_probe.mjs`，完整 source 与稳定报告分别位于：

```text
/private/tmp/r5_combined_source.json
/private/tmp/r5_combined_pipeline_probe.json
```

联合 probe 使用最终三字段 `bat_read_fields` 接口，source 动作为 `navigate → bat_read_fields(object-array) → bat_read_fields(scalar) → bat_summarize → done`。真实 Agent/Tools、Chromium、callback/history、自然编译、offline 重编译、宿主 materialize 和 `TaskChainRuntime` 全部经过生产入口。结果：

- `sourceSuccess=true`、`sourceValidated=true`，source 浏览器命令为 3；`bat_summarize` 与 `done` 没有被计为浏览器动作。
- source 的 `semantic_annotation` completed 审计恰好 1 次；编译区段为 `browser.workflow-step`、两个 `browser.read-fields` 和一个 `explicit_llm`，gaps 为空。
- offline canonical digest 与 source 一致；物化链只有一个 llm 节点，`maxLlmCalls=1`。
- 同一条链串行运行 alpha/beta 两个 URL。两次均 `status=completed`，真实 DOM 的 object-array `issues` 与 scalar `headline` 原样随页面变化，`report` 也随本次读取变化。
- 每次运行 browser commands 为 5；模型审计恰好一条，`purpose=explicit_llm`、`status=completed`、`reportedInvocations=1`，`consumed.llmCalls=1`。普通 capability 没有隐式模型调用。
- `withHybridAuthoring` 与两次 `withHybridCapabilities` 都由各自 `finally` 关闭 runner/Browser。首次沙箱只在绑定 `127.0.0.1` 时得到 `listen EPERM`；按既定授权用同一命令升级后一次通过，没有业务失败后重跑 source。

## 尚未证明

- 未运行真实 provider、原网站、原任务正式主线或全量测试；source 和 replay 的模型均为固定脚本端口。
- manifest/source digest 由主 agent 按统一文件所有权重算，本项不修改。
