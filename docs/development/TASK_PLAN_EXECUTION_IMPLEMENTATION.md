# 任务计划、人工等待与任务链路实施记录

日期：2026-09-12
状态：历史抓取切片实施记录；通用任务链路迁移前的现状证据
范围：`browser-auto-tool` 当前 checkout；相邻项目仅作只读机制参考。

> 当前架构解释以 [通用浏览器任务链路架构](TASK_CHAIN_ARCHITECTURE.md) 为准，逐文件迁移与删除条件见 [通用任务链路代码收敛实施清单](TASK_CHAIN_CODE_DISPOSITION.md)。本文记录已经发生的抓取切片实现、运行证据和失败边界；其中 `enumerate/collect/derive`、URL/字段/行和 capture 节点只能描述当时切片，不再定义平台公共合同。下文 M1–M4 的“已完成”只表示该历史切片曾接通，不表示通用浏览器任务链路已经完成。

## 1. 目标与验收结果

本轮把需求草稿之后的正式产品链路落成可追踪、可恢复的实现：

1. 用户明确发起任务计划生成后，Planning Run 在同一 `PlanRecord` 内完成来源入口、代表页面、字段、枚举方式、访问条件和覆盖缺口核验。
2. 系统先复用 BrowserSkill Profile 核验任务所需的真实来源能力；已有登录态可用时由当前 observation 自动建立访问前置绑定，不请求人工。只有真实登录、验证码、确认或权限阻断才产生 typed `request_help`。
3. 人工处理完成后，`Done` 只交还控制权；系统必须重新观察当前页面，以实际字段、枚举或入口能力建立认证证据后才继续同一计划或同一执行步骤。协助超时或暂不可用只形成可恢复等待点，不自动重试。
4. 任务计划明确每一步的目标、来源、依赖、输入、输出、预算、终止条件和完成标准，但不把未实际运行的点击路径伪造成任务链路。
5. 用户确认计划并启动后，系统逐步骤探索、编译、换输入验证并保存 `ChainRecord`；随后按已验证链路执行授权范围。
6. 任务链路中的每个节点展示稳定的节点类型、具体 `kind` 和运行状态。

真实验收场景：已登录京东 Profile 直接完成来源访问核验，不出现人工等待；计划可确认启动；执行由系统队列自行形成带节点类型标注的真实链路。另以聚焦用例保护真实登录阻断、人工返回复核和恢复同一计划。

## 2. 领域分层与事实源

| 事实 | 唯一权威来源 | 说明 |
| --- | --- | --- |
| 已确认需求 | ProductStore 的需求草稿与确认记录 | 决定目标、范围和完成标准 |
| 任务计划与来源证据 | `PlanRecord` | 保存 Planning Run、来源观察、访问前置绑定、待恢复候选、步骤、预算、缺口和 digest；认证绑定只能引用已采纳实际来源 observation |
| 浏览器生命周期与人工等待 | `BrowserRecord` | 保存 BrowserSkill run 以及当前 waitpoint；不保存凭据或敏感页面正文 |
| 授权执行状态 | `ExecutionRecord` | 绑定计划版本/digest、预算、步骤进度和恢复授权 |
| 可复用动作图 | `ChainRecord` | 保存实际探索、编译和验证后的节点、连线、输入与证据 |

计划字段来源除页面 `observed` 和已确认规则 `derived` 外，`recorded_at` 表示由执行器在提交当前输入结果时写入的 ISO 时间。该模式不绑定页面来源，也不依赖字段名称；模型和页面均不能提供其值。

`domain-analysis` 的机制参考是“Planning/计划确认”和“Source Run/执行记录”分离，并由持久事实驱动后续运行。本项目保持自己的 SQLite、BrowserSkill 适配器和 ActionGraph，不复制相邻项目实现。

## 3. 产品状态机

### 3.1 任务计划

```text
assessing
  -> source_evidence
      -> waiting_human
          -> source_evidence    人工完成并 fresh observe
          -> manual_required    协助超时/禁用，可由用户恢复同一 PlanRecord
          -> cancelled          用户拒绝或停止
  -> drafting
  -> complete / ready
```

计划阶段解决的是任务级路线：实际来源、入口、访问前置条件、每一步输入输出和完成条件。低层浏览器动作图必须等该步骤真实运行后才能形成。

### 3.2 确认计划并启动

一次确认操作必须原子地：

1. 校验当前 `PlanRecord`、requirement revision、evidence digest 和 plan digest。
2. 保存绑定该计划版本的执行授权与预算。
3. 创建唯一 `ExecutionRecord(status=queued)`。
4. 由单浏览器 worker 领取，从第一个未完成步骤开始探索和验证。

确认 HTTP 请求本身不伪造浏览器成功，也不直接生成静态示意链路。

