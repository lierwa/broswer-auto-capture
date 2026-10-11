# 原任务主流程与盾正式复跑结算

2026-10-11；master@5ac7f8f1748955779446937f8491a01dc6be054f。原task `6088126d-5e8d-4650-9ae6-3a223a404c60` 已从需求对话走到准备、样本、独立复验、发布V1和普通复跑。本次正式复跑被盾判为Human，39项clear；不把此前unknown覆盖为通过，也不外推为所有网站或每次运行稳定通过。盾源码、判据、阈值均未改；未提交、推送、创建worktree或关机。

## 用户确认的通用导航契约

计划/来源绑定的URL必须与实际派发参数一致。网站打开后生成的落地URL属于当前运行事实，不能自动要求它等于入口，也不能要求它必须变化。落地地址仍用于后续节点的当前页面定位，既有来源授权、session/tab/document身份、原生执行失败和显式页面条件继续有效。

根因在B-A-T适配：`natural_postconditions`自动为navigate增加了入口与落地URL相等的要求。`navigation_destination_matches`只允许新增查询参数，主机、路径、片段、协议变化均失败。该函数未放宽；新来源的navigate改为消费原有`native_action_receipt`，其上游`ActionDispatchAudit`已经校验提议、Tools.act派发及history的动作参数摘要，`natural_bindings`独立核对计划或上游读取来源。没有根据盾域名增加分支。

后续ConsumerReadiness沿用现有动作所属session/tab和当前页面scope，不使用探索样本URL。链接转换为navigate和只读保存导航方法两个生成入口也取消了相同的自动落地相等条件。显式`equals`条件保留；缺少原生回执的旧来源仍走原有证据准入，不拿状态字符串补造派发事实。普通运行不新增模型调用。

第二个编译缺陷：两次find_elements已被同文档、原生派发/结果和无消费者证明分类为准备探查，但其临时读取变化gap仍保留。仅对已有完整排除证明、无执行消费者的探查，回收`natural_read_output_changed`和`natural_read_container_identity_changed`派生gap。被后续绑定消费、跨文档或无有效回执的读取继续失败；原source及sourceGaps未修改。

## 当前结果

发布：`8b8b7548-4049-4f59-845f-24f80ca3c9da` V1，digest `0bd45fe99a30d04b05ee7e02716fa8ab84f86efd0991dddb9d250e166ee61c39`。

| 阶段 | execution / 盾case | B-A-T | 盾服务端原判定 |
| --- | --- | --- | --- |
| 样本试跑 | `1cb12dee` / `4e08fe00` | completed；LLM 0；cleanup confirmed | unknown；34 clear、4 unavailable、1行为参考线索 |
| 独立复验 | `be7a83df` / `c4b51d95` | completed；LLM 0；cleanup confirmed | unknown；35 clear、4 unavailable |
| 发布版普通复跑 | `1a69f30a` / `90e00a24` | completed；LLM 0；cleanup confirmed | Human；39 clear |

正式execution：`1a69f30a-7931-4ce3-8640-e8286eb173c0`。报告case：`90e00a24-9935-4166-89d3-9f730b40561c`。正式入口保持确认需求v3中的`https://check.shield.localhost:4185/measurement/check?mode=interactive`；三次运行实际报告地址各不相同。原localhost入口后自动转至检测子域与当前入口别名属于同一盾流程，未修改盾。

三次均8 transitions、11 browser commands、0 LLM。正式输出“真人 · 本次验证通过”，报告链接含当次case；原服务端`serverReport`读取原SQLite事件得到同一Human/39clear。英文22、中文8，英文input事件28、中文9，已滚动、已提交、composition结束。CrowdSec1.8.1原balanced阈值75、score0、challengeAccepted/protectedRequestAccepted=true、allowlisted=false。

浏览器完整代表执行来自原job `fc2aac0e-5bd8-43f3-80d6-550ecea48fa9`、artifact `c9e936d8-79f3-4e8e-8d6b-06b12d672347`。通过Workbench“只重新编译已保存试做”创建job `88eca506-95e2-4daa-8c90-d04255cc37f1`，completed；explorationSessions/ToolCalls/providerInvocations均0，compilationCalls=1。没有手工修改任务链或数据表，也没有重跑模型探索。

