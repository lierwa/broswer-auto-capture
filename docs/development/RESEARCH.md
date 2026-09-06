# 调研登记

当前采用状态和开发阅读顺序见 DEVELOPMENT_BASELINE.md，实测完成度见 PROGRESS.md。下文保留历史调研依据；日期较早的候选或原型记录不代表当前产品实现状态。

## R-012 F5 探索、动作链路与代表验证（2026-09-06）

沿用已锁定的 LangGraph、Zod、BrowserSkill、ReactFlow 和 Radix，不新增引擎或图编辑基础库。`capture-compiler` 校验受控动作、边与可达性、显式结束以及所有环都经过有界 loop；循环耗尽必须走 stop，不能把安全上限当完整结束。动作参数只支持语义目标和受控输入占位，不接收任意脚本、持久 @eN 或页面执行代码。跨边界立即 Zod 校验。

官方 [App Server](https://learn.chatgpt.com/docs/app-server) 的模型/effort 参数沿既有 managed 登录适配。用途路由固定为访谈/来源/计划 Terra medium、首次探索/用户修复 Sol high、显式 llm 节点 Luna medium；修复产品入口属 F6。普通节点没有隐式模型能力。意图先持久化，未回报调用保持 null，实际回报路由严格核验。供应商严格对象 schema 需要全部属性出现在 required；本地兼容旧计划缺省 maxLlmCalls=0，生成 schema 明确要求该字段。

探索模型获得当前观察、内存中的已做动作/页面差异、剩余预算和失败原因，服务只保留观察 URL/哈希与判断摘要，不把原始页面内容写日志。命令、时间、探索调用、显式 LLM 调用各自受授权约束；同一步最多两版本重探共享原预算和截止时间，前置已验证步骤保留。调整步骤预算必须新计划和独立授权。

F5 每组输入最多验证两个 checkpoint，记录 termination=validation_window 或 finish。DSL 保留完整循环；F6 全量执行不传此窗口。换输入不仅要有已观察到的不同参数，还要求实际稳定来源键集合非空且不同。链路已验证不等于整个需求已完成，前序样本也不是完整批量输入集。

真实海尔目录编译出12个节点，分页输入1得到36条，输入15得到6条，5次 Sol/high 回报、81条底层命令。当前终止分支用当时末页商品 BCD-309WMCO 作页面锚点，属于该目录快照；F6 必须核验当前总量、真正末页、重复项及结构变化，不能仅凭锚点或 finish 宣称全覆盖。collect 在90秒步骤预算处停止，派生未开始。完整三步骤真实验证、全目录、第二站点和生命周期仍为后续验收门。细节与运行 ID 见 PROGRESS。

## R-011 F4 正式计划与授权（2026-09-06）

复用现有 Codex App Server Terra/medium、Zod、SQLite/Drizzle、BrowserService 和 Radix；未新增运行依赖。计划制定是独立的 `plan_creation` 用途，一次显式模型判断，在服务端校验后持久化；规划不打开浏览器。输入为已确认 RequirementBrief 与真实 ResearchRecord；模型不接收宿主工具、原始页面、任意 URL 执行能力或数据库写能力。

计划保存需求版本/revision、来源 id/version/内容摘要、完整需求、采纳来源、步骤图及字段/目标/缺口处理。每项需求字段和调研目标必须完整唯一映射；页面字段必须有同名实际来源依据。派生或允许缺失字段须引用已确认 constraints/proposedDefaults 的索引，页面字段与说明输出分别展示。每个来源 gap 都需解释并分配执行、派生或阻塞；requiresUser 的缺口必须阻塞。该机制结合模型语义判断、结构校验和用户审阅，不声称自由文本的所有语义均由静态规则证明。

预算以现有 BrowserHost 的单会话硬边界为上限：全部步骤合计最多 500 条底层命令、300000ms、12 次首次探索模型调用，计划可更保守。预算不改变完整目标；耗尽应暂停并保留剩余范围，扩预算或新增来源产生新计划与授权。F4 校验/保存逐步骤预算，浏览器入口执行本次总命令/时间上限；逐步骤模型调用门、探索、验证和恢复接续由 F5/F6 执行器实现。当前真实验收计划的总预算为 480 条、300000ms、6 次探索调用，不表示足以完成整个目录。

SQLite v5 原子增加 plans/executions；授权、队列与请求幂等在同一事务提交。唯一约束限定每计划一个初始授权、每任务一个待处理执行及全局一个 running。FIFO 队列复用已有 BrowserService 的进程内锁及 BrowserHost 的跨实例锁，清理待完成时不占用浏览器。非 source_research 浏览器调用必须通过队列校验 task/run/版本/来源域/预算，F4 只为已绑定 running 的 exploration 放行。

F4 默认没有 PlanExecutor，授权记录持久停留 queued 并显示“等待探索执行器接入；尚未开始抓取”；`PlanExecutor` 是 F5 注入的内部依赖。测试处理器只验证串行调度、取消与回收，不是站点探索证明。进程重启时 generating/running 分别转 interrupted，queued 保留；需求/新来源使旧计划待复核，尚未开始的旧授权由队列转 stale。恢复不自动重放。真实范围、预算与队列证据见 PROGRESS。

## R-010 F3 真实来源调研（2026-09-06）

复用 BrowserService、BrowserSkill 0.2.0、SQLite/Drizzle、现有 Codex App Server 和 Radix；未新增运行依赖。正式入口为 GET/POST `/api/research?taskId=...`。模型仍通过 [App Server 的结构化输出](https://learn.chatgpt.com/docs/app-server) 返回判断，沿用 Terra/medium；首次操作探索 Sol/high 与显式节点 Luna/medium 仍由后续阶段实现。宿主 shell、插件和网页搜索工具保持禁用，浏览器动作全部经过受控服务。

浏览器语义观察实测不含 href。固定只读表达式只提取当前地址、标题和最多150个可见链接，并检查 `ok=true`、tab与观察前后URL一致。表达式不能从 HTTP 或模型输入替换。动态 `follow` 只允许 source_research 用途访问本会话真实发现的目标；Bing跳转目标仅从真实 href 的编码参数解码。搜索入口是固定的通用搜索服务，具体品牌/站点/商品 URL 由页面发现。登录与秘密参数链接过滤，明确访问闸门由文本和模型语义两层停止。真实验证见PROGRESS。

来源调研单次上限为5次查询、10个代表页、16次显式模型判断、180个底层命令和5分钟；一个会话串行使用浏览器。需求没有链接时仍可搜索，confirmedRequirement负责有效结构需求门。SQLite v4用独立调研记录保存版本、查询、候选、观察摘要哈希、选取的公开证据、覆盖/缺口、模型用途审计与单调sequence。页面原文只在内存传递；模型选E编号，服务从该次观察提取对应原文，防止模型重写引文或猜URL成为证据。证据中的@eN仅是历史观察引用文本，不得成为后续链路定位参数。

候选不等于已观察，搜索页不作为采纳来源；缺字段/调查目标/枚举依据保留partial。当前覆盖检查较保守：需求中派生的“字段缺失说明”也可能被报告为无页面字段依据。F4需依据已确认缺失处理规则区分页面采集字段与计划产生的说明字段，并审阅partial中的实际影响；不能静默忽略真正的来源缺口，也不能要求F3先完成全量采集。本阶段未冻结自动跨站重定向放行、搜索服务自动切换或完整分页采集。

停止先中断浏览器和模型，等待回调退出再提交终态；崩溃后的running转interrupted，审计次数未回报保持null。重新调研产生新来源版本，历史保留；需求变更产生stale投影。界面复用Radix Select/Callout/Button/DetailPane，支持历史版本、来源详情、重试原请求和带证据回访谈。

## R-009 F2 BrowserSkill 受控适配与生命周期（2026-09-06）

采用固定 BrowserSkill CLI + Node spawn 参数数组的薄适配，复用已有 proper-lockfile 4.1.2 与 SQLite/Drizzle；不新增浏览器驱动或模型执行器。以实际 `session start/stop`、`tab list`、`observe`、`navigate/click/fill/press --help` 和本地真实页面核验协议。CLI 0.2.0、扩展 0.2.0、daemon protocol 1.1 当前 doctor 通过。命令形状通过 Zod 校验，语义动作重新观察，临时 ref 不作为外部输入；动作返回还校验 tab 归属。

本机初始 CLI 0.1.11 出现更新提示但 Windows replacement helper 未完成替换。空 session 列表后停止 daemon，以[官方 0.2.0 release](https://github.com/Tencent/BrowserSkill/releases/tag/cli-v0.2.0) Windows 压缩包完成更新，下载 SHA-256 为 `57c0459711125c4a5c7f5759ef15b5e45c942e69afa43aaf22bfa06f7fec4590`，与 GitHub release asset digest 一致。旧二进制备份仅在忽略的 work/tools 中，不纳入交付。

真实调试曾见输入命令返回但页面不变；只读命中检查指向自动化遮罩。[官方交互实现](https://github.com/Tencent/BrowserSkill/blob/cli-v0.2.0/apps/extension/src/tools/interaction.ts) 本身负责自动化期间遮罩与原生输入，产品没有注入遮罩修改脚本。不能由该观察推定每次失败原因相同；最终采用正常前台 session、最新语义定位与有界可见文本核验，通过真实 Enter 和 click 的两段导航。命令预算耗尽/就绪超时仍是失败，不能盲目重复点击或把命令 ACK 当业务完成。

服务按任务/需求版本授予内部能力；HTTP 仅暴露状态及绑定 run 的停止/清理。所有权不明时阻止新任务；明确 session 才能做定向恢复。当前保守文本闸门只负责停止与待人工状态，F3 仍要用真实来源观察判断页面归属、字段和覆盖；完整实际站点、登录恢复与规模另设验收门。证据见 PROGRESS 的 F2 段。

## R-008 需求草稿可调宽抽屉（2026-09-06）

草稿统一使用 Radix Dialog 管理模态、Esc 与焦点恢复；宽度拖拽复用 [re-resizable](https://github.com/bokuweb/re-resizable) 6.11.2 的 size、左侧 handle 与 onResizeStop。握柄使用 Radix IconButton 补充方向键/Home/End，业务层仅保存任务内宽度偏好并按视口约束。版本和节点选择复用现有 [Radix Select](https://www.radix-ui.com/themes/docs/components/select)。实际 TypeScript 与构建核验依赖 API，没有读取 node_modules。

## R-007 目标驱动访谈与结构需求交接（2026-09-06）

真实 Terra/medium 经正式 API 创建任务、持续对话与草稿落库验证。原先强制每个问题提供 2–3 个选项会把自由名称输入包装成无效操作选项；现在契约允许零选项，界面直接使用现有输入框。必要业务选择、系统调查事实及建议默认值分开处理。相同业务需求可以首轮出草稿，也可以补充一个必要名称后完成。

模型输出唯一结构化 RequirementBrief，服务与界面共享 Markdown 渲染；确认绑定 taskId/draftVersion/revision。SQLite v1→v2 原子添加可空 brief，旧草稿/确认保留；旧 Markdown 不自动推断成新结构。来源调研需要入口、代表样本、完整枚举方法和字段可得性证据，批量枚举与逐项采集由正式计划组织。该交接设计不代表 F3/F4 已实现。

实际供应商错误证据：首次结构输出请求被 App Server 以 invalid_json_schema 拒绝，定位到 providedUrls 的 JSON Schema format=uri。仅在发给供应商的 schema 中移除此不支持格式；返回后仍使用本地 Zod URL 校验，且 providedUrls 必须来自用户实际文本。修复后真实轮次成功。早期调研任务混入全量采集、纠正残留旧名称片段和排序建议缺失均经真实输出发现并收紧 skill；具体案例及复核结果见 PROGRESS。普通测试与浏览器 fixture 只验证协议/交互，模型质量另行人工核对实际输出。

## R-006 F1 正式本地服务与持久化验证（2026-09-06）

根目录开发入口复用 [concurrently](https://github.com/open-cli-tools/concurrently) 10.0.5 与 [cross-env](https://github.com/kentcdodds/cross-env) 10.1.0，统一启动 API 和 Vite；开发 API 关闭静态构建托管，首次开发无需 dist。Windows 实测页面与 API 代理读取通过，Ctrl+C 后两个端口释放。两项仅为开发依赖。

沿用已批准方向，当前实际依赖为 Fastify 5.12.3、@fastify/static 10.1.3、Drizzle 0.45.2、better-sqlite3 12.10.0、proper-lockfile 4.1.2。本机 Node.js 24/Windows 的同步 SQLite 事务提交/回滚、独占目录锁、JSON 保留原件与原子批量导入均通过所属 API 测试。

选择同步短事务保存任务事实；模型调用与等待均在事务外。F1 按任务重投影小规模访谈表，避免跨 JSON 文件半提交；后续规模优化可改增量写入，保持事实归属。数据库 WAL 与外键启用，服务启动先导入、后恢复，再接受请求。同一数据目录的第二服务立即拒绝启动；真实子进程 SIGKILL 后，新 Node 在既有约 10 秒 stale 锁窗口后恢复为 interrupted，历史消息/草稿完整。

正式命令返回 JSON，持续观察单独使用 NDJSON sequence 快照；刷新/断线仅重建观察，不重启模型。浏览器实际回归发现原生 fetch 的接收者绑定问题，已改为普通函数转发后通过。来源与浏览器队列不在 F1 中冻结。详细计数和未测范围见 PROGRESS。

## R-005 需求访谈、来源调研与工作台设计修订

日期：2026-09-06。基线见 PRODUCT_FLOW.md；本项复用现有组件，不新增运行依赖。

- 已核对 `domain-analysis` 的 `categoryInterviewModule.ts`：每轮保存消息、建议/确认决策、待决事项与草稿版本；新输入退出可确认阶段；确认最新草稿后单独 materialize 正式任务。`crawlPlanningModule.ts` 独立管理规划与计划确认，`InterviewThread.tsx` 使用持续对话。相邻项目只读，不修改其源码或数据库。
- `grill-with-docs` 的逐问、推荐答案与随答沉淀落实到访谈设计；CONTEXT 只保存术语，PRODUCT_FLOW 保存十阶段、输入产物、确认门和失败回路，不为每句用户回答创建工程 ADR。
- UI 沿用 Radix Themes 与 React Flow、集中语义 Token；需求对话和草稿并排，来源/计划/链路/结果独立切换。链路按步骤展示条件分支、翻页回路、检查点和节点输入输出。
- 当前访谈使用 assistant-ui、私有 skill 和真实 Codex App Server，自由输入进入多轮访谈并可形成版本化草稿；多任务独立保存。来源调研与执行尚未接通；样例图和样例结果不成为当前任务的执行证据。
- 验收门：状态/图结构测试、类型检查、构建，以及真实浏览器的切页、版本、自由输入门、节点检查、深浅主题和 804px 布局。最终结果见 PROGRESS；不能把单轮模型 probe 或前端状态测试当成完整产品访谈通过。
- 按负责人授权执行 `codegraph init -i`，索引 30 个文件、374 个节点、344 条边；索引在忽略目录中，未纳入 Git。后续结构查询优先使用该索引。

## R-001 开发阶段模型分工

日期：2026-09-05。状态：开发期模型规则已收敛为 Astra/Sol；实际启动是否生效仍以 `turn_context` 为准。

本项讨论开发工具的模型分配；产品运行时模型接入单独调研。普通抓取链路复跑遵守 README 的零模型调用验收。

| 工作 | 已确认模型 ID | 起始推理深度 |
| --- | --- | --- |
| 主 agent：拆分、协调、集成与最终验收 | `gpt-6-astra` | `high` |
| 所有开发子 agent，包括简单任务 | `gpt-5.6-sol` | `high` |

以上是负责人确认的开发分工规则。开发子 agent 不再使用 Luna、Terra 或按复杂度分档；测试失败仍须先区分实现、环境和来源状态。产品运行时模型接入保持独立路由，不受此规则影响。

### 任务派发规则

每项任务派发前必须记录目标、输入、依赖、文件范围和验收。主 agent 使用 Astra high；凡开发子 agent，无论简单实现、常规模块、协议、生命周期、调研或测试，均使用 Sol high，同时运行最多两个。

任务不明确时，先由主 agent 澄清并拆分，再派发。启动后核验实际 model/effort 与任务单一致，不一致时不接受任务结果为完成。复杂度变化时停止盲目重试，说明原因并由主 agent 重新拆分或接管。代表性任务验收用于检验路由是否正确，不承诺绝对零质量问题。

较高推理档位通常耗时更长、使用更多 Token；本项目开发期统一选择上述已确认的 high 配置，并以任务边界和验收门控制成本与返工。

当日 Codex 标准速率，单位为每百万 Token 的 credits：

| 模型 | 输入 | 缓存输入 | 输出 |
| --- | ---: | ---: | ---: |
| GPT-6 Astra | 250 | 25 | 1250 |
| GPT-5.6 Sol | 100 | 10 | 500 |

这些是 Codex credits 费率，不是 API 美元价格；实际任务成本同时受上下文、缓存、推理、工具输出和返工影响。API 或产品运行时预算需要独立核算。优先使用 Standard 速度；Fast 消耗更多 credits。

官方来源：

- [模型定位与推理档位](https://learn.chatgpt.com/docs/models)
- [Codex 用量与 credits 费率](https://learn.chatgpt.com/docs/pricing)

## R-002 运行与编排组件

状态：技术方向已确认，官方资料初查完成；以下仍是待原型验证的候选方案，不代表选型已通过。

### 本地应用与数据

- 确认方向：TypeScript、Node.js 24 LTS、npm workspaces、React/Vite、Fastify、Zod；对话与节点展示优先验证 assistant-ui 和 React Flow。
- 数据候选：SQLite、Drizzle 与本地原始文件；适合当前 Windows 本机使用边界。PostgreSQL 是需要更强数据库并发能力时的对照候选，代价是额外服务部署。
- SQLite 驱动与 checkpointer 的实际版本、Windows 安装和并发行为需要原型确认；业务表与引擎表的职责在架构阶段明确。

### 编排候选

#### S0-03 原型审阅与 S0-08 补充门

2026-09-05 对初始内存原型的审阅发现执行预算、恢复输入绑定和调用审计缺口。S0-08已用请求级Zod校验、run/workflow/version/输入指纹绑定、显式递归预算和边界事件替换对应实现；30项循环完成，32项任务在第17项暂停后可由新Node进程恢复完成。原型边界详见 `packages/runtime/PROTOTYPE.md`。

S0-08 必须覆盖：超过引擎默认25 superstep的有界循环；运行ID绑定链路版本及输入指纹，恢复拒绝换输入；AbortSignal中断真实异步工作；checkpoint与结果去重一致；零模型证据从受控模型adapter调用事件派生。对普通节点还需隔离模型/网络入口，不以可任意更改的计数充当真实来源复跑证据。

已安装组合为 LangGraph 1.4.14、core 1.2.9、checkpoint 1.1.5、官方SQLite checkpointer 1.0.4（MIT）及better-sqlite3 12.10.0。使用npm正常依赖求解，未绕过peer约束；Windows/Node24安装与跨进程恢复通过。采用官方checkpointer，引擎检查点使用独立文件与生命周期；Drizzle产品事实表尚待S0-09验证。

资料：[LangGraph持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[XState持久化](https://stately.ai/docs/persistence)、[Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite)。XState 5.32.6实际对照测试确认活动invocation会在快照恢复后重启；副作用仍需要幂等与恢复门。多进程同时写同一数据库的锁冲突尚未验收，产品单执行队列也未接入。

当前完整锁文件在官方npm registry执行 `npm audit --registry=https://registry.npmjs.org --json` 为0项已知漏洞，包含开发依赖；Vite锁定7.3.6。默认镜像没有audit接口。每次锁文件改变后再审计，扫描结果仅代表公告库覆盖范围。

| 候选 | 官方依据 | 主要代价与验证门 |
| --- | --- | --- |
| LangGraph JS | MIT；TypeScript/JavaScript；节点可执行普通函数或模型调用；支持条件边、循环和持久检查点 | 需要适配链路定义和 checkpointer，并证明普通节点无模型调用；恢复时必须重新建立可用浏览器状态 |
| XState v5 | MIT；JavaScript/TypeScript；状态机、Promise actor 和持久快照 | 恢复会重新启动 invocation；需额外验证可变抓取链路、进度持久化和浏览器副作用的组合成本 |

负责人确认优先验证 LangGraph JS，并以 XState 做对照。原因是 LangGraph JS 的节点、连线、循环和检查点与当前抓取链路概念直接对应。本地运行、无需托管服务的组合是验证目标；具体采用决定在同一套最小原型比较后记录。

链路表示方向已确认：采用受控版本化节点图，记录已实现浏览器动作及其参数、定位和提取规则。恢复按商品和步骤设置安全检查点。

关键通过门：动态生成链路、普通异步节点、循环终止、显式 LLM 节点、模型调用审计、取消、进度持久化、恢复后的浏览器状态核验、Windows 安装和新输入复跑。

初查覆盖官方文档、许可和当前仓库；选定版本的发布活跃度、完整依赖许可、安全公告、Windows 原生依赖、离线运行以及升级退出成本仍需在锁定版本前核验。替换编排组件时保留产品链路、原始数据和验收语义；引擎检查点迁移成本列入选型。

来源：

- [Node.js 发布状态](https://nodejs.org/en/about/previous-releases)
- [Fastify](https://fastify.dev/docs/latest/)、[Vite](https://vite.dev/guide/)
- [Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
- [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)、[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[官方仓库](https://github.com/langchain-ai/langgraphjs)
- [XState 持久化](https://stately.ai/docs/persistence)、[官方仓库](https://github.com/statelyai/xstate)
- [assistant-ui](https://www.assistant-ui.com/docs)、[React Flow](https://reactflow.dev/learn)

## R-003 开发任务控制与产品模型接入

状态：官方接口、开发期配置与实际turn_context已核对；S0-07真实聊天与中断probe通过，S0-09产品会话/API/UI集成待实施。

### 开发任务

官方 Codex 支持项目级 `.codex/config.toml`、`.codex/agents/*.toml`，以及角色级 `model` 和 `model_reasoning_effort`。子 agent 默认模型与推理深度分别使用 `agents.default_subagent_model` 和 `agents.default_subagent_reasoning_effort`；并行上限使用 `agents.max_concurrent_threads_per_session`，且该数量不含主 agent。

开发方式：主 agent 固定使用 GPT-6 Astra high 管理任务和集成，按需同时启动最多两个开发子 agent；所有开发子 agent 固定使用 GPT-5.6 Sol high，包括简单任务。每项开发任务记录编号、依赖、文件范围、产物和验收命令；实际启动后核验 `turn_context` 中解析出的 model/effort。项目配置提供默认值，显式启动参数可覆盖默认值，因此两处都必须遵守同一规则。

阶段状态以 PROGRESS.md 为准。开发子 agent 数量与抓取时的浏览器并发分别控制。

### 产品运行时

#### 本机账号接入基线（2026-09-05 现行代码核验）

负责人选定本机官方 Codex 账号作为产品聊天基座。只读核验 `D:/work/domain-analysis` 的 `master` / `93a57b6219229796f811ca45cea142f93097ae4d`，工作区干净；本机 `codex-cli 0.150.1` 的 `codex login status` 返回 `Logged in using ChatGPT`。登录检查证明账号可被官方 CLI 识别，真实模型请求另设验收门。

复用来源为 `packages/workbench/src/` 下的 `codexAppServerTransport.ts`、`codexAppServerClient.ts`、`codexAppServerNotification.ts`、`codexCategoryInterviewRuntime.ts`、`codexStructuredOutput.ts`，以及对应所属 package 测试。采用该实现的边界与组合方式：

- execa 负责 Windows 进程生命周期，ndjson 负责 JSONL；由项目锁定的官方 Codex 包启动 App Server。环境只统一 PATH 键；凭证始终由官方登录持有。
- 每个连接一次 initialize/initialized；每轮新建 ephemeral thread，产品会话与计划由应用自己保存，模型线程只是执行上下文。
- commentary delta 与 item 生命周期即时投影；final_answer 只在官方 turn/completed 成功且本地 Zod 校验通过后成为产品结果。
- 取消使用 turn/interrupt；失联或超时后有界退出。认证失败显示本机登录要求；原始 stderr 和认证细节不进入用户事件与日志。
- 需求聊天原型禁用宿主 shell/plugins/hooks/memories；BrowserSkill 探索使用单独的受控工具原型验证，工具权限由用途决定。

官方协议已通过 OpenAI Docs 实际读取核验：[App Server](https://learn.chatgpt.com/docs/app-server)。该组件的 transport/协议能力与来源实现属于已知基线；本项目适配、模型请求与安全关闭仍以 S0-07 的实际测试为准。

S0-07 验证门：Windows 启动、官方 account/read 仅投影登录状态、至少一轮真实需求聊天与结构结果、流事件到达、错误结果不提交、串行连接复用/会话隔离、中断和子进程关闭。禁用工具的聊天原型不代表已完成 BrowserSkill 探索。

官方 Codex App Server 支持 stdio与ChatGPT managed登录；启动turn可以指定model与effort。负责人已选定本机账号接入基线，由工具自身持有需求、计划和运行记录；本项目adapter、会话隔离及BrowserSkill工具调用分别通过原型验证。

产品对话计划使用Terra medium，探索链路生成使用Sol high，简单且边界明确的LLM节点使用Luna medium。S0-07真实请求回报Terra/medium，完成Zod校验的2步需求草案；另一次真实轮次中断且安全关闭。该probe验证接入，不证明抓取计划质量或探索模型路由。凭证由官方登录流程管理，项目只保存必要引用与非敏感配置。

来源：

- [Codex 子 agent 与自定义角色](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [项目配置与参数](https://learn.chatgpt.com/docs/config-file/config-reference)
- [App Server](https://learn.chatgpt.com/docs/app-server)

## R-004 设计系统与组件复用

### 2026-09-06：业务对话与设计规范分离

依据负责人的当前截图与明确指令，设计系统不作为业务导航或页面展示；只作为 Token、成品组件和工程约束。信息层级见 INTERVIEW_UI.md，界面复杂度通过主内容/摘要入口/二级阅读划分，不折叠完整聊天或移除节点画布。

只读核验 domain-analysis 的 InterviewThread、categoryInterviewModule、codexCategoryInterviewRuntime 与私有 interview-product-category skill。采用相同的 assistant-ui 0.15.14 ExternalStoreRuntime 组合、消息中的问题与草稿卡；复制提问纪律而非商品品类/ZOL 默认值。官方 [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) 与 [App Server skill input](https://learn.chatgpt.com/docs/app-server#start-a-turn-invoke-a-skill) 已检索并读取。

当前验证为本机多任务真实访谈切片：typed skill input、自由问答、Markdown 草稿、显式版本确认、本地文件恢复。Vite middleware 提供 taskId 显式路由，TaskService 组合独立 InterviewService，列表元数据写入串行；旧单会话保留原件复制迁入。暂用每任务原子 JSON 文件，不替换 Fastify/Drizzle 方向、不宣称跨文件事务。正式事务迁移、来源搜索、BrowserSkill 样本核验与执行保持独立验收门，详见 PROGRESS。

2026-09-06 全工作台布局验证：依照 WORKBENCH_LAYOUT.md，将稳定上下文放任务侧栏，连续访谈和节点画布保留主区，草稿/节点/审计复用 DetailPane 宽屏并排、窄屏 Radix Dialog 右抽屉；任务菜单复用 DropdownMenu，重命名使用短 Dialog。有价值的步骤依赖保留，补充字段就地折叠，未接通产物保持空态，结构样例显式打开。BrowserSkill 原生键盘与选择操作验证两任务隔离、归档恢复及 804px 抽屉焦点；无新增产品模型调用。

### S0-04 成品控件原型（2026-09-05）

原型采用 `@radix-ui/themes@3.3.0`：Button variants、TextField/TextArea、Dialog、Tabs、Badge、Callout、Tooltip来自成品库；ReactFlow承担节点展示。Mantine 为历史对照，未采用。专业对话组件 assistant-ui 0.15.14 已接入当前真实访谈切片，S0-09 继续正式 API/事务与生命周期验证；不重新进行基础组件选型。

项目只组合需求确认、模拟运行状态与结果字段；`apps/workbench/src/styles.css`集中定义同名light/dark语义Token。Token测试检查同键及业务CSS色值收口，浏览器检查弹窗、主题和节点图控件，具体证据见PROGRESS。控件变体以库props调整，业务布局不覆盖库内部结构；未来替换库保留产品状态与语义Token。

官方来源与对照细节见 `apps/workbench/COMPONENT_LIBRARY_RESEARCH.md`；依据为[Radix Themes](https://www.radix-ui.com/themes/docs/overview/getting-started)、[Mantine Vite](https://mantine.dev/guides/vite/)和[React Flow主题](https://reactflow.dev/learn/customization/theming)。当前是可审阅候选样例，负责人视觉/流程反馈尚待返回。

状态：设计系统方向已澄清，成熟组件库最终选型与新项目约束实现待完成；布局仍按新产品需要讨论。

参考目标是复用设计 Token 规范、设计系统和成熟组件库，让后续功能保持一致并避免重造轮子。先选择并验证成熟成品组件库，定义统一语义 tokens 与允许的组件 variants，再组合产品页面。按钮、表单、弹窗、菜单、Tabs、Tooltip 等优先复用组件库；业务组件只承担抓取领域组合，新增基础实现须有现有库不适用的证据。

Token 覆盖颜色、字体、间距、圆角、阴影、交互状态和必要动效；具体值与库版本仍待调研原型，不复制 opencode 页面几何。设计规范、运行 Token、组件展示与使用规则/自动检查共同组成约束，后续功能复用同一规范和组件，合理变体统一维护。

已保留的参考证据：只读核验 `D:/work/opencode` HEAD `b716f47d`，工作区其他未提交改动不在本任务范围，UI 参考文件无 diff；只读核验 `WorkspaceSidebar.tsx`、`AgentWorkspaceSidebar.tsx`、`BEAUTIFUL_UI_LICENSE.md`、AppShell 与 PerfumePage，确认已有 tokens、许可标记、Radix Themes、Motion reducedMotion 与自有 InteractiveTimeline。2026-09-05 对 `http://localhost:5173/agent/examples/perfume` 做了只读观察和截图，看到深色空状态、侧栏和居中输入，未发送消息，会话 `okxu` 已关闭；这些是参考证据，不构成新产品验收。

当前已只读核验的设计系统证据路径：`D:/work/opencode/apps/examples/DESIGN.md`（语义 tokens、typography、rounded、spacing、components、control hierarchy）、`DARK.DESIGN.md`（仅替换同名颜色）、`src/styles.css`（运行映射）、`apps/examples/tests/theme/example-theme.test.ts`（两主题 key 一致、DESIGN/CSS 同值、核心颜色对比度、目标源组件禁止具体 palette 色阶）。本轮仅读源码，未执行这些测试，不能表述为本轮通过。

职责边界：frontend-design 是设计指导，Tailwind 是样式工具，Radix Primitives 是基础交互原语，三者均不能单独代表完整成品组件库选型完成；assistant-ui ExternalStoreRuntime 与 React Flow 只对应专业界面，仍受各自原型验证门约束。仅复用已核对许可的视觉资产与组件模式，不整体引入 opencode 会话或运行时。官方参考：[Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)、[Tailwind theme](https://tailwindcss.com/docs/theme)、[React Flow](https://reactflow.dev/learn)、[assistant-ui ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)。
