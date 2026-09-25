import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, taskPlanSchema, type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, TaskChainRuntime } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"

type FixtureResultSpec = NonNullable<TaskPlan["steps"][number]["resultSpec"]>

const recordSchema = { type: "array" as const, items: { type: "object" as const, properties: {
  title: { type: "string" as const }, url: { type: "string" as const },
}, required: ["title", "url"], additionalProperties: false }, maxItems: 5 }
const detailSchema = { type: "object" as const, properties: {
  title: { type: "string" as const }, body: { type: "string" as const },
}, required: ["title", "body"], additionalProperties: false }
const outputSchema = { type: "object" as const, properties: {
  records: recordSchema, recordCount: { type: "integer" as const, minimum: 0, maximum: 5 }, detail: detailSchema,
}, required: ["records", "recordCount"], additionalProperties: false }
const resultSpec = { contractVersion: "bat-result-spec/v1" as const, mode: "data" as const, schema: outputSchema,
  fields: [
    { path: ["records"], description: "当前页记录", producerRef: "read-records" },
    { path: ["recordCount"], description: "记录数量", producerRef: "count-records" },
    { path: ["detail"], description: "首条详情", producerRef: "read-detail" },
  ], derivations: [{ producerRef: "count-records", operation: "count" as const,
    sourceProducerRef: "read-records", sourcePath: ["records"] }],
  edgeCases: [{ description: "空列表不读取首条详情", controlRef: "has-records" }] }

const constantSourceUrl = "https://fixture.invalid/issues"
const outputSchemaWithConstant = { type: "object" as const, properties: {
  ...outputSchema.properties, sourceUrl: { type: "string" as const },
}, required: ["records", "recordCount", "sourceUrl"], additionalProperties: false }
const resultSpecWithConstant: FixtureResultSpec = { ...resultSpec, schema: outputSchemaWithConstant,
  fields: [...resultSpec.fields,
    { path: ["sourceUrl"], description: "已确认的来源地址", producerRef: "source-url" }] }

test("execution 步骤的 exists(null output) 由成功终点投影为执行回执", async () => {
  const fixture = hybridFixture("navigation"), plan = hybridPlan(fixture), step = plan.steps[0]!
  step.completion = [{ id: "executed", description: "执行完成", predicate: {
    operator: "exists", value: { source: "node", nodeId: step.id, path: [] } } }]
  plan.completion = structuredClone(step.completion)
  const chain = materializeHybridChain({ response: fixture.response, request: fixture.request,
    plan, step, version: 1, model: "fixture" })
  assert.deepEqual(chain.completion[0]?.predicate, { operator: "equals",
    left: { source: "constant", value: true }, right: { source: "constant", value: true } })
  const input = { url: "https://example.com" }
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION,
    requestId: randomUUID(), mode: "sample", input, binding: { runId: randomUUID(), invocationId: randomUUID(),
      taskId: chain.taskId, authorizationId: randomUUID(), plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } },
    capabilities: { capability: async () => ({ outcome: "success", output: null }) } })
  assert.equal(run.status, "completed", run.outcome?.reason)
})

