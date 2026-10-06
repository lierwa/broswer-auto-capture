# 运行入口与复跑闭环最小修订（2026-10-04）

状态：最小实施、对抗修订与正式加载完成。用户后续授权原京东主链路实际执行，原V1在真实日常Chrome连续两次completed/cleanup confirmed，各2输出、0模型调用，中间不结束窗口。现场新增两项旧收据兼容修复：完成交付归档不把短时relay地址当Profile身份；当前/已有旧归档用Pydantic合同比较默认字段，仍保留真实冲突与最终字节核验。8项定点测试及窄对抗复审通过。首败/重试与其它平台私人未测项见RUN_CONTROL_DELIVERY_20261004.md。

本文件取代 `RUN_CONTROL_UI_AND_LIFECYCLE_DRAFT_20261003.md` 中被否定的运行状态抽屉与重复结果入口。账号面板既有平台目录及单平台账号交互不重做。

## 用户确认的界面边界

1. 画布上方只保留一条 toolbar：发布版本、明确的本次运行标识、状态与必要的短原因、当前可执行操作。删除独立红色启动错误块和可点击的 ExecutionStrip。
2. 运行弹窗直接排列浏览器选择、观察间隔、必要的任务参数、取消/开始。复用 Radix Dialog、Select、Slider、Button；没有“运行设置”折叠层或嵌套设置弹窗。正式运行的选择只冻结到本次命令，不修改全局浏览器设置。试跑仍按既有准备授权选择，不偷偷增加可变授权。
3. 点击开始立即 busy；明确拒绝只在弹窗显示一次。重试沿用完全相同的命令和 requestId；明确拒绝后更改参数、浏览器或间隔才建立新命令。取消清除明确拒绝的尝试，保留原执行结果。回执未知时只能关闭展示或核验原请求，不能清空或改写冻结输入；只读失败不能解除此锁。服务端接受后关闭弹窗，并绑定返回 executionId。
4. 运行状态不打开抽屉。输出仍在结束节点，通过已有 SavedResultDialog 和可调整宽度的详情容器读取；不新增输出展示器。保留需求理解错误的反馈入口，但移到结束节点，不能借此保留一份状态抽屉。
5. toolbar：排队/运行中可停止；人工等待可返回原页面并继续同一次运行；正常结束可再次运行；清理未确认显示业务结论和“恢复连接”。原页面保留不是普通用户必须手工完成的操作。历史与诊断保留原失败事实和必要的现场管理。
6. 深浅主题沿用现有 tokens；390px 窄屏、较矮窗口不得横向溢出。容器可因真正的长参数表单滚动，不用大片空白、重复状态或重复结果撑高弹窗。

## 已核实的失败链

只读 SQLite 和租约证据：execution `5e9ae197-e6f8-4f4d-8dad-4aa13d57daeb` 已 completed、cleanup confirmed，browserHandoff 却仍 active/delivery。`ProductStore.activeBrowserWindowLease` 将交付页面和正在控制/等待恢复的现场同等排斥；`assertDirectRunAvailable` 因此在重新启动前返回“另一项运行”。此证据不证明物理窗口仍然打开。

UI 同时以全局 Callout、ExecutionStrip 与 ExecutionContext 展示同一执行的错误/结果，启动拒绝还会污染旧的完成态。

## 最小所有权修订

