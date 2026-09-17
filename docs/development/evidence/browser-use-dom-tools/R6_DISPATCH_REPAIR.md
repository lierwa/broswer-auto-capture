# R6 失败动作派发事实修复证据

日期：2026-09-16。执行 session `01a0aabe-ac62-7e23-a1fe-f4747677fccc`，实际 turn context 为 `gpt-5.6-sol/high`。范围仅为 browser-use 原生动作是否进入 `Tools.act` 的生产事实、事实归属和自然编译排除分支；没有修改 Agent loop、浏览器驱动、TypeScript 跨模块契约或测试代码。

## Product Alignment

- natural-language task: 首次探索中保留失败动作审计，只把明确未进入原生工具的失败尝试排除出复跑。
- reusable chain boundary: 任意 browser-use 原生动作的派发入口，不绑定网站或业务实体。
- runtime inputs: 原生 history 的 `metadata.step_number`、固定 action 位置、动作结果引用。
- dynamic task outputs: `native_action_dispatch` 事实及对应 ActionCoverage 归属。
- generic platform capability used: 来源事实、结果引用、覆盖账本与严格失败关闭。
- replay model calls: 0；该分支只读来源事实。
- site/task-specific code added: no

## 上游调用顺序

使用已有 official-lock 环境定点核验，没有安装依赖：

```text
workdir: repository root
work/upstream-replacement-2026-09-15/official-lock-probe/.venv/bin/python -c '<打印 browser-use 版本、Agent/Tools 源文件和 Tools.act 签名>'
```

结果为 browser-use `0.13.8`。安装源码给出的顺序是：

1. `Agent` 收到外部 `tools` 时直接保存同一实例，`agent/service.py:311-313`。
2. `_get_next_action` 在返回前调用 `_handle_post_llm_processing`，后者于 `agent/service.py:1706-1718` 执行 `register_new_step_callback`。
3. `step` 随后才于 `agent/service.py:1068-1069` 调用 `_execute_actions`；回调与派发之间还有停止检查。
4. `multi_act` 在停止检查、动作日志及 pre-action URL/焦点读取之后，才于 `agent/service.py:2785-2793` 进入 `self.tools.act(...)`。
5. `Tools.act` 抛出的普通异常会在 `agent/service.py:2833-2849` 变成失败 `ActionResult`。因此错误结果、回调完成和后续成功都不能证明该失败动作是否已进入工具。

这证明可复用的最窄入口是传给 `Agent` 的同一 `Tools` 实例上的 `act` 方法；不需要也不允许改 Agent loop 或驱动。

## 实现结论

- `action_dispatch.py` 集中持有派发审计。callback 按 `(nativeStepNumber, nativeActionIndex)` 登记提议；`Tools.act` 薄包装在调用原方法前只写 `entered=true`，并在 author 结束时恢复原方法。
- 动作摘要只校验记录位置上的动作是否仍相同。归属使用 `action_identity.resolve_history_step`、`metadata.step_number` 和 history 固定位置；不搜索相同参数，也不使用错误字符串或成功重试推断。
- `capture.py` 在 callback 的风险操作之前登记提议；`history.py` 在结果引用建立后交付 `bat.native-action-dispatch/v1` 事实。事实包含 `actionRef`、`resultRef`、原生 step/action 位置和 `entered`，其 `sourceRefs` 摘要必须等于完整事实摘要。
- 无法按 metadata/固定位置解析、动作摘要不一致或无法挂载 observation 时只产生 gap，不产生可排除事实。旧来源没有该生产事实，保持缺口，不回写历史。
- `natural_compile.py` 仅在动作 schema/effect 有效、状态为 `failed`、唯一派发事实明确 `entered=false`、`resultRef` 完全相同且事实摘要完整时，写入 `agent_internal + native_action_not_dispatched/v1`。
- `nativeStepNumber` 必须是非 bool 的正整数，`nativeActionIndex` 必须是非 bool 的非负整数；同一 trace 中同一 native step/action 位置只能有一个派发事实。无效类型或重复位置一律不排除。
- `coverage.py` 独立重算同一证据条件。`entered=true`、事实缺失、事实篡改、结果引用不一致及副作用不确定都继续 `not_compilable` 并保留阻塞 gap。

## 验证

首次验收命令：

```text
workdir: vendor/workflow-use/workflows
uv run --frozen --no-sync python -m unittest tests.test_hybrid_capture tests.test_hybrid_natural_compile tests.test_hybrid_evidence
```

