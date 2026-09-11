import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import type { ExecutionRecord, PlanRecord } from "@browser-capture/contracts/plan"
import type { InterviewState } from "./interviewContract.js"
import { Results as EmptyResults } from "./ArtifactViews.js"
import { PlanConnection } from "./planConnection.js"
import { DetailPane } from "./DetailPane.js"
import { runLabels } from "./Plan.js"

export function Results({ taskId, readOnly, state: interview, active, onPlan }: { taskId: string; readOnly: boolean; state: InterviewState; active: boolean; onPlan: () => void }) {
  const connection = useMemo(() => new PlanConnection(taskId), [taskId])
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [selected, select] = useState<string | null>(null), [detail, setDetail] = useState<string | null>(null)
  const [action, setAction] = useState<"replay" | "repair" | null>(null)
  const [repairStepId, setRepairStepId] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [connection, active])
  const state = view.state, run = state?.executions.find((item) => item.id === selected) ?? state?.executions.at(-1)
  const plan = state?.records.find((item) => item.id === run?.planId), busy = view.busy || view.pending !== null
  const unfinished = run?.capture?.steps.find((step) => step.status !== "completed")
  const repairStep = plan?.proposal?.steps.find((step) => step.id === repairStepId)
    ?? plan?.proposal?.steps.find((step) => step.id === unfinished?.stepId) ?? plan?.proposal?.steps.at(-1)
  const allowed = !readOnly && !busy && run && !["queued", "running", "cleanup_required"].includes(run.status) && !state?.staleIds.includes(run.planId)
  const selectedStep = run?.capture?.steps.find((step) => step.stepId === detail)
  if (!state) return <section className="artifact-view"><p role="status">{view.error || "正在读取运行结果…"}</p><Button variant="soft" onClick={() => void connection.reload()}>重新连接</Button></section>
  if (!run) return <EmptyResults state={interview} active={active} onPlan={onPlan} />
  return <div className="view-with-detail"><section className="artifact-view" aria-label="运行结果">
    <header className="view-heading"><h2>运行结果</h2><Button variant="ghost" onClick={onPlan}>查看抓取计划</Button></header>
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Button disabled={view.busy} onClick={() => void connection.retry()}>重试原请求</Button><Button variant="ghost" onClick={connection.dismiss}>关闭重试提示</Button></Callout.Root>}
    <Select.Root value={run.id} onValueChange={(id) => { select(id); setDetail(null); setAction(null) }}><Select.Trigger aria-label="运行历史" /><Select.Content>{state.executions.toReversed().map((item, index) => <Select.Item key={item.id} value={item.id}>运行 {state.executions.length - index} · {runLabels[item.status]}</Select.Item>)}</Select.Content></Select.Root>
    <Flex gap="2" wrap="wrap" my="3"><Badge>{runLabels[run.status]}</Badge><Badge color="gray">计划 v{run.planVersion} · {run.mode === "initial" ? "首次运行" : run.mode === "replay" ? "独立复跑" : "授权修复"}</Badge>{state.staleIds.includes(run.planId) && <Badge color="amber">绑定待复核</Badge>}</Flex>
    <p role="status">{run.reason}</p>
    {run.capture ? <><p>已保存 {run.capture.steps.reduce((n, step) => n + step.rows.length, 0)} 条步骤来源记录 · {run.capture.steps.filter((step) => step.status === "completed").length}/{run.capture.steps.length} 个步骤结束</p>
      {run.capture.gaps.length > 0 && <div className="source-gaps"><h3>覆盖与剩余范围</h3>{run.capture.gaps.map((gap, index) => <p key={index}>{gap}</p>)}</div>}
      <div className="plan-cards">{run.capture.steps.map((step) => <article className="plan-card" key={step.stepId}><h3>{plan?.proposal?.steps.find((item) => item.id === step.stepId)?.title ?? step.stepId}</h3><p>{step.inputIndex}/{step.inputs.length} 个输入结束 · {step.rows.length} 条去重记录</p><p>{step.commands} 条命令 · {Math.ceil(step.elapsedMs / 1000)} 秒 · {step.termination ?? (step.status === "pending" ? "等待前置步骤" : "当前步骤待继续")}</p><Button variant="soft" onClick={() => setDetail(step.stepId)}>查看来源记录</Button></article>)}</div>
    </> : <p>当前保存的是探索与验证阶段事实，尚未形成批量结果。</p>}
    <Flex gap="2" wrap="wrap" my="3">
      {!["completed", "partial", "failed", "cancelled", "stale"].includes(run.status) && <Button variant="soft" disabled={busy || readOnly} onClick={() => void connection.dispatch({ type: "cancel_execution", executionId: run.id })}>停止运行</Button>}
      <Button disabled={!allowed || !unfinished} onClick={() => void connection.dispatch({ type: "resume", requestId: crypto.randomUUID(), executionId: run.id, sequence: run.sequence })}>核验并恢复本次运行</Button>
      <Button disabled={!allowed} variant="soft" onClick={() => setAction("replay")}>独立复跑</Button>
      <Button disabled={!allowed || !repairStep} variant="soft" onClick={() => setAction("repair")}>修复步骤</Button>
      <Button variant="soft" onClick={() => exportRun(run, plan)}>导出本次结果</Button>
    </Flex>
    {action && plan && <div className="action-gate"><h3>{action === "repair" ? "授权修复并验证新版本" : "授权新的独立复跑"}</h3><p>范围：{plan.requirement.scope}</p>
      {action === "repair" && repairStep && <Select.Root value={repairStep.id} onValueChange={setRepairStepId}><Select.Trigger aria-label="修复步骤" /><Select.Content>{plan.proposal?.steps.map((step) => <Select.Item key={step.id} value={step.id}>{step.title}</Select.Item>)}</Select.Content></Select.Root>}
      <p>本次上限 {run.budget.maxCommands} 条命令 / {run.budget.timeoutMs / 1000} 秒；{action === "repair" ? `修复 ${repairStep?.title}，最多 ${repairStep?.budget.maxModelCalls ?? 0} 次修复判断` : "普通节点按已验证链路执行"}；显式 LLM 上限 {run.budget.maxLlmCalls ?? 0} 次。</p><Button disabled={!allowed} onClick={() => { void connection.dispatch({ type: action, requestId: crypto.randomUUID(), executionId: run.id, planDigest: run.planDigest, ...(action === "repair" ? { stepId: repairStep?.id } : {}) }).then((ok) => { if (ok) { select(null); setAction(null) } }) }}>确认范围与预算并启动</Button><Button variant="ghost" onClick={() => setAction(null)}>取消</Button></div>}
    <details className="supporting-detail"><summary>运行归属与调用审计</summary><p>运行：{run.id}<br />计划 v{run.planVersion} · 需求 v{run.requirementVersion}<br />授权：{run.authorizedAt}</p>{run.capture?.steps.map((step) => <div key={step.stepId}><p>{step.stepId} · 链路 {step.chainId ?? "尚未形成"} · {step.explorationCalls} 次探索/修复判断 · {step.llmCalls} 次显式节点意图</p>{step.audits.map((audit, index) => <p key={index}>{audit.purpose} · {audit.model}/{audit.effort} · {audit.invocations === null ? "调用次数未回报" : `${audit.invocations} 次`} · {audit.status}</p>)}</div>)}</details>
  </section><DetailPane title="来源记录" open={active && Boolean(selectedStep)} onClose={() => setDetail(null)}>{selectedStep && <div className="detail-content source-detail"><p>记录按本运行的稳定来源键去重，以下展示前 100 条；完整结果可导出。</p>{selectedStep.rows.slice(0, 100).map((row) => <details key={row.stableKey}><summary>{row.fields["名称"] || row.fields.title || row.url}</summary><a href={row.url} target="_blank" rel="noreferrer">原始来源</a>{Object.entries(row.fields).map(([key, value]) => <p key={key}><strong>{key}</strong>：{value || "未提供"}</p>)}{row.missing.length > 0 && <p>未确认：{row.missing.join("、")}</p>}</details>)}</div>}</DetailPane></div>
}
function exportRun(run: ExecutionRecord, plan: PlanRecord | undefined) {
  const value = { executionId: run.id, planId: run.planId, planVersion: run.planVersion, planDigest: run.planDigest,
    requirementVersion: run.requirementVersion, requirementRevision: run.requirementRevision, status: run.status, authorizedAt: run.authorizedAt,
    requirement: plan?.requirement, coverage: run.capture?.coverage, gaps: run.capture?.gaps,
    steps: run.capture?.steps.map(({ checkpoint: _checkpoint, events: _events, ...step }) => step) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }))
  const link = document.createElement("a"); link.href = url; link.download = `capture-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
