import { randomUUID } from "node:crypto"
import type { AI, AIEvent, ModelSelection } from "@agent-platform/ai-connect/server"
import {
  createPiAgentSessionAdapter,
  createPiAgentSessionAIEventBridge,
  PI_AGENT_SESSION_ACTIVE_TASK_MESSAGE_NAME,
  type ConfirmAcceptedStep,
  type PiAgentSessionMessage,
  type MainModelTool,
} from "@agent-platform/pi-agent-session"
import type { ProductStore } from "../database/store.js"
import { DomainError } from "../errors.js"

export type PreparedAIModel = Readonly<{
  selection: ModelSelection
  generateObject<T>(input: Readonly<{
    prompt: string
    jsonSchema: Record<string, unknown>
    parse(value: unknown): T
    signal: AbortSignal
    onEvent(event: AIEvent): void
  }>): Promise<T>
}>

export type PreparedMainAIModel = Readonly<{
  selection: ModelSelection
  run(input: Readonly<{
    runId: string
    sessionId: string
    messages: readonly PiAgentSessionMessage[]
    activeTask: string
    tools?: readonly MainModelTool[]
    signal: AbortSignal
    onEvent(event: AIEvent): void
  }>): Promise<Readonly<{ outputText: string; confirmAcceptedStep?: ConfirmAcceptedStep }>>
  close(): Promise<void>
}>

export type AIModelResolver = () => Promise<PreparedAIModel>

export type AIModelProvider = Readonly<{
  selection(): ModelSelection
  prepare(selection: ModelSelection, signal: AbortSignal): Promise<PreparedAIModel>
  prepareMain(selection: ModelSelection, purpose?: "interview" | "exploration"): Promise<PreparedMainAIModel>
  strongerSelection?(selection: ModelSelection, signal: AbortSignal): Promise<ModelSelection | null>
}>

export function lazyAIModel(provider: AIModelProvider, signal: AbortSignal): AIModelResolver {
  let prepared: ReturnType<AIModelProvider["prepare"]> | undefined
  return () => {
    prepared ??= provider.prepare(provider.selection(), signal)
    return prepared
  }
}

export function createAIModelProvider(
  ai: AI,
  store: ProductStore,
  subjectId: string,
  options: Readonly<{ cwd: string; stateDir: string }>,
): AIModelProvider {
  const subject = ai.forSubject(subjectId)
  return {
    selection() {
      const selection = store.sharedModelSelection(subjectId)
      if (!selection) throw new DomainError("model_selection_required", "请先在模型设置中保存账号和模型。", 409)
      return selection
    },
    async prepare(selection, signal) {
      // WHY：一次业务运行只准备一次并复用 opaque handle，设置变化不能替换运行中的账号或模型。
      await requireAgentSessionSelection(ai, subjectId, selection)
      await subject.verifyCapabilities({ model: selection, require: ["structuredOutput"], signal })
      return Object.freeze({
        selection: Object.freeze({ ...selection }),
        async generateObject<T>(input: Readonly<{ prompt: string; jsonSchema: Record<string, unknown>; parse(value: unknown): T; signal: AbortSignal; onEvent(event: AIEvent): void }>) {
          const result = await subject.generateObject({ model: selection, requiredCapabilities: ["structuredOutput"], messages: [{ role: "user", content: input.prompt }],
            schema: { jsonSchema: input.jsonSchema, parse: input.parse }, signal: input.signal, onEvent: input.onEvent })
          return result.object
        },
      })
    },
    async prepareMain(selection, purpose = "interview") {
      selection = Object.freeze({ ...selection })
      await requireAgentSessionSelection(ai, subjectId, selection)
      const binding = await subject.bindAgentSession({ scope: "platform", ...selection })
      const adapter = createPiAgentSessionAdapter({
        agentId: purpose === "exploration" ? "browser-capture.task-exploration" : "browser-capture.requirement-interview",
        binding,
        stateDir: options.stateDir,
      })
      return Object.freeze({
        selection: Object.freeze({ ...selection }),
        async run(input) {
          const bridge = createPiAgentSessionAIEventBridge({
            invocationId: randomUUID(), binding, onEvent: input.onEvent,
          })
          await bridge.start()
          const result = await adapter.run({
            runId: input.runId,
            sessionId: input.sessionId,
            cwd: options.cwd,
            messages: [...input.messages, {
              role: "system",
              name: PI_AGENT_SESSION_ACTIVE_TASK_MESSAGE_NAME,
              content: [{ type: "text", text: input.activeTask }],
            }],
            tools: purpose === "exploration" ? input.tools ?? [] : [],
            settings: { reasoningEffort: selection.reasoningEffort },
            signal: input.signal,
            onEvent: bridge.onRuntimeEvent,
          })
          await bridge.settle(result)
          if (result.status === "cancelled") throw new DOMException("Aborted", "AbortError")
          if (result.status === "failed") throw new Error(`pi_agent_session_failed:${result.error.code}`)
          return {
            outputText: result.outputText ?? "",
            ...(result.confirmAcceptedStep ? { confirmAcceptedStep: result.confirmAcceptedStep } : {}),
          }
        },
        async close() { await adapter.close?.() },
      })
    },
    async strongerSelection(selection, signal) {
      signal.throwIfAborted()
      const account = (await subject.catalog()).find((item) => item.connectionId === selection.connectionId
        && item.supportedSurfaces.includes("agentSession"))
      if (!account) return null
      const effortOrder = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const
      const current = account.availableModels.find((item) => item.modelId === selection.modelId)
      if (current) {
        const strongerEffort = current.supportedReasoningEfforts
          .filter((effort) => effortOrder.indexOf(effort) > effortOrder.indexOf(selection.reasoningEffort)).at(-1)
        if (strongerEffort) return { ...selection, reasoningEffort: strongerEffort }
      }
      // TRADE-OFF：平台不硬编码供应商型号；只在目录明确给出更大的上下文、输出上限且支持推理时升级。
      const candidates = account.availableModels.filter((item) => item.modelId !== selection.modelId && item.reasoning
        && (!current || item.contextWindow >= current.contextWindow && item.maxTokens >= current.maxTokens)
        && (!current || item.contextWindow > current.contextWindow || item.maxTokens > current.maxTokens))
        .toSorted((left, right) => right.contextWindow - left.contextWindow || right.maxTokens - left.maxTokens)
      const target = candidates[0]
      if (!target) return null
      return { connectionId: selection.connectionId, modelId: target.modelId,
        reasoningEffort: target.supportedReasoningEfforts.at(-1) ?? target.defaultReasoningEffort }
    },
  }
}

export async function requireAgentSessionSelection(ai: AI, subjectId: string, selection: ModelSelection) {
  // WHY：UI 过滤只是交互提示；保存后的旧选择、账号撤销和直接 HTTP 请求仍须在服务端副作用前复核。
  const account = await ai.forSubject(subjectId).resolveAccount(selection.connectionId, { surface: "agentSession" })
  if (!account.availableModels.some((model) => model.modelId === selection.modelId)) {
    throw new Error("model_account_model_unavailable")
  }
  return account
}
