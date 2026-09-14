# 开发进度

## 稳定通用任务链迭代（2026-09-14）

状态：代码实现和本地定点验证通过；最后一次真实运行在京东首页验证码处按规则停止，真实业务任务未完成。

- 公共新链使用 `stable/v1`，只允许 `capability | llm | branch | loop | invoke | terminal`。浏览器动作和动作后采集合并为 `browser.perform@1`，循环体只保存一份；旧节点模型保持只读兼容。
- 计划先划分步骤，再按 `once`、`each`、`batch` 探索代表输入。`batch` 把整份集合交给一条含显式 `loop` 的链；发现步骤不得提前逐项进入详情。计划字段合同保留真实输入字段与基础类型，不冻结样本值。
- 轨迹编译只消费成功且被结果引用的证据，使用语义节点 ID，折叠动作与紧邻观察，拒绝没有循环的多项同构映射。候选先自动样本复跑；本地修复最多一轮且复用原轨迹。
- 来源访问门按可注册域持久计量并覆盖探索、验证和正式复跑；本地 `origin_denied` 不会伪装成外部限流或验证码。
- 最终定点回归通过：contracts 8 项、runtime 16 项、browser 34 项、API 56 项、Workbench 2 项；相关 TypeScript 检查和 `git diff --check` 全部通过。按规则未重复运行根级或 API 全量测试。
- 先前用本地假页面跑“评论弹框”示例只能证明 adapter 与运行器可以执行夹具，不是用户要求的真实业务任务；该脚本和命令入口已经删除，也不再列作验收证据。
- 最新运行已修复 `www` 到同站验证域的错误拒绝：系统真实观察到“京东验证 / 验证一下，购物无忧 / 快速验证”，只发起一次人工等待。用户不在电脑前，运行按规则取消，没有绕过或继续访问；结果仍为 0/10。取消后所属会话已清理，当前无 BrowserSkill 活动会话。
- 传输层已改为取消长命令时先向 CLI 发送中断并等待退出，避免 daemon 保留 busy 命令；真实取消发生在补丁前，补丁后只完成本地传输验证，没有再次访问京东。
- 当前必须在用户在场时从验证码后继续完成真实计划→稳定链→样本→换输入→正式执行。完整证据和后续入口见 [当前结果结论](CURRENT_RESULT_2026-09-14.md)。
- 完整设计和证据边界见 [稳定通用任务链节点迭代说明](STABLE_TASK_CHAIN_ITERATION.md)。

## P1–P6 实施中（2026-09-13）

### 海尔洗碗机真实任务结论（2026-09-14）

- 已确认任务 `286cc4db-d02e-4c11-bcf2-d97421368baf`，需求 `d0ecd3b4-dc3c-4005-80dc-076af071eb4c` v1。最终采用计划 `f228a8c7-b2a6-4852-899b-e4a7c687486a` v5：一次发现 + 对当次发现集合逐项复用详情链；没有 URL resolver 中间步骤，`each.onItemFailure=continue`，外部访问中断仍由宿主熔断。
- BrowserSkill 0.2.1 doctor 全部通过。三个真实探索分别只创建一个控制会话，BrowserRun 为 `60ab4f03-08b4-4b5c-86a5-473d66d7a2af`、`a04f0fbf-a658-436e-806a-94f86dacb3c4`、`b414f16a-5c6d-472f-8db5-f382ddc61ac3`；三者均已 finally 关闭，最终官方 session list 为空。
- 真实页面没有出现登录失效、验证码、频控、拒绝访问或机器人验证。受控 `click dispatch=dom` 在 v4/v5 中真实把已填搜索框提交到 `search.jd.com`；没有通过脚本构造 URL，也没有绕过站点限制。
- v4 同一次搜索页观察得到 10 个不同可见型号，但没有详情 href；代表商品普通点击仍停留搜索页。v4 计划把 role/name 合并为 opaque locator，编译器以 `annotation_sample_binding_mismatch` 拒绝。v5 已把 `detailUrl` 与 role/name/occurrence 设计成独立可选字段，但 Pi 在 page 后 generation 结束而未调用 `complete_step`，宿主以 `exploration_business_result_missing` 拒绝。
- 本次没有形成可验收链路，没有 E3/E4 或正式 10 项复跑；未取得详情 URL、价格、完整规格或评论，不能输出购买建议。真实候选、不足边界和三次作业审计见 [任务结果](../results/2026-09-14-haier-dishwasher.md)。
- 本轮聚焦验证：Browser/API/Runtime typecheck 通过；同次运行标签复用 1/1、恢复入口编译 1/1、受控 DOM 激活 1/1、Runtime TaskChain 15/15；`git diff --check` 无格式错误，仅有现有 CRLF 提示。未运行根级或全量测试。

P1 Product Alignment:
- natural-language task: 用代表输入完成一次读页面或交互任务
- reusable chain boundary: Pi 工具会话提供首次探索，后续阶段从证据编译单一 TaskChain
- runtime inputs: 已确认步骤的动态输入
- dynamic task outputs: 步骤输出合同要求的业务结果
- generic platform capability used: AI Connect 已选账号、Pi AgentSession、BrowserSkill 和现有仓储
- replay model calls: 普通节点为 0；本阶段只改变探索
- site/task-specific code added: no

P1 验证：API typecheck 通过；exploration-agent 3/3，活动预算定向测试 1/1。替身验证多次工具、业务回答、非法参数/未授权动作拒绝、取消、事件转发、无重试和 finally 关闭。共享 Pi 发布制品公共类型支持 MainModelTool.execute/tools，无需修改相邻项目；尚无真实模型证据。

P1 Cleanup Evidence:
- replaced capability: 宿主手写模型命令循环已替换为现有 provider 的 Pi exploration 用途
- deleted symbols/files/tests/docs: explorationDecisionSchema、explorationDecision、固定 12 轮循环及其 prompt；预算 fixture 改为 Pi surface
- kept mature components: AI Connect/Pi、BrowserSkill、TaskChain、LangGraph、SQLite/Drizzle、Workbench
- legacy data treatment: 未读写用户 SQLite，保留全部历史
- dead references checked with: CodeGraph callers（旧符号不存在）；完整 IR 生成仍待 P3/P4 替代
- dependency/lockfile result: 无变化
- services and browser sessions closed: 本轮尚未启动
- validation passed: API 类型检查及上述 4 条测试；diff check 无格式错误
- baseline failures: 未扩大验证，无新基线结论
- environment blockers: 无
- untested: 真实模型、浏览器、P2–P6；新业务结果/provenance 协议待 P2

P2 Product Alignment:
- natural-language task: 读取结构化页面字段，或操作控件后验证状态
- reusable chain boundary: 同一受控工具桥记录可复现的动作、观察和结果来源
- runtime inputs: 动态 URL、语义目标与输入值
- dynamic task outputs: 按步骤合同声明的任意业务字段和 provenance
- generic platform capability used: BrowserSkill 官方读取/定位、Zod、类型化工具轨迹
- replay model calls: 普通读取和动作 0；推断必须显式声明
- site/task-specific code added: no

P2 验证与清理：Browser/API 类型检查通过；结构读取 2/2、来源协议 2/2，adapter 8 条原有行为通过，改写后的 target 定向测试 1/1。开发时发现的 ESM 循环依赖已修复。删除 RuntimeExplorationTrace 和旧 target 恒拒绝错误码；新增内部 trace/provenance 及 complete 工具，旧 SQLite 未改。唯一新增依赖 cheerio@1.2.0；成熟框架继续保留。get-html 的实际响应与站点数据 P6 尚未验收。工具失败轨迹的持久化及作业阶段 P5 接入。

P3 Product Alignment:
- natural-language task: 从简短目标拆分可组合读页面或交互步骤
- reusable chain boundary: 语义计划声明单步骤合同，编译注解只引用已发生轨迹
- runtime inputs: 用户输入或前置步骤输出
- dynamic task outputs: 需求动态合同与逐字段 provenance
- generic platform capability used: Zod、现有 TaskPlan、AI Connect 与 Pi
- replay model calls: 普通节点 0；推断来源需显式 llm
- site/task-specific code added: no

P3 验证与清理：API 类型检查、编译注解测试 2/2 通过。语义计划已删除模型 budget 入口及 plan repair；注解只接受真实事件/输入/来源/有界重复/完成事实，不允许 nodes、script、budget。完整 chain 候选路径在紧接的 P4 编译器通过后删除；P3 没有启动产品模型。计划持久合同仍有技术字段，暂存宿主能力上界，实际链路预算由 P4 图推导。

P4 Product Alignment:
- natural-language task: 将成功的读页面或交互轨迹变为可复跑步骤
- reusable chain boundary: 相同证据确定性生成唯一 TaskChain
- runtime inputs: 轨迹注解绑定的动态输入与有界循环元素
- dynamic task outputs: 逐字段来源组装，推断字段显式 llm
- generic platform capability used: 现有 TaskChain、compileTaskChain、data、loop、checkpoint、emit、LangGraph
- replay model calls: 普通节点 0；仅显式 llm
- site/task-specific code added: no

P4 验证与清理：API/runtime 类型检查通过；trace-compiler 4/4，覆盖稳定等价图、换输入、嵌套字段组装、普通零模型、推断显式 llm、失败轨迹拒绝及有界交互循环。删除 chainCandidateSchema、chainPrompt、chainRepairPrompt、materializeChain 和候选修补；新增通用 data transform/assemble，仍由现有 runtime 执行。循环内输出暂不具备集合 provenance 的情况明确拒绝，不伪装成已支持。原 API 服务旧 candidate/repair fixture 将在 P5 接口验证中迁移，尚未称其通过。

P5 Product Alignment:
- natural-language task: 用户查看探索结果、候选验证和换输入复跑结果
- reusable chain boundary: 同一 chain lineage，样本/换输入独立运行，恢复保持原运行身份
- runtime inputs: 版本绑定及动态任务输入
- dynamic task outputs: 业务结果、来源、失败层级、技术消费
- generic platform capability used: 现有 repository、service、SQLite/Drizzle、Workbench、公共合同
- replay model calls: 显式 llm 独立审计，探索与编译会话另记
- site/task-specific code added: no

P5 验证与清理：API 闭环 3/3（新 authoring、独立双输入验证、正式队列、人工同运行恢复、旧字节只读、重启收敛）；Workbench 投影/连接 5/5；contracts/API/Workbench 类型检查通过。job 保存探索/注解/E1/E2/错误层与分离消费，UI 从真实验证证据推导 E3/E4。新增生成取消、验证同运行恢复入口。Pi 会话数与 Provider 请求数分开，Provider 内部调用总数未知保留 null。each 总/步骤预算从编译图乘以业务调用上限，不再复用单次上限。旧完整图/repair API fixture 已移除并改用 Pi browser/complete 与紧凑注解。没有更改历史 SQLite；真实 Provider、BrowserSkill 响应和站点验收进入 P6。

P6 Product Alignment:
- natural-language task: 简短京东详情需求、不同 URL 同链复跑、品牌 10 型号及非采集任务
- reusable chain boundary: 一次探索产生一条详情链；发现链输出集合，逐项调用同一详情版本
- runtime inputs: 真实代表 URL、未探索 URL、发现得到的输入集合
- dynamic task outputs: 已确认需求动态字段、逐字段来源和运行事实
- generic platform capability used: 产品 AI Connect/Pi、BrowserSkill、正式编译器/运行器/仓储/Workbench
- replay model calls: 按正式运行审计核验；推断仅显式 llm
- site/task-specific code added: no

P6 动态入口参数 Product Alignment:
- natural-language task: 从用户指定的网站入口开始执行任意浏览器任务，但需求正文只写了站点或入口名称而没有字面 URL
- reusable chain boundary: 首个浏览器步骤需要导航且需求没有可绑定公开 URL 时，计划声明必填 `startUrl`，由授权运行输入提供并绑定到首步骤；计划模型不得猜测或硬编码站点地址
- runtime inputs: 任意经用户授权的公开起始 URL 和该任务的其他动态参数
- dynamic task outputs: 从实际授权入口产生的步骤结果，或既有类型化授权/访问失败
- generic platform capability used: TaskPlan inputContract、ValueBinding、BrowserGrant 和既有 URL 来源校验
- replay model calls: 0；入口由运行输入绑定，普通导航节点不调用模型
- site/task-specific code added: no

P6 受控 DOM 激活回退 Product Alignment:
- natural-language task: 搜索、筛选或提交普通页面表单时，已定位控件的指针/键盘动作被页面吞掉但没有访问限制
- reusable chain boundary: 一次普通 click/press 后 fresh observation 仍无效果，且 fresh observe 已唯一确认语义目标或结构读取已确认标准 CSS 目标时，允许同一 typed click 使用一次 `dispatch=dom`；底层只执行固定 DOM 激活/表单提交表达式，不接受模型脚本
- runtime inputs: 任意已授权页面上的语义或标准 CSS 控件目标和既有动态表单值
- dynamic task outputs: 动作后的真实页面观察、真实落点，或既有类型化 missing/unsupported/访问失败
- generic platform capability used: BrowserCommand click、BrowserSkill evaluate、typed trace、Trace-to-Graph 与 BrowserGrant
- replay model calls: 0；固定表达式属于受控浏览器动作
- site/task-specific code added: no

P6 断电恢复 Product Alignment:
- natural-language task: 浏览器任务运行中断电后恢复，并继续执行同一类已授权任务
- reusable chain boundary: 浏览器所有权日志只在官方会话枚举证明没有活动会话时解除损坏占用
- runtime inputs: 任意任务的 BrowserGrant 与 BrowserSkill 活动会话集合
- dynamic task outputs: 新运行的正常结果，或保留 `cleanup_required` 的受控失败
- generic platform capability used: BrowserHost、BrowserJournal、BrowserSkill 官方 session list 与原有审计
- replay model calls: 0
- site/task-specific code added: no

P6 访问压力保护 Product Alignment:
- natural-language task: 对一组动态页面输入稳定复跑，遇到认证失效、验证、限流、拒绝访问或瞬时传输故障时保留进度并停止继续施压来源
- reusable chain boundary: 每个稳定输入只调度一次；首次探索在首个外部访问中断后拒绝后续浏览器命令；浏览器节点把中断作为类型化事实写入运行，同一计划执行立即熔断剩余输入
- runtime inputs: 任意页面 URL、稳定来源键和授权时固定的链路输入
- dynamic task outputs: 已完成输入结果、外部中断类别、公开 origin/HTTP 状态及检查点
- generic platform capability used: TaskPlan each、TaskChain invoke、BrowserSession 网络事实、LangGraph 检查点和现有 SQLite 运行事实
- replay model calls: 0；访问中断分类和熔断不调用模型
- site/task-specific code added: no

P6 大页面探索编译 Product Alignment:
- natural-language task: 从大型动态页面读取可用字段，在探索包含无效探针时仍从明确选择的成功事件编译可复跑链路
- reusable chain boundary: HTML 快照截断作为显式不完整事实返回；编译注解按原顺序声明正式复跑采用的成功事件，失败探针继续留在探索审计中
- runtime inputs: 任意授权页面输入、结构化读取选择器和持久探索轨迹
- dynamic task outputs: 部分或完整结构化读取、逐字段来源、显式复跑事件集合及候选链路
- generic platform capability used: BrowserSkill get-html、Cheerio、Pi 紧凑注解、Trace-to-Graph 编译器
- replay model calls: 普通读取与浏览器动作 0；业务推断仅保留为显式 llm 节点
- site/task-specific code added: no

P6 可选交互与免重访重编译 Product Alignment:
- natural-language task: 同一页面任务在部分输入出现临时遮罩、部分输入没有遮罩时，均继续采集并验证最终结果
- reusable chain boundary: 编译注解只允许把无业务来源依赖的已成功目标交互标为“目标缺失可继续”；验证失败后复用同一份已关闭 E1 重新编译新版本，不再次访问来源页面
- runtime inputs: 任意已确认步骤输入、持久探索轨迹及换输入验证事实
- dynamic task outputs: 新链路版本、独立样本与换输入运行结果、原失败验证审计
- generic platform capability used: 类型化 node outcome、TaskChain edge、E1/E2 authoring、不可变版本仓储
- replay model calls: 普通节点 0；重编译只调用一次编译注解模型，业务推断仍只来自显式 llm 节点
- site/task-specific code added: no

P6 集合计划编写 Product Alignment:
- natural-language task: 先发现一组动态输入，再对每项复用同一浏览器流程并直接交付聚合结果
- reusable chain boundary: TaskPlan 只拆分有独立浏览器流程和数据依赖的步骤；`each` 步骤的计划级输出是单次合同的数组，完成条件在聚合作用域核验
- runtime inputs: 任意查询条件、业务数量和前置步骤产生的输入集合
- dynamic task outputs: 发现集合及逐项链路输出数组
- generic platform capability used: TaskPlan binding、`invocation.mode=each`、运行时集合聚合和完成谓词
- replay model calls: 普通浏览器节点 0；仅链路中显式 llm 节点可调用模型
- site/task-specific code added: no

P6 页面动作导航 Product Alignment:
- natural-language task: 点击或按键提交当前页面表单后，继续处理该页面声明的下一地址
- reusable chain boundary: 动作前核验当前页仍在授权范围；成功点击或按键改变地址或打开新活动标签后先检查网络中断，再只把浏览器实际落到的公开 origin 加入本会话，直接构造跨域 URL 仍拒绝
- runtime inputs: 任意已授权起始页、语义目标或标准 CSS 目标及动作输入
- dynamic task outputs: 动作后的真实页面状态、后续读取结果或类型化访问边界
- generic platform capability used: BrowserSession 语义动作、网络事实、会话 origin 证据、现有 BrowserGrant 与命令预算
- replay model calls: 0
- site/task-specific code added: no

P6 外部中断轨迹复用 Product Alignment:
- natural-language task: 来源访问中断修复后重新发起链路生成，并真正重新探索而不是反复编译旧失败现场
- reusable chain boundary: 已关闭且结果可核验的 E1 仍可免重访重编译；包含访问熔断错误的 E1 不进入复用候选
- runtime inputs: 任意持久探索轨迹、相同计划步骤与代表输入
- dynamic task outputs: 新 BrowserRun 或复用 E1 生成的新链路版本，以及准确失败层级
- generic platform capability used: 类型化 BrowserFailure、authoring job 仓储和既有访问熔断规则
- replay model calls: 0；重新探索属于新的显式 authoring 请求
- site/task-specific code added: no

