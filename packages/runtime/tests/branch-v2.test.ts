import assert from "node:assert/strict"
import test from "node:test"
import { taskChainSchema, type StableTaskChainV2, type TaskDataContract } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "./task-chain-fixtures.js"

const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
const inputContract: TaskDataContract = { id: "input", version: 1, dialect: "bat-value-schema/v1", schema: {
  type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } }
const outputContract: TaskDataContract = { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: {
  type: "string", enum: ["done"] } }

function terminal(id: string) {
  return { id, label: id, kind: "terminal" as const, status: "completed" as const, reason: id,
    outputContract, writes: [], evidence: [{ source: "input" as const, path: [] }], result: { name: "result",
      output: { kind: "value" as const, value: { source: "constant" as const, value: "done" } }, contract: outputContract } }
}

function chain(): StableTaskChainV2 {
  const branch = { id: "choose", label: "ordered", kind: "branch" as const, outputContract: unit, writes: [], cases: [
    { id: "first", label: "first", predicate: { operator: "equals" as const,
      left: { source: "input" as const, path: ["value"] }, right: { source: "constant" as const, value: "match" } } },
    { id: "second", label: "second", predicate: { operator: "equals" as const,
      left: { source: "input" as const, path: ["value"] }, right: { source: "constant" as const, value: "match" } } },
  ] }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const,
    reason: "branch_predicate_failed", outputContract: unit, writes: [], evidence: [{ source: "input" as const, path: [] }] }
  return taskChainSchema.parse({ contractVersion: "bat-task-chain/v1", kind: "chain", nodeModel: "stable/v2",
    id: "53000000-0000-4000-8000-000000000001", taskId: "53000000-0000-4000-8000-000000000002", version: 2,
    plan: { id: "53000000-0000-4000-8000-000000000003", version: 1, digest: "a".repeat(64) }, stepId: "route",
    name: "ordered branch", inputContract, outputContract, variables: {}, entry: branch.id,
    nodes: [branch, terminal("done"), failed],
    edges: [{ from: branch.id, port: "first", to: "done" }, { from: branch.id, port: "second", to: "done" },
      { from: branch.id, port: "default", to: "done" }, { from: branch.id, port: "failed", to: "failed" }],
    completion: [{ id: "complete", description: "terminal owns result", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 4, maxBrowserCommands: 0, maxActiveMs: 5_000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "same ordered cases", assumptions: [], invalidationConditions: [] },
    implementationSummary: "stable/v2 N-way branch", validation: { status: "candidate", evidence: [] } }) as StableTaskChainV2
}

test("stable/v2 Branch 按顺序选择首个命中 case，并以动态 port 审计", async () => {
  const value = chain()
  const run = await new TaskChainRuntime().execute({ chain: value, request: requestFor(value, { value: "match" }), capabilities: {} })
  assert.equal(run.status, "completed")
  assert.equal(run.events.find((event) => event.nodeId === "choose" && event.status === "finished")?.outcome, "first")
  assert.equal(run.outputs.result?.kind, "value")
})

test("stable/v2 Branch 全部未命中走 default", async () => {
  const value = chain()
  const run = await new TaskChainRuntime().execute({ chain: value,
    request: requestFor(value, { value: "other" }, "replay", "20000000-0000-4000-8000-000000000008"), capabilities: {} })
  assert.equal(run.events.find((event) => event.nodeId === "choose" && event.status === "finished")?.outcome, "default")
})

test("Branch 拒绝重复、保留名和未绑定 port", () => {
  const duplicate = structuredClone(chain()) as any
  duplicate.nodes[0].cases[1].id = "first"
  assert.ok(taskChainSchema.safeParse(duplicate).success === false)
  const reserved = structuredClone(chain()) as any
  reserved.nodes[0].cases[0].id = "default"
  assert.ok(taskChainSchema.safeParse(reserved).success === false)
  const unbound = structuredClone(chain()) as any
  unbound.edges = unbound.edges.filter((edge: { port: string }) => edge.port !== "second")
  assert.ok(taskChainSchema.safeParse(unbound).success === false)
})
