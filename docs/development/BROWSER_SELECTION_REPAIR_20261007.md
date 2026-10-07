# 浏览器选择与账号入口整改（2026-10-07）

基线 `71607fa`；保留无关 `unused-owned-fixture/`。用户指出：Bilibili 任务原选日常浏览器，headless 是开发测试约束；账号检查和人工登录必须使用打开账号管理时所选浏览器。

## 已确认问题与约束

- 昨晚验收脚本修改了全局和原任务浏览器偏好，误以正式任务的 headless 阻塞作为剩余产品问题。本轮已通过真实 UI 恢复日常 Chrome，运行按钮可用；没有修改已发布链路。
- 检查/登录的目标必须来自打开账号面板时的选择；保留此前明确要求的跨浏览器登录复用，不能为了路由修复删掉它。目标已是同账号时不打开另一来源；需要复用且来源是专属时沿原自动 headless 检查。
- 账号 UI 命令没有携带打开面板时的浏览器，后台重新读全局偏好；专属检查把“不导航”直接当成 headless，混合了导航与显示模式。
- 日常 Chrome 首次检查 `0679d817` 在 Target.createTarget 阶段失败，尚未执行平台检查器。原生错误随后确认是扩展断连；完整证据如下。
- 本轮修改冻结后才运行原 Bilibili 任务，不边跑边补业务链路；前端测试浏览器使用 headless，产品任务保持用户选定的日常 Chrome。

Product Alignment:
- natural-language task: 在指定浏览器检查/登录网站，以及运行已发布的通用浏览器任务。
- reusable chain boundary: 账号操作绑定、原生会话连接；不改变网站策略或任务链。
- runtime inputs: 用户选择的浏览器及原身份/owner/lease。
- dynamic task outputs: 对应浏览器的检查结果、登录窗口和操作错误。
- generic platform capability used: 原 BrowserMode、AccountWindows、平台检查器、Playwright 扩展/CDP。
- replay model calls: 0；不增加模型字段或重试。
- site/task-specific code added: no

Reuse Assessment:
- capability: 选定浏览器内的账号维护及日常浏览器连接。
- existing implementation in repository: AccountDirectory、AccountWindows、AccountReuse、原浏览器设置与 owner 作用域。
- mature candidates and pinned versions: MediaCrawler 380b426000aac3d612837ed72c99808347dc94c9；social-auto-upload 0012d2c355f88f683cc38dde2a2db209e14091bc；现有固定 Playwright 扩展适配。
- selected implementation: 沿原平台检查与原浏览器连接修正宿主选择传递，不重写检查器。
- reused public surface: 固定 pong/cookie_auth/平台查询、原 accountSession/ManagedWindow/AttachedWindow。
- B-A-T-owned adapter and remaining gap: 用户选择在操作接受前冻结、手动目标可见性与自动来源检查分开；原生建窗错误取证后最小整改。
- license/runtime/platform fit: 沿已存来源、许可证、Windows/Python/TypeScript 组合，无新库。
- browser/runtime/state ownership conflicts: 不静默换浏览器，不删除其它 Profile 的登录，不接管私人标签。
- replay model calls: 0。
- rejected candidates and evidence: 不用专属 headless 成功代替日常 Chrome，不新增网站专用 fallback。
- focused validation: 21项账号定向回归、API类型检查、Workbench构建、已安装扩展重载后的实际冷启动检查与双浏览器正常UI操作；任务验收另列。

## 原生断连定位与复用修正

原检查两次失败 `0679d817`、`c3dbce61`；临时服务包装只捕获创建 about:blank 目标的原始异常，确认 `Target.createTarget` 收到 `daily_chrome_extension_disconnected`，不是参考平台检查器拒绝登录。`background.ts` 在 `_connectOwnedWindow` 成功后立即删除 selectorTab，而原 `ui/connect.tsx` 的 20 秒 keepalive 正在该页运行。现场无 Chrome 进程，冷启动连接页被删后浏览器退出；无需另造心跳，移除这处删页，保留固定上游页面及其既有保活。任务 target 的权限仍独立，没有把连接页或私人标签纳入任务。

