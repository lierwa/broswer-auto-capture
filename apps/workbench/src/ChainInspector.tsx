import { Badge } from "@radix-ui/themes"
import { useEffect, useRef, useState } from "react"
import { nodeBindings, type ChainNode, type ChainPresentation, type ChainStage, type TaskChain } from "@browser-capture/contracts"
import { toneLabel } from "./ChainCanvasNodes.js"
import { actionPresentation, actionTarget, type PresentationChain } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone, stageRunTone } from "./chainWorkbenchProjection.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import { branchRows, currentNodeEvents, loopContext } from "./chainControlProjection.js"
import { orderedExecutionEvents } from "./chainExecutionFacts.js"
import { ChainNodeExecution } from "./ChainNodeExecution.js"

export function ChainInspector({ chain, presentation, stage, node, batch, onClose, preparing, preparationPhase }: {
  chain: PresentationChain; preparing?: boolean; preparationPhase?: "prefix" | "final";
  presentation?: Pick<ChainPresentation, "stages">; stage: ChainStage | null; node: ChainNode | null;
  batch: ReturnType<TaskChainConnection["snapshot"]>["eventBatch"];
  onClose(): void }) {
  const panel = useRef<HTMLElement>(null)
  const [history, setHistory] = useState<{ context: string; sequence: number } | null>(null)
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0 }, [node?.id, stage?.id])
  if (!stage && !node) return <aside className="chain-inspector" aria-label="链路检查器"><p>选择一个阶段或动作查看上下文。</p></aside>
  if (!node && stage) {
    const entry = chain.nodes.find((item) => item.id === stage.entryNodeId)
    const exits = stageExitLabels(stage, chain)
    return <aside ref={panel} className="chain-inspector" aria-label="阶段说明"><header><span>阶段说明</span>
      <button onClick={onClose} aria-label="关闭检查器">×</button></header><h3>{stage.title}</h3><dl>
        <dt>阶段目的</dt><dd>{stage.summary}</dd>
        {preparing ? <><dt>准备状态</dt><dd>{preparationPhase === "final" ? "已生成" : "生成中"}</dd></>
          : <><dt>本次运行</dt><dd>{toneLabel(stageRunTone(stage, batch, chain))}</dd></>}
        <dt>动作数量</dt><dd>{stage.nodeIds.length} 个</dd>
        <dt>已知入口</dt><dd>{entry ? actionPresentation(entry).title : "入口节点未记录"}</dd>
        <dt>真实出口</dt><dd>{exits.join("；") || (preparing ? "尚未生成" : "本阶段没有外部出口")}</dd>
      </dl><details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify(stage, null, 2)}</pre></details>
    </aside>
  }
  const owner = presentation?.stages.find((item) => item.nodeIds.includes(node!.id))
  const outgoing = chain.edges.filter((edge) => edge.from === node!.id).map((edge) => {
    const port = "port" in edge ? edge.port : edge.outcome
    const label = nodePortLabel(node!, port)
    const target = chain.nodes.find((item) => item.id === edge.to)
    return `${label} → ${target ? actionPresentation(target).title : "未记录的后续动作"}`
  })
  const action = actionPresentation(node!)
  const all = orderedExecutionEvents(batch), context = `${batch?.executionId}:${all[0]?.runId}:${node!.id}`
  const selected = history?.context === context ? all.find((item) => item.sequence === history.sequence && item.event.nodeId === node!.id) : null
  const selectedBatch = selected && batch ? { ...batch, events: all.filter((item) => item.sequence <= selected.sequence) } : batch
  const current = currentNodeEvents(node!.id, chain, selectedBatch).at(-1)
  const nodeEvents = all.filter((item) => item.event.nodeId === node!.id).map((item) => item.event)
  const consumers = outputConsumers(node!, chain)
  return <aside ref={panel} className="chain-inspector" aria-label="动作说明"><header><span>动作说明</span>
    <button onClick={onClose} aria-label="关闭检查器">×</button></header><div className="chain-context-path">{owner?.title ?? "动作说明"}</div>
    <h3>{action.title}</h3><Badge>{action.type}</Badge><dl className="chain-action-overview">
      <dt>动作</dt><dd>{action.description}</dd><dt>目标</dt><dd>{actionTarget(node!, chain.nodes)}</dd>
      {!preparing && <><dt>{selected ? "所选历史执行" : "本次运行"}</dt><dd>{toneLabel(nodeRunTone(node!.id, selectedBatch, owner, chain))}</dd></>}
    </dl>{!preparing && <><label className="chain-execution-picker">查看执行记录<select value={selected?.sequence ?? "current"}
      onChange={(event) => setHistory(event.target.value === "current" ? null : { context, sequence: Number(event.target.value) })}>
      <option value="current">当前执行</option>{all.filter((item) => item.event.nodeId === node!.id && item.event.status === "finished")
        .map((item, index) => <option key={item.sequence} value={item.sequence}>历史执行 · 第 {index + 1} 次</option>)}
    </select></label></>}
    <ChainNodeExecution event={current} batch={selectedBatch} nodes={chain.nodes} node={node!} chain={chain}
      preparing={Boolean(preparing)} destinations={consumers} />
    {node!.kind !== "branch" && node!.kind !== "condition" && <section className="chain-node-next"><h4>下一步</h4>
      <p>{outgoing.join("；") || (preparing ? "尚未生成" : "没有已记录的后续动作")}</p></section>}
    {(node!.kind === "branch" || node!.kind === "condition") && <><h4>实际分支</h4><ol>
      {branchRows(node!, chain, selectedBatch).map((row) => <li key={row.port}>{row.label} → {row.target}
        <small>{row.selection === "selected" ? "本次已选" : row.selection === "unselected" ? "本次未选" : "待判定"}</small></li>)}
      </ol>{!current?.event.execution?.input && <p>判断参与值未记录；规则定义不代表实际求值。</p>}</>}
    {node!.kind === "loop" && <dl><dt>循环范围与退出</dt><dd>{loopContext(node!, chain, selectedBatch).join("；")}</dd></dl>}
    {node!.kind === "human" && <section className="chain-node-next"><h4>需要你处理</h4><p>{node!.prompt}</p></section>}
    <NodeCode node={node!} />
    <details><summary>高级信息</summary><pre className="chain-json">{JSON.stringify({ node: node!.kind === "function"
      ? { ...node, source: "见函数代码" } : node, events: nodeEvents }, null, 2)}</pre></details></aside>
}

