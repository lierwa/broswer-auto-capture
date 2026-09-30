import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { dailyChromeConnection, resolveDailyChromeEndpoint } from "../src/upstream-browser/daily-chrome-connection.js"

const browserPath = "/devtools/browser/test-browser-123"
const endpoint = `ws://127.0.0.1:9222${browserPath}`
const ownerId = "a81d8a80-50ae-48aa-a06c-558ccf08f76a"
const config = { allowedOrigins: ["https://example.test"], headless: false,
  profilePath: "/tmp/bat-daily-chrome-metadata", managedWindow: { ownerId, resume: false } }

test("macOS resolves only the standard daily Chrome connection file", async () => {
  const filenames: string[] = []
  assert.equal(await resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
    environment: { LOCALAPPDATA: "/unrelated", XDG_CONFIG_HOME: "/unrelated" },
    readPortFile: async (filename) => { filenames.push(filename); return `9222\n${browserPath}\n` } }), endpoint)
  assert.deepEqual(filenames, ["/Users/test-user/Library/Application Support/Google/Chrome/DevToolsActivePort"])
})

test("Windows uses LOCALAPPDATA or the standard home-directory fallback", async () => {
  const scenarios = [
    { environment: { LOCALAPPDATA: "D:\\LocalData" }, expected: "D:\\LocalData\\Google\\Chrome\\User Data\\DevToolsActivePort" },
    { environment: {}, expected: "C:\\Users\\test-user\\AppData\\Local\\Google\\Chrome\\User Data\\DevToolsActivePort" },
  ]
  for (const scenario of scenarios) {
    const filenames: string[] = []
    assert.equal(await resolveDailyChromeEndpoint({ platform: "win32", homeDirectory: "C:\\Users\\test-user",
      environment: scenario.environment,
      readPortFile: async (filename) => { filenames.push(filename); return `9222\n${browserPath}` } }), endpoint)
    // WHY：测试在 macOS 上运行；Windows 同时接受正反斜杠，比较标准化路径而非宿主分隔符。
    assert.deepEqual(filenames.map((filename) => path.win32.normalize(filename)), [scenario.expected])
  }
})

test("Linux uses XDG_CONFIG_HOME or the standard .config fallback", async () => {
  const scenarios = [
    { environment: { XDG_CONFIG_HOME: "/custom/config" }, expected: "/custom/config/google-chrome/DevToolsActivePort" },
    { environment: {}, expected: "/home/test-user/.config/google-chrome/DevToolsActivePort" },
  ]
  for (const scenario of scenarios) {
    const filenames: string[] = []
    assert.equal(await resolveDailyChromeEndpoint({ platform: "linux", homeDirectory: "/home/test-user",
      environment: scenario.environment,
      readPortFile: async (filename) => { filenames.push(filename); return `9222\n${browserPath}` } }), endpoint)
    assert.deepEqual(filenames, [scenario.expected])
  }
})

test("unsupported platforms do not read another browser's connection file", async () => {
  let reads = 0
  assert.equal(await resolveDailyChromeEndpoint({ platform: "freebsd", homeDirectory: "/home/test-user",
    readPortFile: async () => { reads++; return `9222\n${browserPath}` } }), undefined)
  assert.equal(reads, 0)
})

test("a missing native file is unavailable, not a private-browser fallback", async () => {
  const missing = Object.assign(new Error("missing test fixture"), { code: "ENOENT" })
  assert.equal(await resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
    readPortFile: async () => { throw missing } }), undefined)
  const denied = Object.assign(new Error("denied test fixture"), { code: "EACCES" })
  await assert.rejects(resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
    readPortFile: async () => { throw denied } }), (error: unknown) => error === denied)
})

test("native CRLF and valid boundary ports become loopback WebSocket endpoints", async () => {
  for (const port of [1, 9222, 65_535]) {
    assert.equal(await resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
      readPortFile: async () => `${port}\r\n${browserPath}\r\n` }), `ws://127.0.0.1:${port}${browserPath}`)
  }
})

test("native port text must be decimal digits, not JavaScript numeric syntax", async () => {
  for (const rawPort of ["1e3", "0x2406", "+9222"]) {
    await assert.rejects(resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
      readPortFile: async () => `${rawPort}\n${browserPath}` }),
    { message: "hybrid_existing_browser_endpoint_invalid" })
  }
})

// WHY：连接文件不是 URL 配置；拒绝外部地址、额外参数和畸形内容，错误不回显端点原文。
test("invalid native ports and browser paths are rejected without exposing file contents", async () => {
  const invalid = [
    `0\n${browserPath}`, `-1\n${browserPath}`, `65536\n${browserPath}`, `9222.5\n${browserPath}`,
    `not-a-port\n${browserPath}`, `9222-secret\n${browserPath}`, "9222",
    `9222\n${browserPath}\nextra-secret-line`, "9222\n/devtools/page/private-page",
    "9222\n/devtools/browser/", "9222\n/devtools/browser/../secret-browser",
    "9222\n/devtools/browser/private%2Fbrowser", "9222\n/devtools/browser/private-browser?token=secret",
    "9222\n/devtools/browser/private-browser#secret", "9222\nws://external.example/devtools/browser/private-browser",
  ]
  for (const contents of invalid) {
    await assert.rejects(resolveDailyChromeEndpoint({ platform: "darwin", homeDirectory: "/Users/test-user",
      readPortFile: async () => contents }), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, "hybrid_existing_browser_endpoint_invalid")
      assert.equal(error.message.includes(contents), false)
      return true
    })
  }
})

test("daily Chrome cannot be silently attached with headless configuration", async () => {
  await assert.rejects(dailyChromeConnection({ ...config, headless: true }, undefined, async () => endpoint),
    { message: "hybrid_existing_browser_headless_unsupported" })
})

test("daily Chrome requires an explicit product owner", async () => {
  await assert.rejects(dailyChromeConnection({ ...config, managedWindow: undefined }, undefined, async () => endpoint),
    { message: "hybrid_existing_browser_owner_required" })
})

test("native attachment preserves the product resume identity without mutating its configuration", async () => {
  const original = { ...config, managedWindow: { ownerId, resume: true } }
  const attached = await dailyChromeConnection(original, undefined, async () => endpoint)
  assert.deepEqual(attached.existingBrowser, { cdpUrl: endpoint, ownerId, resume: true })
  assert.equal(attached.managedWindow, undefined)
  assert.deepEqual(original.managedWindow, { ownerId, resume: true })
})

test("an existing browser lease wins over discovery and environment endpoints", async () => {
  let discoveries = 0
  const attached = await dailyChromeConnection({ ...config, managedWindow: undefined,
    existingBrowser: { cdpUrl: endpoint, ownerId, resume: true } },
  "ws://127.0.0.1:9333/devtools/browser/other-browser", async () => { discoveries++; return undefined })
  assert.deepEqual(attached.existingBrowser, { cdpUrl: endpoint, ownerId, resume: true })
  assert.equal(discoveries, 0)
})
