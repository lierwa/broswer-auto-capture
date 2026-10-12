# BSK 移除、探索清理执行记录

> **当前交付证据**：纠正已完成，1234文件冻结后的新taskd246fdb8经正常工作台需求/准备/发布/两次正式复跑通过，四次普通执行Human/39 clear、模型0、输出与报告逐项一致、首次清理confirmed。完整[最终报告](PRODUCT_BROWSER_FINAL_REPORT_20261012.md)。旧task5c07ca39及首败保留。Mac仍未实测，原三项总交付尚未完成，未提交/推送；用户最新要求完成后也不关机。

> **验收结论纠正**：下文 task5c07ca39 的流程/输出事实保留，但它使用验收脚本自行启动的任务 Chrome，端口0引入WebDriver，不能代表正常产品环境。撤回据此作出的A3交付通过结论，重新通过正常产品入口验收；见[入口纠正记录](PRODUCT_BROWSER_ACCEPTANCE_CORRECTION_20261012.md)。

## 入场与交付门

2026-10-12 实核 `D:\work\browser-auto-tool`、`master@94fb77d9c04803ebee608814ee20b09fb545c230`，origin 为 `https://github.com/lierwa/broswer-auto-capture.git`。入场只有五份既有文档修改和两份未跟踪方案，全部保留。CodeGraph 已初始化。开发服务健康接口指向本 checkout，PID 15640（仅本次查询时快照）。

用户授权三项开发、方案所需验证，以及全部完成后提交、推送、核对远程、记录交付和收尾。最新明确撤销关机安排，完成后也保持开机。禁止 worktree、京东访问、Docker、盾检测规则及阈值修改。

Mac 首次只读连接 `ssh -o BatchMode=yes -o ConnectTimeout=8 mac-codex ...` 被远端在 SSH 握手前关闭；详细诊断为 TCP 已建立、尚未收到 SSH banner、`kex_exchange_identification: Connection closed by remote host`。未到认证阶段，不能归因为密钥或 macOS 权限。已异步询问可用连接，继续独立本机工作。

## Product Alignment

- natural-language task: 填写通用表单并读回结果；按条件读取页面列表；冻结后从需求对话取得任务要求的最终检测报告。
- reusable chain boundary: 原不可变发布 TaskChain，旧节点薄适配后与新节点共享受管浏览器。
- runtime inputs: 原合同、已解析参数、浏览器环境和本 execution owner/lease。
- dynamic task outputs: 实际页面结果、审计、业务与清理各自状态。
- generic platform capability used: 现有 browser-use Tools/Actor、runner、LangGraph、TaskBudgetLedger。
- replay model calls: 普通节点 0，只有显式 llm 节点可调用。
- site/task-specific code added: no

## Reuse Assessment

- capability: 旧浏览器合同承接和唯一准备路径。
- existing implementation in repository: hybrid-runtime、Python HybridRuntime/OrdinaryCapability、TaskBrowser、managed window、TaskChainBrowserAdapter 纯 IR 投影。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、现有 workflow-use 固定 fork；扩展 WSTransport 及 relay 保留原来源。
- selected implementation: 上述现有公开能力；删除外部 BSK 进程/daemon 后端。
- reused public surface: Tools.act、Actor Page/Element、现有 TargetResolver、runner 请求/取消/finally、人工检查点。
- B-A-T-owned adapter and remaining gap: 旧参数和返回形状映射、历史 owner/记录只读兼容；目标/上传下载/标签/人工恢复须逐项验证，未验不报完成。
- license/runtime/platform fit: 沿原 MIT/Apache-2.0/AGPL-3.0 来源声明；不改固定依赖版本。
- browser/runtime/state ownership conflicts: 同一次执行一个 runner/控制会话；旧发布字节、ID、摘要不改。
- replay model calls: 0。
- rejected candidates and evidence: 改名 CLI、RPC 重接 daemon、复制 BrowserSession 均仍保留被移除职责。
- focused validation: 原方案 V1–V8；不运行根级或全仓测试。

## 能力与删除清单（实施中）

