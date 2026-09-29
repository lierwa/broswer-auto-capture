import assert from "node:assert/strict"
import test from "node:test"
import { browserStateSummarySchema, type JsonValue } from "@browser-capture/contracts"
import { classifyRuntimeScopeDecisions, digestRuntimeUrl, HybridRuntimeScopeState,
  RUNTIME_SCOPE_FROM, RUNTIME_SCOPE_READ_ONLY } from "../src/upstream-browser/hybrid-runtime-scope.js"

const oldUrl = "https://example.test/items", nextUrl = "https://example.test/items/current"
const documentDigest = "a".repeat(64)
const fact = (kind: string, value: JsonValue) => ({ id: kind, kind, value, sourceRefs: [] })
const identity = { targetId: "tab", documentDigest }
const sample = (url: string) => ({ ...identity, urlDigest: digestRuntimeUrl(url), stable: true })
function fixture() {
  const previous = { id: "post", tabId: "tab", url: oldUrl, facts: [
    fact("url_digest", digestRuntimeUrl(oldUrl)), fact("document_identity", identity)] }
  const current = { id: "pre", tabId: "tab", url: nextUrl, facts: [
    fact("url_digest", digestRuntimeUrl(nextUrl)), fact("document_identity", identity),
    fact("observation_diagnostic", { actionRef: "a2", phase: "before_action_read_refresh",
      outcome: "readonly_observation_refreshed", baseline: sample(oldUrl), current: sample(nextUrl) })] }
  return { compilation: { compilerVersion: "bat-hybrid/2", segments: [
    { id: "s1", kind: "deterministic", operation: { name: "browser.read-fields" }, target: null },
    { id: "s2", kind: "deterministic", operation: { name: "browser.read-fields" },
      target: { scope: { url: nextUrl, urlDigest: digestRuntimeUrl(nextUrl) } } },
  ], controlGraph: { edges: [{ from: "s1", to: "s2", outcome: "success" }] }, coverage: [
    { actionRef: "a1", disposition: "compiled", ownerSegmentId: "s1", exclusionRule: null },
    { actionRef: "a2", disposition: "compiled", ownerSegmentId: "s2", exclusionRule: null },
  ] }, trace: { actions: [
    { id: "a1", name: "find_elements", effect: "read", status: "succeeded", preObservationRef: null, postObservationRef: "post" },
    { id: "a2", name: "find_elements", effect: "read", status: "succeeded", preObservationRef: "pre", postObservationRef: null },
  ], observations: [previous, current] }, assertFact: () => {} }
}

test("只读scope跨URL必须保留同文档重新观察证据", () => {
  const input = fixture()
  assert.deepEqual(classifyRuntimeScopeDecisions(input), [
    { segmentId: "s2", runtimeScopeFrom: "s1", readOnlySameDocument: true }])
  for (const mutate of [
    (value: ReturnType<typeof fixture>) => { value.trace.observations[1]!.facts.pop() },
    (value: ReturnType<typeof fixture>) => { value.trace.actions[1]!.name = "click" },
    (value: ReturnType<typeof fixture>) => { value.trace.observations[1]!.facts[1]!.value = { ...identity, documentDigest: "b".repeat(64) } },
  ]) {
    const changed = fixture(); mutate(changed)
    assert.equal(classifyRuntimeScopeDecisions(changed)[0]!.limitation, "runtime_scope_source_boundary_changed")
  }
})

