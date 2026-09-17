# A 阶段真实浏览器一致性验收合同

状态：受控页真实矩阵及同一来源的独立持久化审计已通过；实际任务页与变化输入／状态复验尚未完成，A 尚未整体通过。

## 已确认验收缝隙

唯一产品入口是 `TaskChainService.dispatch(generate_chain)`。验收从该入口启动一次 browser-use 探索，经过真实
`Agent -> Tools.act -> BrowserSession` 动作，最终读取正式 source artifact；关闭并重启 Application 后，再通过同一
artifact 读取入口核对保存结果。

页面 oracle 是独立 HTTP 服务收到的真实 DOM 事件报告和业务 handler 副作用。它不读取采集器内部状态，不调用
Python 私有方法，也不根据采集结果反算期望值。动作决策器只根据 Agent 实际观察到的可访问树返回下一项动作，
其成功、judge 文本和工具返回值均不作为验收证据。

## 为什么旧页面不具备准入意义

- 它把故意失效的元素点击放在中段，导致后续 shadow、frame、导航和输入都受前一故障污染。
- 它用导航时可能被取消的 `Image` 请求记录副作用，丢报告与采集失败无法区分。
- 它把所有场景串成单一路径，只覆盖一种 DOM 结构；修改动作序号就会改变结论。
- 它主要断言“采集器产出的形状”，没有逐动作与独立 oracle 的真实事件、页面值和业务副作用对账。
- 它没有覆盖关闭 ShadowRoot 的可见边界、同一 frame 的 document 重建，以及重复输入值造成的绑定歧义。

旧页面因此只能作为开发探针，不能产生 `A passed` 结论。

## 固定原生动作面与分层

对固定 browser-use 0.13.8 的正式 `author_tools()` 做只读注册表检查，当前 schema digest 为
`6e2f3e07660d8b3f094676af7be37da20835cef3ba6b460d0cbbd982ab6fe2d6`，共 22 个动作。A 不再用“总动作数”
代替覆盖，而是要求每个注册动作先有明确采集机制；后续阶段只接管动作的复跑语义，不得使 A 丢弃原参数、结果或
动作前后 Browser 上下文。

| 机制 | 正式动作 | A 受控页的真实反例 | 本阶段结论边界 |
| --- | --- | --- | --- |
| document/tab | `navigate`、`search`、`go_back`、`switch`、`close` | 同页/换 document、点击开 child tab、opener/child 往返及定点关闭 | 记录焦点、完整 tab 清单、前后 URL；`search` 复用相同导航机制，不访问外网搜索页 |
| target DOM event | `click`、`input`、`send_keys`、`select_dropdown` | 嵌套命中、shadow/frame、Enter、原生 select | 逐事件与独立 oracle 对账；`select_dropdown` 的 `input/change` 按 b-u 原生实现允许 `isTrusted=false` |
| scroll | `scroll`、`find_text`、`bat_scroll_to` | 页面滚动与可滚容器、懒加载可见副作用 | A 证明原生 `scroll` 的参数、结果、事件和前后位置；另外两项的目标/完成语义分别留给 B/C |
| target read | `dropdown_options` | 同一 select 的真实 options 与后续选择 | A 保存公开结果并关联控件；字段读取是否可复跑由 B 决定 |
| page/read | `extract`、`search_page`、`find_elements`、`bat_read_fields`、`bat_wait_for`、`bat_summarize` | 注册表穷尽测试；已有各自定点证据不冒充本页业务验收 | A 只保证动作包络不丢；B/C/D 分别验收读取、等待和显式模型语义 |
| artifact | `save_as_pdf` | 当前不以工具返回路径冒充文件副作用 | 在制品引用和文件存在性可由产品边界核验前，A 不得因该动作已注册而宣称制品能力通过 |
| control | `wait`、`done` | 完成动作只在所有真实副作用之后 | 参数/结果保留；等待秒数和 Agent 完成声明均不是业务完成证据 |

`upload_file`、`screenshot`、`evaluate` 和文件读写已被正式 authoring 入口排除；固定版本没有独立 drag 动作，也没有
`download_file` 注册动作。它们是后续公共能力缺口，不得由受控页虚构成“已测”。