| 项目 | 消费者/承接 | 状态 |
| --- | --- | --- |
| navigate/click/fill/press/select/scroll/wait | 旧 adapter → 当前 runner/OrdinaryCapability | 已接线；基础/错误真实样本通过，人工检查点定点通过 |
| hover、tabs、upload/download | 当前 Actor/受管目标边界；旧输出形状 | 已接线；基础/错误真实样本通过，人工检查点定点通过 |
| page/read/observe | 原 page schema、extractTarget 与当前受管页面采集 | 已接线并真实读取验证 |
| human/恢复 | 当前人工检查点、受管身份核验 | 已接线；基础/错误真实样本通过，人工检查点定点通过 |
| BrowserHost/session/transport | app 和 runtime-host 旧后端 | 已删除 |
| explore/preexecuteBusinessOnly/preexecutePlan | 仅旧测试及旧专属实现；生产 authoring 走 withAuthoring | 已删除 |
| trace-compiler/compilation-annotations/旧 trace/output | 旧探索专属引用闭包 | 已删除 |
| collectOrigins/collectUrls/valueJsonSchema | authoring/runtime 当前消费者 | 迁至纯任务值工具后保留 |
| workflow-use-v1 withSession 桩 | 已退休执行接口；历史 retirement 错误仍有用途 | 删除执行桩，保留诊断 |
| BrowserJournal/旧 browser status | 删除保护、历史 UI/API、异常 owner | 保留必要历史读取和归属门 |

## 验证与资源

实现进行中，尚未冻结、发布或完成整体验收。真实数据库未修改；只读统计6份发布记录、47个capability节点（workflow-step@2为28、read-fields@2为11、data.transform@1为8），旧browserRuns表0条、旧browser-owner文件不存在。既有开发服务与个人Chrome未启停。

- A2已删除旧explore/preexecute/trace编译闭包与专属测试，当前withAuthoring、bat-hybrid/2离线来源兼容和workflow-use-v1历史诊断保留。共享任务值工具独立保留。
- A1外部transport/session/BrowserHost已删除，旧IR接入同一个hybrid runner；BrowserService缩为历史读取与未核验owner保护。通用预算常量移入contracts/browser。
- 入场27项定点通过；修改后36项中35通过，invoke人工等待测试旧派生ID断言失败。核对未改动的runtime-invoke真实invocationId来源后修测试，定点2项通过，未重跑整组。
- browser package类型检查通过；API仅剩未改动盾文件的3项TS错误（cadence/verification），盾阶段处理。旧合同适配2项通过、历史保护1项通过。历史测试首次finally误用不存在的close已修；残留browser-api-test-Wr7FNz按精确TEMP路径核验后永久删除。
- 真实浏览器首败：legacy-live-87jMNx导航后文本读取JSONDecodeError。B-U Page.evaluate字符串返回原文，修正为不JSON解码；原失败保留。
- 第二次legacy-live-VY2iys在tab_open失败。最小tabs诊断确认原生错误为“Agent focus not updated to new target_id”；登记创建回执后仍失败，进一步核对源码发现autoAttach事件可能先于回执被过滤。现有TargetScope仅缓存创建期间的原事件，并只对创建回执证明拥有的target重交SDK；不二次attach，不认领并发个人页。定点原生SDK测试通过，个人页不进入池/租约。
- legacy-live-qqFusL真实基础矩阵通过：导航、fill/hover/click/select/press、page/target/list读取、后台tab_open/select/close、upload/download。1次hybrid_start、普通执行模型0；这是兼容能力样本，不替代冻结后的新任务主流程。
- 每轮本次专属headless浏览器与runner均由既有finally关闭，cleanup confirmed；各轮Profile永久删除、样本HTTP服务关闭。所属access-state和诊断收据仍在work/bsk-removal-20261012，最终结算时继续清理临时数据库/脚本，只留脱敏证据。尚未声称全部资源清理完成。

剩余：错误分支/语义目标/人工恢复与当前主线定点验证，废弃引用复查与锁文件、README、阶段冻结；独立盾部署和双平台实测、全新需求到最终报告均未开始。Mac入口仍待恢复。未提交、推送或关机。

## 后续定点结果

