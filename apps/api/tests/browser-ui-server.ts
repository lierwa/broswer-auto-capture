import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { createApplication } from "../src/app.js"
import { authoredInterview, draft } from "./helpers.js"
import { testAIModel } from "./fixtures/ai-model.js"

// 隔离验收：模型和页面内容是替身；所有状态均经过正式服务，禁止直接写成功记录。
const root = fileURLToPath(new URL("../../../", import.meta.url)), directory = path.join(root, "work", `f2-ui-${Date.now()}`)
let mode = "normal"
const application = await createApplication({ root, directory, serveUi: true,
  aiModel: testAIModel(async function* () { yield authoredInterview({ assistantText: "验收范围已整理。", question: null, draft }) }),
  browserExecutor: async (args, signal) => {
    if (args[1] === "observe" && mode === "waiting") await new Promise<void>((resolve) => signal!.addEventListener("abort", () => resolve(), { once: true }))
    if (args[1] === "observe" && mode === "failed") return { stdout: "{}", exitCode: 1 }
    const value = args[1] === "session" ? args[2] === "start" ? { session_id: "abcd" } : { stopped: mode === "cleanup" ? [] : ["abcd"], failed: [], return_failures: [] }
      : args[1] === "tab" ? { tabs: [{ tab_id: 1, url: "https://example.com/", active: true, scope: "agent" }] }
      : { tab_id: 1, text: mode === "manual" ? "请先登录" : "受控页面", truncated: false }
    return { stdout: JSON.stringify(value), exitCode: signal?.aborted ? -1 : 0 }
  },
})
const { app, coordinator, browser } = application
const taskId = coordinator.taskAction({ type: "create", requestId: randomUUID() })
coordinator.dispatch(taskId, { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "F2 浏览器状态隔离验收" })
await coordinator.waitForIdle()
coordinator.dispatch(taskId, { type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1 })
// Fastify ready 后用独立子服务提供测试控制；生产 app 不注册测试入口。
const { default: Fastify } = await import("fastify")
const controls = Fastify({ logger: false })
controls.post("/start", (request) => {
  mode = z.enum(["normal", "waiting", "manual", "failed", "cleanup"]).parse(request.body)
  void browser.run({ taskId, runId: randomUUID(), requirementVersion: 1, purpose: "verification", allowedOrigins: ["https://example.com"], actions: ["observe"], maxCommands: 20, timeoutMs: 60_000 },
    (session) => session.command({ type: "observe" })).catch(() => {})
  return { taskId }
})
controls.post("/allow-cleanup", () => { mode = "normal"; return {} })
await app.listen({ host: "127.0.0.1", port: 4176 })
await controls.listen({ host: "127.0.0.1", port: 4177 })
process.stdout.write(JSON.stringify({ taskId, directory, url: "http://127.0.0.1:4176" }) + "\n")
const close = async () => { await controls.close(); await app.close() }
process.once("SIGINT", () => { void close() }); process.once("SIGTERM", () => { void close() })
