import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { taskPlanSchema, CONTRACT_VERSION, type JsonValue, type TaskDataContract } from "@browser-capture/contracts"
import { browserCapabilityConfigSchema } from "@browser-capture/browser"
import { TaskChainRuntime, digestJson, executableChainDigest,
  type NodeCapabilityResult, type TaskChainCapabilities } from "@browser-capture/runtime"
import { compileExplorationTrace } from "../src/task-chain/trace-compiler.js"
import { traceEvent, type ExplorationTrace } from "../src/task-chain/exploration-trace.js"

const string: TaskDataContract = { id: "string", version: 1, dialect: "bat-value-schema/v1", schema: { type: "string" } }
const inputContract: TaskDataContract = { ...string, id: "input", schema: { type: "object", properties: {
  url: { type: "string" }, text: { type: "string" } }, required: ["url", "text"], additionalProperties: false } }
const outputContract: TaskDataContract = { ...string, id: "output", schema: { type: "object", properties: {
  result: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } },
  required: ["result"], additionalProperties: false } }
const budget = { maxTransitions: 100, maxBrowserCommands: 100, maxActiveMs: 300000, maxLlmCalls: 1, maxInvocations: 1, maxDepth: 1 }
const readOutput = (text: string) => ({ url: "https://example.org/", observedAt: new Date().toISOString(),
  truncated: false, matches: [{ text, tag: "h1", attributes: {} }] })
type BrowserInvocation = { operation: string | null; arguments: Record<string, JsonValue>; target?: JsonValue }
type ObserveInvocation = { scope: "page" | "target" | "tabs" | "downloads" }
function stableCapabilities(handlers: {
  browser?: (invocation: BrowserInvocation) => Promise<NodeCapabilityResult>
  observe?: (invocation: ObserveInvocation) => Promise<NodeCapabilityResult>
  human?: () => Promise<NodeCapabilityResult>
  llm?: NonNullable<TaskChainCapabilities["llm"]>
}): TaskChainCapabilities {
  return { capability: async (invocation) => {
    const config = browserCapabilityConfigSchema.parse(invocation.config)
    if (config.mode === "human") return handlers.human?.() ?? { outcome: "success", output: null }
    const get = (name: string) => invocation.input[name]!
    const target = config.target ? config.target.kind === "semantic"
      ? { kind: "semantic", role: get(config.target.role), name: get(config.target.name),
        ...(config.target.fallbackName ? { fallbackName: get(config.target.fallbackName) } : {}),
        ...(config.target.occurrence ? { occurrence: get(config.target.occurrence) } : {}) }
      : { kind: "locator", strategy: config.target.strategy, value: get(config.target.value) } : undefined
    if (config.operation !== null) {
      const action = await (handlers.browser?.({ operation: config.operation,
        arguments: Object.fromEntries(Object.entries(config.arguments).map(([key, source]) => [key, get(source)])),
        ...(target ? { target } : {}) }) ?? Promise.resolve({ outcome: "success" as const, output: null }))
      if (action.outcome !== "success" || !config.capture) return action
    }
    return config.capture ? handlers.observe?.({ scope: config.capture.scope })
      ?? { outcome: "success", output: null } : { outcome: "success", output: null }
  }, ...(handlers.llm ? { llm: handlers.llm } : {}) }
}
function fixture(interactive: boolean) {
  const input = { url: "https://example.org/", text: "search" }, stepId = "perform"
  const completion = [{ id: "done", description: "output", predicate: { operator: "exists", value: { source: "node", nodeId: stepId, path: [] } } }]
  const plan = taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id: randomUUID(), taskId: "task", version: 1,
    requirement: { id: randomUUID(), version: 1, digest: "a".repeat(64), revision: 1 }, summary: "task", inputContract, outputContract,
    steps: [{ id: stepId, title: "task", goal: "task", dependsOn: [], inputContract, outputContract, input: { source: "input", path: [] },
      invocation: { mode: "once" }, chain: { id: randomUUID(), version: 1 }, budget, completion, risks: [] }],
    output: { source: "node", nodeId: stepId, path: [] }, budget, completion, evidence: [], authorizationScope: "task" })
  const events = [traceEvent("nav", { type: "navigate", url: input.url }, null, null)]
  if (interactive) events.push(traceEvent("fill", { type: "fill", target: { role: "textbox", name: "Search" }, value: input.text },
    { url: input.url, text: "filled", truncated: false }, null))
  events.push(traceEvent("read", { type: "read", selector: "h1", maxItems: 100 }, readOutput("Observed"), null))
  const provenance = [{ source: "tool" as const, outputPath: ["result", "title"], eventId: "read", resultPath: ["matches", 0, "text"] }]
  const trace: ExplorationTrace = { jobId: "job", browserRunId: "browser", input, events,
    result: { result: { result: { title: "Observed" } }, provenance }, calls: 1, conclusion: "done", closed: true }
  const annotations = { inputBindings: [{ eventId: "nav", commandPath: ["url"], inputPath: ["url"] },
    ...(interactive ? [{ eventId: "fill", commandPath: ["value"], inputPath: ["text"] }] : [])], repeatRegions: [], outputMappings: provenance,
    completion: [{ eventId: "read", resultPath: ["matches", 0, "text"], description: "结果存在" }],
    reuseBoundary: { description: "stable target", assumptions: [], invalidationConditions: [] } }
  return { trace, annotations, plan }
}

