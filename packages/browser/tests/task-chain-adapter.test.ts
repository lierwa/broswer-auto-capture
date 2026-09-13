import assert from "node:assert/strict"
import test from "node:test"
import {
  BrowserError, TaskChainBrowserAdapter, taskChainBrowserActions, type BrowserInspection,
  type TaskChainBrowserPort,
} from "../src/index.js"
import { CONTRACT_VERSION, requiredNodeOutcomes, type ChainNode, type TaskChain, type TaskCheckpoint } from "@browser-capture/contracts"

const nullContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
const observationContract = { id: "observation", version: 1, dialect: "bat-value-schema/v1" as const,
  schema: { type: "object" as const, properties: {
    url: { type: "string" as const }, text: { type: "string" as const }, truncated: { type: "boolean" as const }, tabId: { type: "string" as const },
  }, required: ["url", "text", "truncated", "tabId"], additionalProperties: false } }
const binding = { runId: "30000000-0000-4000-8000-000000000001", invocationId: "30000000-0000-4000-8000-000000000002",
  taskId: "30000000-0000-4000-8000-000000000003", authorizationId: "30000000-0000-4000-8000-000000000004",
  plan: { id: "30000000-0000-4000-8000-000000000005", version: 1, digest: "a".repeat(64) },
  chain: { id: "30000000-0000-4000-8000-000000000006", version: 1, digest: "b".repeat(64) }, inputDigest: "c".repeat(64) }
const consumed = { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }

class FakePort implements TaskChainBrowserPort {
  commands: unknown[] = []
  observations: BrowserInspection[] = []
  helpError: BrowserError | null = null
  current: BrowserInspection | null = null
  async command(command: unknown) {
    this.commands.push(structuredClone(command))
    const type = (command as { type?: string }).type
    if (type === "observe") this.current = this.observations.shift() ?? this.current
    if (type === "page") {
      this.current = this.observations.shift() ?? this.current
      return JSON.stringify({ url: this.current?.url, title: "Example Domain", text: this.current?.text,
        truncated: false, links: [{ url: "https://iana.org/domains/example", title: "Learn more" }],
        headings: [{ level: 1, text: "Example Domain" }], paragraphs: ["Documentation example."] })
    }
    if (type === "request_help" && this.helpError) throw this.helpError
    if (type === "tabs") return JSON.stringify([{ tabId: 7, url: "https://example.com/", active: true }])
    if (type === "tab_open") return JSON.stringify({ tabId: 8, url: "https://example.com/new", active: true })
    return null
  }
  state() { return this.current ? structuredClone(this.current) : null }
}

function inspection(text: string): BrowserInspection {
  return { sessionId: "abcd", tabId: 7, url: "https://example.com/page", text, truncated: false,
    observedAt: "2026-09-12T00:00:00.000Z" }
}
function browserNode(operation: Extract<ChainNode, { kind: "browser" }>["operation"], target?: Extract<ChainNode, { kind: "browser" }>["target"]): Extract<ChainNode, { kind: "browser" }> {
  return { id: "action", label: "action", kind: "browser", operation, arguments: {}, ...(target ? { target } : {}),
    timeoutMs: 2000, outcomes: [...requiredNodeOutcomes.browser], outputContract: nullContract, writes: [] }
}
function humanNode(): Extract<ChainNode, { kind: "human" }> {
  return { id: "human", label: "human", kind: "human", reason: "login", prompt: "请完成当前页面登录",
    resumeWhen: { operator: "equals", path: ["text"], expected: { source: "constant", value: "ready" } }, timeoutMs: 2000,
    outcomes: [...requiredNodeOutcomes.human], outputContract: observationContract, writes: [] }
}
function checkpoint(resumeWhen: TaskCheckpoint["resumeWhen"]): TaskCheckpoint {
  return { contractVersion: CONTRACT_VERSION, id: "30000000-0000-4000-8000-000000000007", binding, mode: "replay",
    sequence: 0, cursor: "human", resumeWhen, input: null, nodeOutputs: {}, variables: {}, loops: {}, invocations: [], outputs: {},
    artifacts: [], browser: { sessionId: "abcd", tabId: "7", url: "https://example.com/page",
      observationDigest: "d".repeat(64), observedAt: "2026-09-12T00:00:00.000Z" }, consumed,
    events: [], modelCalls: [], auditComplete: true, pendingEffect: null }
}

