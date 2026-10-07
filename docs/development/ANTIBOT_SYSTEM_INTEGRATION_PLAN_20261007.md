# B-A-T 自动化识别评估与浏览器访问链路改造方案

日期：2026-10-07。状态：**设计复审后修订；首批限于最小诊断，产品改造按缺口触发。没有实施以下改造。**

先读 [开源选型与覆盖矩阵](ANTIBOT_OPEN_SOURCE_ASSESSMENT_20261007.md)，再按本文实施。架构最高依据仍为 [任务链路架构基准](TASK_CHAIN_ARCHITECTURE.md)；当前产品入口为 [项目现状核验](PROJECT_STATUS_20261007.md)。

## 0. 设计复审结论与纠正

**原稿没有达到“可以直接作为最小实现开工”的标准。** 原因是首次测量的前置组件过多，产品改造面未逐项设触发条件，效果验收也弱于功能验收。本轮已修订这些设计缺口；修订后的执行结果仍需后续实验取得。

复审方式：主 agent 直接复核两份文档、既有夹具、运行入口和固定开源源码；没有第二位 reviewer 或独立 agent 审核，不把自审描述为独立评审。

| 编号 / 级别 | 原计划问题 | 纠正与落实位置 |
| --- | --- | --- |
| R01 / P1 | 把完整 CrowdSec/WAF/容器组合当作第一次客户端诊断的前置条件 | 首批改为 fpscanner + 现有本地场景 + 运行记录；多层引擎按缺口启用，见第 3 节与 P0/P1 |
| R02 / P1 | W1–W5 容易被当作需要全部实施的生产改造清单 | 改为候选工作包；每项必须有现象、路径、必要改动和验收，不先加公共协议/数据库/UI，见第 4 节 |
| R03 / P1 | 任务通过、零模型调用和清理通过，仍不能证明网站侧识别差异已改善 | 增加独立效果硬门、失败规则及结论范围，见第 8.3 节 |
| R04 / P1 | 探针内部错误可能变成 false；同文档探针还会改变全局对象 | 保留输入有效性和未知状态，独立文档测量，核验正例；源码证据见选型文档第 4.1 节 |
| R05 / P2 | 把用户对检测方案的开源要求，扩大成所有浏览器宿主都必须完整开源 | 撤回该额外限制；CloakBrowser 继续是宿主候选，其内核专有事实单列，见第 5 节 |
| R06 / P2 | 未区分现有 mock、headless 验收与真人同环境对照，且两个选择案例不等于两类能力 | 明确夹具用途；人工与自动化保持相同显示模式，必要时再扩展表单任务，见第 8.2/8.3 节 |

以下正文已同步修改，不能只读旧 P1/W1–W5 描述就批量开工。详细覆盖目录保留，用于发现缺口；它不是要求一次实现所有机制的任务单。

## 1. 决策和目标

**保留 browser-use，先用开源检测系统测出实际差异，再改浏览器宿主接入、会话连续性、网络请求来源和各阶段额外访问。** 不推翻 B-A-T，不重写检测引擎，不把桌面键鼠方案升为主路线。

“像真人”在本计划中的含义：网站可观察到的浏览器环境、请求身份、会话和行为具有正常用户使用的一致性。目标不是鼠标轨迹表演，也不是把工具名称换成另一个看起来更隐蔽的名字。

第一阶段组合收窄为固定 fpscanner、自有测试页面和现有运行记录。CrowdSec 为挑战及跨请求检测扩展；JA4 为网络观测扩展；独立探针在相应效果晋级前加入。检测器部署在自有测试站，**不成为产品每次访问网站必须经过的代理或实时裁判**。

### 1.1 保留和改造的边界

| 能力 | 决定 | 原因 |
| --- | --- | --- |
| browser-use 原生 Agent、DOM、动作与首次探索 | 保留 | 已承担浏览器能力；通过公开 BrowserSession 接口适配宿主即可研究环境层 |
| workflow-use 受管采集/编译与 B-A-T 物化 | 保留 | 自动化识别评测不能损坏参数化、动态方法与来源证据 |
| TaskChain / LangGraph / 普通复跑 | 保留 | 检测报告不替代业务图；普通复跑零隐式 LLM |
| owner/lease、人工等待、恢复和 cleanup_required | 复用并补齐新资源适配 | 不创建第二套会话管理、等待状态机或清理框架 |
| 宿主配置、账户准备、网络来源和阶段审计 | 根据对照证据最小改造 | 这些路径共同决定网站看到的完整访问行为 |

```text
Product Alignment:
- natural-language task: 在本地执行用户确认的浏览器任务，并用受控检测证明访问环境改造的实际效果。
- reusable chain boundary: 同一参数化任务链在受控列表和表单两类任务上复跑。
- runtime inputs: 既有任务输入、所选浏览器环境；实验 ID 仅属于实验元数据。
- dynamic task outputs: 既有结果合同；检测报告单独输出，不混入业务节点结果。
- generic platform capability used: 浏览器能力适配、owner/lease、运行事件、检查点、人工等待和模型审计。
- replay model calls: 普通节点零隐式 LLM；保留显式 llm 节点约束。
- site/task-specific code added: no；具体网站和实验夹具属于任务数据/测试配置。
```

