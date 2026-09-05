import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import test from "node:test"

function runWorker(phase: "start" | "resume", database: string, request: object) {
  const worker = fileURLToPath(new URL("./fixtures/cross-process-worker.ts", import.meta.url))
  const child = spawnSync(process.execPath, ["--import=tsx", worker, phase, database, JSON.stringify(request)], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 30_000,
  })
  assert.equal(child.status, 0, child.stderr)
  const finalLine = child.stdout.trim().split(/\r?\n/).at(-1)
  assert.ok(finalLine)
  return JSON.parse(finalLine) as { status: string; completed: number; resumeVerified: boolean }
}

test("新 Node 进程从同一 SQLite 检查点恢复", () => {
  const directory = mkdtempSync(join(tmpdir(), "capture-cross-process-"))
  const database = join(directory, "checkpoints.sqlite")
  const request = {
    runId: crypto.randomUUID(),
    workflowId: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
    workflowVersion: 1,
    inputs: Array.from({ length: 32 }, (_, index) => ({ stableKey: `sku-${index}`, value: `商品 ${index}` })),
  }

  try {
    assert.deepEqual(runWorker("start", database, request), { status: "paused", completed: 17, resumeVerified: false })
    assert.deepEqual(runWorker("resume", database, request), { status: "completed", completed: 32, resumeVerified: true })
  } finally {
    assert.equal(join(directory, "checkpoints.sqlite"), database)
    rmSync(directory, { recursive: true })
  }
})
