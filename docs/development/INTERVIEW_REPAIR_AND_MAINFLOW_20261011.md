# 需求草稿纠错修复与 B-A-T 主流程续测

> 后续更正与完成结果见[完整主流程结算](BAT_SHIELD_MAINFLOW_CLOSEOUT_20261011.md)。本文“未发出导航”被实际盾URL摘要关联证据推翻：入口确已访问，随后发生来源安全拒绝。用户后续授权最小修复后，真实repair完整校验及原任务发布、普通复跑已经完成；本文首败原记录保留，不再作为当前状态。

2026-10-11；`master@5ac7f8f1748955779446937f8491a01dc6be054f`，未提交。用户仅授权修复需求对话纠错机制，随后继续原主流程；盾和其它产品问题只记录。本记录接续[原始首败](BAT_SHIELD_MAINFLOW_ACCEPTANCE_20261011.md)，不覆盖旧失败及两次模型调用。

## 结果

原“页面交付写在段落中、修复只收到错误码”的缺口已修复。真实保存模型收到具体诊断后，写出了正确独立行并通过原准备草稿解析器。原正式任务重试需求对话成功、确认需求v1并进入准备；准备在浏览器导航/页面观测层失败。**尚无发布或正式复跑，本次不能判断 B-A-T 是否通过盾。**

## 具体修复

- `draft-validation.ts` 为 B-A-T 自有草稿校验提供错误位置、实际内容、期望格式和修正指令；不从同义段落推断或默认业务值。
- `preparation-draft.ts` 将章节、输入、交付、结果形状、页面交付、字段及完成标准等原准入错误附上诊断，错误码与接受条件保持；其它来源、业务步骤等校验未扩修。
- `authoring-repair.ts` 把诊断传入既有单次 repair；`protocol.ts` 明确按诊断纠正独立行，完整修正版仍过原校验。没有新增模型循环、搜索或调用次数。
- 修复仍失败时，`coordinator.ts` 显示具体章节/字段，并保留首败、两次调用与未提交状态。

这次原错误的诊断明确指出“结果与完成 / 页面交付”“独立标记0条”，给出两种精确合法行，要求按原业务意图选择、独立成行，不能放进段落或追加句号。修正信息由拥有该语法的校验器负责提供。

## 验证与边界

| 验证 | 结果 |
| --- | --- |
| 四份聚焦测试：draft-validation、interview-source-binding、preparation-draft-handoff、interview-protocol | 42项中40通过；新诊断、单次修复成功、耗尽不提交、原非法/冲突仍拒绝均通过 |
| 2项协议测试失败 | HEAD原protocol和原测试同样复现；测试正则要求`<interview-markdown `而原示例已是不带属性的`<interview-markdown>`。只记录，未改 |
| 受影响文件与测试定向TypeScript检查 | 通过；配置在证据目录`tsconfig.repair.json` |
| API包类型检查 | 受盾已有3项错误阻塞：cadence.ts:34可能undefined、verification.ts:5缺check-model.js声明、verification.ts:35隐式any；未修盾 |
| `git diff --check` | 通过 |

未运行根级或全量测试。HEAD协议定点复核首次因临时目录缺ESM声明而加载失败；补齐验证目录的`type=module`后复现原两项断言，不把夹具加载错误归因产品。原测试和产品文件未为此修改。

### 保存首败的真实模型修复

使用原产品保存的`openai-codex / gpt-6-luna / medium`，把**未编辑的第一次失败输出**送进原`settleInterviewAuthoring`，只实际调用一次repair。独立验收状态目录不改正式任务；测试入口为`apps/api/tests/interview-repair-real.acceptance.ts`。

