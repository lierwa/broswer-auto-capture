# 开发进度

## F6 浏览器阻塞复核（2026-09-06）

用户明确当前优先诊断海尔隔离测试为何阻塞。当前默认/显式标签页及先截图后点击的对照均真实从第1页切到第2页，商品链接集合变化；覆盖层在动作前后存在不证明动作被拦截，上次失败瞬间缺少足够诊断证据，根因仍未定位。15秒协助诊断确认提示进入DOM，但CLI返回RPC超时；官方源码显示人工等待与daemon传输期限相同，存在外层先到期截断业务timed_out回包的问题。上次300秒超时不能说明请求送达或用户未处理。详见 [BROWSER_INTERACTION_DIAGNOSIS](BROWSER_INTERACTION_DIAGNOSIS.md)。本轮没有恢复正式采集、调用模型或修改用户data/已安装BrowserSkill，诊断会话全部关闭。

## F6 执行、结果与生命周期（2026-09-06，真实验收待继续）

从干净的 master/2bb2093e8c0f3cbb90e505a4b6b69d66ae3e8db3 接续，主 task 01a075f9-7a58-7e82-8479-632f68138dd5 的实际 turn_context 为 gpt-6-astra/high，没有开发子 agent。仅当前保存目录开发、本地提交；没有推送远程或改动相邻项目。

- 正式队列默认执行完整上游来源集合，逐输入持久化检查点、稳定来源键去重、实际命令/时间/模型消耗及覆盖缺口。恢复保持同一运行并重新核验浏览器；复跑新建运行且固化链路不新增探索；修复独立授权到指定步骤，形成新链路版本，未验证下游保持等待。
- SQLite v7 保留既有计划/执行/链路，支持一个计划的多次独立运行。原始检查点页面只在忽略的本地运行存储中，结果导出剔除检查点页面和节点事件。API/UI按实际运行历史展示来源记录、步骤输入进度、覆盖/缺口、预算、归属和调用审计。
- 完整覆盖另行核验绑定起点、实际末页分支和字段。新增控件可用性与页面变化普通节点；末页下一页仍可点击时，需要真实点击后的无变化终态与独立末页验证指纹一致。商品锚点、循环上限和单次无效点击均不支持完整结论。
- 2026-09-06 用户明确授权3850条命令、24分钟、12次探索/修复判断、0次显式LLM的新海尔预算，已形成正式v6计划，步骤分配见 F6_ACCEPTANCE_PLAN。默认计划仍限制500条/300秒，历史运行预算不变。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 整仓169项通过：API69、workbench31、browser13、contracts10、model-runtime26、runtime20；work/f6-final-test2.log。整仓check通过；最终修复步骤选择器增补后workbench check通过，work/f6-ui-final-check2.log。构建日志work/f6-ui-final-build2.log |
| 协议/生命周期 | 全部上游输入、独立复跑与原历史不变、同运行恢复/状态核验/累计预算、去重、字段漂移暂停、跨任务拒绝、独立修复新版本及未授权下游暂停通过；程序较大上限不会扩大默认计划预算；实际末页分支与页面比较守卫通过 |
| 持久与故障 | 实际Node子进程SIGKILL后已完成来源和检查点保留，活动步骤变paused、运行变interrupted，未结算时间保守计入原步骤，重启不自动采集。v1至v7迁移、外键保存、冲突整体回滚和旧记录重开通过 |
| 真实旧预算运行 | 独立repair 0e82c8eb-e1e0-461e-92cc-f4dd040695e4沿v5枚举图批量输出258个去重目录链接，157条命令、32647ms、0模型/LLM。详情修复14条命令、90085ms、2次Sol/high调用意图（1次被中断），无详情产物；派生未启动。目录商品锚点不构成完整覆盖证明 |
| 已授权v6实测 | plan 8bca241e-0760-44b9-b6df-55ff93031e83；execution 0a5f476a-b8c6-4b84-abc1-08b03eeae132。目录探索57条命令、128811ms、6次完成且回报路由吻合的Sol/high判断、0显式LLM，分页点击/Enter均未改变商品列表，终态manual_required，尚无批量行。浏览器finally回收且原需求快照不变 |
| UI有限通过 | work/f6-ui-dom3.log通过13项DOM事件回归：空态、正式授权、实际批量结果、canonical来源行、复跑审阅与确认、独立运行/链路不变、刷新、390px无横向溢出和来源抽屉。work/f6-detail-diagnostic.png已视觉检查。后补修复步骤选择器通过类型检查/构建，原生操作待验 |
| UI与浏览器阻塞 | 原生任务切换返回ACK但任务未变（work/f6-ui-native3.log）；抽屉关闭后DOM为closed但退出动画currentTime持续0、焦点未恢复（work/f6-detail-diagnostic.log），尚未确定根因。海尔分页也无效果；请求人工协助后RPC在300秒超时，没有取得continued/completed，不能据此继续真实抓取。所属会话全部关闭，bsk session list为空 |
| 已处理/复验失败 | 首轮整仓与构建并行时，chain/plan进程夹具启动超时、storage进程测试总时限超时；无代码变化单独整仓复验169通过。修复授权下游误显running已修为pending并增加业务回归；人工状态文案不再笼统归为登录/访问限制。修复选择器可空value类型错误已修正，复查通过 |
| 未测门 | 海尔完整三步骤与当前末页/全覆盖、真实零探索独立复跑、实际站点同运行恢复和成功修复、真实登录恢复、完整京东旗舰店及每页前100条评论、第二独立站点、真实Luna调用。海尔原需求仍是中国官网冰箱目录名称/型号/链接/缺失说明，不能用它冒充旗舰店评论验收 |
| 静态与基线提示 | 35个变更TS/TSX文件的文件500行/函数100行扫描通过；git diff --check通过。Vite既有主块超过500kB提示保留，具体字节数见最终构建日志 |

服务/数据收尾：开发前只停空闲API，备份work/f6-before-development.sqlite；现API4175/PID19812、原Web4173/PID22976运行，4173同源health通过。两任务的访谈/browser/research/plan/chains共10项完整API JSON哈希与开发前一致，work/f6-user-state-{before,after}.json均只保留哈希。用户DB v7 quick_check=ok、foreign_key_check为空；未新增用户确认或授权，旧JSON与数据保留。

真实证据在忽略的work/f3-real-1788678265551/f6-{execution,full}-*.json与f6-plan-v6.json。real-capture-full.ts --prepare会生成新计划，--execute会调用正式启动，不用于只读查询；当前暂停运行需人工确认浏览器交互后，经正式独立修复授权接续，不能重置旧检查点/消耗或手工接管Worker。F6完整验收尚未通过，不进入下一阶段。

