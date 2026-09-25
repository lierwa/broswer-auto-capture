import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, CircleAlert, GitBranch, PanelRightClose, Play, RotateCcw, Sparkles } from "lucide-react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { actions, actionsForStage, stages, type ActionSample, type RunTone, type StageSample } from "./chainStageSample.js";
import { layoutGraph, type LayoutDirection } from "./dagreLayout.js";
import { ActionCard, StageCard, TerminalCard, type ActionFlowNode, type StageFlowNode, type TerminalFlowNode } from "./PrototypeNodes.js";

type FlowNode = StageFlowNode | ActionFlowNode | TerminalFlowNode;
type RunPhase = "idle" | "starting" | "running" | "complete";
const nodeTypes = { stage: StageCard, action: ActionCard, terminal: TerminalCard } satisfies NodeTypes;
const tabs = ["需求对话", "任务准备", "链路图", "运行结果"];
const requestedFocus = new URLSearchParams(location.search).get("focus");
const initialFocus = stages.some((stage) => stage.id === requestedFocus) ? requestedFocus : null;

export function ChainStagePrototype() {
  const [focusStageId, setFocusStageId] = useState<string | null>(initialFocus);
  const [previewStageId, setPreviewStageId] = useState(initialFocus ? "" : "search-content");
  const [selectedStageId, setSelectedStageId] = useState(initialFocus ?? "search-content");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(initialFocus ? actionsForStage(initialFocus)[3]?.id ?? actionsForStage(initialFocus)[0]?.id ?? null : null);
  const [direction, setDirection] = useState<LayoutDirection>("LR");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [runActionIndex, setRunActionIndex] = useState(-1);
  const [draftValid, setDraftValid] = useState(true);
  const [keyValue, setKeyValue] = useState("Enter");
  const [replacement, setReplacement] = useState<"press" | "click">("press");
  const [targetPicked, setTargetPicked] = useState(false);
  const [notice, setNotice] = useState("交互原型 · 不连接真实运行与发布服务");
  const graph = useMemo(() => focusStageId
    ? buildFocusGraph(focusStageId, direction, selectedActionId, runPhase, runActionIndex)
    : buildOverviewGraph(direction, previewStageId, runPhase, runActionIndex, togglePreview, enterStage),
  [direction, focusStageId, previewStageId, runPhase, runActionIndex, selectedActionId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
  useRunSimulation(runPhase, runActionIndex, setRunPhase, setRunActionIndex, setNotice);

  const focusedStage = stages.find((stage) => stage.id === focusStageId) ?? null;
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? focusedStage;
  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? null;

  function togglePreview(id: string) {
    setSelectedStageId(id);
    setPreviewStageId((current) => current === id ? "" : id);
  }
  function enterStage(id: string) {
    setFocusStageId(id);
    setPreviewStageId("");
    setSelectedStageId(id);
    setSelectedActionId(actionsForStage(id)[0]?.id ?? null);
  }
  function leaveStage() {
    setSelectedActionId(null);
    setFocusStageId(null);
  }
  function startRun() {
    if (runPhase === "starting" || runPhase === "running") return;
    setRunActionIndex(-1);
    setRunPhase("starting");
    setNotice("运行请求已提交，等待服务端接受…");
  }
  function invalidate(message: string) {
    setDraftValid(false);
    setNotice(message);
  }
  function validateDraft() {
    if (replacement === "click" && !targetPicked) {
      setNotice("请先通过浏览器目标选择器确定点击目标");
      return;
    }
    setDraftValid(true);
    setNotice("聚焦验证通过：阶段出口 results-ready 可达");
  }

  return <main className="prototype-shell">
    <header className="prototype-header">
      <div className="prototype-brand"><span>B-A-T</span><b>播放《凡人修仙传》</b><small>已确认需求 · 准备完成</small></div>
      <div className="prototype-actions">
        <label>链路版本 <select defaultValue="v4"><option>v4 · 当前发布</option><option>v3 · 历史版本</option></select></label>
        <span className={`validation-badge ${draftValid ? "is-valid" : "is-invalid"}`}>{draftValid ? <Check size={13} /> : <CircleAlert size={13} />}{draftValid ? "草稿已验证" : "修改后待验证"}</span>
        <button className="button-secondary" onClick={() => setNotice("已恢复草稿最近一次已保存状态")}><RotateCcw size={15} /> 撤销</button>
        <button className="button-secondary" disabled={!draftValid} onClick={() => setNotice("原型反馈：将发布为新的不可变版本 v5")}>发布 v5</button>
        <button className="button-primary" onClick={startRun} disabled={runPhase === "starting" || runPhase === "running"}><Play size={15} fill="currentColor" />{runLabel(runPhase)}</button>
      </div>
    </header>
    <nav className="prototype-tabs" aria-label="任务工作台阶段">
      {tabs.map((tab) => <button key={tab} className={tab === "链路图" ? "is-active" : ""}>{tab}{tab === "任务准备" && <i />}</button>)}
      <span>{notice}</span>
    </nav>
    <section className="prototype-workspace">
      <div className="prototype-canvas">
        <div className="canvas-toolbar">
          <div className="breadcrumb">{focusStageId && <button onClick={leaveStage}><ChevronLeft size={15} />任务链路</button>}<b>{focusedStage ? focusedStage.title : "任务链路"}</b>{focusedStage && <span>聚焦编辑真实动作子图</span>}</div>
          <div><button className={direction === "LR" ? "is-active" : ""} onClick={() => setDirection("LR")}>横向</button><button className={direction === "TB" ? "is-active" : ""} onClick={() => setDirection("TB")}>纵向</button><button onClick={() => setNotice("已按当前层级重新整理布局")}><Sparkles size={13} /> 整理布局</button></div>
        </div>
        <ReactFlow<FlowNode, Edge>
          key={`${focusStageId ?? "overview"}-${direction}`}
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (node.type === "stage") togglePreview(node.id);
            if (node.type === "action") setSelectedActionId(node.id);
          }}
          onNodeDoubleClick={(_, node) => { if (node.type === "stage") enterStage(node.id); }}
          fitView
          fitViewOptions={{ padding: 0.08, minZoom: focusStageId ? 0.72 : 0.68, maxZoom: 1 }}
          minZoom={0.35}
          maxZoom={1.6}
        >
          <Background gap={24} size={1} color="#343934" />
          <Controls position="bottom-left" showInteractive />
          <MiniMap position="bottom-right" pannable zoomable maskColor="rgba(10,12,10,.62)" />
        </ReactFlow>
        {!focusStageId && <div className="canvas-hint"><GitBranch size={14} /> 单击查看一个动作摘要 · 双击进入阶段编辑</div>}
      </div>
      <aside className="prototype-inspector">
        <div className="inspector-title"><span>{selectedAction ? "动作编辑" : "阶段说明"}</span><PanelRightClose size={17} /></div>
        {selectedAction
          ? <ActionInspector action={selectedAction} keyValue={keyValue} replacement={replacement} targetPicked={targetPicked} draftValid={draftValid}
              onKeyChange={(value) => { setKeyValue(value); invalidate("按键已修改；旧验证失效，发布已暂停"); }}
              onReplace={() => { setReplacement("click"); setTargetPicked(false); invalidate("动作已替换为点击；需要选择真实目标并重新验证"); }}
              onPickTarget={() => { setTargetPicked(true); setNotice("已保存浏览器目标描述；未保存 CSS selector"); }}
              onValidate={validateDraft} />
          : selectedStage && <StageInspector stage={selectedStage} onEnter={() => enterStage(selectedStage.id)} />}
      </aside>
    </section>
  </main>;
}

