import assert from "node:assert/strict"
import test from "node:test"
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ReactFlowProvider, type NodeProps } from "@xyflow/react"
import type { ChainPresentation, TaskChain } from "@browser-capture/contracts"
import { buildCanvasGraph, selectCanvasNodes, shareCanvasGraph } from "../src/ChainCanvasGraph.js"
import { StageCanvasCard, type StageCanvasNode } from "../src/ChainCanvasNodes.js"
import { LiveChainCanvas } from "../src/LiveChainCanvas.js"
import type { LiveChainModel } from "../src/useLiveChain.js"
import { buildPlanCanvasGraph, planCallId } from "../src/PlanCanvasGraph.js"

const stage = { id: "read-stage", title: "读取页面", summary: "读取当前页的公开记录", nodeIds: ["read"],
  entryNodeId: "read", exits: [{ id: "done", label: "完成", sourceNodeId: "read", sourcePort: "success" }] }
const chain = { entry: "read", nodes: [
  { id: "read", kind: "capability", label: "读取列表", capability: { name: "browser.read-fields", version: 2 }, config: {} },
  { id: "done", kind: "terminal", label: "完成", status: "completed", reason: "完成" },
], edges: [{ from: "read", outcome: "success", to: "done" }] } as TaskChain
const presentation = { presentationDigest: "a".repeat(64), stages: [stage],
  overviewLayout: [{ stageId: stage.id, x: 21, y: 32 }],
  focusLayouts: [{ stageId: stage.id, nodes: [{ nodeId: "read", x: 43, y: 54 }] }],
} as ChainPresentation

test("完整计划同图展示三个业务阶段，动作身份按步骤隔离并指向原链路", () => {
  // WHY：保护多步骤组合的真正缺口；同名技术节点不能串色或切到错误链路。
  const definitions = ["打开设置", "启用通知", "确认状态"].map((title, index) => ({ id: `step-${index + 1}`,
    title, goal: title, dependsOn: index ? [`step-${index}`] : [],
    invocation: index === 1 ? { mode: "each", maxItems: 5 } : { mode: "once" } }))
  const plan = { steps: definitions } as Parameters<typeof buildPlanCanvasGraph>[0]
  const steps = definitions.map(item => ({ stepId: item.id, chain,
    presentation: { ...presentation, stages: [{ ...stage, title: item.title }] } }))
  const inspected: string[][] = [], selected: string[][] = [], before = structuredClone(steps)
  const graph = buildPlanCanvasGraph(plan, steps, undefined, null, null,
    (step, id) => inspected.push([step, id]), (step, id) => selected.push([step, id]))
  const stages = graph.nodes.filter((node): node is StageCanvasNode => node.type === "chain-stage")
  assert.deepEqual(stages.map(node => node.data.title), definitions.map(item => item.title))
  assert.deepEqual(graph.edges.filter(edge => edge.source.startsWith("plan-call:") && edge.target.startsWith("plan-call:")).map(edge => [edge.source, edge.target]), [
    [planCallId("step-1"), planCallId("step-2")],
    [planCallId("step-2"), planCallId("step-3")]])
  // WHY：一个步骤只有一个调用节点；子链出口不能变成主流程中的额外“完成/返回”节点。
  assert.equal(graph.nodes.length, 5)
  assert.ok(graph.nodes.every(node => !node.parentId))
  assert.match(stages[1]!.data.invocationLabel!, /循环.*5 项/)
  assert.deepEqual(graph.nodes.filter(node => node.type === "chain-terminal").map(node => node.data.label), ["开始", "结束"])
  const html = renderToStaticMarkup(createElement(ReactFlowProvider, null,
    createElement(StageCanvasCard, { id: stages[1]!.id, data: stages[1]!.data } as NodeProps<StageCanvasNode>)))
  assert.equal((html.match(/启用通知<\/button>/g) ?? []).length, 1)
  assert.match(html, /chain-call-loop.*chain-loop-body/)
  assert.match(html, /下一项/)
  assert.match(html, /aria-label="查看动作：读取列表"/)
  stages[1]!.data.onInspect("read"); stages[1]!.data.onSelect(stages[1]!.id)
  assert.deepEqual(inspected, [["step-2", "read"]]); assert.deepEqual(selected, [["step-2", stage.id]])
  const selection = selectCanvasNodes(graph.nodes, "read", stages[1]!.id, null, "step-2")
  assert.deepEqual(selection.filter(node => node.type === "chain-stage").map(node => node.data.actions[0]?.selected), [false, true, false])
  const result = stages[1]!.data.results![0]!
  assert.equal(result.id, "done")
  stages[1]!.data.onInspect(result.id)
  assert.deepEqual(inspected.at(-1), ["step-2", "done"])
  assert.deepEqual(steps, before)
  const pending = buildPlanCanvasGraph(plan, steps.slice(0, 1), undefined, null, null, () => {}, () => {})
  assert.equal(pending.nodes.filter(node => node.type === "chain-stage").length, 3)
  const pendingStep = pending.nodes.find(node => node.type === "chain-stage" && node.data.scopeStepId === "step-2")!
  if (pendingStep.type !== "chain-stage") throw Error("stage_required")
  assert.equal(pendingStep.data.actions.length, 0)
  const completed = { stepId: "step-1", phase: "final", nodes: chain.nodes, edges: chain.edges,
    presentation } as unknown as NonNullable<LiveChainModel["build"]>
  const current = { ...completed, stepId: "step-2", phase: "prefix" as const }
  const snapshots = buildPlanCanvasGraph(plan, [], current, null, null,
    (step, id) => inspected.push([step, id]), () => {}, undefined, [completed])
  const prior = snapshots.nodes.find(node => node.type === "chain-stage" && node.data.scopeStepId === "step-1")!
  if (prior.type !== "chain-stage") throw Error("previous_stage_required")
  assert.equal(prior.data.actions[0]!.id, "read")
  prior.data.onInspect("read")
  assert.deepEqual(inspected.at(-1), ["step-1", "read"])
})

