import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { NodeTypePresentation } from "./chainNodePresentation.js"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"
import type { CanvasListItem } from "./chainCanvasList.js"
import { CanvasActionList, LoopBody } from "./ChainCanvasActionList.js"
import { StatusIcon } from "./ChainRunStatus.js"
export { StatusIcon, toneLabel } from "./ChainRunStatus.js"

export type StageActionRow = NodeTypePresentation & {
  id: string
  title: string
  tone: ChainRunTone
  ordinal?: number
  outcome?: string | null | undefined
  eventStatus?: string | undefined
  statusLabel?: string
  durationLabel?: string | undefined
  selected?: boolean
  context?: string[]
  branches?: { port: string; label: string; target: string; selection: "pending" | "selected" | "unselected" }[]
}
export type StageCanvasData = Record<string, unknown> & {
  title: string
  summary: string
  tone: ChainRunTone
  direction: ChainLayoutDirection
  actions: StageActionRow[]
  items: CanvasListItem[]
  statusLabel: string
  invocationLabel?: string
  repeated?: boolean
  callLabel?: string
  sections?: { id: string; title: string; items: CanvasListItem[];
    routes: { id: string; label: string; target: string; targetId: string; tone: ChainRunTone }[] }[]
  results?: { id: string; label: string; statusLabel: string; tone: ChainRunTone }[]
  durationLabel?: string | undefined
  onSelect(id: string): void
  onInspect(id: string): void
}
export type TerminalCanvasData = Record<string, unknown> & {
  label: string; terminal: "start" | "end"; tone: ChainRunTone; direction: ChainLayoutDirection;
  durationLabel?: string | undefined
  summary?: string
  statusLabel?: string
  onInspect?: (id: string) => void
  nodeId?: string
}
export type StageCanvasNode = Node<StageCanvasData, "chain-stage">
export type TerminalCanvasNode = Node<TerminalCanvasData, "chain-terminal">
export type ChainCanvasNode = StageCanvasNode | TerminalCanvasNode

function StageHandles({ direction }: { direction: ChainLayoutDirection }) {
  const horizontal = direction === "LR"
  return <><Handle className="chain-stage-handle" type="target"
    position={horizontal ? Position.Left : Position.Top} />
    <Handle className="chain-stage-handle" type="source"
      position={horizontal ? Position.Right : Position.Bottom} /></>
}

export function StageCanvasCard({ id, data }: NodeProps<StageCanvasNode>) {
  return <article className="chain-stage-card" data-tone={data.tone}
    data-controls={data.items.some(item => item.body || item.routes.length > 0)}>
    <StageHandles direction={data.direction} />
    <div className="chain-stage-content">
    <header className="chain-stage-heading" title={data.summary}>
      <button type="button" className="nodrag chain-stage-title"
        aria-label={`查看阶段：${data.title}`}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id) }}>{data.title}</button>
      <span className="chain-stage-status" data-tone={data.tone} title={data.durationLabel}>{data.statusLabel}</span>
    </header>
    {data.invocationLabel ? <>
      <p className="chain-call-mode">{data.invocationLabel}</p>
      <div className="chain-call-details">
        {data.callLabel && <p className="chain-call-scope">{data.callLabel}</p>}
        {data.repeated ? <div className="chain-call-loop"><LoopBody tone={data.tone} label={data.title} next="下一项">
          <CallActions data={data} />
        </LoopBody></div> : <CallActions data={data} />}
        {!!data.results?.length && <details className="chain-call-results"><summary>本次调用的出口与结果</summary>
          {data.results.map(result => <button type="button" key={result.id} className="chain-call-result"
            aria-label={`查看调用结果：${result.label}`} onClick={event => { event.stopPropagation(); data.onInspect(result.id) }}>
            <span>{result.label}<small>{result.statusLabel}</small></span><StatusIcon tone={result.tone} label={result.statusLabel} />
          </button>)}
        </details>}
      </div>
    </> : <CanvasActionList items={data.items} actions={data.actions} onInspect={data.onInspect} label={`${data.title}的动作`} />}
    </div>
  </article>
}

function CallActions({ data }: { data: StageCanvasData }) {
  return <>{data.sections?.map(section => <section key={section.id}>
    {data.sections!.length > 1 && <h4>{section.title}</h4>}
    <CanvasActionList items={section.items} actions={data.actions} onInspect={data.onInspect} label={`${section.title}的动作`} />
    {!!section.routes.length && <ul className="chain-call-routes" aria-label={`${section.title}的后续路径`}>
      {section.routes.map(route => <li key={route.id}><button type="button" className="nodrag"
        onClick={event => { event.stopPropagation(); data.onInspect(route.targetId) }}>
        <span>{route.label} → {route.target}</span><StatusIcon tone={route.tone} /></button></li>)}
    </ul>}
  </section>)}</>
}

export function TerminalCanvasCard({ id, data }: NodeProps<TerminalCanvasNode>) {
  const horizontal = data.direction === "LR"
  return <div className="chain-terminal-card" data-terminal={data.terminal} data-tone={data.tone}>
    {data.terminal === "end" && <Handle type="target" position={horizontal ? Position.Left : Position.Top} />}
    <button className="nodrag chain-terminal-select" type="button"
      title={[data.summary, data.statusLabel, data.durationLabel].filter(Boolean).join(" · ")} aria-label={`查看${data.label}`}
      onClick={(event) => { event.stopPropagation(); data.onInspect?.(data.nodeId ?? (data.terminal === "end" ? id.slice("__end:".length) : id)) }}>
      <span><strong>{data.label}</strong></span><StatusIcon tone={data.tone} label={data.statusLabel} />
    </button>
    {data.terminal === "start" && <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />}
  </div>
}
