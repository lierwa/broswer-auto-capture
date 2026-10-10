import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { DatabaseSync } from "node:sqlite"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { catalog, booking, page } from "./pages.ts"
import { snapshot } from "./report.ts"
import { overview } from "./overview.ts"
import { botdBundle, botdPage } from "./botd.ts"
import { fingerprintBundle, fingerprintPage } from "./fingerprint.ts"
import { humanAsset, saveHuman } from './human.ts'
import { securityFixture, observation } from './security-fixtures.ts'
import { creepProbe } from './creep.ts'
import { collector, ingest, instrument } from './telemetry.ts'
import { workerProbe } from './worker.ts'
import { admitBusiness } from './budget.ts'
import { captchaGate } from './captcha.ts'
import { flowFixture } from './flow.ts'
import { requestedHighEntropyHints } from './identity.ts'
import { checkRoute } from './check.ts'

const base = process.cwd()
const secret = z.object({ bouncer: z.string().length(64) }).parse(JSON.parse(await readFile(`${base}/secrets.json`, "utf8")))
const input = z.object({ kind: z.enum(["catalog", "booking"]), variant: z.number().int().min(1).max(4).default(1) }).strict()
const stored = z.object({ id: z.uuid(), kind: z.enum(["catalog", "booking"]), variant: z.number().int(), created: z.string() })
const db = new DatabaseSync(`${base}/data/business.sqlite`)
db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, kind TEXT, variant INTEGER, created TEXT); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, case_id TEXT, at TEXT, action TEXT, value TEXT)")
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS telemetry_batches ON events(case_id,json_extract(value,'$.page'),json_extract(value,'$.batch')) WHERE action='telemetry-received'")
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" })
  res.end(typeof body === "string" ? body : JSON.stringify(body))
}
async function body(req: IncomingMessage, limit = 16_384) {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Error("body_limit")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}
function record(id: string, action: string, value: unknown) {
  db.prepare("INSERT INTO events(case_id,at,action,value) VALUES(?,?,?,?)").run(id, new Date().toISOString(), action, JSON.stringify(value))
}
function claimTelemetry(id: string, page: string, batch: string) {
  if (!db.prepare("SELECT 1 FROM events WHERE case_id=? AND action='opened' AND json_extract(value,'$.page')=? LIMIT 1").get(id, page)) return false
  // WHY：原SQLite唯一约束原子认领，重复/并发上报和重启后重放均不能制造第二次判定。
  return db.prepare("INSERT OR IGNORE INTO events(case_id,at,action,value) VALUES(?,?,'telemetry-received',?)")
    .run(id, new Date().toISOString(), JSON.stringify({ page, batch })).changes === 1
}
function createCheck() {
  const id = randomUUID(), page = randomUUID()
  db.prepare('INSERT INTO cases VALUES(?,?,?,?)').run(id, 'diagnostic', 1, new Date().toISOString())
  record(id, 'opened', { page })
  return { id, page }
}
async function flowResponse(req: IncomingMessage, res: ServerResponse, id: string, variant: number, action: string | undefined) {
  const reply = await flowFixture(req, id, action, () => body(req, 1024))
  if (reply.outcome === 'opened' && typeof reply.content === 'string') {
    const pageId = randomUUID()
    record(id, 'opened', { variant, page: pageId })
    reply.content = instrument(reply.content, id, pageId)
  }
  await observation(base, req, id, { category: 'workflow', outcome: reply.outcome })
  record(id, 'workflow', { outcome: reply.outcome })
  res.writeHead(reply.status, { 'content-type': typeof reply.content === 'string' ? 'text/html; charset=utf-8' : 'application/json',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...reply.headers })
  res.end(typeof reply.content === 'string' ? reply.content : JSON.stringify(reply.content))
}
async function site(req: IncomingMessage, res: ServerResponse) {
  if (req.headers["x-bat-lab-origin"] !== secret.bouncer) return send(res, 403, { error: "gateway_required" })
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4187")
  if (await checkRoute(base, req, res, url.pathname, createCheck)) return
  if (url.pathname.startsWith('/measurement/worker/')) return workerProbe(base, url, res)
  if (['/shield/collector.js', '/measurement/check/collector.js'].includes(url.pathname) && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    res.end(await collector(base)); return
  }
  const telemetry = /^\/(?:shield|measurement\/check)\/telemetry\/([a-f0-9-]{36})$/.exec(url.pathname)
  if (telemetry && req.method === 'POST' && db.prepare('SELECT id FROM cases WHERE id=?').get(telemetry[1]!)) {
    const receipt = await ingest(base, req, telemetry[1]!, await body(req), (page, batch) => claimTelemetry(telemetry[1]!, page, batch))
    record(telemetry[1]!, 'telemetry', receipt)
    return send(res, 202, receipt)
  }
  if (url.pathname === '/measurement/creep' || url.pathname === '/measurement/creep.js') return creepProbe(base, url, res)
  if (url.pathname === '/measurement/human/collector.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    res.end(await humanAsset(base, 'collector.js')); return
  }
  const human = /^\/measurement\/human\/([a-f0-9]{32})$/.exec(url.pathname)
  if (human) {
    if (req.method === 'GET') return send(res, 200, (await humanAsset(base, 'page')).toString())
    if (req.method !== 'POST' || req.headers.origin !== `https://${req.headers.host}`) return send(res, 403, { error: 'origin_required' })
    return send(res, 201, await saveHuman(base, human[1]!, JSON.parse(await body(req, 1_000_000))))
  }
  if (url.pathname === "/measurement/probe/botd.js") {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    res.end(await botdBundle(base)); return
  }
  if (url.pathname === "/measurement/probe") return send(res, 200, botdPage)
  if (url.pathname === "/measurement/fingerprint") return send(res, 200, fingerprintPage)
  if (url.pathname === "/measurement/fingerprint.js") {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    res.end(await fingerprintBundle(base)); return
  }
  if (url.pathname === "/measurement/inputs") return send(res, 200,
    '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/measurement/inputs.js"></script>')
  if (url.pathname === "/measurement/inputs.js") {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    res.end(await readFile(`${base}/runtime/input-fixture.js`)); return
  }
  // WHY：独立观测路由不判断机器人，只提供本地合成读请求；TLS事实由第一终止点抓包取得。
  if (url.pathname === "/measurement") return send(res, 200, page("协议测量", "<p>仅用于本地网络观测；不是检测通过。</p><input aria-label='合成输入'><button>合成按钮</button>"))
  if (url.pathname === "/measurement/read") return send(res, 200, {
    ok: true, userAgent: req.headers["user-agent"] ?? null,
    clientHints: req.headers["sec-ch-ua"] ?? null,
    language: req.headers["accept-language"] ?? null,
    hasSyntheticCookie: (req.headers.cookie ?? "").split("; ").includes("bat_synthetic=owned"),
  })
  if (url.pathname === "/measurement/redirect") {
    res.writeHead(302, { location: "https://outside.invalid/" }); res.end(); return
  }
  if (url.pathname === "/measurement/challenge") return send(res, 403, "<p>synthetic challenge</p>")
  if (url.pathname === "/measurement/large") return send(res, 200, "x".repeat(100001))
  if (url.pathname === "/") return send(res, 200, page("反爬检测服务", '<p><a href="/measurement/check">打开真人 / 机器人检测网站 →</a></p><p>自动检测浏览器特征，补充交互测试，查看本次识别报告。</p>'))
  const [, prefix, id, action, value] = url.pathname.split("/")
  const raw = prefix === "case" && z.uuid().safeParse(id).success ? db.prepare("SELECT * FROM cases WHERE id=?").get(id!) : null
  if (!raw) return send(res, 404, { error: "case_not_found" })
  const item = stored.parse(raw)
  res.setHeader('Accept-CH', requestedHighEntropyHints)
  const admission = await admitBusiness(base, req, item.id)
  if (admission.status === 'error') return send(res, 503, { error: 'budget_measurement_unavailable' })
  if (admission.status === 'denied') {
    res.setHeader('Retry-After', admission.retryAfter)
    return send(res, 429, { error: 'rolling_business_budget_exceeded', intervalMs: admission.intervalMs, limit: admission.limit })
  }
  const security = await securityFixture(base, req, item.id, action ?? '', value, () => body(req))
  if (security) return send(res, security.status, security.content)
  if (action === 'flow') return flowResponse(req, res, item.id, item.variant, value)
  if (action === 'captcha' && !value) {
    const reply = await captchaGate(req, item.id, () => body(req, 1024))
    for (const [name, value] of Object.entries(reply.headers ?? {})) res.setHeader(name, value)
    record(item.id, 'captcha', { outcome: reply.outcome })
    return send(res, reply.status, reply.content)
  }
  if (!action && req.method === "GET") {
    const pageId = randomUUID()
    record(item.id, "opened", { variant: item.variant, page: pageId })
    return send(res, 200, instrument(item.kind === "catalog" ? catalog(item.id, item.variant) : booking(item.id), item.id, pageId))
  }
  if (action === "document" && item.kind === "catalog" && req.method === "GET") {
    const version = z.coerce.number().int().min(1).max(99).parse(value)
    const expected = [7, 11, 13][item.variant - 1]
    record(item.id, "selected", { version, correct: version === expected })
    return send(res, 200, page(`资料版本 ${version}`, `<p>版本 ${version} · ${version === 99 ? "预告未发布" : "已发布"}</p><p>本次打开已保存。</p>`))
  }
  if (action === "booking" && item.kind === "booking" && req.method === "POST") {
    const scheme = req.headers["x-forwarded-proto"] === "https" ? "https" : "http"
    if (req.headers.origin !== `${scheme}://${req.headers.host}`) return send(res, 403, { error: "origin_required" })
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