- 真实错误矩阵 U9N6rM 通过：缺失/歧义目标、语义 occurrence/fallback、显式 DOM 表单提交、多文件拖放、越域导航拒绝。首次拖放失败为普通容器不在点击索引及中心坐标层级，使用既有 resolve_element/scroll/inspect 与 CDP 文件投递修复，保留首败。CJQLvn 基础矩阵复验通过；PATH 排除 BSK，19 请求/一个 hybrid_start/普通模型0。
- 显式建页丢失回执保持 cleanup 未确认、提前 autoAttach 仅登记自有 target 的两项 Python 回归通过。
- 连接真实首次授权/断线重连/宿主重启均零新增 tab；暂停/恢复冷启/撤销在 GPXhj0 通过。首败根因是 Chromium 会清除 INSTALLED_VIA_CDP 注册，不是暂停状态丢失；夹具每次冷启重新装载相同扩展，保留 storage。此证据不覆盖桌面手动安装持久性。官方依据：Chromium extensions/browser/extension_prefs.cc 的 CleanUpCdpInstalledExtensions。所有轮次自有 Chrome/服务均退出，Profile/授权目录永久删除。一次使用 Node strip-only 启动夹具在导入阶段报参数属性不支持，未创建资源；改用项目现有 tsx。
- 最新旧合同/命令总账聚焦12项通过，withHybridCapabilities 拆分后函数长度回到约束内。37项 V2/V4/V5 中两项首次失败分别是旧错误代码断言及测试默认浏览器模式，修合同拒绝与指定 dedicated 模式后定点通过。30项恢复/删除/连接组28通过、2失败：两项测试要求 PythonRuntime 借用旧 TaskConnection，而未改动 HEAD 的 runner 已按 operation 创建；保留失配，未重新引入被替代的管理路径。
- A1/A2尚待最终静态/类型核验及冻结后新任务全流程；此时开始独立盾 P0/P1，不提前计为整体完成。

两项旧TaskConnection注入失败已按当前每execution独立runner的真实不变量重写验证，而非接回旧共享锁；补核账号releasedOwners准备后传递，三项定点通过。历史TaskConnection本体/关闭兼容仍保留。账号夹具改用mkdtemp/finally；清理 unused-owned-fixture 后发现其中两份 JSONL 已被 Git 跟踪，已按入场 HEAD 原字节恢复两份，只有本次产生的诊断删除；不得把既有夹具算临时资源。API类型检查已通过。

冻结前全流程宿主夹具两次启动失败：新 Chrome Profile 初始缺 profile.info_cache，daily-chrome snapshot 返回 invalid_request/400；第一份错误没有路径，第二份完善定位后确认发生在连接状态而非模型设置。仅为新建的自有 Profile 初始化名称元数据，未改个人 Chrome 或产品授权逻辑，未创建需求/准备任务。两轮 API/Chrome 均已关闭，Profile 永久删除。

第一轮冻结的 085fda49 在需求模型运行中因静态门发现测试文件超过500行而主动取消，0准备/0浏览器动作；不是产品失败。将原 SDKFixture 移到 fixtures，原行为不变，两项归属测试通过；原 app 请求保护及采访测试长函数只作等价拆分，API类型通过，TS/Python长度检查无超限。

第二轮冻结 1224 文件，全新 task 7a03b956 / interview 0a9a1018 成功，确认v1；首次 prepare fec29eee 在 forming_plan 12ms 内失败，0模型/0浏览器动作/0发布。代码/配置文件集合及字节不变。只读重放 projectPreparationPlan 原确认需求得到 preparation_step_input_path_missing：访谈接受了输入“任务输入.英文、任务输入.中文”，现有路径解析把并列表达作为单个路径，直到计划投影才拒绝。首败及取消记录均保留，两个所属验收宿主已关闭、Profile及配对凭据永久删除。

本次最小修复 Product Alignment：运行输入为通用对象/单字段；复用现有 ValueBinding 的完整任务输入，不新增多源绑定语法、不替用户选字段；把同一输入路径存在性校验前移到访谈成稿准入，使用现有 DraftValidationError 反馈和修复通道。表单多字段和列表筛选参数均需要此约束。Reuse Assessment：移动并复用已有 atPath 纯投影函数和现有草稿错误诊断，不新增框架/模型调用；普通复跑仍0模型，无站点类型。先用首败等价双字段草稿复现再修。

第三轮冻结 1226 文件（补含项目技能/AGENTS），新 task 613c06c7 / interview 54e4eef1 / prepare 3a68431a：计划与输入通过，首次代表探索有13次模型调用，完成输入、滚动、提交和报告读取。盾 e97af46e 为 Bot/38 clear/1 detectWebDriver flagged，39项均可测；如实保留，不为Human重试。编译首败 natural_field_read_mapping_mismatch，0样本/0发布/0正式执行。原读取一次因页面采样变化被拒绝，原生Agent后续一次读取成功；后者的原生 ContentReadToolParams 默认 regionMode=selected-regions，而证据层用 MethodReadToolParams 解析原始 regions 参数得到旧默认，导致同一方法错判来源不一致。runtime资源cleanup首次confirmed、activeResources=false。

对应最小修复 Product Alignment/Reuse Assessment：网页报告和页面资料保存均需原生内容读取；复用当前原生参数模型补齐同一宿主默认值，不改模型输出、不新增字段、不放宽同源/身份/映射校验。只改证据层的内容模式参数解析；旧container语义及篡改拒绝保留。新增3项边界用例先测，首测1通过2失败，完整复现默认区域和缺省body两条错误；修后再做定点验证。盾规则不变。

