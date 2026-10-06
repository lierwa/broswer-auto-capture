import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { TaskProductService } from "../src/task-chain/product.js"
import { TaskSummaryProjector } from "../src/task-chain/workspace-projection.js"

// WHY：高频列表不得重复读取大运行；仍须看到新提交，事务回滚和消费方修改不能污染事实。
test("列表摘要复用相同事实，输入和本地外部提交变化均失效，事务不污染缓存", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-summary-projection-"))
  const store = await ProductStore.open(directory), external = new Database(path.join(directory, "workbench.sqlite"))
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
    const task = store.list().find(item => item.id === taskId)!
    const repository = new TaskContractRepository(store), product = new TaskProductService(store, repository)
    const projector = new TaskSummaryProjector(store, repository, product)
    const reads = t.mock.method(store, "taskBrowserWindowLease")
    const first = projector.project(task)
    first.title = "consumer mutation"
    assert.equal(projector.project(task).title, task.title)
    assert.equal(reads.mock.callCount(), 1)
    assert.equal(projector.project({ ...task, title: "new title" }).title, "new title")
    assert.equal(reads.mock.callCount(), 2)
    store.taskAction({ type: "create", requestId: randomUUID() })
    projector.project(task)
    assert.equal(reads.mock.callCount(), 3)
    external.prepare("UPDATE taskWorkspaceSequences SET sequence=sequence+1 WHERE taskId=?").run(taskId)
    projector.project(task)
    assert.equal(reads.mock.callCount(), 4)
    assert.throws(() => store.db.transaction(() => {
      projector.project(task); projector.project(task)
      assert.equal(reads.mock.callCount(), 6, "事务中不命中也不写入缓存")
      throw Error("rollback")
    }), /rollback/)
    assert.equal(projector.project(task).title, task.title)
    assert.equal(reads.mock.callCount(), 6)
  } finally {
    external.close(); await store.close()
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    await rm(directory, { recursive: true, force: true })
  }
})
