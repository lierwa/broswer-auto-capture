import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { BrowserModel } from "../../../vendor/daily-chrome-extension/browserModel.js"
import { CDPOwnerScopes } from "../../../vendor/daily-chrome-extension/cdpOwnerScopes.js"

// WHY：重启丢失内存映射后仍只关闭原生身份匹配的任务页；未知状态不得伪确认。
test("restarted relay closes only persisted owner targets through native identity", async () => {
  const moduleUrl = new URL("../../../vendor/daily-chrome-extension/extension/src/closeOwnedTarget.ts", import.meta.url).href
  const { closeOwnedTarget } = await import(moduleUrl) as { closeOwnedTarget(id: unknown): Promise<{ success: boolean }> }
  const previous = (globalThis as any).chrome, removed: number[] = []
  let targets = [{ id: "owned", tabId: 11, type: "page" }, { id: "private", tabId: 12, type: "page" }]
  const scopes = new CDPOwnerScopes(), owner = randomUUID()
  scopes.register(owner, ["owned", "already-gone"])
  scopes.response(owner, "Target.attachToTarget", { targetId: "owned" }, { sessionId: "owned-session" })
  const model = new BrowserModel(async (method, params) => {
    assert.equal(method, "bat.closeOwnedTarget"); return closeOwnedTarget(params[0])
  })
  ;(globalThis as any).chrome = { debugger: { getTargets: async () => targets }, tabs: {
    remove: async (id: number) => { removed.push(id); targets = targets.filter(t => t.tabId !== id) } } }
  try {
    assert.throws(() => scopes.check(owner, "Target.closeTarget", { targetId: "private" }), /not_authorized/)
    assert.throws(() => scopes.check(owner, "Target.closeTarget", { targetId: "private" }, "owned-session"), /not_authorized/)
    for (const targetId of ["owned", "already-gone", "owned"]) {
      scopes.check(owner, "Target.closeTarget", { targetId })
      assert.deepEqual(await model.closeTarget(targetId), { success: true })
    }
    assert.deepEqual(removed, [11]); assert.deepEqual(targets.map(t => t.id), ["private"])
    await assert.rejects(closeOwnedTarget(undefined), /target_required/)
    targets.push({ id: "worker", tabId: 13, type: "worker" })
    await assert.rejects(closeOwnedTarget("worker"), /not_page/)
    ;(globalThis as any).chrome.tabs.remove = async () => {}
    assert.deepEqual(await closeOwnedTarget("private"), { success: false })
    ;(globalThis as any).chrome.debugger.getTargets = async () => { throw Error("native_enumeration_failed") }
    await assert.rejects(closeOwnedTarget("unknown"), /native_enumeration_failed/)
  } finally { (globalThis as any).chrome = previous }
})
