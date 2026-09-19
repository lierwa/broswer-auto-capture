# 技术调研与复用结论

本文件只保留当前选型和仍有效的边界。阶段进度见 [PROGRESS](PROGRESS.md)，执行顺序见 [ROADMAP](ROADMAP.md)。

## Reuse Assessment

- capability: 浏览器 Agent 探索、原生动作/DOM 能力、history 证据、确定性工作流执行和条件核验。
- existing implementation in repository: B-A-T 已有 TaskChain、LangGraph、版本、输入输出绑定、预算、幂等、恢复、持久化和模型审计。
- mature candidates and pinned versions: browser-use 0.13.8；workflow-use 0.2.11，
  commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；Python 3.12。
- selected implementation: 受管 workflow-use fork 的运行源码子集，通过公开 schema/history/Tools/Agent/StepVerifier surface 适配。
- reused public surface: browser-use Browser、Agent、Tools、action schema、history、DOM/element 查询；
  workflow-use schema、executor、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: Requirement/TaskPlan 输入、证据规范化、TaskChain 物化、版本、审计和产品生命周期；
  A 的受控页和实际任务页已通过，B/C/D 与组合验收未完成。
- license/runtime/platform fit: browser-use 为 MIT；workflow-use 为 AGPL-3.0。仓库保留许可证、固定 commit、archive digest、
  留存源码逐文件 digest 和本地变更 digest；来源校验以 LF 为规范字节，兼容 Windows checkout 的 CRLF。Windows 运行由当前 checkout 的正式验证决定。
- browser/runtime/state ownership conflicts: 一个产品运行只占用一个 Browser 会话；借用节点不关闭外层会话；
  LangGraph 是唯一图执行器，产品数据库是运行事实源。
- replay model calls: 普通节点为零；仅显式 `llm` 节点允许调用模型。
- rejected candidates and evidence: 上游 mechanical conversion 缺少任务意图、动态绑定和完整控制依据；
  LLM 整图生成会漏步骤、重排和固化样本；旧多层 patch 路线已退出。
- focused validation: 固定来源校验、主链测试、受控真实 Browser、实际任务页、变化输入/状态、模型审计和 finally 资源关闭。

## 当前结论

fork 只保留 B-A-T 运行和主链回归需要的文件：生产 Python 包、锁文件、包 README、许可证、来源/本地变更清单、
来源校验器，以及两个生成主链 fixture 的 Python 文件。上游扩展、独立 UI、示例、CI、开发测试、样本 storage 和重复文档
不参与产品运行，已从 checkout 删除。

首次探索可调用模型和浏览器；成功且业务结果完整后，程序依据 Requirement、TaskPlan、真实 trace 和 provenance 编译。
固定输入与编译版本必须产生稳定 TaskChain。复跑只执行普通能力和显式声明的 LLM 节点，所有模型调用进入运行审计。

选型尚未由完整业务验收冻结。A 已通过；B 的稳定读取、C 的异步顺序、D 的共享会话模型节点以及 E 的同链换输入仍须分别通过。

## 首次业务完成后的确定性读取补证（已撤销）

2026-09-18：本节记录的第二轮 Agent follow-up 已从生产入口删除。真实运行证明“再让模型选择 DOM refs/字段工具”仍把
复跑证据交给随机模型，且会增加 provider 调用。当前方案改为原生 `extract` 同页回调中的宿主记录投影；以下内容仅保留为否决证据。

