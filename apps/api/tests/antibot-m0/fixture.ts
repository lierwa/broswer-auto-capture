import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage } from "node:http"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { fixturePage, clientScript } from "./page.js"
import { analyze, submission, type Mode } from "./report.js"

const action = z.object({ version: z.number().int(), trusted: z.boolean() }).strict()
async function readBody(request: IncomingMessage) {
  const parts: Buffer[] = []; let size = 0
  for await (const part of request) {
    size += part.length
    if (size > 512_000) throw Error("body_limit")
    parts.push(part)
  }
  return JSON.parse(Buffer.concat(parts).toString()) as unknown
}
export async function createFixture(bundle: Buffer, directory: string) {
  return createProbeFixture(bundle, directory, { script: clientScript, parse: raw => submission.parse(raw), analyze })
}

// WHY：独立探针复用同一业务页面、请求门和生命周期，但不伪装成 fpscanner 的字段或判定。
export async function createProbeFixture<T>(bundle: Buffer, directory: string, probe: {
  script: string; parse(raw: unknown): unknown; analyze(raw: unknown): T;
  assets?: Record<string, { body: Buffer; type: string }>;
  allowObject?: boolean;
}) {
  const cases = new Map<string, ReturnType<typeof newCase>>()
  let savedBytes = 0
  function newCase(mode: Mode, round: number) {
    return { id: randomUUID(), mode, round, collect: false, action: null as z.infer<typeof action> | null,
      result: null as T | null, submissions: 0, requests: [] as { route: string; method: string; at: string }[],
      violations: [] as string[], documentRequests: 0 }
  }
  const server = createServer((req, res) => { void handle(req, res).catch(() => { res.writeHead(400); res.end() }) })
  const handle = async (req: IncomingMessage, res: import("node:http").ServerResponse) => {
    res.setHeader("cache-control", "no-store")
    res.setHeader("x-content-type-options", "nosniff")
    res.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' about:; img-src data:"
      + (probe.allowObject ? "; object-src 'self'" : ""))
    if (req.headers.host !== new URL(origin).host) { res.writeHead(403); res.end(); return }
    const route = req.url ?? "/"
    const asset = probe.assets?.[route]
    if (asset) { res.setHeader("content-type", asset.type); res.end(asset.body); return }
    if (route === "/probe.js" || route === "/client.js") {
      res.setHeader("content-type", "text/javascript"); res.end(route === "/probe.js" ? bundle : probe.script); return
    }
    const [, prefix, id, endpoint] = route.split("/")
    const item = prefix === "case" ? cases.get(id ?? "") : undefined
    if (!item) { res.writeHead(404); res.end(); return }
    item.requests.push({ route: endpoint ?? "document", method: req.method ?? "GET", at: new Date().toISOString() })
    if (!endpoint && req.method === "GET") {
      item.documentRequests++; res.setHeader("content-type", "text/html; charset=utf-8"); res.end(fixturePage(item.round)); return
    }
    if (endpoint === "gate" && req.method === "GET") {
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ collect: item.collect })); return
    }
    if (req.method !== "POST" || req.headers.origin !== origin) { res.writeHead(403); res.end(); return }
    const raw = await readBody(req)
    if (endpoint === "action") {
      if (item.action || item.result) { res.writeHead(409); res.end(); return }
      item.action = action.parse(raw)
      if (item.mode === "manual") item.collect = true
    } else if (endpoint === "result") {
      item.submissions++
      if (item.result) { res.writeHead(409); res.end(); return }
      const bytes = JSON.stringify(probe.parse(raw), null, 2)
      if (savedBytes + Buffer.byteLength(bytes) > 20 * 1024 * 1024) throw Error("evidence_capacity")
      savedBytes += Buffer.byteLength(bytes)
      await writeFile(path.join(directory, `${item.id}.raw.json`), bytes, { flag: "wx" })
      item.result = probe.analyze(raw)
    } else if (endpoint === "violation") {
      item.violations.push(z.object({ directive: z.string().max(100) }).parse(raw).directive)
    } else { res.writeHead(404); res.end(); return }
    res.writeHead(204); res.end()
  }
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { origin, add(mode: Mode, round: number) {
    const item = newCase(mode, round); cases.set(item.id, item)
    return { item, url: `${origin}/case/${item.id}` }
  }, async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
