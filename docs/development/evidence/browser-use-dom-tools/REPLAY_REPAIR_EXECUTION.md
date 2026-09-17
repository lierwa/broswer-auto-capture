# 动作还原修复执行证据

本记录对应 [当前修复计划](../../BROWSER_REPLAY_REPAIR_PLAN.md)，不是完整主线验收。2026-09-16；旧原任务没有重跑，候选/样本/换输入仍未通过。

## R1 动作身份

主 agent 已读 capture/history/normalize 与新 action_identity 的实现：以原生 metadata.step_number 定位 history step，再按真实历史动作位置生成连续身份；不按参数搜索匹配。只重建当前 pending 的事实引用，已发布 gap 不重写。无法证明尾回调身份时保留明确错误，不发布孤儿临时引用。

执行子 agent 报告既有最小组 26 项通过、Ruff 通过；临时诊断文件 `/private/tmp/r1_action_identity_diagnostic.py` 使用原生 ActionResult/StepMetadata 与内存浏览器端口，覆盖成功→未采集失败→重复参数成功及无动作 auxiliary。结果 actionRefs 为 a-0001/a-0002/a-0003，对应 bindingRefs 为 a-0001/a-0003，auxiliaryFacts=1。没有独立输出日志；不把此诊断称为真实 provider/真实浏览器通过。

主 agent 只读复核原始来源 SHA256 未变：`8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa`。来源路径见计划。

## R2 参数保全

主 agent 已读 author.redactor 与 natural_facts：只对受支持的特殊键/修饰组合保留技术执行值；普通文本沿原输入/任务原文来源或脱敏，不全局放行字符串。

执行子 agent 使用原生 schema 与 redactor/binding 定点诊断验证 Escape、Control+Shift+P、Meta+a、F12 可往返；未授权文本被摘要化且无 binding fact；输入文本生成 runtime_input 路径。既有 `test_scroll_and_send_keys_require_specific_observed_effects` 当时 1/1 通过。R4a 后已改变 scroll 准入语义，该旧测试不能作为当前整组全绿依据。

未调用 Browser/provider；旧 a8 的摘要不可恢复，未倒填。

## R3a 与目标状态读取

临时真实本地浏览器诊断入口：`/private/tmp/r3a_browser_probe.py`。使用 localhost HTTP 页面、独立临时 Profile、当前安装 Chromium/b-u，无 provider 或外站，在 finally 关闭。

- 已可见目标：解析不滚动，Tools.act 点击一次。
- 视口外目标：开始不在 selector_map，原生节点确认后滚入视口，刷新 b-u 自己的索引，Tools.act 点击一次。
- 不存在目标：无滚动、无点击，明确报错。
- 采集状态：snapshot index 和 URL scope 匹配；实际 read_target_state 得到 aria-expanded=true、aria-checked=false、disabled=false。

实际失败及补救均保留：

1. 首次视口外查找误用局部结构遍历器，document/html 的 frame 标记不同造成截断。改为只沿原生 children_nodes，不进入 content_document/shadow_roots，再次真实验证通过。
2. 附加采集检查发现 node_value 被传三个参数而函数只收两个。修正显式 backend 别名读取。
3. 继续真实检查发现 Actor Page 未初始化 DOM document。通过公开 Page 的固定 html 查询初始化同一 session，前后核验 targetId；capture 与 XPath element 路径共同复用 helper，定点真实验证通过。

主 agent 已读上述 helper/调用与滚动路径；没有以单元测试覆盖替代这些实际失败。懒加载和原探索 scroll 的归并尚未完成。

## R4a 观察关联与条件精度

主 agent 已核对 causal/natural_compile 和下列实际诊断日志：

- `/private/tmp/r4a_collector_diagnostic.py`；`/private/tmp/r4a_collector_diagnostic.log`：collector 产生 o1→o2、o3→o4 的不同观察身份；wait 属于 unchanged_wait_after_proven_effect/v1，零 gap。
- `/private/tmp/r4a_collector_delayed_diagnostic.log`：相同生产观察形态，wait 属于 bounded_postcondition_wait/v1，零 gap。
- `/private/tmp/r4a_condition_diagnostic.py`；`/private/tmp/r4a_condition_diagnostic.log`：明确布尔状态采用 equals+settle；明确空 overlay 采用稳定空集摘要；非空 overlay/scroll 仅 changed 不作为完成证明。

