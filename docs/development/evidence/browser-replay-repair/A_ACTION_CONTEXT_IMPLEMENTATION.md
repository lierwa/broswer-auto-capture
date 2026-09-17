# A 动作记录与上下文还原实施记录

状态：实施中。本文记录 A 阶段的选型边界、源码依据、改动和验收证据；只有真实浏览器正式入口验收完成后才更新为通过。

## Product Alignment

- natural-language task: 任意需要在网页中导航、点击、输入、发送按键并读取公开动作结果的自然语言任务。
- reusable chain boundary: 原生 Agent 提议的一个动作，从固定 history 位置进入 `Tools.act`，到真实 DOM 事件和公开 `ActionResult` 被关联进同一规范化动作记录。
- runtime inputs: 当前 Browser 会话、原生动作名及完整参数、意图目标、动作所属 document/frame。
- dynamic task outputs: 派发状态、实际事件命中目标及局部上下文、完整公开动作结果、动作后浏览器状态。
- generic platform capability used: browser-use `Agent` / `Browser` / `Tools.act`、公开 CDP client、现有规范化 trace 与来源 artifact。
- replay model calls: 采集、关联、保存、加载和普通节点执行均为 0；首次探索仍是独立 Agent 模型调用。
- site/task-specific code added: no

## Reuse Assessment（初版，已由 `A_ACCEPTANCE_CONFORMANCE.md` 的 v2 取代）

- capability: 原生动作派发、真实 DOM 事件捕获、局部上下文复制、公开结果交付和来源持久化。
- existing implementation in repository: `ActionDispatchAudit` 已按原生 step/action 位置标记 `Tools.act` 入口；`EvidenceCollector` 已保存前后观察和规范化 trace；source artifact 已具备摘要校验和加载入口。
- mature candidates and pinned versions: browser-use 0.13.8、workflow-use 0.2.11、其传递依赖 cdp-use。
- selected implementation: 保留 browser-use 原生 `Tools.act` 与唯一 Browser 所有权；通过当前 `BrowserSession` 的 CDP client 使用 `Runtime.addBinding`、`Runtime.bindingCalled`、`Page.addScriptToEvaluateOnNewDocument`，仅补一个动作期局部事件适配器。
- reused public surface: `Tools.act`、`ActionResult.model_dump`、`BrowserSession.get_or_create_cdp_session`、`BrowserSession.get_all_frames`、当前 CDP client 及 cdp-use 的 typed send/register surface。
- B-A-T-owned adapter and remaining gap: B-A-T 只建立动作位置、document/frame、事件与结果的证据关联；关闭 ShadowRoot 对外隐藏的内部节点和未附着跨进程 frame 必须明确记录边界，不能猜测。固定 cdp-use 的 `EventRegistry` 只支持单 handler，且没有公开的 handler 所有权读取接口；为避免关闭时误删后来注册者，适配器只在清理所有权检查处读取锁定版本的 registry handler，升级时必须由版本门和定点测试重新核验。
- license/runtime/platform fit: 不新增依赖，沿用已冻结 Python 3.12 环境与现有 Chromium/CDP 通路；Windows 生命周期仍由现有 runner 管理。
- browser/runtime/state ownership conflicts: 适配器借用当前 Browser，不启动或关闭第二会话；动作结束或 author 退出时移除本次 init script/binding，Browser 仍由 runner 所有。
- replay model calls: 0；不引入第二个 Agent loop、图调度器或检查点库。
- rejected candidates and evidence: 动作结束后读取 `history.interacted_element` 只能得到意图/历史目标，不能证明真实 `event.target`；按 pre-action XPath 在 post DOM 中重找节点同样会把结构位置猜测成身份，两条补写分支均已删除。只有动作前已用同一 backend node 核验过的唯一语义 query 可以用于动作后读取；参数摘要只做固定位置的完整性校验，不用于搜索或替换原值。
- focused validation: Python 合同测试、跨语言协议测试、vendor 来源清单校验；随后通过产品正式 authoring 入口运行真实 Chromium 受控页，核对页面事件日志、服务端业务计数、source artifact 保存加载，再进入实际任务页验证。

初版按动作重复安装监听、且旧受控页把所有边界串成一条脆弱路径。静态复审发现它不能证明无显式目标的
frame 键盘动作，也不能将夹具丢报告与采集失败分开，因此不得继续以局部补丁修正。新的验收缝隙、反例矩阵和
Reuse Assessment 见 [`A_ACCEPTANCE_CONFORMANCE.md`](A_ACCEPTANCE_CONFORMANCE.md)。

## 固定源码依据

- browser-use `Tools.act` 是 Agent 与普通节点共用的原生动作入口，click 最终派发原生 `ClickElementEvent` 并返回公开 `ActionResult`。
- browser-use `BrowserSession` 暴露当前 CDP client 和 `get_or_create_cdp_session`；cdp-use 暴露 Runtime binding 事件及新 document init script 命令。
- 固定版本未提供可直接返回真实 click `event.target` 的高层回调，因此局部监听适配器是剩余最小缺口。

## 术语与身份规则

- 意图目标来自动作派发前的原生 selector map。
- 事件命中目标来自事件捕获阶段的 `event.target`；`composedPath()` 单独保存，不能用意图目标替换。
- 动作主身份是原生 `(StepMetadata.step_number, actionIndex)`；参数摘要仅检查该位置内容是否被改写，重复同参不得触发搜索匹配。
- “未派发”“已派发但事件缺失”“公开结果缺失”分别记账。
