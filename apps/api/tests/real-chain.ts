import { fileURLToPath } from "node:url"
import path from "node:path"
import { writeFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { createApplication } from "../src/app.js"

if (!process.argv.includes("--real")) throw new Error("真实验收需要 --real")
const root = fileURLToPath(new URL("../../..", import.meta.url)), directory = path.join(root, "work/f3-real-1788678265551")
const taskId = "fff00875-4d68-4fcd-ab82-340eedb57f4b", headers = { host: "127.0.0.1:4178" }
const current = await createApplication({ root, directory })
async function post(payload: Record<string, unknown>) {
  const response = await current.app.inject({ method: "POST", url: `/api/plan?taskId=${taskId}`, headers, payload })
  assert.equal(response.statusCode, 202, response.body)
}
try {
  const before = current.coordinator.snapshot(taskId)
  if (process.argv.includes("--new-plan")) {
    const requirementVersion = before.confirmedVersion
    assert.ok(requirementVersion)
    await post({ type: "generate", requestId: randomUUID(), requirementVersion })
    while (current.plan.snapshot(taskId).generating) await delay(1000)
    const plan = current.plan.snapshot(taskId).records[0]!
    await writeFile(path.join(directory, `f5-plan-v${plan.version}.json`), JSON.stringify(plan, null, 2))
    assert.equal(plan.status, "ready", plan.reason ?? "计划未就绪")
    await post({ type: "start", requestId: randomUUID(), planId: plan.id, planDigest: plan.digest })
  }
  let last = ""
  for (;;) {
    await current.plan.queue.tick()
    const state = current.plan.snapshot(taskId), execution = state.executions.at(-1)!
    const chains = current.chain.snapshot(taskId, state)
    const summary = JSON.stringify({ execution: execution.status, chains: chains.records.filter((record) => record.executionId === execution.id).map((record) => ({ step: record.stepId, version: record.version, status: record.status, code: record.failureCode, commands: record.consumed.commands, calls: record.audits.map((audit) => ({ purpose: audit.purpose, model: audit.reportedModel, effort: audit.reportedEffort, status: audit.status })) })) })
    if (summary !== last) { process.stdout.write(summary + "\n"); last = summary }
    if (!["queued", "running"].includes(execution.status)) {
      await writeFile(path.join(directory, `f5-execution-${execution.id}.json`), JSON.stringify({ plan: state, chains, browser: await current.browser.snapshot(taskId) }, null, 2))
      assert.deepEqual(current.coordinator.snapshot(taskId), before)
      assert.equal((await current.browser.snapshot(taskId)).busy, false)
      assert.ok(chains.records.length, "执行必须产生真实链路或步骤失败事实")
      break
    }
    await delay(1000)
  }
} finally { await current.app.close() }
