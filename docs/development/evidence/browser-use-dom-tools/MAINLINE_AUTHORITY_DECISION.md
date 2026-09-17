# 普通 Markdown 到执行条款的准入取舍

状态：已撤回。用户明确否决独立规则 JSON 及同源条款投影，授权直接以详细自然语言任务进入 b-u。以下仅保留旧提案背景，不再等待用户选择。当前执行见 [NATURAL_TASK_IMPLEMENTATION.md](NATURAL_TASK_IMPLEMENTATION.md)。

## 已核实的阻塞

当前任务已确认需求 v2、计划 v6 均可正常读取，但没有 clauses/control/acceptedAnnotations，brief 为 null。普通 Markdown 中已经明确页码、序号、筛选和输出要求；用户意图没有待补问题。

[混合编译规范第 2 节](../../WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md) 规定缺少 PlanControlContract 时只能：

> 从 Requirement 中读取已经结构化且无歧义的条款；接受用户确认过的 ControlIntentAnnotation；产生 missing_control_intent gap。

按这条规则，现有确认只覆盖 Markdown，开发者不能自行填写 authority 或把后生成的模型解读标成 user-confirmed。入口错误已从错误的 v1 退休归属修正为 `missing_control_intent / structured_authority_missing`，保持模型、Browser 和队列零副作用。v1 链执行继续退休。

## 推荐方案：同源条款投影

将已经确认的 Markdown 加上可核对的原文定位，允许在现有计划模型调用中生成结构化条款投影。只扩展这一权限，不新增模型调用用途；不生成节点图、边、预算或脚本，不让模型提供技术 selector。

最小合同：

- `requirement`：原需求 id/version/digest，计划必须仍引用相同版本。
- `source`：每个条款的原文起止位置与逐字片段；宿主核对位置、字节内容和需求摘要。
- `clause`：仅选择策略/序号、输入绑定、输出及完成条件等既有类型；不能携带 actionRefs、DOM selector、节点 ID 或图边。
- `provenance`：`confirmed_markdown_projection`，不能使用 `confirmedBy: user` 冒充用户对模型输出逐项确认。
- 技术 locator 与动作绑定：只能在实际 D1 来源中构建并核对；未出现、存在歧义或条款与动作不一致，均保留 gap。
- 生成及校验：现有 plan 模型调用和审计；来源引用和 schema 由宿主验证。引用存在只能证明来源可追溯，不能单独证明模型语义正确，必须由条款覆盖、真实样本和换输入验证共同限制。
- 版本与失败：投影随新计划版本持久化，保留原需求；模型调用失败或引用/语义绑定不符不启动浏览器、不生成候选。不修改旧运行。

需要用户允许修改上述第 2 节，让这种投影作为一种 authority 来源。实施后仍须完成普通 Markdown 正式入口、真实探索、来源存储、普通样本复跑和同链换输入验证，不能仅凭投影输出通过就宣称主线完成。

## 保持现行规范

可在现有计划模型输出中生成带原文定位的候选条款，但仍需要用户对迁移后的条款作一次确认。确认前主线保持 `missing_control_intent`；工具和错误归属修复可独立交付。

## 当前明确未做

未变更 authority 规范，未增加规则生成模型调用，未修改用户原始确认数据，未手写 GitHub selector/控制合同，未启动主线浏览器。
