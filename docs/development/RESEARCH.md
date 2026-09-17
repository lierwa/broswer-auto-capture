# 调研登记

> 开发入口：[浏览器任务链开发方案](BROWSER_REPLAY_DEVELOPMENT_REPAIR_20260917.md)。模块状态与验收要求以该方案及其模块文档为准。

## 2026-09-17 最小动作工具与动态摘要复用结论

沿既有 b-u Tools.action / Page / Element、StepVerifier/Tenacity、ReadSpec、AI Connect 和 TaskChain/LangGraph 接通目标滚动、条件等待、局部确定性字段读取和显式摘要。模型输入分别为 selector、selector、outputPath/container/fields、outputPath；schema、类型、预算与内部证据不交给模型重复填写。没有引入新库或替代调度器。R3c 同链两入口与 R5c/R5d 联合真实 Chromium/TaskChainRuntime 验证通过；后者模型为脚本端口，每跑1个显式LLM。原provider/业务主线仍需正式验收。复用与反例分别见 [R3c](evidence/browser-use-dom-tools/R3_RUNTIME_SCOPE.md)、[R4b](evidence/browser-use-dom-tools/R4_VISIBLE_WAIT.md)、[R5c](evidence/browser-use-dom-tools/R5_SUMMARY_OUTPUT.md)、[R5d](evidence/browser-use-dom-tools/R5_FIELD_INTERFACE.md)。

## 当前修复的复用与验收（2026-09-16）

[动作还原修复计划](BROWSER_REPLAY_REPAIR_PLAN.md) 已记录 Product Alignment、Reuse Assessment 和实际反例。沿用 b-u 0.13.8 / w-u 0.2.11 fork、原生 Page/Element/Tools、ReadSpec、StepVerifier/Tenacity 与 LangGraph；不新增驱动、模型循环或调度器。R1/R2 修复自有数据适配；R3/R5 的公开 API 细节须在定点源码核验后补入计划，不能只据方法名冻结方案。当前六项及主线未完成。

## 2026-09-16 当前：自然语言任务直接进入 b-u，移除独立规则 JSON

用户已明确需求对话只负责聊透需求并产出详细精准的执行任务列表，随后授权实施。此前“同源条款投影/再次确认”选项撤回，不再等待用户决定。生产 authoring 已移除 bat-compilation/v1/独立 authority 的依赖，任务文字直接进入原生 Agent；编译消费实际来源，无法证明的部分保留具体 gap，不能以空规则假通过。

本轮复用核验新增：原生 DOM 效果、ReadSpec 现场读取证明、Node >=24 原生 JSON source/raw API 对已有 canonical payload 的保存与重传。未新增依赖、安装或修改历史 digest；实际跨语言边界定点验证通过。最后一次原任务浏览器探索/来源保存通过，但 21 个编译缺口仍在，主线未通过，未冻结为完整可用方案。

执行及复用边界见 [NATURAL_TASK_IMPLEMENTATION.md](evidence/browser-use-dom-tools/NATURAL_TASK_IMPLEMENTATION.md)。上一轮 DOM 工具通过证据继续有效，但不替代本次自然入口与真实主线验收。下面历史“规则来源待用户决定”只代表当时时点。


## 2026-09-16 DOM 首批工具已验证，原主线在规则来源门受阻

D0–D4 首批工具及相关旧实现收敛完成：动作前可读结构、摘要完整性、统一当前作用域/集合解析、后态观察、正式编译与持久化加载已接入。真实 Chrome 验证了重建列表、重复区域、包装层、item 根/内部标题区别、越界零动作；同一持久化 chain 改序号后输出 Fresh Alpha / Fresh Beta，每次 4 个浏览器命令、0 模型。真实表单回归也通过。探索提供方为 scripted fixture，不是实际 provider 或主线业务验收。

M1 已用原 requirement v2 / plan v6 调用正式 HTTP 入口核验：返回 `409 missing_control_intent / structured_authority_missing`，停在探索前，模型/Browser/队列均未调用。原 Markdown 意图已明确，但现规范未允许其后生成投影直接成为执行 authority；[同源条款投影取舍](evidence/browser-use-dom-tools/MAINLINE_AUTHORITY_DECISION.md) 待用户决定。原 Issues 样本与同链不同输入均未通过；H7 不升级。

实现、验证命令与未测范围见 [清理账本](evidence/browser-use-dom-tools/CLEANUP.md)，正式入口实证见 [mainline-entry.json](evidence/browser-use-dom-tools/mainline-entry.json)。旧 patch/archive 继续隔离保留，受检历史摘要未变；未创建分支/worktree、提交、推送、安装或运行全量测试。下方交接及阶段叙述保留历史时点含义。

## 2026-09-16 前置工具实施范围已收敛

[开发计划](BROWSER_USE_DOM_TOOLS_IMPLEMENTATION.md) 固定首批数据充足动作、四个工具合同、复用面、清理账本和 D0–D4 → M1 顺序。复用固定版本的原生 DOM/Tools 与 w-u fork；只在具体作用域 API 缺口处定点核查，不重新开放式选型。此次为文档交接，无新增运行验证；下方暂停设计描述为历史状态。

## 2026-09-16 b-u 动作与 DOM 来源核查（设计阶段）

固定 b-u 0.13.8 默认 action schema 实测 24 种动作，当前 hybrid 18 种；原生 history 有状态展示树和交互元素 XPath，但无完整父子节点，运行时 EnhancedDOMTreeNode 提供真实关系。完整动作矩阵、复用 API、裁剪数据缺口、原任务翻页/详情点击证据与下一阶段顺序见 [DOM 交付设计](BROWSER_USE_DOM_HANDOFF_DESIGN.md)。本轮未实现、未开浏览器、未调用模型；当前方案尚未冻结。

## 2026-09-16 混合编译与 v2 接线持续开发中

**未完成，继续按 H0–H7 推进；H7 尚未开始。** 当前实现仍以受管 w-u fork 为主，宿主复用既有 TaskChain/LangGraph、版本、存储和审计。

- H0/H1：原 dirty/历史保护与 v1 零副作用退役门保持。H2：干净 188 文件基线可追溯，原 executor 两个局部缺陷已修复。
- H3：[同源离线对照与十三类问题](evidence/workflow-use-hybrid-h3/README.md) 已更新。8/38 个动作、14/59 个结构 gap 均保留；已记录 LLM definition 的 16 步不具备 action 来源，不算候选。
- H4/H5：来源绑定、稳定目标、字段效果、有界语义、条款型循环、纯输入分支、已验证线性 once 子链和输出装配已接入。9 项跨语言物化检查通过，图推进仍由现有 LangGraph 执行。
- H6 正式入口：author_task 支持既有嵌套输入合同，生成来源/候选并沿原队列做样本、换输入和授权复跑；相关正式入口及退役检查 6 项通过。原生 Agent、模型桥、脱敏 trace 与来源 artifact 已接通；旧 delegate replay 和 v1 writer/compiler 的实现已归档移出活动代码。
- H6 实际 Chrome：异步两字段表单从原生探索到候选、样本、换输入均通过；每次启用运行 4 个动作、0 次模型，禁用分支 0 个动作；验证证据在 finally 关闭后发布。模型响应为本地合成 fixture，不属于实际 provider 或真实业务验收。
- 恢复：真实只读来源恢复、页面变化拒绝、已取消恢复零动作与执行取消检查通过；表单/未决写入/人工等待不允许靠重新导航假装恢复。
- 来源/模型边界：规范化 gap 保留完整脱敏来源，模型只允许探索、判定、提取和有界语义注解；普通节点与物化不调用模型。API TypeScript 检查通过；未运行根级/全量测试。

当前继续项：完成滚动与未覆盖控制形态的准入，完成实际需求控制确认的产品衔接，收齐 H6 门后再进入 H7。未创建分支/worktree、提交、推送或清理用户历史。源码保护见 [H6 manifest](evidence/workflow-use-hybrid-h6/preserved-source.json)；实现分析见 [fork 记录](evidence/workflow-use-hybrid-h2/H3-IMPLEMENTATION.md)。

- 本轮新增：显式有界等待复用 Tenacity；原生 extract 封装与单对象字段输出修复。真实提取同链换输入结果变化，两次复跑各 2 个动作、0 次模型；相关 Python 9 项通过。
- 来源失败收尾：后续步骤失败或关闭失败保留已取得来源，closed 如实记录，零候选；正式来源/协议 5 项通过。API 类型检查通过，10 条源码归档摘要一致，本次 Chrome 专属进程残留为 0；见 [旧引用 allowlist](evidence/workflow-use-hybrid-h6/LEGACY-ALLOWLIST.md)。


- 来源重编译已接通：正式生成在编译阶段失败后复用完整且已关闭的相同需求/计划/输入来源，实际 Python 离线重编译通过；新作业浏览器会话、动作和模型调用均为 0，原来源审计保留。原生来源关闭后重编译得到相同 canonical bytes。
- 原生结构提取支持单对象及有界重复字段；旧单值 ReadSpec 的 canonical digest 保持兼容。后续动作可按输出条款引用实际已读取值，样本值不符或缺证据拒绝；两次运行消费各自动态值的跨语言验证通过。
- 当次刷新验证已完成：changed 只比较本次明确字段/标题的前后值，缺前态零动作；Tenacity 只重查事实。真实异步表单发现并修复“动作已完成后 wait 无归属”的缺口，受影响真实 Chrome 回归通过（约 23 秒）；样本/换输入各 4 动作、0 模型，禁用分支 0 动作。最新清理核查本次专属 Chrome 残留为 0。
- 普通自然语言入口仍未通过：当前 readHybridAuthority 只接受确认正文中的 bat-compilation/v1，而访谈输出普通 Markdown。是否扩展为“控制草稿随需求一起确认”已提出具体取舍，尚未改变规范或现有确认数据。H7 不冒充已开始。

