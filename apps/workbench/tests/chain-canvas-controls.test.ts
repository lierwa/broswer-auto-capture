import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CanvasActionList } from "../src/ChainCanvasActionList.js"
import { buildCanvasGraph, selectCanvasNodes } from "../src/ChainCanvasGraph.js"
import { canvasStageList } from "../src/chainCanvasList.js"
import { buildPlanCanvasGraph } from "../src/PlanCanvasGraph.js"
import { controlChain, executeControl, runBatch } from "./fixtures/control-chain.js"

// WHY：保护真实节点身份、汇合与轮次事实；运行由 LangGraph 产生，不能用手写状态证明接通。
test("同一真实runtime跑两轮不同分支后到达输出及完成，当前轮不会借用上一轮勾", async () => {
  const { chain, presentation } = controlChain(), { run, snapshots } = await executeControl(chain)
  assert.equal(run.status, "completed", run.outcome?.reason)
  assert.equal(run.consumed.llmCalls, 0)
  const items = canvasStageList(presentation.stages[0]!, chain)
  // WHY：当前同一业务主节点包含整条链；循环后的汇总仍为同一 stage 的真实动作。
  assert.deepEqual(items.map(item => item.id), ["repeat", "output"])
  assert.deepEqual(items[0]!.body!.map(item => item.id), ["choice", "join"])
  assert.deepEqual(items[0]!.body![0]!.routes.map(route => [route.port, route.targetId, route.inline]),
    [["process", "handle", true], ["default", "join", false]])
  const graphFor = (record: typeof run) => buildCanvasGraph(chain, presentation, runBatch(record), () => {})
  const first = snapshots.find(record => record.events.at(-1)?.nodeId === "handle" && record.events.at(-1)?.status === "started")!
  const second = snapshots.find(record => record.events.filter(event => event.nodeId === "choice" && event.status === "finished").length === 2)!
  const stage = graphFor(second).nodes.find(node => node.type === "chain-stage")!
  if (stage.type !== "chain-stage") throw new Error("missing_stage")
  assert.equal(stage.data.actions.find(action => action.id === "handle")?.tone, "unselected")
  assert.equal(stage.data.actions.find(action => action.id === "choice")?.branches?.[1]?.selection, "selected")
  const html = renderToStaticMarkup(createElement(CanvasActionList, { ...stage.data, label: "动作" }))
  assert.equal((html.match(/data-node-id="handle"/g) ?? []).length, 1)
  assert.equal((html.match(/data-node-id="join"/g) ?? []).length, 1)
  assert.doesNotMatch(html.replace(/(?:aria-label|title)="[^"]*"/g, ""), /已完成|本次未进入|待判定|已判定|进行中|上限/)
  const running = graphFor(first).nodes.find(node => node.type === "chain-stage")!
  if (running.type !== "chain-stage") throw new Error("missing_stage")
  const runningHtml = renderToStaticMarkup(createElement(CanvasActionList, { ...running.data, label: "动作" }))
  assert.equal((runningHtml.match(/chain-status-icon" data-tone="running"/g) ?? []).length, 1)
  const completed = graphFor(run)
  assert.equal(completed.nodes.find(node => node.id === "__end:done")?.data.tone, "success")
  assert.equal(completed.nodes.find(node => node.id === "__end:failed")?.data.tone, "idle")
  assert.deepEqual(completed.nodes.map(node => node.position), graphFor(first).nodes.map(node => node.position))
  const selected = selectCanvasNodes(completed.nodes, "handle", null, null).find(node => node.type === "chain-stage")!
  if (selected.type !== "chain-stage") throw new Error("missing_stage")
  assert.equal(selected.data.actions.find(action => action.id === "handle")?.selected, true)
  const plan = { steps: [{ id: "perform", title: "处理输入列表", goal: "循环分支", dependsOn: [],
    invocation: { mode: "each", maxItems: 5 } }] } as Parameters<typeof buildPlanCanvasGraph>[0]
  const detail = { execution: { id: run.binding.authorizationId, status: "cleanup_required",
    cleanupResume: { status: "completed" }, steps: [{ stepId: "perform", status: "completed", runIds: [run.binding.runId] }] },
    calls: [{ stepId: "perform", run }] } as unknown as NonNullable<Parameters<typeof buildPlanCanvasGraph>[9]>
  const planGraph = buildPlanCanvasGraph(plan, [{ stepId: "perform", chain, presentation }], undefined,
    run.binding.authorizationId, runBatch(run), () => {}, () => {}, undefined, [], detail)
  const call = planGraph.nodes.find(node => node.type === "chain-stage")!
  if (call.type !== "chain-stage") throw new Error("missing_call")
  assert.deepEqual(call.data.items, items)
  assert.equal(call.data.repeated, true)
  assert.equal(call.data.results!.find(result => result.id === "done")!.tone, "success")
  assert.equal(planGraph.nodes.find(node => node.id === "__plan_end")!.data.tone, "success")
  assert.match(String(planGraph.nodes.find(node => node.id === "__plan_end")!.data.statusLabel), /资源待清理/)
})

test("外来入口、缺失body与不可信返回边不折出假的动作归属", () => {
  const { chain, presentation } = controlChain(), stage = presentation.stages[0]!
  const external = { ...chain, edges: [...chain.edges, { from: "external", port: "success", to: "handle" }] }
  const externalItems = canvasStageList(stage, external)
  assert.equal(externalItems[0]!.body![0]!.routes[0]?.inline, false)
  assert.equal(externalItems[0]!.body!.some(item => item.id === "handle"), true)
  const broken = { ...chain, edges: chain.edges.filter(edge => !(edge.from === "join" && edge.to === "repeat")) }
  assert.equal(canvasStageList(stage, broken).some(item => item.body), false)
})

test("动作真实失败映射到失败终点，不能把循环继续或结束染成成功", async () => {
  const { chain, presentation } = controlChain()
  const failed = { ...chain, nodes: chain.nodes.map(node => node.id === "handle" && node.kind === "function"
    ? { ...node, source: "function main() { throw new Error('controlled_failure'); }" } : node) }
  const { run } = await executeControl(failed)
  assert.equal(run.status, "failed")
  const graph = buildCanvasGraph(failed, presentation, runBatch(run), () => {})
  const stage = graph.nodes.find(node => node.type === "chain-stage")!
  assert.equal(stage.data.tone, "failure")
  assert.equal(graph.nodes.find(node => node.id === "__end:done")?.data.tone, "idle")
})

// WHY：旧布局的 Dagre 后备也必须按标题区接线；长名称省略后不能保留不可见行的布局空白。
test("起止节点在冻结布局与旧布局后备中对齐标题，超长动作仍保留全部节点及完整名称", () => {
  const { chain, presentation } = controlChain()
  for (const version of [presentation, { ...presentation, overviewLayout: [] }]) {
    const graph = buildCanvasGraph(chain, version, null, () => {})
    const stage = graph.nodes.find(node => node.type === "chain-stage")!
    const start = graph.nodes.find(node => node.id === "__start")!
    assert.equal(start.position.y + Number(start.height) / 2, stage.position.y + 27)
    assert.equal(start.position.x + Number(start.width) + 32, stage.position.x)
    const peers = new Map<string, number>()
    for (const end of graph.nodes.filter(node => node.type === "chain-terminal" && node.data.terminal === "end")) {
      const incoming = graph.edges.find(edge => edge.target === end.id)!
      const anchor = graph.nodes.find(node => node.id === incoming.source)!
      const index = peers.get(anchor.id) ?? 0
      assert.equal(end.position.x, anchor.position.x + Number(anchor.width) + 32)
      assert.equal(end.position.y + Number(end.height) / 2, anchor.position.y + 27 + index * (Number(end.height) + 12))
      peers.set(anchor.id, index + 1)
    }
  }
  const labelled = (repetitions: number) => ({ ...chain, nodes: chain.nodes.map(node => node.kind === "terminal"
    ? node : { ...node, label: "完整的动作说明与处理范围".repeat(repetitions) }) })
  const stageFor = (repetitions: number) => buildCanvasGraph(labelled(repetitions), presentation, null, () => {})
    .nodes.find(node => node.type === "chain-stage")!
  const long = stageFor(20), longer = stageFor(100)
  assert.equal(long.initialHeight, longer.initialHeight)
  if (longer.type !== "chain-stage") throw new Error("missing_stage")
  assert.deepEqual(longer.data.actions.map(action => action.id), presentation.stages[0]!.nodeIds)
  assert.ok(longer.data.actions.every(action => action.title === "完整的动作说明与处理范围".repeat(100)))
})