Product Alignment:
- natural-language task: 首次浏览任务已完成业务读取，但原生 `extract` 尚未留下可供普通执行器复跑的字段读取证据。
- reusable chain boundary: 在同一首次探索和同一 Browser 会话内，对编译器明确报告的字段读取缺口执行一次有界补证，然后重新编译。
- runtime inputs: 已确认的输入/输出合同、首次业务结果、标准化 trace、编译缺口和仍存活的 Browser 会话。
- dynamic task outputs: 新增的 `bat_read_fields` 验证事实、重新编译后的剩余缺口和原首次业务结果。
- generic platform capability used: browser-use Agent 的公开 follow-up API、现有 `bat_read_fields`、标准化证据和编译门。
- replay model calls: 0；补证属于首次探索，冻结后的普通复跑仍只允许显式 `llm` 节点调用模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 业务完成后继续使用同一 Agent、消息历史和 Browser 会话收集缺失的确定性读取证据。
- existing implementation in repository: `author_step` 已拥有同一 Browser、Agent、Tools、EvidenceCollector、字段读取工具和编译器；缺口是业务 `done` 后没有补证阶段。
- mature candidates and pinned versions: browser-use 0.13.8 的 `Agent.add_new_task()` 与再次 `Agent.run()`；workflow-use 0.2.11 的既有编译和证据适配层。
- selected implementation: 复用 `add_new_task()` 发起至多一次有界补证；只在首次业务 `done` 成功、输出合同通过且编译器仍报告 `natural_field_read_evidence_missing` 时启动。首次 judge 已通过则保留原业务结果；首次 judge 未通过时，只接受补证后再次通过 judge 的完整结果。
- reused public surface: `Agent.add_new_task()` 明确保留同一 task id 和消息历史、重置控制状态并重建 Agent event bus；`run()` 重新启动同一外部 keep-alive Browser 会话。
- B-A-T-owned adapter and remaining gap: B-A-T 只识别自己的编译缺口、生成通用补证指令、合并新 trace 并重编译；不实现新的 Agent loop、选择器推理器或网站专用路径。
- license/runtime/platform fit: 延续已固定的 browser-use MIT / workflow-use AGPL-3.0 与 Windows Python 3.12 运行边界，不新增依赖。
- browser/runtime/state ownership conflicts: 不创建第二个 Browser 或并发运行；补证仍在原产品运行中，最终由既有 `finally` 关闭外层会话。
- replay model calls: 0；补证模型调用只发生在首次 authoring。
- rejected candidates and evidence: 不把 `extract` 伪装成确定性读取；不复制 Agent loop；不靠重复整次任务碰运气；不写 GitHub 页面或业务字段 special case。
- focused validation: 先用受控多字段列表/详情样本证明单次 follow-up 只在目标缺口出现时触发且沿用同一 Agent；再执行一次真实 GitHub B 验收，要求三个字段读取缺口消失或输出新的固定失败原因，禁止无变化重试。

上述 follow-up 的“模型先用 `find_elements` 猜出 CSS，再交给 `bat_read_fields`”接口不再作为 B 的实现方向。
真实运行已经证明，即使提示词要求复用已匹配 selector，字符串参数仍允许模型自行增加父子组合；这不是可由更多提示词修复的执行契约。

## 真实 DOM 节点引用到确定性字段读取（已撤销为生产入口）

2026-09-18：opaque refs、DOM 检查工具和字段读取工具仍保留历史回归代码，但不再注册给 authoring 模型，也不再参与新的来源补证。
它们证明了 backend node/live DOM 反查边界，也证明“让模型声明字段—节点关系”并不可靠；生产迁移入口由宿主自动推导并反读验证。

