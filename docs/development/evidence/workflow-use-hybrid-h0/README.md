# H0/H1 实施记录（2026-09-16）

## H0 已核对现场

- checkout `master`，HEAD `7242264bd3757a7ebe82514f9a17cb63e7bf614c`。
- 25 个初始 dirty 文件的路径、原始 SHA-256 和当前/最终处置在 [initial-dirty.json](initial-dirty.json)。无 branch/worktree、清理、提交或推送。
- 只读进程核查：没有 Python runner；用户 Chrome PID 639 存在，不能当作产品残留关闭。3000 由 Cocos 占用，3001/5173 无监听；其他 Node 为已存在应用/工具，不启停。
- 两份登记 history digest 均匹配。最小结构 fixture 与逐份 redaction manifest 在 `apps/api/tests/fixtures/workflow-use-hybrid/`。不打开截图、Profile、Cookies、Local Storage，不输出完整页面和结果正文。
- fixture 仅保留动作顺序、参数形状、匿名字符串等价关系和结果标志，不能充当已证明的 NormalizedTrace。未伪造前后观察、judge 或字段来源。
- 完整 history 为 28 个 item、38 个 action；0-based item 8、13、14、15 的 action/result 数分别为 2/1、2/1、3/1、0/1。必须从上游 history 语义证明映射，不能按 zip 丢弃或假设全部成功。

## 旧文件与入口的执行处置

以下处置继承 [完整逐项规范](../../WORKFLOW_USE_LEGACY_DISPOSITION.md)，当前只加 H1 gate；删除条件不提前。

| 对象 | H0/H1 | 后续最终处置 |
| --- | --- | --- |
| runner main.py、run_agent_with_validation_repair | keep 原字节，封锁宿主启动 | H6 按新协议 rewrite；补采需独立重新准入 |
| HealingService、run_with_no_ai、validate_definition | keep 诊断源码，产品 gate 拒绝进入 | H6/H7 remove 产品使用；registry/coverage 替换校验 |
| workflow-artifact.ts | 保留 decoder 与既有 dirty；writer/compiler 前加 gate | H6 拆分只读 v1 与 v2 writer |
| authoring.ts | preexecute/task/chain 在模型前 gate | H6 rewrite 为 normalize/compile/candidate |
| runtime-host.ts | 整个 invoke 闭包在 factory/browser/model 前 gate | H6 remove 旧 provider routing |
| service.ts、plan-executor.ts、queue/resume | 共用 gate，旧请求不进入执行 | H6 版本化切换、保持 gate |
| app.ts / PythonUpstreamBrowserRuntime | keep composition，runtime 在 bridge/spawn 前 gate | H6 一起 rewrite composition/protocol |
| setup、旧 venv/source | keep，不运行安装或旧环境 | H6 rewrite setup；H7 后精确 remove 旧环境 |
| 0001–0012、patch README | keep 历史诊断；不应用 | H6 setup 不引用；H7 后移出活动路径 |
| 未提交 upstream-browser-runner 三个测试 | keep 原字节，本阶段不运行旧行为测试 | 未知动作测试 rewrite 为 gap；预算测试 rewrite 为有界能力；补采测试重新准入 |
| task-chain.test.ts 旧 v1 正向测试 | keep 历史实现测试，本阶段不运行 | H6 rewrite 为 v2 与只读迁移用例 |
| v1 artifact/chain/run/history | keep 字节与读取/导出，不迁移数据 | 永不因切换删除；禁止新执行/候选写入 |
| 架构、ADR、规范、进度与调研文件 | keep 已有修改，追加当前证据 | 作为当前设计和历史证据保留 |

Product Alignment:
- natural-language task: 安全退出不能证明复用的历史任务链路执行
- reusable chain boundary: 一条链与其所有固定版本 invoke 子链
- runtime inputs: 请求操作、版本引用、已保存链路
- dynamic task outputs: retired/mixed 结构化错误，保留原始历史供查看导出
- generic platform capability used: 现有 contracts、repository、DomainError 与 runtime host
- replay model calls: 0；拦截发生在模型准备和浏览器/进程启动前
- site/task-specific code added: no

Failure Analysis:
- expected invariant: v1 author/replay/resume/queue/invoke 不启动任何外部运行
- observed evidence: authoring.begin 在 gate 前准备模型；Python withSession 打开 bridge 后 spawn；runtime factory 先于 delegated 检查
- responsible layer: API authoring/runtime composition 与版本准入
- root cause or falsifiable hypothesis: v1 缺统一退休门，注入 factory 可绕过 provider 分流
- affected public contract: v1 只读与 mixed_browser_runtime_unsupported
- keep / rewrite / remove existing change: 保留 runner/setup/patch；新增统一 gate，已有入口前置调用，不重写旧执行器
- smallest validation: 专用 H1 测试覆盖 author、direct runtime、replay/resume/queue/invoke、mixed、decoder/export，断言无外部调用
- reuse decision impact: 无新基础设施；复用现有版本解析和 DomainError，不引入调度器

