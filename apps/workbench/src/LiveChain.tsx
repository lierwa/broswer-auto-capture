import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select, TextArea } from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import type { ChainNode, TaskChain, TaskRun } from "@browser-capture/contracts"
import { DetailPane } from "./DetailPane.js"
import { sha256 } from "./Plan.js"
import { chainFamilyLabels, chainOperation, isStaleVersion, projectChainGraph, runsForChain } from "./taskChainProjection.js"
import { TaskChainConnection } from "./taskChainConnection.js"

export function LiveChain({ connection, active, theme, onPlan }: { connection: TaskChainConnection; active: boolean;
  theme: "light" | "dark"; onPlan(): void }) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [planKey, setPlanKey] = useState<string | null>(null), [stepId, setStepId] = useState<string | null>(null)
  const [version, setVersion] = useState<number | null>(null), [nodeId, setNodeId] = useState<string | null>(null)
  const [validationInput, setValidationInput] = useState("{}"), [inputError, setInputError] = useState("")
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [active, connection])
  const state = view.state, plans = state?.plans.toSorted((left, right) => right.version - left.version) ?? []
  const plan = plans.find((item) => `${item.id}:${item.version}` === planKey) ?? plans[0]
  const step = plan?.steps.find((item) => item.id === stepId) ?? plan?.steps[0]
  const versions = state && plan && step ? state.chains.filter((chain) => chain.plan.id === plan.id
    && chain.plan.version === plan.version && chain.stepId === step.id).toSorted((left, right) => right.version - left.version) : []
  const chain = versions.find((item) => item.version === version) ?? versions[0]
  const stale = chain ? isStaleVersion(state!, "chain", chain.id, chain.version) : false
  const graph = useMemo(() => chain ? projectChainGraph(chain, state?.runs ?? []) : { nodes: [], edges: [] }, [chain, state?.runs])
  const chainRuns = chain ? runsForChain(state?.runs ?? [], chain) : [], latestChainRun = chainRuns.at(-1)
  const selectedNode = chain?.nodes.find((node) => node.id === nodeId)
  if (!state) return <section className="artifact-view"><p role="status">{view.error || "正在读取任务链路…"}</p><Button onClick={() => void connection.reload()}>重新连接</Button></section>
  return <section className="artifact-view chain-view" aria-label="任务链路工作区">
    <header className="view-heading"><h2>任务链路</h2><Button variant="ghost" onClick={onPlan}>查看计划</Button></header>
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Button onClick={() => void connection.reload()}>重新连接</Button></Callout.Root>}
    {!plan || !step ? <div className="stage-empty"><h3>尚无计划步骤</h3><p>确认需求并生成计划后，这里显示真实候选链路和验证证据。</p></div> : <>
      <Flex gap="2" wrap="wrap" my="3"><Select.Root value={`${plan.id}:${plan.version}`} onValueChange={(value) => { setPlanKey(value); setStepId(null); setVersion(null); setNodeId(null) }}><Select.Trigger aria-label="链路所属计划" /><Select.Content>{plans.map((item) => <Select.Item key={`${item.id}:${item.version}`} value={`${item.id}:${item.version}`}>计划 v{item.version}</Select.Item>)}</Select.Content></Select.Root>
        <Select.Root value={step.id} onValueChange={(value) => { setStepId(value); setVersion(null); setNodeId(null) }}><Select.Trigger aria-label="计划步骤" /><Select.Content>{plan.steps.map((item) => <Select.Item key={item.id} value={item.id}>{item.title}</Select.Item>)}</Select.Content></Select.Root></Flex>
      {!chain ? <div className="empty-chain-canvas"><h3>“{step.title}”尚无候选链路</h3><p>回到计划生成该步骤的参数化候选链路。</p></div> : <>
        <Flex gap="2" wrap="wrap" my="3"><Select.Root value={String(chain.version)} onValueChange={(value) => { setVersion(Number(value)); setNodeId(null) }}><Select.Trigger aria-label="链路版本" /><Select.Content>{versions.map((item) => <Select.Item key={item.version} value={String(item.version)}>链路 v{item.version}</Select.Item>)}</Select.Content></Select.Root>
          <Badge color={chain.validation.status === "verified" ? "green" : "amber"}>{chain.validation.status === "verified" ? "不同输入验证通过" : "候选链路"}</Badge>
          {stale && <Badge color="amber">历史只读</Badge>}</Flex>
        <p>编译结构说明：{chain.implementationSummary}</p>
        <p>底层浏览器命令以每次运行事实为准{latestChainRun ? `；最近一次实际消费 ${latestChainRun.consumed.browserCommands} 条。` : "。"}</p>
        <div className="chain-layout view-with-detail"><div className="canvas-shell"><div className="canvas-heading"><span>{chain.reuseBoundary.description}</span></div>
          <div className="flow-canvas" aria-label="任务链路节点画布">{active && <ReactFlow key={`${chain.id}:${chain.version}`} nodes={graph.nodes.map((item) => ({ ...item, selected: item.id === nodeId }))} edges={graph.edges} colorMode={theme} fitView minZoom={0.2} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, item) => setNodeId(item.id)}><Background gap={24} /><Controls showInteractive={false} /></ReactFlow>}</div>
          <div className="canvas-footer">{chain.completion.map((item) => item.description).join(" · ")}</div></div>
          <DetailPane title="节点详情" open={active && Boolean(selectedNode)} onClose={() => setNodeId(null)}>{selectedNode && <NodeDetail node={selectedNode} runs={chainRuns} />}</DetailPane></div>
        <div className="action-gate"><h3>验证可复用边界</h3><p>先用一个代表输入运行候选链路，再用不同输入由普通运行器验证。两次均保存独立运行、输出摘要和模型调用数。</p>
          <TextArea aria-label="链路验证输入 JSON" value={validationInput} onChange={(event) => setValidationInput(event.target.value)} rows={5} />{inputError && <p className="error-text">{inputError}</p>}
          <Flex gap="2"><Button disabled={view.busy || stale} onClick={() => validate(connection, chain, "sample", validationInput, setInputError)}>运行代表样本</Button>
            <Button variant="soft" disabled={view.busy || stale || !chain.validation.evidence.some((item) => item.phase === "sample" && item.passed)} onClick={() => validate(connection, chain, "verification", validationInput, setInputError)}>用不同输入验证</Button></Flex></div>
        <ValidationEvidence chain={chain} runs={chainRuns} />
      </>}
    </>}
  </section>
}