## 2. 只读核验的现有实现

本轮实际 checkout：`master@3b8049e93c843ef72b27191e89368ad173cf912e`，有既存未提交改动。下表针对当前工作区源码，不等同于该 commit 的干净快照。实施前重新核对，不覆盖当前动态方法补全工作。

### 2.1 现有主链路

```text
需求确认
  → 账户准备 / 所选浏览器环境
  → PythonUpstreamBrowserRuntime.withAuthoring
  → RunnerProcess.startHybrid
  → browser-use 原生 Agent + workflow-use 捕获
  → 不可变来源 + 编译 / TS 物化
  → sample / verification / 发布
  → LangGraph + PythonUpstreamBrowserRuntime.withCapabilities
  → withHybridCapabilities → Python Runner → OrdinaryCapability
  → TaskRun 结果 + execution 生命周期 + 资源清理
```

账户准备可能先于探索和正式运行发生；仅观察 Agent 的动作日志会漏掉它。首次探索和普通复跑共用部分启动基础设施，但不是同一个调用入口，改造必须分别覆盖。

### 2.2 已有接入点与真实缺口

| 位置 | 已核验行为 | 后续动作 |
| --- | --- | --- |
| [python-runtime.ts](../../apps/api/src/upstream-browser/python-runtime.ts)，withAuthoring / withCapabilities / prepare / runner | 两条主路径均调用账户准备；账户维护串行；runner 注入浏览器模式与 endpoint；恢复绕开重复准备 | 共同传递环境事实、阶段关联与准入上下文，保持恢复语义 |
| [service.ts](../../apps/api/src/upstream-browser/service.ts)，startHybrid | daily 使用既有 endpoint/扩展连接；dedicated 清除 existingBrowser 并按用户模式设置 headless | 扩展宿主适配只落在已有启动/连接边界，不另加控制器 |
| [hybrid_main.py](../../apps/api/python/browser_use_runner/hybrid_main.py)，Runner.start | ConnectedTaskScope、AttachedWindow、ManagedWindow 分支；统一创建 OrdinaryCapability | 所有分支登记相同环境与会话事实；与 TS 协议一起变更 |
| [attached_window.py](../../apps/api/python/browser_use_runner/attached_window.py)，AttachedWindow | 以 owner/lease 限定任务 target，借用既有 CDP endpoint | 借用宿主不能被实验结束关闭；只结束可证明属于实验的 target |
| [account-reuse.ts](../../apps/api/src/browser/account-reuse.ts)，prepareAccount | 启动可打开目标窗口、运行登录检查，必要时进入既有登录恢复/迁移；部分流程已有避免重复证明的优化 | 测量真正增加的访问，按证据减少重复；不能粗暴删除身份核验 |
| [account_http.py](../../apps/api/python/browser_use_runner/account_http.py)，ReadClient / RecordingClient | 从借用页面获取 UA/cookies 后使用 httpx 请求；这属于独立网络栈 | 做传输路径审计；不推断这就是京东封禁原因或所有平台都会走该路径 |
| [hybrid-runtime.ts](../../apps/api/src/upstream-browser/hybrid-runtime.ts)，withHybridCapabilities | 有命令预算、human_required、恢复校验、作用域与清理回调 | 增补观测/错误映射；不要重建预算调度器或人工等待器 |
| [hybrid_main.py](../../apps/api/python/browser_use_runner/hybrid_main.py)，record_document_response | 当前只登记授权 target 的 Document 响应状态；observe 有限定的状态读取重试 | XHR/fetch/200 挑战页等需单列覆盖；不要把观测重试计为重复执行动作 |
| [source-lifecycle-diagnostics.ts](../../apps/api/src/upstream-browser/source-lifecycle-diagnostics.ts) | 已承载原生诊断、模型与生命周期结果 | 复用字段白名单扩展；禁止整份指纹或认证材料进入文本诊断 |
| [setup-upstream-browser-runner.mjs](../../scripts/setup-upstream-browser-runner.mjs) | 校验 Python 3.12、browser-use 0.13.8、cdp-use 1.4.5、workflow-use 0.2.11 和受管源码摘要 | 不在环境中偷偷升级或补丁；需要依赖变更时走现有锁定与来源验证 |

具体 browser-use 公开宿主接口见固定 [`BrowserSession`](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/browser/session.py)。存在 cdp_url / executable_path 等入口，说明宿主与 Agent 可以分开评估；它不证明任意分叉 Chromium 已可直接兼容。

## 3. 两条工程线及其唯一交点

### 3.0 最小首批 M0：诊断闭环

M0 的目的只有一个：在明确环境下，找出人工访问与当前 B-A-T 的可重复、可归因差异。它不承担面向互联网的反攻击部署，也不需要先修改产品。