采集策略现在由 `action_capture_policy.py` 穷尽约束正式注册表。provider 升级或动作增删时，若未先分类其事件预期和
浏览器边界，定点测试直接失败，避免未知动作静默落入默认分支。

## 通用场景矩阵

| 场景 | 页面变化 | 独立 oracle | source 必须证明 | 能推翻的错误实现 |
| --- | --- | --- | --- | --- |
| 嵌套命中 A/B | 同一语义按钮分别使用 span 与 SVG 结构 | document capture 看到的 target/path；业务 handler 次数 | 实际 target 与 oracle 一致，意图按钮关系可还原 | 把意图目标当实际 target；按标签写死 |
| 单动作多事件 | 一次可信点击同步派发额外脚本 click | 两个事件的 `isTrusted` 与顺序；业务只执行一次 | 两个事件属于同一动作且来源不混淆 | 按回调数生成动作；用 `isTrusted` 丢事件 |
| open/closed shadow | slot 与关闭 root 各一项 | 外层监听可见 target/path；内部 handler 副作用 | open path 可还原；closed 只保存外层可见事实且不伪造内部节点 | 猜测关闭 root 内部 target |
| frame 与重建 | 同源 frame 原地换 document；另有跨源 frame | 各 document 的事件与 handler | frame/document/session 身份正确；重建前后 document 不混合 | 只按 URL 或动作参数关联 |
| 立即导航/删除 | handler 同步删除节点并导航 | keepalive/beacon 事件与服务端副作用 | 旧 document 的局部值已送达；新 document 首个动作可采集 | 动作后再查 DOM 补写上下文 |
| 输入与控制键 | 输入值含 query/fragment 字符 | input 页面实际 value；Enter handler 收到的 value | 原始参数、input/key 事件、页面值和结果引用一致 | 对值截断/摘要替代；只保存最终文本 |
| 页面与容器滚动 | 一次滚动主 document，一次滚动带 index 的 overflow 容器 | `scroll` 事件、实际 scrollY/scrollTop、lazy marker handler | 两个动作参数及结果独立，事件 target 与前后位置正确 | 只测点击；把滚动次数当业务完成；只看工具成功 |
| 原生下拉框 | 先读 options，再选择 Air Express | `input/change`、selected value、页面 output 与 handler | read/choose 关联同一控件；合成事件不被 `isTrusted` 过滤 | 把打开菜单当选择；拒绝原生脚本事件 |
| JS dialog 与 HTML modal | confirm、prompt、`<dialog>` 开关 | b-u 自动处置后的返回值、modal open/close handler | 动作后 `closedPopupMessages` 增量及真实页面结果一致 | 只看按钮 click；混淆系统 dialog 与 DOM 弹层 |
| popup/new tab | opener 点击创建 child，显式切回/切入，使用 child 后只关闭 child | opener/child handler、真实 tab 清单和焦点 | 创建关系、动态 tab_id 参数、switch/close 结果及主流程位置正确 | 冻结历史 tab id；误关主 tab；只看 window.open 返回 |
| 连续同参及缺失事件 | 最终页面连续点击两次后删除，第三次复用同一参数 | 两次 handler，第三次无事件 | 三个动作身份独立；第三次明确为事件缺失 | 按参数摘要搜索或漂移动作身份 |
| 保存加载 | 关闭 Application 后重新打开同一目录 | 无新浏览器动作 | 事件、参数、结果引用和摘要逐字节等价 | 内存对象冒充持久化 |

页面结构 A/B、同源 frame document 重建和两个相同输入字段共同承担“变化状态/歧义输入”复验。故意失效动作
必须位于最后一个浏览器动作，失败之后只允许 `done`，不得再用导航补救夹具。

## 通过规则

1. 整个受控页矩阵只创建一个产品 Browser 会话，不因单个场景失败重启撞运气。
2. 每个动作以稳定 history 位置关联；动作参数相等不能成为关联条件。
3. 每个可产生 DOM 事件的动作，source 事件数、事件来源、实际 target/path 与 oracle 对账。
4. 页面实际 value 和服务端副作用分别核对；`ActionResult`、judge 或进程退出码不能替代它们。
5. 受控页通过只证明 A 的通用浏览器边界；还必须以相同正式入口完成实际任务页面和变化输入/状态复验，
   才能把 A 标记为通过。
