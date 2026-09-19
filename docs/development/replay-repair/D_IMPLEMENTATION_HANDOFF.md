# D 实施交接：按文件、合同和验收执行

用途：全新开发 session 的唯一 D 实施清单。先读 [D 设计](D_RUNTIME_RESILIENCE_AND_EXPLICIT_NODES.md) 和 [ADR 0006](../../adr/0006-deterministic-interference-and-explicit-decision-nodes.md)，再严格按本文件 D1 → D5 开发。不得从旧文件名“显式 b-u 节点”恢复已撤销设计。

## 0. 开工状态与硬边界

开工先在仓库根目录执行只读检查：

```powershell
git status --short --branch
git diff --name-status
git log -5 --oneline
```

保留现有 dirty work；不得 reset、clean、创建 worktree、改相邻项目、提交或推送，除非用户在新 session 明确授权。先核对以下 live baseline，任何一项不符都以当前代码为准并先修正文档：

- `packages/contracts/src/task-chain/node.ts` 的 stable/v1 是 `capability/llm/branch/loop/invoke/terminal`。
- stable/v1 `branch` 只有 `true/false/failed`，`chainEdgeSchema` 以固定 `outcome` 枚举连线。
- stable/v1 `llm` 仍有可选 `delegate`；`TaskChainRuntime.executeLlm` 会进入 delegated 路径。
- `TaskRuntimeHost.llm` 当前把 instruction 与输入拼成一个 runtime prompt；D4 必须改掉。
- 普通 browser capability 当前通过 `Tools.act` 派发，真实证据已经证明 click 是合成事件；D1 必须新增物理输入路径，不能继续把它描述为模拟人类点击。
- 已有 `DialogEventBridge`、`NativeEventCapture`、`target_preparation.py` 和 `scroll_observation.py` 必须复用，不复制第二套事件系统。

硬停止条件：

1. 需要普通节点隐式调用模型；
2. 需要模型返回节点、边、selector、动作或多字段平台记账；
3. 需要按弹窗文案、CSS class、网站名或业务字段写生产 special case；
4. 需要宿主 `eval`、`node:vm`、未隔离 local runner 或第二个浏览器驱动；
5. 需要改写 stable/v1 历史数据，而不是新增 stable/v2 reader/writer；
6. 准备以 Windows 单平台通过代替 macOS 实机验证，或反过来；
7. 真实页面任务未固定却准备把夹具通过写成 D 完成。

## 1. stable/v2 精确合同

### 1.1 版本与边

不得原地改变 stable/v1 schema。新增：

```text
stableTaskChainV1Schema := 当前 stableTaskChainSchema，nodeModel = stable/v1
stableTaskChainV2Schema := nodeModel = stable/v2，nodes = stableChainNodeV2Schema，edges = chainEdgeV2Schema
taskChainSchema := stable/v2 | stable/v1 | legacy

chainEdgeV2Schema := {
  from: key,
  port: key,
  to: key
}
```

stable/v2 节点不再保存可由 kind 推导的 `outcomes[]`。新增纯函数 `nodePortsV2(node)`：

| kind | ports |
| --- | --- |
| capability | `success/missing/timeout/blocked/human_required/failed/cancelled` |
| function | `success/timeout/failed/cancelled` |
| llm | `success/timeout/failed/cancelled` |
| branch | 每个 `cases[].id`，再加 `default/failed` |
| loop | `body/done/limit/failed` |
| invoke | `success/partial/blocked/human_required/timeout/failed/cancelled` |
| terminal | 无 |

验证不变量：每个非 terminal port 恰好有一条边；case id 唯一且不得使用上述保留 port；entry/terminal/变量/binding/循环校验保持现有语义。stable/v1 继续使用 `edge.outcome` 和原 enum。

运行事件为兼容历史继续保留字段名 `outcome`，但 v2 的校验类型放宽为 `keySchema`；它记录实际 port id。不能同时增加 `outcome` 和 `port` 两套运行事实。

