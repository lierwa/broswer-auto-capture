import assert from "node:assert/strict"
import test from "node:test"
import { runtimeOutputEnvelope } from "../src/task-chain/runtime-host.js"
import { hybridCapabilityOutput } from "../src/upstream-browser/hybrid-runtime.js"

test("显式 llm 的标量结果跨供应商对象根边界后保留严格动态类型", () => {
  const result = runtimeOutputEnvelope({ type: "string", enum: ["completed", "not_completed"] })
  assert.equal(result.jsonSchema.type, "object")
  assert.deepEqual(result.jsonSchema.required, ["value"])
  assert.equal(result.parse({ value: "completed" }), "completed")
  assert.throws(() => result.parse("completed"))
  assert.throws(() => result.parse({ value: "unknown" }))
  assert.throws(() => result.parse({ value: "completed", unrelated: true }))
})

test("普通浏览器动作的供应商回执不会污染 unit 节点输出", () => {
  const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "null" as const } }
  const record = { id: "record", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } }
  const receipt = { clicked: true }
  assert.equal(hybridCapabilityOutput(unit, receipt), null)
  assert.equal(hybridCapabilityOutput(record, receipt), receipt)
})
