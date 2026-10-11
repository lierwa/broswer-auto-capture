// 受控真实模型验收：将已落盘的首败原文交给原 settleInterviewAuthoring，不改正式任务或伪造首次模型调用。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { z } from "zod"
import { createAI, localStore, parseModelSelection, type AIEvent } from "@agent-platform/ai-connect/server"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { interviewStateSchema } from "@browser-capture/contracts/interview"
import { createAIModelProvider, type AIModelProvider } from "../src/ai/model.js"
import { ProductStore } from "../src/database/store.js"
import { SHARED_AI_SUBJECT } from "../src/app.js"
import { createInterviewMainAuthoring, loadInterviewSkill } from "../src/interview/protocol.js"
import { InterviewSourceReferences } from "../src/interview/source-references.js"
import { settleInterviewAuthoring } from "../src/interview/authoring-repair.js"
import { parsePreparationDraft } from "../src/interview/preparation-draft.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
assert.equal(process.env.BAT_RUN_REAL_INTERVIEW_REPAIR, "1", "explicit_real_model_gate_required")
const source = path.resolve(root, process.argv[2] ?? ""), directory = path.resolve(root, process.argv[3] ?? "")
assert.ok(source.startsWith(path.join(root, "work") + path.sep), "source_must_be_owned_evidence")
assert.ok(directory.startsWith(path.join(root, "work") + path.sep) && directory !== source, "output_must_be_new_owned_evidence")
const state = interviewStateSchema.parse(JSON.parse(await readFile(path.join(source, "interview-terminal.json"), "utf8")))
const original = z.object({ outputs: z.array(z.object({ text: z.string().min(1) })).min(1) })
  .parse(JSON.parse(await readFile(path.join(source, "model-output-evidence.json"), "utf8"))).outputs[0]!.text
await mkdir(directory) // 不覆盖任何已有验收，失败原文仍留原处。
const database = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true, fileMustExist: true })
const selection = (() => {
  try {
    const row = database.prepare("select selection from aiSettings where subjectId = ?").get(SHARED_AI_SUBJECT) as { selection: string }
    return parseModelSelection(JSON.parse(row.selection))
  } finally { database.close() }
})()
const store = await ProductStore.open(directory)
const events: AIEvent[] = [], runId = randomUUID()
let repairReason = "", invocations = 0, closeRepair: (() => Promise<void>) | undefined
try {
  const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
  store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
  const real = createAIModelProvider(ai, store, SHARED_AI_SUBJECT, { cwd: root, stateDir: path.join(directory, "pi-agent-session") })
  const provider: AIModelProvider = { ...real, async prepareMain(selected, purpose) {
    assert.equal(purpose, "interview-repair")
    assert.deepEqual(selected, selection)
    return real.prepareMain(selected, purpose)
  } }
  const references = new InterviewSourceReferences(state.revision, state)
  const skill = loadInterviewSkill(root), ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const authoring = createInterviewMainAuthoring(state, skill, ui, references)
  authoring.session.push(original)
  const result = await settleInterviewAuthoring({ result: authoring.session.finish(), state, parts: [],
    runId, questionId: randomUUID(), references, rejected: original, skill, ui, provider, selection,
    signal: AbortSignal.timeout(190_000), onEvent(event) { if (event.type !== "extension") events.push(event) },
    onRepair(reason) { repairReason = reason; process.stdout.write(`${reason}\n`) }, onCompleted() { invocations += 1 },
  })
  closeRepair = result.closeRepair
  assert.equal(invocations, 1)
  assert.match(repairReason, /位置：结果与完成/u)
  assert.match(repairReason, /独立标记 0 条/u)
  assert.ok(result.output.draft)
  const parsed = parsePreparationDraft(result.output.draft.markdown)
  assert.equal(parsed.browserHandoff, "close")
  const receipt = { status: "passed", runId, selection, invocations, repairReason, output: result.output,
    modelEvents: events, originalTaskUnchanged: true, scope: "saved first failure -> real one-shot repair -> original validator" }
  await writeFile(path.join(directory, "result.json"), JSON.stringify(receipt, null, 2))
  process.stdout.write(JSON.stringify({ status: receipt.status, runId, invocations, browserHandoff: parsed.browserHandoff }) + "\n")
} catch (error) {
  await writeFile(path.join(directory, "failure.json"), JSON.stringify({ runId, repairReason, invocations, events,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error) }, null, 2))
  throw error
} finally { await closeRepair?.(); await store.close() }
