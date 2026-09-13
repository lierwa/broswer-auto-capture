# 首次探索与任务链路编译重构实施说明

日期：2026-09-13
状态：P1–P5 已实现并通过所属包聚焦验证；P6 真实验收进行中，最终通过事实以 PROGRESS 为准
适用范围：自然语言任务形成计划、首次真实浏览器探索、轨迹编译、样本验证、换输入验证及冻结复跑
决策依据：[任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md)、[ADR 0001](../adr/0001-generic-browser-task-chain-ir.md)、[ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md)
配套清理：[首次探索与链路编译清理清单](TASK_CHAIN_AUTHORING_CLEANUP.md)

本文是下一次全新开发会话的主入口。新会话先读本文和配套清理清单，再核对实际 checkout、Git diff、服务、BrowserSkill 会话和 SQLite 记录；不要从聊天记录、旧样例或历史进度章节推断当前实现。

## 1. Product Alignment

```text
Product Alignment:
- natural-language task: 用户用简短自然语言描述一次真实浏览器任务、动态输入、业务输出和完成标准
- reusable chain boundary: 首次由 Pi AgentSession 完成一个代表输入；B-A-T 将真实工具轨迹编译成一条参数化 TaskChain，并在不同输入上验证后冻结
- runtime inputs: URL、搜索词、品牌、型号、表单值、数量等由需求版本声明的动态值；URL 可以由用户提供，也可以由前置发现链路产生
- dynamic task outputs: 需求版本声明的结构化业务结果、缺失原因、来源和采集时间；字段不进入平台固定类型
- generic platform capability used: AI Connect、Pi AgentSession、BrowserSkill、通用 TaskChain IR、LangGraph、Zod、SQLite/Drizzle、检查点、人工等待和审计
- replay model calls: 普通节点为 0；只有编译结果中显式存在 llm 节点时才允许调用并审计
- site/task-specific code added: no
```

## 2. 要解决的问题

当前通用 IR、运行器、版本、持久化和 Workbench 已存在，但“从自然语言得到这张图”的实现方向错误：

1. `TaskRuntimeHost.explore` 自己循环调用一个无状态结构化模型，每轮只让模型选择 `command` 或 `finish`，最多固定若干轮，再驱动 BrowserSkill。
2. `TaskChainAuthoring.chain` 把探索摘要塞进一段长 prompt，让另一次模型调用直接生成近乎完整的 `TaskChain`，失败后再请求一次修复候选。
3. 模型因此需要同时猜浏览器下一步、输入绑定、节点、连线、输出合同、循环、错误出口和技术预算。模型完成网页动作并不代表候选图能复跑。
4. 当前 `observe scope=target` 在公共合同中存在，BrowserSkill 适配器却明确返回 `observe_target_unsupported`。只有整页文本和简单路径提取时，无法可靠形成京东完整规格、评论等结构化输出的来源证明。
5. 业务数量与内部技术预算混在模型候选中。一次 10 个商品的需求可能被误写成 10 次图迁移或 10 条浏览器命令，从而出现用户无法理解的“额度耗尽”。

本次重构的结果不是做一个更长的 prompt。目标是让成熟 AgentSession 负责首次找路，让 B-A-T 依据真实轨迹确定性地产生现有 IR。

## 3. 产品依赖和责任边界

```text
用户的简短自然语言需求
  -> 已确认需求版本
  -> 语义任务计划
  -> AI Connect 选定用户账号和模型
  -> Pi AgentSession 使用 BrowserSkill 完成一个代表输入
  -> B-A-T 记录类型化工具轨迹、业务结果和字段来源
  -> 模型只补充少量编译语义
  -> 宿主编译器生成现有 TaskChain IR
  -> compileTaskChain 静态校验
  -> 正式运行器复跑代表输入
  -> 同一链路换输入验证
  -> 冻结 ChainVersion
  -> 批量复跑、恢复和漂移修复
```

职责必须保持如下边界：

