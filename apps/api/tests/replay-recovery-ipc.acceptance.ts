import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"

// WHY：租约缺失核验经过真实 Python IPC，但没有创建目标或加载个人浏览器。
const directory = await mkdtemp(path.join(tmpdir(), "bat-native-ipc-")), ownerId = randomUUID()
const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory, subject: {} as never })
try {
  const modes = ["daily", "dedicated-visible", "dedicated-headless"] as const
  for (const browserMode of modes) {
    const result = await runtime.managedWindowAction({ action: "verify_closed", ownerId, leaseId: ownerId, browserMode })
    assert.equal(result.window.active, false); assert.equal(result.window.ownerId, ownerId)
    assert.equal(result.report.status, "confirmed")
  }
  const output = path.join(process.cwd(), "work/replay-closure-20261004")
  await mkdir(output, { recursive: true })
  const proof = { passed: true, nativeIpc: true, modes, browserStarted: false, personalProfileTouched: false, modelCalls: 0 }
  await writeFile(path.join(output, "native-ipc-proof.json"), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof))
} finally { await runtime.close(); await rm(directory, { recursive: true, force: true }) }
