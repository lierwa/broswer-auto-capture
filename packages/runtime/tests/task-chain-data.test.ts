import assert from "node:assert/strict"
import test from "node:test"
import { executeDataOperation } from "../src/task-chain/data.js"

test("merge 既可合并集合，也可用命名 binding 组装动态对象", () => {
  assert.deepEqual(executeDataOperation("merge", { sources: [{ left: 1 }, { right: 2 }] }), { left: 1, right: 2 })
  assert.deepEqual(executeDataOperation("merge", { sourceUrl: "https://example.com/", title: "Example Domain" }),
    { sourceUrl: "https://example.com/", title: "Example Domain" })
})
