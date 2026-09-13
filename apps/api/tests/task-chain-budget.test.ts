import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, requiredNodeOutcomes, taskChainSchema, type JsonValue, type TaskBudget, type TaskChain,
  type TaskConsumption, type TaskRun, type TaskRunRequest } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid, type RuntimeControl } from "@browser-capture/runtime"
import { BrowserError, type BrowserGrant } from "@browser-capture/browser"
import { TaskBudgetLedger } from "../src/task-chain/budget-ledger.js"
import { opensAccessCircuit, TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import type { TaskContractRepository } from "../src/task-chain/repository.js"
import type { BrowserService } from "../src/browser/service.js"
import type { AIModelProvider, PreparedMainAIModel } from "../src/ai/model.js"

const budget: TaskBudget = { maxTransitions: 3, maxBrowserCommands: 2, maxActiveMs: 10_000,
  maxLlmCalls: 1, maxInvocations: 2, maxDepth: 2 }
const resumeBudget: TaskBudget = { ...budget, maxTransitions: 20, maxInvocations: 5, maxDepth: 3 }
const empty = (): TaskConsumption => ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })

test("步骤预算与计划总预算按实际消费原子扣减", () => {
  let persisted: TaskConsumption | null = null
  const ledger = new TaskBudgetLedger(budget, empty(), new Map([["step", { budget, consumed: empty() }]]),
    (_scope, snapshot) => { persisted = snapshot.total })
  ledger.account("step", { transitions: 2, invocations: 1 })
  ledger.account("step", { transitions: 1 })
  assert.deepEqual(persisted, { ...empty(), transitions: 3, invocations: 1 })
  assert.throws(() => ledger.account("step", { transitions: 1 }), /预算已用尽/)
  ledger.account("step", { llmCalls: 1 })
  ledger.account("step", { llmCalls: -1 }, "settle")
  assert.equal(ledger.remaining("step").maxLlmCalls, 1)
})

test("浏览器授权包含固定 invoke 子链的能力与来源", async () => {
  const taskId = "generic-task", child = fakeChain(taskId, "child", [{ kind: "browser", operation: "navigate",
    arguments: { url: { source: "constant", value: "https://nested.example/start" } } }])
  const root = fakeChain(taskId, "root", [{ kind: "invoke",
    chain: { id: child.id, version: child.version, digest: executableChainDigest(child) } }])
  const captured: { value?: BrowserGrant } = {}
  const repository = { chain: (_taskId: string, id: string, version: number, digest?: string) => {
    assert.equal(id, child.id); assert.equal(version, child.version); assert.equal(digest, executableChainDigest(child)); return child
  } } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run(grant: BrowserGrant,
    work: (session: object, signal: AbortSignal) => Promise<unknown>) {
    captured.value = grant
    const session = { command: async () => null, state: () => null, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
    return work(session, new AbortController().signal)
  } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, browser, ai)
  await host.group({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [root], input: { start: "https://root.example/" }, signal: new AbortController().signal,
    budget, consumed: empty(), scopeConsumption: { root: empty() } }, async () => undefined)
  assert.deepEqual(captured.value?.actions, ["navigate"])
  assert.deepEqual(new Set(captured.value?.allowedOrigins), new Set(["https://root.example", "https://nested.example"]))
})

test("代表路径探索把模型等待与步骤浏览器活动预算分开", async () => {
  const taskId = "exploration-budget-task", stepTimeouts: number[] = []
  let capturedGrant: BrowserGrant | undefined
  const inspection = { sessionId: "abcd", tabId: 1, url: "about:blank", text: "", truncated: false,
    observedAt: "2026-09-12T00:00:00.000Z" }
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "completed" } } }, async run(grant: BrowserGrant,
    work: (session: object, signal: AbortSignal) => Promise<unknown>) {
    capturedGrant = grant
    const session = { command: async () => null, state: () => inspection,
      beginStep: (_commands: number, timeoutMs: number) => { stepTimeouts.push(timeoutMs) },
      activeElapsedMs: () => 40_000, stepElapsedMs: () => 0 }
    return work(session, new AbortController().signal)
  } } as unknown as BrowserService
  const repository = {} as TaskContractRepository
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) { await input.tools![1]!.execute("complete", { result: null,
      provenance: [{ source: "tool", outputPath: [], eventId: "initial", resultPath: [] }] });
      return { outputText: "代表路径已确认" } }, async close() {} }
  const host = new TaskRuntimeHost(repository, browser, ai)
  const trace = await host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, outputContract: { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } },
    budget, representativeInput: { url: "https://example.com/" }, context: {},
    signal: new AbortController().signal }, model, () => {})
  assert.equal(trace.calls, 0) // 替身未发布 generation.completed，不制造模型调用数。
  assert.ok(capturedGrant!.timeoutMs > budget.maxActiveMs)
  assert.deepEqual(stepTimeouts, [budget.maxActiveMs])
})

