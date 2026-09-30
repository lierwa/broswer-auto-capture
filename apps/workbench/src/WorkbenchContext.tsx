import { useEffect, useState } from "react"
import { Button, SegmentedControl, TextArea } from "@radix-ui/themes"
import { AlertTriangle } from "lucide-react"
import { parseTaskValue, type JsonValue, type TaskExecution, type TaskExecutionEventBatch } from "@browser-capture/contracts"
import { ChainInspector } from "./ChainInspector.js"
import { ValueSchemaForm, initialValue } from "./ValueSchemaForm.js"
import { ExecutionActions, HistoricalBrowserHandoffActions } from "./ExecutionActions.js"
import { ExecutionResultView, StatusIcon, executionStatus, cleanupStatus,
  historicalEventStatus, formatTime } from "./ExecutionPresentation.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import { preparationActivityLabel, type LiveChainModel } from "./useLiveChain.js"

export function WorkbenchContext({ model, connection, onRequirementRevision }: {
  model: LiveChainModel
  connection: TaskChainConnection
  onRequirementRevision(summary: string, feedback: string): Promise<void>
}) {
  const { chain, presentation, selectedStage, selectedNode, chainEvents, contextMode } = model
  const [feedback, setFeedback] = useState("")
  useEffect(() => setFeedback(""), [model.selectedExecution?.id])
  if (model.build && (selectedNode || selectedStage)) return <ChainInspector chain={model.build}
    presentation={model.build.presentation} preparing preparationPhase={model.build.phase}
    stage={selectedStage} node={selectedNode} batch={null} onClose={model.closeContext} />
  if (chain && presentation && (selectedNode || selectedStage)) return <ChainInspector chain={chain}
    presentation={presentation} stage={selectedStage} node={selectedNode} batch={chainEvents}
    onClose={model.closeContext} />
  if (!contextMode) return null
  if (contextMode === "execution") return <ExecutionContext model={model} connection={connection}
    feedback={feedback} setFeedback={setFeedback} onClose={model.closeContext}
    onRequirementRevision={onRequirementRevision} />
  if (contextMode === "preparation") return <PreparationContext model={model} connection={connection} onClose={model.closeContext} />
  if (contextMode === "history") return <HistoryContext model={model} connection={connection} onClose={model.closeContext} />
  return <DiagnosticsContext model={model} connection={connection} onClose={model.closeContext} />
}

function ContextHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose(): void }) {
  return <header><span>{eyebrow}</span><button onClick={onClose} aria-label="关闭上下文区">×</button><h3>{title}</h3></header>
}

function ExecutionContext({ model, connection, feedback, setFeedback, onClose, onRequirementRevision }: {
  model: LiveChainModel
  connection: TaskChainConnection
  feedback: string; setFeedback(value: string): void
  onClose(): void
  onRequirementRevision(summary: string, feedback: string): Promise<void>
}) {
  const execution = model.selectedExecution
  const [reviewing, setReviewing] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  useEffect(() => setReviewOpen(false), [execution?.id])
  async function review(decision: "accepted" | "requirement_revision") {
    if (!execution) return
    setReviewing(true)
    try {
      const summary = execution.result?.summary ?? executionStatus(execution.status)
      const accepted = await connection.dispatch({ type: "review_execution", requestId: crypto.randomUUID(),
        executionId: execution.id, expectedSequence: execution.sequence, decision,
        feedback: feedback.trim() || null })
      if (accepted && decision === "requirement_revision") await onRequirementRevision(summary, feedback.trim() || "需要重新确认需求。")
      if (accepted) setReviewOpen(false)
    } finally { setReviewing(false) }
  }
  return <aside className="chain-inspector workspace-context" aria-label="当前执行">
    <ContextHeader eyebrow="运行" title="本次结果" onClose={onClose} />
    {!execution ? <p>{model.acceptedExecutionId ? "已提交，正在等待本次运行记录。" : "尚未运行。"}</p> : <>
      <div className="context-status" data-tone={execution.status}><StatusIcon status={execution.status} />
        <div><strong>{execution.result?.summary ?? executionStatus(execution.status)}</strong>
          <small>{formatTime(execution.updatedAt)}</small></div></div>
      {/* selectedExecution 已由精确 draft/release surface 过滤；只在这里使用该 surface 的 plan 合同。 */}
      {execution.result && <section className="context-result"><ExecutionResultView result={execution.result}
        outputContract={model.plan?.outputContract ?? null} /></section>}
      {["failed", "blocked"].includes(execution.status) && <p>当前没有链路修订入口；本次失败记录已保留。</p>}
      <ExecutionActions execution={execution} connection={connection} />
      {["completed", "partial", "failed", "blocked"].includes(execution.status) && <section className="context-feedback">
        {!reviewOpen ? <Button size="1" variant="ghost" onClick={() => setReviewOpen(true)}>记录结果反馈</Button> : <>
          <h4>结果反馈</h4><TextArea value={feedback} onChange={(event) => setFeedback(event.target.value)}
            placeholder="可选：说明与你预期不同的地方" maxLength={2000} />
          <div><Button size="1" variant="soft" disabled={reviewing} onClick={() => void review("accepted")}>符合预期</Button>
            <Button size="1" variant="ghost" disabled={reviewing}
              onClick={() => void review("requirement_revision")}>目标或结果含义需变更</Button>
            <Button size="1" variant="ghost" disabled={reviewing} onClick={() => setReviewOpen(false)}>取消</Button></div>
        </>}
      </section>}
      <details className="context-technical"><summary>技术详情</summary><dl><dt>状态</dt><dd>{execution.status}</dd>
        <dt>清理</dt><dd>{execution.cleanup.status}</dd></dl></details>
    </>}
  </aside>
}