test("已满足恢复条件时只 fresh observe，不创建人工请求", async () => {
  const port = new FakePort(); port.observations.push(inspection("ready"))
  const result = await new TaskChainBrowserAdapter(port).human({ node: humanNode(), checkpoint: checkpoint(null), resuming: false,
    resumeCondition: { operator: "equals", path: ["text"], expected: "ready" }, signal: new AbortController().signal })
  assert.equal(result.outcome, "success")
  assert.deepEqual(port.commands, [{ type: "observe" }])
})

test("确有阻断时只请求一次人工；Done 后 fresh observe 决定结果", async () => {
  const port = new FakePort(); port.observations.push(inspection("login required"), inspection("ready"))
  const result = await new TaskChainBrowserAdapter(port).human({ node: humanNode(), checkpoint: checkpoint(null), resuming: false,
    resumeCondition: { operator: "equals", path: ["text"], expected: "ready" }, signal: new AbortController().signal })
  assert.equal(result.outcome, "success")
  assert.deepEqual(port.commands.map((command) => (command as { type: string }).type), ["observe", "request_help", "observe"])
  assert.deepEqual(port.commands[1], { type: "request_help", reason: "login", prompt: "请完成当前页面登录", timeoutMs: 2000 })
})

test("人工请求未完成返回可恢复 typed outcome，不在 adapter 内重试", async () => {
  const port = new FakePort(); port.observations.push(inspection("login required")); port.helpError = new BrowserError("manual_required")
  const result = await new TaskChainBrowserAdapter(port).human({ node: humanNode(), checkpoint: checkpoint(null), resuming: false,
    resumeCondition: { operator: "equals", path: ["text"], expected: "ready" }, signal: new AbortController().signal })
  assert.equal(result.outcome, "human_required")
  assert.equal(result.browser?.url, "https://example.com/page")
  assert.equal(port.commands.filter((command) => (command as { type: string }).type === "request_help").length, 1)
})

test("adapter 只映射 BrowserSkill 已支持命令；scroll 用受控按键，drag 明确阻断", async () => {
  const port = new FakePort(), adapter = new TaskChainBrowserAdapter(port), signal = new AbortController().signal
  const target = { kind: "locator" as const, strategy: "css" as const, value: { source: "constant" as const, value: "#choice" } }
  const select = browserNode("select", target)
  const selected = await adapter.browser({ node: select, arguments: { values: ["a", "b"] },
    target: { kind: "locator", strategy: "css", value: "#choice" }, signal })
  assert.equal(selected.outcome, "success")
  const clicked = await adapter.browser({ node: browserNode("click", { kind: "semantic", role: "button",
    name: { source: "constant", value: "保存" }, occurrence: { source: "constant", value: 1 } }), arguments: {},
    target: { kind: "semantic", role: "button", name: "保存", occurrence: 1 }, signal })
  assert.equal(clicked.outcome, "success")
  const scrolled = await adapter.browser({ node: browserNode("scroll"), arguments: { direction: "down", steps: 2 }, signal })
  assert.equal(scrolled.outcome, "success")
  const beforeDrag = port.commands.length
  const dragged = await adapter.browser({ node: browserNode("drag", target), arguments: {},
    target: { kind: "locator", strategy: "css", value: "#choice" }, signal })
  assert.equal(dragged.outcome, "blocked")
  assert.equal(dragged.reason, "capability_unsupported")
  assert.equal(port.commands.length, beforeDrag)
  assert.deepEqual(port.commands, [
    { type: "select", target: { selector: "#choice" }, values: ["a", "b"] },
    { type: "click", target: { role: "button", name: "保存", occurrence: 1 } },
    { type: "press", key: "PageDown" }, { type: "press", key: "PageDown" },
  ])
})

test("浏览器节点超时会取消底层命令并返回 typed timeout", async () => {
  const port: TaskChainBrowserPort = { state: () => null, command: async (_command, signal) => new Promise((_resolve, reject) => {
    const cancel = () => reject(new BrowserError("cancelled"))
    if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true })
  }) }
  const node = { ...browserNode("scroll"), timeoutMs: 10 }
  const result = await new TaskChainBrowserAdapter(port).browser({ node, arguments: { direction: "down", steps: 1 },
    signal: new AbortController().signal })
  assert.equal(result.outcome, "timeout")
  assert.equal(result.reason, "node_timeout")
})

