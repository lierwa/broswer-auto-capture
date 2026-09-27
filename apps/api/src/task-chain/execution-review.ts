import { taskExecutionSchema, type TaskExecution, type TaskExecutionReview } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"

export function appendExecutionReview(record: TaskExecution, input: {
  requestId: string
  expectedSequence: number
  decision: TaskExecutionReview["decision"]
  feedback: string | null
}) {
  if (record.sequence !== input.expectedSequence) {
    throw new DomainError("execution_review_stale", "运行结果已经更新，请刷新后重新选择。", 409)
  }
  if (!["completed", "partial", "failed", "blocked"].includes(record.status)) {
    throw new DomainError("execution_review_unavailable", "当前运行尚未形成可验收结果。", 409)
  }
  if (record.reviews.some((item) => item.id === stableUuid(input.requestId, "result-review"))) return record
  if (input.decision === "requirement_revision" && !input.feedback) {
    throw new DomainError("execution_review_feedback_required", "请说明需要重新梳理的目标、来源、范围或结果理解。", 409)
  }
  if (input.decision === "accepted" && record.status !== "completed") {
    throw new DomainError("execution_acceptance_incomplete", "只有技术运行完成后才能标记符合预期。", 409)
  }
  const now = new Date().toISOString()
  const review: TaskExecutionReview = {
    id: stableUuid(input.requestId, "result-review"), decision: input.decision,
    feedback: input.feedback, summary: executionReviewSummary(record), createdAt: now,
  }
  return taskExecutionSchema.parse({ ...record, sequence: record.sequence + 1,
    reviews: [...record.reviews, review], updatedAt: now })
}

export function executionReviewSummary(record: TaskExecution) {
  const lines = [
    `运行状态：${statusLabel(record.status)}`,
    `发布版本：v${record.release?.version ?? "历史"}`,
    `运行结论：${record.result?.summary ?? record.reason}`,
    `步骤：${record.steps.map((step) => `${step.stepId}=${step.status}`).join("；")}`,
    `消耗：浏览器命令 ${record.consumed.browserCommands}，模型调用 ${record.consumed.llmCalls ?? "未知"}`,
  ]
  const output = record.output ? JSON.stringify(record.output) : ""
  if (output) lines.push(`实际结果：${output.length > 3_000 ? `${output.slice(0, 3_000)}…` : output}`)
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
