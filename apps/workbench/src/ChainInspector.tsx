import { Badge } from "@radix-ui/themes"
import { useEffect, useRef } from "react"
import type { ChainNode, ChainPresentation, ChainStage, TaskChain } from "@browser-capture/contracts"
import { toneLabel } from "./ChainCanvasNodes.js"
import { actionInputSources, actionPresentation, actionTarget } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone, stageRunTone } from "./chainWorkbenchProjection.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export function ChainInspector({ chain, presentation, stage, node, batch, onClose, preparing, preparationPhase }: {
  chain: Pick<TaskChain, "nodes" | "edges">; preparing?: boolean; preparationPhase?: "prefix" | "final";
  presentation?: Pick<ChainPresentation, "stages">; stage: ChainStage | null; node: ChainNode | null;
  batch: ReturnType<TaskChainConnection["snapshot"]>["eventBatch"];
  onClose(): void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [node?.id, stage?.id])
  if (!stage && !node) return <aside className="chain-inspector" aria-label="链路检查器"><p>选择一个阶段或动作查看上下文。</p></aside>
  if (!node && stage) {
    const entry = chain.nodes.find((item) => item.id === stage.entryNodeId)
    const exits = stageExitLabels(stage, chain)
    return <aside ref={panel} className="chain-inspector" aria-label="阶段说明"><header><span>阶段说明</span>
      <button onClick={onClose} aria-label="关闭检查器">×</button></header><h3>{stage.title}</h3><dl>
        <dt>阶段目的</dt><dd>{stage.summary}</dd>
        {preparing ? <><dt>准备状态</dt><dd>{preparationPhase === "final" ? "已生成" : "生成中"}</dd></>
          : <><dt>本次运行</dt><dd>{toneLabel(stageRunTone(stage, batch))}</dd></>}
        <dt>动作数量</dt><dd>{stage.nodeIds.length} 个</dd>
        <dt>已知入口</dt><dd>{entry ? actionPresentation(entry).title : "入口节点未记录"}</dd>
        <dt>真实出口</dt><dd>{exits.join("；") || (preparing ? "尚未生成" : "本阶段没有外部出口")}</dd>
      </dl><details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify(stage, null, 2)}</pre></details>
    </aside>
  }
  const owner = presentation?.stages.find((item) => item.nodeIds.includes(node!.id))
  const outgoing = chain.edges.filter((edge) => edge.from === node!.id).map((edge) => {
    const port = "port" in edge ? edge.port : edge.outcome
    const label = nodePortLabel(node!, port)
    const target = chain.nodes.find((item) => item.id === edge.to)
    return `${label} → ${target ? actionPresentation(target).title : "未记录的后续动作"}`
  })
  const action = actionPresentation(node!)
  const nodeEvents = batch?.events.filter((item) => item.event.nodeId === node!.id).map((item) => item.event) ?? []
  const latestNodeEvent = nodeEvents.at(-1)
  const duration = latestNodeEvent?.status === "finished" ? nodeDuration(nodeEvents, latestNodeEvent.invocationId) : null
  return <aside ref={panel} className="chain-inspector" aria-label="动作说明"><header><span>动作说明</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><div className="chain-context-path">{owner?.title ?? "生成中的节点"} › {action.title}</div>
    <h3>{action.title}</h3><Badge>{action.type}</Badge><dl>
      <dt>动作</dt><dd>{action.description}</dd><dt>目标</dt><dd>{actionTarget(node!)}</dd>
      <dt>输入来自</dt><dd>{actionInputSources(node!, chain.nodes)}</dd>
      <dt>条件和出口</dt><dd>{outgoing.join("；") || (preparing ? "尚未生成" : "无已记录后续出口")}</dd>
      {!preparing && <><dt>本次运行</dt><dd>{toneLabel(nodeRunTone(node!.id, batch, owner))}</dd>
        {latestNodeEvent?.status === "finished" && <><dt>本次节点输出</dt><dd>本次节点输出未记录</dd></>}
        {duration && <><dt>耗时</dt><dd>{duration}</dd></>}</>}
    </dl><details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify({ node, events: nodeEvents }, null, 2)}</pre></details></aside>
}

function stageExitLabels(stage: ChainStage, chain: Pick<TaskChain, "nodes" | "edges">) {
  return stage.exits.flatMap((exit) => {
    const edge = chain.edges.find((candidate) => candidate.from === exit.sourceNodeId
      && ("port" in candidate ? candidate.port : candidate.outcome) === exit.sourcePort)
    if (!edge) return []
    const source = chain.nodes.find((item) => item.id === exit.sourceNodeId)
    const target = chain.nodes.find((item) => item.id === edge.to)
    const port = nodePortLabel(source, exit.sourcePort, exit.label)
    return [`${port} → ${target ? actionPresentation(target).title : "未记录的后续动作"}`]
  })
}

function nodePortLabel(node: ChainNode | undefined, port: string, fallback?: string) {
  if (node?.kind === "branch" && "cases" in node) {
    const branch = node.cases.find((item) => item.id === port)
    if (branch) return branch.label
  }
  const standard = edgePortLabel(port)
  if (standard && standard !== port) return standard
  return ({ success: "成功", completed: "完成", body: "进入循环", done: "循环完成",
    limit: "达到循环上限", partial: "部分完成" } as Record<string, string>)[port] ?? fallback ?? "其他出口"
}

function nodeDuration(events: Array<{ status: string; at: string; invocationId: string }>, invocationId: string) {
  const started = events.findLast((event) => event.invocationId === invocationId && event.status === "started")
  const finished = events.findLast((event) => event.invocationId === invocationId && event.status === "finished")
  if (!started || !finished) return null
  const elapsed = Date.parse(finished.at) - Date.parse(started.at)
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  if (elapsed < 1_000) return `${elapsed} 毫秒`
  const seconds = elapsed / 1_000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`
}