## F5 探索、链路与换输入验证（2026-09-06）

从干净的 master/42940c9823b9727fbb8d42a8b127c9b68ad8391d 保存目录接续；本阶段主 task 01a075b5-aaf0-7440-a3a8-0608bf2819e6 的实际 turn_context 为 gpt-6-astra/high，没有开发子 agent。只实现 F5，本地提交后以全新 local task 交接 F6，不推送远程。

- 正式队列默认接入 ChainService：逐步骤 Sol/high 探索、受控 DSL 编译、LangGraph 节点运行、样本与不同输入验证。SQLite v6 保存绑定计划/执行/步骤的链路版本、输入输出、观察哈希、节点事件、判断摘要及模型意图/回报审计。GET `/api/chains?taskId=...` 和现有画布显示真实事实。
- 普通节点不隐式调用模型；显式 llm 节点单独采用 Luna/medium 且默认预算0。命令按真实底层调用消费，步骤时间/探索/LLM分别执行授权上限；验证失败只在同一步剩余预算内重探，前置成功及已有样本保留。取消、受限、进程中断与未知调用分别保存，finally 回收会话。生成模型沿用 Terra/medium。
- 每组输入最多验证2个检查点，实际记录代表窗口结束或链路 finish；编译后的完整循环不被截短。新参数还须产生非空且不同的稳定来源键集合。代表验证通过不表示全量已完成；所有步骤通过后进入 awaiting_next_stage，完整执行/结果仍由 F6 接续。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 最终整仓 npm test 157项全部通过：API60、workbench31、browser13、contracts10、model-runtime26、runtime17；work/f5-final-test2.log。npm run check、npm run build通过，最新检查work/f5-delivery-check.log，构建work/f5-final-build.log |
| 协议与运行 | 授权→两步骤→换输入、0预算拒绝、底层命令上限、取消/晚到结果、人工限制、只重探失败步骤、前序及样本保留、显式LLM独立预算/用途、路由回报核验、30页循环/去重/零普通模型、循环耗尽非完成、无效边/环/临时ref拒绝、验证窗口与完整图分别执行通过 |
| 持久与故障 | 正式隔离路径创建活动探索后真实Node子进程SIGKILL，重开恢复interrupted，未回报调用仍null；SQLite v5→v6迁移及冲突原子回滚通过。无直接写库伪造运行成功 |
| 真实目录 | 沿用隔离work/f3-real-1788678265551、task fff00875-4d68-4fcd-ab82-340eedb57f4b、research ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed/v1。正式新计划94d2d2ef-25f5-40fc-947e-1b54dea68fd4/v5、授权执行be81221e-088a-4371-9e2e-aebfa66bc3b0；原需求快照前后不变 |
| 真实换输入 | enumerate链路335e6341-b3d2-497f-ac2f-e08e5ca70f39/v1 verified，12个实际节点；同一目录URL的分页输入1得到36个稳定来源键（2个checkpoint窗口），输入15得到6个（到达图finish）。81条底层命令、5次完成的Sol/high调用、103772ms。最新编译与输入效果守卫对已保存真实产物只读复核通过，未新增模型或浏览器 |
| 真实停止 | collect链路5fe2ec0b-8b1e-4033-a656-0cb2a9294bae在本步骤90000ms预算耗尽，7条命令、1次Sol/high调用意图被中断且未回报次数；无已编译采集图。派生未启动，整个execution为failed，前置已验证链路保留。总授权490命令/300000ms/11探索/0显式LLM不被重新分配 |
| UI组件事件 | browser-f5.ps1 -DomEvents 15项断言通过：空态、正式授权及canonical两步verified、步骤/节点参数与事件、刷新、390px无溢出/详情抽屉、刷新后跨任务隔离。模型和来源是隔离替身，数据全部由正式服务产生。work/f5-ui-dom-final.log |
| 真实内容布局 | real-chain-view.ts以planExecutor:null只读已有事实；browser-f5-real-view.ps1验证真实12节点图、collect预算停止及390px无横向溢出。work/f5-real-chain-{wide,390}.png已视觉核验，work/f5-real-ui-view3.log。截图后不继续把静态画面当交互证明 |
| UI环境限制 | 本轮原生输入回归未完整通过。bsk doctor正常，但read-only elementsFromPoint实际命中BROWSER-SKILL-OVERLAY，点击/Enter返回后控件未生效；未修改覆盖层。使用浏览器DOM控件事件补验组件与布局，不视为原生点击/键盘通过。原生Esc/焦点返回未测通过；DOM模拟关闭也未满足完整移除/焦点断言，改以刷新开始独立隔离检查。该限制须在F6重新核验 |
| 已处理失败 | 迁移旧断言v5→v6、模型wire测试补齐ephemeral/final_answer、全仓并发冷启动下既有storage-process子进程5秒就绪偶发超时（测试等待改15秒，产品预算不变）；重跑157通过。UI脚本补任务/计划语义就绪和限定实际详情选择器，不用ACK替代状态 |
| 真实早期尝试 | 原v1枚举75秒预算停止；v2计划生成未回报成功（严格schema属性可选是排查假设，修正required后新计划成功）；v3额外来源锚点步骤4命令用尽；v4枚举7模型预算耗尽。各次均保存真实失败；经正式新计划与新授权继续，没有在运行中改代码或静默增加预算。探索后续获得动作历史、页面差异和剩余预算 |
| 基线提示与未测 | Vite既有>500kB主块提示保留，当前960.39kB。真实完整三步骤、全目录覆盖/末页漂移、第二站点、真实登录恢复、独立复跑/同运行恢复/用户修复及完整结果导出由F6验收；没有真实Luna调用成功的声明 |

真实图的末页分支采用当时商品BCD-309WMCO作为目录快照锚点；F6必须检验当前总量、末页及漂移，不把36+6样本、固定页数或图finish当全量覆盖。证据保留在忽略目录的f5-plan-v*.json、f5-execution-*.json及work/f5-real-summary.json。real-chain.ts --real会执行，--new-plan会新增正式计划/授权；不要用作只读检查。旧real-plan-reopen.ts断言F4 queued，现在仅作历史验收脚本，读取F5用real-chain-view或正式GET。

服务收尾：SQLite备份work/f5-before-api-restart.sqlite；更新API后两个用户任务的完整访谈/浏览器/来源JSON哈希前后相同，work/f5-user-state-{before,after}.json仅存哈希。用户任务无新增计划、授权或链路。API4175/PID21836、Web4173/PID22976是当前快照；原JSON与data保留。隔离验收服务及BrowserSkill会话在交接前关闭。

