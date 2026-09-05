import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { TaskService } from "../server/taskService.js"
import { InterviewService } from "../server/interviewService.js"
import { emptyInterview } from "../src/interviewContract.js"
import { taskActionSchema, taskIdSchema } from "../src/taskContract.js"
import type { CodexAppServerClient } from "../../../packages/model-runtime/src/client.js"

async function fixture(run: (service: TaskService, storage: string, factory: (directory: string) => InterviewService, prompts: string[]) => Promise<void>) {
  const storage = await mkdtemp(path.join(tmpdir(), "browser-task-list-test-"))
  const prompts: string[] = []
  const factory = (directory: string) => {
    const client: CodexAppServerClient = { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => {}, async *runTurn(prompt) {
      prompts.push(prompt)
      yield { type: "commentary_delta", delta: "正在整理范围" }
      yield { type: "turn_succeeded", outputText: JSON.stringify({ assistantText: "范围已整理", question: null, draft: { title: "任务草稿", markdown: "仅当前任务范围" } }), threadId: "t", turnId: "u", audit: { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" } }
    } }
    return new InterviewService(process.cwd(), { storageDirectory: directory, client })
  }
  const service = new TaskService(process.cwd(), storage, factory)
  try { await service.restore(); await run(service, storage, factory, prompts) }
  finally { await service.close(); await rm(storage, { recursive: true, force: true }) }
}
async function send(service: TaskService, id: string, text: string) {
  for await (const _state of service.handle(id, { type: "message", text, expectedRevision: service.get(id).state.revision })) { /* 消费全部事件。 */ }
}

test("新建多个独立任务不会调用模型，快速元数据写入不会互相覆盖", async () => fixture(async (service, storage, _factory, prompts) => {
  const ids = await Promise.all([service.action({ type: "create" }), service.action({ type: "create" }), service.action({ type: "create" })])
  assert.equal(new Set(ids).size, 3)
  assert.equal(service.list().length, 3)
  assert.equal(JSON.parse(await readFile(path.join(storage, "tasks.json"), "utf8")).length, 3)
  assert.equal(prompts.length, 0)
}))

test("任务消息、草稿、确认和模型输入隔离，回复不会串入另一任务", async () => fixture(async (service, _storage, _factory, prompts) => {
  const a = await service.action({ type: "create" }); const b = await service.action({ type: "create" })
  await send(service, a, "只抓冰箱")
  for await (const _state of service.handle(a, { type: "confirm", version: 1, expectedRevision: 1 })) { /* 确认 A。 */ }
  await send(service, b, "只抓电视")
  assert.match(prompts[0]!, /只抓冰箱/); assert.doesNotMatch(prompts[1]!, /只抓冰箱/)
  assert.match(prompts[1]!, /只抓电视/)
  assert.equal(service.get(a).state.confirmedVersion, 1)
  assert.equal(service.get(b).state.confirmedVersion, null)
  assert.notEqual(service.get(a).state.messages[0]?.id, service.get(b).state.messages[0]?.id)
}))

test("正在处理时仍可查看和新建其他任务，不能误取消或归档活动任务", async () => fixture(async (service) => {
  const a = await service.action({ type: "create" }); const b = await service.action({ type: "create" })
  const stream = service.handle(a, { type: "message", text: "任务 A", expectedRevision: 0 })
  await stream.next()
  assert.equal(service.list().find((task) => task.id === a)?.status, "running")
  assert.equal(service.get(b).state.messages.length, 0)
  await service.action({ type: "create" })
  await assert.rejects(send(service, b, "新消息"), /另一轮需求/)
  for await (const _state of service.handle(b, { type: "cancel" })) { /* B 的取消不影响 A。 */ }
  assert.equal(service.get(a).state.active, true)
  await assert.rejects(service.action({ type: "archive", id: a, archived: true }), /先停止/)
  await stream.return(undefined)
  assert.equal(service.get(a).state.active, false)
}))

test("重命名、归档与恢复保持产物，重启恢复完整任务列表", async () => fixture(async (service, storage, factory) => {
  const id = await service.action({ type: "create" })
  await send(service, id, "初始需求")
  const before = service.get(id).snapshot()
  await service.action({ type: "rename", id, title: "我的独立任务" })
  await service.action({ type: "archive", id, archived: true })
  await assert.rejects(send(service, id, "归档中不能提交"), /先恢复/)
  assert.deepEqual(service.get(id).state, before)
  const restored = new TaskService(process.cwd(), storage, factory)
  await restored.restore()
  assert.equal(restored.list()[0]?.title, "我的独立任务")
  assert.equal(restored.list()[0]?.archived, true)
  await restored.action({ type: "archive", id, archived: false })
  assert.deepEqual(restored.get(id).state, before)
  await restored.close()
}))

test("旧单会话只复制迁移，原文件保留，重复启动不重复导入", async () => fixture(async (_service, storage, factory) => {
  const legacy = { ...structuredClone(emptyInterview), revision: 1, messages: [{ id: "old", role: "user", text: "保留旧需求", status: "complete", question: null, draftVersion: null }] }
  const oldText = JSON.stringify(legacy)
  await writeFile(path.join(storage, "interview.json"), oldText)
  const migrated = new TaskService(process.cwd(), storage, factory)
  await migrated.restore()
  assert.equal(migrated.list().length, 1)
  assert.equal(migrated.get("legacy").state.messages[0]?.text, "保留旧需求")
  assert.equal(await readFile(path.join(storage, "interview.json"), "utf8"), oldText)
  await migrated.restore()
  assert.equal(migrated.list().length, 1)
  await migrated.close()
}))

test("任务边界拒绝路径穿越、空名称和未知任务，不回退到另一个会话", async () => fixture(async (service) => {
  assert.equal(taskIdSchema.safeParse("../interview").success, false)
  assert.equal(taskActionSchema.safeParse({ type: "rename", id: "safe", title: " " }).success, false)
  assert.throws(() => service.get("missing"), /不存在/)
}))
