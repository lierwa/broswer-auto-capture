import { useEffect, useState, useSyncExternalStore } from "react"
import { Badge, Button, Callout, Flex, Select } from "@radix-ui/themes"
import { ArrowRight, FileSearch } from "lucide-react"
import {
  adoptedPlanSources,
  type ExecutionRecord,
  type PlanRecord,
} from "@browser-capture/contracts/plan"
import { BrowserStatus } from "./BrowserStatus.js"
import { DetailPane } from "./DetailPane.js"
import { InvocationEvents } from "./InvocationEvents.js"
import { PlanConnection } from "./planConnection.js"

const labels: Record<PlanRecord["status"], string> = {
  generating: "正在制定计划",
  ready: "待确认",
  blocked: "证据缺口待处理",
  failed: "生成未通过",
  cancelled: "已停止生成",
  manual_required: "需要人工处理",
  cleanup_required: "会话待清理",
  interrupted: "生成已中断",
}
const stageLabels: Record<PlanRecord["stage"], string> = {
  assessing: "判断证据需求",
  source_evidence: "核验来源证据",
  drafting: "编排抓取计划",
  complete: "计划生成结束",
}
export const runLabels = {
  queued: "已授权 · 排队中", running: "正在执行", awaiting_next_stage: "阶段结果待接续",
  interrupted: "运行已中断", cancelled: "已停止", stale: "授权绑定待复核", failed: "执行未完成",
  manual_required: "需要人工处理", cleanup_required: "会话待清理", completed: "已完成",
  partial: "部分完成", drift_paused: "页面变化 · 已暂停",
}
const fieldLabels = { observed: "页面字段", derived: "按规则生成", missing: "按规则留空" }
const gapLabels = { execution: "执行时核验", derived: "派生说明", blocking: "阻塞启动" }
const candidateLabels = { candidate: "候选", observed: "已观察", restricted: "受限", unavailable: "不可用" }
type Detail = { kind: "step" | "source"; id: string }

export function Plan({ taskId, connection, active, readOnly, confirmedVersion, interviewRevision, onInterview, onDraft }: {
  taskId: string
  connection: PlanConnection
  active: boolean
  readOnly: boolean
  confirmedVersion: number | null
  interviewRevision: number
  onInterview(): void
  onDraft(): void
}) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await connection.reload(controller.signal)
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [connection, active])
  useEffect(() => {
    if (active) { setSelected(null); setDetail(null) }
  }, [active, taskId])
  const state = view.state
  const latest = state?.records.reduce<PlanRecord | undefined>((value, item) => !value || item.version > value.version ? item : value, undefined)
  const record = state?.records.find((item) => item.id === selected) ?? latest
  const stale = Boolean(record && state?.staleIds.includes(record.id))
  const pending = view.busy || view.pending !== null
  const execution = state?.executions.find((item) => item.planId === record?.id)
  async function generate() {
    if (!confirmedVersion) return
    setSelected(null); setDetail(null)
    await connection.dispatch({ type: "generate", requestId: crypto.randomUUID(), requirementVersion: confirmedVersion })
  }
  return <div className="view-with-detail">
    <section className="artifact-view" aria-label="抓取计划">
      <header className="view-heading"><h2>抓取计划</h2>{confirmedVersion && <Button variant="ghost" color="gray" onClick={onDraft}>需求 v{confirmedVersion}<ArrowRight size={14} /></Button>}</header>
      <ConnectionError connection={connection} error={view.error} pending={view.pending} busy={view.busy} />
      {!state && !view.error && <p role="status">正在读取计划与授权…</p>}
      {state && <PlanBody state={state} latest={latest} record={record} stale={stale} pending={pending}
        execution={execution} readOnly={readOnly} interviewRevision={interviewRevision} onInterview={onInterview}
        onGenerate={() => void generate()} onSelect={(id) => { setSelected(id); setDetail(null) }}
        onDetail={setDetail} connection={connection} taskId={taskId} active={active} />}
    </section>
    <DetailPane title={detail?.kind === "source" ? "来源详情" : "计划步骤详情"}
      open={active && Boolean(record && detail)} onClose={() => setDetail(null)}>
      {record && detail?.kind === "step" && <StepDetail record={record} stepId={detail.id} />}
      {record && detail?.kind === "source" && <SourceDetail record={record} candidateId={detail.id} />}
    </DetailPane>
  </div>
}