| 能力 | 唯一负责人 | 本次如何使用 |
| --- | --- | --- |
| 账号、认证、模型选择 | AI Connect | 复用工作台已保存的用户订阅账号与模型；失败不自动换供应商 |
| 模型工具会话 | Pi AgentSession | 负责探索中的多轮推理、BrowserSkill 工具调用、中断和最终回答 |
| 浏览器原子能力 | BrowserSkill | 导航、观察、定位、点击、输入、滚动、标签页及受控结构化读取 |
| 链路公共表示 | 现有 `TaskChain` contracts | 仍是唯一可执行、可版本化的链路格式 |
| 图运行 | LangGraph `StateGraph` + `TaskChainRuntime` | 继续执行编译后的普通节点、循环、调用、检查点和终止 |
| 产品事实 | SQLite + Drizzle 仓储 | 保存需求、计划、链路版本、运行、消费、审计和必要证据 |
| 页面与运行投影 | Workbench | 显示计划、探索、编译、验证、人工等待、结果和明确失败层级 |

Codex 只用于开发 B-A-T。产品不能调用 Codex、复用当前 Codex 会话或依赖 Codex 额度。产品中的模型调用一律经过 AI Connect 和 Pi AgentSession。

## 4. 用户需求应该有多短

代表性的详情任务可以直接写成：

> 打开这个京东冰箱商品链接【productUrl】，整理商品名称、型号、店铺、当前价格、完整规格参数、评论摘要和页面当前可见的 10 条评论；每个字段保留来源，缺失就说明原因，并记录采集时间。

这句话定义结果和边界，不预写浏览器命令、选择器、节点数、等待次数或技术预算。

URL 不要求用户提前找到：

- 用户已有详情 URL 时，`productUrl` 是这条详情链路的动态输入。
- 用户只给“海尔某型号冰箱”时，计划先生成一条通用发现链路，输出一个或多个候选 URL，再调用同一条详情链路。
- 用户要求一个品牌 10 个型号时，发现步骤输出 10 个稳定输入，计划以 `each` 方式复用一条详情链路 10 次；不能生成 10 张同构图，也不能让模型逐项重新找路。

首轮重构验收会先用已知 URL 隔离验证“详情链路如何从成功轨迹生成”。发现链路随后用同一机制实现。这是阶段顺序，不是产品要求用户永远提供 URL。

## 5. 四级成功定义

| 等级 | 必须得到什么 | 不能据此宣称什么 |
| --- | --- | --- |
| E1 探索成功 | Pi AgentSession 在真实浏览器中完成代表任务，并返回需求所列业务结果 | 不能宣称已有可复跑链路 |
| E2 可编译 | 每个动态输入、目标、循环和输出字段都有可重现来源；不存在未声明的模型推断 | 不能宣称正式运行器可完成 |
| E3 候选可执行 | 编译后的链路由正式运行器在代表输入上完成，结果符合合同 | 不能宣称换输入仍有效 |
| E4 链路已验证 | 同一候选在不同输入上完成；绑定、稳定定位、完成条件及模型调用声明均成立 | 才允许冻结并进入批量复跑 |

任何失败只允许落在明确的等级和层级。不得通过扩大轮数、随意堆参数或重复生成候选来制造“偶然成功”。

## 6. 探索轨迹

探索轨迹是编译证据，不是第二套运行协议。内部记录至少包含：

- `taskId`、需求/计划/步骤版本、authoring job、BrowserRun 和 Pi AgentSession 调用关联；
- 本次代表输入、开始/结束时间、选定模型引用和终止状态；
- 按顺序记录的 BrowserSkill 工具名、经 Zod 校验的参数、结果、错误和动作后页面状态摘要；
- 能重定位的语义目标描述，不能持久化仅在本次页面有效的临时元素引用；
- 任务授权范围内的业务结果；
- 以 JSON Pointer 或等价稳定路径表示的每个输出字段来源，指向具体工具结果、观察片段或明确的模型推断；
- 探索期模型调用审计、人工等待和浏览器会话关闭结果。

轨迹中不保存 Cookie、密码、令牌、验证码、完整浏览器 Profile 或无关原始页面。任务要求的公开业务字段可以作为结果保存；较大的 HTML/语义快照使用受控 artifact，只保留编译与审计需要的范围和摘要。

Pi AgentSession 可以在探索中自由决定下一步，但所有可执行工具仍经过 B-A-T 的白名单、origin、超时、单浏览器会话和敏感参数校验。上传、下载、支付、发布或其他高影响动作只有在需求与授权明确时才进入工具集合。