这些诊断使用内存页面端口，不是慢页面或原网站验收。既有最小验证命令（所有命令 workdir=当前 checkout 根目录）：

```sh
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows/tests ANONYMIZED_TELEMETRY=false BROWSER_USE_SETUP_LOGGING=false work/upstream-browser-hybrid/.venv/bin/python -m unittest vendor/workflow-use/workflows/tests/test_hybrid_causal.py vendor/workflow-use/workflows/tests/test_hybrid_natural_compile.py
```

首次 22 项报告 3 个失败；causal 8 项通过。其中一个 scroll 缺事实却能走 title 旁路是本次回归，已修复，并只重验该项：

```sh
PYTHONPATH=apps/api/python:vendor/workflow-use/workflows/tests ANONYMIZED_TELEMETRY=false BROWSER_USE_SETUP_LOGGING=false work/upstream-browser-hybrid/.venv/bin/python -m unittest vendor.workflow-use.workflows.tests.test_hybrid_natural_compile.NaturalCompileTests.test_go_back_description_is_ignored_and_scroll_uses_real_technical_signature
```

该项 1/1 通过。其余两个旧用例仍要求 scroll changed 准入，与新边界冲突；未改测试/未重复整组，不能写成整组通过。Ruff 对 causal.py/natural_compile.py 最终通过。

R4 仍缺：真正列表/容器 ready、title changed 与业务就绪的区别、慢响应和取消的真实浏览器验证、wait 后 target_state 的生产采集。R4a 不升级为 R4 完成。

后续主 agent 已补完慢响应/超时/取消的真实运行时验收，详见 [R4_SLOW_RUNTIME.md](R4_SLOW_RUNTIME.md)。4.2 秒延迟下成功，等待期间只点击一次；超时失败与取消传播也通过。其余自然源业务条件接线仍未完成。

## 子 agent 生命周期和验收责任

- 主 agent 实际 gpt-6-astra/high；旧 dom_targets/dom_evidence 实际 gpt-5.6-sol/high，均已收尾退役，不再派新职责。
- 新 R6 使用空白上下文新 agent，仅承担失败动作派发事实职责。主 agent 必须核验模型、代码和证据后才能更新状态。
- 子 agent 汇报不是完成判据。任务布置、错误补救及交付质量由主 agent负责。

## R6 未派发失败的局部验收

主 agent 已核对 `action_dispatch`、author 包装/恢复、capture 登记/结束、history 事实绑定、natural_compile 排除入口和独立 coverage 检查。要求补严事实摘要、原生位置类型与重复位置后，再核对最终代码及 `/private/tmp/r6_dispatch_probe.py`、`.log`。

结果：真实 Tools.act 入口配合内存浏览器端口，未进入的失败可排除；已进入失败、旧来源无事实、被篡改摘要、重复位置和错误 step 都不能排除。该诊断没有启动真实 Browser/provider，不能升级为原任务通过。既有最小组 34 项中 32 通过、2 个 R4 旧弱条件失败如实保留。误用 uv 导致的空环境及其清理由执行者记录在专项证据，不算有效验证；最后入口探针改用正式既有环境、从 checkout 根执行。

实际 session `01a0aabe-ac62-7e23-a1fe-f4747677fccc` 的 turn_context 已由主 agent 只读核验为 gpt-5.6-sol/high。R6 交付后退役；R5 使用另一个空白上下文新 agent，不继续复用。

## R5a 局部读取验收与来源核验

主 agent 核对 read.py/field_read_tool.py 和 TS 的对应预算字段。首轮审查发现属性字段命中容器自身仍会返回整棵子树，要求重写为无子树、仅保留指定属性的浅克隆；随后固定 CDP 参数以 entry 数组传递，避免特殊字段名丢失。最终真实反例：140KB 容器、300 字节字段预算，根属性及 `__proto__` 字段读取成功。已读两份 probe 脚本及实际输出；旧整容器 helper 无调用后删除，没有生产回退。

