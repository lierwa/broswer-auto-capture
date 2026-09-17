# 技术调研与复用结论

本文件只保留当前选型和仍有效的边界。阶段进度见 [PROGRESS](PROGRESS.md)，执行顺序见 [ROADMAP](ROADMAP.md)。

## Reuse Assessment

- capability: 浏览器 Agent 探索、原生动作/DOM 能力、history 证据、确定性工作流执行和条件核验。
- existing implementation in repository: B-A-T 已有 TaskChain、LangGraph、版本、输入输出绑定、预算、幂等、恢复、持久化和模型审计。
- mature candidates and pinned versions: browser-use 0.13.8；workflow-use 0.2.11，
  commit `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；Python 3.12。
- selected implementation: 受管 workflow-use fork 的运行源码子集，通过公开 schema/history/Tools/Agent/StepVerifier surface 适配。
- reused public surface: browser-use Browser、Agent、Tools、action schema、history、DOM/element 查询；
  workflow-use schema、executor、StepVerifier 和 Tenacity。
- B-A-T-owned adapter and remaining gap: Requirement/TaskPlan 输入、证据规范化、TaskChain 物化、版本、审计和产品生命周期；
  A 的受控页和实际任务页已通过，B/C/D 与组合验收未完成。
- license/runtime/platform fit: browser-use 为 MIT；workflow-use 为 AGPL-3.0。仓库保留许可证、固定 commit、archive digest、
  留存源码逐文件 digest 和本地变更 digest；来源校验以 LF 为规范字节，兼容 Windows checkout 的 CRLF。Windows 运行由当前 checkout 的正式验证决定。
- browser/runtime/state ownership conflicts: 一个产品运行只占用一个 Browser 会话；借用节点不关闭外层会话；
  LangGraph 是唯一图执行器，产品数据库是运行事实源。
- replay model calls: 普通节点为零；仅显式 `llm` 节点允许调用模型。
- rejected candidates and evidence: 上游 mechanical conversion 缺少任务意图、动态绑定和完整控制依据；
  LLM 整图生成会漏步骤、重排和固化样本；旧多层 patch 路线已退出。
- focused validation: 固定来源校验、主链测试、受控真实 Browser、实际任务页、变化输入/状态、模型审计和 finally 资源关闭。

## 当前结论

fork 只保留 B-A-T 运行和主链回归需要的文件：生产 Python 包、锁文件、包 README、许可证、来源/本地变更清单、
来源校验器，以及两个生成主链 fixture 的 Python 文件。上游扩展、独立 UI、示例、CI、开发测试、样本 storage 和重复文档
不参与产品运行，已从 checkout 删除。

首次探索可调用模型和浏览器；成功且业务结果完整后，程序依据 Requirement、TaskPlan、真实 trace 和 provenance 编译。
固定输入与编译版本必须产生稳定 TaskChain。复跑只执行普通能力和显式声明的 LLM 节点，所有模型调用进入运行审计。

选型尚未由完整业务验收冻结。A 已通过；B 的稳定读取、C 的异步顺序、D 的共享会话模型节点以及 E 的同链换输入仍须分别通过。

## 本地环境安装

Reuse Assessment:
- capability: 一条命令安装 npm workspace、Python 3.12 和固定 Python 依赖。
- existing implementation in repository: 根 `package-lock.json`、workflow-use `uv.lock` 与
  `scripts/setup-upstream-browser-runner.mjs` 已拥有依赖同步和版本核验。
- mature candidates and pinned versions: npm 11 的 lockfile 安装；Astral uv 0.12.15 官方独立安装器及受管 Python。
- selected implementation: `npm run setup` 调用 `npm ci`，再把固定 uv 安装到忽略的 `work/tools/uv`，
  最后复用现有 `uv sync --frozen --python 3.12`。
- reused public surface: uv 的 `UV_UNMANAGED_INSTALL`、`UV_PYTHON_INSTALL_DIR`、`UV_CACHE_DIR`、
  managed Python 下载和 frozen sync。
- B-A-T-owned adapter and remaining gap: 只负责版本门、项目内路径、跨平台进程调用和最终版本核验；首次安装需要访问 npm、
  Astral/GitHub 与 Python 包源。
- license/runtime/platform fit: uv 采用 MIT OR Apache-2.0；官方安装器支持 Windows、macOS 和 Linux。
- browser/runtime/state ownership conflicts: 安装阶段不启动 Browser、模型、队列或产品服务；环境位于忽略的 `work/`。
- replay model calls: 0。
- rejected candidates and evidence: 不依赖全局 Python/pip 或手写虚拟环境；不复制解析器和安装器。
- focused validation: 全新工具目录执行 setup、重复执行 setup check、来源 digest、Python/包版本和 API TypeScript 检查。

## 旧批次计划读取兼容

Product Alignment:
- natural-language task: 启动最新代码后仍能读取任务列表并进入需求对话。
- reusable chain boundary: 已持久化计划的只读兼容；执行门继续拒绝缺少批次聚合声明的计划。
- runtime inputs: 同一协议版本下、尚未包含 `aggregates` 的历史 `batch` invocation。
- dynamic task outputs: 读取时规范化为空聚合列表，并返回明确的不可执行问题。
- generic platform capability used: Zod 持久化协议解析与 `taskPlanExecutionIssues` 执行门。
- replay model calls: 0。
- site/task-specific code added: no
