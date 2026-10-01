import { useState } from "react"
import { Button, TextArea } from "@radix-ui/themes"
import type { TaskChainCommand, TaskExecutionReviewReceipt } from "@browser-capture/contracts"
import { ExecutionActions } from "./ExecutionActions.js"
import { StatusIcon, executionStatus, cleanupStatus, formatTime } from "./ExecutionPresentation.js"
import { CallSelection } from "./ChainBoundaryContext.js"
import { SavedResultDialog, callOutputContracts } from "./SavedResultDialog.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { LiveChainModel } from "./useLiveChain.js"
import { recordedBrowserLabel } from "./BrowserEnvironmentSelect.js"

type ReviewCommand = Extract<TaskChainCommand, { type: "review_execution" }>
export function ExecutionContext({ model, connection, feedback, setFeedback, onClose, onRequirementRevision }: {
  model: LiveChainModel; connection: TaskChainConnection; feedback: string; setFeedback(value: string): void
  onClose(): void; onRequirementRevision(review: TaskExecutionReviewReceipt): Promise<boolean>
}) {
  const execution = model.detail?.execution ?? model.selectedExecution
  const [reviewOpen, setReviewOpen] = useState(false)
  const intent = execution ? model.view.reviewIntents[execution.id] : null
  const reviewing = intent?.busy ?? false, pending = Boolean(intent)
  const text = intent?.command.feedback ?? feedback
  const otherIntents = Object.values(model.view.reviewIntents).filter(item => item.command.executionId !== execution?.id)
  async function review(decision: "accepted" | "requirement_revision") {
    if (!execution || reviewing) return
    const command: ReviewCommand = intent?.command ?? { type: "review_execution", requestId: crypto.randomUUID(),
      executionId: execution.id, expectedSequence: execution.sequence, decision, feedback: feedback.trim() || null,
      ...(decision === "requirement_revision" && model.step ? { selection: { stepId: model.step.stepId,
        runId: model.selectedRunId ?? model.selectedCall?.run.binding.runId ?? null } } : {}) }
    if (await connection.submitReview(command, onRequirementRevision)) setReviewOpen(false)
  }
  const result = model.detail?.execution.cleanupResume?.result ?? execution?.result ?? null
  const businessStatus = model.detail?.execution.cleanupResume?.status ?? execution?.status
  const canReview = ["completed", "partial", "failed", "blocked", "cancelled"].includes(businessStatus ?? "")
  const entered = model.detail ? model.detail.execution.steps.some(step => step.runIds.length > 0) : null
  return <aside className="chain-inspector workspace-context" aria-label="当前执行">
    <header><span>运行</span><button onClick={onClose} aria-label="关闭上下文区">×</button><h3>本次结果</h3></header>
    {!execution ? <p>{model.acceptedExecutionId ? "已提交，正在等待本次运行记录。" : "尚未运行。"}</p> : <>
      <div className="context-status" data-tone={businessStatus}><StatusIcon status={businessStatus ?? execution.status} />
        <div><strong>{executionStatus(businessStatus ?? execution.status)}</strong><small>{formatTime(execution.updatedAt)}</small></div></div>
      <p>本次浏览器：{recordedBrowserLabel(execution.browser)}</p>
      {entered === false && canReview && <p>本次在步骤开始前结束，没有执行动作或返回成果。</p>}
      {entered === false && canReview && <p role="alert">{result?.failure?.reason ?? model.detail?.execution.cleanupResume?.reason ?? model.detail?.execution.reason}</p>}
      {entered !== false && <SavedResultDialog result={result} outputContract={model.plan?.outputContract ?? null} />}<CallSelection model={model} />
      {model.selectedCall && <SavedResultDialog result={model.selectedCall.run.outputs} scope="call" outputContract={callOutputContracts(model.chain)} />}
      {model.view.detailBusy && !model.detail && <p role="status">正在读取本次调用…</p>}
      {model.view.detailError && <p role="alert">{model.view.detailError}</p>}
      {execution.status === "cleanup_required" && <p>业务结论已保留；资源清理{cleanupStatus(execution.cleanup.status)}。</p>}
      {model.plan?.browserHandoff === "keep_open" && execution.browserHandoff.status === "unavailable"
        && <p>原页面交付尚未确认，详见现场记录。</p>}
      <ExecutionActions execution={execution} connection={connection} />
      {canReview && <section className="context-feedback">{!reviewOpen && !pending ? <Button size="1" variant="ghost"
        onClick={() => setReviewOpen(true)}>重新说明需求</Button> : <>
        <h4>重新说明需求</h4><p>将保存你的原话，携带本次运行、需求 v{model.detail?.execution.requirement.version ?? model.plan?.requirement.version}
          {execution.release ? `、发布 V${execution.release.version}` : "、草稿版本"}及所选调用的结果引用，回到同一个任务的需求对话。</p>
        {model.workspace?.requirement && model.detail && model.workspace.requirement.version !== model.detail.execution.requirement.version
          && <p>当前需求已有更新；原运行上下文将明确标为旧版本，不覆盖当前草案。</p>}
        <TextArea value={text} disabled={reviewing || pending} onChange={(event) => setFeedback(event.target.value)}
          placeholder="说明目标、来源、范围或交付哪里理解不对" maxLength={2000} />
        {(intent?.error || model.view.error) && <p role="alert">{intent?.error || model.view.error}</p>}
        <div><Button size="1" disabled={reviewing || intent?.command.decision !== "accepted" && !text.trim()} aria-busy={reviewing}
          onClick={() => void review("requirement_revision")}>{reviewing ? "正在提交…" : pending ? "重试同一需求说明" : "提交并返回需求对话"}</Button>
          {businessStatus === "completed" && !pending && <Button size="1" variant="soft" disabled={reviewing}
            onClick={() => void review("accepted")}>符合预期</Button>}
          {!pending && <Button size="1" variant="ghost" disabled={reviewing} onClick={() => setReviewOpen(false)}>取消</Button>}
          {pending && <Button size="1" variant="ghost" onClick={onClose}>稍后继续</Button>}
          {model.view.errorCode === "execution_review_stale" && <Button size="1" variant="soft" onClick={() => {
            setFeedback(text); connection.resetStaleReview(execution.id) }}>按最新运行重新提交</Button>}</div>
      </>}</section>}
      <details className="context-technical"><summary>技术详情</summary><pre>{JSON.stringify({ execution,
        selectedCall: model.selectedCall?.run.binding }, null, 2)}</pre></details>
    </>}
    {otherIntents.map(item => <section className="context-feedback" key={item.command.requestId}>
      <h4>原运行尚未提交的说明</h4><p>{item.command.feedback ?? "符合预期的反馈"}</p>
      {item.error && <p role="alert">{item.error}</p>}
      <Button size="1" disabled={item.busy || model.view.busy} aria-busy={item.busy}
        onClick={() => void connection.submitReview(item.command, onRequirementRevision)}>
        {item.busy ? "正在提交原说明…" : "继续同一提交"}</Button>
      <details><summary>原运行引用</summary><pre>{JSON.stringify(item.saved?.context ?? {
        executionId: item.command.executionId, selection: item.command.selection }, null, 2)}</pre></details>
    </section>)}
  </aside>
}
