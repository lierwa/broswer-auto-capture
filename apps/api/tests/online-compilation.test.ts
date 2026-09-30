// 不变量：正式 authoring 消费运行中保存结果，不调用离线补编译；SQLite 快照不能被取消后的包覆盖。
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  taskAuthoringActivitySchema, taskAuthoringJobSchema, type TaskAuthoringJob, type ValueSchema,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, TaskChainRuntime } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { TaskChainAuthoring } from "../src/task-chain/authoring.js"
import { AuthoringBuild } from "../src/task-chain/authoring-build.js"
import { RunnerProcess, type UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { hybridAuthorRequestSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { parseCapturedSource } from "../src/upstream-browser/hybrid-captured-source.js"
import { parseCompilationCheckpoint, receiveCompilation, type CompilationCheckpoint } from "../src/upstream-browser/hybrid-compilation-checkpoint.js"
import { projectRoot } from "./helpers.js"
import { projectActivity } from "../src/task-chain/workspace-projection.js"
import { RequirementClarificationRequired } from "../src/task-chain/authoring-failure.js"

const schema: ValueSchema = { type: "array", items: { type: "object", properties: {
  title: { type: "string" } }, required: ["title"], additionalProperties: false } }

async function harness(rejectFinal = false) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-online-compilation-"))
  const store = await ProductStore.open(directory), taskId = store.taskAction({ type: "create", requestId: randomUUID() })
  const repository = new TaskContractRepository(store), { plan, requirement } = structuredClone(extractionFixture)
  plan.taskId = requirement.taskId = taskId
  plan.inputContract.schema = requirement.inputContract!.schema = { type: "null" }
  plan.outputContract.schema = requirement.outputContract!.schema = schema
  requirement.confirmation = { confirmedAt: new Date().toISOString(), requestId: randomUUID() }
  plan.requirement.digest = digestJson(requirement); plan.entryUrls = ["https://example.test/"]
  const step = plan.steps[0]!
  step.inputContract = plan.inputContract; step.outputContract = plan.outputContract
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema,
    fields: [{ path: [], description: "Visible records", producerRef: "records" }], derivations: [], edgeCases: [] }
  const now = new Date().toISOString(), job = taskAuthoringJobSchema.parse({ id: randomUUID(), taskId,
    type: "chain", key: "controlled-online", status: "queued", sequence: 0, reason: null, resultId: null,
    audit: null, createdAt: now, updatedAt: now })
  repository.saveJob(job)
  const signal = new AbortController().signal, events: CompilationCheckpoint[] = [], order: string[] = []
  let authoring!: TaskChainAuthoring
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("legacy_unexpected") },
    recompile: async () => { throw new Error("offline_must_not_run") },
    withAuthoring: async (_input, work) => {
      const runner = new RunnerProcess(projectRoot, signal, undefined, {
        runnerScript: path.join(projectRoot, "apps/api/tests/fixtures/online_compilation_runner.py") })
      try {
        await runner.startCompiler()
        return await work({ author: async (source, options) => {
          let hostError: unknown
          const raw = await runner.request(hybridAuthorRequestSchema.parse({ id: randomUUID(), type: "hybrid_author",
            onlineCompilation: true, source, model: { model: "controlled", endpoint: "http://127.0.0.1:1", token: "test" } }),
            undefined, async (event, bounded) => {
              events.push(event)
              let resuming: Promise<void> | undefined
              if (parseCompilationCheckpoint(event).phase === "final") {
                if (rejectFinal) {
                  const payload = parseCompilationCheckpoint(event)
                  payload.response.compilation.gaps.push({ id: "g-source", code: "missing_binding", actionRefs: [],
                    clauseRefs: [], reason: "missing_runtime_binding", resolution: "collect_evidence" })
                  const { canonicalDigest: _digest, ...body } = payload.response.compilation
                  payload.response.canonicalPayload = JSON.stringify(body)
                  payload.response.compilation.canonicalDigest = createHash("sha256")
                    .update(payload.response.canonicalPayload).digest("hex")
                  event = { ...event, payload: JSON.stringify(payload) }
                  event.digest = createHash("sha256").update(event.payload).digest("hex")
                }
                const wait = { id: randomUUID(), reason: "login" as const, prompt: "测试人工恢复", origin: "https://example.test" }
                _input.onHumanWait!(wait, async () => {})
                resuming = authoring.resumeHuman(taskId, job.id, repository.job(taskId, job.id).sequence, wait.id)
                assert.equal(repository.job(taskId, job.id).status, "waiting_for_human")
              }
              try { await options!.onCompilation!(event, bounded); await resuming }
              catch (error) { hostError = error; throw error }
              order.push(parseCompilationCheckpoint(event).phase)
              assert.equal(repository.job(taskId, job.id).authoring!.build!.sequence, event.sequence)
            }).catch(error => { throw hostError ?? error })
          const receipt = { result: raw, forkSourceDigest: "f".repeat(64), modelCalls: [{ callId: "fixture-model",
            purpose: "agent" as const, model: "controlled", intendedAt: now, status: "completed" as const, reportedInvocations: 1 }] }
          options?.onSource?.(receipt); order.push("source")
          assert.equal((await runner.close()).status, "confirmed"); order.push("closed")
          return parseCapturedSource(raw, receipt.forkSourceDigest, receipt.modelCalls)
        } })
      } finally { await runner.close() }
    } }
  const selection = { connectionId: randomUUID(), modelId: "controlled", reasoningEffort: "medium" as const }
  const ai = { selection: () => selection, prepare: async () => ({ selection }) }
  authoring = new TaskChainAuthoring(repository, ai as never, upstream)
  return { directory, store, repository, job, plan, requirement, step, signal, events, order,
    authoring,
    close: async () => { await store.close(); await rm(directory, { recursive: true, force: true }) } }
}