## 验证与边界

- 10项新增聚焦检查通过：固定/随机子域/不同路径/同址导航，计划参数不符、无效或失败回执、错误tab、当前页面读取、显式URL条件、消费者存活与文档身份。
- 原25项相关回归中22项通过，3项既有测试失败（3个失败子项及1个error）。在内存加载HEAD原capability/postconditions模块后，`test_dynamic_ready_scope`重现完全相同失败：其旧read mock不接受已存在的`inherited`关键字。未为过测修改生产读取或这些旧测试。
- 另外15项导航方法/来源绑定回归通过；原有只读方法断言随新的统一契约更新为校验导航输入绑定，不再要求自动落地相等条件。
- 原真实source离线编译gap=0。其它生成入口收尾后完整编译结果逐字不变，canonicalDigest `a2b710ade60b07362ee1cdf51af903cbde43064fb2ffc6b8bfbd0026cc29a9f9`。因此未再无变化重跑真实浏览器。
- 最终受管fork摘要`0abe91b58512d4308f34ac5f2703fa1441ca5793864c86a6bb114da58fc11d23`；来源登记与diff检查通过。未运行根级/全量测试。
- 正式结果的检测项目为44个页面文本行，包含39信号和表头/分组标题。信息存在，输出整理质量另记，未为此修改流程。

## 早期首败及本轮已有修复

- 原需求对话缺少独立页面交付行，已补具体位置/实际/期望/改法到原有一次repair。中文右引号被网址解析吞入的问题已最小修复；保存的真实repair原文现通过完整访谈校验，未追加模型调用。见`mainline-repair-02/saved-real-repair-revalidated.json`。
- 原准备job `a57d0f75`并非“未发出导航”：盾生成的3次随机URL摘要与采集诊断逐一匹配，随后B-U来源安全拒绝被页面采集错误掩盖。已保留原生拒绝诊断；该历史说法撤回。原任务v3使用相同盾服务的check子域作为确认入口，未在公共平台授权任意localhost。
- 第二次job `b0083dee`为`capture_access_state_unavailable`。增加首个准入异常的脱敏摘要/来源位置后未再复现，具体首个底层异常仍未定因，不能称其已修复。
- 第三次准备实际完成，但被本次两个编译契约缺陷挡住；原盾case `8bf8dec5`为unknown，34clear/4unavailable/1typing-cadence invalid。期间关闭所属扩展管理页与首次输入重叠，存在桌面焦点干扰，不能直接归因B-A-T。上述三次后续普通执行期间没有桌面管理操作。
- 常驻connect页面源于此前依靠该页20秒保活。已改为Chrome官方WebSocket保活，成功连接后仅收回自身握手页，唯一窗口延后到任务窗口创建再关闭。已在用户原Chrome加载并实测握手页退出、空闲保持连接；原保存授权不再次弹授权。

## 资源与证据

样本、独立复验及正式execution均cleanup confirmed。最后daily connected=true、busy=false；原用户Chrome和B-A-T/盾服务保留。所属Workbench验收Chrome PID26404已关闭，`navigation-fix-ui-profile`已永久删除；此前PID20944所属目录亦已关闭/永久删除。没有删除用户Profile。

证据目录：`work/bat-shield-mainflow-20261011/mainline-repair-02/`。索引：`mainline-final-receipt.json`、`recovery-job.json`、`published-workspace.json`、`sample-execution.json`、`verification-execution.json`、`formal-execution.json`及对应三份`*-shield-report.json`；`formal-completed.png`、`navigation-final.log`、`navigation-regression.log`、`navigation-head.log`、`navigation-other-generators.log`、`final-source-equivalence.json`、`navigation-ui-cleanup.json`。

前两次Worker不可测的原因尚未确定，第三次全量有效不构成对该波动原因的修复证据。本次结论是“当前发布版的一次真实普通复跑通过盾”，不是所有历史样本或未来运行均通过。

后续追查见[Worker不可测调查](BAT_WORKER_UNAVAILABLE_INVESTIGATION_20261011.md)：已确定性复现并修复B-A-T同步响应存储阻塞CDP的通用缺陷；历史两次当时缺少客户端时序/栈，仍不把该机制当作已证明的唯一历史归因。原结论和首败不改写。
