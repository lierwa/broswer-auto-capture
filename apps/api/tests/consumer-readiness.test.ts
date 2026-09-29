import assert from "node:assert/strict"
import test from "node:test"
import { hybridPostconditionSchema, readSpecificationSchema } from "../src/upstream-browser/hybrid-schema.js"
import { assertActionResultReadiness } from "../src/upstream-browser/hybrid-consumer-readiness.js"
import { digestRuntimeUrl } from "../src/upstream-browser/hybrid-runtime-scope.js"

const read = { container: ".record", fields: { title: { selector: ".title", attribute: null,
  valueType: "string" as const } }, maxItems: 5, outputSchema: { type: "array" as const, maxItems: 5,
  items: { type: "object" as const, properties: { title: { type: "string" as const, maxLength: 200 } },
    required: ["title"], additionalProperties: false } } }
const settle = { maxMs: 30000, maxAttempts: 100, intervalMs: 300 }

test("已证明不改变页面的原生等待可以位于动作与正式消费者之间", () => {
  const make = () => {
    const sourceRef = { ref: "proof", digest: "a".repeat(64) }
    const next = "https://example.test/result", spec = readSpecificationSchema.parse({ ...read, maxInputBytes: 128000 })
    const observation = (id: string, url = next) => ({ id, tabId: "tab", url, facts: [
      { id: "url-" + id, kind: "url_digest", value: digestRuntimeUrl(url), sourceRefs: [sourceRef] },
    ] })
    const observations: Array<Record<string, any>> = [observation("p-pre", "https://example.test/start"),
      observation("p-post"), observation("w-pre"), observation("w-post"), observation("c-pre"), observation("c-post")]
    observations[5]!.facts.push({ id: "read-fact", kind: "verified_natural_read", sourceRefs: [sourceRef], value: {
      actionRef: "c", stable: true, targetId: "tab", urlDigest: digestRuntimeUrl(next),
      resultDigest: sourceRef.digest, specification: spec,
    } })
    const actions = ["p", "w", "c"].map((id) => ({ id, status: "succeeded", resultRef: sourceRef,
      name: id === "p" ? "click" : id === "w" ? "wait" : "find_elements",
      effect: id === "w" ? "none" : "read", preObservationRef: id + "-pre", postObservationRef: id + "-post" }))
    const segments = [{ id: "p", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "click" },
      postconditions: [{ kind: "url_digest", changed: true, clauseRef: "url-p-post" },
        { kind: "read_fields", transition: true, consumerRef: "c", clauseRef: "read-fact", read: spec,
          scope: { url: next, urlDigest: digestRuntimeUrl(next) }, settle }], proofRefs: [sourceRef] },
    { id: "w", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "wait" },
      postconditions: [], proofRefs: [sourceRef] },
    { id: "c", kind: "deterministic", operation: { name: "browser.read-fields", specification: spec },
      outputs: [{ sourceRef: "read-fact" }], postconditions: [] }]
    const context = { request: { trace: { actions, observations } }, payload: { assertFact: () => {} } }
    const compilation = { segments, coverage: actions.map((a) => ({ actionRef: a.id, ownerSegmentId: a.id, disposition: "compiled" })),
      controlGraph: { edges: [{ from: "p", to: "w", outcome: "success" }, { from: "w", to: "c", outcome: "success" }] } }
    return { context, compilation, scopes: new Map([["c", { segmentId: "c", runtimeScopeFrom: "w" }]]) }
  }
  const validate = (input: ReturnType<typeof make>) => assertActionResultReadiness(
    input.context as unknown as Parameters<typeof assertActionResultReadiness>[0],
    input.compilation as unknown as Parameters<typeof assertActionResultReadiness>[1], input.scopes)
  assert.doesNotThrow(() => validate(make()))
  const ready = make()
  Reflect.deleteProperty(ready.compilation.segments[0]!.postconditions[1]!, "transition")
  Object.assign(ready.compilation.segments[0]!.postconditions[1]!, { ready: true })
  assert.doesNotThrow(() => validate(ready))
  ready.context.request.trace.observations[3]!.tabId = "other"
  assert.throws(() => validate(ready), /consumer_readiness_boundary_unproven/)
  for (const mutate of [
    (x: ReturnType<typeof make>) => { x.context.request.trace.actions[1]!.name = "click" },
    (x: ReturnType<typeof make>) => { x.context.request.trace.observations[3]!.tabId = "other" },
    (x: ReturnType<typeof make>) => { x.context.request.trace.observations[3]!.facts[0].value = digestRuntimeUrl("https://example.test/other") },
    (x: ReturnType<typeof make>) => { x.compilation.controlGraph.edges[0]!.from = "unrelated" },
  ]) {
    const input = make(); mutate(input)
    assert.throws(() => validate(input), /consumer_readiness_(boundary_unproven|url_fact_mismatch|owner_missing)/)
  }
})