function outputConsumers(node: ChainNode, chain: PresentationChain) {
  // WHY：只显示公开绑定和写入；同名变量可能有多个 writer，不凭变量读者猜本节点实值已被消费。
  return [...chain.nodes.filter((candidate) => candidate.id !== node.id && nodeBindings(candidate).some((binding) =>
    binding.source === "node" && binding.nodeId === node.id)).map((candidate) => actionPresentation(candidate).title),
    ...(node.writes?.map((write) => `运行变量 ${write.variable}`) ?? [])]
}

function stageExitLabels(stage: ChainStage, chain: Pick<TaskChain, "nodes" | "edges">) {
  return stage.exits.flatMap((exit) => {
    const edge = chain.edges.find((candidate) => candidate.from === exit.sourceNodeId
      && ("port" in candidate ? candidate.port : candidate.outcome) === exit.sourcePort)
    if (!edge) return []
    const source = chain.nodes.find((item) => item.id === exit.sourceNodeId)
    const target = chain.nodes.find((item) => item.id === edge.to)
    const port = nodePortLabel(source, exit.sourcePort, exit.label)
    return [`${port} → ${target ? actionPresentation(target).title : "未记录的后续动作"}`]
  })
}

function nodePortLabel(node: ChainNode | undefined, port: string, fallback?: string) {
  if (node?.kind === "branch" && "cases" in node) {
    const branch = node.cases.find((item) => item.id === port)
    if (branch) return branch.label
  }
  const standard = edgePortLabel(port)
  if (standard && standard !== port) return standard
  return port === "success" ? "成功" : port === "completed" ? "完成" : fallback ?? "其他出口"
}

function NodeCode({ node }: { node: ChainNode }) {
  return <>
    {node.kind === "function" && <details className="chain-function-definition"><summary>函数代码 · JavaScript</summary>
      <pre className="chain-function-source"><code>{node.source || "此版本源码未记录"}</code></pre></details>}
    {node.kind === "llm" && <details><summary>模型提示词</summary><pre className="chain-execution-value">
      {"systemPrompt" in node ? node.systemPrompt : node.instruction}</pre></details>}</>
}
