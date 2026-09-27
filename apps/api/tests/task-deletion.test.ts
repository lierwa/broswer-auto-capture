import assert from "node:assert/strict"
import test from "node:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { PiAgentSessionBindingStore, stableId, type PiSessionBinding } from "@agent-platform/pi-agent-session/platform-internal"
import { BrowserJournal } from "@browser-capture/browser"
import { createApplication } from "../src/app.js"
import { testAIModel } from "./fixtures/ai-model.js"
import { projectRoot } from "./helpers.js"

const headers = { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }
const agentId = "browser-capture.requirement-interview"
async function fixture(run: (context: Awaited<ReturnType<typeof createApplication>> & { directory: string }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-delete-"))
  const app = await createApplication({ root: projectRoot, directory,
    aiModel: testAIModel(async function* () { yield { type: "turn_succeeded", outputText: "" } }) })
  try { await run({ ...app, directory }) }
  finally { await app.app.close(); await rm(directory, { recursive: true, force: true }) }
}
function binding(conversationId: string, sessionFile: string): PiSessionBinding {
  const hash = createHash("sha256").update(conversationId).digest("hex")
  return { bindingId: stableId(conversationId), conversationId, provider: "fixture", model: "fixture", modelBindingId: randomUUID(),
    instructionHash: hash, cwd: projectRoot, sessionFile, sessionId: randomUUID(), rootEntryId: randomUUID(),
    cursor: { messageHashes: [hash], canonicalLeafId: randomUUID(), continuationLeafId: randomUUID(), candidateEntryId: randomUUID(),
      candidateHash: hash, privateAncestryHash: hash } }
}
async function piBinding(directory: string, conversationId: string, sessionFile: string) {
  const root = path.join(directory, "pi-agent-session")
  const store = await PiAgentSessionBindingStore.open(root, agentId)
  await store.set(binding(conversationId, sessionFile))
}
async function piSessionFile(directory: string, conversationId: string) {
  const file = path.join(directory, "pi-agent-session", "sessions", stableId(agentId), `${conversationId}.jsonl`)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, "fixture")
  return file
}
function seedOwnedRows(file: string, taskId: string) {
  const db = new Database(file)
  db.pragma("foreign_keys = ON")
  const jobId = randomUUID(), browserRunId = randomUUID(), executionId = randomUUID(), oldPlan = randomUUID(), oldExecution = randomUUID()
  const runId = randomUUID(), reviewId = randomUUID(), now = new Date().toISOString()
  try {
    db.prepare("INSERT INTO plans(id,taskId,body) VALUES(?,?,?)").run(oldPlan, taskId, "{}")
    db.prepare("INSERT INTO executions(id,taskId,planId,status,body) VALUES(?,?,?,?,?)")
      .run(oldExecution, taskId, oldPlan, "completed", "{}")
    db.prepare("INSERT INTO chains(id,taskId,executionId,body) VALUES(?,?,?,?)")
      .run(randomUUID(), taskId, oldExecution, "{}")
    db.prepare("INSERT INTO taskContracts(recordId,taskId,kind,entityId,version,digest,body,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(randomUUID(), taskId, "plan", randomUUID(), 1, "fixture", "{}", now, now)
    db.prepare("INSERT INTO taskAuthoringJobs(id,taskId,type,status,sequence,updatedAt,body) VALUES(?,?,?,?,?,?,?)")
      .run(jobId, taskId, "prepare", "completed", 0, now, JSON.stringify({ browserRunId }))
    db.prepare("INSERT INTO taskExecutions(id,taskId,planId,status,sequence,createdAt,updatedAt,body) VALUES(?,?,?,?,?,?,?,?)")
      .run(executionId, taskId, oldPlan, "completed", 0, now, now,
        JSON.stringify({ reviews: [{ id: reviewId }], cleanup: { status: "confirmed" } }))
    db.prepare("INSERT INTO taskExecutionCandidates(executionId,taskId,draftId,draftRevision,draftChecksum,body,createdAt) VALUES(?,?,?,?,?,?,?)")
      .run(executionId, taskId, randomUUID(), 0, "fixture", "{}", now)
    db.prepare("INSERT INTO taskExecutionCleanupAudits(id,taskId,executionId,attempt,source,body,createdAt) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), taskId, executionId, 1, "runner", "{}", now)
    db.prepare("INSERT INTO taskDrafts(taskId,id,revision,checksum,body,updatedAt) VALUES(?,?,?,?,?,?)")
      .run(taskId, randomUUID(), 0, "fixture", "{}", now)
    db.prepare("INSERT INTO taskReleases(recordId,taskId,releaseId,version,digest,body,createdAt) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), taskId, randomUUID(), 1, "fixture", "{}", now)
    db.prepare("INSERT INTO taskArtifacts(artifactId,taskId,runId,mediaType,digest,body,createdAt) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), taskId, runId, "application/json", "fixture", "{}", now)
    db.prepare("INSERT INTO browserRuns(runId,taskId,createdAt,body) VALUES(?,?,?,?)")
      .run(runId, taskId, now, JSON.stringify({ status: "succeeded" }))
    db.prepare("INSERT INTO sourceResolutions(taskId,id,revision,body) VALUES(?,?,?,?)")
      .run(taskId, randomUUID(), 0, "{}")
    db.prepare("INSERT INTO researchRuns(id,taskId,body) VALUES(?,?,?)")
      .run(randomUUID(), taskId, "{}")
    db.prepare("INSERT INTO originAccessEvents(id,origin,runId,action,occurredAt) VALUES(?,?,?,?,?)")
      .run(randomUUID(), "https://example.com", runId, "read", 1)
    db.prepare("INSERT INTO originAccessBlocks(origin,runId,reason,blockedUntil,updatedAt) VALUES(?,?,?,?,?)")
      .run("https://example.com", runId, "pause", 100, 1)
    db.prepare("INSERT INTO operations(scope,requestId,digest,resultId) VALUES(?,?,?,?)")
      .run("task-execution:review", randomUUID(), "fixture", reviewId)
    db.prepare("INSERT INTO operations(scope,requestId,digest,resultId) VALUES(?,?,?,?)")
      .run("task-chain:old-revision", randomUUID(), "fixture", randomUUID())
    return { jobId, browserRunId, runId }
  } finally { db.close() }
}

test("正式删除只移除目标任务、可证明的旧操作与 Pi/Browser 私有状态", async () => fixture(async ({ app, store, taskChain, directory }) => {
  const target = store.taskAction({ type: "create", requestId: randomUUID() })
  const other = store.taskAction({ type: "create", requestId: randomUUID() })
  store.taskAction({ type: "archive", id: target, archived: true })
  const { jobId, browserRunId, runId } = seedOwnedRows(path.join(directory, "workbench.sqlite"), target)
  const otherJobId = randomUUID(), otherBrowserRunId = randomUUID()
  const now = new Date().toISOString()
  taskChain.repository.saveJob({ id: otherJobId, taskId: other, type: "chain", key: "fixture", status: "completed",
    sequence: 0, reason: null, resultId: null, browserRunId: otherBrowserRunId, waitpoint: null, audit: null,
    createdAt: now, updatedAt: now })
  const diagnostics = path.join(directory, "source-lifecycle-diagnostics")
  await mkdir(diagnostics, { recursive: true })
  for (const owner of [jobId, browserRunId, otherJobId, otherBrowserRunId]) {
    await writeFile(path.join(diagnostics, `${owner}.jsonl`), "fixture")
  }
  store.recordOperation("task-product:prepare", randomUUID(), { jobId }, jobId)
  const piFile = await piSessionFile(directory, target)
  const otherPiFile = await piSessionFile(directory, other)
  await piBinding(directory, target, piFile)
  await piBinding(directory, other, otherPiFile)
  const journal = new BrowserJournal(path.join(directory, "browser"))
  await mkdir(path.join(directory, "browser"), { recursive: true })
  await journal.save({ runId, taskId: target, sessionId: null, requirementVersion: 1, purpose: "verification", state: "closed" })
  await journal.audit({ at: new Date().toISOString(), taskId: target, runId, requirementVersion: 1,
    purpose: "verification", sessionId: null, command: "observe", argsHash: "fixture", phase: "completed" })
  const otherRun = randomUUID()
  await journal.audit({ at: new Date().toISOString(), taskId: other, runId: otherRun, requirementVersion: 1,
    purpose: "verification", sessionId: null, command: "observe", argsHash: "fixture", phase: "completed" })
  const command = { id: target, expectedUpdatedAt: store.task(target).updatedAt, confirm: true }
  assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: { id: target } })).statusCode, 400)
  assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers,
    payload: { ...command, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" } })).statusCode, 409)
  const deleted = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(deleted.statusCode, 200, deleted.body)
  assert.equal(deleted.json().id, target)
  assert.deepEqual(deleted.json().tasks.map((item: { id: string }) => item.id), [other])
  assert.throws(() => store.task(target))
  assert.equal(store.task(other).id, other)
  const db = new Database(path.join(directory, "workbench.sqlite"), { readonly: true })
  try {
    for (const table of ["messages", "drafts", "turns", "questions", "decisions", "sourceResolutions", "audits",
      "browserRuns", "researchRuns", "plans", "executions", "chains", "taskContracts", "taskAuthoringJobs", "taskExecutions",
      "taskExecutionCandidates", "taskExecutionCleanupAudits", "taskArtifacts", "taskReleases", "taskDrafts", "taskWorkspaceSequences"]) {
      assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE taskId = ?`).get(target) as { count: number }).count, 0, table)
    }
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM operations WHERE taskId = ? OR scope = ?")
      .get(target, target) as { count: number }).count, 0)
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM operations WHERE scope LIKE 'task-%'")
      .get() as { count: number }).count, 1) // 无存活 owner 证据的旧键保留。
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM originAccessEvents").get() as { count: number }).count, 1)
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM originAccessBlocks").get() as { count: number }).count, 1)
    assert.deepEqual(db.pragma("foreign_key_check"), [])
  } finally { db.close() }
  const pi = await PiAgentSessionBindingStore.open(path.join(directory, "pi-agent-session"), agentId)
  assert.equal(pi.get(target), undefined)
  assert.ok(pi.get(other))
  await assert.rejects(readFile(piFile), { code: "ENOENT" })
  assert.equal(await readFile(otherPiFile, "utf8"), "fixture")
  for (const owner of [jobId, browserRunId]) await assert.rejects(readFile(path.join(diagnostics, `${owner}.jsonl`)), { code: "ENOENT" })
  for (const owner of [otherJobId, otherBrowserRunId]) assert.equal(await readFile(path.join(diagnostics, `${owner}.jsonl`), "utf8"), "fixture")
  assert.equal(await journal.owner(), null)
  const audit = await readFile(path.join(directory, "browser", "browser-audit.jsonl"), "utf8")
  assert.ok(!audit.includes(target)); assert.ok(audit.includes(other))
}))

test("活动 owner 拒绝删除；Pi 文件失败恢复 binding，随后可重试", async () => fixture(async ({ app, store, directory }) => {
  const target = store.taskAction({ type: "create", requestId: randomUUID() })
  const runId = randomUUID(), journal = new BrowserJournal(path.join(directory, "browser"))
  await mkdir(path.join(directory, "browser"), { recursive: true })
  const command = { id: target, expectedUpdatedAt: store.task(target).updatedAt, confirm: true }
  await journal.save({ runId, taskId: target, sessionId: null, requirementVersion: 1, purpose: "verification", state: "cleanup_required" })
  const blocked = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(blocked.statusCode, 409)
  assert.equal(store.task(target).id, target)
  await journal.save({ runId, taskId: target, sessionId: null, requirementVersion: 1, purpose: "verification", state: "closed" })
  const session = path.join(directory, "pi-agent-session", "sessions", stableId(agentId), "directory-as-session")
  await mkdir(session, { recursive: true })
  await piBinding(directory, target, session)
  const failed = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(failed.statusCode, 503, failed.body)
  assert.equal(store.task(target).id, target)
  assert.ok((await PiAgentSessionBindingStore.open(path.join(directory, "pi-agent-session"), agentId)).get(target))
  await rm(session, { recursive: true })
  await writeFile(session, "fixture")
  const retried = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(retried.statusCode, 200, retried.body)
  assert.equal((await PiAgentSessionBindingStore.open(path.join(directory, "pi-agent-session"), agentId)).get(target), undefined)
}))

test("来源诊断删除失败保留任务，修复文件后同请求可重试", async () => fixture(async ({ app, store, directory }) => {
  const target = store.taskAction({ type: "create", requestId: randomUUID() })
  const owner = randomUUID(), diagnostic = path.join(directory, "source-lifecycle-diagnostics", `${owner}.jsonl`)
  const db = new Database(path.join(directory, "workbench.sqlite"))
  try { db.prepare("INSERT INTO taskAuthoringJobs(id,taskId,type,status,sequence,updatedAt,body) VALUES(?,?,?,?,?,?,?)")
    .run(owner, target, "prepare", "completed", 0, new Date().toISOString(), "{}") }
  finally { db.close() }
  await mkdir(diagnostic, { recursive: true })
  const command = { id: target, expectedUpdatedAt: store.task(target).updatedAt, confirm: true }
  const failed = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(failed.statusCode, 503, failed.body)
  assert.equal(store.task(target).id, target)
  await rm(diagnostic, { recursive: true, force: true })
  await writeFile(diagnostic, "fixture")
  const retried = await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })
  assert.equal(retried.statusCode, 200, retried.body)
  await assert.rejects(readFile(diagnostic), { code: "ENOENT" })
}))

test("准备、运行清理与未知 owner 均拒绝删除并保留任务", async () => fixture(async ({ app, store, directory }) => {
  const target = store.taskAction({ type: "create", requestId: randomUUID() })
  const command = { id: target, expectedUpdatedAt: store.task(target).updatedAt, confirm: true }
  const db = new Database(path.join(directory, "workbench.sqlite"))
  const jobId = randomUUID(), executionId = randomUUID(), runId = randomUUID(), now = new Date().toISOString()
  try {
    db.prepare("INSERT INTO taskAuthoringJobs(id,taskId,type,status,sequence,updatedAt,body) VALUES(?,?,?,?,?,?,?)")
      .run(jobId, target, "prepare", "waiting_for_human", 0, now, "{}")
    assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })).statusCode, 409)
    db.prepare("UPDATE taskAuthoringJobs SET status='completed' WHERE id=?").run(jobId)
    db.prepare("INSERT INTO taskExecutions(id,taskId,planId,status,sequence,createdAt,updatedAt,body) VALUES(?,?,?,?,?,?,?,?)")
      .run(executionId, target, randomUUID(), "completed", 0, now, now,
        JSON.stringify({ cleanup: { status: "unconfirmed" } }))
    assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })).statusCode, 409)
    db.prepare("UPDATE taskExecutions SET body=? WHERE id=?")
      .run(JSON.stringify({ cleanup: { status: "confirmed" } }), executionId)
    db.prepare("UPDATE taskExecutions SET body=? WHERE id=?")
      .run(JSON.stringify({ cleanup: { status: "confirmed" }, browserHandoff: {
        status: "active", leaseId: randomUUID() } }), executionId)
    assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })).statusCode, 409)
    db.prepare("UPDATE taskExecutions SET body=? WHERE id=?")
      .run(JSON.stringify({ cleanup: { status: "confirmed" }, browserHandoff: { status: "ended" } }), executionId)
    db.prepare("INSERT INTO browserRuns(runId,taskId,createdAt,body) VALUES(?,?,?,?)")
      .run(runId, target, now, JSON.stringify({ status: "cleanup_required" }))
    assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })).statusCode, 409)
    db.prepare("UPDATE browserRuns SET body=? WHERE runId=?")
      .run(JSON.stringify({ status: "interrupted" }), runId)
    await mkdir(path.join(directory, "browser"), { recursive: true })
    await writeFile(path.join(directory, "browser", "browser-owner.json"), "{invalid")
    assert.equal((await app.inject({ method: "DELETE", url: "/api/tasks", headers, payload: command })).statusCode, 409)
    assert.equal(store.task(target).id, target)
  } finally { db.close() }
}))

test("全新任务没有 Pi 与浏览器日志时也可删除", async () => fixture(async ({ app, store }) => {
  const target = store.taskAction({ type: "create", requestId: randomUUID() })
  const deleted = await app.inject({ method: "DELETE", url: "/api/tasks", headers,
    payload: { id: target, expectedUpdatedAt: store.task(target).updatedAt, confirm: true } })
  assert.equal(deleted.statusCode, 200, deleted.body)
  assert.deepEqual(deleted.json().tasks, [])
}))
