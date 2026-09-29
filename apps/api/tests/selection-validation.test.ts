import assert from "node:assert/strict"
import test from "node:test"
import { validateSelectionRequest } from "../src/upstream-browser/selection-validation.js"

test("导航选择复用同一沙箱，等价 href 的任一展示消失后仍须选择同一目的地", async () => {
  const input = { source: 'function main({candidates}) { return candidates.find(c => c.text === "2").attribute_href; }',
    outputKind: "url", maxItems: 10, candidates: [
      { text: "1", ordinal: 1, attribute_href: "https://example.test/list?page=1" },
      { text: "2", ordinal: 2, attribute_href: "https://example.test/list?page=2" },
      { text: "Next", ordinal: 3, attribute_href: "https://example.test/list?page=2" }],
    candidateSchema: { type: "array", maxItems: 10, items: { type: "object", properties: {
      text: { type: "string" }, ordinal: { type: "integer" }, attribute_href: { type: "string" } },
      required: ["text", "ordinal", "attribute_href"], additionalProperties: false } } }
  assert.deepEqual(await validateSelectionRequest(input, new AbortController().signal),
    { valid: false, reason: "function_output_invalid" })
  input.source = 'function main({candidates}) { const matches = candidates.filter(c => c.attribute_href.endsWith("page=2")); const hrefs = [...new Set(matches.map(c => c.attribute_href))]; if (hrefs.length !== 1) throw new Error("ambiguous"); return hrefs[0]; }'
  assert.deepEqual(await validateSelectionRequest(input, new AbortController().signal),
    { valid: true, url: "https://example.test/list?page=2" })
  input.source = 'function main() { return "https://example.test/unobserved"; }'
  assert.equal((await validateSelectionRequest(input, new AbortController().signal)).valid, false)
})

function request(maxItems = 1) {
  const rows = (text: string) => [{ text, ordinal: 1 }]
  return { source: "function main({candidates}) { if (candidates.length !== 1) throw new Error('ambiguous'); return candidates[0].ordinal; }",
    candidates: rows("current"), maxItems,
    candidateSchema: { type: "array", minItems: 0, maxItems, items: { type: "object",
      properties: { text: { type: "string" }, ordinal: { type: "integer", minimum: 1, maximum: maxItems } },
      required: ["text", "ordinal"], additionalProperties: false } },
    examples: [{ candidates: rows("changed"), ordinal: 1 }, { candidates: rows("another"), ordinal: 1 }] }
}

test("严格单例合同可验证不同内容，不能要求合同禁止的数量或序号变化", async () => {
  assert.deepEqual(await validateSelectionRequest(request(), new AbortController().signal), { valid: true, ordinal: 1 })
})

test("样例内容或正确序号不变不是错误，仍拒绝越界候选", async () => {
  assert.deepEqual(await validateSelectionRequest(request(10), new AbortController().signal), { valid: true, ordinal: 1 })
  const duplicate = request()
  duplicate.examples[1] = duplicate.examples[0]!
  assert.deepEqual(await validateSelectionRequest(duplicate, new AbortController().signal),
    { valid: true, ordinal: 1 })
  const oversized = request()
  oversized.candidates.push({ text: "unexpected second", ordinal: 2 })
  assert.deepEqual(await validateSelectionRequest(oversized, new AbortController().signal),
    { valid: false, reason: "selection_function_candidates_invalid" })
})

test("明确选第一项在不同长度列表中都应返回1，真实调用不依赖模型编造额外样例", async () => {
  const input = request(10)
  input.source = "function main({candidates}) { return candidates[0].ordinal; }"
  const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ text: `row ${index}`, ordinal: index + 1 }))
  input.candidates = rows(3)
  input.examples = [{ candidates: rows(2), ordinal: 1 }, { candidates: rows(4), ordinal: 1 }]
  assert.deepEqual(await validateSelectionRequest(input, new AbortController().signal), { valid: true, ordinal: 1 })
  const { examples: _examples, ...withoutInventedExamples } = input
  assert.deepEqual(await validateSelectionRequest(withoutInventedExamples, new AbortController().signal),
    { valid: true, ordinal: 1 })
})

test("函数仍须返回存在的ordinal，零基下标、缺失ordinal和错误样例不能通过", async () => {
  const input = request(10)
  input.candidates.push({ text: "second", ordinal: 2 })
  input.source = "function main({candidates}) { return candidates.findIndex(c => c.ordinal === 1); }"
  input.examples = []
  assert.equal((await validateSelectionRequest(input, new AbortController().signal)).valid, false)
  input.source = "function main() { return 9; }"
  assert.deepEqual(await validateSelectionRequest(input, new AbortController().signal),
    { valid: false, reason: "selection_function_ordinal_invalid" })
  input.source = "function main({candidates}) { return candidates.find(c => c.ordinal === 1).ordinal; }"
  input.examples = [{ candidates: input.candidates, ordinal: 2 }]
  const mismatch = await validateSelectionRequest(input, new AbortController().signal)
  assert.equal(mismatch.valid, false)
  assert.equal(mismatch.valid ? undefined : mismatch.reason, "function_draft_example_mismatch")
})
