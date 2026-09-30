import assert from "node:assert/strict"
import test from "node:test"
import { nodePorts, requiredNodeOutcomes, taskChainSchema, type JsonValue, type LegacyChainNode, type StableChainNodeV2,
  type TaskChain, type TaskDataContract, type TaskRun, type ValueBinding } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { safeRecordedOutput, valueRecord } from "../src/task-chain/execution-record.js"
import { alternateRunId, capabilityEffectChain, itemsContract, llmChain, loopChain, nullContract, requestFor } from "./task-chain-fixtures.js"

const objectContract: TaskDataContract = { id: "object", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {}, required: [], additionalProperties: true } }
const constant = (value: JsonValue): ValueBinding => ({ source: "constant", value })
type FunctionNode = Extract<StableChainNodeV2, { kind: "function" }>
function functionNode(inputs: FunctionNode["inputs"], source = "function main(inputs) { return inputs; }"): FunctionNode {
  return { id: "calculate", label: "计算", kind: "function", language: "javascript", source, inputs,
    outputContract: objectContract, writes: [], timeoutMs: 1_000 }
}
function simpleChain(node: StableChainNodeV2, before: StableChainNodeV2[] = [], variables: TaskChain["variables"] = {}) {
  const template = capabilityEffectChain(), done = { id: "done", label: "结束", kind: "terminal" as const,
    status: "completed" as const, reason: "完成", evidence: [constant(true)], outputContract: node.outputContract,
    writes: [], result: { name: "result", contract: node.outputContract, output: { kind: "value" as const,
      value: { source: "node" as const, nodeId: node.id, path: [] } } } }
  const failed = { id: "failed", label: "失败", kind: "terminal" as const, status: "failed" as const,
    reason: "失败", evidence: [constant(true)], outputContract: nullContract, writes: [] }
  const actions = [...before, node]
  return taskChainSchema.parse({ ...template, nodeModel: "stable/v2", inputContract: nullContract,
    outputContract: node.outputContract, variables, entry: actions[0]!.id, nodes: [...actions, done, failed],
    edges: actions.flatMap((item, index) => nodePorts(item).map((port) => ({ from: item.id, port,
      to: port === "success" || item.kind === "branch" && !["failed"].includes(port) ? actions[index + 1]?.id ?? done.id : failed.id }))) })
}
const finished = (run: TaskRun, nodeId: string) => run.events.filter((event) => event.nodeId === nodeId && event.status === "finished")
function inputFor(run: TaskRun, event: TaskRun["events"][number]) {
  return run.events.findLast((item) => item.nodeId === event.nodeId && item.status === "started"
    && item.sequence < event.sequence && item.invocationId === event.invocationId)?.execution?.input
}

test("安全摘要保留真实空值，拒绝未知输入与未完成末次生产", () => {
  for (const value of [null, false, 0, ""] as const) {
    const chain = simpleChain(functionNode({ payload: constant(value) }))
    const events = [{ sequence: 1, nodeId: "calculate", invocationId: "invocation", status: "started", outcome: null,
      execution: { input: { status: "recorded", value: { payload: value } } } },
    { sequence: 2, nodeId: "calculate", invocationId: "invocation", status: "finished", outcome: "success",
      execution: { output: { status: "recorded", value } } }] as TaskRun["events"]
    assert.equal(safeRecordedOutput(chain, events, "calculate")?.value, value)
    const unknown = structuredClone(events)
    unknown[0]!.execution!.input = { status: "missing" }
    assert.equal(safeRecordedOutput(chain, unknown, "calculate"), null)
    assert.equal(safeRecordedOutput(chain, [...events, { ...events[0]!, sequence: 3 }], "calculate"), null)
  }
})

// WHY：保护逐次事实而非字段拼接：已经发布的 sequence 永远不能在后续快照被改写。
test("已发布started不可补写输入，finished不重复实参", async () => {
  for (const chain of [loopChain(), llmChain()]) {
    const snapshots = new Map<number, string>()
    const input = chain.entry === "llm" ? "原始输入" : { items: [{ id: "a", value: "甲" }] }
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, input), capabilities: {
      browser: async () => ({ outcome: "success", output: null }),
      llm: async () => ({ outcome: "success", output: "结果", reportedInvocations: 1 }),
      persist: async (value) => {
        for (const event of value.events) {
          const encoded = JSON.stringify(event), previous = snapshots.get(event.sequence)
          if (previous !== undefined) assert.equal(encoded, previous, `sequence ${event.sequence} changed after publication`)
          snapshots.set(event.sequence, encoded)
        }
      },
    } })
    assert.equal(run.status, "completed", run.outcome?.reason)
    assert.ok(run.events.filter((event) => event.status === "finished").every((event) => !event.execution?.input))
  }
})

