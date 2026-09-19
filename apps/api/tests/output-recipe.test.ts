import assert from "node:assert/strict"
import test from "node:test"
import { materializeOutputAssembly } from "../src/upstream-browser/hybrid-output.js"
import { hybridOutputAssemblySchema, hybridResultBindingSchema, naturalBindingFactValueSchema } from "../src/upstream-browser/hybrid-schema.js"
import { describeResultSpec } from "../src/upstream-browser/task-request.js"

test("ResultSpec 给 B-U 的投影保留逻辑来源但不泄露 DOM 绑定", () => {
  const lines = describeResultSpec({ contractVersion: "bat-result-spec/v1", mode: "data",
    schema: { type: "array", items: { type: "string" }, maxItems: 5 },
    fields: [{ path: [], description: "返回当前页记录", producerRef: "read-page" }],
    derivations: [],
    edgeCases: [{ description: "空列表不进入详情", controlRef: "has-records" }] })

  assert.match(lines.join("\n"), /逻辑来源 read-page/)
  assert.match(lines.join("\n"), /逻辑控制 has-records/)
  assert.doesNotMatch(lines.join("\n"), /\.issue|#[a-z]|dom-[0-9]/i)
})

test("输出配方保留运行输入和授权常量绑定，不把样本展开成固定数组项", () => {
  const schema = { type: "object" as const, properties: {
    repository: { type: "string" as const, maxLength: 200 },
    state: { type: "string" as const, maxLength: 20 },
  }, required: ["repository", "state"], additionalProperties: false }
  const recipe = hybridOutputAssemblySchema.parse({
    sourceRef: "fact-output-recipe",
    fields: [
      { binding: { source: "input", path: ["repository"] }, path: ["repository"] },
      { binding: { source: "constant", value: "open" }, path: ["state"] },
    ],
    schema,
    proofRefs: [{ ref: "sha256:proof", digest: "a".repeat(64) }],
  })

  const { sourceRef: _sourceRef, proofRefs: _proofRefs, ...assembly } = recipe
  const materialized = materializeOutputAssembly(assembly, (binding) => binding)
  const merge = materialized.nodes[0]

  if (merge?.kind !== "capability") assert.fail("output recipe merge node missing")
  assert.deepEqual(merge.input.value0, { source: "input", path: ["repository"] })
  assert.deepEqual(merge.input.value1, { source: "constant", value: "open" })
  assert.deepEqual(materialized.schema, schema)
})

test("后续动作可绑定前序读取节点的数组值路径", () => {
  const value = naturalBindingFactValueSchema.parse({
    actionRef: "a-0002", argumentPath: "url", provenance: "node_output",
    sourceReadRef: "fact-read-page-2",
    binding: { source: "node", nodeId: "a-0001", path: [1, "url"] },
  })

  assert.deepEqual(value.binding, { source: "node", nodeId: "a-0001", path: [1, "url"] })
  assert.equal(value.sourceReadRef, "fact-read-page-2")
})

test("ResultBinding 只携带已验证来源和计划逻辑产生者", () => {
  const schema = { type: "array" as const, items: { type: "string" as const }, maxItems: 5 }
  const binding = hybridResultBindingSchema.parse({ contractVersion: "bat-result-binding/v1", schema,
    assignments: [{ to: [], from: { source: "node", nodeId: "a-0001", path: [] }, producerRef: "read-items" }],
    sourceRef: "fact-output", proofRefs: [{ ref: "fixture:proof", digest: "b".repeat(64) }] })

  assert.deepEqual(binding.assignments[0], {
    to: [], from: { source: "node", nodeId: "a-0001", path: [] }, producerRef: "read-items",
  })
  assert.equal(hybridResultBindingSchema.safeParse({ ...binding, assignments: [
    { ...binding.assignments[0], formula: "count(items)" },
  ] }).success, false)
})

test("空列表分支的两条输出路径写入同一结果变量", () => {
  const schema = { type: "object" as const, properties: {
    records: { type: "array" as const, items: { type: "string" as const }, maxItems: 5 },
    detail: { type: "string" as const },
  }, required: ["records"], additionalProperties: false }
  const branch = materializeOutputAssembly({ schema, fields: [{
    path: ["records"], binding: { source: "node", nodeId: "read-records", path: [] },
  }] }, (binding) => binding, {
    idPrefix: "branch-result-has-records", terminalId: "completed-empty-has-records", writeVariable: "result",
  })
  const assemble = branch.nodes[1]

  assert.equal(branch.binding.source, "variable")
  assert.deepEqual(assemble?.writes, [{ variable: "result", path: [] }])
  assert.ok(branch.edges.some((edge) => edge.from === assemble?.id && edge.outcome === "success"
    && edge.to === "completed-empty-has-records"))
})
