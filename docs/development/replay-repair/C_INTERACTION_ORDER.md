# C · 交互执行与异步顺序

## 当前状态

A、B、C 已通过；D 尚未进入。B 的 ResultSpec、ResultBinding、稳定目标、ConsumerReadiness、缺失目标结果和空列表分支
在 C 中被原样复用，没有重做第二套读取或输出机制。C 的实现与独立验收结果见
[C 阶段交互顺序独立验收](../evidence/browser-replay-repair/C_ACCEPTANCE_CONFORMANCE.md)。

本文件是 B 通过后的收缩基线。C 只负责浏览器动作从准备、派发到真实后态确认，以及取消/恢复时的副作用边界。

```text
Product Alignment:
- natural-language task: 对已编译的浏览器步骤可靠执行定位、滚动、点击、输入、选择、按键、等待、分页与详情往返
- reusable chain boundary: 动作前准备 → 单次派发 → 具体后态观察 → 交付或保留未决效果
- runtime inputs: 当前 session/tab/document、B 提供的稳定目标、动作参数、前置条件、后态 ReadSpec/条件和运行控制
- dynamic task outputs: 动作结果、浏览器后态、派发审计、完成/未决状态，以及 B ResultBinding 装配的业务结果
- generic platform capability used: 现有 TaskChain data/condition/branch、LangGraph、BrowserSkill、StepVerifier/Tenacity 与检查点
- replay model calls: 0；只有后续 D 的显式 llm 节点可以调用模型
- site/task-specific code added: no
```

## C 完成后的产品结果

一条保存下来的 TaskChain 能在真实浏览器中执行点击、滚动、输入、选择、翻页、进入详情和返回；每个业务动作只派发一次，
并且只在所需页面后态真实满足后读取和推进。慢响应、布局移动、遮挡、同 URL 更新、document 替换、取消和恢复不会造成错点、
读取旧数据或重复提交。普通复跑模型调用保持为 0。

GitHub Issues 代表任务在 C 通过后的可观察顺序是：

```text
打开搜索结果
→ 等待第一页真实就绪并读取
→ 定位分页目标，必要时滚动
→ 点击下一页一次
→ 等待新页身份与必要字段就绪
→ 读取第二页
→ 打开第一条详情一次
→ 等待详情字段就绪并读取
→ 必要时返回并核验列表位置
→ 交付 B 已定义的业务结果
```

## 与 B、D 的固定边界

| 阶段 | 拥有的职责 | C 的处理 |
| --- | --- | --- |
| B | ResultSpec、ResultBinding、稳定目标、ReadSpec、ConsumerReadiness、缺失数据分支、结果装配 | 直接消费，不复制、不改写第二套输出机制 |
| C | 动作前准备、单次派发、具体后态等待、时序推进、未决效果、取消与恢复 | 当前实现和验收范围 |
| D | 任务链中显式、有界的局部模型判断 | C 不进入；C 普通节点模型调用必须为 0 |

B 中已经出现过分页等待和缺失目标分支，只证明它们足以支持 B 的读取结果，不代表 C 的慢响应、遮挡、动作计数和恢复语义已通过。

## 已有基础：复用而不是重写

当前真实入口已经具备以下结构，C 先验证其语义，只在证据显示缺口时做最小修改：

1. `hybrid_main.py` 将 `StepCommand` 交给 `OrdinaryCapability.execute_checked()`。
2. `execute_checked()` 先采集检查基线，再调用一次 `execute()`，最后等待声明的后态。
3. `TargetResolver` 使用稳定目标；必要滚动后重新抓取 DOM 映射并核验页面身份。
4. `ConsumerReadiness/read_fields` 可作为分页、导航和详情读取的具体后态，而不是使用固定秒数或 URL-only 完成。
5. `TaskChainRuntime` 已拥有取消信号、检查点和未决副作用状态；C 只补齐浏览器现场核验与不重复派发所需的最小连接。
6. 动作执行继续复用 browser-use `Tools.act`，图推进继续复用 LangGraph，不增加第二套动作引擎或状态机。

## 实现范围（已关闭）

### 1. 动作前准备与命中核验

- 使用本次 session/tab/document；URL 只承担地址与作用域核验。
- 目标必须唯一、可见、可用并满足真实命中关系；允许目标子节点命中，拒绝遮挡或错误焦点。
- 布局变化、滚动或 document 替换后重新定位，不能复用旧索引或像素坐标。
- 目标缺失时观察实际状态并按预算退出；缺失结果不得变成盲滚或错误点击。

### 2. 滚动与懒加载

- 目标在 DOM 中时滚动正确窗口或嵌套容器；已经可操作时不多滚。
- 懒加载复用现有动作、观察与 LangGraph 循环；检查内容进展、加载状态、触底和目标出现。
- 正在加载则等待；无进展按预算有限退出。禁止固定滚动次数和探索像素坐标。

### 3. 单次派发与具体后态

- 业务动作位于观察重试之外；重试只能重复定位准备或后态检查，不能重复点击、输入、提交或翻页。
- 导航等待生命周期及所需 DOM；同 URL 更新不能仅靠 URL/title 判断完成。
- 翻页等待新页身份与必要字段，旧列表仍显示不能满足下一页读取条件。
- 输入、选择和按键核验本次值、焦点及其触发的异步结果。
- 已满足后态可以直接继续；不统一要求页面必须变化。

