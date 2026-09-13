# M2–M7 通用任务链路实施记录

日期：2026-09-12；2026-09-13 补充 M7 现场证据。
状态：历史实施记录。原 M2–M7 证据保留，但其中手写探索循环与模型完整候选编译已被 [ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md) 否决；当前接续只按[重构实施说明](TASK_CHAIN_AUTHORING_REDESIGN.md)执行。

```text
Product Alignment:
- natural-language task: 将已确认的任意浏览器任务编译成可验证、可复跑的参数化链路
- reusable chain boundary: 一个计划步骤对应一个固定版本 Chain；集合逐项调用同一 ChainVersion
- runtime inputs: 由任务版本动态 schema 校验的 JSON 值和 artifact 引用
- dynamic task outputs: 由任务版本声明并由 emit/terminal 校验的值或 artifact
- generic platform capability used: binding、图编译、11 类节点、预算、幂等、检查点、人工等待、组合调用和审计
- replay model calls: 普通节点没有模型依赖；只有实际执行的显式 llm 节点产生模型调用审计
- site/task-specific code added: no

Baseline Impact:
- touched layers: runtime、browser adapter、API orchestration/persistence、Workbench projections、package exports、focused tests、development docs
- owning fact source: RequirementVersion/PlanVersion/ChainVersion/TaskRun 分别拥有意图、组合、执行图和本次事实；browser session 只拥有现场
- public interface changed: yes，移除 legacy/capture/workflow/run 公共路径，正式 API/UI 只读写 bat-task-chain/v1
- new protocol/adapter/fallback: one LangGraph-backed TaskChainRuntime and one BrowserCapability adapter; no second parser/runtime or model fallback
- compatibility or legacy path changed: persisted unversioned JSON remains byte-preserved and is surfaced as legacy_read_only; never enters the new runtime
- baseline update required: no，落实已确认 TASK_CHAIN_ARCHITECTURE 与 ADR 0001
- architecture tests to run: runtime/compiler、browser adapter、repository/orchestration、Workbench projection 的聚焦测试和两类离线 replay

Patch Disposition:
- delete: disposition section 6 中的 disconnected prototypes、capture-only contracts/runtime、production samples、legacy exports/imports/tests and unused dependencies after gates pass
- keep: interview/AI Connect、browser ownership/transport、SQLite user history、authorization/version/digest、semantic re-resolution、cleanup、checkpoint/idempotency/audit invariants
- rewrite: compiler/runtime、capability adapter、generic repositories/API coordination、Workbench plan/chain/run views
- reason: production must have one executable IR and one fact path while old JSON remains readable evidence rather than an executable alternate system
```

## 清除清单与删除门

最终清除范围以 [TASK_CHAIN_CODE_DISPOSITION 第 6 节](TASK_CHAIN_CODE_DISPOSITION.md) 为权威。本轮开始前确认其包含：

1. `packages/contracts/src/{workflow,run,capture,chain,plan,requirementBrief}.ts` 中被通用合同替代的旧形状，以及旧 workflow/run tests 与 package legacy exports。
2. `packages/runtime/src/{ordinary-run,xstate-contrast,audit-boundaries,capture,capture-compiler}.ts`、PROTOTYPE、旧 runtime tests/worker fixture，以及只服务对照原型的 XState、独立 SQLite checkpointer 等直接依赖；LangGraph `StateGraph` 保留并迁入正式 runtime。
3. API 的 capture executor、capture-only exploration/model/repository/service、固定 `enumerate/collect/derive`、`{url,value}`、CaptureRow、repairRows 和旧持久 payload parser。
4. Workbench 的 `chainData.ts`、结构样例入口、固定商品/型号/来源行展示及只证明旧投影的 tests/scripts。

每项删除前核对三个门：生产 imports 已迁完；幂等、检查点、恢复、预算、人工等待和模型审计已有通用测试；SQLite 中旧 JSON 有 byte-preserving `legacy_read_only` 读取结果。未满足的条目留在“未清除”并写出原因，不能为了状态干净直接删除。

## 执行约束

