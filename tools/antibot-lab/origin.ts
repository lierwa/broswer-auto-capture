import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { DatabaseSync } from "node:sqlite"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { catalog, booking, page } from "./pages.ts"
import { snapshot } from "./report.ts"
import { overview } from "./overview.ts"

const base = process.cwd()
const secret = z.object({ bouncer: z.string().length(64) }).parse(JSON.parse(await readFile(`${base}/secrets.json`, "utf8")))
const input = z.object({ kind: z.enum(["catalog", "booking"]), variant: z.number().int().min(1).max(4).default(1) }).strict()
const stored = z.object({ id: z.uuid(), kind: z.enum(["catalog", "booking"]), variant: z.number().int(), created: z.string() })
const db = new DatabaseSync(`${base}/data/business.sqlite`)
db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, kind TEXT, variant INTEGER, created TEXT); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, case_id TEXT, at TEXT, action TEXT, value TEXT)")
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" })
  res.end(typeof body === "string" ? body : JSON.stringify(body))
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_384) throw Error("body_limit")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}
function record(id: string, action: string, value: unknown) {
  db.prepare("INSERT INTO events(case_id,at,action,value) VALUES(?,?,?,?)").run(id, new Date().toISOString(), action, JSON.stringify(value))
}
async function site(req: IncomingMessage, res: ServerResponse) {
  if (req.headers["x-bat-lab-origin"] !== secret.bouncer) return send(res, 403, { error: "gateway_required" })
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4187")
  if (url.pathname === "/") return send(res, 200, page("反爬检测服务", "<p>网站入口已经通过检测网关。请通过观测入口创建任务场景，再将场景网址交给 B-A-T。</p>"))
  const [, prefix, id, action, value] = url.pathname.split("/")
  const raw = prefix === "case" && z.uuid().safeParse(id).success ? db.prepare("SELECT * FROM cases WHERE id=?").get(id!) : null
  if (!raw) return send(res, 404, { error: "case_not_found" })
  const item = stored.parse(raw)
  if (!action && req.method === "GET") {
    record(item.id, "opened", { variant: item.variant })
    return send(res, 200, item.kind === "catalog" ? catalog(item.id, item.variant) : booking(item.id))
  }
  if (action === "document" && item.kind === "catalog" && req.method === "GET") {
    const version = z.coerce.number().int().min(1).max(99).parse(value)
    const expected = [7, 11, 13][item.variant - 1]
    record(item.id, "selected", { version, correct: version === expected })
    return send(res, 200, page(`资料版本 ${version}`, `<p>版本 ${version} · ${version === 99 ? "预告未发布" : "已发布"}</p><p>本次打开已保存。</p>`))
  }
  if (action === "booking" && item.kind === "booking" && req.method === "POST") {
    if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: "origin_required" })
    const form = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), format: z.enum(["online", "onsite"]) }).parse(Object.fromEntries(new URLSearchParams(await body(req))))
    record(item.id, "submitted", form)
    return send(res, 200, page("预约已提交", `<p>预约代号：${form.code}</p><p>演示方式：${form.format === "online" ? "线上" : "现场"}</p>`))
  }
  return send(res, 404, { error: "route_not_found" })
}
async function management(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4188")
  if (req.headers.host !== "127.0.0.1:4188") return send(res, 403, { error: "host_required" })
  if (req.method === "POST") {
    if (req.headers.origin !== "http://127.0.0.1:4188") return send(res, 403, { error: "origin_required" })
    const variantRoute = /^\/api\/cases\/([a-f0-9-]{36})\/variant$/.exec(url.pathname)
    if (variantRoute) {
      const id = z.uuid().parse(variantRoute[1])
      const update = z.object({ variant: z.number().int().min(1).max(4) }).strict().parse(JSON.parse(await body(req)))
      const result = db.prepare("UPDATE cases SET variant=? WHERE id=?").run(update.variant, id)
      return send(res, result.changes ? 200 : 404, { changed: result.changes === 1 })
    }
    if (url.pathname !== "/api/cases") return send(res, 404, { error: "route_not_found" })
    const item = input.parse(JSON.parse(await body(req))), id = randomUUID()
    db.prepare("INSERT INTO cases VALUES(?,?,?,?)").run(id, item.kind, item.variant, new Date().toISOString())
    // WHY：每个实验独立 cookie 域，避免先前人工访问的通行 cookie 污染自动化测量。
    return send(res, 201, { id, ...item, url: `http://${id}.localhost:4187/case/${id}` })
  }
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" })
  if (url.pathname === "/api/health") return send(res, 200, { owner: "bat-antibot-lab", pid: process.pid, base })
  if (url.pathname === "/api/report") return send(res, 200, await snapshot(base, db))
  if (url.pathname === "/api/cases") return send(res, 200, db.prepare("SELECT * FROM cases ORDER BY created DESC LIMIT 100").all())
  return send(res, 200, await overview(base, db))
}
const listen = (port: number, handler: typeof site) => {
  const server = createServer((req, res) => { void handler(req, res).catch(() => send(res, 400, { error: "invalid_request" })) })
  server.listen(port, "127.0.0.1")
  return server
}
const servers = [listen(4189, site), listen(4188, management)]
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  for (const server of servers) { server.closeAllConnections(); server.close() }
  db.close()
})
