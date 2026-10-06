# 三处运行 UI 原型与运行闭环问题草案

> 最新范围修正：用户否决第一版整套工作台样板。本轮仅在现有原型上修改运行弹窗和侧边抽屉，不重写整体，不开发产品。原工作台顶部规则保留为生命周期问题记录，不再单独提供其原型。菜单改用既有 Select 的 popper 定位并约束高度；抽屉去掉历史下拉、重复状态与失败步骤文字，收紧原因和操作间距。最新截图和检查见原型目录 `refined-*.png`、`refinement-validation.json`。后续正式修改文档以最终确认版本为准，下方第一版 UI 说明尚未获确认。

状态：**待用户确认 UI，尚未进入产品实现**。用户本轮要求先出原型、梳理根因；确认后再合并为一份正式修改文档。本文件不宣称运行闭环已修复。

## 1. 产品目标与本轮范围

用户要在同一平台维护一次登录，运行已发布任务，并可再次运行。保留结果网页不应产生必须手动“结束原窗口”才能复跑的额外步骤。账号维护、任务运行、结果查看是三个不同操作；只有实际浏览器控制冲突才需要协调。

本轮只制作以下三处交互原型与修改草案：

1. 再次运行弹窗。
2. 链路工作台顶部的运行状态与控制。
3. 右侧运行结果面板。

账号管理的已确认布局不在本轮重新设计。继续保持单个平台账号视图，内部处理浏览器登录复用，不要求用户分别维护两张浏览器账号卡片。

## 2. 当前根因：哪些是事实，哪些尚待工程验证

2026-10-03 本轮使用 SQLite `mode=ro` 与租约文件只读核验，脱敏证据见 [diagnosis.json](../../work/run-loop-prototype-20261003/diagnosis.json)。

| 核验项 | 事实 | 含义 |
|---|---|---|
| 已有正式运行 | 共 7 条，4 completed、3 failed，无 queued/running | 报错不等于另一个任务正在运行 |
| 阻塞记录 | 同一任务 10月2日22:37 开始的 daily 运行，已 completed | “另一项”实际是同一任务的一次旧运行 |
| 清理 | cleanup.confirmed，attempt=1 | 已确认运行器清理，不应覆盖完成结论 |
| 页面交付 | browserHandoff.active、purpose=delivery | 页面保留和运行占用被共用一个阻塞条件 |
| 文件租约 | attached-window-lease.json 为 handoff，owner/lease 与旧运行一致 | 旧交付记录仍参与新运行准入 |
| 真实窗口状态 | 本轮没有控制或检查私人 Chrome | 不能凭文件宣称窗口确实开着、关了或可安全释放 |

实际入口：

- `apps/api/src/task-chain/service.ts` 的 `assertDirectRunAvailable`：先检查清理，再对 `activeBrowserWindowLease` 一概拒绝，然后才检查实际 owner、queue、controller。
- `apps/api/src/database/store.ts` 的 `activeBrowserWindowLease`：按保留记录和浏览器种类判断；没有把完成后的 delivery 页面与可恢复运行现场分开。
- `apps/workbench/src/LiveChain.tsx`：启动请求错误来自 connection.error；画布/ExecutionStrip 仍显示旧 selectedExecution，关闭运行弹窗后可出现全局红条。
- `apps/workbench/src/ChainRunDialog.tsx`：重复的启动错误还可进入弹窗；重试重复旧命令，阻塞条件没有变化。
- `apps/workbench/src/WorkbenchContext.tsx` 与其运行详情组合：旧执行结果、步骤调用、网页控制及需求修订入口集中到一个面板。

因此问题有两层：**后端把保留网页当成运行锁；前端把失败的启动尝试当成当前执行错误，和旧执行结果混合展示。** 调整间距或删除提示不能完成修复。仅修正不同 Profile 互相阻塞，也不能证明同一 Profile 正常复跑已完成。

当前 LiveChain 已用 `!model.runDialogMode` 避免弹窗打开时同时显示背景错误；这项已有修正保留。仍需修正关闭弹窗后的请求错误归属、旧成功与新启动失败混用，不能把历史截图的所有问题都称为当前仍未修改。

`controlBrowserHandoff` 当前接受 inspect/focus/end，并更新 execution sequence、持久化操作。它不是纯只读探测入口；本轮未调用它，也未结束旧窗口。

该入口调用 managedWindowAction 时没有显式传入 record.browser.mode。后续须核验并补齐按冻结模式进入正确适配器的接线，不能由函数名称推断日常/专属路由正确。

