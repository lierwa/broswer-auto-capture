import assert from "node:assert/strict"
import test from "node:test"
import type { TaskExecutionEventBatch } from "@browser-capture/contracts"
import { eventsForStep, nodeRunTone } from "../src/chainWorkbenchProjection.js"
import { TaskChainConnection } from "../src/taskChainConnection.js"

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`
const executionId = id(1), firstRun = id(2), latestRun = id(3)

function event(sequence: number, stepId: string, runId: string, nodeId: string, status: "started" | "finished") {
  return { executionId, sequence, stepId, runId, runSequence: 1,
    event: { sequence, at: "2026-09-22T00:00:00.000Z", invocationId: id(4), nodeId, status,
      outcome: status === "finished" ? "success" : null, idempotencyKey: `event-${sequence}`, stableKey: null } }
}

test("画布事件只取同一 execution、当前步骤和最后一次 run", () => {
  const batch = { executionId, executionSequence: 4, status: "running", after: 0, next: 4, events: [
    event(1, "perform", firstRun, "first", "finished"),
    event(2, "other", latestRun, "first", "finished"),
    event(3, "perform", latestRun, "first", "started"),
    event(4, "perform", latestRun, "second", "started"),
  ] } as TaskExecutionEventBatch
  const selected = eventsForStep("perform", executionId, batch)
  assert.deepEqual(selected?.events.map((item) => item.sequence), [3, 4])
  assert.equal(nodeRunTone("first", selected), "running")
  assert.equal(eventsForStep("perform", id(9), batch), null)
  assert.equal(eventsForStep("missing", executionId, batch)?.events.length, 0)
})

test("独立读取事件按游标续接且拒绝跨运行响应", async () => {
  const taskId = id(8), requests: string[] = []
  let wrongResponse = false
  const connection = new TaskChainConnection(taskId, async (url) => {
    const target = new URL(String(url), "http://local"), current = target.searchParams.get("executionId")!
    requests.push(target.search)
    const returnedId = wrongResponse ? id(9) : current, sequence = Number(target.searchParams.get("after")) + 1
    return Response.json({ executionId: returnedId, executionSequence: sequence, status: "running", after: sequence - 1, next: sequence,
      events: [{ ...event(sequence, "perform", latestRun, "first", "started"), executionId: returnedId }] })
  })
  const first = await connection.readExecutionEvents(executionId)
  const next = await connection.readExecutionEvents(executionId, first)
  assert.match(requests[0]!, /after=0$/)
  assert.match(requests[1]!, /after=1$/)
  assert.deepEqual(next?.events.map((item) => item.sequence), [1, 2])
  wrongResponse = true
  assert.equal(await connection.readExecutionEvents(executionId, next), null)
  assert.equal(connection.snapshot().eventBatch, null)
})
