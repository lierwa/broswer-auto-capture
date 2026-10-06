# 工作流与原始内容交付整改记录（2026-10-05）

依据：已确认的 [修复文档](WORKFLOW_AND_DELIVERY_REBUILD_20261005.md)。本文记录实施和真实证据，不覆盖历史失败。

## 当前实现

- 需求交接新增“页面内容”交付：只声明任务相关页面/区域，宿主固定原始内容合同；不让用户或模型猜配置参数，不增加清洗节点。既有明确字段的数据结果保留兼容。
- 计划只按确认的“逐项执行/来源选择”建立来源链和可复用单项链；数组结果不再自动生成“发现字段→填最终字段”方案。来源链只取得真实入口与宿主生成的稳定键，单项链重复执行。
- B-U 原生 Agent loop 保留。原生 extract 可用于首次探索，但不能直接编为拥有浏览器和文件系统的正式 llm 节点。普通编译缺口记录并阻止发布，继续原生探索，不自动重派动作。
- 范围采集通过现有 bat_read_fields/browser.read-fields@2 适配：模型只选择当前区域，字段、合同、读回执由代码确定。直接使用 B-U Element.evaluate、受控 CDP Page.getResourceContent 和 convert_html_to_markdown；保存当前原始 HTML、Markdown、已加载 img 原图字节和 URL。模型只收到摘要，不回灌图片/HTML。
- 展开后的 ready 检查只确认当前区域与图片加载状态，正式采集保存原文和原图。动作目标和同页 ready/transition 消费者一起跟随本次输入 URL，跨页读取保留自己的目的地校验。
- 内容产物使用既有 ArtifactRepository 落库；不增加下载器、图调度器或采集框架。既有 owner/lease、任务浏览器模式和历史 Release 保留。
- 原文/原图不塞进 8MB 编译消息：Python 在本次 owner 的受控目录写产物传输文件，消息只带 owner、字节数和 SHA-256；正式运行由宿主核验目录、owner、大小、摘要及来源，再落入现有 Artifact。小的历史内联内容仍兼容。
- Chrome 原生连接文件只提供候选地址；启动前核验 /json/version 和浏览器身份。浏览器关闭后遗留文件不再被当成活动连接。准备失败保存安全 failureCode，不把原异常正文或凭据写入诊断。

## 首次失败与定点修复

| 阶段 | 实际失败 | 修复及证据 |
| --- | --- | --- |
| 首次完整 prepare，fixture-JGFcvN | 原生 Agent 已选择入口、展开并采集，编译无缺口；TS 代表结果校验仍要求旧 fields/outputPath，拒绝宿主已生成的范围读取 | 只对已确认页面内容匹配宿主生成规格，保留旧字段校验；从已保存来源重做交接校验通过，不重新找路 |
| 首次 sample，fixture-L9FXlG | ready 校验沿用旧小字段读取的 128KB 上限，拒绝范围采集规格 | 精确内容合同使用范围额度；就绪检查不重复下载图片；安全诊断保留固定错误码，不回显输入 |
| 已保存草稿的零模型 trial | 第一入口成功，第二入口 click 的 ready 仍绑定代表 URL，报 read_fields_target_scope_mismatch | 同页作用域替换补齐 ready；定点回归同时证明跨页目的地不被替换 |
| 三入口 sample 后发布 | 尚无独立 verification，发布门禁拒绝 | 属于验收脚本漏走独立复验；补上改变来源数量后的 trial，再发布和正式运行。门禁未放松 |
| 产物凭证接入后的第一次正式复跑 | Python 配置 ownerId 是 UUID 对象，产物路径组合报类型错误 | 在产物边界统一序列化 UUID；真实浏览器回归使用 UUID 对象且原图大于 8MB，已保存 Release 的两条正式复跑通过 |
| 京东首次现场启动，jd-ALbe4B | 工作台服务未运行；独立验收尝试回退到 Chrome 遗留连接文件，9222 无监听，sdk_connect 失败，无 Agent 调用/页面动作 | 保留失败；本次 owner 资源清理 confirmed。已补原生连接存活核验；启动真实工作台服务恢复扩展连接，不能把这次误判为京东页面抓取失败 |

SQLite 的独立 TaskRun 保留每次原始结论。验收脚本同时保存带时间戳的失败文件，不用最终成功覆盖首次失败。

## 已取得证据

- 已有公开 API 最小样本：同一受控浏览器展开区域，文本/表格/原 PNG 字节、范围排除与切换输入通过；没有另接浏览器或调用模型。
- test_page_content.py：两个真实 URL、展开、原始图文、UUID owner、原图大于 8MB 的瘦凭证、方法回执与普通读取复跑通过（1 个真实浏览器测试）。
- test_method_read_tool.py：9 个原有回执/读取边界测试通过。
- TS 范围交接、需求交接定点测试通过；新增同页 ready/transition 跟随输入且跨页不变测试通过。旧数组自动拆两链的断言更新为一次执行。
- 当前 API 类型检查通过；9MB 产物凭证定点检查证明完整回读、错误 owner 和篡改拒绝。
- fixture-L9FXlG：三入口 sample、来源数量改为两条的独立 verification、发布及两条正式运行完成；原图和来源产物可回读，所有普通 TaskRun 模型调用为 0。Release：2487742e-7ff3-489d-857e-070bb7193bf8。

- operation-Wbp3Tg：纯操作“启用通知”完成生成、sample、verification、发布和正式运行，普通节点 0 模型；Release：17c57256-7740-4e14-815e-fc280f012447。没有数据采集或清洗步骤。
- 产物传输接入后重用 fixture-L9FXlG 原 Release 两条正式复跑通过，未重开 Agent 或改写 Release。

真实京东现场及开发后对抗代码审查仍待完成；既有并行生命周期未改写，不用本轮采集测试替代其证明。iframe/canvas/shadow 等无法由当前公开采集面可靠保存的范围保留明确缺口；不得以 complete 冒充支持。

## 下一验收门

1. 来源数量 3→2，独立复验、发布、正式复跑，不调用模型。
2. 原京东相关范围和纯操作任务分别走真实入口；登录/访问限制由用户处理，不绕过。
3. 针对实际变更的最终最小检查，开发后新建对抗代码审查，处理有证据的缺陷。

未运行全量或根级测试；未改相邻项目；未提交、推送或关机。
## 开发后对抗审查及定点修复

首次新建代码审查未通过，3 P1 / 2 P2 原报告保留在 WORKFLOW_AND_DELIVERY_CODE_REVIEW_20261005.md，不覆盖为首次通过。

Product Alignment:
- natural-language task: 逐条填写相同运行参数；整体保存任务相关区域原始图文。
- reusable chain boundary: 来源选择链路 + 同一单项链路复跑；每条链路的输入与已选内容范围有明确归属。
- runtime inputs: 根对象参数按原值继承到每个实际来源；保留身份键冲突明确拒绝。
- dynamic task outputs: 完成状态或原始内容 Artifact；不开发业务参数清洗。
- generic platform capability used: 原有输入绑定、ReadSpec 逐行继承、CDP 当前文档身份/资源、Artifact。
- replay model calls: 0。
- site/task-specific code added: no。

| 审查项 | 修复与当前证据 |
| --- | --- |
| R1 根参数丢失 | 来源行及单项合同保留根参数；TS/Python ReadSpec 支持数组逐行继承，宿主验证每行来自本次真实输入。最初新增定点测试在两个协议验证器失败；补齐边界后失败项通过，原 11 项其余验证已通过。 |
| R2 CSS 背景漏采 | 复用 tinycss2 及已有 CSSOM/CDP；Archive 保存背景位置/伪元素与原图。真实 img + CSS PNG + 8MB 原图通过，无法证明的 CSS 变体明确拒绝；Reuse Assessment 见 RESEARCH。 |
| R3 同 URL 重载 | 复用 live_document_sample，HTML 与资源前后必须相同 target / URL / documentDigest；真实 Chrome 相同 URL 重载测试拒绝 complete。 |
| R4 多区域默默只交最后 | 自动完成只接受同 URL / target / 容器的刷新样本；不同范围必须显式选择实际交付或取得共同区域，不能隐式成功。跨区域聚合不在本次最小实现中，显式多引用同路径仍为合同缺口，产物保留。 |
| R5 固定原因被覆盖 | 同一安全 content 错误集合用于准备与正式读取；不把未加载、资源缺失、身份变化、范围不支持转换成通用 ValueError。 |

当前工作台服务已启动，现有 daily Chrome 已 connected:true。此前现场 sdk_connect 失败发生在服务未启动/独立验收目录无现有扩展授权时，无 Agent 动作，不能当作京东内容采集失败。后续真实现场沿实际工作台的已授权连接执行，不复制凭据。

代码审查限定复查、京东现场证据仍待追加。未运行根级/全量测试。
## 真实工作台访谈的首个失败（追加）

工作台服务/扩展恢复后，通过实际 /api/tasks 与 /api/interview 新建可见验收任务 2aaa0674-ce91-462a-bce4-c21502ce755c，未复制浏览器授权或注入 Source/Chain。

第一轮在进入 B-U 前失败：原生 Codex 消息以 stop 正常结束，但前置 commentary 在 partial phase 尚未给出时已流到 AIEvent text.delta；原生 ended/result 排除该 commentary。Pi bridge.settle 因前缀不一致发出 ai_generation_failed，访谈草稿未提交。原始模型调用、失败轮次与本次记录保留；不是商品页面/字段读取失败。

最小修复：复用同一公开原生 ended 与 AIEventBridge，B-A-T 展示适配只从原生完成正文交接，start/工具/推理反馈不延迟。不修改 b-u loop、原生动作或相邻项目。准确事件与两个 vendored 包源码见 RESEARCH。新增一个定点测试通过，不靠重试碰运气。

同次返回草稿还暴露提示语被当作来源选择内容、未写已有数量上限；访谈提示改为明确实际业务动作和已确认 N，不新增业务字段/模型步骤。修复后一次真实 retry 已提交草稿，revision=2，进入真实 daily Chrome 的原生 B-U sources 调查；先前失败轮次不覆盖。新 API 类型检查通过。服务沿已有开发守卫刷新到 PID 18600，扩展 connected:true；最初手工复合重启命令被自动审批拦截，既有守卫核验本项目身份后完成刷新，无需新授权，不影响其它开发服务。
## 真实 B-U 来源调查的首次失败（追加）

