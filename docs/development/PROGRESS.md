# 开发进度

## 2026-10-02 Windows 测试交接与源码发布批次

用户明确授权将当前 checkout/现有 master 的全部代码提交并推送远程，随后在家里的 Windows 实测。发布前本地 HEAD、origin/master 与实际远程 master 均为 `0a904506255986f30b13d0658aa29bbcc6c2d89f`，ahead/behind 为0/0；本批包含40个已有修改文件及新增 [Windows 测试交接](WINDOWS_DAILY_CHROME_TEST_HANDOFF_20261002.md)，不包含 ignored data/work、任务库、授权或 Chrome Profile。

交接使用仓库既有 `npm.cmd run setup`、受管扩展构建及 `npm.cmd run dev` 入口；首次人工操作只需加载扩展、选择本机日常用户并允许保存授权，无需粘贴码。提供已有 saved-daily 零模型消费者入口与W01–W09逐项验收、失败取证方式；本机Mac的任务和授权不会随Git同步，Windows没有原V5时如实记录样本缺失阻塞。

本发布步骤只核对入口、提交范围及Git一致性，不重复上轮已通过的47项TS、10项Python或所属类型检查。macOS既有通过证据见下节；Windows实机仍未测，冷启动/撤销等未测门也不因发布而改为通过。推送结果及最终SHA以本批对应Git提交和发布回复为准。

## 2026-10-02 失败后复跑、原失败原因与日常授权（本轮范围完成，macOS 真机通过）

用户本轮只授权这一条闭环，未扩展采集成果、重做全部弹窗或新增恢复/驱动/授权协议。实际 checkout HEAD=0a904506255986f30b13d0658aa29bbcc6c2d89f，现有 master 与进入时的20个已修改文件均保留；本轮未创建分支/worktree、未提交或推送。

| 分项 | 结论 | 真实依据 |
| --- | --- | --- |
| 旧失败释放 | 通过 | 原 relay 向扩展发送命令计数0，唯一引导 tab 已不存在；原 AttachedWindow.verify_closed 同 owner 核验通过。execution 7634032b-2ebe-41d4-8d55-699bbc4c2f02 为 failed/cleanup=confirmed/attempt4，原失败 digest 63d40d0dfb6ab004998f4a0c242b352a36706efa9aca0a1f41c37f38809e34f0 不变。 |
| 失败后的再次运行 | 通过 | 画布“再次运行”→“开始运行”实际提交新 execution 7e21249e-3da6-4d6b-8d61-0bc34c6f0b55；V5 release 8f89a965-4c31-4aef-8a1d-07df46d98864/digest5992e25012e152670305919cbef307fc549d2882a8836c53518424db571a2fe6 未变。原 GitHub 任务全部完成，20 transitions/23 browserCommands/0 LLM，TaskRun8682e39b-e53b-42a8-87c6-aabacd41eaf5 auditComplete=true/modelCalls=[]，cleanup确认。 |
| 原失败原因与历史 | 通过 | 画布明确“查看失败原因”；再次运行、服务刷新、页面刷新之后，从“更多操作→历史记录→查看失败原因”仍显示旧03:33失败，创建任务窗口/浏览器通信异常、原版本与浏览器。失败与清理分开投影，不用手动清理按钮，不显示空成果/零条节点/原始JSON；原运行、失败、节点与清理审计均未删除。 |
| 自动释放与安全反例 | 所属验证通过 | worker退出及再次运行各一次原 cleanup_execution/verify_closed，不循环重试；只在同owner实际关闭且child_exit等其它阶段确认后解除死worker引用。已发送 createTarget 但ACK丢失时继续拒绝确认；未以新relay空列表、删租约或删失败记录解锁。 |
| 日常授权 | 通过 | 服务刷新后自动复用已有授权，无人工复制码/重新批准。原代码真实反例：空闲125.4秒 paired=true/connected=false。就绪修补后空闲131.5秒仍连接，随后上述V5完成；最终源码服务再次刷新、空闲237.2秒后仍paired/connected，Profile=Default（用户1），用户Chrome PID657始终保留。扩展worker本轮未改，无新重载要求。 |
| 最小验证 | 通过 | TS所属6文件最终47项（relay13、TaskConnection15、固定诊断7、execution detail4、cleanup recovery3、handoff5）；Python startup diagnostics10项；API/Workbench/Contracts check。额外验证仅因新改动或失败修补重跑相关文件/包；未跑全量/根级测试。 |
| Windows | 阻塞 | 无Windows实机；本轮不把跨平台源码或macOS样本写作Windows验收。 |
| 其它 | 未测 | 真正已发送窗口创建后断线无ACK的实机恢复、日常Chrome冷启动/整个Chrome重启、新授权第一次Allow、撤销/卸载、原任务完整LLM探索编译发布、iframe/popup/下载不属于本次已过门。 |

旧失败的根因边界：确定创建窗口阶段原CDP连接断开、命令未发出；原固定诊断仅os_error，断开的具体触发原因未保留。不能以本轮空闲反例或后来成功覆盖旧失败原因。新增connection_error分类仅保存固定枚举，不记录SDK消息、凭据、Cookie或原始页面。

本轮中间失败如实保留：首次新增回归的夹具缺cleanup终态digest/source枚举不符，以及UI辅助函数误用完整execution类型，修正后所属检查通过；原只读释放消费者先请求Browser.getVersion，初次临时核验失败，沿既有元数据响应补齐后确认。旧服务缓存死worker清理报告导致第一次开发服务关闭exit1，资源已通过同owner真实核验；最终源码服务正常关闭exit0再刷新，Chrome未关闭。只读inspector诊断/临时源码载入失败未被写作产品通过；inspector已关闭。

最小脱敏现场证据位于work/daily-chrome-p0（不入Git）：failed-run-original-non-dispatch-proof-20261002.json、failed-run-released-20261002.json、authorization-idle-before-fix-result-20261002.json、authorization-idle-after-fix-result-20261002.json、failed-rerun-v5-result-20261002.json、failed-rerun-final-service-20261002.json，以及failed-rerun-history-20261002.png/failed-rerun-history-detail-20261002.png、failed-rerun-authorization-20261002.png。最终真实弹窗已显示“已授权／用户1／已连接”；关闭后再次运行按钮可用、旧失败原因仍可见。下方旧“待清理/阻断复跑”为当时事实，以本节最终证据为准。

## 2026-10-02 浏览器环境弹窗重排与授权交接

按用户现场截图和明确授权，继续在原 checkout/master@`0a904506255986f30b13d0658aa29bbcc6c2d89f` 开发，保护进入本轮的18份已有修改。本轮只再修改现有 `BrowserEnvironmentSelect.tsx` 和 `workbench.css`，沿用原 Dialog 文件与开发记录；未新增文件、依赖、分支/worktree、提交或推送。

弹窗已更新到实际工作台：原 Radix RadioCards 展示三种环境及用途，原紧凑 Select 继续供本次运行设置使用；去掉 Profile 术语和重复“已保存某模式”段落，页脚显示实际读取/保存结果。日常 Chrome 区域分别展示授权、绑定用户和连接状态，当前“已授权 / 用户1 / 未连接”；只保留“连接 Chrome”主按钮，重新授权/撤销收进原 DropdownMenu。首次安装说明与 Chrome 用户选择只在未授权时出现。已保存授权的普通连接过程不再提供会暗中删除凭据的“取消”操作；首次批准仍沿原 revoke 取消并如实标注。初次读取不显示撤销；读状态失败禁用授权动作；服务端 busy 也禁用模式切换。

**用户需要的操作已完成**：本轮用户明确回复“我已经重新加载”。已有 Profile 授权仍保存，当前没有新的人工授权步骤，不要求复制码或再授权。此结论不代表原失败任务恢复。

| 状态 | 本阶段证据 |
| --- | --- |
| 通过 | 所属 workbench 类型检查；定点 diff 空白检查；实际三模式可见、单一主按钮、管理菜单、关闭、刷新和重开。首读先显示“读取中”，随后读取持久的用户1授权；API 的 paired/connected/busy 与 UI 一致。实际 viewport1840×979，无弹窗内容裁切。截图 `work/daily-chrome-p0/browser-environment-dialog-20261002.png`，上下文截图同目录 `browser-environment-dialog-context-20261002.png`。 |
| 失败 | 原 V5 的 `7634032b-2ebe-41d4-8d55-699bbc4c2f02` 仍是此前窗口创建启动失败；本轮没有运行或改写该 execution，具体断开原因仍未证明。 |
| 阻塞 | 该 execution 的原资源清理仍待确认，不通过换 endpoint、删租约或重启来伪装恢复。Windows 仍缺实机。 |
| 未测 | 本阶段不撤销真实已存授权，未在日常 Profile 做新弹窗的全新首次批准/撤销；未实切三环境、未做窄屏/Windows视觉验收。授权协议本轮未改，其之前限定样本结果保留在下节。 |

复用固定源码、MIT许可和实际入口见 RESEARCH 最新节。采集/成果格式和旧任务内容未改。

## 2026-10-02 首次允许自动保存授权、持久状态与采集成果调研（当前结算）

**授权改造已实现并通过限定验证；整体真实任务验收未完成。** 在现有 checkout/master、实际 HEAD `0a904506255986f30b13d0658aa29bbcc6c2d89f` 开发；基线干净，保护现有工作，不创建分支/worktree、不改相邻项目。本轮新增授权来自用户“授权按照提的来做，最少人工；采集先调研别人产品/开源”，不把调研擅自扩大为采集/展示产品改造。下方原 V5 完整成功是前一轮事实，本轮的新启动失败不覆盖它，也不能被它覆盖。

已做：安装解压扩展后，工作台选择指定 Profile →「授权并连接」→ Chrome 原 Allow「允许并保存授权」一次，宿主自动保存原 Profile token；以后主动连接/运行复用。界面去掉授权码输入，持续显示已授权/已连接/处理中/读取失败、绑定名称；刷新不丢事实，取消沿原 revoke 队列。三环境和原 TaskChain/B-U/W-U/TaskConnection 合同沿用，不新增模型调用或模式切换复验。仅首次配置交接原 token，不生成新协议令牌或自建状态机。

| 状态 | 当前证据 |
| --- | --- |
| 通过 | 所属协议/授权测试10/10；API与workbench类型检查；最终扩展原地构建。最小错误路径覆盖：缺少/错误/未经请求的 token、Origin、撤销胜过迟到批准、指定 Profile、凭据不进入状态/CDP及0600。 |
| 通过 | 真实 Chromium134 的全新 owned Profile：一次 Allow、无需复制码、B-U动作/DOM、非任务目标拒绝；两次原 W-U/LangGraph 普通复跑0模型、审计完整、清理确认；宿主重建、测试 Chrome 重启复用，撤销立即断开、旧 token 拒绝、宿主凭据移除。fixture最终只回收自身进程和资料。撤销后产品控制清理未确认，与 fixture最终回收通过分别报告。 |
| 通过 | 真实关闭样本的 ACK/事件竞态修复：原 `tabs.remove` 成功 ACK 后沿用原幂等 `onTabRemoved`，不再枚举已关闭的 tab；失败 remove 不删映射，迟到事件不重复 detach。回归先红后绿，完整 fixture v4通过。 |
| 通过 | 实际用户1/Chrome154 的已有保存授权，两次最小原运行均 completed、0模型、auditComplete=true、cleanup confirmed；第二次针对“主动连接后等待”差异等待5秒，亦通过。它们不代表下面原 V5 通过。 |
| 通过 | 新开发服务加载补丁，实际 UI 的主动连接即时 busy→已连接，刷新/重开仍已授权。最终截图准确显示失败后“授权已保存，当前未连接”和已绑定用户1。用户 Chrome PID657 未被结束/重启；没有复制真实 Profile。 |
| 通过，调研限定 | 官方 Apify/Browse AI/Firecrawl/Crawl4AI 做法；固定源码与许可、实际入口；B-U/markdownify/Readability 公开正文片段比较；长 JSON 被 B-U 模型上下文 wrapper 删除的真实函数反例；ExcelJS4.4.0写入/回读和独立 OOXML核验，1740字符/47换行保持。没有更改抓取方式、默认视图、旧任务或引入依赖。 |
| 失败，保留 | 初次 fixture 布尔 evaluate 序列化错误；v2/v3关闭 ACK/移除事件间隙；一次临时 async wrapper 错误，修正后第二次 warm fixture通过。临时 private monkeypatch/延迟开关已从正式夹具移除。 |
| 失败，未解决 | 工作台重新运行原 V5，execution `7634032b-2ebe-41d4-8d55-699bbc4c2f02`：`Target.createTarget` 等待回复期间 os_error → SDK RuntimeError → `hybrid_runner_failed`，0 transitions/0 browserCommands/0 llmCalls，尚未进入第一条业务节点。首次异常原文没有留存，具体断开原因未知；不把它归为 Chrome 版本或旧搜索点击问题。 |
| 阻塞 | 原 owner/lease `118646fb-aab0-48a6-8d1f-6bc28e1e7862` 的连接已断开，starting、ownedTargets=[]。现有 cleanup_execution 尝试一次，返回 `cleanup_owner_verification_unavailable`，execution保持cleanup_required，原业务失败保留。未删除原租约、猜测/关闭个人目标、换连接验证旧 owner或新增恢复机制；此任务复跑当前被既有清理门阻断。 |
| 阻塞 | Windows缺实机：安装、ACL、自动启动/复用、重启、撤销未验收，继续完成可开展代码与调研。 |
| 未测 | 实际日常 Profile 重新加载新版扩展后的全新无码首次 Allow；日常Chrome冷启动/重启/卸载/重新生成授权；完整首次 LLM探索→编译→发布；iframe/popup/下载额外样本；商业控制台/付费API/下载及候选阅读器/网格产品接入、Excel应用视觉与Windows；根级/全量测试。 |

授权和源码取舍、当前无法由既有合同核验旧目标的反例详见 [RESEARCH](RESEARCH.md#本轮授权验证结算与额外正式运行反例)。采集调研已完成本轮限定产物：推荐可供用户取舍的内容保真、阅读/表格视图和文件编码组合，尚未冻结选型。现有 artifact 界面只显示元数据，不冒称已实现 Markdown/Excel 下载或预览。新版扩展仍在 `work/daily-chrome-extension/extension`，首次步骤见 [开发说明](DAILY_CHROME_EXTENSION_DEVELOPMENT.md)。已有真实授权保留，不为验证新版初次流程强制用户重新授权。

证据在 ignored `work/daily-chrome-p0/`：`first-approval-consumer-20261002-v4.log`、`actual-saved-first-approval-20261002.log`、`actual-saved-warm-20261002-v2.log`、`first-approval-ui-20261002.jpg`、`first-approval-ui-final-20261002.png`（全页面）、`first-approval-ui-readable-20261002.png`（按实际弹窗尺寸捕获）、`first-approval-v5-attempt-20261002.json`、`first-approval-v5-cleanup-20261002.json`。原启动诊断在 `data/source-lifecycle-diagnostics/118646fb-aab0-48a6-8d1f-6bc28e1e7862.jsonl`。调研固定来源/文件摘要与样本在 `work/collection-research-20261002/`。Cookie、凭据和原始敏感页面不入日志/Git。

交付收尾：本轮修改18个已有 tracked 文件、没有新增 tracked 文件；代码文件均不超过500行，Python夹具函数不超过100行，`git diff --check`通过。解压包 manifest 的 service worker/页面/许可证入口和当前固定来源 metadata已定点核验；host侧 ACK修补后的 UPSTREAM记录已同步到产物。实际已安装旧包若要使用新增的全新无码批准，仍需在 Chrome 原扩展卡片重新加载一次；当前浏览器工具不开放该管理页，未通过私有接口绕过。既有真实授权无须重填。

开发服务：原 repo dev PID52466 在无活动运行时经既有 `/api/dev/shutdown` 优雅退出；新 dev PID78819负责工作台4173/API4175并保留。产生新 cleanup_required 后没有再次启停服务。之前用户要求的全代码提交/推送已在本轮前完成；本轮改动只留本地，没有追加提交/推送。

## 2026-10-02 任务窗口激活回归修复与原 V5 完整复跑（此前结算）

**本项通过。** 新扩展窗口适配使用 `chrome.windows.create(focused:false)`，B-U0.13.8 的 logical focus 不会激活真实页面。原前两步在实际日常 Chrome154 复现相同 target_state_fact_mismatch、页面 hidden；仅加现成 `Target.activateTarget` 后同条件通过。已在 AttachedWindow.start/start_connected 的既有 task_target_focus 阶段补实际激活，先用 TargetScope 核验已持久化的本 operation 目标；激活失败沿原关闭合同处理。不修改已发布图、selector、后条件或等待，不新增驱动/协议/重试/模型调用。

- **通过**：所属 Python 24/24（新/复用连接激活、激活失败清理和原启动诊断）；新增两项修前均红、修后绿。`git diff --check` 通过。Python 在下次运行创建的新 runner 中加载补丁，开发服务未重启。
- **通过**：从真实工作台“运行”提交原 V5，execution `97a83b22-1a20-4308-8095-6536b2669a53` / run `443055d0-2e3b-494c-8b42-90675eb98f80` 均 completed；release `8f89a965-4c31-4aef-8a1d-07df46d98864` / digest `5992e25012e152670305919cbef307fc549d2882a8836c53518424db571a2fe6` 不变。日常 mode；20 transitions、23 browserCommands、0 llmCalls、modelCalls=[]、auditComplete=true、cleanup confirmed。
- **通过**：首页搜索、仓库、Issues、第二页首项和标题/正文读取均完成；工作台显示所有节点完成，成果弹窗显示字段。只记录输出长度/摘要：标题97字符、正文1630字符。授权自动复用，无需重载扩展或重填；用户 Chrome PID657 保持运行。
- **失败，保留**：原 execution `88c57009-f73a-4355-8c85-ab16a74517ca` 不改写。其已有诊断证明单次 trusted 点击命中目标后代，94次后条件仍 expanded/focused=false；原日志没有 visibility，不补造旧现场。本轮证实窗口适配回归及当前复现因果。诊断夹具初次两次 stable/v1/v2 混用在图校验处失败、未派发 GitHub 点击，清理确认；prefix 汇总最初误用事件 type 统计 firstClickPassed=false，完成状态和实际 expanded/focused=true 是对照依据，已修正探针统计。
- **阻塞**：Windows缺实机；当前日常 Chrome 进程未开放旧 native debugging，无法对同一进程做旧端口 A/B，未关闭/重启或复制 Profile。
- **未测**：日常 Chrome 冷启动/重启、升级/卸载、实际扩展授权重新生成/撤销、首次完整 LLM 探索→编译→发布、iframe/popup/下载额外样本及全量测试。本次完整普通复跑不替代这些门。

证据：ignored `work/daily-chrome-p0/search-prefix-actual.log`、`search-prefix-activate.log`、`owned-activation-red.log`、`owned-activation-green.log`、`search-focus-full-v5-proof.json` 与 `search-focus-full-v5-result.jpg`；固定源码与复用说明见 RESEARCH 最新节。诊断脚本仅在 ignored debug 目录保留，不进入产品入口。现有 checkout/master/HEAD674ed366不变，未创建分支/worktree，未提交或推送，未改相邻项目。

## 2026-10-02 实际日常Chrome154首次配对与持久授权复用通过

**连接页拦截已修复，实际日常Profile的配对、保存授权与最小普通运行已通过；完整首版验收仍有未测与Windows阻塞。** 用户已完成安装并确认重新加载，不再将首次安装/配对记作当前工具阻塞。源码固定版本用于复现，不要求用户更换或降级Chrome。

- 仍在原checkout、master/674ed366；保护已有改动，无分支/worktree、提交、推送或相邻项目改动。本次产品修补只有受管manifest的原connect.html资源声明及UPSTREAM修改记录，原token/CDP/窗口合同不变。
- Chrome154.0.8037.92的Default（用户1）实际保存成功；状态不含授权码，文件权限0600。原启动器复用现有Chrome；保存后闲置断连不会删除授权，下一次主动运行复用保存授权，不增加用户操作。
- 合成本地页面使用实际日常Profile，经现有PythonUpstreamBrowserRuntime、W-U和TaskChainRuntime/LangGraph完整普通运行1次；status=passed、modelCalls=0、auditComplete=true、cleanup=confirmed，fixture进程退出0。没有新建或改写产品发布链路。
- 原V5任务实际execution `88c57009-f73a-4355-8c85-ab16a74517ca`失败于s-a-0002点击后目标状态合同：`ordinary_postcondition_failed_target_state_fact_mismatch`。实际导航完成、llmCalls=0、modelCalls=[]、auditComplete=true、cleanup confirmed；根因未证明，不用合成页面成功改写此结论。
- 第一个额外探针被已有闲置relay占用挡住；这是验证准备失误，保留首败。通过既有环境选择释放闲置连接后恢复daily，重测受影响探针通过。配置最终daily/revision2；原授权保留、原链路版本不变、不增加链路复验。

| 状态 | 本阶段最小验证 |
| --- | --- |
| 通过 | 原HTTP跳转/manifest边界先红后绿，所属4例；最终扩展原地构建；API类型检查；独立Chromium134同路径握手/清理；实际Chrome154配对与保存、保存授权复用、1次原运行时完成/0模型/清理；实际工作台三模式与授权保留；git diff --check。 |
| 失败，保留 | 上述GitHub V5真实运行；CfT145独立探针在版本/扩展断言前超时、根因未知且清理确认；第二连接探针准备失败，释放闲置连接后通过。 |
| 阻塞 | Windows缺实机：安装、ACL、自动启动/复用、重启与撤销。 |
| 未测 | 实际日常Chrome冷启动/重启、实际Profile旧码撤销/卸载；完整首次探索→编译→发布；iframe/popup/下载额外样本；根级全量测试。原134测试Profile的重启/撤销/所有权证据仍限定原样本。 |

实际证据：ignored `work/daily-chrome-p0/real-daily-chrome154-runtime.log`、`real-daily-chrome154-authorization.jpg`；首败/独立浏览器记录和精确入口见RESEARCH最新节。开发服务仍由本项目原npm dev运行；没有结束用户Chrome或读取个人页面、Cookie、凭据内容到日志。

## 2026-10-02 最小首次使用操作与工作台入口恢复

- Chrome 当前仅有一个资料目录 Default，显示名“用户1”；工作台已自动选中，不要求用户选择或创建 Profile。已将现有工作台停在日常 Chrome 授权弹窗，用户只需加载现成解压扩展并首次复制授权码保存。
- 先前开发服务已退出、4173/4175 无监听；只读核对没有进行中的准备或执行后，复用原 `npm run dev` 恢复本项目服务，独立进程会话 PID52466。页面和 API 健康均200，授权仍为未保存；未控制用户 Chrome。启动日志位于 ignored `work/daily-chrome-p0/workbench-dev-20261002.log`。
- 没有修改授权协议或自动化绕过安装限制；实际日常 Profile 配对及 Windows 验收仍未通过，不因入口恢复更改结论。

## 2026-10-01 日常扩展产品接入、持久授权与真实普通复跑（当前结算）

**开发接线已完成，整项验收未完成。** 实际日常 Profile 加载扩展/首次配对仍被当前浏览器工具阻塞；Windows 缺实机。不能把下列独立测试 Profile 证据替代这两个验收门。以下旧节的“P0 未通过 / P1 尚未开发 / 持久授权不可用”均为上一阶段记录。

- 现有 checkout 和 `master@674ed366222961840a7e0af8495f37ad81b8ae1d` 未变。保护进入 session 时的六份 dirty 文档；未建分支/worktree、提交、推送或改相邻项目。用户 Chrome PID657 保持原进程。
- **P0 通过（限定样本）**：固定 Microsoft extension0.4.0 / `8b552173e8d767db29b8baef8f4a1f08cf7f26bf` 的受管最小修复实际被 browser-use0.13.8 / cdp-use1.4.5 消费；补 browser-level Target 方法，原 session 映射不变。目标事实改读原 `chrome.debugger.sendCommand(Target.getTargetInfo)`，修复 attach 快照的旧 URL 导致 W-U 后置条件失败。
- **P1 已开发并实测**：复用扩展原 Profile-local token、比较、断连和重新生成；凭据复用 ai-connect0.3.2/f0ef768f 的公开 ProviderCredentialStore（原锁、原子写入、0600）。只在真握手后保存；查看状态不返回 token；迟到配对不能覆盖撤销。重建宿主、退出并重启测试 Chrome 后授权仍有效；重新生成 token 立即断开，旧 token 被拒绝；宿主可删除自己的已保存授权。
- **P2 已开发并实测**：原 PythonUpstreamBrowserRuntime / TaskConnection 接入扩展 endpoint，专属可见/无头模式保持原 B-U owner。切换环境先关闭闲置父连接及扩展连接，保存授权继续保留；切换模式不加链路复验。真实 workflow-use0.2.11 受管 fork `5d2d19fe8835cc86f1bf3e04302a5000d590f249` + LangGraph 连续两次普通运行 completed、0 模型、审计完整、正常运行清理确认。
- **任务所有权反例通过**：在独立 Profile 中创建无所有权标签，放进同一任务窗口并拖入分组；原扩展边界没有返回它，显式 attach 被拒绝，拖入被取消。读取直接消费 TargetScope 保存的原 getTargets，避免仅靠宿主过滤掩盖扩展越权。
- **P3 已开发并现场核对**：Radix 环境弹窗显示三种模式、实际 Profile 名称、解压目录、授权页入口、密码输入、连接并保存、查看和撤销。真实工作台当前显示日常 Chrome、用户1、未保存授权；没有伪报配对完成。后续给用户安装步骤时确认先前 PID20362 已退出、两个端口均空闲、数据库没有进行中的准备或执行，再恢复本项目服务为 PID41790；4173 页面与4175 API健康均200，授权状态仍为未保存。没有停止用户 Chrome。
- **P4 交付物已生成**：`work/daily-chrome-extension/extension`，含原许可证、第三方许可证、UPSTREAM 固定版本/源摘要/修改清单；实际构建入口 `node scripts/build-daily-chrome-extension.mjs`。macOS/Windows 的安装、更新、撤销和卸载操作见开发文档。

验证结算：

| 状态 | 证据与范围 |
| --- | --- |
| 通过 | API 类型检查；工作台类型检查与构建；两个所属测试文件共11例；最终扩展构建；真实 SDK 导航/点击/DOM 观察；两次 W-U/LangGraph 零模型运行；重建宿主/测试 Chrome 重启；token 撤销/旧 token 拒绝；同窗口/分组个人页反例；实际 Profile 名称元数据只读核验；工作台授权弹窗与三模式选项现场核对。 |
| 失败并已修复 | 原版 `Target.setDiscoverTargets`；原映射的缓存 URL 后置条件失败。旧 headless 夹具没有 Profile 名称缓存且启动器复用未通过，切到与日常模式一致的可见测试 Chrome。裸 SDK 撤销后触发自身自动重连及退出队列挂起，夹具改为复用产品已有 AttachedWindow/TargetScope；挂起 fixture 在无任何子进程后按确切 PID 停止，未涉及用户 Chrome。首败日志保留。 |
| 已知限制 | `Browser.grantPermissions` 在扩展目标通道不可用，真实样本警告但导航/运行成功；不能声称浏览器权限管理、下载或所有 CDP 功能均已兼容。撤销后的在途测试控制无法再关页，原运行清理为 unconfirmed；沿既有 cleanup_required 合同保留，不重连/不改判原业务结果。最终 fixture 由其 Chrome owner 回收，fixture cleanup=confirmed。 |
| 阻塞 | 实际日常 Profile 安装/首次持久配对：浏览器工具拒绝 `chrome://extensions/` 并禁止替换 UI/raw-CDP 绕过；这是工具限制，未证明 Chrome 安装受限。Windows 实机安装、ACL、冷启动/复用、重启与撤销缺设备。 |
| 未测 | 实际日常 Profile 的冷启动/升级/卸载；扩展路径下完整首次 LLM 探索→编译→发布；iframe/popup/下载的额外样本；Windows 打包命令现场；根级全量测试。基线 App/explore 超100行函数未作额外无关重构，本轮新增函数与文件未越限。 |

最新原始证据：`work/daily-chrome-p0/product-lifecycle-ownership.log`（退出0，含 BAT_PROOF）；前一完整生命周期 `product-lifecycle-scoped.log`；真实最终包 SDK `consumer-product-relay.log`；URL 首败 `product-lifecycle-runtime.log`；原版首败 `consumer-resume-baseline.log`。测试 Profile/凭据已回收；没有记录 Cookie、授权码或原始敏感页面。

清理：8 个被替代的自有候选探针/旧构建/VM helper 已移出产品目录，历史快照在 ignored `work/daily-chrome-p0/retired-research`，不再是执行入口。构建不依赖 tests helper；上游复制源码保留许可证和来源，不以文件数代替验收。当前77个工作区改动路径包含原dirty文档、先前P2接线以及固定上游受管子集，不能说整轮文件净减少。

## 2026-10-01 三环境产品接线与实际消费者验证（最新结算）

**未全部完成。** 本轮继续实施了不依赖日常扩展选型的 P2，以及 P3 的环境/专属账号入口；P0 日常扩展兼容门仍未通过，P1 持久配对/撤销尚未开发。下方“P1–P4 尚未实施”“API PID16753 保留”均为先前阶段快照，不能覆盖本节。

- 现有 checkout、`master@674ed366222961840a7e0af8495f37ad81b8ae1d`；保留原 dirty 文档、ADR 与 CONTEXT。没有分支/worktree、提交、推送或相邻项目改动。
- **已开发**：Radix 三环境选择、SQLite v20 持久化与 revision 冲突检查、准备任务及 execution 的环境快照、正式运行单次选择、真实运行/失败环境展示。模式选择不改变 TaskChain/release/digest，不追加链路复验或模型字段。
- **已开发**：专属可见/无头沿用原 BrowserProfile/ManagedWindow 和同一个 Profile；账号管理沿用原可见窗口。切换/打开账号窗口前只释放空闲连接，任务、账号窗口或保留现场占用时拒绝并发切换。原连接清理未确认时保留原选择，不另造恢复协议。
- **已开发**：准备、原有样本验证与复验消费同次准备环境快照；普通独立草稿试跑及下一次准备才读取当前选择。旧 job 没有 mode 时不补造历史。旧显式 headless=false 仍走原日常可见入口，不能被全局无头选择覆盖；缺省才读取当前选择。无头正式运行仍有稳定 owner，清理失败保留原业务失败及 `cleanup_required`。
- **修复**：macOS `/var` 与 `/private/var` 的 runner 临时根身份不一致，改为创建时规范化真实根目录，未放宽 owner/PID/路径核验。专属进程原强制退出导致存储未刷盘，改为先通过既有 cdp-use/精确 lease 请求正常关闭，再沿原 end/cleanup 合同核验；日常 AttachedWindow 不调用 Browser.close。新增断线标记沿用已有禁止自动重连策略。

### 通过

- 两种专属模式的真实 Chrome + browser-use/cdp-use 导航、共享合成 localStorage 与确认清理；另一次实际消费 PythonUpstreamBrowserRuntime → 原 TaskChainRuntime/LangGraph，两个 run 均 completed、llmCalls=0、auditComplete=true、每次逻辑 browserCommands=1，cleanup confirmed。不是完整新准备/编译/发布验收。
- 同一专属 Profile 的可见账号窗口实际 open/close；私有空白 UI 中可见→无头选择保存、刷新保留、账号打开/关闭同周期 busy 反馈与最终 closed。没有登录真实账号或记录凭据。截图：`work/browser-environment-ui-proof/mode-headless.jpg`。
- 模式/持久化/CAS/旧合同/并发与同源 HTTP 定点测试 6 项；新增准备快照保存重启/旧记录未知 1 项、现有 authoring 的快照消费 1 项；旧显式可见兼容 1 项；无头 owner 与原清理失败合同 1 项；v20 迁移原 JSON 字节保留 1 项。
- 原日常连接/节奏 6 项、Profile/错误/占用 9 项（其中临时路径身份项首败后只重验该项）；原 Python 连接释放 13 项、Profile owner 10 项、新断线/无头/外部 owner 4 项。未运行根级、全量或重复已绿集合。
- API typecheck、Workbench typecheck/production build、`git diff --check`；现有大 chunk 提示保留，不记为失败。
- 正常关闭本项目旧开发 PID16753/83229/85299 后重载；每次核对同根目录身份与空闲状态，不按端口杀未知进程。最新 API/UI 为 PID87551，4175/4173 健康，默认环境仍 daily/revision0。用户 Chrome PID657 保持原进程。真实最新选择器截图：`work/browser-environment-ui-proof/mode-options-current.png`。

### 失败与反例（不由后续通过改写）

- 原版 Playwright extension + 原 CDPRelayServer 的真实扩展握手通过；固定 B-U/cdp-use 消费失败于 `Target.setDiscoverTargets`，原 relay 在 autoAttach 初始化前没有可转发的 attached tab。没有引入 Playwright 浏览器驱动。
- Panerelay 原协议/后台逻辑的 owned Profile Native Messaging fixture 失败于 native_registration：后台存在、nativeMissing=false、nativeExited=true、transport=disconnected，原因未知。该 fixture 修改了测试 manifest，consumer 未启动；不能宣称正式 manifest、SDK 兼容或授权通过。独立 Native Host helper 启动成功仅是局部证据。
- 专属运行最初正常清理缺存储刷盘；先修复再重验。一次真实 LangGraph 探针对物理访问次数的 `[0,1]` 假设失败，实测两个逻辑命令合计四次页访问；后续只验证存储跨模式连续性，不承诺一次逻辑命令只有一次物理导航，额外访问根因未确认。
- graceful close 初次超出原清理预算后产生未确认；限定原 cdp-use 调用预算后受影响两模式通过。首个 dev 重启因原端口身份释放中的保护检查拒绝，确认旧 PID/两端口退出后正常启动。探针页面被上游移除导致 evaluate 上下文失效等研究夹具首败，以及 Workbench 可选字段类型首败，均保留并定点修正。

### 阻塞与未测

- **阻塞：日常扩展采用与持久配对/撤销。** 固定候选的任务窗口、非 owner 标签页准入、秘密/原授权行为仍有 P0 冲突，不能原样冻结。按用户明确要求，修改候选行为或增加机制须给固定源码/真实反例后交用户决定；未自行另造授权协议/驱动/恢复。
- **阻塞：目标日常 Profile 首次加载/批准。** 浏览器工具自动批准检查此前拒绝 `chrome://extensions`（仅允许 HTTP/HTTPS）；没有改用原生 UI、原始 CDP 或 Profile 文件绕过。独立全新测试 Profile 可开发测试，不能代替日常绑定验收。
- **阻塞：Windows 实机。** 本轮没有 Windows 设备，继续完成可开展 macOS 开发，不把缺机扩成整体停止。
- **未测**：新模式完整 B-U 首次探索→W-U 在线编译→样本/复验→发布→正式执行的端到端；真实账号登录/跨站效果；目标日常 Chrome 的自动打开、指定 Profile 绑定、跨浏览器/服务重启持久信任、实际 owner/拖入/撤销；macOS 完整扩展交付与 Windows 安装/生命周期。

详见 [固定来源与最新证据](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#继续实施真实消费者与三环境产品接线)。研究与产品证据分开，旧失败和成功不回写。

## 2026-10-01 P0 候选构建与无人值守实浏览器加载

- **通过**：固定原版 Playwright extension 0.4.0 原构建；Chromium 134 全新测试 Profile 中授权 UI、原后台 chrome.runtime 消息实际运行；消费端为现有 browser-use/cdp-use，模型 0、清理 confirmed。生成可复现研究构建入口与所属 API 的显式 Python fixture，随构建提供原版权/许可证，产品依赖未改。
- **失败**：CfT 145 首次 SDK 启动超时，根因未知；即时清理核验曾报 cleanup_required，随后确认资源退出并回收测试目录。134 首次探针误用 evaluate 的 async-arrow 格式，修正后只重验该项。来源 urllib 再次 IncompleteRead，curl 获取同一固定 archive 并通过原摘要。所有首败独立保留。
- **阻塞/未测**：日常 Chrome 154 的首次安装/批准与目标 Profile 验收；完整候选 relay 消费、任务窗口/持久授权/三环境接线；Windows 实机。P0 兼容门仍不通过，候选没有冻结。Panerelay 是新增调查对象，非现有组件，不能仅凭撤销探针推荐采用。
- **边界修正**：受保护安装不能替用户确认，但构建和独立真实浏览器测试不依赖用户在场；前次答复将安装扩大为全部开发停止条件，已纠正。[完整补证](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md#后续补证用户不在电脑旁时的开发验证)。用户 Chrome PID657 与 API PID16753 保留，无分支/worktree/提交/推送，也未重跑原 9 项或全量测试。

## 2026-10-01 日常 Chrome 扩展 P0 实施与候选阻塞

- **未完成：P0 兼容准入不通过，P1–P4 尚未实施。** 本轮已有明确开发授权；基线为现有 `master@674ed366`，保留原 4 个修改文档与 2 个新增文档；未创建分支/worktree、提交或推送。
- 已新增 `scripts/research-daily-chrome-sources.py`、API 的显式候选探针与来源辅助；固定三候选 archive SHA-256/逐文件摘要，保留许可证。现有产品 B-U/W-U、父连接、运行/恢复合同未改。详细 [P0 记录](DAILY_CHROME_EXTENSION_P0_EVIDENCE_20261001.md) 包含完整 Reuse Assessment 和实际入口。
- **通过**：9 项各自取得最终通过，表明反例/性质得到原代码执行证明；Panerelay 两项使用真实 HTTP/WebSocket，撤销后旧凭据拒绝，newWindow 同时被丢弃；API 所属 typecheck 通过。这不是 Chrome 扩展或产品零模型复跑通过。
- **失败**：Playwriter 非本次 owner 的历史云清理/默认原始日志；Playwright group 拖入扩权、空目标枚举和 argv token；Panerelay 建页要求 all-tabs 并丢失 newWindow，三者均不能原样采用。首次下载中断与未齐来源造成 2/9、纯类型误加载造成 3/5 的研究工具失败保留，补救只重验受影响项；不算产品首败或兼容通过。
- **阻塞**：按用户事先要求，已提出允许哪个候选的受管最小扩展/继续寻找的取舍，未自行决定。Windows 无本轮实机；浏览器工具自动安全检查拒绝打开 chrome://extensions（仅允许 HTTP/HTTPS），加载解压扩展与首次批准须由用户实际完成。
- **未测**：真实日常 Chrome/Profile、原扩展构建/安装/更新、持久授权与重启、B-U 原生探索→W-U 编译→验证→普通复跑、三环境选择及自动打开/已有实例复用、实际页面隔离/撤销/清理、macOS/Windows 正式交付。
- 只使用合成页面/秘密标记；临时日志文件、测试 relay/客户端在 finally 清理。未读取用户 Profile/Cookie/敏感页面，未真实调用云 cleanup/候选自动端口管理，原 API PID16753 与 Chrome PID657 保留。

## 2026-10-01 日常 Chrome 扩展接入开发文档（文档完成，未实施）

- 已完成 [开发文档](DAILY_CHROME_EXTENSION_DEVELOPMENT.md) 与新 session 接续指令，建立 [ADR 0013](../adr/0013-daily-chrome-task-window-control-boundary.md)；CONTEXT.md 记录环境选择、任务窗口、控制连接与持久配对术语。
- 用户确认：仅任务专属窗口；首版 macOS 与 Windows；开发阶段本地加载解压扩展；主动连接/运行时自动打开 Chrome、已有实例复用；首版绑定一个指定 Profile。模式切换不新增强制链路复验，常规连接/授权/节点合同仍照常核验。
- 用户追问“掉线/继续”的含义，未选择自动或手动恢复。已核对 TargetScope 禁止 SDK 擅自重连，TaskChainRuntime 普通异常走 failRun；文档继承现有失败、检查点和人工等待合同，不新增断线自动续跑或通用“继续”入口。
- 用户强制要求开发的所有环节先找现成开源方案，能复用/沿用就复用/沿用，agent 不自行作出新增产品、架构或选型决策。文档已去除预设自定义短期 token/epoch 协议与 OS 凭据包，逐环节记录复用要求；具体缺口先给源码/真实反例，不自行另造基础设施。
- 已做当前源码和固定上游来源静态核查；Playwriter/Playwright 均未连接到 B-A-T，未冻结组件。具体 endpoint、newWindow、日志/进程/辅助执行器/云清理反例已记录，不能把 README 和静态导出当兼容通过。
- 本轮只改文档；没有安装、启停、日常 Chrome 连接、产品模型调用、产品测试、Git 提交或推送。访谈开始 Git 基线为 master/674ed366，工作区干净；开发 session 必须重新核对。
- 产品取舍已收敛，不追加问卷。技术兼容、现成凭据/启动入口和采用依据由新 session 的 P0 核验；文档完成不代表接入、持久授权或两平台产品验收通过。

## 2026-10-01 checkpoint 后集中修复（代码与定点验证）

- 修复前完整 checkpoint 已按用户要求提交：`e7ed54e44e3c560665cc3ff5101daea521800b24`。原 HEAD 为 `2a8d2cdeb2b2b7ea3cfe49930511a1e9d5081683`；没有分支/worktree、回退、推送或第二次提交。新补丁留在当前工作区。
- 两次 review 的已确认问题已处理：started 首次发布即有真实输入、finished 不复制输入；脱敏/截断来源沿节点和变量传播；固定 each 集合只首次散列/留存，未知总数不写分母；前置失败与真实 null 可读；普通详情显示真实读取/后置/调用合同；终点尺寸先参与唯一布局；成果弹窗只一份，并按各实际 emit 合同展示。
- 健康链路 800ms 和访谈 1200ms 刷新已删除。SQLite 唯一连接 TEMP trigger 复用原持久版本；pure rollback 不通知，慢消费只唤醒最新版本，取消/关闭释放。完整事件分页消费后确认捕获版本；晚到同次 POST 不清事实。原活跃访谈展示节奏改成仅实际变化后的单次 200ms 合并；100 个异步增量只读一次完整 snapshot，无变化不再读。
- React：同版本不通知订阅者；冻结内容引用复用，draft 验证 envelope 仍更新；节点/连线结构共享，选择与构图分离；同不可变 chain/batch 建拓扑与事件索引。只证明减少重复计算/引用替换，未测真实 Profiler 或帧耗时。
- 反馈只存 selection/resultDigest，父任务/执行/需求/版本从不可变 execution 投影；旧完整 context 兼容且不回写。operation 丢失仍恢复同反馈，operation/review 不一致先拒绝。safeCallSummary 为普通代码，仅用户主动回流时复用已核验的所选调用；一次读取运行记录，不再扫描全部调用或重复读取。三个内部参数不属于模型字段。只有最后实际生产者 finished 成功、当前来源政策可证明安全且值摘要一致时带值。旧洗白事实、末次未完成、缺失输入、脱敏/截断/聚合来源未证明时只保留引用，不用模型补；摘要进入既有访谈上下文，会增加输入内容，不增加调用次数。最终消费路径核查发现普通 accepted 也组装成果摘要，已收紧为 requirement_revision 才处理；链路读取次数反例先红后绿，同项安全反例及 API 类型检查通过。
- LLM 核查：相对上述两个基线均没有新增产品 LLM 调用入口或模型必填字段；显式 llm/delegate 调用次数入口不变，只调整实参首次落盘顺序。开发子 agent review 与测试替身不计作产品真实模型执行；本修复阶段没有真实模型或浏览器运行。
- 证据：UI 6 文件 56/56，通过后局部修改仅定点 6/6、4/4；连接两文件 16/16，新增 healthy/晚回执 2/2、idle 1/1；回执接口变化定点 3/3。数据库通知 4/4，保留任务名 error 的 uncaught 首败并修复后 1/1。真实临时 HTTP 接口 2/2（暂停追最新/重连/取消/app.close、continuous idle 新提交）；未填满 OS socket，不虚报 OS 背压。活跃访谈合并/旧 finite 2/2。反馈 5/5，末次/旧来源洗白先红后绿，额外 operation mismatch 和隐私传播 4/4，安全 null/false/0/空串及未知输入 1/1。多 emit 合同先红后绿 1/1。开始/普通合同详情迁移到所属独立测试，<500 行。
- 验证修正保留：Workbench 类型检查首败（summary/full 事实层级、React unknown 条件、可空 presentation）已修正；一次 SSR 因根 tsx 未指定 Workbench JSX tsconfig 首败，指定 TSX_TSCONFIG_PATH 后对应单例通过；一份隐私正例夹具缺真实 started 输入，补正确配对后通过。不是产品通过后覆盖首败。最终 API/Workbench/runtime/contracts 包检查均通过，git diff --check 通过；没有根级或全量测试。
- **未验收/剩余边界：** 本补丁没有新真实浏览器复跑、Chrome 重启后免 Allow 或实机 React Profiler 验收。旧同连接成功不能替代新改动。只读 health 确认现用 API PID16753 仍未加载 /changes；没有为加载补丁断开保留的日常 Chrome 控制连接或交付页面。旧任务列表 1500ms 与旧 BrowserStatus 2000ms 刷新在本轮基线前已存在且未改，不能声称整个系统零轮询。工作区每次真实变更仍读取完整冻结内容；本轮只省略 live detail 中的重复 content，不声称所有静态内容只下载一次。


### 2026-09-30 解锁后实际验收：日常 Chrome 连接复用和新逐次事实通过

- **部分通过。** 用户解锁后已从原任务 `a81d8a80-50ae-48aa-a06c-558ccf08f76a`、原 Release V5 开始真实运行，并实际处理 Chrome 原生 Allow；没有创建任务、私有 Profile、分支/worktree，没有提交或推送。下节锁屏结论是当时快照，不再代表当前验收状态。
- 三次结果分别保留：`41dfc78a-c7ec-4a70-855c-7e283c0093d7` 在 SDK connect 超时，runIds=[]、0 动作/0 模型、cleanup confirmed；首次实际连上后的 `55706cb8-f6e0-4f11-8973-51d74c1066ec` / run `01190d21-5d7b-4060-8d87-d424270244a4` 在 `s-a-0011` 报 `ordinary_event_target_mismatch`，execution 8 transitions/11 commands/0 模型，8 started、7 finished，清理确认。原诊断不足以确定该次 trusted event 身份关系失败的根因，后一次成功没有改写它。
- 下一次真实连接复用与运行完成：execution `5b82f7de-79fe-486c-8a58-1d21a8846245` / run `058b3430-241f-4905-851b-86489488ef1c`，20 transitions、23 browserCommands、31264ms、0 llmCalls；20 started 与 20 finished.success，auditComplete=true。当前列表返回 #9067 的完整标题和正文，与旧运行 #9057 不同。TaskRun、step output、execution output 合同和值一致，工作台实际成果可读。
- 第一连接 operation owner `9f6440a2-92b7-42b2-8a67-0e3346690498` 有 1 次 SDK connect；第二 owner `d10c7072-5998-4b4c-836e-3c3c1b60119c` 只有 reserve/prepare/focus，SDK connect=0，现场没有再弹 Allow。两次 operation 的清理均 confirmed、activeResources=false，分别保留 task 父连接；父 SDK 进程仍在线，用户 Chrome 没有关闭。缺少 operation→PID 的起始审计映射，不把当前进程快照说成严格相同 PID 证明。
- 新事实真实落库：成功调用的 40 个 started/finished 事件都有 execution envelope；11 份输入与 11 份输出为 recorded，9 份输入与 9 份输出为 redacted。Function candidates 的 10 个实际候选与返回 1、最终 read/assemble/terminal 的实际结果可见；普通浏览器原始输入输出不冒充可安全记录。证据 `work/node-handoff-20260930-current/real-execution-facts.json`；旧事件未补写。
- 开始实际展示需求 v2、发布 V5、步骤目的、同次调用以及“没有传入额外参数”；“查看对应需求”从原任务打开对应已确认草案，不发模型或浏览器请求。Function 参数结构/约束、当前实参、返回、下游、完整折叠源码已现场核对。截图 `start-real-success.jpg`、`start-requirement-v2.jpg`、`function-real-success.jpg`、`real-current-success.jpg` 位于同一证据目录。
- **新候选只读编译门通过，不冒充已发布运行。** 原来源 artifact `720c8359-cf57-44d3-8d5f-ce5037c43034` 经实际 `materializeHybridChain` 与 `compileTaskChain` 成为 19 节点，candidate digest `d1f72ea65bb9a22083f222e14792fdcfa6feb5115c62324513cecc056a565357`；旧 V5 仍是 20 节点，两组合动作未改写。全部非输出节点、输入/输出合同以及去除输出组装后的控制流相同；本轮实际 read 值经过新 assembler 后值和键序相同，0 新模型。证据 `candidate-materialization-evidence.json`，候选没有写入产品仓储或发布。
- 编译核查发现并补救了真实回归：删 merge 后叶绑定变成根对象+paths，原 applyReadRequirements 漏掉 final read 和 producer readiness 的 requiredPaths。现在复用公开 dataCapabilityConfigSchema，只对立即、唯一、@1、常量 assemble 按实际参数别名和源键恢复约束，校验路径；直接 terminal 返回非空来源也保留原约束。动态/未知/分支/循环/函数不猜，不从 schema.required 推导。两个新反例先红，所属 4 条（含真实 Python readiness 探针）绿；测试合同/类型调整后仅重验受影响 2 条及 API typecheck，通过。独立只读对冲无 must-fix。
- 对用户质疑的死规则做了增量反证并补救：合法 branch case ID 可名为 blocked/limit/body/timeout/human_required，旧展示却按字符串套标准端口语义。现在节点、阶段、循环体和边先按真实 source.kind/cases 判断；边在源身份丢失前派生标签，同文案的 case 与 loop 边也不混并，ID 不随运行变。两类图均接线，只增私有派生 label，不进 contracts/持久化/LLM。5 个合法 case 与混边共 6 个先红反例转绿；受影响三个定点文件 30/30，最后同文案补救仅重验 control 17/17，Workbench typecheck 通过。旧 V5 同名动作按真实 operation/常量 mode 区分“合并数据/组装数据”，不改保存标题；中文修正只重验受影响 1 条。独立只读增量审查无新增 must-fix。
- 最后定点文案补救：while 的稳定次数显示“已完成 N 轮/当前第 N 轮”，each 显示处理项数；只在 each 有可靠 total 时显示分母。仅未知 while 所属单项 1/1，无新字段或模型。中文数据类型已由原 V5 实际页面核对；最终成果截图 `final-current-success.jpg` 与 `output-actions-real-success.jpg` 已保存，工作台保留在本轮 #9067 成果页。未运行第三轮完整定点组或根级/全量测试。
- 未完成/未测：跨 Chrome/服务重启或跨任务的永久免授权；新候选整链浏览器复跑/发布；真实用户反馈的 LLM 回流发送；局部修订交付；真实文件生成/下载及需保留现场的页面交付（本任务明确无需保留页面，也没请求文件格式）。已有 focus 生产入口和 artifact 元数据不能替这些验收。V5 没有 branch/loop，相关展示只由所属反例验证；Windows/其它站点/跨任务不扩测。服务及有效父连接保留运行，不为了再取绿色结果主动断连。

### 2026-09-30 锁屏时节点实施快照：当时日常 Chrome 连续复跑未通过

- 本节保留解锁前的失败和代码证据；最新真实验收以上节为准，下方旧 V5 成功不能验收这次改动。HEAD 仍以 `2a8d2cdeb2b2b7ea3cfe49930511a1e9d5081683` 为基线；原 dirty 文档保留，无分支/worktree、提交、推送或新产品任务。
- 展示已实施：直接子行取消额外展开；if/else 和 ordered case 常显，只灰可证明的未选独占路径，共享汇合保守；未知总数不显示分母，集合游标与执行轮数区分，限额停止和 body 完成不冒充整体成功；耗时来自同次有序 started/finished 配对。私有 expanded/onToggle/onEnter 死接口和重复端口翻译已删除。
- 起止与详情已实施：精确冻结需求/版本、步骤目的和真实调用输入；未开始明确无调用记录，虚拟开始不计时。Function 参数按真实绑定显示类型/结构/约束、固定值与来源，真实实参与返回单独读取，完整源码独立折叠。结束依据所选 call 最终 outcome，成果宽区使用保存值与合同，集合分页和长文本保留全部值；显式 call 读取失败不切到另一次调用，回流保留显式选择供服务端核验。
- 运行事实已实施：复用 TaskRun.events 与现有仓储，在派发时捕获受控输入、结束时保存安全输出和真实循环/短路判断事实；缺失、脱敏、大小上限及 falsy 值分开。条件没有读到绑定值时不保存伪空对象。旧事件不补写；原始浏览器内容/未知能力不冒充可安全记录。新增字段只进入事实协议，无新增 LLM 必填字段、隐式模型或完成 judge。
- 同任务需求回流已接线：服务端保存精确旧需求、release/draft、step/run 和结果摘要；前端使用持久 review 回执携带原话返回原访谈，保存/发送分段幂等，失败保留文字与原 requestId，旧版本冲突明确。删去重复 invocationId、结果身份及输出字段列表。真实用户反馈未为验收而伪造，实际 LLM 发送未执行；所属协议/连接反例通过，不把按钮等同真实发送验收。
- 新候选输出精简：完整值合同精确一致直接绑定；同一封闭必需字段对象复用现有 assemble 一次，保留 rewrite、键序、falsy、目标重命名/嵌套与一次变量写。重复源键、数字键排序、开放/可缺/未知合同及混源回退。多字段重组不能仅凭 schema 证明完整值键序相等，所以未普遍消成 0 节点；旧 V5 两个组合节点未修改，也未发布新候选。
- 本轮首次真实尝试 `b6e2f80c-7399-4d1c-89b7-669194a72d0b` 在 SDK connect 超时，0 节点、0 模型、cleanup confirmed。旧 catch 曾误留 unavailable 启动租约；通过现有 UI“核验原窗口”证实原 lease ended/无 ownedTargets，追加 ended 资源事实，原业务失败不改写。
- producer 补救后真实尝试 `b104a9fc-05eb-42f7-87a2-f1cf2ac9de27`（2026-09-30 11:29:14 UTC 受理，11:30:16 UTC 结算）仍在 sdk_connect 失败，runIds=[]、transitions/browserCommands/llmCalls/invocations 全 0；cleanup confirmed，browserHandoff=not_requested 且 lease/owner=null，错误保留 hybrid_runner_failed、classification=external、repairable=false。实际 owner `26cc4b7b-95ac-4d2b-834c-4b174cebf078` 的 lease 已 ended，targetId=null、ownedTargets=[]；证明启动清理与分类补救生效，不证明浏览器链路成功。
- 用户明确授权代点本机 Chrome Allow；实际 native UI 工具返回 Mac locked 且自动解锁未成功，未点 Allow、未绕过锁屏、未用私有 Profile。SDK 失败根因仍不按该现象补造。正式 runtime-host 已去掉 replay 独有强制父连接关闭，真实入口适配测试证明同任务两个 replay 只 start 一次并分别 release；但本轮真实首连/第二次复用均未通过。Chrome 官方对每个新调试 session 要求原生确认；保留有效连接不等于跨 Chrome/服务重启的永久授权。
- 定点验证通过：contracts 记录 2 条、runtime 记录 12 条与 invoke/delegated 所属 19 条；Workbench 当前控制/详情 26 条、画布投影 10 条、终点/连接 14 条；API execution detail 3 条、review 4 条、TaskConnection 14 条、startup/handoff 5 条、输出 identity/projection 5 条及 cardinality 4 条。新投影目标合同调整后只重验受影响 1 条通过。API/Contracts/Workbench 类型检查通过，最终 Workbench build 通过，保留既有 large chunk 警告；未运行根级或全量测试。
- 实际页面核对了原任务开始、Function 详情及终点/本次结果区；截图 `work/node-handoff-20260930-current/start-current.jpg`、`function-current.jpg`。业务需求与版本、无调用/无输入、参数来源/约束、返回要求真实可见；终点“尚未到达”、结果区“没有执行动作或返回成果”，没有用旧成功填空。工作台服务为本轮启动进程，仍保留运行；用户 Chrome 和原页面未关闭。
- 未完成/未测：解锁后原任务连续两次日常 Chrome 真实复跑与新逐次 I/O 持久数据验收；新候选整链编译/复跑/发布；真实用户需求回流发送；局部修订交付；实际文件生成/下载和应保留页面交付（原任务未约定此成果，未添加格式）。当前 V5 无 condition/loop，不能用它验收条件循环；Windows、跨任务、其它站点未扩测。更早首次 target_state_fact_mismatch 根因继续未知。

### 2026-09-30 独立交接实施基线（本轮）

- HEAD 核对为 `2a8d2cdeb2b2b7ea3cfe49930511a1e9d5081683`，master；原有文档增量完整保留，无新分支/worktree、提交或推送。
- 独立交接文档全文读取；最新要求覆盖旧稿：取消额外路径展开、未知总数无虚构分母、所有 if/else 常显、当前次事实优先、精确需求起止闭环。
- 已拿实事件路径：runtime 的 recordEvent → persistRun → repository.saveRun/taskContracts.body → executionEvents → Zod batch → connection → 当前调用投影；完成后 checkpoint 释放但 events 保留。逐次 I/O 仍未实施时不宣称已记录。
- 独立只读对冲指出实际绑定捕获必须位于派发时点；循环游标不是已处理数，读取上限不是总数；分支外来入边的后继也不能误灰。后续按阶段追加实际验证结果。

### 2026-09-30 两线闭环：日常 Chrome 原主线 V5 正式通过

- **通过本次实际主线验收。** 原草稿独立复验 `e3dd159d-4b37-48d0-8918-af2461aab63f` / run `d07ef783-b960-4f48-85ea-a03d5bf3e851` completed：20 transitions / 23 browserCommands / 0 llmCalls / 29014ms；当前第二页首条 #9057 的标题及正文均按原合同输出。与探索样本 #9050 不同，验证了真实列表变化，不是重复旧样本。cleanup confirmed，操作资源释放、父 task 连接明确保留。
- 原工作台正式“发布”形成本地 Release V5 `8f89a965-4c31-4aef-8a1d-07df46d98864` / digest `5992e25012e152670305919cbef307fc549d2882a8836c53518424db571a2fe6`；原 candidate 图、revision 0、checksum 与 executable digest 未修改。随后从画布正式“运行”受理 execution `01987d57-e15f-47cf-8e79-cdb69e88123c` / run `320f1ccd-9e07-4bf6-85be-cb35e8bd0f12` completed：20 transitions / 23 browserCommands / 0 llmCalls / 27946ms，同样取得 #9057 标题及正文，cleanup confirmed、activeResources=false。
- 真实连续阶段复用已核验：复验首连 Python PID69039（API PID68873），正式运行仍使用该同任务父连接；正式 startup 只有 reserve/target prepare/focus，没有 SDK connect 阶段，没有再次原生授权。正式结束后 PID69039 已退出，父连接不再 retained，日常 Chrome PID657 始终不变。用户原标签未作为 ownedTargets 清理；本次计划未请求页面交付，因此操作页按既有策略关闭。
- 正式 UI 显示“已发布 V5”“运行完成”和合同驱动单条记录，标题/正文可见；截图 `work/nested-workbench-acceptance-Zh9aHE/main-v5-daily-chrome-completed.jpg`。支线的来源解析、短标题、单层焦点、错误/具名重试布局及同任务 revision 7 succeeded 证据继续成立，不是重新建任务。
- 根因不是仅 function，也不是这次模型无法导航：已证实编译读取活性/等待分类、日常连接入口与连续阶段生命周期、首连等待预算、Python ready 与 TS 来源准入不一致。新动态 ready 回归 6 条逐条绿；原来源正式离线重编译 0 新模型、0 gap、同 20 节点/同 digest；定点 diff 检查通过。diagnosing-bugs/codebase-design 用于先复现真实 seam，再修原有适配边界，没有复制 SDK/Agent loop/状态机。
- 保留全部历史失败、旧发布/来源、既有 dirty 修改；产品任务总数仍为 7，没有新建任务、branch/worktree、Git 提交或远程推送，也未运行根级/全量测试。Windows、其它站点、跨任务及所有历史未定因错误不在本次已通过范围；服务保留运行，工作台停在 V5 正式结果。

### 2026-09-30 日常 Chrome 首连通过，动态详情作用域误拒绝已定因

- 三层首连预算及连接复用的 Python 定点 27/27 已通过。原草稿真实独立复验 execution `c0f1e3f5-cd88-48e7-8edf-f26b0f4cb3b1` 首连成功，日常 Chrome PID657 不变；16 transitions / 22 browserCommands / 0 llmCalls 后，在 `s-a-0029` 点击后读取校验失败，不能标为主线通过。
- 失败 run `1210bb38-ac4e-4ea2-8083-b2b39656bdc5` 的当前第二页首条为 #9057，选择序号 1；真实 trusted event、dispatchCount=1，后态 URL 摘要准确对应 #9057，session/target 未变。消费者 ready scope 仍为样本 #9050；Python `action_result_readiness` 仅接 transition，而 TS 来源准入已同时接纳 ready/transition，确定为执行适配遗漏，不是 function 选择失败或模型输出错误。
- 操作页清理 confirmed，retainedConnection 明确归原 task，父 Python 进程保留；不把保留连接伪报为子进程退出。正补唯一 ready 消费者运行时作用域，保留固定 URL、身份及有界轮询；不新建任务、不再 B-U 探索、不改旧 candidate/发布/失败历史。下一步回原草稿复验及正式入口验收。
- 补丁已落：只补现有 `action_result_readiness` 的 ready 选择分支。真实 OrdinaryCapability/verify_declared/TargetResolver seam 正例先红，定点 6 个用例逐条绿，固定 URL、歧义消费者、缺少 URL 变化证明、派发后及读取中 session/target 变化均继续拒绝，派发仍严格一次。fork manifest 核验通过，新 digest `2a4dad9ca5256f655e57aede2c035ee40d1b2d8affea33b05500150825d78e9e`。
- 原 final canonicalRequest 通过正式 `recompileHybridSource` 及 `materializeHybridChain` 只读重编译：0 model calls、0 gaps、20 nodes，摘要仍为 `864fdccaedcc0552220f243c08db23789b034043e848348999293e40ae0bbab6`。因此保持原 candidate、草稿 checksum、旧 artifact 的历史编译 sourceDigest，不伪造新图或修改旧运行。正常重载本项目服务载入 Python 补丁，Chrome PID657 保持，新的真实独立复验 `e3dd159d-4b37-48d0-8918-af2461aab63f` 已从原工作台受理，待结算。

### 2026-09-30 同任务父连接已接线，首连等待继续补救

- 原准备/样本/独立复验接到同 task connectionOwnerId；每次 owner/page/审计独立，释放成功保存 retainedConnection，父进程阶段 not_required；正式 replay、handoff、取消及服务关闭走原最终 close，不关用户 Chrome。人工 handoff resume 保留原独占恢复协议。不同任务先核验关闭旧父资源，失败不借用。
- Python Runner/AttachedWindow/SessionManager 13 项回归通过，覆盖两个 owner 一次连接、阶段 stop=0、最终 stop=1、提前 autoAttach、页/缓存/下载隔离、配置漂移、掉线拒绝重连、取消及交付页保留。TS 连接/真实 fd3/生产 Runtime 10 项及 daily Chrome Runner 4 项通过；原结构化 close 4 项、准备收尾 5 项、清理恢复 1 项、启动诊断 9 项通过；API 类型检查通过。均为定点或受控证据，不冒充真实 Chrome 复用。
- 本项目服务已正常重载，日常 Chrome PID657 不变。原草稿真实复验 `46d6defb-20f1-4695-8773-03b3ba6093ab` 首连仍超时失败，0 commands、cleanup confirmed；本次中文原生确认处理晚于 SDK 预算。正在补首连有界等待，不能只因连接复用适配通过就停下或宣称主线闭环。原候选/旧失败历史不变，未新建产品任务、未发布新候选。

### 2026-09-30 日常 Chrome 入口已修，原主线现场继续

- 用户要求准备/样本/正式运行使用日常 Chrome，不再以专用 Profile 重试；下方“请求关闭遗留私有 Chromium”不是当前方案，未执行。
- 确定代码缺陷：RunnerProcess 仅在临时 BAT_UPSTREAM_BROWSER_CDP_URL 存在时附加浏览器，配置缺失静默另起私有 Profile；准备入口没传产品 ownerId；环境变量还会覆盖显式连接/恢复身份。三项 RunnerProcess 回归和准备 owner 回归先红，修正后与原来源关闭回归合计 8/8，API 类型检查通过。
- 默认只读 Chrome 原生 DevToolsActivePort；显式连接优先；连接缺失/headless/无 owner 在启动前拒绝，不能换用私有浏览器。复用已有 AttachedWindow/TargetScope，仅拥有任务标签，profilePath 只沿用为租约元数据位置，不复制用户 Profile。
- 本机原生日常 Chrome PID657 起初未开调试；用户明确授权开启后，原生界面显示 127.0.0.1:9222，连接文件已生成，监听仍属 PID657。服务从本项目 PID44877 正常重载为47607，没有关闭 Chrome 或清理旧私有进程。
- 同一原任务正式 UI 准备 job `fce5f334-89dc-47f0-8085-468cbc3b12b9` / Browser owner `b1167767-e7de-4767-8c67-182a59895228` 已在日常 Chrome 完成探索与终编：final sequence 37、20 节点、gap 0；草稿 `45f64ab2-7b34-4784-8f59-756752b8cd44`，候选链 `a20edbe6-f4af-4987-85da-8daf261180fc` v1 / digest `864fdccaedcc0552220f243c08db23789b034043e848348999293e40ae0bbab6`。准备的 primary/bridge completed，cleanup confirmed、activeResources=false。
- 第一遍普通样本 execution `2f569c35-2b81-4656-8f74-1ebff1b48c6e` completed：20 transitions、23 browserCommands、0 llmCalls，读取第二页首条 #9050 标题与正文，cleanup confirmed。独立复验 `0f21b754-ab75-48f2-8611-f52776d4e932` 在启动阶段失败：0 transitions、0 browserCommands、0 invocations；owner `5abb03c3-6f74-4c6c-8a0b-85a3ffeee5f5` 没有创建任务 target，cleanup confirmed。SDK 子错误被旧诊断路径折叠为 RuntimeError，不能据时间或 Allow 行为认定唯一根因；正在补固定阶段/安全异常链，再从原草稿的独立复跑入口验证，不重做 B-U、不放宽发布门。
- 工作台“专用浏览器账号”入口改为“日常 Chrome 连接”原生说明，不再提供新开私有浏览器操作；旧 Profile 清理 API 保留兼容，未删历史能力。真实弹窗与返回通过，Workbench 类型检查通过；截图 `work/nested-workbench-acceptance-Zh9aHE/daily-chrome-dialog.png`。
- 原生端点解析/所有权 11 项回归通过，额外纯十进制端口负例先红后绿；日常 Chrome 失败文案 2 项先红后绿（mac/Windows/Linux 路径为受控证据，不冒充跨平台现场）。不改模型路由、不新建任务/分支/worktree、不提交推送。主线仍未完成，尚未发布或正式复跑此新候选。
- 启动诊断已通过既有 fd4 接回 Runner callback，分开 reserve / SDK connect / task target prepare / focus，固定异常链最长 4 层，不记录异常消息或个人数据；Python start seam 9 项与 TS 持久化 6 项先红后绿。诊断不改连接策略，不宣称原复验连接首败已修复；下一次同草稿独立复跑用于真实定位。
- 新诊断实际复验 `47e7b564-48df-4707-8086-fd4fbb65443b` 已失败，不能继续记为运行中：同一草稿 revision 0/checksum 不变，owner `96efa0a6-8a8a-4938-83d4-69c37de80495`；reserve 完成，SDK connect 在 10211ms 失败，安全异常链为 RuntimeError → TimeoutError → TimeoutError → CancelledError；未进入 task_target_prepare，未创建目标/执行节点，cleanup confirmed。钉住依赖 cdp-use/client.py:277 的 websockets.connect 没传 open_timeout，底层默认 10 秒。原生 Allow 处理晚于该连接失效，之后的 Allow 不能复活失败连接；用户再次反对反复授权，已停止新连接重试。
- 连续阶段重复原生连接已核到 B-A-T 生命周期：AttachedWindow.close/handoff 调用 Browser.stop，SDK reset 关闭 WebSocket，keep_alive 只保 Chrome 进程。已连 Browser.start 是幂等的；受控实际 Browser/SessionManager/TargetScope 的旧页清除、新页显式 attach 与提前 autoAttach race 检查均在 connect=0/stop=0/private targets tracked=0 下通过。这仅证明可复用，未接入产品。共享连接必须有准备批次所有权，并隔离各 execution 状态和清理，不能只跳过 stop 就冒报所有资源释放；不添加跨任意任务池，不改写现有清理审计。当前新候选仍未发布/正式复跑。

### 2026-09-30 两线修复：原对话支线通过，原主线编译继续修复

- 原需求对话任务 `acf401e3-caed-40d9-8c1b-5d1d753f2194` 的来源选择与用户重试均已保存；revision 5/6 正式校验零模型重放证实 Markdown 反引号被吞进 URL，变成 `%60` 后误报未确认来源。草案短标题没有提交，列表/页头回退为首条请求的 80 字。用户还报告 Composer 双重焦点边框、失败红条与孤立重试图标，已授权一起修复。
- 支线已通过同一任务正式 UI 重试：revision 7 / turn `4b9cd0e4-d8f4-475a-bed3-f4f5420ae344` succeeded，草案 v1 标题为“Example 首页只读验收”；原用户消息、所选来源与四次失败历史均保留，产品任务总数仍为 7。真实审计为 gpt-5.6-terra / medium / 一次调用。草案未确认或执行，不作为主线验收。
- 来源与短标题所属回归 4/4、错误布局回归 2/2、canonical timeline 1/1、API/Workbench 类型检查通过。原 revision 5/6 模型输出不变，在正式解析器零模型重放通过。错误和具名重试现在同组展示，历史失败只读，输入框仅外层显示焦点；深/浅主题和 390px 窄屏无水平溢出。截图：`work/nested-workbench-acceptance-Zh9aHE/side-failure-dark.png`、`side-retry-succeeded.png`。
- 当前回原主线。job `4cff3311-c8fc-4fc7-8d49-46ea8db41570` 实际已经在终编失败；下方“仍在执行”是历史观察，不再代表当前状态。B-U 到达详情不能证明编译、样本、发布或复跑通过。已证实自有适配层 a33 必需就绪读取被裁掉、a6 supporting wait 分类与校验不一致；其它缺口仍待闭合。
- 两处编译缺陷已修：同一 `cad814b6` 原始来源经正式 `recompileHybridSource` 和 `validateSelectionFunctions` 得到 16 个节点，保留 `selection-a-0033` / `s-a-0033` / `s-a-0034`，选择来源与绑定校验通过，a6 coverage 误拒绝消除，模型调用 0。原 a35 缺少导航绑定、函数校验失败，a3/a4/a5 无后态证据及原 host-rejected 派生记录仍保留，不将局部通过写为可发布。
- 新采集增加固定焦点布尔值及身份摘要，运行只在新条件声明时读取 focused，旧 target_state JSON 不变；焦点缺失、身份漂移和私有诊断值负例保持拒绝。选择校验现在保留安全宿主错误码，不增模型重试或 guest 原文。读取活性 11 项、CompilerReadiness 8 项、选择注解 7 项、焦点 6 项、TS 固定诊断 1 项定点通过。既有 host-extract、page-identity 和 scroll-consumer 夹具失败已用内存中的 HEAD 原实现复现，属于基线失败，未扩大本轮修复范围。API 类型检查、fork 来源校验及 diff 检查通过；未运行根级/全量测试。
- 同一原任务正式 UI 重新准备 job `283a7808-88c0-4c22-8f67-b08be2f87ab9` 已受理并即时显示提交状态，但在浏览器启动阶段失败（actionsStarted=0、modelCallsStarted=0、无编译调用）；诊断为 `hybrid_runner_failed` / `cleanup_close_protocol_timeout`。没有 final/draft/sample/release。当前项目专用 Profile 的 SingletonLock 指向遗留 Chromium PID 25025（10:00:41 启动，PPID=1）；持久 Profile 复用锁冲突是强匹配机制，尚需关闭后验证，不能宣称已证明唯一启动根因。旧租约无法证明当前清理归属，未杀进程或清锁，已请求用户明确同意只关闭此专用进程后继续。截图 `work/nested-workbench-acceptance-Zh9aHE/main-startup-blocked.png`。
- 不新增产品任务、分支/worktree，不改旧来源、对话失败记录或 release，不改变模型路由。主线尚未通过。

### 2026-09-30 阶段嵌套真实验收：prefix 与 V4 正式复跑通过，新准备 final 尚未完成

- **部分通过。** 用户已授权继续实施与真实验收。2026-09-29 的正式 Workbench 新任务 `3adde418-bc7f-4029-a75c-49b624bf8082` 确认 GitHub Issue 需求 v2，以 `langchain-ai/langgraph` / `9046` 开始代表试做；job `ede1384b-0e40-4fb2-8aa4-6c43888a45e0` 的 prefix sequence 3→46 多次采样始终为阶段 `stage-d66f280c217976b3`、内部动作 `s-a-0001`、坐标 `(0,0)`，无假开始/结束或运行成功。代表探索完成 42 个动作与 48 次模型调用（46 agent、2 semantic annotation），字段读取和原生 done 成功，browser run `2ccba16b-1eae-4fb1-8565-2fda2df14f95` 的 primary/bridge completed、cleanup confirmed、`activeResources=false`。
- **该参数化新任务的完整验收未通过。** 来源 `44140aee-fec5-42c7-8cac-4df4c6e4166d` 保留；`a-0023` 在 repository 候选选择处缺少可表达运行时输入的选择绑定，source gap 为 `missing_binding / selection_annotation_insufficient_evidence`，宿主最终以 `hybrid_compilation_host_rejected` 拒绝。未生成 final、draft、sample/verification execution 或 release。正式 UI“只重新编译已保存试做”的 job `c46c94a8-b23a-4c78-818f-d0369bfefb1c` 在 `explorationSessions=0`、`compilationCalls=1` 下复现同一缺口，未启动浏览器。此编译边界不在本次 presentation 修改范围，未修改准入语义来换取通过。
- **当前代码上的 V4 正式复跑与结果 UI 通过。** 从链路工作台运行 Release V4，execution `b3c37d38-dca4-4d9b-89eb-6f1a81848225` completed：19 transitions、22 browserCommands、0 llmCalls，输出标题与正文，cleanup confirmed、`activeResources=false`，专用 Profile 进程已退出。真实 UI 显示 8 个阶段父节点及内部动作、一对开始/完成；动作说明显示输入来源、目标、出口、完成状态、耗时和“本次节点输出未记录”；结果区直接显示单条记录。该复跑确认现有发布链在新展示下可用，不能替代新 candidate 的 final→草稿一致性验收。
- **补救了真实画布视口问题。** 重新准备同一任务时，原 `canvasKey` 仅绑定 task/step，导致首个 prefix 继承旧发布图视口并被裁出屏幕。现在新 authoring job 的首个 build 更新画布身份，同批 prefix/final/草稿/复验/发布/运行保留身份，sequence 不参与 key。所属 6 项回归、Workbench typecheck 与 `git diff --check` 通过；新增 Hook 的开发热更新需重新载入页面，未中断后端准备。重载后的真实 prefix 两阶段完整可见，键盘 Enter 可打开节点说明，浅/深主题和 390px 窄屏下方面板已检查，默认尺寸与原主题已恢复。
- **新的正式准备仍在执行。** 2026-09-30 从已确认的无输入需求“获取第二页首个 Issue 详情”触发 job `4cff3311-c8fc-4fc7-8d49-46ea8db41570`，以新准备记录验证完整展示时序；当前已观察 navigate/wait 两个阶段的真实 prefix，身份、归属与坐标保持稳定，尚无 final/draft/validation。截图保存在 `work/nested-workbench-acceptance-Zh9aHE/`。P4 保持未完成，不能把旧 V4 或 prefix 通过写成全链验收通过。
- 本轮未创建分支/worktree，未提交、未推送、未运行根级/全量测试；新任务失败和旧发布/运行事实均保留。

### 2026-09-29 准备期阶段嵌套 P0-P3 实施时记录（当时 P4 尚未执行）

- **代码 P0-P3 与 P4 静态门通过，真实产品验收未完成。** 先用旧 flat build adapter 固定红灯；随后每个合法 prefix build 在原保存屏障投影可变 `ChainPresentationContent`，final 在样本复跑前封存 presentation 与 executable chain digest。投影异常只在公开 workspace 降级为服务端“未分组动作”父阶段，不拒绝合法 build、不改变 sequence/ACK，也不把 prefix 伪装成可运行链。
- 准备与正式画布现在都只把阶段父节点交给 React Flow；单动作与多动作阶段使用同一结构，真实 nodeId 仅存在于父节点内部动作行。复杂路径只在原父节点内展开，阶段坐标精确消费 `overviewLayout`；prefix 更新、运行着色和展开不移动已有阶段，开始/结束仅属于完整正式链。
- 节点详情首屏现在展示真实动作、目标、输入来源、条件/出口、所选 execution 状态与同 invocation 耗时；没有持久化节点输出时明确写“本次节点输出未记录”。结果展示复用现有 `payload.mode`、`TaskOutput` 与精确输出合同，区分完成回执、空结果、单记录、列表、标量和 artifact；合同身份不匹配、历史合同不可证明或值未通过 `parseTaskValue` 时只保留未解读提示与折叠原始值。
- 聚焦验证通过：contracts 12/12、API 16/16、Workbench 29/29；三个 workspace `tsc --noEmit` 通过，Workbench production build 通过，`git diff --check` 通过。未运行根级/全量测试，也未运行浏览器 acceptance 文件；Vite 仅保留既有大 chunk warning。
- P4 只读前检发现既有开发服务 PID 70671 正在监听 4173/4175；未启动、停止或重载它。SQLite 中无活动 authoring、execution、cleanup、browser run、interview 或旧 execution，浏览器 owner 为 `closed`，且无专用 Profile owner marker。因为创建新任务和占用真实产品浏览器需要新增授权，本轮没有做正式 Workbench 新任务、prefix→final→样本→复验→发布→运行验收，不能把静态通过写成 UI/真实链路通过。
- 本轮未修改 B-U Agent loop、prefix/final 编译语义、TaskChain 节点/边、LangGraph/运行器、模型路由、样本/复验准入或 cleanup；未创建分支/worktree，未提交、未推送，原有失败与 V4 历史记录均保留。

### 2026-09-29 当前结论：B-U 在线编译误拒绝已修，V4 正式运行通过

- **通过。** 新准备 job `31290e49-0ed3-4ce7-80d3-844764eff7e3` 已跨过原失败 sequence 13，B-U 完成 22 个工具调用和 26 次模型调用，在线 final sequence 25，形成 19 节点/18 连线；source artifact `a1deeba0-4878-4f29-838c-6f5d92adda7b`，digest `228562d16d249eb66cbfa626a65b1edb41101080a69a61fec223c6db9936f461`。模型审计全部 completed，没有模型调用错误。
- 样本 execution `9ffd8c7b-c43e-4365-88bd-f9334f55a61f` 与独立复验 `e83d25cd-3e89-47a5-831a-dab6d767163a` 均 completed，各 19 transitions / 22 browserCommands / 0 llmCalls，输出一致，cleanup=confirmed。工作台随后发布 Release V4 `eb5409ff-e3d1-4539-8c0b-6818b485a798`；TaskChain `19a25488-cadb-4042-80da-dc5f5635b4c4` v1。
- **发布后正式运行通过。** execution `52d8ccaa-1347-47ad-8f1b-b3dcc48a7c1f` completed，19 transitions / 22 browserCommands / 0 llmCalls，输出标题为 `Boundary insert: add input to a running run at its next step boundary without cancelling it #9046`，正文已保存；TaskRun 结论为“所有计划步骤均已沿合法控制流完成”，cleanup=confirmed。精确 Profile 进程检查为不存在。工作台当前显示“已发布 V4”“运行完成”，同一图按 8 个业务阶段分组展示。
- 这次真实失败是 **B-A-T 自有在线编译校验错误，不是模型错误**：旧 job `8c036479-d914-4671-868c-492e7dd063d3` 的 `a-0010` 点击后即时观察仍是旧 URL，紧邻 `a-0011` 的 `bounded_postcondition_wait/v1` 已在新 URL 稳定；旧 runtime scope 错把合法延迟导航判成 `runtime_scope_supporting_wait_discontinuous`，最终报 `hybrid_consumer_readiness_boundary_unproven` 并停止 B-U。读节点、选择结果和 12 次模型调用都已正常完成。
- 修正只复用已保存的 supporting wait、顺序、tab、monotonic 时间、URL 后置条件和 proof refs，证明延迟完成观察；不删除 readiness，不吞来源损坏/越权，不增加模型、动作重派、站点分支或第二套编译器。原 rejected artifact `4677984b-1e03-4c13-87cb-5c42160ba4fe` 已由正式 `materializeHybridPrefix` 在修复后只读重放为 12 节点/11 连线并包含消费者。
- 定点验证：`hybrid-read-scope.test.ts` 先以真实形状红灯命中旧误拒绝；修正后与 `consumer-readiness.test.ts`、`access-pressure.test.ts` 合计 19/19，通过顺序、时限、tab、稳定 URL、coverage、clauseRef、proofRefs，以及 failed/stale execution 不遗留 running step 的反例；Python 读取错误码 8/8、专用 Profile 清理负例 1/1、API package check 通过。相关 TS/Python 文件均已收敛到 500 行以内，`classifySegment` 为 100 行。未运行根级/全量测试。
- **仍未完成，不能藏起来：** 其它普通 prefix materialization/proof gap 何时继续探索、何时必须硬停，尚未完成通用错误分类；工作台“重新试做当前需求”点击无即时反馈的现场尚未定因；8 阶段已可读但部分标签仍泛化、横向画布较长；历史 V2 搜索按钮首败、旧启动和旧模型失败的底层原因不可恢复。Windows、多任务和全量回归未测。
- 本轮未创建分支/worktree，未提交、未推送，未清理 checkout 里既有修改。当前开发服务保留运行，工作台保留在 V4 完成页。

### 2026-09-29 历史交接（已由上节实际实施与验收替代）

- 本节保留当时“只写文档、未实施”的交接背景，不再代表当前状态。实际实施、验证和 V4 正式运行事实以上节为准；下方 V2 及更早运行只作历史记录。

### 2026-09-29 主流程已有真实完成记录；正式首跑偶发失败未定因

- **最新正式运行cff34d1b-2c78-451f-8c27-1514d0d454e9完成**，run1a91cbd2-c0c1-4963-8676-421d5360b566：同一已发布V2，24 transitions/32 browserCommands/activeMs29983/模型0，输出标题及1801字符正文，cleanup=confirmed；工作台“运行完成/本次结果”、SQLite与实际执行一致。截图：work/github-corrected-run-gkX8r0/v2-formal-run-completed.png。
- 这次没有修改V2、补节点、替换输出或调用修复模型；临时固定布尔诊断只记录到aria-expanded=true/disabled=false，未复现首跑失败。**不能以本次成功宣布首跑故障已修或全链绝对稳定**；启动06dc、模型ae44的历史底层根因亦未证实。需求对话、在线编译、验证、发布、普通运行已存在完整真实闭环，但该任务不是全新首次一次通过。
- 无活动execution/browser/cleanup后已撤掉临时诊断插桩，natural_effects.py恢复原摘要；最终verifyForkSource=328645776beda12f146f9a4e8462a8a3dc72eaea806d0afe34f54656b4e73d58，git diff --check通过。诊断探针与固定布尔记录仅留work诊断目录，产品源码无DEBUG插桩。未提交、未推送。

- 新准备6320f07d-a641-45d5-8ae8-c15fded197e3已completed/ready：45个原生动作，在线final46，24节点，重复事实0、编译gap0；source23378830-f5d7-4fe3-823c-9ad0b3db97d7关闭，digest155dbf2562785bc4533de7420527f99134d855d4875cf86b72e616356f0a22aa。严格从GitHub首页搜索LangGraph，进入目标仓库、Issues、第二页第一条#9033，得到标题和1801字符正文。
- 自动样本795d23f1-a17f-400d-8380-8b42633a7eb0与独立复验ed19a4e9-3eeb-4677-8288-dab4426b5eaa均completed，各24 transitions/32 browserCommands/模型0，清理confirmed；经工作台发布本地V2，链7cc1e3dd-0595-43ad-81ef-2df380c7c9b8/v1，digest bbaa7067ef9600063dda3282255b02dca267914d02d9f707d02b2a533aac395b。
- **正式首跑d3959bd6-1b6a-41ba-8267-e46fe48be6a0失败，不是全链稳定通过**：run a5905d0f-d693-482f-832d-ead803d79771在首页s-a-0002搜索按钮后报target_state_fact_mismatch；2 transitions/4 browserCommands/模型0，清理confirmed。保存条件是aria-expanded=true、disabled=false，有真实探索前后证据，不因失败删除校验。新临时profile与原正式profile的同一Runner/ManagedWindow最小两步均通过，单次trusted点击、状态false→true；因此首败根因尚未证实。
- 首个诊断临时profile清理回执unconfirmed，已按精确owner/lease调用原ManagedWindow.end确认active=false；第二次原profile诊断正常关闭。探针存work诊断目录，不当成产品验收；临时诊断撤除结果见上。

以下为本轮修正与失败历史，运行中的旧描述以本节最新事实为准。

- 最新活动准备6320f07d-a641-45d5-8ae8-c15fded197e3，服务PID95193未重启（Python逐次新进程），source digest 328645776beda12f146f9a4e8462a8a3dc72eaea806d0afe34f54656b4e73d58。已从首页点击搜索并输入LangGraph，3节点保存；尚未宣称详情/样本/发布/复跑通过。下面ebb/9c为失败历史与修正依据。
- 当前正式新准备 ebb69527-65cd-4f97-8f24-c1052126d83f，服务PID95193，Python source digest f8137ad761948d8587f3470b9e1f798840f2dab6d8b3bc0cb7e47698722256c2；首动作GitHub首页。上次9c已失败，下面均为故障与修复依据，不代表当前成功。重载同时包含主错误/清理错误独立投影。
- ebb69527实际已失败并关闭source c954c9c9-d68b-458d-8af8-abec0ace3d3c：首页精确搜索后确认目标仓库存在，但原生done(false)理由为缺点击索引，未进入仓库，不是编译失败。仅补系统提示的原生刷新/露出目标指引，不加模型字段/主机重试、不强制成功；导入定点检查不作为模型行为证明。现有离线恢复只允许编译阶段且无活动草稿，不能用于9c样本失败，不扩门、不手改source/草稿。
- 9c8012df已结束而非仍在运行：B-U完成40动作并读取#9033标题正文，final41/26节点/重复事实0/gap0，source77d4b7e9-070c-492c-852b-a56078082ddd关闭。样本96f87a0e失败，run f81eb07c在s-a-0022（scroll）开始后停于read_fields_projection_not_ready，模型0、清理confirmed；未发布新版本。源码精确确认把ui_state一律转成“后续值必须变化”，滚动到分页链接并不需要改变链接值。现改为已有同投影前后变化证据才要求transition，否则ready，原动作自身事实校验保留；原source在模型0/DB写0重编译与物化通过26节点。真实浏览器反例与新正式准备仍待闭环。
- 滚动反例已通过真实Chromium差分：同一已保存来源的旧/新编译条件、正式物化后的动作参数；旧条件因链接值不变失败，新条件通过，两边dispatches=1/modelCalls=0/链接原值不变，临时浏览器与server均finally关闭。初版探针误用探索index参数，被普通能力正确拒绝；更正为实际物化参数后才获得有效证据。所属Python3项、TS ready/transition来源1项、API类型检查通过；source digest f8137ad761948d8587f3470b9e1f798840f2dab6d8b3bc0cb7e47698722256c2。
- 当前新准备 9c8012df-931e-4af0-83cb-922f1ce5bd3f，服务PID92997，已从GitHub首页开始并保存首节点；当前源码digest 4a218f226f30fbaba0e9c44a32eb67837eef85c904abf1ee9431245af263b877。前轮ae44d0c7实际失败：22模型轮、16动作、14节点、重复事实0、编译gap0，最后连续6次原生模型调用失败后结束，未到仓库/详情。审计没有保留底层模型错误，不能区分传输与响应格式。当前同一配置的无浏览器结构化探针3.1秒通过，usage100tokens；不把它说成过去6次失败的根因修复。
- 前一新准备06dc52e2在0动作/0模型时失败，仅剩清理错误；原始启动错误未持久化，根因未确认。同一正式 RunnerProcess/profile 的独立启动与六阶段关闭检查随后通过、activeResources=false，未修改/删除profile；不能以探针成功声称该偶发故障已修。
- 已修准备错误投影：RuntimeCleanupRequiredError 的主失败继续沿原安全消息与失败层分类展示，追加清理未确认，不再只报清理。所属投影反例先红后绿，未修改关闭/重试流程；历史06dc丢失的主错误不能追回，偶发启动根因仍未知。本项在9c运行期间仅修改TS错误投影，不中断运行，当前服务尚未重载该文案修正。
- 已发布工作台菜单补接已有 prepare_task，允许从同版确认需求创建新准备，不调用修复模型、不改V1；准备开始但首个build尚未生成时也禁用运行。新增菜单经真实UI触发、即时反馈确认；活动/失败与有/无快照的投影定点检查通过。直接CLI准备请求因同源/工作台边界被拒绝，未放宽保护，最终使用工作台原连接发送。

- aa2ad68c 已完成原生46动作、在线final47批次并形成26节点；source fff56535-95e3-4543-8e25-1238de655d42 关闭。样本86642a1d与独立复验57e066e3均完成，26 transitions/35 browserCommands/模型0、清理confirmed，标题正文已返回。经工作台发布本地V1。**正式运行702b3b12失败，不能以两次验证成功宣布稳定通过**：s-a-0023 读取完成，s-a-0024 的 `[0, attribute_href]` 抛 binding_path_missing；本次模型0、清理confirmed，未保留节点输出，无法精确区分空数组与缺字段。
- 针对该真实反例，共用物化适配 applyReadRequirements 将直接无条件能力消费者的现有绑定路径交给原读取与 readiness；条件分支和整体列表不收紧。初版 minItems/items.required 已撤换，因它会误要求其它未消费行也有href；真实读取器反例先红后绿。现在只验证精确路径，原输出schema不变、ReadSpec/B-U模型字段不变，无新循环/次数。原final来源在内存物化得到26节点，读取与等待都要求第一项href，DB写入0。所属2项与API类型检查通过。
- 真实 Chromium 延迟DOM反例通过：沿已保存编译条件使用原 OrdinaryCapability 点击一次，连续两次读不到必需路径后页面提供链接，原 settle 继续等待并成功读取1项；clicks=1、modelCalls=0。临时profile/Browser/server均finally关闭。此是受控真实浏览器证据，不是GitHub新版本通过。旧V1与失败记录保留，下一步由正式准备入口生成新草稿。

- 纠正上一条运行中描述：983c259d 实际已失败，原生 B-U 完成45动作并读取详情，在线前缀30节点、重复事实0；两条终编误拦截是重复 wait 被当业务循环、未声明空结果分支却强制要求。原失败记录不改写。
- 删除两条误拦截后，同一来源暴露“动作→原生 wait→正式读取”被错误要求直接前驱。本次保留真实 wait scope，仅沿有同 tab/URL 证据的连续成功 wait 接受动作结果；同一 rejected artifact 经原编译、QuickJS、TS 物化得到26节点，无 gap、模型0、DB写入0。这不是浏览器复跑通过。
- 修正无业务输出任务 final 丢失 prefix 先前读取绑定（实际 snapshot/finish 反例先红后绿）；完整 final 失败归编译阶段；失败生成快照不遮已有链路。仍保留原生动作映射、在线保存、源身份检查、QuickJS 和 LangGraph，不做旧任务兼容。
- 最小验证：前述 Python 编译26项已通过；本批 snapshot4项分批通过、consumer readiness4项、工作台投影4项、跨进程在线成功及 final 失败归因2项通过；API/workbench 类型检查通过。修复测试引用已被改名的夹具与旧错误码，未用修改产品规则适配测试。源码清单只更新6个实际改动文件，verifyForkSource=3368dfb07d0b0a6756fcbe62039d2f81460df6e98bd8029426d1124418b8d84a。
- 确认无活动 job/execution/browser/cleanup 后，经原开发关闭入口重载至 PID87048，正式工作台触发同需求新准备 aa2ad68c-02d8-4bdb-8004-b192668b60f6。首步确为 GitHub 首页，已在线保存1节点。尚不能宣称在线 final、样本、发布或普通复跑已完成。

### 2026-09-28 LLM 交互减法已接入；真实任务验证中

- 2026-09-29：job 62ab4bbe-0406-4e1e-8bc9-6f4eeb7476d6 的 B-U 已完成41步，按指定路径进入 #9033，a-0040 字段读取和 a-0041 done 成功，source 6ac23ab3-abb5-4876-89ee-ce5ab1cbacb9 已关闭；最终主机拒绝 hybrid_consumer_readiness_boundary_unproven，尚无样本/发布/复跑。原始 rejected artifact 71170a11-7e53-4750-8508-866bbdbbbd63 保留。只读正式物化入口精确复现：未派发点击有原生 URL/tab 与派发审计，但额外现场采集未完成，TS scope 错误要求额外 url_digest。修正后同一原始产物直接物化25节点，模型0、DB写入0；8项所属边界验证与API check通过，不当成真实复跑通过。
- 无活动job/execution/browser/cleanup后，仅重载原开发入口至PID74092。正式工作台启动同需求 job 983c259d-4947-4755-85b3-03a8a01fc8ce，Python source digest 30f73a34258fb4b73e6baf4e85e13fd296582673e889826880a62e59927edea0。继续在线final、样本、独立验证及正式模型0复跑；不补写旧来源或绕过在线final。

- 2026-09-29：job 978a9267-03ef-4ab7-89a2-a67a0f19610a 实际 failed/preexecuting；点击 Issues 后下一轮观察期间同一 tab/document 的 URL 切换，被自有 scope 误 stop。9步8节点、重复事实0，source 99f77362-ac91-4598-8e8c-8ca81c46f91f 已关闭。修正同一受控 tab 的页面过渡交回原生重观察，不派发旧提议；不同 tab/session 与身份读取失败仍停止。反例先红、所属14项验证通过；尚未证明实际 final、样本、发布和复跑。
- d741b45e 本轮原生 B-U 已完成：33动作，进入第二页首条 Issue #9033，bat_read_fields 成功并 done；source ce2fafee-101b-4962-88d4-cdcf193e1e25 已关闭，保存实际标题/正文。准备仍失败，未发布/复跑：a-0015 分页 navigate 的目标同时来自“2”和“Next”，旧唯一路径绑定拒绝，选择 Function 又仅支持 click；未消费分页读取被 final 裁去，连带 a-0010 readiness/Function 连接拒绝（rejected artifact dafbb5e6-7427-4953-8fc0-d35a4962ccbe）。
- 补齐现有 Function 的导航输出接线：模型仍只返回 source；宿主以真实候选/实际导航 URL 组样例，复用原 QuickJS，函数输出 URL 给原 navigate。不会放宽旧唯一路径规则、固定样本 URL 或新增运行器；已有输入/常量绑定不再问模型，只有同一 href 的继续查询仍留给原 repeat 绑定。真实来源的内存反例（受控程序、模型0、DB写入0）已得到0 gap和23个物化节点，不当成真实复跑成功。
- 此接线相关 Python 16项分批通过（初次遗漏 digest import 已修复并定点复验）、TS选择请求5项与来源/物化5项通过、API类型检查通过。初始构造回归遗漏事实摘要更新不算有效红灯，修正夹具后才复现“导航不生成函数”；实际来源探针保留 Python canonical 字节，避免 JS 往返导致数值摘要变化。fork digest f54f5a2d26a11a59405ad11a8cf107250a7c1788f35a9386914f324a0cc17696。无活动 job/browser/cleanup 后仅重载原 npm dev 实例，准备正式 UI 再验。
- d4b34548 实际已 failed/preexecuting：首页搜索完成、5节点/745436字节/重复事实0，但 a-0006 错误索引在派发前被我们误判为致命来源错误，B-U 被 stop。来源 ea75e638-f2e7-4acf-8fb5-58587ab70ce6 已保存并关闭；未进入详情、验证或发布。
- 仅修正同一已核验文档上的无效模型索引：使用已有 ObservationRefreshRequired，由原生 Agent 重新观察，不派发旧索引、不加模型/次数/恢复循环。真实 callbacks→collector→scope 反例先红后绿，连同原错误/取消边界共7项通过；文档身份/来源保存失败仍停止。fork digest cc35ce07c69fbeb247887eadd16516646d5083d8a53bab3ffc0867362bf2f427，清单与 diff 检查通过。
- 确认浏览器 idle/cleanup=false 后，正式 UI 启动同需求 job d741b45e-27dc-46e0-8004-350773fbd287，正在实际验收；尚无完整复跑结论。
- AGENTS.md 增加强制约束：减少 B-A-T 自增的模型调用与模型必填字段；在线节点、必要读取和人工接管不能随之删除。
- 删除完成 judge/同 Agent 追加任务、模型反馈中的 DOM 祖先注入；实际探索不再注册 bat_validate_selection。保留旧工具注册仅用于旧来源精确重建，不是新探索入口。
- 动态选择复用现有 annotation，在动作后现场仍开着时生成一次；仅 source 一个模型字段，代码组装真实样例与绑定并使用原 QuickJS 检查。失败按动作键记住，不在后续快照或终态重复问模型。单例控件继续确定性生成。
- 普通编译 gap 保存后继续原生探索；删除下一动作编译依赖闸门。最终有 gap 仍拒绝发布；身份/权限/协议/保存失败仍停止，不能说任何异常都能继续。
- 原 job e50ab706-4f6d-422b-825e-e17945e00ee3 实际 failed/preexecuting：到第二页，但五次合法第一项函数被自动逆序样例拒绝，未进入详情。删除逆序后五份原请求均经正式 QuickJS 返回 valid=true/ordinal1（原候选25项）；未改数据库。
- 29 项所属 Python 回归、3 项跨进程在线/物化验证、API 类型检查通过；均不替代真实浏览器验收。源清单核验 digest e4bcb7c667485f5c6ad40de995fb797de9a8f1af1172d9226dc976335e0ed77c。
- 无活动任务/浏览器/cleanup 后通过 npm dev 原入口重载，PID57708。工作台正式“重新试做当前需求”启动同需求 v2 的 job 387ad9bb-9ef6-4da1-84b9-531875872e0f；当前从 GitHub 首页执行并在线保存节点。详情、样本、发布与模型0复跑尚未确认。
- 上述 job 后由执行方主动取消：实际已进入 Issues、在线生成了仓库选择函数，但原生分页查询有11条结果而模型仅收到计数（删除整个 enrichment 错把必要结果交付一起撤掉）。历史快照保留，非成功。仅恢复原生 find_elements/search_page 原文的一次性消息交付，没有恢复 DOM 结构注入；真实 a-0029 经原 MessageManager 证实原文完整、内容不变、额外 DOM/LLM 调用0。
- 同时删除候选分组里的 class 完全相等条件，改用已验证 CSS 查询成员与原 DOM 父子归属，复用原遍历器；selected/visited 样式反例与消息交付先红，7 项相关验证修正后绿，跨组/同项多目标仍拒绝。新 digest 64a8e150156985ac2daec52d8040ffc0e24aa33382ba5bf4ddce369ff7cbd2c1。确认取消后浏览器 idle/cleanup=false，正式 UI 继续同需求，新 job d4b34548-c296-496c-8fb5-58587ab70ce6，Python 新进程加载；尚未宣称实际主线通过。

以下记录为历史阶段；与本节冲突的“点击前必须让 B-U 写函数”“逆序验证”“前缀 gap 立即停止”已废止。

### 2026-09-28 选择规则纠偏；实际验收继续中

- 删除上一轮“序号/数量必须变化”和“单例必须换内容”的错误要求；辅助示例可选，真实候选执行、schema、ordinal 归属、逆序包装、来源绑定和沙箱仍保留。修改原工具、原补注入口和原提示，不新建语义模型或重试循环。
- 改写上一轮“所有单例必须让 B-U 编函数”的补救：已有规则优先；完整同文档单例可自动派生唯一性保护，复跑多项时失败。复用原单例证明与 Function/QuickJS，不猜业务选择规则。
- 保存的真实 a-0030 现场经准备准入→attach→编译→TS Function 物化→QuickJS：0 gap、当前唯一项输出 1；额外第二项失败；历史数据库与来源未改。该证据不等于实际浏览器复跑。
- 定点验证：选择请求/原选择物化 8 个 test method，Python 准入/诊断幂等/补注 5 个通过，API 类型检查通过。诊断重复追加修复继续保留。未跑根级全量测试。
- fork digest `0b9ca221312a937e662a81339c3af0821210a2221857251732b725c69e255d2e`。核对无活动任务与浏览器占用后，通过原 npm dev 入口加载修复，PID38063，4173/4175，历史数据保留。
- 正式工作台同一需求 v2 的 job `82bdbd3b-6d9b-480d-8c7a-5ac36a39dec6` 失败：sequence15、8 节点、1198702-byte 包、重复事实 0、编译 gap 0；B-U 在搜索页连续 5 次收到 `selection_function_request_invalid` 后退出。原 source `fdb6d985-6e06-41b0-8cf3-62b411a36939`，closed=true；未完成详情读取、验证、发布和普通复跑。
- 保存的原始调用证实：最新读取 a-0009 返回空集合；工具却把宿主 candidates.min(1) 拒绝解释为“改函数/示例”。最小修正于原工具返回 `selection_candidates_empty`，明确重新查页面；禁止使用更早非空读取、不改函数校验和编译门槛。新增所属回归先失败后通过；原 a-0010～14 的真实调用全部通过修复后的工具返回准确反馈且不发验证请求，不改历史来源。
- 空候选修正后的 fork digest `08bc7593c6bb92b722eb26504bead72a04ae6027421d556e03f81c7c1a391850`，来源核验通过；浏览器 idle/无 cleanup 后从工作台启动 job `e50ab706-4f6d-422b-825e-e17945e00ee3`，真实首动作到 GitHub 首页。Python 新进程加载，无须再重启服务。详情读取、验证、发布和普通复跑尚未通过。

上一轮 job `dcc00d96-3d4f-4d18-89bf-bfcdc8fa7094` 已失败并关闭，source artifact `9f3015c4-42dc-4c2d-83f7-f28105461a85`。直接停止原因是 `hybrid_compilation_payload_limit`；32 动作来源有 2611 个同观察重复事实。另有 maxItems=1 与强制变化校验的矛盾。两项已在原位置修正，旧失败不重写。

### 2026-09-28 唯一候选证据丢失已修；继续原任务实跑

删除 `PreparedSelections.before_dispatch` 的单例提前返回及其专用判断：queryCandidate 点击统一消费并保存原校验工具的规则；无规则、规则属于别的读取或 ordinal 不匹配时，在实际点击前使用原 `SelectionMethodRequired` 拦住。编译与运行器不放宽，也不新增重试。

- 新回归先复现 4 个失败子场景，修复后连同原 attach/编译不变量共 4 个 test method 通过。初版夹具遗漏同文档事实导致没有触发旧例外；补齐真实模式后才获得有效红灯，不把初版通过当证据。
- 原失败 a-0030 的保存前态重新进入真实准入函数：无规则被点击前阻止；匹配内存探针规则被保留。仅证明准入修复，不向原 trace 补事实，不把旧失败改成功。来源清单校验通过，fork digest `a7a41dce7df0986213b16dae9e89e56772ab77d71c2d8ca1d7da19d3008f7625`。
- 通过真实工作台“重新试做当前需求”启动 job `dcc00d96-3d4f-4d18-89bf-bfcdc8fa7094`，沿用 v2/revision5。Python 每次任务新进程加载已校验源码，本轮无需重启服务。当前真实执行从首页开始，在线生成中；详情读取/验证/发布/正式复跑尚未完成。

### 2026-09-28 拼写边界已改；正确测试词真实重跑未通过

用户已授权将测试词明确改为 `LangGraph` 并重跑。现有访谈 Skill 与 B-U 提示补充：识别错词为增强能力，不新增纠错门槛；有依据则解释差异，未经明确纠正不静默替换，不借纠错改变路径；未命中结论仅覆盖实际查询和已检查范围。没有新增模块、模型、词典或重试循环。

- 所属 `interview-instruction-handoff.test.ts` 5/5 通过：保留原始错词与明确纠正，新确认草案采用正确词，旧需求版本不改，首页与原顺序继续保留。夹具只证明交接约束，不证明模型必然识别所有拼写错误。
- 已核对本实例无运行中任务、浏览器 busy/cleanup 均为 false，通过现有开发入口仅重启本项目实例加载提示，数据不清理。当前 PID16418，端口4173/4175。
- 原任务 `a81d8a80-50ae-48aa-a06c-558ccf08f76a` 从真实工作台需求对话提交“LangGragh 纠正为 LangGraph，其余不变”，真实模型生成并经 UI 确认 v2/revision5；首页搜索 → 仓库 → Issues 默认列表 → 第二页首项 → 详情标题/正文完整保留。原 v1 和首败不变，没有注入节点或数据库结果。
- 本次从画布“生成草稿”启动 job `aedbccd5-877f-4cb6-8009-5153ac4e7771`。实际依次执行：首页、搜索框、输入 `LangGraph`、提交搜索、点击目标仓库、点击 Issues；最后观察 URL 为 `https://github.com/langchain-ai/langgraph/issues`，读到 11 个分页链接。没有直达仓库、没有进入第二页详情，没有标题/正文输出。
- 在线快照从 1/2/5/7 节点增长到 sequence32 的 17 节点。原失败点击 a-0006/a-0010/a-0021/a-0024/a-0027 均未进入节点图；这只证明本样本失败尝试过滤，不代表剪枝或复跑验收。UI 截图位于本地忽略目录 `work/github-corrected-run-gkX8r0/compilation-failed.png`。
- 本次 **failed/preexecuting**：最后前缀唯一 gap 为 a-0030 的 `missing_binding / selection_function_evidence_required`。原始 source/v3 artifact `d3ee8809-04ca-4aa2-8528-745b0726191d`，digest `61a812209615156694624d28b802918e556b9c3ca2bc2f9e3e2cf3ae8d24b6fc`，closed=true。未进入样本验证、独立验证、发布、正式复跑，不能宣称主流程完成。
- 只读诊断已用同一注册表对保存前缀重编译，完全复现同一个 gap。最小探针确认 `nav a#issues-tab` 完整唯一匹配：`PreparedSelections.before_dispatch` 命中 `unique_query_target` 提前返回，不记录选择事实；`bind_selection_function` 对相同点击仍强制要求该事实。是探索准入与编译准入不一致，不是本轮拼写提示造成。即使内存探针放入匹配的已验证规则记录，该提前返回仍不记录点击；探针不修改历史或补写真实证据。
- 诊断初次脚本把 gap 字典误当模型对象、其次使用默认 Tools 产生额外注册表不匹配，均不作为根因证据；改用正式 `author_tools_for_result_spec(..., selection_methods=True)` 并核对 schemaDigest 后，得到与真实运行完全一致的唯一 gap。未改选择器/选择编译逻辑，未自动开启下一次任务；后续应先修这个通用不一致并锁定回归，再验证完整主线。

下方“待用户确认改词”为历史状态，本轮已获得明确授权。

### 2026-09-28 明确要求保留与来源确认修正；继续同一 GitHub 实际任务

任务 `a81d8a80-50ae-48aa-a06c-558ccf08f76a` 从工作台实际需求对话进入。用户要求 GitHub 首页 → 原样搜索 `LangGragh` → 仓库 → Issues 第二页首项 → 详情标题/正文，不允许用调查所得仓库 URL 跳过前置动作。本轮授权修改后继续该任务，普通确认由执行方处理，不再把非阻塞选择交回用户。

- 最小改动：Skill/原 prompt 按项区分明确要求、事实调查、技术未知、重要取舍和委托；同一草案写“明确要求/可自行决定”。现有来源工具新增随草案确认模式，引用仍严格校验，确认前仍为 open；同轮可保存起点与目标依据，不新增模型或第二套计划。原始用户消息随同版需求事实进入 B-U，最新明确修正优先，其余要求不能因摘要遗漏而消失。历史需求不补默认字段、不重写 digest。
- 来源门只允许真实来源完整 URL 或由其推导的同协议/主机首页；不允许任意同站深链、查询或跨子域名。修正中文标点紧接 URL 被吞入链接的问题。原数据库无题板来源约束同步支持经引用核验的唯一候选，未伪造用户已答题事实。
- 定点验证：新交接/确认测试覆盖明确、模糊、混合、委托、纠正与旧版不变、伪造引用拒绝、失败不落半成品；这些使用模型夹具，只证明合同接线，不证明真实模型普遍理解正确。现有来源与草案交接共 28 项分批验证；另新增首页推导反例通过，API 类型检查通过。旧离线首编译测试改为缺在线 final 必须失败，原保存/关闭事实及禁止离线回退仍受保护。未跑根级/全量测试。
- 真实证据：第 3 轮模型实际生成的草案保留原字面输入、首页与完整操作顺序，但首次因首页引用的旧门被拒绝；记录不改。第 2 轮题板自动提交时 UI 输入只记录了“继”，该不完整补充未当成完整要求，后续仍依据初始原文与真实选项。此时未启动 B-U，不能声称浏览器已走错或已完成。首页门修正后第 4 轮继续原消息，未注入草案、节点或数据库事实。

实际第 4 轮草案已通过 UI 审阅并确认为 v1/revision4，正式需求保存原始用户消息；真实起点 `https://github.com/` 沿仓库来源 resolutionId 追溯。之后从画布“生成草稿”启动首个准备 job `640cac06-8395-431e-891e-91f00bcf4852`：

- 执行中 UI 实际显示“打开页面 → 点击目标 → 输入内容”，API/SQLite 同时保存 prefix sequence3 的 3 节点/2 边；后续增长到 sequence9，7 节点/6 边。证据截图：本地忽略目录 `work/github-issue-interview-Mq8ynv/online-prefix.png`。这是在线生成事实，不是这些节点已可复跑的验收。
- 不可变实际来源确认 a-0001 navigate 首页、a-0002 点击站内搜索、a-0003 input 字面 `LangGragh`、a-0004 Enter，到达 `/search?q=LangGragh&type=repositories`。随后按现场查找目标，a-0009 done(success=false)：B-U 报告当前 42 个搜索结果中，所查目标与组织链接均未找到，未擅自改词、直达或换仓库。
- 首轮准备 **失败**，未进入 Issues/第二页/详情，没有标题正文产物、没有 final 编译、发布或复跑；不能说主流程完成。来源 artifact `18b0768a-d0c5-46d8-89f1-79c5b6c1748e`，digest `74bd99b42ab2f0881fcafd4e716917c16694822c5550b6b3538e2cf6ca34b051`，保存关闭事实 closed=true。UI 保留失败与 7 节点快照，截图 `work/github-issue-interview-Mq8ynv/search-literal-blocked.png`。失败不能归因于节点转换失败，也不能证明所有搜索结果/其他页绝对没有目标。
- 下一步需要用户确认是否把搜索词修正为 `LangGraph`；已发出具体选择，不在授权前改词或恢复执行。若允许，在原需求对话记录明确修正，形成新确认版本，从首页依照原路径继续，保留本次首败。

所有既有 dirty 改动保留；未新建分支/worktree、未提交推送。开发服务仅重启本轮拥有且无活动任务的实例，数据与历史保留。当前服务 PID9070、端口4173/4175；原工作台保留，产品浏览器已按 owner 关闭。

### 2026-09-28 在线生成主路径已接通；真实新任务首次验收未完成

用户已授权按[开发文档](INCREMENTAL_NODE_COMPILATION_20260928.md)实施。本次已接通 A 共用编译/物化、B 正式回调与保存确认、C 现有画布投影。此前依赖刷新与文档改动保留，未建分支/worktree、未提交推送、未启动产品服务或真实网站任务。以下受控验证不等于真实新任务首次通过；后面的“实施未开始”等段落为历史。

- Python 继续使用原生 Agent 回调：实际动作采集完成后对不可变来源快照编译，TS 校验并保存 job 后才 ACK 放行下一步。无动作的原生 LLM 错误不生成假节点、不阻断原生重试；已派发失败不能跨越并拼出假成功。消费者后态与重复方法的等待严格分类，无补证重试循环。
- 最终完整编译在原 author 返回/关闭前经同一通道保存；正式新任务消费已保存结果，禁止缺结果时自动离线补编译。最终原来源留档、关闭确认、样本/独立验证和手动发布边界保留；显式离线恢复不变。现场业务歧义仍回需求确认。
- `job.authoring.build` 保存一份当前快照；最终步骤产物留原 artifact 引用。重复、错序、错误 owner、保存失败、取消期间异步校验及人工恢复先后顺序均有检查，不新建数据库表、队列或调度器。
- 现有画布展示已物化节点，沿用节点卡片/详情；状态仅“正在生成节点”。生成片段不可运行/编辑/发布，不混入旧 execution；进入样本/独立验证后不再投影生成片段，由正式草稿和本次运行接管。按 job/步骤使用稳定画布 key，不随批次重挂载；此点有源码与组件证据，真实挂载后的视口/选中保持尚未验收。

验证回执（仅所属用例，未跑根级/全量测试）：

| 范围 | 已通过的证据 |
| --- | --- |
| Python prefix/原规则 | 方法来源 4、prefix 4、capture 3、author 在线 4、原 callback stop 6、ACK 控制 4；另有读取活性/已派发失败/重复折叠/辅助 wait 的定点用例 |
| TS 编译边界 | `hybrid-prefix` 2、`hybrid-selection` 4；原数字词法离线注解选定用例 1 |
| 正式 authoring 接线 | `online-compilation` 1：真实 Python 子进程/fd3/stdin、原回调、真实编译/物化/SQLite，产物进入原普通执行器；覆盖保存失败、并发取消、重复、同批 ACK 与下个检查点、人工恢复及业务歧义。来源与浏览器能力是受控夹具，模型 0，不是真实网站 |
| 原收尾/离线边界 | `hybrid-authoring-final-close` 4、`preparation-offline-compilation` 4 |
| 展示 | `chain-build-projection` 3、原 `chain-canvas-readonly` 3；纯投影/SSR，含无正式草稿时的原人工/失败入口，不是实际浏览器交互验收 |
| 上界代表样本 | 500 个读取动作/1000 条观察，整包 5,610,341 bytes，Python 677.7ms、宿主物化 425.6ms；500 节点/499 连线，低于 8MB 与本样本 10 秒确认预算。不代表最大字段、最多 Function 样例或所有机器 |
| 静态/来源 | API 与 Workbench package check、受管 fork 来源清单核验通过；最终 fork 摘要见 RESEARCH |

首次失败/修正保留：抽取类型遗漏；测试夹具 UUID 未走生产 JSON 入口、输出 schema 与原来源不符；prefix 使用 Zod 补默认值后的计划造成身份不一致（改回与完整路径相同的原 canonical 计划）；ACK 未及时释放旧槽导致同批下一检查点超时（发送 ACK 前释放，并按事件身份清理，禁止旧 finally 清掉新槽）。收尾检查修正生成片段未在验证阶段让位给正式草稿的问题；新增工作台 SSR 夹具首次缺生产 Theme，补同一提供者后验证。另有 unittest 类名和最终检查脚本名输入错误，均属命令发现失败；按仓库真实入口修正后通过。未以放宽来源或自动重试解决这些失败。

下一门：用户确定低风险真实任务后，从需求确认开始记录首次准备、首编译、样本/独立验证、发布及普通复跑；同时实际观察逐步增长、视口/选择保持与刷新。Windows、极端 Function/字节形状、D6 多步骤/each 和正式运行自动转人工的旧缺口继续单列，不以本轮受控通过关闭。

```text
Product Alignment:
- natural-language task: 同一已确认浏览器任务在代表执行中及时生成可复跑节点。
- reusable chain boundary: 现有 PlanStep 的参数化链路。
- runtime inputs: 同版需求/计划、输入合同与代表输入。
- dynamic task outputs: 原结果合同及真实读取来源，不固化代表值。
- generic platform capability used: 原生回调、共用 hybrid 分类/物化、job 快照和现有画布。
- replay model calls: 普通节点 0；prefix 纯计算 0；显式 llm 规则不变。
- site/task-specific code added: no
```

复用评估承接 RESEARCH，本轮不换库。`codebase-design` 用于共享原分类/物化边界；`ui-ux-pro-max` 仅用于复用现有卡片、稳定 ID 与最小状态，不做视觉重构。CodeGraph 工具在本会话不可用，使用文档已定位源码。

### 2026-09-28 边执行边生成节点：设计矛盾已修正，实施未开始

用户明确优先稳定主逻辑，展示仅保留现有画布增长和一句当前状态。已按当前 `1e9d635d7e86` 源码修订[最小实施方案](INCREMENTAL_NODE_COMPILATION_20260928.md)：原始动作事实不变；每步用同一编译规则重算有限前缀，原子替换一个可更新生成快照；最后完整装配，不重新探索。撤回旧版“生成节点永久冻结、终态只能接边”的限制，因为现有读取裁剪/消费者重绑/重复折叠会合法改变派生节点。同步修订 ADR 0012 与架构基准的在线时序，不降低来源留档、关闭确认和正式验证门。

两项纯函数定点探针通过：同一来源可确定性更新同 ID 节点的 consumerRef 而不改原事实；未完成来源可复用局部读取分类，但完整编译仍严格拒绝。第二项首次仅因测试导入路径缺项失败，修正入口后通过；另一次八项测试批次缺终态回执，不计为通过且未重跑。精确命令与边界见 RESEARCH 顶部。未启动服务/浏览器/模型、未修改生产实现或任务数据，原依赖刷新 dirty 改动保留。

后续顺序已明确为 A 共用 prefix/final 规则 → B 正式回调/持久化及在线结果消费 → C 最小展示与新任务首次验收，不再把路线选择推迟到 G0。在线接线、最大前缀性能、真实首次准备/复跑仍未验证；两项局部探针不等于整条方案已通过。不新增探索树、路径剪枝、类型子链、进度面板或编排基础设施。

### 2026-09-28 本机依赖刷新完成；主流程核对不等于新增真实验收

AI Connect 已从 clean producer `82f28e6d` 重新构建并安装，三包 manifest/lock/release 一致；25 个旧 tgz 与 8 个未跟踪上游原样残留移入忽略的 `work/vendor-cleanup-20260928-uZFO6N/`，可恢复，运行所需 Python fork 保留。首次 setup 发现最新提交中的 `author_action_helpers.py` 与来源清单摘要不符：本地源码与 HEAD 完全一致，196 项仅此一项不符；只修正 LOCAL-CHANGES 元数据，未放宽校验或修改 Python 源码。

受管 uv/Python 更新后 `setup:check`、API check、Workbench build、31 项所属测试通过；包括生产 Python 编译到 TS/LangGraph 的受控链路。未跑全量、未启动产品服务或真实网站任务、未改任务数据/Profile、未提交推送；producer 源码保持干净。npm audit 的 Hono 传递安全告警与 Vite 大 chunk 告警单列保留。

主流程已有下方记录的真实重试闭环，但全新任务首次验收、正式异常自动转人工/安全恢复和 D6 多步骤范围仍未闭合。本机没有下方真实验收的原私有 work 证据，不将仓库记录说成本轮现场验收。详见[依赖刷新与主流程核对](DEPENDENCY_REFRESH_AND_MAINLINE_AUDIT_20260928.md)。下方“提交推送并关机”等为当时授权，不延续到本轮。

### 2026-09-28 当前结论：常用 Chrome 的同发布任务正式复跑完成，准备提交推送并关机

最新授权：用户已完成常用 Chrome 京东登录，要求重跑；完成或再次阻塞后记录、提交全部代码到远程并关机。这覆盖下方历史“不提交/不推送/不关机”说明。

- 从真实工作台设置每节点3000ms并单次点击“开始运行”，同一 Release `e64e7365-340c-42b9-8cbf-b3e9a396fc72` v1/digest `4499f80422e8d1f60c0f2ea72ad1a7e6f4782c12026f3eb443469195f43cbad3` 完成。execution `3da5ada2-ebcd-458b-83ba-27e627213b00`，TaskRun `282e2ce8-a69c-42de-8d73-63bb2983e950`；9个节点、9次浏览器命令、模型0、auditComplete=true。9次节点启动前实际等待3004–3017ms。
- 当前收藏实际2项，名称均为页面原文“此商品已删除”，链接分别为 `https://item.jd.com/10029362573415.html`、`https://item.jd.com/64574710601.html`；未补造5项或已删除商品的原名。工作台实际显示两条名称和完整链接。
- 本次B-U使用用户常用Chrome153，空白门实测webdriver=false、仅1个所属任务页、原有3页URL摘要未变。正式执行cleanup=confirmed，结果窗口handoff=active/delivery，owner `3143305f-b53b-4fed-8b55-49e30e0afb8d`。API从PID23788重启至10020后，同execution、release、结果、cleanup和交付租约仍存在，UI刷新显示相同结果；重启未派发新运行。
- 先前execution `c58dde32-094d-418b-823e-fa38d5671e1d` 的 `function_output_invalid` 失败永久保留。其任务页已关闭但清理未确认；从UI“重试清理”以原owner只读核验，attempt2 confirmed、handoff ended、业务仍failed。外部Chrome收尾补有界目标消失核验；清理恢复要求同owner、控制器已退出、其余阶段确认，禁止重复清理和把待清理业务结论改为取消。
- 早先常用Chrome现场已观察到 `passport.jd.com/new/login.aspx`，webdriver=false；用户完成登录后本次复跑成功。不能把webdriver单独认定为此前京东风控的唯一原因。
- 本轮API类型检查最终通过；cleanup所有权/退出证明/活目标/重复请求/取消边界8项定点探针通过；真实UI恢复、正式运行和重启持久化通过。未新增tests文件、未跑根级或全量测试。本次没有验收所有网站、验证码分支或任务删除；不把该样本成功扩成整个迭代全部通过。

证据：`work/human-existing-chrome-formal-retry-proof.json`、`work/existing-chrome-restart-proof.json`、`work/existing-chrome-cleanup-recovery-proof.json`、`work/existing-chrome-cleanup-guards-proof.json`。Cookie/Profile、原始页面及work/data材料不入Git。首次失败单列：原生CDP确认超时3次、诊断脚本UUID严格类型错误、Node诊断脚本CJS顶层await、诊断读取遗漏TS runtimeScopeFrom解析、后续导航URL不符、API类型入口漏扩内部action union；均保留，未覆盖旧正式首败。UI驱动先把上下文区当dialog、重启后过早点击未加载按钮、证据查询误用完成后的空currentRunId也已记录；这些探针未派发额外正式任务。

### 2026-09-28 当前推进：B-U 接入常用 Chrome，同发布链路设 3 秒间隔

用户已开启并确认 Chrome 原生 Allow。保持 browser-use + workflow-use，新增本机外部浏览器连接和本次任务标签所有权适配；既有发布版本不改，使用现有节点 pacing=3000。API 类型检查、四项协议边界探针通过，尚不代表浏览器任务通过。首次空白验证在诊断连接阶段遇原生确认/握手超时，未进入生产 Runner、未访问京东，保留 `work/existing-chrome-smoke-proof.json`；正在完成真实空白隔离/清理门，再从工作台提交同发布任务。原正式首败仍保留，未新增测试文件、未运行根级/全量测试，不关机。

### 2026-09-27 浏览器环境差异已实测，京东风控具体触发条件仍未确认

针对用户要求解释 BrowserSkill 可访问而当前路径受阻，直接调用现有两个生产启动入口，在同一临时 Profile 的空白页各实测一次：准备/验证实际选择 Playwright Chromium 134、webdriver=false、视口2544×1292；正式 ManagedWindow 选择系统 Chrome 153、webdriver=true、视口1249×1277。定位到当前集成的浏览器环境漂移；旧 BrowserSkill 使用扩展控制日常浏览器，与当前独立 Profile 不同。证据 `work/browser-environment-comparison-proof.json`，两次清理 confirmed、模型0、没有请求京东。首次 get_args 配置探针遗漏 user_data_dir 已如实保留。

详见 RESEARCH 的同日实测记录。浏览器版本/启动参数/尺寸变化已证实，京东具体风控规则仍未证实；失败窗口已关闭且缺拦截页证据，不把 webdriver 差异冒充唯一原因。继续沿 browser-use + workflow-use 统一验证和正式运行的浏览器环境，保留迁移方向。本轮没有改生产实现，正式主线仍未验收。

当前开发入口为 [基础设施与主线开发方案](INFRASTRUCTURE_MAINLINE_DEVELOPMENT_PLAN_20260927.md)。架构边界以
[自然语言浏览器任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md) 为准。

## 当前状态

### 2026-09-27 当前正式首败：用户报告反自动化拦截，平台未保留人工现场

真实UI已确认发布release e64e7365-340c-42b9-8cbf-b3e9a396fc72 v1/digest4499f80422e8d1f60c0f2ea72ad1a7e6f4782c12026f3eb443469195f43cbad3，从链路工作台点击开始运行；即时反馈显示“正在提交…”且按钮禁用。正式execution643dabd5-d86f-41d9-8487-6848048ef2b3/run3e691c3f-d865-4865-88c8-8d7b4089cacc首次failed，点击s-a-0009派发前报ordinary_target_missing，模型0；先前入口读取及选择成功。该正式首败永久保留，不能用两次草稿完成改写；work/human-formal-run-proof.json。

用户现场明确指出京东反自动化拦截。当前自动证据仅能证明派发前目标不可用，未保留拦截页面证据；不猜测具体验证方式，不将所有目标缺失等同反爬。当前cleanup=confirmed，原失败窗口已关闭，不能声称可恢复旧run。正式路径使用managedWindow，草稿路径未使用；尚无证据把失败归因为headless差异。已停止站点自动重试/选择器修改，检查通用人工检查与安全续接边界；不绕过反自动化检测。

缺口：普通运行只将明确HTTP 401/403/429映射为外部中断；目标不可用时，错误后观察未形成可继续的人工等待，而且含外部写入的节点没有“尚未派发”的恢复证明。后续必须保留同owner现场、核实未派发后才能允许人工处理完重试当前节点，不能用未知副作用的重复操作补成功。正式输出、原窗口交付、重启持久化和删除仍未验收，不关机。

### 2026-09-27 同草稿样本重试与独立复验通过，继续正式发布/复跑

运行时动作结果scope修复后，通过真实UI“开始试跑”产生sample execution d52195cb-384b-4887-8444-2548d87a0d07/run df1082c2-114a-43f9-8c4f-ebc82df67607，completed；再经“开始独立复跑”产生verification execution5dc18463-d430-45e6-895b-7294b4402164/run91ade02b-3acb-42b1-8a09-4d06f7f2cf2f，completed。两次同链8cc06425-cad2-4cee-8afc-20b9367b65c5 v1/digest6fd0208f1475058a04b9ad61157ea7105e61af3c461f10ea15a15a50175e70f0，均9个transition、9次浏览器命令、模型0，清理confirmed，2条结果逐项等于原真实来源。工作台draftReadiness=ready。

证据work/human-sample-retry-proof.json、work/human-verification-proof.json。重启服务使旧试跑弹窗关闭，root第一次查找开始按钮未派发任何任务，随后重新打开并仅提交一次，该UI驱动错误保留。当前开始手动发布，正式运行、原窗口、重启持久化及删除尚未验收；原来源/样本首次失败继续保留，以下失败段落为历史。

### 2026-09-27 当前阻断：UI重编译通过，首次真实草稿试跑失败

真实UI恢复job0446ec2b-672c-4903-8d3e-51b0669c73e6复用保存来源，编译模型0，生成草稿并自动开始样本。run e220d9c0-2913-41c7-817a-4cb828843094完成导航、入口读取与动态选择，在点击节点s-a-0009的后置读取处失败：ordinary_postcondition_failed_read_fields_target_scope_mismatch。模型0、清理confirmed；work/human-sample-first-failure-proof.json及work/human-ui-recompile-proof.json保存首败。

编译后消费者scope固定了试做URL中的动态query，本次实际选中链接不含query；失败终态URL未持久化，保留未知，不猜测页面。当前修复动作结果页面的通用归属，继续保护固定URL、原/唯一新增tab及文档稳定边界。样本、独立复验、发布、普通复跑、交付和持久化均未验收。以下离线整合通过仍只代表其对应阶段。

修复进入真实重试：Python复用原导航协调和StepVerifier，动作仍只派一次；同tab/唯一新tab、无关已有tab、读取中身份漂移、跨轮稳定性及固定URL不放宽12项通过。Root发现双transition一残缺时TS/Python计数不同，统一为先数全部再校验完整，新增该负例通过；work/action-result-scope-python-proof.json共13项，环境路径首次错误另记。fork d4574c5a2b341f96b972bbf9293dc4906498261c17dfd924d3d5dcbc5f656fa8已核验。TS入口原来源接受，消费者/配方/scope/URL证明篡改拒绝；work/consumer-readiness-source-proof.json。API类型检查先后暴露联合类型未缩窄、原始resultRef未边界解析两处问题，修正后通过；原失败不删。未新增公开marker、未改持久IR，下一步同草稿实际UI试跑。

### 2026-09-27 当前断点：真实结果已取得，编译整合与正式主线仍未验收

同一任务215b5b90-f588-447c-afa8-6e66e143a2f2的第三轮job4071fd86-3994-406c-8a61-9df04bbe4aa0完成真实代表试做：当前收藏仅2项，名称均为页面原文“此商品已删除”，商品链接存在；不推断原名。16次准备模型调用、14个浏览器动作。来源67b9f84c-666b-426e-89f6-245020300f4e及原sourceGaps保留。该轮首次编译失败，不能算主线通过，见work/human-favorites-compile-first-failure-proof.json。

已定位并限定修复：无消费者的完整原生探查被错误当成业务读取；现场bat_validate_selection被错误要求离线注解审计。Python离线分类22项、现场选择审计12项、跨语言原始数字词法摘要4项检查通过。来源分类只接受真实只读回执、同文档证明和无执行消费者；不扩大业务读取上限，不补造缺失事实。TS独立守卫与实际createHybridArtifact整合尚待完成。

独立审查确认当前输出、派生count、空列表分支、摘要和循环继续条件均不能把无verified read的裸探查偷偷变成执行依赖。此前真实通过的按钮55条与滚动62条来源各离线重编译一次，节点、控制流、结果绑定、循环及覆盖记录均与原产物一致，模型0、浏览器0；证据work/discovery-existing-source-crosscheck.json。这仅覆盖两份既有来源，不能作为其他任务或主线验收。

下一门依次为原来源通过TS整合→实际UI重新编译保存来源→样本与独立复验→手动发布→普通复跑真实输出及模型审计→持久化。当前仍未发布、未正式复跑。原人工恢复后的首次失败、第二轮未知焦点切换失败及第三轮首次编译失败分别保留；以下首败段落为历史过程，不代表当前最新断点。

本阶段随后完成：TS独立守卫18项通过，包括有执行消费者、回执/身份缺失、覆盖证据不符和同URL换文档拒绝；work/query-discovery-ts-proof.json保留探针首次默认值补入导致来源不匹配、负例错误码断言过窄两项探针问题。实际createHybridArtifact使用原job候选计划、原来源与原模型审计通过，9节点、原sourceGaps仍为1、新编译gaps为0；work/human-artifact-integration-proof.json。API check首次因内部查找返回值泄漏到公共assertFact类型而失败，修正为原void合同后重查通过；限定diff检查通过。当前已通过离线整合门，下一步真实UI恢复编译及后续验收。

### 2026-09-27 通用人工介入：真实UI人工恢复通过，后续准备首败修复中

用户指出旧京东样本仅证明手工组装链的暂停/恢复，未证明登录后任务完成。该结论采纳：第4项不能视为通用人工主线已验收。用户已明确授权新真实样本读取京东收藏商品前5项名称和链接；空列表/不足5项按实际结果返回，只读。

本次代码补齐：Browser-Use固定工具bat_request_human通过原Agent的on_step_end暂停；Node/Python既有fd3请求协议增加受限人工通知和继续请求；job.waitpoint持久化，工作台显示说明与“我已处理，继续”；同job/等待ID/sequence核验后才提交恢复。Python核对原session/tab/允许站点及目标URL；条件不满足仍等待。人工输入前卸载事件监听器，不记录密码、验证码或把人工动作编成自动动作。成功恢复的宿主事实经原来源与摘要校验，编译成既有browser.wait-for-human与原TaskRun恢复合同，没有网站源码分支。

最小验证：Python18项受控SDK/编译/隐私边界；产品状态11项及组件/连接4项；真实RunnerProcess/fd3及Python编译到TS守卫11项通过，均模型0、无真实浏览器，不能计业务验收。API/Workbench package类型检查通过。首次API两次接线失败、跨语言探针的清理回执形状错误与request取值错误已保留于work/human-integration-first-failures.json及对应proof。

真实UI推进：前台工具会话启动当前源码服务及持续存活的UI客户端后，经工作台需求对话、Question Panel、草案确认和“生成草稿”创建任务215b5b90-f588-447c-afa8-6e66e143a2f2。准备job d2259771-bc7a-4879-8b2d-9768bb640ec0自主调用bat_request_human，持久化等待点a386e266-1efb-4f94-9035-f0df35c88540（最初sequence 22）。实机发现人工等待入口误显示输入请求且未展开说明，修正前端后通过原UI确认“处理人工请求”和“我已处理，继续”可见且启用；该入口首败及UI驱动曾错误期待确认后直接出现准备按钮的超时记录保留。

本次真实人工恢复：用户明确已登录，并亲自在真实工作台点击“我已处理，继续”。随后API只读核对同一job，等待点status=completed、resolvedAt=2026-09-27T13:50:12.517Z；该时点job仍为原ID，status=running、phase=preexecuting、sequence=40，reason为“人工处理已确认，正在继续原代表试做。”；UI无alert。当时原Agent和浏览器保持存活，未重开任务、未发送重复resume。根agent稍后查找继续按钮失败是因为用户已先完成操作，不计第二次产品失败。

后续准备首败：原job最终status=failed、phase=preexecuting。a-0006的SDK click成功并切换新tab，但after_step在30秒后失败；未取得收藏输出、未编译。已保存SOURCE artifact de0b6a24-baa7-403c-8513-af669fc4f616，digest fc0b455acfba9cf8f0e116fc31957df672f08f3d2a1991c013086696586251b5；安全证据见work/human-favorites-first-failure-proof.json。真实UI保留“重新试做当前需求”和“查看技术详情”，没有发布按钮；留在原task处理，不将人工恢复成功改写为整条准备成功。

已定位SDK新tab缓存URL为空，get_current_page_url返回空导致DOMWatchdog空快照；88次cached=False请求无效，而真实CDP核对同tab、同document稳定。正在现有SourceObservationScope中适配SDK公开Page.get_url，不加网站分支、不降低文档一致性守卫。修复尚未完成真实重试验收；原来源、摘要与首败永久保留。

此证据仅通过“自然准备主动请求人工→用户真实登录并点击继续→原准备job恢复”这一段。收藏前5项名称及链接的实际业务结果、来源编译、样本与独立复验、手动发布、正式普通复跑、重启持久化及删除门仍未验收；修复所属断点后继续同一任务，不把waitpoint完成等同于业务完成。

限制：准备等待只能继续仍存活的原Agent；进程重启后保留中断事实，拒绝伪造恢复。已发布链路仍用既有持久检查点路径。先前独立UI Chrome退出原因未知，缺退出码/日志；blocked by policy仅解释重启命令被拒绝，不能解释浏览器退出或宣称所有浏览器能力不可用。

证据：work/human-preparation-product-proof.json、work/human-author-python-proof.json、work/human-cross-language-proof.json、work/human-ui-lifecycle-proof.json、work/human-favorites-task-state.json。继续真实任务验证，以上不作为主流程完成结论。后台启动命令的blocked by policy首败继续保留；其具体规则仍未知。

### 2026-09-27 历史阻塞：第5项正式UI验收未创建需求（后续推进见上）

第1–4项的限定修复/验证及原失败见下方；按钮55条、滚动62条完整集合与独立预检一致，普通复跑模型0。第5项已启动当前checkout源码服务：Workbench http://127.0.0.1:4173/，API 4175，PID 19048；最后health=200且root正确，真实UI空态加载无前端错误。随后独立UI客户端进程5420退出，第二次连接报cdp_connection_failed，原端口ECONNREFUSED、进程不存在已只读确认。

自动审批拒绝了重新启动验收Chrome并连接CDP的命令，工具仅返回`blocked by policy`，未提供具体规则；命令未执行，也未换包装方式重试同一启动动作。另一条收尾源码大小/AST、SQLite复核及摘要写入命令也在执行前被自动审批拒绝，这组额外检查标未测。通过文件补丁工具记录安全摘要于work/g6-current-policy-block.json。正式需求尚未创建；本轮确认、准备、样本、复验、发布、复跑、原窗口、重启及删除门均不能记通过。旧G6首败及同任务重试事实保持原样。

已完成的API package check、生产守卫、同源追加校验及真实普通复跑证据不被这一工具阻塞改写。最后checkout核验master/43ed385、294条dirty保留；未提交/推送、未新增tests文件、未改相邻项目、未执行根级或全量测试，未关闭京东delivery窗口、未关机。工作台服务保留运行；后续所需外部条件是允许操作正式UI的浏览器工具/验收客户端，不能以直接API注入替代任务书UI门。

### 2026-09-27 第3项重试闭合，进入第5项正式工作台验收

按钮HP4lhT：55唯一URL/标题，完整集合与独立预检一致，普通复跑模型0。滚动RdccOz原来源在index:null处首次拒绝，随后复用原来源的一次离线语义注解；首次离线编译还暴露同一null在参数绑定处被误判，修正后不再调用模型或探索。replay-retry-CUaOhu编译无缺口，run 2f2c6d0f-b21a-42cc-9ae4-4cd4bc81e175 completed、24 transitions、17 browserCommands、23.51秒、模型0、2次有效固定滚动，62唯一URL/标题逐项等于独立预检（按既有空白归一合同）。停止条件在selector中显式过滤非终态，最后批次保留。链78ce111a-91df-4a1a-943d-4bb1040ec37e v1 / digest 9b9ed56ae2f69bb02f276eb8418f7cbde4fe7ca48ce129f8db0f812badf712fb。原source SHA ca3a5bb6d7c08bf0907761855c1b99413eaaa48e793addd0c99acb3968f6e359未变；原缺口及全部首次失败永久保留，不能称无上下文首验。证据work/repeat-scroll-live-proof.json。

null/missing的Python/TS守卫各10项通过；新的离线repeat接线复用现有注解器，仅追加派生事实，旧需求/计划/动作/观察不得修改。真实同源追加通过，缺恢复依据/错误读取依据两类拒绝；API所属check通过。原始页面汇总65与实际终点62差异保留，未按元数据补造数量。

按用户后续“挨个解决”继续第5项，旧G6首败不改。**本轮正式需求原文：**“打开Node.js官网，找到当前官网推荐的LTS版本，返回版本号、发布日期及该版本的官方发布说明链接，并把该发布说明页面保留在原浏览器窗口中。只读，不下载、不安装、不登录。”预期用户结果是三个当前官方字段与可见原发布说明页；选择理由是普通软件版本查询，结果可独立核对，可覆盖需求确认→代表执行→离线编译→样本/独立复验→手动发布→正式复跑→原窗口→重启持久化→UI删除。它不代替按钮/滚动、人工登录或多步骤能力证据。创建前只读核查data数据库tasks=0/executions=0，4173/4175无监听；不再次清库。当前正式任务尚未创建，下一步启动当前源码服务并从真实UI发起。

### 2026-09-27 第3项继续：修复同页推进后文档身份遗漏

第五次rnvXxu来源及编译通过（10次准备模型、7个浏览器动作），但第一次普通复跑failed：5次有效scroll后已取得62唯一URL；裸#noMoreResults在结束后仍返回1项，执行器按数量继续第6次scroll，发生hybrid_runner_failed:TimeoutError。最后查询真实style已是text-align: center;，不能把属性语义凭空塞进只按数量判断的IR。run d5aca0d0-ca39-46ba-b287-0ccd13f60b04模型0、40 transitions、38 commands。完整62项URL/标题按已声明normalizeWhitespace合同与独立预检逐项一致；预检原文有两处双空格，原始直接比较false也保留。整体仍failed，证据work/repeat-scroll-first-replay-failure-proof.json。进一步把“运行只看匹配数、状态必须编码在selector”明确写进准备/工具反馈/注解指导；旧source/chain/run不改。第六次RdccOz以该失败现场为线索重新准备并复验停止，18步/300秒，不视作全新首验。

查询属性投递修复完成：实际SDK默认include_extracted_content_only_once=false，MessageManager只取long_term_memory，原详细extracted_content不进入本轮或后续模型消息。现有enrich摘要在原7属性槽内优先保留请求属性，超额显式计数，value!==null保留hidden/disabled空串；20上下文/6层/5长期目标/每值240字上限不增。真实SDK Tools registry→生产enrich→真实MessageManager协议验证7项通过；只替代DOM/CDP传输执行同一段JS，不冒充实站。Python、fork和限定diff通过，原nN1ZnK SHA未变；work/query-attribute-memory-proof.json。随后rnvXxu开始同站限定实机重试，复用失败来源中的方法和结束标记观察，但在当前浏览器重新证明；22步/360秒。

第四次nN1ZnK sourceSuccess=true但repeat_annotation_insufficient_evidence，20次准备模型调用，未编译/复跑。实际a-0005至a-0010反复查同一个结束标记，a-0011误用display: none而页面实际为display:none，查询0后仍scroll；读取12→24后又改成:not(display: block)，不符合前后同一继续方法。来源SHA和每次原参数/结果保留work/repeat-scroll-fourth-failure-proof.json。检查现有长期摘要发现请求的style/id/class不在固定保留属性内；先核实SDK对下一轮消息的实际投递并修薄适配，再决定实机复验，停止只改提示后原样重跑。

滚动第三次9ZWvfC保留失败：19次准备模型调用，原生scroll确实令12条变24条，读取方法在当前会话验证成功；a-0008也真实读到No more results标记及其display:none状态，但done(false)明确拒绝“无法找到唯一可用的继续控件”。准备反馈把click可见目标约束套到了scroll条件，是已确认的指导边界错误（对本次模型决策的因果解释仍属推断）。现区分两类角色：click要求可见且启用，scroll可查询明确结束标记的非终止状态；不降低新键、同文档、完整查询、原生回执证据门。work/repeat-scroll-third-failure-proof.json保留原SHA、12→24及拒绝原因。第四次nN1ZnK带该不可变失败来源的读取方法和完整7项控件查询结果，在同一真实站点重新核验；不注入源码/链路/编译结果，没有正式任务，不能称无上下文首验。准备预算22步/420秒。

取消原因修复已验证：RunnerProcess在abort时先把原signal.reason交给pending请求，再继续原精确进程树清理；补异步launch注册监听前取消窗口。真实RunnerProcess+临时Python覆盖原生TimeoutError/两个pending、自定义Error、字符串reason、普通exit7、启动窗口取消和预取消6项通过；各自child退出、owner临时目录删除、无关sentinel保留及重复close同报告均成立。API所属check、定点diff通过。首次反例和未测的真实浏览器超时单列work/runner-abort-reason-proof.json；本次没有新增tests、浏览器或模型调用。

滚动第二次ZKK3WO仍失败：23次完成的准备模型调用、1次取消，已经派发两次原生scroll，但原360秒时限触发时尚未返回source。外层只报告upstream_runner_closed:1，未获得可编译来源，不能把动作进展记作通过；诊断摘要见work/repeat-scroll-second-failure-proof.json。真实RunnerProcess最小复现确认AbortSignal原TimeoutError被子进程close覆盖，正在修正取消错误归属。随后第三次隔离准备9ZWvfC复用MRHi2k不可变来源a-0015已经成功的读取参数，要求当前浏览器重新验证；不再重复猜同一读取方法，不注入预检的继续条件。该样本属于带既有失败证据的准备重试，非全新无上下文首验；26步不变、外部时限420秒，完整采集仍由普通复跑执行。

**按钮分支真实重试通过：** HP4lhT自然来源sourceSuccess=true、gaps=[]，14次准备模型调用；首尾继续查询selector/attributes/max_results完全一致且末次为0。离线编译及普通TaskChainRuntime实际复跑completed，18 transitions、11 browserCommands、模型0，按钮推进1次。输出55个唯一版本URL/标题，与独立浏览器预检的完整集合逐项一致，包含末批。链b7ba1984-ba49-47c5-848a-8c825775032c v1，digest eac968e6c14e7497029a773780d4c2d43e32583b977f9792136c402c6ac5bbfa。证据work/repeat-button-live-proof.json；前两次失败原文保留。这是G5隔离能力证据，没有创建正式任务；现存harness首跑使用fixture固定runId，后续独立样本显式传随机run/invocationId，不能当作正式数据库验收。结果核对脚本误读run.id及完成态null checkpoint的两次错误单列保留，未改生产运行事实。继续滚动分支。

滚动首轮MRHi2k sourceSuccess=false，16次模型调用，15个浏览器动作后主动done(false)。真实记录表明两次click未派发成功、若干猜测selector为空或截断、首次字段投影匹配两条链接而失败；a0015才验证出12条的可用读取方法，预算不足以继续代表scroll。无原生scroll事实，无编译/复跑；源SHA与原reason保留work/repeat-scroll-first-failure-proof.json。对此只扩大同一隔离样本的准备预算18→26步、240→360秒（最多8次额外决策约2分钟），自然任务不变、不给模型注入外部selectors、不改生产预算或全量测试；已向用户说明后重验一次。

第二次NuGet来源HzfopD仍未过：sourceSuccess=true、16次准备模型调用，repeat_annotation_insufficient_evidence。实际a0006→a0010改变attributes/max_results；之后a0012才增加aria-disabled排除，不能倒写为初始同一继续方法，原来源保留。暂停原样模型重试，转为bat_read_fields当前工具结果提供已捕获完整查询参数候选，复用long_term_memory以保留extracted_content事实摘要；不自动选择或改写方法。

查询反馈已接通并完成两份实际来源前缀验证：逐字保留原find_elements参数，无引用/无效/未产生引用无历史候选；生产bat_read_fields结果与verified_method_read精确payload校验通过。反馈走原生long_term_memory，extracted_content不变；新工具/schema/registry均未增加，原registry摘要与两份来源相同，原失败和SHA保持不变。work/repeat-query-feedback-proof.json保存证据；fork/diff检查通过。然后启动第三次NuGet来源HP4lhT验证RootModel与反馈适配后的实际行为，结果待补。

定点排查另确认旧规范化未生效：当前Browser-Use注册器产生RootModel动作，而normalize_author_action直接查顶层find_elements/scroll，真实attributes=null一直原样派发。现通过Pydantic公开root解包执行已有规范化。实际原生ActionModel验证默认attributes填充、显式attributes保留、viewport index=0归一为null共3项通过，模型0/浏览器0；首次直接取原生对象属性的AttributeError保留，证据work/native-action-root-normalization-proof.json。这只修准备适配，不改变旧source或运行能力。

NuGet首次自然来源qn3bc2完成真实8→55条加载，sourceSuccess=true，但repeat_method_evidence_invalid，未进入编译/复跑。原来源离线定位：两次继续查询都用#load-more-versions，完整返回1项；attributes从[id,disabled]变为null，违反同一方法；末次Loading...按钮仍在DOM、其隐藏父容器未进入查询条件。另两次原生wait在repeat采样中被拒绝归属。见work/repeat-nuget-first-failure-proof.json，原SHA保持不变，准备模型16次。首次诊断脚本误将canonicalRequest字符串当对象的TypeError单独保留。当前补通用准备指导与纯等待证据适配；不放宽原缺证，也不再盲跑相同来源。

纯等待适配已完成：复用既有wait分类/native回执/same-document与repeat_method_sample/v1 supporting，将中间及连续尾部成功无事件等待折叠，正式链不增加wait节点。Python合法编译+四类拒绝、TS canonical来源/完整repeat+四类拒绝共10项通过；API package check、fork摘要及限定diff通过，最大TS文件493行。原qn3bc2仍按规格不一致拒绝、SHA不变。控制样本构造的两次观察ID格式/连续性错误先于编译被拒绝，修正验证脚本后才通过；详见work/repeat-passive-wait-proof.json。新版通用指导要求继续查询纳入实际隐藏/禁用状态，并精确复用全部查询参数。随后启动NuGet新来源HzfopD，结果待补；不覆盖首轮失败。

滚动候选进一步限定到Maplesoft公开应用中心cryptography标签页（https://www.maplesoft.com/Applications/ViewTag.aspx?id=1426）。官方infiniteScrollApplications.js在真实批次图像呈现后移除new类并显示noMoreResults；实机预检12→24→36→48→60→62个唯一链接后观察到结束，模型0，浏览器finally关闭。页面计数栏显示65而实际列表结束为62，差异保留，不把元数据数字当已交付数量；预检还观察到内容增加早于终止标记，后续来源需证明读取与继续查询的就绪顺序。证据work/repeat-maplesoft-preflight.json；这尚非自然来源、编译或普通复跑通过。

修前真实生产scope入口反例：docA查询→同页advance发出→成功回执变为同URL的docB→后续read仍被接受。现于派发时记住原文档，成功落入scope前核验session/tab/document；异常清空状态。7项内联生产入口检查覆盖click/scroll换文档拒绝、同文档内容变化通过、普通跨页导航通过和人工恢复清理；API package check、限定diff检查通过。证据work/repeat-same-document-after-proof.json。没有新增tests或浏览器控制/调度实现。

同页按钮真实预检采用NuGet Newtonsoft.Json版本页：https://www.nuget.org/packages/Newtonsoft.Json#versions-body-tab 。在默认筛选下实际Load more令8条变55条、47个新URL，URL未变，完成后按钮父容器hide；该证据仅是页面预检，尚非自然来源/编译/复跑通过，见work/repeat-nuget-preflight.json。此前NASA在document.complete后仍未观察到Next改变列表，停止重复该站；NASA搜索为链接翻页不适配本次目标，NuGet ZodNet不存在返回404，均不计通过。本轮网页预检模型0。

### 2026-09-27 第4项京东真实人工恢复：原登录已恢复，首轮末步失败与复验分别保留

最终定点补证：hybrid-runtime提取等价恢复helper后，API package类型检查通过；生产协议复验覆盖未满足条件/换session仍暂停、原session恢复完成、导航仅一次，见work/jd-human-adapter-final-check.json。第3项补参数化同页读取scope跟随当前URL，跨页消费者scope保持独立，click/scroll两例通过work/repeat-parameterized-scope-proof.json。TS修改文件均≤500行、函数≤100行，限定diff --check通过。当前master/43ed385，292条dirty保留；未提交/推送、未新增tests文件、未启动正式API/Workbench服务。京东自有窗口delivery保留，未关机。

发现并修复：stable IR已支持capability.human等待/恢复，但hybrid缺主动交还现场的能力。新增薄适配browser.wait-for-human v1（只接受显式human合同/read/空参数）；窗口交接、检查点、恢复仍由原组件承担。equals-url条件现在和exists-url一样允许同owner的授权站点内人工导航，恢复时原等式仍须成立。无京东源码分支、无新调度器、无新依赖。

先用生产TaskChainRuntime/withHybridCapabilities受控检查：等待；URL未满足仍paused；满足后同run完成；导航只发生一次；模型0。证据work/jd-human-protocol-proof.json。随后实际打开京东独立受管窗口，run 61dfd8b3-5e0a-4ff7-875e-d507c30e8042进入waiting_for_human，用户回复“已登录”。重新接管同owner/session/tab，原login节点成功，原导航未重复。后续只读登录标记因验证任务使用旧#ttbar-login选择器得到read_output_schema_mismatch，该首轮最终failed，永久保留。

定点读取真实页面的class（不读昵称/订单/Cookie）确认当前标记为.nickname；不改旧chain/run。修订验证任务v2在同一已登录窗口重新验证等待→恢复→实际标记读取，run 8b7409ce-e687-4857-bb62-1c01b74ce810完成，同run/owner/session/tab，普通模型0，两次Runner交接清理confirmed，窗口以delivery保留。v2没有要求用户再次登录，故它是已有登录状态下的恢复复验，不能冒充又一次真实登录首验。work/jd-human-live-proof.json保存区别；原首轮记录位于work/jd-human-live-state.json所指私有临时目录。无正式业务数据库注入，没有第二条G6任务。

第5项门槛复核：旧G6首次失败永久保留；第3项真实按钮/滚动全程证据未闭，不能继续宣称全系统已验收。旧任务已按此前UI删除，不能复用为新的正式验收；遵守任务书不自动创建第二条任务。当前可交付的是所属代码与上述边界证据，完整正式验收仍未通过。

### 2026-09-27 第3项代码接入、真实验收未关闭；继续独立的人工恢复项

同页click/scroll已接入自然repeat证据、折叠和现有LangGraph物化。完整继续查询只接受0/1项，click绑定当轮唯一控件，scroll保持无索引原生参数；同文档、真实派发回执和下一批新稳定键均须成立。scroll补接已有read_fields transition，正式复跑仍模型0。准备记录改首1末2有界采样，DOM ordinal/coverage/正式完整读取不变。额外修复无target的scroll作用域衔接：复用消费者读取scope，并核验原run前驱document；不得凭同URL接管刷新后的页面。

证据：read-sampling-tail-proof.json 9项；repeat-native-adapter-proof.json 18项及canonical envelope导出；repeat-native-ts-validation.json 两模式原文来源摘要/事实验证；repeat-native-runtime-scope-proof.json两模式物化及同文档/换文档拒绝。均为生产入口受控检查，未冒充真实网站完整复跑。API check首轮类型收窄失败，修复后两次按各次改动通过。未新增或改tests文件。

旧真实href来源kneXYw的已保存compilation经当前TS物化+compileTaskChain通过13节点。重新编译首次在本轮fork摘要尚未同步时拒绝，同步后暴露更早registry摘要不兼容；旧来源缺完整历史schema，停止猜测并保持拒绝，原bytes不改。证据repeat-href-registry-block.json，不能把物化通过称为重编译通过。

真实网页预检：Steam公开搜索可加载，但loading标记同时用于暂时隐藏和终止，不能直接作为已结束证明；NASA图库实际返回搜索错误；NASA新闻Next试点未观察到内容变化；Commons返回403、GitHub topic返回429，均不绕过或记通过。首次侦察脚本在DOM尚未建立时读body失败，改只读轮询后才取得图库错误页面；一次Browser-Use退出有closed-pipe析构告警，其余受管会话finally关闭。尚无按钮/滚动从自然来源到终止的真实复跑证明，本项仍未验收，不无限换站或反复调用模型。基础库和正式G6数据均未改。

第4项用户已选择京东。下一步用独立受管窗口验证实际人工登录后同run恢复；第5项仍遵守G6首次失败永久保留、不自动创建第二条正式任务。

### 2026-09-27 第2项关闭：技术失败保留原需求，恢复入口不再被离线可用性遮住

selection_annotation.py 已将“实际选择与明确需求冲突”归 missing_binding/collect_evidence；生产注解拒绝检查保留原来源与动作引用，未触发模型或浏览器。实际 WorkbenchContext 修前在编译失败且来源可用时只显示重编译，修后保留重编译并允许沿当前需求重新准备；没有新增命令或改需求版本。

最小验证：实际组件SSR覆盖来源可用/不可用的失败态及运行态3个分支，证据 `work/preparation-restart-ui-proof.json`；既有后端消费者命名用例“未完成来源仅有业务歧义时返回需求对话，缺证和拒绝来源仍按来源失败处理”1/1；Workbench check通过。SSR首验脚本缺React JSX运行上下文而失败，补齐脚本上下文后才得到修前缺入口反例；未为此改生产React配置。此次没有浏览器点击验收，命令与既有后端准备入口保持原实现，不把SSR说成UI全流程通过。下一项为自然重复的按钮/滚动适配。

### 2026-09-27 逐项修复进行中：选择前验证已接线，真实门待关闭

**第1项实际关闭（限定本次已复现缺陷）：** 第四次自然来源 `bat-g5-real-selection-GJil1r` 顺序为 navigate→find_elements→bat_validate_selection→click→done，全成功、来源无缺口；6次准备模型调用、事后 semantic_annotation 0次。编译链 `9d0cfcab-509b-428c-8b8f-37302ca53c7a` v1 / digest `dd2f4952a55f4f70d27cef9ef20676ac58beacf6415087c6e8754bb284cedb5d` 在两个列表页分别选择 v0.17.2、v0.13.5 并打开对应真实详情 URL，两个独立run均 completed、5 transitions、普通复跑模型0。用checkpoint候选独立按三段整数和第三段>0计算结果，逐项核对函数输出与浏览器URL，通过。证据 `work/selection-method-live-proof.json`。最新API check通过；前三次失败保留。这证明本次复杂选择闭环，不声称任意规则永不失败。继续第2项原准备阶段恢复核验。

第1项改用 Browser-Use 原生 `bat_validate_selection` 工具调用既有 QuickJS：宿主提供真实候选，程序/原选择/变化样例及反转数组一致后才允许对应集合点击；实际点击保存同一 selection_function，编译不重新生成。校验失败由现有 Agent 循环处理，无自写重试循环、无新库、无新 tests 文件。共享 HTTP/QuickJS 边界12项及工具 coverage/runtime scope 定点检查通过；普通复跑不会执行准备工具。第2项相关分支已将 observed_choice_conflicts_requirement 改为 missing_binding/collect_evidence，留在准备记录；生产拒绝入口检查通过。

首次实机 `bat-g5-real-selection-l1mGth` 失败，4次模型调用、4个来源动作：`bat_validate_selection` 在捕获前报 author_before_action_capture_failed。用保存的原参数调用生产 ActionDispatchAudit.propose 精确复现 `unclassified_native_action_capture`，原因是新工具漏登记 ACTION_CAPTURE_POLICIES；已补 read/无事件分类。定点核验脚本首次误把 ResultSpec 联合类型当 BaseModel，改用 TypeAdapter 后原参数及全部暴露动作的捕获分类检查通过，模型0/浏览器0。必要实机重验目录 `bat-g5-real-selection-9IlepN`，结果待补，不算已通过。

旧真实错误来源 SfWUgg 经完整生产离线编译仍拒绝 function_draft_example_mismatch/a-0003，原SHA256不变，模型0/浏览器0；旧registry兼容核对通过，证据 `work/selection-tool-old-source-proof.json`。新实机未过前不关闭第1项，不推进正式验收；首次失败均保留。

第二次实机 9IlepN 来源失败（8次模型调用）：5次工具失败均是变化候选漏 ordinal。已用原输入离线复现，工具补回当前候选 schema 与精确字段位置；同时登记新工具进度事件，避免前端只看到模型调用而漏掉工具过程。第三次 9fYYkp 仍失败（9次模型调用）：候选字段已正确，但模型始终将当前期望 ordinal 填1、程序实际算2，变化样例也有1/2冲突，最终主动 done(false)，没有派发错误点击。

进一步修正职责：选择前工具不再要求模型口算当前 ordinal，改由现有 QuickJS 计算并返回选中候选，实际点击必须匹配计算值；变化样例仍严格验证，失败反馈包含样例编号及安全的实际/期望整数。旧来源不改；这不是把错误样例自动改成通过。9fYYkp 原程序的离线首验仍如实报 exampleIndex=1、actual=2、expected=1，尚未作为成功来源。

### 2026-09-27 不新增tests文件：准备编译失败关联已修

按用户最新要求，后续开发不新增tests文件；用现存来源、已有生产入口、真实运行和持久化结果验证必要改动。引用库须对应当前缺失的通用能力或可复现阻塞，不做已工作模块的全面替换。

本次定位并修复 `withSelectionValidation` 保存失败时固定写actionRefs=[]的问题。复用现有QuickJS校验，仅通过Error cause带回当前segment对应的真实动作，不改程序、样例或不可变来源。原真实失败 `bat-g5-real-selection-SfWUgg` 经生产 `recompileHybridSource` 离线重放，仍准确拒绝 `function_draft_example_mismatch`，现明确关联a-0003；模型0、浏览器0，source-result.json SHA256前后相同（9cbd70faefdb1101386fa71939f2761db4e652a82fc08e0dc3145f3aaf08ef33）。证据 `work/selection-failure-action-proof.json`。本次没有新建或修改tests文件，没有把定位修复记成错误程序已能运行。

本次受影响 API 包类型检查 `npm run check --workspace @browser-capture/api` 通过（exit 0）；未运行根级或全量测试。

### 2026-09-27 复用范围纠偏：保留已验改动，只处理新回归

全项目组件职责核对见[PROJECT_REUSE_REVIEW](PROJECT_REUSE_REVIEW_20260927.md)。用户明确指出：优先复用不等于把已写好的无关模块全部替换，也不应为纠偏再无差别撤回。尚未执行任何撤回；停止额外换库和扩展调研。

本轮Ajv替代动态schema逐类型转换后，真实Python/TS同一16个样例已一致，原动态schema命名用例、Contracts check与Workbench build通过；保留这项已验改动。Unicode长度首验失败保留，并非所有JSON传输都损坏。

点击复用组的离线3/3不能证明实机接入完成：同一旧来源新retry `bat-g5-real-selection-fbdqn3/retry-xRoEmZ` 第一次普通复跑报 `hybrid_runner_failed:AttributeError`（模型0、activeMs15423），第二页未运行；原错误保留，当前仅修本轮引入的公开API适配问题。后续必要复验限定现有链的第一页，使用 `BAT_SELECTION_FIRST_PAGE_ONLY=1`，不再采集新来源或调用准备模型。

后续已修并验证：Browser-Use 0.13.8的Page.mouse为异步属性，适配漏await，原mock错误地提供同步属性掩盖问题。改为真实Page构造并绑定已有session，再await mouse；所属3/3通过。仅同一来源第一页实机复验 `retry-z2EqpM` completed、9 browserCommands、9 transitions、模型0、activeMs19225；独立核对checkpoint中当前候选选择与实际详情URL一致，摘要 `work/reuse-click-acceptance-20260927.json`。来源记录里13次模型调用是复用来源的历史值，本次未调用模型。API check及本次定点diff检查通过，原首次失败保留。

本轮没有执行此前口头提出的撤回；保留已验改动，停止额外库替换。后续修改须直接对应当前主线的可复现错误或确实缺失的必要能力，不以“统一技术栈/增加开源依赖”作为单独开发任务。

### 2026-09-27 本次补齐结果：基础动态选择、人工等待、搜索与只读UI已验证

用户要求继续完成已知缺口。本次不执行关机；以下旧收尾与关机记录仅为历史事实，不作为当前授权。现有 master/43ed385、255 条 dirty 开始核验，保留全部已有改动。G6 首次失败和同任务重试成功分别保留，已删除的任务不重建、不回填。

本次已补动态选择的真实来源/编译/变化输入复跑、同现场有界续查的连续trace、人工等待同次恢复、搜索与题板同轮运行态证据和局部UI非退化。D6仍待决；复杂版本排序样本失败，按钮/滚动分页、多套方法、真实用户登录/验证码解除仍未测。G6首次失败保留，不以这些隔离前置能力验证改写它。

**最终新增实机证据：** 同一来源、同一链 `816f75c9-33f2-4de6-9905-5d5f78e102fa` v1 / digest `201e5c7560472484d565e1fac661c4d94b0a4a3c91fb48f44db531fac7d4f726`，在第一页和第二页各读10项，按当前候选选出ordinal 3的v0.17.1与ordinal 6的v0.13.1，真实浏览器URL分别到达对应详情。两个独立run均completed、9 browserCommands、9 transitions、模型0（17.275s/13.485s）。证据 `bat-g5-real-selection-fbdqn3/retry-2I4n1L/selection-proof.json`，安全汇总 `work/g5-remaining-gates-proof.json`；本次只离线重编译与普通复跑，没有再调用模型试做。首次失败保存在原目录。

独立证据核对首验脚本误从最终业务 `run.outputs` 找内部节点值而失败；改读已保存checkpoint的 `nodeOutputs` 后通过，未重跑浏览器。候选摘要不同、原ordinal从3变6、实际URL与独立规则计算一致、两个run绑定同一链的摘要相同。连续续查样本也核验同owner/同target、两次done和initial/continuation审查均在原14步预算中，原source失败/gap保持。

搜索与UI的专属服务/客户端已停止，真实401和选择的受管Runner/窗口完成finally清理；未递归删除临时profile。正式数据库tasks仍0，未重建已删除G6。当前未执行关机、提交、推送、worktree、reset/clean或根级/全量测试。

最后受影响API包类型检查 `npm run check --workspace @browser-capture/api` 通过（exit 0）；Workbench所属check及本次最终build此前已通过，不重复运行旧验证组。本次所属代码和文档的定点 `git diff --check` 通过；末次checkout核对为master/43ed385、273条dirty（包含原有改动），未提交。各次首次失败及修正后的窄复验记录在下文和对应专题文档。

本组验证目的：在真实公开 GitHub 发布列表当前页，按版本规则选择发布详情；同一自然来源编译的链以不同列表页 URL 输入复跑，检查动态集合绑定和 0 模型。使用独立临时持久化与现有生产 withHybridAuthoring/recompileHybridSource/TaskChainRuntime，不写正式任务库、不注入 source、不修改网页。命令限定 `BAT_RUN_REAL_SELECTION=1 node --import tsx apps/api/tests/g5-natural-selection.acceptance.ts`；不能证明 G6 首次验收、跨页全局排序或任意网站选择。首次结果随后补记。人工等待与 UI 修复各由所属最小用例验证。

动态选择首次脚本失败：`bat-g5-real-selection-38hGLm` 的 Agent 只调用 done(false)，明确报告未给运行时输入 URL，浏览器命令0、模型1。脚本只给原始业务句子，漏掉生产 `browserUseTask` 会提供的入口/真实输入文本；并非导航或动态选择成功。现复用生产 `describeValue` 将本次已授权入口和输入投影到任务文本，保留原失败来源再验证，不改生产浏览器逻辑。

第二次真实来源 `bat-g5-real-selection-HXxKUk` 失败：12 浏览器命令、16 模型调用，`completion_review_after_continuation_unresolved`。同 Agent/Browser 的首次 done 后确实回到原列表有界续查，连续 trace 保留两次 done 和 initial/continuation review；没有另开会话或重置步数。续查观察到正文分组后，复核仍错误索要 execution 模式不存在的记录列表输出证明。现只将已确认 resultMode/outputSchema 传给准备复核，并补动态选链接使用原生 click 的方法指引；不改旧事实、不跳过范围核验。新增单条生产复核上下文验证首次1/1通过（仅该命名用例），fork 两个文件摘要同步；真实选择仍待验证。

搜索/题板本组目的：独立临时数据目录启动现有产品服务，通过真实工作台提出需要搜索的来源需求；仅核对搜索事件、原始候选、用户选择、API/SQLite/重启同版事实，不启动 B-U 或发布第二条 G6。复用现有持久化模型设置和凭据，不修改正式数据目录；UI 使用已有 CDP 客户端。历史已过搜索单元组不重复跑。

搜索运行态门已通过：独立 `bat-g5-search-ui-f0XDtH`，真实UI创建来源访谈 `b4e7c5aa-ffb7-4f7e-b6ae-29f29cbc328f`，Pi web_search 显示搜索中→搜索完成，展开依据与来源题板都显示本轮 Node.js 下载候选；选择 `source:37391f203b47c8cec371` 后唯一草案v1经UI确认。API与SQLite逐项核对搜索callId、原始messages、question/answerMessageId、selectedCandidateId、来源URL及requirement.entries一致。服务13992→22416、UI刷新后整个Interview摘要及SQLite消息摘要不变，仍confirmedVersion=1/revision=2。证据 `work/g5-search-restart-proof.json`、`g5-search-before-restart.json`、`g5-search-after-restart.json`、UI候选/确认/重启证据。没有启动B-U、发布或正式运行；此门不计第二条G6。

搜索验证脚本首次操作/断言失败另记：把“查看搜索依据”的summary误当button、来源选项误当label，均未发业务变更；改为实际元素后成功。选择选项即自动提交，额外submit因disabled拒绝，没有重复答案；确认按钮旧名称定位失败后按实际“确认草案”点击。SQLite题目在确认后是resolved，首断言误写answered，修为核对API同一状态与非open后通过。这些脚本失败不改产品事实。第一次audit失败同时出现Node Windows退出断言，后续窄复验正常；未扩大整组测试。

动态选择第三次 `bat-g5-real-selection-YCxUX8`：sourceSuccess=true/gaps=[]，2浏览器命令、4模型调用；离线编译却仅产出固定history XPath，没有动态Function，验收脚本在复跑前明确失败。真实来源显示目标嵌套在重复section中，既有集合防线仅检查直接同父元素，漏过祖先重复容器。正在所属结构证据边界修复；来源与错误保留，不把“零gap”当动态选择成功。

人工等待代码与所属最小验证见 [HUMAN_WAIT_CLOSURE](HUMAN_WAIT_CLOSURE_20260927.md)：URL存在不再替代动作完成；同现场可重复动作重新取得真实结果，未知外部写保留等待且不重派。生产Executor/Host/Hybrid/Runtime与真实SQLite路径4/4，受影响类型通过，历史首次测试代码失败保留。另已HEAD核验公开 `https://httpbin.org/status/401` 返回401，开始无模型真实Runner协议验证；不把HTTP状态演示站算业务验收，也不伪造登录已解除。

真实401首验 `bat-human-wait-real-DhAvTN` 失败：原生导航先报 `ordinary_action_failed`，未进入成功分支末尾的HTTP状态归类；窗口清理confirmed。修正Runner只在本次导航已记录同URL主文档拒绝时保留capture_*类型，导航前清掉同URL旧状态，不据外部HEAD或异常文本猜认证。新增4种边界的一个用例首验因夹具遗漏必需postcondition而失败，修正后1/1通过；无响应/异URL/旧401均保留普通动作失败，派发仅一次。其后换用已HEAD核验401且无Basic Auth挑战的 `https://api.github.com/user`；第二次启动在fork并行修改期被源码digest门拒绝（`bat-human-wait-real-LtGjV1`，cleanup confirmed），未到真实导航。等所属源码稳定统一更新manifest后再验，不放宽源码门。

真实401后续通过：`bat-human-wait-real-mYn8Oj`，真实Chrome访问公开GitHub API认证端点返回401→waiting_for_human；持久化后换Runner，同owner/session/tab及同run继续，未解除401仍waiting，没有把观察URL当成功，模型0；两次handoff及最终owned窗口/Runner清理confirmed。receipt/first-run/second-run均在该目录。该证据证明真实拦截与未处理时安全恢复；成功处理后的推进由生产适配+SQLite测试证明，实际用户登录/验证码解除仍未测，不冒充登录成功。

嵌套动态选择已补结构防线：沿既有DOM祖先识别重复条目；完整查询须全部落在同一局部集合对应位置，未读时native点击及离线编译均拒绝固定XPath。所属15项累计通过，首次夹具失败和窄修复见[NESTED_SELECTION_CLOSURE](NESTED_SELECTION_CLOSURE_20260927.md)。第三次旧真实source离线只报 `collection_selection_read_required`，SHA256不变，0浏览器/0模型。5项fork文件摘要更新，源码门通过；第四次自然来源开始验证，不修改前三次来源。

第四次复杂排序来源 `bat-g5-real-selection-SfWUgg`：6浏览器命令、12模型调用，sourceSuccess=true；首个错误点击后同现场续查纠正。两份选择程序的期望样例与程序/真实选择不一致，QuickJS验证报 `function_draft_example_mismatch`，未物化/复跑，不修改样例或覆盖来源。本次泛化修复不放宽严格门。任务书未要求全面复杂排序；该额外样本标失败/未支持，继续保留能力范围内的基础动态筛选：当前页按正文顺序打开首个标题以“.1”结尾的发布；同一生产脚本用 `BAT_SELECTION_CASE=first_patch`，仍要求真实候选→Function→动态目标→不同页输入，保留浏览器receipt。其结果不替代上述复杂排序失败。

第五次基础筛选 `bat-g5-real-selection-p8kwhq`：6浏览器命令、9模型调用，真实点击正确；编译的唯一选择函数按数组`.find()`取首项，被既有“保留ordinal、重排数组”校验拒绝。原模型指引只要求返回原ordinal，没明确数组顺序可变、正文顺序由ordinal定义；现补这项既有输入合同说明，不改源码程序/样例，不放宽沙箱门，不新增镜像测试。新来源再验证；原失败持久保存。

第六次基础筛选 `bat-g5-real-selection-fbdqn3`：10浏览器命令、13模型调用，sourceSuccess=true/gaps=[]，离线首编译和动态Function沙箱验证通过，已形成链。首次普通复跑在scroll pages=4报 `action_arguments_changed_by_validation`：Pydantic转4.0，旧digest比较把JSON数值等价当改参。现复用已依赖jsonschema公开const/is_valid，不自写比较器；真正Browser-Use scroll参数与非法改值两项首验2/2通过。此后只用同一不可变来源离线重编译/普通运行，新增retry子目录保留首次compilation/chain/run，模型试做不重跑。

UI余项实机已完成：动作详情新增原生键盘入口，关闭只读画布Delete并复用React Flow无障碍配置。一次所属build通过。`bat-canvas-ui-wJHB78` 中Tab/Enter/Space、展开、缩放0.5→0.6及亮暗实际样式通过；完整API草稿=SQLite body，revision/checksum/两条验证/readiness全部不变，写请求[]。该场景后续仅因提醒可选值undefined误断言null而整体失败，原结果保留；只复验提醒段到 `bat-canvas-ui-Y1IudF`，跨任务铃铛/返回/刷新保留及同execution状态恢复后提示消失通过。汇总 `combined-proof.json` 不覆盖前次失败。模型/产品Browser调用0，两个UI Chrome exit0且服务已关闭；提醒状态为隔离夹具，不冒充真实认证解除。完整首次失败见 [UI_REMAINING_CHECK](UI_REMAINING_CHECK_20260927.md)。

### 2026-09-27 历史收尾：同任务重试闭环完成，G6 首次验收仍失败

收尾补充：本次UI客户端已通过所属CDP关闭；临时UI浏览器Profile目录的安全路径核验与递归移除组合命令被自动审批拦截（仅返回 `blocked by policy`），整条命令未执行，故该临时目录保留，不改用其他工具绕过。它与已完成删除核对的产品Pi会话/来源诊断/业务数据库分别记录。完整来源、离线编译、临时链路和完整结果核对副本已按精确文件名移除；安全摘要和截图保留。最终定点diff-check通过，master/43ed385未变。

**最终事实：真实 GitHub Releases 单链已在正式工作台完成同任务重试闭环。** UI需求与题板→确认v2→第二次来源→同源离线恢复→样本→独立复验→UI手动发布V1→正式复跑→原窗口→重启持久化→UI永久删除均取得记录。三次普通执行各读取8页、翻页7次、77条唯一URL，模型调用0。首次草案、首次B-U、首次TS物化与原窗口初次聚焦失败不撤销；按任务书，“全链一次通过”的G6结论永久为失败，本轮没有另建第二条正式任务，不宣称全部迭代首次通过。

原窗口收尾复验：修复WinAPI句柄/主窗口筛选与实际前台核验、分离handoff/focus后，最新真实UI“打开原窗口”请求HTTP200；原Chrome PID1968、原target及owner均不变，WinAPI验证visible=true、foreground=true，实际原窗口截图显示 `https://github.com/openai/openai-agents-js/releases?page=8`、Next不可用。证据 `work/g6-window-proof.json` / `work/g6-original-window.png`。此前G5的focus仅凭RPC active=true，不足以证明OS前台，不能继续用作严格前台证据；本次正式原窗口补齐该证据。Windows仍可拒绝后台置前，不保证任意时刻必成；新拒绝码映射409和错误保留有2条定点证据，新版UI本次实际成功，修复后的409视觉路径未再自然触发。

重启核对：PID20284→7552后，同Release、三个execution/run、输出摘要、owner及原页均保持；SQLite安全审计逐项相等，API引用一致，UI顺序核对77条均存在。证据 `work/g6-restart-proof.json`。随后为加载错误反馈最后一次检查/构建均通过（API check、Workbench build；既有大chunk提示），服务加载PID14884，未重跑B-U或采集链。

删除核对：先UI“结束原窗口”并确认，handoff=ended且PID1968退出；再UI“永久删除→确认永久删除”。API tasks=[]、旧任务404；SQLite只有aiSettings=1/imports=1，其余业务表记录均0；本任务Pi binding/session文件、两份来源诊断、窗口lease均无残留。模型配置和imports摘要未变，共享Profile目录保留；没有维护脚本补删产品残留。证据 `work/g6-deletion-proof.json`、`work/g6-after-delete-audit.json`、`work/g6-deleted-empty.png`。该任务/Release/来源ID现均为已删除历史引用，仅保留安全验收摘要；本轮临时复制的完整来源、编译产物、链路及完整结果核对文件另行移除。

已删除职责为D1智能修复、D2手工写图、D3人工拾取、D4旧格式读取及U清单冗余接线；具体变更、保留项及所属最小验证见下方逐组记录和UI清单。已补读取引用、重复方法、动态Next绑定、既有loop累积/去重、检查点与Profile所有权恢复；未新增网站专用公共逻辑、第二调度器或隐式复跑模型。未覆盖按钮/滚动分页、多套方法、多业务步骤/each自动创作、复杂选择、真实登录/验证码及自然业务人工等待；D6仍待决，不凭本次单链宣称通用全覆盖。

现场：现有master/HEAD `43ed385`，已有dirty全部保留；无worktree/reset/clean/提交/推送/相邻项目改动，无根级或全量测试。当前验收任务和所属产品窗口已删除；关闭本次UI客户端及服务后，执行用户本轮明确授权的关机。关机是本轮用户指令，旧“不关机”历史备注不适用。

### 2026-09-27 G6：原窗口系统拒绝的反馈收口

真实 UI focus 在 Python 明确返回 `hybrid_managed_window_foreground_denied` 后，API 将其投影为通用 500，连接层又在写入错误后调用成功的 reload，导致错误被清空。现只在 `TaskChainService.controlBrowserHandoff` 的 focus 边界精确匹配 `UpstreamProtocolError(hybrid_runner_failed, ValueError:hybrid_managed_window_foreground_denied)`，返回 `browser_handoff_foreground_denied` / 409 和“窗口仍保留，请通过任务栏手动切换”；未知错误仍沿原边界处理。连接刷新当前快照后再保留这次操作失败，不变更 completed、active 租约或业务输出，不增加重试。

最小验证：新增连接用例首次 1/1，证明成功刷新后仍显示相同错误和 code、busy 结束；新增所属 API 用例首次 0/1（测试夹具把业务数组误写到 result 投影结构，被 Zod 拒绝，未到 focus），按现有 TaskExecutionResult 合同修正夹具后 1/1，证明 HTTP 固定错误和整个持久化 execution（含输出/租约）不变。只运行这两条命名用例，无模型、浏览器、构建或重复旧组。主流程负责一次受影响类型/构建及同一窗口 UI 反馈复验；此处不据定点测试宣称 OS 前台成功。

### 2026-09-27 G6：原窗口 focus 的假成功修正

正式 TaskRun 已完成 77 条结果、普通复跑模型调用 0 后，UI“打开原窗口”返回 active，但两次原窗口截图门均失败 `owned_window_not_foreground`。只读 WinAPI 核验：租约 Chrome PID 1968 / 主 HWND 2622766 仍存在，前台为 PID 19260；另一个 visible owned HWND 1574350 是主窗口的辅助窗口。首次失败保留，窗口存在与前台成功不能混用。

实现缺陷是 `_visible_window` 只要找到可见 owned 窗口就返回 true，未检查 Windows 激活结果。现只操作已核验 PID 的可见主窗口，显式声明 WinAPI 的 HWND/BOOL/LPARAM，恢复后请求一次前台激活并核对真实 GetForegroundWindow；系统拒绝时抛 `hybrid_managed_window_foreground_denied`，不附着其他输入队列、模拟按键或重开窗口。Microsoft 文档确认后台激活可被拒绝；现场具体拒绝条件未从只读检查中确定。

交付 `handoff` 在同 owner/target 已验证并保存租约后返回 active，显式 `focus` 独立证明前台。调用者核对：独立 focus 错误在 TaskChainService 回写之前抛出，现有 completed、77 条结果和 active 租约不变；不让操作系统焦点限制把已完成链路改判失败。

所属新增 `apps/api/tests/test_managed_window_focus.py` 首次 4/4：拒绝时租约字节不变且不操作其他/辅助窗口、请求成功但前台不符仍拒绝、无主窗口明确 not_visible、handoff 不依赖 OS focus。只运行该单文件；未重复旧组、构建、类型门、浏览器或模型。真实同任务 UI 焦点复验由主流程继续，尚不据单元测试宣称 Windows 前台成功。

### 2026-09-27 G6 同任务重试：发布与正式翻页运行完成，原窗口聚焦未过

唯一任务 `1db0fc42-5eb7-4e30-8055-43da5d57747a` 的首次草案与首次 B-U 失败永久保留。第二次来源成功（11 次模型、8 个浏览器命令、两页代表），首编译在 TS 物化被合法 `new_tab=false` 误拒；最小修复后使用同一不可变来源离线恢复，无新增 B-U、无模型调用。恢复 job `1762e289-41fb-46a0-8bbc-06afc9934ad3` 经 UI“只重新编译已保存试做”启动。

样本 execution `4a079196-8a88-49ec-8ed0-dfe2d6b82fe6`、独立复验 `28eb9f9f-c93e-4c47-8dde-e9e426268acf` 均 completed；同草稿 revision=0、同链 digest `d575e2270de1ca4a1ab98fce3a3175637a88fdabc330c92e0ae17ac2dd33d237`。UI 手动发布 Release `eb4c27b6-a3eb-4fa6-835f-163af47821fa` V1（digest `6e125dff6713140621f7e7cc265537e660700b405ae2b2bfd69e509c1180083c`），再从链路工作台“运行→开始运行”创建正式 execution `8099a496-11ca-4500-8e96-db169312e2dc` / run `18971a18-13b3-44a5-8d59-d5b99d8ab0d6`。

三次执行均实际读取8页、翻页7次、77条/77唯一详情URL、54 transitions、40 browserCommands、模型0，业务输出摘要一致；正式 activeMs=44499，TaskRun/execution completed、runner cleanup confirmed。UI展开同一图技术动作，显示排队/完成与当前执行；结果面板实际显示77条标题与链接。安全审计在 `work/g6-before-restart-audit.json`，UI截图 `work/g6-formal-result.png`。

正式交付保留同 owner `44cefc2b-ea41-4da8-8cda-10c962781fe6`、Chrome PID1968、原 target `B1B50FC799EE431132A83C49D73C265B`，页面为真实 releases?page=8，状态handoff；运行前后身份一致。**原窗口“聚焦到前台”未通过**：UI打开原窗口后两次检查仍为ChatGPT前台；现有Windows适配器忽略SetForegroundWindow结果并误报成功。原窗口存在/可见与OS前台状态分开记录；不模拟用户输入抢焦点、不重开页面补证。修复严格反馈后复验，随后继续独立的重启/删除核对。

本轮受影响API类型检查通过；Workbench错误空态文案修正后所属build通过（既有大chunk提示保留），实际试跑面板已显示真实阶段，无“尚未开始”矛盾。服务本次加载PID20284/4175。重启后持久化与删除当前待核验，不把上述同任务重试改称G6首次通过。

### 2026-09-27 G6：推进的显式同 tab 参数

真实成功来源 `work/g6-valid-source.json` 首次 Python 编译 gaps=[]，TS 物化拒绝 `hybrid_repeat_advance_binding_invalid`。原因是推进同时具备动态 URL 与有原生参数事实证明的 `new_tab=false`，而 TS 错把绑定总数限制为 1。新增生产桥首次 0/1 复现；窄修后 1/1，通过合法同 tab 参数，并拒绝 true、未知/重复参数、伪 sourceRef 和 proofRefs，普通绑定证据门仍执行。

原始来源保持不变。`node --import tsx work/g6-offline-diagnose.mts` 离线验证 exit 0：compiler gaps=[]，materializer/TaskChain 编译成功，13 个节点，产物 `work/g6-offline-chain.json`。仅运行这一新增例和这次真实来源离线验证；未调用模型或浏览器、未写 API、未改当前服务、未跑包检查或旧测试组。正式 UI 重新编译和运行仍由后续验收记录证明。

### 2026-09-27 G6 草稿生成上下文空态修正

实际生成 job 已 running/preexecuting 时，上下文标题显示当前处理阶段，详情却回落为“尚未开始生成草稿。”。现将该空态限制为无 activity、无草稿且无发布版本；已有作业保留阶段标题及服务端 reason。仅改一处展示条件，定点 diff 检查通过；未新增镜像测试、未重建工作台、未重启服务，当前运行中的正式作业未受扰动。浏览器显示复验待下一次已授权构建后进行。

### 2026-09-27 G1–G5 本次需求前置退出与 G6 首次需求登记

**G6首版草案审阅失败，不能宣称全链首次通过。** UI中的首版“代表试做”要求逐页收集并沿分页前进至末页，混淆准备方法与正式全集执行；尚未确认，未启动正式B-U。已补访谈Skill的通用阶段规则（不加网站逻辑/关键词门/新字段），通过同一任务的真实聊天发送阶段纠正，要求业务范围与已确认规则保持原意后重新成稿；不脚本改写持久化草案，不另建任务。标题缺失取页面版本标签的题板已实际确认。

同一任务UI生成并审阅v2后确认，API confirmedVersion=2/revision=5；v1与v2均保留，Markdown摘要在work/g6-interview-confirmed.json。经UI“生成草稿”启动首个job `b779c791-7719-44ea-88b0-016f83ed7d92`，该次B-U仍失败并自行结束（未发取消、未发布链路）：业务结果为根记录数组，模型误把响应包装value当业务路径，连续输出["value"]及["value",0]，readError=natural_read_output_path_invalid。source/v3 artifact `ba664688-cab0-4d9f-8182-8e384ce2b069` digest `e96239e76012fae7a7345e048892fad0cab4cab91d9a7781276763e263da143e` 已保存，owner closed=true；编译/样本/独立复验/发布/正式运行均未到。UI真实失败截图work/g6-first-source-failure.png，不把G5的77条结果算这条正式任务结果。正在修正方法工具的真实根路径描述与安全反馈，再由同任务UI显式重新试做，首次失败不撤销。

前置复核：D1–D4/U01–U35职责与接线收敛、G1调用身份/发布事务、G2合法缺证/形状、G3引用与模型字段门保留所属定点证据，旧API类型基线已消除，最新API/Workbench类型及Workbench build通过。G4/G5当前选定的公开href分页单链范围已取得真实source→编译→IR→运行：两页代表、8页普通遍历、77条URL唯一记录、0模型复跑；原动作一次派发/后态/读取有已有真实Runner样本，发布/删除/业务歧义边界有所属生产服务与SQLite样本。

新真实恢复 `bat-g5-repeat-resume-v81mKN`：同链纯节点边界paused/interrupted→持久化→同owner原窗口handoff/focus→新Runner恢复同run→completed，首次读取不重派，模型0、finally清理confirmed。首次恢复脚本 `bat-g5-repeat-resume-U3eKB1` 实际正确暂停，但脚本误断言最后浏览器前驱必须是record read（实际为后续Next query），因此首次失败；修为核对最后实际browser receipt后重试通过，原失败保存不变。Profile重建服务后的精确所有权恢复、共享Profile保留也已真实验证。

据此通过的是本次普通href分页单链所需前置门，不声称通用任意网站支持：按钮/滚动分页、多套读取方法、多业务步骤/each自动创作、复杂排序选择未获得本轮真实证据；D6仍待决。原生业务人工等待、访问限制与真实登录未自然发生，已有窗口/暂停能力证据不冒充这些业务场景通过。

G6唯一新需求（创建前登记）：**打开 https://github.com/openai/openai-agents-js/releases，收集全部公开发布的版本标题和对应详情链接，沿下一页到结束，按详情链接去重；保持网页发布顺序，不登录、不下载、不修改。完成后显示结果并保留本次浏览器的最终发布列表页窗口供我查看。**

预期用户结果：完整发布列表与对应详情URL、可见且可聚焦的本次原窗口。选它是因为公开来源/字段/继续与停止条件明确，真实所需能力已有前置证据；不是数量样例或本地自制页面。覆盖需求→唯一草案→新B-U来源→首编译→样本→独立复验→手动发布→正式复跑→原窗口→UI/API/SQLite/重启→UI删除。未覆盖会员/验证码、写操作、多步骤和复杂选择。此前G5隔离任务/来源不注入工作台；所有正式变更操作从UI，API/SQLite只读核对。任一首门失败永久记录，不自动新建第二条。

正式任务已从UI创建：`1db0fc42-5eb7-4e30-8055-43da5d57747a`；题板确认原文指定来源及“包含所有公开条目”（含公开预发布、无私有草稿），与已登记需求一致。最终后端服务PID21172/4175已加载，Workbench build为本次收敛版本。用户授权的结束/真正无法解决后关机仍有效。

正式任务创建前的操作失败也保留：PowerShell对空数组再包@()误判tasks不空，node只读核验实际0后修正空态门；本次owned闲置API停止后首次重启遇10秒数据lease未到期，等待既有期限后启动成功，未删锁。UI控制脚本首版unref使命令退出后的子Chrome被宿主回收，改保留父进程后重开无任务空态；首次发送定位误选默认submit类型的折叠按钮，未发请求，随后精确点击aria-label=发送，才出现需求气泡及思考态。均未创建第二条任务或注入API。

### 2026-09-27 G5 真实 GitHub 分页来源、编译与普通复跑通过

第六次隔离样本 `bat-g5-real-repeat-kneXYw`（fork `8ed51f1bd90a5f6e546c3d7e6ef6b5ddcbc5f1b8f3711568d3982c7ea4ae335f`）：来源10个浏览器命令、13次已完成模型调用，sourceSuccess=true、sourceGaps=[]。只做两页代表方法，不预抓全集；不可变来源首次离线编译gaps=[]，生成13节点/1个既有loop。普通执行器实际翻页7次、读取8页并completed，40浏览器命令、54次transition、activeMs=44396、模型调用0。来源、compilation、chain、run和latest-run分别保存在该隔离目录；前五次失败不撤销，此次不计G6。

在最后统一API类型门，新增预算反例夹具 action.args 的unknown类型首次失败；改为真实jsonValueSchema.parse并回绑到待篡改action后APIcheck通过，受影响精确预算用例1/1。读取引用参数的完整生产捕获/编译与TS准入通过；所属vendor manifest首验CRLF摘要错误已由owner修复，最终verifyForkSource通过。

当前继续同一真实链的原窗口暂停/持久化/恢复验证；G4/G5是否完整退出待该行为结果复核，G6尚未创建。

### 2026-09-27 G5：完整 Next 样本预算差异

理论边界：`max_results` 是执行上限，不改变 selector、属性和文本投影的查询语义。每份原始 query 必须先按自己的实际 args、ReadSpec 与完整性证据独立验正，再仅忽略 `maxItems`、派生 `outputSchema.maxItems` 和 `ordinal.maximum` 比较方法。运行仍使用首份 ReadSpec/预算；来源和事实 digest 不改写。后续代表结果超过首次预算则拒绝，不能静默扩大预算或编译一个已知无法覆盖代表页的方法。截断、selector、attributes、include_text 或字段投影变化仍拒绝。

最小验证：新增 Python 例首次 0/1，旧规则报 `repeat_method_evidence_invalid`；修后 1/1。新增生产 Python→TS 桥首次 1/1：两页全正查询预算分别为 4/100、实际各 4 条，编译保持首预算 4，原来源对象不变；参数/投影/完整性/派生 ordinal 上限篡改及结果超过首预算均拒绝。仅运行这两项新增例，未跑包检查、浏览器或模型，未修改任何失败来源。

### 2026-09-27 G5 真实翻页第三次结果与第四次验证

第五次 `bat-g5-real-repeat-li0L9L`：7个浏览器命令、9次已完成模型调用，sourceSuccess=true，原生准备确实只读两页并done；但有一个 `missing_control_intent/repeat_annotation_read_method_mismatch`，未编译/复跑。a3 title.normalizeWhitespace=true，a6漏参数而实际缺省false，这是不同方法，不能当等价通过。原source/receipt保留不变。修复方向是让 `bat_read_fields({readRef:"r1"})` 在同一成功记录集中直接复用完整方法，返回新样本引用；不要求模型再次抄字段配置，不重写读取器。

TS方法引用准入最小新例首次1/1；追加首次字段规范化篡改反例后该例1/1。引用即便未被done选中也必须核验同trace前序成功事实、原参数、完整spec/outputPath/readPath及每次观察/结果归属；混参、缺引用、前向引用、失败前驱、改规格和结果摘要均拒绝。旧未选空观察仍不参与结果。Python真实工具/捕获/自然编译验证待收口，尚无新增浏览器或模型重试。

代表方法边界修正最小验证：Python 两页全正新例首次0/1重现旧限制，修后1/1；生产Python→TS新桥首次1/1，末query四份同址链接，显式terminalObserved=false。非法href/不同目的地/无实际advance拒绝；运行判空、累积、预算代码未改。API最新check通过，fork digest `cb37aad87745937641479ad97a818a2858e45a4a29c169b2d443d134cc52f627`。第五次来源仅因该准备/正式遍历边界修正而启动，18步/240秒；不是原样增加预算重跑。

Workbench所属包build通过（现有大chunk提示保留）；API已从本checkout启动4175，实际health成功、tasks=0；实际UI空态读取成功，未创建G6任务。服务需在最终源码收口后重新加载才进入正式验收。

第四次 `bat-g5-real-repeat-fkD3t3` 最终也失败：17次已完成模型调用、16个浏览器命令，sourceSuccess=false、sourceGaps=[]、output=null。实际读取1/2/3页并沿Next到第5页，因未到终页而done=false；a7 click 为 native_action_dispatch entered=false，随后改用实际href导航。未编译、未复跑，失败原文不变。

设计复核：本轮自行增加的“代表执行必须实际抵达终页并观察空Next”将方法准备逼成逐页遍历，不符合任务书“代表方法、不预抓全集”。修正为两页相同读取方法、相同完整Next查询和至少一次实际导航证明可重复方法；末代表页Next允许仍有唯一目的地。只有普通执行器实际查询为空才正常结束，歧义、截断、站点阻断或预算耗尽仍失败/阻塞，不声称准备已获全集或已到终页。author/review同改提示，禁止把find_elements结果序号当点击index；宿主复用既有查询、分支、loop和预算，不新增浏览器循环。准备仍须新采有效来源，四次失败不可离线改判。

第三次 `bat-g5-real-repeat-9vvHRj` 已结束：sourceSuccess=false、sourceGaps=[]，11次已完成模型调用、10个浏览器命令。真实第一页读取成功、完整 Next 查询返回4份同址链接、导航第二页成功；done 明确剩余步数不足以调查终页，未编译/复跑。这是本次脚本12步预算未覆盖必要调查，不能说已证明完整任务成功，也不归因于读取器。

中间只读探查补齐：Python 与 TS 分别验证额外 find_elements 的实际参数、完整 verified read、规格、文档与事实摘要；普通查询正常编译并通过 readiness 后才折叠为 supporting，副作用不放行。所属新 Python 用例1/1、生产 Python→TS 桥1/1；初次导入路径错误以及 repeat_method_evidence_invalid、consumer_readiness_live_read_required 均保留为首次失败，修复后通过。复跑仍使用原两个读取节点和原 loop，不重复探索动作。

第四次隔离来源已启动于 `bat-g5-real-repeat-fkD3t3`，vendor digest `7fd4d9835df4a969b4408851b39e3895deea6ed51aa1784243317ad78923b509`。恢复18步/240秒准备上限，增加通用编号分页终页调查提示；只有来源接受且零缺口后才进入330秒/零模型普通复跑。前三次原始来源和失败不改写，此次仍不是G6正式任务。

### 2026-09-27 G5 浏览器前驱检查点关联：实现前记录

Product Alignment:
- natural-language task: 多页读取或表单链在纯计算节点后中断，恢复同一运行并继续正确浏览器前驱。
- reusable chain boundary: 既有 TaskCheckpoint 与节点执行事件的浏览器来源关联。
- runtime inputs: 当前检查点、固定链版本、现场浏览器身份与节点回执。
- dynamic task outputs: 可核验的恢复或保持暂停，不猜测前驱节点。
- generic platform capability used: TaskChainRuntime、原检查点/事件持久化、HybridRuntimeScopeState。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 纯计算/循环节点之后保留最后实际浏览器结果的精确来源。
- existing implementation in repository: TaskCheckpoint.browser、节点 finished event、digestJson、LangGraph 驱动与既有 verifyResume；events 当前没有浏览器回执关联，末事件不等于末浏览器节点。
- mature candidates and pinned versions: 沿用既有 LangGraph 1.4.14 与 Zod 4.6.2；无新增库或调度器。
- selected implementation / reused public surface: 扩展原 checkpoint 的可选 browserNodeId 与原 finished event 的可选 browserStateDigest；结果、节点和摘要一起持久化。
- B-A-T-owned adapter and remaining gap: 核验最新浏览器回执的 node/invocation/digest 与现场身份；纯节点不覆盖，旧缺字段不猜，pendingEffect 不恢复。
- license/runtime/platform fit: 既有 TypeScript/Node/Windows 依赖，无许可证变化。
- browser/runtime/state ownership conflicts: 无第二检查点存储；不启动浏览器、不改变循环调度。
- replay model calls: 0。
- rejected candidates and evidence: 不用 events.at(-1)，它会指向 deduplicate/loop/branch；单独 nodeId 不能把该节点与具体 browser 摘要关联。
- focused validation: 生产 runtime 的 browser→纯节点→取消/恢复；新 observedAt、pending effect、篡改 node/receipt/身份及旧检查点拒绝。

实现结果：新关联只由实际浏览器结果生成，与 finished event 后的既有 syncCheckpoint 一起持久化；每份 persist 快照均核验关联。纯节点不覆盖；最新带 browserStateDigest 的事件必须与 browserNodeId、invocationId、原 checkpoint.browser 摘要一致。恢复的新 observedAt 不改写历史回执，运行内 resumeBrowser 供实际恢复节点形成下一份结果。Hybrid verifyResume 对新关联恢复失败返回 ok:false，保留人工恢复与旧无字段的保守边界。

- 新所属 `hybrid-checkpoint-browser.test.ts` 首次 3/6：三个断言直接对未经过 Zod 规范化字段顺序的夹具算摘要，修为原持久化 checkpoint.browser 后 6/6；追加每份 persist 快照的关联检查后仍 6/6。真实 TaskChainRuntime 的浏览器 capability→纯 branch→节点边界中断得到 paused/interrupted，同 run 恢复读取成功；再次中断、旧 browser 节点、篡改回执、pending effect、现场漂移与旧检查点均已覆盖，零浏览器/模型调用。
- 定点选择现有 human waitpoint、协议认证等待、未决浏览器副作用、capability 取消四项，4/4；Runtime 包 check 通过。第一次 API check 被并行 `hybrid-natural-repeat.ts:223` 类型错误阻挡，本项文件无报错；新增实际脚本的首次 check 暴露 config JsonValue 未收窄的两条类型错误，补对象/非数组守卫后最终 API check 与 diff 检查通过。
- 新实际验收入口 `apps/api/tests/g5-repeat-resume.acceptance.ts` 读取 BAT_REAL_REPEAT_DIRECTORY 中已成功完整复跑的 chain/plan/compilation/run，使用单一可见受管 owner；首 read 后纯节点完成再中断、落盘、handoff/focus、新 Runner 同 owner 恢复，校验同 run/首 read 不重派/模型 0/finally 精确关闭。脚本必须 BAT_RUN_REAL_REPEAT_RESUME=1 才能运行，当前仅编写未执行，不算真实恢复通过。

### 2026-09-27 G5 Profile 所有权恢复：实现与局部验证

Product Alignment:
- natural-language task: 用户维护专用浏览器账号状态；关闭或重启后只能在本次资源释放有证据时恢复任务使用。
- reusable chain boundary: Profile 所有权门，适用于登录后查阅、表单等任务；不改任务链调度。
- runtime inputs: 专用 Profile 路径、owner/lease 身份和私有 runner 归属回执。
- dynamic task outputs: 本次窗口、runner 和临时目录的独立核验结论。
- generic platform capability used: 既有 ManagedWindow 租约、RunnerProcess、psutil 进程身份核验与受管目录清理。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: Profile 账号窗口关闭未确认后的独立恢复。
- existing implementation in repository: `ManagedWindow` 已持久化 owner/lease、浏览器 PID/启动时刻/exe、CDP 与 target；`RunnerProcess` 已有 handoff、独立窗口操作、分阶段 close 回执及精确临时目录清理。
- mature candidates and pinned versions: 复用现有 browser-use 0.13.8、CDP-use 1.4.5 与已安装 psutil；不引入进程控制库。
- selected implementation / reused public surface: 现有 ManagedWindow.start/handoff/end/inspect、RunnerProcess.close、removeRunnerTemporaryDirectory；psutil 仅核验旧 runner 的 PID/创建时间/exe，仍存活时拒绝恢复，不杀 PID。
- B-A-T-owned adapter and remaining gap: `profile_start` 接入既有租约，启动浏览器前保存版本化私有 owner 回执；独立恢复先验证旧控制进程已退出，才允许关闭该租约窗口。临时目录删除必须匹配受管临时根、精确目录及目录内 owner token。
- license/runtime/platform fit: 沿用仓库已集成的 Python 3.12 / Windows 组件，无新依赖或许可证变更。
- browser/runtime/state ownership conflicts: 只作用于本 owner；共享 Profile、登录态和其他 owner 资源不删除。旧空 `owner.pending` 缺身份，保留明确 legacy blocked。
- replay model calls: 0。
- rejected candidates and evidence: 不采用随机 ownerId + 扫描无 Chrome 后清标记；该方式不能证明旧 Python 已退出，也不能追溯其临时目录。
- focused validation: 新会话 owner 持久化、关闭失败后重启恢复、旧 runner 存活/身份不符/其他 owner/非法临时目录拒绝；先无真实浏览器的所属测试，真实窗口样本等待根 agent 释放单会话。

实现与当前验证：已删去新会话写空 `owner.pending` 的路径，改为浏览器启动前保存版本化 owner；账号窗口复用 ManagedWindow handoff，原 runner 关闭确认后才显示 open。重启后的 `recover` 使用新 runner，先核验原 controller 与 Windows venv launcher 的 PID/创建时间/exe 均不再存活，再核验 lease.creatorPid 并调用既有 end/inspect；无 PID 猜测或额外进程控制。临时目录必须为受管系统临时根下的精确目录且 `runner-owner.json` 身份一致，删除前复核 owner 标记未变。旧空标记明确返回 `browser_profile_legacy_owner_unknown` 并保留。

- 所属测试首次 TS 6/6、Python 7/7；补充 Windows launcher 存活/冒认拒绝后 TS 6/6、Python 9/9；补充无自动化 capability 的 Profile handoff 后 Python 10/10。测试无浏览器/模型调用；API 包 `check`（含最终 launcher 协议）通过。
- 真实临时 Profile 首次 open 失败：外层 `browser_profile_open_failed`，离线定位为 `hybrid_profile_runner_owner_mismatch`；Windows venv 启动器 PID 与实际控制 Python PID 不同，浏览器尚未启动。finally 清理确认，原始结果保留在 `work/profile-owner-smoke-first-pass.json`。
- 修复后实际 fd3 ownership 握手已通过；故意在持久化回调中止，未调用 profile_start，runner 清理 confirmed / activeResources=false。
- 第二次真实样本仍失败：Profile 不创建 OrdinaryCapability，既有 handoff 却无条件调用其 close，导致交付失败；独立恢复 finally 成功，清理确认。已增加 None 保护，失败结果保留 `work/profile-owner-smoke-second-pass.json`。
- 第三次独立临时 Profile 真实样本通过（零模型调用）：open→持久同 owner/lease 的 handoff→原 runner cleanup confirmed→重建 service 看到 cleanup_required→recover closed；共享 Profile 哨兵仍在，本次 owner/lease 消失、finally 清理确认，临时样本目录最后删除。成功结果 `work/profile-owner-smoke-result.json`，可复查脚本 `work/profile-owner-smoke.mts`。两次失败不被本次成功覆盖。
- 本项闭合的是 Profile 窗口所有权恢复局部链路；工作台按钮真实点击、用户真实登录态及 G6 正式新任务验收未测。旧空或身份损坏的标记仍安全拒绝恢复。
- 本项 Python 位于 `apps/api/python`，不在 vendor 源 manifest 范围，未改他人条目；Runner import 与 vendor 核验通过，核验时 digest `6556dee21603e10aa45e09efcff1b4d1498ca4eb9edab051f55425ebfbe643d7`。

### 2026-09-27 G5 真实发布列表首次失败与定点修复

GitHub openai/openai-agents-js/releases 首次隔离来源 \bat-g5-real-repeat-9SuYDi：17次已完成模型调用、16个浏览器命令；sourceSuccess=false、trace.completed=false、output=null，编译/复跑未启动。读取第一页和第二页成功；Next 查询实际匹配4份同址链接，但 max_results=1 导致截断，没有完整 verified read。done 返回失败，未找到真正终页（曾探查 page=999 空页，最终在page=3）。另一个 include_text=false 属性探查被错误当作业务读取，产生 find_elements_read_query_incomplete。首次失败不撤销，原始 source/receipt 不改写。此前 max_results=1 的方法约束不适合这一真实页面，现改为完整查询后唯一目的地。

独立生产 Runner 对同一真实页面完整读取 Next，4个href均指向page=2；2个浏览器命令、0模型调用、finally清理confirmed且activeResources=false，证据在临时目录 bat-g5-next-inspection-8H6xNj/inspection.json。这个查询仅用于定位问题，不计正式来源或产品通过。

修复：完整查询可有多份同址链接，source验正后以显式 repeat_destination 绑定，复跑复用既有 data.transform/deduplicate、maxItems=1 合同和 loop；两个不同目的地必须在导航前失败。未放宽通用 prior_verified_read 唯一路径规则。新增Python生产编译正反例1/1首次通过；TS动态去重/歧义例1/1首次通过；4份同href Python→TS桥1/1首次通过。属性探查修复由dom_query严验身份/参数/摘要，但不伪造业务读证明；首次新测试5个断言失败重现缺口，修复后新5+旧5=10/10，补充绑定拒绝后新6/6。当前仍不能声明G4/G5通过，G6未开始。

修后隔离重试 bat-g5-real-repeat-iGdi1Q 仍失败：17次已完成模型调用（另17条intended审计，不计为34次实际调用）、16个浏览器命令，全程停在首页。两次声明成功的读取实际coverage为0，后续6次字段投影失败；sourceSuccess=false，sourceGaps为a-0003/a-0008的natural_read_empty_sample_unproven；模型done明确未证明分页转场/终页。该次未进入编译和复跑，原始回执保留；正在针对真实读取失败做零模型定位，停止同配置付费重跑。版本fork摘要d7accbd918db4084c78915296a63f74c003b6afc6c3342c7bacc361279b4b1b3。

读取失败诊断补齐：原私有日志主动丢弃整个 readError，重启后只知failed。现在只保存固定allowlist错误码，仍剥除字段名/selector/页面正文，未知错误统一bat_read_fields_failed；精确新测试首次1/1，验证已知码保留及敏感内容不落盘。旧日志不会补造原因。

读取故障零模型对照已完成：同一个生产Runner检查5种方法，:scope可见文本与原成功方法均total=10/sample=3；title属性失败是selected_value_not_text，'.'失败是invalid_selector，空容器为0/0。安全结果在work/read-method-probe-20260927.result.json；finally浏览器/capability均confirmed且closed=true。底层读取器没有错误，不重写。方法工具现在空sample登记前拒绝；字段错误仅反馈合同字段名、非负计数与固定原因，并说明:scope/默认可见文本；两项新增必要用例各首次1/1。旧失败source不修改。

G2既有测试夹具基线已修：JsonValue由真实schema.parse校验，transport payload改复用生产naturalPayloadContext，物化受影响例首次5/5；旧handoff夹具补齐与completed相符的done/finalResultRef，精确用例首次1/1，真实到达预期compiler_fixture_failure。没有改生产合同或跳过验证；最后API类型门待统一执行。

API/Workbench 当前类型门均通过。首次合并类型门发现本轮新 acceptance 脚本未先收窄 compilerVersion 就访问 repeatMethods，显式核验 v2 后只重跑 API 并通过；G2 原四处类型基线错误已由夹具修复消除。TS scope 新例首次 0/1 重现失败字段探查被一律阻断，修后 1/1；仅接受精确 action/resultRef、同 tab/URL/document 的只读失败探查，失败点击/导航与身份漂移均拒绝。

第三次真实来源隔离运行启动于 bat-g5-real-repeat-9vvHRj，fork 摘要80d9ed49c9ec865a34e2b491eafa13f8a5f549b04ec6dd629df4aa55c927c9c1。本次因读取反馈和空样本边界已有真实定位/修复才重试；Agent预算降为12步，准备180秒；只有来源和编译通过后才启动独立零模型复跑，其330秒总超时覆盖既定300秒运行预算。与前两次失败分开，不计G6。

### 2026-09-27 G5 继续实施：完成边界已验，重复方法适配进行中

本轮继续处理工程缺口；随后实际采集和首次失败记录如下。`done` 保留五类固定安全错误码，未知异常不泄漏正文；同路径读取冲突提示只选择一个代表引用。完成复核的 initial/continuation、模型原判及宿主改判写入私有 `native_completion_review` 事实，保留拒绝语义；后续复核不回喂这些判断。

所属 `test_method_completion` + `test_author_completion` 最终 18/18（0.357 秒）。首次 17 用例有 7 个断言失败命中缺口；首次修后复测另有一个新增测试访问未创建属性的夹具错误，修正后通过。准备 repeat 注解边界 `test_repeat_annotation` 8/8（0.157 秒）；首次夹具未补模型默认字段导致摘要校验错误，修正夹具后通过；其证据验证器在该测试中隔离，不计真实循环证据。循环 scope 前驱边界定点 `node --import tsx --test --test-name-pattern='循环读取只接受' apps/api/tests/hybrid-read-scope.test.ts` 1/1，证明只接受已授权 entry/advance 且拒绝外部页面/owner 变化。

已接通 source fact → Python 折叠编译 → TS 独立校验 → 既有 loop/branch/accumulator。当前只支持一个尾部地址推进方法，严格要求动态唯一继续查询、终止样本、同构读取、稳定键和同版来源；不放行旧失败来源。Python `test_natural_repeat` 6/6（生产 normalizer/compiler，无浏览器），首次 4/6 为新夹具 max_results=5 不满足明确的唯一性预算1；改夹具后通过。旧 `test_method_source_compile` 2/2。TS repeat 4项、旧 cardinality 4项通过；Python→TS 编译桥1项通过。同一个不可变 chain 在三页和变化后的一页数据中运行，验证末页先累积、稳定键去重、无 Next 不推进、限额在下一次导航之前执行。非 completed 终点原会丢弃部分结果检查点，现复用既有 `syncCheckpoint` 保留；完整输出仍只由 completed 产生。API check 仍仅4个既有测试类型错误，无新增。

TS/桥首次失败分别为夹具漏通用失败终点、共享图误添既有 loop 不支持的 cancelled outcome、测试漏 TaskOutput.contract、桥的 entry binding 放错 pre/post；失败终点清掉 checkpoint 是实缺口，已修。query 完整性第一次仅按 requireComplete 检查而拒绝；核实成熟 read_fields 已用 includeOrdinal 同样拒绝截断后，验收接受 requireComplete 或 includeOrdinal，不改旧 ReadSpec 摘要。源码自检全部新增模块在500行内，未增第二个浏览器循环或调度器。

G4/G5 真实行为门与 G6 仍未通过。当前开始一次 GitHub `openai/openai-agents-js/releases` 公开发布列表的 G5 隔离真实采集→离线编译→普通复跑，独立目录 `bat-g5-real-repeat-9SuYDi`，最大18个Agent步骤、总超时360秒，复用现有产品模型选择。此样本不创建正式工作台任务，不计G6。运行前主服务4173连接被拒，SQLite实际 tasks/taskAuthoringJobs/taskExecutions 均0；第一次只读查询误用别名 authoringJobs，查实际表名后修正，无数据库写入。下面的“本次停止点”为此前历史结果，当前已继续实施。

### 2026-09-27 复核更正：G5 是未完成的工程缺口，不能认定无法解决

此前以三页静态受控样本的失败作为停止依据，未证明问题不可解决。该样本只覆盖基础读取与翻页，不能代表真实网站适应性或正式任务验收。此前“无法安全完成 G5”的表述只能说明当时没有满足准入条件，不能作为无法继续开发的结论。

本次只读复核现存原始 `bat-g5-loop-source-jpbObZ/source-result.json`：`a-0007/a-0008` 两次 done 都提交 `[r1,r2,r3]`，工具均返回 `completion_read_reference_invalid`；三个成功读取引用均写入 `headings`。生产 `complete_from_read_refs` 禁止同一结果路径的多个引用，抛出 `completion_read_path_conflict`，而 `AuthorTools.done` 将所有异常统一改写为引用无效。随后 `a-0009` 选择 r3，原生结果为 Cedar；续查后的 `a-0011` 改选 r1，原生结果为 Amber。因此“最终只剩第一页”有具体的引用选择与合同边界，不能笼统归因为浏览器未读到后页。最终完成复核的详细 reason/followUp 未进入持久化来源，现存通用拒绝码不能证明其具体语义原因。循环生产者与 IR 映射仍未接通；本次没有追加模型或浏览器试跑，也没有改写旧来源为成功。

### 2026-09-27 本次停止点：G5 来源重复方法阻塞，G6 未开始

第三次隔离受控采集 `bat-g5-loop-source-jpbObZ` 用具名 `headings` 输出合同与真实生产 Runner/模型，7 个浏览器命令、13 次已完成模型调用。现场确实访问三页，连续两次点击 Next，三次 `bat_read_fields` 成功，终页查询 `main > h1, main > a` 只见标题；但来源 `trace.completed=false`、`sourceSuccess=false`，输出只有第一页标题，最终 gap 为 `completion_review_after_continuation_unresolved`。首次 `done` 被复核续查，两次后续 `done` 虽记录 success，最终来源复核仍未接受。原始 receipt/result 在该隔离目录，未转写为手造 source 或发布链路。

两次 Next 的动作目标仅见相同 XPath；各自 `dom_structure` 明确带 `query_candidate_unavailable`、`upstream_dom_coverage_not_proven`，终止查询只在末页发生。当前 source/v3 没有可证明的循环范围、每轮继续/停止条件、动态 Next 定位、每轮累积和稳定键；编译器对重复签名仍给 `repeated_operation_reuse_unproven`，TS 控制图不生成 loop。把这两次点击直接折叠成循环会猜测用户意图与目标，违反任务书的 G5 门。现有生产者还未给出可准入的重复来源，无法安全完成 G5；停止继续模型采集和循环编码。Profile 未确认清理的独立恢复核验入口也未完成。G4/G5 行为退出门未过，G6 的正式全新任务、发布/复跑/原窗口交付及产品删除均**未测**；当前服务 PID 15616 尚未加载本轮新代码。

### 2026-09-27 G5 局部：歧义回访与任务私有诊断删除

准备来源仅含 `confirm_intent` gap 时，`authoring.ts` 现在返回 `RequirementClarificationRequired`；缺证、拒绝来源及服务错误维持原分类。定点接纳测试最终 1/1（用例内覆盖五种分支）。首次运行在旧 `hybrid_completed_source_required` 失败，改动后的首次运行又因测试夹具预期写错失败，修正夹具后通过。未重跑整个旧夹具文件，其最终编译项在 G2 已有独立基线失败；真实浏览器回访未测。

任务删除现在从该任务持久化 authoring job 的 `id/browserRunId` 精确清理来源诊断 JSONL，其他任务的同类文件和共享 Profile 保留；路径归属或删除未确认时保留任务供重试。隔离 SQLite/文件的 `task-deletion.test.ts` 最终 5/5，覆盖双任务隔离、删除失败保留与修复后重试。首次 4/5 是测试给其他任务直接插入不合法 job body，API 投影 400；改用生产仓储写有效 job 后，第一次重跑 4/5 又因测试误把 Fastify `app` 当 TaskChainService；修正该夹具引用后 5/5。两次失败都未到待验证删除不变量。尚未验证运行服务重启、真实产品任务删除，G5 整体未过，G6 不开始。

Profile 清理未确认现在投影 `cleanup_required`，保持浏览器 busy，并在启动前创建私有 `owner.pending` 标记；仅确认关闭后删除。服务重建见到标记仍阻止打开，工作台显示清理待确认且允许返回工作台，不把它显示为“可供任务使用”。隔离 Profile service 测试 3/3（含未确认关闭和重建）、Contracts/Workbench `check` 通过；API `check` 仍仅有前述四处旧 hybrid 测试类型错误。`RunnerProcess.close()` 会缓存未确认结果且丢弃部分资源句柄，重复点关闭不能核验清理；当前不提供虚假的自动重试，需独立 owner/进程/临时目录核验后才能安全清标记。真实 Profile 浏览器和实际服务重启未测；此恢复入口仍是 G5 缺口。

G5 循环来源首次受控采集失败：独立临时目录 `bat-g5-loop-source-iI4FkW`、本地三页 Next/终止站点、真实 Runner/模型，12 步与 240 秒上界。首次启动因脚本误用 workspace 当前目录，未读到 SQLite，模型/浏览器均未启动；修路径后来源 `sourceSuccess=false`、5 次 `wait`、最终 `done(success=false)`，实际只有 `about:blank`，6 次已完成模型调用。脚本只给 `entryUrls`，未按生产 `browserUseTask` 将入口写入模型可见任务，故无页面动作或循环证据。原始 receipt/result 保留在该隔离目录，不计产品失败；修正模型可见入口后最多再做一次定点采集，不改变现有服务和归属不明的 Chrome。

第二次受控采集在 `bat-g5-loop-source-WE3qKa` 成功导航第一页并 `find_elements`，但模型五次用 `outputPath=["value"]` 调 `bat_read_fields`；该路径不在当时根数组输出合同内，均返回 `natural_read_output_path_invalid`，最后 `done(success=false)`。7 个浏览器命令、8 次已完成模型调用，未访问第二页；不是循环通过。该结果保留作精确反例。受控输出合同现收敛为具名 `headings` 字段，以核对模型是否能注册实际路径；若仍失败，不反复原样采集。

### 2026-09-27 G4：能力路径矩阵已成，行为退出门未过

逐项“生产者→持久化→编译→运行”的现行源码证据和缺口见 [RESEARCH G4 矩阵](RESEARCH.md#2026-09-27-g4正式能力路径与缺口矩阵)。本轮没有新产品任务、假 source 或脚本改稿。生产 Runner 的独立临时 Profile 真实浏览器定点：`npm exec --workspace @browser-capture/api -- tsx --test tests/managed-window-runner.acceptance.ts` 1/1，原窗口同 owner/target 在 Runner 退出后恢复与结束；`npm exec --workspace @browser-capture/api -- tsx --test tests/hybrid-interaction-read.acceptance.ts` 1/1，同会话点击、后态等待、读取及遮挡处理，普通动作模型调用 0。两项首次均通过、现场由测试关闭；既有 Chrome PID 13468 和服务 PID 15616 未触碰。

确定缺口：自然来源的重复签名目前返回 `repeated_operation_reuse_unproven`，只生成线性图，TS control loops 为空；Python 返回的 `confirm_intent` gap 可能被 `authoring.ts` 先抛 `hybrid_completed_source_required` 遮蔽；Profile 关闭未确认仍复位 closed；任务删除未删本任务来源诊断 JSONL。真实多组/跨页范围续查、动态选择、首次 source→裁剪→编译→复跑、取消后派发计数/原现场恢复、人工等待、正式原页交付和彻底删除仍未测，不以已有 runtime loop 或两项受控浏览器样本代替。G4 矩阵可供 G5 逐缺口实施，但全能力行为退出门尚未通过；G6 仍禁止。下一项 G5 先修这些确定边界并取得缺失的最小真实样本，再回判 G4/G5。

### 2026-09-27 G3：F5 模型字段减法与精确证据引用

来源提案模型输入从 `searchTool/subject/query/outcome/candidateUrls` 收敛为 `subject/query/searchId/candidateIds`。后备搜索的 `searchId/results[].id` 已在模型可见工具正文中；原生 Pi `web_search` 的旁听结果现在先经公开 `source_search_references` 工具展示调用及结果 ID，未展示不得提案。宿主按指定调用验证原样 query 和候选 ID，再推导 provider、URL、`none/unique/multiple`；同词多次查询不取最近一次。新 `SourceResolution.searchId` 随现有来源事实持久化，旧记录仍可读。模型仍判断原始结果是否与业务需求相关，Question 仍由已校验来源投影。

准备期 `bat_read_fields` 只向模型返回 `readRef/outputPath`、至多三条代表值和当前 DOM 覆盖摘要；完整 ReadSample 的值、digest、页面/document 身份、container digest 和覆盖留在 `MethodReadRecords`，现有证据验证与编译继续消费宿主记录。没有把完整证明挪入字符串。vendor 源码清单五项哈希已更新，`verifyForkSource` 通过，来源摘要 `44a8a3ba0f22382d4ce4441311a053eecba9d1420f64dca470298cec4362e30b`。

验证目的：同词双查不串来源、原生搜索 ID 必须先展示、结果 ID/数量/原样 query 准入、题板和 SQLite 重启读取保持来源身份；读取模型视图缩小后编译仍持有完整证明。搜索两文件定点测试最终 17/17，补 `searchId` 重启读取断言后只重跑受影响文件 15/15；workflow-use 读取工具、证据及标量样本三文件 `unittest` 最终 21/21；Contracts `check` 通过，`git diff --check` 通过。首次搜索组合 16/17：旧断言改为检查内部 `details`，没检查模型可见 `content`，修正断言后通过。首次 Python 21 项中 1 失败、1 错误：旧夹具未计现有 `read_path=[]` 参数，且命令未加 API Python 模块路径；修正夹具和 `PYTHONPATH` 后通过。API package `check` 再次仍仅报 `hybrid-count-sample.test.ts:83,108`、`hybrid-result-cardinality.test.ts:34,70` 四处既有类型错误，未写为通过。

G3 所属字段与证据边界的定点门通过。未测真实 Pi provider 对新版工具协议的响应、真实浏览器读取、运行服务加载和正式 UI 全阶段；这些不能由假事件及离线样本推断。下一门 G4：逐项核对正式入口、来源、编译、运行及真实浏览器行为；G6 仍禁止提前开始。

### 2026-09-27 G2：F2 结果形状与 F3 选择注解合法拒绝

F2：准备草案的数据结果现在必须显式给出“结果形状”，缺失时以 `preparation_draft_result_shape_required` 拒绝；不能再由宿主暗中补成单条记录，原草案保留。F3：现有 workflow-use `selection_annotation` 的模型结果区分合法 `SelectionProgram` 与受控的 `insufficient_evidence` 原因；合法拒绝只产出原有编译 gap，不伪造选择方法。模型响应不合合同为 `selection_annotation_invalid_response`，服务故障仍为 `selection_annotation_unavailable`，不混作证据不足。vendor 来源清单的源码哈希已同步，`verifyForkSource` 通过。

验证目的：缺形状不推进草案；合法选择方法、缺证、观察选择冲突、无效响应及服务失败走各自消费者。F2 所属窄范围测试最终 2/2；两文件联合定点测试 23/24，唯一失败是现有 `preparation-draft-handoff` 的最终编译夹具在 `hybrid-method-evidence.ts:40` 读取缺失代表输出，尚未到预期 `compiler_fixture_failure`，不写成通过或归因于 F2。F2 首次 npm exec 路径错误，目标测试未启动，修正 workspace 相对路径后才得到上述结果。F3 `unittest` 选择注解 10/10、source 边界 4/4；首次尝试 `python -m pytest` 因该环境未安装 pytest，目标测试未启动，改用现有 unittest。所属差异 `git diff --check` 通过。API package `check` 仍有 G1 记录的四处既有 hybrid 测试类型错误，未重复运行，也不宣称通过。

G2 所属 F2/F3 生产者与消费者边界的定点门通过；联合测试的旧夹具失败保留为独立未解基线。未测真实模型响应分布、浏览器来源、运行服务加载及正式 UI/SQLite；G6 仍不得开始。下一门 G3 F5：实际字段减法和精确搜索引用。

### 2026-09-27 G1：F1 调用身份与 F4 发布事务

F1：`TaskChainRuntime.executeInvoke` 现在先解析本次子输入，再用父节点幂等键（含父 run/invocation/节点及活动外层 loop）、子稳定键、子链 id/version/digest 和输入摘要生成调用 ID；只按此 ID 复用已完成进度，核验原进度 tuple，子调用幂等键绑定同一身份。旧格式检查点的弱调用 ID 不足以证明已发生副作用归属，恢复明确失败，不猜测并重派。F4：`TaskProductService.publishDraft` 在现有 SQLite 事务内同时保存 Release、删除活动草稿并写同请求操作回执；service 仍在变更前核对 requestId 与请求正文冲突。

验证目的：同子链不同 invoke 节点/输入/版本/外层循环各自派发、同次恢复不重派已完成调用；发布回执失败不能留下半份 Release，成功重试只得同一版本、异内容同 ID 拒绝。`npm exec --workspace @browser-capture/runtime -- tsx --test tests/invoke-identity.test.ts` 新用例 4/4；`npm exec --workspace @browser-capture/runtime -- tsx --test --test-name-pattern=invoke tests/task-chain.test.ts` 既有 invoke 3/3；`npm run check --workspace @browser-capture/runtime` 通过。`npm exec --workspace @browser-capture/api -- tsx --test tests/task-draft-lifecycle.test.ts` 最终 2/2，使用 TaskChainService、隔离真实 SQLite 和 `operations` INSERT 触发器注入故障；失败后草稿在、Release/回执都无，撤故障后同请求发布成功且幂等。F1 定点首次均通过；F4 测试首次 1/2，失败为新夹具未采用持久化后规范化的 requirement digest，未到故障触发器，修夹具后只重跑该文件。两项 `git diff --check` 通过。

API package `check` 仍仅报 `hybrid-count-sample.test.ts:83,108` 与 `hybrid-result-cardinality.test.ts:34,70` 四处既有类型错误，不写为通过。运行器验证使用生产 TaskChainRuntime 及受控 invoke 能力，发布使用隔离 SQLite 生产 service；没有真实浏览器、运行服务加载、恢复外部页面或正式工作台证据。G1 的所属程序不变量已通过，下一门 G2 F2/F3；不提前进入 G6。

### 2026-09-27 U01–U35 界面收敛：源码处置与定点验证

U01–U35 的逐项处置见 [UI 清单](UI_MAINLINE_REDUCTION_CHECKLIST_20260927.md#本次执行记录u01u35)。默认界面删去重复状态/入口、流程教材、画布 idle 计数与预览、常驻评价和诊断计数；共享题板 U11 经 SSR 确认无重复，无需改协议。U28/U33/U35 只核验保留，不计删除。Profile、人工等待、原窗口交付、样本/独立复验、手动发布、永久删除确认及原始审计入口仍在。历史节点标题由精确执行的冻结 Release/试跑候选投影，来源/链/run 身份不符时不借当前版本标题；现有图与历史事件的浏览器动作名称共用一份合同映射。

验证目的：检查删减后的跨组件接线、题板实际共享渲染、画布事件只属所选 execution、历史事件不被当前 Release 误标。`npm exec --workspace @browser-capture/workbench -- tsx --test tests/chat-timeline.test.ts tests/interview-search-projection.test.ts tests/interview-shared-rendering.test.ts` 16/16；`npm exec --workspace @browser-capture/workbench -- tsx --test tests/chain-workbench-projection.test.ts` 6/6；`npm exec --workspace @browser-capture/api -- tsx --test tests/execution-event-titles.test.ts` 最终 2/2；`npm run check --workspace @browser-capture/contracts`、`npm run check --workspace @browser-capture/workbench` 最终通过；所属源码 `git diff --check` 通过。测试/类型检查只证明这些边界，不证明真实浏览器 UI/SQLite/重启。

首次失败单列：访谈测试第一次命令误用根相对路径，未启动目标测试，修正为 workspace 相对路径才 16/16；Workbench `check` 首次报 U04 `blockedReason` optional 类型和 U10 搜索条缺 `description`，最小接线修正后通过；历史标题测试首次被双步骤夹具的单步骤预算拒绝，补后备动作名时另有一次 TS 转换语法错误，均只修所属文件后最终 2/2。第一次差异检查发现 `ChatTimeline` 尾部空行，已删除。API package `check` 仍是 `hybrid-count-sample.test.ts:83,108`、`hybrid-result-cardinality.test.ts:34,70` 四处既有类型错误，U 组 API/合同新文件未报错，不把它写成通过。

未测与已知缺口：真实工作台逐页、键盘/窄屏/亮暗、原窗口交付、Profile 实际关闭、查看/缩放不写 revision、历史持久化及重启读取均未测；当前服务尚未加载这些源码。`BrowserProfileService.close()` 遇到 cleanup 未确认仍在 `finally` 复位为 `closed`，服务端可能误报可用，留给 G5 浏览器所有权/清理边界定点修复和验证。当前不创建产品任务或使用归属不明的 Chrome；下一门是 G1 F1/F4。

### 2026-09-27 D4 旧格式读取退出

删除旧 `/api/task-chain/legacy` GET/查询合同、service/repository/store 原文读取及诊断 `legacy` 摘要；工作台不再展示旧兼容记录。没有删除 SQLite 旧表、迁移或导入标记，当前 source/v3、草稿、Release、execution 和事件的读取职责保留。D2 后发现的旧 `accept:workbench-simplification` 脚本仍驱动已删除的手工编辑并引用旧诊断，已连同其 preaccept 命令退役；现行需求对话验收脚本和命令保留。

验证目的：旧产品读取入口不再注册，现行诊断/历史仍可解析，旧库迁移不会改写必要原始字节；这些定点检查不证明运行服务已加载新代码或 G6 重启读取。Contracts/Workbench `check` 通过，Workbench 连接/历史/诊断定点测试 7/7 通过；API storage 定点测试首次 2/3，失败在原测试把当前 v19 库只局部删表后伪造成 v9 的无效迁移夹具，调整为真实 v18→v19 迁移后该文件 3/3 通过，SQLite 直接读取 `plans.body` 保留原字节。源码定点核对无旧路由、`legacyOriginal`、旧仓储读取及诊断字段消费者。API package `check` 仍仅报前述四处 hybrid 测试类型错误，不把它算通过。

当前 PID 15616 的运行服务尚未重启加载本轮删除，API 动态 404 与真实工作台历史操作尚未验；不拿运行中旧进程的行为评价当前源码。下一组为 U01–U35 剩余界面收敛。

### 2026-09-27 D2/D3 与 U19：写图、人工拾取和布局写入退出

从工作台删除节点增删/改路由/源码与 selector 表单、`save_task_draft`、人工元素拾取入口及轮询、拖拽保存布局；草稿和 Release 共用只读动作说明，React Flow 保留平移、缩放、适应视图和阶段返回，并用已有自动布局。API/合同及 runner 同步删除拾取专属路由、状态、请求和 Python handler。保留 `createTaskDraft`、仓储 `saveDraft`、IR/绑定验证、草稿试跑/发布、账号 Profile 登录/open/close、B-U 原生定位、TargetResolver、ReadSpec 和 descriptor registry 版本。没有添加第二套编辑器或浏览器框架。

验证目的：退役命令与拾取请求在边界被拒绝，普通草稿/发布和账号登录不因共享文件删减而失效；静态检查不能证明真实浏览器或画布运行态。Contracts 与 Workbench package `check` 通过；API `browser-profile`、`chain-presentation`、`task-draft-lifecycle` 定点用例 6/6 通过，编辑后 `chain-presentation` 受影响文件 3/3 通过；修改的 Python 命令/入口 AST 解析通过；Zod 定点检查确认旧 TS 写图命令和拾取 `startUrl` 被拒绝。旧 picker/写图引用的源码字面核对无剩余消费者，`git diff --check` 通过。

Workbench 定点图投影和连接测试的**首次组合运行 12/13**：图投影 6/6，通过；连接末项因已退役 `setJsonPath` 断言未同步删除而失败。移除该断言后只重跑连接文件，7/7 通过。Agent 的首次 Zod 单次验证因缺 `--input-type=module` 未启动正确模块，修正调用后通过；两次均保留为验证脚本失误，不写成产品首次失败。API package `check` 在代码变更后再运行，仍仅有 D1 已记录的四处既有 hybrid 测试类型错误，没有 D2/D3 诊断；未把失败重命名为通过。

未测：真实画布点击/缩放对 revision/checksum 和试跑资格的运行态影响、真实账号浏览器登录、真实 B-U 定位/读取及产品任务。当前归属未证实的 Chrome PID 13468 仍不动；在所有权明确前不借用其会话。后续 D4 可独立进行，G6 不提前进入。

### 2026-09-27 D1 智能修复退役：定点验证与基线失败

D1 已从工作台移除调整入口、候选审阅/接受拒绝/恢复侧栏和专属轮询状态；从 API/合同移除五个调整命令、专属作业/快照/诊断/提醒投影及模型调整服务与 prompt。`review_execution` 只保留接受和业务含义回需求对话，旧调整命令在 Zod/API 边界被拒绝，不落入通用取消。普通准备、来源重编译、首次草稿创建、试跑、手动发布、执行等待与清理仍保留。D1 相关节点说明里只删调整按钮；D2 的草稿写图和 D3 的人工拾取尚未处理。

本组验证目的：证明退役命令不可进入主线，同时保住草稿、发布与结果处理；类型检查只证明静态接线，不能证明真实浏览器或正式 UI 主线。`npm run check --workspace @browser-capture/contracts` 通过；`npm run check --workspace @browser-capture/workbench` 通过；`npm exec --workspace @browser-capture/api -- tsx --test tests/execution-review.test.ts tests/task-chain-profile-gate.test.ts tests/task-draft-lifecycle.test.ts` 为 5/5 通过；`npm exec --workspace @browser-capture/workbench -- tsx --test tests/task-chain-connection.test.ts` 为 8/8 通过。未创建业务任务，动态失败/等待/清理及画布使用仍待 G6。

`npm run check --workspace @browser-capture/api` **首次失败**：既有 dirty 的 `hybrid-count-sample.test.ts:83,108` 与 `hybrid-result-cardinality.test.ts:34,70` 出现 `JsonValue`/`transportRequest` 类型不匹配；D1 源码没有该次诊断。该组不原样重跑，不改写为通过；错误不属于 D1 删除职责，按任务书继续独立 D2/D3。G1 前仍需核对这一类型基线及本组依赖，不用它掩盖 D1 定点通过。

### 2026-09-27 执行任务书：G0 现场复核

按本次执行指令，在现有 `master@43ed3851636e748aed973df67fd1c61bc76e96eb` 继续；大量既有修改、删除及未跟踪文件均保留，未建 worktree、reset/clean、提交或推送。`GET /api/health` 报服务 root `D:\work\browser-auto-tool`、PID 15616；4173/4175 的监听者均为该 PID，进程 cwd 同 root。进程没有 `BROWSER_CAPTURE_*` 数据目录覆盖，按 `scripts/dev.mjs` 当前配置，实际数据库为 `data/workbench.sqlite`。

G0 只读复核：`GET /api/tasks` 为 `[]`；SQLite 只读 `quick_check=ok`、`foreign_key_check=0`，26 个业务表中仅 `aiSettings=1`、`imports=1` 非空，`tasks=0`，其余为 0。未重复清库或启动产品任务。另有 Chrome PID 13468 监听 9223，profile 路径在本项目 `work/formal-acceptance/ui-profile`，其原父进程已不在；目前不能证明它归属本次服务或当前 execution，保持原样，不据此声称无活动浏览器资源。`/api/browser-profile` 的无 Workbench Origin 只读探测被 `forbidden_ai_origin` 拒绝，未继续试探。旧快照的 UI/私有文件空态未在本次重新验证。

本次直接指令要求完成或无法解决卡点时关机，覆盖任务书旧会话的“不关机”交付备注。当前下一组为 D1 智能修复退役；G1–G6 均未开始，正式产品验收不得提前进行。

### 2026-09-27 新 session 先删后写迭代任务书

按用户要求交付[开发迭代任务书](DEVELOPMENT_ITERATION_TASK_20260927.md)，包含当前现场、阅读顺序、D1–D4/UI 到 G1–G6 的依赖、每组产物/退出条件、最小验证、阻塞处理、交付格式及可复制启动词。它引用现有设计和删除清单，没有新建另一套产品合同或状态。

本次只读复核仍为 `master@43ed3851636e748aed973df67fd1c61bc76e96eb`、既有 dirty 保留；健康接口 root 指向当前 checkout，PID 15616 监听 4173/4175；任务 API 为空。只读 `data/workbench.sqlite` 的 26 个业务表仅 aiSettings=1、imports=1 非空，tasks=0，quick_check=ok、外键问题=0。本次未重新浏览 UI 或扫描私有目录，不把此前空态验收当作本次新结果。

当前仍只编辑文档，没有修改生产代码、运行产品测试、启动产品任务或改变服务状态。六份相关文档的 115 处本地文件链接检查通过，新任务书/临时交接无格式问题，已跟踪文档的定点 diff 检查通过；独立文档复核补明首次失败、夜间等待和 D6 待决的处理分支。新 session 收到执行指令后才开始 D1；G0 只复核，不重复清库。睡前执行不包含关机、提交、推送、全量测试或绕过人工等待的授权。

### 2026-09-27 逐环节 UI 完整删除清单

用户确认“本轮写完整删除清单”。已完成[主线 UI 删除与收敛清单](UI_MAINLINE_REDUCTION_CHECKLIST_20260927.md)：15 个界面环节、U01–U35 共 35 项处置，每项有当前源码定位、删除/合并/按需展示或保留范围、验收条件。不是 35 个功能全部删除。D2–D4 已随 D1 纳入删除计划，替代下方较早“待决”登记；D5/D6 仍是待决建议。

- **已完成：源码审查与文档登记。** 覆盖新建导航、访谈搜索/题板、草案、准备画布、验证发布、正式运行、结果原窗口、历史诊断、提醒及设置；列明重复文案/状态/入口、技术教材、默认评价表单、写图/拾取和旧兼容展示的收敛范围。开发方案、ROADMAP 和旧工作台设计入口已同步。
- **通过：文档定点检查。** 五份相关文档的 95 处本地文件链接均存在，U01–U35 编号连续且唯一；已跟踪文档的 `git diff --check` 通过。只检查文档，不代表产品测试或 UI 验收。
- **保留边界：** 业务结果、搜索证据、必要问题、当前原始错误、即时反馈、样本/独立复验、手动发布、人工等待、资源清理、原窗口操作及永久删除确认。UI 去重不删除后台事实，不新增一套主操作状态机。
- **未实施、未测：** 未修改生产代码，未运行测试、新 B-U 或业务任务，未逐页核验真实渲染。共享题板/同轮错误重复展示的条件性风险已单列，不能当成已复现。已有紧凑提醒、折叠搜索依据和 headless 设置不重复算作新成果。
- **后续顺序：** 按当前方案完成 D1–D4 与 UI 最小删减验证，再进入 G1；完整运行态 UI 验收随 G6，不能为凑截图提前造任务。清单完成不代表删除功能或产品主线已经完成。

### 2026-09-27 智能修复删除任务登记及同类功能评估

本轮按用户要求只更新文档、核对当前调用面，没有删除或修改生产代码，没有运行测试/业务任务。智能修复的模型建议、候选差异、接受拒绝、恢复及专属 UI/API/状态已登记为 D1；保留唯一草稿、试跑、手动发布、真实错误、人工等待与资源清理，三个任务情境继续如实展示。后续先落实 D1，再处理 G1。

同类项已在[当前方案 §2.3](INFRASTRUCTURE_MAINLINE_DEVELOPMENT_PLAN_20260927.md#23-功能减法登记与同类功能评估)列出证据与建议：D2 手工链路编辑、D3 人工元素拾取、D4 旧格式读取/投影残留建议删减；D5 观察调速建议冻结扩展，D6 多业务步骤/each 自动创作建议另列后续能力阶段。D2–D6 尚未定案或执行，不代表已移除现有能力或取消既定门。单链循环/分页、参数化、普通准备选择注解、原窗口交付及 headless 不纳入上述删除。

旧工作台/能力审计文档中把智能修复列为当前交付门的条款已标明后置；共享草稿、发布、幂等、运行归属和清理不变量继续有效。索引中出现的旧 `TaskRunDialog.tsx`、`useTaskRunner.ts`、`repair.ts` 经实际文件列表核对已不存在，没有将这些历史文件重复登记为当前删除收益。

### 2026-09-27 本地任务清空与开发方案交付

按用户明确要求清空全部本地产品任务，本轮只做清理和文档，没有修改生产代码、运行测试或新建产品任务。当前仍为 `master@43ed3851636e748aed973df67fd1c61bc76e96eb`，全部已有 dirty work 保留；无 worktree/reset/clean/commit/push。

- **通过：本地清空。** 清理前 23 个任务、94 条 execution、18 个 Release。先经既有命令处理等待调整及已无活动资源的 cleanup，再由真实工作台同源调用产品删除 API，23/23 成功。停服后核验并清除 API 遗留的 31 条任务操作回执、10 个 Pi 会话 JSONL、含 9 个孤儿绑定的索引及 47 个来源诊断 JSONL。
- **通过：重启一致性。** API `/api/tasks` 为 `[]`；SQLite 所有任务领域表均为 0，完整性 `ok`、外键问题 0；Pi 私有会话与来源诊断目录文件均为 0。UI 已刷新并目视核验“每个需求，一个独立任务 / 新建需求”空状态。服务 root 为当前 checkout，PID 15616，4173/4175 可用。
- **保留：** 模型配置逐行一致、`aiSettings=1`、防重复导入标记 `imports=1`；用户共享 Profile 和登录态未动。SQLite 已 checkpoint/VACUUM，未创建旧任务备份。旧任务 ID 和产物从此不再是可查询的本地证据，下方记录只保留历史结论。
- **失败/待修：产品删除覆盖。** 产品 API 删除仍遗漏上述孤儿回执和私有文件；本次维护补清只证明最终清空，不能宣称删除功能所有场景通过。后续按开发方案 G4/G5 定位覆盖，G6 在同一任务原窗口交付后验证正式 UI 彻底删除。
- **完成：开发文档。** [当前方案](INFRASTRUCTURE_MAINLINE_DEVELOPMENT_PLAN_20260927.md) 记录主线输入输出、action 配套职责、F1–F5、模型字段删改规则、G0–G6、最小验证和遇错处理；§2.1 逐项映射历次讨论及关闭条件，补明搜索 Timeline/题板、同现场续查、来源依赖保留、人工等待和原窗口交付；§2.2 单列尚待证据决定的设计。结构参照 arc42/Google 技术写作指南，未宣称标准认证；本轮只做文档链接与一致性检查。
- **未测/未完成：** F1–F5 尚未实施；基建充分性、方法编译接通及新正式任务全链验收未通过。该时点下一项原为 G1，后被上方 D1 功能删减登记更新；完整顺序只在当前方案维护。

以下各节为当时的阶段记录；其中“任务保留”“当前服务”“下一步”不覆盖上面的最新清理事实及当前方案。

### 2026-09-27 基建审查重新排定优先级：先确定性边界，再减模型字段，再连接能力

按用户最新要求，本轮只读审查真实主线及配套能力，没有修改生产代码、运行测试或启动浏览器。结论与输入输出表见[基础设施审查](MAINLINE_METHOD_COMPILATION_GAPS.md#8-基础设施正确性充分性与-llm-字段所有权审查)。当前不能认定基建正确且充分。

确定问题：子链缓存按 chain.id+stableKey 跨调用复用输出，未核对本次输入/版本/外层循环身份；数据草案漏写结果形状时默认单条记录；选择注解要求拒绝却只有成功 schema；发布事务未包含请求幂等记录，存在已发布却无请求回执的故障窗口。来源提案的 outcome 可由候选数派生；后备搜索模型可见 ID，原生搜索没有同一可见标识，不能直接统一为 ID 引用。

原有 TargetResolver、OrdinaryCapability、StepVerifier、read_fields、LangGraph、检查点和 cleanup_required 的必要职责及实际调用已核对，应保留。正式草案入口固定 main/once、derivations/edgeCases 为空；此前对构造 count 合同的局部验证不等于正式入口有此能力。读取期间 DOM 一致性和点击派发前焦点变化仍列未证风险，不当作已复现故障。

下一道门是调用身份与发布事务的所属修复，随后是缺字段/拒绝结果的准入和模型可见字段精简；不直接补循环、不继续数量夹具、不开展新产品验收。checkout、HEAD、API PID 与 SQLite 作业计数本轮只读复核未变，所有原有改动及任务事实保留。

### 2026-09-27 确定断点已作局部修复；主线能力仍未补齐

已修复真实空查询生产者到采集的断点、字符串数组采样范围与 coverage 错报、准备数量豁免误用到正式 ResultBinding，以及同版 count 的样本/正式阶段混用。缺少选择或累积时，编译现在拒绝已知不满足数量合同的直接绑定；这只是防止误编译，没有补出选择或循环能力。详见[本轮修复及剩余能力门](MAINLINE_METHOD_COMPILATION_GAPS.md#7-确定断点的定点修复与剩余能力门)。

本轮新增所属 Python 验证 19 项、TS 验证 9 项最终通过；scalar 首轮有 4 项因 Node 夹具 this 错误失败，修正后仅重跑这 4 项；TS count 有 1 项因夹具缺 postconditions 失败，补齐后仅重跑该项。不能称全部首次通过。两个只读复核未发现本轮新增确定缺陷，但只检查了采样/数量/count 边界。最终 API 类型检查尚未执行；没有根级或全量验证。

**这些是模拟 DOM/CDP 与源码级验证；没有真实测试页面、真实浏览器或新的产品任务。** 用户指出 100 条仅是方法提炼的例子，本轮围绕数量夹具推进偏离了能力补齐重点。停止继续追加此类测试；自然来源如何表达和证明重复方法、如何复用现有 loop/predicate/accumulator 编译仍未实现，多步/each 也未闭合。不得用局部通过数量代替这些能力或正式验收。

核验仍为 `master@43ed3851636e748aed973df67fd1c61bc76e96eb`，全部 dirty work 保留。API `/api/health` 为 PID 24680、root 正确；未重启服务。SQLite 只读核验：authoring completed17/failed47/interrupted7/waiting_for_human1；execution completed80/failed12/blocked1/cleanup_required1，queued/running 均为 0，未新增运行。当前服务健康不能证明已加载本轮改动。

本轮改动的 17 个受管 Python 源码/测试清单项已定点同步；setup 来源核验通过，digest 为 `1650e716434eb6ce4550cd3171ccb44b269aefb0e609fdb51f8f3f431eb908da`。只完成源码一致性收尾，未重启服务或继续测试。

### 2026-09-27 配套能力正确性复审：方法门未闭合

本次只读审查纠正了上一轮“局部通过即可补循环接线”的判断。原生动作配套层的稳定定位、单次派发、后态轮询等职责应保留；未注册的目标滚动/可见等待与自动动作准备存在重叠，不能直接全部启用。

已证：采样兼容性被复用到正式 ResultBinding，可放行 max300→min1000 的不可能直绑；前 N 选择与读取预算仍混用；标量数组可能整批读却报告 sampled=1；派生 count 的代表值仍被完整业务约束拒绝；空查询真实生产者仍将零命中标为不完整，新消费者测试未覆盖此断点。详见[配套方法正确性复审](MAINLINE_METHOD_COMPILATION_GAPS.md#6-配套方法的架构职责与正确性复审)。这些是当前源码可证问题，未用旧运行或局部测试推定产品通过。

本次未修改生产代码、未运行测试或新产品任务。服务 PID 24680/root 正确且健康，SQLite 没有 queued/running 作业；现有任务计数未变。下一步先修阶段语义与生产者/消费者不一致，再决定重复控制适配；下方的局部测试执行记录保留，不能视为 A 门通过。

### 2026-09-27 方法引用局部接通；先核对既有 action 配套能力

当前工作树已接通 `bat_read_fields → 宿主少量采样 → done.readRefs → 来源 → 自然编译`；沿用既有 `ReadSpec/read_fields`，没有新建浏览器执行器。最终业务合同未改，准备推进只在真实方法证明的数组路径接受代表样本。采样 13、工具 7、证据 8、引用完成 4、done 边界 6、完整编译 2 项，以及 TS 来源 11 项通过；API 类型检查通过。首次运行存在夹具错误，修正后仅重跑受影响项，不能称全部一次通过。

用户追问的原生 action 配套层已按真实调用路径核对：动作注册/参数校验、稳定目标、普通动作执行、后态与等待、DOM 查询转读取、动态选择函数均有当前调用；目标滚动/可见等待等补充工具当前 author 未注册；循环/累积执行能力已有，但自然编译的 loops 仍为空。详见[配套能力使用现状](MAINLINE_METHOD_COMPILATION_GAPS.md#5-原生-action-配套层的使用现状)。优先补既有能力接线，不能把“入口未接通”泛称为“底层能力不存在”。

补充准备边界 5 项通过：完整空查询可形成动态读取、合法无副作用的 done 引用纠错可继续、真实浏览器失败仍保留 gap。受管源码清单已同步，source digest 为 `0e52ee0831bcc7f3ec9f8918c195ccce7b7da0f27c450cd0dd5bb2cd87dcd414`；服务未重启，此摘要不代表现有进程已重新载入全部改动。

自然重复控制尚未补齐；没有新增 B-U 或产品验收任务。下方为此前阶段快照，不覆盖本节方法引用的局部完成状态。

### 2026-09-27 先核查系统差距，暂停新增产品测试任务

当前 checkout `master` / `43ed3851636e748aed973df67fd1c61bc76e96eb`，原有 dirty work 保留。新核查和实施门见[主线方法编译差距](MAINLINE_METHOD_COMPILATION_GAPS.md)。三个已证实断点：最终业务值反推 DOM；代表样本、单次读取预算和最终数量耦合；自然编译只生成顺序链，未接通已有循环运行能力。读取与循环执行器已经存在，不另造控制会话或调度器。当前还未补齐“方法 → 引用式结果 → 自然循环编译”，因此不能开始新正式任务验收。

本轮完成一项独立最小修复：scroll 优先保留已有物理后态；裁剪读取后若某动作失去唯一后态，则保留 `missing_effect_proof` gap 与不可编译 coverage，移除不合法候选段，不再输出 `postconditions=[]` 引发跨语言协议拒绝。原始来源与证据引用保留，不放宽 TS 合同。

- **通过**：`test_natural_scroll_effect`、`test_natural_read_liveness` 所属 Python 验证一次，9/9；包括滚动后所有读取被裁剪时仍保留物理证据、没有直接证据时返回 gap、不产生空后态候选段。
- **未实现**：读取方法与采样边界、引用式完成交接、当前自然入口的循环提炼与物化。
- **未测**：修后真实 B-U、首编译、样本/独立复验、发布、正式复跑与原窗口交付；本轮没有新增产品任务，也没有重试旧任务。9 项检查不代表这些产品门通过。
- **验证范围**：没有运行根级/全量测试，没有为文档修改扩大测试范围；没有切换 checkout、创建 worktree、提交或推送。

下一步固定先闭合单次读取方法及引用，再接重复控制；这两个能力门通过所属最小验证后，才执行全新正式任务。下方较早的“下一步直接验收”记录以本节为准。

主线阶段边界已记录于 [ADR 0012](../adr/0012-mainline-single-source-and-phase-boundaries.md)：第 0 步为单一来源决策，第 1 步采集/离线编译分离及第 3 步旧模型计划入口删除已在代码中实施，尚无该新合同的正式产品验收记录。TS 在接收 JSON 后只保存一次状态为 `received` 的 `source/v3` 原文，再校验合同与同版身份；校验拒绝时保留这份原文，但不授予编译资格。Browser owner 关闭结果单独写 job 来源引用，恢复时严格重读新三字段并核对身份。旧 `source/v2`、`received-source` 和旧模型计划仅留历史查看，不提供执行兼容，也不删除历史 SQLite。Python 所属定点 4/4、TS 独立定点合计 26/26；来源拒绝后留原文、关闭失败及首编译失败等 5 项重跑通过，属于原 26 项子集。最近来源回调类型修改后的 API 检查与 Workbench 包类型检查通过。受管 fork 摘要已同步为 `36e1d5f2bec037b48f0bd3d4635d4eaf24ae76b199d6bcb5ec9c4c3b62aeb44f`。本阶段未新增 B-U 试做；第 2 步结果引用真实读取仍未完成。

服务最终在本项目 checkout `D:\work\browser-auto-tool` 以 PID `24680` 运行，API/Workbench 端口为 `4173`/`4175`，exec session `12000`；重启前 SQLite 中 authoring/execution 的 running 和 queued 均为 0。重启后的服务与工作台只读核验不触发 B-U；它只证明当前服务可读，不替代首次采集、编译或正式交付验收。

截至 2026-09-26，最新正式工作台新任务为 `9644a3a9-351a-45d4-93ca-9a6bc26c5087`：自主搜索、来源题板与唯一同版草案 v1/revision 3 已由 UI 确认；首次准备 job `fcd7d36e-9528-4fbb-864e-302eeb3a9f7d` 的 Python author、序列化和传输完成，但 API 结果 schema 准入失败，来源 artifact 0、compilationCalls=0，服务未崩溃。后续同版第二次 job 只作协议诊断，不可替代首次通过。第六条任务未进入首编译、样本、独立复验、发布或正式复跑；本轮尚无一条新普通任务完成全链一次通过。各门状态见 [ROADMAP 当前门表](ROADMAP.md#当前阶段全新任务首次门槛仍未通过正式交付验收待完成)。

完整查询到宿主双快照投影、原窗口 Runner、提醒菜单和静止访谈任务删除已有对应局部验证；真实人工等待、含 Release 删除及发布链的原窗口交付仍无产品验收。旧首次 API 中断和旧可见 `read-fields` 的精确历史子因依然无法从现存证据追认。下面保存的是较早任务与当时实现状态，不作为当前服务或完整验收结论。

### 2026-09-26 较早业务目标失败与当时未修状态

在这次较早核查时：checkout 为 `master@43ed385`，原有 dirty work 保留。**当时最新的正式新任务**为 `449e20e7-91aa-46ed-bac1-2cdc93b0ad8c`，只从工作台输入一句普通需求“帮我在哔哩哔哩播放《凡人修仙传》最新一集。”开始；它没有借用旧任务、Release 或开发脚本改草稿。访谈自行做了来源搜索和会员条件搜索，并自行提出无推荐项的资格 Question。操作者只以普通用户角度回答“不确定有没有会员；看不了就报告，不改播旧集”。该轮模型产生了符合目标的草案，但服务端先检查未取代的旧 Question，revision 3 失败；定点修复后由工作台重试，revision 4 的唯一草案 v1 才确认。**因此整条链不是一次通过**，不能用后续成功覆盖这次失败。

同一任务随后从正式工作台完成 B-U 代表试做、首编译、自动样本与独立复验、手动发布 Release V1、一次 `headless=false` 的正式复跑。B-U job `f671368b-091c-4608-8814-f0e1264c8e3b` 首次完成：从官方番剧详情页读取 177–184 正片候选，点第 184 集后页面标题匹配，媒体后态由 `not_playing` 到 `playing`；编译链 `bb587f96-d68d-401f-824a-58534f50c223` 是运行时读候选并选最大非预告正片，没有把 184 或站点写入平台源码。样本 `43065ad7-1924-4ed8-87d1-f9bc7db264ce`、独立复验 `cf07ceb1-3832-4b15-8a5a-b151ae4c4da7` 和正式复跑 `a67b6ccd-5607-4827-8904-210d40762b84` 均技术 `completed`、cleanup `confirmed`，每次 6 个浏览器命令、0 个 TaskRun LLM 调用。手动发布为 `8c1fb9f5-1350-4d1b-8b61-cc170ae11ac3@1`，digest `0dab1dd553f8941325c4bd436ac64b9fb4e6b0737279fe0433dc29f21fab8ff3`。Workbench 展示 V1、5/5 动作完成；API 与 SQLite 的同版引用和三次独立 execution 对齐。重启 API 后此摘要的 SHA256 前后同为 `05292b6d4f7b222543331e566d30cc6fd49e6715eddfb8588cd386768dbfff75`，再次打开 UI 仍显示相同 V1 与完成状态。UI 截图在忽略目录 `work/fresh-ui-acceptance-20260926/`。

**证据限制与新修复：** 本任务的首次来源题板保存了动作链接标题“点击观看/追番”和“来源身份尚待确认”，虽然同次原始 `web_search` 的来源列表有作品原标题；这不满足需求阶段“依据可审阅”的完整门。通用 Pi 搜索候选解析已修复同 URL 原标题覆盖，所属访谈/来源定点测试 29/29、API 和 Workbench 类型检查通过，但这条既有任务的来源事实没有改写，也没有新任务验证修后首次来源题板。三次执行的结构化结果均为 `null`、`evidence=[]`；B-U 有第 184 集标题和 `playing` 后态，正式复跑只有媒体后置条件成功，未单独保存当次所选集数、画面或时间推进。正式可见模式的设置和运行命令已核验，实际可见画面**未测**，不能宣称用户可观看的播放已完成验收。此前污染任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的失败事实仍保留，见文末历史记录。

**2026-09-26 业务结果纠错：本任务失败。** B-U 的 `li[title]` 读取只拿到当前选中的 177–184 分组，其中 2 项是模式项、8 项是正片；`dom_query.complete=true` 只表示这次 CSS 查询的 10 项未截断。B-U 对局部 8 项取最大值得 184，编译产物和三次运行复用了同一缺陷。官方播放页近期可查到第 192 集会员正片、第 193 集预告；184 不是最新正片。用户确认的同版需求明确要求执行时的最新已发布正片、受阻时停下而不改播旧集，故 B-U、样本、独立复验、正式复跑的技术 `completed` **均不能算业务通过**，Release V1 不可作为成功验收或再次运行的正确版本。调整反馈 job `9e0000d1-86c4-4c42-88ee-99d61f47b693` 错误地返回 `requirement_revision`，重复追问是否要核实全部分组；该行为也未通过。隔离的只读页面核验再次确认页面有多个范围分组，不改变任何产品草稿、版本或执行。

根因首先在 B-U 现场调查：它把当前视图的一次 `find_elements` 未截断，误当成“最新”候选范围已调查完毕，随后选了 184。`author.py` 当前提示还把调大 `max_results` 写成覆盖“complete candidate list”的办法，强化了这个误解。编译器只核对已记录的读取、选择、点击是否一致；它不能重建 B-U 未访问的页面状态，也不应新增分页/候选域业务判断门。修复重点是 B-U 在原浏览器仍打开时，按已确认目标主动调查可能改变选择的页面入口；临时完成前若现场依据不足，用同一 Agent、同一 job 继续，而不是重跑整个任务碰运气。现有 browser-use 完成后 judge 仅附判断，不会自动续做；同 Agent 续做和 trace 衔接仍需定点核验。**该修复尚未实施，未完成修后产品复验，稳定一次通过未达成**。本任务已确认草案也没有表达“完成后留窗供用户观看”；正式运行会关闭窗口，画面持续观看未测。受管 fork、本地脏工作区和历史 Release 均保留。

交互交付的跨层设计已整理为[修复交接第六节](NEXT_SESSION_REPAIR_HANDOFF_20260926.md#六组合结果与交互交付同一草案贯穿整条链)：当前草案解析与运行结果只有 execution/data，单步 `main` 计划未携带活浏览器交付合同，正式 Runner 总会关闭浏览器。计划中的同版交付投影、B-U 目标页/结果采集、编译动态绑定、正式窗口交接和 UI/SQLite 租约均**未实施、未验证**；不能把本文档方案写成产品已修复。

### 历史快照：2026-09-25 新标签恢复接入与新任务验收进行中

- 沿用 `master@7d590363` 当前 checkout，保留既有 dirty work；未创建 worktree、reset、clean、提交或推送。正式 Workbench/API 仍在本机运行。旧《凡人》任务的脚本修订成功记录仍不是首次正确编译的产品验收。
- 将实验项目已验证的 `PopupResumeAdapter` 行为接入本项目单个受管 Browser owner：`Browser.start()` 后、业务动作前安装，对新 page session 在原 B-U attach 回调前有界恢复；owner 清理时恢复原回调。没有注册第二个 CDP attach handler，也没有改实验项目或 site-packages。
- 定点 Python 测试 `test_popup_resume.py` 3/3 通过：`waitingForDebugger=false/true`、超时与短命会话、原回调和清理失败时的还原。B-A-T 自身 headless Runner 的本地 Enter 新页样本：153.1 ms 返回、`enter_error=false`、新增 1 页、恢复 2/2、能力与浏览器清理均 confirmed；证据为 `work/recovery-20260925/popup-smoke-result.json`。这只关闭本地新页恢复样本，不代表《凡人》正式准备已通过。
- 原有动态候选门的聚焦测试 `test_execution_dynamic_selection.py` 10/10、`test_author_callback_stop.py` 6/6 通过；仍只证明拒绝缺少完整候选读取的来源。正式新任务还未开始。启动前 `verifyForkSource` 查出 6 份已有本地改动的清单摘要滞后，需在审查源码后同步，不能绕过校验或盲目整跑。

### 2026-09-24 最小闭环恢复实施中（正式退出门尚未通过）

**截至本轮最新结论：** G11 新建需求至手动发布和正式复跑主线、G9 当前 provider 搜索与来源确认、G12 建议接受至新版手动发布和复跑，均已有正式 UI／API／持久化／重启证据。
G12“不采用”、过期和验证失败的正式 UI 门仍未通过；整体尚未完成。用户后续明确要求本轮不关机。下文较早的“待验”记录是当时快照，以后续分节为准。
当前没有真实待拒绝反馈；过期只能通过非中性的用户 review 改变证据，不能伪造满意事实；验证失败没有真实失败条件，不能为了制造证据故意破坏 V2。
最新《凡人修仙传》任务的修订由开发脚本直接调用草稿 API 完成，没有走产品提供给用户的修订入口；技术运行记录保留，但该任务从新建到失败修订的产品闭环**未通过验收**，详见文末取证。

本轮在现有 `master@7d590363` checkout 保留原有 dirty work，不建 worktree、不重置、不提交。启动本轮 API/Workbench 服务前备份了 v17 SQLite；正式 API 启动后迁移为 v18，工作区序号改为事务内单调递增。未改访谈或规划 prompt；用户随后单独授权新增 G12 调整建议 prompt。验证只跑受影响包的类型检查和定点测试，未跑全量测试。

- G1 当前京东任务 `695bc458-95df-410c-8cd0-e540035d98c8`：正式画布可打开无图失败侧栏，展示计划层准确路径和四份原始候选；第 4 次定向纠正仍因 `products` 整体集合缺少归属失败，达到本轮上限。API `stateSequence=2508`；SQLite job 为 `failed/forming_plan`、`browserRunId=null`、4 份候选，草稿/发布/执行均为 0。没有进行 Browser-Use 试做。证据见 `work/recovery-20260924/03-precise-plan-diagnostic.png`、`04-last-plan-correction-submitted.png`、`05-plan-correction-limit.png`、`formal-g1-current-task.json` 和 `g1-sqlite.json`。此任务不能记作完成。
- G1/G2/G9：计划候选和精确问题保存到原 job；只在可核验原候选时按同一 job 继续纠正。访谈搜索扩展事件接入共享 Timeline，业务调研与来源选择分开；相关类型检查和定点测试通过。本轮新建 Python 页面任务由用户提供准确来源，访谈无需搜索；真实 provider 搜索仍未验。
- G11 新建任务 `d104df47-a2bf-44d1-9500-c04356ff062a`：同一正式页面确认需求 v1 后生成合法方案。首个准备 job 因受管 workflow-use 本地改动的登记摘要滞后，在启动浏览器前失败；更新三处清单摘要并经 `verifyForkSource` 核验后，页面“沿已保存方案继续试做”从原方案启动新 job，旧失败记录保留。真实 Browser-Use 来源 `1bc2f1da-72dc-41bb-8fbe-b5035f803fe0` 已关闭且 `sourceSuccess=true`；编成唯一草稿，sample `42b9d7ef-0fc1-4d20-818e-d225954f4d2a` 和后续独立 verification `322be064-25d7-4446-8888-0d7b0237969e` 均完成，清理确认。页面手动发布 Release `4ee2ea37-81df-45fe-8996-aaea4e16d2a1@1`；正式运行 `bbc120f6-1cf7-4c98-88d2-009c38714918` 与 `45875efa-fc63-46fb-871d-040f949e7b40` 均完成、清理确认。四次运行各 3 个浏览器命令、0 次 TaskRun 模型调用，业务输出摘要一致；发布后活动草稿为 0。API／SQLite 摘要在 `work/recovery-20260924/g11-acceptance.json`，正式截图同目录 `g11-g11-explicit-*`。此任务无可变输入；不同输入门不适用。API 服务重启前后 `g11-before-restart.json` 与 `g11-after-restart.json` 的 SHA256 同为 `C19FAFD7DCB03F309699D55843BBEDBDCC4EB8352C01B9190E1CA8E36419E466`；同一未刷新的 UI 页面仍选中该任务并显示 Release V1、当前结果及调整错误。此项 Windows 最小主线和重启复核通过，G12 与其他失败门仍独立待验。
- G10/G13/G14：正式历史面板列出该任务四次运行，选中较早的正式运行显示已发布 V1、清理确认和该次 15 条节点事件，当前画布仍绑定原运行；页面顶部现显示当前发布 V1。编译失败恢复只接受已校验来源并走离线编译，缺失来源时停止；计划已合法但浏览器启动前受管源码失败的恢复已由本轮新任务正式走通。服务端发布门要求样本试跑和后续独立复验。G12 完整调整验收仍待完成。
- G12：已实现保存反馈与精确运行证据、结构化模型建议、差异确认和接受／拒绝／取消／过期边界；用户授权的专用 prompt 已加入。正式页面在新 Release V1 的已选动作提交一次“重名动作改名”说明，原发布和执行均未改变；首次真实模型建议因 `ai_generation_failed` 停在生成层，未形成候选或草稿。已定位当前 JSON Schema 为 336,580 字节的全量操作联合结构，正在缩小模型传输合同并保留服务端完整操作校验；建议、接受、新版验证／发布尚未通过。

### 2026-09-24 G12 后续正式闭环证据（上段为此前失败快照）

- 失败建议 job `b8a57468-f2f0-4172-8e1d-56108e1b9940` 的原反馈和运行证据保留；正式页面从该记录发起离线恢复，形成待确认候选 job `a2f0e1a2-3a01-41c4-874a-35db46798e4a`。接受前活动草稿为 0；用户确认差异后才产生唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9`。候选记录保留 `recoveredFromJobId`，没有在建议生成时改写 V1。
- 新草稿 sample `c5bb324c-9720-45b7-8c2c-6c9b86b42fcc` 与独立 verification `e165c0be-ccbe-4ac7-8c29-028d28ab93dd` 均 `completed`、cleanup `confirmed`。正式 UI 手动发布 Release `930d7739-f6f7-4ad7-8984-93fd3f3f5bfe@2`，digest `a00284bdb02a13a34e2c1de1f6d8e59da8266670967ba621a14aedbc0343f33b`；新版正式运行 `57193eb7-6b1f-43d5-82a6-e5a585dbf01f` 也 `completed`、cleanup `confirmed`。V1 原发布和此前四次执行保持可读，发布后活动草稿为 0。
- `work/recovery-20260924/g12-acceptance.json` 汇总七次执行：各自 `modelCalls=0`、`llmCalls=0`，输出 digest 均为 `7a5808fac2bce36b837bfaef3673b44eb15e7207fba861c4af9a079a7ca7623b`。`g12-before-restart.json` 与 `g12-after-restart.json` 的 SHA256 同为 `11D3469DFC73645741F76564C21FE1233DA3130D839BA16F7742852BBD4E6851`；正式页面的候选、接受、双次试跑、发布、运行和重启显示见同目录 `g11-g12-*.png`，亮色桌面与亮／暗色 390px 截图见 `g11-g12-v2-light.png`、`g12-v2-light-390.png`、`g12-v2-dark-390.png`。
- 本次建议实际只改 `output-assemble` 节点的 `label`：V1/V2 的该链节点数同为 5，变更字段仅为 `label`，执行输出一致。因此只证明自然语言建议经用户确认、验证、手动发布和再次运行的产品流程，**没有证明原链路的行为问题已修复**。G12 拒绝、过期和验证失败路径的正式 UI 验收仍未完成；G9 当前 provider 的真实搜索仍未验。不得据此宣称五组工作包或全部退出门完成。

### 2026-09-24 G9 当前 provider 搜索正式验收（上段 G9 待验为此前快照）

- 正式 UI 新任务 `882f4bb3-7a58-4986-b633-83f4c5769dd4` 从没有 URL 的自然语言需求开始。Pi 实际调用 `web_search`，再调用 `present_source_candidates`；持久化 `messages.aiEvents` 中两项 `tool.execution.completed` 均保留原始 `output.content` 与 `output.details`。搜索 query 为 `site:docs.python.org "What's New in Python 3.14"`，候选提供方记录为 `pi-web-access:web_search`。这验证了当前 provider 的一次真实只读搜索及共享 Timeline／来源候选接线，不能推广为所有 provider 或所有搜索情形均通过。
- Question Panel 展示 1 个官方候选；用户选择 `source:009bfe70f430076c645b`，URL 为 `https://docs.python.org/3/whatsnew/3.14.html`，随后又确认要读取首个实际正文段落。Requirement `a34888db-4de3-4f92-85b4-cbd1b1faeae8@1` 已确认，确认事实含 1 条所选搜索来源，`taskContracts` 中该任务只有 1 条需求记录。正式页面证据见 `work/recovery-20260924/g11-g9-*.png`。
- `g9-before-restart.json` 与 `g9-after-restart.json` 的 SHA256 同为 `367C12B25E5860A0C273CD20370D4AB00301ED2FE89E5ED2736DBF6807733240`。该 G9 专用任务没有准备 job、草稿、发布或执行；不能作为任务链生成与复跑验收。可选 `summary` 和凭据分支尚未正式验证，G12 拒绝／过期／验证失败等退出门也仍独立待验。

### 2026-09-24 恢复顺序与交互原型（仅文档／原型，产品未修复）

[能力对齐与恢复基准](PRODUCT_LOOP_CAPABILITY_AUDIT.md)已按用户复核补齐：Browser-Use 试做失败时尚无链路，技术问题先在授权范围内有界排查；代表试做成功、编译成链路、复跑验证通过、用户发布是四个不同的结果；已有链路出错才从步骤或结果提出修改、确认差异、试跑并手动发布新版。第 8 节把全部待办分成五组并写明用户效果与正式退出证据。`work/prototypes/repair-flow-v1.html` 为隔离交互原型，三情境与 11 次按钮流转经独立 Chrome 检查；它不连接产品运行。

本轮没有改产品代码、prompt、模型设置或持久化数据，没有重跑 Browser-Use 或正式任务。2026-09-22 审计计数与进程 ID 仅为当时快照，实施前须重新核对。最新任务的正常路径和自然语言调整均仍未通过正式产品验收。

### 2026-09-22 新建任务能力对齐审计（最小闭环未通过）

当前依据为 [需求到复跑：能力对齐与最小闭环缺口](PRODUCT_LOOP_CAPABILITY_AUDIT.md)。本次核验了实际 checkout、用户服务、SQLite、固定 AI Connect/Pi 公共能力和最新任务正式页面；没有修改产品实现、prompt 或用户任务，没有重开模型/B-U/正式复跑。

- AI Connect 的模型绑定、Authoring、Question、共享 Timeline/Composer 仍在；Pi 搜索 extension 实际注册成功，但本次未验联网搜索。共享 Timeline 调用缺少 extension adapter，搜索事件即使存在也不能据此认定用户已看见。
- 最新需求 `695bc458-95df-410c-8cd0-e540035d98c8` 确认后，准备 job `816f32af-8790-4e06-89f2-8b552bf856eb` 在 `forming_plan` 失败；两份 JSON 候选均违反结果所有权合同，`browserRunId=null`。该任务没有草稿、发布或执行，不得说成浏览器跑过但未完成。
- 正式 UI 实测无图失败态点击状态后处理面板仍未挂载，也没有生成/恢复主操作；另有快照序号可能回退、失败诊断缺失、任意调研被强制归入来源选择等代码确认的缺口。证据在 `work/capability-alignment-20260922/`。
- 旧链编辑、试跑、发布、运行及重启证据保留为局部通过，**不覆盖全新需求或不中断 UI 的连续生命周期**。此前“Windows 全链路完成”结论撤回；本轮新建任务闭环未通过，macOS 仍未测。

下一步按审计 G1–G8 恢复需求入口、计划/准备与失败处理，补齐 G9–G11 引用、按需历史和正式新建任务验收；仍以一个草稿、用户手动发布、同次 execution 为边界。

### 2026-09-22 工作台与生命周期减法（历史局部验收；不代表新建任务闭环）

Product Alignment:
- natural-language task: 把已确认需求生成、编辑、试跑、手动发布和正式运行收敛为两页工作台与一个活动草稿
- reusable chain boundary: Requirement、TaskDraft、Release、Execution；计划、链路和展示只作为草稿或发布内容
- runtime inputs: 当前需求、草稿 revision/checksum、试跑或正式运行输入与本次 pacing
- dynamic task outputs: 草稿内容、execution 事件与结果、用户手动冻结的不可变 Release
- generic platform capability used: 现有 Zod、SQLite/Drizzle、LangGraph TaskChain runtime、React Flow 与 Dagre
- replay model calls: 0，显式 llm 节点除外；本轮不重跑 B-U 探索
- site/task-specific code added: no

Reuse Assessment:
- capability: 单一活动草稿、显式发布、execution-owned 候选快照、当前工作区最小读取与按需历史
- existing implementation in repository: 当前 immutable plan/chain/release、execution 审计、revision 操作、React Flow/Dagre 与 SQLite 迁移
- mature candidates and pinned versions: 沿用仓库已固定的 Zod、Drizzle/better-sqlite3、LangGraph、@xyflow/react 和 @dagrejs/dagre
- selected implementation: 在既有持久化与运行边界上收敛所有权，不引入新框架
- reused public surface: Zod 边界校验、SQLite 事务、TaskPlanExecutor、TaskChainRuntime、React Flow 画布与 Dagre 布局
- B-A-T-owned adapter and remaining gap: TaskDraft/Release/Execution 绑定、手动发布门、最小快照、旧数据迁移和工作台组合
- license/runtime/platform fit: 不新增依赖；沿用当前 Windows 已验证依赖，macOS 仍需真实设备补验
- browser/runtime/state ownership conflicts: 每次产品运行仍只占用一个浏览器会话；草稿试跑冻结 execution-owned snapshot
- replay model calls: 普通试跑与正式复跑为 0；只有显式 llm 节点可调用模型
- rejected candidates and evidence: 不新增第二套状态机、图存储或前端版本资产；现有能力已覆盖核心运行和画布需求
- focused validation: 每层完成旧调用删除后只运行所属契约/服务/UI 最小验证，最终用正式页面、API、SQLite 与重启复核

- 四个事实源已经落地：普通工作区只返回 `requirement / draft / release / execution / activity` 及并发序列；历史和诊断分别经 `/api/task-chain/history`、`/api/task-chain/diagnostics` 按需读取。TaskDraft 每任务至多一份，试跑冻结 `taskExecutionCandidates`，Release 自包含计划、链路和 Presentation；保存、试跑均不发布，只有 `publish_task_draft` 可调用显式发布。
- 公开命令已收为准备/继续准备、保存/试跑/发布草稿、运行、恢复/清理/取消和用户反馈。旧 `generate_plan / author_task / generate_chain(s) / validate_* / authorize_* / set_execution_pacing`、preset/saveAsDefault、独立 repair coordinator 与兼容退休分支已清退；生产代码零引用。`Plan.tsx`、`Results.tsx`、`ChainView.tsx`、`TaskRunDialog.tsx`、`useTaskRunner.ts`、`AuthoringStatus.tsx`、旧产品投影/任务链投影及无调用辅助文件已删除。
- SQLite v17 在真实 v16 一致备份及正式库均迁移通过：7 个旧 Release、41 次旧 Execution、活动旧修订草稿和 21 个 execution-owned candidate 保留；Release 形状迁移后的历史 Execution 精确引用同步，旧 `repair` nextAction 归一，摘要错配为 0。`taskRunPresets / taskChainRevisionDrafts / taskChainPresentations` 已删除，WAL 保持启用。
- 定点质量门：contracts/API/workbench 三包 `tsc --noEmit`、Workbench 正式 Vite build 通过；34 项草稿/发布/清理/迁移/目标选择/画布投影/按需读取测试全部通过。未运行根级全量测试；Workbench 既有 `draft-projection.test.ts` 有一项与本轮未改动的需求 Markdown 投影基线失败，未伪报全绿。
- 正式页面验收证据为 `work/workbench-simplification-1790027862673/acceptance.json`、`01-four-stage-canvas.png`、`02-completed-execution-history.png`。页面只有“需求对话 / 链路画布”；1440×1000 下文档和 body 高度均为 1000、画布高 864，无主页面纵向滚动；总览 4 阶段，逐阶段展开为 5/2/2/2 共 11 个动作，普通页面无内部 ID/digest/空业务输入框，UI errors 为 0。
- 正式生命周期只执行各一次：页面拖动动作使草稿 revision 12→13 且旧试跑立即失效；sample Execution `33e1c2a2-9ecc-413f-8a71-549412767dce` completed / cleanup confirmed / modelCalls=0，Release 仍为 7；页面显式确认发布后只新增 Release `03736efa-01d5-494b-8fad-85e94234f452@8`；正式运行 `2d3a8012-a0d2-4f93-8869-66a94881ec6c` completed / cleanup confirmed，36 条事件全部属于同一次 execution。最终为 8 个发布、43 次执行、0 个活动草稿，试跑 candidate 永久保留。
- 重启证据：验收服务 PID 1108 优雅退出，PID 12096 从同一 checkout 重启；删除最后一个零调用 `exploration-reuse.ts` 及四个零调用 repository 辅助方法后，再由 PID 21304 加载最终代码。两次重启后 Release v8/digest、两次新 Execution、正式运行 sequence 46、36 条事件、试跑 candidate revision 13、8/43 计数均未变化，浏览器 profile 状态为 closed。未修改 prompt、未重开 B-U 探索、未创建 worktree、未 reset/clean/commit/push；checkout 仍为 `master@7d590363` 并保留用户既有 dirty work。
- 以上 Windows x64 的正式页面/API/SQLite/重启证据仅覆盖所列既有草稿和发布链路；新建任务闭环未覆盖且已发现阻断，见本页最新审计。macOS arm64 本轮没有真实设备证据，不能宣称跨平台完成。技术完成不代替用户对业务结果的满意验收。

### 2026-09-22 工作台减法梳理（仅文档，未实施）

用户要求先梳理文档、做减法。本轮误启动的页面与发布逻辑修改已停止并撤回，保留此前工作；不以本轮撤回前的测试声称交付。最新基准见 [工作台与任务生命周期减法基准](WORKBENCH_SIMPLIFICATION.md)：不仅删除可见冗余，还明确四个产品事实、全量协议瘦身、自动发布移除、旧命令清退、服务端/持久化职责合并、死文件删除、迁移和正式验收顺序。当前仅完成文档，代码尚未按该基准实施。

### 2026-09-22 03:04 节点修订交互与验证含义修正（Windows 编辑与单次试跑通过）

用户复核指出修订区仍暴露内部节点 ID、digest 和整链连线表，且无参数链显示空输入框及“验证不同输入”，不符合节点选中后右侧编辑的产品交互。当前正式 chain v2 的输入合同为空对象，剧名为节点固定值，因此不能把验证框描述成更换任务/动漫的入口。

Product Alignment:
- natural-language task: 在画布选中动作后修改输入和动作设置、查看输出、增删动作及调整后续路线；明确试跑范围
- reusable chain boundary: 现有 TaskChain 与 ChainPresentation 的原子修订；发布版和草稿仍严格分开
- runtime inputs: 只展示已定义的任务参数；节点固定值、上游输出绑定沿用现有 ValueBinding
- dynamic task outputs: 版本化草稿编辑及真实完整试跑记录
- generic platform capability used: 现有 React Flow、Radix、ValueSchemaForm、revision API 与编译器
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no

Reuse Assessment: 不新增库、公共字段或另一份执行图。复用现有节点操作批次与服务端编译校验，以薄 UI 适配完成原子插入、删除、路线调整和绑定编辑；只支持能够保持图和引用合法的操作，不把不完整图当作已保存。验证界面复用现有 sample / verification 事实，以“试跑 / 独立复跑”解释，无参数时隐藏空表单。既有输入含义不改，任务泛化不在本次修订中擅自发生。

- 正式 UI 编辑证据为 `work/node-editor-1790017262509/result.json`：在画布选中动作后，右侧展示输入、输出与动作设置；名称和固定 URL 输入均通过 UI 保存后还原，新增 Function 自动接回前后动作并加入原阶段，随后选中该节点删除。草稿 `b23f7a56-1208-4806-82c8-d070e3895f55` 的 revision 4→10，执行内容与阶段展示均恢复，历史运行和发布版未改，未新增 execution，UI errors 为 0。前后执行内容摘要同为 `9ea5269f29988fc3fec07c281b7c709e4bf4f39dec877fbd98667a24f5de4f73`。
- 正式单次试跑证据为 `work/node-trial-1790017373294/result.json`：从 UI 点击“试跑整条链路”，sample execution `4ca95491-e741-4ffa-8e0e-d627f5962ac2` 精确使用 candidate chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@3` / digest `8c323b1b51cecefc6cad3ae0ca7fdad10ff1b4eb935879c97cdba43c1e3fb23e`，completed / cleanup confirmed / llmCalls=0，12 transitions / 16 browserCommands / activeMs 81059。
- 试跑工具栏实际显示“首次试跑：已通过”；“独立复跑检查”可用，“发布修改”仍禁用。独立复跑未执行，本次未发布，release v7 / chain v2 保持原状。
- 最终视觉检查发现草稿画布曾禁用事件，导致试跑通过但阶段仍为待运行；已按 candidate 的 id/version/digest 和验证记录绑定独立事件批次，修改草稿后清空旧候选事件，不影响“运行结果”的选择。新增候选隔离/事件读取聚焦测试 3 项与工作台类型检查通过。重启后只读复核同次 execution，`work/node-trial-1790017373294/restart/result.json` 确认 36 条事件、4 阶段及 11 动作全部完成，未新增 execution，UI errors 为 0；运行中渐进状态未另外重跑验收。
- 默认可见产品浏览器配置已恢复，Workbench 4173 / API 4175，当前开发服务 PID 24548 / exec session 35600。验收浏览器均确认退出。
- 已移除默认内部 ID 连线列表和空任务输入框。当前链路无运行参数，剧名保存在节点固定值中；试跑会按当前草稿从头执行，不能在这里输入另一部动漫就自动改变整项任务。需要先明确并实现相应参数绑定，才能声称同链可换动漫。
- 首次 UI 验收发现新增节点弹窗错误使用 Radix `Select.Label`；已按 [Radix Select 官方结构](https://www.radix-ui.com/themes/docs/components/select) 将其放入 `Select.Group`，修复后的上述正式 UI 验收通过。复用组件的结构约束必须遵守，不自制替代选择器。
- 最小验证：原子画布编辑 3 项通过，覆盖服务端草稿应用、编译、引用保护与入口接回；相关节点配置定点测试与类型检查通过。收尾只记录既有结果，未重复测试、未运行全量测试。截图位于上述两个证据目录。

### 2026-09-22 02:51 链路阶段与通用异常边修正（Windows 正式产品复核通过）

用户复核指出：上一轮单个 `ungrouped-actions` 仅换业务标题，且把 1 条成功与 60 条通用异常边合为“61 个出口”，并未达到阶段及子链可读性要求。本轮重新打开画布验收门；此前正式运行成功证据保留，不替代本轮展示与稀疏执行链验收。

Product Alignment:
- natural-language task: 按任务业务阶段查看进度，展开同一阶段看真实动作、节点类型和当前状态
- reusable chain boundary: 版本化阶段引用同一执行图；通用异常由运行器统一收束，只有显式业务处理保留分支
- runtime inputs: 已确认需求、已发布链路及其原有输入；本次沿用现有来源和模型程序
- dynamic task outputs: 新不可变链版本与阶段展示、独立验证和复跑事实
- generic platform capability used: 现有 LangGraph StateGraph、TaskChain compiler、revision API、React Flow 与 Dagre
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no；四阶段名称和成员仅作为本任务修订数据

Reuse Assessment: 不引入或替换库。沿用 @langchain/langgraph 1.4.14 的调度与取消、现有 runtime 错误/人工等待/清理边界、@xyflow/react 12.11.6 与 @dagrejs/dagre 3.1.1；仅精简自有 IR 的重复终态路由并修正展示适配。旧显式错误路由仍可读取且保留真实业务恢复分支。验证限于变更的不变量和本任务正式修订、发布、Workbench 复跑，不重开 B-U 探索。

- 已发布 chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@2` / release `6f2cf1e6-eebd-4129-8019-34b4d65151ee@7`。执行图从 18 节点 / 71 连线精简为 11 动作 + 1 完成终态 / 11 连线；60 条通用异常边实际从新版本删除，错误在原节点保留原因与状态，业务恢复边仍优先。没有增加公共字段，没有改旧发布。
- 四阶段为“搜索《凡人修仙传》→进入番剧播放页→确定最新正片→播放并确认”，动作数分别 5 / 2 / 2 / 2。展开显示浏览器动作、读取、Function、等待及同次执行状态；阶段显示编号、完成数和状态，不再展示技术出口计数。默认纵向保证文字可读，仍支持横向及手动缩放。
- 修复正式运行时已有草稿自动覆盖已发布图的问题：只有显式编辑才进入草稿，运行接受后回到发布版。现有 `b23f7a56-1208-4806-82c8-d070e3895f55` 草稿保留；终态及阶段出口也按本次真实事件着色。
- 正式 sample `aa82c140-0fda-4556-8994-68cdfb27729a`、verification `954bfe0f-de32-4e5e-846b-22c2e5202b0b`、Workbench replay `9505d549-1afa-4283-8258-99991de59483` 均 completed / cleanup confirmed / llmCalls=0，使用同一新链；分别 activeMs 86421 / 85627 / 80071。没有重跑 B-U 探索或修改 prompt。
- 完整证据：`work/stage-chain-1790016501961/closure.json`；最终总览和四张子链截图同目录。实时阶段变化见 `work/stage-chain-1790016351783/failure.json` 的 live：该次运行及实时阶段通过，随后测试驱动对 wrapper 派发 dblclick 未进入子链；改用公开“展开动作”按钮，只读补验同一 execution 成功。更早 `cdcda86a` 运行本身成功、草稿覆盖造成图事件为空，修复后才执行上述一次正式复核。
- 重启后只读复核 `work/stage-chain-1790016501961/restart/result.json` 通过：四阶段、四子链、已发布版本及同一历史运行仍匹配，未新增 execution。已恢复默认可见产品浏览器配置；Workbench 4173 / API 4175，当前开发服务 PID 25860 / exec session 70681。
- 最小验证：10 项稀疏链/合同/分支、4 项既有取消/人工恢复、5 项 UI 投影、草稿选择及终态颜色各 1 项通过；相关类型检查通过。未运行全量测试，macOS 未测，未代替用户作业务满意验收。

### 2026-09-22 02:11 正式产品闭环完成（Windows x64）

本轮 R1–R5 / I7 的 Windows 正式产品门已关闭。需求来源 unique / multiple / none、确认、真实预执行、离线编译、候选 sample / verification、工作台普通复跑、修订发布、同 execution 清理恢复及真实需求回流均有产品证据。技术完成仍与用户对结果的满意分开；没有代替用户作业务验收。

- 新需求 v3：`work/i7-reprepare-1790013905749/result.json`。prepare `33585350-8bd6-41e1-8816-7ec341b790e1` 发布 chain `7907ec91-ffa1-4732-8af5-327e8b0252bb@1`（digest `ec152d92e3aadfae9c87b600666b2f37f49e4808406a39a99641274de2fed337`）及 release `0f670d88-9884-47af-869b-12b6aa145eaa@6`（digest `6ad7744ee1958912362307ce3a24a398313afb294b7555f16d195ee8dc69894b`）。sample `7112914e-7171-4ed5-80ed-17c8d3b32285`、verification `e4a1ebf0-d491-46e1-8fd8-6e05e5d7c719`、工作台 replay `5b3141f7-cb12-4805-8c98-51454cb7917d` 均 completed / cleanup confirmed / llmCalls=0 / browserCommands=16；activeMs 分别 83691 / 80015 / 75393。
- 编译层闭合：同目录 `source-reuse-audit.json` 核验复用失败 job `2170b909` 的完整浏览器来源，explorationSessions / explorationToolCalls 均 0；只补 a8 缺失 Function，新增 semantic_annotation 调用 1。原动作、观察、a4 程序和 history.localRef 均保留；新来源 `a2650c7b-f124-4b1f-8224-59aae68b0c15` 的 digest 为 `fe0fc38d6dbfc2ccaec49e25d00fbe2b105ffb335c4f91b0c4fe153f3b0dbead`，旧来源未改。当前受管 fork `44453845480d909488ea0febced547fb5d2f5a71737ac67aadf32e37c7105517`。
- 既有 I7：`work/i7-final-product-1790011932163/result.json` 包含真实修订、4 次普通运行、清理未确认保留成功 TaskRun 后同 execution 恢复、幂等、单次事件归属和重启；真实需求回流 v2→v3 为 `work/i7-requirement-return-1790012443299/result.json`。R1 三分支证据目录见下方过程记录。
- 用户可读投影：新发布阶段标题/说明来自对应计划步骤，精确绑定本次 chain / execution；`results-390.png` 已关闭响应式侧栏，实际查看通过，scrollWidth=390。最终只读复核 `readonly-settled-projection.json` 确认“再次运行”已启用，jobs=36 / executions=35 及全部 ID 前后不变，UI 写请求 0；独立 Chrome 正常退出。最终桌面图为 `chain-settled-1440.png` / `results-settled-1440.png`。新需求准备前的历史发布逐条保持不变。
- 最小验证：离线注解 Python 6 项、TS adapter 3 项通过；严格 TS 检查含 authoring 集成通过。未运行全量或根级测试；本轮 `git diff --check` 通过，仅存在仓库原有换行转换提示。

剩余边界：macOS arm64 按既有决定延期到真实设备，不冒充已测。普通 a4 点击历史 50.196–54.892 秒，本轮 sample 47.558 秒；删除未消费截图后仍有大部分延迟，现有普通节点日志不能继续区分目标准备、派发、事件屏障与后置观察，性能根因仍待定位。当前自然编译 Function 适配支持完整候选到 ordinal 的选择，不宣称所有纯数据变换或任意任务都已验收。

02:15 收尾：验收用 headless dev PID 24692 在无活动任务后正常退出；已移除本轮 headless 环境覆盖，以默认可见浏览器方式启动 dev PID 21892（UI 4173 / API 4175），留给用户查看。`restart-audit.json` 核验同一 release v6 / replay completed / cleanup confirmed / primaryAction=rerun，无活动 job/execution。所有验收 UI Chrome 已关闭。checkout 仍为 master@7d590363，保留全部既有 dirty work，未创建 worktree、提交或推送。

下方按时间记录本轮失败与修复过程；其中“尚未通过 / 正在运行”均属于当时快照，以本节最终证据为准。

### 2026-09-22 00:50–03:00 整体梳理与修复

用户授权从需求对话到普通复跑整体核对、修正错误和删减冗余；北京时间 03:00 停止新增操作并记录完成、阻塞及现场。当前 checkout 仍为 master@7d590363，221 条 dirty entry 全部保留；开始时 4173/4175 无监听。上一轮 job 5563cb52 已按用户指令中断，不是自然失败或完成证据。

Product Alignment:
- natural-language task: 从已确认自然语言需求形成可验证发布的通用链路，并通过正式工作台独立复跑及生命周期闭合
- reusable chain boundary: 需求确认、预执行来源、证据编译、候选验证、发布运行各自拥有唯一交接结果
- runtime inputs: 已确认需求与来源、版本化计划和任务输入、当前浏览器状态
- dynamic task outputs: 业务结果、编译产物、独立运行与清理事实
- generic platform capability used: 现有 Pi、browser-use/workflow-use、QuickJS、LangGraph 和产品持久化
- replay model calls: 0，显式 llm 节点除外
- site/task-specific code added: no

Reuse Assessment: 沿用 RESEARCH 中已核验的现有组件和版本，不引入或替换关键库。本轮 B-A-T 改动限定为交接适配、绑定和产品生命周期；不另造 Agent loop、浏览器控制器、图调度器。公开字段必须有明确消费者，可推导事实不新增冗余字段；诊断与业务合同分离。

首个确定问题：TaskChainAuthoring 在复用来源的重编译仍有任意 gap 时自动重开浏览器，使纯编译缺口越层触发再次探索。本轮已将自动重新探索限定为确切的旧动作注册合同不兼容；其他 gap 保留完整来源并在编译层报错，修复后离线重验。正式验收仍需真实预执行、发布、零隐式模型复跑、清理恢复、修订和需求回流；局部验证不得替代。

01:03 进展：已去掉任意编译 gap 自动重探索，重编译保存本次派生 artifact 及具体缺口，保留旧来源；现有注册兼容边界单项通过，API 类型检查通过。浏览器文档身份采样改为复用 pooled session 的一次 DOM.getDocument，删去临时 nodeId 查询链及仅为其存在的重试；post observation 不再请求未消费截图，scroll(index=0) 按原生 viewport 语义归一。13 项定点验证中 11 首次通过；两项 fixture/DOCTYPE 区分失败修正后分别通过，真实 Chrome 证明 getDocument=1、attachToTarget=0、querySelectorAll=0，测试浏览器已关闭。新 fork `9bb1a8d067726b089909b9d34b1a060db70a786af03874759049d5a39daa6ca4` 已同步。

产品层已修复终态准备时间、单链发布 sample/verification 相位校验、continue_preparation 先校验再记录接受幂等键，以及 sample/verification 清理待确认时保留原阶段并提供同 execution 清理入口。清理确认后服务继续通知原准备/修复协调器，不重新运行已完成的 TaskRun。正式准备 job `b0657639-468f-4571-82c5-d3927bcb0435` 于 `2026-09-21T17:02:51.725Z` 从产品 API 接受，沿用已确认需求 v2；尚未取得终态，不计通过。当前 dev 为本会话启动 PID 16892，headless，4173/4175。

01:06 同次终态：预执行完整成功、来源关闭、编译 gaps=0，source `18356035-d17e-493d-8f5e-0e8530bffbf1`（digest `2dea095926654e97a2c652d90ef3d8d2f08100572843509e63ece48a700dec27`），候选 chain `7623b02a-f531-443b-87ab-71248f97e91b@4`（digest `79cd40d5baa10a8a8517a68eea21f4ee5564dea1ef1eda652b25af4672e0f96f`），包含两段已通过 QuickJS 变化样例的选择 Function。正式 sample `be880b71-6812-4ec0-8946-a1eaefcb34de` / run `62a14de4-0bf5-49ae-8a3a-f87ba548f91c` 完成导航、输入、完整读取、第一段 Function（结果 ordinal=2）后在结构点击 s-a-0004 失败：`element_identity_unavailable`。modelCalls=0、cleanup confirmed；没有新 release。该错误已在相同结构的真实本地 Chrome 复现为 html 容器身份校验缺口，修复中。另发现 TaskRun 已计 7 browserCommands 而 execution 总计仍 0，正在修通现有账本回调；不添加第二套计数状态。

R1 unique 正式 Workbench 一次通过：`work/requirement-dialogue-workbench-unique-2026-09-21T17-03-42-935Z/` 含 acceptance.json、persisted-r1-facts.json、confirmed-requirement.png 和 cleanup.json。真实只读搜索、Question Panel 来源选择及业务澄清、修订 v2、确认与持久化均已核验，旧 v1 保留，未决 0，产品 browserCommands/browserRuns 均 0；需求模型调用 4。独立 UI Chrome 正常关闭。multiple/none 尚未执行，unique 不替代完整 R1/R2–R5 通过。

01:20 更新：真实主文档 HTML 的 frameId 与普通 DOM 子节点 frameId=null 的合法组合已在 `target_document.py` 做严格同 target、根 document、非 shadow 判定；仅放行真实主文档，iframe/shadow/其他 target 继续拒绝。与正式失败相同的结构目标在真实 Chrome 复现并修复，2 项定点验证通过（2.607 秒）。受管 fork 已冻结为 `232778df12fbe85263dccc6332312ae1eae7a10d7f1ab05b4f4894b6a3380fb9`。

随后正式 prepare `d3005a05-0eab-4a73-86af-6f1073f024c9` 离线复用 `b0657639-468f-4571-82c5-d3927bcb0435` 的完整来源：explorationSessions/explorationToolCalls/providerInvocations 均 0，原 history 与 request.trace digest 未变，派生 source 为 `4c724ee9-9a9a-408e-8731-8ef37c300152`。sample execution `9351b545-b7a5-490b-84b8-e6be98949f43` 和 verification `3cb452f6-351f-4e7d-83b5-8f1ecf2c895b` 均 completed、cleanup confirmed、browserCommands=14、llmCalls=0；两段 Function 均成功、各约 0.1 秒。系统于 `2026-09-21T17:19:47.582Z` 正式发布 chain `7623b02a-f531-443b-87ab-71248f97e91b@5`（digest `b76f9c9102cb2201698e125e477e0f12f44d63ed41d775dd7e0d92b5f5303088`）及 release `ad842045-f2da-4f9a-8b39-e0b5a2a0166a@4`（digest `9410bd817f661744301a1b6cd3d2a94e2152cfc579c5640404613a31b144b121`）。该证据关闭本次来源到验证发布门；发布后正式 Workbench 复跑、修订和清理恢复仍需本轮 I7。

运行账本现在通过已有 accountConsumption 边界计入每次实际浏览器派发（含失败、诊断与恢复观察），预算错误保留原类型，不新增第二套计数合同。cleanup.pending 的短暂自动关闭仍属于活动 execution，只有 unconfirmed/cleanup_required 才显示人工清理；compiled 计划也可在技术失败后复用，避免重复生成计划。分别完成所属最小回归及类型检查；未运行根级/全量测试。本会话 dev PID 20368 已正常退出，I7 独立应用持有当前 data。

R1 三分支的真实 Workbench/只读搜索/Question Panel/持久化证据已齐：

- unique：上文目录，另有 `confirmed-requirement-settled.png` 与 `projection-acceptance.json` 核验正常轮询后的已确认 v2 / 等待准备投影；只读复核未产生模型、执行或数据修改。
- multiple：`work/requirement-dialogue-workbench-multiple-2026-09-21T17-16-58-909Z/`。初次验收驱动的全页文字定位误点同名侧栏，保留失败证据后改为 Question Panel 内定位，继续同一持久化待回答问题；真实两候选经选择和业务澄清形成确认 v1，需求模型总调用 4，未决 0。
- none：`work/requirement-dialogue-workbench-none-2026-09-21T17-18-49-387Z/`。首轮无来源、无草稿/确认版本、确认按钮禁用，补充主体信息后由新只读搜索及选择形成确认 v1，需求模型调用 5。`initial-source-gate.json` 保留无候选时不得越过确认门的事实。

三个分支均保留 acceptance、持久化事实与浏览器退出证据；产品 browserCommands/browserRuns/jobs/executions 均 0。以上是开发验收操作，不表示用户已接受业务结果。

01:26 I7 已按精确 release v4 从正式 Workbench 启动，目录 `work/i7-final-product-1790011587219/`。前次驱动缺少 `BAT_ACCEPTANCE_BROWSER_EXECUTABLE`，在创建 UI 浏览器及产品运行前退出，失败证据在 `work/i7-final-product-1790011342260/`；补齐实际 Chrome 路径后继续，不涉及模型或 prompt 调整。I7 尚在运行，不能提前记通过。

01:34 I7 部分证据：正式 Workbench replay `490aa303-6ec2-4998-8832-5652530a59a2`、幂等 API replay `0f12047d-fe15-4624-830d-44aacf5bb1a0` 均 completed / cleanup confirmed / llmCalls=0 / browserCommands=14；侧栏只导航、事件续读和精确 execution 归属已通过。驱动在 Radix 选择弹层关闭后的焦点归还时序处报 `i7_skip_link_missing`；等待弹层归还焦点后键盘跳转已通过。继续验收只复核这两个已有 execution，不重跑；首次续验误等待历史首个 execution 的“最新运行”投影，驱动已按已有两次运行的顺序修正，没有创建额外 execution。当前证据目录 `work/i7-final-product-1790011932163/`，修订草稿 `f71ad7e3-15d5-4ec7-82dd-75c39298fc98` 的 sample `2bfaa904-ea72-42ea-89d3-894b67bbd276` 已完成，独立 verification 进行中；I7 仍未整体记通过。

另修复了实际恢复缺口：业务终态已落库但 cleanup.pending 时进程退出，重启会进入 cleanup_required，并在既有 cleanupResume 保存原 status/reason/result，TaskRun/steps/output 不变；仅显式恢复允许同 execution 的清理 attempt+1。没有 close/owner 审计时保留 pending，不伪造 unconfirmed 的证据摘要。临时 DB 重启回归与原 queued/running 恢复用例 2/2 通过；confirmed 不变、再次恢复幂等、原业务失败保留。该错误路径为定点测试证据，不冒充现场崩溃产品验收。

01:38 I7 正式闭环通过：`work/i7-final-product-1790011932163/result.json`（关联前两次运行证据目录，不重复执行）。修订 draft `f71ad7e3-15d5-4ec7-82dd-75c39298fc98` 发布 chain `7623b02a-f531-443b-87ab-71248f97e91b@6`（digest `2d71a55d8df4d271ea750de2bbe75186470fa232a9932aeb25b66e4c1cb86d7f`）和 release `5933f3e5-5f0c-4935-8516-280a1669993f@5`（digest `4566ced82fcebe6b57cc2088357463a357a5b98ae124a77efbbabd2b668fdfce`）。新发布 Workbench replay `c9ac0a6a-c3f6-4403-84fc-ceb8b8ab4199` 完成；另一真实 replay `b6e5e72c-28b2-4691-81b4-707eb27584dd` 注入 close protocol 未确认后进入 cleanup_required、TaskRun 和业务结果保留，经工作台“核验并清理资源”恢复同 execution completed / confirmed，零模型调用。普通运行、修订 sample/verification、幂等、三个 review 分流、重启持久化、键盘跳转与减弱动效均通过；这仍是开发验收，不代表用户对结果的真实满意。390px 无横向溢出通过，但当时截图被响应式侧栏遮盖，最终只读界面复核会关闭侧栏后补齐结果截图。

真实需求回流另行验证：首个驱动在任务 root 出现但页签尚未挂载时过早点击，停于 execution_selection，未发反馈、未创建 turn；证据 `work/i7-requirement-return-1790012345028/`，独立 Chrome 8632 正常 exit 0，应用已关闭。修正等待后继续，不重跑 I7、不变更业务反馈。当前真实“回对话形成新需求版本”门仍未关闭。

01:52 新需求 v3 从正式工作台确认后，prepare `2170b909-d227-46a1-8abd-a5837ab4e6dd` 完成新 plan `44378eb4-c2cd-41ed-8971-8211a1dbebce@10` 的真实代表执行，source `7cf2f991-27db-4810-8e3e-d8d6e6463858`（digest `886e62dbcda1408bd9cce85d8c6ab79725c34a6d1f122f44c6976fef270de8fd`）sourceSuccess=true、closed=true；编译停于 `missing_binding / a-0008 / selection_function_evidence_required`，没有发布或验证执行。原始完整来源保留在正式 artifact，定点只读副本 `work/reprepare-v3-source-artifact.json`。a7 完整读取38候选的 title/href/text，a8 原始 ordinal=37 的点击有真实DOM事件，done 记录目标播放；批量语义注解只返回 a4 程序、遗漏 a8，宿主原来允许这种不完整响应。不得把 v5 已通过的 I7 当成 v3 已通过。

本次编译修复 Product Alignment 延续本节约束：以同一固定浏览器来源离线补齐缺失 Function，不重新探索、不替用户补业务含义、不写站点分支。模型响应收敛为单段 source/examples，actionRef 由宿主拥有；已存在程序不重生成，缺失程序各至多调用一次。复用现有 AI Connect bridge、semantic_annotation 审计、offline compiler owner 与 QuickJS，不增加模型循环或公开业务字段。新增内部 `hybrid_annotate` 命令仅复用现有 compile 输入加现有 AuthorModel，必须无 Browser owner；返回同一已确认需求/计划和只追加派生函数的新 source payload。旧 artifact 不改，新 job 只计新增模型调用。当前实现和局部验证进行中，尚未再次提交正式准备。

### 2026-09-21 紧急修复接手：本轮证据门

14:46 UTC 受控后续：读取与观察合同已完成最小局部验证，正式准备 job `098be260-01f1-4429-84a7-8abf197f4b84` 已从产品 API 提交，结果待核验。新增导航观察五项验证 3.739 秒通过，含真实 Chrome 初始空页、html backend 对应和导航后旧观察拒绝；补充动作后诊断归属/安全持久化单项 0.023 秒通过。API 类型检查与 Workbench 生产构建通过。最终受管 fork digest 为 `120be06fb6ba32fe3d3dcf5b3aef588388fb87f123a555c776888d5483495f83`；下文较早 digest 属于各轮历史快照，不替代本轮正式产品门。

14:49 UTC 同次结果：该 job 于 `14:49:28.508Z` 失败，source `59dda871-a149-477a-8f6d-3bc4653b40ea`。6 次动作已派发，a-0006 完整读取 38 候选并形成 read-fields，无读取 gap；a-0007 是只读 find_elements，在派发前被 URL guard 拒绝。新诊断证明观察后 26.843 秒内 URL 变化，但 target/document 身份相同、两次采样均稳定；其余 32 条诊断 consistent。没有选集、done、Function 或发布。job 164.026 秒，其中 7 次模型 123.075 秒，dispatch 10.956 秒，回调 11.019 秒，author 内未归因 11.726 秒，窗外 7.250 秒。

后续修复仍属上述 Product Alignment / Reuse Assessment：只读查询不依赖旧页面索引，同文档 URL 变化时允许重新观察一次并记录新 scope，索引动作及换文档仍拒绝。编译必须同时承接该事实，不能退回静态样本 URL；只对有同文档来源证明的 read-fields 允许复跑重新绑定当前 URL，并复用现有 `current_document_id` 和 BrowserStateSummary 可选 documentId 核验同会话、同 tab、同文档，零模型、零动作重派。沿用 browser-use/现有目标身份和 scope 适配，不新增导航器或调度器。此项实现和正式验证尚待完成。

15:02 UTC 局部实现门已完成：只读重新观察/旧索引拒绝/新 scope 合同 9 项（0.171 秒）、document_identity 来源事实 1 项（0.019 秒）、API 来源准入与普通运行 scope 4 项通过；API 类型检查通过（先修复新增可选字段的 TypeScript 边界报错），工作台重建通过。现有 `hybrid-interaction-read.acceptance.ts` 真实无头浏览器验证 1/1 通过（浏览器测试 6.903 秒），确认 runner/协议共享会话读取仍为零模型。为保持单文件上限，runner 的原有 Pydantic 请求类原样抽至 `hybrid_commands.py`，原入口保留导入；导入和严格请求合同定点检查通过。受管 fork 为 `5b7d339d36902e077b96e45ddf366184c924716eb62fb374e2338fedaa077656`。正式准备 job `9651c0f2-83e9-4be2-89ae-b6fe5e0ed725` 已提交，尚未取得发布/复跑证据。

15:04 UTC 同次结果：job `9651c0f2-83e9-4be2-89ae-b6fe5e0ed725` 于 `15:04:17.438Z` 失败于 preexecuting，source `b57723a4-6dd1-468d-8486-42a7bf0eb209`、browserRun `e182d835-7e8b-47fd-8ca8-0c9ec27669fa`，sourceSuccess/completed 均 false、closed=true。4 次动作是 navigate/input/find_elements/click；a4 点击已派发成功，随后 after_step 读取 live document 失败，唯一异常诊断为 state_capture/capture_unavailable，baseline/current/summary 均空。其余 19 条诊断 consistent；未进入业务候选选择，没有 readonly_observation_refreshed、done、Function、新发布或验证运行。job 共 81.958 秒：模型 56.560、派发 9.298、回调 3.442、author 内未归因 6.497、外围 6.161 秒。当前证据只定位到第一次 live_document_sample 未返回，不足以判断具体原生 API 错误；先补齐定位和定向验证，不能直接再跑。

15:15 UTC 导航采样局部修复：真实 headless Chrome 的一次新 tab 点击后，在原生 DOM.getDocument→querySelectorAll 之间发生导航，复现 `RuntimeError` 的固定 CDP `-32000 / Could not find node with given id`。旧实现立即终止，现仅将这一 html_query 瞬态错误交已有 Tenacity 动作后观察重试，不重派点击；其他错误仍停止。新增安全 errorPhase/errorStage/errorType/errorCode/errorDigest 事实，且不再把 get_basic_info 返回 error 时附带的旧 backend ID 当成文档证明。4 项最小验证通过（3.449 秒），包括同一真实样本恢复、一次点击、重试预算和未知错误拒绝，测试浏览器已关闭。旧正式运行的底层异常不可恢复，因此这里只证明通用适配缺口与局部修复，正式门仍待确认。

15:17 UTC：冻结上述补丁并同步受管源码，fork digest `f5adad748762674981915cc8dbc4881bbaadfef33f7950e8d40aab720842f031`。无活动产品 owner 时正常重启本会话开发服务，正式准备 job `5563cb52-cdc0-4f59-89fc-eb34f9df4cf8` 于 `15:17:07.396Z` 提交；需求仍为已确认 v2，结果待核验，不另改 prompt。

本轮正式产品观测（2026-09-21 14:19–14:32 UTC；I7 仍未通过）：

- 首次准备 job `8b7716d4-d792-4c8b-89ff-a3c62b549305` 在 `14:19:23.495Z → 14:19:26.560Z`、共 3.065 秒后于 `preexecuting` 失败。主线程通过 `work/urgent-recompile-diagnostic.mts` 对原来源定点诊断，取得类型化 `UpstreamProtocolError`：`hybrid_runner_failed:ValueError:hybrid_action_registry_mismatch`。兼容处理只允许这一明确的旧动作注册合同不兼容触发放弃 reusableSource、重新实际探索，其他错误不得走该后备路径；`apps/api/tests/hybrid-source-compatibility.test.ts` 中“只有明确的旧动作schema不兼容才允许重新采集来源”1 项通过，未重跑该验证。
- 后续正式准备为同一 task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的 job `d708e143-1888-4183-809f-05503fedf7a6`、browserRun `4b124705-aa67-4f21-8cde-6beaecf6c2f9`、source artifact `160edc71-eaa6-4bc1-8db2-c14ead414065`（digest `3a41834a6b91c87515a504ab4d8845d5280904a674621d4919a6f5eca6827d8d`）。该 job 为 `failed / preexecuting`，来源 `sourceSuccess=false`、`trace.completed=false`、`closed=true`，未形成新 chains 或 validationExecutionIds；本次页面复核时产品为 `ready_to_prepare`，active job/execution 均为空。旧 release v3 和历史执行保留，不充当本次准备通过证据。
- 本次记录 8 个 trace action、7 次实际 dispatch；第 8 个 click 的 `before_action` 在 `14:26:26.516Z → 14:26:26.989Z` 失败，后续没有 dispatch 或 done。来源保留 `observation_url_changed`、`native_agent_run_failed`、`completed_business_result_required` 及 a-0005 读取证据缺口。这里只记录失败事实，不推断页面变化原因或宣告读取/导航问题已解决。

本次耗时按同一 job 的 UTC 时间戳及安全日志 `data/source-lifecycle-diagnostics/4b124705-aa67-4f21-8cde-6beaecf6c2f9.jsonl` 第 1–62 行配对计算；下表各项互不重叠：

| 时间口径 | 数量 / 耗时 | 可复核范围 |
| --- | --- | --- |
| 已结束模型调用 | 8 次 / 145.189 秒（job 总时长的 77.1%） | 日志 2–3、10–11、18–19、26–27、34–35、42–43、50–51、58–59 行；按 callId 配对 |
| 实际动作派发 | 7 次 / 10.089 秒 | dispatch started/completed；navigate 2.722、input 0.227、三次 find_elements 合计 0.023、两次 click 为 6.210 和 0.907 秒 |
| 动作前回调 | 8 次 / 1.563 秒 | before_action started→completed/failed，含末次未派发 click 的 0.473 秒 |
| 动作后回调 | 7 次 / 9.929 秒 | after_step started→completed；两类回调合计 11.492 秒，不重复计入 dispatch |
| author 内未归因间隔 | 13.302 秒 | author 总窗 180.072 秒减上述模型、派发和回调；不能直接归类为浏览器等待、清理或编译 |
| author 窗外时间 | 8.242 秒 | job 创建→author started 为 6.428 秒；author completed→job updatedAt 为 1.814 秒，启动/持久化等更细分项未单独计时 |
| job 总窗 | 188.314 秒 | `14:23:23.072Z → 14:26:31.386Z`；author 窗为日志 1→62 行 `14:23:29.500Z → 14:26:29.572Z` |

`closed=true` 是来源关闭事实；日志没有独立 cleanup started/completed，无法单列清理耗时，也不能把它等同正式 execution 的 cleanup confirmed。准备消费记录 `compilationCalls=0`，artifact 含来源编译响应，但没有独立编译起止；不能把未归因时间记为编译耗时。

- UI 定点验证：`node --import tsx --test apps/workbench/tests/chain-workbench-projection.test.ts apps/workbench/tests/product-presentation.test.ts` 共 6/6，通过终态不显示运行中、链版本/execution/单次 run 事件归属、较晚失败准备与历史结果分离、失败准备不旋转且编译不等于代表执行成功等回归；`npm run check --workspace @browser-capture/workbench` 通过。
- 正式 Workbench 只读复核使用上述 d708 job 的已保存状态，未点击准备/运行；前后 jobs/executions 数量相同，独立 UI Chrome 已关闭。准备页显示“执行代表任务 · 未完成”、旋转数 0；链页显示“本次准备未完成”、再次运行禁用，当前链无相符 execution 时不套用旧动作事件；结果页明确“历史运行 · 已完成”，旧结果为中性色且没有虚假的当前步骤。已实际查看三张截图：[准备页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/preparation.png)、[链路页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/chain.png)、[结果页](../../work/evidence/workbench-projection-2026-09-21T14-31-33-574Z/results.png)；同目录 `summary.json` 留存只读计数和 DOM 投影，均位于私有、Git 忽略的 `work/evidence/`。
- 主线程补充读取合同局部证据：`BAT_REAL_BROWSER=1` 下 `tests.test_selection_read_contract -v` 3/3 通过、用时 3.113 秒，包含真实 headless Chrome 本地页面的隐藏候选 textContent、resolved href、缺少属性和原始 ordinal 保留；默认业务可见 innerText 仍拒绝隐藏元素。该证据不证明 a-0005 未知读取错误的唯一成因，也不替代正式准备。

以上更新本轮失败和 UI 投影事实；I7/R2/R3/R5 保持打开。下文接手时快照与其他历史证据原样保留。

实现包局部证据（正式准备尚未通过）：

- 同次旧 job 用时 282.246 秒，其中 12 次完成的模型调用累计 214.329 秒；10 个已派发动作累计 23.716 秒。Enter 派发 18.642 秒，前后回调共 20.780 秒。两次页面改变发生在派发前，原因未知，不能归因用户/网站/自动播放。浏览器关闭发生在 done 之后，没有“提前关闭”证据。
- 共享导航适配使用公开 SwitchTabEvent 和实时 Page.get_url，capture/ordinary 一致；唯一新 tab、真实空白、多 tab 歧义、单次派发和 Enter 跨页共 10 项测试通过。
- capture 回调失败调用公开 Agent.stop 并保留失败来源，5 项故障验证通过；必填 success/reason 的原生 done 适配 4 项验证通过。
- 候选属性/原 ordinal、完整集合溢出、需求绑定选择程序和固定身份目标准入共 11 项验证通过；工具准入矩阵的 1 项现有验证通过。
- Function 的真实 QuickJS 变化输入校验、常量规则拒绝并保留来源、输入/需求事实防替换共 3 项 API 验证通过。API 类型检查通过；未运行根级或全量测试。
- 受管源码已同步，digest `d00b0b30fa9a43fc795b5348c4f7f9cf0d9ce340fc675c4e59510d44722bc1b6`。以上仅为局部合同证据，不能替代下面六项正式产品门。

重新核验现有 checkout 为 `master@7d59036332a66de8991744659d2317da126c6123`，196 条 dirty entry（Git 默认合并未跟踪目录的口径），全部保留。正式 API 最新准备仍为 `1964f027-dc49-45c5-88b6-a119db77f164`，来源 `c01657e0-1a31-441b-82f3-4f7f014196ab`，当前无活动 job/execution，产品 `ready_to_prepare`。以下是修改前分类，不是完成结论：

| 范围 | 分类 | 当前证据与待关闭项 |
| --- | --- | --- |
| 预执行与结束 | 已确认断点 | 读取候选后没有选择及最终状态动作，done 的 null 合同仍形成 sourceSuccess；正常结束标记不等于代表业务完成。 |
| 标签页、导航与耗时 | 已确认断点；部分原因待定位 | Enter 后新增 tab 尚无 URL，随后显式 switch；普通复跑只对 click 的 URL change 收敛新 tab，编译拒绝 switch。两次 before_action 因 observation_url_changed 未派发；触发跳转原因和阶段耗时继续用同次证据核对。 |
| 暴露动作与编译承接 | 已确认断点 | 注册动作多于普通白名单；Function 草稿验证器存在，但 natural compilation 不接受 Function segment。需要逐动作明确执行或取证语义。 |
| 读取、动态规则和绑定 | 已确认断点 | find_elements 的 read contract 只保留 text；末项 count 不表达过滤/排序规则；重复祖先判定又拒绝固定身份的搜索结果导航。 |
| 验证、发布与 UI | API 局部修复已观察；正式 UI 待验证 | API 本次失败为 ready_to_prepare，历史 release 保留；不能以旧 release 的验证证明本次准备成功。 |
| 正式复跑、清理与恢复 | 历史实现/证据存在；本轮未通过 | I1–I6 已有实现及历史定点证据；本轮必须在修复后的正式产品路径验证，I7/R2/R3/R5 保持打开。 |

```text
Product Alignment:
- natural-language task: 已确认的浏览器任务完成一次真实代表执行，保存可执行的动态选择及浏览器状态转换，再经正式验证、发布和普通复跑闭环
- reusable chain boundary: 结构化读取、版本化纯数据规则、稳定身份绑定、导航及标签页动作由现有通用节点和浏览器适配承接
- runtime inputs: 已确认需求、当前页面候选与属性、运行输入和本次会话页面身份
- dynamic task outputs: 有来源的候选/规则结果、实际动作和后置事实、编译缺口、正式验证与独立运行审计
- generic platform capability used: browser-use Agent/Tools/Browser、workflow-use capture/compiler、QuickJS Function、TaskChain/LangGraph 和现有产品生命周期
- replay model calls: 0，显式 llm 节点除外；准备期的有界语义编译独立审计
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 真实浏览器动作到可复跑节点的通用适配，以及候选读取到纯数据规则和目标绑定
- existing implementation in repository: 受管 browser-use/workflow-use、ReadSpec、ConsumerReadiness、functionDraftSchema、validateAndMaterializeFunctionDraft、executeFunctionNode 和普通动作适配
- mature candidates and pinned versions: 沿用 browser-use 0.13.8、workflow-use 0.2.11、quickjs-emscripten 0.32.0、现有 LangGraph；不新增或替换库
- selected implementation: 补齐既有公共能力之间的证据和物化合同
- reused public surface: Agent callbacks、Tools registry、BrowserSession 页面 API、结构化读取、现有 QuickJS 验证与 TaskChain 值绑定
- B-A-T-owned adapter and remaining gap: 来源覆盖、跨页因果、类型化绑定与版本化规则；不实现第二个 Agent loop、浏览器控制器或图调度器
- license/runtime/platform fit: 沿用 MIT/AGPL 既定边界；当前 Windows x64，macOS 延期未测
- browser/runtime/state ownership conflicts: 一个运行一个 Browser owner；Function 无浏览器/网络/文件/模型权限；历史来源和 release 不覆盖
- replay model calls: 0，显式 llm 节点除外
- rejected candidates and evidence: 仅增加 prompt、把样本末项编译成 count、按祖先重复结构拒绝固定身份、Agent done 充当业务完成均不能证明对应不变量
- focused validation: 每个改动包最小合同验证；随后正式 Workbench/API 准备、验证、发布、普通复跑及状态投影；局部测试不作完成证据
```

> 2026-09-21 产品基线纠正：D 的 Windows x64 历史结果保留；产品最小闭环和 R1–R5 曾取得一轮正式 Workbench/API 证据，但同一真实任务第三次正式复跑暴露执行生命周期缺口，实际链路画布也不满足可读修订入口要求。R2、R3、R5 重新打开，当前不得写“产品闭环已通过”。macOS arm64 仍由用户延期且记录为未测。
> 历史七项验收、修订后受控 R1–R5 和真实任务前两次成功均保留为历史证据；它们不能覆盖后续失败。下文较早逐轮记录不代表当前结论。

> 真实任务 `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的前两次正式复跑各为 6 个浏览器命令、0 个模型调用；第三次 execution `d5a86b0c-a30b-48ef-8a0c-6e7f92c5daa6` 的 1/1 步骤和 TaskRun `5f6abc37-6108-459c-8c4f-3337753e5040` 已 completed，但 runner 清理退出码 1 被误写为 `deterministic/repairable`，产品错误进入 `needs_repair` 并失去普通复跑入口。该问题不是链路失败。

> 2026-09-20 产品边界再次确认：需求对话必须继续到所有影响结果的重要歧义均由用户确认或明确委托；缺少入口时在需求阶段做只读来源解析并用 Question Panel 解决多候选。准备任务只研究真实网页实现。正式运行在链路无节点、合同或运行时错误并到达完成终点时即为 completed，不再用链路结尾的全局语义 judge 制造假失败；用户是否满意是独立验收。局部问题通过可编辑链路画布发布新版本，整体需求错误携带运行记录返回需求对话。

> 2026-09-20 R1 来源边界纠正：搜索词及原始搜索结果的业务语义由访谈 LLM 根据完整对话判断；宿主只执行受限搜索、返回真实结果 ID、校验模型提交的候选引用、生成 Question Panel 并持久化用户选择。此前宿主 `rankCandidates`、通用词表和分数阈值属于越权语义判断，相关实现已删除，基于该启发式排名取得的验收证据全部作废；新两步工具协议已重新通过正式 Workbench 验收。

> 2026-09-20 R1 搜索能力边界已按公共根因修复：`opencode` 的 `@agent-platform/pi-agent-session` 现在复用 Pi `DefaultResourceLoader`，只加载宿主声明的 extension/package，并把 extension 与宿主工具合并到精确 active-tools allowlist；B-A-T 仅在需求访谈启用 `pi-web-access` 0.30.0 的 `web_search`，Bing RSS 保留为失败后备。模型设置没有新增搜索项，也没有任何供应商分支。

> 2026-09-21 17:37–17:44 最新准备任务回归：task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 的 prepare job `41af88f0-1bdc-40ee-8867-14fa8b9439de` 在 B-U 预执行失败，耗时 428.7 秒。安全生命周期日志记录 18 次串行模型调用和 17 次浏览器动作，模型等待累计 304.7 秒；动作在持久 Profile 遗留页面间反复 `switch / wait`，最后导航到已确认站点的第一方子域时被精确 origin 边界拒绝。此前 I7/R5 通过结论未覆盖该真实回归，继续保持重新打开；修复完成前不得把历史 I7 证据写成当前闭环通过。

最新预执行回归修复开工记录：

```text
Product Alignment:
- natural-language task: 已确认来源的浏览器任务进入准备后，在同一第一方站点的首页、搜索域和内容域完成一次代表任务，不受上次运行遗留空白页干扰
- reusable chain boundary: 每次预执行仅暴露本次自动化会话拥有的页面；来源授权按确认站点边界覆盖该站点的第一方子域，跨站导航仍拒绝
- runtime inputs: 已确认的精确入口 URL、由入口推导的站点域边界、专用持久 Profile 中的登录与存储状态
- dynamic task outputs: 单次预执行动作证据、链路来源、浏览器命令和模型调用审计；不持久化页面正文或 Profile
- generic platform capability used: tldts 注册域解析、browser-use BrowserProfile allowed_domains 和公开页面会话 API、现有 hybrid runner 协议
- replay model calls: 仅首次准备允许探索模型；普通复跑仍为 0，显式 llm 节点除外
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 第一方站点授权与新自动化会话页面隔离
- existing implementation in repository: OriginAccessGate 已用 tldts 按注册站点累计访问边界；hybrid runner 已固定 browser-use 0.13.8 并拥有专用持久 Profile
- mature candidates and pinned versions: tldts 7.0.16；browser-use 0.13.8 的 BrowserProfile.allowed_domains、get_tabs、get_current_page、close_page 与 Page.goto
- selected implementation: TypeScript 从精确入口推导结构化 allowedSites，Python 同时用于 browser-use 预导航拦截和动作后页面核验；新 hybrid session 启动后保留登录存储但把页面集合收敛为一个空白运行页
- reused public surface: tldts getDomain；BrowserProfile allowed_domains；BrowserSession get_tabs/get_current_page/close_page；Page.goto
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有来源到站点边界的转换、跨协议校验和自动化页面所有权收敛；修复后仍需从正式准备入口复跑一次
- license/runtime/platform fit: 不新增依赖；沿用当前 Windows x64 固定运行时，macOS arm64 仍未测
- browser/runtime/state ownership conflicts: 只重置任务自动化会话的导航页，不清 Cookie、localStorage 或 Profile；账号管理浏览器不执行该重置，且产品已有单浏览器所有权门
- replay model calls: 准备阶段允许；普通复跑不增加模型调用
- rejected candidates and evidence: 不枚举站点子域、不加入网站特判、不关闭浏览器安全边界、不提高单轮动作数破坏单次派发审计；browser-use 已提供所需站点白名单与页面 API，无需自研浏览器控制
- focused validation: 待运行跨 TS/Python 启动合同、站点边界及页面归一化定点测试；随后只从正式产品准备入口复跑一次
```

最新预执行 E1 编译缺口修复记录：

```text
Product Alignment:
- natural-language task: 代表执行在异步页面完成业务动作后等待页面稳定，并把这段真实等待保存为可零模型复跑的链路动作
- reusable chain boundary: 原生固定 wait 只在动作前后仍位于同一运行时 URL 时编译；跨页、缺少前后观察或失败 wait 继续保留 gap
- runtime inputs: wait 的固定有界时长和执行前动态 URL digest 基线
- dynamic task outputs: browser.workflow-step wait 节点及 unchanged URL 后置条件
- generic platform capability used: workflow-use Postcondition、StepVerifier 基线读取和 OrdinaryCapability 单次派发
- replay model calls: 0
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 固定等待的确定性复跑与动作前后同页核验
- existing implementation in repository: workflow-use 已记录 wait 参数、前后观察、URL digest、单次 dispatch，并由 Postcondition/StepVerifier 支持 changed/ready/transition 基线语义
- mature candidates and pinned versions: 继续使用受管 workflow-use 0.2.11 与 browser-use 0.13.8；不新增等待库或调度器
- selected implementation: 给既有 Postcondition 增加通用 unchanged authority；natural compiler 仅在 wait 前后 URL digest 相等时生成 wait 节点，运行时在派发前捕获本次动态基线并在等待后比较相等
- reused public surface: declared_checks、capture_check_baselines、check_fact、browser.workflow-step wait、既有 ActionRegistry 与证据引用
- B-A-T-owned adapter and remaining gap: 只补编译合同和运行核验，不把 native extract、Agent done 或页面文案冒充运行节点；修复后需离线重编译本次真实来源并再从正式准备入口验收
- license/runtime/platform fit: 仍在固定 AGPL-3.0 受管 fork 内并更新来源摘要；Windows x64 当前验证，macOS arm64 未测
- browser/runtime/state ownership conflicts: 不增加浏览器或模型 owner；wait 仍在同一 execution 的唯一会话内单次派发
- replay model calls: 0
- rejected candidates and evidence: 不吞掉 missing_effect_proof、不把 wait 标成无条件 agent_internal、不固化样本 URL、不恢复 CSS/自定义模型工具；本次真实来源的 wait 前后 URL digest 相同而 DOM 动态变化，适合运行时 unchanged 基线
- focused validation: 待运行 workflow-use 固定 wait 编译/运行定点测试、真实来源离线重编译和受管 fork digest 校验
```

最新预执行修复定点证据：

- 站点边界与页面归一化合同测试通过；API TypeScript 检查通过。与既有 runner cleanup 组并行执行时 10 项中 9 项通过，唯一失败是原有 150ms close fixture 在并发负载下命中 `cleanup_close_protocol_timeout`，而不是本次站点或页面归一化断言失败；没有以扩大超时或重复整组掩盖该基线现象。
- 正式 prepare requestId `b1122a0e-1a5f-4d49-96c5-9915203e817d` 创建 job `82afb519-4874-4910-86f8-17b215efeecc`。本次预执行从旧失败的 18 次模型调用/17 个浏览器动作、反复 `switch`，降为 10 次 provider 调用/8 个浏览器动作 `navigate,input,click,extract,click,extract,wait,done`，没有 `switch`、遗留空白页抖动或第一方子域越界；来源在 browserRun `38b5aad7-4360-480f-8000-2b5eb0785605` 中成功关闭并保存。
- 该正式任务随后仍在 E1 编译失败，真实唯一 gap 是固定 `wait {seconds:5}` 缺少 effect proof；它的动作前后 URL digest 相同、DOM digest 因动态页面变化而不同。该失败不再归因于浏览器链路，也不能把预执行阶段写成产品闭环通过。
- `unchanged` 合同补齐后，workflow-use 固定 wait 编译与运行时基线比较定点测试 2/2 通过，受管 fork digest 校验通过，API TypeScript 检查通过。同一失败来源 artifact `630e5962-4320-463a-8db8-c04fabdfac29` 离线重编译成功，生成 12 节点链路；其中 wait 节点携带动态 `url_digest + unchanged=true`，没有固化样本 URL。离线重编译只证明编译缺口关闭，仍不代替下一次正式产品准备验收。
- 新的唯一正式准备 requestId `208a8076-aa79-4838-804c-bc812b525fa9` 创建 job `4992d335-2734-4a70-87bd-8b174a1ec86d`。它复用上一 job 已成功关闭的不可变 source artifact，不再调用探索模型；从 18:25:56 到 18:28:26 完成 E2 编译、代表输入与独立复验并进入 `completed/ready`，产品状态为 `runnable`。两次正式验证 TaskRun `22bfe299-f0d6-4d05-8fd2-f611e8cd5112`、`b4dd2f3d-14d2-4de2-8937-0593d2245320` 均由 release 记录为模型调用 0；新 chain `7623b02a-f531-443b-87ab-71248f97e91b@1` 和 release `c65a526d-12b6-4d98-832c-636c57945e34@3` 已发布。后续人工冒烟已否决这份证据，不能据此关闭 B-U、I7 或 R5。

> 2026-09-21 18:29–18:30 用户现场验收否决 release v3：正式 execution `77a13a67-7dab-47a1-80b5-fa7c9e8dc90f` 虽被图运行投影为 completed、cleanup confirmed、模型调用 0，但搜索联想点击单节点耗时 55.2 秒且期间显示 `about:blank`。更关键的是发布链只有 `navigate → input → click 搜索联想 → click 首个作品卡 → wait`，没有读取剧集列表、选择执行时最新非预告正片或核验播放器播放状态。持久 Profile 的既有观看状态使样本偶然落到当前集，双验证没有证明动态选择边界；该 execution、两次验证和 release 只能作为失败验收证据，R2/R3/R5/I7 继续打开。

执行型任务完成证据修复开工记录：

```text
Product Alignment:
- natural-language task: 动态选择任务必须在链路中真实读取候选、选择执行时目标并核验最终浏览器状态，不能依赖持久浏览器的默认或历史状态碰巧满足
- reusable chain boundary: execution ResultSpec 只省略业务数据输出，不省略决定后续动作或证明完成条件的页面读取；无法编译的读取必须形成 gap，不能作为 agent_internal 被吞掉
- runtime inputs: 版本化任务输入、页面结构化候选、纯函数或显式 llm 的选择结果、稳定目标和节点后置条件
- dynamic task outputs: 可复跑读取/选择/动作/核验节点、明确模型审计和不可变新链；原有错误 release 与 execution 保留
- generic platform capability used: 现有 ActionCoverage、browser.read-fields、function/llm 节点、结构目标、ResultSpec 和修订发布合同
- replay model calls: 默认 0；只有链路中可见的显式 llm 节点可以调用模型，本修复不把 extract 模型调用隐藏成普通复跑
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 动态候选选择、完成状态读取和新标签导航收敛
- existing implementation in repository: workflow-use 已有 verified natural read、ActionCoverage、structure/history target、ConsumerReadiness；TaskChain 已有 capability/function/branch/llm；browser-use 提供真实 tab/page/DOM 公开 API
- mature candidates and pinned versions: 继续使用 workflow-use 0.2.11、browser-use 0.13.8、QuickJS 0.32.0 与现有 TaskChain runtime；不增加站点解析、选择器或浏览器库
- selected implementation: 先禁止 execution-only 原生 extract 在影响动作选择或最终完成时被排除；再复用结构化读取与显式计算/语义节点形成真实动态选择，并对新标签只接受完成授权导航的页面
- reused public surface: ActionCoverage/CompilationGap、ReadSpec、StableChain function/llm、TargetResolver、BrowserSession tabs/current page 和正式 revision/validation/release API
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有读取到链路节点/绑定的编译、完成证据硬门和页面所有权收敛；任务字段、候选规则和定位只保存为版本化链数据
- license/runtime/platform fit: 不新增依赖；Windows x64 当前实测，macOS arm64 仍未测
- browser/runtime/state ownership conflicts: 仍为一个 execution 一个浏览器 owner；不清 Cookie/localStorage/观看历史，而是禁止把既有状态当成选择动作
- replay model calls: 0，除非最终链明确含 llm 节点并在画布/审计中可见
- rejected candidates and evidence: 不按 Bilibili、剧集号、页面文案或 URL 写 special case；不把 null 输出、Agent done、同 URL wait 或两次相同 Profile 复跑当完成证明；不覆盖旧 release
- focused validation: execution extract 覆盖硬门、结构化动态选择与新标签导航定点测试；随后只对新不可变版本走正式 Workbench/API 验收
```

当前修订状态：

- R1 已从正式 headless Workbench/API 入口通过 Pi 搜索、候选 Question、充分追问、修订草稿、待决硬门、确认需求和重启持久化；需求阶段产品浏览器命令为 0。
- R2 的来源 judge/链尾 predicate 边界仍有效，但链路完成后 runner 清理异常会覆盖 execution 并误导到链路修复，因此运行完成门重新打开。
- R3 的服务端修订草稿、不可变版本、checksum/digest、验证和发布事实可复用；React Flow 固定网格、全部异常边默认展开和 JSON 详情不满足可读工作台退出条件，因此重新打开。
- R4 已形成“符合预期 / 调整链路 / 重新梳理需求”三条回流，局部问题进入 R3 草稿，整体问题携带运行摘要形成新需求版本。
- R5 历史结构化结果 `work/minimum-product-loop-1789921035029/result.json` 保留；它未覆盖后续清理异常恢复和真实复杂链画布可读性，当前重新打开。

R1 开工记录：

```text
Product Alignment:
- natural-language task: 用户在需求对话中用业务语言确认最终结果、来源、范围、动态词、风险和预期；缺少 URL 时由访谈 LLM 决定搜索词并判断宿主返回的原始结果
- reusable chain boundary: 已确认需求版本只消费宿主持久化的用户决定、来源解析事实和已清零的待决事项，供后续任意浏览器任务准备复用
- runtime inputs: 用户消息、Question Panel 回答、LLM 发起的只读搜索请求、真实结果 ID 与候选选择；不要求 startUrl、selector 或 JSON
- dynamic task outputs: 版本化需求草稿、来源候选/选择、待决事项状态、确认需求合同和审计事实
- generic platform capability used: Pi ResourceLoader/extension/tool registry、AI Connect 公共 Authoring/Question、现有 InterviewState/SQLite 事实源、Zod 边界和 TaskRequirement 版本仓库
- replay model calls: R1 只发生在需求对话；普通 TaskChain 复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 需求对话中的 Pi 搜索工具发现/执行、通用只读后备、LLM 候选判断与引用校验
- existing implementation in repository: AI Connect/Pi AgentSession 已提供宿主 custom tool、公共 Question 和模型连接；共享 adapter 现已提供受控 extension/package 来源、active-tools 与 typed lifecycle，仓库继续复用 Bing RSS、tldts、Zod 和 SQLite/Drizzle
- mature candidates and pinned versions: Pi 0.84.2 的 `DefaultResourceLoader` 与 active-tools；`pi-web-access` 0.30.0（MIT，源码 commit `6c5afa1d0d43eef8552284ad73f4bd9f0612a378`）复用 Pi `modelRegistry` 可用凭据，并为没有原生搜索能力/搜索密钥的连接提供 keyless 后备；Bing RSS 是 B-A-T 最后一层后备
- selected implementation: 由 Pi 加载受控 `pi-web-access` package，需求访谈只激活 `web_search` 并与宿主 `search_sources`/`present_source_candidates` 合并；访谈 LLM 决定是否搜索、查询词、使用主工具还是后备及候选语义；宿主只观察工具事实、校验真实 URL 引用并持久化。模型设置只管理模型连接
- reused public surface: Pi `DefaultResourceLoader`、package `pi.extensions`、`pi.registerTool()`、active-tools、`modelRegistry.getApiKeyAndHeaders()`、extension lifecycle/result；`pi-web-access` provider routing/keyless fallback；RSS 2.0 item；AI Connect Common Question；tldts parse
- B-A-T-owned adapter and remaining gap: B-A-T 只拥有 extension/tool allowlist、结果证据规范化、候选引用校验、持久化和 Question 映射；不复制凭据、不维护 provider 矩阵。R1 已无实现缺口并已通过 R5 组合复验
- license/runtime/platform fit: 仅用于本地个人工作台的候选展示，不把搜索结果提交为页面执行证据；Windows Node 24 当前范围，macOS arm64 延期未测
- browser/runtime/state ownership conflicts: 来源解析不启动任务浏览器、不读取 Profile、不登录、不点击；正式准备仍独占浏览器会话
- replay model calls: 来源解析只发生在需求对话；普通复跑为 0，显式 llm 节点除外
- rejected candidates and evidence: 拒绝按 Anthropic/Qwen/Doubao 等供应商在 B-A-T 业务代码中维护搜索矩阵；拒绝在模型设置旁增加网页搜索项；拒绝删除 Bing 后备；拒绝复制 Pi extension/runtime。`pi-web-search` 1.6.0 缺少非原生模型的通用后备；`pi-web-access` 可选命令凭据来源因 Windows 两项测试失败而不启用
- focused validation: `opencode` extension/custom tool 与多 assistant item 整轮输出投影测试 3/3（13 assertions）、包类型检查、平台持久化/confirmed tests 11/11（51 assertions）通过；正式同步 digest 为 `52e0e9c6630c47cb41874591dc4e5e9f7db36aca8180e4fca47b379b91be01f5`。B-A-T 实际 ResourceLoader 加载 1 个 extension、`web_search` 注册恰好一次；来源合同测试 4/4 与 API 类型检查通过；正式 headless Workbench 验收通过
```

R1 完成证据：

- 正式入口为根级 `npm run accept:requirement-dialogue`；API workspace 的 `preaccept` 必须先构建当前 Workbench，避免用旧 `dist` 验证新服务端。验收不使用 runtime 直调、mock 或 fixture 代替产品交互。
- `work/requirement-dialogue-workbench-unique-2026-09-20T15-44-31-667Z` 从 headless Workbench 新建需求，Pi 工具顺序为 `web_search → present_source_candidates`；用户通过 Question Panel 确认 `bilibili.com`，随后确认“多个备案相关编号全部返回”，纠正产生草稿 v2 且旧版本保留，最终确认 requirement v2。共 4 次需求对话模型调用，未决事项 0，产品浏览器命令 0。
- OpenCode 公共根因修复将一次 Main invocation 中多个成功 assistant item 的规范文本按顺序组成整轮输出；每个 item 只替换自己的 provisional delta，错误或取消只回滚该 item。候选 entry identity、整轮 output hash 与 private ancestry hash 保持独立，符合 ADR-0054；因此工具调用前正文、工具轮和空 final item 不再被错误改判为 `generation.failed`。

- 2026-09-20 搜索可选性修正：删除“新任务必须先产生 URL 来源事实”的服务端硬门；已经发起的来源解析仍必须由用户结算，未发起搜索的需求可把用户确认的业务来源边界保存在 Markdown 中并由准备任务调查技术入口。`TaskRequirement.confirmationFacts.sources` 只保存真实搜索/用户 URL 证据，允许为空；provider 为通用工具来源标识。Pi `web_search` 与 Bing 后备共用真实 URL 引用合同，`requirement-source-resolution.test.ts` 4/4、API 类型检查通过。
- contracts 与 API TypeScript 检查通过；Workbench 生产构建通过。`requirement-source-resolution.test.ts` 3/3 通过，覆盖原始结果不被宿主语义筛选、模型提案决定 outcome、真实候选 ID 校验、Question 回写、待决确认硬门、来源决定和结果预期持久化及重启读取。
- 唯一候选：`work/requirement-dialogue-workbench-unique-2026-09-20T10-47-03-095Z` 从 headless Workbench 新建任务，持久化 AI 事件顺序为 `search_sources → present_source_candidates`；连续确认来源、实际链接、备案类型，用户纠正产生草稿 v2 且 v1 未改写，最终确认 requirement v2。模型调用 5，产品浏览器命令 0。
- 多候选：`work/requirement-dialogue-workbench-multiple-2026-09-20T10-49-19-161Z` 由 LLM 从原始结果提交两个 Mercury 候选，Question Panel 选择后继续澄清标题与链接语义；确认 requirement v1。模型调用 5，工具顺序 `search_sources → present_source_candidates`，产品浏览器命令 0。
- 无候选：`work/requirement-dialogue-workbench-none-2026-09-20T10-51-42-386Z` 由 LLM 对第一轮原始结果提交 `none`，用户在自由输入 Question 补充新业务身份后重新搜索；旧无候选事实标为 `superseded`，新来源经 Question Panel 确认并形成 requirement v1。模型调用 5，两次工具顺序均为 `search_sources → present_source_candidates`，产品浏览器命令 0。
- 生产源码定点扫描未发现 Bilibili、Mercury、备案号、测试虚构名称或已删除的排名/词表符号；测试样本中的站点和字段仅作为冻结验收数据。自动验收全程 headless，正式工作台数据摘要未被写入。

R2 开工记录：

```text
Product Alignment:
- natural-language task: 已确认需求进入准备后，系统只研究真实页面上的实现方法；现场出现会改变来源、范围、选择或结果含义的歧义时返回需求对话，发布链路正常到达完成终点即记为技术完成
- reusable chain boundary: 准备来源只证明真实浏览器动作、读取、输出合同和可编译证据；正式运行只消费不可变 TaskChain 图、节点合同、浏览器状态和预算
- runtime inputs: 已确认需求版本、计划步骤输入、发布链路版本及本次业务输入
- dynamic task outputs: 可复跑链路候选、准备阶段的需求回流事实、正式运行状态、节点输出与错误证据
- generic platform capability used: browser-use Agent 的公开运行/回调、LangGraph StateGraph、TaskChain 节点和输出合同、SQLite 运行审计
- replay model calls: 准备阶段允许探索模型；普通 TaskChain 复跑仍为 0，只有显式 llm 节点可以调用模型
- site/task-specific code added: no
```

```text
Reuse Assessment:
- capability: 真实页面准备、确定性链路执行和技术完成判定
- existing implementation in repository: browser-use Agent 已负责首次浏览器探索；LangGraph StateGraph 已负责链路推进、分支、循环、取消和递归上限；现有 TaskChain runtime 已负责节点、合同、浏览器和预算错误
- mature candidates and pinned versions: browser-use 0.13.8 与 workflow-use 0.2.11 受管 fork；现有 LangGraph 运行图
- selected implementation: 继续复用 browser-use 完成代表任务但关闭其链尾 judge；保留采集/编译的动作、DOM、读取和输出合同校验；正式运行以合法 completed terminal 和真实错误为唯一技术完成边界
- reused public surface: Agent.run、公开 step callbacks、结构化输出、StateGraph 图执行及现有 TaskChain capability/runtime
- B-A-T-owned adapter and remaining gap: B-A-T 只适配来源证据、编译合同、需求歧义回流、不可变版本和运行审计；不增加第二套语义完成判断
- license/runtime/platform fit: 保持当前已固定依赖和 Windows Node 24/Python 3.12 路径；macOS arm64 仍按用户决定延期未测
- browser/runtime/state ownership conflicts: 准备仍只占用一个专用持久浏览器会话并在 finally 关闭；正式复跑不把控制权交回探索模型
- replay model calls: 关闭准备来源 judge 不影响首次探索；正式复跑除显式 llm 节点外不调用模型
- rejected candidates and evidence: browser-use judge、来源 sourceValidated 以及链路结束后的 chain/step/plan completion predicate 二次改判都会在真实节点已成功后制造链外语义失败，因此不作为完成门
- focused validation: 准备来源不发起 judge 调用且仍拒绝真实输出合同错误；正常图到达 completed terminal 稳定完成，真实节点/输出合同错误仍失败；准备编译出现 confirm_intent 时持久化回流事实并引导需求对话
```

R2 完成证据：

- browser-use 代表执行已设为 `use_judge=False`，不再创建 judge 模型、不再读取 `history.is_validated()`、不再因 judge 反馈重跑；模型桥的准备用途只允许 `agent`、`extract` 和 `semantic_annotation`。新 normalized trace 使用 version=2 且没有 `judged`，旧 version=1 只读兼容，即使历史 `judged=false` 也不会成为新编译门。
- 新 hybrid 来源结果删除 `sourceValidated`；旧 source/artifact 的该字段仅作可选只读兼容。候选仍要求 Agent 正常结束且结构化输出通过 JSON Schema，动作派发、DOM/读取证据、编译 gap 和输出合同没有被放宽。
- TaskChain completed terminal 直接形成 completed 并把实际 terminal id 写入 `completionEvidence`；计划执行器不再在步骤和计划结束后用 completion predicate 二次改判。最终计划输出仍通过已发布 `outputContract` 校验，目标定位、节点派发、浏览器、预算、人工等待与取消错误路径保持不变。
- 准备编译出现 `confirm_intent` gap 时保存 `preparation.requirementReturn`，产品投影变为 `needs_requirement / continue_interview`，Workbench 显示“返回需求对话确认”而不是“重新准备”。
- 最小验证通过：contracts、runtime、API、Workbench TypeScript 检查；Python 定点 2/2 证明无 judge 即可接受合同化结果、新 trace 无 judge 且旧 v1 `judged=false` 可兼容；runtime 定点 1/1 证明假 completion predicate 不改判而真实节点与输出合同错误仍失败；API 定点 2/2 证明 chain/step/plan 合法结束为 completed，以及 `confirm_intent` 持久化并路由需求对话。未重复旧七项全流程。

该时点曾将 P1 不可变发布和 P3 直接运行事实保留，并按
[需求对话、任务准备与链路修订产品基准](REQUIREMENT_DIALOGUE_PREPARATION_AND_REVISION.md) 重新开放 R1–R5；随后一轮证据曾关闭这些门，
但 2026-09-21 第三次正式复跑和画布复盘已再次打开 R2、R3、R5。

下列 P1–P6 段落只记录此前实现和验证历史；修订后产品门是否关闭以本页顶部和 R5 记录为准。

## 产品最小闭环 P1

```text
Product Alignment:
- natural-language task: 用户确认浏览器任务并完成准备后，从同一任务获得可持久化、可直接运行且不会静默换链的产品状态
- reusable chain boundary: 一个不可变可运行版本固定需求、计划、全部步骤链路及样本/换输入验证证据
- runtime inputs: 当前可运行版本输入合同校验过的默认业务输入与执行节奏
- dynamic task outputs: 唯一产品状态、唯一主操作，以及后续正式运行绑定的版本事实
- generic platform capability used: 既有 requirement/plan/chain/version digest、ValueSchema、validation execution、SQLite/Drizzle 持久化
- replay model calls: P1 只建立发布、预设和状态事实，不调用模型；普通复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

P1 已完成：

- 新增不可变 `RunnableTaskRelease`，固定 requirement id/version/revision/digest、plan version/digest、全部步骤 chain version/executable digest、真实 sample/verification 运行证据、输入合同和结果形态。
- 新增绑定当前 release 的任务级 `TaskRunPreset`；默认业务输入再次通过有限 ValueSchema 校验，pacing 不进入链 digest。新 release 发布后旧 preset 自动失效，不会迁移成幽灵默认值。
- SQLite 原子迁移到 v12，release 与 preset 重启后保持同一引用和 digest；已发布 release 拒绝改写。
- `TaskProductProjection` 只从访谈、job、当前 release、preset、正式 execution 和 archive 事实产生一个状态与一个主操作；样本/换输入验证 execution 不会投影为正式完成。
- 正式 `authorize_plan` 已收紧为当前 release 执行门，execution 保存 release 引用并逐步骤消费发布清单中的 chain reference；不再在启动时选择数据库最新 verified chain。候选 chain、缺失/失效 preset 均不能创建正式 execution。

P1 聚焦证据：contracts 与 API TypeScript 检查通过；`task-product-state.test.ts` 1/1 通过，覆盖候选拒绝、真实验证证据、不可变发布、重启、失效 preset 和精确 execution 绑定；既有单链“样本→换输入→发布→正式复跑”定点用例通过，普通运行模型调用仍为 0。受管 fork 清单同时修正了 5 个 Windows 换行摘要，实际 `verifyForkSource()` 返回 digest `6354856c9624a2b44589c64bca872e1b4ac3f70c04843017d6356a0bd55be4cb`。既有多步骤 authoring 定点用例在发布逻辑前被测试环境 `model_account_not_found` 阻断，单独记录为基线环境阻塞，未写成 P1 通过证据。

## 产品最小闭环 P2

```text
Product Alignment:
- natural-language task: 用户确认需求后只发起一次“准备任务”，系统持续完成规划、真实预执行、编译和两组输入验证
- reusable chain boundary: 同一持久化 prepare job 串联既有 authoring、preexecution、compile、validation 与 release 发布能力
- runtime inputs: 由有限 ValueSchema 生成的代表业务输入和不同验证业务输入
- dynamic task outputs: 当前准备阶段、必要的业务输入请求、人工等待以及最终可运行产品状态
- generic platform capability used: 既有 TaskChainAuthoring、计划验证 execution、ValueSchema、P1 release/preset 与任务状态 API
- replay model calls: 样本和换输入验证只执行编译链；除链内显式 llm 节点外模型调用为 0
- site/task-specific code added: no
```

P2 已完成：

- 新增持久化 `prepare` job；它按固定阶段推进规划、代表输入预执行、链路编译、样本验证、不同输入验证和发布，不另建 runtime 或第二套调度器。
- 代表输入或不同输入不能安全自动取得时，通过同一 job 的 `inputRequest` 返回有限 ValueSchema 业务表单；等待人工的验证运行保留同一 execution，恢复后继续原 prepare job。等待输入的 job 在服务重启时不会被错误中断。
- 规划提示词和宿主校验不再要求 `startUrl` 运行输入；入口、URL 和页面路径归需求及预执行确认，运行合同只保留每次变化的业务值。
- 正常 Workbench 主路径收敛为“需求对话 / 准备任务 / 运行结果”；准备页提供单一主操作、六阶段进度、业务表单和折叠历史，不再暴露原始 JSON、链路编辑页、样本/换输入按钮或 E1–E4 术语。

P2 聚焦证据：Workbench 与 API TypeScript 检查通过；`task-chain.test.ts` 中“准备任务用同一持久化流程完成规划、业务输入、双验证和发布”定点用例 1/1 通过，最终状态为 runnable，release 与 preset 均由两次真实验证事实发布。测试中的两次普通验证模型调用为 0。运行该定点命令前曾因 npm 参数位置错误启动 API 测试脚本，发现后立即中断；仅有 3 个无关用例先完成，未将其计入 P2 证据。

## 产品最小闭环 P3（历史列表入口实现，已被 ADR 0010 取代）

以下记录保留当时服务端运行与表单实现证据；“从任务列表直接运行”的入口决定已失效。当前要求是列表只选择任务，发布链路在链路运行台直接运行并绑定单次 execution。

```text
Product Alignment:
- natural-language task: 用户从任务列表直接运行或再次运行已准备好的任务，并可按业务字段调整本次输入和节奏
- reusable chain boundary: 每次正式运行只消费当前不可变 release 中固定的计划和步骤链路引用
- runtime inputs: 当前 preset，或经同一有限 ValueSchema 校验的本次业务输入，以及 0–5000ms 节点 pacing
- dynamic task outputs: 独立 execution/run 记录、任务列表产品状态和运行入口
- generic platform capability used: P1 release/preset、queuedExecution、全局服务队列、ValueSchema 递归表单和请求幂等账本
- replay model calls: 普通运行继续只消费普通节点；只有 release 内显式 llm 节点可调用模型
- site/task-specific code added: no
```

P3 已完成：

- 新增正式 `run_task` 命令；请求必须显式携带当前 release id/version/digest，服务端重新核验 requirement、plan、全部 chain、输入合同、preset 和全局浏览器工作所有权后才创建 execution。
- 不传覆盖值时直接消费当前 preset；本次可覆盖业务输入与 pacing，并可选择把两者保存为当前 release 的新默认值。失效 preset 或非法 ValueSchema 输入不会创建运行。
- operation 账本以 requestId 幂等：双击、响应丢失后的同请求重试和轮询不会重复建档；前一次结束后的新 requestId 会创建独立 execution。
- 任务列表直接显示产品状态与唯一主操作“运行 / 再次运行 / 填写输入”。有效 preset 一次点击运行；业务表单、默认值选择和 pacing 位于同一可键盘/触屏操作的对话框，不要求进入准备页。

P3 聚焦证据：contracts、API 与 Workbench TypeScript 检查通过；`task-chain.test.ts` 中“P3 任务直接运行固定 release 和预设，幂等请求不重复且合法再次运行独立建档”定点用例 1/1 通过。证据覆盖同 requestId 只产生一个 execution、忙时第二请求拒绝、默认 preset 直跑、覆盖输入/pacing、保存默认值、第二次合法运行独立建档以及非法输入不启动运行。

## 产品最小闭环 P4

```text
Product Alignment:
- natural-language task: 用户在结果页得到业务结果或执行回执，处理人工等待，并只在确定性失败时显式授权生成修复版本
- reusable chain boundary: 原 execution/run/checkpoint 原位恢复；修复以失败 execution 证据为输入生成新 chain 版本并重新通过两组输入验证
- runtime inputs: 原运行输入、当前浏览器现场核验结果，以及旧 release 中另一组已验证业务输入
- dynamic task outputs: 类型化结果展示、失败分类与证据摘要、修复 job、新 release 和保留的旧版本/运行历史
- generic platform capability used: ResultSpec、TaskRun checkpoint、idempotency、authoring、计划验证、release 发布和模型审计
- replay model calls: 正常运行仍只允许显式 llm；只有用户点击“授权模型修复”后才启动修复 authoring 模型用途
- site/task-specific code added: no
```

P4 已完成：

- 正式 execution 新增类型化产品结果：`execution` 任务只给出完成步骤与证据回执，`data` 任务才携带合同化业务输出；queued/running/completed/partial/waiting/paused/blocked/failed/cancelled/stale 均保存明确状态、摘要和下一步。
- 失败证据固定分类、代码、execution/run/checkpoint/事件位置、原因和 digest。确定性失败标记为可修复；账号、验证码、访问限制、限流等 external failure、版本失效、预算和取消均不会出现模型修复授权。
- 结果页只把正式运行作为主历史，分开呈现执行回执和业务结果；人工等待可从同页核验现场并恢复同一 execution/run，技术步骤与验证运行折叠保留。
- 新增显式 `authorize_repair`：只有用户确认失败证据后才创建 repair job；失败证据进入新的真实 authoring 请求，新 chain 候选先验证失败输入，再验证旧 release 中另一组不同输入，全部通过后才发布新 release。旧 release、失败 execution 和全部运行历史不改写。
- 服务重启继续保留 waiting execution/run/checkpoint。对无数据 capability，恢复现场核验成功后不会重新派发原副作用，也不会因原浏览器命令预算已消费而阻止无副作用继续。

P4 聚焦证据：runtime、contracts、API 与 Workbench TypeScript 检查通过；P4 修复定点用例 1/1 通过，覆盖“未点击无 repair job → 显式授权 → 失败证据 digest 一致 → 新候选两次验证完成 → release v2 发布且 v1 保留 → external 阻断拒绝修复”；P4 人工等待重启定点用例 1/1 通过，重启前后 execution id 和 run id 均未变化，恢复后原运行完成。

## 产品最小闭环 P5

```text
Product Alignment:
- natural-language task: 用户在桌面或窄屏工作台中辨认任务状态，并只沿当前唯一主操作完成准备、运行、人工恢复或显式修复
- reusable chain boundary: UI 只投影任务、当前不可变 release、preset、prepare job 和正式 execution 的服务端事实
- runtime inputs: 有限 ValueSchema 业务字段、当前默认值和 pacing
- dynamic task outputs: 连续准备/运行进度、最后更新时间、业务结果或执行回执，以及可恢复错误
- generic platform capability used: React、Radix UI、TaskProductProjection、类型化结果和正式 task-chain 命令
- replay model calls: 视觉和交互层不增加模型入口；普通运行仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

P5 已完成：

- 新增统一产品状态呈现层，侧栏、顶部栏、准备页和结果页共用状态文案、色调、图标语义和最后更新时间；关键状态同时有文字与图形，不只依赖颜色。
- 任务列表主操作始终可见，并能把同一任务直接带到准备或结果视图；运行请求中全部入口共享 pending 状态，重复点击期间明确显示“正在创建”，不产生第二次派发。
- 准备页和结果页补齐连续阶段、当前步骤、更新时间和 `aria-live` 反馈；运行回执、业务结果、人工等待和有模型成本的修复授权保持不同层级，技术事实继续位于折叠区。
- ValueSchema 表单补齐业务 label/name、长度约束、数值输入模式、错误后首字段聚焦；Dialog/Callout/Field、长标题、长错误、空状态、触屏目标和安全区样式统一。
- 主工作区加入键盘跳转，焦点轮廓、窄屏约束、换行、点击反馈与 reduced-motion 规则完成；桌面继续保持深色、克制的任务状态轨道视觉。

P5 聚焦证据：Workbench 生产构建通过（5048 modules；仅保留既有大 chunk 性能警告）；隔离的正式 Workbench/API 页面以 headless Chromium 在 1440×1000 和真实设备指标 390×844 下完成截图检查，后者 `innerWidth/clientWidth/scrollWidth` 均为 390 且主操作未被裁切。键盘首个 Tab 命中“跳到主工作区”，Enter 后焦点进入 `#main-workspace`；`prefers-reduced-motion: reduce` 媒体覆盖生效。实际计算色值下主标题/背景对比度为 16.26:1，次要文案/背景为 9.01:1；主路径源码未发现 `outline: none`、`transition: all`、`autoFocus` 或可点击 `div`。

## 产品最小闭环 P6

```text
Product Alignment:
- natural-language task: 用户从自然语言需求准备并发布任务，随后直接运行、换业务输入、处理人工等待、授权确定性修复并查看结果
- reusable chain boundary: 正式任务、不可变 release、合法 preset 与固定 requirement/plan/chain digest 共同形成唯一可运行投影
- runtime inputs: 有限 ValueSchema 业务字段和 pacing；入口、URL、页面路径及可选准备动作来自需求与预执行证据
- dynamic task outputs: 执行回执、业务结果、人工等待、外部阻断、修复新版本和完整运行审计
- generic platform capability used: Workbench/API 产品命令、TaskProductProjection、TaskChainRuntime、受管 Browser capability 与持久化恢复
- replay model calls: 普通复跑为 0；本轮发布链不含显式 llm 节点
- site/task-specific code added: no
```

P6 当时已完成（历史结论，不满足后续 R1–R5）：

- 七类独立验收均由正式 Workbench/API 产品入口创建和恢复任务；完整结果为 `completed=true`，没有直接调用 runtime 伪造完成态。
- 执行型任务在服务重启后仍从任务列表绑定同一 release 直接运行并再次运行；数据型任务用同一发布版本分别输入 `alpha`、`beta`，得到对应业务结果，两次普通运行的模型调用均为 0。
- 人工等待跨服务重启后以同一 execution、同一 run 恢复；已完成副作用没有重复派发。HTTP 429 被分类为不可修复的 external block，模型修复请求被拒绝。
- 确定性后置条件失败只有在用户授权后才生成 repair job；新 release v2 通过两组输入验证后发布，旧 release、失败运行和审计保留。预执行证明的可选准备动作只在原目标未就绪时执行，正常路径跳过。
- 正式 Workbench 的桌面、390px 窄屏、键盘跳转、reduced-motion、双击幂等和断网后的同请求恢复全部通过；隔离 Chromium、API、受控站点和产品浏览器在验收后均已释放。

P6 聚焦证据见 [产品最小闭环验收记录](evidence/browser-replay-repair/MINIMUM_PRODUCT_LOOP_ACCEPTANCE.md)。原始结构化结果位于 Git 忽略的 `work/minimum-product-loop-1789843205619/result.json`；桌面和窄屏截图位于同目录 `screenshots/`。Windows x64 为本轮已验收范围；macOS arm64 仍按用户决定延期且未测。

Product Alignment:
- natural-language task: 按运行输入中的完整查询读取两页记录，并在第二页非空时读取首条详情。
- reusable chain boundary: 宿主从原生页面读取反向形成通用记录投影；未实际 dispatch 的失败探测不进入复跑图。
- runtime inputs: 完整起始 URL 与当前浏览器页面状态。
- dynamic task outputs: 两页实际记录及条件详情。
- generic platform capability used: 既有 ReadSpec、ResultBinding、动作覆盖账本和 TaskChain 控制流。
- replay model calls: 0。
- site/task-specific code added: no

| 模块 | 状态 | 当前事实 |
| --- | --- | --- |
| [A 动作记录](replay-repair/A_ACTION_CONTEXT.md) | 已通过 | 受控正式入口和真实 GitHub Issues 任务页均通过；来源业务结果及 judge 验证成功 |
| [B 定位与读取](replay-repair/B_DOM_TARGET_READ.md) | 已通过 | P1–P6 完成；真实 GitHub B 的 E1/E2/E3/E4 已通过，普通复跑模型调用为 0 |
| [C 交互执行](replay-repair/C_INTERACTION_ORDER.md) | 已通过 | 动作准备/命中、单次派发、具体后态、取消与恢复已通过受控及真实可见 Chrome 独立验收 |
| [D 复跑干扰与显式节点](replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md) | Windows 当前范围已通过 | D1/D3/D4/D5 通过；D2 Windows x64 通过；macOS arm64 延期且未测 |
| [产品最小闭环](MINIMUM_PRODUCT_LOOP.md) | R2/R3/R5 重新打开 | R1/R4 历史证据保留；执行清理误分类、不可复跑和画布不可读尚待 I1–I7 关闭 |
| [正式复跑恢复与链路工作台](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md) | I0–I5 已完成；I6–I7 待开发 | cleanup/accepted execution/event、服务端 presentation/descriptor/不可变发布事实和正式 Workbench 单次 execution 运行台已通过；动作编辑体验与最终正式验收尚未实现 |
| [组合验收](replay-repair/E_INTEGRATION_ACCEPTANCE.md) | 未通过当前门 | 历史 `completed=true` 与两次零模型复跑保留；第三次正式复跑失败使稳定闭环结论失效；macOS arm64 延期且未测 |

A 的受控 Chromium 验收在一个 Browser 会话中覆盖 37 个动作、120 个真实 DOM 事件和 42 个业务副作用；
dispatch/result、动作前后 observation 与保存加载均完成对账。真实 GitHub Issues 任务随后在同一个产品 Browser 会话内完成
两页列表及第二页首条详情，`sourceSuccess=true`、`sourceValidated=true`，结束后测试 Chrome 进程数为 0。编译仍保留 10 个
B/C/D 缺口，因此 A 通过不等于已有可冻结 TaskChain。详细事实见
[A 验收记录](evidence/browser-replay-repair/A_ACCEPTANCE_CONFORMANCE.md)。

B 的真实变输入验收使用 Issues 入口运行，job `aaa920b8-0d5c-47d2-81ef-14ec8253a8e7` 在同一 Agent/Browser 中产生两个
`done`：首次业务阶段后，编译字段缺口触发了唯一一次 follow-up；最终 `sourceSuccess=true`、`sourceValidated=true`，共 39 个
浏览器命令和 49 次 provider 调用。补证架构已实际工作，但 B 未通过：最终仍有 11 个编译缺口，其中 4 个字段读取、3 个
postcondition、2 个 URL 绑定、1 个具体效果和 1 个输出装配缺口。字段读取固定失败分别为：详情把含派生字段的完整对象误当作
纯 DOM 对象；第一页集合 selector 返回空样本；第二页投影合同错误曾被折叠成未知工具错误。当前代码已改为指导逐叶读取、复用
同页已证明匹配的集合 selector，并把投影合同错误保留为固定诊断；这些改动只完成定点测试，尚未再次执行真实 GitHub 验收。
复盘确认该方案仍把 raw CSS 暴露给模型，无法从协议上禁止它新增父子组合，因此已停止继续扩展 selector 提示词。B 的当前修复方向改为：
复用 Browser-Use 当前 selector index 和完整增强 DOM 树，以有界局部 DOM 的 opaque node refs 表达字段来源，由适配层机械生成并反查
定位表达，模型不再提交 CSS。

opaque refs 首次真实 GitHub 运行 job `a82fc922-e3ba-441f-8919-8532ebd4b9db` 完成 28 个浏览器命令和 37 次 provider
调用，`sourceSuccess=true`、`sourceValidated=true`，但没有产生 `bat_read_fields`，最终保留 15 个编译缺口。真实原因不是 DOM
定位失败：Browser-Use 在 `ActionResult` 同时有 `long_term_memory` 与 `extracted_content` 时默认只向模型展示前者，导致成功的
`bat_inspect_dom` 只显示“检查了 N 个节点”，模型看不到 `dom-*` refs。当前修复改用其原生
`include_extracted_content_only_once` read-state surface，把 refs 仅暴露给紧邻的一轮模型，同时继续从持久化证据中移除局部 DOM 文本。
该修复完成定点验证后再执行一次真实 B；未出现成功的字段读取和零关键缺口前，B 仍不通过。

服务重启后的真实 job `d08d1dc5-5a02-4817-85e7-b51bc8b2280d` 证明 refs 已进入模型：共 28 个浏览器命令、37 次
provider 调用，模型实际提交了 5 次 `bat_read_fields`。五次都以同一固定错误 `dom_reference_container_mismatch` 失败，最终
`sourceSuccess=true`、`sourceValidated=true` 但仍有 12 个编译缺口。canonical ActionResult digest 已反算确认错误；根因是曾从
Browser-Use 的裁剪增强树推算 `:nth-of-type`，其兄弟序号不等于完整 live DOM。当前代码已改为从 opaque backend node 经
Browser-Use `Element.evaluate` 取得完整 live DOM 路径并反查同一 backend id；定点测试覆盖“增强树漏掉普通兄弟但 live DOM
路径仍正确”。本轮不再重复真实任务，待该不变量完成本地交付检查后再安排下一次 B 验收。

该不变量现已完成真实 Browser-Use 短验收。受控页同时包含两个结构不同的重复记录、普通同标签兄弟，并在 inspect 后动态
插入新兄弟改变 `nth-of-type`；`bat_read_fields` 仍从原 backend nodes 正确读出两条 title/state 记录。根因补充为 Browser-Use
Actor 在 backend id 转 Element 前要求当前 CDP document 已初始化；旧代码直接 `Page.get_element` 会抛
`Document needs to be requested first`。当前复用共享的主文档初始化/身份核验，再读取 live DOM 路径；替换已保存字段节点后
固定返回 `dom_reference_field_mismatch`，不会读相似节点或退回未知错误。13 个 authoring 定点测试通过。尚未再次运行真实 GitHub B。

当前正式入口随后只运行了一次真实 GitHub B，job `58786140-294c-4f29-8cd0-d23254379d39` 完成业务输出，
`sourceSuccess=true`；详情正文与标题两次 `bat_read_fields` 均成功，证明 document 初始化修复在真实页面成立。运行最终未进入
可物化编译：共 49 个浏览器命令、55 次 provider 调用，第三次列表记录读取以固定错误
`dom_reference_outside_container` 失败，最终 judge 未通过，`sourceValidated=false`，job 在 E0 以
`hybrid_successful_judged_source_required` 停止。准确 trace 显示模型选择的 5 个字段 refs 有效，但误把标签节点同时声明为整条
记录的父容器。当前协议已删除模型可填的 `containerRef`；每条 record 只提交字段 refs，适配层从同页真实父链求有界最近公共祖先，
拒绝文档根范围，再用 live backend ids 反查。DOM 固定错误也会进入进度事件，不再折叠为 `unavailable`。15 个 authoring 定点测试
和 fork source manifest 校验通过；尚未再次消耗真实 GitHub 运行。

交互目标的跨页面链接已独立于上述字段读取缺口完成一条模型为零的纵向切片：authoring 证据保存 Browser-Use
`DOMInteractedElement` 的完整哈希、稳定哈希、XPath、AX/身份属性摘要，编译产物新增 `history` 目标；runtime 在每次新 DOM
快照中按 Browser-Use 原生层级重新匹配当前 selector index，并把同层多候选作为歧义失败。真实短验收覆盖两个不同站点：
`example.com` 链接从 index 19 重建为 39 后点击并进入 IANA；`python.org` 搜索框从 index 221 重建为 2211 后输入并读回
`asyncio`。两次均未调用模型且 Browser 在 `finally` 中关闭。该结果只证明交互目标重绑定，不把字段读取、动作后置条件或完整
TaskChain 编译宣称为已通过。

随后又完成正式产品短链：真实首次浏览器在 Python 官网捕获 `navigate + input` 来源，生成零 gap 的
`workflow-use-source/v2`，`materializeHybridChain` 生成两个普通 capability 节点；首次浏览器关闭后，由新的
`withHybridCapabilities + TaskChainRuntime` 会话复跑并完成，消耗 3 个浏览器命令、0 个 LLM 调用、0 条模型审计，
`auditComplete=true`。该链同时暴露并修复了一个独立适配错误：Browser-Use 动作回执对象曾被返回给输出契约为 `null` 的
节点，导致首个 `navigate` 在目标重绑定前即类型失败；当前 host 按节点输出契约丢弃 unit 动作回执，非 unit 输出保持不变。
受控短链没有真实 agent/judge 调用，因此只验证 source artifact、正式物化和正式复跑，不伪造模型审计越过 candidate artifact 门。

消费者驱动的异步就绪已完成第一条通用实现切片：编译器不再要求先识别分页、筛选、导航或弹窗，而是把一个有副作用动作连接到
其后第一个已经验证的结构化读取。导航生成 `ready`，同文档 UI/外部状态动作生成 `transition`；运行时在动作前读取同一投影基线，
动作只执行一次，随后等待投影转换并连续两次一致。动作创建消费者时允许从不可读转换为稳定可读；歧义和无效定位不作为“仍在加载”。
下一个交互目标的解析同样只对缺失/作用域未到达做 30 秒内有界重试，多候选立即失败。该切片复用现有 StepVerifier/Tenacity，
没有新增模型工具、场景枚举、浏览器或调度器。5 个新增 Python 测试、包含历史目标与 authoring 的 23 个相关回归、2 个
TypeScript IR 边界测试、2 个相关物化回归、API 类型检查、Python 静态检查和受管 fork manifest 校验均通过；真实 GitHub B 与不同输入 E4 尚未执行。

记录投影与结果装配已继续接入同一链路。正式 authoring 入口不再向模型注册 `bat_inspect_dom`、`bat_read_fields`、
`bat_wait_for`、`bat_scroll_to`、`bat_summarize`，也取消了业务完成后的第二轮模型补证。宿主现在在原生 `extract` 回调中从同一
增强 DOM 机械寻找唯一字段节点、最近记录祖先和跨记录共同子路径，再用 live DOM 双读验证现有迁移 `ReadSpec`；只有两次稳定结果
与原生业务值完全一致才形成读取节点。重复值无唯一锚点、字段多义和结构不一致均失败关闭。受控真实浏览器短验收中，输出 schema
上限为 5、页面实际只有 2 条且两条之间插入普通兄弟；宿主返回 2 条，生成 `body > main.issues > article.issue`，相对 `href`
确定性解析为绝对 URL，未使用 `nth-*`，浏览器与本地服务均已关闭。结果配方同时支持唯一同 schema 的运行输入整体绑定和需求原文
授权字符串常量；重复输入值不取第一个，动态数组不展开为固定索引。当时正式 `RecordProjection` 结构目标 IR、真实 GitHub B 和 E4 尚未冻结/执行。

随后按正式入口只运行了一次真实 GitHub B：job `6d6c0e9e-4ab7-4f06-8429-1585046ece55`、source artifact
`94b83d3b-f21e-4cc0-8b9c-44bf1b19e103`、browser run `69146779-fbde-42c5-8c4a-2d75a7add180`。Agent 在同一会话中完成
两页各 5 条 Issues、进入详情并返回业务报告，`sourceSuccess=true`、`sourceValidated=true`；共 12 个浏览器动作、18 次 provider
invocation。编译没有进入复跑，保留 9 个缺口：3 个读取证明、input/click/click/navigate 的 4 个动作条件、1 个 wait 条件和 1 个输出
装配缺口。这里不存在“复跑失败”：TaskChain 尚未生成。

该运行推翻了上一版采集假设。真实 Browser-Use `extract` 返回自由文本且 `metadata=null`；第二页 `extract` 回执甚至仍是第一页旧值，
详情 `extract` 又包含比最终成功输出更宽的正文。因此当前实现不再依赖 extract 元数据或回执值：每次 extract 后连续保留两份同页增强
DOM 于内存，业务成功后由最终输出反向寻找两份快照都能唯一复现的最大投影，只持久化 `ReadSpec`、schema、字段路径及摘要，不持久化
raw DOM。一个读取节点可向最终输出的多个字段路径供值。后续动作参数若与某个前序读取输出路径唯一同值，宿主生成普通 `node`
`ValueBinding`；数组索引表示读取结果中的业务项，不表示 DOM 位置，同值多路径会拒绝。Python 编译器与 TypeScript 物化器都会重新核验
源读取事实和实际值。整数 DOM 文本只接受由全部记录共同证明的固定前后缀后再做严格转换；正文默认保留原始多行文本，只有最终值要求时才启用
已证明的空白规范化。最终输出中尚未覆盖的叶子可以唯一复用任一已验证读取的同 schema、同值叶子；多候选不取第一个。hybrid Python
小套件 45/45、TypeScript 定点 7/7、API 类型检查和 Python 静态检查均通过；本轮修复尚未再次执行真实 GitHub B。

动作自身状态也已接回同一身份链：输入或下拉后的值不再要求目标必须有 `aria-label` 才能复查，而是用动作前保存的 Browser-Use
history identity 在动作后 DOM 中唯一重绑定；多个候选立即失败。位于下一条已编译目标动作之前的固定 `wait` 被标记为探索脚手架，
由下一目标的有界解析拥有，不生成定时复跑节点；没有正式消费者的等待仍保持缺口。

对保存的真实 B artifact 做了离线重编译，结果仍显示原 9 个缺口。这不是新逻辑无效：旧 artifact 按隐私边界没有保存 raw DOM，因而不可能
事后补出本轮新增的宿主读取事实、动作后重绑定事实和前序读取绑定。该结果同时固定了验收边界：必须用新代码重新做一次 E1 来源采集，
不能把旧 artifact 的编译结果伪装成新实现验收。

## 当前实现边界

- 固定 browser-use 0.13.8、workflow-use 0.2.11 与 Python 3.12；运行只消费受管 fork 的生产源码子集。
- TaskChain、版本、绑定、运行、恢复和审计由 B-A-T 持有；LangGraph `StateGraph` 仍是唯一图执行器。
- 普通复跑节点不调用模型；只有显式 `llm` 节点可以调用模型并记录审计。
- 原始任务数据、浏览器 Profile、账号配置和 Git 忽略的真实运行产物未参与本轮清理。

## 2026-09-17 仓库清理

- 删除最新提交引入的 290 个无运行职责文件：上游 UI/扩展/示例/开发测试、一次性 API 测试与探针、重复方案文档、
  历史 evidence 和临时 agent 配置。
- 保留 `workflow_use` 生产源码、AGPL-3.0 许可证、来源清单、主链测试需要的最小 fixture、A–E 模块说明及 A 当前证据。
- `PROGRESS.md`、`ROADMAP.md`、`RESEARCH.md` 已收敛为当前事实，不再保存逐轮日志。
- 留存源码的 manifest 校验和 API TypeScript 检查通过；`git diff --check` 通过。当前已有固定依赖环境；Windows 应用控制
  阻止其 Python launcher 后，本轮在忽略的 `work/` 内使用系统 Python 3.12 的薄 venv 复用同一依赖，版本和源码入口核验通过。

## 当前交付状态

R1 → R5 曾按顺序完成一轮实现和验收；下列结论现按最新证据修订：

1. R1 已完成：需求访谈事实、LLM 驱动的只读来源发现、Question Panel、待决硬门和确认需求组装均有正式入口证据。
2. R2 部分事实有效：准备来源不再调用 judge，合法终点不被 chain/step/plan completion predicate 二次改判；但 runner 清理仍可覆盖成功执行并进入修复，故未完成。
3. R3 服务端版本事实、验证和新版本发布可复用；实际画布展示和节点详情不可读，故未完成。
4. R4 已接通结果页三条用户验收路径、链路修订入口和携带运行摘要的需求回流，并由 R5 完成正式产品复验。
5. R5 历史正式入口结果保留；真实任务第三次复跑推翻“可稳定连续复跑”，清理恢复和可读画布也未被覆盖，故未完成。

macOS arm64 实机验收继续延期且未测；当前工作区保留全部既有实现和文档改动，未提交、未推送。

2026-09-19，A/B 当前实现与验收状态已由本地提交 `8aaa4a8` 固定，未推送远程。C 随后在同一 checkout 完成：
没有重复实现稳定目标、ConsumerReadiness、缺失目标分支或 ResultBinding，只补齐动作前准备与命中核验、正确滚动、
单次业务动作派发、具体后态等待，以及取消/恢复时不重复副作用。

[ResultSpec / ResultBinding 开发计划](RESULT_SPEC_BINDING_IMPLEMENTATION.md) 的 P1–P6 已实现：语义计划生成 execution/data
`ResultSpec`，数据 `count` 通过类型化来源关系降低为既有 `data.transform/count`，E1 后编译器生成只绑定来源的 `ResultBinding`；
空列表分支在任何 `[0]` 消费者之前判断，两个装配路径写同一结果变量并汇合到唯一 completed terminal。离线跨层运行覆盖非空、同输入复跑和
空列表，三次普通运行模型调用均为 0；合同 1/1、结果编译 9/9、跨层运行 1/1、API 类型检查和 fork manifest 真校验通过。

2026-09-19 的新真实 GitHub B 使用 task `fc80c0ce-915a-41d8-a576-6bc41f4c8c99`、plan
`2ed8de1c-684d-496c-8c43-22575807bf51` 和证据目录 `work/github-b-1789763257455`：E1 在一次真实探索中返回
`sourceSuccess=true`、`sourceValidated=true`，第一页/第二页各 5 条且有详情；E2 用同一来源重编译为 0 gap、3 个来源赋值、1 个空列表分支，
canonical digest 为 `9c406549819ae79d4c8fafab8d08c36bc534562efba54c15857390abbaa5150c`。当前产物 E3 同输入复跑 completed，
输出 `5/5/有详情`，模型调用 0；E4 不同输入 completed，输出 `1/0/无详情`，模型调用 0。E4 事件证明下一页稳定目标缺失后走
`missing → page2Issues=[]`，没有执行第二页读取、`[0]` 路径或详情读取。B 阶段门已关闭。

2026-09-19，C 已完成并独立验收。受控浏览器覆盖嵌套滚动、5.5 秒延迟后态、永不完成、输入、选择、按键和同 URL
document 替换；业务动作在后态重试外只派发一次。取消验收在服务器确认一次点击后中断，保留
`paused/interrupted + pendingEffect=uncertain`，同一运行恢复后副作用总数仍为 1。新的真实可见 Chrome GitHub TaskChain
完成第一页 5 条、第二页 5 条及第二页首条详情，30 条节点事件闭合、10 次浏览器命令、编译 gaps 为 0，
`modelCalls=0`、`llmCalls=0`；关闭后测试 runner/Chrome 进程数为 0。详见
[C 独立验收记录](evidence/browser-replay-repair/C_ACCEPTANCE_CONFORMANCE.md)。D 尚未开发。

同日补充了干扰与滚动的真实浏览器反例。原生 confirm 在普通复跑侧原先会被多 CDP session 重复记账 4 次，现复用已有
`DialogEventBridge` 并把 owner 收窄为单次普通动作，真实页面只记录 1 次且 authoring owner 不冲突。DOM 蒙层不再被描述为
“可识别弹窗”：完全覆盖时目标不进入 browser-use selector map；部分覆盖时只能由 `elementFromPoint` 证明中心点被其他 DOM
元素挡住。固定 browser-use 的真实 `Tools.act(click)` 是 `isTrusted=false`、坐标 `(0,0)` 的合成点击，不等同于物理鼠标；
同坐标 CDP 鼠标点击才实际命中蒙层。scroll 现保存前后坐标、范围与 wheel/scroll 事件，能区分无范围、边界、CSS 锁定和事件取消。
真实 Chromium 1/1、相关 Python 35/35 与 fork source 校验通过；详见
[干扰与滚动可观测性验收](evidence/browser-replay-repair/INTERFERENCE_OBSERVABILITY_ACCEPTANCE.md)。这不表示任意 DOM 弹窗可自动关闭，也不表示 D 已完成。

2026-09-19，D 已按最新结论重写为一个连续交付阶段：D1 建立 React + Radix UI 干扰实验站并完成确定性干扰处理；
D2 新增隔离 `function`；D3 将二元 branch 升级为有序 N 路 case/default；D4 把 LLM 收敛为编译时保存 prompt、
运行时单次调用且只输出一个 `result` 的显式节点；D5 经受控页面、真实页面和不同输入关闭独立验收。未知弹窗、遮挡、
scroll 或 selector 失败不进入 LLM。[D 实施交接](replay-repair/D_IMPLEMENTATION_HANDOFF.md) 已固定 stable/v2 schema、
25 个场景 ID、逐文件改动、错误码、定点命令和 GitHub 真实语义任务。D2 的 QuickJS 准入已修正为同一 commit/lockfile 下的 Windows x64 与 macOS arm64 实机验证；若产品声明支持 Intel Mac，再补 macOS x64。任一必需平台失败或未测，D2 与 D 均不得写成完成。本次只更新设计文档，没有开始 D 代码实现或验收。

## 2026-09-20 当前产品故障修复

Product Alignment:
- natural-language task: 使用 B-A-T 自有浏览器完成已确认的网页任务，并在后续运行中保留用户亲自建立的登录状态。
- reusable chain boundary: 计划保存预执行入口；浏览器 Profile 属于本机执行环境，不进入 TaskChain 业务节点。
- runtime inputs: 仅任务业务输入；入口 URL 与浏览器 Profile 都不是用户每次复跑填写的字段。
- dynamic task outputs: 保持各任务版本化结果合同不变。
- generic platform capability used: browser-use 受控浏览器、现有来源采集与 TaskChain runtime。
- replay model calls: 普通复跑为 0；仅首次探索保留现有 Agent/Judge 调用。
- site/task-specific code added: no

Reuse Assessment:
- capability: 持久浏览器身份、受控导航与现有登录状态复用。
- existing implementation in repository: browser-use `Browser(user_data_dir=...)`、单浏览器 owner、人工等待与恢复合同。
- mature candidates and pinned versions: 已固定 browser-use 0.13.8；不新增浏览器实现或账号仓库。
- selected implementation: 一个由 B-A-T 数据目录拥有的持久 Profile，继续复用 browser-use 公共 Browser API。
- reused public surface: `user_data_dir`、`allowed_domains`、Browser 生命周期与 CDP session。
- B-A-T-owned adapter and remaining gap: IPC 传递本地 Profile 路径、入口事实和错误分类；多 Profile 管理不在本次测试门内。
- license/runtime/platform fit: 沿用当前固定依赖与 Windows x64 范围；macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: Profile 只允许产品单会话拥有；不连接或复制日常 Chrome Profile。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 临时 Profile 会在关闭时删除登录状态；日常 Chrome 直连被用户取消，且当前 Chrome 没有调试端点。
- focused validation: API 类型检查、Python 协议/白名单定点检查和一条无头持久 Profile 浏览器验收；真实用户任务留给用户发起。

当前实现已把 authoring 与普通 runtime 统一绑定到 `data/browser-profile/default`，runner 关闭只终止其自有浏览器树，
不再删除 Profile。计划的 `entryUrls` 现在会进入真实 Browser-Use 任务正文；若浏览器安全策略拒绝跨站导航，宿主在该动作后立即失败，
不再允许 Agent 改用搜索引擎、其他协议或移动站继续试错。browser-use 白名单改为其实际支持的精确 host 形式，B-A-T 继续执行完整 origin 核验。
API 类型检查、入口指令 2/2、越权停止 2/2、fork manifest 与无头浏览器 1/1 均通过；无头验收同时证明 runner 关闭后 Profile
文件仍存在。正式产品 API 当前只返回任务 `e99c66f6-873e-40cf-a1c9-bebca8d05540`；真实 Bilibili 准备由用户发起，尚未冒充通过。

Workbench 顶栏新增“专用浏览器账号”入口。用户点击后才会启动由 B-A-T 独占的可见浏览器，可在网站自身界面登录、退出或切换账号；
完成后由同一入口关闭，之后准备和复跑共享该 Profile。账号浏览器与任务准备/运行互斥，API 和界面都不返回 Profile 路径、Cookie
或密码。产品失败投影也不再显示 `hybrid_source_and_cleanup_failed` 等内部码：组合错误优先投影真实主因，未知失败只给出安全中文说明，
内部分类仍留在 authoring 审计。

本轮新增定点证据：contracts、API、Workbench 类型检查通过；专用 Profile 固定路径与唯一 owner 测试 2/2；错误投影测试 1/1；
Python runner 静态编译通过。开发服务已从同仓库旧实例安全重启为 PID 8564，`/api/browser-profile` 返回 `closed`，正式任务仍只有
上述 1 条，Workbench 及其新入口模块均返回 200。没有由开发验收启动可见浏览器，也没有再次运行真实业务流程；下一步由用户先按需
打开专用浏览器建立登录态，再对该任务发起一次“重新准备”。

用户实测发现账号浏览器设置弹窗可以被提前关闭，导致专用浏览器仍由 B-A-T 持有，而“重新准备”只返回占用错误和无效的原样重试。
现已正常关闭该 B-A-T 浏览器并保留 Profile；设置弹窗在浏览器打开期间不再提供“返回工作台”，Esc/遮罩关闭会提示先完成账号操作，
正常关闭后自动返回工作台。准备/运行错误区识别 `browser_profile_busy` 后直接提供“关闭专用浏览器并继续”，关闭成功即复用原幂等
命令自动重试，不再要求用户寻找另一个入口。Workbench 类型检查与该恢复路径定点测试 1/1 通过；实时 API 状态为 `closed`，
专用 runner/Chrome 进程数为 0，未替用户发起真实任务准备。

## 2026-09-20 R3 链路修订入口（历史实现证据，UI 退出门已重新打开）

以下服务端 revision/checksum/digest/validation/publish 证据仍可复用；“不新增图编辑器、继续现有 React Flow 即完成”的选型结论已被后续真实复杂链复盘和 ADR 0010 取代。

Product Alignment:
- natural-language task: 用户在一次正式运行后修正局部链路实现，并把验证通过的修改发布为后续运行使用的新版本。
- reusable chain boundary: 每个修订草稿只基于当前发布版本中的一条参数化 TaskChain；计划、其他链路、旧发布和历史运行保持不可变。
- runtime inputs: 继续使用计划的类型化业务输入；用户不填写 selector、startUrl 或 JSON。
- dynamic task outputs: 沿用计划和链路已有的类型化输出合同，编辑器不引入网站或业务字段类型。
- generic platform capability used: React Flow 画布、TaskChain/Zod 合同、现有编译器、正式验证队列和不可变发布服务。
- replay model calls: 手动编辑、验证和发布均为 0；只有链路里显式存在的 `llm` 节点可在运行时调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 版本化图修订、结构校验、代表输入/换输入验证和不可变发布。
- existing implementation in repository: React Flow 只读图、`taskChainSchema`、`compileTaskChain`、计划验证队列、不可变 TaskChain/Release 与 SQLite repository。
- mature candidates and pinned versions: 复用仓库已固定的 `@xyflow/react`、Zod、LangGraph 和 SQLite；不新增图编辑器、调度器或版本仓库。
- selected implementation: 在既有公开组件和领域合同之上增加 B-A-T 自有的修订草稿、乐观并发 token、内容 checksum 与可执行 digest 适配层。
- reused public surface: React Flow 节点/连线交互、TaskChain schema/compile、计划 input contract 表单、验证执行与 `TaskProductService.publish`。
- B-A-T-owned adapter and remaining gap: 持久化画布布局和类型化操作，冻结候选后复用正式验证；实现及 R5 正式 Workbench 产品复验均已完成。
- license/runtime/platform fit: 沿用当前依赖和 Windows x64 范围；macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: 验证继续由现有单浏览器队列拥有；草稿不拥有浏览器、不复制运行状态。
- replay model calls: 0，显式 `llm` 节点除外。
- rejected candidates and evidence: 不另造图执行器或通用版本系统；现有 React Flow、编译器、验证队列和发布服务已经覆盖这些职责。
- focused validation: 先验证草稿持久化、乐观并发、候选冻结、正式验证引用和新发布不改写旧事实，再验证 Workbench 类型化编辑闭环。

R3 定点证据：服务端单项回归 1/1 通过，覆盖草稿重启恢复、并发 token、checksum/digest、聚焦请求安全扩展为完整计划验证、代表输入与不同输入、普通节点 0 模型调用、新 release 发布、旧 release/chain/run 不改写；contracts、API 和 Workbench 类型检查通过。React Flow 当前只在草稿态开放拖动和连线，节点详情支持类型化字段编辑、复制、删除和入口切换；已发布和历史版本保持只读。

## 2026-09-20 R4 用户验收与需求回流

Product Alignment:
- natural-language task: 用户查看正式运行的实际结果后，明确表示符合预期、修正局部链路，或携带本次结果重新梳理整体需求。
- reusable chain boundary: 用户验收是追加到 execution 的独立事实；局部问题引用本次实际运行的链路，整体问题返回同一任务的需求对话。
- runtime inputs: 正式 execution、其不可变 release/chain 引用、用户选择和用户业务说明。
- dynamic task outputs: 追加式验收记录、链路修订草稿，或包含用户可读运行摘要的新需求对话轮次。
- generic platform capability used: 现有 TaskExecution/TaskChain API、R3 修订服务、InterviewConnection 与 Common Composer。
- replay model calls: 结果验收和手动链路修订为 0；只有“重新梳理需求”进入需求对话后按正常访谈调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 运行结果验收、局部修订路由和整体需求回流。
- existing implementation in repository: Results 已展示正式 execution/result，R3 已有修订草稿入口，需求对话已有幂等消息、版本草稿和持久化。
- mature candidates and pinned versions: 继续复用 Radix Dialog/Select/TextArea、现有 TaskChainConnection 与 InterviewConnection；不新增反馈框架或第二套会话系统。
- selected implementation: execution 追加 `reviews`；局部选择由服务端核验为本次运行真实 chain reference 并创建 R3 草稿；整体选择保存有界用户可读摘要，再通过正式需求对话命令形成新轮次。
- reused public surface: TaskExecution Zod/SQLite 存储、不可变 chain/release 引用、React/Radix UI 与 Interview API。
- B-A-T-owned adapter and remaining gap: B-A-T 只组装安全运行摘要、校验路由引用并保存用户决定；三条正式产品路径和重启持久化已由 R5 验证。
- license/runtime/platform fit: 不新增依赖；当前 Windows x64，macOS arm64 仍未测。
- browser/runtime/state ownership conflicts: 验收不启动浏览器；需求回流只启动访谈模型，链路修订验证仍通过单浏览器队列。
- replay model calls: 验收与手动编辑 0；需求回流按访谈用途审计，普通复跑约束不变。
- rejected candidates and evidence: 不把技术 completed 等同于用户满意；不让“调整链路”授权模型修复；不把整体需求错误塞进局部节点 patch；不覆盖原 execution 或 requirement。
- focused validation: execution review 合同 2/2、Workbench 连接/回流消息 5/5、R3 服务端 1/1，contracts/API/Workbench 类型检查通过。

## 2026-09-21 R5 与真实可复跑任务闭环

Product Alignment:
- natural-language task: 用户以业务语言确认浏览器任务，经真实页面准备后发布为可从任务列表重复启动的链路，并在结果页完成验收、局部修订或整体需求回流。
- reusable chain boundary: 一个确认需求版本产生不可变计划、参数化 TaskChain、release 与 preset；每次正式运行创建独立 execution/run，旧版本和历史运行不改写。
- runtime inputs: 只包含类型化业务输入；用户不填写 `startUrl`、selector 或 JSON。
- dynamic task outputs: 正式业务结果、运行审计、用户验收、修订版本或带运行摘要的新需求版本。
- generic platform capability used: Pi AgentSession 工具注册、BrowserSkill/browser-use、TaskChain/LangGraph runtime、React Flow 修订入口和 SQLite 事实源。
- replay model calls: 本轮真实链不含显式 `llm` 节点，sample、verification 与两个正式 replay 均为 0。
- site/task-specific code added: no

R5 受控产品验收：

- `work/minimum-product-loop-1789921035029/result.json` 从正式 Workbench/API 入口恢复并完成，顶层 `completed=true`。
- 需求澄清、来源候选、准备边界、合法终点 completed、真实错误、三条结果验收、自由画布修订、新需求版本、人工等待同 run 恢复和重启持久化均取得正式产品事实。
- 旧需求、计划、链路、release 和历史 execution 均保持不可变；自动验收使用 headless 浏览器，没有抢焦点。

真实公开站点任务：

- task `e99c66f6-873e-40cf-a1c9-bebca8d05540` 使用 plan `44378eb4-c2cd-41ed-8971-8211a1dbebce` v7、chain `78ab3e78-7b2b-4bd4-884d-4ebcecc027b0` v4、release `eefe5eb7-a4be-42f2-836b-66867d67ecd9` v1 和有效 preset `f60ae0e4-85c5-4923-8eca-56689ad85abd`。
- preparation job `2bd347c7-ec6f-4e5d-88c5-751b9b94b5ba` 完成；sample execution `a1809272-07c7-4eb9-8aff-af7fab9ec396` 和 verification execution `b61a48b0-64a8-40ba-84a6-c09b916edbae` 均 completed，各自的正式 run 为 6 个浏览器命令、0 个模型调用。
- 两个正式 execution `69b391df-a8c2-4a2d-8ff4-bff9832d4597`、`982066f7-25e9-4bc1-86ae-5932e34ed62a` 均 completed；对应 run `1c72e714-74b9-476a-809c-90fa27936699`、`73c80ae4-4df2-41d9-81c2-d322ad253a15` 各为 5 次节点转换、6 个浏览器命令、0 个模型调用，`auditComplete=true`。
- 根因修复均为通用能力：计划授权入口绑定、执行期观察型读取、弱哈希碰撞后的稳定目标消歧、点击新标签页后的显式聚焦，以及技术失败重试时复用同一不可变计划和版本化来源事实。没有加入网站名、业务字段、页面文案或 CSS class special case。
- 当前受管 fork digest 为 `135fbdfc4a2c6e9f9f9060fe389be861fd849ee52403ded2a92bab43e3ce3d00`。Windows x64 当前范围通过；macOS arm64 仍延期且未测。

## 2026-09-21 正式复跑恢复与链路工作台修订

当前开发基准为
[正式复跑恢复与链路工作台开发基准](EXECUTION_LIFECYCLE_AND_CHAIN_WORKBENCH_ITERATION.md)，I0 架构与隔离原型已完成，生产按 I1 → I7 推进；I1–I5 已完成，当前进入 I6。

已核验根因：

- TaskRun 和 1/1 计划步骤已经 completed；`withHybridCapabilities` 在成功工作返回后的 `finally` 调用 `RunnerProcess.close()`。
- Python runner 退出码 1 被 `RunnerProcess.close()` 转成 `upstream_cleanup_unconfirmed:1`；close request 的具体失败被吞掉，stderr 也未形成安全产品证据，因此具体 Python 清理阶段仍需 I2 用 allowlisted stage code 定位。
- `TaskPlanExecutor` 把该通用异常归为 `deterministic / execution_failed / repairable=true`，产品随即进入 `needs_repair / repair`。这是执行生命周期和清理事实混淆，不是链路缺陷。
- 当前诊断时没有残留 runner/Chrome，浏览器 owner 也不要求清理；该事实不能倒推失败时的清理可靠。
- `projectChainGraph` 使用固定两列坐标并默认绘制全部出口；`NodeDetail` 直接展示 JSON 和原始事件。服务端 revision/checksum/digest/validation/publish 可复用，但 R3 UI 退出条件不成立。

本轮只完成文档与领域基准：

- 新增 ADR 0009，区分 TaskRun 链路结论、TaskExecution 生命周期和资源清理结论。
- `CONTEXT.md` 新增执行生命周期、资源清理结论、待清理运行和链路展示投影。
- 新迭代文档固定 cleanup_required 合同、runner close 细则、产品投影、ChainPresentation/CapabilityDescriptor 服务端事实、链路阶段与动作路径层级、节点详情、I1–I7 最小验证和正式验收门。
- 同步重新打开 ROADMAP、MINIMUM_PRODUCT_LOOP、REQUIREMENT 基准和 E 组合验收中的冲突完成结论。
- 没有修改生产实现，没有安装依赖，没有运行测试或真实浏览器，没有提交或推送。

## 2026-09-21 链路画布直接运行与实时运行流设计修订

用户确认新的硬交互要求：已经准备完成的任务必须在链路画布直接“运行/再次运行”；左侧任务或 session 列表只负责选择，点击必须立即显示选中/加载反馈，不能暗中启动或无响应。运行被服务端接受后，画布必须像成熟工作流产品一样绑定本次 execution，持续展示节点和连线的真实流转，而不是静态死图。

本轮 CodeGraph 核验的当前差距：

- `main.tsx` 的任务行选择只调用 `model.select(id)`；运行仍由侧栏/独立 `TaskRunDialog` 触发。
- `useTaskRunner` 的 busy 只覆盖 POST，成功后只 reload 任务模型；`TaskWorkspace`/`ChainView` 没有接收新 execution。
- 当前链路投影会从多个 TaskRun 逐节点取最后事件，没有单次 execution 边界，因此不能直接加动画冒充运行流。
- 服务端 revision draft、checksum、executable digest、验证和不可变发布仍是可复用事实；本轮不推翻这些实现。

已更新产品基准：

- 新增 ADR 0010，固定“链路工作台是直接运行与实时观测入口”、即时反馈状态机、accepted execution 回执和按 execution/sequence 续接。其最初写入的“大容器内嵌子画布、FlowGram 优先”方案已在同日架构复盘后被 ADR 当前版本取代，不得据本段实施。
- 当时有效设计是同一 TaskChain 的阶段总览、单个临时动作摘要和同画布聚焦动作子图；2026-09-29 已由本文顶部的“阶段父节点内常驻动作列表 + 复杂路径原位展开”方案替代。动作列表和展开路由不是第二批画布节点或可执行子链，不再切换独立聚焦子图。
- 当前选型保留 `@xyflow/react@12.11.6`，引入 `@dagrejs/dagre@3.1.1` 布局阶段父节点；阶段内路由使用同父节点内的 DOM/SVG 投影，FlowGram/Coze 仅作交互参考，ELK 当前不引入。
- 严格顺序保持 I1 → I7；I3 建立幂等运行回执和事件合同，I4 建立 presentation/descriptor 服务端事实，I5 接生产运行台，I6 接修订发布，I7 从正式 Workbench/API 验收。

以上记录描述当时的文档设计阶段；后续同日原型进展见下节。

## 2026-09-21 链路阶段架构对齐与交互原型

核心架构已统一：

- `任务步骤` 仍是计划层单元，一条步骤由一条 `TaskChain` 实现；`链路阶段` 是 TaskChain 内版本化的用户阅读/修订边界；`动作节点` 才是 runtime 执行单元。
- 链路阶段引用相连动作子图并声明逻辑入口与具名出口，自身不参与调度。总览、动作摘要和聚焦子图共享真实节点 ID、边和所选 execution 事实，不生成第二套流程。
- 阶段总览不常驻子链。单击只附着一个不参与布局的动作摘要；双击或“进入阶段”在同一画布聚焦真实动作子图，复杂分支/循环不能用线性时间线冒充。
- 节点编辑由 capability descriptor 驱动，必须展示所属阶段、前置条件、动作、后置条件和下一动作。未知 capability 只读；执行语义改变后旧验证失效，聚焦验证重新证明阶段出口可达前禁止发布。
- executable digest 只随可执行节点、边和绑定变化；阶段分组与手动布局进入 revision checksum；自动布局、临时摘要和聚焦状态不进入 executable digest。

开源复用结论：

- 保留现有 `@xyflow/react@12.11.6`，新增 `@dagrejs/dagre@3.1.1`；总览与聚焦图分别布局，不使用大容器复合 sub-flow。
- FlowGram/Coze 作为交互参考。官方 loop 容器与展开源码使用大容器内显示/隐藏子节点，且 FlowGram 的 document/form/history/variable 所有权与当前服务端 revision 重叠，因此不引入。
- Dagre 及 graphlib 的 npm unpacked size 合计约 1.9 MB，不是浏览器 bundle，也不会在每次布局时解包；自动布局只在初次投影、结构改变或用户明确整理时执行。

可点击原型位于 `apps/workbench/prototype.html` 与 `apps/workbench/src/prototype/`：

- 保留需求对话、任务准备、链路图、运行结果四个产品 Tab；
- 展示阶段总览、单个附着动作摘要、同画布聚焦子图、横/纵布局、拖动/缩放/小地图；
- 展示画布直接“再次运行”及节点/边运行状态演示；该演示明确不连接后端，不作为真实 execution 证据；
- 右侧面板只服务当前选择。`提交搜索` 可修改按键或替换为点击；点击目标通过浏览器目标选择入口表达，不要求 CSS selector；修改立即使验证失效并禁用发布。

定点验证：

- `npm run check --workspace @browser-capture/workbench` 通过；
- Windows Edge headless 1600×1000 成功渲染阶段总览和 `?focus=search-content` 聚焦编辑态；
- 当前只完成架构与隔离原型，不代表 I3 服务端运行回执、I4 presentation/descriptor 合同、I5 生产接线、I6 发布体验或 R3/R5 已通过。

## 2026-09-21 开发文档按已确认原型重组

本轮重新核验 checkout 为 `master@7d59036332a66de8991744659d2317da126c6123`，工作区已有 167 项 dirty entry，全部保留。CodeGraph 对实时源码确认：

- `withHybridCapabilities()` 在 `work()` 返回后由 `finally` 直接等待 `RunnerProcess.close()`；
- `RunnerProcess.close()` 吞掉 close protocol 的具体错误，并在 child exitCode 非零时抛出普通 `upstream_cleanup_unconfirmed:*`，且抛错位于临时目录删除之前；
- `TaskPlanExecutor.execute()` 把该普通异常统一归为 `failed / deterministic / execution_failed / repairable=true`；
- `LiveChain` 仍调用 flat `projectChainGraph()` 并从匹配 run 中聚合节点最后事件，生产画布尚未拥有 active execution 或 ChainPresentation。

开发基准已重组为 I0–I7：

- I0 架构与隔离原型已完成，只作为交互设计证据；
- I1–I3 依次完成 ExecutionCleanup 合同/持久化、runner 结构化清理、accepted execution/事件续接与产品投影；
- I4 在任何生产画布之前完成 ChainPresentation、ChainStage、CapabilityDescriptor、checksum/digest 和验证失效的服务端合同；
- I5 把 React Flow + Dagre 原型接入正式运行台和单次 execution；
- I6 完成上下文动作编辑、浏览器目标选择、聚焦验证和不可变发布；
- I7 才从正式 Workbench/API 重验普通复跑、cleanup_required 恢复、链路修订、需求回流和持久化。

本轮仅重组领域与开发文档，没有修改生产运行逻辑，没有运行正式复跑，也没有把原型演示写成产品通过。

文档定点验证通过：I0–I7 标题顺序唯一，过期的编辑器选型与画布层级表述没有残留，本文涉及的本地 Markdown 链接全部可解析，相关文件 `git diff --check` 通过。仅有 Git 的 LF→CRLF 工作区提示，无内容错误；未运行代码测试或浏览器任务。

## 2026-09-21 I1 清理生命周期合同与持久化

I1 开工记录：

```text
Product Alignment:
- natural-language task: 已发布链路完成后，若本次运行拥有的 runner、浏览器或临时资源尚未确认释放，保留实际业务结果并允许用户核验清理后再次运行
- reusable chain boundary: TaskRun 继续只记录图执行结论；TaskExecution 以一份结构化 ExecutionCleanup 事实记录本次 execution 的资源清理生命周期
- runtime inputs: execution 身份、当前 sequence、资源 owner 关联和幂等清理请求
- dynamic task outputs: cleanup pending/confirmed/unconfirmed 状态、追加审计摘要、cleanup_required 产品状态和清理主操作
- generic platform capability used: Zod 跨包合同、SQLite/Drizzle execution 持久化、现有 operation 幂等账本和产品事实投影
- replay model calls: 0；资源清理不调用模型，也不构成模型修复授权
- site/task-specific code added: no
```

当前包严格只修改 I1 合同、持久化和对应定点测试；runner close 协议、产品恢复命令、事件续接和 Workbench 留给后续 I2–I3。

I1 完成证据：

- `TaskExecution` 新增唯一权威 `cleanup` 摘要；历史 JSON 缺字段只读为 `not_recorded`，新保存会把完整结构写回原 `taskExecutions.body`。没有新增平行 cleanup 状态表或重复列，数据库仍为 v14，无数据迁移需要。
- `cleanup_required`、`cleanup` 主操作和 execution result `nextAction=cleanup` 已进入共享合同；`unconfirmed` 必须绑定 `cleanup_required`，不能伪装成 failure/repair。
- repository 以 execution `sequence` 原子更新 cleanup，限制 `not_recorded → pending → confirmed|unconfirmed` 和 `unconfirmed → pending` 重试；陈旧 sequence 被拒绝，attempt 防止并发清理覆盖新证据。
- `@browser-capture/contracts`、`@browser-capture/api`、`@browser-capture/workbench` TypeScript 检查通过。Workbench 首次检查发现集中产品状态词典缺少新状态，补齐后续跑通过；contracts/API 无错误。
- 定点测试 5/5 通过：合同兼容与伪清理结论拒绝 2 项，API v14/重启恢复/cleanup sequence 持久化 3 项。没有运行根级或全量测试。
- I1 没有改 runner close、计划执行分类、清理命令或产品画布；这些仍由 I2–I5 按顺序完成。

## 2026-09-21 I2 runner 清理协议与恢复

I2 开工记录：

```text
Product Alignment:
- natural-language task: 正式运行完成或失败后，可靠释放本 execution 拥有的 runner、浏览器树和临时目录，并在无法确认时保留原业务结论和可恢复的清理事实
- reusable chain boundary: TaskChain 与 TaskRun 不承载进程清理；upstream runner adapter 只返回本次 owner 的结构化清理报告，执行生命周期在 I3 消费该报告
- runtime inputs: execution ownerId、AbortSignal、当前 runner child、持久 Profile 路径和本次 runner 临时目录
- dynamic task outputs: Python capability/browser 阶段结果、close protocol/child/process tree/temp 阶段结果、受限错误码和证据 digest
- generic platform capability used: 现有 browser-use Browser owner、fd3 child protocol、Node child_process 与有界 Windows 进程树/临时目录清理
- replay model calls: 0；普通复跑与清理均不调用模型，清理异常不授权模型修复
- site/task-specific code added: no
```

本包只修改 I2 runner 清理合同、幂等实现和对应真实 child 定点验证；execution 产品投影、清理命令、accepted execution 与事件续接留给 I3。

I2 完成证据：

- 旧 execution 从最后一个 TaskRun finished 事件到 execution 失败相差约 10.2 秒，与旧 `RunnerProcess.close()` 的 5 秒 close-protocol 等待和 5 秒 child-close 等待吻合；最先失去确认的是 `close_protocol`，exit 1 是超时终止后的次生进程结果，不是链路失败阶段。
- Python `Runner.close()` 现在缓存单一 close task；capability 与 browser 按顺序清理并各自产生 allowlisted stage result，主循环先写完整 close response，外层 `ensure_closed()` 只等待同一 task。未输出 traceback、页面内容、PID 或绝对路径。
- TypeScript `RunnerProcess.close()` 在所有路径返回同一结构化 report，分别记录 Python stage、close protocol、child exit、process tree 和 temporary directory；前序失败不再跳过临时目录删除，Windows 删除继续使用有界原生重试。
- `withHybridCapabilities()` 把 work 结论与 cleanup report 分开；cleanup 未确认时抛出的 `RuntimeCleanupRequiredError` 同时携带 owner、原 work 成功值或原失败和安全 report，不再生成 `upstream_cleanup_unconfirmed:*` 普通异常。I3 尚未消费该 typed error，因此当前还不能宣称产品已投影为 `cleanup_required`。
- I2 根因诊断对同一不可变 chain、空输入和持久 Profile 做了 headless runtime-direct 复跑：本次站点执行返回 TaskRun failed、模型调用 0、cleanup confirmed；它只证明新 close 不再覆盖本次主结论，不作为正式 Workbench/API 产品闭环证据。
- I2 runner lifecycle 定点测试 5/5 通过：真实 Python/browser child 正常 close 与重复 close、Python close 阶段失败、close protocol 超时后的精确 child tree 终止与 temp cleanup、业务失败加 cleanup 失败、Windows 临时目录有界重试参数。`@browser-capture/api` TypeScript 检查通过；第一次检查仅发现旧 BrowserProfile 测试桩仍返回 `void`，改为结构化 confirmed report 后续跑通过。
- 没有运行根级或全量测试，没有修改 TaskPlanExecutor 产品分类、运行命令、事件 API 或 Workbench；这些从 I3 起继续完成。

## 2026-09-21 I3 执行投影、accepted 回执、事件续接与清理操作

I3 开工记录：

```text
Product Alignment:
- natural-language task: 用户在正式工作台点击一次运行后立即得到唯一 execution，能按该 execution 续接真实节点事件；若业务已完成但资源清理未确认，只需核验清理并恢复原结果
- reusable chain boundary: TaskChain/TaskRun 继续记录不可变链与图运行事实；TaskExecution 记录 accepted 命令、业务生命周期和 cleanup overlay，事件 API 只投影所选 execution 引用的 TaskRun
- runtime inputs: requestId、release/plan/chain 引用、executionId、expectedSequence、after event sequence 和结构化 runner cleanup report
- dynamic task outputs: accepted execution receipt、cleanup_required 产品状态、清理后恢复的原 next action、execution-scoped 单调事件批次
- generic platform capability used: 现有 operation 幂等账本、TaskExecution sequence 乐观并发、TaskRun 追加事件、SQLite cleanup 审计与 Fastify API
- replay model calls: 0；普通复跑、事件续接和清理恢复不调用模型，cleanup 不生成 repair 授权
- site/task-specific code added: no
```

本包不修改链路展示结构或动作编辑；ChainPresentation 与正式画布仍严格留给 I4–I6。

I3 完成证据：

- `TaskPlanExecutor` 已把 typed cleanup report 与业务主结论分开持久化：业务 completed/failed/paused 等事实先形成 `cleanupResume`，未确认清理只叠加 `cleanup_required`；不会创建 repair job、不会覆盖 TaskRun，也不会把 cleanup 错误归为确定性链路失败。正常 confirmed 清理直接保留原业务结论。
- 新增只保存追加清理证据的 `taskExecutionCleanupAudits`（SQLite v15）；`taskExecutions.body.cleanup` 仍是唯一生命周期事实源。服务重启遇到 running/queued 且 cleanup pending 时，先把业务状态收敛为 paused，再投影 cleanup_required，清理确认后恢复同一 execution 的 paused 结果。
- `run_task` 正式 API 现在返回 `acceptedExecution`，固定 requestId、executionId、release、plan 和全部 chain 引用；同一 requestId/同一 payload 返回同一 receipt，不同 payload 冲突，新 requestId 只在前一 execution 与清理结束后创建新档。
- 新增按 `executionId + after sequence` 的事件续接 API。它只投影该 execution 实际引用的 run/event，生成单调 execution 事件序列，不会把其他 execution 的节点末态拼成伪运行流；Workbench 连接已解析 accepted receipt 并保存本次 active execution。
- `cleanup_execution` 以 expected execution sequence 与 operation 账本幂等；只依据本 execution 的 allowlisted cleanup audit 和 owner verification 恢复 `cleanupResume`。若仍有 active resource 或缺少可确认事实，继续保持 cleanup_required，不强行标 completed。
- 聚焦验证通过：contracts、API、Workbench TypeScript 检查；API 4 项定点行为（primary/cleanup 四组合、重启 pending cleanup、cleanup sequence 持久化、P3 accepted/幂等/事件续接/清理恢复）全部通过；Workbench 连接 5/5 通过。P3 中 accepted receipt 与事件续接通过真实 Fastify API 注入验证，普通复跑模型调用保持 0。没有运行根级或全量测试。

## 2026-09-21 I4 链路展示与 capability descriptor 服务端合同

I4 开工记录：

```text
Product Alignment:
- natural-language task: 用户按阶段读懂一条已发布链路，并在修订中只编辑服务端明确支持的通用动作字段；旧链和未知动作保持可读只读
- reusable chain boundary: TaskChain 仍是唯一执行图；ChainPresentation 只按精确 chain version 保存阶段分组和发布布局，CapabilityDescriptor 只描述通用 capability 编辑面
- runtime inputs: 不可变 chain reference、阶段/节点/出口引用、descriptor registry version 和类型化 revision operation
- dynamic task outputs: presentation digest、revision checksum、展示结构校验、执行验证失效状态和新版本不可变 presentation
- generic platform capability used: 现有 TaskChain Zod 合同、revision draft/operation 账本、executableChainDigest、SQLite/Drizzle 版本存储与 capability registry 边界
- replay model calls: 0；展示编辑和合同校验不调用模型，普通复跑仍只允许显式 llm 节点调用模型
- site/task-specific code added: no
```

本包先完成服务端合同、唯一事实和 API 定点验证，不接生产画布；React Flow + Dagre 仍留给 I5。

I4 完成证据：

- 新增共享 `ChainPresentation`、`ChainStage` 与 `CapabilityDescriptor` Zod 合同。每个非 terminal 节点必须且只能属于一个阶段；阶段内部从逻辑入口可达，外部入边只能进入该入口，全部跨阶段/终点出边必须由真实 `sourceNodeId + sourcePort` 声明；overview/focus layout 必须精确引用现有阶段和动作。
- 新增 exact `capability.name@version` descriptor registry v1，当前只描述平台通用浏览器/数据能力、字段、端口、替换兼容和验证范围。unknown version 返回只读；没有递归 JSON 编辑兜底，registry 未包含网站、业务字段、页面文案、URL 或 CSS class。
- SQLite 原子迁移到 v16，`taskChainPresentations` 按 chain id/version 唯一保存已发布 presentation。编辑草稿拥有 mutable presentation；发布后草稿只保留 presentation digest/reference，完整内容唯一位于不可变 presentation 记录，避免双写权威。旧链没有记录时只派生 `legacy_derived/readOnly` 的“未分组动作”，不会猜业务阶段。
- revision checksum 现在覆盖 executable snapshot、presentation 和有序 operations；chain executable digest 与 presentation digest 分离。`move_node/set_presentation` 保留已冻结候选和执行验证，`replace_node/replace_capability/增删节点边` 立即清空 candidate/records 并把 chain validation 置回 candidate；最终阶段图始终重新由服务端校验。
- 正式 TaskChain API state 返回 presentations 与 descriptor registry；`validate_chain_presentation` 使用 requestId、revision/checksum 幂等校验。既有 create/update/full validation/publish API 已接新事实；新编译链在保存时创建通用 presentation，发布后可按精确 chain reference 读取，重启不变。
- 最小验证通过：contracts/API/Workbench TypeScript 检查；contracts 兼容测试 1/1；阶段图、digest 分离、validation invalidation、descriptor exact、不可变发布/旧链只读/重启读取 3/3；v16 迁移 1/1；既有 R3 正式 Fastify API create/read/update/presentation validate/full validate/publish/restart 定点 1/1。没有运行根级或全量测试，没有启动浏览器或模型。

## 2026-09-21 I5 正式链路运行台与单次 execution 流

I5 开工记录：

```text
Product Alignment:
- natural-language task: 用户在当前发布链路的同一画布确认输入、点击运行并只观察这次 accepted execution 的阶段和动作流转
- reusable chain boundary: ChainPresentation 负责阶段总览与聚焦引用，TaskChain 负责真实动作/边，execution event batch 负责单次运行状态；前端不生成第二套可执行图
- runtime inputs: 当前 release/preset、稳定 requestId、accepted executionId、after sequence、布局方向与本地聚焦/摘要状态
- dynamic task outputs: submitting/accepted/running/cleanup/completed 反馈、阶段聚合状态、真实动作和边状态、断线续接位置
- generic platform capability used: @xyflow/react 12.11.6、@dagrejs/dagre 3.1.1、I3 execution event API、I4 presentation/descriptor state 与现有 ValueSchema 运行表单
- replay model calls: 0；运行台只派发正式 run_task 并读取持久化事件，不增加模型入口
- site/task-specific code added: no
```

视觉实现采用现有工作台的克制工业/制图风格：阶段像路线站点、动作像执行卡片，状态同时用文字、形状和颜色表达；不导入原型静态数据或示例任务文案。

I5 完成证据：

- 正式 `LiveChain` 已只消费服务端 `ChainPresentation`、真实 `TaskChain` 和所选 execution event batch：总览只有开始、阶段、阶段间路径和结束；同源同目标的多个概览出口合并为带数量的展示路径，聚焦子图仍保留每条真实动作边。单击只附着一个不参与布局的动作摘要，双击捕获或“进入阶段”在同一 React Flow 画布聚焦真实动作。
- 运行/再次运行与业务输入设置已从任务列表移入链路工作台；任务列表只选择和导航。运行对话使用当前不可变 release、同一 `TaskChainConnection` 和稳定 requestId，accepted 后固定 executionId；轮询只按该 execution 的 `after=sequence` 追加事件并去重，刷新后从持久化 latest execution 恢复，不拼接其他运行。
- 右侧只解释当前阶段或动作，动作面板展示所属阶段、上一动作/前置条件、动作和下一动作/后置条件；原始节点 JSON 仅在折叠高级信息中。旧链通过服务端 `legacy_derived/readOnly` presentation 可读，生产代码没有导入隔离原型数据。
- Workbench 连接与投影定点测试 7/7 通过，覆盖 accepted receipt、同 request 续接、事件去重、分支路径状态和阶段聚合；Workbench/API TypeScript 检查通过，生产 Workbench 构建通过。Vite 仍报告既有大 chunk 警告，本包未扩展成拆包重构。
- `work/i5-chain-workbench-1789976475079/result.json` 从正式 headless Workbench/API 以 1440×1000 完成：任务列表“打开链路”、单摘要、双击进入 1 个真实动作、正式 Workbench 复跑 execution `603e7cc7-ddcf-4714-85d4-0d961681aacb`、6 条持久化动作事件、刷新后同 execution 和成功阶段恢复；execution completed，普通复跑模型调用 0。截图为同目录 `chain-workbench-1440.png`。
- 该 I5 证据只关闭生产运行台接线与可读状态投影，不代替 I6 动作编辑/浏览器目标选择/聚焦验证/发布，也不把受控本地页面复跑写成 I7 真实复杂任务闭环。

## 2026-09-21 I6 上下文动作编辑、目标选择与不可变发布

I6 开工记录：

```text
Product Alignment:
- natural-language task: 用户在真实动作上下文中修改服务端允许的字段或替换动作，用 B-A-T 专用浏览器点击真实页面目标，完成聚焦验证后发布新不可变版本
- reusable chain boundary: descriptor 只描述通用 capability 的可编辑面；TaskChain 仍是唯一执行图，浏览器选择只产生版本化 target 数据，revision/presentation/release 仍由服务端事实拥有
- runtime inputs: draft revision/checksum、当前动作与明确 source port/target、descriptor field、浏览器中用户实际点击的目标、验证业务输入
- dynamic task outputs: typed replace_capability operation、失效的旧验证、目标选择状态、requested focus node、验证记录和新 chain/presentation/release 引用
- generic platform capability used: I4 CapabilityDescriptor/revision operation、现有 browser-use CDP owner 与持久 Profile、React Flow inspector、I3 operation 幂等账本和正式 validation/publish API
- replay model calls: 0；手动编辑、目标选择、验证和发布不授权模型修复，普通复跑仍只有显式 llm 节点可调用模型
- site/task-specific code added: no
```

本包先补 server-owned 浏览器目标选择与 descriptor 编辑适配，再接 inspector 和既有 validation/publish；不会恢复递归 JSON 编辑，也不会用第一个空闲出口替用户决定连线语义。

```text
Reuse Assessment:
- capability: 修订动作的真实浏览器目标选择、稳定目标身份恢复与 descriptor 类型化编辑
- existing implementation in repository: BrowserProfileService/RunnerProcess 已拥有唯一持久浏览器会话和 fd3 协议；workflow-use vendor 已提供 DOM graph、capture_target_identity 与 verified_labeled_query；I4 registry 已提供 exact capability descriptor
- mature candidates and pinned versions: 继续使用仓库受管 browser-use/workflow-use fork、Playwright CDP、@xyflow/react@12.11.6 与 @dagrejs/dagre@3.1.1；不增加选择器或画布库
- selected implementation: 在既有 Profile runner 内新增一次性 pick_target 请求，复用目标身份与可验证 labeled query；Workbench 只按 descriptor 渲染有限控件并提交 replace_capability
- reused public surface: RunnerProcess request/close、BrowserUse page/state、workflow-use target identity/query、CapabilityDescriptor editableFields/replacements、revision operation API
- B-A-T-owned adapter and remaining gap: 只拥有 target-selection command/state、受限结果合同、draft/node/checksum 校验、异步轮询以及 target 写入 revision；不拥有第二套浏览器、选择器推断器或通用表单引擎
- license/runtime/platform fit: 沿用已冻结的仓库依赖和 Python/Node 运行边界；实现不调用平台专属 GUI API，Windows 实测后仍需 I7 的 macOS arm64 真实证据
- browser/runtime/state ownership conflicts: 选择期间仍由 BrowserProfileService 独占同一 runner；结束、取消或失败均关闭该 owner，不能与 prepare/run 并发
- replay model calls: 0；用户点击目标、手动编辑、验证与发布均不调用模型
- rejected candidates and evidence: 不采用 CSS 录制器、递归 JSON、第二个 Playwright owner 或错误字符串 special case；现有 vendor 已能把真实点击绑定到 DOM graph 并生成运行时支持的 hybrid target
- focused validation: contracts/API/Workbench TypeScript 边界、BrowserProfile target owner 定点测试、R3 修订发布回归、Workbench target connection/typed patch，以及正式 headless Workbench/API I6 验收
```

I6 完成证据：

- 新增 server-owned `BrowserTargetSelection` 合同与 `/api/browser-profile/target-selection`：start 必须绑定当前 task/draft/node/revision/checksum 和 exact live-picker descriptor；同一 requestId 幂等，选择期间独占既有 `BrowserProfileService`/`RunnerProcess`，取消、失败和关闭保持结构化状态。目标 URL 只从当前链中已保存的 target scope 或最近唯一前置导航推导，用户不填写 URL 或 selector。
- Python Profile runner 新增 `profile_pick_target`：在当前 BrowserUse 页面捕获一次点击，阻止页面动作，复用 workflow-use 的 `capture_target_identity` 与 `verified_labeled_query`，只返回运行时已支持的 `structure/history` target、tag 和策略；不返回页面正文、DOM、PID、Profile 路径或模型信息。成功、失败或取消后均走同一幂等结构化 close。
- 正式 inspector 已按服务端 `CapabilityDescriptor.editableFields` 渲染有限控件；exact descriptor 缺失的 capability 只读，没有递归 JSON 兜底。浏览器目标由“在浏览器中选择”取得并通过 `replace_capability` 写入；修改立即清空 candidate/验证并禁用发布。React Flow 的隐式拖线已关闭，连线只能在控制台明确选择起点、source port 与目标。
- 保存动作、展示结构校验、代表输入验证、不同输入验证和发布是独立命令；聚焦节点随验证请求保存，服务端继续安全扩展为 `full_plan`。手动编辑、目标选择和两次验证均无模型调用；旧 chain/release/run 不改写，新版本保存独立 presentation。
- 聚焦验证通过：contracts/API/Workbench TypeScript 检查；BrowserProfile 目标 owner 3/3；既有 R3 修订/冻结/发布 1/1；Workbench execution/target connection、typed target patch 和画布投影 9/9；Workbench 生产构建通过（仍仅有既有大 chunk 警告）。
- `work/i6-chain-revision-1789978926127/result.json` 从正式 headless Workbench/API 完成：同一动作的 descriptor 历史为 `send_keys → click`，真实页面按钮产生 `history` target；旧 chain v1 保留，新 chain v2 digest `94e0975f...` 与 release v4 发布；两次正式验证 execution 均 completed、模型调用 0，服务重启后旧/新 chain、新 presentation 和 release 均恢复。截图为同目录 `chain-revision-published-1440.png`。
- I6 只关闭上下文编辑、浏览器目标选择、验证失效和不可变发布；I7 仍需从正式 Workbench/API 对真实复跑、`cleanup_required` 恢复、修订、需求回流及重启持久化做最终闭环，且 macOS arm64 尚未实测。

## 2026-09-21 I7 正式产品闭环验收

I7 开工记录：

```text
Product Alignment:
- natural-language task: 从正式 Workbench/API 连续复跑当前已发布真实任务，刷新与重启后恢复同一 execution；受控清理异常只进入 cleanup_required 并恢复原业务结果，同时验证用户验收、局部链路修订和需求回流入口
- reusable chain boundary: TaskChain 仍是唯一可执行动作图；TaskExecution 绑定一次正式运行和清理 overlay；用户验收、ChainRevision 与 RequirementVersion 分别保存，不互相改写历史事实
- runtime inputs: 当前 release/preset、稳定 requestId、accepted executionId、事件 after sequence、execution expectedSequence、用户验收决定和修订输入
- dynamic task outputs: 连续 completed execution、零模型调用审计、cleanup_required/confirmed 恢复、三类用户决定、不可变新 chain/release 及重启后的持久事实
- generic platform capability used: 正式 Workbench、Fastify TaskChain API、持久 Profile、I1-I6 cleanup/event/presentation/descriptor/revision 合同和 SQLite 事实库
- replay model calls: 0；普通复跑、清理、手动修订和验收路由均不调用模型，只有显式 llm 节点例外
- site/task-specific code added: no
```

本阶段只以正式 Workbench/API 和当前持久任务作为产品闭环证据；runtime 直调、mock、fixture、隔离原型、类型检查或临时脚本均不能替代 I7 验收。自动验收使用 headless，登录或验证码仍只通过 B-A-T 专用持久 Profile 由用户处理。

I7 Windows x64 正式产品闭环通过：

- 正式验收前修复了三个由真实持久状态暴露的通用问题。Workbench 不再把能否再次运行错误绑定到最新结果的单一 `primaryAction`，而按当前 release/preset、active job/execution 和 draft 事实开放运行；结构化 capability/browser/close protocol 已确认且 child 确实退出时，非零 child 返回码不再把资源释放误报为未确认，真实 close 阶段未确认仍进入 cleanup overlay；计划验证现在复用 `taskInputRequiresVariation`，空对象或单值合同仍要求两次独立验证，但不伪造不同输入。
- runner 定点测试 6/6 通过，新增覆盖“结构化 owner close 已确认 + child 非零退出”的资源语义；API TypeScript 检查通过。Workbench 生产构建通过，仍只有既有大 chunk 警告。
- `work/i7-resume-revision-1789980871295/result.json` 记录正式 API 对上次中断草稿的续接：旧 chain v4 不变，代表输入 execution `25b07ca2-b28b-4e11-8726-e8dda7c5ec76` 与换输入 execution `9c812fc6-c2ae-4a2e-8468-fdc84dae402a` 均 completed、cleanup confirmed、模型调用 0；新 chain v5 和 release v2 发布。
- `work/i7-final-product-1789981090285/result.json` 从正式 headless Workbench/API 使用当前持久 Profile 完成最终闭环。普通 execution `d8c4d674-85ad-4b15-8100-414d66f1d0cb`、`bd5bd6cf-aecd-4860-8961-0ac418863689`、`988a8c3d-ae26-4cdd-81c7-b7248809ce2c` 均 completed、cleanup confirmed、模型调用 0；第二轮重复同一 requestId 只返回同一 accepted execution。首轮 15 条 execution-scoped 事件支持 after sequence 续接，刷新后仍绑定同一 execution。
- 同一正式路径的受控 close 回执故障 execution `9aebc4ba-e992-47cb-8faf-5a0818795659` 已完成全部业务步骤，先投影为 `cleanup_required`，没有 failure/repair；结果页“核验并清理资源”依据该 execution 的 owner audit 把 cleanup 恢复为 confirmed，并恢复同一 execution 的 completed/rerun 结果，模型调用仍为 0。故障注入只否定 close 回执可信度，真实 Python capability/browser、child 和临时目录仍走正式清理路径，不能替代前三次成功复跑。
- 结果页“符合预期”追加独立用户验收；“调整链路”从结果 execution 建立修订并发布 v5；“重新梳理需求”由正式 UI 携带安全运行摘要返回需求对话。`work/i7-requirement-return-1789981561006/result.json` 证明访谈草稿从 1 增至 2、形成 draft v2，execution 数不变；该次模型用途仅为 requirement dialogue，最近四次普通 execution 的 `llmCalls` 全为 0。
- 重启后 release v2、preset、chain v4/v5、两个 presentation、全部运行事件和 recovered cleanup 仍可由正式 API 读取。1440 链路与结果截图、390 窄屏截图分别为 `chain-workbench-1440.png`、`results-1440.png`、`results-390.png`；键盘 skip link、reduced-motion 和 390px 无横向溢出均通过。
- 结束后验收 API 端口、runner、验收 Chrome 和事件连接均已关闭；未发现带本次 I7 profile/runner 命令行的 Python、Chrome 或 Node 进程。本次运行没有遗留新的 `bat-hybrid-owner-*` 目录；系统临时目录中仍有本轮开始前已经存在的历史目录，未越权删除。
- 历史 execution `d5a86b0c-a30b-48ef-8a0c-6e7f92c5daa6` 保持不可变旧记录，没有通过字符串 special case 改写；新的结构化运行事实已使正式工作台恢复连续普通复跑。至此 R2 的运行/清理语义、R3 的可读不可变修订和 R5 的 Windows 正式产品闭环重新关闭。macOS arm64 仍没有当前设备上的真实运行证据，不计为跨平台已通过，按 ROADMAP 的延期门在公司设备补验。

## 2026-09-21 真实 B-U 预执行回归：动态集合选择证据

```text
Product Alignment:
- natural-language task: 在执行时页面中确认会变化的合格候选集合，选择当前目标项并完成后续浏览器结果
- reusable chain boundary: 完整候选集合读取、被点击项在该集合中的序号与运行时选择绑定属于 TaskChain；探索模型只负责理解页面和选定合格候选集合
- runtime inputs: 已确认需求、计划步骤、当前页面、完整且未截断的候选查询、被点击目标
- dynamic task outputs: 可复跑 read-fields、集合 count、目标 ordinal binding 与最终状态证明
- generic platform capability used: Browser-Use find_elements、B-A-T verified natural read、data.transform count、structure target
- replay model calls: 0；模型只用于首次准备探索，普通复跑用持久化读取和序号绑定
- site/task-specific code added: no
```

回归事实：正式 job `55079d03-1c5b-484e-8cb4-28496925b138` 把动态末项绑定错误地用于搜索结果，而内容页的实际集合项仍编译成一次性 history 目标；样本验证随后以 `element_identity_unavailable` 失败。该 job 不构成发布或验收。修复必须拒绝没有集合查询证明的重复集合目标，并要求动态选择紧邻消费对应完整候选读取；R2、R3、R5 与 I7 继续保持重新打开。
### Product Alignment: navigation consumer readiness and runnable projection

- natural-language task: 打开目标页面后读取真实候选集合、选择当前可播放的最新项，并且只有正式样本验证通过后才允许直接运行。
- reusable chain boundary: URL 变化的浏览器动作必须等待其已验证的下游结构化读取稳定；已发布版本与已验证可运行状态分别投影。
- runtime inputs: 已确认的入口、搜索词和已发布链路版本。
- dynamic task outputs: 当前页面的候选集合、动态选择序号、播放状态和样本验证结论。
- generic platform capability used: ConsumerReadiness、browser.read-fields、版本化 TaskChain 和 preparation 状态投影。
- replay model calls: 0。
- site/task-specific code added: no

## 2026-09-24 新建《凡人修仙传》任务的 headless 技术运行取证（产品修订闭环未通过）

- 当前 checkout 未清理、未 reset、未建 worktree、未提交或推送。新任务 `2a777a77-353e-4894-9b96-1e505827d366` 从正式 Workbench 建立并确认 Requirement v1 `13891ff7-6f9b-4f49-8938-cbfd729f7ad1`；唯一准备 job `71bf5d64-b038-480d-85dd-34fc89b46fc7` 做过一次 headless B-U 代表试做并生成草稿。它的自动首次样本因页面身份观察失败；原始生成链还在剧集页点击历史 `a[6]`，不能证明每次选最新正片，故未直接发布。
- 开发者在 headless 页面脚本中直接调用草稿修订 API，参考旧 Release V8 的任务数据，手工加入当前剧集列表读取、纯函数选择和运行时目标序号绑定；这一步没有经过产品的用户修订入口或自然语言调整建议确认。旧失败执行保留。第二个样本在点击前因草稿沿用的 15 次命令上限被阻断；该图实际成功路径至少需 17 次。开发者再次直接调用草稿 API 显式把命令上限设为 24，生成草稿 revision 2、链 v3；该操作受计划步骤上限约束。未把站点、剧名、剧集类型写入平台运行源码。曾加入但未被这条任务使用的成功直线路径自动预算推算不能覆盖分支/循环，审计后已删除。
- 开发者脚本修订后的草稿样本 `08fcf792-e672-465d-8ac2-ae37c73a8563` 和独立复验 `feb604f7-4d17-4fb8-8728-42359c5f08e2` 均 completed、各 17 次浏览器命令、0 次模型调用、cleanup confirmed；任务数据中的最后浏览器动作要求 `media_playback=playing` 并成功结束。随后在正式画布点击发布 Release V1 `7e8388ae-4e38-485a-8cf3-a6d8d9aa642f`，验证引用精确绑定这两次 execution；发布操作不能补足此前跳过的用户修订验收。
- 从发布画布发起的普通 execution `020eae50-ca2e-4d76-89f3-4f7e8feb0f40` 与再次运行 `e38832c3-d822-4c47-87ce-4b84fc46aa08` 是不同记录，均绑定同一 Release V1、completed、17 次浏览器命令、0 次模型调用、cleanup confirmed。每次按自身 executionId 查询得到 39 条事件，末尾 `completed` 节点 success；产品 Chrome 进程使用 `--headless=new`，未夺取桌面。运行后无本次产品浏览器 Profile 进程。
- API 再次重启和正式页面刷新后，Release V1、两条发布验证与最新完成 execution 仍可读取；SQLite 只读重开前后均有 4 条候选快照、6 条 execution、6 条 TaskRun、1 条 release、0 条活动草稿。旧准备失败早于当前发布，不再覆盖工作台和左侧任务状态；原 job 留在历史。截图与最小取证见 `work/recovery-20260924/fanren-fresh-headless-1790254513755/final-evidence.json`、`20-final-after-restart.png`（本地忽略目录）。
- 验证范围：预算修订定点测试 1/1、普通观察恢复定点 Python 测试 1/1、API 与 contracts 类型检查通过；没有运行根级全量测试。生产源码字面审计未见 Bilibili/凡人/剧集/PV 的平台特例；只有独立原型示例含凡人文案，正式入口不引用该原型。
- 验收结论：原始自动生成链没有实现“每次选最新”；后续完成记录依赖开发者绕过产品修订入口手工构造的草稿，只证明该修订数据可被执行、验证、发布和复跑，**不能证明用户能从原始失败通过产品的三种状态修订方式完成调整，也不能证明新建任务的完整产品路径通过**。播放后置条件仅证明浏览器观察到 `playing`；本次页面出现会员标记，尚无完整、不受限播放或用户业务满意的证据。用户明确要求不关机，保持设备运行。

## 2026-09-25 新建任务的正式运行与恢复取证

- 本轮 checkout 仍为 `master@7d59036332a66de8991744659d2317da126c6123`，保留原有 dirty 工作区；未创建 worktree，未 reset、clean、提交或推送。用户本轮的新指令是全部退出门通过后关机，覆盖上段历史指令；未通过前不关机。
- B-A-T 的单 Browser owner 接入了实验项目已验证的 popup resume 适配，先恢复新 `page` 再交给原 B-U attach 回调，关闭时还原。本地 headless Enter 开页样本 2/2 恢复并确认清理；正式新任务的 B-U 试做实际新开页面，未再因新页暂停。
- 正式 Workbench 新建的任务 `2db8ebfe-d99d-4b9e-b5a5-6cfc0a314841` 从需求对话确认 Requirement v1 `c8bdd7e6-fb48-4019-8850-6a653a0d42d2`，仅以 Bilibili 为来源，动态选择最新可播放正片并核验播放器状态。第一次代表试做已播放、来源完整，但编译缺 `a-0007` 的 URL 来源绑定；第二次显式沿方案重新采集，新的派生 Function 因宽泛按钮读取而无有效输出。两份失败、来源和审计均未改写，也没有无改动重跑第三次 B-U。
- 编译器现可从旧 trace 中最近且字段值唯一的已验证读取派生 `a-0007.navigate.url` 绑定，TypeScript 入库侧独立复核来源、顺序、值、唯一路径和无既有冲突事实。取 `[0]` 的读取若由输出 schema 的 `minItems: 1` 保证，空读取交由现有合同判失败，不再错误要求“空列表正常完成”分支；无保证及嵌套索引仍保留缺口门。恢复入口按完整需求、方案、输入和来源校验逐份选择旧证据，坏 artifact 只导致不可恢复诊断。`Product Alignment` 与依据见 `RESEARCH.md` 末尾。
- 工作台“只重新编译已保存试做”从第一次不可变来源生成唯一草稿 `33e617b4-5fa7-4197-83a1-2278b1fa2a16`，没有再开产品浏览器。草稿包含两段运行时读取驱动的纯函数选择，导航 URL 由当前读取绑定，最后动作检查 `media_playback=playing`；没有固定一次性剧集序号。样本 execution `0f662546-e773-428e-8f14-2a8ef6f9f82e` 与独立复验 `f7fd4d60-6a7e-4714-8b4b-446254961427` 均 completed，分别 17 次浏览器命令、0 次模型调用、cleanup confirmed。
- 正式画布手动发布 Release V1 `bf1a727a-9822-4f45-8f01-1ccda477f1a3` 后，两次独立正式 execution `4c952dd7-2f61-4023-8c25-a0ca424bd562`、`ed3ac083-035a-4a7d-8447-9e1177dd078d` 均 completed，分别绑定独立 TaskRun、17 次浏览器命令、0 次模型调用、cleanup confirmed；四条 TaskRun 均有完整模型审计和 39 条各自归属的节点事件。API 与全新 Workbench 浏览器在服务重启后仍读出 Requirement V1、Release V1、两次正式运行历史及最后一次画布状态，产品 browser `busy=false`、`cleanupRequired=false`。精简证据见忽略目录 `work/recovery-20260925/formal-result.json` 和同目录截图。
- 验证范围：popup 适配定点测试 3/3、headless 开页烟测 2/2、动态选择 Python 10/10、回调停止 6/6、来源绑定 Python 7/7、结果绑定 Python 15/15、TS 派生绑定 1/1 与选择 4/4、API/Workbench workspace 类型检查和受管 fork 来源校验均通过；未运行根级全量测试。390×844 的正式画布在暗／亮主题下可用，`innerWidth=clientWidth=scrollWidth=390`，见本轮截图。播放条件只证明执行时浏览器观察到 `playing`，不等于用户确认完整、不受限播放。macOS arm64 仍未实测；G12 异常门见下节，不宣称全部退出门完成。

## 2026-09-25 G12 自然语言调整正式页面复验

- 结果页原先填写的问题在进入调整侧栏时丢失，已把结果反馈保存在工作台共享瞬时状态；同一 job 从 `pending` 转为 `accepted` 时才清除，避免历史 `accepted` 状态在挂载侧栏时误删新反馈。调整入口的已有行为抽到独立 `ExecutionActions` 组件，未新增第二套结果或浏览器控制。正式 UI 从同次已完成运行打开调整侧栏，反馈原文保持可见，见 `work/recovery-20260925/formal-26-g12-feedback-retained.png`。
- 旧 Python About 任务 `d104df47-a2bf-44d1-9500-c04356ff062a` 的 Release V2 上，正式 UI 生成一份待确认建议 `7cfa5fa0-3bd0-40b8-8664-3b04d70388f9`；接受前无草稿、新发布，点击“不采用”后状态为 `rejected`，版本和原运行不变。另一生成中 job `1a879f90-373d-4b60-8168-65c99af0cd2c` 经正式 UI 取消；等待后仍为 `cancelled`、无草稿、V2 不变。该次不能单独证明真实模型结果曾在取消后迟到；定点测试覆盖迟到完成的防护。
- 同一旧任务从正式结果页说明 `paragraph` 读取要归一化空白。建议 job `6305d709-a798-4ba9-8fcd-a633fb5f2be5` 基于本次运行证据生成 `replace_node(s-a-0002)`，差异仅把该字段的 `normalizeWhitespace` 设为 `true`。接受前 Release V2 不变、无草稿；从正式 UI“接受并应用”后唯一草稿 `e6fc816c-8a24-420e-8ca8-30b0f23af7d9` revision 1、checksum `e41e18619b7abf6a1a49acb8556fdc738b4286b00aa9eb4642f8953eb395ba98`，验证记录清空。截图 `formal-34-g12-paragraph-pending.png`、`formal-35-g12-paragraph-accepted.png`。
- 正式 UI 草稿样本 `c6f2e999-d134-4db8-80f2-63ca9d6d054d` 和独立复验 `9ad6cf12-b9bf-4efc-89e0-a6993c11caaa` 均 completed、各 3 次浏览器命令、0 次模型调用、cleanup confirmed；两条验证记录引用接受时的相同 checksum。手动发布只新增 Release V3 `0e01c4fc-c6a8-4eb9-8d11-b0b576583507`；正式复跑 `5957839b-11f7-44ea-8eb7-a48084ef630f` completed、3 次浏览器命令、0 次模型调用、cleanup confirmed。正式 UI 历史按需列出 V1/V2/V3 与各次旧执行；API 重启、全新 UI Chrome 重开后仍读出 V3、`accepted` 建议、原 V2 历史和最新完成运行。截图 `formal-39-g12-independent-completed.png`、`formal-41-g12-v3-published.png`、`formal-45-g12-history-panel.png`、`formal-48-g12-release-history.png`、`formal-50-g12-v3-persisted-canvas.png`。
- 后续从 V3 已完成运行提出一份只改动作显示名的建议 `83f98d12-fa7a-4dfd-8e68-d78a79f3e55f`，候选待确认且无草稿。该运行确已满足原 Python About 读取需求，正式结果页据实标记“符合预期”，使候选引用的同次运行 review 证据变化；正式 UI 再点“接受并应用”收到 `adjustment_evidence_stale`，显示“原运行证据已变化，请重新确认问题”，未写草稿、V3 不变。全新 UI Chrome 重开后，待确认候选与反馈仍可恢复；随后通过正式 UI 取消，候选仅留审计，状态 `cancelled`。截图 `formal-51-g12-stale-candidate-pending.png`、`formal-53-g12-source-reviewed.png`、`formal-55-g12-stale-rejected.png`、`formal-57-g12-pending-restored.png`。
- 调整侧栏在正式 390×844 页面暗／亮主题下可见、可读，无页面横向溢出，`innerWidth=clientWidth=scrollWidth=390`，截图 `formal-60-g12-adjustment-390-dark-visible.png`、`formal-61-g12-adjustment-390-light-visible.png`。
- 定点测试：API 调整合同 13/13、Workbench 已接受版本判定 1/1；覆盖取消后模型迟到、过期基线/来源证据、拒绝与重复接受不写草稿。三次新运行各有 15 条同次节点事件，机器可读摘要见 `work/recovery-20260925/g12-result.json`。正式 UI 尚未取得失败草稿试跑、真实需求误解回流及清理异常分流的同轮场景证据；不能用定点测试或历史 I7 记录冒充这些正式退出门。G12 仍是部分通过；在全部退出门取得证据前不执行关机。

## 2026-09-25 全新《凡人修仙传》来源直接编译与复跑

- 修复前的正式新任务 `b1e38157-4e23-4511-9dbe-7eaaf6ca07c2` 经 UI 完成需求确认，B-U 作业 `d301943b-213d-45db-8eec-381618923da0` 真实完成 14 次浏览器命令并观察到播放，但当次自动编译在 a-0013 因 `selection_annotation_unavailable` 留缺口，没有草稿。根因是动态 Pydantic 输出类型与原注解合同交接不兼容；没有用该来源离线重编译宣称验收。
- 修正通用边界后，从正式 Workbench **再次新建**任务 `3286024e-09c8-45b0-a342-488597ebfe99` 并确认 Requirement V1。其唯一准备作业 `b464b45e-5dca-47ca-85dc-94e6f3f9c8b8`、浏览器运行 `fc33da66-efa9-443a-83e9-5b2e64215b6b`、新来源 artifact `618229f3-0d6c-456e-8068-5f95fccee37b` 绑定同次真实 B-U：11 次浏览器命令、`sourceSuccess=true`、自动首编译 12 段且 `gaps=[]`。`recoveredFromJobId`/`resumedFromJobId` 均为空，没有旧来源回填、脚本注入计划或草稿。
- 工作台自动样本 `fa626c71-8f72-4676-82d6-29ade0349544` 与独立复验 `76522b33-e747-4705-8aa9-86079da09076` 均 completed、cleanup confirmed。画布手动发布 Release V1 `ddc3b48e-c8be-4c05-8903-35b9c20953dd`；从已发布画布运行 `cc8fd480-ea18-43fb-801e-1da70d109449`，再次运行 `be137f20-155d-436f-83ff-a209b5b12d13`，四次 execution 各有独立 TaskRun、16 次浏览器命令、`llmCalls=0`、39 条同次节点事件、cleanup confirmed。发布链含当前候选读取及两处纯函数选择，点击使用 Function 的运行时 ordinal；最后 `wait` 节点要求 `media_playback=playing` 并在两次正式运行成功。
- API 重启后，同一 Release V1、最新完成 execution 和其 39 条事件仍可读取；新启动的正式 UI 浏览器也重新显示已发布画布与完成状态。精简证据为 `work/recovery-20260925/fresh-fanren-final.json`，正式页面截图为同目录 `formal-new-fanren-ready.png`、`formal-new-fanren-formal-one.png`、`formal-new-fanren-canvas-after-restart-loaded.png`。集成的新页恢复此前 headless Enter 烟测恢复 2/2；正式 B-U 来源 `d17ad049-ad7c-4f57-8c6c-6e91d48d27bc` 的 a-0004 点击确实跨到新标签，来源仍 `sourceSuccess=true` 且 trace 完成。本轮最终新任务没有把该旧来源用于编译验收。
- 定点验证：动态选择 Python 11/11、注解 7/7、相关 Ruff 与受管 fork 来源校验通过；未运行根级全量测试。结论限于本任务 Windows x64 的新来源直接编译与真实复跑；浏览器观察到 `playing` 不等于用户确认完整、不受限播放。G12 尚缺的异常分支及 macOS 真机仍按上节和 ROADMAP 单独记录。

## 2026-09-25 11:40 用户可见播放手测反证

- 用户从正式画布点击“运行”产生新 execution `ccf34266-54dd-4fef-8f1b-992070ae95c6`，11:39:09 创建、11:40:11 标为 completed；16 次浏览器命令、0 次模型调用。该 API 进程实际继承 `BAT_UPSTREAM_BROWSER_HEADLESS=1`，所以运行中没有可见浏览器窗口。“即时”只设置节点间等待为 0 毫秒。末节点的 `media_playback=playing` 是当时的页面状态。
- 执行结束后 `withHybridCapabilities` 总会关闭 runner，Python runner 对其拥有的浏览器调用 `kill()`；这次第一次清理曾报 `cleanup_close_protocol_timeout` / `cleanup_child_exit_timeout`，但进程树与临时目录已确认回收、无活动资源，第二次 owner verification 于 11:40:11 确认清理。此前“播放成功”的表述只能表示瞬时技术后置条件成立，不能表示用户可持续观看。
- 已把当前 API 重启为默认有界面的配置，并从正式工作台 UI 只做一轮新验证：execution `7e6680f2-18a1-4aac-838f-962d9ed091f0` 确实产生无 `--headless` 参数的可见 Chrome 窗口，页面标题到达哔哩哔哩；但本轮在 `s-a-0004` 点击后的 `ordinary_postcondition_failed` 终止，仅 8 次浏览器命令，清理 confirmed。没有盲目重试或据旧 headless 成绩宣称 headed 验收。当前链路尚未通过用户可见播放验收；持续观看还需要明确的用户交接与会话生命周期设计，不能仅取消 headless 或跳过清理。
- 增加不含页面内容的有限失败诊断后，正式有界面 execution `9c49f1f7-584b-4936-85ee-19b15b508ee7` 精确报 `ordinary_postcondition_failed_read_fields_read_collection_limit`，清理 confirmed。唯一新来源的全页 `a` 读取当时恰好 200 条且无人消费，编译器却保留该段并让前一步等待它；页面链接集合后来超过 200 才暴露失败。正在修通用编译依赖/覆盖与就绪条件边界；旧 Release、旧来源重编译和旧运行都不作为修后验收。
- 通用编译修复已落地：只有完整证据支持、无动作或结果消费的纯 `find_elements` 才从复跑主链裁剪，来源覆盖仍可复算；ConsumerReadiness 只重绑到保留的真实读取，且仅跨已有“未派发”证明的失败动作，否则留 `missing_effect_proof` 缺口。定点 Python 36/36、相关 Ruff、受管 fork 来源校验通过。旧来源的只读离线诊断显示宽读取不再入链、原动作改等窄读取；这不算修后新任务验收。依用户最新指令，旧任务 V1 直接弃用，不做兼容修订或额外特例。

## 2026-09-25 修复后全新《凡人修仙传》正式路径

- 正式 Workbench 新建任务 `60d9b658-ba77-4da2-82d8-771d2d0bc9c7`，需求对话选择 Bilibili 官方番剧或版权方页面并确认 Requirement V1；明确执行时动态选最新可播放常规正片、排除预告/花絮/特别内容，只核验播放器正在播放。唯一准备作业 `97f8f1e8-89f4-47c1-8fce-c49e003cbb45` 的新 B-U 运行 `41f5ae97-1ced-4928-8b92-5de30cc78c2b` 有 11 次来源动作、`sourceSuccess=true`，没有 `recoveredFromJobId` 或 `resumedFromJobId`。其中 `a-0005`、`a-0006` 的前后 tab ID 分别变化，两个新页切换后来源继续完成；本次产品 Chrome 进程无 `--headless` 且有窗口句柄。
- 同次首次编译的 source artifact `d06a2e7b-5183-48b8-8940-82fc8c3eac7d`、编译 artifact `3f7cee11-ccc9-42ee-8c4e-3b25c48501ae` 生成 11 段、`gaps=[]`。两个 Function 均从本次运行的候选读取取得输入，目标点击有运行时 `ordinalBinding`；已验证但无人消费的 `a-0007` 只留 `agent_internal/native_dom_lookup_observation/v1` 覆盖，不进入主链或就绪条件。来源候选读取分别为 64/100 和 38/50，均报告完整；将来若页面集合超过上限，运行会严格失败，不能宣称对所有未来页面变化永久保证成功。
- 自动样本 execution `76dce874-dd04-43ee-8e63-5c5498644773` 与独立复验 `430faaf3-a6fd-46b7-811e-0991a99c2d08` 均 completed；随后从正式画布手动发布 Release V1 `3ad2967b-b6b2-4809-893c-e898ee1fa9b9`。两条独立正式 execution `6d27d125-f308-40c1-83c8-c39edaf74021`、`0cfa0b65-c18b-4a5d-8866-2766d2ead177` 均 completed、各 15 次浏览器命令、`llmCalls=0`、cleanup confirmed。四次运行各自拥有不同 TaskRun、各 36 条同次节点事件；最后 `s-a-0010` 的 `media_playback=playing` 后置节点四次均 success。旧任务 `3286024e-09c8-45b0-a342-488597ebfe99` 按用户指令归档弃用，没有改写它的 Release 或失败运行。
- API 进程重启后，全新 Workbench Chrome 重开并选中该任务，正式画布仍显示 Release V1、11/11 完成及最新运行完成，SQLite 只读重开也可读取四次 execution 与其 TaskRun。证据截图位于忽略目录 `work/recovery-20260925/formal-new-fanren-20260925-*.png`；未运行根级全量测试。浏览器的 `playing` 仅证明当时 DOM 播放状态；现有 runner 随 execution 结束自动关闭 Chrome，尚未证明持续可见播放，不能把这项用户可感知结果写成已验。

## 2026-09-25 单次运行浏览器显示模式与路径复核

- 正式运行弹窗的“运行设置”新增本次 execution 的“无界面运行（Headless）”选项，默认关闭；UI 选择经 `run_task` 合同持久化到 TaskExecution，再传至现有 hybrid BrowserProfile。正式复跑中的显式 `false` 覆盖全局环境变量，恢复同一 execution 使用保存值；旧 BrowserSkill 链路若选择 headless，会在入队前以 `headless_runtime_unsupported` 拒绝。相关合同与 API 定点测试 12/12、contracts/API/workbench 类型检查通过，未运行根级全量测试。
- 正式工作台勾选后发起 execution `442f8563-8e78-4be5-844a-4835983ea137`：持久化 `browser.headless=true`，产品 Chrome 根进程实际包含 `--headless`，运行 completed、15 次浏览器命令、0 次复跑模型调用、cleanup confirmed。重开弹窗默认选项复位为关闭，工作台发起的可见模式 execution `6771d738-8191-429d-8c0f-27803639d6c9` 保存 `browser.headless=false`，前三个节点成功，第四个节点 `s-a-0004` 的 `browser.read-fields` 在 7 次浏览器命令后报 `hybrid_runner_failed:RuntimeError`，cleanup confirmed；本次没有到达播放器，不计为可见模式的业务通过。
- Release V1 持久化路径的第一节点 `s-a-0001` 固定导航到 `https://www.bilibili.com/bangumi/play/ss34430`，来源观察标题是《咒术回战》；第二节点才导航到 `https://www.bilibili.com/bangumi/`，搜索《凡人修仙传》后进入官方作品页、读取剧集、函数选择最新常规正片、点击并等待 `media_playback=playing`。错误深链由候选 TaskPlan 的第三个 `entryUrls` 带入 B-U，再被编译进 Release V1；已确认需求没有授权该具体内容 URL。此发布版本不可原地改写，不能用之前成功的 headless 运行掩盖路径错误或本次可见失败。

## 2026-09-25 准备计划草案架构决定与问题归位

- 用户确认：需求对话本身在访谈 Skill 驱动下按需只读联网、澄清并形成**唯一准备计划草案**；在同一对话中修订和确认后直接交给 B-U，确认后不再调用另一轮模型生成可增改业务语义的独立 TaskPlan。内部合同若保留，只能投影同一草案版本；`TaskDraft` 是 B-U 后产生的链路草稿。决定见 [ADR 0011](../adr/0011-interview-produces-preparation-draft.md)，**代码和 Skill 尚未按此迁移**。
- 本地现有改动先被原样固定为 `master@43ed385` 的一次快照提交；该提交不是新架构实现或新增产品验收。之后本轮只修改文档，不执行新的 B-U、正式复跑或根级全量测试。

| 问题 | 本轮可核对的事实 | 结论与边界 |
| --- | --- | --- |
| 旧任务靠旧结果补救 | 历史任务 `2a777a77-353e-4894-9b96-1e505827d366` 的代表试做虽成功，原链固定历史 `a[6]`；后续开发脚本借旧数据手工修草稿、调预算才试跑和发布。 | 旧运行是真实技术记录，但不是新任务一次试做、首编译、复跑都正确的验收；不再为旧发布结构加特例。 |
| B-U 新开页暂停 | B-A-T 已接入单 Browser 的 `Runtime.runIfWaitingForDebugger` 恢复适配；定点、headless 新页样本 2/2 以及新任务跨两次 tab 的来源成功有记录。 | 当前 Windows 样本证明新页恢复有效；升级 B-U 或跨平台仍需按实际边界复核。 |
| 旧链读取集合上限 | 旧可见复跑在无消费者的全页 `a` 读取超过 200 条时失败；通用编译裁剪后，全新任务首编译 `gaps=[]` 且样本、独立复验和正式复跑技术完成。 | 该已知旧缺口的修正不能解释下面另一条可见读失败；不得把两者未经证据合并。 |
| 运行时没有窗口 | 先前 API 继承 `BAT_UPSTREAM_BROWSER_HEADLESS=1`，产品浏览器无窗口；运行结束会关闭浏览器，`media_playback=playing` 只表示当时页面状态。 | 当前没有持续观看或用户满意的验收证据；无窗口的直接原因已查明。 |
| 单次 headless 开关 | 运行弹窗已提供默认关闭的 Headless 选项，选择经合同、持久化和现有 BrowserProfile 传递；定点合同/API 12/12 与类型检查通过，勾选后的正式运行确有 `--headless` 并 completed。 | 开关控制路径有证据；这不证明可见模式的任务也已通过。 |
| 可见模式读取失败 | execution `6771d738-8191-429d-8c0f-27803639d6c9` 保存 `headless=false`，第 4 节点 `s-a-0004 browser.read-fields` 在 7 次命令后报 `hybrid_runner_failed:RuntimeError`，清理已确认。 | 底层异常被边界脱敏，当前精确原因未知；需在读取层定点取证和修复，不能撞运气重复整跑。 |

### 错误入口的精确交接链

1. 新任务 `60d9b658-ba77-4da2-82d8-771d2d0bc9c7` 的需求对话持久化为四条消息，没有搜索工具事件；`sourceResolutions` 为 0，已确认 Requirement V1 的 `confirmationFacts.sources=[]`，需求正文仅写 Bilibili 与官方来源，并明确“具体页面入口由准备任务调查”。用户没有确认某个内容页 URL。
2. 唯一准备 job `97f8f1e8-89f4-47c1-8fce-c49e003cbb45` 的第一次计划候选 `issues=[]`，`entryUrls` 包含 `https://www.bilibili.com/`、`https://www.bilibili.com/bangumi/` 和 `https://www.bilibili.com/bangumi/play/ss34430`。`planPrompt` 要模型列首页、搜索和内容入口；现有计划准入核验 URL 结构及执行合同，却未要求具体内容页有本轮已确认来源引用。
3. `browserUseTask` 把计划三个入口逐条列为“预执行入口”，要求 B-U 从中开始；真实来源首个导航打开 `ss34430` 并观察到《咒术回战》，第二个导航转到 Bilibili 番剧入口后才搜索《凡人修仙传》，最终技术后置条件观察到 `playing`。
4. Release V1 画布的两张“打开页面”卡对应上述两次真实导航，并非画布复制节点。该任务没有要求必须从首页进入，所以错误首跳不能单独否定后来 `playing` 的技术完成记录；它暴露了**对话草案无入口依据、确认后模型又增添深层 URL、准入未核对证据来源**的架构交接缺口。

当前退出状态：B-U 新页恢复和新任务一次首编译/技术复跑有样本证据；唯一准备计划草案、来源入口核验、可见模式完整运行和持续可见播放仍未通过正式产品验收。旧 Release 与历史运行保持不变；后续先做文档所列边界修复和定点验证，再用**新任务**取得同一条完整产品路径的证据，不能复用旧结果冒充通过。全部退出门未满足，本轮不关机。

## 2026-09-25 ADR 0011 边界修复与同一全新任务的正式工作台验收记录（未退出）

- checkout 保持 `master@43ed385`；该提交后的原有文档改动保留，未建 worktree、reset、clean、推送或改相邻项目。访谈 Skill 和协议现要求唯一可审阅准备计划草案；来源搜索仍由模型根据完整对话决定，宿主只校验真实工具结果引用。用户原文 URL 仅记为候选，宿主不因提及网址强制提问；草案确认时核对入口与同版来源。确认后的 TaskPlan 是零模型技术投影，B-U 指令核对 Requirement 版本、摘要和入口，不再由第二轮模型增添业务计划或网址。当前结构化投影支持草案明确的文本、整数、数字、布尔和文本列表字段；更复杂输入及多步组合尚无本轮产品证据。
- 正式工作台新建**唯一**任务 `e0a89257-9bf6-49f1-b0df-9713239fce9a`，访谈 Pi 只读搜索后经来源 Question 选定 `https://www.bilibili.com/bangumi/play/ep4863921`，确认 Requirement V1 `46a1da1c-ab68-4473-8644-876c883e9ab1`，`confirmationFacts.entries` 与搜索来源 resolution `ee4a6b65-b9e3-48f3-9c35-fe44cd3518d7` 一致。准备 Plan V1 `10388d60-db04-4562-86ff-b674c858149c` 的 digest 为 `97467593803027a31d08fd52b4ce1bb6a0387925968b591421676092005bfab0`；形成计划的审计为 `plan_projection`、模型调用 0。此前错误深链没有带入本次入口。
- 必须区分同任务的四个准备 job 与三次实际 B-U 浏览器试做：job `6e052de3-db9c-4ab4-805b-70001ca44a1f` 有失败来源，模型观察后页面 URL 在同文档内变化，旧点击被正确拒绝；同文档重观察的通用定点修复随后通过 Python 2/2。job `408caefd-291a-4eca-8a01-8377b642c463` 因受管源码摘要未更新在启动浏览器前失败，未进入 B-U；已更新清单并通过核验。job `992070a0-c171-4448-879f-152df55b1557` 在第 13 步 `wait` 前置观察约 60 秒后失败；诊断只证明 Python `author_step` 返回，TS `session.author` 未返回，来源保存代码未执行。旧持久化记录没有 fd3 接收、schema 与响应校验阶段，不能唯一指认该边界内的异常。只在现有 owner JSONL 增加固定结果边界阶段码，没有记录页面正文或异常原文；不能称修复后一次通过。
- 同一已确认草案的工作台手动重试 job `60082b5a-57ae-4b68-88b3-7e8a81656fda` 产生全新 B-U 来源 `da570e66-57d7-43cf-8564-857c05467087`：`sourceSuccess=true`、6 次浏览器命令、trace completed、source closed；诊断有 `author_response_received` 和 `author_response_accepted`。首次编译 artifact `1e705824-41c0-4182-8e4a-4990066a1ff2` 为 9 节点、8 连线、`gaps=[]`；两次候选读取各由 Function 选择运行时目标，点击使用运行时 ordinal。链路草稿 `3afb8844-577d-4a3d-8b0b-90570c9f14a6` revision 0 / checksum `6472fc75c5b9fcf3a0f4b94f58e9c6b9a5d86032eef28819c91ac1d6c741de13` 未经开发脚本修订。
- 自动样本 execution `1a843ffa-8451-4ccc-85ca-d21cf9341a23` / TaskRun `735981a1-f7bb-4ec5-87e2-cde5fca2b122`，独立复验 execution `bb937292-a201-4a77-80aa-425d62e95575` / TaskRun `5e8176ca-3067-4099-8693-f7ec528f79f0` 均 completed、10 次浏览器命令、0 次复跑模型调用、cleanup confirmed；每条 TaskRun 各有 27 条本次节点事件。正式画布人工发布 Release V1 `f808e48f-932d-43d5-87c4-05a465d01616`，发布引用绑定上述两次验证。正式画布启动的独立 execution `92dc7fbe-007a-456b-89e9-5cc3b9c2430d` / TaskRun `5b01df41-6f23-41f4-8cd1-e81595511d37` 同样 completed、10 次命令、0 次模型调用、27 条本次节点事件、cleanup confirmed；SQLite 保存 `browser.headless=false`，运行时产品 Chrome 主进程 PID 864 无 `--headless` 参数，结束后进程退出。UI、API 和 SQLite 均显示同一 Release V1 与正式 execution 完成；截图在忽略目录 `work/recovery-20260925/formal-fresh-*.png`。
- **正式业务结果未获证明**：确认草案要求运行时选择最新可播放常规正片、观察到播放，并在结果说明中写明集数/标题及播放状态；没有要求执行结束后持续观看。B-U 来源完整读取 43 个剧集候选，排除第 193 集预告，选择函数输出第 192 集的 ordinal 3；点击后的同集 `o-0011` 有 `media_playback=playing`，是曾观察到播放的结构化证据。`done` 另称进度从 09:04 到 09:15，但原始画面未保存；稍后的 `o-0012` 为 `not_playing`，不能抹掉先前阳性观察，也不能证明此后一直播放。发布链从运行时 `read-fields` 候选经版本化任务数据中的 Function 计算 ordinal，并覆盖样本点击序号，没有在平台代码中固定集数或最终 URL；它没有单独判断候选是否可播放，末尾等待也只检查 URL 不变。三次 TaskRun 的业务证据为空、输出为 null、结果摘要只有技术完成，没有保存实际选中集数或播放状态，亦未交付草案要求的结果说明。因此不能从技术 `completed` 推断正式复跑已播放最新可播放正片。产品 Chrome 在 execution 清理时关闭；持续观看未测，应与本任务条件分开报告。旧可见 `browser.read-fields` 失败的原始异常不可恢复；其前驱曾通过完全相同 ReadSpec 的稳定检查，不能按后来的 64/100 条样本推断超限。本轮新链有两个不同规格的 `browser.read-fields` 在有界面复跑技术成功，只证明当前样本，安全固定错误码透传供未来同条件故障定点判别。
- **正式产品验收未退出**：本任务发布后只有一次独立正式 execution；[五道退出门](PRODUCT_LOOP_CAPABILITY_AUDIT.md#6-最小闭环的五道退出门)第 4 门要求两次，且第 5 门要求发布后服务重启核对需求、发布、结果、历史和资源所有权，本任务未做重启。四个准备 job、三次实际 B-U 浏览器试做也不是一次通过。上述技术完成仅保留为局部事实，不能当成本轮完整链路通过。
- 最小验证：来源 10/10、访谈协议 13/13、草案交接 4/4、同文档观察恢复 Python 2/2、读取阶段 Python 3/3 与安全码单项 1/1，API/Workbench/contracts 类型检查、Workbench 构建、受管 fork 摘要和 `git diff --check` 通过；未运行根级或全量测试。新版来源与正式复跑并未复用旧任务、旧 Release 或脚本注入草稿。

### 同一任务失败后的根因定点修复（尚无修后产品验收）

- **确定的编译错误**：成功来源中，`a-0005` 点击从旧播放页进入所选目标页，目标页即时 `o-0010=not_playing`，相邻等待的前观察 `o-0011=playing`、后观察 `o-0012=not_playing`。旧自然编译先为导航返回 `url_digest changed`，又因等待的后观察不是 playing 而编出 `url_digest unchanged`；来源已有的目标页播放阳性事实没有进入 TaskChain。故首编译 `gaps=[]` 和三次技术 completed 均不能证明播放。这是来源→编译合同的确定缺口，不是 B-U 新页恢复或 headless 开关问题。
- **定点修复**：受管自然编译现在只把同一目标页、相邻且 30 秒内的 playing 观察归给产生该页的浏览器动作；旧页原本已 playing 不计为新动作效果。导航 URL 与播放条件在同一节点合并并在编译期一起校验，无法归属时给 gap。现有后置检查的一次 attempt 固定同一个 Page，开始/结束校验 targetId、URL 与焦点，漂移仅由既有有界 settle 重查，不重复点击。访谈 Skill 补充“状态交付不得在自由文本另承诺动态业务值”的成稿规则；旧已确认草案、Release、TaskRun 均未改写。
- **定点验证**：媒体编译新测试 6/6、既有导航 8/8、动态选择 11/11、页面身份新测试 2/2、现有 ConsumerReadiness 22/22 通过；原始 canonical 历史来源仅用于离线诊断，重编译 `gaps=[]` 且 TS 物化 9 节点，目标点击节点含 `url_digest changed` 与 `media_playback=playing` 两项同一 30 秒策略。受管 fork 来源摘要 `d0363e2ad2189d381b853876463020d79b8f2d147dc2fbb2732831723a2b99c1`、新增 vendor 文件定点 Ruff 和 `git diff --check` 通过；本地 Python 环境初次 `--check` 报 `hybrid_installed_source_changed`，已用项目 setup 同步并重新 `--check` 通过，避免重现浏览器启动前的摘要失败。整个改动文件集合的 Ruff 仍报 `hybrid_main.py` 在本次之前已存在的未用导入，未为此扩大清理。没有浏览器新运行。
- **仍未查明/未验**：第三次准备 job 只可定位为 Python `author_step` 已返回而 TS `session.author` 未返回，旧记录没有 fd3 接收与校验阶段；新固定阶段诊断尚未遇到同类失败。旧可见 `browser.read-fields` 的原始异常栈缺失，其前驱同规格就绪检查已通过；新安全阶段诊断 6/6 通过，但不能称旧故障运行时根因已修。`media_playback` 只证明目标页有可见媒体曾 playing，不证明具体流身份或执行结束后持续播放。修后正式工作台全新任务、首编译、候选验证、手动发布、两次独立正式复跑、重启和用户体验均**未测**；自动审批拒绝了启动带远程调试端口的可见 Chrome 工作台命令，理由仅返回 `blocked by policy`，没有绕过后用 API/旧任务冒充 UI 验收。

### 旧 B-U 失败的两层边界与定点取证修复（无新产品运行）

- 只读复核 job `992070a0-c171-4448-879f-152df55b1557`：其 owner `30a200e4-0f33-4545-8774-f028a6ad43d6` 的 JSONL 在 `08:17:19.913Z` 记录第 13 步 `wait` 动作前观察开始，`08:18:19.903Z` 失败，期间没有该动作的派发记录。`before_action` 真实调用路径涉及动作前 live document sample（Page target/CDP document）、media 读取与 title/url 观察。media 单独异常被既有捕获器忽略，不会直接导致该 failed 事件；当前 browser-use 每个 CDP 请求默认 60 秒，Agent step 是 180 秒，59.990 秒强烈指向动作前某一 CDP 读取超时。但原始异常和具体方法没有写入旧日志，不能唯一确认是哪一次 CDP 读取或浏览器不应答的底层原因。
- 同一 JSONL 在 `08:21:20.412Z` 记录 Python `author_step` 返回，SQLite job 在 `08:21:24.820Z` 失败且 `exploration.sources=[]`。TS 只在 `await session.author` 返回后把来源加入数组，所以 Python 完成后 fd3 编码/写入、TS 协议接收/结果 schema/响应验证之间发生了独立交接失败；旧记录没有这些边界的安全阶段，不能把任一候选臆断为旧根因。
- 现已在动作前 live document sample 与 title/url 读取失败点向同一 owner fd4→JSONL 记录固定阶段和异常类别；Python hybrid author 响应的 fd3 编码、写入分别记录固定阶段。若结果不可 JSON 编码，fd3 返回 `hybrid_runner_failed:RuntimeError:author_result_serialization_failed` 固定错误包；原值和异常原文不外传。TS 对新事件严格枚举并只入本地 owner JSONL，不扩大工作台进度合同。原异常链、超时、Agent loop、Browser 控制与重试策略均未改。写入通道自身断开时只能在 fd4 记 `write_failed`，无法保证已断开的 fd3 交付响应。
- 所属定点验证：Python fd3/诊断 4/4、动作前观察阶段 3/3、既有 callback stop 6/6；TS owner JSONL 固定事件 1/1，API 类型检查通过，变更 Python 文件定点 Ruff 通过。受管 fork 清单与安装环境同步后 `setup-upstream-browser-runner --check` 通过，摘要 `94b58403354c4f0ced9b2fcc197b20c7e46529d0e29ee4c85e34189e31187970`。这些验证只证明下一次故障可归因及编码失败可安全回应，不证明旧 CDP 故障已恢复，也不构成新任务一次通过。

### 修后唯一新任务的正式入口与浏览器启动阻断（尚未进入 B-U）

- 工作台唯一新任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 由正式“新建需求”入口创建，需求原文从正式对话发送。Pi 访谈只读搜索后，Question Panel 选择 Bilibili 官方番剧候选 `https://www.bilibili.com/bangumi/play/ep4863921`；第二次提问依据原需求确认“最新正片受限则停止，不回退”。草案 v1 在正式 UI 审阅并确认，Requirement v1 `6f752b2c-f082-4d16-8ea2-babbf476611c`、digest `e7ca3bd54954b701e19c7bf41fe9a22c30e286a1a414f750587912aad7ab1a67`，`confirmationFacts.entries` 与同版已选择来源一致。草案只把该 URL 当试做入口，运行时仍动态选择最新常规正片；无运行输入，仅交付播放或受限停止状态。SQLite 当前没有该任务的 Plan、准备 job、来源、TaskChain 草稿、Release 或 execution；不能把 Requirement 确认算成 B-U 或首编译通过。
- 同一浏览器 owner 的专用 Profile `data/browser-profile/default` 在本机启动失败：默认 Browser-Use 0.13.8 选择 bundled Chromium 134，Profile 的 `Default/Preferences.profile.created_by_version` 为 Chrome 153；对应尝试生成 Chrome breakpoint crash dump。空 Profile + Chromium 134 可启动，专用 Profile 的临时副本 + Chrome 153 可启动。由此确认当前二进制/Profile 版本不匹配并强烈关联启动崩溃；尚未排除原 Profile 路径自身的状态问题，不能把崩溃的唯一底层原因说成已证实。直接指定 Chrome channel 会触发 Browser-Use 把 Profile 复制到系统临时目录，破坏现有精确 Profile 所有权；单纯外部 CDP 连接又无法由现有 owner 清理外部 Chrome 进程。停止用 Chromium 134 重试旧 Profile，B-U 尚未启动。
- 额外的 Chrome channel 定点探针遗留一份 Profile 临时副本；针对该确切目录的 PowerShell 删除请求被自动审批以 `blocked by policy` 拒绝，未换 shell 或其他方式绕过。不得把这份临时副本加入 Git 或日志；后续需按允许的所有权清理路径处理。此前启动可调试可见 Chrome 的命令也被自动审批拒绝，故当前可见模式 UI/B-U 运行门未通过。
- 旧观察测试在诊断改动后初次全文件执行 14 项中 10 通过、4 个旧断言错误；旧断言将同文档 URL 变化期待为普通 `ValueError`，与已采纳的 `ObservationRefreshRequired` 恢复语义不符。只改两处对应断言后，所属 `tests.test_observation_scope` 全文件 14/14 通过。受管 fork 清单已更新并同步安装环境，最终 `--check` 摘要为 `94cd4739d9bdec404173b1d3bdd2557a82b6f4eb79580f8fe9af02bf4feeeb10`；没有因此改动重试、超时或浏览器控制。
- 当前分项状态：访谈、来源确认和草案到 Requirement v1 **通过**；B-U、首编译、样本、独立复验、手动发布、正式复跑与发布后重启 **未测**；专用 Profile 启动 **失败**；旧可见 `browser.read-fields` 的确切原始异常 **无法由旧持久化事实还原**，须在可启动的相同 owner 中做一次定点复现，不能声称已修复。旧任务技术成功和旧 Release 不计入本任务。

### 同 Profile 原生 owner 启动定点通过；正式服务尚未加载修复

- `RunnerProcess` 现在仅在 Windows 子进程内把 `PLAYWRIGHT_BROWSERS_PATH` 指向本次 owner 的空临时目录，沿用 Browser-Use 0.13.8 的默认查找和原生 LocalBrowserWatchdog；未指定 Chrome channel、未复制 Profile、未建立外部 CDP owner。受控 Python 探针解析到 `C:\Program Files\Google\Chrome\Application\chrome.exe`，同一专用 Profile 在可见模式启动成功，实际 `user_data_dir` 精确等于 `data/browser-profile/default`，目标页可用；`browser.kill()` 返回后无该 Profile 的 Chrome 进程。再经正式 TS `RunnerProcess.startProfile` 启动同一 Profile，结果 `profile_start=ok`、`cleanup=confirmed`；结束后同样没有该 Profile 进程。两者都是定点启动/关闭，不是新任务 B-U。
- API package `npm run check --workspace @browser-capture/api` 通过。当前工作台服务仍是旧进程 PID 29008；尝试停止并以隐藏窗口重启该进程的工具命令被自动审批直接拒绝，返回 `blocked by policy`，旧进程未被停止，HTTP `/api/health` 仍为 200。未使用其他 shell/脚本绕过；已请求用户按本机方式重启以加载代码。任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 保持 Requirement v1 已确认、Plan/job/source/chain/release/execution 均无；正式 B-U、首编译、样本/独立复验、手动发布、复跑仍 **未测**。
- 因此前段的“Profile 启动失败”是旧二进制组合的已定位故障；新配置的**定点**启动/清理已通过，但正式服务内的产品验收尚未开始。旧 `read-fields` 原始异常仍无法追认；即使新任务成功也须报告它是否在相同可见 ReadSpec 上定点复现，不能把不同规格读取通过当修复。
- 对旧可见失败 execution `6771d738-8191-429d-8c0f-27803639d6c9` / TaskRun `16cf3692-c699-44a1-8b3e-5ba14eac34aa` 的只读复核确认：前驱 `s-a-0003` 用同一 `ReadSpec` 连续两次读到稳定值，`s-a-0004` 在约 230 毫秒后以未分阶段 `RuntimeError` 失败。其来源当时已记录 Bilibili `/bangumi/` 标题“出错啦”，故错误页本身不能被事后臆断为旧故障原因。用原专用 Profile、Chrome 153、可见模式与完全相同的 `div`/textContent/可选 class、100 项、128000 字节 `ReadSpec` 和 URL scope 做**一次**定点读取：当前 URL 与错误标题相同，但实时 DOM 的 `div` 数为 0，读取按输出合同得到 `read_output_schema_mismatch`（异常类 `FieldReadError`），owner 正常关闭且无残留 Profile 进程。当前页面状态不同于旧稳定读取现场，因此这次只证明新状态的类型化失败，**没有复现或查明旧 `RuntimeError` 的具体底层子因**；不再重复整跑碰运气。

## 2026-09-25 同一全新任务最终验收与资源清理

- checkout 仍为 `master@43ed3851636e748aed973df67fd1c61bc76e96eb`，原有未提交文档与本轮代码改动均保留；未建 worktree、reset、clean、提交、推送或改相邻项目。先核对进程所有权，只结束两个遗留的本项目 `formal-ui-driver.mts` UI 驱动 PID 19996/12960；未触碰游戏、WeGame 或归属不明的 `browser.exe`。当前 API PID 23684 正监听 `127.0.0.1:4175`，两次正式执行后无本项目 Profile 的 Chrome/Python 残留。
- 较早 Chrome channel 探针遗留的确切临时 Profile 副本 `%TEMP%\browser-use-user-data-dir-o4fc06u7` 仍存在，已核验位于系统 Temp、不是重解析点且无 Chrome 使用；对该绝对目录的原生 PowerShell `Remove-Item -LiteralPath ... -Recurse` 请求再次被自动审批以 `blocked by policy` 拒绝。未换 shell 或间接脚本绕过，故只能确认项目运行进程已回收，**不能声称该临时副本已清理**；它没有写入 Git。
- 同一正式工作台新任务 `0d9f377d-d83b-477d-bafa-b768146a7312` 沿上节的 Requirement V1/唯一已确认准备草案 v1 继续。第一次准备 job `e27d9627-1314-4d5a-8b70-cbd1c9428dec` 在 Python 已写 fd3、TS 已收响应而来源未保存时随 API 退出，SQLite 保留 `interrupted`、来源数 0；**首次 B-U 到编译没有一次通过**。Windows 20:16:18 事件 2004 记录系统提交量 `35,983,015,936 / 36,081,029,120` 字节，只余约 98 MB。项目 Chrome 是当时大内存贡献者之一；旧 API 无退出码和 stderr，无法证明唯一退出机制，更不能把责任归给用户游戏。中断后的诊断状态交接只修 `planRecovery` 的 `interrupted` 准入，使正式工作台显示同版草案重新试做入口；旧 job 不改写，不假装能续接已消失的 Browser。
- 从正式工作台点击“重新试做当前草案”启动第二 job `f6d17aa7-c418-438a-8f42-b3de517317c2`，仍属同一 Requirement/草案版本。B-U owner `ca1312e0-5596-4977-8655-572a4ebf789c` 的响应有 `author_response_received` 和 `author_response_accepted`，8 条浏览器命令后 `done`；来源 artifact `b5341801-4b12-4178-8712-5fa3bb67a004` 为 `sourceSuccess=true`、`closed=true`、`gaps=[]`。首编译 artifact `e096de29-31b8-4104-8f2f-b975e589db4c` 绑定同一 Requirement digest `e7ca3bd5…`、Plan digest `886aff4c…`，`gaps=[]`；候选链含两次实时 `browser.read-fields` 和两段选集 Function。两次动态 ordinal 点击从对应 Function 输出取值，源码没有加入站点或集数特例。自动样本 execution `5f106767-c688-4220-8590-6ae5b2e8ac96` 与独立复验 `c23bb656-c93a-49fe-8815-181e32e534aa` 各有独立 TaskRun，均 completed、10 条浏览器命令、0 模型调用、cleanup confirmed；相同输入摘要符合本任务的 `null` 输入合同。
- 正式画布的“发布→确认发布”新增且仅新增 Release V1 `211242d4-6ddd-44c0-86e7-a1544e9ebdd3`，digest `0071b0f61eac86cb431270b680234e1c75beb846dc016dbca5eea810b1ae4358`，冻结上述样本与独立复验。没有手工改草稿、注入 API/SQLite 或复用旧 Release。正式 UI 默认 `headless=false` 启动两次独立执行：`cfd437fa-8879-448b-8a38-b46816cc9b13`→TaskRun `45e0ad7c-57fb-4839-8a08-e682e6525164`；`5d25709f-8311-401e-8578-034613a6ed96`→TaskRun `1128ca4c-dee9-4517-8d7c-baef7d02ec85`。二者同一 Release/链摘要，各自 9 个节点全部 success、10 条浏览器命令、0 LLM 调用、execution/TaskRun completed、auditComplete=true、cleanup confirmed；末尾 `wait` 的现场 `media_playback=playing` 后置均通过。
- 第二次正式执行过程中只读实测本项目 Chrome 根 PID 10252 使用 `data/browser-profile/default`，命令行无 `--headless`，窗口句柄 8718780 且 `IsWindowVisible=true`；窗口标题先为作品页，后为“凡人修仙传第192集…”。21:19:24 后该 Profile 的 Chrome 进程已退出。可证浏览器窗口曾可见、进入第 192 集且运行时播放器状态检查通过；没有本次画面采集。TaskRun 输出为 null，事件只保存节点状态，未保存当次候选数、函数输出序号或最终 URL，故不能拿 B-U 的选集值冒充两次复跑实际值，也不能证明结束后持续观看。旧可见 `browser.read-fields RuntimeError` 原始子因仍未知；本轮两次新规格可见读取成功不等于该旧故障根因已修。
- UI 重开后画布显示 Release V1、最新“运行完成”和 `8/8 已完成`，截图在忽略目录 `work/recovery-20260925/fresh-task-published-20260925.png`、`fresh-task-replay-completed-20260925.png`、`fresh-task-replay2-completed-20260925.png`。API `/api/task-chain` 返回最新 execution completed/cleanup confirmed，同任务历史接口返回一条 Release 和两条正式加样本/复验共四条 execution；SQLite 只读打开 `data/workbench.sqlite` 同样保留第一 job interrupted、第二 job completed、两件新 artifact、一条 Release、四条 completed execution。所属 API 恢复测试最终 3/3 通过，API package 类型检查先前通过；未运行根级或全量测试。
- **验收结论**：同一新任务第二次准备尝试后的 B-U→首编译→样本/独立复验→手动发布→两次正式复跑，技术链路通过；“从需求对话一次性稳定通过”**失败**，因为第一次准备 job 中断且需正式 UI 重试。发布后 API 重启命令被自动审批直接拒绝（仅返回 `blocked by policy`），未换 shell 绕过；API PID 23684 保持健康，**重启后持久化未测**。结束后持续观看、当次选中集数的持久化证明也未测/未实现。五道退出门第 4 门满足本轮技术证据，第 5 门未退出，不能宣称完整产品验收通过。

### 首次 B-U 响应交接的定点修复（尚无修后正式任务）

- 首次 job 的 `author_response_received` 已证明 Python fd3→TS 协议接收成功，丢失发生在接受校验、Browser owner 关闭和来源保存之前；同一时间窗口的 Windows 事件证明系统提交量仅余约 98 MB。现有代码在 Browser 仍占用内存时运行 Function 校验 Worker，这是可定位的资源生命周期缺口。由于首次 payload、API 退出码和 stderr 未保留，**不能证明**这就是唯一退出机制，也不能把两次 B-U 的不同模型动作路径当成已证实的失败原因。
- 只在计划最后一个步骤的 TS 会话调用中标记 `closeAfterResponse`：收到完整响应后，先调用现有且幂等的 `RunnerProcess.close()`，确认 Browser/Python owner 释放，再做响应 schema、Function 校验和来源准入。中间步骤继续使用同一个 Browser；关闭未确认则沿既有 `RuntimeCleanupRequiredError` 阻止接受来源。标记不进入 Python source、公共合同或版本摘要；没有改访谈、B-U Agent、编译、发布、复跑和任何站点规则。
- 定点结果：新增所属 API 顺序/多步/关闭失败测试 3/3，通过；现有真实 Function 校验 4/4、真实 Python owner 清理 6/6、草案版本交接 4/4，通过；API package TypeScript 检查和 `git diff --check` 通过。当前监听 4175 的 API PID 23684 由 `node --import tsx apps/api/src/main.ts` 启动，没有 watch，**仍运行修复前代码**。此前对该进程的重启命令已被自动审批以 `blocked by policy` 拒绝；本轮没有改道绕过，也没有新建任务再做完整链路。因此修后从需求对话到首次 B-U、首编译、样本/独立复验、手动发布、正式复跑、UI/API/SQLite、可见播放**未测**，一次性稳定性尚未证明。

## 2026-09-25 简短需求正式访谈与来源题板复核

- 原过长输入任务 `a40711c9-91f0-4e07-a022-dfa67f9ecf03` 不能验收需求对话主动拆解普通需求；其草案 v2 未确认，未启动 B-U。该任务首轮腾讯题板的根因是访谈模型自行用含“腾讯视频”的搜索词，忽略同轮“B站独播”等相反摘要，把两个旧单集页当作动态最新入口；宿主虽验证 URL 来自原结果，却丢弃摘要、称为“多个合理来源”并按首位标推荐。没有页面调查证明腾讯候选合格。改动限于既有 Skill/访谈指令、Pi 搜索摘要到 `SourceCandidate.description` 的投影和 Question 文案/推荐标记；没有站点特例、词表评分、第二来源事实源或业务计划生成器。
- 所属来源测试 11/11、API package TypeScript 检查和 `git diff --check` 通过。API 已以 `node --import tsx apps/api/src/main.ts` 重新启动，PID 11936、监听 127.0.0.1:4175、`/api/health` 200；旧段的“PID 23684 仍运行旧代码”仅为当时快照。
- 正式工作台新任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82` 的首句仅为“帮我播放《凡人修仙传》最新一集。”。Pi 本轮搜索 `《凡人修仙传》 动画 官方 在线观看 最新集`，来源题板显示哔哩哔哩国创页 `https://www.bilibili.com/bangumi/play/ss28747` 的原始“高清独家在线观看”摘要且无推荐徽标；验收操作者在正式 UI 选择该候选。模型随后以 Question Panel 确认“最新一集”选择公开可看的最新正片、不包括会员抢先看；生成唯一草案 v1，正式 UI 确认。草案含动态选集、排除预告花絮、受限时停下、实际播放状态要求。API `confirmedVersion=1`、来源 `selected`；SQLite 只读核对 `tasks.confirmedVersion=1`、`drafts` 仅 v1、`sourceResolutions` 状态 selected、`decisions` 含两次选项与一次草案确认，`plans=0`、`chains=0`。这是访谈与草案交接通过，不是 B-U/网页播放通过。
- 这句原文没有“动画”，模型首次搜索却自行加了该形态。来源题干明确写“动画”，验收操作者选择“哔哩哔哩国创”候选，故本次对象可视为通过题板确认；但唯一搜索提前限定形态可能排除同名其他对象。已在通用 Skill/阶段指令补充未确认内容形态不得作为唯一搜索限定词及同名对象需用户核对；该提示增量尚未加载到现有 API，也没有新的访谈实测，不能把这条任务之前的成功反过来当作新提示已验。
- 关闭本次 UI 驱动 Chrome 后回执 `closed=true`，API 保持健康。系统可用提交内存约 2.11 GiB，旧可见 B-U 的项目 Chrome 曾占约 4.89 GiB；旧首次失败前事件曾只余约 98 MB。用户游戏及归属不明、昨日已存在的 `browser.exe` 均未关闭。为避免已知资源耗尽条件下再次让 API 中断，未从工作台启动这条任务的 B-U。当前任务 Plan/job/source/chain/release/execution、首编译、样本/独立复验、手动发布、正式复跑、UI/API/SQLite 全链证据、可见播放未测；一次通过稳定性未证明。待资源足够，仅沿这条已确认草案继续一次正式链路验收，失败保留原层证据，不用旧任务或同版第二次试做冒充首次成功。
- 题板追加完整 URL 路径用于区分同域候选后，所属来源测试再次 11/11、API 类型检查通过。对当前 API PID 11936 执行停止并重新启动以加载此改动的命令被自动审批直接拒绝，仅返回 `blocked by policy`，命令未执行；PID 11936 继续监听且 `/api/health` 200。没有绕过审批，故当前产品现场仅验证此前已加载的原摘要/无推荐版本，完整 URL 展示只通过定点代码验证。

### 旧可见 read-fields 的可证边界与内层阶段补证

- SQLite 旧 execution `6771d738-8191-429d-8c0f-27803639d6c9` / TaskRun `16cf3692-c699-44a1-8b3e-5ba14eac34aa` 是 `headless=false`：`s-a-0003` 于 06:04:05.139Z 在同一 `/bangumi/` scope、`div`/textContent/可选 class、100 项/128000 字节规格成功，`s-a-0004 browser.read-fields` 于 `.142Z` 开始、`.369Z` 仅报顶层 `RuntimeError`；累计浏览器命令 7、模型调用 0、清理 confirmed。旧 fd3/SQLite 没有 Python 异常链或内层阶段；之前当前页面 0 个 `div` 得到的 `FieldReadError:read_output_schema_mismatch` 属不同现场，不能充当旧 `RuntimeError` 的根因。旧故障究竟在页面身份、CDP 集合查询、字段投影或读后观察，现有持久化证据不能唯一判定。
- 受管 `read_fields`/`TargetResolver` 的内层前后 scope、集合快照和 CSS 查询现加固定安全阶段 note，并由原 Runner 映射成不同 fd3 码；CSS 容器定位错误只在真实 CSS 查询阶段分类。原异常链只留 Python owner，未改读取算法、超时、重试或 Browser 会话。所属 Python 故障注入测试 8/8、正常读取合同 2/2、受管 fork setup 与 `--check` 通过，最终来源摘要 `80bbe96277d770752d150432a5534ad0a84f5eceb3c5b06df245e7c7b3d71b5b`；未启动真实浏览器。这是后续故障归因能力，**不是旧故障已修或可见模式已通过的证据**。

## 2026-09-25 主动清理开发端口的 npm script

- 用户的 `npm run dev` 被 4175 占用阻断；监听 PID 11936 是此前本轮独立启动的本项目 API，其相对入口命令和无 `development` 身份的健康响应使自动启动守卫无法证明 checkout，故安全拒停。只读持久化确认无活动访谈、准备或执行后，核对 PID/命令并只停止该进程，4173/4175 均释放。
- 按用户要求新增根脚本 `npm run clean`，仅处理工作台 4173 和当前配置的 API 端口。显式命令复用 TCP LISTEN PID 查询，二次核对后只停止初始占用者并等待端口释放；新占用者不会被连带终止。语法检查、空端口实际命令、随机端口临时监听进程真实清理及 PID 变化不误停样本均通过；未运行根级或全量测试。原 `npm run dev` 的自动身份守卫保持不变。

## 2026-09-26 新需求输入误锁定点修复

- 截图时新任务 `6416bb34-f72c-4066-9b80-ee065f90c496` 空闲。旧 execution `82bdc9d7-e341-4d0d-8885-cd091f56c15b` 是 `cleanup_required`/`unconfirmed`，审计 `activeResources:false`，却被 `/api/tasks` 投影成 `executing`；工作台把它误当全局占用并把共享输入框设为 `disabled`。另一 B-U job 在截图后才启动，不是截图锁定原因。
- 已把待清理显示为单独 TaskSummary 状态，排除在全局运行互斥之外；若别的任务真实运行，输入框仍可聚焦并编辑本地草稿，发送继续受限。采用 AI Connect 现成 `sendDisabled`，没有改浏览器 owner 或运行调度。命令行受 `forbidden_ai_origin` 拦截，未伪造工作台来源去改旧执行。
- 合同、Workbench、API 所属包 TypeScript 检查通过，Workbench 现有发送门测试 3/3，差异检查通过。确认最新 B-U job 结束且项目 Python/Chrome 已退出后，重启本项目开发服务；新 `/api/tasks` 显示旧任务 `cleanup_required`、新任务 `new`，4173 返回 200，Vite 载入新输入属性。**UI 实际点击与键入未测**；旧执行清理仍待产品受控恢复，原业务失败保留。没有运行全量测试或借旧运行宣称新任务验收通过。

## 2026-09-26 正式任务样本读取范围失败

- 正式短需求任务 `b3726b40-02ab-4d0b-b1fd-78e199c67f82` 的第二次准备 job `ea2ccf85-cda3-4f63-8f64-87ddcb5f637c` 完成 B-U 6 步与首编译；样本 `2a0c20dd…` 在 `browser.read-fields` 的读前范围核验失败，码为 `hybrid_read_inner_pre_scope_value_error`，清理 confirmed。独立复验、手动发布、正式复跑均未发生；该任务不是“一次性通过”。
- 原因定位到来源→物化：B-U 导航后，同一 tab/同一 document 的 URL 在被排除的只读 `find_elements` 前变化，来源有 `readonly_observation_refreshed` 证据；旧分类器仍强制 URL 完全相同，运行节点留着试做剧集页的静态 scope。本次修复让已证明的中间只读同文档变化产生现有运行时 scope 重绑标记；跨文档、缺诊断和点击路径仍拒绝。合成正反例测试 5/5、API 类型检查通过；失败作业持久化来源只读重新分类得到 `runtimeScopeFrom=s-a-0001`/`readOnlySameDocument=true`。未重跑旧任务冒充成功，后续新任务完整验收仍待进行。
- 修复后仅重启本项目开发服务，`/api/health` 返回 PID 2256、4173 页面 200；任务列表仍如实显示旧 execution 为 `cleanup_required`、该正式任务为 `failed`、新建空任务为 `new`。当前系统空闲提交内存约 4.18 GiB；未在这个现场再启动一次高内存可见浏览器整链，也未把旧 job 或离线重新分类列为新任务通过。

## 2026-09-26 访谈视角纠正与污染任务

- 正式工作台新任务 `7dc29061-f591-4559-ab72-8a3fcca21464` 的唯一初始用户输入为“帮我在哔哩哔哩播放《凡人修仙传》最新一集。”首轮确有只读搜索与来源确认，但访谈随后先问播放状态并给出草案 v1，没有主动调查和询问可能改变“最新一集”可完成性的会员资格。此时自然短句访谈门已失败。
- 操作者错误地用**产品用户身份**追加了“先核查会员、再问我”等产品规则，随后又追加纠正，模型才搜索观看资格并问是否具备会员。该 Question 的产生不能算访谈自主行为。用户没有回答此题，也没有确认草案或授权准备。当前 `/api/interview` 只读检查：revision 5、confirmedVersion=null、草案 1 份、1 个 open 业务 Question、来源状态 `selected/open`、五轮 succeeded；第二个 open 来源决议对应的来源 Question 已 superseded，是本次纠正留下的孤儿状态。旧已选来源和对话历史保留，未直接修改 SQLite。
- 根因分别是：当时的访谈指令没有把成稿前资格调查写成明确门，模型把会员未知留给 B-U；已选来源内的业务资格搜索被错误提交给来源候选工具，导致多余来源题板；`finishRound` 只取代旧 Question，未同步其 open 来源决议；Question Authoring 被设置为 `recommendation: "required"`，迫使只问用户本人事实的会员题也给“有会员”标推荐。操作者代用户补写指导是验收方法错误，不是产品能力。
- 已定点修正访谈 Skill/阶段指令：成稿前按需调查可能改变目标的访问资格；已选来源内的业务事实搜索只用于业务解释或 Question，不再作为新来源提案；只有证据支持的方案取舍可推荐，用户自身资格和意愿题不推荐答案。协议改用 AI Connect 公开的可选推荐。轮次状态同步 superseded Question 与其 open 来源决议，并在下一轮收敛已持久化孤儿。无网站、剧集或会员专用运行分支；B-U 新页恢复、单次 headless 开关和旧 Release 均未改动。
- 所属协议/来源测试合计 27/27、API 包 `tsc --noEmit`、`git diff --check` 通过。此验证只证明协议可表达无推荐题、多个推荐被拒绝和孤儿状态能收敛；没有对污染任务代答、确认草案、启动 B-U，也没有再建任务整跑。由于首轮已经失败且后续被指导性用户消息污染，不能从这条任务报告首编译、样本、独立复验、手动发布、正式复跑、可见播放通过；这些均未测。
- 核对任务列表没有运行中任务后，使用现有 `npm run dev` 的同 checkout 身份守卫关闭 PID 17072 并启动 PID 16132；4173/4175 同属新 PID，`/api/health` 200。重启前后该任务仍为 revision 5、未确认、1 个 open 问题及 `selected/open` 来源决议；修复只会在未来新一轮状态转换时收敛旧孤儿，未静默改写既有持久化记录。

## 2026-09-26 全新普通目录任务的首次编译失败（保留失败事实）

- 本轮起点是现有 `master@43ed385` 和全部 dirty work；核对同 checkout 的 4173/4175 服务及 SQLite 后才实施修复。正式工作台新任务 `486738b7-00fb-4d7d-9e23-93d2dc62f49c` 的普通需求是读取 Python 官方《Python 教程》最新稳定版目录，按页面顺序给出全部一级章节的标题与链接，完成后保留原页面。访谈在 Timeline 显示一次公开搜索，来源 Question Panel 选定 `https://docs.python.org/3/tutorial/index.html`；唯一草案 v1 经 UI 确认，Requirement 同版入口和 `browserHandoff=keep_open` 的 Plan 候选一致。UI 驱动在初次来源题板刷新后误点停止键，导致一次访谈轮次 cancelled；随后使用工作台“重新提交本轮”完成 revision 3。此人工驱动中断不算产品访谈成功一次通过。
- 第一次正式准备 job `d562f3e0-c59b-487e-8757-6b19436950e4` 只启动一次 B-U，来源 artifact `c346fc71-7bf9-41a1-8d59-1be223d5c781` 已保存，5 次浏览器命令、8 次准备模型调用；在官方页面执行 `navigate`、模型 `extract`、三个 DOM 查询与 `done`。精确 `main li.toctree-l1 > a` 查询为 0，宽 `ul li > a` 与 `a[href]` 分别为 156/175；输出把章节标题和链接拼成两个长字符串。已确认草案的结果合同也是两个顶层文本字段，与用户要求的逐项配对记录列表不符。B-U 标 `sourceSuccess=true` 不证明章节全集或可复跑数据读取。
- **第一次编译失败，不能称一次通过。** Job 在 `compiling` 阶段 failed；技术 gap 包括 `natural_field_read_evidence_missing`、`natural_output_assembly_incomplete`、`consumer_readiness_live_read_required`、`natural_result_binding_incomplete`。工作台显示“代表执行记录已保留，但链路编译仍有缺口，尚未发布”，截图保存在忽略目录 `work/formal-acceptance/first-task-first-compile-failed.png`。SQLite 只读核验该 task 为 `confirmedVersion=1`，草案 v1/revision 3、来源决议 1 条、失败 job 1 条、来源 artifact 1 条、Plan/Chain/Release/Execution 均 0；未点同版重新编译或重新采集，未用失败来源冒充成功。
- 本轮通用修复随后给新草案增加“单条记录/记录列表”同版形状，并在 B-U 同一 Browser/Agent 内为结构化集合补现场证据门；旧 task 的已确认草案、来源与失败记录不改写。修后全新正式任务的首 B-U、首编译、样本、独立复验、手动发布、正式复跑和原窗口交付仍须另记结果。

## 2026-09-26 第二条全新目录任务的首次 B-U 失败（持续诊断）

- 修复加载到同 checkout API PID 14700 后，正式工作台新建普通需求任务 `233dd9fe-0be6-4927-8f05-d326f0721b53`，初始输入要求 Python 官方教程目录逐项给出一级章节标题及对应链接，并保留原页面。访谈自主只读搜索，Timeline 展示 `site:docs.python.org/3/tutorial/ Python Tutorial table of contents`；来源题板选定官方 `https://docs.python.org/3/tutorial/index.html`。模型又主动澄清“一级章节”范围，第一次选项对 Appendix 的描述自相矛盾，下一轮自行发现并重问；用户侧选择“不纳入 Appendix”。唯一草案 v1/revision 4 在工作台确认：`记录列表` 的章节标题/链接成对字段、官方同版入口及 `页面交付：保留现场`。SQLite 确认 `confirmedVersion=1`、来源决议 1 条、草案 1 份。
- 工作台首次生成 job `6e9d9a5d-abc6-4a0e-8ce6-7bbc09d953f4` 的来源 artifact `525f35a9-813d-4f1e-82b6-f7d4ecbe4232` 保留。B-U 在官方页执行 1 次导航、2 次完整 `find_elements`、1 次原生 extract 与 `done(success=true)`；两次 `div.toctree-wrapper > ul > li > a` 查询均完整、各命中 16，`done.data.value` 为排除 Appendix 的 15 条标题/链接对象，准备模型调用 12 次。但源结果 `output=null`、`sourceSuccess=false`，编译诊断含 `business_output_schema_not_proven`，准备 job 在 `exploring` 阶段 failed；没有 Plan/Chain/Release/Execution 成功事实。
- 这暴露两个待分开的通用边界：根 `array<object>` 的原生 done 到结果合同解包失败；完整 16 候选与业务筛出的 15 结果不可被简单“查询与最终数组完全同 ID/同数量”规则合并。已派定点调查；不能为通过而把 Appendix 写成固定网站例外、把 15 项硬编码进公共选择器或改写这条来源。首编译、样本、独立复验、手动发布、正式复跑及原窗口交付仍未测。

## 2026-09-26 第三条全新目录任务的首次 B-U 失败与删除产品样本

- 根数组 JSON 值适配经所属 Python 定点测试 1/1（对象列表、字符串列表、标量、`null`）和旧失败产物只读解码核验后，使用项目 `npm run dev` 的 checkout 身份守卫将 4173/4175 服务重启为 PID 7424；`/api/health` 显示当前根目录，Workbench 页面返回 200。第二条任务的失败记录未更改，16→15 筛选仍缺可复跑证据合同。
- 第三条普通任务 `43f3e9f1-7f27-4175-8a11-f45ed20484ed` 完全由正式工作台新建。用户请求按 Python 官方《Python 教程》目录页原顺序交付所有一级条目，包括编号章节和 Appendix，各有标题与完整链接，并在完成后保留原页。访谈自主搜索，Timeline 展示公开搜索和官方候选；来源题板选定 `https://docs.python.org/3/tutorial/index.html?utm_source=openai`。唯一 v1 草案在 UI 审阅并确认，明确 `记录列表`、来源入口、全 16 项范围和 `页面交付：保留现场`。正式画布的第一次生成 job 为 `14e5db31-389e-40f7-8dd5-fef51182ec77`。
- **首次 B-U 失败，尚未进入首编译。** 工作台显示“代表任务没有正常结束或输出不符合已确认合同”，来源 artifact `29fecd9f…` 与 job 失败状态保留；SQLite 只读核验 Plan、Chain、Release、Execution 均 0。原生 `done` 和两次完整 `find_elements` 各有 16 个含 Appendix 的有序记录；`sourceSuccess=false`，诊断包含 `collection_completion_evidence_missing` 和 `natural_field_read_evidence_missing`。定点调查发现记录投影在根数组 schema 没有可选 `maxItems` 时无法生成配对读；此外末尾 `scroll` 被自然编译识别为不能证明完成的动作。这些修复/核验另记，不能反算本任务首次通过，也未点击同版重新试做。首次编译、样本、独立复验、发布、正式复跑和原窗口交付仍未测。
- **对应的局部修复与限制**：未声明 `maxItems` 的合法动态记录列表使用 ReadSpec 已有 300 项读取上限，显式超限仍拒绝；宿主双快照容器摘要改用与原生查询相同的 backendNodeId 顺序；已观察到的 `scroll_position changed` 只编译为滚动物理后置条件，结果完成依旧需要独立 ReadSpec、装配和集合范围证据。纯 DOM/selector helper 拆到新模块，改动代码文件均不超过 500 行。所属 Python 测试分别 6/6、5/5、2/2；记录投影 14/15，唯一 `host_record_projection_ambiguous` 与原 HEAD 已复现的基线一致。旧 artifact 没有宿主双快照，离线不能证明修复后的来源或编译成功，第三条原失败继续保留。
- 在同一正式工作台对**仅由本轮创建的临时任务**验证永久删除：空任务 `e3c6355d-abea-4a60-8d80-e9a972ac59ed` 与有一轮访谈、搜索及待回答来源题板的任务 `b40077c3-4f00-40cb-a50f-eef9aaf9aabd` 均经“永久删除任务？”二次确认后从 UI 和 `/api/tasks` 消失。SQLite 所有含 `taskId` 的表对后者均为 0、`tasks` 行为 0，第三条失败任务仍存在；`data/pi-agent-session` 搜不到后者 UUID。此样本证明静止访谈任务的删除路径，含运行/Release/浏览器租约的正式删除及真实人工等待通知仍未做产品验收。

## 2026-09-26 第四条首次来源失败、第五条停在草案与提醒区收敛

- 第三条局部修复的受管 fork `--check` 通过后，使用同 checkout 守卫重启 4173/4175 为 PID 10564；API health 和 Workbench 均返回 200。第四条普通任务 `1e2f7df3-cf02-4734-bca4-d4cd4db4de34` 在正式 UI 自主搜索并确认 Python 官方目录页，唯一 v1 草案为全 16 条一级目录含 Appendix 的成对标题/链接列表与原页面交付；首次准备 job `85926371-d0d6-4c26-8e12-32350d25e7a0` 已失败，来源 artifact `50ba75fe-b83d-4536-807e-4a8ca683c4a1` 原样保留。
- 第四条来源的结构化输出是含 Appendix 的 16 条记录，三次完整稳定原生查询覆盖同一批 16 个 backend 节点；保存的 `sourceSuccess=false`，编译诊断仍有 `collection_completion_evidence_missing` 和 `natural_field_read_evidence_missing`，并引出结果装配/绑定缺口。宿主没有产生符合最终 schema 的可复跑配对 ReadSpec；本轮没有完成对该缺口的通用修复，也没有第二次试做。SQLite 该任务的 Plan、Chain、TaskDraft、Release、Execution 均 0；首次编译、样本、独立复验、发布、正式复跑与原窗口交付均未通过。
- 为单独核验后段产品门槛，正式 UI 又建立单页任务 `362d6fcb-fe53-4350-9e70-c87cdd998b7f`，需求是返回 Python 官方教程页面标题、完整网址并保留原页。访谈自主搜索，用户侧在中英文官方候选中选择英文页，唯一草案 v1 已确认。用户指出工作台提醒区严重遮挡主内容后，本任务停在草案审阅；SQLite 有草案 1、来源决议 1，准备 job/Release 均 0，**从未启动 B-U**。
- 用户指出跨任务提醒常驻卡片堆叠遮挡工作区后，移除了工作区上方整排卡片和“开启桌面提醒”入口。提醒现为顶栏小铃铛，点击才展开当前待处理任务并可跳转；侧栏状态保留，浏览器系统通知申请与推送代码已移除。Workbench `tsc --noEmit` 和定点 `git diff --check` 通过；正式 UI 核对常驻卡片 0、顶栏铃铛显示 2 项待处理、弹出菜单能列出对应任务、主工作区紧接 70px 顶栏。截图在忽略目录 `work/formal-acceptance/attention-compact-sidebar-after.png`。这只证明提醒布局收敛，不证明真实人工等待/通知的产品路径。
- **当前停止新增 B-U 试做。** 旧失败任务与 source、当前未确认的后续验收门均保留；不以第五条的草案、离线结果或局部 Runner 样本宣称一条正式任务一次通过。
## 2026-09-26 第四次断点定点修复与第六条新任务首次验收启动

- 当前仍为现有 `master@43ed385`（ahead 6），保留全部 dirty work，无 worktree/reset/clean/commit/push。用户切换开发模型后恢复修复；历史失败来源不改写。
- 第四条持久化来源的三个原生完整查询各有同序 16 项，`标题 ← text`、`链接 ← attribute_href` 为全列唯一对应。无模型现场诊断复现宿主投影缺口：旧 adapter 只遍历 `is_visible` 节点，且不利用原生集合身份，16 条只有 5 条能直接定位，其余为 `anchor_missing`（包含视口外条目和重复导航项）。旧 artifact 未保存冻结 DOM，不能把新诊断追认为旧快照的精确内容。
- 新 query/snapshot adapter 保留原始原生查询，借完整查询约束两次 extract 快照的 target、URL、有序 backend IDs 与全列字段值，复用既有结构 selector 和 ReadSpec；不猜字段、不筛记录、不固定条数。无模型真实页面中，新规则重读全部 16 条，逐项值/顺序及节点集合摘要完全一致。完整集合的 `requireComplete` 标记使预算超限明确失败，旧缺省规格摘要不变；另核验 actionRef 和 20,000 节点预算。
- 所属 Python 新验证 7/7（包括宿主来源到 compile_verified_read、输出装配）、增量溢出/兼容/错配验证 3/3；已有 host mapping 6/6、collection completion 5/5；API TypeScript 检查、Zod 新旧规格 roundtrip 均通过。只运行这些所属包定点检查。受管 fork setup 来源摘要 `d42a255a8e83dc6acf7e961c121c9ac254c0f14eae73cc7d660d99d7648980b4`。
- 提醒菜单继承 Radix 的固定行高造成两行文本重叠，现仅以局部 CSS 让条目自然增高并截断长标题。真实 UI 测得两个条目各约 54px，标题底部和说明顶部相隔 3px，无重叠；截图 `work/formal-acceptance/attention-menu-layout-fixed.png`。常驻卡片及系统桌面通知入口仍已移除。
- 第六条普通任务 `9644a3a9-351a-45d4-93ca-9a6bc26c5087` 完全从正式工作台新建：整理 Python 官方英文教程所有一级条目含附录、标题/完整链接、按页面顺序、保留原页面。访谈自主公开搜索，Timeline 与来源题板展示官方候选；来源与一级层级在 UI 选择，唯一草案 v1/revision 3 审阅确认，入口 `https://docs.python.org/3/tutorial/index.html`、动态记录列表及保留现场明确。无脚本改稿或 API 注入。
- 同 checkout 开发服务已加载修复，health PID 2724/root 核实。正式画布首次“生成草稿”创建唯一 prepare job `fcd7d36e-9528-4fbb-864e-302eeb3a9f7d`，当前运行中。首 B-U、首编译和后续验收结论将依真实结果追加，不能提前宣称通过。

### 第六条任务的首次结果交接失败

- 本次已失败，覆盖上段“运行中”的时点状态。owner `5d005582-76a8-4e1d-8aea-455e207b9357` 的追加式诊断证明：14:10:19 UTC 第 15 步 done 完成；14:10:35 复核与 Python author 完成；14:10:36 序列化、write 和 host receive 完成；14:10:37 host `author_result_schema_invalid`。API PID 2724 仍在，未发生 API 中断。
- SQLite 该任务没有来源 artifact、正式 execution，job 的 compilationCalls=0；不能断言 sourceSuccess 或首次 B-U 通过。首编译、样本、独立复验、发布、正式复跑、原窗口交付均未测。
- 旧日志没有 Zod 具体 issue，临时原生历史也没有保存，精确字段子因未知。新 ReadSpec/root-array 的合成完整编译响应通过 TS 合同；这只是排除性诊断，不是这条真实来源的通过证据。
- 修复接收证据丢失：Runner 响应在关闭/严格准入前保存任务私有 received-source/v1，状态 unverified；source/v2、候选和运行路径不接受它。协议拒绝日志只记限额内固定 code/path，动态字段名脱敏，不记页面值或异常正文。新增失败路径测试 1/1、诊断测试 2/2、API TypeScript 通过。旧第六条记录不能事后补造来源。

### 第六条任务后续同版 job 的证据边界

- 首次 job `fcd7d36e-9528-4fbb-864e-302eeb3a9f7d` 的持久事实仍是 schema 拒绝、来源 artifact 0、compilationCalls=0；上面的接收产物与字段诊断修复只能帮助后续定位，精确 schema 字段子因仍未知。当前同版第二次 job `3be09da7…` 在 exploring，仅作协议诊断；它的后续结果须独立记录，不能倒填首次来源，也不能算这条任务首次 B-U 或首编译一次通过。协议失败提示已改为固定文案，避免把这类失败误导为直接重试，所属文案测试 1/1 通过；它不修复结果 schema。
- 当前门槛及局部验证见 [ROADMAP 当前门表](ROADMAP.md#当前阶段全新任务首次门槛仍未通过正式交付验收待完成)：需求阶段已有正式 UI 事实，完整查询到宿主双快照投影、提醒菜单、Windows 原窗口 Runner 和静止访谈任务删除各有局部样本；本轮全新任务的首编译、样本、独立复验、发布、正式复跑、真实人工等待、含 Release 删除与原窗口正式交付仍未通过。

## 2026-09-27 显式读取方法引用的局部修复

- 旧第五次来源 `sourceSuccess=true` 与 `repeat_annotation_read_method_mismatch` 的事实保留；首次规格 `normalizeWhitespace=true`、第二次缺省 false 不能视为等价。本轮没有改写旧来源，也没有新浏览器/模型试做。
- `bat_read_fields` 首次全量参数保持兼容；后续可仅提交 `{ "readRef": "r1" }`。Pydantic 参数验证拒绝空引用、混用任何覆盖参数，序列化只产生引用字段。宿主从当前工具自己登记的成功记录深拷贝全部 ReadSpec/outputPath/readPath/预算；每次成功读取仍返回独立新 readRef 和当前页样本，失败不登记。
- capture 将精确引用对应到同 owner 的更早成功记录，保留原生引用参数。自然编译沿同一 trace 中严格更早的成功方法逐级核验 action/pre/post/resultDigest、完整 ReadSpec 与路径，直到首个完整方法参数；没有放宽规格相等，也没有新 fact 字段、读取器或控制循环。
- 最小验证首次通过：新增 `test_method_read_reference` 5 项与原始方法参数 roundtrip 1 项，6/6。为补足真实生产入口，把其共用 helper 升级为 Browser-Use `Tools.registry.execute_action → ActionRegistry.validate_action/model_dump → EvidenceCollector.field_read_facts → normalize_history → natural_compilation_request → compile_request`，只重跑受影响 3 项，3/3。无本轮首次测试失败；原产品来源失败仍独立保留。
- 生产链样本证明 r1 → r2 → r3 原生参数仅含引用、normalizeWhitespace=true/maxItems=120 完整保留、3 个读取段自然编译零 gaps且未更改原 trace；混参、不存在引用、失败方法引用、跨记录集引用、前向引用及规格篡改拒绝。采样读取被 mock，本证据是离线生产消费验证，不代表真实页面或产品闭环。未运行全量、根级、API check 或浏览器/模型验收。
- 来源摘要验证补记：root 的首次 `verifyForkSource` 失败为 `workflow_fork_source_mismatch:workflows/workflow_use/hybrid/natural_reads.py`。原因是本轮 manifest 更新误按文件原始 CRLF 字节计算，而既有 verify-source.mjs 按 LF 规范化；未改动源码来迎合摘要。按现有规则只重算本轮 5 条后，`verifyForkSource(process.cwd())` 通过，摘要 `8ed51f1bd90a5f6e546c3d7e6ef6b5ddcbc5f1b8f3711568d3982c7ea4ae335f`。此失败独立于前述 6/6 与 3/3 功能验证保留。

## 2026-09-27 G6 首次根数组路径失败的最小修复

- 原正式 job `b779c791-7719-44ea-88b0-016f83ed7d92` 的首次失败与来源保留。定位为真实输出合同是根记录数组，而 Browser-Use 结构化响应模型显示 value 包装；模型连续提交 outputPath=['value'] 或 ['value',0]，宿主按真实合同拒绝为 natural_read_output_path_invalid。
- 工具注册现在从真实根数组合同生成 outputPath 的 description/examples=[[]]，工具说明同步明确 outputPath=[]；错误反馈追加固定安全解释，说明 value 属于响应包装。保持显式参数、严格校验与原业务 schema；没有默认改写错误路径、页面猜测、自动重试或新循环。
- 新增所属 `test_method_root_array_path` 首次 2/2 通过（0.190s）。真实 output_model_for 包装仍存在；真实 Browser-Use Tools 执行两个包装路径都在采样前拒绝（sampler=0、records=0），随后显式 [] 与 readRef 通过 ActionRegistry/model_dump、Tools 和 EvidenceCollector，canonical args 保持原样、方法/预算完全相同。仅 mock 采样，不是浏览器或产品验收。
- 只更新本轮 2 个 vendor 条目的 LF 规范摘要；未跑旧测试组、根级、API check、浏览器或模型。后续同任务显式重新试做与首次失败分开记录。
