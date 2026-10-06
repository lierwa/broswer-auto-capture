# 2026-10-06 需求入口来源绑定整改

## 首败与根因

原任务 `4d2216fb-7f03-4fa5-9bb1-f2a77d6bc61c`、首轮 `073ff401-2b18-4027-a55f-a7ed2dd57cb8` 保留。搜索成功，来源候选提交也成功；模型在草案中重写 URL 时去掉查询参数，`projectProvidedDraftSources` 因字符串不等将候选作废，随后 `assertRequirementReady` 报 `interview_draft_url_unverified`。已从 SQLite 的真实工具结果和输出只读复现。不能把首败归因于搜索不可用。

根因是宿主重复要求模型搬运已有事实：提交来源要重填 query/searchId，成稿还要重抄 URL；一次业务选择变成多个必须互相完全一致的生成字段。来源选择本应直接绑定不可变搜索证据。另有语义缺陷：草案把明确的站内搜索起点换成目标深链，页面交付也与继续使用页面的目标不符。语义修正必须由需求模型保留原意，宿主不得按站点或任务关键词推断。

## 修改前边界

Product Alignment:
- natural-language task: 用户自然描述查找内容并保持目标页面状态，或从指定站点采集资料。
- reusable chain boundary: 本轮只修需求对话到唯一准备草案的来源绑定；不改执行图或浏览器控制。
- runtime inputs: 用户确认的业务输入，来源地址不冒充输入。
- dynamic task outputs: 来源边界与动态选择规则，不冻结搜索时的一次性内容。
- generic platform capability used: Pi 原生搜索事件、公共 Authoring、Markdown 引用、Zod、持久化来源事实。
- replay model calls: 不新增调用或重试；明确来源的草案不再调用重复候选登记工具。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将模型的一次来源选择绑定到已有搜索证据。
- existing implementation in repository: PiSourceSearchObserver、SourceResolution、AI Connect Authoring parser、既有确认与 URL 来源门。
- mature candidates and pinned versions: 现有 @agent-platform/ai-connect 0.3.4-1464cd24、pi-agent-session 0.1.0-2c522ec8、Zod 4.1.8。
- selected implementation: 继续使用现有协议和搜索事件；B-A-T 只增加来源引用到持久化合同的适配。
- reused public surface: createAuthoringTurnSession / defineFlatXmlDirective / Pi tool events / Zod；草案仍为一个公共 Authoring Markdown 指令。
- B-A-T-owned adapter and remaining gap: 为真实候选分配稳定引用，展开标准 Markdown 引用为原始 URL，并沿既有来源确认门提交。来源语义与起点选择仍由模型判断。
- license/runtime/platform fit: 既有依赖和 Windows Node 运行时，无新依赖或新框架。
- browser/runtime/state ownership conflicts: 不启动任务浏览器，不改用户浏览器；只有成功草案才提交来源事实。
- replay model calls: 本轮只涉及需求对话，正式普通节点不受影响。
- rejected candidates and evidence: 不放宽 URL 相等校验、不去掉任意查询参数、不加模型修复循环、不复制 Markdown/Authoring parser。
- focused validation: 原始首败只读复现；引用来源、错误/取消回滚、首页与深链边界的定点回归；冻结后 headless 正常 UI 输入同一自然语言需求。

## 验证记录

### 共性字段归属审查与整改

