# 原任务系统复跑验收（2026-10-06 续作）

> 2026-10-06 用户纠正：系统独立验收未通过。以下五项执行、图文显示与关闭证据来自多轮开发介入，历史窗口还使用外部维护脚本；结束节点入口未覆盖且用户现场报告无响应。原“完整验收”表述撤回，以[快照记录与冻结验收标准](CHECKPOINT_20261006_NOT_ACCEPTED.md)为准。

## 当前验收门（2026-10-06 完整执行、UI与物理关闭）

原任务已取得完整系统执行证据：准备样本、独立复验、不可变发布v1、正式五项结果、0模型调用、保存原图UI与原owner物理窗口关闭。用户满意度仍是独立事实；首次正式输入超时根因尚未确证，不能把重跑通过写成无故障保证。

| 阶段 | 真实记录 | 结论 |
| --- | --- | --- |
| 完整样本 | d4cd0cc0-b33d-4f8c-830d-f6ee367e6f3b | 五项完成，0LLM；原清理误确认，现维护关闭并核验租约ended |
| 独立复验首败 | 028ac357-4966-40e8-84f9-0cb97e62dcda | SDK初始目标会话缺失，无业务动作；cleanup confirmed |
| 独立复验重跑 | 7c0c4bfb-b453-4833-8fa6-c002dba0f010 | 五项完成，0LLM；原清理误确认，现维护关闭并核验租约ended |
| 正常发布 | f2e899dd-5ae5-4b86-8e4d-58c6d45133e6 v1 | 发布完成，原需求v1/r2与固定来源不改 |
| 正式运行首败 | 8f6a0cf0-c1f5-44f6-8620-d042b92852cd | sources/s-a-0002 TimeoutError，无单项；cleanup confirmed |
| 正式运行重跑 | d8067258-0bcd-4904-8ce9-86dcb05dca68 | 五项完成；48 transitions/69 browser commands/6 invocations/0LLM |
| 正式物理关闭 | 同execution，sequence189 | 正常handoff/end成功，6目标租约ended、browserHandoff ended、原窗口消失 |
| 真实工作台 | 本次发布V1、同execution | 五条保存成果可打开；首条30张原图可加载；0 pageerror；重启后完成画布7秒加载 |

样本及独立复验逐份核验：同一item链调用五次、顺序一致，selected_live_region完整覆盖，原图30/51/26/40/37张且全部解码非空，原参数与包装清单保留。产物中的空placeholder是完整内容前的空兄弟节点，不能仅按字符串存在断言懒加载缺失。私有证明在work/jd-rev4-sample-proof.json及work/jd-rev4-verification-proof.json；Git文档不复制页面原文或图片字节。

正式五条输出也已按同样方式核对：来源序号与单项输入一致、同链复用、selected_live_region完整、原文字/表格/图片保留，30/51/26/40/37张图字节全部非空。证明work/jd-formal-v1-proof.json；实际截图work/jd-formal-completed-canvas.png、work/jd-formal-saved-result.png。完整原始内容留在本地成果，不复制到Git。

真实UI首验45秒超时，CPU采样定位到任务列表投影重复解析大输出。只缓存同SQLite事实版本的轻量摘要后，暖列表31/16ms，成果UI和最终画布通过。此结论不表示整个大数据存储已优化。

物理清理首败链完整保留：close协议/child退出超时→process_tree确认但activeResources=false被旧代码误当关闭→离线end缺控制器释放证明→服务重启旧端口拒绝→relay内存映射丢失、空枚举不能证明关闭。分别适配既有退出审计、授权连接入口和Chrome原生targetId关闭；不改任务内容或历史执行结果。正式窗口正常API关闭；两个旧样本按首次runner审计、确定owner与进程树退出事实，用既有runtime维护关闭，DB历史未改写。当前所有京东任务窗口消失，工作台窗口保留；诊断浏览器和扩展管理窗口已关闭。

必要验证：运行诊断Python11/TS9；列表摘要1；图文显示2；关闭恢复9；传输选择1；目标恢复与relay隔离3；扩展构建、API/Workbench类型检查通过。保留旧cleanup测试文件2项fixture失败及旧目标解析文件1项既有read_fields断言失败，未跑全量。对抗review发现并修复退出条件遗漏和合法session绕过target归属P1；最终窄复审无确定P1/P2。

