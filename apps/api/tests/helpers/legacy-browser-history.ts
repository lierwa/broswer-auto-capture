import { appendFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

// 已退休后端的持久记录夹具；生产只保留读取/删除保护，不保留记录写入器。
export async function saveLegacyBrowserOwner(directory: string, value: unknown) {
  await mkdir(path.join(directory, "browser"), { recursive: true })
  await writeFile(path.join(directory, "browser/browser-owner.json"), JSON.stringify(value))
}

export async function appendLegacyBrowserAudit(directory: string, value: unknown) {
  await appendFile(path.join(directory, "browser/browser-audit.jsonl"), JSON.stringify(value) + "\n")
}