### 1.2 FunctionNodeV2

```text
{
  id, label, kind: "function",
  language: "javascript",
  source: 1..32768 bytes,
  inputs: Record<key, ValueBinding>,
  outputContract: TaskDataContract,
  writes: ValueWrite[],
  timeoutMs: integer 50..5000
}
```

函数源码固定导出同步函数：

```javascript
function main(inputs) {
  return /* one JSON value */
}
```

不支持 module/import、Promise、async、网络、文件、环境变量、进程、Browser、模型、Date、timer 或随机数。输入和输出 JSON 各不超过 2 MiB；QuickJS heap 32 MiB、stack 512 KiB；每次节点调用新建 runtime/context，并在 `finally` dispose，WASM module 可以进程级复用。Windows 与 macOS 必须使用同一节点合同、限制、错误码和清理语义。

Function 源码来源只有两种：

1. 用户在 Workbench 明确创建/编辑；
2. 编译注解模型针对已确认的确定性计算提出一个 `FunctionDraft`，宿主校验输入/输出/example 后物化。模型只给函数草稿，不给 node id、port、edge 或预算。

不得从一次 browser trace 猜业务函数。现有 `data.transform` 能表达的 count/assemble 等继续物化为已有 capability，不为了使用新节点而迁移。

### 1.3 BranchNodeV2

```text
{
  id, label, kind: "branch",
  cases: Array<{
    id: key,
    label: text,
    predicate: Predicate
  }> min 1,
  outputContract: null contract,
  writes: []
}
```

从上到下计算，第一个 true 的 case id 就是 port；全部 false 走 `default`；predicate 解析/求值异常走 `failed`。Branch 自身输出 `null`，选择结果由运行事件的 `outcome` 审计；不能额外让 Branch 写 `selectedCase` 字段。若后续业务需要选择值，继续引用产生该值的 Function/LLM 节点。

### 1.4 LlmNodeV2

```text
{
  id, label, kind: "llm",
  systemPrompt: text,
  input: ValueBinding,
  model: text,
  outputContract: TaskDataContract,
  writes: ValueWrite[],
  timeoutMs: positive integer
}
```

没有 `delegate`、Tools、Browser 或多轮配置。Provider 的结构化响应 envelope 必须严格只有：

```json
{"result": "<value matching outputContract.schema>"}
```

Runtime 解 envelope 后把内部 `result` 作为节点输出。对象/数组也只能放在这一个 `result` 里；response 多出 `reason/confidence/status` 等字段立即 `llm_output_shape_invalid`。

声明来源固定为：已确认任务 authority 中的 `semantic_operation`。编译注解可以补输入证据，不能把普通 gap 升级为 semantic operation。`systemPrompt` 由该 operation 的任务特定 instruction、输入含义、唯一结果合同和候选值在编译时形成并持久化；运行时只把输入 JSON 作为单独 user message 传入，不拼写或改写 system prompt。

任何 prompt、model 或 outputContract 修改都产生新 TaskChain 版本，并清空原链 sample/verification 证明。

## 2. 错误码与退出语义

实现和测试只使用下表，不在各层发明同义错误：

| 范围 | 错误码 | port/状态 |
| --- | --- | --- |
| Function | `function_source_invalid`、`function_input_invalid`、`function_output_invalid`、`function_output_too_large`、`function_memory_limit` | failed |
| Function | `function_timeout` | timeout |
| Function | `function_cancelled` | cancelled |
| Branch | `branch_case_duplicate`、`branch_case_reserved`、`branch_port_unbound` | 编译拒绝 |
| Branch | `branch_predicate_failed` | failed |
| LLM | `explicit_llm_declaration_missing`、`llm_prompt_missing` | 编译拒绝 |
| LLM | `llm_output_shape_invalid`、`llm_result_invalid`、provider protocol/auth error | failed；保留具体 provider 分类 |
| LLM | `llm_timeout` | timeout |
| LLM | `llm_cancelled` | cancelled |
| 干扰 | `target_hit_blocked`、`ordinary_event_target_mismatch`、`unexpected_native_dialog` | 当前普通节点 failed/blocked，0 模型 |
| 准备动作 | `optional_preparation_missing`、`optional_preparation_ambiguous`、`optional_preparation_ineffective` | failed，0 模型 |
| 滚动 | 复用现有 no-range/boundary/CSS-lock/event-cancel/wrong-container 具体码 | failed/blocked，0 模型 |

