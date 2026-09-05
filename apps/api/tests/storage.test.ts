import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { emptyInterview } from "@browser-capture/contracts/interview"
import { ProductStore } from "../src/database/store.js"
import { importLegacy } from "../src/database/importLegacy.js"
import { imports } from "../src/database/schema.js"

async function fixture(run: (store: ProductStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-product-store-"))
  const store = await ProductStore.open(directory)
  try { await run(store, directory) }
  finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
}
test("任务创建幂等，失败事务不改变消息/草稿/确认/事件序号", async () => fixture(async (store) => {
  const command = { type: "create" as const, requestId: randomUUID() }
  const id = store.taskAction(command)
  assert.equal(store.taskAction(command), id)
  const before = store.snapshot(id)
  assert.throws(() => store.mutate(id, (state) => { state.revision++; state.confirmedVersion = 9 }))
  assert.deepEqual(store.snapshot(id), before)
  assert.equal(store.list().length, 1)
}))
test("同一产品数据只能有一个协调服务，关闭后可重新打开", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  await assert.rejects(ProductStore.open(directory), /另一服务/)
  await store.close()
  const restored = await ProductStore.open(directory)
  try { assert.equal(restored.list()[0]?.id, id) } finally { await restored.close() }
}))
test("服务重启把未完成轮次持久化为 interrupted，重复恢复不会永久 active", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  store.mutate(id, (state) => {
    state.revision = 1; state.active = true; state.activeTurnId = "turn-1"; state.cancellationRequested = true
    state.messages.push(
      { id: "user-1", role: "user", text: "继续访谈", status: "complete", question: null, draftVersion: null },
      { id: "assistant-1", role: "assistant", text: "处理中", status: "running", question: null, draftVersion: null },
    )
    state.turns.push({ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "cancelling", reason: null, createdAt: "2026-09-06T00:00:00.000Z", completedAt: null })
  })
  await store.close()

  const restored = await ProductStore.open(directory)
  try {
    assert.equal(restored.snapshot(id).active, true)
    restored.recoverInterrupted()
    const recovered = restored.snapshot(id)
    assert.equal(recovered.active, false)
    assert.equal(recovered.activeTurnId, null)
    assert.equal(recovered.cancellationRequested, false)
    assert.equal(recovered.turns[0]?.status, "interrupted")
    assert.match(recovered.turns[0]?.reason ?? "", /服务已重启/)
    assert.equal(recovered.messages[1]?.status, "cancelled")
    assert.match(recovered.messages[1]?.text ?? "", /可以重试/)
    const sequence = recovered.sequence
    restored.recoverInterrupted()
    assert.equal(restored.snapshot(id).sequence, sequence)
  } finally { await restored.close() }
}))
test("任务投影在事务和进程重启后仍按 taskId 隔离", async () => fixture(async (store, directory) => {
  const first = store.taskAction({ type: "create", requestId: randomUUID() })
  const second = store.taskAction({ type: "create", requestId: randomUUID() })
  const secondBefore = store.snapshot(second)
  store.mutate(first, (state) => {
    state.revision = 1
    state.messages.push({ id: "first-user", role: "user", text: "只属于任务一", status: "complete", question: null, draftVersion: null })
    state.drafts.push({ version: 1, revision: 1, title: "任务一草稿", markdown: "# 任务一" })
    state.confirmedVersion = 1
  })
  assert.deepEqual(store.snapshot(second), secondBefore)
  await store.close()

  const restored = await ProductStore.open(directory)
  try {
    const firstState = restored.snapshot(first)
    assert.equal(firstState.messages[0]?.text, "只属于任务一")
    assert.equal(firstState.drafts[0]?.title, "任务一草稿")
    assert.equal(firstState.confirmedVersion, 1)
    assert.deepEqual(restored.snapshot(second), secondBefore)
  } finally { await restored.close() }
}))
test("旧单会话导入保留原件，重复执行和重启不重复导入、不覆盖后续修改", async () => fixture(async (store, directory) => {
  const value = JSON.stringify({ ...emptyInterview, revision: 1, messages: [{ id: "u", role: "user", text: "只抓公开资料", status: "complete", question: null, draftVersion: null }] })
  const file = path.join(directory, "interview.json")
  await writeFile(file, value)
  await importLegacy(store, directory)
  assert.equal(store.snapshot("legacy").messages[0]?.text, "只抓公开资料")
  store.taskAction({ type: "rename", id: "legacy", title: "已迁入" })
  await importLegacy(store, directory)
  assert.equal(store.list()[0]?.title, "已迁入")
  assert.equal(await readFile(file, "utf8"), value)
  await store.close()
  const next = await ProductStore.open(directory)
  try { await importLegacy(next, directory); assert.equal(next.list().length, 1) } finally { await next.close() }
}))
test("多任务导入一项损坏则整体不提交，修复后可重试", async () => fixture(async (store, directory) => {
  const meta = ["a", "b"].map((id) => ({ id, title: id, renamed: false, archived: false, updatedAt: new Date().toISOString() }))
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify(meta))
  await mkdir(path.join(directory, "tasks", "b"), { recursive: true })
  const file = path.join(directory, "tasks", "b", "interview.json")
  await writeFile(file, "broken")
  await assert.rejects(importLegacy(store, directory), /格式损坏/)
  assert.equal(store.list().length, 0)
  assert.equal(store.db.select().from(imports).all().length, 0)
  await writeFile(file, JSON.stringify(emptyInterview))
  await importLegacy(store, directory)
  assert.equal(store.list().length, 2)
}))
test("导入事务遇到已有任务冲突会回滚之前插入的条目", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  const meta = ["before-conflict", id].map((key) => ({ id: key, title: key, renamed: false, archived: false, updatedAt: new Date().toISOString() }))
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify(meta))
  await assert.rejects(importLegacy(store, directory))
  assert.equal(store.list().length, 1)
  assert.equal(store.db.select().from(imports).all().length, 0)
}))
test("导入拒绝路径穿越，不回退到其他任务", async () => fixture(async (store, directory) => {
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify([{ id: "../a", title: "a", renamed: false, archived: false, updatedAt: "now" }]))
  await assert.rejects(importLegacy(store, directory))
  assert.equal(store.list().length, 0)
}))