test("公共图只保留稳定节点，重复观察事件不会扩张节点数量", () => {
  const baseline = fixture(false)
  const compact = compileExplorationTrace(baseline.trace, baseline.annotations, baseline.plan, "perform", 1, "fixture")
  const repeated = fixture(false)
  const probes = Array.from({ length: 20 }, (_, index) => traceEvent(`probe-${index}`,
    { type: "page" }, { url: repeated.trace.input && typeof repeated.trace.input === "object" && !Array.isArray(repeated.trace.input)
      ? String(repeated.trace.input.url) : "https://example.org/", text: `probe ${index}`, truncated: false }, null))
  repeated.trace.events.splice(1, 0, ...probes)
  const expandedEvidence = compileExplorationTrace(repeated.trace, { ...repeated.annotations,
    replayEventIds: repeated.trace.events.map((event) => event.id) }, repeated.plan, "perform", 1, "fixture")
  const stableKinds = new Set(["capability", "llm", "branch", "loop", "invoke", "terminal"])
  assert.ok(compact.nodes.every((node) => stableKinds.has(node.kind)), compact.nodes.map((node) => node.kind).join(","))
  assert.equal(expandedEvidence.nodes.length, compact.nodes.length)
})

for (const interactive of [false, true]) test(`${interactive ? "交互" : "读页面"}轨迹生成稳定图，正式运行器用新输入完成且零模型调用`, async () => {
  const { trace, annotations, plan } = fixture(interactive)
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture")
  assert.deepEqual(compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture"), chain)
  const input = { url: "https://different.org/", text: "different" }, calls: JsonValue[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample", input,
    binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(), plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } },
    capabilities: stableCapabilities({ browser: async (invocation) => { calls.push(invocation.arguments); return { outcome: "success", output: null } },
      observe: async (invocation) => ({ outcome: "success", output: invocation.scope === "page"
        ? { url: input.url, text: "action completed", truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
        : readOutput("New result") }) }) })
  assert.equal(run.status, "completed")
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "output", version: 1 }, value: { result: { title: "New result" } } })
  assert.deepEqual(calls[0], { url: input.url, captureNetworkEvidence: true })
  if (interactive) assert.deepEqual(calls[1], { value: input.text })
  if (interactive) {
    const action = chain.nodes.find((node) => node.id === "perform1")
    assert.equal(action?.kind, "capability")
    if (action?.kind !== "capability" || action.outputContract.schema.type !== "object") assert.fail("observation contract")
    assert.ok(action.outputContract.schema.required.includes("observedAt"))
    assert.deepEqual(action.config && typeof action.config === "object" && !Array.isArray(action.config)
      ? action.config.capture : null, { scope: "page" })
    assert.equal(chain.budget.maxBrowserCommands, plan.steps[0]!.budget.maxBrowserCommands,
      "底层命令由 BrowserSkill 记账，编译器必须继承步骤授权上限")
  }
  assert.equal(run.consumed.llmCalls, 0)
})