错误文本可以补充诊断，但 code 是跨 Python/TypeScript/UI 的唯一稳定分类。

## 3. D1 · 测试站和浏览器事实

### 3.1 文件结构

新增 workspace `apps/browser-replay-lab/`：

```text
package.json
tsconfig.json
vite.config.ts
index.html
src/main.tsx
src/scenario-contract.ts
src/scenario-registry.ts
src/FixtureShell.tsx
src/components/BusinessSurface.tsx
src/components/EventPanel.tsx
src/scenarios/native-dialogs.tsx
src/scenarios/overlays.tsx
src/scenarios/scroll-locks.tsx
src/scenarios/semantic-boundaries.tsx
tests/scenario-contract.test.ts
```

同时新增两个正式入口，不允许验收者手工拼启动命令：

```text
scripts/accept-d1-replay-lab.mjs   # 启动主/跨源 fixture、选择 setup Python、运行 headed/headless、finally 清理
scripts/accept-d-task.mjs          # D5 受控 + GitHub sample/verification 编排与证据输出
vendor/workflow-use/workflows/tests/test_replay_lab_browser.py
```

复用与 Workbench 相同版本的 React、React DOM、Radix Themes、Lucide 和 Vite。测试站不 import API/Workbench 业务组件，不进入生产静态资源。

固定合同：

```text
ScenarioConfig = {
  scenarioId,
  seed,
  phase: preexecution | replay,
  variant: absent | present | delayed | repeated
}

ScenarioOracle = {
  scenarioId,
  targetDispatches,
  preparationDispatches,
  nativeDialogs,
  trustedEvents,
  scrollEvents,
  businessEffects,
  expectedStatus,
  expectedCode
}
```

测试 harness 通过带随机 token 的 `GET /__bat_fixture/oracle` 读取 oracle；token 不注入页面 DOM、TaskChain input 或 Browser capability。生产运行只能看到正常页面和浏览器事件。场景 URL 只保存 config，不把 expectedStatus/expectedCode 暴露给运行器。

### 3.2 固定场景 ID 与预期

| id | 核心机制 | 预期 |
| --- | --- | --- |
| `clean-baseline` | 无干扰 | 主动作 1 次，completed |
| `native-alert-declared` | 已声明 alert | action-scoped bridge 记 1 次并按保存策略处理 |
| `native-confirm-unexpected` | 未声明 confirm | `unexpected_native_dialog`，不得自动 accept/dismiss |
| `native-prompt-unexpected` | 未声明 prompt | `unexpected_native_dialog` |
| `beforeunload-declared` | 已证明导航离页 | 只按链中保存策略处理一次 |
| `portal-modal-recorded` | React Portal 全屏广告 | 原目标未就绪 → 唯一准备动作 → 原目标就绪 |
| `portal-modal-absent` | 预执行有、复跑无 | 原目标已就绪，准备动作 0 次 |
| `portal-modal-unexpected` | 预执行无、复跑有 | `target_hit_blocked`，0 LLM |
| `delayed-close-button` | 倒计时后出现关闭按钮 | 在保存的准备动作超时内出现则 1 次；否则 missing |
| `duplicate-close-buttons` | 两个同义关闭控件 | `optional_preparation_ambiguous` |
| `repeated-interstitial` | 关闭后再次覆盖 | 准备动作只派发 1 次，随后 `optional_preparation_ineffective` |
| `sticky-cookie-banner` | 局部 footer 遮挡 | 命中 outside；有证据才准备，否则 blocked |
| `chat-widget-overlap` | 浮球遮挡角落目标 | 命中 outside，不点击浮球 |
| `transparent-pointer-overlay` | 透明 overlay 接收 pointer | 命中 outside，不以 opacity 判断安全 |
| `same-origin-iframe-overlay` | 同源 frame | 保存 frame/document 身份并正确归因 |
| `cross-origin-iframe-overlay` | OOPIF/跨源 | 能证明则处理；不能证明时明确 scope unsupported，不猜 |
| `shadow-dom-overlay` | Shadow DOM/composedPath | 以 composed path 判定命中关系 |
| `overflow-hidden-lock` | body CSS 锁滚 | `scroll_css_locked` |
| `position-fixed-lock` | 固定 body 锁滚 | 具体锁定码，坐标不伪造变化 |
| `wheel-prevented` | wheel preventDefault | `scroll_event_cancelled` |
| `nested-scroll-container` | 错误/正确容器 | 记录容器；错误容器明确失败 |
| `business-confirmation` | 删除/提交确认 | 不作为干扰自动关闭 |
| `login-captcha-permission` | 人工边界 | waiting_for_human |
| `legitimate-popover` | 任务需要的菜单 | 不作为广告关闭 |
| `target-replaced-after-close` | 关闭后 DOM 替换 | 重新解析目标，不复用旧 backend id |

