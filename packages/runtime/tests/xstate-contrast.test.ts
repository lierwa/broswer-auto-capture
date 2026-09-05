import assert from "node:assert/strict"
import test from "node:test"
import { runXStateRestartProbe } from "../src/xstate-contrast.js"

test("XState 恢复活动 invocation 时会重新启动异步任务", async () => {
  const result = await runXStateRestartProbe()
  assert.equal(result.invocationStarts, 2)
  assert.equal(result.restoredState, "complete")
})
