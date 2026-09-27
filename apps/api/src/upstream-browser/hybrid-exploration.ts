import { randomUUID } from "node:crypto"
import path from "node:path"
import type { AI, ModelSelection } from "@agent-platform/ai-connect/server"
import type { ModelCallReport } from "@browser-capture/runtime"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { RunnerProcess, modelReport } from "./service.js"
import { openModelBridge } from "./model-bridge.js"
import { hybridAuthorRequestSchema, hybridAuthorSourceSchema, hybridCompileRequestSchema,
  hybridAnnotateRequestSchema, hybridAnnotateResultSchema, type HybridRunnerRequest } from "./hybrid-protocol.js"
import { z } from "zod"
import { validateHybridRequestSources, validateHybridResponse } from "./hybrid-materializer.js"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { naturalPayloadContext, naturalSourceContext } from "./hybrid-natural-payload.js"
import { SourceLifecycleDiagnostics, type SourceLifecycleProgress } from "./source-lifecycle-diagnostics.js"
import { RuntimeCleanupRequiredError, type RuntimePrimaryOutcome } from "./cleanup.js"
import { withSelectionValidation } from "./hybrid-selection.js"
import { assertAnnotationSource, missingSelectionActions, missingRepeatActions } from "./hybrid-annotation.js"
import { parseCapturedSource, type HybridSourceResult, type CapturedSourceReceipt } from "./hybrid-captured-source.js"
import type { AuthoringHumanHandlers } from "./hybrid-author-human.js"

export type { HybridSourceResult } from "./hybrid-captured-source.js"
export type HybridAuthoringProgress = SourceLifecycleProgress
export interface HybridAuthorSession {
  author(source: z.infer<typeof hybridAuthorSourceSchema>, options?: { closeAfterResponse?: boolean;
    onSource?: (source: CapturedSourceReceipt) => void }): Promise<HybridSourceResult>
}

export type HybridSourceAnnotation = { selection: ModelSelection; ownerId: string;
  onProgress?: (event: HybridAuthoringProgress) => void }
type RecompileResult = { request?: JsonValue; response: ReturnType<typeof validateHybridResponse>;
  forkSourceDigest: string; modelCalls: ModelCallReport[] }
type CompilerDependencies = { verifySource?: typeof verifyForkSource; openBridge?: typeof openModelBridge;
  createRunner?: (root: string, signal: AbortSignal) => Pick<RunnerProcess, "startCompiler" | "request" | "close"> }
type AuthoringDependencies = { verifySource?: typeof verifyForkSource; openBridge?: typeof openModelBridge;
  createRunner?: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
    Pick<RunnerProcess, "startHybrid" | "request" | "close" | "envBoolean"> }

export async function recompileHybridSource(input: Omit<z.infer<typeof hybridCompileRequestSchema>, "id" | "type" | "request">
  & { root: string; signal: AbortSignal; canonicalRequest: string; annotation?: HybridSourceAnnotation;
    directory?: string; subject?: ReturnType<AI["forSubject"]> }, dependencies: CompilerDependencies = {}) {
  const forkSourceDigest = await (dependencies.verifySource ?? verifyForkSource)(input.root)
  const runner = dependencies.createRunner?.(input.root, input.signal) ?? new RunnerProcess(input.root, input.signal)
  const reports: ModelCallReport[] = [], intended = new Map<string, string>()
  let bridge: Awaited<ReturnType<typeof openModelBridge>> | undefined
  let diagnostics: SourceLifecycleDiagnostics | undefined
  let primary: RuntimePrimaryOutcome<RecompileResult>
  try {
    const { request, transportRequest } = naturalSourceContext(input.canonicalRequest)
    const command = hybridCompileRequestSchema.parse({ id: randomUUID(), type: "hybrid_compile", request,
      outputSchema: input.outputSchema, sourceGaps: input.sourceGaps, verifiedChildren: input.verifiedChildren })
    await runner.startCompiler()
    let response = validateHybridResponse(await runner.request(
      { ...command, request: transportRequest } as HybridRunnerRequest))
    validateHybridRequestSources(response, request)
    let annotatedRequest: Record<string, JsonValue> | undefined
    if (request.compilerVersion === "bat-hybrid/2" && input.annotation
      && (missingSelectionActions(response).size || missingRepeatActions(response).size)) {
      if (!input.subject || !input.directory) throw new Error("hybrid_annotation_context_missing")
      const annotation = input.annotation
      diagnostics = SourceLifecycleDiagnostics.open(input.directory, annotation.ownerId, annotation.onProgress)
      bridge = await (dependencies.openBridge ?? openModelBridge)({ subject: input.subject,
        selection: annotation.selection, signal: input.signal, allowedPurposes: ["semantic_annotation"],
        onAudit: (audit) => { const report = modelReport(audit, annotation.selection.modelId, intended)
          reports.push(report); diagnostics?.recordModel(report) } })
      const annotate = hybridAnnotateRequestSchema.parse({ ...command, type: "hybrid_annotate",
        model: { model: annotation.selection.modelId, endpoint: bridge.url, token: bridge.token } })
      // WHY：canonical transport 保留 Python 数字词法；只发一次注解 RPC，不启动 Browser 或重复探索。
      const result = hybridAnnotateResultSchema.parse(await runner.request({ ...annotate,
        request: naturalPayloadContext(response, request).transportRequest } as HybridRunnerRequest))
      annotatedRequest = z.record(z.string(), jsonValueSchema).parse(result.request)
      const annotatedResponse = validateHybridResponse(result.response)
      assertAnnotationSource(request, annotatedRequest, response, annotatedResponse)
      response = annotatedResponse
    }
    response = validateHybridResponse(await withSelectionValidation(response, annotatedRequest ?? request, input.signal))
    primary = { status: "completed", value: { ...(annotatedRequest ? { request: annotatedRequest } : {}),
      response, forkSourceDigest, modelCalls: reports } }
  } catch (error) { primary = { status: "failed", error } }
  const cleanup = await runner.close()
  let bridgeFailure: unknown
  try { await bridge?.close() } catch (error) { bridgeFailure = error } finally { diagnostics?.close() }
  if (cleanup.status === "unconfirmed") throw new RuntimeCleanupRequiredError(input.annotation?.ownerId ?? "hybrid-compiler", cleanup, primary)
  if (primary.status === "failed") throw primary.error
  if (bridgeFailure) throw bridgeFailure
  return primary.value
}

