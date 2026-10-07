import assert from "node:assert/strict"
import test from "node:test"
import { jsonValueSchema, parseTaskValue, type JsonValue, type TaskPlan, type ValueSchema } from "@browser-capture/contracts"
import { plannedProgression } from "../src/task-chain/authoring-progression.js"
import { representativeSourceOutput } from "../src/upstream-browser/hybrid-method-evidence.js"
import { digestNaturalPayload, naturalSourceContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { contentValueSchema } from "../src/upstream-browser/page-content-contract.js"
import { materializeHybridNodes } from "../src/upstream-browser/hybrid-materializer-nodes.js"
import { readSpecificationSchema } from "../src/upstream-browser/hybrid-schema.js"

const hash = "a".repeat(64), url = "https://example.test/list"
const item: ValueSchema = { type: "object", properties: { name: { type: "string", minLength: 1 } },
  required: ["name"], additionalProperties: false }
const collection: ValueSchema = { type: "array", items: item, minItems: 10, maxItems: 20 }
const digest = (value: unknown) => digestNaturalPayload(JSON.stringify(value))

function contract(schema: ValueSchema) {
  return { id: "output", version: 1, dialect: "bat-value-schema/v1" as const, schema }
}

function fixture(schema: ValueSchema = { type: "object", properties: { records: collection },
  required: ["records"], additionalProperties: false }, captureContent = false) {
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
        fields: [{ path: captureContent ? [] : ["records"], description: "Names",
          producerRef: captureContent ? "page-content" : "records" }], derivations: [], edgeCases: [] } }
    const trace = { completed: true, source: { historyRef: "source:history" }, actions, observations,
      finalResultRef: { ref: "final", digest: digest(output) } }
    const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: hash,
      requirement: { ...requirement, digest: digest(requirement) }, plan: { ...plan, digest: digest(plan) },
      runtimeInputSchema: { type: "null" }, trace: { ...trace, digest: digest(trace) } }
    return { request: request as Record<string, JsonValue>, canonicalRequest: JSON.stringify(request), output }
  }
  return { outputContract, method, value, action, done, actions, observations, fact, sample, output, source }
}

test("当前页地址方法经过真实来源交接及物化，不能夹带与方法不同的投影", () => {
  const f = fixture()
  Object.assign(f.method.fields.name, { selector: ":scope", valueSource: "page-url" })
  Object.assign(f.action.args.fields.name, { selector: ":scope", valueSource: "page-url" })
  f.sample.forEach(value => Object.assign(value as object, { name: url }))
  const source = f.source()
  assert.deepEqual(representativeSourceOutput(f.outputContract, source).output, f.output)
  const native = naturalSourceContext(source.canonicalRequest), specification = readSpecificationSchema.parse(f.method)
  const context = { version: 2 as const, request: native.ordinary,
    payload: { assertFact: native.assertFact } as Extract<Parameters<typeof materializeHybridNodes>[0]["context"],
      { version: 2 }>["payload"] }
  const compilation = { compilerVersion: "bat-hybrid/2", coverage: [{ actionRef: f.action.id,
    ownerSegmentId: "read-url", disposition: "compiled" }], segments: [{ id: "read-url", kind: "deterministic",
    operation: { name: "browser.read-fields", version: 1, specification: { ...specification, maxInputBytes: 128000 } },
    bindings: [], target: null, postconditions: [], expectedEffect: { kind: "read" },
    outputs: [{ sourceRef: f.fact.id, schema: specification.outputSchema }] }] }
  const node = materializeHybridNodes({ compilation: compilation as never, context,
    model: "unused", runtimeScopes: new Map(), repeats: [] }).nodes[0]!
  assert.equal(node.kind, "capability")
  if (node.kind === "capability") {
    assert.equal((node.config as { specification: typeof specification }).specification.fields.name?.valueSource, "page-url")
  }
  Object.assign(f.action.args.fields.name, { valueSource: null })
  assert.throws(() => representativeSourceOutput(f.outputContract, f.source()), /hybrid_method_field_evidence_mismatch/)
})

