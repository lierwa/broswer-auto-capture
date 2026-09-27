import assert from "node:assert/strict"
import test from "node:test"
import { jsonValueSchema, parseTaskValue, type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { plannedProgression } from "../src/task-chain/authoring-progression.js"
import { representativeSourceOutput } from "../src/upstream-browser/hybrid-method-evidence.js"
import { digestNaturalPayload, naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { materializeNaturalResult } from "../src/upstream-browser/hybrid-result.js"
import { hybridCompilationSchema } from "../src/upstream-browser/hybrid-schema.js"
import { materializationPayloadFixture } from "./helpers/natural-source.js"

const hash = "a".repeat(64), url = "https://example.test/list"
const digest = (value: unknown) => digestNaturalPayload(JSON.stringify(value))
const fact = (kind: string, value: JsonValue) => ({ id: `${kind}-${digest(value)}`, kind, value,
  sourceRefs: [{ ref: `fixture:${kind}`, digest: digest(value) }] })
const contract = (schema: ValueSchema) => ({ id: "output", version: 1, dialect: "bat-value-schema/v1" as const, schema })

function fixture(options: { scalar?: boolean; arrayMin?: number; arrayMax?: number; countMin?: number; countMax?: number } = {}) {
  const item: ValueSchema = options.scalar ? { type: "string" } : { type: "object",
    properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false }
  const schema: Extract<ValueSchema, { type: "object" }> = { type: "object", properties: {
    records: { type: "array", items: item, minItems: options.arrayMin ?? 50, maxItems: options.arrayMax ?? 200 },
    count: { type: "integer", minimum: options.countMin ?? 50, maximum: options.countMax ?? 200 },
  }, required: ["records", "count"], additionalProperties: false }
  const sample: JsonValue[] = options.scalar ? ["one", "two", "three"]
    : [{ title: "one" }, { title: "two" }, { title: "three" }]
  const output: Record<string, JsonValue> = { records: sample, count: 3 }
  const readSchema: ValueSchema = { type: "array", items: item, minItems: 0, maxItems: 300 }
  const specification = { container: options.scalar ? ".list" : ".row", fields: options.scalar
    ? { value: { selector: ".title", attribute: null, valueType: "string", multiple: true, maxValues: 300 } }
    : { title: { selector: ".title", attribute: null, valueType: "string" } }, maxItems: options.scalar ? 1 : 300,
  requireComplete: true, outputSchema: options.scalar
    ? { type: "object", properties: { value: readSchema }, required: ["value"], additionalProperties: false } : readSchema }
  const readPath = options.scalar ? ["value"] : []
  const readValue = { actionRef: "a-0001", specification, outputPath: ["records"], readPath,
    output: options.scalar ? { value: sample } : sample, resultDigest: hash, urlDigest: digest(url),
    targetId: "tab", containerIdsDigest: hash, stable: true, readRef: "r1", documentRootId: 1,
    coverage: { scope: "current_dom_matches", total: 100, sampled: 3, sampleLimit: 3, runtimeTruncated: false } }
  const readFact = fact("verified_natural_read", readValue as JsonValue), extraFacts: Array<ReturnType<typeof fact>> = []
  const spec = { contractVersion: "bat-result-spec/v1", mode: "data", schema,
    fields: [{ path: ["records"], description: "Records", producerRef: "records" },
      { path: ["count"], description: "Record count", producerRef: "count" }],
    derivations: [{ producerRef: "count", operation: "count", sourceProducerRef: "records", sourcePath: ["records"] }], edgeCases: [] }
  const source = () => {
    readFact.sourceRefs[0]!.digest = digest(readValue)
    const requirement = { id: "requirement", version: 1, text: "Read and count records.",
      taskText: "Read and count records.", sourceDigest: hash }
    const plan = { id: "plan", version: 1, sourceDigest: hash, stepId: "main", inputSchemaDigest: hash,
      outputSchemaDigest: digest(schema), callMode: "once", entryUrls: [url], semanticOperations: [], resultSpec: spec }
    const trace = { source: { historyRef: "fixture:history" }, completed: true,
      actions: [{ id: "a-0001", name: "bat_read_fields", args: { outputPath: ["records"], container: specification.container,
        fields: options.scalar ? { value: { selector: ".title", attribute: null } } : { title: { selector: ".title", attribute: null } },
        maxItems: 300 }, status: "succeeded", preObservationRef: null, postObservationRef: "o-read",
      resultRef: { ref: "fixture:read", digest: hash } },
      { id: "a-0002", name: "done", args: { success: true, reason: "Observed method", readRefs: ["r1"] },
        status: "succeeded", preObservationRef: "o-read", postObservationRef: "o-done",
        resultRef: { ref: "fixture:done", digest: hash } }],
      observations: [{ id: "o-read", url, tabId: "tab", facts: [readFact] },
        { id: "o-done", url, tabId: "tab", facts: extraFacts }], finalResultRef: { ref: "fixture:result", digest: digest(output) } }
    const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: hash,
      requirement: { ...requirement, digest: digest(requirement) }, plan: { ...plan, digest: digest(plan) },
      runtimeInputSchema: { type: "null" }, trace: { ...trace, digest: digest(trace) } }
    return { request: request as unknown as Record<string, JsonValue>, canonicalRequest: JSON.stringify(request), output }
  }
  return { schema, outputContract: contract(schema), sample, output, specification, readValue, readFact, extraFacts, spec, source }
}

function planFor(schema: ValueSchema): TaskPlan {
  return { steps: [{ id: "main", inputContract: contract({ type: "null" }), outputContract: contract(schema),
    input: { source: "constant", value: null }, invocation: { mode: "once" } }],
  outputContract: contract(schema), output: { source: "node", nodeId: "main", path: [] } } as unknown as TaskPlan
}

function finish(value: ReturnType<typeof fixture>, plan = planFor(value.schema)) {
  const progression = plannedProgression(plan, null)
  progression.resolve(plan.steps[0]!)
  progression.acceptSource("main", null, value.source())
  progression.finish()
}

function materialize(value: ReturnType<typeof fixture>) {
  const readBinding = { source: "node" as const, nodeId: "a-0001", path: value.readValue.readPath }
  const fields = [{ binding: readBinding, path: ["records"] },
    { binding: { source: "node" as const, nodeId: "result-count", path: [] }, path: ["count"] }]
  const assemblyFact = fact("verified_output_assembly", jsonValueSchema.parse({ fields, schema: value.schema, outputDigest: digest(value.output) }))
  value.extraFacts.push(assemblyFact)
  const source = naturalSourceContext(value.source().canonicalRequest)
  const assembly = { fields, schema: value.schema, sourceRef: assemblyFact.id, proofRefs: assemblyFact.sourceRefs }
  const compilation = hybridCompilationSchema.parse({
    mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: Array(6).fill(hash), canonicalDigest: hash, gaps: [], resultBranches: [],
    segments: [{ id: "s-a-0001", kind: "deterministic", operation: {
      name: "browser.read-fields", version: 2, specification: value.specification }, target: null,
    bindings: [], preconditions: [], expectedEffect: { kind: "read" },
    postconditions: [{ kind: "output_schema", schemaDigest: digest(value.specification.outputSchema) }],
    outputs: [{ schema: value.specification.outputSchema, sourceRef: value.readFact.id }], proofRefs: value.readFact.sourceRefs },
    { id: "result-count", kind: "deterministic", operation: { name: "data.transform", version: 1, dataOperation: "count" },
      target: null, preconditions: [], expectedEffect: { kind: "read" },
      postconditions: [{ kind: "output_schema", schemaDigest: digest(value.schema.properties.count) }],
      outputs: [{ schema: value.schema.properties.count, sourceRef: assemblyFact.id }], proofRefs: assemblyFact.sourceRefs,
      bindings: [{ id: "binding-count", actionRef: "result-count", argumentPath: "source", kind: "prior_output",
        sourceRef: assemblyFact.id, transform: null, proofRefs: assemblyFact.sourceRefs, binding: readBinding }] }],
    controlGraph: { entry: "s-a-0001", edges: [], terminals: [] }, outputAssembly: assembly,
    resultBinding: { contractVersion: "bat-result-binding/v1", schema: value.schema,
      sourceRef: assemblyFact.id, proofRefs: assemblyFact.sourceRefs,
      assignments: fields.map((field, index) => ({ to: field.path, from: field.binding, producerRef: index ? "count" : "records" })) },
    coverage: [{ actionRef: "a-0001", disposition: "compiled", ownerSegmentId: "s-a-0001",
      exclusionRule: null, evidenceRefs: value.readFact.sourceRefs }] })
  if (compilation.compilerVersion !== "bat-hybrid/2") throw new Error("fixture_version")
  const payload = materializationPayloadFixture(source.request, compilation)
  return materializeNaturalResult({ compilation, request: payload.ordinary, payload,
    outputSchema: value.schema, rewrite: (binding) => binding })
}

test("声明count由真实样本推导并可准备交接，正式合同保留", () => {
  const value = fixture(), original = structuredClone(value.schema)
  const result = representativeSourceOutput(value.outputContract, value.source())
  assert.deepEqual(result.countPaths, [["count"]])
  assert.equal((result.output as Record<string, JsonValue>).count, 3)
  assert.doesNotThrow(() => finish(value))
  assert.throws(() => parseTaskValue(value.outputContract, result.output))
  assert.deepEqual(value.schema, original)
})

test("伪造count、缺派生证据、最大值及无关数字都不能获准备豁免", () => {
  const forged = fixture(); forged.output.count = 4
  assert.throws(() => representativeSourceOutput(forged.outputContract, forged.source()), /count_sample_mismatch/)
  const unproven = fixture(); unproven.spec.derivations = []
  assert.throws(() => representativeSourceOutput(unproven.outputContract, unproven.source()))
  const limited = fixture({ countMin: 0, countMax: 2 })
  assert.throws(() => representativeSourceOutput(limited.outputContract, limited.source()))
  const unrelated = fixture(); unrelated.schema.properties.unrelated = { type: "integer", minimum: 50 }
  unrelated.output.unrelated = 3
  assert.throws(() => representativeSourceOutput(unrelated.outputContract, unrelated.source()))
})

test("finish只沿同一node/path投影count证据，不按常量值相同放宽", () => {
  const value = fixture(), projected = planFor(value.schema)
  projected.output = { source: "node", nodeId: "main", path: ["count"] }
  projected.outputContract = contract(value.schema.properties.count!)
  assert.doesNotThrow(() => finish(value, projected))
  const constant = structuredClone(projected)
  constant.output = { source: "constant", value: 3 }
  assert.throws(() => finish(fixture(), constant))
})

test("标量集合按readPath接受100/3样本并拒绝容器1/1伪装", () => {
  const value = fixture({ scalar: true })
  assert.equal(value.specification.maxItems, 1)
  assert.doesNotThrow(() => finish(value))
  value.readValue.coverage.total = 1; value.readValue.coverage.sampled = 1
  assert.throws(() => representativeSourceOutput(value.outputContract, value.source()), /sample_count_mismatch/)
})

test("正式物化仍核对完整集合与派生count的已知基数", () => {
  assert.ok(materialize(fixture()))
  assert.throws(() => materialize(fixture({ arrayMin: 1000, arrayMax: 1000 })), /cardinality_disjoint/)
  assert.throws(() => materialize(fixture({ arrayMin: 200, arrayMax: 250 })), /collection_incomplete/)
  assert.throws(() => materialize(fixture({ countMin: 120 })), /count_cardinality_mismatch/)
  assert.throws(() => materialize(fixture({ countMax: 90, scalar: true })), /count_cardinality_mismatch/)
})