第四轮 task 2a5b1722 / prepare 6b717827：1227文件冻结不变，代表操作及内容读取成功；编译仍拒绝 verified_natural_read_invalid，探查读取曾因容器变化留下缺口。盾 5a8d604e 为 Bot/38 clear/1 WebDriver flagged，完整39项有效，0发布/正式复跑。cleanup首次confirmed/activeResources=false；原始来源及报告保留在 frozen-mainflow-r0Dfcl。

根因追补：证据层修复未覆盖 classify_natural_action → compile_verified_read 的第二次参数解释；编译丢弃了 registry.validate_action 已返回的原生参数对象，继续以原始参数套旧默认。Product Alignment/Reuse Assessment 延续上段：仅将已验证的原生读取参数传给编译，不改原始trace、不复制参数模型、不放宽身份/输出校验，字段读取与内容读取均复用其原生schema。先新增边界回归复现，再离线重编原失败来源确认缺口，之后重新冻结新建任务。

第五轮 a2654c8f / d3178343：1227文件冻结不变，编译7动作、2排除、0gap；TS代表结果准入首次拒绝 hybrid_method_capture_contract_invalid，0发布/正式复跑，cleanup首次confirmed。盾9200bdb8报告保留。Python/TS边界仍有同一遗漏：normalize_history只保存模型显式参数，丢掉原生ContentReadToolParams宿主regionMode标记；TS刻意把无标记旧来源解释为common-ancestor。此前9项只覆盖Python，未覆盖此边界，不能称完整修好。

修复边界改为新来源生成处保留原生内容参数，registry验证允许原生Literal限定的宿主标记，普通模型仍不负责该字段；历史trace字节和TS旧语义不变。新历史仍引用未改的原生history，规范化参数直接来自公开原生模型，不从采样结果反推；通用网页内容/报告均适用。复用评估延续上段，新增来源生成到宿主的交接验证。

此边界18项Python与17项TS通过，原失败来源离线规范化后交给真实TS准入通过；registry两项通过。第六轮冻结Qi6atB的 task42175ac2 / prepare3b139032 首次代表执行、编译与宿主准入通过，原生模型一次结构错误及其原生恢复保留。自动样本4722240c / rune74d5e80 首个输入失败 ordinary_event_target_unverified，模型0、auditComplete=true、cleanup首次confirmed；0发布/正式复跑。代表盾927b66a6为Bot/38 clear/1 WebDriver flagged，样本98872f02未完成输入。冻结1227文件不变。旧宿主/Profile/配对凭据已收尾，报告及来源保留。

输入根因定点：Chrome154.0.8037.98，独立通用textarea与原生Tools.act，直接CDP不经过relay；页面hidden、原生63键盘事件、实际value空且输入事件0。窗口显示、OS前台、Page.bringToFront和额外DOM刷新均失败；单独Page.captureScreenshot后同一21字符输入成功、43输入事件。全部实验各用所属新窗口且finally关闭，没有重放业务提交。证据input-diagnostic-*；当前J9Irv3宿主仅作诊断，未创建任务/未冻结。此前windowsHide假设不成立，撤回夹具修改。

Product Alignment:
- natural-language task: 后台页面填写内容或发送键盘命令。
- reusable chain boundary: 已定位目标的普通原生键盘动作。
- runtime inputs: 当前页可见状态、已授权目标和参数。
- dynamic task outputs: 原生输入效果及原事件/后置检查。
- generic platform capability used: B-U公开take_screenshot和Tools.act；普通DOM读取继续不截图。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment: 固定B-U eb412692的BrowserSession.take_screenshot公开API直接调用CDP。Chromium a2401fdf的PageHandler::CaptureScreenshot第1332–1338行显式IncrementCapturerCount(stay_hidden=true,stay_awake=true)使隐藏页产帧；与本机对照一致，但未声称取得Chrome154对应精确源码。采用仅隐藏页键盘派发前一次有界原生截图，不存图、不循环、不换输入实现；前后核目标/文档，失败不派发。没有自建窗口控制或放宽事件证据。真实回归须原失败通用页不加诊断干预即成功，再冻结新任务。

