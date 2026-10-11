import {
  CONTRACT_VERSION, taskWorkspaceSnapshotSchema,
  type RunnableTaskRelease, type TaskAuthoringJob, type TaskDraft, type TaskExecution,
} from "@browser-capture/contracts"
import type { TaskAttention, TaskSummary } from "@browser-capture/contracts/task"
import { digestJson } from "@browser-capture/runtime"
import { LRUCache } from "lru-cache"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskProductService } from "./product.js"
import { syncConfirmedRequirement } from "./requirement.js"
import { ungroupedPreparationPresentation, createStepChainPresentation } from "./presentation.js"
import { storedCompilationProgress } from "./authoring-build-progress.js"
import { storedStepBuilds } from "./preparation-step-builds.js"

const INCOMPLETE_AUTHORING = ["failed", "cancelled", "interrupted"]

export class TaskSummaryProjector {
  private readonly cache = new LRUCache<string, { revision: number; summary: TaskSummary }>({ max: 256 })
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository,
    private readonly product: TaskProductService) {}

  project(task: TaskSummary): TaskSummary {
    const key = digestJson(task), revision = this.revision(task.id), cached = this.cache.get(key)
    if (revision !== null && cached?.revision === revision) return structuredClone(cached.summary)
    const summary = projectTaskSummary(task, this.store, this.repository, this.product)
    // WHY：进度写入只改变所属任务；用全库版本会反复解析所有历史大记录，阻塞同线程的浏览器转发。
    // 复用既有任务序列；事务中或投影引发同任务写入时不缓存，外部提交仍由序列准确失效。
    if (revision !== null && this.revision(task.id) === revision) this.cache.set(key, { revision, summary: structuredClone(summary) })
    return summary
  }

  private revision(taskId: string) {
    return this.store.readRevision() === null ? null : this.repository.workspaceSequence(taskId)
  }
}

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
      || !currentAt || latestJob.updatedAt >= currentAt) ? latestJob : null, repository)
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
  // WHY：终态优先于阶段；历史 preexecuting 不能把已中断的准备显示为浏览器仍在处理。
  const status: TaskSummary["status"] = INCOMPLETE_AUTHORING.includes(snapshot.activity?.status ?? "") ? "failed"
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
  if (activity && INCOMPLETE_AUTHORING.includes(activity.status)) return { source: "preparation", kind: "failed",
    id: activity.id, sequence: activity.sequence, message: activity.reason ?? "准备任务未完成。",
    updatedAt: activity.updatedAt }
  if (execution?.status === "waiting_for_human" || execution?.status === "paused") {
    return { source: "execution", kind: "action_required", id: execution.id, sequence: execution.sequence,
      message: execution.result?.summary ?? "运行等待人工处理。", updatedAt: execution.updatedAt }
  }
  if (execution?.browserHandoff.status === "unavailable" && execution.browserHandoff.purpose) {
    return { source: "execution", kind: "action_required", id: execution.id, sequence: execution.sequence,
      message: "原浏览器现场交付未确认，请核验窗口状态。", updatedAt: execution.updatedAt }
  }
  if (execution && ["completed", "failed", "blocked", "cleanup_required"].includes(execution.status)) {
    return { source: "execution", kind: execution.status === "completed" ? "completed" : "failed",
      id: execution.id, sequence: execution.sequence, message: execution.browserHandoff.status === "active"
        && execution.browserHandoff.purpose === "delivery" ? "任务动作已完成，原页面仍保持打开。"
          : execution.cleanupResume?.reason ?? execution.result?.summary ?? "本次运行已结束。", updatedAt: execution.updatedAt }
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
    result: record.result, cleanup: record.cleanup, cleanupResume: record.cleanupResume, browser: record.browser, browserHandoff: record.browserHandoff,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  }
}

export function projectActivity(job: TaskAuthoringJob | null, repository?: TaskContractRepository) {
  if (!job || job.type !== "prepare" || !job.preparation) return null
  const phase = job.preparation.phase === "preexecuting" && ["compiling", "compiled"].includes(job.authoring?.stage ?? "")
    ? "compiling" : job.preparation.phase
  // WHY：样本/独立验证开始后由正式草稿和本次 execution 接管画布，不能继续以生成片段遮住运行。
  const build = ["preexecuting", "compiling"].includes(phase) ? job.authoring?.build : undefined
  const plan = job.preparation.candidatePlan
  // WHY：仅展示当前 job 的确切计划版本，不能混入旧发布或其他准备的链路。
  const chains = plan && repository ? repository.chains(job.taskId).filter(chain => chain.plan.id === plan.id
    && chain.plan.version === plan.version && chain.plan.digest === digestJson(plan)) : []
  const steps = plan ? plan.steps.flatMap(step => {
    const chain = chains.filter(chain => chain.stepId === step.id && chain.id === step.chain.id)
      .sort((left, right) => right.version - left.version)[0]
    return chain ? [{ stepId: step.id, chain, presentation: createStepChainPresentation(chain, step) }] : []
  }) : []
  return { id: job.id, status: job.status, phase, sequence: job.sequence, reason: job.reason,
    ...(plan ? { plan, steps, completedBuilds: repository ? storedStepBuilds(repository, job)
      .filter(value => plan.steps.some(step => step.id === value.stepId)) : [] } : {}),
    ...(job.browser ? { browser: job.browser } : {}),
    ...(build ? { build: { stepId: build.stepId, sequence: build.sequence, digest: build.digest,
      phase: build.phase, nodes: build.nodes, edges: build.edges,
      compilation: storedCompilationProgress(build),
      presentation: build.presentation ?? ungroupedPreparationPresentation(build.nodes, build.edges) } } : {}),
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
