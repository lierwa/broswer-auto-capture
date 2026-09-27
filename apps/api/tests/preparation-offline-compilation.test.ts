import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import type { TaskAuthoringJob, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { TaskChainAuthoring } from "../src/task-chain/authoring.js"
import { reusableHybridSources } from "../src/task-chain/hybrid-source-reuse.js"
import { UpstreamProtocolError } from "../src/upstream-browser/service.js"
import { hybridSourceMediaType } from "../src/upstream-browser/hybrid-artifact.js"

const hash = "a".repeat(64)
const selection = { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "medium" as const }

function fixture() {
  const taskId = randomUUID(), sourceJobId = randomUUID()
  const requirement = { id: randomUUID(), taskId } as TaskRequirement
  const plan = { steps: [{ id: "step", invocation: { mode: "once" },
    outputContract: { schema: { type: "null" } } }] } as TaskPlan
  const job = { id: randomUUID(), taskId, key: "same-confirmed-requirement", type: "prepare", status: "queued",
    sequence: 0, browserRunId: null, reason: null,
    preparation: { phase: "preexecuting", planCandidates: [] } } as unknown as TaskAuthoringJob
  const saved: TaskAuthoringJob[] = [], calls = { browser: 0, compiler: 0, model: 0 }
  const repository = { saveJob: (value: TaskAuthoringJob) => { saved.push(structuredClone(value)); return value },
    job: () => ({ status: "completed" }) }
  const ai = { selection: () => selection, prepare: async () => ({ selection,
    generateObject: async () => { calls.model++; throw new Error("unexpected_model_call") } }) }
  const upstream = { withAuthoring: async () => { calls.browser++; throw new Error("unexpected_browser_call") },
    recompile: async () => { calls.compiler++; throw new UpstreamProtocolError("hybrid_runner_failed",
      "ValueError:hybrid_action_registry_mismatch") } }
  const authoring = new TaskChainAuthoring(repository as never, ai as never, upstream as never)
  return { job, sourceJobId, requirement, plan, authoring, calls, saved }
}

function naturalRequest() {
  return { compilerVersion: "bat-hybrid/2", actionRegistryVersion: hash,
    requirement: { id: "requirement", version: 1, text: "task", taskText: "task", sourceDigest: hash, digest: hash },
    plan: { id: "plan", version: 1, sourceDigest: hash, digest: hash, stepId: "step",
      inputSchemaDigest: hash, outputSchemaDigest: hash, callMode: "once", entryUrls: [],
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" }, semanticOperations: [] },
    runtimeInputSchema: { type: "null" }, trace: { digest: hash, source: { historyRef: "saved" },
      actions: [], observations: [] } }
}

test("离线恢复缺少精确来源时失败，且不创建浏览器 owner 或浏览器会话", async () => {
  const { job, sourceJobId, requirement, plan, authoring, calls, saved } = fixture()
  await assert.rejects(authoring.task(job, requirement, plan, null,
    new AbortController().signal, sourceJobId), /hybrid_offline_source_unavailable/)
  assert.deepEqual(calls, { browser: 0, compiler: 0, model: 0 })
  assert.equal(job.browserRunId, null)
  assert.equal(job.status, "failed")
  assert.equal(job.authoring?.stage, "compiling")
  assert.equal(job.audit?.purpose, "chain_offline_compilation")
  assert.equal(saved.at(-1)?.status, "failed")
})

test("旧动作注册不兼容时离线恢复停止，不回退为浏览器重跑", async () => {
  const { job, sourceJobId, requirement, plan, authoring, calls } = fixture()
  const source = { step: plan.steps[0], stepInput: null,
    result: { canonicalRequest: JSON.stringify(naturalRequest()), sourceGaps: [], modelCalls: [] } }
  authoring.assertReusableSources = () => ({ sources: [source], exploration: { mode: "workflow-use-authoring/v3",
    sources: [], reusedFromJobId: sourceJobId } }) as never
  await assert.rejects(authoring.task(job, requirement, plan, null,
    new AbortController().signal, sourceJobId), /hybrid_action_registry_mismatch/)
  assert.deepEqual(calls, { browser: 0, compiler: 1, model: 0 })
  assert.equal(job.browserRunId, null)
  assert.equal(job.status, "failed")
})

test("来源候选精确绑定 job 和产物拥有者，拒绝借用另一失败记录的产物", () => {
  const { job, requirement, plan } = fixture()
  const sourceId = randomUUID(), otherId = randomUUID(), sourceArtifactId = randomUUID()
  const candidate = (id: string, artifactId: string) => ({ id, key: job.key, status: "failed",
    authoring: { stage: "compiling", exploration: { mode: "workflow-use-authoring/v3",
      sources: [{ stepId: "step", closed: true, artifact: { artifactId, digest: digestJson({}), mediaType: hybridSourceMediaType } }] } } })
  const accessed: string[] = []
  const repository = { job: () => candidate(sourceId, sourceArtifactId),
    artifact: (_taskId: string, artifactId: string) => { accessed.push(artifactId)
      return { runId: otherId, mediaType: hybridSourceMediaType, digest: digestJson({}), body: {} } } }
  assert.throws(() => reusableHybridSources(repository as never, job, requirement, plan,
    { resolve: () => null, acceptSource: () => {}, finish: () => {} }, sourceId), /hybrid_source_artifact_digest_mismatch/)
  assert.deepEqual(accessed, [sourceArtifactId])
})


test("历史来源合同只供查看，不能作为当前离线恢复输入", () => {
  const { job, requirement, plan } = fixture()
  let reads = 0
  const repository = { job: () => ({ id: randomUUID(), key: job.key, status: "failed",
    authoring: { stage: "compiling", exploration: { mode: "workflow-use-authoring/v2", sources: [
      { stepId: "step", artifact: { artifactId: randomUUID(), digest: hash,
        mediaType: "application/vnd.bat.workflow-use-source+json;version=2" } }] } } }),
    artifact: () => { reads++; throw new Error("old_source_must_not_be_read") } }
  assert.equal(reusableHybridSources(repository as never, job, requirement, plan,
    { resolve: () => null, acceptSource: () => {}, finish: () => {} }, randomUUID()), undefined)
  assert.equal(reads, 0)
})
