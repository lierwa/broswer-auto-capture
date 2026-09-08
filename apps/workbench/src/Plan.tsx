import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import { ArrowRight, FileSearch } from "lucide-react"
import type { PlanRecord, ExecutionRecord } from "@browser-capture/contracts/plan"
import { PlanConnection } from "./planConnection.js"
import { DetailPane } from "./DetailPane.js"
import { InvocationEvents } from "./InvocationEvents.js"

const labels = { generating: "正在制定计划", ready: "待确认", blocked: "来源缺口待处理", failed: "生成未通过", cancelled: "已停止生成", interrupted: "生成已中断" }
export const runLabels = { queued: "已授权 · 排队中", running: "正在执行", awaiting_next_stage: "阶段结果待接续", interrupted: "运行已中断", cancelled: "已停止", stale: "授权绑定待复核", failed: "执行未完成", manual_required: "需要人工处理", cleanup_required: "会话待清理", completed: "已完成", partial: "部分完成", drift_paused: "页面变化 · 已暂停" }
const fieldLabels = { observed: "页面字段", derived: "按规则生成", missing: "按规则留空" }
const gapLabels = { execution: "执行时核验", derived: "派生说明", blocking: "阻塞启动" }
export function Plan({ taskId, active, readOnly, onSources }: { taskId: string; active: boolean; readOnly: boolean; onSources: () => void }) {
  const connection = useMemo(() => new PlanConnection(taskId), [taskId])
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<string | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => { await connection.reload(controller.signal); if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000) }
    void poll(); return () => { controller.abort(); clearTimeout(timer) }
  }, [connection, active])
  const state = view.state, latest = state?.records[0], record = state?.records.find((item) => item.id === selected) ?? latest
  const stale = Boolean(record && state?.staleIds.includes(record.id)), pending = view.busy || view.pending !== null
  const execution = state?.executions.find((item) => item.planId === record?.id)
  async function generate() {
    if (!state?.source) return
    setSelected(null); setDetail(null)
    await connection.dispatch({ type: "generate", requestId: crypto.randomUUID(), requirementVersion: state.source.requirementVersion, sourceId: state.source.id, sourceVersion: state.source.version })
  }
  return <div className="view-with-detail"><section className="artifact-view" aria-label="抓取计划">
    <header className="view-heading"><h2>抓取计划</h2><Button variant="ghost" color="gray" onClick={onSources}>查看来源调研<ArrowRight size={14} /></Button></header>
    {view.error && <Callout.Root color="red"><Callout.Text>{view.error}</Callout.Text><Flex gap="2" wrap="wrap"><Button size="1" variant="soft" onClick={() => void connection.reload()}>重新连接</Button>{view.pending !== null && <><Button size="1" disabled={view.busy} onClick={() => void connection.retry()}>重试原请求</Button><Button size="1" disabled={view.busy} variant="ghost" onClick={connection.dismiss}>关闭重试提示</Button></>}</Flex></Callout.Root>}
    {!state && !view.error && <p role="status">正在读取计划与授权…</p>}
    {state && <>
      <Flex gap="3" align="center" wrap="wrap" my="3"><Button disabled={!state.eligible || pending || readOnly} onClick={() => void generate()}>{latest ? "重新制定计划" : "制定正式计划"}</Button>
        {state.generating && latest && <Button variant="soft" disabled={pending} onClick={() => void connection.dispatch({ type: "cancel_generation", planId: latest.id })}>停止生成</Button>}
        {record && <Select.Root value={record.id} onValueChange={(value) => { setSelected(value); setDetail(null) }}><Select.Trigger aria-label="抓取计划版本" /><Select.Content>{state.records.map((item) => <Select.Item key={item.id} value={item.id}>计划 v{item.version} · {labels[item.status]}</Select.Item>)}</Select.Content></Select.Root>}
      </Flex>
      {state.blocked && <p role="status">{state.blocked}</p>}
      {!record ? <div className="stage-empty"><FileSearch size={26} /><h3>还没有正式抓取计划</h3><p>基于真实来源组织完整范围；计划审阅后单独授权启动。</p></div> : <>
        <Flex gap="2" wrap="wrap"><Badge color={record.status === "ready" && !stale ? "green" : "amber"}>{labels[record.status]}</Badge><Badge color="gray">需求 v{record.requirementVersion} · 来源 v{record.sourceVersion} · 计划 v{record.version}</Badge>{stale && <Badge color="amber">版本已变更 · 待复核</Badge>}</Flex>
        {record.reason && <p role="status">{record.reason}</p>}
        {record.status === "generating" && <p role="status">正在组合已核验来源、步骤依赖及缺口处理，完成后可审阅。</p>}
        {record.proposal && <><p>{record.proposal.summary}</p><details className="supporting-detail"><summary>完整需求范围与完成标准</summary><p>{record.requirement.goal}</p><p>{record.requirement.scope}</p><p>{record.requirement.sourceStrategy.scope}</p>{record.requirement.deliverables.map((item, index) => <p key={index}><strong>{item.entity}</strong>：{item.fields.join("、")}<br />{item.coverage}<br />{item.limit}</p>)}<ul>{[...record.requirement.completionCriteria, ...record.requirement.constraints, ...record.requirement.proposedDefaults].map((item, index) => <li key={index}>{item}</li>)}</ul></details>
          <div className="plan-cards">{record.proposal.steps.map((step, index) => <article className="plan-card" key={step.id}><header><span className="large-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><span className="muted">{step.dependsOn.length ? `依赖：${step.dependsOn.map((id) => record.proposal!.steps.find((item) => item.id === id)?.title).join("、")}` : "起始步骤"}</span></div><Button size="1" variant="soft" onClick={() => setDetail(step.id)}>步骤详情</Button></header><p>{step.goal}</p><p className="muted">{step.input} → {step.output}</p></article>)}</div>
          <GapReview record={record} />
          <BudgetReview record={record} />
          <div className="action-gate"><p>{stale ? "需求或来源已更新，请复核并制定新版本。" : record.status === "blocked" ? "请先处理上述阻塞来源缺口。" : execution ? "授权已保存，下面显示这次运行的真实状态。" : "确认后保存本计划范围与预算的授权并排队；达到预算暂停，保留完整目标。"}</p><Button disabled={pending || readOnly || stale || record.id !== latest?.id || record.status !== "ready" || Boolean(execution) || state.generating} onClick={() => { if (record.digest) void connection.dispatch({ type: "start", requestId: crypto.randomUUID(), planId: record.id, planDigest: record.digest }) }}>确认计划并启动</Button></div>
        </>}
        <details className="supporting-detail"><summary>计划生成审计</summary><p>计划制定 · {record.audit.model}/{record.audit.effort} · {record.audit.status} · {record.audit.invocations === null ? "调用次数未回报" : `${record.audit.invocations} 次已回报调用`}</p><InvocationEvents events={record.audit.aiEvents} /><p>创建时间：{record.createdAt}</p></details>
        {execution && <ExecutionStatus execution={execution} pending={pending} onCancel={() => void connection.dispatch({ type: "cancel_execution", executionId: execution.id })} />}
      </>}
      {state.browserOwner && <p role="status">浏览器当前由“{state.browserOwner.title}”使用，排队任务等待释放。</p>}
    </>}
  </section><DetailPane title="计划步骤详情" open={active && Boolean(record && detail)} onClose={() => setDetail(null)}>{record && detail && <StepDetail record={record} stepId={detail} />}</DetailPane></div>
}
function GapReview({ record }: { record: PlanRecord }) {
  return record.proposal!.gaps.length > 0 && <div className="source-gaps"><h3>来源缺口与处理</h3>{record.proposal!.gaps.map((gap) => <p key={gap.gapIndex}><Badge color={gap.disposition === "blocking" ? "red" : "gray"}>{gapLabels[gap.disposition]}</Badge> {record.sourceGaps[gap.gapIndex]}<br />{gap.explanation}</p>)}</div>
}
function BudgetReview({ record }: { record: PlanRecord }) {
  const steps = record.proposal!.steps
  return <div className="source-gaps"><h3>本次授权预算</h3><p>最多 {steps.reduce((n, step) => n + step.budget.maxCommands, 0)} 条浏览器命令 · {Math.round(steps.reduce((n, step) => n + step.budget.timeoutMs, 0) / 1000)} 秒 · {steps.reduce((n, step) => n + step.budget.maxModelCalls, 0)} 次首次探索模型调用 · {steps.reduce((n, step) => n + (step.budget.maxLlmCalls ?? 0), 0)} 次显式 LLM 节点调用</p><p>达到上限暂停并保留已完成内容和剩余范围；新增来源或扩大预算须重新制定并确认计划。登录、验证码与访问限制转人工。</p></div>
}
function ExecutionStatus({ execution, pending, onCancel }: { execution: ExecutionRecord; pending: boolean; onCancel: () => void }) {
  return <div className="source-gaps" role="status"><h3>{runLabels[execution.status]}</h3><p>{execution.reason}</p><p>授权计划 v{execution.planVersion} · {execution.authorizedAt}</p>{["queued", "running", "awaiting_next_stage", "interrupted", "manual_required", "cleanup_required"].includes(execution.status) && <Button variant="soft" disabled={pending} onClick={onCancel}>停止授权运行</Button>}</div>
}
function StepDetail({ record, stepId }: { record: PlanRecord; stepId: string }) {
  const step = record.proposal?.steps.find((item) => item.id === stepId)
  if (!step) return null
  return <div className="detail-content source-detail"><h3>{step.title}</h3><p>{step.goal}</p><h4>输入 → 输出</h4><p>{step.input} → {step.output}</p><h4>终止条件</h4><p>{step.termination}</p><h4>预算与风险</h4><p>{step.budget.maxCommands} 条命令 · {step.budget.timeoutMs / 1000} 秒 · {step.budget.maxModelCalls} 次探索模型调用 · {step.budget.maxLlmCalls ?? 0} 次显式 LLM 调用</p>{step.risks.map((item, index) => <p key={index}>{item}</p>)}<h4>来源依据</h4>{record.sources.filter((item) => step.sourceIds.includes(item.id)).map((item) => <div key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a><p>{item.at}</p><p>{item.assessment?.enumeration?.name}</p><p>{item.assessment?.enumeration?.evidence}</p></div>)}<h4>字段处理</h4>{record.proposal!.fields.filter((item) => item.stepId === step.id).map((item, index) => <p key={index}><strong>{record.requirement.deliverables[item.deliverable]?.fields[item.field]}</strong> · {fieldLabels[item.mode]}<br />{item.explanation}{item.ruleIndex !== null && <><br />已确认规则：{[...record.requirement.constraints, ...record.requirement.proposedDefaults][item.ruleIndex]}</>}</p>)}<p className="muted">链路状态：等待真实探索与换输入验证。</p></div>
}