test("代表路径已有浏览器失败时不覆盖成业务结果缺失", async () => {
  const taskId = "exploration-browser-failure"
  let commands = 0, capturedError: string | null = null
  const inspection = { sessionId: "abcd", tabId: 1, url: "https://example.com/", text: "", truncated: false,
    observedAt: "2026-09-13T00:00:00.000Z" }
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "failed" } } },
    async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>) {
      const session = { async command() { commands++; if (commands > 1) throw new BrowserError("origin_denied"); return null },
        state: () => inspection, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
      return work(session, new AbortController().signal)
    } } as unknown as BrowserService
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) {
      await assert.rejects(input.tools![0]!.execute("blocked", { command: { type: "page" } }), /origin_denied/)
      await assert.rejects(input.tools![0]!.execute("blocked-again", { command: { type: "page" } }), /origin_denied/)
      return { outputText: "页面受阻" }
    }, async close() {} }
  const host = new TaskRuntimeHost({} as TaskContractRepository, browser,
    { selection() { throw new Error("unused") } } as unknown as AIModelProvider)
  await assert.rejects(host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, outputContract: { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } },
    budget, representativeInput: { url: "https://example.com/" }, context: {}, signal: new AbortController().signal,
    onTrace(trace) { capturedError = trace.events.at(-1)?.error ?? null } }, model, () => {}),
  (error) => error instanceof BrowserError && error.code === "origin_denied" && error.message === "exploration_browser_failed:origin_denied")
  assert.equal(capturedError, "origin_denied")
  assert.equal(commands, 2) // initial observe + first failed command；熔断后的第二次调用没有到达 BrowserSession。
})

test("访问熔断后只放行人工等待，Done 后在同一探索 fresh observe", async () => {
  const taskId = "exploration-human-wait", commands: string[] = [], waits: string[] = []
  const inspection = { sessionId: "abcd", tabId: 1, url: "https://verification.example/", text: "需要验证",
    truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "succeeded" } } },
    async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>, _signal?: AbortSignal,
      onHelp?: (state: { id: string; reason: "access"; status: "waiting" | "completed"; prompt: string;
        origin: string; requestedAt: string; resolvedAt: string | null }) => void) {
      const session = { async command(value: { type: string }) {
        commands.push(value.type)
        if (value.type === "page") throw new BrowserError("origin_denied")
        if (value.type === "request_help") {
          const requestedAt = new Date().toISOString(), id = randomUUID()
          onHelp?.({ id, reason: "access", status: "waiting", prompt: "请完成验证", origin: inspection.url,
            requestedAt, resolvedAt: null })
          onHelp?.({ id, reason: "access", status: "completed", prompt: "请完成验证", origin: inspection.url,
            requestedAt, resolvedAt: new Date().toISOString() })
        }
        return null
      }, state: () => inspection, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
      return work(session, new AbortController().signal)
    } } as unknown as BrowserService
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) {
      await assert.rejects(input.tools![0]!.execute("blocked", { command: { type: "page" } }), /origin_denied/)
      await input.tools![0]!.execute("help", { command: { type: "request_help", reason: "access", prompt: "请完成验证" } })
      await input.tools![1]!.execute("complete", { result: null,
        provenance: [{ source: "tool", outputPath: [], eventId: "initial", resultPath: [] }] })
      return { outputText: "已恢复" }
    }, async close() {} }
  const host = new TaskRuntimeHost({} as TaskContractRepository, browser,
    { selection() { throw new Error("unused") } } as unknown as AIModelProvider)
  const trace = await host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    outputContract: { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } },
    budget: { ...budget, maxBrowserCommands: 6 }, representativeInput: { url: "https://example.com/" }, context: {},
    signal: new AbortController().signal, onHumanWait: (state) => { waits.push(state.status) } }, model, () => {})
  assert.equal(trace.result?.result, null)
  assert.deepEqual(waits, ["waiting", "completed"])
  assert.deepEqual(commands, ["observe", "page", "request_help", "observe"])
})

