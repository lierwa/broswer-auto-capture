# R5a 局部字段读取工具实施证据

日期：2026-09-16。结论：R5a 局部工具已实现并通过 localhost 真实 Chromium 定点验收；这不代表 R5、生产注册接线或原任务通过。

## 执行身份与范围

- agent task：`/root/r5_scoped_field_tool`
- session id：`01a0aacd-fcff-7070-9154-b22124a2c3eb`
- 主 agent 已核验实际 turn context：`gpt-5.6-sol` / `high`
- 仅改动 `hybrid/read.py`、新增 `hybrid/field_read_tool.py`、移除 TypeScript `readSpecificationSchema.maxInputBytes` 的 128000 上限，并写本文。
- 未改测试、author、capture、history、natural_compile、natural_reads、生产工具注册或输出合同；未安装、提交、创建分支/worktree，未调用 provider。

## 实现结果

- `read_fields` 对每个容器执行固定只读 `Element.evaluate` 投影；selector、multiple 和 maxValues 通过函数参数传入，不接受任意脚本。
- 浏览器原生 CSS 选择器只返回所选字段节点的局部片段。文本字段返回命中节点 `outerHTML`；attribute 字段对命中节点做无子树浅克隆并只保留请求属性，避免容器自身命中时带回整棵子树或无关属性。单值最多投影 2 个，多值最多投影 `maxValues + 1` 个，以便歧义和超限明确失败；容器自身匹配仍保留，缺属性继续由 `read_value` 返回 `read_field_not_text`。
- 投影结果对象使用 `Object.create(null)`；字段配置以 entry 数组跨 CDP 传递，字段名是普通字符串值，不会在参数或结果侧触发 `__proto__` 等原型赋值语义。旧 `read_field(scope, field)` 整容器解析 helper 已无调用并删除，保留共用 `read_value`，没有双读取实现。
- 字段片段继续交给 BeautifulSoup 和既有 `read_value` 做文本、attribute 和类型转换。预算只累计选中字段片段；调用方显式正整数预算仍保留，128000 硬上限已从 Python/TypeScript ReadSpec 边界删除。
- `register_field_read_tool(tools, *, output_schema)` 只通过 `Tools.action(param_model=...)` 注册 `bat_read_fields`。工具复用 `validate_proposal`、`current_page/page_identity` 和 `read_fields_with_proof`，核验输出路径、页面/容器身份和两次读取一致性。
- 成功记录只在所有验证通过后追加，包含 mapping、实际 output、页面 identity 和容器 digest；不提前生成 actionRef/resultDigest，不持久化 HTML 或页面值。失败返回固定错误码且不追加记录。

## 验证

静态检查：

```text
work/upstream-browser-hybrid/.venv/bin/python -m py_compile vendor/workflow-use/workflows/workflow_use/hybrid/read.py vendor/workflow-use/workflows/workflow_use/hybrid/field_read_tool.py
=> exit 0

work/upstream-browser-hybrid/.venv/bin/ruff check vendor/workflow-use/workflows/workflow_use/hybrid/read.py vendor/workflow-use/workflows/workflow_use/hybrid/field_read_tool.py
=> All checks passed!
```

完整探针保留在 `/private/tmp/r5a_field_read_probe.py`。第一轮脱敏输出保留在 `/private/tmp/r5a_field_read_probe_initial.log`，根属性修正后的完整输出保留在 `/private/tmp/r5a_field_read_probe.log`。探针只绑定 `127.0.0.1`，使用一个独立临时 Profile 和一个 Chromium，通过真实 `Tools.act` 调用 `bat_read_fields`，并在 `finally` 关闭 Browser/server。初次沙箱运行在 localhost bind 处得到 `PermissionError: [Errno 1] Operation not permitted`；按任务说明对同一命令升级后运行。根属性修正后的原始脱敏摘要：

