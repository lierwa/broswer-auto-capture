# 主流程同类故障专项检查

状态：本轮边界检查和发布证据修复完成；**主流程整体不通过，方法变化验证与局部修订尚未关闭。** 两参考站的机器人检测结果保留为基线。不能用下面的检查数量替代未完成的产品能力。

## 范围与关闭规则

检查需求确认→准备→观察/工具入口→来源采集→编译→样本/变化验证→发布→正式执行→取消/恢复/清理，以及工作台对应事实。保留已有改动和历史失败；当前 master，不建分支或 worktree，不提交推送，不重启 Mac/VM/Chrome。

每项以真实失败或明确反例驱动，覆盖同类输入与所有相关消费端。没有对应检查的项目不记为通过；同现场再次成功不证明变化场景。优先复用现有协议、Zod/Pydantic、执行审计、SQLite 事务、LangGraph、B-U 及本地反例，不增加全局语义 judge，不让模型补技术字段。

Product Alignment:
- natural-language task: 检测报告、资料查询、列表处理等自然语言任务的准备、发布与复跑。
- reusable chain boundary: 已确认需求与不可变链路之间的来源、验证与生命周期。
- runtime inputs: 版本化任务输入及已授权浏览器现场。
- dynamic task outputs: 本次执行的真实数据、产物或页面交付。
- generic platform capability used: 现有 TaskDraft/TaskRun/TaskExecution、来源与审计、发布事务。
- replay model calls: 普通节点为 0，仅显式 llm 节点允许模型。
- site/task-specific code added: no

Reuse Assessment:
- capability: 发布证据一致性与主流程错误路径验证。
- existing implementation in repository: TaskProductService、recordDraftTrial、TaskContractRepository、Zod 合同、SQLite 事务和现有执行器。
- mature candidates and pinned versions: 沿用锁定的 Zod 4.1.8、better-sqlite3 12.10.0、现有 LangGraph/B-U；不替换库。
- selected implementation: 在现有发布证据消费处核验权威运行事实，复用现有合同和摘要。
- reused public surface: schema.parse/safeParse、repository 读取、现有 transaction。
- B-A-T-owned adapter and remaining gap: 精确对应需求、草稿、计划、链路、执行与调用；模型方法变化验证另行以证据评估。
- license/runtime/platform fit: 既有依赖、纯 TS/Python 合同适配；Mac 验证，Windows 不冒充实测。
- browser/runtime/state ownership conflicts: 不新增调度器，不改变已发布历史，不控制个人窗口。
- replay model calls: 不新增。
- rejected candidates and evidence: 不需要第二套发布、审计或测试框架；现有实现已有全部权威记录。
- focused validation: 实际发布服务与 SQLite 路径上的错误证据拒绝、合法执行接受、事务回滚和幂等。

## 检查矩阵

| 环节 | 要保护的不变量 | 状态 |
| --- | --- | --- |
| 需求/准备 | 同一确认版本，来源范围不漂移，确定字段不交模型重复填写 | 来源引用、需求摘要、准备交接与错误路径检查通过；准备完成证据另有本轮修复 |
| 工具入口 | 对外 Schema 与真实解析一致，所有数据形状适配一致 | 当前标量/对象/集合和最小入口跨语言检查通过；修正旧测试错用新入口 |
| 观察/采集 | 原生计数与 DOM 投影一致，缺来源不能装配 | 查询 0/1/多项/截断、观察身份和来源检查通过；任意业务分组完整性未被证明 |
| 编译 | Python/TS 消费一致，输入/常量/动态来源不重叠，普通节点无模型 | 当前方法、来源、导航、离线编译与显式模型边界检查通过 |
| 等待/方法验证 | 处理态不被读为终态，读取不绑定单次业务结果 | **不通过**：读取器等待有覆盖，生成方法的变化验证没有通用门禁 |
| 发布证据 | 不能用空调用、错误归属、错误版本或不完整审计发布 | **本轮修复通过**：准备、工作台就绪与事务发布使用同一验证器 |
| 局部修订 | 保留需求和旧版本，在失败方法处修订并重新验证 | **未完成**：现有技术备注重新准备只接受 failed job；没有完整的选中方法修订入口 |
| 执行/恢复 | 独立运行，同 run 恢复，预算/幂等/副作用与取消正确 | LangGraph 执行、子调用身份、分支、恢复并发与清理恢复的已有反例通过 |
| 清理/工作台 | 同 owner 清理；业务结果、清理结果、界面事实分别准确 | 清理、跨运行事件隔离、迟到响应、未知写回执和逐节点真实 I/O 检查通过 |

