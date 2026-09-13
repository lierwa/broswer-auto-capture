# 功能开发统一入口

更新：2026-09-13。

## 1. 当前基线

B-A-T 的当前基线是 [自然语言浏览器任务链路架构](TASK_CHAIN_ARCHITECTURE.md)：自然语言需求先形成版本化语义计划；每个步骤由 AI Connect 选定的用户模型通过 Pi AgentSession 和 BrowserSkill 完成一次代表任务；B-A-T 记录真实工具轨迹与字段来源，再确定性编译成参数化链路；样本和换输入验证后由普通执行器复跑。网站、业务实体、字段和数量不得成为平台源码中的固定类型或 special case。

M1–M6 的通用 IR/runtime 收敛与旧代码清除已经完成。M7 的 example.com 链只证明既有运行、binding、浏览器适配、审计和复跑管道；它的长需求及“API 手写模型命令循环 + 模型生成完整图”不再是 authoring 方向。新的 P1–P5 已实现并通过所属包聚焦验证；非采集任务已取得真实 E4 与正式复跑证据，京东详情的 P6 现场验收仍以 [PROGRESS](PROGRESS.md) 首节为准。唯一接续入口是[首次探索与链路编译重构实施说明](TASK_CHAIN_AUTHORING_REDESIGN.md)。

## 2. 文档职责与阅读顺序

| 文档 | 唯一职责 | 开发时如何使用 |
| --- | --- | --- |
| [README](../../README.md) | 产品目标、当前能力和启动入口 | 不把验收示例当作平台默认范围 |
| [TASK_CHAIN_ARCHITECTURE](TASK_CHAIN_ARCHITECTURE.md) | 通用 IR、节点、数据边界、复跑和分层职责 | 修改 contracts、runtime、browser adapter、编译或执行前先核对 |
| [ADR 0002](../adr/0002-pi-agent-exploration-trace-compilation.md) | Pi AgentSession 探索和真实轨迹编译的已确认决策 | 不恢复手写 Agent 循环或全量 IR 生成 |
| [TASK_CHAIN_AUTHORING_REDESIGN](TASK_CHAIN_AUTHORING_REDESIGN.md) | P1–P6 范围、算法、验收和新会话开工指令 | 当前开发唯一接续入口 |
| [TASK_CHAIN_AUTHORING_CLEANUP](TASK_CHAIN_AUTHORING_CLEANUP.md) | 每阶段保留、改写、删除和零垃圾门 | 替代路径验证后当阶段删除旧实现 |
| [TASK_CHAIN_CODE_DISPOSITION](TASK_CHAIN_CODE_DISPOSITION.md) | M1–M7 通用 IR 收敛的历史处置 | 只查历史依据，不指导新 authoring |
| [TASK_CHAIN_M2_M7_IMPLEMENTATION](TASK_CHAIN_M2_M7_IMPLEMENTATION.md) | 上一版实现与验证分类 | 只查历史证据，不从中恢复已否决路径 |
| [PRODUCT_FLOW](PRODUCT_FLOW.md) | 九阶段输入、产物、版本和授权门 | 按业务阶段推进，不按 UI 页签顺序猜执行 |
| [WORKBENCH_LAYOUT](WORKBENCH_LAYOUT.md) | 信息层级和承载方式 | 只决定事实放在哪里，不新增业务事实 |
| [UI_STATES](UI_STATES.md) | 各状态的主层反馈与恢复动作 | 每项功能同步覆盖等待、失败、取消和恢复 |
| [INTERVIEW_UI](INTERVIEW_UI.md) | 访谈机制和通用需求交接 | 保留持续对话与版本语义，不恢复旧 brief 分叉 |
| [ROADMAP](ROADMAP.md) | 当前出口和历史实施顺序 | 只按顶部“当前执行路线”接续 |
| [RESEARCH](RESEARCH.md) | 历史选型和现场证据 | 历史候选不覆盖当前实现 |
| [PROGRESS](PROGRESS.md) | 已通过、失败、阻塞和未测事实 | 只有实际证据支持验收结论 |

根 [AGENTS.md](../../AGENTS.md) 约束工程与验证，TASK_CHAIN_ARCHITECTURE 约束链路公共边界。代码、数据库和运行事实优先于旧截图、历史计划与样例。

## 3. 页面与真实能力

| 工作区 | 当前能力 | 仍需现场验收 |
| --- | --- | --- |
| 任务列表 | 多任务创建、搜索、切换、重命名、归档恢复和 SQLite 持久化 | 实际浏览器运行时的跨任务状态投影 |
| 需求对话 | 公共 Agent surface、私有访谈 Skill、完整 Markdown 草稿、版本确认、取消和恢复 | 新架构后的自然访谈体验 |
| 任务计划 | 通用步骤、依赖、动态合同、业务限制、代表输入、Pi 探索/验证状态和最终授权 | 京东详情来源投影与批量授权体验 |
| 任务链路 | 唯一 IR/compiler/runtime、类型化真实轨迹、确定性编译、子链、检查点、人工等待和显式 LLM | 京东详情的 sample/verification、10 型号复跑和漂移阻断 |
| 运行结果 | 独立运行、分步结果、总消耗、检查点、重跑与审计投影；非采集正式复跑已核验 | 京东普通复跑、真实产物与批量总账核对 |

## 4. 每个功能的最小交付单元

1. 明确 `taskId`、关联版本、动态输入输出和用户授权；跨包边界立即用 Zod 校验。
2. 指定事实源、版本失效条件和持久事件；模型消息与 UI 状态不代替业务记录。
3. 提供正常、等待、失败、取消、阻断和恢复界面；切换任务不能串数据。
4. 保留幂等、检查点、预算、调用审计和浏览器状态复核；普通节点不得隐式调用模型。
5. 运行覆盖真实不变量的最小所属 package 验证，并分别记录产品缺陷、测试缺陷、环境阻塞和未测项。

## 5. 清理与接续

旧 capture-only contracts/runtime/API、旧 workflow/ordinary-run 包装、XState 对照、生产结构样例、对应 tests/scripts/fixtures、旧 exports 和原型专用依赖已经删除。LangGraph `StateGraph` 保留为唯一图执行底座；历史 SQLite/JSON、用户会话和浏览器记录不做破坏性删除，旧 BrowserRecord purpose 值只保留读取兼容，新运行不会再写入。

P1–P5 的 Pi AgentSession BrowserSkill 工具会话、类型化轨迹、紧凑注解、确定性编译和产品投影已经接通并完成聚焦验证。P6 的非采集 E4 与正式复跑已完成；京东详情继续按一个代表 URL、两个不同输入和 10 型号同链复跑取得真实证据。每阶段按新清理清单删除被替代内容，不恢复旧引擎或站点专用代码。
