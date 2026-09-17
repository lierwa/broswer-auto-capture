# workflow-use 旧路径处置与原子切换规范

> **2026-09-17 更新：** 本文其余章节描述旧路径迁移时的基线与计划，不是当前执行指令。`patches/workflow-use` 的 12 个 patch 及 README 已删除；当前 setup 直接使用 vendor 源码。旧“主线验收前保留补丁”条件已撤回，现状见 [清理账本](REPLAY_CLEANUP_20260917.md)。

日期：2026-09-16
状态：历史迁移记录；当前处置以清理账本为准
新编译合同：[混合编译规范](WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)

## 1. 目的

当前工作区同时存在已提交的 workflow-use v1 正式路径、未提交 runner 修改、未提交测试和 0003–0012 补丁。新开发不能在这些改动上继续叠补丁，也不能只删除补丁文件后声称旧路径已经退出。

本规范逐项说明哪些能力保留、哪些重写、哪些删除，以及何时允许删除。核心原则：先保留证据和读取兼容，再封死旧执行入口，再接入新编译器；新真实验收通过后才清理旧活动实现和隔离环境。

## 2. 已存在的旧正式路径

以下调用链现在仍可能启动旧 author/replay：

1. `apps/api/src/app.ts` 创建 `PythonUpstreamBrowserRuntime`；
2. `apps/api/src/task-chain/authoring.ts` 调用旧 author，保存 workflow artifact，再生成 delegated chain；
3. `apps/api/src/task-chain/runtime-host.ts` 在 `browser.workflow-use` 节点进入旧 session；
4. 同文件读取 workflow artifact v1 并调用 `session.replay`；
5. `apps/api/src/upstream-browser/service.ts` 启动 `work/upstream-browser-runner/.../.venv/bin/python` 和旧 `main.py`；
6. `scripts/setup-upstream-browser-runner.mjs` 安装固定源码并应用 0001–0012；
7. `apps/api/src/upstream-browser/workflow-artifact.ts` 允许/写入 patch hash，并把整个 workflow 编译为一个 delegated LLM 节点。

只删除 0003–0012 会让新 setup 失败，但已经安装的旧环境和数据库中的旧 chain 仍可继续执行。因此退出必须覆盖产品 gate、authoring、artifact、runtime、provider、setup 和已有数据读取。

## 3. 逐项处置表

| 对象 | 当前职责/问题 | 最终处置 | 允许删除或切换的条件 |
| --- | --- | --- | --- |
| `apps/api/python/browser_use_runner/main.py` | Browser/Agent/model bridge、旧 HealingService 整图生成、旧 replay/self-heal | **拆分重写**。保留受控 Browser/Agent/model bridge、取消和 `finally`；删除整图生成与旧 replay | 新 runner 协议通过 focused lifecycle 和审计测试 |
| `run_agent_with_validation_repair` | 同一 Agent 中补采一次 | **重新准入**。只有新 history 合同、明确一次上限和同一会话审计通过才保留 | 独立错误路径测试证明不会变成 browser LLM fallback |
| `HealingService.create_workflow_definition` | 模型读取完整 history 生成整图 | **删除产品使用** | 旧 author gate 已在模型调用前拒绝；新编译入口可用 |
| `Workflow.run_with_no_ai` / semantic executor | 执行旧 definition；实际 extract/output conversion 仍调模型 | **删除产品使用**；普通 capability 是否复用逐项评估 | 新 capability adapter 有模型审计和真实效果验证 |
| 旧 `validate_definition` | schema/动作名校验，曾依赖手写动作范围 | **重写**为 action registry + coverage/gap 校验 | 未知动作测试必须失败；不得恢复白名单 |
| `apps/api/src/upstream-browser/workflow-artifact.ts` | v1 读写、patch hash、整图转单个 LLM 节点 | **拆分**。v1 decoder 只读；v1 writer/compiler 删除；新增 v2 HybridCompilation artifact | 已有 v1 数据可查看/导出，任何 v1 执行在启动 browser/model 前拒绝 |
| `apps/api/src/task-chain/authoring.ts` | 调旧 author 并写 v1 | **原子替换**为 normalize → compile → validate → candidate | v2 合同及失败出口通过；没有 v1 writer 调用 |
| `apps/api/src/task-chain/runtime-host.ts` | `browser.workflow-use` delegated session/replay | **移除旧 provider 路由**；执行现有 capability/llm/branch/loop/invoke | 旧 chain 明确返回 retired 错误且不启动进程/模型 |
| `apps/api/src/app.ts` | 默认组装旧 Python runtime | **原子切换**到新 explorer/compiler/capability adapter | product composition 测试通过；无混合 runtime |
| `apps/api/src/upstream-browser/service.ts` | 启动旧 ignored venv/main.py | **改为启动受管 fork 的新公开入口**，随后删除旧启动形状 | setup/source gate 和协议版本校验通过 |
| 旧 provider/protocol/idempotency keys | `browser.workflow-use` 和旧 session 语义 | **版本化替换**，旧键只用于读历史/报 retired | 队列、恢复、invoke 都不会进入旧 provider |
| `scripts/setup-upstream-browser-runner.mjs` | 下载源码、应用 12 个 patch、验证 patch stack | **重写**为受管 fork 来源和 lock 一致性检查；不再 apply patch | fork 原始基线和本地变更清单可复现 |
| `work/upstream-browser-runner/` | ignored 旧源码和 venv | **隔离保留，最终精确删除** | 无活动进程、无代码/配置引用、新真实验收通过；不得删除整个 `work/` |
| `patches/workflow-use/0001`–`0012` | 失败修复实验 | **已删除** | 13 类问题已进入规范/fixture/决策记录；新 setup 不引用 |
| `patches/workflow-use/README.md` | 指导继续应用旧补丁 | **已随旧 patch 目录删除** | 当前 setup 无依赖，历史结果另存 |
| `apps/api/tests/upstream-browser-runner.test.ts` | 未提交旧 runner 测试 | **逐用例重写或删除** | 每个用例映射到新合同的不变量 |
| 已有 v1 artifacts/chains/runs/history | 历史审计和用户数据 | **字节保留、只读/可导出、不可执行** | 永不以代码切换为理由删除数据 |

