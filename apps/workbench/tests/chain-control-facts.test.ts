import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stableChainNodeV2Schema, type ChainNode, type ChainStage, type TaskChain, type TaskExecutionEventBatch } from "@browser-capture/contracts"
import { branchRows, currentNodeEvent, isNodeUnselected, loopContext } from "../src/chainControlProjection.js"
import { nodeDurationLabel, stageDurationLabel } from "../src/chainExecutionFacts.js"
import { eventsForStep, nodeRunTone, overviewChainEdges, stageRunTone } from "../src/chainWorkbenchProjection.js"
import { ChainInspector } from "../src/ChainInspector.js"
import { ChainNodeExecution } from "../src/ChainNodeExecution.js"
import { executionSegment } from "../src/chainExecutionFacts.js"
import { buildCanvasGraph, buildPreparationGraph } from "../src/ChainCanvasGraph.js"

const predicate = { operator: "exists", value: { source: "input", path: ["next"] } } as const
const branch = { id: "choice", kind: "branch", label: "是否继续", predicate } as unknown as ChainNode
const action = (id: string) => ({ id, kind: "function", label: id } as ChainNode)
const edge = (from: string, port: string, to: string) => ({ from, port, to })
const chain = { nodes: [branch, ...["A", "B", "C", "merge", "tail", "external"].map(action)],
  edges: [edge("choice", "true", "A"), edge("A", "success", "B"), edge("B", "success", "merge"),
    edge("choice", "false", "C"), edge("C", "success", "merge"), edge("merge", "success", "tail")] } as TaskChain
const stage = { id: "stage", title: "阶段", summary: "阶段", entryNodeId: "choice", nodeIds: ["choice", "A", "B", "C", "merge", "tail"],
  exits: [{ id: "done", label: "完成", sourceNodeId: "tail", sourcePort: "success" }] } satisfies ChainStage
const id = "00000000-0000-4000-8000-000000000001"
function event(sequence: number, nodeId: string, status: "planned" | "started" | "finished", outcome: string | null,
  at = sequence, invocationId = id, stableKey: string | null = null) {
  return { executionId: id, sequence, stepId: "step", runId: id, runSequence: 1, event: {
    sequence, at: new Date(at).toISOString(), invocationId, nodeId, status, outcome,
    idempotencyKey: "repeatable-key", stableKey } }
}
function batch(events: ReturnType<typeof event>[], status: TaskExecutionEventBatch["status"] = "running") {
  return { executionId: id, executionSequence: events.length, status, after: 0, next: events.length, events }
}

test("if else 常显；最新 planned、started 与求值失败撤掉旧选择", () => {
  const selected = event(1, "choice", "finished", "false")
  assert.deepEqual(branchRows(branch, chain, batch([selected])).map((row) => [row.port, row.selection]),
    [["true", "unselected"], ["false", "selected"]])
  for (const current of [event(2, "choice", "planned", null), event(2, "choice", "started", null),
    event(2, "choice", "finished", "failed")]) {
    assert.equal(branchRows(branch, chain, batch([selected, current])).every((row) => row.selection === "pending"), true)
  }
  assert.equal(branchRows(branch, chain, batch([selected, event(2, "C", "finished", "failed")]))[1]!.selection, "selected")
})

