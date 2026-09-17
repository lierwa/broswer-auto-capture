# R4b 自然探索与复跑共用条件等待验收（2026-09-17）

结论：通过本项局部验收。`bat_wait_for(selector)` 已接入原生 Agent、成功事实采集、自然编译、TS 物化和普通 capability Runner；真实 localhost Chromium 证明它等待唯一主文档元素连接且可见，不会把较早的 title/URL/滚动变化当成 ready。这个结论不覆盖 TaskChainRuntime/LangGraph、候选持久化/加载、真实 provider、原网站或业务 selector 正确性、Windows。

## 身份与源码门

- 执行 session：`01a0ab15-2873-7001-9daa-43bceede4cc3`，主 agent 已核验 `gpt-5.6-sol/high` 与当前 checkout。
- 最终 fork sourceDigest：`407881c2b185d6fc505f21887227cd962d765def32cdf29da376cae11fff30f8`。
- 主 agent 在真实 probe 前只登记本项 11 个 fork 文件；`verifyForkSource` 与 setup `--check` 通过。子 agent 未修改 manifest/source。
- 未创建分支/worktree，未安装、提交、推送，未调用 provider 或原网站，未修改测试、requirement、plan、source 或总计划。

## 最终行为

- LLM 可见输入只有 `selector`，严格非空且最长 2000；无 timeout、JS、页身份、摘要或预期文本字段。
- 成功只返回 `Condition is ready.`；内部记录 selector、`targetId`、完整 URL 与 ready 结果，发布证据只使用 URL 摘要。
- 固定策略为 `maxMs=30000`、`maxAttempts=100`、`intervalMs=300`。等待由现有 `verify_declared`、`StepVerifier`、Tenacity 承担，没有新增 sleep/while/retry 引擎。
- `target_visible` 使用固定 `isConnected + checkVisibility({checkOpacity:true, checkVisibilityCSS:true})`。零匹配或隐藏表示条件未满足；初始多匹配明确拒绝；成功前后核验固定 `targetId + URL`。
- `bat_wait_for` 的 effect 为 read。自然编译生成 `browser.workflow-step` v2、`actionName=bat_wait_for`、同一 CSS target/scope、selector binding 和 `target_visible='true'` 后置条件。
- 普通 capability 校验 target/selector/scope 后只调用一次 `Tools.act`，没有模型端口。失败只读 probe 仅在 registry 参数合法、read effect、failed、存在 resultRef 且没有成功 fact 时允许 `failed_bat_wait_probe/v1`，coverage 再独立核验。
- author guidance 要求异步动作后选择实际业务 ready selector；固定秒数、URL/title/滚动变化不能证明数据刷新。没有可靠信号时保留缺口。

## 修改范围

新增 fork 文件：

- `vendor/workflow-use/workflows/workflow_use/hybrid/visible_wait.py`
- `vendor/workflow-use/workflows/workflow_use/hybrid/visible_wait_compile.py`

修改 fork 文件：

- `author.py`、`capture.py`、`registry.py`、`natural_compile.py`、`natural_facts.py`
- `capability.py`、`postconditions.py`、`evidence.py`、`coverage.py`

宿主仅修改现有枚举/证据集合：

- `apps/api/src/upstream-browser/hybrid-schema.ts`
- `apps/api/src/upstream-browser/hybrid-protocol.ts`
- `apps/api/src/upstream-browser/hybrid-natural-payload.ts`

## 验收结果

静态验收：修改 Python 文件 Ruff 全清；语法编译通过；所有文件不超过 500 行、函数不超过 100 行。工具 schema/registry 定点验证只含 selector，effect=read。`.ts` 临时静态绝对 import 曾触发当前包的 `./client` exports 差异；改用与 R3b 相同的 `.mjs + pathToFileURL` 动态生产加载方式后，compilation 与 command schema 均接受 `bat_wait_for`。

无 Browser 的现有 verifier 反例通过：ready 延迟超过 3 秒才成功；永不 ready 超时；取消传播且取消后查询计数不再增加；重复目标拒绝；URL 漂移不产生成功。编译 probe 从 `verified_visible_wait` 生成 v2 segment，普通 capability 验证 target/scope 后只调用一次 `Tools.act`，`page_extraction_llm=None`。

真实 Chromium 条件反例使用 `/private/tmp/r4_visible_wait_browser_probe.py`，脱敏结果在 `/private/tmp/r4_visible_wait_browser_probe.log`：

- title 在约 162ms 变为 `early-marker`，ready 元素约 3312ms 才出现；工具约 3461ms 后成功，返回固定确认。
- 永不 ready 返回 `bat_wait_for_timeout`；两个 `.ready` 返回 `ambiguous_visible_wait_target`。
- 等待期间 URL 漂移后即使元素随后可见也未成功，最终返回固定 timeout。
- 取消前真实 `checkVisibility` 读取 4 次；取消后等待 200ms 仍为 4，取消向外传播且没有成功记录。
- 最终 Browser id `06aaaca6-ab9c-7e8d-8000-0edda45030e5`；Browser、临时 Profile、server 和线程均在 `finally` 中关闭。

正式适配接线使用 `/private/tmp/r4_visible_wait_pipeline_probe.mjs`，脱敏结果在 `/private/tmp/r4_visible_wait_pipeline_probe.log`。入口严格为 `withHybridAuthoring → validateHybridResponse → recompileHybridSource → materializeHybridChain → withHybridCapabilities`：

- 固定脚本模型只用于首次来源：Agent 3 次、judge 1 次；没有真实 provider。
- 来源实际等待 3294ms，采集到唯一 `verified_visible_wait`；编译动作是 `navigate`、`bat_wait_for`，gaps 为空。
- 离线重编译 canonicalDigest 与在线一致；物化链 `maxLlmCalls=0`。
- 普通 capability 同动作复跑耗时 5306ms；2 个编译动作加 1 次当前 runtime-scope observe，共 3 个 browser command。
- replay session `06aaacb0-d856-7d6d-8000-882e5b8c0918`；正式 author/capability owners 与 localhost server 均关闭。

这段正式接线手动调用物化后的 capability 节点，只证明生产适配与同动作复跑；不作为 TaskChainRuntime、LangGraph、持久化加载或产品任务完成证据。

## 失败与修复

- 实现前 `SettlePolicy()` 基线失败，确认其没有默认值；工具随后显式拥有固定策略，没有把预算暴露给模型。
- 两个 localhost 命令首次均因 sandbox 禁止 bind 返回 `EPERM`；按相同命令升级后执行。
- 第一版临时页面初始 DOM 为空，browser-use 导航保护提前等待并 reload；给 fixture 加固定 loading 节点后，工具自身超过 3 秒的等待得到真实计时。
- 第一版漂移 fixture 在 navigate 后置核验前改 URL；改为导航完成后显式触发漂移。
- 正式 probe 最初沿用 R3b 的 2-command 旧断言；当前 runtime scope 首次执行前增加一次 observe，修正临时断言为 2 个动作加 1 次 scope observe。产品源码未因这些 probe 问题修改。

## 未覆盖边界

- 未验证真实业务页面是否存在可靠 selector；工具机制不能替代原任务业务验收。
- 未验证真实 provider、原网站、Windows、TaskChainRuntime/LangGraph、候选持久化/加载或恢复。
- 页面在等待开始后变为多匹配时不会选择任意目标，也不会产生成功；本次真实多匹配验收覆盖进入等待时已多义的明确拒绝。
