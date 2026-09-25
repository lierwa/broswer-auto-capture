import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { BrowserProfileService } from "../src/browser/profile-service.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

test("专用浏览器复用固定本机 profile，并在完成后释放唯一浏览器所有权", async () => {
  const calls: Array<{ profilePath: string }> = []
  let closes = 0
  const service = new BrowserProfileService("D:\\work\\browser-auto-tool", "D:\\bat-data", () => ({
    startProfile: async (config) => { calls.push(config) },
    pickProfileTarget: async () => { throw new Error("not selecting") },
    close: async () => {
      closes++
      return cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "not_required", code: null })), false)
    },
  }))

  assert.deepEqual(service.snapshot(), { status: "closed", openedAt: null })
  const opened = await service.control({ type: "open" }, () => {})
  assert.equal(opened.status, "open")
  assert.equal(calls.length, 1)
  assert.equal(path.normalize(calls[0]!.profilePath), path.normalize("D:\\bat-data\\browser-profile\\default"))

  const closed = await service.control({ type: "close" }, () => {})
  assert.deepEqual(closed, { status: "closed", openedAt: null })
  assert.equal(closes, 1)
})

test("任务占用浏览器时不打开账号管理浏览器", async () => {
  let created = false
  const service = new BrowserProfileService("D:\\work\\browser-auto-tool", "D:\\bat-data", () => {
    created = true
    throw new Error("runner must not be created")
  })

  await assert.rejects(service.control({ type: "open" }, () => { throw Object.assign(new Error("busy"), {
    code: "browser_busy", status: 409,
  }) }))
  assert.equal(created, false)
  assert.deepEqual(service.snapshot(), { status: "closed", openedAt: null })
})

test("目标选择复用同一 Profile runner，返回受限 hybrid target 后自动关闭", async () => {
  let resolveTarget!: (value: { target: { strategy: "history"; scope: { url: string }; identity: {
    schemaVersion: "browser-use.dom-interacted-element/v1"; nodeName: string; xPath: string; elementHash: string;
    stableHash: null; axNameDigest: null; attributes: [] } }; tag: string; strategy: "history" }) => void
  const target = new Promise<Parameters<typeof resolveTarget>[0]>((resolve) => { resolveTarget = resolve })
  let starts = 0, closes = 0
  const service = new BrowserProfileService("D:\\work\\browser-auto-tool", "D:\\bat-data", () => ({
    startProfile: async (config) => { starts++; assert.equal(config.startUrl, "https://example.test/form") },
    pickProfileTarget: async () => target,
    close: async () => { closes++; return cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({
      stage, status: "confirmed", code: null,
    })), false) },
  }))
  const command = { type: "start" as const, requestId: randomUUID(), draftId: randomUUID(),
    chainId: randomUUID(), nodeId: "submit",
    expectedRevision: 2, expectedChecksum: "a".repeat(64) }
  const accepted = await service.targetControl(command, { taskId: "task-1", startUrl: "https://example.test/form" }, () => {})
  assert.equal(accepted.status, "opening")
  await service.targetControl(command, { taskId: "task-1", startUrl: "https://example.test/form" }, () => {
    throw new Error("idempotent retry must not recheck ownership")
  })
  resolveTarget({ target: { strategy: "history", scope: { url: "https://example.test/form" }, identity: {
    schemaVersion: "browser-use.dom-interacted-element/v1", nodeName: "button", xPath: "/button[1]",
    elementHash: "1", stableHash: null, axNameDigest: null, attributes: [],
  } }, tag: "button", strategy: "history" })
  for (let index = 0; index < 20 && service.targetSelection().status !== "selected"; index++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.equal(service.targetSelection().status, "selected")
  assert.equal(service.targetSelection().target && (service.targetSelection().target as { strategy: string }).strategy, "history")
  assert.equal(service.snapshot().status, "closed")
  assert.equal(starts, 1)
  assert.equal(closes, 2)
})