### 3.3 人工等待

```text
automation_running
  -> waiting_human
  -> BrowserSkill request-help（同 session/tab）
      -> continued/completed -> fresh observe -> automation_running
      -> timed_out/disabled  -> manual_required（保留可恢复事实）
      -> cancelled           -> cancelled
```

规则：

- 登录、验证码和确认只由用户在 Agent Window 内处理；程序不得读取或记录凭据、Cookie、Token、验证码和敏感页面正文。
- `accessRequirements` 是待核验的访问能力，不是人工介入指令。系统必须先使用既有 Profile 访问代表来源；实际能力可用则自动建立绑定。
- `BrowserSession` 不解释页面文案，也不维护登录、验证码或站点关键词；它只执行上层已校验的 typed `request_help`。计划外 origin 跳转作为访问边界处理，不伪装成页面语义判断。
- `Done` 只结束人工接管。调用方随后执行 fresh page；只有已采纳页面提供当前访问前置所需字段、枚举或入口证据时，Plan Evidence 才写 `accessBindings`。
- `request-help` 是人工等待，不计浏览器命令数和自动化活动时间。
- `timed_out`/`disabled` 是等待阻塞，不是重试信号。只有用户明确点击恢复，才重新进入同一 Plan/Execution。
- 恢复可重新创建 BrowserSkill session，但必须复用 BrowserSkill Profile，并先回到保存的公共入口核验当前页面；不得重新创建计划或执行记录。
- 取消、服务关闭及不可恢复错误仍进入 `finally` 回收 BrowserSkill session。

## 4. 公共契约

`BrowserRecord.waitpoint` 保存非敏感等待事实：

```ts
type HumanWaitpoint = {
  id: string
  owner: "plan_evidence" | "execution_step"
  ownerId: string
  stepId: string | null
  reason: "login" | "captcha" | "confirmation" | "access"
  status: "waiting" | "completed" | "cancelled" | "timed_out" | "disabled" | "failed"
  prompt: string
  origin: string | null
  requestedAt: string
  resolvedAt: string | null
}
```

来源访问属性与等待生命周期分离：

- `public`：无需认证。
- `authenticated`：声明的访问能力已经由已采纳实际来源 observation 核验；可来自既有 Profile，也可来自人工处理后的 fresh observe。
- `unavailable`：人工处理后仍不可用。

`manual_required` 只用于 Plan/Execution 的可恢复终态兼容；新运行中的即时状态由 `BrowserRecord.waitpoint` 投影。

## 5. 任务链路节点类型

ActionGraph 的 `node.kind` 仍是协议事实源。共享投影把具体 kind 映射为展示类型：

| 类型 | kind |
| --- | --- |
| `browser_action` | `navigate`、`read`、`click`、`fill`、`press`、`wait` |
| `data` | `extract_links`、`extract_fields`、`derive_missing` |
| `condition` | `branch`、`branch_target`、`branch_page_changed` |
| `loop` | `loop` |
| `checkpoint` | `checkpoint` |
| `model` | `llm` |
| `terminal` | `finish`、`stop` |

UI 节点统一展示“节点类型 · 具体 kind · 运行状态”。不得由各页面分别维护第二套映射。

## 6. 补丁清算

### 删除

- `apps/api/src/plan/entries.ts`：删除把来源发现整体推迟到授权执行的入口适配。
- 删除仅用于允许“无来源证据计划可启动”的校验和测试断言。
- SQLite 读取边界一次性移除错误版本已写入 `proposal.steps[].entry` 的字段，为该旧计划补入来源核验阻塞项并清除旧 digest；保留其余任务历史并按正式契约重写记录。

### 恢复并重写

- 恢复 `PlanService` 的 `assessing -> source_evidence -> drafting`。
- 恢复计划证据对实际来源、字段、枚举和覆盖的约束。
- 重写 `manual_required`：从终止/来源受限改为仅由真实阻断触发的 BrowserSkill 人工等待与可恢复状态。
- 恢复 Chain/Executor 只从计划已核验来源或上游结果开始；不在执行期重新解释自然搜索入口。
- 恢复文档中 Planning Run 按需浏览器取证的基线，并统一“任务计划 / 任务链路”术语。

### 保留并隔离

- 保留 `AGENTS.md` 的模型选择和最小验证规则。
- 保留 ai-connect 同步产生的 package、lock、release 和 vendor tarball。
- Browser transport 的进程收敛修复单独保留；它解决命令进程退出后 Promise 不收敛，不替代人工等待状态机。

## 7. Baseline Impact