| 首批必需产物 | 最小做法 | 超出首批的内容 |
| --- | --- | --- |
| 固定探针制品 | 使用固定 fpscanner 的公开入口，记录构建/版本；只作为开发依赖 | 自写指纹算法、多个探针同时打包成检测平台 |
| 自托管探针与场景 | 复用已有 node:http 本地夹具模式，为一个现有场景提供探针页面/结果端点 | 新建 Fastify 服务、WAF 网关、容器平台、账号画像系统 |
| 运行取证 | 使用既有 execution/事件及受控站命中记录；少量缺失环境值写实验 manifest | 为首轮诊断改 TaskChain 公共字段、生产数据库和 UI |
| 比较报告 | 薄脚本按相同环境、阶段、signal 和有效性比较；复用库的检测结果 | 通用规则引擎、综合真人分数、新的模型 judge |
| 对照样本 | 无控制的人工、仅连接、连接后观察、执行；已知检测正例独立校验 | 用 Agent 充当真人，或将 headless 与人工可见浏览器的差异直接归因控制器 |

首批没有服务器挑战/时间窗口需求，就不实现它们。发现网页请求栈差异后，先补受控 TLS 观测再决定网络改动；发现跨请求识别问题后，先接 CrowdSec 原生场景，不自己写统计引擎。组件按证据增加，测量标准不随候选调整。

### 3.1 检测实验室：网站侧

M0 复用现有测试夹具与本地数据目录，新增内容放到所属 package 的 `tests/`。只有启用多层检测时，才在 `tools/antibot-lab/` 放外部组件静态配置与资源清单；不预先建立通用实验管理模块。以下服务器架构属于按需扩展，本轮没有创建实现目录。

| 部分 | 实际所有者 | B-A-T 自有内容 |
| --- | --- | --- |
| HTTP 接入、挑战页响应 | 官方 Nginx/OpenResty bouncer | 受控站地址、固定版本和启动资源清单 |
| 指纹/挑战/规则/跨请求聚合 | CrowdSec + 内置 fpscanner + Hub | 必要的扩展配置及缺口说明，不复制引擎 |
| 受控业务 | 测试夹具 | 虚构列表/表单/登录态/限制场景及任务参数 |
| 实验结果 | 组件原始输出与实验 manifest | 字段白名单、结果映射、版本和 case 关联 |
| 独立复核 | BotD、CreepJS、JA4 | 自托管与受控采样、差异报告 |

M0 只观察。需要挑战实验时再使用上游完整协议，不先为它实现一个通用模式切换功能。报告区分“未阻断”与“未识别”；不能私改探针或网关返回值让候选通过。

### 3.2 产品访问：客户端侧

只沿现有入口增加薄适配：环境描述、阶段成本、来源分类、已有人工等待/限制错误映射。产品正常运行不加载 fpscanner/CreepJS，不把登录材料送进 CrowdSec，不为每次操作多开一个检测浏览器。

两条线通过**同一受控任务的运行事实与实验结果关联**相交。检测器不能读取测试标签来判定，也不应依靠 `caseId=automation` 这类人为标记识别机器人。case 标签保存在独立报告元数据，供事后统计。

## 4. 产品改造工作包

**W1–W5 是证据驱动的候选改造范围，不是五项都要做。** 首批生产代码改动为零；实验数据已经能够回答问题时不增加生产字段。每个获准实施的补丁须填写：`现象 → 有效对照 → 当前源码路径 → 上游公开能力 → 最小差异 → 验收 → 回滚`，不能用“以后可能有用”立项。

| 工作包 | 必须出现的触发证据 | 未触发时的决定 |
| --- | --- | --- |
| W1 宿主 | 差异定位到宿主/启动；现有公开配置无法正确传达或核验必要环境 | 只记录实验环境，不改公共协议 |
| W2 账户/网络 | 实际前置检查重复，或凭据流量走独立 HTTP 栈且存在目标相关差异 | 保留现有身份核验；不全量重写账户流程 |
| W3 控制路径 | 同宿主连接/观察/动作之间有可重复新增信号或语义错误 | 保留 B-U 原生能力与编译路径 |
| W4 访问/限制 | 阶段漏记导致重复访问、预算失效或现有限制处理缺口 | 复用现有事件和 admission；不新建总账引擎 |
| W5 证据/UI | 必要运行事实没有现有载体，或实际用户流程需要显示该事实 | 实验 manifest 即可；不新增产品页面/API |

### W1：环境与宿主适配——保留现有控制链

首先在实验 manifest 中描述已有 browser mode、endpoint 类型、owner 归属、浏览器版本、制品和 Profile 绑定。只有生产启动或恢复确实缺少必需事实时，才在原配置旁补字段；不为报告便利建立新的浏览器池或环境协议。

生产者是宿主启动/连接层；消费者是启动校验、同 run 恢复校验与实验报告。不能让 LLM 填这些可由代码取得的值。不要把完整命令行、带 token 的 websocket URL、个人 Profile 路径原样写入审计。

| 模式 | 必须保留的行为 | 需要单独验证的差异 |
| --- | --- | --- |
| daily | 继续用户所选浏览器与原身份，借用明确 target | 授权 relay、CDP 观察、扩展和启动方式造成的信号 |
| dedicated visible | 仅使用已归属本 run 的宿主；不暗中借用 daily | 新 Profile、登录恢复、设备一致性和会话连续性 |
| dedicated headless | 保留该模式用途 | 作为独立环境报告；不能代替可见浏览器结论 |
| 候选 Chromium 宿主 | 通过正式公开接口启动或连接，沿用 B-U 动作与捕获 | CDP API、target ownership、重连、关闭、编解码、浏览器更新 |

