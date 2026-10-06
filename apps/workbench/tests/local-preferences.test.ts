import assert from "node:assert/strict"
import test from "node:test"
import { readReplayPacing, saveReplayPacing } from "../src/replayPacingPreference.js"
import { attentionKey, readAttentionReceipts, saveAttentionReceipts } from "../src/taskAttentionReceipts.js"
import type { TaskSummary } from "../src/taskContract.js"

// WHY：保护跨刷新偏好和不同通知事件的已读身份；存储拒绝不能阻断用户操作。
test("local preferences survive reconstruction and reject malformed pacing; notification receipts follow event identity", () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) } }
  assert.equal(readReplayPacing(storage), 1600)
  saveReplayPacing(2800, storage); assert.equal(readReplayPacing(storage), 2800)
  saveReplayPacing(9000, storage); assert.equal(readReplayPacing(storage), 2800)
  const task = { id: "owned", attention: { source: "execution", id: "run", kind: "action_required", sequence: 4 } } as TaskSummary
  saveAttentionReceipts(new Set([attentionKey(task)]), storage)
  assert(readAttentionReceipts(storage).has(attentionKey(task)))
  assert(!readAttentionReceipts(storage).has(attentionKey({ ...task, attention: { ...task.attention!, sequence: 5 } })))
  const blocked = { getItem: () => { throw Error("blocked") }, setItem: () => { throw Error("blocked") } }
  assert.equal(readReplayPacing(blocked), 1600); assert.equal(readAttentionReceipts(blocked).size, 0)
  saveReplayPacing(0, blocked); saveAttentionReceipts(new Set(), blocked)
})