## 2026-09-16 H2 fork executor 已修复，恢复推进

已按用户明确要求直接修改 w-u fork。`extract_page_content` 复用原有 extraction handler 并保留 goal/output/验证元数据；显式 ordinal 越界或非法时失败，selector/text fallback 不能绕过位置，点击前必须只命中一个元素。未指定位置保留上游行为。真实模块导入的 7 项 focused 回归通过，覆盖真实 wait/selector 方法到内存 Element.click；没有启动实际浏览器或调用模型。

此前把两个可修复缺陷作为停止 fork 开发的理由已撤销。H2 的执行器局部修复已完成；H3–H7 和正式产品接线仍未完成。下一阶段继续在 w-u fork 内做 history 规范化与动作 coverage，缺证据的动作应进入明确 gap。详情及测试边界见 [fork 修复记录](evidence/workflow-use-hybrid-h2/FORK-REPAIR.md)。下方停止结论保留为被本节取代的历史记录。

## 2026-09-16 H2 普通能力准入未通过，触发停止门

**未完成。H0/H1 通过，H2 来源门通过但复用面未冻结；H3–H7 未开始。** `vendor/workflow-use/` 已导入指定 commit 的 188 个干净文件、LICENSE 和逐文件摘要，未应用 0001–0012。原样方法探针复现 schema/executor 不一致与越界 ordinal 返回首项；真实 history 成功标志虽为 true，却没有专用逐 action 后置观察。普通执行面和区段 effect/postcondition 尚不能证明，按 ADR 0005 硬停止条件 4 停止 compiler 实现，已重做 Reuse Assessment。详见 [H2 准入证据与停止理由](evidence/workflow-use-hybrid-h2/README.md)。

保留通过的退役 gate、脱敏 fixture、干净 fork 和全部既有诊断/用户数据；不重跑网站、不续加补丁、不清理旧环境。没有把方法级探针称为包集成或真实运行通过，没有记录 H7 abandoned，因为 H7 尚未开始。下一步必须先解决 H2 普通能力与逐动作证据的成熟公开复用门，不能直接进入分类器。

## 2026-09-16 H0/H1 已通过，H2 开始

两份真实 history digest 匹配，25 个初始 dirty 文件已登记并保留。最小脱敏结构 fixture、处置与失败分析见 [H0/H1 证据](evidence/workflow-use-hybrid-h0/README.md)。v1 author/writer/compiler/replay/resume/queue/invoke 在模型准备、Python、Browser 和 capability factory 前退休；mixed 单独拒绝，v1 读取/导出保持。专用 `workflow-retirement.test.ts` 3/3 通过（内部覆盖 8 类 HTTP 命令、两种队列及子链）；API TypeScript 通过。没有运行根级/全量测试，没有真实浏览器运行、安装、提交或清理。旧 v1 正向测试与 runner/patch 仍隔离保留，H6 前不声称原子切换完成。

H2 开始核对干净固定源码与普通 executor 准入；完整 history 存在 action/result 数量不匹配，尚未证明可规范化或生成 candidate。

## 2026-09-16 混合转换合同与旧路径处置审阅

两路 gpt-6-astra 对抗审阅分别检查“browser-use history 是否能唯一编译成混合 TaskChain”和“现有垃圾代码能否安全清理/替换”。结论均为旧草案 **不通过**：它给出了方向，但没有精确合同、动作覆盖算法、控制意图缺口、binding 反例、稳定物化和证明生命周期；也没有覆盖 `app.ts -> authoring -> runtime-host -> service -> Python runner` 的真实旧执行链、v1 数据兼容和原子切换。

现已将审阅要求固化为两份规范：[混合编译规范](WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md) 和 [旧路径处置规范](WORKFLOW_USE_LEGACY_DISPOSITION.md)。新结论是：现有 TaskPlan 只能表达步骤级依赖与 once/each/batch，步骤内部 branch/loop 必须由结构化 Requirement 或用户确认的 `PlanControlContract` 提供，缺失时产生 gap；每个历史 action 必须唯一归属；同一固定输入和编译版本必须产生同一 canonical digest；v1 artifact 只读/可导出/不可执行。

真实 LangGraph 证据仍保留在 ignored `data/`。短 history digest 为 `3f941f1dc9b95780dae7e2ca5fc9e8068b7c7c6334db7a29aabc69259e647577`，完整 history digest 为 `9fbc88645c29c65155e2e235727d318f7a70e1e1accceda76eacda580197b69a`。开发只能从它们生成脱敏 fixture，不得提交原始 history、截图或 Profile。

## 2026-09-16 workflow-use 两种转换方式结论修正

当前 B-A-T runner 由提交 `7242264` 引入，并明确设置 `use_deterministic_conversion=False`。现有 ADR、调研和 Reuse Assessment 没有记录为何关闭上游 deterministic conversion，也没有使用同一份真实 history 对比两种方式。由此产生的 LLM 整图生成会把完整步骤和截图交给模型，实际暴露提示词渲染、结构化输出、样本常量和步骤语义问题；该路线不能继续冻结。

上游 deterministic converter 不调用模型生成步骤，按 browser-use 动作顺序映射 navigation/click/input/key/extract/scroll/back 等步骤并保留部分元素信息；同时存在固定动作集合、跳过动作、select 转 click、字符串模式和 reasoning 关键词启发式。它只能作为待拆解的复用候选，不能把开关改为 true 后直接接入。

本次复杂任务在排除 B-A-T 自身任务传递、动作名单和失败预算问题后，转换与执行职责仍暴露 13 类问题。当前 0003–0012 外置补丁路线停止。新的实现合同是：依据 Requirement/TaskPlan/PlanControlContract、history 和动作前后浏览器事实，将区段证明为 deterministic、explicit_llm 或 not_compilable；完整边界见 [混合编译规范](WORKFLOW_USE_HYBRID_CONVERSION_SPEC.md)，旧代码处置见 [旧路径处置规范](WORKFLOW_USE_LEGACY_DISPOSITION.md)。

## 2026-09-15 workflow-use 本地产品接线验证

固定 workflow-use 0.2.11、browser-use 0.13.8、MCP 1.29.1 和两份补丁已经通过可复现安装入口 `npm run upstream:setup`；首次安装会核对补丁 hash、应用补丁、按官方 `uv.lock` 同步 Python 3.12 环境并运行两项上游回归和 Ruff，重复运行只校验受管安装。产品默认 Python 路径指向该隔离环境，不依赖开发机历史 checkout。

正式产品 `createApplication` 使用真实 AI Connect、browser-use Agent/Browser 和 workflow-use 完成 `author_task`、样本、不同输入验证、计划授权复跑。旧 BrowserSkill executor 被设置为调用即失败且调用数为零。三次 workflow 输出分别为 Aster/7.4、Beryl/8.2、Aster/7.4；每次实际消费 3 个浏览器命令，`extract` 和 `output_conversion` 各 1 次，模型审计完整。产品链状态 `verified`，计划执行 completed，应用和浏览器最终关闭。安全证据见[产品接线验收](evidence/workflow-use-product-2026-09-15/README.md)。

本轮还区分并修复了 B-A-T adapter 的四类问题：Python UTC 时间必须满足产品 Zod `datetime` 的 `Z` 形式；started/completed 模型事件必须保持 call identity；runtime 必须拒绝重复、漏报、未声明和超预算调用；取消终态不能被较晚返回的 abort 覆盖。它们不改变 workflow-use 上游问题结论，也不扩大上游补丁范围。Windows 与 AGPL 分发仍是交付门；真实京东继续等待新需求版本确认。

## 2026-09-15 workflow-use 本地补丁与公开入口验证

原样上游 `0.2.11 @ 5d2d19f` 的 LLM workflow prompt 缺少花括号转义，修复后又暴露 schema 接受 `extract_page_content`、semantic executor 却不分派 `PageExtractionStep`。用户明确授权以本地上游补丁继续验证；两项修复分别维护为独立 unified patch 和离线回归测试，不进入 B-A-T converter/executor。

补丁系列从固定 commit 全新副本完成 apply/reverse check、回归测试和上游 Ruff check/format。公开生成入口、同输入复跑、不同 primitive 输入复跑均通过；采集任务得到 Aster/7.4 与 Beryl/8.2，非采集“填写并预览、禁止提交”任务用两个草稿输入均达到 `submitted=false`。两类任务所有原始 extraction 都是 AI-powered，没有 basic preview、raw fallback 或 error；Browser 会话分别保持一致并在 finally 关闭。

实测证明 `run_with_no_ai` 仍会因 extract 和 output conversion 调用模型，所以产品必须保留真实用途审计，不能按方法名宣称零模型。workflow-use 正常 ActionResult 的 `success` 仍可能为 null，准入要联合执行步数、error、extraction method、原始结果、schema 和完成标准。证据见[本地补丁与兼容门](evidence/workflow-use-local-patches-2026-09-15/README.md)。本地产品接线已经由上节验证；Windows 与 AGPL 分发决策仍是交付门。