同账号 cookie 出现在新 Profile，不等于整个设备和会话身份已连续。当前专属任务按 owner 分配运行目录；如果数据证明需要长期专属身份，应先评估现有账户身份/租约能力的扩展，不能直接把所有任务挤到一个共享 Profile。

可能涉及：`service.ts`、`python-runtime.ts`、`hybrid-protocol.ts`、Python 启动配置及 AttachedWindow/ManagedWindow。这是定位地图，不是必须修改的文件清单；已有入口可表达的配置直接复用。确需改参数时覆盖 sample、verification 和正式复跑，不能只改探索。

### W2：账户准备与网络来源——先定位，再改变

把每次账户操作关联到用户动作或父 execution，说明它是显式检查、启动准备、登录恢复还是故障恢复。先输出次数和 transport 类型，不采集凭据。

| 路径 | 首选处理 | 必须保留的不变量 |
| --- | --- | --- |
| 同一已确认浏览器中的任务启动 | 优先使用已有身份与页面证据；只做仍必要的核验 | 不能把 cookie 存在或历史成功当成当前登录正确 |
| 重复检查 | 在同一受控操作内合并重复证据消费；版本/身份变化时失效 | 不跨任意时间缓存“登录有效”，不掩盖 identityKey 冲突 |
| 后台 HTTP 使用网页账号凭据 | 先证明实际调用及请求差异；优先复用原站正常页面路径或已有浏览器能力 | 不能只复制 UA/headers 就声称网络身份一致 |
| 官方、独立授权的 API | 保持明确的 API transport 和凭据边界 | 不伪装成页面导航，不强制无理由迁移到浏览器 |
| 迁移/恢复 | 继续既有显式身份、范围、回滚与 owner 校验 | 不以“降低检测”为由删掉账户一致性与恢复检查 |

不能把 Playwright `APIRequestContext` 简单替代 httpx 后就称为浏览器原生网络栈；同样不能将页面 `fetch` 等同于正常用户导航。若评估页面内请求，应分别证明 origin、CORS、CSRF、授权范围、请求语义和操作副作用，优先复用已存在的页面流程，不新增通用绕过接口。

账户准备发生在 `withAuthoring/withCapabilities` 的前置阶段；未来的总账与停止条件必须覆盖这一段。只在正式 runtime 加预算无法约束已经发送出去的准备请求。

### W3：观测、动作与编译——用证据修正具体路径

优先比较同一宿主在手动、仅连接、仅观察、原生动作、完整任务几个阶段暴露的变化。这样才能区分宿主启动、探针、页面观察和动作本身的影响。

发生差异后按固定顺序处理：上游公开配置 → 原有成熟能力的正确调用 → 有明确源码依据的局部适配。只有实验识别到实际问题才评估替代动作实现；不能批量注入 stealth 脚本、随机修改平台属性或改写探针结果。

任何动作路径改变都要验证 workflow-use 的捕获来源、目标绑定和后置条件仍完整；“点击成功但链路不能重新读取/动态选择”不算改造成功。保留初态已满足也能留存方法、参数变化能复跑的当前设计，不让新宿主覆盖未提交的动态方法补全工作。

输入框、菜单、iframe、shadow DOM、弹窗和中文 IME 属于兼容验证，不以固定屏幕坐标替代既有结构定位。需要模型的视觉判断只能是显式 LLM 用途，不藏在普通节点的定位后备里。

### W4：累计访问与限制处理——沿已有运行控制扩展

首批报告从现有 `browserCommandCount` 与受控站日志离线关联，分别保留命令和请求事实，不先增加生产总账。请求摘要注明采集范围，未覆盖 worker、缓存或不同 target 的采样不能写成精确总量。只有现有事实无法定位必要问题时才补最小关联字段。

阶段至少能区分账户准备、Agent 探索、样本、复验、正式复跑、恢复和资源维护。内部 DOM 重读与新网络请求分开；失败动作、取消前已派发请求和实际重试不能消失。

上游检测实验室用 CrowdSec 聚合窗口；产品端仍用现有 admission、预算、取消与检查点，不引入另一个通用限流服务或调度器。若新增跨 execution 的访问约束确实必要，先找现有能力和成熟组件，提交独立 Reuse Assessment 后再引入；本方案不预埋自写全局风险引擎。

| 现场情况 | 产品处理 | 恢复与记录 |
| --- | --- | --- |
| 正常内容加载/明确的瞬态观察不稳定 | 复用限定观察重取，不重复业务动作 | 记录 observation retry，不伪造新的业务执行 |
| 429 / Retry-After | 停止本次继续访问，记录等待信息 | 不自动密集刷新；恢复前沿现有 admission 重新判断 |
| 403 或 200 返回挑战页 | 区分已知挑战、拒绝与未知响应 | 不把 HTTP 状态单独视为登录失效；需要人工时沿现有等待 |
| 登录/验证码/身份变化 | 交回原 owner 页面供用户处理 | 同 run、同 checkpoint 恢复，核验状态，不自动切换账号 |
| 已完成业务但资源未确认关闭 | 保留 TaskRun completed | execution 为 cleanup_required；只恢复其拥有的资源 |