## F4 正式计划、独立授权与持久队列（2026-09-06）

基于 master/42790f169cc28884238ba82ef2f1c7a645a8f049 的干净保存目录完成本阶段；项目命令始终 workdir=D:/work/browser-capture-tool。本 session 仅实现 F4，收尾后主动创建全新 F5 task，F5 完成再交接全新 F6；不 fork、不跨阶段并行、不推送。实际 turn_context `01a07596-ab8e-73c0-aace-3c42566478e5` 为 gpt-6-astra/high，本阶段没有开发子 agent。

- 正式 API：GET/POST `/api/plan?taskId=...`。显式 generate 使用现有 Terra/medium，保存独立 plan_creation 审计；生成中/失败/停止/崩溃恢复可查。计划绑定需求版本/revision、来源版本/摘要，保留完整需求、来源观察、步骤依赖、字段/目标/缺口映射、输入输出、终止/预算/风险。代表页字段和按确认规则生成的说明分别处理；F3 partial 不被一律拒绝，真正的用户待决缺口阻塞启动。
- 授权与执行：用户审阅后显式 start，将计划摘要、需求与来源版本、本次预算及队列记录原子提交。每计划一个初始授权，不同幂等键重复点击也不产生新运行。SQLite v5 的任务待处理/全局running约束与 BrowserService/Host 互斥共同保护；非调研调用必须核验队列授权。取消、版本变化、重启不会重放旧授权。
- F4 阶段出口：默认 PlanExecutor 未接入，授权持久 queued，界面明确等待探索执行器且尚未开始抓取。可注入的测试处理器证明 FIFO、单浏览器与停止回收；真实动作探索、图/DSL、逐步骤模型预算消费、换输入验证与完整生命周期由下一 F5/F6 实现。授权预算不是完整目录一定可在本次完成的承诺，达到上限应保留剩余目标并暂停。
- 界面：正式计划替换空结构样例，来源 partial 可进入计划页；步骤详情、完整范围、缺口分类、预算、授权/停止与版本选择都读取正式事实。任务摘要反映计划/排队/浏览器状态。修复共享 DetailPane 在窄屏没有 Dialog.Trigger 时 Esc 关闭不返回入口焦点的问题。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | 累计140项通过：API51、workbench30、browser13、contracts10、model-runtime24、runtime12。整仓npm test通过后新增2项API崩溃/迁移测试；最终API51、workbench30及计划7项针对性复核通过，无失败/跳过。类型检查与构建通过，git diff检查通过 |
| 协议/持久化 | 完整字段与目标映射、伪造来源/字段拒绝、依赖环/预算越界、partial执行/派生与blocking、跨任务、过期摘要、同键与不同键防重、归档保护、取消/晚到结果、需求与来源变更、队列重启保留通过 |
| 故障与调度 | 真实Node子进程走正式任务→替身来源→计划/授权路径后SIGKILL，锁窗口后生成/运行恢复interrupted，未回报调用保持null；不直接写库制造成功。v4→v5原子迁移/冲突回滚通过；FIFO第二任务等首任务取消及浏览器finally回收后启动 |
| 真实规划 | `node --import tsx apps/api/tests/real-plan.ts --real`通过。沿用F3隔离正式任务fff00875-4d68-4fcd-ab82-340eedb57f4b、来源ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed/v1。计划f9f99277-d24f-44d8-8d75-e027d1d3cf33/v1为ready，3步骤：完整目录枚举→逐商品字段复核→缺失说明及覆盖验收。名称/型号/链接3页面字段和1规则派生字段全部保留；3个gap分别execution/execution/derived。实际1次Terra/medium调用，无新增浏览器命令 |
| 真实授权与重启 | 正式start重复请求仅生成执行6f45f603-298b-4beb-a047-92a4593ce439，queued；总预算480条底层命令/300000ms/6次首次探索模型调用。`real-plan-reopen.ts`重开服务后计划/授权逐项一致，重新校验真实引用通过，未触发模型/浏览器。隔离验收任务的需求事实不变 |
| 浏览器UI | `pwsh -NoProfile -File apps/workbench/tests/browser-f4.ps1`20项断言通过：空态、生成、取消、失败重试、预算审阅、步骤来源详情、唯一授权canonical核对、排队刷新、390px无溢出、抽屉/Esc/焦点返回、停止队列、来源版本更新、阻塞缺口、需求失效及跨任务。UI模型和来源页面是明确替身，所有状态经正式API生成 |
| 真实内容布局 | `browser-f4-real-view.ps1`读取真实计划与授权，宽屏和390px长文本无横向溢出；检查480命令预算、真实queued与派生规则。截图work/f4-real-plan-{wide,390}.png及work/f4-ui-390.png已视觉核验；所有BrowserSkill会话finally关闭，隔离4176/4177/4178均关闭 |
| 已处理失败 | 初次类型检查发现exactOptionalPropertyTypes的undefined选项；迁移旧断言期待v4；浏览器脚本初始语义树省略任务按钮、来源版本轮询和侧栏动画时序；均修复并复验。Esc焦点返回为实际组件缺口，已修复。不把命令ACK或轮询前旧状态当验收成功 |
| 基线提示 | Vite既有主块超过500kB提示保留，本次约947.58kB，未开展包体积优化 |
| 未测/接续 | F5真实动作探索、步骤模型路由及预算执行、图/DSL与换输入验证；F6全目录末页与全量、真实登录恢复、第二站点、断点恢复/复跑/修复。F4 queued不冒充运行完成。模型自由文本语义仍需审阅，结构校验不证明所有措辞正确 |

真实证据保留在忽略目录 `work/f3-real-1788678265551/{f4-plan-v1,f4-acceptance,f4-reopen}.json`。不应重复执行real-plan.ts来读取现有状态；它会创建新计划，已有待处理授权时正式门禁会拒绝。只读复核用real-plan-reopen.ts。F5可沿此隔离验收任务继续，不能把它混入用户data。

服务收尾：备份SQLite到work/f4-before-api-restart.sqlite，核验无活动访谈/调研/浏览器后更新API。两个用户任务的完整访谈、浏览器与调研JSON哈希前后相同，证据work/f4-user-state-{before,after}.json仅保存哈希。没有替用户确认草稿、生成计划或新增授权。API4175/PID18016，Web4173/PID22976；4173同源health和新/api/plan通过，PID仅作本次快照。用户data与旧JSON原件保留。

更新日期：2026-09-06。

## F3 真实来源调研（2026-09-06）

从干净的 master/b17dcccb7e624b9b5da42e7fbd92a44b19645a33 接续。本阶段只开发F3，未改动相邻项目、未推送远程；F4须在全新session继续。

