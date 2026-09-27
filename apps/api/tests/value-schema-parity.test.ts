import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"
import { parseTaskValue, type ValueSchema } from "@browser-capture/contracts"

// WHY：任务合同会同时进入TS执行器和Python读取器；同一JSON值不能在两侧得到不同结论。
test("动态值合同复用JSON Schema语义并与真实Python校验一致", { skip: !process.env.BAT_TEST_PYTHON }, () => {
  const samples: Array<{ schema: ValueSchema; value: unknown; valid: boolean }> = [
    { schema: { type: "string", minLength: 2 }, value: "😀", valid: false },
    { schema: { type: "string", maxLength: 1 }, value: "😀", valid: true },
    { schema: { type: "string", minLength: 2, maxLength: 2 }, value: "😀中", valid: true },
    { schema: { type: "string" }, value: 'function main({x}) {\n  return /\\d+/.test(x) ? "中文😀" : "\\\\";\n}', valid: true },
    { schema: { type: "integer" }, value: 4.0, valid: true },
    { schema: { type: "integer" }, value: 4.5, valid: false },
    { schema: { type: "integer" }, value: "4", valid: false },
    { schema: { type: "integer" }, value: true, valid: false },
    { schema: { type: "boolean" }, value: "false", valid: false },
    { schema: { type: "null" }, value: null, valid: true },
    ...[{}, { label: null }, { label: "中" }, { label: "中", extra: 1 }].map((value, index) => ({
      schema: { type: "object", properties: { label: { type: "string" } }, required: [], additionalProperties: false } as ValueSchema,
      value, valid: index === 0 || index === 2,
    })),
    { schema: { type: "array", minItems: 1, items: { type: "string", maxLength: 1 } }, value: ["😀"], valid: true },
    { schema: { type: "array", minItems: 1, items: { type: "string", maxLength: 1 } }, value: [], valid: false },
  ]
  const python = JSON.parse(execFileSync(process.env.BAT_TEST_PYTHON!, ["-c",
    "import json,sys; from jsonschema import Draft202012Validator; print(json.dumps([Draft202012Validator(x['schema']).is_valid(x['value']) for x in json.load(sys.stdin)]))",
  ], { input: JSON.stringify(samples), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } }))
  assert.deepEqual(python, samples.map((sample) => sample.valid), "Python标准校验与预期不符")
  const actual = samples.map(({ schema, value }) => {
    try {
      const output = parseTaskValue({ id: "parity", version: 1, dialect: "bat-value-schema/v1", schema }, value)
      assert.deepEqual(output, value, "验证不得强制转换、填默认值或删除字段")
      return true
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error
      return false
    }
  })
  assert.deepEqual(actual, python, "TS与Python必须按同一schema接受/拒绝")
})