/** WHY：浏览器与模型桥共同退出后才返回来源；候选写入者不在仍打开的会话中冒充 closed。 */
export async function withHybridAuthoring<T>(input: { root: string; subject: ReturnType<AI["forSubject"]>;
  selection: ModelSelection; signal: AbortSignal; allowedOrigins: string[]; directory: string; ownerId: string;
  onProgress?: (event: HybridAuthoringProgress) => void } & AuthoringHumanHandlers,
  work: (session: HybridAuthorSession) => Promise<T>, dependencies: AuthoringDependencies = {}) {
  const fork = await (dependencies.verifySource ?? verifyForkSource)(input.root)
  const reports: ModelCallReport[] = [], intended = new Map<string, string>()
  const diagnostics = input.directory && input.ownerId
    ? SourceLifecycleDiagnostics.open(input.directory, input.ownerId, input.onProgress) : undefined
  let bridge: Awaited<ReturnType<typeof openModelBridge>>
  try {
    bridge = await (dependencies.openBridge ?? openModelBridge)({ ...input, allowedPurposes: ["agent", "judge", "extract", "semantic_annotation"],
      onAudit: (audit) => { const report = modelReport(audit, input.selection.modelId, intended)
        reports.push(report); diagnostics?.recordModel(report) } })
  } catch (error) { diagnostics?.close(); throw error }
  const runner = dependencies.createRunner?.(input.root, input.signal,
    diagnostics ? (line) => diagnostics.acceptPythonLine(line) : undefined)
    ?? new RunnerProcess(input.root, input.signal,
      diagnostics ? (line) => diagnostics.acceptPythonLine(line) : undefined)
  let primary: RuntimePrimaryOutcome<T>
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins,
      profilePath: path.join(input.directory, "browser-profile", "default"),
      headless: runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false) })
    const value = await work({ author: async (source, options) => {
      const offset = reports.length
      let raw: JsonValue
      try {
        raw = await runner.request(hybridAuthorRequestSchema.parse({ id: randomUUID(), type: "hybrid_author",
          source,
          model: { model: input.selection.modelId, endpoint: bridge.url, token: bridge.token } }), input.onHumanWait)
      } catch (error) { diagnostics?.recordTransportBoundary("author_request_failed"); throw error }
      diagnostics?.recordTransportBoundary("author_response_received")
      // WHY：收到的原文只落库一次；即使协议校验拒绝也可查证，准入失败不能消灭来源。
      options?.onSource?.({ result: raw, forkSourceDigest: fork, modelCalls: reports.slice(offset) })
      let result: HybridSourceResult
      try { result = parseCapturedSource(raw, fork, reports.slice(offset)) }
      catch (error) {
        diagnostics?.recordTransportBoundary("author_result_schema_invalid", error)
        throw new Error("hybrid_source_protocol_invalid", { cause: error })
      }
      if (options?.closeAfterResponse && (await runner.close()).status === "unconfirmed") {
        throw new Error("upstream_runner_cleanup_unconfirmed")
      }
      diagnostics?.recordTransportBoundary("author_response_accepted")
      return result
    } })
    primary = { status: "completed", value }
  } catch (error) { primary = { status: "failed", error } }
  const cleanup = await runner.close()
  let bridgeFailure: unknown
  try { await bridge.close() } catch (error) { bridgeFailure = error } finally { diagnostics?.close() }
  if (cleanup.status === "unconfirmed") throw new RuntimeCleanupRequiredError(input.ownerId, cleanup, primary)
  if (primary.status === "failed") throw primary.error
  if (bridgeFailure) throw bridgeFailure
  return primary.value
}