正式首败目前仅有TimeoutError，未证明具体根因；重跑前只补充固定源码标签/行号，未改浏览器动作或增加重试。用户手动关闭浏览器时间未核实，因此连接首败不归因于缓存或用户关闭。当前服务PID20760，4173/4175同一进程，master/0fc8ff22，保留无关脏代码、无worktree/提交/推送。BrowserSkill全面生产连接替换仍按用户指令后置；当前固定Playwright连接+B-U动作的事实不能冒称已全部替换。

范围限制：历史非发布样本错误清理此次已维护关闭，尚未把所有历史准备期租约做自动迁移；遗留记录不表示仍有物理窗口。以下均为历史阶段事实，不覆盖本节结论。

## 最新证据（后续条目保留历史首次失败）

- 8f06d1dc-27ab-4aac-8887-50661bc92211：正确详情区域读取完成，selected_live_region、30张原图，包含原参数文本；内容回执摘要dcdb3a7e63639127b871817c794d83f892595be8a4d5d4b14edba83cfa7efbff。不是整个body。两个scroll(index)因适配遗漏目标绑定阻止编译，来源及会话均已关闭。
- 2b2949db-711c-47db-803e-88d8abb5f84b：修复可选目标适配后离线编译rev3；样本8cc9015a-b04f-446a-848d-95eeb34e456e在sources/input失败target_value_fact_mismatch。0LLM，cleanup confirmed，未进入单项。
- eeaa040b-db2b-4447-8331-6bd05cdb38e2：值检查复用已有有界等待后离线生成rev4，checksum4b1361fc0e5bffc6ef7ff1349a976c23a9a314a64f3021f4d6bdd5f9fc555366；样本d4cd0cc0-b33d-4f8c-830d-f6ee367e6f3b已完成sources、正在item。尚无完整任务通过结论。
- 当前服务PID17892；原生探索/普通复跑均成功连接Chrome，BrowserSkill全面替换仍后置。源码依据、主节点生成接线与对抗审查见[系统底账](MAINLINE_SYSTEM_AUDIT_20261006.md)。

## 当前事实与范围

保留 master / 0fc8ff22 的现有脏代码，复用 4173/4175 的 PID14924 服务；没有创建 worktree、提交或重启服务。原任务 2aaa0674-ce91-462a-bce4-c21502ce755c 保持需求 v1/r2。BrowserSkill 原生会话 ytbo 的人工前置检查已结束，session stop 成功；该检查没有产生 B-A-T 发布链，也不作为业务验收。

系统 prepare_task 新建 6dd44720-c84f-435d-8fbd-84bc2b2a576d。来源代表执行完成、10 个原生动作，但在线编译拒绝 a-0003：collection_selection_read_required。原来源保存在 artifact aa3d82fc-6179-4da4-86f6-f4ff5e2df980。该动作点击联想列表 li[2]，搜索词由洗碗机变为洗碗机小型，a-0004/5 才改回并提交。不是普通提交按钮被误判，不能解除动态集合绑定要求。未进入单项探索，未发布。

## 本次最小改动依据

Product Alignment:
- natural-language task: 在已确认来源按原输入搜索并执行重复的页面内容任务
- reusable chain boundary: 保持来源方法与逐项方法，修正传给原生探索 Agent 的合同说明
- runtime inputs: 原确认词与原生浏览器当前观察
- dynamic task outputs: 实际入口集合、每项原始内容
- generic platform capability used: B-U 原生 input/click/send_keys 和既有区域采集工具
- replay model calls: 不新增；正式普通节点仍为 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 已确认输入提交及既有采集工具的探索说明
- existing implementation in repository: author.py 使用原生 Agent/Tools；内容工具公开 regions/readRef，内部 container 仅兼容历史
- mature candidates and pinned versions: browser-use 0.13.8，固定 eb4126921bea3373f91afc49fb4b59d6eda7fed6
- selected implementation: 保留原生 Agent 与 Tools，仅通过已有 extend_system_message 传递 B-A-T 合同
- reused public surface: Tools.input、Tools.click、Tools.send_keys；不增加动作实现、重试或选择器框架
- B-A-T-owned adapter and remaining gap: 明确原词不能被联想词替换；纠正旧 only-container 说明。历史误选轨迹不改写、不强制编译
- license/runtime/platform fit: 已有 MIT Python 依赖，无新增库或运行时
- browser/runtime/state ownership conflicts: 无浏览器连接修改；BrowserSkill 生产 CDP 兼容仍未证明，当前未宣称替换完成
- replay model calls: 0 新增
- rejected candidates and evidence: 不接受跳过 collection_selection_read_required；a-0003 的联想项没有可复跑选择绑定
- focused validation: 源码登记核验；在同一原任务的新 prepare 中检验来源及单项，再通过试跑、发布和正式执行验收；不增加提示词镜像测试