test("实际脱敏整对象经Function取值改名和变量传递不能洗掉来源", async () => {
  const secret = "synthetic-renamed-sensitive", source = functionNode({ source: constant({ password: secret }) },
    "function main(inputs) { return { renamed: inputs.source.password }; }")
  source.id = "source"; source.writes = [{ variable: "alias", path: [] }]
  const destination = functionNode({ value: { source: "variable", name: "alias", path: ["renamed"] } })
  const chain = simpleChain(destination, [source], { alias: objectContract })
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {} })
  assert.equal(run.status, "completed", run.outcome?.reason)
  assert.equal(JSON.stringify(run.events).includes(secret), false)
  assert.equal(finished(run, source.id)[0]?.execution?.output?.status, "redacted")
  assert.equal(finished(run, destination.id)[0]?.execution?.output?.status, "redacted")
  assert.deepEqual(run.outputs.result?.kind === "value" ? run.outputs.result.value : null, { value: secret })
})

test("固定each总数只哈希一次集合且后续引用原输入", async () => {
  const chain = loopChain(), items = [{ id: "a", value: "甲" }, { id: "b", value: "乙" }, { id: "c", value: "丙" }]
  const request = requestFor(chain, { items }), original = JSON.stringify, originalClone = structuredClone
  let itemHashes = 0, collectionCopies = 0
  JSON.stringify = function (value, ...rest: Parameters<typeof original> extends [unknown, ...infer R] ? R : never) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "id") && Object.hasOwn(value, "value")) itemHashes++
    return original(value, ...rest)
  } as typeof original
  globalThis.structuredClone = (value, options) => {
    if (Array.isArray(value) && value.length === items.length && value.every((item) => item && typeof item === "object" && "id" in item && "value" in item)) collectionCopies++
    return originalClone(value, options)
  }
  let run: TaskRun
  try {
    run = await new TaskChainRuntime().execute({ chain, request, capabilities: { browser: async () => ({ outcome: "success", output: null }) } })
  } finally { JSON.stringify = original; globalThis.structuredClone = originalClone }
  assert.equal(run.status, "completed", run.outcome?.reason)
  assert.equal(itemHashes, items.length)
  assert.equal(collectionCopies, 1, "only the explicit final emit may copy the complete input collection")
  assert.ok(finished(run, "repeat").every((event) => event.execution?.loop?.total === items.length))
  const started = run.events.filter((event) => event.nodeId === "repeat" && event.status === "started")
  assert.deepEqual(started[0]?.execution?.input, { status: "recorded", value: { collection: items } })
  assert.ok(started.slice(1).every((event) => !event.execution?.input))
})

test("实际Function具名实参与返回在完成释放checkpoint后留存，不去重同来源参数", async () => {
  const expected = { first: 0, second: 0, no: false, empty: "", none: null }
  const chain = simpleChain(functionNode(Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, constant(value)]))))
  const persisted: TaskRun[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    persist: async (value) => { persisted.push(structuredClone(value)) },
  } })
  assert.equal(run.status, "completed"); assert.equal(run.checkpoint, null)
  const record = finished(run, "calculate")[0]!.execution!
  assert.deepEqual(inputFor(run, finished(run, "calculate")[0]!), { status: "recorded", value: expected })
  assert.deepEqual(record.output, { status: "recorded", value: expected })
  assert.ok(persisted.some((value) => value.events.at(-1)?.status === "started"
    && value.events.at(-1)?.execution?.input?.status === "recorded"))
  assert.deepEqual(persisted.at(-1)?.events, run.events)
  assert.equal(run.consumed.llmCalls, 0); assert.equal(run.consumed.browserCommands, 0)
})

test("Function失败保留真实输入，但不把包装层null当作guest返回", async () => {
  const chain = simpleChain(functionNode({ value: constant(0) }, "function main() { throw new Error('synthetic guest failure'); }"))
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {} })
  const event = finished(run, "calculate")[0]!
  assert.equal(event.outcome, "failed")
  assert.deepEqual(inputFor(run, event), { status: "recorded", value: { value: 0 } })
  assert.deepEqual(event.execution?.output, { status: "missing" })
})

