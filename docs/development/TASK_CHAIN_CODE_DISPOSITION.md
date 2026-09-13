# 通用任务链路代码收敛实施清单

日期：2026-09-12
状态：历史 M1–M7 收敛记录；不再定义 2026-09-13 之后的 authoring 实施方向
适用范围：`browser-auto-tool` 当前 checkout

本文把 [通用浏览器任务链路架构](TASK_CHAIN_ARCHITECTURE.md) 转换为逐层、逐文件的代码处置清单。它负责回答三件事：哪些能力继续作为正式实现，哪些实现必须围绕通用任务链路重写，哪些重复或样例代码在替代路径接通后删除。

> 当前首次探索、轨迹编译和每阶段清理以 [重构实施说明](TASK_CHAIN_AUTHORING_REDESIGN.md) 与 [新清理清单](TASK_CHAIN_AUTHORING_CLEANUP.md) 为准。本文只保留通用 IR 收敛的历史依据，其中“受控探索/候选编译已完成”不再是当前架构结论。

本文不授权删除 SQLite 中的用户任务、计划、链路、运行或浏览器历史。历史记录在迁移期间保持可读，并以版本状态明确区分是否仍可执行。

## 1. 收敛结论

迁移前审计发现两套动作图与运行器：

1. `workflow.ts`、`run.ts`、`ordinary-run.ts` 组成的隔离原型，只由自身测试与原型夹具引用，没有进入正式 API、队列和 Workbench 链路。
2. `chain.ts`、runtime `capture.ts`、API `chain/capture` 组成的生产路径，已经接通版本、授权、队列、浏览器、持久化和 UI，但其公共合同固定为 URL、字段、行、来源覆盖和抓取结果。

2026-09-12 的收敛结果只保留 `packages/contracts/src/task-chain/`、`packages/runtime/src/task-chain/` 与 `apps/api/src/task-chain/` 这一条正式事实路径。旧 capture 生产路径和 workflow/ordinary-run 原型均在替代门通过后删除；SQLite 物理表中的旧 JSON 没有删除或猜测迁移，而是按 `legacy_read_only` 列出和导出。

计划、链路和运行时的公共边界只描述通用浏览器自动化；站点、商品、字段、评论、剧集、表单等内容由具体任务的输入、输出 schema 和节点参数承载。

能力按下表收敛；删除的是重复包装、领域硬编码和对照样例，不是把成熟组件换成自研版本：

| 产品能力 | 当前正式实现 | 处置结论 |
| --- | --- | --- |
| 异步图推进、循环、取消和递归限制 | LangGraph `StateGraph` | 保留并作为唯一执行底座 |
| 产品运行、检查点和审计持久化 | SQLite + Drizzle 的 `TaskRun` 仓储 | 保留现有成熟存储；不建立第二个引擎数据库 |
| 浏览器控制、会话与元素重定位 | BrowserSkill capability adapter | 保留能力提供者，平台只做 typed 映射 |
| 跨包协议与动态值校验 | Zod | 保留并在边界立即校验 |
| 模型账号、调用生命周期与共享对话面 | AI Connect | 保留完整公共 surface |
| 节点画布和基础组件 | React Flow + Radix | 保留，Workbench 只组合产品投影 |

## 2. Baseline Impact

```text
Baseline Impact:
- touched layers: contracts、runtime、browser adapter、API planning/chain/run、database record payload、Workbench projections、focused tests
- owning fact source: RequirementRecord owns confirmed intent; PlanRecord owns task composition; ChainRecord owns one versioned reusable chain; ExecutionRecord owns one authorized run; BrowserRecord owns browser session and human waitpoint lifecycle
- public interface changed: yes, the capture-shaped plan/chain/run contracts will be replaced by the generic task-chain IR and typed run outcomes
- new protocol/adapter/fallback: generic node/value-binding contract and BrowserSkill capability adapter; LangGraph remains the sole graph engine, with no second parser, runtime, or fallback state machine
- compatibility or legacy path changed: yes, existing persisted payloads remain readable but non-executable unless migrated to the new contract version
- baseline update required: no, TASK_CHAIN_ARCHITECTURE.md and ADR 0001 already define the approved target boundary
- architecture tests to run: focused contract/runtime/browser lifecycle checks plus replay acceptance across two different task categories
```