## 7. 编译注解

模型不再输出整张图。它只输出一份紧凑、严格校验、引用真实轨迹事件的内部注解：

- `inputBindings`：把探索时的 URL、搜索词、表单值等样本常量映射到需求输入路径；
- `repeatRegions`：标记重复轨迹的起止、集合或继续条件、稳定键和业务上限；
- `outputMappings`：把输出字段映射到某次观察/工具结果及提取规则，或声明需要显式 `llm` 节点；
- `completion`：哪些可观察事实证明任务完成，哪些情况是部分完成、阻断或失败；
- `reuseBoundary`：适用页面/交互假设和失效条件。

注解不能包含可执行任意代码，不能创建未在轨迹出现的浏览器动作，也不能自定节点 ID、边、检查点和技术预算。注解只作为 authoring evidence 保存；正式执行只读取版本化 `TaskChain`。

## 8. 轨迹到图的确定性规则

宿主编译器按固定顺序处理：

1. 校验探索已得到符合需求输出合同的真实结果，并验证所有注解只引用存在的轨迹事件。
2. 规范化工具调用和动作后观察；去掉对业务结果无贡献的重复观察，同时保留定位、稳定和完成证明需要的观察。
3. 把样本常量替换为 `input`、上游 `stepOutput` 或循环 `variable` 的值绑定。无法解释的变化值使候选停在 E1。
4. 把临时元素引用转换成 BrowserSkill 支持的语义目标或版本化稳定定位描述。无法重定位的动作使候选停在 E1。
5. 把重复片段折叠为有界 `loop` 或计划级 `each`；业务数量来自需求，稳定键来自输入或输出合同。
6. 依据工具能力产生 `browser`/`observe` 节点，依据可重现提取与组装规则产生 `data` 节点，依据真实分支产生 `condition`，必要时产生显式 `llm`。
7. 为每个节点补齐 `success`、`missing`、`timeout`、`blocked`、`waiting_for_human` 或 `failed` 中实际需要的出口；副作用和可恢复边界加入 `checkpoint`。
8. 根据需求输出合同和字段来源生成 `emit`，再生成完成、部分完成、阻断和失败终止节点。
9. 从图结构计算技术预算，调用现有 `compileTaskChain` 完成可达性、绑定、合同、循环、出口和调用版本校验。

以详情页为例：探索中的具体 URL 变为 `input.productUrl`；“规格参数”附近的临时引用变为可重新解析的语义目标；读取多组参数的重复动作变为有界循环；名称、型号、价格等字段分别绑定到带来源的观察结果；缺失字段进入部分完成结果。编译器补齐错误出口和检查点，不让模型猜这些结构。

## 9. 受控结构化读取

编译器能复跑的前提是浏览器层能返回稳定、有限、可追溯的页面结构。开发前先检查当前 BrowserSkill 版本公开能力，优先顺序为：

1. 已有的 target/page/HTML/语义快照能力；
2. BrowserSkill 官方能力的窄适配；
3. 成熟 HTML/DOM 解析库对受控快照做确定性提取。

不得让模型执行任意 JavaScript，不得把站点选择器写进平台 TypeScript，不得自研一个替代 BrowserSkill、DOM 解析器或 Agent 框架。`scope=target` 若继续保留在合同中，适配器必须实现并有真实能力证据；否则应在合同版本中诚实移除，而不是运行时才返回 unsupported。

## 10. 预算、错误和登录态

业务限制与技术预算分开：

- “10 个商品”“每个商品 10 条评论”属于需求、计划、循环和输出合同。
- 图迁移、底层浏览器命令、活动时间、链路调用深度和显式 LLM 次数属于内部技术预算。
- 编译器按节点的最坏命令成本、节点超时、显式循环上限、子链调用和显式 `llm` 节点计算技术预算；重试只有作为图中的明确边才计入，不使用隐藏倍数。
- 运行记录保存实际消费。UI 必须显示“浏览器命令预算”“图迁移预算”“活动时间预算”或“供应商账号/模型错误”等真实类别，不能只写“额度耗尽”。
- authoring 的模型调用、探索工具调用、候选运行消费和批量复跑消费分别审计，不能共用一个含混计数。