function intermediateReadFixture() {
  const post = { id: "post", tabId: "tab", url: oldUrl, facts: [
    fact("url_digest", digestRuntimeUrl(oldUrl)), fact("document_identity", identity)] }
  const refreshed = { id: "refreshed", tabId: "tab", url: nextUrl, facts: [
    fact("url_digest", digestRuntimeUrl(nextUrl)), fact("document_identity", identity),
    fact("observation_diagnostic", { actionRef: "a1", phase: "before_action_read_refresh",
      outcome: "readonly_observation_refreshed", baseline: sample(oldUrl), current: sample(nextUrl) })] }
  const after = { id: "after", tabId: "tab", url: nextUrl, facts: [
    fact("url_digest", digestRuntimeUrl(nextUrl)), fact("document_identity", identity)] }
  const before = { id: "before", tabId: "tab", url: nextUrl, facts: [
    fact("url_digest", digestRuntimeUrl(nextUrl)), fact("document_identity", identity)] }
  return { compilation: { compilerVersion: "bat-hybrid/2", segments: [
    { id: "s0", kind: "deterministic", operation: { name: "browser.workflow-step" }, target: null },
    { id: "s2", kind: "deterministic", operation: { name: "browser.read-fields" },
      target: { scope: { url: nextUrl, urlDigest: digestRuntimeUrl(nextUrl) } } },
  ], controlGraph: { edges: [{ from: "s0", to: "s2", outcome: "success" }] }, coverage: [
    { actionRef: "a0", disposition: "compiled", ownerSegmentId: "s0", exclusionRule: null },
    { actionRef: "a1", disposition: "agent_internal", ownerSegmentId: null,
      exclusionRule: "native_dom_lookup_observation/v1" },
    { actionRef: "a2", disposition: "compiled", ownerSegmentId: "s2", exclusionRule: null },
  ] }, trace: { actions: [
    { id: "a0", name: "navigate", effect: "navigation", status: "succeeded", preObservationRef: null,
      postObservationRef: "post" },
    { id: "a1", name: "find_elements", effect: "read", status: "succeeded", preObservationRef: "refreshed",
      postObservationRef: "after" },
    { id: "a2", name: "find_elements", effect: "read", status: "succeeded", preObservationRef: "before",
      postObservationRef: null },
  ], observations: [post, refreshed, after, before] }, assertFact: () => {} }
}

test("导航后未编译的只读刷新可把同文档URL变化传给后续字段读取", () => {
  const input = intermediateReadFixture()
  assert.deepEqual(classifyRuntimeScopeDecisions(input), [
    { segmentId: "s2", runtimeScopeFrom: "s0", readOnlySameDocument: true }])
  const missingDiagnostic = intermediateReadFixture()
  missingDiagnostic.trace.observations[1]!.facts.pop()
  assert.equal(classifyRuntimeScopeDecisions(missingDiagnostic)[0]!.limitation,
    "runtime_scope_read_exclusion_discontinuous")
  const differentDocument = intermediateReadFixture()
  differentDocument.trace.observations[1]!.facts[1]!.value = { ...identity, documentDigest: "b".repeat(64) }
  assert.equal(classifyRuntimeScopeDecisions(differentDocument)[0]!.limitation,
    "runtime_scope_read_exclusion_discontinuous")
  const laterDocumentChange = intermediateReadFixture()
  laterDocumentChange.trace.observations[3]!.facts[1]!.value = { ...identity, documentDigest: "b".repeat(64) }
  assert.equal(classifyRuntimeScopeDecisions(laterDocumentChange)[0]!.limitation,
    "runtime_scope_source_boundary_changed")
  const click = intermediateReadFixture()
  click.compilation.segments[1]!.operation.name = "browser.workflow-step"
  assert.equal(classifyRuntimeScopeDecisions(click)[0]!.limitation,
    "runtime_scope_read_only_target_required")
})

