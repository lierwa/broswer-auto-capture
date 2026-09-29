import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import type { StableChainNodeV2 } from "@browser-capture/contracts"
import { applyReadRequirements } from "../src/upstream-browser/hybrid-read-requirements.js"
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
