# 原生探索整改实施与验收记录

固定2 BrowserScan第二轮92cdf506失败115.823秒：8次Agent（3completed/5failed），五个ai_generation_failed/ECONNRESET分别10.206、10.184、10.194、10.151、10.189秒，全部模型终态102.868秒；5动作，native done(false)保留，来源303fe537完整保存，三条find_elements实际结果一次读取flag均true。首次清理confirmed/activeResources=false；没有样本/独立/发布/正式run。不是把浏览器预算设8停止，实际maxSteps仍100、step原预算3850，五次连接重置触发原生失败结束，重置根因尚未知。最后模型已能回应，代码无变化，新正常UI第三job a2fe3a6a-b86b-4313-8567-9b91b38c8563 于2026-10-13T15:50:47.193Z从原v1/daily发起；源于新的成功回应，不新增模型重试循环/换模型/调超时或改盾。

状态：本session P1–P4已固定，六类受控工具各有真实通过，全部历史失败保留；P5正常UI BrowserScan原v1正在准备，未发布或正式复跑，Pixelscan本版尚未开始。

历史上一轮在实际 checkout 的现有 master 中实施 A→B1→B2→B3→C→F。该轮开工 HEAD 为 `2b00a63d4b664678fa62c2810b02f79bab9d5dcd`，1268 个既有代码/配置文件已保存摘要；保护证据在 `work/native-remediation-implementation-20261013/baseline.json`。所有既有 dirty 修改保留，不建分支/worktree、不提交推送。

Product Alignment:
- natural-language task: 原 BrowserScan/Pixelscan 需求及通用资料读取、动态选择和动作任务。
- reusable chain boundary: 原生多动作审计 → 依赖编译候选 → 同 revision 验证发布 → 普通复跑。
- runtime inputs: 原确认需求、阶段输入及合法所属浏览器现场。
- dynamic task outputs: 当前现场真实报告、选择和动作结果。
- generic platform capability used: B-U Agent/Tools.act、现有来源编译、LangGraph、TaskDraft/局部新来源修订。
- replay model calls: 普通节点 0；显式 llm 节点沿原合同。
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生串行批次、逐动作证据与停止事实、有限证据裁剪、局部版本修订。
- existing implementation in repository: ActionDispatchAudit/EvidenceCollector、SourceObservationScope、natural prefix/final/liveness/coverage、TaskBrowser、TaskDraft/release-evidence。
- mature candidates and pinned versions: 保持 B-U 0.13.8 / workflow-use 0.2.11 / cdp-use 1.4.5，以及既有 QuickJS/LangGraph。
- selected implementation: 当前受管 fork 和现有公开 Agent/Tools 接口，不重装或升级。
- reused public surface: register_new_step_callback、Tools.act、Agent history/stop/pause、terminates_sequence、既有编译和发布接口。
- B-A-T-owned adapter and remaining gap: 派发位置、前后事实、原生未派发尾部证明、来源/候选/发布版本和依赖；无通用副作用消除器。
- license/runtime/platform fit: 沿用现有许可与 Node24/Python3.12；workflow-use AGPL-3.0；Windows本轮未实测。
- browser/runtime/state ownership conflicts: 一次一个 TaskBrowser 所属会话，B-U拥有探索/停止，LangGraph拥有普通调度。
- replay model calls: 普通节点 0；准备语义源码沿来源键最多一次。
- rejected candidates and evidence: 当前组件已覆盖核心能力，无需替代 Agent loop/驱动/调度器。
- focused validation: 现有验证与真实原需求流程；结果逐阶段补充。

## 本session P5受控工具事实

P0基于session-p0-baseline核freeze3的1273份SHA全部一致。源码/配置不提交、不推送；模型/Chrome/VM未变。P1–P4及全部开发失败和验证耗时见PROGRESS顶部；当前factory仅重建真实开放工具，原生done与宿主装配分账，source先存/candidate单独ACK，严格未派发证明贯穿依赖，离线恢复零模型且无账号资格前置。

受控A1使用同一真实专用headless runner、owner `bc7801b2-70d1-4c9b-b83d-af81fcd10f13`，最后成功响应报告28浏览器命令、0模型，父场景93.190秒/命令整体95.971秒。没有接管个人Chrome。原始日志 `work/native-remediation-implementation-20261013/controlled-tools-a1.tap`。

