import { Worker } from "node:worker_threads"
import {
  jsonValueSchema, parseTaskValue, type JsonValue, type NodeCapabilityResult, type StableChainNodeV2,
} from "@browser-capture/contracts"

const INPUT_LIMIT_BYTES = 2 * 1024 * 1024
const OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024
const HEAP_LIMIT_BYTES = 32 * 1024 * 1024
const STACK_LIMIT_BYTES = 512 * 1024
const encoder = new TextEncoder()
let moduleLoaded = false
let activeWorkers = 0
let activeRuntimes = 0
let activeContexts = 0
let cleanupFailures = 0

type FunctionNode = Extract<StableChainNodeV2, { kind: "function" }>
type WorkerResult = Readonly<{
  outcome: "success" | "failed" | "timeout" | "cancelled"
  outputJson?: string
  code?: string
  moduleLoaded: boolean
  cleanup: { runtime: boolean; context: boolean }
}>

export type FunctionRuntimeDiagnostics = Readonly<{
  moduleLoaded: boolean
  activeWorkers: number
  activeRuntimes: number
  activeContexts: number
  cleanupFailures: number
}>

export function functionRuntimeDiagnostics(): FunctionRuntimeDiagnostics {
  return { moduleLoaded, activeWorkers, activeRuntimes, activeContexts, cleanupFailures }
}

function failure(outcome: "failed" | "timeout" | "cancelled", code: string): NodeCapabilityResult {
  return { outcome, output: null, reason: code }
}

function byteLength(value: string) {
  return encoder.encode(value).byteLength
}

function serializeInput(input: Record<string, JsonValue>) {
  try {
    const json = JSON.stringify(input)
    if (byteLength(json) > INPUT_LIMIT_BYTES) throw new Error("too_large")
    return json
  } catch {
    return null
  }
}

function workerUrl() {
  return new URL(import.meta.url.endsWith(".ts") ? "./function-worker.ts" : "./function-worker.js", import.meta.url)
}

function executeInWorker(source: string, inputJson: string, timeoutMs: number, signal: AbortSignal): Promise<WorkerResult> {
  const cancelBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancelled = new Int32Array(cancelBuffer)
  const worker = new Worker(workerUrl(), {
    workerData: { source, inputJson, timeoutMs, cancelBuffer },
    execArgv: [],
    // 512 KiB 是 guest 上限；更大的宿主线程栈确保先触发 QuickJS 自己的有界错误。
    resourceLimits: { stackSizeMb: 8 },
  })
  activeWorkers += 1; activeRuntimes += 1; activeContexts += 1
  const abort = () => { Atomics.store(cancelled, 0, 1); Atomics.notify(cancelled, 0) }
  return new Promise<WorkerResult>((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true; action()
    }
    signal.addEventListener("abort", abort, { once: true })
    worker.once("message", (message: WorkerResult) => finish(() => resolve(message)))
    worker.once("error", (error) => finish(() => reject(error)))
    worker.once("exit", (code) => {
      if (code !== 0) finish(() => reject(new Error(`function_worker_exit_${code}`)))
    })
    if (signal.aborted) abort()
  }).finally(async () => {
    signal.removeEventListener("abort", abort)
    try { await worker.terminate() }
    finally { activeWorkers -= 1; activeRuntimes -= 1; activeContexts -= 1 }
  })
}

/** WHY：独立 Worker 给 QuickJS 预留宿主栈，并让取消可在同步 guest 运行时从另一线程置位。 */
export async function executeFunctionNode(node: FunctionNode, input: Record<string, JsonValue>, signal: AbortSignal): Promise<NodeCapabilityResult> {
  if (signal.aborted) return failure("cancelled", "function_cancelled")
  if (!/\bfunction\s+main\s*\(/.test(node.source)) return failure("failed", "function_source_invalid")
  const inputJson = serializeInput(input)
  if (inputJson === null) return failure("failed", "function_input_invalid")
  let result: WorkerResult
  try {
    result = await executeInWorker(node.source, inputJson, node.timeoutMs, signal)
  } catch {
    return signal.aborted ? failure("cancelled", "function_cancelled") : failure("failed", "function_source_invalid")
  }
  moduleLoaded ||= result.moduleLoaded
  if (!result.cleanup.runtime || !result.cleanup.context) cleanupFailures += 1
  if (signal.aborted || result.outcome === "cancelled") return failure("cancelled", "function_cancelled")
  if (result.outcome === "timeout") return failure("timeout", "function_timeout")
  if (result.outcome === "failed") return failure("failed", result.code ?? "function_source_invalid")
  if (typeof result.outputJson !== "string") return failure("failed", "function_output_invalid")
  if (byteLength(result.outputJson) > OUTPUT_LIMIT_BYTES) return failure("failed", "function_output_too_large")
  try {
    const output = parseTaskValue(node.outputContract, jsonValueSchema.parse(JSON.parse(result.outputJson)))
    return { outcome: "success", output }
  } catch {
    return failure("failed", "function_output_invalid")
  }
}

export const functionLimits = Object.freeze({
  inputBytes: INPUT_LIMIT_BYTES, outputBytes: OUTPUT_LIMIT_BYTES,
  heapBytes: HEAP_LIMIT_BYTES, stackBytes: STACK_LIMIT_BYTES,
})
