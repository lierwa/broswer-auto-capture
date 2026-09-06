import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createApplication } from "../src/app.js"
import { validateProposal } from "../src/plan/validation.js"
import { planStateSchema } from "@browser-capture/contracts/plan"

const root = fileURLToPath(new URL("../../..", import.meta.url)), directory = path.join(root, "work", "f3-real-1788678265551")
const before = planStateSchema.parse(JSON.parse(await readFile(path.join(directory, "f4-acceptance.json"), "utf8")))
const current = await createApplication({ root, directory, planExecutor: null })
try {
  const state = current.plan.snapshot(before.taskId), plan = state.records[0]!, source = current.research.snapshot(before.taskId).records[0]!
  assert.deepEqual(state.records, before.records); assert.deepEqual(state.executions, before.executions)
  assert.equal(state.staleIds.length, 0); assert.equal(state.executions[0]?.status, "queued")
  assert.doesNotThrow(() => validateProposal(plan.proposal, plan, source))
  assert.equal(current.browser.owner(), null)
  await writeFile(path.join(directory, "f4-reopen.json"), JSON.stringify({ passed: true, planId: plan.id, executionId: state.executions[0]!.id, audit: plan.audit, browserActive: false }, null, 2))
  process.stdout.write("PASS real source plan validation and durable queue reopen; no new model or browser calls\n")
} finally { await current.app.close() }
