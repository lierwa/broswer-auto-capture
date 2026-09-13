import assert from "node:assert/strict"
import test from "node:test"
import { parseTaskValue, type TaskDataContract } from "@browser-capture/contracts"
import { observationContract, outputFieldContract } from "../src/task-chain/trace-schema.js"

test("空页面集合不冻结复跑元素类型，输出推断继续遵循任务合同", () => {
  const contract = observationContract("page", "page")
  const empty = { url: "https://example.org", title: "title", text: "", truncated: false, links: [], headings: [], paragraphs: [] }
  parseTaskValue(contract, empty)
  parseTaskValue(contract, { ...empty, paragraphs: ["新页面正文"], links: [{ title: "next", url: "https://example.org/next" }] })
  assert.throws(() => parseTaskValue(contract, { ...empty, paragraphs: [17] }))
  const output: TaskDataContract = { ...contract, schema: { type: "object", properties: {
    labels: { type: "array", items: { type: "string" } } }, required: ["labels"], additionalProperties: false } }
  const field = outputFieldContract("labels", output, ["labels"], [])
  assert.deepEqual(parseTaskValue(field, ["新增值"]), ["新增值"])
  assert.throws(() => parseTaskValue(field, [{}]))
  assert.deepEqual(parseTaskValue(observationContract("tabs", "tabs"), [{ tabId: 1, active: true, url: "https://example.org" }]),
    [{ tabId: 1, active: true, url: "https://example.org" }])
})
