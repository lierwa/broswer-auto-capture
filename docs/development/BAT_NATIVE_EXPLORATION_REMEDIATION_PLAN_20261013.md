# B-A-T 原生探索适配与编译链路整改计划

日期：2026-10-13。状态：**本版已完成主 agent 的源码对照复审，具备在新 session 获得实施指令后开始开发的设计条件；没有独立工程师批准、代码实施或产品验收结论。本 session 仍只整理文档。** 本文替换旧整改规划，旧方案审核通过不覆盖本版。

## 0. 授权、范围与新 session 入口

本 session 仅修改现有工程规则、方案和恢复入口；不修改运行代码、测试、依赖、数据库或模型配置，不启停服务、不执行浏览器任务、不创建分支/worktree、不提交推送。新 session 的实施权限以用户在那里发出的指令为准；本文不是自动恢复旧实施授权的指令。

范围是两层：B-U 原生能力的必要适配，以及 B-A-T 把探索证据编译为参数化任务链路的实现。用户已撤销“为了旧来源、旧代码或旧记录继续维护兼容实现”的目标：只建设正确的现行合同，不新增旧版本 decoder、历史字段枚举或旧工具工厂兼容分支。现存兼容代码按真实现行消费者核清后删除或简化；现行来源身份校验和不可变运行事实属于正确性，不是历史兼容。这个范围调整不等于执行数据库或历史记录删除。

沿用 [任务链路架构](TASK_CHAIN_ARCHITECTURE.md)、[AGENTS.md](../../AGENTS.md) 的产品职责和授权约束。保护 TaskBrowser、原生键盘/IME、鼠标轨迹、拟人节奏、请求预算、冷却、窗口归属及盾规则；保留原生 Agent.run/multi_act、多动作串行、停止/暂停，不复制其循环或退回单动作。不得重装 vendor 覆盖补丁、访问京东、改相邻项目、个人网络/Profile，或重启/关闭 Mac、VM、Chrome。新增系统常驻配置仍须另行确认。

开发型号和推理配置取新 session 的实际运行上下文，子 agent 继承，不由文档指定固定型号。产品保留当前用户指定的 gpt-6.1-sol/high 路由；改变产品模型设置不作为默认提速手段。

## 1. 开发规范的来源与本项目落地

这些是通用工程原则；下面的 B-U/B-A-T 合同与验收是项目要求。不得把本地取舍冒称行业硬规定，也不再使用“最多5个文件”“新增文件全部为0”“每包必须净减”等自设质量指标。