6. 若失败，保留本次 source 与 oracle 快照，先定位到监听、关联、保存或夹具中的一个边界；修复前不重跑整条探索。

## Reuse Assessment v2

- capability: 原生动作边界、真实 DOM 事件、局部上下文、公开结果和 source 往返。
- existing implementation in repository: browser-use 原生 `Agent/Tools.act/BrowserSession`；B-A-T 的位置身份、trace、
  artifact 和 SQLite 生命周期；当前动作期 CDP 监听适配器。
- mature candidates and pinned versions: browser-use 0.13.8、workflow-use 0.2.11、cdp-use 固定传递版本。
- selected implementation: b-u 继续独占动作和 Browser；B-A-T 只在同一 BrowserSession 的 CDP 连接上安装一个
  authoring-run 生命周期的事件桥，并在动作窗口内关联事件。
- reused public surface: `Tools.act`、公开 `ActionResult`、BrowserSession 的目标/frame session 能力、CDP typed
  send/register、正式 Agent callbacks。锁定版 EventRegistry 没有多订阅或 handler-owner token，dialog 重入与条件清理使用
  最小的固定版本适配；这部分不是上游公开稳定契约。
- B-A-T-owned adapter and remaining gap: 维护动作位置、活动窗口、document/frame 身份和 source 事实；关闭
  ShadowRoot 只能保留 document 监听器可见事实；浏览器 DOM 事件没有原生命令 ID，关联来源明确标记为单会话动作窗口。
- license/runtime/platform fit: 不新增依赖或第二驱动；沿用固定 Python/Chromium/CDP 和 runner 生命周期。
- browser/runtime/state ownership conflicts: 监听器借用现有会话，只由 authoring owner 关闭；不创建第二 Browser。
- replay model calls: 采集、保存和加载为零；本次首次探索仍由 Agent 决策，决策输出不构成验收证据。
- rejected candidates and evidence: b-u EventBus 只给出意图节点和动作结果，不提供浏览器实际 `event.target`；
  post-action `interacted_element` 和按旧 XPath 重找节点都无法证明已删除/已导航 document 的实际命中；每动作反复安装
  监听扩大竞态且不能覆盖无显式目标的 frame 键盘动作，均予以替换。
- focused validation: 先通过本文矩阵的一次真实正式入口运行和持久化往返，再进入实际任务页；任一步不得用 mock
  结果、Agent 自报成功或局部单元测试替代。

## 运行记录

### 2026-09-17 · 受控页运行 1 · 夹具拒绝

- 正式 `generate_chain` 入口创建一个 Browser 会话；source 显示 `sourceSuccess=true`、`sourceValidated=true`，但这两项
  不作为通过依据。
- 独立 oracle 在结构 A/B 分别收到真实 `span` 与 `rect` 命中；结构 A 同一动作收到可信点击和脚本点击，业务
  handler 只记账一次。该部分是候选证据，不外推到整项 A。
- shadow 页没有向 b-u 可访问树暴露动作索引。旧决策夹具在索引缺失后仍递增阶段，使后续 frame、导航、输入和
  final 场景全部被跳过；因此整轮结论为“夹具无效”，不是产品失败。
- 已将 shadow 场景改为可访问的原生外层按钮承载 open/closed shadow 命中，并把阶段推进改为仅在索引真实存在后
  发生。后续失败会保存到忽略目录 `work/action-context-acceptance/`，不再在清理临时数据库时丢失来源。

### 2026-09-17 · 受控页运行 2 · 决策输入拒绝

- 结构 A/B 再次产生相同真实事件与业务副作用；运行到第 5 步后，b-u 在消息历史末尾追加独立
  `PLANNING NUDGE`。
- 受控决策器只读取最后一条 user message，因而忽略上一条仍然有效的 `<browser_state>`，错误报告 shadow 目标缺失；
  阶段保持在 5，没有跳过后续场景。该失败不能评价 shadow 页面或产品采集能力。
- 修正为从完整消息历史选择最后一个 `<browser_state>`，并新增“browser state 后跟 planning nudge”的启动前反例。
- 完整受控 source、oracle 和消息诊断保存在 `work/action-context-acceptance/latest-failure.json`。

### 2026-09-17 · 受控页运行 3 · 旧矩阵拒绝