Product Alignment:
- natural-language task: 首次 Agent 已从截图和 Browser-Use DOM 状态识别业务字段，需要把它实际选择的页面节点编译成零模型复跑读取。
- reusable chain boundary: 模型只选择当前观察中的真实节点并声明节点到输出字段的对应关系；B-A-T 保存有界局部 DOM 关系，机械生成并验证复跑定位表达。
- runtime inputs: 当前 Browser-Use `BrowserStateSummary`、原生 selector index、输出 schema、页面身份和同会话节点引用表。
- dynamic task outputs: 经当前页反查证明的容器与相对字段定位、字段值、局部 DOM 来源摘要和固定失败原因。
- generic platform capability used: Browser-Use `selector_map`、`EnhancedDOMTreeNode` 父子关系/backend id、Actor `Element` 与现有 `browser.read-fields`。
- replay model calls: 0；普通复跑只执行已验证定位和字段投影。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从模型已选择的真实 DOM 节点形成可持久化、可重新解析的字段读取描述。
- existing implementation in repository: `dom_evidence.py` 已复制交互节点的祖先、直接子节点、XPath、结构属性和页面身份；`read.py` 已拥有受 schema 约束的容器/相对字段读取及双读一致性校验。
- mature candidates and pinned versions: browser-use 0.13.8 的 `selector_map`、`EnhancedDOMTreeNode`、`DOMInteractedElement` 和 Actor `Element`；workflow-use 0.2.11 的原生 Agent/Tools 生命周期。
- selected implementation: 新增有界 DOM 检查工具，以 Browser-Use 当前 selector index 为锚点返回仅在本次 authoring 会话有效的 opaque node refs；`bat_read_fields` 只接受这些 refs。适配层从真实父子关系机械生成 CSS 路径，并用浏览器原生查询反查 backend id；只有容器集合和每个相对字段都与所选节点完全一致时才生成现有 `ReadSpec`。
- reused public surface: Browser-Use 负责页面观察、交互节点编号、完整增强 DOM 树、CDP 页面和 Element 包装；Chrome 负责解析生成后的 CSS；现有 `read_fields_with_proof` 负责页面、集合和双读一致性。
- B-A-T-owned adapter and remaining gap: 只维护 authoring 会话内节点引用、局部结构投影、从已选真实节点到已验证 `ReadSpec` 的转换及证据脱敏；不实现第二个 Agent loop、CSS 解析器或站点规则。当前切片先支持同一主文档内的有界对象/对象数组和标量叶；frame/shadow 边界保持显式不支持，后续复用原生能力扩展。
- license/runtime/platform fit: 不新增依赖；延续 browser-use MIT、workflow-use AGPL-3.0 与 Windows Python 3.12 边界。
- browser/runtime/state ownership conflicts: 不创建 Browser 或 Agent；节点引用绑定当前 target/url/backend node，只能在产生它的活跃页面消费。
- replay model calls: 0。
- rejected candidates and evidence: 拒绝模型提交 raw CSS；拒绝把旧 backend node id 当作跨页面持久定位；拒绝保存整页原始 DOM；拒绝复制 Browser-Use 的 Agent rerun。原生 `find_elements` 只返回扁平文本且仍以模型 CSS 为输入，不能作为节点来源证明。
- focused validation: 先证明任意模型 CSS 已从字段工具契约消失、跨页/伪造 ref 被拒绝、生成定位反查到同一 backend node、节点重建和记录重排后现有 reader 仍读取新值；再只运行一次真实 GitHub B。

首次真实 GitHub B 运行暴露了 Browser-Use `ActionResult` 的一个集成语义：同时设置
`long_term_memory` 与 `extracted_content` 时，默认只把前者放入下一轮模型上下文；只有
`include_extracted_content_only_once=true` 才会把后者放入一次性 read state。旧实现因此让动作成功、证据也被采集，
但模型实际只看到“检查了 N 个节点”的摘要，看不到任何 `dom-*` 引用。修复必须使用 Browser-Use 已有的一次性 read state
公开 surface；不能删除长期摘要，也不能把含页面文本的局部 DOM 长期保留在模型记忆或持久化证据中。

同一次修复后的第二个请求没有启动 Browser，而是复用了修复前的 source artifact。检查确认复用门只校验需求、计划、输入、
业务结果和关闭状态，没有校验 artifact 的 `forkSourceDigest` 是否仍等于当前受管 fork。编译 gap 仍是派生结果：在同一 fork
摘要下允许当前编译器重新判定；但 fork 摘要变化意味着 authoring 工具、采集或编译实现至少一项已变化，旧来源不能假装由当前
实现产生。复用门因此必须新增当前 fork 摘要匹配；不通过时重新探索，而不是继续重编译旧 trace。

修复后真实 B 已能连续提交 opaque refs，但五次 `bat_read_fields` 都返回同一个固定错误
`dom_reference_container_mismatch`。按持久化 ActionResult 的 canonical digest 反算确认了该错误，不是猜测。根因是适配层从
Browser-Use 的增强 DOM 树计算 `:nth-of-type`；该树服务于模型观察，会裁剪普通 DOM 节点，因此其兄弟序号不等于浏览器完整
DOM 的 CSS 序号。下一步保留 opaque backend-node refs，但不再从增强树推算定位：通过 Browser-Use 已有 `Page.get_element` 和
`Element.evaluate` 在被选真实节点上读取完整 live DOM 的机械路径，再由 `Page.get_elements_by_css_selector` 反查同一 backend id；
字段相对路径也只从容器和字段节点各自的 live 路径求差并在容器内反查。模型仍不提交或编辑 CSS。

