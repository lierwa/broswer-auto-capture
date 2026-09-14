import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { CONTRACT_VERSION, requiredStableNodeOutcomes, stableTaskChainSchema, taskChainSchema,
  type JsonValue, type StableTaskChain, type TaskCheckpoint, type TaskRun } from "@browser-capture/contracts"
import { compileTaskChain, TaskChainRuntime, type TaskChainCapabilities } from "@browser-capture/runtime"
import {
  alternateInvocationId, alternateRunId, browserEffectChain, checkpointChain, childChainId,
  humanChain, invokeChain, llmChain, loopChain, requestFor, textContract,
} from "./task-chain-fixtures.js"

const items = [
  { id: "first", value: "甲" }, { id: "second", value: "乙" }, { id: "third", value: "丙" },
]

test("正式 runtime 显式保留已验证的 LangGraph 执行依赖", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  assert.equal(manifest.dependencies?.["@langchain/langgraph"], "1.4.14")
})

test("普通运行器按稳定键有界循环；复跑同一链路不调用模型", async () => {
  const chain = loopChain(), visited: unknown[] = []
  let rawBrowserCommands = 0
  let hiddenModelCalls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items }), capabilities: {
    browserCommandCount: () => rawBrowserCommands,
    browser: async ({ arguments: values }) => { visited.push(values.item); rawBrowserCommands += 2; return { outcome: "success", output: null } },
    llm: async () => { hiddenModelCalls += 1; throw new Error("ordinary_node_called_model") },
  } })
  assert.equal(run.status, "completed")
  assert.deepEqual(visited, items)
  assert.equal(hiddenModelCalls, 0)
  assert.equal(run.consumed.llmCalls, 0)
  assert.equal(run.consumed.browserCommands, 6)
  assert.equal(run.modelCalls.length, 0)
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "task-items", version: 1 }, value: items })
  const stableKeys = run.events.filter((event) => event.nodeId === "visit" && event.status === "finished")
    .map((event) => event.stableKey)
  assert.deepEqual(stableKeys, ["repeat=first", "repeat=second", "repeat=third"])
})

test("稳定 while 循环只保存一份翻页能力，并把各批结果按稳定键累计", async () => {
  const chain = pagedCollectionChain(), pages = [
    { items: [{ id: "two", text: "乙" }], hasMore: true },
    { items: [{ id: "two", text: "重复" }, { id: "three", text: "丙" }], hasMore: false },
  ]
  let bodyCalls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    capability: async ({ node }) => {
      if (node.id === "open") return { outcome: "success", output: { items: [{ id: "one", text: "甲" }], hasMore: true } }
      bodyCalls += 1
      return { outcome: "success", output: pages.shift()! }
    },
  } })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.equal(bodyCalls, 2)
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "items", version: 1 }, value: [
    { id: "one", text: "甲" }, { id: "two", text: "乙" }, { id: "three", text: "丙" },
  ] })
  assert.equal(run.consumed.llmCalls, 0)
  assert.equal(chain.nodes.filter((node) => node.id === "nextPage").length, 1)
})

test("循环按本轮结果决定累计，并在动态数量满足后立即停止", async () => {
  const source = pagedCollectionChain(), loop = source.nodes.find((node) => node.kind === "loop")
  if (!loop || loop.kind !== "loop" || !("accumulators" in loop)) assert.fail("stable loop fixture")
  loop.accumulators[0]!.appendWhen = { operator: "equals",
    left: { source: "node", nodeId: "nextPage", path: ["hasMore"] },
    right: { source: "constant", value: true } }
  loop.stopWhen = { operator: "array_length_at_least",
    value: { source: "variable", name: "collected", path: [] },
    minimum: { source: "constant", value: 2 } }
  const chain = stableTaskChainSchema.parse(source)
  let bodyCalls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    capability: async ({ node }) => {
      if (node.id === "open") return { outcome: "success", output: { items: [{ id: "one", text: "甲" }], hasMore: true } }
      bodyCalls += 1
      return { outcome: "success", output: { items: [{ id: "two", text: "乙" }], hasMore: true } }
    },
  } })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.equal(bodyCalls, 1)
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "items", version: 1 }, value: [
    { id: "one", text: "甲" }, { id: "two", text: "乙" },
  ] })

  const filteredSource = pagedCollectionChain(), filteredLoop = filteredSource.nodes.find((node) => node.kind === "loop")
  if (!filteredLoop || filteredLoop.kind !== "loop" || !("accumulators" in filteredLoop)) assert.fail("stable loop fixture")
  filteredLoop.accumulators[0]!.appendWhen = { operator: "equals",
    left: { source: "node", nodeId: "nextPage", path: ["hasMore"] },
    right: { source: "constant", value: true } }
  const filtered = stableTaskChainSchema.parse(filteredSource)
  const filteredRun = await new TaskChainRuntime().execute({ chain: filtered, request: requestFor(filtered, null), capabilities: {
    capability: async ({ node }) => node.id === "open"
      ? { outcome: "success", output: { items: [{ id: "one", text: "甲" }], hasMore: true } }
      : { outcome: "success", output: { items: [{ id: "two", text: "乙" }], hasMore: false } },
  } })
  assert.deepEqual(filteredRun.outputs.result, { kind: "value", contract: { id: "items", version: 1 }, value: [
    { id: "one", text: "甲" },
  ] })
})