function ConnectionError({ connection, error, pending, busy }: {
  connection: PlanConnection; error: string; pending: unknown | null; busy: boolean
}) {
  if (!error) return null
  return <Callout.Root color="red"><Callout.Text>{error}</Callout.Text><Flex gap="2" wrap="wrap">
    <Button size="1" variant="soft" onClick={() => void connection.reload()}>重新连接</Button>
    {pending !== null && <><Button size="1" disabled={busy} onClick={() => void connection.retry()}>重试原请求</Button>
      <Button size="1" disabled={busy} variant="ghost" onClick={connection.dismiss}>关闭重试提示</Button></>}
  </Flex></Callout.Root>
}

function PlanBody({ state, latest, record, stale, pending, execution, readOnly, interviewRevision, onInterview,
  onGenerate, onSelect, onDetail, connection, taskId, active }: {
  state: NonNullable<ReturnType<PlanConnection["snapshot"]>["state"]>
  latest: PlanRecord | undefined; record: PlanRecord | undefined; stale: boolean; pending: boolean
  execution: ExecutionRecord | undefined; readOnly: boolean; interviewRevision: number; onInterview(): void
  onGenerate(): void; onSelect(id: string): void; onDetail(detail: Detail): void
  connection: PlanConnection; taskId: string; active: boolean
}) {
  const showBrowser = Boolean(record && (record.stage === "source_evidence"
    || ["manual_required", "cleanup_required"].includes(record.evidence.outcome) || record.status === "interrupted"))
  async function returnToInterview() {
    if (!record) return
    const ok = await connection.dispatch({ type: "return_to_interview", planId: record.id,
      requestId: crypto.randomUUID(), expectedRevision: interviewRevision })
    if (ok) onInterview()
  }
  return <>
    <Flex gap="3" align="center" wrap="wrap" my="3">
      <Button disabled={!state.eligible || pending || readOnly} onClick={onGenerate}>{latest ? "重新制定计划" : "制定正式计划"}</Button>
      {state.generating && latest && <Button variant="soft" disabled={pending}
        onClick={() => void connection.dispatch({ type: "cancel_generation", planId: latest.id })}>停止生成</Button>}
      {record && <Select.Root value={record.id} onValueChange={onSelect}><Select.Trigger aria-label="抓取计划版本" />
        <Select.Content>{state.records.slice().sort((a, b) => b.version - a.version).map((item) => <Select.Item key={item.id} value={item.id}>计划 v{item.version} · {labels[item.status]}</Select.Item>)}</Select.Content>
      </Select.Root>}
    </Flex>
    {state.blocked && <p role="status">{state.blocked}</p>}
    {!record ? <div className="stage-empty"><FileSearch size={26} /><h3>还没有正式抓取计划</h3>
      <p>基于已确认需求组织范围；计划会按需核验真实来源，审阅后再单独授权启动。</p></div> : <>
      <PlanRecordView record={record} latest={latest} stale={stale} pending={pending} execution={execution}
        readOnly={readOnly} stateGenerating={state.generating} onDetail={onDetail} connection={connection}
        onReturn={() => void returnToInterview()} />
      {showBrowser && <BrowserStatus taskId={taskId} active={active} />}
    </>}
    {state.browserOwner && <p role="status">浏览器当前由“{state.browserOwner.title}”使用，排队任务等待释放。</p>}
  </>
}

