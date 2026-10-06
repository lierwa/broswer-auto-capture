import assert from "node:assert/strict"
import test from "node:test"
import type { TaskAuthoringJob } from "@browser-capture/contracts"
import { TaskChainAuthoring } from "../src/task-chain/authoring.js"
import { DomainError } from "../src/errors.js"
import { UpstreamProtocolError } from "../src/upstream-browser/service.js"
import { assertNaturalHumanSegment } from "../src/upstream-browser/hybrid-natural-human.js"
import { digestNaturalPayload } from "../src/upstream-browser/hybrid-natural-payload.js"

// WHY：恢复错误不可隐藏为500或结束原等待；成功重试收束同一等待，错误正文不可持久化。
test("准备人工恢复失败保留等待和安全代码，之后仍可恢复", async () => {
  const job = { id: "job", taskId: "task", sequence: 1, status: "waiting_for_human", waitpoint: {
    id: "wait", owner: "authoring_job", ownerId: "job", status: "waiting", resolvedAt: null,
  } } as TaskAuthoringJob
  const saved: string[] = []
  const repository = { job: () => job, saveJob: (value: TaskAuthoringJob) => saved.push(value.reason ?? "") }
  const authoring = new TaskChainAuthoring(repository as never, {} as never, {} as never)
  let failed = true
  const active = { job, waitpointId: "wait", signal: new AbortController().signal, resuming: false,
    resume: async () => { if (failed) throw new UpstreamProtocolError("hybrid_runner_failed",
      "ValueError:hybrid_human_resume_state_mismatch:https://private.test/secret") } }
  const waits = Reflect.get(authoring, "humanWaits") as Map<string, typeof active>
  waits.set(job.id, active)
  await assert.rejects(authoring.resumeHuman("task", "job", 1, "wait"), error => error instanceof DomainError
    && error.status === 409 && error.code === "authoring_human_resume_failed")
  assert.equal(job.status, "waiting_for_human"); assert.equal(job.waitpoint!.status, "waiting")
  assert.equal(waits.get(job.id), active); assert.equal(active.resuming, false)
  assert.match(job.reason ?? "", /hybrid_human_resume_state_mismatch/)
  assert.ok(saved.every(value => !value.includes("private.test")))
  failed = false; await authoring.resumeHuman("task", "job", job.sequence, "wait")
  assert.equal(job.status, "running"); assert.equal(job.waitpoint!.status, "completed")
  assert.equal(waits.has(job.id), false)
})

function humanFixture(legacy: boolean) {
  const params = { reason: "login", prompt: "Complete login", ...(legacy ? { resumeUrl: "https://example.test/list" } : {}) }
  const before = { sessionId: "s", tabId: "t", url: "https://example.test/login" }
  const after = { ...before, url: legacy ? "https://example.test/list" : "https://example.test/list?new_nonce=value" }
  const result = { ref: "result", digest: "a".repeat(64) }
  const proof = { schemaVersion: legacy ? "bat.human-resume/v1" : "bat.human-resume/v2", actionRef: "action",
    waitpointId: "10000000-0000-4000-8000-000000000001", params,
    argsDigest: digestNaturalPayload(JSON.stringify(params)), before, after, resumed: true, resultDigest: result.digest }
  const fact = { id: "fact", kind: "verified_human_resume", value: proof,
    sourceRefs: [{ ref: "fact", digest: digestNaturalPayload(JSON.stringify(proof)) }] }
  const action = { id: "action", name: "bat_request_human", status: "succeeded", effect: "read", args: params,
    resultRef: result, preObservationRef: "pre", postObservationRef: "post" }
  const request = { trace: { actions: [action], observations: [
    { id: "pre", tabId: "t", url: before.url, facts: [] }, { id: "post", tabId: "t", url: after.url, facts: [fact] },
  ] } }
  const human = { reason: "login", prompt: params.prompt, resumeWhen: legacy
    ? { operator: "equals", path: ["url"], expected: { source: "constant", value: after.url } }
    : { operator: "exists", path: ["url"] } }
  const segment = { id: "segment", kind: "deterministic", operation: { name: "browser.wait-for-human", human },
    target: null, bindings: [], outputs: [], expectedEffect: { kind: "read" }, proofRefs: [result, ...fact.sourceRefs],
    postconditions: legacy ? [{ kind: "url", equals: after.url, clauseRef: fact.id }] : [] }
  const compilation = { coverage: [{ ownerSegmentId: "segment", disposition: "compiled", actionRef: "action" }] }
  return { proof, segment, request, compilation, human }
}

// WHY：新旧Python证据都必须经过TS消费者；不能混用v1/v2或把异tab证明放进发布链路。
test("人工证据准入保留v1条件并支持v2实际跳转，拒绝改写身份和恢复条件", () => {
  for (const legacy of [false, true]) {
    const f = humanFixture(legacy)
    const validate = () => assertNaturalHumanSegment(f.segment as never, f.request as never,
      f.compilation as never, () => {})
    assert.deepEqual(validate(), f.human)
    f.proof.after.tabId = "foreign"
    assert.throws(validate, /resume_evidence_mismatch/)
    f.proof.after.tabId = "t"; f.segment.operation.human.prompt = "invented"
    assert.throws(validate, /human_contract_mismatch/)
  }
})
