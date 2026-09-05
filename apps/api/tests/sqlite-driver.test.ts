import assert from "node:assert/strict"
import test from "node:test"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core"

test("Windows/Node24 的既有 SQLite 驱动与 Drizzle 同步事务可提交及整体回滚", () => {
  const connection = new Database(":memory:")
  const db = drizzle(connection)
  const records = sqliteTable("records", { id: integer().primaryKey(), value: text().notNull() })
  try {
    connection.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
    db.transaction((tx) => { tx.insert(records).values({ id: 1, value: "已确认" }).run() })
    assert.throws(() => db.transaction((tx) => {
      tx.insert(records).values({ id: 2, value: "不可部分提交" }).run()
      tx.insert(records).values({ id: 1, value: "冲突" }).run()
    }))
    assert.deepEqual(db.select().from(records).all(), [{ id: 1, value: "已确认" }])
  } finally { connection.close() }
})
