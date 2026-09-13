import { useEffect, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import type { TaskRun } from "@browser-capture/contracts"
import type { TaskExecution } from "@browser-capture/contracts/api"
import { DetailPane } from "./DetailPane.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

const statusLabels: Record<TaskExecution["status"], string> = { queued: "排队中", running: "执行中", completed: "已完成",
  partial: "部分完成", waiting_for_human: "等待人工", paused: "已暂停", blocked: "受阻", failed: "失败",
  cancelled: "已取消", stale: "版本已失效" }

export function Results({ taskId, readOnly, connection, active, onPlan }: { taskId: string; readOnly: boolean;
  connection: TaskChainConnection; active: boolean; onPlan(): void }) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [selected, setSelected] = useState<string | null>(null), [detailRunId, setDetailRunId] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [active, connection])
  const state = view.state, executions = state?.executions.toReversed() ?? []
  const execution = executions.find((item) => item.id === selected) ?? executions[0]
  const runs = execution && state ? state.runs.filter((run) => run.binding.authorizationId === execution.authorizationId) : []
  const detail = runs.find((run) => run.binding.runId === detailRunId)
  if (!state) return <section className="artifact-view"><p role="status">{view.error || "正在读取运行结果…"}</p><Button onClick={() => void connection.reload()}>重新连接</Button></section>
  return <div className="view-with-detail"><section className="artifact-view" aria-label="运行结果">
    <header className="view-heading"><h2>运行结果</h2><Button variant="ghost" onClick={onPlan}>查看任务计划</Button></header>
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Button onClick={() => void connection.retry()}>重试原请求</Button></Callout.Root>}
    {!execution ? <div className="stage-empty"><h3>当前任务尚未运行</h3><p>链路验证与正式授权运行会分别保存输入、节点事件、输出、检查点和模型审计。</p><Button variant="soft" onClick={onPlan}>查看任务计划</Button></div> : <>
      <Select.Root value={execution.id} onValueChange={(id) => { setSelected(id); setDetailRunId(null) }}><Select.Trigger aria-label="运行历史" /><Select.Content>{executions.map((item, index) => <Select.Item key={item.id} value={item.id}>运行 {executions.length - index} · {statusLabels[item.status]}</Select.Item>)}</Select.Content></Select.Root>
      <Flex gap="2" wrap="wrap" my="3"><Badge color={execution.status === "completed" ? "green" : execution.status === "failed" || execution.status === "blocked" ? "red" : "amber"}>{statusLabels[execution.status]}</Badge>
        <Badge color="gray">计划 v{execution.plan.version}</Badge>{state.staleIds.includes(execution.id) && <Badge color="amber">历史只读</Badge>}</Flex>
      <p role="status">{execution.reason}</p>
      <p>本次累计：转换 {execution.consumed.transitions} · 浏览器命令 {execution.consumed.browserCommands} · 自动化时间 {execution.consumed.activeMs}ms · 模型调用 {execution.consumed.llmCalls ?? "未知"} · 链路调用 {execution.consumed.invocations}</p>
      <div className="plan-cards">{execution.steps.map((step) => <article className="plan-card" key={step.stepId}><h3>{step.stepId}</h3><p>{step.status} · 链路 v{step.chain.version}</p><p>{step.invocationIds.length} 次调用 · {step.runIds.length} 个独立运行</p>
        <p>预算消费：{step.consumed.transitions} 次转换 · {step.consumed.browserCommands} 条浏览器命令 · {step.consumed.activeMs}ms · {step.consumed.invocations} 次链路调用</p>
        {step.reason && <p>{step.reason}</p>}{step.output !== null && <pre className="chain-json">{JSON.stringify(step.output, null, 2)}</pre>}
        {step.runIds.map((runId) => <Button key={runId} size="1" variant="ghost" onClick={() => setDetailRunId(runId)}>查看节点事实</Button>)}</article>)}</div>
      <h3>最终输出</h3>{execution.output ? <pre className="chain-json">{JSON.stringify(execution.output, null, 2)}</pre> : <p>尚未形成满足计划合同的最终输出。</p>}
      <Flex gap="2" wrap="wrap" my="3">{["paused", "waiting_for_human"].includes(execution.status) && <Button disabled={readOnly || view.busy || state.staleIds.includes(execution.id)} onClick={() => void connection.dispatch({ type: "resume_execution", requestId: crypto.randomUUID(), executionId: execution.id, expectedSequence: execution.sequence })}>核验现场并恢复</Button>}
        {["queued", "running", "paused", "waiting_for_human"].includes(execution.status) && <Button variant="soft" disabled={readOnly || view.busy} onClick={() => void connection.dispatch({ type: "cancel_execution", executionId: execution.id })}>停止运行</Button>}
        <Button variant="soft" onClick={() => exportExecution(execution, runs)}>导出本次事实</Button></Flex>
    </>}
    {state.runs.some((run) => run.mode !== "replay") && <details className="supporting-detail"><summary>链路验证运行</summary>{state.runs.filter((run) => run.mode !== "replay").map((run) => <div key={run.binding.runId}><p>{run.mode === "sample" ? "代表样本" : "不同输入验证"} · {run.status} · {run.outcome?.reason ?? "等待执行"}</p>
      {["paused", "waiting_for_human"].includes(run.status) && <Button disabled={readOnly || view.busy} onClick={() => void connection.dispatch({ type: "resume_validation", requestId: crypto.randomUUID(), runId: run.binding.runId, expectedSequence: run.sequence })}>核验现场并恢复验证</Button>}
    </div>)}</details>}
    {state.legacy.length > 0 && <details className="supporting-detail"><summary>旧协议只读历史</summary>{state.legacy.map((item) => <p key={`${item.source}:${item.id}`}>{item.reason} <a href={`/api/task-chain/legacy?taskId=${encodeURIComponent(taskId)}&source=${item.source}&id=${encodeURIComponent(item.id)}`} download>导出 {item.id}</a></p>)}</details>}
  </section><DetailPane title="节点事实与审计" open={active && Boolean(detail)} onClose={() => setDetailRunId(null)}>{detail && <RunDetail taskId={taskId} run={detail} />}</DetailPane></div>
}

