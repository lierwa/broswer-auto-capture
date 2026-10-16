## 2026-10-13 最终更新

本轮已实施修复，最新结论以[完整结算](PUBLIC_NATIVE_REPAIR_CLOSEOUT_20261013.md)为准，下面早期“方案待实施”不是当前状态。BrowserScan原需求最终正式通过（110项/0模型/清理confirmed）；Pixelscan同一草稿修后样本与独立复验通过，但生成条件绑定本次error结果，新草稿未发布，整批问题未关闭。

追加确证的两个代码根因：原生find_elements的计数摘要被B-A-T明细记忆覆盖，导致query_result_summary_unrecognized；后续必需对象读取因requiredPaths空跳过等待，导致页面结果尚未出现时立即失败。前者保留原生摘要再追加明细，后者复用既有有界等待覆盖对象/非空数组，分别先红后绿并完成真实Chrome验证。

仍未解决的是准备方法与发布验证的泛化边界：同一现场两次成功不能证明其它合法终态或分组变化可复跑；原生模型仍可能忽略已有通用说明。该问题不能用继续改需求、追加提示词或结果特判关闭。实现范围、反例与关闭条件已写入结算文档，尚未实现。

# 两站原生任务剩余问题根因与修复方案

更新：2026-10-13 01:44（Asia/Shanghai）。

## 2026-10-13 实施记录

用户已授权连续修复并验收。以下诊断快照保留；生产修复与验证结果在本节补充，不把方案当完成。

Product Alignment:
- natural-language task: 用正常 B-A-T 入口完成检测报告读取，以及列表/详情等具有同类输出和生命周期的任务。
- reusable chain boundary: 合同驱动读取、来源装配、准备结束与资源核验。
- runtime inputs: 已确认任务的类型化业务输入和导航范围。
- dynamic task outputs: 当前页面真实结果；不复用探索样本值。
- generic platform capability used: 原生 B-U Tools、ReadSpec、ValueBinding、编译器与同 owner 恢复。
- replay model calls: 普通节点为 0；不新增模型循环或全局 judge。
- site/task-specific code added: no

Reuse Assessment:
- capability: 模型输入合同、结果绑定与生命周期修复。
- existing implementation in repository: Pydantic create_model、JSON Schema Draft202012Validator、Zod、ReadSpec、输出 assemble、RunnerCleanupReport、verify_closed。
- mature candidates and pinned versions: 复用当前锁定的 Pydantic 2 / jsonschema / Zod 4 和现有 B-U、LangGraph；不升级或替换依赖。
- selected implementation: 独立模型入口适配到现有内部合同；已有读取、组装和清理能力。
- reused public surface: create_model/model_validator/model_serializer、JSON Schema 校验与既有 runtime API。
- B-A-T-owned adapter and remaining gap: 删除重复模型字段，统一入口与来源，保留错误和资源事实。
- license/runtime/platform fit: 沿用已安装依赖和许可证；纯 Python/TypeScript 适配，不增加平台专属实现。
- browser/runtime/state ownership conflicts: 每任务一个 owner；不接管个人窗口，不新增调度器。
- replay model calls: 0 个新增调用。
- rejected candidates and evidence: 没有替换需求；现有读取/组装/恢复已覆盖能力，缺口在 B-A-T 接线与合同。
- focused validation: 真实工具导出 Schema 与调用入口、混合来源完成/编译/复跑、准备取消持久化与恢复、真实两站完整流程。

