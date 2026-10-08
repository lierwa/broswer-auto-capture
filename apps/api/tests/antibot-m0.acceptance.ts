import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { loadProbe, probe } from "./antibot-m0/artifact.js"
import { createFixture } from "./antibot-m0/fixture.js"
import { startHost, waitFor, removeClosedProfile, removeClosedProductProfile } from "./antibot-m0/host.js"
import { compare, modes, type Mode, type Sample } from "./antibot-m0/report.js"
import { productHost, productEnvironment } from "./antibot-m0/product.js"

const root = process.cwd()
// WHY：可见对照会占用桌面；后台开发不能静默启动成批窗口，也不能用 headless 冒充同环境人工对照。
const headless = process.argv.includes("--headless-component")
if (!headless && !process.argv.includes("--visible-session")) throw Error("m0_visible_desktop_session_required")
if (headless && process.argv.includes("--visible-session")) throw Error("m0_ambiguous_display_mode")
const modeArgument = process.argv.find(value => value.startsWith("--modes="))?.slice(8)
if (!modeArgument) throw Error("explicit_m0_modes_required")
const selected = modeArgument.split(",") as Mode[]
if (selected.some(mode => !modes.includes(mode))) throw Error("unsupported_m0_mode")
if (headless && (selected.length !== 1 || selected[0] !== "bat-execute")) throw Error("m0_headless_product_component_only")
const parent = path.join(root, "work", "antibot-m0")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "run-"))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const bundle = await loadProbe(root)
const fixture = await createFixture(bundle, directory)
const samples: Sample[] = []
const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
await save("manifest.json", { schemaVersion: 1, createdAt: new Date().toISOString(), probe, modes: selected,
  labProcessId: process.pid,
  commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--short"]), browserUse: "0.13.8", cdpUse: "1.4.5",
  headless, profilePolicy: "fresh", retentionDays: 7, evidenceLimitBytes: 20 * 1024 * 1024,
  registeredRules: ["hasWebdriver", "hasSeleniumProperty", "hasPlaywright", "hasWebdriverIframe", "hasCDP"],
  personalBrowser: false, modelCalls: 0, scope: headless ? "headless Runner component; no daily or manual comparison" : "M0 visible client diagnostics" })
console.log(JSON.stringify({ stage: "started", directory, localOnly: true, modes: selected }))

async function runCase(mode: Mode, round: number) {
  const { item, url } = fixture.add(mode, round)
  const caseDirectory = path.join(directory, item.id)
  await mkdir(caseDirectory)
  const product = mode === "bat-execute" ? productHost(root, caseDirectory, fixture.origin, headless) : null
  const native = product ? null : startHost(root, caseDirectory, mode, url)
  let sample: Sample | undefined
  try {
    const owner = product ? await product.ready(url) : null
    const environment = product && owner ? await productEnvironment(root, caseDirectory, owner.ownerId) : await native!.ready()
    console.log(JSON.stringify({ stage: "ready", mode, round, url }))
    if (product) await product.execute()
    if (mode !== "manual") item.collect = true
    await waitFor(() => item.result !== null, mode === "manual" ? 600000 : 45000)
    const expected = [7, 11, 13][round - 1]
    sample = { id: item.id, mode, round, environment: `${environment.os}/${environment.chromeSha256}/${headless ? "headless" : "visible"}/fresh`,
      finding: item.result!, business: mode === "manual" || product ? item.action?.version === expected && item.action?.trusted ? "passed" : "failed" : "not_run",
      commands: product ? 3 : mode === "bu-observe" ? 1 : 0, modelCalls: 0, cleanup: false,
      documentRequests: item.documentRequests, probeSubmissions: item.submissions }
    samples.push(sample)
    await new Promise(resolve => setTimeout(resolve, 1500))
  } catch (error) {
    // WHY：先保留原始失败，后续清理异常不得覆盖采集/动作的首次失败。
    await save(`${item.id}.failure.json`, { mode, round, reason: error instanceof Error ? error.message : "unknown" })
    throw error
  } finally {
    if (product) {
      const cleanup = await product.close()
      if (sample) sample.cleanup = cleanup.report.status === "confirmed" && cleanup.report.activeResources === false
      if (cleanup.report.status !== "confirmed" || cleanup.report.activeResources !== false) throw Error("m0_product_cleanup_unconfirmed")
      await removeClosedProductProfile(root, caseDirectory, cleanup.report)
    } else {
      const cleanup = await native!.close()
      if (sample) sample.cleanup = cleanup.closed
      await removeClosedProfile(root, caseDirectory)
    }
    await save(`${item.id}.requests.json`, { requests: item.requests, action: item.action, cspViolations: item.violations })
    await save("samples.json", samples)
    await save("report.json", compare(samples))
    console.log(JSON.stringify({ stage: "closed", mode, round, profilePermanentlyDeleted: true }))
  }
}

try {
  for (const mode of selected) for (const round of [1, 2, 3]) await runCase(mode, round)
} catch (error) {
  await save("failure.json", { reason: error instanceof Error ? error.message : "unknown" })
  console.error(error instanceof Error ? error.message : "unknown"); process.exitCode = 1
} finally {
  await fixture.close()
  await save("lab-closed.json", { closed: true, labProcessId: process.pid, at: new Date().toISOString() })
  console.log(JSON.stringify({ stage: "finished", directory, samples: samples.length }))
}
