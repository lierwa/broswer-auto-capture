# R3b 生产目标滚动工具验收（2026-09-17）

结论：通过本项局部验收。`bat_scroll_to(selector)` 已接入原生 Agent、证据采集、自然编译、TS 物化和普通 Runner；真实 localhost Chromium 反例与同动作复跑通过。此结论不覆盖 TaskChainRuntime/LangGraph、候选持久化/加载、provider、原网站整链、懒加载搜索或 Windows。

## 执行身份与源码门

- 执行 session UUID：`01a0aafd-46fb-77b2-92c7-bd76f24473c8`
- model / effort：`gpt-5.6-sol` / `high`
- 最终 fork sourceDigest：`093515c6f585dee5735b6eebf15f69bbd000822f972ad5bd3894db8f7a77c990`
- 主 agent 在正式 probe 前统一更新 fork manifest；`verifyForkSource` 与 setup `--check` 通过。子 agent 未修改 manifest/source 文件。

## 实现边界

- 工具输入只有非空 CSS `selector`，最大 2000 字符；没有 JS、pages、坐标、文本近似或 scope 输入。
- 复用 `Tools.action`、`Tools.act`、`TargetResolver`、`SCROLL_INTO_VIEW_SCRIPT`、`Element.evaluate`、`StepVerifier` 和既有证据摘要校验。
- 当前主文档 CSS 必须唯一；滚动前后校验 targetId 与完整 URL 摘要。缺失、多义、隐藏、断开或页面漂移直接失败。
- 使用 `checkVisibility` 与一次 `IntersectionObserver` 判断实际相交，observer 和 timeout 均清理；已相交时不调用 `scrollIntoView`，否则只调用一次。
- 成功只向 LLM 返回固定 `Target is in view.`。selector、targetId、urlDigest、visible、scrollInvoked 仅保留在按动作位置拥有的内部 `TargetScrollRecords` 和专用事实中。
- `verified_target_scroll` 复用 Python `NormalizedTrace.check_integrity` 与 TS `naturalPayloadContext` 的既有摘要校验；编译要求严格参数、当前 action/result、前后 tab/URL 身份和 `visible=true`。
- 编译为现有 `browser.workflow-step` v2 / `actionName=bat_scroll_to`，target 为相同 CSS 与已存在 scope，后态为 `target_in_view == "true"`。普通 Runner 先核验 scope，再调用同一工具一次；没有模型、第二套执行器、循环或自动重试。
- 旧原生 `scroll`、懒加载搜索、列表 ready、scope 参数化和点击无遮挡保证均未改义。

## 改动清单

- 新增 `vendor/workflow-use/workflows/workflow_use/hybrid/target_scroll.py`
- 修改同目录 `author.py`、`capture.py`、`registry.py`、`natural_compile.py`、`capability.py`、`postconditions.py`
- 经主 agent 追加最小所有权后修改同目录 `natural_facts.py`、`evidence.py`
- 修改 `apps/api/src/upstream-browser/hybrid-schema.ts`、`hybrid-protocol.ts`、`hybrid-natural-payload.ts`
- 未修改 tests、`targets.py`、manifest/source、provider、原网站、运行节点类型或其他项目

## 命令与结果

### 先跑的现有局部基线

```text
ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false \
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests \
work/upstream-browser-hybrid/.venv/bin/python -m unittest \
  vendor/workflow-use/workflows/tests/test_hybrid_author.py \
  vendor/workflow-use/workflows/tests/test_hybrid_capture.py \
  vendor/workflow-use/workflows/tests/test_hybrid_natural_compile.py \
  vendor/workflow-use/workflows/tests/test_hybrid_capability.py \
  vendor/workflow-use/workflows/tests/test_hybrid_targets.py
```

39 项运行，既有基线为 3 fail + 1 error：author entry 断言、capture 旧 `semantic_model` mock、两项旧 scroll completion 断言。按任务约束未修改测试，也未重复整组。

### 静态检查

对本项 9 个 Python 文件及临时 probe 执行 `python -m py_compile`，退出 0。对相同范围执行 Ruff，最终 `All checks passed!`。所有修改 Python 文件少于 500 行，所有函数少于 100 行。

### 真实 Chromium 目标反例

```text
ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false \
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows \
work/upstream-browser-hybrid/.venv/bin/python /private/tmp/r3_target_scroll_browser_probe.py
```

首次 sandbox bind 被拒，按相同命令申请 localhost 升级后运行。受成功返回最小化影响仅定点重跑一次；最终 Browser id 为 `06aaac41-f83c-72ca-8000-8da7d94f1e96`，完整 stdout 在 `/private/tmp/r3_target_scroll_browser_probe.log`。