公开 API 依据：[Pydantic 动态模型](https://docs.pydantic.dev/latest/concepts/models/#dynamic-model-creation)、[JSON Schema 扩展](https://docs.pydantic.dev/latest/concepts/json_schema/#using-json_schema_extra)。实际兼容性由当前安装版本的聚焦测试验证。

### 已落地与验证边界

- 新数据读取使用独立 Pydantic 模型，模型看到的 JSON Schema 同时用于实际入口校验。删除 take/maxItems/captureContent 等内部参数；唯一结果路径由代码确定，多路径只选合同枚举；单字段投影从11项减为6项。旧持久来源保留原解析规则，前一版32种工具注册表组合摘要逐项一致。
- done仅必填success，删除methodOutcome，reason在失败时要求说明；唯一无冲突读取引用由宿主绑定。选择语义函数只返回源码，样例和输入来自已观测证据。合同唯一值与真实读取统一进入完成、来源核验与编译，不增加模型循环。
- 准备清理结果和owner写入不可变证据，关闭未核验与关闭失败分码；只有原控制器退出后才允许同owner verify_closed/end恢复。业务失败不会被清理成功覆盖，原清理失败证据保留。
- 模型调用使用Node内置代理支持，仅本API进程消费已有代理、回环直连；通过官方诊断通道保留白名单网络错误码/HTTP状态，不保存请求正文、URL或凭据。未改共享Clash规则、系统网络、个人浏览器设置。
- 第一轮真实Pixelscan准备job `2aa9807e-7edb-4665-835d-9441ff0c3dc0` 完成16动作、17次模型调用全部成功，四项结果来源齐全，但未形成整任务链路。此时发现TS消费端仍要求被删除的methodOutcome，且把标量数组读取的单容器预算误当记录数组预算。已修复两处，原保存来源离线核验四项输出并生成11节点；原失败保留、清理首次confirmed。
- 同类cross-language检查还覆盖已检查导航的编译入口：受核验选择函数提供派发URL，原生导航和样本检查实际落地；不再附加落地URL等于派发URL的假条件，范围授权和必经控制流校验继续有效。
- 已通过52项Python读取/完成协议检查、21项Python→TS来源/方法检查、15项相关生命周期与网络诊断检查、API类型检查。随后显式指定项目Python，真实Profile所有权与六用途模型桥2项通过；human-wait旧替身兼容失败仍单列，不把未通过项计入。日志保留在忽略目录 `work/public-native-test-20261012/`。

以上为工程验证，完整产品验收继续进行：原Pixelscan有两个步骤，首次仅保存首步骤来源，不能借离线编译宣称完成。正常UI已启动新job `52fd006a-ddfe-4cd7-8be0-45e48b671f57`，需求未改；BrowserScan在其结束后顺序执行。两站未完成发布及正式复跑前，本批问题不结算为已验收。

### 第二轮真实流程新增发现与修复

job `52fd006a` 两步骤均done成功，共26动作、27次模型调用完成，资源首次清理confirmed；第二步骤缺少输出装配事实，发布正确被阻止。三个字段来自现场读取，网站名称继承上一步输入；样本恰好整体等于输入时，旧 `_static_output_fields` 优先把根对象整体继承，随后又与三个子字段读取重叠。原来源复现精确错误为 `natural_output_path_conflict`，并非模型缺字段。

修复父子路径判定：已有动态子来源时，静态/输入匹配只深入未覆盖子字段。嵌套同类反例通过；真实保存来源在独立诊断中重建后，四字段分别绑定3个读取节点和1个输入路径，Python编译零缺口、TS来源核验通过并生成6节点。原产品来源/历史不改写。数量不相交、必须选择子集、合法相交数量的3项编译边界仍通过，现有方法来源5项与读取范围1项通过。

同时更正测试夹具：内部ReadSpec全参数不能作为当前模型公开参数写入新来源，默认方法夹具改用实际container/fields，未放宽生产入口。准备阶段这两轮暴露的methodOutcome消费遗漏属于本次适配未一次贯通的问题；父子来源重叠和标量数组预算误判在旧实现已存在，此前被前段阻塞遮住。两类责任分别记录，不拿历史已关闭的导航/安装问题充数。

原失败来源没有最终装配事实，现有离线恢复不能自动补建，故不能直接发布；“完整来源可以直接离线恢复”的中途判断已撤回。修复后正常入口新job `3839cfd9-f05c-4b5c-8bc6-71b7037a8e8c` 正在执行，需求仍v1；冻结1206份源码/配置。追加实跑前无活动任务或执行，重载仅本checkout的API服务，没有重启Mac/VM/Chrome。


### 第三轮复验发现的动画中间态

job3839cfd9完成39动作、40次模型调用，两步生成成功。样本c9fe5c3e总体结论正常；独立复验1e59088d合法完成但输出含旧scanning与新inconsistent，未据此发布。实际DOM显示data-state先改error，旧span以position:absolute淡出、新span从opacity0淡入，最终旧span移除；这不是永久隐藏文字或模型虚构。

Reuse Assessment:
- capability: 读取渲染文字前等待现有过渡结束。
- existing implementation in repository: ReadSpec/project_fields，B-U Element.evaluate(awaitPromise=true)。
- mature candidates and pinned versions: 浏览器原生Web Animations API，当前Chrome154、锁定B-U。
- selected implementation: Element.getAnimations({subtree:true})与Animation.finished。
- reused public surface: 原生动画枚举、完成Promise和requestAnimationFrame；不复制动画或浏览器调度器。
- B-A-T-owned adapter and remaining gap: 限定选中字段及祖先区域、有限动画、3秒内部预算、重新查询及明确超时错误。
- license/runtime/platform fit: 浏览器标准API，不引入依赖；当前Mac实测。
- browser/runtime/state ownership conflicts: 不暂停/取消网页动画、不改变页面，不创建第二产品控制会话。
- replay model calls: 0。
- rejected candidates and evidence: 固定等待和scanning词表无法保护不同动画/任务，故不采用。
- focused validation: 实际Chrome本地DOM覆盖完成退场、取消后替换、无限动画不阻塞、暂停超时和属性原语义；外站正常草稿复跑继续验证。

官方依据：[Web Animations](https://www.w3.org/TR/web-animations-1/#dom-animatable-getanimations)、[Animation.finished](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished)。早期合法completed保留，业务内容未通过单列。


### BrowserScan的空白名称和图标状态缺口

原需求jobaf4c7ba3完成18动作/18模型调用，自动样本53c35302及独立复验132078a2均合法完成，但网站名称为空，Navigator仅名称无状态，故没有发布或宣称业务验收通过。保存来源中名称选择header的logo链接，实际可见文字为空；页面已有og:site_name属性。列表选择h3跳过SVG状态，直接读父行又会混入任务禁止收集的原始值。

Product Alignment:
- natural-language task: 读取检测项名称与状态、工单/订单标题与徽标等组合字段。
- reusable chain boundary: 原ReadSpec字段投影与普通读取节点。
- runtime inputs: 既有输出合同、已观察的容器与片段选择器。
- dynamic task outputs: 每行当前真实文字与属性，按给定片段顺序换行组合。
- generic platform capability used: B-U Element.evaluate、浏览器querySelectorAll/getAttribute、现有采样/来源/编译器。
- replay model calls: 0。
- site/task-specific code added: no

Reuse Assessment:
- capability: 不读无关邻居数据的多段字段投影。
- existing implementation in repository: ReadField/ReadSpec/project_fields/sample_read_fields、Python与TS来源等价检查。
- mature candidates and pinned versions: 当前锁定B-U与Chrome原生DOM API；无新库/升级。
- selected implementation: 在现有投影适配中增加parts，每段只有selector与可选attribute。
- reused public surface: 浏览器原生CSS选择、getAttribute（包括SVG命名空间）、innerText。
- B-A-T-owned adapter and remaining gap: 明确每段唯一匹配，固定换行、类型/预算/来源由宿主承担；复合片段的Shadow DOM明确拒绝，不把错误当空值。
- license/runtime/platform fit: 现有Python/TS与浏览器标准API，Mac实测，Windows未重测。
- browser/runtime/state ownership conflicts: 同一既有会话和容器，不创建控制器，不输出整行原始值。
- replay model calls: 0；不生成语义分类函数、不解释图标业务含义。
- rejected candidates and evidence: 整行innerText会遗漏图标并采入原始属性；逐网站映射和逐次模型判读均非必要。
- focused validation: 真实Chrome工具读取、状态变化、缺失图标、空白文字纠正；实际JS有界采样；Python→TS来源等价；旧32组协议和7份真实来源兼容。

首次空白必填文字样本不再登记为有效readRef，明确反馈应检查真实文本或已观察的metadata；可选/继承字段和合同明确固定空串不受该门影响，普通复跑仍由原输出合同决定空值是否合法。模型普通投影原6项能力保持；总schema只新增条件parts一项，组合模式只需selector+parts，宿主决定分隔符、类型、基数、样例和绑定。原整体结果没有被全局语义judge改判，自动合法完成与业务输出不合格分别保留。

实际Chrome局部回归、Python合同与来源11项、JS采样6项、跨语言消费及API类型检查通过；旧32组注册表摘要和7份保存来源动作均兼容。重新冻结1210份代码配置，原v1需求job9926fca8正在正常UI准备；最终外站结算仍待其完成及Pixelscan已发布版本在新版代码上的复跑。

### 逐行标量集合和路径投影合同贯通

冻结7 job776b66f1已选全110张检测卡片，却被内部单容器maxItems=1连续拒绝，最终失败。根因是B-A-T把标量数组表示为一个容器中的多值字段，但对外没有承担自然逐行表达的确定性转换。现在在normalize_author_action原有适配边界、来源捕获之前，把“逐行container/value=:scope”转换为“:root容器/value=原逐行selector”。不猜祖先、不截断、没有新字段；普通读取器仍消费原ReadSpec。只适用于已确认的标量数组，自身标量和对象记录数组不变，重复归一化不改变动作。

公开Schema同时约束实际字段名、属性与文本互斥、href/src URL解析、page-url自身来源及布尔/组合模式；实际解析器直接使用同一Schema，非法组合在DOM前失败。19项相关合同/编译/采样、真实Chrome异构三卡片及图标变化/邻居排除、Python→TS四种真实来源链路通过。旧32组摘要与10份实际历史来源兼容；ResultSpec旧桥替身缺human_wait/compilation_exchange已补齐，原测试通过。冻结8原需求815a4e32从正常UI准备，最终正式结果另见结算文档。

### 原生预览与可见读取的语义差异

815a4e32已通过列表读取，但网站名称重复失败；37动作/40调用后正常UI取消。当前安装browser-use/tools/service.py原生find_elements和search_page都使用textContent，可含隐藏/SVG/style文本；原B-A-T指导却宣称其定位visible text。修改仅纠正这条说明，并在图形名称场景引导检查页面已声明的metadata属性，禁止反复移动同一空白图形节点期待产生可见文字。无站点名称/答案、无新字段、无放宽innerText。真实Chrome直接调用原生find_elements看到隐藏Example，原读取器拒绝空白，读取已声明application-name的content成功；差异有真实测试证明。

取消的原始进度与错误摘要保留；因中断没有完整source artifact，不虚构参数证据。原controller退出后same-owner97a3db78恢复清理，首次unconfirmed及后续confirmed两份不可变证据保存于cancel-recovery-real-proof.json。最终冻结9为1210份源码配置，详情见结算文档。

### 宿主清理职责与终止原因投影

冻结9 job2d95828f实际done(false)的唯一声明原因为缺关闭窗口工具；其此前读取已成功，源872393a9证明现场17+93项。关闭本由宿主统一执行，已首次confirmed，但模型未获职责说明，误把本机host收尾当成自己缺能力。新增通用说明：done后宿主关闭并核验本次窗口，业务完成和清理分别审计；不要求模型做清理声明或开放个人标签控制。

同一路径多个片段不能在done合并样本，当前合同仍要求一个完整读取方法；提示异构列表使用一个涵盖全部行的选择器与逐行投影，未新增合并器或模型字段。旧sourceSuccess失败投影错误地挑第一个失败动作，导致已纠正的读取被误报为终止原因；现改为最终done(false)、最终失败动作、缺终止动作三种准确状态，保留原始历史和私密说明边界。10项终止/清理聚焦通过；TypeScript入口宽类型检查首次失败后纠正，最终APIcheck通过。冻结10未用于产品，最终冻结11继续原需求。

### 原生观察遗漏仍作为失败保留

冻结11 c0e3fc14在14动作后主动done(false)，称Navigator只有原始值，要求放宽用户排除范围。20d5828d来源中未查询SVG状态且没有字段读取；前轮已有93项图标状态独立读取证据。因此是原生模型观察/解释错误，不能归因读取器、导航、关闭或真实业务歧义。仅补通用说明状态图标/标签与原始测量值分离，先检查实际状态节点再判断缺失/冲突，不新增数据权限。最终冻结12，能力说明改进和确定性协议修复分别记录；不把前者宣称为任意未来模型的正确性保证。

## 以下为 00:06 诊断快照（实施前）

当时只处理 BrowserScan、Pixelscan 准备失败后仍未解决的问题。提交前已修的安装依赖、包同步、导航授权，以及后来已修的 Lima 模板不再列入待修。用户要求查根因并给出方案，同时要求所有涉及 LLM 的字段最小化；本轮未修改生产代码、依赖、模型配置或系统网络，未重启服务、VM 或 Mac。

## 当前结论

| 剩余项 | 已查明的原因 | 尚未完成的部分 |
| --- | --- | --- |
| 读取参数与纠错 | 模型参数继承内部兼容模型，Schema、前置模式推断、后置合同校验不一致；错误码又合并了不同原因 | 生产修复和原任务复验 |
| 结果来源组装 | 完成接口先要求完整输出，后续编译才处理常量；来源能力没有贯通。工具文案还诱导为整个对象寻找共同容器 | 生产修复和多区域、常量与动态值混合验收 |
| 取消与清理 | 取消直接终止控制进程并跳过关闭协议，宿主按分支生成关闭未确认；authoring 又用取消提示覆盖清理结果，未形成与正式执行相同的持久恢复闭环 | 生产修复及准备阶段取消恢复验收 |
| 模型调用失败 | 前三次与本机 Clash 的 Node 直连超时日志精确对应；AI Connect 和 B-A-T bridge 均丢失失败原因 | 后三次原始原因不可由现存记录还原；需补脱敏诊断后验证真实调用 |
| Pixelscan 环境告警 | 普通 Chrome 无 CDP 新窗口重现相同三项告警；页面显示美国 hosting 出口、上海 JS 时区、不同的 WebRTC 出口，以及语言项不一致 | 已排除“必须由本次 B-A-T 主动接管才产生”的解释；网站未公开 Masking 命中子项，不能将其唯一归因于某个环境差异 |

前两项足以解释两站准备流程当前的阻塞位置，但不能替代后续发布、变化输入复跑和资源验收。外站告警与 B-A-T 能否准确完成读取、编译、复跑分别结算。

## 读取接口的根因和改法

### 已复现的矛盾

`method_read_tool.py` 的 `AuthorMethodReadToolParams` 继承 `MethodReadToolParams`，再用 `SkipJsonSchema` 隐藏部分字段。隐藏字段不删除父类 validator 的行为。当前实际导出的 Schema 中：

- 对象、标量都暴露 `take`，但是 `expand_method_read_params` 只接受数组的 `take`。
- 所有顶层字段都是可选；对对象而言，仅提交 `container + fields` 却因缺少 `outputPath` 被前置校验拒绝。
- 只提交 `container` 会在内部自动变成 `captureContent=True`，即使模型界面已经隐藏 captureContent，最终又被数据合同拒绝。
- 字段缺失、字段类型、路径、数组限制等原因共用 `natural_read_schema_mismatch`。纠错函数重新根据字段列表猜原因，无法指出实际触发的 take 检查。
- 单字段仍暴露 11 个投影选项，含格式化、可空、序号、地址来源等职责；其中部分已有合同、现场记录或确定性转换可以承担。

本轮用 BrowserScan 保存的原参数调用原代码：带 `take:1` 时在 DOM 前失败；只删除 take 即通过相同合同的参数校验。这不等于 DOM 读取已经通过。另一个离线探针确认了上述 Schema 与 validator 的模式矛盾。

历史反复的原因已明确：10 月 11 日修复隐藏了 captureContent，并补了字段列表反馈，但仍保留父模型的自动模式切换与多阶段独立校验。参见 [原修复记录](RESEARCH.md#2026-10-11-第三次冻结首败后的读取反馈修复)。这次不能继续以逐个隐藏参数作为修复边界。

### 实施方案

1. 用已确认的输出合同和读取用途生成独立的模型输入模型，不继承内部兼容参数模型的多模式 validator。继续复用 Pydantic、Zod、JSON Schema、现有 ReadSpec 和读取器，不新建解析器或读取引擎。
2. 内部旧来源解析与新模型工具入口分开：旧来源继续可读，旧版本摘要不变；新模型只能看到当前操作真正可用的字段。
3. 固定路径、类型、可空性、页内预算、数量上限由合同派生。业务上的“前 N 项”由已确认要求和既有选择方法承担，不让探索模型再填一遍 `take`。不能把技术预算 maxItems 当作业务取样要求。
4. 输出只有一个可选目标时由宿主绑定 outputPath；确有多个目标需要选择时，只允许选合同中的合法路径。字段名和选择范围同样从合同生成。
5. 新数据读取入口不再把缺参数猜成内容采集。内容采集继续使用自己的现有工具模型。
6. 错误在实际校验点保留稳定原因与准确参数位置，返回本次错误的修正提示。缺字段、非法路径、投影类型和多匹配必须区分，禁止重新扫一遍字段列表猜原因。

### 同类问题的关闭条件

用当前工具真正导出的 Schema 与实际入口一起验证，不只测试内部解析函数。覆盖对象、标量、根数组、嵌套路径、可选字段、空数组、数量选择与页预算的区别、内容模式、成功引用复用、混合参数、同路径冲突、跨文档来源。

验证重点是“模型被允许表达的请求，宿主有一致解释；被拒绝的请求能定位实际原因”。以已保存失败参数和边界变体驱动现有测试，不靠新模型生成测试数据，不增加自动模型纠错循环。

## 结果来源组装的根因和改法

Pixelscan 的实际 Agent 在没有调用 bat_read_fields 的情况下，以网站名称不在结果主容器内为由 done(false)。因此不能把它描述成页面读取器实际读取失败。

确定存在的代码缺口是：`AuthorTools.done` 调用 `complete_from_read_refs`，该函数只加入读取、部分同路径输入和 count 派生，并立即组装、校验完整输出。`natural_output.py` 中的常量处理发生在后续编译阶段。完成边界先失败，后面的常量能力没有机会工作。

离线控制使用实际 Pixelscan 输出合同、三个分别覆盖动态路径的模拟合法读取回执。它只验证装配接口，不冒充现场读取证据。底层常量分析能识别 requirement 中的 Pixelscan；当前完成接口仍报 `natural_output_leaf_uncovered`。将相同已知值作为合法同路径输入时，当前完成接口可以装配。这证明来源接线存在缺口。

还有两处相关问题：

- 现有 `_static_output_fields` 接受“字符串出现在需求中”作为常量依据。这只是一项现有行为，不能升级为任意业务字段都可信的授权规则；需求可能同时写有成功、失败等候选结果。
- `natural_output_leaf_uncovered` 没有进入 AuthorTools 的固定错误映射，会再次变成笼统的引用无效。

### 实施方案

1. 在现有需求确认和计划投影阶段确定每个结果字段的来源：明确固定值、运行输入、页面读取、浏览器当前上下文、确定性派生。宿主保存现有 ValueBinding 及来源证据，不要求探索模型再填写类型、来源 ID、digest 或样本值。
2. 固定值的语义只能来自已确认的字段定义，不能通过字段名关键词或字符串包含关系猜测。需要语义声明时，在已有字段定义中表达一次，不另加一轮模型判断，也不同时要求 description、sourceKind、isStatic、constantValue 多份重复信息。
3. 当前页面地址复用已有 browser context 事实及 runtime 输出，绑定本次正确结束时点的页面身份；不能复制探索时 URL。若要求的是另一个链接，仍须读取那个链接，不能统统替换为当前 URL。
4. 准备完成、编译和复跑消费同一来源绑定。底层成熟组装能力继续复用，不另建一个结果生成器。
5. 仅对确实来自 DOM 的字段建立读取方法；允许多个区域分别读取不同 outputPath，再由现有组装器确定性合并。共同容器约束只针对同一条记录的 DOM 字段，不能强加给整个最终报告。
6. 缺来源要返回缺失路径及需要的来源类别；冲突、跨文档、未知引用分别失败，不允许模型手填动态值来补齐。

关闭条件：保持原两站需求和必填输出，验证常量加 DOM、输入加 DOM、不同区域、当前地址变化、空结果、字段缺失、同名多来源、跨页误拼与动态结果恰好出现在需求原文等反例。旧失败记录不改写，不能以删除网站名称或手填 Normal 过测。

## LLM 字段最小化方案

原则是删除宿主可推导的字段，不把字段换成 prompt 中的重复要求，也不让模型填写新的技术元数据作为补偿。内部持久化合同可以完整，模型输入输出必须只有不可替代的语义选择。

| 接口或字段 | 新设计 |
| --- | --- |
| 读取 take | 从新模型接口移除；业务数量由已确认要求及既有选择方法承担 |
| 固定 outputPath | 宿主绑定；只有多个合法目标需要语义选择时才暴露 |
| maxItems、multiple、valueType、allowMissing | 继续由宿主持有，验证隐藏后没有残留的模型填写要求 |
| captureContent、regions、regionMode、indices | 按现有明确工具用途分开；不以缺字段隐式切换模式 |
| optionalAttribute、ordinal、resolveUrl、文本规范化选项 | 能由合同或既有方法确定的由宿主生成；不同业务语义需要取舍时在现有字段定义确认一次，不重复交给每次读取 |
| selector、必要的 attribute 或读取来源 | 保留实际现场无法由宿主推导的最小选择，按字段语义约束可用投影；不固定网站选择器 |
| done.methodOutcome | 移除重复的技术方法状态声明；已有采集、编译缺口和方法证据决定是否形成方法。不能删除原生 Agent 对业务成功或失败的判断 |
| done.success | 保留原生业务完成声明，不与“已经存在复跑方法”混为一件事 |
| done.reason | 成功且已有结构化事实时不强制重复描述；业务失败或新歧义时保留简短说明 |
| done.readRefs | 唯一、完整、无冲突来源覆盖时由宿主确定；真正需要在多个合法来源间选择时才提供引用选择。不能任意挑最新一条来消除歧义 |
| bat_validate_selection.examples | 从新模型输入移除；当前仍暴露此字段，与仅返回源码的 selection_annotation 不一致。真实样例由宿主供给，重排、删减等变体由确定性代码产生 |
| 语义函数注解 | 保持仅返回 source 或现有不可支持结果；不要求模型生成例子、字段类型、节点 ID、边、绑定、重复计划 |
| 计划 ID、版本、摘要、producerRef、审计字段 | 保持程序生成；不得因修复来源绑定重新交回模型填写 |

验收同时检查对模型实际导出的完整 Schema、系统提示和错误提示。新增或保留的每一个模型可写字段都必须说明它承载哪项无法由已有事实推导的语义；删除字段对应的旧提示必须同步删除。

## 取消与清理的根因和改法

这次错误不证明浏览器执行关闭操作失败。`RunnerProcess` 的 abort 分支先拒绝请求、结束 stdin 并终止 child；`closeChild` 在 signal 已取消时跳过 closeProtocol，只要有 managedWindow 就合成 `browser_close/unconfirmed/cleanup_browser_close_failed`。它表达的是尚未取得窗口关闭证明。

离线调用原 closeChild 的对照结果：正常分支调用关闭协议一次并确认；取消分支调用关闭协议零次，即使 child 已正常退出，也生成同一关闭失败码。这与本次主记录一致。随后同 owner 的 verify_closed 已确认窗口结束，不能再将其列为仍残留的窗口。

`TaskChainAuthoring.fail` 随后按 signal.aborted 将状态、原因写为“生成已中断，可重新发起”，只留下来源 closed=false。准备 job 没有与正式 execution 同等的清理审计和自动恢复闭环。之前修过的是正式执行和草稿试跑的 owner 恢复分支，不是这里的准备 job 分支。

### 实施方案

1. 保留业务取消，单独保存 job 的 owner、清理阶段和待核验状态；用户能同时看到“已取消”和“资源待核验”。
2. 将“取消后无关闭回执”和“实际 close 调用抛错”区分；没有核验时 activeResources 应表达未知，不能把它当作已证明仍在运行。
3. 控制进程退出后，复用现有同 owner verify_closed 与安全恢复能力，使用独立、有限时的清理生命周期，不能沿用已经取消的业务 signal。
4. 把准备 job 纳入现有资源巡检与持久化恢复，复用现有 owner 核验；不伪造 TaskRun，不新增另一个调度器。
5. 核验失败保留 cleanup_required 和原始取消事实，服务重开继续同 owner 核验；成功仅更新后续清理事实，原失败审计保留。

关闭条件：准备中取消、启动前取消、动作中取消、child 已退出但窗口未核验、真实关闭失败、外来 owner、个人窗口保护、服务重开、后续同 owner 核验成功。测试贯穿实际 authoring 捕获与状态保存，不能只用执行器的 cleanup 测试代替。

## 模型调用失败的根因和改法

本次外站 BrowserScan 任务的六次失败中，前三次与本机网络日志对应如下。这是提交之后的新任务证据，不是重新挂起提交前已经关闭的旧失败。时间为 Asia/Shanghai，日志按 Node 进程、目标 chatgpt.com 和传输失败匹配。

| 产品失败时间 | Clash Node 失败时间 | 间隔 |
| --- | --- | --- |
| 22:27:54.537 | 22:27:54.531 | 6 毫秒 |
| 22:28:05.018 | 22:28:05.012 | 6 毫秒 |
| 22:28:15.276 | 22:28:15.275 | 1 毫秒 |

三条网络日志均为 `CNip1 → DIRECT`、IPv4 i/o timeout、IPv6 no route to host。同一时段 Pi 会话还保留四次 fetch failed。当前活动 Clash 配置为规则模式加 TUN，CNip1 直连规则位于最终代理规则之前，未发现 chatgpt/openai 的更高优先级域名规则。故前三次可定位为模型端点的网络分流失败，而不是读取合同错误。

后三次 22:30:33、22:38:05、22:39:45 未找到对应的传输错误原文，不能把前三次原因覆盖到它们。根因证据丢失的位置已经确定：AI Connect generation 抛出新的统一 Error(code) 丢弃 cause，B-A-T model bridge catch 再仅返回 bridge_model_failed。原失败的 HTTP 状态、供应商错误码或系统错误码没有落盘，无法事后恢复。

### 实施方案

1. 网络配置只为实际使用的模型域名设置明确的域名优先规则，指向既有可用代理组，先于 CN IP 规则；DNS 使用该服务可达、可信的既有解析方式。复用 Mihomo 的规则和 nameserver-policy，不在 B-A-T 自写代理或按模型供应商实现网络分支。规则和 DNS 行为以 [Mihomo 官方文档](https://wiki.metacubex.one/en/config/dns/)为依据。
2. 实际网络修改必须是精确的域名范围，验证前保存原配置及恢复方式；不全局切换代理、不重启 Mac、不关闭向日葵或更改用户浏览器时区。本轮只提出方案，未修改共享网络。
3. AI Connect 在现有异常边界保留脱敏诊断类别、HTTP 状态、供应商固定错误码、系统传输错误码、重试建议和请求关联信息；不保存凭据、完整请求、响应正文或页面内容。仍向普通 UI 提供稳定错误码。
4. B-A-T bridge 透传受验证的诊断到现有调用审计，不再抹掉；在原 Python 动作与模型调用之间保留同一关联。使用现有错误类型和事件扩展，不复制 provider。
5. 复用既有 SDK 重试，不另加宿主模型重试环。认证、配额、结构化输出、网络、用户取消必须区分。重复网络失败应明确停止，而不是诱导 Agent 修改页面方法。
6. AI Connect 属于相邻仓库责任边界；本方案要求其上游修复后按现有打包流程引入，不能在 B-A-T 内复制其实现，也未在本轮改相邻仓库。

关闭条件：同一真实 Node 请求路径的 DNS/TCP/TLS 验证及一次真实原生模型调用；受控注入传输、HTTP、结构化校验和取消错误，最终记录必须可区分且不泄漏数据。后来成功只能证明当前恢复，不能补造后三次历史原因。

## Pixelscan 三项告警的调查与处置

当次 Chrome 请求在 22:50:51 和 22:51:31 的 Clash 日志明确经美国西雅图节点转发，本机时区为 Asia/Shanghai。因而“正在使用代理”和“出口所在地与本机时区可能不一致”不是假设。原生页面返回 Proxy detected、Timezone spoofed、Masking detected，同时 Bot check 为 No automated behavior detected。

代理路径能够解释为什么该环境可能产生代理和时区告警，但原始记录只有站点分类，没有 IP 地理和逐项指纹判据。不能声称已证明网站每一项分类算法，更不能把 Masking detected 直接归因于代理。Pixelscan [公开说明](https://pixelscan.net/tips)也分别列出 IP、代理、时区和泄漏检查，不能把它们一律当作浏览器自动化判定。

用户解锁后，2026-10-13 00:02:52 已通过系统界面创建一个普通 Chrome 窗口，在同一真实 Profile、原扩展、网络和时区下，从正常首页点击 Scan My Browser Now。全程没有为这个窗口建立 CDP 会话，也没有调用 B-A-T 浏览器控制。结果如下：

| 项目 | 10 月 12 日 B-A-T 原生任务 | 10 月 13 日系统界面无 CDP 对照 |
| --- | --- | --- |
| 总体 | Fingerprint inconsistent | Fingerprint inconsistent |
| Location | Timezone spoofed | Timezone spoofed |
| Proxy | Proxy detected | Proxy detected |
| Fingerprint | Masking detected | Masking detected |
| Bot check | No automated behavior detected | No automated behavior detected |

对照页面细项明确显示：出口类型 hosting、国家 United States；JS 时区 Asia/Shanghai（UTC+8），IP 时间 UTC-7；WebRTC 地址与网页出口不同；JS 语言和 Accept-Language 为 en-US，而 Internationalization API 为 zh-CN。只记录这些关系和类别，不在文档保存原始 IP、位置坐标或指纹 hash。

此对照证明：本次 B-A-T 主动控制不是产生这组告警的必要条件，当前环境自身就能重现。它不等于已经排除所有已安装扩展或 Profile 设置的影响，也不证明网站私有 Masking 分类具体采用了哪个子项；页面没有给出该子项，不能从多个差异中随意挑一个当唯一原因。两次扫描时间不同，不宣称为同时刻的所有底层指纹逐位对照。

本轮不为压掉告警修改系统、扩展或指纹。B-A-T 原生任务仍停在准备失败，系统界面对照不能替代其发布与正式复跑验收。对照结束已关闭刚创建的单标签窗口，界面回到原工作台，原个人窗口和标签保留。截图只存忽略目录 `work/public-native-test-20261012/pixelscan-no-cdp-20261013.jpg`。

如果实际网络必须使用代理，正确结果可以保留 Proxy detected；不能以改系统时区、伪装指纹或硬编码检测结论作为软件修复。B-A-T 的交付要求是准确读取并可复跑地报告真实结论。

若用户另行要求消除环境差异，作为独立环境任务处理：先只读核对 Chrome 与系统语言设置来源、WebRTC 路由策略及代理出口；每次仅变更一个获准因素，并保留恢复值。不得直接把代理时区写入浏览器，或停用个人扩展来冒充通用产品修复。当前没有这样的系统修改授权。

## 实施与验收顺序

1. 先补错误和清理事实的持久传递，使之后每次失败可定位，不先反复跑网站。
2. 修复合同生成的最小工具模型、结果来源贯通、同类错误定位，一起删除模型不必填写的字段与提示；用已保存失败和离线变体验证。
3. 接通准备 job 的取消与资源恢复，真实验证任务拥有范围、失败与后续核验；不触碰个人窗口。
4. 单独处理模型网络规则与上游脱敏诊断，不把它混成浏览器或模型字段问题。
5. 冻结修改后的产品代码。保持两站原确认需求和输出，分别从正常工作台完成准备、样本、独立变化复验、发布、同版本正式复跑和关闭。普通运行必须零隐式模型调用，输出须与各次页面真实报告一致。
6. 网站检测分类、链路运行结果、资源清理三项独立报告。通过一次不等于清除旧失败，报错不因后续成功被覆写。

修复验收必须同时证明原失败被消除和相邻合同变体被覆盖；不能继续以单字段补丁、删业务输出、提示模型绕路、诊断脚本成功或当前不复现交付。

## 2026-10-13 图标结果遗漏的实际验收

第二次BrowserScan准备job9926fca8没有工具错误；网站名称已修，但模型把Navigator图标和邻近原始值混为一类，done理由明确因此省略。样本b4943b0d、独立a08dfddc仅交付分类标题和17项文字状态，故业务仍不通过、不发布。当前UI只有返回需求修订，没有局部链路修订入口，未使用该入口改变原v1。组合字段实现/真实浏览器测试不撤回；补充现有原生Agent指导，说明文字观察会漏图标、应逐区检查实际属性并用parts排除原始值。此改动是通用能力使用说明，不证明模型今后绝不误读；必须由原需求新准备和真实输出重新验收。无新字段、无额外模型调用环、无全局judge。冻结6仅2文件变化，fork35cd9bb7；原失败/缺项结果继续保存。
