import { type TaskAuthoringJob, type TaskChainCommand } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { z } from "zod"
import { cleanupReport, runnerCleanupReportSchema, type RunnerCleanupReport } from "../upstream-browser/cleanup.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { TaskContractRepository } from "./repository.js"
import type { ProductStore } from "../database/store.js"
import { DomainError } from "../errors.js"

const windowVerificationSchema = z.object({ status: z.enum(["checking", "active", "closed", "unavailable"]),
  checkedAt: z.string().datetime(), reason: z.string().regex(/^[a-z][a-z0-9_]{1,119}$/).nullable().optional(),
}).strict()

const evidenceSchema = z.object({ ownerId: z.uuid(), jobId: z.uuid(), report: runnerCleanupReportSchema,
  windowVerification: windowVerificationSchema.optional(),
  interruption: z.object({ modelCallIds: z.array(z.uuid()).max(50), lastEventAt: z.string().datetime().nullable(),
    windowVerification: z.object({ status: z.enum(["active", "closed", "unavailable"]), checkedAt: z.string().datetime() }).strict().optional(),
  }).strict().optional(),
}).strict()
export const CLEANUP_PENDING_REASON = " 资源清理尚待核验，系统将继续核对本次任务拥有的窗口。"
const INTERRUPTED_CLEANUP_REASON = " 原资源清理尚待核验；恢复服务后请核验本次任务的原窗口。"
const WINDOW_FAILURE_KINDS: Record<string, string> = {
  ValueError: "value_error", RuntimeError: "runtime_error", TimeoutError: "timeout_error", TypeError: "type_error",
  AttributeError: "attribute_error", ConnectionRefusedError: "connection_refused", OSError: "os_error",
  InvalidStatus: "websocket_handshake_rejected", InvalidStatusCode: "websocket_handshake_rejected",
  InvalidHandshake: "websocket_handshake_failed", InvalidMessage: "websocket_invalid_message",
  ProxyError: "proxy_error", ProxyConnectionError: "proxy_connection_error", InvalidProxyMessage: "proxy_message_invalid",
  ConnectionClosed: "connection_closed", ConnectionClosedOK: "connection_closed", ConnectionClosedError: "connection_closed_error",
}

function windowFailureCode(error: unknown) {
  const protocol = error && typeof error === "object" ? error as { code?: unknown; reason?: unknown } : {}
  if (protocol.code === "hybrid_runner_failed" && typeof protocol.reason === "string") {
    const parts = /^([A-Za-z]+)(?::((?:hybrid_|ordinary_|capture_|read_|daily_chrome_)[a-z0-9_]{1,100}))?$/.exec(protocol.reason)
    if (parts?.[2]) return parts[2]
    if (parts && WINDOW_FAILURE_KINDS[parts[1]!]) return `hybrid_runner_failed_${WINDOW_FAILURE_KINDS[parts[1]!]}`
  }
  // WHY：仅保留允许枚举与B-A-T固定码；第三方异常消息、URL、凭据和页面内容均不落盘。
  return error instanceof Error ? /^((?:hybrid_|daily_chrome_|authoring_cleanup_)[a-z0-9_]{1,100})(?::|$)/.exec(error.message)?.[1]
    ?? "authoring_cleanup_verification_unavailable" : "authoring_cleanup_verification_unavailable"
}

export function saveAuthoringCleanup(repository: TaskContractRepository, job: TaskAuthoringJob, report: RunnerCleanupReport,
  interruption?: z.infer<typeof evidenceSchema>["interruption"], windowVerification?: z.infer<typeof windowVerificationSchema>) {
  if (!job.browserRunId) throw new Error("authoring_cleanup_owner_missing")
  const evidence = evidenceSchema.parse({ ownerId: job.browserRunId, jobId: job.id, report,
    ...(interruption ? { interruption } : {}), ...(windowVerification ? { windowVerification } : {}) })
  job.cleanupEvidence = repository.saveArtifact(job.taskId, job.id, "application/vnd.bat.authoring-cleanup+json", z.json().parse(evidence))
  job.cleanup = { status: report.status, code: report.code, evidenceDigest: report.evidenceDigest,
    attempt: (job.cleanup?.attempt ?? 0) + 1, updatedAt: new Date().toISOString() }
}