for (const port of ["blocked", "limit", "body", "timeout", "human_required"]) {
  test(`合法case ID ${port} 与标准端口同名时，以真实case定义展示正常选择`, () => {
    const choice = stableChainNodeV2Schema.parse({ id: "choice", kind: "branch", label: "选择路径",
      cases: [{ id: port, label: "选择已声明路径", predicate }],
      outputContract: { id: "choice-result", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }, writes: [] })
    const graph = { nodes: [choice, action("A"), action("B")], entry: choice.id,
      edges: [edge(choice.id, port, "A"), edge(choice.id, "default", "B")] } as TaskChain
    const source = { ...stage, id: "source", nodeIds: [choice.id], entryNodeId: choice.id,
      exits: [{ id: "selected", label: "选择已声明路径", sourceNodeId: choice.id, sourcePort: port }] }
    const target = { ...stage, id: "target", nodeIds: ["A", "B"], entryNodeId: "A", exits: [] }
    const presentation = { stages: [source, target], overviewLayout: [] }
    const selected = batch([event(1, choice.id, "finished", port), event(2, "A", "finished", "success")], "completed")
    assert.equal(branchRows(choice, graph, selected)[0]!.selection, "selected")
    assert.equal(nodeRunTone(choice.id, selected, source, graph), "success")
    assert.equal(stageRunTone(source, selected, graph), "success")
    assert.equal(overviewChainEdges(graph, presentation, selected).find(item => item.port === port)?.tone, "success")
    assert.equal(buildCanvasGraph(graph, presentation, selected, () => {}).edges.find(item => item.source === source.id)?.label,
      "选择已声明路径")
    assert.equal(buildPreparationGraph({ nodes: graph.nodes, edges: graph.edges, presentation, phase: "prefix" } as never,
      () => {}).edges.find(item => item.source === source.id)?.label, "选择已声明路径")
    const waitingBody = { ...loopChain, nodes: [loop, choice, action("A"), action("tail")], edges: [
      edge("loop", "body", choice.id), edge(choice.id, port, "A"), edge(choice.id, "default", "tail"),
      edge("A", "success", "tail"), edge("tail", "success", "loop")] } as TaskChain
    assert.equal(nodeRunTone("loop", batch([event(1, "loop", "finished", "body"),
      event(2, choice.id, "finished", port)]), loopStage, waitingBody), "running")
  })
}

test("同阶段同目标的业务case body和loop body保留各自真实label及稳定唯一边身份", () => {
  const choice = { id: "choice", label: "选择", kind: "branch", cases: [{ id: "body", label: "匹配到已声明路径", predicate }] } as ChainNode
  const graph = { nodes: [choice, loop, action("A"), action("B")], entry: choice.id, edges: [
    edge(choice.id, "body", "A"), edge(choice.id, "default", "B"), edge("loop", "body", "A"),
    edge("loop", "done", "B"), edge("A", "success", "loop")] } as TaskChain
  const presentation = { stages: [{ ...stage, id: "source", nodeIds: [choice.id, "loop"], exits: [] },
    { ...stage, id: "target", nodeIds: ["A", "B"], entryNodeId: "A", exits: [] }], overviewLayout: [] }
  const active = batch([event(1, choice.id, "finished", "body"), event(2, "loop", "finished", "body"),
    event(3, "A", "started", null)])
  const before = buildCanvasGraph(graph, presentation, null, () => {}).edges.filter(item => item.source === "source")
  const after = buildCanvasGraph(graph, presentation, active, () => {}).edges.filter(item => item.source === "source")
  assert.equal(after.filter(item => item.label === "匹配到已声明路径").length, 1)
  assert.equal(after.filter(item => item.label === "进入循环体").length, 1)
  assert.equal(new Set(after.map(item => item.id)).size, after.length)
  assert.deepEqual(after.map(item => item.id), before.map(item => item.id), "运行上色不改变已有边身份")
  const equalLabels = { ...graph, nodes: graph.nodes.map(node => node.id === choice.id
    ? { ...choice, cases: [{ id: "body", label: "进入循环体", predicate }] } : node) } as TaskChain
  assert.equal(buildCanvasGraph(equalLabels, presentation, active, () => {}).edges.filter(item =>
    item.source === "source" && item.label === "进入循环体").length, 2, "文案相同也不混合普通case与loop语义")
})

