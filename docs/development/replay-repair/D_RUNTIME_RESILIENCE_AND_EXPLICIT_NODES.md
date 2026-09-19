# D · 复跑干扰、Function、Branch 与显式 LLM 节点

状态：待开发。本文件替代原“显式 b-u LLM 节点”方案；本轮只冻结设计，不实现代码。全新开发 session 必须同时遵循 [D 实施交接](D_IMPLEMENTATION_HANDOFF.md)，其中固定了 exact schema、文件范围、错误码、场景 ID、验证命令和真实验收任务。

## 1. 本阶段要交付什么

D 是一个连续开发阶段，按 D1 → D2 → D3 → D4 → D5 完成，不拆成按周项目：

1. D1：建立 React + Radix UI 的真实干扰测试站，并把可证明的干扰处理接入普通复跑。
2. D2：新增受限 `function` 节点，执行确定性的链路内数据函数。
3. D3：把二元 `branch` 升级为有序多路分支。
4. D4：把 `llm` 收敛为显式、单次、单值的语义判断节点。
5. D5：经正式 TaskChain 入口完成受控页面、真实页面和不同输入的独立验收。

D 结束后，B-A-T 才具备跑真实自动化任务所需的四块剩余能力：真实干扰证据、确定性函数、多路控制流和明确声明的语义判断。

Product Alignment:
- natural-language task: 把首次 browser-use 完成的浏览器任务编译成可保存、可换输入复跑的链路，并在页面干扰、确定性计算和必要语义判断下继续按图执行。
- reusable chain boundary: 当前任务步骤的一条版本化 TaskChain；干扰准备动作、函数、分支和 LLM 都是通用节点或能力，不拥有网站业务概念。
- runtime inputs: TaskChain 输入、前序节点输出、当前页面事实和显式 LLM 节点输入。
- dynamic task outputs: 当前页面产生的业务结果、函数结果、所选分支及 LLM 的一个类型化结果值。
- generic platform capability used: browser capability、值绑定、LangGraph 图推进、运行审计、QuickJS 沙箱和 AI Connect 模型桥。
- replay model calls: 普通路径为 0；只有图实际到达显式 `llm` 节点时为 1 次/节点。
- site/task-specific code added: no

## 2. 三个阶段词义

- **预执行**：browser-use 用代表输入实际完成任务，B-A-T 记录动作、观察、结果和来源证据。
- **编译**：预执行结束后，B-A-T 把已确认需求、TaskPlan 和成功证据物化为版本化 TaskChain；节点、提示词、输入输出和连线在此时确定并保存。
- **运行**：普通执行器加载已保存 TaskChain，绑定本次输入并按图复跑；运行时不得临时加节点、写提示词或把失败升级成 LLM。

## 3. 已冻结的边界

1. 弹窗、遮挡和滚动失败不是 LLM 兜底问题。运行时只处理已编译的确定性动作；没有安全处理证据就失败并保存事实，后续修复产生新链路版本。
2. DOM 的 `role=dialog`、蒙层样式、关闭图标或文案不能证明它是可关闭干扰。平台只能证明 native dialog 事件、目标是否存在、命中关系、滚动事实和后态是否成立。
3. `llm` 不是 browser-use Agent。它不控制浏览器、不调用工具、不多轮找路，只读取已绑定输入并返回一个类型化值。
4. `function` 与 `capability` 不同：`capability` 调用平台注册的版本化能力；`function` 执行随链路版本保存的纯数据函数。
5. `branch` 不再固定为 true/false。它按顺序判断 N 个 case，并有一个必需的 default；N 只受整图节点/边预算约束，不额外写死成两路或十路。
6. 新 writer 产出 `stable/v2`；现有 `stable/v1` 和历史链保持只读兼容，不在载入时改写原字节或伪造新节点语义。

## 4. D1 · React 干扰实验站与确定性处理

### 4.1 测试站

新增独立测试应用 `apps/browser-replay-lab/`，不挂入生产 Workbench 路由。复用仓库已有 React 19、Vite 7、Radix Themes、Radix 组件和 Lucide；不再引入另一套组件库。

每个场景都有独立 URL、固定 seed、出现阶段和可重复时序，例如：

```text
/scenarios/ad-interstitial?seed=3&show=pre-action
/scenarios/sticky-banner?seed=4&show=post-action
/scenarios/native-confirm?response=accept
```

页面同时提供两种事实源：