P6 探索人工等待 Product Alignment:
- natural-language task: 任意首次浏览器探索在登录、验证码或访问限制现场暂停，用户完成正常人工处理后继续同一任务
- reusable chain boundary: Pi authoring job、BrowserRun、BrowserSkill 控制会话和 waitpoint 保持同一身份；Done 后 fresh observe 决定继续或保持阻断
- runtime inputs: 已确认步骤输入、当前真实标签页和类型化人工原因
- dynamic task outputs: 持久 waitpoint、恢复后的新观察、原探索业务结果与 provenance
- generic platform capability used: Pi AgentSession 工具 continuation、BrowserSkill request_help、TaskAuthoringJob、BrowserRecord 和现有授权边界
- replay model calls: 只发生在首次探索；冻结链普通复跑仍为 0，显式 llm 节点除外
- site/task-specific code added: no

P6 批量发现与代表输入收敛 Product Alignment:
- natural-language task: 从一个结果页发现一组动态链接，再对代表项完成可复用流程
- reusable chain boundary: 发现优先一次结构化读取当前页；点击开新页时浏览器只保留来源页和当前落点；each 代表输入以计划绑定的稳定键为权威
- runtime inputs: 任意来源页、动态候选集合、计划 stableKeyPath 及代表项
- dynamic task outputs: 有序候选集合、单项业务结果、聚合结果与 provenance
- generic platform capability used: Pi AgentSession、BrowserSkill page/read、受控标签页生命周期、TaskPlan binding
- replay model calls: 普通节点为 0；仅显式 llm 节点允许调用
- site/task-specific code added: no

P6 无链接语义目标解析 Product Alignment:
- natural-language task: 页面列出一组可点击资源但不公开落点链接，仍需取得每个动作的真实落点后继续处理
- reusable chain boundary: 先从一次页面观察产出有序语义目标集合，再逐项复用同一条“来源页 + 语义目标 → 实际落点”链，后续链只消费已观察到的落点
- runtime inputs: 任意来源页 URL、语义角色、可见名称和稳定业务键
- dynamic task outputs: 每个目标动作实际到达的公开 URL 及原输入身份
- generic platform capability used: TaskPlan each、Pi AgentSession、BrowserSkill 语义定位、动作后 fresh observation 和计划聚合
- replay model calls: 普通导航与点击为 0；从页面语义抽取动态目标时只允许显式 llm
- site/task-specific code added: no

P6 跨步骤浏览器事实授权 Product Alignment:
- natural-language task: 前一步点击得到真实页面 URL，后一步继续从该来源页或落点执行同类动作
- reusable chain boundary: 只把同一 BrowserSkill 会话已观察到的精确 URL 加入后续 navigate 集合；each authoring 只接受计划绑定的首个稳定键作为代表输入
- runtime inputs: 计划绑定的步骤输入、已观察 URL 和有界 each 集合
- dynamic task outputs: 动作后的 fresh observation、完整聚合或类型化外部阻断
- generic platform capability used: typed trace/provenance、BrowserGrant、TaskPlan binding、stableKeyPath 和完整任务探索
- replay model calls: 普通导航、动作、观察和聚合校验为 0
- site/task-specific code added: no

P6 人工升级证据 Product Alignment:
- natural-language task: 自动化流程自行修正局部参数或定位错误，只在当前页面真实要求登录、验证或人工确认时暂停
- reusable chain boundary: 局部失败后的直接 `request_help` 被拒绝；模型必须先取得新的成功页面观察，或由类型化外部访问熔断提供人工等待依据
- runtime inputs: 任意浏览器命令、最新 typed trace 事件和类型化访问中断
- dynamic task outputs: 自动修正后的业务结果，或带真实页面事实的人工 waitpoint
- generic platform capability used: Pi AgentSession、BrowserSkill fresh observation、typed BrowserFailure 和持久 waitpoint
- replay model calls: 0；该门禁只校验现有事件状态
- site/task-specific code added: no

P6 重名语义目标 Product Alignment:
- natural-language task: 页面存在多个同角色同名称控件时，按当前可观察顺序稳定选择其中一个并在换输入复跑
- reusable chain boundary: 默认仍拒绝平级重名目标；只有链路或探索命令显式提供零基 occurrence 时才按同名浅层匹配顺序选择
- runtime inputs: 任意语义 role、动态 name 和显式 occurrence
- dynamic task outputs: 被选目标动作后的真实页面状态，或越界时的类型化 missing
- generic platform capability used: stable target、BrowserCommand、BrowserSkill 临时引用消歧和 Trace-to-Graph 编译
- replay model calls: 0
- site/task-specific code added: no

P6 工具来源投影 Product Alignment:
- natural-language task: 从页面或浏览器动作精确返回长 URL、动态文本或结构值，避免模型手抄造成截断和漂移
- reusable chain boundary: `tool` provenance 的 eventId/resultPath 是权威值来源；`inference` 中的 URL 只有在所引事件存在唯一同 origin/path 且查询条件相容的真实 URL 时才规范化，否则仍拒绝
- runtime inputs: typed trace 事件、输出合同和 provenance 路径
- dynamic task outputs: 由真实工具值规范化后的步骤结果与最终业务结果
- generic platform capability used: typed trace、value binding、Zod 合同校验和 Trace-to-Graph 输出映射
- replay model calls: 0
- site/task-specific code added: no

P6 Agent Window 回收 Product Alignment:
- natural-language task: 页面动作打开新标签后继续自动化，并在任务结束时只回收本任务产生的浏览器页面
- reusable chain boundary: 记录紧邻 click/press 产生的新活动标签；切换代表输入时关闭旧动作落点，finally 中在 session stop 前关闭仍存活的动作落点
- runtime inputs: 动作前来源 tab、动作后活动 tab 和当前 Agent Window tab 集合
- dynamic task outputs: 有界的任务页面集合、可审计的 tab_close，以及不残留自动化窗口的终态
- generic platform capability used: BrowserSession 动作转场、BrowserSkill tab list/close 与 BrowserHost finally
- replay model calls: 0
- site/task-specific code added: no

P6 全任务代表探索边界 Product Alignment:
- natural-language task: 计划先发现 N 个动态输入，再以同一条参数化链路逐项处理并汇总
- reusable chain boundary: `once` 代表探索完成该步骤自身结果；`each` authoring 只探索计划绑定的一个代表输入并提交单项 aggregate；计划输出与末步骤 aggregate 完全一致时由宿主确定派生任务结果，不要求 Pi 重复抄写；完整 E1 可由后续编译 job 复用，N 次调用只在链路 E3/E4 后由普通计划执行器运行
- runtime inputs: 计划级输入、上游步骤输出集合、首个稳定代表项和 each maxItems
- dynamic task outputs: 每步真实代表结果、编译链路，以及后续普通执行器产生的完整聚合
- generic platform capability used: TaskPlan binding、Pi AgentSession、typed trace、TaskChain invoke 和计划运行器
- replay model calls: 普通 each 复跑为 0；只有冻结链显式 llm 节点允许调用
- site/task-specific code added: no

P6 编译动态值同值消歧 Product Alignment:
- natural-language task: 从一次成功探索编译可换输入复跑的参数化浏览器链路
- reusable chain boundary: 轨迹中动态业务目标与固定控件共享相同字符串时，只参数化已有输入锚点所属的目标对象
- runtime inputs: 版本化步骤合同中的 locator 字段及其他动态值
- dynamic task outputs: 由成功工具事件及 provenance 映射的步骤结果
- generic platform capability used: 输入 binding 校验、同对象 locator 补全、固定命令常量消歧，以及向后兼容的语义 role 运行时 binding
- replay model calls: 0；普通节点不调用模型
- site/task-specific code added: no

P6 动作后导航就绪 Product Alignment:
- natural-language task: 点击或按键后读取实际到达的页面并继续自动化
- reusable chain boundary: 动作命令返回而当前 URL 尚未变化时先等待一次 commit；确认 URL/标签改变后等待主文档 load 与动态内容 networkidle；没有导航或长期连接均在有界超时后继续
- runtime inputs: 任意语义目标、当前 tab/URL 和步骤活动时间预算
- dynamic task outputs: 动作后实际页面观察，或现有类型化超时与访问中断
- generic platform capability used: BrowserSession pending action、BrowserSkill wait-for-navigation 和编译预算推导
- replay model calls: 0
- site/task-specific code added: no

P6 编译注解复用 Product Alignment:
- natural-language task: 同一成功探索在通用编译器或预算规则修复后生成新链版本
- reusable chain boundary: E1 轨迹摘要完全相同且上次 E2 已完成时复用已校验的逐步骤语义注解；当前校验器重新验证后确定性编译
- runtime inputs: 同一计划版本、步骤顺序、代表输入、E1 轨迹和持久注解
- dynamic task outputs: 新的不可变链版本与当前可执行摘要
- generic platform capability used: authoring job 仓储、validateAnnotations、Trace-to-Graph 编译器和版本仓储
- replay model calls: 0；缺少可复用注解时才发起显式编译模型调用
- site/task-specific code added: no

P6 语义目标就绪 Product Alignment:
- natural-language task: 动态页面控件稍后出现时仍按已编译链路执行一次填写、点击或按键动作
- reusable chain boundary: 动作前在同一页面有界重新观察精确 role/name/occurrence；唯一目标出现后只执行一次动作，重名、截断和超时保持类型化失败
- runtime inputs: 任意语义 locator、当前页面观察和步骤命令/活动时间预算
- dynamic task outputs: 一次真实动作结果，或 target_missing/target_ambiguous/invalid_response
- generic platform capability used: BrowserSession 语义定位、活动预算和编译器最坏命令预算
- replay model calls: 0
- site/task-specific code added: no

P6 动态语义角色闭集 Product Alignment:
- natural-language task: 从页面发现动态目标后，以同一条参数化链路逐项打开当前目标
- reusable chain boundary: 只有输入合同把语义角色声明为 BrowserSkill 支持角色的闭集枚举时才参数化 role；任意字符串合同保留首次成功轨迹中的真实角色，目标名称仍由运行输入绑定
- runtime inputs: 任意语义目标名称，以及可选的 link/button/textbox/combobox 闭集角色
- dynamic task outputs: 真实动作落点或既有类型化 missing/blocked/failed 出口
- generic platform capability used: TaskDataContract、trace binding、语义 locator 与 BrowserSkill 角色白名单
- replay model calls: 0；普通节点不调用模型
- site/task-specific code added: no

P6 页面观察时间投影 Product Alignment:
- natural-language task: 读取动态页面内容并在结果中记录该次实际采集时间
- reusable chain boundary: TaskChain 的 page observe 将 BrowserSkill 页面结构与同次 BrowserInspection 的 observedAt 合并，显式 LLM 只能使用这项工具事实
- runtime inputs: 任意已授权页面和页面观察节点
- dynamic task outputs: 页面可见内容及对应的 ISO 观察时间
- generic platform capability used: BrowserSession 状态、TaskChainBrowserAdapter 与观察输出合同
- replay model calls: 0；时间投影本身不调用模型
- site/task-specific code added: no

P6 已观察步骤入口恢复 Product Alignment:
- natural-language task: 上游发现动态页面目标后，用同一条参数化链逐项处理且不重复执行上游搜索
- reusable chain boundary: 输出/provenance 所需事件之前，若某次真实导航落点与运行输入中的唯一公共 URL 精确一致，编译器以该输入 URL 作为步骤恢复入口并保留之后全部业务事件；不能唯一证明时保留原轨迹
- runtime inputs: 任意已观察公共 URL、动态目标和稳定业务键
- dynamic task outputs: 从该恢复入口产生的真实步骤结果或类型化失败
- generic platform capability used: typed trace、provenance、ValueBinding、TaskDataContract 与浏览器 navigate 节点
- replay model calls: 0；入口折叠由已验证 trace 确定性完成
- site/task-specific code added: no

P6 懒加载语义目标揭示 Product Alignment:
- natural-language task: 打开动态列表页后，定位当前首屏之外、随滚动进入可观察树的已知语义目标并执行一次动作
- reusable chain boundary: 语义目标初始缺失时先短暂重新观察，再在同一标签和 URL 内至多向下翻八屏并重新定位；精确 role/name/occurrence 出现后只执行一次业务动作，到观察、命令或时间预算仍未出现则保持 target_missing
- runtime inputs: 任意语义 locator、当前页面与 BrowserSession 命令/活动时间预算
- dynamic task outputs: 一次真实动作结果，或既有 target_missing/target_ambiguous/invalid_response 类型化失败
- generic platform capability used: BrowserSession 语义定位、受控 PageDown、标签/URL 一致性核验和编译器最坏命令预算
- replay model calls: 0；揭示和定位不调用模型
- site/task-specific code added: no

P6 语义目标稳定键回退 Product Alignment:
- natural-language task: 动态列表卡片的促销或展示文案变化后，仍以首次探索证明过的稳定输入片段定位同一目标
- reusable chain boundary: 编译器仅在一个公开字符串输入是首次成功完整名称的严格子串时生成 fallbackName；运行时先精确匹配完整名称，失败后才按相同角色做唯一包含匹配，重名继续返回 target_ambiguous
- runtime inputs: 任意完整语义名称、唯一被其包含的稳定字符串和可选 occurrence
- dynamic task outputs: 一次真实动作结果，或既有 target_missing/target_ambiguous 类型化失败
- generic platform capability used: typed trace、TaskDataContract、ValueBinding、BrowserSession 语义定位
- replay model calls: 0；回退绑定和定位不调用模型
- site/task-specific code added: no

P6 同次运行来源页复用 Product Alignment:
- natural-language task: 从动态列表发现当次目标后，逐项进入目标并完成后续浏览器任务，避免重新加载列表而丢失当次候选
- reusable chain boundary: 编译链恢复已观察入口 URL 时优先激活同一受控会话内完全匹配的现有标签；没有匹配标签才执行真实导航；只可点击获得落点时，同一次逐项访问完成该目标要求的全部业务动作
- runtime inputs: 任意已观察公开来源 URL、稳定语义目标及该目标要求的动态字段
- dynamic task outputs: 本次列表产生的逐项目标结果、真实落点 URL、部分失败及外部访问阻断事实
- generic platform capability used: typed trace、ValueBinding、BrowserSession 标签生命周期、计划 each 编排和访问熔断
- replay model calls: 仅保留链路中显式 llm 节点；标签复用和逐项编排为 0 次隐式模型调用
- site/task-specific code added: no

