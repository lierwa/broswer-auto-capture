# B-A-T 主流程反复失败：根因、证据与未关闭项

> **2026-10-12 最新结算**：后台连接无页连接/重连已验证；通用报告读取纠错修复并验证后，冻结 1222 代码配置，全新 task c52e7dc3 从首次需求、准备、样本与独立复验、发布 V1 到首次正式复跑 43e68dd4 全部完成。普通执行模型 0，正式报告 Human/39 clear/四 Worker 有效且 39 项数据完整取得；冻结期无改码/改盾，历史首败保留，临时资源永久清理。Chrome 3 项扩展损坏禁用副作用仍单列未关闭。以[本轮结算](BAT_BACKGROUND_CONNECTION_AND_MAINFLOW_20261012.md)和 PROGRESS 顶部为准，下方为历史。


> **2026-10-12 最新断点**：后台连接已复用 BrowserSkill 验证，首次授权/暂停/无 tab 连接与重连保留。第一次新任务在结果读取失败，原首败保留；用户明确获取最终报告本属任务，不能删输出求通过。通用容器范围纠错已完成 25 项聚焦和真实模型一次纠错/普通执行器变数据复读，重新冻结 1222 代码配置，task c52e7dc3 / prepare f30381b5 正在首次准备。见[本轮记录](BAT_BACKGROUND_CONNECTION_AND_MAINFLOW_20261012.md)，优先于下方历史。


## 2026-10-11 当前：巡检阻塞已修复验证，连接页依赖尚未移除

第四次冻结新任务80b3f4d5 / 首次准备bef81e57在连接阶段失败，0动作/0准备模型/0发布/0正式复跑；1204代码配置不变，原失败保留。已查实后台每15秒两次全量读取444,623,701字符历史execution，92秒CPU采样约28秒耗在此路径。改用SQLite部分索引和小资源字段投影，3项定点通过；实际原库候选查询1.35ms，跨两轮巡检170次API请求0失败、最长85.8ms。API类型检查仅3项已确认盾基线错误，不改盾。该证据证明周期性阻塞及其修复，不补造原连接失败时不存在的时序。正常开发入口恢复，4173/4175同PID25796。

用户追问连接tab：已确认Playwright建立连接时通过connect.html把临时relay地址交给扩展，之前仅连后关页；BrowserSkill固定3f10983c由扩展后台连接，不需要此页。BrowserSkill RPC与B-U CDP并非同协议，尚未实现页面无关的生产接入，不新造第二套CDP网关，不把研究或诊断复连算修好。继续主线须先解决此入口并验证，再冻结新建任务，不在测试中改码。

本轮辅助Chrome28096已关闭、frozen-fresh-04/workbench-profile已永久删除；空task1770585a核验无turn/job/execution/release/artifact/draft后由产品DELETE删除。资源查询测试临时目录由finally删除；开发inspector随旧宿主退出。历史失败/原报告和诊断证据保留，证据root-cause-05。主流程仍未通过，不提交/推送/worktree/关机。


## 最新：字段读取纠错修复后第四次冻结验收进行中

第三次 task fb0464a9 首次准备失败，1202文件前后不变，导航、交互、提交和cleanup confirmed；盾8f4d6ef7为Bot/38clear+1输入来源flag，四Worker有效。a2原生输入出现非可信input/change，是本次真实检测事实，不能用后续成功覆盖。失败阻塞在bat_read_fields：当前工具误暴露captureContent；container-only被旧兼容解析接收，但结构化合同拒绝，只反馈natural_read_schema_mismatch，模型无法定位合同字段和参数形式错误。正确字段曾到达DOM读取并明确报链接匹配2个，证明并非数组读取能力不存在。

最小修复：当前模型schema隐藏内部captureContent；错误反馈复用原schema_at_path/_read_shape和FieldReadError，返回实际合同路径/必填与允许字段/缺失字段/错误字段数量/类型/精确改法，保留匹配数；不含页面值或selector，不放宽校验、不添加模型循环。旧错误处理迁至method_read_diagnostics.py以满足500行。4新增、14方法、5引用检查通过；旧根数组2个测试在保存的修复前原模块同样失败，仍按旧的模型填写outputPath/maxItems协议断言。真实已保存gpt-6-luna同配置一次纠正container-only，严格映射通过；证据root-cause-03/read-correction-*.json。

