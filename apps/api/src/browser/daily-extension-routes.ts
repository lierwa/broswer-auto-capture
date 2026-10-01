import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import { DomainError } from "../errors.js"
import type { DailyChromeExtension } from "./daily-extension.js"

// WHY：凭据只从既有同源工作台写入；状态响应不含 token，沿用现有 Fetch Metadata 安全边界。
export function mountDailyChromeExtension(app: FastifyInstance, extension: DailyChromeExtension,
  assertWritable: () => void) {
  const guard = (request: FastifyRequest) => {
    assertWritable()
    if (request.headers["sec-fetch-site"] !== "same-origin"
      || request.headers.origin !== `http://${request.headers.host}`) {
      throw new DomainError("forbidden_browser_authorization_origin", "浏览器授权只能由当前工作台管理。", 403)
    }
  }
  app.get("/api/browser/daily-chrome", () => extension.snapshot())
  app.post("/api/browser/daily-chrome/authorize", async request => {
    guard(request)
    const input = z.object({ profileDirectory: z.string().min(1) }).strict().parse(request.body)
    return extension.openAuthorization(input.profileDirectory)
  })
  app.put("/api/browser/daily-chrome", async request => { guard(request); return extension.pair(request.body) })
  app.delete("/api/browser/daily-chrome", async request => { guard(request); return extension.revoke() })
}
