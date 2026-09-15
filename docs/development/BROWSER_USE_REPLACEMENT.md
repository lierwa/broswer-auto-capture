# browser-use / workflow-use 替换：阶段 0 决策与阶段门

日期：2026-09-15。依据：修订交接第三轮终审通过版；初版不作为依据。
本任务已获阶段 0 后继续实施的授权；在现有 master 工作，不创建分支/worktree，不推送、不改相邻项目。

## 阶段 0 已核验

- checkout 为当前仓库；HEAD、本地 origin/master、实时远端 master 均为 `c13aa641031d4f44ec3d9b32aeea2b3dcd65268f`，ahead/behind `0 0`。
- 初始 dirty 为 20 个 tracked 修改和 1 个 untracked 文件，没有 staged 修改。
- 已读 AGENTS、TASK_CHAIN_ARCHITECTURE、ADR 0002、STABLE_TASK_CHAIN_ITERATION，以及修订交接和三轮审查。
- 初始逐文件 SHA-256、dirty patch 和未跟踪转换器副本保存在忽略的 `work/upstream-replacement-2026-09-15/`，用于保护既有改动；不是新分支或 worktree。
- 下表是最终处置决定；执行时点遵守阶段门。阶段 1–5 未通过前保留现有代码原字节，不把旧路径声称为新路径或已验收能力。替换接线和删除发生在阶段 6。

## 逐文件处置

| 文件 | 处置及原因 |
| --- | --- |
| apps/api/src/task-chain/authoring-prompts.ts | 重写：保留业务计划 prompt、候选 schema 纠错；删除 discovery 页面策略、首项 batch、target 形状和 annotation prompt。 |
| apps/api/src/task-chain/authoring-recovery.ts | 重写：保留版本/输入一致性目的；删除自定义 PreexecutionArtifact 复用准入，按分级上游 artifact 验证。 |
| apps/api/src/task-chain/authoring.ts | 重写：保留计划、绑定、保存和状态；删除 preexecutionGoal、旧 trace/compiler 调用和首项成功技巧；传完整 task。 |
| apps/api/src/task-chain/compilation-annotations.ts | 删除新路径中的注解编译职责；历史读兼容若仍被引用，仅保留对应边界。 |
| apps/api/src/task-chain/exploration-agent.ts | 删除新路径的 Pi businessTools/continuation/Agent loop，由 browser-use Agent 接管。 |
| apps/api/src/task-chain/exploration-trace.ts | 退出新执行路径；旧证据读取可保留，新增 input/count provenance 不进入上游转换。 |
| apps/api/src/task-chain/preexecution-runtime.ts | 重写为进程、取消、受控产物和 Browser 外层生命周期胶水；删除 journal、页面策略、输出累积和预算派生。 |
| apps/api/src/task-chain/runtime-host.ts | 重写接线边界；保留产品运行、审计、取消和现有 LangGraph 职责，BrowserSkill 不进入上游路径。 |
| apps/api/src/task-chain/service.ts | 重写新 authoring 的 artifact 引用与状态接线；保留产品命令、幂等、版本和持久化。 |
| apps/api/src/task-chain/trace-compiler.ts | 从新路径删除；不把 browser-use history 再编译成自研 trace 或 executor。 |
| apps/api/tests/task-chain-test-support.ts | 重写上游边界替身，保留产品事实夹具；不测试仿造的上游 loop。 |
| apps/api/tests/task-chain.test.ts | 重写受影响的 authoring 边界；恢复/保留单会话、取消、审计和版本不变量，不能因换驱动删除这些保障。 |
| apps/api/tests/trace-compiler.test.ts | 删除新路径的自研 history converter 用例；历史 IR 测试留在旧路径，不能作为上游验收。 |
| docs/development/PROGRESS.md | 保留历史证据，顶部增加替换门及当前结论，旧“已接入”不代表新方案成功。 |
| packages/browser/src/contracts.ts | 保留旧 BrowserSkill 合同及等价常量提取；F6 上限不传入 browser-use。 |
| packages/browser/src/index.ts | 保留旧 public export，未证明无消费者前不删库。 |
| packages/browser/src/task-chain-adapter.ts | 保留旧能力；不承担 browser-use 动作翻译或 workflow 复跑。 |
| packages/contracts/src/task-chain/plan.ts | 保留业务步骤、依赖和输入绑定；重审 aggregates 公共扩展，嵌套/batch 合同未经证明不得直连 primitive workflow inputs。 |
| packages/contracts/tests/task-chain.test.ts | 随最终输入契约更新；保留跨步骤绑定和预算的真实不变量。 |
| packages/runtime/src/task-chain/compiler.ts | 保留含 node id 的诊断改动及现有 IR/LangGraph 职责，不扩为 workflow executor。 |
| apps/api/src/task-chain/preexecution-adapter.ts（未跟踪） | 删除：这是自研 artifact→trace/annotation converter，与替换边界直接冲突。随阶段 6 删除调用点后删除。 |

额外已跟踪对象：`preexecution-output.ts` 的 accumulator/finish、`preexecution-trace.ts` 的执行 DSL、`exploration-browser-support.ts` 的页面策略均退出新路径；历史消费者按引用范围保留，不能全文件盲删。

## Product Alignment