失败按责任层记录，UI 和进度报告不得跨层猜测：

| 失败层 | 典型事实 | 处理 |
| --- | --- | --- |
| 需求/计划 | 输出字段、输入或完成标准仍不明确 | 回需求，不启动浏览器 |
| AI Connect/Provider | 账号不可用、模型不可用、认证或供应商用量错误 | 显示准确账号/模型错误；不自动换模型 |
| Pi AgentSession | 会话启动、工具协议、中断或最终输出失败 | 保留会话和模型审计；不改浏览器预算碰运气 |
| 工具桥 | 参数未通过 Zod、动作未授权、origin 越界 | 拒绝工具调用并记录协议错误 |
| BrowserSkill | 扩展未连接、命令超时、目标缺失、会话丢失 | 保存 BrowserRun；只重试有新证据的最小动作 |
| 页面/人工 | 登录失效、验证码、权限或访问限制 | 类型化人工等待，用户处理后 fresh observe |
| 结果/provenance | 业务结果缺字段或字段没有可重现来源 | 停在 E1/E2，不生成候选图 |
| Trace-to-Graph 编译 | 绑定不成立、临时 ref、无界循环、出口或合同错误 | 报告具体编译诊断，不再请求完整 IR repair |
| 正式 runtime | 漂移、节点失败、明确技术预算、恢复核验失败 | 保留同一 TaskRun 检查点或按合同终止 |
| 持久化/UI | 写入、顺序、恢复或投影错误 | 与模型和浏览器结果分开报告，修复事实链 |

登录态归浏览器 Profile，不归任务链路数据库：

1. 每次真实运行前，用即将执行任务的同一 Profile 做只读登录核验。
2. 已登录则继续；未登录、验证码或访问限制转为类型化 `human` waitpoint。
3. 用户在浏览器中完成后，系统重新 observe 并恢复同一个运行；不能新建一次运行伪装恢复。
4. 只保存非秘密 Profile 引用和状态摘要，不复制 Cookie、密码、token 或验证码。
5. BrowserSkill 控制会话始终在 `finally` 中关闭；Profile 本身保留，供后续任务复用。

2026-09-13 02:47 的原始只读回包显示当前 BrowserSkill 扩展可连接，同一 Chrome Profile 的京东首页和详情页当时均显示账户入口、“我的京东”和购物车。该浏览器进程后来退出，事实不能写成永久保证；后续商品访问的网络链路经过京东 `risk_handler` 再转认证页，也不能只凭最终页面归因为普通登录缺失。

## 11. 当前代码现实

新会话开始开发前，应确认下列职责仍与 checkout 一致：

| 当前能力 | 当前落点 | 处置 |
| --- | --- | --- |
| AI Connect 结构化调用与现有 Pi adapter | `apps/api/src/ai/model.ts` | 扩展现有 Pi 入口以绑定工具；不创建新 provider 路由 |
| 手写探索循环 | `apps/api/src/task-chain/runtime-host.ts` 的 `TaskRuntimeHost.explore` | P1/P2 替代通过后删除 |
| 全量计划/链路候选生成 | `apps/api/src/task-chain/authoring.ts` | 改成语义计划、紧凑注解和确定性编译 |
| BrowserSkill 的 TaskChain 适配 | `packages/browser/src/task-chain-adapter.ts` | 保留；补齐经验证的通用结构化读取能力 |
| 编排、队列、授权和恢复 | `apps/api/src/task-chain/service.ts`、`plan-executor.ts` | 保留事实边界，接入新 authoring 生命周期 |
| 通用 IR 与运行 | `packages/contracts/src/task-chain/`、`packages/runtime/src/task-chain/` | 保留并只做必要的通用扩展 |
| 版本与 SQLite 记录 | `apps/api/src/task-chain/repository.ts` 及数据库层 | 保留；旧行只读，不删除、不猜测改写 |
| 用户投影 | `apps/workbench/src/Plan.tsx`、`LiveChain.tsx`、`Results.tsx` | 显示四级状态、错误层级、来源和消费 |