test("显式重名顺序从探索命令编译并在运行时保持", async () => {
  const { trace, annotations, plan } = fixture(true)
  trace.events[1] = traceEvent("fill", { type: "fill", target: { role: "textbox", name: "Search", occurrence: 1 },
    value: "search" }, { url: "https://example.org/", text: "filled", truncated: false }, null)
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture"), targets: JsonValue[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION,
    requestId: randomUUID(), mode: "sample", input: trace.input,
    binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(),
      plan: chain.plan, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
      inputDigest: digestJson(trace.input) } }, capabilities: stableCapabilities({ browser: async (invocation) => {
      if (invocation.target) targets.push(invocation.target as JsonValue)
      return { outcome: "success", output: null }
    }, observe: async (invocation) => ({ outcome: "success", output: invocation.scope === "page"
      ? { url: "https://example.org/", text: "done", truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
      : readOutput("Observed") }) }) })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.deepEqual(targets, [{ kind: "semantic", role: "textbox", name: "Search", occurrence: 1 }])
})

test("偶发人工验证以真实恢复页为条件，验证页不能仅因存在 URL 而跳过", () => {
  const { trace, annotations, plan } = fixture(false)
  const help = traceEvent("help", { type: "request_help", reason: "captcha", prompt: "请完成人工验证" },
    { url: "https://example.org/item/1", text: "商品详情", truncated: false }, null)
  trace.events.splice(1, 0, help)
  const chain = compileExplorationTrace(trace, { ...annotations,
    replayEventIds: ["nav", "help", "read"] }, plan, "perform", 1, "fixture")
  const node = chain.nodes.find((item) => item.kind === "capability" && item.human)
  assert.equal(node?.kind, "capability")
  if (node?.kind !== "capability" || !node.human) assert.fail("human capability")
  assert.deepEqual(node.human.resumeWhen, { operator: "equals", path: ["url"],
    expected: { source: "constant", value: "https://example.org/item/1" } })
})

test("闭集语义目标角色与名称都可由运行输入参数化", async () => {
  const { trace, annotations, plan } = fixture(true)
  trace.input = { ...(trace.input as Record<string, JsonValue>), role: "textbox" }
  const schema = plan.inputContract.schema
  if (schema.type !== "object") assert.fail("object fixture")
  schema.properties.role = { type: "string", enum: ["textbox", "combobox"] }; schema.required.push("role")
  plan.steps[0]!.inputContract = plan.inputContract
  annotations.inputBindings.push({ eventId: "fill", commandPath: ["target", "role"], inputPath: ["role"] })
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture")
  const target = chain.nodes.find((node) => node.id === "perform1")
  assert.equal(target?.kind, "capability")
  if (target?.kind !== "capability") assert.fail("semantic target")
  assert.deepEqual(target.input.targetRole, { source: "input", path: ["role"] })
})

test("任意字符串角色不会覆盖首次成功轨迹的可访问角色", () => {
  const { trace, annotations, plan } = fixture(true)
  trace.input = { ...(trace.input as Record<string, JsonValue>), role: "textbox" }
  const schema = plan.inputContract.schema
  if (schema.type !== "object") assert.fail("object fixture")
  schema.properties.role = { type: "string" }; schema.required.push("role")
  plan.steps[0]!.inputContract = plan.inputContract
  annotations.inputBindings.push({ eventId: "fill", commandPath: ["target", "role"], inputPath: ["role"] })
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture")
  const target = chain.nodes.find((node) => node.id === "perform1")
  if (target?.kind !== "capability") assert.fail("semantic target")
  assert.deepEqual(target.input.targetRole, { source: "constant", value: "textbox" })
})

test("唯一稳定输入子串编译为语义名称回退", () => {
  const { trace, annotations, plan } = fixture(true)
  trace.input = { url: "https://example.org/", text: "search", visibleName: "Original MODEL-7 title", stableKey: "MODEL-7" }
  const schema = plan.inputContract.schema
  if (schema.type !== "object") assert.fail("object fixture")
  schema.properties.visibleName = { type: "string" }; schema.properties.stableKey = { type: "string" }
  schema.required.push("visibleName", "stableKey"); plan.steps[0]!.inputContract = plan.inputContract
  trace.events[1] = traceEvent("fill", { type: "fill", target: { role: "textbox", name: "Original MODEL-7 title" }, value: "search" },
    { url: "https://example.org/", text: "filled", truncated: false }, null)
  annotations.inputBindings.push({ eventId: "fill", commandPath: ["target", "name"], inputPath: ["visibleName"] })
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture")
  const target = chain.nodes.find((node) => node.id === "perform1")
  if (target?.kind !== "capability") assert.fail("semantic target")
  assert.deepEqual(target.input.targetFallbackName, { source: "input", path: ["stableKey"] })
})

