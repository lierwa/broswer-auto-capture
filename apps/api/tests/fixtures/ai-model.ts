import { randomUUID } from "node:crypto"
import { parseAIEvent, type AIEvent, type ModelSelection } from "@agent-platform/ai-connect/client"
import type { AIModelProvider, PreparedAIModel } from "../../src/ai/model.js"

export type TestRunEvent = Readonly<
  | { type: "turn_succeeded"; outputText: string }
  | { type: "interrupted" }
  | { type: "commentary_delta"; delta: string }
>
export type TestRunTurn = (prompt: string, schema: Record<string, unknown>, signal: AbortSignal) => AsyncIterable<TestRunEvent>
export const testSelection: ModelSelection = { connectionId: randomUUID(), modelId: "gpt-5.6-sol", reasoningEffort: "high" }

export function testAIModel(runTurn: TestRunTurn, selection: ModelSelection = testSelection, onAbort?: () => void): AIModelProvider {
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
              if (event.type === "interrupted") throw new DOMException("Aborted", "AbortError")
            }
            throw new Error("model_output_missing")
          } catch (error) {
            input.onEvent(parseAIEvent({ type: "generation.failed", invocationId, sequence: 1, createdAt: 2,
              code: input.signal.aborted ? "aborted" : "fixture_failed", message: "fixture failed", retryable: false }))
            throw error
          } finally { input.signal.removeEventListener("abort", abort) }
        },
      }
      return prepared
    },
  }
}