固定上游源码：[Tools 输入、点击和按键](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py)，input 行719、send_keys 行1356。这些是直接复用的原生能力；新增的原词保持要求属于 B-A-T 已确认需求的约束，不冒称上游已有该业务规则。

旧区域说明与现有工具合同不一致：author.py 声称 only container，实际工具公开 regions，先前 62a122c9 已因唯一父容器要求退出。此次只同步说明，不改采集实现。既有实现与其源码依据见 MODULE_DELIVERY_REPAIR_20261006.md。

对抗审查首轮指出新增说明仍列出内部兼容的 container，但其 SkipJsonSchema 不允许模型看到该参数；已纠正为只使用公开 regions（单个容器也传该字段）。修正前启动的 d70a0003 使用的是 container-or-regions 说明，不能声称其已加载最终说明；不因此取消正在进行的原生探索。

## 验收门

原任务完整五项原始详情、独立试跑、不可变发布、正式运行输出及 0 隐式模型调用均待取得；上述原生访问和来源代表执行不能替代这些结果。修改后安排对抗 subagent 复核，保留首次失败。

## d70a0003 的原生点击适配断点

来源方法成功，单项方法也取得原始内容；单项 artifact cfa70f29-f426-4150-8526-60cafb87f7b8，最终编译只缺 a-0002 的 natural_postcondition_evidence_missing。此动作已绑定当前输入条目内部目标，原生 Tools.act 返回 Clicked div，捕获到目标对应的 click（isTrusted=false），前后仍为同一文档；下一点击才进入详情。旧编译仅允许已命名固定控件按原生回执继续，遗漏已校验输入条目。不能把该回执解释为已经进入详情或任务完成，也不能删除历史动作。

