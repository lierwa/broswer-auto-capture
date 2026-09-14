import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { BrowserError, type BrowserCommand, type BrowserGrant } from "@browser-capture/browser"
import type { AIEvent } from "@browser-capture/contracts/ai"
import type { TaskDataContract } from "@browser-capture/contracts"
import type { PreparedMainAIModel } from "../src/ai/model.js"
import type { BrowserService } from "../src/browser/service.js"
import { runBusinessPreexecution, type BusinessPreexecutionRequest } from "../src/task-chain/preexecution-runtime.js"
import { testSelection } from "./fixtures/ai-model.js"

const outputContract: TaskDataContract = { id: "repository-summary", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: { repository: { type: "string", minLength: 1 }, stars: { type: "string", minLength: 1 },
    language: { type: "string", minLength: 1 }, tags: { type: "array", items: { type: "string" }, maxItems: 2 } },
  required: ["repository", "stars", "language"], additionalProperties: false } }
const startUrl = "https://example.com/project"
const budget = { maxTransitions: 20, maxBrowserCommands: 12, maxActiveMs: 30_000,
  maxLlmCalls: 3, maxInvocations: 1, maxDepth: 2 }

test("business-only loop 在同一 Pi adapter/session 修正输出并由 finish 验收", async () => {
  const browser = browserHarness(), sessions: string[] = [], runIds: string[] = []
  let runs = 0, closed = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() { closed++ }, async run(input) {
    runs++; sessions.push(input.sessionId); runIds.push(input.runId)
    assert.deepEqual(input.tools?.map((tool) => tool.name), ["browser", "record_output", "finish"])
    assert.doesNotMatch(input.activeTask, /complete_step|provenance|节点图/)
    const browserTool = input.tools![0]!, record = input.tools![1]!, finish = input.tools![2]!
    if (runs === 1) {
      await browserTool.execute("page-1", { command: { type: "page" } }, input.signal)
      const invalid = result(await record.execute("write-bad", { op: "set", path: ["stars"], value: 123 }, input.signal))
      assert.equal(invalid.ok, false); assert.equal(invalid.code, "output_validation_failed")
      assert.deepEqual(invalid.issues[0]!.path, ["stars"]); assert.equal(invalid.issues[0]!.expected, "string")
      assert.equal(invalid.issues[0]!.received, "integer"); assert.ok(invalid.example)
      assert.deepEqual(new Set(invalid.pendingPaths), new Set(["repository", "stars", "language"]))
      const sparse = result(await record.execute("write-sparse", { op: "set", path: ["tags", 1], value: "agent" }, input.signal))
      assert.equal(sparse.ok, false); assert.match(sparse.issues[0]!.message, /output_array_sparse_write/)
      assert.equal(result(await record.execute("append-tag", { op: "append", path: ["tags"], items: ["browser"] })).ok, true)
      assert.equal(result(await record.execute("write-name", { op: "set", path: ["repository"], value: "example/project" })).ok, true)
      assert.equal(result(await record.execute("write-stars", { op: "set", path: ["stars"], value: "12.3k" })).ok, true)
      const missing = result(await finish.execute("finish-missing", {}, input.signal))
      assert.equal(missing.ok, false); assert.deepEqual(missing.issues[0]!.path, ["language"])
      return { outputText: "还缺字段" }
    }
    assert.match(JSON.stringify(input.messages), /language/)
    assert.equal(result(await record.execute("write-language", { op: "set", path: ["language"], value: "TypeScript" })).ok, true)
    assert.deepEqual(result(await finish.execute("finish-ok", {}, input.signal)), { ok: true, accepted: true, pendingPaths: [] })
    return { outputText: "完成" }
  } }
  const artifact = await run(model, browser)
  assert.equal(artifact.status, "completed"); assert.equal(artifact.finishAccepted, true); assert.equal(artifact.closed, true)
  assert.deepEqual(artifact.output, { repository: "example/project", stars: "12.3k", language: "TypeScript", tags: ["browser"] })
  assert.equal(artifact.outputWrites.length, 4)
  assert.equal(artifact.outputWrites.some((write) => ["write-bad", "write-sparse"].includes(write.callId)), false)
  assert.deepEqual(sessions, [sessions[0], sessions[0]]); assert.notEqual(runIds[0], runIds[1])
  assert.deepEqual(artifact.modelRuns.map((item) => item.sessionId), sessions)
  assert.equal(browser.metrics.starts, 1); assert.equal(browser.metrics.stops, 1); assert.equal(closed, 1)
})

