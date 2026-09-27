import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { projectRoot } from "./helpers.js"

test("missing owner lease can be inspected after its dedicated Profile is closed",
  { skip: process.platform !== "win32", timeout: 30_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-lease-recovery-"))
  const profilePath = path.join(directory, "profile")
  const ownerId = randomUUID()
  try {
    const inspected = await new RunnerProcess(projectRoot, new AbortController().signal).managedWindowAction({
      action: "inspect", ownerId, leaseId: ownerId, profilePath,
    })
    assert.equal(inspected.report.status, "confirmed")
    assert.equal(inspected.window.active, false)
    assert.equal(inspected.window.ownerId, ownerId)
    assert.equal(inspected.window.reason, "hybrid_managed_window_lease_missing_verified")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
