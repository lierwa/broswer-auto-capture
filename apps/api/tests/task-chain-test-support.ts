import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type { JsonValue, TaskChainCommand, TaskDataContract } from "@browser-capture/contracts"
import type { AIModelProvider } from "../src/ai/model.js"
import type { ProductStore } from "../src/database/store.js"

const openContract: TaskDataContract = { id: "task-value", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {}, required: [], additionalProperties: true } }
const input = { source: "input" as const, path: [] }

export function confirmedDraft(store: ProductStore, taskId: string) {
  store.mutate(taskId, (state) => {
    state.revision = 1
    state.drafts.push({ version: 1, revision: 1, title: "通用确认任务",
      markdown: "# 通用确认任务\n\n目标页面：https://example.com/\n\n需要人工确认后返回结构化结果。", brief: null })
    state.confirmedVersion = 1
    state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
      messageId: null, questionId: null, draftVersion: 1, createdAt: "2026-09-12T01:00:00.000Z" })
  })
}

export function planCandidate() {
  const completion = { id: "done", description: "步骤输出已保存", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "perform", path: [] } } }
  return { summary: "执行一个可复用确认步骤", inputContract: openContract,
    outputContract: { ...openContract, id: "task-output" }, steps: [{ id: "perform", title: "完成确认", goal: "返回可观察结果",
    dependsOn: [], inputContract: openContract, outputContract: { ...openContract, id: "task-output" }, input,
    invocation: { mode: "once" as const }, completion: [completion], risks: ["需要人工确认"] }],
    output: completion.predicate.value, completion: [completion], authorizationScope: "仅限本次已确认任务" }
}

export function annotations() {
  return { inputBindings: [], repeatRegions: [], outputMappings: [{ source: "tool", outputPath: ["title"], eventId: "page", resultPath: ["title"] }],
    completion: [{ eventId: "page", resultPath: ["title"], description: "结果已显示" }],
    reuseBoundary: { description: "相同确认任务", assumptions: [], invalidationConditions: [] } }
}

export function taskQueuedModel(completeTask = true, repairDetail = false): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  const responses = [twoStepPlanCandidate(), taskAnnotations("page-one", ["paragraphs"]),
    taskAnnotations("page-two", ["title"]), taskAnnotations(repairDetail ? "page-two" : "page-one", repairDetail ? ["title"] : ["paragraphs"]),
    taskAnnotations("page-two", ["title"])]
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    const browser = input.tools!.find((tool) => tool.name === "browser")!
    const completeStep = input.tools!.find((tool) => tool.name === "complete_step")!
    const complete = input.tools!.find((tool) => tool.name === "complete")!
    await browser.execute("page-one", { command: { type: "page" } }, input.signal)
    const candidate = { key: "confirmed", label: "计划原始说明" }, second = { key: "second", label: "第二项说明" }
    await completeStep.execute("discover-result", { stepId: "discover", representativeInput: { value: "explore" },
      result: [candidate, second], provenance: [{ source: "inference", outputPath: [], eventIds: ["page-one"],
        instruction: "根据当前页面的确认内容形成带稳定键的候选。" }] }, input.signal)
    await browser.execute("page-two", { command: { type: "page" } }, input.signal)
    const representative = { stepId: "detail",
      representativeInput: { key: "confirmed", label: "模型改写的说明" },
      result: "Confirmed", provenance: [toolProvenance("page-two", ["title"])],
      aggregate: { result: ["Confirmed"], provenance: [toolProvenance("page-two", ["paragraphs"])] } }
    await assert.rejects(completeStep.execute("detail-batch", { ...representative, aggregate: {
      result: ["Confirmed", "Confirmed-2"], provenance: [{ source: "inference", outputPath: [], eventIds: ["page-two"],
        instruction: "把多个输入结果拼成数组。" }] } }, input.signal), /representative_aggregate_invalid/)
    await completeStep.execute("detail-result", representative, input.signal)
    if (completeTask) await complete.execute("task-result", representative.aggregate, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

function twoStepPlanCandidate() {
  const collectionContract: TaskDataContract = { id: "discovered-values", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" } },
      required: ["key", "label"], additionalProperties: false }, maxItems: 2 } }
  const itemContract: TaskDataContract = { id: "detail-input", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { key: { type: "string" }, label: { type: "string" } },
      required: ["key", "label"], additionalProperties: false } }
  const detailContract: TaskDataContract = { id: "detail-output", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "string" } }
  const taskOutputContract: TaskDataContract = { id: "task-output", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "array", items: { type: "string" }, maxItems: 2 } }
  const discoverDone = { id: "discover-done", description: "候选集合已得到", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "discover", path: [] } } }
  const detailDone = { id: "detail-done", description: "所有详情已得到", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "detail", path: [] } } }
  return { summary: "发现集合后逐项读取", inputContract: openContract,
    outputContract: taskOutputContract, steps: [
      { id: "discover", title: "发现输入", goal: "得到待处理集合", dependsOn: [], inputContract: openContract,
        outputContract: collectionContract, input, invocation: { mode: "once" as const }, completion: [discoverDone], risks: [] },
      { id: "detail", title: "逐项处理", goal: "处理集合中的每一项", dependsOn: ["discover"], inputContract: itemContract,
        outputContract: detailContract, input: { source: "variable" as const, name: "item", path: [] },
    invocation: { mode: "each" as const, collection: { source: "node" as const, nodeId: "discover", path: [] },
          itemVariable: "item", stableKeyPath: ["key"], maxItems: 2, onItemFailure: "stop" as const }, completion: [detailDone], risks: [] },
    ], output: { source: "node" as const, nodeId: "detail", path: [] }, completion: [detailDone],
    authorizationScope: "仅限本次已确认任务" }
}

