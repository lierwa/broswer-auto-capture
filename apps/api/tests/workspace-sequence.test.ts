import assert from "node:assert/strict"
import test from "node:test"
import Database from "better-sqlite3"
import { migrate } from "../src/database/migrate.js"

test("工作区变更序列在 job 替换和删除后仍单调，失败事务不递增", () => {
  const db = new Database(":memory:")
  try {
    migrate(db)
    assert.equal(db.pragma("user_version", { simple: true }), 18)
    db.prepare(`INSERT INTO tasks(id,title,renamed,archived,updatedAt,revision,sequence,
      confirmedVersion,activeTurnId,interviewPolicyVersion) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run("task", "Task", 0, 0, "2026-09-24T00:00:00.000Z", 0, 0, null, null, 0)
    const current = () => (db.prepare("SELECT sequence FROM taskWorkspaceSequences WHERE taskId='task'").get() as { sequence: number }).sequence
    const created = current()
    db.prepare(`INSERT INTO taskAuthoringJobs(id,taskId,type,status,sequence,updatedAt,body)
      VALUES (?,?,?,?,?,?,?)`).run("old", "task", "prepare", "failed", 3, "2026-09-24T00:00:01.000Z", "{}")
    const failed = current()
    db.prepare("DELETE FROM taskAuthoringJobs WHERE id='old'").run()
    const removed = current()
    db.prepare(`INSERT INTO taskAuthoringJobs(id,taskId,type,status,sequence,updatedAt,body)
      VALUES (?,?,?,?,?,?,?)`).run("new", "task", "prepare", "queued", 0, "2026-09-24T00:00:02.000Z", "{}")
    assert.ok(created < failed && failed < removed && removed < current())
    assert.throws(() => db.transaction(() => {
      db.prepare("UPDATE taskAuthoringJobs SET sequence=1 WHERE id='new'").run()
      throw new Error("rollback")
    })(), /rollback/)
    assert.equal(current(), removed + 1)
  } finally { db.close() }
})