## 3. Patch Disposition

```text
Patch Disposition:
- delete: the disconnected workflow/run prototype after its valid invariants are ported; production sample data; capture-only public types, prompts, projections, helpers, and tests after their generic replacements are active
- keep: version/digest/authorization boundaries, transactional persistence, queue ownership, browser ownership and cleanup, semantic target re-resolution, budgets, typed human waitpoints, checkpoint/resume, idempotency, audit, and explicit LLM-node accounting
- rewrite: requirement and plan contracts, chain IR, runtime interpreter, browser capability mapping, API orchestration, record payload parsing/migration, Workbench plan/chain/result projections, and focused tests
- reason: one generic task-chain fact source and one runtime must support both single-path tasks and repeated/composed tasks without encoding a site or output domain into platform contracts
```

## 4. 保留并迁入正式边界的能力

“保留”指保留业务不变量和已验证机制，不保证原文件逐行不动。

| 能力 | 当前落点 | 保留理由与目标归属 |
| --- | --- | --- |
| 需求、计划、链路和运行的版本/digest 绑定 | `apps/api/src/task-chain/repository.ts`、`service.ts` | 防止旧计划、旧链路被新授权误用；各自记录继续拥有版本事实 |
| 独立授权与单浏览器队列 | `TaskChainService`、`TaskPlanExecutor`、`TaskRuntimeHost` | 确认计划只创建授权运行，浏览器成功必须来自正式队列的真实执行 |
| 数据库事务、序列与幂等写入 | `apps/api/src/database/schema.ts` 及 repositories | 物理存储可继续承载版本化 JSON 记录；只替换 payload contract 与迁移规则 |
| BrowserSkill 会话所有权、互斥、预算、审计和 `finally` 回收 | `packages/browser/src/session.ts`、`transport.ts`，`apps/api/src/browser/service.ts` | 浏览器是副作用边界；保留进程与生命周期机制，扩充为通用 capability adapter |
| 每次动作前重新解析语义目标 | browser session/command 路径 | 节点保存稳定语义，不保存一次 observation 中的临时元素引用 |
| typed 人工等待、返回后 fresh observe、人工时间不计自动化预算 | browser contract/session/service | 人工节点是可恢复状态，不是短超时重试；由任务链声明请求与恢复条件 |
| 图推进、检查点、恢复、幂等键与显式 LLM 审计 | LangGraph-backed `packages/runtime/src/task-chain/` 与 API repository | `StateGraph` 承担图推进；产品规则迁入唯一 runtime，不存在第二套可执行引擎 |
| Workbench 的运行选择、版本、状态、画布布局、事件和审计承载 | `Plan.tsx`、`LiveChain.tsx`、`Results.tsx` 等 | 保留通用交互骨架，数据投影改读通用计划、节点和输出 artifact |
| AI Connect、访谈 Timeline、模型选择和任务草稿确认 | interview/AI integration 与 vendor sync 路径 | 这些属于需求形成和共享 Agent Surface，不因链路 IR 迁移被重做 |

## 5. 已完成重写的生产路径

### 5.1 Contracts：建立唯一公共合同