test("敏感字段局部脱敏、超限显式截断，业务执行值保持原样", async () => {
  const input = { text: "业务内容", credentials: { cookie: "synthetic-sensitive-value" }, zero: 0 }
  const chain = simpleChain(functionNode({ source: constant(input) }))
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {} })
  const record = finished(run, "calculate")[0]!.execution!
  assert.equal(inputFor(run, finished(run, "calculate")[0]!)?.status, "redacted")
  assert.equal(record.output?.status, "redacted")
  assert.equal(JSON.stringify(run.events).includes("synthetic-sensitive-value"), false)
  assert.deepEqual(run.outputs.result?.kind === "value" ? run.outputs.result.value : null, { source: input })
  assert.deepEqual(valueRecord("汉".repeat(6_000)), { status: "truncated", reason: "value_size_limit" })
})

test("未知能力原始输出经变量与Function恒等传递也不绕过留存边界", async () => {
  const raw: StableChainNodeV2 = { id: "readRaw", label: "原始能力", kind: "capability",
    capability: { name: "fixture.raw", version: 1 }, input: {}, config: {}, effect: "read", timeoutMs: 1_000,
    outputContract: objectContract, writes: [{ variable: "page", path: [] }] }
  const fn = functionNode({ source: { source: "variable", name: "page", path: [] } })
  const chain = simpleChain(fn, [raw], { page: objectContract })
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    capability: async () => ({ outcome: "success", output: { contents: "synthetic-raw-page" } }),
  } })
  assert.equal(run.status, "completed")
  assert.equal(finished(run, raw.id)[0]!.execution?.output?.status, "redacted")
  assert.equal(inputFor(run, finished(run, fn.id)[0]!)?.status, "redacted")
  assert.equal(finished(run, fn.id)[0]!.execution?.output?.status, "redacted")
  assert.equal(JSON.stringify(run.events).includes("synthetic-raw-page"), false)
})

test("敏感绑定路径改参数名也不泄漏，恢复观察不冒充重新读取的业务输出", async () => {
  const aliased = simpleChain(functionNode({ first: { source: "input", path: ["password"] } }))
  aliased.inputContract = { ...objectContract, schema: { type: "object", properties: { password: { type: "string" } },
    required: ["password"], additionalProperties: false } }
  const aliasRun = await new TaskChainRuntime().execute({ chain: aliased, request: requestFor(aliased, { password: "synthetic-private-alias" }), capabilities: {} })
  assert.equal(JSON.stringify(aliasRun.events).includes("synthetic-private-alias"), false)
  const read: StableChainNodeV2 = { id: "readFields", label: "读取", kind: "capability",
    capability: { name: "browser.read-fields", version: 2 }, input: {}, config: {}, effect: "read", timeoutMs: 1_000,
    outputContract: objectContract, writes: [], human: { reason: "login", prompt: "处理当前页面",
      resumeWhen: { operator: "exists", path: ["url"] } } }
  const fn = functionNode({ source: { source: "node", nodeId: read.id, path: [] } })
  const source = simpleChain(fn, [read])
  const chain = taskChainSchema.parse({ ...source, edges: source.edges.filter((edge) =>
    edge.from !== read.id || ("port" in edge ? edge.port : edge.outcome) === "success") }), request = requestFor(chain, null)
  const browser = { sessionId: "fixture-session", tabId: "fixture-tab", url: "https://example.com/",
    observationDigest: "a".repeat(64), observedAt: "2026-09-30T00:00:00Z" }
  let calls = 0
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    capability: async () => { calls++; return { outcome: "human_required", browser } },
  } })
  assert.equal(waiting.status, "waiting_for_human")
  const checkpoint = waiting.checkpoint!
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    capability: async () => { calls++; throw new Error("unexpected second dispatch") },
    verifyResume: async () => ({ ok: true, browser, observation: { url: browser.url, contents: "synthetic-resume-raw" } }),
  }, control: { checkpoint, resumeRequest: { contractVersion: waiting.contractVersion, requestId: alternateRunId,
    binding: checkpoint.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } } })
  assert.equal(resumed.status, "completed"); assert.equal(calls, 1)
  assert.deepEqual(finished(resumed, read.id).at(-1)?.execution?.output, { status: "redacted", reason: "raw_source" })
  assert.equal(JSON.stringify(resumed.events).includes("synthetic-resume-raw"), false)
})

