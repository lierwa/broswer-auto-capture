# D 阶段验收符合性记录

- 记录日期：2026-09-19（Asia/Shanghai）
- 验收 checkout：`D:\work\browser-auto-tool`
- 分支：`master`（相对 `origin/master` ahead 4）
- 基线 commit：`151b0ced889fbdf7fc13057fbdaf41847892efa7`
- 当前结论：**Windows 范围内 D1–D5 通过；D2 跨平台硬门与整个 D 阶段仍待 macOS arm64 实机结果，不能写成全平台完成。**
- macOS 处置：用户于 2026-09-19 明确要求停止当前 macOS 测试，后续由用户在公司设备验证。Intel Mac 未发现产品支持声明，因此不是当前必测平台。
- 浏览器前台约束：D1 headed 验收完成在用户提出“不要抢鼠标”之前；收到该要求后只运行 headless 浏览器，没有再启动可见浏览器。

## 1. Checkout 与既有 dirty work

开工前先核验了 checkout、分支和 dirty work。以下内容在 D 阶段动手前已经存在，均保留，没有 reset、clean、checkout 覆盖、创建 worktree、提交或推送：

```text
M  CONTEXT.md
M  docs/development/BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md
M  docs/development/PROGRESS.md
M  docs/development/RESEARCH.md
M  docs/development/RESULT_SPEC_BINDING_IMPLEMENTATION.md
M  docs/development/ROADMAP.md
M  docs/development/TASK_CHAIN_ARCHITECTURE.md
D  docs/development/replay-repair/D_EXPLICIT_BU_NODE.md
M  docs/development/replay-repair/E_INTEGRATION_ACCEPTANCE.md
M  vendor/workflow-use/LOCAL-CHANGES.json
M  vendor/workflow-use/workflows/workflow_use/hybrid/action_capture_policy.py
M  vendor/workflow-use/workflows/workflow_use/hybrid/capability.py
?? docs/adr/0006-deterministic-interference-and-explicit-decision-nodes.md
?? docs/development/evidence/browser-replay-repair/INTERFERENCE_OBSERVABILITY_ACCEPTANCE.md
?? docs/development/replay-repair/D_IMPLEMENTATION_HANDOFF.md
?? docs/development/replay-repair/D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md
?? vendor/workflow-use/workflows/tests/test_interference_browser.py
?? vendor/workflow-use/workflows/workflow_use/hybrid/scroll_observation.py
```

D 阶段新增或修改仅位于本 checkout 内，集中在 `apps/api`、`apps/browser-replay-lab`、`apps/workbench`、`packages/contracts`、`packages/runtime`、`scripts`、`vendor/workflow-use` 和本证据文档；未修改相邻项目。`vendor/workflow-use/LOCAL-CHANGES.json` 已登记新增 runner，最终 `verify-source.mjs` 通过。

## 2. Product Alignment 与复用记录

```text
Product Alignment:
- natural-language task: 将含真实页面交互、纯数据计算、有序多路判断和一次显式语义判断的浏览器任务编译为可验证、可复跑链路
- reusable chain boundary: stable/v2 TaskChain 的 browser、function、llm、branch 与 terminal 节点
- runtime inputs: 一个 JSON 输入，以及普通 browser 节点产生的已验证 JSON 结果
- dynamic task outputs: 版本化 ValueContract 输出、动态 Branch port、确定性失败证据
- generic platform capability used: 物理输入、干扰观测、QuickJS 沙箱、LangGraph 图运行、结构化模型输出
- replay model calls: 只有显式 llm 节点；Function、Branch、browser 普通节点均为 0
- site/task-specific code added: no（受控实验页和 GitHub 任务只属于验收 fixture/script，不进入生产 contracts/runtime）
```

```text
Reuse Assessment:
- capability: 纯数据 JavaScript 隔离执行
- existing implementation in repository: 无满足超时后恢复、heap/stack、宿主隔离与跨平台硬门的实现
- mature candidates and pinned versions: quickjs-emscripten@0.32.0
- selected implementation: quickjs-emscripten@0.32.0 的 QuickJS runtime/context，加 Worker 生命周期适配
- reused public surface: QuickJS module/runtime/context、interrupt handler、memory/stack limits
- B-A-T-owned adapter and remaining gap: stable/v2 Function 映射、JSON 边界、审计与 finally 释放；剩余 gap 为 macOS arm64 实机验证
- license/runtime/platform fit: npm lock 固定；Windows x64 + Node 24 已验证，macOS arm64 未测
- browser/runtime/state ownership conflicts: Function 无 Browser、LLM、网络、文件、环境、进程、时间、随机数能力；图调度继续由既有 LangGraph 承担
- replay model calls: 0
- rejected candidates and evidence: 不允许 node:vm、eval 或未隔离 local runner，未实现降级路径
- focused validation: 正常、重复、无限循环、超时后复用、heap、stack、非法/超大输出、宿主隔离、取消、释放
```

