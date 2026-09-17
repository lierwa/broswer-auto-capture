// 原任务自然来源探针：原库只读，隔离库仅种入当前合同和同步确认所需的最小事实。
import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection, type AI } from "@agent-platform/ai-connect/server"
import { interviewStateSchema } from "@browser-capture/contracts/interview"
import { taskPlanSchema, taskRequirementSchema, type JsonValue } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { createApplication, SHARED_AI_SUBJECT } from "../../src/app.js"
import { readHybridSourceArtifact } from "../../src/upstream-browser/hybrid-artifact.js"

if (!process.argv.includes("--run")) throw new Error("mainline_natural_probe_requires_explicit_run")

const root = fileURLToPath(new URL("../../../../", import.meta.url))
const sourceFile = path.join(root, "data", "workbench.sqlite")
const runId = randomUUID(), runDirectory = path.join(root, "work", "natural-task-validation", runId)
const resultFile = path.join(runDirectory, "source-result.json")
const evidenceDirectory = path.join(root, "docs", "development", "evidence", "browser-use-dom-tools")
const evidenceFile = path.join(evidenceDirectory, `mainline-natural-${runId}.json`)
const latestEvidenceFile = path.join(evidenceDirectory, "mainline-natural.json")
const taskId = "79b4e6a3-b500-4d52-98c7-f9370638675e"
const requirementIdentity = { id: "3960924a-335c-4fe3-81b9-19f8add50473", version: 2 }
const planIdentity = { id: "e84c7660-21f6-44ac-87af-1826450c9e45", version: 6 }
const input = { startUrl: "https://github.com/langchain-ai/langgraph" }
const original = readOriginalSource(sourceFile)
const sourceBefore = contractRowsDigest(sourceFile)
await mkdir(runDirectory, { recursive: true })