test("运行输入中的已观察 URL 折叠上游铺路动作", () => {
  const { trace, annotations, plan } = fixture(false)
  const detailUrl = "https://example.org/detail"
  const observed = (url: string, text: string) => ({ sessionId: "abcd", tabId: 7, url, text, truncated: false,
    observedAt: "2026-09-13T00:00:00.000Z" })
  const home = observed("https://example.org/home", "home"), detail = observed(detailUrl, "detail")
  trace.input = { url: detailUrl, text: "unused" }
  trace.events = [
    traceEvent("home", { type: "navigate", url: home.url }, { url: home.url, text: "home", truncated: false }, home),
    traceEvent("open", { type: "click", target: { role: "button", name: "Open" } },
      { url: detailUrl, text: "detail", truncated: false }, detail),
    traceEvent("read", { type: "read", selector: "h1", maxItems: 100 }, readOutput("Observed"), detail),
  ]
  annotations.inputBindings = []
  const chain = compileExplorationTrace(trace, annotations, plan, "perform", 1, "fixture")
  const actions = chain.nodes.filter((node) => {
    if (node.kind !== "capability" || node.capability.name !== "browser.perform") return false
    const config = browserCapabilityConfigSchema.parse(node.config)
    return config.mode === "perform" && config.operation === "navigate"
  })
  assert.equal(actions.length, 1)
  if (actions[0]!.kind !== "capability") assert.fail("browser entry")
  const config = browserCapabilityConfigSchema.parse(actions[0]!.config)
  if (config.mode !== "perform") assert.fail("browser perform")
  assert.equal(config.operation, "navigate")
  assert.deepEqual(actions[0]!.input.argumentUrl, { source: "input", path: ["url"] })
  assert.deepEqual(actions[0]!.input.argumentReuseOpenTab, { source: "constant", value: true })
})

test("输出推断生成显式 llm；失败轨迹和无界循环不能冻结", () => {
  const { trace, annotations, plan } = fixture(false)
  const mappings = [{ source: "inference" as const, outputPath: ["result", "title"], eventIds: ["read"], instruction: "summarize" }]
  const inferred = { ...trace, result: { ...trace.result!, provenance: mappings } }
  const chain = compileExplorationTrace(inferred, { ...annotations, outputMappings: mappings }, plan, "perform", 1, "chosen-model")
  assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 1)
  assert.equal(chain.budget.maxLlmCalls, 1)
  assert.throws(() => compileExplorationTrace({ ...trace, events: [...trace.events, { ...trace.events[0]!, status: "failed", error: "failed" }] }, annotations, plan, "perform", 1, "fixture"))
  const failedProbe = traceEvent("failed-probe", { type: "click", target: { role: "button", name: "Missing" } }, null, null, "target_missing")
  const selected = compileExplorationTrace({ ...trace, events: [...trace.events, failedProbe] },
    { ...annotations, replayEventIds: ["nav", "read"] }, plan, "perform", 1, "fixture")
  assert.equal(selected.nodes.some((node) => node.label === "failed-probe"), false)
  assert.throws(() => compileExplorationTrace(trace, { ...annotations, repeatRegions: [{ maxItems: 0 }] }, plan, "perform", 1, "fixture"))
})

test("可选目标交互缺失时继续，但外部阻断仍进入类型化终点", async () => {
  const { trace, annotations, plan } = fixture(false)
  const dismiss = traceEvent("dismiss", { type: "click", target: { role: "button", name: "Close" } }, null, null)
  trace.events.splice(1, 0, dismiss)
  const chain = compileExplorationTrace(trace, { ...annotations, continueOnMissingEventIds: ["dismiss"] }, plan, "perform", 1, "fixture")
  const run = async (outcome: "missing" | "blocked") => new TaskChainRuntime().execute({ chain,
    request: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample", input: trace.input,
      binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(), plan: chain.plan,
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(trace.input) } },
    capabilities: stableCapabilities({ browser: async (invocation) => invocation.operation === "click" ? { outcome, output: null }
      : { outcome: "success", output: null }, observe: async () => ({ outcome: "success", output: readOutput("Observed") }) }) })
  assert.equal((await run("missing")).status, "completed")
  assert.equal((await run("blocked")).status, "blocked")
})

