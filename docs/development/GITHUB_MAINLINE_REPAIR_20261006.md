# 主链路首败整改（2026-10-06）

原始冻结验收保留在 [验收记录](GITHUB_MAINLINE_ACCEPTANCE_20261006.md)，task `77bb9074-18c8-4b05-bc0d-f11324f19ab4` 不修改。以下修复属于下一基线，不能回填成首轮通过。

## 已确认断点与范围

1. 访谈成稿示例只展示一个 `一次执行` 步骤。该样本确实把选取入口和逐项读取合在一个步骤中；现有投影和执行器支持 `逐项执行`，需要在唯一访谈成稿处明确复用边界，不能让宿主按网站关键词补计划。
2. 原生 `search_page` 已提供真实标题的 DOM 路径；`find_elements` 未匹配到旧标题选择器。随后 `bat_read_fields` 仍使用未验证的旧选择器。原始 pre-observation o0020 的 native_action_result 明确为 `ambiguous_or_missing_read_field`，`field_name=编号, match_count=0`。不是连接故障。收紧工具使用说明，把现有原生发现能力用于结构字段，保留精确失败，仍由原生 Agent loop 决定下一步。
3. 计划画布 `__plan_start` / `__plan_end` 没有绑定检查回调。接入本次 execution 的计划输入、结果和现有结果对话框；步骤内终点仍表示该次调用。

## Product Alignment

- natural-language task: 保存动态集合中每个对象的详情；同样适用于逐项读取文档、逐项完成已授权表单操作。
- reusable chain boundary: 来源选择与每项处理按业务语义分解；一次代表试做对应可复用的方法。
- runtime inputs: 保留访谈已确认输入；逐项输入由前步真实入口集合提供。
- dynamic task outputs: 已确认字段或页面内容；正式运行聚合输出。
- generic platform capability used: 原生 B-U 查询和 Agent loop、现有字段读取及合同校验、LangGraph 调度、React Flow 节点与 Radix 结果对话框。
- replay model calls: 不新增；普通节点不调用模型。
- site/task-specific code added: no

## Reuse Assessment

