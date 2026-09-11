import test from "node:test"
import assert from "node:assert/strict"
import { PlanConnection, hasViewablePlan } from "../src/planConnection.js"

const taskId = "00000000-0000-4000-8000-000000000001"
const state = { taskId, taskSequence: 2, sequence: 0, records: [], executions: [], staleIds: [], eligible: true, blocked: null, generating: false, browserOwner: null, executorAvailable: false }
test("计划恢复失败保留已有事实，跨任务响应拒绝，需求过期响应丢弃", async () => {
  const connection = new PlanConnection(taskId, async () => new Response("{}", { status: 500 }))
  connection.accept(state); await connection.reload()
  assert.deepEqual(connection.snapshot().state, state); assert.match(connection.snapshot().error, /读取失败/)
  assert.throws(() => connection.accept({ ...state, taskId: "00000000-0000-4000-8000-000000000002" }))
  const latest = { ...state, taskSequence: 3, sequence: 5, eligible: false }
  connection.accept(latest); connection.accept(state); assert.deepEqual(connection.snapshot().state, latest)
})
test("生成计划只提交已确认需求版本，不携带独立来源版本", async () => {
  let posted: unknown
  const connection = new PlanConnection(taskId, async (_url, init) => {
    posted = JSON.parse(String(init?.body))
    return Response.json(state)
  })
  const command = { type: "generate", requestId: taskId, requirementVersion: 3 }
  assert.equal(await connection.dispatch(command), true)
  assert.deepEqual(posted, command)
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
test("需求确认入口为当前需求显式创建计划", async () => {
  const posted: unknown[] = []
  const response = { ...state, records: [] }
  const connection = new PlanConnection(taskId, async (_url, init) => {
    if (init?.method === "POST") posted.push(JSON.parse(String(init.body)))
    return Response.json(response)
  })
  const results = await Promise.all([connection.ensure(2), connection.ensure(2)])
  assert.deepEqual(results, [true, true]); assert.equal(posted.length, 1)
  assert.equal((posted[0] as { type: string }).type, "generate")
  assert.equal((posted[0] as { requirementVersion: number }).requirementVersion, 2)
})
test("旧阻塞空记录需创建新版本，已有可查看 proposal 不重复创建", () => {
  const record = { id: taskId, requirementVersion: 2, version: 1, status: "blocked", proposal: null, digest: null }
  assert.equal(hasViewablePlan({ ...state, records: [record] } as any, 2), false)
  assert.equal(hasViewablePlan({ ...state, records: [{ ...record, proposal: { summary: "待核验" } }] } as any, 2), true)
  assert.equal(hasViewablePlan({ ...state, records: [{ ...record, status: "ready", proposal: { summary: "计划" } }] } as any, 2), false)
  assert.equal(hasViewablePlan({ ...state, records: [{ ...record, status: "ready", proposal: { summary: "计划" }, digest: "0".repeat(64) }] } as any, 2), true)
})
