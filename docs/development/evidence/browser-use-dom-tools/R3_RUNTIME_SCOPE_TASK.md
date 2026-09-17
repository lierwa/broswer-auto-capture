# R3c 当前运行页作用域（主 agent 决定，2026-09-17）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

目标：保持源证据不变，在 TS 物化与既有 Runner 适配边界把“上一动作实际到达的页”用作下一目标的 scope，解决 startUrl 换仓库后仍校验历史 URL 的问题。不得直接删除 scope 或只保留 origin。普通动作输出保持原合同；无新 LLM 字段/节点/调度器。

Product Alignment:
- natural-language task: 从输入入口导航后操作列表、详情或表单当前页。
- reusable chain boundary: 既有线性浏览器链的相邻页连续性。
- runtime inputs: 既有 startUrl 等输入；内部浏览器状态。
- dynamic task outputs: 不改。
- generic platform capability used: 既有能力适配/浏览器观察/检查点恢复。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 当前运行的浏览器作用域绑定。
- existing implementation in repository: withHybridCapabilities 的 result.browser、observe、verifyResume；现有 materializer 与 TargetResolver.scope。
- mature candidates and pinned versions: 保持 b-u0.13.8、现有 TaskChain/LangGraph；不换库。
- selected implementation: 现有适配闭包内保留最后一次成功 browser 状态，沿现有检查点恢复核验重建。
- reused public surface: hybrid_observe/hybrid_execute、TaskChainCapabilities.verifyResume。
- B-A-T-owned adapter and remaining gap: 来源相邻页证明和当前页替换；不复制检查点库或调度。
- license/runtime/platform fit: 无新增依赖，Windows 未验。
- browser/runtime/state ownership conflicts: 同一 withHybridCapabilities 的一个 Runner；不得跨实例共享。
- replay model calls: 0。
- rejected candidates and evidence: URL 字符串替换无法证明真实导航；移除 scope 放过跳页；将额外 URL/摘要交给 LLM 增加不必要字段。
- focused validation: 两个不同入口/详情 URL 的同链运行，以及错页/错 tab/无前驱/失败后状态反例。

## 所有权

全新空白上下文 Sol/high；你不是唯一执行者，不回退别人修改。仅可改 apps/api/src/upstream-browser/hybrid-runtime.ts、hybrid-materializer.ts；新增同目录 hybrid-runtime-scope.ts（以及必要的纯验证薄 helper）。不改 fork、schema/protocol、测试或总计划。R4b 拥有 Browser；你只能做纯诊断直到 root 交出名额。不安装/分支/worktree/提交/推送；命令明确当前 checkout 根。

## 固定实现边界

1. 保留 Python 编译产物中的原始 scope 和证据字节，先走既有全部源验证。只在 bat-hybrid/2 物化时增加内部 capability config 标记，例如 runtimeScopeFrom=<上一浏览器 segment id>。bat-hybrid/1 不变。
2. 标记准入必须是现有线性控制图中唯一直接前驱的 browser.workflow-step 或 browser.read-fields；先前确有成功动作和有效 post observation。当前 source action 的 pre 与前驱最终 post（包括属于前驱的 supporting wait）具有相同 tab、完整 URL digest。中间排除动作仅允许已证明只读/未派发；不能跨过副作用、tab 切换、无法证明的 observation。没有充分连续性时保留静态 scope 并记录具体限制，禁止臆造。trace 的事实摘要用既有 payload.assertFact；不要第二套摘要器。
3. runtimeScopeFrom 是内部 config，绝不透传给 Python 协议。host capability 闭包保留最近成功的 browser node id + result.browser。执行带标记命令前检查前驱 id，再通过 observe 对比 sessionId/tabId/完整 URL（不以整个 documentDigest 阻止正常异步加载），一致才能用该真实 URL/digest 替换 target.scope 或 read scope。旧静态 URL 留在持久化 config；对本次命令克隆后替换，不改链对象。
4. 动作成功后才更新当前前驱；任一浏览器命令失败/取消即清空可用前驱，不用过期状态继续。多实例闭包完全隔离。observed URL 必须实际来自动作返回，不能从输入计算目标页 URL。
5. 恢复不能绕过此约束。复用现有 verifyResume 校验；只有成功恢复，且 checkpoint 可确定最近成功 browser node 时才恢复标记。如现有 checkpoint 没足够信息，明确拒绝 dependent scope 恢复，向 root 报告，不另造持久状态/检查点格式。不要为了恢复插入新导航。
6. 非 scope 浏览器命令仍刷新最近成功前驱；当前能力返回 output 合同不变；普通节点无模型。逐项校验配置，拒绝未识别 marker/缺少已存在 scope/读以外未知 command。
7. materializer 当前较长：把本项证明与标记逻辑放新 helper，不扩大超限函数。

## 验收

先交付纯函数/内存端口临时诊断，不新增测试文件：源连续性 true/false、错误 tab/URL、无前驱/错误 id、失败后清空、多实例隔离、恢复不能冒认。报告哪些依赖 Browser 尚未测。root 审查后拿 Browser 做真实不同入口和详情的同链 TaskChainRuntime 验证（不要手写 for loop 冒充链运行），finally 关闭。不需跑全量/重复测试。改动与实际命令写 R3_RUNTIME_SCOPE.md；遇方案反例先报告 root，勿自行扩架构。
