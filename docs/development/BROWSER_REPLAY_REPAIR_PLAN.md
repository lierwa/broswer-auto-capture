# 浏览器动作还原与可靠复跑修复计划

> 开发入口：[浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。模块状态与验收要求以该方案及其模块文档为准。

最新状态（2026-09-17）：用户已明确授权现有Codex订阅及已确认任务/GitHub内容发送到chatgpt.com，发送权限阻塞已解除。最新正式run `30db3c05-a8e9-47b5-907f-9e19d5ba1e80` 自然失败：8次bat_read_fields均失败，未产生业务输出/候选/样本/换输入验证。现按真实参数复现定位，并修正只读查询失败被要求编译成功的归属问题。原合同、模型路由与历史证据保持，修复后继续正式主线。

更新时间：2026-09-17。状态：已获实施授权，未完成。本文是本轮唯一执行清单；压缩或换会话后先读本文，再读其引用的具体证据，不从历史阶段标题推断已完成。

已完成单项的代码核对、真实失败与补救、验证命令和未测范围集中记在 [执行证据](evidence/browser-use-dom-tools/REPLAY_REPAIR_EXECUTION.md)。

## 用户决定与不可变边界

- 最小实现成本与 LLM 接口（2026-09-17 用户追加）：优先复用现有能力并做最小必要适配，不能以减少代码/字段为由降低正确性、错误处理、来源校验或实际验收质量。LLM 的输入与返回字段只保留其必须决定或下一步必须使用的信息；已有任务合同可推导的内容由程序推导，固定政策由程序提供，页面身份/摘要/审计等内部证据不要求 LLM 填写或理解。不引入无必要的抽象、重复合同或通用框架；同样不以暗中猜测代替真正必要的显式字段。
- 需求对话仅负责聊透需求，并输出详细、精准、自然语言的执行任务列表给 browser-use（b-u）。不恢复独立规则 JSON、Markdown fence、条款确认或第二套用户权威输入。
- b-u 首次探索；B-A-T 将动作、目标、输入输出和完成条件交给对应工具，形成可持久化和复跑的 TaskChain。记录原动作不等于机械照抄其偶然等待时间、滚动次数和失败尝试。
- 主 agent 使用 gpt-6-astra，负责范围、决策、派发和验收；执行子 agent 使用 gpt-5.6-sol / high，最多两个，并核验实际 turn_context。每次派发指定文件、依赖、禁止项和交付证据。
- 子 agent 生命周期（用户追加要求）：并发上限不等于上下文隔离。一个子 agent 只拥有一个有界职责；同一职责的修复和复验可复用，换职责必须新建 `fork_turns="none"` 的子 agent，只提供当前任务说明与必要文件入口，不继承整段对话。交付→主 agent 验收→文档落盘→正式归档回收→核对列表/创建结果确认释放，不再派新任务；中止时先回报已改文件和未完成状态。主 agent 维护责任/文件所有权与活动名额，不能因复用方便让历史任务污染新任务。
- 派发和交付质量完全由主 agent 负责（用户明确强调）：主 agent 必须把目标、依赖、文件范围、输入证据、禁止项、预期产物、验收反例写清楚；子 agent 不负责替主 agent 决定产品方向。子 agent 报告只是待验收材料，主 agent 核对代码和证据后才能更新完成状态。出现问题由主 agent 修正任务安排、决定旧改动保留/重写/删除、安排最小补救和复验；不得归咎子 agent、不将梳理和收尾责任转给用户。
- 在当前 checkout / 当前分支工作；不创建分支或 worktree，不提交、推送、安装或运行全量/根级测试。保护 dirty、历史来源、Profile 和旧补丁；旧补丁继续隔离保留。
- 不新增一大批预设模型答案的测试代码。优先现有真实记录、已有最小验证和真实浏览器定点行为；不能用局部通过代替正式主线复跑。
- 一个产品运行只拥有一个浏览器会话，在 finally 关闭自己的会话。遇登录、验证码或访问限制走既有人机边界。

## 已核实基线与责任

基线来源：`work/natural-task-validation/51ca80c2-9d7c-470e-935f-300dd2b0f8a4/source-result.json`；验收摘要：`evidence/browser-use-dom-tools/mainline-natural-51ca80c2-9d7c-470e-935f-300dd2b0f8a4.json`。

- 原 requirement v2 / plan v6，来源接受 1/1；native success/judged/closed=true；17 个浏览器命令加 done。native judge 不能代替宿主独立业务验收。
- 当前只有 navigate 与 go_back 两个编译段；没有候选、样本复跑或换输入验证。主线未通过。
- 21 项不是 21 类缺失能力：动作编号错位关联 10 项（7 项目标、3 项参数）；三次读取上下文拒绝及连锁缺读/输出装配 7 项；按键参数 1 项；失败动作一律拒绝 1 项；后态判定 2 项。修正后可能暴露先前被提前返回遮住的问题，不能承诺减去这些数量就全通。
- 已确认错误属于当前实现及局部适配设计，不是用户缺少需求 JSON。之前把预设数据的局部验证扩大为整体能力的结论撤回。

### 可定位事实

1. `hybrid/capture.py` 用完成回调数生成 actionRef；`hybrid/normalize.py` 用全部历史动作数生成 id。a-0003 的无采集失败点击使后续事实错位：a-0007 wait 的 seconds=3 挂在 a-0006；a-0012 scroll 的 down=true/pages=10 挂在 a-0011。真实 DOM 事实也挂错动作，history fallback 又生成缺少作用域摘要的事实。
2. `hybrid/natural_reads.py` 取完整 main；不唯一则取 body.outerHTML，与任务和提取文本拼在一起，超过 128000 字节拒绝。三次提取都在语义模型调用之前被拒绝。没有证据说明该阈值适配任务；仅调大上限不是修复。
3. wait(seconds=3) 来自 b-u 动作，不是响应时间推断。当前安装 b-u 0.13.8 的 Tools.wait 实际 sleep(min(max(seconds-1,0),30))，因此这次参数 3 对应睡眠 2 秒。固定睡眠不证明异步完成。
4. 原生 scroll(pages=10) 按视口高度发十次 ScrollEvent，间隔 150ms；工具循环没有触底提前结束。此次只记录 y=0→1371，不能证明滚了十屏，也不能确认触底次数或抖动。
5. 当前已有 StepVerifier/Tenacity 的动作一次、状态重查机制；问题是自然编译未生成完整、正确的完成条件，部分 changed 判定只能证明动过，不能证明新结果就绪。
6. `author.py` 的字符串脱敏与 `natural_facts.py` 参数来源规则使 send_keys 的执行值只剩摘要。不能从摘要倒推出明文；需要定点补采或明确不可恢复，禁止伪造旧来源。

## 六项修复与验收

### R1 动作身份统一（先做）

- 状态：局部代码与最小验证通过；owner=/root/dom_targets，实际 turn_context 已核验 Sol/high；新真实来源整体验收仍待后续阶段。
- 范围：`vendor/workflow-use/workflows/workflow_use/hybrid/{capture,history,normalize}.py`，必要时同目录独立身份映射模块。
- 做法：以原生 history step/action 位置为关联依据，采集事实与最终 trace 使用同一规范身份；覆盖没有回调的失败步骤、重复动作、无动作模型错误和不完整尾步骤。不得按相同参数猜匹配，不删除失败动作来凑编号。
- 旧逻辑：替换独立回调计数生成外部 actionRef 的逻辑；计数仅可保留为预算统计。
- 验收：真实来源逐动作检查事实归属；真实失败形态通过同一生产采集/规范化路径后后续编号不漂移。旧来源保持原字节/摘要；对照修复只能生成明确标注的派生诊断，不冒充原证据或生成生产候选。

### R2 执行参数保全

- 状态：局部代码修复与定点验证通过；owner=/root/dom_evidence，实际 turn_context 已核验 Sol/high。正式来源/复跑仍待集成验收，不能将旧摘要称为已恢复。
- 范围：`hybrid/author.py` 的 action redactor、`hybrid/natural_facts.py`，必要时独立参数模块；不得修改 R1 文件。
- 做法：按原生动作字段语义保存技术参数与输入绑定。键盘控制键必须完整可执行；用户输入/敏感字符串沿受控输入引用传递。不能用全字符串放行取代脱敏，也不能新增用户规则 JSON。普通字符串键入与控制组合键要区分。
- 旧逻辑：移除误伤执行参数的笼统脱敏路径，保留隐私边界；缺失来源显式报告。
- 验收：原生动作 schema 校验、红action 后仍能还原受支持参数；敏感数据不出现在 trace/log。旧摘要明确不可恢复。不得启动浏览器补采，直到主 agent 排到运行阶段。

### R3 目标定位与滚动

- 状态：R3a（已在 DOM 中的目标准备）本地真实验证通过，owner=/root/dom_evidence；源动作归并和懒加载分支未完成。
- R3b 已按 [生产目标滚动派发](evidence/browser-use-dom-tools/R3_TARGET_SCROLL_TASK.md) 派发全新空白上下文 `/root/r3_target_scroll_fresh`：新增薄的 bat_scroll_to，复用原生 scrollIntoView/IntersectionObserver，接通首次 Agent 与普通执行器；现有目标零/一次滚动、缺失/多义/隐藏拒绝。现已通过局部主验收，见 R3_TARGET_SCROLL.md；正式适配接线和同动作换位置通过，不覆盖 TaskChainRuntime/LangGraph、候选持久化加载或原任务。此前 thread limit 已通过正式归档已完成子 agent 回收；归档后首次创建仍遭上限，确认 list_agents 仅剩 root 后再次创建成功。不能再把缺少专用 close_agent 等同于无法回收。
- 范围：现有 TargetResolver、capability/DOM 适配与自然编译的目标处理；复用 b-u Page/Element 公开 API。
- 做法：已定位目标先滚入视口并确认可操作；优先元素滚入视口，不冻结绝对坐标。只有 DOM 尚无目标且需要加载时才分段滚动，检查目标出现、滚动进展、加载状态、触底及超时。原探索 scroll(10) 保留审计；只有证据说明是下一目标的展示辅助步骤时才能合并，不能擅自删真实业务滚动。
- 旧逻辑：不能将固定十次滚动或仅 scroll_position changed 当成目标已就绪。不更换浏览器驱动、不自写通用滚动引擎，不修改 site-packages。
- 已核验复用细节：当前安装 b-u 的 `browser/watchdogs/default_action_watchdog.py:768` 在原生点击内先调用 `DOM.scrollIntoViewIfNeeded`，再重新取目标坐标。沿 `Tools.act → ClickElementEvent` 复用此路径；不要改用先算坐标后滚动的 Actor Element.click 分支，也不要重写该能力。主要缺口是新鲜目标索引的可靠解析，以及有证据的探索辅助滚动归并。
- R3a 派发决定：若唯一目标已存在但不在当前动作索引中，先通过现有 Page 查询/原生完整 DOM xpath 定位，用固定 Element.evaluate 的 DOM.scrollIntoView 或已核验等价 API 准备视口，再刷新由 b-u 自己生成的动作索引并调用 Tools.act。禁止手工塞 selector_map、自己解析 XPath/CSS、对未定位目标盲滚。先收齐本地真实已可见/视口外/不存在三个结果；此项不冒充懒加载与源滚动归并已完成。
- 验收：目标已可见不做多余滚动；目标在视口外能够到达并点击；提前触底不持续盲滚；必要时保留明确未到达/超时。需记录实际位置/目标状态和动作次数，而不是只看返回 success。
- R3a 已完成本地真实验证：已可见目标滚动增量 0、点击一次；视口外目标从原生索引缺失到滚入视口后点击一次；不存在目标不滚动、不点击。首次真实验证暴露 document 根与 html frame 标记不同造成局部遍历截断，已改为原生 children_nodes 遍历且不进入 content_document/shadow_roots，修复后重验通过。此证据不代表懒加载或原任务通过。
- 换输入门的已知限制必须一并处理：当前 natural_target 将来源 pre.url/urlDigest 直接写成运行目标 scope；原 plan v6 的输入只有 startUrl，不能把其他局部样例改变 ordinal 的结果当成该原计划换输入通过。若更换仓库入口而后续 scope 仍冻结样本 URL，执行会拒绝。需要沿真实运行状态/输入绑定参数化 scope，保留跨页/跨 tab 漂移拒绝；R3c 方案已按 [运行作用域派发](evidence/browser-use-dom-tools/R3_RUNTIME_SCOPE_TASK.md) 冻结：源证据不变，物化证明相邻页连续性，运行时用上一成功动作实际页并核验 session/tab/URL。当前已通过真实 TaskChainRuntime alpha/beta 两入口同链复跑，均 5 命令、0 模型，来源和静态配置未变，见 R3_RUNTIME_SCOPE.md；不允许简单删除 scope 校验或用等价 URL 改写冒充有意义换输入。

### R4 异步完成条件

- R4b 已按 [条件等待派发](evidence/browser-use-dom-tools/R4_VISIBLE_WAIT_TASK.md) 实施：selector-only 工具与生产接线、慢响应/超时/取消/漂移真实 Chromium 验收已获主 agent 接受，详见 R4_VISIBLE_WAIT.md。原任务业务 selector 正确性仍待正式验证。
- 状态：R4a 局部修复与诊断已收敛；两个旧弱条件用例不再满足准入，未伪称整组通过。真实业务就绪仍未通过；原 owner=/root/dom_targets 已退役。
- 范围：`hybrid/natural_compile.py`、现有 causal/postconditions/natural_effects 和必要的采集适配。
- 做法：动作执行一次，复用 StepVerifier/Tenacity 等待明确结果条件；如目标可操作、旧容器被替换且新数据可读、选择状态生效。超时上限与探索中的固定睡眠分离；取消/超时向外传播。需求明确的停留时长与等待加载要区分。
- 旧逻辑：替换“固定 sleep 即完成”和过弱的 changed 判断；URL/title/位置变化不能独自证明业务结果加载完成。等待期间不重复点击/输入。
- 接线反例：现有 `causal.delayed_post_for_conditions` 要求后续 wait 的 pre.id 等于前动作 post.id，但真实 collector 为每次 pre/post 都创建不同 observation。不能照搬该 ID 相等条件；须比较同一页面/容器事实与单调时序，不能因 fixture 共享 observation 而认为生产已接通。该问题归 R4，不扩为第七个项目。
- 已确认采集 bug：本地真实 snapshot_target_element 调用暴露 `node_value() takes 2 positional arguments but 3 were given`，此前异常被捕获并记为 target_effect_read_failed。授权 /root/dom_evidence 最小修正该调用并真实定点复验，不能把错误吞掉后说页面不支持状态读取。
- 采集补救已通过本地真实验证：先修正 node_value 调用，又查到 Actor Page 的 DOM session 未初始化导致 `Document needs to be requested first`。现复用公开 `get_elements_by_css_selector('html')` 初始化同一会话，并在获取 backend Element 前后核验 targetId；capture 与 XPath 后态路径共同使用 `element_from_backend`。实际读得 aria-expanded=true、aria-checked=false、disabled=false。未调用 provider；不把该局部证据算作原任务异步就绪通过。
- R4a 决策：不同 observation id 以相邻动作、观察序号、同 tab/URL 事实、单调时序和预算关联；布尔 target_state 用观测到的明确状态 equals + 既有 settle；URL/title 检查接既有有界等待。纯 scroll/overlay changed 不声称业务 ready；旧测试若只证明该弱条件需如实列不再适用，不能改断言刷绿。真实 wait 尚无 target_state 采集，容器就绪仍须接线，不能用人造 wait 事实冒充完成。
- 主 agent 真实运行时验收通过：[R4_SLOW_RUNTIME.md](evidence/browser-use-dom-tools/R4_SLOW_RUNTIME.md)。4.2 秒异步状态实际 4.58 秒完成、18 次检查、点击一次；永不满足明确失败；取消后检查和点击计数不增加。此项使用受控页面声明条件，未解决自然源列表 ready 接线，不将 R4 升级为完成。
- 验收：响应超过探索时等待值仍能在预算内成功；一直不满足则明确超时；取消后不再操作；一次副作用对应多次只读检查。不能只用预设状态序列宣称真实接线完成。

### R5 提取范围与输出读取

- 状态：R5a/R5b 局部工具和生产读取接线已由主 agent 验收，两个 owner 均交付退役，实际 Sol/high 已核验。[R5b 证据](evidence/browser-use-dom-tools/R5_PRODUCTION_READ.md) 是真实 localhost Chromium + 脚本模型接线；普通 Runner 读到变化值、零模型，不能替代原任务。完整 R5 尚缺复合报告与原输出装配验收。
- 范围：`hybrid/natural_reads.py`、read/targets/natural_output 与必要的 capture 接口；采集接口与 R1 owner 协调。
- 做法：根据任务的本次提取目标获取候选容器/必要结构，按需补充局部 DOM；复用 b-u DOM 与现有 ReadSpec。当前字段投影采用原生 innerText/getAttribute，不再用 BeautifulSoup 拼接字段文本。分批或缩小范围解决数据量，不能整块 main/body 拼接后硬拒绝。读取映射必须在实际页面验证，并能在复跑时读出新值。
- 旧逻辑：重写 whole-main/body → 128 KB reject；不只提高常量，不绕开验证复制历史答案。普通提取保持零模型；确需模型的语义处理只能经现有显式 llm 节点，不能暗中调用或擅自改变已约定复跑边界。
- 输出报告决定：复用显式 llm 节点，每次摘要一调用、保留审计，页面字段继续确定性读取；不冻结历史 report。最小工具输入只 outputPath，程序提供任务与实际已读数据，详见 [报告输出派发](evidence/browser-use-dom-tools/R5_SUMMARY_OUTPUT_TASK.md)。已派发全新 /root/r5_summary_output（Sol/high）准备独立 helper，R3c 已验收并释放共享入口，正在接线。原 plan v6 的 maxLlmCalls=500 已从 taskContracts 只读核验，不需改预算。字段读取接口后续按 [三字段适配](evidence/browser-use-dom-tools/R5_FIELD_INTERFACE_TASK.md) 收敛，schema/类型/包装/基数由程序推导；不以新的任意字节常量替代旧 128 KB。
- 输出适配待落实：当前一次 extract 只允许一个 ReadSpec/outputPath，且 done 的每个叶子必须与 DOM 读取逐字相同。这不足以覆盖一次提取的多个字段组及执行报告。必须区分页面字段、输入/序号、运行事实和确需模型的文字处理，并复用已有绑定/data.transform/显式 llm 能力；不得把报告伪装成页面字段、复制历史答案或改原输出合同。先修作用域，不因该问题自行引入另一套表达式语言。
- R5a 复用决定（先做局部工具，不冻结整条生产路径）：当前 b-u `Tools.action` 是公开自定义工具注册接口，现有 ReadSpec/read_fields 已能执行局部容器读取。先提供一个薄的确定性字段读取工具注册模块，由首次探索的原生 Agent 直接给出容器/字段参数并现场读取，记录参数与真实输出；不再为了得到同一规则额外读取整块页面 HTML。此阶段只实现、验证工具本身，不改原生 Agent loop，不新增模型调用，不替换生产工具注册/编译契约。必须先拿真实本地工具行为证据，再由主 agent决定如何接到 author/capture/compile 与复合输出；不能把独立工具完成算作 R5 完成。
- R5a/R5b 当前读取边界：`read_fields` 复用 Element.evaluate 执行固定的只读字段投影，CSS 及字段参数通过函数参数传入；仅返回所选字段的原生可见文本或属性，Python 只做标量转换。禁止返回整容器/main/body HTML，禁止接受任意脚本。保留调用方显式 maxInputBytes 预算，但删除 128000 的硬性上限，预算只累计所选字段。CSS 匹配交给浏览器原生选择器，不实现解析器；不支持的选择器明确失败。若旧 mock 只返回整容器 HTML，不为其添加生产回退，不改断言刷绿。
- R5b 主 agent 决策：将已验收的局部读取工具注册到生产 author 和同源离线 registry；采集端按当前规范动作身份绑定真实工具记录，复用 verified_natural_read/browser.read-fields，不新增执行器。native extract 保留其原生记录，但不再由 capture 执行 whole-page 语义注解；无可复跑读取证据就保留 gap，不伪造来源。复合报告另行收敛，本项不能擅自变更原输出契约。
- R5b 前置反例：原 plan v6 的字符串没有 maxLength、标签数组字段没有 maxItems，不能使用显式 LLM bounded_schema 拒绝合法确定性读取；以实际字段预算和 ReadSpec 基数控制。主 agent 又复现 BS4.get_text(strip=True) 将 `Updated ` 与嵌套时间拼成 `Updated2 days ago`，故字段文本必须复用原生可见 innerText，属性直接 getAttribute，不自行拼接文本。该修正归当前 R5b 读取接线所有权；旧 R5a 局部通过不覆盖这个被后续反例揭示的语义问题。
- 验收：真实页面的三次提取获得可执行读规则及完整输出映射；同结构内容变化时返回新内容；缺字段/未就绪/作用域变化明确失败。若现有 ReadSpec 表达不了真实输出，记录具体缺口，先检查已有成熟能力再适配。

### R6 失败探索与有效复跑步骤

- 状态：/root/r6_dispatch_evidence 局部代码与入口诊断已由主 agent 验收；实际 Sol/high 已核验；该 agent 已交付退役。只处理可证明未派发与已进入/不明副作用的边界，其他失败仍保留缺口，原来源不能倒填。证据见 [R6_DISPATCH_REPAIR.md](evidence/browser-use-dom-tools/R6_DISPATCH_REPAIR.md)。
- 范围：`hybrid/natural_compile.py` 与既有 ActionCoverage/causal 适配。
- 做法：失败尝试保留原始顺序和结果；按失败发生阶段、是否产生副作用、后续恢复事实确定是否为可排除的探索尝试。已证明未执行的失效目标可不进入正式链路；无法证明的写操作不能自动跳过或重试。
- R6 首项派发决定：核验原生 callback→Tools.act 时序，薄包装同一 Tools.act 入口记录是否进入，用已修的原生 step/history 位置绑定事实。只允许有明确生产派发证据的 failed action 排除；错误字符串或后续成功不能作为未执行证明。旧来源缺派发证据，不追认、不修改原始来源。此项可独立于 R5 提取范围修复推进，不扩大为新 Agent loop。
- 旧逻辑：替换一律 successful_action_result_required→reject_trace；不能改成一律丢失败步骤。
- 验收：原实际失败点击有明确处理结论与依据；失败记录仍可审计；不确定副作用仍阻止不安全复跑；最终每个来源动作有唯一归属。

## 执行顺序、验证成本与停止扩大范围

1. 先落本文并在 PROGRESS/ROADMAP 建入口，再开发 R1/R2。主 agent 负责更新本表及跨模块决定，子 agent 不改总计划。
2. R1/R2 的最小校验及真实来源对照完成后，确定 R3/R4/R6 的共用数据接口；R5 可在无冲突文件范围并行。
3. 不通过全量测试或重复新建假 fixture 获取“通过数”。不新增测试代码；使用已有最小验证及临时只读诊断/真实浏览器探针，证据只写脱敏摘要。不把临时派生来源送入生产验收。
4. 主 agent 先做局部真实验证，收齐已知参数/目标/异步/读取路径，再做一次正式原任务验收；失败先查已保存来源，禁止立即循环重跑完整探索。
5. 原任务：已有 requirement v2 / plan v6，保留 Issues 原筛选排序、真实控件翻页、第 2 页首条详情、返回状态及原输出要求，不拼接 URL 偷换操作。原始 task/requirement/plan 不修改。
6. 交付门：正式入口 → 来源保存 → 编译候选 → 持久化加载 → 普通执行器样本复跑 → 同链改变输入验证；结果、模型调用、浏览器关闭分别记录。真实 provider 探索成功不是本门通过。
7. 新发现仅处理影响上述门的直接问题，先写根因和替换位置；不能把一条新报错扩成新平台/新规则语言。未知处如实保留，不承诺六项修完必然全通。

## Product Alignment

- natural-language task: 已确认的自然语言浏览器任务；当前验收实例是既有 Issues 任务。
- reusable chain boundary: 首次探索的单一步骤形成可复用链路；支持列表/详情及表单/选择控件等通用场景。
- runtime inputs: 已确认 PlanStep 输入与可变参数，不冻结历史标题/编号/返回值。
- dynamic task outputs: 从本次页面读取并按既有输出契约装配。
- generic platform capability used: 原生动作、当前 DOM 目标、完成条件、输入绑定、来源审计。
- replay model calls: 普通节点零模型；仅显式 llm 节点允许模型。
- site/task-specific code added: no

## Reuse Assessment

- capability: 现有探索数据至执行器的适配修复，不引入/替换关键库。
- existing implementation in repository: EvidenceCollector/history/normalize、TargetResolver、ReadSpec、StepVerifier/Tenacity、TaskChain/LangGraph、AI Connect。
- mature candidates and pinned versions: 沿用现有 browser-use 0.13.8、workflow-use 0.2.11 fork 和已锁定依赖；不重开选型。
- selected implementation: 上述既有组件；每项优先检查其公开 API 和安装源码的实际行为。
- reused public surface: Agent 回调/history、Page/Element/Tools、ReadSpec/BeautifulSoup、StepVerifier、Tenacity、LangGraph。
- B-A-T-owned adapter and remaining gap: 动作身份、参数来源、目标/完成条件映射、读取输出绑定与失败归属；R3/R5 所需 API 仍需定点核验后才能冻结细节。
- license/runtime/platform fit: 沿用已有 fork 的许可证与 Python 子进程边界，无新依赖/安装；本机真实验证不能宣称 Windows 已测。
- browser/runtime/state ownership conflicts: b-u 单一会话；LangGraph 唯一图调度；不复制 Agent loop/浏览器控制/通用重试器。
- replay model calls: 同 Product Alignment。
- rejected candidates and evidence: 没有新增候选；拒绝 whole-body prompt、固定滚动次数和固定睡眠作为完成证明，依据见本文基线。
- focused validation: 按 R1–R6 指定真实不变量，结果追加下表。

## 执行日志（完成一项更新一次）

| 日期 | 项目 | 实现/验证结果 | 尚未证明 |
|---|---|---|---|
| 2026-09-16 | 计划 | 六项问题、证据、替换边界与验收已落盘 | R1–R6、正式主线均未完成 |
| 2026-09-16 | R1/R2 | 已按不重叠文件派发；两名子 agent 当前实际 Sol/high 已核验 | 代码和验证待返回 |
| 2026-09-16 | R3 复用核验 | 原生 Tools 点击已有先滚入视口、后计算坐标的实现 | 目标重定位与辅助滚动归属尚未接通 |
| 2026-09-16 | R2 | author/natural_facts 最小修复；现有 test_scroll_and_send_keys_require_specific_observed_effects 1/1；原生 schema + redactor/binding 临时诊断覆盖 Escape、Control+Shift+P、Meta+a、F12、私有文本和输入引用 | 未启动 Browser/provider；旧 a8 摘要不可恢复；生产新来源往返待集成 |
| 2026-09-16 | R3a | 已按已存在目标→准备视口→刷新原生索引→Tools.act 派发最小实现 | 懒加载、源滚动归并与原网站主线仍未测 |
| 2026-09-16 | R1 | 新增 action_identity helper，capture/history/normalize 共用原生位置映射；既有最小组 26 项通过，Ruff 通过；临时诊断覆盖未采集失败、重复参数、无动作错误及后续采集，事实归属正确 | 诊断不是实际 provider 探索；旧 source 保持 SHA256=8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa，不回写为生产来源 |
| 2026-09-16 | R3a/目标状态采集 | 已可见/视口外/不存在目标三分支通过本地真实 Chromium；helper 参数与 Actor session 两个实际错误修正后读取布尔目标状态通过；独立临时 Profile，finally 关闭，无 provider | 懒加载/原 scroll 归并/原任务整链仍未完成；原网站未重跑 |
| 2026-09-16 | 子 agent 生命周期纠正 | 此前长期复用 dom_targets/dom_evidence，未做到不同职责的上下文隔离。dom_evidence 已完成并退役；dom_targets 仅收当前 R4a 后退役。后续新职责使用空白上下文新 agent，最多两个同时活动 | 退役表示不再派发，不宣称平台已删除旧会话或清空其上下文 |
| 2026-09-17 | R5b 主验收 | 生产工具、采集、编译、registry 与真实 localhost 证据已核对；普通 Runner 读出新值、0 模型；manifest/sourceDigest 和 --check 通过；子 agent 交付退役 | 原任务、宿主持久化同链复跑与换业务输入仍未验收 |
| 2026-09-17 | R3b 派发 | 文件范围、十项实现条款、真实反例及退出边界已写完整；归档回收旧 agent 后，全新 r3_target_scroll_fresh 创建成功 | 实施与主验收待完成 |

## 2026-09-17 原任务真实执行后的当前处理

- 用户对现有 Codex 订阅及 chatgpt.com 的具体载荷授权已通过自动审批；权限问题已解除。
- source run `fb3775e0-7e17-40fa-bcff-6ed22cb07a19` 实际完成两次模型调用、仓库导航与 Issues 入口点击；点击状态为成功，后观察缺失，来源整体未成功/未通过 judge；finally 已关闭。
- 当前顺序：最小真实两动作诊断，记录白名单错误码及代码位置，定位后最小修复；验证同一失败点通过后才重新执行正式来源。六项连锁 gap 不是六个新能力需求。
- 诊断由全新 `live_callback_diagnosis`（实际 Sol/high 已核验）执行，只能写临时探针和脱敏结果，不能修改生产代码、合同、tests 或 manifest。主 agent 负责修复决定和验收。
- 来源及证据不可回写为成功；原任务 candidate/sample/verification 均未产生。详细证据见 `evidence/browser-use-dom-tools/MAINLINE_FIRST_LIVE_FAILURE.md`。

### 实测定位与最小修复决定：动作后页面快照一致性

真实 GitHub 两动作探针已复现 `observation_url_changed`：原生新快照请求先取 URL，再异步构建 DOM，期间同标签导航完成；collector 的实时 URL 检查正确发现不一致。不是缓存命中，不得通过 `cached=False`、删校验或固定睡眠声称修复。

Product Alignment:
- natural-language task: 点击仓库导航、提交搜索或表单后继续读取当前页面
- reusable chain boundary: 只重新采集同一已完成动作的后态，不重复动作或模型调用
- runtime inputs: 当前 Browser 与既有动作结果
- dynamic task outputs: 同一标签/URL 的一致后观察，或有界失败
- generic platform capability used: browser-use 新快照公开接口与 Tenacity 有界重查
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 异步导航期间取得一致动作后观察
- existing implementation in repository: EvidenceCollector.observe 的 URL/tab 守卫；postconditions.py 已使用 Tenacity
- mature candidates and pinned versions: 现有 browser-use 0.13.8 / workflow-use 0.2.11 环境及已安装 Tenacity
- selected implementation: 原生快照及现有 Tenacity，无自建轮询器
- reused public surface: get_browser_state_summary(cached=False)、Page.get_url、AsyncRetrying
- B-A-T-owned adapter and remaining gap: 后观察不一致时重新取得完整快照与现场事实；动作前保留严格拒绝
- license/runtime/platform fit: 沿用锁定依赖，无新增库或运行时
- browser/runtime/state ownership conflicts: 单会话，重查不重派动作，无新状态机
- replay model calls: 0
- rejected candidates and evidence: 单纯关缓存无效，默认已为 False；删守卫会把旧URL与新DOM配对
- focused validation: 同一 GitHub 两动作探针，有限超时/取消/不重复动作反例；不新增测试文件

实现约束：只重试明确的动作后 URL 快照不一致；每次重取快照并重读现场事实，同一尝试末尾仍严格核验 URL/tab。动作前模型选中的快照不替换；未知异常、tab身份错误、取消不吞；使用现有 30 秒级有界等待，不能固定等时长当成功。原生动作只执行一次。仅修改 capture.py 及必要小 helper，主 agent 验收后更新 manifest。工具/LLM输入不新增字段。

### 第二次正式来源后的收敛（2026-09-17）

- 正式 run `da124af1-ef86-4905-bf54-3e3f00431445` sourceSuccess=true/judge=false，候选、样本和换输入均未产生；来源不可改写。精确动作事实见 `evidence/browser-use-dom-tools/MAINLINE_AFTER_SNAPSHOT_FIX.md`。
- 已验收字段工具反馈修复：不新增输入字段，错误明确指出合法输出路径/必需字段；无效调用仍拒绝。记录 `FIELD_READ_FEEDBACK.md`。
- 已验收 author 指导及结果保留：字段必须使用可复跑读取，返回后必须实际读取，摘要走显式工具；judge=false仍拒绝候选，但保留符合已确认合同的结果供诊断。记录 `AUTHOR_RESULT_AND_GUIDANCE_FIX.md`。
- 已验收 search_page 覆盖：只接受成功、同tab、同完整URL摘要、有效原生参数及精确证据引用的只读探索；独立coverage复算，TS scope消费相同精确规则。不能提供输出字段或动作效果。真实a24正向及反例通过；记录 `NATIVE_SEARCH_COVERAGE.md`。验收源码摘要 `d94973eb7608f249244c0f31c80589f8b0ec6a31fbafa98f93d2b6f05b87491b`。
- 待办一：a2即时post早于导航完成，a4pre记录了迟到URL变化，中间只有已证明未派发的a3。须同时修复Python归因与TS当前运行边界，不得仅消除编译报错。
- 待办二：a5菜单与a9搜索区域按钮缺少准确效果事实。只做有界现场诊断；不得把菜单打开冒充列表刷新，不按猜测增加字段或弱化后置校验。
- 完成上述局部修复后才再次正式执行。验收仍要求候选持久化、sample、同链换输入，不能以source成功或局部探针代替。

### 原任务重跑前的实际收尾

- 迟到导航：真实a2的即时post与下一真实动作pre连续，中间a3严格证明未派发；只归因有界URL变化。Python编译与TS scope共同消费，保留全部动作；详见 `LATE_NAVIGATION_BOUNDARY.md`。宿主真实hash校验另发现monotonic_ms需使用capture.fact的{kind,value}摘要规则，正在做生产consumer红绿，不能用逐字段相等冒充该入口已通过。
- React控制状态：真实a5旧backend断连且XPath增加wrapper。精确XPath后态重解仍失败，故用同一原生前态中核验唯一且backend对应的tag+aria-label CSS候选，复用既有queryCandidate和CSS执行target；无LLM新字段、不猜位置、多匹配拒绝。新鲜connected节点原子读取state/value，click不生成无意义target_value。真实采集/编译以及读取同一编译产物的新Browser普通执行器均通过；详见 `POST_ACTION_TARGET_REFRESH.md`。
- 局部source结束后原生Agent会关闭keep_alive=false的Browser；第一次紧接Escape失败属于验收探针复用已关闭连接，不修改生产生命周期。独立Browser复跑已证实通过并finally关闭。
- a9仅证实Search按钮在base页面提交查询；原带query来源中是否重复提交无效果尚未证明，未删除该动作、未编造条件或新增猜测能力。
- 本次锁定fork源码 `6fc78935a791184985736b7d351c3300c7276ace06ab3d8d485e14852df122e9`，manifest及setup --check通过。正式执行脚本仍为已核对的 `/private/tmp/mainline-natural-probe.mts`，不改变原任务/需求/计划。


### 第三次正式来源后的定点诊断（2026-09-17）

- run `5c333a80-53e0-45bd-9755-ae5560ed7608` 未通过；完整证据见 `MAINLINE_AFTER_CAPTURE_REPAIRS.md`。原需求、计划及来源未改写，应用已关闭。
- a27仅有一次字段读取失败，之后没有分页/详情/返回。报告声称混合文本节点无法读取，但原ActionResult固定错误未持久化，当前不能把模型报告当工具能力结论。先用真实同页DOM和原参数定点复现，区分动态容器ID、歧义selector及原生文本节点确实不可达。
- a8无aria-label，已有label CSS候选路径未适用。必须实证原backend连接状态、post快照selector_map及XPath变化，再决定最小修复；禁止以overlay变化冒充控制状态，更不能把打开菜单等同列表就绪。
- 原先全部叶子绑定只接受真实读取/显式摘要；本次page叶子未读、report未调用摘要且详情为空，因此输出装配未通过是后果。此时不放宽输出/judge门。
- 字段探针由全新Sol/high独立上下文执行，唯一Browser槽，0 provider，finally关闭；仅/private/tmp探针和证据，不启动下一次完整来源。


#### 字段读取的实测结论与修复选择

真实单页探针 `/private/tmp/bat-field-dom-failure-probe.json` 已证明：旧React容器ID不稳定、number和labels原选择器错误、relative-time匹配两个；编号本身存在独立span，页码可直接读integer。修正selector后仍有真实工具缺陷：Updated父容器的innerText只含前缀，日期10h ago实际显示于时间组件的open shadow root；light DOM fallback on Sep16并非当前显示文本，不能偷换。labels还需选择标签正文而非附带description的link整体。

Product Alignment:
- natural-language task: 读取网页组件中的完整可见字段，例如时间控件和自定义表单说明
- reusable chain boundary: 已确认局部字段容器的确定性文字投影
- runtime inputs: 既有container及field selector，无新增LLM参数
- dynamic task outputs: 当前真实显示文字，不使用隐藏fallback或历史常量
- generic platform capability used: Chrome原生DOM及Accessibility协议，经既有browser-use会话调用
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: shadow组件与其周围文字的局部文本读取
- existing implementation in repository: read.py Element.evaluate innerText/getAttribute，不能读到该组件shadow显示文字
- mature candidates and pinned versions: 既有Chrome CDP Accessibility.queryAXTree，browser-use0.13.8公开Element/Browser会话API
- selected implementation: 先验证原生AX子树StaticText查询，尚未冻结；不先自写shadow渲染或文本布局引擎
- reused public surface: Element.get_basic_info、Browser.get_or_create_cdp_session、DOM.querySelectorAll、Accessibility.queryAXTree
- B-A-T-owned adapter and remaining gap: 局部节点定位及原生文本结果适配；ignored过滤、返回顺序、可见性仍需实测
- license/runtime/platform fit: 沿用既有Chrome/锁定Python，无新依赖
- browser/runtime/state ownership conflicts: 单Browser，原有读取前后页面一致性守卫保留
- replay model calls: 0
- rejected candidates and evidence: light DOM XPath只能读fallback，innerText单独漏shadow；自写渲染器不符合最小复用原则
- focused validation: 真实时间字段及必要隐藏/顺序反例；不新增测试文件、不完整任务盲重跑

协议依据：[ChromeDevTools官方类型定义](https://github.com/ChromeDevTools/devtools-protocol/blob/master/types/protocol-proxy-api.d.ts)。queryAXTree限定DOM子树但可包含ignored节点，不能直接把所有name拼成业务字段。


#### 已验证的选型修正与实施（2026-09-17）

- AX路线已实测拒绝：同CDP session且目标确认是Updated父div，queryAXTree带/不带role均返回空nodes，无法提供该可见字段。未增加AX兜底或自写CSS算法。
- 原生DOM快照路线实测通过：字段子树仅7节点。原生snapshot/visibility把前缀与shadow真实11h ago标为可见，把light fallback on Sep16标为不可见；其顺序、backend及shadow归属可明确核验。
- Reuse Assessment更新：selected implementation为已有Page.dom_service.get_dom_tree和DomService.is_element_visible_according_to_all_parents(viewport_threshold=None)，不新增依赖。B-A-T仅按唯一backend适配选定字段子树，不保存/发送整树，不把snapshot当HTML输入给LLM。每次读取最多复用一次native树，不能跨读取缓存。普通非shadow字段保持原innerText字节语义、attribute保持getAttribute；所有既有数量/schema/页身份守卫保留。实现已完成并经主审：真实bat_read_fields/read_fields_with_proof均读出当前前5条完整字段和整数页码，模型0，Browser finally关闭。混合不可见null不会被shadow回填；shadow文本为原生可见片段规范化拼接。
- 字段错误反馈一并限定到field名/固定错误码/匹配数量，不输出原异常或页面正文；author仅新增稳定selector的一般指导，公开工具参数仍三个。
- 排序按钮当前实测正常：原backend持续连接，post map同backend/同XPath唯一，expanded false→true，生产刷新成功。历史a8不能因此宣告已修复；不猜测放宽定位。最小诊断补丁已验收：仅对有targetIdentity的refresh/state/value失败保留枚举fact，unknown→unavailable，含detached固定码，不参与效果证明。真实a8添加诊断后仍not_compilable。详见 `evidence/workflow-use-hybrid-h3/TARGET_OBSERVATION_DIAGNOSTIC.md`。


#### 当前正式执行

锁定sourceDigest `e22d025dc56d6505ed2786e822fb7c254f1d95d9b076a485ec9900d8dfe83e16`，setup --check通过。一次正式 run `c5388804-13b6-4c70-845b-d1316a0f7bd5` 已启动，job `d12bfa2f-3d3d-4b1b-85e3-886d4a26f0a2`；原需求/计划/模型保持。首次进程因缺少--run在创建应用前退出，启动日志已单独保存；不计为source。正式结果未出，不宣告candidate/sample/verification通过。


#### 24分钟超时后的必要补救（2026-09-17）

run `c5388804-13b6-4c70-845b-d1316a0f7bd5` 到原预算超时，job interrupted/exploring；source/动作/模型审计均未落盘，owned进程已退出。不能从此推断字段读取失败。代码已确认：withHybridAuthoring仅把模型报告放内存；RunnerProcess忽略stdout/stderr，fd3只有完整请求响应；author_step被取消不会产出完整来源。当前没有足够证据区分模型、动作或快照等待，直接重复24分钟不合理。

Product Alignment:
- natural-language task: 原已确认浏览器任务的来源探索和普通复跑
- reusable chain boundary: 既有来源会话诊断，不改变任务链或来源验收
- runtime inputs: 原任务/输入/输出合同与模型配置保持
- dynamic task outputs: 原业务输出保持；只追加本地安全生命周期诊断
- generic platform capability used: 既有Agent回调、动作派发包装、模型onAudit、独立进程管道与文件写入
- replay model calls: 无新增
- site/task-specific code added: no

Reuse Assessment:
- capability: 在来源超时/取消前保留最后执行阶段，定位真实卡点
- existing implementation in repository: EvidenceCollector回调、ActionDispatchAudit、model-bridge onAudit与RunnerProcess均已有生命周期节点
- mature candidates and pinned versions: 既有browser-use0.13.8公开回调、Node fs/child_process、Python json；不引入新依赖
- selected implementation: 仅适配既有回调发出固定白名单元数据，通过单独管道由宿主按当前owner保存本地诊断
- reused public surface: 原Agent回调/工具派发、onAudit、child_process fd、fs append
- B-A-T-owned adapter and remaining gap: owner关联、固定事件白名单、及时写盘与错误/取消收尾；不是来源、完成证据或第二个执行器
- license/runtime/platform fit: 既有运行时，管道适用于当前多平台进程适配
- browser/runtime/state ownership conflicts: 不增加Browser、provider调用、动作重试、超时预算或公共LLM字段
- replay model calls: 0新增
- rejected candidates and evidence: 开启原生日志会暴露页面/截图/凭据正文；仅在finally写内存汇总仍会丢失被强制终止前的状态，均不采用
- focused validation: 临时本地真实进程调用及取消样本，确认事件及时落盘且正文不进入诊断；不新增仓库测试。完成后才用原合同再进入有实时阶段证据的正式执行。


生命周期诊断已实现并经主审：实际RunnerProcess/fd3/fd4/DiagnosticChannel/owner writer取消验证通过；临时launcher仅替换Browser与author_step，无provider，真实请求解析/取消清理保留。第一版launcher误补丁不计为通过，证据保留。源码锁定 `07f5141c1cc5cba0e735d3b1c3d53068b12a7da64f5f3f769182b42674bb20e6`，setup --check通过，准备恢复一次原正式任务，监测真实阶段。


## 最新来源的定点处理（2026-09-17）

1. 字段定位：8组真实args包含无效CSS、用b-u索引当DOM id、把显示树当真实父子层级的迹象。尚不能仅凭source确认每次错误正文；由一次0模型真实局部probe逐条定位，并对照已知可用工具路径。失败resultRef相同是因为capture只哈希errorPresent/is_done/success/contentDigest，不说明错误原因相同。
2. 只读查询归属：find_elements两次失败仍走成功动作编译门。只为原生schema合法、同页面且查询scope证据齐全的失败只读探查增加探索归属，Python独立coverage和TS页面连续性同时核对。原始失败不改写为成功。
3. 输入text：原source的输入字符串已脱敏，当前绑定仅允许原需求原文片段或输入引用，导致模型生成的查询语法不可复跑。记录为待决的参数保全设计缺口，不从摘要猜原字符串，不笼统放开所有敏感字符串。

以上不恢复需求规则JSON。后续局部DOM辅助若确有必要，须以真实失败证据决定最小公开API适配，不复制浏览器控制/选择器引擎。

### 原生文字参数保全的最小修正决定

Product Alignment:
- natural-language task: 通用搜索筛选或普通表单文字输入。
- reusable chain boundary: 原生input动作及其目标值后置条件。
- runtime inputs: 与运行输入精确匹配时仍绑定input引用；固定动作文字保留为版本化常量。
- dynamic task outputs: 未修改；页面字段仍须经过正式读取。
- generic platform capability used: 现有native_parameter绑定与原生input执行。
- replay model calls: 0。
- site/task-specific code added: no。

当前“只有需求原文中的连续子串才可成为输入常量”误把实现参数当成必须另外确认的业务规则。决定只补input.text固定文字参数，不放开所有action字符串：当前源参数为实际模型已派发的动作值，保持运行input引用优先；脱敏占位符或敏感数据占位符不得升级为常量。输入目标值可以使用已有脱敏摘要与预期动作参数摘要核对，不把额外页面值写明文。登录/验证码/一次性口令依旧按既有人机边界处理。派发时要求复验输入引用、普通固定文字、脱敏占位符拒绝和不匹配后态拒绝，不从旧来源哈希恢复文字。旧source未完成/未judged状态不改变，换输入正确性仍由实际同链验证证明。

### 本次定点修复已验收

- [真实失败分层与反馈修复](evidence/browser-use-dom-tools/LATEST_READ_FAILURE_PROBE.md)：原8组参数完成一次真实局部复现；随后单会话验证容器25/合同5、字段SyntaxError、字段0命中与对照5条读取。0模型，浏览器finally关闭。模型自行定位是否改善尚待局部真实模型验收。
- [失败只读查询分类](evidence/browser-use-dom-tools/FAILED_LOOKUP_COVERAGE.md)：原source只消除两条错误的successful_action_result_required，其他gaps、segments、outputAssembly、原source字节不变；TS同页边界与关键反例通过。无候选，无成功标记改写。
- 两项均经root代码与产物审阅；诊断/反馈agent `01a0ac69-abfd-7c12-8674-3dcc16783a0b`、lookup agent `01a0ac6b-938b-74e3-8152-fca7b47c4a11` 已正式归档。实际turn_context均为Sol/high。

- 原生input.text保全亦完成主审与生产函数正反例验证，见 [INPUT_TEXT_PRESERVATION](evidence/browser-use-dom-tools/INPUT_TEXT_PRESERVATION.md)。仅增该字段，运行输入绑定仍优先，空串合法；占位符经生产/消费两端拒绝，后态用现有摘要比对。执行agent `01a0ac7a-972f-7ec3-ab9a-72209bc11c5d` 的Sol/high已由root读取turn_context核验并归档。
- 三项修复集中锁定sourceDigest `dc9239489cb78b696a54f2512432cc69522108e02f21066f1e234b9465cf47e6`；所有未分配fork文件hash保持，setup --check通过。准备局部真实模型取数，尚无新的正式source成功。

## 局部真实模型验收未通过后的补救决定

`9c37ce25-94eb-4249-aec4-beb3a8d1ba77` 约236秒自然结束，19次agent+1次judge都成功返回。实际2次bat_read_fields均失败、0份verified_natural_read；native success/judged=true却自行拼了5条结果，时间缺Updated上下文。编译器以output_assembly_incomplete拒绝，局部验收不通过。navigate URL不等于传入input已被脱敏，不能证明精准导航；不猜URL原文。完整脱敏源及cleanup见 LOCAL_MODEL_FIELD_READ.md。

提示补充没有解决真实父子层级不可见的问题。决定不新增模型输入字段或新工具，给原生find_elements的返回补一份**首个匹配元素的真实局部结构**：元素自身、祖先链、直接子元素，使用浏览器原生DOM属性；不递归导出全页或子树HTML、不返回input.value/任意属性/文本正文、不设置128式任意字节截断。所有直接子元素均反映真实数量与位置，子元素自身只描述tag、结构attrs、在父节点中的位置、childrenCount，明确这是一层结构而非完整子树。原生查询文本/结果/状态保留；辅助结构失败不得改写原操作成功失败。

Product Alignment:
- natural-language task: 列表字段读取或表单控件定位时，需要真实DOM层级而非扁平显示树猜测。
- reusable chain boundary: 仅首次探索的原生find_elements只读诊断，不生成复跑业务节点。
- runtime inputs: 原find_elements参数与已有任务输入，不增LLM字段。
- dynamic task outputs: 无新增；正式数据仍只能来自bat_read_fields。
- generic platform capability used: 原生Tools.act结果适配与Page.evaluate的固定DOM读取。
- replay model calls: 0；此工具仍为agent_internal。
- site/task-specific code added: no。

实现所有权：新hybrid/find_elements_context.py薄适配，现有action_dispatch.bind_tools_act调用原操作后补上下文（可选browser参数），author_step仅传入browser，guidance补一句如何使用新增结构。查询和渲染/浏览器生命周期仍由原生组件拥有。复用依据是已实际inspect的原生find_elements只返回tag/text/请求attrs/children_count，无祖先父子关系；新适配只补这个已证实缺口。固定脚本只读querySelector/parentElement/children/getAttribute；属性限定既有结构属性及aria-label，不读取Cookie/Profile/input.value/任意页面脚本。一次0模型真实页面验证层级与native结果不变，再用相同局部模型任务复验；不得再直接跑完整主线去试取数。