当前 checkout 有大量上一轮未提交改动。不得 `reset --hard`、`clean`、覆盖用户改动、创建 worktree 或推送。每个阶段先用 `git status --short` 和定点 diff 确认文件归属，再做窄修改。

## 12. 六个开发阶段

文档阶段 P0 已完成。代码按以下六段顺序推进，每段通过自己的最小验证和清理门后再进入下一段。

### P1：Pi AgentSession 探索入口

目标：让 authoring job 通过现有 AI Connect 选择创建一个带 BrowserSkill 工具的 Pi AgentSession，完成代表任务并返回真实业务结果。

工作：扩展现有 model provider 的 tool-enabled AgentSession surface；冻结一次 job 的账号/连接/模型选择；打通取消、事件、失败和 finally 会话关闭；删除 provider 自动切换或失败后碰运气重试。

完成门：替身测试证明多轮工具调用、最终结果、取消和模型错误分层；实际模型测试留到 P6，P1 不运行京东。

### P2：BrowserSkill 工具桥与类型化轨迹

目标：所有探索动作通过一个受控桥执行，并形成足以编译的轨迹和字段来源。

工作：为每个工具定义 Zod 输入输出、授权动作/origin、动作后观察、稳定目标、BrowserRun 关联和 provenance；检查并接入成熟的 target/HTML/语义快照能力；敏感信息过滤；一次产品运行只占用一个浏览器控制会话。

完成门：替身轨迹能完整说明一个读页面任务和一个有交互任务；临时引用、无来源字段和不支持能力会明确拒绝。

### P3：语义计划和紧凑编译注解

目标：计划只表达步骤、动态合同、依赖、业务限制和完成标准；模型只生成引用真实轨迹的紧凑注解。

工作：移除由模型决定技术预算和整张节点图的 schema/prompt；支持 URL 作为输入或由发现步骤产生；校验每个输出字段来源；模型推断显式化为 `llm` 节点声明。

完成门：固定轨迹夹具对模型注解做严格通过/拒绝测试；注解不能产生轨迹外动作、任意代码或第二份可执行 DSL。

### P4：确定性 Trace-to-Graph 编译器

目标：从已校验轨迹和注解生成唯一的现有 `TaskChain`，并由 `compileTaskChain` 验证。

工作：实现规范化、参数绑定、稳定定位、循环折叠、来源映射、错误出口、检查点、终止节点和预算推导；输出不可重现时停止在 E1；不改变 LangGraph 的唯一运行器地位。

完成门：相同输入产生稳定等价图；一个读页面任务和一个交互任务都能编译；无来源、临时 ref、无界循环和隐藏 LLM 均被拒绝。

### P5：产品编排、恢复与 Workbench

目标：把 E1–E4、登录等待、具体错误和分离消费接入现有 service/repository/UI。

工作：authoring job 保存探索、编译和验证阶段；样本与换输入各建独立运行；人工登录恢复同一运行；Workbench 展示业务进度、具体技术预算和供应商错误；旧记录保持只读。

完成门：API/Workbench 聚焦测试覆盖状态刷新、取消、重启恢复、登录等待、部分结果和错误文案；不存在含混“额度耗尽”或伪成功。

### P6：真实浏览器验收、清理与冻结

目标：用真实用户 Profile、产品模型入口和正式 BrowserSkill 完成闭环，并清除被替代实现。

顺序：

1. 检查 4173/4175、BrowserSkill 会话和目标 Profile；需要登录时先让用户完成登录，再开始受控运行。
2. 用上文的一条简短详情需求和一个真实京东 URL 完成 E1。
3. 编译后由正式运行器在代表 URL 上完成 E3。
4. 用至少两个未参与探索的同类 URL 完成 E4，核对每个字段来源和运行期模型调用。
5. 冻结版本后，用一个品牌 10 个型号验证“发现一组输入 + 同一详情链路逐项复跑”，不生成十张图。
6. 再完成一种非数据采集任务，证明公共 IR 和编译器没有被京东样例绑死。
7. 按配套清理文档删除旧循环、旧全量候选 prompt/schema、过时测试/文档/exports/依赖和空目录。

完成门：真实结果、BrowserRun/TaskRun/模型审计、来源、消费和会话回收均可核对；任何未通过项单列，不能用离线测试替代。