第四次任务80b3f4d5首次需求对话b78dc5a1成功并确认；prepare bef81e57开始。fork835976b3、1204代码配置冻结，不能在此任务中改码。此前所有首败保留。

## 继续调查与修复：root-cause-03

本节覆盖下方上一轮“未修/未知”的当前实施状态，历史原证据保持。

- 完整 Python 原生七步、采集、编译与最终关闭：无页面失败，关闭 53.78ms；真实 RunnerProcess 管道、在线 ACK、AuthoringBuild + SQLite、关闭协议：无页面失败，关闭总计 1123ms、confirmed。都停止在提交前，均不作为主流程验收。
- 找到共享宿主线程的具体阻塞源：任务列表 TaskSummaryProjector 用全库 revision 使所有任务缓存随任何进度写入失效。实际旧任务最新 execution body 113649995 字符，列表 cold 3924ms、unchanged 63ms、模拟无关提交后 3805ms；CPU profile 显示主要在同步 SQLite get/JSON decode。更改为既有 taskWorkspaceSequences 后同数据无关写入 98ms（旧任务命中 0.33ms）。冷读仍有大记录开销，未扩展为全量数据迁移。
- R2 已修：只在真实 ActionDispatchAudit 证明 navigate 已派发、尚未返回时，健康查询沿用 B-U 原生方法，不登记可供后续索引动作使用的观察；动作前、动作后采集、所有权和安全拒绝保持。
- R3 已修：最终关闭等待后仍交付已保存来源，业务判定错误穿过 withAuthoring；外层清理用 RuntimeCleanupRequiredError 独立持有主结果。清理不再冒充启动失败或要求重新执行。
- 验证：新增失败反例先在旧码失败（TS 3、Python 1），修后摘要+关闭+分类 10 项、在线编译 5 项通过；Python 18 项通过。旧 test_changed_document_remains_fatal 期望与先前已采用的同 tab 重观察契约冲突，用 SHA256 与第二次冻结逐字一致的模块对照复现，保留基线。API 类型检查仍只有盾既有 3 项，不改盾。
- 诊断四 owner 均 ended，CDP 确认所属 targets 不存在；Python 0；五个 owned 目录已永久删除，证据 owned-resource-verification.json / owned-directory-cleanup.json。
- 第三次冻结：1202 文件，受管源码 185098c226a0de2c956fd613160e920c3be17155e75666f943d67b071dbe10ba；新 task fb0464a9-3e02-4e0f-9c0e-8df90e56be6c 已从真实 Workbench 提交需求，尚未得出验收结论。

历史页断连与 5 秒清理超时缺少当时客户端/关闭子阶段采样；本次已证明共用主线程阻塞缺陷及修后性能改善，不能把缺失的历史采样写成已观测事实。后续以冻结新任务的真实完整运行判定是否闭环，不复写前两次首败。

日期：2026-10-11。当前 checkout master@5ac7f8f1748955779446937f8491a01dc6be054f。已有 dirty work 保留。用户最新要求查清反复失败的根因；本轮冻结后没有修改生产代码、测试、配置或盾，没有新建 Git worktree、提交、推送或关机。

## 当前结论

完整主流程仍未验收通过。不能用旧任务补救后的发布与复跑成功，代替冻结代码后的全新任务首跑。

已证明的共同问题是 B-A-T 自有适配层没有一致地区分：探索历史与最终有效缺口、动作已经派发与观察需要刷新、业务结果与资源清理结果。准备入口和离线恢复入口经过的校验也不同，此前验证没有覆盖这些真实组合。它们不是换一个网站才产生的业务特殊情况，也不能归因于 LLM 笨。

这不等于所有随机现象已有唯一解释：原页面中途连接失败，以及原次关闭为何超过 5 秒，仍缺当时的客户端/清理子阶段时序。下文明确保留，不能据后续阴性诊断关闭。

## 三次主流程的真实区别

