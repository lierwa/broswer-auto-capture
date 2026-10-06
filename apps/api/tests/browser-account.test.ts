import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { createApplication } from "../src/app.js"
import { accountFixtureChain } from "./browser-account-fixture.js"
import { accountResult, executeAccount, admitAccountChain } from "../src/browser/account-runtime.js"
import { AccountIdentities } from "../src/browser/account-identity.js"

const headers = { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }
test("legacy reads preserve history and Profile identity; retired mutations return 410", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-account-contract-"))
  let api = await createApplication({ root: process.cwd(), directory })
  const command = async (payload: unknown) => api.app.inject({ method: "POST", url: "/api/browser/accounts", headers: { ...headers, "content-type": "application/json" }, payload: JSON.stringify(payload) })
  try {
    assert.equal(api.accounts.snapshot().identities.length, 0)
    assert.equal((await api.app.inject({ url: "/api/browser/accounts", headers })).statusCode, 200)
    assert.equal(api.accounts.snapshot().identities.length, 0)
    let identities = new AccountIdentities(directory, api.dailyChrome, api.accounts.repository)
    const a = await identities.identify("dedicated")
    assert.equal((await identities.identify("dedicated")).id, a.id)
    api.dailyChrome.accountBinding = async () => ({ binding: "a".repeat(64), name: "Daily A" })
    const dailyA = await identities.identify("daily")
    api.dailyChrome.accountBinding = async () => ({ binding: "b".repeat(64), name: "Daily B" })
    const dailyB = await identities.identify("daily")
    assert.notEqual(dailyA.id, dailyB.id); assert.notEqual(a.id, dailyA.id)
    const entry = { name: "Test", url: "https://example.test/identity", note: "manual label", expectedIdentity: "" }
    assert.equal((await command({ type: "add", browserIdentityId: a.id, entry })).statusCode, 410)
    // 历史reader仍读取已存在事实；新入口不再要求填写手工建档表单。
    const saved = api.accounts.repository.save("entry", { ...entry, id: randomUUID(), browserIdentityId: a.id,
      revision: 0, methodId: null, deletedAt: null, createdAt: new Date().toISOString() })
    assert.equal(api.accounts.snapshot().checks.length, 0, "manual note cannot verify identity")
    assert.equal((await command({ type: "edit", entryId: saved.id, revision: -1, entry })).statusCode, 410)
    assert.equal((await api.app.inject({ method: "POST", url: "/api/browser/accounts", headers: { host: headers.host },
      payload: { type: "remove", entryId: saved.id, revision: 0 } })).statusCode, 403)
    await api.app.close(); api = await createApplication({ root: process.cwd(), directory })
    assert.equal(api.accounts.snapshot().entries[0]!.note, "manual label")
    identities = new AccountIdentities(directory, api.dailyChrome, api.accounts.repository)
    assert.equal((await identities.identify("dedicated")).id, a.id)
    assert.equal((await command({ type: "remove", entryId: saved.id, revision: 0 })).statusCode, 410)
    assert.equal((await api.app.inject({ method: "POST", url: "/api/browser/platform-accounts", headers,
      payload: { type: "open" } })).statusCode, 410)
    assert.equal((await api.app.inject({ url: "/api/browser/account-directory/chains", headers })).statusCode, 200)
    assert.equal(api.accounts.snapshot().entries.length, 1, "retired mutation cannot remove existing history")
  } finally { await api.app.close() }
})

test("real TaskChain/QuickJS classifies observed values with 0 model; node failure stays inconclusive", async () => {
  const url = "https://example.test/identity", chain = accountFixtureChain(url)
  for (const [state, identity, expected] of [["signed-in", "Test A", "verified"], ["signed-out", "", "unauthenticated"],
    ["challenge", "", "inconclusive"], ["changed", "", "inconclusive"]]) {
    const run = await executeAccount(chain, randomUUID(), randomUUID(), url, { async capability(invocation) {
      return { outcome: "success", output: invocation.node.id === "read" ? [{ state: state!, identity: identity! }] : null }
    } }, new AbortController().signal, () => {})
    assert.equal(accountResult(run).outcome, expected); assert.equal(run.consumed.llmCalls, 0)
  }
  const failed = await executeAccount(chain, randomUUID(), randomUUID(), url, { capability: async () => { throw Error("network") } },
    new AbortController().signal, () => {})
  assert.equal(accountResult(failed).outcome, "inconclusive")
  const forbidden = structuredClone(chain)
  const node = forbidden.nodes[0]!
  if (node.kind === "capability") node.config = { actionName: "click" }
  assert.throws(() => admitAccountChain(forbidden, url), /scope_invalid/)
})
