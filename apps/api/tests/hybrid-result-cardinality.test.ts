import assert from "node:assert/strict"
import test from "node:test"
import { jsonValueSchema, type JsonValue, type ValueSchema } from "@browser-capture/contracts"
import { digestNaturalPayload, naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { materializeNaturalResult } from "../src/upstream-browser/hybrid-result.js"
import { hybridCompilationSchema } from "../src/upstream-browser/hybrid-schema.js"
import { materializationPayloadFixture } from "./helpers/natural-source.js"

const hash = "a".repeat(64), url = "https://example.test/records"
const digest = (value: unknown) => digestNaturalPayload(JSON.stringify(value))
const record: ValueSchema = { type: "object", properties: { title: { type: "string" } },
  required: ["title"], additionalProperties: false }
const fact = (kind: string, value: JsonValue) => ({ id: `${kind}-${digest(value)}`, kind, value,
  sourceRefs: [{ ref: `fixture:${kind}`, digest: digest(value) }] })

function fixture(bounds: { minItems?: number; maxItems?: number }, scalar = false) {
  const items: ValueSchema = scalar ? { type: "string" } : record
  const schema: ValueSchema = { type: "array", items, ...bounds }
  const readSchema: ValueSchema = { type: "array", items, minItems: 0, maxItems: 300 }
  const sample: JsonValue = scalar ? ["one", "two", "three"]
    : [{ title: "one" }, { title: "two" }, { title: "three" }]
  const specification = { container: scalar ? ".list" : ".row", fields: scalar
    ? { value: { selector: ".title", attribute: null, valueType: "string", multiple: true, maxValues: 300 } }
    : { title: { selector: ".title", attribute: null, valueType: "string" } },
    maxItems: scalar ? 1 : 300, requireComplete: true, outputSchema: scalar
      ? { type: "object", properties: { value: readSchema }, required: ["value"], additionalProperties: false }
      : readSchema }
  const binding = { source: "node" as const, nodeId: "a-0001", path: scalar ? ["value"] : [] }
  const readValue = { actionRef: "a-0001", specification, outputPath: [], readPath: binding.path,
    output: scalar ? { value: sample } : sample, resultDigest: hash, urlDigest: digest(url),
    targetId: "tab", containerIdsDigest: hash, stable: true, readRef: "r1", documentRootId: 1,
    coverage: { scope: "current_dom_matches", total: 100, sampled: 3, sampleLimit: 3, runtimeTruncated: false } }
  const readFact = fact("verified_natural_read", readValue as JsonValue)
  const fields = [{ binding, path: [] }]
  const assemblyFact = fact("verified_output_assembly", jsonValueSchema.parse({ fields, schema, outputDigest: digest(sample) }))
  const assembly = { sourceRef: assemblyFact.id, fields, schema, proofRefs: assemblyFact.sourceRefs }
  const requirement = { id: "requirement", version: 1, text: "Read the confirmed collection.",
    taskText: "Read the confirmed collection.", sourceDigest: hash }
  const plan = { id: "plan", version: 1, sourceDigest: hash, stepId: "main", inputSchemaDigest: hash,
    outputSchemaDigest: digest(schema), callMode: "once", entryUrls: [url], semanticOperations: [],
    resultSpec: { contractVersion: "bat-result-spec/v1", mode: "data", schema,
      fields: [{ path: [], description: "Records", producerRef: "records" }], derivations: [], edgeCases: [] } }
  const trace = { source: { historyRef: "fixture:source" }, completed: true,
    actions: [{ id: "a-0001", name: "bat_read_fields", args: {}, status: "succeeded",
      preObservationRef: null, postObservationRef: "o-read", resultRef: { ref: "fixture:read", digest: hash } },
    { id: "a-0002", name: "done", args: { success: true, reason: "Observed method", readRefs: ["r1"] },
      preObservationRef: "o-read", postObservationRef: "o-done", status: "succeeded" }],
    observations: [{ id: "o-read", url, tabId: "tab", facts: [readFact] },
      { id: "o-done", url, tabId: "tab", facts: [assemblyFact] }],
    finalResultRef: { ref: "fixture:final", digest: digest(sample) } }
  const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: hash,
    requirement: { ...requirement, digest: digest(requirement) }, plan: { ...plan, digest: digest(plan) },
    runtimeInputSchema: { type: "null" }, trace: { ...trace, digest: digest(trace) } }
  const source = naturalSourceContext(JSON.stringify(request))
  const compilation = hybridCompilationSchema.parse({
    mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: Array(6).fill(hash), canonicalDigest: hash,
    segments: [{ id: "s-a-0001", kind: "deterministic", operation: {
      name: "browser.read-fields", version: 2, specification }, target: null, preconditions: [], bindings: [],
    expectedEffect: { kind: "read" }, postconditions: [{ kind: "output_schema", schemaDigest: digest(specification.outputSchema) }],
    outputs: [{ schema: specification.outputSchema, sourceRef: readFact.id }], proofRefs: readFact.sourceRefs }],
    controlGraph: { entry: "s-a-0001", edges: [{ from: "s-a-0001", outcome: "success", to: "completed" }],
      terminals: [{ id: "completed", status: "completed" }] }, outputAssembly: assembly,
    resultBinding: { contractVersion: "bat-result-binding/v1", schema,
      assignments: [{ to: [], from: binding, producerRef: "records" }],
      sourceRef: assemblyFact.id, proofRefs: assemblyFact.sourceRefs }, resultBranches: [],
    coverage: [{ actionRef: "a-0001", disposition: "compiled", ownerSegmentId: "s-a-0001",
      exclusionRule: null, evidenceRefs: readFact.sourceRefs }], gaps: [] })
  if (compilation.compilerVersion !== "bat-hybrid/2") throw new Error("fixture_compiler_version")
  const payload = materializationPayloadFixture(source.request, compilation)
  return { schema, materialize: () => materializeNaturalResult({ compilation,
    request: payload.ordinary, payload, outputSchema: schema, rewrite: (value) => value }) }
}

test("正式结果物化拒绝读取上限300直绑最终至少1000条", () => {
  assert.throws(() => fixture({ minItems: 1000, maxItems: 1000 }).materialize(), /cardinality_disjoint/)
})

test("正式结果物化要求已知100条到最多10条之间存在选择操作", () => {
  assert.throws(() => fixture({ maxItems: 10 }).materialize(), /selection_required/)
})

test("标量数组按readPath的集合预算与完整数量核验，不把单容器当单记录", () => {
  assert.throws(() => fixture({ maxItems: 10 }, true).materialize(), /selection_required/)
  assert.throws(() => fixture({ minItems: 1000 }, true).materialize(), /cardinality_disjoint/)
})

test("数量区间有交集时保留动态读取及严格最终合同", () => {
  const value = fixture({ minItems: 50, maxItems: 200 }), original = structuredClone(value.schema)
  const result = value.materialize()
  assert.ok(result)
  assert.deepEqual(result.nodes.at(-1)?.outputContract.schema, original)
  assert.deepEqual(value.schema, original)
})
