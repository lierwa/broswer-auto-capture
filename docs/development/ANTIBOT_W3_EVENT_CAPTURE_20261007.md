# W3：动作采集的额外暴露与最小修正

2026-10-07 起，2026-10-08 更新；master@4304981 工作区。**当前状态：W3 最小补丁完成受控验收，实际 daily 的 fpscanner 与独立 Brotector 前后三轮均确认改善；既有准备、发布、动态复跑通过。** 完整范围、历史首败和未测项见文末“W3 受控范围验收”；常驻生产 API 未重启，不把独立宿主验证说成正在运行的服务已加载新代码。

## 纠正范围与优先级

只读 SQLite 核对：全局 browserSettings 为 daily、revision=55。此前六组均使用新建专属测试 Profile，没有覆盖 daily 扩展连接；webdriver 阳性不能代表用户实际选择的运行模式。此前将 M0 结算后结束开发、优先提出只影响 dedicated 的启动参数修正，偏离了继续改造实际使用路径的要求。历史原始证据保留，结论收窄。

现有新增 CDP 信号只定位到 Runner 整体，不能仅凭它断言某个调用是根因。本轮先验证两种模式共用的 NativeEventCapture：它启用共享会话 Runtime 事件流并把绑定和状态放进页面主上下文。只改这一处，保留 B-U 原生动作、来源采集、目标命中证明和生命周期。

## Product Alignment

```text
Product Alignment:
- natural-language task: 在列表选择与表单输入中保持真实动作证据，减少任务采集自身对网页环境的扰动。
- reusable chain boundary: 既有探索和普通复跑共用的单动作事件关联。
- runtime inputs: 原生动作、已解析目标和现有 BrowserSession。
- dynamic task outputs: 原有事件/目标证据与业务输出，不改公共合同。
- generic platform capability used: browser-use/cdp-use 原生会话及 Chromium isolated world。
- replay model calls: 0。
- site/task-specific code added: no。
```

## Reuse Assessment

```text
Reuse Assessment:
- capability: 将既有事件采集放入浏览器隔离上下文，并按动作启用。
- existing implementation in repository: NativeEventCapture、B-U BrowserSession/Element、cdp-use 1.4.5。
- mature candidates and pinned versions: B-U 0.13.8 eb4126921bea3373f91afc49fb4b59d6eda7fed6；本机 Chrome 154.0.8037.98；CDP d209a9a38897d2935a078a0bf00ca821811d21ed；V8 b366c80c3432717e64f3ec15cfe210ed731e76ab。
- selected implementation: 复用 Chromium Page.createIsolatedWorld / Runtime.addBinding 的公开接口；保留现有采集 payload。
- reused public surface: Page.getFrameTree/createIsolatedWorld、Runtime.addBinding/evaluate/callFunctionOn、DOM.resolveNode；B-U Element.get_basic_info。
- B-A-T-owned adapter and remaining gap: 既有事件桥的上下文选择、真实 frame/context 关联、目标对象跨上下文解析、收尾；不建新控制器或上下文框架。
- license/runtime/platform fit: 既有 Chromium/B-U/cdp-use，无新增依赖；Windows 无界面本地组件先验。
- browser/runtime/state ownership conflicts: 复用已有 CDP client/授权 target，不启停共享 Runtime 事件订阅；只清理自己创建的绑定/监听。
- replay model calls: 0。
- rejected candidates and evidence: 单纯删除 Runtime.enable 会丢 executionContextCreated 来源及跨文档绑定；全局 Runtime.disable 会干扰共享客户端，V8 源码还显示会清除持久绑定。替换 B-U 或另接 Playwright 不符合既有职责。
- focused validation: 先复现旧代码主上下文暴露/CDP 命中；再验证真实 click/input、frame 身份、导航重装、关闭后无监听；headless 不作为 daily 或人工对照结论。
```

