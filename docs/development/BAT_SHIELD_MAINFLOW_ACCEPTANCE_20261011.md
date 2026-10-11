# B-A-T 新需求到盾检测：真实主流程首败记录

> 后续用户已授权仅修纠错机制并续测，结果见[纠错与主流程续测](INTERVIEW_REPAIR_AND_MAINFLOW_20261011.md)。下方保留修复前首败事实，不代表当前停留阶段。

2026-10-11，北京时间。checkout：`master@5ac7f8f1748955779446937f8491a01dc6be054f`。

用户明确限定本轮只运行现有系统，主流程问题记录原因，未经新的授权不得修改产品代码。本轮从工作台新建需求并发送真实模型请求，首轮需求对话失败，尚未进入浏览器探索；**本次盾检测与复跑均未测，不能据此判断 B-A-T 能否通过盾。**

## 测试任务及入口

- 任务：`6088126d-5e8d-4650-9ae6-3a223a404c60`。
- 轮次：`3d0c55a8-125c-4cdc-840f-e7aaaee5d460`。
- 操作入口：正式 Workbench `http://127.0.0.1:4173/`；新建与发送均经可见工作区的原按钮执行，HTTP/SQLite只用于读取证据。
- 需求：访问 `https://localhost:4185/measurement/check?mode=interactive`，按页面要求完成中英文输入、滚动、提交，并如实返回当次结论、项目状态、异常原因和报告链接；每次从入口开始新的检测。
- 沿用产品已保存配置：`openai-codex / gpt-6-luna / medium`；浏览器设置 `daily`、revision 55。未切换模型、浏览器模式或修改凭据。
- 操作工作台的验收客户端为独立 headless Chrome；它仅访问 B-A-T 工作台，从未访问盾，不算产品检测浏览器。产品浏览器未启动。

## 实际结果

| 阶段 | 结果 | 证据 |
| --- | --- | --- |
| 环境准备 | B-A-T健康、盾五服务ready；按原入口刷新已过期Tor名单 | shield-baseline.json |
| 新建需求与发送 | 已完成 | task.json、interview-terminal.json |
| 首轮需求对话 | failed；无已接受需求草稿 | failure-workspace.png、interview-terminal.json |
| 产品内置格式修复 | 自动执行一次，仍失败；未点击人工重试 | model-output-evidence.json |
| 确认需求、准备、编译、验证、发布 | 未进入 | chain-state.json、persisted-counts.json |
| 正式运行、再次运行、盾报告 | 未测 | 同任务execution/release/browserRun均为0 |

轮次开始于17:30:21，失败终态17:31:19，约58.4秒。实际模型调用2次：首调用 `201f3002-2733-4c2a-aaad-5a881e4d15d0`，产品内置修复 `adf1b3bf-8ca8-40c0-a52a-d0d49877cdb8`。两次均有 generation.completed；报告用量分别11,414与9,323 tokens，合计20,737。此次不是模型网络调用失败，也不是盾拦截。

## 已确认原因

持久化 `failureCode` 与 `authoringRepair.reason` 均为 `preparation_draft_browser_delivery_required`。

现有[准备草案解析器](../../apps/api/src/interview/preparation-draft.ts#L84)要求“结果与完成”章节有且只有一条独立标记：`- 页面交付：保留现场` 或 `- 页面交付：无需保留`。产品[访谈指令](../../.agents/skills/interview-browser-task/SKILL.md#L104)与[协议示例](../../apps/api/src/interview/protocol.ts#L50)已经给出此格式。

实际首输出只在段落末写“页面交付无需保留。”；内置修复只改为段落中的“页面交付：无需保留。”。两份均没有要求的独立列表行，所以相同准入条件均拒绝。现有[单次修复流程](../../apps/api/src/interview/authoring-repair.ts#L31)已经收到该错误码，但没有得到满足契约的输出。

为核实原因，仅用现有解析器读取两份**未修改的持久化模型输出**，两次均复现同一错误码，精确标记行数量均为0，见 diagnosis.json。没有补写输出、改验证条件或再次调用模型。事实可确定为模型草案未遵守既有格式、内置修复无效；没有证据将其归因于盾或浏览器。

另一个可观察问题是错误提示不具体：[failureReason](../../apps/api/src/interview/coordinator.ts#L40)没有为该 preparation 错误提供业务文案，界面落到“本轮未完成，结果未提交。请重试。”。具体错误码仍在持久化消息中，未丢失。此项同样只记录，未修复。

## 持久化和资源结算

同任务 `taskContracts`、`taskAuthoringJobs`、`taskExecutions`、`taskReleases`、`browserRuns` 数量均为0；chain快照中的requirement/draft/release/execution/activity均为null。失败对话和两次模型审计保留在原数据库，未删除任务、归档或重写首败。

本次唯一验收Chrome主进程PID 25464由既有Browser.close/finally生命周期关闭，exitCode=0。核验精确Profile路径在本次证据目录内、无重解析点、匹配进程0后，永久删除 `work/bat-shield-mainflow-20261011/workbench-chrome`，见ui-cleanup.json与profile-cleanup.json。未创建产品浏览器Profile，未操作个人浏览器。

盾原名单在开始时过期，已沿原stop→refresh-source-data→start维护：新源发布时间为2026-10-11 16:00，有效期至2026-10-12 16:00，1175个地址；未改规则、阈值、有效期算法或检测代码。B-A-T和盾服务保留运行供后续查看。

本轮只变更验收记录文档和忽略目录内证据，未修改产品源码/提示词/配置，未提交、推送、创建worktree、访问京东或关机。开发侧CJS诊断加载不支持依赖的ESM export，发生在只读诊断导入前；随后用项目原`node --import tsx --input-type=module`入口完成原输出复核，该工具加载问题与上述真实产品首败分别记录。

## 证据入口

全部本轮证据位于 [work/bat-shield-mainflow-20261011](../../work/bat-shield-mainflow-20261011/)。主要文件：[失败界面](../../work/bat-shield-mainflow-20261011/failure-workspace.png)、[终态](../../work/bat-shield-mainflow-20261011/interview-terminal.json)、[模型原输出](../../work/bat-shield-mainflow-20261011/model-output-evidence.json)、[只读原因复核](../../work/bat-shield-mainflow-20261011/diagnosis.json)、[持久化计数](../../work/bat-shield-mainflow-20261011/persisted-counts.json)、[清理回执](../../work/bat-shield-mainflow-20261011/profile-cleanup.json)。

后续依赖新的用户指令；本轮没有修复、绕过需求对话、复用旧链代跑或无变化重复请求。剩余准备及盾验收全部保持未测。
