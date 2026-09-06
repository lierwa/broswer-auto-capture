import { planFixture } from "../plan-fixture.js"

const phase = process.argv.at(-1)
const v = await planFixture(false, phase === "running" ? async ({ signal }) => {
  if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
} : undefined)
const taskId = await v.ready()
if (phase === "generating") v.planFake.decide = () => new Promise(() => {})
await v.generate(taskId)
if (phase === "running") { await v.waitPlan(taskId); await v.startPlan(taskId); await v.current.plan.queue.tick() }
process.stdout.write(JSON.stringify({ directory: v.directory, taskId, phase }) + "\n")
setInterval(() => {}, 1000)
