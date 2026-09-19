import assert from "node:assert/strict"
import test from "node:test"
import { functionDraftSchema } from "../src/upstream-browser/hybrid-schema.js"
import { materializeOrderedBranch, materializePreparationGraph,
  validateAndMaterializeFunctionDraft } from "../src/upstream-browser/hybrid-v2.js"

const hash = (value: string) => value.repeat(64).slice(0, 64)

test("FunctionDraft 禁止图字段，并在物化前真实执行 examples", async () => {
  const draft = { language: "javascript" as const,
    source: "function main(inputs) { return { normalized: inputs.value.trim().toLowerCase() }; }",
    inputs: { value: { type: "string" as const } }, outputSchema: { type: "object" as const,
      properties: { normalized: { type: "string" as const } }, required: ["normalized"], additionalProperties: false },
    examples: [{ input: { value: "  VALUE " }, output: { normalized: "value" } }] }
  assert.equal(functionDraftSchema.safeParse({ ...draft, id: "model-owned-node" }).success, false)
  const node = await validateAndMaterializeFunctionDraft({ id: "normalize", label: "normalize", draft,
    bindings: { value: { source: "input", path: ["value"] } }, timeoutMs: 200 })
  assert.equal(node.kind, "function")
  assert.equal("outcomes" in node, false)
  await assert.rejects(() => validateAndMaterializeFunctionDraft({ id: "bad", label: "bad",
    draft: { ...draft, examples: [{ input: { value: "x" }, output: { normalized: "wrong" } }] },
    bindings: { value: { source: "input", path: ["value"] } }, timeoutMs: 200 }), /function_draft_example_mismatch/)
})

test("有序 N 路 Branch 保存 cases 与动态 port，不展开二元节点串", () => {
  const predicate = (value: string) => ({ operator: "equals", left: { source: "input", path: ["value"] },
    right: { source: "constant", value } })
  const node = materializeOrderedBranch({ id: "route", label: "route", cases: [
    { id: "one", label: "one", predicate: predicate("1") }, { id: "two", label: "two", predicate: predicate("2") },
    { id: "three", label: "three", predicate: predicate("3") },
  ] })
  assert.deepEqual(node.cases.map((item) => item.id), ["one", "two", "three"])
  assert.equal("predicate" in node, false)
})

test("准备动作只有同 document 三段因果证据时物化，且动作最多位于图中一次", () => {
  const proofRefs = ["a", "b", "c"].map((value) => ({ ref: value, digest: hash(value) }))
  const preparation = { id: "gate", actionSegmentId: "dismiss", consumerSegmentId: "business", proofRefs }
  const evidence = [
    { phase: "before", ...proofRefs[0], documentId: "doc-1", status: "blocked" },
    { phase: "dispatch", ...proofRefs[1], documentId: "doc-1", dispatches: 1 },
    { phase: "after", ...proofRefs[2], documentId: "doc-1", status: "ready", unique: true },
  ]
  const graph = materializePreparationGraph({ preparation, evidence })
  assert.equal(graph.nodes.filter((node) => node.kind === "branch").length, 2)
  assert.equal(graph.edges.filter((edge) => edge.from === "dismiss" && edge.port === "success").length, 1)
  assert.ok(graph.edges.some((edge) => edge.from.endsWith("-verify") && edge.port === "default"
    && edge.to.endsWith("-ineffective")))
  assert.throws(() => materializePreparationGraph({ preparation,
    evidence: evidence.map((item, index) => index === 2 ? { ...item, documentId: "doc-2" } : item) }),
  /optional_preparation_document_changed/)
})