```text
Baseline Impact:
- touched layers: contracts / browser package / API plan / execution / chain / Workbench / docs
- owning fact source: PlanRecord / BrowserRecord / ExecutionRecord / ChainRecord
- public interface changed: yes
- new protocol/adapter/fallback: typed human waitpoint and BrowserSkill request-help lifecycle
- compatibility or legacy path changed: yes, legacy manual_required remains readable and resumable
- baseline update required: yes, document waitpoint and node projection without changing layer ownership
- architecture tests to run: focused browser waitpoint and Plan-to-Chain lifecycle only
```

## 8. 实施阶段与记录

| 阶段 | 状态 | 产物 | 最小验证 |
| --- | --- | --- | --- |
| M0 架构与清算记录 | 完成 | 本文档 | 文档与当前契约定点核对 |
| M1 恢复任务计划来源取证 | 完成 | Plan 服务、契约、校验、文档 | Plan 人工登录恢复聚焦用例通过 |
| M2 BrowserSkill 人工等待 | 完成 | waitpoint、`request-help`、fresh observe、恢复 | Browser waitpoint 聚焦用例通过 |
| M3 执行步骤人工恢复 | 完成 | Execution/Chain 同步骤恢复与预算排除 | Browser 行为用例 + API 类型检查通过 |
| M4 节点类型投影 | 完成 | 共享类型映射与 Workbench 展示 | contracts / Workbench 类型检查通过 |
| M5 真实浏览器验收 | 进行中 | Profile 自动复用、计划完成、确认启动、任务链路与运行结果证据 | 产品 API/队列自行运行；访问恢复后从已保存 s2 继续，不由 Codex 直接操作 BrowserSkill 推进 |

每完成一阶段，在本表和下方日志更新实际文件、验证结果、阻塞和未测项。不得以测试数量替代真实流程证据。

## 9. 开发日志

### 2026-09-12 · M0

- 对照 `domain-analysis` 的 Planning/Source Run 分层、本项目提交基线、当前 dirty diff 和 BrowserSkill `request-help` 约束。
- 确认当前偏差是把来源取证推迟到授权后，以及把人工登录处理成短超时终止；实施从清算这些偏差开始。
- 本阶段只新增开发记录，没有运行测试或浏览器。

### 2026-09-12 · M1–M2

- `PlanRecord` 恢复真实 Planning Run：来源搜索、代表页观察、字段/枚举/覆盖核验先于计划草稿；无已核验来源时计划不可启动。
- `BrowserRecord` 增加 typed waitpoint；BrowserSkill 在同一 session/tab 调用 `request-help`，人工完成后 fresh observe。
- 登录、验证码、人工确认和访问闸门不再使用自动重试；`timed_out` / `disabled` 保存为可恢复终态。
- `PlanRecord.pendingCandidateId` 保存登录前正在核验的候选。用户显式恢复后复用同一计划记录并直接重新核验该入口，不重新搜索。
- 存储兼容迁移会移除旧记录的步骤级 `entry`，避免重新引入已清算的公共字段，同时保证现有任务数据可启动。
- 后台计划任务增加失败终态保护，未处理异常不会留下永久 `generating` 状态。
- 定向验证：
  - `访问闸门在同会话请求人工，等待不计预算，完成后重新观察；超时不自动重试`：通过。
  - `人工登录暂停同一任务计划，显式恢复后继续而不自动重试`：通过。

### 2026-09-12 · M3–M4

- Execution 恢复沿用同一执行记录、步骤进度和已核验登录 origin；人工等待时间从步骤活动预算中扣除。
- Chain 探索和批量执行只从计划已核验来源或上游结构化结果开始，任务计划阶段不生成虚构动作链路。
- contracts 提供唯一的 ActionGraph 节点类型投影；Workbench 同时展示节点类型、具体 kind 和运行状态。
- 来源详情展示 `public` / `authenticated` / `unavailable` 访问条件；计划和执行等待点共用 BrowserStatus。
- 定点类型检查：`@browser-capture/contracts`、`@browser-capture/api`、`@browser-capture/workbench` 均通过。
- 按最小验证约束，没有运行根目录或整包测试套件。

### M5 验收边界

- 真实京东流程需要在当前开发服务加载本次代码后发起一次新 Planning Run。
- 若出现登录页，用户在 BrowserSkill Agent Window 完成登录；系统应在原等待点继续，生成可确认的任务计划。
- “确认计划并启动”后，以持久化 `ExecutionRecord` 和带节点类型的 `ChainRecord` 作为验收证据；在此之前不宣称真实浏览器验收完成。

### 2026-09-12 · 启动与现有数据迁移

