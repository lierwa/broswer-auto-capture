# 平台账号统一交互与自动复用实施

2026-10-03。用户已确认 `work/account-prototype-20261003/account-management-prototype.html`，授权按原型开发并清理旧无用代码。本文件取代旧开发/重建文档中“双浏览器卡片、手动共享、窗口维护、检查记录、手填平台”的产品交互；固定参考源码、Profile 隔离、所有权、审计、敏感数据和 P0–P4 验收边界继续有效。

## 产品定义与验收

- 展示 13 个固定平台，左侧两列紧凑平台按钮；右侧一个平台、一份账号、一个主要操作。无浏览器选择、任务导航、下次运行设置、共享按钮、窗口清理、检查历史。
- 已登录显示真实可得的账号名称和“打开网站”；未添加显示“添加账号”；明确失效显示“重新登录”；无法确认给出短原因和重试，不能报未登录。无 UID 的有效登录显示“已登录，未取得账号名”，不伪造身份。
- 添加先查找所选平台已授权连接中的现有登录；不能自动批准 Chrome 授权、扫描历史/个人标签、读取全量 Cookie。没有现有登录才打开原受管登录窗口。
- 用户在网站输入密码/验证码。后台有界只读观察确认实际登录后保存；面板没有“我已登录/完成后盖章”。观察不能导航正在填写的登录页面。正常最终检查使用原固定版本来源和真实 TaskChain。
- 一个逻辑平台账号独立于当前任务、浏览器窗口和 UI 生命周期。任务、浏览器绑定与检查是后台证据，不能成为第二套用户维护项。UID 不明时只绑定原会话，不用同名归并两份身份。
- 深浅主题复用原 Radix/主题。正常视口完整展示 13 平台；窄屏同 Dialog 内平台/详情切换；矮屏平台分页。不得隐藏必要内容来制造无滚动。所有异步操作同一渲染周期给 busy/accepted/error。
- 其他网站复用当前页绑定、原生标识选择、已存只读链及不可变版本；不新增 URL/平台名/备注填写表单，不新增模型默认后备。

## 真实能力边界

平台目录 13 行是固定来源检查适配，不等于 13 个本人账号正向线上实测。现有可迁移范围仅 B站、微博、知乎三行；其余十行保留有效登录检查和原会话使用，不能将未验证凭据范围当成“自动同步已实现”。这些事实来自版本化 vendor 数据，不写公共 runtime 网站分支。

用户只维护一份账号。源会话由系统确定：已有逻辑账号优先其绑定源；首次添加依次尝试现有已授权 Chrome 和专属 Profile，优先实际有效登录，不因新鲜的未登录结果抹去另一会话有效登录。两种会话是后台证据，不显示两个状态。

跨浏览器自动复用不提供用户同步开关。源/目标/Profile/UID 和凭据范围冻结，复用现有 prepare/write/check/rollback。目标已是同一 UID 时完全跳过写入；只有目标明确未登录且目标是 B-A-T 自有专属 Profile 时可自动写入。未知、另一 UID、共享 SSO 风险或未核验范围不覆盖。个人 Chrome 默认只读：配对、添加账号及测试授权都不是 Cookie 写入授权；当前版本不自动写个人 Chrome，未来必须另有持久化的平台/Profile/范围写入授权。需要额外网站验证或无法迁移时，仅在实际操作失败处解释限制，不假报打通。

任务已有冻结浏览器选择不能暗中改成另一种浏览器。启动准备/复跑前按已冻结环境复用可用会话；同 Profile 已有效无需复制，不同 Profile 在安全范围内自动迁移并独立核验。不可迁移且请求环境没有有效登录时真实记录该项限制，不清除授权或重生业务任务验证。

## 领域与接线

Product Alignment:
- natural-language task: 长期维护主流平台登录，供查询资料、后台操作等不同任务使用；用户不分别维护浏览器登录。
- reusable chain boundary: 参数化只读身份检查和有界登录确认；源会话到目标会话的范围内认证复用。
- runtime inputs: 逻辑账号、冻结 Profile/source binding、版本化平台/方法、原 owner/lease、任务已冻结浏览器/允许来源。
- dynamic task outputs: 本次真实登录/身份/未知原因、登录等待/账号变更、自动复用及独立目标验证、资源清理事实。
- generic platform capability used: 原 browser session/Playwright/CDP、TaskChainRuntime/LangGraph、ProductStore/SQLite、Windows DPAPI、Radix。
- replay model calls: 0；未增加 AI 生成、探索或判断。
- site/task-specific code added: no；认证键、身份接口与来源判据保留在版本化 vendor 数据。