function PlanRecordView({ record, latest, stale, pending, execution, readOnly, stateGenerating, onDetail, connection, onReturn }: {
  record: PlanRecord; latest: PlanRecord | undefined; stale: boolean; pending: boolean
  execution: ExecutionRecord | undefined; readOnly: boolean; stateGenerating: boolean
  onDetail(detail: Detail): void; connection: PlanConnection; onReturn(): void
}) {
  return <>
    <Flex gap="2" wrap="wrap"><Badge color={record.status === "ready" && !stale ? "green" : "amber"}>{labels[record.status]}</Badge>
      <Badge color="gray">{stageLabels[record.stage]}</Badge>
      <Badge color="gray">需求 v{record.requirementVersion} · 计划 v{record.version}</Badge>
      {record.evidence.reusedFromPlanId && <Badge color="gray">已复用同版证据</Badge>}
      {stale && <Badge color="amber">需求或证据已变更 · 待复核</Badge>}
    </Flex>
    <p role="status">{record.current}</p>
    {record.reason && <p role="status">{record.reason}</p>}
    <EvidenceGaps record={record} pending={pending} readOnly={readOnly} onReturn={onReturn} />
    {record.proposal && <Proposal record={record} onDetail={onDetail} />}
    {record.proposal && <div className="action-gate"><p>{stale ? "需求或证据已更新，请复核并制定新版本。"
      : record.status === "blocked" ? "请先处理上述阻塞证据缺口。"
      : execution ? "授权已保存，下面显示这次运行的真实状态。"
      : "确认后保存本计划范围与预算的授权并排队；达到预算暂停，保留完整目标。"}</p>
      <Button disabled={pending || readOnly || stale || record.id !== latest?.id || record.status !== "ready" || !record.digest
        || Boolean(execution) || stateGenerating} onClick={() => { if (record.digest) void connection.dispatch({
          type: "start", requestId: crypto.randomUUID(), planId: record.id, planDigest: record.digest,
        }) }}>确认计划并启动</Button>
    </div>}
    <PlanEvidenceReview record={record} onDetail={onDetail} />
    <PlanAudit record={record} />
    {execution && <ExecutionStatus execution={execution} pending={pending}
      onCancel={() => void connection.dispatch({ type: "cancel_execution", executionId: execution.id })} />}
  </>
}

function EvidenceGaps({ record, pending, readOnly, onReturn }: {
  record: PlanRecord; pending: boolean; readOnly: boolean; onReturn(): void
}) {
  if (!record.evidence.gaps.length) return null
  const requiresInterview = record.evidence.gaps.some((gap) => gap.requiresUser)
    && !["manual_required", "cleanup_required"].includes(record.evidence.outcome)
  return <div className="source-gaps"><h3>证据缺口与下一步</h3><ul>
    {record.evidence.gaps.map((gap, index) => <li key={index}>{gap.description}</li>)}
  </ul>{requiresInterview ? record.status !== "generating" && <Button variant="soft" disabled={pending || readOnly} onClick={onReturn}>带证据回到需求对话</Button>
    : <p>缺口已保留在本计划中；可直接重新制定计划继续核验，无需返回需求对话。</p>}</div>
}

function Proposal({ record, onDetail }: { record: PlanRecord; onDetail(detail: Detail): void }) {
  const proposal = record.proposal!
  return <><p>{proposal.summary}</p><details className="supporting-detail"><summary>完整需求范围与完成标准</summary>
    <p>{record.requirement.goal}</p><p>{record.requirement.scope}</p><p>{record.requirement.sourceStrategy.scope}</p>
    {record.requirement.deliverables.map((item, index) => <p key={index}><strong>{item.entity}</strong>：{item.fields.join("、")}<br />{item.coverage}<br />{item.limit}</p>)}
    <ul>{[...record.requirement.completionCriteria, ...record.requirement.constraints, ...record.requirement.proposedDefaults]
      .map((item, index) => <li key={index}>{item}</li>)}</ul></details>
    <div className="plan-cards">{proposal.steps.map((step, index) => <article className="plan-card" key={step.id}><header>
      <span className="large-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3>
        <span className="muted">{step.dependsOn.length ? `依赖：${step.dependsOn.map((id) => proposal.steps.find((item) => item.id === id)?.title).join("、")}` : "起始步骤"}</span></div>
      <Button size="1" variant="soft" onClick={() => onDetail({ kind: "step", id: step.id })}>步骤详情</Button></header>
      <p>{step.goal}</p><p className="muted">{step.input} → {step.output}</p></article>)}</div>
    <GapReview record={record} /><BudgetReview record={record} />
  </>
}