| 子场景 | 结论 | 墙钟 | 实际失败/证据 |
| --- | --- | ---: | --- |
| 就绪读取、遮挡状态变化与正式读取 | 通过 | 11.623秒 | 同runner正常/遮挡反例，读取同当前输入 |
| find_text真实滚动、未找到 | 不通过 | 0.121秒 | JSONDecodeError；固定B-U Page.evaluate把bool转换为Python字符串True/False，已改同判断对象JSON返回，待现场复验 |
| owned文件上传、缺失/越界 | 不通过 | 5.199秒 | 原上传step后TimeoutError；未有位置证据前不归因派发未实现/不重派 |
| PDF真实字节/owner/digest | 通过 | 60.292秒 | 真%PDF字节，摘要/owner反例；未据此冒称ArtifactReference持久链路；耗时保留 |
| 多owned tab close/陈旧与last tab | 不通过 | 0.572秒 | native_close_unconfirmed；suffix已核正确，真实close错误/缓存未收敛原因尚未知 |
| 真实DuckDuckGo search/非法engine | 通过 | 4.884秒 | 非法engine不改页，真实正常search到授权origin |

资源结算A1：0.288秒，browser_close/close_protocol/child_exit确认，activeResources=false，专属Profile根目录核owner/绝对路径后无force删除，lstat ENOENT证实永久删除。不会以原目录消失代替进程退出。第二轮只选find_text/upload/close，增加现有strict脱敏SourceLifecycleDiagnostics定点定位，不重复已通过组。

受控A2只复验find_text/upload/close，owner `ea5844ac-ed1f-4ee9-8ffc-f3789eb4cce5`，最后成功响应报告12命令/0模型（不是包括失败派发的全部命令数），父70.344秒/整体73.347秒。find_text真实滚动+未找到反例通过0.318秒；upload仍失败5.212秒（postconditions读取当前document→SDK DOM.getDocument等待被取消，不是原生派发失败证明）；close仍native_close_unconfirmed60.480秒。当前原因继续保留未知，正按该owner严格脱敏位置日志核查，不设睡眠掩盖。清理0.238秒 confirmed、activeResources=false、child_exit/browser_close confirmed、专属Profile根核后永久删除。原TAP及位置日志均保留。原生保护区160份source/config与P0摘要全部一致。

后续单项诊断不重跑已通过组：A3 upload 5.286秒失败/整体12.404秒/清理0.272秒；A4 fresh close 2.982秒失败/整体9.851秒/清理0.261秒；A5 close 0.494秒失败/整体7.244秒/清理0.254秒；A6 upload 5.270秒失败/整体12.715秒/清理0.277秒；A7修实时存在证明后close 0.566秒新失败/整体8.574秒/清理0.274秒。A1–A8共15个子场景，4通过/11失败，整体232.602秒；全部0模型，全部owner browser/child退出与Profile永久删除确认，原TAP/strict probe留work；没有副作用重派。

A3注册CDP回调61次，122行enter/exit全即时结束，推翻“receiver被await handler占住”的旧推测，没有因此修改调度/盾/预算。A5真实Target.closeTarget单次2ms返回success=true，旧get_tabs即时缓存仍含target，证明该轮close失败来自错误观测合同。现有最小修复使用公开Target.getTargets核真实消失而不是删confirmation；A7已推进到6命令，随后native自动焦点落启动空白页触发hybrid_origin_denied，继续保留来源边界并核合法后观察/last-owned守卫。A6 DOM.setFileInputFiles单次5ms返回，多个后态DOM读取完成后一个DOM.getDocument在预算内等待被取消，该轮不能称上传原生派发未实现。

A8只验upload，owner `cdb5f037-e280-4cec-acaa-5da88857ebad`，upload 5.279509秒仍TimeoutError，父9.728838秒/整体12.495388秒，最后成功响应报告3命令/0模型，失败动作controlled-4另有诊断。原生DOM.setFileInputFiles仅一次、6ms返回；随后对受控页实读fileCount=1/fileSize=0/nameMatches=true/contentMatches=false/changes=0，最后DOM.getDocument等待3846ms后取消。清理0.295秒首次confirmed、activeResources=false、browser/child关闭与专属Profile根永久删除均确认。源码因果核对：SDK is_local=false不把管理文件basename改为绝对路径，原普通适配仅核文件而仍传basename；Chrome零字节文件与该路径缺口一致。正补当前owner实盘核后的绝对路径及公开available_file_paths，source raw args不改；不修改浏览器local标志、不重派。日志 `work/native-remediation-implementation-20261013/controlled-tools-a8-upload.tap`，strict probe第177行。A3–A8的命令数字均只来自最后成功响应，不冒称失败派发已计入。