function PreparationContext({ model, connection, onClose }: {
  model: LiveChainModel; connection: TaskChainConnection; onClose(): void
}) {
  const activity = model.workspace?.activity, request = activity?.inputRequest
  const failed = activity?.status === "failed" || activity?.status === "interrupted"
  const diagnostics = model.view.diagnostics?.preparation
  const currentDiagnostics = diagnostics?.jobId === activity?.id ? diagnostics : null
  const compilationRecovery = currentDiagnostics?.compilationRecovery
  const canRecoverCompilation = failed && activity?.phase === "compiling" && compilationRecovery?.available === true
  // WHY：来源可离线读取不保证方法正确；编译失败后仍须能沿原需求重新准备，旧来源和失败记录保留。
  const canRestartPreparation = failed && ["forming_plan", "preexecuting", "compiling"].includes(activity?.phase ?? "")
    && !model.workspace?.draft && Boolean(model.workspace?.requirement)
  const restingTitle = model.workspace?.draft ? "草稿已生成"
    : model.workspace?.release ? `已发布 V${model.workspace.release.reference.version}` : "当前没有生成任务"
  const restingDetail = activity || model.workspace?.draft || model.workspace?.release ? null : "尚未开始生成草稿。"
  const noParameters = request?.contract.schema.type === "null" || (request?.contract.schema.type === "object"
    && Object.keys(request.contract.schema.properties).length === 0)
  const [input, setInput] = useState<JsonValue | undefined>(() => request ? initialValue(request.contract.schema) : undefined)
  const [error, setError] = useState("")
  useEffect(() => setInput(request ? initialValue(request.contract.schema) : undefined), [activity?.id, activity?.sequence])
  useEffect(() => {
    if (failed) void connection.reloadDiagnostics()
  }, [activity?.id, activity?.sequence, connection, failed])
  async function submit() {
    if (!activity || !request || input === undefined) return
    try {
      const parsed = parseTaskValue(request.contract, input); setError("")
      if (await connection.dispatch({ type: "continue_preparation", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence, input: parsed })) onClose()
    } catch { setError("请按字段要求完成输入。") }
  }
  return <aside className="chain-inspector workspace-context" aria-label="草稿生成">
    <ContextHeader eyebrow="草稿生成" title={(noParameters && request?.purpose === "representative"
      ? "方案已通过，准备代表试做" : request?.prompt) ?? (activity
      ? preparationActivityLabel(activity.phase, activity.status) : restingTitle)} onClose={onClose} />
    {request && input !== undefined ? <>{!noParameters && <ValueSchemaForm contract={request.contract} value={input}
      onChange={setInput} disabled={connection.snapshot().busy} />}{error && <p className="error-text">{error}</p>}
      <Button disabled={model.view.busy} onClick={() => void submit()}>{model.view.busy ? "正在提交…"
        : request.purpose === "representative" ? "开始代表试做" : "开始独立复跑检查"}</Button></>
      : (activity?.reason ?? restingDetail) && <p>{activity?.reason ?? restingDetail}</p>}
    {activity?.status === "waiting_for_human" && activity.waitpoint?.status === "waiting" && <section>
      <p>请在原浏览器窗口完成处理，再继续这一次准备任务。</p>
      {model.view.error && <p className="error-text" role="alert">{model.view.error}</p>}
      <Button disabled={model.view.busy} aria-busy={model.view.busy} onClick={() => void connection.dispatch({
        type: "resume_preparation_human", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence, waitpointId: activity.waitpoint!.id,
      })}>{model.view.busy ? "正在核验并继续…" : "我已处理，继续"}</Button>
    </section>}
    {failed && activity?.phase === "compiling" && <p className="preparation-recovery-note">
      {compilationRecovery?.reason ?? "正在核对已保存的代表试做与编译恢复条件。"}
    </p>}
    {failed && <div className="context-actions">
      {activity && canRecoverCompilation && <Button size="1" disabled={model.view.busy} onClick={() => void connection.dispatch({
        type: "recover_preparation_compilation", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence,
      })}>{model.view.busy ? "正在提交…" : "只重新编译已保存试做"}</Button>}
      {canRestartPreparation && <Button size="1" disabled={model.view.busy} onClick={() => void connection.dispatch({
        type: "prepare_task", requestId: crypto.randomUUID(),
        requirementVersion: model.workspace!.requirement!.version,
      })}>{model.view.busy ? "正在提交…" : activity?.phase === "preexecuting"
        ? "重新试做当前需求" : "重新准备当前需求"}</Button>}
      {activity?.phase !== "forming_plan" && model.selectedExecution && <Button size="1" variant="soft"
        onClick={() => model.openContext("execution")}>查看本次试跑</Button>}
      <Button size="1" variant="soft" onClick={() => model.openContext("diagnostics")}>查看技术详情</Button>
    </div>}
    {activity && ["queued", "running", "waiting_for_human"].includes(activity.status)
      && <Button size="1" variant="ghost" color="red" disabled={model.view.busy}
      onClick={() => void connection.dispatch({ type: "cancel_authoring", jobId: activity.id })}>取消生成</Button>}
  </aside>
}

