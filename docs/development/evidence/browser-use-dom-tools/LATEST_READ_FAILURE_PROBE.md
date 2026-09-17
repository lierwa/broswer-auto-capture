# 原始 `bat_read_fields` 失败分层探针

日期：2026-09-17

## 结论

本次只重放
`work/natural-task-validation/30db3c05-a8e9-47b5-907f-9e19d5ba1e80/source-result.json`
中 `sources[0].result.request.trace.actions` 的 8 个原始 `bat_read_fields` 参数，并用同一页面、同一浏览器会话执行已知可读 5 条的 selectors 对照。没有运行正式 source，也没有修实现。

8 次失败并非同一种错误：第 1、2、4 次先在容器数量预算层失败；第 3 次在容器 CSS 查询层失败；第 5 至 8 次才进入字段读取层。`capture.after_step.resultRef` 的相同摘要没有被用于推断错误内容。

## 反馈修复实施前对齐

Product Alignment:
- natural-language task: let the first exploration agent correct a failed deterministic field read from bounded, sanitized feedback.
- reusable chain boundary: only enrich errors returned by the existing `bat_read_fields` exploration tool and its generic author guidance; the persisted `TaskChain`, replay runtime, tool parameters, and output contract stay unchanged.
- runtime inputs: unchanged; `outputPath`, `container`, and `fields` remain the only model-provided field-read arguments.
- dynamic task outputs: unchanged; only a successful schema-validated read can create output evidence.
- generic platform capability used: contract-derived cardinality plus browser-native CSS matching and scoped collection lookup.
- replay model calls: 0.
- site/task-specific code added: no.

Reuse Assessment:
- capability: classify container overflow, field-selector syntax failure, and container-location failure without exposing page content or raw exceptions.
- existing implementation in repository: `ReadSpec`, `read_fields`, `FieldReadError`, `bat_read_fields`, and contract-derived `FieldReadMapping` already own the read and feedback path.
- mature candidates and pinned versions: the pinned browser-use element/page public APIs and the browser DOM's native `matches` / `querySelectorAll` CSS parser.
- selected implementation: reuse the native CSS parser's `SyntaxError` classification inside the existing fixed projection; keep collection-query failures generic unless the current public API independently identifies selector syntax.
- reused public surface: `Element.evaluate`, `Page.get_elements_by_css_selector`, the existing field-read action registration, and the confirmed target JSON Schema.
- B-A-T-owned adapter and remaining gap: translate only the known native outcomes into fixed `FieldReadError` fields, and derive `contractMaxItems` from the target schema without adding a model parameter.
- license/runtime/platform fit: unchanged pinned upstream runtime and existing browser session owner; no dependency or install change.
- browser/runtime/state ownership conflicts: none; validation uses one browser session and the read remains side-effect free.
- replay model calls: 0.
- rejected candidates and evidence: a second CSS parser is rejected because it could disagree with the executing browser; returning raw DOM/CDP exceptions is rejected because it leaks unstable implementation detail; treating every collection exception as invalid CSS is rejected because identity and session failures must retain their existing semantics.
- focused validation: one model-free browser session will check contract overflow, one invalid field selector, one missing single field, and the known five-record successful read, then close in `finally`.

## 运行边界

- 脚本：`/private/tmp/bat-original-read-failure-probe.py`
- 原始 JSON：`/private/tmp/bat-original-read-failure-probe.json`
- schema：`/private/tmp/bat-current-plan-v6.json:steps[0].outputContract.schema`
- 页面：`https://github.com/langchain-ai/langgraph/issues?q=state%3Aclosed%20label%3Abug%20sort%3Aupdated-desc`
- 命令：在当前 checkout 根目录设置 `BAT_REPO_ROOT`，执行 `work/upstream-browser-hybrid/.venv/bin/python /private/tmp/bat-original-read-failure-probe.py`
- 结果：`stage=completed`、`sourceActionCount=8`、`browserStartCount=1`、`browserClosed=true`、`modelCalls=0`

完整原参数逐字保存在 JSON 的 `originalCalls[*].args`；以下只列决定失败层次的 selector 和实际结果。

