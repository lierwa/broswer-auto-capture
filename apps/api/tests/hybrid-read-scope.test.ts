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

const browser = (url = oldUrl, documentId = "document-1") => ({ sessionId: "session", tabId: "tab", url,
  documentId, observationDigest: "1".repeat(64), observedAt: "2026-09-21T00:00:00.000Z" })
const config = { scope: { url: nextUrl }, [RUNTIME_SCOPE_FROM]: "s1", [RUNTIME_SCOPE_READ_ONLY]: true }

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
