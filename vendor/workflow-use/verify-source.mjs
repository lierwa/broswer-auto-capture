import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const pinnedCommit = "5d2d19fe8835cc86f1bf3e04302a5000d590f249"
export async function verifyForkSource(root) {
  const source = path.join(root, "vendor", "workflow-use")
  const baseline = JSON.parse(await readFile(path.join(source, "UPSTREAM.json"), "utf8"))
  const changes = JSON.parse(await readFile(path.join(source, "LOCAL-CHANGES.json"), "utf8"))
  if (baseline.commit !== pinnedCommit || changes.baselineCommit !== pinnedCommit || baseline.baselineContainsLocalPatches !== false) {
    throw new Error("workflow_fork_baseline_mismatch")
  }
  const expected = new Map(baseline.files.map((file) => [file.path, file.sha256]))
  for (const file of changes.modified) {
    if (expected.get(file.path) !== file.upstreamSha256) throw new Error("workflow_fork_change_source_mismatch")
    expected.set(file.path, file.localSha256)
  }
  for (const file of changes.added) {
    if (expected.has(file.path)) throw new Error("workflow_fork_duplicate_source")
    expected.set(file.path, file.sha256)
  }
  await Promise.all([...expected].map(async ([name, hash]) => {
    if (typeof name !== "string" || path.isAbsolute(name) || name.split(/[\\/]/).includes("..") || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error("workflow_fork_invalid_manifest")
    }
    const content = await readFile(path.join(source, name))
    if (createHash("sha256").update(content).digest("hex") !== hash) throw new Error(`workflow_fork_source_mismatch:${name}`)
  }))
  return createHash("sha256").update(JSON.stringify([...expected].sort(([a], [b]) => a.localeCompare(b)))).digest("hex")
}
