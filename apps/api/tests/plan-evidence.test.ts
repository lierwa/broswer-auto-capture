import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { deferred } from "./helpers.js"
import { evidenceDecisionFor, headers, withPlan } from "./plan-fixture.js"
import { PlanRepository } from "../src/plan/repository.js"

test("计划通过正式 API 搜索、观察并采用证据，同请求幂等且刷新保留单一事实", async () => withPlan(async (v) => {
  const id = await v.ready(), other = await v.create(false), requestId = randomUUID()
  assert.equal((await v.generate(other)).statusCode, 409)
  const responses = await Promise.all([v.generate(id, requestId), v.generate(id, requestId)])
  assert.ok(responses.every((item) => item.statusCode === 202))
  const record = await v.waitPlan(id)
  assert.equal(record.status, "ready")
  assert.equal(record.evidence.queries.length, 1); assert.equal(record.evidence.observations.length, 2)
  assert.equal(record.evidence.candidates[0]?.provenance, "page_link")
  assert.equal(record.evidence.candidates[0]?.discoveredOn, record.evidence.queries[0]?.observationId)
  assert.equal(record.evidence.audits.length, 3)
  assert.ok(record.evidence.audits.every((item) => item.purpose === "plan_evidence" && item.invocations === 1))
  assert.equal(v.fake.calls.at(-1)?.[2], "stop")
  assert.equal(v.current.plan.snapshot(other).records.length, 0)
  await v.reopen(); assert.deepEqual(v.current.plan.snapshot(id).records[0], record)
}))

test("伪造证据编号或候选不能成为事实，普通证据缺口进入计划步骤而不猜造观察", async () => withPlan(async (v) => {
  const first = await v.ready()
  v.fake.decide = async (prompt) => {
    const decision = evidenceDecisionFor(prompt)
    if (decision.action === "finish") decision.assessment!.fields[0]!.evidence = "not-on-page"
    return decision
  }
  await v.generate(first); const rejected = await v.waitPlan(first)
  assert.equal(rejected.status, "blocked"); assert.equal(rejected.evidence.outcome, "failed")
  assert.equal(rejected.evidence.observations.filter((item) => item.assessment?.adopted).length, 0)
  assert.equal(rejected.proposal?.gaps[0]?.disposition, "blocking")

  const second = await v.ready()
  v.fake.decide = async (prompt) => {
    const decision = evidenceDecisionFor(prompt)
    if (decision.action === "finish") decision.assessment!.fields = []
    return decision
  }
  await v.generate(second); const blocked = await v.waitPlan(second)
  assert.equal(blocked.status, "ready"); assert.equal(blocked.proposal?.gaps[0]?.disposition, "execution")

  const third = await v.ready()
  v.fake.decide = async (prompt) => ({ ...evidenceDecisionFor(prompt), action: "visit", candidateId: randomUUID() })
  const before = v.fake.calls.length
  await v.generate(third); const invalid = await v.waitPlan(third)
  assert.equal(invalid.status, "blocked"); assert.equal(invalid.evidence.outcome, "failed"); assert.equal(invalid.evidence.observations.length, 0)
  assert.ok(!v.fake.calls.slice(before).some((args) => args[1] === "navigate"))
}))

test("浏览器命令失败仍持久化诚实计划，待核验项不自动授权执行", async () => withPlan(async (v) => {
  const id = await v.ready(); v.fake.failure = true
  await v.generate(id); const record = await v.waitPlan(id)
  assert.equal(record.status, "blocked"); assert.equal(record.evidence.outcome, "failed")
  assert.ok(record.proposal); assert.ok(record.digest); assert.equal(record.evidence.observations.length, 0)
  assert.ok(record.proposal!.steps.every((step) => step.sourceIds.length === 0))
  assert.ok(record.proposal!.gaps.every((gap) => gap.disposition === "blocking"))
  assert.equal(v.current.plan.snapshot(id).executions.length, 0)
  assert.equal((await v.startPlan(id)).statusCode, 409)
  await v.reopen(); assert.deepEqual(v.current.plan.snapshot(id).records[0], record)
}))

test("访问受限与浏览器回收失败成为计划状态，敏感页面正文不进入证据", async () => withPlan(async (v) => {
  const restrictedId = await v.ready(); v.fake.restricted = true
  await v.generate(restrictedId); const restricted = await v.waitPlan(restrictedId)
  assert.equal(restricted.status, "blocked"); assert.equal(restricted.evidence.outcome, "manual_required")
  assert.ok(restricted.proposal); assert.equal(restricted.evidence.candidates[0]?.status, "restricted")
  assert.ok(restricted.evidence.gaps.every((gap) => !gap.requiresUser)); assert.equal((await v.startPlan(restrictedId)).statusCode, 409)
  assert.doesNotMatch(JSON.stringify(restricted), /private-sensitive-data/)
  assert.doesNotMatch(await readFile(path.join(v.directory, "browser", "browser-audit.jsonl"), "utf8"), /private-sensitive-data/)

  v.fake.restricted = false; v.fake.badStop = true
  const cleanupId = await v.ready(); await v.generate(cleanupId); const cleanup = await v.waitPlan(cleanupId)
  assert.equal(cleanup.status, "blocked"); assert.equal(cleanup.evidence.outcome, "cleanup_required"); assert.ok(cleanup.proposal)
  assert.ok(cleanup.evidence.gaps.every((gap) => !gap.requiresUser)); assert.equal((await v.startPlan(cleanupId)).statusCode, 409)
  assert.equal((await v.generate(cleanupId)).statusCode, 409)
  v.fake.badStop = false
  await v.current.browser.control(cleanupId, { type: "cleanup", runId: cleanup.id })
}))

