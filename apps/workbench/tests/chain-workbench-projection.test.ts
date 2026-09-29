import assert from "node:assert/strict"
import test from "node:test"
import type { ChainPresentation, TaskChain, TaskExecutionEventBatch } from "@browser-capture/contracts"
import { edgePortLabel, eventsForStep, focusChainEdges, nodeRunTone, overviewChainEdges,
  stageRunTone } from "../src/chainWorkbenchProjection.js"
import { actionPresentation, terminalPresentation } from "../src/chainNodePresentation.js"
import { buildCanvasGraph } from "../src/ChainCanvasGraph.js"

const stageOne = { id: "stage-one", title: "阶段一", summary: "第一个阶段", nodeIds: ["first"],
  entryNodeId: "first", exits: [{ id: "next", label: "继续", sourceNodeId: "first", sourcePort: "success" },
    { id: "fallback", label: "未完成", sourceNodeId: "first", sourcePort: "failed" }] }
const stageTwo = { id: "stage-two", title: "阶段二", summary: "第二个阶段", nodeIds: ["second"],
  entryNodeId: "second", exits: [{ id: "done", label: "完成", sourceNodeId: "second", sourcePort: "success" }] }
const chain = { entry: "first", nodes: [{ id: "first" }, { id: "second" }, { id: "terminal" }],
  edges: [{ from: "first", outcome: "success", to: "second" },
    { from: "first", outcome: "failed", to: "second" },
    { from: "second", outcome: "success", to: "terminal" }] } as unknown as TaskChain
const presentation = { stages: [stageOne, stageTwo], overviewLayout: [], focusLayouts: [] } as unknown as ChainPresentation
const executionId = "00000000-0000-4000-8000-000000000021"
const batch = { executionId, executionSequence: 2, status: "running", after: 0, next: 4, events: [
  executionEvent(1, "first", "started", null), executionEvent(2, "first", "finished", "success"),
  executionEvent(3, "second", "started", null),
] } as TaskExecutionEventBatch

test("完成终态与阶段出口只按本次事件上色，运行中不能提前显示完成", () => {
  const visibleChain = { ...chain, nodes: [{ id: "first", kind: "function", label: "第一动作" },
    { id: "second", kind: "function", label: "第二动作" },
    { id: "terminal", kind: "terminal", label: "完成", status: "completed", reason: "完成" }] } as TaskChain
  const graph = (events: TaskExecutionEventBatch, focus = false) => buildCanvasGraph(visibleChain, presentation,
    focus ? stageOne : null, events, () => {}, () => {})
  assert.equal(graph(batch).nodes.find((node) => node.id === "__end:terminal")?.data.tone, "idle")
  const ended = { ...batch, status: "completed", events: [...batch.events,
    executionEvent(4, "second", "finished", "success"), executionEvent(5, "terminal", "finished", "success")] } as TaskExecutionEventBatch
  assert.equal(graph(ended).nodes.find((node) => node.id === "__end:terminal")?.data.tone, "success")
  assert.deepEqual(graph(batch, true).edges.filter((edge) => edge.source === "first")
    .map((edge) => [edge.target, edge.className]), [
      ["second", "chain-edge chain-edge-running"], ["second", "chain-edge chain-edge-idle"],
    ])
})

test("阶段总览和聚焦子图只投影绑定 execution 的真实节点与连线状态", () => {
  assert.equal(nodeRunTone("first", batch), "success")
  assert.equal(nodeRunTone("second", batch), "running")
  assert.equal(stageRunTone(stageOne, batch), "success")
  assert.equal(stageRunTone(stageTwo, batch), "running")
  assert.deepEqual(overviewChainEdges(chain, presentation, batch).map((edge) => [edge.source, edge.target, edge.tone]), [
    ["__start", "stage-one", "success"], ["stage-one", "stage-two", "running"],
    ["stage-one", "stage-two", "idle"], ["stage-two", "__end:terminal", "idle"],
  ])
  assert.deepEqual(focusChainEdges(chain, stageOne, batch).map((edge) => [edge.source, edge.target, edge.tone]), [
    ["__stage_entry", "first", "success"], ["first", "__stage_exit:next", "running"],
    ["first", "__stage_exit:fallback", "idle"],
  ])
  assert.deepEqual(overviewChainEdges(chain, presentation, batch).slice(1, 3).map((edge) => edge.port), ["success", "failed"])
})