A9使用owner `b860edc1-6c9b-432e-bfd9-c54d84b9627e`，只复验upload/close。upload真实非空字节和缺失/越界反例通过0.495390秒；close第二次关闭当前第三页后失败0.503984秒RuntimeError，strict定位SDK session.py:1134：focus为空时拒绝on_SwitchTabEvent。该真实关闭未重派，正在改既有原生焦点恢复入口，不删来源/last合法页guard。父5.351784秒/整体8.319852秒；14reportedBrowserCommands/15attemptedRequests/0模型，清理0.267秒首次confirmed、activeResources=false、browser/child/目录均确认，专属Profile根永久删除。原始日志 `controlled-tools-a9-upload-close.tap`，前8轮统计不因后续通过被覆盖。

P2本次4项定点原Tools/FS检查首轮0.053秒3通过/1fixture缺cdp_client；只复验失败项第二轮0.033秒Mac /var→/private断言失败；改当前realpath期望后第三轮0.033秒通过。真实Tools.act的普通FS与不同AgentFS上传各核实际bytes，公开current available_file_paths和原生prompt可见绝对路径、source raw参数不变、basename/空文件拒绝已验证；不把它称完整SourceAgent附件→Artifact产品验收。

A10只验close，owner `738f2296-1150-483f-8b93-e230d415ad45`，多owned/stale/last合法页整组通过0.780170秒，父4.649601秒/整体7.402002秒。关闭后仅唯一已有合法任务页，由公开get_or_create_cdp_session核session/page并恢复focus，再复用on_SwitchTabEvent清缓存/发focus事件；无浏览器flag、睡眠、开页或再次close。9reported/9attempted/0模型；清理0.267秒confirmed、activeResources=false、browser/child退出与专属Profile根永久删除确认。六类受控工具现各有实际通过，A1–A10总18子场景6通过/12失败、整体248.324秒，全部失败保留。source上传绝对路径→候选新run文件绑定继续闭合，未冻结或开始两站。探针临时代码已从现有fixture收掉，原诊断证据保留。

当前线上来源IPC→SQLite→物化→普通执行现有case首3.036秒失败：作者把ChainPresentationContent误用完整presentation schema；已改正确内容合同，4.403秒复验通过。作者提示收束曾留下缩进错误，AST在资源创建前拦住并纠正；之后source入口0.012秒通过。中途selection死消费者删除造成暂时ImportError/旧fixture断言失败均已记录并同包清理；不恢复旧兼容。

最终文件转换/来源闭环：源Agent原始文件参数保留，公开available_file_paths可见当前实盘；已证当前write/replace生成者的filename绑定复用到新run，旧临时目录不入候选，外部路径/最新真实失败或未知写入/内容与路径身份冲突拒绝；仅严格not-dispatched writer可跨越。Python prefix+final编译0.030秒、Python→TS当前digest/proof与物化1.088秒（TAP3.748秒）通过。最后Python3项首0.070秒1pass/1fixture重复native位置失败/1真实Mac alias error，最小修checked_file合法父根别名且保内部symlink拒，仅失败2项0.057秒通过；raw绝对路径与basename分别核直接身份，额外symlink/foreign/owner反例0.030秒通过。TS严格stop跨语言首case1.322秒/TAP3.921秒因fixture o-ID失败，次case1.299秒/TAP4.024秒因fixture action-order失败，第三case1.133秒/TAP3.490秒通过。API本包首4处类型错误、第二轮通过，总耗时未单独计量，不编造。源码尺寸和AST通过；未新增测试文件。

精确未覆盖组合：source done.files未有业务Artifact装配验证；PDF→upload不属于已证write/replace生成者绑定。普通PDF节点产物与SQLite保存证据独立，不从单项工具外推所有轨迹。作者实施/自检和agent1独立AI源码反例复核不替代真实两站或工程师批准。

最终固定1274文件（session-freeze-final.json），保护160文件零漂移、fork ff29bc0e，HEAD/master不变；全diff --check与实际历史DB当前Zod读取通过（26jobs/35executions/2drafts/4releases，0.521秒，只读）。恢复前快照无活动资源，现有dev正式归属核验/shutdown将72766换为42398，个人Chrome657保持。正常UI BrowserScan原v1/daily准备job `4da6bab1-af4d-434a-8037-3774bfb7471c`于15:16:22.700Z接受，保存型号gpt-6.1-sol/high。本版尚未发布或正式三次复跑；当前依据持续写本节/PROGRESS。

