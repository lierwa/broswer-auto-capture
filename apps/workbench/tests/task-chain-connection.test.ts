import assert from "node:assert/strict"
import test from "node:test"
import { CONTRACT_VERSION } from "@browser-capture/contracts"
import { TaskChainConnection } from "../src/taskChainConnection.js"

const taskId = "00000000-0000-4000-8000-000000000001"
const state = { contractVersion: CONTRACT_VERSION, taskId, taskSequence: 2, stateSequence: 2,
  requirement: null, requirements: [], plans: [], chains: [], runs: [], executions: [], jobs: [], staleIds: [], staleVersions: [], legacy: [] }

test("统一状态连接保留已有事实、拒绝跨任务响应并忽略过期响应", async () => {
  const connection = new TaskChainConnection(taskId, async () => new Response("{}", { status: 500 }))
  connection.accept(state)
  await connection.reload()
  assert.deepEqual(connection.snapshot().state, state)
  assert.match(connection.snapshot().error, /无法读取/)
  assert.throws(() => connection.accept({ ...state, taskId: "00000000-0000-4000-8000-000000000002" }))
  const latest = { ...state, taskSequence: 3, stateSequence: 5 }
  connection.accept(latest)
  connection.accept({ ...state, taskSequence: 4, stateSequence: 4 })
  assert.deepEqual(connection.snapshot().state, latest)
})

test("响应丢失后只重试同一幂等命令", async () => {
  const posts: string[] = []
  const connection = new TaskChainConnection(taskId, async (_url, init) => {
    if (init?.method !== "POST") return Response.json(state)
    posts.push(String(init.body))
    if (posts.length === 1) throw new Error("响应丢失")
    return Response.json({ ...state, stateSequence: 3 })
  })
  const command = { type: "generate_plan" as const, requestId: "00000000-0000-4000-8000-000000000003", requirementVersion: 1 }
  assert.equal(await connection.dispatch(command), false)
  assert.deepEqual(connection.snapshot().pending, command)
  assert.equal(await connection.retry(), true)
  assert.equal(posts.length, 2)
  assert.equal(posts[0], posts[1])
  assert.equal(connection.snapshot().pending, null)
})

test("同一需求的并发 ensure 合并成一个生成请求", async () => {
  let posts = 0
  const connection = new TaskChainConnection(taskId, async (_url, init) => {
    if (init?.method === "POST") posts += 1
    return Response.json(state)
  })
  assert.deepEqual(await Promise.all([connection.ensure(1), connection.ensure(1)]), [true, true])
  assert.equal(posts, 1)
})
