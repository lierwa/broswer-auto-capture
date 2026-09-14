import assert from "node:assert/strict"
import test from "node:test"
import type { TaskAuthoringJob } from "@browser-capture/contracts"
import { reusablePlanCandidate } from "../src/task-chain/authoring-recovery.js"

test("本地规划校验失败后复用已完成模型输出", () => {
  const candidate = { summary: "two reusable steps" }, invocationId = "invocation"
  const jobs = [{ type: "chain", key: "same-input", status: "failed", authoring: { stage: "planning" },
    audit: { purpose: "chain_exploration_and_compilation", events: [
      { invocationId, type: "generation.started" },
      { invocationId, type: "text.delta", text: JSON.stringify(candidate).slice(0, 12) },
      { invocationId, type: "text.delta", text: JSON.stringify(candidate).slice(12) },
      { invocationId, type: "generation.completed" },
    ] } }] as unknown as TaskAuthoringJob[]
  jobs.push({ type: "chain", key: "same-input", status: "failed", authoring: { stage: "planning" },
    audit: { purpose: "chain_exploration_and_compilation", events: [
      { invocationId: "later", type: "generation.started" }, { invocationId: "later", type: "generation.failed" },
    ] } } as never)
  assert.deepEqual(reusablePlanCandidate(jobs, "same-input"), candidate)
  assert.equal(reusablePlanCandidate(jobs, "different-input"), undefined)
})