P6 当前证据（2026-09-13）：
- **本轮真实任务（2026-09-14 收敛）**：任务 `d6f7cca1-9333-4a51-ba9a-f865c7ecf163` / 计划 v2 `0eca3940-649a-4d9d-8e86-8bfa4c54f71a` 复用唯一 Pi/BrowserSkill 探索 BrowserRun `b4097be8-d71f-4689-856d-c03fd6c71469`。离线重编译 job `562122c2-542f-4f90-8312-915e45380165` 没有新增 authoring 事件或浏览器会话；解析链 v12 明确保留 `visibleName` 精确绑定及首次轨迹证明的 `stableKey` 唯一子串回退。
- URL 解析链 v10 已用两个不同型号完成 E3/E4；详情链 v10 已用 `BCD-460WGHFDEDH9U1` 与 `BCD-560WGHFD1BYGU1` 完成 E3/E4，两次均得到非空 `collectedAt`、店铺、可见价格、规格、评论摘要和 3 条当前可见评论。修复长语义树定位后，原正式第 7 项 `BCD-490WGHFDEDSD` 的独立样本运行 `ff8a5e67-b08c-4723-8dc0-3a91c4164ada` 也解析成功。
- 正式执行 `20fe36ac-5b00-4f32-8d42-84a57c73c9b8` 使用发现 v6、解析 v10、详情 v10：发现链一次得到 10 个型号互异候选，前 6 个依次解析出真实 item.jd.com URL；第 7 个在旧定位预算下 `target_missing`，计划按 `onItemFailure=stop` 停止，详情步骤未启动，已完成子运行继续留在执行记录中。
- 重新加载同一个带 `pvid` 的搜索 URL 后，第 10 项 `BCD-502WGHFDGCFSU1` 在 50k 定位树、最多八次 PageDown、完整名称及稳定键唯一包含匹配下仍为 `target_missing`（v12 run `b84014eb-fd19-478b-83a1-858bf2d2cb71`，33 条浏览器命令、0 模型调用）。首次 Pi provenance 同时明确记录该搜索页没有把商品详情链接暴露为可复用公开链接。因此本次真实任务停在“动态搜索结果无法按原 URL 重现全部 10 项”的来源限制，不再重载或加压站点；这不是登录、验证码、限流或人工验证。
- 每个产品/验证运行均只占用一个 BrowserSkill 会话并在 finally 后枚举为空；全程没有新的 human waitpoint。当前不声称完成 10 个详情报告：真实产物是 10 候选、正式前 6 个详情 URL、额外验证得到的第 7 个 URL，以及两个型号的完整详情采集验证结果。
- 产品正式 API 创建任务 `9cba22cc-c8e1-4fd4-9fb9-336be6533e09`，真实需求访谈和语义计划生成已完成；计划只有一个参数化详情步骤。模型选择为已有 AI Connect 连接的 Terra medium。
- Pi 探索 job `036363f4-c184-4b18-8405-b27f0a7a7805`、BrowserRun `13ac4315-48ca-4951-85d1-129ef4485bef` 记录真实工具调用。代表详情页导航超时后落到京东登录页，后续读取被 origin 授权边界拒绝；没有 E1 业务结果、没有编译链路，不计为通过。后续网络复核证明直接原因不能写成普通登录缺失：`item.jd.com` 文档先返回 200，随后进入 `cfe.m.jd.com/privatedomain/risk_handler/03101900/`，再进入 `passport.jd.com`。
- 登录与频控已按同一判定口径分开：2026-09-12 11:46–11:47 的认证/SSO 返回链以及 2026-09-13 02:47 的原始 BrowserSkill 回包证明该窗口登录有效；16:29:16–16:30:16 一分钟内连续直达 11 个商品，最后一条立即进入 `risk_handler`，16:44 同一 URL 三次受限后又于 16:45:51 恢复，证明当时存在短时频控，而非永久 SKU 封禁或直接 URL 必封。历史正式浏览器审计还记录 15:53–15:59 的 288 次命令尝试和 16:25–16:30 的 132 次命令尝试，访问密度足以解释风险升高。
- 断电后当前首页明确显示“你好，请登录”，因此当前搜索、首页商品卡点击及三个不同详情 URL 的认证跳转均按登录过期处理，不能用来证明当前仍处于频控。同公网出口的无 Cookie HTTP 对照对首页、搜索和两条详情 URL 均返回 200，排除整站式纯 IP 封禁；IP、账号、Cookie 与浏览器指纹各自权重无法从客户端继续拆分。未读取凭据或 Cookie，未绕过限制；到达结论后不再继续施压站点。
- 错误归因已收紧：若 Pi 会话结束时没有业务结果，但类型化轨迹中已有浏览器工具失败，authoring 保留最后一个受控 BrowserSkill 错误码并归入工具桥层，不再统一覆盖成 `exploration_business_result_missing`；持久轨迹不保存底层 stderr。导航命令即使超时也会按预算复核当前标签页，若页面实际已越出授权域则保留 `origin_denied`。API 聚焦用例进一步证明同一受控码会作为 `BrowserError` 进入 BrowserRun，同时保留 `exploration_browser_failed:*` 的 authoring 前缀；API/browser typecheck 通过。
- 断电现场把 `browser-owner.json` 撕裂为 NUL 字节，首个恢复 job `46b62202-b817-460f-8ac4-327bd970b1aa` 在 0 次工具调用时正确停在 `cleanup_required`。BrowserHost 现仅在 BrowserSkill 官方会话枚举为空时丢弃损坏 owner，并在 owner 原子替换前执行文件同步；有活动会话则继续阻断。断电恢复聚焦用例 1/1 与 browser typecheck 通过。
- 修复加载后的唯一一次实际正式复跑 job `d9303e19-d2f1-45f5-8e2e-c46910fef31d` / BrowserRun `99c1a2cb-4e02-4e8d-8cdd-215eeca1bb74` 完成 1 个 Pi 探索会话和 3 次探索工具调用，authoring 以 `exploration_browser_failed:origin_denied`、E0、BrowserSkill/工具桥结束；没有结果或链路。BrowserRun 当时仍保存旧的泛化 `command_failed`，随后传播修复由聚焦用例验证；为避免继续访问，未再用京东做第二次现场复核，该历史记录保持原样。
- `get-html` 实际响应键为 html/truncated/byte_size/tab_id；原始 HTML 仅在内存解析，没有输出或落盘。
- 换输入风险修复：工具输出使用协议定义的集合元素类型，推断与字段组装遵循任务输出合同，避免空样本列表冻结错误类型；生成任务固定 compiledChain 版本，避免展示另一版本的 E4。
- 新增/更新聚焦验证 7/7（编译器 4、集合合同 1、投影 2）；API/contracts/Workbench 类型检查通过。此前阶段测试不重复计数。
- 访问压力保护已落入通用执行路径：导航失败先核验实际落地页且不重发；401/403/429/5xx、认证、验证、拒绝和瞬时故障以脱敏事实贯穿节点、检查点、子链和计划；plan each 与嵌套 invoke 按稳定键去重，首个外部中断立即停止剩余输入；首次探索在首个外部中断后也不再把后续工具调用送入 BrowserSession。没有全局 20/30 秒间隔、猜测冷却或隐藏重试。contracts/browser/runtime/API 类型检查通过；本次相关聚焦测试为 contracts 6/6、browser 24/24、runtime 15/15、API 13/13，diff 格式检查通过。
- 非采集提交任务 `cb2701b6-7212-4d82-9853-c37998fe27ba` 首轮暴露 Pi 工具续轮 JSON 边界缺陷：共享事件序列化读取 details，宿主成功工具结果未提供该字段，被包装成 upstream。已用现有工具 surface 显式返回空 details，未修改相邻包；来源为当前 vendor 制品和该轮 Pi 持久错误，不能归因于账号或供应商额度。修改后真实连续导航/填写/点击/读取已成立，最终结果报告没有成功回执，保留 E1 失败业务结果。
- 后续通用修复：press 语义目标按官方 CLI 使用 --ref；编译注解不再让模型抄写 outputMappings，宿主直接复用已校验 provenance；tabs 输出合同遵循 BrowserSession 的数组协议。Pi 聚焦 3/3、CLI 映射/API 协议 4/4、集合合同 1/1 及 API/browser 类型检查通过。
- 交互环境问题尚未定位：直接 bsk 对演示表单点击 Submit 返回成功但没有回执；DOM 只读诊断无无效字段。对本地 Workbench 展开侧栏按钮同样返回点击成功但 DOM 和截图仍显示关闭。bsk doctor 全部通过；这不构成真实提交或 UI 交互验收。没有用脚本触发点击/提交来替代工具行为。
- 非采集编辑任务 `03d7bb0a-2106-4c26-9f35-c96ea22531b8` 已得到 E1，并确定性编译链路 `11b1f643-e066-46af-81d2-588e10194e15` v1。首个样本运行暴露标量结构化输出边界与动作前缓存问题；已增加供应商对象根封装、在动作结束后失效定位缓存，对应 2 条测试与 API/browser 类型检查通过。
- 修复后 v1 样本 `073ed9ee-daba-43a4-8f76-806e073e344a` 实际输出 BAT editing one，15 次图迁移/12 条浏览器命令/3 次显式模型调用。换输入运行 `2f0d2142-51c0-4a46-8a08-0a395a5fcae8` 实际文本为 BAT editing two，但推断状态按旧样本返回 not_completed；虽然旧判断写入 completed/verified，该证据不计为业务验收通过，保留原记录供审计。
- 已修复上述假通过风险：显式推断接收本次 runtimeInput，探索样本说明不作为固定答案；可以映射到单次输入/输出的计划业务完成条件进入 Chain completion，跨步骤/each 聚合条件仍由计划运行器验证。新增测试证明输出值错误时不以页面存在宣告完成；API 类型检查通过。
- 编辑链路 v2 由正式探索 job `ae3e412d-155d-4c3b-898e-e4a6c4b646b2` 生成，样本 `676d5aa7-bfb3-43d2-82b9-c33e8c794fa9` 和两个不同输入 `ad8a3dc9-1ef0-49eb-805a-7eb1f502cc9f`、`e669500f-a99c-4fe6-8773-5e8a72aa0eba` 全部通过：分别实际返回 BAT editing one、BAT editing two、BAT editing three 复跑；三次均通过工具事实与业务相等条件，15 次图迁移/12 条真实浏览器命令/3 次显式模型调用。独立运行、不同输入和同一版本已核验；普通浏览器节点没有调用模型。该非采集任务达到 E4，不代表京东验收完成。
- v2 授权后正式执行 `0d35a971-e172-4ef1-88ce-ea21b64330c9` / TaskRun `89935a21-7e4a-4adb-8a87-e33b6137aa8e` 已完成，实际输出第四个输入 BAT formal replay four；计划总账为 15 次迁移、12 条浏览器命令、3 次显式模型调用、1 次链路调用。完整输入/输出/消费摘录保存在本机忽略目录 `data/authoring-editing-acceptance-20260913.json`。
- 京东样本复跑、两个新 URL、品牌 10 型号均未运行；当前登录已过期且历史频控已确认，P6 尚未通过，不把外部阻断伪装成验收通过。
- 本轮收尾：正式 BrowserRecord 为 succeeded、cleanupRequired=false，bsk 枚举无活动控制会话；本轮 API/Workbench 服务已停止。临时验收驱动与诊断图片已删除，历史数据库和失败记录保留；未提交、未推送、未建 worktree。改动范围内 typecheck、聚焦测试和 diff 格式检查通过，未运行根级/全量测试。点击交互问题尚未定位，UI 交互验收未通过，最终零垃圾/全任务门仍未关闭。

## 首次探索与链路编译方向修正（2026-09-13，P0 历史记录）

本节记录实现前的方向修正与当时的机器观察；当前代码、浏览器状态和下一动作以首节为准。

- **已确认新架构**：产品继续使用 AI Connect 选择的用户账号和模型，由 Pi AgentSession 使用 BrowserSkill 完成首次代表任务；B-A-T 记录真实工具轨迹、业务结果和字段来源，模型只补充紧凑编译语义，宿主确定性生成唯一现有 `TaskChain`。Codex 不是产品运行时。
- **已否决旧 authoring 路径**：`TaskRuntimeHost.explore` 的固定轮数无状态 `command|finish` 循环，以及 `TaskChainAuthoring` 让模型直接生成近乎完整计划/Chain IR 再碰一次 repair 的方案，不再是目标架构。它们在 P1–P4 替代路径通过对应最小验证后按清理门删除。
- **成熟底座继续保留**：通用 task-chain contracts、LangGraph `StateGraph`/`TaskChainRuntime`、BrowserSkill、AI Connect/Pi、Zod、SQLite/Drizzle、React Flow、共享 Agent surface 和 Workbench 不删除、不自行重写。旧 SQLite 记录保持原字节只读。
- **结构化读取缺口已明确**：当前合同存在 `observe scope=target`，适配器却返回 `observe_target_unsupported`。P2 必须先核验并复用 BrowserSkill 已有 page/target/HTML/语义快照能力及成熟解析组件；不得加京东平台 special case、任意页面脚本或自研解析器替代成熟组件。
- **预算含义已修正**：商品数、评论数是业务限制；图迁移、底层浏览器命令、活动时间、调用深度和显式 LLM 次数由编译器从图和节点能力推导。账号/供应商用量、authoring 调用和 replay 消费分别审计，UI 不再用含混的“额度耗尽”概括所有失败。
- **登录边界已确认**：2026-09-13 02:47 的原始只读回包显示，同一 Chrome Profile 的京东首页和详情页当时均有账户入口、“我的京东”和购物车，检查会话随后已关闭。该浏览器进程后来退出；登录状态不能据此永久保证。P6 的后续失败已由网络记录定位到京东 `risk_handler` 后转认证，不能只凭最终 `passport` 页面要求用户重新登录。Cookie、密码、token 和验证码不写入 Git、日志或普通记录。
- **本轮只完成文档**：[实施说明](TASK_CHAIN_AUTHORING_REDESIGN.md)、[清理清单](TASK_CHAIN_AUTHORING_CLEANUP.md) 和 [ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md) 已建立，并同步修正架构基准、ROADMAP、README 与产品架构当前陈述。本轮没有改产品代码、没有调用产品模型、没有启动浏览器任务、没有跑测试、没有提交或推送。
- **下一动作**：从 P1 的现有 Pi adapter 工具会话入口开始。P1–P5 未完成前不继续京东批量抓取；P6 按“一个代表 URL → 编译后样本复跑 → 两个不同 URL → 10 型号同链复跑 → 第二类任务”取得真实证据，每阶段同时完成清理。
- **工作区边界**：当前 `master` checkout 含大量上一轮未提交修改；新会话必须先核对实际状态并保护这些改动，禁止 reset、clean、覆盖、创建 worktree 或未经授权 push。

## M2–M7 通用任务链路收敛与首个真实闭环（2026-09-13，历史基线）

> 本节记录上一版实现和运行证据。涉及手写探索循环、完整候选生成或“当前已接通”的陈述已经被本页首节和 ADR 0002 取代，不得作为接续实现方向。

- **已完成 M2–M6**：正式代码只保留 `src/task-chain/` 一套 requirement/plan/chain/run 合同、一套 compiler/runtime 和 `apps/api/src/task-chain/` 一条编排/持久化路径。Workbench 的 Plan/LiveChain/Results 全部读取这一事实源；旧 capture/workflow/ordinary-run 包装、XState 对照、结构样例、legacy exports、旧 fixtures/tests/browser scripts 与原型专用依赖已删除。LangGraph `StateGraph` 保留为唯一图执行底座。
- **首次探索已接通**：生成 Chain 必须提交符合步骤动态合同的代表输入。宿主从已确认需求和输入提取 origin，在同一受控 BrowserSession 中执行有界的结构化模型动作与 fresh observation，随后把内存轨迹交给编译调用；TaskAuthoringJob 保存关联 browserRunId 和实际两类调用总数。候选仍需独立 sample 与不同输入 verification，探索成功本身不等于 verified。
- **授权与恢复已收紧**：授权固定顶层 Chain id/version/digest，invoke 子链由父链 digest 固定；执行前求子链传递闭包以生成完整浏览器 action/origin grant。步骤与计划各有持久消费总账，顶层调用、重试、子调用、转换、真实底层浏览器命令、自动化活动时间和显式模型调用不会因恢复重置。子链人工等待会传播到父链，恢复复用同一子运行与检查点且不重复计费；集合超过 maxItems、预算耗尽或授权链缺失均保留明确 blocked/partial 结果。
- **历史数据边界**：SQLite schema v10 新增当前合同表，旧 plans/chains/executions 字节不删除、不重写，只通过 `legacy_read_only` 列出和导出。BrowserRecord 的旧 `plan_evidence`/`repair` 枚举仅为历史读取；新 grant 只能创建 exploration/verification/replay。
- **已修复产品缺陷**：除 stale 级联、固定版本、重启恢复、invoke 闭包和聚合预算外，本轮还补齐父子链等待/检查点恢复、invoke 输出拆包、计划与编译阶段的 each schema/stable key 校验、loop 终止出口防回环、节点超时贯穿底层命令进程、纯本地 wait、未实现 target observe 的明确拒绝和 camelCase 通用参数键。LangGraph 接入时发现 paused 状态仍会经 `START` 进入首节点，现已在入图前短路，防止未决浏览器副作用被恢复重放。
- **已修复测试夹具缺陷**：旧浏览器测试改为显式 human/request_help 生命周期；API 探索夹具补齐可授权 origin；loop 回环夹具恢复可达 emit，父子恢复夹具补足完成链路所需预算。夹具修正后才断言产品行为。
- **离线验证结论**：contracts、runtime、browser、API、Workbench 五个所属包 typecheck 曾全部通过；聚焦测试 111/111（23 + 13 + 25 + 36 + 10 + 4），其中 runtime 固定 LangGraph 正式依赖，并覆盖超过默认递归阈值的图推进与外部取消检查点。Skill `quick_validate.py` 通过，`git diff --check` 无格式错误，TS/TSX 文件均未超过 500 行。该数字只记录离线收口时的基线，不替代后续真实证据。
- **受控真实浏览器运行链已完成**：任务 `9b60d049-9a0f-4dc5-8bc5-6fbf98adff3a` 的计划 v2 和链路 `401e77ae-51a6-4c96-81f9-ad99f7a499fc` v5 已固定。sample `d05ffc78-f737-4898-877a-d29bbc50e8d9` 访问 `example.com`，verification `d1868ac5-e87f-4923-8053-7051f8f3ec25` 用同一链路访问 `example.org`，普通执行 `98a7264c-2585-484d-87f8-e648cbf91586` 复用该版本。三次均为 6 次节点迁移、7 条真实 BrowserSkill 命令、0 次运行期模型调用，并得到各自页面的结构化结果；Workbench 现场投影和浏览器会话回收已核验。
- **该证据不能代表自然语言编译通过**：确认需求有 1801 个字符、62 行，提前列出两个 URL、五个字段、1–7 步操作、预算和完成断言。它没有直接给 BrowserSkill 命令或选择器，但已把解法约束到接近脚本，只能证明运行器、binding、浏览器适配、审计和复跑管道。
- **现场暴露并修复的通用缺陷**：底层 BrowserSkill 命令原先被低报为一个 browser 节点，现全部进入预算与审计；job/run/execution 顺序及 Workbench 调用摘要已改为真实含义；`each` 单项输出的运行时数组聚合现在进入静态 binding/总输出合同检查，旧不兼容计划可读但不能授权或执行。
- **范围偏航，已停止**：受控公开页面运行链完成后又在已有京东历史任务上启动了新版批量计划 authoring。该轮记录跨度约 60 分钟，6 个 job 中 5 个失败，没有形成可执行新版计划或链路，也没有创建新的京东 BrowserRun；任务原有 legacy 计划、链路、执行和浏览器记录保持不变。这违反 ROADMAP 的当前顺序，不能算作验收。已停止该路径并移除供应商失败后的自动重试，不再通过重复生成碰候选。
- **当前未验证**：简短自然语言到计划/链路的产品闭环、第二类非数据采集真实任务、登录/验证码的 typed 人工等待与返回、目标扩展形态和页面漂移。没有运行京东/F6 批量抓取、根级/全量测试，也没有推送远程。
- **偏航收口复验**：移除自动供应商重试后，contracts、runtime、browser、API、Workbench 五个所属包 typecheck 通过；contracts task-chain 7/7、API task-chain 3/3 通过，`git diff --check` 无格式错误。未重复运行根级或全量套件。
- **依赖基线失败**：锁文件变更后按官方 registry 复查，`npm audit` 当前为 1 high、3 moderate，均来自本地 AI Connect 0.3.2 发布包精确锁定的 Hono 4.12.12，消费者侧无自动修复。该结果与 LangGraph 无关；需由共享包 producer 升级并重新发布，本仓没有用 override 改写其依赖。
- 完整实现、清除清单和未测门见 [M2–M7 实施记录](TASK_CHAIN_M2_M7_IMPLEMENTATION.md) 与 [代码处置清单](TASK_CHAIN_CODE_DISPOSITION.md)。

> 以下章节是早期阶段和历史运行记录，只保留当时证据；若与本页首节冲突，以首节及其链接的当前架构/处置文档为准。

## M1 通用契约出口与协议验证（2026-09-12，历史阶段记录）

- **已完成**：修改前记录 [Product Alignment、Baseline Impact、Patch Disposition 与重叠补丁审计](M1_CONTRACT_IMPLEMENTATION.md)。正式 contracts root/requirement/plan/chain/binding/run/version 统一指向 `src/task-chain/`；动态输入输出 schema、11 类节点、typed 出口、固定版本链路调用、逐项 stable key、预算、检查点、独立运行/同运行恢复绑定和显式模型审计均有通用合同。
- **兼容**：旧 contract 源码和全部已有改动保留。29 个 API/Workbench/runtime 消费者文件只把 imports 改为 `/legacy/*`，逐文件逆替换与开工快照完全一致；package.json 只追加/调整 exports，原 AI Connect vendor 依赖与 lockfile 未改。没有创建 worktree、删除文件、修改 BrowserSkill、写 SQLite 或启动浏览器/模型。
- **历史读取合同**：`readTaskContractJson` 原样保留 JSON，旧无版本记录明确为 `legacy_read_only`，未知版本为 `unsupported_version`，损坏记录为 `invalid`。这是一条供 M4 接入的版本读取边界；**现有 repository、队列、UI 尚未接入，生产入口的只读执行门禁未完成**，不得称为用户历史数据已迁移。
- **通过**：`npm run check --workspace @browser-capture/contracts`；`npm exec --workspace @browser-capture/contracts -- tsx --test tests/task-chain.test.ts tests/task-chain-run.test.ts`，13/13。覆盖两类任务、动态 schema/坏输入、安全 binding、11 节点族、出口/引用/验证证据、计划依赖/预算、运行身份/检查点、未知模型调用数和历史 JSON 保真。已有 diff 静态检查通过。
- **开发失败与修复**：首次 typecheck 发现递归 schema 手写类型未显式包含 optional 的 undefined，与 exactOptionalPropertyTypes 不兼容；修正后本包复查通过。没有遗留本阶段产品/测试失败；未运行无关套件，不能据此更新其他模块的基线失败状态。
- **阻塞与未测**：无 M1 环境阻塞。仅协议 fixture，未运行 runtime/API/UI 行为、生产存储迁移、真实浏览器、京东/F6、模型、根级测试或全量测试；未重跑已通过协议套件。产物内容校验、图可达性/支配与能力语义等仍按后续 compiler/runtime 门验证。
- **当时后续边界**：本段记录 M1 完成时尚待执行的 M2–M6；这些事项现已由上一节的 M2–M7 收敛实现取代，不能继续把 legacy bridge 当作当前生产状态。