test("计划图的返回事实必须来自同一调用，终点事件不能覆盖返回失败", () => {
  // WHY：真实终点事件先于输出处理；保护失败返回及另一调用的成功不能把当前终点涂绿。
  const plan = { steps: [{ id: "item", title: "逐项处理", goal: "处理一个输入", dependsOn: [],
    invocation: { mode: "each", maxItems: 5 } }] } as Parameters<typeof buildPlanCanvasGraph>[0]
  const steps = [{ stepId: "item", chain, presentation }]
  const batch = { executionId: "execution", events: [{ executionId: "execution", stepId: "item", runId: "run-2",
    event: { nodeId: "done", sequence: 1, status: "finished", outcome: "success" } }] } as unknown as Parameters<typeof buildPlanCanvasGraph>[4]
  const run = { binding: { runId: "run-2" }, status: "failed", outcome: { status: "failed", code: "output_invalid" } }
  const detail = { execution: { id: "execution" }, calls: [{ stepId: "item", run }] } as unknown as NonNullable<Parameters<typeof buildPlanCanvasGraph>[9]>
  const terminal = (value: typeof detail | undefined) => (buildPlanCanvasGraph(plan, steps, undefined, "execution", batch,
    () => {}, () => {}, undefined, [], value).nodes.find(node => node.type === "chain-stage") as StageCanvasNode).data.results![0]!
  assert.equal(terminal(detail).tone, "failure")
  assert.equal(terminal(detail).statusLabel, "返回处理失败")
  assert.equal(terminal(undefined).tone, "idle")
  const other = structuredClone(detail); other.calls[0]!.run.binding.runId = "run-1"
  assert.equal(terminal(other).tone, "idle")
  other.execution.id = "another-execution"; other.calls[0]!.run.binding.runId = "run-2"
  assert.equal(terminal(other).tone, "idle")
})