该目录原本没有虚拟环境，uv 新建了 76KB 空 `.venv` 后因 `browser_use` 不存在而在导入阶段失败；该空目录已立即删除，没有安装依赖。之后改用仓库已有 official-lock 环境：

```text
workdir: vendor/workflow-use/workflows
env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD" ../../../work/upstream-replacement-2026-09-15/official-lock-probe/.venv/bin/python -m unittest tests.test_hybrid_capture tests.test_hybrid_natural_compile tests.test_hybrid_evidence
```

修复前后均运行 34 项：32 项通过，2 项为本轮开始前已存在的 R4 语义失败：

- `test_scroll_and_send_keys_require_specific_observed_effects` 仍期望单纯 scroll position change 可通过，当前实现明确返回 `scroll_position_change_not_completion_proof`。
- `test_delayed_scroll_effect_owns_only_continuous_pure_wait` 仍依赖同一弱滚动完成条件，并缺 wait 的现有自然事实。

R6 未修改这两个断言，也未用它们冒充本轮回归。

临时探针命令：

```text
workdir: repository root
env PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/vendor/workflow-use/workflows" ANONYMIZED_TELEMETRY=false work/upstream-browser-hybrid/.venv/bin/python /private/tmp/r6_dispatch_probe.py 2>&1 | tee /private/tmp/r6_dispatch_probe.log
```

探针使用真实 `Tools` 实例、真实 `Tools.act` 入口、生产 `EvidenceCollector → from_agent_history → normalize_history → compile_request` 路径和内存 BrowserSession stub；没有启动 Browser/provider。结果：

- callback 在派发前中止：事实为 `entered=false`，结果引用与 action 完全关联，coverage 为 `agent_internal / native_action_not_dispatched/v1`，无 R6 gap。
- `Tools.act` 已进入后失败：事实为 `entered=true`，coverage 为 `not_compilable`，保留 `successful_action_result_required`。stub 缺少 `cdp_client` 的错误只用于让真实工具入口返回失败，不参与分类判断。
- 两个参数完全相同的动作：固定位置 `(0,0)` 为未进入、`(1,0)` 为已进入，没有按参数串位。
- 错误 `step_number=99`：解析结果为空并报告 identity invalid，没有搜索到参数相同的历史动作。
- 删除派发事实模拟旧来源后仍为 `not_compilable`；把 `entered=true` 篡改为 false 但不更新来源摘要后仍为 `not_compilable`。
- 把 native step 改为 bool，或添加同 native step/action 位置但指向另一 `actionRef` 的事实，均保持 `not_compilable`。

静态检查：

```text
workdir: vendor/workflow-use/workflows
../../../work/upstream-replacement-2026-09-15/official-lock-probe/.venv/bin/ruff check --no-fix workflow_use/hybrid/action_dispatch.py workflow_use/hybrid/author.py workflow_use/hybrid/capture.py workflow_use/hybrid/history.py workflow_use/hybrid/natural_compile.py workflow_use/hybrid/coverage.py
```

结果：`All checks passed!`。变更文件均小于 500 行，AST 定点检查无超过 100 行的函数。临时探针和本次加严后的脱敏输出保留在 `/private/tmp/r6_dispatch_probe.py` 与 `/private/tmp/r6_dispatch_probe.log` 供复核，没有写入仓库测试代码。

## 证据边界与未测项

工具入口探针可以证明：同一 `Tools` 实例的入口包装能区分 callback 中止与工具已进入后失败；生产采集、history 归属、事实摘要、编译和 coverage 路径对这一区分保持一致；重复参数和错误 step 不会搜索对齐。

工具入口探针不能证明：真实 provider 探索、原 Issues 任务、正式来源保存、候选持久化、普通执行器复跑或换输入验证已经通过；也没有覆盖 Windows。旧来源没有派发事实，不能据此恢复或排除原失败点击。正式主线仍需主 agent 按修复计划统一集成验收。

当前 trace 的 `stepIndex` 是 history 数组位置，`nativeStepNumber` 来自 browser-use `StepMetadata.step_number`；两者没有公开的一一算术合同。生产适配在采集阶段用 metadata 定位唯一 history 位置并生成 `actionRef`，编译阶段只核验事实类型、位置唯一性、结果关联和摘要完整性，不假定 `nativeStepNumber == stepIndex + 1`。trace 未保留 metadata 到 history 位置的完整映射，因此编译阶段不能重新证明该映射；解析失败时的既定行为是保留 gap，而不是尝试搜索或补写事实。
