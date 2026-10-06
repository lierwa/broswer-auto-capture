import assert from "node:assert/strict"
import test from "node:test"
import { stableUuid } from "@browser-capture/runtime"
import { retainAccountTestTask } from "./browser-account-fixture.js"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import type { ProductStore } from "../src/database/store.js"

// WHY：交付页面保留不是控制锁；只有已确认清理的确定 owner 能移交控制。
test("confirmed delivery releases the control lock; wait, unknown owner and cleanup remain exclusive", async () => {
  const f = await directoryFixture()
  const store = (f.api.taskChain as unknown as { store: ProductStore }).store
  try {
    const record = retainAccountTestTask(f.api), ownerId = stableUuid(record.id, "managed-window")
    const released = { ...record, browserHandoff: { ...record.browserHandoff, ownerId, leaseId: ownerId },
      cleanup: { status: "confirmed" as const, attempt: 1, code: null, evidenceDigest: "c".repeat(64), updatedAt: record.updatedAt } }
    f.api.taskChain.repository.saveExecution(released)
    assert.equal(store.activeBrowserWindowLease(undefined, "daily"), null)
    for (const change of [
      { status: "waiting_for_human" as const, browserHandoff: { ...released.browserHandoff, purpose: "human_wait" as const } },
      { browserHandoff: { ...released.browserHandoff, status: "unavailable" as const } },
      { browserHandoff: { ...released.browserHandoff, ownerId: record.browserHandoff.ownerId } },
      { cleanup: record.cleanup },
    ]) {
      f.api.taskChain.repository.saveExecution({ ...released, ...change })
      assert.equal(store.activeBrowserWindowLease(undefined, "daily")?.executionId, record.id)
    }
    assert.equal(store.activeBrowserWindowLease(undefined, "dedicated"), null)
  } finally { await f.api.app.close() }
})
