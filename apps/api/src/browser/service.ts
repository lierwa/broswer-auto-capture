import path from "node:path"
import { readFileSync } from "node:fs"
import { desc, eq, sql } from "drizzle-orm"
import { BrowserJournal } from "@browser-capture/browser"
import { ownershipSchema } from "../../../../packages/browser/src/contracts.js"
import { browserControlSchema, browserStatusSchema } from "@browser-capture/contracts/browser"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { browserRuns } from "../database/schema.js"
import { DomainError, conflict } from "../errors.js"

/** WHY：仅保留历史状态/归属保护；执行与取消由 TaskChainService 的受管生命周期承担。 */
export class BrowserService {
  private readonly journal: BrowserJournal
  constructor(private readonly store: ProductStore, private readonly directory: string) {
    this.journal = new BrowserJournal(path.join(directory, "browser"))
  }
  owner() {
    try {
      const value = ownershipSchema.parse(JSON.parse(readFileSync(path.join(this.directory, "browser", "browser-owner.json"), "utf8")))
      return value.state === "closed" ? null : { taskId: value.taskId, runId: value.runId }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new DomainError("legacy_browser_owner_unverified", "旧浏览器归属记录无法核验，请保留记录并检查原资源。", 409)
    }
  }
  isActive(taskId: string) { return this.owner()?.taskId === taskId }
  async snapshot(rawId: string) {
    const taskId = taskIdSchema.parse(rawId); this.store.task(taskId)
    const row = this.store.db.select().from(browserRuns).where(eq(browserRuns.taskId, taskId)).orderBy(desc(sql`rowid`)).get()
    const owner = await this.journal.owner(), pending = owner && owner.state !== "closed"
    return browserStatusSchema.parse({ taskId, record: row?.body ?? null, busy: false,
      cleanupRequired: Boolean(pending), cleanupRunId: pending && owner.taskId === taskId ? owner.runId : null })
  }
  async control(taskId: string, raw: unknown) {
    const command = browserControlSchema.parse(raw), state = await this.snapshot(taskId)
    if (command.type === "cancel") conflict("此为历史浏览器记录；当前运行请使用工作台的停止操作。")
    if (state.cleanupRunId !== command.runId) conflict("请在所属任务中读取最新清理状态。")
    // WHY：旧 CLI session id 不能证明当前窗口归属；既不启动已移除的后端，也不伪报清理成功。
    throw new DomainError("legacy_browser_owner_unverified", "旧浏览器资源尚未核验关闭；历史记录和删除保护已保留。", 409)
  }
}
