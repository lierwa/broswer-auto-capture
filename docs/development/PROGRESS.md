# 开发进度

更新日期：2026-09-06。

当前阶段：阶段 0 子阶段检查点，产品基线、可操作UI、模型接入与持久化原型；阶段 0 尚未全部完成。

## 当前 UI 修订（2026-09-06）

依据负责人的流程反馈，新增 PRODUCT_FLOW.md，落实十阶段职责、需求/来源/计划/链路/运行的事实边界、独立确认、失败回路及非线性查看原则；同步术语、README、ROADMAP 与 RESEARCH。

UI 已改为持续需求对话与版本化草稿并排；主工作区可切换来源调研、抓取计划、抓取链路、运行结果。节点图按三个示例步骤切换，具备条件出口、翻页回路、检查点与参数详情；没有确认需求也可查看。已清除旧的一句话需求弹窗与模拟运行状态机，源码可由 Git 历史恢复。

原型边界：固定三项推荐决策只是冰箱样例，不代表正式访谈固定问三次；自由文本作为待澄清事项保留，不能确认旧草稿。页面状态仅驻留内存，切页保留，刷新重置。真实访谈、数据库持久化、来源搜索、正式计划和浏览器执行均未接通。

当前验证：整仓 55 项测试通过（UI 12、contracts 7、model-runtime 24、runtime 12）；类型检查与构建通过，Vite 提示主 JS chunk 超过 500kB，未进行包体优化。下方初始检查点 UI 为历史记录，本轮证据如下。

| 本轮验证 | 结果与边界 |
| --- | --- |
| 状态与图结构 | UI 12 项通过：逐问/防乱序、历史与确认版本、自由输入待澄清门、撤回保留历史、图边端点、条件出口与翻页循环、主题 Token |
| 浏览器交互 | `ommg` 会话 15 项断言通过：未确认可选节点、调研/计划门、键盘切页与节点保持、输入保持、三轮对话与草稿、旧版本只读、独立需求确认、确认后仍需调研、补充使旧确认失效、结果空态/显式样例、浅色宽屏、804px 对话与链路无横溢出 |
| 鼠标点击边界 | 自动化鼠标报告成功但未激活页签，未当作产品通过；`yrdc` 人工辅助点击后实际打开了链路图。后续自动断言使用键盘激活与原生下拉选择；尚未完成纯自动鼠标回归 |
| 可视检查 | 实际检查深色需求页、人工打开的链路页、浅色补充待澄清页与804px链路截图；宽屏输入区处于视口内，链路画布未隐藏。负责人对新设计的视觉评价仍待反馈 |
| 日志与释放 | 浏览器仅见 Vite/React 调试信息和扩展自身 `chrome-extension://invalid` 资源错误；所有本轮会话均关闭，最后 `ommg` 在 finally 中 stop。截图在忽略目录 `work/ui-review`，不入 Git |
| 未测 | 真实多轮模型、持久化刷新恢复、真实来源搜索/计划生成、浏览器抓取/恢复、运行审计；新增布局的 reduced-motion 实际媒体模拟未测（保留 CSS 规则） |

浏览器回归脚本：`apps/workbench/tests/browser-ui.ps1`。在项目根目录启动独立 `bsk session start`，用返回 session 导航本机预览，再运行 `& apps/workbench/tests/browser-ui.ps1 -SessionId <四字母ID>`；脚本只操作该测试会话并在 finally 关闭，不放进普通 `npm test`，避免单测擅自控制浏览器。

后续接入顺序：持续访谈与业务会话事实源 → 确认草稿 → 真实来源调研与计划 → 独立执行授权 → 逐步探索/链路生成/验证 → 剩余执行、结果与恢复。S0-07 接入 probe 不是这条产品链的完成证据。

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

1. 按 PRODUCT_FLOW.md 和本轮 UI 反馈推进 S0-09：接入 Fastify、assistant-ui 与 Drizzle 产品会话事实表，验证真实多轮需求、决策/待决事项、草稿版本、取消和刷新恢复；之后独立接通真实来源调研与计划。
2. S0-10建立受控BrowserSkill adapter及权限/会话回收原型，再验证可执行DSL编译；不能把现有示意节点图当作执行器。
3. 上述门通过后做阶段0选型评审。京东旗舰店与第二站点属于后续真实来源验收，当前均未开始。

未测范围还包括：产品多任务队列、跨实例互斥、SQLite多进程锁冲突、实际浏览器恢复、探索Sol/high及显式节点Luna/medium的代表性任务。当前没有环境阻塞导致的测试失败。

交付状态：本地源码检查点与可查看的UI演示；无远程分发、跨电脑迁移或完整抓取产品交付。