- capability: 业务计划成稿、真实 DOM 字段发现、计划边界与结果查看。
- existing implementation in repository: interview skill/protocol、business-plan-projection、method_read_tool、PlanCanvasGraph、ChainBoundaryContext、SavedResultDialog。
- mature candidates and pinned versions: browser-use 0.13.8 `eb4126921bea3373f91afc49fb4b59d6eda7fed6`；workflow-use `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；React Flow 12.11.6 `0a1f9575b25679f2880175de8d3eae21aedde921`；现有 AI Connect 0.3.4 `1464cd24`、LangGraph 1.4.14。
- selected implementation: 继续使用以上已安装实现，不新增库或自建查询/重试/调度框架。
- reused public surface: B-U `Tools.search_page`, `Tools.find_elements`, `ActionResult`, 原生 Agent；AI Connect `defineFlatXmlDirective`；React Flow 自定义节点 data 回调；现有 Radix Dialog。
- B-A-T-owned adapter and remaining gap: 仅修改业务成稿约束、现有读取工具的发现说明、计划边界到持久化 execution 的 UI 绑定。
- license/runtime/platform fit: B-U MIT，workflow-use AGPL-3.0（本地受管 fork），React Flow MIT；现有 Windows Python/TypeScript 环境，不改依赖与版本。
- browser/runtime/state ownership conflicts: 无新增会话；计划结果取当前版本绑定的 execution，不使用任意最新步骤结果拼接。
- replay model calls: 无新增。
- rejected candidates and evidence: 不启用旧自写 DOM 树工具；固定 B-U 原生 `browser_use/tools/service.py` 的 search_page 已提供文本匹配的真实祖先路径，find_elements 已提供查询结果，无须复制实现。
- focused validation: 现有访谈协议、业务计划投影、计划画布回归；涉及包的类型检查；新冻结任务通过正常 UI 重新验收，原始失败与新轮分开；开发后对抗审查。

源码依据： [B-U Tools](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py)、[React Flow](https://github.com/xyflow/xyflow/tree/0a1f9575b25679f2880175de8d3eae21aedde921/packages/react/src)。本地实际源码与首轮查询回执均已核对；不把说明文案修改等同于实际任务通过。

## 最小验证与审查

- 访谈协议 16 项、业务计划投影 6 项通过。画布 4 项通过，包含真实 LangGraph 两轮分支运行、终点回调及选中状态。首次合并命令未指定工作台 JSX tsconfig，画布 SSR 报 `React is not defined`；随后仅重跑画布文件并显式指定原工作台 tsconfig，通过。没有改组件来掩盖命令配置问题。
- 工作台类型检查首次发现 summary execution 没有 input；改为仅从精确 detail 读取实际输入，通过。反馈范围修订后类型检查通过。
- 受管 fork 清单校验与已安装固定版本校验通过；没有重新安装、复制或改动第三方环境源码。新 sourceDigest 为 `a5ecbd32d4535f02e96953ef5fec15f3c35ecd49ea051045e29cab9d4b17278f`。
- 两个独立对抗审查分别发现：不能强迫已有 DOM/URL/继承/readRef 证据重复发现；计划级反馈不能继承步骤选择。均已修复并定点复审关闭。没有声明提示词已证明真实主流程通过。

## 新冻结轮次

2026-10-06T09:54:48.507Z 冻结。基线 HEAD `775fcd80869d1b22c62d8337193302b9929b3dc5`，本轮源码差异 SHA256 `97c2232140094981f09c9f00bc6c07639d1628ca337212bf77c52174aeac58c2`。

证据目录 `work/github-mainline-repair-20261006-1791280418937/`。重载前核验无活动准备/正式运行，通过项目自身 shutdown 关闭 PID20760，端口释放后仅启动 PID16076。新任务 `d828d855-cd24-42f1-ba80-76055ca9d6dc` 通过工作台输入原短需求，没有提供字段或技术步骤。后续结论待真实运行记录补充。

### 冻结轮次 2 失败与结束协议整改

- 系统自主澄清交付位置、最近创建排序，形成入口集合→逐项页面内容计划。任务 `d828d855-cd24-42f1-ba80-76055ca9d6dc`，job `9edbb8a9-f620-4056-825e-873b63a5c242`，owner `b94f7a0c-5941-43cb-8738-128023f9bee4`。来源链成功；第二步 a0004/a0006 因范围含不支持内容被拒绝，原生 Agent 经查询纠正后 a0009 保存了正文与两张原图。没有动态选择编译缺口。
- 此后有 5 条 `agent_step_auxiliary` 错误事实（最后一项 stepIndex17），没有有效 done 动作，trace.completed=false。原始错误仅有摘要引用，不能把读成功解释为探索成功，也不能断言辅助错误的具体正文。最终仍在 preexecuting 失败，未发布/正式运行/复跑。
- cleanup confirmed、activeResources=false；验收客户端等待超时导致其子 Chrome 随内核结束，独立于产品失败。服务 PID16076 保持；未重复启动浏览器或服务救场。
- 已核实接口冲突：固定 B-U Agent 构造通过 `Tools.get_output_model` 自动取得业务输出模型，再由 `_enhance_task_with_schema` 把完整业务字段作为 Expected output format 注入；B-A-T 自定义 done 却只接受 success/reason/readRefs。它同时要求“不要抄值”与“输出业务模型”。原生源码 `browser_use/agent/service.py:349–373,610–623`、`tools/service.py:2082–2088`。

Product Alignment:
- natural-language task: 原始内容采集或结构字段读取后完成一次代表试做。
- reusable chain boundary: 完成工具引用宿主已校验的读取回执。
- runtime inputs: 原确认输入不变。
- dynamic task outputs: 由已验证方法与回执构造，不让模型再次抄写。
- generic platform capability used: B-U Tools.get_output_model、原生 done 和 Agent loop。
- replay model calls: 不新增。
- site/task-specific code added: no

Reuse Assessment:
- capability: 自定义完成协议与原生 Agent 的输出模型发现适配。
- existing implementation in repository: AuthorTools.use_structured_output_action 和 author_step。
- mature candidates and pinned versions: browser-use 0.13.8 eb4126921bea3373f91afc49fb4b59d6eda7fed6。
- selected implementation: 使用现有 Tools 的公开 get_output_model 边界；B-A-T 不向 Agent 声明需要模型直接填写的业务结果。
- reused public surface: 原生工具注册、done 序列化、AgentHistory.get_structured_output 的显式模型参数。
- B-A-T-owned adapter and remaining gap: 保留业务模型在宿主完成适配器中，去掉错误的 Agent 输出 schema 广告。
- license/runtime/platform fit: 同原固定 MIT/Python/Windows 环境；不改依赖。
- browser/runtime/state ownership conflicts: 不引入新的 loop 或会话；只修协议交接。
- replay model calls: 无新增。
- rejected candidates and evidence: 不重试模型循环、不放宽输出合同、不强制成功；现有读取回执已经提供业务输出事实。
- focused validation: 原生 Agent 构造与自定义 done 合同定点回归；新的冻结轮次验证实际结果。

真实 Agent 构造回归先红后绿，8 项完成协议测试通过，对抗复审未发现新增 P1/P2：业务输出依旧经读取回执、Pydantic 和 JSON Schema 核验；原生 extract 使用独立 schema。该证据证明接口修复正确，尚不能证明它就是上一轮辅助错误正文。

第三轮：`00df69a7-559b-489e-b660-1acba1fdad21`，再次通过 UI 新建，仍仅输入原短需求。冻结时间 `2026-10-06T10:13:46.600Z`，源码差异 SHA256 `75fed07ce30024aa12ac9b646fb7f5eb6d230a38096cd853ed82c0fc7d64bcc4`，fork sourceDigest `513ddc8f533a77843f25fd2bb452af890850179f28614df019a8d351cef1bf41`。证据在上述目录 `round-3/`；Python 新进程加载已校验代码，API 服务未重启。

### 第三轮试跑首败：来源输入生命周期

准备 job `d6f9b304-454d-4a82-8ee3-2b2d1d091b8d` 两步探索均成功，详情第一次读取成功、有效 done 后自动进入 validating_sample。试跑 `c9b655c8-b9d8-4101-869f-b25fd7564b82` 来源调用和第一个详情调用 completed；第二个详情调用 `49147779-37ab-40f2-8b0e-c2afca71daaf` 失败 `entry_source_page_changed`。cleanup confirmed。没有发布/正式运行。来源输入只有列表页 DOM backend/root 身份，第一次同页导航消耗了该文档，后续输入失效；这不是 Chrome 连接问题。

Product Alignment:
- natural-language task: 从动态条目集合逐项打开详情，包括问题详情与文章详情等任务。
- reusable chain boundary: 来源选择产生实际观察到的导航地址，单项链路只消费当前输入地址。
- runtime inputs: 来源实际选中的链接；无导航地址的控件保留现有 live element 身份约束。
- dynamic task outputs: 同原确认结果，数量来自真实来源方法。
- generic platform capability used: B-U 原生 DOM/Element.evaluate、navigate、既有输入 URL 绑定。
- replay model calls: 0；不加恢复模型或调度器。
- site/task-specific code added: no

Reuse Assessment:
- capability: 将可导航入口作为值跨页面传递，避免把已消费的 DOM 句柄当下一次调用输入。
- existing implementation in repository: EntrySelection、ElementEntry、ReadSpec、natural_bindings、原生 NavigateAction。
- mature candidates and pinned versions: browser-use 0.13.8 eb4126921bea3373f91afc49fb4b59d6eda7fed6；Python 3.12 urllib.parse。
- selected implementation: 直接复用选中原生 anchor 的 href 和 navigate；同一工作页连续导航，不新建 N 个标签。
- reused public surface: browser_use/actor/element.py:711 Element.evaluate；浏览器原生 HTMLAnchorElement.href（包含 base URI）；tools/service.py:507 navigate 与 tools/views.py NavigateAction；urlsplit。
- B-A-T-owned adapter and remaining gap: 给新入口合同加可选实际导航地址；选中链接不再扩大成整行再丢失 href；已有无链接控件的严格身份解析不变。不从任意行内链接猜目的地，不通过旧 ordinal 恢复失效节点。
- license/runtime/platform fit: 同固定 MIT/Python/Windows 环境，无新增库。
- browser/runtime/state ownership conflicts: 复用单会话当前页；正常输入导航仍经过既有站点授权和原生导航证明，不修改页面 target 或源 DOM。
- replay model calls: 无。
- rejected candidates and evidence: 不克隆页面或放宽 backend/root 校验；同页/SPA 返回会重建 DOM，旧位置不能证明旧条目；不引入私有恢复框架。
- focused validation: 原生链接选择/地址读取/历史合同兼容定点回归，双条目同页导航样本，新冻结完整运行。

实现与最小验证：新入口可选 navigationUrl，只从选中 anchor 的原生 href 属性取得；download、非 HTTP(S) 和无链接控件不带导航地址。选中链接保持其自身范围，来源键优先使用实际地址。旧新完整 schema 在 Python 与 API 两端均被精确识别，旧 payload 不新增 null 字段；不改变旧版本。原生双链接同标签页导航及来源重读键一致性通过，含 base URI 和排除控件检查；入口身份/选择/记录范围共 25 项通过，业务计划投影 6 项通过，API 历史 schema 来源校验 1 项通过。对抗审查发现的 API 旧 schema 不兼容已修。异构或未来缺地址的来源仍可能真实失败，全部条目试跑会阻止发布；未增加隐式备用动作或恢复框架。

### 第四轮冻结验收：正常生成、正式运行与独立复跑通过

- 冻结时间 2026-10-06T10:38:25.658Z，HEAD 775fcd80869d1b22c62d8337193302b9929b3dc5，源码差异 SHA256 20757ea19d3e5578db7bb5fa087501e93cb303306d8b1f67ca02a99b3ef96fbd；sourceDigest b423faf06b665e3d667c0fbc10932570604c67848b73f758e074c55944af77b1。验收后核验 tracked diff 与新增测试哈希未变，见 round-4/freeze-verification.json。期间未修改代码、离线重编译或改数据库救场。
- 新任务 `7257c92b-9ecb-448f-afca-275a51e78db9`：只输入原短需求。系统自主询问保存记录还是页面内容，选择页面内容；随后生成来源 once → 详情 each（最多 5）的草案、动态创建时间倒序选择、排除评论和完整图文交付。由正常 UI 确认草案、生成、发布、运行及再次运行。
- 准备 job `6b77cc56-0b44-4184-8509-be1529647ebd` 完成。原生探索保留读取失败与自主纠正，未人工提供正文 selector。验证 `414db3f5-6b7a-4d1c-8952-561441af828e` 只包含来源步骤；`e3445a18-7f74-4076-8c65-249f732e7746` 才包含来源加 5 个详情。两者不能合称两次全量验证。
- 已发布 V1 的正式执行 `4dc1de4f-5bb6-49ec-810d-db2b9980b6df` 与独立复跑 `bc432f96-616b-44db-894e-ae4b2eba0cd4` 均 completed、5 条结果、6 次调用、20 条浏览器命令、0 次 LLM 调用、cleanup confirmed。独立 execution/run/invocation 身份与同一 release/plan/chain digest 已由对抗审查核验。
- 5 条来源为 43144/43142/43141/43128/43124。独立只读 GitHub 查询与本轮输出的 open 状态、创建时间倒序、顺序和数量一致；此查询只作验收对照，未写入任务输入/链路/结果。逐条正文对照无发现遗漏，保存范围为 issue-body-viewer，无评论标记。两张原图字节及 UI 解码通过：1542×1005、1919×909，complete=true，data 来源。结束节点→本次任务成果→记录→原图的 UI 实证在 round-4/02、03、04 图片及 image-display-proof.json。
- 已知质量限制：内容末尾保留 Add artifact / React 页面控件文字；没有宣称纯正文逐字清洗。没有验证修改条数参数、故障注入断线恢复、长期保活或任意新任务。该任务输入为 null，不能把动态来源冒称已验证任意参数变化。
- 对抗 review：主边界修复复审关闭 P1 历史 schema 不兼容；成果复审未发现本任务结果/运行证据的阻断矛盾。原图解码检查在其报告后补充完成。API check 首次因新增测试的窄 fixture 类型断言失败，修正测试显式 unknown 断言后通过；不是生产类型检查基线失败。
- 当前主服务 PID21192，4173/4175。原京东旧版链路正按同一源码基线正常 UI 复跑，结论另记；原维护脚本历史不因此获得正常生成验收。

### 同一源码下原京东旧发布链路复跑

- 原任务 `2aaa0674-ce91-462a-bce4-c21502ce755c`，原发布 V1 `f2e899dd-5ae5-4b86-8e4d-58c6d45133e6`，digest `c5f33870c2e33a56495e39458a2c8b8a7471816a7d4a6445868fde096f5e20dc`，通过工作台“再次运行”启动独立 execution `4fb15af8-15ea-4e2b-8656-641ea4a97f1c`。没有重新编译、发布、写库、模型补跑或人工替换结果。
- 来源及 5 项全部 completed，48 transitions、69 browserCommands、0 llmCalls、6 invocations。5 个产物均 coverage.complete=true，图片数分别 31/52/27/41/38；正文与图像字节仍为本次运行实际读取。结束节点可打开本次5条成果，截图在 jd-frozen-rerun/end-result.png。
- 生命周期曾观察到 cleanup_required/pending；系统自身继续清理，第3次 confirmed 后 execution.completed。业务完成与资源清理分别记录，未人工点恢复或终止浏览器。
- 仅支持“旧发布链路当前可复跑”。原京东链路曾经过维护脚本补救的准备历史仍不算正常生成验收；本轮没有重做从原需求正常生成京东新版本，也未新增销售排序的独立业务审查。不能以此宣称京东完整新建主流程或所有基础能力已验收。
- 本轮所有源码修改均发生在 round-4 冻结之前；之后仅更新证据和文档。最小验证与两项对抗复审通过，原未跟踪 unused-owned-fixture 保留。

京东补充对抗审查确认运行前后完整发布对象一致、5个不同商品具有实际图文载荷；最终快照单独不能证明清理重试无人介入，自动处理结论同时依据本轮UI/工具操作记录。GitHub原图解码与可见截图已复核关闭展示证据缺口。证据摘要 HTML 长度使用 htmlChars，避免把字符数误称字节。