## 2026-09-15 browser-use / workflow-use 原样上游验证（历史阻塞）

原始验证停止在阶段 4：真实 Agent history 的 success/judge 通过，公开 `HealingService.create_workflow_definition` 却在 service.py:296 的 prompt.format 处抛 `KeyError: variable`；没有调用生成模型，也没有 workflow candidate。已保存[同 history 证据与独立最小复现](evidence/workflow-use-2026-09-15/README.md)。该结论由上节获授权的本地补丁验证取代，仍保留作未打补丁版本的基线。

固定 browser-use 0.13.10 的 `mcp==2.1.1` 与固定 workflow-use 源码 `mcp>=1.28.1,<2` 构成最小不可满足集合，uv 0.10.9 离线解析直接拒绝。当前 workflow-use main 仍为 5d2d19fe8835cc86f1bf3e04302a5000d590f249，没有看到更新提交；PyPI 0.2.11 的依赖元数据和该提交不同，不能冒充同一制品。

上游 `workflows/uv.lock` 原样保存 browser-use 0.13.8 / MCP 1.29.1，且自带 override。使用该配置而非自拟覆盖，`uv sync --locked --no-dev` 成功安装 144 包；macOS arm64 / Python 3.12.13 的 Agent/Browser、history schema、Workflow 公共入口均可导入。默认配置目录写入受沙箱限制后，使用官方 BROWSER_USE_CONFIG_DIR 指向受控目录恢复。该结果不是 0.13.10 兼容证明。

薄模型桥复用 Fastify、Node 子进程及 aiohttp/Pydantic；只有消息形状映射，没有 Agent/DOM/workflow 执行逻辑。现有 AI Connect 0.3.2 packed artifact 的公共 `generate/generateObject` 接受消息列表及图像；`prepareInvocation` 实现仅适用 managed profile，普通账号不能走此入口。通过固定 selection 的通用 generate 接口，真实 Terra medium 单次识图/多轮记忆/结构输出通过（195 input + 31 output），usage 与 agent 用途独立保留，Python 无供应商凭据。

许可证：browser-use MIT，workflow-use AGPL-3.0。原样本地评估与最终分发必须分开；未来分发需要确定版权告知、对应源码及第 13 条网络交互义务适用范围，独立进程不自动豁免。Windows 仍待实际验证。版本、处置和未冻结决定见 [替换记录](BROWSER_USE_REPLACEMENT.md) 与 [ADR 0004](../adr/0004-browser-use-workflow-use-replacement.md)。