- 使用当前 master checkout，保留开工前全部 dirty diff；不创建 worktree，不 reset，不清理用户数据。
- 每阶段先用 CodeGraph 核对结构影响；编辑后等待索引更新，只用所属包 typecheck 和必要的聚焦测试。
- 不启动真实 BrowserSkill session。本轮 M3 以受控 adapter fixture 验证 existing-session、typed waitpoint、fresh observe 和 finally cleanup；真实现场列为 M7 未测。
- M4 迁移只新增 schema/table/metadata 或写入新协议记录；旧 tables/rows 不删除、不改写。旧记录可以列出和导出，但新启动/恢复命令必须拒绝。
- M6 删除源码不等于删除 SQLite 数据。删除代码前再次扫描 production imports、exports、依赖和测试不变量。

## 完成结果

| 阶段 | 当前结果 | 关键事实 |
| --- | --- | --- |
| M2 | 完成 | 唯一 `TaskChainRuntime` 复用 LangGraph `StateGraph` 推进运行，并实现 binding、11 类节点、typed outcome、有界 loop/invoke、产品检查点、同运行恢复、未决副作用、显式 LLM 审计和预算暂停；编译器提前拒绝错误路径、非数组迭代、非标量稳定键和从 loop 终止出口回环 |
| M3 | 完成离线能力验证 | `TaskChainBrowserAdapter` 映射 browser/observe/human；BrowserSession 只执行受控命令、节点级超时、fresh observe、语义目标重解析、人工等待和 finally 回收；尚未实现的 target observe 明确返回 unsupported |
| M4 | 完成 | v10 新表保存当前合同；旧物理表原字节只读。确认需求、计划、代表输入探索、候选编译、双输入验证、固定版本授权、队列执行、父子链检查点恢复、artifact 和 stale cascade 共用 `apps/api/src/task-chain/` |
| M5 | 完成离线投影 | Plan 要求每个步骤提供代表输入再探索；LiveChain 和 Results 显示通用节点、验证、运行、预算消费和 artifact；连接使用服务端 `stateSequence` 拒绝旧状态回写 |
| M6 | 完成 | 删除 capture-only contracts/runtime/API、workflow/ordinary-run 包装、XState 对照、结构样例、旧 tests/scripts/fixtures、legacy exports 和原型专用依赖；生产只剩一套 IR/compiler 与一个 LangGraph-backed runtime |
| M7 | 部分完成 | 离线门通过；预先明确输入、字段和步骤的公开页面链路已完成真实 BrowserSkill 的代表输入、不同输入验证和普通复跑，只证明运行管道。简短自然语言编译、第二类任务及真实登录/人工返回待验收 |

最终离线验证：contracts、runtime、browser、API、Workbench 五个所属包 typecheck 全部通过；聚焦测试共 111/111（contracts 23、runtime 13、browser 25、API interview 36、API task-chain/browser 10、Workbench 4）；runtime 固定 LangGraph 正式依赖，并额外覆盖超过默认递归阈值的长图推进与外部取消检查点。访谈 Skill `quick_validate.py` 通过。`git diff --check` 无格式错误，仅报告 Windows 行尾转换提示；TS/TSX 文件均不超过 500 行。

首次链路生成不再让模型凭需求文本直接编造动作图。`generate_chain` 必须接收符合步骤合同的代表输入；宿主据需求和输入收窄 origin，在一个受控 BrowserSession 中循环执行“结构化模型决策 → typed command → fresh observation”，保存关联的 BrowserRecord 和实际模型调用数，再用内存中的代表轨迹编译候选。轨迹中的样本值不能固化进 Chain，候选仍必须经历 sample 和不同输入 verification 才能变成 verified。

计划授权时固定每个顶层 Chain 的 id/version/digest；`invoke` 子链通过父链 digest 间接固定。运行前计算整个 invoke 闭包，浏览器授权包含子链真正需要的动作和 origin。步骤预算是该步骤全部顶层调用、重试和子调用的总预算，计划预算又包住所有步骤；每次消费先持久化到 TaskExecution，恢复不会重新发放额度。预算用尽或集合超过授权数量会进入明确 blocked/partial 路径，不能截断后声称完成。

## M7 真实浏览器现场证据（2026-09-13）

