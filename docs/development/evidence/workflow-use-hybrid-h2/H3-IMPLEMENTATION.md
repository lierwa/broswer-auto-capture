# H3–H6 持续实施记录

Product Alignment:
- natural-language task: 将成功的浏览器探索编译为参数化可复跑链路
- reusable chain boundary: 一个已确认计划步骤；采集和表单任务共用
- runtime inputs: 版本化 Requirement、Plan、控制意图、脱敏历史及公开 action schema
- dynamic task outputs: 规范化证据、覆盖账本、混合区段及现有 TaskChain
- generic platform capability used: browser-use history/registry、workflow-use converter/executor、Pydantic、Zod、LangGraph
- replay model calls: 普通能力不接收模型；仅显式 llm 节点
- site/task-specific code added: no

Reuse Assessment:
- capability: 历史规范化、完整动作覆盖、混合编译合同
- existing implementation in repository: w-u DeterministicWorkflowConverter、SemanticWorkflowExecutor；B-A-T TaskChain/Zod/LangGraph
- mature candidates and pinned versions: workflow-use 0.2.11 @ 5d2d19f；browser-use 0.13.8，使用现有锁定依赖
- selected implementation: fork 内扩展编译证据适配；复用公开 registry.create_action_model().model_json_schema() 识别动作，Pydantic 校验
- reused public surface: AgentHistoryList.history、ActionModel.model_dump、ActionResult、Registry.create_action_model、既有 w-u 单步骤 executor
- B-A-T-owned adapter and remaining gap: 唯一新增领域能力为 Requirement/Plan 到可复跑 TaskChain 的证据映射；不新增 driver、Agent loop、scheduler 或数据库
- license/runtime/platform fit: 保持原始 AGPL 及来源摘要；macOS/Python 3.12 现有环境；Windows 与产品真实验收仍需单列证据
- browser/runtime/state ownership conflicts: 本阶段离线；未来运行继续单 Browser、LangGraph 调度与现有产品持久化
- replay model calls: 规范化、coverage、binding、物化均零模型
- rejected candidates and evidence: 原始 deterministic converter 静默丢弃未知动作，LLM conversion 重写整图；保留实现作离线对照，不作为新编译事实源
- focused validation: 真实公开 registry、两份脱敏 history、缺结果/缺观察/未知动作/重复覆盖/副作用排除反例，之后逐层增加所需测试

Failure Analysis:
- expected invariant: 每个历史 action 唯一保留，证据不足阻止 candidate，不能阻止继续实现缺失模块
- observed evidence: H2 已修复两个 executor 缺陷；H3–H6 代码仍缺失，旧 history 缺逐动作后置事实
- responsible layer: w-u fork 编译扩展
- root cause or falsifiable hypothesis: 原始 converter 的 None 返回/便捷 zip 不是完整 evidence ledger
- affected public contract: NormalizedTrace、CompilationRequest、ActionCoverage
- keep / rewrite / remove existing change: 保留 H0/H1 与 executor 修复；扩展 fork；原 v1 路径保持退休直到 H6 原子切换
- smallest validation: 仅执行新增 fork 所属 tests，不运行根级/全量测试
- reuse decision impact: 实现独有证据适配，不复制成熟组件能力

## H5 物化反例与处置

最小 LangGraph 验证发现 `binding_node_not_dominating:completed:s-a-0001`：循环可能执行零次，终点不能无条件读取 body 输出。责任在新 materializer；保留现有 runtime 的支配检查，修正 null 输出与完成谓词绑定，集合输出必须经已初始化 accumulator。只重跑受影响物化测试，不放宽 runtime 校验。

## H4 执行后置核验复用补充

Failure Analysis:
- expected invariant: 动作返回成功不足以证明页面达到合同；全部声明后置条件必须通过，失败不能重放副作用
- observed evidence: 上游 StepVerifier URL 使用旧 Page.url 和子串匹配；verify_step 混合结果允许 70% 通过；input 检查缺元素时假定成功
- responsible layer: w-u StepVerifier 的旧浏览器 API 与宽松语义
- keep / rewrite / remove existing change: 保留既有单动作 Tools.act；在 fork 的 StepVerifier 增加显式声明检查入口，复用其执行/结果聚合，hybrid 路径要求全通过
- smallest validation: 错误 URL 前缀、未知后置条件、成功动作但未达到效果、动作执行后错误不得自动重试
- reuse decision impact: 继续复用 StepVerifier，不新增等待、重试、验证 Agent 或执行循环；已知公开 Page.get_url/get_title、Element.evaluate 固定读取表达式用于 API 适配

Reuse Assessment:
- capability: 无模型后置条件核验
- selected implementation: 原始 w-u StepVerifier.verify_step，增加 hybrid 声明检查分支；当前不采用其宽松 input/DOM-change 推断
- B-A-T-owned adapter and remaining gap: 将已证明 fact 合同映射为 VerificationCheck；只接纳可确定读取的 URL、标题、唯一目标文本/值
- replay model calls: StepVerifier(llm=None)，仅固定读取，未知检查在动作前拒绝
- focused validation: 所属 fork verifier/capability 测试及真实本地页面样本

## H6 接入与恢复验证边界

Failure Analysis:
- expected invariant: 正式调用闭包只拥有一个 Browser；取消须终止同一个 Python/Browser；恢复保持同一 RunBinding 并核验现场
- observed evidence: 旧 RunnerProcess.close 只发 SIGTERM，不等待退出；新临时 Profile 的 session/tab 与旧 checkpoint 不同，不能直接当作旧会话继续
- responsible layer: B-A-T 独立进程适配与恢复核验
- keep / rewrite / remove existing change: 复用原 fd3 transport/pending requests，增加有界关闭等待和 abort listener 清理；复用既有 runtime resumeState/withBrowserCommandAccounting，不修改调度与 checkpoint 结构
- smallest validation: 新协议严格拒绝旧命令/模型字段；正式 host routing/mixed gates；真实新环境换输入与取消；只读来源页恢复对比与页面改变拒绝
- reuse decision impact: 来源恢复只调用已验证 Tools.navigate 和现有观察读取；调用闭包含表单/点击等状态动作或存在未决副作用/人工条件时保持不可自动恢复

