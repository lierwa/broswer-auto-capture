import { rm, stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { deletePiSessionData, PiAgentSessionBindingStore, stableId } from "@agent-platform/pi-agent-session/platform-internal"
import { BrowserJournal } from "@browser-capture/browser"
import { type TaskDeleteCommand } from "@browser-capture/contracts/task"
import { ProductStore } from "./database/store.js"
import { InterviewCoordinator } from "./interview/coordinator.js"
import { BrowserService } from "./browser/service.js"
import { BrowserProfileService } from "./browser/profile-service.js"
import { TaskChainService } from "./task-chain/service.js"
import { DomainError, conflict } from "./errors.js"

const interviewAgent = "browser-capture.requirement-interview"
const explorationAgent = "browser-capture.task-exploration"

export class TaskDeletionService {
  private readonly deleting = new Set<string>()
  private readonly journal: BrowserJournal
  private readonly piRoot: string
  private readonly diagnosticsRoot: string
  constructor(private readonly store: ProductStore, private readonly coordinator: InterviewCoordinator,
    private readonly browser: BrowserService, private readonly profile: BrowserProfileService,
    private readonly taskChain: TaskChainService, directory: string) {
    this.journal = new BrowserJournal(path.join(directory, "browser"))
    this.piRoot = path.join(directory, "pi-agent-session")
    this.diagnosticsRoot = path.join(directory, "source-lifecycle-diagnostics")
  }
  assertWritable() {
    if (this.deleting.size) conflict("任务删除尚未完成，请稍后重试。")
  }
  async delete(command: TaskDeleteCommand) {
    this.assertWritable()
    this.deleting.add(command.id)
    try {
      this.store.assertTaskDeletionReady(command.id, command.expectedUpdatedAt)
      if (this.coordinator.isAnyActive() || this.taskChain.isAnyActive() || this.browser.owner()
        || this.profile.isBusy()) conflict("有访谈或浏览器工作正在进行，请先等待或停止。")
      const owner = await this.journal.owner()
      if (owner && owner.state !== "closed") conflict("浏览器 owner 尚未关闭或清理，请先恢复清理。")
      const jobs = this.store.taskAuthoringPrivateOwners(command.id)
      await this.deletePi(interviewAgent, command.id)
      for (const job of jobs) {
        await this.deletePi(explorationAgent, job.id)
        // WHY：注解和浏览器采集使用不同 owner；只删除本任务已持久化 job 能证明归属的文件。
        await this.deleteDiagnostic(job.id)
        if (job.browserRunId) await this.deleteDiagnostic(job.browserRunId)
      }
      await this.journal.pruneClosedTask(command.id)
      return this.store.deleteTask(command.id, command.expectedUpdatedAt)
    } finally { this.deleting.delete(command.id) }
  }
  private async deletePi(agentId: string, conversationId: string) {
    const store = await PiAgentSessionBindingStore.open(this.piRoot, agentId)
    if (store.loadIssue) conflict("私有会话索引无法核验，请先修复后重试删除。")
    const binding = store.get(conversationId)
    if (binding?.sessionFile) {
      const directory = path.resolve(this.piRoot, "sessions", stableId(agentId))
      const relative = path.relative(directory, path.resolve(binding.sessionFile))
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        conflict("私有会话路径归属不明，请先核验后重试删除。")
      }
    }
    try {
      await deletePiSessionData({ store, rootDir: this.piRoot, agentId, conversationId })
      if (store.get(conversationId) || binding?.sessionFile && await exists(binding.sessionFile)) {
        throw new Error("pi_session_delete_unconfirmed")
      }
    } catch {
      // WHY：Pi 0.1.0 先去 binding 再删文件；文件失败时恢复原 binding，保留同任务重试入口。
      if (binding && !store.get(conversationId)) {
        try { await store.set(binding) }
        catch { throw new DomainError("pi_binding_restore_failed", "私有会话索引恢复失败，任务仍保留；请先修复本地文件后重试。", 503) }
      }
      throw new DomainError("pi_session_delete_failed", "私有会话未清理，任务仍保留；请检查本地文件后重试。", 503)
    }
  }
  private async deleteDiagnostic(ownerId: string) {
    let file: string
    try { file = path.join(this.diagnosticsRoot, `${z.uuid().parse(ownerId)}.jsonl`) }
    catch { throw new DomainError("source_diagnostic_owner_invalid", "来源诊断归属无法核验，任务仍保留。", 503) }
    try {
      await rm(file, { force: true })
      if (await exists(file)) throw new Error("source_diagnostic_delete_unconfirmed")
    } catch {
      throw new DomainError("source_diagnostic_delete_failed", "本任务来源诊断未清理，任务仍保留；请检查本地文件后重试。", 503)
    }
  }
}

async function exists(file: string) {
  try { await stat(file); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
