import { ChevronDown, CornerDownRight } from "lucide-react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"

export type StageActionRow = {
  id: string
  title: string
  type: string
  tone: ChainRunTone
}

export type StageRouteRow = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceTitle: string
  port: string
  portLabel: string
  targetTitle: string
}

export type StageCanvasData = Record<string, unknown> & {
  title: string
  summary: string
  tone: ChainRunTone
  direction: ChainLayoutDirection
  actions: StageActionRow[]
  routes: StageRouteRow[]
  expanded: boolean
  statusLabel: string
  onSelect(id: string): void
  onInspect(id: string): void
  onToggle(id: string): void
}
export type TerminalCanvasData = Record<string, unknown> & {
  label: string; terminal: "start" | "end"; tone: ChainRunTone; direction: ChainLayoutDirection;
}
export type StageCanvasNode = Node<StageCanvasData, "chain-stage">
export type TerminalCanvasNode = Node<TerminalCanvasData, "chain-terminal">

function StageHandles({ direction }: { direction: ChainLayoutDirection }) {
  const horizontal = direction === "LR"
  return <><Handle className="chain-stage-handle" type="target"
    position={horizontal ? Position.Left : Position.Top} />
    <Handle className="chain-stage-handle" type="source"
      position={horizontal ? Position.Right : Position.Bottom} /></>
}

export function StageCanvasCard({ id, data }: NodeProps<StageCanvasNode>) {
  return <article className="chain-stage-card" data-tone={data.tone} data-expanded={data.expanded}>
    <StageHandles direction={data.direction} />
    <header className="chain-stage-heading" title={data.summary}>
      <button type="button" className="nodrag chain-stage-title"
        aria-label={`查看阶段：${data.title}`}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id) }}>{data.title}</button>
      <span className="chain-stage-status" data-tone={data.tone}>{data.statusLabel}</span>
      {data.routes.length > 0 && <button type="button" className="nodrag chain-stage-toggle"
        aria-expanded={data.expanded} aria-label={`${data.expanded ? "收起" : "展开"}路径：${data.title}`}
        onClick={(event) => { event.stopPropagation(); data.onToggle(id) }}>
        {data.expanded ? <ChevronDown size={13} aria-hidden="true" />
          : <CornerDownRight size={13} aria-hidden="true" />}
      </button>}
    </header>
    <ol className="chain-stage-actions" aria-label={`${data.title}的动作`}>
      {data.actions.map((action) => <li key={action.id} data-tone={action.tone}>
        <i aria-hidden="true" />
        <button type="button" className="nodrag" aria-label={`查看动作：${action.title}`}
          onClick={(event) => { event.stopPropagation(); data.onInspect(action.id) }}>
          <small>{action.type}</small><span>{action.title}</span>
        </button>
      </li>)}
    </ol>
    {data.expanded && data.routes.length > 0 && <ol className="chain-stage-routes" aria-label={`${data.title}的真实路径`}>
      {data.routes.map((route) => <li key={route.id} data-route-id={route.id}>
        <button type="button" className="nodrag" onClick={(event) => {
          event.stopPropagation(); data.onInspect(route.sourceNodeId)
        }}>{route.sourceTitle}</button>
        <span>{route.portLabel || "继续"}</span><CornerDownRight size={12} aria-hidden="true" />
        <strong>{route.targetTitle}</strong>
      </li>)}
    </ol>}
  </article>
}

export function TerminalCanvasCard({ data }: NodeProps<TerminalCanvasNode>) {
  const horizontal = data.direction === "LR"
  return <div className="chain-terminal-card" data-terminal={data.terminal} data-tone={data.tone}>
    {data.terminal === "end" && <Handle type="target" position={horizontal ? Position.Left : Position.Top} />}
    <i aria-hidden="true" />{data.label}
    {data.terminal === "start" && <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />}
  </div>
}

export function toneLabel(tone: ChainRunTone) {
  return { idle: "待运行", queued: "已排队", running: "运行中", success: "已完成",
    waiting: "等待人工", failure: "未完成", skipped: "已跳过", ended: "已结束" }[tone]
}