原 runner/setup/tests 字节先保存在 ignored `work/workflow-use-hybrid-h6-before`，摘要见 H6 preserved-source.json；setup 与 runner tests 已替换为 v2，旧主 runner 尚保留等待 authoring 原子切换。新环境使用原始 uv.lock，未修改依赖版本或旧环境。首次真实协议测试的失败为测试读取终态已清除的 checkpoint；实际运行 completed，已改核验能力返回状态并通过换输入复跑。后续检查仍按修改范围执行。

## H3 公开 action schema 的严格适配

Failure Analysis:
- expected invariant: 跨包动作参数不能被静默丢字段或改变类型
- observed evidence: 真实 Tools ActionModel 将 navigate.unexpected 丢弃，并把 new_tab=0 转为 false；旧 registry adapter 仅调用 model_validate，接受了两种输入
- responsible layer: fork 新 registry 适配器没有实施编译合同要求的严格边界
- keep / rewrite / remove existing change: 保留公开注册表与 action 执行；先复用现有 jsonschema 校验公开 schema，再比对模型序列化内容，拒绝隐式丢字段/转换；不修改 b-u
- smallest validation: 扩展所属 evidence 测试中的参数拒绝案例，然后验证受影响 compiler/普通能力测试
- reuse decision impact: 补齐边界适配；继续用原始公开 schema，未手写注册名单或另一套 schema validator

## H4 多字段输入与动态后置条件

Failure Analysis:
- expected invariant: 同类 input 动作可以分别绑定不同输入字段；复跑后的输入值核验必须跟随本次参数
- observed evidence: 新 ValueAuthority 仅按 actionName/argumentPath 匹配，会把两个字段判为歧义；completion 只支持 equals 常量，不能表达输入值跟随 text 参数
- responsible layer: fork 的条款绑定与已声明 fact 映射
- keep / rewrite / remove existing change: 在条款表达式增加可选 actionRefs，仍由现有 coverage/action ID 限定；复用 Postcondition.bindingArgument 和公开 Element 固定读取，不增加脚本/模型/控制循环
- smallest validation: 两个同类动作映射不同字段、动态目标值不含样本常量、未支持的目标/后置组合必须在编译期拒绝
- reuse decision impact: 只补独有绑定与证据适配，普通执行仍由 Tools.act 和 StepVerifier 承担

### H6 正式 authoring 来源与调用链

Product Alignment:
- natural-language task: 依据已经确认的需求条款探索一个步骤并编译为可复跑候选
- reusable chain boundary: 一个计划步骤的一次代表探索
- runtime inputs: 已确认条款声明的输入绑定与步骤输入合同
- dynamic task outputs: 步骤输出 Schema
- generic platform capability used: browser-use Agent.run/callbacks、workflow-use hybrid compiler、现有产物仓库
- replay model calls: 仅显式 llm；首次探索单独审计
- site/task-specific code added: no

Reuse Assessment:
- capability: 成功探索到候选产物的正式接线
- existing implementation in repository: 已停用 authoring、AIConnectModel/openModelBridge、TaskContractRepository
- mature candidates and pinned versions: 已核验 browser-use 0.13.8 Agent.run、workflow-use 0.2.11 fork
- selected implementation: 同一受管 fork；恢复原生 Agent.run 的直接调用
- reused public surface: Agent callbacks、Tools action model、Pydantic schema、原有 AI Connect bridge
- B-A-T-owned adapter and remaining gap: 从确认 Markdown 的唯一 bat-compilation/v1 结构块读取条款；绑定完整需求版本；原有命令进入 v2。没有结构条款的需求仍拒绝，不能由模型追认用户控制意图
- license/runtime/platform fit: 沿用 H2；Windows 实机未验证
- browser/runtime/state ownership conflicts: 同一次 authoring 一个 Browser；所有步骤结束且进程清理确认后才写 candidate
- replay model calls: 普通执行协议不含模型；探索桥限制 agent/judge/extract
- rejected candidates and evidence: 旧 HealingService 整图生成及自定义验证修复循环仍停用
- focused validation: 原生回调与严格来源边界测试、正式 authoring 持久化测试、取消和清理

Failure Analysis:
- expected invariant: 正式入口只能消费已确认控制意图，且来源闭合后写候选
- observed evidence: authoring 仍指向 v1，现有 Requirement 仅保存 Markdown；v2 artifact helper 尚无消费者
- responsible layer: B-A-T authoring/protocol 适配层
- root cause or falsifiable hypothesis: 缺少确认内容到 fork request 的适配及原生 Agent 接线
- affected public contract: 不新增平台图类型；复用已有 Requirement Markdown，明确结构块格式作为 v2 准入
- keep / rewrite / remove existing change: 保留 v1 退休门与历史原文；重写活动 authoring；复用 AI Connect 和仓库
- smallest validation: v1 零副作用继续通过；v2 完整来源、产物与模型审计可被正式入口消费
- reuse decision impact: 不增加 Agent loop、scheduler、模型编图或平台专用节点

### H6 原生来源回归定位
Failure Analysis:
- expected invariant: null 是合法的类型化任务输出，不能在 history 导入时当成字段缺失；版本引用使用仓库存储后的规范对象
- observed evidence: 原生回调接线测试返回 normalization gap；HTTP 正向 fixture 在启动来源前返回 version_digest_mismatch
- responsible layer: history 字段投影、HTTP 测试 fixture 版本引用
- root cause or falsifiable hypothesis: exclude_none=True 删除了嵌套 done.data.value=null；测试直接引用保存前的 plan
- affected public contract: 原生 action JSON 必须保留显式 null；不改变业务合同
- keep / rewrite / remove existing change: 保留严格 registry 和版本门，修正有损投影及 fixture 引用
- smallest validation: 原生 Agent 接线 seam 与正式 HTTP 正向用例
- reuse decision impact: 继续使用公开 Pydantic model_dump，不增加自定义转换

### H4 辅助动作归属
Failure Analysis:
- expected invariant: 已证明效果后的无变化等待归入最近动作；未知变化和失败副作用不被排除
- observed evidence: 当前 wait 被独立分类，要求不存在的完成效果，不能表达文档规定的 supporting ledger
- responsible layer: w-u fork 因果区段分类
- root cause or falsifiable hypothesis: 缺少基于前后观察和已证明后置条件的辅助动作归属
- affected public contract: 既有 supporting disposition，无新运行节点或隐式重试
- keep / rewrite / remove existing change: 保留逐动作证据和 coverage；只吸收已证实同页同 tab、文档不变的冗余 wait
- smallest validation: 等待归属、发生导航的 wait 拒绝、无前置已证明区段拒绝
- reuse decision impact: 不增加轮询或重试执行器；真正等待效果的轨迹仍需公开能力证明

