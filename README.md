# 浏览器自动化任务链路

B-A-T 把自然语言浏览器任务编译为参数化、版本化、可验证、可复跑的任务链路。用户通过持续需求访谈确认目标、输入、约束和完成标准；任务计划组合所需链路；第一次由 AI Connect 选定的用户模型通过 Pi AgentSession 和 BrowserSkill 完成代表任务，B-A-T 再从真实工具轨迹与字段来源确定性编译链路。样本及换输入验证后由普通执行器复跑；登录或验证码进入可恢复人工等待，只有显式 LLM 节点在复跑中调用模型。

平台不以京东、数据抓取或任何单一网站和任务类别为边界。网站名称、业务字段和数量属于任务版本的动态数据；公共链路只表达浏览器能力、观察、数据处理、控制流、链路调用、人工等待、模型、检查点、输出和终止。最高设计依据见[自然语言浏览器任务链路架构基准](docs/development/TASK_CHAIN_ARCHITECTURE.md)。

## 已确认的首版范围

开发接续从 [功能开发统一入口](docs/development/DEVELOPMENT_BASELINE.md) 开始：连接产品流程、原型布局、状态清单、实施顺序与已验证证据。当前原型先作为布局基线；各状态的真实界面随功能实现和验收补齐，不代表所有状态已获视觉确认。

确认日期：2026-09-05。负责人已选择访谈中的全部推荐项。

1. 独立的本地 Web 工作台，提供需求对话、计划与链路查看、启动运行和结果查看。
2. 用一个简单单链任务和一个复杂组合任务验证通用链路能力；京东数据采集是复杂验收样例，不是产品边界。
3. 用户确认计划并启动后，系统在已授权范围和业务限制内自动探索、编译、验证并继续执行剩余范围；内部技术预算由链路结构推导。
4. 复跑遇到结构变化时暂停受影响链路并保存进度，用户发起修复后再调用模型；登录和验证码由用户处理。
5. 用户查看节点、条件和输入参数，通过自然语言生成修改后的链路版本并验证。
6. 首版正式支持 Windows 本机使用。
7. 首条规模验收使用已确认的数据采集任务，报告实测耗时、完成率和模型调用数；样例字段和数量不得成为平台默认合同。
8. 首版抓取文本、表格和链接；图片与附件保存来源链接。原文件下载、OCR 和 PDF 内容识别列入后续范围。
9. 每次复跑创建独立结果并保留运行来源时间；同一运行内去重，中断恢复继续原运行。
10. 多任务支持排队，一次实际执行一个浏览器控制任务；这是产品浏览器并发约束，与开发阶段最多两个子 agent 分开计算。

## 核心验收

- 需求访谈 → 确认需求草稿 → 来源与登录态核验 → 生成任务计划 → 确认并启动 → Pi AgentSession 逐步骤探索 → 轨迹编译 → 样本及换输入验证 → 执行结果 → 复跑/恢复/修复；完整职责、失败回路与 UI 边界见 [产品流程](docs/development/PRODUCT_FLOW.md)。执行依赖不限制视图切换。

- 自然语言需求能够形成计划、步骤和可执行链路，并保留验证证据。
- 已固化的普通节点由程序执行；翻页、等待、分支、循环、提取和计数通过程序规则完成。
- 参数化链路在已验证的页面结构范围内接受新输入复跑；无 LLM 节点的链路以实际模型调用记录证明零模型调用。
- 复杂数据采集样例按自身需求版本保存结果及来源关联；字段不足或范围未完成时保存实际结果和终止原因。
- 默认评论顺序采用运行时页面默认排序，并在计划中显式记录。型号与商品页面保持来源对应关系，评论数量按商品页面验收。
- 第二站点采用独立自然语言需求形成链路，以实际执行证明链路生成能力的适用范围。

## 已确认的开发方向