function useRunSimulation(phase: RunPhase, cursor: number, setPhase: (value: RunPhase) => void, setCursor: (value: number) => void, setNotice: (value: string) => void) {
  useEffect(() => {
    if (phase === "starting") {
      const timer = setTimeout(() => { setPhase("running"); setCursor(0); setNotice("运行 #4 已接受 · 正在执行动作 1 / 14"); }, 500);
      return () => clearTimeout(timer);
    }
    if (phase !== "running") return;
    const timer = setTimeout(() => {
      if (cursor >= actions.length - 1) { setPhase("complete"); setNotice("运行 #4 已完成 · 14 / 14 个动作"); return; }
      setCursor(cursor + 1);
      setNotice(`运行 #4 · 正在执行动作 ${cursor + 2} / ${actions.length}`);
    }, 720);
    return () => clearTimeout(timer);
  }, [cursor, phase, setCursor, setNotice, setPhase]);
}

function buildOverviewGraph(direction: LayoutDirection, previewId: string, phase: RunPhase, cursor: number, onTogglePreview: (id: string) => void, onEnter: (id: string) => void) {
  const terminal = (id: string, label: string, end = false): TerminalFlowNode => ({ id, type: "terminal", position: { x: 0, y: 0 }, width: 86, height: 50, data: { label, terminal: end ? "end" : "start", direction } });
  const stageNodes: StageFlowNode[] = stages.map((stage) => ({ id: stage.id, type: "stage", position: { x: 0, y: 0 }, width: 212, height: 132, data: { stage, actions: actionsForStage(stage.id), tone: stageTone(stage, phase, cursor), previewed: previewId === stage.id, direction, onTogglePreview, onEnter } }));
  const nodes: FlowNode[] = [terminal("start", "开始"), ...stageNodes, terminal("end", "完成", true)];
  const order = nodes.map((node) => node.id);
  const edges = order.slice(1).map((target, index) => edge(`overview-${index}`, order[index]!, target, overviewEdgeActive(target, phase, cursor)));
  return { nodes: layoutGraph(nodes, edges, direction), edges };
}

