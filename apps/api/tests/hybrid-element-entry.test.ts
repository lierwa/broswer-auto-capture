// WHY：新增持久链接输入不能让历史不可变入口链在跨语言证据校验时失效。
import assert from "node:assert/strict"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { assertInputEntryTarget } from "../src/upstream-browser/hybrid-element-entry.js"
import { elementEntryValueSchema, legacyElementEntryValueSchema } from "../src/upstream-browser/element-entry-contract.js"

test("旧新入口合同均通过原来源核验，损坏的合同和身份仍拒绝", () => {
  const binding = { source: "input", path: ["entry"] }
  const entry = { kind: "element", tabId: "ABCD", url: "https://example.org/list", selector: "button",
    ordinal: 1, text: "Open", backendNodeId: 7, documentRootId: 2 }
  const fact = { kind: "input_entry_target", value: { actionRef: "a-0001", binding, entry,
    backendNodeId: 7, targetId: "target-ABCD" } }
  const segment = { id: "s1", kind: "deterministic", target: { strategy: "entry", entryBinding: binding } }
  const request = { runtimeInputSchema: { type: "object", properties: { entry: legacyElementEntryValueSchema }, required: ["entry"] },
    trace: { actions: [{ id: "a-0001", name: "click", status: "succeeded", preObservationRef: "o1" }],
      observations: [{ id: "o1", tabId: "target-ABCD", url: entry.url, facts: [fact] }] } }
  let verified = 0
  const payload = { assertFact: (value: unknown, id: string) => { assert.equal(value, fact); assert.equal(id, "o1"); verified++ } }
  const compilation = { coverage: [{ disposition: "compiled", ownerSegmentId: "s1", actionRef: "a-0001" }] }
  const check = () => assertInputEntryTarget(segment as Parameters<typeof assertInputEntryTarget>[0],
    request as unknown as Parameters<typeof assertInputEntryTarget>[1], payload as Parameters<typeof assertInputEntryTarget>[2],
    compilation as Parameters<typeof assertInputEntryTarget>[3])
  check()
  request.runtimeInputSchema.properties.entry = elementEntryValueSchema
  check()
  assert.equal(verified, 2)
  request.runtimeInputSchema.properties.entry = { type: "object", properties: {}, required: [], additionalProperties: false }
  assert.throws(check, /hybrid_entry_source_mismatch/)
  request.runtimeInputSchema.properties.entry = legacyElementEntryValueSchema
  fact.value.backendNodeId = 8
  assert.throws(check, /hybrid_entry_source_mismatch/)
})

test("同 tab 文档替换被拒绝，弹出页必须证明来源文档存活", () => {
  const binding = { source: "input", path: ["entry"] }
  const entry = { kind: "element", tabId: "ABCD", url: "https://example.org/list", selector: "button",
    ordinal: 1, text: "Open", backendNodeId: 7, documentRootId: 2 }
  const targetFact = { kind: "input_entry_target", value: { actionRef: "a-1", binding, entry,
    backendNodeId: 7, targetId: "target-ABCD" } }
  const document = (tab: string, digest: string) => ({ kind: "document_identity",
    value: { targetId: tab, documentDigest: digest.repeat(64) } })
  for (const [tab, url, digest, source, rejected] of [
    ["target-ABCD", entry.url, "a", null, false], ["popup-1234", "https://example.org/detail", "b", null, true],
    ["popup-1234", "https://example.org/detail", "b", "a", false],
    ["popup-1234", "https://example.org/detail", "b", "b", true],
    ["target-ABCD", "https://example.org/detail", "b", null, true], ["target-ABCD", entry.url, "b", null, true],
  ] as const) {
    const request = { runtimeInputSchema: { type: "object", properties: { entry: elementEntryValueSchema }, required: ["entry"] },
      trace: { actions: [{ id: "a-1", name: "click", status: "succeeded", preObservationRef: "o1", postObservationRef: "o2" }],
        observations: [{ id: "o1", tabId: "target-ABCD", url: entry.url, facts: [targetFact, document("target-ABCD", "a")] },
          { id: "o2", tabId: tab, url, facts: [document(tab, digest), ...(source ? [{ kind: "entry_source_document",
            value: { targetId: "target-ABCD", documentDigest: source.repeat(64), urlDigest: digestJson(entry.url) } }] : [])] }] } }
    const segment = { id: "s1", kind: "deterministic", target: { strategy: "entry", entryBinding: binding } }
    const compilation = { coverage: [{ disposition: "compiled", ownerSegmentId: "s1", actionRef: "a-1" }] }
    const check = () => assertInputEntryTarget(segment as Parameters<typeof assertInputEntryTarget>[0],
      request as unknown as Parameters<typeof assertInputEntryTarget>[1],
      { assertFact: () => {} } as unknown as Parameters<typeof assertInputEntryTarget>[2],
      compilation as Parameters<typeof assertInputEntryTarget>[3])
    if (rejected) assert.throws(check, /hybrid_entry_document_lifetime_unsupported/)
    else check()
  }
})