Reuse Assessment:
- capability: 平台级账号投影、非侵入登录确认、后台自动复用、紧凑交互。
- existing implementation in repository: AccountRepository/Identities/Windows/Transfers、PlatformChecks、account_sources/account_auth/account_secrets、原 owner/lease、TaskChain/LangGraph、Radix。
- mature candidates and pinned versions: MediaCrawler 380b426000aac3d612837ed72c99808347dc94c9；social-auto-upload 0012d2c355f88f683cc38dde2a2db209e14091bc；版本/许可延续重建文档与 vendor 回执。
- selected implementation: 保留已核验底层适配，新增逻辑账号与自动复用胶水；按确认原型组合现有组件。
- reused public surface: 原 pong/cookie_auth/原 locator/BrowserContext Cookie、TaskChainRuntime.execute、原窗口核验/结束、原 DPAPI、Radix Dialog/Button/DropdownMenu/Avatar/TextField。
- B-A-T-owned adapter and remaining gap: 逻辑账号与版本/运行证据、源选择、操作事实、启动前准备、非侵入观察入口、UI 组合。
- license/runtime/platform fit: 沿原固定 Python/Windows/许可；不替换 driver/UI/调度库。
- browser/runtime/state ownership conflicts: 不并发抢运行器、不导航任务或个人标签、不抹未知租约；凭据写入保留原 guard/回滚，登录观察不执行 goto。
- replay model calls: 0。
- rejected candidates and evidence: 新同步服务、Cookie 存在即已登录、隐式切浏览器、旧双卡片和手动窗口清理均不满足用户要求或所有权。
- focused validation: 所属合同/服务最小回归；真实 Windows 两 Profile 自动复用、非侵入登录确认、失败/重启/SQLite；真实 UI 深浅/窄/矮屏；旧 W01–W09 审计，不重跑已过 popup/settings。

实现拆分：

1. 平台级逻辑账号/精简投影与命令，在原 `browserAccountFacts` 持久化；保留旧事实读取用于审计和兼容，不迁移或删除用户历史数据。
2. 原窗口恢复修正：原 owner/lease 的 confirmed inactive 表示可关闭该维护事实并重新取得自己窗口；连接错误不是已关闭证明。旧 task handoff 只用原只读核验，失败保留，不强制清理。
3. 有界等待使用原 TaskChain/LangGraph 控制流。登录观察只读原页面/允许接口；最终确认、取消、超时、服务重启分别持久化。关闭弹窗不等于取消/删除账号。
4. 自动复用调用已验证 transfer，后台完成；源和目标不同 UID 不覆盖，未知不降为退出。成功后仅清理本次可证明拥有的资源；任务启动前自动释放可安全释放的账号窗口，不要求用户点击“结束窗口”。
5. 接入实际准备/试跑/正式运行路径，账号列表读取与浏览器资源占用分离。禁止仅给 UI 一份聚合状态而运行仍不使用。
6. 交互替换及清理：删除 SessionCard、手动共享页、旧窗口控制/历史展示、旧 accountClient 中仅服务旧交互的帮助逻辑与废弃样式。自定义链/标识、迁移核心、历史读取等仍需要的能力不因清理而删除。

## 身份、操作与后台规则

逻辑账号具有稳定 id、platformId、revision、sourceIdentityId、sourceBinding、nullable identityKey、displayIdentity、最新检查引用和 deletedAt。普通刷新/重新登录只验证该版本已绑定的 UID；不同 UID 记为 account_changed，不自动覆盖。首次添加两端均有效但 UID 不同时按已授权日常 Chrome 优先，选定后固定源。没有 UID 时可确认会话有效，但只绑定原 Profile，不凭名称合并或迁移。

只有明确“切换账号”意图允许在用户于网站完成切换且实际检查成功后创建新 revision；取消/失败保持旧版本。移除仅生成 tombstone，不退出网站、不删除历史。GET、重启和旧检查不能复活 tombstone；再次明确添加才能重新发现登录。历史绿色结果不能成为当前账号绿色状态：当前 revision、绑定、方法/平台版本及检查新鲜度必须全部匹配。