当前 Document 状态检查不能覆盖全部限制表达；新证据分类应使用已有协议错误与人工等待结果，必要时版本化扩展。不要靠新增全局 LLM judge 读取页面决定是否“像真人”；200 页面不能靠 HTTP 状态判断时，使用受控任务的版本化页面证据或保留 unknown。

研究用途的 detector 分数只进入实验报告。实际运行遇到站点限制时可以按现场停止；运行已合法完成后，不准因离线检测分数追加一个“反爬验收失败”覆盖原结果。

### W5：证据、版本与用户界面——单一事实源

第一版先使用本地实验 manifest 与现有事件引用，不为实验新建一套账户数据库或复制全部运行事件。需要在工作台展示时，服务端按引用聚合摘要；只有存在明确 UI/API 消费者才增加公共契约。

| 拟记录对象 | 最小字段语义 | 唯一事实源 / 消费者 |
| --- | --- | --- |
| 实验定义 | 实验 ID、场景版本、操作者标签、比较变量、检测模式、重复轮次 | 独立实验 manifest → 报告 |
| 环境清单 | 产品 commit/dirty 摘要、B-U/vendor digest、浏览器模式/版本、检测组件与规则哈希 | 启动实际值 + 固定清单 → 可重现核验 |
| 运行关联 | execution/TaskRun、phase、动作序号、开始/结束时间 | 现有持久化事件 → 实验关联 |
| 网站侧发现 | detector/version、机制 ID、signal、reason、采集状态、组件原始 score | 组件原始结果 → 白名单适配 |
| 结算摘要 | 业务结果、检测结果、采集完整性、模型调用、资源清理 | 各自事实源 → 并列展示 |

采集状态至少区分 observed、unavailable、invalid；命中与否是 observed 之后的另一事实。schema 版本和组件版本不能混为一项。原始发现可随新报告重新解释，但旧报告、旧 release、旧 TaskRun 不被更新覆盖。

实验站可以使用独立的虚构会话 ID 关联请求；该标识不得进入 detector 的判断特征。真实网站不注入实验 header、URL 参数或额外 JS。Profile 路径/账号/完整 IP 等用本地受控别名；不把稳定个人指纹散列当成天然匿名数据。

若后续实际需要产品 UI，摘要使用“复跑期间出现访问限制，已暂停，等待处理原页面”等现场事实。开发报告的缺少 TLS 观测不自动成为产品 UI 需求。首批没有新增 UI；不显示“安全浏览器”“99% 真人”或无法解释的总分。已有操作反馈保持不变。

## 5. 宿主候选如何接入，而不是替换 browser-use

所有候选先作为独立受控实验环境；默认用户浏览器不自动迁移。比较须锁住 B-U 版本、任务链和探针版本，先测主机环境，再测完整任务。

| 候选 | 与现有 B-U 的关系 | 本轮判断及下一道门 |
| --- | --- | --- |
| 当前用户所选 Chrome / 现有专属 Chromium | 已有 daily/dedicated 接入 | 基线优先。首先消除当前系统自行引入的重复访问和身份混用 |
| CloakBrowser | Chromium 宿主可作为候选；其包装层使用 Playwright | wrapper MIT、核心二进制/补丁专有；用户的检测侧开源要求不自动排除它作为客户端候选，继续比较源码可见范围、许可和实测效果 |
| Patchright | 修改 Playwright 路径；B-U 主路径使用 cdp-use | 不能替换 npm 包就认为 B-U 获得补丁效果；需证明命中的具体调用点，否则不引入 |
| Camoufox | Firefox，现有 B-U 依赖 Chromium CDP 路径 | 会扩大浏览器能力适配范围；不作为本轮最小改造路线 |
| Ego(lite) | 公开 SDK 提供 Space/Snapshot/动作，需核验宿主接入与会话模型 | 已研究其 SDK CDP 输入实现；公开材料当时以 macOS 为主，Windows 尚未公开可用，不作为当前 Windows 落地前置 |
| BrowserOS | 公开 Chromium patch、Windows 发行；另有产品自带 Agent 能力 | 可留作开放内核研究候选；尚未完成具体动作/控制源码兼容审计，不能让其 Agent 替代 B-A-T 复跑 |

