import assert from "node:assert/strict"
import test from "node:test"
import type { TaskAuthoringJob } from "@browser-capture/contracts"
import { TaskChainAuthoring } from "../src/task-chain/authoring.js"
import { canResumeSavedPlan } from "../src/task-chain/preparation.js"

function failedBeforeBrowser(): TaskAuthoringJob {
  return { type: "prepare", status: "failed", preparation: {
    phase: "preexecuting", plan: { id: "plan", version: 1, digest: "digest" }, candidatePlan: { id: "plan" },
    chains: [], draft: null,
  }, authoring: { stage: "exploring", failureLayer: "workflow-use 受管源码校验",
    progress: { events: [], actionsStarted: 0, modelCallsStarted: 0 },
    consumption: { explorationToolCalls: 0, compilationCalls: 0 },
    exploration: { mode: "workflow-use-authoring/v2", sources: [] } },
  } as unknown as TaskAuthoringJob
}

test("saved plan resume requires a managed-source failure before any Browser or model action", () => {
  const baseline = failedBeforeBrowser()
  assert.equal(canResumeSavedPlan(baseline), true)
  for (const change of [
    (job: TaskAuthoringJob) => { job.authoring!.progress!.actionsStarted = 1 },
    (job: TaskAuthoringJob) => { job.authoring!.progress!.modelCallsStarted = 1 },
    (job: TaskAuthoringJob) => { job.authoring!.consumption.explorationToolCalls = 1 },
    (job: TaskAuthoringJob) => { job.authoring!.exploration = { sources: [{ stepId: "step" }] } },
    (job: TaskAuthoringJob) => { job.authoring!.failureLayer = "browser-use 探索" },
  ]) {
    const job = structuredClone(baseline)
    change(job)
    assert.equal(canResumeSavedPlan(job), false)
  }
})

test("resume preflight verifies managed source before AI preparation or Browser control", async () => {
  const calls: string[] = []
  const job = { ...failedBeforeBrowser(), audit: null, authoring: undefined, reason: null, sequence: 0,
    preparation: { ...failedBeforeBrowser().preparation!, priorAudits: [] } } as TaskAuthoringJob
  const authoring = new TaskChainAuthoring({ saveJob: () => calls.push("save") } as never,
    { selection: () => { calls.push("selection"); return {} },
      prepare: async () => { calls.push("prepare"); throw new Error("model_unexpected") } } as never,
    { sourceDigest: async () => { calls.push("sourceDigest"); throw new Error("workflow_fork_stale") },
      withAuthoring: async () => { calls.push("browser"); throw new Error("browser_unexpected") } } as never)
  await assert.rejects(authoring.task(job, {} as never, {} as never, null, new AbortController().signal,
    undefined, true), /workflow_fork_stale/)
  assert.deepEqual(calls, ["save", "sourceDigest", "save"])
  assert.equal(job.status, "failed")
  assert.equal(job.audit?.reportedInvocations, 0)
  assert.equal(job.authoring?.failureLayer, "workflow-use 受管源码校验")
  assert.equal(canResumeSavedPlan(job), true)
})
