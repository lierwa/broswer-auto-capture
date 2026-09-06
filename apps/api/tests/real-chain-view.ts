import path from "node:path"
import { fileURLToPath } from "node:url"
import { createApplication } from "../src/app.js"
import Fastify from "fastify"

// WHY：只读已有真实验收事实；展示页面不得消费旧授权或发起新探索。
const root = fileURLToPath(new URL("../../..", import.meta.url))
const current = await createApplication({ root, directory: path.join(root, "work/f3-real-1788678265551"), serveUi: true, planExecutor: null })
const control = Fastify({ logger: false })
const close = async () => { await current.app.close(); await control.close() }
control.post("/shutdown", () => { setTimeout(() => { void close() }, 100); return {} })
await current.app.listen({ host: "127.0.0.1", port: 4178 })
await control.listen({ host: "127.0.0.1", port: 4179 })
process.once("SIGINT", () => { void close() })
process.once("SIGTERM", () => { void close() })