- 实现：正式 `/api/research` 接收绑定需求版本的幂等启动、精确调研停止和带证据回访谈。SQLite v4持久化独立来源版本、查询意图、页面发现的候选、实际观察、字段/枚举原文证据、覆盖与缺口、用途审计和sequence。需求修改使旧来源待复核；重新调研产生新记录，已取得部分证据保留。
- 浏览器：F3仍只通过BrowserService。固定page只读表达式补充真实href；follow只允许首次调研访问本会话发现的链接，普通复跑不能动态扩权。URL/tab前后核验、敏感链接过滤、访问闸门、单会话/预算和finally回收均保留。模型选择E证据编号，服务提取原文；临时@eN仅出现在历史观察摘录，不作为操作参数。
- 模型：沿用官方账号、Terra/medium结构化判断，source_research单独审计；不开放模型shell或任意脚本。意图先写入，供应商未回报次数保持null；取消等待回调和模型关闭后再提交终态。Sol/high操作探索与Luna/medium显式节点仍是F5后续范围。
- UI：来源页提供显式启动/停止、版本Select、查询记录、已核验优先的来源列表、字段/时间/实际URL/枚举详情、覆盖缺口、刷新恢复和重试原请求。主区先展示最多12个候选，其余按需展开；详情复用Radix并排栏/右抽屉。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓 | 最终 `npm test` 129项通过：API42、workbench28、browser13、contracts10、model-runtime24、runtime12；`npm run check`、`npm run build`通过。日志在忽略的work/f3-final-{test,check}.log |
| 协议/持久化 | 无链接需求、真实候选引用、伪造URL/证据拒绝、缺字段partial、跨任务隔离、并发幂等、需求失效、回访谈幂等、受限/失败/停止/清理、迟到模型结果、关闭服务与重启interrupted均通过；v1/v2/v3到v4、迁移冲突回滚和浏览器历史保留通过 |
| 真实路径 | `npm exec --workspace @browser-capture/api -- tsx tests/real-research.ts --real`最终exit0：真实访谈生成并确认品牌/门类需求，经正式API搜索海尔中国官网→冰箱目录→代表详情。1次访谈调用、4次source_research调用，全部Terra/medium；3次实际页面观察、116个页面发现候选、2个采纳来源，终态partial |
| 真实证据 | `work/f3-real-1788678265551/acceptance.json`；task fff00875-4d68-4fcd-ab82-340eedb57f4b，research ee54ab2a-0d04-4aee-bd83-7bb37c3f81ed。目录 https://www.haier.com/cooling/ 与详情 https://www.haier.com/cooling/20260731_293681.shtml 实际观察到名称、型号和链接；session jxhv所有权closed，23个底层完成命令均有用途/关联/哈希审计 |
| 真实覆盖边界 | 保留目录末页、跨页重复项与全量枚举未执行的说明；“字段缺失说明”是需求中的派生输出列，当前保守检查也记为缺页面依据。F4需结合已确认缺失策略审阅这些partial项、区分来源字段与计划生成的说明，不将代表页验收宣称全量抓取完成 |
| 最终UI | PowerShell7执行 `apps/workbench/tests/browser-f3.ps1`通过14项：空态、原生启动/停止、完成、来源详情、刷新、人工处理、失败、partial、390px无横向溢出/右抽屉、Esc、回访谈及canonical修订/失效。模型与页面是隔离替身，状态通过正式服务产生。截图work/f3-ui-390.png已视觉核验，测试服务4176/4177已关闭 |
| 已处理失败 | 前两轮真实调研因模型重写引文而unsupported_evidence，未提交假成功；改为证据编号后复验通过。初轮模型曾识别搜索验证挑战而文本闸门未阻止下一查询，现加入显式access语义闸门并用测试保证立即停止；不把这一早期行为列作通过证据。UI脚本曾用Windows PowerShell5导致参数转义断言失败，改用本机PowerShell7后通过 |
| 基线提示 | Vite已有主块>500kB提示仍在，当前约935kB；本阶段未做包体积优化 |
| 未测 | 真实人工登录/验证码后恢复、完整目录末页与全量采集、第二独立站点、自动跨域重定向处理、多搜索供应商切换与生产规模。普通测试通过不替代这些验收门 |

服务收尾：原API无活动任务，先完成SQLite备份至忽略的work/f3-before-api-restart.sqlite，再更新API与Web进程。前后两个用户任务的消息/草稿原文/审计/revision/确认哈希完全一致（work/f3-user-state-before.json仅存哈希）；未替用户确认或重跑。当前API4175/PID22744，Web4173/PID22976，4173同源health通过，`/api/research`已接通。旧草稿缺结构或未确认时继续显示实际门禁。所有BrowserSkill会话均已停止。

## F2 受控浏览器与正式服务接入（2026-09-06）

负责人认可最新采访基本达到要求，沿用现有提问方式。只给私有 skill 补充“对象纳入条件与字段缺失规则一致”；未重写用户草稿或新增产品模型调用。下文对旧记录的评审保留为当时证据，不覆盖这次负责人接受的基线。

