import { ChevronRight, CornerDownRight } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ActionSample, RunTone, StageSample } from "./chainStageSample.js";

export type StageNodeData = {
  stage: StageSample;
  actions: ActionSample[];
  tone: RunTone;
  previewed: boolean;
  direction: "LR" | "TB";
  onTogglePreview: (id: string) => void;
  onEnter: (id: string) => void;
};
export type ActionNodeData = { action: ActionSample; tone: RunTone; selected: boolean; direction: "LR" | "TB" };
export type TerminalNodeData = { label: string; terminal: "start" | "end"; direction: "LR" | "TB" };
export type StageFlowNode = Node<StageNodeData, "stage">;
export type ActionFlowNode = Node<ActionNodeData, "action">;
export type TerminalFlowNode = Node<TerminalNodeData, "terminal">;

function FlowHandles({ direction }: { direction: "LR" | "TB" }) {
  const horizontal = direction === "LR";
  return <>
    <Handle type="target" position={horizontal ? Position.Left : Position.Top} />
    <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />
  </>;
}

export function StageCard({ data }: NodeProps<StageFlowNode>) {
  return <div className={`proto-stage tone-${data.tone}`}>
    <FlowHandles direction={data.direction} />
    <div className="proto-stage__topline">
      <span className="proto-stage__index">阶段</span>
      <span className={`proto-state proto-state--${data.tone}`}>{toneLabel(data.tone)}</span>
    </div>
    <strong>{data.stage.title}</strong>
    <p>{data.stage.summary}</p>
    <div className="proto-stage__footer">
      <button className="nodrag" onClick={(event) => { event.stopPropagation(); data.onTogglePreview(data.stage.id); }}>
        {data.actions.length} 个动作 <ChevronRight size={13} className={data.previewed ? "rotated" : ""} />
      </button>
      {data.stage.exitSummary && <span>{data.stage.exitSummary}</span>}
    </div>
    {data.previewed && <div className="proto-preview nodrag" onClick={(event) => event.stopPropagation()}>
      <div className="proto-preview__heading"><span>动作摘要</span><small>仅预览，不改变布局</small></div>
      <ol>{data.actions.map((action) => <li key={action.id}><i /><span><b>{action.title}</b><small>{action.summary}</small></span></li>)}</ol>
      <button className="proto-enter" onClick={() => data.onEnter(data.stage.id)}>进入阶段编辑 <CornerDownRight size={14} /></button>
    </div>}
  </div>;
}

export function ActionCard({ data }: NodeProps<ActionFlowNode>) {
  return <div className={`proto-action tone-${data.tone} ${data.selected ? "is-selected" : ""}`}>
    <FlowHandles direction={data.direction} />
    <div><span className="proto-kind">{data.action.kind}</span><span className={`proto-dot proto-dot--${data.tone}`} /></div>
    <strong>{data.action.title}</strong>
    <p>{data.action.summary}</p>
  </div>;
}

export function TerminalCard({ data }: NodeProps<TerminalFlowNode>) {
  const horizontal = data.direction === "LR";
  return <div className={`proto-terminal proto-terminal--${data.terminal}`}>
    {data.terminal === "end" && <Handle type="target" position={horizontal ? Position.Left : Position.Top} />}
    <span />{data.label}
    {data.terminal === "start" && <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} />}
  </div>;
}

function toneLabel(tone: RunTone) {
  return { idle: "待运行", success: "已完成", running: "运行中", waiting: "等待" }[tone];
}
