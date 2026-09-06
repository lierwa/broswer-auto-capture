import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { lock } from "proper-lockfile"
import { BrowserError, ownershipSchema, type BrowserAudit, type Ownership } from "./contracts.js"

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
  async save(owner: Ownership) {
    await writeFile(`${this.file}.tmp`, JSON.stringify(ownershipSchema.parse(owner)), { mode: 0o600 })
    await rename(`${this.file}.tmp`, this.file)
  }
  async audit(event: BrowserAudit) {
    // WHY：只保存命令名、关联及实参哈希，页面原文、表单值、Cookie 和 URL 查询串均不入日志。
    await appendFile(path.join(this.directory, "browser-audit.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 })
  }
}