| 任务 | 实际结果 | 所能证明与不能证明 |
| --- | --- | --- |
| 6088126d 原任务 | 多次修复后，复用保存来源离线编译，随后完成验证、发布 V1 和普通复跑 | 证明那条已发布链可运行；未证明新需求经过在线收尾必然成功。最早两次 Worker 不可测仍保留。 |
| 48c3061d 冻结首跑 1 | 真实探索完成、最终编译 gaps=0；宿主 finish 拒绝，未发布 | 明确暴露在线收尾读取旧 sourceGaps 的错误。盾代表执行 Human 不等于 B-A-T 主流程通过。 |
| 4bef5468 冻结首跑 2 | 需求对话确认；首次准备 ead62058 失败，未发布、未正式复跑 | 第一导航被记失败；后续输入/滚动发生；页面连接失败后 done success=false；继而清理超时掩盖原错。此轮根本没有到达已修的 final finish。 |

## R1 已证明：在线收尾读取了错误的事实源（已修、已局部验证）

第一冻结任务已保存最终编译且 compilation.gaps=[]。两个没有消费者的探查历史缺口已由编译器合法退休，但 AuthoringBuild.finish 又用原始 sourceGaps.length 拒绝。

责任：B-A-T 校验逻辑。此前只补编译器退休规则，漏了在线宿主收尾。旧任务通过离线来源恢复完成，没覆盖同一个在线 finish 门；不能把这个通过外推为完整新任务通过。

本轮冻结前只将 finish 条件改为已校验保存的 final compilation.gaps，同时保留 final 存在、canonicalRequest 一致性和真实未解决缺口拒绝。真实 Python→宿主→ACK/SQLite→候选的修前失败和修后正反例已完成，在线 5/5、探查生命周期 2/2。详见 BAT_ONLINE_FINISH_REPAIR_CLOSEOUT_20261011.md。

## R2 已证明：动作后的导航健康检查被动作前观察规则误伤（尚未修）

现场链条：

1. a-0001 的 native_action_dispatch 为 entered=true、resultReceived=true，实际派发 URL 就是计划入口；服务端收到访问并创建随机子域页面。
2. 固定 browser-use Tools.navigate 已等待导航事件，随后在 tools/service.py:523 调用 get_browser_state_summary 做页面健康检查。
3. B-A-T SourceObservationScope.start 在 observation_scope.py:109–115 包装了整个 Browser 实例的 get_browser_state_summary；所有调用都走 capture，默认 allow_transition=false，未区分模型决策前读取与 native navigate 内部的动作后读取。
4. 此刻同一 owned target 从入口页面切到随机子域。保存诊断明确为 changed_during_capture / sample_after，before/after target 相同、URL 摘要变化。
5. 包装器抛 ObservationRefreshRequired(action_withheld=false)。原生 navigate 捕获它，返回 Navigation failed。后续页面已稳定、英文输入/中文输入/滚动都成功，原 navigate 的 failed 回执仍保留，编译器因此正确拒绝将其当成功动作发布。

责任：B-A-T 适配器把“不能把跨文档混合快照给模型”扩大成“导航已经成功后，只要健康检查碰到正常过渡，就把动作判失败”。这不是计划 URL 与落地 URL 相等判断；上一轮只修编译层导航合同，所以没有覆盖这个更早的原生动作调用路径。

通用修复不变量：旧观察不能驱动索引动作、越权导航仍拒绝；动作派发事实与其后观察稳定性分开。只在确实需要模型重新决策的边界要求刷新，不能将原生动作内部读取无差别套入这个规则，不能自动重放导航。必须用原生 navigate 调用链的受控跳转反例验证，不能只给编译器构造 succeeded 回执。

## R3 已证明：清理与业务错误串在一起，错误又被误映射（尚未修）

现场原始 source 已保留，trace.completed=false，done success=false，无提交动作、业务输出为空。最后一个源码步骤的 session.author 在返回该结果前执行 runner.close。

- apps/api/src/upstream-browser/hybrid-exploration.ts:151–153 在清理未确认时抛普通 Error(upstream_runner_cleanup_unconfirmed)，业务调用方因此拿不到返回值去检查 sourceSuccess。
- apps/api/src/task-chain/authoring.ts:279 在 withAuthoring 工作回调内捕获错误而不向生命周期层重抛，外层记录 primary.status=completed；随后外层又拿到同一缓存的清理失败，合成 hybrid_source_and_cleanup_failed。
- authoring-failure.ts 先展开 AggregateError 的第一个错误，再用 /upstream_runner_|upstream_protocol_/ 统一映射成“运行环境未能启动、页面操作前停止”，真正 cleanup 分支排在后面。这与已经发生的输入和滚动矛盾。

