import { createHash, randomBytes } from "node:crypto"
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { directory, root, hubCommit, pluginCommit, pluginModule, linuxPath, binaries, wsl } from "./paths.ts"
import { configure } from "./settings.ts"

async function exists(file: string) { return access(file).then(() => true, () => false) }
async function artifact(item: { name: string; url: string; sha256: string }) {
  const file = path.join(directory, "upstream", item.name)
  if (!await exists(file)) {
    const response = await fetch(item.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw Error(`download_${response.status}: ${item.name}`)
    await writeFile(file, Buffer.from(await response.arrayBuffer()), { flag: "wx" })
  }
  const digest = createHash("sha256").update(await readFile(file)).digest("hex")
  if (digest !== item.sha256) throw Error(`artifact_digest_mismatch: ${item.name}`)
}
async function extract(archive: string, destination: string) {
  const marker = path.join(destination, ".artifact-ready")
  if (await exists(marker)) return
  await mkdir(destination, { recursive: true })
  const members = archive === "node.tar.xz" ? ["node-v24.9.0-linux-x64/bin/node", "node-v24.9.0-linux-x64/LICENSE"] : []
  wsl(["tar", "-xf", linuxPath(path.join(directory, "upstream", archive)), "-C", linuxPath(destination), ...members], true)
  await writeFile(marker, archive)
}
export async function prepare() {
  await mkdir(path.join(directory, "upstream"), { recursive: true })
  const items = z.array(z.object({ name: z.string(), url: z.url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
    .parse(JSON.parse(await readFile(path.join(root, "tools/antibot-lab/artifacts.json"), "utf8")))
  await Promise.all(items.map(artifact))
  for (const [archive, folder] of [["crowdsec-release.tgz", "crowdsec"], ["traefik.tar.gz", "traefik"], ["node.tar.xz", "node"], ["hub.tar.gz", "hub"], ["bouncer.tar.gz", "bouncer"]]) {
    await extract(archive!, path.join(directory, "runtime", folder!))
  }
  const pluginDestination = path.join(directory, "plugins-local/src", pluginModule)
  if (!await exists(pluginDestination)) await cp(path.join(directory, "runtime/bouncer", `crowdsec-bouncer-traefik-plugin-${pluginCommit}`), pluginDestination, { recursive: true })
  const secretPath = path.join(directory, "secrets.json")
  if (!await exists(secretPath)) await writeFile(secretPath, JSON.stringify({ bouncer: randomBytes(32).toString("hex"), master: randomBytes(32).toString("hex") }), { mode: 0o600, flag: "wx" })
  const secrets = z.object({ bouncer: z.string().length(64), master: z.string().length(64) }).parse(JSON.parse(await readFile(secretPath, "utf8")))
  const base = linuxPath(directory)
  const checkout = linuxPath(root)
  await configure(base, checkout, secrets)
  const bin = binaries(base)
  wsl(["chmod", "+x", ...Object.values(bin)])
  const cli = [bin.cscli, "-c", `${base}/config/config.yaml`, "--branch", hubCommit]
  // WHY：复用 cscli 解析依赖、校验固定 Hub 内容；不复制 collection 安装器。
  wsl([...cli, "collections", "install", "crowdsecurity/appsec-bot-challenge", "crowdsecurity/appsec-generic-rules", "crowdsecurity/appsec-virtual-patching", "crowdsecurity/traefik"])
  wsl([...cli, "parsers", "install", "crowdsecurity/syslog-logs"])
  wsl([...cli, "parsers", "remove", "crowdsecurity/whitelists"])
  // WHY：已缓存 Hub 项目不会由 install 补齐数据集；官方 upgrade 会刷新已安装项目的数据。
  wsl([...cli, "hub", "upgrade"])
  const registered = path.join(directory, ".registered")
  if (!await exists(registered)) {
    wsl([...cli, "machines", "add", "bat-antibot-lab", "--auto", "--url", "http://127.0.0.1:7423", "--file", `${base}/config/lab-local-api.yaml`])
    try { wsl([...cli, "bouncers", "add", "bat-antibot-gateway", "--key", secrets.bouncer], true) }
    catch { throw Error("bouncer_registration_failed") }
    await writeFile(registered, new Date().toISOString())
  }
  wsl([bin.crowdsec, "-c", `${base}/config/config.yaml`, "-t"])
  await writeFile(path.join(directory, "prepared.json"), JSON.stringify({ base, checkout, artifacts: items, at: new Date().toISOString() }, null, 2))
  console.log("Prepared pinned CrowdSec/Hub/Traefik. No Docker or system installation.")
}