每次操作持久化 requestId、intent、platformId、logicalRevision、sourceIdentityId/sourceBinding、ownerId/leaseId、开始/截止时间、检查运行引用、状态与短原因。平台切换只改变 UI 投影，不改变正在运行的绑定；面板关闭只取消订阅。取消、超时或重启中断停止观察，保留旧账号及未知租约，不重新打开或导航；结束后的迟到回调不得保存账号。

等待链由原 TaskChain/LangGraph loop/branch/capability/terminal 实现：人工登录操作总预算 300 秒、最多 100 次观察、观察间隔 3 秒、单次只读检查 8 秒、最终确认 20 秒；预算先到则停止观察并保留原登录窗口。单次网络观察超时只记未知并继续等待。间隔是普通等待 capability，不新建 while/setInterval 调度器。取消、失败和超时不调用窗口结束；用户完成登录后使用原主操作重试。

观察与最终检查是两种版本化入口。observe 禁止 goto、click、input、focus、创建全局 Context 及捕获其他页面；只使用原 owned page 的只读 locator 或范围内的只读当前用户 API。被禁用的来源 goto 必须记 navigation_suppressed，不能当已导航或登录证明。最终确认也不能导航用户输入页面：已核验的只读 API/当前页正向判据可直接独立复查；需要来源导航的 normal check 必须使用另一个本次可证明拥有的检查页，完成后只关闭该页。至少 MediaCrawler 与 social-auto-upload 各一条真实 Windows 观察证明 URL、输入内容和焦点不变，观察/最终检查均保留 TaskRun 且 modelCalls=0。

自动复用 admission 冻结逻辑账号 revision、源/目标绑定、授权 epoch、平台/范围版本和本次新鲜检查。无 UID、目标未知/另一 UID、范围不支持、个人 Chrome 目标均不得写；同 UID 写入次数必须为零。写入前再次核验冻结事实；原 prepare/write/check/rollback 保留全部 HMAC、DPAPI 和每次变更 guard。后台复制仅日常源→自有专属目标的三平台已验证范围，其余十平台用原绑定会话；与任务已冻结环境冲突时给出具体不可用原因，不能暗改浏览器或伪报同步。

真实启动接线覆盖 preparation/authoring、draft sample/trial、formal run 与 resume 的原入口，在 PythonUpstreamBrowserRuntime 启动浏览器前处理已添加账号与 allowedOrigins 的交集。无账号/公开页面正常通过，不能强制所有网站先登录，也不能遍历全部 13 平台。内部 startup context 必须由已持久化、实际 active 的 job/execution 验证 owner 与 frozen browser；只排除当前启动自身的 busy/pending handoff，其他实际 owner 仍阻塞。account purpose 由服务内部设置、HTTP 不接受，避免检查递归。恢复已有 runner 不重新占用/改动其页面；临时账号控制先结束，再交给原 runner。不得追加语义 judge、重建业务任务或改变模型配置。

原窗口处理表：

| 原事实 | 后台动作 | 禁止 |
|---|---|---|
| 本账号维护窗口 confirmed inactive | 保存 closed；按原门取得新 owned 窗口 | 把连接失败当关闭 |
| 本账号维护窗口 confirmed active | 复用同平台；观察不导航；启动前原安全 end | 导航正在填写页面 |
| refused/unconfirmed/Profile changed | 保留 owner/lease，返回短错误供重试 | 自动关闭、抹租约 |
| 原 task handoff | 仅原 execution/sequence 的只读 inspect 核验 | 自动 end、改业务结果 |
| 已删除平台仍有 owner | 保留事实，按原所有权核验 | 因 tombstone 丢失 owner |
| 清理未确认 | typed cleanup_required | 改成链路失败或成功清理 |

## 原型按钮到真实命令

| 按钮 | 服务意图与完成条件 | 失败/取消 |
|---|---|---|
| 添加账号 | add；发现现有有效源或打开自有登录页并观察，真实证明后建 rev1 | 不建假账号，短原因+重试 |
| 打开网站 | open；始终在账号 canonical source 创建/复用本次 owned 页面 | 保留账号，错误仅该平台 |
| 刷新/重新检查 | check；核验当前 revision 与 UID | unknown/account_changed 不覆盖 |
| 重新登录 | relogin；保留原 UID，网站完成后观察 | 不同 UID 提示改用切换；取消保留旧账号 |
| 切换账号 | switch；明确切换意图，用户网站操作后实际证明新 UID | 失败/取消不改旧 revision |
| 移除/确认/取消 | remove 只写 tombstone；取消仅回到详情 | 不退出网站、不关闭个人页 |
| 等待取消 | cancel 精确 requestId，停止该操作并安全释放本次资源 | 未确认 owner 保留 |
| 提示后的原操作 | 未添加→添加账号、失效→重新登录、未知→重新检查；已登录保留打开与唯一刷新入口 | 提示不附加重试，更多菜单不重复刷新；不重生业务任务 |
| 搜索/分页/窄屏返回 | 本地目录投影；不发账号变更命令 | 不取消后台操作 |
| 其他网站/读取当前页 | bind_current；验证所选 owned 窗口 owner 和真实 site，不扫描个人页 | 不拿最后一次检查页伪称当前网站 |
| 选择登录标识 | pick；复用原 overlay/不可变只读链，实际网页标识 | 取消不发布新 binding |