固定源码：B-U 同一 eb4126921bea3373f91afc49fb4b59d6eda7fed6 的 [Tools._click_by_index](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/tools/service.py#L653) 将点击派发给原事件处理器；[DefaultActionWatchdog](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/watchdogs/default_action_watchdog.py#L733) 自带原生 JavaScript click 后备。因此 isTrusted=false 不能单独否认上游已执行动作。

Product Alignment:
- natural-language task: 对来源读取产生的条目执行详情访问或后台记录操作
- reusable chain boundary: 保持原动作顺序及输入条目绑定；探索与复跑调用相同原生动作
- runtime inputs: 已验证 entryBinding 及当次解析出的目标
- dynamic task outputs: 原输出与动作审计，不把点击回执当作业务输出
- generic platform capability used: 原生 B-U Tools.act / ClickElementEvent
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 原生点击及其 B-A-T 编译准入
- existing implementation in repository: 探索使用 Tools.act，复跑却分派到 physical_input；fixed_control_dispatch 仅接受命名历史目标
- mature candidates and pinned versions: browser-use 0.13.8 / eb4126921bea3373f91afc49fb4b59d6eda7fed6
- selected implementation: 点击直接调用已有 Tools.act；由原生 watchdog 拥有点击实现和后备
- reused public surface: Tools.act，现有原生 ActionResult；不复制 upstream JS 或 CDP 点击算法
- B-A-T-owned adapter and remaining gap: 将已绑定 entry 的派发、结果、目标事件和未变文档映射成动作节点；不新造完成 judge
- license/runtime/platform fit: 已有 MIT Python 依赖；本机同一 browser/session
- browser/runtime/state ownership conflicts: 保留 owner、目标解析、事件命中、原结果错误和后续显式条件；不改 Chrome 连接管理
- replay model calls: 0
- rejected candidates and evidence: 单独物理点击路径与原生探索不等价；直接放行无目标回执或无绑定动态点击仍拒绝
- focused validation: 定点回归保护原生单次派发、无绑定/错误/错目标拒绝；离线使用原来源编译，然后进入原系统 sample/verification/formal

既有 physical_input 文件先保留为未调用的历史实现及测试，不删除未审计的其它用途；本轮只移除 OrdinaryCapability 的分派入口。原生动作实现仍负责其错误，不在宿主新增重试。

## 用户纠偏后：取消统一强制页面后置条件

上节针对 entry 的例外不是最终方案。基础错误还存在于 naturalDeterministic / hybridCommand 的 postconditions.min(1) 和 Python declared_checks 的空条件拒绝：普通动作必须额外找到页面效果才能进入 IR。改为普通原生动作允许空的附加页面条件，源记录必须有对应 Tools.act 派发和结果；需要 DOM 目标的动作仍必须证明事件对应目标。已有导航绑定、输入值、消费者就绪、显式条件继续使用原合同；不新增全局 judge。旧来源/发布链不改写。

Product Alignment:
- natural-language task: 任意原生点击、按键、滚动等操作组成的复跑任务
- reusable chain boundary: 一次已绑定原生动作，无需凭空增加页面变化条件
- runtime inputs: 原动作参数、已验证稳定目标
- dynamic task outputs: 原生执行结果及任务原有输出
- generic platform capability used: 固定 B-U Tools.act 的动作执行/错误语义
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment:
- capability: 普通动作成功与附加页面条件分离
- existing implementation in repository: B-U 已负责动作，B-A-T 三处边界强制非空 postconditions
- mature candidates and pinned versions: browser-use eb4126921bea3373f91afc49fb4b59d6eda7fed6，源码链接同上
- selected implementation: 继续调用原 Tools.act；删除宿主强制页面后态门槛
- reused public surface: 原 ActionResult、Tools.act、现有实际派发回执
- B-A-T-owned adapter and remaining gap: 将派发事实映射到 IR 证据；不靠每种网站或控件的例外放行
- license/runtime/platform fit: 现有 MIT Python / TypeScript 适配边界
- browser/runtime/state ownership conflicts: 不替换浏览器连接；依旧一运行一会话，错目标/原生错误不能成功
- replay model calls: 0
- rejected candidates and evidence: entry 专用准入只能修一个例子，不能消除强制页面效果的结构性问题
- focused validation: 同一原生点击来源离线编译、空条件跨语言准入、错误与错目标拒绝；随后原任务正式执行

离线恢复另有项目生命周期错误：旧草稿 f2429fe9 的更新时间早于本次准备，普通 prepare 允许替换它，recover 却只因它存在就拒绝。恢复沿原 createTaskDraft 路径，仅保留“准备开始后出现或被修改的草稿”冲突保护；不直接删数据库草稿，不改旧失败记录。该规则属于 B-A-T 自有版本生命周期，不新增通用组件。

离线恢复 0de5d4b2 的全部动作已经通过新编译，唯一剩余 gap 是原 sourceGaps 保存的 hybrid_compilation_host_rejected。AuthorCompilation.finish/save 将上一次终态编译/保存失败编码为 invalid_source；compile_offline 又永久传入新编译。此次在 B-A-T 离线适配层，只对 completed trace 重新判定这些无 action/clause 的已知编译终态标记；原 artifact、真实来源缺失、身份校验、当前编译和宿主准入保持有效。这是项目自身持久化生命周期适配，依据是上述现有生产者/消费者源码，不新增通用编译器或框架。必要验证覆盖未完成来源、真实来源缺口保留和完整原记录重新编译。

775e278a 离线恢复成功生成草稿 revision1。其首个 sample 0df9a7d6 在 Python StepCommand 的遗漏 min_length=1 拒绝，保留首次失败；真实 COMMAND 边界已修正并验证。新 trial 1ab5fd4c 来源步骤完成且 0 模型，但单项在自写的物理命中准备中 target_hit_blocked，尚未到 Tools.act。

同一原生动作复用整改继续覆盖派发前入口：普通动作的目标准备只负责稳定目标到当前原生 index 的映射及文档身份，把物理可操作性、滚动和点击后备交回 B-U eb41269 DefaultActionWatchdog（同上源码，733/803行后备）。显式 target-readiness 查询保留其原检查语义；不改成点击成功，也不生成新动作。这属于前述 Reuse Assessment 的 B-A-T 适配层缩减，不新增通用动作算法。最小验证保护物理检查不会抢先阻止原生派发、实际错目标/原生错误仍拒绝，再复跑同一草稿。

a404bbb1 已完成来源及详情点击，随后 s-a-0005 原生滚动后的消费者读取失败 target_scope_mismatch：编译映射只对有 target 的节点产生 runtimeScopeFrom，无 target 的动作读取条件仍带代表 URL；已有 scrollReadCondition 也只识别 transition，遗漏当前 ready。修复属于 B-A-T 独有的参数化 IR 映射，统一让无 target、唯一且有已验证来源的消费者读取参与现有 scope 归属算法；仍要求源边界 URL digest 对应动作前观察，运行时核验前驱、session/tab/document，不放行另一目的页。用于滚动后内容读取及按键后的表单读取两类任务，0 模型，不新增站点逻辑或调度算法。

试跑失败后的离线恢复一并沿现有持久化引用补齐：只接受 failed prepare 的编译/样本/复验阶段；存在 job.preparation.draft 时核验当前草稿 id/revision/checksum 完全相同；已恢复的 job 使用其明确 recoveredFromJobId 指向原来源 owner，原有 source artifact 身份/digest/requirement/plan/input 核验继续有效。不搜索历史“可用”来源，不把派生 job 冒充 artifact owner。18项定点通过；类型检查首轮因新测试联合类型未收窄失败，增加与已有测试一致的属性存在断言后重查。

bbee1607 离线恢复产生 revision2；e93379e7 已越过旧 URL 绑定，新的唯一失败为 read_fields_projection_not_stable：72次有界检查均能读取、前后session/tab/document/URL保持一致，但 ready 错误地额外比较整个内容摘要。固定 B-U 同一 Tools.service.py 的 extract 在1015行取得一次原生内容快照，没有全页字节冻结要求。这里继续复用现有受管读取及原生转换，不引入模型；只移除 ready 的两次全内容相等要求。transition 的既有变化检查保留；文档身份、字段合同、原图加载/资源读取仍由原读取入口核验。适用于动态内容存档及实时数值读取，属于 B-A-T 条件映射纠偏，不是网站分支。

6140d8cb 在同一 revision2 链路普通执行中连续完成前两项，第三项 content_image_resource_missing，LLM=0。业务核对另有确切问题：原代表 regions=body，产物含全页导航/评论，detail-main 没有内容；不能用116张图片或两项技术完成代替目标区域完成。此次只收紧现有 Agent 指导：特定区域任务必须通过原生观察定位并确认相关内容可见，不能以整个body或空占位替代。继续复用同一 B-U Agent loop / native actions / bat_read_fields，不添加网站类型或完成judge；需要新的代表执行纠正方法，旧来源只能用于历史基础设施验证。

6cc4b8f1 新准备失败，保留 sequence172。来源列表读取成功；单项原生点击、滚动已显示详情，但 find_elements 查询的占位节点为空。Agent 没有取得内容读取回执即 done(false)，没有生成新的有效草稿。Chrome 无连接失败，也没有人工登录/验证码阻塞。

进一步定点核验固定 B-U eb4126921bea3373f91afc49fb4b59d6eda7fed6 的 tools/service.py：search_page 在184–257行使用原生 DOM TreeWalker 返回命中文字的完整 element_path，1191–1224行注册为现成原生动作；find_elements 在259–299行返回属性、文字及 children_count。两者已在 registry 开放，search_page 已有 observation-only 编译分类。因此不扩充自写选择器推导，只通过现有 extend_system_message 指导 Agent 使用已观察文字的原生路径核对实际区域，再用现有 regions 捕获。该调整沿用上文 Product Alignment / Reuse Assessment；公共能力直接来自固定上游，B-A-T 只说明自身输入合同。提示词变更只检查来源清单，不新增镜像测试；真实新代表执行是必要验证。