function buildFocusGraph(stageId: string, direction: LayoutDirection, selectedId: string | null, phase: RunPhase, cursor: number) {
  const stageActions = actionsForStage(stageId);
  const terminal = (id: string, label: string, end = false): TerminalFlowNode => ({ id, type: "terminal", position: { x: 0, y: 0 }, width: 94, height: 50, data: { label, terminal: end ? "end" : "start", direction } });
  const actionNodes: ActionFlowNode[] = stageActions.map((action) => ({ id: action.id, type: "action", position: { x: 0, y: 0 }, width: 196, height: 100, data: { action, tone: actionTone(action, phase, cursor), selected: selectedId === action.id, direction } }));
  const nodes: FlowNode[] = [terminal("stage-entry", "阶段入口"), ...actionNodes, terminal("stage-exit", "阶段出口", true)];
  const order = nodes.map((node) => node.id);
  const edges = order.slice(1).map((target, index) => edge(`focus-${index}`, order[index]!, target, target === actions[cursor]?.id));
  return { nodes: layoutGraph(nodes, edges, direction), edges };
}

function edge(id: string, source: string, target: string, active = false): Edge {
  return { id, source, target, type: "smoothstep", animated: active, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 }, style: { stroke: active ? "#e8a62a" : "#66706a", strokeWidth: active ? 2.2 : 1.35 } };
}

function stageTone(stage: StageSample, phase: RunPhase, cursor: number): RunTone {
  if (phase === "idle" || phase === "starting") return "idle";
  if (phase === "complete") return "success";
  const indices = stage.actionIds.map((id) => actions.findIndex((action) => action.id === id));
  if (cursor > Math.max(...indices)) return "success";
  if (indices.includes(cursor)) return "running";
  return "idle";
}

function actionTone(action: ActionSample, phase: RunPhase, cursor: number): RunTone {
  if (phase === "complete") return "success";
  if (phase !== "running") return "idle";
  const index = actions.findIndex((item) => item.id === action.id);
  if (index < cursor) return "success";
  return index === cursor ? "running" : "idle";
}

function overviewEdgeActive(target: string, phase: RunPhase, cursor: number) {
  if (phase !== "running") return false;
  const stage = stages.find((item) => item.id === target);
  return Boolean(stage?.actionIds.includes(actions[cursor]?.id ?? ""));
}

