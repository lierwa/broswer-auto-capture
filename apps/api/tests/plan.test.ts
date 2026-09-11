import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { headers, withPlan, proposalFor } from "./plan-fixture.js"
import { deferred } from "./helpers.js"
import { validateProposal } from "../src/plan/validation.js"
import { PlanRepository } from "../src/plan/repository.js"

test("正式路径：来源绑定、独立授权、双请求防重、持久排队与重启保留", async () => withPlan(async (v) => {
  const id = await v.ready(), request = randomUUID()
  assert.equal(v.current.plan.snapshot(id).records.length, 0)
  await v.generate(id, request); await v.generate(id, request)
  const plan = await v.waitPlan(id)
  assert.equal(plan.status, "ready"); assert.equal(v.planFake.calls, 1)
  assert.equal(v.current.plan.snapshot(id).executions.length, 0)
  const commands = v.fake.calls.length
  const responses = await Promise.all([v.startPlan(id), v.startPlan(id)])
  assert.ok(responses.every((r) => r.statusCode === 202))
  assert.equal(v.current.plan.snapshot(id).executions.length, 1)
  assert.equal(v.current.plan.snapshot(id).executions[0]?.status, "queued")
  await v.current.plan.queue.tick(); assert.equal(v.fake.calls.length, commands)
  await v.reopen()
  assert.equal(v.current.plan.snapshot(id).executions[0]?.status, "queued")
  assert.equal(v.current.plan.snapshot(id).records[0]?.digest, plan.digest)
  assert.equal((await v.generate(id)).statusCode, 409)
}))

test("未确认、跨任务、过期摘要与归档不能扩大授权；取消后保留历史", async () => withPlan(async (v) => {
  const id = await v.ready(), other = await v.create(false)
  await v.generate(id); const plan = await v.waitPlan(id)
  assert.equal((await v.planPost(other, { type: "start", requestId: randomUUID(), planId: plan.id, planDigest: plan.digest })).statusCode, 409)
  assert.equal((await v.planPost(id, { type: "start", requestId: randomUUID(), planId: plan.id, planDigest: "0".repeat(64) })).statusCode, 409)
  await v.startPlan(id)
  const run = v.current.plan.snapshot(id).executions[0]!
  assert.equal((await v.planPost(other, { type: "cancel_execution", executionId: run.id })).statusCode, 409)
  const archived = await v.current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "archive", id, archived: true } })
  assert.equal(archived.statusCode, 409)
  await v.planPost(id, { type: "cancel_execution", executionId: run.id })
  await v.startPlan(id)
  assert.equal(v.current.plan.snapshot(id).executions.length, 1)
  assert.equal(v.current.plan.snapshot(id).executions[0]?.status, "cancelled")
  await assert.rejects(v.current.browser.run({ taskId: id, runId: randomUUID(), requirementVersion: 1, purpose: "exploration", allowedOrigins: ["https://example.com"], actions: ["observe"], maxCommands: 10, timeoutMs: 1000 }, async () => {}))
}))

test("相同需求复用已验证证据，需求变更使旧计划与排队授权失效", async () => withPlan(async (v) => {
  const id = await v.ready(); await v.generate(id); const plan = await v.waitPlan(id)
  const browserCalls = v.fake.calls.length
  await v.generate(id); const reused = await v.waitPlan(id)
  assert.equal(reused.evidence.reusedFromPlanId, plan.id)
  assert.equal(v.fake.calls.length, browserCalls)
  await v.startPlan(id)
  await v.current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "message", requestId: randomUUID(), expectedRevision: 1, text: "修改范围" } })
  await v.current.coordinator.waitForIdle()
  assert.ok(v.current.plan.snapshot(id).staleIds.includes(plan.id))
  await v.current.plan.queue.tick()
  assert.equal(v.current.plan.snapshot(id).executions[0]?.status, "stale")
  assert.equal((await v.startPlan(id)).statusCode, 409)
}))

test("取消等待晚到模型，失败不产生可启动计划，重试是新版本", async () => withPlan(async (v) => {
  const id = await v.ready(), gate = deferred()
  v.planFake.decide = async (prompt) => { await gate.promise; return proposalFor(prompt) }; v.planFake.close = gate.resolve
  await v.generate(id)
  const id1 = v.current.plan.snapshot(id).records[0]!.id
  await v.planPost(id, { type: "cancel_generation", planId: id1 }); gate.resolve()
  assert.equal((await v.waitPlan(id)).status, "cancelled")
  const afterCancelled = v.fake.calls.length
  v.planFake.decide = async () => ({})
  await v.generate(id); const failed = await v.waitPlan(id)
  assert.equal(failed.status, "failed"); assert.equal(failed.evidence.reusedFromPlanId, null); assert.ok(v.fake.calls.length > afterCancelled)
  assert.equal((await v.startPlan(id)).statusCode, 400)
  const afterFailed = v.fake.calls.length
  v.planFake.decide = async (prompt) => proposalFor(prompt)
  await v.generate(id); const retried = await v.waitPlan(id)
  assert.equal(retried.version, 3); assert.equal(retried.evidence.reusedFromPlanId, null); assert.ok(v.fake.calls.length > afterFailed)
}))

