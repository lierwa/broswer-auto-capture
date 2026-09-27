import { CornerDownRight } from "lucide-react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"

export type StageCanvasData = Record<string, unknown> & {
  title: string; summary: string; tone: ChainRunTone; direction: ChainLayoutDirection;
  onEnter(id: string): void;
}
export type ActionCanvasData = Record<string, unknown> & {
  title: string; tone: ChainRunTone; direction: ChainLayoutDirection;
  onInspect(id: string): void;
}
export type TerminalCanvasData = Record<string, unknown> & {
  label: string; terminal: "start" | "end"; tone: ChainRunTone; direction: ChainLayoutDirection;
}
export type StageCanvasNode = Node<StageCanvasData, "chain-stage">
export type ActionCanvasNode = Node<ActionCanvasData, "chain-action">
export type TerminalCanvasNode = Node<TerminalCanvasData, "chain-terminal">

function Handles({ direction }: { direction: ChainLayoutDirection }) {
  const horizontal = direction === "LR"
  return <><Handle type="target" position={horizontal ? Position.Left : Position.Top} />
    <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} /></>
}

export function StageCanvasCard({ id, data }: NodeProps<StageCanvasNode>) {
  return <article className="chain-stage-card" data-tone={data.tone}>
    <Handles direction={data.direction} />
    {data.tone !== "idle" && <header><strong>{toneLabel(data.tone)}</strong></header>}
    <h3>{data.title}</h3><p>{data.summary}</p>
    <footer><button className="nodrag" onClick={(event) => { event.stopPropagation(); data.onEnter(id) }}>
      展开动作 <CornerDownRight size={13} aria-hidden="true" /></button></footer>
  </article>
}

export function ActionCanvasCard({ id, data }: NodeProps<ActionCanvasNode>) {
  // WHY：React Flow 的键盘选择不调用 onNodeClick，详情入口复用原生按钮的键盘语义。
  return <article className="chain-action-card" data-tone={data.tone}>
    <Handles direction={data.direction} /><h3><button type="button" className="nodrag"
      aria-label={`查看动作：${data.title}`}
      onClick={(event) => { event.stopPropagation(); data.onInspect(id) }}>{data.title}</button></h3>
    {data.tone !== "idle" && <small>{toneLabel(data.tone)}</small>}
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