test("范围读取只要求容器，宿主证明完成产物，不要求最终参数或模型输出技术引用", () => {
  const f = fixture(contentValueSchema, true)
  const output = { content: JSON.stringify({ html: "<section>whole region</section>" }) }
  for (const key of Object.keys(f.output as object)) Reflect.deleteProperty(f.output as object, key)
  Object.assign(f.output as object, output)
  Object.assign(f.method, { container: "#region", fields: { content: { selector: ":scope", attribute: null,
    valueType: "string", contentSource: "page-content" } }, maxItems: 1, outputSchema: contentValueSchema })
  Object.assign(f.value, { output, outputPath: [], readPath: [],
    coverage: { scope: "current_dom_matches", total: 1, sampled: 1, sampleLimit: 3, runtimeTruncated: false } })
  Object.assign(f.action, { args: { container: "#region" } })
  f.done.args.readRefs = []
  assert.deepEqual(representativeSourceOutput(f.outputContract, f.source()).output, output)
  Object.assign(f.method, { contentRegion: "common-ancestor" })
  Object.assign(f.action, { args: { regions: "#region" } })
  assert.deepEqual(representativeSourceOutput(f.outputContract, f.source()).output, output)
  Object.assign(f.method, { contentRegion: "selected-regions" })
  assert.throws(() => representativeSourceOutput(f.outputContract, f.source()), /hybrid_method_capture_contract_invalid/)
  Object.assign(f.action, { args: { regions: "#region", regionMode: "selected-regions" } })
  assert.deepEqual(representativeSourceOutput(f.outputContract, f.source()).output, output)
  Object.assign(f.action, { args: { container: "#region" } })
  assert.throws(() => representativeSourceOutput(f.outputContract, f.source()), /hybrid_method_capture_contract_invalid/)
  Reflect.deleteProperty(f.method, "contentRegion")
  Object.assign(f.action, { args: { container: "#other-region" } })
  assert.throws(() => representativeSourceOutput(f.outputContract, f.source()), /hybrid_method_action_evidence_mismatch/)
})

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

test("新协议方法结束声明不污染数据产物，旧协议保持原严格字段", () => {
  const f = fixture()
  Object.assign(f.done.args, { methodOutcome: "recorded" })
  const source = f.source()
  assert.throws(() => representativeSourceOutput(f.outputContract, source), /methodOutcome/)
  source.request.compilerVersion = "bat-hybrid/3"
  source.canonicalRequest = JSON.stringify(source.request)
  assert.deepEqual(representativeSourceOutput(f.outputContract, source).output, f.output)
})

test("页面样本合并只能继承本输入同路径字段，拒绝模型填值和其他记录", () => {
  const schema: ValueSchema = { type: "object", properties: { records: collection, label: { type: "string" } },
    required: ["records", "label"], additionalProperties: false }
  const value = fixture(schema)
  ;(value.output as Record<string, JsonValue>).label = "real-input"
  const source = value.source()
  source.request.runtimeInputSchema = { type: "object", properties: { label: { type: "string" } },
    required: ["label"], additionalProperties: false }
  const plan = source.request.plan as Record<string, JsonValue>
  ;(plan.resultSpec as Record<string, JsonValue>).fields = [{ path: [], description: "Observed and inherited", producerRef: "all" }]
  const { digest: _digest, ...body } = plan
  plan.digest = digest(body)
  source.canonicalRequest = JSON.stringify(source.request)
  assert.doesNotThrow(() => representativeSourceOutput(value.outputContract, source, { label: "real-input" }))
  assert.throws(() => representativeSourceOutput(value.outputContract, source, { label: "other-record" }), /origin_unverified/)
  assert.throws(() => representativeSourceOutput(value.outputContract, source, { elsewhere: "real-input" }), /origin_unverified/)
  ;(source.request.runtimeInputSchema as Record<string, JsonValue>).required = []
  source.canonicalRequest = JSON.stringify(source.request)
  assert.throws(() => representativeSourceOutput(value.outputContract, source, { label: "real-input" }), /origin_unverified/)
})

test("done伪造引用、重复引用及重复宿主readRef均被拒绝", () => {
  const missing = fixture(); missing.done.args.readRefs = ["r9"]
  assert.throws(() => representativeSourceOutput(missing.outputContract, missing.source()), /read_ref_missing/)
  const duplicate = fixture(); duplicate.done.args.readRefs = ["r1", "r1"]
  assert.throws(() => representativeSourceOutput(duplicate.outputContract, duplicate.source()), /read_ref_duplicate/)
  const duplicatedFact = fixture(); duplicatedFact.observations[0]!.facts.push(duplicatedFact.fact)
  assert.throws(() => representativeSourceOutput(duplicatedFact.outputContract, duplicatedFact.source()), /read_ref_duplicate/)
})

