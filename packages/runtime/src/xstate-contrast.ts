import { createActor, createMachine, fromPromise } from "xstate"

export interface XStateRestartProbeResult {
  invocationStarts: number
  restoredState: string
}

/**
 * WHY: 该对照只量化持久快照恢复的调用语义；它不是第二套产品编排器。
 * XState 恢复活动 invocation 时会重新启动副作用，因此仍需幂等键与恢复核验。
 */
export async function runXStateRestartProbe(): Promise<XStateRestartProbeResult> {
  let invocationStarts = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const task = fromPromise(async () => {
    invocationStarts += 1
    await gate
    return "done"
  })
  const machine = createMachine({
    id: "restricted-async-task",
    initial: "working",
    states: {
      working: { invoke: { id: "ordinary-task", src: task, onDone: "complete" } },
      complete: { type: "final" },
    },
  })

  const first = createActor(machine).start()
  await Promise.resolve()
  const persisted = structuredClone(first.getPersistedSnapshot())
  first.stop()

  const restored = createActor(machine, { snapshot: persisted }).start()
  await Promise.resolve()
  const completed = new Promise<void>((resolve, reject) => {
    restored.subscribe({
      next: (snapshot) => { if (snapshot.status === "done") resolve() },
      error: reject,
    })
  })
  release?.()
  await completed
  return { invocationStarts, restoredState: String(restored.getSnapshot().value) }
}