## 通用任务链路架构收敛（2026-09-12）

- 项目公共边界已固定为：把自然语言浏览器任务编译为参数化、版本化、验证过、可复跑的任务链路；普通复跑不依赖模型重新驾驶浏览器，只有链路显式包含的 LLM 节点消耗模型调用。
- 已新增 [通用浏览器任务链路架构](TASK_CHAIN_ARCHITECTURE.md)、[通用任务链路代码收敛实施清单](TASK_CHAIN_CODE_DISPOSITION.md) 和 ADR 0001；领域术语由根 `CONTEXT.md` 维护，工程对齐门由根 `AGENTS.md` 维护。
- 代码审计确认当前同时存在未接入生产的 workflow/run 原型和已接入但以 capture 为中心的生产路径。目标是让生产路径迁移为唯一通用 contract/compiler/runtime，迁入有效不变量后删除隔离原型、生产样例和 capture-only 公共形状。
- 本阶段只完成文档事实源与代码处置审计，尚未修改公共合同、运行器或历史数据。后续按 M1–M7 逐阶段开发；每阶段只运行 owning package 的聚焦验证，真实浏览器验收放在合同、运行器和适配器稳定之后。

## 任务计划到任务链执行（2026-09-12）

Baseline Impact:
- touched layers: Plan 合同与 Planning Run、BrowserSkill 人工等待、授权执行恢复、任务链节点投影、Workbench 与产品流程基准。
- owning fact source: PlanRecord 保存任务计划、来源 observation 与访问前置绑定；BrowserRecord 保存浏览器运行和人工 waitpoint；ExecutionRecord 保存授权进度；ChainRecord 保存已探索验证的节点图。Done 不是认证事实源。
- public interface changed: yes，BrowserRecord 新增 typed waitpoint，Plan 增加同记录恢复命令，来源访问属性区分 public/authenticated/unavailable。
- new protocol/adapter/fallback: BrowserSkill request-help 生命周期；已有 Profile 先由实际来源能力核验，只有真实阻断才进入人工等待。
- compatibility or legacy path changed: yes，历史 Plan/Browser/Execution 记录继续读取；旧 manual_required 可恢复，旧访问枚举只作读取兼容。
- baseline update required: yes，Planning Run 按需来源取证；登录等待不消耗自动化活动预算；任务链展示节点类型。
- architecture tests to run: 当前真实任务完成“生成计划→自动复用 Profile→确认启动→系统队列执行→任务链与结果终态”验收。

Patch Disposition:
- delete: 授权执行阶段重新解释自然搜索入口的 typed-entry 分支、存在访问前置即强制人工点击、Done 直接产生认证成功、旧 waitpoint origin 自动升级为认证来源。
- keep: 历史 evidence/plan/execution 记录、来源防伪、计划版本/摘要、独立授权、单浏览器队列、transport 收敛修复和执行审计。
- rewrite: Planning Run 先以 BrowserSkill Profile 核验真实来源能力；实际阻断才通过同 session/tab 的 request-help 暂停，Done 后 fresh observe 再决定绑定或阻塞；确认后逐步骤生成、验证和运行任务链。
- reason: 任务计划必须解决来源、访问前置条件和任务级步骤；任务链必须来自授权后的真实步骤运行。

- 实施状态和逐阶段验证记录见 [任务计划、人工等待与任务链路实施记录](TASK_PLAN_EXECUTION_IMPLEMENTATION.md)。
- Workbench 导航和用户可见文案统一为“任务计划”“任务链路”。已有登录态不触发人工等待；人工窗口结束后明确显示可恢复状态，不继续展示正在等待；节点画布显示类型、具体 kind 和运行状态。
- 现有 SQLite 中错误版本写入的步骤级 `entry` 已在存储边界迁移为来源待核验阻塞计划；任务历史保留，旧 digest 不再可执行。
- 定向 Browser waitpoint 与同 PlanRecord 恢复用例通过；contracts、API、Workbench 类型检查通过。未运行根目录或整包测试套件。
- 产品自身已生成并启动任务计划 v33：s1 固化验证出 10 个真实商品入口；s2 遇到浏览器命令失败后保留进度并释放浏览器。已收紧传输失败熔断、当前页修链和重复候选停机规则，两条定向回归与 API 类型检查通过。站点访问恢复前不重启真实运行，任务链和结果终态尚未完成。

## 目标产品运行架构记录（2026-09-11）

- 已确认后续产品由浏览器扩展主前端、Web 辅助管理和 Node 服务端组成；扩展承载需求对话、公共 Timeline/模型设置、计划确认、用户本机浏览器执行与结果，服务端承载 AI Connect、Pi AgentSession、凭据生命周期、数据库和共享任务事实。正式职责、模型形态与待验证项见 [产品运行架构方向](PRODUCT_ARCHITECTURE.md)。
- 目标体验只要求用户安装本产品扩展，不另装 `bsk` CLI/daemon；这是迁移目标，当前实现仍通过本机 `bsk` 进程调用浏览器。
- 用户自带订阅账号、套餐 Key 或 API Key 是已确认模型形态；“产品提供模型”仍是待确认可能性。认证、模型目录和 Timeline 复用 AI Connect/Pi，不新增第二认证系统。
- 当前最基本的草稿到真实计划取证/执行闭环仍未通过。本轮只记录方向，不修改运行实现或清理失败证据；下文 plan v2 可查看与恢复的证据不能解释为真实抓取已经完成。

## Plan 内按需来源证据（2026-09-11）

Baseline Impact:
- touched layers: BAT contracts、API/DB、Plan/chain/browser、Workbench、采访 Skill 与开发基准文档。
- owning fact source: `PlanRecord.evidence` 拥有查询、候选、观察、coverage、gap 与审计；`PlanRecord.proposal` 拥有步骤计划；不再有独立 `ResearchState`。
- public interface changed: yes，删除 `/api/research` 与 research exports；Plan generate 去掉 source id/version，新增 `return_to_interview`，PlanRecord 增加 evidence/stage/status。
- new protocol/adapter/fallback: no，仅扩充既有 Plan command/progress；没有新增 parser、adapter 或 fallback。
- compatibility or legacy path changed: yes，旧 research/plan/chain/execution 开发数据按迁移重置，不提供双事实源兼容；历史验收文字作为当时证据保留。
- baseline update required: yes，来源核查从独立产品阶段并入一次 Planning Run。
- architecture tests to run: Plan lifecycle/evidence/digest/direct reuse/blocked/referral/deleted endpoint，以及 Workbench 状态、失败恢复与详情投影。

Patch Disposition:
- delete: Research 公共合同、API、service/repository/table、Sources tab/connection 及其独立 fixture 入口。
- keep: 单份 BrowserSkill 观察与证据验证、来源防伪、coverage/gap、Plan 确认与执行授权分离，以及既有 Pi/Question 能力。
- rewrite: PlanRecord/PlanService/DB、chain evidence binding、Workbench Plan 投影和采访到计划的交接说明。
- reason: 一次 Planning Run 拥有证据与计划草稿，删除强制独立阶段和第二事实源。

- 当前合同与 API 已落盘并通过 API typecheck。Plan 先以 `assessing` 判断是否需取证，需要时进入 `source_evidence`，再进入 `drafting`；同版 evidence 只有 requirementVersion/revision 与 digest 校验一致才可复制复用。提供 URL 只是候选，取证不足、人工处理和 cleanup 都保留明确终态。
- Workbench 已删除 Sources tab、`ResearchConnection` 与独立来源页面；Plan 页从唯一 PlanState 投影阶段、阻碍、取消/回访/重试、proposal、折叠证据与审计，并继续把确认计划与启动作为独立授权。Node 24 Workbench typecheck、30 项离线测试和生产 build 通过；隔离页面实测计划正文与折叠证据区同左边缘、同内容宽度，可见证据保存在 `work/plan-ui-evidence.jpg`。
- 计划失败恢复闭环已在正式入口验证：来源取证 `command_failed` 时仍保存带真实 `evidenceDigest` 的可查看 proposal；零已采纳来源只形成 `blocked` 待核验步骤，不能启动，也不把普通来源缺口、登录或 cleanup 误作需求口径决定。需求 v2 显式制定并持久化 plan v2，刷新、回需求对话再进入及重复点击均继续选择同一 v2，未创建 v3；旧 failed plan v1 保持不变，plan v2 草拟模型调用审计完整保存。脱敏前后记录见 `work/plan-repair-2026-09-11-before.json`、`work/plan-repair-2026-09-11-after.json`，真实 UI 见 `work/plan-repair-2026-09-11-ui.jpg`。本机尚无 `bsk`，所以此次只证明失败可恢复及计划可查看，未证明真实来源抓取可运行。
- 弱表达自然访谈的首次隔离运行证明公共协议会拒绝 `choice` 零选项；同时定位到 BAT active-stage guidance 仍残留“具体值改用零选项题”的旧规则。该宿主重复规则已删除，最终 assembled active-task 只由公共 Question 注册与访谈 Skill 决定题型；公共接口、parser、重试与 fallback 均未改变。
- 使用当前已保存的 `gpt-5.6-luna` / `medium` 在隔离 ProductStore 和随机端口完成五个自然弱表达验收 run，共 25 次模型调用，浏览器执行器保持硬失败。最早 A 用 2 次调用暴露 `choice` 零选项冲突；删除宿主重复规则后的纯点击 A 用 8 次调用仍未成稿。最后一组共 15 次：harness 漏读推荐项说明的 A 用 2 次调用失败；修正后 A 在同面板补充唯一对象 `德龙 EC685`，用 5 次调用形成结构合格草稿，但独立语义审查发现硬范围增加未明确展示的价格层级排除与字段，并把证据权威当作低风险默认；B 用 8 次调用形成初稿，但补充的 `京东` 不是用户所说“一家店”的可识别身份，随后又连续多轮以“填写名称”方向索取店铺名，未按 Skill 改变支架。B 的 harness 还在发送预定纠正前错误执行最终范围断言，因此纠正未实际调用、未获验证。结论是迁移、公共协议和题板组合已实现，访谈语义验收未通过；不以结构校验或 harness 状态替代质量结论。全部运行均未确认草稿且正式用户状态摘要不变；五个 run 的原始可见对话、typed Question 与草稿依次保存在 `work/interview-acceptance-2026-09-11T10-10-41-229Z-0862254a`、`work/interview-acceptance-2026-09-11T10-15-58-836Z-bb51790e`、`work/interview-acceptance-2026-09-11T10-29-20-922Z-7af8e757`、`work/interview-acceptance-2026-09-11T10-32-58-025Z-6a4c997b` 和 `work/interview-acceptance-2026-09-11T10-34-51-890Z-54dbe339`。验收 harness 已改为在首个草稿后再发送纠正、只对纠正后的终稿检查旧值残留，并在失败产物中保留已生成草稿；下一次 B fixture 使用可识别店铺名称，不再把平台名当店铺身份。

## 公共 Question mode 注册接入（2026-09-11）

- 公共 `commonQuestionAuthoring` 由宿主必填 `modes`，并只注入、解析和验收已启用的 `choice` / `multi_choice` / `free_form` 协议。B-A-T 当前注册 `modes: ["choice", "multi_choice"]`；缺失 mode、`free_form` 或未注册模式的模型输出均在 authoring 终态进入业务状态前失败关闭。完整需求仍可首轮成稿；用户不点击当前选项时仍可通过普通 Composer 补充、纠正或拒绝方案。
- B-A-T 的新公共 typed Question 直接消费共享 `commonQuestionSchema` 和 `panel.mode`，不根据 options 数量重算题型。互斥方向使用单选，同轴可并存条件使用复选，两者通过同一 compound submit、`option` decision、SQLite 消息 envelope 和 Workbench locked history 完整保存与回放。仅旧 `{prompt, options}` 压缩记录在读取适配边界恢复为旧单选或开放题。
- 私有 Skill 不重复 XML 拼装和题型注册，只要求每题提供 2–3 个真实同轴方向及唯一推荐；单选项互斥，复选项可以并存，同面板自由补充具体值，不伪造未知事实或单个占位按钮。题型与 XML 语法以本轮宿主注入的公共协议为唯一事实源。
- 本次迁移延用此前公共 Question 阶段已同步安装的 AI Connect core `0.3.2-4f54eb7c`、React `0.3.2-cc7d94fe` 和 Pi AgentSession `0.1.0-09653602`，没有新增 stage、sync 或 install。此前同步验证包括同步脚本 2/2、聚焦 contracts 10/10、Workbench 13/13、API 57/57、全 workspace 离线测试 190/190、所有 workspace typecheck 和生产 build，build 保留既有大 chunk 提示。Skill `quick_validate.py` 已执行，但因本机缺少 PyYAML 在导入阶段失败，未安装依赖；已读取该脚本并用 Ruby Psych 等价校验 frontmatter 通过。后续自然访谈结果按上一节单独记账，Windows 仍未实机验证。

## 访谈 Main 统一 Pi AgentSession（2026-09-11）

Baseline Impact:
- touched layers: AI Connect 账号绑定、访谈 Main 模型入口、ProductStore 历史适配、Workbench 模型设置、vendor 同步与开发文档。
- owning fact source: ProductStore 继续拥有任务、完整消息、决策、草稿与确认；`@agent-platform/pi-agent-session` 拥有 Pi 会话、checkpoint、continuation guard、资源隔离与运行事件；AI Connect 拥有账号、凭据、模型目录和受信 binding。
- public interface changed: yes，BAT 私有 `AIModelProvider` 增加 Main session 入口，模型设置保存继续使用既有 HTTP endpoint 并增加 `agentSession` surface 服务端门禁；新增独立共享包依赖。
- new protocol/adapter/fallback: yes，Main 使用共享 Pi AgentSession adapter 与 AIEvent bridge；未新增 provider、authoring、Question 或业务状态协议，也不提供第二运行 fallback。
- compatibility or legacy path changed: yes，迁移前已接受且没有 AIEvent 的助手消息只从同一 ProductStore 安全事实生成首轮 canonical seed；已有账号和凭据保持原状，不支持 AgentSession 的选择在保存及运行前关闭。
- baseline update required: yes，共享包、受信 binding、确认 accepted candidate 与资源空加载边界由相邻平台仓 ADR 0068 定义；BAT 文档只记录消费方式与本地事实源。
- architecture tests to run: 公共包隔离导入、binding/surface、两轮 raw history 与 accepted-step、空工具和项目 Skill allowlist、保存/运行双门、authoring 失败原子性、既有访谈/HTTP/Workbench/sync 回归。

Patch Disposition:
- delete: 访谈 Main 的 stateless text 入口、无生产调用的旧 authoring 入口及其重复对话 prompt 投影。
- keep: bounded 调研/计划/链路的 Pi structured generation、ProductStore/authoring/parser/Question/Browser 授权事实源、账号与凭据记录、历史 vendor 制品和其他消费者仍使用的 direct invocation 能力。
- rewrite: Main 每轮从已保存选择建立受信 binding，以 task 作为 canonical session、以完整已接受消息和末尾 active-task 驱动共享 Pi adapter；本地领域事务成功后才确认 Pi candidate。
- reason: 所有 provider 由同一 Pi 模型与 wire 实现驱动，同时让 Main 取得真实 AgentSession 生命周期，并维持 BAT 单一业务历史、显式资源白名单与现有授权边界。

- Main 每次运行通过 AI Connect `bindAgentSession` 重查主体、账号、凭据、精确模型和 `agentSession` surface；模型或账号切换由 continuation guard 建立新会话，不跨任务复用状态。adapter 的 checkpoint 位于 BAT 数据目录，由 coordinator 在每轮结束时关闭内存生命周期。
- 本轮完整项目 Skill 只作为末尾 active-task 注入；共享 ResourceLoader 的全局 AGENTS、Skills、extensions、prompts 和 tools 均为空，BAT 同时传入完整空工具白名单。ProductStore 已接受助手消息的 `text.delta` 是后续 canonical raw history；Workbench 仍只显示既有安全投影。事件缺失或终态不一致时停止续接，不用展示文本猜测模型历史。
- Workbench 账号弹窗只展示支持 `agentSession` 的连接，并将目标 surface 带入 OAuth；保存接口和实际运行各自复核。旧 managed-profile 连接继续保留为账号事实，但不能成为 BAT 当前模型选择，也不会被转换或删除。
- bounded 调研、计划和链路仍走 AI Connect 的 Pi stateless structured generation；它们复用同一账号选择和 surface 门禁，不冒充 Main 会话，也没有第二套 provider 路由。
- 正式同步已安装 AI Connect 0.3.2、React 0.3.2 与 Pi AgentSession 0.1.0；最终 Pi tarball 为 `agent-platform-pi-agent-session-0.1.0-09653602.tgz`，SHA-256 `0965360270af2e064db29d2efe9e194ad83a5f674112415c56242f392c65c9e9`。同步后离线验证覆盖 API 全量 103 项、Workbench 31 项、Main/HTTP/protocol 聚焦 37 项、真实公共 Pi adapter 两轮 2 项、同步脚本 2 项、全 workspace typecheck 与生产 build；`git diff --check` 通过。真实 provider/OAuth 登录与 Windows 安装构建留待目标环境验收。

## 固定开发端口安全重启（2026-09-10）

Baseline Impact:
- touched layers: 根目录开发启动脚本与开发期进程占用确认；API、Workbench 和产品状态层不变。
- owning fact source: API 端口继续由 `BROWSER_CAPTURE_API_PORT`/默认 4175 决定，Workbench 固定 4173，Vite proxy 继续读取同一 API 端口。
- public interface changed: no，正式 HTTP、事件、消息与持久化契约均不变。
- new protocol/adapter/fallback: no，仅在启动两个既有开发命令前增加本机端口占用门禁。
- compatibility or legacy path changed: yes，`npm run dev` 遇到占用时从直接失败改为显示可核实进程并默认拒绝、明确确认后安全重启；根开发入口在同一进程内管理 Fastify 与 Vite。
- baseline update required: no，变更不改变运行时层级、事实源或跨层协议。
- architecture tests to run: 固定端口空闲启动、Web/API 占用默认拒绝、确认重启、身份变化拒绝、代理关联及子服务失败回收。

Patch Disposition:
- delete: 端口失败时可能遗留 npm 孙进程的根目录 `concurrently` 启动胶水及其无调用依赖。
- keep: 上轮 Authoring 组合、Interview 业务、固定端口、Vite proxy 和 ProductStore 独占锁。
- rewrite: 根目录 `dev` 入口先做端口预检，确认后由 Fastify/Vite 官方编程入口同进程启动并按序关闭。
- reason: 本轮没有待清算的业务修复；既有并发 CLI 在端口失败竞态下可先结束 npm 包装进程、留下刚创建的孙进程，因此不能满足“失败后仅清理本次服务”的门禁。