Task 2aaa0674-ce91-462a-bce4-c21502ce755c、job 6cc7fdee-c740-4196-8f63-29670e539394，原始 source artifact 962135e5-1c5f-478d-8089-588b28191e8b。原生动作依次 navigate/input/send_keys/销量 click、两次 find_elements，最后主动 done(success=false)。已查询当前页全部 107 个 a[href]，实际读取没有商品详情 URL；B-U 没有返回错误的商品字段、没有进入商品详情采集。原生模型调用为 14，来源闭合 closed:true；不把它当正式复跑 0 模型证据。

来源步骤旧引导不当限定真实 href，且不许进入单项，过早限制原生调查。最小改动解除该技术假设：允许点击代表条目核实原生导航机制并回到来源调查，URL 可以来自现场真实观察到的其它属性，不能拼 SKU/路由。若无法形成可靠普通读取/入口方法，保留编译缺口；不改原生 Agent loop，不以模型生成链接或站点特例放行。一次针对这项变更的真实验证待记录。

R1 对抗限定复查还发现 IR 物化 assertNaturalReadSegment 只允许对象。该第三消费边界已按数组 items 校验，并定点走真实 materializeHybridNodes 证明 record=input 绑定，错误输入类型仍拒绝。原首次审查和首次复查未通过都保留。

## 点击入口的现场缺口与最小补齐

第二次真实来源试做 job 22cdf459-0acc-4bee-804a-b0914bd73e07、source artifact 291946fc-e7b7-4dcb-833b-91dd0d3b7038，B-U 已点击打开真实商品详情，随后返回列表。第 13 个动作原生 done(false)：列表标题没有已验证 URL 属性，无法形成要求的入口记录；26 次准备阶段原生模型调用，未进入详情内容采集。不是字段清洗问题，也不是浏览器连接失败。

旧来源设计把“可进入的条目”限制成“列表元素上的 URL 属性”，遗漏已有浏览器导航事实。补齐普通 ReadSpec 的 `valueSource: page-url`：使用 B-U 公开 Element.evaluate 和标准 DOM ownerDocument.URL 读取当前文档真实地址；只允许 :scope 的单个字符串，不允许模型填 URL、拼业务路由、任意 JS 或替代 URL 身份校验。来源准备可点击代表条目，在目标页记录真实 URL，返回后复用同一进入/读取流程；普通循环继续由现有编译及 LangGraph 承担，不添加第二个调度器。若观察无法形成稳定循环，仍保留真实编译缺口，不宣称任务已经跑通。

Product Alignment:
- natural-language task: 从动态目录或按钮入口进入资料/设置页，记录真实入口供后续逐项操作或整体采集。
- reusable chain boundary: 同一进入、读取当前页面地址、返回流程；单项链路仍按实际 URL 参数复跑。
- runtime inputs: 原有根输入及已观察页面入口，不新增用户填写技术参数。
- dynamic task outputs: 原生当前文档 URL 和来源身份；后续为执行状态或原始范围内容。
- generic platform capability used: 既有 ReadSpec、原生 Element.evaluate、标准 DOM URL、原有身份/来源校验及循环编译。
- replay model calls: 0；准备中的原生探索单独审计。
- site/task-specific code added: no。

S1 指令冲突同时按最小方式闭合：href/src 才使用 resolveUrl；其它已证实完整 URL 属性原样读取；未支持的相对属性不承诺解析。最小验证只覆盖真实无 href 点击后的 URL 读取及跨语言边界，最终现场结果另记。

### 本次实际验证及仍未通过的现场门

- Windows 真实 Chrome 无 href 按钮点击后，原生 MethodRead 记录真实地址；第二页使用 page.goto 验证同一 readRef 和普通 read_fields，1 项通过。该用例没有证明完整的条目循环或第二次按钮点击。
- TS 新字段协议检查 1 项通过。对抗审查随后发现 validateMethodField 的白名单遗漏 valueSource（S2）；canonical 来源→代表输出→实际普通 capability 的新增用例首次复现同一失败，补齐缺省 null 与精确等值校验后该用例通过。先前仅 Python/协议通过不足以证明整个消费路径，失败记录保留。
- 新 API 类型检查通过；受管源码摘要登记为 e85ce31d6c3bd379e9b5fa4c58f7d085512037a1485c2daf0ac1827313594c85。限定最终对抗代码审查通过；跨区域聚合仍未支持，完整京东业务不能据此算通过。
- 原任务针对新入口读取的一次现场 job ce420787-53c0-469a-873a-ff97df4c2a75、source db4c14eb-8765-46fe-8c2e-adf52bff00b6，在第 1 个 navigate 就中断，尚未调用 page-url。原生导航结果是 observation_refresh_required；保存的诊断显示同一 target 在观察前后变化，后续 current_page 阶段 ValueError，invalid_source / capture_callback_incomplete / author_observation_capture_failed。2 次原生准备模型调用，source closed:true。具体是哪种事件导致后续 target 失效，当前记录未证明，不能写成用户关窗、验证码、LLM 字段失败或 S2 引起，也未重复碰运气运行。

最终服务已刷新加载 S2 修复，PID 1072：Workbench http://127.0.0.1:4173/、API 4175，健康检查通过；现有扩展公开 connect 返回 connected:true。使用既有开发守卫只刷新本项目服务，其它服务保留。用户无需配置原生 9222 地址；截图中的“未连接”首先对应工作台未启动，不能当作浏览器授权丢失。保留服务供用户访问，未关机、提交、推送或创建 worktree。

### 用户反馈网站验证后的节奏核对

用户提供京东“验证一下，购物无忧 / 快速验证”现场截图。停止新增京东自动试跑，不点击或绕过验证；当前验收任务已 failed，无活跃执行。本次只读核验并补记录，未改代码或再次访问网站。

刚才现场验收没有显式设置访问/动作间隔，这是开发执行遗漏。现有 ReplayPacingControl 是复跑节点观察延时；首次原生探索请求未接该配置。TaskChainService.enqueueDraftTrial 的样本/复验使用 nodeDelayMs:0，正式运行省略 pacing 时也使用0；现场验收脚本没有传 pacing。原生 BrowserProfile.wait_between_actions 默认0.1秒，但 Agent.multi_act 仅对同一批中的第二个及后续动作等待，本项目 max_actions_per_step=1，不能当成跨探索步骤的固定间隔。

原始源观察时间核验：首次7动作相邻动作最短12.39秒，第二次13动作最短10.95秒；这些包含模型耗时、页面加载及观察，既不能写成毫秒连续点击，也不能当作统一访问限速。动作数量含只读 DOM 查询和 done，不等于网站请求次数。

截图确认网站验证已经出现，是当前现场阻塞；它没有证明唯一触发因素，也没有提供URL把某个失败来源的摘要直接等同验证页。此前只称“导航观察失败”的现场说明不完整，补齐网站验证事实，同时保留原始观察失败证据。

剩余闭环：首次探索、代表样本、独立复验、正式执行需要受同一任务节奏配置约束，避免只有UI滑块生效；网站验证需进入现有人工等待并停止自动重试。设置间隔不能承诺避免网站验证。以上尚未实现/验收，不把本次只读分析列为修复通过。

### 诊断优先级纠正

用户指出重点仍是系统无法按任务预期执行。接受该纠正：未显式设置间隔是执行遗漏，不能作为主流程失败根因；当前记录不足以证明网站验证由访问间隔触发，不以调大间隔替代流程修复。

已经证实的宿主缺陷包括：正常原生消息在访谈桥接中被拒绝；来源合同要求列表 URL 属性，导致已能点击进入真实详情的 B-U 仍无法交接来源；新增读取只通过 Python/规格验证后，仍被 TS 来源消费者遗漏的白名单拒绝。上述定点缺陷已修，但真实任务的来源循环、整体详情采集、独立复验、发布、正式复跑尚未全部通过；最新导航/观察中断的具体事件也未解释清楚。网站验证的人工等待分支没有这次真实通过证据，不能把截图直接等同某一来源摘要后宣布原因已解决。

工程主问题是原生执行、记录、编译、输入输出消费和异常路径的闭环验证没有完成。下一门优先验证这些接口组成后的真实行为与循环/分支，再修确证的第一偏离点；节奏配置作为独立遗漏保留。继续停止京东试跑，不用反复网站重试或增加等待来证明修复，不改原生 Agent loop，不开发数据清洗。

### 用户现场：原生继续执行、画布只剩三个节点

只读核验用户手动发起的 job `5760502a-3037-426a-8d6f-d60669d1fa7b`：最后 build.sequence 为 18，保存的 trace 有 17 个动作，画布节点只有 `s-a-0001`、`s-a-0002`、`s-a-0003`。当前 job 为 interrupted；没有此次终态来源 artifact，不能声称完整任务、来源交接或发布成功。本次诊断没有重跑网站或修改代码。

按动作顺序的第一编译断点是 `a-0004`：原生 click succeeded，但 `natural_target` 返回 `missing_binding / collection_selection_read_required`。现场 DOM 证据显示点击位于排序栏，其祖先存在与同级元素共享 class 的 div；queryCandidate 为 null，原生 historyTarget.axNameDigest 为 null，没有 fixedTargetAuthority。`repeated_item_without_query` 向上扫描祖先，`same_shape` 仅以同标签与共享 class 就认定重复条目；普通排序控件因此被当成动态集合选择。固定控件豁免只认原生 AX 名称与确认需求的字面匹配，未覆盖此次无 AX 名称的实际控件。该断点不是 LLM 返回格式错误，也不是原生 B-U 停止派发动作；把结构相似直接升级为任务选择语义，是宿主编译规则的错误。

`AuthorCompilation.after_step` 持续保存后续 trace 和编译结果，没有在第一缺口停止。`a-0017 / bat_read_fields` 也已编译为 `s-a-0017`。`materializeHybridPrefix` 使用第一条 not_compilable 的位置过滤其后的全部节点，因此后面独立编译成功的读取节点也不展示。禁止把断开的片段冒充可执行链路是正确边界，但当前用户视图没有同时呈现缺口与后续已观察动作，造成“节点生成停止、仍在试做”的错误反馈。不能通过越过缺口连边、忽略合同、自动重放或取消原生探索来掩盖问题。

后续存在独立缺口：部分 navigate 的 `natural_binding_evidence_missing:url`，go_back 的 `prefix_consumer_boundary_crossed`，以及后续集合选择的读取缺口。另有 media_playback_postcondition_missing，其具体触发逻辑本次未查明，不归因于商品采集。第一断点修复不等于这些缺口消失，也不等于 B-U 的新标签页返回策略或整个任务已经正确完成。

