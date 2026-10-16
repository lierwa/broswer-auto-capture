import assert from "node:assert/strict"
import test from "node:test"
import { compilationProgress } from "../src/task-chain/authoring-build-progress.js"
import { hybridPrefixCompilationSchema } from "../src/upstream-browser/hybrid-prefix-schema.js"

test("当前覆盖事实生成进度，未识别的覆盖结论仍拒绝", () => {
  const evidence = { ref: `sha256:${"a".repeat(64)}`, digest: "a".repeat(64) }
  const trace = { actions: [
    { id: "a-0001", name: "navigate" }, { id: "a-0002", name: "switch" },
  ] }
  const source = {
    mediaType: "application/vnd.bat.hybrid-prefix+json;version=2", segments: [],
    coverage: [
      { actionRef: "a-0001", disposition: "compiled", ownerSegmentId: "s-a-0001", exclusionRule: null, evidenceRefs: [evidence] },
      { actionRef: "a-0002", disposition: "not_compilable", ownerSegmentId: null, exclusionRule: null, evidenceRefs: [evidence] },
    ], gaps: [{ id: "gap-0001", code: "missing_effect_proof", actionRefs: ["a-0002"], clauseRefs: [],
      reason: "switch_tab_binding_not_observed", resolution: "collect_evidence" }],
  }
  const parse = hybridPrefixCompilationSchema.pick({ coverage: true, gaps: true }).strip()
  assert.deepEqual(compilationProgress(parse.parse(source), trace), { observedActions: 2, compiledActions: 1,
    pendingActions: 1, excludedActions: 0,
    issues: [{ actionRef: "a-0002", actionName: "switch", reason: "switch_tab_binding_not_observed" }] })
  source.coverage[1]!.disposition = "invented_success"
  assert.equal(parse.safeParse(source).success, false)
})
