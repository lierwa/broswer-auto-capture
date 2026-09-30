import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import type { StableChainNodeV2, ValueBinding, ValueSchema } from "@browser-capture/contracts"
import { applyReadRequirements } from "../src/upstream-browser/hybrid-read-requirements.js"
import { materializeOutputAssembly } from "../src/upstream-browser/hybrid-output.js"
import { projectRoot } from "./helpers.js"

function fixture() {
  const schema = { type: "array", minItems: 0, maxItems: 10, items: { type: "object",
    properties: { href: { type: "string" }, text: { type: "string" } }, required: ["text"], additionalProperties: false } }
  const specification = { container: "a[rel=next]", maxItems: 10, maxInputBytes: 128000, fields: {
    href: { selector: ":scope", attribute: "href", optionalAttribute: true, resolveUrl: true, valueType: "string" },
    text: { selector: ":scope", attribute: null, valueType: "string" } }, outputSchema: schema }
  return { nodes: [{ id: "click", kind: "capability", capability: { name: "browser.workflow-step" },
    config: { postconditions: [{ kind: "read_fields", transition: true, consumerRef: "read", read: specification,
      scope: { url: "https://example.test/list" }, settle: { maxMs: 1000, maxAttempts: 10, intervalMs: 10 } }] } },
  { id: "read", kind: "capability", capability: { name: "browser.read-fields" }, input: {},
    config: { specification }, outputContract: { schema } },
  { id: "navigate", kind: "capability", capability: { name: "browser.workflow-step" },
    input: { url: { source: "node", nodeId: "read", path: [0, "href"] } } }] as unknown as StableChainNodeV2[],
  edges: [{ from: "click", to: "read", port: "success" }, { from: "read", to: "navigate", port: "success" }] }
}

test("已绑定第一项 href：原生读取和现有等待都拒绝空列表/缺字段，不改变宽来源合同", () => {
  const value = fixture(), original = structuredClone(value)
  applyReadRequirements(value.nodes, value.edges)
  const read = value.nodes[1]!, producer = value.nodes[0]!
  assert.deepEqual(read.outputContract, original.nodes[1]!.outputContract)
  assert.ok(read.kind === "capability" && read.config && typeof read.config === "object" && !Array.isArray(read.config))
  assert.deepEqual(read.config.requiredPaths, [[0, "href"]])
  const result = spawnSync("work/upstream-browser-hybrid/.venv/bin/python",
    ["apps/api/tests/fixtures/read_requirements_probe.py"], { cwd: projectRoot,
      input: JSON.stringify({ read: read.kind === "capability" ? read.config : null,
        producer: producer.kind === "capability" ? producer.config : null }), encoding: "utf8",
      env: { ...process.env, PYTHONPATH: "vendor/workflow-use/workflows", ANONYMIZED_TELEMETRY: "false" } })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /ready_only_with_required_path/)
})

test("整体列表和显式分支仍允许空结果，不跨控制流猜测业务最小数量", () => {
  for (const mode of ["whole", "branch"] as const) {
    const value = fixture()
    if (mode === "whole") (value.nodes[2] as any).input.url.path = []
    else value.nodes[2] = { ...value.nodes[2], kind: "condition" } as unknown as StableChainNodeV2
    const before = structuredClone(value)
    applyReadRequirements(value.nodes, value.edges)
    assert.deepEqual(value, before)
  }
})

// WHY：输出节点精简不能删除浏览器读取活性约束；源键与输出改名后的路径是不同事实。
test("同源输出省去merge后，assemble别名和来源前缀保留相同的叶字段就绪约束", () => {
  const schema: ValueSchema = { type: "object", properties: { label: { type: "string" }, amount: { type: "number" } },
    required: ["label", "amount"], additionalProperties: false }
  for (const prefix of [[], ["record"]] as string[][]) {
    const fields = ["label", "amount"].map(key => ({ path: [key === "label" ? "name" : "count"],
      binding: { source: "node" as const, nodeId: "read", path: [...prefix, key] } }))
    const target: ValueSchema = { type: "object", properties: { name: { type: "string" }, count: { type: "number" } },
      required: ["name", "count"], additionalProperties: false }
    const raw = { fields, schema: target }
    const old = materializeOutputAssembly(raw, binding => binding)
    const next = materializeOutputAssembly(raw, binding => binding, { sourceSchema: () => schema })
    assert.equal(old.nodes.length, 2); assert.equal(next.nodes.length, 1)
    const consumer = next.nodes[0]!
    if (consumer.kind !== "capability") throw new Error("fixture_capability_required")
    consumer.input = { object: consumer.input.source!, routes: consumer.input.paths!, strategy: consumer.input.mode! }
    consumer.config = { operation: "transform", arguments: { source: "object", paths: "routes", mode: "strategy" } }
    const results = [old, next].map(output => {
      const value = fixture()
      value.nodes = [...value.nodes.slice(0, 2), ...output.nodes] as StableChainNodeV2[]
      value.edges = [{ from: "click", to: "read", port: "success" }, { from: "read", to: output.entry, port: "success" }]
      applyReadRequirements(value.nodes, value.edges)
      return value.nodes.slice(0, 2)
    })
    assert.deepEqual(results[1], results[0])
    assert.deepEqual((results[1]![1] as any).config.requiredPaths, fields.map(field => field.binding.path))
  }
})

test("直接返回嵌套值的终点保留原来源路径，完整根值和动态assemble不猜字段", () => {
  const binding: ValueBinding = { source: "node", nodeId: "read", path: ["record"] }
  const raw = { fields: [{ path: [], binding }], schema: { type: "string" } }
  const output = materializeOutputAssembly(raw, b => b, { sourceSchema: () => ({ type: "string" }) })
  assert.equal(output.nodes.length, 0)
  for (const path of [["record"], []]) {
    const value = fixture()
    value.nodes[2] = { id: "completed", kind: "terminal", result: { output: {
      kind: "value", value: { ...binding, path } } } } as StableChainNodeV2
    value.edges[1]!.to = "completed"
    applyReadRequirements(value.nodes, value.edges)
    assert.deepEqual((value.nodes[1] as any).config.requiredPaths, path.length ? [path] : undefined)
  }
  for (const dynamic of ["paths", "mode"]) {
    const value = fixture()
    value.nodes[2] = { id: "assemble", kind: "capability", capability: { name: "data.transform", version: 1 },
      input: { source: { source: "node", nodeId: "read", path: [] }, mode: { source: "constant", value: "assemble" },
        paths: { source: "constant", value: { label: ["name"] } }, [dynamic]: { source: "input", path: [dynamic] } },
      config: { operation: "transform", arguments: { source: "source", paths: "paths", mode: "mode" } } } as unknown as StableChainNodeV2
    value.edges[1]!.to = "assemble"
    const before = structuredClone(value)
    applyReadRequirements(value.nodes, value.edges)
    assert.deepEqual(value, before)
  }
})
