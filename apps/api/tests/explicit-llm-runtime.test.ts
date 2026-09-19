import assert from "node:assert/strict"
import test from "node:test"
import { createAIModelProvider } from "../src/ai/model.js"
import { runtimeOutputEnvelope } from "../src/task-chain/runtime-host.js"
import { materializeExplicitLlmNode, systemPromptForSemanticOperation } from "../src/upstream-browser/hybrid-v2.js"

const selection = { connectionId: "55000000-0000-4000-8000-000000000001", modelId: "fixture-model", reasoningEffort: "low" }

test("显式 LLM provider 收到固定 system message 与唯一 JSON user message", async () => {
  const calls: any[] = []
  const subject = {
    resolveAccount: async () => ({ availableModels: [{ modelId: selection.modelId }] }),
    verifyCapabilities: async () => undefined,
    generateObject: async (input: any) => { calls.push(input); return { object: input.schema.parse({ result: "product" }) } },
  }
  const ai = { forSubject: () => subject }
  const store = { sharedModelSelection: () => selection }
  const provider = createAIModelProvider(ai as any, store as any, "subject", { cwd: ".", stateDir: "." })
  const prepared = await provider.prepare(selection as any, new AbortController().signal)
  const envelope = runtimeOutputEnvelope({ type: "string", enum: ["product", "service"] })
  const value = await prepared.generateRuntimeObject!({ systemPrompt: "FIXED", userInput: { text: "dynamic" },
    jsonSchema: envelope.jsonSchema, parse: envelope.parse, signal: new AbortController().signal, onEvent: () => {} })
  assert.equal(value, "product")
  assert.equal(calls[0].system, "FIXED")
  assert.deepEqual(calls[0].messages, [{ role: "user", content: JSON.stringify({ text: "dynamic" }) }])
  assert.equal(calls[0].messages.length, 1)
  assert.equal("tools" in calls[0], false)
})

test("LLM envelope 严格只有 result，缺失、额外字段和 schema 不符分别失败", () => {
  const envelope = runtimeOutputEnvelope({ type: "string", enum: ["product", "service"] })
  assert.equal(envelope.parse({ result: "product" }), "product")
  assert.throws(() => envelope.parse({ value: "product" }), /llm_output_shape_invalid/)
  assert.throws(() => envelope.parse({ result: "product", confidence: 1 }), /llm_output_shape_invalid/)
  assert.throws(() => envelope.parse({ result: "other" }), /llm_result_invalid/)
})

test("只有已确认 semantic_operation 可物化，systemPrompt 不绑定运行输入", () => {
  const operation = { id: "classify", clauseRefs: ["clause-1"], purpose: "classify" as const,
    instruction: "判断描述的类别。", inputDescription: "一个包含 description 的 JSON 对象。",
    resultSchema: { type: "string" as const, enum: ["product", "service"] }, candidateIds: ["product", "service"] }
  const annotation = { kind: "semantic_operation" as const, operationId: operation.id, inputFieldRefs: ["description"],
    segmentEvidenceRefs: [{ ref: "fact", digest: "a".repeat(64) }] }
  const node = materializeExplicitLlmNode({ id: "semantic", label: "semantic", operation, annotation,
    value: { source: "input", path: [] }, model: "fixture", timeoutMs: 1_000 })
  assert.equal(node.systemPrompt, systemPromptForSemanticOperation(operation))
  assert.equal(node.systemPrompt.includes("dynamic-input"), false)
  assert.throws(() => materializeExplicitLlmNode({ id: "semantic", label: "semantic", operation,
    annotation: { ...annotation, operationId: "undeclared" }, value: { source: "input", path: [] },
    model: "fixture", timeoutMs: 1_000 }), /explicit_llm_declaration_missing/)
})
