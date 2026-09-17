# R4 普通执行器的真实慢响应、超时和取消验收

日期：2026-09-16。由主 agent 直接执行验收；没有改生产代码或测试文件，没有 provider 调用。该记录只证明**已声明的完成条件**在普通执行器内确实被轮询，不证明自然编译已经能生成所有业务就绪条件。

## 真实路径和结果

localhost 页面按钮 → OrdinaryCapability.execute_checked → 原生 Tools.act 点击一次 → 既有 StepVerifier / Tenacity 多次真实读取 target_state。统计包装只计数真实读取，未返回预设状态。每个场景重新导航重置页面，使用同一独立临时 Chromium Profile；浏览器与 HTTP 服务在 finally 中关闭。

| 场景 | 实际结果 |
| --- | --- |
| 点击后 4.2 秒才设置 aria-expanded=true | 4.58 秒成功；18 次真实读取；点击 1 次 |
| 点击后始终不改变状态；验证预算 1200ms | 总动作耗时 1.928 秒，PostconditionNotMet；6 次读取；点击 1 次 |
| 开始等待后取消 | CancelledError 传播；再观察 500ms，读取次数保持 1→1，点击保持 1 次 |

1200ms 是验证阶段预算，不含此前原生点击及目标准备的耗时，不能把总动作 1.928 秒写成验证预算失效。成功条件依据受控页面的实际初始字段集合构造，没有冻结原网站数据。

## 可复核证据

- 临时脚本：`/private/tmp/r4_slow_runtime_probe.py`
- 实际输出：`/private/tmp/r4_slow_runtime_probe.log`，最后一行 `R4_RUNTIME_RESULT`
- 首次沙箱失败：`/private/tmp/r4_slow_runtime_probe.sandbox-failure.log`

命令，workdir 为当前 checkout 根目录：

```sh
PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false BROWSER_USE_SETUP_LOGGING=false work/upstream-browser-hybrid/.venv/bin/python /private/tmp/r4_slow_runtime_probe.py > /private/tmp/r4_slow_runtime_probe.log 2>&1
```

首次运行在绑定 localhost 时遭遇 sandbox PermissionError，尚未启动浏览器；保留失败日志后，以 require_escalated 执行同一受控脚本，自动审批通过，退出码 0。没有为验证安装依赖或访问外部页面。

## 未完成边界

这证明运行时有异步条件机制，且不会在轮询时重复点击。R4 仍需自然来源的正确条件接线：列表/容器 ready、标题变化与数据就绪的区分、等待后目标状态的实际采集。当前手工声明的受控页面条件不能当作原 Issues 编译成功、候选、样本或换输入证据。