test("证据内容被修改后摘要守卫拒绝复用并重新核验", async () => withPlan(async (v) => {
  const id = await v.ready(); await v.generate(id); const original = await v.waitPlan(id)
  const calls = v.fake.calls.length
  original.evidence.observations.at(-1)!.title = "被修改的标题"
  new PlanRepository(v.current.store).savePlan(original)
  await v.generate(id); const next = await v.waitPlan(id)
  assert.equal(next.evidence.reusedFromPlanId, null)
  assert.ok(v.fake.calls.length > calls)
}))

test("计划阶段模型选择失败写入终态且服务仍可重新生成", async () => withPlan(async (v) => {
  const id = await v.ready()
  v.fake.selectionCalls = 0
  v.fake.failSelectionAt = 2
  await v.generate(id); const failed = await v.waitPlan(id)
  assert.equal(failed.status, "failed"); assert.equal(failed.stage, "complete"); assert.equal(failed.audit, null)
  assert.equal(failed.reason, "计划生成或证据校验未通过，请核对来源覆盖后重试。")
  await v.generate(id); const retried = await v.waitPlan(id)
  assert.equal(retried.status, "ready"); assert.equal(retried.version, 2)
}))

test("证据校验覆盖字段/目标/缺口，拒绝猜来源、漏字段、循环与超预算", async () => withPlan(async (v) => {
  const id = await v.ready(); await v.generate(id); const plan = await v.waitPlan(id)
  const check = (change: (p: NonNullable<typeof plan.proposal>) => void) => { const p = structuredClone(plan.proposal!); change(p); assert.throws(() => validateProposal(p, plan)) }
  check((p) => { p.fields = [] }); check((p) => { p.objectives = [] })
  check((p) => { p.steps[0]!.sourceIds = [randomUUID()] })
  check((p) => { p.steps[0]!.dependsOn = ["collect"] })
  check((p) => { p.steps[0]!.budget.maxCommands = 500 })
  check((p) => { p.fields[0]!.mode = "missing" })
}))

test("partial允许执行缺口和规则派生，真实用户缺口必须阻塞", async () => withPlan(async (v) => {
  const id = await v.ready(); await v.generate(id); const plan = await v.waitPlan(id)
  const p = structuredClone(plan.proposal!)
  plan.evidence.outcome = "partial"; plan.evidence.gaps = [{ description: "全量尚待执行", observationIds: plan.evidence.observations.filter((item) => item.assessment?.adopted).map((item) => item.id), requiresUser: false }]
  p.gaps = [{ gapIndex: 0, disposition: "execution", stepIds: ["enumerate"], explanation: "枚举阶段核验末页" }]
  assert.doesNotThrow(() => validateProposal(p, plan))
  plan.evidence.gaps[0]!.requiresUser = true
  assert.throws(() => validateProposal(p, plan))
  p.gaps[0]!.disposition = "blocking"
  assert.doesNotThrow(() => validateProposal(p, plan))
  plan.requirement.deliverables[0]!.fields.push("字段缺失说明"); plan.requirement.constraints.push("缺字段留空并说明")
  p.steps.push({ ...p.steps[1]!, id: "derive", kind: "derive", dependsOn: ["collect"], title: "汇总缺失说明" })
  p.fields.push({ deliverable: 0, field: 1, stepId: "derive", mode: "derived", sourceIds: [], ruleIndex: plan.requirement.constraints.length - 1, explanation: "按已确认留空规则生成说明" })
  assert.doesNotThrow(() => validateProposal(p, plan))
}))

test("持久队列FIFO与单浏览器互斥，停止回收后才启动下一任务", async () => {
  const entered: string[] = []
  await withPlan(async (v) => {
    const first = await v.ready(), second = await v.ready()
    for (const id of [first, second]) { await v.generate(id); await v.waitPlan(id); await v.startPlan(id) }
    await v.current.plan.queue.tick()
    for (let i = 0; i < 100 && !entered.length; i++) await delay(10)
    await v.current.plan.queue.tick(); assert.deepEqual(entered, [first])
    const record = v.current.plan.snapshot(first).executions[0]!
    await v.planPost(first, { type: "cancel_execution", executionId: record.id })
    for (let i = 0; i < 100 && v.current.browser.owner(); i++) await delay(10)
    await v.current.plan.queue.tick()
    for (let i = 0; i < 100 && entered.length < 2; i++) await delay(10)
    assert.deepEqual(entered, [first, second])
    assert.equal(v.current.plan.snapshot(first).executions[0]?.status, "cancelled")
  }, async ({ plan, signal }) => { entered.push(plan.taskId); await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })) })
})
