# 首次探索与链路编译清理清单

日期：2026-09-13
状态：P1–P6 每个阶段的强制完成门
配套实施：[首次探索与任务链路编译重构实施说明](TASK_CHAIN_AUTHORING_REDESIGN.md)

本文件保证每次开发迭代在接通替代路径并验证后，立即删除被替代实现、过时测试、冲突文档、死 export、无用依赖和空目录。清理是阶段交付的一部分，不能积压到“以后再做”。

清理不得破坏用户事实。SQLite 中已有任务、需求、计划、链路、运行、BrowserRun 和审计记录不因源码替换而删除或改写；Cookie、Profile、凭据和验证码也不进入清理脚本或 Git。旧记录需要兼容时保留最窄的只读解析边界，不能保留第二套可执行 runtime。

## 1. 总处置原则

| 处置 | 判断标准 | 阶段要求 |
| --- | --- | --- |
| 保留 | 成熟组件仍承担正式产品能力，或通用事实合同仍有效 | 复用公共 API；不复制内部实现 |
| 改写 | 责任正确，但入口或数据流需要接入新架构 | 在原正式路径收敛，不并排新建第二套路径 |
| 删除 | 已有替代路径覆盖其不变量，且正式入口、测试和文档不再引用 | 同阶段验证后立即删除 |
| 只读兼容 | 用户历史必须可查看/导出，但旧协议不能继续执行 | 仅保留版本识别和投影，不恢复旧执行器 |
| 暂缓删除 | 替代能力尚未通过对应验证 | 在进度中写明门和负责人，不能伪称已清理 |

任何库或框架只有在产品不再需要它所提供的能力时才能删除。如果能力仍需要，继续复用现有成熟组件，或经过调研换成另一成熟组件；不得用项目代码从零复刻 AgentSession、图引擎、浏览器驱动、解析器、认证、数据库或 UI 基础组件。

## 2. 必须保留的正式能力

| 产品能力 | 保留对象 | 原因 |
| --- | --- | --- |
| 用户账号、认证、模型目录与事件 | `@agent-platform/ai-connect` | 产品已接入的共享成熟能力 |
| 多轮模型工具会话 | `@agent-platform/pi-agent-session` | 首次探索应使用它，不能由 API 手写循环代替 |
| 浏览器控制、语义定位和会话 | BrowserSkill 与 `packages/browser` 的窄适配 | 浏览器能力提供者；平台不自研浏览器控制系统 |
| 唯一通用链路合同 | `packages/contracts/src/task-chain/` | 网站和业务字段只作为动态任务数据 |
| 唯一图执行路径 | LangGraph `StateGraph` 与 `packages/runtime/src/task-chain/` | 已有正式 compiler/runtime、检查点和审计 |
| 持久事实 | SQLite、Drizzle、`TaskRun`/版本仓储 | 用户可查询、恢复和审计的事实源 |
| 边界校验 | Zod | 所有跨包和持久数据入口立即校验 |
| 产品投影与基础 UI | Workbench、React Flow、Radix、共享 Agent surface | 保留成熟组件，业务层只组合任务状态 |

保留不等于冻结不动。允许为新流程扩展其公共适配面，但不能复制成另一个包或旁路。

## 3. 当前代码处置表

下表记录 P0 启动重构时的处置对象；替换、删除与实际验收状态以 PROGRESS 首节为准，不表示旧代码仍在正式入口运行。

