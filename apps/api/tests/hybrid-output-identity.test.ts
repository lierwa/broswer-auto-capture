import assert from "node:assert/strict"
import test from "node:test"
import { parseTaskValue, type ValueSchema } from "@browser-capture/contracts"
import { executeDataOperation } from "../../../packages/runtime/src/task-chain/data.js"
import { bindingSchemaInGraph } from "../src/upstream-browser/hybrid-output-identity.js"
import { materializeOutputAssembly } from "../src/upstream-browser/hybrid-output.js"

const schema: ValueSchema = { type: "object", properties: { title: { type: "string" }, count: { type: "number" } },
  required: ["title", "count"], additionalProperties: false }
const fields = ["title", "count"].map(key => ({ path: [key], binding: { source: "node" as const, nodeId: "read", path: [key] } }))
const sourceSchema = (binding: Parameters<typeof bindingSchemaInGraph>[0]) => bindingSchemaInGraph(binding,
  { type: "null" }, [{ id: "read", outputContract: { schema } }], {})

test("单一完整值且合同精确一致的新候选直接返回原读取绑定", () => {
  const result = materializeOutputAssembly({ fields: [{ path: [], binding: { source: "node", nodeId: "read", path: [] } }], schema }, binding => binding, { sourceSchema })
  assert.deepEqual(result.nodes, []); assert.deepEqual(result.edges, [])
  assert.equal(result.entry, "completed")
  assert.deepEqual(result.binding, { source: "node", nodeId: "read", path: [] })
})

test("同源封闭必需字段复用一次assemble，开放对象、可缺字段、混源或未知合同保留原路径", () => {
  assert.equal(materializeOutputAssembly({ fields, schema }, b => b, { sourceSchema }).nodes.length, 1)
  const open = { ...schema, additionalProperties: true }
  const optional = { ...schema, required: ["title"] }
  for (const candidate of [open, optional]) {
    assert.equal(materializeOutputAssembly({ fields, schema: candidate }, b => b,
      { sourceSchema: () => candidate }).nodes.length, 2)
  }
  const rename = [{ ...fields[0]!, path: ["count"] }, { ...fields[1]!, path: ["title"] }]
  assert.equal(materializeOutputAssembly({ fields: rename, schema }, b => b, { sourceSchema }).nodes.length, 1)
  const mixed = [fields[0]!, { ...fields[1]!, binding: { ...fields[1]!.binding, nodeId: "other" } }]
  assert.equal(materializeOutputAssembly({ fields: mixed, schema }, b => b, { sourceSchema }).nodes.length, 2)
  assert.equal(materializeOutputAssembly({ fields, schema }, b => b).nodes.length, 2)
})

test("同源投影保持rewrite、字段顺序、falsy、嵌套目标和一次变量写；重复及数字键排序回退", () => {
  const renamed = [{ ...fields[1]!, path: ["result", "amount"] }, { ...fields[0]!, path: ["result", "text"] }]
  const root: ValueSchema = { type: "object", properties: { result: schema }, required: ["result"], additionalProperties: false }
  const target: ValueSchema = { type: "object", properties: { result: { type: "object",
    properties: { amount: { type: "number" }, text: { type: "string" } }, required: ["amount", "text"], additionalProperties: false } },
  required: ["result"], additionalProperties: false }
  const result = materializeOutputAssembly({ fields: renamed, schema: target }, b => b.source === "node"
    ? { source: "input", path: ["result", ...b.path] } : b,
  { sourceSchema: binding => bindingSchemaInGraph(binding, root, [], {}), writeVariable: "saved" })
  assert.equal(result.nodes.length, 1)
  const node = result.nodes[0]!
  assert.equal(node.kind, "capability")
  if (node.kind !== "capability") throw new Error("fixture_capability_required")
  assert.deepEqual(node.input.source, { source: "input", path: ["result"] })
  assert.deepEqual(node.writes, [{ variable: "saved", path: [] }])
  assert.deepEqual(result.binding, { source: "variable", name: "saved", path: [] })
  const paths = node.input.paths
  assert.equal(paths?.source, "constant")
  if (paths?.source !== "constant") throw new Error("fixture_paths_required")
  const value = executeDataOperation("transform", { source: { title: "", count: 0 }, paths: paths.value, mode: "assemble" })
  assert.deepEqual(parseTaskValue(node.outputContract, value), value)
  assert.equal(JSON.stringify(value),
    '{"result":{"amount":0,"text":""}}')
  const duplicate = [fields[0]!, { ...fields[0]!, path: ["copy"] }]
  assert.equal(materializeOutputAssembly({ fields: duplicate, schema }, b => b, { sourceSchema }).nodes.length, 2)
  const numeric = ["2", "1"].map(key => ({ path: [key], binding: { source: "input" as const, path: [key] } }))
  const numbered: ValueSchema = { type: "object", properties: { "1": { type: "null" }, "2": { type: "boolean" } },
    required: ["1", "2"], additionalProperties: false }
  assert.equal(materializeOutputAssembly({ fields: numeric, schema: numbered }, b => b,
    { sourceSchema: binding => bindingSchemaInGraph(binding, numbered, [], {}) }).nodes.length, 2)
  assert.deepEqual(executeDataOperation("transform", { source: { first: null, second: false },
    paths: { first: ["empty"], second: ["flag"] }, mode: "assemble" }), { empty: null, flag: false })
})

test("真实rewrite后的共同前缀可恒等消除；变量写入仍复用assign且保持空值", () => {
  const root: ValueSchema = { type: "object", properties: { result: schema }, required: ["result"], additionalProperties: false }
  const options = { sourceSchema: (binding: Parameters<typeof bindingSchemaInGraph>[0]) => bindingSchemaInGraph(binding,
    root, [], {}), writeVariable: "result" }
  const result = materializeOutputAssembly({ fields: [{ path: [], binding: { source: "node", nodeId: "read", path: [] } }], schema }, b => b.source === "node"
    ? { source: "input", path: ["result", ...b.path] } : b, options)
  assert.equal(result.nodes.length, 1)
  const node = result.nodes[0]!
  assert.equal(node.kind, "capability")
  assert.deepEqual(node.writes, [{ variable: "result", path: [] }])
  assert.deepEqual(result.binding, { source: "variable", name: "result", path: [] })
  assert.deepEqual(executeDataOperation("assign", { value: { title: "", count: 0 } }), { title: "", count: 0 })
  assert.equal(result.edges.find(edge => edge.outcome === "success")?.to, "completed")
})

test("重叠路径保持原assemble失败，不把错误图优化成成功", () => {
  const overlapping = [{ path: [], binding: { source: "node", nodeId: "read", path: [] } }, fields[0]!]
  assert.equal(materializeOutputAssembly({ fields: overlapping, schema }, b => b, { sourceSchema }).nodes.length, 2)
  assert.throws(() => executeDataOperation("transform", { source: { value0: { title: "x", count: 1 }, value1: "x" },
    paths: { value0: [], value1: ["title"] }, mode: "assemble" }), /overlapping_paths/)
})