### 4. 取消、未决效果与恢复

- 取消传播到定位和观察等待。
- 动作派发后结果不明时记录未决效果，不把它当作成功或安全失败。
- 恢复继续同一运行，先核验当前浏览器状态和未决动作结果；不能通过重放整段链路重复业务副作用。
- document 替换后旧目标、旧检查基线和旧 DOM 映射全部失效。

## 修改位置

优先修改现有实现；只有现有命令无法表达已验证的通用语义时才增加最小内部字段。

| 文件 | 剩余职责 |
| --- | --- |
| `vendor/workflow-use/workflows/workflow_use/hybrid/capability.py` | 动作准备、单次派发和结果交付边界 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/targets.py` | 稳定目标、页面身份、滚动后重定位与命中核验 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/target_scroll.py` | 正确窗口/容器滚动和进展证据 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/postconditions.py` | 动作前基线、具体后态、观察预算和取消 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/visible_wait.py` | 可见性等待的既有 browser-use 工具适配 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/natural_effects.py`、`post_action_target.py` | 探索证据中的实际效果与后态目标 |
| `vendor/workflow-use/workflows/workflow_use/hybrid/natural_compile.py`、`visible_wait_compile.py`、`causal.py` | 从已验证事实建立前置/后态与辅助动作归属 |
| `apps/api/src/upstream-browser/hybrid-protocol.ts`、`hybrid-materializer.ts`、`hybrid-runtime.ts`、`hybrid-runtime-scope.ts` | 跨进程协议验证、最小物化和运行时结果映射 |
| `apps/api/python/browser_use_runner/hybrid_main.py` | 单一浏览器会话中的命令入口和最终作用域核验 |
| `packages/runtime/src/task-chain/` | 仅在现有未决效果/恢复合同存在真实缺口时最小补齐 |

禁止为了 C 修改 ResultSpec/ResultBinding 语义、增加网站类型、引入公式语言或创建第二套运行时。

## 实施顺序

以下步骤顺序执行，不是并列架构任务：

1. 用当前代码建立“需求 → 入口 → 已有行为 → 缺口 → 最小验证”的审计表；已满足项不改。
2. 先关闭动作前准备、正确滚动和命中核验缺口。
3. 再关闭单次派发后的具体后态等待，覆盖分页、同 URL 更新和输入结果。
4. 最后关闭取消、未决效果和恢复不重复副作用。
5. 代码稳定后运行一次受控竞态验收；通过后再运行一次新的真实可见 Chrome C 验收。

同一错误连续修复仍不通过时停止撞补丁，重新检查目标证据、后态条件或控制流归属。

## 独立验收

| 场景 | 通过条件 | 必须保留的证据 |
| --- | --- | --- |
| 窗口/嵌套容器、布局移动、目标缺失 | 滚对目标；变化后重新定位；不盲滚或错点 | 目标身份、滚动容器、命中结果、派发次数 |
| 即时、延迟超过三秒、永不完成 | 条件满足后推进；动作恰好一次；超时不抢跑 | 动作审计、每次条件读值、退出原因 |
| 导航后延迟 DOM、同 URL 刷新 | 不读取旧列表或未填完整字段 | document/页身份、ConsumerReadiness 读值 |
| 分页、详情返回、懒加载触底 | 页身份、读取顺序和返回位置正确；无进展有限退出 | 页面身份、字段快照、滚动进展与预算 |
| 输入、选择、按键 | 参数、实际值、焦点及异步结果正确 | 派发参数、值/焦点后态、动作次数 |
| 遮挡、取消、document 替换、恢复 | 无错误目标副作用和重复提交；未决状态保留 | 命中/遮挡结果、checkpoint、未决效果、恢复记录 |

所有普通运行必须同时满足：`modelCalls=0`、`llmCalls=0`。受控场景用于稳定复现时序和恢复；真实页面用于证明同一入口完成分页与详情往返，二者不能互相替代。

## C 退出门

C 只有同时满足以下条件才算通过：

1. 上述六类场景的定点验证通过，没有重复执行同一组测试碰运气。
2. 延迟和失败场景中业务动作派发次数可证明为 1；未派发场景为 0。
3. 取消/恢复继续同一运行，能够证明没有重复副作用。
4. 一次新的真实可见 Chrome 任务完成分页、详情读取和必要返回，业务结果正确。
5. 普通复跑模型调用为 0，浏览器会话在 `finally` 中关闭。

通过后才进入 D；C 失败只修 C 所属合同，不重新探索整项任务掩盖局部缺口。

## 2026-09-19 退出结果

- 定点验证覆盖滚动后重绑、document 替换、遮挡/禁用拒绝、单次派发、具体后态和异步取消竞态。
- 受控真实浏览器证明延迟超过三秒与永不完成场景都只派发一次；输入、选择、按键和同 URL document 替换后态正确。
- 取消后保留 `uncertain` pending capability；恢复同一运行没有增加服务器副作用次数。
- 新的真实可见 Chrome GitHub TaskChain 完成 `5/5/详情`，编译 gaps 为 0，普通复跑模型调用为 0。
- 所有 runner/测试 Chrome 在 `finally` 中关闭。C 阶段门已关闭，本轮未进入 D。
