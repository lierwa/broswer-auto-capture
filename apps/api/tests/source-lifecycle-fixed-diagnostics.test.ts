import assert from "node:assert/strict"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { z } from "zod"
import { SourceLifecycleDiagnostics } from "../src/upstream-browser/source-lifecycle-diagnostics.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

test("field-read diagnostics retain fixed codes and discard private error details", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bat-source-diagnostic-"))
  const diagnostics = new SourceLifecycleDiagnostics(directory, "7921613a-e48f-4459-8a13-f1e774be3187")
  try {
    for (const readError of ["ambiguous_or_missing_read_field: private selector and page value",
      "read_private_account_value: private text"]) {
      diagnostics.acceptPythonLine(JSON.stringify({ phase: "after_step", status: "completed",
        actionName: "bat_read_fields", stepNumber: 1, readOutcome: "failed", readError,
        container: "private container" }))
    }
    const saved = readFileSync(diagnostics.file, "utf8")
    const records = saved.trim().split("\n").map((line) => JSON.parse(line))
    assert.deepEqual(records.map((record) => record.readError),
      ["ambiguous_or_missing_read_field", "bat_read_fields_failed"])
    assert.ok(!saved.includes("private") && !saved.includes("container"))
  } finally {
    diagnostics.close()
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})

