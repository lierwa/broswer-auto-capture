# 原生 input.text 参数保全派发

> **历史派发记录，已关闭。** 本文件不再授权或指示启动任务。当前只按 [清理账本](../../REPLAY_CLEANUP_20260917.md) 工作。

实施范围：hybrid/natural_facts.py 的原生参数判定、natural_compile.py 的target_value_condition；如确需，独立小helper；author.py只允许必要的redactor接线，不触碰正在修改的guidance。不改公共LLM字段/需求合同/原artifact。

主agent决定见BROWSER_REPLAY_REPAIR_PLAN最新“原生文字参数保全”节。固定搜索表达式是原生动作参数，不能再因它不是需求原文连续片段而丢失。输入绑定仍优先；只有input.text这一已明确的字段新增原生参数保全，不能开放所有字符串。原生参数要求实际字符串，拒绝现有脱敏占位符与browser-use敏感替换占位符；登录/验证码/一次性口令的原有人机停止边界保留。不得从历史摘要猜出原文字或修改历史gaps。

后态：保留已有target_value脱敏行为。若input/select文字预期是constant字符串，允许用已有脱敏表示 `<redacted:sha256>` 和digest(expected)相等证明值一致；原inputRef路径与明文原文片段匹配继续有效。错误digest/不同值/多义事实必须仍拒绝。摘要只能证明同值，不能用来恢复明文。

复用现有native_parameter / NaturalBindingFact / redactor / 原生input执行，无新增LLM字段、无新编译器/模板系统、无站点逻辑。实现前阅读现有自然入口绑定及目标值函数并记录Product Alignment。

最小验证只写/tmp诊断：通过真实production绑定、redactor、后态条件函数证明固定普通文字能保存/编译，运行input匹配仍为reference，脱敏占位符不能成为nativeconstant，后态不匹配拒绝。若需行为验证，用已有本地表单页面与普通执行器输入/读回一次，0模型单浏览器finallyclose；启动前确认root分配浏览器所有权。不得新增/修改repo测试或跑全量；不要扩大为任意派生输入转换。报告变更文件、定点结果、源摘要未改、已知边界。
