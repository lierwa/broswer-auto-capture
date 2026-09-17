# R3c 当前运行页作用域实现证据（2026-09-17）

结论：通过。TS 物化、运行态替换、失败清空、同 session 恢复和取消窗口通过纯内存与定点回归；同一物化链和同一 `TaskChainRuntime` 也已在真实 Browser 中分别从两个不同入口到达对应详情页，两次 replay 均为 5 个浏览器命令、0 次模型调用。

## 实现边界

- `bat-hybrid/2` 仅在现有线性控制图具有唯一成功直接前驱，且前后 owner 都是 `browser.workflow-step` / `browser.read-fields` 时考虑 `runtimeScopeFrom`；`bat-hybrid/1` 不变。
- 源动作必须成功并具有 post observation；当前动作 pre 与前驱最终 post（含归属前驱的 supporting wait）必须具有相同 tab 和经 `payload.assertFact` 校验的完整 `url_digest`。中间只接受连续、同页的已证明 read，或 `native_action_not_dispatched/v1`；其他情况保留静态 scope。
- `runtimeScopeFrom` 只进入持久化 capability config。执行前在同一 capability 闭包核对前驱 node id，并通过 `hybrid_observe` 核对 session、tab 和完整 URL；仅克隆本次 command 的 `target.scope` / read `scope`，内部 marker 不进入 Python 协议。
- 任一浏览器 capability 的配置、预观察、派发、结果或取消失败都会清空最近成功前驱。状态只在单个 `withHybridCapabilities` 闭包内存在。
- 预观察和 execute 共用一个 `withinHybridSignal` 取消边界；预观察返回后再次检查 signal，取消后不会继续派发。
- checkpoint 只在原 session/tab、URL、observation digest 全部一致，且无 pending effect / resume condition、最后事件为 success 时恢复候选前驱。跨 session 导航恢复仍可服务普通链，但 dependent scope 保持拒绝。
- 每个已证明 marker 增加一次预观察命令预算；普通动作输出合同与模型调用数不变。
- `url_digest` 沿用 producer 的 `capture.fact` 摘要域 `{kind,value}`；其他 `value_fact` 仍按 `value` 摘要，不接受宽松双算法。

## 临时纯函数与内存端口诊断

命令：`node --import tsx /tmp/r3-runtime-scope-diagnostic.ts`（临时文件已删除）。

通过项：源连续性准入；源错误 tab / 完整 URL digest；无直接前驱；运行态错误 tab / 完整 URL；无前驱 / 错误 id；失败后清空；两个实例隔离；不一致 checkpoint 不恢复；一致 checkpoint 恢复。

命令：`node --import tsx apps/api/r3-payload-diagnostic.ts`（临时文件已删除）。

通过输出：`{"captureFactEnvelope":"accepted","changedValueWithOldRef":"rejected","hangingObserveCancelled":true,"dispatchedAfterCancel":false}`。

该诊断使用真实 `capture.fact` 的 `{kind,value}` 摘要格式，确认修改 value 但保留旧 ref 会报 `hybrid_natural_fact_digest_mismatch`；挂起预观察在 signal abort 后立即传播到 owner，且未进入后续派发。

## 定点验证

- `npm run check --workspace @browser-capture/api`：通过。
- `node --import tsx --test apps/api/tests/hybrid-materializer.test.ts apps/api/tests/hybrid-runtime.test.ts`：9 通过，0 失败；真实 Browser 用例因 `BAT_REAL_BROWSER_TEST` 未开启而跳过 1 项。

## 真实 Browser 探针

- 临时命令：`BAT_UPSTREAM_BROWSER_HEADLESS=true ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false node --import tsx /private/tmp/r3_runtime_scope_browser_probe.mjs`。
- sandbox 首次在 localhost `listen` 处报 `EPERM`，未启动 Browser；在获准环境中运行后，`withHybridAuthoring` 均经 `finally` 关闭 Browser/Runner。
- 失败定位产物保存在 `/tmp/r3-scope-source-failure.json` 和 `/tmp/r3-scope-model-diagnostic-failure.json`。根因是临时脚本错误地要求索引和可见文本同一行；真实页面文本为 `[16]<a id=open />` 后接 `Open issue detail`。脚本因此返回 `click.index=null` 并主动抛出 `fixture_target_missing`；collector 正确记录 `agent_step_result(errorPresent=true)`。这不是 Agent、collector 或 R3 runtime 的生产缺陷。
- 最终只按已知自建 fixture 的唯一 `<a id=open>` 索引行修正探针。来源保存于 `/tmp/r3-scope-source-success.json`，模型轮次诊断保存于 `/tmp/r3-scope-model-diagnostic-success.json`。来源 `navigate`、`click(index=16)`、`bat_wait_for(#detail)`、`done` 均成功；编译 segments 为 `navigate, click, bat_wait_for`，`gaps=[]`。
- 物化后的三个 capability marker 为 `null, s-a-0001, s-a-0002`，`maxBrowserCommands=5`。同一 `TaskChainRuntime` 两次显式执行分别使用独立随机 `requestId`、`runId`、`invocationId`：
  - `alpha/issues` 到 `alpha/detail`：`completed`，5 个浏览器命令，0 次模型调用；同一运行内 session/tab 唯一。
  - `beta/issues` 到 `beta/detail`：`completed`，5 个浏览器命令，0 次模型调用；同一运行内 session/tab 唯一；与 alpha 运行的 session 不同。
- 两次执行都走完整 TaskChain，没有手写动作循环；断言确认原 source request/response 字节和持久化 capability 静态 scope 未改变。每次 capability 会话由 `withHybridCapabilities` 关闭，authoring Browser/Runner 和 localhost server 也由 `finally` 关闭。

## 未验证

- Windows 未验证。
