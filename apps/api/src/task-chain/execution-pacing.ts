import { taskExecutionPacingSchema, type TaskExecution } from "@browser-capture/contracts/api"
import type { RuntimeNodePacing } from "@browser-capture/runtime"

export class ExecutionPacingController implements RuntimeNodePacing {
  private value: TaskExecution["pacing"]

  constructor(value: TaskExecution["pacing"]) {
    this.value = taskExecutionPacingSchema.parse(value)
  }

  update(value: TaskExecution["pacing"]) {
    this.value = taskExecutionPacingSchema.parse(value)
  }

  snapshot() { return structuredClone(this.value) }

  async beforeNode({ signal }: Parameters<RuntimeNodePacing["beforeNode"]>[0]) {
    const delayMs = this.value.nodeDelayMs
    if (delayMs === 0) return
    await abortableDelay(delayMs, signal)
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(finish, delayMs)
    const abort = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"))
    signal.addEventListener("abort", abort, { once: true })
    function finish(error?: unknown) {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve()
    }
  })
}