let ai: AI | undefined, application: Awaited<ReturnType<typeof createApplication>> | undefined
let result: JsonValue = { error: "probe_not_started" }, cleanup = { applicationClosed: false, sourceContractsUnchanged: false }
let exitCode = 1
try {
  ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
  application = await createApplication({ root, directory: runDirectory, ai })
  application.store.insertTask(original.task, original.interview)
  application.store.saveSharedModelSelection(SHARED_AI_SUBJECT, original.selection)
  application.taskChain.repository.saveRequirement(original.requirement)
  application.taskChain.repository.savePlan(original.plan)
  const synced = application.taskChain.snapshot(taskId).requirement
  if (!synced || synced.id !== original.requirement.id || synced.version !== original.requirement.version
    || digestJson(synced) !== digestJson(original.requirement)) throw new Error("isolated_confirmation_source_mismatch")

  const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
    headers: { host: "localhost:3001", "sec-fetch-site": "same-origin" }, payload: {
      type: "generate_task_chains", requestId: randomUUID(),
      plan: { id: original.plan.id, version: original.plan.version, digest: digestJson(original.plan) }, input,
    } })
  if (response.statusCode !== 202) throw new Error(`formal_entry_rejected_${response.statusCode}`)
  const job = await waitForTerminalJob(application, original.plan.budget.maxActiveMs)
  await waitForInactive(application, original.plan.budget.maxActiveMs)
  const sources = sourceArtifacts(application, job)
  const auditAvailable = sources.length === original.plan.steps.length
  const sourceSuccess = auditAvailable ? sources.every((source) => source.result.sourceSuccess) : null
  const sourceJudged = auditAvailable ? sources.every((source) => {
    const request = source.result.request as Record<string, JsonValue>
    const trace = request.trace as Record<string, JsonValue> | undefined
    return source.result.sourceValidated && trace?.judged === true
  }) : null
  const sourceClosed = auditAvailable ? sources.every((source) => source.closed) : null
  const gaps = sources.flatMap((source) => source.result.response.compilation.gaps.map((gap) => ({
    stepId: source.stepId, code: gap.code, reason: gap.reason, resolution: gap.resolution,
  })))
  const chains = application.taskChain.repository.chains(taskId)
  const executions = application.taskChain.repository.executions(taskId)
  const samples = executions.filter((record) => record.mode === "sample")
  const verifications = executions.filter((record) => record.mode === "verification")
  result = {
    schemaVersion: "bat.mainline-natural/v1", validationScope: "source_probe", runId, taskId,
    source: { kind: "readonly_sqlite", requirementId: original.requirement.id,
      requirementVersion: original.requirement.version, requirementDigest: digestJson(original.requirement),
      planId: original.plan.id, planVersion: original.plan.version, planDigest: digestJson(original.plan),
      minimalInterviewSeed: { draftVersion: original.interview.confirmedVersion,
        draftCount: original.interview.drafts.length, confirmationCount: original.interview.decisions.length },
      accountOrProfileCopied: false },
    invocation: { command: "generate_task_chains", input, httpStatus: response.statusCode,
      waitUpperBoundMs: original.plan.budget.maxActiveMs },
    model: { modelId: original.selection.modelId, reasoningEffort: original.selection.reasoningEffort },
    outcome: { jobStatus: job.status, jobStage: job.authoring?.stage ?? null,
      failureLayer: job.authoring?.failureLayer ?? null, reasonCode: reasonCode(job.reason),
      auditAvailable, acceptedSourceCount: sources.length, expectedSourceCount: original.plan.steps.length,
      source_success: sourceSuccess, source_judged: sourceJudged, source_closed: sourceClosed,
      candidate: chains.length > 0, sample: samples.some((record) => record.status === "completed"),
      sampleAttempts: samples.length,
      verification: verifications.some((record) => record.status === "completed"),
      verificationAttempts: verifications.length, gaps,
      browserCommands: auditAvailable ? sources.reduce((sum, source) => sum + source.result.browserCommands, 0) : null,
      modelCalls: auditAvailable ? summarizeModelCalls(sources.flatMap((source) => source.modelCalls)) : null },
    artifacts: { localResult: path.relative(root, resultFile), sourceCount: sources.length },
  }
  await writeFile(resultFile, JSON.stringify({ job, sources }, null, 2) + "\n")
  exitCode = sourceSuccess && sourceJudged && sourceClosed ? 0 : 1
} catch (error) {
  result = { schemaVersion: "bat.mainline-natural/v1", validationScope: "source_probe", runId, taskId,
    status: "failed_before_source_acceptance",
    model: { modelId: original.selection.modelId, reasoningEffort: original.selection.reasoningEffort },
    reasonCode: reasonCode(error), artifacts: { localResult: path.relative(root, resultFile) } }
} finally {
  try {
    if (application) await application.app.close()
    else ai?.close()
    cleanup.applicationClosed = true
  } catch (error) {
    result = { ...result as Record<string, JsonValue>, cleanupError: reasonCode(error) }
  }
  cleanup.sourceContractsUnchanged = contractRowsDigest(sourceFile) === sourceBefore
  result = { ...result as Record<string, JsonValue>, cleanup }
  await mkdir(evidenceDirectory, { recursive: true })
  const evidence = JSON.stringify(result, null, 2) + "\n"
  await writeFile(evidenceFile, evidence)
  await writeFile(latestEvidenceFile, evidence)
  process.stdout.write(`${JSON.stringify(result)}\nRESULT ${resultFile}\nEVIDENCE ${evidenceFile}\n`)
}
process.exitCode = exitCode === 0 && cleanup.applicationClosed && cleanup.sourceContractsUnchanged ? 0 : 1

