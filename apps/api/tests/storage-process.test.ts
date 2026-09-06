import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import test from "node:test"

const fixture = path.resolve("tests/fixtures/storage-process.ts")
function launch(mode: "seed" | "probe" | "recover", directory: string) {
  return spawn(process.execPath, ["--import", "tsx", fixture, mode, directory], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] })
}
async function bounded<T>(child: ReturnType<typeof launch>, pending: Promise<T>, details: () => string) {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(details())) }, 15_000)
    })])
  } finally { if (timer) clearTimeout(timer) }
}
async function firstLine(child: ReturnType<typeof launch>) {
  let stdout = "", stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  await bounded(child,
    new Promise<void>((resolve, reject) => {
      child.stdout.on("data", () => { if (stdout.includes("\n")) resolve() })
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error(`子进程提前退出 ${code}: ${stderr}`)))
    }),
    () => `等待子进程就绪超时: ${stderr}`,
  )
  return JSON.parse(stdout.slice(0, stdout.indexOf("\n"))) as Record<string, unknown>
}
async function completed(mode: "probe" | "recover", directory: string) {
  const child = launch(mode, directory)
  let stdout = "", stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  const [code] = await bounded(child, once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>,
    () => `子进程执行超时: ${stderr}`)
  assert.equal(code, 0, stderr)
  return JSON.parse(stdout.trim()) as Record<string, any>
}

test("异常退出留下 stale 锁；全新 Node 进程在窗口后恢复轮次且保留历史草稿", { timeout: 25_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-storage-process-"))
  const seed = launch("seed", directory)
  try {
    const ready = await firstLine(seed)
    assert.equal(ready.ready, true)
    assert.equal(seed.kill("SIGKILL"), true)
    await once(seed, "exit")

    assert.deepEqual(await completed("probe", directory), { opened: false, code: "database_in_use" })
    // WHY：使用生产锁的既有 stale=10s 窗口，证明异常退出恢复，不伪造锁时间或直接改库。
    await delay(11_000)
    const recovered = await completed("recover", directory)
    assert.equal(recovered.task.id, ready.id)
    assert.equal(recovered.state.active, false)
    assert.equal(recovered.state.activeTurnId, null)
    assert.equal(recovered.state.messages.length, 4)
    assert.equal(recovered.state.turns[0].status, "succeeded")
    assert.equal(recovered.state.turns[1].status, "interrupted")
    assert.equal(recovered.state.messages[3].status, "cancelled")
    assert.equal(recovered.state.messages[0].text, "保留历史原文")
    assert.deepEqual(recovered.state.drafts, [{ version: 1, revision: 1, title: "历史草稿", markdown: "# 已保存的需求", brief: null }])
    assert.deepEqual(await completed("probe", directory), { opened: true })
  } finally {
    if (seed.exitCode === null && seed.signalCode === null) { seed.kill("SIGKILL"); await once(seed, "exit") }
    await rm(directory, { recursive: true, force: true })
  }
})
