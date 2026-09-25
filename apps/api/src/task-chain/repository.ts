import { and, asc, desc, eq } from "drizzle-orm"
import {
  readTaskContractJson, taskChainSchema, taskDraftSchema, taskExecutionCandidateSchema,
  taskPlanSchema, taskRequirementSchema, taskRunSchema, runnableTaskReleaseSchema,
  type ArtifactReference, type JsonValue, type RunnableTaskRelease, type TaskChain, type TaskContract,
  type TaskDraft, type TaskDraftContent, type TaskExecutionCandidate, type TaskPlan, type TaskRequirement, type TaskRun,
} from "@browser-capture/contracts"
import {
  executionCleanupSchema, legacyContractSummarySchema, taskAuthoringJobSchema, taskExecutionSchema,
  type ExecutionCleanup, type TaskAuthoringJob, type TaskExecution,
} from "@browser-capture/contracts/api"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import type { ProductStore } from "../database/store.js"
import { executionCleanupAuditSchema, type ExecutionCleanupAudit } from "../upstream-browser/cleanup.js"
import {
  taskArtifacts, taskAuthoringJobs, taskContracts, taskDrafts, taskExecutionCandidates,
  taskExecutionCleanupAudits, taskExecutions, taskReleases, taskWorkspaceSequences,
} from "../database/schema.js"

export class TaskContractRepository {
  constructor(private readonly store: ProductStore) { this.recoverInterrupted() }