test("真实离开阶段后未走分支显示跳过，残留 started 不伪造完成", () => {
  const ended = { ...batch, status: "completed" as const }
  assert.equal(nodeRunTone("first", ended), "success")
  assert.equal(nodeRunTone("second", ended), "ended")
  const branchedStage = { ...stageOne, nodeIds: ["first", "unused-branch"] }
  assert.equal(stageRunTone(branchedStage, batch), "success")
  assert.equal(nodeRunTone("unused-branch", batch, branchedStage), "skipped")
  assert.equal(stageRunTone(stageTwo, ended), "ended")
  assert.equal(overviewChainEdges(chain, presentation, ended).some((edge) => edge.tone === "running"), false)
  assert.equal(stageRunTone(stageTwo, { ...batch, status: "paused" }), "waiting")
})

test("阶段终态按真实去向区分，异常与取消不会投影为成功绿色线", () => {
  const terminalChain = { ...chain, edges: [{ from: "first", outcome: "success", to: "completed" },
    { from: "first", outcome: "failed", to: "failed" }] } as TaskChain
  const failure = { ...batch, status: "failed", events: [executionEvent(1, "first", "finished", "failed")] } as TaskExecutionEventBatch
  const edges = overviewChainEdges(terminalChain, presentation, failure).slice(1)
  assert.deepEqual(edges.map((edge) => [edge.target, edge.tone]), [["__end:completed", "idle"], ["__end:failed", "failure"]])
  assert.equal(stageRunTone(stageOne, failure), "failure")
  assert.equal(stageRunTone(stageTwo, failure), "skipped")
  assert.equal(stageRunTone(stageOne, { ...batch, events: [executionEvent(1, "first", "finished", "human_required")] } as TaskExecutionEventBatch), "waiting")
})

test("节点展示使用真实能力类型与业务名称，普通成功线不暴露协议值", () => {
  const nodes = [
    { id: "read", label: "读取剧集列表", kind: "capability", capability: { name: "browser.read-fields", version: 2 }, config: {} },
    { id: "wait", label: "wait", kind: "capability", capability: { name: "browser.workflow-step", version: 2 }, config: { actionName: "wait" } },
    { id: "click", label: "点击最新正片", kind: "capability", capability: { name: "browser.workflow-step", version: 2 }, config: { actionName: "click" } },
    { id: "function", label: "选出最新正片", kind: "function" },
  ] as TaskChain["nodes"]
  assert.deepEqual(nodes.map((node) => actionPresentation(node).type), ["读取", "等待", "浏览器动作", "Function"])
  assert.deepEqual(nodes.map((node) => actionPresentation(node).title), ["读取剧集列表", "等待条件满足", "点击最新正片", "选出最新正片"])
  assert.equal(edgePortLabel("success"), "")
  assert.equal(edgePortLabel("failed"), "失败")
  assert.equal(terminalPresentation({ id: "failed", label: "failed", kind: "terminal", status: "failed" } as TaskChain["nodes"][number]).status, "failure")
})

test("同名节点只接收选定 execution、步骤和最后一次 run 的事件", () => {
  const runId = batch.events[0]!.runId
  const mixed = { ...batch, events: [
    { ...executionEvent(4, "first", "started", null), runId: "earlier-run" }, ...batch.events,
    { ...executionEvent(5, "first", "started", null), stepId: "other-step", runId: "other-run" },
    { ...executionEvent(6, "first", "started", null), executionId: "another-execution" },
  ] } as TaskExecutionEventBatch
  const projected = eventsForStep("perform", executionId, mixed)
  assert.deepEqual(projected?.events.filter((item) => item.runId === runId), batch.events)
  assert.equal(projected?.events.some((item) => item.stepId === "other-step"), false)
  assert.equal(eventsForStep("perform", executionId, { ...mixed, executionId: "another-execution" }), null)
})

function executionEvent(sequence: number, nodeId: string, status: "started" | "finished", outcome: string | null) {
  return { executionId, sequence, stepId: "perform", runId: "00000000-0000-4000-8000-000000000022",
    runSequence: 1, event: { sequence, at: "2026-09-21T00:00:00.000Z",
      invocationId: "00000000-0000-4000-8000-000000000023", nodeId, status, outcome,
      idempotencyKey: `node-${sequence}`, stableKey: null } }
}