真实 Browser-Use 受控页进一步暴露了 Actor 的公开前置条件：仅有 backend id 时直接调用 `Page.get_element`，
`Element.evaluate` 会因当前 CDP document 尚未请求而返回 `Document needs to be requested first`。这不是 selector
不匹配，也不能继续折叠成未知工具错误。修复复用现有 `element_from_backend`：先通过公开页面 API 初始化并核验当前主文档，
再包装已保存 backend node；容器和字段节点的查询仍反查同一 backend id。节点已被替换或离开当前文档时分别固定为
`dom_reference_container_mismatch` / `dom_reference_field_mismatch`，不回退到相似节点。

真实 GitHub job `58786140-294c-4f29-8cd0-d23254379d39` 证明上述 document 初始化修复成立：详情正文和标题的两次
`bat_read_fields` 都从 opaque refs 成功读取。新失败 `dom_reference_outside_container` 的证据中，模型为同一列表记录选择了
准确的编号、标题、标签、时间和链接节点，却把标签节点 `dom-965` 同时声明为整条记录的父容器；其余字段自然不在该节点内。
这不是目标节点失效，也不是 CSS 解析问题，而是协议仍要求模型判断父子范围。后续不得放宽为跨容器任意拼接，也不得让模型重猜
父节点；记录范围应由 B-A-T 从同一受控 DOM 中所选字段 refs 的有界最近公共祖先机械推导并用 live backend ids 反查。

Product Alignment:
- natural-language task: 首次 Agent 选择一条页面记录的真实字段节点，后续将该记录编译为可复跑字段读取。
- reusable chain boundary: 模型只声明输出记录及字段到 opaque DOM refs 的对应关系；记录容器由程序从真实父链推导。
- runtime inputs: 同一当前页面的字段 refs、Browser-Use 增强 DOM 父链、输出 schema 和 live backend nodes。
- dynamic task outputs: 经有界公共祖先和 live DOM 反查证明的记录容器、相对字段定位和值。
- generic platform capability used: Browser-Use 节点父链/backend id、现有 `browser.read-fields` 与证据门。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 从多个已选字段节点确定同一记录的读取范围。
- existing implementation in repository: `DomReferenceStore` 已持有真实父链、页面身份和 backend id；`ReadSpec` 已要求容器内字段完全匹配。
- mature candidates and pinned versions: browser-use 0.13.8 `EnhancedDOMTreeNode.parent_node` 与 Actor `Element`。
- selected implementation: 移除模型可填的 `containerRef`，在每个显式 record 内对全部字段 refs 求有界最近公共祖先；跨页面、跨 frame/shadow、超过有界父链、落到文档根或多记录得到同一容器均固定失败。
- reused public surface: 继续复用 Browser-Use 父链和 `element_from_backend`；不新增 DOM 解析器或浏览器控制层。
- B-A-T-owned adapter and remaining gap: 只负责记录分组、公共祖先门和现有 `ReadSpec` 适配；字段跨刷新重绑定仍由后续字段 history target 切片完成。
- license/runtime/platform fit: 不新增依赖，延续固定 Python/Browser-Use 版本。
- browser/runtime/state ownership conflicts: 不创建新 Browser/Agent，会话和页面仍由现有 authoring 持有。
- replay model calls: 0。
- rejected candidates and evidence: 不信任模型提供父容器；不接受 `body/html` 级公共祖先；不在失败后回退到相似文本、CSS 或任意跨记录拼接。
- focused validation: 两条结构不同记录能从字段 refs 推导各自容器并读取；跨记录混选被固定拒绝；模型 schema 不再暴露 `containerRef`；DOM 错误进入诊断而非折叠为 unavailable。

## 本地环境安装

Reuse Assessment:
- capability: 一条命令安装 npm workspace、Python 3.12 和固定 Python 依赖。
- existing implementation in repository: 根 `package-lock.json`、workflow-use `uv.lock` 与
  `scripts/setup-upstream-browser-runner.mjs` 已拥有依赖同步和版本核验。
- mature candidates and pinned versions: npm 11 的 lockfile 安装；Astral uv 0.12.15 官方独立安装器及受管 Python。
- selected implementation: `npm run setup` 调用 `npm ci`，再把固定 uv 安装到忽略的 `work/tools/uv`，
  最后复用现有 `uv sync --frozen --python 3.12`。
