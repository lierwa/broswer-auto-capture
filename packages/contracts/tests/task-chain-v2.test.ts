import assert from "node:assert/strict"
import test from "node:test"
import {
  CONTRACT_VERSION, stableTaskChainSchema, stableTaskChainV2Schema, taskChainSchema,
  type StableTaskChainV1, type StableTaskChainV2, type TaskDataContract,
} from "../src/task-chain/index.js"

const nullContract = contract("unit", { type: "null" as const })
const inputContract = contract("input", { type: "object" as const, properties: { value: { type: "string" as const } },
  required: ["value"], additionalProperties: false })
const outputContract = contract("output", { type: "object" as const, properties: { normalized: { type: "string" as const } },
  required: ["normalized"], additionalProperties: false })
const ids = { chain: "51000000-0000-4000-8000-000000000001", task: "51000000-0000-4000-8000-000000000002",
  plan: "51000000-0000-4000-8000-000000000003" }

function contract(id: string, schema: TaskDataContract["schema"]): TaskDataContract {
  return { id, version: 1, dialect: "bat-value-schema/v1", schema }
}

function v2Chain(source = "function main(inputs) { return { normalized: inputs.value.trim().toLowerCase() }; }"): StableTaskChainV2 {
  const fn = { id: "normalize", label: "normalize", kind: "function" as const, language: "javascript" as const,
    source, inputs: { value: { source: "input" as const, path: ["value"] } },
    outputContract, writes: [], timeoutMs: 200 }
  const done = { id: "done", label: "done", kind: "terminal" as const, status: "completed" as const,
    reason: "done", evidence: [{ source: "node" as const, nodeId: fn.id, path: [] }], outputContract, writes: [],
    result: { name: "result", output: { kind: "value" as const,
      value: { source: "node" as const, nodeId: fn.id, path: [] } }, contract: outputContract } }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const,
    reason: "failed", evidence: [{ source: "constant" as const, value: "failed" }], outputContract: nullContract, writes: [] }
  return stableTaskChainV2Schema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: ids.chain, taskId: ids.task, version: 2, plan: { id: ids.plan, version: 1, digest: "a".repeat(64) },
    stepId: "normalize", name: "normalize", inputContract, outputContract, variables: {}, entry: fn.id,
    nodes: [fn, done, failed], edges: [
      { from: fn.id, port: "success", to: done.id }, { from: fn.id, port: "timeout", to: failed.id },
      { from: fn.id, port: "failed", to: failed.id }, { from: fn.id, port: "cancelled", to: failed.id },
    ], completion: [{ id: "complete", description: "completed", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 5, maxBrowserCommands: 0, maxActiveMs: 5_000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "same rule", assumptions: [], invalidationConditions: [] },
    implementationSummary: "pure data normalization", validation: { status: "candidate", evidence: [] } })
}

test("stable/v2 Function 保存源码、动态 port，并保持 stable/v1 reader", () => {
  const v2 = v2Chain()
  const parsed = taskChainSchema.parse(v2)
  assert.equal("nodeModel" in parsed ? parsed.nodeModel : null, "stable/v2")
  assert.deepEqual(v2.edges.map((edge) => edge.port), ["success", "timeout", "failed", "cancelled"])

  const v1: StableTaskChainV1 = stableTaskChainSchema.parse({ ...v2, nodeModel: "stable/v1",
    nodes: [{ id: "done", label: "done", kind: "terminal", outcomes: [], status: "completed", reason: "done",
      evidence: [{ source: "constant", value: true }], outputContract, writes: [],
      result: { name: "result", output: { kind: "value", value: { source: "constant", value: { normalized: "ok" } } }, contract: outputContract } }],
    entry: "done", edges: [], version: 1 })
  const bytes = JSON.stringify(v1)
  assert.equal(JSON.stringify(taskChainSchema.parse(JSON.parse(bytes))), bytes)
})

test("stable/v2 Function 拒绝超长源码和未绑定 port", () => {
  const tooLarge = { ...v2Chain(), nodes: v2Chain().nodes.map((node) => node.kind === "function"
    ? { ...node, source: "x".repeat(32_769) } : node) }
  assert.throws(() => taskChainSchema.parse(tooLarge), /function_source_bytes/)
  const unbound = v2Chain()
  unbound.edges = unbound.edges.filter((edge) => edge.port !== "success")
  assert.throws(() => taskChainSchema.parse(unbound), /unbound_outcome/)
})

export { v2Chain }
