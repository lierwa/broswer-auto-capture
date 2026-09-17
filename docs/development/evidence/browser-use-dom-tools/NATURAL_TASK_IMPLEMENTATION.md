# 已确认任务文字直接进入 browser-use

用户已明确并授权实施：需求对话只负责聊透需求并输出详细、精准的自然语言执行任务列表。撤回独立规则 JSON、Markdown bat-compilation/v1 强制块以及同源条款投影方案；不得改名保留为第二份需求权威。

Product Alignment:
- natural-language task: 已确认的列表操作、表单填写或其他通用浏览器任务
- reusable chain boundary: 一个任务步骤的真实探索来源到参数化 TaskChain
- runtime inputs: 用户本次输入及已完成步骤的输出
- dynamic task outputs: 实际页面读取及显式语义节点的本次结果
- generic platform capability used: 原生 Agent/DOM/Tools、受管 fork 编译、现有 TaskChain/LangGraph/存储
- replay model calls: 普通节点 0；仅显式 llm 节点可调用模型
- site/task-specific code added: no

Reuse Assessment:
- capability: 自然语言正式入口与证据驱动编译接线
- existing implementation in repository: browserUseTask、原生 Agent(task=...)、EvidenceCollector、hybrid compiler/materializer/runtime
- mature candidates and pinned versions: 继续 browser-use 0.13.8 / workflow-use 0.2.11 已固定 fork
- selected implementation: 原有公开 API 和既有编译/运行路径，移除独立规则 authority 的生产依赖
- reused public surface: Agent.run、原生 hooks、Page/Element、Tools.act、LangGraph StateGraph
- B-A-T-owned adapter and remaining gap: 自然语言指令、真实 DOM 来源、参数与结果映射、版本/证明/运行审计
- license/runtime/platform fit: 不安装、不改版本和许可；Windows 未测
- browser/runtime/state ownership conflicts: 单个所属 Browser；主 agent 分配 Browser 验证槽；finally 清理
- replay model calls: 所有 ordinary capability 无模型
- rejected candidates and evidence: 不采用前置规则投影，不生成整份图或重写 Agent loop；旧 authority 仅允许历史读取兼容，不可伪造成用户确认
- focused validation: 入口/任务文本定点测试，Python 自然来源定点验证，正式自然语言本地真实样本，再原 Issues 主线

## 当前执行约束

保留已有 dirty、原始任务/来源、patch/archive；在原目录/分支实施，不创建 worktree/分支、不提交/推送、不运行根级或全量测试。中间代码结构是内部传输与编译产物，不能成为要求用户确认的新规则合同，也不放进 b-u 指令让其理解自造字段。证据不足不得用空控制/空输出假装编译成功。

## 分工及协议锁定

主 session 01a0a94a-630e-7ee1-8795-edf57b14428e 的本轮 turn_context 为 gpt-6-astra/high；宿主执行 01a0a94d-5278-74a3-ad64-3290394528fe、Python 执行 01a0a94d-ae12-7333-b690-fd12111af329 均为 gpt-5.6-sol/high，已实际读取记录核验。

- 宿主：移除普通 authoring 的结构规则门；完整自然语言任务说明；v2 来源存储与物化边界；准备原任务真实入口探针。
- Python：原生 Agent(task=...) 和无预置规则的 collector；v2 来源；逐动作证据分类与不完整覆盖拒绝。
- 主 agent：协议、证据准入与风险决策、验收范围、Browser 单会话调度和文档。

自然来源 compilerVersion 为 bat-hybrid/2。requirement 保存原文、实际 Agent taskText、原需求身份/摘要；plan 保存原计划身份/摘要及步骤/输入输出摘要；另含 runtimeInputSchema 和 trace。无 clauses/control/acceptedAnnotations。动作绑定是 trace observation 中经证据校验的内部 natural_binding fact，不能重新包装为用户规则或丢失来源。

过渡期响应可能只有具体 gap；它只能作为探索来源持久化，不能生成候选或报告复跑通过。本轮最终不得把“浏览器可启动”当作“编译与主线通过”。

## 自然入口定点验证与首轮真实来源