test("探索结果 URL 只对齐唯一兼容事件，真正不同地址仍拒绝", async () => {
  const taskId = "exploration-observed-url", exactUrl = "https://example.com/items?q=one&trace=abc"
  const inspection = { sessionId: "abcd", tabId: 1, url: exactUrl, text: "Items", truncated: false,
    observedAt: "2026-09-13T00:00:00.000Z" }
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "succeeded" } } },
    async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>) {
      const session = { async command(value: { type: string }) {
        if (value.type === "page") return JSON.stringify({ url: exactUrl, title: "Items", text: "Items",
          truncated: false, links: [], headings: [], paragraphs: [] })
        return null
      }, state: () => inspection, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
      return work(session, new AbortController().signal)
    } } as unknown as BrowserService
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) {
      await input.tools![0]!.execute("page", { command: { type: "page" } })
      await assert.rejects(input.tools![1]!.execute("different", { result: { url: "https://example.com/other?q=one" },
        provenance: [{ source: "inference", outputPath: [], eventIds: ["page"], instruction: "读取当前页面 URL。" }] }),
      /exploration_url_not_observed/)
      await input.tools![1]!.execute("shortened", { result: { url: "https://example.com/items?q=one" },
        provenance: [{ source: "inference", outputPath: [], eventIds: ["page"], instruction: "读取当前页面 URL。" }] })
      return { outputText: exactUrl }
    }, async close() {} }
  const host = new TaskRuntimeHost({} as TaskContractRepository, browser,
    { selection() { throw new Error("unused") } } as unknown as AIModelProvider)
  const trace = await host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    outputContract: { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: { type: "object",
      properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
    budget, representativeInput: { url: exactUrl }, context: {}, signal: new AbortController().signal }, model, () => {})
  assert.deepEqual(trace.result?.result, { url: exactUrl })
})

test("探索中的局部动作错误允许在同一会话修正且不打开访问熔断", async () => {
  const taskId = "exploration-local-correction", inspection = { sessionId: "abcd", tabId: 1,
    url: "https://example.com/", text: "Recovered", truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
  let commands = 0
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "succeeded" } } },
    async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>) {
      const session = { async command(value: { type: string }) {
        commands++
        if (value.type === "click") throw new BrowserError("command_failed")
        if (value.type === "page") return JSON.stringify({ url: inspection.url, title: "Recovered", text: "Recovered",
          truncated: false, links: [], headings: [], paragraphs: [] })
        return null
      }, state: () => inspection, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
      return work(session, new AbortController().signal)
    } } as unknown as BrowserService
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) {
      await assert.rejects(input.tools![0]!.execute("invented-url", { command: { type: "navigate", url: "https://example.com/invented" } }), /permission_denied/)
      await assert.rejects(input.tools![0]!.execute("false-help", { command: { type: "request_help", reason: "access",
        prompt: "处理本地权限错误" } }), /permission_denied/)
      await assert.rejects(input.tools![0]!.execute("bad-selector", { command: { type: "click", target: { selector: "#missing" } } }), /command_failed/)
      await input.tools![0]!.execute("page", { command: { type: "page" } })
      await input.tools![0]!.execute("observed-url", { command: { type: "navigate", url: inspection.url } })
      await input.tools![1]!.execute("complete", { result: { title: "Recovered" },
        provenance: [{ source: "tool", outputPath: ["title"], eventId: "page", resultPath: ["title"] }] })
      return { outputText: "Recovered" }
    }, async close() {} }
  const host = new TaskRuntimeHost({} as TaskContractRepository, browser,
    { selection() { throw new Error("unused") } } as unknown as AIModelProvider)
  const trace = await host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    outputContract: { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: { type: "object",
      properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } },
    budget, representativeInput: { url: "https://example.com/" }, context: {}, signal: new AbortController().signal }, model, () => {})
  assert.equal(trace.result?.result && (trace.result.result as { title?: string }).title, "Recovered")
  assert.equal(commands, 5) // initial observe + failed click + page + observed navigate + fresh observe
  assert.equal(opensAccessCircuit("origin_denied", "tab_open"), false)
  assert.equal(opensAccessCircuit("origin_denied", "page"), true)
})