test("完整来源的在线收尾失败归于编译，不覆盖已有前缀或误记为探索失败", async () => {
  const h = await harness(true)
  try {
    await assert.rejects(h.authoring.task(h.job, h.requirement, h.plan, null, h.signal), /hybrid_compilation_host_rejected/)
    const failed = h.repository.job(h.job.taskId, h.job.id)
    assert.equal(failed.status, "failed")
    assert.equal(failed.authoring!.stage, "compiling")
    assert.equal(failed.authoring!.failureLayer, "在线节点编译")
    assert.equal(failed.authoring!.build!.phase, "prefix")
  } finally { await h.close() }
})

test("原生回调到跨进程 ACK、SQLite、正式候选和普通执行器，无离线补编译", async () => {
  const h = await harness()
  try {
    const result = await h.authoring.task(h.job, h.requirement, h.plan, null, h.signal)
    assert.deepEqual(h.order, ["prefix", "final", "source", "closed"])
    assert.equal(h.events.length, 2)
    assert.equal(h.repository.job(h.job.taskId, h.job.id).authoring!.build!.phase, "final")
    assert.equal(result.chains.length, 1)
    const chain = result.chains[0]!, output = [{ title: "live" }]
    const finalBuild = h.repository.job(h.job.taskId, h.job.id).authoring!.build!
    assert.ok(finalBuild.presentation)
    assert.equal(result.presentations[0]!.chain.digest, executableChainDigest(chain))
    assert.deepEqual(finalBuild.presentation, {
      stages: result.presentations[0]!.stages,
      overviewLayout: result.presentations[0]!.overviewLayout,
      focusLayouts: result.presentations[0]!.focusLayouts,
    })
    let calls = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
      browserCommandCount: () => calls,
      capability: async () => { calls++; return { outcome: "success", output } },
    } })
    assert.equal(run.status, "completed")
    assert.equal(calls, 1); assert.deepEqual(run.modelCalls, [])
    assert.equal(JSON.stringify(run.outputs).includes('"live"'), true)
    await checkSaveBoundary(h)
    await checkProjectionFailureBoundary(h)
    await checkDuplicateBarrier(h.events[0]!, h.signal)
    // 新接收器不能接管旧 request；持久化取消后连同一批重投也不得 ACK。
    const current = h.repository.job(h.job.taskId, h.job.id)
    current.status = "interrupted"; h.repository.saveJob(current)
    const build = new AuthoringBuild({ ...h, job: h.job, input: null, model: "controlled" })
    await assert.rejects(build.accept(h.events[0]!, h.signal), /not_active/)
    assert.equal(h.repository.job(h.job.taskId, h.job.id).status, "interrupted")
  } finally { await h.close() }
})

test("final build 与候选 chain digest 漂移时在草稿前失败", async () => {
  const h = await harness()
  try {
    const nextChainVersion = h.repository.nextChainVersion.bind(h.repository)
    let calls = 0
    h.repository.nextChainVersion = (...args) => calls++ === 0 ? nextChainVersion(...args) : nextChainVersion(...args) + 1
    await assert.rejects(h.authoring.task(h.job, h.requirement, h.plan, null, h.signal), /hybrid_final_chain_mismatch/)
    const failed = h.repository.job(h.job.taskId, h.job.id)
    assert.equal(failed.authoring!.build!.phase, "final")
    assert.ok(failed.authoring!.build!.presentation)
    assert.equal(h.repository.draft(h.job.taskId), null)
  } finally { await h.close() }
})

