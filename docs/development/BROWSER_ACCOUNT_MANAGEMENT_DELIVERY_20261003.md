# 浏览器账号管理交付（2026-10-03，用户现场回归修订）

2026-10-04 最后主链路补证：本人已授权的日常Chrome扩展实际自动连接，原京东发布V1连续两次真实完成9c6f6482、9dfa0c86，cleanupconfirmed/0模型调用/各2输出，中间无结束窗口操作，持久化与重新打开工作台通过。完成交付旧relay地址误判及旧收据默认字段归档兼容已作最小修复，8项窄门与对抗复审通过。其它私人平台/SSO仍未测；下方“原京东未自动运行”是此前历史，当前以[运行交付](RUN_CONTROL_DELIVERY_20261004.md)与actual-main-persistence.json为准。本次无需重新加载或授权扩展。

2026-10-04 加载补证：用户明确授权后 Workbench/API 已重启至 PID28908；同 Profile 原完成交付锁已解除，新服务账号 availability 无阻塞。原任务/模型/发布/租约未改，私人业务未自动运行。下面“旧 PID29632、重载拒绝”是首次失败记录，已由 [当前交付](RUN_CONTROL_DELIVERY_20261004.md) 中的正式加载门解决。

2026-10-04 更正：下方“复跑资源误挡已完成”只覆盖不同 Profile，未解决同 Profile 已完成交付仍占锁及账号 startup 独立阻塞。本轮已沿原 owner/TargetScope 补通，两种隔离 Profile 的已保存账号启动/连续四次正式运行/重启/HttpOnly 通过。账号 UI 与平台判据不重做。前端 HMR 已加载本轮，正式 API 后台重载被自动审批拒绝，仍为旧 PID29632；因此本轮没有正式加载成功结论。当前交付及人工/加载门以 [RUN_CONTROL_DELIVERY_20261004.md](RUN_CONTROL_DELIVERY_20261004.md) 为准，下面保留原批次历史证据。

入口：浏览器设置 → 管理账号。保留 13 平台，用户只维护一份平台账号。已登录：打开网站、唯一刷新、更多操作；未知：主按钮重新检查；明确失效：主按钮重新登录。提示仅显示原因，不另加重试；无提示不保留空白反馈区。其他网站不会高亮 B站，不填写网址/平台名/备注。旧双浏览器卡片、手动同步、任务/维护窗口说明和检查历史均退出界面。

工程与最小验证完成，私人账号正向验收未完成。当前真实服务 PID 29632，工作台 4173、API 4175；新代码已加载。原任务、发布版本、7 次 execution、4 个 authoring job、3 次 turn、模型设置和原租约摘要重载前后不变。未重新生成或自动复跑用户私人业务。完整证据索引：`work/account-unified-20261003/delivery-evidence.json`。

## 实际阶段与入口

| 阶段 | 完成内容 | 实现入口 |
|---|---|---|
| P0 | 持久 Profile 身份、授权/owner/lease 隔离、未知不当已关闭 | `account-identity.ts`、`account-availability.ts`、原 ManagedWindow/AttachedWindow |
| P1 | 两种浏览器的后台目录证据，投影为一个固定源/UID/revision 的逻辑账号 | `account-directory.ts`、`account-repository.ts`、`contracts/account-directory.ts` |
| P2 | 同一 Radix Dialog 平台/详情/自定义切换，精简按钮，深浅/窄/矮屏 | `BrowserAccountView.tsx`、`AccountCustomView.tsx`、`browser-account.css` |
| P3 | 登录窗口归原 owner；非侵入等待；真实检查、独立 TaskRun、不可变方法；取消/失败保留窗口 | `account-windows.ts`、`account_session.py`、`platform-check.ts`、`account-wait-chain.ts` |
| P4 | 原 startup 接线、受控自动复用/DPAPI/回滚/SQLite 重开，Windows 门和 W01–W09 审计 | `account-reuse.ts`、`python-runtime.ts`、`runtime-host.ts`、`app.ts` |
| U0–U5 | 文档对抗修订 → 原型实施/清理 → 代码对抗修订 → 现场回归修订 → 最小验证/真实加载/交付 | `BROWSER_ACCOUNT_UNIFIED_20261003.md`、本交付及证据索引 |

当前依据为统一开发文档；旧开发文档的 Profile、安全与 P0–P4 验收边界继续生效，旧双卡片/手动共享交互被用户后续决定覆盖。旧交付完整备份于 `work/account-unified-20261003/previous-delivery.md`，原历史记录未删除。

## 用户指出的故障与修正