| 文件 | 当前问题 | 重写目标 |
| --- | --- | --- |
| `packages/contracts/src/requirementBrief.ts` | 把 deliverable 固定为 entity/fields/coverage/limit，并把来源发现作为所有任务必需项 | 通用目标、运行输入、约束、可观察完成条件、授权/风险；任务输出使用版本化动态 schema |
| `packages/contracts/src/plan.ts` | 步骤固定为 `enumerate/collect/derive`，强制来源与字段映射 | 通用步骤、依赖、输入/输出 binding、循环或链路调用、预算、完成条件；来源证据按任务需要出现 |
| `packages/contracts/src/chain.ts` | 节点、输入和结果固定为 URL、field、row、coverage | 实现 `browser/observe/data/condition/loop/invoke/human/llm/checkpoint/emit/terminal` 节点族，通用 value binding、typed outcome 和动态输入输出 schema |
| `packages/contracts/src/capture.ts` | 抓取记录被当成平台运行结果 | 任务级 schema 或兼容读取适配；不再作为公共执行事实源 |
| `packages/contracts/src/browser.ts` 与 `packages/browser/src/contracts.ts` | command 与 target role 覆盖面不足，人工请求缺少节点提供的恢复条件 | 定义通用浏览器 capability、稳定语义目标、typed permission/risk/outcome 和 human request/resume contract |

完成本阶段后，`packages/contracts` 对外只能导出一套任务链路定义，不再同时公开 `workflow`、`run` 与 `chain/capture` 三组相互竞争的概念。

### 5.2 Runtime：由抓取执行器变为 LangGraph-backed 通用适配层

| 文件 | 当前问题 | 重写目标 |
| --- | --- | --- |
| `packages/runtime/src/capture.ts` | 执行状态以 page/row/field 为中心，handler 与抓取节点 union 一一绑定 | 唯一 `TaskChainRuntime`：把 typed context 和节点语义映射到 LangGraph `StateGraph`，支持 binding、分支、循环、链路调用、人工等待、检查点、输出和终态 |
| `packages/runtime/src/capture-compiler.ts` | 图校验能力可用，但仅理解 capture node union | 对通用 IR 做可达性、端口/binding、终态、循环边界、能力声明和显式 LLM 节点校验 |

运行器不理解“京东”“商品”“评论”“视频”或具体字段名。批量任务通过 `loop` 或 `invoke` 把不同输入传给同一已验证链路，不复制一百份动作图。

### 5.3 Browser adapter：只提供浏览器能力

| 文件 | 当前问题 | 重写目标 |
| --- | --- | --- |
| `packages/browser/src/session.ts` | 某些 origin 变化会在 adapter 内自动解释成人工请求 | 返回 typed permission/navigation outcome，由运行器根据当前节点决定暂停、分支或失败 |
| `packages/browser/src/contracts.ts`、`index.ts` | command 和 target schema 只覆盖当前抓取动作 | 映射通用 browser/observe 节点所需能力，不承担计划、链路持久化或复跑 |
| `apps/api/src/browser/service.ts` | 固定人工提示与业务恢复语义靠 adapter 推导 | 接收已校验的 human node 请求，保存 BrowserRecord waitpoint；Done 后只 fresh observe 并回传结果 |

登录、验证码、确认和风险挑战是正常的人类节点。只有运行时证据表明确实需要人工操作时才请求；已满足的登录态不会因为计划写了“需登录”而再次暂停。

### 5.4 API：通用计划、编译、运行与组合

| 文件/区域 | 当前问题 | 重写目标 |
| --- | --- | --- |
| `apps/api/src/plan/model.ts`、`validation.ts` | prompt 与 validator 强制 `enumerate/collect/derive`、deliverable field/source mapping | 生成并校验通用任务计划；来源研究只是可选步骤或证据，不是平台前置条件 |
| `apps/api/src/plan/evidence-model.ts`、`evidence-validation.ts`、`evidence-runner.ts`、`service.ts` | 默认把 Web 搜索与来源覆盖当作每个任务的计划阶段 | 由任务计划显式声明是否需要发现/取证；移除固定搜索站点和抓取领域假设 |
| `apps/api/src/chain/exploration.ts`、`model.ts`、`service.ts` | 探索—编译—换输入验证的生命周期正确，但 prompt、输入选择和验收固定为 URL/fields/rows | 保留生命周期，围绕通用 node/value schema 编译；用不同运行输入验证可复用性 |
| `apps/api/src/capture/executor.ts` | 把上游行映射为 `{url,value}`，累积固定 CaptureRow | 替换为通用 execution coordinator：解析 bindings、调用链路、收集 typed artifacts、推进 checkpoint |
| `apps/api/src/chain/repository.ts` | 版本与恢复有价值，candidate/repairRows 等内容属于抓取 | 保留版本事务；payload 改为通用 ChainRecord/RunEvidence，旧版本标记兼容状态 |
| `apps/api/src/database/schema.ts` | 表本身基本通用，TypeScript payload 绑定旧合同 | 保留表与历史；新增 contract version/migration 读取，不直接清空或伪装迁移成功 |

