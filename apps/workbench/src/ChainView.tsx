import { useMemo } from "react"
import { Badge, Button } from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import { GitBranch, Scan } from "lucide-react"
import { planSteps, stepGraph, type StepId } from "./chainData.js"

export function ChainView({ step, onStep, theme, selected, onSelect }: {
  step: StepId; onStep: (step: StepId) => void; theme: "light" | "dark";
  selected: Partial<Record<StepId, number>>; onSelect: (step: StepId, node: number) => void
}) {
  const graph = useMemo(() => stepGraph(step), [step])
  const selectedIndex = selected[step] ?? 0
  const detail = graph.details[selectedIndex]!
  return <section className="artifact-view chain-view" aria-label="抓取链路工作区">
    <header className="view-heading"><div><p className="eyebrow">WORKFLOW / NODE INSPECTOR</p><h2>抓取链路</h2></div><Badge color="amber" variant="outline">结构样例 · 尚未探索与验证</Badge></header>
    <p className="muted">每个计划步骤对应一条链路。可随时查看节点与条件；实际可执行版本需由真实探索产生。</p>
    <div className="step-switcher" aria-label="选择链路步骤">{planSteps.map((item, index) => <Button key={item.id} variant={step === item.id ? "soft" : "ghost"} color={step === item.id ? "amber" : "gray"} aria-pressed={step === item.id} onClick={() => onStep(item.id)}><span className="mono">0{index + 1}</span>{item.title}</Button>)}</div>
    <div className="chain-layout">
      <div className="canvas-shell"><div className="canvas-heading"><span><GitBranch size={14} /> {planSteps.find((item) => item.id === step)!.title}</span><span>{graph.nodes.length} 节点 · 示例 v1</span></div>
        <div className="flow-canvas" aria-label="抓取链路节点画布">
          <ReactFlow key={step} nodes={graph.nodes.map((node, index) => ({ ...node, selected: index === selectedIndex }))} edges={graph.edges}
            colorMode={theme} fitView fitViewOptions={{ padding: 0.16 }} minZoom={0.3} maxZoom={1.8}
            nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => onSelect(step, Number(node.id))}
          ><Background gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow>
        </div>
        <div className="canvas-footer"><span>拖动画布平移 · 滚轮缩放 · 点击节点检查</span><span>普通动作无隐式模型调用</span></div>
      </div>
      <aside className="node-details" aria-label="节点详情"><div className="section-kicker"><span><Scan size={14} /> 节点检查</span><Badge size="1" color="gray">{detail.kind}</Badge></div><h3>{detail.title}</h3>
        <label className="field-label" htmlFor="node-selector">选择节点</label><select id="node-selector" value={selectedIndex} onChange={(event) => onSelect(step, Number(event.target.value))}>{graph.details.map((item, index) => <option key={index} value={index}>{item.title}</option>)}</select>
        <dl className="detail-list"><div><dt>输入参数</dt><dd className="mono">{detail.input}</dd></div><div><dt>预期输出</dt><dd>{detail.output}</dd></div><div><dt>执行规则</dt><dd>{detail.rule}</dd></div><div><dt>检查 / 终止条件</dt><dd>{detail.finish}</dd></div></dl>
        <div className="validation-note"><strong>验证证据尚未产生</strong><p>当前仅展示节点结构；没有运行选择器、浏览器动作或模型调用。</p></div>
      </aside>
    </div>
  </section>
}