- 正式浏览器侧：DOM、CDP 事件、真实 `event.target`、`composedPath()`、scroll/wheel 事件和业务后态。
- 夹具 oracle：场景状态、实际副作用次数和预期结果，只用于验收对账，不能被生产运行器读取为答案。

“不定期出现”用 seed 和明确时序复现，不使用不可回放的真随机。跨 iframe 场景由第二个 loopback origin 提供，其余场景保持同源。

### 4.2 场景矩阵

| 组 | 必须覆盖的真实页面情况 |
| --- | --- |
| 出现时机 | 首屏已有、目标出现前延迟弹出、点击后弹出、仅部分 seed 出现、关闭后再次出现 |
| 原生对话框 | `alert`、`confirm`、`prompt`、离页 `beforeunload` |
| 广告与营销 | 全屏广告、倒计时后才有关闭按钮、React Portal 模态框、重复广告、嵌套 SVG 关闭图标、同页多个“关闭”按钮 |
| 局部遮挡 | cookie banner、sticky header/footer、聊天浮球、toast/snackbar、透明但接收 pointer 的 overlay、动画中 overlay |
| 文档边界 | same-origin iframe、cross-origin iframe、Shadow DOM、关闭后目标被替换为新 DOM |
| 滚动与焦点 | `overflow:hidden`、`position:fixed` 锁滚、wheel `preventDefault`、已到边界、嵌套滚动容器、focus trap、`inert`/disabled 目标 |
| 不能误关 | 提交/删除/付款确认、登录、验证码、权限请求、地区/年龄门、任务本身需要操作的菜单与 popover |

每个场景至少提供：无干扰基线、预执行有/运行无、预执行无/运行有、预执行有/运行有。不是所有页面都必须继续成功；“正确失败且证据完整”是未知干扰的预期结果。

### 4.3 普通复跑的处理算法

对每个可能受干扰的业务动作，只执行以下固定流程：

1. 解析原业务目标并检查消费就绪；就绪则直接执行，不能为了“可能有广告”扫描全页。
2. 目标缺失或中心命中不属于目标时，记录 document/frame、意图目标、`elementFromPoint` 命中、事件来源、滚动位置和 native dialog 事件。
3. 若该链版本保存了预执行已经证明的“可选准备动作”，尝试唯一解析其目标并最多派发一次；随后必须重新验证原业务目标。
4. 准备动作在本次运行不存在，但原业务目标已经可操作：跳过准备动作。
5. 没有保存的准备动作、准备目标不唯一、处理后原目标仍不可操作，或出现未声明 native confirm/prompt：当前运行失败，保存干扰证据，不猜关闭按钮、不调用 LLM。
6. 登录、验证码、一次性码、权限或用户确认按既有人工等待合同暂停；业务确认按任务语义执行，不归类为广告弹窗。

可选准备动作的编译依据不是“它长得像弹窗”，而是预执行证据证明：该动作之后，同一个下游业务目标由不可消费变为可消费，且没有未决业务副作用。

### 4.4 点击与滚动的验收要求

- 点击派发前必须做命中测试；实际派发使用当前 Browser 的真实坐标输入通路，并在所属 document 捕获 trusted event。合成 click 不能作为“模拟人类点击”的通过证据。
- `event.target` 与意图目标不一致时，不得把 ActionResult success 当作业务成功。
- scroll 保存前后坐标、可滚动范围、wheel/scroll 事件和目标容器，明确区分无范围、边界、CSS 锁定、事件取消和错误容器。
- native dialog 使用单一 action-scoped bridge 记账；预执行未声明的 confirm/prompt 不自动 accept/dismiss。

### 4.5 D1 退出门

- 可见 Chromium 中逐组展示场景、实际点击/滚动、事件目标和最终页面后态；保留截图与结构化运行证据。
- 同一场景集在 headless 回归中复跑，结果与 oracle 对账；headless 通过不能代替可见浏览器证据。
- 三种用户指定组合全部有明确结果：有→无可跳过，无→有未知则证据化失败，有→有执行已证明准备动作后继续。
- 一个 Browser 会话、普通能力路径 0 模型调用，结束后无残留 Browser/runner。D1 只关闭测试站和 browser primitives；正式 TaskChain 准备动作图在 D3 后由 D5 关闭，不能提前宣称完成。

## 5. D2 · Function 节点

### 5.1 合同

`function` 是 `stable/v2` 的正式节点，最小字段为：

```text
kind = function
language = javascript
source = 随链路版本保存的函数源码
inputs = 命名 ValueBinding
outputContract = 一个 TaskDataContract
timeoutMs = 有界时间
outcomes = success | timeout | failed | cancelled
```

