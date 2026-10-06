# 工作流与原始内容交付：开发后对抗代码审查

日期：2026-10-05。审查基线：当前 `master@0fc8ff22` 的实际 dirty checkout，结合本轮实施记录核对；不把此前 UI、账号或生命周期改动归为本轮新增。审查只读实现，未运行测试、模型或浏览器；本报告是本次审查唯一写入文件。

依据：[整改文档](WORKFLOW_AND_DELIVERY_REBUILD_20261005.md)、[实施记录](WORKFLOW_AND_DELIVERY_IMPLEMENTATION_20261005.md) 和当前 AGENTS.md。目标是找会阻断通用任务、丢失确认输入、漏采却报告完整、混淆来源或破坏普通复跑的具体缺陷。

## 结论

**本轮审查未通过：发现 3 项 P1、2 项 P2。未发现新的 P0。** 已记录的通用图文样本、纯操作及零模型正式复跑是有效的限定证据，但未覆盖下面的触发条件，不能据此宣布通用主流程已闭环。京东现场尚未通过，连接失败不能等同于商品详情采集失败。

## R1 · P1：逐项执行丢失已确认的根运行参数

- 位置：`apps/api/src/task-chain/record-plan.ts:10-12,29,33-35`；`preparation-plan-projection.ts:42-54`。
- 触发：草案声明根运行输入，例如金额或表单文本，同时确认“先选择一组真实入口，再逐项填写”。
- 证据：原计划输入合同保存这些参数，但单项步骤的合同被覆盖为只有 `__batRecordEntry` 与 `__batRecordKey` 的对象，输入绑定只取来源集合中的 `record`。来源步骤输出合同也只包含这两个键。参数没有到达单项链路的绑定路径，模型无法为它建立真实参数绑定；可能准备失败，也可能把代表值固化为常量，后续更换输入不能正确复跑。
- 最小修复：保留根对象参数到来源条目及单项输入，复用已有宿主继承路径。不能只改类型：`method_read_tool.py:190-195` 当前仅为 object 结果计算继承；`hybrid-method-evidence.ts:91-99` 也只验证 object 继承。若采用来源数组逐行继承，需要两处同时验证每一行值来自本次实际根输入，不让模型填写额外 selector。保留字段的可选性；与两个宿主身份键冲突或不能无损组合的根 schema 必须明确拒绝，不能静默覆盖、忽略。
- 定点验收不变量：同一已发布逐项链在本次根输入参数改变后，每项消费新参数；来源身份不被参数覆盖。不需要重开 Agent 反复探索。

## R2 · P1：CSS 图片没有保存，却报告图文完整

- 位置：`vendor/workflow-use/workflows/workflow_use/hybrid/page_content.py:12-16,49-67,71-74`。
- 触发：任务相关区域以 CSS `background-image`、伪元素背景等呈现配置图片或正文图；区域中没有 iframe/canvas/shadow。
- 证据：资源列表只来自 `querySelectorAll('img')`。CSS 图像不会进入图片原字节读取循环；HTML 中的样式或 URL 不是已保存的图片字节。代码仍无条件设置 `coverage.complete=true`。例如区域仅有 `background-image:url(...png)` 时，产物的 `images=[]`、`imageCount=0` 与 complete=true 同时成立，漏采不会进入发布缺口。
- 最小修复：通过成熟组件的公开资源/CSS 能力确认并保存所需图片；当前不能可靠取得的资源类型必须留下固定的未支持原因，阻止该采集方法发布。不能只把图像数量记成零，也不能自动换成别的区域。无需新建下载器或内容清洗。
- 定点验收不变量：含实际 CSS 原图的目标范围，要么可回读其原始字节，要么明确失败，不能成功且漏图。

## R3 · P1：采集期间同 URL 换文档不能被识别