function PlanEvidenceReview({ record, onDetail }: { record: PlanRecord; onDetail(detail: Detail): void }) {
  const candidates = record.evidence.candidates.slice().sort((a, b) => Number(a.status === "candidate") - Number(b.status === "candidate"))
  return <details className="supporting-detail"><summary>来源证据与覆盖 · {record.evidence.observations.length} 次观察</summary>
    {record.evidence.reusedFromPlanId && <p>证据复用自计划 {record.evidence.reusedFromPlanId}；仅在同一需求版本、revision 与摘要校验一致时成立。</p>}
    {record.evidence.queries.map((query) => <p key={query.id}>{query.intent} · {query.observationId ? "已观察搜索页" : "尚无搜索页观察"}<br />
      <a href={query.url} target="_blank" rel="noreferrer">搜索页面</a></p>)}
    <div className="source-list">{candidates.map((item) => <article className="source-row" key={item.id}><div>
      <h3>{item.title || new URL(item.url).hostname}</h3><span className="muted">{new URL(item.url).hostname} · {candidateLabels[item.status]}</span><p>{item.reason}</p></div>
      <Button size="1" variant="soft" onClick={() => onDetail({ kind: "source", id: item.id })}>来源详情</Button></article>)}</div>
    {!candidates.length && <p className="muted">本计划尚无来源候选；无需调查时可直接进入计划编排，需要证据时会记录候选与观察。</p>}
    {record.evidence.coverage.map((item, index) => <p key={index}><strong>{item.objective}</strong>：{item.reason}</p>)}
    {record.evidence.audits.map((item) => <div key={item.id}><p>计划来源证据 · {item.model}/{item.effort} · {item.status} · {item.invocations === null ? "请求次数未回报" : `${item.invocations} 次已回报调用`}</p>
      <InvocationEvents events={item.aiEvents} /></div>)}
  </details>
}

function PlanAudit({ record }: { record: PlanRecord }) {
  return <details className="supporting-detail"><summary>计划生成审计</summary>
    {record.audit ? <><p>计划制定 · {record.audit.model}/{record.audit.effort} · {record.audit.status} · {record.audit.invocations === null ? "调用次数未回报" : `${record.audit.invocations} 次已回报调用`}</p>
      <InvocationEvents events={record.audit.aiEvents} /></> : <p>尚未进入计划草稿生成。</p>}
    <p>创建时间：{record.createdAt}</p>
  </details>
}

function GapReview({ record }: { record: PlanRecord }) {
  return record.proposal!.gaps.length > 0 && <div className="source-gaps"><h3>计划缺口与处理</h3>
    {record.proposal!.gaps.map((gap) => <p key={gap.gapIndex}><Badge color={gap.disposition === "blocking" ? "red" : "gray"}>{gapLabels[gap.disposition]}</Badge>{" "}
      {record.evidence.gaps[gap.gapIndex]?.description ?? gap.explanation}<br />{gap.explanation}</p>)}</div>
}

function BudgetReview({ record }: { record: PlanRecord }) {
  const steps = record.proposal!.steps
  return <div className="source-gaps"><h3>本次授权预算</h3><p>最多 {steps.reduce((n, step) => n + step.budget.maxCommands, 0)} 条浏览器命令 · {Math.round(steps.reduce((n, step) => n + step.budget.timeoutMs, 0) / 1000)} 秒 · {steps.reduce((n, step) => n + step.budget.maxModelCalls, 0)} 次首次探索模型调用 · {steps.reduce((n, step) => n + (step.budget.maxLlmCalls ?? 0), 0)} 次显式 LLM 节点调用</p>
    <p>达到上限暂停并保留已完成内容和剩余范围；新增来源或扩大预算须重新制定并确认计划。登录、验证码与访问限制转人工。</p></div>
}