- 已可见：位置 0，scrollIntoView 计数保持 0。
- 嵌套 overflow：top 从 841 到 178.5，计数 0→1。
- 页底：top 从 2602 到 902，计数 1→2；再次调用计数仍为 2，`scrollInvoked=false` 由内部记录验证。
- 缺失、多义、预先隐藏：均失败，计数不变。
- 滚动时目标变为 `visibility:hidden`：调用一次后返回 `scroll_target_not_in_view`，没有使用 observer 注册前的旧可见状态冒充成功。
- 错误 scope：派发前返回 `target_scope_mismatch`。
- 所有成功 ActionResult 都只含固定 `Target is in view.`。

Browser、server 和线程均在 `finally` 中关闭。

### 证据篡改诊断

`/private/tmp/r3_target_scroll_evidence_probe.py` 与 `.mjs` 修改 `verified_target_scroll.value` 而保留旧 sourceRefs。Python 输出 `python_rejected_tampered_verified_target_scroll`，TS 输出 `typescript_rejected_tampered_verified_target_scroll`。

### 生产 author/compiler/materializer/capability 适配接线

```text
ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false \
BAT_UPSTREAM_BROWSER_HEADLESS=true \
node --import tsx /private/tmp/r3_target_scroll_pipeline_probe.mjs
```

仅使用正式 `withHybridAuthoring → validateHybridResponse → recompileHybridSource → materializeHybridChain → withHybridCapabilities`。最终 stdout 在 `/private/tmp/r3_target_scroll_pipeline_probe.log`。

- 原生 Agent：3 次 scripted agent 调用、1 次 scripted judge 调用；实际浏览器命令为 `navigate + bat_scroll_to` 两次。
- 采集/编译：`compiledActions=[navigate, bat_scroll_to]`，`gaps=[]`。
- 离线重编译：canonical digest 与在线结果一致，为 `cc3dbea21ea7768d82df9ba75e85d95a913737c547ec5886d21f5bb388b1f4e0`，证明在线/offline registry 一致。
- TS 物化：`maxLlmCalls=0`。
- 普通 Runner：同动作复跑时，同一 URL 的目标从 2200px 改到 3600px。probe 的 JS 逐个调用物化后的两个 capability 节点，`replayCommands=2`；`hybridExecuteResultSchema` 要求每次 `modelCalls=0`。这证明目标位置变化后仍执行当前 CSS 目标，不是 TaskChainRuntime/LangGraph 的链路运行验收。
- replay session id：`06aaac5d-06c8-714d-8000-4a24d2d2b02b`；tab id：`892BE02E1DB10CA6907775AC0D6E78C6`。

author、离线 compiler、capability Runner/Browser owner 与 localhost server 均由生产适配入口或 `finally` 清理。probe 未执行候选持久化或加载。

## 首次失败与修复

- 初始公开 API 探针错误导入不存在的 `browser_use.browser.views.Element`；改为沿现有公开实例 API 验证，没有读取或修改 site-packages。
- 真实反例首次 localhost bind 被 sandbox 拒绝；同命令升级后通过。
- Ruff 首次只报 `capability.py` import 区域多一个空行；最小删除后通过。
- 首次正式流水线在 TS 请求边界因临时 probe 使用不存在的 `step.callMode` 被拒绝；修为本任务明确的 `once` 后，未改生产代码即通过。
- fork gate 曾因本轮文件尚未登记而拒绝；未绕过 gate。主 agent 更新 manifest/sourceDigest 后才运行生产适配接线 probe。

## 未测与不宣称

- 未运行 provider、原网站或原任务整链；scripted model 只证明原生 Agent/Browser/Tools 接口与生产接线。
- 未测 Windows 和有登录态页面；没有保存 Cookie、Profile、原始页面内容或敏感日志。
- 未实现懒加载搜索、列表 ready、旧 scroll 推测归并、跨 tab/frame、scope 参数化或自动重试。
- `target_in_view` 只证明目标可见且与裁剪后的视口相交，不证明无遮挡或可点击；点击仍由原生 Tools 负责。
- 工具可能在一次滚动后因页面漂移或目标变化失败；失败动作仍保留审计，没有新增失败一律排除规则。
- 未运行全量或根级测试；现有 39 项基线失败未在本项中修复。

临时 probe：`/private/tmp/r3_target_scroll_browser_probe.py`、`/private/tmp/r3_target_scroll_evidence_probe.py`、`/private/tmp/r3_target_scroll_evidence_probe.mjs`、`/private/tmp/r3_target_scroll_pipeline_probe.mjs`。
