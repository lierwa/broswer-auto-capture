import assert from "node:assert/strict"
import test from "node:test"
import { access, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { bskExecutor } from "../src/index.js"

async function waitForFile(file: string) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try { await access(file); return } catch {}
    await delay(10)
  }
  throw new Error("fixture_start_timeout")
}

test("父命令退出但继承 stdout 未关闭时，仍按真实退出码及时收敛", async () => {
  const prefix = path.join(tmpdir(), "browser-transport-")
  const directory = await mkdtemp(prefix), marker = path.join(directory, "ready")
  const fixture = path.join(directory, "fixture.cjs"), executable = path.join(directory, process.platform === "win32" ? "bsk.exe" : "bsk")
  const originalPath = process.env.PATH
  try {
    await writeFile(fixture, `const { spawn } = require("node:child_process")\nconst { writeFileSync } = require("node:fs")\nspawn(process.argv[3], ["-e", "setTimeout(() => {}, 1500)"], { detached: true, stdio: ["ignore", "inherit", "ignore"] }).unref()\nwriteFileSync(process.argv[2], "ready")\nprocess.exit(0)\n`)
    if (process.platform === "win32") await copyFile(process.execPath, executable)
    else await writeFile(executable, `#!/usr/bin/env node\nrequire(${JSON.stringify(fixture)})\n`, { mode: 0o755 })
    process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ""}`
    const args = process.platform === "win32" ? [fixture, marker, process.execPath] : [marker, process.execPath]
    const outcome = bskExecutor(directory)(args)
    await waitForFile(marker)
    const result = await Promise.race([outcome, delay(300, "pending")])
    if (typeof result === "string") assert.fail("transport did not settle after CLI exit")
    assert.equal(result.exitCode, 0)
  } finally {
    process.env.PATH = originalPath
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)))
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})

test("取消长命令先发送 Ctrl-C 并等待 CLI 收尾", async () => {
  if (process.platform === "win32") return
  const prefix = path.join(tmpdir(), "browser-transport-cancel-")
  const directory = await mkdtemp(prefix), ready = path.join(directory, "ready"), stopped = path.join(directory, "stopped")
  const executable = path.join(directory, "bsk"), originalPath = process.env.PATH
  try {
    await writeFile(executable, `#!/usr/bin/env node\nconst {writeFileSync}=require('node:fs')\nprocess.on('SIGINT',()=>setTimeout(()=>{writeFileSync(${JSON.stringify(stopped)},'stopped');process.exit(130)},50))\nwriteFileSync(${JSON.stringify(ready)},'ready')\nsetInterval(()=>{},1000)\n`, { mode: 0o755 })
    process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ""}`
    const controller = new AbortController(), outcome = bskExecutor(directory)(["request-help", "--timeout", "5m"], controller.signal)
    await waitForFile(ready); controller.abort()
    await assert.rejects(outcome, (error) => error instanceof Error && "code" in error && error.code === "cancelled")
    await access(stopped)
  } finally {
    process.env.PATH = originalPath
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)))
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})