- 位置：`page_content.py:33-34,46-69`；`hybrid/read.py:219-225,255-260`。现有公共检查 `hybrid/targets.py:261-274` 只验证 targetId 与 URL。
- 触发：HTML 取出后、读取图片资源的多个 await 期间，当前标签页重载相同 URL，或更换同 URL 的整份文档。
- 证据：采集末尾只检查焦点 targetId 及 URL；它们在同 URL 重载时都可以不变。外层 `read_fields` 的前后 `assert_scope` 没有检查文档根身份。正式 `ReadCommand` 在 `apps/api/python/browser_use_runner/hybrid_main.py:318-341` 直接消费该结果，再观察当前浏览器，没有把采集前后文档身份关联起来。因此旧文档 HTML 和新文档资源可被标记为一份完整产物；准备期方法样本的 documentRootId 校验不能替代正式采集时的校验。
- 最小修复：复用已有 `live_document_sample` 等当前文档身份读取，采集前后保持同 owner、target、文档；身份变化留下固定错误，不能仅以 URL 相同放行。不建立缓存框架或自动重新执行动作。
- 定点验收不变量：相同 URL、相同 tab 的重载也被识别为文档变化；变化过程中不能返回 complete 产物。该项为静态路径确认，本审查未运行重载复现。

## R4 · P2：多区域的最终交付绑定只支持最后一处

- 位置：`hybrid/method_read_tool.py:171-178`；`hybrid/author_tools.py:57-62`；`hybrid/method_completion.py:20-22`；`apps/api/src/upstream-browser/hybrid-method-evidence.ts:62-65`。
- 触发：一次业务任务要求取得两个不相邻区域，Agent 先后成功采集两处，结束时省略 readRefs。
- 证据：每次采集都绑定 root `{content}`。默认 done 只选最后一条；显式选择两条会触发同 root 路径冲突。TS 交接也只认与最终输出匹配的最后一条。因此最终 TaskOutput.value 只表达最后一处，不能表达确认的多区域结果。
- 边界：前一份内容并未从磁盘丢失。正式 runtime 会累积各节点的 Artifact 到 TaskRun.outcome.evidence；这里是交付与输出绑定缺口，不能夸大成“原文未保存”。同一区域的代表试探也不能被简单当成多份最终交付，禁止盲目合并所有准备读取。
- 最小修复：明确最终选定范围与已存凭证的集合关系，复用现有 Artifact/结果绑定完成交付；未支持的多区域合同应明确给出缺口，不能默认 success 只交最后一处。不让模型枚举业务参数或拼原文。

## R5 · P2：正式采集的固定失败原因被通用错误覆盖

- 位置：`apps/api/python/browser_use_runner/hybrid_main.py:322-330`；`read_error_codes.py:9-15`；`page_content.py:31-65,81-86`。
- 触发：正式采集出现未支持范围、图片未加载、资源缺失或内容额度超限。
- 证据：采集器抛出固定的 `content_*` ValueError，但 ReadCommand 只直接保留 SAFE_READ_FAILURE_CODES。当前集合不包含这些 content 错误，于是它们先被转换为 `hybrid_read_fields_value_error`；后续 safe_runtime_error_code 已无法恢复被替换的原因。用户和修复入口不能区分该展开页面、该换可靠范围、还是额度不足。
- 最小修复：把适配层已定义的固定 content 错误显式加入安全码白名单，保持类别；不回显第三方异常正文、原文、图片或凭据。
- 定点验收不变量：以上不同失败得到各自固定安全原因，cleanup 结果仍独立，不覆盖业务错误。

## 已核对且未发现本轮新增反例的边界

- B-U Agent loop、原生动作和首次 extract 的探索用途仍由现有组件承担；原生 extract 的完整浏览器/文件系统行为没有直接变成正式 llm 节点。
- 普通集合证据缺口继续原生探索，同时保留编译准入缺口；未发现本轮新增自动重派已观察动作的路径。
- 瘦凭证解析限定本次 owner、固定目录、字节数和 SHA-256，落库仍使用既有 ArtifactRepository；没有要求模型搬运原图。
- 同页 ready/transition 的动态作用域替换保留跨页目的地的既有约束；本次静态审查未发现替换时新增放宽。
- 本轮没有证据证明删除旧任务或清理其他 owner；不把此次采集样本当作并行生命周期全覆盖证明。

## 未验证与审查限制

- 未运行测试、浏览器或模型；上面的触发条件来自当前源码及协议消费路径，运行证据沿实施记录独立保留。
- 京东真实页面、扩展连接恢复、登录/访问限制仍由主 agent 按真实现场验证，当前不能报告其通过。
- 内联/data/blob 图像、CSS 资源的复杂来源和其它非 img 形态未取得新的现场证明；明确报缺口和静默报完整需分别处理。
- 未覆盖全部历史链、所有任务分支或所有并行关闭/重启场景；审查报告不是对未测范围的成功承诺。

