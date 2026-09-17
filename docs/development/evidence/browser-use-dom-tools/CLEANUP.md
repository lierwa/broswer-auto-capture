# DOM 工具实施与相关代码处置

> **2026-09-17 清理结果已更新：** 下文是历史处置记录；旧整页读取 helper 已实际删除，不再“离线保留”。当前结果以 [问题与清理账本](../../REPLAY_CLEANUP_20260917.md) 为准，禁止据下文旧指令继续试跑。

2026-09-16 当前：D0/D1 定点检查和 D2/D3/D4 首批工具真实集成已通过。用户已撤回独立规则 JSON，正式自然语言入口已启动并完成原任务首次真实探索，当前停在证据编译，M1 尚未通过。新路径、测试和每轮来源见 [自然任务实施记录](NATURAL_TASK_IMPLEMENTATION.md)。下文 D0–D4 及旧入口 409 记录保留其历史时点含义。

本轮旧行为处置：生产 authoring 的 fenced authority 门已移除；历史 v1 解析保留作离线兼容，生产来源复用拒绝 v1。capture 的旧 authority read-completion API 已移除，旧测试保留同一读取配置/结果证据必须匹配的不变量；新路径由现场验证的 ReadSpec 产生读取证据。当时曾保留 patches 0001–0012；该决定已撤回，12 个 patch 及 README 已于 2026-09-17 删除。旧 archive 仍属历史来源。

## 基线及所有权

当前 master / `7242264bd3757a7ebe82514f9a17cb63e7bf614c` 与交接一致。开工 dirty 和定点摘要在 `baseline.json`；不作为恢复快照。保留原始 history、artifact、Profile、archive、未知 dirty，未创建分支/worktree或提交。主 agent 实际 turn_context 为 gpt-6-astra/high；执行子 agent 固定 gpt-5.6-sol/high，逐一核查实际记录。

Product Alignment:
- natural-language task: 按已确认筛选与位置读取本次列表条目；同结构表单中输入并核验本次结果
- reusable chain boundary: 原生动作证据到当前作用域目标解析及结果核验
- runtime inputs: 页面入口、序号、已确认筛选及输入值
- dynamic task outputs: 本次条目或表单字段
- generic platform capability used: 原生 Agent hooks / DOM / Page / Element / Tools、既有 StepVerifier/Tenacity、TaskChain/LangGraph
- replay model calls: 普通能力 0，以真实运行审计验收
- site/task-specific code added: no

Reuse Assessment:
- capability: 可读取的局部结构证据、集合及相对目标、就绪/后态检查
- existing implementation in repository: hybrid capture/history/author/capability/read/postconditions、来源 artifact、宿主 Zod
- mature candidates and pinned versions: browser-use 0.13.8、workflow-use 0.2.11 @ 5d2d19fe8835cc86f1bf3e04302a5000d590f249
- selected implementation: 延续现有固定依赖；各查询 surface 在实现前定点核验
- reused public surface: 原生回调 selector_map、parent_node/children_nodes、Page/Element 查询、Tools.act
- B-A-T-owned adapter and remaining gap: 来源白名单/引用/完整性、需求位置与真实目标对应、跨语言持久化合同
- license/runtime/platform fit: 不改依赖和许可；现有 macOS Python 环境；Windows 未测
- browser/runtime/state ownership conflicts: 单 Browser；图推进仍归 LangGraph；SQLite/artifact 为产品事实源
- replay model calls: 定位和后态检查无模型端口
- rejected candidates and evidence: 不启用历史 index/标题兜底；旧归档 patch 不重新应用；沿既有设计证据
- focused validation: D1 定点 unittest；D2/D3 合成页面真实 Browser；D4 正式编译/持久化/加载复跑；随后 M1

## 处置账本

