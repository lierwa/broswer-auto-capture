import assert from "node:assert/strict"
import test from "node:test"
import type { StableChainNodeV2, TaskDataContract } from "@browser-capture/contracts"
import { executeFunctionNode, functionRuntimeDiagnostics, TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "./task-chain-fixtures.js"

const anyContract: TaskDataContract = { id: "json", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {}, required: [], additionalProperties: true } }
type FunctionNode = Extract<StableChainNodeV2, { kind: "function" }>
const signal = new AbortController().signal

function node(source: string, outputContract = anyContract, timeoutMs = 200): FunctionNode {
  return { id: "function", label: "function", kind: "function", language: "javascript", source,
    inputs: {}, outputContract, writes: [], timeoutMs }
}

async function run(source: string, input: Record<string, never> = {}, timeoutMs = 200) {
  return executeFunctionNode(node(source, anyContract, timeoutMs), input, signal)
}

test("QuickJS Function 对相同输入给出相同 JSON 且不回写宿主输入", async () => {
  const source = "function main(inputs) { inputs.value = 'guest'; return { value: inputs.value, count: inputs.items.length }; }"
  const input = { value: "host", items: [1, 2, 3] }
  const first = await executeFunctionNode(node(source), structuredClone(input), signal)
  const second = await executeFunctionNode(node(source), structuredClone(input), signal)
  assert.deepEqual(first, second)
  assert.deepEqual(first, { outcome: "success", output: { value: "guest", count: 3 } })
  assert.deepEqual(input, { value: "host", items: [1, 2, 3] })
})

test("QuickJS Function 不暴露宿主、时间、随机数、Browser 或动态执行入口", async () => {
  const result = await run(`function main() { return {
    process: typeof process, require: typeof require, fetch: typeof fetch, browser: typeof Browser,
    date: typeof Date, intl: typeof Intl, random: typeof Math.random, timer: typeof setTimeout,
    evaluator: typeof eval, functionCtor: typeof Function
  }; }`)
  assert.equal(result.outcome, "success")
  assert.deepEqual(result.output, { process: "undefined", require: "undefined", fetch: "undefined", browser: "undefined",
    date: "undefined", intl: "undefined", random: "undefined", timer: "undefined",
    evaluator: "undefined", functionCtor: "undefined" })
})

test("无限循环 timeout 后释放 runtime/context，下一次仍可执行", async () => {
  const timedOut = await run("function main() { while (true) {} }", {}, 50)
  assert.deepEqual(timedOut, { outcome: "timeout", output: null, reason: "function_timeout" })
  const next = await run("function main() { return { ok: true }; }")
  assert.deepEqual(next, { outcome: "success", output: { ok: true } })
  assert.deepEqual(functionRuntimeDiagnostics(), { moduleLoaded: true, activeWorkers: 0,
    activeRuntimes: 0, activeContexts: 0, cleanupFailures: 0 })
})

test("heap、stack、非法与超大输出有唯一错误码并完成清理", async () => {
  const heap = await run("function main() { const a = []; while (true) a.push('x'.repeat(1048576)); }", {}, 2_000)
  assert.equal(heap.reason, "function_memory_limit")
  const stack = await run("function main() { function dive() { return dive(); } return dive(); }")
  assert.equal(stack.reason, "function_memory_limit")
  const invalid = await run("function main() { return undefined; }")
  assert.equal(invalid.reason, "function_output_invalid")
  const tooLarge = await run("function main() { return { value: 'x'.repeat(2097152) }; }")
  assert.equal(tooLarge.reason, "function_output_too_large")
  assert.equal(functionRuntimeDiagnostics().activeRuntimes, 0)
  assert.equal(functionRuntimeDiagnostics().activeContexts, 0)
})

test("取消、错误源码和 schema 不符不留下活跃 QuickJS execution", async () => {
  const controller = new AbortController()
  setTimeout(() => controller.abort("acceptance"), 20)
  const cancelled = await executeFunctionNode(node("function main() { while (true) {} }", anyContract, 1_000), {}, controller.signal)
  assert.deepEqual(cancelled, { outcome: "cancelled", output: null, reason: "function_cancelled" })
  assert.equal((await run("const main = () => ({});")).reason, "function_source_invalid")
  const integer: TaskDataContract = { id: "integer", version: 1, dialect: "bat-value-schema/v1", schema: { type: "integer" } }
  assert.equal((await executeFunctionNode(node("function main() { return 'wrong'; }", integer), {}, signal)).reason,
    "function_output_invalid")
  assert.equal(functionRuntimeDiagnostics().activeRuntimes, 0)
  assert.equal(functionRuntimeDiagnostics().activeContexts, 0)
  assert.equal(functionRuntimeDiagnostics().activeWorkers, 0)
  assert.equal(functionRuntimeDiagnostics().cleanupFailures, 0)
})

test("stable/v2 Function 通过正式 runtime 运行且普通路径模型与浏览器调用为零", async () => {
  const { stableTaskChainV2Schema } = await import("@browser-capture/contracts")
  const outputContract: TaskDataContract = { id: "output", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { normalized: { type: "string" } }, required: ["normalized"], additionalProperties: false } }
  const inputContract: TaskDataContract = { id: "input", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } }
  const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
  const fn = { id: "normalize", label: "normalize", kind: "function" as const, language: "javascript" as const,
    source: "function main(inputs) { return { normalized: inputs.value.trim().toLowerCase() }; }",
    inputs: { value: { source: "input" as const, path: ["value"] } }, outputContract, writes: [], timeoutMs: 200 }
  const done = { id: "done", label: "done", kind: "terminal" as const, status: "completed" as const, reason: "done",
    evidence: [{ source: "node" as const, nodeId: fn.id, path: [] }], outputContract, writes: [], result: { name: "result",
      output: { kind: "value" as const, value: { source: "node" as const, nodeId: fn.id, path: [] } }, contract: outputContract } }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const, reason: "failed",
    evidence: [{ source: "constant" as const, value: "failed" }], outputContract: unit, writes: [] }
  const chain = stableTaskChainV2Schema.parse({ contractVersion: "bat-task-chain/v1", kind: "chain", nodeModel: "stable/v2",
    id: "52000000-0000-4000-8000-000000000001", taskId: "52000000-0000-4000-8000-000000000002", version: 2,
    plan: { id: "52000000-0000-4000-8000-000000000003", version: 1, digest: "b".repeat(64) }, stepId: "normalize",
    name: "normalize", inputContract, outputContract, variables: {}, entry: fn.id, nodes: [fn, done, failed],
    edges: ["success", "timeout", "failed", "cancelled"].map((port) => ({ from: fn.id, port, to: port === "success" ? done.id : failed.id })),
    completion: [{ id: "complete", description: "complete", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 5, maxBrowserCommands: 0, maxActiveMs: 5_000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "same rule", assumptions: [], invalidationConditions: [] },
    implementationSummary: "pure data", validation: { status: "candidate", evidence: [] } })
  let modelCalls = 0, browserCommands = 0
  const result = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { value: "  VALUE " }), capabilities: {
    llm: async () => { modelCalls += 1; throw new Error("unexpected") },
    capability: async () => { browserCommands += 1; throw new Error("unexpected") },
  } })
  assert.equal(result.status, "completed")
  assert.deepEqual(result.outputs.result, { kind: "value", contract: { id: "output", version: 1 }, value: { normalized: "value" } })
  assert.equal(modelCalls, 0); assert.equal(browserCommands, 0)
  assert.equal(result.consumed.llmCalls, 0); assert.equal(result.consumed.browserCommands, 0)
})