下一次整改的最小边界：复用原生目标身份和页面证据，区分固定页面操作与真正依赖任务输入的数据项选择，禁止用 CSS 样式相似替代业务选择证明；在同一工作台图内明确展示编译缺口和后续观察进度，保持可执行片段与未闭合片段的事实状态；基于本次已保存轨迹逐项核验 URL/标签页/消费绑定，再做针对真实不变量的最小离线验证。保留原始失败，不新增网站重试或模型确认循环，不宣称所有通用任务已通过。

### 本次继续整改：实施范围与验收门

Product Alignment:
- natural-language task: 页面排序/筛选、文档导航、表单操作与动态条目处理。
- reusable chain boundary: 原生动作的目标身份、编译覆盖、状态读取和可复跑节点交接。
- runtime inputs: 已确认需求、实际目标、当前任务输入及已有观察证据。
- dynamic task outputs: 原生动作和编译覆盖事实、页面/范围读取及实际业务输出。
- generic platform capability used: browser-use 原生 DOM 身份和 get_all_children_text、既有 ReadSpec/ValueBinding、在线前缀、Zod、LangGraph。
- replay model calls: 普通节点 0；不新增语义确认或 Agent 重试循环。
- site/task-specific code added: no。

1. 固定控件：保留真实动态集合的读取/选择证明；对没有 AX 名称的控件复用原生 get_all_children_text，只在短且唯一、确实存在于确认需求的名字上建立固定目标授权。复跑也必须核验该名字；旧 hash/XPath 不能在名字变化后点击另一控件。记录摘要而非页面原文，旧来源不补造证据。
2. 在线进度：物化所有依赖已经闭合的合法片段；缺口不连边、不生成运行入口、不允许发布。覆盖数量与具体动作缺口从同一验证后的编译包投影并持久化/展示，不能继续用三个节点代替全部已观察动作。取消/中断后的片段不再标作正在生成。
3. 后续断点：逐项核验此来源中的 URL、返回消费者和媒体缺口。能够由既有事实确定的用原生能力/现有绑定适配；没有事实的保留具体缺口，不把错误的原生返回动作、未读取的动态地址或未证明的选择强行编译。必要时沿已有通用方案修正来源步骤职责，不能给 B-U 加一套编译图指令。
4. 验证与交付：先用所属 package 的最小回归复现固定控件错判与断点后读取被隐藏；再核验真实浏览器中的无 AX 控件重定位和跨页复用。网站不重复试跑，已有失败轨迹只读。开发验证后做对抗 code review；首次失败、修后结果、真实业务未测或未通过均分别记录。

继续核验：现场两次 go_back 的前后 URL 与 tab 均未改变，后续 navigate 使用的地址来自此前其它 tab 的观察，却没有普通输出绑定；不能把这套操作当成已成功的返回方法。排序点击的前后 URL、焦点和控件布尔状态也未变化；只修目标名字仍会被通用效果准入挡住。新增边界是仅对已确认且唯一的固定控件，复用原生 Tools.act 成功回执和可信 DOM 命中作为动作完成证据，不要求任意排序/菜单必须改变 URL 或获得焦点。运行器已有目标准备与可信命中核验，业务是否完成仍由后续实际输出及独立复跑证据承担；不是放开未绑定动态条目或删除显式后置条件。

源码还确认 source ActionDispatchAudit.arm 未传已取得的 callback Element，导致 intentRelation 为 null；复跑端相同 NativeEventCapture 已传 Element。修复这个适配遗漏，来源与运行器复用同一事件命中核验；不修改 B-U 的 Agent loop/原生动作或加入重试。

### 原生返回及先前页面地址的通用交接

现有编译白名单和 OrdinaryCapability 没有 `switch`，且普通动作统一丢弃浏览器输出，所以原生切回已有页无法复跑，先前列表 URL 也没有输出可绑定。最小改造保留原生动作结束后的 `{url, tabId}` 技术输出，复用现有 ValueBinding(node, path)；准备期值只用于证明来源，正式输出来自 runner 本次真实 browser receipt，不保存样本 tab 编号为常量。原生 switch 仍通过 Tools.act，适配层把本次完整 target ID 转为原生四位 tab_id，先核验唯一目标，再用 active_tab 后置条件核验实际焦点；不把原生吞掉的异常当成功。此能力同时用于目录详情/资料页与多标签后台/表单任务，不增加浏览器控制器或状态机。

Product Alignment:
- natural-language task: 进入新标签页处理，然后返回原来源继续；或导航到先前已观察的页面。
- reusable chain boundary: 普通浏览器动作、已有页面上下文输出和后续参数绑定。
- runtime inputs: 现有任务输入与同次运行节点的 url / tabId。
- dynamic task outputs: 本次实际浏览器上下文及后续显式业务结果。
- generic platform capability used: browser-use Tools.switch/get_target_id_from_tab_id/get_tabs，既有 runner receipt / ValueBinding / StepVerifier / LangGraph。
- replay model calls: 0。
- site/task-specific code added: no。

验证门：本地真实 Chrome 固定无 AX 控件、打开两个新页后切回同一来源、换新浏览器 session 后复跑；Python 源编译→TS 物化→普通运行器交接，伪造/丢失目标和编译缺口仍拒绝。没有真实证据的旧 go_back 不改判成功；完整京东业务另作未通过事实保留。

现场第 16 个详情导航还有全页媒体副作用：新页自动视频从 not_playing 变为 playing，被当作导航必须证明的播放职责。它属于目标页观察，不能把“进入页面”改成“播放视频”。最小修复只排除 navigate 或换页/换 tab 的自动播放附加条件；原位播放控制、后续明确等待与现有媒体检查继续保留，既不使用网站关键词，也不增加业务 judge。

对抗审查首个 P1：后退即时观察仍为 detail、等待后为 list 时，旧 context 绑定选即时 detail，而运行器输出完成后的 list，后续 navigate 可能静默走错地址。最小边界：只消费完成条件来源与即时 post 一致的上下文 producer；延迟条件的 producer 跳过，寻找更早可靠来源，没有则保留绑定缺口。TS 也独立拒绝这种输出，旧/伪造编译包不能放行。不新增完成态状态机，不用测试通过覆盖此审查首败。

对抗审查追加 P2：同 URL/tab 下重新创建文档时，新页 autoplay 仍被当同文档播放。新增回归先复现 media_playback_postcondition_missing；按真实来源摘要校验后的 document_identity 明确不同时排除附加播放条件，缺失/旧身份及同文档仍走原验证。固定派发同文档证明也要求合法 targetId/documentDigest，不接受空对象冒充身份。


## 在线编译、标签页上下文与真实进度：本轮最终记录

针对用户“浏览器仍在执行，画布只生成前三个节点”的反馈，读到任务 2aaa0674-ce91-462a-bce4-c21502ce755c、job 5760502a-3037-426a-8d6f-d60669d1fa7b 的实际持久化来源：17 个动作，编译覆盖为 4 compiled / 11 not_compilable / 2 excluded；旧画布仅 3 节点。原任务 interrupted，sequence=173、build.sequence=18。不能把这次失败归为商品配置字段、数据清洗或模型输出格式错误。

### 已修复的宿主边界

1. 固定控件没有 AX name 时，复用原生 get_all_children_text 的短文本、确认需求与唯一性生成固定目标；运行中名称必须匹配且唯一，不回退旧 XPath/hash。未确认的动态条目仍不得冒充固定控件。原生派发审计收到实际 Element，固定点击采用可信原生事件、动作回执及合法同文档证明，不用空后置条件放行。
2. 前缀物化不再在第一个普通编译缺口截断所有后续节点；只展示依赖已经闭合的片段，不跨缺口连线，不补 entry，不授予运行/发布权。缺口继续阻止发布，原生探索不因普通编译缺口被停止。
3. 普通动作按需输出本次真实 {url, tabId}，后续 URL/切页使用现有 ValueBinding；输出来自正式 runner receipt，不固化准备样本的 tab 编号。switch 统一进入 Python、TS 传输及运行白名单，复用原生 Tools.act/get_tabs/get_target_id_from_tab_id，要求完整本次 target、唯一四位别名和实际焦点后置条件。
4. 上下文 producer 必须在即时来源真实成立。仅适配 URL、URL 摘要、活动 tab 三种现有条件，核验实际参数、种类、值及必要的前后态；迟到、缺失、错误事实或假变化不产生上下文输出。合法 navigate/switch 同时保留原生证明，并将完成引用投影到对应即时状态 fact。其它完成条件不擅自推导上下文，也不新增通用 verifier/状态机或结尾 judge。
5. 导航、换页/换 tab 及可信同 URL 新文档的 autoplay 不增加播放职责。同文档显式播放仍验证；document_identity 只投影验正的 targetId/documentDigest，额外元数据不能冒充新文档。
6. 新/历史 build 显示动作覆盖和缺口。历史完整编译包按原严格 coverage/gaps 字段校验，再 strip 未展示字段；不改写原 payload。准备 interrupted/cancelled/failed 优先于残留 phase，侧栏不再把中断任务显示为“浏览器处理中”。清理与历史 lease 的独立优先级保留。

### 首次失败、修复后证据及未测边界

| 验证 | 首次失败/审查问题 | 当前结果 |
| --- | --- | --- |
| 固定目标合同 | 无 AX 的确认控件被当动态集合 | 6 项定点通过；缺名、重名及漂移不回退 |
| 前缀物化 | 第一缺口后闭合节点被截断 | 3 项通过；不跨缺口连接、不生成 entry |
| 真实受控 Chrome | 原生记录/编译/新会话复跑 | 原生 Tools 的 7 动作、7 segments、0 gaps；新 session 复跑、打开两详情后返回同一来源，整块内容读取，复跑 0 模型调用 |
| Python→TS 实际交接 | 第二份动作白名单遗漏 switch | 现统一白名单；实际本地来源物化 7 节点/6 边，严格普通命令协议通过 |
| 对抗 P1 | 等待前 URL 与完成后 URL 混用；缺失/错误事实引用绕过 | 生产迟到来源及缺失/null/错误事实/假变化均拒绝；实际值、种类、前后态独立检查 |
| 对抗 P2 | 同 URL 新文档 autoplay；相同摘要加 extra 冒充新文档 | 两种回归闭合；缺失身份或同文档仍保留播放缺口 |
| 收紧兼容性 | 正常导航/切页引用不一致，合法 producer 被拒绝 | 生产 navigate→switch→navigate 编译 3 segments/0 gaps，TS 3 节点/2 边与本次 tabId/URL 命令通过 |
| 历史进度 | strict pick 拒绝完整旧包，实际服务仍无进度 | subset strip 修复；历史包读取、非法 disposition 拒绝、原 payload 不变的 1 项通过 |
| 清理函数收尾 | 老测试先因默认日常模式无 endpoint、再因非法 owner UUID 在启动前失败 | 修正隔离模拟子进程的模式及合法 owner；主错误与 cleanup 独立、lease 交付两项定点通过，未改变生产清理语义 |
| 类型与界面 | 新联合类型收窄首轮失败；最终 UI 检查最初误选菜单按钮 | API/Workbench check 通过；最终使用任务选择按钮的真实 ARIA 名验证侧栏与进度，0 pageerror |

