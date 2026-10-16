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
import { parseCompilationCandidate, parseCompilationCheckpoint, receiveCompilation, type CompilationCheckpoint } from "../src/upstream-browser/hybrid-compilation-checkpoint.js"
import { projectRoot } from "./helpers.js"
import { projectActivity } from "../src/task-chain/workspace-projection.js"
import { RequirementClarificationRequired } from "../src/task-chain/authoring-failure.js"
import { storedStepBuilds } from "../src/task-chain/preparation-step-builds.js"
import { taskArtifacts } from "../src/database/schema.js"

const schema: ValueSchema = { type: "array", items: { type: "object", properties: {
  title: { type: "string" } }, required: ["title"], additionalProperties: false } }

function resultCheckpoint(event: CompilationCheckpoint) {
  const payload = parseCompilationCheckpoint(event), candidate = parseCompilationCandidate(payload)
  if (candidate.kind !== "result") throw new Error("fixture_candidate_result_required")
  return { ...payload, candidate }
}

async function harness(rejectFinal = false, discoveryGap?: "retired" | "unresolved") {
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
  const upstream: UpstreamBrowserRuntime = { recompile: async () => { throw new Error("offline_must_not_run") },
    withAuthoring: async (_input, work) => {
      const runner = new RunnerProcess(projectRoot, signal, undefined, {
        ...(discoveryGap ? { runnerEnvironment: { BAT_TEST_DISCOVERY_GAP_MODE: discoveryGap } } : {}),
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
              if (resultCheckpoint(event).phase === "final") {
                if (rejectFinal) {
                  const payload = resultCheckpoint(event)
                  payload.candidate.response.compilation.gaps.push({ id: "g-source", code: "missing_binding", actionRefs: [],
                    clauseRefs: [], reason: "missing_runtime_binding", resolution: "collect_evidence" })
                  const { canonicalDigest: _digest, ...body } = payload.candidate.response.compilation
                  payload.candidate.response.canonicalPayload = JSON.stringify(body)
                  payload.candidate.response.compilation.canonicalDigest = createHash("sha256")
                    .update(payload.candidate.response.canonicalPayload).digest("hex")
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
              order.push(resultCheckpoint(event).phase)
              assert.equal(repository.job(taskId, job.id).authoring!.sourceReceipt!.sequence, event.sequence)
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
    await assert.rejects(h.authoring.task(h.job, h.requirement, h.plan, null, h.signal), /hybrid_compilation_gaps/)
    const failed = h.repository.job(h.job.taskId, h.job.id)
    assert.equal(failed.status, "failed")
    assert.equal(failed.authoring!.stage, "compiling")
    assert.equal(failed.authoring!.failureLayer, "在线节点编译")
    assert.equal(failed.authoring!.build!.phase, "prefix")
  } finally { await h.close() }
})

test("最终编译已排除的探查缺口只保留审计，不再阻断在线收尾", async () => {
  const h = await harness(false, "retired")
  try {
    const result = await h.authoring.task(h.job, h.requirement, h.plan, null, h.signal).catch(error => {
      const rejected = h.store.db.select().from(taskArtifacts).all()
        .filter(row => row.mediaType.includes("compilation-rejected"))
        .map(row => (row.body as { reason: string }).reason)
      const gaps = resultCheckpoint(h.events.at(-1)!).candidate.response.compilation.gaps.map(issue => issue.reason)
      throw new Error(`${error.message}; rejected=${rejected.join(",")}; gaps=${gaps.join(",")}`, { cause: error })
    })
    assert.equal(result.chains.length, 1)
    const final = resultCheckpoint(h.events.at(-1)!)
    assert.equal(final.phase, "final")
    assert.deepEqual(final.candidate.response.compilation.gaps, [])
    assert.equal(final.candidate.response.compilation.coverage.find(row => row.actionRef === "a-0002")?.exclusionRule,
      "native_dom_lookup_observation/v1")
    const saved = h.repository.job(h.job.taskId, h.job.id)
    const exploration = saved.authoring!.exploration as { sources: Array<{ artifact: { artifactId: string } }> }
    const source = h.repository.artifact(h.job.taskId, exploration.sources[0]!.artifact.artifactId).body as {
      result: { sourceGaps: Array<{ reason: string }> }
    }
    assert.equal(source.result.sourceGaps[0]!.reason, "natural_read_container_identity_changed")
    assert.deepEqual(h.order, ["prefix", "final", "source", "closed"])
  } finally { await h.close() }
})

test("同一探查上未解决的来源错误仍阻断final和候选链", async () => {
  const h = await harness(false, "unresolved")
  try {
    await assert.rejects(h.authoring.task(h.job, h.requirement, h.plan, null, h.signal), /hybrid_compilation_gaps/)
    const final = resultCheckpoint(h.events.at(-1)!)
    assert.ok(final.candidate.response.compilation.gaps.some(issue => issue.reason === "source_invalid"))
    assert.equal(h.repository.job(h.job.taskId, h.job.id).status, "failed")
    assert.equal(h.repository.draft(h.job.taskId), null)
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
    const saved = h.repository.job(h.job.taskId, h.job.id)
    const completed = storedStepBuilds(h.repository, saved)
    assert.equal(completed.length, 1)
    assert.equal(completed[0]!.stepId, h.step.id)
    assert.deepEqual(completed[0]!.nodes, finalBuild.nodes)
    assert.equal("payload" in completed[0]!, false)
    assert.equal("authorRequestId" in completed[0]!, false)
    // WHY：下一步的当前快照覆盖后，先前步骤仍通过同一准备拥有的产物展示；不会提前产生链路版本。
    const next = structuredClone(saved)
    next.status = "running"
    next.authoring!.build = { ...finalBuild, stepId: "next-step", phase: "prefix" }
    h.repository.saveJob(next)
    assert.deepEqual(storedStepBuilds(h.repository, h.repository.job(h.job.taskId, h.job.id)), completed)
    const projected = projectActivity({ ...next, type: "prepare", preparation: {
      phase: "preexecuting", candidatePlan: h.plan, inputRequest: null,
    } as NonNullable<TaskAuthoringJob["preparation"]> }, h.repository)
    assert.deepEqual(projected!.completedBuilds, completed)
    assert.equal(projected!.build!.stepId, "next-step")
    assert.doesNotThrow(() => taskAuthoringActivitySchema.parse(projected))
    const foreign = { ...saved, id: randomUUID() }
    assert.throws(() => storedStepBuilds(h.repository, foreign), /identity_mismatch/)
    h.repository.saveJob(saved)
    let calls = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
      browserCommandCount: () => calls,
      capability: async () => { calls++; return { outcome: "success", output } },
    } })
    assert.equal(run.status, "completed")
    assert.equal(calls, 1); assert.deepEqual(run.modelCalls, [])
    assert.equal(JSON.stringify(run.outputs).includes('"live"'), true)
    await checkSaveBoundary(h)
    await checkCandidateFailureBoundary(h)
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
  job.id = randomUUID(); job.status = "running"; delete job.authoring!.build; delete job.authoring!.sourceReceipt; delete job.authoring!.candidateStatus
  h.repository.saveJob(job)
  const build = new AuthoringBuild({ ...h, job, input: null, model: "controlled" }), event = h.events[0]!
  await build.accept(event, h.signal)
  const saved = h.repository.job(job.taskId, job.id)
  saved.authoring!.build!.retainedMetadata = { immutableSource: "preserved" }
  h.repository.saveJob(saved)
  await build.accept(event, h.signal)
  assert.deepEqual(h.repository.job(job.taskId, job.id), saved)
  await assert.rejects(build.accept({ ...event, digest: "0".repeat(64) }, h.signal), /checkpoint_digest_mismatch/)
  await assert.rejects(build.accept({ ...event, sequence: 3 }, h.signal), /sequence_mismatch/)
  await assert.rejects(build.accept({ ...event, id: randomUUID() }, h.signal), /owner_mismatch/)
  const ambiguity = resultCheckpoint(event)
  ambiguity.candidate.response.compilation.gaps.push({ id: "g-confirm", code: "missing_binding", actionRefs: [],
    clauseRefs: [], reason: "new_requirement_ambiguity", resolution: "confirm_intent" })
  const { canonicalDigest: _digest, ...body } = ambiguity.candidate.response.compilation
  ambiguity.candidate.response.canonicalPayload = JSON.stringify(body)
  ambiguity.candidate.response.compilation.canonicalDigest = createHash("sha256").update(ambiguity.candidate.response.canonicalPayload).digest("hex")
  const payload = JSON.stringify(ambiguity)
  await assert.rejects(build.accept({ ...event, sequence: 2, payload,
    digest: createHash("sha256").update(payload).digest("hex") }, h.signal), RequirementClarificationRequired)
  const afterAmbiguity = h.repository.job(job.taskId, job.id)
  assert.deepEqual(afterAmbiguity.authoring!.build, saved.authoring!.build)
  assert.equal(afterAmbiguity.authoring!.sourceReceipt!.sequence, 2)
  assert.equal(afterAmbiguity.authoring!.candidateStatus!.status, "failed")
  const finalEvent = { ...h.events[1]!, sequence: 3 }
  const originalSave = h.repository.saveJob.bind(h.repository)
  h.repository.saveJob = () => { throw new Error("controlled_disk_failure") }
  await assert.rejects(build.accept(finalEvent, h.signal), /hybrid_compilation_save_failed/)
  h.repository.saveJob = originalSave
  assert.deepEqual(h.repository.job(job.taskId, job.id), afterAmbiguity)
  const pending = build.accept(finalEvent, h.signal)
  const cancelled = { ...h.repository.job(job.taskId, job.id), status: "interrupted" as const }
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
  assert.equal("retainedMetadata" in activity!.build!, false)
  for (const phase of ["validating_sample", "awaiting_verification_input", "validating_verification", "ready"] as const) {
    assert.equal(projectActivity({ ...saved, type: "prepare",
      preparation: { phase, inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })!.build, undefined)
  }
  assert.deepEqual(h.repository.job(job.taskId, job.id).authoring!.build, saved.authoring!.build)
}

async function checkProjectionFailureBoundary(h: Awaited<ReturnType<typeof harness>>) {
  const job = structuredClone(h.job)
  job.id = randomUUID(); job.status = "running"; delete job.authoring!.build; delete job.authoring!.sourceReceipt; delete job.authoring!.candidateStatus
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
  const cancelled = new AbortController()
  let settle!: () => void, lateAcks = 0
  const cancellation = receiveCompilation(event,
    { onCompilation: async () => new Promise<void>(resolve => { settle = resolve }) },
    cancelled.signal, async () => { lateAcks++ })
  cancelled.abort(); settle()
  await assert.rejects(cancellation, error => error instanceof Error && error.name === "AbortError")
  assert.equal(lateAcks, 0)
}

async function checkCandidateFailureBoundary(h: Awaited<ReturnType<typeof harness>>) {
  const job = structuredClone(h.job)
  job.id = randomUUID(); job.status = "running"
  delete job.authoring!.build; delete job.authoring!.sourceReceipt; delete job.authoring!.candidateStatus
  h.repository.saveJob(job)
  const build = new AuthoringBuild({ ...h, job, input: null, model: "controlled" }), prefix = h.events[0]!
  await build.accept(prefix, h.signal)
  const snapshot = h.repository.job(job.taskId, job.id).authoring!.build
  const event = (sequence: number, payload: unknown): CompilationCheckpoint => {
    const value = JSON.stringify(payload)
    return { ...prefix, sequence, payload: value, digest: createHash("sha256").update(value).digest("hex") }
  }
  const acknowledgements: boolean[] = []
  const receive = (packet: CompilationCheckpoint) => receiveCompilation(packet,
    { onCompilation: (value, signal) => build.accept(value, signal) }, h.signal,
    async ack => { acknowledgements.push(ack.accepted) })
  const error = event(2, { ...parseCompilationCheckpoint(prefix),
    candidate: { kind: "error", stage: "annotation", code: "hybrid_semantic_annotation_failed" } })
  await receive(error)
  const failed = h.repository.job(job.taskId, job.id)
  assert.equal(failed.authoring!.sourceReceipt!.sequence, 2)
  assert.deepEqual(failed.authoring!.build, snapshot)
  assert.equal(failed.authoring!.candidateStatus!.code, "hybrid_semantic_annotation_failed")
  await receive(error)
  assert.deepEqual(h.repository.job(job.taskId, job.id), failed)
  await receive(event(3, { ...parseCompilationCheckpoint(prefix), candidate: { kind: "result", response: "invalid" } }))
  assert.equal(h.repository.job(job.taskId, job.id).authoring!.sourceReceipt!.sequence, 3)
  assert.deepEqual(h.repository.job(job.taskId, job.id).authoring!.build, snapshot)
  await assert.rejects(receive(event(4, { ...parseCompilationCheckpoint(prefix), stepId: "different-step" })), /step_input_mismatch/)
  assert.equal(h.repository.job(job.taskId, job.id).authoring!.sourceReceipt!.sequence, 3)
  await receive(event(4, parseCompilationCheckpoint(prefix)))
  const final = resultCheckpoint(h.events[1]!)
  await receive(event(5, { ...final, candidate: { kind: "error", stage: "compile", code: "hybrid_native_compilation_failed" } }))
  const current = h.repository.job(job.taskId, job.id)
  assert.equal(current.authoring!.sourceReceipt!.phase, "final")
  assert.equal(current.authoring!.sourceReceipt!.canonicalRequest, final.canonicalRequest)
  assert.equal(current.authoring!.build!.sequence, 4)
  assert.throws(() => build.finish({ canonicalRequest: final.canonicalRequest, sourceSuccess: true } as never), /hybrid_native_compilation_failed/)
  const activity = projectActivity({ ...current, type: "prepare", preparation: {
    phase: "compiling", inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })
  assert.equal(activity!.compilationStatus!.stale, true)
  assert.equal(activity!.compilationStatus!.status, "failed")
  assert.equal("sourceReceipt" in activity!, false)
  assert.equal(JSON.stringify(activity).includes("canonicalRequest"), false)
  assert.doesNotThrow(() => taskAuthoringActivitySchema.parse(activity))
  assert.deepEqual(acknowledgements, [true, true, true, false, true, true])
  const emptyJob = structuredClone(job)
  emptyJob.id = randomUUID(); emptyJob.status = "running"
  delete emptyJob.authoring!.build; delete emptyJob.authoring!.sourceReceipt; delete emptyJob.authoring!.candidateStatus
  h.repository.saveJob(emptyJob)
  const empty = new AuthoringBuild({ ...h, job: emptyJob, input: null, model: "controlled" })
  await empty.accept({ ...error, sequence: 1 }, h.signal)
  const noCandidate = h.repository.job(emptyJob.taskId, emptyJob.id)
  assert.equal(noCandidate.authoring!.build, undefined)
  assert.equal(noCandidate.authoring!.sourceReceipt!.sequence, 1)
  const view = projectActivity({ ...noCandidate, type: "prepare", preparation: {
    phase: "preexecuting", inputRequest: null } as NonNullable<TaskAuthoringJob["preparation"]> })
  assert.equal(view!.build, undefined)
  assert.equal(view!.compilationStatus!.status, "failed")
  assert.doesNotThrow(() => taskAuthoringActivitySchema.parse(view))
}
