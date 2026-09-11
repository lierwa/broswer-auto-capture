import Fastify from "fastify"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { evidenceDecisionFor, headers, planFixture, proposalFor } from "./plan-fixture.js"
import { deferred } from "./helpers.js"

// 模型与来源页面是显式替身；全部计划/授权/版本变化通过正式服务产生，独立于用户 data。
const fixture = await planFixture(true), taskId = await fixture.ready(), otherId = await fixture.create(false)
const controls = Fastify({ logger: false }); let gate = deferred()
controls.post("/mode", async (request) => {
  const mode = z.enum(["normal", "waiting", "failed", "blocking", "invalidate"]).parse(request.body)
  gate.resolve(); gate = deferred(); fixture.planFake.close = gate.resolve
  fixture.planFake.decide = async (prompt) => {
    if (mode === "waiting") await gate.promise
    if (mode === "failed") return {}
    const proposal = proposalFor(prompt)
    if (mode === "blocking") proposal.gaps.forEach((gap) => { gap.disposition = "blocking"; gap.explanation = "来源归属口径需要用户决定。" })
    return proposal
  }
  if (mode === "blocking") {
    fixture.fake.decide = async (prompt) => {
      const result = evidenceDecisionFor(prompt)
      if (result.action === "finish") result.gaps = [{ description: "来源归属口径需要确认", observationIds: result.coverage[0]!.observationIds, requiresUser: true }]
      return result
    }
  }
  if (mode === "invalidate") {
    await fixture.current.app.inject({ method: "POST", url: `/api/interview?taskId=${taskId}`, headers,
      payload: { type: "message", requestId: randomUUID(), expectedRevision: 1, text: "修改范围，请保留历史计划" } })
    await fixture.current.coordinator.waitForIdle(); await fixture.current.plan.queue.tick()
  }
  return { taskId, otherId }
})
controls.get("/state", () => ({ taskId, otherId, plan: fixture.current.plan.snapshot(taskId), interview: fixture.current.coordinator.snapshot(taskId) }))
controls.post("/shutdown", () => { setTimeout(() => { void close() }, 100); return {} })
await fixture.current.app.listen({ host: "127.0.0.1", port: 4176 }); await controls.listen({ host: "127.0.0.1", port: 4177 })
process.stdout.write(JSON.stringify({ taskId, otherId, directory: fixture.directory }) + "\n")
async function close() { gate.resolve(); await controls.close(); await fixture.close() }
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