function runLabel(phase: RunPhase) {
  return { idle: "再次运行", starting: "正在启动…", running: "运行中", complete: "再次运行" }[phase];
}

type InspectorProps = {
  action: ActionSample; keyValue: string; replacement: "press" | "click"; targetPicked: boolean; draftValid: boolean;
  onKeyChange: (value: string) => void; onReplace: () => void; onPickTarget: () => void; onValidate: () => void;
};

function ActionInspector(props: InspectorProps) {
  const index = actionsForStage(props.action.stageId).findIndex((item) => item.id === props.action.id);
  const siblings = actionsForStage(props.action.stageId);
  const stage = stages.find((item) => item.id === props.action.stageId)!;
  return <div className="inspector-body">
    <div className="context-path"><span>{stage.title}</span><b>›</b><strong>{props.action.title}</strong></div>
    <h2>{props.action.title}</h2><p className="inspector-summary">{props.action.summary}</p>
    <section><h3>动作上下文</h3><div className="context-grid"><small>上一动作</small><span>{siblings[index - 1]?.title ?? "阶段入口"}</span><small>下一动作</small><span>{siblings[index + 1]?.title ?? "阶段出口"}</span></div></section>
    <section><h3>执行闭环</h3><div className="condition"><small>执行前</small><p>{props.action.precondition}</p></div><div className="condition condition--result"><small>必须达到</small><p>{props.action.postcondition}</p></div></section>
    {props.action.id === "submit-search" ? <section><h3>动作设置</h3>
      {props.replacement === "press" ? <><label className="field-label">按键<select value={props.keyValue} onChange={(event) => props.onKeyChange(event.target.value)}><option>Enter</option><option>Tab</option><option>Escape</option><option>Ctrl+Enter</option></select></label><button className="text-action" onClick={props.onReplace}>替换为另一种动作，例如点击</button></>
        : <><div className="replacement-card"><span>点击</span><p>{props.targetPicked ? "搜索按钮（浏览器目标描述已保存）" : "尚未选择点击目标"}</p></div><button className="target-button" onClick={props.onPickTarget}>{props.targetPicked ? "重新选择浏览器目标" : "在浏览器中选择目标"}</button><small className="field-help">不要求填写 CSS selector；选择器由浏览器能力保存为稳定目标事实。</small></>}
    </section> : <section><h3>动作设置</h3><div className="readonly-setting"><span>{props.action.kind}</span><p>{props.action.summary}</p></div></section>}
    <div className={`validation-panel ${props.draftValid ? "is-valid" : "is-invalid"}`}><div>{props.draftValid ? <Check size={16} /> : <CircleAlert size={16} />}<span><b>{props.draftValid ? "聚焦验证有效" : "修改后验证失效"}</b><small>{props.draftValid ? "阶段后置条件与出口已证明可达" : "重新验证前不能发布新版本"}</small></span></div><button onClick={props.onValidate}>运行聚焦验证</button></div>
  </div>;
}

function StageInspector({ stage, onEnter }: { stage: StageSample; onEnter: () => void }) {
  return <div className="inspector-body"><div className="stage-number">链路阶段 · {stages.findIndex((item) => item.id === stage.id) + 1}</div><h2>{stage.title}</h2><p className="inspector-summary">{stage.summary}</p><section><h3>阶段边界</h3><div className="context-grid"><small>逻辑入口</small><span>{actionsForStage(stage.id)[0]?.precondition}</span><small>具名出口</small><span>{actionsForStage(stage.id).at(-1)?.postcondition}</span></div></section><section><h3>包含的真实动作</h3><ol className="inspector-actions">{actionsForStage(stage.id).map((action) => <li key={action.id}><span>{action.kind}</span>{action.title}</li>)}</ol></section><button className="button-primary inspector-enter" onClick={onEnter}>进入阶段编辑真实子图</button><p className="inspector-note">阶段不是运行节点；它只引用同一 TaskChain 中的动作与边。</p></div>;
}
