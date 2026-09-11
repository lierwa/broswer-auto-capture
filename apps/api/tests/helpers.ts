import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { loadInterviewSkill } from "../src/interview/protocol.js"
import { testAIModel, type TestRunEvent, type TestRunTurn } from "./fixtures/ai-model.js"

export const question = { prompt: "希望收集多少评价？", options: [{ label: "前 20 条", description: "范围较小", recommended: true }, { label: "前 100 条", description: "覆盖更多", recommended: false }] }
export const brief = {
  goal: "收集商品与评价", scope: "任务指定的商品范围",
  sourceStrategy: { mode: "discover" as const, scope: "系统查找并核验正式来源", providedUrls: [] },
  deliverables: [{ entity: "商品", fields: ["商品链接", "参数", "评价"], coverage: "目标范围全部商品", limit: "每商品前20条评价，不足记录实际数量" }],
  discoveryTasks: [{ objective: "查找目标入口及商品枚举依据", expectedOutput: "候选入口与商品链接集合", acceptance: "核验来源归属、分类与枚举覆盖" }],
  completionCriteria: ["每条结果保留来源链接，报告覆盖和缺口"], constraints: ["登录、验证码转人工"], proposedDefaults: [],
}
export const draft = { title: "商品与评价", brief }
export const audit = { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" } as const
export const succeeded = (output: unknown): TestRunEvent => ({ type: "turn_succeeded", outputText: JSON.stringify(output) })
export const authoredInterview = (output: {
  assistantText: string
  question: { prompt: string; options: Array<{ label: string; description: string; recommended: boolean }> } | null
  draft: unknown
}): TestRunEvent => ({ type: "turn_succeeded", outputText: [
  output.assistantText,
  output.question ? `<authoring><question-panel mode="${output.question.options.length ? "choice" : "free_form"}" prompt="${attribute(output.question.prompt)}">${output.question.options.map((option, index) =>
    `<question-option slot="${index + 1}" label="${attribute(option.label)}"${option.recommended ? ' recommended="true"' : ""}>${text(option.description)}</question-option>`).join("")}</question-panel></authoring>` : "",
  output.draft ? authoredDraft(output.draft) : "",
].filter(Boolean).join("\n\n") })
function authoredDraft(value: unknown) {
  if (isGenericDraft(value)) {
    return `<authoring><interview-markdown title="${attribute(value.title)}">${value.markdown}</interview-markdown></authoring>`
  }
  return `<authoring><interview-result>${JSON.stringify({ draft: value })}</interview-result></authoring>`
}
function isGenericDraft(value: unknown): value is { title: string; markdown: string; brief: null } {
  return typeof value === "object" && value !== null && "title" in value && typeof value.title === "string"
    && "markdown" in value && typeof value.markdown === "string" && "brief" in value && value.brief === null
}
function attribute(value: string) { return text(value).replaceAll('"', "&quot;") }
function text(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") }
export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url))
type TestClient = {
  readAccount(): Promise<{ loggedIn: true; type: "chatgpt" }>
  close(): Promise<void>
  runTurn: TestRunTurn
  onConfirm?(): void
}
export function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done }); return { promise, resolve } }
export async function fixture(run: (value: Awaited<ReturnType<typeof openFixture>>) => Promise<void>) {
  const value = await openFixture()
  try { await run(value) }
  finally { value.unblock(); await value.coordinator.close(); await value.store.close(); await rm(value.directory, { recursive: true, force: true }) }
}
export async function openFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-api-test-"))
  const store = await ProductStore.open(directory)
  const prompts: string[] = [], mainRuns: Array<{ sessionId: string; messages: unknown }> = []
  const gates: Array<ReturnType<typeof deferred>> = []
  const unblock = () => { for (const gate of gates) gate.resolve() }
  const client: TestClient = { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => { unblock() },
    async *runTurn(prompt) { prompts.push(prompt); yield authoredInterview({ assistantText: "范围已整理。", question: null, draft }) },
  }
  const coordinator = new InterviewCoordinator(store, testAIModel((prompt, schema, signal) => client.runTurn(prompt, schema, signal), undefined,
    () => { void client.close() }, () => client.onConfirm?.(),
    (input) => mainRuns.push({ sessionId: input.sessionId, messages: structuredClone(input.messages) })), loadInterviewSkill(projectRoot))
  const create = () => coordinator.taskAction({ type: "create", requestId: randomUUID() })
  const send = (id: string, text = "收集商品和评价") => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), text, expectedRevision: store.snapshot(id).revision })
  return { store, coordinator, directory, client, prompts, mainRuns, create, send, unblock,
    gate: () => { const value = deferred(); gates.push(value); return value } }
}
