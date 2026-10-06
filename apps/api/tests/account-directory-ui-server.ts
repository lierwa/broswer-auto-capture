import { z } from "zod"
import { createServer } from "node:http"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { randomUUID } from "node:crypto"
import { accountFixtureChain } from "./browser-account-fixture.js"
const fixture = await directoryFixture(true)
fixture.api.accounts.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: "owned-custom-fixture", platformVersion: "fixture",
  sourceDigest: "a".repeat(64), chain: accountFixtureChain("https://fixture.test/account"), createdAt: new Date().toISOString() })
const steering = createServer(async (request, response) => {
  let body = ""; for await (const part of request) body += String(part)
  const patch = z.object({ daily: z.string().optional(), dedicated: z.string().optional(), gate: z.boolean().optional(), longName: z.boolean().optional() }).strict().parse(JSON.parse(body))
  if (patch.daily !== undefined) fixture.state.daily = patch.daily
  if (patch.dedicated !== undefined) fixture.state.dedicated = patch.dedicated
  if (patch.gate !== undefined) fixture.state.gate = patch.gate
  if (patch.longName) { const account = fixture.api.accounts.directory.current("bilibili")
    if (account) fixture.api.accounts.repository.saveLogical({ ...account, displayIdentity: "受控测试中的一个很长很长很长的账号名称".repeat(4).slice(0, 120) }) }
  response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ accepted: true }))
})
await new Promise<void>(resolve => steering.listen(4199, "127.0.0.1", resolve))
await fixture.api.app.listen({ host: "127.0.0.1", port: 4198 })
console.log(JSON.stringify({ port: 4198, directory: fixture.directory, fixtureOnly: true }))