function ExecutionStatus({ execution, pending, onCancel }: { execution: ExecutionRecord; pending: boolean; onCancel(): void }) {
  return <div className="source-gaps" role="status"><h3>{runLabels[execution.status]}</h3><p>{execution.reason}</p>
    <p>授权计划 v{execution.planVersion} · {execution.authorizedAt}</p>
    {!["completed", "failed", "cancelled", "stale", "partial", "drift_paused"].includes(execution.status)
      && <Button variant="soft" disabled={pending} onClick={onCancel}>停止授权运行</Button>}</div>
}

function StepDetail({ record, stepId }: { record: PlanRecord; stepId: string }) {
  const step = record.proposal?.steps.find((item) => item.id === stepId)
  if (!step) return null
  const sources = adoptedPlanSources(record.evidence).filter((item) => step.sourceIds.includes(item.id))
  return <div className="detail-content source-detail"><h3>{step.title}</h3><p>{step.goal}</p><h4>输入 → 输出</h4><p>{step.input} → {step.output}</p>
    <h4>终止条件</h4><p>{step.termination}</p><h4>预算与风险</h4><p>{step.budget.maxCommands} 条命令 · {step.budget.timeoutMs / 1000} 秒 · {step.budget.maxModelCalls} 次探索模型调用 · {step.budget.maxLlmCalls ?? 0} 次显式 LLM 调用</p>
    {step.risks.map((item, index) => <p key={index}>{item}</p>)}<h4>来源依据</h4>
    {sources.map((item) => <div key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a><p>{item.at}</p>
      <p>{item.assessment?.enumeration?.name}</p><p>{item.assessment?.enumeration?.evidence}</p></div>)}
    <h4>字段处理</h4>{record.proposal!.fields.filter((item) => item.stepId === step.id).map((item, index) => <p key={index}>
      <strong>{record.requirement.deliverables[item.deliverable]?.fields[item.field]}</strong> · {item.mode === "missing" && item.ruleIndex === null ? "待执行核验" : fieldLabels[item.mode]}<br />{item.explanation}
      {item.ruleIndex !== null && <><br />已确认规则：{[...record.requirement.constraints, ...record.requirement.proposedDefaults][item.ruleIndex]}</>}</p>)}
    <p className="muted">链路状态：等待真实探索与换输入验证。</p></div>
}

function SourceDetail({ record, candidateId }: { record: PlanRecord; candidateId: string }) {
  const candidate = record.evidence.candidates.find((item) => item.id === candidateId)
  if (!candidate) return null
  const observations = record.evidence.observations.filter((item) => item.candidateId === candidate.id)
  return <div className="detail-content source-detail"><Badge>{candidateLabels[candidate.status]}</Badge><h3>{candidate.title}</h3>
    <a href={candidate.url} target="_blank" rel="noreferrer">{candidate.url}</a><p>发现时间：{candidate.discoveredAt}</p>
    <p>来源：{candidate.provenance === "provided" ? "需求提供的待核验线索" : `真实页面链接（证据 ${candidate.discoveredOn}）`}</p><p>{candidate.reason}</p>
    {observations.map((item) => <div key={item.id}><h3>代表页观察</h3><p>{item.at}</p><p>实际地址：<a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p>
      <p>{item.truncated ? "观察文本被截断，覆盖受限" : "本次语义观察完整"}</p><p>{item.assessment?.reason ?? "已观察，尚未完成可行性判断"}</p>
      <h4>字段依据</h4>{item.assessment?.fields.map((field, index) => <p key={index}><strong>{field.name}</strong>：{field.evidence}</p>)}
      <h4>枚举或分页方式</h4><p>{item.assessment?.enumeration ? `${item.assessment.enumeration.name}：${item.assessment.enumeration.evidence}` : "尚无核验依据"}</p>
      {item.assessment?.limitations.map((limit, index) => <p key={index}>{limit}</p>)}<details><summary>证据标识</summary><p>{item.id}</p><p>观察摘要 SHA-256：{item.digest}</p></details></div>)}
  </div>
}
