// 只读提取可审阅证据；密集 token event 保留在 ignored SQLite，不进入报告。
import { readFile } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import path from "node:path"
import { interviewAcceptanceCases } from "./interview-acceptance-cases.js"

const argumentsList = process.argv.slice(2)
const markdownOutput = argumentsList.includes("--markdown")
const selectedIds = new Set((argumentsList.find((value) => value.startsWith("--ids="))?.slice(6) ?? "").split(",").filter(Boolean))
const artifactPaths = argumentsList.filter((value) => !value.startsWith("--")).map((value) => path.resolve(value))
if (!artifactPaths.length) throw new Error("provide one or more acceptance.json paths")

const runs = []
for (const artifactPath of artifactPaths) {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"))
  const database = new DatabaseSync(path.join(path.dirname(artifactPath), "workbench.sqlite"), { readOnly: true })
  const cases = artifact.cases.filter((scenario: Record<string, unknown>) => !selectedIds.size || selectedIds.has(String(scenario.id)))
    .map((scenario: Record<string, unknown>) => {
    const taskId = String(scenario.taskId)
    const turns = new Map(database.prepare("select assistantMessageId,createdAt,completedAt from turns where taskId=?")
      .all(taskId).map((row) => [String(row.assistantMessageId), row]))
    const messages = database.prepare("select body from messages where taskId=? order by ordinal").all(taskId).map((row) => {
      const body = JSON.parse(String(row.body))
      if (body.role === "user") return { role: "user", text: body.text }
      const started = body.aiEvents?.find((event: Record<string, unknown>) => event.type === "generation.started")
      const firstDelta = body.aiEvents?.find((event: Record<string, unknown>) => event.type === "text.delta" && String(event.text).length)
      const completed = body.aiEvents?.find((event: Record<string, unknown>) => event.type === "generation.completed")
      const turn = turns.get(body.id) as { createdAt?: string; completedAt?: string } | undefined
      return {
        role: "assistant", text: body.text, question: body.question ?? null, draftVersion: body.draftVersion ?? null,
        invocationId: started?.invocationId ?? null,
        model: started?.model ? { modelId: started.model.modelId, reasoningEffort: started.model.reasoningEffort } : null,
        firstDeltaMs: started && firstDelta ? Number(firstDelta.createdAt) - Number(started.createdAt) : null,
        generationMs: started && completed ? Number(completed.createdAt) - Number(started.createdAt) : null,
        turnMs: turn?.createdAt && turn.completedAt ? Date.parse(turn.completedAt) - Date.parse(turn.createdAt) : null,
        totalTokens: completed?.usage?.totalTokens ?? null,
      }
    })
    const decisions = database.prepare("select revision,kind,text,questionId,draftVersion from decisions where taskId=? order by rowid").all(taskId)
    const task = database.prepare("select confirmedVersion,activeTurnId from tasks where id=?").get(taskId)
    if (!task || typeof task.confirmedVersion !== "number") throw new Error(`case ${scenario.id} has no confirmed draft`)
    const draft = database.prepare("select version,revision,title,markdown,brief from drafts where taskId=? and version=?")
      .get(taskId, task.confirmedVersion)
    return { id: scenario.id, intentProfile: scenario.intentProfile, task, messages, decisions,
      draft: draft ? { version: draft.version, revision: draft.revision, title: draft.title,
        type: draft.brief ? "capture" : "generic", markdown: draft.markdown } : null }
    })
  database.close()
  runs.push({ runId: artifact.runId, cases })
}
process.stdout.write(markdownOutput ? renderMarkdown(runs) : `${JSON.stringify(runs, null, 2)}\n`)

function renderMarkdown(values: Array<{ runId: string; cases: Array<Record<string, any>> }>) {
  const cases: Array<Record<string, any>> = values.flatMap((run) =>
    run.cases.map((scenario): Record<string, any> => ({ ...scenario, runId: run.runId })))
  cases.sort((left, right) => interviewAcceptanceCases.findIndex((item) => item.id === left.id)
    - interviewAcceptanceCases.findIndex((item) => item.id === right.id))
  return `${cases.map((scenario) => {
    const definition = interviewAcceptanceCases.find((item) => item.id === scenario.id)
    const dialogue = scenario.messages.map((message: Record<string, any>, index: number) => {
      if (message.role === "user") return `- 用户：${oneLine(message.text)}`
      const question = message.question?.data
      const options = question?.options?.map((option: Record<string, string>) => `${option.label}（${option.subtitle}）`).join("；")
      return `- 助手：${oneLine(message.text)}\n  - Question：${question ? oneLine(question.stem) : "无，形成草稿 v" + message.draftVersion}${options ? `\n  - 选项：${options}` : ""}\n  - 调用：${message.invocationId}；首包 ${message.firstDeltaMs} ms；生成 ${message.generationMs} ms；整轮 ${message.turnMs} ms；${message.totalTokens} tokens`
    }).join("\n")
    const decisions = scenario.decisions.filter((item: Record<string, unknown>) => item.kind !== "draft_confirmation")
      .map((item: Record<string, unknown>) => `- 回答记录（r${item.revision}，${item.kind}）：${oneLine(String(item.text))}`).join("\n")
    return `## ${definition?.title ?? scenario.id}（${scenario.id}）\n\n- 固定意图：${scenario.intentProfile}\n- 运行：${scenario.runId}；确认版本：v${scenario.task.confirmedVersion}\n\n### 实际对话\n\n${dialogue}\n${decisions ? `\n${decisions}\n` : ""}\n### 最终草稿（${scenario.draft.type}）\n\n~~~markdown\n${scenario.draft.markdown}\n~~~`
  }).join("\n\n")}\n`
}

function oneLine(value: string) {
  return value.replaceAll(/\s*\n\s*/g, " ")
}