- 宿主：自然入口 3/3、自然来源 artifact 1/1、历史 v1 来源禁止生产复用 1/1、退役边界 3/3 通过；API TypeScript 检查通过。Python canonical 摘要和宿主 schema 比较已对齐。
- Python：author/capture/DOM/extraction/natural compiler 五个定点模块 23/23 通过，责任文件 Ruff 通过。只覆盖已有证据准入，不代表字段编译与业务输出已完成。
- 首轮真实来源冻结 fork 摘要：`d6947641ff5ed4e517a94797a389ee75baa1af2e47491ca11818f8664179c580`；`verifyForkSource` 通过并与本地 source manifest 一致。
- 原任务 requirement v2 / plan v6 的最小已确认 draft/decision 在隔离库同步后，身份、版本和摘要与原库精确相等；没有放宽正式确认检查。
- 正式 `generate_task_chains` 已运行完首次探索。产品模型沿用原设置 `gpt-5.6-terra / medium`。此次 run 为 `f8ad64fe-750c-4600-a7b7-064adeff84ff`；`source_success/source_judged/source_closed` 均为 true，23 个浏览器命令；1 份完整来源已持久化。宿主 finally 完成、原需求/计划内容摘要未变；没有额外进程扫描证明。
- 原生结果为两页各 5 条及第 2 页首条详情，时间字段保留 `Updated` / `opened on` 显示上下文。业务流程满足与否目前来自 Agent 输出和原生 judge，尚不是宿主独立业务复验。
- 作业停在 compiling：36 个 gap（missing_effect_proof 20、missing_binding 7、unsupported_capability 8、invalid_source 1）。候选、样本、换输入验证均未通过。证据见 [mainline-natural.json](mainline-natural.json)；完整来源只在被忽略的本地运行目录中保留。

已确认的后续工程缺口：自然来源仍需将现场 DOM 字段读取映射到输出，并将多次读取的结果组合和重复步骤复用接入既有 IR。最终模型输出、动作成功、单次 trace 或相同 selector 均不能单独替代这些证据。历史独立 authority 不再用于补齐缺口。

## 原生提取复用核验

已检查当前 Python 环境中的 browser-use 0.13.8 源码和最小类型行为：`ExtractAction.output_schema` 被 `SkipJsonSchema` 隐藏，Agent 不会自行从工具 schema 得到该参数；公开 `Agent(extraction_schema=...)` 会注入 Tools.extract。当前三次 extract 均为无结构 schema 的原生文本结果，缺少 structured metadata 不是用户需求缺失。

原生 `schema_dict_to_pydantic_model` 只接受顶层非空 object，拒绝顶层 anyOf/array，且不保留 maxItems。没有为此另写 schema 转换器，也不把整个最终输出 schema 强塞给分页或详情提取。下一步复用原生提取和现有 ReadSpec/read_fields：首次探索的有界模型建议只能提出读取映射；实际 DOM 读取及原始 JSON Schema 校验才产生字段证据。原生自由文本仅作会话内数据，不能直接变成确定性输出或第二份需求权威。

自然输出组合只接受已编译节点的动态输出绑定，经真实读取结果与最终输出的一致性验证后进入编译产物；禁止把样本值放进常量。URL query 不落原文，已通过完整现场 URL 的摘要核对作用域，不能仅比较脱敏后的 path。

## 首轮来源后的定点补齐（真实重跑待执行）

- 页面范围已贯穿捕获、编译、宿主命令和 Python 读取执行。查询参数只保存完整 URL 摘要；相同 path、不同 query 在 DOM 查询前拒绝，读取中换页在返回前拒绝。旧无 scope 读取保持兼容。
- 效果事实复用原生 Page/Element、原生 EnhancedDOM 的 `is_visible` 和已有 StepVerifier/Tenacity；没有自行定义 CSS 可见性算法。连续纯 wait 可作为同一动作的观察证据，跨 tab、插入其他动作或超预算不能归并。
- 原生 `find_elements` 只有在动作成功、同 tab、完整 URL 摘要不变且存在对应查询事实时，才作为探索观察记入覆盖账本；不能直接成为业务输出。
- 每次原生 extract 最多提出一份有界 ReadSpec；当前页面实际双次读取、容器身份与顺序、页面身份、原输出 schema 和期望值全部一致后，才记录 `verified_natural_read`。候选建议调用记入 `semantic_annotation`，普通读取复跑为 0 次模型调用。
- 输出组合只由已验证读取节点的动态结果构成，检查字段路径、数量上界、值和最终输出摘要。缺少页码或报告等字段仍会报告缺口；不会复制最终样本作为常量。
- 首轮摘要已原样保存在 `mainline-natural-f8ad64fe-750c-4600-a7b7-064adeff84ff.json`。以后每轮保存独立摘要及 latest；`validationScope: source_probe` 明示探针退出成功只证明来源阶段，不代表完整主线通过。
- 接线定点验证：Python 自然读取/效果/输出相关 64/64；补充装配断言后受影响 31/31；causal 8/8。API TypeScript、责任文件 Ruff、diff-check、文件/函数上限检查通过。以上是定点测试，尚不能证明原任务的实际字段映射有效。
- 第二轮来源前冻结：仅更新 23 个已知 fork 文件摘要、登记 7 个本轮新增文件，固定 upstream 基线未变。`npm run upstream:setup -- --check` 一次通过，fork 与本地环境摘要均为 `03f4f568142048c65c9c910357bf51c702aef8037f41207e33e90f12104965ca`；未安装依赖。
- 环境失败记录 `6efb997b-a6c1-4841-abf7-503495c14774`：正式 HTTP 202 后本地模型桥 `listen EPERM`，0 模型调用、0 浏览器动作、0 来源，未到编译。finally 应用关闭且原合同摘要未变。这是沙箱监听限制，不是站点访问或业务验收失败；摘要独立保留，未替代首轮来源证据。
- 权限适配记录 `1c5c36c8-911c-4ad7-9d61-19aa1ede003a`：工具审批通过后运行，但宿主严格返回校验拒绝 Python 多出的内部字段 `semanticAnnotationCalls`。这是接线缺陷。返回及内存审计未持久化，实际 Browser/模型调用量无法核实，原摘要的 0 已由独立 `-audit-correction.json` 更正为 unknown/null；原摘要原样保留，latest 指向更正。不能把此次调用称为零副作用运行。
- 已移除对外返回的内部计数，collector 限额不变，模型审计继续由宿主 bridge 提供。实际 `author_step` 与 `Runner.handle(hybrid_author)` 返回契约测试 3/3、Ruff 与 API TypeScript 通过；修正后的 fork/source 摘要为 `5a448695d56edd6b6ba40b1cd0cfa82d3959c7847c8d5804aa862b469e9bef02`，`upstream:setup -- --check` 通过。没有放松 strict 校验。
- 接线复验 `c93e4b5a-b6d2-414f-ad95-5cd50c2ce854` 仍未收下来源：Python `NaturalBindingFact.taskQuote=None` 实际序列化为 null，宿主只允许 optional string，报 `invalid_type/taskQuote`。accepted source 为 0/1，审计不可用，调用数和 source 状态均记为 unknown/null；未到编译、无候选或复跑。应用关闭、原合同未变。暂停真实 Browser 重试，先补 Python 实际序列化响应经 TypeScript 来源校验与物化的离线边界验证；此前仅 Python 返回键测试不足以证明完整跨语言兼容。