| 实际活跃交互 | 模型负责 | 宿主负责及本次整改 |
| --- | --- | --- |
| 需求来源 | 搜索词、业务相关性与必要取舍、草案引用 | query/searchId/URL/候选身份由搜索证据绑定；明确来源不再额外登记。后备搜索模型字段由 subject+query 减为 query；来源 Question 由五类字段减为 subject+candidateRefs。 |
| 需求草案 | 业务目标、路径、范围、动态条件、交付与高层步骤 | 引用展开、来源清单、固定身份。标准 Markdown autolink 保留合法 URL 末尾字符；不放宽来源校验。 |
| 动态选择函数 | 函数 source | 已有动作、真实样例、schema、ID、绑定、预算、审计由代码负责；保留同动作一次生成。 |
| 重复方法注解 | outcome、stableKeyPath、存在语义取舍的继续/推进动作引用 | 唯一读取组的 outputPath 由代码填；删除模型必须生成但随后丢弃的 reason。不能未经证明将语义动作选择改成相邻动作猜测。 |
| 根数组读取 | DOM 容器/字段投影或已有 readRef | 固定 outputPath=[] 从模型表面移除；工具调用、捕获、在线/离线证据和引用回溯共用合同派生规则。 |
| 执行型结束 | success、观察到的 reason | null 合同固定 readRefs=[] 由宿主填；实际输出从既有证据汇集，不抄业务值。 |
| 显式运行 LLM 节点 | 任务合同的 result | 模型调用审计、运行身份和封装归宿主；普通复跑节点不增加模型。 |
| B-U 原生探索/抽取、人工等待 | 原生动作和必要语义；人工请求的理由/问题 | 沿用原生 Agent；use_judge=False；实际URL、session/tab、等待身份从运行事实采集。 |
| 确认草案到计划 | 无额外模型 | 代码投影，没有第二轮模型补写计划。 |

旧 annotations/propose_semantics 等没有查到当前主链调用，未据死代码夸大活跃问题。该表是本轮已核查边界，不承诺覆盖未来新增调用或所有语义误解。

来源首败还暴露诊断缺口：公开错误合并了多种失败。现将限定格式的稳定 failureCode 另存 assistant 消息 JSON；仅最终 failed 时写入，不记录原始异常、不要求模型填字段、不增加数据库迁移。

### 最小验证及首败

- 需求/来源 29 项（分批）通过，API TypeScript 类型检查通过。新增保护真实 URL 引用、伪造/串搜索/任意深链拒绝、首页派生、括号/标点 URL、失败/取消不接受来源、SQLite 重开及确认。第二轮仅重测受影响的 5 项指令交接、7 项来源引用及 API 类型检查；不是重复全量验证。
- Python 48 项定点用例（分批）通过，涵盖模型表面、实际 Tools callback、捕获、内部读取证据、完整离线编译、readRef 回溯及历史注册表。旧源码构造的 8 种 registry 与兼容适配逐字相同，保存固定摘要回归；恢复仍严格匹配摘要。
- 对抗 review 首次发现 URL 尾标点被剥离，已修复并复审。
- 减少根数组字段时，复审发现实际回调、证据消费者、readRef 回溯也依赖该固定字段。已统一宿主绑定并使用公开参数走完整工具/编译链验证；不把 schema-only 检查当作执行通过。
- 首轮 TS 新取消夹具监听晚于 abort，测试挂起；仅停止明确自有测试子进程，修正夹具后通过。旧来源夹具缺少现行必需任务步骤，先报步骤错误；补齐合法步骤后验证原来源门通过。
- Python 首轮遗漏测试 import path 与残留指导常量，后续又揭示动作序列化/公共 schema 不一致；均有失败记录，修正后按受影响路径重测。没有删除失败断言或放宽来源。
- 冻结文件清单：`work/interview-source-binding-20261006/round-1/freeze.json`。fork 摘要 `88ced88720fbd4cfe0fd0e77430e75033b2b85ec148d0f634b2d45cf8371e5cb`；受管运行环境已记录校验来源，无依赖重装。

### 正常流程门当前状态

第一轮未通过。用户明确批准原位重载后，PID 21192 退出；启动器只报通用失败而无原因，端口已空闲。通过同一 `launchDevServices` 公开入口恢复唯一服务 PID 7460。原启动异常的具体原因未证实，不能把恢复成功当成首启成功。此前自动审批仅返回 `blocked by policy`，收到用户明确授权后才执行，未绕过拒绝。

冻结代码下通过 headless UI 输入用户原话，新任务 `9d18d793-6811-4aa6-b91c-2eb012f1c713`。模型成功搜索官网并取得引用，却将最终内容入口误当成需求阶段必须查明的来源，调用空候选的 `present_source_candidates`；宿主随后生成与前文“已找到官网”矛盾的来源问题。无草案，故不算通过。首次截图、真实工具调用和 SQLite 快照在 `round-1/`，不覆盖、不写库修复。