test("未修正的局部定位错误仍归类为业务结果缺失", async () => {
  const taskId = "exploration-unresolved-local-error", inspection = { sessionId: "abcd", tabId: 1,
    url: "https://example.com/", text: "duplicate targets", truncated: false, observedAt: "2026-09-13T00:00:00.000Z" }
  const browser = { setAuthorizationValidator() {}, async snapshot() { return { cleanupRequired: false, record: { status: "failed" } } },
    async run(_grant: BrowserGrant, work: (session: object, signal: AbortSignal) => Promise<unknown>) {
      const session = { async command(value: { type: string }) {
        if (value.type === "click") throw new BrowserError("target_ambiguous")
        return null
      }, state: () => inspection, beginStep() {}, activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
      return work(session, new AbortController().signal)
    } } as unknown as BrowserService
  const model: PreparedMainAIModel = { selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
    async run(input) {
      await assert.rejects(input.tools![0]!.execute("ambiguous", { command: { type: "click",
        target: { role: "button", name: "Duplicate" } } }), /target_ambiguous/)
      return { outputText: "no result" }
    }, async close() {} }
  const host = new TaskRuntimeHost({} as TaskContractRepository, browser,
    { selection() { throw new Error("unused") } } as unknown as AIModelProvider)
  await assert.rejects(host.explore({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    outputContract: { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } },
    budget, representativeInput: { url: inspection.url }, context: {}, signal: new AbortController().signal }, model, () => {}),
  /exploration_business_result_missing/)
})

test("真实浏览器底层命令数同步到 TaskRun 与计划总账", async () => {
  const taskId = "browser-command-accounting", chain = countedBrowserChain(taskId)
  const authorizationId = randomUUID(), runId = randomUUID(), snapshots: TaskConsumption[] = []
  let onCommand = () => {}
  const repository = { runs: () => [], saveRun: (run: TaskRun) => run } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run(_grant: BrowserGrant,
    work: (session: object, signal: AbortSignal) => Promise<unknown>) {
    const session = { command: async () => { onCommand(); onCommand(); return null }, state: () => null,
      beginStep: (_commands: number, _timeoutMs: number, _signal: AbortSignal, callback: () => void) => { onCommand = callback },
      activeElapsedMs: () => 0, stepElapsedMs: () => 0 }
    return work(session, new AbortController().signal)
  } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, browser, ai)
  const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay", input: null,
    binding: { runId, invocationId: randomUUID(), taskId, authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(null) } }
  const run = await host.group({ taskId, authorizationId, browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [chain], input: null, signal: new AbortController().signal,
    budget: chain.budget, consumed: empty(), scopeConsumption: { [chain.stepId]: empty() },
    onConsumption: (_scopeId, snapshot) => { snapshots.push(snapshot.total) } }, (execute) => execute(chain, request))
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.browserCommands, 2)
  assert.equal(snapshots.at(-1)?.browserCommands, 2)
})

test("只含本地 wait 的 browser 节点无需伪造浏览器授权也能执行", async () => {
  const taskId = "local-wait-task", chain = localWaitChain(taskId), authorizationId = randomUUID(), runId = randomUUID()
  let browserRuns = 0
  const repository = { runs: () => [], saveRun: (run: unknown) => run } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run() { browserRuns += 1; throw new Error("browser_not_expected") } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, browser, ai)
  const request = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay" as const, input: null,
    binding: { runId, invocationId: randomUUID(), taskId, authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(null) } }
  const run = await host.group({ taskId, authorizationId, browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [chain], input: null, signal: new AbortController().signal,
    budget, consumed: empty(), scopeConsumption: { [chain.stepId]: empty() } }, (execute) => execute(chain, request))
  assert.equal(run.status, "completed")
  assert.equal(browserRuns, 0)
})

