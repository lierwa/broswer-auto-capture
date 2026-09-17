---
status: superseded
date: 2026-09-15
superseded_by: ADR 0005
---

# browser-use 探索与 workflow-use 复跑的本地集成决策

> **2026-09-16 结论失效**：真实 LangGraph Issues 任务证明 workflow-use 0.2.11 的直接接入不能承担通用混合链路编译；B-A-T 还无依据地关闭 deterministic conversion，改用模型生成完整 definition。本文的 `verified` 和“选型冻结”仅保留为当时简单样例的历史记录。当前决策见 [ADR 0005](0005-workflow-use-fork-hybrid-compiler.md)，转换合同见[混合编译规范](../development/WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)，退出旧实现见[旧路径处置规范](../development/WORKFLOW_USE_LEGACY_DISPOSITION.md)。

本决策替代 ADR 0002 的 Pi 探索、trace/annotation 编译和 ADR 0003 的相关预执行策略。阶段 1–7 已在本地通过，产品链已经完成样本、不同输入验证和授权复跑并标为 `verified`。京东、Windows 与分发仍是独立门。阶段决策和逐文件范围见 [替换记录](../development/BROWSER_USE_REPLACEMENT.md)。

## 拟议边界与准入条件

1. **可执行事实**：workflow-use definition 作为带版本/digest/上游版本的私有 artifact。B-A-T 不把内部 action 转成另一套 IR，不另写 converter/executor；现有 IR 只保存显式 delegated `llm` 节点和产品外层契约。
2. **模型合同**：纯确定性 workflow 才能作为普通 capability；含 extract 等内部模型调用的复合执行只能通过明确声明的模型执行边界，逐项列出目的和授权。禁止用普通 `workflow-use.run` capability 隐藏模型。Agent、judge、generation、variable suggestion、extract、output conversion 分开记账；若公开 API 无法阻止未声明调用则拒绝接线。
3. **外层编排**：Plan/LangGraph 只管理步骤依赖、输入绑定、独立调用、产品取消、状态和持久化；workflow-use 拥有内部步骤执行。不扩充 TaskChainRuntime 为第二个通用状态机，也不逐项启动 Agent 复跑。
4. **输入能力**：仅接通经过样本及不同输入证明有效的 string/number/boolean 参数。object、array 和 batch 聚合不能通过 JSON 字符串伪装后声称参数化成功；不兼容步骤在启动浏览器前拒绝。
5. **事实等级**：history 保存为 exploration_evidence，包括失败/未知。只有 success === true 且 validated === true 才允许转换；关键动作无遗漏且 definition 可执行才是 workflow_candidate；随后依次 sample_replayed、input_verified、verified。schema 合法和 output-model 整形都不能替代完成标准；保留原始 ActionResult 的 error/basic-preview/raw fallback。
6. **模型与浏览器接线**：需求对话保留 Pi AgentSession + AI Connect。新 authoring/replay 仅由 browser-use Browser 执行观察和动作，不经过 BrowserSkill/BSK。Python 的 BaseChatModel/调用形状桥把 messages、vision 和 structured schema 交给 TypeScript AI Connect；不嵌套 Pi loop，不复制凭据到 Python。AI Connect 保留账号、选择、凭据与调用审计。若只能传单字符串或不能保留图像则停止。全局删除 BSK 前必须证明不存在其他独立调用方。
7. **完整任务**：Agent(task) 组合完整 Requirement Markdown/版本、PlanStep 与计划作用、resolved input/入口、可变输入声明、output schema、step/requirement completion、risks/授权和完整执行或代表执行模式。内容不规定 DOM、滚动、点击或抽取策略；上游持有完整 user_request。
8. **Browser 与人工等待**：创建 Browser 时设置外部所有权/keep_alive，同一产品运行只有一个 Browser；Agent→Agent/Workflow 必须实测仍为同一会话，外层 finally 关闭。等待若无法通过上游公开 API 安全暂停/续接，则记录 human_required 与不可恢复边界并结束控制会话；不伪造 checkpoint，不绕过登录或验证码。
9. **崩溃与副作用**：不承诺 workflow 内部 checkpoint/resume。崩溃保留中断及 pending effect，不自动从头重放可能写入外部系统的 workflow；后续重跑是新运行，需先核实副作用。Python 普通返回后再次检查取消事实，取消不能投影成 completed。
10. **进程与敏感数据**：协议独立通道，上游 stdout/stderr 进入受控 sink；不把原始 stderr/页面/extraction 写入产品日志。完整 history 仅进忽略的本地 artifact，保存安全摘要和 digest；Cookie、凭据及 Profile 内容不入 Git。macOS/Windows 退出、编码、取消及管道分别验证。
11. **许可证**：browser-use 为 MIT，workflow-use 为 AGPL-3.0。当前只接受本地集成，保留许可证、固定版本、补丁和源码来源；分发前明确 Corresponding Source、版权告知及网络交互义务的适用范围。独立 Python 进程不自动豁免许可证义务，没有接受闭源分发兼容结论。

## 未冻结事项

- 固定 browser-use 的 MCP 2.1.1 与 workflow-use 的 MCP <2 冲突；后者 lock 为 browser-use 0.13.8、MCP 1.29.1，不能声称已锁定 0.13.10 组合。
- workflow 内部持久恢复和真实站点人工等待仍未通过运行证据；当前失败时关闭 Browser，并把重新执行保留为新的产品运行。
- Windows 安装、进程退出与 Chrome 路径仍未通过实机证据。
- AGPL 对外分发或网络服务义务尚未作产品决定；京东仍等待新需求版本确认。

## 来源

- [固定 browser-use 源码](https://github.com/browser-use/browser-use/tree/5c892e013a73e6622e6f50336e1eb0aa2c4405f2)
- [固定 workflow-use 源码](https://github.com/browser-use/workflow-use/tree/5d2d19fe8835cc86f1bf3e04302a5000d590f249)
- [GNU AGPL v3 正文](https://www.gnu.org/licenses/agpl-3.0.html)，重点核验第 5、6、13 条；产品分发决定仍未冻结。

## 2026-09-15 实测后状态

官方 lock 的 0.13.8 组合可以安装，macOS import、本地 Agent/judge 和同 Browser 连续运行已通过；0.13.10 的直接依赖冲突未解决。用户授权的两份独立上游补丁修复公开生成 prompt 与 `PageExtractionStep` 分派，补丁后采集任务的样本/换 URL 复跑和非采集任务的样本/换文本复跑均通过，且所有 fallback/error 检查为零。选型冻结为本地集成，补丁保持可独立向上游提交。真实产品入口进一步完成样本、不同输入验证和授权复跑，逐用途模型审计完整，产品链已到 `verified`；Windows、分发和京东仍由后续门决定。见[补丁与兼容证据](../development/evidence/workflow-use-local-patches-2026-09-15/README.md)与[产品接线验收](../development/evidence/workflow-use-product-2026-09-15/README.md)。