来源：[browser-use 固定依赖](https://github.com/browser-use/browser-use/blob/5c892e013a73e6622e6f50336e1eb0aa2c4405f2/pyproject.toml)、[workflow-use 固定声明](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/workflows/pyproject.toml)、[官方 lock](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/workflows/uv.lock)、[AGPL 正文](https://github.com/browser-use/workflow-use/blob/5d2d19fe8835cc86f1bf3e04302a5000d590f249/LICENSE)。完整日志仅存忽略的 `work/upstream-replacement-2026-09-15/`。

## 2026-09-15 browser-use / workflow-use 临时预执行复用核验

当前失败点位于真实浏览器操作之后的业务结果提交：Pi 已通过 BrowserSkill 产生工具轨迹，但 `complete_step` 要求模型一次填写业务结果、步骤元数据、聚合语义和逐字段 provenance；校验失败主要以 throw 或粗粒度“尚未完成”反馈结束，不能形成可靠的同会话修复循环。临时验证保留 TypeScript、AI Connect、Pi AgentSession、BrowserSkill、BrowserService、Zod、SQLite 和现有 TaskChain/LangGraph，只 clean-room 复刻 browser-use/workflow-use 的有界 Agent loop、结构化错误回传、增量业务输出、最终宿主验收和执行历史。不引入 Python sidecar，不复制 AGPL 源码，不在 E1 通过前编译或复跑链路。

- `browser-use` 0.13.10（`5c892e013a73e6622e6f50336e1eb0aa2c4405f2`）为 MIT；Agent 实现包含失败计数、ActionResult 错误历史和结构化最终输出，可作为行为设计依据。[Agent views](https://github.com/browser-use/browser-use/blob/main/browser_use/agent/views.py)、[Agent service](https://github.com/browser-use/browser-use/blob/main/browser_use/agent/service.py)、[License](https://github.com/browser-use/browser-use/blob/main/LICENSE)
- `workflow-use` 当前核验提交为 `5d2d19fe8835cc86f1bf3e04302a5000d590f249`，README 描述自然语言执行一次、保存历史、生成语义工作流和无 AI 复用；项目同时标注早期开发，许可为 AGPL-3.0，因此不作为依赖或源码移植来源。[Repository](https://github.com/browser-use/workflow-use)、[License](https://github.com/browser-use/workflow-use/blob/main/LICENSE)
- 当前 BrowserSkill 使用 `cli-v0.2.1`（`90b0ff301b33c90ad937a994113e494b2fa4d4f6`）；真实运行已经证明工具桥能驱动浏览器，当前选择继续复用，不新增第二套浏览器控制和会话生命周期。

完整协议、范围、错误分类和验收门见[临时预执行 Agent Loop 验证方案](TEMPORARY_PREEXECUTION_AGENT_LOOP.md)。

## 2026-09-14 多步骤计划验证复用核验

现有 TaskPlanExecutor 已拥有依赖输入解析、once/each/batch、稳定键、固定链路版本、预算累计和恢复；TaskRuntimeHost.group 已拥有单次 BrowserService 会话及 finally 回收。新增验证用途复用这两层，不另建调度器或运行数据库。8 项 API 定点回归证明完整计划结果门、下游动态输入、同会话、失败中止、同运行恢复及一次修复重验。BrowserService 替身验证中，一次探索加一次完整样本总共启动/关闭两次会话，三个样本 TaskRun 共享第二个会话。该结果只冻结软件组合边界，真实站点可复用性仍按 PROGRESS 的运行事实单独验收。

## 2026-09-14 Dify/Coze 工作流公共边界核准

- Dify 的工作流生成把模型输出限制在有意义的节点数据，图包装、节点元数据、布局和合法性由宿主补全；工具通过 provider、tool、配置和参数接入，业务动作不会各自成为平台节点类型。[Dify builder prompt](https://github.com/langgenius/dify/blob/main/api/core/workflow/generator/prompts/builder_prompts.py)
- Dify 的计划阶段先划分步骤和依赖，再由 builder 物化工作流；iteration 是持有内部子图的容器，同构处理不会展开为 N 份节点。[Dify planner prompt](https://github.com/langgenius/dify/blob/main/api/core/workflow/generator/prompts/planner_prompts.py)、[Dify iteration](https://docs.dify.ai/en/guides/workflow/node/iteration)
- Coze 的节点以统一 NodeSchema 声明输入、输出和配置；循环与批处理通过内部工作流组合，由统一运行框架管理。[Coze workflow node backend design](https://github.com/coze-dev/coze-studio/wiki/11.-Add-new-workflow-node-types-(backend))

B-A-T 据此把新链冻结为六类控制节点：`capability`、`llm`、`branch`、`loop`、`invoke`、`terminal`。浏览器点击、滚动、读取和数据变换是版本化能力配置；站点、商品、评论等只存在于任务数据。计划提供 `once`、`each`、`batch` 三种调用语义；需要跨项累计、去重或按结果停止时使用 `batch`，整份集合只调用一条含显式 `loop` 的链。

## 2026-09-13 京东登录、访问路径与频控判定

- 当前 Chrome 首页明确显示未登录，按本次判定口径属于登录过期；当前搜索、商品卡点击和详情直达随后进入 `risk_handler`/认证页，只能证明该未登录 Profile 不能继续详情验收，不能据此声称当前仍处于频控。
- 历史登录链可核验：2026-09-12 11:46 进入认证页，11:47 经 SSO 同步返回京东首页；2026-09-13 02:47 的原始 BrowserSkill 观察仍未出现未登录问候，并成功直接打开详情页。两者之间没有认证页记录。
- 历史频控可核验：2026-09-12 16:29:16–16:30:16 在同一已登录时段直接打开 11 个商品页，最后一条立即转入 `cfe.m.jd.com/privatedomain/risk_handler/03101900/`；16:44 对同一商品连续三次进入风控，16:45:51 同一 URL 又恢复成功。因此不是永久 SKU 封禁，也不是直接 URL 必然被封，更符合短时频率/会话风险限制。
- 同一公网出口的无 Cookie HTTP 对照中，首页、搜索和两条不同详情 URL 均返回 200 且未跳认证；这排除整站式纯 IP 封禁，但不能把京东内部风控归因精确到 IP、账号、Cookie 或浏览器指纹中的某一个维度。
- 已登录时“从首页真实点击能否免于频控”没有同条件的阻断后对照。历史成功运行包含真实点击，首次频控发生在密集直达批次；只能判断降低直达频率和按页面发现链接推进更稳妥，不能声称点击路径绝不会受限。

浏览器历史只按 host/path 和时间汇总；Cookie、账号标识、token、URL 查询串及页面原文均未写入项目记录。本轮到达上述结论后停止继续施压京东。

采用的通用执行策略不设置固定导航间隔：正常链路仍在上一个输入完成并写入检查点后立即处理下一个输入。计划层和嵌套链路在调度前按稳定键去重；导航失败先核验实际标签页，已经落到目标页则继续，不重新导航。浏览器只根据可观察事实区分认证、验证、429 限流、拒绝访问和瞬时故障；当前 BrowserSkill 不返回响应头，因此没有 `Retry-After` 时不猜测冷却秒数。首次探索在首个外部访问中断后拒绝本会话后续浏览器命令；计划执行则写入运行事实并熔断剩余输入，`onItemFailure=continue` 只保留给业务数据缺失。新的显式执行才构成重新开放尝试，普通恢复不创建新的失败重试运行。

该策略采用 HTTP `Retry-After` 的服务端时间语义，并遵循成熟可靠性实践中的“限制重试、只重试可安全重复的操作、非瞬时错误快速失败”。通用 API 客户端可对明确瞬时且幂等的请求采用有界指数退避和 jitter；浏览器导航无法从当前工具取得 `Retry-After`，且失败后页面是否已经落地需要先核验，因此本系统不自动套用一个猜测的固定等待或隐藏重试。[RFC 9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)、[AWS Control and limit retry calls](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html)、[Google Cloud Retry strategy](https://docs.cloud.google.com/storage/docs/retry-strategy)

## 2026-09-13 P2 受控结构读取

本机 `bsk --version` 为 0.2.1；官方 `get-html --help` 支持 tab-id、快照 ref 和 max-bytes，`snapshot --help` 支持 aria 快照。采用官方 HTML 获取加 cheerio@1.2.0 的成熟 DOM 解析，任务选择器只存任务数据，禁止任意脚本和临时引用；仅返回受限文本、公开链接和允许的状态属性，不持久化原 HTML。[Cheerio 官方 load 说明](https://cheerio.js.org/docs/basics/loading/) 已核验，registry 要求 Node >=20.18.1，本机 Node 24.14.1。离线用例通过；P6 已实际核验 get-html 返回 html/truncated/byte_size/tab_id，原 HTML 仅在内存读取。具体任务字段、业务来源和复跑仍需 P6 实际运行验证。

当前采用状态和开发阅读顺序见 DEVELOPMENT_BASELINE.md，实测完成度见 PROGRESS.md。下文保留历史调研依据；日期较早的候选或原型记录不代表当前产品实现状态。

## R-016 Plan 内按需来源取证（2026-09-11）

来源证据与计划草稿由一次 Planning Run 共同产生，唯一事实源是版本化 `PlanRecord`：`evidence` 保存查询、候选、观察、coverage、gap 与审计，`proposal` 保存步骤、依赖、预算和完成条件，`stage` 明确 `assessing`、`source_evidence`、`drafting`、`complete`。是否需要浏览器调查由 Plan 根据已确认结构化需求判断；无需调查可直接成稿，用户提供 URL 仍只是待核验候选。

独立 ResearchState、SQLite research 表、`/api/research`、Sources 页与客户端连接已退出当前合同。证据不足时，Plan 保存已取得事实、证据摘要和诚实的待核验步骤；零已采纳来源时 proposal 可查看但保持 `blocked`，由计划页重试取证，不能伪造成可执行。只有业务口径仍需用户决定的 gap 才回需求对话；登录、验证码和 cleanup 继续由浏览器状态提示人工处理。相同 requirementVersion 与 revision 的既有证据只有摘要校验一致且满足计划门时才可复制进新 PlanRecord，并以 `reusedFromPlanId` 明示来源。

迁移不改变 BrowserSkill 的单会话、来源防伪、访问限制、cleanup、预算及显式执行授权边界，也不扩展 `brief=null` 的下游能力。R-010/R-011 与 F3/F4 记录作为迁移前真实验收保留；其中独立 API、表、页面和 ResearchRecord→Plan 绑定不再描述现行入口。

## R-015 公共 Agent surface 生产接入（2026-09-10）

BCT 生产组合从 `@agent-platform/ai-connect-react/chat` 消费公共 Timeline 投影、answered Interaction entry 和 choice/multi-choice/free-form Question registry。BCT 的适配止于把 ProductStore 快照变成 canonical message/content entries、当前 waitpoint、Run 和合法命令；共享实现负责 turn/currentRun/Surface/history 的唯一投影。业务事实、幂等 command、revision 和任务隔离仍由 BCT ProductStore/SQLite 负责，没有新增 event、reducer、store 或公共 SDK envelope。

采访 Skill 已按 blob `2f7588c637d014eeb9f2cbdfd96325aab1a0b949` 准确恢复。公共 Flat XML authoring 是独立运行格式层：普通文本仍是唯一 assistantText，`question-panel` 产生既有 Question，`interview-result` 产生既有结构草稿；terminal Zod 校验后才写入 ProductStore。协议测试核对 Skill 业务章节、authoring 标签与 JSON Schema 同时存在，因此恢复结论是业务基线准确、运行格式适配独立。

可靠 `question-panel` 或 `interview-result` 可以在没有普通文本时单独提交；BCT 的 terminal schema 要求安全正文、问题或草稿至少存在一个，并继续拒绝问题与草稿同轮出现。Workbench 的 canonical message 只读取 ProductStore 已校验正文，公共 `text.delta` 仅保留为 typed lifecycle/activity 证据，不再形成第二条消息或泄漏 authoring JSON。

`options=[]` 是正式开放题；答复携带同一 Question identity 和当前 revision，立即形成 `free_text` decision 与不可变 history，即使后续模型失败也保留，retry 不重复用户消息。SQLite decision 列原本为 TEXT，TypeScript enum 扩展即可读取 option、free_text 和 draft_confirmation；关闭重开测试已覆盖，无 schema migration。新选择题只在 terminal 接受边界拒绝重复 label；历史读取继续兼容，歧义记录不合成错误的 locked choice。

release manifest 是跨仓同步事实：包含 producer HEAD/dirty、依赖 source hash、包名、版本、完整 tar SHA、exports 和 styles。consumer 支持 sibling 默认发现、`AI_CONNECT_PRODUCER_ROOT` 或 ignored 配置覆盖，并在复制/lockfile 更新后复验同一份 manifest。当前实际字段与 hash 见 PROGRESS；公司 Windows/macOS 的独立 checkout 复现仍需后续环境验收。

## R-014 共享模型接入与访谈调用（2026-09-07）

2026-09-10 决策取代本节的“渐进采用/仅展示事件”边界：BCT 与 opencode Examples 必须消费同一套[公共 Agent host surface](../../../opencode/docs/platform/ai-connect-host-surface-parity.md)，完整复用生命周期投影、Timeline、Composer、模型设置及 Question 注册与开放题答复。BCT 只保留浏览器抓取 Skill、Workflow、业务事实和宿主命令；主题色、助手名称、图标可配置。下列内容作为 2026-09-07 的历史迁移证据保留，不能继续用来批准薄投影。

需求访谈是本轮唯一迁移的产品模型入口。服务端保存显式共享模型选择，并在一次 turn 开始时冻结；存在该选择时，访谈通过 `@agent-platform/ai-connect` 的 JSON Schema 结构调用，原业务解析继续校验完整结果。公共 `AIEvent` 随 assistant 消息保存在既有任务事实中，Workbench 通过 `@agent-platform/ai-connect-react` 的现有 Timeline 投影展示调用过程，不维护流解析、delta 合并或终态状态机。

未保存共享选择时明确提示先完成模型设置。共享调用失败会形成可见失败事实，不自动回退、切换模型或重试。来源调研、计划、探索、修复和显式 LLM 节点均通过同一 SharedAI port；一次 execution 首次需要模型时才准备，并在该 execution 内复用冻结选择。旧 Codex App Server 运行路径已删除。

账号凭证由 AI Connect 的本机存储负责，选择由 ProductStore 负责，访谈草稿与状态仍由原任务数据库负责。新 AI 路由沿用 127.0.0.1、Host/Origin 边界，并要求浏览器修改请求提供 same-origin fetch metadata；它维持本机单用户信任模型，不声称区分其他本机进程。未迁移或读取真实凭证。

Baseline Impact:
- touched layers: contracts、API account/selection adapter、requirement interview coordinator、Workbench settings/Timeline。
- owning fact source: AI Connect 拥有账号与调用事件协议；ProductStore 拥有选择和业务消息；访谈状态仍为唯一业务结果源。
- public interface changed: 消费 `@agent-platform/ai-connect` 与 React 0.2.3 公共接口；BAC 自身消息契约增加已校验 `aiEvents`。
- new protocol/adapter/fallback: 复用现有 HTTP/NDJSON 通道的 typed event 字段；无自动 fallback。
- compatibility or legacy path changed: 未显式选择时不再执行旧 Codex 默认路径；现有设置提示、业务失败事实和历史 audit 数据保持兼容。
- baseline update required: yes；公共 surface 一致性成为宿主接入门，职责归属与本机单用户架构保持不变。
- architecture tests to run: 公共协议与组件所属测试，加少量 BCT 真实宿主业务链；覆盖生命周期、事件终态、开放题答复、草稿门和失败不回退，不用重复大快照替代行为验收。

Patch Disposition:
- keep: 原 Codex 默认访谈与所有未迁移模型用途、现有任务事实和 NDJSON 通道。
- rewrite: 完整公共 Agent surface 的宿主接入；删除 BCT 自有的裁剪投影和重复交互实现。
- delete: none。
- reason: 两个产品共享同一公共 Agent 能力与表现，只允许 Vertical 业务语义和宿主品牌配置不同。

## R-013 F6 批量执行与生命周期（2026-09-06）

复用已有 LangGraph、BrowserSkill、SQLite/Drizzle、Zod、Radix；没有新增运行依赖。正式队列改为消费完整上游去重结果，各步骤分别进行探索/验证后批量执行。检查点绑定图摘要、输入、节点游标、循环计数和页面证据；同运行恢复核验浏览器实际状态，独立复跑创建新运行。原始页面仅进入忽略的本地运行存储，导出排除检查点页面，日志只保留摘要、计数和用途审计。

每步骤的探索、验证、执行与恢复共享命令/时间/模型预算。普通节点无模型入口，指定步骤的修复有独立授权及新链路版本；未验证下游保持等待。意图先持久化，未知回报保留 null。SQLite v7 解除每计划只有一条执行的限制，保留初次执行唯一性、单活动浏览器和每任务待处理运行唯一性；迁移与真实进程崩溃恢复由所属 API 测试覆盖。

完成覆盖要求从绑定目录起点执行、取得实际末页及字段证据。新增普通节点 branch_target 检验当前下一页控件可用性；branch_page_changed 支持末页仍有下一页控件的站点，但还必须与独立末页输入验证的终态指纹吻合。单次点击无变化、商品锚点、固定页数或安全循环上限均不足以支持完整目录结论。

用户已明确授权海尔目录新预算，方案与逐步骤值见 F6_ACCEPTANCE_PLAN.md。程序支持最多3850条/24分钟，默认计划仍限制500条/5分钟，历史预算不变。真实旧预算运行保存258个去重目录链接，详情修复90秒耗尽；新 v6 运行在分页交互不生效时停止，尚未取得完整目录证据。UI 原生点击和退出动画也存在待查交互问题；DOM事件回归只作有限证据。最终通过、失败、阻塞与未测详见 PROGRESS。

## R-012 F5 探索、动作链路与代表验证（2026-09-06）

沿用已锁定的 LangGraph、Zod、BrowserSkill、ReactFlow 和 Radix，不新增引擎或图编辑基础库。`capture-compiler` 校验受控动作、边与可达性、显式结束以及所有环都经过有界 loop；循环耗尽必须走 stop，不能把安全上限当完整结束。动作参数只支持语义目标和受控输入占位，不接收任意脚本、持久 @eN 或页面执行代码。跨边界立即 Zod 校验。

官方 [App Server](https://learn.chatgpt.com/docs/app-server) 的模型/effort 参数沿既有 managed 登录适配。用途路由固定为访谈/来源/计划 Terra medium、首次探索/用户修复 Sol high、显式 llm 节点 Luna medium；修复产品入口属 F6。普通节点没有隐式模型能力。意图先持久化，未回报调用保持 null，实际回报路由严格核验。供应商严格对象 schema 需要全部属性出现在 required；本地兼容旧计划缺省 maxLlmCalls=0，生成 schema 明确要求该字段。

探索模型获得当前观察、内存中的已做动作/页面差异、剩余预算和失败原因，服务只保留观察 URL/哈希与判断摘要，不把原始页面内容写日志。命令、时间、探索调用、显式 LLM 调用各自受授权约束；同一步最多两版本重探共享原预算和截止时间，前置已验证步骤保留。调整步骤预算必须新计划和独立授权。

F5 每组输入最多验证两个 checkpoint，记录 termination=validation_window 或 finish。DSL 保留完整循环；F6 全量执行不传此窗口。换输入不仅要有已观察到的不同参数，还要求实际稳定来源键集合非空且不同。链路已验证不等于整个需求已完成，前序样本也不是完整批量输入集。

真实海尔目录编译出12个节点，分页输入1得到36条，输入15得到6条，5次 Sol/high 回报、81条底层命令。当前终止分支用当时末页商品 BCD-309WMCO 作页面锚点，属于该目录快照；F6 必须核验当前总量、真正末页、重复项及结构变化，不能仅凭锚点或 finish 宣称全覆盖。collect 在90秒步骤预算处停止，派生未开始。完整三步骤真实验证、全目录、第二站点和生命周期仍为后续验收门。细节与运行 ID 见 PROGRESS。

## R-011 F4 正式计划与授权（2026-09-06）

> 历史实现证据。现行事实归属与入口由 R-016 取代。

复用现有 Codex App Server Terra/medium、Zod、SQLite/Drizzle、BrowserService 和 Radix；未新增运行依赖。计划制定是独立的 `plan_creation` 用途，一次显式模型判断，在服务端校验后持久化；规划不打开浏览器。输入为已确认 RequirementBrief 与真实 ResearchRecord；模型不接收宿主工具、原始页面、任意 URL 执行能力或数据库写能力。

计划保存需求版本/revision、来源 id/version/内容摘要、完整需求、采纳来源、步骤图及字段/目标/缺口处理。每项需求字段和调研目标必须完整唯一映射；页面字段必须有同名实际来源依据。派生或允许缺失字段须引用已确认 constraints/proposedDefaults 的索引，页面字段与说明输出分别展示。每个来源 gap 都需解释并分配执行、派生或阻塞；requiresUser 的缺口必须阻塞。该机制结合模型语义判断、结构校验和用户审阅，不声称自由文本的所有语义均由静态规则证明。

预算以现有 BrowserHost 的单会话硬边界为上限：全部步骤合计最多 500 条底层命令、300000ms、12 次首次探索模型调用，计划可更保守。预算不改变完整目标；耗尽应暂停并保留剩余范围，扩预算或新增来源产生新计划与授权。F4 校验/保存逐步骤预算，浏览器入口执行本次总命令/时间上限；逐步骤模型调用门、探索、验证和恢复接续由 F5/F6 执行器实现。当前真实验收计划的总预算为 480 条、300000ms、6 次探索调用，不表示足以完成整个目录。

SQLite v5 原子增加 plans/executions；授权、队列与请求幂等在同一事务提交。唯一约束限定每计划一个初始授权、每任务一个待处理执行及全局一个 running。FIFO 队列复用已有 BrowserService 的进程内锁及 BrowserHost 的跨实例锁，清理待完成时不占用浏览器。非 source_research 浏览器调用必须通过队列校验 task/run/版本/来源域/预算，F4 只为已绑定 running 的 exploration 放行。

F4 默认没有 PlanExecutor，授权记录持久停留 queued 并显示“等待探索执行器接入；尚未开始抓取”；`PlanExecutor` 是 F5 注入的内部依赖。测试处理器只验证串行调度、取消与回收，不是站点探索证明。进程重启时 generating/running 分别转 interrupted，queued 保留；需求/新来源使旧计划待复核，尚未开始的旧授权由队列转 stale。恢复不自动重放。真实范围、预算与队列证据见 PROGRESS。

## R-010 F3 真实来源调研（2026-09-06）

> 历史实现证据。现行事实归属与入口由 R-016 取代。

复用 BrowserService、BrowserSkill 0.2.0、SQLite/Drizzle、现有 Codex App Server 和 Radix；未新增运行依赖。正式入口为 GET/POST `/api/research?taskId=...`。模型仍通过 [App Server 的结构化输出](https://learn.chatgpt.com/docs/app-server) 返回判断，沿用 Terra/medium；首次操作探索 Sol/high 与显式节点 Luna/medium 仍由后续阶段实现。宿主 shell、插件和网页搜索工具保持禁用，浏览器动作全部经过受控服务。

浏览器语义观察实测不含 href。固定只读表达式只提取当前地址、标题和最多150个可见链接，并检查 `ok=true`、tab与观察前后URL一致。表达式不能从 HTTP 或模型输入替换。动态 `follow` 只允许 source_research 用途访问本会话真实发现的目标；Bing跳转目标仅从真实 href 的编码参数解码。搜索入口是固定的通用搜索服务，具体品牌/站点/商品 URL 由页面发现。登录与秘密参数链接过滤，明确访问闸门由文本和模型语义两层停止。真实验证见PROGRESS。

来源调研单次上限为5次查询、10个代表页、16次显式模型判断、180个底层命令和5分钟；一个会话串行使用浏览器。需求没有链接时仍可搜索，confirmedRequirement负责有效结构需求门。SQLite v4用独立调研记录保存版本、查询、候选、观察摘要哈希、选取的公开证据、覆盖/缺口、模型用途审计与单调sequence。页面原文只在内存传递；模型选E编号，服务从该次观察提取对应原文，防止模型重写引文或猜URL成为证据。证据中的@eN仅是历史观察引用文本，不得成为后续链路定位参数。

候选不等于已观察，搜索页不作为采纳来源；缺字段/调查目标/枚举依据保留partial。当前覆盖检查较保守：需求中派生的“字段缺失说明”也可能被报告为无页面字段依据。F4需依据已确认缺失处理规则区分页面采集字段与计划产生的说明字段，并审阅partial中的实际影响；不能静默忽略真正的来源缺口，也不能要求F3先完成全量采集。本阶段未冻结自动跨站重定向放行、搜索服务自动切换或完整分页采集。

停止先中断浏览器和模型，等待回调退出再提交终态；崩溃后的running转interrupted，审计次数未回报保持null。重新调研产生新来源版本，历史保留；需求变更产生stale投影。界面复用Radix Select/Callout/Button/DetailPane，支持历史版本、来源详情、重试原请求和带证据回访谈。

## R-009 F2 BrowserSkill 受控适配与生命周期（2026-09-06）

采用固定 BrowserSkill CLI + Node spawn 参数数组的薄适配，复用已有 proper-lockfile 4.1.2 与 SQLite/Drizzle；不新增浏览器驱动或模型执行器。以实际 `session start/stop`、`tab list`、`observe`、`navigate/click/fill/press --help` 和本地真实页面核验协议。CLI 0.2.0、扩展 0.2.0、daemon protocol 1.1 当前 doctor 通过。命令形状通过 Zod 校验，语义动作重新观察，临时 ref 不作为外部输入；动作返回还校验 tab 归属。

本机初始 CLI 0.1.11 出现更新提示但 Windows replacement helper 未完成替换。空 session 列表后停止 daemon，以[官方 0.2.0 release](https://github.com/Tencent/BrowserSkill/releases/tag/cli-v0.2.0) Windows 压缩包完成更新，下载 SHA-256 为 `57c0459711125c4a5c7f5759ef15b5e45c942e69afa43aaf22bfa06f7fec4590`，与 GitHub release asset digest 一致。旧二进制备份仅在忽略的 work/tools 中，不纳入交付。

真实调试曾见输入命令返回但页面不变；只读命中检查指向自动化遮罩。[官方交互实现](https://github.com/Tencent/BrowserSkill/blob/cli-v0.2.0/apps/extension/src/tools/interaction.ts) 本身负责自动化期间遮罩与原生输入，产品没有注入遮罩修改脚本。不能由该观察推定每次失败原因相同；最终采用正常前台 session、最新语义定位与有界可见文本核验，通过真实 Enter 和 click 的两段导航。命令预算耗尽/就绪超时仍是失败，不能盲目重复点击或把命令 ACK 当业务完成。

服务按任务/需求版本授予内部能力；HTTP 仅暴露状态及绑定 run 的停止/清理。所有权不明时阻止新任务；明确 session 才能做定向恢复。当前保守文本闸门只负责停止与待人工状态，F3 仍要用真实来源观察判断页面归属、字段和覆盖；完整实际站点、登录恢复与规模另设验收门。证据见 PROGRESS 的 F2 段。

## R-008 需求草稿可调宽抽屉（2026-09-06）

草稿统一使用 Radix Dialog 管理模态、Esc 与焦点恢复；宽度拖拽复用 [re-resizable](https://github.com/bokuweb/re-resizable) 6.11.2 的 size、左侧 handle 与 onResizeStop。握柄使用 Radix IconButton 补充方向键/Home/End，业务层仅保存任务内宽度偏好并按视口约束。版本和节点选择复用现有 [Radix Select](https://www.radix-ui.com/themes/docs/components/select)。实际 TypeScript 与构建核验依赖 API，没有读取 node_modules。

## R-007 目标驱动访谈与结构需求交接（2026-09-06）

真实 Terra/medium 经正式 API 创建任务、持续对话与草稿落库验证。原先强制每个问题提供 2–3 个选项会把自由名称输入包装成无效操作选项；现在契约允许零选项，界面直接使用现有输入框。必要业务选择、系统调查事实及建议默认值分开处理。相同业务需求可以首轮出草稿，也可以补充一个必要名称后完成。

模型输出唯一结构化 RequirementBrief，服务与界面共享 Markdown 渲染；确认绑定 taskId/draftVersion/revision。SQLite v1→v2 原子添加可空 brief，旧草稿/确认保留；旧 Markdown 不自动推断成新结构。来源调研需要入口、代表样本、完整枚举方法和字段可得性证据，批量枚举与逐项采集由正式计划组织。该交接设计不代表 F3/F4 已实现。

实际供应商错误证据：首次结构输出请求被 App Server 以 invalid_json_schema 拒绝，定位到 providedUrls 的 JSON Schema format=uri。仅在发给供应商的 schema 中移除此不支持格式；返回后仍使用本地 Zod URL 校验，且 providedUrls 必须来自用户实际文本。修复后真实轮次成功。早期调研任务混入全量采集、纠正残留旧名称片段和排序建议缺失均经真实输出发现并收紧 skill；具体案例及复核结果见 PROGRESS。普通测试与浏览器 fixture 只验证协议/交互，模型质量另行人工核对实际输出。

## R-006 F1 正式本地服务与持久化验证（2026-09-06）

根目录开发入口复用 [concurrently](https://github.com/open-cli-tools/concurrently) 10.0.5 与 [cross-env](https://github.com/kentcdodds/cross-env) 10.1.0，统一启动 API 和 Vite；开发 API 关闭静态构建托管，首次开发无需 dist。Windows 实测页面与 API 代理读取通过，Ctrl+C 后两个端口释放。两项仅为开发依赖。

沿用已批准方向，当前实际依赖为 Fastify 5.12.3、@fastify/static 10.1.3、Drizzle 0.45.2、better-sqlite3 12.10.0、proper-lockfile 4.1.2。本机 Node.js 24/Windows 的同步 SQLite 事务提交/回滚、独占目录锁、JSON 保留原件与原子批量导入均通过所属 API 测试。

选择同步短事务保存任务事实；模型调用与等待均在事务外。F1 按任务重投影小规模访谈表，避免跨 JSON 文件半提交；后续规模优化可改增量写入，保持事实归属。数据库 WAL 与外键启用，服务启动先导入、后恢复，再接受请求。同一数据目录的第二服务立即拒绝启动；真实子进程 SIGKILL 后，新 Node 在既有约 10 秒 stale 锁窗口后恢复为 interrupted，历史消息/草稿完整。

正式命令返回 JSON，持续观察单独使用 NDJSON sequence 快照；刷新/断线仅重建观察，不重启模型。浏览器实际回归发现原生 fetch 的接收者绑定问题，已改为普通函数转发后通过。来源与浏览器队列不在 F1 中冻结。详细计数和未测范围见 PROGRESS。

## R-005 需求访谈、来源调研与工作台设计修订

日期：2026-09-06。迁移前设计记录；现行来源证据归属由 R-016 取代。本项复用现有组件，不新增运行依赖。

- 已核对 `domain-analysis` 的 `categoryInterviewModule.ts`：每轮保存消息、建议/确认决策、待决事项与草稿版本；新输入退出可确认阶段；确认最新草稿后单独 materialize 正式任务。`crawlPlanningModule.ts` 独立管理规划与计划确认，`InterviewThread.tsx` 使用持续对话。相邻项目只读，不修改其源码或数据库。
- `grill-with-docs` 的逐问、推荐答案与随答沉淀落实到访谈设计；CONTEXT 只保存术语，PRODUCT_FLOW 保存十阶段、输入产物、确认门和失败回路，不为每句用户回答创建工程 ADR。
- UI 沿用 Radix Themes 与 React Flow、集中语义 Token；需求对话和草稿并排，来源/计划/链路/结果独立切换。链路按步骤展示条件分支、翻页回路、检查点和节点输入输出。
- 当前访谈使用 assistant-ui、私有 skill 和真实 Codex App Server，自由输入进入多轮访谈并可形成版本化草稿；多任务独立保存。来源调研与执行尚未接通；样例图和样例结果不成为当前任务的执行证据。
- 验收门：状态/图结构测试、类型检查、构建，以及真实浏览器的切页、版本、自由输入门、节点检查、深浅主题和 804px 布局。最终结果见 PROGRESS；不能把单轮模型 probe 或前端状态测试当成完整产品访谈通过。
- 按负责人授权执行 `codegraph init -i`，索引 30 个文件、374 个节点、344 条边；索引在忽略目录中，未纳入 Git。后续结构查询优先使用该索引。

## R-001 开发阶段模型分工

日期：2026-09-05。状态：开发期模型规则已收敛为 Astra/Sol；实际启动是否生效仍以 `turn_context` 为准。

本项讨论开发工具的模型分配；产品运行时模型接入单独调研。普通抓取链路复跑遵守 README 的零模型调用验收。

| 工作 | 已确认模型 ID | 起始推理深度 |
| --- | --- | --- |
| 主 agent：拆分、协调、集成与最终验收 | `gpt-6-astra` | `high` |
| 所有开发子 agent，包括简单任务 | `gpt-5.6-sol` | `high` |

以上是负责人确认的开发分工规则。开发子 agent 不再使用 Luna、Terra 或按复杂度分档；测试失败仍须先区分实现、环境和来源状态。产品运行时模型接入保持独立路由，不受此规则影响。

### 任务派发规则

每项任务派发前必须记录目标、输入、依赖、文件范围和验收。主 agent 使用 Astra high；凡开发子 agent，无论简单实现、常规模块、协议、生命周期、调研或测试，均使用 Sol high，同时运行最多两个。

任务不明确时，先由主 agent 澄清并拆分，再派发。启动后核验实际 model/effort 与任务单一致，不一致时不接受任务结果为完成。复杂度变化时停止盲目重试，说明原因并由主 agent 重新拆分或接管。代表性任务验收用于检验路由是否正确，不承诺绝对零质量问题。

较高推理档位通常耗时更长、使用更多 Token；本项目开发期统一选择上述已确认的 high 配置，并以任务边界和验收门控制成本与返工。

当日 Codex 标准速率，单位为每百万 Token 的 credits：

| 模型 | 输入 | 缓存输入 | 输出 |
| --- | ---: | ---: | ---: |
| GPT-6 Astra | 250 | 25 | 1250 |
| GPT-5.6 Sol | 100 | 10 | 500 |

这些是 Codex credits 费率，不是 API 美元价格；实际任务成本同时受上下文、缓存、推理、工具输出和返工影响。API 或产品运行时预算需要独立核算。优先使用 Standard 速度；Fast 消耗更多 credits。

官方来源：

- [模型定位与推理档位](https://learn.chatgpt.com/docs/models)
- [Codex 用量与 credits 费率](https://learn.chatgpt.com/docs/pricing)

## R-002 运行与编排组件

状态：技术方向已确认，官方资料初查完成；以下仍是待原型验证的候选方案，不代表选型已通过。

### 本地应用与数据

- 确认方向：TypeScript、Node.js 24 LTS、npm workspaces、React/Vite、Fastify、Zod；对话与节点展示优先验证 assistant-ui 和 React Flow。
- 数据候选：SQLite、Drizzle 与本地原始文件；适合当前 Windows 本机使用边界。PostgreSQL 是需要更强数据库并发能力时的对照候选，代价是额外服务部署。
- SQLite 驱动与 checkpointer 的实际版本、Windows 安装和并发行为需要原型确认；业务表与引擎表的职责在架构阶段明确。

### 编排候选

#### S0-03 原型审阅与 S0-08 补充门

> 2026-09-12 收敛结论：原型中的 LangGraph 选型进入正式 `TaskChainRuntime`，继续由 `StateGraph` 承担图推进、循环、取消和递归限制。XState 只完成恢复语义对照后删除。原型专用 `SqliteSaver` 独立数据库没有进入生产；正式 `TaskRun`/`TaskCheckpoint` 作为产品事实由已接通的 SQLite/Drizzle 仓储持久化，避免同一运行出现两个权威状态。以下保留当时原型证据。

2026-09-05 对初始内存原型的审阅发现执行预算、恢复输入绑定和调用审计缺口。S0-08已用请求级Zod校验、run/workflow/version/输入指纹绑定、显式递归预算和边界事件替换对应实现；30项循环完成，32项任务在第17项暂停后可由新Node进程恢复完成。原型边界详见 `packages/runtime/PROTOTYPE.md`。

S0-08 必须覆盖：超过引擎默认25 superstep的有界循环；运行ID绑定链路版本及输入指纹，恢复拒绝换输入；AbortSignal中断真实异步工作；checkpoint与结果去重一致；零模型证据从受控模型adapter调用事件派生。对普通节点还需隔离模型/网络入口，不以可任意更改的计数充当真实来源复跑证据。

已安装组合为 LangGraph 1.4.14、core 1.2.9、checkpoint 1.1.5、官方SQLite checkpointer 1.0.4（MIT）及better-sqlite3 12.10.0。使用npm正常依赖求解，未绕过peer约束；Windows/Node24安装与跨进程恢复通过。采用官方checkpointer，引擎检查点使用独立文件与生命周期；Drizzle产品事实表尚待S0-09验证。

资料：[LangGraph持久化](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[XState持久化](https://stately.ai/docs/persistence)、[Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite)。XState 5.32.6实际对照测试确认活动invocation会在快照恢复后重启；副作用仍需要幂等与恢复门。多进程同时写同一数据库的锁冲突尚未验收，产品单执行队列也未接入。

当前完整锁文件在官方npm registry执行 `npm audit --registry=https://registry.npmjs.org --json` 为0项已知漏洞，包含开发依赖；Vite锁定7.3.6。默认镜像没有audit接口。每次锁文件改变后再审计，扫描结果仅代表公告库覆盖范围。

2026-09-12 本轮锁文件变更后复查，上述历史“0项”结果已经失效：当前审计报告 1 个 high、3 个 moderate 依赖条目，根因均为本地 AI Connect 0.3.2 发布包精确锁定的 Hono 4.12.12，`fixAvailable=false`。该问题不由 LangGraph 引入；B-A-T 不擅自改写共享发布包的依赖清单，需在 AI Connect producer 升级并重新发布后同步。

| 候选 | 官方依据 | 主要代价与验证门 |
| --- | --- | --- |
| LangGraph JS | MIT；TypeScript/JavaScript；节点可执行普通函数或模型调用；支持条件边、循环和持久检查点 | 需要适配链路定义和 checkpointer，并证明普通节点无模型调用；恢复时必须重新建立可用浏览器状态 |
| XState v5 | MIT；JavaScript/TypeScript；状态机、Promise actor 和持久快照 | 恢复会重新启动 invocation；需额外验证可变抓取链路、进度持久化和浏览器副作用的组合成本 |

负责人确认优先验证 LangGraph JS，并以 XState 做对照。原因是 LangGraph JS 的节点、连线、循环和检查点与当前抓取链路概念直接对应。本地运行、无需托管服务的组合是验证目标；具体采用决定在同一套最小原型比较后记录。

链路表示方向已确认：采用受控版本化节点图，记录已实现浏览器动作及其参数、定位和提取规则。恢复按商品和步骤设置安全检查点。

关键通过门：动态生成链路、普通异步节点、循环终止、显式 LLM 节点、模型调用审计、取消、进度持久化、恢复后的浏览器状态核验、Windows 安装和新输入复跑。

初查覆盖官方文档、许可和当前仓库；选定版本的发布活跃度、完整依赖许可、安全公告、Windows 原生依赖、离线运行以及升级退出成本仍需在锁定版本前核验。替换编排组件时保留产品链路、原始数据和验收语义；引擎检查点迁移成本列入选型。

来源：

- [Node.js 发布状态](https://nodejs.org/en/about/previous-releases)
- [Fastify](https://fastify.dev/docs/latest/)、[Vite](https://vite.dev/guide/)
- [Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
- [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)、[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[官方仓库](https://github.com/langchain-ai/langgraphjs)
- [XState 持久化](https://stately.ai/docs/persistence)、[官方仓库](https://github.com/statelyai/xstate)
- [assistant-ui](https://www.assistant-ui.com/docs)、[React Flow](https://reactflow.dev/learn)

## R-003 开发任务控制与产品模型接入

状态：官方接口、开发期配置与实际turn_context已核对；S0-07真实聊天与中断probe通过，S0-09产品会话/API/UI集成待实施。

### 开发任务

官方 Codex 支持项目级 `.codex/config.toml`、`.codex/agents/*.toml`，以及角色级 `model` 和 `model_reasoning_effort`。子 agent 默认模型与推理深度分别使用 `agents.default_subagent_model` 和 `agents.default_subagent_reasoning_effort`；并行上限使用 `agents.max_concurrent_threads_per_session`，且该数量不含主 agent。

开发方式：主 agent 固定使用 GPT-6 Astra high 管理任务和集成，按需同时启动最多两个开发子 agent；所有开发子 agent 固定使用 GPT-5.6 Sol high，包括简单任务。每项开发任务记录编号、依赖、文件范围、产物和验收命令；实际启动后核验 `turn_context` 中解析出的 model/effort。项目配置提供默认值，显式启动参数可覆盖默认值，因此两处都必须遵守同一规则。

阶段状态以 PROGRESS.md 为准。开发子 agent 数量与抓取时的浏览器并发分别控制。

### 产品运行时

#### 本机账号接入基线（2026-09-05 现行代码核验）

负责人选定本机官方 Codex 账号作为产品聊天基座。只读核验 `D:/work/domain-analysis` 的 `master` / `93a57b6219229796f811ca45cea142f93097ae4d`，工作区干净；本机 `codex-cli 0.150.1` 的 `codex login status` 返回 `Logged in using ChatGPT`。登录检查证明账号可被官方 CLI 识别，真实模型请求另设验收门。

复用来源为 `packages/workbench/src/` 下的 `codexAppServerTransport.ts`、`codexAppServerClient.ts`、`codexAppServerNotification.ts`、`codexCategoryInterviewRuntime.ts`、`codexStructuredOutput.ts`，以及对应所属 package 测试。采用该实现的边界与组合方式：

- execa 负责 Windows 进程生命周期，ndjson 负责 JSONL；由项目锁定的官方 Codex 包启动 App Server。环境只统一 PATH 键；凭证始终由官方登录持有。
- 每个连接一次 initialize/initialized；每轮新建 ephemeral thread，产品会话与计划由应用自己保存，模型线程只是执行上下文。
- commentary delta 与 item 生命周期即时投影；final_answer 只在官方 turn/completed 成功且本地 Zod 校验通过后成为产品结果。
- 取消使用 turn/interrupt；失联或超时后有界退出。认证失败显示本机登录要求；原始 stderr 和认证细节不进入用户事件与日志。
- 需求聊天原型禁用宿主 shell/plugins/hooks/memories；BrowserSkill 探索使用单独的受控工具原型验证，工具权限由用途决定。

官方协议已通过 OpenAI Docs 实际读取核验：[App Server](https://learn.chatgpt.com/docs/app-server)。该组件的 transport/协议能力与来源实现属于已知基线；本项目适配、模型请求与安全关闭仍以 S0-07 的实际测试为准。

S0-07 验证门：Windows 启动、官方 account/read 仅投影登录状态、至少一轮真实需求聊天与结构结果、流事件到达、错误结果不提交、串行连接复用/会话隔离、中断和子进程关闭。禁用工具的聊天原型不代表已完成 BrowserSkill 探索。

官方 Codex App Server 支持 stdio与ChatGPT managed登录；启动turn可以指定model与effort。负责人已选定本机账号接入基线，由工具自身持有需求、计划和运行记录；本项目adapter、会话隔离及BrowserSkill工具调用分别通过原型验证。

产品对话计划使用Terra medium，探索链路生成使用Sol high，简单且边界明确的LLM节点使用Luna medium。S0-07真实请求回报Terra/medium，完成Zod校验的2步需求草案；另一次真实轮次中断且安全关闭。该probe验证接入，不证明抓取计划质量或探索模型路由。凭证由官方登录流程管理，项目只保存必要引用与非敏感配置。

来源：

- [Codex 子 agent 与自定义角色](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [项目配置与参数](https://learn.chatgpt.com/docs/config-file/config-reference)
- [App Server](https://learn.chatgpt.com/docs/app-server)

## R-004 设计系统与组件复用

### 2026-09-06：业务对话与设计规范分离

依据负责人的当前截图与明确指令，设计系统不作为业务导航或页面展示；只作为 Token、成品组件和工程约束。信息层级见 INTERVIEW_UI.md，界面复杂度通过主内容/摘要入口/二级阅读划分，不折叠完整聊天或移除节点画布。

只读核验 domain-analysis 的 InterviewThread、categoryInterviewModule、codexCategoryInterviewRuntime 与私有 interview-product-category skill。采用相同的 assistant-ui 0.15.14 ExternalStoreRuntime 组合、消息中的问题与草稿卡；复制提问纪律而非商品品类/ZOL 默认值。官方 [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) 与 [App Server skill input](https://learn.chatgpt.com/docs/app-server#start-a-turn-invoke-a-skill) 已检索并读取。

当前验证为本机多任务真实访谈切片：typed skill input、自由问答、Markdown 草稿、显式版本确认、本地文件恢复。Vite middleware 提供 taskId 显式路由，TaskService 组合独立 InterviewService，列表元数据写入串行；旧单会话保留原件复制迁入。暂用每任务原子 JSON 文件，不替换 Fastify/Drizzle 方向、不宣称跨文件事务。正式事务迁移、来源搜索、BrowserSkill 样本核验与执行保持独立验收门，详见 PROGRESS。

2026-09-06 全工作台布局验证：依照 WORKBENCH_LAYOUT.md，将稳定上下文放任务侧栏，连续访谈和节点画布保留主区，草稿/节点/审计复用 DetailPane 宽屏并排、窄屏 Radix Dialog 右抽屉；任务菜单复用 DropdownMenu，重命名使用短 Dialog。有价值的步骤依赖保留，补充字段就地折叠，未接通产物保持空态，结构样例显式打开。BrowserSkill 原生键盘与选择操作验证两任务隔离、归档恢复及 804px 抽屉焦点；无新增产品模型调用。

### S0-04 成品控件原型（2026-09-05）

原型采用 `@radix-ui/themes@3.3.0`：Button variants、TextField/TextArea、Dialog、Tabs、Badge、Callout、Tooltip来自成品库；ReactFlow承担节点展示。Mantine 为历史对照，未采用。专业对话组件 assistant-ui 0.15.14 已接入当前真实访谈切片，S0-09 继续正式 API/事务与生命周期验证；不重新进行基础组件选型。

项目只组合需求确认、模拟运行状态与结果字段；`apps/workbench/src/styles.css`集中定义同名light/dark语义Token。Token测试检查同键及业务CSS色值收口，浏览器检查弹窗、主题和节点图控件，具体证据见PROGRESS。控件变体以库props调整，业务布局不覆盖库内部结构；未来替换库保留产品状态与语义Token。

官方来源与对照细节见 `apps/workbench/COMPONENT_LIBRARY_RESEARCH.md`；依据为[Radix Themes](https://www.radix-ui.com/themes/docs/overview/getting-started)、[Mantine Vite](https://mantine.dev/guides/vite/)和[React Flow主题](https://reactflow.dev/learn/customization/theming)。当前是可审阅候选样例，负责人视觉/流程反馈尚待返回。

状态：设计系统方向已澄清，成熟组件库最终选型与新项目约束实现待完成；布局仍按新产品需要讨论。

参考目标是复用设计 Token 规范、设计系统和成熟组件库，让后续功能保持一致并避免重造轮子。先选择并验证成熟成品组件库，定义统一语义 tokens 与允许的组件 variants，再组合产品页面。按钮、表单、弹窗、菜单、Tabs、Tooltip 等优先复用组件库；业务组件只承担抓取领域组合，新增基础实现须有现有库不适用的证据。

Token 覆盖颜色、字体、间距、圆角、阴影、交互状态和必要动效；具体值与库版本仍待调研原型，不复制 opencode 页面几何。设计规范、运行 Token、组件展示与使用规则/自动检查共同组成约束，后续功能复用同一规范和组件，合理变体统一维护。

已保留的参考证据：只读核验 `D:/work/opencode` HEAD `b716f47d`，工作区其他未提交改动不在本任务范围，UI 参考文件无 diff；只读核验 `WorkspaceSidebar.tsx`、`AgentWorkspaceSidebar.tsx`、`BEAUTIFUL_UI_LICENSE.md`、AppShell 与 PerfumePage，确认已有 tokens、许可标记、Radix Themes、Motion reducedMotion 与自有 InteractiveTimeline。2026-09-05 对 `http://localhost:5173/agent/examples/perfume` 做了只读观察和截图，看到深色空状态、侧栏和居中输入，未发送消息，会话 `okxu` 已关闭；这些是参考证据，不构成新产品验收。

当前已只读核验的设计系统证据路径：`D:/work/opencode/apps/examples/DESIGN.md`（语义 tokens、typography、rounded、spacing、components、control hierarchy）、`DARK.DESIGN.md`（仅替换同名颜色）、`src/styles.css`（运行映射）、`apps/examples/tests/theme/example-theme.test.ts`（两主题 key 一致、DESIGN/CSS 同值、核心颜色对比度、目标源组件禁止具体 palette 色阶）。本轮仅读源码，未执行这些测试，不能表述为本轮通过。

职责边界：frontend-design 是设计指导，Tailwind 是样式工具，Radix Primitives 是基础交互原语，三者均不能单独代表完整成品组件库选型完成；assistant-ui ExternalStoreRuntime 与 React Flow 只对应专业界面，仍受各自原型验证门约束。仅复用已核对许可的视觉资产与组件模式，不整体引入 opencode 会话或运行时。官方参考：[Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)、[Tailwind theme](https://tailwindcss.com/docs/theme)、[React Flow](https://reactflow.dev/learn)、[assistant-ui ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)。
## R-005 公共 Question 消费边界（2026-09-10）

采用 AI Connect core 的公共 Question 作为通用事实源，不在 B-A-T 新增 parser、Surface 协议或答案反解器。公共注册的 `modes` 唯一决定实际注入的 `choice` / `multi_choice` / `free_form` 协议和终态校验，mode 不从选项数量推断。B-A-T 当前使用 `commonQuestionAuthoring({ modes: ["choice", "multi_choice"], recommendation: "required", minimumChoiceOptions: 2 })`；生产新题因此只能是至少两个选项且恰有一个推荐项的单选或复选，并可携带公共 follow-up 自由补充。`commonQuestionSchema`、`createCommonQuestionFromPanel`、`createCommonQuestionSurface`、`commonQuestionAnswerFromSubmit` 和 `buildCommonSurfaceReplyPayload` 分别承担内建题型存储校验、Question/Surface 组装、answer normalization 与 history reply。

B-A-T 的领域职责是把公共 normalized answer 记为 interview decision，并维护 unresolved、brief、revision、requestId、cancel、事务与任务互斥。历史消息使用既有 JSON body 承载公共 reply，因此无需数据库迁移；旧 `{prompt, options}` 结构仅用于既有记录兼容，也只在这个读取适配边界根据有无 options 恢复旧单选或开放题。新的公共 typed Question 不重算 mode；生产新题启用 `choice` 与 `multi_choice`，既有 `free_form` 只按原消息 envelope 回复和回放。Workbench 从 `@agent-platform/ai-connect/ui-contracts` 消费 browser-safe helper，避免 server authoring 聚合出口进入浏览器构建图。

core/react 将 Zod 声明为 required peer `>=4.1.8 <5`。本 monorepo 根声明既有 4.1.8 作为 peer host，使 contracts 的本地 Zod schema 组合与 declaration emit 使用同一实例；不使用 overrides，该 Zod peer 组合也不新增额外 vendor artifact。


## 2026-09-17 局部shadow字段读取的原生复用核验

原任务a27失败不能归因于混合文本不可定位：编号有独立span，旧容器是React生成ID，若干field selector错误。修正selector后，read.py单用innerText确实遗漏时间组件shadow DOM内的当前显示值。临时真实证据 `/private/tmp/bat-field-dom-failure-probe.json`；原计划schema未改。

Chrome Accessibility.queryAXTree在正确局部DIV上返回空nodes，不能用于该可见字段，路线不采纳。既有browser-use0.13.8的Page.dom_service.get_dom_tree/EnhancedDOMTreeNode与DomService原生visibility判定能区分可见前缀、可见shadow时间和不可见light fallback；无新依赖、无LLM调用。拟仅适配选定字段backend的原生子树，普通字段原语义不变，公开params不变；局部DOM方案可用不等于正式主线通过。投影实现现已完成：每次read_fields最多一份原生树，只投影选定shadow字段，普通innerText/attribute路径保持。真实bat_read_fields及read_fields_with_proof读取当前5条完整字段和整数页码通过（0模型、Browser关闭）；混合隐藏null值不回填。Shadow输出为可见TEXT片段规范化拼接，不宣称通用innerText完全等价。证据见FIELD_READ_FEEDBACK.md；尚未证明正式候选/跨输入复跑。
