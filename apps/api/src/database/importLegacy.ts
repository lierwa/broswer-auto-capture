import { readFile } from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { emptyInterview, interviewStateSchema, legacyInterviewStateSchema, type InterviewState } from "@browser-capture/contracts/interview"
import { taskMetaSchema } from "@browser-capture/contracts/task"
import { digest, type ProductStore } from "./store.js"
import { imports } from "./schema.js"

async function jsonFile(file: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as unknown }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw new Error("旧访谈文件无法读取或格式损坏；原文件已保留，未完成导入。") }
}
export function convertLegacy(input: unknown, now: string): InterviewState {
  const legacy = legacyInterviewStateSchema.parse(input)
  const state = interviewStateSchema.parse({ ...legacy, active: false })
  let userMessageId: string | undefined
  let revision = 0
  for (const message of state.messages) {
    if (message.role === "user") { userMessageId = message.id; continue }
    if (!userMessageId) throw new Error("旧助手消息缺少关联用户原文，未导入。")
    revision += 1
    const interrupted = message.status === "running"
    if (interrupted) { message.status = "cancelled"; message.text += "\n导入时本轮尚未完成。可以重试。" }
    state.turns.push({ id: `import:${message.id}`, revision, userMessageId, assistantMessageId: message.id,
      status: interrupted ? "interrupted" : message.status === "complete" ? "succeeded" : message.status,
      reason: interrupted ? "从未完成的旧访谈导入" : null, createdAt: now, completedAt: now,
    })
    if (message.question) state.unresolved.push({ id: message.id, revision, question: message.question,
      status: message.id === state.messages.at(-1)?.id ? "open" : "superseded", answerMessageId: null,
    })
  }
  if (revision > state.revision) throw new Error("旧消息轮次与修订号不一致，未导入。")
  if (state.confirmedVersion !== null) state.decisions.push({ id: `import:confirmation:${state.confirmedVersion}`, revision: state.revision,
    kind: "draft_confirmation", text: `确认需求草稿 v${state.confirmedVersion}`, draftVersion: state.confirmedVersion,
    questionId: null, messageId: null, createdAt: now,
  })
  return state
}
export async function importLegacy(store: ProductStore, directory: string) {
  if (store.db.select().from(imports).where(eq(imports.id, "json-v1")).get()) return
  const now = new Date().toISOString()
  const registry = await jsonFile(path.join(directory, "tasks.json"))
  const singleton = registry === undefined ? await jsonFile(path.join(directory, "interview.json")) : undefined
  const metadata = registry !== undefined ? z.array(taskMetaSchema).parse(registry)
    : singleton !== undefined ? [{ id: "legacy", title: "之前的需求", renamed: false, archived: false, updatedAt: now }] : []
  if (new Set(metadata.map((item) => item.id)).size !== metadata.length) throw new Error("旧任务列表有重复标识，未导入。")
  const entries = await Promise.all(metadata.map(async (meta) => {
    const old = singleton ?? await jsonFile(path.join(directory, "tasks", meta.id, "interview.json")) ?? structuredClone(emptyInterview)
    return { meta, original: old, state: convertLegacy(old, now) }
  }))
  // WHY：先读完并验证所有旧文件，再一次事务导入；任一损坏/冲突都不留下部分新任务。
  store.db.transaction(() => {
    for (const entry of entries) store.insertTask(entry.meta, entry.state)
    store.db.insert(imports).values({ id: "json-v1", digest: digest(entries.map(({ meta, original }) => ({ meta, original }))), createdAt: now }).run()
  })
}
