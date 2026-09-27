import {
  CONTRACT_VERSION, taskWorkspaceSnapshotSchema,
  type RunnableTaskRelease, type TaskAuthoringJob, type TaskDraft, type TaskExecution,
} from "@browser-capture/contracts"
import type { TaskAttention, TaskSummary } from "@browser-capture/contracts/task"
import { digestJson } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskProductService } from "./product.js"
import { syncConfirmedRequirement } from "./requirement.js"

export function workspaceSnapshot(store: ProductStore, repository: TaskContractRepository,
  product: TaskProductService, taskId: string) {
  const task = store.task(taskId)
  const requirement = syncConfirmedRequirement(store, repository, taskId)
  const draft = repository.draft(taskId)
  const release = product.currentRelease(taskId, requirement)
  const latest = repository.latestExecution(taskId)
  const execution = latest && executionMatchesWorkspace(latest, draft, release) ? summarizeExecution(latest) : null
  const latestJob = repository.latestPreparationJob(taskId)
  const currentAt = [requirement?.confirmation?.confirmedAt, draft?.updatedAt, release?.createdAt]
    .filter((value): value is string => Boolean(value)).sort().at(-1)
  // WHY：新草稿或发布已接管任务后，旧准备失败只留在审计记录，不能继续覆盖当前工作台状态。
  const activity = projectActivity(latestJob && latestJob.status !== "completed"
    && (["queued", "running", "waiting_for_human"].includes(latestJob.status)
      || !currentAt || latestJob.updatedAt >= currentAt) ? latestJob : null)
  return taskWorkspaceSnapshotSchema.parse({
    contractVersion: CONTRACT_VERSION, taskId, taskSequence: task.sequence,
    stateSequence: repository.workspaceSequence(taskId),
    requirement, draft, release: release ? { reference: releaseReference(release), value: release } : null,
    execution, activity, draftReadiness: draft ? product.draftReadiness(draft) : null,
  })
}

export function projectTaskSummary(task: TaskSummary, store: ProductStore,
  repository: TaskContractRepository, product: TaskProductService): TaskSummary {
  const leaseExecutionId = store.taskBrowserWindowLease(task.id)
  const leased = leaseExecutionId ? repository.execution(task.id, leaseExecutionId) : null
  const historicalLeaseAttention = leased ? {
    source: "execution" as const, kind: "action_required" as const, id: leased.id,
    sequence: leased.sequence,
    message: "旧版运行仍保留原窗口。打开链路画布的运行历史，查看并结束窗口。",
    updatedAt: leased.updatedAt,
  } : null
  if (task.status === "running" || task.status === "answer" || task.status === "draft") {
    const state = store.snapshot(task.id), question = state.unresolved.findLast((item) => item.status === "open")
    const attention = historicalLeaseAttention ?? (question ? { source: "interview", kind: "action_required",
      id: question.id, sequence: state.sequence, message: "需求对话有一项待确认的问题。",
      updatedAt: task.updatedAt } as TaskAttention : null)
    return { ...task, ...(attention ? { attention } : {}) }
  }
  const snapshot = workspaceSnapshot(store, repository, product, task.id)
  const status: TaskSummary["status"] = snapshot.activity?.status === "failed" ? "failed"
    : snapshot.activity?.status === "waiting_for_human" ? "answer"
      : ["preexecuting", "compiling"].includes(snapshot.activity?.phase ?? "")
        || snapshot.activity?.phase.startsWith("validating_") ? "executing"
        : snapshot.activity ? "planning"
    : snapshot.execution?.status === "queued" ? "queued"
      // WHY：cleanup_required 是清理结论未确认，不证明 Browser owner 仍活跃；不能用它锁住其他需求对话。
      : snapshot.execution?.status === "cleanup_required" ? "cleanup_required"
      : snapshot.execution && ["running", "waiting_for_human", "paused"].includes(snapshot.execution.status)
        ? "executing" : snapshot.draft ? "plan_ready" : snapshot.release ? "review" : task.status
  const attention = leased?.id !== snapshot.execution?.id ? historicalLeaseAttention ?? taskAttention(snapshot)
    : taskAttention(snapshot)
  return { ...task, status, ...(attention ? { attention } : {}) }
}

function taskAttention(snapshot: ReturnType<typeof workspaceSnapshot>): TaskAttention | null {
  const activity = snapshot.activity, execution = snapshot.execution
  if (activity?.status === "waiting_for_human") return { source: "preparation", kind: "action_required",
    id: activity.id, sequence: activity.sequence, message: activity.reason ?? "准备任务等待人工处理。",
    updatedAt: activity.updatedAt }
  if (activity?.status === "failed") return { source: "preparation", kind: "failed",
    id: activity.id, sequence: activity.sequence, message: activity.reason ?? "准备任务未完成。",
    updatedAt: activity.updatedAt }
  if (execution?.status === "waiting_for_human" || execution?.status === "paused") {
    return { source: "execution", kind: "action_required", id: execution.id, sequence: execution.sequence,
      message: execution.result?.summary ?? "运行等待人工处理。", updatedAt: execution.updatedAt }
  }
  if (execution?.browserHandoff.status === "unavailable") {
    return { source: "execution", kind: "action_required", id: execution.id, sequence: execution.sequence,
      message: "原浏览器现场交付未确认，请核验窗口状态。", updatedAt: execution.updatedAt }
  }
  if (execution && ["completed", "failed", "blocked", "cleanup_required"].includes(execution.status)) {
    return { source: "execution", kind: execution.status === "completed" ? "completed" : "failed",
      id: execution.id, sequence: execution.sequence, message: execution.browserHandoff.status === "active"
        && execution.browserHandoff.purpose === "delivery" ? "任务动作已完成，原页面仍保持打开。"
          : execution.result?.summary ?? "本次运行已结束。", updatedAt: execution.updatedAt }
  }
  return null
}

export function releaseReference(release: RunnableTaskRelease) {
  return { id: release.id, version: release.version, digest: digestJson(release) }
}

function summarizeExecution(record: TaskExecution) {
  return {
    id: record.id, mode: record.mode, status: record.status, sequence: record.sequence,
    release: record.release, draft: record.draft,
    steps: record.steps.map((step) => ({ stepId: step.stepId, chain: step.chain,
      status: step.status, reason: step.reason })),
    result: record.result, cleanup: record.cleanup, browserHandoff: record.browserHandoff,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  }
}

function projectActivity(job: TaskAuthoringJob | null) {
  if (!job || job.type !== "prepare" || !job.preparation) return null
  const phase = job.preparation.phase === "preexecuting" && ["compiling", "compiled"].includes(job.authoring?.stage ?? "")
    ? "compiling" : job.preparation.phase
  return { id: job.id, status: job.status, phase, sequence: job.sequence, reason: job.reason,
    inputRequest: job.preparation.inputRequest, waitpoint: job.waitpoint, updatedAt: job.updatedAt }
}

function executionMatchesWorkspace(record: TaskExecution, draft: TaskDraft | null, release: RunnableTaskRelease | null) {
  if (draft) return record.draft?.id === draft.id && record.draft.revision === draft.revision
    && record.draft.checksum === draft.checksum
  if (!release) return false
  const reference = releaseReference(release)
  return record.release?.id === reference.id && record.release.version === reference.version
    && record.release.digest === reference.digest
}