完整本地 Chromium 证据与旧 mock 失败如实记录在 [R5_SCOPED_FIELD_TOOL.md](R5_SCOPED_FIELD_TOOL.md)。这不证明原 whole-page annotation 已从生产移除；该接线属于下一项 R5b。实际 session `01a0aacd-fcff-7070-9154-b22124a2c3eb` 的 Sol/high 已核验，交付后退役。

本阶段仅更新本轮拥有的 13 个 fork manifest 条目（含新增 action_identity/action_dispatch/field_read_tool），未重算接受其他未知修改。`verifyForkSource` 与 `node scripts/setup-upstream-browser-runner.mjs --check` 通过；没有安装。阶段 digest=`29e04d1efbf35c10c86491ae653aee18d1926db0d2228080abeca6232a90ae5f`。原 source-result SHA256 仍为 `8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa`。

## R5b 主 agent 验收（2026-09-17）

主 agent 已读取最终工具/投影/固定位置绑定、capture、author、自然编译、coverage、schema 准入源码，以及实际 `/private/tmp/r5b_production_read_probe.py` 和 `.log`。接受的是生产局部接线：原生 Agent 使用脚本模型，真实 Chromium 完成失败探查与成功读取，在线/离线 registry 一致、一个 verified fact/读取区段、零 gap、输出装配存在；普通 Runner 使用该编译读取规格读出新值，0 model calls。这未经过宿主候选持久化与同链不同业务输入，不能称为原任务通过。没有重复运行已成功的浏览器探针。

实际 session `01a0aadc-363e-7922-bf6f-d4f5c4bf4c63` 的 Sol/high 已核验，职责交付后退役。根数组 output adapter 的局部反例单独保留，未修改原合同绕过；原 plan 的根为对象。旧读取 mock 三项失败如实记录。

主 agent 只更新本项拥有的 9 个 fork 文件摘要（含 field_read_tool 内部类型和新增 field_read_evidence），未知条目有变化即拒绝重算；source digest=`eb3dfa4b331e23fe6a3aadc4f00cfe23b8c713f8861d7805ec4c8eb49b8302ab`。`node scripts/setup-upstream-browser-runner.mjs --check` 通过，未安装。原 source SHA256 仍为 `8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa`。

主 agent 只读进程核查 `ps -axo pid=,command= | rg '[C]hrom(e|ium).*bat-r5b-author-profile-'` 无匹配（exit 1）；这只证明该 author 临时 Profile 无 Chromium 残留，Runner 仍以探针 finally close/正常退出为关闭证据。没有停止任何其他进程。

## 子 agent 回收纠正（2026-09-17）

主 agent 此前把 collaboration 没有专用 close_agent 误判为不能回收，并向用户要求改分工；该结论撤回。实际通过 codex-app-tools 的 set_thread_archived，归档已验收的 `01a0aadc-363e-7922-bf6f-d4f5c4bf4c63` 与 `01a0a94d-5278-74a3-ad64-3290394528fe`，两次均返回 archived=true。归档后第一轮新建仍报 thread limit；随后 list_agents 只剩 root，再次以 fork_turns=none、Sol/high 创建 `/root/r3_target_scroll_fresh` 成功。没有清空旧上下文冒充新 agent，也没有删除交付记录或修改并发上限。今后验收后及时归档，确认释放再派新职责；不把生命周期收尾交给用户。

另外三位已交付 agent 的实际会话 `01a0a94d-ae12-7333-b690-fd12111af329`、`01a0aabe-ac62-7e23-a1fe-f4747677fccc`、`01a0aacd-fcff-7070-9154-b22124a2c3eb` 也已正式归档，均返回 archived=true。新 R3b 的实际 session `01a0aafd-46fb-77b2-92c7-bd76f24473c8` 已读取 turn_context 核验为 gpt-5.6-sol/high，工作目录为当前 checkout。旧五份交付记录保留；没有永久删除历史。

## R3b 主验收与 R4b 接续（2026-09-17）

已接受 R3_TARGET_SCROLL.md 所列代码与真实 Chromium 反例，sourceDigest=093515c6f585dee5735b6eebf15f69bbd000822f972ad5bd3894db8f7a77c990，verifyForkSource 和 setup --check 通过。主 agent 读取完整 pipeline probe，确认它手动调用物化 capability，要求纠正为适配接线/同动作复跑；不宣称 TaskChainRuntime 或持久化通过。未重复成功探针。R3b 已正式归档。

