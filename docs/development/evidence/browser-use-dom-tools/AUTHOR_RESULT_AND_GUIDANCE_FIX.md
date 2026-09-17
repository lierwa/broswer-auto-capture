# Author 结果保留与字段读取指导修复

## Product Alignment

- natural-language task: 保存可审查的任务产物诊断，并让自然任务正确采集页面输出字段。
- reusable chain boundary: 仅调整原生 author 入口对既有结构化输出的保留条件与通用 Agent 指导。
- runtime inputs: 既有自然任务、输入/输出 Schema 与原生 Agent history。
- dynamic task outputs: 仅保留通过既有 output model 和 outputSchema 校验的实际输出。
- generic platform capability used: 既有 `bat_read_fields`、`bat_summarize`、原生 `done` 与编译 gate。
- replay model calls: 不变；复跑仍只允许显式 LLM 节点调用模型。
- site/task-specific code added: no

## 不变量

- judge 拒绝时 `sourceValidated` 与 `trace.judged` 仍为 `false`；源码中的
  `successful_judged_business_result_required` gate（任务描述所称 judged source gate）不放宽。
- 未完成、运行异常或不符合既有输出合同的结构化结果仍不保存。
- 不保存原始 history、截图、异常正文或 judge 正文，不新增响应字段或顶级 LLM 参数。
- 不替换原生 Agent loop，不新增 repair loop。

## 定点验证

- `python3 -m py_compile vendor/workflow-use/workflows/workflow_use/hybrid/author.py`：通过。
- `work/upstream-browser-hybrid/.venv/bin/ruff check vendor/workflow-use/workflows/workflow_use/hybrid/author.py`：通过。
- `/private/tmp/verify_author_result_guidance.py` 无 Browser/provider harness：通过。
  - native 执行成功、judge 拒绝且结构化输出符合合同：保留实际 output；`sourceValidated=false`、
    `trace.judged=false`。
  - 未完成或 native 运行异常：`output=null`，且不读取结构化输出。
  - 结构化输出不符合 outputSchema：`output=null`，保留 `business_output_schema_not_proven` gap。
  - 使用真实 `compile_natural_request` 核验：即使 completed 且 finalResultRef 存在，`judged=false`
    仍产生 `successful_judged_business_result_required`，编译保持拒绝。
- 该 harness 是入口判定的无 Browser 定点验证，不是浏览器验收。