真实 Chrome 用例是受控本地、原生 Tools/回调驱动的能力验证，未使用自然语言 Agent 从生产入口生成完整业务，也没有正式发布该前缀。两个明确固定入口不能算动态来源循环验收；内容读取不能算原京东商品区域及原图采集成功。没有重跑京东、触碰/绕过验证或追加模型 judge。

最终 Workbench 4173/API 4175 通过现有同项目进程守卫刷新，health PID=12980。复合后台启动命令曾被自动审批拦截，未执行；既有守卫确认当前 checkout 的进程后成功刷新。最早活跃任务查询误查旧 taskContracts 类别，不具证明力；最终从实际 taskAuthoringJobs/taskExecutions 只读确认 active=0。

最终真实 UI/API：17 已记录、3 旧节点、11 未编译，侧栏“本轮未完成”、准备“已中断”，有具体缺口。原 job 仍 interrupted/sequence173；原 payload SHA256 c98d16b52e70e7c88e32d154bde50dcc9fe37e1a284794e9175dcb97874a7508 前后相同，storedCompilation 仍 null，仅只读投影。证明保存在 work/native-context-probe.json、work/service-proof/final-progress.json 和 final-progress.png，不把它们写成 Git 快照。

受管源码最终摘要 091e010554ccd8eb29166c42102287322c11b007826ccb5536dee84bcb9199e3 已登记。未运行根级/全量验证；已通过组只在新修改、真实失败或成立审查问题后定点扩大/重验。没有提交、推送、worktree、相邻项目改动或关机；保留服务。

**主业务验收仍未完成。** 原京东的动态入口选择、稳定循环、完整目标范围内容、独立复验、发布及正式业务复跑尚未得到整链成功证据；旧缺失/中断来源不能补造。当前记录解决本轮成立缺陷，不表示所有任务已能完成，也不覆盖网站验证人工等待及早前导航观察失效的未验收门。

## 完整逐项任务修复：入口不能等同于 URL

用户否决局部七动作复跑交付，继续修真实任务。原始来源的两次 `find_elements(a)` 分别为 152/100、151/50，均不完整；实际标题入口为 span，祖先无 URL 属性。来源步骤只允许交 URL，却指导点击后在详情页读取 URL：该读取能证明一个落点，不能生成列表上其它条目的可复跑入口方法。故失败属于宿主方法/计划交接，不是配置字段或 LLM JSON 问题。旧中断来源不改写。

Product Alignment:
- natural-language task: 从当前目录、搜索结果或后台列表选择条目，逐项处理相关页面。
- reusable chain boundary: 来源链读取完整候选并应用确认的 take；同一个单项链接收实际入口，逐项复跑。
- runtime inputs: 本次来源读取产生的浏览器页、查询和条目身份；原任务参数。
- dynamic task outputs: 每项实际页面/范围内容及来源，或其它已确认单项结果。
- generic platform capability used: 原生 Page/Element 查询、Tools.switch/click、ReadSpec、ValueBinding、既有 each 编排和 LangGraph。
- replay model calls: 普通节点 0；不新增完成 judge、逐项模型探索或另一套循环执行器。
- site/task-specific code added: no。

最小实现：来源允许宿主生成元素入口描述，包含实际页/标签、复用查询、原集合序号及实际文本身份；不猜造详情 URL。来源工具只声明候选范围和确认的 take，完整读取与类型由宿主负责。单项探索仍由原生 Agent 切回来源并点击；采集层核验点击实际目标与输入入口一致，编译为输入绑定的入口目标。普通执行复用 TargetResolver 与原生 Tools，重新查询并核验身份；不能以旧序号点击变化后的其它项。源码中不固化网站选择器、商品字段或数量。已有真实 URL 的旧链继续保留。

退出门是同一生产需求完成来源、单项内容链、样本、独立复验、发布和正式逐项运行；只记录实际交付内容和模型调用审计。局部测试用于保护跨语言入口边界，不再当整链交付。开发验证后对抗审查。

### 生产路径首败：步骤职责和能力注册必须贯通

- `fixture-AdC5NB`：来源提示仍允许进入详情探查，且完成标准沿用了完整任务的内容交付。Agent 按此提示执行后，来源链出现 `collection_selection_read_required` / `natural_postcondition_not_admitted`；不是入口读取成功即可发布。修复来源职责为保持列表并读取入口，完整需求保留，但各步只执行当前阶段的合同。入口字段和来源键补齐既有 bounded-schema 上限，不扩大准入。
- `fixture-mJsa0V`：修后来源链已无编译缺口，单项 Agent 明确报告原生工具没有 `switch`。实际注册表仍把 switch 排除，尽管采集策略、编译器、传输协议和执行器支持它；前次手动工具验证未经过这份注册表，因而遗漏。移除已具来源身份合同的 switch 禁用项；关闭标签页仍受现有资源权限边界限制。
- 修后先以实际 `author_tools` 注册表核验四位别名的原生 switch 与全部动作的 capture policy，再运行同一生产入口的完整受控用例。不改 Agent loop，不做模型补问，不伪造旧失败包。受控目录刻意使用无 href、点击新 tab 的入口，并在正式运行前将 3 项改为 2 项；只有真实逐项图文产物和 0 隐式模型调用成立才算这一验证通过。以上两次首败保留，不能用后续通过覆盖。

当前真实网站任务仍须沿相同生产路径取得完整结果；受控成功不能替代原任务成功。

`fixture-As9nmD` 第三次首败进一步定位到新增入口适配本身：采集器使用既有 `{kind,value}` 证据摘要，入口编译却误按 value 单独校验，原生成功点击因摘要误判触发 prefix 异常。保留该失败，在原来源上离线复现 `input_entry_target_invalid` 后修正，不重复模型探索来定位。修后同一来源 Python 前缀为 2 segments / 0 gaps，生产 TS 物化得到输入绑定的 switch→click；这仅证明该断点闭合。新增所属 Python 3 项回归保护原生 switch 注册、跨层证据格式、重排后的身份与重名拒绝，已通过。完整用例另行继续，未以此局部门交付。

### 完整受控生产路径通过，真实网站继续验证

`fixture-M4pUOl`（task `6874a140-2eb6-4d90-8416-72bbdf1b5508`）已从真实原生 Agent 准备、样本、独立验证到发布及正式运行完成。来源和单项共享既有 each；单项 6 observed / 4 compiled / 2 excluded / 0 gaps。发布 `998d771e-91d7-4b73-8504-5ac23d6aee93` 后目录从 3 变 2，正式结果准确为本次 2 项，范围外文字未混入，每项范围文字/表格和原图字节成立，正式模型调用 0。它是整项受控业务通过，不是手动固定动作前缀。

API 类型检查通过，修改的 Python/TS 文件及函数物理行数符合限制。新增测试登记后受管源为 `798b5871688c6b5d5bd66a9a2f91cb104efa707986ae05a7df88c3a274aec79d`（完整用例时为 `c191e478a13be9fc6c40992f2170443f3194aade0266ff462e4f1f829de3348c`，后续仅新增测试登记，运行源码未变）。已启动独立对抗入口交接审查。原服务无活动 authoring/execution 后，经现有端口守卫确认同 checkout PID12980 刷新为 PID18796；不停止其它 checkout。原京东任务沿实际 HTTP 生产入口继续验收，尚不以受控结果替代它。

### 真实来源能力缺口与对抗问题整改

真实京东 job `8e12f92a-adec-4f92-83ac-0b225a3318cb` 已原生完成导航、输入、Enter 和销量点击（4 compiled / 0 gaps），但只做了一次 a[href] 探查后 done=false：原生商品索引可见，工具没有向它提供可证明 CSS 范围，宿主却把声明该范围作为入口读取的前置。首次失败保留，未将其归为 CAPTCHA 或 LLM 格式失败。

Product Alignment:
- natural-language task: 选择真实列表条目并逐项处理。
- reusable chain boundary: 原生元素选择→宿主来源范围方法→同一单项链。
- runtime inputs: 当前 B-U 元素索引与确认的选择数量。
- dynamic task outputs: 本次真实入口列表、每项结果与来源。
- generic platform capability used: 原生 DOM/Actor 查询、既有 record projection、ReadSpec/ReadSample、ValueBinding/each。
- replay model calls: 0。
- site/task-specific code added: no。

最小修正：入口读取优先接收 indices，宿主复用已有 DOM 投影生成共同范围，并核验原生 backend 与真实集合前缀；持久化一份选择证明，Python 编译和 TS 独立校验后沿现有 ReadSpec 复跑。浏览器查询仍由原生组件执行，不让模型学习 DOM 父子关系或输出编译图。CSS 与成功 readRef 旧入口继续兼容。

对抗审查 3 个成立问题同步修正：输入入口失配不能退回固定条目，来源页未绑定的导航不能进入单项链；同页辅助弹窗仍复用原准备机制。准备前/后 readiness 传入同一 targetEntry，并复用普通命令的入口实化。单项拆分保留已有 ResultSpec 字段和 count 派生关系，按单项 schema 投影路径，不再把多 producer 合并为根字段。

新增/修改的所属定点检查为 TS 8 项、入口 Python 5 项通过；受影响的既有 method-read 工具与证据 20 项通过。它们验证上述边界，不代表真实京东任务已完成。新的完整路径继续核验。

### 原生索引完整验收及对抗复审闭合

