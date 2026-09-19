import { parentPort, workerData } from "node:worker_threads"
import { getQuickJS, type QuickJSContext, type QuickJSRuntime } from "quickjs-emscripten"

const HEAP_LIMIT_BYTES = 32 * 1024 * 1024
const STACK_LIMIT_BYTES = 512 * 1024
const OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024
const RESULT_PREFIX = "__BAT_OUTPUT__:"
const STACK_SENTINEL = "__BAT_STACK_LIMIT__"
const MEMORY_SENTINEL = "__BAT_MEMORY_LIMIT__"
const INVALID_SENTINEL = "__BAT_OUTPUT_INVALID__"
const ASYNC_SENTINEL = "__BAT_ASYNC_UNSUPPORTED__"
const encoder = new TextEncoder()

type WorkerInput = Readonly<{ source: string; inputJson: string; timeoutMs: number; cancelBuffer: SharedArrayBuffer }>
type Outcome = { outcome: "success"; outputJson: string } | {
  outcome: "failed" | "timeout" | "cancelled"; code: string
}

function program(source: string, inputJson: string) {
  return `
"use strict";
Object.defineProperties(globalThis, {
  Date: { value: undefined, writable: false, configurable: false },
  Intl: { value: undefined, writable: false, configurable: false },
  eval: { value: undefined, writable: false, configurable: false },
  Function: { value: undefined, writable: false, configurable: false },
  process: { value: undefined, writable: false, configurable: false },
  require: { value: undefined, writable: false, configurable: false },
  fetch: { value: undefined, writable: false, configurable: false },
  XMLHttpRequest: { value: undefined, writable: false, configurable: false },
  WebSocket: { value: undefined, writable: false, configurable: false },
  Browser: { value: undefined, writable: false, configurable: false },
  Deno: { value: undefined, writable: false, configurable: false },
  Bun: { value: undefined, writable: false, configurable: false },
  setTimeout: { value: undefined, writable: false, configurable: false },
  setInterval: { value: undefined, writable: false, configurable: false },
  queueMicrotask: { value: undefined, writable: false, configurable: false },
  Atomics: { value: undefined, writable: false, configurable: false },
  SharedArrayBuffer: { value: undefined, writable: false, configurable: false }
});
Object.defineProperty(Math, "random", { value: undefined, writable: false, configurable: false });
Object.freeze(Math);
(() => {
${source}
if (typeof main !== "function") return ${JSON.stringify(ASYNC_SENTINEL)};
const __batInputs = JSON.parse(${JSON.stringify(inputJson)});
let __batResult;
try { __batResult = main(__batInputs); }
catch (__batError) {
  const __batMessage = String(__batError && __batError.message);
  if (/stack overflow|call stack/i.test(__batMessage)) return ${JSON.stringify(STACK_SENTINEL)};
  if (/out of memory|memory limit/i.test(__batMessage)) return ${JSON.stringify(MEMORY_SENTINEL)};
  return ${JSON.stringify(INVALID_SENTINEL)};
}
if (__batResult && typeof __batResult.then === "function") return ${JSON.stringify(ASYNC_SENTINEL)};
let __batJson;
try { __batJson = JSON.stringify(__batResult); }
catch { return ${JSON.stringify(INVALID_SENTINEL)}; }
if (typeof __batJson !== "string") return ${JSON.stringify(INVALID_SENTINEL)};
return ${JSON.stringify(RESULT_PREFIX)} + __batJson;
})()`
}

function text(raw: unknown) {
  if (typeof raw === "string") return raw
  if (!raw || typeof raw !== "object") return String(raw)
  const value = raw as Record<string, unknown>
  return [value.name, value.message, value.stack].filter((part) => typeof part === "string").join(":")
}

function classifyOutput(raw: unknown): Outcome {
  if (typeof raw !== "string") return { outcome: "failed", code: "function_output_invalid" }
  if (raw === STACK_SENTINEL || raw === MEMORY_SENTINEL) return { outcome: "failed", code: "function_memory_limit" }
  if (raw === ASYNC_SENTINEL) return { outcome: "failed", code: "function_source_invalid" }
  if (raw === INVALID_SENTINEL || !raw.startsWith(RESULT_PREFIX)) return { outcome: "failed", code: "function_output_invalid" }
  const outputJson = raw.slice(RESULT_PREFIX.length)
  if (encoder.encode(outputJson).byteLength > OUTPUT_LIMIT_BYTES) return { outcome: "failed", code: "function_output_too_large" }
  return { outcome: "success", outputJson }
}

async function execute(input: WorkerInput) {
  const cancelled = new Int32Array(input.cancelBuffer), deadline = performance.now() + input.timeoutMs
  let interrupted = false, moduleLoaded = false, runtimeDisposed = false, contextDisposed = false
  let runtime: QuickJSRuntime | null = null
  let context: QuickJSContext | null = null
  let outcome: Outcome = { outcome: "failed", code: "function_source_invalid" }
  try {
    const quickJs = await getQuickJS(); moduleLoaded = true
    runtime = quickJs.newRuntime({ memoryLimitBytes: HEAP_LIMIT_BYTES, maxStackSizeBytes: STACK_LIMIT_BYTES })
    runtime.setInterruptHandler(() => {
      interrupted = Atomics.load(cancelled, 0) === 1 || performance.now() >= deadline
      return interrupted
    })
    context = runtime.newContext()
    const evaluation = context.evalCode(program(input.source, input.inputJson), "task-chain-function.js")
    if (evaluation.error) {
      let detail: unknown
      try { detail = context.dump(evaluation.error) }
      finally { evaluation.error.dispose() }
      if (Atomics.load(cancelled, 0) === 1) outcome = { outcome: "cancelled", code: "function_cancelled" }
      else if (interrupted) outcome = { outcome: "timeout", code: "function_timeout" }
      else if (/out of memory|stack overflow|call stack|memory limit/i.test(text(detail))) outcome = { outcome: "failed", code: "function_memory_limit" }
      else if (/SyntaxError/i.test(text(detail))) outcome = { outcome: "failed", code: "function_source_invalid" }
      else outcome = { outcome: "failed", code: "function_output_invalid" }
    } else {
      let raw: unknown
      try { raw = context.dump(evaluation.value) }
      finally { evaluation.value.dispose() }
      outcome = classifyOutput(raw)
    }
  } catch (error) {
    if (Atomics.load(cancelled, 0) === 1) outcome = { outcome: "cancelled", code: "function_cancelled" }
    else if (interrupted || performance.now() >= deadline) outcome = { outcome: "timeout", code: "function_timeout" }
    else if (/out of memory|stack overflow|call stack|memory limit/i.test(text(error))) outcome = { outcome: "failed", code: "function_memory_limit" }
    else outcome = { outcome: "failed", code: "function_source_invalid" }
  } finally {
    if (runtime) { runtime.removeInterruptHandler(); runtime.setMemoryLimit(-1); runtime.setMaxStackSize(0) }
    if (context) { try { context.dispose(); contextDisposed = true } catch { contextDisposed = false } }
    if (runtime) { try { runtime.dispose(); runtimeDisposed = true } catch { runtimeDisposed = false } }
  }
  return { ...outcome, moduleLoaded, cleanup: { runtime: runtimeDisposed, context: contextDisposed } }
}

const input = workerData as WorkerInput
const result = await execute(input)
parentPort?.postMessage(result)