### H6 原生 Agent 的会话所有权
Failure Analysis:
- expected invariant: 多步骤代表探索共用同一 Browser，全部来源与截图临时文件随拥有者退出
- observed evidence: browser-use Agent.close 在 keep_alive=false 时 kill Browser；截图写入 tempfile.gettempdir()/browser_use_agent_*，独立于 file_system_path
- responsible layer: 原生 Agent 生命周期配置与 B-A-T 进程拥有者
- root cause or falsifiable hypothesis: v2 普通执行的 keep_alive=false 不能直接用于多步骤 Agent；只提供 file_system_path 不能覆盖截图临时目录
- affected public contract: 不改上游生命周期实现，使用公开 BrowserProfile.keep_alive 和进程临时目录环境
- keep / rewrite / remove existing change: 保留原生 Agent.close；探索期间 keep_alive=true，由 Runner 最终 kill；进程正常退出后清理本次创建的临时目录
- smallest validation: 本地真实 Agent.run 连续两个步骤、真实取消/关闭；无历史目录删除
- reuse decision impact: 沿用成熟 Agent/Browser，补足拥有者配置而非另写清理循环

### H6 原生真实接线退出诊断
Failure Analysis:
- expected invariant: close 应先等待 Python 完成正常退出；清理失败不能覆盖最初错误
- observed evidence: 普通真实复跑/恢复/取消通过，原生 Agent 真实接线返回 upstream_cleanup_unconfirmed；close 在收到关闭回复后立即发送 SIGTERM
- responsible layer: B-A-T RunnerProcess 关闭时序与诊断投影
- root cause or falsifiable hypothesis: 关闭确认后的即时 SIGTERM 可能打断 asyncio/Agent 收尾，且 finally 错误遮蔽来源错误
- affected public contract: v2 失败可返回严格枚举式诊断码，不返回原始页面/异常文本
- keep / rewrite / remove existing change: 保留清理未确认门；先自然退出，再有界 TERM/KILL；保留主错误与清理错误
- smallest validation: 原生双步骤真实 Chrome 用例
- reuse decision impact: 只修进程拥有者时序，不更改 Agent 生命周期实现

### H4 条款完整性
Failure Analysis:
- expected invariant: 未实现的需求条款不能被静默忽略；语义注解不能借多个 clauseRefs 伪装覆盖
- observed evidence: 当前按动作分类只查询使用到的条款，未检查剩余条款；semantic segment 直接保留整个 annotation.clauseRefs
- responsible layer: fork requirement alignment
- root cause or falsifiable hypothesis: 缺少独立条款覆盖闭包
- affected public contract: 现有 gap，不扩张 IR 或模型权限
- keep / rewrite / remove existing change: 保留已证明分类；仅记录实际命中的语义条款，未消费条款产生 gap
- smallest validation: 添加不受支持条款/注解引用不能产生 candidate；现有来源明确样本仍通过
- reuse decision impact: B-A-T 特有需求证明职责；不替代外部通用能力

### H5 输出装配
Product Alignment:
- natural-language task: 把多次读取或语义处理的结果按需求输出合同组合
- reusable chain boundary: 一个计划步骤的最终输出
- runtime inputs: 来源绑定，不引用历史样本值
- dynamic task outputs: 需求声明的字段及嵌套路径
- generic platform capability used: 现有 data.transform merge/assemble 与 TaskChain compiler
- replay model calls: 装配为 0；此前显式 llm 独立审计
- site/task-specific code added: no
Reuse Assessment:
- capability: 多来源 JSON 输出装配
- existing implementation in repository: packages/runtime/src/task-chain/data.ts merge 与 assemble.ts
- mature candidates and pinned versions: 当前已使用的 TaskChain 内建数据能力；图执行仍为 LangGraph
- selected implementation: 直接复用现有公开 capability
- reused public surface: data.transform@1 operation merge/transform mode assemble
- B-A-T-owned adapter and remaining gap: 读取已确认 output clause，生成固定两步数据映射；字段及路径只存在于任务数据
- license/runtime/platform fit: 无新依赖
- browser/runtime/state ownership conflicts: 无浏览器、无新状态库
- replay model calls: 0
- rejected candidates and evidence: 无须新建数据装配引擎，已有实现支持嵌套与重叠路径拒绝
- focused validation: 读结果与显式 LLM 输出组合、换输入、运行审计；未知/前向来源拒绝
Failure Analysis:
- expected invariant: 最终输出可组合多个已证明结果，不能只固定取最后节点
- observed evidence: materializer 当前仅取 last segment 或单一 loop accumulator
- responsible layer: fork 输出来源校验与 B-A-T IR 值绑定适配
- root cause or falsifiable hypothesis: 缺少已确认 assemble output clause 的消费
- affected public contract: 不改 TaskChainRuntime 或平台节点类型
- keep / rewrite / remove existing change: 保留现有 last-output 默认映射；显式 assembly 条款覆盖输出绑定
- smallest validation: 两来源输出的跨语言实际 StateGraph 测试
- reuse decision impact: 直接复用当前内建成熟能力

### H4 观察变化解释
Failure Analysis:
- expected invariant: 读取、done 或 wait 不能悄悄解释 URL/tab 变化；点击导航必须有 URL 效果条款
- observed evidence: classify_action 对 done 提前返回，compile_read 未比较前后 URL/tab；语义 fixture 从导航 fixture 改 action 后留有不同 URL
- responsible layer: fork action/effect 证明与合成 fixture
- root cause or falsifiable hypothesis: 缺少动作类型与观察变化的交叉检查
- affected public contract: 不支持的跨 tab 继续 gap，不增加隐式切页策略
- keep / rewrite / remove existing change: 保留全量动作账本；修正合成只读轨迹，拒绝未解释的 URL/tab 变化
- smallest validation: 只读变 URL、done 变 tab 拒绝；真实原生来源与混合输出保持可用
- reuse decision impact: 证据规则属于编译职责，执行仍使用公开 Tools

