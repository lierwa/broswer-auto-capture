import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import { createApplication } from "../src/app.js"

// 显式执行开关；沿用既有计划原预算，经正式修复授权创建独立验收运行。
if (!process.argv.includes("--real-repair")) throw new Error("需要显式 --real-repair；本脚本会执行浏览器和修复模型")
const root = fileURLToPath(new URL("../../..", import.meta.url)), directory = path.join(root, "work/f3-real-1788678265551")
const taskId = "fff00875-4d68-4fcd-ab82-340eedb57f4b", parentId = "be81221e-088a-4371-9e2e-aebfa66bc3b0"
const app = await createApplication({ root, directory })
try {
  const before = app.coordinator.snapshot(taskId), plan = app.plan.snapshot(taskId), original = plan.executions.find((item) => item.id === parentId)!
  assert.ok(original); assert.equal(original.status, "failed")
  const response = await app.app.inject({ method: "POST", url: `/api/plan?taskId=${taskId}`, headers: { host: "127.0.0.1:4178" },
    payload: { type: "repair", requestId: randomUUID(), executionId: original.id, planDigest: original.planDigest, stepId: "collect_product_fields" } })
  assert.equal(response.statusCode, 202, response.body)
  const id = app.plan.snapshot(taskId).executions.at(-1)!.id
  let last = ""
  for (;;) {
    const state = app.plan.snapshot(taskId), run = state.executions.find((item) => item.id === id)!
    const summary = JSON.stringify({ id, status: run.status, steps: run.capture?.steps.map((step) => ({ id: step.stepId, status: step.status, records: step.rows.length,
      inputs: step.inputIndex, commands: step.commands, elapsedMs: step.elapsedMs, modelIntents: step.explorationCalls, llmIntents: step.llmCalls })) })
    if (summary !== last) { process.stdout.write(summary + "\n"); last = summary }
    if (!["queued", "running"].includes(run.status)) {
      const chains = app.chain.snapshot(taskId, state)
      await writeFile(path.join(directory, `f6-execution-${id}.json`), JSON.stringify({ run, chains, browser: await app.browser.snapshot(taskId) }, null, 2))
      assert.deepEqual(app.coordinator.snapshot(taskId), before)
      assert.equal((await app.browser.snapshot(taskId)).busy, false)
      process.stdout.write(JSON.stringify({ result: run.status, reason: run.reason, gaps: run.capture?.gaps }) + "\n"); break
    }
    await delay(1000)
  }
} finally { await app.app.close() }
