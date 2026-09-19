import assert from "node:assert/strict"
import test from "node:test"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { browserEffectChain, requestFor } from "./task-chain-fixtures.js"

test("正式 runtime 在 planned 与 started 之间等待可调节奏，并先持久化当前节点", async () => {
  const chain = browserEffectChain(), entered: string[] = [], releases: Array<() => void> = [], snapshots: unknown[] = []
  const execution = new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    browser: async () => ({ outcome: "success", output: null }),
    persist: (run) => { snapshots.push(structuredClone(run)) },
  }, control: { pacing: { beforeNode: async ({ node }) => {
    entered.push(node.id)
    await new Promise<void>((resolve) => releases.push(resolve))
  } } } })

  for (const expected of ["browser", "emit", "done"]) {
    await waitFor(() => entered.at(-1) === expected)
    const latest = snapshots.at(-1) as { events: Array<{ nodeId: string; status: string }>; consumed: { transitions: number } }
    assert.deepEqual(latest.events.at(-1), { ...latest.events.at(-1), nodeId: expected, status: "planned" })
    assert.equal(latest.consumed.transitions, entered.length - 1)
    releases.shift()!()
  }

  const run = await execution
  assert.equal(run.status, "completed")
  assert.deepEqual(entered, ["browser", "emit", "done"])
  assert.equal(run.consumed.transitions, 3)
})

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error("pacing_hook_not_reached")
}
