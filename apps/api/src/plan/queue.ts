import { BrowserError, type BrowserGrant, type BrowserSession } from "@browser-capture/browser"
import type { ExecutionRecord, PlanRecord } from "@browser-capture/contracts/plan"
import type { BrowserService } from "../browser/service.js"
import type { PlanRepository } from "./repository.js"

export const pendingExecution = (record: ExecutionRecord) => ["queued", "running", "awaiting_next_stage", "interrupted", "manual_required", "cleanup_required"].includes(record.status)
// 执行器必须返回明确的验证成果；单纯回调退出不代表链路通过。
export type PlanExecutor = (input: { plan: PlanRecord; execution: ExecutionRecord; browser: Pick<BrowserSession, "command" | "beginStep">; signal: AbortSignal }) => Promise<void | { verified: true; reason: string }>
export class ExecutionQueue {
  private active: { record: ExecutionRecord; controller: AbortController; done: Promise<void> } | null = null
  private checking = false
  private closing = false
  private timer: ReturnType<typeof setInterval>
  constructor(private repository: PlanRepository, private browser: BrowserService, private valid: (plan: PlanRecord) => boolean, private executor?: PlanExecutor) {
    browser.setAuthorizationValidator((grant) => this.authorize(grant))
    this.timer = setInterval(() => { void this.tick().catch(() => { this.closing = true }) }, 500); this.timer.unref()
  }
  available() { return Boolean(this.executor) }
  cancel(record: ExecutionRecord) {
    if (this.active?.record.id === record.id) { this.active.controller.abort(); return }
    if (!pendingExecution(record)) return
    record.status = "cancelled"; record.reason = "授权运行已停止，计划与历史保留。"; this.repository.saveExecution(record)
  }
  private authorize(grant: BrowserGrant) {
    const record = this.active?.record, plan = record && this.repository.plans().find((item) => item.id === record.planId)
    const origins = plan?.sources.map((source) => new URL(source.url).origin) ?? []
    if (!record || !plan || record.status !== "running" || record.id !== grant.runId || record.taskId !== grant.taskId
      || record.requirementVersion !== grant.requirementVersion || !this.valid(plan) || record.planDigest !== plan.digest
      || grant.purpose !== "exploration" || grant.maxCommands > record.budget.maxCommands || grant.timeoutMs > record.budget.timeoutMs
      || grant.allowedOrigins.some((origin) => !origins.includes(origin))) throw new BrowserError("permission_denied")
  }
  async tick() {
    if (this.closing || this.active || this.checking) return
    this.checking = true
    try {
      const record = this.repository.executions().find((item) => item.status === "queued")
      if (!record) return
      const plan = this.repository.plans().find((item) => item.id === record.planId)
      if (!plan || !this.valid(plan)) { record.status = "stale"; record.reason = "绑定需求或来源已变更，请复核生成新计划后授权。"; this.repository.saveExecution(record); return }
      if (!this.executor) return
      const state = await this.browser.snapshot(record.taskId)
      if (this.closing || state.busy || state.cleanupRequired) return
      // WHY：等待浏览器状态后重读持久事实，取消或版本变化不能被旧排队快照覆盖。
      if (this.repository.executions().find((item) => item.id === record.id)?.status !== "queued" || !this.valid(plan)) return
      record.status = "running"; record.reason = "正在执行授权的首次探索。"; this.repository.saveExecution(record)
      const active = { record, controller: new AbortController(), done: Promise.resolve() }; this.active = active
      active.done = this.run(record, plan, active.controller.signal).finally(() => { if (this.active === active) this.active = null })
      void active.done.catch(() => { this.closing = true })
    } finally { this.checking = false }
  }
  private async run(record: ExecutionRecord, plan: PlanRecord, signal: AbortSignal) {
    let work: ReturnType<PlanExecutor> | undefined
    try {
      const outcome = await this.browser.run({ taskId: record.taskId, runId: record.id, requirementVersion: record.requirementVersion, purpose: "exploration",
        allowedOrigins: [...new Set(plan.sources.map((item) => new URL(item.url).origin))], actions: ["navigate", "observe", "click", "fill", "press", "page"],
        maxCommands: record.budget.maxCommands, timeoutMs: record.budget.timeoutMs }, (browser, lifetime) => {
        work = this.executor!({ plan: structuredClone(plan), execution: structuredClone(record), browser, signal: lifetime }); return work
      }, signal)
      record.status = "awaiting_next_stage"; record.reason = outcome?.verified ? outcome.reason : "探索处理器已返回，等待后续链路验证与执行；尚无全量完成结论。"
    } catch (error) {
      const reason = error instanceof BrowserError ? error.code : "execution_failed"
      record.status = reason === "cancelled" || reason === "manual_required" || reason === "cleanup_required" ? reason : "failed"
      record.reason = reason === "budget_exceeded" ? "步骤预算已用尽，已验证链路与剩余范围保留；调整预算需新计划与独立授权。" : `授权执行已暂停：${reason}。保留原范围与授权记录。`
    } finally {
      await work?.catch(() => {})
      this.repository.saveExecution(record)
    }
  }
  async close() { this.closing = true; clearInterval(this.timer); this.active?.controller.abort(); await this.active?.done.catch(() => {}) }
}
