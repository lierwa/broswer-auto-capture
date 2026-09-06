import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import { createApplication } from "../src/app.js"

const prepare = process.argv.includes("--prepare"), execute = process.argv.includes("--execute")
if (prepare === execute) throw new Error("选择 --prepare 制定正式新计划，或 --execute 执行已独立授权范围")
const root = fileURLToPath(new URL("../../..", import.meta.url)), directory = path.join(root, "work/f3-real-1788678265551")
const taskId = "fff00875-4d68-4fcd-ab82-340eedb57f4b"
const ceiling = { maxCommands: 3850, timeoutMs: 1440000, maxModelCalls: 12, maxLlmCalls: 0 }
const app = await createApplication({ root, directory, ...(prepare ? { planExecutor: null } : {}) })
async function post(payload: Record<string, unknown>) {
  const result = await app.app.inject({ method: "POST", url: `/api/plan?taskId=${taskId}`, headers: { host: "127.0.0.1:4178" }, payload })
  assert.equal(result.statusCode, 202, result.body)
}
try {
  const before = app.coordinator.snapshot(taskId)
  if (prepare) {
    const source = app.research.snapshot(taskId).records[0]!
    await post({ type: "generate", requestId: randomUUID(), requirementVersion: source.requirementVersion, sourceId: source.id, sourceVersion: source.version,
      budgetCeiling: ceiling, stepBudgetLimits: {
        enumerate: { maxCommands: 300, timeoutMs: 180000, maxModelCalls: 8, maxLlmCalls: 0 },
        collect: { maxCommands: 3500, timeoutMs: 1200000, maxModelCalls: 3, maxLlmCalls: 0 },
        derive: { maxCommands: 50, timeoutMs: 60000, maxModelCalls: 1, maxLlmCalls: 0 },
      } })
    while (app.plan.snapshot(taskId).generating) await delay(1000)
    const plan = app.plan.snapshot(taskId).records[0]!
    await writeFile(path.join(directory, `f6-plan-v${plan.version}.json`), JSON.stringify(plan, null, 2))
    process.stdout.write(JSON.stringify({ planId: plan.id, version: plan.version, status: plan.status, reason: plan.reason,
      steps: plan.proposal?.steps.map((step) => ({ id: step.id, kind: step.kind, budget: step.budget })) }) + "\n")
    assert.equal(plan.status, "ready", plan.reason ?? "计划未形成")
  } else {
    const plan = app.plan.snapshot(taskId).records[0]!
    assert.deepEqual(plan.budgetCeiling, ceiling); assert.equal(plan.status, "ready")
    await post({ type: "start", requestId: randomUUID(), planId: plan.id, planDigest: plan.digest })
    const id = app.plan.snapshot(taskId).executions.at(-1)!.id
    let last = ""
    for (;;) {
      const state = app.plan.snapshot(taskId), run = state.executions.find((item) => item.id === id)!
      const summary = JSON.stringify({ id, status: run.status, steps: run.capture?.steps.map((step) => ({ id: step.stepId, status: step.status,
        records: step.rows.length, inputs: step.inputIndex, commands: step.commands, elapsedMs: step.elapsedMs, modelIntents: step.explorationCalls })) })
      if (summary !== last) { process.stdout.write(summary + "\n"); last = summary }
      if (!["queued", "running"].includes(run.status)) {
        await writeFile(path.join(directory, `f6-full-${id}.json`), JSON.stringify({ run, chains: app.chain.snapshot(taskId, state), browser: await app.browser.snapshot(taskId) }, null, 2))
        process.stdout.write(JSON.stringify({ result: run.status, reason: run.reason, gaps: run.capture?.gaps }) + "\n"); break
      }
      await delay(1000)
    }
  }
  assert.deepEqual(app.coordinator.snapshot(taskId), before)
  assert.equal((await app.browser.snapshot(taskId)).busy, false)
} finally { await app.app.close() }