R4b 获得共享文件和唯一 Browser 名额；实际 session 01a0ab15-2873-7001-9daa-43bceede4cc3 的 turn_context 已核验 gpt-5.6-sol/high、当前 checkout。输入仅 selector，固定策略由程序拥有；正式接线前统一登记 manifest。

R4b 主 agent 审查 visible_wait/compile/coverage/ordinary 接口后，只登记本项 11 个 fork 路径。sourceDigest=407881c2b185d6fc505f21887227cd962d765def32cdf29da376cae11fff30f8，verifyForkSource 与 setup --check 通过；真实 Browser 验收正在进行。TS .ts 临时入口出现 ./client exports 错误，改为现有生产探针的 .mjs 动态加载方式即通过，因此不是已证实的产品依赖缺陷，未安装或修改依赖。

R3c 新 session 01a0ab1d-bc5f-7dd3-be66-09a7013774f2 已读 turn_context 核验 gpt-5.6-sol/high；只改 TS runtime scope/materializer，Browser 等待 R4b 释放。报告摘要方案独立记录，未修改原 plan；原 taskContracts plan v6 的模型预算只读核验为 500，原需求/计划未变。

## R4b 主验收

已读取两个完整真实 probe、日志和交付文档，接受局部条件等待机制与生产适配接线。真实 ready 约3312ms出现，工具3461ms成功；never/重复/漂移拒绝，取消检查4→4；在线/离线编译一致，普通动作复跑0模型。手动 capability 接线不冒充 TaskChainRuntime/持久化/原任务。sourceDigest 保持407881c2b185d6fc505f21887227cd962d765def32cdf29da376cae11fff30f8。R4b 已交付归档，Browser 交给 R3c。原历史 source/history 摘要定点复核仍与原记录一致。

## R3c 真实验收中的临时脚本故障

真实来源探针连续未取得 click，主 agent 停止重复来源并要求先保存失败 source，再缩为 navigate/click/done。本地脚本模型 diagnostics 实证：原生 DOM 将 `[16]<a id=open />` 与链接文字放相邻两行；临时 parser 要求同一行，自行抛 fixture_target_missing，根本未返回 click。native dispatch/agent_step_result 与此一致，未证明生产采集缺陷。失败来源 /private/tmp/r3-scope-source.json 与局部模型诊断已保存；只修该 fixture 当前索引提取，不改生产。后续成功来源必须先落盘再断言，两个 runtime 请求分别用独立 run/invocation/request ID。此前未执行到 replay，不能算换输入已通过。

R5c 全新 session 01a0ab2c-3a26-7a42-8a7f-96bfee043779 的实际 turn_context 已核验 Sol/high。只准备独立摘要 helper 等共享门；不准进入 OrdinaryCapability，摘要必须成为显式 llm 节点。

## R3c 主验收与 R5 接续

主 agent 已审阅 runtime-scope、runtime 调用边界、临时真实 probe 与来源记录。真实来源 navigate/click/bat_wait_for 编译 gaps=[]，同一 TaskChainRuntime 与物化链两次执行 alpha/issues→alpha/detail、beta/issues→beta/detail，均 completed、5 个浏览器命令、0 模型调用；每次独立 request/run/invocation，来源字节与静态 scope 不变。接受局部 R3c；本项没有候选持久化，不能称为原 GitHub 任务完成。交付 R3_RUNTIME_SCOPE.md 中的未验证项仅描述该局部范围。R3c 已归档回收，R5c 共享接线门打开。

R5d 使用新空白上下文 /root/r5_field_minimal_fresh，实际 session 01a0ab3b-2b9d-7e01-9582-6128f3442293 的 turn_context 已读，确认 gpt-5.6-sol/high、当前 checkout。先仅准备新 helper，不修改 R5c 占用共享文件。

R5c 主审发现新 helper 沿用 legacy 128000 固定摘要字节预算，要求删除：自然摘要独立 strict variant 仅保留 maxCalls/timeoutMs，不改旧 semantic 或公共 TaskChain。摘要提示中的完成事实仅含已验证前置步骤的 kind/actionRef/actionName，不把来源 URL/位置/结果摘要当本次值；实际内容来自动态 input/read binding。