## 4. 未提交测试的具体处置

`apps/api/tests/upstream-browser-runner.test.ts` 当前三个用例不能整体保留：

1. “上游历史动作不受 B-A-T 手写名单限制”目前允许 `future_action` 并只剩 extract。新合同要求保留未知动作并产生 `unsupported_action` gap，因此该用例必须重写；静默通过属于错误。
2. “保留 browser-use 默认失败恢复预算”不能原样继承。新实现只允许公共 capability 明确拥有的有界重试，并写入审计。
3. “判定失败后同一 Agent 补采一次”只有在一次上限、同 session、无新 browser/model loop、history 完整覆盖都能证明时才保留。

测试改名应直接描述新不变量，不引用临时补丁编号或把上游当前行为当产品合同。

## 5. 十二份补丁提供的诊断证据

补丁不是新实现的设计。它们只证明旧路径在哪些层失败：

| 问题 | 补丁 | 责任分类 | 新路径处理 |
| --- | --- | --- | --- |
| prompt 中 `{variable}` 未转义 | 0001 | LLM 整图生成 | 删除整图生成路径 |
| `PageExtractionStep` 未分派 | 0002 | schema/executor 不一致 | capability registry 与真实执行准入 |
| 结构化 workflow 输出失败 | 0003 | LLM 整图生成 | 不再让模型生成 graph |
| 完整截图/history 输入过大 | 0004 | 证据输入边界 | digest + 按需 EvidenceRef |
| 固定文本点击缺 fallback | 0005 | target 解析 | StableTarget + capability proof |
| 点击丢失上下文 | 0006 | target 解析 | container/role/name/ordinal 合同 |
| 重复文本目标排序 | 0007 | target 解析 | 目标唯一性不足即 gap |
| 缺 accessible name | 0008 | 页面证据 | 观察合同/能力准入 |
| popup/background 同名目标 | 0009 | UI 状态/目标解析 | 前置状态和后置状态证明 |
| 邻近 label 污染 | 0010 | 元素语义 | registry/capability fixture |
| 页面异步稳定等待 | 0011 | 执行器等待 | 普通 capability，不是 LLM |
| 点击效果/陈旧目标重试 | 0012 | 效果验证/恢复 | EffectContract + 有界重新解析 |

第 0001–0012 中某项行为只有在能解释为至少两类浏览器任务都需要的公共能力、通过新合同测试、且属于 fork 的明确职责时，才能重新实现。不能复制补丁代码作为起点。

## 6. 真实证据登记与敏感边界

### 6.1 最新短历史

- path：`data/upstream-browser-artifacts/0d64348d-f4d1-44d0-8000-cbbc62241eee/874566da-bd4e-4485-8b1b-dcde7e7df248-collect-filtered-issues/history.json`
- SHA-256：`3f941f1dc9b95780dae7e2ca5fc9e8068b7c7c6334db7a29aabc69259e647577`
- 8 步：`navigate, navigate, evaluate, navigate, extract, click, click, done`
- 用途：验证短 history 的 action coverage、page=2 和详情跳转证据；它所在目录未找到 definition，不能声称生成完成。