test("invoke 子链人工等待后复用同一持久化运行与检查点", async () => {
  const taskId = "child-resume-task", child = waitingChildChain(taskId), parent = invokingParentChain(taskId, child)
  const authorizationId = randomUUID(), runId = randomUUID(), invocationId = randomUUID()
  const saved = new Map<string, TaskRun>(), resuming: boolean[] = []
  const repository = {
    chain: (_taskId: string, id: string, version: number, digest?: string) => {
      assert.equal(id, child.id); assert.equal(version, child.version); assert.equal(digest, executableChainDigest(child)); return child
    },
    runs: () => [...saved.values()],
    saveRun: (run: TaskRun) => { saved.set(run.binding.runId, structuredClone(run)); return run },
  } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run() { throw new Error("browser_not_expected") } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, browser, ai, () => ({ human: async ({ resuming: value }) => {
    resuming.push(value)
    return value ? { outcome: "success", output: null } : { outcome: "human_required", reason: "等待确认" }
  } }))
  const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay", input: null,
    binding: { runId, invocationId, taskId, authorizationId, plan: parent.plan,
      chain: { id: parent.id, version: parent.version, digest: executableChainDigest(parent) }, inputDigest: digestJson(null) } }
  const first = await executeInGroup(host, parent, request)
  assert.equal(first.status, "waiting_for_human")
  assert.ok(first.checkpoint)
  const childRunId = stableUuid(runId, "child", stableUuid(runId, "invoke", "once"))
  assert.equal(saved.get(childRunId)?.status, "waiting_for_human")
  const resumed = await executeInGroup(host, parent, request, resumeControl(first), first.consumed)
  assert.equal(resumed.status, "completed")
  assert.deepEqual(resuming, [false, true])
  assert.equal(saved.get(childRunId)?.status, "completed")
  assert.equal([...saved.keys()].filter((id) => id === childRunId).length, 1)
})

function fakeChain(taskId: string, stepId: string, nodes: JsonValue[]): TaskChain {
  const contract = { id: `${stepId}-value`, version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } }
  return { contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId, name: stepId,
    inputContract: contract, outputContract: contract, variables: {}, entry: "entry", nodes: nodes as TaskChain["nodes"], edges: [],
    completion: [], budget, reuseBoundary: { description: "fixture", assumptions: [], invalidationConditions: [] },
    implementationSummary: "fixture", validation: { status: "verified", evidence: [] } }
}

function localWaitChain(taskId: string): TaskChain {
  const contract = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
  const wait = { id: "wait", label: "wait", kind: "browser" as const, operation: "wait" as const,
    arguments: { durationMs: { source: "constant" as const, value: 1 } }, timeoutMs: 100,
    outcomes: [...requiredNodeOutcomes.browser], outputContract: contract, writes: [] }
  const emit = { id: "emit", label: "emit", kind: "emit" as const, name: "result",
    output: { kind: "value" as const, value: { source: "constant" as const, value: null } }, contract,
    outcomes: [...requiredNodeOutcomes.emit], outputContract: contract, writes: [] }
  const terminal = (id: string, status: "completed" | "failed") => ({ id, label: id, kind: "terminal" as const,
    status, reason: status, evidence: [{ source: "input" as const, path: [] }], outcomes: [], outputContract: contract, writes: [] })
  const done = terminal("done", "completed"), failed = terminal("failed", "failed")
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId: "wait-step", name: "local wait",
    inputContract: contract, outputContract: contract, variables: {}, entry: wait.id, nodes: [wait, emit, done, failed],
    edges: [...wait.outcomes.map((outcome) => ({ from: wait.id, outcome, to: outcome === "success" ? emit.id : failed.id })),
      ...emit.outcomes.map((outcome) => ({ from: emit.id, outcome, to: outcome === "success" ? done.id : failed.id }))],
    completion: [{ id: "emitted", description: "output emitted", predicate: { operator: "equals", left: {
      source: "node", nodeId: emit.id, path: [] }, right: { source: "constant", value: null } } }], budget,
    reuseBoundary: { description: "local wait", assumptions: [], invalidationConditions: [] },
    implementationSummary: "local wait fixture", validation: { status: "candidate", evidence: [] } })
}