### 5.5 Workbench：显示任务事实，不解释任务领域

| 文件 | 当前问题 | 重写目标 |
| --- | --- | --- |
| `apps/workbench/src/Plan.tsx` | 来源、字段和抓取覆盖是主要固定信息结构 | 投影通用步骤依赖、输入输出、完成条件、预算与按需证据 |
| `apps/workbench/src/LiveChain.tsx` | 画布可复用，节点详情只理解现有 capture kinds | 从通用 node family、具体 operation、binding、状态和事件生成节点视图 |
| `apps/workbench/src/Results.tsx` | 结果固定为 rows、URL、source record 与 capture 文件名 | 展示通用 run outputs/artifacts、节点审计、失败/等待/恢复和任务定义的导出格式 |
| `apps/workbench/src/ChainView.tsx` | 正式视图仍带产品数据结构样例入口 | 只保留 live/empty/error/version 状态；开发样例不进入生产入口 |
| `apps/workbench/src/ArtifactViews.tsx` | 含商品/型号固定展示内容 | 改为通用 artifact renderer 或由任务声明的 renderer；无声明时安全展示结构化值 |

## 6. 替代路径接通后删除

本轮删除门已逐项满足，结果如下：

| 清除项 | 结果 | 保留边界 |
| --- | --- | --- |
| workflow/run 隔离包装、XState 对照及旧测试 | 已删除 | LangGraph `StateGraph` 能力迁入唯一 runtime；幂等、检查点、恢复、互斥和模型审计进入聚焦测试 |
| capture-only contracts/runtime/API plan/chain/capture 服务 | 已删除 | 版本、授权、队列、浏览器 ownership 与持久化机制由通用实现接管 |
| Workbench 结构样例、固定商品/型号/来源投影及旧浏览器脚本 | 已删除 | live/empty/error、计划、链路、运行和 artifact 统一读取新合同 |
| 旧 public exports 与未使用的 LangChain core、独立 SQLite checkpointer、better-sqlite3、XState 直接依赖 | 已删除 | runtime 保留 `@langchain/langgraph`；产品状态沿现有 API SQLite/Drizzle 单一事实源持久化 |
| SQLite 中旧 plans/chains/executions JSON | 未删除 | 原字节只读列出和导出，不进入新 parser/runtime |
| BrowserRecord 的 `plan_evidence`/`repair` 枚举值 | 仅保留读取兼容 | 新 BrowserGrant 已禁止创建这些用途，新运行只写 exploration/verification/replay |

以下迁移前文件已经删除，不再参与正式运行：

- `packages/contracts/src/workflow.ts`
- `packages/contracts/src/run.ts`
- `packages/contracts/tests/workflow.test.ts`
- `packages/contracts/tests/run.test.ts`
- `packages/runtime/src/ordinary-run.ts`
- `packages/runtime/src/xstate-contrast.ts`
- `packages/runtime/src/audit-boundaries.ts`
- `packages/runtime/PROTOTYPE.md`
- `packages/runtime/tests/ordinary-run.test.ts`
- `packages/runtime/tests/xstate-contrast.test.ts`
- `packages/runtime/tests/fixtures/cross-process-worker.ts`

以下生产样例也已清除：

- `apps/workbench/src/chainData.ts`
- `ChainView.tsx` 中“查看链路结构样例”及其引用
- `ArtifactViews.tsx` 中固定商品、型号和详情数据