test("只灰可靠独占动作，共享汇合与外来入口之后整段保持真实状态", () => {
  const selected = batch([event(1, "choice", "finished", "false")])
  assert.equal(isNodeUnselected("A", stage, chain, selected), true)
  assert.equal(isNodeUnselected("B", stage, chain, selected), true)
  assert.equal(isNodeUnselected("merge", stage, chain, selected), false)
  assert.equal(isNodeUnselected("tail", stage, chain, selected), false)
  const external = { ...chain, edges: [...chain.edges, edge("external", "success", "A")] } as TaskChain
  assert.equal(isNodeUnselected("A", stage, external, selected), false)
  assert.equal(isNodeUnselected("B", stage, external, selected), false)
  const actual = batch([...selected.events, event(2, "A", "started", null)])
  assert.equal(nodeRunTone("A", actual, stage, chain), "running")
  assert.equal(nodeRunTone("never-ran", { ...selected, status: "completed" }), "idle")
})

const loop = { id: "loop", kind: "loop", label: "逐页处理", cursorVariable: "cursor", maxIterations: 99,
  iteration: { mode: "while", condition: predicate }, body: { entry: "choice", exits: ["tail"] } } as unknown as ChainNode
const loopChain = { ...chain, nodes: [loop, ...chain.nodes], edges: [...chain.edges, edge("loop", "body", "choice"),
  edge("tail", "success", "loop")] } as TaskChain
const loopStage = { ...stage, nodeIds: ["loop", ...stage.nodeIds], entryNodeId: "loop",
  exits: [{ id: "done", label: "完成", sourceNodeId: "loop", sourcePort: "done" }] }

test("循环门控 body 不等整体成功；下一轮撤旧值，等待失败限额分别保留", () => {
  const first = [event(1, "loop", "finished", "body"), event(2, "choice", "finished", "true"),
    event(3, "A", "finished", "success"), event(4, "tail", "finished", "success")]
  assert.equal(nodeRunTone("loop", batch(first), loopStage, loopChain), "running")
  const next = batch([...first, event(5, "loop", "finished", "body"), event(6, "choice", "started", null)])
  assert.equal(branchRows(branch, loopChain, next).every((row) => row.selection === "pending"), true)
  assert.equal(currentNodeEvent("A", loopChain, next), undefined)
  assert.equal(stageRunTone(loopStage, next, loopChain), "running")
  assert.equal(nodeRunTone("loop", batch([...first, event(5, "A", "finished", "human_required")]), loopStage, loopChain), "waiting")
  assert.equal(nodeRunTone("loop", batch([...first, event(5, "A", "finished", "failed")]), loopStage, loopChain), "failure")
  const limited = batch([...first, event(5, "loop", "finished", "limit")], "partial")
  assert.equal(nodeRunTone("loop", limited, loopStage, loopChain), "ended")
  assert.equal(stageRunTone(loopStage, limited, loopChain), "ended")
  assert.equal(nodeRunTone("loop", batch([...first, event(5, "loop", "finished", "done")]), loopStage, loopChain), "success")
  const text = loopContext(loop as Extract<ChainNode, { kind: "loop" }>, loopChain, next).join("；")
  assert.doesNotMatch(text, /\d+\s*\/\s*\d+|百分比|总计|剩余/)
  assert.match(text, /未记录/)
})

test("配对耗时保留合法0、重复stableKey累计、缺失段与不同invocation", () => {
  const events = [event(1, "A", "started", null, 0, id, "same"), event(2, "A", "finished", "success", 0, id, "same"),
    event(3, "A", "started", null, 1000, id, "same"), event(4, "A", "finished", "success", 2500, id, "same")]
  assert.equal(nodeDurationLabel("A", batch(events)), "累计 1.5 秒（2 次）")
  assert.equal(nodeDurationLabel("A", batch(events.slice(0, 2))), "0 毫秒")
  assert.equal(nodeDurationLabel("A", batch([...events, event(5, "A", "started", null)])), "耗时记录不完整")
  assert.equal(nodeDurationLabel("A", batch([event(1, "A", "finished", "success")])), "耗时记录不完整")
  assert.equal(nodeDurationLabel("A", batch([event(1, "A", "started", null), event(2, "A", "finished", "success", 3, "other")])), "耗时记录不完整")
  assert.equal(stageDurationLabel(["A"], batch(events)), "跨度 2.5 秒")
  assert.equal(stageDurationLabel(["A", "B"], batch([event(1, "A", "started", null),
    event(2, "B", "started", null), event(3, "B", "finished", "success")])), "耗时记录不完整")
})