UI 复用 React 19 与 Radix UI；真实浏览器能力继续通过仓库内已固定的 workflow-use 适配层；物理点击使用 CDP `Input.dispatchMouseEvent`，没有用 DOM `click()` 伪造成功。

## 3. D1 — 真实干扰实验站

结果：**通过。** `apps/browser-replay-lab` 是 React + Radix UI 的真实实验站，覆盖规范固定的 25 个 scenario id。页面 oracle 使用受保护 token 读取，不把答案暴露到 DOM 或任务输入。

| 模式 | 证据 | 场景 | browserCommands | modelCalls | 清理 |
|---|---|---:|---:|---:|---|
| headed | `work/d1-replay-lab/2026-09-19T12-06-02-339Z/headed/acceptance.json` | 25/25 | 43 | 0 | browser/adapter 均关闭 |
| headless | `work/d1-replay-lab/2026-09-19T12-06-58-190Z/headless/acceptance.json` | 25/25 | 43 | 0 | browser/adapter 均关闭 |

关键不变量：

- 声明过的可选准备动作只在同文档 `before → dispatch → after` 证据齐全时执行，最多一次；未知弹窗、遮挡、滚动失败与 selector 失败只留下确定性错误和截图，不调用 LLM，也不临时接管。
- 同源 iframe 完成坐标映射并使用物理输入；跨源 iframe 场景确定性返回 `physical_input_scope_unsupported`，业务动作未执行，链冻结被阻止。
- 原生 alert/confirm/prompt/beforeunload、portal、重复遮挡、透明 overlay、shadow DOM、滚动锁、nested scroll、验证码/权限等待等均与 oracle 预期一致。
- D1 聚焦契约测试：3/3 通过。

## 4. D2 — stable/v2 Function 与跨平台门

### 4.1 实现与 Windows x64 结果

结果：**Windows 通过。跨平台硬门未完成。**

| 项目 | 实际值 |
|---|---|
| OS / release | Windows `win32` / `10.0.26200` |
| arch | `x64` |
| Node | `v24.14.1` |
| QuickJS | `quickjs-emscripten@0.32.0` |
| commit | `151b0ced889fbdf7fc13057fbdaf41847892efa7` |
| package-lock SHA-256 | `06cad524123109b86fa7a910c8f14bb0f14c8ca6710637ae46d0599e60d24fd8` |
| implementation digest | `10f959a4e2ccd5fa8f59da47d3a3b8f708c508bafbbf45fe5617f0b5fc0fee90` |
| acceptance Function source digest | `e53edf3a4045a3f199a4c8e1be914cc72182acc5f19ecbc863cf51fd04966dbe` |
| 证据 | `work/d2-function-platform/2026-09-19T12-32-44-526Z/win32-x64/acceptance.json` |

同一验收脚本的 10 项结果全部通过：正常 JSON 输入输出、确定性重复、宿主隔离、无限循环中断、timeout 后再次执行、heap 限制、stack 限制、非法输出、超大输出、取消。`browserCommands=0`，`modelCalls=0`。

运行边界为纯数据同步 `function main(inputs)`：输入/输出各 2 MiB，heap 32 MiB，guest stack 512 KiB；不暴露 Browser、LLM、网络、文件、环境变量、进程、时间、随机数、timer、`eval` 或 `Function`。每次调用创建独立 Worker/QuickJS runtime/context，并在 `finally` 中销毁。

清理计数：`activeWorkers=0`、`activeRuntimes=0`、`activeContexts=0`、`cleanupFailures=0`。

### 4.2 macOS 门

| 平台 | 结果 | 处置 |
|---|---|---|
| macOS arm64 / Node 24 | **未测** | 用户明确要求当前停止，后续在公司真实设备运行同一 commit、同一 `package-lock.json`、同一验收脚本 |
| macOS x64 | 不适用 | 当前产品资料未发现 Intel Mac 支持声明；若以后声明支持，必须补测 |