修正复用面：固定 Playwright `8b552173` 的 `extension/src/ui/connect.tsx`、`background.ts` 和原 WebSocket；无新依赖、计时器或模型调用。构建仍使用仓库已有 `build-daily-chrome-extension.mjs`，固定原文件哈希核验通过。

## 验证及真实首败

- 浏览器选择新增回归在原实现失败（面板 kind 不被接受、维护检查误用 headless）。最终保留原自动复用，用例验证 global dedicated / panel daily 的目标仍是 daily，专属来源只走原 headless；21项账号选择/共享登录/操作测试全部通过。API类型检查、Workbench类型检查/构建通过；保留原构建体积警告，无全量测试。
- 修复中曾把所有手动复用移除，后纠正这项过度修改，account-reuse及原共享登录/操作/native acceptance测试恢复原版本。曾临时让check导航，导致错误收尾回归，最终保留原导航规则，仅独立传可见性。上述中间失败不算最终通过。
- 仅构建扩展后再次冷启动 `6f4e46db` 仍失败；构建目录覆盖不会自动重载已安装扩展。随后精确通过 Chrome 扩展管理页中 B-A-T 自己的 Reload 按钮加载新包，没有重载其它扩展。
- 浏览器已打开时 `dfffa4e5` 真正执行到平台检查，返回 daily 未登录。保留原复用后的 `07ed4a56` completed：转移 `e2a0ec38` completed，专属来源与日常目标分别由原检查器确认同一账号，双方维护窗口 closed，0模型。首次辅助脚本在服务尚未ready时连接拒绝，未发出账号操作；ready后才完成该证据。
- 安装扩展实际重载后，关闭本轮创建且逐一核验只有单个 New Tab/扩展管理页的三个辅助窗口，确认没有 Chrome 主进程，再通过原UI检查：`f7b2638a` 在21秒内 completed，目标为日常Chrome。浏览器连接页保留，未再出现 Target.createTarget 断连；原冷启动路径得到复验。
- 对抗静态 review 未发现确定P1/P2。面板 kind 在act到command接受间保持，原可见target不会在自动复用时被降成隐藏，隐藏维护页进入人工登录前仍要求原owner关闭；connect页不进入业务target授权集合。
- 一次维护辅助启动误引号产生的新空Profile已按创建时间/精确进程命令核验，仅关闭该辅助进程并移到忽略的work证据目录。未删除或移动日常 User Data，未关闭私人标签。

证据位于忽略目录 `work/browser-routing-20261007/`；账号、Profile、原始页面及截图不入Git。最终双浏览器操作与冻结后任务结果续列。

## 冻结1的正式首败与来源选择补充

950文件冻结后，原UI正式 execution `43628676-9129-419d-88d7-bd0a6c0c2a8f` 使用daily/headless=false启动，17秒内在账号准备失败：同源登录需要重新确认；0个业务步骤启动，cleanup confirmed。失败时950文件完全未变、UI无pageerror，没有在任务运行中修补。

只读比对原检查函数：同一owned daily页面的check/observe均返回nav.isLogin=false，无重复Cookie；专属来源同一账号仍nav.isLogin=true。仅比较内存中的相等性，SESSDATA/bili_jct已不同，UID两个字段相同、UA相同，凭据值不打印/落盘。专属登录凭据的到期时间较旧日常更新。不能把这个差异归咎为LLM或两种检查协议。

确定的宿主缺口：AccountDirectory.save在每次同UID检查通过后更新唯一sourceIdentityId；日常持有的旧凭据失效时，AccountReuse.restoreLogin因source==target直接拒绝，即使另一个当前Profile仍保存同UID的已验证登录也无法复用。