第二轮修改前判断：已有合法入口不等于已取得最终动态对象；后者属于准备阶段现场查找。未观察到的访问障碍也不自动构成业务取舍，不能迫使用户预答资格或改换目标。本次仅纠正 Skill、重复阶段指导与工具语义说明，不增加判断字段、工具、模型重试、宿主语义推断或新框架；沿上面的 Product Alignment 与 Reuse Assessment。修改后另立冻结基线。

第二轮对抗复审另外复现无候选提案串搜索：先成功查来源、后查其他事实失败时，原实现把最后一次搜索错当来源证据。空候选现绑定本轮已公开调查的 `searchIds` 集合，查询与 provider 保留实际范围；只有全部搜索不可用才记 `unavailable`。该可选持久字段由宿主填写，模型仍只提交 subject/candidateRefs。非空候选仍按单次搜索精确绑定，旧记录兼容。来源回归与最终复审均通过。

第二轮冻结：`work/interview-source-binding-20261006/round-2/freeze.json`，相较第一轮只变更 Skill、protocol、source-tools、source-references 和来源持久合同。用户已明确授权继续所需开发重载，当前唯一服务 PID8120 加载第二轮代码；不再重复索要同类授权。正常流程第二轮失败，未本地提交。

### 第二轮首败与协议责任边界诊断

用户再次明确授权自主继续，不再反复询问必要开发重载。第二轮由唯一服务 PID8120 执行，新任务 `97c5ed29-e1b8-46ff-9a91-4b874b520701`。搜索与引用成功，模型生成保留原目标的草案，但遗漏固定 `</authoring>` 外封套，公共 parser 诊断 `unclosed_tag`，宿主保存 `interview_authoring_invalid`。原始草案还漏写试做入口段。正常流程未通过，不能记成成功。此前自动重载守卫因进程身份不完整拒绝；核对 health/PID/双端口后经现有受保护关闭接口重载，没有启动第二服务。

曾在未查完整提示/传输链前尝试草案工具适配，用户指出这是公共协议问题。该改造尚未接入 coordinator 或运行服务，现已全部撤回；生产文件逐个匹配第二轮冻结 SHA256。未更换协议、未修改相邻 AI Connect 项目、未给原消息补封套或入口。

已完成的只读定位：

- 公共协议和提示组装属于实际固定 AI Connect `0.3.4-1464cd24` 的 `renderAuthoringPromptContract` / `renderComposedAuthoringPrompt`；严格闭合校验属于 `IncrementalAuthoringTurn`。从 Git 内受管 tarball 读取，SHA256 与 release manifest 一致，不只依据可能漂移的生产者 checkout。
- B-A-T 注册 `interview-markdown` 领域指令及准备草案语义，调用公共 `composeAuthoringPrompt`。Pi 将组合后的 active task 放入 `<platform-active-task>` 用户消息，系统前言明确它是平台指令。不是只写在项目规则中却没有发送。
- 原生 Pi session 保存的实际 active task 与冻结代码经公共组件重新生成的提示逐字一致（比较时规范 Windows 换行）。提示共 18,962 个 Unicode 字符；开头和末尾都有完整 authoring 闭合要求，领域段明确要求“试做入口”。未发现要求省略这些内容的相反指令。
- Pi 最终 assistant 原生内容为 1,188 字符，rawStopReason=`completed`、stopReason=`stop`；实际 `gpt-6-luna / medium` 与产品配置一致。原生文本、adapter 的 ended.text 与 B-A-T text.delta 拼接逐字相同，SHA256 为 `5ff3bf0bfe55ad39c23e0a7a1c5696d79fdc4de4a4b667eb9b328d171fa4d455`。B-A-T 只传 reasoningEffort，无 stop/maxTokens 或截尾逻辑。
- 原样喂公共 parser 可重复得到 `unclosed_tag(authoring)`。仅在隔离内存补外封套后公共 parser 为 valid，下一层领域门立即报 `interview_entry_section_required`。这是两个独立遗漏，补结束标记不能使本轮合法；诊断输入未回写产品。
- 进一步核验官方 `@earendil-works/pi-ai@1.0.2` 包，完整性匹配仓库锁定 SHA512。该版本将 output_text delta 直接拼接，item.done 使用服务端完整 text；没有识别/剥离 authoring 标签的逻辑。Codex 请求未配置以该标签为停止序列，completed 映射 stop，max_output_tokens 映射 length。
- 证据能定位到“Pi 保存的生成终态已违反实际下发的公共协议和领域合同”，不支持 B-A-T 桥接掉字、公共协议未下发或长度停止。原始 HTTP/SSE 响应未留存，因此不能严格排除服务端与 SDK 之间的上游差异，也不能把“模型弱/提示太长”当成已证实根因。对抗只读审查确认上述边界。