R5c/R5d 联合验收决定：R5c 完成共享接线和 API check 后释放 author/schema，R5d 接入最终三字段参数；两项合并登记 manifest 后只跑一份真实来源→编译→TaskChainRuntime 探针，避免旧新字段接口重复跑 Browser。主审先发现并要求修复 natural_output 将 read+summary 总字段与 reads strict zip 的长度错配，既有临时 fixture 已证明读取和摘要共同装配/编译通过；不通过改测试放宽。R5d 编译核验必须用原 action.args 展开后比对 verified mapping，不能从证据反推自身；旧明确字节预算合法行为保持。

R5c/R5d 最终接线已通过主审，R5d 最终 API check 与最小纯探针通过。root 仅登记两项明确拥有的16个fork路径（未拥有条目先比对，不匹配即拒绝），verifyForkSource 与 setup --check 通过；当前sourceDigest=a62bfcf8150703af21eb62ad915a914dacbef38a2b0199afcae5155c7d09f630。新三字段params、旧extract显式预算保留、summary source单字段对象适配、动态装配与Runtime图均已接线。唯一联合真实Browser验收由R5c执行；主线未升级。

R5c/R5d 联合主验收通过：root 已读完整临时probe与稳定JSON。source工具均成功、gaps=[]、online/offline canonical=6de9646604885251a09279a7eb1b7241e86b89773f8fd86c94ec179ba5bbdfdc；真实TaskChainRuntime同链alpha/beta输出分别来自本次DOM，两次5Browser命令/1显式LLM，唯一model audit为explicit_llm completed。模型是scripted端口，非provider证明；这没有候选持久化，不替代原任务正式验证。原source和history SHA256重验仍与开工一致。

正式验收执行者 mainline_final_runner 使用新空白上下文，session=01a0ab4b-58a3-7432-93a0-97d350d862ad 已读取turn_context确认Sol/high。root核对 `/private/tmp/mainline-natural-probe.mts` 与既有fixture差异，仅路径适配及移除临时等待30秒硬限，按原plan预算等待。第一次沙箱在模型桥localhost listen得到EPERM，没有任何source/candidate/sample，隔离runId=c1fb5edf-6d28-4c80-84f0-b5456a39d170，cleanup两项true。保留后按已授权相同命令escalated执行，不算已有业务source重跑。

最终权限阻塞已记录于 MAINLINE_FINAL_RUN_BLOCKED.md。实际模型目的为当前官方 OpenAI Codex OAuth 连接 `https://chatgpt.com/backend-api`，产品选中Terra/medium；载荷是本次已确认任务/计划/输出合同及当次GitHub页面文本或截图。root 已读拒绝原文：自动审批要求知情后的明确授权，不得通过间接路径实现同一外发。当前0 source/candidate/sample/verification，cleanup完成；保留所有产物、停止重试。分支仍master/HEAD7242264，历史source/history受检hash未变。执行子agent收尾归档，恢复只从正式主线继续。

用户知情后明确授权继续原任务测试；root重新核对源码门与临时执行副本hash不变，派发全新 mainline_authorized_run / Sol high，授予唯一Browser槽位，沿同一正式入口执行。保留旧拒绝，不尝试间接绕过；本次是新增明确授权后的恢复。

恢复结果：实际Sol/high会话01a0ab6a-f0a5-75e0-b7db-4e3cfe162dcf已核验；唯一恢复命令再次被auto_review拒绝，认为概括测试授权未明确payload及chatgpt.com目的地。命令未创建进程，无新runId/source/Browser；不改生产、不重试、不绕过。拒绝原文见MAINLINE_FINAL_RUN_BLOCKED.md，执行者收尾归档。

用户已逐字明确现有Codex订阅、需求/计划/输出格式、GitHub文本截图及chatgpt.com目的地授权。root重新核对源码门与已审副本hash不变，派发mainline_explicit_consent，新session01a0ab6f-0f4d-7b90-ad7d-e0f8ab350da6的Sol/high已核验，独占Browser。