因此 D2 不能标记为跨平台完成，整个 D 阶段也不能标记为正式全平台完成。此前只确认公司 Mac 网络可达，但 SSH 身份验证未建立；这不是产品测试结果，也不冒充 macOS 验收。

## 5. D3 — stable/v2 有序 N 路 Branch

结果：**通过。**

- Branch 使用有序 `cases[]`，按顺序 first-match；拥有动态 port、`default`、`failed`，不是隐藏的二元 Branch 串。
- 编译器验证重复/保留/未绑定 port；Workbench 直接展示动态端口。
- 可选准备动作图固定为 `readiness → ordered branch → optional action(max once) → readiness → branch`，只有准备前后证据允许继续业务动作。
- 聚焦验收：`branch-v2`、`hybrid-v2-materializer`、Workbench projection 共 8/8 通过。

D5 实际 Branch port：

- Function 链：`official, candidate, reject, default, failed`
- 受控语义链：`product, accessory, service, uncertain, default, failed`
- GitHub Issues 链：`candidate_1, candidate_2, candidate_3, none, default, failed`

## 6. D4 — 显式 LLM 节点

结果：**通过。**

- `systemPrompt` 在编译时保存并参与链 digest；运行时只传一个 JSON user input，provider 最多调用一次，只接收严格 `{ result }`。
- runtime 不提供 Tools、Browser、Agent loop、delegate；普通节点失败不会进入 LLM 兜底。
- provider 必须报告 `reportedInvocations=1`；0、重复、错误 envelope、超时、取消或 browser command 报告都会失败，不能进入 Branch。
- 聚焦验收：runtime 与 API 显式 LLM 测试共 5/5 通过。

## 7. D5 — 正式接线与独立验收

最终证据：`work/d-task/2026-09-19T13-10-27-178Z/acceptance.json`，`accepted=true`、`blockers=[]`。此轮完全 headless，未占用鼠标。

| 任务 | stable/v2 chain id / version | chain digest | 固定源码或 prompt digest | 输入复跑结果 |
|---|---|---|---|---|
| 受控 Function + Branch | `56000000-0000-4000-8000-000000000001` / 2 | `5974294af1be0a79af7895f4262faedf091f6bacb9282ac069313e21243d5285` | Function `53608455acbcfce6bedf71ce547b3327a97f4626fa69d70b11257131ab86ff9c` | sample→`official`；verification→`reject` |
| 受控显式 LLM + Branch | `57000000-0000-4000-8000-000000000001` / 2 | `aefb468b1d675d5ff58e71f2a59b291118aeace7b136c3f42fbe5076e813387b` | systemPrompt `4de2b8c410494f0db0b47e01b37e3c35085add1718ab458bf5119ad736c3decd` | sample→`product`；verification→`uncertain` |
| `browser-use/browser-use` GitHub Issues | `58000000-0000-4000-8000-000000000001` / 2 | `c4ca3aa2e36c92c66f61cb97ff574e8e613887faa0d6215ee1e4e307784f899e` | systemPrompt `90bf1daa54ea2f97fc0d5c85843a964a8e5302fba395d1ccb4b278a0cabb4e1f` | 两个不同输入均→`candidate_2`，并真实打开 issue |

输入 digest：

- Function：`e2c08c515be08d1027ca063fc9e6cef5d76e2c413abf3effb7a011cb701883d9`、`cff3a00b7d77ef8c1d8d7801d1eddae1c48e4648344ba34c3fcf980e10a3bbb2`
- 受控 LLM：`8dd4ce005c0254f85ca8d64ffba4c6a86e2154335ddad368d435eec17a1e9ca8`、`963f0f3297347a4898508e00b62167a4bbfc89c74fd507a01563e0782925ed7e`
- GitHub：`b498d7e79e9f6f5f81f25ea289c344bb48157bf1594eca17915a454ffa3ae8d8`、`49985033e5b9d85337d3ea250a3a6d1375d63dc277b1990495b7d088b2995a4b`

### 7.1 调用审计

| 运行 | browserCommands | modelCalls | provider reportedInvocations | Branch port |
|---|---:|---:|---|---|
| Function sample | 2 | 0 | `[]` | `official` |
| Function verification | 2 | 0 | `[]` | `reject` |
| 受控 LLM sample | 2 | 1 | `[1]` | `product` |
| 受控 LLM verification | 2 | 1 | `[1]` | `uncertain` |
| GitHub sample | 5 | 1 | `[1]` | `candidate_2` |
| GitHub verification | 5 | 1 | `[1]` | `candidate_2` |