- natural-language task: 完成已确认的通用浏览器步骤，并验证同一 workflow 换输入复跑。
- reusable chain boundary: 一个已确认 PlanStep 的参数化 workflow，B-A-T 只拥有外层业务组合。
- runtime inputs: 需求和步骤合同声明、由现有 binding 解析后的真实值；只开放已实测参数化字段。
- dynamic task outputs: 步骤 schema、completion 及已确认不足口径要求的结果和受控证据。
- generic platform capability used: browser-use Agent/Browser；通过入口门的 workflow-use；现有版本、绑定、审计、取消和持久化。
- replay model calls: 必须显式声明并逐用途审计 extract/output conversion 等实际调用；未证明不能标为零。
- site/task-specific code added: no

## Reuse Assessment

- capability: 页面理解、Agent loop、history、转换和语义复跑。
- existing implementation in repository: Pi/BrowserSkill 自研预执行累积器、trace converter/compiler；现有 TaskChain/LangGraph 产品运行。
- mature candidates and pinned versions: browser-use 0.13.10 @ 5c892e013a73e6622e6f50336e1eb0aa2c4405f2 为对照；实际固定组合为 workflow-use 0.2.11 @ 5d2d19fe8835cc86f1bf3e04302a5000d590f249 的官方 lock，其中 browser-use 0.13.8、MCP 1.29.1。
- selected implementation: browser-use 0.13.8 为探索基线；workflow-use 0.2.11 使用两份上游形态本地补丁，通过公开生成/执行、换输入、非采集和产品接线门，冻结为本地集成依赖。
- reused public surface: Agent、Browser、AgentHistoryList、HealingService 公开 generation 和 Workflow executor；均按固定版本真实运行。
- B-A-T-owned adapter and remaining gap: 完整 task、AI Connect 调用形状、进程/Browser 生命周期、artifact、绑定和审计；补丁只修上游 prompt/dispatch 并带上游回归测试，B-A-T 不实现 converter/executor。剩余交付缺口为 Windows、AGPL 分发决定和新需求确认后的京东验收。
- license/runtime/platform fit: MIT / AGPL-3.0；Python 3.12.13 的 macOS 安装、import 和产品进程已通过；Windows 安装/进程待测，分发方案尚未接受。
- browser/runtime/state ownership conflicts: Browser 初建 keep_alive、同一产品运行共享，并由外层 finally 关闭已经实测；workflow 内部恢复 token 未证明。
- replay model calls: Agent/judge 属探索；生成/变量建议属 authoring；extract/output conversion 属显式声明的复跑调用。
- rejected candidates and evidence: 旧自研历史适配器按标量等值猜绑定并生成 repeatRegions，继续复制上游职责；已经从新路径删除。固定上游原版的 prompt 和 extraction dispatch 缺陷分别由补丁回归覆盖。
- focused validation: 依赖/平台、模型桥、本地 Agent、补丁后的公开转换/复跑、换输入、非采集、产品 authoring、产品不同输入验证、授权复跑、显式模型审计和关闭均已通过；后续为 Windows、AGPL 分发决定和新需求确认后的京东门。

## 实施停止条件

依赖不能从上游声明/lock 得到可复现安装时停止该路径。公开转换/执行入口缺陷只有在用户明确授权后，才可维护独立、可向上游提交且带回归测试的本地 patch；不得在 B-A-T 中补写 converter、executor、选择器或 runtime。补丁后的公开入口仍不通过时继续保存最小复现并停止产品接线。

真实京东必须等阶段 1–7 通过，并由用户确认新的规格、评论字段和不足成功口径。历史任务数据失效化/删除只在阶段 8 的必要范围内执行。

## 本次阶段结果与新增文件

阶段 1 按上游原样 lock 评估的实际组合为 browser-use **0.13.8** / workflow-use **0.2.11 @ 5d2d19f** / MCP **1.29.1**。0.13.10 固定组合的冲突仍存在，不覆盖这两个不同结论。

阶段 2 的薄桥与阶段 3 本地 Agent/judge 已取得真实运行证据。阶段 4 的原始 `KeyError: variable` 和随后 `extract_page_content` 分派缺口，已由用户授权的两份独立上游补丁修复；阶段 4 的同/换输入及阶段 5 非采集门通过。见[补丁与兼容证据](evidence/workflow-use-local-patches-2026-09-15/README.md)。

阶段 6–7 已完成本地产品接线和最小边界验证：`apps/api/src/upstream-browser/` 与 `apps/api/python/browser_use_runner/` 承担协议、模型、artifact 和进程胶水；TaskChain 通过显式 `llm` 节点调用 workflow，Plan/LangGraph 只管理产品外层。旧未跟踪 converter 和旧真实 POC 入口已删除，仍被历史测试/读取路径引用的旧源码保留。`npm run upstream:setup` 可从固定源码和 lock 复现隔离环境。产品样本、不同输入验证和授权复跑均通过，链到 `verified`；见[产品接线验收](evidence/workflow-use-product-2026-09-15/README.md)。阶段 8 等待新的京东需求版本确认。

没有修改相邻项目、产品历史任务记录，也没有创建分支/worktree、提交或推送。AI Connect 按公开 API 核验当前账号能力；完整 history 和模型响应只在 Git 忽略目录保存。

补充 Reuse Assessment：协议复用现有 Fastify 和 Node 子进程、上游 aiohttp/Pydantic；Python 环境复用官方 uv.lock。B-A-T 只映射 system/user/assistant、inline image、schema、session metadata、completion/content、usage 与用途，不实现模型循环、页面策略、history converter 或 executor。真实模型准备第一次误用 managed-profile 专属 prepareInvocation，已删除该接线并改为普通账号公开 generate/generateObject；没有对共享包打补丁。
