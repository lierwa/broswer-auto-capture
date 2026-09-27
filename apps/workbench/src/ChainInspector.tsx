import { Badge } from "@radix-ui/themes"
import { useEffect, useRef } from "react"
import type { ChainNode, ChainPresentation, ChainStage, TaskChain } from "@browser-capture/contracts"
import { toneLabel } from "./ChainCanvasNodes.js"
import { actionPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone } from "./chainWorkbenchProjection.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export function ChainInspector({ chain, presentation, stage, node, batch, onClose }: { chain: TaskChain;
  presentation: ChainPresentation; stage: ChainStage | null; node: ChainNode | null;
  batch: ReturnType<TaskChainConnection["snapshot"]>["eventBatch"];
  onClose(): void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [node?.id])
  if (!stage && !node) return <aside className="chain-inspector" aria-label="链路检查器"><p>选择一个阶段或动作查看上下文。</p></aside>
  if (!node && stage) return <aside className="chain-inspector" aria-label="阶段说明"><header><span>阶段说明</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><h3>{stage.title}</h3><p>{stage.summary}</p>
    <ol>{stage.nodeIds.map((id) => {
      const action = actionPresentation(chain.nodes.find((item) => item.id === id)!)
      return <li key={id}>{action.title}<small>{action.type} · {toneLabel(nodeRunTone(id, batch, stage))}</small></li>
    })}</ol>
    </aside>
  const owner = presentation.stages.find((item) => item.nodeIds.includes(node!.id))!
  const incoming = chain.edges.filter((edge) => edge.to === node!.id)
    .map((edge) => actionPresentation(chain.nodes.find((item) => item.id === edge.from)!).title)
  const outgoing = chain.edges.filter((edge) => edge.from === node!.id).map((edge) => {
    const port = "port" in edge ? edge.port : edge.outcome
    const label = edgePortLabel(port)
    const target = chain.nodes.find((item) => item.id === edge.to)
    return `${label ? `${label} → ` : ""}${target ? actionPresentation(target).title : edge.to}`
  })
  const action = actionPresentation(node!)
  return <aside ref={panel} className="chain-inspector" aria-label="动作说明"><header><span>动作说明</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><div className="chain-context-path">{owner.title} › {action.title}</div>
    <h3>{action.title}</h3><Badge>{action.type}</Badge><dl><dt>本次运行</dt><dd>{toneLabel(nodeRunTone(node!.id, batch, owner))}</dd>
      <dt>上一动作</dt><dd>{incoming.join("、") || "阶段入口"}</dd><dt>动作</dt><dd>{action.description}</dd>
      <dt>下一动作</dt><dd>{outgoing.join("；") || "完成"}</dd></dl>
    <details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify(node, null, 2)}</pre></details></aside>
}