| 现有部分 | 它现在做什么 | 最终处置 | 删除或完成门 |
| --- | --- | --- | --- |
| `apps/api/src/ai/model.ts` | 同时提供无状态结构化生成和现有 Pi adapter | 改写并扩展现有 Pi tool session 入口 | P1 多轮工具、取消、事件和错误测试通过；不得新建另一套 provider |
| `TaskRuntimeHost.explore` | 固定轮数执行“模型给一个 command/finish”的手写循环 | 删除整个手写探索职责 | P1/P2 的 Pi 工具会话和轨迹测试通过，正式调用者已迁移 |
| `explorationDecisionSchema`、`explorationDecision`、`explorationActions`、固定轮数循环及相关 prompt | 定义旧手写循环 | 删除 | 与上项同门；`rg`/CodeGraph 无正式引用 |
| 旧 `RuntimeExplorationTrace` | 只保存旧循环的命令与摘要 | 由新的类型化 authoring trace 替代后删除或迁移命名 | 新 trace 覆盖工具结果、动作后观察、业务结果、provenance、审计和终止 |
| `planCandidateSchema` 与长 `planPrompt`/repair | 让模型同时决定计划结构和技术预算 | 改为语义计划；删除技术预算生成和碰候选 repair | P3 计划合同/业务限制测试通过 |
| `chainCandidateSchema` 与长 `chainPrompt`/repair | 让模型直接生成完整 IR | 删除 | P3 注解校验和 P4 trace-to-graph 编译测试通过 |
| `materializeChain` 中为模型候选兜底的修补 | 事后修正模型节点输出和合同 | 能由确定性编译器负责的全部删除 | P4 相同证据生成稳定等价图并通过 `compileTaskChain` |
| `packages/browser/src/task-chain-adapter.ts` | 执行正式链路的浏览器/观察节点；target observe 目前拒绝 | 保留并补成熟通用读取适配 | P2 有真实能力证据及聚焦测试；不保留“合同声称支持、运行时恒拒绝”的假入口 |
| `apps/api/src/task-chain/service.ts`、`plan-executor.ts`、`repository.ts` | 编排、队列、授权、恢复和产品事实 | 保留职责并改接 E1–E4 生命周期 | P5 重启/取消/人工等待/旧记录只读测试通过 |
| `packages/contracts/src/task-chain/` | 通用 IR、值绑定、节点、计划和运行合同 | 保留 | 只允许至少两类任务都需要的通用扩展 |
| `packages/runtime/src/task-chain/` | 唯一编译与 LangGraph 执行路径 | 保留 | 不添加第二套 scheduler/runtime |
| Plan/LiveChain/Results 投影 | 展示计划、图、运行结果 | 保留并改写状态和错误文案 | P5 API/Workbench 投影测试通过 |
| 旧 authoring/chain fixtures 与“修一次再碰候选”断言 | 保护已否决路径 | 删除或改写成轨迹、注解、编译不变量 | 新测试覆盖真实风险后删除；不得同时保留两套夹具 |
| `apps/api/src/capture/`、`apps/api/src/chain/`、`apps/api/src/plan/` 空目录 | 旧文件删除后的空壳 | 删除目录 | 确认无文件、无脚本依赖后随首次清理完成 |
| 旧文档中的“当前已接通受控探索/候选编译” | 描述已否决实现 | 改成历史证据或删除 | 当前入口只指向 ADR 0002 和重构实施说明 |
| 只被删除路径使用的 exports、scripts 和依赖 | 构建遗留 | 删除 | TypeScript、package tests、lockfile 定点审阅通过 |

## 4. 不得误删

- `data/` 下的用户 SQLite、任务文件、运行历史和浏览器记录；清理代码前先确认命令不会触碰它们。
- 旧记录的 `legacy_read_only` 识别、列出和导出能力；除非另有已确认的数据迁移决策。
- AI Connect/Pi 的 vendor 制品和准确 lockfile 引用；只有正式升级或不再需要该产品能力时才变更。
- LangGraph、BrowserSkill、Zod、SQLite/Drizzle、React Flow、Radix 和共享 Agent surface。
- 与本阶段无关的未提交用户修改；禁止 reset、clean、checkout 覆盖或批量格式化。
- 未经确认的真实运行记录，即使它们失败或来自旧路径；失败记录也是审计事实。

## 5. 每个阶段必须执行的清理步骤

每个 P1–P6 阶段完成实现和最小行为验证后，按顺序执行：

1. 列出本阶段替代的符号、文件、测试、文档、exports、scripts 和依赖。
2. 用 CodeGraph 检查被替代符号的调用者和影响；用 `rg` 查字面 prompt、错误码、旧路径和文档陈述。
3. 删除已经没有正式调用者的旧实现。若仍有调用者，迁移调用者；不得保留 deprecated 可执行旁路。
4. 删除只验证旧实现细节的测试和 fixture；先保留仍保护通用不变量的测试，再改到新正式入口。
5. 删除无引用 export、package script、依赖和空目录；检查 lockfile 只反映预期依赖变化。
6. 更新 `README.md`、架构基准、ROADMAP 和 PROGRESS 中的当前状态；历史记录必须明确标为历史，不能与当前入口冲突。
7. 运行本阶段所属 package 的最小 typecheck/聚焦测试，再执行 `git diff --check`。
8. 审阅明确路径的 `git diff`，把产品缺陷、测试缺陷、基线失败、环境阻塞和未测项分开记录。
9. 确认本阶段启动的 API、Workbench、BrowserSkill 控制会话和测试子进程均已关闭。

