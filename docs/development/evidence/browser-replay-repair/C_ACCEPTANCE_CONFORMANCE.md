# C 阶段交互顺序独立验收

状态：2026-09-19 已通过。A、B 的已验证产物被原样复用；本轮没有进入 D，也没有增加普通节点模型调用。

## 产品边界与实现结果

正式复跑仍沿用 `TaskChainRuntime -> withHybridCapabilities -> RunnerProcess -> OrdinaryCapability -> browser-use Tools.act`
这一条入口。C 没有增加第二个动作引擎、浏览器或调度器，完成的通用缺口只有：

- 动作前以当前 document 的新鲜 DOM 映射重新定位；必要滚动后再次绑定，并核验可见、可用、非只读、命中点及遮挡关系。
- `click`、`input`、`select_dropdown` 在派发窗口捕获实际 DOM 事件；只有事件 target 为意图元素自身或后代才接受。
- 业务动作仍位于 `StepVerifier` 后态重试之外，所以慢响应只重复观察，不重复派发。
- 异步取消时，统一暂停边界把仍在途的 capability 效果固定为 `uncertain`；同一 run 恢复先核验检查点，未决效果不重派。
- runner 与 Browser 仍在 `finally` 中关闭；Windows 临时目录释放使用 Node 原生有界重试，清理竞态不再覆盖取消结果。

## Reuse Assessment

- capability: 目标准备、原生动作、后态等待、取消与恢复。
- existing implementation in repository: browser-use 0.13.8 `Tools.act`、既有 `TargetResolver`、`StepVerifier/Tenacity`、
  TaskChain pending effect 与 LangGraph `StateGraph`。
- selected implementation: 继续复用上述公开动作和调度面；B-A-T 只增加动作前命中适配、事件 target 证明和暂停状态收口。
- B-A-T-owned adapter and remaining gap: `target_preparation.py` 处理当前 document 的通用可操作性；
  `NativeEventCapture` 记录派发窗口内的实际命中关系；没有网站或业务实体分支。
- browser/runtime/state ownership conflicts: 单次产品运行仍只有一个 runner 和一个 Browser 会话；恢复不创建第二套检查点事实源。
- replay model calls: 0。
- rejected candidates and evidence: 不复制 browser-use 动作实现，不把 postcondition 重试包在业务动作外，不用固定等待、像素坐标、
  URL-only 成功或重新探索代替后态证明。
- focused validation: 下列定点测试、受控真实浏览器、取消恢复和真实可见 GitHub 复跑。

## 定点验证

| 验证 | 结果 | 保护的不变量 |
| --- | --- | --- |
| `test_interaction_order.py` + `test_consumer_readiness.py` | 15/15 | 滚动后重绑、document 替换、动作一次、后态重试、隐藏/禁用/遮挡拒绝、真实事件命中 |
| `test_hybrid_author.py` | 20/20 | 原生事件捕获变化不破坏正式来源采集与读取合同 |
| runtime capability 取消目标测试 | 1/1 | provider 尚未响应取消时，暂停仍保留 `uncertain`，恢复不重派 |
| runtime/API TypeScript 检查 | 通过 | stable capability 夹具、runtime 暂停状态及 Windows runner 清理类型正确 |
| 受管 fork source 校验 | 通过，digest `87dd654c89dbdf8e05f170344183621970f902bde741d7c1fac9163e19cb15a7` | 实际加载源码与 `LOCAL-CHANGES.json` 一致 |

## 受控真实浏览器顺序验收

同一正式 runner 入口完成以下场景；浏览器在 `finally` 中关闭：

- 嵌套滚动目标在滚动后重新绑定，`scrollTop=476`；延迟后态在约 5.5 秒后成立，动作审计次数为 1，实际命中为目标后代。
- 永不满足的后态以 `ordinary_postcondition_failed` 退出，业务动作审计次数仍为 1，没有因观察重试而再派发。
- 输入最终值为 `hello`，下拉最终值为 `beta`，按键结果为 `entered`；各自存在派发窗口内事件证据。
- 同 URL document 替换后 observation digest 改变，旧映射失效，新 document 状态为 `reloaded`，点击仍只有一次。
- 普通运行 `modelCalls=0`，关闭后无测试 runner/Chrome 进程。

## 取消与恢复验收

受控页面在服务器实际收到一次点击后立即取消。结果为：

- 首次运行 `paused`，cause 为 `interrupted`；`pendingEffect.kind=capability`、`nodeId=click`、`status=uncertain`。
- 恢复沿用同一个 run binding，因未决效果继续暂停；服务器副作用总数保持 1，没有再次点击。
- 首次与恢复的 `modelCalls=0`、`llmCalls=0`；runner、浏览器和临时 owner 目录正常回收。

## 真实可见 Chrome 验收

只运行一次新的可见 Chrome sample，复用 B 已通过的 GitHub Issues artifact 和完整查询输入：

- TaskChain `completed`，completion evidence 为 `two-pages-read` 与 `second-page-detail-handling`。
- 第一页 5 条、第二页 5 条，第二页首条详情的标题和正文均成功读取；链路在交付详情后结束，因此无需返回列表。
- 30 条节点生命周期事件全部闭合；10 次浏览器命令、10 次转换，编译 gaps 为 0、结果分支为 1。
- canonical digest 为 `9c406549819ae79d4c8fafab8d08c36bc534562efba54c15857390abbaa5150c`。
- `modelCalls=0`、`llmCalls=0`；完成后匹配本次 owner 的 Python/Chrome 进程数为 0。

## 结论

C 的动作准备、真实命中、单次派发、具体后态、取消、未决效果和恢复不重派均已有独立证据。C 阶段门已关闭；
D 是后续阶段，本轮未进入。
