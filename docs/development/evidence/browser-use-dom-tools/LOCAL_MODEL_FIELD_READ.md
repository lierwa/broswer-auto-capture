# Terra medium 局部字段读取验证

## 结论

**未通过。** 本次独立局部验证只用于判断真实 `gpt-5.6-terra / medium` 能否在 20 个 Agent 步骤内自行发现 selector，并通过通用字段工具完成当前 GitHub 列表前 5 条读取；它不是原任务 source、sample 或 verification。

Agent 在第 17、18 步两次派发 `bat_read_fields`，两次均失败，真实字段读取成功次数为 **0**。随后第 19 步 `done` 返回 5 条符合根 schema 的数据，Agent source 和 Judge 都报告成功；但该输出没有任何 `verified_natural_read` 事实，编译结果为 `segments=[]`、`outputAssembly=null`，并保留 `natural_output_assembly_incomplete` gap。因此 `sourceSuccess=true` 和 `judged=true` 不能替代本项的字段读取验收，也不能据此写入 candidate。

## 运行边界

- 本地身份：`local_model_field_read`，run/owner `9c37ce25-94eb-4249-aec4-beb3a8d1ba77`
- 入口：直接调用现有 `withHybridAuthoring`
- 页面：`https://github.com/langchain-ai/langgraph/issues?q=state%3Aclosed%20label%3Abug%20sort%3Aupdated-desc`
- 模型：现有 AI Connect Codex 订阅，`gpt-5.6-terra / medium`
- 上限：单次运行，`maxSteps=20`；没有重跑、分页、登录、已知 selector 或样本答案
- fork manifest source digest：`dc9239489cb78b696a54f2512432cc69522108e02f21066f1e234b9465cf47e6`
- 运行前条件：root 已锁定上述 manifest，`setup --check` 通过，且没有其他 Browser owner
- 输出 schema：从原 plan 的 `steps[0].outputContract.schema.properties.pages.items.properties.issues` 只读派生；根只含必填 `issues` 且 `additionalProperties=false`

命令在仓库根目录执行：

```text
node --import tsx /private/tmp/local-model-field-read.mts --run
```

## 真实结果

进程退出码为 0，脚本 `failure=null`；这是探针与生命周期正常结束，不表示字段读取通过。

| 证据 | 结果 |
| --- | --- |
| `sourceSuccess` / `sourceValidated` / `trace.judged` | `true / true / true` |
| Browser commands | 18 |
| Agent / Judge 模型调用 | 19 / 1，共 20 次，均 completed；无 extract、semantic annotation 调用 |
| `bat_read_fields` 派发 | 2 次 failed，0 次 completed |
| verified natural read | 0 |
| compilation | 0 segments，`outputAssembly=null` |
| gaps | `natural_binding_evidence_missing:url`；`natural_output_assembly_incomplete` |

两次字段动作均由模型自行提出，均使用 `outputPath=["issues"]`。第 17 步 `a-0017` 与第 18 步 `a-0018` 的 trace status 都是 `failed`；生命周期也分别记录 `dispatch started -> failed`。两次 coverage 都标记为 `failed_bat_field_read_probe/v1`，且没有生成字段读取证明。第二次失败后，最后真实动作是第 19 步 `done`，动作本身 succeeded。规范化 trace 只保留失败结果引用，没有保留原始工具错误正文，因此现有证据能确定 selector 方案未通过字段工具，不能进一步断言是 container 数量还是某个字段 cardinality 失败。

`navigate` 动作中的 URL 被产品 redactor 记录为摘要，而不是保留为授权输入 `startUrl`。这说明动作值与原输入不完全相同；现有脱敏证据不能恢复差异，也不能证明模型精准导航到了完整输入 URL。

## 5 条输出的独立核对

以下核对只确认返回对象的内部字段，不把它们升级为页面字段读取证明。5 条标题均非空、编号唯一、详情链接与编号对应、labels 均包含 `bug`、更新时间字段均非空。由于没有成功字段读取和页面顺序证明，本表也不能证明这些对象确为当前第一页前 5 条或顺序符合页面。

| # | number | title | labels | updatedAt | detailUrl |
| --- | --- | --- | --- | --- | --- |
| 1 | 8616 | TypedDict values are rejected by type checkers for Store.put()/aput() despite being valid at runtime | bug, internal | 3w ago | https://github.com/langchain-ai/langgraph/issues/8616 |
| 2 | 8559 | Unecessary source parsing for subgraph detection dominates graph build time | bug, external | 1mo ago | https://github.com/langchain-ai/langgraph/issues/8559 |
| 3 | 8408 | Studio trace node details fail because incorrect run_id is requested (404) | bug, external | 13h ago | https://github.com/langchain-ai/langgraph/issues/8408 |
| 4 | 8384 | InMemorySaver silently and permanently drops the first write after migrating a channel to DeltaChannel | bug, external | on Aug 8 | https://github.com/langchain-ai/langgraph/issues/8384 |
| 5 | 8211 | with_structured_output is not supported when reasoning effort is used | bug, external | on Jun 30 | https://github.com/langchain-ai/langgraph/issues/8211 |

由于字段工具没有成功，这些 `updatedAt` 文本没有确定性 DOM 读取证明；而且结果没有保留 `Updated` 前缀，不能声称已经满足“保留页面可见 Updated 完整含义”。

## 产物与清理

- 脱敏摘要：`/private/tmp/bat-local-model-field-read-9c37ce25-94eb-4249-aec4-beb3a8d1ba77/sanitized-result.json`
- 完整产品脱敏 `HybridSourceResult`：`/private/tmp/bat-local-model-field-read-9c37ce25-94eb-4249-aec4-beb3a8d1ba77/hybrid-source-result.json`
- 固定字段生命周期诊断：`/private/tmp/bat-local-model-field-read-9c37ce25-94eb-4249-aec4-beb3a8d1ba77/source-lifecycle-diagnostics/9c37ce25-94eb-4249-aec4-beb3a8d1ba77.jsonl`

产物没有保存 raw Agent history、截图、凭据或模型 prompts。`withHybridAuthoring` 正常返回后才记录 `hybridCleanupConfirmed=true`；AI 已关闭，原 `aiSettings` 摘要和原 plan 文件摘要均未变化。结束后定点进程检查没有发现该诊断脚本、`browser_use_runner/main.py` 或本次 Browser profile 进程，`/private/tmp` 下也没有遗留 `bat-hybrid-owner-*` 临时目录。

主agent补核：实际开发turn_context为 Codex session `rollout-2026-09-17T07-11-14-01a0ac7d-17e5-74d0-bf01-54d12538d568.jsonl`，model=gpt-5.6-sol、effort=high。产物已主审，结论未通过，执行agent已正式归档。
