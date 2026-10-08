import { readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { z } from "zod"
import { prepare } from "./prepare.ts"
import { directory, root, linuxPath, binaries, units, wsl } from "./paths.ts"

const command = process.argv[2] ?? "status"
const metadata = z.object({ base: z.string(), checkout: z.string() })
async function prepared() { return metadata.parse(JSON.parse(await readFile(path.join(directory, "prepared.json"), "utf8"))) }
function active(unit: string) {
  try { return wsl(["systemctl", "--user", "is-active", `${unit}.service`], true).trim() === "active" } catch { return false }
}
async function readiness() {
  const { base } = await prepared()
  const response = await fetch("http://127.0.0.1:4188/api/health", { signal: AbortSignal.timeout(2000) })
  const health = z.object({ owner: z.literal("bat-antibot-lab"), base: z.string() }).parse(await response.json())
  if (health.base !== base) throw Error("lab_owner_changed")
  const site = await fetch("http://127.0.0.1:4187", { signal: AbortSignal.timeout(3000) })
  if (!site.ok) throw Error("gateway_not_ready")
  await site.body?.cancel()
  return { ready: true, management: "http://127.0.0.1:4188", site: "http://127.0.0.1:4187" }
}
async function start() {
  const { base, checkout } = await prepared()
  const bin = binaries(base)
  await writeFile(path.join(directory, "logs/access.jsonl"), "", { flag: "a" })
  await writeFile(path.join(directory, "service-owner.json"), JSON.stringify({ root, base, units, createdAt: new Date().toISOString() }, null, 2))
  const commands = [
    [bin.crowdsec, "-c", `${base}/config/config.yaml`],
    [bin.node, `${checkout}/tools/antibot-lab/origin.ts`],
    [bin.traefik, "--configFile", `${base}/traefik.yaml`],
  ]
  for (const [i, unit] of units.entries()) {
    if (active(unit)) {
      const cwd = wsl(["systemctl", "--user", "show", `${unit}.service`, "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("unit_owner_changed")
      continue
    }
    // WHY：进程归属/重启/关闭交给 systemd 用户服务，不另造守护进程管理器。
    wsl(["systemd-run", "--user", "--unit", unit, "--collect", "--property", `WorkingDirectory=${base}`,
      "--property", "Restart=on-failure", "--property", "RestartSec=3", "--property", "KillMode=control-group",
      "--property", "TimeoutStopSec=20", "--property", "MemoryMax=1G", ...commands[i]!])
  }
  if (!active("bat-antibot-presence")) {
    // WHY：WSL 的 systemd 服务自身不保证发行版常驻；一个可审计等待客户端维持其生命周期。
    const child = spawn("wsl", ["-d", "Ubuntu", "--exec", "systemd-run", "--user", "--wait", "--collect",
      "--unit", "bat-antibot-presence", "--property", `WorkingDirectory=${base}`, "/usr/bin/sleep", "infinity"],
    { cwd: root, windowsHide: true, detached: true, stdio: "ignore" })
    child.unref()
  }
  const deadline = Date.now() + 60_000
  while (true) {
    try { console.log(JSON.stringify(await readiness())); break }
    catch (error) { if (Date.now() >= deadline) throw error }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
async function main() {
  if (command === "prepare") {
    if (units.some(active)) throw Error("stop_lab_before_preparing")
    return prepare()
  }
  if (command === "start") return start()
  if (command === "status") {
    console.log(JSON.stringify({ services: Object.fromEntries(units.map(unit => [unit, active(unit)])),
      health: await readiness().catch(() => ({ ready: false })) }))
    return
  }
  if (command === "stop") {
    const { base } = await prepared()
    const owner = z.object({ base: z.string(), units: z.array(z.string()) }).parse(JSON.parse(await readFile(path.join(directory, "service-owner.json"), "utf8")))
    if (base !== linuxPath(directory) || owner.base !== base || JSON.stringify(owner.units) !== JSON.stringify(units)) throw Error("lab_owner_changed")
    for (const unit of [...units].reverse()) {
      if (!active(unit)) continue
      const cwd = wsl(["systemctl", "--user", "show", `${unit}.service`, "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("unit_owner_changed")
      wsl(["systemctl", "--user", "stop", `${unit}.service`])
    }
    if (active("bat-antibot-presence")) {
      const cwd = wsl(["systemctl", "--user", "show", "bat-antibot-presence.service", "--property=WorkingDirectory", "--value"], true).trim()
      if (cwd !== base) throw Error("presence_owner_changed")
      wsl(["systemctl", "--user", "stop", "bat-antibot-presence.service"])
    }
    return
  }
  if (command === "metrics" || command === "alerts") {
    const { base } = await prepared()
    return wsl([binaries(base).cscli, "-c", `${base}/config/config.yaml`, ...(command === "metrics" ? ["metrics", "show", "appsec"] : ["alerts", "list", "-o", "json"])])
  }
  throw Error("usage: lab.ts prepare|start|status|stop|metrics|alerts")
}
await main().catch(error => { console.error(error instanceof Error ? error.message : "lab_failed"); process.exitCode = 1 })