## 发现与验证

开工发现：`task-draft-lifecycle.test.ts` 的成功试跑夹具使用 `runIds=[]`，而 `TaskProductService.validationEvidence` 仅遍历已有 runIds；没有运行的 completed 记录可能被当作发布证据。先通过真实服务入口建立红色回归，再处理其他证据变体。

### 本轮新增修复：完成摘要不能代替运行事实

原验证器只检查已有 run 引用的完成状态与 auditComplete。空数组的 every 为 true；同时遗漏了调用身份、任务/授权归属、需求/计划/链路摘要、输入展开与结果装配的一致性。首次 17 项反例中 14 项失败，说明错误证据仍能使工作台 ready 并通过发布服务。

现有执行器的 invocationInputs/outputFor/outputValue 移至 plan-values 供执行和验收共同使用，避免重复实现每项展开、去重和输出语义。新的 release-evidence 核对当前草稿和保存候选、确定性 invocation/run ID、实际 Run 的绑定/输入/完成/审计、逐步骤结果及计划最终输出。合法空集合的 each 步骤仍接受零调用；不同输入要求不被绕过。

继续沿消费端检查发现，TaskPreparationCoordinator.onExecutionSettled 也直接相信 completed；红色反例证明它会把空调用复验标为准备完成。现在推进准备状态前也调用同一验证器。没有加模型字段、LLM judge、普通复跑模型调用或另一套调度器。事务发布仍重新校验，缓存不授权发布。

这是持久运行证据的一致性修复，**不证明模型生成的业务方法正确**。

### 测试漂移与开发检查问题

- root array 测试用不存在的 name 字段调用 count/labels 合同；现改为真实合同字段，错误路径继续拒绝。
- 旧 take/ordinal 的兼容测试调用了已去除这些字段的新模型入口；现在明确调用 legacy parser，新模型最小入口测试继续拒绝这些字段。
- 几个只读后置条件替身缺少 inherited/content_readiness、动作 args 和页面身份；现补齐替身，真实 TargetResolver/身份校验不跳过。
- ready 不要求动态值逐字稳定；transition 才要求已观察变化和连续读取。修正只读次数的旧断言，保留一次动作派发与身份漂移拒绝。
- 工作台测试第一次从根目录运行未加载 React JSX tsconfig，6 项报告 React is not defined；使用 workbench 的正式 tsconfig 后 24 项通过，没有为此改产品组件。
- 源码校验前置失败测试漏删自己的空目录；补上 finally/rmdir，不递归、不强制。核对本轮日志创建时间和空目录后已删除本轮留下的确切目录。

这些失败都有原日志，未把它们记成 12 个新的产品故障。

## 固定回归入口及本轮证据

`npm run check:mainflow` 只运行 scripts/mainflow-checks.json 的主流程范围：28 个 API、4 个 runtime、6 个 workbench 测试文件与 19 个 Python 模块；不访问外站、不启动产品浏览器或调用在线模型。可用 `npm run check:mainflow -- --list` 查看，或追加 api/runtime/workbench/python 运行对应组。它是维护入口，当前仓库没有远端 CI 工作流；不能声称远端已经自动强制运行。

本轮共覆盖 **257 项 TypeScript + 132 项 Python = 389 项不同检查**。采用分组基线及失败文件定点复验，没有将重复执行次数累加。维护脚本完成语法和清单检查，未为了同一组通过记录再整批重跑。所有下列日志在忽略目录 work/main-flow-audit-20261013。

