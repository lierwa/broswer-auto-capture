import assert from "node:assert/strict"
import test from "node:test"
import { runAuditSchema, runRequestSchema } from "../src/run.js"

const runRequest = {
  runId: "ddd26d19-068b-40a0-8db9-9738c1c66775",
  workflowId: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
  workflowVersion: 1,
  inputs: [{ stableKey: "sku-a", value: "商品 A" }],
}

test("公共运行输入拒绝游标、完成项和模型计数", () => {
  assert.equal(runRequestSchema.safeParse(runRequest).success, true)
  for (const internalField of ["cursor", "completed", "modelInvocations", "modelInvocationIntents"]) {
    assert.equal(runRequestSchema.safeParse({ ...runRequest, [internalField]: 0 }).success, false)
  }
})

test("调用意图次数由 schema 从显式网关边界事件派生", () => {
  const audit = runAuditSchema.parse({
    runId: runRequest.runId,
    workflowId: runRequest.workflowId,
    workflowVersion: 1,
    status: "completed",
    completedStableKeys: ["sku-a"],
    events: [{
      type: "llm_gateway_call_intended",
      at: "2026-09-05T12:00:00.000Z",
      nodeId: "classify",
      model: "injected-test-model",
    }],
  })

  assert.equal(audit.modelInvocationIntents, 1)
})

test("审计 schema 拒绝调用方提供模型计数", () => {
  const source = {
    runId: runRequest.runId,
    workflowId: runRequest.workflowId,
    workflowVersion: 1,
    status: "completed",
    completedStableKeys: [],
    events: [],
  }
  for (const counter of ["modelInvocations", "modelInvocationIntents"]) {
    assert.equal(runAuditSchema.safeParse({ ...source, [counter]: 0 }).success, false)
  }
})