- reused public surface: uv 的 `UV_UNMANAGED_INSTALL`、`UV_PYTHON_INSTALL_DIR`、`UV_CACHE_DIR`、
  managed Python 下载和 frozen sync。
- B-A-T-owned adapter and remaining gap: 只负责版本门、项目内路径、跨平台进程调用和最终版本核验；首次安装需要访问 npm、
  Astral/GitHub 与 Python 包源。
- license/runtime/platform fit: uv 采用 MIT OR Apache-2.0；官方安装器支持 Windows、macOS 和 Linux。
- browser/runtime/state ownership conflicts: 安装阶段不启动 Browser、模型、队列或产品服务；环境位于忽略的 `work/`。
- replay model calls: 0。
- rejected candidates and evidence: 不依赖全局 Python/pip 或手写虚拟环境；不复制解析器和安装器。
- focused validation: 全新工具目录执行 setup、重复执行 setup check、来源 digest、Python/包版本和 API TypeScript 检查。

## 旧批次计划读取兼容

Product Alignment:
- natural-language task: 启动最新代码后仍能读取任务列表并进入需求对话。
- reusable chain boundary: 已持久化计划的只读兼容；执行门继续拒绝缺少批次聚合声明的计划。
- runtime inputs: 同一协议版本下、尚未包含 `aggregates` 的历史 `batch` invocation。
- dynamic task outputs: 读取时规范化为空聚合列表，并返回明确的不可执行问题。
- generic platform capability used: Zod 持久化协议解析与 `taskPlanExecutionIssues` 执行门。
- replay model calls: 0。
- site/task-specific code added: no
# 交互节点跨页面重绑定（2026-09-18）

Product Alignment:
- natural-language task: 首次由模型选择交互节点，后续打开同类页面时由普通执行器定位并操作同一业务目标。
- reusable chain boundary: 交互动作保存 Browser-Use 历史元素身份，复跑映射到当前 selector index。
- runtime inputs: 参数化动作参数与当前页面 DOM。
- dynamic task outputs: 当前唯一目标 index、动作结果和声明的后置条件。
- generic platform capability used: 版本化目标、证据、能力节点与运行审计。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: Browser-Use 历史交互元素在新 DOM 快照中的重绑定。
- existing implementation in repository: `dom_evidence.py` 已保存局部图，但编译器只产出 CSS/XPath，运行器未消费原生历史身份。
- mature candidates and pinned versions: browser-use 0.13.8 `DOMInteractedElement`、`element_hash`、`compute_stable_hash`、XPath、AX name 与 selector map。
- selected implementation: 直接保存原生哈希/结构身份；运行时及动作后控件值复查都在新 selector map 按原生层级匹配，并在每层强制唯一。
- reused public surface: `DOMInteractedElement.load_from_enhanced_dom_tree`、增强节点哈希、稳定哈希、XPath、AX 与属性。
- B-A-T-owned adapter and remaining gap: 只负责隐私安全序列化、页面范围约束、唯一性门和当前 index 输出；frame/shadow 仍显式不支持。
- license/runtime/platform fit: 不新增依赖，继续使用固定 browser-use 0.13.8 与现有 Python 3.12 进程。
- browser/runtime/state ownership conflicts: 不创建 Agent/Browser，不接管循环或会话，只读取当前 BrowserSession selector map。
- replay model calls: 0。
- rejected candidates and evidence: `Agent.rerun_history` 会接管整段历史、最终调用摘要模型并关闭会话；私有 `_update_action_indices` 返回首个弱匹配且不能作为稳定公开契约；复制 raw DOM 或 backend id 不能跨刷新。
- focused validation: selector index 改变仍按稳定哈希命中；同层多候选明确失败；编译产物保留 history identity 且不降级为 CSS/XPath；无 `aria-label` 输入框仍能在动作后唯一重绑定并读取值。