| 官方原则 | 本项目的执行与审查对象 |
| --- | --- |
| [Google Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)：一次自洽的改动，包含必要消费者及相关验证；不按固定行数或文件数裁断 | 按真实依赖拆成可独立说明、核验的变更；不能为了凑大小留下未使用 API、断开的消费者或暂时不可用的系统 |
| [Google 评审标准](https://google.github.io/eng-practices/review/reviewer/standard.html)：总体代码健康改善，技术事实优先于个人偏好 | 查职责、耦合、重复状态、理解和维护成本；代码减少或检查通过本身不证明质量改善 |
| [Google 设计与测试审查](https://google.github.io/eng-practices/review/reviewer/looking-for.html)：复核库与自有代码边界，拒绝过度设计；测试要能发现错误，测试也有维护成本 | 复用原生工具、现有 IR/编译器、QuickJS 与 LangGraph；不造第二套 Agent、执行器、图、规则框架或检查框架；拒绝只验证替身、固定成功或实现细节的测试 |
| [Fowler Two Hats](https://martinfowler.com/articles/workflowsOfRefactoring/fallback.html)：保持行为的重构与改变行为分开 | 移动/合并代码与错误行为修复分别说明；取消记忆污染、恢复工具是行为变更，不能假称纯重构。保留已确认正确的合同，不把已知错误行为冻结为目标 |
| [Google 清理要求](https://google.github.io/eng-practices/review/reviewer/pushback.html#cleaning-it-up-later)：本次引入的复杂度交付前解决 | 新旧实现、重复推导和无用过渡层不能以“以后再删”留在完成包里；无关旧问题不混入本次 |
| [Google 独立评审](https://google.github.io/eng-practices/review/)及[最小必要文档](https://google.github.io/styleguide/docguide/style.html#minimum-viable-documentation) | 作者自检不算独立批准；评审看需求、完整 diff、原始证据并声明覆盖范围。维护现有规范、计划和断点，不再为每包新建回执文档 |

Google 并不要求禁止新增测试文件；**本轮不新增测试文件**来自用户授权边界。先用最相关的现有验证；只有真实不变量缺口才在现有测试中补充必要断言，测试改动与行为改动同包说明。不运行全量/根级测试、不无变化重复验证；扩大范围遵循 AGENTS 的授权规则。

独立评审应由未参与该变更编写、能审查相应领域的人完成。AI 复核可辅助找反例，不能称为专业工程师背书或替代真实运行。子 agent 委派遵循新 session 的授权，不因本规范自动启动；不固定每包两个 reviewer 或增加形式化审批等待。

## 2. 已核实的现状与结论边界

| 事实 | 证据与不能推导的结论 |
| --- | --- |
| 当前代码在现有 master，HEAD 2b00a63d4b664678fa62c2810b02f79bab9d5dcd；冻结3覆盖1273文件，本次文档复审后全部仍匹配 | work/native-remediation-implementation-20261013/baseline.json、freeze3.json；区间修改48、新增5、删除0，不代表全部 dirty 都由本次产生。freeze3.changed 列表漏3项，不能盲用 |
| 原生动作额外排除名单有11名字，实际相对当前配置额外限制9个工具 | author.py:author_tools；download_file 无当前原生工具函数，screenshot 在 use_vision=True 时由原生 Agent 自行排除独立工具，视觉观察仍在。不能按名单长度计算影响 |
| 普通执行集合只有10个 B-U 原生动作，另有读取/审计路径 | capability.py:ORDINARY_ACTIONS、natural_compile.py；注册表识别动作不等于转换和运行全覆盖 |
| 查询详情被追加至长期记忆；查询证据又消费原生计数摘要 | action_dispatch.py:retain_query_content、dom_evidence.py:complete_find_elements_query；需要拆开模型反馈与证据保存，不以保留计数为理由继续保留全量详情 |
| 在线编译 gaps 会继续，但异常统一包装为停止；完成绑定/schema 错误也反馈给 Agent | author_compilation.py、author_callbacks.py、author_tools.py；必须区分业务未完成、纯编译失败、来源/安全失效 |
| 离线编译从探索工具工厂枚举历史注册表 | hybrid_compile.py:matching_registry；本版不再以保护这些历史分支作为先行包。仍须确保当前探索和编译消费的是同一个正确现行合同 |
| 最新 BrowserScan 来源6cf41dcb、草稿15929cc4 rev2有同 checksum 双验证 | 5c60116a 44.027秒、c59f9bd2 40.132秒，各23命令/0模型/首次清理confirmed，110项；只证明两次现场可执行。未发布、无同版本正式复跑，Pixelscan本版未验收 |
| 最新准备691.149秒，18次 Agent 模型累计526.667秒 | 原两次查询失败及两项未派发尾部保留；不是失败/未知写入的部分副作用反例。速度未通过，f-acceptance.json 仍running，不能把回执当持久事实 |

上表是核查时点事实，不是恢复进程或重跑任务的许可。新 session 先核对代码与持久运行事实是否漂移；服务恢复前核清 job、PID、浏览器 owner 和影响，不自动重放副作用。

## 3. 两层职责及保留/移除依据

B-U 拥有决策、观察、Agent loop、多动作串行、原生工具派发及停止。适配只承担已证实的浏览器兼容、反爬/授权/归属、最少来源采集、模型接口和取消传播。每个非默认限制或状态写入须能说明真实冲突、证据、最小适配与代价，不能以编译方便为理由。

B-A-T 拥有来源到现行 IR 的转换、运行输入/输出和目标绑定、必要的语义源码、依赖裁剪、候选、版本、验证、发布和运行审计。复跑继续使用现有 TaskChainRuntime/LangGraph 与原生工具，不重造浏览器驱动或通用执行循环。

- 保留已验证的原生输入、IME、轨迹、节奏、预算、冷却、owner、盾及真实失败取消传播；不能因“更原生”换回裸 Browser。
- 证据保存在采集/编译侧；不把 DOM 父子关系、全查询详情、技术 ID、节点图或编译教学塞进 Agent 上下文。必要业务要求、授权说明、正式输出读取和人工接管仍保留。
- P5现场新增必要接线依据：固定SDK find_elements返回formatted预览+长期计数，但ActionResult的一次读取flag默认false；MessageManager只见计数。适配仅对成功find_elements复用公开flag将其已返回的原生预览交给下一步read_state；两份原文/参数/截断不改，下一步清空，错误partial不提升，search_page保其原policy。采集侧全量查询和DOM父子仍不得注入；不得把此必要flag接线与旧长期全文污染一并删除。SDK→实际消费者反例及正常产品失败见实施记录。
- 审查三个原生参数改写、观察接口替换、Agent.last_result 写入和 done 改写；有真实故障依据的最小部分保留，其余迁回所属职责或删除。不能整类盲删，也不能仅凭 WHY 注释确认必要。
- 不新增逐动作模型评判、keep/drop 模型、全局 judge、模型补技术字段/样例、隐式复跑模型或模型重试循环。同一已观察语义规则按稳定来源键只生成一次；模型仅返回必要函数源码。
- 取消默认扩大长URL、关闭自动导航、关闭视觉/推理、增加额外属性等“顺手优化”。仅在现行来源完整、原生行为与真实代价核验后决定具体配置；use_judge=False、宿主管理信号等现行产品边界不能混作待恢复能力。

## 4. 原生工具转换覆盖先行

**先建立并核验固定版本、实际开放工具的转换/运行覆盖，再撤对应的编译原因限制。** 不先把全部工具放开，让长探索最后撞到 unsupported；也不能靠永久禁用或大量提示掩盖缺能力。

清单以锁定 B-U 0.13.8 的实际公共工具 schema 及 Agent 最终配置为准，包括确需的自定义读取/接管工具。本表是审计分组，不是新的硬编码允许名单：

| 工具/动作组 | 必须核清的转换与运行合同 |
| --- | --- |
| navigate、go_back、switch、search | 当前输入/链接或查询绑定、真实重定向、任务tab归属、现有导航预算；search仍经原生导航事件，按授权约束具体访问 |
| click、input、send_keys、dropdown_options、select_dropdown | 稳定目标和当前候选绑定、参数/结果、真实输入/事件、焦点与状态；复跑时经现有解析生成本次原生index，不保存探索index |
| scroll、find_text、wait | 原生滚动定位、状态变化和后置条件；已有 supporting wait/readiness 归并不能漏必需等待，不能以固定睡眠替代完成条件 |
| find_elements、search_page | 当前查询输入、原始结果和完整性、运行消费者；纯探查归审计，方法所需读取必须有确定性运行路径，不靠摘要代替数据 |
| read_file、write_file、replace_file | 复用原生 FileSystem、任务目录和授权文件；区分Agent工作笔记、方法中间数据、正式交付，绑定本次运行文件状态/结果，不复制文件系统 |
| upload_file | 复用原生授权文件检查和输入控件；绑定运行文件/目标，保留一次提交及失败可能副作用，不能自动重派 |
| close | 仅关闭已证明属于本次任务的tab；来源与清理核验仍成立，不接管个人tab，也不把原生“已关闭”文字当最终清理证明 |
| save_as_pdf、条件可用的screenshot | 复用原生生成，补任务产物/输出/持久化/清理合同；不要把临时文件路径当可交付成果。独立截图工具与原生视觉观察分开 |
| evaluate | 保存真实代码、参数、结果和效果；复用已存在的脚本/原生派发能力。不能把任意JS猜成只读，不能用脚本替代受保护原生输入或绕过授权、预算；未知效应不能按纯探查删除 |
| extract | 原生模型提取可以探索并审计；正式零模型交付必须有当前确定性读取/投影。确需模型语义时只能用已明确的显式llm节点；不能悄悄调用原生extract或冒充普通读取 |
| done及人工接管 | 原生结束/暂停事实、业务输出和编译状态分开；宿主装配已确定引用，不让模型重抄业务值、技术字段或编译图 |

每组沿“原生参数/行为 → 实际来源 → 当前绑定/状态与结果 → IR → 原生复跑 → 必要反例”闭环核查。记录实际入口、消费者和缺口，复用现有工具及节点类型；没有验证的通路不能标支持。原生类型覆盖不等于任何探索证据都能自动还原方法，未来版本/任意新增工具也不能自动获得支持。

### 4.1 已核实的入口与逐组实施决定

现行原生工具来自固定版本的 `browser_use/tools/service.py`；探索使用 `author.py` 的同一个 Tools，普通执行使用 `capability.py:OrdinaryCapability._act`。后者目前仅传 `browser_session` 和 `page_extraction_llm=None`，**没有原生 FileSystem 或授权文件集合**。因此文件工具不是删掉排除名单就能恢复。以下都是设计决定与待实现路径，不是已经支持的宣告。

| 工具 | 当前通路及本版转换决定 | 解除限制前必须成立的反例 |
| --- | --- | --- |
| navigate/go_back/switch；新增 search | 已有 `browser.workflow-step@2` capability 与目标/参数绑定；search 复用原生 query/engine→NavigateToUrlEvent，不自造搜索导航。导航后继续用真实当前文档事实 | 查询绑定变化、重定向、跨 tab owner、站点授权拒绝；搜索站点未授权时仍由原 guard 拒绝，不能放宽来源范围 |
| click/input/send_keys/dropdown_options/select_dropdown | 已有 workflow-step、TargetResolver、焦点/状态证明；保留，删掉重复或无依据适配，不保存探索 index | 同 URL 控件替换、焦点变化、输入/选择真实事件、提交失败可能副作用；不能重派 |
| scroll/wait；新增 find_text | 已有状态/等待合同；find_text 经原生 ScrollToTextEvent，转同类 workflow-step 并保留滚动效果和文本输入绑定，不能归纯探查 | 未找到文本、容器/位置变化、仅滚动才出现的必需内容；条件未满足不得凭固定睡眠成功 |
| find_elements/search_page | 已有查询证据/验证读取与 observation-only 分类；有消费者则编译当前可执行读取及 JSON 输出，search_page 只在已有证据证明研究用途时排除 | 0项、多项、截断、无消费者及 readiness 消费者；保留原生计数，禁止将详情追加长期记忆 |
| read_file/write_file/replace_file | 在同一个执行 runner 的owner任务产物目录实例化原生 FileSystem，并经同一个 `Tools.act` 传入；普通 capability 的输入绑定保存文件名、内容、append/替换参数，结果按原生返回值读取。每次新运行独立文件状态；恢复先核本次文件字节/摘要与pendingEffect，原生 get_state/from_state只能用于已核一致状态，不能覆盖部分写入 | basename 碰撞、越界/未授权路径、替换失败、append 中断；工作笔记只有证明无人消费且无交付/控制作用才归审计；方法文件依赖不得删 |
| upload_file | 同一 workflow-step，扩展现有稳定目标与运行文件绑定；adapter 解析本次产物/已授权输入为 available_file_paths，原生 upload_file 再校验并派发。不能复用 `legacy_files.py` 的自写上传作为“原生恢复” | 失效文件/目标、授权外文件、已派发后错误；未知副作用进入现有 pendingEffect/uncertain，不自动重新上传 |
| close | 同一原生 CloseTabEvent；tab 参数由当前任务 tab 绑定生成，不能保存探索 tab_id。先证明 owner，再用现有关闭/子进程核验；节点关闭与全执行清理分账 | 个人 tab、陈旧 tab、native 返回“closed”但对象仍存在；不能靠文字结算或关闭整个 Chrome |
| save_as_pdf；原生配置允许时的 screenshot | 同一 Tools 原生生成和 FileSystem；输出绑定本次文件结果。复用 `content-receipts.ts` 已有 owner/realpath/摘要/大小核验与 repository.saveArtifact，补文件字节及媒体信息的产物适配；交付 ArtifactReference，不交付会被 finally 删除的裸路径 | 文件实际存在/可读、字节摘要、产物已保存后才清临时文件；超过现有消息/产物预算如实留缺口，不新建大文件传输框架。use_vision=True 的原生独立截图排除不是 B-A-T 禁用 |
| evaluate | 本轮不开放任意JS入口：原生Runtime.evaluate可改DOM/发请求，记external_write不等于守住原生输入；没有现有guard能证明该用途受控时保留安全限制并注明理由。所需确定性读取/计算用已有受控read/function；确有已授权且受控的脚本通路才复用同一Tools.act及当前绑定，不造JS沙箱/语义分类器 | JS给input赋值/调用DOM click、请求/异常前副作用、样本值/不稳定索引；现有授权/预算/owner/原生输入边界有一项不成立就不能开放。此决定来自用户保护要求，不以编译缺口作为安全依据 |
| extract | 原生探索保留。仅研究用途可按证据归审计；结果被方法消费时，必须转换为已验证当前 read→function 投影。原生 extract 拥有模型/浏览器/文件上下文，现有普通 capability 和通用 llm 节点不能假称等价承接 | 动态值不得冻结；两站正式链保持0模型。有明确授权的显式 llm 任务才可补其真实上下文合同，不能为本次加隐藏模型或把原 extract 调用塞进普通节点 |
| done；bat_read_fields/bat_inspect_action/bat_request_human | done 按§5.2恢复原生结束；后三者分别保留必需确定性读取、无需重派副作用的方法检视和接管。绑定/方法状态由宿主计算，不让 Agent 填图或技术ID | 业务已结束但无方法、输出来源冲突、暂停/取消、检视未执行；不能把当前状态或检视结果伪造成真实动作 |

原生文件产物接线范围是现有 `hybrid_main.py` 的 runner 生命周期、`capability.py` 的 Tools.act 参数、`hybrid-runtime.ts` 的结果适配及现有 artifact 存储；仍由现有 finally/owner 管理，不新增服务或文件执行器。文件字节不进 Agent/编译模型上下文，探索文件快照也不能当新运行输入。`download_file` 在本版 SDK 没有工具函数，删除无效排除项，不伪造同名工具；下载继续消费原生 watchdog 事件。

解除编译原因限制随对应工具的转换、原生派发和消费者同包完成。**有限工具覆盖可核验，任意轨迹自动恢复意图不可保证**：合法动作如果缺参数化、因果或输出证据，原生可以结束而准备仍不可发布，按§5/§8.0局部修订；这不是重新禁用工具或运行后吞掉编译错误的理由。

## 5. 编译失败的处理与准备完成

拆开三个阶段的错误，不再用整段 broad catch 混成一种停止原因：

| 类别 | 处理与产品结论 |
| --- | --- |
| 真实业务结果未满足已确认需求 | 原生 Agent 根据现场继续；不得伪造成功或由宿主决定新的业务需求 |
| 转换器缺能力、绑定/注解或候选编译错误 | 保存来源和具体候选缺口；开发修能力/错误，必要证据不足则通过显式局部新来源修订。准备未完成、不可发布，不得自动重放、不断追加提示或继续错误兼容分支 |
| 来源无法可靠保存、身份失配、越权、已观察访问限制 | 原guard与B-U stop/pause在下一派发前生效；保留实际前缀、错误和可能副作用，恢复仅作用于本owner |

原生业务结束不等于准备成功。只有现行转换成立、必要方法依赖完整、候选通过同 revision/checksum 的样本和独立验证，准备才可发布；正式链合法结束后不追加全局语义judge。

在线节点仍必须生成。来源可靠持久化和候选提交分别核清：纯编译异常不能被误归为来源损坏；来源保存失败也不能被吞掉。不得用假空图或删除来源缺口制造可发布状态。

### 5.1 Python→TypeScript→持久化→ACK的完整改动

已核实：`author_compilation.py:after_step` 把采集、语义注解、编译和 exchange 包在同一个异常范围；`hybrid-compilation-checkpoint.ts:saveAndAcknowledge` 只有整个 handler 成功才 ACK(true)；`authoring-build.ts:accept` 又在候选校验/物化之后才保存 job。**只改 Python catch 不能解除编译失败对 B-U 的控制。** 按以下同一现行合同修改，Python、TS schema、job消费者和验证必须在同一自洽变更内完成：

1. 每轮仍发一个现有 checkpoint，沿用 owner/sequence/digest、消息预算、单 pending 槽、取消和无重发规则。payload 保留 phase/stepId/canonicalRequest；候选改为互斥的 `result`（现有 prefix/final response，包括 gaps）或 `error`（固定 code、失败阶段）。不加第二 IPC、背景队列、逐动作模型或旧包 decoder。
2. 采集与来源合同校验在编译异常处理之外；在语义注解前取得不可变真实快照。注解/转换失败仍发送有效来源和 candidate error；成功的派生 facts 只按现有 append-only 规则附加，不能改动作、原观察或旧 fact。源数据本身无效不能伪装 candidate error。一次语义来源键包括失败也不再尝试；下一快照只有新来源可新增工作。
3. TS先核验包摘要、活动owner、step/requirement/plan/registry身份及来源前缀。来源接收游标独立于成功候选：在现有 job.authoring 保存一个当前 sourceReceipt（owner、step、sequence、digest、phase、canonicalRequest），再校验/物化候选。来源与最后有效候选属于不同事实，不能用上次 build.sequence 校验本次接收或覆盖旧图。
4. candidate result 的函数/来源/物化失败和 Python candidate error 记录为当前编译缺口，保留已有有效候选并明确其来源已落后；没有候选就明确不可编译，不造空图。已有 gaps 仍存真实覆盖。通过现有 saveArtifact/saveJob 保存固定原因及必要拒绝证据，所有写入都重新核活动事实；UI现有编译状态显示缺口，不新增第二份可执行图。sourceReceipt只保留当前快照；最终/拒绝证据复用既有artifact，不逐轮追加整份来源副本。
5. ACK(true)表示有效来源和候选结算状态已可靠保存，**不表示候选通过**。纯候选错误结算成功则 ACK(true)，B-U继续；来源/身份/存储失败则 ACK(false)或原有超时，停止后保留前缀。现有确认预算保留实际工作上界，error包没有函数样例成本；不能调大超时掩盖阻塞。这里不承诺消除同步编译耗时，必须实测。
6. 同owner/seq/digest相同包幂等；冲突拒绝，取消后不唤醒旧Agent，旧finally不能清新槽，晚到结果不得覆盖取消、新step或新revision。恢复不自动重新发动作；接收游标只用于当前探索源，不能变成通用队列或第二检查点数据库。
7. final 即使候选失败也交接真实来源。只有有效final、同来源的候选无gaps且物化成功才能设置 `AuthoringBuild.finished`；`finish`/准备推进/发布同时核sourceReceipt与候选身份。结束后编译失败是准备失败或需求返回，保留原生业务结束，不启动离线模型救援或重跑动作。`confirm_intent`仍走既有需求返回/暂停合同，不能归普通编译错误后继续替用户决策。

现行消息形状固定为 `{phase, stepId, canonicalRequest, candidate}`，candidate为 `{kind:"result", response:<现有响应>}` 或 `{kind:"error", stage:"annotation"|"compile", code:<固定码>}`。TS的validate/materialize失败记在候选状态，不能冒充Python原始包。外层/来源先校验并保存，内层响应schema失败属于候选失败；不得在外层parse时因内层非法就丢掉合法来源。

sourceReceipt是当前合同所需的最少接收事实，不新增历史版本适配。现有 build.payload 中与 receipt 重复的 canonical source 在同包迁为候选内容/来源引用，实际读写消费者一起修改；当前接收始终读receipt，不按历史包形状分支。canonical source仅存受控仓储，现有 `workspace-projection.ts` 与 activity schema只投影状态、覆盖和已物化图，不把receipt全文送进轮询或模型。持久化记录不删除；若现行合同调整会影响服务启动读取，先调整该读取为正确的当前事实入口，不能用全表重写历史补救。

### 5.2 原生结束与宿主输出装配

`author_tools.py` 当前自造 done schema、覆盖 get_output_model，并把 `complete_from_read_refs`/schema错误返回 ActionResult.error；`author.py:_business_result` 又读取同一结构化结束输出。这条耦合必须整体收掉，不能只删一条提示。

- 使用原生 `Tools(output_model=None)` 的 done(text/success/files_to_display)，保留原生结束、失败和附件事实，不新增 methodOutcome/readRefs 等必填技术字段，不覆写 get_output_model。必需读取和人工接管工具继续注册；删除只服务旧 done 合同的反馈计数/注册/分支及消费者。
- 输出在原生结束后由现有 `complete_from_read_refs`、输出装配和真实读取证据确定，宿主选择唯一无冲突来源；冲突/缺项/不匹配成为具体准备缺口，不能猜最新读数、要求模型复制业务值或把缺口反馈为新的原生动作错误。
- 原生完成事实以 Agent/history 的实际 done/success/result 为准。trace 的可编译完成条件、输出验证和候选状态独立计算；输出未证明时保留 ended 及真实动作，final仍交接有效来源，准备不能通过。涉及该语义的 capture/normalize/source_response、Python/TS校验和产品推进一并改，不能只改 author_tools。
- 现场业务未满足仍由原生观察和任务驱动；访问限制、身份失配、来源保存失败、显式接管/取消仍走原guard/stop/pause。编译器不可把自己的schema失败伪称业务失败来延长探索，也不能把原生 success直接当发布依据。

## 6. 按自洽变更推进

旧 A→B1→B2→B3→C→F 的既有实施与验证是证据，不是本版已通过结论；按当前缺口推进下表，不为重新开始重做已确认正确的能力。

| 包 | 行为/职责与入口 | 关闭依据 |
| --- | --- | --- |
| P0 只读核清 | 本版已核清§4.1/§5.1/§5.2的入口与缺口；新session只检查checkout/授权/源码是否漂移及实际受影响消费者 | 无漂移沿本版实施，不重做整轮架构调研；新增事实推翻决定时定点修订 |
| P1 查询与反馈 | action_dispatch、采集/查询证据的相关消费者；保留原生计数及完整来源，撤除长期详情污染和无依据参数改写 | 原生反馈与独立来源各自正确；已有0/多项/截断查询边界和真实来源核验；不新增模型交互 |
| P2 转换能力 | 按第4节实际缺口逐个自洽闭环补现有合同，必要API与其消费者同包；删不服务现行合同的历史工厂/字段兼容 | 每项恢复工具有实际转换/运行路径，目标/产物/副作用/owner反例成立；不引入第二工具执行系统 |
| P3 编译与结束 | §5.1完整跨进程ACK及§5.2原生done/宿主输出；修改Python/TS边界、AuthoringBuild和当前job/workbench消费者 | 候选编译失败ACK仍成立但发布被拒；来源/权限/存储失效仍停；取消和重复包安全；同一实际来源在线候选仍更新 |
| P4 方法与减负 | 第8.0节现有分类/绑定/裁剪/修订；收掉prompt教学、重复推导与模型技术字段 | 当前读取→选择函数→目标绑定及状态/控制依赖成立；错误方法局部新来源修订；实际模型负担与增量可解释 |
| P5 冻结验收 | 第9节正常产品流程、速度/稳定性/反爬/平台及清理分账 | 按原需求完成两站正常链路和同版复跑；发现失败保留并修复后重新冻结 |

一个包可拆成多个逻辑自洽变更，也可能已有部分成立；范围按真实闭环而非文件数量决定。纯重构与纠错/补能力分开说明，避免无关格式/命名清理。每项只保留必要新逻辑，删除被替代路径；验证失败先修正该项，不在错误补丁上叠加。

已知替代对象按职责随包清除：P1收掉 `retain_query_content` 的结果改写，三个原生参数变更（scroll 0→None、extract附加格式指导、find_elements默认属性）先对照原生行为，后两项需求仅供独立采集时迁出派发参数；不能改变原生反馈。P2移除 `hybrid_compile.py:matching_registry` 的历史工厂枚举、`registry.py` 的旧字段形状分支，只消费本次实际注册表及摘要。P3删除§5.2旧done适配。P4删除要求Agent解释编译、抄技术字段/例子的指导和重复推导；保留业务任务、已确认输入/输出、授权和最少读取/接管工具说明。scalar collection等B-A-T读取归一化必须基于现行合同正确性核清，不因同文件有垃圾整文件删除。

`agent.state.last_result` 的当前写入服务原生多动作中途 stop/pause 后 `_finalize` 保存已执行前缀；只有原生中断反例证明不再需要时才能删除。不能把这一安全接线和查询长期记忆污染一并去掉。原生参数默认恢复（directly_open_url、URL缩短、属性等）分别核验真实授权/性能后决定，不能借减提示改用户需求或访问范围。

## 7. 变更与评审的实际交付

修改前沿现有 Product Alignment、Reuse Assessment 记录真实目标、组件复用和具体冲突；同一事实不重复写多份。变更说明要让未参与实现的人能判断问题、行为差异、依赖、代价和验证，不能只写“加补丁/阶段完成”。

评审必须看需求、完整diff及上下游，而非作者摘要或检查数；逐项判断职责/库边界、行为、并发与副作用、复杂度、测试有效性、命名/说明和必要文档。技术事实与真实反例优先；作者自检和AI复核的范围、局限分别写清，不能继承旧“无must-fix”宣称批准本版。

只运行覆盖本次真实不变量的最相关现有验证。已存在的源/结果案例优先；必要补充在现有测试中，先核清其能否发现真实错误，不写模型生成样例或只断言替身成功。文档调整仅做链接、围栏、定点diff等静态核验。不存在由规范自动授权的全量测试、依赖升级、重跑或独立评审委派。

### 7.1 已存在的验证与真实缺口

| 改动 | 最相关现有验证入口 | 必要断言或实测；当前还未执行 |
| --- | --- | --- |
| P1查询反馈/独立证据 | vendor下 `test_empty_native_query_pipeline.py`、`test_query_record_projection.py`；API `test_query_memory.py` | 旧“长期记忆包含详情”断言须改为原生反馈不变，完整详情仍在来源；0/多项/截断不误判，不增加模型调用 |
| P2工具转换/原生派发 | vendor `test_hybrid_compiler.py`、`test_hybrid_author.py`、`test_target_document_identity.py`；API `hybrid-contract-conformance.test.ts`、`hybrid-command-accounting.test.ts` | 按实际改变工具定点补现有文件；必须核验真实Tools.act及FileSystem，不只检查ADMITTED名单。需现场时复用 `hybrid-interaction-read.acceptance.ts` 的同runner及现有受控页面；它目前只覆盖交互读取，不能冒称已覆盖文件/关闭。`foundation-runtime-headless.acceptance.py` 有Windows硬编码，不能当本次Mac原生验收入口 |
| P3跨进程错误分离 | vendor `test_author_compilation.py`、`test_author_callback_stop.py`；API `test_compilation_control.py`、`online-compilation.test.ts`、`authoring-build-progress.test.ts`、`hybrid-authoring-final-close.test.ts` | 编译/物化异常时来源保存、ACK(true)、继续/不可发布；来源保存/身份错误停止；下轮append、重复ACK、取消、晚到包、final gaps、清理错误保留来源。测试必须经过真实消息schema和repository路径 |
| P3结束/输出 | vendor `test_author_completion.py`、`test_method_completion.py`、`test_method_result_boundary.py`；API `minimal-author-contract.test.ts` | 原生done实际schema和结束行为；缺项/冲突的输出由宿主留缺口而不让Agent再跑；execution null/data/content输出、失败/暂停和附件；不能把旧自造schema的断言保留成目标 |
| P4依赖/方法/局部修订 | vendor `test_natural_prefix.py`、`test_natural_read_liveness.py`、`test_consumer_readiness.py`、`test_natural_repeat.py`、`test_selection_read_contract.py`；API `hybrid-inspected-method.test.ts`、`hybrid-read-input.test.ts`、`hybrid-natural-repeat.test.ts`、`release-evidence-integrity.test.ts` | 不按batch/URL裁剪；当前读→选择→当前目标、必需无输出/等待、失败写入部分副作用、依赖闭包修订后的revision/双验证失效。已有同现场成功不足，缺反例在这些现有文件补 |

上述是按改动选择的入口，不是每包全跑名单。TS定点命令为 `node --import tsx --test apps/api/tests/<相关文件>.test.ts`；Python用已装venv与 `PYTHONPATH=apps/api/python:apps/api/tests:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests work/upstream-browser-hybrid/.venv/bin/python -m unittest <相关模块>`。全部命令在实际checkout根目录运行；引用文件已核实存在，命令尚未作为本版运行验证。跨包合同变化补所属workspace类型检查；不执行根级test/check或check:mainflow全套。

受控原生场景需资源创建时先读现有工具策略/资源规则，核owner与精确退出方式；没有授权不得用验收名义启浏览器。源码评审记录每项真实行为差异及测试能否暴露错误；实际复核者与覆盖范围如实记在本文件/现有审核记录，不新建一批测试文件、检查框架或回执。不能用测试数量/绿灯替代两站产品验收。

## 8.0 多动作到可复跑方法

### 三种产物和一份可执行图

| 产物 | 角色 |
| --- | --- |
| 完整探索审计 | 保留原提议、实际派发参数/结果、观察、失败、停止及未派发事实，不能直接播放为宏 |
| 在线候选 | 随真实来源生成节点、覆盖与缺口；来源未被使用不代表现在可以永久删除；前缀不能绕过准备/发布 |
| 最终候选/TaskChain | 依据需求和数据、控制、状态、readiness依赖形成方法；样本/独立验证/发布绑定同revision；普通运行只执行这份图 |

B-U batch 是一轮决策下串行效率边界，不是任务节点边界或并发授权。一轮可形成多个候选节点，多轮也可形成一个参数化方法；复跑调度继续由LangGraph承担。

### 复用现行编译与有限等价规则

复用 natural_compile_actions/classify_natural_prefix、natural_prefix/compile_natural_prefix、natural_compile_result/finalize_natural_compilation、natural_read_liveness、coverage和TS物化器。分类、覆盖、绑定和图属于同次不可变编译快照；不能因batch/history双重记录重复生成，也不能越过not_compilable缺口接边。原生位置和稳定来源键由代码生成，不让LLM填keep/drop、节点ID或依赖图。

- 数据依赖：运行输入、当前候选读取、函数输入、目标/参数、交付、分支/循环。动态选择必须保留当前读取→已保存确定性函数→当前目标绑定，不能冻结样本ordinal、href或选中值。
- 控制/状态依赖：需求指定顺序、导航/输入、窗口/文档、展开/滚动、提交/播放及必要等待。没有值输出不等于无用，不能只按data binding删除有状态动作。
- 没有细粒度等价证明时，按真实顺序保留成功、合法且符合需求的状态路径；不推断可交换或抵消。审计proof引用也不能让未消费纯读取永久保活；必要readiness证明必须保住。

| 动作/片段 | 方法处理与边界 |
| --- | --- |
| 未派发尾部 | 只保留原生真实停止/拒绝依据，不生成执行节点、不补结果或补派发 |
| 页面查询/检视、探索extract、选择或重复探查 | 仅沿现有有证据的observation-only/validation/repeat-probe归审计；有运行消费者或未知效应不能按工具名删 |
| 未消费纯find_elements读取 | 复用liveness与完整消费者追踪裁剪；必要readiness/循环lookup保留，唯一证明缺失则留缺口 |
| 最终输出、动态选择、分支/循环所用读取 | 保留可运行read/function/binding，重新读取当前现场，不以模型摘要或样本值代替 |
| 等待/重复就绪探查 | 仅沿已证明supporting/bounded wait归并为有界条件；不把探查次数、思考时间或固定sleep当完成条件 |
| inspection与同一实际动作双记 | 仅用同源coalescing；参数相似不能合并两次真实提交 |
| 多输入/分页迭代 | 复用repeat-method为一个参数化方法，保留当前输入、推进/退出与迭代状态，不生成N份链或逐项调Agent |
| 必需无输出动作/合法绕路 | 保留实际方法、原顺序、绑定及后置条件；URL相等/回到同页不证明状态或服务器副作用抵消 |
| 失败/未知副作用动作 | 原失败和已执行前缀完整保留；retryOf或后继成功不证明无部分副作用，不自动重派/消除；只沿现有已证明只读失败探查规则处理 |
| 已证实错误或越权业务动作 | 不进入发布方法，留下真实原因；通过局部合法新来源修订，不改需求、不擦掉错误后宣布通过 |

在线前缀与final复用同一分类路径；final在必要消费者明确后做liveness/readiness重绑定、输出与repeat归并，仅绑定保留节点和真实证明。语义规则按稳定来源键一次生成；重分类不重复问模型。错误方法通过既有局部修订形成新候选，不新增全局裁剪器/轨迹规划器。

### 最相关的反例

用已有真实来源、可控页和现有检查覆盖：同batch研究查询+正式当前读取/选择/点击；提交后延迟结果但仅提交一次；导航/切tab导致尾部未派发；同URL子目标替换；展开/滚动后必需读取；允许绕路返回但无等价证明；迭代边界/候选变化；失败或未知写入的部分副作用与取消。不得用两个成功只读查询替代写入错误边界证据；不得为每个用户任务追加全终态、全反例或全局语义judge。

## 9. 固定代码后的产品验收与性能

先核清中断job、进程、浏览器owner，再按新session授权恢复必要现有服务；不自动重放。开发期只做相关核验，产品验收前固定代码、依赖和保护区。冻结后不改需求、手写选择器、附加答案提示、补数据库或边修边跑；遇失败保存该次事实，修复后重新冻结。

两站沿原确认需求分别进行正常准备→样本→独立复验→正常UI发布→同一版本连续3次正式复跑→本owner资源结算。正式输出来自真实当前页面，不能硬编码检测数量/结论或通过改个人环境求通过。无可变业务输入记录不适用；有参数/动态规则使用不同合法输入或已有合法现场变化核验，三次同现场成功不能替代变化证据。

沿用原方案的整改目标作报告基准，不能把它们改成原生停止条件：探索目标<=3分钟、整个job主Agent调用目标<=12；完整准备到双验证可发布并关闭资源目标<=5分钟；简单任务非模型适配成本目标<=15秒。未达目标就速度不通过，不删业务结果、来源保存或反爬节奏来满足数字。

探索从job首次Agent开始到所有步骤探索来源返回；完整准备从请求接受到同一候选双验证可发布和所属资源关闭，包含排队、连接、编译、验证和清理。分别报告Agent/extract/compaction/semantic_annotation调用及失败/取消/重试，模型、采集、编译、网页等待、产品人工接管和清理耗时；开发会话/工具同意等待不混为产品时间，不偷减墙钟。原生对照只比共有探索阶段，同TaskBrowser、授权、型号、需求和输出合同，不与完整准备终点混比。

速度、稳定性、反爬、平台结论分别给出；Windows未实测单列未完成。TaskRun合法完成与execution清理分账，cleanup_required不触发模型修复或覆盖业务错误。所有失败及耗时如实报告，不只取最快成功样本。

## 10. 新 session 的持久交接

AGENTS保存项目级开发/评审规则和本计划入口；ROADMAP只保存当前顺序；PROGRESS顶部只保存当前断点、事实和未决项；历史实施记录仅作证据，不自动授予实施权限。官方说明Codex启动时构建指令链，见[AGENTS加载机制](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。新session须确认实际checkout、适用AGENTS/override及加载范围，不假设聊天历史或全局记忆会自动提供本版方案；不得改全局配置“确保生效”。

新session先读AGENTS、主计划0节、ROADMAP/PROGRESS顶部，再完整读本计划和[审核记录](BAT_NATIVE_EXPLORATION_REMEDIATION_REVIEW_20261013.md)。本次源码复审已具体关闭工具路径、跨进程错误接线、原生结束/输出分离和验证入口这四项方案缺口；新session先核漂移，不以“再规划一轮”代替实施。用户在那里明确授权实施后，按P0→P1→P2→P3→P4→P5自主推进，保留原A→B1→B2→B3→C→F的不变量与最终验收；不重复请求旧已授权动作，也不擅自扩大测试、资源或系统配置范围。

本次交接未启动新session、未改变开发模型、未调用产品模型或浏览器；本版尚无独立审核通过或实施/产品验收结论。