- 实现：`npm run dev` 先精确检查 Web 4173 与实际 `BROWSER_CAPTURE_API_PORT`（默认 4175）。macOS 使用 `lsof -iTCP:<port> -sTCP:LISTEN`、Windows 使用 `Get-NetTCPConnection -State Listen` 只取得 TCP 监听 PID，再按 PID 查询进程名和入口目录；不把 UDP 占用者或 TCP 客户端当成服务。交互提示说明会中断现有请求/任务且默认否；非交互、归属不完整、复核时 PID/PPID/命令/目录变化均关闭启动门。
- 生命周期：确认后只向复核一致的 PID 发送终止信号并等待固定端口释放。新实例由同一 Node 进程持有 Fastify 与 Vite middleware，显式绑定 Workbench root/config、HMR upgrade 和当前 API proxy；host 是唯一 SIGINT/SIGTERM 权威，任一启动失败或退出都先中止本实例连接，再等待 Vite、Fastify 及 ProductStore 既有关闭钩子完成。
- 验证：Node 24 专项 12/12 通过，覆盖 Web/API 冲突默认拒绝、确认 fixture、占用身份变化、UDP/TCP 客户端排除、API+Workbench+proxy/HMR、真实 active turn 的代理事件流关闭、部分启动失败回收，以及 SIGTERM 后同数据目录立即重开；全 workspace typecheck、`git diff --check`、Windows lockfile dry-run 通过。当前真实旧 checkout 的 4173/4175 在 TTY 直接回车和非交互检查前后 PID 均为 67467/67515，没有停止或启动真实服务。
- 回归边界：全 `npm test` 中 Workbench 27/27、browser 13/13、contracts 15/15、runtime 22/22 通过；API 82/85，保留既有的三项 Interview 审计/fixture 失败；最终启动专项另行复验 12/12。本机没有 Windows 启动环境，因此不宣称 Windows 进程停止与真实启动已验；`npm audit` 的 3 项公告仍来自既有 AI Connect 的 Hono 依赖，不由本轮端口依赖引入。

## 外部宿主 Authoring 组合接入（2026-09-10，实施中）

Baseline Impact:
- touched layers: 采访命令契约、API authoring 组合、消息有序 typed parts、Workbench Timeline composition。
- owning fact source: 公共包拥有 XML grammar、客户端 UI 能力过滤与通用内容卡；BCT 继续拥有采访 Skill、Question/waitpoint、需求草稿、确认与查源顺序。
- public interface changed: yes，触发模型的采访命令增加可选客户端 UI capabilities；消息增加向后兼容的有序 typed parts。
- new protocol/adapter/fallback: yes，仅新增外部宿主 capability/有序消息 parts 适配；XML 协议、parser、Card schema 与 fallback 继续复用公共实现。
- compatibility or legacy path changed: yes，旧命令默认无 UI package；旧消息继续从安全正文投影。
- baseline update required: no，本次落实已确认的公共宿主 Surface 与外部 vertical 组合边界。
- architecture tests to run: capabilities 边界拒绝、同一 effective turn 的 prompt/parser、内容卡顺序与 preview/terminal、Question/草稿既有回归。

Patch Disposition:
- delete: BAC 手工拼接的公共 authoring envelope 与独立 registry/session 组合。
- keep: 私有采访 Skill、`interview-result` 到 brief、URL 校验、确认/查源顺序、Question/waitpoint 与宿主状态适配。
- rewrite: 仅将上述公共组合接到已存在的模型事件、ProductStore 消息和 SharedChatTimeline 链路。
- reason: 两种宿主使用同一 grammar、能力协商和内容卡，同时保持 BCT 业务事实与授权边界。

## 公共 Agent surface 对齐决策（2026-09-10）

- BCT 与 opencode Examples 的公共 Agent 能力和表现必须一致：生命周期与事件投影、Timeline、Composer、模型设置、Question 注册和开放题答复由同一公共 surface 提供；BCT 只保留浏览器抓取业务 Skill、Workflow、事实状态、宿主命令以及主题色、助手名称和图标配置。唯一共同规范维护在相邻 opencode checkout 的 [`ai-connect-host-surface-parity.md`](../../../opencode/docs/platform/ai-connect-host-surface-parity.md)，本轮公共包交付证据见 [`ai-connect-host-surface-parity-delivery-2026-09-10.md`](../../../opencode/docs/platform/ai-connect-host-surface-parity-delivery-2026-09-10.md)。
- 私有 `interview-browser-task` Skill 已恢复为删除提交 `d32a8e9410cb508e9469f4cc22d7c4899ce2f2b5` 父提交中的准确 blob `2f7588c637d014eeb9f2cbdfd96325aab1a0b949`。运行时另行追加公共 Flat XML authoring 说明；`question-panel` 和 `interview-result` 只把结构结果映射回 Skill 既有的一个问题或完整草稿语义。聚焦测试同时核对历史业务章节只出现一次、两种 authoring 格式和 JSON Schema 均已注入，业务规则与共享输出格式没有冲突。
- ProductStore/SQLite 继续保存消息、轮次、Question identity/revision、选择与自由文本 decision、草稿和审计。`options=[]` 现在映射为公共 `free_form` Module，提交 `{text}` typed answer；选择题提交稳定 option identity 并回写原 label。新生成的选择题在 terminal 接受边界要求 label 唯一；历史 schema 保持兼容，无法唯一还原 option identity 的旧记录只显示原文本。
- Workbench 已改用 `@agent-platform/ai-connect-react/chat` 的 `projectInteractiveTimelineValue`、`createAnsweredInteractionTimelineEntry` 和 `commonQuestionModules`。宿主只把业务快照映成 canonical entries、当前 waitpoint、Run、真实 typed activity 和 send/submit/stop/retry 命令；turn 分组、空正文 Run 壳、活动 Surface 和 locked history 均由公共实现负责。
- 正式同步命令 `npm run ai-connect:sync -- --allow-dirty-declared-files` 已在当前受权声明文件上通过。vendor `release.json` 记录 producer `55aaf20ef20cb8afda601a74b7e6975313d899e2` dirty source snapshot；0.3.1 core SHA-256 为 `7d7bf6ac3ede3e522c212ffd74e0471e264c1f22b701494661afa7b2c7f1a66e`，React SHA-256 为 `40835e818a4f8920a65942e4cf41b9ebbe5831ad41f541339fca9b0017618fa1`，SDK build source hash 为 `07c08ecae7f02554da3c567434ef38f75294e3d35c023fad2ffb6af7ad8f0585`。consumer 在复制后复验 manifest schema、版本、公开 exports、CSS、tar hash、依赖清单、lockfile，以及安装后的 ESM server/authoring/chat/CSS 入口；标准同级 checkout 默认发现，环境变量与 ignored 本机配置可显式覆盖。Windows 同步前先确认没有活动采访，并停止本仓 4173/4175 开发进程，避免运行中的 esbuild 锁住 `npm ci` 需要替换的二进制；同步完成后重新启动 `npm run dev` 并复查 health 与原任务持久状态。
- 验证：contracts 13/13、Workbench 26/26、API question-only/free-text/history/retry 聚焦 3/3、sync 2/2 均通过；整仓 typecheck 和生产构建通过，保留现有大 chunk 警告。最终同步后再次通过 Workbench typecheck，实际导入 `/server`、React 根入口和 `/chat`，公共 registry 同时包含 `choice`、`multi_choice`、`free_form`，CSS 可解析；vendor manifest 与 producer manifest 一致，两份 tar 的实测 SHA-256 与 manifest、lockfile 文件名一致。模型只返回可靠 `question-panel` 时允许空 `assistantText`，只返回草稿同样可提交，完全空输出仍拒绝；Workbench 回归保证原始 `text.delta` 只进入 typed activity，不生成重复正文或暴露 authoring JSON。正式服务使用最终 0.3.1 包启动，`/server` ESM 导入等待一个事件循环后正常退出；4173/4175 已恢复为 PID `24428`/`23720`，API health 和已确认任务重启读取通过。
- 用户授权后的真实采访任务 `42823f5c-72a0-42a9-ab73-f676d60c617e` 从宽泛露营帐篷需求自然产生用途选择题；实际点击“市场与竞品分析”后下一真实模型轮次形成 terminal 草稿。实际打开并确认草稿、刷新后，选择题 locked history、确认版本和模型设置均恢复；权威 API 中来源调研、计划、计划执行和浏览器运行仍为空，确认没有隐式启动后续抓取。真实调用次数以每轮保存的 provider 审计为准，不用 UI 步骤数代替 provider attempt 数。
- 同一授权下的真实采访任务 `ba9b6ea0-acdf-4d75-a5c9-c417900ff8ca` 从失败的 question-only 轮次原地重试；重试后用户原始消息仍只有一条，真实模型成功产生 `options=[]` 的“请提供要采集的品牌名称。”。通过正式 UI 回答“牧高笛（MOBI GARDEN）”后，ProductStore 将 `free_text` decision 与原 question identity 持久关联，真实下一轮形成 terminal 草稿；打开、确认并刷新后，locked 问答、草稿 v1、模型 `gpt-5.6-luna / xhigh` 和确认状态均恢复。最终权威状态为 revision 3、waitpoint resolved、一个自由文本 decision、一个草稿和 confirmedVersion 1；来源调研记录、计划、计划执行与浏览器运行均为空。BrowserSkill 0.2.1 的坐标点击被工具 overlay 截获，目标按钮聚焦后键盘也未产生默认 click；本次重试和开放答复提交按 Skill 的最后手段，对已观察、唯一、enabled 的真实 DOM button 调用 `.click()`，由 React UI 产生正式请求，没有直接 fetch、调用宿主 command 或修改业务 state。草稿打开、确认和刷新继续使用 BrowserSkill 正式操作；会话 `xhhv` 已关闭。忽略目录证据为 `work/surface-parity-real-provider-open-acceptance.json` 与 `work/surface-parity-real-provider-open-{terminal,confirmed,refresh}.png`。

## 需求采访规则与草稿充分性（2026-09-09）

- 当时重新加入私有 `interview-browser-task` Skill 并作为采访行为唯一规则源，现有 AI Connect 结构调用在服务启动时加载并随每轮 prompt 注入；它不是删除前版本的原样恢复，也未恢复旧 Codex App Server runtime。宽泛意图先澄清一个关键业务缺口，模型建议不能补成用户事实；完整需求仍可首轮形成草稿，且只有用户确认当前版本后才可交给来源调研。
- 隔离真实 ChatGPT 账号 `gpt-5.5 / medium` 验证：首轮“我想抓微波炉的数据”只返回一个开放问题，无草稿；补充用途、交付字段、京东公开在售范围、前 30 条及不足处理后，第二轮形成 v1，仍未确认。两轮均为一次成功调用；隔离数据与凭据副本已删除，未修改用户任务。
- 新增正式 prompt 装配及完整需求确认门回归；采访专项测试中新增行为、开放问题推进及确认通过。API typecheck 通过。现有审计断言仍有 `0 !== 2` 与 `0 !== 1` 两项失败，来源于共享模型迁移后的 fixture/审计时序，未在本次采访行为补丁中改写。

## 宿主主题、首次模型选择与真实调用修复（2026-09-09）

- 共享 Timeline、Composer、头像、用户气泡与账号弹窗统一映射宿主 Sand / Amber 语义色阶；在 Radix 边界解析颜色别名，避免共享样式重置成浅色。深色侧栏与 Timeline 实测均为 `rgb(25, 25, 24)`；已查看深浅两套截图及聚焦输入框，去除叠加的 textarea 焦点线。
- 公共模型弹窗全屏 Theme 使用透明背景，宿主 Overlay 为黑色 28% 且不模糊，底层页面可辨。修复 OAuth 账号无默认模型时无法首次选择的死锁：始终提供已有 ModelPicker，由用户显式选择模型。
- Composer 复用公共 `ComposerModelControl`，在输入框内显示当前 `modelId · reasoning effort`，两级菜单分别选择默认聊天模型和推理深度；账号管理继续使用顶栏统一设置弹窗。共享 `sendDisabled` 阻止发送和快捷键提交，同时保留可编辑草稿与停止操作。BAC 从同一 `useModelSettings` 加载目录和选择，保存后立即更新 Composer，未配置或加载失败时不创建失败轮次。
- 正常需求对话保留业务正文、问题、草稿与必要历史只读提示；逐消息的模型调用完成小字不再进入用户时间线，typed 调用事件仍保存在服务端审计中。当前开放问题不重复提示输入位置，问题沿用正文排版。
- 对话宽屏内容列为 784px。共享助手壳的 4px 内边距、36px 头像列和 12px 间距使正文边界相对内容列为左 52px、右 4px；Composer 因此缩窄 56px 并右移 24px。窄屏另镜像 Windows Chrome 滚动 viewport 左右各 15px 的稳定槽位，使滚动层外的 Composer 与助手正文对齐并避免横向溢出。
- 正式 4173 页面通过原生点击选择现有 ChatGPT 订阅账号的 `gpt-5.6-terra / medium`，保存后从 Composer 发送原输入成功。任务 `459029b6-4112-4af8-ab01-d337236e8f78` 的轮次 `25a449f0-7333-4450-9e64-4e571bec1b45` 为 `succeeded`，审计 `invocations=1`，助手生成需求问题；刷新后模型设置与对话恢复。该轮为真实模型调用，未启动来源浏览器抓取。
- 验证：共享包专项测试、typecheck/build 通过；BAC 模型门与消息投影定向测试 7/7、Workbench typecheck 和生产构建通过，既有大于 500 kB 提示保留。最终 React vendor 为 `agent-platform-ai-connect-react-0.3.0-9fbf2fe0.tgz`，SHA-256 `9FBF2FE067CBEEFC63820099E1F6416ABB451769D20DA247621F9034BFB46D2B`。
- 最终包已在正式 4173 页面复测。深色 Portal 与宿主一致，截图为本机临时文件 `bac-final-model-menu-dark.png`；桌面助手正文与 Composer 均为 `left=570.5px/right=1298.5px/width=728px`。500px 浏览器 viewport 下两者均为 `left=92px/right=456px/width=364px`，`scrollWidth=clientWidth=500px`，截图为 `bac-final-narrow-alignment.png`。通过真实键盘菜单把 `gpt-5.6-terra · medium` 改为 `gpt-5.6-sol · high`，刷新后选择保持；随后恢复 `gpt-5.6-terra · medium` 并再次刷新确认。该项验收没有发送需求、调用模型或启动来源抓取，BrowserSkill 会话在验收后关闭。

## 共享需求对话与账号授权收敛（2026-09-08）

最终运行核验：4173 开发服务已强制重新优化依赖并重启；浏览器实测正式页面账号设置的两层主题标记均为 `dark`，同源 health 返回 200。隔离 4174 验收服务与 BrowserSkill 会话在验收结束后关闭，正式 4173/4175 保持运行。

需求对话现直接复用 vendored `@agent-platform/ai-connect-react` 的完整受控 Timeline 与 Composer，保留业务正文、问题卡、草稿卡、确认、取消/恢复和每任务未发送草稿；结构化调用事件按 typed projection 独立显示，不再重复为助手正文。BAC 采用 Enter 发送、Shift+Enter 换行并保留输入法保护，界面只呈现当前支持的操作。共享账号授权同步为 OAuth 成功即保存，不要求先选模型或执行 probe；失败只公开可定位的脱敏 diagnostic，关闭、重开及重试使用新 job，旧轮询结果不能覆盖当前状态。

验证：`@agent-platform/ai-connect` 完整测试 29/29 通过；账号创建、连接面板与 stale-job 专项 18/18、112 个断言通过；Workbench 18/18 通过，整仓 `npm run check` 与生产构建通过。换包后 4173/4175 已重启，同源 health、任务列表及 provider integrations DTO 读取通过；没有输出任务正文。隔离 4174 fake-model 页面通过 DOM 实际触发 React 表单和按钮，完成发送、问题选项、草稿 v1/v2、确认、慢轮次停止、任务切换后恢复未发送输入，并确认 Enter 默认拦截提交、Shift+Enter 不拦截及授权面板没有前置模型选择；共享 Composer、单一助手正文、问题/草稿卡和空态图标不裁切均已实际呈现。最终截图 `browser-capture-final-timeline.png` 与 `browser-capture-final-account-dialog.png` 已视觉核验深色完整 Timeline/Composer 和深色账号授权抽屉；DOM 中两层 `data-appearance` 均为 `dark`，消息使用真实时间 11:39/40/41/43 PM，无“会话出错”或残留“正在生成结构结果”，需求草稿 v2 已确认。BrowserSkill 覆盖层拦截原生输入，因此不声明完整原生键鼠自动化通过；未进行真实 OAuth 或模型调用。隔离运行未写入用户任务、凭证或登录态。

## 共享模型访谈接入（2026-09-07）

需求访谈已接入 vendored `@agent-platform/ai-connect` / React 0.2.3。顶栏使用完整公共模型设置弹窗；用户显式保存共享选择后，单次 turn 冻结选择并通过公共结构调用，真实 typed 事件进入既有 assistant 消息并由公共 Timeline 投影显示。未选择时继续现有 Codex 配置；共享调用失败直接显示失败且不回退。其他模型用途不在本轮迁移范围。

验证：contracts、API、Workbench 三包类型检查和 Workbench 生产构建通过；合成 gpt-5.6-sol provider 的正式 coordinator fixture 证明 success/invalid JSON 两条路径、事件终态和 Codex 调用为0；API 跨站拒绝/同源读取套件通过。真实浏览器在正式 Workbench 打开完整厂商弹窗并完成同源读取；临时数据库由同一 coordinator 产生的真实任务显示单一调用组和唯一“结构结果生成完成”终态。临时服务与数据已删除，真实任务和凭证未改。真实厂商请求与 Windows 安装/构建未执行。

## F6 海尔隔离完整验收（2026-09-06）

用户授权的 v6 海尔中国官网冰箱目录计划已按正式 API/队列/BrowserService 路径完成。开发协调保持 `gpt-6-astra/high`；本轮实现、修复与真实执行由实际 `turn_context` 为 `gpt-5.6-sol/high` 的开发子任务承担。产品运行中只有枚举与字段链路的显式修复使用 Sol/high；最终独立复跑的三个步骤均为 0 次探索模型、0 次显式 LLM。没有使用额度重置卡。