## 13. 最小验证矩阵

阶段内只运行覆盖本次不变量的所属 package 命令；未经用户另行授权不跑根级全量测试。

| 变更范围 | 最小验证 |
| --- | --- |
| API Pi/authoring/service | `npm run check --workspace @browser-capture/api`，再运行对应的单个 `tsx --test` 文件 |
| BrowserSkill 适配 | `npm run check --workspace @browser-capture/browser`，再运行对应 adapter/session 测试 |
| contracts | `npm run check --workspace @browser-capture/contracts`，再运行 task-chain 聚焦测试 |
| runtime/compiler | `npm run check --workspace @browser-capture/runtime`，再运行 compiler/runtime 聚焦测试 |
| Workbench | `npm run check --workspace @browser-capture/workbench`，再运行对应 projection/connection 测试 |
| 文档与阶段收口 | `git diff --check`、链接检查、CodeGraph/`rg` 死引用检查和明确路径 diff 审阅 |

真实模型和浏览器只在 P6 有界执行。每次失败先按层定位，不重复整条任务：AI Connect/Provider → Pi AgentSession → 工具桥 → BrowserSkill → 页面/登录 → provenance → 编译器 → runtime → repository → UI。

## 14. 停止条件

遇到以下任一情况，停止当前运行并保留证据，不靠追加参数继续试：

- Pi AgentSession 不能使用现有 BrowserSkill 工具，需要改共享包公共能力；
- BrowserSkill 没有可复用的受控结构化读取能力，且成熟解析组件尚未选定；
- 输出字段没有可重现来源，或目标只能依赖临时 ref；
- 编译器需要网站、商品、评论、表单等平台固定类型才能继续；
- 准备删除成熟库后用本仓代码重写同一能力；
- 同一失败在未得到新证据时准备再次运行；
- 登录、验证码或访问限制需要用户接管。

阻塞报告必须写明失败层、已获得证据、未运行范围和下一项能消除不确定性的动作。

## 15. 完成定义

本重构只有同时满足以下条件才完成：

1. 产品探索确实经过 AI Connect → Pi AgentSession → BrowserSkill，不依赖 Codex，也不存在宿主手写第二套 Agent 循环。
2. 探索首先返回真实业务结果；轨迹、字段来源和动作后观察能够解释结果如何得到。
3. 模型不直接生成完整图；宿主从真实轨迹确定性生成唯一现有 `TaskChain`。
4. 所有普通输出可重现；模型推断只存在于显式 `llm` 节点并进入审计。
5. 技术预算由编译器推导，业务数量与账号/供应商用量分别展示。
6. 同一链路通过代表输入和不同输入验证，之后才冻结和批量复跑。
7. 登录态由 Profile 复用，失效时人工接管并恢复同一运行，秘密不进入 Git、日志或普通记录。
8. 京东详情和第二类任务均有真实浏览器证据；测试、样例和截图不能替代。
9. 配套清理清单全部完成，仓库没有被替代的循环、prompt、fixture、export、依赖、空目录或冲突的当前设计说明。

## 16. 新会话开工指令

新会话应按下面顺序执行，不需要重读本次长对话：

1. 读取本文件、[清理清单](TASK_CHAIN_AUTHORING_CLEANUP.md)、[ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md) 和 [当前进度](PROGRESS.md) 首节。
2. 运行 `git rev-parse --show-toplevel`、`git status --short --branch`，保护当前未提交工作；不得 reset、clean、建 worktree 或 push。
3. 用 CodeGraph 定位 `createAIModelProvider`、`TaskRuntimeHost.explore`、`TaskChainAuthoring.chain`、`TaskChainBrowserAdapter.observe`、`compileTaskChain` 的当前定义和调用影响；索引未初始化时先请求用户授权初始化。
4. 从 PROGRESS 首节的首个未完成阶段继续；先写本阶段 Product Alignment/处置记录，再修改，再做最小验证和清理。已通过阶段不重新从头执行。
5. P1–P5 未通过前不启动京东批量任务；P6 登录核验完成后才运行真实浏览器。
6. 每阶段把结果、基线失败、环境阻塞、未测项和清理证据更新到 `PROGRESS.md`，避免下一会话重新猜测。
