import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../src/app.js"

if (!process.argv.includes("--real")) throw new Error("真实验收需要 --real")
const root = fileURLToPath(new URL("../../..", import.meta.url))
const directory = path.join(root, "work", "f3-real-1788678265551"), taskId = "fff00875-4d68-4fcd-ab82-340eedb57f4b"
// WHY：沿用正式 F3 隔离验收任务的真实来源，通过正式 API 继续；不导入或写库造来源。
const current = await createApplication({ root, directory, planExecutor: null }), headers = { host: "127.0.0.1:4178" }
async function post(payload: Record<string, unknown>) {
  const response = await current.app.inject({ method: "POST", url: `/api/plan?taskId=${taskId}`, headers, payload })
  assert.equal(response.statusCode, 202, response.body); return response.json()
}
try {
  const before = current.coordinator.snapshot(taskId), source = current.research.snapshot(taskId).records[0]!
  await post({ type: "generate", requestId: randomUUID(), requirementVersion: source.requirementVersion, sourceId: source.id, sourceVersion: source.version })
  process.stdout.write(JSON.stringify({ phase: "plan_started", taskId, sourceVersion: source.version }) + "\n")
  while (current.plan.snapshot(taskId).generating) await delay(1000)
  const plan = current.plan.snapshot(taskId).records[0]!
  await writeFile(path.join(directory, `f4-plan-v${plan.version}.json`), JSON.stringify(plan, null, 2))
  assert.equal(plan.status, "ready", plan.reason ?? "计划未就绪")
  assert.ok(plan.proposal!.fields.some((field) => field.mode === "derived"))
  assert.equal(plan.proposal!.fields.length, before.drafts.at(-1)!.brief!.deliverables.flatMap((item) => item.fields).length)
  const requestId = randomUUID()
  await post({ type: "start", requestId, planId: plan.id, planDigest: plan.digest })
  await post({ type: "start", requestId, planId: plan.id, planDigest: plan.digest })
  const state = current.plan.snapshot(taskId)
  assert.equal(state.executions.filter((item) => item.planId === plan.id).length, 1)
  assert.equal(state.executions.at(-1)?.status, "queued")
  assert.deepEqual(current.coordinator.snapshot(taskId), before)
  assert.equal((await current.browser.snapshot(taskId)).record?.purpose, "source_research")
  await writeFile(path.join(directory, "f4-acceptance.json"), JSON.stringify(state, null, 2))
  process.stdout.write(JSON.stringify({ taskId, planId: plan.id, status: plan.status, steps: plan.proposal!.steps.map((s) => s.title), fields: plan.proposal!.fields, gaps: plan.proposal!.gaps, audit: plan.audit, execution: state.executions.at(-1) }) + "\n")
} finally { await current.app.close() }
