import { randomUUID } from "node:crypto"
import type { AccountSnapshot, BrowserIdentity } from "@browser-capture/contracts/browser-account"
import { taskExecutionSchema, taskAuthoringJobSchema } from "@browser-capture/contracts/api"
import type { ProductStore } from "../database/store.js"
import { taskExecutions, taskAuthoringJobs } from "../database/schema.js"
import { stableUuid } from "@browser-capture/runtime"
import type { AccountStartup } from "./account-reuse.js"
import type { TaskChainService } from "../task-chain/service.js"
import type { BrowserService } from "./service.js"
import type { BrowserProfileService } from "./profile-service.js"
import { DomainError } from "../errors.js"

export function accountAvailability(store: ProductStore, tasks: TaskChainService, browser: BrowserService, profile: BrowserProfileService) {
  let startupId: string | null = null
  let startupTaskId: string | null = null
  const controllerBusy = () => tasks.isAnyActive() && !(startupId && startupTaskId && tasks.ownsStartupController(startupTaskId, startupId))
  const retained = () => store.db.select({ body: taskExecutions.body }).from(taskExecutions).all()
    .map(row => taskExecutionSchema.parse(row.body)).filter(record => record.browserHandoff.status === "active"
      || ["pending", "unavailable"].includes(record.browserHandoff.status) && record.browserHandoff.leaseId)
  const matching = (kind: BrowserIdentity["kind"]) => retained().find(record => record.id !== startupId &&
    !store.releasedBrowserWindowOwners(kind).includes(record.browserHandoff.ownerId ?? "") &&
    (store.executionBrowser(record.browser).mode === "daily" ? "daily" : "dedicated") === kind)
  const blocker = (kind: BrowserIdentity["kind"]): AccountSnapshot["availability"]["daily"] => {
    if (browser.owner() || controllerBusy()) return { reason: "running_task", taskId: browser.owner()?.taskId ?? null,
      message: "浏览器正在执行任务。任务结束后可登录；已保存的账号仍可查看。" }
    if (kind === "dedicated" && profile.isBusy()) return { reason: "profile_window", taskId: null,
      message: "此前打开的专属登录窗口仍在，请先结束该窗口的维护。" }
    const record = startupId ? undefined : matching(kind)
    // WHY：只有实际控制器全局互斥；已交付窗口沿原浏览器种类隔离，不能用 daily 残留锁住独立 dedicated。
    return record ? { reason: "retained_window", taskId: record.taskId,
      message: "此浏览器仍有未结束的操作，使用前将自动核验资源。已保存的登录记录仍可查看。" } : null
  }
  return {
    async withStartup<T>(input: AccountStartup, work: () => Promise<T>) {
      if (startupId || browser.owner()) throw new DomainError("account_startup_busy", "另一个控制器正在使用浏览器。", 409)
      const executions = store.db.select({ body: taskExecutions.body }).from(taskExecutions).all().map(r => taskExecutionSchema.parse(r.body))
      const jobs = store.db.select({ body: taskAuthoringJobs.body }).from(taskAuthoringJobs).all().map(r => taskAuthoringJobSchema.parse(r.body))
      const execution = executions.find(r => r.taskId === input.connectionOwnerId && r.status === "running"
        && tasks.ownsStartupController(r.taskId, r.id) && store.executionBrowser(r.browser).mode === input.browserMode
        && (r.release ? stableUuid(r.id, "managed-window") : stableUuid(r.id, "browser", String(r.sequence))) === input.ownerId)
      const job = jobs.find(r => r.taskId === input.connectionOwnerId && r.status === "running"
        && r.browserRunId === input.ownerId && store.executionBrowser(r.browser).mode === input.browserMode && tasks.ownsStartupController(r.taskId, r.id))
      if (!execution && !job) throw new DomainError("account_startup_untrusted", "无法核验当前任务浏览器所有权。", 409)
      startupId = execution?.id ?? job!.id
      startupTaskId = input.connectionOwnerId ?? null
      try { return await work() } finally { startupId = null; startupTaskId = null }
    },
    snapshot: () => ({ daily: blocker("daily"), dedicated: blocker("dedicated") }),
    releasedOwners: (kind: BrowserIdentity["kind"]) => store.releasedBrowserWindowOwners(kind),
    assert(kind: BrowserIdentity["kind"]) { const blocked = blocker(kind)
      if (blocked) throw new DomainError("account_browser_unavailable", blocked.message, 409) },
    async verify(kind: BrowserIdentity["kind"]) {
      if (browser.owner() || controllerBusy()) throw new DomainError("account_browser_unavailable", "任务正在运行，请稍后核验。", 409)
      if (startupId) return
      if (!startupId) await tasks.recoverBrowserResources(kind)
      const record = matching(kind)
      if (!record) return
      throw new DomainError("account_browser_unavailable", record.browserHandoff.purpose === "human_wait"
        ? "此浏览器正在等待人工处理，请先继续或停止该运行。已保存的登录记录仍可查看。"
        : "浏览器连接暂不可用。请确认 Chrome 扩展允许连接后重试；已保存的登录记录保留。", 409)
    },
  }
}