function readOriginalSource(file: string) {
  const database = new Database(file, { readonly: true, fileMustExist: true })
  database.pragma("query_only = ON"); database.pragma("busy_timeout = 5000")
  try {
    const task = database.prepare("SELECT id,title,renamed,archived,updatedAt,revision,sequence,confirmedVersion FROM tasks WHERE id = ?")
      .get(taskId) as Record<string, unknown> | undefined
    const draft = database.prepare("SELECT version,revision,title,markdown,brief FROM drafts WHERE taskId = ? AND version = ?")
      .get(taskId, requirementIdentity.version) as Record<string, unknown> | undefined
    const confirmation = database.prepare("SELECT id,revision,kind,text,messageId,questionId,draftVersion,createdAt FROM decisions WHERE taskId = ? AND kind = 'draft_confirmation' AND draftVersion = ?")
      .get(taskId, requirementIdentity.version) as Record<string, unknown> | undefined
    const requirement = taskRequirementSchema.parse(readContract(database, "requirement", requirementIdentity))
    const plan = taskPlanSchema.parse(readContract(database, "plan", planIdentity))
    const selectionRow = database.prepare("SELECT selection FROM aiSettings WHERE subjectId = ?")
      .get(SHARED_AI_SUBJECT) as { selection?: string } | undefined
    if (!task || !draft || !confirmation || !selectionRow?.selection) throw new Error("mainline_probe_source_missing")
    const interview = interviewStateSchema.parse({ revision: task.revision, sequence: task.sequence,
      confirmedVersion: task.confirmedVersion, active: false, activeTurnId: null, cancellationRequested: false,
      messages: [], drafts: [{ ...draft, brief: draft.brief ? JSON.parse(String(draft.brief)) : null }],
      turns: [], decisions: [confirmation], unresolved: [], audits: [] })
    if (plan.requirement.id !== requirement.id || plan.requirement.version !== requirement.version
      || plan.requirement.revision !== requirement.revision || plan.requirement.digest !== digestJson(requirement)) {
      throw new Error("mainline_probe_contract_mismatch")
    }
    return { task: { id: String(task.id), title: String(task.title), renamed: Boolean(task.renamed),
      archived: Boolean(task.archived), updatedAt: String(task.updatedAt) }, interview, requirement, plan,
      selection: parseModelSelection(JSON.parse(selectionRow.selection)) }
  } finally { database.close() }
}

function readContract(database: Database.Database, kind: "requirement" | "plan", identity: { id: string; version: number }) {
  const row = database.prepare("SELECT body FROM taskContracts WHERE taskId = ? AND kind = ? AND entityId = ? AND version = ?")
    .get(taskId, kind, identity.id, identity.version) as { body?: string } | undefined
  if (!row?.body) throw new Error(`${kind}_source_missing`)
  return JSON.parse(row.body) as unknown
}

async function waitForTerminalJob(value: Awaited<ReturnType<typeof createApplication>>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = value.taskChain.repository.jobs(taskId).at(-1)
    if (job && ["completed", "failed", "interrupted"].includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("mainline_natural_probe_timeout")
}

async function waitForInactive(value: Awaited<ReturnType<typeof createApplication>>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!value.taskChain.isActive(taskId)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("mainline_natural_cleanup_timeout")
}

function sourceArtifacts(value: Awaited<ReturnType<typeof createApplication>>,
  job: ReturnType<Awaited<ReturnType<typeof createApplication>>["taskChain"]["repository"]["jobs"]>[number]) {
  const exploration = job.authoring?.exploration as Record<string, JsonValue> | null | undefined
  const references = Array.isArray(exploration?.sources) ? exploration.sources : []
  return references.map((raw) => {
    const row = raw as Record<string, JsonValue>, reference = row.artifact as Record<string, JsonValue>
    const artifact = value.taskChain.repository.artifact(taskId, String(reference.artifactId))
    const source = readHybridSourceArtifact(artifact.body)
    if (source.stepId !== String(row.stepId)) throw new Error("mainline_source_step_mismatch")
    return source
  })
}

function summarizeModelCalls(calls: Array<{ purpose: string; model: string; status: string; reportedInvocations: number | null }>) {
  const groups = new Map<string, { purpose: string; model: string; status: string; count: number; reportedInvocations: number }>()
  for (const call of calls) {
    const key = `${call.purpose}\u0000${call.model}\u0000${call.status}`
    const group = groups.get(key) ?? { purpose: call.purpose, model: call.model, status: call.status,
      count: 0, reportedInvocations: 0 }
    group.count++; group.reportedInvocations += call.reportedInvocations ?? 0; groups.set(key, group)
  }
  return [...groups.values()]
}

function reasonCode(value: unknown) {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : "unknown"
  return text.split(":", 1)[0]!.slice(0, 160)
}

function contractRowsDigest(file: string) {
  const database = new Database(file, { readonly: true, fileMustExist: true })
  database.pragma("query_only = ON"); database.pragma("busy_timeout = 5000")
  try {
    const rows = database.prepare("SELECT kind,entityId,version,digest,body FROM taskContracts WHERE taskId = ? AND ((kind = 'requirement' AND entityId = ? AND version = ?) OR (kind = 'plan' AND entityId = ? AND version = ?)) ORDER BY kind")
      .all(taskId, requirementIdentity.id, requirementIdentity.version, planIdentity.id, planIdentity.version)
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex")
  } finally { database.close() }
}