test("Function 完整源码独立折叠，同源具名参数不去重，返回要求独立于实值", () => {
  const node = { id: "function", label: "计算", kind: "function", language: "javascript", source: "return left + right;",
    inputs: { left: { source: "input", path: ["value"] }, right: { source: "input", path: ["value"] } },
    outputContract: { id: "sum", version: 1, dialect: "bat-value-schema/v1", schema: { type: "number", minimum: 0 } },
    writes: [], timeoutMs: 1000 } as ChainNode
  const html = renderToStaticMarkup(createElement(ChainInspector, { chain: { nodes: [node], edges: [] }, node,
    stage: null, batch: null, onClose() {} }))
  assert.match(html, /<strong>left<\/strong>/)
  assert.match(html, /<strong>right<\/strong>/)
  assert.match(html, /函数代码 · JavaScript/)
  assert.match(html, /return left \+ right;/)
  assert.match(html, /返回要求 · number/)
  assert.match(html, /本次尚无执行记录/)
  assert.doesNotMatch(html, /<dt>耗时<\/dt>/)
})

test("逐段真实I/O保留JSON空值，不用上一轮值补当前未记录", () => {
  for (const value of [null, false, 0, ""]) {
    const started = { ...event(1, "A", "started", null), event: { ...event(1, "A", "started", null).event,
      execution: { input: { status: "recorded" as const, value } } } }
    const finished = { ...event(2, "A", "finished", "success"), event: { ...event(2, "A", "finished", "success").event,
      execution: { output: { status: "recorded" as const, value } } } }
    const currentBatch = batch([started, finished])
    const html = renderToStaticMarkup(createElement(ChainNodeExecution, { event: finished, batch: currentBatch, nodes: chain.nodes }))
    assert.match(html, /chain-readable-value/)
    assert.doesNotMatch(html, /未记录|尚无完成/)
    const next = event(3, "A", "started", null)
    assert.equal(executionSegment(next, batch([started, finished, next])).started?.sequence, 3)
    const missing = renderToStaticMarkup(createElement(ChainNodeExecution, { event: next,
      batch: batch([started, finished, next]), nodes: chain.nodes }))
    assert.match(missing, /本次输入内容未记录/)
    assert.match(missing, /本次尚无完成输出/)
  }
})

test("未知while不消费任何分母，可靠each总数与约定停止消费真实事实", () => {
  const fact = { index: 3, activeStableKey: "3", completedStableKeysCount: 3, total: 8 }
  const stored = { ...event(1, "loop", "finished", "body"), event: { ...event(1, "loop", "finished", "body").event,
    execution: { loop: fact } } }
  const whileText = loopContext(loop as Extract<ChainNode, { kind: "loop" }>, loopChain, batch([stored])).join("；")
  assert.match(whileText, /已完成 3 轮；当前第 4 轮/)
  assert.doesNotMatch(whileText, /总计|\/|8|项/)
  const each = { ...loop, iteration: { mode: "each", collection: { source: "input", path: [] },
    itemVariable: "item", stableKeyPath: ["id"] } } as Extract<ChainNode, { kind: "loop" }>
  const eachText = loopContext(each, loopChain, batch([stored])).join("；")
  assert.match(eachText, /已处理 3 项 \/ 总计 8 项/)
  assert.match(eachText, /当前第 4 项/)
  const stopped = { ...stored, event: { ...stored.event, outcome: "done", execution: {
    loop: { ...fact, activeStableKey: null, exitReason: "stop_when" as const } } } }
  assert.match(loopContext(each, loopChain, batch([stopped])).join("；"), /已达到约定停止条件/)
})

