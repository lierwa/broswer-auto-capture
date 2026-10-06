# 并行浏览器运行、任务选择与资源退出最小实现

日期：2026-10-05。适用于当前实际 checkout；保留已有 UI、账号管理及其他未提交工作。

## 用户要求与验收边界

- 不同任务能够同时准备或运行；每个运行只控制自己的浏览器会话及页面。
- 任务默认动态跟随全局浏览器模式；用户可以保存任务覆盖值，也可以恢复跟随全局。
- 准备前显示有效浏览器模式，允许更换；开始后冻结本次选择。
- 完成、取消、失败、手动关窗、浏览器退出、服务重启或关机后，不让已经失效的占用阻塞其他任务。
- 清理由系统在退出和恢复时自动处理。旧结果及审计保留；旧任务不成为新任务的业务前置步骤。
- 最小改造；不更换浏览器 SDK、LangGraph 或 UI 框架，不建立第二套调度或检查点数据库，不跑根级/全量测试。

## Product Alignment

- natural-language task: 任意浏览器任务可并行准备和复跑，各自选择运行环境。
- reusable chain boundary: 沿用不可变 TaskChain、TaskPlan 与现有步骤编排。
- runtime inputs: 原业务输入及启动时解析的浏览器模式。
- dynamic task outputs: 原运行输出、独立运行事件、资源退出事实。
- generic platform capability used: 原浏览器 SDK、Chrome 扩展传输、owner/lease、执行记录和配置存储。
- replay model calls: 普通复跑仅显式 llm 节点调用模型；资源管理不调用模型。
- site/task-specific code added: no

## Reuse Assessment

- capability: 并行浏览器控制、作用域隔离、配置继承及退出核验。
- existing implementation in repository: TaskPlanExecutor/TaskChainRuntime，PythonUpstreamBrowserRuntime，RunnerProcess，AttachedWindow/ManagedWindow，TargetScope，window_lease_archive，browserSettings，BrowserEnvironmentSelect。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、已受管 Playwright Chrome 扩展 v2、现有 LangGraph StateGraph；均以当前仓库源码和锁定版本为准。
- selected implementation: 保留上述实现，在已有适配层去除全局单客户端/单执行限制。
- reused public surface: Browser/CDPClient、Chrome tabs/debugger 原协议、现有执行器与关闭核验接口。
- B-A-T-owned adapter and remaining gap: 将独立运行映射为独立控制会话、owner 收据及私有专属 Profile；在现有 relay 内分派多个 CDP 客户端；按本任务执行事实准入和恢复。
- license/runtime/platform fit: 现有依赖和 Microsoft Apache-2.0 扩展源码，保持 Windows 原 launcher 和 SDK。
- browser/runtime/state ownership conflicts: 同一任务只允许一个活跃操作；不同任务可并行。日常 Chrome 只控制任务创建的目标；专属实例使用隔离 Profile，禁止复制个人 Profile。
- replay model calls: 不增加模型调用。
- rejected candidates and evidence: 无需新库；当前全局队列、TaskConnection 单父连接、relay 单 CDP 客户端和单租约路径是阻塞点，不能用 UI 放开按钮代替底层隔离。
- focused validation: 定点配置/并行/退出测试，受控浏览器样本；所有首次失败与未测项记录到本文件和 PROGRESS。

## 实现规则

### 浏览器模式

复用 browserSettings：local 保存全局值，task:<taskId> 保存可选覆盖值。不存在任务覆盖行表示跟随全局；清除覆盖删除该行。task-browser-revision:<taskId> 仅保留递增版本，防止清除后的旧请求覆盖新选择；删除任务时一并清除。有效值为 taskOverride ?? globalMode。保存任务选择不改变需求版本或链路摘要。准备、试跑和正式运行保存有效模式快照，恢复使用原快照。

### 并行与连接

沿用现有执行器，每个独立运行启动原生 runner；取消只作用于对应 controller。不同任务不等待其他任务的清理记录。相同任务的重复启动仍受已有运行身份和忙状态保护。日常 Chrome 允许多个 CDP 客户端，但客户端只取得自己操作创建/明确恢复的目标，关闭一个客户端不能断开其他客户端或关闭用户 Chrome。专属运行使用 owner 对应的独立 Profile，维护 Profile 仍由现有账号管理负责。

只串行短暂的账号目录准备，不串行任务执行。专属 Profile 的初始登录只从原目录已确认账号、已验证平台范围读取，在内存中转为 SDK storage_state，并沿原 LoadStorageStateEvent 一次导入新的私有 Profile；禁止复制个人 Profile，禁止恢复时覆盖原现场。分区凭据或未知自定义范围保持拒绝/人工登录边界，不自造扩展范围。日常 Chrome 使用其原登录状态，各任务共享该 Profile 的站点登录，但控制目标独立。

### 租约与退出

新操作使用 owner 独立收据；不以一个公共 JSON 文件独占整个浏览器。历史公共收据继续可读并按原 owner 归档。

正常 finally 自动退出本次页面、能力与 runner；按需交付页面只是页面交付，不保留控制占用。关闭/断开令本次控制器退出，已有结果保留。服务启动核验旧运行资源；确认原控制器/专属浏览器已消失后结束旧占用，不改原业务结论。无法证明归属的资源只影响该原运行，不锁住无关任务的新独立会话。

