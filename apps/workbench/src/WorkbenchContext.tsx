import { useEffect, useRef, useState } from "react"
import { Badge, Button, SegmentedControl, TextArea } from "@radix-ui/themes"
import { AlertTriangle, CheckCircle2, Clock3, History, Wrench } from "lucide-react"
import { parseTaskValue, type JsonValue, type TaskExecution, type TaskExecutionEventBatch,
  type TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { ChainInspector } from "./ChainInspector.js"
import { actionPresentation } from "./chainNodePresentation.js"
import { nodeInsertionOperations, nodeRemovalOperations, nodeRouteOperations } from "./chainCanvasEditing.js"
import { ValueSchemaForm, initialValue } from "./ValueSchemaForm.js"
import { AdjustmentAcceptedState } from "./AdjustmentAcceptedState.js"
import { ExecutionActions } from "./ExecutionActions.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import { preparationActivityLabel, type LiveChainModel } from "./useLiveChain.js"

export function WorkbenchContext({ model, connection, active, onRequirementRevision }: {
  model: LiveChainModel
  connection: TaskChainConnection
  active: boolean
  onRequirementRevision(summary: string, feedback: string): Promise<void>
}) {
  const { chain, presentation, selectedStage, selectedNode, draft, chainEvents, selectedDescriptor, view,
    editingBusy, contextMode } = model
  const [feedback, setFeedback] = useState("")
  useEffect(() => setFeedback(""), [model.selectedExecution?.id])
  if (chain && presentation && (selectedNode || selectedStage)) return <ChainInspector chain={chain}
    presentation={presentation} stage={selectedStage} node={selectedNode} draft={draft} batch={chainEvents}
    descriptor={selectedDescriptor} targetSelection={view.targetSelection} busy={editingBusy}
    onClose={model.closeContext} onEnter={(id) => { model.setFocusStageId(id); model.setSelectedStageId(null); model.setSelectedNodeId(null) }}
    onAdjust={(nodeId) => { setFeedback(""); model.openAdjustment(model.step?.stepId ?? null, nodeId) }}
    onInsert={(next) => selectedNode && model.mutate(() => nodeInsertionOperations(chain, presentation, selectedNode.id, next))}
    onRemove={() => selectedNode && model.mutate(() => nodeRemovalOperations(chain, presentation, selectedNode.id))}
    onRoute={(port, target) => selectedNode && model.mutate(() => nodeRouteOperations(chain, presentation, selectedNode.id, port, target))}
    onReplaceNode={(next) => model.apply([...(next.kind === "capability" && selectedNode?.kind === "capability"
      && JSON.stringify(next.config) !== JSON.stringify(selectedNode.config)
      ? [{ type: "replace_capability" as const, nodeId: next.id, capability: next.capability, config: next.config }] : []),
    { type: "replace_node", node: next }])}
    onReplaceCapability={(config) => selectedNode?.kind === "capability" && model.apply([{
      type: "replace_capability", nodeId: selectedNode.id, capability: selectedNode.capability, config,
    }])}
    onPickTarget={() => draft && selectedNode && chain && void connection.startTargetSelection({ draftId: draft.id,
      chainId: chain.id, nodeId: selectedNode.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })}
    onCancelTarget={() => void connection.cancelTargetSelection()} />
  if (!contextMode) return null
  if (contextMode === "execution") return <ExecutionContext model={model} connection={connection}
    feedback={feedback} setFeedback={setFeedback} onClose={model.closeContext}
    onRequirementRevision={onRequirementRevision} />
  if (contextMode === "preparation") return <PreparationContext model={model} connection={connection} onClose={model.closeContext} />
  if (contextMode === "adjustment") return <AdjustmentContext model={model} connection={connection} active={active}
    feedback={feedback} setFeedback={setFeedback} onClose={model.closeContext}
    onRequirementRevision={onRequirementRevision} />
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
  async function review(decision: "accepted" | "requirement_revision") {
    if (!execution) return
    setReviewing(true)
    const summary = execution.result?.summary ?? executionStatus(execution.status)
    const accepted = await connection.dispatch({ type: "review_execution", requestId: crypto.randomUUID(),
      executionId: execution.id, expectedSequence: execution.sequence, decision,
      feedback: feedback.trim() || null, chain: null })
    if (accepted && decision === "requirement_revision") await onRequirementRevision(summary, feedback.trim() || "需要重新确认需求。")
    setReviewing(false)
  }
  return <aside className="chain-inspector workspace-context" aria-label="当前执行">
    <ContextHeader eyebrow="当前执行" title={execution ? executionStatus(execution.status) : "尚未运行"} onClose={onClose} />
    {!execution ? <p>试跑草稿或运行已发布任务后，这里显示同一次 execution 的结果。</p> : <>
      <div className="context-status" data-tone={execution.status}><StatusIcon status={execution.status} />
        <div><strong>{execution.result?.summary ?? executionStatus(execution.status)}</strong>
          <small>{formatTime(execution.updatedAt)}</small></div></div>
      {execution.result?.payload.mode === "data" && <section className="context-result"><h4>业务结果</h4>
        {execution.result.payload.output?.kind === "value"
          ? <ResultValue value={execution.result.payload.output.value} />
          : execution.result.payload.output?.kind === "artifact" ? <p>结果已保存为本地产物。</p>
            : <p>本次运行没有返回结构化数据。</p>}</section>}
      {execution.result?.failure && <section className="context-alert"><AlertTriangle size={15} />
        <div><strong>动作未完成</strong><p>{execution.result.failure.reason}</p></div></section>}
      <ExecutionActions execution={execution} connection={connection} />
      {["completed", "partial", "failed", "blocked"].includes(execution.status) && <section className="context-feedback">
        <h4>这个结果符合预期吗？</h4><TextArea value={feedback} onChange={(event) => setFeedback(event.target.value)}
          placeholder="可选：说明需要调整的地方" maxLength={2000} />
        <div><Button size="1" variant="soft" disabled={reviewing} onClick={() => void review("accepted")}>符合预期</Button>
          <Button size="1" variant="soft" disabled={reviewing}
            onClick={() => model.openAdjustment(model.step?.stepId ?? null, null)}>调整链路</Button>
          <Button size="1" variant="ghost" disabled={reviewing} onClick={() => void review("requirement_revision")}>重新梳理需求</Button></div>
      </section>}
      <details className="context-technical"><summary>技术详情</summary><dl><dt>状态</dt><dd>{execution.status}</dd>
        <dt>清理</dt><dd>{execution.cleanup.status}</dd></dl></details>
    </>}
  </aside>
}

function AdjustmentContext({ model, connection, active, feedback, setFeedback, onClose, onRequirementRevision }: {
  model: LiveChainModel; connection: TaskChainConnection; active: boolean; onClose(): void
  feedback: string; setFeedback(value: string): void
  onRequirementRevision(summary: string, feedback: string): Promise<void>
}) {
  const record = model.workspace?.adjustment
  const adjustment = record?.value
  const candidate = adjustment?.candidate
  const execution = model.selectedExecution
  const [submitting, setSubmitting] = useState(false)
  const previousAdjustment = useRef({ jobId: record?.jobId, decision: adjustment?.decision })
  const recovery = model.view.diagnostics?.adjustmentRecovery
  const currentRecovery = recovery?.jobId === record?.jobId ? recovery : null
  useEffect(() => {
    if (active && record?.status === "failed") void connection.reloadDiagnostics()
  }, [active, connection, record?.jobId, record?.sequence, record?.status])
  const pendingAdjustment = adjustment && ["generating", "pending", "needs_clarification", "requirement_revision"]
    .includes(adjustment.decision) && ["queued", "running", "waiting_for_human"].includes(record?.status ?? "")
  const generating = pendingAdjustment && adjustment?.decision === "generating"
  useEffect(() => {
    const newlyAccepted = adjustment?.decision === "accepted"
      && previousAdjustment.current.jobId === record?.jobId && previousAdjustment.current.decision !== "accepted"
    previousAdjustment.current = { jobId: record?.jobId, decision: adjustment?.decision }
    if (newlyAccepted) {
      setFeedback("")
      return
    }
    if (!feedback.trim() && adjustment && (["failed", "interrupted"].includes(record?.status ?? "")
      || adjustment.decision === "needs_clarification")) setFeedback(adjustment.feedback)
  }, [record?.jobId, record?.status, adjustment?.decision])
  const targetStep = model.adjustmentTarget?.stepId
    ? execution?.steps.find((step) => step.stepId === model.adjustmentTarget?.stepId) : execution?.steps[0]
  const baselineContent = adjustment?.baseline.kind === "draft" ? model.workspace?.draft?.content
    : model.workspace?.release?.value.content
  const baselineMatches = adjustment ? adjustmentBaselineMatches(adjustment, model.workspace) : false
  async function request() {
    if (!execution || !targetStep || !feedback.trim()) return
    setSubmitting(true)
    await connection.dispatch({ type: "request_chain_adjustment", requestId: crypto.randomUUID(),
      executionId: execution.id, expectedSequence: execution.sequence, chain: targetStep.chain,
      stepId: targetStep.stepId, nodeId: model.adjustmentTarget?.nodeId ?? null, feedback: feedback.trim() })
    setSubmitting(false)
  }
  async function decide(type: "accept_chain_adjustment" | "reject_chain_adjustment" | "cancel_chain_adjustment"
    | "recover_chain_adjustment") {
    if (!record) return
    setSubmitting(true)
    await connection.dispatch({ type, requestId: crypto.randomUUID(), jobId: record.jobId,
      expectedSequence: record.sequence })
    setSubmitting(false)
  }
  return <aside className="chain-inspector workspace-context" aria-label="链路调整">
    <ContextHeader eyebrow="已有链路调整" title={candidate && pendingAdjustment ? "查看修改建议" : "说明问题"} onClose={onClose} />
    {pendingAdjustment && adjustment ? <>
      <div className="context-status" data-tone={candidate ? "completed" : record?.status}>
        <Clock3 size={18} /><div><strong>{candidate ? "建议已通过链路合同校验，等待确认"
          : generating ? "正在依据本次运行生成建议" : adjustment.decision === "needs_clarification"
            ? "还需要业务说明" : "请返回需求对话"}</strong>
          <small>{record?.reason}</small></div></div>
      <section className="context-result"><h4>你的说明</h4><p>{adjustment.feedback}</p></section>
      {generating && <p>模型正在读取已确认需求、准确链路版本和本次运行证据；建议生成不控制浏览器。</p>}
      {adjustment.guidance && <section className="context-alert"><AlertTriangle size={15} />
        <div><strong>需要你决定</strong><p>{adjustment.guidance}</p></div></section>}
      {adjustment.decision === "needs_clarification" && <><TextArea value={feedback}
        onChange={(event) => setFeedback(event.target.value)} maxLength={2000}
        placeholder="补充业务预期或缺少的运行事实后重新提出。" />
        <Button size="1" disabled={!feedback.trim() || submitting || model.view.busy || !targetStep}
          onClick={() => void request()}>补充说明并重新生成</Button></>}
      {adjustment.decision === "requirement_revision" && <Button size="1" variant="soft"
        disabled={submitting || model.view.busy} onClick={() => void onRequirementRevision(
          execution?.result?.summary ?? "需要重新确认任务需求",
          `${adjustment.feedback}\n${adjustment.guidance ?? ""}`)}>返回需求对话</Button>}
      {candidate && <><section className="context-result"><h4>{candidate.summary}</h4><p>{candidate.rationale}</p>
        {!baselineMatches && <p className="preparation-recovery-note">当前草稿或发布基线已变化，这份建议已过期，不能应用。</p>}
        {candidate.diff.map((item) => {
          const before = baselineContent?.steps.find((step) => step.stepId === item.stepId)
          const after = candidate.content.steps.find((step) => step.stepId === item.stepId)
          return <div className="adjustment-diff" key={item.stepId}><strong>{item.title}</strong>
            <p>变更 {item.changedActions} 个动作、{item.changedRoutes} 条路线</p>
            <dl><dt>原有动作</dt><dd>{before ? before.chain.nodes.map((node) => actionPresentation(node).title).join("、") : "原版本不可用"}</dd>
              <dt>建议动作</dt><dd>{after?.chain.nodes.map((node) => actionPresentation(node).title).join("、") ?? "候选不可用"}</dd></dl>
          </div>
        })}</section>
        <details className="context-technical"><summary>完整修改差异与合同</summary>
          <pre>{JSON.stringify({ operations: candidate.operations, diff: candidate.diff,
            contentDigest: candidate.digest }, null, 2)}</pre></details></>}
      <div className="context-actions">
        {candidate && <><Button size="1" disabled={submitting || model.view.busy || !baselineMatches}
          onClick={() => void decide("accept_chain_adjustment")}>{submitting ? "正在提交…" : "接受并应用"}</Button>
          <Button size="1" variant="soft" disabled={submitting || model.view.busy}
            onClick={() => void decide("reject_chain_adjustment")}>不采用</Button></>}
        <Button size="1" variant="ghost" disabled={submitting || model.view.busy}
          onClick={() => void decide("cancel_chain_adjustment")}>取消请求</Button>
      </div>
    </> : <>
      {adjustment?.decision === "accepted" && <AdjustmentAcceptedState workspace={model.workspace}
        adjustment={adjustment} onTrial={() => model.setRunDialogMode("trial")}
        onRun={() => model.setRunDialogMode("run")} />}
      {["rejected", "cancelled"].includes(adjustment?.decision ?? "") && <p>上一次修改请求已结束，链路保持原样。</p>}
      {["failed", "interrupted"].includes(record?.status ?? "") && <section className="context-alert">
        <AlertTriangle size={15} /><div><strong>建议生成未完成</strong><p>{record?.reason}</p></div></section>}
      {record?.status === "failed" && <p className="preparation-recovery-note">
        {currentRecovery?.reason ?? (model.view.diagnosticsBusy ? "正在核对已保存模型输出与当前链路证据。"
          : "尚未读到本次恢复诊断，请重新读取。")}</p>}
      {record?.status === "failed" && !currentRecovery && !model.view.diagnosticsBusy && <Button size="1"
        variant="soft" onClick={() => void connection.reloadDiagnostics()}>重新读取恢复诊断</Button>}
      {record?.status === "failed" && currentRecovery?.available && <Button size="1"
        disabled={submitting || model.view.busy} onClick={() => void decide("recover_chain_adjustment")}>
        {submitting || model.view.busy ? "正在恢复…" : "从已保存建议继续审阅"}</Button>}
      {!execution ? <p>请先从当前运行结果或有运行证据的步骤提出问题；没有运行证据时先试跑链路。</p>
        : !targetStep ? <p>所选步骤不属于当前运行，请重新选择对应步骤或从结果入口提出问题。</p>
        : <><p>说明哪里不对、希望怎样。将自动关联本次运行、所选步骤和准确链路版本。</p>
          <TextArea value={feedback} onChange={(event) => setFeedback(event.target.value)}
            placeholder="例如：结果缺少我需要的字段，期望保留原页面可见的值。" maxLength={2000} />
          <div className="context-actions"><Button size="1" disabled={!feedback.trim() || submitting || model.view.busy}
            onClick={() => void request()}>{submitting || model.view.busy ? "正在提交…" : "生成修改建议"}</Button></div></>}
    </>}
  </aside>
}

function adjustmentBaselineMatches(adjustment: NonNullable<TaskWorkspaceSnapshot["adjustment"]>["value"],
  workspace: TaskWorkspaceSnapshot | null) {
  if (!workspace) return false
  if (adjustment.baseline.kind === "draft") {
    const draft = workspace.draft, baseline = adjustment.baseline.draft
    return Boolean(draft && draft.id === baseline.id && draft.revision === baseline.revision
      && draft.checksum === baseline.checksum)
  }
  const release = workspace.release?.reference, baseline = adjustment.baseline.release
  return Boolean(!workspace.draft && release && release.id === baseline.id && release.version === baseline.version
    && release.digest === baseline.digest)
}

function PreparationContext({ model, connection, onClose }: {
  model: LiveChainModel; connection: TaskChainConnection; onClose(): void
}) {
  const activity = model.workspace?.activity, request = activity?.inputRequest
  const failed = activity?.status === "failed" || activity?.status === "interrupted"
  const diagnostics = model.view.diagnostics?.preparation
  const currentDiagnostics = diagnostics?.jobId === activity?.id ? diagnostics : null
  const candidates = currentDiagnostics?.planCandidates ?? []
  const compilationRecovery = currentDiagnostics?.compilationRecovery
  const planRecovery = currentDiagnostics?.planRecovery
  const canRecoverCompilation = failed && activity?.phase === "compiling" && compilationRecovery?.available === true
  const canResumePlan = failed && ["preexecuting", "compiling"].includes(activity?.phase ?? "") && planRecovery?.available === true
    && planRecovery.sourceJobId === activity.id
  const canCorrectPlan = failed && activity?.phase === "forming_plan" && candidates.length > 0
    && candidates.length < 4 && Boolean(candidates.at(-1)?.issues.length)
  const restingTitle = model.workspace?.draft ? "草稿已生成"
    : model.workspace?.release ? `已发布 V${model.workspace.release.reference.version}` : "当前没有生成任务"
  const restingDetail = model.workspace?.draft ? "草稿和验证记录已保存，可在画布继续试跑或发布。"
    : model.workspace?.release ? "当前发布版本可从画布再次运行；历史结果可按次查看。" : "尚未开始生成草稿。"
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
    {activity && <div className="context-status" data-tone={activity.status}><StatusIcon status={activity.status} />
      <div><strong>{preparationActivityLabel(activity.phase, activity.status)}</strong>
        <small>{formatTime(activity.updatedAt)}</small></div></div>}
    {request && input !== undefined ? <>{noParameters
      ? <p>这条任务无需填写业务输入，可以开始代表试做。</p>
      : <ValueSchemaForm contract={request.contract} value={input} onChange={setInput}
        disabled={connection.snapshot().busy} />}{error && <p className="error-text">{error}</p>}
      <Button disabled={model.view.busy} onClick={() => void submit()}>{model.view.busy ? "正在提交…"
        : request.purpose === "representative" ? "开始代表试做" : "开始独立复跑检查"}</Button></>
      : <p>{activity?.reason ?? restingDetail}</p>}
    {failed && activity?.phase === "forming_plan" && <section className="preparation-plan-diagnostics"
      aria-label="方案候选诊断">
      {model.view.diagnosticsBusy && !currentDiagnostics ? <p role="status">正在读取原方案候选与失败原因…</p>
        : !currentDiagnostics ? <p>尚未读到本次失败的诊断记录，请查看技术详情。</p>
        : candidates.length > 0 ? <><h4>方案结果归属检查</h4>
          <p>已保留 {candidates.length} 份方案候选。{candidates.length < 4
            ? "继续操作会从最后一份候选纠正合同问题。" : "本轮已达到四次候选上限，请先检查需求或失败证据。"}</p>
          <ol>{candidates.map((candidate) => <li key={`${candidate.attempt}:${candidate.digest}`}>
            <strong>第 {candidate.attempt} 次候选</strong>
            {candidate.issues.length ? <ul>{candidate.issues.map((issue, index) =>
              <li key={`${candidate.attempt}:${index}`}><span>{planIssueText(issue.message)}</span>
                {issue.path.length > 0 && <small>{planIssueLocation(issue.path)}</small>}</li>)}</ul>
              : <p>这份候选未保存可展示的合同问题。</p>}
          </li>)}</ol></>
          : <p>当前没有可续用的方案候选；原失败记录已保留。</p>}
    </section>}
    {failed && activity?.phase === "compiling" && <p className="preparation-recovery-note">
      {compilationRecovery?.reason ?? "正在核对已保存的代表试做与编译恢复条件。"}
    </p>}
    {failed && activity?.phase === "compiling" && planRecovery?.available &&
      <p className="preparation-recovery-note">{planRecovery.reason}</p>}
    {failed && activity?.phase === "preexecuting" && <p className="preparation-recovery-note">
      {planRecovery?.reason ?? "正在核对已保存方案与预执行恢复条件。"}
    </p>}
    {failed && !["forming_plan", "compiling", "preexecuting"].includes(activity?.phase ?? "") && <p className="preparation-recovery-note">
      此阶段尚无安全续接操作。先核对已保存的观察或试跑事实，再从失败层处理。
    </p>}
    {failed && <div className="context-actions">
      {activity && canCorrectPlan && <Button size="1" disabled={model.view.busy} onClick={() => void connection.dispatch({
        type: "correct_preparation_plan", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence,
      })}>{model.view.busy ? "正在提交…" : "继续纠正方案"}</Button>}
      {activity && canRecoverCompilation && <Button size="1" disabled={model.view.busy} onClick={() => void connection.dispatch({
        type: "recover_preparation_compilation", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence,
      })}>{model.view.busy ? "正在提交…" : "只重新编译已保存试做"}</Button>}
      {activity && canResumePlan && <Button size="1" disabled={model.view.busy} onClick={() => void connection.dispatch({
        type: "resume_preparation_from_plan", requestId: crypto.randomUUID(), jobId: activity.id,
        expectedSequence: activity.sequence,
      })}>{model.view.busy ? "正在提交…" : activity.phase === "compiling"
        ? "沿已保存方案重新采集" : "沿已保存方案继续试做"}</Button>}
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
    <ContextHeader eyebrow="按需读取" title="历史记录" onClose={onClose} />
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
            onClick={() => setSelectedId(item.id)}>查看本次结果与事件</Button></article>
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
    <p>历史记录只在此查看；当前画布仍绑定原来的运行。</p>
    <dl><dt>使用版本</dt><dd>{execution.release ? `已发布 V${execution.release.version}`
      : execution.draft ? `工作草稿 · 修订 ${execution.draft.revision}` : "历史运行（无发布引用）"}</dd>
      <dt>运行用途</dt><dd>{execution.mode === "sample" ? "草稿试跑"
        : execution.mode === "verification" ? "独立复跑检查" : "正式运行"}</dd>
      <dt>资源清理</dt><dd>{cleanupStatus(execution.cleanup.status)}
        {execution.cleanup.attempt > 0 ? ` · 第 ${execution.cleanup.attempt} 次核验` : ""}</dd></dl>
    <section className="context-result"><h4>本次结果</h4>
      {result?.payload.mode === "data" ? result.payload.output?.kind === "value"
        ? <ResultValue value={result.payload.output.value} />
        : result.payload.output?.kind === "artifact" ? <p>结果保存为 {result.payload.output.artifact.mediaType} 产物。</p>
          : <p>本次运行没有返回结构化数据。</p>
        : result?.payload.mode === "execution" ? <p>完成 {result.payload.completedSteps} / {result.payload.totalSteps} 个步骤；
          保存 {result.payload.evidence.length} 份证据产物。</p>
          : <p>{execution.reason}</p>}</section>
    {result?.failure && <section className="context-alert"><AlertTriangle size={15} /><div>
      <strong>失败原因</strong><p>{result.failure.reason}</p></div></section>}
    {execution.cleanup.status === "unconfirmed" && <section className="context-alert"><AlertTriangle size={15} />
      <div><strong>资源清理尚未确认</strong><p>{execution.cleanup.code ?? "请查看原执行的清理记录。"}</p></div></section>}
    <details className="context-technical"><summary>本次节点事件 · {loading ? "读取中" : events?.events.length ?? 0} 条</summary>
      {loading ? <p role="status">正在读取本次运行的节点事件…</p> : eventsFailed ? <p>事件暂时无法读取，请返回列表后重试。</p>
        : events?.events.length ? <ol>{events.events.map((item) => <li key={item.sequence}>
          <strong>{item.sequence}. {historicalEventStatus(item.event.status, item.event.outcome)}</strong>
          <small>{formatTime(item.event.at)} · 步骤 {item.stepId} · 节点 {item.event.nodeId}</small>
        </li>)}</ol> : <p>这次运行没有保存节点事件。</p>}
    </details>
    <details className="context-technical"><summary>完整运行与事件合同</summary>
      <pre>{JSON.stringify({ execution, events }, null, 2)}</pre></details>
  </>
}

function DiagnosticsContext({ model, connection, onClose }: {
  model: LiveChainModel; connection: TaskChainConnection; onClose(): void
}) {
  useEffect(() => { if (!model.view.diagnostics) void connection.reloadDiagnostics() }, [connection, model.view.diagnostics])
  const diagnostics = model.view.diagnostics
  return <aside className="chain-inspector workspace-context" aria-label="诊断详情">
    <ContextHeader eyebrow="按需读取" title="诊断详情" onClose={onClose} />
    {!diagnostics ? <p>{model.view.diagnosticsBusy ? "正在读取…" : "暂无诊断信息。"}</p> : <>
      <div className="diagnostic-count"><Wrench size={16} /><strong>{diagnostics.capabilityDescriptors.length}</strong><span>项能力描述</span></div>
      {diagnostics.legacy.length > 0 && <section className="context-alert"><AlertTriangle size={15} /><div>
        <strong>{diagnostics.legacy.length} 条只读兼容记录</strong><p>历史仍可读取，不进入当前草稿写入路径。</p></div></section>}
      <details className="context-technical"><summary>原始诊断</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>
    </>}
  </aside>
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 size={18} />
  if (["failed", "blocked"].includes(status)) return <AlertTriangle size={18} />
  return <Clock3 size={18} />
}

function ResultValue({ value }: { value: JsonValue | null }) {
  if (value === null) return <p>本次运行没有返回结构化数据。</p>
  if (Array.isArray(value)) return <ol className="context-value-list">{value.map((item, index) => <li key={index}><ResultValue value={item} /></li>)}</ol>
  if (typeof value === "object") return <dl className="context-value-record">{Object.entries(value).map(([key, item]) =>
    <div key={key}><dt>{key}</dt><dd><ResultValue value={item} /></dd></div>)}</dl>
  return <span>{String(value)}</span>
}

function executionStatus(status: string) {
  return ({ queued: "已排队", running: "正在运行", completed: "运行完成", partial: "部分完成",
    waiting_for_human: "等待人工处理", paused: "已暂停", cleanup_required: "动作完成，待清理",
    blocked: "运行受阻", failed: "运行失败", cancelled: "已取消", stale: "历史运行" } as Record<string, string>)[status] ?? status
}

function cleanupStatus(status: string) {
  return ({ not_recorded: "未记录", pending: "清理中", confirmed: "已确认",
    unconfirmed: "待确认" } as Record<string, string>)[status] ?? status
}

function historicalEventStatus(status: string, outcome: string | null) {
  if (status === "planned") return "已排队"
  if (status === "started") return "正在运行"
  return outcome === "success" ? "成功" : `已结束 · ${outcome ?? "未知出口"}`
}

function planIssueText(message: string) {
  return ({ result_spec_path_conflict: "多个结果字段声明了重叠的来源路径。",
    result_spec_optional_field_edge_case_required: "可选结果字段缺少边界情况说明。",
    result_spec_required_path_missing: "必需结果字段缺少来源归属。",
    result_spec_path_missing: "结果字段指向的路径不存在。" } as Record<string, string>)[message] ?? message
}

function planIssueLocation(path: (string | number)[]) {
  const parts: string[] = []
  for (let index = 0; index < path.length; index++) {
    const item = path[index], next = path[index + 1]
    if (item === "steps" && typeof next === "number") { parts.push(`第 ${next + 1} 步`); index++; continue }
    if (item === "fields" && typeof next === "number") { parts.push(`第 ${next + 1} 个结果字段`); index++; continue }
    if (item === "resultSpec") { parts.push("结果定义"); continue }
    if (item === "edgeCases") { parts.push("边界情况"); continue }
    if (item === "path") { parts.push("字段路径"); continue }
    if (typeof item === "string") parts.push(item)
  }
  return parts.join(" · ")
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