- 应用采用 TypeScript、Node.js 24、npm workspaces、React/Vite、Fastify 和 Zod；需求对话与 opencode Examples 消费同一套 AI Connect 公共 Agent surface，包括生命周期投影、Timeline、Composer、模型设置、Question 注册与开放题答复。宿主只配置主题色、助手名称、图标和浏览器自动化任务能力；共享交互不得在本仓复制或裁成另一套实现。共同规范见相邻 checkout 的 [`ai-connect-host-surface-parity.md`](../opencode/docs/platform/ai-connect-host-surface-parity.md)。
- 数据采用 SQLite、Drizzle 和本地文件，具体驱动版本、并发行为与职责边界由原型确认。
- 编排复用 LangGraph `StateGraph` 作为唯一图执行底座；`TaskChainRuntime` 只把受控 IR、预算、幂等、检查点和审计映射到该引擎。旧 LangGraph 包装原型与 XState 对照已删除，不保留第二套运行器。
- 链路采用受控版本化节点图，记录已实现的浏览器动作及其参数、定位和数据规则；恢复按任务输入单元和步骤设置安全检查点。
- 产品模型统一使用 `@agent-platform/ai-connect` 管理的本机账号与项目显式选择；访谈、调研、计划及一次执行内的探索/修复/验证冻结并复用同一选择，未选择或调用失败均明确返回，不自动改选模型或回退旧运行时。
- 仅当开发主 agent 使用 GPT-6 Astra 时，开发执行子 agent 固定使用 GPT-5.6 Sol high；其他情况保持当前或用户明确选择的模型与 reasoning effort。每项开发任务明确依赖、文件范围、产物和最小验收命令。
- 开发期模型规则独立于产品模型选择；产品运行时只读取工作台中已保存的同一项目选择。
- Git 按验证阶段完成最小检查与显式路径审阅；本地提交和远程推送遵循用户授权。

当前已接入多任务列表、独立访谈保存、共享 Timeline/Composer、本机账号与项目模型选择、通用 task-chain contracts、LangGraph runtime、版本/运行持久化、固定版本授权执行和通用结果投影。上一版 API 手写探索循环与模型直接生成完整 Chain IR 的路径已被否决，新的 Pi AgentSession 探索、类型化轨迹、紧凑注解和确定性编译已通过聚焦离线验证；P6 真实验收进行中，尚不能宣称自然语言编译闭环已完成。旧 capture/workflow 运行路径已删除，旧 SQLite JSON 仅可读取或导出。当前实施入口见[首次探索与链路编译重构](docs/development/TASK_CHAIN_AUTHORING_REDESIGN.md)，整页布局见[工作台布局](docs/development/WORKBENCH_LAYOUT.md)，访谈机制见[需求对话机制](docs/development/INTERVIEW_UI.md)。

## 启动本地工作台（F1）

项目要求 Node.js 24+ 与 npm 11+。使用 nvm 时以仓库的 `.nvmrc` 选择 Node 24：

```powershell
nvm install 24
nvm use 24
npm ci
npm run dev
```