每个可选准备场景用同一个 scenario id + seed 跑 present→absent、absent→present、present→present；不得复制三个页面实现。

### 3.3 浏览器实现落点

| 文件 | 改动 |
| --- | --- |
| `target_preparation.py` | 返回中心坐标、viewport、document/frame/target/session 身份；保留 hitRelation |
| 新 `physical_input.py` | 复用当前 Browser CDP session，使用 `Input.dispatchMouseEvent` 派发 move/press/release；不创建 Browser |
| `capability.py` | click 走物理输入；input/select 保留各自成熟 API但必须通过事件/后态；native dialog policy 由节点 config 显式传入 |
| `native_event_capture.py` | 对 trusted、target/composedPath、frame/document 进行验收；事件窗口 finally 关闭 |
| `dialog_event_bridge.py` | 暴露一次动作内实际 dialog 列表及声明策略，不按文案分类 |
| `scroll_observation.py` | 固定错误码和容器事实 |
| 新 `optional_preparation.py` | 只验证“下游未就绪 → 准备动作一次 → 下游就绪”的证据，不扫描弹窗 |
| `scripts/accept-d1-replay-lab.mjs` | 启动两个 loopback origin，传入 fixture token/base URL，选择 headed/headless，失败和成功都 finally 回收 |
| 新 `test_replay_lab_browser.py` | 按 scenario registry 驱动真实 Browser，浏览器侧事实与 token-protected oracle 对账 |

跨源 iframe 若当前 CDP 坐标无法可靠映射，D1 的正确结果是保存 `physical_input_scope_unsupported` 并阻止链冻结；不得用 JavaScript `click()` 伪装通过。

D1 退出只证明测试站和浏览器 primitives；可选准备动作的正式 TaskChain 图在 D3 完成后由 D5 验收。

## 4. D2 · Function 实施

### 4.1 修改文件

| 文件 | 改动 |
| --- | --- |
| root/package lock | 只给 `@browser-capture/runtime` 固定 `quickjs-emscripten@0.32.0` |
| `packages/contracts/src/task-chain/node.ts` | FunctionNodeV2 schema/type |
| `packages/contracts/src/task-chain/chain.ts` | stable/v2 union 与校验 |
| `packages/contracts/src/task-chain/index.ts` | 导出 v1/v2 类型 |
| 新 `packages/runtime/src/task-chain/function.ts` | QuickJS module 复用、per-call runtime/context、limits、JSON bridge、finally dispose |
| 新 `scripts/accept-d2-function-platform.mjs` | 在当前主机运行同一 Function 验收集，记录 Node/OS/arch、依赖版本、限制结果和清理结果；不得包含环境变量值或业务数据 |
| `packages/runtime/src/task-chain/runtime.ts` | dispatch function；success 才校验 output/write |
| `packages/runtime/src/task-chain/types.ts` | 不增加外部 function capability；Function 由 runtime 内建执行 |
| `apps/api/src/upstream-browser/hybrid-schema.ts` | `FunctionDraft`/function segment，禁止图字段 |
| `apps/api/src/upstream-browser/hybrid-materializer.ts` | 校验 draft/examples 后物化 FunctionNodeV2 |
| `apps/workbench/src/taskChainProjection.ts`、`LiveChain.tsx` | Function 卡片、源码 digest、输入输出和运行错误；默认不展开完整源码 |

