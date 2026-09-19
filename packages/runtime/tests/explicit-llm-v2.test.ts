import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { taskChainSchema, type StableTaskChainV2, type TaskDataContract } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "./task-chain-fixtures.js"

const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
const inputContract: TaskDataContract = { id: "input", version: 1, dialect: "bat-value-schema/v1", schema: {
  type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } }
const resultContract: TaskDataContract = { id: "choice", version: 1, dialect: "bat-value-schema/v1", schema: {
  type: "string", enum: ["product", "accessory", "service", "uncertain"] } }
const prompt = "只依据输入 JSON 的 text 分类。严格选择 product、accessory、service、uncertain 之一，并通过唯一 result 返回。"

function llmChain(): StableTaskChainV2 {
  const llm = { id: "semantic", label: "显式 LLM", kind: "llm" as const, systemPrompt: prompt,
    input: { source: "input" as const, path: [] }, model: "fixture-model", timeoutMs: 1_000,
    outputContract: resultContract, writes: [] }
  const values = ["product", "accessory", "service", "uncertain"] as const
  const branch = { id: "route", label: "语义路由", kind: "branch" as const, outputContract: unit, writes: [],
    cases: values.map((value) => ({ id: value, label: value, predicate: { operator: "equals" as const,
      left: { source: "node" as const, nodeId: llm.id, path: [] }, right: { source: "constant" as const, value } } })) }
  const done = { id: "done", label: "done", kind: "terminal" as const, status: "completed" as const, reason: "done",
    outputContract: resultContract, writes: [], evidence: [{ source: "node" as const, nodeId: llm.id, path: [] }],
    result: { name: "result", output: { kind: "value" as const,
      value: { source: "node" as const, nodeId: llm.id, path: [] } }, contract: resultContract } }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const,
    reason: "explicit_llm_failed", outputContract: unit, writes: [], evidence: [{ source: "input" as const, path: [] }] }
  return taskChainSchema.parse({ contractVersion: "bat-task-chain/v1", kind: "chain", nodeModel: "stable/v2",
    id: "54000000-0000-4000-8000-000000000001", taskId: "54000000-0000-4000-8000-000000000002", version: 2,
    plan: { id: "54000000-0000-4000-8000-000000000003", version: 1, digest: "a".repeat(64) }, stepId: "semantic",
    name: "explicit llm", inputContract, outputContract: resultContract, variables: {}, entry: llm.id,
    nodes: [llm, branch, done, failed], edges: [
      { from: llm.id, port: "success", to: branch.id },
      ...["timeout", "failed", "cancelled"].map((port) => ({ from: llm.id, port, to: failed.id })),
      ...values.map((port) => ({ from: branch.id, port, to: done.id })),
      { from: branch.id, port: "default", to: failed.id }, { from: branch.id, port: "failed", to: failed.id },
    ], completion: [{ id: "complete", description: "result", predicate: { operator: "exists",
      value: { source: "node", nodeId: llm.id, path: [] } } }],
    budget: { maxTransitions: 6, maxBrowserCommands: 0, maxActiveMs: 5_000, maxLlmCalls: 1, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "fixed semantic operation", assumptions: [], invalidationConditions: [] },
    implementationSummary: "fixed prompt single result", validation: { status: "candidate", evidence: [] } }) as StableTaskChainV2
}

test("stable/v2 LLM 固定 prompt、一个 JSON 输入、一次调用和一个 result", async () => {
  const chain = llmChain(), seen: unknown[] = []
  const capability = async (invocation: any) => {
    seen.push({ prompt: invocation.node.systemPrompt, input: invocation.input,
      delegate: "delegate" in invocation.node })
    return { outcome: "success" as const, output: "product", reportedInvocations: 1 }
  }
  const first = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { text: "A" }),
    capabilities: { llm: capability } })
  const second = await new TaskChainRuntime().execute({ chain,
    request: requestFor(chain, { text: "B" }, "verification", "20000000-0000-4000-8000-000000000008",
      "20000000-0000-4000-8000-000000000009"), capabilities: { llm: capability } })
  assert.equal(first.status, "completed"); assert.equal(second.status, "completed")
  assert.deepEqual(seen, [{ prompt, input: { text: "A" }, delegate: false },
    { prompt, input: { text: "B" }, delegate: false }])
  assert.equal(first.modelCalls[0]?.reportedInvocations, 1)
  assert.equal(first.consumed.browserCommands, 0)
  assert.equal(createHash("sha256").update(prompt).digest("hex"), createHash("sha256").update(prompt).digest("hex"))
})

test("额外调用、非法 result、Browser 报告、timeout 与 cancel 均不进入 Branch", async () => {
  for (const result of [
    { outcome: "success" as const, output: "product", reportedInvocations: 2 },
    { outcome: "success" as const, output: "other", reportedInvocations: 1 },
    { outcome: "success" as const, output: "product", reportedInvocations: 1, reportedBrowserCommands: 1 },
    { outcome: "timeout" as const, output: null, reason: "llm_timeout", reportedInvocations: 1 },
    { outcome: "cancelled" as const, output: null, reason: "llm_cancelled", reportedInvocations: 1 },
  ]) {
    const chain = llmChain()
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { text: "x" }),
      capabilities: { llm: async () => result } })
    assert.equal(run.status, "failed")
    assert.equal(run.events.some((event) => event.nodeId === "route"), false)
  }
})