已通过真实生产函数做离线确定性复现：failure_mapping_probe.mjs / failure-mapping.json。实际 AggregateError 和单独 cleanup Error 均输出错误的启动前提示；source-only 则能输出代表试做未完成。没有调用模型或浏览器。

责任：B-A-T 生命周期结果传递和错误分类，不能只换一条文案。最小修复应将已保存来源/业务失败与 cleanup report 分开传递，生命周期捕获原主错误，按明确阶段和结构化错误分类；清理恢复只核验/回收本 owner 的资源，不让用户为收尾重新跑业务，不用普通节点模型修复。

## R4 已证明：验收路径和观测范围不足，导致局部修好后下一个边界再失败

- 原任务的离线恢复绕过现场在线 finish；旧链复跑不经过需求访谈、探索回调、在线终态。它们不能覆盖全新任务入口。
- 导航编译验证使用已有原生回执，不覆盖原生 navigate 健康检查再次调用被包装 observation 的时机。
- 清理有总结果但没有逐个内部 await 的耗时和停止点。service.ts:205 丢弃子进程 stdout/stderr，部分 Python _cleanup_error 只写 stderr；固定安全诊断通道只保存有限阶段，所需细节未留下。
- 当前对本次已证明的字段和分层错误可做确定性验证；对历史传输超时，缺证据就不能编造唯一根因，更不能用一次绿色复跑代替。

工程责任在开发和验收：之前把修复后补救任务的成功当作整体稳定证据，没有按同一冻结版本、全新任务入口核验。当前两次冻结首次失败均保留，不计为通过。

## U1 未关闭：原次检测页连接失败的具体客户端异常

首败盾 case 8c2da2f5-8f00-42fe-b1e8-09f72a31ba77、page 986ccf25-b7a5-4f23-9e47-3e064f4892b1。原报告 pending / waiting_interaction，无 flow；四项 Worker 有效 clear，38 clear + 1 flagged 节奏参考。原引擎 challenge 与保护请求接受、score=0、非 allowlist。

14 个遥测批次均为同一 page、submitted=false；最后有英文 22 字母/28 input、中文 8 字/9 input、scrolled=true。没有点击提交。68 条相关访问：52×200、1×201、14×202、1×404；36 次 report GET 全部 200，服务端耗时 3.7–16ms。报告最后一次成功 GET 在 13:07:45.114Z，此后前端停止轮询，但遥测仍到达。服务端健康状态 measured、transportFailed=false。前端确实显示“测量连接失败”，不能把服务端健康当成前端没问题。

原 check.js 在 report 请求/解码/结构错误或 bat:measurement-error 时锁定 failed；collector.js 遥测 fetch 有 10 秒 AbortSignal，任何异常都会发 measurement-error。原任务没有保存客户端 Network.loadingFailed、具体 fetch 异常、请求暂停至放行的对应时序，不能唯一分辨哪条路径。

只读与有界诊断（均为冻结代码，不是主流程验收，不提交检测，不调用模型）：

| 诊断 | 结果 | 结论边界 |
| --- | --- | --- |
| 实际存储函数，临时 SQLite，24 组串行与 4 线程并发 | 串行合计 311ms，并发合计 125ms，最慢 remember 25.52ms | 不支持普通单次 Cache 初始化必然造成 10 秒停顿；不否定历史锁竞争可能性。 |
| 原 1.2MB 在线编译包走生产 TS 解析/源校验/物化 | 五部分合计约 414ms | 不包含整个现场回调、保存 ACK 和活浏览器观察；不能代替完整主流程性能证明。 |
| 原来源走真实 Python prefix 编译与序列化 | 解析约 39ms，prefix 106ms，envelope 24ms，canonical 34ms | 未复现十几秒同步编译阻塞。 |
| 通用本地轮询页 + 原 daily 连接 + 页面观察 | 11 次轮询约 21–27ms，无失败、无明显事件循环停顿；关闭 29.18ms | 排除连接链在所有页面都必然慢。 |
| 原检测页静置 + 原生/包装观察，共 6 次 | 前端未失败；一次 Page.captureScreenshot 等 5677ms、对应观察 6132ms；关闭 44.64ms | 抓到浏览器侧等待，但没有重现原次断连，不能声称它就是原次唯一原因。 |
| 原检测页 + 原生英文/中文输入/滚动 + 包装观察 | 三动作均返回成功、telemetry measured、前端未失败；关闭 47.15ms | 只隔离输入条件，不含 Agent/在线回调全链，也未提交；不能算完整检测通过。 |

