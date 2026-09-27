import assert from "node:assert/strict"
import test from "node:test"
import { jsonValueSchema, parseTaskValue, type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { plannedProgression } from "../src/task-chain/authoring-progression.js"
import { representativeSourceOutput } from "../src/upstream-browser/hybrid-method-evidence.js"
import { digestNaturalPayload, naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"

const hash = "a".repeat(64), url = "https://example.test/list"
const item: ValueSchema = { type: "object", properties: { name: { type: "string", minLength: 1 } },
  required: ["name"], additionalProperties: false }
const collection: ValueSchema = { type: "array", items: item, minItems: 10, maxItems: 20 }
const digest = (value: unknown) => digestNaturalPayload(JSON.stringify(value))

function contract(schema: ValueSchema) {
  return { id: "output", version: 1, dialect: "bat-value-schema/v1" as const, schema }
}

function fixture(schema: ValueSchema = { type: "object", properties: { records: collection },
  required: ["records"], additionalProperties: false }) {
  const outputContract = contract(schema)
  const sample: JsonValue[] = [{ name: "one" }, { name: "two" }, { name: "three" }]
  const output: JsonValue = { records: sample }
  const method = { container: ".row", fields: { name: { selector: ".name", attribute: null, valueType: "string" } },
    maxItems: 20, requireComplete: true,
    outputSchema: { type: "array", items: item, minItems: 0, maxItems: 20 } }
  const value = { actionRef: "a-0001", specification: method, outputPath: ["records"], readPath: [], output: sample,
    resultDigest: hash, urlDigest: digest(url), targetId: "target-1", containerIdsDigest: hash, stable: true,
    readRef: "r1", documentRootId: 1, coverage: { scope: "current_dom_matches", total: 20,
      sampled: 3, sampleLimit: 3, runtimeTruncated: false } }
  const fact = { id: "read-fact", kind: "verified_natural_read", value,
    sourceRefs: [{ ref: "read-fact", digest: digest(value) }] }
  const action = { id: "a-0001", name: "bat_read_fields", args: { outputPath: ["records"], container: ".row",
    fields: { name: { selector: ".name", attribute: null } }, maxItems: 20 }, status: "succeeded",
    preObservationRef: null, postObservationRef: "o-0001", resultRef: { ref: "read-result", digest: hash } }
  const done = { id: "a-0002", name: "done", args: { success: true, reason: "Method verified", readRefs: ["r1"] },
    status: "succeeded", preObservationRef: "o-0001", postObservationRef: "o-0002",
    resultRef: { ref: "done-result", digest: hash } }
  const observations = [{ id: "o-0001", tabId: "target-1", url, facts: [fact] },
    { id: "o-0002", tabId: "target-1", url, facts: [] }]
  const actions = [action, done]
  const source = () => {
    fact.sourceRefs[0]!.digest = digest(value)
    const requirement = { id: "requirement", version: 1, text: "Read names", taskText: "Read names", sourceDigest: hash }
    const plan = { id: "plan", version: 1, sourceDigest: hash, stepId: "step", inputSchemaDigest: hash,
      outputSchemaDigest: hash, callMode: "once", entryUrls: [url], semanticOperations: [],
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "data", schema,
        fields: [{ path: ["records"], description: "Names", producerRef: "records" }], derivations: [], edgeCases: [] } }
    const trace = { completed: true, source: { historyRef: "source:history" }, actions, observations,
      finalResultRef: { ref: "final", digest: digest(output) } }
    const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: hash,
      requirement: { ...requirement, digest: digest(requirement) }, plan: { ...plan, digest: digest(plan) },
      runtimeInputSchema: { type: "null" }, trace: { ...trace, digest: digest(trace) } }
    return { request: request as Record<string, JsonValue>, canonicalRequest: JSON.stringify(request), output }
  }
  return { outputContract, method, value, action, done, actions, observations, fact, sample, output, source }
}

function planFor(outputContract: ReturnType<typeof contract>): TaskPlan {
  return { steps: [{ id: "step", inputContract: contract({ type: "null" }), outputContract,
    input: { source: "constant", value: null }, invocation: { mode: "once" } }],
    outputContract, output: { source: "node", nodeId: "step", path: [] } } as unknown as TaskPlan
}

