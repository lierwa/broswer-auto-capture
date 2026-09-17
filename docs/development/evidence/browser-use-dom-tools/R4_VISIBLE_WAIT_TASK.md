# R4b 自然探索与复跑共用的条件等待（2026-09-17 主 agent 派发）

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

## 本项明确目标

增加薄工具 `bat_wait_for(selector)`，让 b-u 为页面真正的就绪信号选择一个 CSS 条件，程序用既有 StepVerifier/Tenacity 等待满足。只暴露一个 selector 输入；程序固定有界等待策略；成功只返回一句确认。普通执行器复用同一工具，不能以原探索 sleep 秒数作为完成依据。

此工具的语义是“唯一匹配的当前主文档元素已连接且可见”，不要求在视口内；CSS 可以表达 aria-busy=false、loading 标记消失后容器匹配、选中/启用状态等实际信号。它不自动证明任意选择器等同于列表刷新：原任务仍需首次探索调查真实 ready 信号并通过原任务验收。不能把 URL/title/滚动位置 changed 改名成业务 ready。

Product Alignment:
- natural-language task: 页面列表加载、表单结果或弹层控件就绪后继续。
- reusable chain boundary: 有界只读条件等待，不重复触发业务动作。
- runtime inputs: 技术 CSS selector；无时间或审计参数由 LLM 填写。
- dynamic task outputs: 本次条件成立事实。
- generic platform capability used: 原生 CSS/Element.checkVisibility、StepVerifier/Tenacity。
- replay model calls: 0。
- site/task-specific code added: no。

Reuse Assessment:
- capability: 等待当前 DOM 可见条件。
- existing implementation in repository: postconditions.declared_checks/verify_declared、TargetResolver、R3b 工具采集/编译模式。
- mature candidates and pinned versions: browser-use 0.13.8、workflow-use StepVerifier、Tenacity 9.1.2。
- selected implementation: 沿用以上能力；已核验 Page 没有直接 wait_for_selector 公开方法。
- reused public surface: Tools.action、Page.get_elements_by_css_selector、Element.evaluate 固定原生只读谓词；verify_declared 重查事实。
- B-A-T-owned adapter and remaining gap: 工具注册、来源和编译映射；原任务真实 ready selector 待正式探索验证。
- license/runtime/platform fit: 无新库/安装，沿现有进程；Windows 未验。
- browser/runtime/state ownership conflicts: 一个 Browser，原生 Agent 唯一探索 loop，LangGraph 唯一调度；不手写轮询或 scheduler。
- replay model calls: 0。
- rejected candidates and evidence: 原生 wait 的固定延时不表达完成条件；现有 URL/title changed 不能证明列表已刷新。
- focused validation: 大于 3 秒的真实异步 ready、从不 ready、取消与后续停止、完整生产接线。

## 所有权与开始门

你是全新 Sol/high 空白上下文子 agent，只拥有本职责。不是唯一执行者，不回退别人改动。R3b 正在对共享文件做最终验证：**主 agent 明确通知释放前，只能读共享源码、编写新 `hybrid/visible_wait.py` 和 /private/tmp 临时 probe；不能修改共享文件、manifest、运行 Browser 或生产入口。** 新文件暂不 import 到生产，不影响 R3b 的 manifest 校验。先完成核心工具与派发理解，报告准备就绪。

门释放后允许修改：hybrid/{author,capture,registry,natural_compile,natural_facts,capability,postconditions,evidence,coverage}.py；新 visible_wait.py；需要遵守 500 行上限时可把本项采集或纯编译函数放独立 visible_wait_compile.py，不搬动别人的实现。宿主只改 upstream-browser/{hybrid-schema,hybrid-protocol,hybrid-natural-payload}.ts 的现有枚举/证据集合。不改需求/plan/source、测试、manifest/source.json、总计划。主 agent 统一审查和登记摘要，不绕过登记门。

## 实现决定

1. 输入只有 `selector: nonempty string <=2000`，CSS 由浏览器解析；无 model-provided timeout、JS、页身份、摘要、预期文本。成功给 LLM 固定一句 `Condition is ready.`，失败固定可行动错误，内部证据不输出给模型。
2. 新增 Postcondition kind `target_visible`：通过同一 TargetResolver 唯一 CSS 目标和固定 checkVisibility/checkConnected 读取 'true'/'false'；目标暂时不存在/隐藏是等待未满足，不能认为异常后重触发动作；多义不能偷偷选择一个。复用 verify_declared 与现有 SettlePolicy（maxMs=30000/maxAttempts=100/intervalMs=300），不得另写 sleep/while/retry。
3. 工具只等待，无 click/input/navigation。进入时抓当前 targetId+URL，等待读取每轮保持同页约束；成功前后核验当前页。取消必须向外传播，不能 catch BaseException；超时给明确固定失败。页面漂移不能产生成功证据。
4. 注册 effect=read，在线/offline author_tools 与 OrdinaryCapability 共用同一注册函数。记录当次成功参数/页身份/结果；复用现有按 action 固定起始位置消费记录模式。collector 生成 value_fact，compiler 校验当前 action/result、参数、唯一记录、前后页身份；新 fact 加入 Python/TS 既有摘要集合，不新增校验器。
5. natural compile 生成现有 browser.workflow-step v2 actionName=bat_wait_for，target=同一 CSS+当前既有 scope，selector 参数走现有 natural_binding/native_parameter；postcondition target_visible='true'。OrdinaryCapability 校验 target/selector 一致并核验 scope，通过同一 Tools.act 执行一次工具。普通动作没有模型。
6. 超时/缺目标是只读探查失败：只有 registry 参数合法、effect=read、failed、有 resultRef 且没有成功 fact 时，才可用明确 `failed_bat_wait_probe/v1` 排除；独立 coverage 重验同条件。不能扩展到点击/输入失败，不删除来源动作。
7. author guidance 说明：异步操作后用实际业务 ready 信号的 selector 等待；不要用固定秒数、URL/title 变化证明数据已刷新。若没有可靠信号，保留未证明的缺口，不杜撰保证。工具只解决机制，实际 selector 正确性由原任务业务验收检查。
8. 最小成本：复用现有记录/绑定/校验/StepVerifier模式，不新增平台节点、表达式语言、工作流框架；保持函数<=100行/文件<=500行。遇已有文件即将超限，只提取本项的薄函数，不大规模重构。

## 验收与交付

所有命令 workdir=checkout 根，Python 用既有 work/upstream-browser-hybrid/.venv/bin/python；禁 uv、安装、provider/原网站、测试文件变更、全量测试、分支/worktree/commit/push。静态检查只覆盖修改文件；不重复 R3b 的基线组。

获得 Browser 名额后使用一个真实 localhost Chromium probe、独立临时 Profile、finally 关闭 Browser/server、禁 telemetry/cloud sync。用页面真实 JS 异步改变：页面标题/URL或外部标记先改变但 ready 元素延后 >3秒出现，必须等元素后才成功；永不 ready 明确超时（可在临时 probe 用注入的短 SettlePolicy 验证同一 verify_declared，不向 LLM 暴露预算字段）；取消后不再检查；重复目标拒绝；漂移拒绝。采集→编译→TS 物化→普通 Runner 要走现有生产入口，modelCalls=0，编译动作/工具实际参与。需临时固定脚本模型，不伪称真实 provider。

主 agent 登记 manifest 后执行完整入口；源码需再改时通知我同步，不绕过 gate。交付 R4_VISIBLE_WAIT.md、实际 session UUID、改动清单、命令/日志、失败修复和未测边界。完成待主验收后归档回收，不承接无关任务。
