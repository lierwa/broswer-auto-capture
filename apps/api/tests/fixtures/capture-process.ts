import { randomUUID } from "node:crypto"
import { chainFixture } from "../chain-fixture.js"

const fixture = await chainFixture(false, true), taskId = await fixture.readyChain()
await fixture.startPlan(taskId); const initial = (await fixture.waitChain(taskId)).execution
fixture.fake.beforeCommand = async (args) => {
  const run = fixture.current.plan.snapshot(taskId).executions.at(-1)!
  if (run.mode === "replay" && run.capture?.steps[0]?.status === "completed" && args[1] === "navigate") {
    process.stdout.write(JSON.stringify({ directory: fixture.directory, taskId, executionId: run.id, commands: run.capture.steps[0].commands }) + "\n")
    await new Promise(() => {})
  }
}
await fixture.planPost(taskId, { type: "replay", requestId: randomUUID(), executionId: initial.id, planDigest: initial.planDigest })
setInterval(() => {}, 1000)