test("消费者就绪接受由有界 supporting wait 证明完成的导航", () => {
  const sourceRef = { ref: "proof", digest: "a".repeat(64) }
  const old = "https://example.test/start", next = "https://example.test/result"
  const spec = readSpecificationSchema.parse({ ...read, maxInputBytes: 128000 })
  const urlFact = (url: string) => ({ id: `url-${digestRuntimeUrl(url)}`, kind: "url_digest",
    value: digestRuntimeUrl(url), sourceRefs: [sourceRef] })
  const observation = (id: string, url: string) => ({ id, tabId: "tab", url, facts: [urlFact(url)] })
  const observations: Array<Record<string, any>> = [observation("p-pre", old), observation("p-post", old),
    observation("w-pre", next), observation("w-post", next), observation("c-pre", next), observation("c-post", next)]
  observations[5]!.facts.push({ id: "read-fact", kind: "verified_natural_read", sourceRefs: [sourceRef], value: {
    actionRef: "c", stable: true, targetId: "tab", urlDigest: digestRuntimeUrl(next),
    resultDigest: sourceRef.digest, specification: spec,
  } })
  const actions = [
    { id: "p", name: "click", status: "succeeded", resultRef: sourceRef,
      preObservationRef: "p-pre", postObservationRef: "p-post" },
    { id: "w", name: "wait", status: "succeeded", resultRef: sourceRef,
      preObservationRef: "w-pre", postObservationRef: "w-post" },
    { id: "c", name: "find_elements", status: "succeeded", resultRef: sourceRef,
      preObservationRef: "c-pre", postObservationRef: "c-post" },
  ]
  const compilation = { segments: [
    { id: "p", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "click" },
      postconditions: [{ kind: "url_digest", changed: true, clauseRef: `url-${digestRuntimeUrl(next)}` },
        { kind: "read_fields", ready: true, consumerRef: "c", clauseRef: "read-fact", read: spec,
          scope: { url: next, urlDigest: digestRuntimeUrl(next) }, settle }], proofRefs: [sourceRef] },
    { id: "c", kind: "deterministic", operation: { name: "browser.read-fields", specification: spec },
      outputs: [{ sourceRef: "read-fact" }], postconditions: [] },
  ], coverage: [
    { actionRef: "p", ownerSegmentId: "p", disposition: "compiled" },
    { actionRef: "w", ownerSegmentId: "p", disposition: "supporting" },
    { actionRef: "c", ownerSegmentId: "c", disposition: "compiled" },
  ], controlGraph: { edges: [{ from: "p", to: "c", outcome: "success" }] } }
  const context = { request: { trace: { actions, observations } }, payload: { assertFact: () => {} } }
  const scopes = new Map([["c", { segmentId: "c", runtimeScopeFrom: "p",
    predecessorCompletionObservationRef: "w-post" }]])
  assert.doesNotThrow(() => assertActionResultReadiness(
    context as unknown as Parameters<typeof assertActionResultReadiness>[0],
    compilation as unknown as Parameters<typeof assertActionResultReadiness>[1], scopes))
  scopes.set("c", { segmentId: "c", runtimeScopeFrom: "p", predecessorCompletionObservationRef: "p-post" })
  assert.throws(() => assertActionResultReadiness(
    context as unknown as Parameters<typeof assertActionResultReadiness>[0],
    compilation as unknown as Parameters<typeof assertActionResultReadiness>[1], scopes),
  /consumer_readiness_url_change_unproven/)
})

test("消费就绪只能引用一个正式读取节点并使用有界等待", () => {
  const parsed = hybridPostconditionSchema.parse({ kind: "read_fields", transition: true,
    consumerRef: "s-a-0002", read, scope: { url: "https://example.test/issues" }, settle })
  assert.equal("transition" in parsed, true)
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "read_fields", transition: true, read, settle }),
    /consumer_readiness_owner_and_settle_required/)
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "target_visible", ready: true,
    consumerRef: "s-a-0002", settle }), /consumer_readiness/)
})

test("动作事实仍只允许一个权威来源，读取输出 schema 保持独立", () => {
  assert.doesNotThrow(() => hybridPostconditionSchema.parse({ kind: "url", bindingArgument: "url", settle }))
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "url", bindingArgument: "url", changed: true }),
    /one_postcondition_authority_required/)
  assert.doesNotThrow(() => hybridPostconditionSchema.parse({ kind: "output_schema", schemaDigest: null }))
})

test("URL 解析只能用于 href 投影", () => {
  assert.doesNotThrow(() => readSpecificationSchema.parse({ ...read, fields: {
    url: { selector: "a", attribute: "href", resolveUrl: true, valueType: "string" },
  } }))
  assert.throws(() => readSpecificationSchema.parse({ ...read, fields: {
    title: { selector: ".title", attribute: null, resolveUrl: true, valueType: "string" },
  } }), /url_resolution_requires_link_attribute/)
})