以下内容已随替代实现删除，没有留下可执行兼容分支：

- capture-only contract exports 与 runtime handlers；
- `packages/contracts/package.json` 中的 `./workflow`、`./run` 旧公开入口，以及确认只服务对照原型的 runtime `xstate` 依赖；
- disconnected prototype 专用的 LangChain core、LangGraph SQLite checkpointer 和 runtime 内置 better-sqlite3 直接依赖；正式运行继续直接依赖 LangGraph `StateGraph`；
- plan/chain prompt 中固定的 `enumerate/collect/derive`、field/source/row 规则；
- API 中 `repairRows`、固定 `{url,value}` 输入和 CaptureRow 累积；
- Workbench 中固定 capture row/source/product 投影；
- 只证明上述旧形状的 fixture、测试和 PowerShell 场景断言。

删除门只有三个：生产 imports 已迁完、有效不变量已有通用测试、历史 payload 已有明确读取状态。不能以保留兼容为由留下第二 parser、第二 runtime 或第二事实源。

## 7. 不属于本轮清算的改动

当前工作区还包含访谈、共享 Agent Surface、AI Connect/vendor 同步、依赖和既有浏览器传输修复。这些内容不因减少 `git status` 而删除：

- `.agents/skills/interview-browser-task/SKILL.md` 原计划保留；旧 brief/`interview-result` 协议删除后，为避免 Skill 继续生成已删除格式，本轮已将它改为单份通用 Markdown 需求输出
- interview Timeline/protocol 和模型选择相关文件
- `vendor/agent-platform/*` 与 AI Connect 包同步产物
- 与本架构迁移无关的 package/lockfile 变化

实施每个阶段前必须再次按实际 diff 判断这些改动的作者、目的和依赖关系，不能把用户已有改动算作本轮重写成果。

## 8. 实施顺序与每阶段出口

### M0：冻结文档事实源（已完成）

- `AGENTS.md` 固定项目最高旨意与 Product Alignment。
- `CONTEXT.md` 固定领域术语。
- `TASK_CHAIN_ARCHITECTURE.md` 与 ADR 0001 固定公共边界。
- 本文固定代码处置和删除条件。

出口：后续代码评审可以明确指出某个类型、节点或 prompt 属于平台合同还是任务数据。

### M1：唯一 Contracts（已完成）

- 先定义通用 requirement、plan、chain、binding、run outcome 与 contract version。
- 给旧 JSON payload 明确 `legacy_read_only` 或可验证迁移结果。
- 调整 package exports，使新代码只依赖一套权威类型。

出口：contracts 的聚焦类型/协议检查通过；用两个不同类别的任务 fixture 证明 schema 不含领域硬编码。

当前落点与证据见 [M1 实施记录](M1_CONTRACT_IMPLEMENTATION.md)：

- `src/task-chain/` 提供唯一正式 requirement/plan/chain/binding/run/version 合同，含 11 类节点、动态值 schema、版本固定的 invoke/each、typed outcome、运行身份、检查点及未知模型调用审计。
- package root 与正式子路径只指向新合同；旧 capture/workflow/legacy exports、旧源码和旧消费者 imports 已在 M4–M6 完成迁移后删除。访谈只形成单份 Markdown 需求，不再生成 brief/`interview-result`。
- `readTaskContractJson` 保留完整原始 JSON；无版本为 `legacy_read_only`，未知版本为 `unsupported_version`，损坏内容为 `invalid`。没有迁移或清空 SQLite，也没有把旧数据猜成当前类型。
- contracts typecheck 与聚焦协议测试通过；两类 fixture 证明协议表达，真实浏览器证据仍由 M7 单独验收。
- M1 当时记录的 legacy bridge 和“尚未接入”限制已经由 M4–M6 收口；本节不再作为当前接续状态。

### M2：唯一 Runtime（已完成）

