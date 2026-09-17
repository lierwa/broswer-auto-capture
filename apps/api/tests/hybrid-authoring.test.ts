import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { hybridArtifactMediaType, readHybridArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"

// I/O is synthetic; the HTTP command, fork compilation, artifact database, LangGraph and validation promotion are real.
test("正式 v2 authoring 在关闭来源后写 candidate，样本与换输入沿原有队列验证", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-authoring-")), raw = hybridFixture()
  let sourceOpen = false, sources = 0, replays = 0
  const forbidden = () => { throw new Error("legacy_or_unplanned_model_called") }
  const upstream: UpstreamBrowserRuntime = { withSession: forbidden, withAuthoring: async (_input, work) => {
    sourceOpen = true; sources++
    try { return await work({ author: async (source) => {
      const compiled = hybridFixture("navigation", source)
      return { output: null, request: compiled.request, response: compiled.response,
        history: { localRef: compiled.request.trace.source.historyRef, digest: compiled.request.trace.digest },
        sourceSuccess: true, sourceValidated: true, browserCommands: 1, forkSourceDigest: "a".repeat(64),
        modelCalls: (["agent", "judge"] as const).map((purpose) => ({ callId: randomUUID(), purpose,
          intendedAt: "2026-09-16T00:00:00.000Z", status: "completed", reportedInvocations: 1, model: "fixture" })) }
    } }) } finally { sourceOpen = false }
  }, withCapabilities: async (_input, work) => {
    assert.equal(sourceOpen, false); replays++
    let commands = 0
    return work({ browserCommandCount: () => commands, capability: async () => { commands++; return { outcome: "success", output: null } } })
  } }
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
    upstreamBrowserRuntime: upstream, browserExecutor: forbidden })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown += '\n```bat-compilation/v1\n' + JSON.stringify({
      version: 1, steps: { perform: { clauses: raw.request.requirement.clauses, control: raw.request.control,
        acceptedAnnotations: raw.request.acceptedAnnotations } } }) + '\n```\n' })
    const requirement = application.taskChain.snapshot(taskId).requirement!, repository = application.taskChain.repository
    let plan = hybridPlan(raw)
    plan.taskId = taskId; plan.requirement = { id: requirement.id, version: requirement.version,
      revision: requirement.revision, digest: digestJson(requirement) }
    plan = repository.savePlan(plan)
    const save = repository.saveArtifact.bind(repository)
    repository.saveArtifact = (...args) => { assert.equal(sourceOpen, false); return save(...args) }
    const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
      headers: { host: "localhost:3001", "sec-fetch-site": "same-origin" }, payload: {
        type: "generate_chain", requestId: randomUUID(), plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
        stepId: "perform", input: { url: "https://fixture.invalid/next" } } })
    assert.equal(response.statusCode, 202, response.body)
    await waitFor(() => repository.jobs(taskId)[0]?.status !== "running" && repository.jobs(taskId)[0]?.status !== "queued", 10000)
    const job = repository.jobs(taskId)[0]!
    assert.equal(job.status, "completed", job.reason ?? "")
    const chain = repository.chains(taskId)[0]!
    assert.equal(chain.validation.status, "candidate")
    const annotations = job.authoring!.annotations as { artifacts: Array<{ artifact: { artifactId: string } }> }
    const artifactResponse = await application.app.inject({ method: "GET", url: `/api/task-chain/artifact?taskId=${taskId}&artifactId=${annotations.artifacts[0]!.artifact.artifactId}`,
      headers: { host: "localhost:3001" } })
    assert.equal(artifactResponse.json().mediaType, hybridArtifactMediaType)
    assert.equal(readHybridArtifact(artifactResponse.json().body).source.closed, true)
    for (const [mode, url] of [["sample", "https://fixture.invalid/next"], ["verification", "https://fixture.invalid/other"]] as const) {
      application.taskChain.dispatch(taskId, { type: "validate_chain", requestId: randomUUID(),
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, mode, input: { url } })
      await waitFor(() => repository.chain(taskId, chain.id, chain.version).validation.evidence.some((item) => item.phase === mode)
        || repository.runs(taskId).some((run) => run.mode === mode && run.status === "failed"), 10000)
      assert.equal(repository.runs(taskId).find((run) => run.mode === mode)?.status, "completed")
    }
    assert.equal(repository.chain(taskId, chain.id, chain.version).validation.status, "verified")
    assert.deepEqual([sources, replays], [1, 2])
    assert.ok(repository.runs(taskId).every((run) => run.modelCalls.length === 0))
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

