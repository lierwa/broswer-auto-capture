# 原生 `input.text` 参数保全

## Product Alignment

- natural-language task: 通用搜索筛选或普通表单文字输入。
- reusable chain boundary: 原生 `input` 动作及其目标值后置条件。
- runtime inputs: 与运行输入唯一匹配时继续绑定输入引用；否则普通固定文字保留为版本化常量。
- dynamic task outputs: 未修改；页面字段仍由既有正式读取链路产生。
- generic platform capability used: 既有 `NaturalBindingFact`、原生参数判定、redactor、`target_value` 事实与普通执行器输入。
- replay model calls: 0。
- site/task-specific code added: no。

## Reuse Assessment

- capability: 保存原生 `input.text` 的普通固定参数，并以脱敏后态证明实际输入值一致。
- existing implementation in repository: `binding_facts` 已先匹配运行输入再判定原生参数；`redactor` 已通过 `is_native_parameter` 决定动作值是否保留；`target_value_condition` 已处理输入引用与唯一事实。
- mature candidates and pinned versions: 继续使用锁定的 browser-use 0.13.8 与现有 workflow-use fork，不引入依赖。
- selected implementation: 只扩展 `input.text` 的原生参数判定；消费端复用同一判定拒绝伪造原生事实；既有目标值函数比较 `<redacted:sha256>` 与预期常量摘要。
- reused public surface: browser-use 原生 `input` 与 registry 执行路径；未调用或复制敏感替换私有方法。
- B-A-T-owned adapter and remaining gap: 只保存普通固定 `input.text`；运行输入引用仍优先；旧来源摘要不恢复明文。
- license/runtime/platform fit: 沿用现有锁定运行时，无新增库。
- browser/runtime/state ownership conflicts: 无新浏览器、模型、状态机或执行器。
- replay model calls: 0。
- rejected candidates and evidence: 不开放全部字符串。项目现有 redactor 生成精确 `<redacted:` 加 64 位 SHA-256 加 `>`；对锁定 browser-use 0.13.8 上游实现的 `inspect` 证据显示，其私有 `Registry._replace_sensitive_data` 使用正则 `r'<secret>(.*?)</secret>'`，并另有依赖运行时敏感映射的完整键名兼容替换。本实现未调用或复制该私有方法；事实函数没有敏感映射，因此只依据已证实格式拒绝可静态识别的标签形式，不猜测键名、登录、验证码或一次性口令。
- focused validation: `/tmp/input_text_preservation_probe.py` 直接调用生产 `binding_facts`、`is_native_parameter`、`binding_matches`、`redactor`、`evidence_sanitizer` 与 `target_value_condition`；不新增仓库测试，不启动浏览器或模型。

## 验证边界

- 普通固定 `input.text`（包括原生 schema 允许的空字符串）产生 `native_parameter` 常量绑定；同值的脱敏后态摘要可形成 `target_value` 条件。
- 与运行输入唯一匹配时仍产生 `runtime_input`，后态继续要求同一路径的 `inputRef`。
- 项目脱敏占位符、browser-use `<secret>...</secret>`、伪造的占位符原生事实、错误摘要、不同明文和歧义事实均不能通过。
- 未修改旧 source、成功/判定标记、需求合同、公共字段或 author guidance；当前 source manifest 由主 agent 统一维护。

## 定点结果

命令：

```sh
PYTHONPATH=vendor/workflow-use/workflows PYTHONDONTWRITEBYTECODE=1 ANONYMIZED_TELEMETRY=false BROWSER_USE_SETUP_LOGGING=false work/upstream-browser-hybrid/.venv/bin/python /tmp/input_text_preservation_probe.py
```

结果：通过。固定普通文字与空字符串成为原生常量；运行输入引用优先；生产 redactor 保留普通固定文字且隐藏敏感标签；生产 sanitizer 产生预期摘要；同值摘要和原 `inputRef` 通过；错误摘要、错误明文、双事实歧义及伪造占位符原生事实拒绝。