- 不改 TaskRun 完成定义，不增加模型检查、调度器、驱动或数据库。
- 只有终态、cleanup confirmed、handoff active/delivery 且 owner/lease 均为该 execution 的确定 owner，才允许把保留页与控制锁分离。人工等待、pending/unavailable、未确认清理仍阻止接管。冲突应指出具体任务和 execution，避免含糊的“另一项”。
- 服务端从 SQLite 生成可释放的 owner 白名单，传给原 browser-use runner 的 managedWindow 配置；HTTP 用户命令不能直接指定此白名单。
- 原租约通过完整临时文件、fsync、独占原子发布保存到同 Profile 的私有 owner 归档。专属 current 保留至新 starting 收据原子替换，避免归档与新建之间失去进程凭据；不同历史收据不覆盖。归档不是删除所有权；原页面仍存在，历史 inspect/focus/end 仍按原 owner 读取。不同 Profile、endpoint、非 handoff、未知 owner 一律拒绝。
- 日常 Chrome 复用现有 AttachedWindow/TargetScope，新建本次拥有的窗口；绝不导航或关闭原私人页面。
- 专属 Chrome 复用原 ManagedWindow 的 PID/startTime/executable/Profile/CDP 身份核验；已有保留进程时使用同一进程、同一 Profile 的新 target。复用已有 TargetScope，仅控制新 target 与它创建的 popup。旧页面不进入新运行的目标集合。
- 复用后的清理及历史结束动作只关闭对应 owner 的目标，不退出共享进程。首次独占专属进程仍沿原 graceful close 路径落盘。不可证实的目标创建、连接退出或 owner 变化保留 cleanup_required。
- 第一次转共享时，必须先将原进程 owner 的历史租约标记为仅持有已记录 targets，再归档并生成新 owner；不能只给新 owner 加限制，留下历史 end/Browser.close 杀死整个共享 Chrome 的路径。所有 inspect/focus/end/verify_closed/has_lease 均查精确 owner 的当前或归档文件。
- createTarget 前持久化创建中事实，收到 targetId 后先持久化再交给 SDK；取消或崩溃造成回执丢失时不得猜测目标或伪报 cleanup confirmed。无回执的专属进程仍保留核验凭据。
- 旧版本专属租约只明确记录主 target；归档转共享时只能授权这个已知 target，不把其它页面推定为可关闭。新运行复用 TargetScope 记录其 popup。无可证明范围的遗留页面不自动处理。
- 后台模式与已保留的可见专属进程不强行互换：跨可见性请求必须诚实拒绝并保留现场；普通后台无交付运行仍沿现有路径。不能静默把 headless 说成 visible。
- 重启依靠 SQLite 与上述既有租约恢复判断；不依赖内存“已完成”标记。
- 归档前重新核验原 leaseId/ownerId/Profile、日常 endpoint、专属 PID/startTime/executable/CDP 身份与 handoff；只有相同 Profile 的原控制互斥路径可执行。归档使用独占创建、精确内容复核与原子替换，不覆盖已有不同内容。
- 最后一个共享 owner 结束后，其 targets 标为 ended，保留原进程身份凭据作为 Profile 的空闲浏览器事实；下一次可核验并复用。不能删除最后一份凭据留下未知 Chrome，更不能退出可能包含用户新页面的共享进程。进程已退出时必须证实原 PID 不再匹配且 Profile 未被未知进程占用，才回到原新建路径。
- toolbar 操作（停止、继续、恢复连接）拒绝仍在该 toolbar 显示一次短错误并保留同命令重试；历史入口保留反馈 pending/stale/原版本引用，不能借清理代码删除它们。
- 原账号 startup 使用同一 ProductStore 释放判据和服务内部白名单。读取已有账号时也新建维护目标并保留旧交付页；完成后原 maintenance 结束，新正式执行再取得新目标。不能只放行正式 runner 而让 startup 拦住同 Profile。
- 旧 Attached starting 收据缺创建中字段、无已记录目标时保守拒绝；不猜私人标签或假报结束。历史 stale 反馈核验立即 busy，只刷新原 execution 序列，保留原话和选择；未知回执不生成新请求。

## 实现入口与删除边界