| 验收 | 结果与证据 |
| --- | --- |
| 正式修复 | 枚举链 `da275791-8829-4a45-954c-9aebe51316fd` 以当前页 `extract_links` 过滤后的 URL/标题集合形成末页指纹；独立第15页验证 `bounded=false` 且走到 `finish`。采集链 `fd7492c5-200c-42df-b070-898549de6ac6` 用两条真实漏提页面作为 sample/verification，覆盖现代与传统标题结构。修复运行 `de67ac32-ec5f-4982-9f07-547cfeda8790` 为 `completed`、coverage `completed`、gaps 为空 |
| 最终零模型复跑 | 独立运行 `b0350454-aa0f-4564-a724-6fe9d59153dc` 为 `completed/replay`、coverage `completed`、gaps 为空。枚举 258 行/167 命令/29912ms，采集 258 行/1806 命令/427403ms，派生 258 行/0 命令/6796ms；合计 1973 命令、464111ms，三个步骤 exploration/LLM/audits 均为 0 |
| 目录覆盖与字段 | 枚举与采集均为 258 个唯一 stable key、258 个唯一 URL。名称、型号、商品链接空值均为 0，`missing` 行为 0，名称等于站点总标题的行为 0。独立验证与正式执行末页指纹同为 `5a5fa54fdaf646adff66463f938d516c4c725c4e379bbbe28fd8a1440d946208` |
| 时限与防浪费 | 普通节点在 AbortSignal 之外直接核对墙钟截止；signal 尚未触发时也会在下一个派生节点前拒绝。样本保留两个 checkpoint 代表窗口，verification 必须实际走到 finish。真实验收脚本在枚举完成时立即核对独立验证/执行指纹，不一致即正式取消，不进入全量详情回放 |
| 定向验证 | runtime 22 项通过，API chain/capture 15 项通过；contracts、runtime、API TypeScript check 通过，`git diff --check` 通过 |
| 本地数据隔离 | 正式结果只写入忽略目录 `work/f3-real-1788678265551`。用户京东任务 `42154dad-547f-4d88-ac67-c761ff8a4ba8` 的 interview/browser/research/plan/chains 五项 API JSON SHA-256 与执行前逐项一致；API 4175/PID19812 与 Web 4173/PID22976 保持原进程运行 |

可审阅摘要为 `work/f3-real-1788678265551/f6-acceptance-b0350454-aa0f-4564-a724-6fe9d59153dc.json`，258 行目录为同目录下 `f6-haier-catalog-b0350454-aa0f-4564-a724-6fe9d59153dc.json`，包含完整运行/链路/浏览器快照的 canonical 证据为 `f6-full-b0350454-aa0f-4564-a724-6fe9d59153dc.json`。这些运行产物不进入 Git。

## F6 浏览器阻塞复核（2026-09-06）

用户明确当前优先诊断海尔隔离测试为何阻塞。当前默认/显式标签页及先截图后点击的对照均真实从第1页切到第2页，商品链接集合变化；覆盖层在动作前后存在不证明动作被拦截，上次失败瞬间缺少足够诊断证据，根因仍未定位。15秒协助诊断确认提示进入DOM，但CLI返回RPC超时；官方源码显示人工等待与daemon传输期限相同，存在外层先到期截断业务timed_out回包的问题。上次300秒超时不能说明请求送达或用户未处理。详见 [BROWSER_INTERACTION_DIAGNOSIS](BROWSER_INTERACTION_DIAGNOSIS.md)。本轮没有恢复正式采集、调用模型或修改用户data/已安装BrowserSkill，诊断会话全部关闭。

## F6 执行、结果与生命周期（2026-09-06，历史实现与早期运行）

从干净的 master/2bb2093e8c0f3cbb90e505a4b6b69d66ae3e8db3 接续，主 task 01a075f9-7a58-7e82-8479-632f68138dd5 的实际 turn_context 为 gpt-6-astra/high，没有开发子 agent。仅当前保存目录开发、本地提交；没有推送远程或改动相邻项目。

- 正式队列默认执行完整上游来源集合，逐输入持久化检查点、稳定来源键去重、实际命令/时间/模型消耗及覆盖缺口。恢复保持同一运行并重新核验浏览器；复跑新建运行且固化链路不新增探索；修复独立授权到指定步骤，形成新链路版本，未验证下游保持等待。
- SQLite v7 保留既有计划/执行/链路，支持一个计划的多次独立运行。原始检查点页面只在忽略的本地运行存储中，结果导出剔除检查点页面和节点事件。API/UI按实际运行历史展示来源记录、步骤输入进度、覆盖/缺口、预算、归属和调用审计。
- 完整覆盖另行核验绑定起点、实际末页分支和字段。新增控件可用性与页面变化普通节点；末页下一页仍可点击时，需要真实点击后的无变化终态与独立末页验证指纹一致。商品锚点、循环上限和单次无效点击均不支持完整结论。
- 2026-09-06 用户明确授权3850条命令、24分钟、12次探索/修复判断、0次显式LLM的新海尔预算，已形成正式v6计划，步骤分配见 F6_ACCEPTANCE_PLAN。默认计划仍限制500条/300秒，历史运行预算不变。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 整仓169项通过：API69、workbench31、browser13、contracts10、model-runtime26、runtime20；work/f6-final-test2.log。整仓check通过；最终修复步骤选择器增补后workbench check通过，work/f6-ui-final-check2.log。构建日志work/f6-ui-final-build2.log |
| 协议/生命周期 | 全部上游输入、独立复跑与原历史不变、同运行恢复/状态核验/累计预算、去重、字段漂移暂停、跨任务拒绝、独立修复新版本及未授权下游暂停通过；程序较大上限不会扩大默认计划预算；实际末页分支与页面比较守卫通过 |
| 持久与故障 | 实际Node子进程SIGKILL后已完成来源和检查点保留，活动步骤变paused、运行变interrupted，未结算时间保守计入原步骤，重启不自动采集。v1至v7迁移、外键保存、冲突整体回滚和旧记录重开通过 |
| 真实旧预算运行 | 独立repair 0e82c8eb-e1e0-461e-92cc-f4dd040695e4沿v5枚举图批量输出258个去重目录链接，157条命令、32647ms、0模型/LLM。详情修复14条命令、90085ms、2次Sol/high调用意图（1次被中断），无详情产物；派生未启动。目录商品锚点不构成完整覆盖证明 |
| 已授权v6实测 | plan 8bca241e-0760-44b9-b6df-55ff93031e83；execution 0a5f476a-b8c6-4b84-abc1-08b03eeae132。目录探索57条命令、128811ms、6次完成且回报路由吻合的Sol/high判断、0显式LLM，分页点击/Enter均未改变商品列表，终态manual_required，尚无批量行。浏览器finally回收且原需求快照不变 |
| UI有限通过 | work/f6-ui-dom3.log通过13项DOM事件回归：空态、正式授权、实际批量结果、canonical来源行、复跑审阅与确认、独立运行/链路不变、刷新、390px无横向溢出和来源抽屉。work/f6-detail-diagnostic.png已视觉检查。后补修复步骤选择器通过类型检查/构建，原生操作待验 |
| UI与浏览器阻塞 | 原生任务切换返回ACK但任务未变（work/f6-ui-native3.log）；抽屉关闭后DOM为closed但退出动画currentTime持续0、焦点未恢复（work/f6-detail-diagnostic.log），尚未确定根因。海尔分页也无效果；请求人工协助后RPC在300秒超时，没有取得continued/completed，不能据此继续真实抓取。所属会话全部关闭，bsk session list为空 |
| 已处理/复验失败 | 首轮整仓与构建并行时，chain/plan进程夹具启动超时、storage进程测试总时限超时；无代码变化单独整仓复验169通过。修复授权下游误显running已修为pending并增加业务回归；人工状态文案不再笼统归为登录/访问限制。修复选择器可空value类型错误已修正，复查通过 |
| 未测门 | 实际站点同运行恢复、真实登录恢复、完整京东旗舰店及每页前100条评论、第二独立站点、真实Luna调用。海尔原需求仍是中国官网冰箱目录名称/型号/链接/缺失说明，不能用它冒充旗舰店评论验收 |
| 静态与基线提示 | 35个变更TS/TSX文件的文件500行/函数100行扫描通过；git diff --check通过。Vite既有主块超过500kB提示保留，具体字节数见最终构建日志 |

服务/数据收尾：开发前只停空闲API，备份work/f6-before-development.sqlite；现API4175/PID19812、原Web4173/PID22976运行，4173同源health通过。两任务的访谈/browser/research/plan/chains共10项完整API JSON哈希与开发前一致，work/f6-user-state-{before,after}.json均只保留哈希。用户DB v7 quick_check=ok、foreign_key_check为空；未新增用户确认或授权，旧JSON与数据保留。

真实证据在忽略的work/f3-real-1788678265551/f6-{execution,full,acceptance,haier-catalog}-*.json与f6-plan-v6.json。real-capture-full.ts --prepare会生成新计划，--execute/--repair/--replay会创建或推进正式运行，不用于只读查询；最终验收结论以上方“F6 海尔隔离完整验收”为准。

## F5 探索、链路与换输入验证（2026-09-06）

从干净的 master/42940c9823b9727fbb8d42a8b127c9b68ad8391d 保存目录接续；本阶段主 task 01a075b5-aaf0-7440-a3a8-0608bf2819e6 的实际 turn_context 为 gpt-6-astra/high，没有开发子 agent。只实现 F5，本地提交后以全新 local task 交接 F6，不推送远程。

- 正式队列默认接入 ChainService：逐步骤 Sol/high 探索、受控 DSL 编译、LangGraph 节点运行、样本与不同输入验证。SQLite v6 保存绑定计划/执行/步骤的链路版本、输入输出、观察哈希、节点事件、判断摘要及模型意图/回报审计。GET `/api/chains?taskId=...` 和现有画布显示真实事实。
- 普通节点不隐式调用模型；显式 llm 节点单独采用 Luna/medium 且默认预算0。命令按真实底层调用消费，步骤时间/探索/LLM分别执行授权上限；验证失败只在同一步剩余预算内重探，前置成功及已有样本保留。取消、受限、进程中断与未知调用分别保存，finally 回收会话。生成模型沿用 Terra/medium。
- 每组输入最多验证2个检查点，实际记录代表窗口结束或链路 finish；编译后的完整循环不被截短。新参数还须产生非空且不同的稳定来源键集合。代表验证通过不表示全量已完成；所有步骤通过后进入 awaiting_next_stage，完整执行/结果仍由 F6 接续。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 最终整仓 npm test 157项全部通过：API60、workbench31、browser13、contracts10、model-runtime26、runtime17；work/f5-final-test2.log。npm run check、npm run build通过，最新检查work/f5-delivery-check.log，构建work/f5-final-build.log |
| 协议与运行 | 授权→两步骤→换输入、0预算拒绝、底层命令上限、取消/晚到结果、人工限制、只重探失败步骤、前序及样本保留、显式LLM独立预算/用途、路由回报核验、30页循环/去重/零普通模型、循环耗尽非完成、无效边/环/临时ref拒绝、验证窗口与完整图分别执行通过 |
| 持久与故障 | 正式隔离路径创建活动探索后真实Node子进程SIGKILL，重开恢复interrupted，未回报调用仍null；SQLite v5→v6迁移及冲突原子回滚通过。无直接写库伪造运行成功 |
| 真实目录 | 沿用隔离work/f3-real-1788678265551、task fff00875-4d68-4fcd-ab82-340eedb57f4b、research ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed/v1。正式新计划94d2d2ef-25f5-40fc-947e-1b54dea68fd4/v5、授权执行be81221e-088a-4371-9e2e-aebfa66bc3b0；原需求快照前后不变 |
| 真实换输入 | enumerate链路335e6341-b3d2-497f-ac2f-e08e5ca70f39/v1 verified，12个实际节点；同一目录URL的分页输入1得到36个稳定来源键（2个checkpoint窗口），输入15得到6个（到达图finish）。81条底层命令、5次完成的Sol/high调用、103772ms。最新编译与输入效果守卫对已保存真实产物只读复核通过，未新增模型或浏览器 |
| 真实停止 | collect链路5fe2ec0b-8b1e-4033-a656-0cb2a9294bae在本步骤90000ms预算耗尽，7条命令、1次Sol/high调用意图被中断且未回报次数；无已编译采集图。派生未启动，整个execution为failed，前置已验证链路保留。总授权490命令/300000ms/11探索/0显式LLM不被重新分配 |
| UI组件事件 | browser-f5.ps1 -DomEvents 15项断言通过：空态、正式授权及canonical两步verified、步骤/节点参数与事件、刷新、390px无溢出/详情抽屉、刷新后跨任务隔离。模型和来源是隔离替身，数据全部由正式服务产生。work/f5-ui-dom-final.log |
| 真实内容布局 | real-chain-view.ts以planExecutor:null只读已有事实；browser-f5-real-view.ps1验证真实12节点图、collect预算停止及390px无横向溢出。work/f5-real-chain-{wide,390}.png已视觉核验，work/f5-real-ui-view3.log。截图后不继续把静态画面当交互证明 |
| UI环境限制 | 本轮原生输入回归未完整通过。bsk doctor正常，但read-only elementsFromPoint实际命中BROWSER-SKILL-OVERLAY，点击/Enter返回后控件未生效；未修改覆盖层。使用浏览器DOM控件事件补验组件与布局，不视为原生点击/键盘通过。原生Esc/焦点返回未测通过；DOM模拟关闭也未满足完整移除/焦点断言，改以刷新开始独立隔离检查。该限制须在F6重新核验 |
| 已处理失败 | 迁移旧断言v5→v6、模型wire测试补齐ephemeral/final_answer、全仓并发冷启动下既有storage-process子进程5秒就绪偶发超时（测试等待改15秒，产品预算不变）；重跑157通过。UI脚本补任务/计划语义就绪和限定实际详情选择器，不用ACK替代状态 |
| 真实早期尝试 | 原v1枚举75秒预算停止；v2计划生成未回报成功（严格schema属性可选是排查假设，修正required后新计划成功）；v3额外来源锚点步骤4命令用尽；v4枚举7模型预算耗尽。各次均保存真实失败；经正式新计划与新授权继续，没有在运行中改代码或静默增加预算。探索后续获得动作历史、页面差异和剩余预算 |
| 基线提示与未测 | Vite既有>500kB主块提示保留，当前960.39kB。真实完整三步骤、全目录覆盖/末页漂移、第二站点、真实登录恢复、独立复跑/同运行恢复/用户修复及完整结果导出由F6验收；没有真实Luna调用成功的声明 |

真实图的末页分支采用当时商品BCD-309WMCO作为目录快照锚点；F6必须检验当前总量、末页及漂移，不把36+6样本、固定页数或图finish当全量覆盖。证据保留在忽略目录的f5-plan-v*.json、f5-execution-*.json及work/f5-real-summary.json。real-chain.ts --real会执行，--new-plan会新增正式计划/授权；不要用作只读检查。旧real-plan-reopen.ts断言F4 queued，现在仅作历史验收脚本，读取F5用real-chain-view或正式GET。

服务收尾：SQLite备份work/f5-before-api-restart.sqlite；更新API后两个用户任务的完整访谈/浏览器/来源JSON哈希前后相同，work/f5-user-state-{before,after}.json仅存哈希。用户任务无新增计划、授权或链路。API4175/PID21836、Web4173/PID22976是当前快照；原JSON与data保留。隔离验收服务及BrowserSkill会话在交接前关闭。

## F4 正式计划、独立授权与持久队列（2026-09-06）

基于 master/42790f169cc28884238ba82ef2f1c7a645a8f049 的干净保存目录完成本阶段；项目命令始终 workdir=D:/work/browser-capture-tool。本 session 仅实现 F4，收尾后主动创建全新 F5 task，F5 完成再交接全新 F6；不 fork、不跨阶段并行、不推送。实际 turn_context `01a07596-ab8e-73c0-aace-3c42566478e5` 为 gpt-6-astra/high，本阶段没有开发子 agent。

- 正式 API：GET/POST `/api/plan?taskId=...`。显式 generate 使用现有 Terra/medium，保存独立 plan_creation 审计；生成中/失败/停止/崩溃恢复可查。计划绑定需求版本/revision、来源版本/摘要，保留完整需求、来源观察、步骤依赖、字段/目标/缺口映射、输入输出、终止/预算/风险。代表页字段和按确认规则生成的说明分别处理；F3 partial 不被一律拒绝，真正的用户待决缺口阻塞启动。
- 授权与执行：用户审阅后显式 start，将计划摘要、需求与来源版本、本次预算及队列记录原子提交。每计划一个初始授权，不同幂等键重复点击也不产生新运行。SQLite v5 的任务待处理/全局running约束与 BrowserService/Host 互斥共同保护；非调研调用必须核验队列授权。取消、版本变化、重启不会重放旧授权。
- F4 阶段出口：默认 PlanExecutor 未接入，授权持久 queued，界面明确等待探索执行器且尚未开始抓取。可注入的测试处理器证明 FIFO、单浏览器与停止回收；真实动作探索、图/DSL、逐步骤模型预算消费、换输入验证与完整生命周期由下一 F5/F6 实现。授权预算不是完整目录一定可在本次完成的承诺，达到上限应保留剩余目标并暂停。
- 界面：正式计划替换空结构样例，来源 partial 可进入计划页；步骤详情、完整范围、缺口分类、预算、授权/停止与版本选择都读取正式事实。任务摘要反映计划/排队/浏览器状态。修复共享 DetailPane 在窄屏没有 Dialog.Trigger 时 Esc 关闭不返回入口焦点的问题。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 累计140项通过：API51、workbench30、browser13、contracts10、model-runtime24、runtime12。整仓npm test通过后新增2项API崩溃/迁移测试；最终API51、workbench30及计划7项针对性复核通过，无失败/跳过。类型检查与构建通过，git diff检查通过 |
| 协议/持久化 | 完整字段与目标映射、伪造来源/字段拒绝、依赖环/预算越界、partial执行/派生与blocking、跨任务、过期摘要、同键与不同键防重、归档保护、取消/晚到结果、需求与来源变更、队列重启保留通过 |
| 故障与调度 | 真实Node子进程走正式任务→替身来源→计划/授权路径后SIGKILL，锁窗口后生成/运行恢复interrupted，未回报调用保持null；不直接写库制造成功。v4→v5原子迁移/冲突回滚通过；FIFO第二任务等首任务取消及浏览器finally回收后启动 |
| 真实规划 | `node --import tsx apps/api/tests/real-plan.ts --real`通过。沿用F3隔离正式任务fff00875-4d68-4fcd-ab82-340eedb57f4b、来源ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed/v1。计划f9f99277-d24f-44d8-8d75-e027d1d3cf33/v1为ready，3步骤：完整目录枚举→逐商品字段复核→缺失说明及覆盖验收。名称/型号/链接3页面字段和1规则派生字段全部保留；3个gap分别execution/execution/derived。实际1次Terra/medium调用，无新增浏览器命令 |
| 真实授权与重启 | 正式start重复请求仅生成执行6f45f603-298b-4beb-a047-92a4593ce439，queued；总预算480条底层命令/300000ms/6次首次探索模型调用。`real-plan-reopen.ts`重开服务后计划/授权逐项一致，重新校验真实引用通过，未触发模型/浏览器。隔离验收任务的需求事实不变 |
| 浏览器UI | `pwsh -NoProfile -File apps/workbench/tests/browser-f4.ps1`20项断言通过：空态、生成、取消、失败重试、预算审阅、步骤来源详情、唯一授权canonical核对、排队刷新、390px无溢出、抽屉/Esc/焦点返回、停止队列、来源版本更新、阻塞缺口、需求失效及跨任务。UI模型和来源页面是明确替身，所有状态经正式API生成 |
| 真实内容布局 | `browser-f4-real-view.ps1`读取真实计划与授权，宽屏和390px长文本无横向溢出；检查480命令预算、真实queued与派生规则。截图work/f4-real-plan-{wide,390}.png及work/f4-ui-390.png已视觉核验；所有BrowserSkill会话finally关闭，隔离4176/4177/4178均关闭 |
| 已处理失败 | 初次类型检查发现exactOptionalPropertyTypes的undefined选项；迁移旧断言期待v4；浏览器脚本初始语义树省略任务按钮、来源版本轮询和侧栏动画时序；均修复并复验。Esc焦点返回为实际组件缺口，已修复。不把命令ACK或轮询前旧状态当验收成功 |
| 基线提示 | Vite既有主块超过500kB提示保留，本次约947.58kB，未开展包体积优化 |
| 未测/接续 | F5真实动作探索、步骤模型路由及预算执行、图/DSL与换输入验证；F6全目录末页与全量、真实登录恢复、第二站点、断点恢复/复跑/修复。F4 queued不冒充运行完成。模型自由文本语义仍需审阅，结构校验不证明所有措辞正确 |