第七轮JVPw53冻结1228文件，task f40f3c91 / prepare ea9d1c6b：代表与编译完成，样本9894c8d5 / run da40efd4 输入已通过；提交目标首次ordinary_target_missing，0发布，模型0/cleanup首次confirmed。代表c0d45971完整39项Bot/38 clear/1flag，样本5155a859滚动仍pending。定点只执行导航/两输入/滚动、不提交：submit-diagnostic-8oq35wt0复现原生滚轮派发后0wheel/scroll事件、提交disabled；额外原生截图后同一目标立即进入selector map。故隐藏页问题还有滚轮消息等待渲染的后半段，不是历史selector失配。原所有失败与冻结不变回执保留。

同一Product Alignment/Reuse Assessment补充：滚动列表/阅读区域也需原生渲染结算；在普通scroll派发后、事件采集结束前复用同一个隐藏页有界截图，使真实滚动事件及页面变化进入原校验。不重派滚轮、不放宽目标、没有盾特判；键盘前置行为保留。需先定点复验四动作/无提交，再重新冻结新建任务。

修后四动作puudeq15有1wheel/1scroll、submit enabled且定位成功；通用屏外点击4c0q_9_0也通过。8项边界通过，源码清单96560f9b通过。第八轮BVKjS3冻结1228文件，task0b4eeb84 / prepare2fc6087a，样本5eabcc0d和另一组输入verification均合法completed、模型0/cleanup首次confirmed，但人工检查实际output.value.content发现标题仍“正在更新/引擎验证进行中”。39项已取得不能代表最终状态，保留completed及首次输出，不发布、不额外加judge。

根因：代表探索有search_page/find_elements的耗时，读取时已终态；编译只保留动作和读取，读取区域#report在中间态也存在，已有read_fields.ready仅证明可读取。确认需求仍要求最终报告，并非新增用户条件。复用现有CSS选择器和消费者就绪等待，无需恢复新工具或新增字段/模型轮次：准备指导要求异步结果选择器包含现场观察到的就绪状态，排除进行中状态并兼容各终态；把同一条件留进读方法，探查/思考时间不可充当等待。适用于提交结果与异步导出/加载内容，网站状态值只归具体任务数据。旧来源/运行保持不变，先定点核已有消费者就绪边界，再冻结新任务。

上述第一次提醒未充分约束模型：第九轮IrjLdp taskd33aec75 / prepare9e90d63e / sample790224cb合法completed，但生成读取仅#main，输出仍SCANNING/正在更新。冻结1228文件逐一不变，原输出保存sample-premature-output.json；在独立复验前取消准备，无发布。IrjLdp所属宿主/Profile/配对凭据已收尾。

现将指导明确为：即使代表时已结束，也需用原生find_elements观察真实状态属性（aria-busy/data-state/data-status/class），在同一读区域中排除进行中状态，不能只读恒存容器；缺可执行终态条件如实报告方法缺口。未新增工具/字段/模型judge。真实通用terminal-read-8ie1cebh用同一CSS条件分别取得complete/failed两终态，每个按钮只点一次，模型0、cleanup confirmed；不依赖模型耗时。第一次诊断夹具缺有界字符串/consumerRef被协议拒绝；补齐后首次点击又复现隐藏页未产帧而无事件，因此把原键盘前置屏障覆盖原生click/select_dropdown，滚轮仍后置结算。8项边界再次通过，源码清单744a7cce通过。aES7IE仅诊断无任务，已关闭/Profile及配对凭据永久删除。

就绪回归结果：TS5项通过；Python26项22通过，4个旧夹具失败为缺action.args、3个缺页面身份导致预期错误码不符。对应test_consumer_readiness.py/natural_reads.py/read_input_binding.py/postconditions.py与HEAD无差异；未声称整套通过或完成独立历史checkout复跑，不扩大修改旧夹具。


### 冻结 mNBhcZ 的终态条件首败与最小纠错

全新 task 587035f1 / prepare 5eecc5e7，样本 c5c3c8ec 合法完成且39项名称/结果与盾一致，但输出 phase=running，业务验收失败；没有发布。1228冻结文件核对无改动。原始读取先用原生CSS不支持的 `:has-text` 失败，模型随后查询真实state属性，却以无终态约束的 `#report, #raw-report` 成功读取；该错误保留。取消等待独立复验，不再无变化重跑。

Product Alignment:
- natural-language task: 获取异步任务的最终结果；适用于检测报告、导出任务等
- reusable chain boundary: 单次提交后的结果区域读取
- runtime inputs: 原有业务输入
- dynamic task outputs: 当前输入对应的终态内容
- generic platform capability used: 原生CSS、既有read_fields就绪与读取
- replay model calls: 0
- site/task-specific code added: no