`fixture-hMVqFz`（task `8040b59a-cc3d-4e9a-80fb-aa59bb4081df`）从实际原生 Agent 的来源 `indices:[7,8,9]` 读取开始，完成单项探索、样本、独立验证、发布及正式运行。来源选择证明实际持久化；来源 3 动作、单项 6 observed / 4 compiled / 2 excluded / 0 gaps。发布 `28c5f6b0-95ce-419a-8e77-2b4955fe75e4` 后来源由 3 改为 2，正式返回本次 2 项，文字、表格、区域原图字节成立，范围外内容未混入，正式调用模型 0。这是生产入口完整受控验收；不替代真实京东。

对抗复审仍发现 P1 窄口：入口为 button，原生点击其它条目的 span 子控件并在同 URL 打开详情时，仅 backend 相等检查会把它归为辅助控件。修复复用已有原生 DOM 包含关系，在任何异步查询前冻结同文档祖先/子树 backend；直接命中其它入口或包含关系未能证明同一点击时标记 `input_entry_mismatch`，Python/TS 原 guard 均阻止固定目标退路。同文档且与条目没有直接包含关系的辅助控件保留现有准备机制。未新增选择器解析器、DOM 模型上下文或模型重试。

新增错误路径验证覆盖 B 输入/A 子控件/同 URL、快照后 DOM 重建、不相关辅助控件和公共祖先。首轮因复用 helper 名拼错而 ImportError，修正为已有 `_walk_structural` 后仅重跑该失败用例，通过。此前 5 项入口检查通过；总共 6 项有通过证据，不用一次失败掩盖或重复全组。修改文件/函数物理行数仍符合限制。

独立 `adversarial_entry_handoff_review` 最后定点静态复审：入口归属 P1、readiness P1、原 fields/derivations P2 均关闭；新增 indices 路径未发现成立 blocker。审查不代替行为验收，也不宣称系统所有任务无 bug。

最后受管源码 `b6bb95f225d8b76d48550fa22270f6e6a5b5c594eece022ccbf613240261b087` 已登记。实际业务表无 active job/execution 后，通过同 checkout 开发守卫从 PID18796 刷新为 PID17020；原任务新 job `9af8745b-e175-4db0-8798-57d95a8cec92` 开始实际完整验收。当前尚未取得真实京东完整结果，不作为交付通过。

### 真实重复读取被误认作循环：先记录修复边界

本次原任务已成功读取商品入口，B-U 在同页再次调用相同读取并以 readRefs r2/success=true 完成。宿主仅凭同 outputPath 的两次读取调用 repeat annotation；真实两份规格、区域身份、来源页、覆盖和样本输出相同且中间无推进动作，模型正确返回 not_applicable，却被宿主变成 `repeat_annotation_not_applicable` 缺口并拒绝最终编译。已保存 rejected artifact `2696d2f4-9d36-4078-8bd6-28635f2c3b86` 与首次失败，不重写为通过。

Product Alignment:
- natural-language task: 来源读取及通用列表/分页任务，允许原生探索再次确认同一读取。
- reusable chain boundary: 同范围只读确认与实际推进后的重复收集，按已有浏览器来源证据区分。
- runtime inputs: 已有 NormalizedTrace、VerifiedNaturalRead 的方法/来源/区域身份/覆盖与样本。
- dynamic task outputs: 保留原成功读取与最终输出；实际推进仍要求现有循环方法证明。
- generic platform capability used: 原 repeat annotation/validator 与原生派发事实；不新增循环器。
- replay model calls: 0；宿主已能确定的重复确认不再调用注解模型。
- site/task-specific code added: no。

最小修法：只有同方法、同来源/文档/区域身份、相同覆盖/样本且区间全为受限只读探查时，排除循环注解候选，沿既有线性读取与最终 producer 编译。任何 click/scroll/navigation、不同范围/文档/样本或缺失身份证据仍保留原重复方法验证，不放宽真实分页循环。使用已保存真实来源离线验证，再实际运行。

修后所属 repeat annotation 9 项通过；原 rejected 包的 completed=true request 保持原字节，离线生成 6 segments / 0 gaps，生产 TS 物化得到 9 节点/8 边，未调用模型、未把旧 failed job 改成 completed。离线检查脚本先误取 plan 引用/旧 plans/未发布 contract 表，3 次读取失败；核验事实源为 job.preparation.candidatePlan 后才得到有效物化证据。源码文件/函数行数符合限制，受管源码登记为 `793c7be9c2399a31bf75e9647018879299998b6d41a0af9d9bea7d7be0b320a2`。

对抗定点复审确认纯读取过滤安全成立：前提包含完备同范围身份，推进、身份缺失及样本变化仍原循环门；原读取验证器仍检查回执、方法、来源和输出，未删除动作或改写历史。原任务新 job `636252fd-2bed-4883-8668-fe9e610ef54a` 正在实际 API 完整验收；本轮只修改 Python 编译逻辑，新受管子进程直接加载，未重复重启未变的 TS 服务。

### 来源阶段把代表样本误作最终数量：实际失败及修复边界

`636252fd` 来源 7 普通动作全部编译且无缺口，三个成功读取均为当前 total=5、sampled=3、代表序号 1/4/5，最终 B-U done success=false，明确理由为“缺少 2/3，商品标题未证明为真实详情入口”。另有一个 agent 调用 `ai_structured_output_invalid` 独立保留，不把它说成整轮根因。前次相同任务已经能够 done success=true，表明这是阶段合同和工具反馈的歧义，不可改写这次失败为成功。

沿原入口 Product Alignment 和 Reuse Assessment：宿主保持已验证 ReadSpec/ReadSample/each；仅澄清来源阶段只证明选择方法与来源身份，激活入口由后续代表单项执行证明。原生记忆反馈说明 total 与代表 sample 的区别，再读仍只给样本，最终普通运行按方法读取完整选中项。不得把“方法验证”说成“全部内容已采集”，不得强迫 LLM 忽略实际排序/范围错误或给成功；仍由原生结束声明和后续真实点击、独立复跑把关。不修改 Agent loop、输出 JSON 合同、采样策略或产品模型路由。

修订仅利用原 long_term_memory 反馈，不改变 extracted_content、动作 schema 或方法证据格式；源步骤说明把详情激活责任交给下一代表步骤。通用任务说明另外明确当前 DOM total 不能代表跨页全任务数量，跨页/后续批次仍要真实推进与停止方法。未为这次文案澄清新增镜像文本测试，API 类型检查通过；受管源码 `bf0b4ad1b6455ac43881a32a3815eda9c2ac1857bf4acaef124926c21372ce33` 登记、文件/函数行数通过。无 active job/execution 后按现有身份守卫重新加载实际 TS 阶段文本，服务 PID15516；新实际 job `cccee080-5973-4a41-88cc-aefc88950f37` 继续完整验收，未改变产品模型路由。

### 原生索引必须绑定模型所见快照，错误必须保留阶段

`cccee080` 已失败：4 个普通动作编译、0 缺口，入口读取 indices 失败为 `bat_read_fields_failed`，随后原生 done=false；未到单项详情，不是完整验收通过。现有错误包装无法确定异常具体阶段，不把猜测写成已证实根因。核验 B-U 0.13.8 公开 `BrowserSession.get_dom_element_by_index` 实际仅查当前缓存，不绑定之前交给模型的 summary；B-A-T 的数组索引没有像普通目标一样在异步采集前冻结身份，这是独立成立的交接缺口。

Product Alignment:
- natural-language task: 从当前页面选择多个真实入口并逐项处理，适用于目录、搜索结果及工作列表。
- reusable chain boundary: 模型所见原生观察 → 本次读取方法 → 参数化单项链。
- runtime inputs: 当前动作的原生索引与该观察的 target/backend/url 身份。
- dynamic task outputs: 本次真实入口列表及既有读取证据。
- generic platform capability used: B-U 原生 selector_map/EnhancedDOMTree/Actor、既有投影与 MethodReadRecords 所有权。
- replay model calls: 0。
- site/task-specific code added: no。

最小实现：在 callback 首个 await 之前保存不可变索引身份，由本次工具一次性消费；新原生 DOM 与 Actor 查询继续核验相同 target、URL 和 backend 前缀，不重新解释旧索引。缺失、过期或跨页身份拒绝，不能退回当前缓存误选。沿原工具错误出口返回固定阶段码，禁止异常正文/敏感 DOM 进入日志或模型。先复现缓存重建的错误路径，再修实现；原任务失败保留，真实异常根因仍待阶段证据确认。

零模型复现确认旧缓存丢失会报 native_entry_indices_invalid；修后新增 6 项定点检查通过，受管源 `29bd9571ce6114ebdbbbb9aacf6380844e6af6e4b28f3c96dc46681e0dc4eb29`。真实 job `99acbc3e` 仍失败，但固定阶段码已证实异常在 sample，不在索引选择；另保留销量点击的 collection_selection_read_required 编译缺口，不能笼统说都已修好。

对抗复审发现成立 P1：选择核验与采样之间仍可发生同 URL 重载或集合重建。沿上面的 Product Alignment 补齐交接：复制原观察的唯一同 target html 元素身份（即 CSS :root，不把 #document backend 错当 html），选择证明保存 documentRootId 和完整匹配集合摘要，登记与 Python/TS 编译均验证其与 ReadSample 一致。只复用原生 DOM/Actor 与原采样证明，不另建浏览器状态机。

真实 sample 异常仍须诊断：未知异常只保留固定阶段、允许的异常类型、项目函数/行号及允许的验证字段/类型；不保留异常正文、输入值、局部变量或页面内容。该诊断用于找到宿主错误，不能把故障解释为 LLM JSON 格式失败或通过重复试做掩盖。

上述交接补齐后，8 项所属定点验证及 API 类型检查通过；文件/函数行数通过。受管源 `35fe5b0e5c1ab7a95337dff5a933ae1b0d126ff10341518bb21ac97b47534bb6`；无 active job/execution 后经同 checkout 守卫重载服务。对抗复审确认 P1 关闭、诊断不含消息/输入/页面/完整路径，原生 Agent 继续由其原 loop 推进。当前实际 job `16cf6303-0c66-47bb-846b-ca62dc759669` 运行中；原任务依旧未取得完整详情结果，不宣称交付完成。

### 已证实根因：把可点击入口的展示文字误作必填身份

`16cf6303` 首次 sample 错误具体为 ValidationError，调用链 sample_read_fields → project_field_records → live_entry，验证字段 text/string_too_short；随后原 job 已自行失败。原生选择及范围核验成立，但合法无文字入口被 B-A-T 自增的 minLength=1 拒绝。根因是入口契约用文字充当元素身份，而不是 LLM 不理解配置、间隔不足或验证码。仅让模型改选有字标题会掩盖这条通用错误，不采用。

