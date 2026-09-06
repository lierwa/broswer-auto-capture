import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { BrowserSession, BrowserError, pageSchema, publicUrl } from "../src/index.js"
import type { BrowserGrant } from "../src/contracts.js"
import { PAGE_LINKS_EXPRESSION } from "../src/page.js"

function context(purpose: BrowserGrant["purpose"] = "source_research") {
  const fake = { url: "https://www.bing.com/search?q=brand", error: false, restricted: false, calls: [] as string[] }
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose, allowedOrigins: ["https://www.bing.com"], actions: ["page", "follow"], maxCommands: 50, timeoutMs: 10000 }
  const session = new BrowserSession(grant, "abcd", async (name, args) => {
    fake.calls.push(name)
    if (name === "tab_list") return { tabs: [{ tab_id: 1, url: fake.url, active: true, scope: "agent" }] }
    if (name === "observe") return { tab_id: 1, text: fake.restricted ? "请先登录" : "公开目录", truncated: false }
    if (name === "navigate") { fake.url = args[1]!; return { tab_id: 1 } }
    assert.equal(args[1], PAGE_LINKS_EXPRESSION)
    return { ok: !fake.error, tab_id: 1, value: { url: fake.url, title: "搜索", links: [
      { url: "https://example.com/catalog", title: "目录" }, { url: "javascript:alert(1)", title: "不可用" }, { url: "https://example.com/?token=private", title: "私有" },
    ] } }
  })
  return { session, fake }
}
test("实际 href 才能扩展调研来源，目标不接受脚本/秘密参数/未经发现 URL", async () => {
  const { session, fake } = context()
  try {
    await assert.rejects(session.command({ type: "follow", url: "https://example.com/catalog" }))
    const page = pageSchema.parse(JSON.parse(await session.command({ type: "page" }) ?? "null"))
    assert.deepEqual(page.links, [{ url: "https://example.com/catalog", title: "目录" }])
    await session.command({ type: "follow", url: page.links[0]!.url })
    assert.equal(fake.url, "https://example.com/catalog")
    await assert.rejects(session.command({ type: "follow", url: "https://invented.example/" }))
    await assert.rejects(session.command({ type: "page", expression: "document.cookie" }))
  } finally { await session.close() }
})
test("复跑不能动态扩权；受限页面不提取链接；evaluate ok=false 即使 RPC 成功也拒绝", async () => {
  const { session, fake } = context("replay")
  try {
    await session.command({ type: "page" })
    await assert.rejects(session.command({ type: "follow", url: "https://example.com/catalog" }), (e: unknown) => e instanceof BrowserError && e.code === "permission_denied")
    fake.error = true; await assert.rejects(session.command({ type: "page" }))
    fake.restricted = true; const previous = fake.calls.filter((call) => call === "page_links").length
    await assert.rejects(session.command({ type: "page" }))
    assert.equal(fake.calls.filter((call) => call === "page_links").length, previous)
  } finally { await session.close() }
})
test("搜索跳转只解码页面原有目标，过滤凭证与身份链接", () => {
  const target = "https://example.com/catalog?id=42"
  assert.equal(publicUrl(`https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString("base64url")}`), target)
  assert.equal(publicUrl("https://user:password@example.com/"), null)
  assert.equal(publicUrl("https://example.com/login"), null)
  assert.equal(publicUrl("https://example.com/?auth_token=test"), null)
})