复用既有B-U原生CSS及read_fields等待，不新增selector引擎、工具、全局judge或模型重试循环。仅补失败/成功读取的通用指导：语法纠错必须保留终态条件，多区域每个分支都需约束，终态不能只允许当前样本结果。模型选择器仍由真实观察生成，宿主不替选。现有纠错6项通过；通用实页一次真实模型纠错及两种终态复读验证进行中。

通用实页 readiness-correction-3_rjxq6b 已通过：先真实复现非法CSS错误；当前产品模型仅一次纠正得到 `#summary:has(#result[data-state]:not([data-state="busy"]))`，同一方法普通复跑分别等到 complete / failed，两个结果均含相关详情、复跑模型0、窗口cleanup首次confirmed。没有人为替换模型选择器。源码清单4979c931通过。其作用是证明纠错与通用等待能力，不代替下一轮真实完整任务。


### MaPsbw 样本终态成立，但复用范围仍未验收

task4ca09b3a / prepare737b8d32 / sample8e1ee46c：实际输出phase=failed，39项名称和结果、结论与盾原报告一致，模型0/cleanup confirmed，冻结1228文件无变化。第一次真实终态输出成立。生成方法却为 `#report[data-status="failed"]`，把当前终态结论固定进就绪条件，尚不能证明其他最终结论也可复用；因此取消待复验，0发布/正式复跑。此处不能把终态输出单次通过写成整体方法验收。

进一步缺口是模型只在提交后查看终态属性，未观察初始和处理中状态。新指导要求在触发前和触发后立即用现有find_elements观察状态，并把结果值与就绪条件区分；不新增模型字段/工具/循环。正在用真正B-U Agent通用三状态页面验证完整探索，而不再仅验证一次修正函数。原错误方法保留，不人工替换选择器。

原生探索诊断首次native-readiness-QdQELr失败：夹具直接用B-U Tools，遗漏产品已有bind_tools_act一次性查询详情适配，模型只收到计数摘要而拿不到属性，最后正确报告方法未建立；14次模型请求含3次原生bridge失败，未发布。已核B-U固定源码Tools/MessageManager及现有action_dispatch.py，产品该适配早已存在，因此只修诊断夹具，不把此夹具缺口归因产品。窗口cleanup confirmed。

第二次诊断native-readiness-U1jwVB已有真实waiting/running/failed观察，模型生成了排除前两态的条件，但另一个详情分支未加条件，且页面仅有详情标题使模型返回success=false；夹具随后用不存在的动态ActionModel属性取审计，又产生AttributeError。两项失败均保留，未验收。修正审计读取为model_dump，并改为有真实详情内容的单一结果区域三状态样本，验证与真实报告容器相同的不变量；这不能证明多区域无条件分支可安全复用。同步删除指导中“自动扩成共同父区域”的旧错误描述，明确只捕获选中区域，异步结果优先对完整结果容器加统一条件。产品没有新增选择器解析/状态机。

原生三状态验证native-readiness-y8b9pP通过：真实B-U Agent观察waiting、running并生成 `section#result:not([data-state="waiting"]):not([data-state="running"])`；同一方法普通执行等待complete/failed各一次，25.75/25.92秒、复跑模型0、cleanup confirmed。前一轮WwvdpN的running→processing失真和错误方法保留。最小修复为复用B-U长期历史保留原find_elements原文，读取反馈回显代码已保存的参数；3项原生MessageManager边界过，MaP原来源离线重编0gap/7segments，源码清单dce471d5过。4组原生诊断缓存、9组旧能力缓存与两次nonce缓存均在所属资源确认关闭后永久删除。接下来新冻结任务完成全流程，尚未发布/正式运行。

原生诊断y8b9pP的模型审计为12次请求：8 completed、4 ai_structured_output_invalid（由既有原生Agent重试恢复）。其“模型0”仅指两个普通执行复读，不能用于探索本身，也不能把4次结构输出首败写成一次全过。没有新增模型重试循环。


### xt6zmp 结构化报告分支缺口

全新task7910f74e / prepare3a55e975 / sample144f67c0合法completed、cleanup首次confirmed，1229冻结文件核对未变。此次访谈把完整报告定义为3个结构化字段，样本保存了机器人结论、39项完整表格及页面地址；其来源container=#main没有终态约束，因此方法复用验收未过，0发布/正式复跑。输出合同本身无phase字段，不能把本例误写成已测得phase=running；真实问题是终态等待方法未保存。