function delayedNavigationWaitFixture(): Parameters<typeof classifyRuntimeScopeDecisions>[0] {
  const waitResult = { ref: "wait-result", digest: "b".repeat(64) }
  const source = (name: string) => ({ ref: name, digest: name === "before" ? "c".repeat(64) : "d".repeat(64) })
  const observation = (id: string, sequence: number, url: string, clock: number, sourceRef = source("after")) => ({
    id, sequence, tabId: "tab", url, sourceRefs: [sourceRef], facts: [
      { id: `url-${digestRuntimeUrl(url)}`, kind: "url_digest", value: digestRuntimeUrl(url), sourceRefs: [sourceRef] },
      { id: `clock-${id}`, kind: "monotonic_ms", value: clock, sourceRefs: [sourceRef] },
      { id: `document-${id}`, kind: "document_identity", value: identity, sourceRefs: [sourceRef] },
    ],
  })
  const oldPost = observation("old-post", 10, oldUrl, 1000, source("before"))
  const waitPre = observation("wait-pre", 11, nextUrl, 1100)
  const waitPost = observation("wait-post", 12, nextUrl, 1200)
  const readPre = observation("read-pre", 13, nextUrl, 1300)
  return { compilation: { compilerVersion: "bat-hybrid/2", segments: [
    { id: "producer", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "click" },
      target: null, postconditions: [{ kind: "url_digest", changed: true,
        clauseRef: `url-${digestRuntimeUrl(nextUrl)}`,
        settle: { maxMs: 30000, maxAttempts: 100, intervalMs: 300 } }],
      proofRefs: [waitResult, ...waitPre.sourceRefs, ...waitPost.sourceRefs] },
    { id: "consumer", kind: "deterministic", operation: { name: "browser.read-fields" },
      target: { scope: { url: nextUrl, urlDigest: digestRuntimeUrl(nextUrl) } } },
  ], controlGraph: { edges: [{ from: "producer", to: "consumer", outcome: "success" }] }, coverage: [
    { actionRef: "click", disposition: "compiled", ownerSegmentId: "producer", exclusionRule: null },
    { actionRef: "wait", disposition: "supporting", ownerSegmentId: "producer",
      exclusionRule: "bounded_postcondition_wait/v1", evidenceRefs: [waitResult] },
    { actionRef: "read", disposition: "compiled", ownerSegmentId: "consumer", exclusionRule: null },
  ] }, trace: { actions: [
    { id: "click", name: "click", effect: "ui_state", status: "succeeded", preObservationRef: null,
      postObservationRef: "old-post" },
    { id: "wait", name: "wait", effect: "none", status: "succeeded", resultRef: waitResult,
      preObservationRef: "wait-pre", postObservationRef: "wait-post" },
    { id: "read", name: "find_elements", effect: "read", status: "succeeded", preObservationRef: "read-pre",
      postObservationRef: null },
  ], observations: [oldPost, waitPre, waitPost, readPre] }, assertFact: () => {} }
}

test("导航在有界 supporting wait 前完成时仍保留消费者运行 scope", () => {
  assert.deepEqual(classifyRuntimeScopeDecisions(delayedNavigationWaitFixture()), [
    { segmentId: "consumer", runtimeScopeFrom: "producer", predecessorCompletionObservationRef: "wait-post" },
  ])
  for (const mutate of [
    (value: any) => { value.compilation.coverage[1].exclusionRule = "unchanged_wait_after_proven_effect/v1" },
    (value: any) => { value.compilation.segments[0].postconditions[0].clauseRef = "unrelated" },
    (value: any) => { value.compilation.segments[0].proofRefs = [] },
    (value: any) => { value.compilation.coverage[1].evidenceRefs = [] },
    (value: any) => { value.trace.observations[1].sequence = 30 },
    (value: any) => { value.trace.observations[2].tabId = "other" },
    (value: any) => { value.trace.observations[2].url = oldUrl },
    (value: any) => { value.compilation.segments[0].postconditions[0].settle.maxMs = 10 },
  ]) {
    const changed = delayedNavigationWaitFixture(); mutate(changed)
    assert.equal(classifyRuntimeScopeDecisions(changed)[0]!.runtimeScopeFrom, undefined)
  }
})

