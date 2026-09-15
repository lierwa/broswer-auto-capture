# workflow-use 本地补丁与兼容门证据：2026-09-15

## 结论

**阶段 4、阶段 5 通过；允许进入 B-A-T 本地产品接线。** 固定上游
workflow-use `0.2.11 @ 5d2d19f` 在应用两份独立补丁后，能够把已经通过
browser-use success/judge 的 history 转为 workflow，并由官方
`Workflow.run_with_no_ai()` 完成样本与不同 primitive 输入复跑。

本结论只接受本地集成。workflow-use 为 AGPL-3.0；任何分发或网络服务交付仍需
单独完成 Corresponding Source、版权告知和第 13 条适用性决策。Windows 进程与
安装兼容也仍未验证。

## 补丁系列

补丁维护在 [`patches/workflow-use`](../../../../patches/workflow-use/README.md)，
按编号应用：

1. `0001-escape-workflow-prompt-variable-placeholders.patch`
   - 修复 prompt 中两处未转义 `{variable}` 导致的 `KeyError`；
   - 增加不导入 Browser、不调用模型的 prompt 格式化回归测试。
2. `0002-dispatch-page-extraction-steps.patch`
   - 将 schema 合法的 `PageExtractionStep` 规范化为现有 `ExtractStep` 执行；
   - 保留 description、output 等公共 step 元数据；
   - 增加隔离 async dispatch 回归测试。

两份补丁均以固定 commit 的全新源码副本执行了：

```text
git apply --check -> git apply -> focused tests -> Ruff check/format -> git apply -R --check
```

没有创建分支/worktree，没有提交或推送上游，也没有在 B-A-T 中实现替代
converter、executor、选择器或 workflow runtime。

## 阶段 4：采集类本地任务

来源 history 已满足：

- `history.is_successful() is True`；
- `history.is_validated() is True`；
- 序列化前后 action 数据逐项一致。

补丁后公开生成入口产出：

```text
navigation -> click -> extract_page_content
```

workflow 参数为 `start_url: string`。同一 Browser 会话中的两次官方 executor
运行结果：

| 输入 | 原始 extraction | output model |
| --- | --- | --- |
| 本地根 URL | AI-powered，无 fallback/error | `Aster / 7.4` |
| 不同 URL `/second` | AI-powered，无 fallback/error | `Beryl / 8.2` |

模型用途按真实调用分开记录：workflow generation 1 次、extract 2 次、output
conversion 2 次。`run_with_no_ai` 只表示不用 Agent 找路，不能在 B-A-T 中宣称
整个复跑零模型调用。

## 阶段 5：非采集任务

本地任务要求填写 Draft note、点击 Preview draft，并禁止点击 Submit draft。
browser-use 首次执行返回：

```json
{"draft_text":"Alpha local draft","preview_visible":true,"submitted":false}
```

history success/judge 均为 true。生成 workflow 为：

```text
navigation -> input -> click -> extract_page_content
```

它分别参数化 `start_url` 和 `draft_text`。同一 Browser 会话先用
`Alpha local draft`，再用 `Beta revised draft` 复跑；原始 extraction 与 output
model 均反映对应文本，且两次 `submitted=false`，没有 fallback/error。

该结果证明 workflow-use 没有把 B-A-T 限定成采集系统。本文件的 `result.json`
保留阶段 4–5 当时的兼容门快照；随后完成的产品 `verified` 证据见
[产品接线验收](../workflow-use-product-2026-09-15/README.md)。

## PR 质量验证

```text
prompt regression: red KeyError('variable') -> green
page extraction dispatch: red Unsupported step type -> green
Ruff check: All checks passed
Ruff format --check: 3 files already formatted
fresh-copy apply/reverse checks: passed for both patches
```

第二个测试导入当前上游 executor 时会触发 browser-use 配置初始化，所以命令显式
提供可写的 `BROWSER_USE_CONFIG_DIR`；测试本身不构造 Browser，也不访问网络或模型。

## 证据边界

- 完整 history、页面正文、模型响应和临时 Profile 只在被 Git 忽略的
  `work/upstream-replacement-2026-09-15/` 下保存。
- 跟踪的 [`result.json`](result.json) 只保留版本、digest、状态、调用用途和安全摘要。
- 两次 probe 的 Browser 均由最外层 `finally` 关闭；按 Profile 和调试端口检查无残留。
- workflow-use 的 ActionResult 对正常 navigation/click/extract 仍可能保留
  `success=null`。B-A-T 准入必须联合检查执行步数、error、extraction method、原始结果、
  output schema 和步骤完成标准，不能只看该字段。