产品不得带入原型模拟成功、示例登录标识或演示姓名。每个产品按钮必须实际点击验证 accepted/busy/result/error；长名字、错误、等待、确认、深浅/窄/矮屏均无整窗滚动。清理列出引用和保留/删除原因，不把仍需要的能力改名复制一份。

## 阶段与最小验证

U0 文档对抗审查修正；U1 逻辑账号/源选择/旧窗口核验与持久化；U2 非侵入登录确认/自动复用/运行接线；U3 确认原型的真实 UI 与旧代码清理；U4 受影响检查/真实 Windows/独立代码对抗审查与修订；U5 更新 PROGRESS/RESEARCH/ROADMAP 和原指定交付文档。

真实验收必须分别证明：既有登录无需第二次手动检查、未登录→用户登录→后台保存、目标另一 UID 拒绝、未知不覆盖、非迁移平台不给假成功、源 Profile 变更不串账号、取消/重启持久化、任务启动接线零隐式模型、无弹窗滚动和废入口。受控测试使用自己 Profile/测试站点，私人正向登录/验证码/授权单列未测，不能扩大成整个项目阻塞。

验收记录分三层：13 平台逐行固定来源兼容与三态检查；三平台真实受控自有目标范围写入/核验、同 UID/different UID/unknown/private 的零写入 guard；真实私人网站正向 UID/昵称与线上 SSO 未测项。十平台明确不复制，其原 Profile 可用与冻结其他 Profile 限制分别记录。SQLite/重启检查 tombstone、revision、operation、TaskRun、租约与实际 Profile，不以目录行数或内存 UI 代替。

第一失败/重试留在 `work/account-unified-20261003/`；继承 `work/account-rebuild-20261003/` 与 `work/account-live-repair-20261003/` 既有证据，不重复旧已通过验证。实际服务重载前检查空闲状态、精确 PID/root 与当前原租约，只停止本 checkout dev 服务，不停止协调器/个人 Chrome/相邻项目。

开发模型以实际 session 元数据为准。现有证据 session 01a0ffdb-9aad-7d93-b246-c4644cb948f8 为 gpt-6.1-sol/xhigh，不能称为 Astra；不修改产品模型配置。留在当前 master，保留 dirty work，不提交、不推送、不建 worktree。

## 用户现场回归后的最小修正

2026-10-03 用户指出：正常知乎登录跳转后窗口数秒关闭；原发布任务被无关 Profile 的旧窗口拦住；错误显示两处；其他网站仍选中 B站；账号提示/主按钮/刷新/菜单重复同一检查。

Product Alignment / Reuse Assessment 沿上文。移除自写 `navigateAccount` 精确首页后置条件；人工打开直接借用原 owner 页面调用 Playwright `page.goto`，只保留原来源/所有权边界。MediaCrawler/SAU 的原函数及平台策略不因此更改，不造新的检查规则。失败现场与原检查运行均持久化，成功真实证明后才清理自己的窗口。

复跑及恢复使用冻结 browser 的实际 Profile 分类；旧 `headless` 合同沿原语义。不同 Profile 的历史 handoff 不冲突，同 Profile 和实际活动 controller 仍互斥；缺失 Profile 事实保守拒绝，不自动关闭个人标签。运行确认复用原 Radix/Dialog/Button/Slider，只在当前弹窗显示错误。

账号详情：已登录显示打开网站和唯一刷新；未知仅主按钮重新检查；失效仅主按钮重新登录；提示只显示原因，更多菜单只切换/移除。无提示时不渲染空反馈区域。首败和最小 Windows/真实 UI 重试见 `work/account-user-regressions-20261003/`，此前通过不能覆盖用户新发现的回归。