- 实现：`packages/browser` 以 Zod 限定 task/run/需求版本/用途/域名/动作/命令和时间预算；普通动作从最新观察解析语义目标，不接收原始 ref、脚本或 shell。跨实例锁保持同一数据目录单浏览器任务；明确访问闸门返回待人工。观察支持有界可见文本等待，命令返回不等于业务效果通过。
- 生命周期：意图审计先于实际进程；日志仅保存用途、关联、命令名和实参哈希。取消禁止新命令并等待动作子进程退出，finally 只关闭所属 session；启动结果不明/关闭失败保留待清理事实，阻止新会话，不枚举关闭其他窗口。
- 服务与 UI：`BrowserService.run` 仅供内部编排调用，检查已确认版本和归档/活动访谈状态；SQLite v3 保存每次浏览器运行。GET `/api/browser` 按任务恢复事实，POST 仅支持绑定 runId 的停止/所属会话清理。来源页复用 Radix 显示空态、工作中、成功、失败、待人工、待清理；清理结束仍为 interrupted。F3 将提供调研启动与证据，不把浏览器命令数当来源数。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓 | `npm test` 114 项通过：api 33、workbench 25、browser 10、contracts 10、model-runtime 24、runtime 12；`npm run check`、`npm run build`、skill 验证与 diff check 通过。最后补动作响应 tab 校验后 browser check/test/真实 probe 和 API check 通过 |
| SQLite | v1/v2 到 v3 原子迁移、旧原文与确认保留、重复启动；正式服务任务隔离、重复 run 拒绝、跨任务取消/清理保护通过 |
| 真实浏览器 | `npm run probe --workspace @browser-capture/browser -- --real` exit 0：本地公开夹具导航 → 语义 Enter 到下一页 → 重新定位并点击返回 → 业务文本就绪 → finally 回收；23 个实际完成命令。`work/f2-browser-1788676205331` 保存审计与 closed 所有权；adapter 没有模型调用入口，0 不代表外部计费统计 |
| 界面 | 隔离正式服务 + 页面/模型替身经服务产生状态；`browser-f2.ps1` 通过空态、运行、原生停止、人工处理、刷新保留、失败、所属清理、清理非成功、正常结束。390px 仿真等待侧栏实际移除后无横向溢出，`work/f2-ui-390.png` 已视觉核验 |
| 已处理失败 | 旧迁移断言仍期待 v2；测试控制端请求缺少 JSON Content-Type；窄屏检查先前未等待 Radix 侧栏移除。均修复后通过 |
| BrowserSkill 环境 | 早期输入命令返回后没有页面效果，就绪等待/预算将其判为失败；只读诊断见自动化遮罩。CLI 自更新停在 Windows 暂存替换，停止空闲 daemon 后使用官方 release 且 SHA-256 核验的二进制更新至 0.2.0，doctor 通过。更新后初次仍有失败，不能把全部问题归因版本；最终前台 session、动作后语义核验通过，后续不得只凭命令 exit 0 判断业务完成 |
| 未测 | 真实登录/验证码人工恢复、真实站点来源调研、生产规模、跨机器恢复、窗口突然消失与浏览器版本升级回归。F3 仍需语义来源判定，访问闸门当前为保守文本识别 |

运行收尾：验收 BrowserSkill session 均已停止；4176/4177 隔离服务已退出。保留用户 4173/4175 原进程与用户数据，旧 4175 仍需正常重启才能加载新功能。构建保留既有 >500 kB 主块提示（当前约 925 kB）。F2 出口完成，下一阶段 F3 在全新 session 开发；不在本 session 接着实现来源调研。

## 需求草稿抽屉与用户实际运行复核（2026-09-06）

只读核验正式 API 最新任务 `42154dad-547f-4d88-ac67-c761ff8a4ba8`（京东海尔冰箱核心规格一次性采集方案）：8 次 Terra/medium 轮次均 succeeded、共 8 次已返回调用审计，7 次提问后得到 v1，尚未确认。频率与格式提问过多；草稿的“无法确认型号排除”与字段“无法确认型号留空”矛盾；未提供结构化 brief。4175 进程 15156 从本机 12:01:32 运行至检查时，仍为上轮未重启的旧 API。该记录不符合新版采访与结构交接预期，也不属于实际浏览器抓取验收。用户任务记录未改动、未代为确认或重新请求模型。

点击确认目前只持久化需求版本与确认记录，界面显示已确认；F3/F4 尚未接通，不生成正式计划、CSV 或浏览器运行。旧格式草稿不会被自动猜成结构需求。抽屉已明确显示当前确认作用。

草稿统一使用右侧 Radix Dialog 与 re-resizable 6.11.2，左边缘拖拽、键盘微调、同任务关闭重开宽度保留、窄视口约束；版本及节点下拉框改为 Radix Select，源码已无原生 select。新版不再把草稿挤成宽屏固定并排小栏。

验证：workbench 25/25 测试、workbench 类型检查、根构建通过（既有主块体积提示保留）。BrowserSkill 会话 gwng 的完整 browser-f1 回归通过：560→592 键盘、592→752 鼠标事件拖拽、版本切换/只读、菜单关闭、Esc/焦点恢复、重新打开宽度、确认/刷新/取消/重试、390px 限宽与页脚可见。bsk 0.1.11 无原生 drag 命令，拖拽测试向已观察握柄发送分帧鼠标事件并检查实际组件尺寸，未直接写组件状态；其余选择与键盘交互走原生输入。早期测试失败来自未等待 React 拖拽状态提交、菜单关闭动画和可访问树恢复，修正测试等待后通过。

证据：`work/drawer-ui-20260906-complete`、`work/ui-review/draft-drawer-390.png`。会话均在 finally 关闭，4174 隔离服务已关闭；保留用户 4173/4175 原服务。本次未重跑旧 browser-layout 全量脚本、真实模型或真实抓取；旧脚本已按新组件调整，当前浏览器证据以 browser-f1 为准。

根目录启动补齐：`npm run dev` 同时启动 API 4175 与 Vite 4173，浏览器访问 4173。使用隔离 `work/root-dev-acceptance` 实测根命令启动、页面 200、同源 API health/空任务读取；Ctrl+C 后 4173/4175 均释放。只改启动脚本/开发依赖/说明，未触发模型调用；未重复执行业务全套测试。

当前阶段：F1 任务与需求访谈正式化已实现并完成本次验收；后续按 ROADMAP 继续 F2/F3，阶段 0 的浏览器能力门尚未完成。

## F1 访谈质量与下一阶段交接修订（2026-09-06）

按本次用户反馈重做访谈的判断与输出：必要业务取舍才追问；名称等开放回答直接使用原输入框，无中间按钮；来源入口、品牌/店铺候选和枚举路径交给系统调查；可合理建议的默认值随草稿审阅。信息充分可以首轮形成结构需求。明确的全部范围、字段、数量与来源类型须保留；前 N 条说明排序和不足处理；纠正按语义更新整个草稿。

模型只输出 RequirementBrief；可读 Markdown 由共享渲染函数生成。正式 API 保存结构草稿，SQLite v1→v2 原子迁移，旧 Markdown 和历史确认保留且 brief=null。confirmedRequirement 只返回当前已确认 taskId/draftVersion/revision/brief，修改即失效。来源调研接收入口/代表样本/完整枚举方法/字段可得性的调查要求，完整批量枚举和采集由后续计划组织，不固定链路数量。

