import { randomUUID } from "node:crypto"
import { BrowserError, publicUrl } from "@browser-capture/browser"
import { confirmedRequirement } from "@browser-capture/contracts/interview"
import { researchCommandSchema, researchStateSchema, type ResearchRecord } from "@browser-capture/contracts/research"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { BrowserService } from "../browser/service.js"
import { InterviewCoordinator } from "../interview/coordinator.js"
import type { ModelSessionFactory } from "../interview/modelSession.js"
import { conflict } from "../errors.js"
import { ResearchRepository } from "./repository.js"
import { runResearch } from "./runner.js"

interface Job { record: ResearchRecord; controller: AbortController; done: Promise<void> }
export class ResearchService {
  private repository: ResearchRepository
  private job: Job | null = null
  private closing = false
  constructor(private store: ProductStore, private browser: BrowserService, private interview: InterviewCoordinator, private modelFactory: ModelSessionFactory) {
    this.repository = new ResearchRepository(store)
  }
  isActive(taskId: string) { return this.job?.record.taskId === taskId }
  snapshot(raw: string) {
    const taskId = taskIdSchema.parse(raw), task = this.store.task(taskId), state = this.store.snapshot(taskId)
    const requirement = confirmedRequirement(taskId, state), records = this.repository.list(taskId)
    return researchStateSchema.parse({ taskId, taskSequence: state.sequence, records, busy: Boolean(this.job), eligible: Boolean(requirement && !task.archived),
      staleIds: records.filter((item) => item.requirementVersion !== requirement?.draftVersion || item.requirementRevision !== requirement?.revision).map((item) => item.id),
      blocked: task.archived ? "恢复任务后可以调研。" : !requirement ? "请先确认当前结构化需求；旧文档可回到对话补齐。" : null })
  }
  async dispatch(taskId: string, raw: unknown) {
    const command = researchCommandSchema.parse(raw)
    const snapshot = this.snapshot(taskId)
    if (this.closing) conflict("服务正在关闭，请重启后继续。")
    if (command.type === "cancel") {
      const record = snapshot.records.find((item) => item.id === command.researchId)
      if (!record) conflict("调研不属于当前任务。")
      if (this.job?.record.id === record.id) this.job.controller.abort()
      return this.snapshot(taskId)
    }
    const scope = `research:${taskId}`
    if (this.store.operation(scope, command.requestId, command)) return this.snapshot(taskId)
    if (command.type === "interview") {
      this.backToInterview(taskId, command)
      return this.snapshot(taskId)
    }
    if (!snapshot.eligible || this.job) conflict(snapshot.blocked ?? "已有调研正在进行，请等待或停止。")
    const browser = await this.browser.snapshot(taskId)
    // WHY：await 后再次检查，两个同时到达的启动不能分别占用同一调研/浏览器。
    if (this.store.operation(scope, command.requestId, command)) return this.snapshot(taskId)
    if (this.job || browser.busy || browser.cleanupRequired) conflict("浏览器正在使用或需要清理，请处理后再开始。")
    const requirement = confirmedRequirement(taskId, this.store.snapshot(taskId))
    if (!requirement || requirement.draftVersion !== command.requirementVersion || this.store.task(taskId).archived) conflict("需求已更新，请刷新后重新开始。")
    const at = new Date().toISOString()
    const record: ResearchRecord = { id: randomUUID(), taskId, version: (snapshot.records[0]?.version ?? 0) + 1,
      requirementVersion: requirement.draftVersion, requirementRevision: requirement.revision, status: "running", createdAt: at, updatedAt: at, sequence: 0,
      current: "正在制定来源查询", reason: null, queries: [], candidates: [], observations: [], gaps: [], coverage: [], audits: [] }
    for (const rawUrl of requirement.brief.sourceStrategy.providedUrls) {
      const url = publicUrl(rawUrl)
      if (url) record.candidates.push({ id: randomUUID(), url, title: "需求提供的待核验入口", discoveredAt: at, provenance: "provided", discoveredOn: null, status: "candidate", reason: "等待实际页面观察" })
    }
    this.store.db.transaction(() => { this.repository.save(record); this.store.recordOperation(scope, command.requestId, command, record.id) })
    const job: Job = { record, controller: new AbortController(), done: Promise.resolve() }; this.job = job
    job.done = this.run(job, requirement.brief).finally(() => { if (this.job === job) this.job = null })
    // 持久化失败不成为未处理 Promise；重启时仍按 running 事实恢复为 interrupted。
    void job.done.catch(() => { this.closing = true })
    return this.snapshot(taskId)
  }
  private validate(record: ResearchRecord) {
    const value = confirmedRequirement(record.taskId, this.store.snapshot(record.taskId))
    if (!value || value.draftVersion !== record.requirementVersion || value.revision !== record.requirementRevision || this.store.task(record.taskId).archived) throw new BrowserError("permission_denied")
  }
  private async run(job: Job, brief: NonNullable<ReturnType<typeof confirmedRequirement>>["brief"]) {
    const { record } = job
    let work: Promise<"completed" | "partial"> | undefined, status: ResearchRecord["status"] = "failed"
    try {
      status = await this.browser.run({ taskId: record.taskId, runId: record.id, requirementVersion: record.requirementVersion, purpose: "source_research",
        allowedOrigins: [...new Set(["https://www.bing.com", ...record.candidates.map((item) => new URL(item.url).origin)])],
        actions: ["navigate", "page", "follow"], maxCommands: 180, timeoutMs: 300_000 }, (browser, signal) => {
        work = runResearch({ record, brief, browser, signal, modelFactory: this.modelFactory,
          save: () => this.repository.save(record), validate: () => this.validate(record) })
        return work
      }, job.controller.signal)
      this.validate(record)
      if (job.controller.signal.aborted) throw new BrowserError("cancelled")
    } catch (error) {
      const evidenceErrors = ["invalid_evidence_reference", "unsupported_evidence", "search_is_not_source", "unavailable_is_not_source", "invalid_gap_reference", "invalid_coverage_reference", "invalid_candidate"]
      const reason = error instanceof BrowserError ? error.code : error instanceof Error && evidenceErrors.includes(error.message) ? error.message : "invalid_model_output"
      record.reason = reason
      status = ["manual_required", "cleanup_required", "cancelled"].includes(reason) ? reason as ResearchRecord["status"] : "failed"
      record.current = reason === "manual_required" ? "来源需要人工处理；完成登录或访问验证后可重新调研。" : reason === "cancelled" ? "调研已停止，已取得证据保留。" : "调研未完成，已取得证据保留，可重新尝试。"
      record.gaps.push({ description: record.current, observationIds: record.observations.map((item) => item.id), requiresUser: reason === "manual_required" })
    } finally {
      // WHY：Host 取消会先回收浏览器；必须等模型回调退出后提交终态，防止迟到结果覆盖终态。
      await work?.catch(() => {})
      record.status = status; this.repository.save(record)
    }
  }
  private backToInterview(taskId: string, command: Extract<ReturnType<typeof researchCommandSchema.parse>, { type: "interview" }>) {
    const record = this.repository.list(taskId).find((item) => item.id === command.researchId)
    if (!record || record.status === "running" || !record.gaps.length || this.isActive(taskId)) conflict("请等待调研结束并读取缺口后再回访谈。")
    const text = [`请结合来源调研 v${record.version}（需求 v${record.requirementVersion}）的证据讨论以下缺口，保留原目标，不自动缩减范围：`,
      ...record.gaps.map((gap) => `- ${gap.description}`),
      ...record.observations.map((item) => `来源 ${item.id}：${item.url}，观察时间 ${item.at}`),
    ].join("\n").slice(0, 15000)
    this.store.db.transaction(() => {
      this.interview.dispatch(taskId, { type: "message", text, requestId: command.requestId, expectedRevision: command.expectedRevision })
      this.store.recordOperation(`research:${taskId}`, command.requestId, command, record.id)
    })
  }
  async close() { this.closing = true; this.job?.controller.abort(); await this.job?.done.catch(() => {}) }
}
