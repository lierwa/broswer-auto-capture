import { randomUUID } from "node:crypto"
import { parseAIEvent, type AIEvent, type ModelSelection } from "@agent-platform/ai-connect/client"
import type { AIModelProvider, PreparedAIModel, PreparedMainAIModel } from "../../src/ai/model.js"

export type TestRunEvent = Readonly<
  | { type: "turn_succeeded"; outputText: string }
  | { type: "interrupted" }
  | { type: "text_delta"; delta: string }
>
export type TestRunTurn = (prompt: string, schema: Record<string, unknown>, signal: AbortSignal) => AsyncIterable<TestRunEvent>
export const testSelection: ModelSelection = { connectionId: randomUUID(), modelId: "gpt-5.6-sol", reasoningEffort: "high" }

export function testAIModel(
  runTurn: TestRunTurn,
  selection: ModelSelection = testSelection,
  onAbort?: () => void,
  onConfirm?: () => void,
  onMainRun?: (input: Parameters<PreparedMainAIModel["run"]>[0]) => void,
): AIModelProvider {
  return {
    selection: () => selection,
    async prepare(model) {
      const prepared: PreparedAIModel = {
        selection: { ...model },
        async generateObject<T>(input: Readonly<{ prompt: string; jsonSchema: Record<string, unknown>; parse(value: unknown): T; signal: AbortSignal; onEvent(event: AIEvent): void }>) {
          const invocationId = `fixture-${randomUUID()}`
          const abort = () => onAbort?.()
          input.signal.addEventListener("abort", abort, { once: true })
          input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1, output: "object", model }))
          try {
            for await (const event of runTurn(input.prompt, input.jsonSchema, input.signal)) {
              input.signal.throwIfAborted()
              if (event.type === "turn_succeeded") {
                const object = input.parse(JSON.parse(event.outputText))
                input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: 1, createdAt: 2,
                  providerId: "fixture", modelId: model.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
                return object
              }
              if (event.type === "text_delta") input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: 1, createdAt: 2, text: event.delta }))
              if (event.type === "interrupted") throw new DOMException("Aborted", "AbortError")
            }
            throw new Error("model_output_missing")
          } catch (error) {
            const code = error instanceof Error && error.message === "model_account_model_unavailable"
              ? "model_account_model_unavailable" : "ai_generation_failed"
            input.onEvent(parseAIEvent({ type: "generation.failed", invocationId, sequence: 1, createdAt: 2,
              code, message: "fixture failed", retryable: false }))
            throw error
          } finally { input.signal.removeEventListener("abort", abort) }
        },
      }
      return prepared
    },
    async prepareMain(model) {
      const prepared: PreparedMainAIModel = {
        selection: { ...model },
        async run(input) {
          onMainRun?.(input)
          const invocationId = `fixture-${randomUUID()}`
          let sequence = 0, text = "", completedText: string | undefined
          const abort = () => onAbort?.()
          input.signal.addEventListener("abort", abort, { once: true })
          input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: sequence++, createdAt: 1, output: "text", model }))
          try {
            for await (const event of runTurn(input.activeTask, {}, input.signal)) {
              input.signal.throwIfAborted()
              if (event.type === "text_delta") {
                text += event.delta
                input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: sequence++, createdAt: 2, text: event.delta }))
              }
              if (event.type === "turn_succeeded") {
                if (completedText !== undefined) throw new Error("fixture_terminal_event_repeated")
                if (text && text !== event.outputText) throw new Error("fixture_stream_text_mismatch")
                completedText = event.outputText
              }
              if (event.type === "interrupted") throw new DOMException("Aborted", "AbortError")
            }
            if (completedText === undefined) throw new Error("model_output_missing")
            text = completedText
            // WHY：fixture 只有在上游 iterable 正常结束后才发布成功，保护“先 yield 成功、随后失败”不能提交的真实边界。
            if (sequence === 1) input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: sequence++, createdAt: 2, text }))
            input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: sequence++, createdAt: 3,
              providerId: "fixture", modelId: model.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
            return {
              outputText: text,
              confirmAcceptedStep: async () => { onConfirm?.(); return true },
            }
          } catch (error) {
            const code = error instanceof Error && error.message === "model_account_model_unavailable"
              ? "model_account_model_unavailable" : "ai_generation_failed"
            input.onEvent(parseAIEvent({ type: "generation.failed", invocationId, sequence: sequence++, createdAt: 3, code }))
            throw error
          } finally {
            input.signal.removeEventListener("abort", abort)
          }
        },
        async close() {},
      }
      return prepared
    },
  }
}
