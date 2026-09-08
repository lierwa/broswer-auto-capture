import type { AI, AIEvent, ModelSelection } from "@agent-platform/ai-connect/server"
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

export type AIModelResolver = () => Promise<PreparedAIModel>

export type AIModelProvider = Readonly<{
  selection(): ModelSelection
  prepare(selection: ModelSelection, signal: AbortSignal): Promise<PreparedAIModel>
}>

export function lazyAIModel(provider: AIModelProvider, signal: AbortSignal): AIModelResolver {
  let prepared: ReturnType<AIModelProvider["prepare"]> | undefined
  return () => {
    prepared ??= provider.prepare(provider.selection(), signal)
    return prepared
  }
}

export function createAIModelProvider(ai: AI, store: ProductStore, subjectId: string): AIModelProvider {
  const subject = ai.forSubject(subjectId)
  return {
    selection() {
      const selection = store.sharedModelSelection(subjectId)
      if (!selection) throw new DomainError("model_selection_required", "请先在模型设置中保存账号和模型。", 409)
      return selection
    },
    async prepare(selection, signal) {
      // WHY：一次业务运行只准备一次并复用 opaque handle，设置变化不能替换运行中的账号或模型。
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
  }
}