- 一次 Browser 会话确实执行到旧矩阵的 20 个动作，但 20 只是步数，不是能力覆盖；该页没有页面/容器滚动、原生
  select、JS dialog、HTML modal 或 popup/tab 生命周期，因此即使全部变绿也不能代表 A 的通用动作边界。
- source 对同一 `(documentId, sequence)` 收到多个 CDP session 的重复上报；这是需要定点回归的 transport 缺陷。
  跨源 frame 的 click 为 b-u 实际合成事件，旧 handler 用 `isTrusted` 拒绝业务效果，是夹具错误假设。
- 该轮 source、oracle 和失败编译信息只保留为诊断证据，不是候选验收。之后禁止在旧 20 步序列上继续追加补丁。

### 2026-09-17 · 新矩阵静态准入

- 新受控页已提供并静态解析页面/容器滚动、原生 select、confirm/prompt、HTML modal、popup opener/child；驱动改为
  具名能力步骤并解析实时 tab 身份，不再以匿名 stage 数量描述覆盖。
- `npm --workspace @browser-capture/api exec -- tsx --test tests/hybrid-action-context.test.ts` 当前仅运行启动前合同，
  结果为 1 pass、真实 Chromium 项明确 skip。这个结果只说明夹具和驱动具备进入浏览器验收的条件，不是 A 通过。

### 2026-09-17 · 新矩阵真实运行 1 · b-u dialog 生命周期阻塞

- 正式 `generate_chain` 入口只创建一个 Browser 会话，依次完成到第 23 个原生动作；没有自动重试或重新打开浏览器。
- 独立 oracle 与 source 同时证明页面滚动和 overflow 容器滚动分别产生真实 `scroll`，业务值为 `431`、`550`；
  原生 select 产生 b-u 脚本派发的 `input/change`，页面最终值为 `change:false:air`。这些仅是已到达场景的候选证据，
  整轮仍判失败。
- `confirm()` 的真实 click 和页面副作用 `confirm-result=true` 均已发生，公开 ActionResult 也已返回；但动作
  `a-0023` 没有 post observation，source 明确记录 `capture_callback_incomplete`、
  `missing_action_post_observation` 和 `native_agent_run_failed`。
- 固定 `cdp-use 1.4.5` 的 WebSocket 接收循环直接 `await EventRegistry.handle_event()`；registry 又直接 await
  b-u `PopupsWatchdog` 的异步 dialog handler。该 handler 在同一 root CDP client 上发送
  `Page.handleJavaScriptDialog` 并等待响应，接收循环却必须先返回才能投递该响应，构成可复现的重入等待。
- browser-use 0.13.8 没有禁用或替换 PopupsWatchdog 的 profile 扩展点。修复不复制其 confirm/prompt 策略和
  `_closed_popup_messages` 记账，只在当前 authoring 生命周期把现有 handler 的 awaitable 调度到独立 task，先释放
  同一 CDP 接收循环；动作 event delivery barrier 前必须等待该 task 完成，关闭时恢复原 registry handler。
- 使用真实 `EventRegistry` 的定点回归已证明：dialog handler 会先释放接收循环、后注册的新 tab handler 同样适配、
  非 dialog handler 仍维持原同步 await 语义、动作采集 barrier 位于 dialog settle 之后。它只证明因果修复，不能替代
  下一次真实浏览器矩阵。

### 2026-09-17 · 新矩阵真实运行 2 · tab close 后焦点恢复边界

- 仍只创建一个 Browser 会话且没有重试。运行在约 54 秒内依次通过 confirm、prompt、HTML modal、popup 创建、
  opener/child 双向切换和 child 业务点击，到第 32 个原生动作 `close(tab_id=FF23)` 后停止。
- dialog 死锁已经被推翻：四个 dialog/modal 动作都有 post observation；独立 oracle 分别得到
  `confirm-result=true`、`prompt-result=null`、`modal-open=true`、`modal-close=false`，后续 popup 动作继续发生。
- 释放 CDP receiver 后也暴露出上游同一逻辑 dialog 在同一 target 多 session 上的 opening fanout：浏览器状态累计
  69 条相同 confirm 消息和 75 条相同 prompt 消息。不能在保存后按字符串全局去重，否则两个真正相同的连续 dialog
  会被合并；适配边界改为只在原 handler 尚未完成关闭期间，按 target 与 dialog 内容合并同时 opening，handler 完成后
  下一次同内容 dialog 仍是新 occurrence。
