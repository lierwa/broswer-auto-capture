import Fastify from "fastify"
import { z } from "zod"
import { chainFixture } from "./chain-fixture.js"

// WHY：UI替身来源与模型隔离，授权、结果和生命周期仍通过正式API生成。
const fixture = await chainFixture(true, true), taskId = await fixture.readyChain(), otherId = await fixture.create(false)
const controls = Fastify({ logger: false })
controls.get("/state", () => ({ taskId, otherId, plan: fixture.current.plan.snapshot(taskId), chains: fixture.current.chain.snapshot(taskId, fixture.current.plan.snapshot(taskId)) }))
controls.post("/mode", (request) => {
  const mode = z.enum(["normal", "failed"]).parse(request.body)
  fixture.fake.failure = mode === "failed"; return {}
})
controls.post("/shutdown", () => { setTimeout(() => { void close() }, 100); return {} })
await fixture.current.app.listen({ host: "127.0.0.1", port: 4176 }); await controls.listen({ host: "127.0.0.1", port: 4177 })
process.stdout.write(JSON.stringify({ taskId, otherId, directory: fixture.directory }) + "\n")
async function close() { await controls.close(); await fixture.close() }
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
