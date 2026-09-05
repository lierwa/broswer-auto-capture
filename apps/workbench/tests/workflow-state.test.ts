import assert from "node:assert/strict"
import test from "node:test"
import { planSteps, stepGraph } from "../src/chainData.ts"

test("三个计划步骤各自有可检查链路，所有边都有端点与详情", () => {
  for (const step of planSteps) {
    const graph = stepGraph(step.id)
    const ids = new Set(graph.nodes.map((node) => node.id))
    assert.equal(graph.nodes.length, graph.details.length)
    assert.equal(ids.size, graph.nodes.length)
    assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)))
    assert.ok(graph.details.every((item) => item.input && item.output && item.rule && item.finish))
  }
})

test("枚举和评价链路都有条件出口与回到提取的翻页循环", () => {
  for (const step of ["catalog", "reviews"] as const) {
    const graph = stepGraph(step)
    assert.equal(graph.details[3]!.kind, "条件分支")
    assert.ok(graph.edges.some((edge) => edge.source === "3" && edge.label === "结束"))
    assert.ok(graph.edges.some((edge) => edge.source === "4" && edge.target === "1"))
  }
})