- close 的公开 ActionResult 为 `Closed tab #FF23`，dispatch/result 证据完整，页面 oracle 也已证明 child 业务完成；
  但 b-u 先返回 close 结果、后由 SessionManager 异步恢复 `agent_focus_target_id`。旧快照合同立即固定被关闭的 child
  为 expected tab，因而没有 `a-0032` post observation，并记录 `capture_callback_incomplete`。
- 新合同在 pre observation 中把短 tab id 唯一解析为完整 target id；动作后只重读（不重放 close），直到该 target
  从真实 tab 清单消失并由 b-u `get_or_create_cdp_session(target_id=None)` 确认恢复后的焦点仍在剩余 tab 清单，随后才
  采 post snapshot。若 target 仍存在、焦点不存在或恢复到已关闭 target，均拒绝 ActionResult 的“成功”文本。
- 定点回归覆盖当前 child 焦点恢复到 opener、关闭目标仍存在时拒绝、短 id 无法唯一解析时拒绝，以及同一 dialog
  多 session fanout 只执行一次上游 handler；这些仍不是 A 通过证据。

### 2026-09-17 · 新矩阵真实运行 3 · 旧局部图合同下的候选

- 正式 `generate_chain` 入口只创建一个 Browser 会话，没有重启或动作重放；同一 source 保存 37 个动作、74 个前后
  observation、36 个 Browser command 与最终 `done`，全部动作均有原生 dispatch、公开结果和稳定 history 位置关联。
  该 source 的编译响应实际保留 27 个 gap，并非空：其中包含故意失效末动作的 `native_action_event_missing`，以及等待
  B/C/D 处理的完成条件、跨 tab 状态、动态绑定和输出装配缺口。受控 A 对账只证明动作包络、事件、页面值与副作用；
  不能把它写成可冻结的零 gap candidate。`sourceSuccess/sourceValidated` 仅作来源字段记录，不参与下列通过判断。
- 独立 HTTP oracle 保存 121 个真实 DOM 事件和 42 个业务副作用。逐动作对账通过的机制包括：两种命中结构、open/
  closed shadow、同 frame document 重建、跨源 frame、同步删除并导航、输入与 Enter、页面滚动触发真实动态节点插入、
  overflow 容器滚动、原生 select、confirm/prompt、HTML modal、popup opener/child 往返与只关闭 child、连续同参点击及
  第三次目标缺失。
- 页面业务值包括 `page-scroll=403`、`lazy-inserted=Loaded after scroll`、`container-scroll=550`、
  `select-value=change:false:air`、`confirm-result=true`、`prompt-result=null`、`modal-open=true`、
  `modal-close=false`、`popup-child=done` 和 `repeat-final=1,2`。confirm/prompt 的浏览器上下文增量各只有一个 occurrence，
  child close 后焦点回到 opener 且 child target 已从 tab 清单消失。
- 浏览器完成后，验收器最初把 `ObservationFact.value` 错收窄为 object，因 URL、title、时间戳等合法 JSON 标量而退出；
  这是验收器合同错误，不是动作失败。正式 `hybridNaturalRequestSchema` 原本即接受 JSON value。验收器改为 JSON value
  后，使用同一份已保存 source 与 oracle 离线复核全部通过；Enter 的 `beforeinput/change` 也确认已关联在同一
  `actionRef`，不再从 `event.key` 反推动作身份。
- 未再次启动浏览器。对同一真实 source 另走产品 repository 保存，关闭 Application，重新打开同一目录后读取，
  history digest、native event、dispatch/result 与 browser context 逐项等价。浏览器原始证据仍保存在
  `work/action-context-acceptance/latest-failure.json`；文件名只表示原运行被验收器异常终止。
- 后续加严的局部图审计推翻了“受控边界已通过”：旧监听器会为 path 上的 `html/body` 祖先复制全部直接子节点，连无关
  `<script>` 文本也进入事件证据；同时把 open shadow 内部根节点的 host 写成 `parentRef`，混淆 DOM parent 与 root host。
  因此本轮只保留为诊断候选，不能作为当前 A 受控通过证据。

