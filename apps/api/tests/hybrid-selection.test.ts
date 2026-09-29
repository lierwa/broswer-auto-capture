import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { jsonValueSchema } from "@browser-capture/contracts"
import { z } from "zod"
import { digestCanonicalJson, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import { naturalPayloadContext } from "../src/upstream-browser/hybrid-natural-payload.js"
import { functionSegmentSchema } from "../src/upstream-browser/hybrid-schema.js"
import { materializeSelectionFunction, validateSelectionFunctions, withSelectionValidation } from "../src/upstream-browser/hybrid-selection.js"
import { assertNaturalBinding } from "../src/upstream-browser/hybrid-natural-materialization.js"

const hash = (value: unknown) => digestCanonicalJson(jsonValueSchema.parse(value))
const reference = (value: unknown) => ({ ref: `sha256:${hash(value)}`, digest: hash(value) })
const fact = (id: string, kind: string, value: unknown) => ({ id, kind, value, sourceRefs: [reference(value)] })
const rows = (texts: string[]) => texts.map((text, index) => ({ text, ordinal: index + 1 }))

function fixture(source = String.raw`function main({ candidates }) {
  const eligible = candidates.map(row => ({row, match: /^release (\d+)$/.exec(row.text)}))
    .filter(item => item.match).sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
  if (!eligible.length) throw new Error('no_candidate'); return eligible[0].row.ordinal;
}`, navigation = false) {
  const schema = { type: "array", minItems: 1, maxItems: 10, items: { type: "object",
    properties: { text: { type: "string" }, ordinal: { type: "integer", minimum: 1, maximum: 10 },
      ...(navigation ? { attribute_href: { type: "string" } } : {}) },
    required: ["text", "ordinal"], additionalProperties: false } }
  const specification = { container: "a.item", fields: { text: { selector: ":scope", attribute: null, valueType: "string" } },
    maxItems: 10, includeOrdinal: true, outputSchema: schema }
  const output = navigation ? rows(["1", "2", "Next"]).map((row, index) =>
    ({ ...row, attribute_href: `https://example.test/list?page=${index === 0 ? 1 : 2}` }))
    : rows(["release 4", "preview 9", "release 7"])
  const read = fact("read", "verified_natural_read", { actionRef: "a-0001", specification, output, stable: true })
  const draft = { language: "javascript", source, inputs: { candidates: schema },
    outputSchema: navigation ? { type: "string" } : { type: "integer", minimum: 1, maximum: 10 },
    examples: navigation ? [{ input: { candidates: output }, output: "https://example.test/list?page=2" }] : [
      { input: { candidates: output }, output: 3 },
      { input: { candidates: rows(["release 8", "release 4"]) }, output: 1 },
      { input: { candidates: rows(["preview 12", "release 10", "release 2", "preview 11"]) }, output: 2 },
    ] }
  const selection = fact("selection-a-0002", "selection_function", {
    actionRef: "a-0002", readFactRef: "read", requirementDigest: "1".repeat(64), draft })
  const structure = fact("dom-a-0002", "dom_structure", {
    actionRef: "a-0002", queryCandidate: { readActionRef: "a-0001" } })
  const requirement = { id: "requirement", version: 1, sourceDigest: "1".repeat(64),
    text: "Choose the newest release, excluding previews", taskText: "Choose the newest release" }
  const plan = { id: "plan", version: 1, sourceDigest: "2".repeat(64), stepId: "choose", callMode: "once",
    entryUrls: ["https://example.test/"], inputSchemaDigest: hash({ type: "null" }), outputSchemaDigest: hash({ type: "null" }),
    resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" }, semanticOperations: [] }
  const trace = { source: { historyRef: "test" }, actions: [
    { id: "a-0001", name: "find_elements", status: "succeeded", preObservationRef: "o-1", postObservationRef: "o-2" },
    { id: "a-0002", name: navigation ? "navigate" : "click", status: "succeeded",
      args: navigation ? { url: "https://example.test/list?page=2" } : {}, preObservationRef: "o-3", postObservationRef: "o-4" },
  ], observations: [{ id: "o-2", url: "https://example.test/", tabId: "tab-1", facts: [read] },
    { id: "o-3", url: "https://example.test/", tabId: "tab-1", facts: [selection, structure] }] }
  const segment = functionSegmentSchema.parse({ id: selection.id, kind: "function", label: "Choose",
    draft, inputBindings: { candidates: { source: "node", nodeId: "s-a-0001", path: [] } }, proofRefs: selection.sourceRefs })
  const readSegment = { id: "s-a-0001", kind: "deterministic", operation: { name: "browser.read-fields", version: 2,
    specification: { ...specification, maxInputBytes: 128000 } }, bindings: [], target: null, preconditions: [],
    expectedEffect: { kind: "read" }, postconditions: [{ kind: "output_schema", schemaDigest: hash(schema) }],
    outputs: [{ schema, sourceRef: read.id }], proofRefs: read.sourceRefs }
  const click = { id: "s-a-0002", kind: "deterministic", operation: { name: "browser.workflow-step", version: 2,
    actionName: navigation ? "navigate" : "click" },
    target: navigation ? null : { strategy: "structure", scope: { url: "https://example.test/" }, container: { kind: "css", value: "html" },
      items: { kind: "css", value: "a.item" }, ordinal: 3, withinItem: null,
      ordinalBinding: { source: "node", nodeId: segment.id, path: [] } },
    bindings: navigation ? [{ id: "b-a-0002-url", actionRef: "a-0002", argumentPath: "url", kind: "prior_output",
      sourceRef: segment.id, transform: null, derivation: "selection_function", proofRefs: selection.sourceRefs,
      binding: { source: "node", nodeId: segment.id, path: [] } }] : [], preconditions: [],
    expectedEffect: { kind: "ui_state" }, postconditions: [{ kind: "media_playback", equals: "playing" }],
    outputs: [], proofRefs: selection.sourceRefs }
  const sourcePayloads = [requirement, plan, trace, { type: "null" }, []].map(item => JSON.stringify(item))
  const body = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [...sourcePayloads.map(item => createHash("sha256").update(item).digest("hex")), "3".repeat(64)],
    segments: [readSegment, segment, click], controlGraph: { entry: readSegment.id, edges: [], terminals: [] },
    coverage: [], gaps: [] }
  const canonicalPayload = JSON.stringify(body)
  const envelope = validateHybridResponse({ compilation: { ...body,
    canonicalDigest: createHash("sha256").update(canonicalPayload).digest("hex") }, canonicalPayload, sourcePayloads })
  const request = z.record(z.string(), jsonValueSchema).parse({ compilerVersion: "bat-hybrid/2", actionRegistryVersion: "3".repeat(64),
    requirement: { ...requirement, digest: body.sourceDigests[0] }, plan: { ...plan, digest: body.sourceDigests[1] },
    trace: { ...trace, digest: body.sourceDigests[2] }, runtimeInputSchema: { type: "null" } })
  return { envelope, request, segment }
}

test("自然编译 Function 保留原集合身份并真实验证变长和重排输入", async () => {
  const { envelope, request, segment } = fixture()
  const payload = naturalPayloadContext(envelope, request)
  const node = materializeSelectionFunction(segment, { request: payload.ordinary,
    compilation: envelope.compilation, assertFact: payload.assertFact })
  assert.equal(node.kind, "function")
  await validateSelectionFunctions(envelope, request, new AbortController().signal)
})

test("同一Function可向导航传递动态URL，不能替换来源或参数绑定", async () => {
  const { envelope, request, segment } = fixture(
    'function main({candidates}) { const matches = candidates.filter(c => c.attribute_href.endsWith("page=2")); const hrefs = [...new Set(matches.map(c => c.attribute_href))]; if (hrefs.length !== 1) throw new Error("ambiguous"); return hrefs[0]; }', true)
  const payload = naturalPayloadContext(envelope, request)
  const context = { request: payload.ordinary, compilation: envelope.compilation, assertFact: payload.assertFact }
  assert.equal(materializeSelectionFunction(segment, context).outputContract.schema.type, "string")
  await validateSelectionFunctions(envelope, request, new AbortController().signal)
  const consumer = envelope.compilation.segments[2]!
  assert.equal(consumer.kind, "deterministic")
  if (consumer.kind !== "deterministic") throw new Error("missing navigation")
  const decision = consumer.bindings[0]!
  assert.deepEqual(assertNaturalBinding(decision, payload.ordinary.trace, payload),
    { source: "node", nodeId: segment.id, path: [] })
  assert.throws(() => assertNaturalBinding({ ...decision, binding: { source: "constant", value: "https://example.test/" } },
    payload.ordinary.trace, payload), /selection_function_binding_mismatch/)
  payload.ordinary.trace.observations[0]!.url = "https://example.test/different"
  assert.throws(() => materializeSelectionFunction(segment, context), /selection_function_binding_mismatch/)
})

test("样本常量不能发布，失败仍保留来源和明确编译gap", async () => {
  const { envelope, request } = fixture("function main() { return 3; }")
  const checked = validateHybridResponse(await withSelectionValidation(envelope, request, new AbortController().signal))
  assert.deepEqual(checked.sourcePayloads, envelope.sourcePayloads)
  assert.equal(checked.compilation.gaps[0]?.reason, "function_draft_example_mismatch")
})

test("模型程序不能替换读取绑定或需求事实", () => {
  const { envelope, request, segment } = fixture()
  const payload = naturalPayloadContext(envelope, request)
  assert.throws(() => materializeSelectionFunction({ ...segment,
    inputBindings: { candidates: { source: "constant", value: [] } } }, { request: payload.ordinary,
    compilation: envelope.compilation, assertFact: payload.assertFact }), /selection_function_binding_mismatch/)
})

test("点击的集合读取引用必须与 Function 输入来源一致", () => {
  const { envelope, request, segment } = fixture()
  const payload = naturalPayloadContext(envelope, request)
  const structure = payload.ordinary.trace.observations[1]!.facts[1]!
  structure.value = { actionRef: "a-0002", queryCandidate: { readActionRef: "a-9999" } }
  assert.throws(() => materializeSelectionFunction(segment, { request: payload.ordinary,
    compilation: envelope.compilation, assertFact: payload.assertFact }), /selection_function_source_mismatch/)
})