# 消费者驱动的异步就绪（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 完成真实异步交互后，把同一过程冻结为动作一次、零模型的确定性复跑。
- reusable chain boundary: 有副作用动作到其后第一个已验证目标或结构化读取之间的消费就绪合同。
- runtime inputs: 动作参数、动作前同一投影基线、下游目标/投影、页面作用域和有界等待策略。
- dynamic task outputs: 当前运行实际解析出的唯一目标或通过 schema 且稳定的投影结果。
- generic platform capability used: 现有目标重绑定、`browser.read-fields`、workflow-use `StepVerifier`/Tenacity 和 TaskChain capability。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 异步动作后等待真正的下游可消费事实，同时保证副作用动作不重试。
- existing implementation in repository: `OrdinaryCapability.execute_checked` 已先取基线、执行一次动作、再通过 `StepVerifier`/Tenacity 重查后置事实；`TargetResolver` 已重新解析当前 DOM；`ReadSpec` 已有 schema 和有界基数。
- mature candidates and pinned versions: workflow-use 0.2.11 `StepVerifier`、Tenacity 9.1.2、browser-use 0.13.8 页面/元素 API；Playwright web-first assertion 作为职责边界参考，不新增依赖。
- selected implementation: 编译器从相邻成功轨迹引用第一个 `VerifiedNaturalRead`；导航使用 `ready`，同文档/外部状态使用 `transition`；目标型消费者在目标解析入口只重试缺失。
- reused public surface: `StepVerifier.verify_step`、Tenacity 有界重试、现有 `read_fields`、目标解析和页面 scope。
- B-A-T-owned adapter and remaining gap: 生产者/消费者因果连接、基线不可读到稳定可读的转换语义、两次一致门和固定错误分类；字段投影已移出模型工具，正式结构目标 IR 与 E4 仍待冻结。
- license/runtime/platform fit: 不新增依赖，不改变 Python/TypeScript/Windows、浏览器会话或许可证边界。
- browser/runtime/state ownership conflicts: 动作仍只由现有 capability 执行一次；不创建第二个等待器、Agent loop、Browser 或状态机。
- replay model calls: 0。
- rejected candidates and evidence: 不用 DOM 静止、network idle、URL 变化或 fixed sleep 单独证明完成；不让模型选择等待类型；不建立分页/筛选/导航/懒加载场景枚举；不把歧义当作加载中。
- focused validation: 同文档投影必须变化且连续两次一致；动作创建的投影允许不可读到稳定可读；导航投影不读旧页面基线；目标缺失重试、多候选立即失败。

# 宿主拥有的记录投影与结果配方（2026-09-18）

Product Alignment:
- natural-language task: 首次 Agent 用原生浏览器能力取得业务结果后，程序自动形成零模型复跑所需的记录读取和最终输出绑定。
- reusable chain boundary: 一个同页原生 `extract` 对应一个经 live DOM 反读证明的对象/对象数组读取；多个动态来源按 `ValueBinding` 装配最终输出。
- runtime inputs: 同页连续两份增强 DOM、当前 document 身份、输出 schema、任务输入、需求原文和最终成功业务输出。
- dynamic task outputs: 当前页面实际记录数、字段值、绝对链接、运行输入映射和最终任务输出。
- generic platform capability used: browser-use 增强 DOM/Actor Element、现有 `ReadSpec`/`read_fields_with_proof`、`ValueBinding` 和 `data.transform`。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 在不要求模型描述 DOM、等待或输出绑定的前提下，把首次业务读取转成候选复跑规则。
- existing implementation in repository: `EvidenceCollector` 已拥有原生 extract 回调和最终输出；`ReadSpec` 已有 schema/基数/双读门；输出装配已有 merge/assemble 数据节点。
- mature candidates and pinned versions: browser-use 0.13.8 `SerializedDOMState`/`EnhancedDOMTreeNode`/Actor Element；Chrome `innerText`、属性和 URL 解析；workflow-use 0.2.11 证据生命周期。
- selected implementation: 模型只执行原生 Browser-Use 业务动作。每次 extract 后宿主在内存连续捕获两份同页增强 DOM；业务成功后用最终输出反向寻找两份快照都能唯一复现的最大字段投影，生成迁移 `ReadSpec`。数字文本只允许共同固定前后缀，空白规范化必须由最终值证明。结果配方接受 node、唯一同 schema input 和需求原文授权字符串 constant；后续动作可绑定前序读取的唯一精确值路径，未覆盖输出叶子可唯一复用已验证读取的同 schema、同值叶子。
- reused public surface: 不复制 Browser/Agent/图执行器；继续使用 browser-use 页面事实、现有 reader、TaskChain `ValueBinding` 与 `data.transform`。
- B-A-T-owned adapter and remaining gap: 当前只支持同一主文档、有界对象/对象数组、标量/标量数组字段和共同直接子路径；正式 `RecordProjection` 结构目标、frame/shadow/虚拟列表和派生数据节点仍待分阶段验证。
- license/runtime/platform fit: 不新增依赖；保持固定 Python、TypeScript、Windows 与许可证边界。
- browser/runtime/state ownership conflicts: 只读取当前 authoring Browser；没有第二轮 Agent、第二个 Browser、第二套等待器或输出运行时。
- replay model calls: 0。
- rejected candidates and evidence: 不再注册五个 B-A-T 模型工具；不信任 `extract` 回执或 metadata；不把重复值绑定到第一个节点/输入路径；不保存每条样本 selector；不把宿主生成但未由两份 DOM 共同证明的 CSS 当作证据；不把 DOM index 当作业务绑定。
- focused validation: 合成结构测试覆盖 2 条记录、普通兄弟、同节点文本+href、多值字段、重复值拒绝、一个读取节点映射多个输出字段和整体数组绑定；hybrid Python 40/40、TypeScript 定点 7/7、API 类型检查通过。最新真实 GitHub B 来源成功，但编译尚有 9 个缺口，修复后未重跑，E4 未执行。