test("execute 前的 Pi tool failure 进入下一次同 session 结构化 continuation", async () => {
  const browser = browserHarness(), sessions: string[] = []
  let runs = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() {}, async run(input) {
    runs++; sessions.push(input.sessionId)
    if (runs === 1) {
      input.onEvent(toolFailureEvent("bad-record", "record_output", "参数缺少 op"))
      return { outputText: "工具参数被拒绝" }
    }
    const message = JSON.stringify(input.messages)
    assert.match(message, /tool_execution_failed/); assert.match(message, /参数缺少 op/)
    await input.tools![1]!.execute("write-root", { op: "set", path: [], value: {
      repository: "example/project", stars: "1", language: "TypeScript" } }, input.signal)
    await input.tools![2]!.execute("finish", {}, input.signal)
    return { outputText: "完成" }
  } }
  const artifact = await run(model, browser)
  assert.equal(artifact.status, "completed"); assert.equal(artifact.feedback[0]?.code, "tool_execution_failed")
  assert.deepEqual(sessions, [sessions[0], sessions[0]])
})

test("同一 Pi turn 的并行浏览器调用在唯一 BrowserSession 中按调用顺序串行", async () => {
  let active = 0, maxActive = 0
  const browser = browserHarness(async (command) => {
    active++; maxActive = Math.max(maxActive, active)
    try {
      if (active > 1) throw new BrowserError("permission_denied")
      await new Promise((resolve) => setTimeout(resolve, 5))
      return command.type === "read" ? JSON.stringify({ url: startUrl, matches: [], truncated: false }) : null
    } finally { active-- }
  })
  const model: PreparedMainAIModel = { selection: testSelection, async close() {}, async run(input) {
    const tool = input.tools![0]!
    await Promise.all([
      tool.execute("read-title", { command: { type: "read", selector: "h1", maxItems: 1 } }, input.signal),
      tool.execute("read-summary", { command: { type: "read", selector: "main", maxItems: 1 } }, input.signal),
    ])
    await input.tools![1]!.execute("write", { op: "set", path: [], value: {
      repository: "example/project", stars: "1", language: "TypeScript" } }, input.signal)
    await input.tools![2]!.execute("finish", {}, input.signal)
    return { outputText: "完成" }
  } }
  const artifact = await run(model, browser)
  assert.equal(artifact.status, "completed"); assert.equal(maxActive, 1)
  assert.deepEqual(artifact.browserEvents.slice(-2).map((event) => event.id), ["read-title", "read-summary"])
  assert.equal(artifact.feedback.length, 0)
})

test("外部访问阻断保持独立终态且不消耗 continuation", async () => {
  const browser = browserHarness((command) => {
    if (command.type === "page") throw new BrowserError("access_denied")
    return null
  })
  let runs = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() {}, async run(input) {
    runs++
    const blocked = result(await input.tools![0]!.execute("blocked", { command: { type: "page" } }, input.signal))
    assert.equal(blocked.ok, false); assert.equal(blocked.code, "access_denied"); assert.equal(blocked.retryable, false)
    return { outputText: "来源拒绝访问" }
  } }
  const artifact = await run(model, browser)
  assert.equal(runs, 1); assert.equal(artifact.status, "failed"); assert.equal(artifact.finishAccepted, false)
  assert.equal(artifact.feedback.at(-1)?.category, "external"); assert.equal(artifact.feedback.at(-1)?.code, "access_denied")
})