| 次序 | 原 container | 命中数 | 生产工具实际错误 | 首个实际失败字段 | 定位 |
|---:|---|---:|---|---|---|
| 1 | `li[role="listitem"]:nth-child(-n+5)` | 25 | `read_item_limit` | 未执行 | 容器数量先超过展开后的 `maxItems=5`。对首行单独检查时，`number` 的 `> span:last-of-type` 还是非法 leading combinator，但不是本次生产调用首先返回的错误。 |
| 2 | `li[role="listitem"]:nth-child(-n+5)` | 25 | `read_item_limit` | 未执行 | 同样先停在容器数量层；首行反事实检查中 `number` 命中 0。 |
| 3 | `#8723 > li:nth-child(-n+5)` | 查询失败 | `bat_read_fields_failed` | 未执行 | 公开 CSS 查询返回 `DOM Error while querying`；未转义的数字开头 id token 在容器 selector 层非法。 |
| 4 | `ul[role="list"] li[role="listitem"]:nth-of-type(-n+5)` | 25 | `read_item_limit` | 未执行 | 后代 `li` 各自在独立 `div` wrapper 内，`:nth-of-type(-n+5)` 没有限制列表总量。 |
| 5 | `ul[role="list"] > :nth-child(-n+5) li[role="listitem"]` | 5 | `ambiguous_or_missing_read_field: field="updatedAt"; matchCount=2; reason=expected_exactly_one_match` | `updatedAt` | 前序单值字段均唯一；`labels` 是多值字段，命中 0 不触发该错误；`relative-time` 命中 2。 |
| 6 | 同上 | 5 | `ambiguous_or_missing_read_field: field="number"; matchCount=0; reason=expected_exactly_one_match` | `number` | `:scope > span` 假设字段是 `li` 直接子节点，实际有 wrapper。 |
| 7 | 同上 | 5 | `ambiguous_or_missing_read_field: field="number"; matchCount=0; reason=expected_exactly_one_match` | `number` | `:scope > span:nth-of-type(3)` 同样跨不过 wrapper。 |
| 8 | `ul[role="list"] > :nth-child(1) li[role="listitem"]` | 1 | `ambiguous_or_missing_read_field: field="number"; matchCount=0; reason=expected_exactly_one_match` | `number` | 单对象容器基数正确；`:scope > span:nth-of-type(2)` 仍因 wrapper 层级命中 0。 |

## 五条成功对照

对照容器是：

```text
ul[role='list']:has(li[role='listitem'] h3 > a[href^='/langchain-ai/langgraph/issues/']) > div:nth-child(-n+5) li[role='listitem']
```

它命中 5 个容器，生产 `bat_read_fields` 返回 5 条、无错误。首个容器的字段命中数按 schema 顺序为：

- `number`: 1，`[data-testid='list-row-repo-name-and-number'] > span > span:first-child`
- `title`: 1，`h3 > a[href^='/langchain-ai/langgraph/issues/']`
- `labels`: 2，多值字段
- `updatedAt`: 1，`[data-testid='updated-at']`
- `detailUrl`: 1，与 `title` 使用同一链接 selector 并读取 `href`

只对这一行读取了有限 DOM 祖先链，没有读取全页 HTML。实际层级从行向上是
`li[role=listitem] <- div <- div <- ul[role=list]`；该 `ul` 有 25 个直接 `div` 子节点，每个 wrapper 内再包含 `li`。这解释了为什么第 1、2、4 次把每个 wrapper 内的首个 `li` 都选中，得到 25，而成功对照把 `nth-child(-n+5)` 放在 `ul` 的直接 `div` 子节点上，只得到 5。

## 验证与清理

- JSON 二次定点检查确认：8 个原调用均有 container 命中结果、生产工具实际错误和实际失败层；第 1、2、4 次的首字段明确记为未执行。
- `finally` 返回 `browserClosed=true`；运行结束后的进程列表中没有匹配本脚本或其 browser-use profile 的所属进程。
- 当前 agent 的实际 `turn_context` 位于 Codex session `rollout-2026-09-17T06-50-01-01a0ac69-abfd-7c12-8674-3dcc16783a0b.jsonl:8`，记录 `model=gpt-5.6-sol`、`effort=high`、`cwd=<当前 checkout 根目录>`。

本证据只完成 8 次局部读取失败的具体分层，不构成正式 source、TaskRun、TaskExecution 或业务输出验收。

## 反馈修复结果

局部实现只改动：

- `hybrid/read.py`：容器超量改为结构化 `FieldReadError`；字段 selector 复用浏览器原生 `matches` / `querySelectorAll` 的 `DOMException SyntaxError` 判定；已观察到的公开容器查询 DOM 错误映射为泛化的 `container_not_resolved`，其他异常继续向上保留。
- `hybrid/field_read_tool.py`：固定反馈允许容器定位错误，并从已确认的 target schema 派生 `contractMaxItems`；没有新增工具字段。
- `hybrid/author.py`：只补充通用局部 DOM 探查指导；没有站点、业务字段或样本 selector。

定点脚本 `/private/tmp/bat-field-read-feedback-acceptance.py` 使用原 schema，在一个浏览器会话内、0 模型调用下通过四项断言；原始结果在 `/private/tmp/bat-field-read-feedback-acceptance.json`：

- 原始超量 container：`read_item_limit: field="container"; matchCount=25; contractMaxItems=5; reason=exceeded_contract_max_items`
- 非法字段 CSS：`read_field_projection_failed: field="number"; reason=invalid_selector`
- 单值字段零命中：`ambiguous_or_missing_read_field: field="number"; matchCount=0; reason=expected_exactly_one_match`
- 已知成功对照：无错误并返回 5 条，成功记录审计数为 1

脚本结果为 `stage=completed`、`browserStartCount=1`、`browserClosed=true`、`modelCalls=0`。这仍是字段读取反馈的局部生产工具验收，不是正式 source 或完整业务验收。