### 6.2 完整复杂历史

- history path：`data/upstream-browser-artifacts/e76cc02e-4760-4901-8692-9579e02097d3/84974663-8e1b-4ef0-8c3a-a3910025cf99-collect-issues/history.json`
- history SHA-256：`9fbc88645c29c65155e2e235727d318f7a70e1e1accceda76eacda580197b69a`
- definition SHA-256：`5799ce2ff11634b1def9363580d18c5262121ae0a3f0e6fe6127d61edcc8aad2`
- author-result SHA-256：`7862c00ab49fad02b9d4f365bfc8f2f114594aa291af2cb2d3d22b72bbb7743f`
- 28 步，覆盖 navigate、click、wait、find/evaluate、scroll、go_back、extract 和文件辅助动作。
- 已知错误：definition 把“第 2 页第 1 条”固化为当时可见标题。

这些 path 只作为本机忽略证据引用。开发只能提交脱敏后的最小 fixture 和 redaction manifest。任何 `profile/`、Cookies、Local Storage、原始截图和完整页面都不得扫描、复制或提交。

## 7. 旧路径退休门

在导入 fork 或写 compiler 前，先加入一个集中式 retirement gate。以下旧操作必须在任何 Python 进程、Browser 或模型调用之前返回版本化错误：

- author v1 workflow；
- replay/resume v1 workflow；
- 队列继续执行旧 provider；
- invoke 已保存的旧 delegated chain；
- 从 v1 artifact 创建 candidate/verified chain。

推荐错误合同：

```text
code: legacy_workflow_use_v1_retired
artifactId / chainId
readable: true
exportable: true
executable: false
replacement: hybrid_compilation_v2_required
```

如果同一次运行同时请求旧 workflow runtime 和新 capability runtime，必须在启动前返回 `mixed_browser_runtime_unsupported`。

## 8. 原子切换范围

以下内容必须在一个阶段一起切换，不能长期形成半新半旧状态：

1. runner protocol/version；
2. app composition/provider registration；
3. authoring entry；
4. artifact v2 writer；
5. runtime-host provider routing；
6. setup/source verification；
7. idempotency keys、queue resume 和 invoke gate；
8. focused product tests 和旧引用扫描。

切换前允许 v1 decoder 和导出；切换后禁止 v1 writer、compiler、replay 和 resume。

## 9. 实施顺序与退出条件

### L0 证据保护

- 记录 HEAD、dirty、进程和本规范处置表；
- 核对两份 history digest；
- 生成脱敏 fixture，不读取/提交 Profile；
- 不清理、不提交旧改动。

### L1 旧执行退休

- 在旧 author/replay/resume/queue/invoke 前加入 gate；
- 证明 gate 不启动 Python、Browser 或模型；
- 保留 v1 查看和导出。

### L2 干净 fork 来源门

- 导入 workflow-use `5d2d19fe8835cc86f1bf3e04302a5000d590f249`；
- 保留 LICENSE、来源 URL、commit、导入日期和逐文件 digest；
- 导入基线与上游一致，不包含 0001–0012；
- 评估真正复用的公开 API 和 executor 最小能力。

### L3–L5 新编译与原子切换

- 实现 normalize、coverage、alignment、classification 和 TaskChain materialization；
- 先过离线正反 fixture；
- 再一次性切换第 8 节列出的产品入口。

### L6 残余引用门

只允许以下旧引用：历史文档、v1 decoder、retired 错误、迁移/导出测试。任何 setup、author、runtime、provider 和产品测试引用都必须清零。

### L7 真实验收后删除

只有新链完成样本复跑、不同输入、真实 LangGraph Issues 任务、非采集任务、模型审计和浏览器清理，才允许：

- 删除旧 runner 活动代码；
- 精确删除 `work/upstream-browser-runner/`；
- 将 0001–0012 移到明确的历史证据位置或从活动开发树删除；
- 删除已无用途的 v1 writer/compiler 测试。

失败时保留证据和 v1 数据，标记项目状态；不得删整个 `work/`、数据库或历史 artifacts。

## 10. 残余检查

切换阶段必须用定点搜索建立 allowlist，至少覆盖：

```text
browser.workflow-use
application/vnd.bat.workflow-use+json;version=1
PythonUpstreamBrowserRuntime
run_with_no_ai
create_workflow_definition
upstream-browser-runner
patches/workflow-use
```

每个剩余命中必须属于“历史文档、只读 decoder、retired gate、迁移/导出测试”之一。无法分类的命中会阻止切换完成。
