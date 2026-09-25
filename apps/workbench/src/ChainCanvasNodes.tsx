import { ChevronRight, CornerDownRight } from "lucide-react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { ChainRunTone } from "./chainWorkbenchProjection.js"

export type StageCanvasData = Record<string, unknown> & {
  title: string; summary: string; actionCount: number; actionLabels: string[]; completedCount: number; skippedCount: number; order: number;
  tone: ChainRunTone; previewed: boolean; direction: ChainLayoutDirection;
  onPreview(id: string): void; onEnter(id: string): void;
}
export type ActionCanvasData = Record<string, unknown> & {
  title: string; family: string; operation: string; tone: ChainRunTone; direction: ChainLayoutDirection;
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
  return <article className="chain-stage-card" data-tone={data.tone}
    onDoubleClickCapture={(event) => { event.stopPropagation(); data.onEnter(id) }}>
    <Handles direction={data.direction} />
    <header><span>阶段 {String(data.order).padStart(2, "0")}</span><strong>{toneLabel(data.tone)}</strong></header>
    <h3>{data.title}</h3><p>{data.summary}</p>
    <footer><button className="nodrag" onClick={(event) => { event.stopPropagation(); data.onPreview(id) }}>
      {data.tone === "idle" ? `${data.actionCount} 个动作` : `${data.completedCount}/${data.actionCount} 已完成`}
      <ChevronRight size={13} aria-hidden="true" data-open={data.previewed} /></button>
      <button className="nodrag" onClick={(event) => { event.stopPropagation(); data.onEnter(id) }}>展开动作 <CornerDownRight size={13} /></button></footer>
    {data.previewed && <section className="chain-stage-preview nodrag" onClick={(event) => event.stopPropagation()}>
      <small>阶段动作{data.skippedCount ? ` · ${data.skippedCount} 个未执行` : ""}</small><ol>{data.actionLabels.map((label, index) => <li key={`${index}:${label}`}>{label}</li>)}</ol>
      <button onClick={() => data.onEnter(id)}>进入阶段 <CornerDownRight size={13} aria-hidden="true" /></button>
    </section>}
  </article>
}

export function ActionCanvasCard({ data }: NodeProps<ActionCanvasNode>) {
  return <article className="chain-action-card" data-tone={data.tone}>
    <Handles direction={data.direction} /><header><span>{data.family}</span><i aria-hidden="true" /></header>
    <h3>{data.title}</h3><p>{data.operation}</p><small>{toneLabel(data.tone)}</small>
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
