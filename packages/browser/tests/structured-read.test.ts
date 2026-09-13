import assert from "node:assert/strict"
import test from "node:test"
import { extractTarget, readTargetSchema } from "../src/structured-read.js"

test("受控 HTML 读取规格表和交互状态，过滤秘密表面", () => {
  const html = '<script>secret</script><table><tr><td>Width</td><td>60</td></tr></table>' +
    '<button id="menu" class="primary" aria-expanded="true">Menu</button><input type="password" value="secret">'
  const result = extractTarget(html, "https://example.org/", { selector: "table tr,button" }, new Date().toISOString())
  assert.deepEqual(result.matches.map((item) => item.text), ["Width60", "Menu"])
  assert.equal(result.matches[1]!.attributes["aria-expanded"], "true")
  assert.equal(result.matches[1]!.attributes.id, "menu")
  assert.equal(result.matches[1]!.attributes.class, "primary")
  assert.doesNotMatch(JSON.stringify(result), /secret/)
  assert.equal(readTargetSchema.safeParse({ selector: "@e12" }).success, false)
  assert.equal(readTargetSchema.safeParse({ selector: "input[type=password]" }).success, false)
  assert.equal(readTargetSchema.safeParse({ selector: 'button:has-text("Save")' }).success, false)
})

test("读取数量和链接授权边界保持显式，截断不能伪称完整", () => {
  const result = extractTarget('<a href="/a">a</a><a href="/?token=secret">b</a>', "https://example.org/",
    { selector: "a", maxItems: 1 }, new Date().toISOString())
  assert.equal(result.truncated, true)
  assert.equal(result.matches[0]!.attributes.href, "https://example.org/a")
})

test("大型页面快照截断时保留已取得匹配并标记结果不完整", () => {
  const result = extractTarget("<main><button>Available</button>", "https://example.org/",
    { selector: "button" }, new Date().toISOString(), true)
  assert.equal(result.matches[0]?.text, "Available")
  assert.equal(result.truncated, true)
})
