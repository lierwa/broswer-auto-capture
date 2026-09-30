import assert from "node:assert/strict"
import test from "node:test"
import { fixture, authoredInterview } from "./helpers.js"

test("访谈实际增量合并读取，活跃但无变化不再查快照", async () => fixture(async ({ coordinator, store, create, send, client, gate }) => {
  const ready = gate(), release = gate()
  client.runTurn = async function* () {
    ready.resolve(); await release.promise
    yield authoredInterview({ assistantText: "完成", question: null, draft: null })
  }
  const id = create(); send(id); await ready.promise
  const sequence = store.task(id).sequence, controller = new AbortController()
  const snapshot = coordinator.snapshot.bind(coordinator)
  let reads = 0
  coordinator.snapshot = taskId => { reads++; return snapshot(taskId) }
  const observer = coordinator.observe(id, sequence, controller.signal, true)
  try {
    const changed = observer.next()
    for (let index = 0; index < 100; index++) {
      store.mutate(id, state => { state.messages.at(-1)!.text += "." })
      await new Promise(resolve => setImmediate(resolve))
    }
    const latest = await changed
    assert.equal(latest.value?.state.sequence, store.task(id).sequence)
    assert.equal(reads, 1)
    const idle = observer.next()
    await new Promise(resolve => setTimeout(resolve, 230))
    assert.equal(reads, 1)
    controller.abort(); assert.equal((await idle).done, true)
  } finally { controller.abort(); coordinator.snapshot = snapshot; release.resolve() }
}))

test("旧有限访谈观察追平idle序号立即结束", async () => fixture(async ({ coordinator, store, create }) => {
  const id = create(), observer = coordinator.observe(id, store.task(id).sequence, new AbortController().signal)
  assert.equal((await observer.next()).done, true)
}))