- 正式任务 `9b60d049-9a0f-4dc5-8bc5-6fbf98adff3a` 生成计划 `2a12c604-004c-44da-8572-e3e1f8ca68c1` v2 和链路 `401e77ae-51a6-4c96-81f9-ad99f7a499fc` v5。链路以 URL 为运行输入，读取当前公开页面标题、主标题、首段和可见信息链接；源码没有加入站点或字段专用分支。
- 这份需求有 1801 个字符、62 行，提前给出了两个 URL、五个字段、高层操作顺序、预算和完成断言。它没有直接提供 BrowserSkill 命令或选择器，但已经把解法约束到接近脚本，因此本节只把它认定为运行器、binding、浏览器适配、审计和复跑的白盒验收，不认定为自然语言任务编译验收。
- 真实 sample `d05ffc78-f737-4898-877a-d29bbc50e8d9` 使用 `https://example.com/`，verification `d1868ac5-e87f-4923-8053-7051f8f3ec25` 使用 `https://example.org/`；二者均 6 次产品节点迁移、7 条实际 BrowserSkill 命令、0 次运行期模型调用，输出分别来自本次页面。
- 普通授权执行 `98a7264c-2585-484d-87f8-e648cbf91586` 创建 replay TaskRun `8deb3420-d041-4a53-83cc-b8c1905f9f2a`，使用固定链路版本完成同结构输出；7 条底层浏览器命令和 0 次模型调用均来自持久审计。Workbench 已实机查看计划、链路、运行和实际消费，浏览器会话已回收。
- 简短自然语言经过访谈形成计划与链路、第二类非数据采集任务及真实登录阻断/人工返回仍没有现场证据。
- 在上述出口之后误在已有京东历史任务上启动的新版批量计划生成不属于当前 M7：该轮 6 个 authoring job 中 5 个失败，记录跨度约 60 分钟，没有生成可执行新版计划或链路，也没有创建新的京东 BrowserRun；原有 legacy 计划、链路、执行和浏览器记录保持不变。该路径已停止；不保留供应商失败后的自动重试代码，也不把失败尝试计为验收证据。
- 偏航收口后，五个所属包 typecheck、contracts task-chain 7/7 和 API task-chain 3/3 通过；没有重复运行根级或全量套件。

## 缺陷分类

```text
Product Alignment:
- natural-language task: 将已确认的浏览器任务生成业务计划，并继续编译、验证和普通复跑
- reusable chain boundary: 一个计划业务步骤对应一条参数化 Chain，探索、编译、验证和复跑是该 Chain 的产品生命周期
- runtime inputs: 由计划和步骤合同校验的动态 JSON 输入
- dynamic task outputs: 由步骤及计划输出合同声明的值或 artifact
- generic platform capability used: TaskPlan、binding、预算汇总、结构化生成校验和模型调用审计
- replay model calls: 0；计划修复只发生在授权复跑前的 authoring
- site/task-specific code added: no
```