Product Alignment:
- natural-language task: 从列表、图片目录或同名工作条目选择并激活实际入口。
- reusable chain boundary: 本次来源读取 → 参数化单项入口激活。
- runtime inputs: 当前受控 tab、URL、文档根、原生 backendNodeId 和读取范围；text 仅作展示。
- dynamic task outputs: 本次真实入口及完整后续处理结果。
- generic platform capability used: 原生 Actor 的 get_basic_info/CSS :root、已有 ElementEntry/ValueBinding/each。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 激活无文字或同名条目，并拒绝旧文档/旧元素冒充新入口。
- existing implementation in repository: ElementEntry 及原生 TargetResolver；当前错误是自增文字身份合同，不是缺少浏览器组件。
- mature candidates and pinned versions: B-U 0.13.8/cdp-use 1.4.5 的既有元素 backend、CSS 查询和 DOM 文档根。
- selected implementation: 原生身份，B-A-T 只绑定/验证当前输入。
- reused public surface: Page.get_elements_by_css_selector、Element.get_basic_info；不增加选择器或浏览器控制器。
- B-A-T-owned adapter and remaining gap: text 允许空值，保存当前 backend/文档根；激活只匹配真实 backend 并验证文档，展示文字不决定身份。
- license/runtime/platform fit: 既有受管版本与 Windows Python 3.12，无新增依赖。
- browser/runtime/state ownership conflicts: 身份只对本次来源文档有效；重载/元素替换必须拒绝，不能借 ordinal 误点。
- replay model calls: 0。
- rejected candidates and evidence: 不改 B-U 原生 Agent/点击逻辑，不用模型重选标题绕过宿主合同错误。
- focused validation: 无字/同名入口可准确激活，重排仍命中 backend，文档/元素替换拒绝；运行去重键不包含新增临时 backend/根身份。

实际根库已发布 ElementEntry 合同数量为 0，本次新入口功能尚未发布，无旧发布版本迁移。修改后 15 项 Python 入口/观察定点检查、8 项 TS 规划/准备检查及 API 类型检查通过，文件/函数行数通过；未重复全量或受控全路径测试，下一验收仍为原真实任务。对抗审查继续定点核验原生身份绑定和去重键。

### 命名目标唯一性必须与原生节点关系一致

`2c1f9257` 无字入口读取实际成功，6 原生动作（含 done=true），宿主因排序点击的 collection_selection_read_required 拒绝发布。目标 textDigest 精确对应“销量”，需求 text/taskText 均含该字面量；固定目标检查拒绝同 tag/同名的多项映射。没有证据支持把这次失败归为 LLM 不理解排序。原选择动作、样本和失败仍保留。

Product Alignment:
- natural-language task: 搜索/目录筛选及表单/工作页面的固定控件操作。
- reusable chain boundary: 已确认字面控件 → 原生已观察点击位置 → 普通复跑。
- runtime inputs: 原生元素/稳定 hash/XPath、命名摘要、目标关系及同文档范围。
- dynamic task outputs: 控件执行后页面状态及后续结果。
- generic platform capability used: 原 B-U history identity、原生祖先关系及原命名目标准入。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 消除同控件父子同名与重复映射的错误歧义，拒绝独立同名目标。
- existing implementation in repository: history_target/fixed_target 与原 _ancestor_has；不重写原生定位。
- mature candidates and pinned versions: B-U 0.13.8 的 DOMInteractedElement 和 EnhancedDOMTreeNode。
- selected implementation: 原生 identity + 原关系辅助函数。
- reused public surface: 原 element_hash/compute_stable_hash/XPath 与 native parent_node。
- B-A-T-owned adapter and remaining gap: Source/runtime 统一“单一命名祖先链”唯一性；多名节点仍需原生身份唯一命中实际原点击位置，不能任取父子。
- license/runtime/platform fit: 既有受管 Windows 依赖，不增删库。
- browser/runtime/state ownership conflicts: 同 target/main frame，排除 is_visible=False 的门一致；独立同名分支、跨 frame 和输入入口失配仍拒绝。
- replay model calls: 0。
- rejected candidates and evidence: 不按网站 class、特殊词或样式猜控件，不用模型补注解。
- focused validation: 父子同名与重复映射、隐藏副本可消歧；不同分支、缺失原生身份及跨 frame 必须拒绝；现有入口 guard 保留。

上述命名目标修复所属 14 项 Python 检查通过，修改文件/函数行数和定点 diff 检查通过。受管源登记为 `d346d081b93604b11de53efb439d4780c23eb1c3313e41707ff75e3266d3c6e3`。未修改 TS 逻辑或重复重启服务；实际服务 PID18980，新原生子进程读取登记后的源。当前原任务实际 job `cf0c70a0-724e-4f49-8185-c2904360aff9` 正在完整验收，原任务仍未完成；对抗 agent 正在定点审查本次唯一性边界。

定点对抗审查完成：未发现新增阻塞；确认线性祖先链不会合并独立同名分支，多节点仍需原 hash/XPath 唯一定位，Source/runtime 过滤一致且被过滤原目标不授权，未增加模型调用。该审查为静态证据，不替代真实验收。`cf0c70a0` 来源已实际完成排序与入口读取的 5 动作编译，0 缺口；等待完整任务后续结果。

### 来源读取的方法证明不能替代业务入口识别

`cf0c70a0` 来源真实完成并进入单项，原生 switch/click/switch 均编译；单项 find_elements 证实选中入口通向客服页面，原生 done=false，未生成详情内容、未发布。来源实际选中的 5 个节点共享客服图标链接范围、文字均为空。B-U 原生截图已启用，不能说完全没有看到页面；但宿主入口结果和 sourceMethodGuidance 只有读取成功和空文字，没有回传选中原生节点已存在的可访问名/链接目的源，且“方法已验证”反馈混淆了技术证明和业务正确性。保留原失败，不改判成功。

Product Alignment:
- natural-language task: 列表/目录选择真实条目后逐项处理，亦适用于表单工作入口。
- reusable chain boundary: 原生已观察入口 → 范围方法样本 → 代表单项激活。
- runtime inputs: 同观察中已核验的 native index/backend、可访问名及已有 href 目的源。
- dynamic task outputs: 真实入口集合与后续页面内容；不新增业务字段。
- generic platform capability used: 既有原生 DOM 属性、EntryObservation 与工具 long_term_memory。
- replay model calls: 0；不增加判断模型或强制探查动作。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 把已有入口识别信息交回原生 Agent，使它能纠正错误选择。
- existing implementation in repository: B-U native node attributes/AX name、冻结的 EntryObservation、method_read_tool feedback。
- mature candidates and pinned versions: 现有 B-U 0.13.8 / W-U 0.2.11，不改变依赖与原生 Agent。
- selected implementation: 复用既有观察与 long_term_memory；标准库 URL 解析只展示目的源。
- reused public surface: native attributes/AX name 和 ActionResult.long_term_memory。
- B-A-T-owned adapter and remaining gap: 只返回本次已证明代表入口的有限识别预览；反馈明确读取证明不判断业务目标，不按域名/类名替模型选择。
- license/runtime/platform fit: 既有 Windows Python，无新增依赖。
- browser/runtime/state ownership conflicts: 不再次查询或操作浏览器；预览来自同一冻结观察，不含 DOM 父子结构；href 不返回路径、查询、片段或用户信息。
- replay model calls: 0。
- rejected candidates and evidence: 不写网站入口白名单、标题必填或自动语义 judge，不强制改变原生探索顺序，不为当前失败添加自动模型重试循环。
- focused validation: 预览随观察冻结，非法链接不泄露原值，仅匹配真实代表 backend；空文字入口仍合法，方法证明仍不能宣称业务正确。

上述反馈补齐后所属观察 10 项检查通过，工具文件 464 行/最长函数 79 行，定点 diff 检查通过。受管源 `f1b91d1235b515cedc6d8de81ec0a36de9b00b06fc14d9d99453ce2b964c2a85`。确认无 active job/execution 后用同 checkout 守卫重载步骤文案，实际 API PID14628；无新增模型调用、强制探查动作或原生 loop 修改。继续原任务全链路，不把客服页误选历史抹除。

`786a0903` 修后模型正确识别样本目的源是客服，但原生 done=false 未继续找到真实详情入口；这次未误进入单项、未发布。固定环境检查证明 B-U 0.13.8 的 Agent.include_attributes 公开参数默认采用 AgentSettings.include_attributes，其中没有 href。此前启用了原生截图，但没有启用已有 href 观察配置，使无文字链接的目的信息在首次选择前不足。沿上述 Product Alignment/Reuse Assessment，最小补齐为复制原生默认属性并追加 href，不覆盖其 title/alt/AX 等现有属性，不改 serializer、Agent loop 或模型路由，不新增模型判断/重试循环。原生提示仍不保存会话；href 只用于当前原生页面判断，宿主诊断不打印原始链接。

对抗定点审查发现 P2：urllib 与浏览器对反斜杠 URL 的解释不同，可能把路径混入 origin。非规范反斜杠 href 不生成 origin 预览，普通选择/采样保留；该错误路径单项检查通过。其他代表 backend 绑定与普通 URL 去除 path/query/fragment/userinfo 未发现新增问题，真实全链路另验收。

P2 静态对抗复核关闭；原生 href 配置确认保留全部默认属性、使用公开接口、无新增模型循环或直接持久化路径。受管源 `8285e68b6d13bff95426b10ae11ec47ae3ca377e971eaaf6e0ad91ca2d43823a`，author 文件 313 行/最长函数 95 行。新 job `7eef6f7f-f710-4d2f-8ed4-4c1fc63f0096` 已实际选中商品标题范围，来源 5 普通动作全部编译；单项实际到达 item.jd.com，详情点击和滚动均编译。整体采集及完整复跑尚在执行。

验收脚本的等待预算可显式设置至最多 15 分钟；若脚本预算到期，产品 job 独立继续。续查时已有 active activity 不再派发 prepare_task，只等待同一 job 后验证原输出；不会因验收等待线重启模型探索。脚本超时首败与产品结论分别保存。

### 普通执行的入口命中与业务范围验收

`7eef6f7f` 在来源与单项原生探索都成功后，实际草稿试跑 execution `507f00a4-dbef-4592-8ba6-a84fb928c9bf` 失败。来源普通运行完成；单项 checkpoint 明确停在 `s-a-0002`，即第一个输入绑定入口点击，尚未采集正式内容；0 模型调用。原探索同一类点击的可信 DOM 事件是 self，不能把故障猜成点击到祖先或改选客服。宿主报 `target_hit_blocked`，具体遮挡仍未证实。

