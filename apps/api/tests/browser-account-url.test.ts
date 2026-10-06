import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { admitAccountChain, executeAccount } from "../src/browser/account-runtime.js"
import { accountFixtureChain } from "./browser-account-fixture.js"

// WHY：自定义只读链须绑定用户选择的入口；不是人工登录窗口的导航成功条件。
test("custom account chain canonicalizes its frozen navigation entry", async () => {
  const raw = "https://example.test", canonical = raw + "/"
  const chain = accountFixtureChain(canonical)
  assert.doesNotThrow(() => admitAccountChain(chain, raw))
  assert.throws(() => admitAccountChain(chain, raw + "/different"), /scope_invalid/)
  const run = await executeAccount(chain, randomUUID(), randomUUID(), raw, { capability: async call => {
    if (call.node.id === "fresh") assert.equal(call.input.url, canonical)
    return { outcome: "success", output: call.node.id === "read" ? [{ state: "signed-in", identity: "Observed" }] : null }
  } }, new AbortController().signal, () => {})
  assert.equal(run.status, "completed"); assert.equal(run.consumed.llmCalls, 0)
})
