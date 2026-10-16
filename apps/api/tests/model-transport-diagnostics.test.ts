import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { withModelTransport } from "../src/upstream-browser/model-transport-diagnostics.js"

// 不变量：使用真实 fetch 诊断，错误关联到各自调用；正文、请求地址及凭据永不返回。
test("模型请求诊断隔离并发且保留 HTTP 和网络失败类别", async () => {
  const server = createServer((req, res) => { res.writeHead(req.url === "/private" ? 503 : 200); res.end("private body") })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port, url = `http://127.0.0.1:${port}`
  try {
    const results = await Promise.all(["/private", "/ok"].map(path => withModelTransport(async diagnostic => {
      await (await fetch(url + path, { headers: { authorization: "private" } })).text()
      return diagnostic()
    })))
    assert.deepEqual(results, [{ code: null, httpStatus: 503 }, undefined])
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  const failure = await withModelTransport(async diagnostic => {
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }))
    return diagnostic()
  })
  assert.equal(failure?.httpStatus, null)
  assert.ok(["ECONNREFUSED", "ECONNRESET"].includes(failure?.code ?? ""))
})
