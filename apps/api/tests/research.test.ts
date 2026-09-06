import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { withResearch, decisionFor, headers } from "./research-fixture.js"
import { deferred } from "./helpers.js"
import { ResearchRepository } from "../src/research/repository.js"

test("无链接需求经正式 API 搜索、候选、观察、覆盖，幂等与刷新保留事实", async () => withResearch(async (v) => {
  const id = await v.create(), other = await v.create(false), requestId = randomUUID()
  assert.equal((await v.start(other)).statusCode, 409)
  const responses = await Promise.all([v.start(id, requestId), v.start(id, requestId)])
  assert.ok(responses.every((item) => item.statusCode === 202))
  const record = await v.wait(id)
  assert.equal(record.status, "completed")
  assert.equal(record.queries.length, 1); assert.equal(record.observations.length, 2)
  assert.equal(record.candidates[0]?.provenance, "page_link")
  assert.equal(record.candidates[0]?.discoveredOn, record.queries[0]?.observationId)
  assert.equal(record.candidates[0]?.status, "observed")
  assert.equal(record.audits.length, 3); assert.ok(record.audits.every((item) => item.purpose === "source_research" && item.invocations === 1))
  assert.equal(v.fake.calls.at(-1)?.[2], "stop")
  assert.equal(v.current.research.snapshot(other).records.length, 0)
  await v.reopen()
  assert.deepEqual(v.current.research.snapshot(id).records[0], record)
  await v.start(id, requestId); assert.equal(v.fake.modelCalls, 3)
  await v.start(id); const next = await v.wait(id)
  assert.notEqual(next.id, record.id); assert.equal(next.version, 2)
}))

test("伪造 URL/引用/字段不能成为观察或覆盖证据；缺字段保留 partial", async () => withResearch(async (v) => {
  const id = await v.create()
  v.fake.decide = async (prompt) => {
    const decision = decisionFor(prompt)
    if (decision.action === "finish") decision.assessment!.fields = []
    return decision
  }
  await v.start(id); assert.equal((await v.wait(id)).status, "partial")
  v.fake.decide = async (prompt) => {
    const decision = decisionFor(prompt)
    if (decision.action === "finish") decision.assessment!.fields[0]!.evidence = "not-on-page"
    return decision
  }
  await v.start(id); assert.equal((await v.wait(id)).status, "failed")
  v.fake.decide = async (prompt) => ({ ...decisionFor(prompt), action: "visit", candidateId: randomUUID() })
  const before = v.fake.calls.length
  await v.start(id); const record = await v.wait(id)
  assert.equal(record.status, "failed"); assert.equal(record.observations.length, 0)
  assert.ok(!v.fake.calls.slice(before).some((args) => args[1] === "navigate"))
  assert.equal((await v.post(id, { type: "start", requestId: randomUUID(), requirementVersion: 1, url: "https://invented.example/" })).statusCode, 400)
}))

test("受限/失败/会话清理可操作，保留部分证据且不记录敏感原文", async () => withResearch(async (v) => {
  const id = await v.create()
  v.fake.restricted = true
  await v.start(id); const record = await v.wait(id)
  assert.equal(record.status, "manual_required"); assert.equal(record.candidates[0]?.status, "restricted")
  assert.equal(record.observations.length, 1)
  assert.doesNotMatch(JSON.stringify(record), /private-sensitive-data/)
  assert.doesNotMatch(await readFile(path.join(v.directory, "browser", "browser-audit.jsonl"), "utf8"), /private-sensitive-data/)
  v.fake.restricted = false; v.fake.failure = true
  await v.start(id); assert.equal((await v.wait(id)).status, "failed")
  v.fake.failure = false; v.fake.badStop = true
  await v.start(id); const cleanup = await v.wait(id)
  assert.equal(cleanup.status, "cleanup_required")
  assert.equal((await v.start(id)).statusCode, 409)
  v.fake.badStop = false
  await v.current.browser.control(id, { type: "cleanup", runId: cleanup.id })
  await v.start(id); assert.equal((await v.wait(id)).status, "completed")
}))