test("单动作阶段仍是唯一阶段父节点，真实 nodeId 只存在于内部动作行", () => {
  const source = structuredClone({ chain, presentation, revision: 4, checksum: "b".repeat(64),
    validation: { status: "passed", revision: 4, checksum: "b".repeat(64) } })
  const before = structuredClone(source)
  freeze(source)
  const inspected: string[] = []
  const overview = buildCanvasGraph(source.chain, source.presentation, null, (id) => inspected.push(id))
  assert.deepEqual(overview.nodes.map((node) => node.type), ["chain-terminal", "chain-stage", "chain-terminal"])
  assert.equal(overview.nodes.filter((node) => node.type === "chain-stage").length, 1)
  assert.equal(overview.nodes.some((node) => node.type === "chain-action"), false)
  const stageNode = overview.nodes.find((node) => node.type === "chain-stage") as StageCanvasNode
  assert.deepEqual(stageNode.position, { x: 21, y: 32 })
  assert.deepEqual(overview.nodes.find((node) => node.id === "__start")!.position, { x: -251, y: 6 })
  assert.deepEqual(overview.nodes.find((node) => node.id === "__end:done")!.position, { x: 313, y: 6 })
  assert.deepEqual(stageNode.data.actions.map((item) => item.id), ["read"])
  stageNode.data.onInspect("read")
  stageNode.position.x += 100
  stageNode.selected = true
  assert.deepEqual(inspected, ["read"])
  assert.deepEqual(source, before)
})

test("子行始终原位显示；动作选择不改变 React Flow 身份与父级边", () => {
  const grouped = { id: "grouped", title: "读取并选择", summary: "读取 → 选择", nodeIds: ["first", "second"],
    entryNodeId: "first", exits: [{ id: "next", label: "继续", sourceNodeId: "second", sourcePort: "success" }] }
  const tail = { id: "tail", title: "读取结果", summary: "读取结果", nodeIds: ["third"], entryNodeId: "third",
    exits: [{ id: "done", label: "完成", sourceNodeId: "third", sourcePort: "success" }] }
  const groupedChain = { entry: "first", nodes: [
    { id: "first", kind: "function", label: "读取候选" }, { id: "second", kind: "function", label: "选择候选" },
    { id: "third", kind: "function", label: "读取结果" },
    { id: "done", kind: "terminal", label: "完成", status: "completed", reason: "完成" },
  ], edges: [{ from: "first", port: "success", to: "second" },
    { from: "second", port: "success", to: "third" }, { from: "third", port: "success", to: "done" }] } as TaskChain
  const groupedPresentation = { stages: [grouped, tail], overviewLayout: [
    { stageId: grouped.id, x: 113, y: 71 }, { stageId: tail.id, x: 467, y: 239 },
  ], focusLayouts: [
    { stageId: grouped.id, nodes: grouped.nodeIds.map((nodeId, index) => ({ nodeId, x: index * 100, y: 0 })) },
    { stageId: tail.id, nodes: [{ nodeId: "third", x: 0, y: 0 }] },
  ] } as unknown as ChainPresentation
  const initial = buildCanvasGraph(groupedChain, groupedPresentation, null, () => {})
  assert.ok(initial.nodes.some((node) => node.id === grouped.id && node.type === "chain-stage"))
  assert.ok(initial.nodes.some((node) => node.id === tail.id && node.type === "chain-stage"))
  assert.equal(initial.nodes.some((node) => node.type === "chain-action"), false)
  const selected = buildCanvasGraph(groupedChain, groupedPresentation, null, () => {}, () => {}, "second")
  assert.deepEqual(selected.nodes.map((node) => [node.id, node.type]), initial.nodes.map((node) => [node.id, node.type]))
  assert.deepEqual(selected.edges.map((edge) => [edge.source, edge.target]), initial.edges.map((edge) => [edge.source, edge.target]))
  const initialStage = initial.nodes.find((node) => node.id === grouped.id) as StageCanvasNode
  const selectedStage = selected.nodes.find((node) => node.id === grouped.id) as StageCanvasNode
  assert.deepEqual(selectedStage.data.actions.map((item) => [item.id, item.selected]), [["first", false], ["second", true]])
  assert.deepEqual(selectedStage.position, initialStage.position)
  assert.deepEqual(selectedStage.position, { x: 113, y: 71 })
  assert.equal(selectedStage.height, initialStage.height)
})

