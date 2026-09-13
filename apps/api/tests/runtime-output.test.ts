import assert from "node:assert/strict"
import test from "node:test"
import { runtimeOutputEnvelope } from "../src/task-chain/runtime-host.js"

test("显式 llm 的标量结果跨供应商对象根边界后保留严格动态类型", () => {
  const result = runtimeOutputEnvelope({ type: "string", enum: ["completed", "not_completed"] })
  assert.equal(result.jsonSchema.type, "object")
  assert.deepEqual(result.jsonSchema.required, ["value"])
  assert.equal(result.parse({ value: "completed" }), "completed")
  assert.throws(() => result.parse("completed"))
  assert.throws(() => result.parse({ value: "unknown" }))
  assert.throws(() => result.parse({ value: "completed", unrelated: true }))
})
