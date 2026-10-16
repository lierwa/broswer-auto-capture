# 导航授权承接修复与主流程排查

后续更新：用户授权修复VM后，原模板3行已恢复，status/五服务健康、Lima validate及6项宿主回归通过；下方“VM维护项保留”为发布时点记录，该项现已关闭。见[VM修复与外站测试](MAC_VM_AND_PUBLIC_NATIVE_TEST_20261012.md)。

## 授权与原始失败

用户于本轮明确要求修复导航根因，并逐段排查主流程的同类缺陷。在当前 master 工作目录实施，保留已有依赖/文档改动；不建分支/worktree、不重启宿主、不改盾检测、不访问京东。修复验收后，用户进一步明确授权关闭当前正常且无法复现的历史项，并将当前全部代码提交推送至远程。

原 localhost 入口仍能在现有 browserAllowedSites/isWithinBrowserSites 上确定性复现拒绝；将入口改成 check 子域后成功仅是任务绕行。10 月 11 日修的是导航落地相等条件，授权承接没有完成。原需求 v2 正文已允许检测子域，结构化确认只保存入口，准备仅从 entryUrls 推导；正式复跑反而从 input/chain 扫 URL。两者没有共同授权事实源。

## Product Alignment

- natural-language task: 从用户指定入口完成已确认任务，遵循确认的业务来源范围。
- reusable chain boundary: 同一任务在准备、发布和复跑使用相同、版本化的导航授权。
- runtime inputs: 业务参数；参数和节点观察地址本身不授予访问权限。
- dynamic task outputs: 当前页面和本次输出；实际跳转地址可以变化。
- generic platform capability used: 来源确认、域名范围、不可变计划、人工等待与资源归属。
- replay model calls: 0，普通节点不增加模型调用。
- site/task-specific code added: no

## Reuse Assessment

- capability: 导航权限投影、检查与恢复。
- existing implementation in repository: InterviewSourceReferences、来源选择/草稿确认、browserAllowedSites、Python site_scope、B-U SecurityWatchdog、human_wait、LangGraph 检查点。
- mature candidates and pinned versions: 已安装 tldts 7.x；受管 browser-use 0.13.8/workflow-use 0.2.11；LangGraph 1.4.14。
- selected implementation: 保留上述实现，仅补 B-A-T 确认事实与执行授权之间的适配。
- reused public surface: tldts getDomain、B-U allowed_domains、安全事件及现有暂停恢复协议。
- B-A-T-owned adapter and remaining gap: 分开入口与范围，保存同版来源授权；准备/复跑同源；范围外跳转不再只剩终止和手工换入口。
- license/runtime/platform fit: 不引入新库，沿用仓库既有固定依赖及 Windows/Mac 共同协议。
- browser/runtime/state ownership conflicts: 一个执行仅一个既有受管会话；授权不能来自网页、模型猜测或业务数据里的 URL。
- replay model calls: 不变。
- rejected candidates and evidence: 不另建域名解析器、Agent loop 或调度器；它们不能补齐 B-A-T 的确认/版本事实。
- focused validation: 原 localhost 需求、同站子域、明确补充来源、未授权跨站、协议/端口边界、输入 URL 不扩权、发布/历史版本与恢复。

## 执行与关闭条件

1. 用原场景和跨站/参数 URL 反例建立失败回归；修复明确确认的来源范围持久化和同源消费，不修改原入口。
2. 保留原生越界阻断，核对新增来源的确认、拒绝、取消与恢复；不得以自动跟随任意重定向解决。
3. 顺序排查需求确认、计划生成、探索采集、编译、样本/独立验证、发布、正式复跑、暂停恢复、清理。每个发现记录触发条件、影响及对应检查，不用全量测试掩盖缺口。
4. 正常工作台从原入口完成新任务，并在同一发布版本改变输入复跑；报告、普通模型审计、参数绑定和同 owner 清理逐项核对。

当前状态：源码修复、聚焦回归、逐阶段核查及原入口真实新任务验收通过。历史绕行后的四次 Human/39 clear 仍只证明旧配置能跑；本轮结论使用下面的新任务与新报告。

## 本轮实现与分段核查