- 调用`a94416c3-ff55-43dc-ad70-a9f5633d617d`真实完成，9,335 tokens。
- 输出新增精确独立行`- 页面交付：无需保留`；原准备草稿解析器通过，`browserHandoff=close`。
- **完整草案接纳没有通过**：后续来源校验报`interview_draft_url_unverified`。原文用中文引号包围用户URL，提取器把右引号算入URL；同一用户URL裸写通过、包中文引号失败的只读复核已保存。此问题不属本次字段诊断修复，未改来源校验、未改原输出重试。
- 因此只证明本次目标字段已被真实修复，不能宣称该受控草案全套校验通过。模拟集成测试另外证明正确修正版能经原一次修复流程提交，失败修正版不能提交。

证据：`repair-real-01/failure.json`保留新阻塞及真实修复文本；`repair-real-01/diagnosis.json`分别记录目标字段通过和整体失败。

## 原 Workbench 主流程续测

原任务`6088126d-5e8d-4650-9ae6-3a223a404c60`；UI操作沿原按钮执行，没有手改数据库、填补链路或替产品操作盾。

1. 核验所属服务PID/root后，通过原开发关闭接口重启 B-A-T加载修复，当前PID24832。盾服务没有重启或修改。
2. 18:08:04通过原任务“重试本轮”发起`6de928b9-a7b2-4b80-899e-42a3dbc09c8c`；18:08:31 succeeded。本轮首次生成就正确，没有触发repair；不得把这轮当自动修复的证明。
3. 按已授权任务确认准备计划，需求v1：`ce893bd7-5dc6-4927-8434-2097b982efb6`。内容保持中英文、滚动、提交、当次真实结果及报告链接，不以Human为完成条件。
4. 通过“生成草稿→日常Chrome→开始生成”发起准备job `a57d0f75-f73e-4347-8cc3-7498f03cda3a`。浏览器沿用原daily设置，没有切换专用或无头产品浏览器。
5. 18:11:04准备failed：原生探索4次模型调用，动作依次为navigate失败、navigate失败、wait成功、navigate失败。这是同一个产品探索内部行为，没有人工重试准备。

### 新阻塞：页面观测与导航

三个navigate返回同一原始错误：`observation_refresh_required: page changed during observation; no action was sent`。原始观测显示同一受控target在采样前后文档/URL摘要不一致，before不稳定、after回到about:blank；原观测一致性守卫拒绝交付混合快照，动作因此未发出。最终还出现`document_read_failed`、`author_observation_capture_failed`及`capture_callback_incomplete`，来源拒绝。

已定位到`vendor/workflow-use/workflows/workflow_use/hybrid/observation_scope.py`的采样一致性检查；**导致页面在采样间变化的更底层原因尚未确认**。没有证据归因盾拦截，也没有修改守卫、浏览器控制或增加重试。

最后在线编译片段停在前三个动作，仅wait生成节点，前两个navigate缺少成功动作证据；完整终态来源保留第4个失败。未发布此片段。SQLite核验：taskContracts=1、taskAuthoringJobs=1、taskExecutions=0、taskReleases=0、browserRuns=0；后者不表示没有探索浏览器，探索事实保存在job及来源制品中。

未完成中英文输入、滚动、提交或取得当次检测报告；验证复跑、发布、正式复跑全部未进入。新网址问题和导航问题均只记录。

## 资源与证据

产品探索source标记`closed=true`，daily连接保留、`busy=false`、无待确认popup；个人日常Chrome保持。专用于Workbench操作的验收Chrome PID23192已Browser.close、exit0；精确Profile归属/无进程/无重解析点核验后永久删除，见`repair-ui-cleanup.json`及`repair-profile-cleanup.json`。该验收浏览器未访问盾。B-A-T与盾五服务保留健康运行。

全部证据在`work/bat-shield-mainflow-20261011/`：`repair-mainflow-result.json`、`retry-interview-terminal.json`、`retry-model-evidence.json`、`preparation-chain-terminal.json`、`preparation-failure-diagnostics.json`、`preparation-progress.json`、`retry-persisted-counts.json`、`04-retry-success.png`及`06-preparation-failed.png`。来源制品`99093bb4-5e56-461a-8bcb-3a6c12895d0d`留在原任务数据库。无盾改动、无其它产品修复、无提交/推送/worktree/京东/关机。
