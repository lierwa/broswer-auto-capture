import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { arch, platform, release } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

if (process.env.BAT_D2_TSX_BOOTSTRAPPED !== "1") {
  const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], {
    cwd: process.cwd(), stdio: "inherit", env: { ...process.env, BAT_D2_TSX_BOOTSTRAPPED: "1" },
  })
  process.exit(child.status ?? 1)
}

const { executeFunctionNode, functionLimits, functionRuntimeDiagnostics } =
  await import("../packages/runtime/src/task-chain/index.ts")

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const encoder = new TextEncoder()
const anyContract = { id: "json", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {}, required: [], additionalProperties: true } }
const cases = []

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

function node(source, timeoutMs = 500, outputContract = anyContract) {
  return { id: "function", label: "function", kind: "function", language: "javascript", source,
    inputs: {}, outputContract, writes: [], timeoutMs }
}

async function execute(name, source, { timeoutMs = 500, input = {}, expectedOutcome = "success", expectedCode,
  outputContract = anyContract, cancelAfterMs } = {}) {
  const controller = new AbortController()
  const timer = cancelAfterMs === undefined ? null : setTimeout(() => controller.abort("platform_acceptance"), cancelAfterMs)
  const started = performance.now()
  let result
  try { result = await executeFunctionNode(node(source, timeoutMs, outputContract), input, controller.signal) }
  finally { if (timer) clearTimeout(timer) }
  const cleanup = functionRuntimeDiagnostics()
  const passed = result.outcome === expectedOutcome && (expectedCode === undefined || result.reason === expectedCode)
    && cleanup.activeWorkers === 0 && cleanup.activeRuntimes === 0 && cleanup.activeContexts === 0 && cleanup.cleanupFailures === 0
  cases.push({ name, passed, outcome: result.outcome, code: result.reason ?? null,
    durationMs: Math.round((performance.now() - started) * 100) / 100, cleanup })
  assert.equal(passed, true, `${name}:${result.outcome}:${result.reason ?? "none"}`)
  return result
}

const normalSource = "function main(inputs) { return { normalized: inputs.value.trim().toLowerCase(), count: inputs.items.length }; }"
const input = { value: "  VALUE ", items: [1, 2, 3] }
const first = await execute("normal_json", normalSource, { input })
const second = await execute("deterministic_repeat", normalSource, { input })
assert.deepEqual(first.output, second.output)

await execute("host_isolation", `function main() { return {
  process: typeof process, require: typeof require, fetch: typeof fetch, browser: typeof Browser,
  date: typeof Date, intl: typeof Intl, random: typeof Math.random, timer: typeof setTimeout,
  evaluator: typeof eval, functionCtor: typeof Function
}; }`)
await execute("infinite_loop", "function main() { while (true) {} }", {
  timeoutMs: 50, expectedOutcome: "timeout", expectedCode: "function_timeout" })
await execute("after_timeout", "function main() { return { recovered: true }; }")
await execute("heap_limit", "function main() { const a = []; while (true) a.push('x'.repeat(1048576)); }", {
  timeoutMs: 5_000, expectedOutcome: "failed", expectedCode: "function_memory_limit" })
await execute("stack_limit", "function main() { function dive() { return dive(); } return dive(); }", {
  expectedOutcome: "failed", expectedCode: "function_memory_limit" })
await execute("invalid_output", "function main() { return undefined; }", {
  expectedOutcome: "failed", expectedCode: "function_output_invalid" })
await execute("oversized_output", "function main() { return { value: 'x'.repeat(2097152) }; }", {
  expectedOutcome: "failed", expectedCode: "function_output_too_large" })
await execute("cancelled", "function main() { while (true) {} }", {
  timeoutMs: 1_000, cancelAfterMs: 20, expectedOutcome: "cancelled", expectedCode: "function_cancelled" })

const packageJson = JSON.parse(await readFile(join(root, "packages/runtime/package.json"), "utf8"))
const lockBytes = await readFile(join(root, "package-lock.json"))
const implementationFiles = [
  "packages/contracts/src/task-chain/node.ts", "packages/contracts/src/task-chain/chain.ts",
  "packages/runtime/src/task-chain/function.ts", "packages/runtime/src/task-chain/function-worker.ts",
]
const implementationBytes = Buffer.concat(await Promise.all(implementationFiles.map((path) => readFile(join(root, path)))))
const git = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
const report = {
  schemaVersion: 1, accepted: cases.every((item) => item.passed), at: new Date().toISOString(),
  platform: { os: platform(), release: release(), arch: arch(), node: process.version },
  dependency: { name: "quickjs-emscripten", version: packageJson.dependencies["quickjs-emscripten"] },
  revision: { commit: git, packageLockDigest: digest(lockBytes), implementationDigest: digest(implementationBytes) },
  limits: functionLimits, sourceDigest: digest(encoder.encode(normalSource)),
  cases, cleanup: functionRuntimeDiagnostics(), browserCommands: 0, modelCalls: 0,
}
const stamp = report.at.replaceAll(":", "-").replace(".", "-")
const output = join(root, "work", "d2-function-platform", stamp, `${report.platform.os}-${report.platform.arch}`, "acceptance.json")
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ accepted: report.accepted, output, platform: report.platform,
  dependency: report.dependency, cases: cases.map(({ name, outcome, code, passed }) => ({ name, outcome, code, passed })), cleanup: report.cleanup }, null, 2))
