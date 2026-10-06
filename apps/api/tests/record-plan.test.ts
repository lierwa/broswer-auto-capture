import assert from "node:assert/strict"
import test from "node:test"
import { resultSpecSchema, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { confirmedItemSteps, recordEntry, recordKey } from "../src/task-chain/record-plan.js"

const input: ValueSchema = { type: "object", properties: { amount: { type: "integer" }, memo: { type: "string" } },
  required: ["amount"], additionalProperties: false }
function step(schema = input) {
  return { id: "step", goal: "逐条填写运行参数", chain: { id: "77667601-abef-4513-9b5a-800b353d25b6", version: 1 },
    completion: [{ id: "completed", description: "本项完成", predicate: { operator: "exists",
      value: { source: "constant", value: true } } }],
    inputContract: { id: "input", version: 1, dialect: "bat-value-schema/v1", schema },
    outputContract: { id: "output", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } },
  } as unknown as TaskPlan["steps"][number]
}
test("逐项操作保留根参数合同，来源和单项使用同一参数，不向页面猜值", () => {
  const [source, item] = confirmedItemSteps(step(), "选择实际入口", 20)
  assert.deepEqual(source!.inputContract.schema, input)
  const output = source!.outputContract.schema
  assert.equal(output.type, "array")
  if (output.type !== "array" || output.items.type !== "object") throw Error("object_required")
  assert.deepEqual(output.items.properties.amount, input.properties.amount)
  assert.deepEqual(output.items.properties.memo, input.properties.memo)
  assert.deepEqual(output.items.required, ["amount", recordKey, recordEntry])
  assert.deepEqual(item!.inputContract.schema, output.items)
  assert.equal(item!.outputContract.schema.type, "null")
})

test("单项拆分保留结构化输出及既有 count 派生的来源关系", () => {
  const structured: ValueSchema = { type: "object", properties: {
    values: { type: "array", items: { type: "string" }, maxItems: 5 }, count: { type: "integer", minimum: 0 } },
    required: ["values", "count"], additionalProperties: false }
  const value = step()
  value.outputContract = { ...value.outputContract, schema: structured }
  value.resultSpec = resultSpecSchema.parse({ contractVersion: "bat-result-spec/v1", mode: "data", schema: structured,
    fields: [{ path: ["values"], description: "实际读取", producerRef: "records" },
      { path: ["count"], description: "实际数量", producerRef: "count" }],
    derivations: [{ producerRef: "count", operation: "count", sourceProducerRef: "records", sourcePath: ["values"] }],
    edgeCases: [] })
  const [, item] = confirmedItemSteps(value, "选择实际入口", 5)
  assert.deepEqual(resultSpecSchema.parse(item!.resultSpec), value.resultSpec)
})
test("根参数与保留身份键冲突时明确拒绝，不能默默覆盖用户参数", () => {
  assert.throws(() => confirmedItemSteps(step({ ...input, properties: { [recordEntry]: { type: "string" } } }), "选择"),
    /record_input_reserved_key_collision/)
})