P5首轮BrowserScan `4da6bab1`：70动作/0 bat_read_fields，31次Agent（30completed、1cancelled）、extract/semantic_annotation均0（该SDK compaction沿extract模型，故本轮0）。正常UI取消后interrupted，created15:16:22.700Z→updated15:28:03.572Z=700.872秒，所有模型终态累计625.694秒（含取消，不当纯模型成功时长）。来源final artifact未生成，不假装有完整final来源；已可靠接收的prefix/checkpoint和生命周期事实保留。首次cleanup_browser_close_unverified，child/process/temp已确认、activeResources=null；随后本owner5ece3874核验attempt2 confirmed/activeResources=false，旧失败保留在45b7e592和5c1e3aa0两条清理证据。精确汇总 `session-browserscan-a1-cancelled.json`。

新的消费者事实推翻P1“所有结果字段完全不变即可”：SDK tools/service.py1365–1369给formatted与长期count；ActionResult默认include_extracted_content_only_once=False；MessageManager.service.py324–342在有long_term_memory时不把formatted给Agent。当前测试只核历史不污染，漏掉首个read_state。本次仅成功find_elements用原生公开flag送已有预览一次，参数/两份原文/截断保持，audit与实际Agent结果一致；不追加采集的完整结果/DOM关系，不改Agent循环或SDK，不提升错误partial，search_page保原策略。首个消费者反例1项0.005秒失败（工具0.580秒）；补必要flag后QueryMemory3项0.006秒通过（工具0.470秒），现有实际Tools.find_elements经MessageManager/capture/compile的0/1/3/截断1项0.021秒通过（工具0.833秒），首步可见/下步清空/长期仅count成立。独立AI只读核未见must-fix；不据此宣称当前循环唯一根因或产品已过。

重新固定 `session-freeze2-final.json`，仍1274文件、160保护无漂移。Python新worker每次读取当前源码/manifest，已恢复TS服务不必再次重启；旧失败不中途改写。下一步正常UI按原v1重准备，之后两站样本、独立、发布、同版3正式及清理继续验收。

固定2实际复验已开始：BrowserScan原v1/daily第二job `92cdf506-43ad-4ef7-82ae-0dd466f1d846`于15:37:24.976Z正常UI接受，当前owner6e25cb27，原模型/业务合同不改。读取计时SQL首0.039秒误用不存在的taskAuthoringJobs.createdAt列失败，无写入；改读body.createdAt排序0.116秒通过，回执已记录两次job。

下方A–F是前轮实施及失败原证据，保留历史；本session断点以本节和PROGRESS顶部为准。

## A 基线

4173/4175 无监听，原服务 PID26747 与本 checkout runner 已不存在；Chrome主进程657仍运行，不重启或关闭。中断 job `1c9adfd8-4055-4431-89c9-ebba917243cb` 仍保存 running、cleanup=null；最后模型 started 未结算。旧退出原因未知。资源归属和原恢复代码正在核验，未自动重放动作。

## B1 基线反例

通过现有 `test_method_source_compile.method_source` 的 registry 与真实 EvidenceCollector，在内存中提出两动作，当前 `before_action` 拒绝 `single_action_capture_required`。首次命令漏配 `apps/api/python` 导致导入失败，补齐 PYTHONPATH 后反例确认；没有浏览器派发或模型调用。

固定安装源码核实：原 `Agent.multi_act` 拥有串行动作间隔、stop/pause、done/error、terminates_sequence 及实际 URL/focus 变化停止。采集不得调用新循环；不得刷新索引后继续旧批次。

## 当前结论

速度、稳定性、反爬行为和平台验收均尚未完成。实施与失败记录继续追加；不以源码摘要或聚焦验证替代产品验收。

## 开发工具授权等待纠正

打开工作台的 UI 调用返回总墙钟约 2432 秒。用户明确指出这段时间在等待其点击工具同意；主 agent 曾将它误称为 UI 工具异常，现撤回该归因。该时间单列为工具授权等待，不属于 B-A-T 产品准备耗时，也不证明 UI 执行卡住；没有据此调整产品超时、浏览器或系统配置。

## A 实施与当前资源结算

已复用启动中断恢复、同 owner 窗口接口、离线连接投影与现有服务生命周期。新增 `cleanup_authoring` 明确区分核验和结束；请求接受即保存 checking，异步结算，固定原 job/sequence/requestId，重复请求不重复操作。正式入口再次核验控制器释放、原 owner 和 Profile 身份后才允许结束。旧 child/进程/临时目录未知不能由新 helper 回执改写为 confirmed。

