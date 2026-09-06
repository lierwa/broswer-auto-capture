import Fastify from "fastify"
import { z } from "zod"
import { researchFixture, decisionFor } from "./research-fixture.js"
import { deferred } from "./helpers.js"

// 隔离验收用模型/页面替身；用户操作始终走正式任务、需求、调研 API。
const fixture = await researchFixture(true), taskId = await fixture.create(), otherId = await fixture.create(false)
const controls = Fastify({ logger: false })
let gate = deferred()
controls.post("/mode", (request) => {
  const mode = z.enum(["normal", "waiting", "partial", "manual", "failed", "cleanup"]).parse(request.body)
  gate.resolve(); gate = deferred()
  fixture.fake.restricted = mode === "manual"; fixture.fake.failure = mode === "failed"; fixture.fake.badStop = mode === "cleanup"
  fixture.fake.close = gate.resolve
  fixture.fake.decide = async (prompt) => {
    if (mode === "waiting") await gate.promise
    const decision = decisionFor(prompt)
    if (mode === "partial" && decision.action === "finish") {
      decision.assessment!.fields = []
      decision.gaps = [{ description: "代表页名称字段尚无依据，需要继续调查。", observationIds: [decision.assessment!.observationId], requiresUser: false }]
    }
    return decision
  }
  return { taskId, otherId }
})
controls.get("/state", () => ({ taskId, otherId, research: fixture.current.research.snapshot(taskId), interview: fixture.current.coordinator.snapshot(taskId) }))
controls.post("/shutdown", () => { setTimeout(() => { void close() }, 100); return {} })
await fixture.current.app.listen({ host: "127.0.0.1", port: 4176 })
await controls.listen({ host: "127.0.0.1", port: 4177 })
process.stdout.write(JSON.stringify({ taskId, otherId, directory: fixture.directory, url: "http://127.0.0.1:4176" }) + "\n")
async function close() { gate.resolve(); await controls.close(); await fixture.close() }
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