function failedFieldReadFixture(): Parameters<typeof classifyRuntimeScopeDecisions>[0] {
  const input: Parameters<typeof classifyRuntimeScopeDecisions>[0] = intermediateReadFixture()
  for (const observation of input.trace.observations) {
    observation.url = nextUrl
    observation.facts = [fact("url_digest", digestRuntimeUrl(nextUrl)), fact("document_identity", identity)]
  }
  Object.assign(input.trace.actions[1]!, { name: "bat_read_fields", status: "failed",
    resultRef: { ref: "failed-read-result", digest: "f".repeat(64) } })
  input.trace.actions[2]!.name = "bat_read_fields"
  Object.assign(input.compilation.coverage[1]!, { exclusionRule: "failed_bat_field_read_probe/v1",
    evidenceRefs: [{ ref: "failed-read-result", digest: "f".repeat(64) }] })
  return input
}

test("失败字段探查仅在结果引用和连续同文档边界均获证明时保留读取scope", () => {
  assert.deepEqual(classifyRuntimeScopeDecisions(failedFieldReadFixture()), [
    { segmentId: "s2", runtimeScopeFrom: "s0" }])
  for (const mutate of [
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.actions[1]!.effect = "navigation" },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.actions[1]!.name = "click" },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.actions[1]!.name = "navigate" },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.actions[1]!.status = "succeeded" },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.actions[1]!.resultRef!.digest = "e".repeat(64) },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.compilation.coverage[1]!.evidenceRefs = [] },
    (value: ReturnType<typeof failedFieldReadFixture>) => {
      value.compilation.coverage[1]!.evidenceRefs!.push({ ref: "extra", digest: "e".repeat(64) })
    },
    (value: ReturnType<typeof failedFieldReadFixture>) => {
      value.trace.observations[2]!.url = oldUrl
      value.trace.observations[2]!.facts[0]!.value = digestRuntimeUrl(oldUrl)
    },
    (value: ReturnType<typeof failedFieldReadFixture>) => { value.trace.observations[1]!.tabId = "other" },
    (value: ReturnType<typeof failedFieldReadFixture>) => {
      value.trace.observations[2]!.facts[1]!.value = { ...identity, documentDigest: "b".repeat(64) }
    },
    (value: ReturnType<typeof failedFieldReadFixture>) => {
      value.trace.observations[3]!.facts[1]!.value = { ...identity, documentDigest: "b".repeat(64) }
    },
  ]) {
    const changed = failedFieldReadFixture(); mutate(changed)
    const decision = classifyRuntimeScopeDecisions(changed)[0]!
    assert.ok(decision.limitation)
    assert.equal(decision.runtimeScopeFrom, undefined)
  }
})

const browser = (url = oldUrl, documentId = "document-1") => ({ sessionId: "session", tabId: "tab", url,
  documentId, observationDigest: "1".repeat(64), observedAt: "2026-09-21T00:00:00.000Z" })
const config = { scope: { url: nextUrl }, [RUNTIME_SCOPE_FROM]: "s1", [RUNTIME_SCOPE_READ_ONLY]: true }

test("未派发提议允许只有原生页面元数据，不能要求尚未完成的现场采集", () => {
  const make = (): Parameters<typeof classifyRuntimeScopeDecisions>[0] => {
    const input: Parameters<typeof classifyRuntimeScopeDecisions>[0] = failedFieldReadFixture()
    Object.assign(input.trace.actions[1]!, { name: "click", effect: "ui_state", postObservationRef: null })
    Object.assign(input.compilation.coverage[1]!, { exclusionRule: "native_action_not_dispatched/v1" })
    input.trace.observations[1]!.facts = [fact("native_action_dispatch", { actionRef: "a1", entered: false })]
    return input
  }
  assert.deepEqual(classifyRuntimeScopeDecisions(make()), [{ segmentId: "s2", runtimeScopeFrom: "s0" }])
  for (const mutate of [
    (value: ReturnType<typeof make>) => { value.trace.observations[1]!.url = oldUrl },
    (value: ReturnType<typeof make>) => { value.trace.observations[1]!.tabId = "unrelated" },
    (value: ReturnType<typeof make>) => { value.trace.observations[1]!.facts[0]!.value = { actionRef: "a1", entered: true } },
    (value: ReturnType<typeof make>) => { value.trace.observations[1]!.facts = [] },
    (value: ReturnType<typeof make>) => { value.trace.observations[3]!.facts[0]!.value = digestRuntimeUrl(oldUrl) },
  ]) {
    const changed = make(); mutate(changed)
    assert.equal(classifyRuntimeScopeDecisions(changed)[0]!.runtimeScopeFrom, undefined)
  }
})