### 2026-09-17 · 新矩阵真实运行 4 · 收窄局部图后受控边界通过

- 先以运行 3 的保存 source 执行加严合同，明确得到 `unrelated local graph node`；随后只保留 `composedPath` 元素与
  `event.target` 的直接子节点，并把同 root 的 `parentElement` 与 `ShadowRoot.host` 分别记为 `parentRef` 和
  `root.hostRef`。第一次复验 source 完整执行后又由合同发现 open shadow retargeting 下 `event.target` 不等于 path 首元素，
  以及旧跨 root parent 关系；保留该 source 定点诊断，未自动重启。修正合同与父关系后再执行一次完整矩阵。
- 最终正式 `generate_chain` 运行仍为单一 Browser 会话，保存 37 个动作、74 个 observation、37 组 dispatch/result；
  独立 oracle 保存 120 个真实 DOM 事件和 42 个业务副作用，`fixtureFailures=[]`。逐动作对账、页面值、副作用、dialog
  occurrence、tab 焦点／关闭、frame document 重建、重复同参及故意缺失事件全部通过。
- 66 条与动作窗口关联的 source DOM 事件平均包含 4.1 个局部节点、最多 7 个，`script` 节点为 0。open shadow 内部
  `span.parentRef=null`，其 `root.hostRef` 指向监听器所见 host；document 监听器的 retargeted `event.target` 与内部
  `composedPath()[0]` 分别保留，没有强行合并。
- 同一 source 经产品 repository 保存，关闭并重新创建 Application 后，history digest、事件、dispatch/result 和
  browser context 等价；完整通过证据为 `work/action-context-acceptance/latest-success.json`。
- 另以 `BAT_ACTION_CONTEXT_EVIDENCE` 加载上述 6.3 MB 保存证据，不启动 Chromium，经产品 repository 再次保存、关闭、
  重开后执行同一 source/oracle 合同，2/2 通过。该离线入口先发现成功证据写入器漏存 `fixtureFailures` 字段；现已让新成功
  证据显式保存该字段，旧成功证据只兼容该字段缺失，仍必须满足调用数等于动作数及全部事件、页面值、副作用对账。
- 编译响应仍诚实保留 27 个 B/C/D 及故意失效动作 gap；受控 A 通过不等于可冻结 candidate，更不等于整个 A 完成。
  仍需实际任务页和变化输入／页面状态走相同正式入口，核对真实事件、页面数据和业务副作用后才能进入 B。

### 2026-09-17 · 实际任务页运行 1 · 模型传输在首动作前阻塞

- 使用原任务 `collect-issues` 和真实 GitHub 页面，从同一 `TaskChainService.dispatch(generate_chain)` 入口创建来源运行
  `14280431-803c-45c7-82e5-7d57b6bc2058`；没有改用测试入口，也没有在失败后重开浏览器撞运气。
- 六次 Agent 模型请求均在开始流式响应前以 `provider_transport_failure` / `fetch failed` 结束；因此
  `browserCommands=0`、`sourceSuccess=false`、`sourceValidated=false`，不存在可用于评价 A 的实际页动作、事件或业务副作用。
- 本轮只证明产品模型传输被环境网络链路阻断，不能证明或推翻动作采集。完整 source 生命周期诊断保存在
  `work/natural-task-validation/14280431-803c-45c7-82e5-7d57b6bc2058/`；在传输恢复前不重复启动相同浏览器运行。
- 为核对当前状态，只对既有失败需求轮次走正式 `/api/interview` 重试一次，未启动浏览器、未新建任务、未改模型选择或
  auth。新 turn `b909202c-96f2-4a21-8ab1-0c4382181e90` 仍连续四次在首 token 前 `fetch failed`，最终用量为 0；本机
  API health 和既有模型选择可正常读取。shell 中残留的 `http_proxy/https_proxy=127.0.0.1:7890` 只会污染命令行诊断，
  以 `--noproxy` 已排除本机 API；ai-connect/Pi AgentSession 和本仓库都没有 VPN 模式分支或代理环境改写。当前阻塞仍是
  进程网络到 provider 的传输，没有证据指向 auth，也不得在 B-A-T 内增加 TUN/代理特判。
