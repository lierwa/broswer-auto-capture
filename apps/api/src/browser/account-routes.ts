import type { FastifyInstance } from "fastify"
import type { BrowserAccountService } from "./account-service.js"
import { DomainError } from "../errors.js"

export function mountBrowserAccounts(app: FastifyInstance, accounts: BrowserAccountService, assertWritable: () => void) {
  app.get("/api/browser/account-directory", async () => { await accounts.directory.refreshProfiles(); return accounts.directory.snapshot() })
  app.post("/api/browser/account-directory", async (request, reply) => {
    if (request.headers["sec-fetch-site"] !== "same-origin") throw new DomainError("forbidden_origin", "请从当前工作台管理账号。", 403)
    assertWritable()
    return reply.code(202).send(await accounts.directoryCommand(request.body))
  })
  app.get("/api/browser/accounts", () => accounts.snapshot())
  app.get("/api/browser/platform-accounts", async () => { await accounts.refreshIdentityProjection(); return accounts.platformSnapshot() })
  app.get<{ Querystring: { url?: string } }>("/api/browser/account-directory/chains", request =>
    accounts.custom.choices(request.query.url).map(({ chain: _chain, ...choice }) => choice))
  app.post("/api/browser/platform-accounts", async request => {
    if (request.headers["sec-fetch-site"] !== "same-origin") throw new DomainError("forbidden_origin", "请从当前工作台管理账号。", 403)
    assertWritable()
    throw new DomainError("account_legacy_ui_retired", "请使用新的平台账号目录。", 410)
  })
  app.post("/api/browser/accounts", async request => {
    if (request.headers["sec-fetch-site"] !== "same-origin") throw new DomainError("forbidden_origin", "请从当前工作台管理账号。", 403)
    assertWritable()
    throw new DomainError("account_legacy_ui_retired", "请使用新的平台账号目录。", 410)
  })
}
