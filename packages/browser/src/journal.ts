import { appendFile, mkdir, open, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { lock } from "proper-lockfile"
import { z } from "zod"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { BrowserError, ownershipSchema, type BrowserAudit, type Ownership } from "./contracts.js"

const auditOwnerSchema = z.object({ taskId: taskIdSchema, runId: z.string().uuid() }).passthrough()
export class BrowserJournal {
  private readonly file: string
  constructor(private readonly directory: string) { this.file = path.join(directory, "browser-owner.json") }
  async acquire(onCompromised: () => void) {
    await mkdir(this.directory, { recursive: true })
    try { return await lock(this.file, { realpath: false, stale: 10_000, update: 2000, retries: 0, onCompromised }) }
    catch { throw new BrowserError("busy") }
  }
  async owner(): Promise<Ownership | null> {
    try { return ownershipSchema.parse(JSON.parse(await readFile(this.file, "utf8"))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new BrowserError("cleanup_required")
    }
  }
  async discardCorruptOwner() {
    let raw: string
    try { raw = await readFile(this.file, "utf8") }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw new BrowserError("cleanup_required")
    }
    try {
      if (ownershipSchema.safeParse(JSON.parse(raw)).success) throw new BrowserError("cleanup_required")
    } catch (error) {
      if (error instanceof BrowserError) throw error
    }
    // WHY：损坏 owner 已丢失可定向回收的 sessionId；调用方必须先用官方枚举证明没有活动会话，才能删除占用。
    try { await rm(this.file, { force: true }) }
    catch { throw new BrowserError("cleanup_required") }
  }
  async save(owner: Ownership) {
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`
    const handle = await open(temporary, "w", 0o600)
    let renamed = false
    try {
      await handle.writeFile(JSON.stringify(ownershipSchema.parse(owner)), "utf8")
      await handle.sync()
      await handle.close()
      await rename(temporary, this.file)
      renamed = true
    } finally {
      await handle.close().catch(() => {})
      if (!renamed) await rm(temporary, { force: true }).catch(() => {})
    }
  }
  async audit(event: BrowserAudit) {
    // WHY：只保存命令名、关联及实参哈希，页面原文、表单值、Cookie 和 URL 查询串均不入日志。
    await appendFile(path.join(this.directory, "browser-audit.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 })
  }
  async pruneClosedTask(taskId: string) {
    const release = await this.acquire(() => {})
    try {
      const owner = await this.owner()
      if (owner && owner.state !== "closed") throw new BrowserError("cleanup_required")
      const auditFile = path.join(this.directory, "browser-audit.jsonl")
      let raw: string | null = null
      try { raw = await readFile(auditFile, "utf8") }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new BrowserError("cleanup_required")
      }
      if (raw !== null) {
        let kept: string[]
        try { kept = raw.split("\n").filter(Boolean).filter((line) => auditOwnerSchema.parse(JSON.parse(line)).taskId !== taskId) }
        catch { throw new BrowserError("cleanup_required") }
        if (kept.length !== raw.split("\n").filter(Boolean).length) {
          const temporary = `${auditFile}.${process.pid}.${Date.now()}.tmp`
          const handle = await open(temporary, "w", 0o600)
          let renamed = false
          try {
            await handle.writeFile(kept.length ? `${kept.join("\n")}\n` : "", "utf8")
            await handle.sync(); await handle.close(); await rename(temporary, auditFile)
            renamed = true
          } finally {
            await handle.close().catch(() => {})
            if (!renamed) await rm(temporary, { force: true }).catch(() => {})
          }
        }
      }
      if (owner?.taskId === taskId) await rm(this.file, { force: true })
    } finally { await release() }
  }
}
