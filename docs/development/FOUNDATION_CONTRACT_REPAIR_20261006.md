# 基础契约整改：独立 headless 验证

## 当前授权与基线

2026-10-06 用户最新范围：只解决底层问题，测试使用独立 headless 浏览器，不运行京东任务，不影响日常电脑使用。本记录覆盖交接中相应的旧验收安排；京东正常生成门本轮不执行。

- checkout：`master`，起点 `b5bdb6588089a7d9f5b3c7ee406423f06aea85ac`。
- 无关 `unused-owned-fixture/` 原样保留；无 worktree、reset、clean、远程推送。
- 既有服务 `/api/health` 确认 root 为当前 checkout、PID 21192；不重复启动服务。
- 浏览器样本仅使用新临时 Profile 的 headless Chromium/Chrome 与 loopback 页面；资源只关闭本轮持有者。测试页面服务与产品服务分开，不能将测试实例当作生产服务验收。

## 模块与验收门

| 模块 | 当前源码事实 | 本轮最小验收 |
| --- | --- | --- |
| 入口生命周期 | 原生 href 已可导航；DOM 入口绑定 tab/url/documentRoot/backend；旧 ordinal 不参与重定位 | 同文档按钮、弹出页返回、文档替换拒绝、混合入口的发布/运行边界 |
| 恢复与资源归属 | 既有 checkpoint、pendingEffect、AttachedWindow 与 Playwright relay；不能先假定缺实现 | 临时 headless 连接/重连、同 owner 恢复、外来目标拒绝、未知副作用拒绝重放 |
| DOM/选择器复用 | 查询使用 B-U Actor/Page，结构选择与身份归属由 B-A-T 适配 | 审计固定上游源码，记录适配职责与未覆盖边界 |
| 安全诊断 | 已有阶段和受限异常类型；部分异常链被截断 | 真实故障能定位到安全源码位置，敏感异常正文不进入诊断 |
| 参数输入 | sourceEntryStep 继承对象输入，read.take 可由既有绑定驱动 | 改数量/空集合以及输入沿来源→逐项的真实传递；不新增模型循环 |
| 内容范围 | regions 合并最近公共祖先，capture_region 保存整个祖先 | 多块正文与旁边控件的边界；保留图片和正文，旧不可变产物不改写 |

逐模块先复现再修复，只运行保护本次不变量的最小验证。保存首次失败与修复后结果；对抗审查后如改码，重新冻结并只验证受影响边界。最终同步 RESEARCH/ROADMAP/PROGRESS 后本地提交。

## Product Alignment

- natural-language task: 批量查看资料并保存内容，或对一组表单条目执行已确认操作。
- reusable chain boundary: 来源读取、逐项执行、内容读取、同运行恢复和本次资源清理。
- runtime inputs: 已确认业务参数、当前运行读取的入口及 checkpoint。
- dynamic task outputs: 实际内容/动作回执、类型化不可编译或恢复失败、独立清理结论。
- generic platform capability used: 既有 ReadSpec、TaskChain、LangGraph、B-U 原生 DOM/CDP、Playwright 生命周期。
- replay model calls: 普通节点 0；不得隐式补充模型调用。
- site/task-specific code added: no

## Reuse Assessment（修改前）

- capability: 页面入口身份、原生连接/定位、内容区域和异常来源诊断。
- existing implementation in repository: element_entry/targets/read/page_content、AttachedWindow、TaskChainRuntime、method_read_tool 安全诊断。
- mature candidates and pinned versions: browser-use 0.13.8 / eb4126921bea3373f91afc49fb4b59d6eda7fed6，Playwright relay 8b552173e8d767db29b8baef8f4a1f08cf7f26bf，workflow-use 5d2d19fe8835cc86f1bf3e04302a5000d590f249；Python 标准 traceback。
- selected implementation: 延续已采用组件，优先修正 B-A-T 的合同/证据适配；尚无依据引入或替换关键库。
- reused public surface: Actor Page.get_elements_by_css_selector/get_element，Element.evaluate/get_basic_info，原生 Tools navigate/switch/click；既有 Playwright/CDP 及 Python traceback。
- B-A-T-owned adapter and remaining gap: 原生身份到版本化输入的准入，区域选择到产物的范围映射，同 owner/checkpoint 恢复核验及安全审计；具体整改随复现证据结算。
- license/runtime/platform fit: 沿已冻结 MIT B-U、Apache-2.0 Playwright、AGPL-3.0 workflow-use；Windows/现有 Python 虚拟环境，不安装替代框架。
- browser/runtime/state ownership conflicts: 一个运行一个控制会话；不接日常浏览器，不写第二套连接 loop、选择器解析器、调度器或恢复数据库。
- replay model calls: 0 新增。
- rejected candidates and evidence: BrowserSkill session RPC 与 B-U CDP 不等价，既有调查保留；Readability 的整篇文章抽取不直接等于已确认多区域的原始范围交付，先核验现有范围适配，不增加自动语义清洗。
- focused validation: 下文按首次失败、修复及最终证据分别结算；没有引入或替换关键库。