主 agent 修复上述发现后，应按实际变更复查对应不变量，保留首败及复查结论，不覆盖本次初审记录。未经复查，本报告结论仍是未通过。

## 第一次限定复查（追加，保留初审）

复查只读取修复后的源码、现有测试及实施记录，没有另跑测试、模型或浏览器。范围为 R1–R5 和真实访谈的 `completedMessageEvents` 接入；账号/UI 的其它 dirty work 不纳入。

**本次限定复查仍未通过：R1 的 IR 物化边界尚未修正。** R2、R3、R5 的初审缺陷已关闭；R4 的隐式丢前面范围已改成明确冲突，多区域聚合仍是已写明的未支持能力。新增访谈适配未发现成立的代码阻断，但不能用定点测试代替真实京东业务通过。

| 项目 | 状态 | 当前证据及边界 |
| --- | --- | --- |
| R1 根参数逐项继承 | **未关闭** | record-plan 已保留根对象参数和可选性，非对象及身份键冲突会明确拒绝；Python/TS ReadSpec 和代表结果已接受数组逐行继承，逐行核验实际输入。发现第三处消费者仍拒绝数组，见下文。 |
| R2 CSS 背景漏图 | 已关闭本次反例 | page_content 读取当前 CSSOM 的普通及伪元素背景；content_css.py 使用 tinycss2 解析 URL，再沿既有 CDP 取得原字节，Archive 同时保存背景位置与值。image-set、paint、element 等无法证明的形态报 content_css_resource_unproven。真实 img、CSS PNG、8MB 原图测试的代码及实施记录已核对；本复查未重跑。 |
| R3 同 URL 换文档 | 已关闭 | page_content.py:39-41、60、87、95-98 复用 live_document_sample 校验采集前后 URL/target/documentDigest。现有真实浏览器用例在最终校验前重载相同 URL 并断言 content_page_identity_changed；不再仅以 target 与 URL 放行。 |
| R4 不同范围默认只交最后 | 已关闭隐式成功；聚合未实现 | method_completion.content_read_refs 核对全部成功范围的 container/target/URL，不同范围在省略 readRefs 时明确失败；TS 代表交接也执行相同作用域冲突检查。同一区域刷新允许最后一份。显式多引用的 root 路径冲突仍保留，整改及实施文档已声明限制，不能宣传多区域聚合可用。 |
| R5 正式 content 原因被覆盖 | 已关闭 | page_content.SAFE_CONTENT_FAILURE_CODES 在 read_error_codes.py 并入 SAFE_READ_FAILURE_CODES，正式 ReadCommand 的原白名单分支保留具体固定原因。模型反馈也复用该固定集合；未引入异常原文或敏感正文日志。 |

### R1 追加发现：代表结果通过后仍会被 IR 物化拒绝（P1）

- 位置：`apps/api/src/upstream-browser/hybrid-natural-materialization.ts:230-234`，实际调用入口 `hybrid-materializer-nodes.ts:114-117`。
- 触发：本次来源链的 `browser.read-fields` 输出是包含根参数的数组，且 `inheritFields` 非空。
- 证据：`assertNaturalReadSegment` 仍要求 `value.specification.outputSchema.type === "object"`，没有像其它修复边界那样检查数组的 items。来源数组在这里必定抛出 `hybrid_natural_read_input_schema_mismatch`。物化器先调用该校验，之后才建立 `bindings.record = { source:"input", path:[] }`；因此单纯合同测试及代表输出校验通过，仍不能生成可执行链。
- 最小修复：该处同样使用数组 items 或对象作为记录 schema，保留根输入的同名同类型、required/真实 DOM 后备约束；不要放松其它来源事实和 operation/specification 一致性校验。
- 最小验证范围：构造已捕获的来源数组及真实根参数，消费正式 `assertNaturalReadSegment`/物化路径；保留类型不符与必填保证不足的反例。无需模型、浏览器或全量测试。

### 真实 Pi/Codex 完成正文适配复查

