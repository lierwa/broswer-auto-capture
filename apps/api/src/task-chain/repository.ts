import { and, asc, desc, eq } from "drizzle-orm"
import {
  CONTRACT_VERSION, readTaskContractJson, taskChainSchema, taskPlanSchema, taskRequirementSchema, taskRunSchema,
  type ArtifactReference, type JsonValue, type TaskChain, type TaskContract, type TaskPlan, type TaskRequirement, type TaskRun,
} from "@browser-capture/contracts"
import {
  legacyContractSummarySchema, taskAuthoringJobSchema, taskExecutionSchema,
  type TaskAuthoringJob, type TaskExecution,
} from "@browser-capture/contracts/api"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import type { ProductStore } from "../database/store.js"
import { taskArtifacts, taskAuthoringJobs, taskContracts, taskExecutions } from "../database/schema.js"

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

  saveRequirement(value: unknown) { return taskRequirementSchema.parse(this.saveImmutable(taskRequirementSchema.parse(value))) }
  savePlan(value: unknown) { return taskPlanSchema.parse(this.saveImmutable(taskPlanSchema.parse(value))) }
  saveChain(value: unknown) { return taskChainSchema.parse(this.saveImmutable(taskChainSchema.parse(value))) }
  updateChainValidation(value: unknown) {
    const chain = taskChainSchema.parse(value), existing = this.chain(chain.taskId, chain.id, chain.version)
    const definition = (item: TaskChain) => JSON.stringify({ ...item, validation: { status: "candidate", evidence: [] } })
    if (definition(existing) !== definition(chain)) throw new DomainError("immutable_contract", "链路可执行定义不能改写。", 409)
    const recordId = stableUuid("task-contract", "chain", chain.id, String(chain.version)), now = new Date().toISOString()
    this.store.db.update(taskContracts).set({ body: chain, digest: executableChainDigest(chain), updatedAt: now })
      .where(eq(taskContracts.recordId, recordId)).run()
    return chain
  }
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
    return this.selectVersion(this.requirements(taskId), version, "requirement_not_found")
  }
  plan(taskId: string, id: string, version: number, digest?: string) {
    return this.assertDigest(this.plans(taskId).find((item) => item.id === id && item.version === version), digest, "plan_not_found")
  }
  chain(taskId: string, id: string, version: number, digest?: string) {
    return this.assertDigest(this.chains(taskId).find((item) => item.id === id && item.version === version), digest, "chain_not_found")
  }
  run(taskId: string, id: string) {
    const run = this.runs(taskId).find((item) => item.binding.runId === id)
    if (!run) throw new DomainError("run_not_found", "运行不存在。", 404)
    return run
  }
  execution(taskId: string, id: string) {
    const value = this.executions(taskId).find((item) => item.id === id)
    if (!value) throw new DomainError("execution_not_found", "授权运行不存在。", 404)
    return value
  }
  job(taskId: string, id: string) {
    const value = this.jobs(taskId).find((item) => item.id === id)
    if (!value) throw new DomainError("job_not_found", "生成任务不存在。", 404)
    return value
  }

  nextPlanVersion(taskId: string) { return Math.max(0, ...this.plans(taskId).map((item) => item.version)) + 1 }
  nextChainVersion(taskId: string, chainId: string) {
    return Math.max(0, ...this.chains(taskId).filter((item) => item.id === chainId).map((item) => item.version)) + 1
  }
  latestChain(plan: TaskPlan, stepId: string, verified = false) {
    return this.chains(plan.taskId).filter((chain) => chain.plan.id === plan.id && chain.plan.version === plan.version
      && chain.plan.digest === digestJson(plan) && chain.stepId === stepId && (!verified || chain.validation.status === "verified"))
      .sort((left, right) => right.version - left.version)[0]
  }

  saveJob(value: unknown) {
    const body = taskAuthoringJobSchema.parse(value)
    this.store.task(body.taskId)
    this.store.db.insert(taskAuthoringJobs).values({ id: body.id, taskId: body.taskId, type: body.type, status: body.status, body })
      .onConflictDoUpdate({ target: taskAuthoringJobs.id, set: { status: body.status, body } }).run()
    return body
  }
  saveExecution(value: unknown) {
    const body = taskExecutionSchema.parse(value)
    this.store.task(body.taskId)
    this.store.db.insert(taskExecutions).values({ id: body.id, taskId: body.taskId, planId: body.plan.id, status: body.status, body })
      .onConflictDoUpdate({ target: taskExecutions.id, set: { status: body.status, body } }).run()
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
    this.store.task(taskId)
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
    this.store.task(body.taskId)
    const existing = this.store.db.select().from(taskContracts).where(eq(taskContracts.recordId, recordId)).get()
    if (existing) {
      if (JSON.stringify(existing.body) !== JSON.stringify(body)) throw new DomainError("immutable_contract", "已保存的版本不能改写。", 409)
      return existing.body
    }
    this.store.db.insert(taskContracts).values({ recordId, taskId: body.taskId, kind, entityId, version, digest,
      body, createdAt: now, updatedAt: now }).run()
    return body
  }
  private selectVersion<T extends { version: number }>(values: T[], version: number | undefined, code: string) {
    const value = version === undefined ? values.toSorted((a, b) => b.version - a.version)[0] : values.find((item) => item.version === version)
    if (!value) throw new DomainError(code, "需求版本不存在。", 404)
    return value
  }
  private assertDigest<T extends TaskPlan | TaskChain>(value: T | undefined, digest: string | undefined, code: string) {
    if (!value) throw new DomainError(code, "版本不存在。", 404)
    const actual = value.kind === "chain" ? executableChainDigest(value) : digestJson(value)
    if (digest !== undefined && digest !== actual) throw new DomainError("version_digest_mismatch", "版本摘要已变化，请刷新后重试。", 409)
    return value
  }

  private recoverInterrupted() {
    for (const job of this.store.db.select().from(taskAuthoringJobs).all().map((row) => taskAuthoringJobSchema.parse(row.body))) {
      if (!["queued", "running", "waiting_for_human"].includes(job.status)) continue
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
      if (execution.status !== "queued" && execution.status !== "running") continue
      execution.status = "paused"; execution.sequence++; execution.reason = "服务重启中断了运行；检查点已保留。"
      const current = execution.steps.find((step) => step.stepId === execution.currentStepId)
      if (current?.status === "running") { current.status = "paused"; current.reason = execution.reason }
      execution.updatedAt = new Date().toISOString(); this.saveExecution(execution)
    }
  }
}

function chronological<T extends { id: string; createdAt: string }>(values: T[]) {
  return values.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
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