| 证据 | 结果 |
| --- | --- |
| release-evidence-before.log | 17 项中 14 项红色反例 |
| preparation-evidence-before.log | 2 项中空调用准备完成反例失败 |
| preparation-evidence-fixed.log | 发布证据、SQLite 事务/幂等/缓存、准备/离线编译共 34 项通过 |
| mainflow-baseline.log + evidence-empty-and-navigation.log | 原 118 项中 1 项旧导航 pattern 断言失败，根域及子域的 origin/通配形式修正后通过；空 each 正例通过 |
| python-mainflow-baseline.log + python-repaired-tests.log + python-ready-scope-fixed.log | 132 项基线中的旧入口/替身问题修复，52 项复验最后剩余的 ready 次数断言在 6 项定点复验中通过 |
| requirement-lifecycle-ui.log + ui-projection-correct-config.log | 116 项基线中 110 通过；剩余 6 项加载正确 JSX 配置后所在 24 项全部通过 |
| preflight-cleanup-fixed.log | 前置校验失败不创建 runner，且测试目录收尾，2 项通过 |
| api-check-final.log、fork-manifest-check.log | API 类型检查、fork 全部固定源码摘要通过 |
| saved-trial-final.log | 两站已有 4 份真实样本/复验通过新证据门禁，均 0 模型；仅验证历史记录兼容，未当作新现场验收 |
| verified-source-refresh.log | 通过既有受管依赖校验登记当前 fork 摘要 9c4fd6c96c094d43f1b58aee214f61d742c3969ad75f6c6816ac9992b844b445 |
| live-api-check.json | 新进程 22917 的 health 根目录正确；两任务接口和工作台均 HTTP 200，无活动任务 |

检查时原服务端口没有监听；仅启动当前 checkout 的 npm run dev，未停止或重启宿主/VM/Chrome。代码仍在 master 工作区，没有提交或推送。原失败与发布历史保留。

## 仍阻止整体通过的两项

1. **方法变化验证缺口。** 当前数据本身就构成反例：Pixelscan 保存方法限定某个结果属性值，四份真实运行事实校验仍会接受它。该门禁只证明运行记录自洽。原来源中 DOM 查询大多是 query_result_summary_unrecognized，不能从它复原可信的处理前/处理中属性序列。查询摘要修复不能追溯补造旧证据，也不能证明未来的所有业务结果。当前在线接口仍返回该草稿技术上的 ready；本轮没有发布它。
2. **同版需求下的方法修订闭环缺口。** 现有 prepare_task.research 校验要求旧 job.status=failed，不能把已经 completed 但方法有问题的来源通过完整局部修订重新验证。重新写需求、重新随机生成或手改数据库均不算关闭。

根因在验证目标：系统把“真实来源、合同合法、两次执行完成”作为发布必要证据，却没有实现“具体方法的有效范围经过状态变化验证”。有限的运行记录无法自动证明任意网站的全部未来状态。需要补的是明确的验证能力与修订交互，不能加 success/error/scanning 词表或对所有属性选择器一律禁止——合法的筛选任务也会使用属性条件。

后续实现的最小边界沿用上一轮结算：宿主保留有界、同页、同来源的状态变化事实；使用现有读取/谓词/函数能力表达完成条件，条件与输出值分别验证；有实际反例或缺少要求的变化证据时保留方法缺口；选中方法带来源进入同需求的新不可变草稿，重验后发布。LLM 只承担不可由代码确定的语义部分，不填写 ID、摘要、样例、绑定和审计，也不增加全局完成 judge。

关闭必须同时拿到：处理中反例被拒绝、两种合法终态可读、集合分组变化不遗漏、错误方法不能获得相应验证资格、局部修订后同需求新版本完成普通复跑。当前没有这些完整产品证据，因此不能结算为“主流程稳定”或“同类问题全部不会再出现”。