test("外部效果不确定时started输入已经持久化，不伪造finished回执", async () => {
  const node: StableChainNodeV2 = { id: "readFields", label: "读取", kind: "capability",
    capability: { name: "browser.read-fields", version: 2 }, input: { value: constant(false) }, config: {},
    effect: "idempotent_write", timeoutMs: 1_000, outputContract: objectContract, writes: [] }
  const chain = simpleChain(node), persisted: TaskRun[] = []
  let calls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    capability: async () => { calls++; throw new Error("synthetic interrupted effect") },
    persist: async (value) => { persisted.push(structuredClone(value)) },
  } })
  assert.equal(run.status, "failed"); assert.equal(calls, 1)
  assert.equal(finished(run, node.id).length, 0)
  assert.deepEqual(run.events.at(-1)?.execution?.input, { status: "recorded", value: { value: false } })
  assert.deepEqual(persisted.at(-1)?.events, run.events)
  assert.equal(run.checkpoint?.pendingEffect?.status, "uncertain")
})

test("有序Branch只留真正求值的case实参，不改变短路顺序", async () => {
  const branch: StableChainNodeV2 = { id: "choose", label: "选择", kind: "branch", outputContract: nullContract, writes: [], cases: [
    { id: "first", label: "第一条", predicate: { operator: "equals", left: constant(0), right: constant(0) } },
    { id: "second", label: "第二条", predicate: { operator: "equals", left: constant(1), right: constant(1) } },
  ] }
  const chain = simpleChain(branch)
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {} })
  const event = finished(run, branch.id)[0]!
  assert.equal(event.outcome, "first")
  assert.deepEqual(inputFor(run, event), { status: "recorded", value: { "first.left": 0, "first.right": 0 } })
})

test("exists未读到绑定不制造空对象实参，真实空对象与空值仍留存", async () => {
  const branch: StableChainNodeV2 = { id: "choose", label: "检查", kind: "branch", outputContract: nullContract, writes: [], cases: [
    { id: "found", label: "存在", predicate: { operator: "exists", value: { source: "input", path: ["value"] } } },
  ] }
  const chain = taskChainSchema.parse({ ...simpleChain(branch), inputContract: objectContract })
  for (const input of [{}, { value: {} }, { value: null }, { value: false }, { value: 0 }, { value: "" }]) {
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, input), capabilities: {} })
    const record = inputFor(run, finished(run, branch.id)[0]!)
    assert.deepEqual(record, Object.hasOwn(input, "value") ? { status: "recorded", value: { "found.value": input.value } } : undefined)
  }
})

test("已知集合按稳定键记已处理量，游标跳重复不制造成功数量", async () => {
  const chain = loopChain(), items = [{ id: "a", value: "甲" }, { id: "a", value: "甲" }, { id: "b", value: "乙" }]
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items }), capabilities: {
    browser: async () => ({ outcome: "success", output: null }),
  } })
  const gates = finished(run, "repeat")
  assert.deepEqual(gates.map((event) => event.execution?.loop), [
    { index: 0, activeStableKey: "a", completedStableKeysCount: 0, total: 2 },
    { index: 2, activeStableKey: "b", completedStableKeysCount: 1, total: 2 },
    { index: 3, activeStableKey: null, completedStableKeysCount: 2, total: 2, exitReason: "collection_exhausted" },
  ])
  assert.deepEqual(finished(run, "visit").map((event) => event.execution?.loops), [
    [{ nodeId: "repeat", index: 0, stableKey: "a" }], [{ nodeId: "repeat", index: 2, stableKey: "b" }],
  ])
})