本补充仍沿前述Product Alignment：新增通用已验证来源选择，只在目标明确未登录且目录来源就是目标时，从另一当前绑定Profile的同平台/版本/同UID成功检查中选候选，再沿原AccountTransfers重新实际核验来源与目标、确认同UID并写入。历史检查只准入，不作为当前登录成功证明。保留变号/未知/绑定变化/回滚守卫；不改网站检查器、Cookie范围、任务图或模型调用。复用评估仍选择既有AccountIdentities、PlatformChecks、AccountTransfers公开方法，不新造同步框架。冻结1首败独立保留，补充修正验证完成后另立冻结2。

## 双浏览器UI与冻结2

通过原账号面板依次执行：dedicated relogin `beddc9e9`、check `70d8f596`；daily relogin `eddb2b20`、check `50c869ce`，全部completed。数据库owner绑定逐项对应所选kind，手动窗口headless=false，全部维护窗口closed；全球及任务偏好恢复daily。登录入口本次验证的是已有登录被实际识别，不包含扫码/验证码交互。

来源补充修复的新回归在冻结1代码先1失败/1通过，同样报source==target需要重新登录。修后23项定向测试全部通过、API tsc通过；对抗复核未发现确定P1/P2。检查器仍使用固定MediaCrawler/social-auto-upload，原AccountTransfers承担实时核验/写入/恢复，无额外LLM调用。

冻结2保存951个源码/配置/测试文件，服务PID11840。首次UI脚本仍找“运行”，而已有失败execution后正常按钮已变“再次运行”，因此超时但未提交任务；保留harness首败，修正脚本定位后重新从正常按钮提交。产品源码未变。

## 冻结2正式结果及交付

正式 execution `29077f0f-8307-41dc-8ea6-cb99bc2671d6` 从原UI“再次运行”提交，browser daily/headless=false；原V1 release `438a9a7f` 和digest保持不变。账号准备中原transfer `530f0868` 完成，日常目标独立确认同UID登录，所有账号维护窗口closed。已发布链路自然completed，6次流转、8次浏览器命令、40.618秒活动时间、0模型调用，TaskRun `663356a9`。

业务页面独立只读核验：凡人修仙传官方播放页，当前选择194，195标记预告；video duration1167秒，currentTime在5秒观察内228.134→233.152，paused=false、ended=false、readyState=4、error=null。没有补点击/播放动作，也没有用探索LLM的done说明代替该证据。页面按原keep_open保留，handoff active/delivery，cleanup confirmed。刷新工作台、API、SQLite结论一致，UI无pageerror；951个冻结文件结束比对无变化。源码未在该次任务运行中修改。

这次证明当前原任务与对应账号入口的流程；不外推所有网站/任务未来可靠，也不把第一次正式失败抹掉。账号人工扫码/验证码未测，服务重启后的已交付播放现场未重启验证。保留既有末端合法控制流完成规则，没有追加产品全局judge。

最终证据：`account-modes.json`、`cold-daily-check.json`、`source-target-auth-comparison.json`（仅相等性/非秘密元数据）、`frozen-code-1.json`、`frozen-code-2.json`、`bili-formal.json`（首次正式失败）、`bili-formal-2-harness-first.json`（定位脚本首败）、`bili-formal-2.json`、`bili-playback-proof.json`、`final-evidence.json`、`ui-refresh.json`；截图均留在work忽略目录。

最终只保留当前服务PID11840、用户选择的daily模式、正式任务交付页和当前授权连接页。已核验并关闭旧服务连接页及本轮维护空白窗口；未关闭私人页面。误建辅助Profile的删除被自动审批拒绝，仅返回blocked by policy；该目录已隔离到 `work/browser-routing-20261007/accidental-profile`，不入Git，也未修改日常 `User Data`。没有执行本轮关机，昨晚的关机请求已在上一轮完成。
