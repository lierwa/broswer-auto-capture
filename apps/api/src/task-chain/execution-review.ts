import { taskExecutionSchema, taskExecutionReviewReceiptSchema, type TaskChainCommand, type TaskExecution, type TaskExecutionReview, type TaskRun } from "@browser-capture/contracts"
import { digestJson, safeRecordedOutput, stableUuid } from "@browser-capture/runtime"
import { conflict, DomainError } from "../errors.js"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import { runBelongsToExecution } from "./execution-detail.js"

export function appendExecutionReview(record: TaskExecution, input: {
  requestId: string
  expectedSequence: number
  decision: TaskExecutionReview["decision"]
  feedback: string | null
  selection?: { stepId: string; runId: string | null } | undefined
}, context?: TaskExecutionReview["context"]) {
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
    const existing = record.reviews.find(item => item.id === (previous ?? stableUuid(command.requestId, "result-review")))
    if (previous && !existing) conflict("已保存反馈的记录缺失；请保留原说明，核对存储后重试。")
    if (existing) {
      // WHY：保存成功但回执/operation 丢失时，不重查调用或改写原摘要；沿原幂等检查恢复。
      appendExecutionReview(record, command)
      if (!previous) store.recordOperation("task-execution:review", command.requestId, command, existing.id)
      return reviewReceipt(record, existing)
    }
    const selectedStep = command.selection ? record.steps.find((step) => step.stepId === command.selection!.stepId) : null
    if (command.selection && !selectedStep) conflict("所选步骤不属于本次运行。")
    let selectedRun: TaskRun | null = null
    if (command.selection?.runId && selectedStep) {
      if (!selectedStep.runIds.includes(command.selection.runId)) conflict("所选调用不属于本次运行。")
      try { selectedRun = repository.run(taskId, command.selection.runId) }
      catch (error) {
        if (error instanceof DomainError && error.code === "run_not_found") conflict("所选调用尚未保存。")
        throw error
      }
      if (selectedRun.binding.runId !== command.selection.runId || !runBelongsToExecution(record, selectedStep, selectedRun)) conflict("所选调用与本次运行不一致。")
    }
    const result = selectedRun ? selectedRun.outputs : selectedStep ? selectedStep.output : record.output
    const context = { selection: command.selection ?? null,
      resultDigest: result === null ? null : digestJson(result) }
    const reviewed = appendExecutionReview(record, command, context)
    const review = reviewed.reviews.find(item => item.id === stableUuid(command.requestId, "result-review"))!
    if (command.decision === "requirement_revision") {
      if (selectedRun) review.summary += safeCallSummary(repository, selectedRun, 8_000 - review.summary.length)
      else if (result !== null) {
        const note = "\n聚合结果的安全值摘要未留存；原结果引用已保留。"
        if (review.summary.length + note.length <= 8_000) review.summary += note
      }
    }
    taskExecutionSchema.parse(reviewed)
    repository.saveExecution(reviewed)
    store.recordOperation("task-execution:review", command.requestId, command, review.id)
    return reviewReceipt(record, review)
  }

function reviewReceipt(record: TaskExecution, review: TaskExecutionReview) {
  return taskExecutionReviewReceiptSchema.parse({ ...review, context: {
    taskId: record.taskId, executionId: record.id, requirement: record.requirement,
    release: record.release ?? null, draft: record.draft ?? null,
    selection: review.context?.selection ?? null, resultDigest: review.context?.resultDigest ?? null,
  } })
}

function safeCallSummary(repository: TaskContractRepository, run: TaskRun, remaining: number) {
  let text = "\n所选调用的安全成果摘要："
  try {
    const reference = run.binding.chain
    const chain = repository.chain(run.binding.taskId, reference.id, reference.version, reference.digest)
    for (const [name, output] of Object.entries(run.outputs)) {
      const producers = new Set(chain.nodes.filter(node => node.kind === "emit" ? node.name === name
        : node.kind === "terminal" && "result" in node && node.result?.name === name).map(node => node.id))
      // WHY：同值不证明同来源；只能用最后一次实际生产者的安全事实，不回退旧迭代/无关节点。
      const event = run.events.findLast(item => producers.has(item.nodeId))
      const safe = event ? safeRecordedOutput(chain, run.events, event.nodeId) : null
      const actual = output.kind === "value" ? output.value : output.artifact
      const value = event?.status === "finished" && event.outcome === "success" && safe?.status === "recorded" && Object.hasOwn(safe, "value")
        && digestJson(safe.value) === digestJson(actual) ? JSON.stringify(safe.value) : "安全摘要未留存"
      const line = `\n${name}：${value}`
      const omitted = "\n其余值超出摘要长度；保留原结果引用。"
      if (text.length + line.length > remaining - omitted.length) { text += omitted; break }
      text += line
    }
  } catch { text += "安全摘要无法读取；保留原结果引用。" }
  return text.length <= remaining ? text : ""
}
