import Fastify from "fastify"
import { z } from "zod"
import { chainFixture, chainDecision } from "./chain-fixture.js"
import { deferred } from "./helpers.js"

// UI 验收使用模型/来源页面替身；链路事实仍经过正式授权、编译、执行与持久化路径。
const fixture = await chainFixture(true), taskId = await fixture.readyChain(), otherId = await fixture.create(false)
const controls = Fastify({ logger: false }); let gate = deferred()
controls.get("/state", () => ({ taskId, otherId, plan: fixture.current.plan.snapshot(taskId), chains: fixture.current.chain.snapshot(taskId, fixture.current.plan.snapshot(taskId)) }))
controls.post("/mode", (request) => {
  const mode = z.enum(["normal", "waiting", "failed", "release"]).parse(request.body)
  if (mode === "release") { gate.resolve(); return {} }
  gate.resolve(); gate = deferred()
  fixture.chainFake.decide = async (prompt) => {
    if (mode === "waiting") await gate.promise
    const decision = chainDecision(prompt)
    if (mode === "failed" && decision.graph) decision.graph.nodes = decision.graph.nodes.map((node) => node.id === "extract" ? { id: "extract", label: "定位缺失按钮", kind: "click", target: { role: "button", name: "Missing" }, next: "save" } : node)
    return decision
  }
  return {}
})
controls.post("/shutdown", () => { gate.resolve(); setTimeout(() => { void close() }, 100); return {} })
await fixture.current.app.listen({ host: "127.0.0.1", port: 4176 }); await controls.listen({ host: "127.0.0.1", port: 4177 })
process.stdout.write(JSON.stringify({ taskId, otherId, directory: fixture.directory }) + "\n")
async function close() { gate.resolve(); await controls.close(); await fixture.close() }
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
