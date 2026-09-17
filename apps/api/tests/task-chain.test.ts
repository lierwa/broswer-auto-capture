import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { type JsonValue } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"

// Product planning/authoring, fork compilation, repository and LangGraph are real; browser/model I/O is synthetic.
async function harness() {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-task-")), raw = hybridFixture("nested")
  const { contractVersion: _, kind: _kind, id: _id, taskId: _task, version: _version, requirement: _requirement,
    evidence: _evidence, budget: _budget, steps, ...body } = hybridPlan(raw)
  const candidate = { ...body, steps: steps.map(({ chain: _, budget: __, ...step }) => step) }
  const base = preexecutionModel([]), log = { tasks: [] as string[], inputs: [] as JsonValue[], sessions: 0, closed: 0, urls: [] as JsonValue[] }
  const ai = { ...base, async prepare() { return { selection: base.selection(), async generateObject<T>(input: { parse(value: unknown): T }) {
    return input.parse(candidate)
  } } } }
  const forbidden = () => { throw new Error("retired_provider_called") }
  const upstream: UpstreamBrowserRuntime = { withSession: forbidden, async withAuthoring(_input, work) {
    log.sessions++
    try { return await work({ async author(source) {
      log.tasks.push(source.task); log.inputs.push(source.input)
      const result = hybridFixture("nested", source)
      return { output: null, request: result.request, response: result.response,
        history: { localRef: result.request.trace.source.historyRef, digest: result.request.trace.digest },
        sourceSuccess: true, sourceValidated: true, browserCommands: 1, forkSourceDigest: "a".repeat(64),
        modelCalls: (["agent", "judge"] as const).map((purpose) => ({ callId: randomUUID(), purpose, model: "fixture",
          intendedAt: "2026-09-16T00:00:00.000Z", status: "completed", reportedInvocations: 1 })) }
    } }) } finally { log.closed++ }
  }, async withCapabilities(_input, work) {
    log.sessions++; let commands = 0
    try { return await work({ browserCommandCount: () => commands, async capability(invocation) {
      commands++; log.urls.push(invocation.input.url!); return { outcome: "success", output: null }
    } }) } finally { log.closed++ }
  } }
  const application = await createApplication({ root: projectRoot, directory, aiModel: ai,
    upstreamBrowserRuntime: upstream, browserExecutor: forbidden })
  const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
  confirmedDraft(application.store, taskId)
  application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown = '# 通用确认任务\n按 target.url 打开页面；网址范围 https://fixture.invalid/。\n'
    + '```bat-compilation/v1\n' + JSON.stringify({ version: 1, steps: { perform: { clauses: raw.request.requirement.clauses,
      control: raw.request.control, acceptedAnnotations: [] } } }) + '\n```' })
  const repository = application.taskChain.repository
  const source = { target: { url: "https://fixture.invalid/next" } }
  const author = (input: JsonValue = source) => application.taskChain.dispatch(taskId, {
    type: "author_task", requestId: randomUUID(), requirementVersion: 1, input })
  const settled = () => waitFor(() => repository.jobs(taskId).some((job) => job.status === "failed")
    || repository.chains(taskId)[0]?.validation.evidence.some((item) => item.phase === "sample") === true, 15000)
  return { application, taskId, repository, log, source, author, settled,
    async close() { await application.app.close(); await rm(directory, { recursive: true, force: true }) } }
}

test("完整确认需求和嵌套输入进入原生来源适配，正式 author_task 生成 v2 并自动验证", async () => {
  const h = await harness()
  try {
    h.author(); await h.settled()
    const job = h.repository.jobs(h.taskId)[0]!
    assert.equal(job.status, "completed", job.reason ?? "")
    assert.deepEqual(h.log.inputs, [h.source])
    assert.match(h.log.tasks[0]!, /# 通用确认任务/)
    assert.match(h.log.tasks[0]!, /【完成标准】/)
    assert.doesNotMatch(h.log.tasks[0]!, /primitive 输入/)
    const chain = h.repository.chains(h.taskId)[0]!
    assert.ok(chain.nodes.some((node) => node.kind === "capability" && node.capability.name === "browser.workflow-step"))
    assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 0)
    assert.equal(chain.validation.evidence[0]?.passed, true)
    assert.equal(h.repository.runs(h.taskId)[0]?.consumed.llmCalls, 0)
    assert.equal(h.log.sessions, h.log.closed)
  } finally { await h.close() }
})

test("样本、换嵌套输入和授权复跑分别记账，固定同链且无模型补采", async () => {
  const h = await harness()
  try {
    h.author(); await h.settled()
    assert.equal(h.repository.jobs(h.taskId)[0]?.status, "completed", h.repository.jobs(h.taskId)[0]?.reason ?? "")
    const chain = h.repository.chains(h.taskId)[0]!, reference = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
    h.application.taskChain.dispatch(h.taskId, { type: "validate_chain", requestId: randomUUID(), chain: reference,
      mode: "verification", input: { target: { url: "https://fixture.invalid/other" } } })
    await waitFor(() => h.repository.chain(h.taskId, chain.id, chain.version).validation.status === "verified", 5000)
    const plan = h.repository.plans(h.taskId)[0]!
    h.application.taskChain.dispatch(h.taskId, { type: "authorize_plan", requestId: randomUUID(),
      plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, input: { target: { url: "https://fixture.invalid/final" } } })
    await waitFor(() => ["completed", "failed"].includes(h.repository.executions(h.taskId)[0]?.status ?? ""), 5000)
    const execution = h.repository.executions(h.taskId)[0]!
    assert.equal(execution.status, "completed", execution.reason ?? "")
    assert.equal(execution.output?.kind === "value" && execution.output.value, null)
    assert.deepEqual(h.log.urls, ["https://fixture.invalid/next", "https://fixture.invalid/other", "https://fixture.invalid/final"])
    assert.ok(h.repository.runs(h.taskId).every((run) => run.modelCalls.length === 0 && run.auditComplete))
    assert.equal(h.log.sessions, 4); assert.equal(h.log.closed, 4)
  } finally { await h.close() }
})

test("输入类型错误在启动 Browser 前拒绝，嵌套对象本身不是错误", async () => {
  const h = await harness()
  try {
    h.author({ target: { url: 123 } }); await h.settled()
    assert.equal(h.repository.jobs(h.taskId)[0]?.status, "failed")
    assert.equal(h.log.sessions, 0)
    assert.deepEqual(h.repository.chains(h.taskId), [])
  } finally { await h.close() }
})