function NodeDetail({ node, runs }: { node: ChainNode; runs: TaskRun[] }) {
  const events = runs.flatMap((run) => run.events.filter((event) => event.nodeId === node.id)).slice(-12)
  return <div className="detail-content node-inspector"><Badge>{chainFamilyLabels[node.kind]}</Badge><Badge color="gray">{chainOperation(node)}</Badge><h3>{node.label}</h3>
    <pre className="chain-json">{JSON.stringify(node, null, 2)}</pre>{events.map((event) => <p key={`${event.invocationId}:${event.sequence}`}>{event.status} · {event.outcome ?? "等待结果"} · {event.at}</p>)}</div>
}
function ValidationEvidence({ chain, runs }: { chain: TaskChain; runs: TaskRun[] }) {
  return <details className="supporting-detail"><summary>验证、预算与审计</summary>{chain.validation.evidence.length ? chain.validation.evidence.map((item) => {
    const run = runs.find((candidate) => candidate.binding.runId === item.runId)
    return <p key={item.runId}>{item.phase === "sample" ? "代表样本" : "不同输入"} · {item.passed ? "通过" : "未通过"} · 浏览器命令 {run?.consumed.browserCommands ?? "未知"} · 模型调用 {item.modelCalls === null ? "未知" : item.modelCalls}</p>
  }) : <p>尚无真实运行证据。</p>}
    <p>复用假设：{chain.reuseBoundary.assumptions.join("；")}</p><p>失效条件：{chain.reuseBoundary.invalidationConditions.join("；")}</p>
    {runs.flatMap((run) => run.modelCalls).map((audit) => <p key={audit.callId}>显式模型 · {audit.model} · {audit.status} · {audit.reportedInvocations ?? "调用数未知"}</p>)}</details>
}
function validate(connection: TaskChainConnection, chain: TaskChain, mode: "sample" | "verification", raw: string,
  setError: (value: string) => void) {
  try {
    const input: unknown = JSON.parse(raw); setError("")
    const executable = { ...chain, validation: { status: "candidate", evidence: [] } }
    void sha256(JSON.stringify(executable)).then((digest) => connection.dispatch({ type: "validate_chain", requestId: crypto.randomUUID(),
      chain: { id: chain.id, version: chain.version, digest }, mode, input }))
  } catch { setError("请输入有效 JSON。") }
}