## 阶段状态

H0 通过结构证据保护门。H1 专用测试 3/3 通过，API TypeScript 通过。H2 开始；整体编译器未完成。

### H1 首次验证失败分析

Failure Analysis:
- expected invariant: 合法历史 v1 fixture 可进入 gate；H1 API 类型检查通过
- observed evidence: 3 项测试中 1 通过，2 在 fixture schema 阶段因 distinct_input_validation_required 失败；TS 报 gate 后不可达分支的窄化失效及两处 fixture 类型错误
- responsible layer: 新增测试夹具与 gate 的 TypeScript 返回类型
- root cause or falsifiable hypothesis: verified fixture 没有样本/换输入证据；never 返回使保留的旧诊断函数体成为不可达代码
- affected public contract: 无；不放宽 verified 校验或执行门
- keep / rewrite / remove existing change: 保留 gate，返回类型改为 void 但实现仍无条件 throw；补齐历史 fixture 证据与参数类型，移除不存在的 app option
- smallest validation: 重跑同一个 H1 测试文件和 API check，仅因这次失败修复
- reuse decision impact: 非 fork 问题，无重选型需要

### H1 HTTP fixture 来源修正

Failure Analysis:
- expected invariant: 合法本机请求到达 v1 版本门
- observed evidence: 2/3 通过；HTTP 收到 forbidden_ai_origin，尚未到 retirement
- responsible layer: 测试请求头
- root cause or falsifiable hypothesis: inject 未提供现有 sec-fetch-site 同源要求
- affected public contract: 同源要求保留
- keep / rewrite / remove existing change: 保留产品 gate；补齐测试来源头，补充真实 queued execution 与 resume 固定版本记录
- smallest validation: H1 同一文件失败修复后重跑
- reuse decision impact: 无

### H1 fixture 摘要顺序修正

Failure Analysis:
- expected invariant: HTTP 引用与仓储解析后的固定版本摘要一致
- observed evidence: HTTP 到达版本检查但返回 version_digest_mismatch；独立只读探针证实 requirement 对象 revision/digest 属性顺序经 Zod 解析变化后 digestJson 不同
- responsible layer: fixture 版本绑定；现有 digestJson 使用 JSON.stringify，不是 canonical JSON
- root cause or falsifiable hypothesis: 测试先给未解析的 plan 算摘要，仓储解析改变键顺序
- affected public contract: 现有摘要算法不在 H1 改动范围；H5 canonical digest 仍须单独实现
- keep / rewrite / remove existing change: 保留产品 gate；测试先解析 plan 再绑定摘要
- smallest validation: 同一 H1 文件；无真实运行
- reuse decision impact: 非 fork 缺陷

### H1 收尾：保留递归 invoke 的既有版本约束

Failure Analysis:
- expected invariant: 退休门优先；所有被 invoke 的链（包括回到 root 的循环引用）仍须 verified
- observed evidence: 新门将验证推迟到闭包之后，但按 roots.includes 排除根，会漏掉被子链再次 invoke 的 candidate root
- responsible layer: runtime-host 闭包版本准入
- root cause or falsifiable hypothesis: root 身份不表示它不会同时是被调用子链
- affected public contract: invoked_chain_not_verified
- keep / rewrite / remove existing change: 保留 gate 顺序；按实际 invoke 引用检查闭包中的固定子链，替换 roots.includes 判断
- smallest validation: H1 文件增加 candidate invoke 反例并重跑；API check；已有 budget 文件只运行“浏览器授权包含固定 invoke 子链”用例，预计约 4 秒
- reuse decision impact: 无，仍复用现有闭包解析

## 最终验证

- H1 专用测试 3/3 通过（含 8 类 HTTP 命令、既有 validation/execution queue、invoke/mixed 与 v1 读取导出）。
- 现有 invoke 浏览器授权用例 1/1 通过；API TypeScript 和 git diff --check 通过。
- 初始 dirty 的受保护文件逐字节保持；workflow-artifact 只新增 gate import 与两处调用，去除这三处后 SHA-256 与初始记录一致。PROGRESS/RESEARCH/ROADMAP 仅追加阶段记录。
- HEAD/master 保持不变；无 commit/push、分支、worktree、全量测试、真实 Browser 或模型调用。