- **产品缺陷，已修复**：LangGraph 接入初版在恢复校验已经把运行标记为 paused 后，仍会经 `START` 进入首节点一次，可能重放未决浏览器副作用。现在入图前先检查产品运行状态；paused/终态直接返回，原未决副作用回归测试与新增取消测试共同覆盖该边界。
- **产品缺陷，已修复**：新需求版本建立后，stale 只标记了 Plan，没有级联到该 Plan 的 Chain/Execution。现在只从当前需求绑定的 Plan 集合计算有效闭包，旧计划及其下游全部只读。
- **产品缺陷，已修复**：授权执行曾读取“最新”链路，可能在授权后静默升级；现在只读取授权记录固定的 id/version/digest，缺失或校验失败进入 blocked。
- **产品缺陷，已修复**：服务重启时内存队列消失会留下永久 queued/running；现在 authoring、validation run 和 execution 分别收敛为 interrupted/failed/paused，并保留检查点和未知副作用。
- **产品缺陷，已修复**：顶层只有 `invoke` 时，浏览器授权没有看到子链能力；现在按固定引用求传递闭包。步骤多次调用和重试原先也可能分别取得完整预算，现在按持久总账扣减。
- **产品缺陷，已修复**：子链进入人工等待时，父链曾继续走失败出口；恢复也可能新建子运行、重复计算 invocation，且子链 `TaskOutput` 包装会被当成业务值。现在等待状态向父链传播，宿主按稳定 run id 复用子检查点，恢复不重复计费，组合输出只传递实际 value/artifact 引用。
- **产品缺陷，已修复**：计划与编译器曾把非法 each 集合/稳定键推迟到运行时，loop 的非 body 出口也能绕回自身；现在授权前即要求显式数组 item schema、标量稳定键和真正终止的 done/limit 出口。
- **产品缺陷，已修复**：浏览器节点超时过去只停上层等待，底层命令进程仍可能继续；现在 timeout signal 贯穿 adapter、session、transport 并终止命令进程。纯本地 wait 不再伪造浏览器会话，未实现的 `observe scope=target` 不再谎报整页观察成功。
- **产品缺陷，已修复**：真实探索会在动作后自动取得 fresh observation，但模型提示未说明该事实，且只读 `page` 为补充链接 href 又重复整页观察；十条底层命令预算因此可在一次导航后被重复观察耗尽。现在提示明确复用动作后观察，`page` 只为紧邻的 fresh observation 补充固定表达式读取的链接元数据，任何其他命令都会使该观察失效。
- **产品缺陷，已修复**：真实代表输入探索曾从完整需求文本收集所有 origin，模型因而试图在同一探索中提前访问“换输入验证”URL。现在动态代表输入包含 URL 时只授权该输入的 origin；仅固定站点任务没有 URL 输入时回退到已确认上下文，并在探索提示中明确样本验证与正式复跑属于后续独立运行。
- **产品缺陷，已修复**：首次真实链路编译候选漏写公共 typed outcomes、边和当前不支持的 `observe target`，失败审计也保留了未知调用数。现在节点 outcome 集合由协议按 kind 注入，缺边或编译失败会用同一结构化生成能力修复一次；失败时仅在全部 generation 均有完成事件时记录实际调用数。`observe scope=page` 复用 BrowserSkill 的既有只读 page 能力并输出通用标题、段落与可见链接，`merge` 可用命名 binding 组装动态对象。
- **产品缺陷，已修复**：通用参数键曾只允许全小写，合法的 `durationMs`、`tabId` 无法进入协议；键合同现允许首字母小写的 camelCase，同时继续拒绝原型链路径。
- **产品缺陷，已修复**：计划执行器会把 `each` 步骤的多次单项输出聚合为数组，但静态 binding 校验曾仍把它当成单项合同，导致下游逐项调用和计划总输出只在运行末尾失败。现在静态运行形状按聚合数组计算；新计划保存、授权和执行前均检查 binding 与输入输出合同，旧不兼容计划保持可读但不可执行。
- **产品缺陷，已修复**：运行消费曾只计算产品级 browser 节点，遗漏 adapter 内部的 `tab_list`、fresh observe 和页面读取等真实 BrowserSkill 命令；现在每条底层命令进入同一预算与审计。任务、job、run 和 execution 投影统一按时间排序，Workbench 不再把节点数显示为浏览器调用数。
- **测试夹具缺陷，已修复**：旧 BrowserService 测试仍期待从“请先登录”文字自动触发人工状态；现行合同要求显式 human 节点，测试已改为验证 typed `request_help`、状态持久化和 cleanup。API 探索夹具补齐可授权 origin；loop 回环和父子恢复夹具分别修正不可达出口与过小预算后再验证真实不变量。
- **依赖基线失败，未在本仓修复**：官方 registry 的当前 `npm audit` 报告 1 high、3 moderate，均沿本地 AI Connect 0.3.2 发布包精确依赖的 Hono 4.12.12 进入，且消费者侧 `fixAvailable=false`。这不是 LangGraph 变更引入的问题；共享包需由 producer 升级并重新发布，B-A-T 未用本地 override 篡改发布依赖。
- **环境阻塞**：本轮没有离线环境阻塞。
- **未验证**：简短自然语言到计划/链路的产品闭环、目标扩展形态、第二类非数据采集真实任务、已有登录态、验证码/人工返回及页面漂移仍无现场证据；受控公开页面链路的双输入和普通复跑已有本节证据。
