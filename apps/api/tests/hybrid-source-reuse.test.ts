import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { projectRoot } from "./helpers.js"
import { reusableHybridSources } from "../src/task-chain/hybrid-source-reuse.js"

// Source I/O is synthetic; stored source lookup is real. Production natural authoring must not reuse its legacy v1 request.
test("自然生产重试不复用历史 v1 authority 来源", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-reuse-")), raw = hybridFixture("native-navigation")
  let explorations = 0, compilations = 0
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("legacy_called") },
    recompile: async (input) => { compilations++; return recompileHybridSource({ ...input, root: projectRoot }) },
    withAuthoring: async (_input, work) => { explorations++; return work({ author: async (source) => {
      const compiled = hybridFixture("native-navigation", source)
      return { output: null, request: compiled.request, response: compiled.response,
        history: { localRef: compiled.request.trace.source.historyRef, digest: compiled.request.trace.digest },
        sourceSuccess: true, sourceValidated: true, browserCommands: 1, forkSourceDigest: "a".repeat(64),
        modelCalls: (["agent", "judge"] as const).map((purpose) => ({ callId: randomUUID(), purpose,
          intendedAt: "2026-09-16T00:00:00.000Z", status: "completed", reportedInvocations: 1, model: "fixture" })) }
    } }) } }
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]), upstreamBrowserRuntime: upstream })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown += '\n```bat-compilation/v1\n' + JSON.stringify({
      version: 1, steps: { perform: { clauses: raw.request.requirement.clauses, control: raw.request.control, acceptedAnnotations: [] } } }) + '\n```\n' })
    const requirement = application.taskChain.snapshot(taskId).requirement!, repository = application.taskChain.repository
    let plan = hybridPlan(raw)
    plan.taskId = taskId; plan.requirement = { id: requirement.id, version: requirement.version,
      revision: requirement.revision, digest: digestJson(requirement) }
    plan = repository.savePlan(plan)
    const next = repository.nextChainVersion.bind(repository)
    let interrupt = true
    repository.nextChainVersion = (...args) => { if (interrupt) { interrupt = false; throw new Error("fixture_writer_interrupted") }; return next(...args) }
    for (const status of ["failed", "completed"]) {
      const requestId = randomUUID()
      application.taskChain.dispatch(taskId, { type: "generate_chain", requestId,
        plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, stepId: "perform", input: { url: "https://fixture.invalid/next" } })
      await waitFor(() => repository.jobs(taskId).at(-1)?.status === status, 10000)
    }
    const [failed, retried] = repository.jobs(taskId)
    assert.match(failed!.reason ?? "", /fixture_writer_interrupted/)
    assert.deepEqual([explorations, compilations], [2, 0])
    assert.equal(retried!.audit?.reportedInvocations, 2)
    assert.equal(retried!.authoring?.consumption.explorationSessions, 1)
    assert.equal(retried!.authoring?.consumption.explorationToolCalls, 1)
    assert.equal("reusedFromJobId" in (retried!.authoring?.exploration as object), false)
    const chain = repository.chains(taskId)[0]!
    assert.equal(chain.validation.status, "candidate")
    assert.equal(repository.chains(taskId).length, 1)
    const progression = (url: string) => ({ resolve: () => ({ url }), accept() {}, finish() {} })
    assert.equal(reusableHybridSources(repository, retried!, requirement, plan,
      progression("https://fixture.invalid/different")), undefined)
    const sources = failed!.authoring!.exploration as { sources: Array<{ artifact: { artifactId: string; digest: string } }> }
    const row = repository.artifact(taskId, sources.sources[0]!.artifact.artifactId)
    const body = { ...(row.body as Record<string, unknown>), closed: false }
    const digest = digestJson(body as never), unclosed = structuredClone(failed!)
    ;(unclosed.authoring!.exploration as typeof sources).sources[0]!.artifact.digest = digest
    const unclosedRepository = { jobs: () => [unclosed], artifact: () => ({ ...row, body, digest }) }
    assert.equal(reusableHybridSources(unclosedRepository as never, retried!, requirement, plan,
      progression("https://fixture.invalid/next")), undefined)
    const corruptedRepository = { jobs: () => [failed!], artifact: () => ({ ...row, body }) }
    assert.throws(() => reusableHybridSources(corruptedRepository as never, retried!, requirement, plan,
      progression("https://fixture.invalid/next")), /hybrid_source_artifact_digest_mismatch/)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})
