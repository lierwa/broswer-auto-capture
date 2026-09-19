import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import type { TaskChain } from "@browser-capture/contracts"
import { chainOperation, digestNodeText, projectChainGraph } from "../src/taskChainProjection.js"

const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
const source = "function main(inputs) { return inputs.value; }"
const chain = { nodeModel: "stable/v2", nodes: [
  { id: "function", label: "function", kind: "function", language: "javascript", source, inputs: {}, timeoutMs: 200,
    outputContract: unit, writes: [] },
  { id: "branch", label: "branch", kind: "branch", cases: [{ id: "selected", label: "selected", predicate: {
    operator: "equals", left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    outputContract: unit, writes: [] },
  { id: "done", label: "done", kind: "terminal", status: "completed", reason: "done",
    outputContract: unit, writes: [], evidence: [{ source: "constant", value: true }] },
], edges: [{ from: "function", port: "success", to: "branch" },
  { from: "branch", port: "selected", to: "done" }] } as unknown as TaskChain

test("Workbench stable/v2 投影保留动态 port 与 Function 卡片", () => {
  const graph = projectChainGraph(chain, [])
  assert.deepEqual(graph.edges.map((edge) => edge.label), ["success", "selected"])
  assert.match(String(graph.nodes[0]?.data.label), /确定性函数 · javascript · 200ms/)
  assert.equal(chainOperation(chain.nodes[1]!), "branch")
})

test("Function/LLM 详情使用真实 SHA-256 digest", async () => {
  assert.equal(await digestNodeText(source), createHash("sha256").update(source).digest("hex"))
})