function taskAnnotations(eventId: string, resultPath: (string | number)[]) {
  return { replayEventIds: [eventId], continueOnMissingEventIds: [], inputBindings: [], repeatRegions: [],
    completion: [{ eventId, resultPath, description: "结果已显示" }],
    reuseBoundary: { description: "相同结构页面", assumptions: [], invalidationConditions: [] } }
}

function toolProvenance(eventId: string, resultPath: (string | number)[]) {
  return { source: "tool" as const, outputPath: [], eventId, resultPath }
}
export function validation(chain: { id: string; version: number; digest: string }, mode: "sample" | "verification", value: JsonValue): TaskChainCommand {
  return { type: "validate_chain", requestId: randomUUID(), chain, mode, input: value }
}

export function queuedModel(responses: unknown[]): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    await input.tools![0]!.execute("help", { command: { type: "request_help", reason: "confirmation", prompt: "确认当前任务" } }, input.signal)
    await input.tools![0]!.execute("page", { command: { type: "page" } }, input.signal)
    await input.tools![1]!.execute("complete", { result: { title: "Confirmed" }, provenance: annotations().outputMappings }, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

export function preexecutionModel(order: string[]): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  const responses = [planCandidate(), (({ outputMappings: _, ...value }) => value)(annotations())]
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    order.push(order.includes("plan") ? "compile-chain" : "plan")
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    order.push("explore")
    assert.match(JSON.stringify(input.messages), /requirement/)
    assert.equal(input.tools!.some((tool) => tool.name === "complete_step"), true)
    const browser = input.tools!.find((tool) => tool.name === "browser")!
    const completeStep = input.tools!.find((tool) => tool.name === "complete_step")!
    const complete = input.tools!.find((tool) => tool.name === "complete")!
    await browser.execute("page", { command: { type: "page" } }, input.signal)
    const result = { result: { title: "Confirmed" }, provenance: annotations().outputMappings }
    await completeStep.execute("complete-step", { stepId: "perform", representativeInput: { value: "explore" }, ...result }, input.signal)
    await complete.execute("complete", result, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

export function escalationModel(): AIModelProvider {
  const connectionId = randomUUID(), weak = { connectionId, modelId: "weak-model", reasoningEffort: "medium" as const }
  const strong = { connectionId, modelId: "strong-model", reasoningEffort: "high" as const }
  const responses = [planCandidate(), (({ outputMappings: _, ...value }) => value)(annotations())]
  return { selection: () => weak, async strongerSelection() { return strong }, async prepare() { return { selection: weak,
    async generateObject(input) { const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value) } } },
  async prepareMain(selection) { return { selection, async close() {}, async run(input) {
    if (selection.modelId === "weak-model") return { outputText: "未提交" }
    const browser = input.tools!.find((tool) => tool.name === "browser")!
    const completeStep = input.tools!.find((tool) => tool.name === "complete_step")!
    const complete = input.tools!.find((tool) => tool.name === "complete")!
    await browser.execute("page", { command: { type: "page" } }, input.signal)
    const result = { result: { title: "Confirmed" }, provenance: annotations().outputMappings }
    await completeStep.execute("complete-step", { stepId: "perform", representativeInput: { value: "explore" }, ...result }, input.signal)
    await complete.execute("complete", result, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

export function repairLoopModel(order: string[]): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  const responses = [planCandidate(), (({ outputMappings: _, ...value }) => value)(annotations()),
    (({ outputMappings: _, ...value }) => value)(annotations())]
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    order.push(["plan", "compile-chain", "repair-chain"][3 - responses.length]!)
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    order.push("explore")
    const browser = input.tools!.find((tool) => tool.name === "browser")!
    const completeStep = input.tools!.find((tool) => tool.name === "complete_step")!
    const complete = input.tools!.find((tool) => tool.name === "complete")!
    await browser.execute("page", { command: { type: "page" } }, input.signal)
    const result = { result: { title: "Confirmed" }, provenance: annotations().outputMappings }
    await completeStep.execute("complete-step", { stepId: "perform", representativeInput: { value: "explore" }, ...result }, input.signal)
    await complete.execute("complete", result, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

export function successfulObservation() {
  return { capability: async () => ({ outcome: "success" as const, output: { title: "Confirmed",
    url: "https://example.com/", text: "Confirmed", truncated: false, observedAt: "2026-09-14T00:00:00.000Z",
    links: [], headings: [], paragraphs: [] } }) }
}

export async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("fixture_timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

export async function fakeBrowserExecutor(args: readonly string[]) {
  const value = args[1] === "session" ? args[2] === "start" ? { session_id: "abcd" }
    : { stopped: ["abcd"], failed: [], return_failures: [] }
    : args[1] === "tab" ? { tabs: [{ tab_id: 1, url: "https://example.com/", active: true, scope: "agent" }] }
      : args[1] === "request-help" ? { outcome: "continued" } : args[1] === "evaluate" ? { ok: true, tab_id: 1, value: { url: "https://example.com/", title: "Confirmed", links: [], headings: [], paragraphs: [] } } : args[1] === "observe" ? { tab_id: 1, text: '@e1 button "确认"', truncated: false }
        : { tab_id: 1 }
  return { stdout: JSON.stringify(value), exitCode: 0 }
}

export async function pageBrowserExecutor(args: readonly string[]) {
  if (args[1] === "evaluate") return { stdout: JSON.stringify({ ok: true, tab_id: 1,
    value: { url: "https://example.com/", title: "Confirmed", links: [], headings: [], paragraphs: ["Confirmed"] } }), exitCode: 0 }
  return fakeBrowserExecutor(args)
}
