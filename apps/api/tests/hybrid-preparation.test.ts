import assert from "node:assert/strict"
import test from "node:test"
import { detectNaturalPreparations } from "../src/upstream-browser/hybrid-preparation.js"
import { applyPreparationGraphs } from "../src/upstream-browser/hybrid-materializer.js"
import { assertWorkflowRuntimeSupported } from "../src/upstream-browser/retirement.js"

const digest = (value: number) => value.toString(16).repeat(64).slice(0, 64)
const source = (value: number) => [{ ref: `sha256:${digest(value)}`, digest: digest(value) }]
const overlay = (value: number, identity: number) => ({ id: `overlay-${identity}`, kind: "visible_overlays",
  value: digest(value), sourceRefs: source(identity) })
const structure = (actionRef: string, dialog: boolean, identity: number) => ({ id: `structure-${identity}`,
  kind: "dom_structure", value: { actionRef, targetRef: "target", scope: { urlDigest: digest(9), tabId: "tab",
    targetId: "target", document: { rootBackendNodeId: 15 } }, nodes: [
    { id: "root", parentRef: null, attributes: dialog ? { role: "dialog" } : {} },
    { id: "target", parentRef: "root", attributes: {} },
  ] }, sourceRefs: source(identity) })

function fixture(afterOverlay = 2) {
  const actionStructure = structure("a-0003", true, 1), consumerStructure = structure("a-0004", false, 2)
  const dispatch = { id: "dispatch", kind: "native_action_dispatch", value: { actionRef: "a-0003",
    actionName: "click", entered: true, resultReceived: true, eventCapture: { eventCount: 1 } }, sourceRefs: source(3) }
  const compilation = { compilerVersion: "bat-hybrid/2", coverage: [
    { actionRef: "a-0003", disposition: "compiled", ownerSegmentId: "s-a-0003" },
    { actionRef: "a-0004", disposition: "compiled", ownerSegmentId: "s-a-0004" },
  ], segments: [
    { id: "s-a-0003", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "click" },
      target: { strategy: "title", role: "button", name: "Continue" } },
    { id: "s-a-0004", kind: "deterministic", operation: { name: "browser.workflow-step", actionName: "click" },
      target: { strategy: "title", role: "button", name: "Submit" } },
  ], controlGraph: { edges: [{ from: "s-a-0003", outcome: "success", to: "s-a-0004" }] } }
  const request = { trace: { actions: [
    { id: "a-0003", name: "click", preObservationRef: "before", postObservationRef: "after" },
    { id: "a-0004", name: "click", preObservationRef: "ready", postObservationRef: "later" },
  ], observations: [
    { id: "before", facts: [actionStructure, overlay(1, 4), dispatch] },
    { id: "after", facts: [overlay(afterOverlay, 5)] },
    { id: "ready", facts: [consumerStructure, overlay(2, 6)] },
  ] } }
  return { compilation, request }
}

test("自然来源只把同文档、单次派发、对话遮挡消失后的相邻动作物化为可选准备", () => {
  const input = fixture(), asserted: string[] = []
  const result = detectNaturalPreparations({ compilation: input.compilation as never, request: input.request as never,
    assertFact: (fact, observationId) => asserted.push(`${observationId}:${fact.kind}`) })
  assert.equal(result.length, 1)
  assert.equal(result[0]?.preparation.actionSegmentId, "s-a-0003")
  assert.equal(result[0]?.preparation.consumerSegmentId, "s-a-0004")
  assert.equal(result[0]?.consumer.actionName, "click")
  assert.equal(asserted.length, 6)
})

test("遮挡状态没有变化时不得凭动作相邻关系猜测准备节点", () => {
  const input = fixture(1)
  assert.deepEqual(detectNaturalPreparations({ compilation: input.compilation as never, request: input.request as never,
    assertFact: () => assert.fail("不应消费未成立的证据") }), [])
})

test("准备图替换原成功边，普通页面跳过准备动作，遮挡页面只派发一次", () => {
  const input = fixture(), preparations = detectNaturalPreparations({ compilation: input.compilation as never,
    request: input.request as never, assertFact: () => {} })
  const graph = applyPreparationGraphs({ nodes: [
    { id: "before" }, { id: "s-a-0003" }, { id: "s-a-0004" },
  ], edges: [
    { from: "before", port: "success", to: "s-a-0003" },
    { from: "s-a-0003", port: "success", to: "s-a-0004" },
  ] } as never, preparations, "before")
  const gate = graph.nodes.find((node) => node.id === "prepare-optional-a-0003-before")
  assert.ok(gate && "config" in gate)
  assert.ok(graph.edges.some((edge) => edge.from === "before" && edge.to === gate.id))
  assert.equal(graph.edges.filter((edge) => edge.from === "s-a-0003"
    && edge.port === "success" && edge.to === "s-a-0004").length, 0)
  assert.equal(graph.edges.filter((edge) => edge.to === "s-a-0003").length, 2)
  assert.ok(graph.edges.some((edge) => edge.from.endsWith("-route")
    && edge.port === "ready" && edge.to === "s-a-0004"))
})

test("目标就绪性与 workflow-step/read-fields 属于同一个 hybrid Browser owner", () => {
  assert.doesNotThrow(() => assertWorkflowRuntimeSupported([{ nodes: [
    { kind: "capability", capability: { name: "browser.workflow-step", version: 2 } },
    { kind: "capability", capability: { name: "browser.target-readiness", version: 1 } },
  ] }] as never))
  assert.throws(() => assertWorkflowRuntimeSupported([{ nodes: [
    { kind: "capability", capability: { name: "browser.workflow-step", version: 2 } },
    { kind: "capability", capability: { name: "browser.unknown", version: 1 } },
  ] }] as never), /mixed_browser_runtime_unsupported/)
})