查明成功读取反馈此前对非数组结构化结果直接返回None，原始内容采集才收到已保存方法/就绪指导。已把相同反馈移到共用成功读取入口，不变schema或来源result.extracted_content；源码条件字段仍由模型按原生观察选择，未人工替选。当前用同一通用三状态页面验证结构化字段读法。

结构化诊断Lituu3：真实原生Agent最终成功生成排除waiting/running的3字段方法；首次普通读已等到complete并得到全部正文、详情和当前地址，但夹具错误地要求result字段只含标题（合同实际仅要求string，任务要求完整结果），因此精确字符串断言失败。保留首次失败，不改模型方法/平台/盾。LFszWK从该原生成功记录的原参数解析同一方法，仅修正验收断言为终态正文前缀、没有Processing、详情和URL准确；complete/failed两次普通读取通过，新模型调用0、cleanup confirmed。7项结构化纠错/反馈回归通过，两个诊断缓存永久删除。源码清单e0f9ca56通过，准备再次冻结新任务。


### JeZA0X 未观察初始态的准备首败

taskc2631151 / prepareb5c0ed5e在代表探索结束时success=false：已完成输入/滚动/唯一提交并读到完整机器人报告，但承认没有提交前/处理中状态，因而没有可验证的终态方法。0样本/发布/正式运行；1229冻结核验未变。原指导以“已知是异步结果”为前提，模型直到提交后读取反馈才补查状态。将初始页状态查询前移为所有返回数据步骤的明确准备动作，再于结果触发后立即查询；仍用原生find_elements，不新增工具、模型字段或重试循环。

零模型state-observation-mqhfcs1f另验证：仅给原生DOM序列化增加aria-busy/data-state/data-status参数，在通用页和真实盾页均没有显示这些属性；因此没有采用这个无效方案，没有改序列化器或注入DOM父子结构。窗口cleanup confirmed。

### 原工作台加载迁移实现及历史保护

核验原4175进程15640属于当前checkout、53次execution与64次authoring均终态、browserRuns=0、日常Chrome空闲且专用浏览器closed后，通过既有dev shutdown接口正常重启工作台，未关闭个人Chrome。新进程28420健康、日常扩展自动重连且busy=false。六张历史表重启前后逐行内容SHA与行数完全一致：executions53、authoringJobs64、contracts113、artifacts161、drafts1、releases6。证据root-history-before/after-restart.json及root-service-stop/start.json。此项不代替新任务全流程验收。

### 5Zgk75 中间结论被误作终态

task5b5d7e10 / prepare727b1dcf / samplec4bfc404：初始与提交后原生状态查询已真实执行，编译0gap，样本合法completed但只取到摘要，39项为0；摘要仍SCANNING/报告同步中。生成方法为两分支选择器：摘要排除pending、报告排除running。原盾在处理中已可产生bot结论，摘要分支因此提前匹配；CSS逗号是OR，不等待另一报告分支。首败输出、39项外部比对失败、1229文件冻结不变均保留，取消待独立复验，0发布。

Product Alignment/Reuse Assessment沿用上面的通用异步结果读取边界：导出任务与检测任务都可能先产生结论摘要、稍后写完详情。原生CSS与现有read_fields等待足够，缺口是模型没有拿拟用谓词核对自己刚观察到的处理中快照。最小修复只补指导：候选条件必须在已观察处理中状态为假；结果值可能提前出现，多区必须共享同一生命周期门，不能各自排除不同状态。先用“提前摘要+延迟详情”的通用实页和原生Agent验证，再重新冻结新任务；不注入人工selector、不改盾、不加运行结尾judge。

通用提前摘要反例native-readiness-allFqx通过：真实原生Agent选择共同main容器并排除queued/processing，普通执行分别等到complete/failed后才取得最终详情，26.28/25.92秒，复跑模型0；探索7次请求全部completed。窗口cleanup confirmed，所属access-state永久删除。此次只有指导文本与源码摘要变化，无新增运行机制。源码清单0ba63a39核验通过，将重新冻结新任务。

### iNUpn6 同类方法缺口与工具参数说明

taskfcc24e0a / prepare5396333b / sample8a7a7df2：样本合法completed但仅摘要，39项为0；来源regions以逗号连接报告not-running与摘要not-scanning，后者未能阻塞处理中状态。冻结1229文件核验未变，取消待复验、0发布。不能以通用反例成功推断复杂实页通过。