函数签名固定为 `main(inputs) -> JSON value`。输入和输出都经过 Zod/TaskDataContract 校验；结果作为一个节点值交给后续节点。函数不能直接跳转、返回节点 ID 或修改图。

### 5.2 执行边界

选择 `quickjs-emscripten@0.32.0` 的 QuickJS/WASM 作为 Windows 与 macOS 共用的隔离执行器，B-A-T 只写 TaskChain 适配层。禁止使用 `node:vm` 充当安全边界，也不自研解释器。

默认环境没有网络、文件系统、环境变量、进程、Browser、模型、当前时间和随机数；需要的值都必须作为输入绑定传入。限制执行时间、内存、源码长度和输出大小，超限进入明确出口。安装后使用同一 commit、同一 lockfile 和同一测试集，至少在 Node 24/Windows x64 与 Node 24/macOS arm64 做 focused spike；如果产品声明支持 Intel Mac，再增加 macOS x64。任一必需平台不满足中断、内存、栈、隔离或清理要求，D2 都必须停止并重新做 Reuse Assessment，不能降级为宿主 `eval`，也不能把另一平台通过当作替代证据。

### 5.3 用途

适合字符串规范化、数组映射/过滤/排序、品牌和店名确定性匹配、字段派生等规则计算。已有注册能力能完成的工作继续用 `capability`；简单等值、存在性和长度判断直接用 `branch`，不强迫写函数。

## 6. D3 · 多路 Branch 节点

### 6.1 合同

`stable/v2` 的 `branch` 保存有序 `cases[]`：每项包含稳定 `id`、展示名和类型化 predicate；另有一个必需的 `default` port 和一个技术 `failed` port。

运行时从上到下判断，第一条命中即返回该 case id；全部不命中走 default。边以 branch port id 连接后续节点。case 数量只服从 TaskChain 现有的总节点、总边和预算上限。

### 6.2 兼容与审计

- `stable/v1` 的 `true/false/failed` 原样读取；新 writer 不再生成二元专用结构。
- 编译器、合同、runtime、Workbench 画布和事件审计使用同一 port id，不把多路分支展开成用户不可见的二元节点串。
- 分支只判断现有值，不调用模型。LLM 判断必须先由显式 `llm` 产出一个值，再由 branch 路由。

示例：Function 对店名执行确定性规则，返回 `official | candidate | reject`；Branch 分别进入保留、进一步检查和跳过路径。不能因为实现者不想写规则就改成 LLM。

## 7. D4 · 显式 LLM 语义节点

### 7.1 谁声明

1. 用户在需求中明确需要语义判断，或接受 B-A-T 在任务计划阶段提出的“此步骤需要模型”建议。
2. 已确认 TaskPlan 保存该语义步骤、输入含义、唯一输出含义和允许值。
3. 编译器据此物化 `llm` 节点；用户可在链路详情看到并修改/确认其固定 prompt。
4. 运行时只按图执行，不能因 selector 失败、弹窗、等待超时或任何普通错误临时声明 LLM 节点。

B-A-T 可以在编译时提出节点，不能静默加入；真正的声明事实属于已确认计划和保存的 TaskChain 版本。

### 7.2 Prompt 与输入输出

- prompt 在编译时生成、校验并随链路版本保存；运行时不临时拼任务说明，只把已绑定的一个 JSON 输入值交给固定 prompt。
- 节点只输出一个名为 `result` 的类型化值。路由场景优先使用 boolean 或 enum；不得让模型同时返回 `decision/reason/confidence/status` 等多个字段。
- 错误、超时、取消、token 和模型身份属于运行审计，不是模型输出字段。
- 如果业务本身要求摘要或一个结构化对象，该对象仍是唯一 `result`；不得为平台记账再要求模型补字段。
- 当前页面信息必须先由普通观察/读取节点形成输入；需要视觉时绑定一份受控截图产物。LLM 不直接操作 Browser。

### 7.3 执行边界

- 一个 `llm` 节点最多一次 provider invocation，无 Tools、无 Agent loop、无 `delegate`、无浏览器命令。
- 现有稳定节点的 `delegate` 在 `stable/v2` writer 中移除；旧链只读兼容。
- 成功结果先按 `outputContract` 校验，再写入 `nodeOutputs[nodeId]`；后续 Function/Branch 通过普通值绑定消费。
- 模型、prompt digest、输入 digest、输出 digest、token、耗时和状态进入现有审计；审计记录不得要求模型生成。