1. 知乎几秒关闭：真实旧诊断为 `ordinary_postcondition_failed_url_fact_mismatch`；发生在原检查器之前。删除自写 `navigateAccount` 精确首页条件，直接通过原 owner 页面使用 Playwright `page.goto`，接受允许来源中的正常 signin 跳转。未改 MC/SAU 原检查判据。
2. 扫码等待：人工操作预算 5 分钟；单次网络观察 8 秒超时只记未知，由原 LangGraph 继续。取消、失败、总等待结束只停止观察，不结束网站窗口。独立真实登录确认后才保存，不把点击或页面打开当已登录。
3. 复跑资源误挡：run/trial/resume 按冻结 Profile 分类，同 Profile 与实际活动 controller 仍互斥；无关旧 daily handoff 不挡 dedicated。旧 `headless` 合同沿原转换语义，完全缺事实保守拒绝。原个人标签/未知租约不自动关闭或抹除。
4. 运行弹窗：复用 Radix Dialog/Button/Slider，精简运行设置，错误仅当前弹窗一处；取消保留业务输入，重试复用原请求。缩窄屏幕后桌面侧栏不再变成第二个模态窗口覆盖运行弹窗。
5. 其他网站：左侧选择和右侧内容一致，紧凑原组件组合；原 native Overlay 或已有只读链绑定、实际三态复跑、SQLite/revision/tombstone 均验证。
6. 账号重复检查：删除反馈中的重试、菜单中的重新检查、未知/失效状态的刷新按钮及空反馈容器。明确未登录显示需登录/重新登录，未知不能假报退出或继续沿历史绿色。

## 复用与真实支持边界

MediaCrawler 固定 `380b426000aac3d612837ed72c99808347dc94c9`，social-auto-upload 固定 `0012d2c355f88f683cc38dde2a2db209e14091bc`；ZIP、源码摘要、原函数与许可证保留在 `vendor/account-checks`。通过原源码函数适配，未复制爬虫/上传产品、浏览器驱动、Agent loop 或调度器。自有代码负责 Profile/原 owner 绑定、版本化检查结果、逻辑账号、范围 guard、生命周期和 UI 组合。检查/等待用 TaskChain/LangGraph，复跑没有隐式模型。

固定目录：哔哩哔哩、小红书、微博、知乎、抖音、快手、百度贴吧、微信视频号、百家号、支付宝生活号、虎扑、TikTok、YouTube。13 行固定函数兼容矩阵共 78 个样本已通过：正向、明确负向、挑战、503、超时与结构变化。该证据不是 13 个私人真实账号线上成功。

自动跨 Profile 复用目前仅 B站/微博/知乎三条已核验范围，方向为已授权日常源 → B-A-T 自有专属目标；后台执行，无用户同步开关。相同 UID 零写入；目标不同 UID/未知、无 UID、授权/版本变化、私人 Chrome 目标均不写。其余十平台保留原源会话，不声称已跨浏览器打通。Cookie 是认证信号；有效登录/UID 由原只读页面或当前用户响应确认，Cookie 存在不等于登录成功。小红书等来源拿不到 UID 时明确源绑定，不伪造姓名或身份。

完整 Product Alignment / Reuse Assessment 在统一开发文档；原许可、Windows/语言/运行时、认证范围与敏感数据边界沿 vendor 回执。使用原 Browser-Use/Playwright/CDP、SQLite、Windows DPAPI 和 Radix，未改产品模型配置。

## 逐项验收与证据

下表前缀 U=`work/account-unified-20261003/`，R=`work/account-user-regressions-20261003/`。

| 门 | 结果与实际范围 | 证据 |
|---|---|---|
| 文档对抗 | 首轮问题保留，修订批准后开发 | U `document-review.md`、`document-review-retry-1.md` |
| 代码对抗 | 旧轮批准；现场回归新轮发现两项 P1，修复后限定范围批准，无剩余可复现 P0/P1 | U `code-review.md`；R `code-review-first.md` |
| Profile/UID/取消/版本/启动 guard | 当前 15/15，包含保留登录窗口、8 秒网络观察超时后继续、旧 lease 分类、实际 resume 入口、global controller 拒绝、0 模型 | R `scoped-retry-2.log` |
| 清理兼容 | 原核心/历史读取保留，旧变更 HTTP 410；清理后 19/19、连接幂等最小门通过 | U `cleanup-scoped-first.log`；R `connection-first.log` |
| 固定来源 | 原函数 13 行 78 样本兼容通过；MC/SAU 两条 Windows 观察不改 URL/输入/焦点 | U `source-compatibility.json`、`observe-windows.json` |
| 三平台后台复用 | 原 native owner/扩展/CDP，克隆平台数据/自有服务端登录；每条范围写一次，同 UID 零写；startup/SQLite 重开 | U `native-login-reuse/result.json` |
| 当前知乎回归 | 克隆版本化知乎、自有真实 Chrome；signin 跳转，等待 35 秒未关闭/未保存，再真实表单登录→自动保存→范围复用→formal startup→重开 | R `native-zhihu/result.json` |
| 真实公开知乎 | 原线上知乎、隔离 Windows Profile；35 秒仍等待，取消后窗口保留，无假账号；未本人登录 | R `public-zhihu/result.json` |
| 当前自定义网站 | 真实 UI/native Overlay/原只读链、正负未知/结构变化、敏感内容脱敏与 SQLite 重开 | R `native-custom/result.json` |
| 当前账号 UI | 深浅/390×844/390×480/1024×480；选择、登录等待/取消、未知/失效单一入口、移除、自定义、搜索/分页，无弹窗内部/水平滚动 | R `ui-validation.json`、`ui-*.png` |
| 当前运行 UI | 深浅/窄/矮截图实际查看，错误一处、布局不被侧栏覆盖；POST 被测试截获，未运行私人业务 | R `run-dialog.json`、`run-{dark,light,narrow,short}.png` |
| 类型/构建/固定 runtime | API tsc、Workbench 类型/构建、source check 通过；仅所属范围。原大 chunk 提示保留 | R `api-final-3.log`、`workbench-final-2.log`、`source-final.log` |
| 真实服务/持久化 | PID 27904→29632、目录 200/13、无运行中账号；任务/发布/模型/租约摘要一致 | R `live-reload.json`、`live-{before,after}.json` |
| W01–W09 | 6 份既有证据存在且 SHA256 相同；旧 popup/设置不重跑，私人门仍人工 | U `windows-audit.json` |

