import assert from "node:assert/strict"
import test from "node:test"
import { hybridPostconditionSchema, readSpecificationSchema } from "../src/upstream-browser/hybrid-schema.js"

const read = { container: ".record", fields: { title: { selector: ".title", attribute: null,
  valueType: "string" as const } }, maxItems: 5, outputSchema: { type: "array" as const, maxItems: 5,
  items: { type: "object" as const, properties: { title: { type: "string" as const, maxLength: 200 } },
    required: ["title"], additionalProperties: false } } }
const settle = { maxMs: 30000, maxAttempts: 100, intervalMs: 300 }

test("消费就绪只能引用一个正式读取节点并使用有界等待", () => {
  const parsed = hybridPostconditionSchema.parse({ kind: "read_fields", transition: true,
    consumerRef: "s-a-0002", read, scope: { url: "https://example.test/issues" }, settle })
  assert.equal("transition" in parsed, true)
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "read_fields", transition: true, read, settle }),
    /consumer_readiness_owner_and_settle_required/)
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "target_visible", ready: true,
    consumerRef: "s-a-0002", settle }), /consumer_readiness/)
})

test("动作事实仍只允许一个权威来源，读取输出 schema 保持独立", () => {
  assert.doesNotThrow(() => hybridPostconditionSchema.parse({ kind: "url", bindingArgument: "url", settle }))
  assert.throws(() => hybridPostconditionSchema.parse({ kind: "url", bindingArgument: "url", changed: true }),
    /one_postcondition_authority_required/)
  assert.doesNotThrow(() => hybridPostconditionSchema.parse({ kind: "output_schema", schemaDigest: null }))
})

test("URL 解析只能用于 href 投影", () => {
  assert.doesNotThrow(() => readSpecificationSchema.parse({ ...read, fields: {
    url: { selector: "a", attribute: "href", resolveUrl: true, valueType: "string" },
  } }))
  assert.throws(() => readSpecificationSchema.parse({ ...read, fields: {
    title: { selector: ".title", attribute: null, resolveUrl: true, valueType: "string" },
  } }), /url_resolution_requires_href/)
})
