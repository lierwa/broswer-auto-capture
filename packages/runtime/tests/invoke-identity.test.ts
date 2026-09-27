import assert from "node:assert/strict"
import test from "node:test"
import { CONTRACT_VERSION, requiredNodeOutcomes, taskChainSchema,
  type JsonValue, type LegacyChainNode, type TaskCheckpoint } from "@browser-capture/contracts"
import { TaskChainRuntime, type TaskChainCapabilities } from "@browser-capture/runtime"
import { stableUuid } from "../src/task-chain/hash.js"
import { alternateRunId, childChainId, invokeChain, loopChain, nullContract, requestFor } from "./task-chain-fixtures.js"

const items = [{ id: "first", value: "甲" }, { id: "second", value: "乙" }, { id: "third", value: "丙" }]

function completed(input: JsonValue) {
  return { outcome: { status: "completed" as const, reason: "完成", evidence: [], completionEvidence: ["child"] },
    output: { kind: "value" as const, contract: { id: "child-output", version: 1 }, value: input } }
}

function resumeRequest(checkpoint: TaskCheckpoint) {
  return { contractVersion: CONTRACT_VERSION, requestId: alternateRunId, binding: checkpoint.binding,
    checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence }
}

test("不同 invoke 节点、输入和子链版本各自派发，不复用同键旧输出", async () => {
  const source = invokeChain(), first = source.nodes.find((node) => node.kind === "invoke")
  if (!first || first.kind !== "invoke") throw new Error("fixture_invalid")
  const same = { ...structuredClone(first), id: "invoke-same" }
  const changedInput = { ...structuredClone(first), id: "invoke-input",
    input: { source: "constant" as const, value: { id: "first", value: "新输入" } } }
  const changedVersion = { ...structuredClone(changedInput), id: "invoke-version",
    chain: { ...first.chain, version: first.chain.version + 1, digest: "c".repeat(64) } }
  const invocations = [first, same, changedInput, changedVersion]
  source.nodes.splice(source.nodes.indexOf(first) + 1, 0, same, changedInput, changedVersion)
  source.edges = [
    ...source.edges.filter((edge) => edge.from !== first.id),
    ...invocations.flatMap((node, index) => node.outcomes.map((outcome) => ({ from: node.id, outcome,
      to: outcome === "success" ? invocations[index + 1]?.id ?? "emit" : "error" }))),
  ]
  const chain = taskChainSchema.parse(source), calls: { input: JsonValue; version: number; invocationId: string; key: string }[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items: [items[0]!] }), capabilities: {
    invoke: async ({ input, chain: child, invocationId, idempotencyKey }) => {
      calls.push({ input, version: child.version, invocationId, key: idempotencyKey })
      return completed(input)
    },
  } })
  assert.equal(run.status, "completed")
  assert.deepEqual(calls.map((call) => [call.input, call.version]), [
    [items[0], 3], [items[0], 3], [{ id: "first", value: "新输入" }, 3], [{ id: "first", value: "新输入" }, 4],
  ])
  assert.equal(new Set(calls.map((call) => call.invocationId)).size, 4)
  assert.equal(new Set(calls.map((call) => call.key)).size, 4)
  assert.equal(run.consumed.invocations, 4)
})

test("外层循环重入同一 invoke once 节点时按当前现场分别调用", async () => {
  const source = loopChain(), visit = source.nodes.find((node) => node.id === "visit")
  if (!visit) throw new Error("fixture_invalid")
  const invoke: LegacyChainNode = { id: visit.id, label: visit.label, kind: "invoke",
    outcomes: [...requiredNodeOutcomes.invoke], outputContract: nullContract, writes: [],
    chain: { id: childChainId, version: 3, digest: "b".repeat(64) },
    input: { source: "variable", name: "item", path: [] }, iteration: { mode: "once" } }
  source.nodes = source.nodes.map((node) => node.id === visit.id ? invoke : node)
  source.edges = [...source.edges.filter((edge) => edge.from !== visit.id),
    ...invoke.outcomes.map((outcome) => ({ from: invoke.id, outcome, to: outcome === "success" ? "repeat" : "error" }))]
  const chain = taskChainSchema.parse(source), calls: { input: JsonValue; invocationId: string; key: string }[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items }), capabilities: {
    invoke: async ({ input, invocationId, idempotencyKey }) => {
      calls.push({ input, invocationId, key: idempotencyKey })
      return completed(null)
    },
  } })
  assert.equal(run.status, "completed")
  assert.deepEqual(calls.map((call) => call.input), items)
  assert.equal(new Set(calls.map((call) => call.invocationId)).size, items.length)
  assert.equal(new Set(calls.map((call) => call.key)).size, items.length)
})

test("同一次父运行恢复时跳过已完成子调用，等待中的子调用沿用身份", async () => {
  const chain = invokeChain(), request = requestFor(chain, { items: items.slice(0, 2) })
  const calls: { stableKey: string; invocationId: string; key: string }[] = []
  const invoke: NonNullable<TaskChainCapabilities["invoke"]> = async ({ input, stableKey, invocationId, idempotencyKey }) => {
    calls.push({ stableKey, invocationId, key: idempotencyKey })
    if (stableKey === "second" && calls.filter((call) => call.stableKey === "second").length === 1) {
      return { outcome: { status: "waiting_for_human", reason: "等待登录", evidence: [],
        waitpointId: "20000000-0000-4000-8000-000000000011", checkpointId: "20000000-0000-4000-8000-000000000012" }, output: null }
    }
    return completed(input)
  }
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities: { invoke } })
  assert.equal(waiting.status, "waiting_for_human")
  const checkpoint = waiting.checkpoint!
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: { invoke }, control: {
    checkpoint, resumeRequest: resumeRequest(checkpoint),
  } })
  assert.equal(resumed.status, "completed")
  assert.deepEqual(calls.map((call) => call.stableKey), ["first", "second", "second"])
  assert.equal(calls[1]!.invocationId, calls[2]!.invocationId)
  assert.equal(calls[1]!.key, calls[2]!.key)
  assert.equal(resumed.consumed.invocations, 2)
})

test("旧格式进度无法证明外层调用身份时拒绝恢复，不重复派发副作用", async () => {
  const chain = invokeChain(), request = requestFor(chain, { items: items.slice(0, 2) })
  let calls = 0
  const invoke: NonNullable<TaskChainCapabilities["invoke"]> = async ({ input }) => {
    calls += 1
    return calls === 2 ? { outcome: { status: "waiting_for_human", reason: "等待登录", evidence: [],
      waitpointId: "20000000-0000-4000-8000-000000000011", checkpointId: "20000000-0000-4000-8000-000000000012" }, output: null }
      : completed(input)
  }
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities: { invoke } })
  assert.equal(waiting.status, "waiting_for_human")
  const checkpoint = structuredClone(waiting.checkpoint!)
  checkpoint.invocations[0]!.invocationId = stableUuid(checkpoint.binding.runId, "invoke", "first")
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: { invoke }, control: {
    checkpoint, resumeRequest: resumeRequest(checkpoint),
  } })
  assert.equal(resumed.status, "failed")
  assert.equal(calls, 2)
})