## 数值来源往返的复用核验

实际 Runner 离线 fixture 已覆盖三种 binding 的 null/string 差异及 verified read/outputAssembly。宿主受影响检查 8/8、API TypeScript 通过，但同时证实：Python 数值 `1.0` 经 Node 普通 JSON 往返变成 `1`；回 Python 依次触发 trace、fact、最终输出组合摘要失配。不能通过重算摘要或猜测两个 hash 接受被改写的来源。

Reuse Assessment:
- capability: 保存和重传既有 Python 来源的数值原始表示
- existing implementation in repository: 已校验的五份 sourcePayloads、canonicalJson、RunnerProcess JSON.stringify 传输
- mature candidates and pinned versions: 当前项目已要求 Node >=24；现场 v24.12.0；固定 Python 环境没有 rfc8785/jcs/orjson，也无对应锁文件依赖
- selected implementation: 验证 Node 原生 JSON.parse 的 context.source 与 JSON.rawJSON/JSON.isRawJSON，复用现有 payload 和序列化路径
- reused public surface: [ECMAScript JSON.rawJSON](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.rawjson)，原生 JSON.parse/stringify
- B-A-T-owned adapter and remaining gap: 将已核 hash 的来源 payload 恢复为仅用于校验证据及重传的数字表示；业务 IR 仍使用普通值，原型往返及接线待验
- license/runtime/platform fit: 无新增依赖、安装或运行时版本改动；Windows 未实测
- browser/runtime/state ownership conflicts: 无 Browser/model 调用；不增加调度、数据库或用户规则来源
- replay model calls: 0
- rejected candidates and evidence: 当前环境无 JCS 实现；不修改全局 digest 破坏历史，不自研浮点 formatter，不猜测多种 hash
- focused validation: 实际 Python → TS → Python 的 1.0、指数、负零和嵌套值，原 fact/trace/final 摘要及重新编译结果

最小原型已完成（未改生产代码）：实际 Runner 来源校验通过，3 个 fact 的原始摘要一致；1.0、指数与负零的嵌套 payload 可保留 Python hash。真实 1.0 fixture 经 artifact JSON 保存/加载后，从已验证的 sourcePayloads 恢复仅用于重传的数字表示，实际 Python `hybrid_compile` 为零 gap，canonicalDigest 与首次编译相同。生产接线随后实施。

限制：负零经过普通 JSON 持久化后变为 0，当前深比较会拒绝，因此并未证明负零 artifact 完整往返；大整数未支持/未测。不得以 payload 字节原型通过覆盖这些边界。普通 IR 与业务值不保存 RawJSON 包装，原始 sourcePayloads 继续是唯一数字词法来源。

