import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import { CONTRACT_VERSION } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"

const budget = { maxTransitions: 30, maxBrowserCommands: 10, maxActiveMs: 30_000,
  maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 }

test("v11 新表保留旧 JSON 原字节并只读分类", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-contract-")), taskId = randomUUID()
  let store = await ProductStore.open(directory)
  store.taskAction({ type: "create", requestId: taskId })
  const created = store.list()[0]!.id
  await store.close()
  const file = path.join(directory, "workbench.sqlite"), legacyBody = ' { "legacy": true, "rows": [1, 2] }\n'
  const raw = new Database(file)
  try {
    raw.exec("DROP TABLE originAccessBlocks; DROP TABLE originAccessEvents; DROP TABLE taskArtifacts; DROP TABLE taskExecutions; DROP TABLE taskAuthoringJobs; DROP TABLE taskContracts; PRAGMA user_version=9")
    raw.prepare("INSERT INTO plans(id,taskId,body) VALUES(?,?,?)").run("legacy-plan", created, legacyBody)
  } finally { raw.close() }
  store = await ProductStore.open(directory)
  try {
    const repository = new TaskContractRepository(store)
    assert.equal(repository.legacyOriginal(created, "plans", "legacy-plan"), legacyBody)
    assert.deepEqual(repository.legacy(created), [{ source: "plans", id: "legacy-plan", status: "legacy_read_only",
      reason: "缺少新协议版本，仅可读取或导出。" }])
    const migrated = new Database(file, { readonly: true })
    try { assert.equal(migrated.pragma("user_version", { simple: true }), 11) } finally { migrated.close() }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("服务重启把未持久排队器的工作收敛为可解释终态", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-recovery-"))
  let store = await ProductStore.open(directory)
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
  const repository = new TaskContractRepository(store), now = new Date().toISOString()
  const planId = randomUUID(), requirementId = randomUUID(), authorizationId = randomUUID(), digest = "a".repeat(64)
  repository.saveJob({ id: randomUUID(), taskId, type: "plan", key: "queued-plan", status: "queued", sequence: 0,
    reason: null, resultId: null, audit: null, createdAt: now, updatedAt: now })
  repository.saveRun({ contractVersion: CONTRACT_VERSION, kind: "run", binding: { runId: randomUUID(),
    invocationId: randomUUID(), taskId, authorizationId, plan: { id: planId, version: 1, digest },
    chain: { id: randomUUID(), version: 1, digest }, inputDigest: digestJson({}) }, mode: "sample", input: {}, budget,
    sequence: 0, status: "queued", outputs: {}, checkpoint: null, consumed: { transitions: 0, browserCommands: 0,
      activeMs: 0, llmCalls: 0, invocations: 0 }, outcome: null, events: [], modelCalls: [], auditComplete: true })
  repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId,
    authorizationId, plan: { id: planId, version: 1, digest }, requirement: { id: requirementId, version: 1,
      revision: 1, digest }, input: {}, inputDigest: digestJson({}), status: "queued", sequence: 0,
    currentStepId: null, currentRunId: null, steps: [], output: null, reason: "等待执行。", createdAt: now, updatedAt: now })
  await store.close()
  store = await ProductStore.open(directory)
  try {
    const recovered = new TaskContractRepository(store)
    assert.equal(recovered.jobs(taskId)[0]?.status, "interrupted")
    assert.equal(recovered.runs(taskId)[0]?.status, "failed")
    assert.equal(recovered.runs(taskId)[0]?.outcome?.status, "failed")
    assert.equal(recovered.executions(taskId)[0]?.status, "paused")
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})