| 旧行为与活动调用点 | 处置 | 替代/保留职责 | 保护不变量与验证 |
| --- | --- | --- | --- |
| capture.before_action 只尝试预先给出的 selection | 重写 | 同一 summary 中先复制实际 action target 局部树；selection 作为需求绑定 | 不刷新后用旧 index；D1 定点验证通过 |
| history.from_agent_history 丢弃 interacted_element XPath | 重写 | 按动作位置导入可证结构，缺父子/缺结果明确保留 | 不按交互编号索引、不 zip 伪造完成；D1 定点验证通过 |
| author.put 仅生成 digest 且 evidence 不交付 | 重写 | 保存可读取的白名单来源，沿当前 artifact 协议传递 | 摘要不替代结构；D1 定点与 D4 持久化加载通过 |
| capability / read / postconditions 各自 css/ordinal 查询 | 收敛 | 共用作用域、集合、ordinal、item 内目标解析 | 统一解析已替换重复分支；离线与真实探针通过，D4 真实整树重建通过 |
| 原生 Tools.act、StepVerifier、Tenacity | 保留 | 单次动作与有界观察 | 后态失败不重发离线反例通过；真实异步观察通过 |
| semantic_executor 两项已有 fork 修复 | 保留 | 原生提取分派、ordinal 越界拒绝 | 本次未发现推翻其修复的证据 |
| patches/workflow-use/0001–0012 及 README | 已删除 | 历史诊断结论另存，不再保留补丁文件 | 当前 setup 直接使用 vendor；旧“主线前不删”决定撤回 |
| scripts/setup-upstream-browser-runner.mjs | 保留 | 固定 fork/lock/版本/来源摘要校验 | 未执行安装；合并改动后同步限定 manifest |
| 旧 runner/archive 与历史来源 | 保留 | 既有 v1 退休与只读证据边界 | 本次不删除、不恢复、不执行归档路径 |
| 旧测试中的真实回归不变量 | 按受影响范围调整 | 共享解析替换后保留语义和失败路径 | 禁止凭标题/临时编号/假成功通过 |

## M1 原需求来源

权威来源为本地 `data/workbench.sqlite` 中任务 `79b4e6a3-b500-4d52-98c7-f9370638675e` 的已确认 draft v2；公开仓库起点，closed、bug Issue label、更新时间降序，前两页各前五条，第二页首条详情后返回并继续读取。输出 labels 不混入 Issue Type；更新时间/创建时间保留完整可见上下文。只允许可见控件，禁止拼接筛选/分页 URL。任务 ID 与旧 browserRunId 不同。

旧入口曾要求 bat-compilation/v1 fenced authority，普通 Markdown 缺少该块；这个前置要求现已撤回。正式入口直接使用已确认的自然任务文字，M1 仍需证据编译、样本及同链不同输入的实际通过，不能手填网站合同或复制样本输出补齐。

## 阶段实证

- D1：`test_hybrid_dom_evidence` 4、`test_hybrid_capture` 9、`test_hybrid_author` 2 共 15 个不同测试通过；其中后加查询脱敏检查后重跑 capture + dom_evidence 13 项通过。结构在首个异步查询前复制；旧 history 按动作位置；同参动作中断按 callback step 对应，不按内容找第一条。普通探索异常返回 partial trace + gap，成功与判定均为 false。
- D1 完整性及脱敏：结构/查询本体必须与 sourceRefs.digest 对应；修改本体后仅重算总 trace 摘要仍被拒绝。查询参数复用动作脱敏规则，若 selector 被脱敏，保留查询计数并标 complete=false，不能以原始 selector 泄漏或冒充可执行来源。
- D1 来源：`dom_structure/v1` 和 `dom_query/v1` 本体位于已有 observation facts。结构摘要可对应可读值；字段采用白名单，URL 被裁掉的 query/fragment 显式标记。原生 DOM 全量覆盖未证明，结构 coverage 不伪称全量；frame/shadow 仍有限制。
- D2/D3：新增离线 targets 6、readiness 3 通过；受影响旧 capability 6、read 2、compiler 5 通过。真实 Chrome probe 1 项通过，实际 2 navigate + 2 click，普通模型调用为 0；第二个集合条目命中、异步后态只观察、错误 URL scope 动作前拒绝。
- 真实探针发现主文档 `frame_id=None`，修复精确身份校验后重验通过。所属 Browser/SessionManager 已清理，临时 `bat-dom-target-*` profile 及进程无残留。
- 证据边界：后态失败不重发和 XPath 主要为离线反例；item 根/标题区别及越界已由补验真实探针验证，真实重建、重复区域和正式持久化消费已由 D4 验证。find_elements 已保存零结果/total/showing/截断事实，尚未成为普通执行能力。
- 实际 agent 核验：主 session `01a0a94a-630e-7ee1-8795-edf57b14428e` 为 gpt-6-astra/high；D1 `01a0a94d-5278-74a3-ad64-3290394528fe` 与 D2/D3 `01a0a94d-ae12-7333-b690-fd12111af329` 的 turn_context 均为 gpt-5.6-sol/high。

## D4 正式持久化与加载证据

`BAT_REAL_BROWSER_TEST=1 node --import tsx --test apps/api/tests/hybrid-dom-tools.test.ts` 2/2 通过（含 1 个离线合同用例和 1 个真实集成用例，约 24.1 秒）。实际使用 Application/SQLite、原生 Agent/Browser、fork 编译和持久化加载；模型提供方为 scripted fixture，不能算真实 provider 或业务验收。