- 把 compiler 与 executor 重写到通用 IR。
- 复用 LangGraph `StateGraph` 承担异步图推进、循环调度、取消和递归上限，不实现手写执行循环。
- 迁入幂等、检查点/恢复、预算、审计、人工等待和显式 LLM 计数不变量。
- 支持 `loop`/`invoke` 对同一链路传入多组值。

出口：不启动浏览器即可用内存 capability stub 验证单任务、组合任务、暂停恢复和零 LLM 复跑。

### M3：Browser capability adapter（已完成）

- 把 browser/observe/human 节点映射到 BrowserSkill。
- adapter 只返回 typed observation/outcome，不推断登录是否成功或任务如何继续。
- 保留真实 session、ownership、allowlist、budget 和 cleanup。

出口：聚焦浏览器生命周期测试通过；已有登录态不请求人工，真实阻断产生一个可恢复 waitpoint，Done 后 fresh observe 决定后续状态。

### M4：API orchestration 与持久化迁移（已完成）

- 通用化 planning、chain exploration/compile/validation、execution coordinator 和 repositories。
- 组合计划通过 binding 调用已验证链路，不按输入复制图。
- 旧记录保持可读，禁止旧 digest 直接进入新运行器。

出口：API 聚焦测试证明确认计划、排队、恢复、版本失效和 artifact 持久化的真实状态转换。

### M5：Workbench 投影（已完成离线投影）

- 任务计划、任务链路、运行结果读取新合同。
- 节点显示 family、operation、binding、状态和事件。
- 移除生产样例数据和 capture-only 展示假设。

出口：两个不同类别的任务记录能由同一组组件展示；等待、失败、恢复、完成状态可区分。

### M6：删除被替代代码（已完成）

- 删除第 6 节列出的隔离原型、生产样例和 capture-only 路径。
- 删除 package exports、imports、fixtures、tests 和文档中的失效引用。
- 用结构搜索确认不存在第二 graph schema、第二 runtime 或旧 public export。

出口：全仓只有一套任务链路 contract/compiler/runtime；历史数据仍有明确读取结果。

### M7：最小充分验证（部分完成）

按风险从小到大执行，不运行与当前阶段无关的根目录或全量套件：

1. owning package typecheck；
2. contracts/runtime/browser/API 的聚焦不变量测试；
3. 两种不同任务类别的 fixture replay；
4. Workbench 对应状态的定向 UI 检查；
5. 最后才做一次受控真实浏览器验收，先单输入再不同输入复跑，避免把站点频控当成代码循环测试工具。

每一阶段单独报告产品缺陷、测试夹具缺陷、环境/站点阻断和未验证项。测试次数不是完成标准；完成标准是系统自身能保存、复用、运行并审计同一条参数化任务链路。

五个所属包 typecheck 与 111/111 聚焦测试曾在离线收口时通过，其中 runtime 固定 LangGraph 正式依赖并覆盖超过默认递归阈值的图推进和外部取消检查点。随后一条预先明确输入、字段和步骤的公开页面提取链路完成真实 Workbench 操作、代表输入、不同输入验证和普通复跑；它只证明运行管道，不证明自然语言任务编译质量。简短自然语言闭环、第二类非数据采集任务及真实登录/人工返回仍没有现场证据。

## 9. 首个纵向验收切片

首个切片只证明通用机制，不承担完整批量数据交付：

1. 计划链路 A 形成一组动态详情入口。
2. 计划链路 B 以一个详情入口为输入，完成页面导航、必要人工节点、参数/评论等任务定义的输出。
3. 使用另一个详情入口验证链路 B；验证成功后，普通运行对剩余输入重复调用同一 ChainVersion。
4. 链路 B 的节点、binding、checkpoint、typed outcome 与 artifact 可审计；任务字段只存在于该任务的 schema/data 中。
5. 再用一个非数据抓取任务验证同一 IR，防止首个验收样例重新变成平台边界。

该切片通过后再扩大输入规模。站点风险页、频控或商品差异是运行 outcome，不得触发无限重试，也不得促使平台新增站点硬编码。
