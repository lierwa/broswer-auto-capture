import assert from "node:assert/strict"
import test from "node:test"
import { storedCompilationProgress } from "../src/task-chain/authoring-build-progress.js"

type Build = Parameters<typeof storedCompilationProgress>[0]

test("历史完整编译包只读投影覆盖进度，未识别的覆盖结论仍拒绝", () => {
  const evidence = { ref: `sha256:${"a".repeat(64)}`, digest: "a".repeat(64) }
  const packet = { canonicalRequest: JSON.stringify({ trace: { actions: [
    { id: "a-0001", name: "navigate" }, { id: "a-0002", name: "switch" },
  ] } }), response: { compilation: {
    mediaType: "application/vnd.bat.hybrid-prefix+json;version=2", segments: [],
    coverage: [
      { actionRef: "a-0001", disposition: "compiled", ownerSegmentId: "s-a-0001", exclusionRule: null, evidenceRefs: [evidence] },
      { actionRef: "a-0002", disposition: "not_compilable", ownerSegmentId: null, exclusionRule: null, evidenceRefs: [evidence] },
    ], gaps: [{ id: "gap-0001", code: "missing_effect_proof", actionRefs: ["a-0002"], clauseRefs: [],
      reason: "switch_tab_binding_not_observed", resolution: "collect_evidence" }],
  } } }
  const build = { payload: JSON.stringify(packet) } as Build
  const original = build.payload
  assert.deepEqual(storedCompilationProgress(build), { observedActions: 2, compiledActions: 1,
    pendingActions: 1, excludedActions: 0,
    issues: [{ actionRef: "a-0002", actionName: "switch", reason: "switch_tab_binding_not_observed" }] })
  assert.equal(build.payload, original)
  packet.response.compilation.coverage[1]!.disposition = "invented_success"
  assert.equal(storedCompilationProgress({ ...build, payload: JSON.stringify(packet) }), undefined)
})
