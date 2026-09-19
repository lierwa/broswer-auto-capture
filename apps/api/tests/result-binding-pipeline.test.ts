import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, taskPlanSchema, type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, TaskChainRuntime } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"

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

function resultValue(run: Awaited<ReturnType<TaskChainRuntime["execute"]>>) {
  const result = run.outputs.result
  assert.ok(result)
  assert.equal(result.kind, "value")
  if (result.kind !== "value") throw new Error("result_output_is_not_a_value")
  return result.value
}

function planFixture(): TaskPlan {
  const plan = structuredClone(extractionFixture.plan)
  plan.outputContract = { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: outputSchema }
  const step = plan.steps[0]!
  step.outputContract = plan.outputContract
  step.resultSpec = resultSpec
  step.completion = [{ id: "result", description: "返回结果", predicate: {
    operator: "exists", value: { source: "node", nodeId: step.id, path: [] } } }]
  plan.output = { source: "node", nodeId: step.id, path: [] }
  plan.completion = structuredClone(step.completion)
  return taskPlanSchema.parse(plan)
}

function naturalFixture(plan: TaskPlan) {
  const records = [{ title: "One", url: "https://fixture.invalid/issues/1" },
    { title: "Two", url: "https://fixture.invalid/issues/2" }]
  const detail = { title: "First", body: "Body" }, finalOutput = { records, recordCount: 2, detail }
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
  const assemblyValue = { fields: [
    { binding: { source: "node", nodeId: "a-0001", path: [] }, path: ["records"] },
    { binding: { source: "node", nodeId: "result-count-records", path: [] }, path: ["recordCount"] },
    { binding: { source: "node", nodeId: "a-0003", path: [] }, path: ["detail"] },
  ], schema: outputSchema, outputDigest: canonicalDigest(finalOutput) }
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
    text: "Read records, count them, and read the first detail when present.", taskText: "Read records.",
    sourceDigest: plan.requirement.digest }
  const requirement = { ...requirementBody, digest: canonicalDigest(requirementBody) }
  const step = plan.steps[0]!, planBody = { id: plan.id, version: plan.version, sourceDigest: digestJson(plan),
    stepId: step.id, inputSchemaDigest: canonicalDigest(step.inputContract.schema),
    outputSchemaDigest: canonicalDigest(outputSchema), callMode: "once" as const, resultSpec }
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
  const assignments = [
    { to: ["records"], from: { source: "node", nodeId: "a-0001", path: [] }, producerRef: "read-records" },
    { to: ["recordCount"], from: { source: "node", nodeId: "result-count-records", path: [] }, producerRef: "count-records" },
    { to: ["detail"], from: { source: "node", nodeId: "a-0003", path: [] }, producerRef: "read-detail" },
  ]
  const resultBinding = { contractVersion: "bat-result-binding/v1", schema: outputSchema,
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
    outputAssembly: { sourceRef: assembly.id, fields: assemblyValue.fields, schema: outputSchema, proofRefs: proof },
    resultBinding, resultBranches: [{ id: "branch-result-has-records", controlRef: "has-records",
      sourceActionRef: "a-0001", sourceSegmentId: "s-a-0001", consumerSegmentId: "s-a-0002",
      skippedSegmentIds: ["s-a-0002", "s-a-0003"], predicate: { operator: "array_length_at_least",
        value: { source: "node", nodeId: "s-a-0001", path: [] }, minimum: { source: "constant", value: 1 } },
      falseResult: { ...resultBinding, assignments: assignments.slice(0, 2) },
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
