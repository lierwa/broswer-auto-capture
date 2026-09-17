import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { hybridCommandSchema, hybridStartRequestSchema } from "../src/upstream-browser/hybrid-protocol.js"

const root = path.resolve(import.meta.dirname, "../../..")
// H0 original bytes are preserved in work/workflow-use-hybrid-h6-before and the H6 digest manifest.
test("v2 runner 严格拒绝旧 definition、隐藏模型句柄和非精确来源，零浏览器", () => {
  const python = path.join(root, "work/upstream-browser-hybrid/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  assert.doesNotThrow(() => execFileSync(python, [path.join(root, "apps/api/tests/fixtures/hybrid-runner-protocol.py")], {
    cwd: root, encoding: "utf8", env: { PATH: process.env.PATH,
      PYTHONPATH: [path.join(root, "apps/api/python"), path.join(root, "vendor/workflow-use/workflows")].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" },
    stdio: ["ignore", "pipe", "pipe"] }))
})

test("TypeScript 协议不接受未审定动作或模型字段", () => {
  assert.equal(hybridCommandSchema.safeParse({ name: "browser.workflow-step", version: 2, actionName: "evaluate", args: {}, target: null,
    postconditions: [{ kind: "title", equals: "Ready" }] }).success, false)
  assert.equal(hybridStartRequestSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", type: "hybrid_start",
    config: { headless: true, allowedOrigins: ["https://fixture.invalid"], model: "hidden" } }).success, false)
})
