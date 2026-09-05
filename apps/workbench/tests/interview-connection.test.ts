import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { InterviewConnection } from "../src/interviewConnection.js"
import { emptyInterview } from "../src/interviewContract.js"

const state = (sequence: number, active = false) => ({ ...structuredClone(emptyInterview), sequence, active })
const result = (sequence: number, taskId = "task-a") => ({ taskId, state: state(sequence) })

test("迟到快照及其他任务响应不能覆盖当前任务或取消终态", () => {
  const connection = new InterviewConnection("task-a")
  connection.accept({ taskId: "task-a", state: state(3, true) })
  connection.accept(result(5))
  connection.accept({ taskId: "task-a", state: state(4, true) })
  connection.accept(result(100, "task-b"))
  assert.equal(connection.snapshot().state.sequence, 5)
  assert.equal(connection.snapshot().state.active, false)
})

test("POST 响应丢失后保留原命令幂等键，读取事实并显式重发", async () => {
  const bodies: unknown[] = []
  const fetcher: typeof fetch = async (_input, options) => {
    if (options?.method !== "POST") return Response.json(state(2))
    bodies.push(JSON.parse(String(options.body)))
    if (bodies.length === 1) throw new Error("响应丢失")
    return Response.json(result(2))
  }
  const connection = new InterviewConnection("task-a", fetcher)
  const command = { type: "message" as const, requestId: randomUUID(), expectedRevision: 0, text: "  保留原文\n" }
  await connection.dispatch(command)
  assert.equal(connection.snapshot().state.sequence, 2)
  assert.deepEqual(connection.snapshot().pending, command)
  await connection.retrySubmission()
  assert.deepEqual(bodies, [command, command])
  assert.equal(connection.snapshot().pending, null)
})

test("命令提交后断开的页面观察不取消服务轮次，重连接收最终状态", async () => {
  const urls: string[] = []
  const encoder = new TextEncoder()
  const fetcher: typeof fetch = async (input) => {
    urls.push(String(input))
    if (!String(input).includes("/events")) return Response.json(state(1, true))
    return new Response(new ReadableStream({ start(controller) {
      const line = JSON.stringify(result(3)) + "\n"
      controller.enqueue(encoder.encode(line.slice(0, 15)))
      controller.enqueue(encoder.encode(line.slice(15)))
      controller.close()
    } }))
  }
  const connection = new InterviewConnection("task-a", fetcher)
  const observed = new Promise<void>((resolve) => { connection.subscribe(() => { if (connection.snapshot().state.sequence === 3) resolve() }) })
  const stop = connection.start()
  try {
    await observed
    assert.equal(connection.snapshot().state.active, false)
    assert.ok(urls.some((url) => url.includes("after=1")))
    assert.ok(urls.every((url) => url.includes("taskId=task-a")))
  } finally { stop() }
})

test("取消命令绑定实际 turnId，返回状态立即可见", async () => {
  let body: unknown
  const connection = new InterviewConnection("task-a", async (_input, options) => {
    body = JSON.parse(String(options?.body))
    return Response.json({ taskId: "task-a", state: { ...state(4, true), activeTurnId: "turn-a", cancellationRequested: true } })
  })
  await connection.dispatch({ type: "cancel", turnId: "turn-a" })
  assert.deepEqual(body, { type: "cancel", turnId: "turn-a" })
  assert.equal(connection.snapshot().state.cancellationRequested, true)
})