定点结构核验发现ContentReadToolParams.regions的字段说明只有选择内容范围，结构化container说明也只有完整记录范围；全部就绪指导在长system扩展和事后反馈中。最小补充只在两条模型实际填参的位置说明：异步最终数据选择一个观察到的共同容器，由同一生命周期条件约束；候选必须在已观察初始/处理中快照不匹配，不得用不同区域的OR条件代替共同完成条件。仍沿用原CSS参数与普通等待，不新增字段、运行检查器或模型调用。

### cTacMT 需求草案输入章节的说明段落首败

task11eaa1d3 / interview1457bf49：首轮及一次既有repair模型均正常结束，但输入章节两个合法字段之后的独立说明段落被fields()当成第三个字段；repair只改了标点，仍被拒绝，0准备/浏览器动作/发布。冻结1229文件未变，两份纯文本草稿已保留（不含模型思考/签名）。其中结果字段另使用不支持的“记录列表”字段类型，须继续按原诊断纠正，不能把其静默转成文本。

Product Alignment: 表单多字段与列表查询参数都需要输入Schema与原始说明共存；普通复跑模型0，无站点代码。Reuse Assessment: 复用现有Markdown章节与fields校验，和结果章节相同只投影显式字段列表，说明仍保留在原草稿上下文；仅有说明而无声明仍拒绝，所有错误的显式字段继续拒绝。不新增自然语言语义解析、模型调用或重试。

输入段落回归先复现失败，最小4行调整后该文件6项全部通过：合法字段+说明可投影、非法显式字段/纯说明/缺失标记仍拒绝，无输入说明仍是null。两份真实首败草稿离线重读已越过输入段落，准确定位结果字段不支持的记录列表类型；未静默转换或冒称草稿通过。API类型检查随本次逻辑改动执行。

## 当前冻结主流程验收完成与剩余范围

最新宿主2sKVf7，task5c07ca39 / prepare883a37bb。冻结1229文件在需求前与两次正式运行后集合/字节一致，fork摘要9ffcd66be14f88d47bde8b9054ca03f61a9f38203ca1596843dded6cf6fa9777。需求首轮缺试做入口，由既有一次repair恢复；代表探索12次模型请求中10 completed、2 ai_structured_output_invalid，由B-U原生恢复，未增加B-A-T重试循环。浏览器动作无失败、编译0gap。不得把探索写为模型0或全部首次成功。

| 阶段 | execution | 结果 |
| --- | --- | --- |
| 代表样本 | 4792f288 | completed；39项完整一致；模型0；cleanup首次confirmed |
| 另一组输入独立复验 | bd5e21f8 | completed；39项完整一致；模型0；cleanup首次confirmed |
| 首次正式运行 | af385683 | completed；39项完整一致；模型0；cleanup首次confirmed |
| 改变输入正式复跑 | d85ffdbf | completed；39项完整一致；模型0；cleanup首次confirmed |

通过UI发布V1 ecd63ff9；两次正式execution固定同一release及b702e810内容摘要，发布前后摘要不变。英语/中文两个input节点均从运行输入绑定，保留原生target_value后置检查；两组不同参数的输入节点全部success。同次输出中的终态说明、39项名称/结果、结论、URL逐项与盾服务端报告比对。四次检测实际均Bot/38 clear/1 WebDriver flagged、盾phase=failed且引擎未完成；任务完成与盾检测结论分开，不为Human重试，不放宽检测。

本地证据目录：`work/bsk-removal-20261012/frozen-mainflow-2sKVf7/`。核心文件final-acceptance.json、output-acceptance.json、release-freeze.json、freeze-verification.json、final-detection-report.txt；原SQLite及来源/失败记录保留，均排除Git。V1/V3/V4/V5/V8定点证据见前文，V6/V7由以上真实新任务覆盖；V2的测试扩展冷启注册限制仍单列，不冒充手动安装冷启实测。此前Python消费者测试4个旧夹具失配未以独立基线重跑证实，未声称全仓测试全绿。

该宿主API/Chrome及所有此前宿主已关闭，Profile和配对凭据永久删除；空default占位目录另行删除，关闭租约/内容回执作为历史证据保留。正常工作台再次经既有dev接口加载最终TS改动，PID23656健康，个人Chrome未关闭、日常扩展connected/idle；6张历史表重载前后SHA及行数一致，仍为53/64/113/161/1/6。盾实例与Mac剩余范围见部署记录。由于双平台/重启门未完成，未提交、推送或关机。

收尾进程审计final-resource-proof.json：21个所属验收宿主全部closed，所属Chrome/Profile及配对均不存在，匹配本次目录的node/python/chrome活动进程0，4393/4395监听0。正常工作台和原盾服务按用户工作状态保留；不将其计作临时资源残留。