读取了 `apps/api/src/ai/completed-message-events.ts`、`model.ts:124-150`、对应定点测试，以及当前固定 vendored 包 `agent-platform-pi-agent-session-0.1.0-2c522ec8.tgz` 的 `package/dist/js/index.js`。没有读取 node_modules、修改成熟包或原生 Agent loop。

- 原生事实：包源码 559-570 行在每条 message.ended 用 canonicalPiAssistantText 修正本消息输出，error/aborted 则从最终输出移除本消息；正常多轮工具正文按消息结束结果累积。桥接源码 2126-2176 行消费 text delta，settle 对完成结果做前缀一致性校验；failed/cancelled 走各自终止事件。
- 新适配丢弃尚未确定的 partial 正文，只把正常 ended.text 经原公开桥交接；error/aborted 的正文不作为成功文本。started、工具、推理及 ended 原事件继续交给桥。这样与原生 result.outputText 的累计语义一致，未发现多轮正文重复或错误正文成为确认事实的反例。
- model.ts 仍调用 adapter.run、bridge.settle；cancelled/failed 的原状态继续转为调用者的取消/失败，不被伪装成完成。原生模型调用及 usage 仍来自 adapter/result 与原桥的 generation 事件，没有新增模型调用、模型路由覆盖或正文 judge。
- 当前新增定点测试覆盖未定 phase 的 commentary、多条工具回合正文及 generation.completed；它未直接覆盖 error/aborted/cancelled 用例。这些分支本次通过源码核对，不能把它们写成已经跑过的测试。
- 展示代价是正文在消息结束后才出现，工具和开始反馈仍实时；该限制已在实施与 RESEARCH 记录。定点协议通过和真实 retry 的草稿提交不是京东详情任务完成证据。

待主 agent 补齐 R1 的物化校验并取得对应定点证据后再限定复查。本次结论保留为未通过。

## 第二次限定复查（追加）

只复查 R1 第三消费边界、新增的实际物化定点用例，以及来源调查指令变化；不重复读取已复查的其它实现，不运行测试、模型或浏览器。

### R1 已关闭

`hybrid-natural-materialization.ts:231-235` 已使用数组 items 或对象作为记录 schema，继续校验同名同类型和 required/DOM 后备。来源事实、operation/specification 和输出 schema 的一致性检查保留。

`hybrid-method-evidence.test.ts:161-196` 的新检查不只验证代表结果：它从 canonical 来源事实，经 `materializeHybridNodes` 得到实际 capability，验证 `record` 绑定到本次根 input，并验证输入参数类型改变后拒绝物化。实施记录保留该定点通过及第三边界首次失败。至此 R1 的初审问题和第一次限定复查问题都已闭合；本审查没有补造真实批量表单验收。

### 来源指令变化：没有已证实越权，仍有协议冲突（S1 · P1）

- `record-plan.ts:22-25` 不再限定只能调查 a[href]，允许点击代表条目观察真实跳转并回到来源调查，同时明确禁止批量做单项任务、猜造编号/路由或以未验证来源放行。改动是准备调查指令，没有删除 owner、网站范围、来源事实或编译准入校验；本次未发现可具体证明的新增越权/假来源放行。
- 但第 24 行同时要求“不限定属性名”与 `resolveUrl=true`。Python `hybrid/read.py:45-46` 及 TS `hybrid-schema.ts:110-111` 仍只允许 href/src 使用 resolveUrl。
- 触发：真实入口存在于已观察的 data-url、data-link 等自定义属性，甚至其中已是完整真实 URL。模型按照新指令提交该属性和 resolveUrl=true，两个边界均拒绝 `url_resolution_requires_link_attribute`。解除提示限制没有解除这条协议限制，会再次阻断来源准备；它不是 URL 权限被放松的证据。
- 最小处理：指令应明确 href/src 使用已有解析；其它已证明的完整 URL 可原样读取，不承诺自定义相对属性已经支持。若实际业务确需解析自定义相对属性，通过标准 URL/baseURI 的公开能力修正已有读取适配及两个边界，并保留授权核验；不拼网站路由，不添加 crawler。不能只放宽 schema 而让旧投影仍返回未解析的相对字符串。

### 真实京东状态保持未通过

