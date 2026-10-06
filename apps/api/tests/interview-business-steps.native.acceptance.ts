// WHY：真实访谈模型自动拆分重复操作，不能拿手填任务步骤的投影用例冒充模型分析验收。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { parsePreparationDraft } from "../src/interview/preparation-draft.js"

if (process.env.BAT_RUN_BUSINESS_INTERVIEW !== "1") throw Error("explicit_interview_acceptance_required")
const root = process.cwd(), parent = path.join(root, "work", "business-interview-proof")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "natural-"))
const db = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
db.close()
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const api = await createApplication({ root, directory, ai })
const taskId = api.store.taskAction({ type: "create", requestId: randomUUID() })
api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, parseModelSelection(JSON.parse(row.selection)))
try {
  const state = api.store.snapshot(taskId)
  const response = await api.app.inject({ method: "POST", url: `/api/interview?taskId=${taskId}`, payload: {
    type: "message", requestId: randomUUID(), expectedRevision: state.revision,
    ui: { schemaVersion: 1, packages: [CommonContentUIProtocol] },
    text: "在我明确指定的本地开发样本 http://127.0.0.1:39111/contacts 页面，将每次运行提供的姓名列表里的所有联系人设为已订阅，最后核对这批联系人的订阅状态。同名无法区分或缺少对应联系人时记录问题并停止，不能选其他人。这个本地任务已授权更改匹配联系人的订阅开关，不发消息、不购买、不登录。输入是姓名文本列表，结果是完成状态，不需要抓取或数据清洗，完成后无需保留窗口。入口来源就是上述网址，不用搜索其他来源；请自动整理为可确认的业务草稿。" } })
  assert.equal(response.statusCode, 202, "interview_request_not_accepted")
  const deadline = Date.now() + 180_000
  while (api.store.snapshot(taskId).active) {
    if (Date.now() > deadline) throw Error("interview_native_deadline")
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const settled = api.store.snapshot(taskId), draft = settled.drafts.at(-1)
  await writeFile(path.join(directory, "state.json"), JSON.stringify(settled, null, 2))
  assert.ok(draft && !settled.unresolved.some(question => question.status === "open"), "confirmed_scope_not_ready")
  const parsed = parsePreparationDraft(draft.markdown)
  assert.ok(parsed.steps && parsed.steps.length >= 1, "native_business_steps_missing")
  assert.ok(parsed.steps.some(step => step.execution === "逐项执行"), "native_repetition_missing")
  assert.equal(parsed.outputSchema.type, "null")
  console.log(JSON.stringify({ stage: "passed", directory, steps: parsed.steps.map(step => ({ title: step.title,
    input: step.input, execution: step.execution })), output: "完成状态" }))
} catch (error) {
  await writeFile(path.join(directory, "failure.json"), JSON.stringify({ reason: error instanceof Error ? error.message : "unknown",
    state: api.store.snapshot(taskId) }, null, 2))
  console.error(JSON.stringify({ stage: "failed", directory, error: error instanceof Error ? error.message : "unknown" }))
  process.exitCode = 1
} finally { await api.app.close() }
