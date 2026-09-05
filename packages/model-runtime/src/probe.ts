import {
  createProductModelRuntime,
  ModelRuntimeError,
  type ModelRuntimeEvent,
} from "./index.js"

const mode = readMode(process.argv.slice(2))
const runtime = createProductModelRuntime()
const controller = new AbortController()
const startedAt = Date.now()
let interruptRequested = false

try {
  const account = await runtime.readAccount()
  emit("account", { loggedIn: account.loggedIn, accountType: account.type })
  for await (const event of runtime.run({
    conversation: [{ role: "user", content: "我需要抓取公开商品页面里的型号和参数。" }],
    requirement: "形成一个等待用户确认的最小抓取需求草案。",
  }, controller.signal)) {
    emitRuntimeEvent(event)
    if (mode === "interrupt" && event.type === "item_lifecycle" && !interruptRequested) {
      interruptRequested = true
      controller.abort()
    }
  }
} catch (error) {
  emit("status", {
    status: "failed",
    code: error instanceof ModelRuntimeError ? error.code : "unexpected",
  })
  process.exitCode = 1
} finally {
  await runtime.close()
  emit("closed", { status: "closed", durationMs: Date.now() - startedAt })
}

function emitRuntimeEvent(event: ModelRuntimeEvent): void {
  if (event.type === "commentary_delta") {
    emit("commentary_delta", { characters: event.delta.length })
    return
  }
  if (event.type === "item_lifecycle") {
    emit("item_lifecycle", { itemType: event.itemType, status: event.status })
    return
  }
  if (event.type === "interrupted") {
    emit("status", { status: "interrupted", ...event.audit })
    return
  }
  emit("status", {
    status: "completed",
    ...event.audit,
    output: {
      assistantCharacters: event.result.assistantText.length,
      draftSteps: event.result.draftPlan.steps.length,
      needsClarification: event.result.needsClarification,
    },
  })
}

function emit(type: string, fields: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), type, ...fields })}\n`)
}

function readMode(args: string[]): "normal" | "interrupt" {
  const modeIndex = args.indexOf("--mode")
  const value = modeIndex >= 0 ? args[modeIndex + 1] : "normal"
  if (value === "normal" || value === "interrupt") return value
  throw new Error("probe --mode 只接受 normal 或 interrupt")
}
