import assert from "node:assert/strict"
import test from "node:test"
import Database from "better-sqlite3"
import { WorkspaceChanges } from "../src/database/workspace-changes.js"

function fixture(t: test.TestContext) {
  const db = new Database(":memory:")
  db.exec("CREATE TABLE taskWorkspaceSequences (taskId TEXT PRIMARY KEY, sequence INTEGER NOT NULL); INSERT INTO taskWorkspaceSequences VALUES ('task', 1)")
  const changes = new WorkspaceChanges(db), controller = new AbortController()
  t.after(() => { controller.abort(); changes.close(); db.close() })
  return { db, changes, controller }
}

test("纯回滚不通知；同turn成功提交后回滚仍发已提交版本", async t => {
  const { db, changes, controller } = fixture(t)
  const observer = changes.observe("task", 1, controller.signal)
  let notified = false
  const next = observer.next().then(value => { notified = true; return value })
  db.exec("BEGIN; UPDATE taskWorkspaceSequences SET sequence=2; ROLLBACK")
  await Promise.resolve()
  assert.equal(notified, false)
  db.exec("UPDATE taskWorkspaceSequences SET sequence=2; BEGIN; UPDATE taskWorkspaceSequences SET sequence=3; ROLLBACK")
  assert.deepEqual(await next, { done: false, value: 2 })
  await observer.return(undefined)
})

test("多个提交合并最新版本，首读与下一次消费之间的变化不丢失", async t => {
  const { db, changes, controller } = fixture(t)
  const observer = changes.observe("task", 0, controller.signal)
  assert.deepEqual(await observer.next(), { done: false, value: 1 })
  db.exec("UPDATE taskWorkspaceSequences SET sequence=2; UPDATE taskWorkspaceSequences SET sequence=3")
  assert.deepEqual(await observer.next(), { done: false, value: 3 })
  await observer.return(undefined)
})

test("客户端取消和store关闭均释放等待中的订阅", async t => {
  const { changes, controller } = fixture(t)
  const cancelled = changes.observe("task", 1, controller.signal), next = cancelled.next()
  controller.abort()
  assert.equal((await next).done, true)
  const closing = changes.observe("task", 1, new AbortController().signal), last = closing.next()
  changes.close()
  assert.equal((await last).done, true)
  assert.equal((await changes.observe("task", 0, new AbortController().signal).next()).done, true)
})

test("慢消费者只收到最新提交版本，不积压中间状态", async t => {
  const { db, changes, controller } = fixture(t)
  const observer = changes.observe("task", 0, controller.signal)
  assert.equal((await observer.next()).value, 1)
  for (let sequence = 2; sequence <= 10; sequence++) {
    db.prepare("UPDATE taskWorkspaceSequences SET sequence=?").run(sequence)
    await Promise.resolve()
  }
  assert.equal((await observer.next()).value, 10)
  await observer.return(undefined)
})

test("合法任务ID不占用EventEmitter保留事件名", async t => {
  const { db, changes, controller } = fixture(t)
  db.exec("INSERT INTO taskWorkspaceSequences VALUES ('error',1)")
  await new Promise(resolve => setImmediate(resolve))
  const observer = changes.observe("error", 1, controller.signal), next = observer.next()
  db.exec("UPDATE taskWorkspaceSequences SET sequence=2 WHERE taskId='error'")
  assert.equal((await next).value, 2)
  await observer.return(undefined)
})
