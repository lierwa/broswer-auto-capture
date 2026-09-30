import { Check, Circle, Clock, LoaderCircle, Minus, Pause, X } from "lucide-react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"

export type StageActionRow = {
  id: string
  title: string
  type: string
  tone: ChainRunTone
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
  statusLabel: string
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
  return <article className="chain-stage-card" data-tone={data.tone}>
    <StageHandles direction={data.direction} />
    <div className="chain-stage-content">
    <header className="chain-stage-heading" title={data.summary}>
      <button type="button" className="nodrag chain-stage-title"
        aria-label={`查看阶段：${data.title}`}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id) }}>{data.title}</button>
      <span className="chain-row-facts"><span className="chain-stage-status" data-tone={data.tone}>{data.statusLabel}</span>
        {data.durationLabel && <small className="chain-node-duration">{data.durationLabel}</small>}</span>
    </header>
    <ol className="chain-stage-actions" aria-label={`${data.title}的动作`}>
      {data.actions.map((action) => <li key={action.id} data-tone={action.tone} data-selected={action.selected === true}>
        <button type="button" className="nodrag chain-action-select" aria-label={`查看动作：${action.title}`}
          aria-pressed={action.selected === true}
          onClick={(event) => { event.stopPropagation(); data.onInspect(action.id) }}>
          <RunIcon tone={action.tone} />
          <span className="chain-action-name"><small>{action.type}</small><span>{action.title}</span></span>
          <span className="chain-row-facts"><span>{action.statusLabel ?? toneLabel(action.tone)}</span>
            {action.durationLabel && <small className="chain-node-duration">{action.durationLabel}</small>}</span>
        </button>
        {action.context?.map((line, index) => <p className="chain-action-context" key={index}>{line}</p>)}
        {action.branches?.length ? <ul className="chain-action-branches" aria-label={`${action.title}的分支`}>
          {action.branches.map((branch) => <li key={branch.port} data-selection={branch.selection}>
            <span>{branch.label} → {branch.target}</span><small>{branch.selection === "selected" ? "本次已选"
              : branch.selection === "unselected" ? "本次未选" : "待判定"}</small></li>)}
        </ul> : null}
      </li>)}
    </ol>
    </div>
  </article>
}

export function TerminalCanvasCard({ id, data }: NodeProps<TerminalCanvasNode>) {
  const horizontal = data.direction === "LR"
  return <div className="chain-terminal-card" data-terminal={data.terminal} data-tone={data.tone}>
    {data.terminal === "end" && <Handle type="target" position={horizontal ? Position.Left : Position.Top} />}
    <button className="nodrag chain-terminal-select" type="button" title={data.summary} aria-label={`查看${data.label}`}
      onClick={(event) => { event.stopPropagation(); data.onInspect?.(data.terminal === "end" ? id.slice("__end:".length) : id) }}>
      <RunIcon tone={data.tone} /><span><strong>{data.label}</strong>
        {data.summary && <small>{data.summary}</small>}
        {data.statusLabel && <small>{data.statusLabel}</small>}</span>
      {data.durationLabel && <small className="chain-node-duration">{data.durationLabel}</small>}
    </button>
    {data.terminal === "start" && <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />}
  </div>
}

export function toneLabel(tone: ChainRunTone) {
  return { idle: "待运行", queued: "已排队", running: "运行中", success: "已完成",
    waiting: "等待人工", failure: "未完成", skipped: "已跳过", ended: "已结束", unselected: "本次未进入" }[tone]
}

function RunIcon({ tone }: { tone: ChainRunTone }) {
  const Icon = { idle: Circle, queued: Clock, running: LoaderCircle, success: Check,
    waiting: Pause, failure: X, skipped: Minus, ended: Pause, unselected: Minus }[tone]
  return <Icon className="chain-run-icon" size={12} aria-hidden="true" />
}
