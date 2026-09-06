import { useMemo } from "react"
import { Badge, Button, Select } from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import { GitBranch } from "lucide-react"
import { DetailPane } from "./DetailPane.js"
import { planSteps, stepGraph, type StepId } from "./chainData.js"

export function ChainView({ step, onStep, theme, selected, onSelect, inspectorOpen, onClose, sample, onSample, active, onPlan }: {
  sample: boolean; onSample: (value: boolean) => void; active: boolean; onPlan: () => void;
  step: StepId; onStep: (step: StepId) => void; theme: "light" | "dark";
  selected: Partial<Record<StepId, number>>; onSelect: (step: StepId, node: number) => void
  inspectorOpen: boolean; onClose: () => void
}) {
  const graph = useMemo(() => stepGraph(step), [step])
  const selectedIndex = selected[step] ?? 0
  const detail = graph.details[selectedIndex]!
  return <section className="artifact-view chain-view" aria-label="抓取链路工作区">
    <header className="view-heading"><h2>抓取链路</h2><Button variant="ghost" color="gray" onClick={() => onSample(!sample)}>{sample ? "收起链路结构样例" : "查看链路结构样例"}</Button></header>
    {!sample ? <div className="empty-chain-canvas"><GitBranch size={28} /><h3>操作链路尚未生成</h3><p>这里将展示当前任务的动作、分支、循环与检查点。</p><Button variant="soft" onClick={onPlan}>查看抓取计划</Button></div> : <>
    <p className="sample-notice">结构样例 · 未验证，不属于当前任务的可执行链路。</p>
    <div className="step-switcher" aria-label="选择链路步骤">{planSteps.map((item, index) => <Button key={item.id} variant={step === item.id ? "soft" : "ghost"} color={step === item.id ? "amber" : "gray"} aria-pressed={step === item.id} onClick={() => onStep(item.id)}><span className="mono">0{index + 1}</span>{item.title}</Button>)}</div>
    <div className="chain-layout view-with-detail">
      <div className="canvas-shell"><div className="canvas-heading"><span>点击节点查看详情</span><Select.Root value={inspectorOpen ? String(selectedIndex) : ""} onValueChange={(value) => onSelect(step, Number(value))}><Select.Trigger aria-label="选择节点" placeholder="选择节点…" /><Select.Content position="popper">{graph.details.map((item, index) => <Select.Item key={index} value={String(index)}>{item.title}</Select.Item>)}</Select.Content></Select.Root></div>
        <div className="flow-canvas" aria-label="抓取链路节点画布">
          {active && <ReactFlow key={step} nodes={graph.nodes.map((node, index) => ({ ...node, selected: inspectorOpen && index === selectedIndex }))} edges={graph.edges}
            colorMode={theme} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.3} maxZoom={1.8}
            nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => onSelect(step, Number(node.id))}
          ><Background gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow>}
        </div>
        <div className="canvas-footer"><span>拖动平移 · 滚轮缩放</span></div>
      </div>
      <DetailPane title="节点详情" open={active && inspectorOpen} onClose={onClose}><div className="detail-content node-inspector"><Badge color="gray">{detail.kind}</Badge><h3>{detail.title}</h3>
        <dl className="detail-list"><div><dt>输入参数</dt><dd className="mono">{detail.input}</dd></div><div><dt>预期输出</dt><dd>{detail.output}</dd></div><div><dt>执行规则</dt><dd>{detail.rule}</dd></div><div><dt>检查 / 终止条件</dt><dd>{detail.finish}</dd></div></dl>
        <details className="validation-note"><summary>验证状态</summary><p>仅展示节点结构，尚未运行浏览器或产生验证证据。</p></details>
      </div></DetailPane>
    </div></>}
  </section>
}
