import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import type { ActionNode, ChainRecord } from "@browser-capture/contracts/chain"
import { ChainConnection } from "./chainConnection.js"
import { DetailPane } from "./DetailPane.js"

export const chainLabels = { exploring: "正在探索", compiled: "已编译 · 待验证", validating: "正在验证", verified: "换输入验证通过", failed: "步骤未通过", budget_exceeded: "步骤预算已用尽", manual_required: "等待人工处理", cancelled: "已停止", interrupted: "探索已中断" }
function successors(node: ActionNode) {
  if (node.kind === "finish" || node.kind === "stop") return []
  if (node.kind === "branch") return [{ id: node.present, label: "满足" }, { id: node.absent, label: "不满足" }]
  if (node.kind === "branch_target") return [{ id: node.available, label: "控件可用" }, { id: node.unavailable, label: "控件不可用" }]
  if (node.kind === "branch_page_changed") return [{ id: node.changed, label: "页面变化" }, { id: node.unchanged, label: "页面未变化" }]
  if (node.kind === "loop") return [{ id: node.body, label: "继续" }, { id: node.exhausted, label: "预算闸门" }]
  return [{ id: node.next, label: "" }]
}
export function liveGraph(record: ChainRecord) {
  return {
    nodes: (record.graph?.nodes ?? []).map((node, index) => {
      const event = record.events.filter((item) => item.nodeId === node.id).at(-1)
      return { id: node.id, position: { x: index % 2 * 260, y: Math.floor(index / 2) * 125 },
        data: { label: `${node.label}\n${node.kind} · ${event ? { running: "运行中", passed: "已通过", failed: "未通过" }[event.status] : "未运行"}` },
        className: `capture-node capture-node-${event?.status ?? "pending"}`, type: node.kind === "finish" ? "output" : "default" }
    }),
    edges: (record.graph?.nodes ?? []).flatMap((node) => successors(node).map((next, index) => ({ id: `${node.id}-${index}`, source: node.id, target: next.id, label: next.label, type: "smoothstep" }))),
  }
}
export function LiveChain({ taskId, active, theme, onPlan }: { taskId: string; active: boolean; theme: "light" | "dark"; onPlan: () => void }) {
  const connection = useMemo(() => new ChainConnection(taskId), [taskId]), view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [planId, setPlanId] = useState<string | null>(null), [stepId, setStepId] = useState<string | null>(null), [versionId, setVersionId] = useState<string | null>(null), [nodeId, setNodeId] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [connection, active])
  const state = view.state, plan = state?.plans.find((item) => item.id === planId) ?? state?.plans[0], step = plan?.steps.find((item) => item.id === stepId) ?? plan?.steps[0]
  const versions = state?.records.filter((item) => item.planId === plan?.id && item.stepId === step?.id) ?? [], record = versions.find((item) => item.id === versionId) ?? versions[0]
  const graph = useMemo(() => record ? liveGraph(record) : { nodes: [], edges: [] }, [record]), node = record?.graph?.nodes.find((item) => item.id === nodeId)
  return <>
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Button size="1" onClick={() => void connection.reload()}>重新连接</Button></Callout.Root>}
    {!state && !view.error && <p role="status">正在读取链路与验证事实…</p>}
    {state && <>
      <Flex gap="2" wrap="wrap" my="3">{plan && <Select.Root value={plan.id} onValueChange={(id) => { setPlanId(id); setStepId(null); setVersionId(null); setNodeId(null) }}><Select.Trigger aria-label="链路所属计划" /><Select.Content>{state.plans.map((item) => <Select.Item key={item.id} value={item.id}>计划 v{item.version}</Select.Item>)}</Select.Content></Select.Root>}
        <Button variant="soft" onClick={onPlan}>查看计划与授权</Button></Flex>
      {plan && <div className="step-switcher" aria-label="实际计划步骤">{plan.steps.map((item) => <Button key={item.id} variant={step?.id === item.id ? "soft" : "ghost"} aria-pressed={step?.id === item.id} onClick={() => { setStepId(item.id); setVersionId(null); setNodeId(null) }}>{item.title}</Button>)}</div>}
      {!record ? <div className="empty-chain-canvas"><h3>操作链路尚未生成</h3><p>{step ? `${step.title}：等待授权探索或前置步骤验证。` : "正式计划授权后，这里展示实际动作、分支、循环及验证证据。"}</p></div> : <>
        <Flex gap="2" wrap="wrap" my="3"><Badge color={record.status === "verified" ? "green" : "amber"}>{chainLabels[record.status]}</Badge>{state.staleIds.includes(record.id) && <Badge color="amber">绑定已变更 · 待复核</Badge>}
          <Select.Root value={record.id} onValueChange={(id) => { setVersionId(id); setNodeId(null) }}><Select.Trigger aria-label="步骤链路版本" /><Select.Content>{versions.map((item) => <Select.Item key={item.id} value={item.id}>链路 v{item.version} · {chainLabels[item.status]}</Select.Item>)}</Select.Content></Select.Root></Flex>
        <p role="status">{record.reason}</p>
        {record.graph && <div className="chain-layout view-with-detail"><div className="canvas-shell"><div className="canvas-heading"><span>{record.graph.coverage}</span><Select.Root value={node?.id ?? ""} onValueChange={setNodeId}><Select.Trigger aria-label="选择实际节点" placeholder="选择节点…" /><Select.Content>{record.graph.nodes.map((item) => <Select.Item key={item.id} value={item.id}>{item.label}</Select.Item>)}</Select.Content></Select.Root></div>
          <div className="flow-canvas" aria-label="真实链路节点画布">{active && <ReactFlow key={record.id} nodes={graph.nodes.map((item) => ({ ...item, selected: item.id === nodeId }))} edges={graph.edges} colorMode={theme} fitView minZoom={0.2} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, item) => setNodeId(item.id)}><Background gap={24} /><Controls showInteractive={false} /></ReactFlow>}</div>
          <div className="canvas-footer">{record.graph.completion}</div></div>
          <DetailPane title="实际节点详情" open={active && Boolean(node)} onClose={() => setNodeId(null)}>{node && <div className="detail-content node-inspector"><Badge>{node.kind}</Badge><h3>{node.label}</h3><pre className="chain-json">{JSON.stringify(node, null, 2)}</pre>{record.events.filter((item) => item.nodeId === node.id).slice(-10).map((item, index) => <p key={index}>{item.phase === "sample" ? "样本" : "换输入"} · {item.status} · {item.detail}</p>)}</div>}</DetailPane></div>}
        <ChainEvidence record={record} />
      </>}
    </>}
  </>
}
function ChainEvidence({ record }: { record: ChainRecord }) {
  return <details className="supporting-detail"><summary>验证输入、输出与调用审计</summary>
    <p>本阶段每个输入最多验证 2 个检查点；全量执行仍按链路的完整循环与终止条件进行。</p>
    {record.validationOutcomes.map((outcome) => <p key={outcome.phase}>{outcome.phase === "sample" ? "样本" : "换输入"}：{outcome.bounded ? "代表验证窗口结束" : "到达链路终止"} · {outcome.rows} 条</p>)}
    {record.failureCode && <p>诊断：{record.failureCode}</p>}
    <details><summary>探索判断</summary>{record.decisions.map((decision, index) => <p key={index}>{decision.reason}</p>)}</details>
    <p>底层命令 {record.consumed.commands} 条 · 模型调用意图 {record.consumed.modelCalls} 次 · {Math.round(record.consumed.elapsedMs / 1000)} 秒</p>
    <p>样本：{record.sample?.url ?? "尚未选定"} {record.sample?.value} · {record.sampleRows.length} 条<br />换输入：{record.verification?.url ?? "尚未选定"} {record.verification?.value} · {record.verificationRows.length} 条</p>
    {record.audits.map((audit, index) => <p key={index}>{audit.purpose === "exploration" ? "首次探索" : "显式 LLM 节点"} · {audit.model}/{audit.effort} · {audit.phase} · {audit.invocations === null ? "调用次数未回报" : `${audit.invocations} 次已回报调用`}</p>)}
    <details><summary>样本输出</summary><pre className="chain-json">{JSON.stringify({ sample: record.sampleRows, verification: record.verificationRows }, null, 2)}</pre></details>
  </details>
}