打开 [本机工作台](http://127.0.0.1:4173/)。根目录一条命令同时启动 Vite 页面与 Fastify API（4175），无需预先构建；按 Ctrl+C 停止两者，一方退出时另一方也会停止。新建不调用模型，发送消息使用工作台保存的默认聊天模型和推理深度。数据库保存在忽略的 `data/workbench.sqlite`，任务、消息、轮次、问题、明确决策、草稿、确认及调用审计在同一事务内保存。

首次启动自动导入 `data/tasks.json` 及各任务 JSON，或旧单会话 `data/interview.json`；保留原件，重复启动不重复导入、不覆盖后续数据库修改。迁移前关闭使用同一目录的旧原型服务。损坏文件导致整批导入失败，修复原文件后重启可重试。同一数据目录只允许一个正式服务；异常退出后数据锁约 10 秒过期，重启会把未完成轮次标记为可重试的中断。

Vite 将 `/api` 代理至 4175。API 端口通过 `BROWSER_CAPTURE_API_PORT` 配置；数据目录通过 `BROWSER_CAPTURE_DATA_DIRECTORY` 配置，根开发命令会将环境传给两个服务。部署式本地运行仍可使用 `npm run build` 后执行 `npm start --workspace @browser-capture/api`，由 Fastify 在 4175 同时提供构建页面与 API。

四个正式视图为需求对话、任务计划、任务链路和运行结果。连续消息、宽屏并排草稿/窄屏抽屉与节点主画布保留。刷新重新读取服务端事实；切任务保留各自未发送输入、页签与节点选择，视图临时状态不承诺跨刷新保存。取消绑定实际轮次，取消后不提交草稿；请求响应丢失时可用原请求标识重发。目标流程会为计划步骤选择代表输入，由 Pi AgentSession 完成一次真实探索并记录来源，再编译、复跑样本和换输入验证；当前代码已接入这条 authoring 路径，真实验收结果见 PROGRESS。

验证默认使用 `npm run check --workspace <所属包>` 和所属包的单个 `tsx --test` 文件；根级或全量验证需另行授权。普通测试用替身；`apps/workbench/tests/f1-browser-server.ts` 只为 `work/` 下隔离浏览器验收提供替身，生产入口没有模型替换开关。各阶段实际证据和待验证范围见 PROGRESS。

## 同步本地 AI Connect 源码制品

脚本默认从同级 `../opencode` checkout 发现 producer。非标准目录布局可用已忽略的 `.ai-connect.local.json` 指向 producer checkout：

```json
{
  "opencodeRoot": "/absolute/path/to/opencode-dev"
}
```

同步会按 release manifest 重建本机安装树。Windows 上先确认没有活动采访或模型调用，并停止本仓 `npm run dev`，避免开发进程占用 esbuild 等需要替换的文件；然后执行：

```powershell
npm run ai-connect:sync
```

该命令委托 producer 源码中的同步工具完成制品暂存、vendor 更新、已配置直接依赖 manifest、lockfile 与本机安装树刷新，不在仓库中保存 producer 机器路径。同步会校验 release schema、版本、公开 exports、CSS 与制品 SHA-256，并在安装后用新 Node 进程验证 ESM server/authoring/chat/CSS 入口；任一环节不一致都会失败。两个同级 checkout 的常见布局无需机器专属文件，仍可用环境变量或本机文件显式覆盖。只有在已审阅且明确授权覆盖声明文件的开发工作区中，才使用 `npm run ai-connect:sync -- --allow-dirty-declared-files`；默认命令继续保护这些文件。同步成功后重新启动 `npm run dev` 并检查 `/api/health`。切换到已发布包时使用 npm 的精确版本安装流程；业务代码继续引用稳定公共 exports。

## 验证本机模型接入

在工作台模型设置中连接账号并保存模型后，执行一次访谈即可验证真实接入。访谈、语义计划、Pi AgentSession 首次探索、紧凑编译注解和显式 LLM 节点都读取这项选择；未保存时会明确提示完成设置，不自动选择或回退其他模型。账号凭据由 AI Connect 本地存储管理，业务数据库只保存模型选择和调用审计。Codex 不参与产品运行。

普通测试使用 `tests/` 下的模型与浏览器替身，不消耗模型用量；成功结果仍须通过本地 Zod 校验，中断不产生已完成结果。SQLite 测试使用独立临时数据库，检查新进程恢复与输入隔离，不构成真实浏览器恢复验收。

## 文档入口

- [领域词汇](CONTEXT.md)
- [任务链路架构基准](docs/development/TASK_CHAIN_ARCHITECTURE.md)
- [首次探索与链路编译重构](docs/development/TASK_CHAIN_AUTHORING_REDESIGN.md)
- [首次探索与链路编译清理清单](docs/development/TASK_CHAIN_AUTHORING_CLEANUP.md)
- [ADR 0002：Pi 探索与轨迹编译](docs/adr/0002-pi-agent-exploration-trace-compilation.md)
- [产品流程与 UI 基线](docs/development/PRODUCT_FLOW.md)
- [阶段计划](docs/development/ROADMAP.md)
- [当前进度](docs/development/PROGRESS.md)
- [调研登记](docs/development/RESEARCH.md)

既有探索与复跑验证位于相邻的 `browser-skill-replay-mvp` 目录。未来 `domain-analysis` 可接入本工具的执行能力，具体集成接口在真实验证后确定。