function countedBrowserChain(taskId: string): TaskChain {
  const contract = nullContract(), action = { id: "navigate", label: "navigate", kind: "browser" as const,
    operation: "navigate" as const, arguments: { url: { source: "constant" as const, value: "https://example.com/" } },
    timeoutMs: 10_000, outcomes: [...requiredNodeOutcomes.browser], outputContract: contract, writes: [] }
  return finishableChain(taskId, "browser-step", [action], action.id, contract, false)
}

function waitingChildChain(taskId: string): TaskChain {
  const contract = nullContract(), human = { id: "confirm", label: "confirm", kind: "human" as const,
    reason: "confirmation" as const, prompt: "请确认", resumeWhen: { operator: "equals" as const, path: [],
      expected: { source: "constant" as const, value: null } }, timeoutMs: 10_000,
    outcomes: [...requiredNodeOutcomes.human], outputContract: contract, writes: [] }
  return finishableChain(taskId, "child-step", [human], human.id, contract, true)
}

function invokingParentChain(taskId: string, child: TaskChain): TaskChain {
  const contract = nullContract(), invoke = { id: "invoke", label: "invoke", kind: "invoke" as const,
    chain: { id: child.id, version: child.version, digest: executableChainDigest(child) },
    input: { source: "input" as const, path: [] }, iteration: { mode: "once" as const },
    outcomes: [...requiredNodeOutcomes.invoke], outputContract: contract, writes: [] }
  return finishableChain(taskId, "parent-step", [invoke], invoke.id, contract, false)
}

function finishableChain(taskId: string, stepId: string, starts: TaskChain["nodes"], entry: string,
  contract: ReturnType<typeof nullContract>, verified: boolean): TaskChain {
  const emit = { id: "emit", label: "emit", kind: "emit" as const, name: "result",
    output: { kind: "value" as const, value: { source: "node" as const, nodeId: entry, path: [] } }, contract,
    outcomes: [...requiredNodeOutcomes.emit], outputContract: contract, writes: [] }
  const terminal = (id: string, status: "completed" | "failed") => ({ id, label: id, kind: "terminal" as const,
    status, reason: status, evidence: [{ source: "input" as const, path: [] }], outcomes: [], outputContract: contract, writes: [] })
  const done = terminal("done", "completed"), failed = terminal("failed", "failed")
  const evidence = verified ? [{ phase: "sample" as const, runId: randomUUID(), chainDigest: "c".repeat(64),
    inputDigest: "d".repeat(64), outputDigest: "e".repeat(64), passed: true, modelCalls: 0, at: "2026-09-12T00:00:00Z" },
    { phase: "verification" as const, runId: randomUUID(), chainDigest: "c".repeat(64), inputDigest: "f".repeat(64),
      outputDigest: "e".repeat(64), passed: true, modelCalls: 0, at: "2026-09-12T00:00:01Z" }] : []
  const first = starts[0]!
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId, name: stepId,
    inputContract: contract, outputContract: contract, variables: {}, entry, nodes: [...starts, emit, done, failed],
    edges: [...first.outcomes.map((outcome) => ({ from: entry, outcome, to: outcome === "success" ? emit.id : failed.id })),
      ...emit.outcomes.map((outcome) => ({ from: emit.id, outcome, to: outcome === "success" ? done.id : failed.id }))],
    completion: [{ id: "emitted", description: "output emitted", predicate: { operator: "equals", left: {
      source: "node", nodeId: emit.id, path: [] }, right: { source: "constant", value: null } } }], budget: resumeBudget,
    reuseBoundary: { description: stepId, assumptions: [], invalidationConditions: [] }, implementationSummary: stepId,
    validation: { status: verified ? "verified" : "candidate", evidence } })
}

function nullContract() {
  return { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
}

async function executeInGroup(host: TaskRuntimeHost, chain: TaskChain, request: TaskRunRequest,
  control?: RuntimeControl, consumed = empty()) {
  return host.group({ taskId: chain.taskId, authorizationId: request.binding.authorizationId, browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "replay", chains: [chain], input: request.input, signal: new AbortController().signal,
    budget: chain.budget, consumed, scopeConsumption: { [chain.stepId]: consumed } }, (execute) => execute(chain, request, control))
}

function resumeControl(run: TaskRun): RuntimeControl {
  const checkpoint = run.checkpoint!
  return { checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), binding: run.binding,
    checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } }
}
