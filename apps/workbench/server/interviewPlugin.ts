import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"
import { interviewRequestSchema } from "../src/interviewContract.js"
import { taskActionSchema, taskIdSchema } from "../src/taskContract.js"
import { TaskService } from "./taskService.js"

export function interviewPlugin(root: string): Plugin {
  const service = new TaskService(root, process.env.BROWSER_CAPTURE_INTERVIEW_DATA_DIRECTORY ?? path.join(root, "data"))
  return { name: "local-interview", async configureServer(server) {
    await service.restore()
    server.httpServer?.once("close", () => { void service.close() })
    server.middlewares.use("/api", (req, res) => { void respond(service, req, res) })
  } }
}

async function respond(service: TaskService, req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store")
  const host = req.headers.host ?? ""
  // WHY：本地模型调用有真实费用；拒绝跨站请求和 DNS rebinding，不开放 CORS。
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) {
    res.writeHead(403).end(); return
  }
  if (req.method !== "GET" && req.method !== "POST") { res.writeHead(405).end(); return }
  if (req.method === "POST" && !req.headers["content-type"]?.startsWith("application/json")) { res.writeHead(415).end(); return }
  try {
    const url = new URL(req.url ?? "/", `http://${host}`)
    res.setHeader("Content-Type", "application/json")
    if (url.pathname === "/tasks") {
      if (req.method === "GET") { res.end(JSON.stringify(service.list())); return }
      const id = await service.action(taskActionSchema.parse(JSON.parse(await body(req))))
      res.end(JSON.stringify({ id, tasks: service.list() })); return
    }
    if (url.pathname !== "/interview") { res.writeHead(404).end(); return }
    const id = taskIdSchema.parse(url.searchParams.get("taskId"))
    if (req.method === "GET") { res.end(JSON.stringify(service.get(id).snapshot())); return }
    const request = interviewRequestSchema.parse(JSON.parse(await body(req)))
    res.setHeader("Content-Type", "application/x-ndjson")
    for await (const state of service.handle(id, request)) {
      if (res.destroyed) break
      res.write(`${JSON.stringify({ state })}\n`)
    }
    res.end()
  } catch (error) {
    if (!res.headersSent) res.statusCode = 400
    res.end(`${JSON.stringify({ error: error instanceof Error && !error.message.includes("{") ? error.message : "请求无效，请刷新重试。" })}\n`)
  }
}

async function body(req: IncomingMessage) {
  let value = ""
  for await (const chunk of req) {
    value += String(chunk)
    if (Buffer.byteLength(value) > 100_000) throw new Error("输入过长。")
  }
  return value
}