- 确认：新草案必须独立列出访问范围，宿主只接受实际来源引用；通配来源候选不能充当入口。明确原文中的通配域名只做语法提取，协议仅在用户提供的同端口来源唯一时补全，语义选择仍由原访谈模型承担。缺章节复用原一次格式纠错，不增加模型决策环。全部选中来源保留于 confirmationFacts。
- 持久化与计划：navigationScope 随新 requirement/plan 保存并纳入摘要，SQLite 重开不丢失；旧版本不改写，只从已保存 entryUrls 保守派生，绝不读取运行数据授予访问权。
- 准备与复跑：同一个 planNavigationPolicy 下传 allowedSites 到原生 runner；恢复也用同版策略。域名判断继续复用 tldts 和 B-U。
- 越界与恢复：原生拒绝保留，准备进入已有 requirementReturn 业务确认入口，原失败证据保留；不擅自扩权、改入口或自动重放已执行写入。确认新业务范围产生新版本；已有范围内登录/人工等待仍恢复同 execution/run/owner。
- 启动与清理：缺授权的旧计划在 owner 创建前 blocked，不再制造 cleanup_required；清理未确认与业务结论分开保存。
- 跨语言：Python 将显式 HTTP 80/HTTPS 443 与默认端口一致化，其他端口和协议继续拒绝。

| 环节 | 最小验证与结论 |
|---|---|
| 需求/来源/确认 | 正常 coordinator、原始入口+额外通配来源、取消/失败不保存、SQLite 重开、计划投影通过 |
| 探索/编译 | 真实 Python 夹具→运行中 ACK→SQLite→候选→普通执行通过；旧探查缺口与最终缺口、摘要漂移有反例 |
| 动态方法/结果 | 33 项通过，包括变长/重排输入、零模型选择、空/非空结果、伪造来源/计数节点拒绝 |
| 样本/独立验证/发布 | 同草稿不同输入复验门、失败回执事务回滚及幂等发布通过 |
| 正式执行/模型 | RuntimeHost 不从输入/节点 URL 扩权；普通执行不隐式调用模型，显式 LLM 合同检查通过 |
| 人工恢复 | 等待未处理继续等待，SQLite 重开同 execution/run/owner、只重试当前读取、未决写入不重复通过 |
| 清理 | 13 项同 owner 核验/恢复分支、真实 Python child close、关闭超时和业务/清理双错通过 |
| Python 导航与恢复 | 27 项通过，包含10月11日落地不同址回归、域名拒绝不被DOM错误覆盖、协议/端口反例 |
| 原入口实际任务 | 正常工作台完成需求→准备→样本→变化输入独立验证→发布→同版两次正式运行；四次 HUMAN/39 clear，与各自原报告逐项一致，普通模型0，首次清理confirmed |

测试维护与产品缺陷区分：旧 prompt 夹具要求已废弃的 title 属性；迁移夹具降至 v18 却残留 v21 表；人工恢复夹具未提供确认入口；authoring 假会话未使用 finally。修正其构造后通过。结果装配夹具漏了编译器规范化的 maxInputBytes；一条旧 execution 正向夹具手工拼出没有 ResultSpec 依据的 count 节点，改为拒绝断言，并用当前 Function 选择/变长重排正向回归补齐。没有放宽生产编译/发布/安全守卫。

真实验收冻结：work/mac-install-validation-20261012/navigation-scope-product-freeze.json，共1233份产品源码/配置。已核验原开发服务PID38647/root及无活动任务后，仅通过项目shutdown入口加载修复；Mac、Chrome、向日葵和盾未重启。

真实任务：33d234a3-b3ea-437b-bd62-a8ddcc7c8ae5，需求v1，prepare 3886cec3-ff31-4c54-8d8c-f66981784015，browser owner 0ce57776-8315-4312-887d-19eb2b7cde47。正常工作台一次成稿，原 localhost 深入口未变；新范围同时保留 localhost 精确来源与 shield.localhost 子域。探索、编译与后续四次普通执行全部完成。开发服务新PID51921。

## 原入口最终实机验收

原入口始终为 `https://localhost:4185/measurement/check?mode=interactive`；需求只确认该入口与 `*.shield.localhost:4185`，没有引导模型替换为 check 子域。发布 V1 为 ba0b895c-f365-4529-8e4c-6f043a83d1da，digest `9c7a650b64312263f52f5f4460da627e4c4a1706cf7527d614f903feffdb0802`。