test("停止/跨任务保护/浏览器互斥，迟到模型输出不发布成功", async () => withResearch(async (v) => {
  const id = await v.create(), other = await v.create(), gate = deferred(), entered = deferred()
  v.fake.decide = async (prompt) => { entered.resolve(); await gate.promise; return decisionFor(prompt) }
  v.fake.close = gate.resolve
  await v.start(id); await entered.promise
  const record = v.current.research.snapshot(id).records[0]!
  assert.equal((await v.start(other)).statusCode, 409)
  assert.equal((await v.post(other, { type: "cancel", researchId: record.id })).statusCode, 409)
  assert.equal((await v.current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "archive", id, archived: true } })).statusCode, 409)
  await v.post(id, { type: "cancel", researchId: record.id })
  const final = await v.wait(id)
  assert.equal(final.status, "cancelled"); assert.equal(final.observations.length, 0)
  assert.equal(v.fake.calls.at(-1)?.[2], "stop")
  assert.equal((await v.post(id, { type: "cancel", researchId: record.id })).statusCode, 202)
}))

test("需求变更阻止旧调研提交，带证据回访谈保持幂等和版本失效", async () => withResearch(async (v) => {
  const id = await v.create(), gate = deferred(), entered = deferred()
  v.fake.decide = async (prompt) => { entered.resolve(); await gate.promise; return decisionFor(prompt) }
  v.fake.close = gate.resolve
  await v.start(id); await entered.promise
  await v.current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "message", requestId: randomUUID(), expectedRevision: 1, text: "调整范围" } })
  gate.resolve(); await v.current.coordinator.waitForIdle()
  const record = await v.wait(id)
  assert.equal(record.status, "failed"); assert.equal(record.reason, "permission_denied")
  assert.ok(v.current.research.snapshot(id).staleIds.includes(record.id))
  const command = { type: "interview", requestId: randomUUID(), researchId: record.id, expectedRevision: 2 }
  assert.equal((await v.post(id, command)).statusCode, 202)
  await v.current.coordinator.waitForIdle()
  assert.equal((await v.post(id, command)).statusCode, 202)
  const state = v.current.coordinator.snapshot(id)
  assert.equal(state.revision, 3); assert.match(state.messages.filter((item) => item.role === "user").at(-1)!.text, /来源调研 v1/)
}))

test("关闭服务会等待模型和浏览器释放，重启没有永久 running", async () => withResearch(async (v) => {
  const id = await v.create(), gate = deferred(), entered = deferred()
  v.fake.decide = async (prompt) => { entered.resolve(); await gate.promise; await delay(20); return decisionFor(prompt) }
  v.fake.close = gate.resolve
  await v.start(id); await entered.promise
  await v.reopen()
  assert.equal(v.current.research.snapshot(id).records[0]?.status, "cancelled")
  assert.equal(v.current.research.snapshot(id).busy, false)
}))

test("语义判定访问闸门立即停止；证据编号解析回实际原文", async () => withResearch(async (v) => {
  const id = await v.create()
  v.fake.decide = async (prompt) => {
    const decision = decisionFor(prompt)
    if (decision.assessment) { decision.assessment.access = "manual_required"; decision.assessment.reason = "页面存在访问验证" }
    return decision
  }
  await v.start(id); const record = await v.wait(id)
  assert.equal(record.status, "manual_required")
  assert.equal(record.queries.length, 1); assert.equal(record.audits.length, 2)
  assert.equal(v.fake.calls.filter((item) => item[1] === "navigate").length, 1)
  v.fake.decide = async (prompt) => decisionFor(prompt)
  await v.start(id); const next = await v.wait(id)
  const field = next.observations.find((item) => item.candidateId)?.assessment?.fields[0]
  assert.match(field!.evidence, /名称/); assert.doesNotMatch(field!.evidence, /^E\d+$/)
}))

test("重启恢复未完成调研与未回报审计，不提升部分证据为成功", async () => withResearch(async (v) => {
  const id = await v.create()
  await v.start(id); const record = await v.wait(id)
  // 仅构造崩溃时的持久化夹具，不用于用户任务或真实验收。
  record.status = "running"; record.audits[0]!.status = "intended"; record.audits[0]!.invocations = null
  new ResearchRepository(v.current.store).save(record)
  await v.reopen()
  const recovered = v.current.research.snapshot(id).records[0]!
  assert.equal(recovered.status, "interrupted")
  assert.equal(recovered.audits[0]?.status, "interrupted"); assert.equal(recovered.audits[0]?.invocations, null)
  assert.deepEqual(recovered.observations, record.observations)
  await v.reopen(); assert.deepEqual(v.current.research.snapshot(id).records[0], recovered)
}))