test("有界交互区域折叠为一个 loop，正式运行按集合复用同一动作", async () => {
  const { trace, annotations, plan } = fixture(true)
  const items = [{ id: "one", text: "search" }, { id: "two", text: "next" }]
  trace.input = { ...(trace.input as Record<string, JsonValue>), items }
  const schema = plan.inputContract.schema
  if (schema.type !== "object") assert.fail("object fixture")
  schema.properties.items = { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false }, maxItems: 2 }
  plan.steps[0]!.inputContract = plan.inputContract
  const annotation = { ...annotations, inputBindings: annotations.inputBindings.slice(0, 1), repeatRegions: [{
    startEventId: "fill", endEventId: "fill", collectionPath: ["items"], stableKeyPath: ["id"], maxItems: 2,
    itemBindings: [{ eventId: "fill", commandPath: ["value"], itemPath: ["text"] }] }] }
  const chain = compileExplorationTrace(trace, annotation, plan, "perform", 1, "fixture"), values: JsonValue[] = []
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample", input: trace.input,
    binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(), plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(trace.input) } },
    capabilities: stableCapabilities({ browser: async (invocation) => { if (invocation.operation === "fill") values.push(invocation.arguments.value!); return { outcome: "success", output: null } },
      observe: async (invocation) => ({ outcome: "success", output: invocation.scope === "page"
        ? { url: "https://example.org/", text: "action completed", truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
        : readOutput("done") }) }) })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome)); assert.deepEqual(values, ["search", "next"])
  assert.equal(chain.nodes.filter((node) => node.kind === "loop").length, 1)
})

test("多类逐项结果各保留一份显式 llm，并在接纳数量满足后停止循环", async () => {
  const { trace, annotations, plan } = fixture(true)
  const items = [{ id: "one", text: "甲", accepted: true }, { id: "two", text: "乙", accepted: true }]
  trace.input = { ...(trace.input as Record<string, JsonValue>), targetCount: 1 }
  const inputSchema = plan.inputContract.schema
  if (inputSchema.type !== "object") assert.fail("object fixture")
  inputSchema.properties.targetCount = { type: "integer", minimum: 1 }
  inputSchema.required.push("targetCount")
  plan.steps[0]!.inputContract = plan.inputContract
  const targets = { url: "https://example.org/", observedAt: "2026-09-14T00:00:00.000Z", truncated: false,
    matches: items.map((item) => ({ text: item.text, tag: "a", attributes: {} })) }
  trace.events.splice(1, 0, traceEvent("targets", { type: "read", selector: ".target", maxItems: 10 }, targets, null))
  trace.events[2] = traceEvent("fill", { type: "fill", target: { role: "textbox", name: "Search" }, value: "甲" },
    { url: "https://example.org/", text: "filled", truncated: false }, null)
  const itemSchema = { type: "object" as const, properties: { id: { type: "string" as const },
    text: { type: "string" as const }, accepted: { type: "boolean" as const } },
    required: ["id", "text", "accepted"], additionalProperties: false }
  const aggregateContract: TaskDataContract = { id: "aggregate", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { results: { type: "array", items: itemSchema },
      attempts: { type: "array", items: itemSchema } }, required: ["results", "attempts"], additionalProperties: false } }
  plan.outputContract = aggregateContract; plan.steps[0]!.outputContract = aggregateContract
  const mappings = ["results", "attempts"].flatMap((name) => items.map((_, index) => ({ source: "inference" as const,
    outputPath: [name, index], eventIds: ["read"], instruction: "从本轮页面证据产生当前项" })))
  trace.result = { result: { results: items, attempts: items }, provenance: mappings }
  const annotated = { ...annotations, inputBindings: annotations.inputBindings.slice(0, 1), outputMappings: mappings,
    repeatRegions: [{ startEventId: "fill", endEventId: "read",
      collectionEvent: { eventId: "targets", resultPath: ["matches"] }, stableKeyPath: ["text"],
      maxItems: 2, itemBindings: [{ eventId: "fill", commandPath: ["value"], itemPath: ["text"] }],
      aggregate: { outputPath: ["results"], itemOutputPath: ["results", 0], stableKeyPath: ["id"],
        appendWhen: { path: ["accepted"], equals: true }, stopAfterInputPath: ["targetCount"] },
      additionalAggregates: [{ outputPath: ["attempts"], itemOutputPath: ["attempts", 0], stableKeyPath: ["id"] }] }] }
  const chain = compileExplorationTrace(trace, annotated, plan, "perform", 1, "fixture")
  let llmCalls = 0, targetReads = 0
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(),
    mode: "sample", input: trace.input, binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId,
      authorizationId: randomUUID(), plan: chain.plan, chain: { id: chain.id, version: chain.version,
        digest: executableChainDigest(chain) }, inputDigest: digestJson(trace.input) } },
    capabilities: stableCapabilities({ browser: async () => ({ outcome: "success", output: null }),
      observe: async ({ scope }) => ({ outcome: "success", output: scope === "page"
        ? { url: "https://example.org/", text: "filled", truncated: false, observedAt: "2026-09-14T00:00:00.000Z" }
        : targetReads++ === 0 ? targets : readOutput(items[llmCalls]!.text) }),
      llm: async () => ({ outcome: "success", output: items[Math.floor(llmCalls++ / 2)]!, reportedInvocations: 1 }) }) })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.deepEqual(run.outputs.result, { kind: "value", contract: { id: "aggregate", version: 1 },
    value: { results: [items[0]], attempts: [items[0]] } })
  assert.equal(chain.nodes.filter((node) => node.kind === "loop").length, 1)
  assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 2)
  assert.equal(llmCalls, 2)
})