### H4/H5 已验证子链调用
Product Alignment:
- natural-language task: 在一个任务步骤中复用已验证的通用步骤
- reusable chain boundary: 已固定 id/version/digest 的子链
- runtime inputs: InvokeIntent 明确的输入绑定
- dynamic task outputs: 被调用链的既有输出合同
- generic platform capability used: 既有 invoke 节点、TaskContractRepository、LangGraph 调用生命周期
- replay model calls: 继承子链预算；不增加模型调用策略
- site/task-specific code added: no
Reuse Assessment:
- capability: 已验证子链复用
- existing implementation in repository: stable invoke、TaskRuntimeHost 子链闭包与 TaskChainRuntime 调用
- mature candidates and pinned versions: 当前 LangGraph StateGraph 及已用 TaskChain invoke
- selected implementation: 完全复用现有 invoke；fork 只证明历史区段与子链能力/绑定等价
- reused public surface: chain 版本引用、input binding、iteration once、输出合同和预算
- B-A-T-owned adapter and remaining gap: 仓库验证状态及证据投影；首个准入面为线性普通能力子链，其他形态明确 gap
- license/runtime/platform fit: 无新库
- browser/runtime/state ownership conflicts: 子链继承产品单一 Browser；不拥有独立进程或 scheduler
- replay model calls: 首个准入面无模型；未证明的语义/递归/each 子链不自动放行
- rejected candidates and evidence: 不根据 chainId/version 猜等价；必须逐能力核对输入映射、目标、效果和后置条件
- focused validation: 固定版本调用、调用输入替换、范围/能力不匹配拒绝、原有 LangGraph 实际 invoke
Failure Analysis:
- expected invariant: 来源明确的等价区段可映射到已有 verified 子链，缺证明保持 gap
- observed evidence: compiler 对所有 invoke 都返回 control_body_requires_verified_mapping
- responsible layer: fork 区段等价证明与宿主已验证版本投影
- root cause or falsifiable hypothesis: 缺少仓库验证上下文与受限等价映射
- affected public contract: 不改变 CompilationRequest 两类注解；依赖以既有固定版本引用进入 canonical operation
- keep / rewrite / remove existing change: 保留缺依赖 gap，增加严格匹配的 once 线性能力准入
- smallest validation: 真实 fork 编译与现有 invoke 生命周期 focused test
- reuse decision impact: 不写调用循环或子链执行器

Invoke fixture 校正：公共 requestFor 默认复用同一个 runId，导致既有 distinct_input_validation_required 正确拒绝。测试改为分别创建 runId/invocationId，保留生产验证门；不改 runtime。

### H6 有界语义注解与失败来源保留
Failure Analysis:
- expected invariant: 首次成功探索可提出有界语义注解，不能生成控制流；编译 gap 必须保留可复用来源
- observed evidence: 新来源的 result digest 无法在探索前写入 acceptedAnnotations；候选 gate 拒绝 gap 时完整 normalized trace 尚未落库
- responsible layer: fork 有界语义注解与宿主来源产物适配
- root cause or falsifiable hypothesis: 缺少成功 history 后的 annotation proposal 和独立 source artifact
- affected public contract: 新增 semantic_annotation 模型审计用途；无新节点、无浏览器控制权限；source 与 candidate 状态分开
- keep / rewrite / remove existing change: 保留严格候选 gate；模型只返回既有 SemanticOperationAnnotation，来源关闭后先保存 source，再决定 candidate
- smallest validation: 多余控制字段、未知 evidence 引用拒绝；gap 不产生候选且来源仍可读取
- reuse decision impact: 使用现有 AI Connect/Pydantic 结构化调用，不加入 Agent loop 或完整图生成

### H5 invoke 深度契约修正
Failure Analysis:
- expected invariant: 可复用叶子链必须在计划允许的调用深度内作为子链运行
- observed evidence: 正式 runtime-host 按绝对 depth 比较每条 chain.budget.maxDepth；materializer 给无 invoke 的叶子固定 maxDepth=1，子层 depth=1 被拒绝
- responsible layer: materializer 预算映射，不是 LangGraph 或子链调度
- root cause or falsifiable hypothesis: 把计划的绝对深度上限错误地映射为当前子树高度
- affected public contract: 使用既有 Plan/Step maxDepth 的更小值，不提高用户计划预算
- keep / rewrite / remove existing change: 保留运行器绝对深度门；重写 materializer 深度映射
- smallest validation: 既有 runtime-host 在单 Browser 内调用已验证子链
- reuse decision impact: 不修改 runtime 或增加调用引擎

### H4/H6 意图与历史动作对齐
Failure Analysis:
- expected invariant: 用户确认选择语义，不需要提前知道探索将产生的 a-000N；绑定不能用样本值猜所属字段
- observed evidence: AuthorAuthority 沿用 CompilationRequest 的必填 actionRefs，首次探索前无法提供未来物理动作编号
- responsible layer: authoring 意图输入到编译证据的适配
- root cause or falsifiable hypothesis: 把已知历史的编译引用错误要求在首次探索前给出
- affected public contract: 编译后的 SelectionIntent 仍严格要求 actionRefs；authoring 可省略动作引用，按已确认目标与原生 selector_map 的实际唯一匹配补齐证据引用
- keep / rewrite / remove existing change: 保留用户确认目标、策略与控制语义；只派生动作归属；输入/完成条款可引用 selectionRef 以避免提前编号
- smallest validation: 两个不同表单字段按已确认目标归属，真实动作 index 不变；缺匹配或多解释继续 gap
- reuse decision impact: 仍复用公开 DOM/Element 解析；不由模型生成控制意图或节点图

### H6 规范化失败交接修正

Failure Analysis:
- expected invariant: 已成功且判定通过的探索即使不能编译，也保留脱敏 trace、全部 gap 和审计；失败不能伪装成功。
- observed evidence: 真实表单返回 normalizationGaps，宿主成功结果 schema 拒绝该分支，具体原因被协议错误遮住。
- responsible layer: 新 author adapter 的结果交接。
- root cause or falsifiable hypothesis: 规范化 gap 走了不完整的提前 return，绕过标准编译响应与 source artifact。
- affected public contract: fork 私有 author/compiler 交接；现有 TaskChain/runtime 不变。
- keep / rewrite / remove existing change: 移除不完整 return，将规范化问题作为编译前置 gap，保留标准 source 响应；有 gap 时不调用语义注解模型、不生成可执行图。
- smallest validation: 注入规范化 gap 验证来源保留与不可物化，再定位真实表单对应动作。
- reuse decision impact: 无；继续使用原生 history、既有 compiler 响应和 artifact 存储。