test("未知总数while与技术限额不写分母，动态集合和身份碰撞也省略total", async () => {
  const whileSource = loopChain(), loop = whileSource.nodes.find((node) => node.kind === "loop")!
  if (loop.kind !== "loop") throw new Error("fixture_invalid")
  loop.iteration = { mode: "while", condition: { operator: "equals", left: constant(true), right: constant(true) } }
  loop.maxIterations = 2
  whileSource.nodes = whileSource.nodes.map((node) => node.id === "visit" && node.kind === "browser" ? { ...node, arguments: {} } : node)
  const whileChain = taskChainSchema.parse(whileSource)
  const whileRun = await new TaskChainRuntime().execute({ chain: whileChain, request: requestFor(whileChain, { items: [] }),
    capabilities: { browser: async () => ({ outcome: "success", output: null }) } })
  const gate = finished(whileRun, "repeat").at(-1)!
  assert.equal(gate.outcome, "limit"); assert.equal(gate.execution?.loop?.exitReason, "iteration_limit")
  assert.equal(gate.execution?.loop?.completedStableKeysCount, 2)
  assert.ok(finished(whileRun, "repeat").every((event) => !Object.hasOwn(event.execution!.loop!, "total")))
  const collisionChain = loopChain(), items = [{ id: "a", value: "甲" }, { id: "a", value: "乙" }]
  const collision = await new TaskChainRuntime().execute({ chain: collisionChain, request: requestFor(collisionChain, { items }),
    capabilities: { browser: async () => ({ outcome: "success", output: null }) } })
  assert.ok(finished(collision, "repeat").every((event) => !Object.hasOwn(event.execution!.loop!, "total")))
  const dynamic = loopChain(), dynamicLoop = dynamic.nodes.find((node) => node.kind === "loop")!
  if (dynamicLoop.kind !== "loop" || dynamicLoop.iteration.mode !== "each") throw new Error("fixture_invalid")
  const collection: LegacyChainNode = { id: "collection", label: "集合", kind: "data", operation: "assign",
    arguments: { value: { source: "input", path: ["items"] } }, outputContract: itemsContract,
    writes: [], outcomes: [...requiredNodeOutcomes.data] }
  dynamicLoop.iteration.collection = { source: "node", nodeId: collection.id, path: [] }
  dynamic.entry = collection.id; dynamic.nodes.unshift(collection)
  dynamic.edges.push(...collection.outcomes.map((outcome) => ({ from: collection.id, outcome,
    to: outcome === "success" ? dynamicLoop.id : "error" })))
  const dynamicChain = taskChainSchema.parse(dynamic)
  const dynamicRun = await new TaskChainRuntime().execute({ chain: dynamicChain, request: requestFor(dynamicChain, { items }),
    capabilities: { browser: async () => ({ outcome: "success", output: null }) } })
  assert.ok(finished(dynamicRun, "repeat").every((event) => !Object.hasOwn(event.execution!.loop!, "total")))
})

test("同run恢复延续事件sequence，重复幂等键不能覆盖原实参", async () => {
  const chain = loopChain(), request = requestFor(chain, { items: [{ id: "a", value: "甲" }, { id: "b", value: "乙" }] })
  const controller = new AbortController()
  let visits = 0
  const first = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    browser: async () => { visits++; if (visits === 2) controller.abort(); return { outcome: "success", output: null } },
  }, control: { signal: controller.signal } })
  assert.equal(first.status, "paused")
  const checkpoint = first.checkpoint!, before = structuredClone(first.events)
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    browser: async () => ({ outcome: "success", output: null }),
  }, control: { checkpoint, resumeRequest: { contractVersion: first.contractVersion, requestId: alternateRunId,
    binding: checkpoint.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } } })
  assert.deepEqual(resumed.events.slice(0, before.length), before)
  assert.equal(new Set(resumed.events.map((event) => event.sequence)).size, resumed.events.length)
})

test("terminal输出合同失败保留started实参和failed运行，不造完成终点", async () => {
  const fn = functionNode({ value: constant(0) }), source = simpleChain(fn)
  const terminal = source.nodes.find((node) => node.id === "done")!
  if (terminal.kind !== "terminal" || !("result" in terminal) || !terminal.result) throw new Error("fixture_invalid")
  terminal.result.output = { kind: "value", value: constant({ value: 0 }) }
  terminal.result.contract = { ...objectContract, schema: { type: "object", properties: { value: { type: "integer", minimum: 1 } },
    required: ["value"], additionalProperties: false } }
  terminal.outputContract = terminal.result.contract
  source.outputContract = terminal.result.contract
  const chain = taskChainSchema.parse(source)
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {} })
  assert.equal(run.status, "failed")
  assert.equal(finished(run, terminal.id).length, 0)
  assert.equal(run.events.at(-1)?.status, "started")
  assert.deepEqual(run.events.at(-1)?.execution?.input?.value, {
    kind: "value", contract: { id: "object", version: 1 }, value: { value: 0 },
  })
  assert.equal(run.outputs.result, undefined)
})
