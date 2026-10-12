import { saveLegacyBrowserOwner } from "./helpers/legacy-browser-history.js"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import path from "node:path"
import { BrowserJournal } from "@browser-capture/browser"
import { BrowserService } from "../src/browser/service.js"
import { browserRuns } from "../src/database/schema.js"
import { openFixture } from "./helpers.js"

test("旧运行原样可读，未知旧 owner 保留删除保护且不伪报回收", async () => {
  const fixture = await openFixture()
  try {
    const taskId = fixture.create(), runId = randomUUID(), ownerId = randomUUID(), at = new Date().toISOString()
    const body = { taskId, runId, ownerId, requirementVersion: 1, purpose: "replay" as const,
      status: "failed" as const, waitpoint: null, createdAt: at, updatedAt: at, reason: "access_denied" }
    fixture.store.db.insert(browserRuns).values({ taskId, runId, createdAt: at, body }).run()
    const service = new BrowserService(fixture.store, fixture.directory)
    assert.deepEqual((await service.snapshot(taskId)).record, body)
    const journal = new BrowserJournal(path.join(fixture.directory, "browser"))
    await saveLegacyBrowserOwner(fixture.directory, { taskId, runId, sessionId: "abcd", purpose: "replay", requirementVersion: 1, state: "cleanup_required" })
    assert.deepEqual(service.owner(), { taskId, runId })
    await assert.rejects(service.control(taskId, { type: "cleanup", runId }), /旧浏览器资源尚未核验关闭/)
    assert.equal((await journal.owner())?.state, "cleanup_required")
    assert.deepEqual((await service.snapshot(taskId)).record, body)
  } finally {
    fixture.unblock(); await fixture.coordinator.close(); await fixture.store.close()
    await rm(fixture.directory, { recursive: true })
  }
})