## 3. 原型入口与交互原则

可离线打开 [run-control-prototype.html](../../work/run-loop-prototype-20261003/run-control-prototype.html)。顶栏“1/2/3”、演示状态和主题切换是审图工具，不进入产品。所有运行、结果和浏览器操作均为示例数据；原型不连接产品 API、数据库或个人 Chrome。

当前会话的本地预览地址：[交互原型](http://127.0.0.1:4190/run-control-prototype.html)。这是原型目录的独立静态服务，不替换4173/4175产品服务；离线HTML可在预览服务结束后继续使用。

### 3.1 再次运行弹窗

420px 上限；窄屏收缩；正常状态与启动错误均无内部滚动。布局自上而下：

| 区域/操作 | 内容 | 用户目的 |
|---|---|---|
| 标题 | 再次运行 | 确认操作 |
| 一行上下文 | 任务名称 · 已发布 V1 | 确认运行哪个任务、哪个版本 |
| 浏览器行 | 左侧“浏览器”，右侧当前选项 | 调整本次运行的浏览器；不隐藏在远处“更改”里 |
| 观察间隔 | 标签、当前值、一个紧凑 Slider | 知道每个节点开始前等待多久；默认即时、范围0–5秒 |
| 启动拒绝 | 一条原因，紧邻操作区 | 仅解释这次启动为什么未被接受 |
| 取消 | 关闭弹窗，结束当前启动尝试 | 保留旧运行和结果；不触碰浏览器网页 |
| 开始运行/重试 | 同一个主按钮 | 提交时立即 loading，禁止重复提交 |

不设置只有一个选项的“运行设置”折叠区。业务输入仍由现有 ValueSchemaForm 按发布版本输入合同渲染；本例无参数，不另造表单。当前值由现有浏览器配置初始化，本次选择冻结到已有 run_task.browser；不因调整本次运行选项暗中改变全局默认设置。

错误只显示在弹窗。取消后结束这次尝试的可见提示；失败记录保留在原有审计路径，不复制到工作台大红条。修改任何提交参数后不得悄悄重发旧 payload；创建新请求标识。未修改且重试不确定提交结果时，沿用原标识以避免重复创建 execution。

### 3.2 链路顶部

一行：`第 N 次 · 状态 · 时间` + 右侧操作。它只描述选中的 execution，不描述没有创建 execution 的启动失败。

| 状态 | 主操作 | 结果操作 |
|---|---|---|
| 未运行 | 运行 | 无旧结果 |
| 已完成/失败/取消 | 再次运行 | 查看结果/失败原因；面板已打开时隐藏重复入口 |
| 排队/运行中 | 仅对实际当前运行提供停止 | 查看进展 |
| 等待用户 | 停止运行 | 打开本次等待面板 |
| 查看旧历史、另一次运行尚未结束 | 返回第 N 次运行 | 不把“停止”暗中作用于别的运行 |
| 连接清理待确认 | 暂不可再次运行 | 原结果仍可查看；展示实际恢复进度 |

取消、停止、再次运行、同一运行继续四者不能互换。所有控制都绑定明确 executionId；异步接受后，画布与结果面板同时绑定新 executionId。没有新 execution 的启动拒绝，不能改写旧成功状态、节点事件或结果。

### 3.3 右侧结果面板

344px 桌面宽度；窄屏在工作区中切换为完整结果视图。关闭后回到原画布，不叠加第二个滚动弹窗。

- 标题“运行结果”，右侧关闭图标。
- 一行“第 N 次 · 时间”，点击可切换已有运行历史；画布、状态和结果同步切换。
- 一行完成状态与耗时。
- 直接显示现有 ResultSpec/ResultBinding 渲染的结果。原型的“收藏商品”三项仅演示布局，不进入公共类型或站点特判。
- 正常完成没有“当前步骤调用”下拉、两层“查看成果”按钮、“结束原窗口”或“重新说明需求”大块区域。技术调用仍可留在已有节点详情/高级诊断；需求修订仍通过既有需求入口办理。
- 等待登录时，原地展示“请先在网站登录”，只有“返回网站”和“继续运行”。前者定位本次所有的窗口；后者核验后继续同一次执行，不能靠点击判为已登录。
- 运行失败展示失败步骤与原因；保留已产生输出，不覆盖首败。资源清理问题展示在结果下方的小提示，业务结果继续显示。

## 4. 运行闭环修改规则

### 4.1 必须区分的事实

| 事实 | 权威来源/归属 | 不得被当作什么 |
|---|---|---|
| 平台登录与身份 | Profile 内真实网站会话、已有账号检查结果 | 当前任务状态或按钮点击 |
| 启动尝试 | requestId、冻结的输入/版本/浏览器选项 | 尚不存在的 execution |
| 执行进度与业务结果 | 独立 execution、TaskRun、持久化事件与输出 | 窗口是否关闭 |
| 实际浏览器控制 | 已有 driver/session、controller、owner/lease | 历史网页保留标志 |
| 人工等待现场 | 同一次可恢复执行及精确窗口归属 | 可以任意挪给新运行的普通结果页 |
| 完成交付页面 | 用户可查看的历史网页 | 继续独占运行器的理由 |
| 资源释放 | 本次执行清理证据 | 链路业务失败或模型修复许可 |

这些是现有事实的责任拆分，不新增第二套任务状态机、调度器或事实库。

### 4.2 正常闭环

1. 用户完成平台登录，系统用真实检查确认身份并保存；登录维护窗口与平台/Profile 归属独立于任务。
2. 用户提交已发布版本；服务端通过准入后才创建独立 execution，冻结运行输入和浏览器模式。
3. UI 在提交中立即显示 loading；接受后只绑定新 execution。运行由现有 LangGraph/TaskChain 推进。
4. 合法结束后先保留业务结果，再确认本次 controller/runner 释放。需要保留的交付网页交给用户查看。
5. 用户再次运行时，在同一 Profile 创建新的本次目标，复用现有登录；旧交付网页保留且不参与控制锁。
6. 新执行不导航、关闭或接管旧用户页；新结果不覆盖旧执行。任务零模型复跑约束继续生效。

第4–5步需要用现有日常 Chrome/专属浏览器适配器验证 target、process、lease 的生命周期。特别是专属浏览器不能对同一 Profile 启动第二个不兼容进程；应复用既有浏览器进程/连接公开能力、创建新的本次目标并转移控制归属。无法安全复用时必须给出真实差距，不能强删旧租约冒充成功。

### 4.3 例外闭环

- **尚有实际控制器运行：** 返回明确任务与运行身份；只提供定位该运行，不写模糊“另一项”。
- **等待登录/验证码/用户输入：** 保留同次恢复现场，不因5秒检查超时或关闭账号面板自动关窗。探测超时只结束本次探测。用户实际操作后核验并继续同一次运行。
- **启动被拒绝：** 保持旧画布与旧结果，错误只在提交弹窗；取消后没有背景残留。重试必须先具备状态变化或明确可重试条件。
- **清理未确认：** 业务结论保留，execution 为 cleanup_required。仅恢复可证明属于本次 execution 的资源；不能要求退出平台账号或清理整个个人 Chrome。
- **服务重启/租约失联：** 按冻结 browser.mode 路由到正确适配器，核验 owner、lease、target、controller/process。证据未知则保留原因；不得看到 historical active 就永久阻塞，也不得假定它已释放。
- **用户停止：** 停止本次实际 controller，保留首败/已完成输出，清理结果单独记录。停止不等于退出网站账号。

### 4.4 账号维护与运行之间

账号页只呈现一个平台的当前账号与真实可用状态。日常/专属的登录复用由现有账号适配器后台处理；不能把“双浏览器都要检查一次、手动同步、结束维护窗口”变成每次运行的前置流程。

实际维护操作只拥有其创建的目标与租约；不得通过当前任务 executionId 借用或关闭别人的窗口。维护结束释放控制；用户选择保留网页登录页面时，不保留一个虚假的任务执行锁。真实写操作若与当前运行争用同一控制器，按现有单控制会话边界协调，并明确指出实际运行身份。

个人 Chrome 首次扩展授权、网站密码/验证码必须由用户完成；这只是对应人工门，不是要求用户替系统清理租约。自动复用有站点限制或失败时保留原账号、不给目标标记假成功，也不增加两个账号管理面板。

## 5. 后续实施入口与复用约束

```text
Product Alignment:
- natural-language task: 已发布浏览器任务可查看结果并连续复跑；平台登录独立维护
- reusable chain boundary: 同一不可变发布版本，每次输入产生独立 execution
- runtime inputs: 原输入合同、release reference、browser、pacing
- dynamic task outputs: 原 ResultSpec/ResultBinding 与实际执行输出
- generic platform capability used: 运行控制、浏览器会话归属、事件投影、结果查看
- replay model calls: 仅原显式 llm 节点；不增加全局 judge 或租约判断模型
- site/task-specific code added: no

Reuse Assessment:
- capability: 三处运行 UI 与已有浏览器资源的归属/交付
- existing implementation in repository: Radix Themes、React Flow、TaskChain/LangGraph、SQLite、browser-use/日常扩展适配器
- mature candidates and pinned versions: 现有 Radix Themes 3.3.0、React Flow 12.11.6；浏览器依赖继续按现有固定版本
- selected implementation: 现有组件与公开会话/target 能力
- reused public surface: Dialog/Select/Slider/DropdownMenu/Table、ReactFlow、已有运行命令与 browser adapter
- B-A-T-owned adapter and remaining gap: 分离启动提示与 execution；区分交付页面和实际控制租约；核验进程/target 交接
- license/runtime/platform fit: 不新增/替换依赖；沿用已记录选型，补 Windows 最小生命周期样本
- browser/runtime/state ownership conflicts: 同一 Profile 进程复用、历史页面交付、人工恢复现场不可挪用
- replay model calls: 无新增
- rejected candidates and evidence: 不另造 UI 控件、图调度、浏览器驱动或账号检查 DSL
- focused validation: 本轮只验证离线原型；生产工程门列于下节，尚未执行
```

UI 实施入口为 ChainRunDialog/ReplayPacingControl、LiveChain/ExecutionStrip、WorkbenchContext 的现有结果组合。服务端实施入口为 TaskChainService、ProductStore 租约查询、已有 upstream-browser 与 attached/managed window 适配器。按责任拆分和删除无调用旧路径，保留有效审计、人工恢复与安全归属逻辑，不能按“旧代码”一概删除。

## 6. 后续最小工程验收（当前均未完成）

| 门 | 必须证明 |
|---|---|
| 连续复跑 | 同一 Profile 首次完成且网页保留，再次运行成功接受；两个独立 execution、两个独立结果 |
| 日常/专属 | 两个已有适配路径分别在自有隔离 Profile 验证；旧页面、登录与用户目标不被关闭/导航 |
| 私人旧现场 | 本轮已只读诊断；后续不得擅自结束该旧窗口。能在安全隔离样本完成工程门，不把私人登录作为工程阻塞 |
| 启动拒绝 | 没有新 execution，旧状态与输出不变；错误只出现一次，取消不残留背景错误 |
| 运行控制 | 开始/停止/等待后继续分别绑定正确 execution；继续不是新运行；浏览历史不能误停当前另一条运行 |
| 资源异常 | completed/failed 的业务输出保持，cleanup_required 只反映资源；保留首败与清理重试 |
| 重启 | 窗口保留与实际控制的区别可持久化重建；按冻结模式路由；归属未知不越权释放 |
| 账号维护 | 人工登录没有固定短时关窗；关闭面板不结束登录；维护释放不成为任务复跑永久锁 |
| UI | 真正 Radix 渲染，深/浅/窄屏及短屏；正常与错误弹窗无滚动；结果入口不重复 |
| 约束 | 不生成新业务任务，不改模型配置，不增加隐式模型调用，只运行所属 package/受影响范围 |

下一步：用户确认本原型；把确认结果与以上生命周期规则合并为正式修改文档；按此前授权做一次对抗文档 review、修正文档后再开发；开发完成再对抗 code review 和最小受控验收。本轮不越过 UI 确认门。

## 7. 本轮原型验证与证据

本轮使用自有隔离的 Windows Chrome headless 渲染 HTML。检查结果在 [validation.json](../../work/run-loop-prototype-20261003/validation.json)，首败保留于 [validation-first-failure.json](../../work/run-loop-prototype-20261003/validation-first-failure.json)。系统 Python 缺少 Playwright，切换项目既有上游 Python 环境重试；没有安装额外依赖。

重试1的定位器使用背景 heading 的可访问角色；Radix 模态会正确隐藏背景可访问树，导致定位超时。该失败保留于 [validation-retry-1-failure.json](../../work/run-loop-prototype-20261003/validation-retry-1-failure.json)，改为定位已知页面元素后通过。查看截图又修正了描述行间距和 React Flow 的主题传入，随后重新验证相关原型。最终检查数与结果以 validation.json 为准。

原型模拟可证明布局和界面交互规则；**不能证明真实浏览器连续复跑或租约修复已实现**。上述生产工程验收项仍待后续开发。

最终原型验证通过20项，外部网络请求0、产品API调用0；真实渲染并查看了深色、浅色、窄屏与短屏错误截图。首败与重试如上保留。构建中的既有依赖 `use client` 指令提示保存在原型目录 `build-warnings.log`，未阻止构建或出现浏览器脚本错误。