### 4.2 必测不变量

- 同输入、同源码输出字节一致；Date/random 不可用。
- 无限循环被 interrupt，timeout 后后续 Function 仍可运行。
- 不能读取 env/fs/network/process/Browser。
- input mutation 不回写运行上下文。
- 非 JSON、超大输出、schema 不符、OOM 有唯一错误码。
- 每次 context/runtime dispose；取消后无活跃 QuickJS execution。
- modelCalls 和 browserCommands 都为 0。

### 4.3 跨平台准入门

- 使用同一 commit、同一 `package-lock.json`、同一 Node 24 主版本和同一验收脚本，分别在 Windows x64 与真实 macOS arm64 runner/设备运行；如果产品声明支持 Intel Mac，再增加 macOS x64。
- 两个平台都必须覆盖：正常 JSON 输入输出、无限循环中断、timeout 后再次执行、heap 上限、stack 上限、非法/超大输出、禁止宿主能力、取消以及 runtime/context 释放。
- 记录 `process.platform`、`process.arch`、Node 版本、`quickjs-emscripten` 版本、commit 与测试摘要。平台执行日志可以留在忽略目录，结论和 digest 写入 D 验收文档。
- 任一必需平台失败或未执行，D2 和整个 D 都保持未完成。失败时保存证据并停下，不得改用 `node:vm`、宿主 `eval` 或未隔离 local runner。

## 5. D3 · Branch 与准备动作图

### 5.1 修改文件

| 文件 | 改动 |
| --- | --- |
| contracts `node.ts/chain.ts/run.ts` | v2 port、N-case/default/failed、运行事件动态 outcome |
| runtime `compiler.ts/runtime.ts` | `edge.port` 索引、ordered first-match、default/failed |
| API `hybrid-authority.ts/hybrid-schema.ts/hybrid-materializer.ts` | N-way intent、port 对账和 v2 物化 |
| vendor `request.py/controls.py/compiler.py` | 编译多路控制意图；不得退化为多个二元 branch |
| Workbench `taskChainProjection.ts/LiveChain.tsx` | 动态 port 边和 case 顺序 |

### 5.2 可选准备动作图

编译器不新增 popup 节点。它把有充分因果证据的准备动作物化为普通图：

```text
browser.target-readiness(originalTarget)
  └─ Branch ready / missing / blocked / ambiguous
       ready     -> original business action
       missing   -> optional preparation action (max once)
       blocked   -> optional preparation action (max once)
       ambiguous -> failed terminal

optional preparation action
  -> browser.target-readiness(originalTarget)
  -> Branch ready / default
       ready   -> original business action
       default -> failed terminal(optional_preparation_ineffective)
```

编译 authority 新增的 `preparations[]` 只包含 `id/actionSegmentId/consumerSegmentId/proofRefs`；触发 port、节点 id、edge 和预算由宿主确定。准入必须同时有准备前 consumer 不就绪、准备动作真实派发、准备后 consumer 唯一就绪三份同 document 因果证据。缺一项就是 `not_compilable`。

## 6. D4 · 显式 LLM 实施

### 6.1 声明与 prompt

在已确认的 step authority 增加 `semanticOperations[]`，每项只有：

```text
id
clauseRefs
purpose
instruction
inputDescription
resultSchema
candidateIds | null
```