### H4 观察标题来源核验

Failure Analysis:
- expected invariant: 动作前后声明的标题事实来自当时页面，不能把迟到的缓存当作后置条件失败或下一动作效果。
- observed evidence: 本地表单 o-0007/o-0008 为 Form，done 的 o-0010 才为 Saved；输入值已分别核验。0.13.8 DOMWatchdog 使用 BrowserSession.get_current_page_title，而该方法只读取 session_manager 的缓存 target.title。
- responsible layer: fork EvidenceCollector 对上游快照字段的适配。
- root cause or falsifiable hypothesis: targetInfoChanged 缓存晚于实际 DOM 标题变更；公开 Page.get_title 使用 Target.getTargetInfo 即时查询。
- affected public contract: ObservationFact 来源保持不变，不改普通动作或调度合同。
- keep / rewrite / remove existing change: 保留原始模型 selector_map 和 DOM 摘要；标题改为同一实际 tab 的公开 Page.get_title 读取，前后均核验 tab 身份，不加入等待或副作用重试。
- smallest validation: 快照缓存旧标题但公开 Page 返回新标题；真实表单 source、sample、different-input。
- reuse decision impact: 重新核验后继续复用 browser-use 的公开 Page API；缓存 summary 不适合作为即时标题事实源，Browser/Agent/Tools/StepVerifier 和 LangGraph 仍复用。

### H4 筛选、排序和分页的声明字段效果

Product Alignment:
- natural-language task: 打开筛选面板、改变选项/排序，或翻页后确认声明的页面状态
- reusable chain boundary: 一次普通操作及其有界字段后置条件
- runtime inputs: 原有输入绑定和已确认完成条款
- dynamic task outputs: ReadSpec 读取的有类型字段，仅用于效果证据
- generic platform capability used: 既有 browser-use Page/Element、ReadSpec/BeautifulSoup、StepVerifier
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 普通动作完成后的结构化页面事实校验
- existing implementation in repository: fork ReadSpec/read_fields 已有 selector、attribute、数量/字节/Schema 上限；StepVerifier 已有 declared-check 入口
- mature candidates and pinned versions: 当前锁定 b-u 0.13.8、w-u 0.2.11、BeautifulSoup
- selected implementation: 组合已有 read_fields 与 StepVerifier，不增加通用查询/等待/调度器
- reused public surface: Page.get_elements_by_css_selector、Element.evaluate 的固定 outerHTML 读取
- B-A-T-owned adapter and remaining gap: 已确认完成条款到有界字段快照/相等条件；未知与不匹配保持 gap
- license/runtime/platform fit: 沿用当前锁定环境和许可证，Windows 实机仍未验证
- browser/runtime/state ownership conflicts: 使用原单一 Browser；只读证明不创建会话或持久状态库
- replay model calls: 0
- rejected candidates and evidence: 仅用 URL/title 无法证明同 URL 的面板、排序状态；旧 verifier 的宽松推断不能证明指定效果
- focused validation: 多字段相同 kind 的证明按 specificationDigest 区分；缺前置/后置、错误目标、未声明字段与超界读取拒绝

### H4 循环体按已确认条款对齐

Failure Analysis:
- expected invariant: 首次探索前确认循环体不需要预知未来的 a-000N；历史只证明各次循环发生了什么，不决定循环意图。
- observed evidence: 旧新接口的 bodyRef 只能指向 iterations 中的物理动作编号，无法用于正常首次编译。
- responsible layer: fork 控制证据对齐，宿主仅物化既有 loop。
- root cause or falsifiable hypothesis: 意图侧循环体和证据侧 action 分组被写在了同一个字段形态里。
- affected public contract: bodyRef 的 Requirement 表达式新增 bodyClauses；保留明确历史 iterations 的兼容读取。
- keep / rewrite / remove existing change: 循环次数、停止条件、累加仍来自确认合同；只用已证明 segment 的条款消费者匹配连续、唯一、等价的循环体；宿主读取编译图中的 body/返回边。
- smallest validation: 条款型与历史型循环生成同一 body/运行次数；未知、重复、交错或歧义条款拒绝。
- reuse decision impact: 图推进、游标和累加仍由既有 LangGraph runtime 执行；新增代码只处理 B-A-T 来源/证据关系。

### H6 纯输入分支的正式来源证据

Failure Analysis:
- expected invariant: 编译支持的纯输入分支可以经正式 authoring 产生来源证据；不得另写 Python 谓词执行器，也不得提前要求物理 action ID。
- observed evidence: 离线 fixture 有 branch_choice，原生 capture 没有该输入端；正式来源会始终因分支未证明而失败。
- responsible layer: host 的既有值谓词适配与 fork 的证据归属。
- root cause or falsifiable hypothesis: 离线注入的分支事实尚未接入原生来源。
- affected public contract: v2 私有 author source 增加有界 branchChoices；Control outcomes 允许 clause:<已确认条款 ID> 作为唯一已证明入口。
- keep / rewrite / remove existing change: 用现有 runtime.evaluatePredicate 求纯 input/constant 条件，fork 只记录第一动作前证据并匹配条款；writer 按真实 sample input 重新核验。未访问浏览器分支继续 gap。
- smallest validation: 实际输入与分支事实一致；改输入、伪造分支证据或引用 variable/node 均拒绝；既有 LangGraph true/false 复跑。
- reuse decision impact: 复用既有谓词与分支节点；无新执行循环或状态引擎。

### H6 旧接线最终退役与通用输入

