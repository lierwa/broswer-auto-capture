import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { createApplication } from "../src/app.js"
const root = fileURLToPath(new URL("../../..", import.meta.url))

test("批量进程实际崩溃保留运行与已完成来源；重启不自动采集，未结算时间计入原预算", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "apps/api/tests/fixtures/capture-process.ts"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  let context: { directory: string; taskId: string; executionId: string; commands: number } | undefined
  try {
    context = await new Promise((resolve, reject) => {
      let output = ""
      const timer = setTimeout(() => reject(new Error("capture fixture startup timeout")), 20000)
      child.once("error", reject); child.once("exit", () => { clearTimeout(timer); reject(new Error("capture fixture exited")) })
      child.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("\n")) { clearTimeout(timer); resolve(JSON.parse(output.trim())) } })
    })
  } finally { const exited = once(child, "exit"); child.kill("SIGKILL"); await exited }
  assert.ok(context)
  try {
    await delay(11000)
    const app = await createApplication({ root, directory: context.directory, planExecutor: null })
    try {
      const run = app.plan.snapshot(context.taskId).executions.at(-1)!
      assert.equal(run.id, context.executionId); assert.equal(run.status, "interrupted")
      assert.equal(run.capture!.steps[0]!.commands, context.commands); assert.equal(run.capture!.steps[0]!.rows.length, 2)
      assert.ok(run.capture!.steps[1]!.elapsedMs >= 10000)
      await app.plan.queue.tick(); assert.equal(app.browser.owner(), null)
    } finally { await app.app.close() }
  } finally { assert.ok(path.resolve(context.directory).startsWith(path.resolve(tmpdir()))); await rm(context.directory, { recursive: true, force: true }) }
})
