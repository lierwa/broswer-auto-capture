# R5d 最小字段读取接口交付记录

## 交付结论

`bat_read_fields` 的模型可见参数已收敛为 `outputPath`、`container`、`fields`。`fields` 每项只包含
`selector` 和可选 `attribute`。`outputSchema`、`valueType`、`multiple`、`maxItems`、`maxValues`、
`maxInputBytes` 和 `readPath` 不再由模型重复填写；程序从已确认的输出合同展开为既有
`FieldReadMapping` / `ReadSpec`。

新接口不增加整页 HTML、任意字节上限或静默截断。未指定 `maxInputBytes` 时不额外执行字段字节拒绝；
旧调用方显式传入预算时，仍按所选字段的 UTF-8 字节数执行 `read_input_limit`，其 canonical 序列化保持不变。

## 最终生产文件

1. `vendor/workflow-use/workflows/workflow_use/hybrid/field_read_params.py`
2. `vendor/workflow-use/workflows/workflow_use/hybrid/read.py`
3. `vendor/workflow-use/workflows/workflow_use/hybrid/field_read_tool.py`
4. `vendor/workflow-use/workflows/workflow_use/hybrid/field_read_evidence.py`
5. `vendor/workflow-use/workflows/workflow_use/hybrid/natural_facts.py`
6. `vendor/workflow-use/workflows/workflow_use/hybrid/natural_reads.py`
7. `vendor/workflow-use/workflows/workflow_use/hybrid/author.py`
8. `apps/api/src/upstream-browser/hybrid-schema.ts`

## 关键不变量

- 对象读取固定 `maxItems=1`；对象数组使用合同 `maxItems`，并受既有 `ReadSpec` 300 上限约束。
- 标量和标量数组使用内部 `value` 包装及 `readPath=["value"]`，没有新增读取语义。
- 多值字段使用合同 `maxItems`；合同未声明时使用既有 `maxValues=300`，读取第 301 个值时明确报错，
  不截断为 300 个值。
- 数字路径继续使用既有 `schema_at_path` 语义，例如 `pages[0].issues`；没有增加另一套路径语言。
- `FieldReadRecord` 同时保存实际最小参数和展开后的 mapping。collector 校验原始 action 参数、固定位置 record、
  展开 mapping 与实际结果；编译时再次用 `action.args` 和权威输出合同展开并比对已验证 mapping。
- 上述专属一致性检查只作用于 `bat_read_fields`。旧 `extract` / proposal 分支继续使用原有
  `validate_proposal` 语义，合法的显式 `maxInputBytes` 不会因新最小接口被拒绝。
- `browserCommands` 不统计 `done` 与 `bat_summarize`；摘要使用独立模型审计，不计为 Browser 动作。

## 已完成证据

API 定点检查通过：

```text
npm run check --workspace @browser-capture/api
> tsc --noEmit
exit 0
```

临时纯探针 `/private/tmp/r5d_field_read_params_probe.py` 通过：

```text
PASS minimal params, derived mapping, evidence binding, and optional/explicit byte budgets
exit 0
```

该探针覆盖：模型 registry 三字段、字段项两字段、对象/对象数组/标量/标量数组展开、嵌套数字路径、
required 与 optional 字段、无 `maxItems` 多值字段的 300 上限、原参数与 record/mapping/result 绑定、
缺省字节预算，以及旧显式 128000 预算的 canonical digest 和运行拒绝语义。

## 尚待证据

本项没有启动真实 Browser，也没有单独宣称完整 TaskChainRuntime 已通过。真实 Chromium 的 object、scalar/array、
错误路径，以及原任务从来源读取到 TaskChainRuntime summary 的联合验收，由 R5c 使用唯一 Browser 槽位执行；
联合结果完成前，本记录只证明代码接线、schema/type check 与脚本模型行为。

## 联合验收追加（主 agent）

R5c 已完成联合真实Browser→源编译→同一TaskChainRuntime两入口复跑。root检查 /private/tmp/r5_combined_pipeline_probe.json 与完整脚本；三字段读取object-array（含无maxItems的labels）及scalar均返回当前页面值，摘要动态、每次1显式LLM。见 R5_SUMMARY_OUTPUT.md；未单独启动第二份Browser验证。原网站与provider仍待主线。