Failure Analysis:
- expected invariant: v2 正式路径只消费受管 fork；旧 delegate replay/writer/compiler 不保留可调用实现；原历史仍可解码导出。
- observed evidence: gate 后仍有 runtime-host.workflowLlm 和旧 writer/compiler 函数体；v2 authoring 仍调用旧 workflowInputs，强制所有输入为 primitive，拒绝既有 TaskChain 支持的嵌套对象。
- responsible layer: 旧 provider 到新 adapter 的原子切换余项。
- root cause or falsifiable hypothesis: H1 保留的诊断实现和旧上游变量表约束尚未完成 H6 处置。
- affected public contract: 保留 v1 类型、decoder/export 和显式退休错误；新任务仍使用既有 ValueSchema。
- keep / rewrite / remove existing change: 先按字节归档当前涉及文件；移除不可达的旧 replay 与生成函数体，保留退休壳；新 Agent task 直接描述既有 typed inputSchema，不再经过旧变量名表。
- smallest validation: 旧入口零副作用，v1 查看导出；正式 authoring 与嵌套输入；API 类型检查和旧引用 allowlist。
- reuse decision impact: 复用现有 schema/绑定/存储，无新执行器或输入转换引擎。

### H6 恢复请求的取消边界

Failure Analysis:
- expected invariant: 恢复核验必须尊重本次恢复的 AbortSignal，已取消时不得再导航。
- observed evidence: verifyResume 接口接收恢复 signal，但新 adapter 仅使用会话所有者 signal；二者可以不同。
- responsible layer: v2 私有进程适配的取消交接。
- root cause or falsifiable hypothesis: 普通 capability 已连接单次取消，恢复分支漏接。
- affected public contract: 无；落实既有 verifyResume(checkpoint, signal) 合同。
- keep / rewrite / remove existing change: 抽取同一个单次取消包装，普通动作和恢复复用；取消先于观察/计数/导航，运行中取消交给同一 owner 关闭。
- smallest validation: 已取消恢复零动作；已有同页只读恢复、页面改变拒绝与执行取消。
- reuse decision impact: 无新增生命周期框架，沿用 AbortSignal 和 RunnerProcess。

### H4 有界异步完成等待

Reuse Assessment:
- capability: 普通动作后等待已声明事实，不重放动作
- existing implementation in repository: StepVerifier/check_fact 与 frozen uv.lock 内 tenacity 9.1.2
- mature candidates and pinned versions: Tenacity 9.1.2；已核验实际 AsyncRetrying.__call__ 和 stop_before_delay 实现及官方文档 https://tenacity.readthedocs.io/en/latest/
- selected implementation: Tenacity AsyncRetrying + asyncio.timeout，只有 PostconditionNotMet 可重查
- reused public surface: AsyncRetrying、stop_after_attempt、stop_before_delay、wait_fixed、retry_if_exception_type
- B-A-T-owned adapter and remaining gap: 明确 settle 预算映射与 source wait 因果证据；每条事实必须使用同一预算，缺时钟或越界仍 gap
- license/runtime/platform fit: Apache-2.0，当前锁定 Python 环境已安装；异步取消由 Python/Runner 原生命周期处理
- browser/runtime/state ownership conflicts: 一个 Browser；Tenacity 仅拥有只读完成条件检查，不执行动作、图推进或持久化
- replay model calls: 0
- rejected candidates and evidence: StepVerifier 本身只检查一次；自建重试循环无必要；对 click/input 使用重试会重复副作用，排除
- focused validation: 延迟条件成功/次数与时间上限/取消；真实异步表单；缺明确预算和因果证据的 wait 不可吸收

Failure Analysis:
- expected invariant: 延迟出现的页面效果可以在声明预算内证明；不能把等待之后的效果直接冒充点击瞬时完成。
- observed evidence: 当前只支持等待前效果已成立的冗余 wait；正常异步状态仍会缺效果 proof。
- responsible layer: fork 普通能力检查与因果证据构造。
- root cause or falsifiable hypothesis: 尚未声明完成等待策略，也没有对应来源时钟/纯 wait 链证明。
- affected public contract: fork completion 条款新增有界 settle；普通 TaskChain 能力/调度器不扩张。
- keep / rewrite / remove existing change: 保留现有即时检查；新增显式策略时使用成熟只读重查，并保持全部历史动作唯一归属。
- smallest validation: 有声明/无声明、越时、插入副作用、跨 tab 和错误完成事实分别验证。
- reuse decision impact: 继续复用 b-u Tools、w-u StepVerifier、Tenacity 与 LangGraph；不新增执行器循环。

### H6 部分来源与失败后的证据保存

Product Alignment:
- natural-language task: 多步骤浏览器任务在后续失败时保留已探索来源
- reusable chain boundary: 每个计划步骤的规范化来源和固定编译输入
- runtime inputs: 既有 TaskPlan/步骤输入
- dynamic task outputs: 已完成来源及其关闭事实；全体校验后才有候选
- generic platform capability used: 既有 artifact repository 与 Browser owner finally
- replay model calls: 不变
- site/task-specific code added: no

Failure Analysis:
- expected invariant: 第 2 步失败、计划最终输出不匹配或取消后，第 1 步已经得到的脱敏来源仍可审计；清理失败不能标为 closed。
- observed evidence: taskWithModel 只在 withAuthoring 和 progression.finish 全部正常返回之后写来源；抛错会丢失前面已取得的来源。
- responsible layer: B-A-T 自有来源持久化适配。
- root cause or falsifiable hypothesis: 来源留存与候选准入共用了成功返回条件。
- affected public contract: 私有 source artifact 的 closed 放宽为 boolean；candidate 继续要求 true。
- keep / rewrite / remove existing change: 保留单 Browser 和候选全体校验；回调捕获执行错误，待 owner 退出后保存已取得来源；清理异常保留 closed=false，再传播原错误。
- smallest validation: 后续步骤失败保留前一步来源且零 candidate；关闭失败保留 closed=false 且零 candidate。
- reuse decision impact: 复用既有 repository/finally，无新增数据库、执行循环或恢复框架。

### H6 语义注解失败保留探索来源

Failure Analysis:
- expected invariant: 可选的有界语义注解调用失败不丢掉已成功、已判定的浏览器来源，也不回退成普通节点或重新探索。
- observed evidence: propose_semantics 异常直接离开 author_step，宿主无法保存已有 trace。
- responsible layer: fork 的 B-A-T 注解适配；原生 Agent 不变。
- root cause or falsifiable hypothesis: 注解后处理异常和探索失败共用异常出口。
- affected public contract: 无；返回既有 compilation gap 和原 trace。
- keep / rewrite / remove existing change: 捕获普通注解异常并产生稳定无敏感文本的 gap；取消继续向上传播；模型审计由既有桥记录。
- smallest validation: 注解异常仍得到原 trace、完整 coverage、空可执行图和明确 gap；异常原文不写 artifact。
- reuse decision impact: 一次注解调用不重试、不增加控制意图生成器。