| 阶段 | execution | 本次盾 case | 结果 |
|---|---|---|---|
| 样本 | 8b03ec39-3607-430f-80d3-f2c08008cccd | 17137ae5-ed26-418d-9a5c-c8b8850bc14b | HUMAN / 39 clear |
| 变化输入独立验证 | 21abe2f2-f512-4c73-8338-98f1e07eebfa | 18ad28f3-b0ff-48e4-beb5-255013186e6d | HUMAN / 39 clear |
| 正式第一次 | 5e75e36e-26f5-4688-8e8b-a9c9c0e75b3f | 553b4380-091d-41d6-9c5e-a15c54662c88 | HUMAN / 39 clear |
| 同版变化输入正式第二次 | 91c1a00b-0a5f-46ff-86bc-7b8a53fcc753 | 707f34c2-dfb0-42e9-9641-fa6ae957c9fe | HUMAN / 39 clear |

四次输出中的39项名称、状态、原因与盾报告 API 逐项、逐序一致；无flagged/advisory/unavailable/excluded/failed/pending。报告URL来自本次页面，四个case互不相同。两个输入节点绑定运行参数并保留 target_value 后置检查，盾记录的中英文字数随输入变化。两次正式执行的release引用完全相同、inputDigest不同。每次TaskRun均auditComplete=true、modelCalls=[]、llmCalls=0。

四次各自 owner 均 lease ended；原执行清理审计首次 confirmed、activeResources=false，browser_close/child_exit/temporary_directory 均 confirmed。探索owner也已ended，来源closed=true；daily Chrome授权仍连接且busy=false。验收前冻结的1233份源码/配置哈希全部未变；未调整输入节奏、盾规则或阈值。

探索中保留一次 `natural_read_schema_mismatch`，原生Agent纠正读取结构后编译成功，四次普通读取均通过。它属于首次探索可纠正的参数错误，不能声称模型首次调用永不出错，也未增加宿主模型重试环。

可复核证据位于 ignored 的 `work/mac-install-validation-20261012/`：`navigation-scope-mainflow-final-proof.json`、各次 `navigation-fixed-execution-*` / `navigation-fixed-run-*` / `navigation-fixed-shield-report-*` / `navigation-fixed-cleanup-*`，以及release、owner和截图记录。API TypeScript检查、相关TS/Python回归和diff格式检查通过；没有执行根级全量测试。

## 相近问题与剩余边界

- 已覆盖：原入口与动态落地不同、同站子域、用户明确确认的额外站点、缺范围章节、来源伪造、输入/节点URL扩权、协议/端口变化、默认端口归一、SQLite重开、同版本复跑与人工恢复。已确认范围内的跳转不再因确认事实丢失而拒绝；范围外仍阻断并回到需求确认，不能自动授予权限。
- 主流程其余环节在本轮定点检查中未发现尚未处理的阻断；这是列明场景和实机证据的结论，不能外推为所有网站、登录状态或未来版本永无问题。
- Mac VM owner/template摘要不一致：发布前只读执行 `node tools/antibot-lab/mac-host.ts status`，仍以 `lima_instance_owner_changed` / exit1拒绝，故不满足“当前正常且无法复现”的关闭条件。当前运行盾与产品主流程正常，该本机维护问题不阻挡本次发布；未改owner记录或重启VM/宿主。
- 原六次模型失败：按用户最新口径关闭为“当前正常，未复现”。现有成功模型对照与完整新任务提供关闭依据，不再列为活动待办；原底层cause未恢复及原始失败事实保留，不改称已证明其唯一根因。
- Windows未在本轮重新实机验收属于证据范围，不作为当前已复现故障挂账。旧任务、失败记录和不可变版本均保留；本次发布包含当前B-A-T代码、固定依赖制品与文档，不包含本地数据库、授权数据及ignored验收材料。

发布前暂存检查仅发现 navigation-scope.ts 末尾多余空行，已移除；与验收冻结版本去除末尾空白后字节相同，无逻辑变化。该差异单独记于 publication-whitespace-receipt.json，不改写原验收冻结证据。