固定上游：[B-U Actor Page](https://github.com/browser-use/browser-use/blob/eb4126921bea3373f91afc49fb4b59d6eda7fed6/browser_use/actor/page.py)、[Playwright relay](https://github.com/microsoft/playwright/blob/8b552173e8d767db29b8baef8f4a1f08cf7f26bf/packages/playwright-core/src/tools/mcp/cdpRelay.ts)。

## 冻结实现与结果

最终修改源码快照：`27cc1d4d66742e672588c333c6a6e9edcdc4e32c5138d991e8c207a9a46e076f`（21 个产品源码文件，LF 归一化逐文件 SHA-256，清单在 `work/foundation-contract-20261006/frozen-source.json`）。受管 fork 校验摘要：`1babde3961a7fc3d315933f93f115f9f04762c86e91fdb097106fa563ca55282`；已同步 `LOCAL-CHANGES.json` 与本地 verified-source 登记。

1. **入口生命周期**：Python 编译和 TS 物化双端拒绝输入 DOM 入口的同 tab URL 变化及已证明的文档替换。跨 tab 点击必须在 post 观察中证明原 target/document/URL 仍存活；采样复用 B-U Page 与原 CDP session，不切焦点。证据缺失只阻止发布，原生探索继续。链接导航仍沿已有能力，DOM 入口不按旧序号重找。
2. **参数数量**：消化既有 `natural_binding` 事实，把 `take` 沿 ValueBinding→节点输入→Python IPC 传递；样本 ReadSpec 不改写，正式输出只放宽到输入合同和已验证技术预算之内。`readRef` 追溯前序成功来源。多同值输入保留多个候选并阻止编译；没有足够证据时不猜字段。
3. **内容范围**：新内容工具由宿主写入 `regionMode=selected-regions`，只保存选择的区域及其后代，嵌套选择不重复，旁边工具栏/页脚不混入。选择、包含关系和 DOM 序列化复用原生 DOM；图片原字节、链接、表格及原范围内背景继续保留。旧参数无标记时仍用原 common-ancestor 语义，旧来源/产物不改写。普通字段工具不暴露内部 mode。
4. **安全诊断**：读取失败增加受信模块别名与 traceback 行号，保留既有异常类型/错误码/帧摘要；不输出异常正文、本机路径、局部变量或页面内容。失败不消耗成功 readRef 编号。
5. **恢复摘要**：真实 runner 重建证明 session/tab/document/URL 相同但摘要不同，根因是 `summary.title` 的异步缓存标题。运行观察改为 B-U `Page.get_title()` 的实时事实；摘要结构、DOM 序列化和严格恢复比较均不变。实现抽入 `runtime_observation.py`，原 `hybrid_main.py` 回到 500 行内。
6. **清理**：复用已有 owner/lease、关闭审计和 `cleanup_required`，本轮没有另建恢复 loop。历史前两次失败原因按 SQLite 原始审计补齐，见下文。

### DOM 复用审计结论

| 边界 | 实际实现及成熟能力 | B-A-T 保留职责 |
| --- | --- | --- |
| producer | B-U 原生 BrowserStateSummary、selector_map、backend node；`entry_selection` 再用 Page CSS 查询核对真实成员 | 把本次选择映射成通用集合/条目输入，证明前缀、documentRoot 和完整成员摘要 |
| compiler | `record_projection_dom._relative_selector` 在已采集树上枚举有界共同路径；`_Matcher` 只表示它自己生成的 tag/属性/class/nth-child 子集 | 这是集合参数化和证据编译，不能扩成任意 CSS 解析器；产出的查询必须再交给浏览器原生引擎核验 |
| runtime | `TargetResolver` 的 CSS/结构入口调用 B-U Page/Element，选择器解析由 Chrome DOM 完成；native Tools 负责动作 | 绑定解析、唯一性、来源身份、预算及版本化 IR 证据；不建立第二套 browser session |
| content | 原生 querySelectorAll/contains、Page.getResourceTree/getResourceContent、B-U HTML→Markdown | 精确选区、去重、字节预算、产物回执与来源身份 |
| reconnect | 已采用的 Playwright relay 与 AttachedWindow；固定源见 `vendor/daily-chrome-extension/UPSTREAM.json` 和此前复用记录 | 持久 owner/target 关联以及是否允许继续同一次运行 |

本轮未发现需要替换上述核心组件的依据，也未新增通用 selector engine。B-U Page 固定源码已核对到原生 DOM/Target API；Playwright 生成器的尝试查询路径返回 404，未据此做替换结论。现有集合共同路径编译不能仅用单元素定位 API 等价替换。更广泛的跨 iframe/shadow、异构记录或完整通用选择器优化不在本轮验证范围。

## 验证证据

所有项目命令的 workdir 都是实际 checkout 根；下列相对路径用于复现，不作为开发机器绝对路径约束。

| 验证 | 结果与范围 |
| --- | --- |
| `python -m unittest test_ordinary_observation test_observation_scope test_entry_lifetime test_read_input_binding test_method_read_tool` | 33 项通过；包含实时标题、源观察身份、入口编译门、数量歧义/预算和安全诊断 |
| `test_foundation_headless` | 本地真实 headless：同页按钮逐项、弹出后返回、链接/按钮混合、旧文档入口拒绝；数量 2→1/3、继承字段和空集合；新增弹出页来源采样及替换 HTML 根拒绝定点通过 |
| `test_content_selection` | 真实 headless 通过；选中标题/正文/内嵌图片保留，兄弟工具栏/页脚排除，嵌套去重，旧祖先模式仍保持 |
| `test_content_region` + `test_page_content.PageContentTests.test_multiple_related_regions_and_two_replay_inputs` | 2 项通过；原大图字节、背景、表格、两次输入、范围与页面身份拒绝均保留。组合命令漏设 foundation 开关导致 selected 测试跳过一次，随后单独启用并通过，未将 skip 计为 pass |
| `node --import tsx --test ...hybrid-read-input.test.ts ...hybrid-element-entry.test.ts ...hybrid-method-evidence.test.ts` | 21 项通过；Python 来源合同对应的独立 TS 校验、物化和 IPC 输入 |
| `...human-wait-closure.test.ts ...hybrid-checkpoint-browser.test.ts ...execution-cleanup-recovery.test.ts` | 首轮 22 项中 19 过、3 项旧夹具失败；更新缺失的 store 方法、已移除的 drain 入口和显式 cleanup 流程后，失败的 3 项定点通过。其余 19 项未无变化重跑 |
| `apps/api/tests/replay-recovery-native.acceptance.py` | `native-recovery-proof.json`：临时 headless 真实 CDP/relay 重启、同身份核验、外来 owner/身份和未知 target 创建拒绝、只关闭 owned target，保护页仍可执行 |
| `apps/api/tests/foundation-runtime-headless.acceptance.py` | 实际 TaskChainRuntime→Python IPC→SQLite→重新打开 SQLite→新 runner→同 run 恢复→输出，数量 1/3 两次独立运行均完成；前序导航只一次、旧事件不改写、链摘要不变、0 模型调用、清理 confirmed；fixture 的非本任务页仍存活 |
| `npm run check --workspace @browser-capture/api` | 通过；早期新增测试的 TS 类型错误已修正，未运行根级或全量检查 |
| `git diff --check` / 服务身份 | 通过；结束时 `/api/health` 仍为 PID 21192、原 checkout；无重复服务或手动重启 |

Python 使用现有 `work/upstream-browser-hybrid/.venv/Scripts/python.exe`，`PYTHONPATH=vendor/workflow-use/workflows;vendor/workflow-use/workflows/tests;apps/api/python;apps/api/tests`。真实基础样本开关 `BAT_RUN_FOUNDATION_PROBE=1`；大内容样本另用 `BAT_RUN_CONTENT_PROBE=1`，遥测关闭。没有安装依赖或读取 node_modules。

最终生产运行时证据：`work/foundation-contract-20261006/runtime-1791289507009/proof.json`；冻结链摘要 `736accc6da00591749243bd52a3ef71d2b9f83d03c1fb57321561212c87acc56`。Python 测试包装器用 Playwright 创建临时 Profile 的 **headless=True** Chrome，TS 通过显式 loopback endpoint 复用产品的 attached 模式；该模式的 transport `headless=false` 表示不负责启动已有 Chrome，实际测试浏览器始终无窗口，且禁止个人 endpoint 探测。专属 headless 模式原有“不能交付人工窗口”的限制没有为测试而移除。

### 首次失败与未通过分支

- 生命周期门修改前，新测试证明同页导航/同 URL 刷新仍会被编译；内容修复前真实页面选中标题/正文却混入 sibling toolbar，均保留为首败。
- 对抗审查发现数量多候选退化常量、预算未约束、popup 来源未核验、普通工具暴露内部 mode 四项 P2，均修复且独立复审无新 P1/P2。
- popup 采样新夹具最初以错误的 envelope 摘要模拟 document_identity，严格校验正确拒绝；改为生产 value 摘要后存活验证通过。另一个“弹出并立即导航来源”夹具曾在旧 Page 的 Target 查询处 CDP timeout，此路径仍未计为通过；最终新增样本明确测的是来源 HTML 根替换。
- 恢复样本早期经历夹具的专属 headless handoff 不支持、terminal outputContract 未同步、TaskOutput 包装断言错误及 HTTP 预连接收尾等待；均未记为产品通过。卡住的单个测试 node 按 PID+完整命令核验后结束，Python finally 关闭其临时浏览器。没有终止产品服务。
- **真实底层首败**：`runtime-1791289307215/amount-1/resume-check.json` 保留相同 session/tab/document/URL、不同 observationDigest，恢复结果 drift。实时标题修复后同流程完成；没有放松摘要比较或添加重试。
- 部分原生样本输出 B-U duplicate-response warning、关闭 headless 后本地 HTTP socket reset；断言及清理通过，不把这些日志描述成从未出现过。
- 未运行任何京东任务、日常浏览器验收、真实登录/验证码、人为关闭浏览器后的端到端续跑、长期保活、macOS 或新需求从访谈 UI 正常生成的全过程。恢复通过仅指上述生产 runtime/SQLite/owned 浏览器事实，不替代这些门。

## 历史清理审计结算（只读）

只读 SQLite `taskExecutionCleanupAudits`，execution `4fb15af8-15ea-4e2b-8656-641ea4a97f1c`；没有重新运行或打开对应任务。

| attempt | 来源/结论 | 原始代码及证据 |
| --- | --- | --- |
| 1 | runner / unconfirmed | `cleanup_close_protocol_timeout`，child_exit 同时 `cleanup_child_exit_timeout`；process_tree 与 temporary_directory confirmed，activeResources=false；digest `5a89752c…32a692` |
| 2 | owner_verification / unconfirmed | `cleanup_owner_verification_unavailable`，activeResources=null；保留原阶段失败；digest `39f9f028…78ef6` |
| 3 | owner_verification / confirmed | activeResources=false、browser_close confirmed；原 close_protocol/child_exit 的超时历史未改写；digest `5d28ce86…9e62a` |

审计能定位“关闭协议/退出确认超时”和“owner 核验当次不可用”；现有记录不足以进一步归因第二次具体的底层连接异常，不虚构根因。原业务 TaskRun/输出不被清理状态覆盖。

## 对抗审查与交付边界

两名只读 reviewer 分别审数据/内容合同及入口/诊断；四项 P2 修复后定点复审通过。恢复实时标题修复另经定点复审，无新增确定 P1/P2；reviewer 没有启动测试或浏览器。

本次交付为已列出的底层契约修复与可复现 headless 验收。复用原调度、浏览器连接、状态存储及任务模型，未加入网站专用规则。无关 `unused-owned-fixture/` 保留，不包含在本地提交中；不推送远程。
