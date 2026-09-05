import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")

function themeBlock(theme: "light" | "dark") {
  const match = css.match(new RegExp(`\\.app-shell\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\}`))
  assert.ok(match?.[1], `缺少 ${theme} 主题 token 块`)
  return match[1]
}

function colorTokenNames(block: string) {
  return [...block.matchAll(/(--color-[a-z-]+)\s*:/g)].map((match) => match[1]).sort()
}

test("浅色与深色主题暴露完全相同的语义颜色 token", () => {
  const expected = [
    "--color-accent", "--color-accent-foreground", "--color-accent-muted", "--color-border", "--color-canvas",
    "--color-focus", "--color-overlay", "--color-panel", "--color-panel-raised", "--color-rail",
    "--color-shadow", "--color-success", "--color-text", "--color-text-muted",
  ].sort()

  assert.deepEqual(colorTokenNames(themeBlock("light")), expected)
  assert.deepEqual(colorTokenNames(themeBlock("dark")), expected)
})

test("组件样式不散落硬编码十六进制颜色", () => {
  const withoutThemeDefinitions = css
    .replace(/\.app-shell\[data-theme="light"\] \{[\s\S]*?\}/, "")
    .replace(/\.app-shell\[data-theme="dark"\] \{[\s\S]*?\}/, "")

  assert.equal(withoutThemeDefinitions.match(/#[0-9a-f]{3,8}\b/gi), null)
})