test("循环读取只接受已证明的初始或推进前驱，并核验当前实际页面", async () => {
  const repeated = { scope: { url: oldUrl }, [RUNTIME_SCOPE_FROM]: ["entry", "advance"] }
  for (const nodeId of ["entry", "advance"]) {
    const state = new HybridRuntimeScopeState(); state.succeed(nodeId, browser(nextUrl))
    assert.deepEqual(await state.commandConfig("browser.read-fields", repeated, async () => browser(nextUrl)),
      { scope: { url: nextUrl, urlDigest: digestRuntimeUrl(nextUrl) } })
  }
  for (const previous of ["query", "unrelated"]) {
    const state = new HybridRuntimeScopeState(); state.succeed(previous, browser(nextUrl))
    await assert.rejects(state.commandConfig("browser.read-fields", repeated, async () => browser(nextUrl)),
      /scope_predecessor_mismatch/)
  }
  const state = new HybridRuntimeScopeState(); state.succeed("advance", browser(nextUrl))
  await assert.rejects(state.commandConfig("browser.read-fields", repeated, async () => browser(oldUrl)), /scope_page_changed/)
  for (const marker of [[], ["entry", "entry"], ["entry", "advance", "other"], ["entry", 1]]) {
    await assert.rejects(new HybridRuntimeScopeState().commandConfig("browser.read-fields",
      { ...repeated, [RUNTIME_SCOPE_FROM]: marker }, async () => browser()), /scope_marker_invalid/)
  }
})

test("复跑只读以当前同文档URL绑定且不调用模型或重派动作", async () => {
  const state = new HybridRuntimeScopeState(); state.succeed("s1", browser())
  let observations = 0
  const result = await state.commandConfig("browser.read-fields", config, async () => { observations++; return browser(nextUrl) })
  assert.deepEqual(result, { scope: { url: nextUrl, urlDigest: digestRuntimeUrl(nextUrl) } })
  assert.equal(observations, 1)
  assert.equal(browserStateSummarySchema.parse(browser()).documentId, "document-1")
})

test("只读scope拒绝换文档、换tab、换会话和将标记用于点击", async () => {
  const { documentId: _documentId, ...legacy } = browser(nextUrl)
  for (const current of [browser(nextUrl, "document-2"), { ...browser(nextUrl), tabId: "other" },
    { ...browser(nextUrl), sessionId: "other" }, legacy]) {
    const state = new HybridRuntimeScopeState(); state.succeed("s1", browser())
    await assert.rejects(state.commandConfig("browser.read-fields", config, async () => current), /scope_page_changed/)
  }
  const state = new HybridRuntimeScopeState(); state.succeed("s1", browser())
  await assert.rejects(state.commandConfig("browser.workflow-step", config, async () => browser(nextUrl)), /read_scope_invalid/)
})

test("原有精确URL边界仍拒绝同文档URL变化", async () => {
  const state = new HybridRuntimeScopeState(); state.succeed("s1", browser())
  const { [RUNTIME_SCOPE_READ_ONLY]: _readMode, ...exact } = config
  await assert.rejects(state.commandConfig("browser.read-fields", exact, async () => browser(nextUrl)), /scope_page_changed/)
})
