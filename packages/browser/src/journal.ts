import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import path from "node:path"
import { lock } from "proper-lockfile"
import { z } from "zod"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { BrowserError, ownershipSchema, type Ownership } from "./contracts.js"

const auditOwnerSchema = z.object({ taskId: taskIdSchema, runId: z.string().uuid() }).passthrough()
export class BrowserJournal {
  private readonly file: string
  constructor(private readonly directory: string) { this.file = path.join(directory, "browser-owner.json") }
  private async acquire(onCompromised: () => void) {
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
