import {
  CONTRACT_VERSION, taskWorkspaceSnapshotSchema,
  type JsonValue, type RunnableTaskRelease, type TaskAuthoringJob, type TaskDraft, type TaskExecution,
} from "@browser-capture/contracts"
import type { TaskSummary } from "@browser-capture/contracts/task"
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
  const adjustmentJob = repository.latestAdjustmentJob(taskId)
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
    adjustment: adjustmentJob?.adjustment ? { jobId: adjustmentJob.id, sequence: adjustmentJob.sequence,
      status: adjustmentJob.status, reason: adjustmentJob.reason, value: adjustmentJob.adjustment } : null,
  })
}

export function projectTaskSummary(task: TaskSummary, store: ProductStore,
  repository: TaskContractRepository, product: TaskProductService): TaskSummary {
  if (task.status === "running" || task.status === "answer" || task.status === "draft") return task
  const snapshot = workspaceSnapshot(store, repository, product, task.id)
  const status: TaskSummary["status"] = snapshot.activity?.status === "failed" ? "failed"
    : snapshot.activity?.status === "waiting_for_human" ? "answer"
      : ["preexecuting", "compiling"].includes(snapshot.activity?.phase ?? "")
        || snapshot.activity?.phase.startsWith("validating_") ? "executing"
        : snapshot.activity ? "planning"
    : snapshot.execution?.status === "queued" ? "queued"
      : snapshot.execution && ["running", "waiting_for_human", "paused", "cleanup_required"].includes(snapshot.execution.status)
        ? "executing" : snapshot.draft ? "plan_ready" : snapshot.release ? "review" : task.status
  return { ...task, status }
}

export function releaseReference(release: RunnableTaskRelease) {
  return { id: release.id, version: release.version, digest: digestJson(release) }
}

export function targetSelectionStartUrl(chain: TaskDraft["content"]["steps"][number]["chain"], nodeId: string) {
  const selected = chain.nodes.find((node) => node.id === nodeId)
  const scoped = selected?.kind === "capability" ? nestedHttpUrl(selected.config, ["target", "scope", "url"]) : undefined
  if (scoped) return scoped
  let frontier = [nodeId]
  const visited = new Set(frontier)
  while (frontier.length) {
    const previous = [...new Set(chain.edges.filter((edge) => frontier.includes(edge.to)).map((edge) => edge.from))]
      .filter((id) => !visited.has(id))
    const urls = [...new Set(previous.flatMap((id) => {
      const node = chain.nodes.find((item) => item.id === id)
      const url = node?.kind === "capability" ? capabilityNavigationUrl(node.capability.name, node.config) : undefined
      return url ? [url] : []
    }))]
    if (urls.length === 1) return urls[0]
    if (urls.length > 1) return undefined
    previous.forEach((id) => visited.add(id)); frontier = previous
  }
  return undefined
}

function summarizeExecution(record: TaskExecution) {
  return {
    id: record.id, mode: record.mode, status: record.status, sequence: record.sequence,
    release: record.release, draft: record.draft,
    steps: record.steps.map((step) => ({ stepId: step.stepId, chain: step.chain,
      status: step.status, reason: step.reason })),
    result: record.result, cleanup: record.cleanup,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  }
}

function projectActivity(job: TaskAuthoringJob | null) {
  if (!job || job.type !== "prepare" || !job.preparation) return null
  const phase = job.preparation.phase === "preexecuting" && ["compiling", "compiled"].includes(job.authoring?.stage ?? "")
    ? "compiling" : job.preparation.phase
  return { id: job.id, status: job.status, phase, sequence: job.sequence, reason: job.reason,
    inputRequest: job.preparation.inputRequest, updatedAt: job.updatedAt }
}

function executionMatchesWorkspace(record: TaskExecution, draft: TaskDraft | null, release: RunnableTaskRelease | null) {
  if (draft) return record.draft?.id === draft.id && record.draft.revision === draft.revision
    && record.draft.checksum === draft.checksum
  if (!release) return false
  const reference = releaseReference(release)
  return record.release?.id === reference.id && record.release.version === reference.version
    && record.release.digest === reference.digest
}

function capabilityNavigationUrl(name: string, config: JsonValue) {
  if (name === "browser.workflow-step" && nestedString(config, ["actionName"]) === "navigate") {
    return nestedHttpUrl(config, ["args", "url"])
  }
  if (name === "browser.perform" && nestedString(config, ["operation"]) === "navigate") {
    return nestedHttpUrl(config, ["arguments", "url"])
  }
  return undefined
}

function nestedString(value: JsonValue, path: string[]) {
  let current: JsonValue | undefined = value
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    current = current[key]
  }
  return typeof current === "string" ? current : undefined
}

function nestedHttpUrl(value: JsonValue, path: string[]) {
  const candidate = nestedString(value, path)
  if (!candidate) return undefined
  try {
    const parsed = new URL(candidate)
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined
  } catch { return undefined }
}
