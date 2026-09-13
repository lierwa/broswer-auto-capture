import assert from "node:assert/strict"
import test from "node:test"
import { traceEvent, validateExplorationResult } from "../src/task-chain/exploration-trace.js"
import type { TaskDataContract } from "@browser-capture/contracts"
const contract: TaskDataContract = { id: "result", version: 1, dialect: "bat-value-schema/v1", schema: {
  type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } }
const event = traceEvent("page", { type: "page" }, { title: "Observed" }, null)
const value = { result: { title: "Observed" }, provenance: [{ source: "tool", outputPath: ["title"], eventId: "page", resultPath: ["title"] }] }

test("tool provenance 把真实事件值投影到业务结果", () => {
  assert.deepEqual(validateExplorationResult(value, contract, [event]).result, value.result)
  assert.deepEqual(validateExplorationResult({ ...value, result: { title: "Invented" } }, contract, [event]).result, value.result)
  assert.deepEqual(validateExplorationResult({ ...value, result: {} }, contract, [event]).result, value.result)
  assert.throws(() => validateExplorationResult(value, contract, []), /event_missing/)
  assert.throws(() => validateExplorationResult({ ...value, provenance: [] }, contract, [event]))
})

test("无来源字段、临时引用和推断均保持明确边界", () => {
  const expanded: TaskDataContract = { ...contract, schema: { type: "object", properties: {
    title: { type: "string" }, other: { type: "string" } }, required: ["title", "other"], additionalProperties: false } }
  assert.throws(() => validateExplorationResult({ ...value, result: { title: "Observed", other: "missing" } }, expanded, [event]), /field_missing/)
  assert.throws(() => traceEvent("click", { type: "click", target: { selector: "@e5" } }, null, null), /temporary_target/)
  const inference = validateExplorationResult({ result: { title: "Summary" }, provenance: [{ source: "inference",
    outputPath: ["title"], eventIds: ["page"], instruction: "Summarize" }] }, contract, [event])
  assert.equal(inference.provenance[0]!.source, "inference")
})

test("inference URL 只规范化到所引事件中的唯一兼容真实地址", () => {
  const urlContract: TaskDataContract = { id: "url-result", version: 1, dialect: "bat-value-schema/v1", schema: {
    type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } }
  const exact = "https://example.com/Search?q=one&trace=abc"
  const first = traceEvent("first", { type: "page" }, { url: exact }, null)
  const inferred = { result: { url: "https://example.com/Search?q=one" }, provenance: [{ source: "inference" as const,
    outputPath: [], eventIds: ["first"], instruction: "Use the observed page URL." }] }
  assert.deepEqual(validateExplorationResult(inferred, urlContract, [first]).result, { url: exact })

  const second = traceEvent("second", { type: "page" }, { url: "https://example.com/Search?q=one&trace=def" }, null)
  assert.deepEqual(validateExplorationResult({ ...inferred, provenance: [{ ...inferred.provenance[0]!,
    eventIds: ["first", "second"] }] }, urlContract, [first, second]).result, inferred.result)
})
