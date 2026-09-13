import type { ChainNode, TaskConsumption } from "@browser-capture/contracts"
import type { TaskChainCapabilities } from "./types.js"

type AccountedOperation = ChainNode["kind"] | "resume"
const browserBacked = new Set<AccountedOperation>(["browser", "observe", "human", "resume"])

export async function withBrowserCommandAccounting<T>(capabilities: TaskChainCapabilities,
  consumed: TaskConsumption, operation: AccountedOperation, work: () => Promise<T>): Promise<T> {
  if (!browserBacked.has(operation)) return work()
  const before = commandCount(capabilities)
  try { return await work() }
  finally {
    const after = commandCount(capabilities)
    if (before === null || after === null) {
      // WHY：独立 runtime 可注入抽象 browser capability；没有宿主计数器时保留既有的一动作一次计费语义。
      if (operation === "browser") consumed.browserCommands += 1
    } else {
      if (after < before) throw new Error("browser_command_count_regressed")
      consumed.browserCommands += after - before
    }
  }
}

function commandCount(capabilities: TaskChainCapabilities) {
  const value = capabilities.browserCommandCount?.()
  if (value === undefined) return null
  if (!Number.isInteger(value) || value < 0) throw new Error("browser_command_count_invalid")
  return value
}
