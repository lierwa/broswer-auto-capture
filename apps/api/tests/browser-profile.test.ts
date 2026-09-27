import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { BrowserProfileService } from "../src/browser/profile-service.js"
import { readProfileOwner, saveProfileOwner } from "../src/browser/profile-owner.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import type { RunnerProcess } from "../src/upstream-browser/service.js"
import { ownedRunnerDirectory } from "../src/upstream-browser/runner-ownership.js"

const confirmed = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "not_required", code: null })), false)
const uncertain = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => stage === "browser_close"
  ? { stage, status: "unconfirmed", code: "cleanup_browser_close_failed" }
  : { stage, status: "not_required", code: null }), true)
type ProfileRunner = Pick<RunnerProcess, "startProfile" | "handoff" | "recoverProfile" | "close">
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-profile-test-"))
  const marker = path.join(directory, "browser-profile", "owner.pending")
  let ownerId = "", closes = 0, starts = 0, recoveries = 0
  const behavior = { failRecovery: false, handoffReport: confirmed, recoveryReport: confirmed }
  const createRunner = (): ProfileRunner => ({
    startProfile: async (config, persist) => {
      starts++; ownerId = config.ownerId
      assert.equal(path.resolve(config.profilePath), path.resolve(directory, "browser-profile", "default"))
      await persist({ ownerId, pid: 1234, started: 123, executable: "python.exe",
        temporaryDirectory: path.join(tmpdir(), `bat-hybrid-owner-${randomUUID()}`),
        launcher: { pid: 1234, started: 123, executable: "python.exe" } })
      assert.equal((await readProfileOwner(marker)).runner?.ownerId, ownerId)
    },
    handoff: async () => ({ report: behavior.handoffReport,
      lease: { ownerId, leaseId: ownerId, active: true, reason: null, targetDigest: "a".repeat(64) } }),
    recoverProfile: async (input) => {
      recoveries++
      if (behavior.failRecovery) throw new Error("hybrid_profile_runner_active")
      return { report: behavior.recoveryReport,
        window: { ownerId: input.ownerId, leaseId: input.leaseId, active: false, reason: null, targetDigest: null } }
    },
    close: async () => { closes++; return confirmed },
  })
  return { directory, marker, behavior, createRunner, counters: () => ({ closes, starts, recoveries }),
    service: new BrowserProfileService(process.cwd(), directory, createRunner),
    cleanup: () => rm(directory, { recursive: true, force: true }) }
}

test("交付后持久化身份，独立核验仅释放本次 owner 并保留登录目录", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.service.control({ type: "open" }, () => {})).status, "open")
    const owner = await readProfileOwner(f.marker)
    assert.equal(owner.cleanup?.status, "confirmed")
    await mkdir(owner.profilePath, { recursive: true })
    await writeFile(path.join(owner.profilePath, "login-sentinel"), "preserve")
    assert.deepEqual(await f.service.control({ type: "close" }, () => {}), { status: "closed", openedAt: null })
    assert.deepEqual(f.counters(), { starts: 1, recoveries: 1, closes: 1 })
    assert.equal(await readFile(path.join(owner.profilePath, "login-sentinel"), "utf8"), "preserve")
    await assert.rejects(readFile(f.marker), { code: "ENOENT" })
  } finally { await f.cleanup() }
})
test("未确认保留身份，重启后可独立重验；验证 runner 始终关闭", async () => {
  const f = await fixture()
  try {
    await f.service.control({ type: "open" }, () => {})
    f.behavior.failRecovery = true
    await assert.rejects(f.service.control({ type: "close" }, () => {}), { code: "browser_profile_cleanup_required" })
    assert.equal(f.service.snapshot().status, "cleanup_required")
    assert.ok((await readProfileOwner(f.marker)).runner)
    assert.equal(f.counters().closes, 1)
    const restarted = new BrowserProfileService(process.cwd(), f.directory, f.createRunner)
    await assert.rejects(restarted.control({ type: "open" }, () => {}), { code: "browser_profile_already_open" })
    f.behavior.failRecovery = false
    assert.equal((await restarted.control({ type: "recover" }, () => {})).status, "closed")
    assert.equal(f.counters().starts, 1)
  } finally { await f.cleanup() }
})
test("handoff 或恢复 runner 清理未确认不得投影为成功", async () => {
  const f = await fixture()
  try {
    f.behavior.handoffReport = uncertain
    await assert.rejects(f.service.control({ type: "open" }, () => {}), { code: "browser_profile_cleanup_required" })
    assert.equal(f.service.snapshot().openedAt, null)
    f.behavior.recoveryReport = uncertain
    await assert.rejects(f.service.control({ type: "recover" }, () => {}), { code: "browser_profile_cleanup_required" })
    assert.ok((await readProfileOwner(f.marker)).runner)
  } finally { await f.cleanup() }
})
test("空历史标记明确阻塞，不猜身份或启动恢复 runner", async () => {
  const f = await fixture()
  try {
    await mkdir(path.dirname(f.marker), { recursive: true }); await writeFile(f.marker, "")
    const legacy = new BrowserProfileService(process.cwd(), f.directory, () => { throw new Error("must not start") })
    await assert.rejects(legacy.control({ type: "recover" }, () => {}), { code: "browser_profile_legacy_owner_unknown" })
    assert.equal(await readFile(f.marker, "utf8"), "")
    assert.equal(legacy.snapshot().status, "cleanup_required")
  } finally { await f.cleanup() }
})
test("任务占用时不创建 Profile runner 或 owner 标记", async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.service.control({ type: "open" }, () => { throw new Error("busy") }))
    assert.equal(f.counters().starts, 0); assert.equal(f.service.snapshot().status, "closed")
    await assert.rejects(readFile(f.marker), { code: "ENOENT" })
  } finally { await f.cleanup() }
})
test("临时目录必须位于精确受管根并具有同 owner 身份", async () => {
  const f = await fixture(), temporary = await mkdtemp(path.join(tmpdir(), "bat-hybrid-owner-"))
  try {
    await f.service.control({ type: "open" }, () => {})
    const owner = await readProfileOwner(f.marker)
    owner.runner!.temporaryDirectory = temporary
    await writeFile(path.join(temporary, "runner-owner.json"), JSON.stringify({ ...owner.runner, ownerId: randomUUID() }))
    await saveProfileOwner(f.marker, owner)
    await assert.rejects(f.service.control({ type: "close" }, () => {}), { code: "browser_profile_cleanup_required" })
    assert.ok(await readFile(path.join(temporary, "runner-owner.json")))
    await assert.rejects(ownedRunnerDirectory({ ...owner.runner!, temporaryDirectory: f.directory }), /profile_temporary_owner_invalid/)
    await writeFile(path.join(temporary, "runner-owner.json"), JSON.stringify(owner.runner))
    assert.equal(await ownedRunnerDirectory(owner.runner!), temporary)
    assert.equal((await f.service.control({ type: "recover" }, () => {})).status, "closed")
    await assert.rejects(readFile(path.join(temporary, "runner-owner.json")), { code: "ENOENT" })
  } finally { await f.cleanup(); await rm(temporary, { recursive: true, force: true }) }
})