  requirements(taskId: string) { return this.records(taskId, "requirement").map((record) => taskRequirementSchema.parse(record)) }
  plans(taskId: string) { return this.records(taskId, "plan").map((record) => taskPlanSchema.parse(record)) }
  chains(taskId: string) { return this.records(taskId, "chain").map((record) => taskChainSchema.parse(record)) }
  runs(taskId: string) { return this.records(taskId, "run").map((record) => taskRunSchema.parse(record)) }
  jobs(taskId: string) {
    this.store.task(taskId)
    return chronological(this.store.db.select().from(taskAuthoringJobs).where(eq(taskAuthoringJobs.taskId, taskId))
      .all().map((row) => taskAuthoringJobSchema.parse(row.body)))
  }
  executions(taskId: string) {
    this.store.task(taskId)
    return chronological(this.store.db.select().from(taskExecutions).where(eq(taskExecutions.taskId, taskId))
      .all().map((row) => taskExecutionSchema.parse(row.body)))
  }
  cleanupAudits(taskId: string, executionId: string) {
    return this.store.db.select().from(taskExecutionCleanupAudits).where(and(eq(taskExecutionCleanupAudits.taskId, taskId),
      eq(taskExecutionCleanupAudits.executionId, executionId))).orderBy(asc(taskExecutionCleanupAudits.attempt)).all()
      .map((row) => executionCleanupAuditSchema.parse(row.body))
  }
  releases(taskId: string) {
    this.store.task(taskId)
    return this.store.db.select().from(taskReleases).where(eq(taskReleases.taskId, taskId))
      .orderBy(asc(taskReleases.version)).all().map((row) => runnableTaskReleaseSchema.parse(row.body))
  }
  draft(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskDrafts).where(eq(taskDrafts.taskId, taskId)).get()
    return row ? taskDraftSchema.parse(row.body) : null
  }
  candidate(taskId: string, executionId: string) {
    const row = this.store.db.select().from(taskExecutionCandidates).where(and(
      eq(taskExecutionCandidates.taskId, taskId), eq(taskExecutionCandidates.executionId, executionId))).get()
    return row ? taskExecutionCandidateSchema.parse(row.body) : null
  }
  currentRelease(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskReleases).where(eq(taskReleases.taskId, taskId))
      .orderBy(desc(taskReleases.version)).limit(1).get()
    return row ? runnableTaskReleaseSchema.parse(row.body) : null
  }
  latestExecution(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskExecutions).where(eq(taskExecutions.taskId, taskId))
      .orderBy(desc(taskExecutions.updatedAt), desc(taskExecutions.createdAt)).limit(1).get()
    return row ? taskExecutionSchema.parse(row.body) : null
  }
  latestPreparationJob(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskAuthoringJobs).where(and(eq(taskAuthoringJobs.taskId, taskId),
      eq(taskAuthoringJobs.type, "prepare")))
      .orderBy(desc(taskAuthoringJobs.updatedAt)).limit(1).get()
    return row ? taskAuthoringJobSchema.parse(row.body) : null
  }
  latestAdjustmentJob(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskAuthoringJobs).where(and(eq(taskAuthoringJobs.taskId, taskId),
      eq(taskAuthoringJobs.type, "adjustment")))
      .orderBy(desc(taskAuthoringJobs.updatedAt)).limit(1).get()
    return row ? taskAuthoringJobSchema.parse(row.body) : null
  }
  workspaceSequence(taskId: string) {
    this.store.task(taskId)
    const row = this.store.db.select().from(taskWorkspaceSequences)
      .where(eq(taskWorkspaceSequences.taskId, taskId)).get()
    if (!row) throw new Error("task_workspace_sequence_missing")
    return row.sequence
  }
  releaseHistory(taskId: string, offset: number, limit: number) {
    this.store.task(taskId)
    return this.store.db.select().from(taskReleases).where(eq(taskReleases.taskId, taskId))
      .orderBy(desc(taskReleases.version)).limit(limit).offset(offset).all()
      .map((row) => runnableTaskReleaseSchema.parse(row.body))
  }
  executionHistory(taskId: string, offset: number, limit: number) {
    this.store.task(taskId)
    return this.store.db.select().from(taskExecutions).where(eq(taskExecutions.taskId, taskId))
      .orderBy(desc(taskExecutions.updatedAt), desc(taskExecutions.createdAt)).limit(limit).offset(offset).all()
      .map((row) => taskExecutionSchema.parse(row.body))
  }

  saveRequirement(value: unknown) { return taskRequirementSchema.parse(this.saveImmutable(taskRequirementSchema.parse(value))) }
  saveRun(value: unknown) {
    const run = taskRunSchema.parse(value), now = new Date().toISOString(), recordId = run.binding.runId
    const body: TaskContract = run, digest = digestJson(body)
    this.store.task(run.binding.taskId)
    this.store.db.insert(taskContracts).values({ recordId, taskId: run.binding.taskId, kind: "run", entityId: recordId,
      version: 1, digest, body, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: taskContracts.recordId,
      set: { digest, body, updatedAt: now } }).run()
    return run
  }

  requirement(taskId: string, version?: number) {
    const value = version === undefined
      ? this.store.db.select().from(taskContracts).where(and(eq(taskContracts.taskId, taskId),
        eq(taskContracts.kind, "requirement"))).orderBy(desc(taskContracts.version)).limit(1).get()
      : this.store.db.select().from(taskContracts).where(and(eq(taskContracts.taskId, taskId),
        eq(taskContracts.kind, "requirement"), eq(taskContracts.version, version))).limit(1).get()
    if (!value) throw new DomainError("requirement_not_found", "需求版本不存在。", 404)
    return taskRequirementSchema.parse(value.body)
  }
  findRequirement(taskId: string, version: number) {
    try { return this.requirement(taskId, version) }
    catch (error) {
      if (error instanceof DomainError && error.code === "requirement_not_found") return null
      throw error
    }
  }
  plan(taskId: string, id: string, version: number, digest?: string) {
    const stored = this.contractRecord(taskId, "plan", id, version)
    const value = stored ? taskPlanSchema.parse(stored.body)
      : this.contents(taskId).map((content) => content.plan).find((item) => item.id === id && item.version === version)
    return this.assertDigest(value, digest, "plan_not_found")
  }
  chain(taskId: string, id: string, version: number, digest?: string) {
    const stored = this.contractRecord(taskId, "chain", id, version)
    const value = stored ? taskChainSchema.parse(stored.body)
      : this.contents(taskId).flatMap((content) => content.steps.map((step) => step.chain))
        .find((item) => item.id === id && item.version === version
          && (digest === undefined || executableChainDigest(item) === digest))
    return this.assertDigest(value, digest, "chain_not_found")
  }
  run(taskId: string, id: string) {
    const row = this.contractRecord(taskId, "run", id, 1)
    if (!row) throw new DomainError("run_not_found", "运行不存在。", 404)
    return taskRunSchema.parse(row.body)
  }
  execution(taskId: string, id: string) {
    const row = this.store.db.select().from(taskExecutions).where(and(eq(taskExecutions.taskId, taskId),
      eq(taskExecutions.id, id))).get()
    if (!row) throw new DomainError("execution_not_found", "授权运行不存在。", 404)
    return taskExecutionSchema.parse(row.body)
  }
  release(taskId: string, id: string, version: number, digest?: string) {
    const row = this.store.db.select().from(taskReleases).where(and(eq(taskReleases.taskId, taskId),
      eq(taskReleases.releaseId, id), eq(taskReleases.version, version))).get()
    if (!row) throw new DomainError("release_not_found", "发布记录不存在。", 404)
    const value = runnableTaskReleaseSchema.parse(row.body), actual = digestJson(value)
    if (digest !== undefined && digest !== actual) throw new DomainError("version_digest_mismatch", "发布记录摘要已变化，请刷新后重试。", 409)
    return value
  }
  job(taskId: string, id: string) {
    const row = this.store.db.select().from(taskAuthoringJobs).where(and(eq(taskAuthoringJobs.taskId, taskId),
      eq(taskAuthoringJobs.id, id))).get()
    if (!row) throw new DomainError("job_not_found", "生成任务不存在。", 404)
    return taskAuthoringJobSchema.parse(row.body)
  }
  nextPlanVersion(taskId: string) {
    const versions = [...this.plans(taskId).map((item) => item.version),
      ...this.contents(taskId).map((content) => content.plan.version)]
    return Math.max(0, ...versions) + 1
  }
  nextChainVersion(taskId: string, chainId: string) {
    const versions = [...this.chains(taskId).filter((item) => item.id === chainId).map((item) => item.version),
      ...this.contents(taskId).flatMap((content) => content.steps.map((step) => step.chain))
        .filter((item) => item.id === chainId).map((item) => item.version)]
    return Math.max(0, ...versions) + 1
  }
  nextReleaseVersion(taskId: string) { return Math.max(0, ...this.releases(taskId).map((item) => item.version)) + 1 }
  saveJob(value: unknown) {
    const body = taskAuthoringJobSchema.parse(value)
    this.store.task(body.taskId)
    this.store.db.insert(taskAuthoringJobs).values({ id: body.id, taskId: body.taskId, type: body.type,
      status: body.status, sequence: body.sequence, updatedAt: body.updatedAt, body })
      .onConflictDoUpdate({ target: taskAuthoringJobs.id,
        set: { status: body.status, sequence: body.sequence, updatedAt: body.updatedAt, body } }).run()
    return body
  }
  saveExecution(value: unknown) {
    const body = taskExecutionSchema.parse(value)
    this.store.task(body.taskId)
    this.store.db.insert(taskExecutions).values({ id: body.id, taskId: body.taskId, planId: body.plan.id,
      status: body.status, sequence: body.sequence, createdAt: body.createdAt, updatedAt: body.updatedAt, body })
      .onConflictDoUpdate({ target: taskExecutions.id,
        set: { status: body.status, sequence: body.sequence, updatedAt: body.updatedAt, body } }).run()
    return body
  }
  saveDraft(value: unknown) {
    const body = taskDraftSchema.parse(value), existing = this.draft(body.taskId)
    if (existing && existing.id !== body.id) throw new DomainError("task_draft_identity_mismatch", "当前任务已有另一份活动草稿。", 409)
    this.store.db.insert(taskDrafts).values({ taskId: body.taskId, id: body.id, revision: body.revision,
      checksum: body.checksum, body, updatedAt: body.updatedAt }).onConflictDoUpdate({ target: taskDrafts.taskId,
      set: { id: body.id, revision: body.revision, checksum: body.checksum, body, updatedAt: body.updatedAt } }).run()
    return body
  }
  deleteDraft(taskId: string, draft: Pick<TaskDraft, "id" | "revision" | "checksum">) {
    const current = this.draft(taskId)
    if (!current || current.id !== draft.id || current.revision !== draft.revision || current.checksum !== draft.checksum) {
      throw new DomainError("task_draft_stale", "任务草稿已变化，请刷新后继续。", 409)
    }
    this.store.db.delete(taskDrafts).where(eq(taskDrafts.taskId, taskId)).run()
  }
  saveCandidate(value: unknown) {
    const body = taskExecutionCandidateSchema.parse(value), existing = this.candidate(body.taskId, body.executionId)
    if (existing && JSON.stringify(existing) !== JSON.stringify(body)) {
      throw new DomainError("immutable_execution_candidate", "试跑候选快照不能改写。", 409)
    }
    this.store.db.insert(taskExecutionCandidates).values({ executionId: body.executionId, taskId: body.taskId,
      draftId: body.draft.id, draftRevision: body.draft.revision, draftChecksum: body.draft.checksum,
      body, createdAt: body.createdAt }).onConflictDoNothing().run()
    return body
  }
  saveRelease(value: unknown) {
    const body = runnableTaskReleaseSchema.parse(value), digest = digestJson(body)
    const recordId = stableUuid("task-release", body.taskId, body.id, String(body.version))
    this.store.task(body.taskId)
    const existing = this.store.db.select().from(taskReleases).where(eq(taskReleases.recordId, recordId)).get()
    if (existing) {
      if (JSON.stringify(existing.body) !== JSON.stringify(body)) throw new DomainError("immutable_release", "发布记录不能改写。", 409)
      return runnableTaskReleaseSchema.parse(existing.body)
    }
    this.store.db.insert(taskReleases).values({ recordId, taskId: body.taskId, releaseId: body.id,
      version: body.version, digest, body, createdAt: body.createdAt }).run()
    return body
  }

  updateExecutionCleanup(taskId: string, executionId: string, expectedSequence: number, value: unknown,
    lifecycle?: TaskExecution["status"] | { status: TaskExecution["status"]; reason: string;
      result: TaskExecution["result"] | null; cleanupResume: null }) {
    const cleanup = executionCleanupSchema.parse(value)
    return this.store.db.transaction(() => {
      const current = this.execution(taskId, executionId)
      if (current.sequence !== expectedSequence) throw new DomainError("stale_execution", "运行状态已经变化，请刷新后重试。", 409)
      assertCleanupTransition(current.cleanup, cleanup, current.status === "cleanup_required")
      const status = typeof lifecycle === "string" ? lifecycle : lifecycle?.status
        ?? (cleanup.status === "unconfirmed" ? "cleanup_required" : current.status)
      const body = taskExecutionSchema.parse({ ...current, status, cleanup,
        ...(typeof lifecycle === "object" ? { reason: lifecycle.reason,
          result: lifecycle.result ?? undefined, cleanupResume: lifecycle.cleanupResume } : {}), sequence: current.sequence + 1,
        updatedAt: new Date().toISOString() })
    this.store.db.update(taskExecutions).set({ status: body.status, sequence: body.sequence,
      updatedAt: body.updatedAt, body })
        .where(and(eq(taskExecutions.taskId, taskId), eq(taskExecutions.id, executionId))).run()
      return body
    })
  }
  saveCleanupAudit(value: ExecutionCleanupAudit) {
    const body = executionCleanupAuditSchema.parse(value)
    this.execution(body.taskId, body.executionId)
    const existing = this.store.db.select().from(taskExecutionCleanupAudits)
      .where(and(eq(taskExecutionCleanupAudits.executionId, body.executionId),
        eq(taskExecutionCleanupAudits.attempt, body.attempt))).get()
    if (existing) {
      const previous = executionCleanupAuditSchema.parse(existing.body)
      if (digestJson(previous) !== digestJson(body)) throw new DomainError("cleanup_audit_conflict", "资源清理证据已经变化。", 409)
      return previous
    }
    this.store.db.insert(taskExecutionCleanupAudits).values({ id: body.id, taskId: body.taskId,
      executionId: body.executionId, attempt: body.attempt, source: body.source,
      body: body as JsonValue, createdAt: body.createdAt }).run()
    return body
  }
  saveArtifact(taskId: string, runId: string, mediaType: string, value: JsonValue): ArtifactReference {
    this.store.task(taskId)
    const digest = digestJson(value), artifactId = stableUuid(taskId, runId, mediaType, digest)
    this.store.db.insert(taskArtifacts).values({ artifactId, taskId, runId, mediaType, digest, body: value,
      createdAt: new Date().toISOString() }).onConflictDoNothing().run()
    return { artifactId, mediaType, digest }
  }
  artifact(taskId: string, artifactId: string) {
    const row = this.store.db.select().from(taskArtifacts).where(and(eq(taskArtifacts.taskId, taskId),
      eq(taskArtifacts.artifactId, artifactId))).get()
    if (!row) throw new DomainError("artifact_not_found", "产物不存在。", 404)
    return row
  }

  legacy(taskId: string) {
    return this.store.legacyContractRows(taskId).map((row) => {
      const result = readTaskContractJson(row.body)
      if (result.status === "current") throw new Error("current_contract_in_legacy_table")
      const reason = result.status === "legacy_read_only" ? "缺少新协议版本，仅可读取或导出。"
        : result.status === "unsupported_version" ? "协议版本不受当前程序支持，仅可导出。" : "历史 JSON 无法作为新协议执行。"
      return legacyContractSummarySchema.parse({ source: row.source, id: row.id, status: result.status, reason })
    })
  }
  legacyOriginal(taskId: string, source: "plans" | "chains" | "executions", id: string) {
    const row = this.store.legacyContractRows(taskId).find((item) => item.source === source && item.id === id)
    if (!row) throw new DomainError("legacy_record_not_found", "历史记录不存在。", 404)
    return row.body
  }

  private contents(taskId: string): TaskDraftContent[] {
    const draft = this.draft(taskId), releases = this.releases(taskId)
    const candidates = this.store.db.select().from(taskExecutionCandidates).where(eq(taskExecutionCandidates.taskId, taskId))
      .all().map((row) => taskExecutionCandidateSchema.parse(row.body))
    return [...(draft ? [draft.content] : []), ...releases.map((release) => release.content),
      ...candidates.map((candidate) => candidate.content)]
  }
  private contractRecord(taskId: string, kind: "plan" | "chain" | "run", entityId: string, version: number) {
    return this.store.db.select().from(taskContracts).where(and(eq(taskContracts.taskId, taskId),
      eq(taskContracts.kind, kind), eq(taskContracts.entityId, entityId), eq(taskContracts.version, version))).get()
  }
  private records(taskId: string, kind: "requirement" | "plan" | "chain" | "run") {
    this.store.task(taskId)
    return this.store.db.select().from(taskContracts).where(and(eq(taskContracts.taskId, taskId), eq(taskContracts.kind, kind)))
      .orderBy(asc(taskContracts.version), asc(taskContracts.createdAt)).all().map((row) => {
        const result = readTaskContractJson(JSON.stringify(row.body))
        if (result.status !== "current" || result.record.kind !== kind) throw new Error("stored_task_contract_invalid")
        return result.record
      })
  }
  private saveImmutable(body: Exclude<TaskContract, TaskRun>) {
    const now = new Date().toISOString(), kind = body.kind, entityId = body.id, version = body.version
    const recordId = stableUuid("task-contract", kind, entityId, String(version))
    const digest = kind === "chain" ? executableChainDigest(body) : digestJson(body)
    const existing = this.store.db.select().from(taskContracts).where(eq(taskContracts.recordId, recordId)).get()
    if (existing) {
      if (JSON.stringify(existing.body) !== JSON.stringify(body)) throw new DomainError("immutable_contract", "已保存的版本不能改写。", 409)
      return existing.body
    }
    this.store.db.insert(taskContracts).values({ recordId, taskId: body.taskId, kind, entityId, version, digest,
      body, createdAt: now, updatedAt: now }).run()
    return body
  }
  private assertDigest<T extends TaskPlan | TaskChain>(value: T | undefined, digest: string | undefined, code: string) {
    if (!value) throw new DomainError(code, "版本不存在。", 404)
    const actual = value.kind === "chain" ? executableChainDigest(value) : digestJson(value)
    if (digest !== undefined && digest !== actual) throw new DomainError("version_digest_mismatch", "版本摘要已变化，请刷新后重试。", 409)
    return value
  }

  private recoverInterrupted() {
    for (const job of this.store.db.select().from(taskAuthoringJobs).all().map((row) => taskAuthoringJobSchema.parse(row.body))) {
      if (!["queued", "running"].includes(job.status)) continue
      job.status = "interrupted"; job.sequence++; job.reason = "服务重启中断了模型生成；可以用新请求重试。"
      job.updatedAt = new Date().toISOString()
      if (job.audit?.status === "intended") job.audit.status = "interrupted"
      this.saveJob(job)
    }
    for (const run of this.store.db.select().from(taskContracts).where(eq(taskContracts.kind, "run")).all()
      .map((row) => taskRunSchema.parse(row.body))) {
      if (run.status === "queued") {
        run.sequence++; run.status = "failed"; run.outcome = { status: "failed", code: "service_interrupted_before_start",
          reason: "服务重启发生在验证运行启动前；可以用新请求重新验证。", evidence: [] }
        this.saveRun(run); continue
      }
      if (run.status !== "running") continue
      interruptAudits(run)
      if (!run.checkpoint) {
        run.sequence++; run.status = "failed"; run.outcome = { status: "failed", code: "service_interrupted_without_checkpoint",
          reason: "服务重启中断了没有检查点的运行。", evidence: [] }
        this.saveRun(run); continue
      }
      run.sequence++; run.checkpoint.sequence = run.sequence
      if (run.checkpoint.pendingEffect) run.checkpoint.pendingEffect.status = "uncertain"
      run.status = "paused"; run.outcome = { status: "paused", cause: "interrupted", checkpointId: run.checkpoint.id,
        reason: "服务重启中断了运行；恢复前会核验浏览器现场。", evidence: run.checkpoint.artifacts }
      this.saveRun(run)
    }
    for (const execution of this.store.db.select().from(taskExecutions).all().map((row) => taskExecutionSchema.parse(row.body))) {
      if (execution.status === "cleanup_required") continue
      const interrupted = execution.status === "queued" || execution.status === "running"
      if (!interrupted && execution.cleanup.status !== "pending") continue
      if (interrupted) {
        execution.status = "paused"; execution.reason = "服务重启中断了运行；检查点已保留。"
        const current = execution.steps.find((step) => step.stepId === execution.currentStepId)
        if (current?.status === "running") { current.status = "paused"; current.reason = execution.reason }
      }
      execution.sequence++
      if (execution.cleanup.status === "pending") {
        const resumedResult = execution.result ? interrupted ? { ...execution.result, status: "paused" as const,
          summary: execution.reason, nextAction: "resume" as const } : execution.result : null
        execution.cleanupResume = { status: execution.status, reason: execution.reason, result: resumedResult }
        execution.status = "cleanup_required"
        execution.reason = "服务重启时本次运行的资源清理尚未确认；请先核验并清理资源。"
        if (resumedResult) execution.result = { ...resumedResult, status: "cleanup_required",
          summary: execution.reason, nextAction: "cleanup" }
      }
      execution.updatedAt = new Date().toISOString(); this.saveExecution(execution)
    }
  }
}