真实 job `6d6c0e9e-4ab7-4f06-8429-1585046ece55` 的关键反证：三个原生 `extract` 均未提供可用结构化 metadata；第二页回执仍含第一页列表，
而最终 `done` 中第二页列表已经正确；详情回执又比最终输出选择的正文范围更宽。因此 `extract` 回执只能是 Agent 探索材料，不能作为编译事实源。
新的权威链为“同一动作时刻的两份同页 DOM + 最终成功输出 + 确定性反向投影”；无法唯一复现即缺口，不调用模型补证。

# 干扰与滚动可观测性（2026-09-19）

Product Alignment:
- natural-language task: 复跑浏览器动作时，准确区分原生 dialog、DOM 遮挡和滚动无效，不靠模型猜测页面语义。
- reusable chain boundary: 一个普通浏览器动作的准备、实际派发、事件命中和后置事实。
- runtime inputs: 当前稳定目标或有界 scroll 参数、当前页面状态和声明的后置条件。
- dynamic task outputs: dialog occurrence、DOM 命中关系、scroll 前后坐标/范围/事件及稳定失败原因。
- generic platform capability used: `browser.workflow-step`、browser-use Browser/Tools、CDP 事件和现有 StepVerifier。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 原生 dialog 去重、实际点击机制核验、滚动输入与效果核对。
- existing implementation in repository: browser-use 0.13.8 watchdog/Tools/ScrollEvent，A 的 `DialogEventBridge`，C 的 `NativeEventCapture` 与后态验证。
- mature candidates and pinned versions: browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11、Tenacity 9.1.2。
- selected implementation: 复跑动作级复用已有 dialog bridge；scroll 派发窗口同时捕获 wheel/scroll，并读取前后固定数值事实。
- reused public surface: BrowserSession、Tools.act、现有 CDP EventRegistry、Page.evaluate、StepVerifier/Tenacity。
- B-A-T-owned adapter and remaining gap: owner 生命周期、无位移原因分类和审计 metadata；不拥有任意 DOM 弹窗语义判断或关闭策略。
- license/runtime/platform fit: 不新增依赖、浏览器或执行循环；沿用受管 AGPL fork 和 Windows/Python 3.12 环境。
- browser/runtime/state ownership conflicts: authoring 继续拥有 run-scoped bridge；普通复跑只在单次动作内借用并恢复同一 registry handler。
- replay model calls: 0。
- rejected candidates and evidence: `role=dialog`/样式不能证明业务语义；browser-use 合成 click 与物理鼠标机制不同；ActionResult 成功不能证明 scroll 实际位移。
- focused validation: 一个真实 Chromium 会话覆盖 native confirm、DOM 完全/部分覆盖、合成/物理点击、正常/无范围/边界/CSS 锁定/事件取消滚动；相关 Python 35/35。

# D 节点职责与沙箱选型（2026-09-19）