- 来源观察到页码改变但旧列表仍在、ready=false；原生 wait 后 ready=true、整树重建、动态 ID/title 改变。页面另有重复命名区域，动作限定在主列表容器。
- DOM 可读结构与 queryCandidate 进入编译；来源摘要按 Python canonical JSON 验证，保存后从 repository 加载同一 chain。
- 输入 ordinal=1 输出 Fresh Alpha；同一 chain ordinal=2 输出 Fresh Beta。每次复跑 4 个 browserCommands、0 llmCalls、modelCalls=[]；无显式 llm 节点。
- 探索 scripted 调用为 Agent 6、extract 1、judge 1；这些不计为普通复跑模型。
- 内部 ordinal 参数采用既有 keySchema 可接受的 targetOrdinal；绑定在宿主物化，运行前验证正整数并剥除内部参数。未放宽公共 keySchema。最小 intent 的样本 ordinal 与输入不符也被拒绝。
- 同一个真实表单回归 `hybrid-form.test.ts` 1/1 通过（约 21.1 秒）：两次启用各 4 commands，禁用 0 commands，全部 0 模型。
- 修复阶段曾因内部键不符合公共 schema、测试摘要算法不一致失败；分别修复内部键和测试校验后重验通过，未通过放松合同解决。
- Python targets/readiness 当前 10/10，compiler 5/5；API tsc 通过。verifyForkSource 通过，digest 为 `7076b7898909ef6905db623e3b4f31c6de26325c9782f8a390e749ff1dfec1b1`。仅更新 LOCAL-CHANGES 及本地环境 sourceDigest，不安装依赖或改 UPSTREAM 基线。
- 所属 Browser/runner、临时目录均无残留；测试初始化和关闭异常也走独立 finally 清理。

## M1 正式入口核验与剩余边界

[mainline-entry.json](mainline-entry.json) 是实际原 requirement v2 / plan v6 的正式 HTTP generate_task_chains 核验。原库以 readonly/query_only 读取，仅把 task identity 与两个合同 seed 到临时应用；没有手写替代业务 authority、复制账号或 Profile。

实际 HTTP 409、`missing_control_intent / structured_authority_missing`、`blocked_before_exploration`。externalCalls=[]，队列未启动，before=after：requirements=1、plans=1、chains/runs/jobs/executions=0。`gateVerified=true` 只表示缺规则时拒绝及零副作用门通过，**M1 样本与同链不同输入业务验证均未通过，也未启动真实业务 Browser**。

源数据库和 WAL 的内容、大小、mtime 未变；SQLite -shm 内容/大小未变，但只读连接使 mtime 更新，不能声称所有侧车元数据完全未触碰。临时应用和目录已清理。等待 [规则来源取舍](MAINLINE_AUTHORITY_DECISION.md)，没有修改 authority 规范或原确认数据。

当前不能外推的范围：iframe/shadow、真实 XPath、后态失败不重发主要为离线证据；find_elements 只交付查询事实，尚未成为普通执行能力；scope URL 当前固定为样本 URL，未验证换 startUrl；任意 preconditions 没有被消费，仅已声明前一动作 postcondition 阻塞后继；普通自然探索到结构 selector 的自动规则接线仍属 M1。Windows、真实 Issues 筛选/翻页/返回及下拉框未验。

## 工作区保护

[preserved-source.json](preserved-source.json) 对开工 94 份定点文件核验：75 份摘要不变、19 份为分派实现或进度记录修改、无文件缺失。它不是全工作区/ignored 数据完整备份；受检历史 patch、archive 与 history 未变。仍在原 master/HEAD，无新分支/worktree、提交或推送；未运行根级/全量测试。

## D2 真实反例补验

仅扩展原 `test_dom_browser_probe.py`，沿同一 Browser 新增 2 次点击，最终 1/1 通过（约 7.5 秒）：item 根点击结果 root:1；ordinal=2 内部 title 点击结果 title:2，stopPropagation 证明没有冒泡成 root:2。ordinal=3 返回实际合同 `target_position_unavailable`，Tools.act 计数前后均为 6、页面仍 title:2，证明越界零派发。总实际动作 2 navigate + 4 click，模型调用 0。未重跑 D4/form，未改平台实现；owned Browser 和临时目录无残留。首次计数 mock 包装失败发生在导航前，换成显式 async 包装后重验通过。

## R5b 后旧实现处置（2026-09-17）

生产 capture 已解除 `propose_verified_read` 的调用；原 whole-main/body + 128000 字节模型注解路径不再参与生产字段读取。旧 helper 暂保留为离线旧契约实现，没有调用回退；不把它继续保留解释成生产仍依赖它。read_fields 的整容器/片段 HTML 与 BeautifulSoup 文本转换已替换为固定原生字段值投影。原历史 source、patch/archive、需求及 plan 不改写。局部接线验收与当前摘要见 REPLAY_REPAIR_EXECUTION.md；后续完整主线仍未完成。
