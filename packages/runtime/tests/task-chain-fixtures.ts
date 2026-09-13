import {
  CONTRACT_VERSION, requiredNodeOutcomes, type ChainNode, type JsonValue,
  type TaskChain, type TaskDataContract, type TaskRunRequest, type ValueBinding, type ValueSchema,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "../src/task-chain/index.js"

const uuids = {
  task: "20000000-0000-4000-8000-000000000001", plan: "20000000-0000-4000-8000-000000000002",
  chain: "20000000-0000-4000-8000-000000000003", authorization: "20000000-0000-4000-8000-000000000004",
  request: "20000000-0000-4000-8000-000000000005", run: "20000000-0000-4000-8000-000000000006",
  invocation: "20000000-0000-4000-8000-000000000007",
}
export const alternateRunId = "20000000-0000-4000-8000-000000000008"
export const alternateInvocationId = "20000000-0000-4000-8000-000000000009"
export const childChainId = "20000000-0000-4000-8000-000000000010"
const digest = "a".repeat(64)
const plan = { id: uuids.plan, version: 1, digest }
export const budget = { maxTransitions: 100, maxBrowserCommands: 20, maxActiveMs: 30_000,
  maxLlmCalls: 2, maxInvocations: 20, maxDepth: 4 }
export const nullContract = contract("unit", { type: "null" })
export const textContract = contract("text-result", { type: "string" })
export const readyContract = contract("ready-result", { type: "object", properties: { ready: { type: "boolean" } },
  required: ["ready"], additionalProperties: false })
export const itemContract = contract("task-item", { type: "object", properties: {
  id: { type: "string" }, value: { type: "string" },
}, required: ["id", "value"], additionalProperties: false })
export const itemsContract = contract("task-items", { type: "array", items: itemContract.schema })
export const inputItemsContract = contract("task-input", { type: "object", properties: { items: itemsContract.schema },
  required: ["items"], additionalProperties: false })
export const opaqueListContract = contract("invocation-results", { type: "array",
  items: { type: "object", properties: {}, required: [], additionalProperties: true } })

function contract(id: string, schema: ValueSchema): TaskDataContract {
  return { id, version: 1, dialect: "bat-value-schema/v1", schema }
}
function binding(source: "input" | "variable", path: (string | number)[] = [], name?: string) {
  return source === "input" ? { source, path } as const : { source, name: name!, path } as const
}
function base(id: string, kind: ChainNode["kind"], outputContract = nullContract) {
  return { id, label: id, outcomes: [...requiredNodeOutcomes[kind]], outputContract, writes: [] }
}
function edges(node: ChainNode, success: string, failure = "error") {
  return node.outcomes.map((outcome) => ({ from: node.id, outcome, to: outcome === "success" ? success : failure }))
}
function chainBase(name: string, inputContract: TaskDataContract, outputContract: TaskDataContract,
  nodes: ChainNode[], chainEdges: TaskChain["edges"], entry: string, variables: TaskChain["variables"] = {}): TaskChain {
  const output = { source: "node" as const, nodeId: "emit", path: [] }
  const predicate = outputContract.schema.type === "null"
    ? { operator: "equals" as const, left: output, right: { source: "constant" as const, value: null } }
    : { operator: "exists" as const, value: output }
  return { contractVersion: CONTRACT_VERSION, kind: "chain", id: uuids.chain, taskId: uuids.task, version: 1,
    plan, stepId: "perform", name, inputContract, outputContract, variables, entry, nodes, edges: chainEdges,
    completion: [{ id: "output-ready", description: "输出已经发布", predicate }],
    budget, reuseBoundary: { description: "不同运行输入复用同一结构", assumptions: ["输入符合契约"],
      invalidationConditions: ["能力合同变化"] }, implementationSummary: "运行时内存夹具",
    validation: { status: "candidate", evidence: [] } }
}
function terminal(id: string, status: "completed" | "failed"): ChainNode {
  return { ...base(id, "terminal"), kind: "terminal", status, reason: status === "completed" ? "完成" : "失败",
    evidence: [{ source: "input", path: [] }] }
}
function emit(outputContract: TaskDataContract, value: ValueBinding): ChainNode {
  return { ...base("emit", "emit", outputContract), kind: "emit", name: "result",
    output: { kind: "value", value }, contract: outputContract }
}

export function loopChain(): TaskChain {
  const loop: ChainNode = { ...base("repeat", "loop"), kind: "loop", iteration: {
    mode: "each", collection: binding("input", ["items"]), itemVariable: "item", stableKeyPath: ["id"],
  }, cursorVariable: "cursor", maxIterations: 10 }
  const visit: ChainNode = { ...base("visit", "browser"), kind: "browser", operation: "wait",
    arguments: { item: binding("variable", [], "item") }, timeoutMs: 1000 }
  const publish = emit(itemsContract, binding("input", ["items"]))
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  const chainEdges = [
    ...loop.outcomes.map((outcome) => ({ from: loop.id, outcome,
      to: outcome === "body" ? visit.id : outcome === "done" ? publish.id : error.id })),
    ...edges(visit, loop.id), ...edges(publish, done.id),
  ]
  return chainBase("有界逐项执行", inputItemsContract, itemsContract, [loop, visit, publish, done, error],
    chainEdges, loop.id, { cursor: contract("cursor", { type: "integer", minimum: 0 }), item: itemContract })
}

export function invokeChain(): TaskChain {
  const invoke: ChainNode = { ...base("invoke", "invoke", opaqueListContract), kind: "invoke",
    chain: { id: childChainId, version: 3, digest: "b".repeat(64) }, input: binding("variable", [], "item"),
    iteration: { mode: "each", collection: binding("input", ["items"]), itemVariable: "item",
      stableKeyPath: ["id"], maxItems: 10, onItemFailure: "stop" } }
  const publish = emit(opaqueListContract, { source: "node", nodeId: invoke.id, path: [] })
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  return chainBase("组合调用同一子链", inputItemsContract, opaqueListContract, [invoke, publish, done, error],
    [...edges(invoke, publish.id), ...edges(publish, done.id)], invoke.id, { item: itemContract })
}

export function humanChain(): TaskChain {
  const human: ChainNode = { ...base("human", "human", readyContract), kind: "human", reason: "login",
    prompt: "请完成当前页面操作", resumeWhen: { operator: "equals", path: ["ready"],
      expected: { source: "constant", value: true } }, timeoutMs: 1000 }
  const publish = emit(readyContract, { source: "node", nodeId: human.id, path: [] })
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  return chainBase("人工等待后恢复", readyContract, readyContract, [human, publish, done, error],
    [...edges(human, publish.id), ...edges(publish, done.id)], human.id)
}

export function llmChain(): TaskChain {
  const llm: ChainNode = { ...base("llm", "llm", textContract), kind: "llm", instruction: "转换输入",
    input: binding("input"), model: "fixture-model", timeoutMs: 1000 }
  const publish = emit(textContract, { source: "node", nodeId: llm.id, path: [] })
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  return chainBase("显式模型节点", textContract, textContract, [llm, publish, done, error],
    [...edges(llm, publish.id), ...edges(publish, done.id)], llm.id)
}

export function browserEffectChain(): TaskChain {
  const browser: ChainNode = { ...base("browser", "browser", nullContract), kind: "browser", operation: "wait",
    arguments: {}, timeoutMs: 1000 }
  const publish = emit(nullContract, { source: "node", nodeId: browser.id, path: [] })
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  return chainBase("外部副作用恢复", nullContract, nullContract, [browser, publish, done, error],
    [...edges(browser, publish.id), ...edges(publish, done.id)], browser.id)
}

export function checkpointChain(): TaskChain {
  const data: ChainNode = { ...base("data", "data", textContract), kind: "data", operation: "extract",
    arguments: { source: binding("input") } }
  const checkpoint: ChainNode = { ...base("checkpoint", "checkpoint"), kind: "checkpoint",
    resumeWhen: { operator: "exists", path: [] } }
  const publish = emit(textContract, { source: "node", nodeId: data.id, path: [] })
  const done = terminal("done", "completed"), error = terminal("error", "failed")
  return chainBase("显式检查点恢复", textContract, textContract, [data, checkpoint, publish, done, error],
    [...edges(data, checkpoint.id), ...edges(checkpoint, publish.id), ...edges(publish, done.id)], data.id)
}

export function requestFor(chain: TaskChain, input: JsonValue, mode: TaskRunRequest["mode"] = "replay",
  runId = uuids.run, invocationId = uuids.invocation): TaskRunRequest {
  return { contractVersion: CONTRACT_VERSION, requestId: uuids.request, mode, input, binding: {
    runId, invocationId, taskId: chain.taskId, authorizationId: uuids.authorization, plan: chain.plan,
    chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input),
  } }
}