真实证据保留在忽略目录 `work/f3-real-1788678265551/{f4-plan-v1,f4-acceptance,f4-reopen}.json`。不应重复执行real-plan.ts来读取现有状态；它会创建新计划，已有待处理授权时正式门禁会拒绝。只读复核用real-plan-reopen.ts。F5可沿此隔离验收任务继续，不能把它混入用户data。

服务收尾：备份SQLite到work/f4-before-api-restart.sqlite，核验无活动访谈/调研/浏览器后更新API。两个用户任务的完整访谈、浏览器与调研JSON哈希前后相同，证据work/f4-user-state-{before,after}.json仅保存哈希。没有替用户确认草稿、生成计划或新增授权。API4175/PID18016，Web4173/PID22976；4173同源health和新/api/plan通过，PID仅作本次快照。用户data与旧JSON原件保留。

更新日期：2026-09-06。

## F3 真实来源调研（2026-09-06）

从干净的 master/b17dcccb7e624b9b5da42e7fbd92a44b19645a33 接续。本阶段只开发F3，未改动相邻项目、未推送远程；F4须在全新session继续。

- 实现：正式 `/api/research` 接收绑定需求版本的幂等启动、精确调研停止和带证据回访谈。SQLite v4持久化独立来源版本、查询意图、页面发现的候选、实际观察、字段/枚举原文证据、覆盖与缺口、用途审计和sequence。需求修改使旧来源待复核；重新调研产生新记录，已取得部分证据保留。
- 浏览器：F3仍只通过BrowserService。固定page只读表达式补充真实href；follow只允许首次调研访问本会话发现的链接，普通复跑不能动态扩权。URL/tab前后核验、敏感链接过滤、访问闸门、单会话/预算和finally回收均保留。模型选择E证据编号，服务提取原文；临时@eN仅出现在历史观察摘录，不作为操作参数。
- 模型：沿用官方账号、Terra/medium结构化判断，source_research单独审计；不开放模型shell或任意脚本。意图先写入，供应商未回报次数保持null；取消等待回调和模型关闭后再提交终态。Sol/high操作探索与Luna/medium显式节点仍是F5后续范围。
- UI：来源页提供显式启动/停止、版本Select、查询记录、已核验优先的来源列表、字段/时间/实际URL/枚举详情、覆盖缺口、刷新恢复和重试原请求。主区先展示最多12个候选，其余按需展开；详情复用Radix并排栏/右抽屉。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓 | 最终 `npm test` 129项通过：API42、workbench28、browser13、contracts10、model-runtime24、runtime12；`npm run check`、`npm run build`通过。日志在忽略的work/f3-final-{test,check}.log |
| 协议/持久化 | 无链接需求、真实候选引用、伪造URL/证据拒绝、缺字段partial、跨任务隔离、并发幂等、需求失效、回访谈幂等、受限/失败/停止/清理、迟到模型结果、关闭服务与重启interrupted均通过；v1/v2/v3到v4、迁移冲突回滚和浏览器历史保留通过 |
| 真实路径 | `npm exec --workspace @browser-capture/api -- tsx tests/real-research.ts --real`最终exit0：真实访谈生成并确认品牌/门类需求，经正式API搜索海尔中国官网→冰箱目录→代表详情。1次访谈调用、4次source_research调用，全部Terra/medium；3次实际页面观察、116个页面发现候选、2个采纳来源，终态partial |
| 真实证据 | `work/f3-real-1788678265551/acceptance.json`；task fff00875-4d68-4fcd-ab82-340eedb57f4b，research ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed。目录 https://www.haier.com/cooling/ 与详情 https://www.haier.com/cooling/20260731_293681.shtml 实际观察到名称、型号和链接；session jxhv所有权closed，23个底层完成命令均有用途/关联/哈希审计 |
| 真实覆盖边界 | 保留目录末页、跨页重复项与全量枚举未执行的说明；“字段缺失说明”是需求中的派生输出列，当前保守检查也记为缺页面依据。F4需结合已确认缺失策略审阅这些partial项、区分来源字段与计划生成的说明，不将代表页验收宣称全量抓取完成 |
| 最终UI | PowerShell7执行 `apps/workbench/tests/browser-f3.ps1`通过14项：空态、原生启动/停止、完成、来源详情、刷新、人工处理、失败、partial、390px无横向溢出/右抽屉、Esc、回访谈及canonical修订/失效。模型与页面是隔离替身，状态通过正式服务产生。截图work/f3-ui-390.png已视觉核验，测试服务4176/4177已关闭 |
| 已处理失败 | 前两轮真实调研因模型重写引文而unsupported_evidence，未提交假成功；改为证据编号后复验通过。初轮模型曾识别搜索验证挑战而文本闸门未阻止下一查询，现加入显式access语义闸门并用测试保证立即停止；不把这一早期行为列作通过证据。UI脚本曾用Windows PowerShell5导致参数转义断言失败，改用本机PowerShell7后通过 |
| 基线提示 | Vite已有主块>500kB提示仍在，当前约935kB；本阶段未做包体积优化 |
| 未测 | 真实人工登录/验证码后恢复、完整目录末页与全量采集、第二独立站点、自动跨域重定向处理、多搜索供应商切换与生产规模。普通测试通过不替代这些验收门 |

服务收尾：原API无活动任务，先完成SQLite备份至忽略的work/f3-before-api-restart.sqlite，再更新API与Web进程。前后两个用户任务的消息/草稿原文/审计/revision/确认哈希完全一致（work/f3-user-state-before.json仅存哈希）；未替用户确认或重跑。当前API4175/PID22744，Web4173/PID22976，4173同源health通过，`/api/research`已接通。旧草稿缺结构或未确认时继续显示实际门禁。所有BrowserSkill会话均已停止。

## F2 受控浏览器与正式服务接入（2026-09-06）

负责人认可最新采访基本达到要求，沿用现有提问方式。只给私有 skill 补充“对象纳入条件与字段缺失规则一致”；未重写用户草稿或新增产品模型调用。下文对旧记录的评审保留为当时证据，不覆盖这次负责人接受的基线。

- 实现：`packages/browser` 以 Zod 限定 task/run/需求版本/用途/域名/动作/命令和时间预算；普通动作从最新观察解析语义目标，不接收原始 ref、脚本或 shell。跨实例锁保持同一数据目录单浏览器任务；明确访问闸门返回待人工。观察支持有界可见文本等待，命令返回不等于业务效果通过。
- 生命周期：意图审计先于实际进程；日志仅保存用途、关联、命令名和实参哈希。取消禁止新命令并等待动作子进程退出，finally 只关闭所属 session；启动结果不明/关闭失败保留待清理事实，阻止新会话，不枚举关闭其他窗口。
- 服务与 UI：`BrowserService.run` 仅供内部编排调用，检查已确认版本和归档/活动访谈状态；SQLite v3 保存每次浏览器运行。GET `/api/browser` 按任务恢复事实，POST 仅支持绑定 runId 的停止/所属会话清理。来源页复用 Radix 显示空态、工作中、成功、失败、待人工、待清理；清理结束仍为 interrupted。F3 将提供调研启动与证据，不把浏览器命令数当来源数。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓 | `npm test` 114 项通过：api 33、workbench 25、browser 10、contracts 10、model-runtime 24、runtime 12；`npm run check`、`npm run build`、skill 验证与 diff check 通过。最后补动作响应 tab 校验后 browser check/test/真实 probe 和 API check 通过 |
| SQLite | v1/v2 到 v3 原子迁移、旧原文与确认保留、重复启动；正式服务任务隔离、重复 run 拒绝、跨任务取消/清理保护通过 |
| 真实浏览器 | `npm run probe --workspace @browser-capture/browser -- --real` exit 0：本地公开夹具导航 → 语义 Enter 到下一页 → 重新定位并点击返回 → 业务文本就绪 → finally 回收；23 个实际完成命令。`work/f2-browser-1788676205331` 保存审计与 closed 所有权；adapter 没有模型调用入口，0 不代表外部计费统计 |
| 界面 | 隔离正式服务 + 页面/模型替身经服务产生状态；`browser-f2.ps1` 通过空态、运行、原生停止、人工处理、刷新保留、失败、所属清理、清理非成功、正常结束。390px 仿真等待侧栏实际移除后无横向溢出，`work/f2-ui-390.png` 已视觉核验 |
| 已处理失败 | 旧迁移断言仍期待 v2；测试控制端请求缺少 JSON Content-Type；窄屏检查先前未等待 Radix 侧栏移除。均修复后通过 |
| BrowserSkill 环境 | 早期输入命令返回后没有页面效果，就绪等待/预算将其判为失败；只读诊断见自动化遮罩。CLI 自更新停在 Windows 暂存替换，停止空闲 daemon 后使用官方 release 且 SHA-256 核验的二进制更新至 0.2.0，doctor 通过。更新后初次仍有失败，不能把全部问题归因版本；最终前台 session、动作后语义核验通过，后续不得只凭命令 exit 0 判断业务完成 |
| 未测 | 真实登录/验证码人工恢复、真实站点来源调研、生产规模、跨机器恢复、窗口突然消失与浏览器版本升级回归。F3 仍需语义来源判定，访问闸门当前为保守文本识别 |

运行收尾：验收 BrowserSkill session 均已停止；4176/4177 隔离服务已退出。保留用户 4173/4175 原进程与用户数据，旧 4175 仍需正常重启才能加载新功能。构建保留既有 >500 kB 主块提示（当前约 925 kB）。F2 出口完成，下一阶段 F3 在全新 session 开发；不在本 session 接着实现来源调研。

## 需求草稿抽屉与用户实际运行复核（2026-09-06）

只读核验正式 API 最新任务 `42154dad-547f-4d88-ac67-c761ff8a4ba8`（京东海尔冰箱核心规格一次性采集方案）：8 次 Terra/medium 轮次均 succeeded、共 8 次已返回调用审计，7 次提问后得到 v1，尚未确认。频率与格式提问过多；草稿的“无法确认型号排除”与字段“无法确认型号留空”矛盾；未提供结构化 brief。4175 进程 15156 从本机 12:01:32 运行至检查时，仍为上轮未重启的旧 API。该记录不符合新版采访与结构交接预期，也不属于实际浏览器抓取验收。用户任务记录未改动、未代为确认或重新请求模型。

点击确认目前只持久化需求版本与确认记录，界面显示已确认；F3/F4 尚未接通，不生成正式计划、CSV 或浏览器运行。旧格式草稿不会被自动猜成结构需求。抽屉已明确显示当前确认作用。

草稿统一使用右侧 Radix Dialog 与 re-resizable 6.11.2，左边缘拖拽、键盘微调、同任务关闭重开宽度保留、窄视口约束；版本及节点下拉框改为 Radix Select，源码已无原生 select。新版不再把草稿挤成宽屏固定并排小栏。

验证：workbench 25/25 测试、workbench 类型检查、根构建通过（既有主块体积提示保留）。BrowserSkill 会话 gwng 的完整 browser-f1 回归通过：560→592 键盘、592→752 鼠标事件拖拽、版本切换/只读、菜单关闭、Esc/焦点恢复、重新打开宽度、确认/刷新/取消/重试、390px 限宽与页脚可见。bsk 0.1.11 无原生 drag 命令，拖拽测试向已观察握柄发送分帧鼠标事件并检查实际组件尺寸，未直接写组件状态；其余选择与键盘交互走原生输入。早期测试失败来自未等待 React 拖拽状态提交、菜单关闭动画和可访问树恢复，修正测试等待后通过。

证据：`work/drawer-ui-20260906-complete`、`work/ui-review/draft-drawer-390.png`。会话均在 finally 关闭，4174 隔离服务已关闭；保留用户 4173/4175 原服务。本次未重跑旧 browser-layout 全量脚本、真实模型或真实抓取；旧脚本已按新组件调整，当前浏览器证据以 browser-f1 为准。

根目录启动补齐：`npm run dev` 同时启动 API 4175 与 Vite 4173，浏览器访问 4173。使用隔离 `work/root-dev-acceptance` 实测根命令启动、页面 200、同源 API health/空任务读取；Ctrl+C 后 4173/4175 均释放。只改启动脚本/开发依赖/说明，未触发模型调用；未重复执行业务全套测试。

当前阶段：F1 任务与需求访谈正式化已实现并完成本次验收；后续按 ROADMAP 继续 F2/F3，阶段 0 的浏览器能力门尚未完成。

## F1 访谈质量与下一阶段交接修订（2026-09-06）

按本次用户反馈重做访谈的判断与输出：必要业务取舍才追问；名称等开放回答直接使用原输入框，无中间按钮；来源入口、品牌/店铺候选和枚举路径交给系统调查；可合理建议的默认值随草稿审阅。信息充分可以首轮形成结构需求。明确的全部范围、字段、数量与来源类型须保留；前 N 条说明排序和不足处理；纠正按语义更新整个草稿。

模型只输出 RequirementBrief；可读 Markdown 由共享渲染函数生成。正式 API 保存结构草稿，SQLite v1→v2 原子迁移，旧 Markdown 和历史确认保留且 brief=null。confirmedRequirement 只返回当前已确认 taskId/draftVersion/revision/brief，修改即失效。来源调研接收入口/代表样本/完整枚举方法/字段可得性的调查要求，完整批量枚举和采集由后续计划组织，不固定链路数量。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | `npm test` 100/100 通过：API 29、workbench 25、contracts 10、model-runtime 24、runtime 12，无失败或跳过；最终 UI 修改后再次通过 API 29 与 workbench 25 |
| 类型与构建 | `npm run check` 所有工作空间通过，`npm run build` 通过；保留既有 Vite 主块 >500 kB 提示 |
| 结构与迁移 | 开放问题、自然回答、版本交接、确认失效、缺失结构/猜造已提供 URL 拒绝、审计留存、v1 原子迁移/失败回滚/幂等重开及版本隔离通过 |
| 实际模型 | 正式任务 API + 官方 App Server + 私有 skill + SQLite，实际审计均为 gpt-5.6-terra/medium、每成功轮次 1 次。逐份人工核对输出，不把 schema 成功当成语义通过 |
| 品牌与纠正 | 完整品牌请求直接草稿；从海尔/20 条改成美的/30 条，最新草稿所有相关字段同步更新，无旧品牌或未要求的上海范围。证据 `work/interview-quality-1788672087932/brand-{1,2}.json` |
| 信息不足与补充 | 原示例仅问旗舰店名称、options=[]，补充京东海尔及字段/数量后直接草稿，未索要链接。证据 `work/interview-quality-1788671876780/open-{1,2}.json` |
| 非商品任务 | 省会/直辖市市级公共图书馆及分馆请求直接出草稿，保留全城市范围、官方来源优先和缺口；未带入商品/评论/京东模板。证据 `work/interview-quality-1788671876780/library-1.json` |
| 整个品类与委托发现 | 知名品牌范围由系统提出证据口径并调查名单；全量商品要求保留、默认评论排序明确、平台/官方旗舰店类型未扩大，调查输出为入口/样本/枚举方法/字段证据。证据 `work/interview-quality-1788672347764/category-1.json`；具体品牌依据仍需 F3 实查，不能把建议当成已核验事实 |
| 浏览器交互 | BrowserSkill vpgc、隔离正式 API 4174、显式模型 fixture：开放问题无中间按钮且仅一个输入框、历史选项只读、直接回复得到 brief、确认/刷新/纠正/跨任务/取消/失败重试与 804px 布局通过；读取 API 核验 decisions、drafts、turns、audits |
| 修复与失败记录 | URI format 供应商拒绝已定位并修复；早期真实输出混入批量执行、改名残片、排序缺失、来源类型扩大，分别收紧规则并回归。首次浏览器脚本把 option 与历史 draft_confirmation 混计为一个断言，修正测试后通过；产品历史事实正确保留 |
| 未测与限制 | 当前只证明选定访谈场景与协议/交互；实际入口发现、来源覆盖、正式计划生成、链路探索与整批抓取仍属 F2–F6，不声称已抓取京东或图书馆 |

界面证据 `work/interview-ui-20260906-final`、`work/ui-review/f1-lifecycle-804.png`。BrowserSkill 会话均 finally 关闭，4174 fixture 服务已关闭；用户原有 4173/4175 开发服务保留，需重启根目录 `npm run dev` 加载新 API。所有模型原始验收记录保留在忽略的 work 下，不进 Git。首次被供应商拒绝的调用没有成功审计，实际计数未知，不补造零。

真实验收入口：`node --import tsx apps/api/tests/real-interview.ts --real`，可加 `--case=brand|open|category|library` 选择单个场景；创建隔离任务并使用实际模型，不纳入普通 `npm test`。脚本负责记录状态与审计、拒绝技术失败；语义质量按上表人工复核，不宣称所有措辞和所有未测业务都已自动验证。

开发协作仅核对本次 turn_context：主控 `01a07518-d820-7020-8ca3-5af71b2564d0` 为 Astra/high；存储 `01a0751b-15fa-7b32-b1b2-d73f82e24a4b`、UI `01a0751b-5f40-7f30-b276-6e42fa9e622d`、独立泛化检查 `01a0751f-a644-7db3-b38b-ea751fbb3b4e` 均为 Sol/high，最多两个子代理同时运行。泛化子代理检查只是独立开发审阅，真实 Terra 验收另行记录。