Product Alignment:
- natural-language task: 在确定性浏览器复跑中加入纯函数、多路条件和明确声明的语义判断，同时不让未知页面干扰触发模型接管。
- reusable chain boundary: 一个 stable/v2 TaskChain；Function、Branch、LLM 和可选准备动作均为跨网站通用语义。
- runtime inputs: 值绑定、当前页面观察或截图产物和随链版本保存的函数/prompt。
- dynamic task outputs: Function 的一个 JSON 值、Branch port 和 LLM 的一个类型化 `result`。
- generic platform capability used: Zod、LangGraph、QuickJS/WASM、browser-use/CDP、AI Connect。
- replay model calls: Function/Branch/干扰处理为 0；每个实际到达的显式 LLM 节点为 1。
- site/task-specific code added: no。

调研结论：

- [Dify Workflow 快速入门](https://docs.dify.ai/en/guides/application-orchestrate/creating-an-application) 将参数提取/LLM、IF/ELSE、列表处理和模板格式化分开，并明确规则格式化用非 LLM 节点可以获得稳定、零 token 的结果。
- [Dify 错误处理](https://docs.dify.ai/zh/use-dify/build/predefined-error-handling-logic) 把失败终止、默认值和 failure branch 作为节点运行合同，不要求模型生成错误字段。
- [Coze Studio 后端节点文档](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-%28backend%29/e4f740cd15c24f89fb9289592420bdc706fc02b5) 使用动态普通 port、default port 和 exception port；分支选择由节点实际输出映射到 port。
- [Coze Studio Code Runner 配置](https://github.com/coze-dev/coze-studio/wiki/5.-%E5%9F%BA%E7%A1%80%E7%BB%84%E4%BB%B6%E9%85%8D%E7%BD%AE/a95a5bcb378ffed2e75add220aa969cbba0ddb0d) 区分 sandbox/local，并为环境、读写、进程、网络、超时和内存提供许可边界。
- [Dify Sandbox](https://github.com/langgenius/dify-sandbox) 是 Apache-2.0 的成熟独立服务，但依赖 Linux、seccomp 和 chroot，不符合 B-A-T 当前 Windows 本地默认运行条件。
- [Node.js `vm` 文档](https://nodejs.org/download/release/latest-v21.x/docs/api/vm.html) 明确说明 `node:vm` 不是安全机制，不能执行链路内不受信任代码。
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) 通过 QuickJS/WASM 在 Node 中隔离执行 JavaScript；当前固定候选版本 0.32.0、MIT，适合作为 Windows 与 macOS 共用 Function 执行器的直接候选，但理论可移植性不能代替双平台实测。

Reuse Assessment:
- capability: stable/v2 Function、N 路 Branch、单次单值 LLM 和确定性页面干扰处理。
- existing implementation in repository: stable/v1 六类节点、ValueBinding、TaskDataContract、LangGraph runtime、browser-use/CDP adapter 和 AI Connect 审计。
- mature candidates and pinned versions: quickjs-emscripten 0.32.0；Dify Workflow/Dify Sandbox；Coze Studio workflow/code runner。
- selected implementation: Function 复用 QuickJS/WASM；Branch 采用动态 port；LLM 复用现有单次模型桥并移除 delegate。
- reused public surface: QuickJS runtime/context/interrupt；现有 Zod、LangGraph、BrowserSession/CDP 和模型审计。
- B-A-T-owned adapter and remaining gap: stable/v2 合同、v1 只读、沙箱输入输出、port 物化、固定 prompt、可选准备动作、UI 和运行证据。
- license/runtime/platform fit: quickjs-emscripten 为 MIT 且无需 Linux sidecar；安装后必须在同一 commit/lockfile 的 Node 24/Windows x64 与 macOS arm64 上验证中断、内存、栈、宿主隔离和清理；若产品支持 Intel Mac，再补 macOS x64。
- browser/runtime/state ownership conflicts: Function/LLM 无 Browser 权限；干扰处理继续借用唯一 Browser；不新增 Agent loop、图引擎或 checkpoint store。
- replay model calls: 普通路径 0；显式 LLM 每节点最多 1。
- rejected candidates and evidence: Dify Sandbox 缺 Windows 默认支持；Coze local runner 无安全隔离；`node:vm` 不是安全边界；browser-use Agent 会混合模型决策和浏览器动作。
- focused validation: React/Radix 干扰站可见 + headless；QuickJS Windows/macOS 双平台 spike；stable/v1/v2 保存加载；Function/Branch/LLM 正常和错误出口；真实页面不同输入。