源码：[V8 Runtime 绑定/enable/disable](https://github.com/v8/v8/blob/b366c80c3432717e64f3ec15cfe210ed731e76ab/src/inspector/v8-runtime-agent-impl.cc)、[CDP Page/DOM 协议](https://github.com/ChromeDevTools/devtools-protocol/blob/d209a9a38897d2935a078a0bf00ca821811d21ed/json/browser_protocol.json)、[B-U Element](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/actor/element.py)。V8 当前固定源码用于核验机制；本机行为另测，不把它当作本机 Chrome 的精确 V8 revision。

## 修改前登记的验收

- E06：同一无界面宿主配置、固定 fpscanner、独立新文档；旧采集若 hasCDP=true，候选预期 false。没有原正例则不能认定改善。禁止改探针/伪造字段。
- E04：页面主上下文无法枚举本次采集 binding/state；动作仍产生 trusted 事件，frame/document/target 关联有效。
- 业务：真实点击和输入、导航后第二次采集、同进程 iframe 与开放 shadow DOM，动作间不继续采集；失败保持失败，不用降级证明放行。
- 收尾：仅关闭验证器拥有的 headless 进程，精确临时 Profile 验证后永久删除。
- 实施前未测边界：daily 扩展实际路由、跨进程 iframe、独立检测器、完整发布链、网络/TLS/挑战。跨进程 iframe 后续组件证据见下；其余仍未验收。先完成具体补丁和组件证据，再安排日常浏览器的局部测试；不得自行批量弹窗。

## 首个单变量结果与追加定位

旧代码 `capture-uc4oit9p`：主上下文两个内部对象、CDP=true，点击/输入/导航成功，但部分 frame 身份缺失。仅隔离事件采集后的 `capture-bo2ee9gk`：主上下文对象消除、frame 身份完整，CDP 仍 true。保留这次效果失败，不声称移除一个 Runtime.enable 已修好 CDP。

进一步核验固定 [B-U Page](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/actor/page.py)：`get_current_page` 返回未绑定 session 的 Actor Page，首次使用会重新 attach 并启用 Runtime。`Page(browser_session, target_id, session_id=...)` 已公开支持复用现有 session。最小后续适配只通过该构造参数复用 B-U SessionManager 的有效会话；不补丁依赖包、不复制 Page/Element 方法，不屏蔽 CDP 命令，不改网页属性。落在既有浏览器构造处，共用于 daily/managed 和探索/复跑。

## 当前证据与失败记录

- `capture-sprmxki1` 首次通过 E04/E06 及点击/输入/导航；后来 `capture-ykx3zjbd` 补同进程 iframe、开放 shadow、idle 监听关闭；最终 `capture-58oz89_x` 再补真实 isolated world 关闭后 binding/state 均 undefined。均只访问本地页面，无模型。旧基线不是这几次候选的新人工参考。
- 后续 `capture-j7rsgngw` 加入 127.0.0.1→localhost 的真实跨进程 iframe：断言 target 与主页面不同，原生点击、对应 target/frame、闲时停止均通过。安装时按 B-U get_all_frames 返回的真实 frameTargetId 选择所属 session。前一次新增测试错误地尝试读取导航已销毁的旧 OOPIF session，记录在 capture-candidate-v5.log；改为核验当前存活文档后通过，未忽略产品动作失败。
- `run-EJ3HjO`：完整 TS Runner→Python→B-U→普通能力，无界面三轮均选对，hasCDP observed/false，webdriver observed/true；零模型，每轮三命令，原清理审计 confirmed/activeResources=false。这个显示模式不同于先前可见样本，不将两者直接算成三组成对效果。
- 初次新测试因制品文件名写错在启动前失败；后续 fixture 的 B-U evaluate 格式、默认导出和布尔序列化先后修正。日志 `capture-baseline*.log` 保留，不当作检测/产品失败。真正旧产品负例是 `capture-uc4oit9p`；仅隔离采集的候选 `capture-bo2ee9gk` 是真实目标未达成。
- `test_window_replay.py` 11 项：8 passed、3 failed；只恢复 Browser 导入为原实现后，同三项仍失败，`window-baseline.log` 保留。失败涉及旧测试预期 busy / lease_changed / create_unconfirmed，与本轮仅更换构造类的差异独立。
- `test_interference_browser.py`：候选和 4304981 原采集器+原 Browser 均在最后断言失败：预期 ordinary_scroll_event_cancelled，实际 scroll_event_cancelled。此前 dialog/DOM 命中/正常滚动/CSS 限制断言已执行；不把整文件写成通过。两份 interference 日志保留，不改无关错误协议或放宽测试掩盖失败。
- API 包类型检查通过；补充跨进程 frame 归属后的 workflow-use 受管源摘要校验通过（`d50984bdce8fc76d2c683b70c562d418c476f3ccd464606c24db773d41e2e551`）。代码文件/函数行数检查符合限制，未执行根级/全量测试。
- 本轮十一个 `capture-*` 目录各有 closed 收据且 profile 已永久删除；三份 Runner Profile 亦删除。只读进程核验 M0 Chrome 0，61046 无监听。保留小型结果/日志与固定制品于忽略的 work，不写原始指纹进 Git。没有回收站操作。

## 已准备的 daily 前后对照

`apps/api/tests/antibot-daily.acceptance.ts --daily-visible-session --variant=reference|candidate` 复用产品 DailyChromeExtension 原授权、owner-scoped relay 和 RunnerProcess。前后各一任务窗口，每窗口三个新文档；借用真实日常 Chrome，不新建/迁移个人 Profile。开始前要求生产扩展连接未占用；完成只清理本次 owner 和 relay。需安排可见时段后才执行。

参考入口 `reference_runner.py` 在独立测试进程读取固定 4304981 的旧事件采集器，恢复 B-U 原 Browser，保留同一现行 Runner 协议；既不修改产品文件也不补丁 site-packages。候选走正常产品 Runner。两组同本机、同个人 Profile、同 Chrome，仍须记录持久会话与跨文档边界；人工/独立探针/完整 TaskRun 未通过之前不能宣称全部效果验收完成。

## 2026-10-08：daily 首败与离线修复边界

实际 daily 参考 `daily-reference-p62qNs` 三轮业务通过，webdriver=false、CDP=true，九命令/零模型，清理 confirmed。候选 `daily-candidate-KWwbEI` 首次点击失败；测试宿主只保存 Error 类型，诊断不足。补上现有 fd4 固定诊断及 actionRef 后，`daily-candidate-hZmIFH` 定位到 TargetResolver._resolve_index 的 missing_stable_target，尚未进入事件采集或动作派发。之前口头将位置直接归为事件采集，证据不足，予以纠正。

补 DOM.enable 的试验 `daily-candidate-0SmotX` 仍失败，十二次目标解析记录的 mappingSize 均为 0；这次试验无效，不保留额外初始化。无界面 `capture-7rem4vnu` 成功不能覆盖这一 daily 失败。三次候选失败和参考各自保留收尾收据，未删除个人 Profile。

进一步源码链：B-U 0.13.8 get_current_page_url 消费 SessionManager 的 URL 缓存；DOMWatchdog 遇 about:blank 会直接返回空 selector map。daily BrowserModel 的 _currentTargetInfo 虽返回真实新 URL，却只更新 relay 私有快照，没有发 Target.targetInfoChanged 给 SDK；原 Actor 的重复 attach 过去间接刷新了 SDK 缓存。取消重复 attach 后这个缺口暴露。先以不启动浏览器的协议回归复现“查询已是新 URL，SDK 订阅仍停在旧 URL”，再补齐已有 Target 事实的事件映射；真实 daily 候选仍须复测，不能提前结算通过。

```text
Reuse Assessment:
- capability: daily 已有目标信息查询与 B-U 原生 URL/title 缓存保持一致。
- existing implementation in repository: Playwright 派生 BrowserModel._currentTargetInfo、CDPOwnerScopes、B-U SessionManager。
- mature candidates and pinned versions: 既有 Playwright 8b552173e8d767db29b8baef8f4a1f08cf7f26bf / B-U 0.13.8。
- selected implementation: 沿用 chrome.debugger Target.getTargetInfo 和标准 Target.targetInfoChanged。
- reused public surface: 已有查询、事件投递和 owner 过滤；不增加轮询或 attach。
- B-A-T-owned adapter and remaining gap: 已验证的 URL/title 发生改变时同步给 SDK；不自写页面缓存或动作 fallback。
- license/runtime/platform fit: 现有 Apache-2.0 TS 宿主适配；无需扩展重装。
- browser/runtime/state ownership conflicts: 只对原 session 的同一 target 发事实更新，经现有 owner 路由；不修改个人目标。
- replay model calls: 0。
- rejected candidates and evidence: 恢复重复 attach/Runtime.enable 会重新引入本轮预登记信号；复制 selector map 会绕开 B-U 事实源。
- focused validation: 协议离线首败→修正；URL/title 更新、不重复通知、错误查询与不同 owner 隔离；真实 daily 结果另列。
```

用户指出反复开窗严重干扰；停止继续可见复测。先完成本节离线定位、修复和记录。

离线收尾：`daily-target-info-before.log` 保留缺 Target.targetInfoChanged 的首败。补事件后原较宽测试越过该断言，但命中既有 mock 未实现 bat.closeOwnedTarget 的另一失败（`daily-target-info-after.log`）；未修改此旧测试的合同，已恢复原文件。新增更聚焦的 `daily-chrome-target-state.test.ts` 覆盖实际变更不变量并通过，日志 `daily-target-state-after.log`；它不连接 Chrome，不替代真实 daily 验证。API 包类型检查、Python 新入口语法、受管源码校验通过，source digest 仍为 `d50984bdce8fc76d2c683b70c562d418c476f3ccd464606c24db773d41e2e551`。

只读收尾核验：上述四次 daily 的 lab PID 均已退出，localServerClosed/ownRelayDisconnected=true，cleanup confirmed/activeResources=false。额外无界面 `capture-7rem4vnu` 的 closed.json 为 true、profile-deleted.json 已落盘且 profile 不存在。仅保留按七天策略管理的实验记录，daily 的 profile 子目录是测试租约元数据，不是个人 Profile 副本；未删除个人资料，未重启生产 API，未提交或推送。

## 2026-10-08：继续主流程与 daily 修复后证据

用户明确指出任务没有完成、没有要求中止。此前把不满解释成停止开发是执行错误；继续原已授权范围，控制桌面干扰。

`daily-candidate-b986ja`：同一日常 Chrome 的一个任务窗口、三个新文档，分别正确选择 7/11/13，真实 trusted 点击；webdriver 主文档与 iframe 均 false，CDP 三轮 false。对应参考 `daily-reference-p62qNs` 为 CDP 三轮 true。每轮一个文档 GET、一次探针提交、无 CSP 违规；九命令、零模型；cleanup confirmed/activeResources=false，ownRelayDisconnected=true，个人浏览器未关闭。三次旧候选失败继续保留。这是 Runner 能力层证据，尚不替代正式发布链路和独立效果复核。

### 独立检测复核实施前登记

```text
Reuse Assessment:
- capability: 独立复核 Runtime 控制会话的网页可观察副作用。
- existing implementation in repository: 固定 fpscanner 的 hasCDP；现有本地 HTTP/owned Chrome 验证器。
- mature candidates and pinned versions: Brotector 98b330999e9928a226ca0c8254dddf909d1583bd；Rebrowser e1a25b1ff264cc9a5b5ea7fe8a6dfc26e3b1c718；BotD 2.0.0、CreepJS 已评估。
- selected implementation: 首先校准 Brotector 原版公开构造器，crash=false；不改检测判定。
- reused public surface: new Brotector(callback, interval, crash)、init_done、detections。
- B-A-T-owned adapter and remaining gap: 固定 JS/LICENSE/PDF 下载与摘要核验、本地托管、结果白名单、正负例与资源收尾；不实现检测算法。
- license/runtime/platform fit: MIT；浏览器 JS；当前 Windows Chrome 实际兼容性由校准确定，尚未冻结。
- browser/runtime/state ownership conflicts: 独立新文档，不与 fpscanner 共享全局对象；仅 localhost 与 blob worker；禁用上游可选 popup/crash 测试。
- replay model calls: 0。
- rejected candidates and evidence: BotD error_trace 与 CreepJS 未提供此 Runtime 订阅机制的等价覆盖；Rebrowser 的单 stack getter 必须另校准，不能把未命中当通过。
- focused validation: 无 Runtime 订阅和显式 Runtime.enable 正例各三新文档；只有正例能检出才晋级为产品 holdout；当前产品补丁已冻结，不按第二探针结果调参。
```

制品来自 [Brotector 固定源码](https://github.com/ttlns/brotector/blob/98b330999e9928a226ca0c8254dddf909d1583bd/brotector.js)。JS SHA-256 `1fa214628e8b36faaee9088e00bfba97679c40f4637f4442b633130f38d24a6d`，LICENSE `3527e1b45c07acbef785668b2e517c30620a1e129994ee765c605965f9e38cf7`，配套 PDF `7cb171c5e3e89066a2839bbd26722069fb9aecdb63c6f6c6b6fdd13c9519a01f`。只保留检测名称、类型、分数和 Runtime 数字计数，原始 fingerprint/堆栈不写 Git。

校准 `holdout-calibration-474e933p` 原版六个新文档均 init ready/errors=0，无 Runtime 订阅三轮未命中、显式 Runtime.enable 三轮命中；实际生效的是 Error.prototype.name 计数（3），stack getter 计数为 0，不可把老式 stack getter 检测单独当有效复核。

日常原版 `daily-holdout-reference-Z4mg4w` 第一轮业务正确/Runtime 阳性；第二轮动作前被 hybrid_origin_denied 拒绝。源码确认原版还自动打开 PDF iframe，无界面日志确认发生下载；额外 PDF 文档干扰当前目标来源是据此作出的定位，未保存私人目标 URL。保留这次验证器集成失败，不修改产品来源保护或把它算成三轮成功。最小测试适配仅在派生类禁用公开的 test_pdfStyle（与 Runtime 分支无依赖）及原 crash=false，不改 test_runtimeEnabled、name getter、阈值或产品补丁；用同一适配重新做无界面正负例校准后才运行 daily。该复核只结算 Runtime 机制，不结算 Brotector 全部检测。

## 2026-10-08：W3 受控范围验收

独立复核使用与候选调试不同的 Brotector Runtime 检测（Error.prototype.name 访问计数）；候选产品代码在引入该探针前冻结。禁用无关 PDF 分支的适配在 `holdout-calibration-fn6xm_6d` 校准六轮：无订阅 0/3、显式订阅 3/3，全部 init ready/errors=0。该适配没有修改 Runtime 检测源码、name getter 或阈值。中间一次 Python bytes 注释含中文导致启动前 SyntaxError，日志 `holdout-runtime-calibration.log` 保留；修正字符串后运行，不计作浏览器或检测结果。

| 证据层 | 参考 | 候选 | 结论 |
| --- | --- | --- | --- |
| 日常 Chrome / fpscanner | daily-reference-p62qNs：CDP 3/3 | daily-candidate-b986ja：CDP 0/3 | 同一既有 Profile 策略，每组一窗口三新文档；两侧业务 3/3 |
| 日常 Chrome / 独立 Brotector | daily-holdout-reference-t4dcmM：Runtime 3/3 | daily-holdout-candidate-FNfgOB：Runtime 0/3 | 六轮 init ready/errors=0；两侧业务 3/3；无 PDF 分支干扰 |
| 页面主上下文 | capture-uc4oit9p：两个内部对象 | capture-j7rsgngw 等：对象不可见 | 隔离采集；点击、输入、导航、同进程/跨进程 iframe、shadow、闲时停采、关闭释放保持 |
| 正常准备→发布→正式复跑 | 既有 method-completion-native.acceptance.ts | native-Gow4ru，document/record 均通过 | 两个集合选择变体，不称两类能力；输入能力另由组件验证 |

日常两套探针各自前后三轮均为九个原生普通能力命令、零模型，一轮一个文档 GET/一次探针提交，无 CSP 违规；收尾 confirmed/activeResources=false。fpscanner 原始 browser.highEntropyValues.uaFullVersion 两侧均 `154.0.8037.98`，同 Windows、显示模式和用户所选日常 Profile；日常原始清单没有独立保存浏览器二进制摘要，不补造历史值。人工参考仍来自先前全新专属 Profile，没有重新要求用户采集，也不把它称为同一日常 Profile 的人工会话。

`native-Gow4ru` 的每个案例均经真实 B-U 首次准备、动态 function 生成、sample/verification、变化试跑（7→11）、不可变发布，再运行同一 release：合格目标为 7 时成功；只有未发布/已关闭的 99 时明确 `function_output_invalid`，没有误开 99。十份 TaskRun 的 modelCalls 全部为 0；首次准备的模型调用独立记录，使用产品原设置，未修改模型路由。十份 execution 清理及两份准备生命周期清理全部 confirmed。该脚本使用专属 headless，只结算功能兼容，不代替日常效果测量或 UI/重启验收。

### G1–G5 与交付边界

- G1：固定 fpscanner 1.0.8 与 Brotector commit/摘要，原始输入有效，两个机制正例均有响应；fpscanner 其余十六个规则保持 unknown，不写成全绿。
- G2：日常自动化前后模式/Profile/版本匹配；各组三个独立文档、组内延续会话。没有声称换成新 Profile 的人工参考与日常会话完全同条件。
- G3：预登记 E04 主上下文暴露、E06 Runtime 副作用均取得改善；未修改 webdriver 属性、检测阈值或来源保护。
- G4：主探针与未用于产品调参的独立探针均三组成对；首败与验证器 PDF 干扰保留，修正后效果一致。不用于推算网站通过率或封号概率。
- G5：既有发布/动态选择/失败分支与零模型回归通过；owner 清理确认。窗口恢复三项及干扰错误码一项既有基线失败仍保留，不能宣称恢复测试全通过。

本轮完成的是保留 B-U 的 W3 最小改造与受控效果复核。没有新增账户、后台 HTTP/TLS、WAF、挑战或宿主替换代码；这些工作包没有本轮触发证据，继续暂缓。没有访问京东或淘宝，没有目标平台使用效果结论。生产 API 未重启，当前源码已通过独立宿主验收；常驻进程的 relay 变更在后续正常重启后加载，不把测试宿主成功说成线上进程已替换。

最终验证：新增探针适配后的 M0 定向测试 4/4；API 包类型检查；受管源码摘要；Python 语法与代码规模/差异检查。未执行根级或全量测试，四项旧基线失败未扩大修复。仍在 master@4304981，无 worktree、提交或推送。

资源结算：本轮 daily 各 lab 均已关闭自有服务器/relay/任务窗口，个人浏览器未关闭；两次独立校准的 owned headless 浏览器关闭，两个临时 Profile 永久删除。首个校准的两份固定 PDF 经 SHA-256 核验后永久删除；日常失败验证的下载位于 Runner 独占 TEMP，由其 temporary_directory confirmed 收尾。主流程十二份 Profile 与十二个持久化 owner 的 lifecycle 记录逐一核对，全已关闭，精确目录无重解析点/匹配进程后永久删除 221,609,821 字节。小型实验记录和固定探针制品保留在忽略的 work；没有回收站操作。凭据、个人 Profile 和原始指纹均不进 Git。

回滚范围：只撤回本轮三个 Browser 工厂的 TaskBrowser 适配、新文件与 NativeEventCapture 的本轮差异，并同步恢复 workflow-use 受管摘要；daily BrowserModel 标准事件修正可以单独评审保留，不能通过整库 reset 覆盖原有工作。未执行回滚，也没有变更 TaskChain/数据库格式；已有 release 不需迁移。

### 常驻服务加载阻塞

静态复核发现 attached_window.py 因新增一行 import 达到 501 行；仅移除一处空白行恢复 500 行，语法和所有新增/修改代码规模复查通过，不影响已测行为。API 最终类型检查、受管源摘要与 M0 四项定向检查均通过。

最后核实常驻 PID 11840 为当前 checkout 的 scripts/dev.mjs，任务和日常连接均空闲，尝试通过原开发入口重载。包含本地 URL 健康查询和 Start-Process 的命令在执行前被 Codex 0.160.0 Windows 分类 + Never 策略拒绝；未关闭旧服务、未启动新进程，未绕过或重复命令。具体原命令与源码依据见 [工具拒绝记录](TOOL_POLICY_INCIDENT_20261007.md#2026-10-08开发服务重载命令被拒绝)。因此源码验收与当前运行服务分开结算：本轮代码完成，常驻 API 生效仍被阻塞，不能称整项交付已经全部生效。