`ChainRunDialog.tsx`、`ReplayPacingControl.tsx`：原地收束弹窗。`SavedResultDialog.tsx` 原地改用已有 `ResizableDrawer.tsx`，保留原结果渲染与分页。
`LiveChain.tsx`、`ExecutionActions.tsx`：同一 toolbar 的状态/操作组合。
`WorkbenchContext.tsx`、`ChainBoundaryContext.tsx`、`ExecutionContext.tsx`、`useLiveChain.ts`：迁移反馈、移除 execution 状态面板路径；保留 preparation/history/diagnostics 与结束节点输出。
`ProductStore`、`TaskPlanExecutor`、`TaskRuntimeHost`、upstream 协议：传递可信释放条件与冻结的 browser mode。
`AttachedWindow`、`ManagedWindow`：复用既有 SDK/TargetScope，适配 owner 租约归档与复跑，不重造浏览器驱动。

仅删除本次被替代且已无调用者的组件、分支、imports、样式。不得按“看起来没用”清空用户已有 dirty work、历史证据、检查数据或其它功能。

## Product Alignment

- natural-language task: 重跑已经发布的通用浏览器任务，维护登录并理解当前执行状态。
- reusable chain boundary: 已发布的参数化 TaskPlan/TaskChain 不变，每次新建 execution；人工恢复继续同一 execution。
- runtime inputs: 既有输入合同、本次冻结浏览器、观察间隔。
- dynamic task outputs: 由现有 outputContract/ResultBinding 投影；无新输出模型。
- generic platform capability used: 原运行请求、持久事件、owner 范围内的 CDP target、现有结果组件。
- replay model calls: 普通节点为零，只有原显式 LLM 节点可调用模型。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 运行交互、原窗口保留与同 Profile 独立复跑。
- existing implementation in repository: Radix Themes 3.3.0、re-resizable 6.11.2、browser-use 0.13.8、cdp-use 1.4.5、TargetScope/AttachedWindow/ManagedWindow、TaskChainRuntime/LangGraph、SQLite。
- selected implementation / reused public surface: 保留全部上述实现；Select popper/Slider/Dialog、原结果 Dialog/详情容器、原 SDK Browser 与 CDP Target API；不引入新库。
- B-A-T-owned adapter and remaining gap: 持久 execution 的释放许可映射、租约归档、新 target 范围与紧凑 toolbar。
- license/runtime/platform fit: 沿现有已固定依赖，不新增复制源码；Windows 原生 Chrome 实测。
- browser/runtime/state ownership conflicts: 只对白名单 handoff 释放控制锁；保留页面和进程身份，普通执行仍只有一条浏览器控制链。
- replay model calls: 不新增。
- rejected candidates and evidence: 删除本项目重复状态抽屉/结果入口；其信息已有 toolbar/结束节点，用户明确拒绝。
- focused validation: 下表；不运行根级或全量测试。

## 验收与证据要求

| 门 | 必须证明 |
| --- | --- |
| 请求闭环 | 同命令重试幂等；改变输入后新 requestId；取消拒绝后旧完成态保留；接受后绑定新 execution |
| UI | 删除红色块/ExecutionStrip/状态抽屉；真实深浅、390px、短窗口截图并查看；Radix 菜单高度随条目，不拉满屏 |
| 日常受控 Profile | 连续两次真实执行，新 owner/new target，旧交付页面和登录存储未动；仅清理本次目标 |
| 专属受控 Profile | 同 Profile 两次执行共用原 Chrome 进程，新 target；旧结果页与登录存储保留；结束旧 owner 不影响新 owner |
| 错误/等待 | active controller、人工等待、未知 lease、unconfirmed cleanup、Profile/endpoint 不匹配拒绝；保留首败与重试 |
| 重启 | 独立测试数据库/runner 重建后仍可从完成交付态复跑；原结果和调用审计持久，普通节点 modelCalls=0 |
| 范围 | 仅所属 packages 类型检查与相关现有/必要回归；旧 W01–W09 popup/设置已通过，不重跑 |

私人 Chrome/真实账号不自动授权、不操作。它们的实际复跑另列人工验收；不能用该人工门掩盖可在隔离 Profile 完成的工程门。

本轮证据保存至 `work/run-control-20261004/`；交付报告必须列首败、重试、实际加载步骤及未测范围，不预写通过。