服务启动及每 15 秒沿原 owner 核验非活跃现场，跳过正在处理的 execution；历史核验失败不停止其它 owner 的核验。核验不启动已关闭的日常 Chrome。附着窗口以原目标消失、OS 无 Chrome 进程或收据早于本次 OS 启动时间确认失效；仅扩展断连仍保持未知，不能伪造关窗事实。SDK 断连禁止自动换页重连，继续必须走原恢复协议。

### 最小 UI 接入

复用现有模式标签和 Radix Select/Dialog。在准备入口显示“跟随全局（实际模式）”或任务覆盖，允许更换；试跑、正式运行读取同一任务设置。所有重新准备入口也经过该确认。移除“另一任务处理中”造成的无关任务禁用。预执行阶段改称“浏览器试做”，避免连接失败被误称为节点生成失败。

## 执行顺序

1. 任务设置与准备/运行快照；UI 只增加必要入口。
2. 独立 runner、收据、Profile 与 relay 多客户端；去除不同任务全局串行限制。
3. 退出和启动恢复按 owner 收敛；保留历史证据。
4. 一组定点测试与受控并行关闭样本；受影响 package 类型检查各一次。

## 验收矩阵

| 场景 | 必须成立 |
| --- | --- |
| 两任务同时运行 | 两个 controller 同时实际执行，运行输出与事件不串线 |
| 关闭/取消其中一个 | 只终止对应 owner，另一运行可继续 |
| 正常自动退出 | 本次 lease/control 已结束，下一运行无需用户清理 |
| 手动关闭浏览器或任务窗口 | 本次操作结束或明确中断，旧记录不阻塞其他任务 |
| 服务重启/进程已消失 | 原业务记录保留，原控制占用经核验失效 |
| 全局/任务设置 | 默认继承、独立覆盖、清除覆盖、持久化和启动冻结 |

## 开发记录

- 初始证据：新任务在 AttachedWindow._reserve 失败，hybrid_attached_window_busy；旧成功任务的 handoff 收据仍存在。此前只分析，尚未执行新验证。
- 实现完成：任务浏览器 GET/PUT、覆盖版本、准备/试跑/正式运行快照；独立执行 controller/runner、专属 Profile 与日常 Chrome owner endpoint；各 owner 收据；启动及定期核验；准备确认和任务选择 UI。无新运行框架/SDK、无业务网站 special case。

## 最小验证与首次失败

| 证据 | 结果 |
| --- | --- |
| Contracts / API / Workbench package check | 通过；API 新增测试的 ws 类型错误修正后通过 |
| parallel-browser.test.ts | 3/3：配置继承/覆盖/清除/重启持久化与冻结；真实两个执行器同时进入、单独取消及历史交付后的第三任务启动；CDP scope 隔离 |
| parallel-relay.test.ts | 实际 WS/原 BrowserModel 双客户端、相同请求 ID 的响应和目标隔离、一个退出后另一个继续通过；新增冷启动复用一次连接、授权修改仍互斥的定点验证 1/1 |
| browser-environment.test.ts | 8/8，通过现有三模式与 HTTP 偏好边界 |
| daily-chrome-relay-compat.test.ts | 13/15；两项原有 POSIX 0600 断言在 Windows 返回 0666（438 !== 384），其余通过；没有将其算成权限泄露或并行功能通过 |
| account-shared-login.test.ts | 首次 7/8；新私有 Profile 需额外一次认证范围读取，原“只能调用一次”断言更新为检查+受限读取，同 UID 定点复验 1/1；没有增加身份检查或自动写入 |
| Python owner 收据/关窗/前次 OS 启动 | 2/2，通过 |
| Python SDK 断连禁止重连、独立 operation 关闭 | 2/2，通过 |
| parallel-browser-native.acceptance.ts | 原生 Chrome 双会话同时已连接、独立 PID/Profile、第一项退出后第二项继续执行、两项自动关闭，0 模型调用，通过 |
| execution-storage-native.acceptance.ts | SDK 原事件导入合成 Cookie/localStorage，普通链路执行与退出，0 模型调用，通过 |

首次命令错误：npm exec --workspace 令测试的 process.cwd() 成为 apps/api，夹具找不到仓库 skill/vendor；改为在实际 checkout 根目录指定 API 测试文件，没有重跑全量测试。

首次夹具缺口：双任务复用同一不可变合同 ID；夹具改为每次创建独立 requirement/plan/chain ID。合成交付回执缺少 targetDigest 也由夹具修正。

真实专属无头首败：原 --no-startup-window 配合 newWindow=false 导致 Chrome 无逻辑窗口、创建目标失败；沿原 Target.createTarget 使用 newWindow=true，可见性仍由 headless launcher 控制，修正后原生并行样本通过。

登录复用首败：原 TargetScope 禁止所有存储同步，导致独立 Profile 未导入 seed；限定只向新的自有 Profile、聚焦后沿 SDK 原事件导入一次。首次事件等待遗漏 raise_if_none=false（原 handler 返回 void），定点修正后 Cookie 与 localStorage 样本通过。没有自研 Cookie 写入器或账号 vault。

未测：原京东任务完整首次探索/编译/发布、真实网站账号、真实个人 Chrome 多任务整链路、UI 浏览器点击和物理关机。实际启动/关窗/OS boot 证据分别列出，不把受控样本当成这些场景已通过。

未执行：全量或根级测试、提交、推送、用户服务重启、用户浏览器控制。运行中的旧 API 需要正常重启后加载本次后端变更。