开工无旧 controller/runner 后恢复现有 npm dev；原 Chrome 主 PID657 保持运行。首次 nohup 启动未留下进程，改用明确 checkout 的 detached Popen，未增加系统常驻配置。加载 A 新入口前再次核对无活动任务，经 `/api/dev/shutdown` 正常结束本轮旧 dev PID47174，恢复现有服务（launcher56209）。未重启 Chrome、VM 或宿主。

旧 owner 先经原 relay62834 核验连接拒绝；直接换当前 relay58955 的尝试在握手失败前仅更新了同 owner 租约端点，未发浏览器操作，未证明窗口关闭。新服务的正式 inspect 被本地同源校验拒绝一次（403，无窗口动作），补上正常工作台请求协议后接受；sequence410→412，03:36:20Z 结算 unavailable/canEnd=false。继续核对具体失败原因；未擅自 end。旧退出原因仍未知，旧临时目录缺精确归属继续保留。

A 现有20项检查通过（1.47秒）；新收尾入口现有18项通过（2.29秒），API/Workbench类型检查通过（9.82/4.75秒），内存中的异步、重复请求、过期序列、控制器占用、owner/Profile变化与未知阶段保留断言通过。数量与类型检查不替代旧窗口实际恢复。

## B1 多动作实现与反例

保留原 `Agent.run/multi_act`。step 回调只记录所有提议；原 Tools.act 包装逐次绑定实际位置、前观察、原准入、真实结果、事件、后观察和访问边界。删除显式 `max_actions_per_step=1`，使用原生默认。批次内不重建原生索引；必要最新读取在保留同文档/后端身份的快照上完成。挑战/限制逐动作调用原 guard 和 pause/stop，人工等待仍在原 step timeout 外。

新独立 `bat.native-sequence-stop/v1` 事实保存正常未派发尾部；旧 dispatch/v3 与来源摘要保持。只接受有真实结束依据的同批尾部，无结果且已进入 act、无停止事实或错位结果仍拒绝来源。准入拒绝的实际原生反馈与正常尾部分别核验，拒绝后尾部协议正在补齐。

受控真实浏览器反例使用现有 Handler、原 TaskBrowser/Agent/Tools，离线 fixture 决策替身，无外部模型调用，无新测试文件；这些不算两站产品验收或速度数据。每次 finally 原 owner 关闭，原始失败追加在 `b1-probe-attempts.jsonl`：

- 初始两动作基线为 `single_action_capture_required`；一次漏 PYTHONPATH 导入失败后补齐确认。
- 脚本设置失败包括错误模块导入（未启动浏览器）、ResultSpec UnionType 调用错误（10.596秒）、缺 ChatInvokeCompletion.usage（4.600秒）、inspection 工具未在 execution 型替身注册（5.318秒）；均保留，前三个已启动 owner 的关闭 confirmed。
- 原生导航停止尾部、同批多个读取、逐动作独立 pre/post，5.765秒通过；6提议/5实际/0source gaps。
- inspection→First→Second 同批两个实际点击，无原生索引刷新，DOM效果 one;two;，8.123秒通过。
- 首轮 detached 反例7.107秒失败：旧目标进入原 act，SDK回退 JS click，事件证明缺失；当时未读取最终DOM，不能把断言标签当实际替换目标被点击的证据。
- 首次补丁误把 Element.evaluate 原始布尔字符串当 JSON，10.190秒失败，连真实仍连接的 inspection 目标也被拒绝。固定源码证明布尔返回 'True'/'False'，现改为单字段对象 JSON。
- 修后 detached 反例6.489秒通过：inspection和First真实完成，Second身份脱离在 act 前拒绝，原生实际error保留，DOM效果 one;，无猜新控件、无原索引刷新、0source gaps。原 Browser.close 首次 unconfirmed；另一次恢复脚本用错不存在的 verify_closed API，无操作。随后复用 ManagedWindow 同 owner/PID/启动时间/Profile 核验并 end_gracefully，0.224秒 confirmed，原首败仍保留。

协议/编译内存反例检查通过；原有33项协议检查31通过，两项旧fixture契约差异仍单列（find_elements保留详情策略、step callback变为proposal时机）。root现有前缀/读取/动态选择32项通过，human_resume因漏路径导入失败，其现有13项已由A单独通过（0.57秒）。尚未把这些差异或局部通过结算为整体 B1/F 完成。