test("execution 动态列表按当次完整读取计数选择最后一项且验证播放", async () => {
  const base = hybridFixture("navigation"), plan = hybridPlan(base), step = plan.steps[0]!
  const url = "https://fixture.invalid/items", urlDigest = canonicalDigest(url)
  const itemSchema = { type: "object" as const, properties: { text: { type: "string" as const } },
    required: ["text"], additionalProperties: false }
  const listSchema = { type: "array" as const, items: itemSchema, minItems: 1, maxItems: 10 }
  const readSpec = { container: "a.item", fields: { text: { selector: ":scope", attribute: null,
    valueType: "string", normalizeWhitespace: true, normalizePresentation: true } },
    maxItems: 10, outputSchema: listSchema }
  const values = [{ text: "one" }, { text: "two" }, { text: "three" }]
  const readValue = { actionRef: "a-0001", specification: readSpec, outputPath: [], readPath: [], output: values,
    resultDigest: "1".repeat(64), urlDigest, targetId: "tab", containerIdsDigest: "3".repeat(64), stable: true }
  const readFact = fact("fact-read-items", "verified_natural_read", readValue)
  const domFact = fact("fact-click-target", "dom_structure", { actionRef: "a-0002" })
  const mediaFact = fact("fact-media", "media_playback", "playing")
  const observations = [
    { id: "o-0001", sequence: 0, url, tabId: "tab", facts: [], sourceRefs: [{ ref: "fixture:o1", digest: "a".repeat(64) }] },
    { id: "o-0002", sequence: 1, url, tabId: "tab", facts: [readFact, domFact], sourceRefs: [{ ref: "fixture:o2", digest: "a".repeat(64) }] },
    { id: "o-0003", sequence: 2, url, tabId: "tab", facts: [mediaFact], sourceRefs: [{ ref: "fixture:o3", digest: "a".repeat(64) }] },
    { id: "o-0004", sequence: 3, url, tabId: "tab", facts: [mediaFact], sourceRefs: [{ ref: "fixture:o4", digest: "a".repeat(64) }] },
  ]
  const actionRef = (id: string, digest: string) => ({ ref: `fixture:${id}`, digest })
  const actions = [
    { id: "a-0001", stepIndex: 0, actionIndex: 0, name: "find_elements", args: { selector: "a.item" },
      status: "succeeded", preObservationRef: "o-0001", resultRef: actionRef("a-0001", "1".repeat(64)),
      postObservationRef: "o-0002", effect: "read", retryOf: null },
    { id: "a-0002", stepIndex: 1, actionIndex: 0, name: "click", args: { index: 9 },
      status: "succeeded", preObservationRef: "o-0002", resultRef: actionRef("a-0002", "2".repeat(64)),
      postObservationRef: "o-0003", effect: "external_write", retryOf: null },
    { id: "a-0003", stepIndex: 2, actionIndex: 0, name: "wait", args: { seconds: 1 },
      status: "succeeded", preObservationRef: "o-0003", resultRef: actionRef("a-0003", "3".repeat(64)),
      postObservationRef: "o-0004", effect: "none", retryOf: null },
  ]
  const traceBody = { mediaType: "application/vnd.bat.browser-use-trace+json;version=1",
    source: { provider: "browser-use", version: "fixture", historyRef: "fixture:history" },
    judged: true, completed: true, actions, observations,
    finalResultRef: { ref: "fixture:result", digest: canonicalDigest(null) },
    redactionManifestRef: { ref: "fixture:redaction", digest: "b".repeat(64) } }
  const trace = { ...traceBody, digest: canonicalDigest(traceBody) }
  const requirementBody = { id: plan.requirement.id, version: plan.requirement.version,
    text: "Choose the current last item and leave its media playing.", taskText: "Choose the last item.",
    sourceDigest: plan.requirement.digest }
  const requirement = { ...requirementBody, digest: canonicalDigest(requirementBody) }
  const planBody = { id: plan.id, version: plan.version, sourceDigest: digestJson(plan), stepId: step.id,
    inputSchemaDigest: canonicalDigest(step.inputContract.schema), outputSchemaDigest: canonicalDigest(step.outputContract.schema),
    callMode: "once" as const, entryUrls: plan.entryUrls ?? [], resultSpec: step.resultSpec }
  const naturalPlan = { ...planBody, digest: canonicalDigest(planBody) }, registry = "c".repeat(64)
  const request = { compilerVersion: "bat-hybrid/2" as const, actionRegistryVersion: registry,
    requirement, plan: naturalPlan, runtimeInputSchema: step.inputContract.schema, trace }
  const countSchema = { type: "integer" as const, minimum: 1, maximum: 10 }
  const countId = "selection-count-a-0002", countBinding = { source: "node" as const, nodeId: "a-0001", path: [] }
  const target = { strategy: "structure" as const, scope: { url, urlDigest },
    container: { kind: "css" as const, value: "html" }, items: { kind: "css" as const, value: "a.item" },
    ordinal: 3, ordinalBinding: { source: "node" as const, nodeId: countId, path: [] }, withinItem: null }
  const segments = [
    { ...readSegment("s-a-0001", readSpec, readFact, listSchema), target: { strategy: "css", value: "a.item", scope: { url, urlDigest } } },
    { id: countId, kind: "deterministic" as const,
      operation: { name: "data.transform" as const, version: 1 as const, dataOperation: "count" as const },
      target: null, preconditions: [], expectedEffect: { kind: "read" as const },
      postconditions: [{ kind: "output_schema", schemaDigest: canonicalDigest(countSchema) }],
      outputs: [{ schema: countSchema, sourceRef: readFact.id }], proofRefs: readFact.sourceRefs,
      bindings: [{ id: "binding-selection-count", actionRef: countId, argumentPath: "source", kind: "prior_output" as const,
        sourceRef: readFact.id, transform: null, proofRefs: readFact.sourceRefs, binding: countBinding }] },
    { id: "s-a-0002", kind: "deterministic" as const,
      operation: { name: "browser.workflow-step" as const, version: 2 as const, actionName: "click" as const },
      target, bindings: [], preconditions: [{ kind: "source_observation", evidenceRef: "o-0002" }],
      expectedEffect: { kind: "ui_state" as const },
      postconditions: [{ kind: "media_playback", equals: "playing", clauseRef: mediaFact.id }],
      outputs: [], proofRefs: domFact.sourceRefs },
    { id: "s-a-0003", kind: "deterministic" as const,
      operation: { name: "browser.workflow-step" as const, version: 2 as const, actionName: "wait" as const },
      target: null, bindings: [],
      preconditions: [{ kind: "source_observation", evidenceRef: "o-0003" }], expectedEffect: { kind: "none" as const },
      postconditions: [{ kind: "media_playback", equals: "playing", clauseRef: mediaFact.id }],
      outputs: [], proofRefs: mediaFact.sourceRefs },
  ]
  const failures = (id: string) => ["missing", "timeout", "blocked", "human_required", "failed", "cancelled"]
    .map((outcome) => ({ from: id, outcome, to: outcome }))
  const terminals = ["completed", "partial", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"]
    .map((id) => ({ id, status: id }))
  const edges = [{ from: "s-a-0001", outcome: "success", to: countId }, ...failures("s-a-0001"),
    { from: countId, outcome: "success", to: "s-a-0002" }, ...failures(countId),
    { from: "s-a-0002", outcome: "success", to: "s-a-0003" }, ...failures("s-a-0002"),
    { from: "s-a-0003", outcome: "success", to: "completed" }, ...failures("s-a-0003")]
  const compilationBody = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1",
    compilerVersion: "bat-hybrid/2" as const, sourceDigests: [requirement.digest, naturalPlan.digest, trace.digest,
      canonicalDigest(step.inputContract.schema), canonicalDigest([]), registry], segments,
    controlGraph: { entry: "s-a-0001", edges, terminals }, outputAssembly: null, resultBinding: null, resultBranches: [],
    coverage: actions.map((item) => ({ actionRef: item.id, disposition: "compiled",
      ownerSegmentId: `s-${item.id}`, exclusionRule: null, evidenceRefs: [item.resultRef] })), gaps: [] }
  const canonicalPayload = canonical(compilationBody)
  const response = { compilation: { ...compilationBody,
      canonicalDigest: createHash("sha256").update(canonicalPayload).digest("hex") }, canonicalPayload,
    sourcePayloads: [canonical(requirementBody), canonical(planBody), canonical(traceBody),
      canonical(step.inputContract.schema), canonical([])] }

  const chain = materializeHybridChain({ response, request, plan, step, version: 1, model: "fixture" })
  const click = chain.nodes.find((node) => node.id === "s-a-0002")
  assert.ok(click?.kind === "capability")
  assert.ok(click.config && typeof click.config === "object" && !Array.isArray(click.config))
  const clickConfig = click.config as Record<string, JsonValue>
  assert.deepEqual(click.input.targetOrdinal, { source: "node", nodeId: countId, path: [] })
  assert.equal(clickConfig.targetOrdinalInput, "targetOrdinal")
  assert.equal((clickConfig.target as Record<string, unknown>).ordinalBinding, undefined)
  let modelCalls = 0, clickedOrdinal: JsonValue | undefined
  const input = { url }
  const run = await new TaskChainRuntime().execute({ chain, request: { contractVersion: CONTRACT_VERSION,
    requestId: randomUUID(), mode: "sample", input, binding: { runId: randomUUID(), invocationId: randomUUID(),
      taskId: chain.taskId, authorizationId: randomUUID(), plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } },
    capabilities: { capability: async (invocation) => {
      if (invocation.node.id === "s-a-0001") return { outcome: "success", output: values }
      if (invocation.node.id === "s-a-0002") clickedOrdinal = invocation.input.targetOrdinal
      return { outcome: "success", output: null }
    }, llm: async () => { modelCalls++; throw new Error("ordinary_replay_called_model") }, browserCommandCount: () => 3 } })
  assert.equal(run.status, "completed")
  assert.equal(clickedOrdinal, 3)
  assert.equal(modelCalls, 0)
  assert.equal(run.consumed.llmCalls, 0)
})