function HistoryContext({ model, connection, onClose }: {
  model: LiveChainModel; connection: TaskChainConnection; onClose(): void
}) {
  const [kind, setKind] = useState<"executions" | "releases">("executions")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const page = model.view.history[kind]
  const executionPage = model.view.history.executions
  const selected = kind === "executions" && executionPage?.kind === "executions"
    ? executionPage.items.find((item) => item.id === selectedId) ?? null : null
  useEffect(() => { if (!page) void connection.reloadHistory(kind) }, [connection, kind, page])
  return <aside className="chain-inspector workspace-context" aria-label="历史记录">
    <ContextHeader eyebrow="记录" title="运行与发布历史" onClose={onClose} />
    <SegmentedControl.Root value={kind} onValueChange={(value) => { setKind(value as typeof kind); setSelectedId(null) }}>
      <SegmentedControl.Item value="executions">运行</SegmentedControl.Item>
      <SegmentedControl.Item value="releases">发布</SegmentedControl.Item>
    </SegmentedControl.Root>
    {selected ? <HistoricalExecutionDetail key={selected.id} execution={selected} connection={connection}
      onBack={() => setSelectedId(null)} />
      : <div className="history-list">{page?.items.map((item) => "status" in item
        ? <article key={item.id}><span>{executionStatus(item.status)} · {item.release ? `已发布 V${item.release.version}`
          : item.draft ? "工作草稿试跑" : "历史运行"}</span><strong>{item.result?.summary ?? item.reason}</strong>
          <time>{formatTime(item.updatedAt)}</time><Button size="1" variant="ghost"
            onClick={() => setSelectedId(item.id)}>查看结果</Button></article>
        : <article key={`${item.id}:${item.version}`}><span>已发布 V{item.version}</span>
          <strong>{item.content.plan.summary}</strong><time>{formatTime(item.createdAt)}</time></article>)}</div>}
    {!page && <p>{model.view.historyBusy ? "正在读取…" : "暂无历史记录。"}</p>}
    {!selected && page && page.nextOffset !== null && <Button size="1" variant="soft" disabled={Boolean(model.view.historyBusy)}
      onClick={() => page && void connection.reloadHistory(kind, page.nextOffset ?? 0)}>加载更多</Button>}
  </aside>
}