实施记录中的这次原生来源调查完成搜索和销量点击，读取 107 个 a[href] 后主动 done(false)，未进入商品详情采集；14 次为准备期原生模型调用，source.closed=true。不是字段清洗失败，也不是已发布正式链路的零模型复跑。来源指令变更后的真实验证仍须独立记录；本次代码审查不能把它改判为通过。

**第二次复查结论：R1–R5 的所列原缺陷已处理（R4 聚合限制保留）；当前仍有 S1 的提示/协议冲突待处理，因此暂不对新增来源改动放行。**

## 第三次限定复查：page-url 实证缺口适配（追加）

本次只读取新增能力、对应测试和既有 TS 来源交接消费者；不运行测试、浏览器或模型。初审、两次复查及真实任务首败保持原文。

### S1 已关闭

record-plan 的最新来源指令已明确：href/src 才可使用 resolveUrl=true；其它已证明完整 URL 原样读；相对自定义属性未支持时保留编译缺口。没有把未知属性解析写成已拥有的能力。

### 新增 page-url 的限定核验

- 读取来自 `hybrid/read.py:181-184` 的固定 Element.evaluate 投影 `node.ownerDocument.URL`，不接收模型提供的 URL 或任意 JS，不拼业务路由。模型只声明已确定的值来源。
- Python/TS ReadField 只接受 `:scope` 单字符串、无属性/多值/转换/内容采集混合。读取仍进入原 TargetResolver、sample_read_fields、readRef 回执和普通 read_fields；没有移除当前 owner/target/页面作用域的已有检查，也没有引入第二浏览器、Agent loop 或图调度器。
- Python serializer 在 valueSource 未指定时删除该键（read.py:91-92）；旧字段序列化不会被默认 null 增加字段。当前证据仅支持旧 ReadField 的 canonical 形状保持，不宣称所有历史 Source 重编译均已实测。
- `test_page_url.py` 的第一目标由无 href 按钮真实点击进入，第二目标使用公开 page.goto；同一 MethodRead/readRef 和普通读取在两页返回各自真实 URL。`page-url-protocol.test.ts` 校验新字段 schema 与混合形状拒绝。这些测试不等同于来源循环已经编译或数量/停止条件已经通过，更不等同于京东详情采集成功。
- 记录准备调用与正式普通节点分别审计；新来源调查指令只允许沿真实浏览器结果研究循环。尚无稳定循环证据时仍应保留编译缺口，不能靠这个 URL 读取动作声明完整循环。

### S2 · P1：TS 来源交接遗漏 valueSource

- 位置：`apps/api/src/upstream-browser/hybrid-method-evidence.ts:193-195,218-225`。
- 触发：原生 MethodRead 动作参数的 fields 中含合法 `valueSource:"page-url"`，并形成真实成功回执。
- 证据：`validateMethodField` 的 allowed 仍只有 selector 和旧 defaults，没有 valueSource。代表来源通过此函数核验时必定抛 `hybrid_method_field_evidence_mismatch`。ReadSpecification 的 Zod schema 已接受新键，并不能越过这项独立的来源一致性校验。
- 当前两个新增测试分别覆盖 Python 读取/readRef 和 TS schema，未消费 `representativeSourceOutput`，因此其通过不能证明这个交接边界可用。
- 最小修复：在既有字段白名单及逐字段一致性核验中接受并严格对比 valueSource，未指定时按缺省处理以保持旧字段兼容。随后用同一 canonical page-url 动作/事实消费代表输出并物化实际 capability，保留动作与回执 valueSource 不匹配的拒绝反例；无需重开模型或浏览器。

### 京东状态不变

实施记录的 job `22cdf459-0acc-4bee-804a-b0914bd73e07`、来源 `291946fc-e7b7-4dcb-833b-91dd0d3b7038` 已真实点击进详情后返回，但原生 done(false) 无法形成 entries；26 次属于准备探索。这里证明了“能进入，原设计缺少读取当前导航地址”，没有证明新能力接入后生成、验证、发布与正式详情采集已完成。主 agent 的后续一次现场验证须另行保留结果。

**第三次限定复查：S1 已关闭；page-url 的既有 TS 来源交接仍存在 S2 阻断，暂未放行。**