正式接线已完成：v2 artifact、binding、verified read 和 outputAssembly 使用原 payload 核 fact 摘要；正式 recompile 从已持久 response 恢复传输 request，Python/v1/global digest 未改。实际 Python fixture 经 JSON 保存/加载后调用正式 recompile 为零 gap，canonicalDigest 相同；pages:1.0、指数与嵌套 payload、篡改拒绝、跨 observation 相同事实均有定点覆盖。受影响 artifact 4/4、output assembly 2/2、source reuse 1/1、跨语言往返 1/1、来源重复事实 1/1 和 API TypeScript 通过。最终审查追加了“同 observation 的每个重复 raw fact 均核 hash”修复，只验证该受影响用例。

用户指出累计耗时接近 3 小时后，本阶段明确收敛为：完成上述局部漏检，随后仅重跑原任务并报告候选/样本/换输入的真实结果，不继续扩展其他边界。主线仍未通过；两次格式拒收未取得可保存来源，是执行与测试安排的缺陷，不归因于用户需求不清。

## 本轮最终实际验收

`51ca80c2-9d7c-470e-935f-300dd2b0f8a4`，摘要 [mainline-natural-51ca80c2-9d7c-470e-935f-300dd2b0f8a4.json](mainline-natural-51ca80c2-9d7c-470e-935f-300dd2b0f8a4.json)。最终 fork/source 摘要 `2bd8d24e1fa4b153e7068e2cf373fce02d7c70e2989cc4f0ffdcf195edae47de`。

- 来源接受 1/1；success/judged/closed 均 true；17 个 Browser commands。该通过表示原生探索与判定，不是宿主独立业务验收。
- 产品模型仍为 Terra medium；审计可用：agent 完成 18、失败 1，extract 完成 3，judge 完成 1。三次读取候选均在 context limit 处停止，尚未调用 semantic annotation。
- 作业 failed / compiling / hybrid_compilation_gaps。共 21 gap：missing_effect_proof 12、missing_binding 4、missing_observation 4、invalid_source 1。对应原因包括同快照 DOM 目标 4、读取证据 3、读取上下文上限 3、目标 URL scope 脱敏 3、后态 2、seconds/keys/pages/down 各 1、动作成功结果 1、输出组合 1。
- candidate/sample/verification 均 false；sampleAttempts=0、verificationAttempts=0。探针 exit=0 只表示来源探针正常收尾。
- 应用已关闭，原 requirement/plan 摘要未变；完整来源保存在忽略的本地 run 目录，未重试、未接着修改运行代码。

本轮结论：自然语言正式入口与来源接线已经改通；原主线的可复跑链路尚未完成。前置工具的定点/合成页面通过证据，不能替代上述真实场景剩余缺口。保留旧补丁与历史来源；未创建分支/worktree、提交、推送、安装或运行全量测试。

## 现场效果与字段读取补齐范围

Product Alignment:
- natural-language task: 通过页面控件筛选列表、读取结果，或操作表单选项后读取反馈
- reusable chain boundary: 原生单次动作及明确现场后态；原生提取对应的有界 DOM 字段读取
- runtime inputs: 原任务输入；当次页面当前值
- dynamic task outputs: 本次实际 DOM 读取结果，不能冻结探索样本值
- generic platform capability used: browser-use Page/Element/Tools，现有 ReadSpec/BeautifulSoup，JSON Schema，StepVerifier/Tenacity
- replay model calls: 上述普通动作和字段读取均为 0；读取候选建议只属于首次探索的 semantic_annotation 审计
- site/task-specific code added: no

Reuse Assessment:
- capability: 明确 UI 状态事实、纯 wait 来源归并、已验证读取映射
- existing implementation in repository: read_fields、read_fact、causal.delayed_post/supporting_wait、StepVerifier、AIConnectModel.ainvoke
- mature candidates and pinned versions: 继续使用上述已固定 browser-use/workflow-use 和既有依赖
- selected implementation: 公开 Page/Element API 与原有验证器，局部适配原生回调
- reused public surface: 原生 CSS 查询/属性读取与可见性 API（可见性须以源码确认）；BeautifulSoup；Draft202012Validator；Tenacity
- B-A-T-owned adapter and remaining gap: 把事实绑定到当次 action/scope/outputPath，校验摘要、页面及容器身份，映射到已有 IR
- license/runtime/platform fit: 不更换依赖或许可证；平台兼容范围未扩大，Windows 未验证
- browser/runtime/state ownership conflicts: 单个既有 Browser；没有替代 Agent loop、运行调度或恢复数据库
- replay model calls: 普通能力无模型；不得把全部 extract 默认改成 LLM 复跑
- rejected candidates and evidence: 原生 schema 转换器的 anyOf/array/数量约束能力不足，已拒绝扩写通用转换器；整页任意 DOM hash 变化不能作为具体动作效果
- focused validation: 真实同页读取前后身份和值；值不符/越界/换页拒绝；同结构换内容；本次 baseline；连续纯 wait、跨 tab/超时/插入动作拒绝