test("阶段与动作保留原生按钮，选中持续可辨且没有路径展开", () => {
  const selected: string[] = [], inspected: string[] = []
  const props = { id: stage.id, data: { title: stage.title, summary: stage.summary, direction: "LR", tone: "idle",
    statusLabel: "待运行",
    actions: [{ id: "read", title: "读取列表", type: "读取", tone: "idle", selected: true }],
    onSelect: (id: string) => selected.push(id), onInspect: (id: string) => inspected.push(id) } } as NodeProps<StageCanvasNode>
  const element = StageCanvasCard(props)
  const button = findButton(element, "查看动作：读取列表")
  assert.ok(button)
  assert.equal(button.props.type, "button")
  let stopped = 0
  button.props.onClick({ stopPropagation: () => stopped++ })
  assert.deepEqual(inspected, ["read"])
  assert.equal(stopped, 1)
  findButton(element, "查看阶段：读取页面")!.props.onClick({ stopPropagation() {} })
  assert.equal(findButton(element, "展开路径：读取页面"), undefined)
  assert.deepEqual(selected, [stage.id])
  const html = renderToStaticMarkup(createElement(ReactFlowProvider, null, element))
  assert.match(html, /<button[^>]*aria-label="查看动作：读取列表"/)
  assert.doesNotMatch(html, /展开路径|chain-stage-routes/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /data-selected="true"/)
  assert.match(html, /chain-stage-handle/)
})

test("亮暗画布均透传主题并保留具名缩放与适应视图控件", () => {
  const noop = () => {}
  const model = { displayChain: chain, presentation, canvasPresentation: presentation, chainEvents: null,
    view: { eventBatch: null }, setStepId: noop,
    setSelectedStageId: noop, setSelectedNodeId: noop, setContextMode: noop,
    selectedNodeId: null, selectedStageId: null } as unknown as LiveChainModel
  for (const theme of ["light", "dark"] as const) {
    const html = renderToStaticMarkup(createElement(LiveChainCanvas, { model, active: true, theme }))
    assert.match(html, new RegExp(`class="[^"]*react-flow [^"]*${theme}`))
    // SSR 不执行 React Flow StoreUpdater effect；这里只验原生控件有名字，不能冒充挂载后的中文提示验证。
    const controls = [...html.matchAll(/<button\b[^>]*class="[^"]*react-flow__controls-(zoomin|zoomout|fitview)"[^>]*aria-label="([^"]+)"/g)]
    assert.deepEqual(controls.map((match) => match[1]).sort(), ["fitview", "zoomin", "zoomout"])
    assert.ok(controls.every((match) => match[2]!.trim()), `${theme}: 缩放控件缺少可访问名称`)
  }
})

test("终点尺寸在布局时确定，同阶段多个真实终点互不重叠", () => {
  const graph = buildCanvasGraph({ ...chain, nodes: [...chain.nodes,
    { id: "failed", kind: "terminal", label: "失败", status: "failed", reason: "目标受阻" }],
    edges: [...chain.edges, { from: "read", outcome: "failed", to: "failed" }] } as TaskChain,
  presentation, null, () => {})
  const terminals = graph.nodes.filter(item => item.type === "chain-terminal" && item.data.terminal === "end")
    .sort((a, b) => a.position.y - b.position.y)
  assert.ok(terminals.every(item => item.height === 96 && item.width === 220))
  assert.ok(terminals[1]!.position.y >= terminals[0]!.position.y + Number(terminals[0]!.height))
})

test("运行投影相同保留整图引用，仅动作选择只改变所属阶段", () => {
  const inspect = () => {}, select = () => {}, share = shareCanvasGraph()
  const first = share(buildCanvasGraph(chain, presentation, null, inspect, select))
  const same = share(buildCanvasGraph(chain, presentation, null, inspect, select))
  assert.equal(same.nodes, first.nodes)
  assert.equal(same.edges, first.edges)
  const selected = selectCanvasNodes(first.nodes, "read", null, null)
  for (const item of first.nodes) {
    const next = selected.find(node => node.id === item.id)!
    if (item.type === "chain-stage") {
      assert.notEqual(next, item)
      assert.equal(next.position, item.position)
      assert.equal((next as StageCanvasNode).data.actions[0]!.selected, true)
    } else assert.equal(next, item)
  }
})

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

type ButtonElement = ReactElement<{ type?: string; "aria-label"?: string;
  onClick(event: { stopPropagation(): void }): void }>
function findButton(node: ReactNode, label: string): ButtonElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === "button" && (node.props as { "aria-label"?: string })["aria-label"] === label) return node as ButtonElement
  return Children.toArray(node.props.children).map((child) => findButton(child, label)).find(Boolean)
}