```json
{"ambiguousFailure":"ambiguous_or_missing_read_field","ambiguousSuccessRecords":0,"badPathFailure":"natural_read_output_path_invalid","badPathSuccessRecords":0,"budgetFailure":"read_input_limit","budgetSuccessRecords":0,"changedReadSucceeded":true,"changedValueObserved":true,"containerSelfAttributeMatched":true,"explicitBudgetOver128000Parsed":true,"fixtureBytesOver128000":true,"identityEvidenceKind":"substitute-over-real-local-page","identitySubstituteFailure":"natural_read_page_identity_changed","identitySubstituteSuccessRecords":0,"initialReadSucceeded":true,"initialShapeMatched":true,"localhostOnly":true,"missingAttributeFailure":"read_field_not_text","missingAttributeSuccessRecords":0,"missingFailure":"ambiguous_or_missing_read_field","missingSuccessRecords":0}
```

该证据证明：页面及选定容器含超过 128000 字节无关内容时，少量 text/attribute/multiple 字段可读；2 KB 字段预算下读取同一大容器自身的 data attribute 成功，证明 attribute 投影未带回 140 KB 子树；缺属性明确返回 `read_field_not_text` 且不留成功记录。同结构内容变化后独立工具运行得到新值；单值缺失、单值歧义、字段片段预算不足和错误输出路径均失败且成功记录为 0；大于 128000 的显式预算可解析。页面 identity 变化使用真实 localhost Page 外包一层身份替身触发既有 helper 拒绝，属于替身诊断，不称为真实导航竞态证据。

最终另用 `/private/tmp/r5a_field_projection_edge_probe.py` 聚焦验证大容器自身属性和字段名 `__proto__`，脱敏输出在 `/private/tmp/r5a_field_projection_edge_probe.log`。第一轮暴露 CDP 参数把字段 mapping 还原成普通 JS 对象时已丢失 `__proto__`，固定错误码为 `read_field_projection_invalid`；修正为 entry 数组参数后只重跑该反例，最终摘要：

```json
{"failureCode":null,"fieldBudgetBytes":300,"fixtureBytesOver128000":true,"protoFieldNamePreserved":true,"rootAttributeReadSucceeded":true,"successRecords":1}
```

该最终反例使用当前实现，140 KB 大容器在 300 字节字段预算下成功读取根属性，保留 `__proto__` 字段名且只追加 1 条成功记录。按主 agent 的定点验收要求，entry 数组修正后没有重复整套真实探针；上方完整摘要来自该修正前的紧邻实现，最终实现的新增参数形态由此聚焦反例覆盖。

现有最小 unittest 按派发只运行一次：

```text
ANONYMIZED_TELEMETRY=false PYTHONPATH=apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests work/upstream-browser-hybrid/.venv/bin/python -m unittest vendor/workflow-use/workflows/tests/test_hybrid_read.py
=> FAILED (failures=2, errors=1)
```

失败均来自旧 mock 固定把 `Element.evaluate` 当作无参数、整容器 HTML 返回：新固定投影会传字段参数并期望 JSON 字段片段，因此分别出现 `read_field_projection_failed`，以及旧 side effect 只接受一个参数。按派发不改断言、不新增生产回退。任务开始时曾误用同一指定解释器尝试 pytest，得到 `No module named pytest`；未安装，也未换解释器冒充验证。

一次只读 Tools API 探查在设置遥测开关前实例化了 `Tools()`，browser-use 尝试访问 `eu.i.posthog.com`，被沙箱拒绝且没有成功外部请求；后续静态命令和真实探针均显式设置 `ANONYMIZED_TELEMETRY=false`，真实探针只访问 localhost。

## 未完成边界

- 尚未接入生产 author/capture/compile 或原生 Agent loop，也未替换旧 whole-page annotation。
- 尚未解决一次 extract 的复合输出与执行报告装配。
- 没有运行 provider、正式原任务、样本复跑或换输入整链验收；R5 仍未完成。