function chronological<T extends { id: string; createdAt: string }>(values: T[]) {
  return values.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function assertCleanupTransition(current: ExecutionCleanup, next: ExecutionCleanup, recovering = false) {
  const valid = current.status === "not_recorded"
    ? next.status === "pending" && next.attempt === 1
    : current.status === "pending"
      ? ["confirmed", "unconfirmed"].includes(next.status) && next.attempt === current.attempt
        || recovering && next.status === "pending" && next.attempt === current.attempt + 1
      : current.status === "unconfirmed" ? next.status === "pending" && next.attempt === current.attempt + 1 : false
  if (!valid) throw new DomainError("invalid_cleanup_transition", "资源清理状态已经变化，请刷新后重试。", 409)
}

function interruptAudits(run: TaskRun) {
  for (const audit of run.modelCalls) if (audit.status === "intended") audit.status = "interrupted"
  run.auditComplete = true
  run.consumed.llmCalls = run.modelCalls.every((audit) => audit.reportedInvocations !== null)
    ? run.modelCalls.reduce((sum, audit) => sum + audit.reportedInvocations!, 0) : null
  if (!run.checkpoint) return
  run.checkpoint.modelCalls = structuredClone(run.modelCalls)
  run.checkpoint.auditComplete = run.auditComplete
  run.checkpoint.consumed.llmCalls = run.consumed.llmCalls
}
