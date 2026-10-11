# 冻结代码的新任务首跑验收：未通过

日期：2026-10-11。当前 checkout：master@5ac7f8f1748955779446937f8491a01dc6be054f，保留开始时全部未提交改动。用户本轮要求核清清理超时和残留，实际检验不边修边试时能否从需求开始走通。

## 结论

**不能交付“当前版本从零跑通”。** 新任务从 Workbench 新建需求开始，一次准备最终失败，没有进入样本、独立验证、发布或正式复跑。全程1201份代码/配置的逐文件SHA256一致，无新增非文档文件；没有改盾、改代码、替换旧来源、人工修链或再次准备。

盾端的本次代表探索为Human，不等于B-A-T主流程通过。原任务的发布版成功仍是原任务事实，不能覆盖本次首次失败。

## 新任务与实际阶段

- task：48c3061d-90cd-4fe1-950b-8ff9a8f7503d。
- preparation job：7c7b18bc-dafa-41e4-8078-62a52f0f9ef5。
- browser owner：5588125f-be0a-4c9c-8606-61e2de1ca0f1。
- 需求访谈：用户业务原文一次提交；gpt-6-luna/medium首次输出缺少封套闭合，校验报unclosed_tag，原内置repair一次成功，共2次模型调用。未人工改写草案，正常确认原入口、英文/中文、滚动、提交一次、结果如实报告及无需保留页面。
- 准备探索：日常Chrome，13个记录动作，模型16次；其中3次ai_structured_output_invalid、2次bat_read_fields失败，原生探索自行继续，未人工重跑。最终trace.completed=true，结果字段读取成功，原始事件保留。
- 首次准备结论：failed / compiling。UI显示“在线节点生成或保存未通过”，来源和9个生成节点保留。
- 样本运行、独立验证、发布、正式复跑：均未进入；taskExecutions=0，release=null。

## 已定位的B-A-T根因

不是这次盾检测阻止了流程，也不能把最终准备失败归为模型格式错误。后者在原生探索内已恢复。直接卡点为通用编译结果与收尾校验不一致：

1. 两次find_elements探查a-0006、a-0008在原始来源中留下natural_read_container_identity_changed，共2项sourceGaps。
2. 最终编译依据来源证明，将这两个没有复跑消费者的探查归为agent_internal / native_dom_lookup_observation/v1，最终compilation.gaps=[]，7个动作被编译；最终节点视图issues=[]。
3. 最终编译检查点和探索来源的canonicalRequest逐字相同，最终编译artifact及节点视图已保存。
4. apps/api/src/task-chain/authoring-build.ts的AuthoringBuild.finish仍以source.sourceGaps.length非零为直接拒绝条件，抛出hybrid_online_final_compilation_required。它没有区分已由最终编译合法排除的探查缺口与仍然有效的失败。
5. 上次natural_read_liveness.py已补“无消费者且有来源证明的探查回收”，但收尾校验未衔接这一结果。本次证实之前修复不完整，原有离线恢复/旧链复跑未覆盖全新在线准备收尾。

下一修复边界（本轮未实施）：复用已校验的最终编译缺口与coverage判定完成条件；保留原始错误作审计，真实未解决缺口、来源/身份不一致和保存失败仍须阻断。不能清空sourceGaps、绕过所有校验或增加盾网站分支。应以本次真实来源覆盖在线finish边界，并保护未解决缺口的反例，再冻结新代码另做独立验收；本次失败记录不得改写。

另外，最终读取字段“最终检测结论”命中了页面说明文案“真人表示本次人机检测通过，不代表操作者身份认证……”而非明确的本次状态；采集成功本身不等于输出语义验收。这个输出质量问题记录保留，本轮未改，不以盾端真实Human替产品生成结果背书。

## 原盾服务端结果

case：1171544b-ab68-46b0-a917-64feef131e34。仅一次代表探索，没有因结果重试。

- verdict=human，38 clear、1 flagged行为节奏参考线索，0 unavailable/failed/pending。
- creepWorker.platform / userAgent / hardwareConcurrency / deviceMemory均valid=true、status=clear。
- 原服务、规则及源码保持；只读原business.sqlite并复用serverReport获取证据。没有以人工制造报告或调整盾让测试通过。

## 清理超时的准确含义及结算

上一execution d88b0c49的close_protocol_timeout表示TS宿主等Python关闭协议回执超过既有5秒，不能直接等同于进程或目录仍残留。原三次审计先超时、一次owner核验不可用，最后confirmed；child退出及temporary_directory此前已确认，owner lease为ended。原日志缺少关闭内部逐阶段耗时，**不能唯一证明那次为什么超过5秒**，未通过放宽超时隐藏它。

本轮资源：

- 新准备的runtime_outcome primary=completed、cleanup=confirmed、activeResources=false，关闭协议没有再次超时；任务owner lease ended，targetCreationPending=false。
- 新Python owner临时目录C:/Users/30553/AppData/Local/Temp/bat-hybrid-owner-70Ubxw已由原生命周期删除，现场Test-Path=false。
- Workbench辅助Chrome PID25944已退出，exitCode=0；工作目录下frozen-fresh-01/workbench-profile经PID/绝对路径/非重解析点核验后永久删除。
- 上轮三个ended诊断owner的空profile目录和诊断__pycache__已永久删除。
- 另发现当日旧bat-hybrid-owner-pslR22只含两个空downloads目录：没有文件、没有重解析点且Python已全退出后，精确删除这棵空目录。它对应哪一次历史运行未知，不伪造owner身份或归入上一超时。
- 最终daily connected=true、busy=false；个人Chrome及原服务保留。上述删除均非回收站暂存。
- 保留本轮来源、日志、截图和审计证据用于追责与修复；未删除用户资料或无关历史临时目录，未声称整台机器全局无残留。

## 证据

证据根：work/bat-shield-mainflow-20261011/frozen-fresh-01/。

- receipt.json、code-freeze-before.json / after.json：本轮总回执与1201份代码/配置不变证明。
- requirement.txt、interview-messages.json / audits.json、draft-text.txt、confirmed-workspace.json：真实访谈、一次内置纠错与确认要求。
- preparation-job.json、source.json、compilation.json、build.json、workspace-final.json、diagnostics-final.json：首次准备、来源、已保存终态及失败结算。
- preparation-shield-report.json、source-lifecycle.json、failure-events.json：原盾结果和全部已记录失败。
- first-attempt-failed.png：Workbench实际失败界面。
- prior-resource-proof.json、prior-directory-cleanup.json、prior-empty-temp-cleanup.json、new-resource-cleanup.json、ui-exit.json：归属、永久删除及退出证明。

未运行全量或根级测试，未提交/推送，未创建worktree，未关机。
