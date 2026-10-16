import type { BrowserAllowedSite } from "@browser-capture/contracts"
import { randomUUID } from "node:crypto"
import path from "node:path"
import type { AI, ModelSelection } from "@agent-platform/ai-connect/server"
import type { ModelCallReport } from "@browser-capture/runtime"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { RunnerProcess, modelReport } from "./service.js"
import { openModelBridge } from "./model-bridge.js"
import { hybridAuthorRequestSchema, hybridAuthorSourceSchema, hybridCompileRequestSchema,
  type HybridRunnerRequest } from "./hybrid-protocol.js"
import { z } from "zod"
import { validateHybridRequestSources, validateHybridResponse } from "./hybrid-materializer.js"
import { type JsonValue } from "@browser-capture/contracts"
import { naturalSourceContext } from "./hybrid-natural-payload.js"
import { SourceLifecycleDiagnostics, type SourceLifecycleProgress } from "./source-lifecycle-diagnostics.js"
import { RuntimeCleanupRequiredError, type RuntimePrimaryOutcome, type RunnerCleanupReport } from "./cleanup.js"
import { withSelectionValidation } from "./hybrid-selection.js"
import { parseCapturedSource, type HybridSourceResult, type CapturedSourceReceipt } from "./hybrid-captured-source.js"
import type { AuthoringHumanHandlers } from "./hybrid-author-human.js"
import type { CompilationHandler } from "./hybrid-compilation-checkpoint.js"
import { hybridCapabilitiesForRunner } from "./hybrid-runtime.js"

export type { HybridSourceResult } from "./hybrid-captured-source.js"
export type HybridAuthoringProgress = SourceLifecycleProgress
export interface HybridAuthorSession {
  capabilities?: import("@browser-capture/runtime").TaskChainCapabilities
  author(source: z.infer<typeof hybridAuthorSourceSchema>, options?: { closeAfterResponse?: boolean;
    onCompilation?: CompilationHandler;
    onSource?: (source: CapturedSourceReceipt) => void }): Promise<HybridSourceResult>
}

type RecompileResult = { response: ReturnType<typeof validateHybridResponse>;
  forkSourceDigest: string; modelCalls: ModelCallReport[] }
type CompilerDependencies = { verifySource?: typeof verifyForkSource;
  createRunner?: (root: string, signal: AbortSignal) => Pick<RunnerProcess, "startCompiler" | "request" | "close"> }
type AuthoringDependencies = { verifySource?: typeof verifyForkSource; openBridge?: typeof openModelBridge;
  createRunner?: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
    Pick<RunnerProcess, "startHybrid" | "request" | "close" | "envBoolean"> & Partial<Pick<RunnerProcess, "handoff">> }

export async function recompileHybridSource(input: Omit<z.infer<typeof hybridCompileRequestSchema>, "id" | "type" | "request">
  & { root: string; signal: AbortSignal; canonicalRequest: string; ownerId: string },
  dependencies: CompilerDependencies = {}) {
  const forkSourceDigest = await (dependencies.verifySource ?? verifyForkSource)(input.root)
  const runner = dependencies.createRunner?.(input.root, input.signal) ?? new RunnerProcess(input.root, input.signal)
  let primary: RuntimePrimaryOutcome<RecompileResult>
  try {
    const { request, transportRequest } = naturalSourceContext(input.canonicalRequest)
    const command = hybridCompileRequestSchema.parse({ id: randomUUID(), type: "hybrid_compile", request,
      outputSchema: input.outputSchema, sourceGaps: input.sourceGaps, verifiedChildren: input.verifiedChildren })
    await runner.startCompiler()
    const response = validateHybridResponse(await runner.request(
      { ...command, request: transportRequest } as HybridRunnerRequest))
    validateHybridRequestSources(response, request)
    // WHY：恢复只消费现行已保存来源，不借旧协议缺口开启第二次语义模型救援。
    const validated = validateHybridResponse(await withSelectionValidation(response, request, input.signal))
    primary = { status: "completed", value: { response: validated, forkSourceDigest, modelCalls: [] } }
  } catch (error) { primary = { status: "failed", error } }
  const cleanup = await runner.close()
  if (cleanup.status === "unconfirmed") throw new RuntimeCleanupRequiredError(input.ownerId, cleanup, primary)
  if (primary.status === "failed") throw primary.error
  return primary.value
}

