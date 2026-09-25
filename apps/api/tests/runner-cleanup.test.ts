import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { RuntimeCleanupRequiredError } from "../src/upstream-browser/cleanup.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { removeRunnerTemporaryDirectory, RunnerProcess } from "../src/upstream-browser/service.js"

const projectRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const childScript = fileURLToPath(new URL("runner-process-child.py", import.meta.url))

function controlledRunner(mode: "normal" | "close_stage_failure" | "timeout" | "nonzero_exit",
  signal = new AbortController().signal) {
  return new RunnerProcess(projectRoot, signal, undefined, { runnerScript: childScript,
    runnerEnvironment: { BAT_TEST_RUNNER_MODE: mode }, closeTimeoutMs: 150, childCloseTimeoutMs: 150 })
}

test("真实 Python/browser child 正常 close，重复 close 等待同一份 confirmed report", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-runner-cleanup-real-"))
  const runner = new RunnerProcess(projectRoot, new AbortController().signal)
  try {
    await runner.startHybrid({ headless: true, profilePath: path.join(directory, "profile"),
      allowedOrigins: ["https://example.com"] })
    const first = await runner.close(), second = await runner.close()
    assert.equal(first.status, "confirmed")
    assert.strictEqual(second, first)
    assert.deepEqual(first.stages.map((stage) => [stage.stage, stage.status]), [
      ["capability_close", "confirmed"], ["browser_close", "confirmed"], ["close_protocol", "confirmed"],
      ["child_exit", "confirmed"], ["process_tree", "not_required"], ["temporary_directory", "confirmed"],
    ])
  } finally { await runner.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
})

test("close 阶段失败保留 allowlisted Python 阶段码而不退化为 exit 字符串", async () => {
  const runner = controlledRunner("close_stage_failure")
  await runner.startCompiler()
  const report = await runner.close()
  assert.equal(report.status, "unconfirmed")
  assert.equal(report.code, "cleanup_capability_close_failed")
  assert.equal(report.activeResources, false)
})

test("结构化 owner close 已确认时，child 非零退出只证明进程已结束而不制造 cleanup_required", async () => {
  const runner = controlledRunner("nonzero_exit")
  await runner.startCompiler()
  const report = await runner.close()
  assert.equal(report.status, "confirmed")
  assert.equal(report.activeResources, false)
  assert.equal(report.stages.find((stage) => stage.stage === "child_exit")?.status, "confirmed")
})

test("close protocol 超时后终止精确 child tree，仍执行临时目录清理", async () => {
  const runner = controlledRunner("timeout")
  await runner.startCompiler()
  const report = await runner.close()
  assert.equal(report.status, "unconfirmed")
  assert.equal(report.code, "cleanup_close_protocol_timeout")
  assert.equal(report.activeResources, false)
  assert.equal(report.stages.find((stage) => stage.stage === "process_tree")?.status, "confirmed")
  assert.equal(report.stages.find((stage) => stage.stage === "temporary_directory")?.status, "confirmed")
})

test("业务失败与 cleanup 失败分别保留在 typed error 中", async () => {
  const primary = new Error("primary_business_failure")
  await assert.rejects(withHybridCapabilities({ root: projectRoot, directory: tmpdir(), ownerId: "owned-execution",
    signal: new AbortController().signal, allowedOrigins: ["https://example.com"],
    createRunner: (_root, signal) => controlledRunner("close_stage_failure", signal) }, async () => {
      throw primary
    }), (error: unknown) => {
    assert.ok(error instanceof RuntimeCleanupRequiredError)
    assert.equal(error.ownerId, "owned-execution")
    assert.equal(error.report.code, "cleanup_capability_close_failed")
    assert.equal(error.primary.status, "failed")
    if (error.primary.status === "failed") assert.strictEqual(error.primary.error, primary)
    return true
  })
})

test("Windows 临时句柄竞态使用有界原生重试参数", async () => {
  let captured: Parameters<typeof rm>[1] | undefined
  await removeRunnerTemporaryDirectory("bounded-owned-directory", async (_target, options) => { captured = options })
  assert.deepEqual(captured, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})