test("取消直接形成 terminal 审计并关闭同一个浏览器 session", async () => {
  const browser = browserHarness(), controller = new AbortController()
  let closed = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() { closed++ }, async run(input) {
    controller.abort()
    await input.tools![0]!.execute("cancelled", { command: { type: "page" } }, input.signal)
    return { outputText: "unreachable" }
  } }
  const artifact = await run(model, browser, controller.signal)
  assert.equal(artifact.status, "failed"); assert.equal(artifact.feedback.at(-1)?.code, "cancelled")
  assert.equal(artifact.feedback.at(-1)?.category, "terminal")
  assert.equal(artifact.modelRuns[0]?.status, "cancelled"); assert.equal(browser.metrics.stops, 1); assert.equal(closed, 1)
})

test("五次连续可修复失败触发明确上限且无无效 revision", async () => {
  const browser = browserHarness()
  let runs = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() {}, async run(input) {
    runs++
    const record = input.tools![1]!
    for (let index = 0; index < 5; index++) {
      const failure = result(await record.execute(`bad-${index}`, { op: "set", path: ["stars"], value: index }, input.signal))
      assert.equal(failure.ok, false)
    }
    return { outputText: "达到上限" }
  } }
  const artifact = await run(model, browser)
  assert.equal(runs, 1); assert.equal(artifact.status, "failed"); assert.equal(artifact.outputWrites.length, 0)
  assert.equal(artifact.feedback.at(-1)?.code, "repairable_failure_limit")
  assert.equal(artifact.feedback.filter((item) => item.category === "repairable").length, 5)
})

function browserHarness(handle: (command: BrowserCommand) => string | null | Promise<string | null> = (command) => command.type === "page"
  ? JSON.stringify({ url: startUrl, title: "Project", text: "Project 12.3k TypeScript", truncated: false,
    links: [], headings: ["Project"], paragraphs: ["12.3k", "TypeScript"] }) : null) {
  const inspection = { sessionId: "abcd", tabId: 1, url: startUrl, text: "Project 12.3k TypeScript", truncated: false,
    observedAt: "2026-09-15T00:00:00.000Z" }
  const state = { starts: 0, stops: 0, status: "succeeded" }
  const browser = { async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>) {
    state.starts++
    try {
      return await work({ async command(command: BrowserCommand) { return handle(command) }, state: () => inspection,
        beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }, new AbortController().signal)
    } catch (error) { state.status = "failed"; throw error }
    finally { state.stops++ }
  }, async snapshot() { return { cleanupRequired: false, record: { status: state.status } } } } as unknown as BrowserService
  return { service: browser, metrics: state }
}

async function run(model: PreparedMainAIModel, browser: ReturnType<typeof browserHarness>, signal = new AbortController().signal) {
  const request: BusinessPreexecutionRequest = { taskId: randomUUID(), authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, goal: "打开公开项目页并返回仓库名、可见 star 数和主要语言。", startUrl,
    outputContract, budget, signal }
  return runBusinessPreexecution(request, { browser: browser.service, model, onEvent() {}, registerGrant() {}, releaseGrant() {} })
}

type ToolResponse = { ok: true; accepted?: boolean; pendingPaths: string[] }
  | { ok: false; code: string; retryable: boolean; issues: Array<{ path: (string | number)[];
    expected: string; received: string; message: string }>; pendingPaths: string[]; example: unknown }

function result(value: { content: readonly { type: "text"; text: string }[] }): ToolResponse {
  return JSON.parse(value.content[0]!.text) as ToolResponse
}

function toolFailureEvent(callId: string, toolName: string, message: string): AIEvent {
  return { type: "extension", namespace: "agent-platform.pi-agent-session", name: "tool.execution.failed", version: 1,
    invocationId: "fixture-invocation", sequence: 0, createdAt: 1,
    payload: { type: "tool.execution.failed", callId, toolName,
      error: { code: "invalid-request", message, retryable: false } } }
}
