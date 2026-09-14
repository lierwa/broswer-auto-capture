import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import Database from "better-sqlite3"
import { buildCommonSurfaceReplyPayload, createCommonChoiceQuestion, createCommonQuestionSurface } from "@agent-platform/ai-connect/integration/authoring/question"
import { emptyInterview } from "@browser-capture/contracts/interview"
import { ProductStore } from "../src/database/store.js"
import { importLegacy } from "../src/database/importLegacy.js"
import { imports } from "../src/database/schema.js"
import { migrate } from "../src/database/migrate.js"

const brief = (goal: string) => ({
  goal, scope: "一个站点的公开商品",
  sourceStrategy: { mode: "discover" as const, scope: "由系统调查公开入口", providedUrls: [] },
  accessRequirements: [],
  deliverables: [{ entity: "商品", fields: ["名称", "价格"], coverage: "全部可见商品", limit: "完成公开目录后停止" }],
  discoveryTasks: [{ objective: "定位目录", expectedOutput: "候选入口", acceptance: "页面可公开访问" }],
  completionCriteria: ["商品均保留来源"], constraints: ["仅公开页面"], proposedDefaults: ["先调查入口"],
})

function createVersionOne(file: string) {
  const connection = new Database(file)
  connection.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, renamed INTEGER NOT NULL, archived INTEGER NOT NULL,
      updatedAt TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), sequence INTEGER NOT NULL CHECK(sequence >= 0),
      confirmedVersion INTEGER, activeTurnId TEXT);
    CREATE TABLE messages (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, ordinal INTEGER NOT NULL,
      body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(taskId,id), UNIQUE(taskId,ordinal));
    CREATE TABLE drafts (taskId TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL, revision INTEGER NOT NULL,
      title TEXT NOT NULL, markdown TEXT NOT NULL, PRIMARY KEY(taskId,version));
    CREATE TABLE turns (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
      userMessageId TEXT NOT NULL, assistantMessageId TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, createdAt TEXT NOT NULL,
      completedAt TEXT, PRIMARY KEY(taskId,id), UNIQUE(taskId,revision));
    CREATE UNIQUE INDEX one_active_interview ON turns ((1)) WHERE status IN ('running','cancelling');
    CREATE TABLE questions (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
      question TEXT NOT NULL CHECK(json_valid(question)), status TEXT NOT NULL, answerMessageId TEXT, PRIMARY KEY(taskId,id));
    CREATE TABLE decisions (taskId TEXT NOT NULL REFERENCES tasks(id), id TEXT NOT NULL, revision INTEGER NOT NULL,
      kind TEXT NOT NULL, text TEXT NOT NULL, messageId TEXT, questionId TEXT, draftVersion INTEGER, createdAt TEXT NOT NULL,
      PRIMARY KEY(taskId,id));
    CREATE TABLE audits (taskId TEXT NOT NULL REFERENCES tasks(id), ordinal INTEGER NOT NULL, revision INTEGER NOT NULL,
      model TEXT NOT NULL, effort TEXT NOT NULL, invocations INTEGER NOT NULL CHECK(invocations >= 0), PRIMARY KEY(taskId,ordinal));
    CREATE TABLE operations (scope TEXT NOT NULL, requestId TEXT NOT NULL, digest TEXT NOT NULL, resultId TEXT NOT NULL,
      PRIMARY KEY(scope,requestId));
    CREATE TABLE imports (id TEXT PRIMARY KEY, digest TEXT NOT NULL, createdAt TEXT NOT NULL);
    INSERT INTO tasks VALUES ('v1-task','旧任务',0,0,'2026-09-06T00:00:00.000Z',1,3,1,NULL);
    INSERT INTO drafts VALUES ('v1-task',1,1,'旧草稿','# 原始内容');
    INSERT INTO decisions VALUES ('v1-task','old-confirmation',1,'draft_confirmation','确认需求草稿 v1',NULL,NULL,1,'2026-09-06T00:00:01.000Z');
    PRAGMA user_version = 1;
  `)
  connection.close()
}

async function fixture(run: (store: ProductStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-product-store-"))
  const store = await ProductStore.open(directory)
  try { await run(store, directory) }
  finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
}
test("任务创建幂等，失败事务不改变消息/草稿/确认/事件序号", async () => fixture(async (store) => {
  const command = { type: "create" as const, requestId: randomUUID() }
  const id = store.taskAction(command)
  assert.equal(store.taskAction(command), id)
  const before = store.snapshot(id)
  assert.throws(() => store.mutate(id, (state) => { state.revision++; state.confirmedVersion = 9 }))
  assert.deepEqual(store.snapshot(id), before)
  assert.equal(store.list().length, 1)
}))
test("v1 数据库原子迁移到 v11，旧访谈和旧调研原表均保留", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-v1-migration-"))
  const file = path.join(directory, "workbench.sqlite")
  try {
    createVersionOne(file)
    const store = await ProductStore.open(directory)
    try {
      const state = store.snapshot("v1-task")
      assert.equal(state.confirmedVersion, 1)
      assert.deepEqual(state.drafts, [{ version: 1, revision: 1, title: "旧草稿", markdown: "# 原始内容", brief: null }])
      assert.equal(state.decisions[0]?.id, "old-confirmation")
      assert.equal(state.decisions[0]?.draftVersion, 1)
    } finally { await store.close() }
    const reopened = await ProductStore.open(directory)
    await reopened.close()
    const inspection = new Database(file, { readonly: true })
    try {
      assert.equal(inspection.pragma("user_version", { simple: true }), 11)
      assert.deepEqual(inspection.prepare("SELECT * FROM browserRuns").all(), [])
      assert.deepEqual(inspection.prepare("SELECT name FROM sqlite_master WHERE name='researchRuns'").get(), { name: "researchRuns" })
      assert.deepEqual(inspection.prepare("SELECT * FROM aiSettings").all(), [])
      assert.equal(inspection.prepare("PRAGMA table_info(drafts)").all().filter((column: any) => column.name === "brief").length, 1)
    } finally { inspection.close() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test("不兼容的 v1 迁移失败不提前版本号，也不改变已有行", () => {
  const connection = new Database(":memory:")
  try {
    connection.exec("CREATE TABLE drafts (taskId TEXT, version INTEGER, brief TEXT); INSERT INTO drafts VALUES ('old',1,NULL); PRAGMA user_version=1")
    assert.throws(() => migrate(connection), /duplicate column name/i)
    assert.equal(connection.pragma("user_version", { simple: true }), 1)
    assert.deepEqual(connection.prepare("SELECT taskId, version, brief FROM drafts").all(), [{ taskId: "old", version: 1, brief: null }])
  } finally { connection.close() }
})

test("v3 升级保留旧调研与浏览器历史，迁移冲突整体回滚", () => {
  const connection = new Database(":memory:")
  try {
    connection.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY); INSERT INTO tasks VALUES ('existing'); CREATE TABLE operations (scope TEXT, requestId TEXT, digest TEXT, resultId TEXT, PRIMARY KEY(scope,requestId)); CREATE TABLE browserRuns (runId TEXT PRIMARY KEY, taskId TEXT, body TEXT); INSERT INTO browserRuns VALUES ('old','existing','{}'); PRAGMA user_version=3")
    migrate(connection); migrate(connection)
    assert.equal(connection.pragma("user_version", { simple: true }), 11)
    assert.deepEqual(connection.prepare("SELECT * FROM browserRuns").all(), [{ runId: "old", taskId: "existing", body: "{}" }])
    assert.deepEqual(connection.prepare("SELECT name FROM sqlite_master WHERE name='researchRuns'").get(), { name: "researchRuns" })
    connection.exec("PRAGMA user_version=3")
    assert.throws(() => migrate(connection), /already exists/)
    assert.equal(connection.pragma("user_version", { simple: true }), 3)
    assert.deepEqual(connection.prepare("SELECT COUNT(*) AS count FROM browserRuns").get(), { count: 1 })
  } finally { connection.close() }
})

test("已存在的 v2 数据库升级浏览器表，保留需求历史且可重复启动", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-v2-migration-")), file = path.join(directory, "workbench.sqlite")
  try {
    createVersionOne(file)
    const legacy = new Database(file)
    try { legacy.exec("ALTER TABLE drafts ADD COLUMN brief TEXT; PRAGMA user_version=2") } finally { legacy.close() }
    for (let attempt = 0; attempt < 2; attempt++) {
      const store = await ProductStore.open(directory)
      try { assert.equal(store.snapshot("v1-task").drafts[0]?.markdown, "# 原始内容"); assert.equal(store.snapshot("v1-task").confirmedVersion, 1) }
      finally { await store.close() }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test("结构化 brief 随草稿事务持久化，重启后按版本隔离并保留旧确认", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  const firstBrief = brief("收集公开商品"), secondBrief = brief("收集公开商品及价格")
  store.mutate(id, (state) => {
    state.revision = 1
    state.drafts.push({ version: 1, revision: 1, title: "第一版", markdown: "# 第一版", brief: firstBrief })
    state.confirmedVersion = 1
    state.decisions.push({ id: "confirmation-1", revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
      messageId: null, questionId: null, draftVersion: 1, createdAt: "2026-09-06T00:00:00.000Z" })
  })
  store.mutate(id, (state) => {
    state.revision = 2; state.confirmedVersion = null
    state.drafts.push({ version: 2, revision: 2, title: "第二版", markdown: "# 第二版", brief: secondBrief })
  })
  assert.throws(() => store.mutate(id, (state) => {
    state.revision = 3
    state.drafts.push({ version: 3, revision: 3, title: "不应提交", markdown: "# 回滚", brief: brief("错误版本") })
    state.confirmedVersion = 99
  }))
  await store.close()
  const restored = await ProductStore.open(directory)
  try {
    const state = restored.snapshot(id)
    assert.deepEqual(state.drafts.map((draft) => [draft.version, draft.brief]), [[1, firstBrief], [2, secondBrief]])
    assert.equal(state.confirmedVersion, null)
    assert.equal(state.decisions[0]?.draftVersion, 1)
  } finally { await restored.close() }
}))
test("TEXT 决策列无需迁移即可在重启后读取旧选择与新自由文本历史", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  store.mutate(id, (state) => {
    state.decisions.push(
      { id: "choice-1", revision: 1, kind: "option", text: "前 20 条", messageId: "answer-1",
        questionId: "question-1", draftVersion: null, createdAt: "2026-09-06T00:00:00.000Z" },
      { id: "free-text-1", revision: 2, kind: "free_text", text: "海尔", messageId: "answer-2",
        questionId: "question-2", draftVersion: null, createdAt: "2026-09-06T00:00:01.000Z" },
      { id: "confirmation-1", revision: 2, kind: "draft_confirmation", text: "确认需求草稿 v1", messageId: null,
        questionId: null, draftVersion: 1, createdAt: "2026-09-06T00:00:02.000Z" },
    )
  })
  await store.close()
  const restored = await ProductStore.open(directory)
  try {
    assert.deepEqual(restored.snapshot(id).decisions.map(({ kind, text }) => ({ kind, text })), [
      { kind: "option", text: "前 20 条" },
      { kind: "free_text", text: "海尔" },
      { kind: "draft_confirmation", text: "确认需求草稿 v1" },
    ])
  } finally { await restored.close() }
}))
test("公共 multi_choice 原题与 compound reply 重启后保持完整", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  const questionId = "question-multi", answerId = "answer-multi"
  const question = createCommonChoiceQuestion({ id: questionId, type: "multi_choice", stem: "选择字段", options: [
    { id: "name", label: "名称" }, { id: "price", label: "价格" }, { id: "image", label: "图片" },
  ] })
  const surface = createCommonQuestionSurface({ id: questionId, questions: [question], submitLabel: "提交回答" })
  const surfaceSubmit = { answers: [{ questionId, data: {
    selectedOptionIds: ["name", "price"],
  } }], displayText: "名称\n价格" }
  store.mutate(id, (state) => {
    state.revision = 2
    state.messages.push(
      { id: questionId, role: "assistant", text: "请选择。", status: "complete", question, draftVersion: null, aiEvents: [] },
      { id: answerId, role: "user", text: surfaceSubmit.displayText, status: "complete", question: null,
        draftVersion: null, aiEvents: [], interactionReply: buildCommonSurfaceReplyPayload({ surface, submit: surfaceSubmit }) },
    )
    state.unresolved.push({ id: questionId, revision: 1, question, status: "answered", answerMessageId: answerId })
    state.decisions.push({ id: "decision-multi", revision: 2, kind: "option", text: surfaceSubmit.displayText,
      messageId: answerId, questionId, draftVersion: null, createdAt: "2026-09-11T00:00:00.000Z" })
  })
  await store.close()
  const restored = await ProductStore.open(directory)
  try {
    const state = restored.snapshot(id)
    assert.deepEqual(state.unresolved[0]?.question, question)
    assert.deepEqual(state.messages[1]?.interactionReply?.surfaceSubmit, surfaceSubmit)
    assert.equal(state.decisions[0]?.kind, "option")
  } finally { await restored.close() }
}))
test("同一产品数据只能有一个协调服务，关闭后可重新打开", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  await assert.rejects(ProductStore.open(directory), /另一服务/)
  await store.close()
  const restored = await ProductStore.open(directory)
  try { assert.equal(restored.list()[0]?.id, id) } finally { await restored.close() }
}))
test("服务重启把未完成轮次持久化为 interrupted，重复恢复不会永久 active", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  store.mutate(id, (state) => {
    state.revision = 1; state.active = true; state.activeTurnId = "turn-1"; state.cancellationRequested = true
    state.messages.push(
      { id: "user-1", role: "user", text: "继续访谈", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { id: "assistant-1", role: "assistant", text: "处理中", status: "running", question: null, draftVersion: null, aiEvents: [] },
    )
    state.turns.push({ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "cancelling", reason: null, createdAt: "2026-09-06T00:00:00.000Z", completedAt: null })
  })
  await store.close()

  const restored = await ProductStore.open(directory)
  try {
    assert.equal(restored.snapshot(id).active, true)
    restored.recoverInterrupted()
    const recovered = restored.snapshot(id)
    assert.equal(recovered.active, false)
    assert.equal(recovered.activeTurnId, null)
    assert.equal(recovered.cancellationRequested, false)
    assert.equal(recovered.turns[0]?.status, "interrupted")
    assert.match(recovered.turns[0]?.reason ?? "", /服务已重启/)
    assert.equal(recovered.messages[1]?.status, "cancelled")
    assert.match(recovered.messages[1]?.text ?? "", /可以重试/)
    const sequence = recovered.sequence
    restored.recoverInterrupted()
    assert.equal(restored.snapshot(id).sequence, sequence)
  } finally { await restored.close() }
}))
test("任务投影在事务和进程重启后仍按 taskId 隔离", async () => fixture(async (store, directory) => {
  const first = store.taskAction({ type: "create", requestId: randomUUID() })
  const second = store.taskAction({ type: "create", requestId: randomUUID() })
  const secondBefore = store.snapshot(second)
  store.mutate(first, (state) => {
    state.revision = 1
    state.messages.push({ id: "first-user", role: "user", text: "只属于任务一", status: "complete", question: null, draftVersion: null, aiEvents: [] })
    state.drafts.push({ version: 1, revision: 1, title: "任务一草稿", markdown: "# 任务一", brief: null })
    state.confirmedVersion = 1
  })
  assert.deepEqual(store.snapshot(second), secondBefore)
  await store.close()

  const restored = await ProductStore.open(directory)
  try {
    const firstState = restored.snapshot(first)
    assert.equal(firstState.messages[0]?.text, "只属于任务一")
    assert.equal(firstState.drafts[0]?.title, "任务一草稿")
    assert.equal(firstState.confirmedVersion, 1)
    assert.deepEqual(restored.snapshot(second), secondBefore)
  } finally { await restored.close() }
}))
test("旧单会话导入保留原件，重复执行和重启不重复导入、不覆盖后续修改", async () => fixture(async (store, directory) => {
  const value = JSON.stringify({ ...emptyInterview, revision: 1, confirmedVersion: 1,
    drafts: [{ version: 1, revision: 1, title: "旧草稿", markdown: "# 只抓公开资料" }],
    messages: [{ id: "u", role: "user", text: "只抓公开资料", status: "complete", question: null, draftVersion: null }] })
  const file = path.join(directory, "interview.json")
  await writeFile(file, value)
  await importLegacy(store, directory)
  assert.equal(store.snapshot("legacy").messages[0]?.text, "只抓公开资料")
  assert.equal(store.snapshot("legacy").drafts[0]?.brief, null)
  assert.equal(store.snapshot("legacy").confirmedVersion, 1)
  assert.equal(store.snapshot("legacy").decisions[0]?.draftVersion, 1)
  store.taskAction({ type: "rename", id: "legacy", title: "已迁入" })
  await importLegacy(store, directory)
  assert.equal(store.list()[0]?.title, "已迁入")
  assert.equal(await readFile(file, "utf8"), value)
  await store.close()
  const next = await ProductStore.open(directory)
  try { await importLegacy(next, directory); assert.equal(next.list().length, 1) } finally { await next.close() }
}))
test("多任务导入一项损坏则整体不提交，修复后可重试", async () => fixture(async (store, directory) => {
  const meta = ["a", "b"].map((id) => ({ id, title: id, renamed: false, archived: false, updatedAt: new Date().toISOString() }))
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify(meta))
  await mkdir(path.join(directory, "tasks", "b"), { recursive: true })
  const file = path.join(directory, "tasks", "b", "interview.json")
  await writeFile(file, "broken")
  await assert.rejects(importLegacy(store, directory), /格式损坏/)
  assert.equal(store.list().length, 0)
  assert.equal(store.db.select().from(imports).all().length, 0)
  await writeFile(file, JSON.stringify(emptyInterview))
  await importLegacy(store, directory)
  assert.equal(store.list().length, 2)
}))
test("导入事务遇到已有任务冲突会回滚之前插入的条目", async () => fixture(async (store, directory) => {
  const id = store.taskAction({ type: "create", requestId: randomUUID() })
  const meta = ["before-conflict", id].map((key) => ({ id: key, title: key, renamed: false, archived: false, updatedAt: new Date().toISOString() }))
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify(meta))
  await assert.rejects(importLegacy(store, directory))
  assert.equal(store.list().length, 1)
  assert.equal(store.db.select().from(imports).all().length, 0)
}))
test("导入拒绝路径穿越，不回退到其他任务", async () => fixture(async (store, directory) => {
  await writeFile(path.join(directory, "tasks.json"), JSON.stringify([{ id: "../a", title: "a", renamed: false, archived: false, updatedAt: "now" }]))
  await assert.rejects(importLegacy(store, directory))
  assert.equal(store.list().length, 0)
}))