test("外部访问失败携带通用分类、origin 与 HTTP 事实", async () => {
  const port: TaskChainBrowserPort = { state: () => null, command: async () => {
    throw new BrowserError("rate_limited", { origin: "https://example.com", observedOrigin: "https://example.com", httpStatus: 429 })
  } }
  const result = await new TaskChainBrowserAdapter(port).browser({ node: browserNode("navigate"),
    arguments: { url: "https://example.com/item", captureNetworkEvidence: true }, signal: new AbortController().signal })
  assert.equal(result.outcome, "blocked")
  assert.deepEqual(result.externalFailure, { category: "rate_limited", code: "rate_limited",
    origin: "https://example.com", observedOrigin: "https://example.com", httpStatus: 429, retryAt: null })
})

test("target 读取使用稳定 CSS，缺失目标拒绝且不回退整页", async () => {
  const port = new FakePort(), node: Extract<ChainNode, { kind: "observe" }> = {
    id: "target", label: "target", kind: "observe", scope: "target", target: {
      kind: "semantic", role: "button", name: { source: "constant", value: "提交" },
    }, stableWhen: { operator: "exists", path: [] }, timeoutMs: 1000,
    outcomes: [...requiredNodeOutcomes.observe], outputContract: observationContract, writes: [],
  }
  const result = await new TaskChainBrowserAdapter(port).observe({ node, signal: new AbortController().signal })
  assert.equal(result.outcome, "blocked")
  assert.equal(result.reason, "capability_unsupported")
  assert.equal(port.commands.length, 0)
  const read = await new TaskChainBrowserAdapter(port).observe({ node,
    target: { kind: "locator", strategy: "css", value: "table" }, signal: new AbortController().signal })
  assert.equal(read.outcome, "success")
  assert.deepEqual(port.commands, [{ type: "read", selector: "table" }])
})

test("整页观察复用 BrowserSkill page 并返回链接、标题和段落结构", async () => {
  const port = new FakePort(); port.observations.push(inspection("Example Domain"))
  const node: Extract<ChainNode, { kind: "observe" }> = { id: "page", label: "page", kind: "observe", scope: "page",
    stableWhen: { operator: "exists", path: ["title"] }, timeoutMs: 1000,
    outcomes: [...requiredNodeOutcomes.observe], outputContract: observationContract, writes: [] }
  const result = await new TaskChainBrowserAdapter(port).observe({ node, signal: new AbortController().signal })
  assert.equal(result.outcome, "success")
  assert.deepEqual((result.output as { headings: unknown }).headings, [{ level: 1, text: "Example Domain" }])
  assert.equal((result.output as { observedAt: string }).observedAt, "2026-09-12T00:00:00.000Z")
  assert.deepEqual(port.commands, [{ type: "page" }])
  assert.equal(result.browser?.url, "https://example.com/page")
})

test("恢复时 fresh observation 交回 runtime；无恢复条件则严格识别现场变化", async () => {
  const port = new FakePort(); port.observations.push(inspection("ready"), inspection("changed"))
  const adapter = new TaskChainBrowserAdapter(port), signal = new AbortController().signal
  const conditioned = await adapter.verifyResume(checkpoint(humanNode().resumeWhen), signal)
  assert.equal(conditioned.ok, true)
  assert.deepEqual(conditioned.observation, { url: "https://example.com/page", text: "ready", truncated: false, tabId: "7" })
  const strict = await adapter.verifyResume(checkpoint(null), signal)
  assert.equal(strict.ok, false)
  assert.equal(strict.reason, "browser_observation_changed")
})

test("授权动作由链路节点推导；wait 与未支持 drag 不扩成 BrowserSkill 命令", () => {
  const wait = browserNode("wait"), drag = browserNode("drag", {
    kind: "semantic", role: "button", name: { source: "constant", value: "拖动" },
  })
  const observe: ChainNode = { id: "observe", label: "observe", kind: "observe", scope: "page",
    stableWhen: { operator: "exists", path: [] }, timeoutMs: 1000, outcomes: [...requiredNodeOutcomes.observe], outputContract: observationContract, writes: [] }
  const human = humanNode()
  const chain = { nodes: [wait, drag, observe, human] } as TaskChain
  assert.deepEqual(taskChainBrowserActions(chain), ["page", "observe", "request_help"])
})
