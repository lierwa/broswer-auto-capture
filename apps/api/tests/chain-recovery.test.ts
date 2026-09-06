import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { createApplication } from "../src/app.js"
import { migrate } from "../src/database/migrate.js"
const root = fileURLToPath(new URL("../../..", import.meta.url))

test("真实进程崩溃恢复探索为interrupted，未回报调用保持未知，禁止自动重放", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "apps/api/tests/fixtures/chain-process.ts"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  let context: { directory: string; taskId: string } | undefined
  try {
    context = await new Promise((resolve, reject) => {
      let output = ""
      const timer = setTimeout(() => reject(new Error("fixture startup timeout")), 15000)
      child.once("error", reject); child.once("exit", () => { clearTimeout(timer); reject(new Error("fixture exited")) })
      child.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(output.trim())) } })
    })
  } finally { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited }
  assert.ok(context)
  try {
    await delay(11000)
    const app = await createApplication({ root, directory: context.directory })
    try {
      const plan = app.plan.snapshot(context.taskId), chains = app.chain.snapshot(context.taskId, plan)
      assert.equal(plan.executions[0]!.status, "interrupted"); assert.equal(chains.records[0]!.status, "interrupted")
      assert.equal(chains.records[0]!.audits[0]!.invocations, null)
      await app.plan.queue.tick(); assert.equal(app.browser.owner(), null)
    } finally { await app.app.close() }
  } finally { assert.ok(path.resolve(context.directory).startsWith(path.resolve(process.env.TEMP!))); await rm(context.directory, { recursive: true, force: true }) }
})
test("v5到v6链路迁移原子提交，表冲突回滚不损坏原计划授权", () => {
  const db = new Database(":memory:")
  try {
    db.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY); CREATE TABLE executions(id TEXT PRIMARY KEY); INSERT INTO executions VALUES ('old'); PRAGMA user_version=5")
    migrate(db); migrate(db); assert.equal(db.pragma("user_version", { simple: true }), 6)
    assert.deepEqual(db.prepare("SELECT * FROM executions").all(), [{ id: "old" }])
    db.exec("PRAGMA user_version=5"); assert.throws(() => migrate(db)); assert.equal(db.pragma("user_version", { simple: true }), 5)
  } finally { db.close() }
})