test("fixed Python fault stages persist without altering public authoring progress", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bat-source-diagnostic-"))
  const progress: unknown[] = []
  const diagnostics = new SourceLifecycleDiagnostics(directory, "30a200e4-0f33-4545-8774-f028a6ad43d6",
    (event) => progress.push(event))
  try {
    diagnostics.acceptPythonLine(JSON.stringify({ phase: "before_action_detail", status: "failed", actionName: "wait",
      stepNumber: 13, stage: "live_target_before", errorKind: "timeout_error" }))
    diagnostics.acceptPythonLine(JSON.stringify({ phase: "author_transport", status: "failed", code: "serialize_failed" }))
    diagnostics.acceptPythonLine(JSON.stringify({ phase: "author_transport", status: "failed",
      code: "serialize_failed", raw: "private page text" }))
    diagnostics.acceptPythonLine(JSON.stringify({ phase: "author", status: "completed" }))
    assert.equal(progress.length, 1)
    const records = readFileSync(diagnostics.file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    assert.deepEqual(records.map(({ phase, source }) => [phase, source]), [
      ["before_action_detail", "python"], ["author_transport", "python"], ["author", "python"],
    ])
    assert.ok(!records.some((record) => JSON.stringify(record).includes("private page text")))
  } finally {
    diagnostics.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("ordinary action failure persists one bounded original-attempt diagnostic and rejects private extras", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bat-source-diagnostic-"))
  const diagnostics = new SourceLifecycleDiagnostics(directory, "c3d41fbd-947b-45f1-871d-17f9652166a8")
  const state = { "aria-expanded": true, disabled: false }
  const event = { phase: "runtime_action_failure", status: "failed", actionRef: "s-a-0002", actionName: "click",
    errorCode: "ordinary_postcondition_failed_target_state_fact_mismatch", dispatchCount: 1,
    check: { kind: "target_state", attempts: 100, expected: state,
      actual: { "aria-expanded": false, disabled: false } },
    beforePage: { sessionDigest: "1".repeat(64), targetDigest: "2".repeat(64),
      documentDigest: "3".repeat(64), urlDigest: "4".repeat(64) },
    afterPage: { sessionDigest: "1".repeat(64), targetDigest: "2".repeat(64),
      documentDigest: "3".repeat(64), urlDigest: "4".repeat(64) },
    validationTarget: { sessionDigest: "1".repeat(64), targetDigest: "2".repeat(64),
      documentDigest: "3".repeat(64), backendDigest: "5".repeat(64) },
    eventTarget: { relation: "descendant", trusted: true, eventCount: 1,
      targetKind: "element", targetTag: "span", targetRef: "n-0001" } }
  try {
    diagnostics.acceptPythonLine(JSON.stringify(event))
    diagnostics.acceptPythonLine(JSON.stringify({ ...event, privateText: "account-private@example.test" }))
    const saved = readFileSync(diagnostics.file, "utf8")
    const records = saved.trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(records.length, 1)
    assert.equal(records[0].dispatchCount, 1)
    assert.deepEqual(records[0].check.actual, { "aria-expanded": false, disabled: false })
    assert.ok(!saved.includes("private"))
  } finally {
    diagnostics.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("model failure code and primary cleanup outcomes stay correlated without raw errors", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bat-source-diagnostic-"))
  const diagnostics = new SourceLifecycleDiagnostics(directory, "eab9cc7c-c1c5-47f6-899c-0ba95289b2fa")
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage,
    status: stage === "browser_close" ? "unconfirmed" as const : "confirmed" as const,
    code: stage === "browser_close" ? "cleanup_browser_close_failed" as const : null })), false)
  try {
    diagnostics.recordModel({ callId: "f46a67db-7836-44f4-b1bd-04c3554dfa16", purpose: "agent", model: "fixture",
      intendedAt: "2026-09-29T00:00:00.000Z", status: "failed", reportedInvocations: 1,
      failureCategory: "ai_event_failure", failureCode: "model_account_model_unavailable" })
    diagnostics.recordRuntimeOutcome({ status: "failed",
      error: new Error("upstream_runner_start_failed:private-account-value") }, report)
    const saved = readFileSync(diagnostics.file, "utf8")
    const records = saved.trim().split("\n").map((line) => JSON.parse(line))
    assert.deepEqual(records[0].failureCategory, "ai_event_failure")
    assert.deepEqual(records[0].failureCode, "model_account_model_unavailable")
    assert.deepEqual(records[1].primary, { status: "failed", category: "runner_protocol",
      code: "upstream_runner_start_failed" })
    assert.equal(records[1].cleanup.code, "cleanup_browser_close_failed")
    assert.ok(!saved.includes("private-account-value"))
  } finally {
    diagnostics.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test("nested author result union logs only bounded fixed Zod codes and safe paths", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bat-source-diagnostic-"))
  const diagnostics = new SourceLifecycleDiagnostics(directory, "56352c3d-2984-4895-98da-65ce4162d05d")
  const privateKey = "account-private@example.test", privateValue = "private page value"
  const nested = z.union([
    z.object({ response: z.object({ compilation: z.object({ segments: z.array(z.object({
      operation: z.object({ specification: z.object({ requireComplete: z.boolean() }) }),
    })) }) }) }),
    z.object({ output: z.record(z.string(), z.number()) }),
  ])
  try {
    const result = nested.safeParse({ response: { compilation: { segments: [{
      operation: { specification: { requireComplete: privateValue } },
    }] } }, output: { [privateKey]: privateValue } })
    assert.equal(result.success, false)
    if (result.success) return
    diagnostics.recordTransportBoundary("author_result_schema_invalid", result.error)
    diagnostics.recordTransportBoundary("author_result_schema_invalid",
      z.string().refine(() => false, { message: privateValue }).safeParse("x").error)
    diagnostics.recordTransportBoundary("author_result_schema_invalid", new Error(privateValue))
    const records = readFileSync(diagnostics.file, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    const issues = records[0].issues as Array<{ code: string; path: Array<string | number> }>
    assert.ok(issues.some((issue) => issue.code === "invalid_type"
      && issue.path.join(".") === "response.compilation.segments.0.operation.specification.requireComplete"))
    assert.ok(issues.some((issue) => issue.path.join(".") === "output.<key>"))
    assert.ok(issues.every((issue) => issue.code !== "invalid_union" && issue.path.length <= 12))
    assert.ok(issues.length <= 16)
    assert.deepEqual(records[1].issues, [{ code: "custom", path: [] }])
    assert.equal(records[2].issues, undefined)
    const saved = JSON.stringify(records)
    assert.ok(!saved.includes(privateKey) && !saved.includes(privateValue))
    assert.ok(!saved.includes("message") && !saved.includes("raw"))
  } finally {
    diagnostics.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
