import assert from "node:assert/strict"
import test from "node:test"
import { taskChainCommandSchema, taskExecutionPacingSchema } from "@browser-capture/contracts"
import { ExecutionPacingController } from "../src/task-chain/execution-pacing.js"

test("复跑节奏合同限制为 0..5000ms，并在授权命令中固定", () => {
  const command = taskChainCommandSchema.parse({ type: "authorize_plan",
    requestId: "61000000-0000-4000-8000-000000000001",
    plan: { id: "61000000-0000-4000-8000-000000000002", version: 1, digest: "a".repeat(64) },
    input: null, pacing: { nodeDelayMs: 1600 } })
  if (command.type !== "authorize_plan") assert.fail("authorize command expected")
  assert.deepEqual(command.pacing, { nodeDelayMs: 1600 })
  assert.throws(() => taskExecutionPacingSchema.parse({ nodeDelayMs: 5001 }))
})

test("运行中调速由控制器供下一个节点读取，等待可由取消信号中断", async () => {
  const pacing = new ExecutionPacingController({ nodeDelayMs: 1000 })
  const controller = new AbortController()
  const pending = pacing.beforeNode({ binding: null as never, node: null as never, transition: 0, signal: controller.signal })
  pacing.update({ nodeDelayMs: 0 })
  controller.abort(new Error("cancelled"))
  await assert.rejects(pending, /cancelled/)
  await pacing.beforeNode({ binding: null as never, node: null as never, transition: 1,
    signal: new AbortController().signal })
  assert.deepEqual(pacing.snapshot(), { nodeDelayMs: 0 })
})
