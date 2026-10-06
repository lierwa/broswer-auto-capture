import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { TaskChainService } from "../src/task-chain/service.js"

test("同一任务恢复串行化，已接受 requestId 的幂等重试仍可读取结果", () => {
  const service = Object.create(TaskChainService.prototype) as TaskChainService
  const accepted = new Set<string>()
  let active = false, starts = 0
  Object.assign(service, {
    store: { task: () => {}, operation: (_scope: string, id: string) => accepted.has(id) },
    browser: { owner: () => null }, isActive: () => active, snapshot: () => ({}),
    preparation: { recoverCompilation: (_taskId: string, command: { requestId: string }) => {
      if (accepted.has(command.requestId)) return
      accepted.add(command.requestId); starts++; active = true
    } },
  })
  const command = { type: "recover_preparation_compilation", requestId: randomUUID(),
    jobId: randomUUID(), expectedSequence: 7 }
  const taskId = randomUUID()
  service.dispatch(taskId, command)
  service.dispatch(taskId, command)
  assert.throws(() => service.dispatch(taskId, { ...command, requestId: randomUUID() }), /本任务正在处理/)
  assert.equal(starts, 1)
})