这些字段由需求/计划阶段形成并随用户确认版本保存。预执行后的 annotation 只能绑定 `inputFieldRefs` 和证据，不能新增 semantic operation。没有 authority 就输出 `explicit_llm_declaration_missing` gap。

编译器以 operation 的 instruction、inputDescription、resultSchema、candidateIds 生成节点专属 systemPrompt；生成发生一次并写入 TaskChain。运行输入不进入 systemPrompt digest。

### 6.2 修改文件

| 文件 | 改动 |
| --- | --- |
| contracts `node.ts` | LlmNodeV2，无 delegate，固定 systemPrompt + 单 input/result |
| contracts `run.ts` | 一次调用审计；禁止 browserCommands 字段成为成功条件 |
| runtime `runtime.ts` | v2 每节点只调用一次；v1 delegated path 只服务历史读取/显式旧执行政策，不被 v2 writer 使用 |
| API `hybrid-authority.ts` | 已确认 semanticOperations |
| API `hybrid-schema.ts` | annotation 只能引用已声明 operation |
| API `hybrid-materializer.ts/hybrid-summary.ts` | 保存 task-specific systemPrompt，不再调用 `semanticInstruction(purpose)` 生成通用 prompt |
| API `ai/model.ts` | 增加 systemPrompt + 独立 user JSON message 的 structured call；保留现有 authoring prompt API |
| API `task-chain/runtime-host.ts` | 删除 ```${instruction}\n\n输入：...``` 拼接；解析严格 `{result}` envelope |
| Workbench `LiveChain.tsx` | 显示“显式 LLM”、prompt digest/全文、result contract、实际调用数；编辑即新版本 |

### 6.3 必测不变量

- 相同链版本换输入，systemPrompt digest 不变。
- provider 只收到固定 systemPrompt + 一条输入 JSON message。
- 成功 envelope 恰好一个 `result`；多字段、缺字段、schema 不符失败。
- 每次到达节点 `reportedInvocations=1`；绕过为 0；provider 重试不能被隐瞒。
- 无 browser command、Tools、delegate 或第二轮模型调用。
- LLM timeout/cancel 后不执行后续 Branch；恢复规则不重复已完成调用。

## 7. D5 · 固定验收，不临场换题

### 7.1 受控验收

1. D1 全部场景在可见 Chromium 跑一次，保留 screenshot、TaskRun、event/dialog/scroll evidence 和 oracle 对账。
2. 同一场景集 headless 跑一次；可见与 headless 结果逐 scenarioId 对齐。
3. 本地商品卡任务：读取商品/品牌/店铺/价格；Function 执行已确认的字符串与价格规则，输出 `official/candidate/reject`；N-way Branch 路由。整个运行 0 模型。
4. 本地语义任务：读取三条结构相同但语义不同的商品描述；一个 LLM 输出 `product/accessory/service/uncertain`，Branch 路由，恰好一次模型调用。

### 7.2 真实公共页面验收

固定使用公开 GitHub Issues，不临时寻找其他站点：

- 仓库：`browser-use/browser-use`。
- 页面输入：由运行参数提供的公开 issues 查询 URL。
- 普通节点读取当前页前三条 issue 的稳定 candidate id、标题、labels 和 URL。
- 显式 LLM 任务：仅根据这三条输入，选择“最直接涉及浏览器交互可靠性问题”的一条；唯一 `result` 为 `candidate_1 | candidate_2 | candidate_3 | none`。
- 固定 Branch 四路；命中 candidate 时普通浏览器节点打开对应 issue，`none` 直接完成无选择结果。
- verification 使用另一条合法 issues 查询 URL；同一 chain version、同一 systemPrompt digest，再运行一次。

节点 systemPrompt 必须保存以下业务含义，但候选正文作为运行输入单独传递：

```text
你将收到按展示顺序排列的三个公开 GitHub issue 候选，只依据输入中的标题和 labels，选择最直接描述浏览器交互可靠性故障的一条。
返回 candidate_1、candidate_2、candidate_3 或 none 中的一个；不要解释，不要返回置信度或其他字段。
```