/** WHY：浏览器与模型桥共同退出后才返回来源；候选写入者不在仍打开的会话中冒充 closed。 */
export async function withHybridAuthoring<T>(input: { root: string; subject: ReturnType<AI["forSubject"]>;
  selection: ModelSelection; signal: AbortSignal; allowedOrigins: string[]; allowedSites?: BrowserAllowedSite[]; directory: string; ownerId: string;
  headless?: boolean; profilePath?: string;
  managedWindow?: { ownerId: string; resume: boolean }; preserveWindow?: boolean;
  onCleanup?: (report: RunnerCleanupReport) => void;
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
        reports.push(report); diagnostics?.recordModel(report, audit.transport) } })
  } catch (error) {
    diagnostics?.recordRuntimeOutcome({ status: "failed", error }, null)
    diagnostics?.close()
    throw error
  }
  const capabilityOwner = new AbortController()
  const runnerSignal = AbortSignal.any([input.signal, capabilityOwner.signal])
  const runner = dependencies.createRunner?.(input.root, runnerSignal,
    diagnostics ? (line) => diagnostics.acceptPythonLine(line) : undefined)
    ?? new RunnerProcess(input.root, runnerSignal,
      diagnostics ? (line) => diagnostics.acceptPythonLine(line) : undefined)
  let primary: RuntimePrimaryOutcome<T>
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins,
      ...(input.allowedSites ? { allowedSites: input.allowedSites } : {}),
      profilePath: input.profilePath ?? path.join(input.directory, "browser-profile", "default"),
      headless: input.headless ?? runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false),
      managedWindow: input.managedWindow ?? { ownerId: input.ownerId, resume: false } })
    const value = await work({ capabilities: hybridCapabilitiesForRunner(input, runner, capabilityOwner, diagnostics),
      author: async (source, options) => {
      const offset = reports.length
      let compilationError: unknown
      let raw: JsonValue
      try {
        raw = await runner.request(hybridAuthorRequestSchema.parse({ id: randomUUID(), type: "hybrid_author",
          source, onlineCompilation: Boolean(options?.onCompilation),
          model: { model: input.selection.modelId, endpoint: bridge.url, token: bridge.token } }), input.onHumanWait,
          options?.onCompilation ? async (event, signal) => {
            try { await options.onCompilation!(event, signal) }
            catch (error) { compilationError = error; throw error }
          } : undefined)
      } catch (error) { diagnostics?.recordTransportBoundary("author_request_failed"); throw error }
      diagnostics?.recordTransportBoundary("author_response_received")
      // WHY：收到的原文只落库一次；即使协议校验拒绝也可查证，准入失败不能消灭来源。
      options?.onSource?.({ result: raw, forkSourceDigest: fork, modelCalls: reports.slice(offset) })
      if (compilationError) throw compilationError
      let result: HybridSourceResult
      try { result = parseCapturedSource(raw, fork, reports.slice(offset)) }
      catch (error) {
        diagnostics?.recordTransportBoundary("author_result_schema_invalid", error)
        throw new Error("hybrid_source_protocol_invalid", { cause: error })
      }
      if (result.request.compilerVersion !== (source.sourceProtocol ?? "bat-hybrid/2")) {
        throw new Error("hybrid_source_protocol_mismatch")
      }
      // WHY：先结束 owner，再交付已保存来源供业务判定；清理未确认由外层独立结算，不能遮住来源失败。
      if (options?.closeAfterResponse) await runner.close()
      diagnostics?.recordTransportBoundary("author_response_accepted")
      return result
    } })
    primary = { status: "completed", value }
  } catch (error) { primary = { status: "failed", error } }
  let cleanup
  try { cleanup = input.preserveWindow && runner.handoff && primary.status === "completed"
    ? (await runner.handoff()).report : await runner.close() }
  catch (error) {
    if (primary.status === "completed") primary = { status: "failed", error }
    cleanup = await runner.close()
  }
  let bridgeFailure: unknown
  try { await bridge.close() } catch (error) { bridgeFailure = error } finally {
    diagnostics?.recordRuntimeOutcome(primary, cleanup, bridgeFailure)
    diagnostics?.close()
  }
  input.onCleanup?.(cleanup)
  if (cleanup.status === "unconfirmed") throw new RuntimeCleanupRequiredError(input.ownerId, cleanup, primary)
  if (primary.status === "failed") throw primary.error
  if (bridgeFailure) throw bridgeFailure
  return primary.value
}
