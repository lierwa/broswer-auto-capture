import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { TaskPlanExecutor } from "../src/task-chain/plan-executor.js"
import { queuedExecution } from "../src/task-chain/queued-runs.js"
import { RuntimeCleanupRequiredError, cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { UpstreamProtocolError } from "../src/upstream-browser/service.js"

// WHY：无头没有交付页，仍必须持久化同次 owner，且清理失败不能覆盖原运行失败。
test("无头正式运行清理未确认保留本次 owner 和原失败，沿用现有清理合同", async () => {
  const { plan, requirement, chain } = structuredClone(extractionFixture)
  plan.requirement.digest = digestJson(requirement)
  chain.plan.digest = digestJson(plan)
  const release = { id: randomUUID(), version: 1, content: { plan, steps: [{ stepId: chain.stepId, chain }] } }
  const record = queuedExecution(plan.taskId, randomUUID(), plan, requirement, release as never,
    { destination: "https://example.invalid/" }, { nodeDelayMs: 0 }, { mode: "dedicated-headless", headless: true })
  record.steps[0]!.chain.digest = executableChainDigest(chain)
  let persistedOwner: string | null = null
  const repository = { plan: () => plan, requirement: () => requirement, chain: () => chain,
    saveExecution: () => { persistedOwner = record.browserHandoff.ownerId }, saveCleanupAudit() {},
    run() { throw new Error("no task run was started") } }
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => stage === "browser_close"
    ? { stage, status: "unconfirmed", code: "cleanup_browser_close_failed" }
    : { stage, status: "confirmed", code: null }), true)
  const host = { async group(input: { browserRunId: string; managedWindow?: { ownerId: string }; browser?: { mode?: string } }) {
    assert.equal(persistedOwner, stableUuid(record.id, "managed-window"))
    assert.equal(input.managedWindow?.ownerId, persistedOwner)
    assert.equal(input.browser?.mode, "dedicated-headless")
    throw new RuntimeCleanupRequiredError(input.browserRunId, report,
      { status: "failed", error: new UpstreamProtocolError("controlled_start_failure", null) })
  } }
  const executor = new TaskPlanExecutor({ snapshot: () => ({ active: null, confirmedVersion: 1 }) } as never,
    repository as never, host as never)
  const result = await executor.execute(record, new AbortController().signal)
  assert.equal(result.status, "cleanup_required")
  assert.equal(result.cleanupResume?.status, "failed")
  assert.equal(result.cleanupResume?.result?.failure?.code, "controlled_start_failure")
  assert.equal(result.browserHandoff.ownerId, persistedOwner)
  assert.equal(result.consumed.llmCalls, 0)
})