### H4 原生 extract 返回值适配

Product Alignment:
- natural-language task: 读取页面的明确字段，首次探索后通过普通字段读取复跑
- reusable chain boundary: 有界字段查询与结果 schema
- runtime inputs: 页面 URL 和已确认字段合同
- dynamic task outputs: 按真实页面读取的对象或集合
- generic platform capability used: b-u Tools.extract / Page/Element 与 JSON Schema
- replay model calls: 0；首次 extract 模型调用独立审计
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生提取结果到字段证据适配
- existing implementation in repository: capture.read_proofs 只接受裸 JSON，read_fields 固定数组
- mature candidates and pinned versions: browser-use 0.13.8 Tools.extract；原 archive service.py:1199–1228、1268–1293 及 ExtractionResult
- selected implementation: 读取上游 structured_extraction/extraction_result；自由文本仅接受原生精确 URL/query/result 封装内的 JSON
- reused public surface: ActionResult.metadata、ExtractionResult 公共模型、Page/Element、BeautifulSoup、Draft202012Validator
- B-A-T-owned adapter and remaining gap: 核对 source_url/is_partial 和实际字段读取相等，模型文字不能单独证明来源；单对象 schema 要求恰好一个容器
- license/runtime/platform fit: 既有固定版本/许可证；不新增依赖
- browser/runtime/state ownership conflicts: 原生 Agent 所有首次 extract，复跑只读字段，仍为一个 Browser
- replay model calls: 0
- rejected candidates and evidence: 直接 json.loads(extracted_content) 不符合上游实际封装；宽松搜索任意 JSON 会误读 query/页面内容
- focused validation: 原生封装、错误 URL/query、partial、不同字段结果、真实提取到不同输入复跑

### H4 明确字段集合的有界读取

Product Alignment:
- natural-language task: 读取记录的全部标签或表单的多个已选值，保持来源顺序
- reusable chain boundary: 一个容器中的标量字段和有界重复字段
- runtime inputs: 已确认读取字段与数量边界
- dynamic task outputs: 标量或有界数组
- generic platform capability used: BeautifulSoup/soupsieve 查询与 JSON Schema 验证
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 一条记录内重复字段的收集
- existing implementation in repository: read_fields 已使用公开 Page/Element 和 BeautifulSoup，但每字段强制单匹配
- mature candidates and pinned versions: 当前 frozen BeautifulSoup/soupsieve；不变的 browser-use 0.13.8
- selected implementation: 原 select 查询结果按 DOM 顺序映射，multiple/maxValues 显式声明
- reused public surface: BeautifulSoup.select、既有字段类型转换、Draft202012Validator
- B-A-T-owned adapter and remaining gap: 基数/数组输出合同；超界失败，禁止截断冒充全部字段；缺失单字段继续失败
- license/runtime/platform fit: 已有依赖不变
- browser/runtime/state ownership conflicts: 不新增浏览器或状态层
- replay model calls: 0
- rejected candidates and evidence: 对每个标签调用模型或复制一套通用提取器无必要；只取第一项违反全部字段要求
- focused validation: 0/多值顺序、数量越界、单字段歧义；真实结构化 extract 与不同输入普通复跑

Failure Analysis（字段集合兼容）:
- 真实多值提取通过，但既有 read/semantic fixture 暴露默认字段加入序列化后导致 specificationDigest 改变，旧字段证明不再匹配。
- 补救：multiple=false/maxValues=1 是原有单值语义；用 Pydantic 公共序列化钩子省略这两个默认值，保留旧规范化字节。显式多值策略进入新摘要；不修改旧证据来掩盖兼容问题。
- 验证：原 read/semantic/output 物化与新多值读取均需通过；无需重复实际浏览器，因为多值运行行为未改变。

### H4 未映射循环策略不得被静默忽略

Failure Analysis:
- expected invariant: 声明的稳定键与停止策略要么映射到现有 runtime，要么明确 gap；不能仅因为循环体匹配就通过。
- observed evidence: compile_loops 保存 stableItemKey，但 materializeLoops 只消费 accumulator.stableKeyPath；stopOutcomes 的不同组合会产生相同边。
- responsible layer: fork 控制意图准入。
- root cause or falsifiable hypothesis: 控制字段存在但尚未具备可执行映射。
- affected public contract: 无新字段；未支持组合从隐式忽略改为明确 unsupported_capability。
- keep / rewrite / remove existing change: 保留已实现的 accumulator 稳定键和完整停止集合；独立 stableItemKey 或缩减/重复停止集合拒绝，后续有真实映射再开放。
- smallest validation: 相同轨迹改变未映射策略必须产生 gap，不得得到同一可执行图。
- reuse decision impact: 保留 LangGraph 执行；不新增循环调度或失败策略引擎。

### H6 不重开浏览器的来源重编译入口

Reuse Assessment:
- capability: 已保存、来源完整的 request 在当前 fork 下确定性重编译
- existing implementation in repository: fork compilation_response 与 RunnerProcess fd3/取消/finally；现有离线 CLI 用默认 Tools，和原生 Agent 去除 screenshot 后的 registry 不同
- mature candidates and pinned versions: 原生 Tools 公开 registry（b-u 0.13.8）及已接入编译入口
- selected implementation: 沿既有私有协议增加无 Browser 的 compile 请求；重建同一输出模型/工具设置；摘要不一致拒绝
- reused public surface: Tools(output_model, exclude_actions)、compilation_response、既有 RunnerProcess
- B-A-T-owned adapter and remaining gap: 只传来源 request、输出 schema 与已验证子链；无模型端点、浏览器配置或执行参数；保存来源复用的产品筛选继续按完整性和固定版本处理
- license/runtime/platform fit: 固定依赖不变；与运行入口共用版本核查
- browser/runtime/state ownership conflicts: compile 请求不得存在活动 Browser；普通进程关闭沿用同一 finally
- replay model calls: 0；重编译本身 0
- rejected candidates and evidence: 重开 Agent 会重复探索；复制序列化 registry 并信任客户端 schema 会失去当前能力版本核验
- focused validation: 原生来源零 Browser/零模型重编译字节相同；错误 registry/输出 schema 拒绝

