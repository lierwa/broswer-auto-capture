import { taskExecutionSchema, type TaskChainCommand, type ExecutionReviewContext, type TaskExecution, type TaskExecutionReview } from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import { conflict, DomainError } from "../errors.js"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import { executionCalls } from "./execution-detail.js"

export function appendExecutionReview(record: TaskExecution, input: {
  requestId: string
  expectedSequence: number
  decision: TaskExecutionReview["decision"]
  feedback: string | null
  selection?: { stepId: string; runId: string | null } | undefined
}, context?: ExecutionReviewContext) {
  const existing = record.reviews.find((item) => item.id === stableUuid(input.requestId, "result-review"))
  if (existing) {
    if (existing.decision !== input.decision || existing.feedback !== input.feedback
      || JSON.stringify(existing.context?.selection ?? null) !== JSON.stringify(input.selection ?? null)) {
      throw new DomainError("execution_review_request_conflict", "同一反馈请求的内容已经变化，请重新提交。", 409)
    }
    return record
  }
  if (record.sequence !== input.expectedSequence) {
    throw new DomainError("execution_review_stale", "运行结果已经更新，请刷新后重新选择。", 409)
  }
  const status = record.status === "cleanup_required" ? record.cleanupResume?.status : record.status
  if (!["completed", "partial", "failed", "blocked", "cancelled"].includes(status ?? "")) {
    throw new DomainError("execution_review_unavailable", "当前运行尚未形成可验收结果。", 409)
  }
  if (input.decision === "requirement_revision" && !input.feedback) {
    throw new DomainError("execution_review_feedback_required", "请说明需要重新梳理的目标、来源、范围或结果理解。", 409)
  }
  if (input.decision === "accepted" && status !== "completed") {
    throw new DomainError("execution_acceptance_incomplete", "只有技术运行完成后才能标记符合预期。", 409)
  }
  const now = new Date().toISOString()
  const review: TaskExecutionReview = {
    id: stableUuid(input.requestId, "result-review"), decision: input.decision,
    feedback: input.feedback, summary: executionReviewSummary(record), createdAt: now,
    ...(context ? { context } : {}),
  }
  return taskExecutionSchema.parse({ ...record, sequence: record.sequence + 1,
    reviews: [...record.reviews, review], updatedAt: now })
}

export function executionReviewSummary(record: TaskExecution) {
  const lines = [
    `运行状态：${statusLabel(record.status)}`,
    `发布版本：v${record.release?.version ?? "历史"}`,
    `需求版本：v${record.requirement.version}（修订 ${record.requirement.revision}）`,
    `运行引用：${record.id}`,
    `运行结论：${record.result?.summary ?? record.reason}`,
    `步骤：${record.steps.map((step) => `${step.stepId}=${step.status}`).join("；")}`,
    `消耗：浏览器命令 ${record.consumed.browserCommands}，模型调用 ${record.consumed.llmCalls ?? "未知"}`,
  ]
  // WHY：对话携带受控引用，不复制敏感长正文、页面或原始供应商结果。
  if (record.output) lines.push(`实际结果引用：${record.id} / ${digestJson(record.output)}`)
  return lines.join("\n")
}

function statusLabel(status: TaskExecution["status"]) {
  const labels: Record<TaskExecution["status"], string> = {
    queued: "排队中", running: "执行中", completed: "已完成", partial: "部分完成",
    waiting_for_human: "等待人工", paused: "已暂停", cleanup_required: "待清理", blocked: "受阻", failed: "失败",
    cancelled: "已取消", stale: "版本失效",
  }
  return labels[status]
}

export function saveExecutionReview(store: ProductStore, repository: TaskContractRepository, taskId: string,
  command: Extract<TaskChainCommand, { type: "review_execution" }>) {
    const previous = store.operation("task-execution:review", command.requestId, command)
    const record = repository.execution(taskId, command.executionId)
    if (previous) return record.reviews.find((item) => item.id === previous)
    const selectedStep = command.selection ? record.steps.find((step) => step.stepId === command.selection!.stepId) : null
    if (command.selection && !selectedStep) conflict("所选步骤不属于本次运行。")
    const selectedCall = command.selection?.runId ? executionCalls(repository, record).find((call) =>
      call.stepId === command.selection!.stepId && call.run.binding.runId === command.selection!.runId) : null
    if (command.selection?.runId && !selectedCall) conflict("所选调用尚未保存或不属于本次运行。")
    const result = selectedCall ? selectedCall.run.outputs : selectedStep ? selectedStep.output : record.output
    const context = { taskId, executionId: record.id, requirement: record.requirement,
      release: record.release ?? null, draft: record.draft ?? null, selection: command.selection ?? null,
      resultDigest: result === null ? null : digestJson(result) }
    const reviewed = appendExecutionReview(record, command, context)
    const review = reviewed.reviews.find(item => item.id === stableUuid(command.requestId, "result-review"))!
    repository.saveExecution(reviewed)
    store.recordOperation("task-execution:review", command.requestId, command, review.id)
    return review
  }
