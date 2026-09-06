import assert from "node:assert/strict"
import test from "node:test"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createApplication } from "../src/app.js"
import Database from "better-sqlite3"
import { migrate } from "../src/database/migrate.js"

const root = fileURLToPath(new URL("../../..", import.meta.url))
test("实际进程崩溃后生成和执行恢复为中断，既有授权不自动重放", async () => {
  const fixtures: Array<{ directory: string; taskId: string; phase: string }> = []
  try {
    for (const phase of ["generating", "running"]) {
      const child = spawn(process.execPath, ["--import", "tsx", "apps/api/tests/fixtures/plan-process.ts", phase], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
      let output = "", error = ""
      child.stderr.on("data", (chunk) => { error += String(chunk) })
      try {
        const context = await new Promise<{ directory: string; taskId: string; phase: string }>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`fixture startup timeout ${error}`)), 10000)
          child.once("error", reject); child.once("exit", () => { clearTimeout(timer); reject(new Error(`fixture exited ${error}`)) })
          child.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(output.trim())) } })
        })
        fixtures.push(context)
      } finally { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited }
    }
    await delay(11000)
    for (const fixture of fixtures) {
      const current = await createApplication({ root, directory: fixture.directory })
      try {
        const state = current.plan.snapshot(fixture.taskId)
        if (fixture.phase === "generating") {
          assert.equal(state.records[0]?.status, "interrupted"); assert.equal(state.records[0]?.audit.invocations, null)
        } else {
          assert.equal(state.executions[0]?.status, "interrupted")
          await current.plan.queue.tick(); assert.equal(current.browser.owner(), null)
          assert.equal(current.plan.snapshot(fixture.taskId).executions[0]?.id, state.executions[0]?.id)
        }
      } finally { await current.app.close() }
    }
  } finally { for (const item of fixtures) { assert.ok(path.resolve(item.directory).startsWith(path.resolve(process.env.TEMP!))); await rm(item.directory, { recursive: true, force: true }) } }
})
test("v4到v5迁移保留来源事实；冲突整体回滚且不提前版本", () => {
  const db = new Database(":memory:")
  try {
    db.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY); CREATE TABLE researchRuns(id TEXT PRIMARY KEY, body TEXT); INSERT INTO researchRuns VALUES ('source','original'); PRAGMA user_version=4")
    migrate(db); migrate(db)
    assert.equal(db.pragma("user_version", { simple: true }), 5)
    assert.deepEqual(db.prepare("SELECT * FROM researchRuns").all(), [{ id: "source", body: "original" }])
    assert.deepEqual(db.prepare("SELECT * FROM executions").all(), [])
  } finally { db.close() }
  const broken = new Database(":memory:")
  try {
    broken.exec("CREATE TABLE tasks(id TEXT PRIMARY KEY); CREATE TABLE executions(id TEXT); PRAGMA user_version=4")
    assert.throws(() => migrate(broken))
    assert.equal(broken.pragma("user_version", { simple: true }), 4)
    assert.equal(broken.prepare("SELECT name FROM sqlite_master WHERE name='plans'").get(), undefined)
  } finally { broken.close() }
})
