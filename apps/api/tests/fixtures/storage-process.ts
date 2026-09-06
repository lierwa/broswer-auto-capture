import { randomUUID } from "node:crypto"
import { ProductStore } from "../../src/database/store.js"
import { DomainError } from "../../src/errors.js"

const [mode, directory] = process.argv.slice(2)
if (!mode || !directory) throw new Error("需要 storage process 模式和临时数据目录")

function activeState(store: ProductStore, id: string) {
  store.mutate(id, (state) => {
    state.revision = 2; state.active = true; state.activeTurnId = "active-turn"; state.cancellationRequested = false
    state.messages.push(
      { id: "history-user", role: "user", text: "保留历史原文", status: "complete", question: null, draftVersion: null },
      { id: "history-assistant", role: "assistant", text: "历史草稿已生成", status: "complete", question: null, draftVersion: 1 },
      { id: "active-user", role: "user", text: "继续补充范围", status: "complete", question: null, draftVersion: null },
      { id: "active-assistant", role: "assistant", text: "正在整理", status: "running", question: null, draftVersion: null },
    )
    state.drafts.push({ version: 1, revision: 1, title: "历史草稿", markdown: "# 已保存的需求", brief: null })
    state.turns.push(
      { id: "history-turn", revision: 1, userMessageId: "history-user", assistantMessageId: "history-assistant",
        status: "succeeded", reason: null, createdAt: "2026-09-06T00:00:00.000Z", completedAt: "2026-09-06T00:00:01.000Z" },
      { id: "active-turn", revision: 2, userMessageId: "active-user", assistantMessageId: "active-assistant",
        status: "running", reason: null, createdAt: "2026-09-06T00:00:02.000Z", completedAt: null },
    )
  })
}

async function main(selectedMode: string, selectedDirectory: string) {
  if (selectedMode === "probe") {
    try {
      const store = await ProductStore.open(selectedDirectory)
      await store.close(); process.stdout.write(`${JSON.stringify({ opened: true })}\n`)
    } catch (error) {
      if (error instanceof DomainError) process.stdout.write(`${JSON.stringify({ opened: false, code: error.code })}\n`)
      else throw error
    }
    return
  }
  const store = await ProductStore.open(selectedDirectory)
  if (selectedMode === "seed") {
    const id = store.taskAction({ type: "create", requestId: randomUUID() })
    activeState(store, id)
    process.stdout.write(`${JSON.stringify({ id, ready: true })}\n`)
    setInterval(() => {}, 1_000)
    return
  }
  if (selectedMode !== "recover") throw new Error(`未知模式：${selectedMode}`)
  store.recoverInterrupted()
  const task = store.list()[0]
  const state = task ? store.snapshot(task.id) : null
  await store.close()
  process.stdout.write(`${JSON.stringify({ task, state })}\n`)
}

await main(mode, directory)
