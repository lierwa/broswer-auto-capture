import { Badge, Button } from "@radix-ui/themes"
import { useEffect, useRef } from "react"
import type { CapabilityDescriptor, ChainNode, ChainPresentation, ChainStage, JsonValue, TaskChain, TaskDraft } from "@browser-capture/contracts"
import type { BrowserTargetSelectionState } from "@browser-capture/contracts/browser-profile"
import { RevisionNodeEditor } from "./NodeConfiguration.js"
import { CanvasNodeActions } from "./CanvasNodeActions.js"
import { toneLabel } from "./ChainCanvasNodes.js"
import { actionPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone } from "./chainWorkbenchProjection.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export function ChainInspector({ chain, presentation, stage, node, draft, batch, descriptor, targetSelection, busy,
  onClose, onEnter, onAdjust, onReplaceNode, onReplaceCapability, onPickTarget, onCancelTarget, onInsert, onRemove, onRoute }: { chain: TaskChain;
  presentation: ChainPresentation; stage: ChainStage | null; node: ChainNode | null; draft: TaskDraft | null;
  batch: ReturnType<TaskChainConnection["snapshot"]>["eventBatch"];
  descriptor: CapabilityDescriptor | null; targetSelection: BrowserTargetSelectionState | null; busy: boolean;
  onClose(): void; onEnter(id: string): void; onAdjust(nodeId: string | null): void; onReplaceNode(node: ChainNode): void;
  onReplaceCapability(config: JsonValue): void; onPickTarget(): void; onCancelTarget(): void;
  onInsert(node: ChainNode): void; onRemove(): void; onRoute(port: string, targetId: string): void }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [node?.id])
  if (!stage && !node) return <aside className="chain-inspector" aria-label="链路检查器"><p>选择一个阶段或动作查看上下文。</p></aside>
  if (!node && stage) return <aside className="chain-inspector" aria-label="阶段说明"><header><span>阶段说明</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><h3>{stage.title}</h3><p>{stage.summary}</p>
    <ol>{stage.nodeIds.map((id) => {
      const action = actionPresentation(chain.nodes.find((item) => item.id === id)!)
      return <li key={id}>{action.title}<small>{action.type} · {toneLabel(nodeRunTone(id, batch, stage))}</small></li>
    })}</ol>
    <div className="context-actions"><Button onClick={() => onEnter(stage.id)}>展开阶段动作</Button>
      <Button variant="soft" onClick={() => onAdjust(null)}>调整这一步</Button></div></aside>
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
  return <aside ref={panel} className="chain-inspector" aria-label="动作说明"><header><span>{draft ? "编辑节点" : "动作说明"}</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><div className="chain-context-path">{owner.title} › {action.title}</div>
    <h3>{action.title}</h3>{!draft && <><Badge>{action.type}</Badge><dl><dt>本次运行</dt><dd>{toneLabel(nodeRunTone(node!.id, batch, owner))}</dd>
      <dt>上一动作</dt><dd>{incoming.join("、") || "阶段入口"}</dd><dt>动作</dt><dd>{action.description}</dd>
      <dt>下一动作</dt><dd>{outgoing.join("；") || "完成"}</dd></dl></>}
    {draft && <RevisionNodeEditor chain={chain} draft={draft} node={node!} descriptor={descriptor} targetSelection={targetSelection}
      busy={busy} onReplaceNode={onReplaceNode} onReplaceCapability={onReplaceCapability}
      onPickTarget={onPickTarget} onCancelTarget={onCancelTarget} />}
    {draft && <CanvasNodeActions chain={chain} node={node!} busy={busy} onInsert={onInsert} onRemove={onRemove} onRoute={onRoute} />}
    <div className="context-actions"><Button size="1" variant="soft" onClick={() => onAdjust(node!.id)}>调整这一步</Button></div>
    {!draft && <details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify(node, null, 2)}</pre></details>}</aside>
}