test("多路case保持定义顺序，default为正常选择；显式run选择不得回退", () => {
  const multi = { id: "choice", kind: "branch", label: "选择路径", cases: [
    { id: "z-last-name", label: "先规则", predicate }, { id: "a-first-name", label: "后规则", predicate },
  ] } as unknown as ChainNode
  const graph = { nodes: [multi, action("A"), action("B"), action("C")], edges: [
    edge("choice", "z-last-name", "A"), edge("choice", "a-first-name", "B"), edge("choice", "default", "C"),
  ] } as TaskChain
  const rows = branchRows(multi, graph, batch([event(1, "choice", "finished", "default")]))
  assert.deepEqual(rows.map((row) => row.port), ["z-last-name", "a-first-name", "default"])
  assert.equal(rows[2]!.selection, "selected")
  assert.equal(nodeRunTone("choice", batch([event(1, "choice", "finished", "default")]), undefined, graph), "success")
  assert.deepEqual(eventsForStep("step", id, batch([event(1, "A", "finished", "success")]), "absent-run")?.events, [])
})

test("嵌套循环各自按真实body范围隔离当前轮，不让内层旧成功覆盖新门控", () => {
  const inner = { ...loop, id: "inner", body: { entry: "A", exits: ["B"] } } as ChainNode
  const outer = { ...loop, id: "outer", body: { entry: "inner", exits: ["tail"] } } as ChainNode
  const graph = { nodes: [outer, inner, action("A"), action("B"), action("tail")], edges: [
    edge("outer", "body", "inner"), edge("inner", "body", "A"), edge("A", "success", "B"),
    edge("B", "success", "inner"), edge("inner", "done", "tail"), edge("tail", "success", "outer"),
  ] } as TaskChain
  const events = [event(1, "outer", "finished", "body"), event(2, "inner", "finished", "body"),
    event(3, "A", "finished", "success"), event(4, "B", "finished", "success"), event(5, "inner", "started", null)]
  assert.equal(currentNodeEvent("A", graph, batch(events)), undefined)
  assert.equal(nodeRunTone("inner", batch(events), undefined, graph), "running")
  assert.equal(nodeRunTone("outer", batch(events), undefined, graph), "running")
})

test("terminal自身success回执不把声明failed或partial终态染绿", () => {
  for (const [status, tone] of [["failed", "failure"], ["blocked", "failure"], ["partial", "ended"],
    ["cancelled", "ended"], ["completed", "success"]] as const) {
    const terminal = { id: "terminal", kind: "terminal", label: "终点", status, reason: "结束" } as ChainNode
    const graph = { nodes: [terminal], edges: [] } as TaskChain
    assert.equal(nodeRunTone("terminal", batch([event(1, "terminal", "finished", "success")]), undefined, graph), tone)
  }
})

test("循环body在暂停或失败后不继续动画；失败终点不会有绿色到达边", () => {
  const loopPresentation = { stages: [{ ...loopStage, id: "loop-stage", nodeIds: ["loop"] }, stage] }
  const events = [event(1, "loop", "finished", "body"), event(2, "choice", "finished", "true")]
  const paused = overviewChainEdges(loopChain, loopPresentation, batch(events, "paused"))
  assert.equal(paused.find((item) => item.source === "loop-stage" && item.port === "body")?.tone, "waiting")
  assert.equal(paused.some((item) => item.tone === "running"), false)
  const terminal = { id: "failed", kind: "terminal", label: "失败", status: "failed", reason: "失败" } as ChainNode
  const graph = { nodes: [action("A"), terminal], entry: "A", edges: [edge("A", "success", "failed")] } as TaskChain
  const failed = overviewChainEdges(graph, { stages: [{ ...stage, nodeIds: ["A"], entryNodeId: "A" }] },
    batch([event(1, "A", "finished", "success"), event(2, "failed", "finished", "success")], "failed"))
  assert.equal(failed.find((item) => item.target === "__end:failed")?.tone, "failure")
})