B1 准入拒绝尾部已使用独立 admission_rejected 原生停止原因补齐；cause引用multi_act实际error，完整已执行前缀逐位置核验，拒绝后的所有尾部均未dispatch时才成立。内存五项1.36秒、TS六项及摘要0.20秒通过，entered/no-result/早失败/尾部已派发仍拒绝。真实四动作反例6.085秒通过：7提议/4实际，inspection和First成功，旧Second拒绝，第四读取未派发且resultRef=null，业务效果one;，0来源缺口，首次关闭confirmed。修后普通inspection→两点击7.935秒通过，首次关闭confirmed。上述仅B1能力核验，后续B2/B3/C和两站正式验收未完成。

A 正式旧owner核验已经迁移到当前登记relay端点，仍失败，不能继续归因缺scope。开发工具Python环境曾表现loopback选择系统代理，但后续核实产品RunnerProcess使用显式过滤环境，未继承这些代理变量；复现实际child环境后getproxies为空。因此撤回“已证实产品loopback路由缺口”的结论，未加NO_PROXY或任何网络配置。仅补固定安全错误reason，再取实际helper异常定位；原失败/退出唯一归因仍未知。

## B2 额外模型负担整改

三处定点改动：selection_annotation/repeat_annotation 仅在完整task已逐字包含requirementText时省略重复正文；否则保留两者。natural_target拿到真实requirementText/inputSchema/post观察，利用已有绑定，不以关键词或瞬时唯一命中代替动态选择。task-request只省略与已展示title/goal逐字相同的summary/completion，不删除业务约束、原需求、范围、风险或输出。

原5次语义注解仍需区分：a0002、a0018动态规则实际生成（8.511/11.134秒）；a0027、a0028、a0029实际返回null（16.206/8.155/7.136秒），全部没有固定目标或输入绑定证明，共51.142秒。不能整体删除或以重复调用碰成功；原三项insufficient_evidence/selection_function_evidence_required保留。4793字节正文已包含于9123字节task，此五次重复发送理论可省23965 UTF-8字节，尚不证明时延目标通过。

现有Python四模块30项通过（测试体0.083秒，命令总墙钟未采集）；TS交接/准备17项通过（2.621秒）。0失败/0重复执行/0测试文件增改/0外部模型和浏览器，定点diff通过。安全证据：`work/native-exploration-remediation-20261013/b2-code-validation.json`。源码清单核验曾因登记摘要落后而报hybrid_installed_source_changed；未重装vendor，待统一登记已核验源码后再检查。

A 安全诊断已补：固定允许异常类/协议码保留，URL/消息/凭据拒绝。实际child环境没有继承开发工具代理，未改任何NO_PROXY或网络。新固定reason是connection_refused；当前旧lease停在上一relay55606、当前relay57525，首次inspect接受在本轮服务listening后0.60秒，当时正式endpoint返回值未记录，不能唯一反推历史原因。查实正式provider存在但暂未就绪时原代码回退旧lease，已改为明确connection_unavailable且0helper调用；无provider旧native路径保留。实际日常connected=true后新inspect越过连接拒绝，sequence416、reason=hybrid_attached_window_end_unconfirmed。窗口仍未知，未end；原运行与旧子进程/目录事实不改。

原transport现有检查曾因要求回退旧relay而失败（1.10秒），内存同binding/身份变化/无helper反例通过（1.20秒），安全reason四场景通过（0.74秒）。root仅更新该既有用例的安全拒绝期待及原observation_scope用例的逐次派发调用时机，没有新增测试文件或用例；原旧失败记录保留。其他与此次补丁无关的find_elements旧期待保留为开工已有行为差异，不据重跑抹平。

## B3 方法依赖与覆盖

coverage仅承认已有严格失败纯读取排除证明，retryOf及后继成功不能删除一般状态/写入/未知失败。liveness只从已编译summary、唯一校验事实和真实sources.binding保住其读取；死历史证明不复活探查。两核心反例先红后绿，16项候选边界通过（1.119秒），验证当前动态read/function/target、无值状态/导航及not_compilable屏障。现有34项31通过/3失败（1.144秒）；内存禁用B3两改后原3项复现（1.225秒），确认为B3前基线，不改源码回退或测试期待。验证过程两次错用解释器/导入环境失败保留，未安装依赖；正确运行时为work/upstream-browser-hybrid/.venv。详见b3-code-validation.json。

## C 实施前对齐