如果替代路径尚未通过，旧实现可以暂留一个阶段，但必须在 `PROGRESS.md` 写明具体删除门。不得在正式入口中同时启用新旧路径，也不得用自动 fallback 把流量送回旧路径。

## 6. 分阶段删除门

### P1 完成时

- 删除旧 provider 失败后的自动重试或自动换模型逻辑。
- Pi AgentSession 工具入口成为唯一探索模型会话入口。
- 旧手写循环如果 P2 尚需其 BrowserSkill 桥，可暂时断开正式入口并标注删除门；不能继续被 service 调用。

### P2 完成时

- 删除 `TaskRuntimeHost.explore` 中的 `command|finish` 决策循环、固定轮数、旧 prompt 和旧 trace。
- 删除只支持旧 command loop 的测试数据和辅助函数。
- `observe target` 要么有经验证的正式适配，要么从该合同版本中移除；不能留下恒定 unsupported 的假能力。

### P3 完成时

- 删除 `planCandidateSchema` 中由模型提供的技术预算。
- 删除 `chainCandidateSchema`、完整 IR prompt、repair prompt 和一次失败后再次碰候选的路径。
- 删除模型可自定节点 ID、边、检查点、技术预算和未见浏览器动作的 schema 字段。

### P4 完成时

- 删除 `materializeChain` 中仅用于补救全量模型候选的逻辑。
- 删除手写生产样例图；保留少量聚焦 fixture 只能用于编译器不变量，不能成为产品入口。
- 确认 runtime 仍只执行现有 `TaskChain`，没有 trace executor 或 annotation executor。

### P5 完成时

- 删除旧 authoring job 状态、模糊预算文案和不再使用的 UI 分支。
- 删除 service/repository 中只服务旧候选重试的字段与方法；旧 SQLite 行通过版本化只读适配保留。
- 删除失效 API exports、客户端投影和连接测试。

### P6 完成时

- 删除空的旧源码目录、过时真实运行脚本、被新验收替代的 example 专用夹具和冲突设计文档。
- 删除只被上述路径使用的依赖并更新 lockfile；不触碰仍由正式能力使用的成熟库。
- 全仓搜索旧符号、旧 prompt、固定轮数、模糊“额度耗尽”和已否决当前状态陈述，结果必须为零或只出现在明确标注的历史记录中。
- 确认没有活动 BrowserSkill 控制会话和由本轮启动的本地服务。

## 7. 文档生命周期

文档按三类管理：

| 类别 | 规则 |
| --- | --- |
| 当前规范 | 架构基准、已接受 ADR、当前重构实施说明和当前清理清单必须互相一致 |
| 当前事实 | PROGRESS 首节只写已验证事实、阻塞和未测项；ROADMAP 首节只写下一动作 |
| 历史证据 | 旧阶段记录可以保留，但标题和开头必须明确“历史”，且不能被 README 或新会话入口作为当前方案引用 |

当一份实施文档完成后，其中仍有效的长期决策迁入 ADR/架构基准，当前事实迁入 PROGRESS。若剩余内容只重复或描述已删除代码，则删除该文档；不得无限新增“最终版”“新版”“v2”而保留多个互相冲突的当前方案。

## 8. 清理证据模板

每阶段在 PROGRESS 记录：

```text
Cleanup Evidence:
- replaced capability:
- deleted symbols/files/tests/docs:
- kept mature components:
- legacy data treatment:
- dead references checked with:
- dependency/lockfile result:
- services and browser sessions closed:
- validation passed:
- baseline failures:
- environment blockers:
- untested:
```

## 9. 最终零垃圾门

P6 只有满足以下条件才能关闭：

1. 正式调用图中只有一个探索 AgentSession 入口、一个 `TaskChain` IR 和一个 LangGraph runtime。
2. 仓库中没有旧手写模型命令循环、完整 IR 生成/repair 路径或自动 provider fallback。
3. 没有平台级京东、商品、评论、剧集或表单 special case。
4. 没有用自研代码替代仍需要的成熟库能力。
5. 没有无引用源码、测试、fixture、export、script、依赖或空目录。
6. 当前文档互相一致，历史文档不会被误当作接续指令。
7. 用户历史和登录秘密均未因清理受损。
8. 最小验证、真实验收和未测范围均有可核对记录。
