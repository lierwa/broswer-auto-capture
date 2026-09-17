import { randomUUID } from "node:crypto"
import type { AI, ModelSelection } from "@agent-platform/ai-connect/server"
import type { ModelCallReport } from "@browser-capture/runtime"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { RunnerProcess, modelReport } from "./service.js"
import { openModelBridge } from "./model-bridge.js"
import { hybridAuthorRequestSchema, hybridAuthorResultSchema, hybridAuthorSourceSchema, hybridCompileRequestSchema,
  type HybridRunnerRequest } from "./hybrid-protocol.js"
import { z } from "zod"
import { validateHybridRequestSources, validateHybridResponse } from "./hybrid-materializer.js"
import { jsonValueSchema } from "@browser-capture/contracts"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { SourceLifecycleDiagnostics } from "./source-lifecycle-diagnostics.js"

export type HybridSourceResult = z.infer<typeof hybridAuthorResultSchema> & { modelCalls: ModelCallReport[]; forkSourceDigest: string }
export interface HybridAuthorSession {
  author(source: z.infer<typeof hybridAuthorSourceSchema>): Promise<HybridSourceResult>
}

export async function recompileHybridSource(input: Omit<z.infer<typeof hybridCompileRequestSchema>, "id" | "type">
  & { root: string; signal: AbortSignal; sourceResponse?: unknown }) {
  const forkSourceDigest = await verifyForkSource(input.root), runner = new RunnerProcess(input.root, input.signal)
  let primaryError: unknown
  try {
    const request = z.record(z.string(), jsonValueSchema).parse(input.request)
    let transportRequest: unknown = request
    if (request.compilerVersion === "bat-hybrid/2") {
      if (input.sourceResponse === undefined) throw new Error("hybrid_natural_source_payloads_missing")
      transportRequest = naturalPayloadContext(validateHybridResponse(input.sourceResponse), request).transportRequest
    }
    const command = hybridCompileRequestSchema.parse({ id: randomUUID(), type: "hybrid_compile", request,
      outputSchema: input.outputSchema, verifiedChildren: input.verifiedChildren })
    await runner.startCompiler()
    const response = validateHybridResponse(await runner.request(
      { ...command, request: transportRequest } as HybridRunnerRequest))
    validateHybridRequestSources(response, request)
    return { response, forkSourceDigest }
  } catch (error) { primaryError = error; throw error } finally {
    try { await runner.close() } catch (error) {
      if (primaryError) throw new AggregateError([primaryError, error], "hybrid_compile_and_cleanup_failed")
      throw error
    }
  }
}

/** WHY：浏览器与模型桥共同退出后才返回来源；候选写入者不在仍打开的会话中冒充 closed。 */
export async function withHybridAuthoring<T>(input: { root: string; subject: ReturnType<AI["forSubject"]>;
  selection: ModelSelection; signal: AbortSignal; allowedOrigins: string[] }
  & ({ directory: string; ownerId: string } | { directory?: never; ownerId?: never }),
  work: (session: HybridAuthorSession) => Promise<T>) {
  const fork = await verifyForkSource(input.root)
  const reports: ModelCallReport[] = [], intended = new Map<string, string>()
  const diagnostics = input.directory && input.ownerId
    ? SourceLifecycleDiagnostics.open(input.directory, input.ownerId) : undefined
  let bridge: Awaited<ReturnType<typeof openModelBridge>>
  try {
    bridge = await openModelBridge({ ...input, allowedPurposes: ["agent", "judge", "extract", "semantic_annotation"],
      onAudit: (audit) => { const report = modelReport(audit, input.selection.modelId, intended)
        reports.push(report); diagnostics?.recordModel(report) } })
  } catch (error) { diagnostics?.close(); throw error }
  const runner = new RunnerProcess(input.root, input.signal,
    diagnostics ? (line) => diagnostics.acceptPythonLine(line) : undefined)
  let primaryError: unknown
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins, headless: runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false),
      ...(runner.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") ? { executablePath: runner.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") } : {}) })
    return await work({ author: async (source) => {
      const offset = reports.length
      const raw = await runner.request(hybridAuthorRequestSchema.parse({ id: randomUUID(), type: "hybrid_author",
        source,
        model: { model: input.selection.modelId, endpoint: bridge.url, token: bridge.token } }))
      const result = hybridAuthorResultSchema.parse(raw)
      return { ...result, modelCalls: reports.slice(offset), forkSourceDigest: fork }
    } })
  } catch (error) { primaryError = error; throw error } finally {
    try { await runner.close() } catch (error) {
      if (primaryError) throw new AggregateError([primaryError, error], "hybrid_source_and_cleanup_failed")
      throw error
    } finally {
      try { await bridge.close() } finally { diagnostics?.close() }
    }
  }
}
