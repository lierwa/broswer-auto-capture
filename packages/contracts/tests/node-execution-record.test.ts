import assert from "node:assert/strict"
import test from "node:test"
import { nodeExecutionEventSchema, nodeExecutionRecordSchema, nodeValueRecordSchema } from "@browser-capture/contracts"

const event = { sequence: 1, at: "2026-09-30T00:00:00Z", invocationId: "20000000-0000-4000-8000-000000000007",
  nodeId: "normalize", status: "started", outcome: null, idempotencyKey: "same-key", stableKey: null }

test("旧节点事件保持原文，新记录区分合法空值与未记录", () => {
  assert.deepEqual(nodeExecutionEventSchema.parse(event), event)
  for (const value of [null, false, 0, "", []]) {
    assert.deepEqual(nodeValueRecordSchema.parse({ status: "recorded", value }), { status: "recorded", value })
  }
  assert.equal(nodeValueRecordSchema.safeParse({ status: "recorded" }).success, false)
  assert.equal(nodeValueRecordSchema.safeParse({ status: "missing", value: null }).success, false)
  assert.equal(nodeExecutionEventSchema.safeParse({ ...event, status: "planned", execution: {} }).success, false)
  assert.equal(nodeExecutionEventSchema.safeParse({ ...event, execution: { output: { status: "recorded", value: null } } }).success, false)
})

test("留存合同拒绝任意reason、每值超限和事件整体超限", () => {
  assert.equal(nodeValueRecordSchema.safeParse({ status: "redacted", reason: "provider error text" }).success, false)
  assert.equal(nodeValueRecordSchema.safeParse({ status: "recorded", value: "汉".repeat(6_000) }).success, false)
  const loops = Array.from({ length: 8 }, (_, index) => ({ nodeId: `loop-${index}`, index, stableKey: "x".repeat(9_000) }))
  assert.equal(nodeExecutionRecordSchema.safeParse({ loops }).success, false)
  assert.equal(nodeExecutionRecordSchema.safeParse({ loop: { index: 3, activeStableKey: null,
    completedStableKeysCount: 2, exitReason: "iteration_limit" } }).success, true)
})