test("合法宿主方法样本可少于最终minItems，但原正式合同保持严格", () => {
  const value = fixture(), before = structuredClone(value.outputContract)
  const result = representativeSourceOutput(value.outputContract, value.source())
  assert.deepEqual(result.output, value.output)
  assert.deepEqual(result.samplePaths, [["records"]])
  assert.deepEqual(value.outputContract, before)
  assert.throws(() => parseTaskValue(value.outputContract, value.output))
})

test("done伪造引用、重复引用及重复宿主readRef均被拒绝", () => {
  const missing = fixture(); missing.done.args.readRefs = ["r9"]
  assert.throws(() => representativeSourceOutput(missing.outputContract, missing.source()), /read_ref_missing/)
  const duplicate = fixture(); duplicate.done.args.readRefs = ["r1", "r1"]
  assert.throws(() => representativeSourceOutput(duplicate.outputContract, duplicate.source()), /read_ref_duplicate/)
  const duplicatedFact = fixture(); duplicatedFact.observations[0]!.facts.push(duplicatedFact.fact)
  assert.throws(() => representativeSourceOutput(duplicatedFact.outputContract, duplicatedFact.source()), /read_ref_duplicate/)
})

test("方法证据必须绑定成功read行动、原后置观察与真实字段定位", () => {
  const mutations = [
    (value: ReturnType<typeof fixture>) => { value.action.name = "extract" },
    (value: ReturnType<typeof fixture>) => { value.action.postObservationRef = "o-0002" },
    (value: ReturnType<typeof fixture>) => { value.value.resultDigest = "b".repeat(64) },
    (value: ReturnType<typeof fixture>) => { value.action.args.fields.name.selector = ".different" },
    (value: ReturnType<typeof fixture>) => { value.value.targetId = "another-target" },
  ]
  for (const mutate of mutations) {
    const value = fixture(); mutate(value)
    assert.throws(() => representativeSourceOutput(value.outputContract, value.source()), /evidence_mismatch/)
  }
})

test("空样本、不稳定、截断、错误数量和缺失文档身份不能放宽输出", () => {
  const mutations = [
    (value: ReturnType<typeof fixture>) => { value.value.coverage.sampled = 0 },
    (value: ReturnType<typeof fixture>) => { value.value.stable = false },
    (value: ReturnType<typeof fixture>) => { value.value.coverage.runtimeTruncated = true },
    (value: ReturnType<typeof fixture>) => { value.value.coverage.total = 2 },
    (value: ReturnType<typeof fixture>) => { value.value.coverage.total = 21 },
    (value: ReturnType<typeof fixture>) => { value.value.documentRootId = 0 },
  ]
  for (const mutate of mutations) {
    const value = fixture(); mutate(value)
    assert.throws(() => representativeSourceOutput(value.outputContract, value.source()))
  }
})

test("最终maxItems与字段类型仍严格，不能因代表采样而整体降级", () => {
  const bounded = fixture({ type: "object", properties: { records: { type: "array", items: item, minItems: 0, maxItems: 2 } },
    required: ["records"], additionalProperties: false })
  assert.throws(() => representativeSourceOutput(bounded.outputContract, bounded.source()))
  const typed = fixture(); typed.sample[0] = { name: 42 }
  assert.throws(() => representativeSourceOutput(typed.outputContract, typed.source()))
})

test("来源输出必须保留现场样本值，且未获证明的兄弟数组保持minItems", () => {
  const altered = fixture(), original = altered.source()
  original.output = { records: [{ name: "invented" }] }
  assert.throws(() => representativeSourceOutput(altered.outputContract, original), /sample_output_mismatch/)
  const sibling = fixture({ type: "object", properties: { records: collection, unrelated: collection },
    required: ["records", "unrelated"], additionalProperties: false })
  ;(sibling.output as Record<string, JsonValue>).unrelated = [{ name: "short" }]
  assert.throws(() => representativeSourceOutput(sibling.outputContract, sibling.source()))
})

test("来源缺少新方法引用证据不能借旧字段事实进入代表输出通道", () => {
  const value = fixture()
  delete (value.value as Partial<typeof value.value>).readRef
  assert.throws(() => representativeSourceOutput(value.outputContract, value.source()), /read_ref_missing/)
})

