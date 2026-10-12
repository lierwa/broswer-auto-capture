import assert from "node:assert/strict"
import test from "node:test"
import { publicUrl } from "../src/index.js"

test("搜索跳转只解码页面原有目标，过滤凭证与身份链接", () => {
  const target = "https://example.com/catalog?id=42"
  assert.equal(publicUrl(`https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString("base64url")}`), target)
  assert.equal(publicUrl("https://user:password@example.com/"), null)
  assert.equal(publicUrl("https://example.com/login"), null)
  assert.equal(publicUrl("https://example.com/?auth_token=test"), null)
})
