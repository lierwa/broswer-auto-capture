import assert from "node:assert/strict"
import test from "node:test"
import { readSpecificationSchema } from "../src/upstream-browser/hybrid-schema.js"

test("原生当前页地址进入普通读取协议，拒绝混合字段与伪字符串形状", () => {
  const specification = { container: "html", maxItems: 1,
    fields: { entry: { selector: ":scope", attribute: null, valueType: "string", valueSource: "page-url" } },
    outputSchema: { type: "object", properties: { entry: { type: "string" } }, required: ["entry"], additionalProperties: false } }
  assert.doesNotThrow(() => readSpecificationSchema.parse(specification))
  for (const field of [{ attribute: "href" }, { valueType: "integer" }, { selector: "a" },
    { multiple: true }, { contentSource: "page-content" }, { textPrefix: "https://" }]) {
    assert.equal(readSpecificationSchema.safeParse({ ...specification,
      fields: { entry: { ...specification.fields.entry, ...field } } }).success, false)
  }
})