最新克隆知乎 gate 只运行知乎一行；其 JSON 中两条继承文字仍写 three，属于脚本文字残留。实际 `platforms` 数组、写入计数、SQLite 门均为一行，交付仅按一行结算；此前三平台通过在 U 的独立证据。没有用此次一行结果冒充重新验证三行。

## 第一失败与重试

- 旧 4/15 UUID 主键碰撞、startup fixture 作用域、原 native chain/taskId 不一致、强结束导致 Cookie 未持久等首败在 U 保留。原窗口 graceful end 后原三平台 retry-3 通过。
- 用户实际失败 R `live-first-failure.json`：B站一次完成；知乎多次 7–12 秒失败且没有平台检查运行，原源码诊断为精确 URL 后置条件。未把真实失败归成用户未及时扫码。
- R `scoped-first.log`：测试写错 deadlineAt；`api-final.log` 实际失败，名称不是成功证据。`scoped-retry-1.log`：resume 测试缺原 plan。补正确已有夹具后 retry-2 15/15，当前 API 最后检查通过。
- R `run-ui-first.log`：真实缩窄截图发现侧栏第二 Dialog 覆盖，取消按钮不可点击；修正后 retry-1/final 通过，最终浅色截图等待真实动画完成再查看。
- 所有第一失败和成功重试保留；旧通过门不因新失败而改写，新失败也不因旧通过而消失。

## 清理

删除十个旧双卡片/手动共享验收或 UI 文件、旧 public dispatcher、AI producer/classifier、无用 navigateAccount 精确条件及关闭浏览器后重试 UI 胶水。去重后的菜单/反馈样式和 intent 状态同步移除。没有删除仍被产品使用的迁移/rollback/只读检查/历史事实/原 owner 能力，也没有用新实现替代成熟驱动或调度器。

逐文件存在性、备份、保留原因和最小回归见 U `cleanup-manifest.json`。全部已有 dirty work 保留；master/HEAD `0fc8ff22a4e4a3f0a8303a4991a180009df3d180`；无 worktree/分支/提交/推送、相邻修改、node_modules 扫描、协调器操作或关机。

## 加载步骤与未测项

当前服务已经加载。之后在实际 checkout 根执行 `npm run dev`，固定 runtime 检查用 `node scripts/setup-upstream-browser-runner.mjs --check`，Workbench 构建用所属 workspace 命令。端口已有本 checkout 服务时先核验 PID/root/空闲与原持久化事实，再用原开发停止入口重载；不停止不明进程或协调器。

扩展产物 `work/daily-chrome-extension/extension` 已存在。私人 Chrome 由本人在 `chrome://extensions` 重载原扩展；首次加载选择已解压目录。授权由本人点击扩展允许连接，现有授权不撤销；扩展继续跟随浏览器主题。自有隔离验收使用原扩展不等于本人扩展已重载。

人工验收：13 平台私人在线正向登录/昵称/UID、三平台真实线上 SSO、其余十平台需另一 Profile 时的可迁移边界；个人 Chrome 首次授权、冷启动/重载/撤销；旧本人 W05/W07/W08/W09，以及同 Profile 原私人任务保留窗口和真实业务再次运行。本 session 没有输入私人密码/验证码、退出账号、替用户授权或关闭个人标签。当前选择仍 daily；原 same-Profile handoff 无明确结束证明，保留，未暗改浏览器来冒充真实旧业务复跑成功。

实际开发 session 为 `gpt-6.1-sol/xhigh`，不是用户最初要求的 Astra；`work/account-rebuild-20261003/session.json` 是元数据证据。产品模型配置未改。私人门及模型不符都明确列出，不能藏进“全部成功”。工程无剩余已知阻塞；这些人工/环境限制不扩大成整个工程阻塞。
