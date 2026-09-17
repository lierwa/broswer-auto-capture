# 原任务正式验收执行（2026-09-17）

> **已停止／历史记录（2026-09-17 清理决定）。本文件不再授权或指示启动任务。** 当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 清理。

目标：原 requirement v2 / plan v6 经正式 HTTP 生成候选，持久化后做 sample；再加载同一可执行链做有意义的不同 startUrl 验证。不得改原合同或手填来源。root 判定生产修复，执行者只负责真实运行、保留证据和汇报，不自行改生产源码。

前置已过：R3c 同一真实 TaskChainRuntime 换入口；R5c/R5d 真实取数与摘要同链两入口。当前 sourceDigest=07f5141c1cc5cba0e735d3b1c3d53068b12a7da64f5f3f769182b42674bb20e6，verifyForkSource/setup --check通过。局部模型为脚本，不是本次provider/原网站证明。

## 唯一执行方式

1. 阅读 `apps/api/tests/fixtures/mainline-natural-probe.ts`。它读取原库 readonly/query_only，隔离应用位于 `work/natural-task-validation/<uuid>`，使用现有共享模型配置、原需求/计划，通过正式 generate_task_chains 自动候选保存及 sample。
2. 已发现临时探针自身 `waitForInactive` 将等待硬限30秒，可能中断原任务合法sample。禁止改tests文件；在 `/private/tmp` 创建 `.mts` 副本，只改：root=`process.cwd()`；imports解析到当前checkout明确绝对源码/依赖入口（不读node_modules）；waitForInactive的`Math.min(timeoutMs,30_000)`改为`timeoutMs`。其余代码、原输入和合同保持。副本差异由root查看再放行。
3. 一次source运行；环境 `ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false BAT_UPSTREAM_BROWSER_HEADLESS=true`，既有 `node --import tsx`，所有命令workdir为当前checkout。stdout/stderr仅保存在`/private/tmp/mainline-with-lifecycle.log`，不展示凭证/Profile。localhost/网络sandbox拒绝时按原命令请求escalated。
   完整命令（必须包含 `--run`）：`ANONYMIZED_TELEMETRY=false BROWSER_USE_CLOUD_SYNC=false BROWSER_USE_SETUP_LOGGING=false BAT_UPSTREAM_BROWSER_HEADLESS=true node --import tsx /private/tmp/mainline-natural-probe.mts --run > /private/tmp/mainline-with-lifecycle.log 2>&1`。缺少 `--run` 会在创建 run/应用前拒绝；启动参数修正不计为新的 source。
4. 唯一Browser槽位由root释放；应用/Browser终于finally关闭。登录/验证码/限制真实报告，不绕过、不停止用户浏览器。
5. 探针exit0只证明source accepted/judged/closed，必须独立检查candidate、sample execution/run、输出及模型审计。失败保留隔离DB和source，不再次重跑source；先根因定位，由root派修。
6. sample通过后同一隔离库加载同一候选，正式validate_plan verification换有意义startUrl；root再给具体输入/命令。禁止重新生成候选冒充复跑。现有 `/private/tmp/bat-mainline-verify.mjs` 可供root审查后使用。

## 原来源身份

- task: 79b4e6a3-b500-4d52-98c7-f9370638675e
- requirement: 3960924a-335c-4fe3-81b9-19f8add50473 v2
- plan: e84c7660-21f6-44ac-87af-1826450c9e45 v6
- input: {startUrl:"https://github.com/langchain-ai/langgraph"}
- 原source SHA256: 8c96822da18516dc367b91600869a0ba3ece1b56010964dd1a2b934707ed9aaa
- 原history SHA256: 9fbc88645c29c65155e2e235727d318f7a70e1e1accceda76eacda580197b69a

不得创建branch/worktree、提交/推送、安装、读node_modules、改测试、跑全量或根级验证、改原schema/plan。新独立agent固定Sol/high，root读取其turn_context核验。一个职责收尾后归档回收。

当前加入的source-lifecycle-diagnostics仅保存安全阶段元数据，不是source或完成证据。实际RunnerProcess→Python DiagnosticChannel→宿主writer已验证执行中落盘、取消保留与进程退出；原脚本/预算/模型/合同不变。
