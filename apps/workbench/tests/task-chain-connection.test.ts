import assert from "node:assert/strict"
import test from "node:test"
import { CONTRACT_VERSION } from "@browser-capture/contracts"
import { TaskChainConnection } from "../src/taskChainConnection.js"
import { requirementRevisionMessage } from "../src/resultReview.js"

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`
const taskId = id(1)
const snapshot = { contractVersion: CONTRACT_VERSION, taskId, taskSequence: 2, stateSequence: 2,
  requirement: null, draft: null, release: null, execution: null, activity: null,
  draftReadiness: null }

test("最小工作区快照保留已有事实、拒绝跨任务响应并忽略过期响应", async () => {
  const connection = new TaskChainConnection(taskId, async () => new Response("{}", { status: 500 }))
  connection.accept(snapshot)
  await connection.reload()
  assert.deepEqual(connection.snapshot().workspace, snapshot)
  assert.match(connection.snapshot().error, /无法读取/)
  assert.throws(() => connection.accept({ ...snapshot, taskId: id(2) }))
  const latest = { ...snapshot, taskSequence: 3, stateSequence: 5 }
  connection.accept(latest)
  connection.accept({ ...snapshot, taskSequence: 4, stateSequence: 4 })
  assert.deepEqual(connection.snapshot().workspace, latest)
})

test("响应丢失后只重试同一最小意图命令", async () => {
  const posts: string[] = []
  const connection = new TaskChainConnection(taskId, async (_url, init) => {
    if (init?.method !== "POST") return Response.json(snapshot)
    posts.push(String(init.body))
    if (posts.length === 1) throw new Error("响应丢失")
    return Response.json({ snapshot: { ...snapshot, stateSequence: 3 }, acceptedExecution: null })
  })
  const command = { type: "prepare_task" as const, requestId: id(3), requirementVersion: 1 }
  assert.equal(await connection.dispatch(command), false)
  assert.deepEqual(connection.snapshot().pending, command)
  assert.equal(await connection.retry(), true)
  assert.equal(posts.length, 2)
  assert.equal(posts[0], posts[1])
  assert.equal(connection.snapshot().pending, null)
})

test("账号浏览器占用时可在错误处关闭并自动重试原幂等命令", async () => {
  let taskPosts = 0, profileCloses = 0
  const connection = new TaskChainConnection(taskId, async (url, init) => {
    if (String(url) === "/api/browser-profile") {
      profileCloses++
      return Response.json({ status: "closed", openedAt: null })
    }
    if (init?.method !== "POST") return Response.json(snapshot)
    taskPosts++
    return taskPosts === 1
      ? Response.json({ error: "请先完成账号操作。", code: "browser_profile_busy" }, { status: 409 })
      : Response.json({ snapshot: { ...snapshot, stateSequence: 3 }, acceptedExecution: null })
  })
  const command = { type: "prepare_task" as const, requestId: id(4), requirementVersion: 1 }
  assert.equal(await connection.dispatch(command), false)
  assert.equal(connection.snapshot().errorCode, "browser_profile_busy")
  assert.equal(await connection.closeBrowserProfileAndRetry(), true)
  assert.equal(profileCloses, 1)
  assert.equal(taskPosts, 2)
})

test("accepted execution 固定运行并按 sequence 续接同一次事件流", async () => {
  const executionId = id(10), release = { id: id(14), version: 1, digest: "a".repeat(64) }
  const requests: string[] = []
  let eventRead = 0
  const event = (sequence: number, nodeId: string) => ({ executionId, sequence, stepId: "perform", runId: id(11), runSequence: 1,
    event: { sequence, at: "2026-09-21T00:00:00.000Z", invocationId: id(12), nodeId,
      status: sequence === 3 ? "finished" : "started", outcome: sequence === 3 ? "success" : null,
      idempotencyKey: `event-${sequence}`, stableKey: null } })
  const connection = new TaskChainConnection(taskId, async (url, init) => {
    requests.push(String(url))
    if (init?.method === "POST") return Response.json({ snapshot, acceptedExecution: { status: "accepted", taskId,
      requestId: id(13), executionId, executionSequence: 0, acceptedAt: "2026-09-21T00:00:00.000Z",
      source: { kind: "release", release }, plan: { id: id(15), version: 1, digest: "b".repeat(64) },
      chains: [{ stepId: "perform", chain: { id: id(16), version: 1, digest: "c".repeat(64) } }] } })
    eventRead++
    return Response.json(eventRead === 1
      ? { executionId, executionSequence: 1, status: "running", after: 0, next: 2, events: [event(1, "first"), event(2, "second")] }
      : { executionId, executionSequence: 2, status: "completed", after: 2, next: 3, events: [event(2, "second"), event(3, "second")] })
  })
  assert.equal(await connection.dispatch({ type: "run_task", requestId: id(13), release, input: null,
    pacing: { nodeDelayMs: 0 } }), true)
  assert.equal(connection.snapshot().executionId, executionId)
  await connection.reloadExecutionEvents(); await connection.reloadExecutionEvents()
  assert.match(requests[1]!, /executionId=.*&after=0$/)
  assert.match(requests[2]!, /executionId=.*&after=2$/)
  assert.deepEqual(connection.snapshot().eventBatch?.events.map((item) => item.sequence), [1, 2, 3])
})

test("历史事件按 execution 独立分页读取，不切换当前画布运行", async () => {
  const currentId = id(30), historicalId = id(31)
  const release = { id: id(32), version: 2, digest: "a".repeat(64) }
  const requests: number[] = []
  const historicalEvent = (sequence: number) => ({ executionId: historicalId, sequence, stepId: "step",
    runId: id(33), runSequence: 1, event: { sequence, at: "2026-09-21T00:00:00.000Z",
      invocationId: id(34), nodeId: `node-${sequence}`, status: "finished", outcome: "success",
      idempotencyKey: `history-${sequence}`, stableKey: null } })
  const connection = new TaskChainConnection(taskId, async (url, init) => {
    if (init?.method === "POST") return Response.json({ snapshot, acceptedExecution: { status: "accepted", taskId,
      requestId: id(35), executionId: currentId, executionSequence: 0, acceptedAt: "2026-09-21T00:00:00.000Z",
      source: { kind: "release", release }, plan: { id: id(36), version: 1, digest: "b".repeat(64) },
      chains: [{ stepId: "step", chain: { id: id(37), version: 1, digest: "c".repeat(64) } }] } })
    const parsed = new URL(String(url), "http://localhost")
    assert.equal(parsed.searchParams.get("executionId"), historicalId)
    const after = Number(parsed.searchParams.get("after")); requests.push(after)
    const events = after < 2 ? [historicalEvent(after + 1)] : []
    return Response.json({ executionId: historicalId, executionSequence: 2, status: "completed",
      after, next: events.at(-1)?.sequence ?? after, events })
  })
  assert.equal(await connection.dispatch({ type: "run_task", requestId: id(35), release, input: null }), true)
  const current = connection.snapshot()
  const history = await connection.readHistoricalExecutionEvents(historicalId)
  assert.deepEqual(history?.events.map((item) => item.sequence), [1, 2])
  assert.deepEqual(requests, [0, 1, 2])
  assert.equal(connection.snapshot().executionId, currentId)
  assert.equal(connection.snapshot().eventBatch, current.eventBatch)
  assert.equal(connection.snapshot().workspace, current.workspace)
})

test("历史与诊断只在显式打开时读取，不混入普通快照", async () => {
  const requests: string[] = []
  const connection = new TaskChainConnection(taskId, async (url) => {
    requests.push(String(url))
    return String(url).includes("/history")
      ? Response.json({ kind: "executions", items: [], nextOffset: null })
      : Response.json({ capabilityDescriptors: [], preparation: null })
  })
  connection.accept(snapshot)
  assert.deepEqual(requests, [])
  await connection.reloadHistory("executions")
  await connection.reloadDiagnostics()
  assert.equal(requests.length, 2)
  assert.equal(connection.snapshot().history.executions?.kind, "executions")
  assert.deepEqual(connection.snapshot().diagnostics, {
    capabilityDescriptors: [], preparation: null })
})

test("需求回流保留运行摘要和业务语义", () => {
  const message = requirementRevisionMessage("运行状态：已完成\n实际结果：2 条", "来源范围理解错了")
  assert.match(message, /【运行摘要】/)
  assert.match(message, /重新确认目标、来源、范围与结果预期/)
})

test("原窗口聚焦失败在成功刷新后仍保留可读反馈", async () => {
  let reads = 0
  const refreshed = { ...snapshot, stateSequence: 3 }
  const failure = { error: "系统未允许自动切换到原窗口；窗口仍保留，请通过任务栏手动切换。",
    code: "browser_handoff_foreground_denied" }
  const connection = new TaskChainConnection(taskId, async (_url, init) => {
    if (init?.method === "POST") return Response.json(failure, { status: 409 })
    reads++
    return Response.json(refreshed)
  })
  connection.accept(snapshot)
  assert.equal(await connection.controlHandoff("focus", id(40), 2), false)
  assert.equal(reads, 1)
  assert.deepEqual(connection.snapshot().workspace, refreshed)
  assert.equal(connection.snapshot().error, failure.error)
  assert.equal(connection.snapshot().errorCode, failure.code)
  assert.equal(connection.snapshot().busy, false)
})