固定来源：[CloakBrowser browser.py / 提交](https://github.com/CloakHQ/cloakbrowser/blob/5fa65172f0612b3ea3efbee719be0cb618594285/cloakbrowser/browser.py)、[二进制许可](https://github.com/CloakHQ/cloakbrowser/blob/5fa65172f0612b3ea3efbee719be0cb618594285/BINARY-LICENSE.md)、[Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright/tree/f34b86146dd4e6b54eeacb023af0dbfe19ee09db)、[Camoufox](https://github.com/daijro/camoufox/tree/7a4ac0d4dca2dfdeb277f521824a26efb0b6a7b6)、[Ego SDK](https://github.com/citrolabs/ego-lite/tree/dca7003349c5f7132189ba00547cbbd7ff8e597e)、[BrowserOS](https://github.com/browseros-ai/BrowserOS/tree/7d12ab39332baad966f96bde64376a4882ee300f)。这些是本次研究快照；产品平台支持在真正采用时重新核验。

CloakBrowser 的 Playwright `humanize` 属于包装层能力；B-U 直接 CDP 连接不会自动执行这层逻辑。Ego 的 Space 也不能直接当作现有 Chrome Profile。两者都说明必须按职责适配，而非把多个工具堆叠后推断效果。

用户要求用开源方案建设检测侧；没有要求所有客户端宿主都必须完整开源。两者分别选型，不把额外限制归到用户头上。检测底座与 B-U 保留；是否换宿主由 P3 的单变量结果决定。

## 6. 数据、资源和重启恢复

### 6.1 数据范围

允许提交到 Git：依赖/镜像引用、配置模板、虚构场景、schema、脱敏且不可还原个人数据的测试预期。禁止提交或写入普通日志：真实 cookie、Profile、登录态、验证码、完整页面、挑战密钥、带 token endpoint、完整个人设备指纹。

实验室原始结果保存到项目既有本地工作数据范围的独立目录，路径作为开发配置解析，不把本机绝对路径写成公共代码常量。首次实施定义保留期、容量上限与显式清理命令；清理前遵守 [工具策略拒绝复盘](TOOL_POLICY_INCIDENT_20261007.md)。

BotD 关闭 monitoring；CreepJS 输出白名单；CrowdSec 关闭共享和未使用的云连接。除了配置检查，还要验证实际外连与日志。遇到采集程序需要完整指纹时只用专用合成实验环境，不读取个人账号浏览现场。

### 6.2 资源所有权

| 资源 | 所有者 | 结束实验时行为 |
| --- | --- | --- |
| 实验室容器/服务/端口 | 明确的 lab instance | 停止自己创建的实例，记录进程/容器退出；不触碰已有开发服务 |
| 专用实验 Profile / 浏览器 | 本次实验的 owner/lease | 沿现有 finally/close/handoff；独立登记目录清理 |
| 用户日常浏览器 | 用户 | 借用只管理授权 target；不得关闭整个浏览器或改 Profile |
| 抓包/日志文件 | lab instance / case | 仅受控端点范围，受保留期与容量限制 |
| 签名密钥 / 检测状态库 | 实验室实例 | 本地保存；case 重置与服务重启策略显式，不能每次随机丢弃 |

实例重启不自动恢复产品业务访问；已有 run 的恢复继续核验 owner、lease、tab、来源、checkpoint 和 pendingEffect。实验室宕机只使该轮观测无效，不把已经完成的产品结果改失败。

同时记录运行资源关闭、目录永久删除、仅移入回收站、清理被阻塞四种事实。对方进程未退出时不能用目录消失代替资源结束证据。

## 7. 兼容性、失败与回滚

公共协议有改动时，TS Zod 与 Python 生产者/消费者一起更新；新增字段必须有明确语义和默认兼容策略。环境 manifest 属于运行事实，除非改变链路执行合同，否则不把它灌进 TaskChain 节点并迫使历史版本重发布。

| 失败 | 处理和回滚 |
| --- | --- |
| CrowdSec/HUB/bouncer 版本不兼容 | 停止该组合；保留首败配置和错误；在上游支持范围找兼容版本，不自写挑战代理补洞 |
| 候选宿主不能支持捕获/普通动作/重连 | 切回原宿主适配；保留原 release 和来源，不要求重新录制全部任务 |
| 更换网络路径后业务语义变化 | 回退该 transport 改动；保留原请求证据；不能靠伪造返回值通过测试 |
| 遥测导致请求增加或页面性能变化 | 停用该实验探针并标记本轮受扰动；只在受控站调整采样 |
| 人工基线误报明显或正例全部放行 | 检测组合尚未有效校准；先修部署/版本/误报，不继续以总分排名浏览器 |

默认配置指向当前宿主；新候选用单独环境配置选择，不静默升级所有用户任务。复用成熟 launcher 也必须遵守现有资源所有权，不让两个 SDK 同时持有实际控制会话。

## 8. 实施顺序与每阶段交付门

以下均为后续开发计划。当前授权只覆盖方法评估和本文档，不执行任何阶段。阶段通过后是否扩大验证，仍遵守最小验证规则；不默认运行根级或全量测试。

| 阶段 | 具体产物与范围 | 退出条件 | 失败时停止点 |
| --- | --- | --- | --- |
| P0：固定最小输入 | 固定 fpscanner 制品/公开入口、一个可复用本地场景、现有运行入口、数据/资源归属；预登记要测的信号 | 开发依赖与本地夹具足以开始；没有生产改造或 WAF 部署前置 | 缺少的环境条件明确列出，不先扩建平台 |
| P1：M0 有效基线 | 一份主探针；人工、仅连接、观察、动作分阶段测量；校验输入缺失、内部错误和探针扰动 | 至少得到有效的正反例与当前 B-A-T 记录；不能用未命中掩盖无法采集 | 检测无效就修证据路径，不改产品绕过检测 |
| P2：定位全阶段差异 | 从一个受控任务关联准备、探索、样本、复验、复跑；仅为相关问题加入 TLS 或 CrowdSec | 每个候选补丁有信号→阶段→源码→最小差异；明确原始结果及重复样本 | 当前无差异时转独立观测，不为了“有产出”硬改代码 |
| P3：最小补丁或宿主对比 | 仅启用触发的工作包；保留 B-U；每项改动单变量比较，第二类任务只用于所改能力的泛化回归 | 同时满足第 8.3 节效果硬门与相关功能不变量 | 一项失败回退一项，不继续叠库 |
| P4：独立复核与范围冻结 | 对已声明改善的机制引入独立观测及留出场景；缺少的网络/挑战/会话证据在此补齐或限制结论范围 | 可追溯的修正前后结果、未覆盖项、版本和回滚；有明确适用模式 | 本地证据不写成京东/淘宝账号风险已解决 |

P0/P1 只交付最小诊断闭环。CrowdSec 的挑战协议、Hub/bouncer 版本、CSP/Set-Cookie、allowlist 与状态隔离检查，在实际启用该扩展时才成为前置；没有该扩展时不要求完成这些项目。P2 之后再决定产品补丁。

### 8.1 重点验收用例

| 编号 | 真实不变量 | 最小证明 |
| --- | --- | --- |
| T01 | 检测器确实工作 | 对所测机制构造已知命中的自动化正例；人工负例独立记录，不能要求一个基础探针识别所有自动化方式 |
| T02 | 缺失不等于通过 | JS 阻止、探针超时、原始信号 ERROR、规则内部吞错、无 TLS 分别输出 unavailable/invalid/unknown；不直接采信 detected=false |
| T03 | case 相互独立 | 上次 ban/挑战 cookie 不影响标为新会话的 case；延续会话 case 又确实延续 |
| T04 | B-U 没被替换 | 探索捕获和普通执行继续走原能力链；来源摘要与模型用途正确 |
| T05 | 任务仍可动态复跑 | 列表顺序/数量/初态变化、表单验证变化；不能只固定点击成功 |
| T06 | 准备流量没有漏记 | 登录检查/迁移前置访问有 phase 关联；不只统计 TaskRun 中的命令 |
| T07 | 网络来源真实 | 合成网站服务器可区分浏览器与后台 HTTP 栈；改动前后对照一致 |
| T08 | 限制不会诱发访问风暴 | 429、403、200 挑战、超时分别验证；重试与观察重读分列 |
| T09 | 恢复不会错用会话 | 同 run/checkpoint、owner/lease、pendingEffect 校验；不新开账号继续 |
| T10 | 业务与清理分别结算 | completed + cleanup_required 保留；清理只作用于本轮 owned 资源 |
| T11 | 没有隐式模型调用 | 普通复跑审计为零；实验报告生成不调用 LLM |
| T12 | 没有数据外发或敏感日志 | 合成凭据与指纹哨兵检查、网络外连核验、日志白名单检查 |
| T13 | 修正确实改善识别结果 | 预登记信号在有效对照中从原有差异变为符合人工参考，独立复核没有否决证据；不是仅降低总分 |
| T14 | 测量过程没有混淆原因 | 对照匹配浏览器/OS/显示模式与会话策略；探针独立新文档；人工过程无自动控制连接 |

### 8.2 优先复用的现有验证

已定位可参考的测试包括 [account-startup.test.ts](../../apps/api/tests/account-startup.test.ts)、[account-reuse-source.test.ts](../../apps/api/tests/account-reuse-source.test.ts)、[account-borrow-protocol.test.ts](../../apps/api/tests/account-borrow-protocol.test.ts)、[account-lease-handoff.test.ts](../../apps/api/tests/account-lease-handoff.test.ts)、[hybrid-command-accounting.test.ts](../../apps/api/tests/hybrid-command-accounting.test.ts)。开发者先读取 fixture 和目标地址，只挑覆盖所改不变量的文件运行。

复审进一步核验了 [method-completion-native.acceptance.ts](../../apps/api/tests/method-completion-native.acceptance.ts)：已有 node:http 本地页面、服务端 hits、独立数据库、B-U 正常准备和变化复跑，可复用它的夹具模式；但脚本会调用当前配置模型并启动专属 headless 浏览器，不能在本轮直接运行，也不能代替可见浏览器人工基线。其中 document/record 都是集合选择变体，不将它们称为“列表与表单两类能力”。

[account-directory-fixture.ts](../../apps/api/tests/helpers/account-directory-fixture.ts) 是 mock UpstreamBrowserRuntime，适合状态和归属回归；它不产生真实网页请求，不能证明 TLS 或网站检测效果。`hybrid-command-accounting.test.ts` 也只证明预算语义，不证明请求总量。没有读取和核对过的夹具继续列为候选，不宣称已有真实覆盖。

已有带 `native`、`windows`、`live` 或 `acceptance` 的脚本不因为名字合适就直接执行：先核对是否连接个人浏览器、是否含真实目标站、是否创建临时资源。新的检测组件回归放在所属 package 的 `tests/`，不为文案或等价配置重复造测试。

开发报告按首次失败、修正后通过、阻塞、未测分别记录。组件通过不等于 UI/重启/全部浏览器模式通过；需要的真实证据在对应阶段补齐。

### 8.3 效果硬门：不能用功能回归代替

**只有预先登记的识别差异在有效对照中被修正，才算该项反检测改造有效。** 系统 completed、工具安装成功或几份探针全绿，都不能单独满足这一条件。

| 硬门 | 必须满足的判断 | 不通过时怎样结算 |
| --- | --- | --- |
| G1：测量有效 | 锁定探针/规则/浏览器版本；所用输入有效、机制正例有响应；明确内部未知和采集失败 | 结算测量无效，不结算候选通过 |
| G2：同条件对照 | 同 Windows/浏览器模式/硬件/出口/场景；固定 Profile 状态策略。宿主是比较变量时只改变宿主，记录不可避免差异 | 条件不同只做分层描述，不归因某个补丁 |
| G3：目标效果 | 修改前先登记“差异信号、人工参考、预期变化、判定方法”。直接自动化信号若原自动化命中而人工稳定不命中，修正后应与该人工参考一致；连续量按预登记的容差/分布判断 | 目标信号仍命中、仅总分下降、改探针规则才通过，均为该目标未达成 |
| G4：重复与独立复核 | 最少 3 组成对重复用于工程复现；新文档/延续会话分开；选择覆盖同一机制且未用于调参的探针或网站侧观测 | 单次好结果不晋级；独立复核反例未解释则保留失败。3 组不用于估计封号概率 |
| G5：业务与范围 | 相同发布链路仍正确，普通复跑零隐式 LLM、归属/恢复正确；声明网络/挑战/会话改善时必须各有对应证据 | 不能用业务退化换检测通过；未测试维度明确排除在成功结论外 |

不是所有原始指纹值都应相等：hash、时间、nonce 和正常浏览器变化不作为一刀切比较条件。判定依据必须在看候选结果前确定，禁止先看结果再挑有利字段。人工对照中的隐私/辅助功能误报与自动化信号分别分析，不能通过削弱规则为候选开绿灯。

如果当前 B-A-T 在首份探针上与人工没有可重复差异，结论是“该探针未定位到问题”，下一步使用独立观测或扩大相关维度；不制造问题来凑改造工作量。

需求满足按三层结算：A 为实验室能测出指定差异；B 为现有 B-A-T 在已测机制/环境中改善且业务保持；C 才是目标平台实际使用效果。完成 A 不能代签 B，完成 B 不能代签 C。京东当前禁止自动访问，因此本计划能规定 C 的证据要求，但本轮不能取得 C 的验收。没有这层证据时，交付名称只能是“受控范围内的改造与效果”，不能称“京东/淘宝防封已完成”。

## 9. 实施前后必须更新的记录

每个阶段更新 [RESEARCH](RESEARCH.md) 的采用依据、[ROADMAP](ROADMAP.md) 的阶段状态与 [PROGRESS](PROGRESS.md) 的当前证据。不要用本文的计划勾选项反向声称功能已完成。

```text
Reuse Assessment:
- capability: B-A-T 的宿主环境、会话/请求一致性与开源检测结果关联。
- existing implementation in repository: PythonUpstreamBrowserRuntime、RunnerProcess、B-U/workflow-use、TaskChain/LangGraph、账户及资源生命周期。
- mature candidates and pinned versions: 检测组件见选型文档；浏览器宿主候选见第 5 节。
- selected implementation: 保留原控制/编译/复跑；首批固定 fpscanner + 本地夹具/现有记录，多层缺口复用 CrowdSec，再按证据修正已有适配。
- reused public surface: BrowserSession、既有 endpoint/owner 协议、TaskChainCapabilities、CrowdSec 配置/日志/LAPI。
- B-A-T-owned adapter and remaining gap: 运行关联、版本化证据、通用任务夹具、宿主生命周期适配；无平台风控数据的部分保持未覆盖。
- license/runtime/platform fit: 产品 Windows + TS/Python；首批本地夹具，多层服务器按需独立部署；检测侧开源，候选宿主许可单独评价。
- browser/runtime/state ownership conflicts: 每运行一个实际控制会话；外部引擎无权改写 TaskRun 或关闭借用浏览器。
- replay model calls: 普通节点零隐式 LLM，检测与报告无模型调用。
- rejected candidates and evidence: 不替换 B-U、不复制 Agent/调度/风控引擎；不把 Playwright 包装层补丁当 cdp-use 全局补丁。
- focused validation: 本轮只核验源码与接口并写文档；组件运行、浏览器比较和产品改造未执行。
```

京东停止自动访问、登录检查、迁移与重试的事故处置边界继续有效，见 [账号事故与验收纠正](ACCOUNT_RESTRICTION_AND_ACCEPTANCE_20261007.md)。它属于当前开发操作范围，不向公共 runtime 添加京东特判。后续“继续开发”也不自动恢复该平台测试。