已确认通用闭环缺口：现有 target_readiness 将该码识别为 blocked，但现有 tenacity 有界“等待目标可操作”策略漏掉它，第一次遮挡即失败，与未显示/禁用等等待不一致。沿原策略等待同一目标可操作，不重派动作、不自动关闭遮挡、不换目标；持续遮挡仍按原预算失败。此修复先验证瞬态 blocked→ready 的原错误路径，再使用当前草稿试跑，不重启已成功原生探索。

Product Alignment:
- natural-language task: 列表入口、表单控件及动态页面上的普通点击。
- reusable chain boundary: 同一当前目标的可操作准备 → 单次原生浏览器动作。
- runtime inputs: 既有目标身份、文档及 target_settle 预算。
- dynamic task outputs: 原动作结果；不改变条目、数据或数量。
- generic platform capability used: 既有 TargetResolver 与 tenacity AsyncRetrying。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 等待同一真实目标短暂遮挡结束而不重派浏览器操作。
- existing implementation in repository: OrdinaryCapability.resolve_target、TARGET_READY_POLICY、READINESS_BLOCKED_ERRORS。
- mature candidates and pinned versions: 当前已安装 tenacity 与 B-U 0.13.8 的原生动作派发/可信事件校验。
- selected implementation: 仅补齐原有错误分类，保留 30 秒/100 次和原硬截止。
- reused public surface: 已使用的 AsyncRetrying/retry_if_exception/stop/wait API，不新增等待器。
- B-A-T-owned adapter and remaining gap: 分类一致性；持续遮挡、歧义和身份错误仍拒绝，不能等待后强行点击。
- license/runtime/platform fit: 既有依赖与 Windows 运行不变。
- browser/runtime/state ownership conflicts: 每次仍核验同一目标和文档，动作只有准备完成后派发一次。
- replay model calls: 0。
- rejected candidates and evidence: 不追加固定间隔、不让模型反复找路、不删除命中或可信事件守卫。
- focused validation: 短暂遮挡准备成功、持续遮挡有限失败、歧义不重试；随后当前真实草稿完整普通试跑。

人工核验捕获的原始 JSON另发现范围不完整：`#detail-main` 的 19 原图/HTML 是图文子区，HTML不含商品配置文字；回执 preview 被样式文字占据。完整 byte capture 与任务所需内容是不同事实，不能凭 19 图片判定交付。原产物保留；需改善原生可读区域反馈，并由原 Agent选择包含请求文字/表格/图片的整个区域，不增加配置字段清洗或全局语义 judge。

瞬态遮挡检查先复现失败，补齐分类后 3 项所属准备检查通过；原命中/可信事件守卫未删除。现有草稿普通试跑 execution `76a21cec-3f1a-4519-8f40-2275ff43cab6` 仍失败在第一个入口，0 模型、耗时约25秒，证明仅补等待尚不能解除实际遮挡。保留此失败，不冒充根因已解决。沿现有 owner 诊断通道补充固定 pointerBlocked/hitRelation/center/viewport/scrollTop，禁止节点名、DOM、链接或异常正文，诊断失败不得覆盖原错；下一次只复验现有草稿并取得实际几何证据，不重做原生探索。

诊断试跑 `a7f45cca` 的准备硬截止把最后已知 target_hit_blocked 覆盖成 TimeoutError，原安全诊断随之丢失。该错误路径先验证：测试导入 asyncio 首次遗漏的 NameError 独立保留，修正测试后实际复现 TimeoutError；补齐原 resolve_target 截止分支，保留最后已知 ValueError 及诊断，所属单项通过。仍使用原 tenacity/硬截止，未知超时不伪造原因，不重派操作。

### 遮挡证据通道补全（不新增浏览器控制）

2b2c21d6 的同稿普通试跑仍在第一条入口点击失败，清理 confirmed。既有 Python/TS 诊断白名单丢弃了 target_blocked，补齐两端严格白名单，只记录 pointerBlocked、命中关系、坐标、视口和滚动位置，拒绝额外键及非有限数。沿用本 execution owner 的诊断文件，不记录 DOM、页面文字或 URL，不覆盖原错误。该改动用于确认真实几何根因，不能作为业务完成证据。

### 原生区域预览与实际点击几何

1153bd90 同稿试跑确认 target_hit_blocked：pointerBlocked=false，hitRelation=outside，中心(266.5,745.78125)，视口2003×904，scrollTop=0。不能据此直接判定网站风控或多行文字原因；需核对原生坐标选取与当前 getBoundingClientRect 联合框。

Product Alignment:
- natural-language task: 采集每条入口对应的完整相关原始区域，供用户后续处理
- reusable chain boundary: 同一参数化区域采集链，可用于资料/商品或表单结果区域
- runtime inputs: 同版任务的入口身份
- dynamic task outputs: 原始 HTML、原图、已有 Markdown 与有界可见文字预览
- generic platform capability used: 原生 DOM innerText 和既有区域产物适配
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 模型看到实际选中区域文字而不是 CSS，判断范围是否符合已确认目标
- existing implementation in repository: page_content.capture_region、B-U convert_html_to_markdown、ContentReadToolParams
- mature candidates and pinned versions: browser-use 0.13.8 的 DOM evaluate/原生 innerText 与 Markdown converter
- selected implementation: 现有公开 API，不增加抓取或清洗引擎
- reused public surface: Element.evaluate、innerText、既有 content receipt
- B-A-T-owned adapter and remaining gap: 1500 字可见文字预览；coverage 只证明选中范围采集，反馈明确范围选择责任
- license/runtime/platform fit: 沿用当前已验证 Windows/Python 依赖
- browser/runtime/state ownership conflicts: 同 owner、同实际浏览器、同原始产物；不增加控制会话
- replay model calls: 0
- rejected candidates and evidence: 不自写 HTML 清洗；原生 innerText 已能给出可见区域摘要
- focused validation: 既有真实 DOM/table/原图测试增加 CSS 不混入预览，运行一次

### 多行 inline 联合框误判：真实浏览器首次复现

既有真实 DOM 测试新增两行链接文字，未改运行代码前稳定得到 target_hit_blocked，复现了 getBoundingClientRect 联合框中心落在两行空隙的问题。B-U 0.13.8 的 Element.click 先使用 DOM.getContentQuads（源码注明 inline/complex layouts），但其 Agent watchdog 与本项目物理点击适配不提供可公开复用的最终坐标。最小修复只在联合框中心不命中时，用浏览器原生 getClientRects 取得真实片段，在同一元素及子元素/受支持 shadow host 中取实际命中的最大可见片段中心；不猜页面、不改 B-U、不调用 JS click、不移除 trusted-event 或真实遮挡保护。用于多行链接和多行按钮等通用任务。验证沿用同一已有真实 DOM 测试，同时验证真实 overlay 仍拒绝。

Reuse Assessment:
- capability: 已证明身份元素的可见物理命中坐标
- existing implementation in repository: target_preparation 与受管 Page.mouse 物理事件适配
- mature candidates and pinned versions: browser-use 0.13.8 Element.click、原生 DOM getClientRects/elementFromPoint
- selected implementation: 原生 DOM 片段查询与现有物理事件路径
- reused public surface: Element.evaluate、getClientRects、elementFromPoint、Page.mouse
- B-A-T-owned adapter and remaining gap: 只补齐联合框空隙的准备证明；不重造控制器
- license/runtime/platform fit: 现有 Chrome/Windows/Python
- browser/runtime/state ownership conflicts: 不改变 owner/document/native session
- replay model calls: 0
- rejected candidates and evidence: 不调用 B-U 私有 watchdog 或可能 fallback JS 的 Actor.click，以免取消真实可信事件不变量
- focused validation: 两行目标旧实现真实失败，新实现与真实遮挡共同验证一次

### b6df7abf 同稿复跑：点击通过，运行作用域接管失败

source 正常完成；item s-a-0001、s-a-0002 已 finished，s-a-0003 的详情区域点击在派发前报 hybrid_runtime_scope_page_changed。这证明联合框误判修复已跨过原断点，但未证明全链路完成。保留第一次失败；不放宽 scope。为定位已有同 owner 状态握手错误，给既有诊断补充固定布尔 sameSession/sameTab/sameUrl/sameDocument，不记录页面/URL/原始身份。

### 同文档 URL 更新被错判为页面所有权丢失（a429dea6 现场证据）

固定证据 sameSession=true、sameTab=true、sameDocument=true、sameUrl=false。实际点击后的同一 document 更新 URL，下一节点却按精确 URL 相等拒绝接管。最小修复只在经过编译授权的 runtimeScopeFrom 边界接纳同 session/tab/document 的动态 URL 更新；跨标签、跨会话或换 URL 且换文档仍拒绝，显式 URL 条件与人工 checkpoint 恢复核验不变。原任务仍未通过。

Product Alignment:
- natural-language task: 由输入选择入口，后续操作同一详情文档
- reusable chain boundary: 参数化的详情/表单结果节点接管
- runtime inputs: 本次入口与已成功前驱的当前浏览器事实
- dynamic task outputs: 不改变业务输出
- generic platform capability used: 已有 document/session/tab 身份与 scope 适配
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 同文档动态 URL 的受管节点接管
- existing implementation in repository: HybridRuntimeScopeState、current_document_id、已有 compiled runtimeScopeFrom
- mature candidates and pinned versions: browser-use 0.13.8 的实际浏览器/页签，原生文档 UUID
- selected implementation: 既有 scope 状态的身份校验
- reused public surface: 已有 observe/protocol/documentId，LangGraph 编排保持原职责
- B-A-T-owned adapter and remaining gap: URL 与 document 所有权分离；不新增恢复/调度器
- license/runtime/platform fit: 不改变依赖
- browser/runtime/state ownership conflicts: 同前驱 session/tab/document，无权限扩张到其它页面
- replay model calls: 0
- rejected candidates and evidence: 禁止按站点去掉 query/hash；禁止取消所有 scope 校验
- focused validation: 同文档 URL 更新通过，换 session/tab/document 仍拒绝的边界测试，再验证原任务

### 对抗审查 P2 与既有区域纠正分类

