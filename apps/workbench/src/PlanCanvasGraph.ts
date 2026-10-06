import type { Edge } from "@xyflow/react"
import type { TaskDraftContent, TaskExecutionDetail, TaskExecutionEventBatch, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import type { StageCanvasNode, TerminalCanvasNode, ChainCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph, buildPreparationGraph, flowEdge } from "./ChainCanvasGraph.js"
import { eventsForStep, type ChainRunTone } from "./chainWorkbenchProjection.js"
import { executionOutcome, executionStatus } from "./ExecutionPresentation.js"
import { layoutChainGraph } from "./chainLayout.js"

type Build = NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]>
type Selection = (stepId: string, id: string) => void
export function planCanvasId(stepId: string, id: string) { return `plan:${stepId}:${id}` }
export function planCallId(stepId: string) { return `plan-call:${stepId}` }

/** WHY：plan 调用只投影一次；动作和出口保留原链身份，折叠不产生另一份执行图。 */
export function buildPlanCanvasGraph(plan: TaskDraftContent["plan"], steps: TaskDraftContent["steps"],
  build: Build | undefined, executionId: string | null, batch: TaskExecutionEventBatch | null,
  onInspect: Selection, onSelect: Selection, selected?: { stepId: string; runId: string | null }, completedBuilds: Build[] = [],
  detail?: TaskExecutionDetail | null) {
  const nodes: ChainCanvasNode[] = [], edges: Edge[] = []
  const execution = detail?.execution.id === executionId ? detail.execution : undefined
  for (const definition of plan.steps) {
    const step = steps.find(item => item.stepId === definition.id)
    const inspect = (id: string) => onInspect(definition.id, id)
    const select = (id: string) => onSelect(definition.id, id)
    const facts = eventsForStep(definition.id, executionId, batch,
      selected?.stepId === definition.id ? selected.runId : null)
    const runId = facts?.events.at(-1)?.runId
    const call = execution ? detail?.calls.find(item => item.stepId === definition.id && item.run.binding.runId === runId)?.run : undefined
    const snapshot = build?.stepId === definition.id ? build : completedBuilds.find(item => item.stepId === definition.id)
    const graph = snapshot ? buildPreparationGraph(snapshot, inspect, select)
      : step ? buildCanvasGraph(step.chain, step.presentation, facts, inspect, select, null,
        { summary: definition.goal, status: call ? "本次调用" : "调用事实待确认", call, onStart: () => {} }) : null
    const stages = graph?.nodes.filter((node): node is StageCanvasNode => node.type === "chain-stage") ?? []
    const terminals = graph?.nodes.filter((node): node is TerminalCanvasNode => node.type === "chain-terminal" && node.data.terminal === "end") ?? []
    const stepFact = snapshot ? undefined : execution?.steps?.find(item => item.stepId === definition.id)
    const invocationIndex = runId ? (stepFact?.runIds.indexOf(runId) ?? -1) + 1 : 0
    const repeated = definition.invocation?.mode === "each"
    const width = Math.max(320, ...stages.map(node => Number(node.width ?? 300))) + (repeated ? 48 : 0)
    const height = stages.reduce((sum, node) => sum + Number(node.initialHeight ?? 54), 0) + 160 + terminals.length * 80
    nodes.push({ id: planCallId(definition.id), type: "chain-stage", position: { x: 0, y: 0 }, width,
      initialWidth: width, initialHeight: height,
      data: { title: definition.title, summary: definition.goal, tone: statusTone(stepFact?.status), direction: "LR",
        statusLabel: stepFact ? stepFact.status === "pending" ? "尚未开始" : executionStatus(stepFact.status)
          : snapshot ? snapshot.phase === "final" ? "已生成" : "生成中" : executionId ? "读取运行记录" : "待运行",
        scopeStepId: definition.id, sourceStageId: stages[0]?.id,
        invocationLabel: invocationLabel(definition), repeated,
        callLabel: invocationIndex ? `当前查看第 ${invocationIndex} 次调用` : "当前查看单次调用的动作",
        actions: stages.flatMap(node => node.data.actions), items: stages.flatMap(node => node.data.items),
        sections: stages.map(node => ({ id: node.id, title: node.data.title, items: node.data.items,
          routes: (graph?.edges ?? []).filter(edge => edge.source === node.id && stages.some(target => target.id === edge.target))
            .map(edge => ({ id: edge.id, label: String(edge.label ?? "继续"),
              target: stages.find(target => target.id === edge.target)!.data.title,
              targetId: (snapshot?.presentation ?? step?.presentation)?.stages.find(stage => stage.id === edge.target)?.entryNodeId ?? "",
              tone: (edge.data?.tone ?? "idle") as ChainRunTone })) })),
        results: terminals.map(node => ({ id: node.id.slice("__end:".length), label: node.data.label,
          statusLabel: node.data.statusLabel ?? "未到达", tone: node.data.tone })),
        onSelect: () => select(stages[0]?.id ?? `pending:${definition.id}`), onInspect: inspect } })
  }
  const link = (source: string, target: string, label = "") => edges.push(flowEdge({
    id: `plan-dependency:${source}:${target}`, source, target, port: "", label, tone: "idle" }))
  for (const step of plan.steps) {
    for (const predecessor of step.dependsOn) link(planCallId(predecessor), planCallId(step.id))
    if (!step.dependsOn.length) link("__plan_start", planCallId(step.id))
    if (!plan.steps.some(item => item.dependsOn.includes(step.id))) link(planCallId(step.id), "__plan_end")
  }
  nodes.push(boundary("__plan_start", "开始", "start"), boundary("__plan_end", "结束", "end"))
  // WHY：结束表示合法计划出口。失败停在真实步骤上，不能把未到达的结束节点涂成已完成。
  const end = nodes.at(-1)! as TerminalCanvasNode
  const outcome = execution ? executionOutcome(execution) : undefined
  end.data.tone = !build && outcome?.status === "completed" ? "success" : "idle"
  end.data.statusLabel = outcome ? executionStatus(outcome.status) : "尚未运行"
  if (execution?.status === "cleanup_required") end.data.statusLabel += " · 资源待清理"
  return { nodes: layoutChainGraph(nodes, edges, "LR"), edges }
}

function invocationLabel(step: TaskDraftContent["plan"]["steps"][number]) {
  const invocation = step.invocation
  if (invocation?.mode === "each") return `循环 · 每项执行 · 最多 ${invocation.maxItems} 项`
  return invocation?.mode === "batch" ? "批处理 · 整批执行一次" : "执行一次"
}

function statusTone(status: string | undefined): ChainRunTone {
  if (status === "completed") return "success"
  if (status === "failed" || status === "blocked") return "failure"
  if (status === "running") return "running"
  if (status === "waiting_for_human" || status === "paused") return "waiting"
  return status === "partial" || status === "cancelled" ? "ended" : "idle"
}

function boundary(id: string, label: string, terminal: "start" | "end"): TerminalCanvasNode {
  return { id, type: "chain-terminal", position: { x: 0, y: 0 }, width: 100, height: 54,
    data: { label, terminal, tone: "idle", direction: "LR" } }
}
