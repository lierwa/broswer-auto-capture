import { useEffect, useState } from "react"
import { Button, TextArea } from "@radix-ui/themes"
import type { TaskChainCommand, TaskExecutionReviewReceipt } from "@browser-capture/contracts"
import { executionOutcome } from "./ExecutionPresentation.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { LiveChainModel } from "./useLiveChain.js"

type ReviewCommand = Extract<TaskChainCommand, { type: "review_execution" }>
// WHY：保留原反馈的幂等与版本引用；结果入口只由终点与历史承接。
export function ExecutionFeedback({ model, connection, onRequirementRevision, pendingOnly = false }: {
  model: LiveChainModel; connection: TaskChainConnection;
  pendingOnly?: boolean;
  onRequirementRevision(review: TaskExecutionReviewReceipt): Promise<boolean>
}) {
  const onClose = model.closeContext
  const [feedback, setFeedback] = useState("")
  useEffect(() => setFeedback(""), [model.selectedExecution?.id])
  const execution = pendingOnly ? null : model.detail?.execution ?? model.selectedExecution
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
  const outcome = execution ? executionOutcome(execution) : null
  const businessStatus = outcome?.status
  const entered = model.detail ? model.detail.execution.steps.some(step => step.runIds.length > 0) : null
  const canReview = entered !== false && ["completed", "partial", "failed", "blocked", "cancelled"].includes(businessStatus ?? "")
  return <>
      {execution && canReview && <section className="context-feedback">{!reviewOpen && !pending ? <Button size="1" variant="ghost"
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
    {otherIntents.map(item => <section className="context-feedback" key={item.command.requestId}>
      <h4>原运行尚未提交的说明</h4><p>{item.command.feedback ?? "符合预期的反馈"}</p>
      {item.error && <p role="alert">{item.error}</p>}
      <Button size="1" disabled={item.busy || model.view.busy} aria-busy={item.busy}
        onClick={() => void (model.view.errorCode === "execution_review_stale" && !item.saved
          ? connection.retryStaleReview(item.command.executionId, onRequirementRevision)
          : connection.submitReview(item.command, onRequirementRevision))}>
        {item.busy ? "正在提交原说明…" : model.view.errorCode === "execution_review_stale" && !item.saved
          ? "核验原运行并提交" : "继续同一提交"}</Button>
      <details><summary>原运行引用</summary><pre>{JSON.stringify(item.saved?.context ?? {
        executionId: item.command.executionId, selection: item.command.selection }, null, 2)}</pre></details>
    </section>)}
  </>
}