async function checkSaveBoundary(h: Awaited<ReturnType<typeof harness>>) {
  const job = structuredClone(h.job)
  job.id = randomUUID(); job.status = "running"; delete job.authoring!.build
  h.repository.saveJob(job)
  const build = new AuthoringBuild({ ...h, job, input: null, model: "controlled" }), event = h.events[0]!
  await build.accept(event, h.signal)
  const saved = h.repository.job(job.taskId, job.id)
  await build.accept(event, h.signal)
  assert.deepEqual(h.repository.job(job.taskId, job.id), saved)
  await assert.rejects(build.accept({ ...event, digest: "0".repeat(64) }, h.signal), /sequence_mismatch/)
  await assert.rejects(build.accept({ ...event, sequence: 3 }, h.signal), /sequence_mismatch/)
  await assert.rejects(build.accept({ ...event, id: randomUUID() }, h.signal), /owner_mismatch/)
  const ambiguity = parseCompilationCheckpoint(event)
  ambiguity.response.compilation.gaps.push({ id: "g-confirm", code: "missing_binding", actionRefs: [],
    clauseRefs: [], reason: "new_requirement_ambiguity", resolution: "confirm_intent" })
  const { canonicalDigest: _digest, ...body } = ambiguity.response.compilation
  ambiguity.response.canonicalPayload = JSON.stringify(body)
  ambiguity.response.compilation.canonicalDigest = createHash("sha256").update(ambiguity.response.canonicalPayload).digest("hex")
  const payload = JSON.stringify(ambiguity)
  await assert.rejects(build.accept({ ...event, sequence: 2, payload,
    digest: createHash("sha256").update(payload).digest("hex") }, h.signal), RequirementClarificationRequired)
  assert.deepEqual(h.repository.job(job.taskId, job.id), saved)
  const originalSave = h.repository.saveJob.bind(h.repository)
  h.repository.saveJob = () => { throw new Error("controlled_disk_failure") }
  await assert.rejects(build.accept(h.events[1]!, h.signal), /hybrid_compilation_save_failed/)
  h.repository.saveJob = originalSave
  assert.deepEqual(h.repository.job(job.taskId, job.id), saved)
  const pending = build.accept(h.events[1]!, h.signal)
  const cancelled = { ...saved, status: "interrupted" as const }
  h.repository.saveJob(cancelled)
  await assert.rejects(pending, /not_active/)
  assert.deepEqual(h.repository.job(job.taskId, job.id), cancelled)
  // 工作区只暴露节点投影，不泄漏 canonical 现场，也没有构造可运行入口。
  const activity = projectActivity({ ...saved, type: "prepare",
    preparation: { phase: "preexecuting", inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })
  assert.equal(activity!.build!.nodes.length, 1)
  assert.ok(activity!.build!.presentation)
  assert.deepEqual(activity!.build!.presentation, saved.authoring!.build!.presentation)
  assert.doesNotThrow(() => taskAuthoringActivitySchema.parse(activity))
  assert.equal("payload" in activity!.build!, false)
  assert.equal("entry" in activity!.build!, false)
  for (const phase of ["validating_sample", "awaiting_verification_input", "validating_verification", "ready"] as const) {
    assert.equal(projectActivity({ ...saved, type: "prepare",
      preparation: { phase, inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })!.build, undefined)
  }
  assert.deepEqual(h.repository.job(job.taskId, job.id).authoring!.build, saved.authoring!.build)
}

async function checkProjectionFailureBoundary(h: Awaited<ReturnType<typeof harness>>) {
  const job = structuredClone(h.job)
  job.id = randomUUID(); job.status = "running"; delete job.authoring!.build
  h.repository.saveJob(job)
  const build = new AuthoringBuild({ ...h, job, input: null, model: "controlled",
    preparationPresentation: () => { throw new Error("controlled_presentation_failure") } })
  let acknowledgements = 0
  await receiveCompilation(h.events[0]!, { onCompilation: (event, signal) => build.accept(event, signal) },
    h.signal, async () => { acknowledgements++ })
  const saved = h.repository.job(job.taskId, job.id)
  assert.equal(acknowledgements, 1)
  assert.equal(saved.authoring!.build!.sequence, h.events[0]!.sequence)
  assert.equal(saved.authoring!.build!.nodes.length, 1)
  assert.equal(saved.authoring!.build!.presentation, undefined)
  const activity = projectActivity({ ...saved, type: "prepare",
    preparation: { phase: "preexecuting", inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })
  assert.equal(activity!.build!.presentation.stages.length, 1)
  assert.equal(activity!.build!.presentation.stages[0]!.title, "未分组动作")
  assert.doesNotThrow(() => taskAuthoringActivitySchema.parse(activity))
}

async function checkDuplicateBarrier(event: CompilationCheckpoint, signal: AbortSignal) {
  let release!: () => void, writes = 0, acknowledgements = 0
  const saved = new Promise<void>(resolve => { release = resolve })
  const pending = { onCompilation: async () => { writes++; await saved } }
  const ack = async () => { acknowledgements++ }
  const first = receiveCompilation(event, pending, signal, ack)
  const duplicate = receiveCompilation(event, pending, signal, ack)
  await assert.rejects(receiveCompilation({ ...event, digest: "0".repeat(64) }, pending, signal, ack), /inflight_conflict/)
  assert.equal(writes, 1); assert.equal(acknowledgements, 0)
  release(); await Promise.all([first, duplicate])
  assert.equal(acknowledgements, 1)
}
