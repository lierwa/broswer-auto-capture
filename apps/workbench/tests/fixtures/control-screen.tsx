// Headless 局部视觉核验：生产组件与真实 materializer/runtime 结果，测试页面不接产品写接口。
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { Button, Theme } from "@radix-ui/themes"
import { Background, ReactFlow } from "@xyflow/react"
import "@radix-ui/themes/styles.css"
import "@xyflow/react/dist/style.css"
import "../../src/styles.css"
import "../../src/chain-workbench.css"
import "../../src/execution-result.css"
import type { ChainPresentation, TaskChain, TaskExecutionEventBatch, TaskRun } from "@browser-capture/contracts"
import { buildCanvasGraph, selectCanvasNodes } from "../../src/ChainCanvasGraph.js"
import { StageCanvasCard, TerminalCanvasCard } from "../../src/ChainCanvasNodes.js"
import { ChainInspector } from "../../src/ChainInspector.js"

const params = new URLSearchParams(location.search)
const full = params.get("full") === "1"
const url = params.get("evidence")
if (!url) throw new Error("explicit_evidence_file_required")
const source: { chain: TaskChain; presentation: ChainPresentation; run: TaskRun; snapshots: TaskRun[] } = await fetch(url).then(r => r.json())
// WHY：极端文字只在独立展示夹具中构造，真实来源、运行事件和产品持久记录不改写。
const evidence = params.get("long") === "1" ? { ...source, chain: { ...source.chain,
  nodes: source.chain.nodes.map(node => node.kind === "terminal" ? node : { ...node,
    label: `${node.label}：${"根据当前输入读取内容、核对条件并保存本次处理结果。".repeat(6)}` }) } } : source
const snapshots = {
  running: evidence.snapshots.find(run => run.events.at(-1)?.nodeId === "s-advance" && run.events.at(-1)?.status === "started")!,
  next: evidence.snapshots.find(run => run.events.filter(event => event.nodeId === "first-repeat-r1" && event.status === "finished").length === 2)!,
  complete: evidence.run,
}
function Screen() {
  const [mode, setMode] = useState<keyof typeof snapshots>("running")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [selected, setSelected] = useState<string | null>(null)
  const run = snapshots[mode]
  const batch: TaskExecutionEventBatch = { executionId: run.binding.authorizationId, executionSequence: run.events.length,
    status: run.status, after: 0, next: run.events.length, events: run.events.map((event, index) => ({ event,
      executionId: run.binding.authorizationId, sequence: index + 1, stepId: evidence.chain.stepId,
      runId: run.binding.runId, runSequence: 1 })) }
  const graph = buildCanvasGraph(evidence.chain, evidence.presentation, batch, setSelected)
  const stage = graph.nodes.find(node => node.type === "chain-stage" && node.data.items.some(item => item.body))!
  // 默认只裁取真实主节点供手机查看；完整图用于起止节点与边的几何回归。
  const nodes = selectCanvasNodes(full ? graph.nodes : [stage], selected, null, null)
  const node = evidence.chain.nodes.find(node => node.id === selected)
  return <Theme appearance={theme} accentColor="amber" grayColor="sand" radius="medium">
    <main className="app-shell chain-workbench" data-theme={theme} style={{ width: "100vw", height: "100vh" }}>
      <header style={{ display: "flex", gap: 8, padding: 16, alignItems: "center" }}>
        <span style={{ flex: 1, fontSize: 12 }}>实际链路组件 · 执行器事件</span>
        {Object.keys(snapshots).map(key => <Button key={key} size="1" variant={key === mode ? "solid" : "soft"}
          onClick={() => setMode(key as keyof typeof snapshots)}>{({ running: "动作执行中", next: "下一轮", complete: "已结束" })[key as keyof typeof snapshots]}</Button>)}
        <Button size="1" variant="soft" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>切换主题</Button>
      </header>
      <div className="chain-layout" data-inspector-open={Boolean(node)}>
        <ReactFlow nodes={nodes} edges={full ? graph.edges : []} nodeTypes={{ "chain-stage": StageCanvasCard, "chain-terminal": TerminalCanvasCard }}
          colorMode={theme} fitView fitViewOptions={{ padding: .12, maxZoom: 1, minZoom: 1 }} minZoom={1} maxZoom={1}
          nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null}><Background gap={24} /></ReactFlow>
        {node && <ChainInspector chain={evidence.chain} node={node} stage={null} batch={batch} onClose={() => setSelected(null)} />}
      </div>
    </main>
  </Theme>
}
createRoot(document.getElementById("root")!).render(<Screen />)