| 验证 | 结果与边界 |
| --- | --- |
| 普通测试 | `npm test` 100/100 通过：API 29、workbench 25、contracts 10、model-runtime 24、runtime 12，无失败或跳过；最终 UI 修改后再次通过 API 29 与 workbench 25 |
| 类型与构建 | `npm run check` 所有工作空间通过，`npm run build` 通过；保留既有 Vite 主块 >500 kB 提示 |
| 结构与迁移 | 开放问题、自然回答、版本交接、确认失效、缺失结构/猜造已提供 URL 拒绝、审计留存、v1 原子迁移/失败回滚/幂等重开及版本隔离通过 |
| 实际模型 | 正式任务 API + 官方 App Server + 私有 skill + SQLite，实际审计均为 gpt-5.6-terra/medium、每成功轮次 1 次。逐份人工核对输出，不把 schema 成功当成语义通过 |
| 品牌与纠正 | 完整品牌请求直接草稿；从海尔/20 条改成美的/30 条，最新草稿所有相关字段同步更新，无旧品牌或未要求的上海范围。证据 `work/interview-quality-1788672087932/brand-{1,2}.json` |
| 信息不足与补充 | 原示例仅问旗舰店名称、options=[]，补充京东海尔及字段/数量后直接草稿，未索要链接。证据 `work/interview-quality-1788671876780/open-{1,2}.json` |
| 非商品任务 | 省会/直辖市市级公共图书馆及分馆请求直接出草稿，保留全城市范围、官方来源优先和缺口；未带入商品/评论/京东模板。证据 `work/interview-quality-1788671876780/library-1.json` |
| 整个品类与委托发现 | 知名品牌范围由系统提出证据口径并调查名单；全量商品要求保留、默认评论排序明确、平台/官方旗舰店类型未扩大，调查输出为入口/样本/枚举方法/字段证据。证据 `work/interview-quality-1788672347764/category-1.json`；具体品牌依据仍需 F3 实查，不能把建议当成已核验事实 |
| 浏览器交互 | BrowserSkill vpgc、隔离正式 API 4174、显式模型 fixture：开放问题无中间按钮且仅一个输入框、历史选项只读、直接回复得到 brief、确认/刷新/纠正/跨任务/取消/失败重试与 804px 布局通过；读取 API 核验 decisions、drafts、turns、audits |
| 修复与失败记录 | URI format 供应商拒绝已定位并修复；早期真实输出混入批量执行、改名残片、排序缺失、来源类型扩大，分别收紧规则并回归。首次浏览器脚本把 option 与历史 draft_confirmation 混计为一个断言，修正测试后通过；产品历史事实正确保留 |
| 未测与限制 | 当前只证明选定访谈场景与协议/交互；实际入口发现、来源覆盖、正式计划生成、链路探索与整批抓取仍属 F2–F6，不声称已抓取京东或图书馆 |

界面证据 `work/interview-ui-20260906-final`、`work/ui-review/f1-lifecycle-804.png`。BrowserSkill 会话均 finally 关闭，4174 fixture 服务已关闭；用户原有 4173/4175 开发服务保留，需重启根目录 `npm run dev` 加载新 API。所有模型原始验收记录保留在忽略的 work 下，不进 Git。首次被供应商拒绝的调用没有成功审计，实际计数未知，不补造零。

真实验收入口：`node --import tsx apps/api/tests/real-interview.ts --real`，可加 `--case=brand|open|category|library` 选择单个场景；创建隔离任务并使用实际模型，不纳入普通 `npm test`。脚本负责记录状态与审计、拒绝技术失败；语义质量按上表人工复核，不宣称所有措辞和所有未测业务都已自动验证。

开发协作仅核对本次 turn_context：主控 `01a07518-d820-7020-8ca3-5af71b2564d0` 为 Astra/high；存储 `01a0751b-15fa-7b32-b1b2-d73f82e24a4b`、UI `01a0751b-5f40-7f30-b276-6e42fa9e622d`、独立泛化检查 `01a0751f-a644-7db3-b38b-ea751fbb3b4e` 均为 Sol/high，最多两个子代理同时运行。泛化子代理检查只是独立开发审阅，真实 Terra 验收另行记录。

## F1 正式任务与访谈（2026-09-06）

本次基于唯一交接文件及实际工作目录实施，保留全部未提交原型。实际创建两个开发子代理：f1_storage 负责 database/迁移与存储测试，f1_api 负责 Fastify/访谈生命周期与测试；主控负责共享契约、工作台、集成与浏览器验收。只读取本次 turn_context 核验：主控 turn `01a072e9-e586-7063-9258-6b7f1688779f` 为 Astra/high；存储 turn `01a072ea-b9dc-70b3-9ba5-3c50be01f12f` 与 API turn `01a072ea-f89b-7d20-aa6b-db7d46f7e209` 均为 Sol/high。

交付路径：正式 API 新建任务 → 持续访谈 → 选项决策/草稿 → 独立确认 → 刷新及重启继续。SQLite/Drizzle 保存任务、消息、轮次、未决问题、明确决策、版本草稿、确认、审计与操作去重。旧 JSON 保留原件、事务导入一次；同一目录独占，模型调用在事务外。用户原文保真，新输入使旧确认失效；取消按 turnId 持久化，迟到成功不能提交草稿。

| 验证 | 本次结果与边界 |
| --- | --- |
| 全量普通测试 | `npm test` 91/91 通过：API 23、workbench 23、contracts 9、model-runtime 24、runtime 12；无失败或跳过。历史 62 项不是本次验收依据 |
| 类型与构建 | `npm run check`、`npm run build` 通过；Vite 仍有主块 >500 kB 提示，未开展包体积优化 |
| 正式启动入口 | 隔离 `work/f1-startup` 执行 `npm start --workspace @browser-capture/api`；4175 health、构建页面和空任务列表读取通过，没有触发模型；启动检查后关闭服务 |
| API/事务 | 命令幂等、原文空白保留、跨任务隔离、归档保护、草稿确认/失效、取消提交竞争、错误与失败重试、观察断线继续通过 |
| 迁移与进程 | 保留原 JSON、重复导入、损坏与冲突全批回滚；真实 Node 子进程 SIGKILL，立即重启拒绝锁，stale 窗口后新进程恢复 interrupted；历史消息/草稿完整且无永久 active |
| 工作台布局 | BrowserSkill 会话 zbgy：原有六消息/五视图、草稿版本、宽屏侧栏、804px 抽屉、Esc/焦点、节点画布、两任务输入/视图隔离、重命名/搜索/归档恢复通过；旧访谈事实与审计不变 |
| F1 可操作界面 | BrowserSkill 会话 vgav：正式新建→替身提问→选项→草稿确认→刷新、慢轮次刷新重连、另一任务可编辑但阻止发送、取消无新草稿、失败/重试不重复用户原文、804px 输入可见与无横向溢出通过；正式 API 核验 decisions/turns/drafts/audits |
| 修复与失败记录 | 初始 app.ts unknown 类型错误已修；浏览器初次访谈读取失败定位为 fetch 接收者绑定并修复，后续回归通过。开发中新增测试的中间失败已修复，无保留基线失败 |
| 真实调用边界 | 本次没有新增真实模型调用；沿用官方 adapter/登录/skill，故障与 UI 生命周期使用明确标记的 fixture。来源搜索、产品 BrowserSkill 执行、京东与第二站点抓取均未实施 |