for (const failure of ["later_step", "cleanup"] as const) {
  test(`正式来源保留：${failure} 失败后保存已取得证据且不写候选`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-partial-")), raw = hybridFixture()
    let open = false, calls = 0
    const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("legacy_called") },
      withAuthoring: async (_input, work) => {
        open = true
        try { return await work({ author: async (source) => {
          if (++calls === 2) throw new Error("fixture_later_step_failed")
          const compiled = hybridFixture("navigation", source)
          return { output: null, request: compiled.request, response: compiled.response,
            history: { localRef: compiled.request.trace.source.historyRef, digest: compiled.request.trace.digest },
            sourceSuccess: true, sourceValidated: true, browserCommands: 1, forkSourceDigest: "a".repeat(64),
            modelCalls: (["agent", "judge"] as const).map((purpose) => ({ callId: randomUUID(), purpose,
              intendedAt: "2026-09-16T00:00:00.000Z", status: "completed", reportedInvocations: 1, model: "fixture" })) }
        } }) } finally { open = false; if (failure === "cleanup") throw new Error("fixture_cleanup_failed") }
      } }
    const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]), upstreamBrowserRuntime: upstream })
    try {
      const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
      confirmedDraft(application.store, taskId)
      const authority = { clauses: raw.request.requirement.clauses, control: raw.request.control, acceptedAnnotations: [] }
      application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown += '\n```bat-compilation/v1\n'
        + JSON.stringify({ version: 1, steps: { perform: authority, next: authority } }) + '\n```\n' })
      const requirement = application.taskChain.snapshot(taskId).requirement!, repository = application.taskChain.repository
      let plan = hybridPlan(raw)
      plan.taskId = taskId; plan.requirement = { id: requirement.id, version: requirement.version,
        revision: requirement.revision, digest: digestJson(requirement) }
      if (failure === "later_step") plan.steps.push({ ...structuredClone(plan.steps[0]!), id: "next",
        dependsOn: ["perform"], chain: { ...plan.steps[0]!.chain, id: randomUUID() } })
      if (failure === "later_step") plan.budget = Object.fromEntries(Object.entries(plan.budget)
        .map(([key, value]) => [key, key === "maxDepth" ? value : value * 2])) as typeof plan.budget
      plan = repository.savePlan(plan)
      const save = repository.saveArtifact.bind(repository)
      repository.saveArtifact = (...args) => { assert.equal(open, false); return save(...args) }
      application.taskChain.dispatch(taskId, { type: failure === "later_step" ? "generate_task_chains" : "generate_chain",
        requestId: randomUUID(), plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
        ...(failure === "cleanup" ? { stepId: "perform" } : {}), input: { url: "https://fixture.invalid/next" } })
      await waitFor(() => repository.jobs(taskId)[0]?.status === "failed", 10000)
      const job = repository.jobs(taskId)[0]!
      assert.match(job.reason ?? "", failure === "cleanup" ? /fixture_cleanup_failed/ : /fixture_later_step_failed/)
      const sources = job.authoring!.exploration as { sources: Array<{ artifact: { artifactId: string } }> }
      assert.equal(sources.sources.length, 1)
      const source = repository.artifact(taskId, sources.sources[0]!.artifact.artifactId).body as { closed: boolean }
      assert.equal(source.closed, failure !== "cleanup")
      assert.equal(repository.chains(taskId).length, 0)
      assert.equal(repository.runs(taskId).length, 0)
    } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
  })
}