证据：`round-2/failure-boundary-proof.json`、`actual-active-task.txt`、`authoring-diagnostic.json`、`diagnose-authoring.mts`、原生 session `data/pi-agent-session/sessions/b9cd96c15efb621da43b62a4/2026-10-06T13-58-42-752Z_01a11182-6d3f-76b2-8ff3-82a352499ed8.jsonl`。这些运行证据只保留在忽略目录和产品存储，不加入 Git。正常流程仍未通过，尚无可宣称已解决本次输出遵循失败的代码修复。

原失败任务/轮次未修改。未测试京东、未控制日常浏览器、未改未跟踪的 `unused-owned-fixture/`。


## 最新：需求输出自动修复已通过真实界面验收

本节为当前结论；下面此前标为“当前”的记录均按其执行时间保留，不覆盖本节。

- 来源由宿主绑定真实引用；模型不再重填来源 ID、URL、查询和时间。草案只需 Markdown 正文，标题属性可省略；保留同一注册协议及已有确认合同。
- Question/草案格式失败后最多一次同模型修复，独立无搜索工具的 repair session；使用公共 buffered scope 与同一 parser。首败事件及原因保留，只有修复通过后才提交，下一轮历史只消费接受的 invocation。来源真实性、身份、流传输与网络故障不靠模型修复掩盖。
- 本次 10 项来源/修复定点测试及 API 类型检查通过；对抗 review 找到入口编号格式的修复白名单遗漏，已补实际错误码并追加编号/无序列表样本，通过定点复测，复审无新增 P1/P2。此前 48 项 Python 合同回归证据继续保留，本次未重复跑全套。
- 冻结 round-3 后，经正常 headless Workbench 新建任务 `5eecaaee-f0e5-4ebf-a0a0-cc9605426660`。原始需求“帮我打开bilibili，并搜索凡人修仙传，播放最新一集”。首调用真实漏 `</authoring>`；一次自动修复后成功生成草案，共 2 次调用。首败没有隐藏或改写。
- 人工核对草案保留原搜索词、动作顺序、运行时最新一集和保留页面；通过 UI 确认 v1，刷新后仍显示已确认，SQLite confirmedVersion=1。UI 无 pageerror，冻结文件哈希没有变化。证据 `work/interview-source-binding-20261006/round-3/acceptance-summary.json` 与截图。
- 当前服务唯一 PID4852，4173/4175；验收只启动隔离 headless 浏览器并 finally 关闭。未使用京东、未操作日常浏览器、未启动 B-U 播放任务。本次证明需求对话及自动修复，不等于证明任意任务执行可靠。
- 本地提交收录本阶段修改；不推送，`unused-owned-fixture/` 保留。固定 Markdown 章节仍承担已有任务合同，不在本次改成第二套字段/协议。

### 追加：测试首败与范围

首次 TypeScript 检查发现注册 directive 的 tag 位于 spec 下、修复 root 类型需要显式收窄，均在冻结前修正。首次公共 Question 测试夹具缺少协议要求的 slot，修正夹具后 10 项通过。对抗审查追加的两个入口语法样本随后单独通过。

UI 确认首次已成功写入，但验证脚本的“草案已确认”定位同时命中时间线与抽屉，产生 strict locator 错误；仅将验证定位限定为草案抽屉，再读取同一任务确认和刷新状态。没有重跑模型、补写产品数据或修改冻结代码。

主 invocation `05bec179-e6ff-4192-bd46-07ddff4bfbc6` 保留缺关闭标签的原文；修复 invocation `6fa852ec-4a9a-4cf5-b91f-2bd20c6fbdc8` 完整闭合并成为 acceptedInvocationId。两次 generation.started/completed 与调用审计均保留。

固定章节的进一步设计简化和 B-U 真实执行不在本次验收范围；不追加昂贵任务声称全系统可靠。
