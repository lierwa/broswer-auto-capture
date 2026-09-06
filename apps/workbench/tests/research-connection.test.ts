import test from "node:test"
import assert from "node:assert/strict"
import { ResearchConnection } from "../src/researchConnection.js"

const taskId = "00000000-0000-4000-8000-000000000001"
const state = { taskId, taskSequence: 2, records: [], staleIds: [], eligible: true, busy: false, blocked: null }
test("来源读取失败保留已有事实，跨任务响应拒绝", async () => {
  const connection = new ResearchConnection(taskId, async () => new Response("{}", { status: 500 }))
  connection.accept(state)
  await connection.reload()
  assert.deepEqual(connection.snapshot().state, state)
  assert.match(connection.snapshot().error, /读取失败/)
  assert.throws(() => connection.accept({ ...state, taskId: "00000000-0000-4000-8000-000000000002" }))
})
test("丢失响应后重试保留同一幂等键；恢复查询不会重复启动", async () => {
  const calls: string[] = []
  const connection = new ResearchConnection(taskId, async (_url, init) => {
    if (init?.method !== "POST") return Response.json(state)
    calls.push(String(init.body))
    if (calls.length === 1) throw new Error("响应丢失")
    return Response.json(state)
  })
  const command = { type: "start", requestId: taskId, requirementVersion: 1 }
  assert.equal(await connection.dispatch(command), false)
  assert.deepEqual(connection.snapshot().pending, command)
  assert.equal(await connection.retry(), true)
  assert.equal(calls[0], calls[1]); assert.equal(connection.snapshot().pending, null)
})
test("需求变更后的门禁不会被同证据sequence的旧响应重新打开", () => {
  const connection = new ResearchConnection(taskId)
  const invalidated = { ...state, taskSequence: 3, eligible: false, blocked: "需求已变更" }
  connection.accept(invalidated); connection.accept(state)
  assert.deepEqual(connection.snapshot().state, invalidated)
})