test("运行图可按链路预算推进超过默认递归阈值", async () => {
  const source = loopChain()
  const chain = { ...source,
    budget: { ...source.budget, maxBrowserCommands: 40 },
    nodes: source.nodes.map((node) => node.kind === "loop" ? { ...node, maxIterations: 40 } : node) }
  const parsed = taskChainSchema.parse(chain)
  const manyItems = Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}`, value: `值-${index}` }))
  let browserCalls = 0
  const run = await new TaskChainRuntime().execute({ chain: parsed, request: requestFor(parsed, { items: manyItems }), capabilities: {
    browser: async () => { browserCalls += 1; return { outcome: "success", output: null } },
  } })
  assert.equal(run.status, "completed")
  assert.equal(browserCalls, manyItems.length)
  assert.ok(run.consumed.transitions > 25)
})

test("外部取消会停止运行图并保留可审计检查点", async () => {
  const chain = loopChain(), controller = new AbortController()
  let browserCalls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items }), capabilities: {
    browser: async () => { browserCalls += 1; controller.abort(); return { outcome: "success", output: null } },
  }, control: { signal: controller.signal } })
  assert.equal(run.status, "paused")
  assert.equal(run.outcome?.status, "paused")
  if (run.outcome?.status !== "paused") throw new Error("fixture_expected_paused")
  assert.equal(run.outcome.cause, "interrupted")
  assert.equal(browserCalls, 1)
  assert.ok(run.checkpoint)
})

test("invoke each 对不同输入只调用同一个已固定版本链路", async () => {
  const chain = invokeChain(), calls: { chainId: string; value: unknown; invocationId: string; stableKey: string }[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items }), capabilities: {
    invoke: async ({ chain: child, input, invocationId, stableKey }) => {
      calls.push({ chainId: child.id, value: input, invocationId, stableKey })
      return { outcome: { status: "completed", reason: "子链完成", evidence: [], completionEvidence: ["child"] },
        output: { kind: "value", contract: { id: "child-output", version: 1 }, value: input } }
    },
  } })
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.invocations, items.length)
  assert.deepEqual(calls.map((call) => call.chainId), [childChainId, childChainId, childChainId])
  assert.deepEqual(calls.map((call) => call.value), items)
  assert.deepEqual(calls.map((call) => call.stableKey), ["first", "second", "third"])
  assert.equal(new Set(calls.map((call) => call.invocationId)).size, items.length)
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "invocation-results", version: 1 }, value: items })
})

test("invoke each 在调用子链前按稳定键去重，并拒绝同键不同输入", async () => {
  const chain = invokeChain(), calls: string[] = []
  const duplicated = [...items, structuredClone(items[0]!)]
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items: duplicated }), capabilities: {
    invoke: async ({ stableKey, input }) => { calls.push(stableKey); return { outcome: { status: "completed", reason: "完成",
      evidence: [], completionEvidence: ["child"] }, output: { kind: "value", contract: { id: "child-output", version: 1 }, value: input } } },
  } })
  assert.equal(run.status, "completed"); assert.deepEqual(calls, ["first", "second", "third"])

  const collision = [...items, { id: "first", value: "不同内容" }]
  let collisionCalls = 0
  const failed = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { items: collision }), capabilities: { invoke: async () => {
    collisionCalls += 1
    throw new Error("collision_must_fail_before_invoke")
  } } })
  assert.equal(failed.status, "failed"); assert.equal(collisionCalls, 0)
})

test("外部访问中断跨终止节点保留在 TaskRun", async () => {
  const chain = browserEffectChain(), failure = { category: "access_denied" as const, code: "origin_denied",
    origin: "https://example.com", observedOrigin: "https://blocked.example", httpStatus: null, retryAt: null }
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    browser: async () => ({ outcome: "blocked", reason: "origin_denied", externalFailure: failure }),
  } })
  assert.equal(run.status, "failed"); assert.deepEqual(run.externalFailure, failure)
})

test("invoke each 超出 maxItems 时保留部分结果且不能伪装完成", async () => {
  const source = invokeChain(), chain = { ...source, nodes: source.nodes.map((node) => node.kind === "invoke"
    ? { ...node, iteration: { ...node.iteration, maxItems: 2 } } : node) }
  const parsed = taskChainSchema.parse(chain)
  let calls = 0
  const run = await new TaskChainRuntime().execute({ chain: parsed, request: requestFor(parsed, { items }), capabilities: {
    invoke: async ({ input }) => { calls += 1; return { outcome: { status: "completed", reason: "子链完成",
      evidence: [], completionEvidence: ["child"] }, output: { kind: "value",
      contract: { id: "child-output", version: 1 }, value: input } } },
  } })
  assert.equal(calls, 2)
  assert.notEqual(run.status, "completed")
})

test("子链人工等待向父链传播；同一子调用恢复时不重复计费", async () => {
  const source = invokeChain(), chain = { ...source, nodes: source.nodes.map((node) => node.kind === "invoke"
    ? { ...node, iteration: { ...node.iteration, maxItems: 1 } } : node) }
  const parsed = taskChainSchema.parse(chain)
  const request = requestFor(parsed, { items: [items[0]!] })
  let calls = 0
  const invoke: NonNullable<TaskChainCapabilities["invoke"]> = async ({ input }) => {
    calls += 1
    return calls === 1 ? { outcome: { status: "waiting_for_human" as const, reason: "等待子链登录", evidence: [],
      waitpointId: "20000000-0000-4000-8000-000000000011", checkpointId: "20000000-0000-4000-8000-000000000012" }, output: null }
      : { outcome: { status: "completed" as const, reason: "子链完成", evidence: [], completionEvidence: ["child"] },
        output: { kind: "value" as const, contract: { id: "child-output", version: 1 }, value: input } }
  }
  const waiting = await new TaskChainRuntime().execute({ chain: parsed, request, capabilities: { invoke } })
  assert.equal(waiting.status, "waiting_for_human")
  assert.equal(waiting.consumed.invocations, 1)
  const checkpoint = waiting.checkpoint!
  const completed = await new TaskChainRuntime().execute({ chain: parsed, request, capabilities: { invoke }, control: {
    checkpoint, resumeRequest: resumeRequest(checkpoint),
  } })
  assert.equal(completed.status, "completed")
  assert.equal(completed.consumed.invocations, 1)
  assert.equal(calls, 2)
})

test("显式 checkpoint 暂停后从同一运行与下一游标恢复", async () => {
  const chain = checkpointChain(), request = requestFor(chain, "原始输入")
  const snapshots: TaskRun[] = []
  const paused = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    persist: (run) => { snapshots.push(structuredClone(run)) },
  }, control: { pauseAtCheckpoint: true } })
  assert.equal(paused.status, "paused")
  assert.equal(paused.checkpoint?.cursor, "emit")
  assert.ok(snapshots.some((snapshot) => snapshot.status === "paused"))
  const checkpoint = paused.checkpoint!
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: {}, control: {
    checkpoint, resumeRequest: resumeRequest(checkpoint),
  } })
  assert.equal(resumed.status, "completed")
  assert.equal(resumed.binding.runId, paused.binding.runId)
  assert.ok(resumed.events.length > paused.events.length)
  assert.deepEqual(resumed.events.slice(0, paused.events.length), paused.events)
  assert.equal(resumed.events.filter((event) => event.nodeId === "data" && event.status === "finished").length, 1)
})

test("human waitpoint 保存现场，恢复时由 fresh observation 决定继续", async () => {
  const chain = humanChain(), request = requestFor(chain, { ready: false })
  const resumingFlags: boolean[] = []
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    human: async ({ resuming }) => {
      resumingFlags.push(resuming)
      return resuming ? { outcome: "success", output: { ready: true } }
        : { outcome: "human_required", reason: "等待用户" }
    },
  } })
  assert.equal(waiting.status, "waiting_for_human")
  assert.equal(waiting.checkpoint?.cursor, "human")
  const checkpoint = waiting.checkpoint!
  const completed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    human: async ({ resuming }) => {
      resumingFlags.push(resuming)
      return { outcome: "success", output: { ready: true } }
    },
  }, control: { checkpoint, resumeRequest: resumeRequest(checkpoint) } })
  assert.equal(completed.status, "completed")
  assert.deepEqual(resumingFlags, [false, true])
  assert.deepEqual(completed.outputs.result, {
    kind: "value", contract: { id: "ready-result", version: 1 }, value: { ready: true },
  })
})

test("显式 llm 节点先记调用意图，再按供应商实际回报计数", async () => {
  const chain = llmChain(), persisted: TaskRun[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, "输入"), capabilities: {
    llm: async () => ({ outcome: "success", output: "输出", reportedInvocations: 1 }),
    persist: (state) => { persisted.push(structuredClone(state)) },
  } })
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.llmCalls, 1)
  assert.equal(run.modelCalls.length, 1)
  assert.equal(run.modelCalls[0]?.status, "completed")
  assert.ok(persisted.some((state) => state.modelCalls[0]?.status === "intended"
    && state.checkpoint?.pendingEffect?.kind === "llm"))
})

test("未决浏览器副作用不会在恢复时被自动重放", async () => {
  const chain = browserEffectChain(), request = requestFor(chain, null)
  let calls = 0
  const failed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    browser: async () => { calls += 1; throw new Error("transport_disconnected") },
  } })
  assert.equal(failed.status, "failed")
  assert.equal(failed.checkpoint?.pendingEffect?.status, "uncertain")
  const checkpoint = failed.checkpoint!
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    browser: async () => { calls += 1; return { outcome: "success", output: null } },
  }, control: { checkpoint, resumeRequest: resumeRequest(checkpoint) } })
  assert.equal(resumed.status, "paused")
  assert.equal(resumed.outcome?.status, "paused")
  assert.equal(calls, 1)
})

test("compiler 拒绝无界回边、不可完成预算、提前读取变量和错误 schema 路径", () => {
  const unbounded = loopChain()
  unbounded.edges = unbounded.edges.map((edge) => edge.from === "visit" && edge.outcome === "success"
    ? { ...edge, to: "visit" } : edge)
  assert.throws(() => compileTaskChain(unbounded), /chain_unbounded_cycle/)

  const unavailable = invokeChain()
  const invoke = unavailable.nodes.find((node) => node.kind === "invoke")!
  if (invoke.kind !== "invoke") throw new Error("fixture_invalid")
  invoke.iteration = { mode: "once" }
  assert.throws(() => compileTaskChain(unavailable), /binding_variable_not_available/)

  const badPath = loopChain()
  const emit = badPath.nodes.find((node) => node.kind === "emit")!
  if (emit.kind !== "emit" || emit.output.kind !== "value") throw new Error("fixture_invalid")
  emit.output.value = { source: "input", path: ["missing"] }
  assert.throws(() => compileTaskChain(badPath), /binding_path_contract_mismatch/)

  const terminalCycle = loopChain()
  terminalCycle.edges = terminalCycle.edges.map((edge) => edge.from === "repeat" && edge.outcome === "limit"
    ? { ...edge, to: "visit" } : edge)
  assert.throws(() => compileTaskChain(terminalCycle), /loop_terminal_outcome_cycles/)

  const overBudget = checkpointChain()
  overBudget.budget = { ...overBudget.budget, maxTransitions: 3 }
  assert.throws(() => compileTaskChain(overBudget), /chain_transition_budget_exceeded/)

  const badDataArguments = checkpointChain()
  const data = badDataArguments.nodes.find((node) => node.kind === "data")!
  if (data.kind !== "data") throw new Error("fixture_invalid")
  data.operation = "count"; data.arguments = { collection: { source: "input", path: [] } }
  assert.throws(() => compileTaskChain(badDataArguments), /data_count_source_required/)

  const badBrowserContract = browserEffectChain()
  const browser = badBrowserContract.nodes.find((node) => node.kind === "browser")!
  browser.outputContract = textContract
  assert.throws(() => compileTaskChain(badBrowserContract), /unit_node_contract_required/)

  const badStableKey = loopChain()
  const loop = badStableKey.nodes.find((node) => node.kind === "loop")!
  if (loop.kind !== "loop" || loop.iteration.mode !== "each") throw new Error("fixture_invalid")
  loop.iteration.stableKeyPath = []
  assert.throws(() => compileTaskChain(badStableKey), /iteration_stable_key_contract_required/)

  const scalarCollection = loopChain()
  const scalarLoop = scalarCollection.nodes.find((node) => node.kind === "loop")!
  if (scalarLoop.kind !== "loop" || scalarLoop.iteration.mode !== "each") throw new Error("fixture_invalid")
  scalarLoop.iteration.collection = { source: "input", path: ["items", 0, "id"] }
  assert.throws(() => compileTaskChain(scalarCollection), /iteration_collection_contract_required/)
})

function pagedCollectionChain(): StableTaskChain {
  const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
  const item = { type: "object" as const, properties: { id: { type: "string" as const }, text: { type: "string" as const } },
    required: ["id", "text"], additionalProperties: false }
  const itemsContract = { id: "items", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "array" as const, items: item } }
  const pageContract = { id: "page", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: { items: itemsContract.schema,
      hasMore: { type: "boolean" as const } }, required: ["items", "hasMore"], additionalProperties: false } }
  const capability = (id: string) => ({ id, label: id, kind: "capability" as const,
    capability: { name: "test.page", version: 1 }, input: {}, config: {}, effect: "read" as const,
    timeoutMs: 1000, outcomes: [...requiredStableNodeOutcomes.capability], outputContract: pageContract, writes: [] })
  const open = capability("open"), next = capability("nextPage")
  const loop = { id: "pages", label: "pages", kind: "loop" as const,
    iteration: { mode: "while" as const,
      condition: { operator: "equals" as const, left: { source: "node" as const, nodeId: open.id, path: ["hasMore"] },
        right: { source: "constant" as const, value: true } },
      repeatCondition: { operator: "equals" as const, left: { source: "node" as const, nodeId: next.id, path: ["hasMore"] },
        right: { source: "constant" as const, value: true } } },
    cursorVariable: "cursor", maxIterations: 3, body: { entry: next.id, exits: [next.id] },
    accumulators: [{ variable: "collected", initial: { source: "node" as const, nodeId: open.id, path: ["items"] },
      next: { source: "node" as const, nodeId: next.id, path: ["items"] }, operation: "append_unique" as const,
      stableKeyPath: ["id"] }], outcomes: [...requiredStableNodeOutcomes.loop], outputContract: unit, writes: [] }
  const completed = { id: "completed", label: "completed", kind: "terminal" as const, status: "completed" as const,
    reason: "done", evidence: [{ source: "variable" as const, name: "collected", path: [] }],
    result: { name: "result", output: { kind: "value" as const,
      value: { source: "variable" as const, name: "collected", path: [] } }, contract: itemsContract },
    outcomes: [], outputContract: itemsContract, writes: [] }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const,
    reason: "failed", evidence: [{ source: "constant" as const, value: "failed" }], outcomes: [], outputContract: unit, writes: [] }
  const edges = [
    ...open.outcomes.map((outcome) => ({ from: open.id, outcome, to: outcome === "success" ? loop.id : failed.id })),
    ...loop.outcomes.map((outcome) => ({ from: loop.id, outcome,
      to: outcome === "body" ? next.id : outcome === "done" ? completed.id : failed.id })),
    ...next.outcomes.map((outcome) => ({ from: next.id, outcome, to: outcome === "success" ? loop.id : failed.id })),
  ]
  return stableTaskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v1",
    id: "40000000-0000-4000-8000-000000000001", taskId: "40000000-0000-4000-8000-000000000002", version: 1,
    plan: { id: "40000000-0000-4000-8000-000000000003", version: 1, digest: "e".repeat(64) },
    stepId: "collect", name: "paged collection", inputContract: unit, outputContract: itemsContract,
    variables: { cursor: { id: "cursor", version: 1, dialect: "bat-value-schema/v1", schema: { type: "integer", minimum: 0 } },
      collected: itemsContract }, entry: open.id, nodes: [open, loop, next, completed, failed], edges,
    completion: [{ id: "result", description: "result exists",
      predicate: { operator: "exists", value: { source: "variable", name: "collected", path: [] } } }],
    budget: { maxTransitions: 20, maxBrowserCommands: 0, maxActiveMs: 10_000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "same output shape", assumptions: [], invalidationConditions: [] },
    implementationSummary: "one bounded body", validation: { status: "candidate", evidence: [] } })
}

function resumeRequest(checkpoint: TaskCheckpoint) {
  return { contractVersion: CONTRACT_VERSION, requestId: alternateRunId, binding: checkpoint.binding,
    checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence }
}

test("不同运行身份仍可复用同一编译链路", async () => {
  const chain = checkpointChain()
  const first = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, "甲"), capabilities: {} })
  const second = await new TaskChainRuntime().execute({ chain,
    request: requestFor(chain, "乙", "verification", alternateRunId, alternateInvocationId), capabilities: {} })
  assert.equal(first.status, "completed")
  assert.equal(second.status, "completed")
  assert.notEqual(first.binding.runId, second.binding.runId)
  assert.equal(first.binding.chain.digest, second.binding.chain.digest)
})