该任务不允许用已有 `bug` label、关键词包含或预先知道的 issue 编号替代语义判断；也不允许让 LLM 打开网页。

独立验收者必须在证据中查看本次三个候选及唯一 result，人工判断结果是否符合 prompt；不得再调用第二个产品模型充当 judge。自动门只证明 result 属于候选、Branch port 与打开 URL 一致、业务后态成立和调用数正确。

### 7.3 验收产物

新建 `docs/development/evidence/browser-replay-repair/D_ACCEPTANCE_CONFORMANCE.md`，只记录真实结果：

- checkout/commit/dirty disposition；
- chain id/version/digest 和 stable/v2；
- sample/verification 输入 digest 与业务输出；
- 每节点 port、Function source digest、LLM systemPrompt digest；
- browserCommands、modelCalls、provider reportedInvocations；
- 可见/headless场景对账；
- Browser/runner/QuickJS 清理结果；
- 基线失败、未测项和产品限制。

## 8. 开发顺序和最小验证

每包只在完成对应实现后运行一次定点验证，不预先跑根级全量：

| 顺序 | 产物 | 最小验证 |
| --- | --- | --- |
| D1-a | React/Radix test site + scenario contract | `npx tsx --test apps/browser-replay-lab/tests/scenario-contract.test.ts` |
| D1-b | physical input/dialog/hit/scroll facts | `node scripts/accept-d1-replay-lab.mjs --headed`，随后一次 `--headless` |
| D2-a | stable/v2 + Function/QuickJS | `npx tsx --test packages/contracts/tests/task-chain-v2.test.ts packages/runtime/tests/function-node.test.ts`；两包 typecheck |
| D2-b | Windows + macOS 平台准入 | 在同一 commit/lockfile 上分别运行 `node scripts/accept-d2-function-platform.mjs`；至少 Windows x64、macOS arm64，结果汇入 D 验收文档 |
| D3 | dynamic Branch + materializer/UI | `npx tsx --test packages/runtime/tests/branch-v2.test.ts apps/api/tests/hybrid-v2-materializer.test.ts apps/workbench/tests/task-chain-v2-projection.test.ts`；所属包 typecheck |
| D4 | fixed prompt/single result LLM | `npx tsx --test packages/runtime/tests/explicit-llm-v2.test.ts apps/api/tests/explicit-llm-runtime.test.ts`；所属包 typecheck |
| D5 | 正式受控和真实任务 | `node scripts/accept-d-task.mjs`；完成后 `node vendor/workflow-use/verify-source.mjs` 和 `git diff --check` |

PowerShell 中不要把环境专属 Python 绝对路径写进文档或源码。以 `scripts/setup-upstream-browser-runner.mjs` 解析出的当前环境执行；命令需显式以仓库根目录为 workdir。

## 9. 完成判定

D 只有同时满足下列条件才能写完成：

1. stable/v1 原字节可读，stable/v2 新 writer/reader/runtime/UI 闭合；
2. D1 25 个 scenario id 的可见与 headless 结果闭合；
3. Function 隔离、限制、错误与清理在 Windows x64 与 macOS arm64 上使用同一套验收通过；产品若支持 Intel Mac，macOS x64 也通过；
4. N-way Branch 的 first-match/default/failed 和动态 port 通过；
5. LLM 节点固定 prompt、单 input、单 result、单次调用、零 Browser 权限通过；
6. GitHub sample + different-input verification 使用同一 chain/prompt，业务结果真实；
7. 普通路径 0 模型，显式节点实际 1 次；
8. 没有残留 Browser/runner/QuickJS execution；
9. 只新增通用平台能力和测试夹具，没有站点 special case 进入生产源码；
10. 证据文档明确区分通过、基线失败、阻塞和未测项。

任一项缺失，D 状态保持“进行中”；不得以类型检查、mock、fixture、provider 返回成功或旧 C 证据替代。
