import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import type { TaskAdjustmentRecord, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { publishedAdjustmentVersion } from "../src/AdjustmentAcceptedState.js"

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

test("只在当前发布内容与已接受草稿 checksum 精确一致时显示已发布", async () => {
  const baseline = { id: id(1), version: 1, digest: "a".repeat(64) }
  const requirement = { id: id(2), version: 1, revision: 1, digest: "b".repeat(64) }
  const content = { plan: { id: id(3) }, steps: [{ stepId: "read", chain: { id: id(4) } }] }
  const release = { id: id(5), version: 2, requirement, content }
  const adjustment = { baseline: { kind: "release", release: baseline }, candidate: {
    content, digest: digest(content) }, acceptedDraft: { id: id(6), revision: 1,
    checksum: digest({ requirement, baseRelease: baseline, content }) } } as TaskAdjustmentRecord
  const workspace = { draft: null, release: { reference: {
    id: release.id, version: release.version, digest: digest(release) }, value: release } } as TaskWorkspaceSnapshot
  assert.equal(await publishedAdjustmentVersion(workspace, adjustment), 2)
  assert.equal(await publishedAdjustmentVersion({ ...workspace, draft: { id: id(6) } } as TaskWorkspaceSnapshot,
    adjustment), null)
  assert.equal(await publishedAdjustmentVersion({ ...workspace, release: { ...workspace.release!,
    value: { ...release, content: { ...content, steps: [] } } } } as TaskWorkspaceSnapshot, adjustment), null)
  assert.equal(await publishedAdjustmentVersion(workspace, { ...adjustment,
    acceptedDraft: { ...adjustment.acceptedDraft!, checksum: "c".repeat(64) } }), null)
  assert.equal(await publishedAdjustmentVersion({ ...workspace, release: { ...workspace.release!,
    reference: { ...workspace.release!.reference, digest: "d".repeat(64) } } }, adjustment), null)
})