最后两项诊断各只执行一次不同条件，没有无变化重跑完整任务。下一条有判别力的证据须覆盖真实 authoring 回调与传输：同 owner/target/session/request 的 request→paused→continue→response/loadingFailed 时间、事件循环停顿及安全异常类别。记录必须脱敏，不捕获 Cookie、正文或认证请求体。没有这些证据，不修改盾超时、不提高通过阈值、不删检测。

## U2 未关闭：原次清理内部慢点

首败宿主在 13:10:47.004Z 收到 author 响应，lease 在 13:10:55.628Z 已为 ended；13:10:57.226Z runtime_outcome 留下 cleanup_close_protocol_timeout、activeResources=false。宿主 close protocol 默认 5 秒，再等 child exit；因此“回执未在预算内收到”和“资源最终还活着”是两个不同事实。原 owner 已关闭、原 target 已消失，并非仍留下浏览器。

浏览器关闭包含 owned targets、TargetScope 的 detach 确认、SDK stop 等多个阶段，组合预算与宿主 5 秒并不统一。但本轮三次孤立关闭仅 29–47ms，原次缺子阶段耗时，不能声称一定卡在某个 await，不能用直接调大超时冒充根因修复。

## 旧 Worker 两次不可测

历史首次失败不关闭。此前真实采样已抓到 CDP 接收回调同步开写 diskcache；固定 4 秒慢存储时，真实 Worker 修前约 3006ms unavailable，改用既有异步响应准入后约 145ms measured。这个 B-A-T 缺陷已证明并修复；历史两次没有当时客户端栈，不能唯一证明它们都是同一锁等待。详见 BAT_WORKER_UNAVAILABLE_INVESTIGATION_20261011.md。

## 冻结与资源结算

1201 份代码/配置在冻结前后 SHA256 一致，文件集合没有新增或缺失，见 code-freeze-investigation.json。首败 task/job/source、盾原报告及界面截图均保留，发布数 0、正式执行数 0。本轮只新增/更新文档和忽略目录里的诊断证据。

原准备 owner 6d6e5412 已 ended、所属 target 经 CDP 核验不存在；辅助 Chrome PID21952 退出 0，workbench-profile 永久删除。本轮两个测试 pyc 已精确删除。

新增诊断 owner c00550fd、8b562afc、2d141a02 均沿 finally 关闭；lease ended、各 owned target 经 CDP 只读核验不存在，Python 进程为 0，诊断监听端口 61114/62815/54648 为 0。三个精确诊断临时目录均永久删除（不是回收站）；保存脱敏清理回执 diagnostic-resource-verification.json、diagnostic-cleanup.json。存储诊断 TemporaryDirectory 已删除。用户原 Chrome 和工作台服务保留。

## 下一步的关闭条件

1. 分别关闭 R2 的原生导航观察语义和 R3 的来源/清理结果传递；用真实调用边界及正反例验证，不增加站点特判或全局完成 judge。
2. 对 U1/U2 补齐现有安全诊断通道中的阶段与时序后，只执行一次有明确判别条件的受控复现；未证实前不凭猜测修改网络控制或盾。
3. 上述修复和聚焦验证完成后重新建立代码冻结，再创建全新需求走发布与正式复跑。该验证期间零改码、保留首次失败、独立核验盾报告与资源清理。旧任务、离线恢复、诊断动作成功都不能替代此门。

证据目录：work/bat-shield-mainflow-20261011/frozen-fresh-02；本轮根因诊断在其 root-cause 子目录。修复证据在 finish-repair-02。所有未证实项保持未关闭，不宣称系统稳定或本次主线通过。
