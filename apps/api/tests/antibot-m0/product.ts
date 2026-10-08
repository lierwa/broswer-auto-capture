import { randomUUID, createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { RunnerProcess } from "../../src/upstream-browser/service.js"
import { hybridExecuteRequestSchema } from "../../src/upstream-browser/hybrid-protocol.js"

const outcome = z.object({ output: z.unknown(), browserCommands: z.number().int(), modelCalls: z.literal(0) })
const rows = z.array(z.object({ version: z.number().int(), available: z.boolean() }))
export function productHost(root: string, directory: string, origin: string, headless = false,
  daily?: { endpoint(ownerId: string): Promise<string | undefined>; reference?: boolean }) {
  const ownerId = randomUUID(), profile = path.join(directory, "profile")
  const controller = new AbortController()
  const diagnostics: unknown[] = []
  const runner = new RunnerProcess(root, controller.signal, line => {
    const event = JSON.parse(line) as { phase?: string }
    // WHY：复用产品已脱敏的固定诊断通道；不保存 stderr、URL、凭据或页面内容。
    if (event.phase === "runtime_command_failure" && diagnostics.length < 40) diagnostics.push(event)
  }, {
    browserMode: daily ? "daily" : headless ? "dedicated-headless" : "dedicated-visible",
    ...(daily ? { resolveExtensionEndpoint: () => daily.endpoint(ownerId) } : {}),
    ...(daily ? { runnerScript: path.join(root, "apps/api/tests/antibot-m0",
      daily.reference ? "reference_runner.py" : "diagnostic_runner.py"),
      runnerEnvironment: { BAT_M0_DIAGNOSTIC_PATH: path.join(directory, "target-diagnostics.json") } } : {}) })
  const events: { command: string; at: string; browserCommands: number; modelCalls: number }[] = []
  async function command(value: unknown) {
    const request = hybridExecuteRequestSchema.parse({ id: randomUUID(), type: "hybrid_execute",
      actionRef: `m0-command-${events.length + 1}`, command: value })
    const result = outcome.parse(await runner.request(request))
    events.push({ command: request.command.name, at: new Date().toISOString(),
      browserCommands: result.browserCommands, modelCalls: result.modelCalls })
    return result
  }
  async function navigate(url: string) {
    await command({ name: "browser.workflow-step", version: 2, actionName: "navigate",
      args: { url, new_tab: false }, target: null, postconditions: [] })
  }
  return { navigate, command, async ready(url: string) {
    await runner.startHybrid({ profilePath: profile, headless, allowedOrigins: [origin],
      managedWindow: { ownerId, resume: false } })
    // WHY：真实执行入口连同内置 observe 都保留，不把这条路径误标为“仅连接”。
    await navigate(url)
    return { ownerId }
  }, async execute() {
    const result = await command({ name: "browser.read-fields", version: 2, specification: {
      container: "button[data-version]", fields: {
        version: { selector: ":scope", attribute: "data-version", valueType: "integer" },
        available: { selector: ":scope", attribute: "data-available", valueType: "boolean" },
      }, maxItems: 10, outputSchema: { type: "array", items: { type: "object",
        properties: { version: { type: "integer" }, available: { type: "boolean" } },
        required: ["version", "available"], additionalProperties: false } },
    } })
    const candidates = rows.parse(result.output).filter(row => row.available)
    const selected = candidates.sort((a, b) => b.version - a.version)[0]
    if (!selected) throw Error("m0_no_published_version")
    await command({ name: "browser.workflow-step", version: 2, actionName: "click", args: {},
      target: { strategy: "css", value: `button[data-version="${selected.version}"]` }, postconditions: [] })
    return selected.version
  }, async close() {
    const report = await runner.close()
    await writeFile(path.join(directory, "runner-events.json"), JSON.stringify({ ownerId, events, diagnostics, report }, null, 2))
    return { report, events }
  } }
}

export async function productEnvironment(root: string, directory: string, ownerId: string) {
  // Existing owner receipt is the source of executable/PID identity; never infer a personal browser.
  const raw = JSON.parse(await readFile(path.join(directory, "managed-window-lease.json"), "utf8")) as Record<string, unknown>
  if (raw.ownerId !== ownerId || typeof raw.browserExe !== "string") throw Error("m0_product_owner_receipt_missing")
  return { chromeSha256: createHash("sha256").update(await readFile(raw.browserExe)).digest("hex"),
    os: execFileSync(path.join(root, "work/upstream-browser-hybrid/.venv/Scripts/python.exe"),
      ["-c", "import platform; print(platform.platform())"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
    profile: z.string().parse(raw.profilePath) }
}