test("取消计划等待证据模型退出，迟到结果不提交且跨任务取消拒绝", async () => withPlan(async (v) => {
  const id = await v.ready(), other = await v.ready(), gate = deferred(), entered = deferred()
  v.fake.decide = async (prompt) => { entered.resolve(); await gate.promise; return evidenceDecisionFor(prompt) }
  v.fake.close = gate.resolve
  await v.generate(id); await entered.promise
  const record = v.current.plan.snapshot(id).records[0]!
  assert.equal((await v.planPost(other, { type: "cancel_generation", planId: record.id })).statusCode, 409)
  await v.planPost(id, { type: "cancel_generation", planId: record.id }); gate.resolve()
  const final = await v.waitPlan(id)
  assert.equal(final.status, "cancelled"); assert.equal(final.proposal, null)
  assert.equal(v.fake.calls.at(-1)?.[2], "stop")
}))

test("证据缺口从计划回访谈保持幂等，确认不等于启动执行", async () => withPlan(async (v) => {
  const id = await v.ready()
  v.fake.decide = async (prompt) => {
    const decision = evidenceDecisionFor(prompt)
    if (decision.action === "finish") decision.gaps = [{ description: "来源归属口径需要确认", observationIds: decision.coverage[0]!.observationIds, requiresUser: true }]
    return decision
  }
  await v.generate(id); const record = await v.waitPlan(id)
  assert.equal(record.status, "blocked"); assert.equal(record.evidence.gaps[0]?.requiresUser, true)
  const command = { type: "return_to_interview", requestId: randomUUID(), planId: record.id, expectedRevision: 1 }
  assert.equal((await v.planPost(id, command)).statusCode, 202)
  await v.current.coordinator.waitForIdle()
  assert.equal((await v.planPost(id, command)).statusCode, 202)
  const state = v.current.coordinator.snapshot(id)
  assert.equal(state.revision, 2)
  assert.match(state.messages.filter((item) => item.role === "user").at(-1)!.text, /来源证据/)
  assert.equal(v.current.plan.snapshot(id).executions.length, 0)
}))

test("回访谈形成需求 v2 后显式制定并持久显示计划 v2，失败 v1 历史保留", async () => withPlan(async (v) => {
  const id = await v.ready(); v.fake.failure = true
  await v.generate(id); const first = await v.waitPlan(id)
  assert.equal(first.version, 1); assert.equal(first.requirementVersion, 1)
  const command = { type: "return_to_interview", requestId: randomUUID(), planId: first.id, expectedRevision: 1 }
  await v.planPost(id, command); await v.current.coordinator.waitForIdle()
  const interview = v.current.coordinator.snapshot(id)
  assert.equal(interview.drafts.at(-1)?.version, 2); assert.equal(interview.confirmedVersion, null)
  await v.current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers,
    payload: { type: "confirm", requestId: randomUUID(), expectedRevision: interview.revision, version: 2 } })
  await v.generate(id, randomUUID(), 2); const second = await v.waitPlan(id)
  const state = v.current.plan.snapshot(id)
  assert.equal(second.version, 2); assert.equal(second.requirementVersion, 2)
  assert.deepEqual(state.records.map((item) => item.id), [second.id, first.id])
  assert.ok(state.staleIds.includes(first.id)); assert.ok(!state.staleIds.includes(second.id))
  assert.equal(state.executions.length, 0)
  await v.reopen(); assert.deepEqual(v.current.plan.snapshot(id).records.map((item) => item.id), [second.id, first.id])
}))

test("重启将未完成计划及证据审计恢复为中断，不提升为成功", async () => withPlan(async (v) => {
  const id = await v.ready(); await v.generate(id); const record = await v.waitPlan(id)
  record.status = "generating"; record.stage = "source_evidence"; record.evidence.outcome = "pending"
  record.evidence.audits[0]!.status = "intended"; record.evidence.audits[0]!.invocations = null
  new PlanRepository(v.current.store).savePlan(record)
  await v.reopen()
  const recovered = v.current.plan.snapshot(id).records[0]!
  assert.equal(recovered.status, "interrupted"); assert.equal(recovered.evidence.outcome, "interrupted")
  assert.equal(recovered.evidence.audits[0]?.status, "interrupted")
  await v.reopen(); assert.deepEqual(v.current.plan.snapshot(id).records[0], recovered)
}))