review 发现预览 JS slice 可切断 UTF-16 代理对，导致 Python UTF-8 编码失败；截断后去掉尾部孤立高代理项，保留 1500 UTF-16 单元上限。真实 DOM 测试补 1499 ASCII+emoji 截断和实际 overlay 仍被拒绝。既有 repeat_annotation 把 page-content 对象重复读取误判为数组循环，需仅在读取结果确为 array 时进入集合循环门；区域纠正使用已经公开的成功 readRef 完成引用，不新增 LLM 字段。

区域纠正完成引用使用已有 MethodReadRecords：自动默认只取同 tab/document 最后成功范围，跨 tab/document 仍须显式 readRef。未修改前现有夹具得到 completion_content_scope_ambiguous；修复后对应正/负边界通过。对象采集错误地进入数组重复门首次测试失败 method_mismatch，修复后不调用模型、历史事实不变；原有真实数组注解验证通过。scope 原失败现场与同构单测均失败，修复后正常动作 URL 更新与循环读取/只读身份拒绝3项通过。预览截断、实际 overlay 拒绝、两条独立区域输入、原图与文档替换既有真实样本1项通过。测试指派中一项旧方法名错误形成 loader AttributeError，之后按实际名称运行通过，不把 loader 错误算业务失败。

对抗指出旧 test_method_read_tool sample 缺 documentRootId/旧期望不符，已更新为同文档范围纠正允许、跨文档/标签仍拒绝，对应1项通过。API类型检查首次新增测试访问 union.target 失败，改整体结构断言后通过。f72b8f38 浏览器动作/模型均未开始，失败码 daily_chrome_extension_not_connected，cleanup confirmed。直接启动已保存Profile的工作台命令被自动审批拒绝 blocked by policy；改为验证已有本地工作台地址并调用原窗口 reload 后，公开连接接口和 snapshot 均确认 connected=true。保存授权未改变，未要求用户重新授权。重新启动完整准备。

### 45de8f71：入口叶元素与重复记录边界混淆，错误区域未交付

两段原生探索完成，22次模型调用、21个浏览器动作；编译拒绝 a2 的无完成证据点击及 a3 的未绑定入口点击。sources 读取图片轮播内 div，item 点击它没有跳转，随后点击同卡片相邻标题才打开详情。入口合同把原生叶元素误当整个重复记录，不能以固定标题回退或取消身份校验修复。body 原始采集被 iframe/canvas/shadow 限制拒绝，随后 #detail-main 只取得19张图片、空文字预览，原始HTML缺配置区。这不是完整结果，禁止发布；旧来源不能伪造记录归属或替换原始内容，所以本次不能仅靠离线编译完成业务修复。

最小整改：在现有完整集合查询与原生 DOM 快照上确定一对一重复记录根（每个根仅含一个所选集合成员，遇到含多个成员的祖先即止），复用现有 selector 投影。输入继续使用8字段 ElementEntry，绑定记录根；编译可选 withinEntry 只保存实际观察到的记录内唯一相对 selector。普通运行按新输入身份解析该记录及子控件；同文档、跨记录与唯一性校验保持严格。隐藏 iframe/canvas 不应把可完整采集的渲染区域直接判不可支持；可见不支持内容仍拒绝，不隐瞒缺失。原始采集范围选择继续由原生 Agent 根据需求与预览决定，平台不逐配置字段采集，也不加全局语义 judge。

Product Alignment:
- natural-language task: 从真实列表选择输入，逐条进入详情或处理列表中的表单/文档
- reusable chain boundary: 同构记录与记录内操作的参数化绑定
- runtime inputs: 同次来源集合的记录身份
- dynamic task outputs: 原始页面区域与已有产物，不新增清洗
- generic platform capability used: 原生 DOM 一对一记录范围、已有相对 selector 与 Entry 绑定
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 重复记录范围与记录内控件绑定
- existing implementation in repository: record_projection_dom、EntrySelection、ElementEntry、TargetResolver
- mature candidates and pinned versions: browser-use 0.13.8 原生 DOM/Actor；workflow-use 0.2.11 记录适配
- selected implementation: 扩展既有宿主适配，不替换原生 Agent 或控制器
- reused public surface: get_browser_state_summary、Page.get_elements_by_css_selector、Element.get_basic_info/evaluate
- B-A-T-owned adapter and remaining gap: 将所选控件映射到唯一记录范围，保存实际相对操作目标
- license/runtime/platform fit: 已有依赖与Windows路径保持不变
- browser/runtime/state ownership conflicts: 同会话/同文档/同输入记录；无第二浏览器
- replay model calls: 0
- rejected candidates and evidence: 固定相邻标题会复跑错误输入；放开 input_entry_context 不能证明记录归属
- focused validation: 同一记录不同子控件通过，另一个记录/身份替换/多匹配拒绝；原任务完整验收

### 对抗复核：记录重排与 Source 登记竞态

第一次对抗复核发现普通解析若把输入根转为全页 CSS，会在同文档记录重排后点错记录；已改为 Chrome CDP pushNodesByBackendIdsToFrontend + DOM.querySelectorAll，查询根就是输入 backend。真实 Chrome 两条独立输入重排后仍各命中自身控件，多匹配拒绝；定点1项通过。

第二次复核发现 Source 在冻结快照后经过 await，目标可能已移出记录或原位置换成其它控件。现登记 input_entry_target 前复用上述根内解析，强制命中 backend 与冻结的实际动作 backend 相同；缺失、多匹配、身份变化和替代控件均记录 input_entry_mismatch，已有编译器拒绝固定退路。新增真实 Chrome 竞态测试验证有效→跨记录移动→原记录插入同类替代控件，最后仍不能编译固定目标；另更新原编译绑定 fixture。两项定点验证通过，4.814秒；未运行全量或重复无关验证。

新准备 667a20f4 在来源阶段被开发主动中断，因为第二次复核指出上述真实 P1；不是业务成功或用户取消。cancel_authoring 接口返回202、持久化状态interrupted，原生 runner 已退出；等待复核关闭后才重新启动完整准备。第一次取消请求多传 requestId，被 strict 命令合同拒绝400，去掉后接受；这是开发调用错误，单列保留。未改写原失败、旧草稿或原始页面结果，原京东完整链路仍未验收。

同一 guard 的最后异常漏口亦已关闭：resolver 与 backend 读取放入同一异常边界，普通异常记录 mismatch，BaseException 取消继续传播；查询 TimeoutError、身份 RuntimeError 及无固定退路的所属1项定点验证通过（0.011秒）。对抗子agent最终静态复核确认该P1闭合，此处无新增阻塞；不将静态闭环冒充完整业务完成。

### 031fd3a2：完整集合与可见索引混用

实际来源在第6动作 bat_read_fields 被 native_entry_record_scope_unavailable 拒绝，7次原生模型调用；页面/文档身份各观察阶段均consistent，真实索引参数保存，未到详情。原错误没有记录具体拒绝行，不能断言是模型不懂商品。已先补同构回归：前2条可见选择、完整CSS集合另有1条隐藏节点；旧实现稳定在 entry_selection 第140行拒绝，因为成员映射错误地沿用过滤可见节点的 _elements。修复复用既有 _walk_structural 完整原生DOM建立集合成员关系；模型选中的原生索引仍要求可见、完整前缀/文档/根查询顺序证明仍严格。回归与既有安全诊断2项通过。记录范围错误另复用已有安全诊断，仅保存固定类型和函数行号，不输出页面值/异常正文。该同构缺陷已证实；本次实际是否仅由这一处造成，须由修后完整任务及新的具体诊断确认，不冒充业务通过。

### b6384d1d：来源通过，记录容器归属与内嵌资源边界仍缺失

来源读取/done成功，证明上次来源断点已跨过；item实际a2点击backend20830，恰为来源第一条所选控制，输入根23750，tab/URL相同仍mismatch。item原生27次模型调用后done=false：#SPXQ-title仅53字节标题，#detail-main仅19张图/空文字/无品牌型号；body两次content_image_resource_missing。未完成、不发布，不把原生进入详情或图库读取当交付。

同构定点证明record.is_visible=false、实际子控件可见且仍属于它时，capture_entry_descendants误用_elements使绑定为空；现记录归属同样沿既有完整_walk_structural，点击可见性和现场唯一backend门保持。失败事实增加固定check/count与已有安全诊断，避免不可区分的mismatch迫使盲重跑。TS成功事实严格格式不变。

图片现实现只认CDP网络资源树，内嵌data原图合法但没有对应网络资源；隐藏CSS背景也可能未加载。直接复用Python3.12标准库DataHandler，不新增下载器或Cookie路径；网络原图仍从Chrome缓存读取，字节/MIME/文档门保留。CSS背景只纳入实际渲染元素，离屏可见元素仍纳入，原HTML与DOM ordinal保持。真实Chrome既有两输入测试补data原图/隐藏背景，记录根False回归一起2项通过（12.463秒）；最后ordinal等价保留调整做JS语法定点检查通过。实际缺资源协议此前未记录，不能声明唯一根因，现补固定scheme错误类别供真实断点确认。
### 2026-10-06 最后资源边界复核与本次原任务验收

对抗审查指出：可见宿主的隐藏 `::before/::after` 仍会把未加载背景图加入完整性要求。最小修复检查伪元素自身 computed style 的 display、visibility 与 opacity；保留原 DOM ordinal、离屏可见内容及网络图的 CDP 缓存/MIME 门。原真实 Chrome 区域/两输入/原图测试增加两类隐藏伪元素，所属单项通过（12.793秒）；对抗静态复核确认该 P2 闭合，无新阻塞。此前 `display:contents` 记录根与 Source 身份竞态的所属真实测试另通过（4.234秒）。不重复全量或无关验证。

当前受管源码 `668c149585cdf914600c35e359d6b4b1e2f1b6891f6b1c3b2f16d2ba8613b150`；Chrome 已由开发自主恢复，公开接口 connected/paired=true、busy=false。`b6384d1d` 原生失败和旧草稿保留；完整来源、详情原文原图、独立验证、发布和正式五项运行仍须通过本次实际验收，不能由定点测试或静态 review 代替。

`bf603496` 来源通过；item前两次点击成功但登记被原生DOM.describeNode的RuntimeError拒绝（entry_descendant第63行）。新诊断已排除未发现后代或多匹配分支。当前顺序在取得frontend nodeId后先刷新文档根，再转换backend；B-U 0.13.8公开Page的对应实现直接query→describe。计划先复现frontend身份刷新边界，再改为立刻保存backend，随后保留同tab/URL/document检查。该顺序差异是当前可验证的实现缺口，尚未证明是现场唯一原因；普通编译缺口不停止原生探索，原始错误保留。