test("对象后备读取允许代表输入缺省，实际输入存在时必须对应本项", () => {
  const schema: ValueSchema = { type: "object", properties: { name: { type: "string", minLength: 1 },
    size: { type: "string" } }, required: ["name", "size"], additionalProperties: false }
  const value = fixture(schema), output = value.output as Record<string, JsonValue>
  delete output.records; output.name = "detail-name"; output.size = "XL"
  const fields = { name: { selector: ".name", attribute: null, valueType: "string" },
    size: { selector: ".size", attribute: null, valueType: "string" } }
  Object.assign(value.value, { output, outputPath: [], readPath: [],
    specification: { container: "body", fields, maxItems: 1, requireComplete: true, outputSchema: schema, inheritFields: ["name"] },
    coverage: { scope: "current_dom_matches", total: 1, sampled: 1, sampleLimit: 3, runtimeTruncated: false } })
  Object.assign(value.action.args, { container: "body", outputPath: [], maxItems: 1,
    fields: { name: { selector: ".name", attribute: null }, size: { selector: ".size", attribute: null } } })
  const source = value.source()
  source.request.runtimeInputSchema = jsonValueSchema.parse({ type: "object", properties: { name: schema.properties.name! },
    required: [], additionalProperties: false })
  const plan = source.request.plan as Record<string, JsonValue>
  ;(plan.resultSpec as Record<string, JsonValue>).fields = [{ path: [], description: "Object read", producerRef: "all" }]
  const { digest: _digest, ...body } = plan; plan.digest = digest(body)
  source.canonicalRequest = JSON.stringify(source.request)
  assert.doesNotThrow(() => representativeSourceOutput(value.outputContract, source, {}))
  assert.doesNotThrow(() => representativeSourceOutput(value.outputContract, source, { name: "detail-name" }))
  assert.throws(() => representativeSourceOutput(value.outputContract, source, { name: "other-record" }), /inheritance_mismatch/)
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

test("来源数组逐条继承根参数，任何一条被改写都拒绝", () => {
  const row: ValueSchema = { ...item, properties: { ...item.properties, amount: { type: "integer" } },
    required: ["name", "amount"] }
  const schema: ValueSchema = { type: "array", items: row, minItems: 10, maxItems: 20 }
  const f = fixture(schema)
  f.sample.forEach(value => Object.assign(value as object, { amount: 8 }))
  Object.assign(f.value, { outputPath: [], output: f.sample })
  Object.assign(f.method, { outputSchema: { ...schema, minItems: 0 }, inheritFields: ["amount"] })
  f.action.args.outputPath = []
  const source: { request: Record<string, JsonValue>; canonicalRequest: string; output: JsonValue } = f.source()
  source.output = f.sample
  source.request.runtimeInputSchema = jsonValueSchema.parse({ type: "object", properties: { amount: { type: "integer" } },
    required: ["amount"], additionalProperties: false })
  const plan = source.request.plan as Record<string, JsonValue>
  ;(plan.resultSpec as Record<string, JsonValue>).fields = [{ path: [], description: "Selected entries", producerRef: "entries" }]
  const { digest: _digest, ...body } = plan; plan.digest = digest(body)
  source.canonicalRequest = JSON.stringify(source.request)
  assert.doesNotThrow(() => representativeSourceOutput(f.outputContract, source, { amount: 8 }))
  assert.throws(() => representativeSourceOutput(f.outputContract, source, { amount: 9 }), /inheritance_mismatch/)
  const native = naturalSourceContext(source.canonicalRequest), specification = readSpecificationSchema.parse(f.method)
  const context = { version: 2 as const, request: native.ordinary,
    payload: { assertFact: native.assertFact } as Extract<Parameters<typeof materializeHybridNodes>[0]["context"],
      { version: 2 }>["payload"] }
  const compilation = { compilerVersion: "bat-hybrid/2", coverage: [{ actionRef: f.action.id,
    ownerSegmentId: "read-root", disposition: "compiled" }], segments: [{ id: "read-root", kind: "deterministic",
    operation: { name: "browser.read-fields", version: 1, specification: { ...specification, maxInputBytes: 128000 } },
    bindings: [], target: null, postconditions: [], expectedEffect: { kind: "read" },
    outputs: [{ sourceRef: f.fact.id, schema: specification.outputSchema }] }] }
  const materialize = () => materializeHybridNodes({ compilation: compilation as never, context,
    model: "unused", runtimeScopes: new Map(), repeats: [] }).nodes[0]!
  const node = materialize()
  assert.equal(node.kind, "capability")
  if (node.kind === "capability") assert.deepEqual(node.input.record, { source: "input", path: [] })
  context.request.runtimeInputSchema = { type: "object", properties: { amount: { type: "string" } },
    required: ["amount"], additionalProperties: false }
  assert.throws(materialize, /hybrid_natural_read_input_schema_mismatch/)
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
