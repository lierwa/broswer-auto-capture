import test from "node:test"
import assert from "node:assert/strict"
import { PlanConnection } from "../src/planConnection.js"

const taskId = "00000000-0000-4000-8000-000000000001"
const state = { taskId, taskSequence: 2, sequence: 0, records: [], executions: [], staleIds: [], eligible: true, blocked: null, source: null, generating: false, browserOwner: null, executorAvailable: false }
test("计划恢复失败保留已有事实，跨任务响应拒绝，来源和需求过期响应丢弃", async () => {
  const connection = new PlanConnection(taskId, async () => new Response("{}", { status: 500 }))
  connection.accept(state); await connection.reload()
  assert.deepEqual(connection.snapshot().state, state); assert.match(connection.snapshot().error, /读取失败/)
  assert.throws(() => connection.accept({ ...state, taskId: "00000000-0000-4000-8000-000000000002" }))
  const latest = { ...state, taskSequence: 3, sequence: 5, eligible: false }
  connection.accept(latest); connection.accept(state); assert.deepEqual(connection.snapshot().state, latest)
})
test("授权响应丢失后仅重试同一幂等请求，刷新不触发启动", async () => {
  const calls: string[] = []
  const connection = new PlanConnection(taskId, async (_url, init) => {
    if (init?.method !== "POST") return Response.json(state)
    calls.push(String(init.body)); if (calls.length === 1) throw new Error("响应丢失")
    return Response.json(state)
  })
  const command = { type: "start", requestId: taskId, planId: taskId, planDigest: "0".repeat(64) }
  assert.equal(await connection.dispatch(command), false)
  assert.deepEqual(connection.snapshot().pending, command)
  assert.equal(await connection.retry(), true)
  assert.equal(calls[0], calls[1]); assert.equal(connection.snapshot().pending, null)
})
