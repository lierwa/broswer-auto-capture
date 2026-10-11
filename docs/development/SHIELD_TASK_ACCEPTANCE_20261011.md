# 检测盾与 B-A-T 正式业务验收

2026-10-11。master@dc45be4，1358文件基线保护；未提交、推送、创建worktree、访问京东或关机。

用户修后自行完成两次真人检测，服务端63cfda00、aba3de64均Human/39clear；三项节奏逐字段有效，完整双语记录38/38+24/24真实键对。原失败报告保留，详见[输入法结算](SHIELD_IME_TIMING_ACCEPTANCE_20261011.md)。

本轮复用已发布task `061044bb-9b99-46cc-8cdb-9e1c0adc7f41`，release `127765cb-978d-4a21-818c-91d903e9e6a0` v1。目标是从当次资料列表选择并打开版本号最大的已发布资料，排除未发布项；独立备份原SQLite状态后从正式`run_task`入口执行，没有重新准备、编译或调用模型。

| 场景 | 本次正式执行 | 实际业务事实 |
| --- | --- | --- |
| 已发布4/7/2，未发布99 | 1fe0d704 completed | 动态选择第2项，实际打开7，业务记录correct=true |
| 已发布11/4/7，未发布99 | 2ffb2dd6 completed | 动态选择第1项，实际打开11，业务记录correct=true |
| 已发布2/13/7，未发布99 | c0ee1f13 completed | 动态选择第2项，实际打开13，业务记录correct=true |
| 只有未发布99 | 8e6689e7 failed | 真实读取仅99，选择节点失败，未派发点击、未打开任何资料；原因仍为function_output_invalid，提示可读性有缺口 |

每轮新Profile均先出现原CrowdSec挑战，提交HTTP200后保护业务OriginStatus200；正常场景资料页亦OriginStatus200。四次普通复跑模型调用0、cleanup confirmed；没有改检测判据、分数、阈值或公共浏览器控制。最终FZBYas使用原正式入口，没有诊断适配。证据：[逐次业务/检测/请求](../../work/antibot-service/reports/shield-task-run-20261011/actual-runs.json)、[结算与保护审计](../../work/antibot-service/reports/shield-task-run-20261011/validation.json)、[冻结链复跑回执](../../work/antibot-service/product-task-20261011-FZBYas/resume-proof.json)。

首轮8mSWRr未通过：原挑战及业务入口已通过，动态选择7正确；click四个鼠标命令均有ACK，但原生事件0，实际未打开资料，报ordinary_event_target_unverified。首败保存，不能拿随后成功解释为根因已解决。g4UUEj仅诊断原Page.bringToFront后版本7通过，窗口before/after本来均可见，未证实首败原因；最终移除诊断适配再完成上述四场景。[首败](../../work/antibot-service/product-task-20261011-8mSWRr/resume-failure.json)和[原诊断](../../work/antibot-service/product-task-20261011-8mSWRr/source-lifecycle-diagnostics/a9b124a5-2d4c-467d-80a4-2e6b87943dee.jsonl)分别保留。

本次唯一新增生产逻辑为原SQLite的events(case_id,action,id)索引：管理报告同步全表回查曾阻塞健康请求；查询计划由SEARCH e改为covering index，健康恢复37ms，原报告/业务事实不变、不删除历史行。`npm --prefix tools/antibot-lab run check`通过。[查询计划证据](../../work/antibot-service/reports/shield-task-run-20261011/report-index.json)。

Product Alignment:
- natural-language task: 打开当次版本最大的已发布资料。
- reusable chain boundary: 原发布链的读取、选择函数、点击与正式运行。
- runtime inputs: 冻结任务及合成业务入口。
- dynamic task outputs: 实际版本7/11/13或无合格候选失败。
- generic platform capability used: 原TaskChain执行器、OrdinaryCapability与owned Chrome生命周期。
- replay model calls: 0
- site/task-specific code added: no

Reuse Assessment: 保留既有SQLite、CrowdSec和B-A-T发布/复跑/资源归属能力；唯一适配是SQLite CREATE INDEX IF NOT EXISTS，复用原数据库引擎，不另建缓存/调度器或检测器。覆盖索引计划、真实报告响应与原业务四变体为聚焦验证，未运行全量测试。

首轮1、诊断1、最终4份Profile均确认关闭并永久删除，匹配进程0；五服务保留ready，原冻结数据库/manifest与全部无关源码字节不变。验收后合成业务页设置为正常变体1。范围为本机原冻结HTTP业务任务；本轮没有重跑外站、完整HTTPS业务或把目录任务称作39项双语检测。首轮偶发点击原因仍未定位，不宣称所有真实任务稳定通过。