test("三个以上逐项输出没有循环注解时拒绝冻结为展开回放", () => {
  const { trace, annotations, plan } = fixture(false)
  const mappings = [0, 1, 2].map((index) => ({ source: "inference" as const,
    outputPath: ["results", index], eventIds: ["read"], instruction: "item" }))
  const itemSchema = { type: "object" as const, properties: { id: { type: "string" as const } },
    required: ["id"], additionalProperties: false }
  const aggregateContract: TaskDataContract = { id: "expanded", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { results: { type: "array", items: itemSchema } },
      required: ["results"], additionalProperties: false } }
  plan.outputContract = aggregateContract; plan.steps[0]!.outputContract = aggregateContract
  trace.result = { result: { results: [{ id: "one" }, { id: "two" }, { id: "three" }] }, provenance: mappings }
  assert.throws(() => compileExplorationTrace(trace, { ...annotations, outputMappings: mappings }, plan,
    "perform", 1, "fixture"), /trace_repeat_region_required/)
})

test("推断收到本次输入，业务值不符时不能仅凭页面存在宣告完成", async () => {
  for (const matches of [true, false]) {
    const { trace, annotations, plan } = fixture(false)
    plan.steps[0]!.completion = [{ id: "matches-input", description: "结果等于目标文本", predicate: { operator: "equals",
      left: { source: "node", nodeId: "perform", path: ["result", "title"] }, right: { source: "input", path: ["text"] } } }]
    const mappings = [{ source: "inference" as const, outputPath: ["result", "title"], eventIds: ["read"], instruction: "Read current text" }]
    trace.result!.provenance = mappings
    const chain = compileExplorationTrace(trace, { ...annotations, outputMappings: mappings }, plan, "perform", 1, "fixture")
    const input = { url: "https://different.org", text: "different text" }
    const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample", input,
      binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(), plan: chain.plan,
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } },
      capabilities: stableCapabilities({ browser: async () => ({ outcome: "success", output: null }), observe: async () => ({ outcome: "success", output: readOutput(input.text) }),
        llm: async (invocation) => {
          assert.deepEqual((invocation.input as Record<string, JsonValue>).runtimeInput, input)
          return { outcome: "success", output: matches ? input.text : "stale sample", reportedInvocations: 1 }
        } }) })
    assert.equal(run.status === "completed", matches, JSON.stringify(run.outcome))
  }
})
