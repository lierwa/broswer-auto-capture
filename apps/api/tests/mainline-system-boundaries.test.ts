import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { materializeHybridWorkflowCommand, withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

test("前置源码校验失败没有创建 runner，也不留下虚假清理占用", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bat-preflight-"))
  let created = 0, cleanup: RunnerCleanupReport | undefined
  await assert.rejects(withHybridCapabilities({ root, directory: root, signal: new AbortController().signal,
    ownerId: "probe", allowedOrigins: ["https://example.test"],
    onCleanup: value => { cleanup = value }, createRunner: () => { created++; throw Error("runner_must_not_start") } },
    async () => { throw Error("work_must_not_start") }))
  assert.equal(created, 0)
  assert.equal(cleanup?.status, "confirmed")
  assert.equal(cleanup?.activeResources, false)
})

test("消费者就绪读取继承本次输入，不把 record 传给原生导航动作", () => {
  const record = { name: "second", link: "https://example.test/2" }
  const command = materializeHybridWorkflowCommand({ actionName: "navigate", target: null,
    inheritedReadInput: "record", postconditions: [{ kind: "read_fields", read: { inheritFields: ["name"] } }] },
    { url: record.link, record })
  assert.deepEqual(command.args, { url: record.link })
  assert.deepEqual(((command as Record<string, unknown>).postconditions as Record<string, unknown>[])[0]?.inherited, record)
})