## F1 正式任务与访谈（2026-09-06）

本次基于唯一交接文件及实际工作目录实施，保留全部未提交原型。实际创建两个开发子代理：f1_storage 负责 database/迁移与存储测试，f1_api 负责 Fastify/访谈生命周期与测试；主控负责共享契约、工作台、集成与浏览器验收。只读取本次 turn_context 核验：主控 turn `01a072e9-e586-7063-9258-6b7f1688779f` 为 Astra/high；存储 turn `01a072ea-b9dc-70b3-9ba5-3c50be01f12f` 与 API turn `01a072ea-f89b-7d20-aa6b-db7d46f7e209` 均为 Sol/high。

交付路径：正式 API 新建任务 → 持续访谈 → 选项决策/草稿 → 独立确认 → 刷新及重启继续。SQLite/Drizzle 保存任务、消息、轮次、未决问题、明确决策、版本草稿、确认、审计与操作去重。旧 JSON 保留原件、事务导入一次；同一目录独占，模型调用在事务外。用户原文保真，新输入使旧确认失效；取消按 turnId 持久化，迟到成功不能提交草稿。

| 验证 | 本次结果与边界 |
| --- | --- |
| 全量普通测试 | `npm test` 91/91 通过：API 23、workbench 23、contracts 9、model-runtime 24、runtime 12；无失败或跳过。历史 62 项不是本次验收依据 |
| 类型与构建 | `npm run check`、`npm run build` 通过；Vite 仍有主块 >500 kB 提示，未开展包体积优化 |
| 正式启动入口 | 隔离 `work/f1-startup` 执行 `npm start --workspace @browser-capture/api`；4175 health、构建页面和空任务列表读取通过，没有触发模型；启动检查后关闭服务 |
| API/事务 | 命令幂等、原文空白保留、跨任务隔离、归档保护、草稿确认/失效、取消提交竞争、错误与失败重试、观察断线继续通过 |
| 迁移与进程 | 保留原 JSON、重复导入、损坏与冲突全批回滚；真实 Node 子进程 SIGKILL，立即重启拒绝锁，stale 窗口后新进程恢复 interrupted；历史消息/草稿完整且无永久 active |
| 工作台布局 | BrowserSkill 会话 zbgy：原有六消息/五视图、草稿版本、宽屏侧栏、804px 抽屉、Esc/焦点、节点画布、两任务输入/视图隔离、重命名/搜索/归档恢复通过；旧访谈事实与审计不变 |
| F1 可操作界面 | BrowserSkill 会话 vgav：正式新建→替身提问→选项→草稿确认→刷新、慢轮次刷新重连、另一任务可编辑但阻止发送、取消无新草稿、失败/重试不重复用户原文、804px 输入可见与无横向溢出通过；正式 API 核验 decisions/turns/drafts/audits |
| 修复与失败记录 | 初始 app.ts unknown 类型错误已修；浏览器初次访谈读取失败定位为 fetch 接收者绑定并修复，后续回归通过。开发中新增测试的中间失败已修复，无保留基线失败 |
| 真实调用边界 | 本次没有新增真实模型调用；沿用官方 adapter/登录/skill，故障与 UI 生命周期使用明确标记的 fixture。来源搜索、产品 BrowserSkill 执行、京东与第二站点抓取均未实施 |

隔离验收数据：`work/f1-ui-20260906`；截图：`work/ui-review/layout-*.png`、`f1-lifecycle-804.png`。BrowserSkill 会话均在 finally 关闭，4174 替身服务已关闭。正式入口为 `npm start --workspace @browser-capture/api`（默认 4175，构建后提供页面）；Vite 4173 代理正式 API，原 server/ 文件仅留作兼容测试。

未测：新正式路径的真实模型轮次（既有 adapter 真实证据保留在下文）、长时间/大量任务性能、多机部署；F2–F6 按 ROADMAP 另行实现。当前没有阻碍 F1 完成的环境卡点。

## F1 前文档收口记录（2026-09-06，历史）

负责人决定原型先保留，整合界面/开发文档后在新会话开发功能。新增 DEVELOPMENT_BASELINE.md 作为统一入口、UI_STATES.md 作为逐功能状态与交互验收清单；ROADMAP 给出 F1–F6 依赖顺序，首项为 F1 任务与需求访谈正式化。原型是布局基线，不是所有状态画面的最终签核。

已统一中窄屏详情为抽屉、真实多任务访谈的采用状态，以及“100 条首版规模验收”和各任务确认范围的区别。文档职责分开维护，当前功能/证据边界不再由历史原型段落推断。本轮仅改文档，不新增产品调用或重跑上一轮完整测试；上一轮验证证据保留如下。源码尚有未提交修改，master 的 HEAD 为 5df30db，接续必须使用当前工作目录，禁止回退或遗漏这些修改。

## F1 前原型：多任务与全页面信息分层（2026-09-06，历史）

布局基线见 WORKBENCH_LAYOUT.md：左侧任务列表 → 当前任务 → 五个独立可切换视图。列表只显示名称和关键状态；新建、搜索、重命名、归档与恢复已接通。持续对话与节点画布保持主区；草稿、节点与审计采用宽屏右侧并排/窄屏右抽屉；计划补充字段就地折叠；短弹窗用于重命名。未生成的来源、计划与结果显示真实空态，结构样例显式打开。

真实访谈沿用 assistant-ui、私有 interview-browser-task skill、官方 Codex App Server 的 ChatGPT managed 登录与 Terra/medium。用户原文、助手回复、问题和草稿卡按轮次保留；确认绑定任务、版本和 revision。新输入使旧确认失效，历史草稿只读。模型/auth/私有 skill 本轮没有重新选型。

任务元数据保存在忽略的 data/tasks.json，每个任务独立保存 data/tasks/<id>/interview.json。旧 data/interview.json 复制迁入 legacy，原文件保留。列表写入串行，访谈接口显式携带 taskId，不存在的任务拒绝处理而不回退。已访问的任务保留视图实例，切换保留输入、页签、节点和详情选择；服务端记录与选中任务可在刷新后恢复，视图临时状态不承诺跨刷新保存。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓检查 | npm run check、npm test、npm run build、git diff --check 通过；62 测试（workbench 19、contracts 7、model-runtime 24、runtime 12）。JS 主块 875.62 kB，仍有 >500 kB 提示 |
| 多任务协议 | 新建不调用模型；消息/提示词/草稿/确认隔离；活动轮次归属、错误任务取消不影响原任务；运行中禁止归档；重命名、归档恢复、重启与旧单会话复制迁移均通过 |
| 浏览器多任务 | 4174 隔离服务：新建、重命名、搜索、归档恢复、归档只读；A/B 独立未发送输入、五视图上下文、当前页签/样例节点选择保持；空任务不继承真实消息、草稿或调用审计 |
| 信息层级 | 宽屏草稿为 380px 并排侧栏，主区仍约 798px；历史草稿只读；来源补充说明、计划预算/条件、审计轮次默认折叠；六节点画布与条件详情保留 |
| 响应式 | 1458px 深色与 804px 浅色已看截图。窄屏任务列表左抽屉、草稿与节点右抽屉，Esc 关闭并恢复焦点，输入在视口内、页面无横向溢出、关闭节点详情后画布保持主区 |
| 真实模型证据 | 复用此前三次 Terra/medium 成功调用：需求 → 范围问题；完整回答 → 草稿 v1；页面纠正 20 改 30 → 草稿 v2。本轮布局验收未发送消息、未增加模型调用，legacy revision 与审计数不变 |
| 验收脚本修正 | 等待重命名保存/弹窗退出的语义状态；几何查询仅定位可见任务，避免测到为保留状态而缓存的隐藏任务。修正后完整回归通过 |
| 数据与释放 | 仅 work/interview-acceptance 新增空验收任务；4173 主任务列表仍为空，未写测试消息。BrowserSkill 会话 finally 关闭；无应用异常，扩展自身 chrome-extension://invalid 错误单独归类 |
| 未测 | 跨任务滚动阅读位置尚未单独做定量断言；本轮不新增真实模型取消、跨客户端并发或大规模任务列表压力验收。最终补充的另一任务运行时允许编辑/阻止提交逻辑通过类型检查，未模拟真实慢模型在浏览器中验收 |

截图在忽略的 work/ui-review/layout-*.png；自动化入口为 apps/workbench/tests/browser-layout.ps1，browser-ui.ps1 兼容转发。脚本必须使用已有 legacy 真实三轮记录的隔离 4174 服务，只创建空任务与操作视图，不调用模型。

实施边界：多任务访谈文件保存已完成，但不等于 Fastify/Drizzle 的正式事务或浏览器运行队列。Decision/Unresolved 尚未独立成表；真实来源搜索、BrowserSkill 样本核验、正式计划、可执行链路及真实抓取尚未接通。静态 dist 不包含本地后端，当前未完成独立部署交付。

## 阶段 0 基础设施与历史检查点事实

- 负责人已确认 README 中的首版范围，领域词汇已落档；新增文本/表格/链接抓取与附件来源链接、独立复跑结果与中断恢复、多任务排队及单浏览器任务执行约束。
- 本地分支 `master`，未配置远程。本检查点包含npm workspaces、Zod契约、LangGraph/SQLite原型、官方Codex adapter与Radix/React Flow工作台；仅授权本地Git提交。
- 已查询官方 Codex 配置资料并收敛开发期模型规则：主 agent 固定 GPT-6 Astra high；所有开发子 agent 固定 GPT-5.6 Sol high，包括简单任务；同时最多两个。项目配置与角色文件已同步，并已通过实际 `turn_context` 核验：主控 turn `01a071c8-660d-7ac0-ae73-8acad7b85a16` 为 `gpt-6-astra` / `high`，S0-06 开发子任务 turn `01a071c8-e4d4-72d3-b4a3-630b806ef340` 为 `gpt-5.6-sol` / `high`。
- 负责人已确认技术方向：TypeScript/Node.js 24/npm workspaces/React/Vite/Fastify/Zod，assistant-ui 与 React Flow 优先验证；SQLite/Drizzle/本地文件；LangGraph JS 优先原型、XState 对照；受控版本化节点图与浏览器动作规则；本机 Codex App Server 与现有官方登录；产品模型 Terra medium、Sol high、Luna medium；按商品/步骤恢复；本地 Git 分阶段提交且无远程推送授权。开发期模型规则与产品运行时路由分别管理，产品路由未变。
- 已澄清开发任务派发规则：任务先记录目标、输入、依赖、文件范围和验收；不明确时由主 agent 先澄清拆分；所有开发子 agent 均使用 Sol high；启动后核验实际 model/effort，不一致不接受为完成。
- 已核对 LangGraph JS、XState、SQLite/Drizzle、Codex 子 agent 配置和 App Server 的官方资料，并在 RESEARCH.md 记录候选、代价与待验证门。
- 既有单 SKU 探索与复跑 MVP 是历史组件证据；本项目的完整旗舰店与第二站点验收尚待执行。
- 阶段 0 已澄清设计系统要求：优先验证成熟成品组件库，统一语义 tokens 与允许的 variants；页面布局独立按新产品需要讨论。
- R-004保留设计系统参考；S0-04已实现Radix成品组件、两主题统一Token与可操作演示。已通过真实浏览器检查并交负责人查看，视觉/流程反馈待返回。
- 已只读核验 `domain-analysis` 的 `master/93a57b6` 干净及现行官方App Server接入。本项目锁定CLI `0.150.1`，使用既有ChatGPT managed登录，完成一轮真实结构化需求聊天及一轮真实中断，不读取或保存凭证。

## 初始检查点验证证据（UI 为旧版记录）

| 项目 | 结果与边界 |
| --- | --- |
| 开发模型 | 本轮主控Astra/high；UI、S0-07、S0-08均为Sol/high；最新收尾turn `01a071e3-8850-7412-8eaa-f5c7c212fa49` 已核验，不以配置代替实际元数据 |
| 集成测试 | `npm test`：48项通过，UI5、contracts7、model-runtime24、runtime12；无失败/跳过 |
| 类型检查/构建 | `npm run check`全部workspaces通过；`npm run build`通过，Vite7.3.6，JS497.51kB/CSS719.45kB，尚未做包体积优化 |
| 普通引擎 | 30项有界异步循环、同运行稳定键去重、独立runId、workflow/version/输入指纹不可变、同实例互斥均通过 |
| 持久恢复与释放 | 官方SQLite checkpointer：32项在第17项暂停，新Node进程恢复至32项；所有测试finally关闭连接并清理精确临时目录；close重复安全 |
| Abort/副作用边界 | 实际异步adapter收到AbortSignal；checkpoint保留running/planned，恢复经核验stub与同一幂等键重入，不承诺exactly-once |
| 模型审计 | `modelInvocationIntents`由受控调用意图事件派生；0仅证明原型未进入显式网关。记录意图与实际供应商请求之间仍存在崩溃窗口，不作为计费证明 |
| XState对照 | 5.32.6实际恢复测试确认活动invocation重启；只保留对照，不维护第二套执行层 |
| 官方模型真实probe | 2026-09-05 22:07（本机时间），normal约17.8秒：Terra/medium，完成2步草案并本地Zod通过；interrupt约7.2秒：interrupted，无completed，两次均closed且进程exit0 |
| 真实流证据 | normal收到userMessage/agentMessage生命周期；未收到commentary delta。commentary增量转发目前只有协议替身测试，不声称真实文本增量通过 |
| 依赖审计 | 完整锁文件（含开发依赖）官方npm audit为0项已知公告漏洞；未使用force或legacy peer绕过 |
| 真实抓取 | 京东旗舰店与第二公开站点均未开始；当前没有BrowserSkill活动会话 |
| UI真实浏览器检查 | BrowserSkill会话qafv完成需求编辑、确认、模拟排队/启动/暂停/恢复/完成、样例结果和主题/弹窗操作；kyyy复查主题控件。两会话均已stop；704px视口没有横向溢出 |
| UI视觉修正 | 深色ReactFlow缩放按钮计算色为rgb(238,238,236) / 背景rgb(34,34,33)，面板圆角4.275px；浅色强调文本使用amber11；保留ReactFlow默认署名 |
| 视觉反馈门 | 工作台http://127.0.0.1:4173/可查看，已提供异步反馈入口；模型与编排独立原型继续推进 |

## 本轮影响

- 架构影响：澄清独立产品边界与已确认技术方向；具体模块、公共接口与运行组件仍待原型验证。
- 事实归属：README 保存首版需求，CONTEXT.md 保存词汇，ROADMAP.md 保存阶段计划，本文件保存当前进度，RESEARCH.md 保存技术候选与证据。
- 公共接口：初版图schema拒绝重复ID、悬空next与未知字段；公共运行请求拒绝注入游标/结果/计数。尚非完整可执行DSL，需补动作参数、受控条件和图编译。
- 复用资产：BrowserSkill 官方能力与既有隔离 MVP 的验证方法；后续产品代码承担链路领域规则、薄 adapter 和用户流程组合。
- 本轮实施：两个Sol/high子任务依次完成模型规则、UI、官方模型adapter及引擎恢复；Astra/high审阅并修正路由核验、中断时序、调用意图命名和主题可读性，负责真实probe与集成验收。

## 历史下一步（已由本页首节取代）

1. 按 PRODUCT_FLOW.md、INTERVIEW_UI.md 和 WORKBENCH_LAYOUT.md 继续 S0-09：将已接通的多任务/assistant-ui/私有 skill/真实访谈切片迁移到 Fastify、Drizzle 产品会话事务，完善 Decision/Unresolved、取消与恢复；然后独立接通真实来源调研与计划。
2. S0-10建立受控BrowserSkill adapter及权限/会话回收原型，再验证可执行DSL编译；不能把现有示意节点图当作执行器。
3. 上述门通过后做阶段0选型评审。京东旗舰店与第二站点属于后续真实来源验收，当前均未开始。

未测范围还包括：产品多任务队列、跨实例互斥、SQLite多进程锁冲突、实际浏览器恢复、探索Sol/high及显式节点Luna/medium的代表性任务。当前没有环境阻塞导致的测试失败。

交付状态：本地源码检查点与可查看的UI演示；无远程分发、跨电脑迁移或完整抓取产品交付。
## 公共 Question 真实消费者接入（2026-09-10）

B-A-T 已通过既有 `ai-connect:sync` 接入 `@agent-platform/ai-connect@0.3.2` 的公共 Question 能力。新问题由公共 authoring policy 投影为公共 choice/free_form Question；正式 choice 要求二到三个选项且恰好一个推荐项，choice 同时带可选 `follow_up` 补充输入。提交由公共 normalizer 校验完整 Surface answer set，选项与补充作为一次 compound answer 原子提交。

职责边界：公共包拥有 question-panel 结构校验、Question/Surface 组装和 submit 归一化；B-A-T 保留 interview decision/unresolved/brief、任务互斥、revision/requestId/cancel 与 SQLite 提交权。回答历史继续使用消息 body 的既有 JSON envelope，保存公共 `surface + surfaceSubmit`；旧压缩题只保留兼容读取，不成为新题事实源。浏览器侧从 `ui-contracts` 的 browser-safe 出口读取纯 Question helper，服务端 authoring 使用 `integration/authoring/question`。

原始 red 命令：

`PATH=/Users/guojunxi/.nvm/versions/node/v24.12.0/bin:/usr/bin:/bin npm exec --workspace @browser-capture/workbench -- tsx --test --test-name-pattern='正式采访决策题|补充文字|compound choice history' tests/chat-timeline.test.ts`

结果为 3 项中 1 通过、2 失败：选择题 Surface 缺少 `data.inputs`；带补充的 decision 无法通过 label 反解恢复 answered interaction。最终同命令 3/3 通过。

最终验证：contracts tests 16/16、workbench tests 30/30、本能力 API/HTTP focused tests 5/5；contracts/API/workbench `tsc --noEmit` 全通过；`npm run build` 通过（保留既有 >500 kB chunk 提示）。完整 API 套件本轮观测为 83/87，余下三个失败属于非 Question 的 provider/audit 生命周期断言，不作为本能力通过证据。未启动服务、未调用模型、未运行真实浏览任务；Windows 未实机验证。

同步制品：release manifest SHA256 `ab394c405548b945d0db4a39d5f10335eb8d26506ed2241af2eefe439b494e50`；core SHA256 `3c17954c4726a7d5ad02ca1c621fd404b38fee9e59595d8b8a2d8cb64d60d025`；React SHA256 `93b6baab5be0318d652f3318c2057a3b077d0d02f9d6a332c27414ffae708945`。根 workspace 显式复用既有 Zod 4.1.8 作为 core/react required peer host；`npm ls zod --all` 显示 AI Connect、React 与 Drizzle 均 dedupe 到 4.1.8，lockfile 无 AI Connect package-scoped Zod。
