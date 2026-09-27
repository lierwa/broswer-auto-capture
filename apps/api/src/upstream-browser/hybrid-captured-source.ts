import { z } from "zod"
import type { ModelCallReport } from "@browser-capture/runtime"
import { hybridAuthorResultSchema } from "./hybrid-protocol.js"
import { naturalSourceContext } from "./hybrid-natural-payload.js"
import type { JsonValue } from "@browser-capture/contracts"

export type CapturedSourceReceipt = { result: JsonValue; forkSourceDigest: string; modelCalls: ModelCallReport[] }

export function parseCapturedSource(raw: unknown, forkSourceDigest: string, modelCalls: ModelCallReport[]) {
  const result = hybridAuthorResultSchema.parse(raw)
  const { request, ordinary } = naturalSourceContext(result.canonicalRequest)
  const trace = z.object({ completed: z.boolean(),
    actions: z.array(z.object({ name: z.string().min(1) })) }).parse(ordinary.trace)
  // WHY：完成标记、history 和命令数只从同一 trace 投影；不再由另一份响应重复声明。
  return { ...result, request, history: { localRef: ordinary.trace.source.historyRef, digest: ordinary.trace.digest },
    sourceSuccess: trace.completed, browserCommands: trace.actions.filter((action) =>
      !["done", "bat_summarize"].includes(action.name)).length, forkSourceDigest, modelCalls }
}

export type HybridSourceResult = ReturnType<typeof parseCapturedSource>