/** WHY：新宿主没有旧 runner 的退出回执，不能把自身 helper 的退出冒充旧资源清理。 */
export function recordInterruptedAuthoringCleanup(repository: TaskContractRepository, job: TaskAuthoringJob) {
  if (!job.browserRunId || !job.browser?.mode || job.cleanup?.status === "confirmed" || job.cleanupEvidence) return
  const events = job.authoring?.progress?.events ?? []
  const modelCallIds = events.filter(event => event.source === "model" && event.status === "started" && event.callId
    && !events.some(next => next.callId === event.callId && next.status !== "started")).map(event => event.callId!)
  saveAuthoringCleanup(repository, job, cleanupReport([
    { stage: "capability_close", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
    { stage: "browser_close", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
    { stage: "close_protocol", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
    { stage: "child_exit", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
    { stage: "process_tree", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
    { stage: "temporary_directory", status: "unconfirmed", code: "cleanup_interrupted_unverified" },
  ], null), { modelCallIds, lastEventAt: events.at(-1)?.occurredAt ?? null })
  job.reason = `${job.reason ?? "生成已中断。"}${modelCallIds.length ? " 已启动的模型调用未取得结束回执，原事件保留。" : ""}${INTERRUPTED_CLEANUP_REASON}`
}

async function verifyInterruptedWindow(repository: TaskContractRepository, upstream: UpstreamBrowserRuntime,
  job: TaskAuthoringJob, evidence: z.infer<typeof evidenceSchema>, inspectAgain: boolean) {
  if (!upstream.managedWindowAction || !job.browser?.mode
    || !inspectAgain && (evidence.interruption?.windowVerification || evidence.windowVerification)) return false
  let status: "active" | "closed" | "unavailable" = "unavailable"
  try {
    const result = await upstream.managedWindowAction({ action: "verify_closed", ownerId: evidence.ownerId,
      leaseId: evidence.ownerId, browserMode: job.browser.mode })
    if (result.window.ownerId === evidence.ownerId && result.window.leaseId === evidence.ownerId && result.report.status === "confirmed")
      status = result.window.active ? "active" : "closed"
  } catch { /* 原窗口不可核验时保存本次unknown；不按任意TTL改变业务状态。 */ }
  // WHY：只读核验证明原窗口已关；旧进程、能力和目录仍未知，绝不自动 end 或重复业务动作。
  const stages = evidence.report.stages.map(stage => status === "closed" && stage.stage === "browser_close"
    ? { stage: stage.stage, status: "confirmed" as const, code: null } : stage)
  // WHY：同关键事实只核验一次；周期资源巡检不重复启动helper，显式恢复才可重新检查。
  saveAuthoringCleanup(repository, job, cleanupReport(stages, null), { ...evidence.interruption!,
    windowVerification: { status, checkedAt: new Date().toISOString() } })
  if (status === "closed") job.reason = job.reason?.replace(INTERRUPTED_CLEANUP_REASON,
    " 原窗口已核验关闭；原进程和临时目录清理仍缺少证据。") ?? null
  job.sequence++; job.updatedAt = new Date().toISOString(); repository.saveJob(job)
  return false
}

/** WHY：只在原控制器退出后核验原 owner；取消 signal 不再取消它自己的收尾。 */
export async function settleAuthoringCleanup(repository: TaskContractRepository, upstream: UpstreamBrowserRuntime,
  job: TaskAuthoringJob, controllerActive: boolean, inspectAgain = false) {
  if (controllerActive || !job.browser?.mode || job.cleanup?.status !== "unconfirmed" || !job.cleanupEvidence || !upstream.managedWindowAction) return false
  const artifact = repository.artifact(job.taskId, job.cleanupEvidence.artifactId)
  if (digestJson(artifact.body) !== job.cleanupEvidence.digest) return false
  const evidence = evidenceSchema.parse(artifact.body), ownerId = job.browserRunId
  if (evidence.jobId !== job.id || evidence.ownerId !== ownerId) return false
  if (evidence.windowVerification && !inspectAgain) return false
  if (evidence.interruption) {
    try { return await verifyInterruptedWindow(repository, upstream, job, evidence, inspectAgain) } catch { return false }
  }
  const report = evidence.report
  const exited = report.stages.some(s => ["child_exit", "process_tree"].includes(s.stage) && s.status === "confirmed")
  if (!exited || report.stages.some(s => s.status === "unconfirmed"
    && !["browser_close", "close_protocol", "child_exit"].includes(s.stage))) return false
  const request = { ownerId: evidence.ownerId, leaseId: evidence.ownerId, browserMode: job.browser.mode }
  try {
    let result = await upstream.managedWindowAction({ ...request, action: "verify_closed" })
    if (result.window.ownerId !== ownerId || result.window.leaseId !== ownerId || result.report.status !== "confirmed") return false
    if (result.window.active) result = await upstream.managedWindowAction({ ...request, action: "end", controllerReleased: true })
    if (result.window.ownerId !== ownerId || result.window.leaseId !== ownerId || result.report.status !== "confirmed" || result.window.active) return false
    const stages = report.stages.map(s => s.status !== "unconfirmed" ? s : {
      stage: s.stage, status: s.stage === "close_protocol" ? "not_required" as const : "confirmed" as const, code: null })
    saveAuthoringCleanup(repository, job, cleanupReport(stages, false))
    job.reason = job.reason?.replace(CLEANUP_PENDING_REASON, "") ?? null
    job.sequence++; job.updatedAt = new Date().toISOString()
    repository.saveJob(job)
    return true
  } catch { return false }
}

function ownedEvidence(repository: TaskContractRepository, job: TaskAuthoringJob) {
  if (!job.cleanupEvidence || !job.browserRunId || !job.browser?.mode) return null
  const artifact = repository.artifact(job.taskId, job.cleanupEvidence.artifactId)
  if (digestJson(artifact.body) !== job.cleanupEvidence.digest) return null
  const parsed = evidenceSchema.safeParse(artifact.body)
  return parsed.success && parsed.data.jobId === job.id && parsed.data.ownerId === job.browserRunId ? parsed.data : null
}

export function authoringWindowRecovery(repository: TaskContractRepository, job: TaskAuthoringJob | null, inFlight = false) {
  if (!job || !job.browserRunId || !job.browser?.mode || job.cleanup?.status !== "unconfirmed") return null
  let evidence: ReturnType<typeof ownedEvidence> = null
  try { evidence = ownedEvidence(repository, job) } catch { /* 损坏来源不能冒充可关闭窗口。 */ }
  const verification = evidence?.windowVerification ?? evidence?.interruption?.windowVerification
  const interruptedCheck = verification?.status === "checking" && !inFlight
  const status = inFlight ? "checking" as const : interruptedCheck ? "unavailable" as const : verification?.status ?? "not_recorded" as const
  const canInspect = Boolean(evidence) && !inFlight && ["failed", "interrupted", "completed"].includes(job.status) && status !== "closed"
  const reasons: Partial<Record<typeof status, string>> = {
    closed: "原窗口已核验关闭；旧进程和临时目录仍按原清理证据结算。",
    active: "原任务窗口仍存在。只有显式结束操作会关闭此窗口。",
    unavailable: "原窗口目前不可核验，不能据此判定已关闭。",
  }
  let reason: string | null = reasons[status] ?? null
  if (interruptedCheck) reason = "窗口核验未取得结束回执，请重新核验原窗口。"
  if (!evidence) reason = "原窗口归属或清理证据无法核验。"
  if (evidence?.windowVerification?.reason === "hybrid_attached_window_profile_unconfirmed")
    reason = "当前日常 Chrome 授权身份与原窗口不一致；原资源保留，恢复已停止。"
  if (evidence?.windowVerification?.reason === "hybrid_runner_failed_websocket_handshake_rejected")
    reason = "原窗口连接握手被拒绝；当前无法确认关闭，原授权和资源保留。"
  if (evidence?.windowVerification?.reason === "hybrid_attached_window_connection_unavailable")
    reason = "日常 Chrome 连接尚未恢复；原窗口尚未确认关闭。连接恢复后可重新核验。"
  if (evidence?.windowVerification?.reason === "hybrid_runner_failed_connection_refused")
    reason = "原窗口传输连接被拒绝；不能据此判定窗口已关闭。"
  const physicalEndAvailable = status === "unavailable" && evidence?.windowVerification?.reason === "hybrid_attached_window_end_unconfirmed"
  if (physicalEndAvailable) reason = "控制会话无法确认原窗口；可只按本次准备已保存的目标核验并结束。"
  return { status, checkedAt: verification?.checkedAt ?? null, reason, canInspect, canEnd: canInspect && (status === "active" || physicalEndAvailable) }
}

function saveWindowVerification(repository: TaskContractRepository, job: TaskAuthoringJob,
  evidence: NonNullable<ReturnType<typeof ownedEvidence>>, verification: z.infer<typeof windowVerificationSchema>) {
  const stages = evidence.report.stages.map(stage => verification.status === "closed" && stage.stage === "browser_close"
    ? { stage: stage.stage, status: "confirmed" as const, code: null } : stage)
  const active = verification.status === "active" ? true : stages.some(stage => stage.status === "unconfirmed") ? null : false
  const previousAttempt = job.cleanup?.attempt
  saveAuthoringCleanup(repository, job, verification.status === "checking" ? evidence.report : cleanupReport(stages, active), evidence.interruption, verification)
  // 接受回执不是一次已执行核验；结果记录才增加本次cleanup尝试，避免把排队统计成实际收尾。
  if (verification.status === "checking" && job.cleanup && previousAttempt) job.cleanup.attempt = previousAttempt
  if (verification.status === "closed") job.reason = job.reason?.replace(INTERRUPTED_CLEANUP_REASON,
    " 原窗口已核验关闭；原进程和临时目录清理仍缺少证据。") ?? null
  job.sequence++; job.updatedAt = new Date().toISOString(); repository.saveJob(job)
}

/** WHY：这里只接受固定原job/sequence；浏览器scope和Profile核验仍由原upstream公开入口承担。 */
export function prepareAuthoringWindowRecovery(store: ProductStore, repository: TaskContractRepository,
  upstream: UpstreamBrowserRuntime, taskId: string,
  command: Extract<TaskChainCommand, { type: "cleanup_authoring" }>, controllerActive: () => boolean) {
  const scope = "task-authoring:window-cleanup"
  if (store.operation(scope, command.requestId, command)) return null
  const job = repository.job(taskId, command.jobId), evidence = ownedEvidence(repository, job)
  if (job.sequence !== command.expectedSequence) throw new DomainError("authoring_cleanup_stale", "准备记录已变化，请刷新后再核验原窗口。", 409)
  if (controllerActive() || !["failed", "interrupted", "completed"].includes(job.status))
    throw new DomainError("authoring_cleanup_active", "原准备控制器尚未释放，请先停止或等待它结束。", 409)
  if (!evidence || !upstream.managedWindowAction || job.cleanup?.status !== "unconfirmed")
    throw new DomainError("authoring_cleanup_owner_unverified", "原窗口归属或清理证据无法核验，不能关闭。", 409)
  if (command.action === "end" && !authoringWindowRecovery(repository, job)?.canEnd)
    throw new DomainError("authoring_cleanup_inspection_required", "请先核验原窗口仍存在，再明确结束它。", 409)
  // WHY：接受与浏览器调用分开；HTTP立刻返回已保存状态，重试同request不再派发或自动重放。
  store.db.transaction(() => {
    saveWindowVerification(repository, job, evidence, { status: "checking", checkedAt: new Date().toISOString() })
    store.recordOperation(scope, command.requestId, command, job.id)
  })
  const acceptedSequence = job.sequence, ownerId = evidence.ownerId, browserMode = job.browser!.mode!
  return async () => {
    let verification: z.infer<typeof windowVerificationSchema> = { status: "unavailable", checkedAt: new Date().toISOString(), reason: null }
    const stillOwned = () => {
      const current = repository.job(taskId, job.id)
      return current.sequence === acceptedSequence && current.browserRunId === ownerId && !controllerActive()
    }
    try {
      if (!stillOwned()) throw new Error("authoring_cleanup_owner_changed")
      const request = { ownerId, leaseId: ownerId, browserMode }
      let result: Awaited<ReturnType<NonNullable<UpstreamBrowserRuntime["managedWindowAction"]>>>
      try { result = await upstream.managedWindowAction!({ ...request, action: "verify_closed" }) }
      catch (error) {
        // WHY：扩展空控制枚举不是物理关闭证据；只有明确end且前后同一精确缺口才能用原native收尾。
        if (command.action !== "end" || evidence.windowVerification?.reason !== "hybrid_attached_window_end_unconfirmed"
          || windowFailureCode(error) !== "hybrid_attached_window_end_unconfirmed") throw error
        if (!stillOwned()) throw new Error("authoring_cleanup_owner_changed")
        result = await upstream.managedWindowAction!({ ...request, action: "end", controllerReleased: true })
        if (result.window.active) throw new Error("authoring_cleanup_close_unverified")
      }
      if (result.window.ownerId !== ownerId || result.window.leaseId !== ownerId || result.report.status !== "confirmed")
        throw new Error("authoring_cleanup_owner_unverified")
      if (command.action === "end" && result.window.active) {
        if (!stillOwned()) throw new Error("authoring_cleanup_owner_changed")
        result = await upstream.managedWindowAction!({ ...request, action: "end", controllerReleased: true })
        if (result.window.ownerId !== ownerId || result.window.leaseId !== ownerId || result.report.status !== "confirmed" || result.window.active)
          throw new Error("authoring_cleanup_close_unverified")
      }
      verification = { status: result.window.active ? "active" : "closed", checkedAt: new Date().toISOString(), reason: null }
    } catch (error) {
      verification = { ...verification, checkedAt: new Date().toISOString(), reason: windowFailureCode(error) }
    }
    // 不能用晚到核验结果覆盖已变化job，也不把helper关闭回执写成旧child退出。
    if (stillOwned()) saveWindowVerification(repository, repository.job(taskId, job.id), evidence, verification)
  }
}