test("ResultSpec 经编译产物物化后可非空/空列表零模型复跑", async () => {
  const plan = planFixture(), fixture = naturalFixture(plan)
  const chain = materializeHybridChain({ response: fixture.response, request: fixture.request,
    plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  const execute = async (records: Array<{ title: string; url: string }>) => {
    let browserCommands = 0, modelCalls = 0, detailReads = 0
    const input = { destination: "https://fixture.invalid/issues" }
    const run = await new TaskChainRuntime().execute({ chain, request: {
      contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample",
      input, binding: { runId: randomUUID(), invocationId: randomUUID(), taskId: chain.taskId,
        authorizationId: randomUUID(), plan: chain.plan,
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        inputDigest: digestJson(input) },
    }, capabilities: {
      capability: async ({ node }) => {
        if (node.capability.name === "browser.read-fields") {
          browserCommands++
          if (node.id === "s-a-0001") return { outcome: "success", output: records }
          detailReads++; return { outcome: "success", output: { title: "First", body: "Body" } }
        }
        if (node.capability.name === "browser.workflow-step") {
          browserCommands++; return { outcome: "success", output: null }
        }
        throw new Error(`unexpected capability ${node.capability.name}`)
      },
      llm: async () => { modelCalls++; throw new Error("ordinary_replay_called_model") },
      browserCommandCount: () => browserCommands,
    } })
    return { run, modelCalls, detailReads }
  }

  const records = [{ title: "One", url: "https://fixture.invalid/issues/1" },
    { title: "Two", url: "https://fixture.invalid/issues/2" }]
  const first = await execute(records), repeated = await execute(records), empty = await execute([])
  for (const result of [first, repeated, empty]) {
    assert.equal(result.run.status, "completed")
    assert.equal(result.modelCalls, 0)
    assert.equal(result.run.consumed.llmCalls, 0)
    assert.equal(result.run.modelCalls.length, 0)
  }
  assert.deepEqual(resultValue(first.run), { records, recordCount: 2,
    detail: { title: "First", body: "Body" } })
  assert.deepEqual(resultValue(repeated.run), resultValue(first.run))
  assert.deepEqual(resultValue(empty.run), { records: [], recordCount: 0 })
  assert.equal(empty.detailReads, 0)
  assert.ok(chain.nodes.findIndex((node) => node.id === "result-count-records")
    < chain.nodes.findIndex((node) => node.id === "s-a-0002"))
})

test("输出证据的 sampleValue 经验证后不会进入可执行 TaskChain", () => {
  const plan = planFixture({ outputSchema: outputSchemaWithConstant, resultSpec: resultSpecWithConstant })
  const fixture = naturalFixture(plan, { constantSourceUrl })
  const chain = materializeHybridChain({ response: fixture.response, request: fixture.request,
    plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  const serialized = JSON.stringify(chain)
  assert.equal(serialized.includes("sampleValue"), false)
  assert.equal(serialized.includes(constantSourceUrl), true)
})

function resultValue(run: Awaited<ReturnType<TaskChainRuntime["execute"]>>) {
  const result = run.outputs.result
  assert.ok(result)
  assert.equal(result.kind, "value")
  if (result.kind !== "value") throw new Error("result_output_is_not_a_value")
  return result.value
}

function planFixture(options: { outputSchema?: ValueSchema; resultSpec?: FixtureResultSpec } = {}): TaskPlan {
  const plan = structuredClone(extractionFixture.plan)
  const selectedOutputSchema = options.outputSchema ?? outputSchema
  const selectedResultSpec = options.resultSpec ?? resultSpec
  plan.outputContract = { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: selectedOutputSchema }
  const step = plan.steps[0]!
  step.outputContract = plan.outputContract
  step.resultSpec = selectedResultSpec
  step.completion = [{ id: "result", description: "返回结果", predicate: {
    operator: "exists", value: { source: "node", nodeId: step.id, path: [] } } }]
  plan.output = { source: "node", nodeId: step.id, path: [] }
  plan.completion = structuredClone(step.completion)
  return taskPlanSchema.parse(plan)
}

function naturalFixture(plan: TaskPlan, options: { constantSourceUrl?: string } = {}) {
  const records = [{ title: "One", url: "https://fixture.invalid/issues/1" },
    { title: "Two", url: "https://fixture.invalid/issues/2" }]
  const detail = { title: "First", body: "Body" }
  const selectedOutputSchema = plan.outputContract.schema, selectedResultSpec = plan.steps[0]!.resultSpec
  if (!selectedResultSpec) throw new Error("fixture_result_spec_missing")
  const selectedOutputSchemaValue = structuredClone(selectedOutputSchema) as JsonValue
  const finalOutput = options.constantSourceUrl
    ? { records, recordCount: 2, detail, sourceUrl: options.constantSourceUrl }
    : { records, recordCount: 2, detail }
  const recordRead = { container: "li.issue", fields: {
    title: { selector: ":scope > a", attribute: null, valueType: "string" },
    url: { selector: ":scope > a", attribute: "href", valueType: "string" },
  }, maxItems: 5, outputSchema: recordSchema }
  const detailRead = { container: "article.issue", fields: {
    title: { selector: ":scope > h1", attribute: null, valueType: "string" },
    body: { selector: ":scope > div", attribute: null, valueType: "string" },
  }, maxItems: 1, outputSchema: detailSchema }
  const readRecordsValue = verifiedRead("a-0001", recordRead, ["records"], records)
  const readRecords = fact("fact-read-records", "verified_natural_read", readRecordsValue)
  const anchorValue = { actionRef: "a-0002", targetRef: "n-0001",
    historyTarget: { nodeName: "a", xPath: "/html/body/a[1]" },
    nodes: [{ id: "n-0001", tag: "a", xpath: "/html/body/a[1]" }] }
  const anchor = fact("fact-detail-anchor", "dom_structure", anchorValue)
  const destination = fact("fact-detail-url", "url", records[0]!.url)
  const readDetailValue = verifiedRead("a-0003", detailRead, ["detail"], detail)
  const readDetail = fact("fact-read-detail", "verified_natural_read", readDetailValue)
  const evidenceFields: Array<Record<string, JsonValue>> = [
    { binding: { source: "node", nodeId: "a-0001", path: [] }, path: ["records"] },
    { binding: { source: "node", nodeId: "result-count-records", path: [] }, path: ["recordCount"] },
    { binding: { source: "node", nodeId: "a-0003", path: [] }, path: ["detail"] },
  ]
  if (options.constantSourceUrl) evidenceFields.push({
    binding: { source: "constant", value: options.constantSourceUrl }, path: ["sourceUrl"],
    sampleValue: options.constantSourceUrl,
  })
  const executableFields = evidenceFields.map(({ sampleValue: _sampleValue, ...field }) => field)
  const assemblyValue = { fields: evidenceFields, schema: selectedOutputSchemaValue,
    outputDigest: canonicalDigest(finalOutput) }
  const assembly = fact("fact-output", "verified_output_assembly", assemblyValue)
  const observationRef = (id: string) => [{ ref: `fixture:${id}`, digest: "a".repeat(64) }]
  const observations = [
    { id: "o-0001", sequence: 0, url: "https://fixture.invalid/issues", tabId: "tab", facts: [], sourceRefs: observationRef("o1") },
    { id: "o-0002", sequence: 1, url: "https://fixture.invalid/issues", tabId: "tab", facts: [readRecords, anchor], sourceRefs: observationRef("o2") },
    { id: "o-0003", sequence: 2, url: records[0]!.url, tabId: "tab", facts: [destination], sourceRefs: observationRef("o3") },
    { id: "o-0004", sequence: 3, url: records[0]!.url, tabId: "tab", facts: [readDetail, assembly], sourceRefs: observationRef("o4") },
  ]
  const actions = [
    action("a-0001", 0, "extract", {}, "read", "o-0001", "o-0002"),
    action("a-0002", 1, "click", { index: 7 }, "external_write", "o-0002", "o-0003"),
    action("a-0003", 2, "extract", {}, "read", "o-0003", "o-0004"),
  ]
  const traceBody = { mediaType: "application/vnd.bat.browser-use-trace+json;version=1",
    source: { provider: "browser-use", version: "fixture", historyRef: "fixture:history" },
    judged: true, completed: true, actions, observations,
    finalResultRef: { ref: "fixture:result", digest: canonicalDigest(finalOutput) },
    redactionManifestRef: { ref: "fixture:redaction", digest: "b".repeat(64) } }
  const trace = { ...traceBody, digest: canonicalDigest(traceBody) }
  const requirementBody = { id: plan.requirement.id, version: plan.requirement.version,
    text: options.constantSourceUrl
      ? `Read records, count them, read the first detail when present, and return ${options.constantSourceUrl}.`
      : "Read records, count them, and read the first detail when present.", taskText: "Read records.",
    sourceDigest: plan.requirement.digest }
  const requirement = { ...requirementBody, digest: canonicalDigest(requirementBody) }
  const step = plan.steps[0]!, planBody = { id: plan.id, version: plan.version, sourceDigest: digestJson(plan),
    stepId: step.id, inputSchemaDigest: canonicalDigest(step.inputContract.schema),
    outputSchemaDigest: canonicalDigest(selectedOutputSchema), callMode: "once" as const,
    entryUrls: plan.entryUrls ?? [], resultSpec: selectedResultSpec }
  const naturalPlan = { ...planBody, digest: canonicalDigest(planBody) }, registry = "c".repeat(64)
  const request = { compilerVersion: "bat-hybrid/2" as const, actionRegistryVersion: registry,
    requirement, plan: naturalPlan, runtimeInputSchema: step.inputContract.schema, trace }
  const proof = assembly.sourceRefs, segments = [
    readSegment("s-a-0001", recordRead, readRecords, recordSchema),
    { id: "result-count-records", kind: "deterministic", operation: { name: "data.transform", version: 1, dataOperation: "count" },
      target: null, preconditions: [], expectedEffect: { kind: "read" }, postconditions: [{ kind: "output_schema", schemaDigest: digestJson(outputSchema.properties.recordCount) }],
      outputs: [{ schema: outputSchema.properties.recordCount, sourceRef: assembly.id }], proofRefs: proof,
      bindings: [{ id: "binding-count", actionRef: "result-count-records", argumentPath: "source", kind: "prior_output",
        sourceRef: assembly.id, transform: null, proofRefs: proof,
        binding: { source: "node", nodeId: "a-0001", path: [] } }] },
    { id: "s-a-0002", kind: "deterministic", operation: { name: "browser.workflow-step", version: 2, actionName: "navigate" },
      target: null, preconditions: [], expectedEffect: { kind: "navigation" },
      postconditions: [{ kind: "url", bindingArgument: "url" }], outputs: [], proofRefs: anchor.sourceRefs,
      bindings: [{ id: "binding-url", actionRef: "a-0002", argumentPath: "url", kind: "prior_output",
        sourceRef: anchor.id, transform: null, derivation: "anchor_navigation",
        proofRefs: [...anchor.sourceRefs, ...destination.sourceRefs, ...readRecords.sourceRefs],
        binding: { source: "node", nodeId: "a-0001", path: [0, "url"] } }] },
    readSegment("s-a-0003", detailRead, readDetail, detailSchema),
  ]
  const assignments: Array<{ to: Array<string | number>; producerRef: string; from:
    { source: "node"; nodeId: string; path: Array<string | number> } | { source: "constant"; value: JsonValue } }> = [
    { to: ["records"], from: { source: "node", nodeId: "a-0001", path: [] }, producerRef: "read-records" },
    { to: ["recordCount"], from: { source: "node", nodeId: "result-count-records", path: [] }, producerRef: "count-records" },
    { to: ["detail"], from: { source: "node", nodeId: "a-0003", path: [] }, producerRef: "read-detail" },
  ]
  if (options.constantSourceUrl) assignments.push({ to: ["sourceUrl"],
    from: { source: "constant", value: options.constantSourceUrl }, producerRef: "source-url" })
  const resultBinding = { contractVersion: "bat-result-binding/v1", schema: selectedOutputSchemaValue,
    assignments, sourceRef: assembly.id, proofRefs: proof }
  const terminals = ["completed", "partial", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"]
    .map((id) => ({ id, status: id }))
  const failures = (id: string) => ["missing", "timeout", "blocked", "human_required", "failed", "cancelled"]
    .map((outcome) => ({ from: id, outcome, to: outcome }))
  const edges = [
    { from: "s-a-0001", outcome: "success", to: "result-count-records" }, ...failures("s-a-0001"),
    { from: "result-count-records", outcome: "success", to: "branch-result-has-records" }, ...failures("result-count-records"),
    { from: "branch-result-has-records", outcome: "true", to: "s-a-0002" },
    { from: "branch-result-has-records", outcome: "false", to: "completed-empty-has-records" },
    { from: "s-a-0002", outcome: "success", to: "s-a-0003" }, ...failures("s-a-0002"),
    { from: "s-a-0003", outcome: "success", to: "completed" }, ...failures("s-a-0003"),
  ]
  const compilationBody = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1",
    compilerVersion: "bat-hybrid/2" as const, sourceDigests: [requirement.digest, naturalPlan.digest, trace.digest,
      canonicalDigest(step.inputContract.schema), canonicalDigest([]), registry], segments,
    controlGraph: { entry: "s-a-0001", edges, terminals: [...terminals,
      { id: "completed-empty-has-records", status: "completed" }] },
    outputAssembly: { sourceRef: assembly.id, fields: executableFields, schema: selectedOutputSchemaValue, proofRefs: proof },
    resultBinding, resultBranches: [{ id: "branch-result-has-records", controlRef: "has-records",
      sourceActionRef: "a-0001", sourceSegmentId: "s-a-0001", consumerSegmentId: "s-a-0002",
      skippedSegmentIds: ["s-a-0002", "s-a-0003"], predicate: { operator: "array_length_at_least",
        value: { source: "node", nodeId: "s-a-0001", path: [] }, minimum: { source: "constant", value: 1 } },
      falseResult: { ...resultBinding, assignments: assignments.filter((item) => item.to[0] !== "detail") },
      falseTerminalId: "completed-empty-has-records" }],
    coverage: actions.map((item, index) => ({ actionRef: item.id, disposition: "compiled",
      ownerSegmentId: index === 1 ? "s-a-0002" : `s-${item.id}`, exclusionRule: null, evidenceRefs: [item.resultRef] })), gaps: [] }
  const canonicalPayload = canonical(compilationBody)
  const response = { compilation: { ...compilationBody,
      canonicalDigest: createHash("sha256").update(canonicalPayload).digest("hex") },
    canonicalPayload, sourcePayloads: [canonical(requirementBody), canonical(planBody),
      canonical(traceBody), canonical(step.inputContract.schema), canonical([])] }
  return { request, response }
}

function fact(id: string, kind: string, value: JsonValue) {
  return { id, kind, value, sourceRefs: [{ ref: `fixture:${id}`, digest: canonicalDigest(value) }] }
}
function verifiedRead(actionRef: string, specification: JsonValue, outputPath: string[], output: JsonValue) {
  return { actionRef, specification, outputPath, readPath: [], output, resultDigest: "1".repeat(64),
    urlDigest: "2".repeat(64), targetId: "tab", containerIdsDigest: "3".repeat(64), stable: true }
}
function action(id: string, stepIndex: number, name: string, args: JsonValue, effect: string, pre: string, post: string) {
  return { id, stepIndex, actionIndex: 0, name, args, status: "succeeded", preObservationRef: pre,
    resultRef: { ref: `fixture:${id}`, digest: "d".repeat(64) }, postObservationRef: post, effect, retryOf: null }
}
function readSegment(id: string, specification: JsonValue, readFact: ReturnType<typeof fact>, schema: ValueSchema) {
  return { id, kind: "deterministic", operation: { name: "browser.read-fields", version: 2, specification },
    target: null, preconditions: [], expectedEffect: { kind: "read" },
    postconditions: [{ kind: "output_schema", schemaDigest: digestJson(schema) }],
    outputs: [{ schema, sourceRef: readFact.id }], proofRefs: readFact.sourceRefs, bindings: [] }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value)
}
function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex")
}