### 7.4 何时该用、何时不该用

| 问题 | 节点 |
| --- | --- |
| 店名是否同时含品牌名和“旗舰店” | Function 或 Branch，0 模型 |
| 价格是否在 1000–2000 元 | Branch，0 模型 |
| 商品描述实际是整机、配件还是安装服务，且没有可靠结构字段 | 显式 LLM 输出 `product/accessory/service/uncertain` |
| 目标被广告蒙层遮住 | D1 普通干扰处理或证据化失败 |
| selector、等待或滚动失败 | 普通节点失败并迭代新链版本 |

## 8. D5 · 接线与独立验收

### 8.1 实现接线

| 层 | 修改范围 |
| --- | --- |
| contracts | `stable/v2`、Function、N-way Branch、单值 LLM、动态 branch port 和 v1 只读兼容 |
| runtime | QuickJS adapter、case 选择、单次 LLM 校验/审计；图推进仍只由 LangGraph 承担 |
| browser adapter | D1 的命中、trusted event、scroll、native dialog 和可选准备动作证据 |
| compiler/materializer | 从已确认计划与预执行证据确定性生成准备动作、Function、Branch 和显式 LLM |
| Workbench | 新节点卡、输入输出、case port、固定 prompt 与模型调用标识；支持单节点试跑和只读历史链 |
| evidence | 可见 Chromium、headless 回归、正式 TaskRun、业务输出、模型审计和资源清理 |

### 8.2 最小独立验收

1. 干扰实验站：D1 全矩阵经正式 TaskChain 运行，未知干扰不调用模型。
2. 纯确定性链：读取商品卡 → Function 规范化/规则判断 → 三路 Branch → 输出；样本和不同输入均 0 模型。
3. 显式语义链：普通读取 → 一个 LLM `result` → 多路 Branch → 普通后续动作；每次经过该节点恰好一条模型审计，绕过该节点为 0。
4. 失败边界：Function 超时/越界、LLM 非法输出/超时、Branch default、运行取消和恢复都有明确出口，不重复浏览器副作用。
5. 真实公共页面固定使用实施交接定义的 `browser-use/browser-use` Issues 三候选语义选择任务；同一链版本和 prompt digest 使用不同查询 URL 再次复跑。不得临场换题，夹具通过不能单独关闭 D。

### 8.3 D 完成条件

- `stable/v2` 的保存、加载、画布、执行、审计和历史只读边界全部闭合。
- D1–D4 每项都有正式入口的独立证据，D5 的真实页面复跑完成。
- 普通路径实际模型调用为 0；每个显式 LLM 节点实际调用数为 1，且没有浏览器工具调用。
- 运行结束后 Browser、runner、QuickJS runtime 和临时产物均关闭；无敏感页面原文进入 Git。
- 失败必须落到具体节点和事实，不能以整任务重新探索或模型临时接管掩盖。

## 9. 参考实现取舍

- Dify 把 LLM、Code、IF/ELSE 和错误出口分成独立节点；规则格式化不交给 LLM。B-A-T 采用这种职责分离，但不复制其图运行时。
- Coze Studio 使用动态 branch port、default port 和 exception port；Code 节点需要独立 sandbox。B-A-T 采用 port 语义与隔离边界，但继续使用自身 TaskChain/LangGraph。
- Dify Sandbox 依赖 Linux seccomp/chroot，不能直接作为本项目 Windows/macOS 本地运行的默认实现；D2 采用 QuickJS/WASM。Coze 的 sandbox/local 双模式说明本地直跑不是安全隔离，B-A-T 不提供不隔离降级。

官方依据：

- [Dify Workflow 快速入门：LLM、IF/ELSE、模板和结构化输出](https://docs.dify.ai/en/guides/application-orchestrate/creating-an-application)
- [Dify 节点错误分支](https://docs.dify.ai/zh/use-dify/build/predefined-error-handling-logic)
- [Coze Studio 多路 port 与 default/exception branch](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-%28backend%29/e4f740cd15c24f89fb9289592420bdc706fc02b5)
- [Coze Studio Code Runner sandbox 配置](https://github.com/coze-dev/coze-studio/wiki/5.-%E5%9F%BA%E7%A1%80%E7%BB%84%E4%BB%B6%E9%85%8D%E7%BD%AE/a95a5bcb378ffed2e75add220aa969cbba0ddb0d)
- [Dify Sandbox](https://github.com/langgenius/dify-sandbox)
- [QuickJS Emscripten](https://github.com/justjake/quickjs-emscripten)