function RunDetail({ taskId, run }: { taskId: string; run: TaskRun }) {
  const artifacts = run.outcome?.evidence ?? run.checkpoint?.artifacts ?? []
  return <div className="detail-content"><h3>{run.mode} · {run.status}</h3><p>运行 {run.binding.runId}<br />调用 {run.binding.invocationId}<br />链路 v{run.binding.chain.version}</p>
    <p>转换 {run.consumed.transitions} · 浏览器命令 {run.consumed.browserCommands} · 自动化时间 {run.consumed.activeMs}ms · 模型调用 {run.consumed.llmCalls ?? "未知"}</p>
    {run.events.slice(-30).map((event) => <p key={event.sequence}>{event.sequence} · {event.nodeId} · {event.status} · {event.outcome ?? "等待结果"}</p>)}
    {run.modelCalls.map((audit) => <p key={audit.callId}>显式模型 {audit.model} · {audit.status} · {audit.reportedInvocations ?? "调用数未知"}</p>)}
    {run.checkpoint && <details><summary>检查点</summary><pre className="chain-json">{JSON.stringify(run.checkpoint, null, 2)}</pre></details>}
    {artifacts.map((artifact) => <p key={artifact.artifactId}><a href={`/api/task-chain/artifact?taskId=${encodeURIComponent(taskId)}&artifactId=${artifact.artifactId}`} target="_blank" rel="noreferrer">产物 {artifact.mediaType}</a> · {artifact.digest}</p>)}</div>
}

function exportExecution(execution: TaskExecution, runs: TaskRun[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ execution, runs }, null, 2)], { type: "application/json" }))
  const link = document.createElement("a"); link.href = url; link.download = `task-run-${execution.id}.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