隔离验收数据：`work/f1-ui-20260906`；截图：`work/ui-review/layout-*.png`、`f1-lifecycle-804.png`。BrowserSkill 会话均在 finally 关闭，4174 替身服务已关闭。正式入口为 `npm start --workspace @browser-capture/api`（默认 4175，构建后提供页面）；Vite 4173 代理正式 API，原 server/ 文件仅留作兼容测试。

未测：新正式路径的真实模型轮次（既有 adapter 真实证据保留在下文）、长时间/大量任务性能、多机部署；F2–F6 按 ROADMAP 另行实现。当前没有阻碍 F1 完成的环境卡点。

## F1 前文档收口记录（2026-09-06，历史）

负责人决定原型先保留，整合界面/开发文档后在新会话开发功能。新增 DEVELOPMENT_BASELINE.md 作为统一入口、UI_STATES.md 作为逐功能状态与交互验收清单；ROADMAP 给出 F1–F6 依赖顺序，首项为 F1 任务与需求访谈正式化。原型是布局基线，不是所有状态画面的最终签核。

已统一中窄屏详情为抽屉、真实多任务访谈的采用状态，以及“100 条首版规模验收”和各任务确认范围的区别。文档职责分开维护，当前功能/证据边界不再由历史原型段落推断。本轮仅改文档，不新增产品调用或重跑上一轮完整测试；上一轮验证证据保留如下。源码尚有未提交修改，master 的 HEAD 为 5df30db，接续必须使用当前工作目录，禁止回退或遗漏这些修改。

## F1 前原型：多任务与全页面信息分层（2026-09-06，历史）

布局基线见 WORKBENCH_LAYOUT.md：左侧任务列表 → 当前任务 → 五个独立可切换视图。列表只显示名称和关键状态；新建、搜索、重命名、归档与恢复已接通。持续对话与节点画布保持主区；草稿、节点与审计采用宽屏右侧并排/窄屏右抽屉；计划补充字段就地折叠；短弹窗用于重命名。未生成的来源、计划与结果显示真实空态，结构样例显式打开。

真实访谈沿用 assistant-ui、私有 interview-browser-task skill、官方 Codex App Server 的 ChatGPT managed 登录与 Terra/medium。用户原文、助手回复、问题和草稿卡按轮次保留；确认绑定任务、版本和 revision。新输入使旧确认失效，历史草稿只读。模型/auth/私有 skill 本轮没有重新选型。

任务元数据保存在忽略的 data/tasks.json，每个任务独立保存 data/tasks/<id>/interview.json。旧 data/interview.json 复制迁入 legacy，原文件保留。列表写入串行，访谈接口显式携带 taskId，不存在的任务拒绝处理而不回退。已访问的任务保留视图实例，切换保留输入、页签、节点和详情选择；服务端记录与选中任务可在刷新后恢复，视图临时状态不承诺跨刷新保存。

| 验证 | 结果与边界 |
| --- | --- |
| 整仓检查 | npm run check、npm test、npm run build、git diff --check 通过；62 测试（workbench 19、contracts 7、model-runtime 24、runtime 12）。JS 主块 875.62 kB，仍有 >500 kB 提示 |
| 多任务协议 | 新建不调用模型；消息/提示词/草稿/确认隔离；活动轮次归属、错误任务取消不影响原任务；运行中禁止归档；重命名、归档恢复、重启与旧单会话复制迁移均通过 |
| 浏览器多任务 | 4174 隔离服务：新建、重命名、搜索、归档恢复、归档只读；A/B 独立未发送输入、五视图上下文、当前页签/样例节点选择保持；空任务不继承真实消息、草稿或调用审计 |
| 信息层级 | 宽屏草稿为 380px 并排侧栏，主区仍约 798px；历史草稿只读；来源补充说明、计划预算/条件、审计轮次默认折叠；六节点画布与条件详情保留 |
| 响应式 | 1458px 深色与 804px 浅色已看截图。窄屏任务列表左抽屉、草稿与节点右抽屉，Esc 关闭并恢复焦点，输入在视口内、页面无横向溢出、关闭节点详情后画布保持主区 |
| 真实模型证据 | 复用此前三次 Terra/medium 成功调用：需求 → 范围问题；完整回答 → 草稿 v1；页面纠正 20 改 30 → 草稿 v2。本轮布局验收未发送消息、未增加模型调用，legacy revision 与审计数不变 |
| 验收脚本修正 | 等待重命名保存/弹窗退出的语义状态；几何查询仅定位可见任务，避免测到为保留状态而缓存的隐藏任务。修正后完整回归通过 |
| 数据与释放 | 仅 work/interview-acceptance 新增空验收任务；4173 主任务列表仍为空，未写测试消息。BrowserSkill 会话 finally 关闭；无应用异常，扩展自身 chrome-extension://invalid 错误单独归类 |
| 未测 | 跨任务滚动阅读位置尚未单独做定量断言；本轮不新增真实模型取消、跨客户端并发或大规模任务列表压力验收。最终补充的另一任务运行时允许编辑/阻止提交逻辑通过类型检查，未模拟真实慢模型在浏览器中验收 |

截图在忽略的 work/ui-review/layout-*.png；自动化入口为 apps/workbench/tests/browser-layout.ps1，browser-ui.ps1 兼容转发。脚本必须使用已有 legacy 真实三轮记录的隔离 4174 服务，只创建空任务与操作视图，不调用模型。

实施边界：多任务访谈文件保存已完成，但不等于 Fastify/Drizzle 的正式事务或浏览器运行队列。Decision/Unresolved 尚未独立成表；真实来源搜索、BrowserSkill 样本核验、正式计划、可执行链路及真实抓取尚未接通。静态 dist 不包含本地后端，当前未完成独立部署交付。

## 阶段 0 基础设施与历史检查点事实