- 使用现有 SQLite 数据副本验证兼容迁移：旧步骤 `entry` 被移除，旧计划改为来源待核验的阻塞状态，初始化通过。
- 当前 checkout 的开发服务已重新启动：Workbench `4173`、API `4175` 均返回 HTTP 200。
- 当前“京东热门冰箱品牌与型号数据”的最新旧计划已迁移为 `blocked` 且无可执行 digest；旧授权运行均不再排队，允许用户发起新的 Planning Run。
- 尚未替用户发起新的真实计划或模型调用；M5 需要用户在出现请求时完成京东登录。

### 2026-09-12 · M5 决策边界校正

- 第一次真实 Planning Run 进入搜索结果页时，基础设施层的页面词表先于计划模型触发了人工等待。该运行已取消，对应 BrowserSkill session 已回收。
- 页面内容是否阻塞任务改由读取当前真实 observation 的 Plan/Chain 模型作 typed `request_help` 决策；BrowserSession 仅执行等待、fresh observe、预算扣除和 finally 回收。
- 搜索页中的普通账户入口继续作为不可信页面内容交给计划模型，不会由 BrowserSession 自动升级为人工认证。
- 计划的候选页和搜索页分别保存可恢复位置；人工等待结束后继续同一 PlanRecord，不重新建立任务计划。
- BrowserSkill 官方枚举确认目标 session 已不存在时，cleanup 关闭所属 owner，避免已回收会话继续阻塞下一次 Planning Run。
- 真实来源证据已完成而计划结构校验失败时，后续版本复用同 requirement revision 的 evidence digest，只重新生成计划结构；字段证据必须属于承担该字段的步骤来源集合，宿主继续拒绝跨步骤引用。
- 运行时间类字段使用 `recorded_at` 绑定执行器事实源；任务链路不为其编造页面提取节点，结果提交时统一写入并参与字段覆盖检查。

### 2026-09-12 · M5 认证事实源与系统闭环

- 已登录 Profile 与 `PlanRecord.accessBindings` 的职责重新归一：Profile 提供浏览器会话状态，Planning Run 必须访问任务所需的实际来源，以已采纳 observation 记录访问能力；存在 `accessRequirements` 不再自动触发人工请求。
- `accessRequirementIndex` 在非人工决策中只允许绑定 `adopted + authenticated` 的实际来源，搜索页、无字段/枚举证据和不可用页面均由宿主拒绝。
- BrowserSession 不再维护由按钮点击产生的 `authenticatedOrigins`；Plan 恢复和 Execution 恢复也不再把旧 waitpoint origin 当成认证成功。
- `Done` 仅返回控制权。Plan Evidence 在 fresh page 后重新进行结构化判断；页面仍受限时形成可查看但不可启动的阻塞计划，不重复同一人工请求，也不产生 access binding。
- 人工窗口超时后的 Workbench 文案明确显示窗口已经结束；恢复仍进入同一 PlanRecord/ExecutionRecord 并重新核验原来源。
- 最小验证：contracts/browser/API 类型检查通过；已有 Profile 自动绑定且零人工请求、真实阻断后同计划恢复两条 API 用例通过；人工返回后的 fresh observe Browser 用例通过；受限页面不能因 Done 建立认证证据用例通过。
- 真实正式入口验收尚未完成。在系统自行完成“计划生成 → 用户确认启动 → 队列执行 → ChainRecord/结果终态”之前，本阶段不得标记完成。

### 2026-09-12 · M5 访问失败熔断与当前运行证据

- 产品自身生成并校验任务计划 v33，正式授权执行 `f771ce02-6a22-4c3a-bb5a-3755d7258648`；s1 链路 `addf2abc-b3f4-47b2-ab70-f1c4a6232bb1` 已独立验证并保存 10 个真实商品详情入口。
- s2 首个详情来源连续出现三次约 31 秒的 `command_failed`，旧重探策略随后又进入目标修订，实际页面出现站点安全风险提示。运行已经释放浏览器，s1 结果、s2 当前输入和 s3 剩余范围均保留。
- 浏览器传输失败不再进入同轮重探或批量自动修链；第一次失败即投影为可恢复 `drift_paused`。即使当前步骤尚未形成 verified chain，用户也能从系统恢复同一 ExecutionRecord 和剩余预算。语义目标缺失或歧义只刷新当前页面供模型判断，不重新导航入口；fresh page 确认登录、验证码或访问限制时仍走现有 typed `request_help`。
- 同一失败原因下模型第二次原样提交相同 graph/sample/verification 时按结构指纹停止，不继续消耗该步骤剩余模型预算。
- 最小验证：`@browser-capture/api` 类型检查通过；“导航命令失败立即暂停且不自动重试，页面恢复后继续同一运行”“后续步骤换输入失败保留前置已验证版本和原样本”两条定向回归通过。未运行根级或整包测试。
- 当前站点访问仍处于风控页面，未恢复本次真实运行；M5 保持进行中，不把暂停状态报告为任务完成。