function HistoricalExecutionDetail({ execution, connection, onBack }: {
  execution: TaskExecution; connection: TaskChainConnection; onBack(): void
}) {
  const [events, setEvents] = useState<TaskExecutionEventBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [eventsFailed, setEventsFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void connection.readHistoricalExecutionEvents(execution.id, controller.signal).then((batch) => {
      if (controller.signal.aborted) return
      setEvents(batch); setEventsFailed(!batch); setLoading(false)
    })
    return () => controller.abort()
  }, [connection, execution.id])
  const result = execution.result
  return <>
    <div className="context-actions"><Button size="1" variant="ghost" onClick={onBack}>返回运行历史</Button></div>
    <div className="context-status" data-tone={execution.status}><StatusIcon status={execution.status} />
      <div><strong>{result?.summary ?? executionStatus(execution.status)}</strong>
        <small>{formatTime(execution.updatedAt)}</small></div></div>
    <HistoricalBrowserHandoffActions execution={execution} connection={connection} />
    <dl><dt>使用版本</dt><dd>{execution.release ? `已发布 V${execution.release.version}`
      : execution.draft ? `工作草稿 · 修订 ${execution.draft.revision}` : "历史运行（无发布引用）"}</dd>
      <dt>运行用途</dt><dd>{execution.mode === "sample" ? "草稿试跑"
        : execution.mode === "verification" ? "独立复跑检查" : "正式运行"}</dd>
      {execution.cleanup.status !== "confirmed" && <><dt>资源清理</dt><dd>{cleanupStatus(execution.cleanup.status)}</dd></>}</dl>
    <section className="context-result"><h4>本次结果</h4>
      {result ? <ExecutionResultView result={result} outputContract={null} /> : <p>{execution.reason}</p>}</section>
    {execution.cleanup.status === "unconfirmed" && <section className="context-alert"><AlertTriangle size={15} />
      <div><strong>资源清理尚未确认</strong><p>{execution.cleanup.code ?? "请查看原执行的清理记录。"}</p></div></section>}
    <details className="context-technical"><summary>本次节点事件 · {loading ? "读取中" : events?.events.length ?? 0} 条</summary>
      {loading ? <p role="status">正在读取本次运行的节点事件…</p> : eventsFailed ? <p>事件暂时无法读取，请返回列表后重试。</p>
        : events?.events.length ? <ol>{events.events.map((item) => <li key={item.sequence}>
          <strong>{item.sequence}. {item.nodeTitle ?? "未记录动作名称"} · {historicalEventStatus(item.event.status, item.event.outcome)}</strong>
          <small>{formatTime(item.event.at)} · {item.stepTitle ?? (execution.steps.findIndex((step) => step.stepId === item.stepId) >= 0
            ? `第 ${execution.steps.findIndex((step) => step.stepId === item.stepId) + 1} 步` : "步骤未关联")}</small>
        </li>)}</ol> : <p>这次运行没有保存节点事件。</p>}
    </details>
    <details className="context-technical"><summary>原始记录</summary>
      <pre>{JSON.stringify({ execution, events }, null, 2)}</pre></details>
  </>
}

function DiagnosticsContext({ model, connection, onClose }: {
  model: LiveChainModel; connection: TaskChainConnection; onClose(): void
}) {
  useEffect(() => { if (!model.view.diagnostics) void connection.reloadDiagnostics() }, [connection, model.view.diagnostics])
  const diagnostics = model.view.diagnostics
  return <aside className="chain-inspector workspace-context" aria-label="诊断详情">
    <ContextHeader eyebrow="诊断" title="失败依据" onClose={onClose} />
    {!diagnostics ? <p>{model.view.diagnosticsBusy ? "正在读取…" : "暂无诊断信息。"}</p> : <>
      {diagnostics.preparation ? <section className="context-alert"><AlertTriangle size={15} /><div>
        <strong>{preparationActivityLabel(diagnostics.preparation.phase, diagnostics.preparation.status)}</strong>
        <p>{diagnostics.preparation.reason ?? diagnostics.preparation.compilationRecovery?.reason ?? "查看原始记录了解详情。"}</p>
      </div></section> : <p>暂无待处理的准备诊断。</p>}
      <details className="context-technical"><summary>原始诊断</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>
    </>}
  </aside>
}
