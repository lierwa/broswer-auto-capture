import { chainFixture } from "../chain-fixture.js"
const fixture = await chainFixture(), taskId = await fixture.readyChain()
fixture.chainFake.decide = () => new Promise(() => {})
await fixture.startPlan(taskId)
while (!fixture.chainFake.calls) await new Promise((resolve) => setTimeout(resolve, 10))
process.stdout.write(JSON.stringify({ directory: fixture.directory, taskId }) + "\n")
setInterval(() => {}, 1000)