### H6 原生失败来源也进入审计

Failure Analysis:
- expected invariant: Agent 已返回失败或 judge 未通过的 history 仍保留脱敏来源；不得把它冒充成功，也不能为保留来源生成 candidate。
- observed evidence: author_step 在读取 is_successful/is_validated 后直接抛错，已有 history 无法到达 artifact。
- responsible layer: 原生结果到 B-A-T 来源的适配。
- root cause or falsifiable hypothesis: source artifact 错用 candidate 的 true/true 准入合同。
- affected public contract: 私有 author/source 结果允许真实 boolean；candidate 继续 literal true。
- keep / rewrite / remove existing change: 已返回 history 按实际完成/判定标志规范化；输出缺失或 schema 失败产生稳定 invalid_source gap；先保留来源再拒绝继续计划。Agent 本身抛异常且没有完整 callback 配对的情况仍为明确执行失败，不伪造观察。
- smallest validation: 失败/未判定来源保留 coverage，空可执行图且零后续步骤/候选；成功路径保持。
- reuse decision impact: 继续原生 Agent loop，无修复/重试循环。

### H4 上游输出绑定必须核对实际来源值

Failure Analysis:
- expected invariant: 普通动作的 prior_output 参数既要来自已完成的 typed output，也要与探索时实际执行值一致。
- observed evidence: decide_bindings 只检查 prior action 的 schema/path，没有核对历史参数是否等于已读字段；不同 URL/文本可能被错误参数化。
- responsible layer: fork B-A-T 参数来源证明。
- root cause or falsifiable hypothesis: 上游字段证明仅存查询/结果摘要，没有为后续绑定保留已批准的有界值。
- affected public contract: trace 增加 verified_field_output 事实，已有 BindingDecision 不变。
- keep / rewrite / remove existing change: 复用实际 read_fields 输出与 JSON Schema；后续普通动作只有路径存在且值摘要相等才承认 prior_output。旧来源缺该事实保留 gap，不猜测补值。
- smallest validation: 相同 schema 但不同值、缺事实、未知路径均拒绝；真实已读值相等通过。
- reuse decision impact: 仅 B-A-T 特有来源对齐；不新增提取器、表达式引擎或浏览器动作。

### H4 上游输出按需求条款命名

Failure Analysis:
- expected invariant: 首次探索前的输入绑定可引用已确认的输出条款，无需预知 a-000N。
- observed evidence: 普通 prior_output 仅接受未来物理动作 ID；循环/选择已支持条款对齐，但值绑定仍不能从正式初次需求准备。
- responsible layer: fork 来源绑定与宿主现有 ValueBinding 映射。
- root cause or falsifiable hypothesis: 来源名和历史动作编号被混用。
- affected public contract: 私有来源 nodeId 允许 clause:<输出条款 ID>；物化后仍为原有实际节点 ID。
- keep / rewrite / remove existing change: 只记录已完成、有字段值证明的条款别名；实际样本值仍须匹配；物化要求唯一输出消费者，不猜测同名输出。
- smallest validation: 物理与条款形式映射同一前置输出；缺证据、未来输出或同名歧义拒绝；复跑消费动态值。
- reuse decision impact: 沿用已有 ValueBinding/读路径/图校验，无新表达式或执行引擎。

### H4 声明字段刷新相对本次前态验证

Reuse Assessment:
- capability: 分页/筛选或表单预览操作后，验证声明字段实际刷新，不冻结样本页内容
- existing implementation in repository: w-u StepVerifier 支持 pre_state，但旧 check_page_state_changed 无前态时假定成功；新 bounded read/StepVerifier/Tenacity 已存在
- mature candidates and pinned versions: 当前 fork StepVerifier 与 Tenacity 9.1.2；既有 Page/Element 读取
- selected implementation: 只对显式 changed 完成条款，在本次动作前读取相同字段作为前态；仍由同一 StepVerifier 判定并由 Tenacity 有界重查
- reused public surface: StepVerifier.verify_step、VerificationCheck、read_fields/read_fact、AsyncRetrying
- B-A-T-owned adapter and remaining gap: 声明完成条件的本次前/后值绑定；不接受全页任意变化代替指定字段；只有 changed 不证明页码/业务筛选，任务仍需相应其他条款
- license/runtime/platform fit: 依赖不变
- browser/runtime/state ownership conflicts: 一个 Browser，一次动作；前态失败则不执行动作
- replay model calls: 0
- rejected candidates and evidence: 固定复制样本新页内容不能跨输入；上游无前态假定变化不满足证据要求
- focused validation: 两次复跑各自取前态、未变拒绝、缺前态零动作、有界等待仍只执行一次副作用

### H4 有界等待在动作已完成时的归属

Failure Analysis:
- expected invariant: 已声明 settle 预算中的纯 wait，只要仍在同一页面且全部完成事实成立，应能归属于原动作，无论完成发生在动作返回前还是之后。
- observed evidence: 真实异步表单中 click 后标题和 pressed 已正确变化，紧接 wait 前后保持；wait 仍成 gap。delayed_post 提前排除动作返回时已完成的情况，随后只剩要求全 DOM 提示摘要相同的旧路径。上游 llm_representation 含 is_new 星号等探索提示状态，不是页面稳定性的权威事实。
- responsible layer: fork 因果归属。
- root cause or falsifiable hypothesis: 有界事实规则与旧全 DOM 相等规则的交界遗漏；不修改浏览器动作或等待预算。
- affected public contract: 无；既有 settle 合同仍约束同页、时钟、次数与全部后置事实。
- keep / rewrite / remove existing change: 保留无 settle 时的严格 unchanged 门；有 settle 时统一用已声明事实归属连续纯等待，不再根据动作刚返回时是否完成而提前分流。
- smallest validation: 动作前即旧值、动作后已完成且 DOM 摘要变化、wait 后仍完成的有界来源可编；跨页/过期/其他副作用继续拒绝；重跑受影响真实表单。
- reuse decision impact: 只改证据归属；仍使用上游 Tools/StepVerifier/Tenacity，不加执行循环。
