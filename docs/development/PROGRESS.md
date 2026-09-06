# 开发进度

更新日期：2026-09-06。

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

## 下一步

1. 按 PRODUCT_FLOW.md、INTERVIEW_UI.md 和 WORKBENCH_LAYOUT.md 继续 S0-09：将已接通的多任务/assistant-ui/私有 skill/真实访谈切片迁移到 Fastify、Drizzle 产品会话事务，完善 Decision/Unresolved、取消与恢复；然后独立接通真实来源调研与计划。
2. S0-10建立受控BrowserSkill adapter及权限/会话回收原型，再验证可执行DSL编译；不能把现有示意节点图当作执行器。
3. 上述门通过后做阶段0选型评审。京东旗舰店与第二站点属于后续真实来源验收，当前均未开始。

未测范围还包括：产品多任务队列、跨实例互斥、SQLite多进程锁冲突、实际浏览器恢复、探索Sol/high及显式节点Luna/medium的代表性任务。当前没有环境阻塞导致的测试失败。

交付状态：本地源码检查点与可查看的UI演示；无远程分发、跨电脑迁移或完整抓取产品交付。