## 第四次限定复查：S2 闭合及限定最终结论（追加）

仅核对 `hybrid-method-evidence.ts:218-225` 的默认值/等值校验，以及新增定点用例 `hybrid-method-evidence.test.ts:62-85`；未重新审其它模块，未运行测试、浏览器或模型。

**S2 已关闭。** defaults 新增 `valueSource:null` 后，白名单接受该已定义键；实际动作与已保存 ReadSpec 的值仍需精确相等。双方未声明该键时都按 null 比较，旧字段不要求新增输出键；一方为 page-url、另一方为 null/缺省时仍拒绝，不把普通文本读取伪装成当前页地址事实。

新增定点用例从同一 canonical 参数/事实调用正式 `representativeSourceOutput`，再通过 `materializeHybridNodes` 生成 capability，检查普通读取规格仍为 valueSource=page-url；随后把动作声明改为 null，断言来源交接拒绝。主 agent 已报告该用例先在原白名单处失败，修复后单项通过；这项首败与修复证据不被本次结论覆盖。本复查确认用例覆盖此前漏掉的消费边界，不把用例的 canonical 夹具写成真实京东来源或整条业务现场成功。

**限定最终代码审查通过：初审 R1–R5、追加 S1/S2 的所列缺陷已处理；本次指定差异未发现新的成立阻断。** R4 的多区域聚合仍未支持，已改为明确冲突并记录产品限制。此结论只针对报告所列范围，不表示所有任务、循环、历史来源或并行生命周期已经验证，更不表示用户原京东任务已经完成。

最新京东现场按主 agent 提供的记录：job 前缀 `ce420787`、来源前缀 `db4c14eb` 在第一个 navigate/观察阶段失败，出现 observation_refresh_required，随后同受控 target 的 changed_during_capture/current_page 读取错误并保留 invalid_source/capture_callback_incomplete。失败发生在 page-url 使用之前，不能归因为 S2，也不能用 S2 的定点通过改判该现场成功。完整 ID 和来源事实以主 agent 的实施记录为准；本轮未另读浏览器或运行现场。

**业务验收仍未通过，主流程问题继续由主 agent 根据这次真实导航/观察首败处理。** 初审和各次未通过结论均保留，不能用本次代码审查放行覆盖业务首败。


## 在线编译与原生上下文：对抗代码审查追加

由 adversarial_context_repair_review 在开发定点验证后只读审查；未覆盖整个既有 dirty checkout，没有现场京东运行。

首次未通过：P1 为动作即时详情地址与等待完成后的列表地址混用；P2 为同 URL 新文档 autoplay。复查继续拒绝：P1 的 null/缺失引用、即时 browser_context 假证 url_digest changed，以及前后未变的假 changed；P2 的同 documentDigest 添加 extra 冒充文档变化。以上均保留首败，没有把第一次守卫修订写成通过。

修订采用已有事实的种类/值/前后态及实际原生参数检查，身份只投影 targetId/documentDigest。复查又发现正常 navigate/switch 的 clauseRef 与新状态事实不一致；生产 2 动作前缀实际缺失切页节点。完成引用在既有原生证明通过后投影至即时 URL/browser_context fact，保留两者来源。最终限定复核：生产 3 segments/0 gaps，TS 3 节点/2 边及完整本次 tab/URL 命令通过，错误 bindingArgument 仍拒绝。

实际服务暴露历史进度 strict pick 误拒完整旧编译包；strip 仅忽略未展示字段，coverage/gaps 内部校验不放松。限定复查确认原始页面不进入投影、异常诊断变安全码、数据不制造成功结论或节点数、不改 build/payload。最后真实 UI 暴露 interrupted 的旧 phase 覆盖侧栏终态；两处投影采用同一终态集合。静态限定复核确认 running/waiting 不被终态化，旧时间过滤/cleanup/historical lease 仍保留。

**本轮所列问题的限定复核通过。** 原攻击样例关闭、合法上下文交接恢复；真实原生本地 7 节点/6 边仍通过。主 agent 最终 UI/API 证明 17/3/11 和中断状态一致、0 页面错误、旧 payload 不变。审查不表示自然语言生产入口、动态集合循环、发布或原京东完整业务已通过；详见实施记录的未测/未完成门。
