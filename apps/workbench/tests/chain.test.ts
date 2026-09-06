import test from "node:test"
import assert from "node:assert/strict"
import { ChainConnection } from "../src/chainConnection.js"
const taskId = "00000000-0000-4000-8000-000000000001"
test("链路读取失败与空态分开，任务归属及需求失效序列拒绝倒退", async () => {
  const connection = new ChainConnection(taskId, async () => new Response("{}", { status: 500 }))
  const state = { taskId, taskSequence: 2, records: [], staleIds: [], plans: [] }
  connection.accept(state); await connection.reload(); assert.match(connection.snapshot().error, /读取失败/)
  assert.deepEqual(connection.snapshot().state, state)
  connection.accept({ ...state, taskSequence: 1 }); assert.deepEqual(connection.snapshot().state, state)
  assert.throws(() => connection.accept({ ...state, taskId: "00000000-0000-4000-8000-000000000002" }))
})