显式 LLM 的四次 provider attempt 均报告一次调用；它们来自正式 AI provider 的结构化输出路径，不是 mock/fixture 成功值。没有记录账号、Cookie、token 或敏感页面原文。

### 7.2 真实页面与截图

GitHub Issues 在验收时实际读取前三条：

1. `/browser-use/browser-use/issues/5846` — `Bug: images read by read_file are declared image/jpeg to the LLM even when they are GIF or WEBP`
2. `/browser-use/browser-use/issues/5844` — `Bug: loading a history entry that predates state.interacted_element fails validation in the branch written to support it`
3. `/browser-use/browser-use/issues/5817` — `Bug: user-agent shadow roots are reported as SHADOW(open) in the serialized page state`，label=`bug`

最终截图：

- `work/d-task/2026-09-19T13-10-27-178Z/controlled-card-verification.png`，SHA-256 `e5cd7e89e0eb8e1bad311bc083d2555421d9a74478c26fd50153dbbdef940e0b`
- `work/d-task/2026-09-19T13-10-27-178Z/controlled-semantic-verification.png`，SHA-256 `082033c223e63345f16d7d8aba15a9a92860cb74f00daab080e6d62154aae0c3`
- `work/d-task/2026-09-19T13-10-27-178Z/github-verification.png`，SHA-256 `90bc4e05096921e2d99601bd633d9d3cae2faacb8b29de73e1081c2bbd486c6e`

sample 的显式 warmup read 遇到真实 CDP 瞬态错误 `Could not find node with given id`，节点确定性记录为 `missing`；随后链中原本固定的正式 read 成功。没有调用额外 LLM 猜测或修复，也没有把该错误隐藏为成功。verification 的 warmup 与正式 read 均成功。

## 8. 最小验证与清理

只运行覆盖各阶段真实不变量的聚焦验证，没有运行根级全量测试：

| 验证 | 结果 |
|---|---|
| D1 contract tests | 3/3 通过 |
| D1 headed browser acceptance | 25/25 通过 |
| D1 headless browser acceptance | 25/25 通过 |
| contracts + Function runtime tests | 8/8 通过 |
| D2 Windows platform acceptance | 10/10 通过 |
| D3 Branch/materializer/Workbench tests | 8/8 通过 |
| D4 explicit LLM runtime/API tests | 5/5 通过 |
| D5 headless controlled + GitHub acceptance | 6 个正式运行全部 completed，最终 `accepted=true` |
| contracts/runtime/API/Workbench/browser-replay-lab package typecheck | 通过 |
| `node vendor/workflow-use/verify-source.mjs` | 通过 |
| `git diff --check` | 通过；仅 Git 的 LF→CRLF 工作区提示，无 whitespace error |

D5 finally 清理：`viteClosed=true`、`browserClosed=true`、`adapterClosed=true`、`aiClosed=true`、`storeClosed=true`；QuickJS `activeWorkers=0`、`activeRuntimes=0`、`activeContexts=0`、`cleanupFailures=0`。D1 两轮 Browser/adapter 也均关闭。

## 9. 最终符合性矩阵

| 项目 | 状态 | 说明 |
|---|---|---|
| D1 React + Radix 25 场景、headed/headless | **通过** | 独立真实浏览器证据齐全 |
| D2 stable/v2 Function 实现 | **通过（Windows）** | QuickJS 0.32.0，无降级 runner |
| D2 Windows x64 / Node 24 | **通过** | 10/10，释放计数归零 |
| D2 macOS arm64 / Node 24 | **未测 / 硬门待补** | 用户后续在公司设备验证 |
| D3 有序 N 路 Branch 与准备动作图 | **通过** | 动态 port/default/failed，非二元串 |
| D4 显式 LLM | **通过** | 固定 prompt、单 JSON 输入、单 result、最多一次调用 |
| D5 正式接线、受控页、真实 GitHub Issues | **通过（Windows headless）** | 相同链版本和 prompt digest 的不同输入复跑成功 |
| 基线失败 | **无** | 聚焦 suite 无失败；未运行根级全量 suite |
| 整个 D 阶段 | **未正式完成** | 唯一硬门缺口是用户延期的 macOS arm64 实机验收 |

在 macOS arm64 使用相同 commit、相同 `package-lock.json`、Node 24 和 `scripts/accept-d2-function-platform.mjs` 获得通过证据后，方可把 D2 与整个 D 阶段改写为完成。