Product Alignment:
- natural-language task: 原需求下修订已保存方法，继续读取当前结果或执行原已授权动作。
- reusable chain boundary: 所选参数化TaskChain及必要依赖；保留未受影响步骤图。
- runtime inputs: 原需求/计划、base revision/checksum、原来源、合法业务输入和问题描述。
- dynamic task outputs: 新现场形成的新方法/来源及新revision真实验证结果。
- generic platform capability used: 原source/AuthoringBuild、TaskDraft、同runner能力、LangGraph及发布证据。
- replay model calls: 普通节点0；显式局部修订另记chain_method_revision。
- site/task-specific code added: no

Reuse Assessment:
- capability: 局部新来源形成、依赖前缀与新版本合并。
- existing implementation in repository: chain-revision、plannedProgression、withHybridAuthoring、hybrid-runtime能力构造、TaskRuntimeHost/LangGraph、preparation双验证。
- mature candidates and pinned versions: 沿用本轮固定B-U/workflow-use/QuickJS/LangGraph，不升级或新增库。
- selected implementation: 复用当前所有正式能力；只抽出同runner能力构造供前置链消费。
- reused public surface: session.author、原能力执行/审计、createTaskDraft/validationEvidence。
- B-A-T-owned adapter and remaining gap: base/source准入、受影响闭包、异步stale合并、必要前缀副作用拒绝与产品入口。
- license/runtime/platform fit: 沿现有许可与运行时；Windows实机未测。
- browser/runtime/state ownership conflicts: 同一已启动runner/owner/session，不嵌套withCapabilities启动第二浏览器。
- replay model calls: 仅用户显式修订调用模型；普通again仍0。
- rejected candidates and evidence: 现有withCapabilities完整包装会再次startHybrid，不能套在author会话内；抽共享能力构造复用同一runner，保留原生命周期。
- focused validation: 原样本/独立复验门、来源身份、未受影响bytes、revision清空验证、stale及副作用边界。

A 原窗口实际收尾通过：确认日常paired/connected/idle后，经正式cleanup_authoring end精确固定旧job/sequence416/owner，请求0.096秒接受；执行于04:04:19.982Z结算closed（约2.27秒），sequence418。browser_close已confirmed；其余五个旧阶段仍unconfirmed，原open模型调用和旧退出unknown保留。Chrome主进程657/原启动时间保持。没有重放业务动作、扩展autoAttach、重启Chrome或删除旧目录。原窗口资源门已完成，旧进程/目录历史缺证仍明确列出。

C API中间检查在新command先落盘、service薄路由尚未接入时报executionId联合类型错误，属于未完成接线，未投入浏览器。Workbench类型检查通过。root一次能力检查命令使用了不存在的hybrid-exploration/hybrid-runtime测试文件名，0测试运行；按实际rg文件清单重新选择现有能力验证，不伪称已通过。

## C 收敛与冻结前结算

C 沿原 author/编译/样本/独立复验生命周期实现显式局部新来源；当前 base/source/owner/input/digest/registry/closed 准入、未影响图与 plan 字节、验证清空、同 runner LangGraph 安全前缀均有针对性证据。唯一 review must-fix 是旧 release 在新版本出现后仍可接受，现入口与异步合并均精确核当前版本，独立0.512秒通过。旧/新来源与失败记录保留，未知副作用前缀不重放；Pixelscan step-2 的旧前缀含写动作仍明确阻塞。真实产品新来源尚待 F，内存模拟不作通过。

C 现有21项通过2.977秒；16项来源/合并不变量0.267秒、实际LangGraph同能力前缀0.087秒、过期job失败落盘0.280秒，初次fixture失败及未采集时间见 c-implementation-handoff.json。API最后检查9.527秒通过。两个本轮新增helper合并，删除一个新增文件、净减12行；未通过机械拆文件掩盖体积。

共享能力验证首轮16项8通过8失败（2.847秒）：4项登记源码摘要滞后，4项旧fixture缺navigationPlan。仅登记已核验现有源码（无安装/同步/覆盖patch）后，前4项定点通过1.984秒；导航门未放宽，另4项不冒称通过。登记摘要fe7bdf60d304acec1c09d5abfd39631665cd800201bb28e908afdb71cb3e5dc0。

冻结前核对无活动准备/正式任务，日常Chrome paired/connected/idle，原Chrome主PID657不变；189个反爬/输入/预算/扩展保护文件与开工摘要相同。开发模型按用户最新指令当前Astra/ultra；产品模型原6.1-sol/high不改。Codex上下文按用户另项指令设500000/450000，其他配置逐值相同。

## F 第一次冻结：方法与速度不通过，未发布

