import assert from "node:assert/strict"
import { test } from "node:test"
import type { JsonValue } from "@browser-capture/contracts"
import { explainPlanCandidateIssues } from "../src/task-chain/plan-candidate-diagnostics.js"

const candidate = { steps: [{ resultSpec: {
  schema: { type: "object", properties: { products: { type: "array", maxItems: 10,
    items: { type: "object", properties: { name: { type: "string" } },
      required: ["name"], additionalProperties: false } } },
  required: ["products"], additionalProperties: false },
  fields: [
    { path: ["products"], producerRef: "whole-list" },
    { path: ["products", 0, "name"], producerRef: "first-name" },
  ],
} }] } as JsonValue

test("conflict diagnostic names both source paths and preserves the raw candidate", () => {
  const before = JSON.stringify(candidate)
  const result = explainPlanCandidateIssues(candidate, [{ path: ["steps", 0, "resultSpec", "fields", 0, "path"],
    code: "result_spec_path_conflict", message: "result_spec_path_conflict" }])
  assert.match(result[0]!.message, /products \(whole-list\)/)
  assert.match(result[0]!.message, /products\[0\]\.name \(first-name\)/)
  assert.equal(JSON.stringify(candidate), before)
})

test("required array diagnostic does not count one element as the whole list", () => {
  const source = structuredClone(candidate) as { steps: Array<{ resultSpec: { fields: unknown[] } }> }
  source.steps[0]!.resultSpec.fields.shift()
  const result = explainPlanCandidateIssues(source as JsonValue, [{ path: ["steps", 0, "resultSpec", "fields"],
    code: "result_spec_required_path_missing", message: "result_spec_required_path_missing" }])
  assert.match(result[0]!.message, /products/)
  assert.match(result[0]!.message, /数组元素的子路径不能代表整个集合/)
})