- 负责人已确认 README 中的首版范围，领域词汇已落档；新增文本/表格/链接抓取与附件来源链接、独立复跑结果与中断恢复、多任务排队及单浏览器任务执行约束。
- 本地分支 `master`，未配置远程。本检查点包含npm workspaces、Zod契约、LangGraph/SQLite原型、官方Codex adapter与Radix/React Flow工作台；仅授权本地Git提交。
- 已查询官方 Codex 配置资料并收敛开发期模型规则：主 agent 固定 GPT-6 Astra high；所有开发子 agent 固定 GPT-5.6 Sol high，包括简单任务；同时最多两个。项目配置与角色文件已同步，并已通过实际 `turn_context` 核验：主控 turn `01a071c8-660d-7ac0-ae73-8acad7b85a16` 为 `gpt-6-astra` / `high`，S0-06 开发子任务 turn `01a071c8-e4d4-72d3-b4a3-630b806ef340` 为 `gpt-5.6-sol` / `high`。
- 负责人已确认技术方向：TypeScript/Node.js 24/npm workspaces/React/Vite/Fastify/Zod，assistant-ui 与 React Flow 优先验证；SQLite/Drizzle/本地文件；LangGraph JS 优先原型、XState 对照；受控版本化节点图与浏览器动作规则；本机 Codex App Server 与现有官方登录；产品模型 Terra medium、Sol high、Luna medium；按商品/步骤恢复；本地 Git 分阶段提交且无远程推送授权。开发期模型规则与产品运行时路由分别管理，产品路由未变。
- 已澄清开发任务派发规则：任务先记录目标、输入、依赖、文件范围和验收；不明确时由主 agent 先澄清拆分；所有开发子 agent 均使用 Sol high；启动后核验实际 model/effort，不一致不接受为完成。
- 已核对 LangGraph JS、XState、SQLite/Drizzle、Codex 子 agent 配置和 App Server 的官方资料，并在 RESEARCH.md 记录候选、代价与待验证门。
- 既有单 SKU 探索与复跑 MVP 是历史组件证据；本项目的完整旗舰店与第二站点验收尚待执行。
- 阶段 0 已澄清设计系统要求：优先验证成熟成品组件库，统一语义 tokens 与允许的 variants；页面布局独立按新产品需要讨论。
- R-004保留设计系统参考；S0-04已实现Radix成品组件、两主题统一Token与可操作演示。已通过真实浏览器检查并交负责人查看，视觉/流程反馈待返回。
- 已只读核验 `domain-analysis` 的 `master/93a57b6` 干净及现行官方App Server接入。本项目锁定CLI `0.150.1`，使用既有ChatGPT managed登录，完成一轮真实结构化需求聊天及一轮真实中断，不读取或保存凭证。

## 初始检查点验证证据（UI 为旧版记录）

| 项目 | 结果与边界 |
| --- | --- |
| 开发模型 | 本轮主控Astra/high；UI、S0-07、S0-08均为Sol/high；最新收尾turn `01a071e3-8850-7412-8eaa-f5c7c212fa49` 已核验，不以配置代替实际元数据 |
| 集成测试 | `npm test`：48项通过，UI5、contracts7、model-runtime24、runtime12；无失败/跳过 |
| 类型检查/构建 | `npm run check`全部workspaces通过；`npm run build`通过，Vite7.3.6，JS497.51kB/CSS719.45kB，尚未做包体积优化 |
| 普通引擎 | 30项有界异步循环、同运行稳定键去重、独立runId、workflow/version/输入指纹不可变、同实例互斥均通过 |
| 持久恢复与释放 | 官方SQLite checkpointer：32项在第17项暂停，新Node进程恢复至32项；所有测试finally关闭连接并清理精确临时目录；close重复安全 |
| Abort/副作用边界 | 实际异步adapter收到AbortSignal；checkpoint保留running/planned，恢复经核验stub与同一幂等键重入，不承诺exactly-once |
| 模型审计 | `modelInvocationIntents`由受控调用意图事件派生；0仅证明原型未进入显式网关。记录意图与实际供应商请求之间仍存在崩溃窗口，不作为计费证明 |
| XState对照 | 5.32.6实际恢复测试确认活动invocation重启；只保留对照，不维护第二套执行层 |
| 官方模型真实probe | 2026-09-05 22:07（本机时间），normal约17.8秒：Terra/medium，完成2步草案并本地Zod通过；interrupt约7.2秒：interrupted，无completed，两次均closed且进程exit0 |
| 真实流证据 | normal收到userMessage/agentMessage生命周期；未收到commentary delta。commentary增量转发目前只有协议替身测试，不声称真实文本增量通过 |
| 依赖审计 | 完整锁文件（含开发依赖）官方npm audit为0项已知公告漏洞；未使用force或legacy peer绕过 |
| 真实抓取 | 京东旗舰店与第二公开站点均未开始；当前没有BrowserSkill活动会话 |
| UI真实浏览器检查 | BrowserSkill会话qafv完成需求编辑、确认、模拟排队/启动/暂停/恢复/完成、样例结果和主题/弹窗操作；kyyy复查主题控件。两会话均已stop；704px视口没有横向溢出 |
| UI视觉修正 | 深色ReactFlow缩放按钮计算色为rgb(238,238,236) / 背景rgb(34,34,33)，面板圆角4.275px；浅色强调文本使用amber11；保留ReactFlow默认署名 |
| 视觉反馈门 | 工作台http://127.0.0.1:4173/可查看，已提供异步反馈入口；模型与编排独立原型继续推进 |

## 本轮影响

- 架构影响：澄清独立产品边界与已确认技术方向；具体模块、公共接口与运行组件仍待原型验证。
- 事实归属：README 保存首版需求，CONTEXT.md 保存词汇，ROADMAP.md 保存阶段计划，本文件保存当前进度，RESEARCH.md 保存技术候选与证据。
- 公共接口：初版图schema拒绝重复ID、悬空next与未知字段；公共运行请求拒绝注入游标/结果/计数。尚非完整可执行DSL，需补动作参数、受控条件和图编译。
- 复用资产：BrowserSkill 官方能力与既有隔离 MVP 的验证方法；后续产品代码承担链路领域规则、薄 adapter 和用户流程组合。
- 本轮实施：两个Sol/high子任务依次完成模型规则、UI、官方模型adapter及引擎恢复；Astra/high审阅并修正路由核验、中断时序、调用意图命名和主题可读性，负责真实probe与集成验收。

## 下一步

1. 按 PRODUCT_FLOW.md、INTERVIEW_UI.md 和 WORKBENCH_LAYOUT.md 继续 S0-09：将已接通的多任务/assistant-ui/私有 skill/真实访谈切片迁移到 Fastify、Drizzle 产品会话事务，完善 Decision/Unresolved、取消与恢复；然后独立接通真实来源调研与计划。
2. S0-10建立受控BrowserSkill adapter及权限/会话回收原型，再验证可执行DSL编译；不能把现有示意节点图当作执行器。
3. 上述门通过后做阶段0选型评审。京东旗舰店与第二站点属于后续真实来源验收，当前均未开始。

未测范围还包括：产品多任务队列、跨实例互斥、SQLite多进程锁冲突、实际浏览器恢复、探索Sol/high及显式节点Luna/medium的代表性任务。当前没有环境阻塞导致的测试失败。

交付状态：本地源码检查点与可查看的UI演示；无远程分发、跨电脑迁移或完整抓取产品交付。