1273份代码配置于04:32:39Z冻结。BrowserScan原v1正常准备acb0a82d于04:33:29.044—04:46:12.692Z完成，共763.648秒；21次原生模型调用584.260秒，50次实际派发43.739秒，轮末编译/持久化20.500秒（不与派发嵌套耗时相加）。两次真实CSS语法错误及两个未派发尾部保留。样本34cbc0aa/独立dfff8337分别41.877/40.543秒，均24命令、0模型、首次清理confirmed，当前110项及Normal完全相等。速度门不通过。

独立检查发现a-0007未消费的宽范围探查仍被作为点击readiness保活，两个执行均额外保存了约13.5KB原始属性；本回执不复制其内容。已有原生成功回执足以独立支持动作，但liveness与后续rebind规则不一致，故方法门不通过、草稿未发布。多动作诊断另有单动作history假设，误报unavailable，实际31次成功查询详情完整。现撤回本次冻结，仅修复两处已证实不一致；广告关闭/滚动无状态等价证明仍按§8.0保守保留，不据URL或无输出猜删。旧F记录和历史不改写，修后另行冻结并经正常产品新来源验证。

F 现场修复仅改3个既有生产Python文件和1个既有测试夹具，净减1行，无新增文件。liveness复用已有native receipt：原来源离线编译16→14段、只裁a-0003/a-0007、gaps=0，四个正式读取/110项绑定及全部状态动作不变（0.371秒）；37项既有检查通过0.855秒，首版替身8错误先留证再修范围。诊断50个真实结果逐值未变、37条摘要与6项异常边界通过0.616秒；既有4项通过同组旧导入失败0.870秒，隔离原用例通过0.814秒。原模块导入失败未掩盖。统一摘要登记1.146秒/check0.927秒通过，无安装。新source b342a247，1273份代码配置在freeze2.json重新冻结；无活动job/执行、日常connected/idle后仅重载本checkout现有dev服务，Chrome657不变。接下来正常UI局部新来源修订BrowserScan及原Pixelscan准备，原第一次F失败保留。

F2/C真实修订：正常UI依据“非业务探查输出含原需求排除属性”发起436be905，原需求/输入/plan不改；新来源029707b5，草稿15929cc4 rev0→1，旧六条来源/运行/发布hash不变。04:58:41.537—05:12:35.000Z共833.463秒；样本e3de62fd 45.498秒、独立595b15e1 42.507秒，均21浏览器命令/0模型/首次清理confirmed，110项真实结果。方法只保留四个业务读取，未消费探查全部排除，状态动作保守保留。该次是C新来源能力证据，速度仍失败，尚未发布。

F2暴露A单请求取消传播缺口：原生LLM等待75秒超时，原错误digest完全匹配；Python请求取消后，TS桥只绑定run信号，旧provider继续至94.409秒、与下一轮重试重叠18.283秒。晚到completed不能覆盖原生timeout。全请求累计时间和区间并集分别记录在f-acceptance.json，不能当互斥墙钟相加。本地fake Subject红探针163毫秒证明client完整POST后断开却未取消provider，另请求正常；finally桥关闭确认，无外部模型/浏览器/新增文件。C及两验证全部结束、active=0/daily idle后结束freeze2，仅修现有model-bridge单请求取消，再最终冻结做两站正常准备。开发只读定位中两次不存在路径、一次状态缺cleanup键、一次服务重载关闭表单造成UI locator失配（3.110秒）均无业务动作；未重复点击提交。

F2完整失败补账：另有0d68b221模型请求于05:06:37.392—05:07:23.536Z失败，ai_structured_output_invalid，46.144秒；随后由原生Agent继续。22请求21completed/1failed，累计含失败670.036秒、时间区间并集651.753秒；不能只统计成功请求。C双验证最终110项及来源绑定均通过，但未抹掉原生timeout、结构化输出失败或速度不达标。

A取消传播补丁只改既有model-bridge.ts，净增6行至99行；使用response提前close的独立signal，与原run/lifetime组合，finally解绑，不改原生75秒或重试。8项fake Subject边界绿验通过（含单请求/并发隔离/正常close/晚到/全局取消/监听器清理），77毫秒收尾、工具0.978秒；既有桥2项1.028秒通过，API类型检查9.315秒通过，0外部模型/浏览器/新测试文件，0验证失败。1273文件集合不变，只有该文件相较freeze2变化；已freeze3，零活动任务核验后仅恢复当前checkout dev，Chrome657保持。