test("未被done选中的空观察不冒充证据，也不覆盖另一次有效方法", () => {
  const value = fixture(), empty = structuredClone(value.fact)
  empty.id = "empty-observation"; empty.value.readRef = "r2"; empty.value.actionRef = "a-0000"
  empty.value.coverage.total = 0; empty.value.coverage.sampled = 0; empty.value.output = []
  empty.sourceRefs = [{ ref: "empty-observation", digest: digest(empty.value) }]
  value.observations[0]!.facts.push(empty)
  value.actions.unshift({ ...structuredClone(value.action), id: "a-0000" })
  assert.doesNotThrow(() => representativeSourceOutput(value.outputContract, value.source()))
})

test("准备推进和finish只使用已验证来源的node输出路径放宽minItems", () => {
  const value = fixture(), plan = planFor(value.outputContract), before = structuredClone(plan)
  const progression = plannedProgression(plan, null)
  const input = progression.resolve(plan.steps[0]!)
  progression.acceptSource("step", input, value.source())
  assert.doesNotThrow(() => progression.finish())
  assert.deepEqual(plan, before)
  const strict = plannedProgression(plan, null)
  strict.resolve(plan.steps[0]!)
  assert.throws(() => strict.accept("step", null, value.output))
})

test("finish不按值相等猜绑定，也不放宽未证明的最终maxItems", () => {
  const value = fixture(), unbound = planFor(value.outputContract)
  unbound.output = { source: "constant", value: value.output }
  const progression = plannedProgression(unbound, null)
  progression.resolve(unbound.steps[0]!)
  progression.acceptSource("step", null, value.source())
  assert.throws(() => progression.finish())
  const restricted = planFor(value.outputContract)
  restricted.outputContract = contract({ type: "object", properties: {
    records: { type: "array", items: item, maxItems: 2 } }, required: ["records"], additionalProperties: false })
  const bounded = plannedProgression(restricted, null)
  bounded.resolve(restricted.steps[0]!)
  bounded.acceptSource("step", null, value.source())
  assert.throws(() => bounded.finish())
})

function referencedFixture() {
  const base = fixture(), repeated = structuredClone(base.fact)
  repeated.id = "repeat-read"; repeated.value.actionRef = "a-repeat"; repeated.value.readRef = "r2"
  const action = { ...base.action, id: "a-repeat", args: { readRef: "r1" } as Record<string, JsonValue>,
    postObservationRef: "o-repeat" }
  const source = () => {
    const initial = base.source(), trace = naturalSourceContext(initial.canonicalRequest).ordinary.trace
    repeated.sourceRefs = [{ ref: repeated.id, digest: digest(repeated.value) }]
    const { digest: _oldDigest, ...body } = { ...trace, actions: [base.action, action, base.done],
      observations: [base.observations[0]!, { ...base.observations[0]!, id: "o-repeat", facts: [repeated] },
        base.observations[1]!] }
    const request = { ...initial.request, trace: jsonValueSchema.parse({ ...body, digest: digest(body) }) }
    return { ...initial, request, canonicalRequest: JSON.stringify(request) }
  }
  return { base, repeated, action, source }
}

test("readRef复用核验前序成功方法且拒绝覆盖、缺失、前向和改规格", () => {
  const originalSelected = referencedFixture()
  assert.doesNotThrow(() => representativeSourceOutput(originalSelected.base.outputContract, originalSelected.source()))
  originalSelected.base.done.args.readRefs = ["r2"]
  assert.deepEqual(representativeSourceOutput(originalSelected.base.outputContract, originalSelected.source()).output,
    originalSelected.base.output)
  const mutations: Array<(value: ReturnType<typeof referencedFixture>) => void> = [
    (value) => { value.action.args.readRef = "r99" },
    (value) => { value.action.args.readRef = "r2" },
    (value) => { value.action.args.container = ".override" },
    (value) => { value.base.action.status = "failed" },
    (value) => { value.repeated.value.specification.container = ".different" },
    (value) => { value.repeated.value.outputPath = ["another"] },
    (value) => { value.repeated.value.resultDigest = "b".repeat(64) },
    (value) => { Object.assign(value.base.action.args.fields.name, { normalizeWhitespace: true }) },
  ]
  for (const mutate of mutations) {
    const value = referencedFixture(); mutate(value)
    // 默认 done 仍选 r1；未选中的 r2 也不能夹带伪造复用事实。
    assert.throws(() => representativeSourceOutput(value.base.outputContract, value.source()))
  }
})
